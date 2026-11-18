// QUEENS: the BLOCK GENERATOR. Turns each block's typology (plan.ts) into building footprints, service alleys,
// courtyards and yards, around the units placed in it. Deterministic (seeded by the block's id): the same plan always
// gives the same city. Pure data: no game state, no meshes. The blockout (Stage 2) builds exactly these footprints.
//
// The typologies (the brief's reusable block arrangements):
//   row          attached buildings along every street side (shops below, flats above), a 5 m service alley down the
//                middle with back yards either side; long blocks get pedestrian cut-throughs every ~120 m
//   courtyard    buildings all round a shared courtyard, two pedestrian entrances on opposite sides
//   workshop     a row on one side, single-storey garages opposite, a loading yard open to the street between
//   destination  a big building (the pub, the club) with smaller neighbours along the rest of the frontage
//   civic        the police and the courtyard behind it
//   precinct     a landmark with its forecourt / drop-off / service yard, neighbours along the remaining frontage
import { P } from "./active.js";
import { type QRect, type Side, type QBlock, type Style, type XZ, type QPath, R } from "./plan.js";

export type Use = "mixed" | "apartment" | "corner" | "garage" | "office";
export interface QBuilding { id: string; block: string; rect: QRect; floors: number; use: Use; face: Side; style: Style }
export interface QGround { block: string; kind: "yard" | "court" | "loading" | "parking"; rect: QRect }
export interface QLayout { buildings: QBuilding[]; alleys: QPath[]; grounds: QGround[] }

const overlap = (a: QRect, b: QRect, m = 0) => a.minX < b.maxX + m && b.minX < a.maxX + m && a.minZ < b.maxZ + m && b.minZ < a.maxZ + m;
const area = (r: QRect) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909), (h >>> 0) / 4294967296)); }
const DEPTH: Record<Style, number> = { low: 14, mid: 15, high: 16, special: 14, home: 14 };
const FLOORS: Record<Style, [number, number]> = { low: [2, 4], mid: [3, 5], high: [4, 7], special: [3, 5], home: [1, 1] };
const WIDTHS: Record<Style, number[]> = { low: [7, 8, 9, 10, 11], mid: [8, 10, 11, 12, 13], high: [11, 12, 14, 16], special: [10, 12, 14], home: [8] };

/** a path's corridor as a rectangle (axis-aligned segments only; that's all the plan uses) */
function pathRects(p: QPath): QRect[] {
  const out: QRect[] = [];
  for (let i = 1; i < p.pts.length; i++) { const [a, b] = [p.pts[i - 1], p.pts[i]], h = p.w / 2; out.push(R(Math.min(a[0], b[0]) - h, Math.max(a[0], b[0]) + h, Math.min(a[1], b[1]) - h, Math.max(a[1], b[1]) + h)); }
  return out;
}
/** the strip under the elevated line, as a test */
function underRail(r: QRect) {
  const pts = P.rail.pts, half = P.rail.clear + P.rail.deckW / 2 - 1;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    // sample the rectangle's edges and centre against the segment
    const ps: XZ[] = [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ], [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2]];
    for (let k = 0; k <= 40; k++) { const t = k / 40, q: XZ = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; if (q[0] > r.minX - half && q[0] < r.maxX + half && q[1] > r.minZ - half && q[1] < r.maxZ + half) {
      // the nearest point of the rectangle to q
      const nx = Math.max(r.minX, Math.min(r.maxX, q[0])), nz = Math.max(r.minZ, Math.min(r.maxZ, q[1]));
      if (Math.hypot(nx - q[0], nz - q[1]) < half) return true;
    } }
    void ps;
  }
  return false;
}

