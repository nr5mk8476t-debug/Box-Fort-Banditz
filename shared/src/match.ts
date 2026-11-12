// Phase 5A: the cycle loop. Runs inside the World (host browser + solo).
//
//   lobby --START--> [ intro (5 s) -> scavenge (5.5 min, day) -> dusk (30 s sunset, still playing) -> night (2 min)
//                      -> dawn (results) -> shop (60 s, pawn shop) -> upgrades (60 s) ] x 3 -> over
// R12.3 (Blake: "instead of a day cycle, then a night cycle... day turning into night, 8 minutes for the whole
// scavenge"): one 8-minute scavenge. The sun goes down while you play (no city wipe at dusk, you keep what you
// carry); night tops the city up with x2 loot, turns fort raids on, and the cops get tougher.
//
// Banking: loot resting in YOUR fort yard locks in 10 s after you drop it there (anyone can steal it
// back before that). At NIGHT even locked loot can be taken (fort raids). When a scavenge ends,
// anything you carry while away from home is LOST; carried at home = dropped into your yard.
// Loot in your fort is only turned into cash by selling it to the pawn shop; unsold loot is lost.
// Small money (coins, cash, wallets) goes straight into your cash when you pick it up.
// 5A ending (temporary, until the Mayor race): after 3 cycles the richest bandit wins.
import { fortAt } from "./arena.js";
import type { World, ItemSim, PlayerSim } from "./world.js";
import { hyp } from "./fmath.js";

export type MatchPhase = "lobby" | "intro" | "scavenge" | "dusk" | "night" | "dawn" | "shop" | "upgrades" | "over";
export type CityEventKind = "airdrop" | "truck" | "happyhour" | "raccoons" | "parade" | "festa";
/** C5b: the dragon parade: walking pace, how far behind the head each of the dragon's body segments is, red envelopes every few metres */
export const PARADE = { speed: 1.6, segments: 9, gap: 1.15, envelopeEvery: 2.6, push: 5.5, r: 1.0 };
/**
 * R4: LITTLE ITALY'S FESTA (Chinatown's dragon parade's twin, picked by Blake): one of three, up Leftovers Avenue.
 *  0 THE GIANT MEATBALL ROLL: a huge meatball rolls down the street (it knocks you flat), chefs chasing it.
 *  1 THE ACCORDION BAND: a marching band; anyone near it gets the dance buff (stamina refills fast).
 *  2 THE GONDOLA-ON-WHEELS: a singing gondolier on a trailer, splashing "canal water" (you slip).
 * Each drops a money pick-up as often, and worth the same, as the dragon's red envelopes (so neither district pays more).
 */
export const FESTA = {
  speed: [2.6, 1.4, 1.6], segments: [2, 4, 3], gap: [1.6, 1.3, 1.6], dropEvery: 2.6, push: 5.5, r: [1.5, 0.8, 1.2],
  drop: ["golden_meatball", "tip_coins", "golden_rose"], names: ["THE GIANT MEATBALL ROLL", "THE ACCORDION BAND", "THE GONDOLA-ON-WHEELS"],
  /** the band's dance buff: how near, how fast stamina comes back */
  danceR: 7, danceRate: 0.7,
  /** the gondola's splash: how near, how often */
  splashR: 3.5, splashEvery: 3,
};

export const CYCLES = 3;
/** (kept for older code: a "round" is now a whole cycle) */
export const ROUNDS = CYCLES;
export const ROUND_TIME = 330;
export const NIGHT_TIME = 120;
export const INTRO_TIME = 5;
export const DUSK_TIME = 30;
/** R12.3: the whole scavenge (day + sunset + night) */
export const SCAVENGE_TOTAL = ROUND_TIME + DUSK_TIME + NIGHT_TIME;
export const DAWN_TIME = 8;
export const SHOP_TIME = 60;
export const UPGRADE_TIME = 60;
export const LOCK_TIME = 10;
export const HOME_WARNING = 30;
export const NIGHT_WARNING = 30;
/** kept for older tests: the results pause after the night round */
export const TALLY_TIME = DAWN_TIME;

