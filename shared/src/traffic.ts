// Traffic (City Redesign C1): cars drive the real road network. Every road has a lane each way
// (keep right; one-way streets and the roundabout have one lane). At junctions cars follow a curved
// connector from their lane into the next one, picking a random way on each time (no fixed loops).
//
// Rules at junctions:
//  - traffic lights (the Mile x the two crosstown streets): one approach at a time, green / amber / red
//  - give way (everywhere else): one approach at a time, first come first served
//  - roundabout: cars already on the ring go first; you enter only when there's a gap
//  - don't block the box: never enter a junction unless there's room on the road you're heading into
//  - a car stuck for 6 s picks another way out
// Cars keep their distance, stop for pedestrians in the road, the garbage truck and cop cars.
// They do NOT stop for bandits: a moving car that hits you wipes you out (cartoon pancake),
// everything you carried spills on the road, and you respawn at your fort 10 s later.
// Runs inside the World on the host and in solo mode (deterministic: its own seeded dice).
import { PLAYER } from "./constants.js";
import type { RoadNet, RoadEdge } from "./arena.js";
import type { World, PlayerSim } from "./world.js";
import { hyp } from "./fmath.js";

export const CAR_HALF_LEN = 2.1;
export const CAR_HALF_WIDTH = 0.95;
export const WIPEOUT_TIME = 10;
/**
 * D1 (Blake): getting hit by a car: you're launched up and along (spinning), land flat, and lie there stunned for
 * WIPEOUT_TIME seconds from the moment you land (no moving, punching, grabbing). Everything you carry scatters
 * across the road. Then you get up where you landed, with GRACE seconds where cars can't hit you again.
 */
export const SPLAT = { launchUp: 8.5, launchAlong: 0.75, launchMin: 6, grace: 3, scatter: 4.5 };
const ACCEL = 4, BRAKE = 10;
/** cars in the city */
export const CAR_COUNT = 22;
/** Stuck behind a pedestrian this long: honk; this long: ask them to get off the road. */
export const CAR_HONK_AFTER = 2;
export const CAR_CLEAR_AFTER = 3.5;
/** ...and if they still haven't moved after this long, the car creeps forward and nudges them out of the way */
export const CAR_CREEP_AFTER = 9;
/** stuck this long at a junction: take another way out */
export const CAR_REROUTE_AFTER = 6;
/** traffic lights: per approach, in turn */
export const LIGHT = { green: 5, amber: 1.5, red: 0.5 };
const GAP = 7.2; // front-to-front distance cars stop at behind another car
const LOOK = 24; // how far ahead cars look along their way

export interface CarSim {
  id: string; lane: number; s: number; v: number; x: number; z: number; yaw: number; honkCd: number; color: number;
  /** the lane (usually a junction connector) this car takes after this one */
  next: number;
  /** 5A.1: seconds stopped for a pedestrian in the road, and who (after a few seconds they're asked to move) */
  blockT: number; blocker: string;
  /** seconds stopped at a junction (re-route after CAR_REROUTE_AFTER), and since when (first come first served) */
  stuckT: number; waitSince: number;
  /** cleared to cross the stop line (keeps going even if the light just changed) */
  go: boolean;
  /** seconds standing still (anything but a queue or a stop line) */
  stillT: number;
  /** R13: how long the car's blocker has been out of its path (a walker on the edge of it flickers in and out: the wait
   *  kept starting again, so the car never asked them to move, and a cruiser and a walker waited on each other for a minute) */
  blockGap: number;
  /** R12.3b (diagnostics): why it's held up right now ("" = it isn't) and by what (a car, a cop car, a junction, a
   *  person), and how long it's been stopped for any reason */
  why?: string; by?: string; waitT?: number;
  /** R12.3b: a police car driving with the traffic (its id is the cop car's); its siren (right of way at junctions);
   *  where it's heading (it picks its way there; none = wherever); stopping where it is (dropping an officer off) */
  cop?: boolean; siren?: boolean; goal?: { x: number; z: number } | null; hold?: boolean;
  /** (its route: each lane's distance on to the goal, worked out when the goal moves) */
  costs?: Float64Array; costFor?: { x: number; z: number };
}

export type TrafficEvent =
  | { t: "wipeout"; p: string; car: string; x: number; z: number }
  | { t: "respawn"; p: string }
  | { t: "honk"; car: string; x: number; z: number };

export interface Lane {
  id: number;
  /** points every ~1 m along the lane centre, cumulative distance */
  pts: { x: number; z: number }[]; cum: number[]; len: number;
  /** road lane (along an edge) or connector (through a junction) */
  conn: boolean;
  edge: number; from: number; to: number;
  /** for connectors: the junction, the road lanes in and out */
  node: number; inLane: number; outLane: number;
  /** straight on (connectors) */
  straight: boolean;
  speed: number;
  /** road lanes: the connectors leaving its end */
  outs: number[];
}

// ---------------------------------------------------------------------------------------------------
// Traffic lights (shared with the renderer: same answer from the same clock)
// ---------------------------------------------------------------------------------------------------
/** Edges with traffic coming INTO a light junction, in the order they get green. */
export function lightApproaches(net: RoadNet, node: number): number[] {
  const out: number[] = [];
  net.edges.forEach((e, i) => { if (e.b === node || (e.a === node && !e.oneway)) out.push(i); });
  return out;
}
/** Light colour for traffic arriving on edge `edge` at junction `node` at time t. */
export function lightState(net: RoadNet, node: number, edge: number, t: number): "green" | "amber" | "red" {
  const ap = lightApproaches(net, node);
  const k = ap.indexOf(edge);
  if (k < 0) return "red";
  const slot = LIGHT.green + LIGHT.amber + LIGHT.red, cycle = slot * ap.length;
  const u = (((t + node * 3.7) % cycle) + cycle) % cycle - k * slot;
  return u >= 0 && u < LIGHT.green ? "green" : u >= LIGHT.green && u < LIGHT.green + LIGHT.amber ? "amber" : "red";
}

