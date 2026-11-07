// Pedestrian behaviour (Phase 2.5). Runs inside the World on the server and in solo mode.
// Pedestrians move with the SAME movement rules as players (stepMovement), driven by simple AI:
//   walk (route map) / idle -> [hit] -> stunned -> flee | chase -> windup -> strike -> gloat | ko -> flee
import { makeMoveState, stepMovement, type MoveState, type MoveInput } from "./movement.js";
import { PLAYER, SIM_DT } from "./constants.js";
import { NPC_DEFS, NPC_KINDS, SPECIAL_KINDS, BIG_SHOTS, KO_BONUS, MEAT_LOCKER, CHAMP, BOUNCERS, SHOP_OWNERS, BYSTANDER_SCREAMS, pickWeighted, pickLine, type NpcKind } from "./npc.js";
import { buildNavGraph, type NavNode } from "./navgraph.js";
import { nearBoxes, onRoadAt, inFoot, inRect, DEAL, SWARM, type ArenaLayout } from "./arena.js";
/** R12.2: THE SOGGY SHAMROCK's people (R12.2c: hit one and Seamus's lads swarm you) */
const PUB_FOLK = new Set<string>(["barman", "regular", "trad_band", "patron", "barmaid", "leprechaun", "lep_buddy", "drunk_dancer"]);

export type NpcState = "walk" | "idle" | "stunned" | "flee" | "chase" | "windup" | "gloat" | "ko" | "film" | "huff"
  // C4b: the old lady: asleep upstairs (not drawn), then yelling out of her window
  | "sleep" | "yell"
  // raccoon heist (Phase 3): sneak to a fort, grab loot, escape along the back alley; scram = running off empty-handed
  | "sneak" | "escape" | "scram"
  // police (Phase 4): patrol = heading to where you were reported, search = lost sight of you, leave = giving up
  | "patrol" | "search" | "leave"
  // police (Phase 5A): aiming a taser
  | "aim"
  // big shots' entourage (Phase 4.5): bodyguard / fans stick close to their boss
  | "follow"
  // shop cashiers (Phase 3.5): stand at the till / hands up
  | "work" | "cower"
  // R6: the Champ sitting on whoever he beat
  | "sit"
  // R7: a cop walking their beat (town patrols, the station's own)
  | "beat";

export interface NpcSimData {
  id: string;
  /** R12.5: far passers-by: the time owed since their last update, and which step of NPC_LOD.every is theirs */
  lodAcc?: number; lodSlot?: number;
  kind: NpcKind;
  move: MoveState;
  state: NpcState;
  stateT: number; // time left in the current timed state
  node: number; // route node we're heading to
  prevNode: number;
  hp: number;
  robbed: boolean; // already dropped their item
  item: string; // loot type they carry
  target: string; // player they're chasing / fleeing from
  chaseT: number;
  attackCd: number;
  stuckT: number;
  lastDist: number;
  sayCd: number;
  fromX: number; fromZ: number; // flee-from point
  // natural movement (Phase 3 polish): everyone walks a bit differently
  pace: number; // personal walking speed multiplier (0.85..1.15)
  lane: number; // sideways offset from the route line (-0.5..0.5 m), so people don't walk single-file
  curSpeed: number; // eased speed (people speed up / slow down instead of snapping)
  lookYaw: number; lookT: number; // idle: glance around
  // obstacle avoidance: which way we're walking around something (sticky, so people don't dither)
  avoidSide: number; avoidT: number;
  // police: can this cop see their target right now, when did we last check, how long since they saw them
  sees: boolean; losT: number; lostT: number; lastX: number; lastZ: number;
  // entourage: who they follow (big shot id); big shots: seconds since robbed (-1 = not yet)
  leader: string; robbedT: number;
  /** police: seconds until this cop's taser has recharged */
  taserCd: number;
  /** watchdog (5A.1): where this walker was a while ago (going back and forth without getting anywhere = stuck) */
  progX: number; progZ: number; progT: number;
  /** traffic safety (5A.1): seconds spent waiting at the curb for cars; a short detour off the road (asked by a blocked car) */
  waitT: number;
  detour: { x: number; z: number; t: number } | null;
  // raccoons only
  carry: string; // item id being stolen
  path: { x: number; z: number }[]; // escape route (last point = gone)
  fortSlot: number;
  lifeT: number;
  // cashiers only
  post: { x: number; z: number; yaw: number; y?: number } | null;
  /** C5a: which tip Uncle Dumpster is on */
  tip?: number;
  /** R7: the Champ counts the punches: the 3rd inside a few seconds makes him dizzy */
  hitN?: number; hitT0?: number;
  /** R11.4: SKETCHY STEVE: seconds left hiding up the alley (cops about, or you hit him), and where he hides */
  awayT?: number; hide?: { x: number; z: number };
  /** R7: a station cop on a fixed beat (walks its points; after a chase it heads back) */
  beat?: number; beatI?: number;
  /** R7: a town patrol cop (wanders the route network; never sent home) */
  patrol?: boolean;
  shop: number;
}

/** What the NPC system needs from the World (kept as an interface to avoid circular imports). */
export interface NpcHost {
  arena: ArenaLayout;
  rng: () => number;
  playersForNpcs(): { id: string; x: number; y: number; z: number; yaw: number; connected: boolean; knocked: boolean; immune: boolean; inCell?: boolean }[];
  npcHitPlayer(npcId: string, playerId: string, knock: boolean): void;
  npcDropLoot(npcId: string, type: string, x: number, y: number, z: number, awayX: number, awayZ: number): void;
  npcEvent(e: { t: "npcSay"; npc: string; line: string } | { t: "npcAttack"; npc: string; p: string; hit: boolean } | { t: "npcDodge"; npc: string; p: string } | { t: "npcKo"; npc: string; by: string } | { t: "panic"; npc: string } | { t: "louHit"; npc: string; p: string; shop?: number } | { t: "donHit"; npc: string; p: string } | { t: "pubRowdy"; npc: string; p: string } | { t: "npcPop"; npc: string; x: number; y: number; z: number } | BigShotEvent | OldLadyEvent): void;
  addNotoriety(playerId: string, amount: number): void;
  /** a cashier got punched: shop alarm */
  shopAlarm(shopId: number): void;
  applyToPlayer(playerId: string, effect: "trap" | "swarm" | "flash"): void;
  /** raccoon heist hooks */
  raccoonTarget(slot: number): { id: string; x: number; z: number } | null;
  raccoonGrab(npcId: string, itemId: string): boolean;
  npcDropCarried(itemId: string, x: number, y: number, z: number, awayX: number, awayZ: number): void;
  raccoonGone(npcId: string, itemId: string, slot: number): void;
  /** police AI (Phase 4): where a cop wants to go this step (null = not a cop / nothing to do) */
  copBrain(n: NpcSimData, dt: number): { tx: number; tz: number; speed: number; face: number | null } | null;
  /** every car on the road (traffic + police), so pedestrians can wait for a gap */
  cars(): { x: number; z: number; yaw: number; v: number }[];
}

/** Big shots (Phase 4.5): arrive (announced), get hit (jackpot), or leave town. */
/** C4b: the old lady woke up and is yelling out of her window at a bandit */
export type OldLadyEvent = { t: "oldLady"; npc: string; p: string };
export type BigShotEvent = { t: "bigShot"; npc: string; kind: NpcKind; stage: "arrive" | "hit" | "gone"; x: number; z: number; by: string };
/** First big shot after this many seconds, then one every BIG_SHOT_GAP after the last one left. */
export const BIG_SHOT_FIRST = 35;
export const BIG_SHOT_GAP: [number, number] = [45, 75];
export const BIG_SHOT_STAY = 120;

/** R12.5: far passers-by (see NpcSystem.step): beyond `far` m of every player they update every `every`th step */
export const NPC_LOD = { far: 90, every: 3 };
function farFromAll(x: number, z: number, players: { x: number; z: number }[], r: number): boolean {
  for (const p of players) if ((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < r * r) return false;
  return true;
}
function nearRoad(a: ArenaLayout, x: number, z: number, m: number): boolean {
  for (const r of a.roads ?? []) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
  return false;
}
function hashSlot(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) % NPC_LOD.every; }
export const NPC_STEP = SIM_DT * 2; // pedestrians think + move at 30 Hz (cheap, smooth enough)
export const PUNCH_RANGE = 1.9;
/** C4b: the old lady above the laundromat: how far beyond a noise's range she still hears it, how long she yells,
 *  the heat she reports, and how close you must still be for her to come down after you */
