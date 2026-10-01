// The World: all game rules in one place, with no engine or network code.
// - The multiplayer server runs one World per room and mirrors it to clients.
// - Solo mode runs the exact same World inside the browser.
// So solo and multiplayer can never drift apart.
//
// Phase 2 contents: players (movement + inventory), loot items (spawning, physics,
// grab / pocket / drop / throw, two-person giant items), events for sounds/effects, cleanup.
import { PLAYER, SIM_DT, MAX_PLAYERS, MAX_INPUTS_PER_TICK, PLAYER_COLORS } from "./constants.js";
import { makeMoveState, stepMovement, sanitizeInput, groundHeightAt, type MoveInput, type MoveState } from "./movement.js";
import { stepItem, type ItemBody } from "./itemPhysics.js";
import { LOOT, lootDef, rollValue, carrySpeedMul, type LootDef } from "./loot.js";
import type { ArenaLayout, LootZone } from "./arena.js";
import { buildTrashington } from "./city.js";
import { sanitizeName } from "./names.js";
import { NpcSystem, PUNCH_RANGE, type NpcHost, type BigShotEvent, type OldLadyEvent } from "./npcSim.js";
import { MatchSystem, itemWorth, LOCK_TIME, type MatchPhase, type CityEventKind } from "./match.js";
import { PawnSystem } from "./pawn.js";
import { fortAt, inDeepWater, nearBoxes, inLobby } from "./arena.js";
import { LobbySystem, type LobbyGame, type LobbyEvent } from "./props.js";
import { PropSystem, PROP_RADIUS, SMASHABLE, BREAKABLE, propSurfaceDist, propNearest, type PropEvent } from "./props.js";
import { TrafficSystem, type TrafficEvent } from "./traffic.js";
import { PoliceSystem, type PoliceEvent } from "./police.js";
import type { LockRun } from "./lockpick.js";

/** C4a: how far away a pedestrian notices you breaking something (they also need a clear line of sight) */
export const WITNESS_RANGE = 20;
export const POCKETS = 3;
/** 5A.1: selection slot meaning "empty hands / fists" (pockets are 0..2). Keys 1-3 = pockets, 4 = fists. */
export const FISTS = POCKETS;
/** Giant items: a clumsy two-handed heave (Blake 5A.1): short, heavy, and you stagger afterwards. */
export const HEAVE = { minSpeed: 4, maxSpeed: 7, stagger: 0.5 };
/** Server-side grab reach (a bit generous: the server sees you ~0.1 s in the past). */
export const GRAB_RANGE = 2.9;
/** Client-side reach used for the look prompt. */
export const GRAB_RANGE_CLIENT = 2.4;
export const GIANT_TETHER = 3.2; // tug of war: pulled further apart than this = the item tumbles
/** Phase 5A tug of war over a giant item: each E press moves the balance this much; |balance| 1 = win */
export const TUG_STEP = 0.12;
export const TUG_MAX_TIME = 8;
const TUG_PRESS_CD = 0.06;
const RAID_ALARM_CD = 6;
/** C1: the "raider in your yard" alarm goes off at most this often */
export const RAID_ENTER_CD = 15;
export const THROW_MIN_SPEED = 5;
export const THROW_MAX_SPEED = 16;
export const ITEM_TARGET = 55; // loose items the World tries to keep in the city (200 m city)
export const ITEM_TARGET_NIGHT = 22; // night: loot is scarce (but worth double)
export const ITEM_MAX = 95;
export const GIANT_MAX = 2;
/** Slice 2A: shop shelves are stocked on top of the loose-loot cap (15 shops) */
export const SHELF_MAX = 110;
/** Slice 2A: chance each shelf spot is stocked at the start of a scavenge */
export const STOCK_FILL = 0.4;
const ACTION_COOLDOWN = 0.18; // seconds between grab/drop/throw (anti-spam)
export const PUNCH_COOLDOWN = 0.55;
export const PVP_PUNCH_COOLDOWN = 2.0; // after knocking a PLAYER down (anti-grief)
export const KNOCK_TIMES = [1.5, 1.0, 0.6]; // repeat knockdowns within 12 s get shorter (anti-grief)
export const KNOCK_IMMUNITY = 3; // seconds of immunity after getting up
export const NPC_COUNT = 20;
/**
 * 5A.1 health (Blake): 100 HP. A player punch does 34 (3 = knockdown), a fighting pedestrian's hit 25.
 * 0 HP = knocked down (drop everything); you get up at full health with 3 s of immunity (as before).
 * Health comes back at 10/s after 5 s without being hurt. A punch that doesn't knock you down still
 * knocks what's in your hands loose. Thrown items do 5-30 by weight x speed and can never knock you out.
 * Cars (wipeout) and the garbage truck still flatten you outright; a taser stuns without damage.
 */
export const HEALTH = { max: 100, punch: 34, npcHit: 25, regenDelay: 5, regenRate: 10, throwMin: 5, throwMax: 30 }; // Blake: 15-20 (was 35); top of the range now the city is bigger

export type ItemMode = "free" | "held" | "pocket";

export interface ItemSim {
  id: string;
  type: string;
  value: number;
  body: ItemBody;
  mode: ItemMode;
  holder: string;
  holder2: string; // second carrier of a giant item
  lastThrower: string;
  thrownT: number; // time since thrown (for bonks)
  idleT: number; // seconds resting untouched (cleanup)
  // Phase 3 banking
  fort: number; // fort yard it's resting in (-1 = none)
  bankT: number; // seconds resting in that yard
  locked: boolean; // banked: can't be picked up by players any more (raccoons can still steal it)
  mult: number; // happy-hour bonus (1 or 2)
  chute: boolean; // airdrop crate still under its parachute
  shop: number; // shop stock / register (-1 = not from a shop)
  /** Phase 5A tug of war (giant items): -1 = holder wins .. +1 = challenger (holder2) wins */
  tug: number;
  tugT: number;
  /** C4b: uses left (a spray can holds 5 tags) */
  uses?: number;
}

/** C4b: a spray-painted tag on a wall (gone at dawn) */
export interface TagSim { id: string; x: number; y: number; z: number; nx: number; nz: number; colorIdx: number; by: string; style: number; }
/** C4b: tagging: hold the use key this long on a blank wall, how far you can reach, spacing between tags */
/**
 * C5c.1 citizen's arrest (Blake): knock a wanted bandit (1+ star) down, then E to pin them for the cops. Hold your
 * ground (moving over 1.2 m, getting knocked down or 60 s ends it); they mash SPACE to wriggle free (14 presses).
 * When a cop cuffs them you get the bounty: their heat x $5, out of what they were carrying, then their cash.
 */
export const ARREST = { reach: 1.9, minHeat: 30, perHeat: 5, maxTime: 60, breakFree: 14, moveCancel: 1.2, struggleCd: 0.07 };
/** C5c: tagging the Mayor's statue */
export const MAYOR_TAG = { aura: 5, heat: 15 };
export const TAG = { hold: 1.5, reach: 2.6, spacing: 1.6, uses: 5, heat: 2 };

export interface PlayerSim {
  id: string;
  name: string;
  colorIdx: number;
  connected: boolean;
  move: MoveState;
  lastSeq: number;
  queue: MoveInput[];
  credit: number;
  hand: string;
  pockets: string[];
  sel: number;
  actionCd: number;
  /** one action pressed during the short cooldown: runs as soon as the cooldown ends (no lost key presses) */
  queued: WorldAction | null;
  punchCd: number;
  /** heat 0..100 (wanted stars at 30 / 60 / 90) */
  notoriety: number;
  /** 5A.1 health 0..100 (0 while knocked down), world time you were last hurt */
  hp: number;
  hurtT: number;
  knockCount: number; // recent knockdowns (for diminishing returns)
  knockWindowT: number;
  /** Phase 3: money from previous rounds this match */
  cash: number;
  stolenThisRound: number;
  /** Phase 3.5: hold-up in progress at a till */
  rob: { prop: string; t: number; x: number; z: number; quiet?: boolean } | null;
  /** C4b: aura points (tags sprayed this match; the race for Mayor uses them later) */
  aura: number;
  /** C5a: lobby mini-game bests (throw game: points; trolley race: seconds, 0 = none yet) and the game you're playing */
  throwBest: number;
  raceBest: number;
  lobbyGame: LobbyGame | null;
  /** C4b: a tag being sprayed: when it started, where you stood */
  tagging: { t0: number; x: number; z: number; pending?: { x: number; y: number; z: number; nx: number; nz: number } } | null;
  /** Phase 3.5: seconds until you respawn at your fort after a car wiped you out (0 = alive) */
  respawnT: number;
  /** Phase 4: seconds left in jail (0 = free), which cell, the lock you're picking */
  jailT: number;
  jailCell: number;
  lock: LockRun | null;
  lockSeed: number;
  lockT0: number; // world time you were locked up (lock clock starts here)
  /** world time a cop last had eyes on you (heat only cools while nobody sees you) */
  seenT: number;
  /** where the police think you are: your last crime or last sighting (dispatched cops go here) */
  knownX: number; knownZ: number;
  /** world time of your last crime (heat doesn't cool for a few seconds after one) */
  crimeT: number;
  /** Phase 5A: last tug-of-war press, last raid alarm on YOUR fort */
  tugCd: number;
  raidAlarmT: number;
  /** C1: which fort yard this player is standing in (-1 = none), and the last "raider in your yard" alarm on YOUR fort */
  inFort: number; raidEnterT: number;
  /** C5c.1: a bandit you're holding down for the cops (and how hard they've wriggled) */
  pin: { target: string; x: number; z: number; t: number; heat: number; struggle: number; cd: number } | null;
}

