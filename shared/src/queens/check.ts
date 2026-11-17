// QUEENS: the plan's CHECKER and ROUTE MODEL (layout v2). Pure geometry over plan.ts + layout.ts: no game state.
//
//  validate()   every rule a drawing can't prove: one connected road network; no road in the home block or the
//               removed zones; nothing built on a road or path; doors on pavements, a second way out close by; four
//               equal yards that FIT THE LARGEST PLANNED FORT; crossings at every gate and market exit; the line's
//               columns clear of every lane, pavement, path, building and doorway; the roster (6/5/5 playable first,
//               12/8/6 + 4 planned); every material from 2+ playable shops; no empty neighbourhoods; all reachable.
//  routes()     the pedestrian network (road centre lines, paths, the generated alleys; joined wherever they cross;
//               doors and gates joined to the nearest line) and the travel matrix from every fort's mat. Times use
//               speeds MEASURED with the game's own movement code: ESTIMATES until the blockout is walked for real.
import { Q_ROADS, Q_PATHS, Q_UNITS, Q_FORTS, Q_REMOVED, Q_CROSSINGS, Q_RAIL, Q_EXTENT, Q_BORDER, Q_MATERIALS, Q_BLOCKS, HOME, FORT_MAX, RING, type XZ, type QRect, type QPath } from "./plan.js";
import { generate, coverage, type QLayout } from "./layout.js";