export const OLD_LADY = { hearing: 4, yellTime: 3, heat: 12, chaseFrom: 18 };
/** C4a: what walkers say when something smashes nearby */
const STARTLED = ["What was that?!", "Hooligans!", "Not again...", "Somebody call somebody!", "Was that a bench?!", "I saw nothing. NOTHING."];
const ATTACK_RANGE = 1.5;
const STRIKE_RANGE = 1.9;
const WINDUP = 0.45;
const CHASE_GIVE_UP = 8;

export class NpcSystem {
  readonly graph: NavNode[];
  readonly npcs = new Map<string, NpcSimData>();
  private next = 1;
  private acc = 0;
  target: number;
  /** countdown to the next big shot */
  bigShotT = BIG_SHOT_FIRST;

  constructor(private host: NpcHost, count: number) {
    this.graph = buildNavGraph(host.arena);
    this.target = count;
    for (let i = 0; i < count; i++) this.spawn();
    for (const sh of host.arena.shops ?? []) {
      const n = this.spawn("cashier")!;
      n.post = { ...sh.cashier }; n.shop = sh.id;
      n.move = makeMoveState(sh.cashier.x, sh.cashier.z, sh.cashier.yaw);
      n.state = "work";
    }
    // C1.1: posted people (the doorman; C3: the fisherman)
    for (const po of host.arena.posts ?? []) {
      const n = this.spawn(po.kind)!;
      n.post = { x: po.x, z: po.z, yaw: po.yaw, y: po.y };
      n.move = makeMoveState(po.x, po.z, po.yaw);
      if (po.y) n.move.y = po.y; // (C5a: Uncle Dumpster lives on the squat's roof)
      if (po.kind === "uncle_dumpster") n.sayCd = 1; // (he starts talking as soon as you arrive)
      if (po.kind === "sketchy_steve" && host.arena.fever) n.hide = { ...host.arena.fever.dealerHide }; // (R11.4)
      n.state = po.kind === "old_lady" ? "sleep" : "work";
      const hs = (host.arena.hotShops ?? []).find((h) => inRect(h.rect, po.x, po.z, 1.5)); // (R7: which pawn shop they work at)
      if (hs) n.shop = hs.idx;
    }
  }

  // ---------------------------------------------------------------- cashiers
  cashierOf(shop: number): NpcSimData | undefined {
    for (const n of this.npcs.values()) if (n.kind === "cashier" && n.shop === shop) return n;
    return undefined;
  }
  /** Hands up for a few seconds (hold-up, alarm). */
  cower(id: string, time: number) {
    const n = this.npcs.get(id);
    if (!n || n.state === "ko") return;
    if (n.state !== "cower" || n.stateT < time) { n.state = "cower"; n.stateT = time; }
  }
  cashierSay(id: string, what: "yell" | "holdup") {
    const n = this.npcs.get(id);
    if (n) this.say(n, NPC_DEFS.cashier.lines[what], true);
  }
  /** R11.4: SKETCHY STEVE legs it up the alley (cops in sight, or someone hit him); back when it's quiet */
  scram(id: string) {
    const n = this.npcs.get(id);
    if (!n || n.kind !== "sketchy_steve") return;
    if (!((n.awayT ?? 0) > 0)) this.say(n, NPC_DEFS.sketchy_steve.lines.yell!, true);
    n.awayT = DEAL.away;
  }
  /** R11.4: BEEF JUICE: a punch that lands sends them twice as far and keeps them down longer */
  strongHit(id: string, fromX: number, fromZ: number) {
    const n = this.npcs.get(id);
    if (!n) return;
    const ax = n.move.x - fromX, az = n.move.z - fromZ, l = Math.max(0.001, Math.hypot(ax, az));
    n.move.vx += (ax / l) * 3.5; n.move.vz += (az / l) * 3.5;
    if (n.state === "stunned" || n.state === "ko" || n.state === "cower" || n.state === "flee") n.stateT *= 1.8;
  }
  /** R11.4: is STEVE open for business (at his spot, not hiding)? */
  steveOpen(): NpcSimData | null {
    for (const n of this.npcs.values()) if (n.kind === "sketchy_steve") return !((n.awayT ?? 0) > 0) && n.post && Math.hypot(n.post.x - n.move.x, n.post.z - n.move.z) < 1.2 ? n : null;
    return null;
  }
  /** R12.2c: SEAMUS O'SHORTLY says something (a line of his own) */
  seamusSay(line: string) { for (const n of this.npcs.values()) if (n.kind === "leprechaun") { n.sayCd = 4; this.host.npcEvent({ t: "npcSay", npc: n.id, line }); return; } }
  /** R12.2c: the lads swarm a player (at x, y, z): every wee buddy who's up runs at them; those far off or on another
   *  floor pop out round them (they're leprechauns) */
  swarm(pid: string, x: number, y: number, z: number, _t: number, pop: boolean) {
    let k = 0;
    for (const n of this.npcs.values()) {
      if (n.kind !== "lep_buddy" || n.state === "ko") continue;
      n.target = pid; n.chaseT = 0;
      if (n.state !== "windup") n.state = "chase";
      if (n.sayCd <= 0 || pop) this.say(n, NPC_DEFS.lep_buddy.lines.fight, pop && k < 2);
      const far = Math.abs(n.move.y - y) > 1.5 || Math.hypot(n.move.x - x, n.move.z - z) > 12;
      if (pop && far) {
        for (let q = 0; q < 16; q++) {
          const a = k * 1.05 + q * 0.79, r = SWARM.pop * (0.7 + 0.15 * (q % 3)), px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
          if (!this.solidAt(px, pz, y, 0.3) && this.lineClear(x, z, px, pz, y)) { this.popTo(n, px, y, pz); break; }
        }
      }
      k++;
    }
  }
  /** R12.2c: the swarm's over: back to their spots round the snug (popping back if they're far off) */
  swarmOff(pid: string) {
    for (const n of this.npcs.values()) {
      if (n.kind !== "lep_buddy" || n.target !== pid) continue;
      n.target = ""; if (n.state !== "ko") n.state = "work";
      const post = n.post; if (post && (Math.abs(n.move.y - (post.y ?? 0)) > 1.5 || Math.hypot(n.move.x - post.x, n.move.z - post.z) > 10)) this.popTo(n, post.x, post.y ?? 0, post.z);
    }
  }
  private popTo(n: NpcSimData, x: number, y: number, z: number) {
    const m = n.move; m.x = x; m.z = z; m.y = y + 0.05; m.vx = m.vz = m.vy = 0; n.curSpeed = 0; n.stuckT = 0;
    this.host.npcEvent({ t: "npcPop", npc: n.id, x, y, z });
  }
  /** R12.1: THE SOGGY SHAMROCK: Fergal (or the regulars) chime in */
  pubSay(kind: "barman" | "barmaid" | "regular" | "patron", what: "pour" | "cutoff" | "perfect" | "close" | "miss", all = false) {
    for (const n of this.npcs.values()) if (n.kind === kind && n.state !== "ko") { const l = NPC_DEFS[kind].lines[what]; if (l) this.say(n, l, true); if (!all) return; }
  }
  steveSay(what: "sold" | "idle") { for (const n of this.npcs.values()) if (n.kind === "sketchy_steve") this.say(n, NPC_DEFS.sketchy_steve.lines[what]!, true); }
  /** New round: every cashier back at their till with a fresh float. */
  resetCashiers() {
    for (const n of this.npcs.values()) {
      if (!n.post) continue; // (cashiers and posted people: the doorman, the fisherman)
      n.move = makeMoveState(n.post.x, n.post.z, n.post.yaw);
      if (n.post.y) n.move.y = n.post.y;
      n.state = n.kind === "old_lady" ? "sleep" : "work"; n.robbed = false; n.hp = n.kind === "cashier" ? 1 : NPC_DEFS[n.kind].hp; n.stateT = 0; n.target = "";
    }
  }

  /** A raccoon bursts out of a dumpster and scurries off (then vanishes). */
  spawnCritter(x: number, z: number, fromX: number, fromZ: number) {
    const n = this.spawn("raccoon");
    if (!n) return;
    const dx = x - fromX, dz = z - fromZ, l = Math.max(0.01, Math.hypot(dx, dz));
    n.move = makeMoveState(x + (dx / l) * 1.2, z + (dz / l) * 1.2, Math.atan2(dx, dz));
    n.state = "scram"; n.robbed = true; n.fortSlot = -1;
    n.lifeT = 52; // escape/scram give up at 60 s: this one is gone after ~8 s
    n.path = [{ x: x + (dx / l) * 14, z: z + (dz / l) * 14 }];
    this.say(n, NPC_DEFS.raccoon.lines.hit, true);
  }

  private rng() { return this.host.rng(); }

