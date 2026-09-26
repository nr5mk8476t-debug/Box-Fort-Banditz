// Phase 3: the round loop + city events. Runs inside the World (server + solo).
//
//   lobby --START--> intro (5 s) --> scavenge (3 min) --> tally (12 s) --> intro ... --> over
//
// Banking (Blake's rule): loot resting in YOUR fort yard locks in 10 s after you drop it there.
// Until then anyone can sneak in and steal it back. At time-up, anything you're still carrying
// outside your fort is LOST; loot in your yard (locked or not) is cashed in.
import { fortAt } from "./arena.js";
import type { World, ItemSim, PlayerSim } from "./world.js";

export type MatchPhase = "lobby" | "intro" | "scavenge" | "tally" | "over";
export type CityEventKind = "airdrop" | "truck" | "happyhour" | "raccoons";

export const ROUNDS = 3;
export const ROUND_TIME = 180;
export const INTRO_TIME = 5;
export const TALLY_TIME = 12;
export const LOCK_TIME = 10;
export const HOME_WARNING = 30;

export const TRUCK_SPEED = 8;
export const TRUCK_LEN = 5.5;
export const TRUCK_WIDTH = 2.6;
export const HAPPY_HOUR_TIME = 30;
const EVENT_WARN = 5;

export interface RoundLine {
  id: string; name: string; colorIdx: number;
  banked: number; bankedValue: number; // cashed in this round
  lost: number; lostValue: number; // carried outside the fort at time-up
  stolen: number; // items raccoons got away with
  cash: number; // total after this round
}

/** What clients need to show the current event. */
export interface EventView {
  kind: CityEventKind | "";
  stage: "warn" | "live" | "";
  x: number; z: number; r: number; // marker / zone
  timeLeft: number;
  // garbage truck
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
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
  private warned = false;
  private plan: { at: number; kind: CityEventKind }[] = [];
  ev: ActiveEvent | null = null;
  truck = { on: false, x: 0, z: 0, yaw: 0 };

  constructor(private w: World) {}

  // event geometry comes from the city layout (falls back to the old small city's values)
  private get truckRoutes() { return this.w.arena.truckRoutes ?? DEFAULT_TRUCK_ROUTES; }
  private get happyZones() { return this.w.arena.happyZones ?? DEFAULT_HAPPY_ZONES; }
  private get airdropSpots() { return this.w.arena.airdropSpots ?? DEFAULT_AIRDROP_SPOTS; }

  /** Host pressed START (also used to restart after the final results). */
  start(): boolean {
    if (this.phase !== "lobby" && this.phase !== "over") return false;
    for (const p of this.w.players.values()) p.cash = 0;
    this.round = 0;
    this.results = [];
    this.nextRound();
    return true;
  }

  get elapsed() { return this.phase === "scavenge" ? ROUND_TIME - this.timeLeft : 0; }

  private nextRound() {
    this.round++;
    this.phase = "intro";
    this.timeLeft = INTRO_TIME;
    this.warned = false;
    this.w.resetCity();
    this.w.emit({ t: "round", phase: "intro", round: this.round });
  }

