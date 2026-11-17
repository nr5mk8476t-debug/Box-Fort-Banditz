// QUEENS OVERHAUL, Stage 1: the plan's CHECKER and ROUTE MODEL. Pure geometry over plan.ts: no game state.
//
//  validate()   every rule the brief asks for that a drawing can't prove: one connected road network; no road in the
//               home block or in the removed zones; nothing built on a road; every door on a public pavement or path
//               and reachable on foot; the four forts equal; the railway's columns clear of every lane, pavement,
//               path and business; the roster (6/5/5 + 4); every material from 2+ businesses.
//  routes()     the pedestrian network (road centre lines + paths, joined wherever they cross; doors and gates joined to
//               the nearest line) and the travel matrix from every fort's mat. Times use speeds MEASURED with the
//               game's own movement code (tests/route-matrix.ts, docs/queens/perf.md): these are plan ESTIMATES
//               until the Stage 2 blockout is walked by the real movement code.
import { Q_ROADS, Q_PATHS, Q_PLOTS, Q_FORTS, Q_REMOVED, Q_CROSSINGS, Q_RAIL, Q_EXTENT, Q_BORDER, Q_MATERIALS, HOME, type XZ, type QRect, type QPlot } from "./plan.js";

// ---- geometry --------------------------------------------------------------------------------------------------------
const sub = (a: XZ, b: XZ): XZ => [a[0] - b[0], a[1] - b[1]];
const len = (a: XZ) => Math.hypot(a[0], a[1]);
export function pointSeg(p: XZ, a: XZ, b: XZ): { d: number; t: number; q: XZ } {
  const ab = sub(b, a), l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  const q: XZ = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { d: len(sub(p, q)), t, q };
}
/** where two segments cross (params on each), or null */
function segX(a: XZ, b: XZ, c: XZ, d: XZ): [number, number] | null {
  const r = sub(b, a), s = sub(d, c), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const ca = sub(c, a), t = (ca[0] * s[1] - ca[1] * s[0]) / den, u = (ca[0] * r[1] - ca[1] * r[0]) / den;
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? [t, u] : null;
}
const inRect = (p: XZ, r: QRect, m = 0) => p[0] >= r.minX - m && p[0] <= r.maxX + m && p[1] >= r.minZ - m && p[1] <= r.maxZ + m;
function rectDist(p: XZ, r: QRect) { const dx = Math.max(r.minX - p[0], 0, p[0] - r.maxX), dz = Math.max(r.minZ - p[1], 0, p[1] - r.maxZ); return Math.hypot(dx, dz); }
/** the distance between a segment and a rectangle (0 if they touch) */
export function segRect(a: XZ, b: XZ, r: QRect): number {
  if (inRect(a, r) || inRect(b, r)) return 0;
  const c: XZ[] = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
  for (let i = 0; i < 4; i++) if (segX(a, b, c[i], c[(i + 1) % 4])) return 0;
  return Math.min(rectDist(a, r), rectDist(b, r), ...c.map((p) => pointSeg(p, a, b).d));
}
const overlap = (a: QRect, b: QRect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const area = (r: QRect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
const segsOf = (pts: XZ[]) => pts.slice(1).map((p, i) => [pts[i], p] as [XZ, XZ]);

export interface Corridor { id: string; kind: string; a: XZ; b: XZ; half: number; lane: number }
/** every road (carriageway + pavements) and path as a corridor */
export function corridors(): Corridor[] {
  const out: Corridor[] = [];
  for (const r of Q_ROADS) for (const [a, b] of segsOf(r.pts)) out.push({ id: r.id, kind: "road:" + r.kind, a, b, half: r.w / 2 + r.sw, lane: r.w / 2 });
  for (const p of Q_PATHS) for (const [a, b] of segsOf(p.pts)) out.push({ id: p.id, kind: "path:" + p.kind, a, b, half: p.w / 2, lane: 0 });
  return out;
}

// ---- the railway's columns ----------------------------------------------------------------------------------------
export interface RailCheck { columns: XZ[]; crossings: { road: string; span: number; ok: boolean }[]; problems: string[] }
export function railColumns(): RailCheck {
  const cor = corridors(), biz = Q_PLOTS.filter((p) => p.kind !== "market");
  const clear = (p: XZ) => cor.every((c) => pointSeg(p, c.a, c.b).d > c.half + 1.0) && biz.every((b) => !inRect(p, b.rect, 0.8)) && inRect(p, Q_EXTENT, -2);
  // sample the line every metre; columns go as far apart as allowed, always on a clear spot
  const pts = Q_RAIL.pts, line: { p: XZ; s: number }[] = [];
  let s0 = 0;
  for (const [a, b] of segsOf(pts)) { const L = len(sub(b, a)); for (let k = 0; k < L; k += 1) line.push({ p: [a[0] + (b[0] - a[0]) * k / L, a[1] + (b[1] - a[1]) * k / L], s: s0 + k }); s0 += L; }
  const columns: XZ[] = [], problems: string[] = [];
  const at: number[] = [0, s0]; // (the line's two ends run on into the backdrop: abutments, not spans)
  let i = line.findIndex((q) => clear(q.p));
  while (i >= 0 && i < line.length) {
    columns.push(line[i].p); at.push(line[i].s);
    let j = Math.min(line.length - 1, i + Q_RAIL.maxColumnGap);
    while (j > i && !clear(line[j].p)) j--;
    if (j === i) { // nothing clear within the gap: a span longer than allowed (the checker reports it)
      j = i + Q_RAIL.maxColumnGap; while (j < line.length && !clear(line[j].p)) j++;
      if (j < line.length) problems.push(`a ${(line[j].s - line[i].s).toFixed(0)} m span at (${line[i].p.map((v) => v.toFixed(0))}) (max ${Q_RAIL.maxColumnGap})`);
    }
    if (j >= line.length - 1) break;
    i = j;
  }
  // every road the line crosses: the clear span between the columns either side
  const crossings: RailCheck["crossings"] = [];
  for (const r of Q_ROADS) for (const [a, b] of segsOf(r.pts)) {
    let s = 0;
    for (const [c, d] of segsOf(pts)) {
      const x = segX(c, d, a, b), L = len(sub(d, c));
      if (x) {
        const sx = s + x[0] * L, before = Math.max(...at.filter((v) => v <= sx), -1e9), after = Math.min(...at.filter((v) => v >= sx), 1e9);
        crossings.push({ road: r.name, span: after - before, ok: after - before <= Q_RAIL.maxColumnGap + 8 });
      }
      s += L;
    }
  }
  return { columns, crossings, problems };
}

// ---- the rules ----------------------------------------------------------------------------------------------------
/** the longest service passage from a back door to the public network */
export const BACK_PASSAGE = 30;
export interface Issue { rule: string; msg: string }
export function validate(): Issue[] {
  const bad: Issue[] = [], fail = (rule: string, msg: string) => bad.push({ rule, msg });
  const cor = corridors(), roads = cor.filter((c) => c.kind.startsWith("road")), home = { minX: -HOME.half, maxX: HOME.half, minZ: -HOME.half, maxZ: HOME.half };
  // 1. one connected road network
  const ids = Q_ROADS.map((r) => r.id), parent = new Map(ids.map((i) => [i, i]));
  const find = (i: string): string => (parent.get(i) === i ? i : find(parent.get(i)!));
  for (const a of roads) for (const b of roads) if (a.id !== b.id && (segX(a.a, a.b, b.a, b.b) || pointSeg(a.a, b.a, b.b).d < 0.6 || pointSeg(a.b, b.a, b.b).d < 0.6)) parent.set(find(a.id), find(b.id));
  const groups = new Set(ids.map(find));
  if (groups.size !== 1) fail("roads connected", `${groups.size} separate road networks: ${[...groups].join(", ")}`);
  // 2. the ring: closed, round the home block, no vehicle road inside the block
  const ring = Q_ROADS.find((r) => r.kind === "ring")!;
  if (len(sub(ring.pts[0], ring.pts.at(-1)!)) > 0.01) fail("ring closed", "the fort block road doesn't close");
  for (const c of roads) if (segRect(c.a, c.b, home) < c.lane) fail("no roads in the block", `${c.id} enters the home block`);
  // 3. the removed roads stay removed
  for (const z of Q_REMOVED) for (const c of roads) if (segRect(c.a, c.b, z.rect) < c.lane) fail("removed roads", `${c.id} runs through the removed ${z.id} (${z.why})`);
  // 4. nothing built on a road or path; plots inside the city, not overlapping each other
  const built = Q_PLOTS.filter((p) => p.kind !== "market");
  for (const p of built) {
    if (!inRect([p.rect.minX, p.rect.minZ], Q_EXTENT) || !inRect([p.rect.maxX, p.rect.maxZ], Q_EXTENT)) fail("inside the city", `${p.id} is outside the city`);
    // (a path that ENDS at this plot's own door or back door is its way in, not something built over)
    const ownWay = (c: Corridor) => c.kind.startsWith("path") && [c.a, c.b].some((e) => [p.door, p.back].some((d) => d && len(sub(e, d)) < 3));
    for (const c of cor) if (!ownWay(c) && segRect(c.a, c.b, p.rect) < c.half - 0.01) fail("nothing on a road", `${p.id} is on ${c.id} (${segRect(c.a, c.b, p.rect).toFixed(1)} m from its centre line, needs ${c.half})`);
    for (const q of built) if (q.id < p.id && overlap(p.rect, q.rect)) fail("plots apart", `${p.id} overlaps ${q.id}`);
    if (overlap(p.rect, home)) fail("plots apart", `${p.id} is in the home block`);
    // 5. doors: the front door on a public pavement/path; the back door (the second way out) within a short service
    //    passage of one (the blockout builds the passage through the block's yards); both at the plot's edge
    for (const [nm, d] of [["door", p.door], ["back", p.back]] as [string, XZ | undefined][]) {
      if (!d) continue;
      const gap = Math.min(...cor.map((c) => pointSeg(d, c.a, c.b).d - c.half));
      if (nm === "door" && gap > 1.0) fail("doors on a pavement", `${p.id}'s door (${d}) isn't on a pavement or path`);
      if (nm === "back" && gap > BACK_PASSAGE) fail("second ways out", `${p.id}'s back door is ${gap.toFixed(0)} m from a pavement or path (max ${BACK_PASSAGE})`);
      if (rectDist(d, p.rect) > 2.6) fail("doors on the plot", `${p.id}'s ${nm} is ${rectDist(d, p.rect).toFixed(1)} m from its plot`);
    }
  }
  // 6. the forts: four, equal, gates where they should be, mats screened
  if (Q_FORTS.length !== 4) fail("four forts", `${Q_FORTS.length} forts`);
  const dims = Q_FORTS.map((f) => `${f.yard.maxX - f.yard.minX}x${f.yard.maxZ - f.yard.minZ}`);
  if (new Set(dims).size !== 1) fail("equal forts", `yard sizes differ: ${dims.join(", ")}`);
  const market = cor.filter((c) => c.kind === "path:market");
  for (const f of Q_FORTS) {
    if (rectDist(f.front, f.yard) > 0.01 || !market.some((c) => pointSeg(f.front, c.a, c.b).d <= c.half + 0.01)) fail("front gates", `${f.id}'s front gate isn't on its yard edge AND a market lane`);
    if (rectDist(f.rear, f.yard) > 0.01 || pointSeg(f.rear, ring.pts[0], ring.pts[1]).d > 99 && false) fail("rear gates", `${f.id}'s rear gate isn't on its yard edge`);
    const onEdge = Math.abs(Math.abs(f.rear[0]) - HOME.half) < 0.01 || Math.abs(Math.abs(f.rear[1]) - HOME.half) < 0.01;
    if (!onEdge) fail("rear gates", `${f.id}'s rear gate doesn't open onto the block's outer pavement`);
    for (const g of [f.front, f.rear]) if (len(sub(g, f.mat)) < 9) fail("mats screened", `${f.id}'s mat is ${len(sub(g, f.mat)).toFixed(1)} m from a gate (min 9)`);
    if (!inRect(f.mat, f.yard)) fail("mats", `${f.id}'s mat is outside its yard`);
  }
  // 6b. crossings: one near every fort's rear gate and every market exit, all of them on the ring road
  for (const c of Q_CROSSINGS) if (pointSeg(c.at, ring.pts[0], ring.pts[1]).d > 0.01 && segsOf(ring.pts).every(([a, b]) => pointSeg(c.at, a, b).d > 0.01)) fail("crossings", `${c.id} isn't on the ring road`);
  for (const f of Q_FORTS) if (!Q_CROSSINGS.some((c) => len(sub(c.at, f.rear)) <= 12)) fail("crossings", `no crossing within 12 m of ${f.id}'s rear gate`);
  for (const e of [[0, 40.5], [0, -40.5], [40.5, 0], [-40.5, 0]] as XZ[]) if (!Q_CROSSINGS.some((c) => len(sub(c.at, e)) < 1)) fail("crossings", `no crossing at the market exit (${e})`);
  // 7. the railway: columns clear, spans over roads short enough
  const rail = railColumns();
  for (const p of rail.problems) fail("railway columns", p);
  for (const c of rail.crossings) if (!c.ok) fail("railway spans", `${c.road}: ${c.span.toFixed(0)} m clear span`);
  // 8. the roster and the materials
  const n = (t: string) => Q_PLOTS.filter((p) => p.kind === "store" && p.tier === t).length;
  if (n("low") !== 6 || n("mid") !== 5 || n("high") !== 5) fail("roster", `stores ${n("low")}/${n("mid")}/${n("high")} (want 6/5/5)`);
  if (Q_PLOTS.filter((p) => p.kind === "landmark").length !== 4) fail("roster", "want 4 landmarks");
  for (const m of Q_MATERIALS) {
    const src = Q_PLOTS.filter((p) => p.materials?.includes(m));
    if (src.length < 2) fail("materials", `${m}: only ${src.length} source(s)`);
  }
  // 9. on foot: every door and border point reachable from every fort
  const g = routes();
  for (const r of g.rows) if (!Number.isFinite(r.dist)) fail("reachable", `${r.fort} can't reach ${r.to}`);
  return bad;
}

// ---- the pedestrian network + travel matrix ------------------------------------------------------------------------
/** MEASURED (docs/queens/perf.md): sprint held from full stamina on open ground (distance at 0/30/45/60/75 s); today's
 *  street routes ran within ~3% of it; carrying an Old CRT TV (heavy: no sprint) 4.3 m/s; dragging the Broken Arcade
 *  Machine alone 2.65 m/s. */
export const MEASURED = { sprintCurve: [[0, 0], [30, 291], [45, 434], [60, 573], [75, 718]] as [number, number][], streetLoss: 1.03, heavy: 4.3, giant: 2.65 };
export function emptyTime(d: number) {
  const c = MEASURED.sprintCurve;
  for (let i = 1; i < c.length; i++) if (d <= c[i][1]) return (c[i - 1][0] + (c[i][0] - c[i - 1][0]) * (d - c[i - 1][1]) / (c[i][1] - c[i - 1][1])) * MEASURED.streetLoss;
  return (75 + (d - 718) / 9.6) * MEASURED.streetLoss;
}
export interface RouteRow { fort: string; to: string; kind: string; tier?: string; dist: number; out: number; heavy: number; giant: number }
export function routes(): { rows: RouteRow[]; nodes: XZ[]; edges: [number, number][] } {
  // all lines (road centre lines + paths), split wherever they cross
  const lines: [XZ, XZ][] = [];
  for (const r of Q_ROADS) lines.push(...segsOf(r.pts));
  for (const p of Q_PATHS) lines.push(...segsOf(p.pts));
  const cuts: number[][] = lines.map(() => [0, 1]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const x = segX(lines[i][0], lines[i][1], lines[j][0], lines[j][1]);
    if (x) { cuts[i].push(x[0]); cuts[j].push(x[1]); }
    // a line ending on another (a T-junction)
    for (const [k, l] of [[i, j], [j, i]]) for (const e of lines[k]) { const ps = pointSeg(e, lines[l][0], lines[l][1]); if (ps.d < 0.6) cuts[l].push(ps.t); }
  }
  // attach points: doors, back doors, fort gates, border points
  type Att = { key: string; p: XZ };
  const att: Att[] = [];
  for (const pl of Q_PLOTS) { att.push({ key: "door:" + pl.id, p: pl.door }); if (pl.back) att.push({ key: "back:" + pl.id, p: pl.back }); }
  for (const f of Q_FORTS) { att.push({ key: "front:" + f.id, p: f.front }, { key: "rear:" + f.id, p: f.rear }); }
  for (const [k, p] of Object.entries(Q_BORDER)) att.push({ key: "border:" + k, p });
  const attNear = att.map((a) => { let best = { i: -1, d: 1e9, t: 0, q: [0, 0] as XZ }; lines.forEach((l, i) => { const r = pointSeg(a.p, l[0], l[1]); if (r.d < best.d) best = { i, d: r.d, t: r.t, q: r.q }; }); cuts[best.i].push(best.t); return best; });
  // nodes (merged within 5 cm) and edges
  const nodes: XZ[] = [], key = new Map<string, number>();
  const node = (p: XZ) => { const k = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)}`; let n = key.get(k); if (n === undefined) { n = nodes.length; nodes.push(p); key.set(k, n); } return n; };
  const edges: [number, number][] = [];
  lines.forEach((l, i) => { const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b); for (let k = 1; k < ts.length; k++) { const p = (t: number): XZ => [l[0][0] + (l[1][0] - l[0][0]) * t, l[0][1] + (l[1][1] - l[0][1]) * t]; edges.push([node(p(ts[k - 1])), node(p(ts[k]))]); } });
  const attNode = new Map<string, number>();
  att.forEach((a, k) => { const n = nodes.length; nodes.push(a.p); attNode.set(a.key, n); edges.push([n, node(attNear[k].q)]); });
  // each fort: the mat, joined to its own two gates (through its yard)
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
    const add = (to: string, kind: string, k: string, tier?: string) => { const dist = d[attNode.get(k)!]; rows.push({ fort: f.id, to, kind, tier, dist, out: emptyTime(dist), heavy: dist / MEASURED.heavy, giant: dist / MEASURED.giant }); };
    for (const p of Q_PLOTS) if (p.kind !== "market") add(p.name, p.kind, "door:" + p.id, p.tier);
    for (const k of Object.keys(Q_BORDER)) add(`${k} border`, "border", "border:" + k);
    for (const g of Q_FORTS) if (g.id !== f.id) { const dist = d[matNode.get(g.id)!]; rows.push({ fort: f.id, to: `${g.id}'s mat`, kind: "fort", dist, out: emptyTime(dist), heavy: dist / MEASURED.heavy, giant: dist / MEASURED.giant }); }
  }
  return { rows, nodes, edges };
}

/** the floor area of each business against today's average store (the R15 "about twice" rule) */
export function floorAreas(originalAvgPlot = 115, wall = 0.3) {
  const orig = (Math.sqrt(originalAvgPlot) - 2 * wall) ** 2;
  return Q_PLOTS.filter((p) => p.kind === "store").map((p: QPlot) => {
    const w = p.rect.maxX - p.rect.minX, d = p.rect.maxZ - p.rect.minZ, usable = (w - 2 * wall) * (d - 2 * wall);
    return { id: p.id, name: p.name, tier: p.tier!, w, d, footprint: area(p.rect), usable, ratio: usable / orig, flag: p.flag };
  });
}