// ---- geometry --------------------------------------------------------------------------------------------------------
const sub = (a: XZ, b: XZ): XZ => [a[0] - b[0], a[1] - b[1]];
const len = (a: XZ) => Math.hypot(a[0], a[1]);
export function pointSeg(p: XZ, a: XZ, b: XZ): { d: number; t: number; q: XZ } {
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
const inRect = (p: XZ, r: QRect, m = 0) => p[0] >= r.minX - m && p[0] <= r.maxX + m && p[1] >= r.minZ - m && p[1] <= r.maxZ + m;
function rectDist(p: XZ, r: QRect) { const dx = Math.max(r.minX - p[0], 0, p[0] - r.maxX), dz = Math.max(r.minZ - p[1], 0, p[1] - r.maxZ); return Math.hypot(dx, dz); }
export function segRect(a: XZ, b: XZ, r: QRect): number {
  if (inRect(a, r) || inRect(b, r)) return 0;
  const c: XZ[] = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
  for (let i = 0; i < 4; i++) if (segX(a, b, c[i], c[(i + 1) % 4])) return 0;
  return Math.min(rectDist(a, r), rectDist(b, r), ...c.map((p) => pointSeg(p, a, b).d));
}
const overlap = (a: QRect, b: QRect) => a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minZ < b.maxZ - 1e-6 && b.minZ < a.maxZ - 1e-6;
const area = (r: QRect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
const segsOf = (pts: XZ[]) => pts.slice(1).map((p, i) => [pts[i], p] as [XZ, XZ]);

let cached: QLayout | null = null;
/** the generated city (cached: the plan is static data) */
export const layout = () => (cached ??= generate());
export const resetLayout = () => { cached = null; };

export interface Corridor { id: string; kind: string; a: XZ; b: XZ; half: number; lane: number }
export function corridors(withAlleys = true): Corridor[] {
  const out: Corridor[] = [];
  for (const r of Q_ROADS) for (const [a, b] of segsOf(r.pts)) out.push({ id: r.id, kind: "road:" + r.kind, a, b, half: r.w / 2 + r.sw, lane: r.w / 2 });
  const paths: QPath[] = [...Q_PATHS, ...(withAlleys ? layout().alleys : [])];
  for (const p of paths) for (const [a, b] of segsOf(p.pts)) out.push({ id: p.id, kind: "path:" + p.kind, a, b, half: p.w / 2, lane: 0 });
  return out;
}
/** everything built: the units' parts and the generated buildings */
export function builtRects(): { id: string; rect: QRect; unit?: string }[] {
  return [...Q_UNITS.flatMap((u) => u.parts.map((rect, i) => ({ id: `${u.id}#${i}`, rect, unit: u.id }))), ...layout().buildings.map((b) => ({ id: b.id, rect: b.rect }))];
}

// ---- the railway's columns ----------------------------------------------------------------------------------------
export interface RailCheck { columns: XZ[]; crossings: { what: string; span: number; ok: boolean }[]; problems: string[] }
export function railColumns(): RailCheck {
  const cor = corridors(), built = builtRects().map((b) => b.rect), doors = Q_UNITS.flatMap((u) => [u.door, ...(u.back ? [u.back] : [])]);
  const grounds = Q_UNITS.flatMap((u) => (u.grounds ?? []).map((g) => g.rect));
  const clear = (p: XZ) => cor.every((c) => pointSeg(p, c.a, c.b).d > c.half + 1.0) && built.every((b) => !inRect(p, b, 0.8)) && grounds.every((g) => !inRect(p, g, 0.5))
    && doors.every((d) => len(sub(d, p)) > 4) && inRect(p, Q_EXTENT, -2);
  const pts = Q_RAIL.pts, line: { p: XZ; s: number }[] = [];
  let s0 = 0;
  for (const [a, b] of segsOf(pts)) { const L = len(sub(b, a)); for (let k = 0; k < L; k += 1) line.push({ p: [a[0] + (b[0] - a[0]) * k / L, a[1] + (b[1] - a[1]) * k / L], s: s0 + k }); s0 += L; }
  const columns: XZ[] = [], problems: string[] = [], at: number[] = [0, s0];
  let i = line.findIndex((q) => clear(q.p));
  while (i >= 0 && i < line.length) {
    columns.push(line[i].p); at.push(line[i].s);
    let j = Math.min(line.length - 1, i + Q_RAIL.maxColumnGap);
    while (j > i && !clear(line[j].p)) j--;
    if (j === i) {
      j = i + Q_RAIL.maxColumnGap; while (j < line.length && !clear(line[j].p)) j++;
      if (j < line.length) problems.push(`a ${(line[j].s - line[i].s).toFixed(0)} m span at (${line[i].p.map((v) => v.toFixed(0))}) (max ${Q_RAIL.maxColumnGap})`);
    }
    if (j >= line.length - 1) break;
    i = j;
  }
  const crossings: RailCheck["crossings"] = [];
  for (const c of cor) {
    let s = 0;
    for (const [p, q] of segsOf(pts)) {
      const x = segX(p, q, c.a, c.b), L = len(sub(q, p));
      if (x) { const sx = s + x[0] * L, before = Math.max(...at.filter((v) => v <= sx)), after = Math.min(...at.filter((v) => v >= sx)); crossings.push({ what: c.id, span: after - before, ok: after - before <= Q_RAIL.maxColumnGap + 8 }); }
      s += L;
    }
  }
  return { columns, crossings, problems };
}

/** the largest planned fort, laid out in each yard (u across its front, v back from its front gate's side) */
export function fortMaxRects(f: (typeof Q_FORTS)[number]): { name: string; rect: QRect }[] {
  const y = f.yard, front = f.front;
  // which side the front gate is on, and that side's direction into the yard
  const side = Math.abs(front[0] - y.maxX) < 0.01 ? "E" : Math.abs(front[0] - y.minX) < 0.01 ? "W" : Math.abs(front[1] - y.maxZ) < 0.01 ? "N" : "S";
  const cu = side === "E" || side === "W" ? (y.minZ + y.maxZ) / 2 : (y.minX + y.maxX) / 2;
  const toRect = (u: number[], v: number[]): QRect => {
    if (side === "E") return { minX: y.maxX - v[1], maxX: y.maxX - v[0], minZ: cu + u[0], maxZ: cu + u[1] };
    if (side === "W") return { minX: y.minX + v[0], maxX: y.minX + v[1], minZ: cu - u[1], maxZ: cu - u[0] };
    if (side === "N") return { minX: cu - u[1], maxX: cu - u[0], minZ: y.maxZ - v[1], maxZ: y.maxZ - v[0] };
    return { minX: cu + u[0], maxX: cu + u[1], minZ: y.minZ + v[0], maxZ: y.minZ + v[1] };
  };
  const out = [{ name: "house + porch", rect: toRect(FORT_MAX.house.u, FORT_MAX.house.v) }, { name: "mat", rect: toRect(FORT_MAX.mat.u, FORT_MAX.mat.v) },
    ...FORT_MAX.shelves.map((s, i) => ({ name: `shelves ${i + 1}`, rect: toRect(s.u, s.v) })), { name: "safe", rect: toRect(FORT_MAX.safe.u, FORT_MAX.safe.v) },
    { name: "workbench", rect: toRect(FORT_MAX.workbench.u, FORT_MAX.workbench.v) }, { name: "board", rect: toRect(FORT_MAX.board.u, FORT_MAX.board.v) },
    ...FORT_MAX.traps.map((t, i) => ({ name: `trap socket ${i + 1}`, rect: toRect(t.u, t.v) }))];
  return out;
}

// ---- the rules ----------------------------------------------------------------------------------------------------
export const BACK_PASSAGE = 30;
export interface Issue { rule: string; msg: string }
export function validate(): Issue[] {
  const bad: Issue[] = [], fail = (rule: string, msg: string) => bad.push({ rule, msg });
  const cor = corridors(), roads = cor.filter((c) => c.kind.startsWith("road")), home: QRect = { minX: -HOME.half, maxX: HOME.half, minZ: -HOME.half, maxZ: HOME.half };
  // 1. one connected road network
  const ids = Q_ROADS.map((r) => r.id), parent = new Map(ids.map((i) => [i, i]));
  const find = (i: string): string => (parent.get(i) === i ? i : find(parent.get(i)!));
  for (const a of roads) for (const b of roads) if (a.id !== b.id && (segX(a.a, a.b, b.a, b.b) || pointSeg(a.a, b.a, b.b).d < 0.6 || pointSeg(a.b, b.a, b.b).d < 0.6)) parent.set(find(a.id), find(b.id));
  const groups = new Set(ids.map(find));
  if (groups.size !== 1) fail("roads connected", `${groups.size} separate road networks: ${[...groups].join(", ")}`);
  // 2. the ring: closed, round the home block; no vehicle road inside it
  const ring = Q_ROADS.find((r) => r.kind === "ring")!;
  if (len(sub(ring.pts[0], ring.pts.at(-1)!)) > 0.01) fail("ring closed", "the fort block road doesn't close");
  for (const c of roads) if (segRect(c.a, c.b, home) < c.lane) fail("no roads in the block", `${c.id} enters the home block`);
  // 3. the removed roads stay removed
  for (const z of Q_REMOVED) for (const c of roads) if (segRect(c.a, c.b, z.rect) < c.lane) fail("removed roads", `${c.id} runs through the removed ${z.id}`);
  // 4. nothing built on a road or path, in the home block, outside the city, or on anything else
  const built = builtRects(), unitOf = new Map(Q_UNITS.map((u) => [u.id, u]));
  const grounds = Q_UNITS.flatMap((u) => (u.grounds ?? []).map((g) => ({ id: `${u.id}:${g.name}`, rect: g.rect, unit: u.id })));
  for (const b of [...built, ...grounds]) {
    const u = b.unit ? unitOf.get(b.unit) : undefined;
    const ownWay = (c: Corridor) => !!u && c.kind.startsWith("path") && [c.a, c.b].some((e) => [u.door, u.back].some((d) => d && len(sub(e, d)) < 3.5));
    if (!inRect([b.rect.minX, b.rect.minZ], Q_EXTENT) || !inRect([b.rect.maxX, b.rect.maxZ], Q_EXTENT)) fail("inside the city", `${b.id} is outside the city`);
    for (const c of cor) if (!ownWay(c) && segRect(c.a, c.b, b.rect) < c.half - 0.01) { fail("nothing on a road", `${b.id} is on ${c.id} (${segRect(c.a, c.b, b.rect).toFixed(1)} m from its line, needs ${c.half})`); break; }
    if (overlap(b.rect, home)) fail("plots apart", `${b.id} is in the home block`);
  }
  const all = [...built, ...grounds];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (all[i].unit && all[i].unit === all[j].unit) continue; // a unit's own parts and grounds may touch
    if (overlap(all[i].rect, all[j].rect)) { fail("plots apart", `${all[i].id} overlaps ${all[j].id}`); }
  }
  // 5. doors: the front on a public pavement or path; the second way out within a short service passage; both at the edge
  for (const u of Q_UNITS) for (const [nm, d] of [["door", u.door], ["back", u.back]] as [string, XZ | undefined][]) {
    if (!d) continue;
    const gap = Math.min(...cor.map((c) => pointSeg(d, c.a, c.b).d - c.half));
    if (nm === "door" && gap > 1.0) fail("doors on a pavement", `${u.id}'s door (${d}) isn't on a pavement or path`);
    if (nm === "back" && gap > BACK_PASSAGE) fail("second ways out", `${u.id}'s back door is ${gap.toFixed(0)} m from a pavement or path`);
    const edge = Math.min(...u.parts.map((p) => rectDist(d, p)), ...(u.grounds ?? []).map((g) => rectDist(d, g.rect)));
    if (edge > 1.5) fail("doors on the building", `${u.id}'s ${nm} is ${edge.toFixed(1)} m from its building`);
  }
  // 6. the forts: four equal yards, the largest planned fort fits each, gates in the right places, mats screened
  if (Q_FORTS.length !== 4) fail("four forts", `${Q_FORTS.length} forts`);
  const dims = Q_FORTS.map((f) => `${f.yard.maxX - f.yard.minX}x${f.yard.maxZ - f.yard.minZ}`);
  if (new Set(dims).size !== 1) fail("equal forts", `yard sizes differ: ${dims.join(", ")}`);
  const market = cor.filter((c) => c.kind === "path:market");
  for (const f of Q_FORTS) {
    if (rectDist(f.front, f.yard) > 0.01 || !market.some((c) => pointSeg(f.front, c.a, c.b).d <= c.half + 0.01)) fail("front gates", `${f.id}'s front gate isn't on its yard edge AND a market lane`);
    const onEdge = Math.abs(Math.abs(f.rear[0]) - HOME.half) < 0.01 || Math.abs(Math.abs(f.rear[1]) - HOME.half) < 0.01;
    if (rectDist(f.rear, f.yard) > 0.01 || !onEdge) fail("rear gates", `${f.id}'s rear gate doesn't open onto the block's outer pavement`);
    for (const g of [f.front, f.rear]) if (len(sub(g, f.mat)) < 9) fail("mats screened", `${f.id}'s mat is ${len(sub(g, f.mat)).toFixed(1)} m from a gate (min 9)`);
    const inner: QRect = { minX: f.yard.minX + FORT_MAX.border, maxX: f.yard.maxX - FORT_MAX.border, minZ: f.yard.minZ + FORT_MAX.border, maxZ: f.yard.maxZ - FORT_MAX.border };
    const fm = fortMaxRects(f);
    for (const p of fm) if (p.rect.minX < inner.minX - 1e-6 || p.rect.maxX > inner.maxX + 1e-6 || p.rect.minZ < inner.minZ - 1e-6 || p.rect.maxZ > inner.maxZ + 1e-6) fail("the largest fort fits", `${f.id}: ${p.name} sticks out of the yard`);
    for (let i = 0; i < fm.length; i++) for (let j = i + 1; j < fm.length; j++) if (overlap(fm[i].rect, fm[j].rect)) fail("the largest fort fits", `${f.id}: ${fm[i].name} overlaps ${fm[j].name}`);
    const matR = fm.find((p) => p.name === "mat")!.rect;
    if (!inRect(f.mat, matR, 0.01)) fail("mats", `${f.id}'s mat isn't where the largest fort puts it`);
  }
  // 6b. crossings: one within 12 m of every rear gate's way across, one at every market exit
  for (const c of Q_CROSSINGS) if (segsOf(ring.pts).every(([a, b]) => pointSeg(c.at, a, b).d > 0.01)) fail("crossings", `${c.id} isn't on the ring road`);
  for (const f of Q_FORTS) { const out: XZ = [f.rear[0] * (RING / HOME.half), f.rear[1] * (RING / HOME.half)]; if (!Q_CROSSINGS.some((c) => len(sub(c.at, out)) <= 12)) fail("crossings", `no crossing near ${f.id}'s rear gate`); }
  for (const e of [[0, RING], [0, -RING], [RING, -6], [-RING, 0]] as XZ[]) if (!Q_CROSSINGS.some((c) => len(sub(c.at, e)) < 1)) fail("crossings", `no crossing at the market exit (${e})`);
  // 7. the railway
  const rail = railColumns();
  for (const p of rail.problems) fail("railway columns", p);
  for (const c of rail.crossings) if (!c.ok) fail("railway spans", `${c.what}: ${c.span.toFixed(0)} m clear span`);
  // 8. the roster and the materials
  const n = (t: string, ph?: string) => Q_UNITS.filter((u) => u.kind === "shop" && u.tier === t && (!ph || u.phase === ph)).length;
  if (n("low", "first") !== 6 || n("mid", "first") !== 5 || n("high", "first") !== 5) fail("roster", `first release ${n("low", "first")}/${n("mid", "first")}/${n("high", "first")} (want 6/5/5)`);
  if (n("low") !== 12 || n("mid") !== 8 || n("high") !== 6) fail("roster", `planned ${n("low")}/${n("mid")}/${n("high")} (want 12/8/6)`);
  if (Q_UNITS.filter((u) => u.kind === "landmark").length !== 4) fail("roster", "want 4 landmarks");
  for (const m of Q_MATERIALS) { const src = Q_UNITS.filter((u) => u.phase === "first" && u.materials?.includes(m)); if (src.length < 2) fail("materials", `${m}: ${src.length} playable source(s)`); }
  // 9. no empty neighbourhoods
  // (workshops keep a loading yard, precincts a forecourt: a lower floor for those)
  for (const c of coverage(layout())) { const min = c.type === "workshop" || c.type === "precinct" ? 0.2 : 0.3; if (c.share < min) fail("no empty blocks", `${c.id}: only ${(c.share * 100).toFixed(0)}% built`); }
  for (const b of Q_BLOCKS) for (const p of b.rects) for (const c of roads) if (segRect(c.a, c.b, p.r) < c.half - 0.01) fail("blocks off the roads", `${b.id} overlaps ${c.id} (${segRect(c.a, c.b, p.r).toFixed(1)} < ${c.half})`);
  // 10. on foot: every door and border point reachable from every fort
  for (const r of routes().rows) if (!Number.isFinite(r.dist)) fail("reachable", `${r.fort} can't reach ${r.to}`);
  return bad;
}

// ---- the pedestrian network + travel matrix ------------------------------------------------------------------------
/** MEASURED (docs/queens/perf.md): sprint held from full stamina on open ground; today's street routes ran within ~3%
 *  of it; carrying an Old CRT TV (heavy: no sprint) 4.3 m/s; dragging the Broken Arcade Machine alone 2.65 m/s. */
export const MEASURED = { sprintCurve: [[0, 0], [30, 291], [45, 434], [60, 573], [75, 718]] as [number, number][], streetLoss: 1.03, heavy: 4.3, giant: 2.65 };
export function emptyTime(d: number) {
  const c = MEASURED.sprintCurve;
  for (let i = 1; i < c.length; i++) if (d <= c[i][1]) return (c[i - 1][0] + (c[i][0] - c[i - 1][0]) * (d - c[i - 1][1]) / (c[i][1] - c[i - 1][1])) * MEASURED.streetLoss;
  return (75 + (d - 718) / 9.6) * MEASURED.streetLoss;
}
export interface RouteRow { fort: string; to: string; id: string; kind: string; tier?: string; phase?: string; dist: number; out: number; heavy: number; giant: number }
let routeCache: { rows: RouteRow[] } | null = null;
export const resetRoutes = () => { routeCache = null; };
export function routes(): { rows: RouteRow[] } {
  if (routeCache) return routeCache;
  const lines: [XZ, XZ][] = [];
  for (const r of Q_ROADS) lines.push(...segsOf(r.pts));
  for (const p of [...Q_PATHS, ...layout().alleys]) lines.push(...segsOf(p.pts));
  const cuts: number[][] = lines.map(() => [0, 1]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const x = segX(lines[i][0], lines[i][1], lines[j][0], lines[j][1]);
    if (x) { cuts[i].push(x[0]); cuts[j].push(x[1]); }
    for (const [k, l] of [[i, j], [j, i]]) for (const e of lines[k]) { const ps = pointSeg(e, lines[l][0], lines[l][1]); if (ps.d < 0.6) cuts[l].push(ps.t); }
  }
  type Att = { key: string; p: XZ };
  const att: Att[] = [];
  for (const u of Q_UNITS) { att.push({ key: "door:" + u.id, p: u.door }); if (u.back) att.push({ key: "back:" + u.id, p: u.back }); }
  for (const f of Q_FORTS) att.push({ key: "front:" + f.id, p: f.front }, { key: "rear:" + f.id, p: f.rear });
  for (const [k, p] of Object.entries(Q_BORDER)) att.push({ key: "border:" + k, p });
  const attNear = att.map((a) => { let best = { i: -1, d: 1e9, t: 0, q: [0, 0] as XZ }; lines.forEach((l, i) => { const r = pointSeg(a.p, l[0], l[1]); if (r.d < best.d) best = { i, d: r.d, t: r.t, q: r.q }; }); cuts[best.i].push(best.t); return best; });
  const nodes: XZ[] = [], key = new Map<string, number>();
  const node = (p: XZ) => { const k = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`; let n = key.get(k); if (n === undefined) { n = nodes.length; nodes.push(p); key.set(k, n); } return n; };
  const edges: [number, number][] = [];
  lines.forEach((l, i) => { const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b); for (let k = 1; k < ts.length; k++) { const p = (t: number): XZ => [l[0][0] + (l[1][0] - l[0][0]) * t, l[0][1] + (l[1][1] - l[0][1]) * t]; edges.push([node(p(ts[k - 1])), node(p(ts[k]))]); } });
  const attNode = new Map<string, number>();
  att.forEach((a, k) => { const n = nodes.length; nodes.push(a.p); attNode.set(a.key, n); edges.push([n, node(attNear[k].q)]); });
  const matNode = new Map<string, number>();
  for (const f of Q_FORTS) { const n = nodes.length; nodes.push(f.mat); matNode.set(f.id, n); edges.push([n, attNode.get("front:" + f.id)!], [n, attNode.get("rear:" + f.id)!]); }
  const adj: [number, number][][] = nodes.map(() => []);
  for (const [a, b] of edges) { const w = len(sub(nodes[a], nodes[b])); adj[a].push([b, w]); adj[b].push([a, w]); }
  const dijkstra = (s: number) => {
    const d = new Float64Array(nodes.length).fill(Infinity), done = new Uint8Array(nodes.length); d[s] = 0;
    for (;;) { let u = -1, best = Infinity; for (let i = 0; i < d.length; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; } if (u < 0) break; done[u] = 1; for (const [v, w] of adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w; }
    return d;
  };
  const rows: RouteRow[] = [];
  for (const f of Q_FORTS) {
    const d = dijkstra(matNode.get(f.id)!);
    const add = (to: string, id: string, kind: string, k: string, tier?: string, phase?: string) => { const dist = d[attNode.get(k)!]; rows.push({ fort: f.id, to, id, kind, tier, phase, dist, out: emptyTime(dist), heavy: dist / MEASURED.heavy, giant: dist / MEASURED.giant }); };
    for (const u of Q_UNITS) add(u.name, u.id, u.kind, "door:" + u.id, u.tier, u.phase);
    for (const k of Object.keys(Q_BORDER)) add(`${k} border`, "border_" + k, "border", "border:" + k);
  }
  return (routeCache = { rows });
}

/** floor areas against today's average store (R15: about twice) */
export function floorAreas(originalAvgPlot = 115, wall = 0.3) {
  const orig = (Math.sqrt(originalAvgPlot) - 2 * wall) ** 2;
  return Q_UNITS.filter((u) => u.kind === "shop").map((u) => {
    const p = u.parts[0], w = p.maxX - p.minX, d = p.maxZ - p.minZ, usable = (w - 2 * wall) * (d - 2 * wall);
    return { id: u.id, name: u.name, tier: u.tier!, phase: u.phase, w, d, usable, ratio: usable / orig, flag: u.flag };
  });
}

/** A PLANNING PROXY for how much city is in view: buildings within the fog's reach (240 m by day, 150 m at night) of
 *  points along every street. Not a rendering measurement: the blockout measures draws and meshes for real. */
export function visibilityProxy() {
  const b = [...layout().buildings.map((x) => x.rect), ...Q_UNITS.flatMap((u) => u.parts)];
  const cs: XZ[] = b.map((r) => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2]);
  const samples: XZ[] = [];
  for (const r of Q_ROADS) for (const [a, c] of segsOf(r.pts)) { const L = len(sub(c, a)); for (let k = 0; k <= L; k += 25) samples.push([a[0] + (c[0] - a[0]) * k / L, a[1] + (c[1] - a[1]) * k / L]); }
  const count = (p: XZ, rad: number) => cs.reduce((s, q) => s + (len(sub(q, p)) <= rad ? 1 : 0), 0);
  const day = samples.map((p) => count(p, 240)), night = samples.map((p) => count(p, 150));
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { buildings: b.length, samples: samples.length, dayMax: Math.max(...day), dayMean: mean(day), nightMax: Math.max(...night), nightMean: mean(night),
    worst: samples[day.indexOf(Math.max(...day))] };
}
export const totalArea = () => Q_BLOCKS.reduce((s, b) => s + b.rects.reduce((t, p) => t + area(p.r), 0), 0);
