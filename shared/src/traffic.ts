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
import { makeMoveState } from "./movement.js";
import { PLAYER } from "./constants.js";
import type { RoadNet, RoadEdge } from "./arena.js";
import type { World, PlayerSim } from "./world.js";

export const CAR_HALF_LEN = 2.1;
export const CAR_HALF_WIDTH = 0.95;
export const WIPEOUT_TIME = 10;
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
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
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
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
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
    const l = Math.hypot(q.x - p.x, q.z - p.z), dx = (q.x - p.x) / l, dz = (q.z - p.z) / l;
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
          const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, fx = (b.x - a.x) / l, fz = (b.z - a.z) / l;
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
      const hx = p0.x - p1.x, hz = p0.z - p1.z, hl = Math.hypot(hx, hz) || 1;
      const gx = q1.x - q0.x, gz = q1.z - q0.z, gl = Math.hypot(gx, gz) || 1;
      const ux = hx / hl, uz = hz / hl, vx = gx / gl, vz = gz / gl;
      const cross = ux * vz - uz * vx, dot = ux * vx + uz * vz;
      const bez = (a: { x: number; z: number }, c: { x: number; z: number }, b: { x: number; z: number }) => {
        const n = Math.max(3, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 1.2));
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
      if (Number.isNaN(t) || t < 0 || Math.hypot(c.x - p0.x, c.z - p0.z) > 40 || Math.hypot(c.x - q0.x, c.z - q0.z) > 40) {
        pts = bez(p0, { x: (p0.x + q0.x) / 2, z: (p0.z + q0.z) / 2 }, q0);
      } else {
        // drive on to near the corner, turn (tight for a right turn: never over the kerb), drive on out
        const r = Math.min(Math.hypot(c.x - p0.x, c.z - p0.z), Math.hypot(c.x - q0.x, c.z - q0.z), cross < 0 ? 2.5 : 7);
        const A = { x: c.x - ux * r, z: c.z - uz * r }, B = { x: c.x + vx * r, z: c.z + vz * r };
        pts = [...densify(p0, A).slice(0, -1), ...bez(A, c, B), ...densify(B, q0).slice(1)];
      }
      const pl = polyline(pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1e-4));
      const straight = dot > 0.7;
      const id = lanes.length;
      lanes.push({ id, ...pl, conn: true, edge: -1, from: ins.to, to: ins.to, node: ins.to, inLane: ins.id, outLane: lo.id, straight, speed: straight ? Math.min(ins.speed, lo.speed) : 5.5, outs: [] });
      ins.outs.push(id);
    }
  }
  return lanes;
}