// ---------------------------------------------------------------------------------------------------
// Lanes from the road network
// ---------------------------------------------------------------------------------------------------
function polyline(pts: { x: number; z: number }[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum[cum.length - 1] };
}
/** Cut a polyline to [s0, s1] (distances along it). */
function cut(pts: { x: number; z: number }[], s0: number, s1: number) {
  const { cum } = polyline(pts);
  const at = (s: number) => {
    let i = 0;
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    const k = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, z: pts[i].z + (pts[i + 1].z - pts[i].z) * k };
  };
  const out = [at(s0)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 0.2 && cum[i] < s1 - 0.2) out.push(pts[i]);
  out.push(at(s1));
  return out;
}
function densify(a: { x: number; z: number }, b: { x: number; z: number }) {
  const n = Math.max(1, Math.ceil(hyp(b.x - a.x, b.z - a.z)));
  const out = [];
  for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  return out;
}

export function buildLanes(net: RoadNet): Lane[] {
  const lanes: Lane[] = [];
  const N = net.nodes;
  const endP = (e: RoadEdge, end: "a" | "b") => { const p = end === "a" ? e.pa : e.pb; return p ? { x: p[0], z: p[1] } : { x: N[e[end]].x, z: N[e[end]].z }; };
  const edgesAt = (id: number) => net.edges.filter((e) => e.a === id || e.b === id);
  // how far into each road the junction box reaches (the stop line)
  const trim = (e: RoadEdge, node: number, bumper = true): number => {
    const bump = bumper ? CAR_HALF_LEN + 0.3 : 0;
    const n = N[node];
    if (e.arc) {
      const arm = edgesAt(node).find((o) => !o.arc);
      return (arm ? arm.hw : 4) + 2.5;
    }
    if (n.ctl === "round") return 7.2 + bump; // outside the ring's outer edge + the crossing, bumper and all
    const others = edgesAt(node).filter((o) => o !== e);
    if (n.ctl === "end") return Math.max(...others.map((o) => o.hw)) + 0.5;
    const p = e.a === node ? endP(e, "a") : endP(e, "b"), q = e.a === node ? endP(e, "b") : endP(e, "a");
    const l = hyp(q.x - p.x, q.z - p.z), dx = (q.x - p.x) / l, dz = (q.z - p.z) / l;
    let reach = 0;
    for (const o of others) {
      if (o.arc) continue;
      const a = endP(o, "a"), b = endP(o, "b");
      const minX = Math.min(a.x, b.x) - o.hw, maxX = Math.max(a.x, b.x) + o.hw, minZ = Math.min(a.z, b.z) - o.hw, maxZ = Math.max(a.z, b.z) + o.hw;
      const far = dx > 0.5 ? maxX - p.x : dx < -0.5 ? p.x - minX : dz > 0.5 ? maxZ - p.z : p.z - minZ;
      reach = Math.max(reach, Math.min(far, o.hw * 2 + 3));
    }
    return reach + 3.4 + bump; // (behind the zebra crossing, bumper and all)
  };
  const speedOf = (e: RoadEdge) => (e.arc ? 8 : e.hw >= 5 ? 11 : e.hw >= 4 ? 10 : 8);
  net.edges.forEach((e, ei) => {
    let base: { x: number; z: number }[];
    if (e.arc) {
      const A = N[e.a], B = N[e.b], { cx, cz, r } = e.arc;
      const a0 = Math.atan2(A.z - cz, A.x - cx);
      let a1 = Math.atan2(B.z - cz, B.x - cx);
      while (a1 <= a0) a1 += Math.PI * 2;
      const n = Math.ceil(((a1 - a0) * r) / 1);
      base = [];
      for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n; base.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r }); }
    } else base = densify(endP(e, "a"), endP(e, "b"));
    const dirs: [boolean][] = e.oneway || e.arc ? [[true]] : [[true], [false]];
    for (const [fwd] of dirs) {
      let pts = fwd ? base : [...base].reverse();
      const off = e.oneway || e.arc ? 0 : e.hw / 2;
      if (off) {
        pts = pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const l = hyp(b.x - a.x, b.z - a.z) || 1, fx = (b.x - a.x) / l, fz = (b.z - a.z) / l;
          return { x: p.x + fz * off, z: p.z - fx * off }; // keep right
        });
      }
      const from = fwd ? e.a : e.b, to = fwd ? e.b : e.a;
      const L = polyline(pts).len;
      let t0 = trim(e, from), t1 = trim(e, to);
      // (short roads between two junctions: the stop line moves up to the crossing, or closer still)
      if (L - t0 - t1 < 4) { t0 = trim(e, from, false); t1 = trim(e, to, false); }
      if (L - t0 - t1 < 2) { const k = (L - 2) / (t0 + t1); t0 *= k; t1 *= k; }
      const cutPts = cut(pts, t0, L - t1);
      const pl = polyline(cutPts);
      lanes.push({ id: lanes.length, ...pl, conn: false, edge: ei, from, to, node: -1, inLane: -1, outLane: -1, straight: true, speed: speedOf(e), outs: [] });
    }
  });
  // connectors through every junction: each lane in -> each lane out (no U-turns)
  const roadLanes = lanes.slice();
  for (const li of roadLanes) {
    const ins = li;
    for (const lo of roadLanes) {
      if (lo.from !== ins.to) continue;
      if (lo.edge === ins.edge && !net.edges[lo.edge].arc) continue; // U-turn
      const p0 = ins.pts[ins.pts.length - 1], p1 = ins.pts[ins.pts.length - 2];
      const q0 = lo.pts[0], q1 = lo.pts[1];
      const hx = p0.x - p1.x, hz = p0.z - p1.z, hl = hyp(hx, hz) || 1;
      const gx = q1.x - q0.x, gz = q1.z - q0.z, gl = hyp(gx, gz) || 1;
      const ux = hx / hl, uz = hz / hl, vx = gx / gl, vz = gz / gl;
      const cross = ux * vz - uz * vx, dot = ux * vx + uz * vz;
      const bez = (a: { x: number; z: number }, c: { x: number; z: number }, b: { x: number; z: number }) => {
        const n = Math.max(3, Math.ceil(hyp(b.x - a.x, b.z - a.z) * 1.2));
        const out = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          out.push({ x: (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * c.x + t * t * b.x, z: (1 - t) * (1 - t) * a.z + 2 * t * (1 - t) * c.z + t * t * b.z });
        }
        return out;
      };
      let pts: { x: number; z: number }[];
      const t = Math.abs(cross) < 0.2 ? NaN : ((q0.x - p0.x) * vz - (q0.z - p0.z) * vx) / cross;
      const c = { x: p0.x + ux * t, z: p0.z + uz * t };
      if (Number.isNaN(t) || t < 0 || hyp(c.x - p0.x, c.z - p0.z) > 40 || hyp(c.x - q0.x, c.z - q0.z) > 40) {
        pts = bez(p0, { x: (p0.x + q0.x) / 2, z: (p0.z + q0.z) / 2 }, q0);
      } else {
        // drive on to near the corner, turn (tight for a right turn: never over the kerb), drive on out
        const r = Math.min(hyp(c.x - p0.x, c.z - p0.z), hyp(c.x - q0.x, c.z - q0.z), cross < 0 ? 2.5 : 7);
        const A = { x: c.x - ux * r, z: c.z - uz * r }, B = { x: c.x + vx * r, z: c.z + vz * r };
        pts = [...densify(p0, A).slice(0, -1), ...bez(A, c, B), ...densify(B, q0).slice(1)];
      }
      const pl = polyline(pts.filter((p, i) => i === 0 || hyp(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1e-4));
      const straight = dot > 0.7;
      const id = lanes.length;
      lanes.push({ id, ...pl, conn: true, edge: -1, from: ins.to, to: ins.to, node: ins.to, inLane: ins.id, outLane: lo.id, straight, speed: straight ? Math.min(ins.speed, lo.speed) : 5.5, outs: [] });
      ins.outs.push(id);
    }
  }
  return lanes;
}