  /** Spawn a pedestrian at a route node (plaza-weighted), optionally far from players. */
  spawn(kind?: NpcKind, farFromPlayers = false): NpcSimData | null {
    if (!this.graph.length) return null;
    const players = this.host.playersForNpcs();
    let node = 0;
    for (let tries = 0; tries < 20; tries++) {
      node = Math.floor(this.rng() * this.graph.length);
      const n = this.graph[node];
      const plaza = Math.abs(n.x) <= 15 && Math.abs(n.z) <= 15;
      if (!plaza && this.rng() < 0.35) continue; // bias toward the plaza
      if (farFromPlayers && players.some((p) => Math.hypot(p.x - n.x, p.z - n.z) < 28)) continue;
      break;
    }
    const n = this.graph[node];
    const k = kind ?? pickWeighted(NPC_KINDS.map((k) => [k, NPC_DEFS[k].spawnWeight] as [NpcKind, number]), () => this.rng());
    const def = NPC_DEFS[k];
    const id = "n" + this.next++;
    let jx = n.x + (this.rng() - 0.5), jz = n.z + (this.rng() - 0.5);
    if (this.solidAt(jx, jz, 0, PLAYER.radius)) { jx = n.x; jz = n.z; } // (a route point close to a wall: no jitter)
    const move = makeMoveState(jx, jz, this.rng() * Math.PI * 2);
    const npc: NpcSimData = {
      id, kind: k, move, state: "walk", stateT: 0, node, prevNode: node, hp: def.hp, robbed: false,
      item: pickWeighted(def.loot, () => this.rng()), target: "", chaseT: 0, attackCd: 0, taserCd: 0, waitT: 0, detour: null, progX: 0, progZ: 0, progT: 0, stuckT: 0, lastDist: 99, avoidSide: 1, avoidT: 0, sees: false, losT: 0, lostT: 0, lastX: 0, lastZ: 0, leader: "", robbedT: -1,
      sayCd: 3 + this.rng() * 10, fromX: 0, fromZ: 0,
      pace: 0.85 + this.rng() * 0.3, lane: (this.rng() - 0.5), curSpeed: 0, lookYaw: 0, lookT: 0,
      carry: "", path: [], fortSlot: -1, lifeT: 0, post: null, shop: -1,
    };
    npc.node = this.pickNext(npc);
    this.npcs.set(id, npc);
    return npc;
  }

  /** Raccoon heist: a raccoon appears in the alley behind a fort and goes for the best loot there. */
  spawnRaccoon(slot: number): NpcSimData | null {
    const f = (this.host.arena.forts ?? []).find((x) => x.slot === slot);
    if (!f) return null;
    const n = this.spawn("raccoon");
    if (!n) return null;
    if (f.gapX !== undefined && f.gapZ !== undefined) {
      // C1 walled compound: squeezes in through the gap in the back wall, and out the same way,
      // then off along the strip behind the compounds (toward the middle of Tent Town)
      const side = f.gapX < 0 ? 1 : -1, inZ = f.gapZ + 1.6;
      n.move = makeMoveState(f.gapX, inZ, f.yaw);
      n.state = "sneak"; n.fortSlot = slot; n.lifeT = 0; n.robbed = true; n.pace = 1; n.lane = 0;
      n.path = [{ x: f.gapX, z: inZ }, { x: f.gapX, z: f.backZ }, { x: f.gapX + side * 44, z: f.backZ }];
      return n;
    }
    // sideways along the back alley (perpendicular to the direction the fort faces)
    const lx = Math.cos(f.yaw), lz = -Math.sin(f.yaw);
    const r = this.rng();
    // (C1.1: runs off toward the middle of Tent Town, never into the fence)
    const side = f.x < -1 ? 1 : f.x > 1 ? -1 : r < 0.5 ? -1 : 1;
    n.move = makeMoveState(f.backX + lx * side * 3, f.backZ + lz * side * 3, f.yaw);
    n.state = "sneak"; n.fortSlot = slot; n.lifeT = 0; n.robbed = true; n.pace = 1; n.lane = 0;
    // escape: round the side of the fort box (not through it), into the alley, then off down the alley
    n.path = [
      { x: f.x + lx * side * 3, z: f.z + lz * side * 3 },
      { x: f.backX + lx * side * 3, z: f.backZ + lz * side * 3 },
      { x: f.backX + lx * side * 44, z: f.backZ + lz * side * 44 },
    ];
    return n;
  }

  /** Test/debug helper: remove pedestrians near a spot (the crowd refills elsewhere later). */
  removeNear(x: number, z: number, r: number): number {
    let n = 0;
    for (const [id, p] of this.npcs) if (p.kind !== "cashier" && Math.hypot(p.move.x - x, p.move.z - z) < r) { this.npcs.delete(id); n++; }
    return n;
  }

  /** Test/debug helper: put a specific pedestrian somewhere, standing still. */
  place(kind: NpcKind, x: number, z: number, yaw = 0): NpcSimData {
    const n = this.spawn(kind)!;
    n.move = makeMoveState(x, z, yaw);
    n.state = "idle"; n.stateT = 999;
    n.node = this.nearestClearNode(x, z, -1);
    return n;
  }