/** Position + heading at distance s along a lane. */
export function laneAt(l: Lane, s: number): { x: number; z: number; yaw: number } {
  s = Math.max(0, Math.min(l.len, s));
  let i = 0, hi = l.pts.length - 2;
  // (binary search: lanes are long)
  while (i < hi) { const m = (i + hi + 1) >> 1; if (l.cum[m] <= s) i = m; else hi = m - 1; }
  const a = l.pts[i], b = l.pts[Math.min(l.pts.length - 1, i + 1)];
  const seg = l.cum[i + 1] - l.cum[i] || 1;
  const k = (s - l.cum[i]) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

export class TrafficSystem {
  readonly cars: CarSim[] = [];
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
      const car: CarSim = { id: "c" + (i + 1), lane: l.id, s, v: l.speed * 0.5, x: p.x, z: p.z, yaw: p.yaw, honkCd: 0, color: (i + 1) % 8, next: -1, blockT: 0, blocker: "", stuckT: 0, waitSince: -1, go: false, stillT: 0 };
      car.next = this.pickNext(l, -1);
      this.cars.push(car);
    }
  }

  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /** Random way on from the end of a road lane (straight on a bit more likely). */
  private pickNext(l: Lane, avoid: number): number {
    const opts = l.outs.filter((o) => o !== avoid);
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
    for (const o of this.cars) {
      if (o === car) continue;
      const ol = this.lanes[o.lane];
      if (ol.conn && ol.node === node && ol.inLane !== inLane) return true;
      if (o.go && o.next >= 0 && this.lanes[o.next].node === node && o.lane !== inLane) return true;
    }
    return false;
  }

  private mayEnter(car: CarSim, conn: Lane): boolean {
    const net = this.net!;
    const node = net.nodes[conn.node];
    const inL = this.lanes[conn.inLane], outL = this.lanes[conn.outLane];
    // don't block the box: room on the road we're heading into (cars in the junction heading there count)
    // (a short road between two junctions holds one car: count everyone heading into it)
    const short = outL.len < 2 * GAP;
    let room = true;
    for (const o of this.cars) {
      if (o === car) continue;
      if (o.lane === outL.id && (short || o.s < GAP + 1)) { room = false; break; }
      const ol = this.lanes[o.lane];
      if (ol.conn && ol.outLane === outL.id && (short || ol.inLane !== inL.id)) { room = false; break; }
    }
    if (!room) return false;
    if (node.ctl === "end") return true;
    if (node.ctl === "light") {
      const st = lightState(net, node.id, inL.edge, this.clock);
      if (st !== "green") return false;
      // (the box has to be clear of cars from the other approaches, e.g. ones that went on amber)
      return !this.boxBusy(car, node.id, inL.id);
    }
    if (node.ctl === "round") {
      const arcIn = net.edges[inL.edge].arc;
      if (arcIn) return true; // already on the ring: priority
      // entering: the ring has to be clear coming toward us
      if (this.boxBusy(car, node.id, inL.id)) return false;
      for (const o of this.cars) {
        if (o === car) continue;
        const ol = this.lanes[o.lane];
        if (!ol.conn && ol.to === node.id && net.edges[ol.edge].arc && ol.len - o.s < 12) return false;
      }
      return true;
    }
    // give way: one approach at a time, first come first served
    if (car.waitSince < 0 || this.boxBusy(car, node.id, inL.id)) return false;
    for (const o of this.cars) {
      if (o === car || o.lane === car.lane || o.waitSince < 0) continue;
      const ol = this.lanes[o.lane];
      if (ol.conn || ol.to !== node.id) continue;
      if (o.waitSince < car.waitSince - 1e-6 || (Math.abs(o.waitSince - car.waitSince) <= 1e-6 && o.id < car.id)) return false;
    }
    return true;
  }

  tick(dt: number) {
    const w = this.w;
    this.clock += dt;
    // respawn timers for wiped-out bandits
    for (const p of w.players.values()) {
      if (p.respawnT <= 0) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
    }
    if (!this.lanes.length) return;
    const truck = w.match.truck;
    for (const car of this.cars) {
      let lane = this.lanes[car.lane];
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const rel = (x: number, z: number) => {
        const dx = x - car.x, dz = z - car.z;
        return { along: dx * fx + dz * fz, side: dx * fz - dz * fx };
      };
      let target = lane.speed;
      // ---- the way ahead: this lane, then the next ones ----
      const nextConn = !lane.conn && car.next >= 0 ? this.lanes[car.next] : null;
      const toEnd = lane.len - car.s;
      // stop line: road lanes end at a junction
      if (!lane.conn && nextConn) {
        if (toEnd < 12 && car.waitSince < 0) car.waitSince = this.clock;
        const ok = toEnd > 12 || car.go || this.mayEnter(car, nextConn);
        if (ok && toEnd < 2 + car.v * 0.4) car.go = true; // committed: too close to stop now
        if (toEnd < 12 && !ok) {
          target = Math.min(target, Math.sqrt(Math.max(0, 2 * 5 * (toEnd - 0.3))));
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
      }
      // cars ahead along our way (this lane + the next two)
      let gap = Infinity;
      {
        const path: Lane[] = [lane];
        if (nextConn) { path.push(nextConn); path.push(this.lanes[nextConn.outLane]); }
        else if (lane.conn) path.push(this.lanes[lane.outLane]);
        for (const o of this.cars) {
          if (o === car) continue;
          const dx0 = o.x - car.x, dz0 = o.z - car.z;
          if (dx0 * dx0 + dz0 * dz0 > (LOOK + 4) * (LOOK + 4)) continue;
          // same lane: simple
          if (o.lane === car.lane) { if (o.s > car.s) gap = Math.min(gap, o.s - car.s); continue; }
          // otherwise: does it sit on our way ahead?
          let acc = -car.s;
          search: for (const pl of path) {
            for (let s = pl === lane ? car.s + 1 : 0; s <= pl.len; s += 1.5) {
              const d = acc + s;
              if (d > LOOK) break search;
              const p = laneAt(pl, s);
              if (Math.abs(p.x - o.x) < 1.7 && Math.abs(p.z - o.z) < 1.7 && Math.hypot(p.x - o.x, p.z - o.z) < 1.7) { gap = Math.min(gap, d); break search; }
            }
            acc += pl.len;
          }
        }
      }
      if (gap < Infinity) target = Math.min(target, gap < GAP ? 0 : Math.sqrt(2 * 5 * (gap - GAP)));
      const brakeDist = CAR_HALF_LEN + 2.5 + car.v * 0.7;
      const blocked = (x: number, z: number, width: number) => { const r = rel(x, z); return r.along > 0 && r.along < brakeDist && Math.abs(r.side) < width; };
      // pedestrians IN the road (people waiting on the curb don't stop traffic)
      let blocker = "";
      for (const n of w.npc.npcs.values()) {
        if (!blocked(n.move.x, n.move.z, 1.6) || !w.npc.onRoad(n.move.x, n.move.z, 0.2)) continue;
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
      } else { car.blockT = 0; car.blocker = ""; }
      // (held up by pedestrians for ages, whoever they are: creep on and nudge through)
      if (blocker && car.stillT > CAR_CREEP_AFTER + 3) target = Math.max(target, Math.min(1.2, gap < Infinity ? (gap > GAP ? 1.2 : 0) : 1.2, lane.speed));
      if (truck.on && blocked(truck.x, truck.z, 2.6)) target = 0;
      for (const c of w.police.cars) if (blocked(c.x, c.z, 2.6)) { target = 0; break; } // siren = right of way
      // honk at bandits in the lane (they won't stop for you!)
      car.honkCd = Math.max(0, car.honkCd - dt);
      for (const p of w.players.values()) {
        if (!p.connected || p.respawnT > 0) continue;
        const r = rel(p.move.x, p.move.z);
        if (car.honkCd <= 0 && car.v > 3 && r.along > 0 && r.along < 16 && Math.abs(r.side) < 1.8) {
          car.honkCd = 3;
          w.emit({ t: "honk", car: car.id, x: car.x, z: car.z });
        }
      }
      car.v = target > car.v ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - BRAKE * dt);
      car.stillT = car.v < 0.3 && blocker ? car.stillT + dt : car.v < 0.3 ? car.stillT : 0;
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
          car.next = this.pickNext(lane, -1);
        }
      }
      const p = laneAt(lane, car.s);
      car.x = p.x; car.z = p.z; car.yaw = p.yaw;
      this.collide(car);
    }
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
      if (!p.connected || p.respawnT > 0 || p.jailT > 0 || p.move.y > 1.4) continue;
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
    w.dropAll(p);
    p.move.vx = Math.sin(car.yaw) * 6; p.move.vz = Math.cos(car.yaw) * 6;
    p.move.knockT = WIPEOUT_TIME + 1;
    p.move.immuneT = WIPEOUT_TIME + 4;
    p.move.mantleT = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    p.respawnT = WIPEOUT_TIME;
    w.emit({ t: "wipeout", p: p.id, car: car.id, x: p.move.x, z: p.move.z });
  }

  private respawn(p: PlayerSim) {
    p.respawnT = 0;
    const sp = this.w.arena.spawns[p.colorIdx % this.w.arena.spawns.length];
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(sp.x, sp.z, sp.yaw), ...keep };
    p.move.immuneT = 3;
    p.queue.length = 0;
    this.w.emit({ t: "respawn", p: p.id });
  }
}
