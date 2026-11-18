// TRASHINGTON 500 PLAYTEST RECORDER (Blake, 2026-11-18). On the grey-box test map only (arena.variant "test"), the
// host's game writes down what the test is for: "did spotting the other player change what either of us decided to
// do?" Every SIGHTING (two players with a clear line between their eyes, within sight range: 90 m by day, 54 m at
// night; close enough to tell what they carry: 60 / 36 m), with where, when and what each carried; every TRIP out of
// the home block (where you went, what you brought back, which way you came home: up Stain Way or behind the pub);
// and what each player did in the seconds after a sighting (kept going, turned, stopped, ducked into the lane).
// Nothing is shown to the players while they play. The report is plain JSON (World.playtestReport()); the client saves
// it at the end of each scavenge.
import type { World, PlayerSim } from "./world.js";
import { lootDef } from "./loot.js";
import { hyp } from "./fmath.js";
import { TRASH500, LOOP_AT, T_HOME } from "./queens/trashington.js";
import type { XZ } from "./queens/plan.js";
import { TEST_SLOT } from "./testmap.js";

export const PLAYTEST = {
  /** how often positions and sightlines are sampled (s) */
  dt: 0.5,
  spot: 90, recognise: 60, nightMul: 0.6,
  /** the reaction window after a sighting starts (s) */
  after: 20,
  eye: 1.6,
};
const HOME_HALF = T_HOME.half + T_HOME.pave; // the home block's edge (50 m)

interface Sample { t: number; x: number; z: number; carry: string; size: string }
export interface Sighting {
  a: string; b: string; t0: number; t1: number; night: boolean;
  /** where each was when it started (named place) and how far apart; the closest they got */
  at: { a: [number, number, string]; b: [number, number, string] }; dist0: number; minDist: number;
  /** what each was carrying when it started ("" = nothing in hand) */
  carry: { a: string; b: string };
  /** both away from the home block */
  away: boolean;
  /** close enough to tell what the other was carrying, at some point */
  recognised: boolean;
  /** what each did in the PLAYTEST.after seconds that followed (filled in later) */
  next?: { a: Reaction; b: Reaction };
}
export interface Reaction { turned: boolean; stopped: boolean; lane: boolean; home: boolean; note: string }
export interface Trip {
  p: string; t0: number; t1: number; places: string[]; brought: string; broughtSize: string; pockets: number;
  /** the way home on the last leg: "Stain Way", "Wood Havoc Lane" (behind the pub), "both" or "other" */
  wayHome: string; seenOnWayHome: boolean; dist: number;
}

/** a named place for a point on the test map (the plan's roads, lanes, the open places, the yards) */
export function placeName(x: number, z: number, places: { id: string; name: string; inside: { minX: number; maxX: number; minZ: number; maxZ: number } }[]): string {
  for (const p of places) if (x >= p.inside.minX && x <= p.inside.maxX && z >= p.inside.minZ && z <= p.inside.maxZ) return p.name;
  if (Math.abs(x) <= HOME_HALF && Math.abs(z) <= HOME_HALF) {
    for (const f of TRASH500.forts) { const r = f.yard; if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return `${f.id}'s yard`; }
    return "the market";
  }
  for (const u of TRASH500.units) for (const g of u.grounds ?? []) { const r = g.rect; if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return `${u.name}: ${g.name.replace(/ \(.*/, "")}`; }
  let best = "", bd = 1e9;
  const near = (pts: XZ[], half: number, name: string) => {
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      const d = hyp(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (d <= half && d < bd) { bd = d; best = name; }
    }
  };
  for (const r of TRASH500.roads) near(r.kind === "ring" ? [[-54, -54], [54, -54], [54, 54], [-54, 54], [-54, -54]] : r.pts, r.w / 2 + r.sw + 0.5, r.name);
  for (const p of TRASH500.paths) near(p.pts, p.w / 2 + 1, p.id === "al_pub" ? "WOOD HAVOC LANE (behind the pub)" : p.kind === "alley" ? "a back lane" : p.note?.split(":")[0] ?? p.id);
  return best || "between buildings";
}
const LANE = TRASH500.paths.find((p) => p.id === "al_pub")!.pts;
function inLane(x: number, z: number) {
  for (let i = 1; i < LANE.length; i++) {
    const [a, b] = [LANE[i - 1], LANE[i]];
    if (x >= Math.min(a[0], b[0]) - 4 && x <= Math.max(a[0], b[0]) + 4 && z >= Math.min(a[1], b[1]) - 4 && z <= Math.max(a[1], b[1]) + 4) return true;
  }
  return false;
}
/** Stain Way between the museum corner (Gnome Ave) and Queasy Blvd: the quick way home */
const onStainWay = (x: number, z: number) => x >= -LOOP_AT - 8 && x <= -LOOP_AT + 8 && z >= -LOOP_AT + 8 && z <= 2; // (not the junctions at either end: crossing it isn't taking it)