export type WorldEvent =
  | { t: "grab"; p: string; item: string; to: "hand" | "pocket" | "carry" }
  | { t: "whiff"; p: string; reason: "taken" | "far" | "full" | "hands" | "cooldown" | "locked" }
  | { t: "drop"; p: string; item: string }
  | { t: "throw"; p: string; item: string; speed: number }
  | { t: "impact"; item: string; speed: number; x: number; y: number; z: number }
  | { t: "bonk"; item: string; p: string; by: string }
  // C4b: a tag sprayed (tagStart: the hiss starts)
  | { t: "tag"; p: string; tag: string; left: number }
  | { t: "tagStart"; p: string }
  // C5c.1: citizen's arrest: someone pinned a wanted bandit / it ended / the cops cuffed them and the bounty was paid
  | { t: "pin"; p: string; target: string; heat: number }
  | { t: "pinFail"; p: string; reason: string }
  | { t: "pinEnd"; p: string; target: string; why: string }
  | { t: "bounty"; p: string; target: string; value: number; want: number }
  // C4a: a loud noise (for sounds / debugging); r = how far it carries
  | { t: "noise"; p: string; x: number; z: number; r: number }
  | { t: "tumble"; item: string }
  | { t: "spawn"; item: string }
  | { t: "punch"; p: string; hit: "none" | "npc" | "player" | "blocked" | "prop"; target: string }
  | { t: "knockdown"; p: string; by: string; time: number }
  | { t: "hurt"; p: string; by: string; dmg: number; hp: number }
  | { t: "npcHit"; npc: string; by: string; how: "punch" | "throw" }
  | { t: "npcSay"; npc: string; line: string }
  | { t: "npcAttack"; npc: string; p: string; hit: boolean }
  | { t: "npcDodge"; npc: string; p: string }
  | { t: "npcKo"; npc: string; by: string }
  | { t: "panic"; npc: string }
  | { t: "flash"; p: string }
  | { t: "trap"; p: string }
  | { t: "swarm"; p: string }
  // Phase 3
  | { t: "round"; phase: MatchPhase | "hurry"; round: number }
  | { t: "banked"; item: string; p: string; value: number }
  | { t: "lost"; p: string; count: number; value: number; unsold?: boolean }
  // Phase 5A
  | { t: "cash"; p: string; item: string; type: string; value: number }
  | { t: "raid"; p: string; owner: string; item: string; x: number; z: number }
  /** C1: a rival walked into your fort's compound at night (the loud alert; "raid" follows when they take something) */
  | { t: "raidEnter"; p: string; owner: string; slot: number; x: number; z: number }
  /** C1.1: fell in the canal, lost your grip on what you were carrying */
  | { t: "splash"; p: string; item: string; x: number; z: number }
  | { t: "tug"; item: string; stage: "start" | "win" | "tumble"; winner: string; loser: string }
  | { t: "pawn"; p: string; item: string; r: "up" | "offended" | "sold"; offer: number }
  | { t: "cityEvent"; kind: CityEventKind; stage: "warn" | "live" | "end"; x: number; z: number; detail: string }
  | { t: "swept"; item: string; type: string; x: number; z: number }
  | { t: "firecracker"; x: number; z: number } // (C5b: the dragon parade)
  | { t: "raccoonGrab"; npc: string; item: string; p: string }
  | { t: "raccoonEscaped"; npc: string; item: string; type: string; p: string; value: number }
  | PropEvent
  | TrafficEvent
  | PoliceEvent
  | BigShotEvent
  | OldLadyEvent
  | LobbyEvent;

export type WorldAction =
  | { a: "grab"; item: string }
  // C4b: spray a tag (hold the use key on a blank wall with a can out)
  | { a: "tagStart" }
  | { a: "tag"; x: number; y: number; z: number; nx: number; nz: number }
  | { a: "drop" }
  | { a: "throw"; charge: number; yaw: number; pitch: number }
  | { a: "cycle"; dir?: number } // mouse wheel: next / previous carried item (or fists)
  | { a: "select"; slot: number } // keys 1-3 pockets, 4 fists
  | { a: "punch"; yaw: number; pitch: number }
  | { a: "use"; prop: string } // search a dumpster / bin (E), or start a hold-up at a till (hold R)
  | { a: "robStop" }
  | { a: "pick"; pin: number; t: number } // jail lock-pick press (t = seconds since locked up)
  // Phase 5A
  | { a: "tug" } // mash E in a tug of war
  | { a: "arrest"; p: string } | { a: "struggle" } // C5c.1: pin a knocked-down wanted bandit for the cops / wriggle free
  | { a: "sell"; item: string } | { a: "haggle"; item: string } | { a: "sellAll" } // pawn shop
  | { a: "ready" }; // done shopping / upgrading

/** Small, fast, seedable random numbers (deterministic worlds for tests). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rarity boost per spawn zone: the plaza, rooftops and shops are high-risk, high-reward. */
const ZONE_RARE_BOOST: Record<LootZone, number> = { plaza: 3, rooftop: 2.2, shop: 2, yard: 1, alley: 1, street: 0.7, room: 1.6 };

export interface WorldOptions { seed?: number; arena?: ArenaLayout; spawnLoot?: boolean; npcs?: number;
  /** C5a: players who join before the match arrive at the squat (the lobby roof). The game turns this on;
   *  rule tests leave it off so players start at their forts as before. */
  lobby?: boolean; }

export class World {
  readonly arena: ArenaLayout;
  readonly players = new Map<string, PlayerSim>();
  readonly items = new Map<string, ItemSim>();
  time = 0;
  private events: WorldEvent[] = [];
  private rng: () => number;
  private nextItem = 1;
  private spawnTimer = 0;
  private recycleTimer = 0;
  private spawnLoot: boolean;
  private lobbySpawn: boolean;
  /** C5a: is the lobby squat in use (players arrive there, it restocks)? */
  get lobbyOn() { return this.lobbySpawn && !!this.arena.lobby; }
  readonly npc: NpcSystem;
  readonly match: MatchSystem;
  readonly props: PropSystem;
  /** C4b: spray-painted tags on the walls (reset at dawn) */
  readonly tags = new Map<string, TagSim>();
  private nextTag = 1;
  readonly traffic: TrafficSystem;
  readonly police: PoliceSystem;
  readonly pawn: PawnSystem;
  readonly lobby: LobbySystem;

  constructor(opts: WorldOptions = {}) {
    this.arena = opts.arena ?? buildTrashington();
    this.rng = makeRng(opts.seed ?? 12345);
    this.spawnLoot = opts.spawnLoot ?? true;
    this.lobbySpawn = opts.lobby ?? false;
    if (this.spawnLoot) this.fillLoot(true);
    this.npc = new NpcSystem(this.npcHost(), opts.npcs ?? (opts.arena ? 0 : NPC_COUNT));
    this.match = new MatchSystem(this);
    this.props = new PropSystem(this);
    this.traffic = new TrafficSystem(this, undefined, opts.seed ?? 12345);
    this.police = new PoliceSystem(this);
    this.pawn = new PawnSystem(this);
    this.lobby = new LobbySystem(this);
    if (this.spawnLoot) { this.props.reset(); this.stockShops(true); }
  }

  /** Raise a player's heat (notoriety), capped at 100. Cops who see it happen come running. */
  addHeat(p: PlayerSim, n: number) {
    if (p.jailT > 0) return;
    if (n > 0 && this.lobby?.on(p)) return; // (C5a: the lobby squat: practice, nothing counts)
    if (n > 0 && this.match.night) n *= 2; // night: heat builds twice as fast
    p.notoriety = Math.min(100, p.notoriety + n);
    if (n > 0) { p.knownX = p.move.x; p.knownZ = p.move.z; p.crimeT = this.time; this.police.onCrime(p); } // somebody calls it in
  }

  /**
   * C4a: a loud noise at (x, z) made by player p, heard r metres away: cops who hear it come and look,
   * pedestrians nearby flinch. (C4b: it will also wake the old lady.)
   */
  noise(p: PlayerSim, x: number, z: number, r: number) {
    if (this.lobby.on(p)) return; // (C5a: nobody down there hears the squat)
    this.police.hear(p, x, z, r);
    this.npc.startle(x, z, r * 0.6);
    this.npc.wakeOldLady(p.id, x, z, r); // (C4b: the old lady above the laundromat)
    this.emit({ t: "noise", p: p.id, x, z, r });
  }

  /** C4a: can anybody see this player right now (a cop, a pedestrian, a cashier)? Used for "heat only if seen". */
  witnessed(p: PlayerSim): boolean {
    const m = p.move;
    for (const n of this.npc.npcs.values()) {
      if (n.state === "ko" || n.state === "sleep" || n.kind === "raccoon") continue;
      const d = Math.hypot(n.move.x - m.x, n.move.z - m.z);
      if (d > WITNESS_RANGE || Math.abs(n.move.y - m.y) > 6) continue;
      if (n.kind === "cop" ? this.police.canSee(n, p) : this.police.los(n.move.x, n.move.y + 1.6, n.move.z, m.x, m.y + 1.2, m.z)) return true;
    }
    return false;
  }