export const TRUCK_SPEED = 8;
export const TRUCK_LEN = 5.5;
export const TRUCK_WIDTH = 2.6;
export const HAPPY_HOUR_TIME = 30;
const EVENT_WARN = 5;
/** R4: the dragon parade and the festa announce themselves longer: their street closes to traffic meanwhile */
const PARADE_WARN = 10;
const warnOf = (k: string) => (k === "happyhour" ? 3 : k === "parade" || k === "festa" ? PARADE_WARN : EVENT_WARN);

export interface RoundLine {
  id: string; name: string; colorIdx: number;
  banked: number; bankedValue: number; // loot sitting in your fort (to sell at the pawn shop)
  lost: number; lostValue: number; // carried outside the fort at time-up (+ unsold at the shop)
  stolen: number; // items raccoons got away with
  cash: number; // cash so far
  aura: number; // C4b: aura points (tags); the race for Mayor uses them later
}

/** What clients need to show the current event. */
export interface EventView {
  kind: CityEventKind | "";
  stage: "warn" | "live" | "";
  x: number; z: number; r: number; // marker / zone
  timeLeft: number;
  // garbage truck
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
  /** C5b: how far the dragon's head has walked along Chinatown's route (-1 = no parade) */
  paradeD: number;
  /** R4: Little Italy's festa: how far along (-1 = none), which one */
  festaD: number; festaV: number;
}

interface ActiveEvent {
  kind: CityEventKind;
  stage: "warn" | "live";
  t: number; // time in this stage
  x: number; z: number; r: number;
  // truck
  ax?: number; az?: number; bx?: number; bz?: number; dist?: number;
  crate?: string;
}

const DEFAULT_HAPPY_ZONES = [
  { x: 0, z: 0, r: 13, name: "the Plaza" },
  { x: 26, z: 26, r: 12, name: "the North-East block" },
  { x: -26, z: 26, r: 12, name: "the North-West block" },
  { x: 26, z: -26, r: 12, name: "the South-East block" },
  { x: -26, z: -26, r: 12, name: "the South-West block" },
];
/** Garbage truck routes: the ring road in front of the forts (N, S, E, W), driven end to end. */
const DEFAULT_TRUCK_ROUTES = [
  { name: "NORTH", ax: -47, az: 42, bx: 47, bz: 42 },
  { name: "SOUTH", ax: 47, az: -42, bx: -47, bz: -42 },
  { name: "EAST", ax: 42, az: 47, bx: 42, bz: -47 },
  { name: "WEST", ax: -42, az: -47, bx: -42, bz: 47 },
];
const DEFAULT_AIRDROP_SPOTS: [number, number][] = [[7, 7], [-7, 7], [7, -7], [-7, -7], [0, 9], [9, 0], [0, -9], [-9, 0]];

export class MatchSystem {
  phase: MatchPhase = "lobby";
  round = 0;
  timeLeft = 0;
  results: RoundLine[] = [];
  /** players who pressed READY in the shop / upgrades round (all ready = skip ahead) */
  readonly ready = new Set<string>();
  private warned = false;
  private plan: { at: number; kind: CityEventKind }[] = [];
  private lost = new Map<string, { n: number; v: number }>();
  ev: ActiveEvent | null = null;
  truck = { on: false, x: 0, z: 0, yaw: 0 };
  /** C5b: the dragon parade (distance walked; -1 = not on) */
  paradeD = -1;
  private nextEnvelope = 0;
  /** R4: Little Italy's festa (distance; -1 = not on) and which one (see FESTA) */
  festaD = -1;
  festaV = 0;
  private nextDrop = 0;
  private splashT = 0;

  constructor(private w: World) {}

  // event geometry comes from the city layout (falls back to the old small city's values)
  private get truckRoutes() { return this.w.arena.truckRoutes ?? DEFAULT_TRUCK_ROUTES; }
  private get happyZones() { return this.w.arena.happyZones ?? DEFAULT_HAPPY_ZONES; }
  private get airdropSpots() { return this.w.arena.airdropSpots ?? DEFAULT_AIRDROP_SPOTS; }

