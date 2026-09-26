// Phase 3.5: traffic. Cars drive the two ring roads (right-hand lanes, both directions),
// ease round corners, queue behind each other and stop for pedestrians and the garbage truck.
// They do NOT stop for bandits: a moving car that hits you wipes you out (cartoon pancake),
// everything you carried spills on the road, and you respawn at your fort 10 s later.
// Runs inside the World on the server and in solo mode (deterministic: no randomness).
import { makeMoveState } from "./movement.js";
import { PLAYER } from "./constants.js";
import type { TrafficLoop } from "./arena.js";
import type { World, PlayerSim } from "./world.js";

export const CAR_HALF_LEN = 2.1;
export const CAR_HALF_WIDTH = 0.95;
export const WIPEOUT_TIME = 10;
const CORNER = 4; // metres of rounding either side of a corner
const ACCEL = 4, BRAKE = 12;

export interface CarSim { id: string; loop: number; s: number; v: number; x: number; z: number; yaw: number; honkCd: number; color: number; }

export type TrafficEvent =
  | { t: "wipeout"; p: string; car: string; x: number; z: number }
  | { t: "respawn"; p: string }
  | { t: "honk"; car: string; x: number; z: number };

interface LoopGeo { def: TrafficLoop; cum: number[]; len: number; }

function loopGeo(def: TrafficLoop): LoopGeo {
  const cum = [0];
  const pts = def.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { def, cum, len: cum[pts.length] };
}

/** Point on the straight polyline at distance s. */
function onLine(g: LoopGeo, s: number) {
  s = ((s % g.len) + g.len) % g.len;
  const pts = g.def.points;
  let i = 0;
  while (i < pts.length - 1 && s > g.cum[i + 1]) i++;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const seg = g.cum[i + 1] - g.cum[i];
  const k = seg > 0 ? (s - g.cum[i]) / seg : 0;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}

/** Position + heading at distance s, with corners rounded (quadratic curve). */
export function sampleLoop(g: LoopGeo, s: number): { x: number; z: number; yaw: number; corner: boolean } {
  s = ((s % g.len) + g.len) % g.len;
  const pts = g.def.points;
  for (let k = 0; k < pts.length; k++) {
    const S = g.cum[k]; // corner k sits at distance cum[k] (cum[0] = 0 = also the end of the loop)
    let d = s - S;
    if (d > g.len / 2) d -= g.len;
    if (d < -g.len / 2) d += g.len;
    if (Math.abs(d) <= CORNER) {
      const A = onLine(g, S - CORNER), B = onLine(g, S + CORNER), C = pts[k];
      const u = (d + CORNER) / (2 * CORNER);
      const x = (1 - u) * (1 - u) * A.x + 2 * u * (1 - u) * C.x + u * u * B.x;
      const z = (1 - u) * (1 - u) * A.z + 2 * u * (1 - u) * C.z + u * u * B.z;
      const tx = 2 * (1 - u) * (C.x - A.x) + 2 * u * (B.x - C.x);
      const tz = 2 * (1 - u) * (C.z - A.z) + 2 * u * (B.z - C.z);
      return { x, z, yaw: Math.atan2(tx, tz), corner: true };
    }
  }
  const p = onLine(g, s);
  return { x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz), corner: false };
}

export class TrafficSystem {
  readonly cars: CarSim[] = [];
  private loops: LoopGeo[];

  constructor(private w: World) {
    this.loops = (w.arena.traffic ?? []).map(loopGeo);
    let n = 0;
    this.loops.forEach((g, li) => {
      for (let i = 0; i < g.def.cars; i++) {
        const s = (g.len * i) / g.def.cars + li * 7;
        const p = sampleLoop(g, s);
        this.cars.push({ id: "c" + ++n, loop: li, s, v: g.def.speed, x: p.x, z: p.z, yaw: p.yaw, honkCd: 0, color: n % 8 });
      }
    });
  }

  tick(dt: number) {
    const w = this.w;
    // respawn timers for wiped-out bandits
    for (const p of w.players.values()) {
      if (p.respawnT <= 0) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
    }
    const truck = w.match.truck;
    for (const car of this.cars) {
      const g = this.loops[car.loop];
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const rel = (x: number, z: number) => {
        const dx = x - car.x, dz = z - car.z;
        return { along: dx * fx + dz * fz, side: dx * fz - dz * fx };
      };
      // what's ahead?
      let target = g.def.speed * (sampleLoop(g, car.s + 6).corner ? 0.55 : 1);
      const brakeDist = CAR_HALF_LEN + 2.5 + car.v * 0.7;
      const blocked = (x: number, z: number, width: number) => { const r = rel(x, z); return r.along > 0 && r.along < brakeDist && Math.abs(r.side) < width; };
      for (const n of w.npc.npcs.values()) if (blocked(n.move.x, n.move.z, 1.6)) { target = 0; break; }
      if (truck.on && blocked(truck.x, truck.z, 2.6)) target = 0;
      for (const c of w.police.cars) if (blocked(c.x, c.z, 2.6)) { target = 0; break; } // siren = right of way
      for (const o of this.cars) {
        if (o === car || o.loop !== car.loop) continue;
        const gap = (((o.s - car.s) % g.len) + g.len) % g.len;
        if (gap > 0 && gap < 9 + car.v * 0.5) target = Math.min(target, gap < 6.5 ? 0 : o.v);
      }
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
      car.s = (car.s + car.v * dt) % g.len;
      const p = sampleLoop(g, car.s);
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