  /** Teleport a player (jail, release). Keeps what they carry; clears queued inputs. */
  movePlayer(p: PlayerSim, x: number, z: number, yaw: number) {
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(x, z, yaw), ...keep };
    p.move.y = groundHeightAt(x, z, this.arena.boxes, 1); // stand ON floors / curbs, never inside them
    p.queue.length = 0;
  }

  /** Busted: everything carried is taken away for good. Returns how much. */
  confiscateAll(p: PlayerSim): { count: number; value: number } {
    let count = 0, value = 0, guard = 0;
    while (this.anyItem(p) && guard++ < 10) {
      const a = this.anyItem(p)!;
      const it = a.item;
      if (lootDef(it.type).size === "giant" && it.holder2) { this.letGoOfGiant(it, p); continue; } // your partner keeps dragging it
      this.release(p, a.from);
      count++; value += itemWorth(it);
      this.items.delete(it.id);
    }
    p.hand = ""; p.pockets.fill("");
    this.updateCarry(p);
    return { count, value };
  }

  /**
   * Fill shop shelves at the start of a scavenge. Slice 2A: 15 shops, so each shelf spot is stocked
   * with a STOCK_FILL chance (shops look lived-in, and the city's loot value stays sensible).
   * full=false: one random empty spot per shop (debug / tests).
   */
  stockShops(full: boolean) {
    const spots = (this.arena.lootSpawns ?? []).filter((s) => s.pool && s.shop !== undefined);
    const empty = spots.filter((sp) => ![...this.items.values()].some((it) => it.mode === "free" && Math.hypot(it.body.x - sp.x, it.body.z - sp.z) < 0.6 && Math.abs(it.body.y - sp.y) < 1));
    const pick = full ? empty.filter(() => this.rng() < STOCK_FILL) : (this.arena.shops ?? []).map((sh) => { const e = empty.filter((x) => x.shop === sh.id); return e[Math.floor(this.rng() * e.length)]; }).filter(Boolean);
    for (const sp of pick) {
      if (this.items.size >= ITEM_MAX + SHELF_MAX) break;
      const type = sp.pool![Math.floor(this.rng() * sp.pool!.length)];
      const id = this.placeItem(type, sp.x, sp.y, sp.z);
      const it = this.items.get(id)!;
      it.shop = sp.shop!;
      it.body.rot = this.rng() * Math.PI * 2;
    }
  }

  /** Shared random numbers (deterministic per seed). */
  random() { return this.rng(); }

  /** Host pressed START (or solo). */
  startMatch() { return this.match.start(); }

  /** Loot multiplier for anything that appears now (night = x2). */
  get lootMult() { return this.match?.night ? 2 : 1; }
  private get itemTarget() { return this.match?.night ? ITEM_TARGET_NIGHT : ITEM_TARGET; }

  /**
   * New scavenge: fresh loot + props, cops gone, everyone back at their fort with empty hands.
   * keepForts: loot lying in fort yards stays (day -> night); otherwise the whole city is wiped.
   */
  resetCity(keepForts = false) {
    this.npc.clearRaccoons();
    this.npc.resetCashiers();
    this.npc.resetBigShots(this.match.night);
    this.police.reset();
    for (const it of [...this.items.values()]) {
      const slot = it.mode === "free" ? fortAt(this.arena, it.body.x, it.body.z) : -1;
      if (keepForts && slot >= 0 && this.match.ownerOf(slot)) { it.fort = slot; it.locked = true; it.bankT = LOCK_TIME; continue; }
      this.items.delete(it.id);
    }
    if (!keepForts) this.tags.clear(); // (C4b: the city gets scrubbed clean at dawn)
    if (this.spawnLoot) { this.fillLoot(!keepForts); this.props.reset(!keepForts); this.stockShops(true); } // (C4a: repairs at dawn only; C5c: the bank's vault refills at dawn)
    else this.props.reset(!keepForts);
    for (const p of this.players.values()) {
      p.hand = ""; p.pockets.fill(""); p.queued = null;
      const sp = this.arena.spawns[p.colorIdx % this.arena.spawns.length];
      const keepSeq = p.lastSeq;
      p.move = makeMoveState(sp.x, sp.z, sp.yaw);
      p.lastSeq = keepSeq;
      p.queue.length = 0;
      p.notoriety = 0; p.hp = HEALTH.max; p.knockCount = 0; p.stolenThisRound = 0; p.rob = null; p.respawnT = 0; p.pin = null;
      this.updateCarry(p);
    }
  }

  /** Everything a player is carrying (hands + pockets). */
  carriedItems(p: PlayerSim): ItemSim[] {
    const out: ItemSim[] = [];
    for (const id of [p.hand, ...p.pockets]) { const it = id ? this.items.get(id) : undefined; if (it && !out.includes(it)) out.push(it); }
    return out.filter((it) => it.holder === p.id || it.holder2 === p.id);
  }

  /** Time's up while standing at home: what you carry lands in your yard, banked. */
  putInYard(p: PlayerSim, it: ItemSim) {
    if (it.holder2 && it.holder2 !== p.id) { const o = this.players.get(it.holder2); if (o) { o.hand = ""; this.updateCarry(o); } }
    else if (it.holder2 === p.id) { const o = this.players.get(it.holder); if (o) { o.hand = ""; this.updateCarry(o); } }
    const a = this.rng() * Math.PI * 2, r = this.rng() * 0.8;
    this.freeItem(it, p.move.x + Math.sin(a) * r, p.move.y + 0.6, p.move.z + Math.cos(a) * r, 0, 0, 0);
    it.holder = ""; it.holder2 = ""; it.tug = 0; it.tugT = 0;
    it.fort = p.colorIdx; it.locked = true; it.bankT = LOCK_TIME;
  }

  /** Taser hit / a punch: drop whatever is in your hands (other pockets stay). */
  dropHand(p: PlayerSim) {
    const a = this.activeItem(p); // what you hold, or the pocket item you have out
    if (!a) return;
    const it = a.item;
    if (lootDef(it.type).size === "giant" && it.holder2) { this.letGoOfGiant(it, p); return; }
    this.release(p, a.from);
    const ang = this.rng() * Math.PI * 2;
    this.freeItem(it, p.move.x + Math.sin(ang) * 0.5, p.move.y + 1, p.move.z + Math.cos(ang) * 0.5, Math.sin(ang) * 2, 3, Math.cos(ang) * 2);
    it.holder = ""; it.holder2 = "";
    this.emit({ t: "drop", p: p.id, item: it.id });
  }

  refreshCarry(p: PlayerSim) { this.updateCarry(p); }
  /** Drop everything a player carries (knockdowns, wipeouts). */
  dropAll(p: PlayerSim) { this.dropEverything(p); }

  /** Spawn a random ground item near a point (happy hour bonus). */
  spawnAt(x: number, z: number): string {
    if (this.items.size >= ITEM_MAX) return "";
    const def = this.pickType("plaza", true, false);
    const id = this.placeItem(def.type, x, 0.4, z);
    this.emit({ t: "spawn", item: id });
    return id;
  }

  /** The bridge the pedestrian AI uses to affect the world. */
  private npcHost(): NpcHost {
    const w = this;
    return {
      arena: this.arena,
      rng: () => this.rng(),
      playersForNpcs: () => [...w.players.values()].map((p) => ({
        id: p.id, x: p.move.x, y: p.move.y, z: p.move.z, yaw: p.move.yaw, connected: p.connected && p.jailT <= 0,
        knocked: p.move.knockT > 0, immune: p.move.immuneT > 0,
      })),
      npcHitPlayer: (npcId, pid) => {
        const p = w.players.get(pid);
        if (!p || p.move.knockT > 0 || p.move.immuneT > 0) return;
        const n = w.npc.npcs.get(npcId);
        if (n) { const dx = p.move.x - n.move.x, dz = p.move.z - n.move.z, l = Math.max(0.01, Math.hypot(dx, dz)); p.move.vx += (dx / l) * 3.5; p.move.vz += (dz / l) * 3.5; }
        if (w.hurt(p, HEALTH.npcHit, npcId, { dropHand: true })) w.npc.gloat(npcId);
      },
      npcDropLoot: (_npcId, type, x, y, z, ax, az) => { w.popLoot(type, x, y, z, ax, az); },
      shopAlarm: (shopId) => { const t = [...w.props.props.values()].find((x) => x.def.kind === "till" && x.def.shop === shopId); if (t) { t.alarmT = 6; w.emit({ t: "alarm", kind: "shop", prop: t.def.id, x: t.def.x, z: t.def.z }); } },
      npcEvent: (e) => w.emit(e),
      addNotoriety: (pid, n) => { const p = w.players.get(pid); if (p) w.addHeat(p, n); },
      copBrain: (n, dt) => w.police.brain(n, dt),
      cars: () => [...(w.traffic?.cars ?? []), ...(w.police?.cars ?? [])],
      applyToPlayer: (pid, effect) => {
        const p = w.players.get(pid);
        if (!p) return;
        if (effect === "trap") { p.move.trapT = 1.6; w.emit({ t: "trap", p: pid }); }
        if (effect === "swarm") { p.move.swarmT = 5; w.emit({ t: "swarm", p: pid }); }
        if (effect === "flash") w.emit({ t: "flash", p: pid });
      },
      raccoonTarget: (slot) => {
        // the most valuable thing lying in that fort yard (locked or not: raccoons don't care)
        let best: ItemSim | null = null;
        for (const it of w.items.values()) {
          if (it.mode !== "free" || lootDef(it.type).size === "giant" || it.fort !== slot) continue;
          if (!best || itemWorth(it) > itemWorth(best)) best = it;
        }
        return best ? { id: best.id, x: best.body.x, z: best.body.z } : null;
      },
      raccoonGrab: (npcId, itemId) => {
        const it = w.items.get(itemId);
        if (!it || it.mode !== "free") return false;
        it.mode = "held"; it.holder = npcId; it.holder2 = "";
        it.locked = false; it.bankT = 0;
        const owner = w.match.ownerOf(it.fort);
        it.fort = -1;
        w.emit({ t: "raccoonGrab", npc: npcId, item: itemId, p: owner?.id ?? "" });
        return true;
      },
      npcDropCarried: (itemId, x, y, z, ax, az) => {
        const it = w.items.get(itemId);
        if (!it) return;
        const l = Math.max(0.01, Math.hypot(ax, az));
        it.holder = ""; it.holder2 = "";
        w.freeItem(it, x, y, z, (ax / l) * 1.5, 3.5, (az / l) * 1.5);
      },
      raccoonGone: (npcId, itemId, slot) => {
        const it = itemId ? w.items.get(itemId) : undefined;
        if (!it) return;
        const owner = w.match.ownerOf(slot);
        if (owner) owner.stolenThisRound++;
        w.items.delete(itemId);
        w.emit({ t: "raccoonEscaped", npc: npcId, item: itemId, type: it.type, p: owner?.id ?? "", value: itemWorth(it) });
      },
    };
  }

  /** Loot popping out of something (a pedestrian, a dumpster, a smashed phone booth...): flies up and away. */
  popLoot(type: string, x: number, y: number, z: number, ax: number, az: number): string {
    const def = lootDef(type);
    const id = "i" + this.nextItem++;
    const l = Math.max(0.01, Math.hypot(ax, az));
    this.items.set(id, {
      id, type, value: rollValue(def, this.rng),
      body: { x, y, z, vx: (ax / l) * 2 + (this.rng() - 0.5), vy: 4.5, vz: (az / l) * 2 + (this.rng() - 0.5), rot: 0, spin: 6, resting: false },
      mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
      fort: -1, bankT: 0, locked: false, mult: this.lootMult, chute: false, shop: -1, tug: 0, tugT: 0,
    });
    this.emit({ t: "spawn", item: id });
    return id;
  }

  /** Knock a player down: they drop everything. Repeat knockdowns get shorter; immunity afterwards. */
  knockdown(p: PlayerSim, by: string) {
    if (p.move.knockT > 0 || p.move.immuneT > 0) return;
    const time = KNOCK_TIMES[Math.min(p.knockCount, KNOCK_TIMES.length - 1)];
    p.knockCount += 1;
    p.knockWindowT = 12;
    this.dropEverything(p);
    p.move.knockT = time;
    p.move.immuneT = time + KNOCK_IMMUNITY;
    p.hp = 0; p.hurtT = this.time;
    p.move.mantleT = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    this.emit({ t: "knockdown", p: p.id, by, time });
  }

  /**
   * Damage a player. Returns true if it knocked them down. Nothing happens while they're down,
   * immune (just got up), jailed or respawning. `canKO: false` (thrown items) stops at 1 HP.
   * `dropHand`: a hit that doesn't knock you down still knocks what's in your hands loose.
   */
  hurt(p: PlayerSim, dmg: number, by: string, opts: { canKO?: boolean; dropHand?: boolean } = {}): boolean {
    if (p.jailT > 0 || p.respawnT > 0 || p.move.knockT > 0 || p.move.immuneT > 0 || dmg <= 0 || p.hp <= 0) return false;
    p.hp = Math.max(opts.canKO === false ? 1 : 0, p.hp - dmg);
    p.hurtT = this.time;
    this.emit({ t: "hurt", p: p.id, by, dmg, hp: Math.ceil(p.hp) });
    if (p.hp <= 0) { this.knockdown(p, by); return true; }
    if (opts.dropHand) this.dropHand(p);
    return false;
  }

  // ------------------------------------------------------------------ players
  addPlayer(id: string, rawName: unknown): PlayerSim {
    const used = new Set([...this.players.values()].map((p) => p.colorIdx));
    let colorIdx = 0;
    while (used.has(colorIdx) && colorIdx < PLAYER_COLORS.length - 1) colorIdx++;
    // C5a: before the match (the lobby) you arrive at the rooftop squat; once it's on, at your fort
    const lob = this.lobbySpawn && this.arena.lobby && this.match?.phase === "lobby" ? this.arena.lobby.spawns : null;
    const sp = lob ? lob[this.players.size % lob.length] : this.arena.spawns[colorIdx % this.arena.spawns.length];
    const p: PlayerSim = {
      id, name: sanitizeName(rawName), colorIdx, connected: true,
      move: makeMoveState(sp.x, sp.z, sp.yaw), lastSeq: -1, queue: [], credit: 0,
      hand: "", pockets: Array(POCKETS).fill(""), sel: FISTS, actionCd: 0, queued: null,
      punchCd: 0, notoriety: 0, hp: HEALTH.max, hurtT: -99, knockCount: 0, knockWindowT: 0,
      cash: 0, stolenThisRound: 0, rob: null, respawnT: 0, aura: 0, tagging: null, throwBest: 0, raceBest: 0, lobbyGame: null,
      jailT: 0, jailCell: -1, lock: null, lockSeed: 0, lockT0: 0, seenT: -99, knownX: 0, knownZ: 0, crimeT: -99,
      tugCd: 0, raidAlarmT: -99, inFort: -1, raidEnterT: -99, pin: null,
    };
    if (lob) p.move.y = this.arena.lobby!.y;
    this.players.set(id, p);
    return p;
  }

  get playerCount() { return this.players.size; }
  get full() { return this.players.size >= MAX_PLAYERS; }

  /** Lost connection: drop everything (so it's stealable) and freeze in place. */
  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      this.dropEverything(p);
      p.queue.length = 0;
      p.move.vx = 0; p.move.vz = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    }
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropEverything(p);
    this.players.delete(id);
  }

  pushInputs(id: string, batch: unknown) {
    const p = this.players.get(id);
    if (!p || !p.connected || !Array.isArray(batch)) return;
    for (const raw of batch.slice(0, 16)) {
      const inp = sanitizeInput(raw as Partial<MoveInput>);
      if (!inp) continue;
      const lastQueued = p.queue.length ? p.queue[p.queue.length - 1].seq : p.lastSeq;
      if (inp.seq <= lastQueued) continue; // duplicate or out of order
      p.queue.push(inp);
    }
    if (p.queue.length > 60) p.queue.splice(0, p.queue.length - 60);
  }

  // ------------------------------------------------------------------ actions
  action(id: string, raw: unknown) {
    const p = this.players.get(id);
    if (!p || !p.connected || !raw || typeof raw !== "object") return;
    const act = raw as WorldAction;
    // shop round (a screen: works whatever state you're in)
    if (act.a === "sell") { if (this.match.phase === "shop") this.pawn.sell(p, String((act as any).item ?? "")); return; }
    if (act.a === "haggle") { if (this.match.phase === "shop") this.pawn.haggle(p, String((act as any).item ?? "")); return; }
    if (act.a === "sellAll") { if (this.match.phase === "shop") this.pawn.sellAll(p); return; }
    if (act.a === "ready") { this.match.setReady(p); return; }
    if (p.jailT > 0) { // locked up: the only thing you can do is pick the lock
      if (act.a === "pick") this.police.pick(p, Number((act as any).pin), Number((act as any).t));
      return;
    }
    if (act.a === "struggle") { this.struggle(p); return; } // (C5c.1: pinned down: wriggle)
    if (p.move.knockT > 0 || p.move.trapT > 0) return; // can't do anything while flattened / boxed in
    if (p.respawnT > 0) return; // wiped out: waiting to respawn
    if (p.move.stunT > 0) return; // tased
    if (act.a === "tug") { this.tugPress(p); return; }
    if (act.a === "arrest") { this.arrest(p, String((act as any).p ?? "")); return; }
    if (act.a === "punch") { this.punch(p, Number((act as any).yaw), Number((act as any).pitch)); return; }
    if (act.a === "tagStart") { this.tagStart(p); return; }
    if (act.a === "tag") { const a = act as any; this.tag(p, Number(a.x), Number(a.y), Number(a.z), Number(a.nx), Number(a.nz)); return; }
    if (act.a === "robStop") { this.props.cancelRob(p); return; }
    if (act.a === "use") { this.props.use(p, String((act as any).prop ?? "")); return; }
    if (act.a === "cycle") { this.cycleSel(p, Number((act as any).dir) < 0 ? -1 : 1); return; }
    if (act.a === "select") { this.selectSlot(p, Number((act as any).slot)); return; }
    if (p.actionCd > 0) {
      // Pressed a moment too early (e.g. G right after E): remember it and do it when allowed.
      if (!p.queued) p.queued = act; else this.emit({ t: "whiff", p: id, reason: "cooldown" });
      return;
    }
    switch (act.a) {
      case "grab": this.grab(p, String((act as any).item ?? "")); break;
      case "drop": this.drop(p); break;
      case "throw": this.throwItem(p, Number((act as any).charge), Number((act as any).yaw), Number((act as any).pitch)); break;
    }
  }

  private eye(p: PlayerSim) {
    const m = p.move;
    return { x: m.x, y: m.y + (m.crouching || m.slideT > 0 ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight), z: m.z };
  }

  /** Punch whoever is in front of you (pedestrian or player). Only with empty hands. */
  private punch(p: PlayerSim, yaw: number, pitch: number) {
    if (p.punchCd > 0 || this.activeItem(p)) return; // (something in your hands: a click throws it instead)
    p.punchCd = PUNCH_COOLDOWN;
    const aim = Number.isFinite(yaw) ? yaw : p.move.yaw;
    void pitch;
    const m = p.move;
    let best: { kind: "npc" | "player" | "prop"; id: string; score: number } | null = null;
    const consider = (kind: "npc" | "player" | "prop", id: string, x: number, y: number, z: number, surface = 0) => {
      const dx = x - m.x, dz = z - m.z;
      const d = Math.max(0.3, Math.hypot(dx, dz) - surface);
      if (d > PUNCH_RANGE + 0.3 || Math.abs(y - m.y) > 1.3) return;
      let ang = Math.atan2(dx, dz) - aim;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > 0.9 && d > 0.6) return;
      const score = d + Math.abs(ang) * 1.5;
      if (!best || score < best.score) best = { kind, id, score };
    };
    for (const n of this.npc.npcs.values()) if (n.state !== "ko" && n.state !== "sleep" && n.state !== "yell") consider("npc", n.id, n.move.x, n.move.y, n.move.z);
    for (const o of this.players.values()) if (o.id !== p.id && o.connected && o.jailT <= 0 && o.move.knockT <= 0) consider("player", o.id, o.move.x, o.move.y, o.move.z);
    // smashable props (phone booths, vending machines, meters, newspaper boxes, parked cars)
    for (const ps of this.props.props.values()) {
      const d = ps.def;
      if (!SMASHABLE.has(d.kind) || propSurfaceDist(d, m.x, m.z) > 3) continue;
      if (BREAKABLE.has(d.kind)) { if (!ps.ready) continue; const n = propNearest(d, m.x, m.z); consider("prop", d.id, n.x, m.y, n.z, 0); continue; } // (C4a: the nearest bit of a bench / shop window)
      consider("prop", d.id, d.x, m.y, d.z, PROP_RADIUS[d.kind]);
    }
    const b = best as { kind: "npc" | "player" | "prop"; id: string; score: number } | null;
    if (!b) return this.emit({ t: "punch", p: p.id, hit: "none", target: "" });
    if (b.kind === "prop") {
      this.props.smash(p, b.id);
      return this.emit({ t: "punch", p: p.id, hit: "prop", target: b.id });
    }
    if (b.kind === "npc") {
      const r = this.npc.hit(b.id, p.id, m.x, m.z);
      this.emit({ t: "punch", p: p.id, hit: r === "hit" ? "npc" : "none", target: b.id });
      if (r === "hit") this.emit({ t: "npcHit", npc: b.id, by: p.id, how: "punch" });
      return;
    }
    const victim = this.players.get(b.id)!;
    if (victim.move.immuneT > 0) return this.emit({ t: "punch", p: p.id, hit: "blocked", target: b.id });
    this.emit({ t: "punch", p: p.id, hit: "player", target: b.id });
    const dx = victim.move.x - m.x, dz = victim.move.z - m.z, l = Math.max(0.01, Math.hypot(dx, dz));
    victim.move.vx += (dx / l) * 4; victim.move.vz += (dz / l) * 4;
    victim.move.stumbleT = Math.max(victim.move.stumbleT, 0.2); // flinch
    if (this.hurt(victim, HEALTH.punch, p.id, { dropHand: true })) {
      p.punchCd = PVP_PUNCH_COOLDOWN; // (anti-grief pause after a knockdown, as before)
      this.addHeat(p, 5);
    }
  }

  private grab(p: PlayerSim, itemId: string) {
    const it = this.items.get(itemId);
    if (!it) return this.emit({ t: "whiff", p: p.id, reason: "taken" });
    // banked loot is safe by day; at NIGHT anyone can raid a fort
    if (it.locked && !this.match.night) return this.emit({ t: "whiff", p: p.id, reason: "locked" });
    const def = lootDef(it.type);
    // Reach check: close enough and roughly in front of you
    const e = this.eye(p);
    const dx = it.body.x - e.x, dy = it.body.y - e.y, dz = it.body.z - e.z;
    const dist = Math.hypot(dx, dy, dz) - lootDef(it.type).radius;
    const facing = (dx * Math.sin(p.move.yaw) + dz * Math.cos(p.move.yaw)) / Math.max(0.001, Math.hypot(dx, dz));
    if (dist > GRAB_RANGE || (Math.hypot(dx, dz) > 0.8 && facing < 0.2)) return this.emit({ t: "whiff", p: p.id, reason: "far" });

    if (it.mode === "free" && it.fort >= 0) this.raidCheck(p, it);

    if (def.size === "giant") {
      if (it.mode === "held" && (it.holder === p.id || it.holder2 === p.id) && it.holder2) { this.tugPress(p); return; }
      if (p.hand) return this.emit({ t: "whiff", p: p.id, reason: "hands" });
      let tug = false;
      if (it.mode === "free") {
        it.mode = "held"; it.holder = p.id; it.holder2 = "";
      } else if (it.mode === "held" && !it.holder2 && it.holder !== p.id && this.players.has(it.holder)) {
        // grab the other end of a rival's giant item: TUG OF WAR
        it.holder2 = p.id; it.tug = 0; it.tugT = 0; tug = true;
      } else {
        return this.emit({ t: "whiff", p: p.id, reason: "taken" });
      }
      p.hand = it.id;
      if (!tug) this.touch(it);
      if (tug) this.emit({ t: "tug", item: it.id, stage: "start", winner: "", loser: "" });
      this.updateCarry(p);
      for (const hid of [it.holder, it.holder2]) { const h = this.players.get(hid); if (h) this.updateCarry(h); }
      p.actionCd = ACTION_COOLDOWN;
      return this.emit({ t: "grab", p: p.id, item: it.id, to: "carry" });
    }

    if (it.mode !== "free") return this.emit({ t: "whiff", p: p.id, reason: "taken" });
    if (def.money) {
      // coins / cash / wallets: straight into your cash
      const value = itemWorth(it);
      p.cash += value;
      this.items.delete(it.id);
      p.actionCd = ACTION_COOLDOWN;
      if (it.shop >= 0) this.props.onShopGrab(p, it);
      return this.emit({ t: "cash", p: p.id, item: it.id, type: it.type, value });
    }
    if (def.size === "small") {
      const slot = p.pockets.indexOf("");
      if (slot >= 0) {
        p.pockets[slot] = it.id;
        it.mode = "pocket"; it.holder = p.id;
        this.touch(it);
        p.actionCd = ACTION_COOLDOWN;
        if (it.shop >= 0) this.props.onShopGrab(p, it);
        return this.emit({ t: "grab", p: p.id, item: it.id, to: "pocket" });
      }
      if (p.hand) return this.emit({ t: "whiff", p: p.id, reason: "full" });
    } else if (p.hand) {
      return this.emit({ t: "whiff", p: p.id, reason: "hands" });
    }
    p.hand = it.id;
    it.mode = "held"; it.holder = p.id;
    this.touch(it);
    this.updateCarry(p);
    p.actionCd = ACTION_COOLDOWN;
    if (it.shop >= 0) this.props.onShopGrab(p, it);
    this.emit({ t: "grab", p: p.id, item: it.id, to: "hand" });
  }

  /** C1: a rival stepping into your compound at night sets off the alarm straight away. */
  private raidWatch() {
    for (const p of this.players.values()) {
      const slot = p.connected && p.jailT <= 0 && p.respawnT <= 0 ? fortAt(this.arena, p.move.x, p.move.z) : -1;
      if (slot === p.inFort) continue;
      p.inFort = slot;
      if (slot < 0 || !this.match.night) continue;
      const owner = this.match.ownerOf(slot);
      if (!owner || owner.id === p.id || this.time - owner.raidEnterT < RAID_ENTER_CD) continue;
      owner.raidEnterT = this.time;
      this.emit({ t: "raidEnter", p: p.id, owner: owner.id, slot, x: p.move.x, z: p.move.z });
    }
  }

  /** Night raid: taking loot out of a RIVAL's fort sets off their alarm. */
  private raidCheck(p: PlayerSim, it: ItemSim) {
    if (!this.match.night) return;
    const owner = this.match.ownerOf(it.fort);
    if (!owner || owner.id === p.id) return;
    if (this.time - owner.raidAlarmT < RAID_ALARM_CD) return;
    owner.raidAlarmT = this.time;
    this.emit({ t: "raid", p: p.id, owner: owner.id, item: it.id, x: it.body.x, z: it.body.z });
  }

  /** One E press in a tug of war. */
  private tugPress(p: PlayerSim) {
    const it = p.hand ? this.items.get(p.hand) : undefined;
    if (!it || it.mode !== "held" || !it.holder2 || p.tugCd > 0) return;
    if (it.holder !== p.id && it.holder2 !== p.id) return;
    p.tugCd = TUG_PRESS_CD;
    it.tug += it.holder2 === p.id ? TUG_STEP : -TUG_STEP;
    if (Math.abs(it.tug) >= 1) this.endTug(it);
  }

  /** Tug of war decided (or timed out): the winner keeps dragging, the loser lets go and staggers. */
  private endTug(it: ItemSim) {
    const winnerId = it.tug > 0 ? it.holder2 : it.holder;
    const loserId = winnerId === it.holder ? it.holder2 : it.holder;
    const loser = this.players.get(loserId), winner = this.players.get(winnerId);
    it.holder = winnerId; it.holder2 = ""; it.tug = 0; it.tugT = 0;
    this.touch(it);
    if (loser) {
      loser.hand = "";
      this.updateCarry(loser);
      if (winner) { const dx = loser.move.x - winner.move.x, dz = loser.move.z - winner.move.z, l = Math.max(0.01, Math.hypot(dx, dz)); loser.move.vx += (dx / l) * 4; loser.move.vz += (dz / l) * 4; }
      loser.move.stumbleT = Math.max(loser.move.stumbleT, 0.5);
    }
    if (winner) this.updateCarry(winner);
    this.emit({ t: "tug", item: it.id, stage: "win", winner: winnerId, loser: loserId });
  }

  /**
   * The item in your hands right now: whatever you're holding, else the pocket item you've
   * selected (it's drawn in your hand). Fists selected = nothing (a click punches).
   */
  // ------------------------------------------------------------------ C4b: tagging
  /** The spray can you have out (in your hand slot or the selected pocket), if it has paint left. */
  private sprayCan(p: PlayerSim): ItemSim | null {
    const a = this.activeItem(p);
    return a && a.item.type === "spray_can" && (a.item.uses ?? TAG.uses) > 0 ? a.item : null;
  }
  private tagStart(p: PlayerSim) {
    if (!this.sprayCan(p)) return;
    p.tagging = { t0: this.time, x: p.move.x, z: p.move.z };
    this.emit({ t: "tagStart", p: p.id });
  }
  /**
   * C4b: finish a tag at (x, y, z) on a wall facing (nx, nz). You must have held still with a can out for
   * TAG.hold seconds, be in reach, and the spot must be a blank wall (a building, wall or fence face, not
   * glass), not too close to another tag. +1 aura point; heat if somebody sees you.
   */
  tag(p: PlayerSim, x: number, y: number, z: number, nx: number, nz: number): boolean {
    const t = p.tagging;
    if (t && this.time - t.t0 < TAG.hold * 0.5 && [x, y, z, nx, nz].every(Number.isFinite)) { t.pending = { x, y, z, nx, nz }; return false; } // (the host's clock is behind: finish it when it catches up)
    p.tagging = null;
    const can = this.sprayCan(p);
    if (!t || !can || ![x, y, z, nx, nz].every(Number.isFinite)) return false;
    if (Math.hypot(p.move.x - t.x, p.move.z - t.z) > 0.6) return false;
    if (Math.hypot(x - p.move.x, z - p.move.z) > TAG.reach || y < p.move.y + 0.3 || y > p.move.y + 2.6) return false;
    const nl = Math.hypot(nx, nz);
    if (nl < 0.5) return false;
    const ux = Math.round(nx / nl), uz = Math.round(nz / nl);
    // a real wall face right there
    const wall = nearBoxes(this.arena, x, z, 0.5).find((b) => {
      if (!["building", "tower", "wall", "fence"].includes(b.kind) && !b.mayor) return false;
      if (y < b.y - b.h / 2 || y > b.y + b.h / 2) return false;
      if (ux) return Math.abs(x - (b.x + ux * b.w / 2)) < 0.15 && Math.abs(z - b.z) < b.d / 2 - 0.3;
      return Math.abs(z - (b.z + uz * b.d / 2)) < 0.15 && Math.abs(x - b.x) < b.w / 2 - 0.3;
    });
    if (!wall) return false;
    for (const o of this.tags.values()) if (Math.hypot(o.x - x, o.z - z) < TAG.spacing && Math.abs(o.y - y) < 1.5) return false;
    const id = "t" + this.nextTag++;
    this.tags.set(id, { id, x, y, z, nx: ux, nz: uz, colorIdx: p.colorIdx, by: p.id, style: Math.floor(this.rng() * 6) });
    can.uses = (can.uses ?? TAG.uses) - 1;
    // C5c: the Mayor's statue is worth a lot more (and everyone notices)
    const onMayor = !!wall.mayor;
    p.aura += onMayor ? MAYOR_TAG.aura : 1;
    if (onMayor) this.addHeat(p, MAYOR_TAG.heat);
    else if (this.witnessed(p)) this.addHeat(p, TAG.heat);
    this.emit({ t: "tag", p: p.id, tag: id, left: can.uses });
    if (can.uses <= 0) { // the can's empty: tossed
      if (p.hand === can.id) p.hand = ""; else { const i = p.pockets.indexOf(can.id); if (i >= 0) p.pockets[i] = ""; }
      this.items.delete(can.id);
      this.updateCarry(p);
    }
    return true;
  }

  /** C5c: an item you're carrying is used up (the keycard stays in the vault's lock) */
  consumeItem(p: PlayerSim, id: string) {
    if (p.hand === id) p.hand = ""; else { const i = p.pockets.indexOf(id); if (i >= 0) p.pockets[i] = ""; }
    this.items.delete(id);
    this.updateCarry(p);
  }

  // ------------------------------------------------------------------ C5c: the giant WANTED screen
  // ------------------------------------------------------------------ C5c.1 citizen's arrest
  /** Who's holding this player down (null = nobody) */
  pinnerOf(p: PlayerSim): PlayerSim | null {
    for (const q of this.players.values()) if (q.pin && q.pin.target === p.id) return q;
    return null;
  }
  private arrest(p: PlayerSim, targetId: string) {
    const t = this.players.get(targetId);
    const no = (reason: string) => this.emit({ t: "pinFail", p: p.id, reason });
    if (!t || t === p || p.pin || p.rob || p.jailT > 0) return;
    if (this.lobby.on(p) || this.lobby.on(t)) return no("lobby");
    if (Math.hypot(t.move.x - p.move.x, t.move.z - p.move.z) > ARREST.reach || Math.abs(t.move.y - p.move.y) > 1.2) return no("far");
    if (t.notoriety < ARREST.minHeat) return no("clean");
    if (t.move.knockT <= 0 || t.jailT > 0 || t.respawnT > 0) return no("standing");
    if (this.pinnerOf(t)) return no("taken");
    this.props.cancelRob(p);
    p.pin = { target: t.id, x: p.move.x, z: p.move.z, t: 0, heat: t.notoriety, struggle: 0, cd: 0 };
    t.knownX = t.move.x; t.knownZ = t.move.z; t.seenT = this.time;
    this.emit({ t: "pin", p: p.id, target: t.id, heat: Math.round(t.notoriety) });
  }
  private struggle(p: PlayerSim) {
    const q = this.pinnerOf(p);
    if (!q || !q.pin || q.pin.cd > 0) return;
    q.pin.cd = ARREST.struggleCd;
    q.pin.struggle++;
  }
  private endPin(q: PlayerSim, why: "free" | "rescued" | "moved" | "time" | "gone") {
    const pin = q.pin!;
    q.pin = null;
    this.emit({ t: "pinEnd", p: q.id, target: pin.target, why });
    const t = this.players.get(pin.target);
    if (why === "free" && t) { t.move.knockT = Math.min(t.move.knockT, 0.05); q.move.stunT = Math.max(q.move.stunT, 0.8); } // (you wriggle out; they fall back a bit dazed)
  }
  private tickPins(dt: number) {
    for (const q of this.players.values()) {
      const pin = q.pin;
      if (!pin) continue;
      const t = this.players.get(pin.target);
      pin.t += dt; pin.cd = Math.max(0, pin.cd - dt);
      if (!t || !t.connected || t.jailT > 0 || t.respawnT > 0) { this.endPin(q, "gone"); continue; }
      if (pin.struggle >= ARREST.breakFree) { this.endPin(q, "free"); continue; }
      if (q.move.knockT > 0 || q.move.stunT > 0 || q.respawnT > 0 || q.jailT > 0 || !q.connected) { this.endPin(q, "rescued"); continue; }
      if (Math.hypot(q.move.x - pin.x, q.move.z - pin.z) > ARREST.moveCancel || Math.hypot(t.move.x - q.move.x, t.move.z - q.move.z) > ARREST.reach + 0.6) { this.endPin(q, "moved"); continue; }
      if (pin.t > ARREST.maxTime) { this.endPin(q, "time"); continue; }
      // held down: they stay flat, the heat stays on, and the cops know exactly where
      t.move.knockT = Math.max(t.move.knockT, 0.25);
      t.move.vx = 0; t.move.vz = 0;
      t.notoriety = Math.max(t.notoriety, pin.heat);
      t.seenT = this.time; t.knownX = t.move.x; t.knownZ = t.move.z;
    }
  }
  /**
   * The police cuffed p: if somebody was holding them down, pay the bounty (heat x $5), taken first out of the
   * loot the cops just confiscated (worth `seized`), then out of p's cash. Returns what was paid.
   */
  payBounty(p: PlayerSim, seized: number): number {
    const q = this.pinnerOf(p);
    if (!q || !q.pin) return 0;
    const want = Math.round(q.pin.heat * ARREST.perHeat);
    const fromLoot = Math.min(want, Math.max(0, seized));
    const fromCash = Math.min(want - fromLoot, Math.max(0, p.cash));
    p.cash -= fromCash;
    const paid = fromLoot + fromCash;
    q.cash += paid;
    q.pin = null;
    this.emit({ t: "bounty", p: q.id, target: p.id, value: paid, want });
    return paid;
  }

  private activeItem(p: PlayerSim): { item: ItemSim; from: "hand" | number } | null {
    if (p.hand) { const it = this.items.get(p.hand); if (it) return { item: it, from: "hand" }; p.hand = ""; }
    if (p.sel >= 0 && p.sel < POCKETS && p.pockets[p.sel]) {
      const it = this.items.get(p.pockets[p.sel]);
      if (it) return { item: it, from: p.sel };
      p.pockets[p.sel] = ""; p.sel = FISTS;
    }
    return null;
  }

  /** Anything you carry (hands first, then any pocket): G drops these one by one, knockdowns drop them all. */
  private anyItem(p: PlayerSim): { item: ItemSim; from: "hand" | number } | null {
    const a = this.activeItem(p);
    if (a) return a;
    for (let i = 0; i < POCKETS; i++) {
      const id = p.pockets[i];
      if (!id) continue;
      const it = this.items.get(id);
      if (it) return { item: it, from: i };
      p.pockets[i] = "";
    }
    return null;
  }

  private release(p: PlayerSim, from: "hand" | number) {
    if (from === "hand") p.hand = ""; else { p.pockets[from] = ""; if (p.sel === from) p.sel = FISTS; }
    this.updateCarry(p);
  }

  /** Mouse wheel: step through fists + every filled pocket. Locked while something big is in your hands. */
  private cycleSel(p: PlayerSim, dir: number) {
    if (p.hand) return;
    const opts = [FISTS, ...[0, 1, 2].filter((i) => p.pockets[i])];
    const k = Math.max(0, opts.indexOf(p.sel));
    p.sel = opts[(k + dir + opts.length) % opts.length];
  }

  /** Keys 1-3 (a filled pocket) or 4 (fists). */
  private selectSlot(p: PlayerSim, slot: number) {
    if (p.hand || !Number.isInteger(slot)) return;
    if (slot === FISTS || (slot >= 0 && slot < POCKETS && p.pockets[slot])) p.sel = slot;
  }

  private drop(p: PlayerSim) {
    const a = this.anyItem(p);
    if (!a) return;
    const it = a.item;
    const m = p.move;
    if (lootDef(it.type).size === "giant" && it.holder2) {
      // one of two carriers lets go: the other keeps dragging it
      this.letGoOfGiant(it, p);
      p.actionCd = ACTION_COOLDOWN;
      return this.emit({ t: "drop", p: p.id, item: it.id });
    }
    this.release(p, a.from);
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const r = lootDef(it.type).radius;
    this.freeItem(it, m.x + fx * (PLAYER.radius + r + 0.15), m.y + Math.max(0.6, r + 0.2), m.z + fz * (PLAYER.radius + r + 0.15), m.vx * 0.5, 0, m.vz * 0.5);
    it.holder = ""; it.holder2 = "";
    p.actionCd = ACTION_COOLDOWN;
    this.emit({ t: "drop", p: p.id, item: it.id });
  }

  private throwItem(p: PlayerSim, charge: number, yaw: number, pitch: number) {
    const a = this.activeItem(p);
    if (!a) return;
    const it = a.item;
    const def = lootDef(it.type);
    const giant = def.size === "giant";
    if (giant && it.holder2) return this.emit({ t: "whiff", p: p.id, reason: "hands" }); // mid tug of war
    const c = Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
    const y = Number.isFinite(yaw) ? yaw : p.move.yaw;
    // (a giant heave always goes roughly forward and a bit up, whatever you're looking at)
    const pt = giant ? -0.35 : Number.isFinite(pitch) ? Math.max(-1.5, Math.min(1.5, pitch)) : 0;
    this.release(p, a.from);
    const speed = throwSpeed(def, c);
    const v = throwVelocity(y, pt, speed);
    const e = this.eye(p);
    const m = p.move;
    it.holder = ""; it.holder2 = "";
    if (giant) {
      // heave it from in front of you (where you were dragging it), then stagger from the effort
      this.freeItem(it, m.x + Math.sin(y) * (PLAYER.radius + def.radius + 0.2), m.y + def.radius + 0.4, m.z + Math.cos(y) * (PLAYER.radius + def.radius + 0.2), v.vx + m.vx * 0.3, v.vy, v.vz + m.vz * 0.3);
      m.stumbleT = Math.max(m.stumbleT, HEAVE.stagger);
    } else this.freeItem(it, e.x + v.dx * 0.55, e.y - 0.15 + v.dy * 0.55, e.z + v.dz * 0.55, v.vx + m.vx * 0.5, v.vy, v.vz + m.vz * 0.5);
    it.body.spin = (this.rng() * 2 - 1) * 8;
    it.lastThrower = p.id;
    it.thrownT = 0;
    p.actionCd = ACTION_COOLDOWN;
    this.emit({ t: "throw", p: p.id, item: it.id, speed });
  }

  private letGoOfGiant(it: ItemSim, p: PlayerSim) {
    if (it.holder === p.id) { it.holder = it.holder2; }
    it.holder2 = ""; it.tug = 0; it.tugT = 0;
    p.hand = "";
    this.updateCarry(p);
    const other = this.players.get(it.holder);
    if (other) this.updateCarry(other);
  }

  freeItem(it: ItemSim, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    it.mode = "free";
    const b = it.body;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
    b.resting = false;
    this.touch(it);
  }

  private dropEverything(p: PlayerSim) {
    let guard = 0;
    while (this.anyItem(p) && guard++ < 10) {
      const a = this.anyItem(p)!;
      const it = a.item;
      if (lootDef(it.type).size === "giant" && it.holder2) { this.letGoOfGiant(it, p); continue; }
      this.release(p, a.from);
      const ang = this.rng() * Math.PI * 2;
      this.freeItem(it, p.move.x + Math.sin(ang) * 0.5, p.move.y + 1, p.move.z + Math.cos(ang) * 0.5, Math.sin(ang) * 2, 3, Math.cos(ang) * 2);
      it.holder = ""; it.holder2 = "";
      this.emit({ t: "drop", p: p.id, item: it.id });
    }
    p.hand = "";
    p.pockets.fill("");
    p.sel = FISTS;
    this.updateCarry(p);
  }

  /** Recompute movement modifiers from what the player carries. */
  private updateCarry(p: PlayerSim) {
    const m = p.move;
    const it = p.hand ? this.items.get(p.hand) : undefined;
    if (!it) { m.carryMul = 1; m.carryHeavy = false; m.handsFull = false; return; }
    const def = lootDef(it.type);
    const carriers = def.size === "giant" ? (it.holder && it.holder2 ? 2 : 1) : 1;
    m.carryMul = carrySpeedMul(def, carriers);
    m.carryHeavy = !!def.heavy || def.size === "giant";
    m.handsFull = def.size !== "small";
  }

  /** Someone handled it: reset idle cleanup and the fort-bank timer (dropping it starts the 10 s again). */
  private touch(it: ItemSim) { it.idleT = 0; it.bankT = 0; it.fort = -1; it.locked = false; }

  // ------------------------------------------------------------------ simulation
  tick(dt = SIM_DT) {
    this.time += dt;
    for (const p of this.players.values()) {
      p.actionCd = Math.max(0, p.actionCd - dt);
      if (p.queued && p.actionCd <= 0) { const q = p.queued; p.queued = null; this.action(p.id, q); }
      p.punchCd = Math.max(0, p.punchCd - dt);
      p.tugCd = Math.max(0, p.tugCd - dt);
      // health: back to full once you're up after a knockdown; otherwise regenerates after a quiet spell
      if (p.hp <= 0) { if (p.move.knockT <= 0) p.hp = HEALTH.max; }
      else if (p.hp < HEALTH.max && this.time - p.hurtT >= HEALTH.regenDelay) p.hp = Math.min(HEALTH.max, p.hp + HEALTH.regenRate * dt);
      if (p.knockWindowT > 0) { p.knockWindowT -= dt; if (p.knockWindowT <= 0) p.knockCount = 0; }
      const tp = p.tagging?.pending; // (C4b: a tag the client finished before this host's clock did)
      if (tp && this.time - p.tagging!.t0 >= TAG.hold * 0.5) this.tag(p, tp.x, tp.y, tp.z, tp.nx, tp.nz);
      if (!p.connected) continue;
      p.credit = Math.min(p.credit + 1, MAX_INPUTS_PER_TICK);
      while (p.credit >= 1 && p.queue.length) {
        const inp = p.queue.shift()!;
        stepMovement(p.move, inp, this.arena);
        p.lastSeq = inp.seq;
        p.credit -= 1;
      }
    }
    this.npc.tick(dt);
    this.recycleTimer += dt;
    if (this.recycleTimer >= 5) { this.recycleTimer = 0; this.npc.recycle(); }
    this.updateHeldItems();
    this.stepFreeItems(dt);
    this.match.tick(dt);
    this.props.tick(dt);
    this.lobby.tick(dt);
    this.traffic.tick(dt);
    this.tickPins(dt);
    this.police.tick(dt);
    this.raidWatch();
    // C1.1: fall in the canal and whatever's in your hands floats off
    for (const p of this.players.values()) {
      if (p.hand && inDeepWater(this.arena, p.move.x, p.move.z, p.move.y)) {
        const id = p.hand;
        this.dropHand(p);
        this.emit({ t: "splash", p: p.id, item: id, x: p.move.x, z: p.move.z });
      }
    }
    // (Slice 2A, Blake: shops restock at the start of each scavenge only; a shop you cleaned out stays empty)
    if (this.spawnLoot) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= 6) { this.spawnTimer = 0; this.topUpLoot(1); }
    }
  }

  private updateHeldItems() {
    for (const it of this.items.values()) {
      if (it.mode === "pocket") {
        const h = this.players.get(it.holder);
        if (!h || !h.pockets.includes(it.id)) { it.mode = "free"; it.holder = ""; it.body.resting = false; continue; }
        it.body.x = h.move.x; it.body.y = h.move.y + 1; it.body.z = h.move.z;
        continue;
      }
      if (it.mode !== "held") continue;
      const def = lootDef(it.type);
      const thief = this.npc.npcs.get(it.holder);
      if (thief) {
        // a raccoon running off with it, carried over its head
        it.body.x = thief.move.x; it.body.z = thief.move.z; it.body.y = thief.move.y + 0.75 + def.radius;
        it.body.vx = thief.move.vx; it.body.vy = 0; it.body.vz = thief.move.vz; it.body.rot = thief.move.yaw;
        continue;
      }
      const h1 = this.players.get(it.holder);
      if (!h1) { this.freeItem(it, it.body.x, it.body.y, it.body.z, 0, 0, 0); it.holder = ""; it.holder2 = ""; continue; }
      const m = h1.move;
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      if (def.size === "giant") {
        const h2 = it.holder2 ? this.players.get(it.holder2) : undefined;
        if (h2) {
          // tug of war: nobody moves (carry speed 0) until someone wins or time runs out
          it.tugT += SIM_DT;
          if (it.tugT > TUG_MAX_TIME) { if (it.tug === 0) it.tug = -1e-6; this.endTug(it); continue; }
          const gap = Math.hypot(h1.move.x - h2.move.x, h1.move.z - h2.move.z);
          if (gap > GIANT_TETHER) {
            // pulled apart (shoved, knocked): it tumbles to the ground and both let go
            it.holder = ""; it.holder2 = ""; it.tug = 0; it.tugT = 0;
            h1.hand = ""; h2.hand = "";
            this.updateCarry(h1); this.updateCarry(h2);
            this.freeItem(it, (h1.move.x + h2.move.x) / 2, 1.2, (h1.move.z + h2.move.z) / 2, 0, 2, 0);
            it.body.spin = 3;
            this.emit({ t: "tumble", item: it.id });
            continue;
          }
          it.body.x = (h1.move.x + h2.move.x) / 2;
          it.body.z = (h1.move.z + h2.move.z) / 2;
          it.body.y = Math.max(h1.move.y, h2.move.y) + 1.0;
          it.body.rot = Math.atan2(h2.move.x - h1.move.x, h2.move.z - h1.move.z) + Math.PI / 2;
        } else {
          // dragging alone: it scrapes along the ground in front of you
          it.body.x = m.x + fx * (PLAYER.radius + def.radius + 0.1);
          it.body.z = m.z + fz * (PLAYER.radius + def.radius + 0.1);
          it.body.y = m.y + def.radius;
          it.body.rot = m.yaw;
        }
      } else {
        it.body.x = m.x + fx * 0.55;
        it.body.z = m.z + fz * 0.55;
        it.body.y = m.y + 1.1;
        it.body.rot = m.yaw;
      }
      it.body.vx = m.vx; it.body.vy = 0; it.body.vz = m.vz;
    }
  }

  private stepFreeItems(dt: number) {
    for (const it of this.items.values()) {
      if (it.mode !== "free") continue;
      const def = lootDef(it.type);
      it.thrownT += dt;
      if (it.body.resting) {
        it.idleT += dt;
        // cleanup: long-ignored common junk quietly disappears (keeps the city fresh)
        if (it.idleT > 240 && def.rarity === "common" && it.fort < 0 && this.items.size > ITEM_TARGET * 0.6) this.items.delete(it.id);
        continue;
      }
      const res = stepItem(it.body, def.radius, def.bounce, this.arena, dt);
      if (it.chute) {
        // floating down under a parachute
        if (it.body.vy < -3.5) it.body.vy = -3.5;
        it.body.vx *= 0.9; it.body.vz *= 0.9;
        if (it.body.resting || it.body.y < def.radius + 0.05) it.chute = false;
      }
      if (res.impact > 2.5) this.emit({ t: "impact", item: it.id, speed: res.impact, x: it.body.x, y: it.body.y, z: it.body.z });
      if (res.outOfBounds) this.respawnItem(it);
      // C5a: the lobby's throw game targets
      if (res.impact > 1.5 && it.thrownT < 2 && it.lastThrower && this.arena.lobby) {
        const thrower = this.players.get(it.lastThrower);
        if (thrower && this.lobby.itemImpact(it, thrower)) it.thrownT = 2;
      }
      // C4a: a thrown thing slamming into something smashable counts as the thrower's hit on it
      if (res.impact > 4 && it.thrownT < 2 && it.lastThrower) {
        const thrower = this.players.get(it.lastThrower);
        if (thrower) for (const ps of this.props.props.values()) {
          const d = ps.def;
          if (!SMASHABLE.has(d.kind) || (BREAKABLE.has(d.kind) && !ps.ready)) continue;
          if (propSurfaceDist(d, it.body.x, it.body.z) > def.radius + 0.3) continue;
          const top = d.box !== undefined ? this.arena.boxes[d.box].y + this.arena.boxes[d.box].h / 2 : 2.2;
          if (it.body.y > top + def.radius + 0.2) continue;
          this.props.smash(thrower, d.id);
          it.thrownT = 2;
          break;
        }
      }
      // thrown items bonk players (a comedy shove; stuns + loot drops may come later)
      const sp = Math.hypot(it.body.vx, it.body.vy, it.body.vz);
      if (sp > 6 && it.thrownT < 2 && it.lastThrower) {
        for (const n of this.npc.npcs.values()) {
          if (n.state === "ko" || n.state === "stunned" || n.state === "sleep" || n.state === "yell") continue; // (C4b: the old lady's upstairs)
          const dx = it.body.x - n.move.x, dz = it.body.z - n.move.z, dy = it.body.y - (n.move.y + 0.9);
          if (Math.hypot(dx, dz) < def.radius + PLAYER.radius && Math.abs(dy) < 1.0) {
            const r = this.npc.hit(n.id, it.lastThrower, it.body.x - it.body.vx * 0.1, it.body.z - it.body.vz * 0.1);
            if (r === "hit") this.emit({ t: "npcHit", npc: n.id, by: it.lastThrower, how: "throw" });
            it.body.vx *= -0.3; it.body.vz *= -0.3;
            it.thrownT = 2;
            break;
          }
        }
      }
      if (sp > (def.size === "giant" ? 3 : 6) && it.thrownT < 2) {
        for (const p of this.players.values()) {
          if (!p.connected || (p.id === it.lastThrower && it.thrownT < 0.4)) continue;
          const m = p.move;
          const cy = m.y + 0.9;
          const dx = it.body.x - m.x, dz = it.body.z - m.z, dy = it.body.y - cy;
          if (Math.hypot(dx, dz) < def.radius + PLAYER.radius && Math.abs(dy) < 1.0) {
            const nx = -dx, nz = -dz, nl = Math.max(0.001, Math.hypot(nx, nz));
            const hit = throwImpact(def, sp);
            m.vx += (nx / nl) * hit.knock; m.vz += (nz / nl) * hit.knock; // heavier = shoved harder
            if (hit.stagger) m.stumbleT = Math.max(m.stumbleT, hit.stagger);
            it.body.vx *= -0.3; it.body.vz *= -0.3;
            it.thrownT = 2; // one bonk per throw
            this.emit({ t: "bonk", item: it.id, p: p.id, by: it.lastThrower });
            this.hurt(p, hit.dmg, it.lastThrower, { canKO: false });
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ loot spawning
  private fillLoot(newDay: boolean) {
    for (let i = 0; i < this.itemTarget; i++) this.spawnOne();
    // C5c: a new day: the bank's vault is restocked, and the manager has lost his keycard somewhere in Uptown again
    const bank = this.arena.bank;
    if (newDay && bank) {
      for (const it of [...this.items.values()]) if (it.type === "bank_keycard") this.items.delete(it.id);
      for (const v of bank.vaultSpots) if (![...this.items.values()].some((it) => it.type === v.type && Math.hypot(it.body.x - v.x, it.body.z - v.z) < 0.3 && Math.abs(it.body.y - v.y) < 0.6)) this.placeItem(v.type, v.x, v.y, v.z);
      const k = bank.keycardSpots[Math.floor(this.rng() * bank.keycardSpots.length)];
      if (k) this.placeItem("bank_keycard", k.x, k.y, k.z);
    }
    // C4a: street junk back at its spots (chairs by the café tables, lids by the bins, bricks on the building site...)
    for (const j of this.arena.junkSpots ?? []) {
      if ([...this.items.values()].some((it) => it.type === j.type && it.mode === "free" && Math.hypot(it.body.x - j.x, it.body.z - j.z) < 0.8)) continue;
      const id = this.placeItem(j.type, j.x, j.y ?? 0.15, j.z);
      const it = this.items.get(id);
      if (it) it.body.rot = j.yaw ?? 0;
    }
  }

  private topUpLoot(n: number) {
    let free = 0;
    for (const it of this.items.values()) if (it.mode === "free" && it.shop < 0 && !lootDef(it.type).junk) free++;
    for (let i = 0; i < n && free < this.itemTarget && this.looseCount() < ITEM_MAX; i++, free++) this.spawnOne();
  }

  /** Items that aren't shop stock (Slice 2A: shelves are capped separately by SHELF_MAX). */
  private looseCount() { let n = 0; for (const it of this.items.values()) if (it.shop < 0 && !lootDef(it.type).junk) n++; return n; }

  private pickType(zone: LootZone, groundLevel: boolean, allowGiant: boolean): LootDef {
    const boost = ZONE_RARE_BOOST[zone];
    const pool = LOOT.filter((d) => !d.npcOnly && !d.junk && (d.size !== "giant" || (allowGiant && groundLevel && (zone === "plaza" || zone === "yard"))));
    let total = 0;
    const w = pool.map((d) => {
      const rareish = d.rarity !== "common" && d.rarity !== "uncommon";
      const x = d.spawnWeight * (rareish ? boost : 1);
      total += x;
      return x;
    });
    let r = this.rng() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  /** Spawn one item at a random free spawn point. Returns its id (or "" if none placed). */
  spawnOne(forceType?: string): string {
    const spawns = this.arena.lootSpawns ?? [];
    if (!spawns.length || this.looseCount() >= ITEM_MAX) return "";
    let giants = 0;
    for (const it of this.items.values()) if (lootDef(it.type).size === "giant") giants++;
    for (let attempt = 0; attempt < 12; attempt++) {
      const sp = spawns[Math.floor(this.rng() * spawns.length)];
      if (sp.pool) continue; // shop shelves are stocked separately
      let busy = false;
      for (const it of this.items.values()) {
        if (it.mode === "free" && Math.hypot(it.body.x - sp.x, it.body.z - sp.z) < 1.6 && Math.abs(it.body.y - sp.y) < 2) { busy = true; break; }
      }
      if (busy) continue;
      const def = forceType ? lootDef(forceType) : this.pickType(sp.zone, sp.y === 0, giants < GIANT_MAX);
      const id = "i" + this.nextItem++;
      const jx = (this.rng() - 0.5) * 0.6, jz = (this.rng() - 0.5) * 0.6;
      this.items.set(id, {
        id, type: def.type, value: rollValue(def, this.rng),
        body: { x: sp.x + jx, y: sp.y + def.radius + 0.4, z: sp.z + jz, vx: 0, vy: 0, vz: 0, rot: this.rng() * Math.PI * 2, spin: 0, resting: false },
        mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
        fort: -1, bankT: 0, locked: false, mult: this.lootMult, chute: false, shop: -1, tug: 0, tugT: 0,
      });
      this.emit({ t: "spawn", item: id });
      return id;
    }
    return "";
  }

  /** Test/debug helper: move a player (keeps what they carry). */
  debugTeleport(id: string, x: number, z: number, yaw: number) {
    const p = this.players.get(id);
    if (!p) return;
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(x, z, yaw), ...keep };
    if (inLobby(this.arena, x, z) && this.arena.lobby) p.move.y = this.arena.lobby.y; // (C5a: onto the squat's roof)
    p.queue.length = 0;
  }

  /** C5a: the floor height at (x, z) for test helpers: the squat's roof, or the street */
  floorAt(x: number, z: number): number { return inLobby(this.arena, x, z) && this.arena.lobby ? this.arena.lobby.y : 0; }

  /** Test/debug helper: put a specific item somewhere (skips the spawn cap on purpose). */
  placeItem(type: string, x: number, y: number, z: number): string {
    const def = lootDef(type);
    const id = "i" + this.nextItem++;
    this.items.set(id, {
      id, type, value: rollValue(def, this.rng),
      body: { x, y: y + def.radius, z, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, resting: false },
      mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
      fort: -1, bankT: 0, locked: false, mult: this.lootMult, chute: false, shop: -1, tug: 0, tugT: 0,
    });
    return id;
  }

  private respawnItem(it: ItemSim) {
    const spawns = this.arena.lootSpawns ?? [];
    const sp = spawns.length ? spawns[Math.floor(this.rng() * spawns.length)] : { x: 0, y: 0, z: 0 };
    const def = lootDef(it.type);
    this.freeItem(it, sp.x, sp.y + def.radius + 0.5, sp.z, 0, 0, 0);
    this.emit({ t: "spawn", item: it.id });
  }

  // ------------------------------------------------------------------ events
  emit(e: WorldEvent) { this.events.push(e); }
  takeEvents(): WorldEvent[] { const e = this.events; this.events = []; return e; }
}

/** How "massive" an item feels when it hits you (0..1): giant 1, big 0.3 + weight, small 0.05 + weight. */
export function itemMass(def: LootDef): number {
  return def.size === "giant" ? 1 : Math.min(1, (def.size === "big" ? 0.3 : 0.05) + def.weight);
}

/** What a thrown item does to a player it hits: damage 5-30 (never a knockout), shove, stagger for heavy stuff. */
export function throwImpact(def: LootDef, speed: number): { dmg: number; knock: number; stagger: number } {
  const m = itemMass(def);
  const dmg = Math.round(Math.min(HEALTH.throwMax, HEALTH.throwMin + (HEALTH.throwMax - HEALTH.throwMin) * Math.min(1, (m * speed) / 10)));
  return { dmg, knock: 2 + 6 * m, stagger: m > 0.5 ? 0.3 : 0 };
}

/** Throw speed for an item at a given charge (0..1). Heavier items fly slower. */
export function throwSpeed(def: LootDef, charge: number): number {
  if (def.size === "giant") return HEAVE.minSpeed + (HEAVE.maxSpeed - HEAVE.minSpeed) * charge;
  const heavy = def.weight;
  return (THROW_MIN_SPEED + (THROW_MAX_SPEED - THROW_MIN_SPEED) * charge) * (1 - heavy * 0.8);
}

/** Direction + velocity of a throw from a look direction (a slight upward lob is added). */
export function throwVelocity(yaw: number, pitch: number, speed: number) {
  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp, dy = -Math.sin(pitch), dz = Math.cos(yaw) * cp;
  return { dx, dy, dz, vx: dx * speed, vy: dy * speed + speed * 0.18, vz: dz * speed };
}