  tick(dt: number) {
    if (this.phase === "lobby") return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    switch (this.phase) {
      case "intro":
        if (this.timeLeft <= 0) {
          this.phase = "scavenge";
          this.timeLeft = ROUND_TIME;
          this.planEvents();
          this.w.emit({ t: "round", phase: "scavenge", round: this.round });
        }
        break;
      case "scavenge":
        this.bankTick(dt);
        this.eventTick(dt);
        if (!this.warned && this.timeLeft <= HOME_WARNING) { this.warned = true; this.w.emit({ t: "round", phase: "hurry", round: this.round }); }
        if (this.timeLeft <= 0) this.endRound();
        break;
      case "tally":
        if (this.timeLeft <= 0) {
          if (this.round < ROUNDS) this.nextRound();
          else { this.phase = "over"; this.w.emit({ t: "round", phase: "over", round: this.round }); }
        }
        break;
    }
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

  private endRound() {
    this.stopEvent();
    this.w.npc.clearRaccoons();
    const lines = new Map<string, RoundLine>();
    for (const p of this.w.players.values()) {
      lines.set(p.id, { id: p.id, name: p.name, colorIdx: p.colorIdx, banked: 0, bankedValue: 0, lost: 0, lostValue: 0, stolen: p.stolenThisRound, cash: 0 });
    }
    const arena = this.w.arena;
    const home = (p: PlayerSim) => fortAt(arena, p.move.x, p.move.z) === p.colorIdx;
    for (const it of [...this.w.items.values()]) {
      if (it.mode === "held" || it.mode === "pocket") {
        const h = this.w.players.get(it.holder);
        if (!h) continue;
        const line = lines.get(h.id)!;
        if (home(h)) { line.banked++; line.bankedValue += itemWorth(it); }
        else { line.lost++; line.lostValue += itemWorth(it); }
        this.w.items.delete(it.id);
        continue;
      }
      const slot = fortAt(arena, it.body.x, it.body.z);
      const owner = this.ownerOf(slot);
      if (!owner) continue;
      const line = lines.get(owner.id)!;
      line.banked++; line.bankedValue += itemWorth(it);
      this.w.items.delete(it.id);
    }
    for (const p of this.w.players.values()) {
      const line = lines.get(p.id)!;
      p.cash += line.bankedValue;
      line.cash = p.cash;
      p.hand = ""; p.pockets.fill(""); p.stolenThisRound = 0;
      this.w.refreshCarry(p);
      if (line.lost) this.w.emit({ t: "lost", p: p.id, count: line.lost, value: line.lostValue });
    }
    this.results = [...lines.values()].sort((a, b) => b.cash - a.cash);
    this.phase = "tally";
    this.timeLeft = TALLY_TIME;
    this.w.emit({ t: "round", phase: "tally", round: this.round });
  }

  // ---------------------------------------------------------------- events
  /** Escalation: round 1 gets 1 event, round 2 gets 2, round 3+ gets 3, all different kinds. */
  private planEvents() {
    const kinds: CityEventKind[] = ["airdrop", "truck", "happyhour", "raccoons"];
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
    return "";
  }

  private eventTick(dt: number) {
    const el = this.elapsed;
    if (!this.ev && this.plan.length && el >= this.plan[0].at) this.trigger(this.plan.shift()!.kind);
    const e = this.ev;
    if (!e) return;
    e.t += dt;
    if (e.stage === "warn") {
      if (e.t >= (e.kind === "happyhour" ? 3 : EVENT_WARN)) { e.stage = "live"; e.t = 0; this.goLive(e); }
      return;
    }
    switch (e.kind) {
      case "airdrop": {
        const c = e.crate ? this.w.items.get(e.crate) : undefined;
        if (!c || !c.chute) this.stopEvent(); // landed (or grabbed): the event is done, the crate stays
        break;
      }
      case "truck": this.truckTick(e, dt); break;
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
    }
  }

  private truckTick(e: ActiveEvent, dt: number) {
    const total = Math.hypot(e.bx! - e.ax!, e.bz! - e.az!);
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
    out.timeLeft = !e ? 0 : e.stage === "warn" ? Math.max(0, (e.kind === "happyhour" ? 3 : EVENT_WARN) - e.t) : e.kind === "happyhour" ? Math.max(0, HAPPY_HOUR_TIME - e.t) : 0;
    out.truckOn = this.truck.on; out.truckX = this.truck.x; out.truckZ = this.truck.z; out.truckYaw = this.truck.yaw;
    return out;
  }
}

function inZone(it: ItemSim, e: { x: number; z: number; r: number }) {
  return Math.hypot(it.body.x - e.x, it.body.z - e.z) <= e.r;
}

/** What an item is worth when cashed in (happy-hour bonus included). */
export function itemWorth(it: ItemSim): number {
  return Math.round(it.value * (it.mult || 1));
}