export class PlaytestRecorder {
  private acc = 0;
  private cycle = 0;
  /** when this cycle's scavenge started (world time): report times are from here */
  private t0 = 0;
  private track = new Map<string, Sample[]>();
  private open = new Map<string, Sighting>();
  private trips: Trip[] = [];
  private tripOf = new Map<string, { t0: number; places: Set<string>; from: number }>();
  sightings: Sighting[] = [];
  private cycles: any[] = [];
  private places: { id: string; name: string; inside: any }[] = [];

  constructor(private w: World, places: { id: string; name: string; inside: any }[]) { this.places = places; }

  private carryOf(p: PlayerSim) {
    const it = p.hand ? this.w.items.get(p.hand) : undefined;
    return { type: it ? lootDef(it.type).name : "", size: it ? lootDef(it.type).size : "", pockets: p.pockets.filter(Boolean).length };
  }
  private home = (p: PlayerSim) => Math.abs(p.move.x) <= HOME_HALF && Math.abs(p.move.z) <= HOME_HALF;

  /** called every simulation tick */
  tick(dt: number) {
    const ph = this.w.match.phase;
    if (ph !== "scavenge" && ph !== "dusk" && ph !== "night") return;
    if (this.w.match.round !== this.cycle) this.startCycle();
    this.acc += dt;
    if (this.acc < PLAYTEST.dt) return;
    this.acc = 0;
    const t = +(this.w.time - this.t0).toFixed(1), night = this.w.match.night;
    const ps = [...this.w.players.values()].filter((p) => p.connected);
    for (const p of ps) {
      const c = this.carryOf(p), tr = this.track.get(p.id) ?? [];
      tr.push({ t, x: +p.move.x.toFixed(1), z: +p.move.z.toFixed(1), carry: c.type, size: c.size }); this.track.set(p.id, tr);
      // trips: out of the home block and back
      const trip = this.tripOf.get(p.id);
      if (!this.home(p) && !trip) this.tripOf.set(p.id, { t0: t, places: new Set(), from: tr.length - 1 });
      if (trip) {
        const pl = this.places.find((q) => p.move.x >= q.inside.minX && p.move.x <= q.inside.maxX && p.move.z >= q.inside.minZ && p.move.z <= q.inside.maxZ);
        if (pl) trip.places.add(pl.name);
        if (this.home(p)) { this.endTrip(p, trip, t, c); this.tripOf.delete(p.id); }
      }
    }
    // sightlines between every pair
    const spot = PLAYTEST.spot * (night ? PLAYTEST.nightMul : 1), know = PLAYTEST.recognise * (night ? PLAYTEST.nightMul : 1);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const [a, b] = [ps[i], ps[j]], key = a.id + "|" + b.id;
      const d = hyp(a.move.x - b.move.x, a.move.z - b.move.z);
      const sees = d <= spot && this.w.police.los(a.move.x, a.move.y + PLAYTEST.eye, a.move.z, b.move.x, b.move.y + PLAYTEST.eye, b.move.z);
      const cur = this.open.get(key);
      if (sees && !cur) {
        const ca = this.carryOf(a), cb = this.carryOf(b);
        const s: Sighting = { a: a.name, b: b.name, t0: t, t1: t, night, dist0: Math.round(d), minDist: Math.round(d), away: !this.home(a) && !this.home(b), recognised: d <= know,
          at: { a: [Math.round(a.move.x), Math.round(a.move.z), placeName(a.move.x, a.move.z, this.places)], b: [Math.round(b.move.x), Math.round(b.move.z), placeName(b.move.x, b.move.z, this.places)] },
          carry: { a: ca.type, b: cb.type } };
        (s as any)._ids = [a.id, b.id];
        this.open.set(key, s); this.sightings.push(s);
      } else if (sees && cur) { cur.t1 = t; cur.minDist = Math.min(cur.minDist, Math.round(d)); if (d <= know) cur.recognised = true; }
      else if (!sees && cur && t - cur.t1 > 2) this.open.delete(key); // (a 2 s gap ends it: a lamp post doesn't split a sighting)
    }
    // reactions: PLAYTEST.after seconds after a sighting started
    for (const s of this.sightings) if (!s.next && t - s.t0 >= PLAYTEST.after) { const [ia, ib] = (s as any)._ids; s.next = { a: this.reaction(ia, s.t0), b: this.reaction(ib, s.t0) }; }
  }

  private reaction(id: string, t0: number): Reaction {
    const tr = this.track.get(id) ?? [], before = tr.filter((q) => q.t >= t0 - 3 && q.t <= t0), after = tr.filter((q) => q.t > t0 && q.t <= t0 + PLAYTEST.after);
    const vel = (xs: Sample[]) => xs.length < 2 ? [0, 0] : [(xs[xs.length - 1].x - xs[0].x) / Math.max(0.5, xs[xs.length - 1].t - xs[0].t), (xs[xs.length - 1].z - xs[0].z) / Math.max(0.5, xs[xs.length - 1].t - xs[0].t)];
    const v0 = vel(before), v1 = vel(after.filter((q) => q.t <= t0 + 8)), s0 = hyp(v0[0], v0[1]), s1 = hyp(v1[0], v1[1]);
    const turned = s0 > 1 && s1 > 1 && (v0[0] * v1[0] + v0[1] * v1[1]) / (s0 * s1) < 0;
    let still = 0, maxStill = 0;
    for (let k = 1; k < after.length; k++) { const sp = hyp(after[k].x - after[k - 1].x, after[k].z - after[k - 1].z) / Math.max(0.1, after[k].t - after[k - 1].t); still = sp < 0.8 ? still + (after[k].t - after[k - 1].t) : 0; maxStill = Math.max(maxStill, still); }
    const wasLane = before.some((q) => inLane(q.x, q.z)), lane = !wasLane && after.some((q) => inLane(q.x, q.z));
    const home = after.some((q) => Math.abs(q.x) <= HOME_HALF && Math.abs(q.z) <= HOME_HALF);
    const note = lane ? "ducked into Wood Havoc Lane" : turned ? "turned back" : maxStill >= 4 ? "stopped / waited" : home ? "went home" : "kept going";
    return { turned, stopped: maxStill >= 4, lane, home, note };
  }

  private endTrip(p: PlayerSim, trip: { t0: number; places: Set<string>; from: number }, t: number, c: { type: string; size: string; pockets: number }) {
    const tr = this.track.get(p.id) ?? [], leg = tr.slice(trip.from);
    // the way home: from the last open place you were in to home
    let k = leg.length - 1;
    while (k > 0 && !this.places.some((q) => leg[k].x >= q.inside.minX && leg[k].x <= q.inside.maxX && leg[k].z >= q.inside.minZ && leg[k].z <= q.inside.maxZ)) k--;
    const last = leg.slice(k), lane = last.some((q) => inLane(q.x, q.z)), sw = last.some((q) => onStainWay(q.x, q.z));
    const wayHome = lane && sw ? "both" : lane ? "Wood Havoc Lane" : sw ? "Stain Way" : "other";
    const t1 = last.length ? last[0].t : t;
    const seen = this.sightings.some((s) => (s as any)._ids.includes(p.id) && s.t1 >= t1 && s.t0 <= t);
    let dist = 0; for (let i = 1; i < leg.length; i++) dist += hyp(leg[i].x - leg[i - 1].x, leg[i].z - leg[i - 1].z);
    this.trips.push({ p: p.name, t0: trip.t0, t1: t, places: [...trip.places], brought: c.type, broughtSize: c.size, pockets: c.pockets, wayHome, seenOnWayHome: seen, dist: Math.round(dist) });
  }

  private startCycle() {
    if (this.cycle) this.cycles.push(this.snapshot());
    this.cycle = this.w.match.round;
    this.t0 = this.w.time;
    this.track.clear(); this.open.clear(); this.trips = []; this.tripOf.clear(); this.sightings = []; this.acc = 0;
  }

  /** this cycle so far, with a plain-English summary */
  snapshot() {
    const ps = [...this.w.players.values()];
    const banked = ps.map((p) => { const f = this.w.fort.of(p); return { name: p.name, fort: Object.entries(TEST_SLOT).find(([, v]) => v === p.colorIdx)?.[0] ?? `slot ${p.colorIdx}`, banked: f.recs.length, value: f.recs.reduce((a, r) => a + r.value, 0) }; });
    const away = this.sightings.filter((s) => s.away);
    const lines = [
      `Cycle ${this.cycle}: ${this.sightings.length} sighting(s), ${away.length} away from the home block, ${away.filter((s) => s.recognised).length} close enough to tell what was carried.`,
      ...this.sightings.map((s) => `  ${fmt(s.t0)}${s.night ? " (night)" : ""}: ${s.a} at ${s.at.a[2]}${s.carry.a ? ` with ${s.carry.a}` : ""} / ${s.b} at ${s.at.b[2]}${s.carry.b ? ` with ${s.carry.b}` : ""}, ${s.dist0} m apart (closest ${s.minDist} m), ${Math.round(s.t1 - s.t0 + PLAYTEST.dt)} s${s.next ? `; then ${s.a} ${s.next.a.note}, ${s.b} ${s.next.b.note}` : ""}`),
      ...this.trips.map((tr) => `  ${tr.p}: ${fmt(tr.t0)}-${fmt(tr.t1)} ${tr.places.join(", ") || "(no open place)"}${tr.brought ? `, brought ${tr.brought}${tr.broughtSize === "giant" ? " (giant)" : ""}` : ""}${tr.pockets ? ` + ${tr.pockets} in pockets` : ""}, home by ${tr.wayHome}${tr.seenOnWayHome ? " (seen)" : " (unseen)"}`),
      ...banked.map((b) => `  ${b.name} (${b.fort}): ${b.banked} banked, $${b.value}`),
    ];
    return { cycle: this.cycle, players: banked, sightings: this.sightings.map(({ ...s }) => { delete (s as any)._ids; return s; }), trips: this.trips, tracks: Object.fromEntries([...this.track].map(([id, tr]) => [this.w.players.get(id)?.name ?? id, tr])), summary: lines };
  }
  report() {
    return { map: "Trashington 500 (grey-box test)", saved: new Date().toISOString(), rules: { ...PLAYTEST }, cycles: [...this.cycles, ...(this.cycle ? [this.snapshot()] : [])] };
  }
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