/** R12.8: every car (and every police car in the lanes, and the stand-ins for the ones out of them) made in ONE shape,
 *  all its fields from the start in the same order: the tick reads them for every pair of cars, and objects of several
 *  shapes made V8 read them the slow way (a new heap number for each decimal it read). */
export function carSim(id: string, lane: number, s: number, v: number, x: number, z: number, yaw: number, color: number, cop: boolean): CarSim {
  return { id, lane, s, v, x, z, yaw, honkCd: 0, color, next: -1, blockT: 0, blocker: "", stuckT: 0, waitSince: -1, go: false, stillT: 0, blockGap: 0,
    why: "", by: "", waitT: 0, cop, siren: false, goal: null, hold: false, costs: undefined, costFor: undefined };
}

/** Position + heading at distance s along a lane. */
export function laneAt(l: Lane, s: number): { x: number; z: number; yaw: number } {
  return laneAtInto(l, s, { x: 0, z: 0, yaw: 0 });
}
/** (R12.8) laneAt into an object you already have (the traffic tick asks thousands of times a tick) */
export function laneAtInto<T extends { x: number; z: number; yaw: number }>(l: Lane, s: number, out: T): T {
  s = Math.max(0, Math.min(l.len, s));
  let i = 0, hi = l.pts.length - 2;
  // (binary search: lanes are long)
  while (i < hi) { const m = (i + hi + 1) >> 1; if (l.cum[m] <= s) i = m; else hi = m - 1; }
  const a = l.pts[i], b = l.pts[Math.min(l.pts.length - 1, i + 1)];
  const seg = l.cum[i + 1] - l.cum[i] || 1;
  const k = (s - l.cum[i]) / seg;
  out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  return out;
}
/** (R12.8: scratch for the tick: one each, reused) */
const LP = { x: 0, z: 0, yaw: 0 };
const WAY_N = 256, WAY_X = new Float64Array(WAY_N), WAY_Z = new Float64Array(WAY_N), WAY_D = new Float64Array(WAY_N);

export class TrafficSystem {
  readonly cars: CarSim[] = [];
  /** R12.3b: police cars driving WITH the traffic (patrolling, or heading off after a chase): the same lanes, lights
   *  and give-way as everyone else, so a cruiser and a car can never sit nose to nose waiting for each other.
   *  (Kept apart from `cars`, which the clients draw as ordinary cars.) */
  readonly riders: CarSim[] = [];
  /** everything in the lanes this tick */
  private all: CarSim[] = [];
  /** ...plus the cop cars outside them (for "is something in my way") */
  private obst: CarSim[] = [];
  /** (R12.8) this tick's people, in the order the NPC map holds them */
  private peds: { id: string; move: { x: number; z: number } }[] = [];
  readonly lanes: Lane[];
  private net: RoadNet | undefined;
  private seed = 12345;
  /** how many times each road lane has been driven (tests: every road gets used) */
  readonly laneUse: number[];
  /** seconds since the start (drives the lights) */
  clock = 0;