  /** Night: dark city, x2 loot, tougher cops, fort raids. (R12.3: the sunset before it is still day for the rules) */
  get night() { return this.phase === "night"; }
  /** A scavenge is running (day, sunset or night). */
  get scavenging() { return this.phase === "scavenge" || this.phase === "dusk" || this.phase === "night"; }
  /** R12.3: seconds left in the whole 8-minute scavenge (0 outside one) */
  get scavengeLeft() { return this.phase === "scavenge" ? this.timeLeft + DUSK_TIME + NIGHT_TIME : this.phase === "dusk" ? this.timeLeft + NIGHT_TIME : this.phase === "night" ? this.timeLeft : 0; }
  /** R12.3: 0 = day .. 1 = night (the sunset in between) */
  get darkness() { return this.phase === "night" ? 1 : this.phase === "dusk" ? Math.max(0, Math.min(1, 1 - this.timeLeft / DUSK_TIME)) : 0; }

  /** Host pressed START (also used to restart after the final results). */
  start(): boolean {
    if (this.phase !== "lobby" && this.phase !== "over") return false;
    this.w.pubGames?.voidAll("The match is starting: game called off, stakes back."); // (R12.3: before the cash resets)
    for (const p of this.w.players.values()) { p.cash = 0; p.gear = { pick: 0, smoke: 0 }; } // (R12.6: and WEE MICKEY's gear)
    this.w.lobby.matchStart(); // (C5a: off the roof; aura starts at 0)
    this.w.pubBoard.length = 0; // (R12.1: a clean chalkboard every match)
    this.w.gch = null; // (R12.6: and no challenge left over)
    this.round = 0;
    this.results = [];
    this.nextCycle();
    return true;
  }

  get elapsed() { return this.phase === "scavenge" ? ROUND_TIME - this.timeLeft : 0; }

  private nextCycle() {
    this.round++;
    this.phase = "intro";
    this.timeLeft = INTRO_TIME;
    this.warned = false;
    this.ready.clear();
    this.lost.clear();
    this.w.resetCity(false);
    this.w.emit({ t: "round", phase: "intro", round: this.round });
  }

  private go(phase: MatchPhase, time: number) {
    this.phase = phase;
    this.timeLeft = time;
    this.warned = false;
    this.ready.clear();
    this.w.emit({ t: "round", phase, round: this.round });
  }

  tick(dt: number) {
    if (this.phase === "lobby") return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    switch (this.phase) {
      case "intro":
        if (this.timeLeft <= 0) { this.go("scavenge", ROUND_TIME); this.planEvents(); }
        break;
      case "scavenge":
        this.bankTick(dt);
        this.eventTick(dt);
        if (this.timeLeft <= 0) this.go("dusk", DUSK_TIME); // (R12.3: the sun starts going down; nothing's lost, nothing's wiped)
        break;
      case "dusk":
        this.bankTick(dt);
        this.eventTick(dt);
        if (this.timeLeft <= 0) { this.stopEvent(); this.go("night", NIGHT_TIME); this.w.nightFalls(); }
        break;
      case "night":
        this.bankTick(dt);
        if (!this.warned && this.timeLeft <= NIGHT_WARNING) { this.warned = true; this.w.emit({ t: "round", phase: "hurry", round: this.round }); }
        if (this.timeLeft <= 0) this.endScavenge(true);
        break;
      case "dawn":
        if (this.timeLeft <= 0) this.openShop();
        break;
      case "shop":
        this.skipIfReady();
        if (this.timeLeft <= 0) this.closeShop();
        break;
      case "upgrades":
        this.skipIfReady();
        if (this.timeLeft <= 0) this.nextCycle();
        break;
    }
  }

  /** READY in the shop / upgrades round. */
  setReady(p: PlayerSim) {
    if (this.phase !== "shop" && this.phase !== "upgrades") return;
    this.ready.add(p.id);
  }

  private skipIfReady() {
    const on = [...this.w.players.values()].filter((p) => p.connected);
    if (on.length && on.every((p) => this.ready.has(p.id))) this.timeLeft = Math.min(this.timeLeft, 1);
  }

  // ---------------------------------------------------------------- banking
  ownerOf(slot: number): PlayerSim | undefined {
    if (slot < 0) return undefined;
    for (const p of this.w.players.values()) if (p.colorIdx === slot) return p;
    return undefined;
  }

