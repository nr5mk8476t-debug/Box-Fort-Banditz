// QUEENS: the pedestrian network as a graph you can ask for ROUTES (polylines), not just distances. Built from the
// active plan (active.ts): road centre lines, paths and the generated alleys, cut where they cross; every door, gate,
// mat and border point joined to its nearest line; extra points (a camping spot, a waypoint) joined the same way.
// Used by the Compact Queens report (routes drawn on the map, walked with the real movement code) and sight.ts.
import { P } from "./active.js";
import type { XZ, QPath } from "./plan.js";
import { generate, type QLayout } from "./layout.js";

const sub = (a: XZ, b: XZ): XZ => [a[0] - b[0], a[1] - b[1]];
const len = (a: XZ) => Math.hypot(a[0], a[1]);
function pointSeg(p: XZ, a: XZ, b: XZ) {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  const q: XZ = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { d: len(sub(p, q)), t, q };
}
function segX(a: XZ, b: XZ, c: XZ, d: XZ): [number, number] | null {
  const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const ca = sub(c, a), t = (ca[0] * s[1] - ca[1] * s[0]) / den, u = (ca[0] * r[1] - ca[1] * r[0]) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? [t, u] : null;
}
const segsOf = (pts: XZ[]) => pts.slice(1).map((p, i) => [pts[i], p] as [XZ, XZ]);

export interface Net { nodes: XZ[]; adj: [number, number][][]; at: Map<string, number>; lay: QLayout }
/** the graph; `extra` = named points to join (key -> point) */
export function buildNet(extra: Record<string, XZ> = {}, lay: QLayout = generate()): Net {
  const lines: [XZ, XZ][] = [];
  for (const r of P.roads) lines.push(...segsOf(r.pts));
  for (const p of [...P.paths, ...lay.alleys] as QPath[]) lines.push(...segsOf(p.pts));
  const cuts: number[][] = lines.map(() => [0, 1]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const x = segX(lines[i][0], lines[i][1], lines[j][0], lines[j][1]);
    if (x) { cuts[i].push(x[0]); cuts[j].push(x[1]); }
    for (const [k, l] of [[i, j], [j, i]]) for (const e of lines[k]) { const ps = pointSeg(e, lines[l][0], lines[l][1]); if (ps.d < 0.6) cuts[l].push(ps.t); }
  }
  const att: { key: string; p: XZ }[] = [];
  for (const u of P.units) { att.push({ key: "door:" + u.id, p: u.door }); if (u.back) att.push({ key: "back:" + u.id, p: u.back }); }
  for (const f of P.forts) att.push({ key: "front:" + f.id, p: f.front }, { key: "rear:" + f.id, p: f.rear });
  for (const [k, p] of Object.entries(P.border)) att.push({ key: "border:" + k, p });
  for (const [k, p] of Object.entries(extra)) att.push({ key: k, p });
  const near = att.map((a) => { let best = { i: -1, d: 1e9, t: 0, q: [0, 0] as XZ }; lines.forEach((l, i) => { const r = pointSeg(a.p, l[0], l[1]); if (r.d < best.d) best = { i, d: r.d, t: r.t, q: r.q }; }); cuts[best.i].push(best.t); return best; });
  const nodes: XZ[] = [], key = new Map<string, number>();
  const node = (p: XZ) => { const k = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`; let n = key.get(k); if (n === undefined) { n = nodes.length; nodes.push(p); key.set(k, n); } return n; };
  const edges: [number, number][] = [];
  lines.forEach((l, i) => { const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b); for (let k = 1; k < ts.length; k++) { const p = (t: number): XZ => [l[0][0] + (l[1][0] - l[0][0]) * t, l[0][1] + (l[1][1] - l[0][1]) * t]; edges.push([node(p(ts[k - 1])), node(p(ts[k]))]); } });
  const at = new Map<string, number>();
  att.forEach((a, k) => { const n = nodes.length; nodes.push(a.p); at.set(a.key, n); edges.push([n, node(near[k].q)]); });
  for (const f of P.forts) { const n = nodes.length; nodes.push(f.mat); at.set("mat:" + f.id, n); edges.push([n, at.get("front:" + f.id)!], [n, at.get("rear:" + f.id)!]); }
  const adj: [number, number][][] = nodes.map(() => []);
  for (const [a, b] of edges) { const w = len(sub(nodes[a], nodes[b])); adj[a].push([b, w]); adj[b].push([a, w]); }
  return { nodes, adj, at, lay };
}

/** the shortest route between two named points (or via waypoints, in order), as a polyline, with its length.
 *  `avoid`: edges within this many metres of any of these points cost 4x (to find "the other way round") */
export function route(net: Net, keys: string[], avoid: { p: XZ; r: number }[] = []): { pts: XZ[]; dist: number } {
  const pts: XZ[] = []; let dist = 0;
  for (let i = 1; i < keys.length; i++) {
    const s = net.at.get(keys[i - 1]), t = net.at.get(keys[i]);
    if (s === undefined || t === undefined) throw new Error(`no such point: ${s === undefined ? keys[i - 1] : keys[i]}`);
    const n = net.nodes.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n); d[s] = 0;
    const cost = (a: number, b: number, w: number) => { if (!avoid.length) return w; const m: XZ = [(net.nodes[a][0] + net.nodes[b][0]) / 2, (net.nodes[a][1] + net.nodes[b][1]) / 2]; return avoid.some((v) => len(sub(m, v.p)) < v.r) ? w * 4 : w; };
    for (;;) { let u = -1, best = Infinity; for (let k = 0; k < n; k++) if (!done[k] && d[k] < best) { best = d[k]; u = k; } if (u < 0 || u === t) break; done[u] = 1; for (const [v, w] of net.adj[u]) { const c = d[u] + cost(u, v, w); if (c < d[v]) { d[v] = c; prev[v] = u; } } }
    const seq: number[] = []; for (let v = t; v >= 0; v = prev[v]) { seq.unshift(v); if (v === s) break; }
    for (let k = 1; k < seq.length; k++) dist += len(sub(net.nodes[seq[k]], net.nodes[seq[k - 1]]));
    for (const v of seq) { const p = net.nodes[v]; if (!pts.length || len(sub(pts[pts.length - 1], p)) > 0.01) pts.push(p); }
  }
  return { pts, dist };
}

/** where a traveller is after `d` metres along a polyline */
export function along(pts: XZ[], d: number): XZ {
  for (let i = 1; i < pts.length; i++) { const L = len(sub(pts[i], pts[i - 1])); if (d <= L) return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * d / L, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * d / L]; d -= L; }
  return pts[pts.length - 1];
}
export const polyLen = (pts: XZ[]) => segsOf(pts).reduce((s, [a, b]) => s + len(sub(b, a)), 0);