  constructor(private w: World, count = CAR_COUNT, seed = 12345) {
    this.seed = (Math.abs(Math.floor(seed * 7919)) % 2147483646) + 1;
    this.net = w.arena.roadNet;
    this.lanes = this.net ? buildLanes(this.net) : [];
    this.laneUse = this.lanes.map(() => 0);
    const road = this.lanes.filter((l) => !l.conn && l.len > 14);
    if (!road.length) return;
    // spread the cars out over the longest roads
    const sorted = [...road].sort((a, b) => b.len - a.len);
    for (let i = 0; i < count; i++) {
      const l = sorted[i % sorted.length];
      const s = l.len * (0.25 + 0.5 * ((i / sorted.length) % 1)) ;
      const p = laneAt(l, s);
      const car = carSim("c" + (i + 1), l.id, s, l.speed * 0.5, p.x, p.z, p.yaw, (i + 1) % 8, false);
      car.next = this.pickNext(l, -1);
      this.cars.push(car);
    }
  }

  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /** Random way on from the end of a road lane (straight on a bit more likely). */
  /** R4: the street a parade has closed (from its warning on): Chinatown's for the dragon, Little Italy's for the festa */
  private closedStreet(): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    const k = this.w.match.ev?.kind, a = this.w.arena;
    return k === "parade" ? a.chinatown?.street ?? null : k === "festa" ? a.littleItaly?.street ?? null : null;
  }
  /** does this connector lead into the closed street? */
  private intoClosed(o: number, R = this.closedStreet()): boolean {
    if (!R) return false;
    const out = this.lanes[this.lanes[o].outLane], m = out?.pts[out.pts.length >> 1];
    return !!m && m.x > R.minX && m.x < R.maxX && m.z > R.minZ && m.z < R.maxZ;
  }

  /** R4: as a parade goes live, any car still caught in its closed street is towed to a quiet road elsewhere
   *  (the float fills the street: it would otherwise roll straight through a car waiting in it) */
  towFromClosed() {
    const R = this.closedStreet();
    if (!R) return;
    const inR = (x: number, z: number, m = 0) => x > R.minX - m && x < R.maxX + m && z > R.minZ - m && z < R.maxZ + m;
    const road = this.lanes.filter((l) => !l.conn && l.len > 14);
    // (R12.5: clear of the police cars too: a tow used to drop a car right on top of a passing cruiser)
    const free = (x: number, z: number) => this.cars.every((o) => hyp(o.x - x, o.z - z) > 14) && (this.w.police?.cars ?? []).every((o) => hyp(o.x - x, o.z - z) > 20);
    for (const car of this.cars) {
      if (!inR(car.x, car.z)) continue;
      const pick = road.find((l, i) => {
        const p = laneAt(l, l.len * 0.5);
        return !inR(p.x, p.z, 10) && (i + this.cars.indexOf(car)) % 3 === 0 && free(p.x, p.z);
      }) ?? road.find((l) => { const p = laneAt(l, l.len * 0.5); return !inR(p.x, p.z, 10) && free(p.x, p.z); });
      if (!pick) continue;
      const p = laneAt(pick, pick.len * 0.5);
      Object.assign(car, { lane: pick.id, s: pick.len * 0.5, v: 0, x: p.x, z: p.z, yaw: p.yaw, blockT: 0, blocker: "", stuckT: 0, waitSince: -1, go: false, stillT: 0, blockGap: 0 });
      car.next = this.pickNext(pick, -1);
    }
  }

  /** does this connector lead the same way the parade is walking? */
  private withParade(o: number): boolean {
    const k = this.w.match.ev?.kind, a = this.w.arena;
    const rt = k === "parade" ? a.chinatown?.route : k === "festa" ? a.littleItaly?.route : undefined;
    const out = this.lanes[this.lanes[o].outLane];
    if (!rt || rt.length < 2 || !out || out.pts.length < 2) return false;
    const A = out.pts[0], B = out.pts[out.pts.length - 1];
    return (B.x - A.x) * (rt[1].x - rt[0].x) + (B.z - A.z) * (rt[1].z - rt[0].z) > 0;
  }

  private pickNext(l: Lane, avoid: number): number {
    const all = l.outs.filter((o) => o !== avoid), open = all.filter((o) => !this.intoClosed(o));
    // (R4: no way round the parade's street: go into it the way the parade is going, never against it)
    const along = open.length ? [] : all.filter((o) => this.withParade(o));
    const opts = open.length ? open : along.length ? along : all;
    if (!opts.length) return l.outs[0] ?? -1;
    let total = 0;
    // (a nudge toward roads that have seen few cars, so traffic spreads over the whole network)
    const wts = opts.map((o) => { const out = this.lanes[o].outLane; const x = (this.lanes[o].straight ? 1.6 : 1) * (1 + 2 / (1 + (this.laneUse[out] ?? 0))); total += x; return x; });
    let r = this.rnd() * total;
    for (let i = 0; i < opts.length; i++) { r -= wts[i]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 1];
  }

  /** Is this car allowed to drive into its next connector right now? */
  /** A car in (or committed to) a junction's box, coming from another lane than `inLane`. */
  private boxBusy(car: CarSim, node: number, inLane: number): boolean {
    for (const o of this.all) {
      if (o === car) continue;
      const ol = this.lanes[o.lane];
      if (ol.conn && ol.node === node && ol.inLane !== inLane) { this.held = "box: " + o.id; return true; }
      if (o.go && o.next >= 0 && this.lanes[o.next].node === node && o.lane !== inLane) { this.held = "box: " + o.id; return true; }
    }
    return false;
  }
  /** (diagnostics) what the last "not yet" at a junction was waiting on */
  private held = "";

  private mayEnter(car: CarSim, conn: Lane): boolean {
    const net = this.net!;
    const node = net.nodes[conn.node];
    const inL = this.lanes[conn.inLane], outL = this.lanes[conn.outLane];
    // (R12.3b: a siren coming up to this junction from another way: let it through first)
    if (!car.siren) for (const o of this.riders) {
      if (!o.siren || o === car || o.lane === car.lane) continue;
      const ol = this.lanes[o.lane];
      if ((!ol.conn && ol.to === node.id && ol.len - o.s < 22 && o.v > 0.5) || (o.go && o.next >= 0 && this.lanes[o.next].node === node.id)) { this.held = "siren: " + o.id; return false; }
    }
    // don't block the box: room on the road we're heading into (cars in the junction heading there count)
    // (a short road between two junctions holds one car: count everyone heading into it)
    const short = outL.len < 2 * GAP;
    let room = true;
    for (const o of this.all) {
      if (o === car) continue;
      if (o.lane === outL.id && (short || o.s < GAP + 1)) { room = false; this.held = "no room: " + o.id; break; }
      const ol = this.lanes[o.lane];
      if (ol.conn && ol.outLane === outL.id && (short || ol.inLane !== inL.id)) { room = false; this.held = "no room: " + o.id; break; }
      // (R12.3b: and a car from another way that's already committed to going in there: two cars merging at the same
      //  moment used to drive into each other)
      if (o.go && o.next >= 0 && !ol.conn && this.lanes[o.next].outLane === outL.id && o.lane !== inL.id) { room = false; this.held = "no room: " + o.id; break; }
    }
    if (!room) return false;
    if (node.ctl === "end") return true;
    if (car.siren) return !this.boxBusy(car, node.id, inL.id); // (R12.3b: lights and give-way don't hold a siren up)
    if (node.ctl === "light") {
      const st = lightState(net, node.id, inL.edge, this.clock);
      if (st !== "green") { this.held = "red light"; return false; }
      // (the box has to be clear of cars from the other approaches, e.g. ones that went on amber)
      return !this.boxBusy(car, node.id, inL.id);
    }
    if (node.ctl === "round") {
      const arcIn = net.edges[inL.edge].arc;
      if (arcIn) return true; // already on the ring: priority
      // entering: the ring has to be clear coming toward us
      if (this.boxBusy(car, node.id, inL.id)) return false;
      for (const o of this.all) {
        if (o === car) continue;
        const ol = this.lanes[o.lane];
        if (!ol.conn && ol.to === node.id && net.edges[ol.edge].arc && ol.len - o.s < 12) { this.held = "ring: " + o.id; return false; }
      }
      return true;
    }
    // give way: one approach at a time, first come first served
    if (car.waitSince < 0 || this.boxBusy(car, node.id, inL.id)) return false;
    for (const o of this.all) {
      if (o === car || o.lane === car.lane || o.waitSince < 0) continue;
      const ol = this.lanes[o.lane];
      if (ol.conn || ol.to !== node.id) continue;
      if (o.waitSince < car.waitSince - 1e-6 || (Math.abs(o.waitSince - car.waitSince) <= 1e-6 && o.id < car.id)) { this.held = "give way: " + o.id; return false; }
    }
    return true;
  }

  tick(dt: number) {
    const w = this.w;
    this.clock += dt;
    // respawn timers for wiped-out bandits
    for (const p of w.players.values()) {
      if (p.respawnT <= 0) continue;
      // (the 10 s only start once you've landed; meanwhile you stay flat)
      if (p.move.grounded) { p.respawnT -= dt; p.move.vx *= 0.82; p.move.vz *= 0.82; } // (SPLAT: you skid a moment and stop flat)
      p.move.knockT = Math.max(p.move.knockT, p.respawnT + 0.05);
      if (p.respawnT <= 0) this.getUp(p);
    }
    if (!this.lanes.length) return;
    const truck = w.match.truck, bodies = w.match.paradeBodies();
    this.all = this.riders.length ? [...this.cars, ...this.riders] : this.cars;
    // (cop cars outside the lanes, sirens on, are something solid in the road: nobody drives into one)
    const free = w.police.cars.filter((c) => !c.ride);
    this.obst = free.length ? [...this.all, ...free.map((c) => carSim(c.id, -1, 0, 0, c.x, c.z, c.yaw, 0, true))] : this.all;
    const peds = this.peds; peds.length = 0;
    for (const n of w.npc.npcs.values()) peds.push(n);
    for (const car of this.all) {
      let why = "", by = "", qBy = "";
      let lane = this.lanes[car.lane];
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      // (where a point is relative to the car: along its heading, and to the side. R12.8: no object per question)
      const cx0 = car.x, cz0 = car.z;
      let target = car.siren ? lane.speed * 1.25 : lane.speed;
      if (car.hold) { target = 0; why = "dropping off"; by = car.id; }
      // ---- the way ahead: this lane, then the next ones ----
      const nextConn = !lane.conn && car.next >= 0 ? this.lanes[car.next] : null;
      const toEnd = lane.len - car.s;
      // stop line: road lanes end at a junction
      if (!lane.conn && nextConn && !car.go && (toEnd > 3 || car.v < 0.5) && this.intoClosed(car.next) && (lane.outs.some((o) => !this.intoClosed(o)) || (!this.withParade(car.next) && lane.outs.some((o) => this.withParade(o))))) car.next = this.pickNext(lane, car.next); // (R4: the parade's street is closed: go round)
      if (!lane.conn && nextConn) {
        if (toEnd < 12 && car.waitSince < 0) car.waitSince = this.clock;
        this.held = "";
        const ok = toEnd > 12 || car.go || this.mayEnter(car, nextConn);
        if (ok && toEnd < 2 + car.v * 0.4) car.go = true; // committed: too close to stop now
        if (toEnd < 12 && !ok) {
          target = Math.min(target, Math.sqrt(Math.max(0, 2 * 5 * (toEnd - 0.3))));
          if (toEnd < 3) { why = "junction " + lane.to; by = this.held || (car.waitSince < 0 ? "arriving" : "?"); }
        } else if (toEnd < 12 && ok) {
          target = Math.min(target, nextConn.speed + 1.5);
        }
        // (waiting at a red light is normal: only a jam counts as stuck)
        const red = this.net!.nodes[lane.to].ctl === "light" && lightState(this.net!, lane.to, lane.edge, this.clock) !== "green";
        if (car.v > 0.3 || toEnd > 1.5) car.stuckT = 0;
        else if (!ok && !red) car.stuckT += dt;
        // (at lights a green is short: if our way out is jammed for a few seconds of green, go another way)
        const limit = this.net!.nodes[lane.to].ctl === "light" ? 2.5 : CAR_REROUTE_AFTER;
        if (car.stuckT > limit && lane.outs.length > 1 && !car.go) { car.next = this.pickNext(lane, car.next); car.stuckT = 0; }
        // (a police car heading somewhere: the way there, worked out again whenever where it's going moves)
        if (car.goal && !car.go && car.costFor !== car.goal) car.next = this.toward(car, lane);
      }
      // cars ahead along our way (this lane + the next two)
      let gap = Infinity;
      {
        const path: Lane[] = [lane];
        if (nextConn) { path.push(nextConn); path.push(this.lanes[nextConn.outLane]); }
        else if (lane.conn) path.push(this.lanes[lane.outLane]);
        // (R12.8: the points along our way, every 1.5 m up to LOOK, worked out once for this car, the first time an
        //  obstacle needs them, instead of again for every obstacle. The same points in the same order: same answers.)
        let ns = -1;
        for (const o of this.obst) {
          if (o === car) continue;
          const dx0 = o.x - car.x, dz0 = o.z - car.z;
          if (dx0 * dx0 + dz0 * dz0 > (LOOK + 4) * (LOOK + 4)) continue;
          // same lane: simple
          if (o.lane === car.lane) { if (o.s > car.s && o.s - car.s < gap) { gap = o.s - car.s; qBy = o.id; } continue; }
          // otherwise: does it sit on our way ahead?
          if (ns < 0) {
            ns = 0;
            let acc = -car.s;
            fill: for (const pl of path) {
              for (let s = pl === lane ? car.s + 1 : 0; s <= pl.len; s += 1.5) {
                const d = acc + s;
                if (d > LOOK || ns >= WAY_N) break fill;
                laneAtInto(pl, s, LP);
                WAY_X[ns] = LP.x; WAY_Z[ns] = LP.z; WAY_D[ns] = d; ns++;
              }
              acc += pl.len;
            }
          }
          const cop = o.lane === -1, ux = cop ? Math.sin(o.yaw) : 0, uz = cop ? Math.cos(o.yaw) : 0;
          for (let k = 0; k < ns; k++) {
            const qx = WAY_X[k] - o.x, qz = WAY_Z[k] - o.z;
            // (a car in a lane sits on its lane's line: 1.7 m; a cop car out of the lanes can be anywhere: its own half
            //  width and ours, so its body never meets ours)
            const inWay = cop ? Math.abs(qx * ux + qz * uz) < 2.2 + CAR_HALF_WIDTH + 0.2 && Math.abs(qx * uz - qz * ux) < 1.0 + CAR_HALF_WIDTH + 0.2
              : Math.abs(qx) < 1.7 && Math.abs(qz) < 1.7 && hyp(qx, qz) < 1.7;
            // (the gap's measured to the cop car's near end, not its middle)
            if (inWay) { const dd = cop ? WAY_D[k] + CAR_HALF_LEN - 0.2 : WAY_D[k]; if (dd < gap) { gap = dd; qBy = o.id; } break; }
          }
        }
      }
      if (gap < Infinity) { target = Math.min(target, gap < GAP ? 0 : Math.sqrt(2 * 5 * (gap - GAP))); if (gap < GAP + 1 && !why) { why = "queue"; by = qBy; } }
      const brakeDist = CAR_HALF_LEN + 2.5 + car.v * 0.7;
      const blocked = (x: number, z: number, width: number) => { const dx = x - cx0, dz = z - cz0, along = dx * fx + dz * fz; return along > 0 && along < brakeDist && Math.abs(dx * fz - dz * fx) < width; };
      // pedestrians IN the road (people waiting on the curb don't stop traffic)
      let blocker = "";
      // (R12.8: the people from one list made once a tick, and the "in front of me?" sum done right here: it was a Map
      //  walk and a closure call per person per car per tick, a big share of the game's garbage. Same order, same answer.)
      for (let k = 0; k < peds.length; k++) {
        const n = peds[k], dx = n.move.x - cx0, dz = n.move.z - cz0, along = dx * fx + dz * fz;
        if (!(along > 0 && along < brakeDist && Math.abs(dx * fz - dz * fx) < 1.6) || !w.npc.onRoad(n.move.x, n.move.z, 0.2)) continue;
        blocker = n.id;
        // (someone who just won't move: after a while the car creeps on and nudges them aside)
        target = car.blockT > CAR_CREEP_AFTER ? Math.min(target, 1.2) : 0;
        break;
      }
      if (blocker) {
        // (keeps counting if another pedestrian steps in: a crowd on the crossing can't hold a car forever)
        car.blockT = car.blocker === blocker || car.blockT > CAR_HONK_AFTER ? car.blockT + dt : dt;
        car.blocker = blocker;
        if (car.blockT > CAR_HONK_AFTER && car.honkCd <= 0) { car.honkCd = 3; w.emit({ t: "honk", car: car.id, x: car.x, z: car.z }); }
        if (car.blockT > CAR_CLEAR_AFTER) w.npc.clearRoad(blocker, car.yaw, car.x, car.z);
        car.blockGap = 0;
      } else if (car.blocker && car.v < 0.3 && (car.blockGap += dt) < 1) { /* (R13: the walker's flickering in and out of the car's path: keep counting) */ }
      else { car.blockT = 0; car.blocker = ""; car.blockGap = 0; }
      // (held up by pedestrians for ages, whoever they are: creep on and nudge through)
      if (blocker && car.stillT > CAR_CREEP_AFTER + 3) target = Math.max(target, Math.min(1.2, gap < Infinity ? (gap > GAP ? 1.2 : 0) : 1.2, lane.speed));
      if (blocker) { why = "pedestrian"; by = blocker; }
      if (truck.on && blocked(truck.x, truck.z, 2.6)) { target = 0; why = "truck"; by = "truck"; }
      // (R12.3b: a cop car with its siren on has the right of way: you stop if it's in your path, unless it's waiting
      //  for YOU (it can't get past you), then you go first. One with its siren off is in the lanes like anyone else.)
      if (!car.cop) for (const c of w.police.cars) if (!c.ride && c.waitFor !== car.id && blocked(c.x, c.z, 2.6)) { target = 0; why = "police"; by = c.id; break; }
      for (const b of bodies) if (blocked(b.x, b.z, b.r + 1.8)) { target = 0; why = "parade"; by = "parade"; break; } // (R4: the dragon parade and the festa have the street)
      // honk at bandits in the lane (they won't stop for you!)
      car.honkCd = Math.max(0, car.honkCd - dt);
      for (const p of w.players.values()) {
        if (!p.connected || p.respawnT > 0) continue;
        const dx = p.move.x - cx0, dz = p.move.z - cz0, along = dx * fx + dz * fz;
        if (car.honkCd <= 0 && car.v > 3 && along > 0 && along < 16 && Math.abs(dx * fz - dz * fx) < 1.8) {
          car.honkCd = 3;
          w.emit({ t: "honk", car: car.id, x: car.x, z: car.z });
        }
      }
      car.v = target > car.v ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - BRAKE * dt);
      car.stillT = car.v < 0.3 && blocker ? car.stillT + dt : car.v < 0.3 ? car.stillT : 0;
      car.why = car.v < 0.3 ? why || (lane.conn ? "" : "stop line") : ""; car.by = car.why ? by : ""; car.waitT = car.v < 0.3 ? (car.waitT ?? 0) + dt : 0;
      // ---- move along, into the next lane when we reach the end ----
      car.s += car.v * dt;
      while (car.s >= lane.len) {
        if (!lane.conn) {
          if (!nextConn || (!car.go && !this.mayEnter(car, nextConn))) { car.s = lane.len; car.v = 0; break; }
          car.s -= lane.len;
          car.lane = nextConn.id; car.waitSince = -1; car.go = false;
          lane = nextConn;
        } else {
          car.s -= lane.len;
          lane = this.lanes[lane.outLane];
          car.lane = lane.id;
          this.laneUse[lane.id]++;
          car.next = car.goal ? this.toward(car, lane) : this.pickNext(lane, -1);
        }
      }
      laneAtInto(lane, car.s, car);
      if (!car.cop) this.collide(car); // (a cruiser's own bumper is the police's: busts, not splats)
    }
  }

  // ------------------------------------------------------------------ R12.3b: police cars in the lanes
  /** the road lane nearest (x, z) going roughly along `yaw` (within `maxD` m), and how far along it */
  nearestLane(x: number, z: number, yaw: number, maxD = 4): { lane: Lane; s: number; d: number } | null {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best: { lane: Lane; s: number; d: number } | null = null;
    for (const l of this.lanes) {
      if (l.conn || l.len < 6) continue;
      const a = l.pts[0], b = l.pts[l.pts.length - 1];
      // (cheap reject: nowhere near the lane's span)
      if (x < Math.min(a.x, b.x) - maxD - 2 || x > Math.max(a.x, b.x) + maxD + 2 || z < Math.min(a.z, b.z) - maxD - 2 || z > Math.max(a.z, b.z) + maxD + 2) {
        if (l.pts.length < 3) continue;
      }
      for (let i = 0; i < l.pts.length - 1; i++) {
        const p = l.pts[i], q = l.pts[i + 1], ex = q.x - p.x, ez = q.z - p.z, L2 = ex * ex + ez * ez || 1;
        const k = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L2));
        const d = hyp(p.x + ex * k - x, p.z + ez * k - z);
        if (d > maxD || (best && d >= best.d)) continue;
        if ((ex * fx + ez * fz) / Math.sqrt(L2) < 0.5) continue; // (going our way)
        best = { lane: l, s: l.cum[i] + k * Math.sqrt(L2), d };
      }
    }
    return best;
  }
  /** how far (x, z) is from the nearest road lane (any direction) */
  laneDist(x: number, z: number): number {
    let best = Infinity;
    for (const l of this.lanes) { if (l.conn) continue; for (let i = 0; i < l.pts.length; i += 2) { const d = hyp(l.pts[i].x - x, l.pts[i].z - z); if (d < best) best = d; } }
    return best;
  }
  /** a police car pulls into the traffic (null: no lane near enough / no room there right now) */
  join(id: string, x: number, z: number, yaw: number, v: number): CarSim | null {
    const nl = this.nearestLane(x, z, yaw, 3.5);
    if (!nl || nl.s > nl.lane.len - 3) return null;
    // (room: nobody within a car's length either side in that lane)
    for (const o of [...this.cars, ...this.riders]) if (o.lane === nl.lane.id && Math.abs(o.s - nl.s) < GAP) return null;
    const p = laneAt(nl.lane, nl.s);
    const car = carSim(id, nl.lane.id, nl.s, Math.min(v, nl.lane.speed), p.x, p.z, p.yaw, 0, true);
    car.next = this.pickNext(nl.lane, -1);
    this.riders.push(car);
    return car;
  }
  /** a police car pulls out of the traffic */
  leave(car: CarSim) { const i = this.riders.indexOf(car); if (i >= 0) this.riders.splice(i, 1); }
  /** the way on from the end of `lane` toward the car's goal: every lane's driving distance on to the goal (worked
   *  out backwards from the lanes that pass near it), then the connector with the least */
  private toward(car: CarSim, lane: Lane): number {
    const g = car.goal!;
    if (!car.costs || car.costFor !== g) {
      const n = this.lanes.length, cost = new Float64Array(n).fill(Infinity);
      const done = new Uint8Array(n);
      // the lanes that pass the goal (both ways along a road: within 8 m of the nearest, or 14 m): the way along them to
      // their nearest point (+ the gap to the goal itself)
      const reach = Math.max(14, this.laneDist(g.x, g.z) + 8);
      for (const l of this.lanes) {
        if (l.conn) continue;
        let best = Infinity, bd = Infinity;
        for (let i = 0; i < l.pts.length; i += 2) { const d = hyp(l.pts[i].x - g.x, l.pts[i].z - g.z); if (d < reach && d < bd) { bd = d; best = d + l.cum[i]; } }
        if (best < Infinity) cost[l.id] = best;
      }
      // (Dijkstra, backwards; few hundred lanes)
      for (;;) {
        let k = -1, kc = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && cost[i] < kc) { kc = cost[i]; k = i; }
        if (k < 0) break;
        done[k] = 1;
        const L = this.lanes[k];
        // who leads into lane k: a connector leads into its out lane; a road lane into its connectors
        if (!L.conn) { for (const c of this.lanes) if (c.conn && c.outLane === k && !done[c.id]) { const v = kc + c.len; if (v < cost[c.id]) cost[c.id] = v; } }
        else { const inL = L.inLane; if (!done[inL]) { const v = kc + this.lanes[inL].len; if (v < cost[inL]) cost[inL] = v; } }
      }
      car.costs = cost; car.costFor = g;
    }
    let best = -1, bc = Infinity;
    for (const o of lane.outs) if (car.costs[o] < bc && !this.intoClosed(o)) { bc = car.costs[o]; best = o; }
    return best >= 0 ? best : this.pickNext(lane, -1);
  }
  /** (diagnostics / tests) everything that's been stopped a while: who, where, why, held up by what */
  waits(minS = 10): { id: string; lane: number; road: string; why: string; by: string; waitT: number; x: number; z: number }[] {
    return [...this.cars, ...this.riders].filter((c) => (c.waitT ?? 0) >= minS).map((c) => {
      const l = this.lanes[c.lane];
      return { id: c.id, lane: c.lane, road: l.conn ? `junction ${l.node}` : this.net?.edges[l.edge]?.name ?? "?", why: c.why ?? "", by: c.by ?? "", waitT: c.waitT ?? 0, x: c.x, z: c.z };
    });
  }

  /** Anything in the car's footprint: bandits get wiped out, loot gets flung, pedestrians step aside. */
  private collide(car: CarSim) {
    const w = this.w;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const inside = (x: number, z: number, pad: number) => {
      const dx = x - car.x, dz = z - car.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      return Math.abs(along) < CAR_HALF_LEN + pad && Math.abs(side) < CAR_HALF_WIDTH + pad ? { along, side } : null;
    };
    for (const p of w.players.values()) {
      if (!p.connected || p.respawnT > 0 || p.jailT > 0 || p.move.y > 1.4 || p.splatGrace > w.time) continue; // (D1: a grace period after getting up)
      const hit = inside(p.move.x, p.move.z, PLAYER.radius);
      if (!hit) continue;
      if (car.v > 2) this.wipeout(p, car);
      else {
        // barely moving: just get nudged out of the way
        const s = hit.side >= 0 ? 1 : -1;
        p.move.x += fz * s * 0.1; p.move.z += -fx * s * 0.1;
      }
    }
    if (car.v > 2) {
      for (const it of w.items.values()) {
        if (it.mode !== "free" || it.body.y > 1.2) continue;
        const hit = inside(it.body.x, it.body.z, 0.2);
        if (!hit) continue;
        const s = hit.side >= 0 ? 1 : -1;
        w.freeItem(it, it.body.x, Math.max(it.body.y, 0.5), it.body.z, fx * car.v * 0.7 + fz * s * 3, 4, fz * car.v * 0.7 - fx * s * 3);
      }
    }
    for (const n of w.npc.npcs.values()) {
      const hit = inside(n.move.x, n.move.z, 0.4);
      if (!hit) continue;
      const s = hit.side >= 0 ? 1 : -1;
      w.npc.nudge(n.move, fz * s * 0.25, -fx * s * 0.25); // never into a wall or a parked car
    }
  }

  wipeout(p: PlayerSim, car: CarSim) {
    const w = this.w;
    w.props.cancelRob(p);
    // everything you carry flies out across the road
    const items = w.carriedItems(p);
    w.dropAll(p);
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const it of items) {
      if (it.mode !== "free") continue;
      const a = w.random() * Math.PI * 2, sp = SPLAT.scatter * (0.5 + w.random() * 0.8);
      w.freeItem(it, p.move.x, p.move.y + 1.0, p.move.z, fx * car.v * 0.5 + Math.cos(a) * sp, 4 + w.random() * 3, fz * car.v * 0.5 + Math.sin(a) * sp);
    }
    // launched: up and along the way the car was going (and a bit to the side you were standing on)
    const side = (p.move.x - car.x) * fz - (p.move.z - car.z) * fx >= 0 ? 1 : -1;
    const along = Math.max(SPLAT.launchMin, car.v * SPLAT.launchAlong + 3);
    const m = p.move;
    m.vx = fx * along + fz * side * 2.5; m.vz = fz * along - fx * side * 2.5; m.vy = SPLAT.launchUp;
    m.y += 0.05; m.grounded = false;
    m.knockT = WIPEOUT_TIME + 0.05;
    m.mantleT = 0; m.slideT = 0; m.dodgeT = 0; m.crouching = false;
    p.hp = 0; p.hurtT = w.time;
    p.respawnT = WIPEOUT_TIME;
    w.emit({ t: "wipeout", p: p.id, car: car.id, x: p.move.x, z: p.move.z });
  }

  /** D1: the stun's over: you get up right where you landed, with a few seconds' grace from traffic */
  private getUp(p: PlayerSim) {
    p.respawnT = 0;
    p.move.knockT = 0;
    p.move.immuneT = Math.max(p.move.immuneT, 1.5);
    p.splatGrace = this.w.time + SPLAT.grace;
    this.w.emit({ t: "respawn", p: p.id });
  }
}