export function generate(): QLayout {
  const buildings: QBuilding[] = [], alleys: QPath[] = [], grounds: QGround[] = [];
  const fixed: QRect[] = [];
  for (const u of P.units) { fixed.push(...u.parts); for (const g of u.grounds ?? []) fixed.push(g.rect); }
  for (const p of P.paths) fixed.push(...pathRects(p));
  for (const b of P.blocks) blockLayout(b, fixed, buildings, alleys, grounds);
  // nothing under the elevated line (that strip is columns, parking and garages' yards)
  const keep = buildings.filter((x) => !underRail(x.rect));
  return { buildings: keep, alleys, grounds };
}

function blockLayout(b: QBlock, fixed: QRect[], out: QBuilding[], alleys: QPath[], grounds: QGround[]) {
  const rand = rng(b.id), D = b.depth ?? P.depth?.[b.style] ?? DEPTH[b.style], [f0, f1] = b.floors ?? FLOORS[b.style], widths = WIDTHS[b.style];
  const floors = () => f0 + Math.floor(rand() * (f1 - f0 + 1));
  let n = 0;
  const gapRects: QRect[] = []; // (shared by the block's parts: an alley in one part keeps the next part's buildings off it)
  b.rects.forEach((part, pi) => {
    const r = part.r, sides = new Set(part.sides), type = b.type;
    const blocked: QRect[] = fixed.filter((f) => overlap(f, r));
    // ---- the service alley (rows, destinations) and cut-throughs ----
    const lenX = r.maxX - r.minX, lenZ = r.maxZ - r.minZ;
    const alleyAxis = b.alley && pi === 0 ? b.alley : undefined;
    if (alleyAxis && (type === "row" || type === "destination" || type === "workshop")) {
      const span = alleyAxis === "x" ? lenZ : lenX;
      if (span >= 2 * D + 5 + 6) {
        // an alley runs on across the pavement to the road's centre line only where a road actually meets its end
        const ext = (s: Side) => (sides.has(s) ? roadHalfAt(s, r, alleyAxis === "x" ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2) : 0);
        const at = (m: number): XZ[] => alleyAxis === "x" ? [[r.minX - ext("W"), m], [r.maxX + ext("E"), m]] : [[m, r.minZ - ext("S")], [m, r.maxZ + ext("N")]];
        // the middle, or the nearest line beside it that misses every shop, landmark and path already placed
        const centre = alleyAxis === "x" ? (r.minZ + r.maxZ) / 2 : (r.minX + r.maxX) / 2;
        let mid = centre;
        for (let k = 0; k < 20; k++) { const m = centre + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2; if (!fixed.some((f) => pathRects({ id: "", kind: "alley", w: 5, pts: at(m) }).some((q) => overlap(q, f)))) { mid = m; break; } }
        const a: QPath = { id: `al_${b.id}`, kind: "alley", w: 5, pts: at(mid) };
        alleys.push(a); gapRects.push(...pathRects(a));
        // cut-throughs across long blocks
        const along = alleyAxis === "x" ? lenX : lenZ;
        const cuts = Math.floor(along / 120);
        for (let k = 1; k <= cuts; k++) {
          const c = alleyAxis === "x" ? r.minX + (along * k) / (cuts + 1) : r.minZ + (along * k) / (cuts + 1);
          const ec = (sd: Side) => (sides.has(sd) ? roadHalfAt(sd, r, c) : 0);
          const cp: XZ[] = alleyAxis === "x" ? [[c, r.minZ - ec("S")], [c, r.maxZ + ec("N")]] : [[r.minX - ec("W"), c], [r.maxX + ec("E"), c]];
          const ca: QPath = { id: `cut_${b.id}_${k}`, kind: "walk", w: 4, pts: cp };
          if (!fixed.some((f) => pathRects(ca).some((q) => overlap(q, f)))) { alleys.push(ca); gapRects.push(...pathRects(ca)); }
        }
      }
    }
    if (type === "courtyard" || (type === "civic" && pi === 1)) {
      // two pedestrian entrances, on opposite sides, and the walk through the court
      const mx = (r.minX + r.maxX) / 2;
      const ext = (s: Side) => (sides.has(s) ? roadHalfAt(s, r, mx) : 0);
      const w: QPath = { id: `court_${b.id}_${pi}`, kind: "walk", w: 5, pts: [[mx, r.minZ - ext("S")], [mx, r.maxZ + ext("N")]] };
      if (!fixed.some((f) => pathRects(w).some((q) => overlap(q, f)))) { alleys.push(w); gapRects.push(...pathRects(w)); }
      grounds.push({ block: b.id, kind: "court", rect: R(r.minX + D, r.maxX - D, r.minZ + D, r.maxZ - D) });
    }
    // ---- frontage strips ----
    const strips: { s: Side; rect: QRect; axis: "x" | "z" }[] = [];
    const hasN = sides.has("N"), hasS = sides.has("S");
    const garageSide: Side | null = type === "workshop" ? (hasS ? "S" : "N") : null;
    for (const s of ["N", "S", "E", "W"] as Side[]) {
      if (!sides.has(s)) continue;
      if (type === "workshop" && s === "E") continue; // the loading yard opens east
      const d = s === garageSide ? 10 : D;
      if (s === "N") strips.push({ s, axis: "x", rect: R(r.minX, r.maxX, r.maxZ - d, r.maxZ) });
      if (s === "S") strips.push({ s, axis: "x", rect: R(r.minX, r.maxX, r.minZ, r.minZ + d) });
      if (s === "E") strips.push({ s, axis: "z", rect: R(r.maxX - D, r.maxX, r.minZ + (hasS ? D : 0), r.maxZ - (hasN ? D : 0)) });
      if (s === "W") strips.push({ s, axis: "z", rect: R(r.minX, r.minX + D, r.minZ + (hasS ? D : 0), r.maxZ - (hasN ? D : 0)) });
    }
    for (const st of strips) {
      const lo = st.axis === "x" ? st.rect.minX : st.rect.minZ, hi = st.axis === "x" ? st.rect.maxX : st.rect.maxZ;
      // what's already there along this strip
      const cuts: [number, number][] = [];
      for (const f of [...blocked, ...gapRects]) if (overlap(f, st.rect)) cuts.push(st.axis === "x" ? [f.minX, f.maxX] : [f.minZ, f.maxZ]);
      cuts.sort((a, c) => a[0] - c[0]);
      const free: [number, number][] = []; let at = lo;
      for (const [c0, c1] of cuts) { if (c0 > at) free.push([at, Math.min(c0, hi)]); at = Math.max(at, c1); }
      if (at < hi) free.push([at, hi]);
      for (const [a0, a1] of free) {
        let x = a0;
        while (a1 - x >= 5) {
          let w = st.s === garageSide ? 6 : widths[Math.floor(rand() * widths.length)];
          if (a1 - x - w < 5) w = a1 - x; // no slivers: the last one takes the rest
          const corner = st.axis === "x" && ((Math.abs(x - r.minX) < 0.01 && sides.has("W")) || (Math.abs(x + w - r.maxX) < 0.01 && sides.has("E")));
          if (corner) w = Math.min(a1 - x, D + 2);
          const rect = st.axis === "x" ? R(x, x + w, st.rect.minZ, st.rect.maxZ) : R(st.rect.minX, st.rect.maxX, x, x + w);
          const use: Use = st.s === garageSide ? "garage" : corner ? "corner" : b.style === "high" || b.style === "special" ? (rand() < 0.4 ? "office" : "mixed") : rand() < 0.65 ? "mixed" : "apartment";
          out.push({ id: `${b.id}_${++n}`, block: b.id, rect, floors: use === "garage" ? 1 : use === "corner" ? floors() + 1 : floors(), use, face: st.s, style: b.style });
          x += w;
        }
      }
    }
    // ---- deep back yards: a line of lock-up garages along the service alley (Queens' back lanes) ----
    const al = alleys.find((x) => x.id === `al_${b.id}`);
    if (al && pi === 0 && (type === "row" || type === "destination")) {
      const horiz = al.pts[0][1] === al.pts[1][1], m = horiz ? al.pts[0][1] : al.pts[0][0];
      for (const dir of [-1, 1]) {
        const backOfRow = horiz ? (dir < 0 ? r.minZ + (hasS ? D : 0) : r.maxZ - (hasN ? D : 0)) : (dir < 0 ? r.minX + (sides.has("W") ? D : 0) : r.maxX - (sides.has("E") ? D : 0));
        const yardDepth = Math.abs(m + dir * 2.5 - backOfRow);
        if (yardDepth < 26) continue;
        const g0 = m + dir * 2.5, g1 = g0 + dir * 8, lo = horiz ? r.minX + (sides.has("W") ? D : 0) + 4 : r.minZ + (hasS ? D : 0) + 4, hi = horiz ? r.maxX - (sides.has("E") ? D : 0) - 4 : r.maxZ - (hasN ? D : 0) - 4;
        for (let x = lo; x + 6 <= hi; x += 6.5) {
          const rect = horiz ? R(x, x + 6, Math.min(g0, g1), Math.max(g0, g1)) : R(Math.min(g0, g1), Math.max(g0, g1), x, x + 6);
          if ([...fixed, ...gapRects].some((f) => overlap(f, rect)) || out.some((o) => overlap(o.rect, rect))) continue;
          out.push({ id: `${b.id}_${++n}`, block: b.id, rect, floors: 1, use: "garage", face: horiz ? (dir < 0 ? "N" : "S") : dir < 0 ? "E" : "W", style: b.style });
        }
      }
    }
    // ---- the open ground left inside: back yards, a loading yard, parking ----
    if (type === "workshop") grounds.push({ block: b.id, kind: "loading", rect: R(r.minX + D, r.maxX, r.minZ + 10, r.maxZ - D) });
    else if (type === "row" || type === "destination") grounds.push({ block: b.id, kind: rand() < 0.3 ? "parking" : "yard", rect: R(r.minX + (sides.has("W") ? D : 0), r.maxX - (sides.has("E") ? D : 0), r.minZ + (hasS ? D : 0), r.maxZ - (hasN ? D : 0)) });
  });
}