  private pickNext(n: NpcSimData): number {
    const links = this.graph[n.node].links;
    if (!links.length) return n.node;
    const choices = links.filter((l) => l !== n.prevNode);
    const pool = choices.length ? choices : links;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /** R5: have this NPC say one of their lines out loud (e.g. Meat Locker's warning) */
  sayLine(id: string, key: keyof (typeof NPC_DEFS)["tourist"]["lines"]) { const n = this.npcs.get(id); if (n) this.say(n, (NPC_DEFS[n.kind].lines as Record<string, string[] | undefined>)[key], true); }

  /** R12.3: one particular line, now (the pub's games: HUGHIE and BIG DINNY) */
  sayText(n: NpcSimData, line: string) { n.sayCd = 4; this.host.npcEvent({ t: "npcSay", npc: n.id, line }); }
  private say(n: NpcSimData, list: string[] | undefined, force = false) {
    if (!force && n.sayCd > 0) return;
    const line = pickLine(list, () => this.rng());
    if (!line) return;
    n.sayCd = 4;
    this.host.npcEvent({ t: "npcSay", npc: n.id, line });
  }

  // ------------------------------------------------------------------ being hit
  /**
   * A player (punch or thrown item) hits a pedestrian. Returns "hit" | "dodged" | "ignored".
   */
  hit(npcId: string, byPlayer: string, fromX: number, fromZ: number): "hit" | "dodged" | "ignored" {
    const n = this.npcs.get(npcId);
    if (!n || n.state === "ko" || n.state === "stunned") return "ignored";
    const def = NPC_DEFS[n.kind];
    if (n.kind === "cashier") {
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
      if (!n.robbed) { n.robbed = true; this.host.npcDropLoot(n.id, "cash_bundle", n.move.x, n.move.y + 1.2, n.move.z, -awayX, -awayZ); }
      this.host.addNotoriety(byPlayer, 10 + def.notoriety);
      this.host.shopAlarm(n.shop);
      n.state = "cower"; n.stateT = 6; n.target = byPlayer;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    if (n.kind === "sketchy_steve") {
      // R11.4: hitting the dealer: he legs it up the alley for a while (closed for business), a little heat
      this.say(n, def.lines.hit, true);
      this.host.addNotoriety(byPlayer, def.notoriety);
      this.scram(n.id);
      return "hit";
    }
    // R12.2: trouble in THE SOGGY SHAMROCK (anyone in there, or Mammy herself): Mammy throws you out
    { const pb = this.host.arena.pub; if (pb && (PUB_FOLK.has(n.kind) || inRect(pb.rect, n.move.x, n.move.z, 3))) this.host.npcEvent({ t: "pubRowdy", npc: n.id, p: byPlayer }); }
    if (n.kind === "leprechaun") { this.say(n, def.lines.hit, true); return "hit"; } // (R12.2c: the boss doesn't go down; his lads come for you)
    if (n.kind === "don") {
      // R11: you punched DON BINNIE: he straightens his suit and sends the boys
      n.state = "cower"; n.stateT = 2; n.target = byPlayer;
      this.say(n, def.lines.hit, true);
      this.host.npcEvent({ t: "donHit", npc: n.id, p: byPlayer });
      return "hit";
    }
    if (SHOP_OWNERS.has(n.kind)) {
      // R5/R7: the shop owner ducks behind the till and hollers for the bouncer (they never come out)
      n.state = "cower"; n.stateT = 3; n.target = byPlayer;
      this.say(n, def.lines.hit, true);
      this.host.npcEvent({ t: "louHit", npc: n.id, p: byPlayer, shop: n.shop });
      return "hit";
    }
    if (n.kind === "receptionist") {
      // R7: punching the front desk: heat (in a police station, of all places), she ducks
      n.state = "cower"; n.stateT = 4; n.target = byPlayer;
      this.say(n, def.lines.hit, true);
      this.host.addNotoriety(byPlayer, def.notoriety);
      this.panicBystanders(n, byPlayer);
      return "hit";
    }
    if (n.kind === "cop") {
      // punching a cop: big heat, they stagger, then come after YOU. 3 hits and they're down for a bit.
      n.hp -= 1;
      this.host.addNotoriety(byPlayer, def.notoriety);
      this.panicBystanders(n, byPlayer);
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ, l = Math.max(0.001, Math.hypot(awayX, awayZ));
      n.move.vx += (awayX / l) * 3; n.move.vz += (awayZ / l) * 3;
      n.target = byPlayer; n.path = [];
      if (n.hp <= 0) {
        n.state = "ko"; n.stateT = 5; n.hp = def.hp;
        this.say(n, def.lines.lose, true);
        this.host.npcEvent({ t: "npcKo", npc: n.id, by: byPlayer });
        this.host.npcDropLoot(n.id, "donut", n.move.x, n.move.y + 0.6, n.move.z, awayX, awayZ);
        return "hit";
      }
      n.state = "stunned"; n.stateT = 0.9;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    if (n.kind === "uncle_dumpster") {
      // C5a: bathrobe kung fu: he sways out of the way of every punch, sips his tea, carries on
      n.move.vx += (this.rng() < 0.5 ? -1 : 1) * 2.5;
      this.say(n, def.lines.dodge, true);
      this.host.npcEvent({ t: "npcDodge", npc: n.id, p: byPlayer });
      return "dodged";
    }
    if (n.kind === "raccoon") {
      // heroic! no heat for bonking a thief. It drops what it stole and runs off empty-handed.
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
      if (n.carry) { this.host.npcDropCarried(n.carry, n.move.x, n.move.y + 0.8, n.move.z, awayX, awayZ); n.carry = ""; }
      n.state = "stunned"; n.stateT = 0.6; n.target = byPlayer; n.fromX = fromX; n.fromZ = fromZ;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    // joggers sometimes sidestep (only when they didn't see it coming... i.e. not already fleeing)
    if (def.dodge > 0 && (n.state === "walk" || n.state === "idle") && this.rng() < def.dodge) {
      n.move.vx += (this.rng() < 0.5 ? -1 : 1) * 3;
      this.say(n, def.lines.dodge, true);
      this.host.npcEvent({ t: "npcDodge", npc: n.id, p: byPlayer });
      this.startFlee(n, fromX, fromZ, byPlayer, 3);
      return "dodged";
    }
    n.hp -= 1;
    this.host.addNotoriety(byPlayer, 10 + def.notoriety);
    this.panicBystanders(n, byPlayer);
    const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
    if (!n.robbed && !(def.dropOnKo && n.hp > 0)) { // the armored courier only lets go of the bag when knocked out
      n.robbed = true;
      this.host.npcDropLoot(n.id, n.item, n.move.x, n.move.y + 1.1, n.move.z, awayX, awayZ);
    }
    this.entourageReacts(n, byPlayer);
    // little knock-back
    const l = Math.max(0.001, Math.hypot(awayX, awayZ));
    n.move.vx += (awayX / l) * 3; n.move.vz += (awayZ / l) * 3;

    if (def.fighter && n.hp <= 0) {
      n.state = "ko"; n.stateT = BOUNCERS.has(n.kind) ? MEAT_LOCKER.ko : n.kind === "champ" ? CHAMP.ko : 3.2; n.target = ""; // (R5: Meat Locker naps a good while: the back room's open)
      this.say(n, def.lines.lose, true);
      this.host.npcEvent({ t: "npcKo", npc: n.id, by: byPlayer });
      this.host.npcDropLoot(n.id, pickWeighted(KO_BONUS, () => this.rng()), n.move.x, n.move.y + 0.6, n.move.z, awayX, awayZ);
      return "hit";
    }
    if (n.kind === "champ") {
      // R7: punches 1 and 2 just nudge him back (he turns on you); the 3rd inside a few seconds: dizzy, he spins
      if (n.hitT0 === undefined || this.time - n.hitT0 > CHAMP.stunWindow) { n.hitN = 0; n.hitT0 = this.time; }
      n.hitN = (n.hitN ?? 0) + 1;
      const l2 = Math.max(0.001, Math.hypot(awayX, awayZ));
      n.move.vx += (awayX / l2) * (CHAMP.nudge - 3); n.move.vz += (awayZ / l2) * (CHAMP.nudge - 3); // (instead of the usual shove)
      n.target = byPlayer; n.fromX = fromX; n.fromZ = fromZ;
      if (n.hitN >= CHAMP.stunHits) {
        n.hitN = 0; n.hitT0 = undefined;
        n.state = "stunned"; n.stateT = CHAMP.dizzy;
        this.say(n, ["*sees stars*", "Whoa... three spoons...", "Who turned the cell... sideways..."], true);
        return "hit";
      }
      if (n.state !== "chase" && n.state !== "windup" && n.state !== "sit") { n.state = "chase"; n.chaseT = 0; }
      this.say(n, n.hitN === 1 ? def.lines.hit : def.lines.fight, true);
      return "hit";
    }
    n.state = "stunned";
    n.stateT = def.fighter ? 0.6 : 1.1;
    n.target = byPlayer;
    n.fromX = fromX; n.fromZ = fromZ;
    this.say(n, def.fighter && n.hp < def.hp ? def.lines.fight : def.lines.hit, true);
    if (n.kind === "mime" && n.hp === def.hp - 1) this.host.applyToPlayer(byPlayer, "trap");
    if (n.kind === "pigeon_lady") this.host.applyToPlayer(byPlayer, "swarm");
    if (n.kind === "tourist") this.host.applyToPlayer(byPlayer, "flash");
    return "hit";
  }

  /**
   * R7: a bouncer's way in and out of his walk-in shop: in the shop and the target outside (or the other way round),
   * head for the door (just inside, then just outside); otherwise straight there.
   */
  private hotWay(n: NpcSimData, tx: number, tz: number): { x: number; z: number } {
    const hs = (this.host.arena.hotShops ?? [])[n.shop];
    if (!hs) return { x: tx, z: tz };
    const inside = (x: number, z: number) => inRect(hs.rect, x, z, -0.2);
    const a = inside(n.move.x, n.move.z), b = inside(tx, tz);
    if (a === b) return { x: tx, z: tz };
    const first = a ? hs.doorIn : hs.out, second = a ? hs.out : hs.doorIn;
    return Math.hypot(first.x - n.move.x, first.z - n.move.z) > 0.6 && !(a ? !inside(n.move.x, n.move.z) : inside(n.move.x, n.move.z)) ? first : second;
  }


  private startFlee(n: NpcSimData, fromX: number, fromZ: number, from: string, time: number) {
    n.state = "flee"; n.stateT = time; n.fromX = fromX; n.fromZ = fromZ; n.target = from;
    // head for the neighbouring node that is furthest from the threat
    const links = this.graph[n.node]?.links ?? [];
    let best = n.node, bestD = -1;
    for (const l of [n.node, ...links]) {
      const g = this.graph[l];
      const d = Math.hypot(g.x - fromX, g.z - fromZ);
      if (d > bestD) { bestD = d; best = l; }
    }
    n.prevNode = n.node; n.node = best;
  }

  // ------------------------------------------------------------------ big shots (Phase 4.5)
  /** Hitting a big shot: the bodyguard comes for you, the fans film it (more heat), and it's news. */
  private entourageReacts(n: NpcSimData, byPlayer: string) {
    const def = NPC_DEFS[n.kind];
    if (!def.bigShot) return;
    if (n.robbedT < 0 && n.robbed) n.robbedT = 0;
    for (const o of this.npcs.values()) {
      if (o.leader !== n.id || o.state === "ko") continue;
      if (o.kind === "bodyguard") { o.state = "chase"; o.target = byPlayer; o.chaseT = 0; this.say(o, NPC_DEFS.bodyguard.lines.fight, true); }
      else if (o.kind === "fan" && o.state !== "film") {
        o.state = "film"; o.stateT = 4; o.target = byPlayer;
        this.say(o, NPC_DEFS.fan.lines.film, true);
        this.host.addNotoriety(byPlayer, 8);
      }
    }
    this.host.npcEvent({ t: "bigShot", npc: n.id, kind: n.kind, stage: "hit", x: n.move.x, z: n.move.z, by: byPlayer });
  }

  /** The big shot in town right now (if any). */
  activeBigShot(): NpcSimData | undefined {
    for (const n of this.npcs.values()) if (NPC_DEFS[n.kind].bigShot) return n;
    return undefined;
  }

  /**
   * New scavenge: any big shot (and entourage) goes home. By day the first one comes after
   * BIG_SHOT_FIRST; at NIGHT one usually shows up within seconds (Blake: more likely at night).
   */
  resetBigShots(night: boolean) {
    for (const n of [...this.npcs.values()]) if (NPC_DEFS[n.kind].bigShot || n.kind === "bodyguard" || n.kind === "fan") this.npcs.delete(n.id);
    this.bigShotT = night ? (this.rng() < 0.8 ? 4 + this.rng() * 8 : 25 + this.rng() * 10) : BIG_SHOT_FIRST;
    this.nightMode = night;
  }
  /** at night the next big shot comes sooner */
  nightMode = false;

  /** Bring a big shot (+ entourage) to town, somewhere nobody is looking. */
  spawnBigShot(kind?: NpcKind): NpcSimData | null {
    const kinds = BIG_SHOTS;
    const k = kind ?? pickWeighted(kinds.map((x) => [x, NPC_DEFS[x].bigShot!.weight] as [NpcKind, number]), () => this.rng());
    const players = this.host.playersForNpcs().filter((p) => p.connected);
    const nodes = this.graph.filter((g) => players.every((p) => Math.hypot(p.x - g.x, p.z - g.z) >= 30) && Math.abs(g.x) < 78 && Math.abs(g.z) < 78); // downtown (inside ring B)
    const pool = nodes.length ? nodes : this.graph;
    if (!pool.length) return null;
    const g = pool[Math.floor(this.rng() * pool.length)];
    const n = this.spawn(k);
    if (!n) return null;
    n.move = makeMoveState(g.x, g.z, this.rng() * Math.PI * 2);
    n.node = g.id; n.prevNode = g.id; n.node = this.pickNext(n);
    n.state = "walk"; n.lifeT = 0; n.robbedT = -1; n.pace = 0.9; n.lane = 0;
    const b = NPC_DEFS[k].bigShot!;
    for (let i = 0; i < (b.followers ?? 0); i++) {
      const f = this.spawn(b.follower!);
      if (!f) break;
      f.move = makeMoveState(g.x + (i ? 1 : -1) * 0.9, g.z - 1, n.move.yaw);
      f.leader = n.id; f.state = "follow"; f.lane = i % 2 ? 0.9 : -0.9; f.robbed = f.kind === "fan"; f.node = g.id;
    }
    this.say(n, NPC_DEFS[k].lines.idle, true);
    this.host.npcEvent({ t: "bigShot", npc: n.id, kind: k, stage: "arrive", x: g.x, z: g.z, by: "" });
    return n;
  }

  /** Schedule big shots; send them home after a while (or after they've been robbed). */
  private bigShots(dt: number) {
    const b = this.activeBigShot();
    const players = this.host.playersForNpcs().filter((p) => p.connected);
    if (!b) {
      if (!players.length || !this.graph.length) return;
      this.bigShotT -= dt;
      if (this.bigShotT <= 0) { this.spawnBigShot(); this.bigShotT = (BIG_SHOT_GAP[0] + this.rng() * (BIG_SHOT_GAP[1] - BIG_SHOT_GAP[0])) * (this.nightMode ? 0.4 : 1); }
      return;
    }
    b.lifeT += dt;
    if (b.robbedT >= 0) b.robbedT += dt;
    const done = b.robbedT > 20 || b.lifeT > BIG_SHOT_STAY;
    const nobodyNear = players.every((p) => Math.hypot(p.x - b.move.x, p.z - b.move.z) > 35);
    if (done && (nobodyNear || b.lifeT > BIG_SHOT_STAY + 40)) {
      this.npcs.delete(b.id);
      for (const o of [...this.npcs.values()]) if (o.leader === b.id) {
        o.leader = "";
        // the entourage wanders off with the crowd rules (they vanish once nobody's near)
        if (o.state === "follow") o.state = "walk";
        if (players.every((p) => Math.hypot(p.x - o.move.x, p.z - o.move.z) > 30)) this.npcs.delete(o.id);
      }
      if (b.robbedT < 0) this.host.npcEvent({ t: "bigShot", npc: b.id, kind: b.kind, stage: "gone", x: b.move.x, z: b.move.z, by: "" });
    }
    // leftover entourage from earlier big shots: gone once nobody's around
    for (const o of [...this.npcs.values()]) {
      if ((o.kind === "bodyguard" || o.kind === "fan") && !o.leader && o.state !== "chase" && o.state !== "windup" && players.every((p) => Math.hypot(p.x - o.move.x, p.z - o.move.z) > 30)) this.npcs.delete(o.id);
    }
  }

  /** Everyone nearby freaks out; influencers start filming (double notoriety). */
  /**
   * C4b: a noise at (x, z) heard r metres away. If the old lady's home is in earshot and she's asleep, she
   * wakes up, leans out of her window yelling (and calls the cops on whoever did it). Returns her id if she woke.
   */
  /** C5c: the bank's alarm: every bank guard comes after whoever set it off */
  guardsAlert(byPlayer: string, kind: NpcKind = "bank_guard") {
    for (const n of this.npcs.values()) {
      if (n.kind !== kind || n.state === "ko") continue;
      n.state = "chase"; n.target = byPlayer; n.chaseT = 0;
      this.say(n, NPC_DEFS[kind].lines.fight ?? NPC_DEFS[kind].lines.hit, true);
    }
  }

  wakeOldLady(byPlayer: string, x: number, z: number, r: number): string {
    for (const n of this.npcs.values()) {
      if (n.kind !== "old_lady" || n.state !== "sleep" || !n.post) continue;
      if (Math.hypot(n.post.x - x, n.post.z - z) > r + OLD_LADY.hearing) continue;
      n.state = "yell"; n.stateT = OLD_LADY.yellTime; n.target = byPlayer;
      this.say(n, NPC_DEFS.old_lady.lines.yell, true);
      this.host.addNotoriety(byPlayer, OLD_LADY.heat);
      this.host.npcEvent({ t: "oldLady", npc: n.id, p: byPlayer });
      return n.id;
    }
    return "";
  }

  /** C4a: a loud noise nearby: walkers stop and look (and some say so). */
  startle(x: number, z: number, r: number) {
    for (const o of this.npcs.values()) {
      if (SPECIAL_KINDS.has(o.kind) || o.state !== "walk") continue;
      if (Math.hypot(o.move.x - x, o.move.z - z) > r) continue;
      o.state = "idle"; o.stateT = 1.2 + this.rng();
      o.move.yaw = Math.atan2(x - o.move.x, z - o.move.z);
      if (this.rng() < 0.3) this.say(o, STARTLED);
    }
  }

  private panicBystanders(victim: NpcSimData, byPlayer: string) {
    for (const o of this.npcs.values()) {
      if (o === victim || SPECIAL_KINDS.has(o.kind) || o.state === "ko" || o.state === "chase" || o.state === "windup") continue;
      const d = Math.hypot(o.move.x - victim.move.x, o.move.z - victim.move.z);
      if (d > 12) continue;
      if (o.kind === "influencer" && o.state !== "flee") {
        o.state = "film"; o.stateT = 4; o.target = byPlayer;
        this.say(o, NPC_DEFS.influencer.lines.film, true);
        this.host.addNotoriety(byPlayer, 10);
      } else if (!NPC_DEFS[o.kind].fighter) {
        if (o.state !== "flee") { this.startFlee(o, victim.move.x, victim.move.z, byPlayer, 3); this.host.npcEvent({ t: "panic", npc: o.id }); }
        if (this.rng() < 0.3) this.say(o, BYSTANDER_SCREAMS);
      }
    }
  }

  // ------------------------------------------------------------------ thinking + moving
  /** seconds of NPC time (R7: the Champ's punch window) */
  time = 0;
  tick(dt: number) {
    this.time += dt;
    this.acc += dt;
    while (this.acc >= NPC_STEP) {
      this.acc -= NPC_STEP;
      this.step(NPC_STEP);
    }
  }

  /** R12.5 (scalable city): the step counter (which third of the far walkers updates this step) */
  private stepN = 0;
  private step(dt0: number) {
    this.bigShots(dt0);
    const gone: NpcSimData[] = [];
    const players = this.host.playersForNpcs();
    const pById = new Map(players.map((p) => [p.id, p]));
    const slot = this.stepN++ % NPC_LOD.every;
    for (const n of this.npcs.values()) {
      // R12.5: simulation levels. A plain passer-by just walking or idling more than NPC_LOD.far m from EVERY player
      // (in multiplayer the one next to your friend counts as near) updates on one step in NPC_LOD.every (staggered by
      // its id, so they don't all land on one step), taking the whole elapsed time in one go: its timers and its walk
      // keep their pace, only less often. Anyone else (near anyone, chasing, fleeing, shops, cops, characters) is
      // updated every step as before.
      let dt = dt0;
      // (and never at a kerb: within 1.5 m of a road it's every step, so crossing the road waits for gaps exactly as before)
      if (!SPECIAL_KINDS.has(n.kind) && (n.state === "walk" || n.state === "idle") && !n.leader && !n.detour && farFromAll(n.move.x, n.move.z, players, NPC_LOD.far) && !nearRoad(this.host.arena, n.move.x, n.move.z, 1.5)) {
        n.lodAcc = (n.lodAcc ?? 0) + dt0;
        if ((n.lodSlot ??= hashSlot(n.id)) !== slot) continue;
        dt = n.lodAcc; n.lodAcc = 0;
      } else if (n.lodAcc) { dt = dt0 + n.lodAcc; n.lodAcc = 0; } // (back near: the time it was owed, then every step)
      const def = NPC_DEFS[n.kind];
      if (n.leader && n.state === "walk") n.state = "follow"; // entourage: back to the boss after a fight / panic
      n.sayCd -= dt;
      n.attackCd = Math.max(0, n.attackCd - dt);
      n.taserCd = Math.max(0, n.taserCd - dt);
      if (n.stateT > 0) n.stateT -= dt;
      let tx = n.move.x, tz = n.move.z, speed = 0;
      let face: number | null = null;

      const cop = n.kind === "cop" ? this.host.copBrain(n, dt) : null;
      if (cop) { tx = cop.tx; tz = cop.tz; speed = cop.speed; face = cop.face; }
      else if (n.kind !== "cop") switch (n.state) {
        case "walk": {
          const g = this.graph[n.node], pg = this.graph[n.prevNode];
          // walk slightly to one side of the route line (like a real sidewalk), and start turning
          // toward the next corner a little early so paths curve instead of snapping 90 degrees
          const sx = g.x - pg.x, sz = g.z - pg.z, sl = Math.hypot(sx, sz);
          let ox = sl > 0.01 ? (sz / sl) * n.lane : 0, oz = sl > 0.01 ? (-sx / sl) * n.lane : 0;
          // (a route running close to a wall: walk the middle, not into the wall)
          if ((ox || oz) && (this.solidAt(g.x + ox, g.z + oz, n.move.y, PLAYER.radius + 0.15) || this.solidAt(pg.x + ox, pg.z + oz, n.move.y, PLAYER.radius + 0.15))) { ox = 0; oz = 0; }
          tx = g.x + ox; tz = g.z + oz; speed = def.walk * n.pace;
          // about to step off the curb? wait for a gap in the traffic (and never stand in the road waiting)
          if (this.mustWait(n, tx, tz)) {
            speed = 0; face = Math.atan2(tx - n.move.x, tz - n.move.z);
            n.waitT += dt;
            if (n.waitT > 9) { const k = n.node; n.node = n.prevNode; n.prevNode = k; n.waitT = 0; } // give up, go back the other way
            break;
          }
          n.waitT = 0;
          if (Math.hypot(tx - n.move.x, tz - n.move.z) < 1.3) {
            n.prevNode = n.node;
            n.node = this.pickNext(n);
            if (this.rng() < 0.12) { n.state = "idle"; n.stateT = 1 + this.rng() * 2.5; }
          }
          if (n.sayCd <= 0 && this.rng() < 0.004) this.say(n, def.lines.idle);
          break;
        }
        case "follow": {
          const L = this.npcs.get(n.leader);
          if (!L) { n.state = "walk"; n.leader = ""; break; }
          // a step behind the boss, one to each side
          const fx = Math.sin(L.move.yaw), fz = Math.cos(L.move.yaw);
          tx = L.move.x - fx * 1.3 + fz * n.lane; tz = L.move.z - fz * 1.3 - fx * n.lane;
          const d = Math.hypot(tx - n.move.x, tz - n.move.z);
          speed = d < 0.4 ? 0 : Math.min(def.flee, Math.max(L.curSpeed, d * 1.6));
          if (L.state === "flee") speed = def.flee;
          if (n.sayCd <= 0 && this.rng() < 0.004) this.say(n, def.lines.idle);
          break;
        }
        case "idle": {
          // glance around now and then instead of standing frozen
          n.lookT -= dt;
          if (n.lookT <= 0) { n.lookT = 0.8 + this.rng() * 1.6; n.lookYaw = n.move.yaw + (this.rng() - 0.5) * 2.2; }
          face = n.lookYaw;
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "film": {
          const p = pById.get(n.target);
          if (p) face = Math.atan2(p.x - n.move.x, p.z - n.move.z);
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "stunned": {
          if (n.stateT <= 0 && n.kind === "raccoon") { n.state = "scram"; break; }
          if (n.stateT <= 0) {
            if (def.fighter && n.target) { n.state = "chase"; n.chaseT = 0; this.say(n, def.lines.fight, true); }
            else this.startFlee(n, n.fromX, n.fromZ, n.target, 3.5);
          }
          break;
        }
        case "flee": {
          const g = this.graph[n.node];
          tx = g.x; tz = g.z; speed = def.flee;
          if (Math.hypot(g.x - n.move.x, g.z - n.move.z) < 0.8) {
            // keep going away from where the trouble was
            const links = g.links.filter((l) => l !== n.prevNode);
            let best = links[0] ?? n.prevNode, bestD = -1;
            for (const l of links) { const q = this.graph[l]; const d = Math.hypot(q.x - n.fromX, q.z - n.fromZ); if (d > bestD) { bestD = d; best = l; } }
            n.prevNode = n.node; n.node = best;
          }
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "chase": {
          const p = pById.get(n.target);
          n.chaseT += dt;
          if (!p || !(p.connected || (n.kind === "champ" && p.inCell)) || p.knocked || n.chaseT > CHASE_GIVE_UP || Math.hypot(p.x - n.move.x, p.z - n.move.z) > 20) {
            n.state = "huff"; n.stateT = 1.5; n.target = "";
            break;
          }
          tx = p.x; tz = p.z; speed = def.chase ?? 6.5; // (D1: a touch faster than you walk, slower than you sprint)
          if (BOUNCERS.has(n.kind)) { const wp = this.hotWay(n, tx, tz); tx = wp.x; tz = wp.z; } // (R5/R7: out through the door, not through the wall)
          const d = Math.hypot(p.x - n.move.x, p.z - n.move.z);
          if (d < ATTACK_RANGE && n.attackCd <= 0 && !p.immune) { n.state = "windup"; n.stateT = BOUNCERS.has(n.kind) ? MEAT_LOCKER.windup : n.kind === "champ" ? CHAMP.windup : WINDUP; } // (R6: the big two swing fast)
          else if (d < 1.1) speed = 0;
          break;
        }
        case "windup": {
          const p = pById.get(n.target);
          if (p) face = Math.atan2(p.x - n.move.x, p.z - n.move.z);
          if (n.stateT <= 0) {
            n.attackCd = BOUNCERS.has(n.kind) ? MEAT_LOCKER.cooldown : n.kind === "champ" ? CHAMP.cooldown : 0.9;
            let hit = false;
            if (p && !p.knocked && !p.immune) {
              const d = Math.hypot(p.x - n.move.x, p.z - n.move.z);
              const ang = Math.abs(angleDiff(Math.atan2(p.x - n.move.x, p.z - n.move.z), n.move.yaw));
              hit = d < STRIKE_RANGE && ang < 1.2 && Math.abs(p.y - n.move.y) < 1.2;
            }
            this.host.npcEvent({ t: "npcAttack", npc: n.id, p: n.target, hit });
            n.state = "chase";
            // the World decides if that was the knockout blow (and may switch us to "gloat")
            if (hit) this.host.npcHitPlayer(n.id, n.target, false);
          }
          break;
        }
        case "sneak": {
          n.lifeT += dt;
          const t = this.host.raccoonTarget(n.fortSlot);
          if (!t || n.lifeT > 25) { n.state = "scram"; break; } // nothing to steal / took too long
          tx = t.x; tz = t.z; speed = def.walk;
          if (Math.hypot(t.x - n.move.x, t.z - n.move.z) < 0.9 && this.host.raccoonGrab(n.id, t.id)) {
            n.carry = t.id; n.state = "escape";
            this.say(n, def.lines.win, true);
          }
          break;
        }
        case "escape": case "scram": {
          n.lifeT += dt;
          const wp = n.path[0];
          if (!wp) { gone.push(n); break; }
          tx = wp.x; tz = wp.z; speed = n.state === "escape" ? def.flee : def.flee * 1.2;
          if (Math.hypot(wp.x - n.move.x, wp.z - n.move.z) < 1.2) { n.path.shift(); if (!n.path.length) gone.push(n); }
          if (n.lifeT > 60) gone.push(n);
          break;
        }
        case "sit": {
          // R6: the Champ sits on whoever he beat, doing his crossword, until they're up
          const p = pById.get(n.target);
          if (!p || !p.knocked) { n.state = "work"; n.target = ""; break; }
          n.move.x = p.x + 0.15; n.move.z = p.z; n.move.vx = 0; n.move.vz = 0; speed = 0; face = n.move.yaw;
          if (n.sayCd <= 0 && this.rng() < 0.01) this.say(n, def.lines.win);
          break;
        }
        case "sleep": break; // (C4b: the old lady, upstairs: nothing to do until a noise wakes her)
        case "yell": {
          // C4b: leaning out of her window shouting; then she comes down after whoever made the noise
          if (n.stateT > 0) break;
          const p = pById.get(n.target);
          if (p && !p.knocked && Math.hypot(p.x - n.move.x, p.z - n.move.z) < OLD_LADY.chaseFrom) { n.state = "chase"; n.chaseT = 0; this.say(n, def.lines.fight, true); }
          else { n.state = "sleep"; n.target = ""; }
          break;
        }
        case "work": case "cower": {
          const post = n.post;
          if (!post) { n.state = "walk"; break; }
          if (n.kind === "sketchy_steve" && (n.awayT ?? 0) > 0 && n.hide) {
            // R11.4: hiding up the alley till the coast is clear
            n.awayT = Math.max(0, (n.awayT ?? 0) - dt);
            if (Math.hypot(n.hide.x - n.move.x, n.hide.z - n.move.z) > 0.4) { tx = n.hide.x; tz = n.hide.z; speed = def.flee; }
            break;
          }
          if (n.state === "cower" && n.stateT <= 0) n.state = "work";
          if (n.kind === "lep_buddy" && (Math.abs(n.move.y - (post.y ?? 0)) > 1.5 || n.stuckT > 1.5)) { this.popTo(n, post.x, post.y ?? 0, post.z); break; } // (R12.2c: a wee fella stuck on his way home just pops back)
          const d = Math.hypot(post.x - n.move.x, post.z - n.move.z);
          if (d <= 0.3 && n.kind === "old_lady") { n.state = "sleep"; break; } // (back upstairs to bed)
          if (d > 0.3) { tx = post.x; tz = post.z; speed = def.walk; if (BOUNCERS.has(n.kind)) { const wp = this.hotWay(n, tx, tz); tx = wp.x; tz = wp.z; speed = 2.4; } } else face = post.yaw;
          if (n.kind === "uncle_dumpster") {
            // C5a: his tips, in order, whenever somebody's close enough to hear
            if (n.sayCd <= 0 && players.some((p) => Math.hypot(p.x - n.move.x, p.z - n.move.z) < 7 && Math.abs(p.y - n.move.y) < 3)) {
              const tips = def.lines.idle;
              n.tip = ((n.tip ?? -1) + 1) % tips.length;
              this.host.npcEvent({ t: "npcSay", npc: n.id, line: tips[n.tip] });
              n.sayCd = 7;
            }
          } else if (n.state === "work" && n.sayCd <= 0 && this.rng() < 0.002) {
            // greet customers who come near
            if (players.some((p) => Math.hypot(p.x - n.move.x, p.z - n.move.z) < 5)) this.say(n, def.lines.idle);
          }
          break;
        }
        case "gloat": if (n.stateT <= 0) { n.state = n.post ? "work" : "walk"; n.target = ""; } break;
        case "huff": if (n.stateT <= 0) n.state = n.post ? "work" : "walk"; break;
        case "ko":
          if (n.stateT > 0) break;
          if (BOUNCERS.has(n.kind) || n.kind === "champ") { n.hp = def.hp; n.state = "work"; n.target = ""; this.say(n, def.lines.fight, true); break; } // (R5/R6: back on their feet, back to their post)
          this.startFlee(n, n.move.x + 1, n.move.z, n.target, 3); break;
      }

      // a blocked car asked us to get off the road: step onto the sidewalk first
      if (n.detour) {
        n.detour.t -= dt;
        const d = n.detour;
        if (d.t <= 0 || Math.hypot(d.x - n.move.x, d.z - n.move.z) < 0.5) n.detour = null;
        else if (n.state === "ko" || n.state === "stunned") {
          // lying in the road: slid gently to the curb (never into a wall)
          const dx = d.x - n.move.x, dz = d.z - n.move.z, l = Math.hypot(dx, dz), step = Math.min(l, 1.5 * dt);
          this.nudge(n.move, (dx / l) * step, (dz / l) * step);
        } else if (n.kind !== "cop" || n.state === "leave" || n.state === "patrol" || n.state === "beat") {
          tx = d.x; tz = d.z; speed = Math.max(speed, NPC_DEFS[n.kind].walk * 1.4); face = null;
        }
      }

      // steer toward (tx, tz) using the same movement rules as players
      const m = n.move;
      const dx = tx - m.x, dz = tz - m.z;
      const dist = Math.hypot(dx, dz);
      let wantYaw = face ?? (dist > 0.05 ? Math.atan2(dx, dz) : m.yaw);
      // walk around parked cars, benches, bins... instead of pushing into them (chasers and
      // fleeing people head straight for their target, so the route map alone doesn't cover them)
      if (face === null && speed > 0 && dist > 0.6 && n.state !== "ko" && n.state !== "stunned") wantYaw = this.avoid(n, wantYaw, dist, dt);
      const urgent = n.state === "chase" || n.state === "flee" || n.state === "escape" || n.state === "scram" || n.state === "sneak" || n.kind === "cop";
      m.yaw = turnToward(m.yaw, wantYaw, (urgent ? 8 : n.state === "idle" ? 2 : 3.2) * dt);
      // slow down while turning sharply, and ease speed up/down (no instant starts/stops)
      const err = Math.abs(angleDiff(wantYaw, m.yaw));
      const want = dist > 0.05 ? speed * Math.max(0.3, Math.cos(Math.min(err, Math.PI / 2))) : 0;
      const accel = urgent ? 9 : 2.5;
      n.curSpeed += Math.max(-accel * dt * 1.5, Math.min(accel * dt, want - n.curSpeed));
      m.carryMul = n.curSpeed / PLAYER.walkSpeed;
      const input: MoveInput = { seq: 0, mx: 0, mz: n.curSpeed > 0.05 ? 1 : 0, yaw: m.yaw, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false };
      if (n.state === "ko" || n.state === "stunned") { input.mz = 0; n.curSpeed = 0; }
      stepMovement(m, input, this.host.arena, dt);

      // watchdog: a walker that hasn't got 2 m anywhere in 12 s (e.g. dithering at a corner) re-routes
      if (n.state === "walk" && speed > 0) {
        n.progT += dt;
        if (Math.hypot(m.x - n.progX, m.z - n.progZ) > 2) { n.progX = m.x; n.progZ = m.z; n.progT = 0; }
        else if (n.progT > 12) {
          n.progT = 0; n.lane = 0;
          n.node = this.nearestClearNode(m.x, m.z, n.node);
          n.prevNode = n.node;
        }
      } else { n.progX = m.x; n.progZ = m.z; n.progT = 0; }

      // stuck? (walked into something for too long) -> pick another route
      if (speed > 0) {
        if (dist > n.lastDist - 0.01) n.stuckT += dt; else n.stuckT = 0;
        n.lastDist = dist;
        if (n.stuckT > 2.5) {
          n.stuckT = 0; n.lastDist = 99;
          n.avoidSide = -n.avoidSide; n.avoidT = 1.5; // try going round the other way
          if (n.kind === "raccoon") { m.vx += (this.rng() - 0.5) * 4; m.vz += (this.rng() - 0.5) * 4; } // wiggle free
          else if (n.kind === "cop") { n.path = []; if (n.state === "chase") { n.state = "search"; n.lostT = 0; } } // re-plan a route
          else if (n.state === "chase") { n.state = "huff"; n.stateT = 1.5; n.target = ""; } // can't reach you: give up
          else n.node = this.nearestClearNode(m.x, m.z, n.node);
        }
      }
    }
    for (const n of gone) {
      if (!this.npcs.has(n.id)) continue;
      this.npcs.delete(n.id);
      this.host.raccoonGone(n.id, n.carry, n.fortSlot);
    }
    this.separate();
  }

  /** Raccoons still out and about (the event ends when they're all gone). */
  raccoonCount() { let c = 0; for (const n of this.npcs.values()) if (n.kind === "raccoon") c++; return c; }

  /** Send every raccoon running (end of round). Carried loot is dropped where they stand. */
  clearRaccoons() {
    for (const n of [...this.npcs.values()]) {
      if (n.kind !== "raccoon") continue;
      if (n.carry) this.host.npcDropCarried(n.carry, n.move.x, n.move.y + 0.8, n.move.z, 0, 0);
      this.npcs.delete(n.id);
    }
  }

  /** Called by the World when a chasing NPC's hit knocks a player down. */
  /** R6: the Champ won: he sits on you */
  sitOn(npcId: string, pid: string) {
    const n = this.npcs.get(npcId);
    if (!n) return;
    n.state = "sit"; n.target = pid; n.stateT = 99;
    this.say(n, NPC_DEFS[n.kind].lines.win, true);
  }

  gloat(npcId: string) {
    const n = this.npcs.get(npcId);
    if (!n) return;
    n.state = "gloat"; n.stateT = 2;
    this.say(n, NPC_DEFS[n.kind].lines.win, true);
  }

  /** Standing on the road surface (not the sidewalk)? */
  onRoad(x: number, z: number, pad = 0): boolean {
    return onRoadAt(this.host.arena, x, z, pad);
  }

  /** A walker about to step off the curb waits while a car is coming (or parked across the crossing). */
  private mustWait(n: NpcSimData, tx: number, tz: number): boolean {
    const m = n.move;
    if (this.onRoad(m.x, m.z)) return false; // already crossing: keep going (cars stop for you)
    const dx = tx - m.x, dz = tz - m.z, l = Math.hypot(dx, dz);
    if (l < 0.01) return false;
    const ax = m.x + (dx / l) * 1.2, az = m.z + (dz / l) * 1.2;
    if (!this.onRoad(ax, az)) return false;
    // the crossing: from here to where the road ends along our path (roads are ~8 m wide)
    for (const c of this.host.cars()) {
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      for (let k = 1; k <= 9; k += 2) {
        const px = m.x + (dx / l) * k, pz = m.z + (dz / l) * k;
        const rx = px - c.x, rz = pz - c.z;
        const along = rx * fx + rz * fz, side = rx * fz - rz * fx;
        if (Math.abs(along) < 3.2 && Math.abs(side) < 1.8) return true; // a car sits on the crossing
        if (c.v > 0.5 && along > 0 && along < 6 + c.v * 1.6 && Math.abs(side) < 1.8) return true; // one is coming
      }
    }
    return false;
  }

  /** A car has been stuck behind this pedestrian: get them off the road (to the nearest clear sidewalk spot). */
  clearRoad(id: string, carYaw: number, carX: number, carZ: number) {
    const n = this.npcs.get(id);
    if (!n || n.detour) return;
    // (C1: try all round, nearest first: the nearest pavement you can walk to without going past the car's nose)
    const fx = Math.sin(carYaw), fz = Math.cos(carYaw);
    let best: { x: number; z: number } | null = null, bestD = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      for (let d = 1; d <= 9; d += 0.5) {
        const x = n.move.x + dx * d, z = n.move.z + dz * d;
        if (this.solidAt(x, z, n.move.y, PLAYER.radius)) break;
        // never through or in front of the car
        let hits = false;
        const side0 = Math.abs((n.move.x - carX) * fz - (n.move.z - carZ) * fx);
        for (let t = 0.1; t <= 1; t += 0.1) {
          const px = n.move.x + dx * d * t - carX, pz = n.move.z + dz * d * t - carZ;
          const along = px * fx + pz * fz, side = Math.abs(px * fz - pz * fx);
          if (side < 1.6 && side <= side0 + 0.01 && along > -2.8 && along < 4.5) { hits = true; break; } // (stepping away sideways is fine)
        }
        if (hits) break;
        if (this.onRoad(x, z, 0.4)) continue;
        if (d < bestD) { bestD = d; best = { x, z }; }
        break;
      }
    }
    if (best) n.detour = { x: best.x, z: best.z, t: 6 };
  }

  /** Is anything solid (car, bench, wall...) at body height around this point? */
  private solidAt(x: number, z: number, y: number, r: number): boolean {
    for (const b of nearBoxes(this.host.arena, x, z, r + 1)) {
      if (b.y + b.h / 2 <= y + PLAYER.stepHeight || b.y - b.h / 2 >= y + 1.6) continue; // steppable / overhead
      if (inFoot(b, x, z, r)) return true;
    }
    return false;
  }

  /** Straight walk from a to b doesn't hit anything? */
  lineClear(ax: number, az: number, bx: number, bz: number, y: number): boolean {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i <= steps; i++) if (this.solidAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, y, PLAYER.radius)) return false;
    return true;
  }

  /**
   * Feelers: if the way ahead is blocked, turn to the first clear direction (keeping to one side
   * while going round the same obstacle). Cheap: two probe points per try, grid-culled boxes.
   */
  private avoid(n: NpcSimData, yaw: number, dist: number, dt: number): number {
    const m = n.move, r = PLAYER.radius + 0.12;
    const look = Math.min(1.3, dist);
    const clear = (a: number) => !this.solidAt(m.x + Math.sin(a) * look * 0.5, m.z + Math.cos(a) * look * 0.5, m.y, r)
      && !this.solidAt(m.x + Math.sin(a) * look, m.z + Math.cos(a) * look, m.y, r);
    n.avoidT = Math.max(0, n.avoidT - dt);
    if (clear(yaw)) return yaw;
    // choose a side once, and keep it while the way stays blocked (re-choosing every frame dithers)
    if (n.avoidT <= 0) n.avoidSide = clear(yaw + 0.8) || !clear(yaw - 0.8) ? 1 : -1;
    n.avoidT = 1.2;
    for (const side of [n.avoidSide, -n.avoidSide]) {
      for (const off of [0.45, 0.9, 1.35, 1.7, 2.1, 2.6]) {
        if (clear(yaw + side * off)) { n.avoidSide = side; return yaw + side * off; }
      }
    }
    return yaw;
  }

  /** Nearest route point we can actually walk to in a straight line (falls back to nearest). */
  nearestClearNode(x: number, z: number, avoid: number): number {
    const y = 0;
    const order = this.graph.filter((g) => g.id !== avoid).map((g) => ({ g, d: Math.hypot(g.x - x, g.z - z) })).sort((a, b) => a.d - b.d);
    for (const { g, d } of order.slice(0, 8)) if (d < 30 && this.lineClear(x, z, g.x, g.z, y)) return g.id;
    return order[0]?.g.id ?? 0;
  }

  /** Move a pedestrian sideways a little, unless that would put them into a wall. (Cars shove people with this too.) */
  nudge(m: MoveState, dx: number, dz: number) {
    const x = m.x + dx, z = m.z + dz, r = PLAYER.radius;
    for (const b of nearBoxes(this.host.arena, x, z, 1)) {
      if (b.y + b.h / 2 <= m.y + 0.35 || b.y - b.h / 2 >= m.y + 1.6) continue; // curbs / overhead
      if (inFoot(b, x, z, r)) return;
    }
    m.x = x; m.z = z;
  }

  /** Pedestrians gently push apart so crowds don't stack into one blob. */
  private separate() {
    const list = [...this.npcs.values()];
    // step aside for players (they don't walk through you any more); knocked-out people stay put
    for (const p of this.host.playersForNpcs()) {
      if (!p.connected) continue;
      for (const n of list) {
        if (n.state === "ko" || n.state === "sleep" || n.state === "yell") continue; // (C4b: the old lady's upstairs)
        const dx = n.move.x - p.x, dz = n.move.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 > 0.56 || d2 < 1e-8 || Math.abs(n.move.y - p.y) > 1.2) continue;
        const d = Math.sqrt(d2), push = (0.75 - d) * 0.6;
        this.nudge(n.move, (dx / d) * push, (dz / d) * push);
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].move, b = list[j].move;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.64 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
        this.nudge(a, -(dx / d) * push, -(dz / d) * push);
        this.nudge(b, (dx / d) * push, (dz / d) * push);
      }
    }
  }

  /** Keep the crowd fresh: robbed pedestrians far from everyone are replaced by new ones. */
  recycle() {
    const players = this.host.playersForNpcs();
    for (const n of [...this.npcs.values()]) {
      if (SPECIAL_KINDS.has(n.kind) || !n.robbed || n.state === "chase" || n.state === "windup") continue;
      if (players.every((p) => Math.hypot(p.x - n.move.x, p.z - n.move.z) > 30)) this.npcs.delete(n.id);
    }
    const walkers = () => { let c = 0; for (const n of this.npcs.values()) if (!SPECIAL_KINDS.has(n.kind)) c++; return c; };
    while (walkers() < this.target) if (!this.spawn(undefined, true)) break;
  }
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(cur: number, want: number, maxStep: number) {
  const d = angleDiff(want, cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