  private bankTick(dt: number) {
    for (const it of this.w.items.values()) {
      if (it.mode !== "free") { it.bankT = 0; it.locked = false; it.fort = -1; continue; }
      const slot = fortAt(this.w.arena, it.body.x, it.body.z);
      if (slot < 0 || !this.ownerOf(slot)) { it.bankT = 0; it.locked = false; it.fort = -1; continue; }
      if (slot !== it.fort) { it.fort = slot; it.bankT = 0; it.locked = false; }
      if (it.locked) continue;
      it.bankT += dt;
      if (it.bankT >= LOCK_TIME) {
        it.locked = true;
        this.w.emit({ t: "banked", item: it.id, p: this.ownerOf(slot)!.id, value: itemWorth(it) });
      }
    }
  }

  /** Value of locked loot sitting in a player's fort right now (live score). */
  bankedValue(p: PlayerSim): number {
    let v = 0;
    for (const it of this.w.items.values()) if (it.locked && it.fort === p.colorIdx) v += itemWorth(it);
    return v;
  }

  /** Everything lying in a player's fort yard (locked or still banking). */
  fortItems(p: PlayerSim): ItemSim[] {
    const out: ItemSim[] = [];
    for (const it of this.w.items.values()) {
      if (it.mode === "free" && fortAt(this.w.arena, it.body.x, it.body.z) === p.colorIdx) out.push(it);
    }
    return out;
  }

  private addLost(p: PlayerSim, n: number, v: number) {
    const l = this.lost.get(p.id) ?? { n: 0, v: 0 };
    l.n += n; l.v += v;
    this.lost.set(p.id, l);
  }

  /** Time's up (day or night): carried loot away from home is lost, carried at home goes in the yard. */
  private endScavenge(night: boolean) {
    this.stopEvent();
    this.w.npc.clearRaccoons();
    const arena = this.w.arena;
    const home = (p: PlayerSim) => fortAt(arena, p.move.x, p.move.z) === p.colorIdx;
    for (const p of this.w.players.values()) {
      const carried = this.w.carriedItems(p);
      if (!carried.length) continue;
      let n = 0, v = 0;
      for (const it of carried) {
        if (home(p)) {
          this.w.putInYard(p, it);
        } else {
          n++; v += itemWorth(it);
          this.w.items.delete(it.id);
        }
      }
      p.hand = ""; p.pockets.fill("");
      this.w.refreshCarry(p);
      if (n) { this.addLost(p, n, v); this.w.emit({ t: "lost", p: p.id, count: n, value: v }); }
    }
    // everything left in a yard counts as banked (even if its 10 s weren't up yet)
    for (const it of this.w.items.values()) {
      if (it.mode !== "free") continue;
      const slot = fortAt(arena, it.body.x, it.body.z);
      if (slot >= 0 && this.ownerOf(slot)) { it.fort = slot; it.locked = true; it.bankT = LOCK_TIME; }
    }
    this.results = this.lines();
    void night;
    this.go("dawn", DAWN_TIME);
  }

  private lines(): RoundLine[] {
    const out: RoundLine[] = [];
    for (const p of this.w.players.values()) {
      const items = this.fortItems(p);
      const l = this.lost.get(p.id) ?? { n: 0, v: 0 };
      out.push({
        id: p.id, name: p.name, colorIdx: p.colorIdx,
        banked: items.length, bankedValue: items.reduce((a, it) => a + itemWorth(it), 0),
        lost: l.n, lostValue: l.v, stolen: p.stolenThisRound, cash: p.cash, aura: p.aura,
      });
    }
    return out.sort((a, b) => b.cash + b.bankedValue - (a.cash + a.bankedValue));
  }

  /** Shop round: Sal makes an offer on everything in each fort. */
  private openShop() {
    const byPlayer = new Map<string, { id: string; type: string; value: number }[]>();
    for (const p of this.w.players.values()) {
      const items = this.fortItems(p);
      byPlayer.set(p.id, items.map((it) => ({ id: it.id, type: it.type, value: itemWorth(it) })));
      for (const it of items) this.w.items.delete(it.id); // carted off to the pawn shop
    }
    this.w.pawn.open(byPlayer);
    this.go("shop", SHOP_TIME);
  }

  private closeShop() {
    for (const p of this.w.players.values()) {
      const left = this.w.pawn.unsold(p.id);
      if (!left.length) continue;
      const v = left.reduce((a, o) => a + o.value, 0);
      this.addLost(p, left.length, v);
      this.w.emit({ t: "lost", p: p.id, count: left.length, value: v, unsold: true });
    }
    this.w.pawn.close();
    this.results = this.lines().sort((a, b) => b.cash - a.cash);
    if (this.round >= CYCLES) this.go("over", 0);
    else this.go("upgrades", UPGRADE_TIME);
  }