/** how far a block's edge is from the centre line of the road it faces, at `along` (so an alley reaches the road);
 *  0 when no road is right there (the alley then stops at the block's edge: a back-yard lane) */
function roadHalfAt(s: Side, r: QRect, along?: number): number {
  const edge: XZ = s === "N" ? [along ?? (r.minX + r.maxX) / 2, r.maxZ] : s === "S" ? [along ?? (r.minX + r.maxX) / 2, r.minZ] : s === "E" ? [r.maxX, along ?? (r.minZ + r.maxZ) / 2] : [r.minX, along ?? (r.minZ + r.maxZ) / 2];
  let best = 0, bd = 1e9;
  for (const rd of P.roads) for (let i = 1; i < rd.pts.length; i++) {
    const [a, b] = [rd.pts[i - 1], rd.pts[i]], ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2;
    const t = Math.max(0, Math.min(1, ((edge[0] - a[0]) * ab[0] + (edge[1] - a[1]) * ab[1]) / l2));
    const d = Math.hypot(edge[0] - a[0] - ab[0] * t, edge[1] - a[1] - ab[1] * t);
    if (d < bd) { bd = d; best = d; }
  }
  const half = P.roads.reduce((h, rd) => Math.max(h, rd.w / 2 + rd.sw), 0);
  return bd <= half + 0.6 ? best : 0;
}

/** the share of each block's land covered by buildings (units included) */
export function coverage(lay: QLayout) {
  return P.blocks.map((b) => {
    const land = b.rects.reduce((s, p) => s + area(p.r), 0);
    const built = lay.buildings.filter((x) => x.block === b.id).reduce((s, x) => s + area(x.rect), 0) + P.units.filter((u) => u.block === b.id).reduce((s, u) => s + u.parts.reduce((t, p) => t + area(p), 0), 0);
    return { id: b.id, style: b.style, type: b.type, land, built, share: built / land };
  });
}
