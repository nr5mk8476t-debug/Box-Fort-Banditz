// QUEENS: WHO CAN SEE WHOM. A planning model of encounters for a city plan (the active plan): line of sight in plan
// view between two standing players, blocked by every building footprint (all of them are 2+ storeys) and by any tall
// dressing (vans, kiosks, solid fences: `extra`), within a spotting distance. Then players moving along real routes
// over time: when do two of them see each other, where, for how long, and what is each carrying.
//
// ASSUMPTIONS (to check in the playable test): you SPOT a player within 90 m by day and recognise what they carry within
// 60 m; at night 0.6x those. Buildings block sight completely; parked cars, bins, crates, trees and El columns don't
// (you see over or past them standing up). Players inside a shop or landmark can't be seen. Speeds are the MEASURED
// ones (check.ts MEASURED). It's plan geometry, not the renderer: no fog, no crowds, no traffic.
import { P } from "./active.js";
import type { XZ, QRect } from "./plan.js";
import type { QLayout } from "./layout.js";
import { along, polyLen } from "./net.js";
import { MEASURED } from "./check.js";

export const SPOT = { day: 90, recognise: 60, night: 0.6 };

export class Sight {
  private cell = 16; private grid = new Map<string, QRect[]>();
  constructor(lay: QLayout, extra: QRect[] = []) {
    const shrink = (r: QRect): QRect => ({ minX: r.minX + 0.25, maxX: r.maxX - 0.25, minZ: r.minZ + 0.25, maxZ: r.maxZ - 0.25 });
    for (const r of [...lay.buildings.map((b) => b.rect), ...P.units.flatMap((u) => u.parts), ...extra].map(shrink)) {
      for (let gx = Math.floor(r.minX / this.cell); gx <= Math.floor(r.maxX / this.cell); gx++) for (let gz = Math.floor(r.minZ / this.cell); gz <= Math.floor(r.maxZ / this.cell); gz++) {
        const k = gx + "," + gz; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(r);
      }
    }
  }
  /** can a player standing at a see a player standing at b (plan view, buildings and tall dressing block) */
  clear(a: XZ, b: XZ): boolean {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / (this.cell / 2))), seen = new Set<QRect>();
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const r of this.grid.get(`${Math.floor(x / this.cell) + ox},${Math.floor(z / this.cell) + oz}`) ?? []) {
        if (seen.has(r)) continue; seen.add(r);
        if (segHitsRect(a, b, r)) return false;
      }
    }
    return true;
  }
  sees(a: XZ, b: XZ, max = SPOT.day) { return Math.hypot(b[0] - a[0], b[1] - a[1]) <= max && this.clear(a, b); }
}
function segHitsRect(a: XZ, b: XZ, r: QRect) {
  // Liang-Barsky clip
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dz = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.minX], [dx, r.maxX - a[0]], [-dz, a[1] - r.minZ], [dz, r.maxZ - a[1]]] as [number, number][]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

// ---- moving players ---------------------------------------------------------------------------------------------------
export type Load = "empty" | "big" | "heavy" | "giant";
/** a leg of a trip: walk this polyline carrying this; or stay out of sight (inside a shop) for `inside` seconds */
export type Leg = { pts: XZ[]; load: Load; label?: string } | { inside: number; at: XZ; label?: string };
/** metres covered after t seconds with this load (empty: the measured sprint-held curve; big: walking pace; heavy /
 *  giant: the measured carrying speeds) */
export function distAt(load: Load, t: number) {
  if (load === "empty") { const c = MEASURED.sprintCurve, tt = t / MEASURED.streetLoss; for (let i = 1; i < c.length; i++) if (tt <= c[i][0]) return c[i - 1][1] + (c[i][1] - c[i - 1][1]) * (tt - c[i - 1][0]) / (c[i][0] - c[i - 1][0]); return 718 + (tt - 75) * 9.6; }
  return t * (load === "big" ? 6.0 : load === "heavy" ? MEASURED.heavy : MEASURED.giant);
}
export function legTime(l: Leg) {
  if ("inside" in l) return l.inside;
  const L = polyLen(l.pts); let lo = 0, hi = 600; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (distAt(l.load, m) < L) lo = m; else hi = m; } return hi;
}
export interface Mover { name: string; legs: Leg[] }
export interface State { at: XZ; visible: boolean; load: Load; leg: number; label?: string }
export function stateAt(m: Mover, t: number): State {
  let t0 = 0;
  for (let i = 0; i < m.legs.length; i++) {
    const l = m.legs[i], T = legTime(l);
    if (t <= t0 + T || i === m.legs.length - 1) {
      if ("inside" in l) return { at: l.at, visible: false, load: "empty", leg: i, label: l.label };
      return { at: along(l.pts, distAt(l.load, Math.min(T, t - t0))), visible: true, load: l.load, leg: i, label: l.label };
    }
    t0 += T;
  }
  return { at: [0, 0], visible: false, load: "empty", leg: -1 };
}
export const moverTime = (m: Mover) => m.legs.reduce((s, l) => s + legTime(l), 0);

export interface Sighting { a: string; b: string; t0: number; t1: number; atA: XZ; atB: XZ; minD: number; loadA: Load; loadB: Load; recognise: boolean; labelA?: string; labelB?: string }
/** every stretch of time two movers can see each other (dt steps) */
export function sightings(s: Sight, movers: Mover[], opt: { dt?: number; tMax?: number; night?: boolean; scale?: number } = {}): Sighting[] {
  const dt = opt.dt ?? 0.5, tMax = opt.tMax ?? Math.max(...movers.map(moverTime)), k = (opt.night ? SPOT.night : 1) * (opt.scale ?? 1), out: Sighting[] = [];
  for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
    let cur: Sighting | null = null;
    for (let t = 0; t <= tMax; t += dt) {
      const A = stateAt(movers[i], t), B = stateAt(movers[j], t), d = Math.hypot(A.at[0] - B.at[0], A.at[1] - B.at[1]);
      const ok = A.visible && B.visible && d <= SPOT.day * k && s.clear(A.at, B.at);
      if (ok) {
        if (!cur) cur = { a: movers[i].name, b: movers[j].name, t0: t, t1: t, atA: A.at, atB: B.at, minD: d, loadA: A.load, loadB: B.load, recognise: d <= SPOT.recognise * k, labelA: A.label, labelB: B.label };
        cur.t1 = t; if (d < cur.minD) { cur.minD = d; cur.atA = A.at; cur.atB = B.at; cur.loadA = A.load; cur.loadB = B.load; cur.labelA = A.label; cur.labelB = B.label; }
        cur.recognise ||= d <= SPOT.recognise * k;
      } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
  }
  return out;
}