  // ---------------------------------------------------------------- events
  /** Escalation: round 1 gets 1 event, round 2 gets 2, round 3+ gets 3, all different kinds. */
  private planEvents() {
    const kinds: CityEventKind[] = ["airdrop", "truck", "happyhour", "raccoons", ...(this.w.arena.chinatown ? ["parade" as const] : []), ...(this.w.arena.littleItaly ? ["festa" as const] : [])];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(this.w.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const n = Math.min(3, this.round);
    // spread between 25 s in and 45 s before the end, at least ~35 s apart
    const start = 25, end = ROUND_TIME - 45;
    const span = (end - start) / n;
    this.plan = [];
    for (let i = 0; i < n; i++) this.plan.push({ at: start + span * i + this.w.random() * Math.max(0, span - 35), kind: kinds[i] });
  }

  /** Test/debug: cancel the remaining scheduled events this round. */
  cancelPlannedEvents() { this.plan = []; }

  /** Start an event right now (also used by tests / debug). */
  trigger(kind: CityEventKind) {
    if (this.ev) this.stopEvent();
    const rnd = () => this.w.random();
    if (kind === "airdrop") {
      const [x, z] = this.airdropSpots[Math.floor(rnd() * this.airdropSpots.length)];
      this.ev = { kind, stage: "warn", t: 0, x, z, r: 2.5 };
    } else if (kind === "truck") {
      const r = this.truckRoutes[Math.floor(rnd() * this.truckRoutes.length)];
      this.ev = { kind, stage: "warn", t: 0, x: r.ax, z: r.az, r: 0, ax: r.ax, az: r.az, bx: r.bx, bz: r.bz, dist: 0 };
    } else if (kind === "happyhour") {
      const zn = this.happyZones[Math.floor(rnd() * this.happyZones.length)];
      this.ev = { kind, stage: "warn", t: 0, x: zn.x, z: zn.z, r: zn.r };
    } else if (kind === "parade") {
      const r0 = this.w.arena.chinatown?.route[0] ?? { x: 0, z: 0 };
      this.ev = { kind, stage: "warn", t: 0, x: r0.x, z: r0.z, r: 0 };
    } else if (kind === "festa") {
      const r0 = this.w.arena.littleItaly?.route[0] ?? { x: 0, z: 0 };
      this.festaV = Math.floor(rnd() * 3);
      this.ev = { kind, stage: "warn", t: 0, x: r0.x, z: r0.z, r: 0 };
    } else {
      this.ev = { kind, stage: "warn", t: 0, x: 0, z: 0, r: 0 };
    }
    this.w.emit({ t: "cityEvent", kind, stage: "warn", x: this.ev.x, z: this.ev.z, detail: this.detail() });
  }

  private detail(): string {
    const e = this.ev;
    if (!e) return "";
    if (e.kind === "truck") return this.truckRoutes.find((r) => r.ax === e.ax && r.az === e.az)?.name ?? "";
    if (e.kind === "happyhour") return this.happyZones.find((z) => z.x === e.x && z.z === e.z)?.name ?? "";
    if (e.kind === "festa") return FESTA.names[this.festaV];
    return "";
  }

  private eventTick(dt: number) {
    const el = this.elapsed;
    if (!this.ev && this.plan.length && el >= this.plan[0].at) this.trigger(this.plan.shift()!.kind);
    const e = this.ev;
    if (!e) return;
    e.t += dt;
    if (e.stage === "warn") {
      if (e.t >= warnOf(e.kind)) { e.stage = "live"; e.t = 0; this.goLive(e); }
      return;
    }
    switch (e.kind) {
      case "airdrop": {
        const c = e.crate ? this.w.items.get(e.crate) : undefined;
        if (!c || !c.chute) this.stopEvent(); // landed (or grabbed): the event is done, the crate stays
        break;
      }
      case "truck": this.truckTick(e, dt); break;
      case "parade": this.paradeTick(dt); break;
      case "festa": this.festaTick(dt); break;
      case "happyhour": {
        for (const it of this.w.items.values()) if (it.mode === "free" && it.fort < 0 && inZone(it, e)) it.mult = 2;
        if (e.t >= HAPPY_HOUR_TIME) this.stopEvent();
        break;
      }
      case "raccoons":
        if (this.w.npc.raccoonCount() === 0 || e.t > 60) this.stopEvent();
        break;
    }
  }

  private goLive(e: ActiveEvent) {
    this.w.emit({ t: "cityEvent", kind: e.kind, stage: "live", x: e.x, z: e.z, detail: this.detail() });
    if (e.kind === "airdrop") {
      e.crate = this.w.placeItem("airdrop_crate", e.x, 38, e.z);
      const c = this.w.items.get(e.crate)!;
      c.chute = true;
      this.w.emit({ t: "spawn", item: c.id });
    } else if (e.kind === "truck") {
      this.truck.on = true; this.truck.x = e.ax!; this.truck.z = e.az!;
      this.truck.yaw = Math.atan2(e.bx! - e.ax!, e.bz! - e.az!);
    } else if (e.kind === "happyhour") {
      // a few bonus goodies appear in the zone
      for (let i = 0; i < 4; i++) {
        const a = this.w.random() * Math.PI * 2, d = this.w.random() * e.r * 0.7;
        this.w.spawnAt(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
      }
    } else if (e.kind === "raccoons") {
      for (const p of this.w.players.values()) if (p.connected) this.w.npc.spawnRaccoon(p.colorIdx);
    } else if (e.kind === "parade") {
      this.paradeD = 0; this.nextEnvelope = PARADE.envelopeEvery; this.w.traffic.towFromClosed();
    } else if (e.kind === "festa") {
      this.festaD = 0; this.nextDrop = FESTA.dropEvery; this.splashT = FESTA.splashEvery; this.w.traffic.towFromClosed();
    }
  }

  /** C5b: where along Chinatown's route a point `d` metres from the start is (and which way it faces) */
  paradeAt(d: number, rt0?: { x: number; z: number }[]): { x: number; z: number; yaw: number } {
    const rt = rt0 ?? this.w.arena.chinatown?.route ?? [{ x: 0, z: 0 }, { x: 0, z: 1 }];
    let left = Math.max(0, d);
    for (let i = 0; i < rt.length - 1; i++) {
      const a = rt[i], b = rt[i + 1], len = hyp(b.x - a.x, b.z - a.z);
      if (left <= len || i === rt.length - 2) { const k = Math.min(1, left / len); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
      left -= len;
    }
    return { x: rt[0].x, z: rt[0].z, yaw: 0 };
  }
  private routeLength(rt0?: { x: number; z: number }[]) {
    const rt = rt0 ?? this.w.arena.chinatown?.route ?? [];
    let n = 0; for (let i = 0; i < rt.length - 1; i++) n += hyp(rt[i + 1].x - rt[i].x, rt[i + 1].z - rt[i].z);
    return n;
  }

  /**
   * C5b: the dragon dances up Chinatown: anyone in its way gets bumped aside (no knockdown), and it scatters
   * red envelopes of lucky money as it goes. Done when its tail has passed the far gate.
   */
  /** R4: a car stopped just ahead of the parade's head (at a light, say): the parade waits for it to go */
  private carAhead(d: number, r: number, rt?: { x: number; z: number }[]): boolean {
    if (d > this.routeLength(rt)) return false;
    const h = this.paradeAt(d, rt), fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    return this.w.traffic.cars.some((c) => {
      const dx = c.x - h.x, dz = c.z - h.z, al = dx * fx + dz * fz;
      // (only a car going its way, waiting at a light: cars crossing or coming at it wait for the parade instead)
      return al > -0.5 && al < r + 3.2 && Math.abs(dx * fz - dz * fx) < r + 1.3 && Math.sin(c.yaw) * fx + Math.cos(c.yaw) * fz > 0.7;
    });
  }

  /** R4: where the dragon's and the festa's bodies are right now (traffic waits for them) */
  paradeBodies(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    if (this.paradeD >= 0) for (let s = 0; s <= PARADE.segments; s++) {
      const d = this.paradeD - s * PARADE.gap;
      if (d >= 0) { const q = this.paradeAt(d); out.push({ x: q.x, z: q.z, r: PARADE.r }); }
    }
    const rt = this.w.arena.littleItaly?.route, v = this.festaV;
    if (this.festaD >= 0 && rt) for (let s = 0; s <= FESTA.segments[v]; s++) {
      const d = this.festaD - s * FESTA.gap[v];
      if (d >= 0) { const q = this.paradeAt(d, rt); out.push({ x: q.x, z: q.z, r: FESTA.r[v] }); }
    }
    return out;
  }

  private paradeTick(dt: number) {
    if (!this.carAhead(this.paradeD, PARADE.r)) this.paradeD += PARADE.speed * dt; // (R4: waits for a car stopped in its way)
    const d = this.paradeD;
    for (const p of this.w.players.values()) {
      if (!p.connected || p.move.y > 2.5) continue;
      for (let s = 0; s <= PARADE.segments; s++) {
        const q = this.paradeAt(d - s * PARADE.gap);
        const dx = p.move.x - q.x, dz = p.move.z - q.z, dist = hyp(dx, dz);
        if (dist > PARADE.r + 0.4 || d - s * PARADE.gap < 0) continue;
        const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), side = dx * fz - dz * fx >= 0 ? 1 : -1;
        p.move.vx = fz * side * PARADE.push; p.move.vz = -fx * side * PARADE.push;
        p.move.stumbleT = Math.max(p.move.stumbleT, 0.25);
        break;
      }
    }
    if (d >= this.nextEnvelope && d <= this.routeLength()) {
      this.nextEnvelope += PARADE.envelopeEvery;
      const h = this.paradeAt(d), side = this.w.random() < 0.5 ? -1 : 1;
      this.w.popLoot("red_envelope", h.x, 2.2, h.z, Math.cos(h.yaw) * side, -Math.sin(h.yaw) * side);
      this.w.emit({ t: "firecracker", x: h.x, z: h.z });
    }
    if (d >= this.routeLength() + PARADE.segments * PARADE.gap + 2) this.stopEvent();
  }

  /** R4: Little Italy's festa (see FESTA): its own way of being in the way, money pick-ups as it goes */
  private festaTick(dt: number) {
    const rt = this.w.arena.littleItaly?.route ?? [{ x: 0, z: 0 }, { x: 0, z: 1 }], v = this.festaV;
    if (!this.carAhead(this.festaD, FESTA.r[v], rt)) this.festaD += FESTA.speed[v] * dt;
    const d = this.festaD, L = this.routeLength(rt);
    const head = this.paradeAt(d, rt);
    for (const p of this.w.players.values()) {
      if (!p.connected || p.move.y > 2.5 || p.respawnT > 0) continue;
      // the band: dance! (stamina comes back fast near it)
      if (v === 1 && d <= L && hyp(p.move.x - head.x, p.move.z - head.z) < FESTA.danceR) p.move.stamina = Math.min(1, p.move.stamina + FESTA.danceRate * dt);
      for (let s = 0; s <= FESTA.segments[v]; s++) {
        if (d - s * FESTA.gap[v] < 0) continue;
        const q = this.paradeAt(d - s * FESTA.gap[v], rt);
        const dx = p.move.x - q.x, dz = p.move.z - q.z, dist = hyp(dx, dz);
        if (dist > FESTA.r[v] + 0.4) continue;
        const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), side = dx * fz - dz * fx >= 0 ? 1 : -1;
        p.move.vx = fz * side * FESTA.push; p.move.vz = -fx * side * FESTA.push;
        if (v === 0 && s === 0) { if (p.move.knockT <= 0) this.w.knockdown(p, "meatball"); } // (the meatball flattens you; the chefs just shove)
        else p.move.stumbleT = Math.max(p.move.stumbleT, 0.25);
        break;
      }
    }
    // the gondola: a bucket of canal water now and then (anyone close slips)
    if (v === 2 && d <= L && (this.splashT -= dt) <= 0) {
      this.splashT = FESTA.splashEvery;
      for (const p of this.w.players.values()) if (p.connected && p.move.y < 2.5 && hyp(p.move.x - head.x, p.move.z - head.z) < FESTA.splashR) { p.move.stumbleT = Math.max(p.move.stumbleT, 0.6); p.move.vx *= 0.3; p.move.vz *= 0.3; }
      this.w.emit({ t: "festaSplash", x: head.x, z: head.z });
    }
    if (d >= this.nextDrop && d <= L) {
      this.nextDrop += FESTA.dropEvery;
      const side = this.w.random() < 0.5 ? -1 : 1;
      this.w.popLoot(FESTA.drop[v], head.x, 2.2, head.z, Math.cos(head.yaw) * side, -Math.sin(head.yaw) * side);
    }
    if (d >= L + FESTA.segments[v] * FESTA.gap[v] + 2) this.stopEvent();
  }

  private truckTick(e: ActiveEvent, dt: number) {
    const total = hyp(e.bx! - e.ax!, e.bz! - e.az!);
    e.dist! += TRUCK_SPEED * dt;
    const k = Math.min(1, e.dist! / total);
    const tr = this.truck;
    tr.x = e.ax! + (e.bx! - e.ax!) * k;
    tr.z = e.az! + (e.bz! - e.az!) * k;
    const fx = Math.sin(tr.yaw), fz = Math.cos(tr.yaw);
    // anything in the truck's footprint: loot gets hoovered up, people get flattened (cartoon style)
    const inTruck = (x: number, z: number, pad: number) => {
      const dx = x - tr.x, dz = z - tr.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      return Math.abs(along) < TRUCK_LEN / 2 + pad && Math.abs(side) < TRUCK_WIDTH / 2 + pad ? side : null;
    };
    for (const it of [...this.w.items.values()]) {
      if (it.mode !== "free" || it.locked) continue;
      if (inTruck(it.body.x, it.body.z, 0.3) !== null && it.body.y < 3) {
        this.w.items.delete(it.id);
        this.w.emit({ t: "swept", item: it.id, type: it.type, x: it.body.x, z: it.body.z });
      }
    }
    for (const p of this.w.players.values()) {
      if (!p.connected || p.move.y > 2.5) continue;
      const side = inTruck(p.move.x, p.move.z, 0.4);
      if (side === null) continue;
      const s = side >= 0 ? 1 : -1;
      p.move.vx += fz * s * 7; p.move.vz += -fx * s * 7; // flung to the side of the road
      this.w.knockdown(p, "truck");
    }
    for (const n of this.w.npc.npcs.values()) {
      const side = inTruck(n.move.x, n.move.z, 0.4);
      if (side === null) continue;
      const s = side >= 0 ? 1 : -1;
      n.move.x += fz * s * 0.3; n.move.z += -fx * s * 0.3;
    }
    if (k >= 1) this.stopEvent();
  }

  private stopEvent() {
    const e = this.ev;
    if (!e) return;
    if (e.kind === "happyhour") {
      // items still lying around lose the bonus; anything grabbed or brought home keeps it
      for (const it of this.w.items.values()) if (it.mode === "free" && it.fort < 0 && inZone(it, e)) it.mult = 1;
    }
    if (e.kind === "truck") this.truck.on = false;
    if (e.kind === "parade") this.paradeD = -1;
    if (e.kind === "festa") this.festaD = -1;
    if (e.kind === "raccoons") this.w.npc.clearRaccoons();
    if (e.kind === "airdrop" && e.crate) { const c = this.w.items.get(e.crate); if (c) c.chute = false; }
    this.w.emit({ t: "cityEvent", kind: e.kind, stage: "end", x: e.x, z: e.z, detail: "" });
    this.ev = null;
  }

  view(out: EventView): EventView {
    const e = this.ev;
    out.kind = e?.kind ?? "";
    out.stage = e?.stage ?? "";
    out.x = e?.x ?? 0; out.z = e?.z ?? 0; out.r = e?.r ?? 0;
    out.timeLeft = !e ? 0 : e.stage === "warn" ? Math.max(0, warnOf(e.kind) - e.t) : e.kind === "happyhour" ? Math.max(0, HAPPY_HOUR_TIME - e.t) : 0;
    out.truckOn = this.truck.on; out.truckX = this.truck.x; out.truckZ = this.truck.z; out.truckYaw = this.truck.yaw;
    out.paradeD = this.paradeD;
    out.festaD = this.festaD; out.festaV = this.festaV;
    return out;
  }
}

function inZone(it: ItemSim, e: { x: number; z: number; r: number }) {
  return hyp(it.body.x - e.x, it.body.z - e.z) <= e.r;
}

/** What an item is worth when cashed in (happy-hour bonus included). */
export function itemWorth(it: ItemSim): number {
  return Math.round(it.value * (it.mult || 1));
}

