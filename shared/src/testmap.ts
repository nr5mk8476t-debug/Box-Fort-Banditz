// TRASHINGTON 500: the SMALLEST PLAYABLE TEST (Blake, 2026-11-18: "yes build the smallest playable test"; "grey boxes
// first"; TR2, 2026-11-20: "shrink the city down to 400 by 400", 18 m yards, 10% faster, the route dressed like his
// photos). The whole 400 x 400 m plan (shared/src/queens/trashington400.ts) as grey boxes, so distances and sightlines are
// the real ones, with only what the test needs open:
//   - the home block: four starter yards (junk lots: no walls, walls come as upgrades), the 20 m market lanes, the stalls
//     as markers;
//   - Stain Way's south end as the one shopping street: PLUG & PRAY REPAIRS (inner side) and FISHY BUSINESS (outer side,
//     next to the pub) open, with shelves; THE SOGGY SHAMROCK a closed shell with WEE MICKEY's yard behind it;
//   - THE MUSEUM OF QUESTIONABLE HISTORY: the forecourt and a narrow public door (people and heavies), one gallery with
//     plinths, a giant exhibit or two, and the GOODS YARD gate (the only way out with a giant);
//   - both ways home from the museum: up Stain Way (quick, in view) or Wood Havoc Lane behind the pub (slower, hidden).
// Everything else is a closed grey block with the plan's name on it (signs on the planned shops), so you can tell where
// you are. No traffic, no police, no passers-by: two players, one scavenge, and what you each saw.
// Picked with ?map=test (both players' pages), setCityMap("test") in code.
import { box, polyBox, canonBoxes, type ArenaLayout, type Box, type FortLot, type Rect, type ShopDef, type SpawnPoint } from "./arena.js";
import { usePlan, layout } from "./queens/check.js";
import { TRASH400, T_HOME, T_RING, T_FORTS, T_STALLS, T_PARK, LOOP_AT, EDGE_AT } from "./queens/trashington400.js";
import type { QRect, QUnit, XZ } from "./queens/plan.js";

/** TR2 (Blake): the test map is faster on foot (TR3: 8%) */
export const TEST_PACE = 1.08; // (TR3, Blake: "10% could be a little bit too fast... only make it 8%")
/** the open units (by plan id) */
export const TEST_OPEN = ["plugpray", "fishy", "museum"] as const;
/** ground height of pavements, blocks and yards (roads are at 0) */
export const KERB = 0.15;
const FLOOR_H = 3.4, WALL = 0.3;
/** the museum's public door: wide enough for a person with a heavy thing, too narrow for a giant (they leave by the
 *  goods yard) */
export const MUSEUM_DOOR_W = 1.3;
const GREY: Record<string, string[]> = {
  low: ["#8f8a84", "#9a948c", "#857f79"], mid: ["#8a938a", "#939b90", "#80897f"], high: ["#8c8f9c", "#959aa6", "#838695"],
  special: ["#7c7a80"], home: ["#8f8a84"],
};
const SIGN_TINT: Record<string, string> = { low: "#c9822e", mid: "#4f9a4a", high: "#7d5bb0", landmark: "#b04040" };

const R = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });
const qr = (r: QRect): Rect => R(r.minX, r.maxX, r.minZ, r.maxZ);
function hash(a: number, b: number) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

/** a - b for axis-aligned rectangles: up to four pieces */
function minus(a: Rect, b: Rect): Rect[] {
  if (b.minX >= a.maxX || b.maxX <= a.minX || b.minZ >= a.maxZ || b.maxZ <= a.minZ) return [a];
  const out: Rect[] = [];
  if (b.minX > a.minX) out.push(R(a.minX, b.minX, a.minZ, a.maxZ));
  if (b.maxX < a.maxX) out.push(R(b.maxX, a.maxX, a.minZ, a.maxZ));
  const x0 = Math.max(a.minX, b.minX), x1 = Math.min(a.maxX, b.maxX);
  if (b.minZ > a.minZ) out.push(R(x0, x1, a.minZ, b.minZ));
  if (b.maxZ < a.maxZ) out.push(R(x0, x1, b.maxZ, a.maxZ));
  return out.filter((r) => r.maxX - r.minX > 0.01 && r.maxZ - r.minZ > 0.01);
}
const minusAll = (list: Rect[], cut: Rect[]) => cut.reduce((acc, c) => acc.flatMap((r) => minus(r, c)), list);
/** a flat slab over a rectangle (ground pieces) */
const slab = (r: Rect, h: number, kind: Box["kind"], color?: string, y0 = 0): Box => ({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, kind, y0), ...(color ? { color } : {}) });

/** which side of a rectangle a point outside it faces, and where along that side */
function sideOf(r: Rect, p: XZ): { side: "N" | "S" | "E" | "W"; at: number } {
  const d = { W: r.minX - p[0], E: p[0] - r.maxX, S: r.minZ - p[1], N: p[1] - r.maxZ };
  const side = (Object.keys(d) as ("N" | "S" | "E" | "W")[]).reduce((a, b) => (d[b] > d[a] ? b : a), "N");
  return { side, at: side === "N" || side === "S" ? p[0] : p[1] };
}

/**
 * A walk-in shell: four walls on the rectangle (a gap of width w at each opening), a roof, a floor at kerb height.
 * Returns the boxes; the inside is r shrunk by the wall.
 */
type Opening = { side: "N" | "S" | "E" | "W"; at: number; w: number; glass?: boolean };
function shell(r: Rect, h: number, openings: Opening[], color: string, out: Box[], sideColor: Partial<Record<"N" | "S" | "E" | "W", string>> = {}) {
  const y0 = KERB, top = KERB + h;
  let col = color;
  const wall = (x0: number, x1: number, z0: number, z1: number) => { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) out.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, "wall", y0), color: col }); };
  for (const side of ["N", "S", "E", "W"] as const) {
    col = sideColor[side] ?? color;
    const along = side === "N" || side === "S";
    const lo = along ? r.minX : r.minZ, hi = along ? r.maxX : r.maxZ;
    const cuts = openings.filter((o) => o.side === side).map((o) => [Math.max(lo, o.at - o.w / 2), Math.min(hi, o.at + o.w / 2), o.glass ? 1 : 0] as [number, number, number]).sort((a, b) => a[0] - b[0]);
    let s = lo;
    const piece = (a: number, b: number) => {
      if (side === "N") wall(a, b, r.maxZ - WALL, r.maxZ); else if (side === "S") wall(a, b, r.minZ, r.minZ + WALL);
      else if (side === "E") wall(r.maxX - WALL, r.maxX, a, b); else wall(r.minX, r.minX + WALL, a, b);
    };
    for (const [a, b] of cuts) { piece(s, a); s = b; }
    piece(s, hi);
    // a lintel over each opening (the roof line stays whole from outside)
    for (const [a, b, glass] of cuts) {
      // a shop window: a sill wall, the glass, the wall above (the lintel below)
      if (glass) {
        const at = (yb: number, hh: number, kind: Box["kind"]) => side === "N" ? box((a + b) / 2, r.maxZ - WALL / 2, b - a, WALL, hh, kind, y0 + yb) : side === "S" ? box((a + b) / 2, r.minZ + WALL / 2, b - a, WALL, hh, kind, y0 + yb)
          : side === "E" ? box(r.maxX - WALL / 2, (a + b) / 2, WALL, b - a, hh, kind, y0 + yb) : box(r.minX + WALL / 2, (a + b) / 2, WALL, b - a, hh, kind, y0 + yb);
        out.push({ ...at(0, 0.8, "wall"), color: col }, { ...at(0.8, 2.0, "glass") });
      }
      const lh = Math.max(0, h - 2.8);
      if (lh <= 0) continue;
      const lb = side === "N" ? box((a + b) / 2, r.maxZ - WALL / 2, b - a, WALL, lh, "wall", y0 + 2.8) : side === "S" ? box((a + b) / 2, r.minZ + WALL / 2, b - a, WALL, lh, "wall", y0 + 2.8)
        : side === "E" ? box(r.maxX - WALL / 2, (a + b) / 2, WALL, b - a, lh, "wall", y0 + 2.8) : box(r.minX + WALL / 2, (a + b) / 2, WALL, b - a, lh, "wall", y0 + 2.8);
      out.push({ ...lb, color: col });
    }
  }
  out.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, 0.3, "roof", top), color });
}

/** a box on the outside of a wall: side of rectangle r, centred `at` along it, standing `off` m out (its own depth d),
 *  w wide, h tall, from height y0 (TR2 dressing: signs, doors, lamps, pipes, bollards) */
function onWall(r: Rect, side: "N" | "S" | "E" | "W", at: number, off: number, w: number, d: number, h: number, y0: number, kind: Box["kind"] = "wall"): Box {
  const o = off + d / 2;
  if (side === "N") return box(at, r.maxZ + o, w, d, h, kind, y0);
  if (side === "S") return box(at, r.minZ - o, w, d, h, kind, y0);
  if (side === "E") return box(r.maxX + o, at, d, w, h, kind, y0);
  return box(r.minX - o, at, d, w, h, kind, y0);
}
const FACE = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] } as const;

export interface TestMapInfo {
  /** the open places: the inside rectangle and the doors (for the recorder, the tests and the HUD) */
  places: { id: string; name: string; inside: Rect; door: XZ; back?: XZ }[];
  /** the museum's goods-yard gate and its public door (the two ways out) */
  museum: { door: XZ; gate: XZ; gallery: Rect };
  /** the named routes home from the museum, as waypoints (for the recorder and the tests) */
  routes: { id: string; name: string; pts: XZ[] }[];
}
export let TEST_INFO: TestMapInfo | null = null;

/** who gets which fort, by join order: a two-player test puts the first two on the WEST side (F1 north-west, F4
 *  south-west), the museum's side, with Stain Way between them and the museum; players 3 and 4 get the east */
export const TEST_SLOT: Record<string, number> = { F1: 0, F4: 1, F2: 2, F3: 3 };
/** TR2: the dressed route's terrace colours and walls (Blake's Stain Way photo: cream, red brick, mauve, tan) */
const TERRACE: [string, NonNullable<Box["wallKind"]>][] = [["#e8d6ad", "render"], ["#b9553f", "brick"], ["#9c7fa3", "render"], ["#d8b48a", "render"], ["#a8473a", "brick"], ["#c9a07a", "brick"], ["#e2c9a0", "render"]];
/** is a footprint on the dressed route: Stain Way's south stretch (either side) or the pub's block (Wood Havoc Lane) */
function onRoute(r: Rect) {
  const A = LOOP_AT, AV = 8, SW = 4, AO = A + AV / 2 + SW, AI = A - AV / 2 - SW, EI = EDGE_AT - 6.5;
  const southStretch = r.maxZ > -A - 2 && r.minZ < 20;
  const stainOuter = r.maxX > -AO - 18 && r.maxX <= -AO + 0.5, stainInner = r.minX >= -AI - 0.5 && r.minX < -AI + 18;
  const pubBlock = r.minX >= -EI - 0.5 && r.maxX <= -AO + 0.5 && r.maxZ <= 6 && r.minZ >= -AI - 0.5;
  return (southStretch && (stainOuter || stainInner)) || pubBlock;
}
const NAV = [-106, -94, -43, -17, -7, 7, 17, 43, 94, 106];

/** canonBoxes plus the wall and window kinds the dressed route chooses (every test box gets both keys, so they stay one
 *  shape). (canonBoxes drops them for every map: see the note in docs/design-decisions TR2) */
function canonTest(boxes: Box[]): Box[] { return canonBoxes(boxes).map((c, i) => Object.assign(c, { wallKind: boxes[i].wallKind, winKind: boxes[i].winKind })); }

export function buildTestMap(): ArenaLayout {
  usePlan(TRASH400);
  const P = TRASH400, lay = layout();
  const boxes: Box[] = [], roads: Rect[] = [], crosswalks: Rect[] = [], decor: NonNullable<ArenaLayout["decor"]> = [];
  const A = LOOP_AT, E = EDGE_AT, HALF = 200;

  // ---- roads: the carriageways at 0, the pavements (and every block's ground) at kerb height ----
  // (TR3: the roundabout is a round road: roadRings, with its outer pavement cut round it below)
  const segs: { a: XZ; b: XZ; w: number; sw: number }[] = [];
  for (const r of P.roads) if (r.kind !== "ring") for (let i = 1; i < r.pts.length; i++) segs.push({ a: r.pts[i - 1], b: r.pts[i], w: r.w, sw: r.sw });
  const segRect = (s: { a: XZ; b: XZ }, half: number, ext: number) => R(Math.min(s.a[0], s.b[0]) - (s.a[0] === s.b[0] ? half : ext), Math.max(s.a[0], s.b[0]) + (s.a[0] === s.b[0] ? half : ext),
    Math.min(s.a[1], s.b[1]) - (s.a[1] === s.b[1] ? half : ext), Math.max(s.a[1], s.b[1]) + (s.a[1] === s.b[1] ? half : ext));
  for (const s of segs) roads.push(segRect(s, s.w / 2, s.w / 2));
  const corridors = segs.map((s) => segRect(s, s.w / 2 + s.sw, s.w / 2 + s.sw));
  for (const p of minusAll(corridors, roads)) boxes.push(slab(p, KERB, "sidewalk"));
  // the roundabout's outer pavement: from the road's outer kerb out to the square where the blocks start (the corners
  // become little pavement squares), in thin wedges, leaving gaps where the spokes cross it
  const ringOut = T_PARK.kerbR + T_HOME.ringW, RO = T_RING + T_HOME.ringW / 2 + T_HOME.ringPave;
  const roadRings = [{ x: 0, z: 0, r0: T_PARK.kerbR, r1: ringOut }];
  {
    const N = 192, toSq = (a: number) => RO / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const hitsRoad = (pts: XZ[]) => roads.some((q) => pts.some(([x, z]) => x > q.minX - 0.3 && x < q.maxX + 0.3 && z > q.minZ - 0.3 && z < q.maxZ + 0.3));
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      // (a wedge never spans a corner of the square: the corners are at 45 degrees, on wedge edges)
      const q: XZ[] = [[ringOut * Math.cos(a0), ringOut * Math.sin(a0)], [ringOut * Math.cos(a1), ringOut * Math.sin(a1)], [toSq(a1) * Math.cos(a1), toSq(a1) * Math.sin(a1)], [toSq(a0) * Math.cos(a0), toSq(a0) * Math.sin(a0)]];
      if (hitsRoad([...q, [((ringOut + toSq(am)) / 2) * Math.cos(am), ((ringOut + toSq(am)) / 2) * Math.sin(am)]])) continue;
      boxes.push(polyBox(q.map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)] as [number, number]), KERB, "sidewalk"));
    }
  }
  // every block's ground (back lanes, yards, the gaps between buildings) at kerb height, flush with the pavements
  for (const b of P.blocks) for (const { r } of b.rects) for (const p of minusAll([qr(r)], [...roads, ...corridors])) boxes.push(slab(p, KERB, "sidewalk", "#a39d94"));
  // the strip between the edge roads and the boundary
  const outer = R(-HALF, HALF, -HALF, HALF), inner = R(-E - 6.5, E + 6.5, -E - 6.5, E + 6.5);
  for (const p of minus(outer, inner)) boxes.push(slab(p, KERB, "sidewalk", "#8d8a84"));
  // the boundary: a high wall all round (the shore / the rail yard / the expressway beyond, not built)
  for (const [x, z, w, d] of [[0, HALF - 0.5, 2 * HALF, 1], [0, -HALF + 0.5, 2 * HALF, 1], [HALF - 0.5, 0, 1, 2 * HALF], [-HALF + 0.5, 0, 1, 2 * HALF]] as const) boxes.push({ ...box(x, z, w, d, 6, "wall", KERB), color: "#6c6a70" });
  // zebra crossings at the market exits and the rear gates (the plan's checked ones)
  for (const c of P.crossings) crosswalks.push(c.across === "z" ? R(c.at[0] - c.w / 2, c.at[0] + c.w / 2, c.at[1] - 4, c.at[1] + 4) : R(c.at[0] - 4, c.at[0] + 4, c.at[1] - c.w / 2, c.at[1] + c.w / 2));

  // ---- TR3: the home block is the ROUNDABOUT MARKET PARK (Blake's reference picture) ----
  // Ground level (the forts' own drawing sits at y = 0). Inside out: the paved plaza with the four market stalls, the
  // four fenced fort plots (rounded at the back to the park's circle and at the front corner to the plaza), the market's
  // paths out to the crossings, a grass verge with trees, the roundabout. No centrepiece (Blake: it would be in the way
  // of loot being dragged home); lamp posts, bunting, benches and the notice board round the edge of the plaza.
  const scenery: NonNullable<ArenaLayout["scenery"]> = [];
  {
    const { plazaR, fenceR, kerbR } = T_PARK, L = T_HOME.lane / 2;
    scenery.push({ kind: "grassdisc", x: 0, z: 0, r: kerbR, h: kerbR - 0.4 }); // (a paved edge, then the lawn)
    const circ = (r: number, n: number, a0 = 0, a1 = Math.PI * 2): XZ[] => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [+(r * Math.cos(a)).toFixed(3), +(r * Math.sin(a)).toFixed(3)] as XZ; });
    // the market's two paths, out to the crossings on the roundabout, and the plaza where they meet
    boxes.push(slab(R(-L, L, -kerbR, kerbR), 0.045, "plaza", "#cdbfa2"), slab(R(-kerbR, kerbR, -L, L), 0.045, "plaza", "#cdbfa2"));
    boxes.push({ ...polyBox(circ(plazaR, 40), 0.05, "plaza"), color: "#d6c6a4" });
    // the four plots: the square yard, clipped to the fence circle (its dirt), with a wooden fence round it: along the two
    // straight sides, round the back arc, round the plaza at the front corner; a gate on the path side, one at the back
    for (const f of T_FORTS) {
      const y = qr(f.yard), sx = Math.sign(y.minX + y.maxX), sz = Math.sign(y.minZ + y.maxZ);
      const inside = (x: number, z: number) => x >= y.minX - 1e-6 && x <= y.maxX + 1e-6 && z >= y.minZ - 1e-6 && z <= y.maxZ + 1e-6;
      const dirt = circ(fenceR, 96).filter(([x, z]) => inside(x, z)).concat([[y.minX, y.minZ], [y.maxX, y.minZ], [y.maxX, y.maxZ], [y.minX, y.maxZ]].filter(([x, z]) => Math.hypot(x, z) <= fenceR) as XZ[]);
      const cx = (y.minX + y.maxX) / 2, cz = (y.minZ + y.maxZ) / 2;
      dirt.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
      boxes.push({ ...polyBox(dirt, 0.042, "plaza"), color: "#a5784c" });
      // the fence: walk the plot's outline (inner corner on the plaza circle, the straight sides, the back on the fence
      // circle), as short straight pieces; gaps for the gates
      const ix = sx * L, iz = sz * L, outer = sx * T_HOME.half, outerZ = sz * T_HOME.half;
      const zc = Math.sqrt(plazaR * plazaR - L * L), xr = Math.sqrt(fenceR * fenceR - T_HOME.half * T_HOME.half);
      const line: XZ[] = [];
      // (1) along the x = ix side (the N-S path) from the plaza out to the far side
      line.push([ix, sz * zc], [ix, outerZ]);
      // (2) along z = outerZ toward the outside, to where the fence circle cuts it
      line.push([sx * xr, outerZ]);
      // (3) round the back arc to the other side
      const aA = Math.atan2(outerZ, sx * xr), aB = Math.atan2(sz * xr, outer);
      let da = aB - aA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      for (let k = 1; k <= 8; k++) { const a = aA + (da * k) / 8; line.push([fenceR * Math.cos(a), fenceR * Math.sin(a)]); }
      // (4) along x = outer back in, then z = iz toward the plaza
      line.push([outer, iz], [sx * zc, iz]);
      // (5) round the plaza's edge back to the start
      const pA = Math.atan2(iz, sx * zc), pB = Math.atan2(sz * zc, ix);
      let pa = pB - pA; while (pa > Math.PI) pa -= 2 * Math.PI; while (pa < -Math.PI) pa += 2 * Math.PI;
      for (let k = 1; k <= 4; k++) { const a = pA + (pa * k) / 4; line.push([plazaR * Math.cos(a), plazaR * Math.sin(a)]); }
      const gates = [{ at: f.front, w: 3.2 }, { at: f.rear, w: 2.6 }];
      for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1], line[i]], Ls = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (Ls < 0.05) continue;
        // split the piece at any gate on it
        const cuts: [number, number][] = [];
        for (const g of gates) { const t = ((g.at[0] - a[0]) * (b[0] - a[0]) + (g.at[1] - a[1]) * (b[1] - a[1])) / (Ls * Ls), px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          if (t > -0.01 && t < 1.01 && Math.hypot(px - g.at[0], pz - g.at[1]) < 0.6) cuts.push([t - g.w / 2 / Ls, t + g.w / 2 / Ls]); }
        cuts.sort((p, q) => p[0] - q[0]);
        let t0 = 0; const runs: [number, number][] = [];
        for (const [c0, c1] of cuts) { if (c0 > t0) runs.push([t0, c0]); t0 = Math.max(t0, c1); }
        if (t0 < 1) runs.push([t0, 1]);
        for (const [r0, r1] of runs) {
          if ((r1 - r0) * Ls < 0.2) continue;
          const p0: XZ = [a[0] + (b[0] - a[0]) * r0, a[1] + (b[1] - a[1]) * r0], p1: XZ = [a[0] + (b[0] - a[0]) * r1, a[1] + (b[1] - a[1]) * r1];
          const nx = -(p1[1] - p0[1]) / Ls * 0.06, nz = (p1[0] - p0[0]) / Ls * 0.06;
          boxes.push({ ...polyBox([[p0[0] + nx, p0[1] + nz], [p1[0] + nx, p1[1] + nz], [p1[0] - nx, p1[1] - nz], [p0[0] - nx, p0[1] - nz]], 1.05, "fence"), color: "#8b6a43" });
        }
      }
      // gate posts with a little flag (the plot's colour) either side of the front gate
      const along = Math.abs(f.front[0]) === L ? "z" : "x";
      for (const s2 of [-1, 1]) {
        const gx = along === "z" ? f.front[0] : f.front[0] + s2 * 1.75, gz = along === "z" ? f.front[1] + s2 * 1.75 : f.front[1];
        boxes.push({ ...box(gx, gz, 0.22, 0.22, 1.5, "fence", 0), color: "#6e5232" });
      }
    }
    // the four stalls on the plaza's diagonals: a counter, four posts, a striped awning, the sign facing the path it
    // serves (a pinwheel, like the forts)
    const STALL: Record<string, { stripe: string; face: [number, number] }> = { sell: { stripe: "#d63c3c", face: [1, 0] }, buy: { stripe: "#1f9e8c", face: [0, -1] }, upgrade: { stripe: "#2f6db5", face: [-1, 0] }, craft: { stripe: "#e8b21f", face: [0, 1] } };
    for (const st of T_STALLS) {
      const r = qr(st.rect), cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, w = r.maxX - r.minX;
      if (st.id === "board") continue;
      const look = STALL[st.id];
      boxes.push({ ...box(cx, cz, w, w, 1.0, "kiosk", 0), color: "#8a6440" });
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) boxes.push({ ...box(cx + px * (w / 2 - 0.12), cz + pz * (w / 2 - 0.12), 0.14, 0.14, 2.3, "fence", 1.0), color: "#6e5232" });
      // the awning: stripes across the stall, alternating its colour and cream, a little proud on the sign side
      const n = 7, sw2 = (w + 0.6) / n;
      for (let k = 0; k < n; k++) {
        const o = -w / 2 - 0.3 + sw2 * (k + 0.5), col = k % 2 ? "#f3ead8" : look.stripe;
        boxes.push({ ...box(look.face[0] ? cx + look.face[0] * 0.3 : cx + o, look.face[1] ? cz + look.face[1] * 0.3 : cz + o, look.face[0] ? w + 0.6 : sw2, look.face[1] ? w + 0.6 : sw2, 0.12, "roof", 3.3), color: col });
      }
      boxes.push({ ...box(cx + look.face[0] * (w / 2 + 0.25), cz + look.face[1] * (w / 2 + 0.25), look.face[1] ? w : 0.12, look.face[0] ? w : 0.12, 0.7, "wall", 2.5), color: "#f3ead8", sign: st.label, face: look.face, signBg: "#f3ead8", signFg: "#3a2a1a", signW: w - 0.3, signY: 2.85 });
      // a few goods on the counter (looks)
      for (const k of [-0.6, 0.5]) boxes.push({ ...box(cx + (look.face[1] ? k : 0), cz + (look.face[0] ? k : 0), 0.45, 0.45, 0.35, "boxes", 1.0), color: k < 0 ? "#c9a06a" : "#7a9cc0" });
    }
    // the notice board at the edge of the south path, benches round the plaza, lamp posts at the path mouths and round
    // the verge, bunting strung across the paths where they meet the plaza
    const bd = qr(T_STALLS.find((x) => x.id === "board")!.rect);
    boxes.push({ ...box((bd.minX + bd.maxX) / 2, (bd.minZ + bd.maxZ) / 2, bd.maxX - bd.minX, bd.maxZ - bd.minZ, 2.0, "board", 0.045), sign: "PARK NOTICES", color: "#7a5a3c", face: [1, 0] });
    for (const [x, z, alongX] of [[-7.5, -2.2, 1], [7.5, 2.2, 1], [2.2, 8.2, 0], [-2.2, -8.2, 0]] as const) {
      boxes.push({ ...box(x, z, alongX ? 1.8 : 0.5, alongX ? 0.5 : 1.8, 0.45, "wall", 0), color: "#8b6a43" });
      boxes.push({ ...box(x + (alongX ? 0 : -0.22 * Math.sign(x)), z + (alongX ? -0.22 * Math.sign(z) : 0), alongX ? 1.8 : 0.08, alongX ? 0.08 : 1.8, 0.5, "wall", 0.45), color: "#7a5a3c" });
    }
    for (const [x, z] of [[L + 0.6, plazaR + 1], [-L - 0.6, -plazaR - 1], [plazaR + 1, -L - 0.6], [-plazaR - 1, L + 0.6]]) decor.push({ kind: "streetlight", x, z });
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; decor.push({ kind: "streetlight", x: (kerbR - 0.9) * Math.cos(a), z: (kerbR - 0.9) * Math.sin(a) }); }
    // bunting: a string across each path just outside the plaza, little flags along it
    const FLAGS = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6", "#e67e22"];
    for (const [axis, sgn] of [["z", 1], ["z", -1], ["x", 1], ["x", -1]] as const) {
      const at = sgn * (plazaR + 1);
      boxes.push({ ...box(axis === "z" ? 0 : at, axis === "z" ? at : 0, axis === "z" ? 2 * L + 1.2 : 0.03, axis === "z" ? 0.03 : 2 * L + 1.2, 0.03, "wall", 3.6), color: "#3a3030" });
      for (let k = 0; k < 9; k++) { const o = -L + 0.3 + (k * (2 * L - 0.6)) / 8; boxes.push({ ...box(axis === "z" ? o : at, axis === "z" ? at : o, axis === "z" ? 0.32 : 0.03, axis === "z" ? 0.03 : 0.32, 0.36, "wall", 3.25), color: FLAGS[k % FLAGS.length] }); }
    }
    // trees round the verge (not in the paths or the crossings), and a few in the plots' back corners
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.07, x = (fenceR + 1) * Math.cos(a), z = (fenceR + 1) * Math.sin(a);
      if (Math.abs(x) < L + 2.5 || Math.abs(z) < L + 2.5) continue;
      boxes.push({ ...box(x, z, 0.5, 0.5, 4.6, "tree", 0) });
    }
  }
  // forts: the box, the mat (pad) in front, facing out of the yard toward the market (the plan's pinwheel)
  const forts: FortLot[] = [];
  for (const f of T_FORTS) {
    const r = qr(f.yard), cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    const dx = Math.sign(Math.round(f.mat[0] - cx)), dz = Math.sign(Math.round(f.mat[1] - cz)), yaw = Math.atan2(dx, dz);
    const fx = f.mat[0] - dx * 6, fz = f.mat[1] - dz * 6;
    boxes.push({ ...box(fx, fz, Math.abs(dx) ? 1.9 : 2.4, Math.abs(dx) ? 2.4 : 1.9, 1.5, "fort", 0) });
    forts.push({ slot: TEST_SLOT[f.id], x: fx, z: fz, padX: f.mat[0], padZ: f.mat[1], yaw, zone: r, backX: f.rear[0], backZ: f.rear[1] });
    // junk-lot dressing: piles in the back corners (walk round them; they hide you a little)
    const back = (u: number, v: number): [number, number] => [fx - dx * v + dz * u, fz - dz * v - dx * u];
    for (const [u, v, w, h] of [[-6.5, 3.5, 2.2, 1.2], [6.5, 4.5, 1.6, 1.7], [-3.5, 6, 2.6, 0.9], [7, -6, 1.4, 1.1]] as const) {
      const [x, z] = back(u, v); if (x > r.minX + 1 && x < r.maxX - 1 && z > r.minZ + 1 && z < r.maxZ - 1 && Math.hypot(x, z) < T_PARK.fenceR - 1.5 && Math.hypot(x, z) > T_PARK.plazaR + 1.5) boxes.push({ ...box(x, z, w, w * 0.8, h, "junk", 0), color: "#6f6250" });
    }
    // (TR2, Blake's photo: a dirt lot with tufts of grass and a few stones)
    for (let k = 0; k < 14; k++) {
      const x = r.minX + 1 + hash(fx + k, fz) * (r.maxX - r.minX - 2), z = r.minZ + 1 + hash(fz - k, fx) * (r.maxZ - r.minZ - 2);
      if (Math.hypot(x - f.mat[0], z - f.mat[1]) < 2.5 || Math.hypot(x - fx, z - fz) < 2.5 || Math.hypot(x, z) > T_PARK.fenceR - 0.8 || Math.hypot(x, z) < T_PARK.plazaR + 0.8) continue;
      if (k % 3) decor.push({ kind: "grass", x, z, w: 0.5 + hash(x, z) * 0.5, d: 0.4 + hash(z, x) * 0.4, h: 0.05 });
      else boxes.push({ ...box(x, z, 0.45, 0.35, 0.14, "junk", 0), color: "#9a9a9e" });
    }
  }

  // ---- the city's buildings: closed grey blocks ----
  for (const b of lay.buildings) {
    const r = qr(b.rect), g = GREY[b.style] ?? GREY.low, h = Math.max(2, b.floors) * FLOOR_H;
    // TR2 (Blake's photos): the test route's buildings in colour, with windows: Stain Way between Gnome Ave and Queasy
    // Blvd (both sides), and the pub's block round Wood Havoc Lane. The rest of the city stays grey.
    const dressed = onRoute(r);
    const t = Math.floor(hash(r.minX, r.minZ) * TERRACE.length);
    boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, "building", KERB), color: dressed ? TERRACE[t][0] : g[Math.floor(hash(r.minX, r.minZ) * g.length)],
      ...(dressed ? { windows: true, wallKind: TERRACE[t][1] } : {}) });
  }
  // the plan's units: open ones built as shells below, the rest closed blocks with their name on the door side
  const places: TestMapInfo["places"] = [], shops: ShopDef[] = [], loot: SpawnPoint[] = [], giantDoors: NonNullable<ArenaLayout["giantDoors"]> = [];
  const open = new Set<string>(TEST_OPEN);
  for (const u of P.units) {
    if (open.has(u.id)) continue;
    const tint = u.kind === "landmark" ? SIGN_TINT.landmark : u.kind === "shop" ? SIGN_TINT[u.tier ?? "low"] : "#5a6a8a";
    u.parts.forEach((pr, i) => {
      const r = qr(pr), h = Math.min(u.kind === "landmark" ? 24 : 30, Math.max(2, u.floors ?? 3) * FLOOR_H), sd = sideOf(r, u.door);
      const face: [number, number] = sd.side === "N" ? [0, 1] : sd.side === "S" ? [0, -1] : sd.side === "E" ? [1, 0] : [-1, 0];
      const pub = u.id === "pub"; // (TR2: THE SOGGY SHAMROCK in its oxblood brick, on the dressed route)
      boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, "building", KERB), color: pub ? "#8e3a2f" : u.phase === "reserved" ? "#9a958c" : "#8e8890",
        ...(pub ? { windows: true, wallKind: "brick" as const, signBg: "#2f5f3a", signFg: "#f0d9a0" } : {}),
        ...(i === 0 ? { sign: u.phase === "reserved" ? `${u.name} (LATER)` : u.name, face } : {}) });
      // a coloured band at the door (tier at a glance from down the street)
      if (i === 0) {
        const t = 0.35, bw = 3.2, [dx, dz] = face;
        boxes.push({ ...box(dz ? Math.max(r.minX + bw / 2, Math.min(r.maxX - bw / 2, u.door[0])) : (dx > 0 ? r.maxX + t / 2 : r.minX - t / 2), dx ? Math.max(r.minZ + bw / 2, Math.min(r.maxZ - bw / 2, u.door[1])) : (dz > 0 ? r.maxZ + t / 2 : r.minZ - t / 2),
          dz ? bw : t, dx ? bw : t, 2.6, "wall", KERB), color: tint });
      }
    });
    for (const g of u.grounds ?? []) boxes.push(slab(qr(g.rect), 0.02, "plaza", "#9b968e", KERB));
  }

  // ---- the two open shops on Stain Way south ----
  const shopShell = (u: QUnit, sid: number, type: ShopDef["type"], pool: string[], look: { front: string; fascia: string; fg: string; wall: string }) => {
    const r = qr(u.parts[0]), sd = sideOf(r, u.door), bk = u.back ? sideOf(r, u.back) : null;
    const h = 4.2, along = sd.side === "N" || sd.side === "S", span = along ? r.maxX - r.minX : r.maxZ - r.minZ, lo = along ? r.minX : r.minZ;
    // (TR2, Blake's photo: a coloured shopfront: the door, a big window beside it with a display in it, the fascia sign)
    const winAt = sd.at - lo > span / 2 ? sd.at - 3.4 : sd.at + 3.4;
    shell(r, h, [{ ...sd, w: 2.4 }, { side: sd.side, at: winAt, w: 3.6, glass: true }, ...(bk ? [{ ...bk, w: 1.6 }] : [])], look.wall, boxes, { [sd.side]: look.front });
    const face = FACE[sd.side] as unknown as [number, number];
    boxes.push({ ...onWall(r, sd.side, lo + span / 2, 0, span - 0.6, 0.3, 1.0, KERB + h - 1.15), color: look.fascia, sign: u.name, face, signBg: look.fascia, signFg: look.fg, signW: Math.min(span - 1.2, 9), signY: KERB + h - 0.65 });
    // door frame and a darker door leaf standing open (looks: the opening is the way in)
    for (const s2 of [-1, 1]) boxes.push({ ...onWall(r, sd.side, sd.at + s2 * 1.32, 0, 0.24, 0.12, 2.8, KERB), color: "#14514b" });
    const inside = R(r.minX + WALL, r.maxX - WALL, r.minZ + WALL, r.maxZ - WALL);
    // in the shop's own frame: v from the door inward, u across
    const [fx, fz] = face, inX = -fx, inZ = -fz;
    const doorPt: XZ = [face[1] ? sd.at : (fx > 0 ? r.maxX : r.minX), face[0] ? sd.at : (fz > 0 ? r.maxZ : r.minZ)];
    const at = (u2: number, v: number): XZ => [doorPt[0] + inX * v + -inZ * u2, doorPt[1] + inZ * v + inX * u2];
    const depth = Math.abs(inX) ? r.maxX - r.minX : r.maxZ - r.minZ, width = Math.abs(inX) ? r.maxZ - r.minZ : r.maxX - r.minX;
    const shelf = (u2: number, v0: number, v1: number) => {
      const [ax, az] = at(u2, v0), [bx, bz] = at(u2, v1);
      const b = box((ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) || 0.9, Math.abs(bz - az) || 0.9, 1.6, "shelf", KERB);
      boxes.push(b);
      for (let v = v0 + 1; v < v1; v += 2) { const [x, z] = at(u2, v); loot.push({ x, y: KERB + 1.6, z, zone: "shop", pool, shop: sid, tier: 0 }); }
    };
    const half = width / 2 - 1;
    shelf(-half + 1.5, 4, depth - 3); shelf(-2.5, 4, depth - 4); shelf(2.5, 4, depth - 4);
    // the counter beside the door, the keeper behind it
    const [cx, cz] = at(half - 1.2, 2.5);
    boxes.push({ ...box(cx, cz, Math.abs(inX) ? 1 : 2.6, Math.abs(inX) ? 2.6 : 1, 1.05, "counter", KERB), color: "#6d5a48" });
    const [kx, kz] = at(half - 0.2, 2.5);
    shops.push({ id: sid, name: u.name, type, rect: inside, cashier: { x: kx, z: kz, yaw: Math.atan2(fx, fz) }, till: { x: cx, y: KERB + 1.05, z: cz }, floorColor: "#bdb6aa", wallColor: "#9a948c", maxY: 4 });
    places.push({ id: u.id, name: u.name, inside, door: u.door, ...(u.back ? { back: u.back } : {}) });
  };
  const unit = (id: string) => P.units.find((u) => u.id === id)!;
  shopShell(unit("plugpray"), 0, "repair", ["crt_tv", "giant_toaster", "phone_handset", "laptop", "disposable_camera"], { front: "#1f8a80", fascia: "#16756c", fg: "#f3ead0", wall: "#c8574a" });
  shopShell(unit("fishy"), 1, "mart", ["smelly_fish", "canned_beans", "fancy_cheese", "soda_can", "golden_spork"], { front: "#2f6fa3", fascia: "#1f5582", fg: "#ffe9a8", wall: "#e3d2ad" });
  // PLUG & PRAY: the hanging plug sign over the pavement, and a broken telly in the window (Blake's Stain Way photo)
  {
    const u = unit("plugpray"), r = qr(u.parts[0]), sd = sideOf(r, u.door), along = sd.side === "N" || sd.side === "S";
    const span = along ? r.maxX - r.minX : r.maxZ - r.minZ, lo = along ? r.minX : r.minZ, edge = sd.at - lo > span / 2 ? lo + span - 0.6 : lo + 0.6;
    boxes.push({ ...onWall(r, sd.side, edge, 0, 0.14, 1.5, 0.14, KERB + 4.6), color: "#2a2a2e" }); // the bracket
    boxes.push({ ...onWall(r, sd.side, edge, 0.75, 0.3, 0.6, 0.85, KERB + 3.7), color: "#f2c230" }); // the plug
    for (const k of [-0.13, 0.13]) boxes.push({ ...onWall(r, sd.side, edge + k, 1.35, 0.08, 0.35, 0.12, KERB + 4.05), color: "#f2c230" }); // its prongs
    // the telly in the window, on a little table, just inside the glass
    const winAt = sd.at - lo > span / 2 ? sd.at - 3.4 : sd.at + 3.4, [fx, fz] = FACE[sd.side];
    const wx = along ? winAt : fx > 0 ? r.maxX - 0.9 : r.minX + 0.9, wz = along ? (fz > 0 ? r.maxZ - 0.9 : r.minZ + 0.9) : winAt;
    boxes.push({ ...box(wx, wz, along ? 1.6 : 0.8, along ? 0.8 : 1.6, 0.75, "table", KERB), color: "#7a5a3c" });
    boxes.push({ ...box(wx, wz, 0.75, 0.65, 0.65, "wall", KERB + 0.75), color: "#d9d2bf" });
    boxes.push({ ...box(wx + fx * 0.34, wz + fz * 0.34, along ? 0.55 : 0.04, along ? 0.04 : 0.55, 0.45, "wall", KERB + 0.85), color: "#2c3a40" });
  }

  // ---- the museum: forecourt, a narrow public door, one gallery, the goods-yard gate ----
  const mu = unit("museum"), mr = qr(mu.parts[0]);
  const court = qr(mu.grounds![0].rect), yard = qr(mu.grounds![1].rect);
  // the public door: on the building's wall facing the forecourt, opposite the plan's door point
  const front = sideOf(mr, [(court.minX + court.maxX) / 2, (court.minZ + court.maxZ) / 2]);
  const doorAt = front.side === "N" || front.side === "S" ? mu.door[0] : mu.door[1];
  const gateAt = front.side === "N" || front.side === "S" ? mu.back![0] : mu.back![1];
  shell(mr, 7, [{ side: front.side, at: doorAt, w: MUSEUM_DOOR_W }, { side: front.side, at: gateAt, w: 4.5 }], "#d6cbb1", boxes);
  // the goods yard: fenced on its open sides, a wide gate on the street
  {
    const sd = sideOf(yard, mu.back!), gw = 5;
    for (const side of ["N", "S", "E", "W"] as const) {
      if (side === ({ N: "S", S: "N", E: "W", W: "E" } as const)[front.side]) continue; // (that side is the museum's wall, with the goods door into the gallery)
      const along = side === "N" || side === "S", lo = along ? yard.minX : yard.minZ, hi = along ? yard.maxX : yard.maxZ;
      const cut = side === sd.side ? [sd.at - gw / 2, sd.at + gw / 2] : null;
      // (the side toward the forecourt is a fence too: the forecourt and the yard don't connect)
      const runs: [number, number][] = cut ? [[lo, cut[0]], [cut[1], hi]] : [[lo, hi]];
      for (const [a, b] of runs) if (b - a > 0.1) {
        const [x, z, w, d] = side === "N" ? [(a + b) / 2, yard.maxZ, b - a, 0.2] : side === "S" ? [(a + b) / 2, yard.minZ, b - a, 0.2] : side === "E" ? [yard.maxX, (a + b) / 2, 0.2, b - a] : [yard.minX, (a + b) / 2, 0.2, b - a];
        boxes.push({ ...box(x, z, w, d, 2.6, "fence", KERB), chain: true });
      }
    }
  }
  // the steps up to the door (looks: the forecourt is at kerb height) and the columns either side
  {
    const [fx, fz] = front.side === "N" ? [0, 1] : front.side === "S" ? [0, -1] : front.side === "E" ? [1, 0] : [-1, 0];
    const wx = front.side === "N" || front.side === "S" ? doorAt : fx > 0 ? mr.maxX : mr.minX, wz = front.side === "E" || front.side === "W" ? doorAt : fz > 0 ? mr.maxZ : mr.minZ;
    for (const s of [-1, 1]) boxes.push({ ...box(wx + fx * 1.2 + fz * s * 2.2, wz + fz * 1.2 + fx * s * 2.2, 0.9, 0.9, 6.5, "wall", KERB), color: "#d8d2c4" });
    boxes.push({ ...box(wx + fx * 0.15, wz + fz * 0.15, fz ? 10 : 0.3, fx ? 10 : 0.3, 1.4, "wall", KERB + 7 - 1.6), color: SIGN_TINT.landmark, sign: "THE MUSEUM OF QUESTIONABLE HISTORY", face: [fx, fz] });
    boxes.push({ ...box(wx + fx * 0.15 + (fz ? gateAt - doorAt : 0), wz + fz * 0.15 + (fx ? gateAt - doorAt : 0), fz ? 6 : 0.3, fx ? 6 : 0.3, 0.9, "wall", KERB + 7 - 1.2), color: "#efe2b0", sign: "GOODS IN", face: [fx, fz], signBg: "#efe2b0", signFg: "#1b1420", signW: 3.4, signY: KERB + 7 - 0.75 });
  }
  // TR2 (Blake's GOODS IN photo): the roller shutter rolled up over the goods door, yellow bollards, a hatched loading bay,
  // pallets of boxes, cones, the museum's banner on the wall
  {
    const sd = front.side, [fx, fz] = FACE[sd], along = sd === "N" || sd === "S", away = Math.sign(gateAt - doorAt) || 1;
    boxes.push({ ...onWall(mr, sd, gateAt, 0, 5.0, 0.55, 0.65, KERB + 2.8), color: "#8d939b" }); // the shutter's drum
    for (const k of [0.95, 1.6, 2.25]) boxes.push({ ...onWall(mr, sd, gateAt, 0.02, 4.6, 0.04, 0.05, KERB + 2.8 + k * 0.2), color: "#6f757d" }); // its slats showing
    for (const s2 of [-1, 1]) boxes.push({ ...onWall(mr, sd, gateAt + s2 * 2.75, 0.25, 0.32, 0.32, 1.1, KERB), color: "#f2c230" });
    // the banner on the wall beside the door (away from the public door)
    boxes.push({ ...onWall(mr, sd, gateAt + away * 6.5, 0, 6.5, 0.15, 1.6, KERB + 2.3), color: "#ece4f2", sign: "MUSEUM OF QUESTIONABLE HISTORY", face: [fx, fz], signBg: "#ece4f2", signFg: "#5b3f8c", signW: 6.2, signY: KERB + 3.1 });
    // the hatched bay in front of the door: a yellow border and diagonal stripes (flat paint)
    const bay = (u: number, v: number): XZ => along ? [gateAt + u, (fz > 0 ? mr.maxZ : mr.minZ) + fz * v] : [(fx > 0 ? mr.maxX : mr.minX) + fx * v, gateAt + u];
    const paint = (a: XZ, b: XZ, c: XZ, d: XZ) => boxes.push({ ...polyBox([a, b, c, d], 0.025, "plaza", KERB + 0.02), color: "#f2c230" });
    const t = 0.15, W2 = 2.6, D0 = 0.6, D1 = 5.0;
    paint(bay(-W2, D0), bay(W2, D0), bay(W2, D0 + t), bay(-W2, D0 + t)); paint(bay(-W2, D1 - t), bay(W2, D1 - t), bay(W2, D1), bay(-W2, D1));
    paint(bay(-W2, D0), bay(-W2 + t, D0), bay(-W2 + t, D1), bay(-W2, D1)); paint(bay(W2 - t, D0), bay(W2, D0), bay(W2, D1), bay(W2 - t, D1));
    for (let k = -2; k <= 2; k++) { const u0 = k * 1.1 - 0.9; paint(bay(u0, D0 + t), bay(u0 + 0.25, D0 + t), bay(u0 + 0.25 + 1.6, D1 - t), bay(u0 + 1.6, D1 - t)); }
    // pallets of boxes and cones by the bay
    for (const [u, v, two] of [[-4.6, 1.6, 1], [-4.4, 3.4, 0], [4.6, 2.2, 1]] as const) {
      const [x, z] = bay(u * away, v);
      boxes.push({ ...box(x, z, 1.2, 1.0, 0.15, "pallet", KERB), color: "#b08a5a" });
      boxes.push({ ...box(x, z, 1.0, 0.85, 0.75, "boxes", KERB + 0.15), color: "#c9a06a" });
      if (two) boxes.push({ ...box(x + 0.1, z - 0.05, 0.75, 0.65, 0.55, "boxes", KERB + 0.9), color: "#d1ab78" });
    }
    for (const u of [-3.4, -3.0]) { const [x, z] = bay(u * away, 5.6 + (u + 3.4) * 1.5); decor.push({ kind: "cone", x, z }); }
  }
  // the gallery: plinths with the heavy exhibits, the giants on the floor by the goods door
  const gallery = R(mr.minX + WALL, mr.maxX - WALL, mr.minZ + WALL, mr.maxZ - WALL);
  {
    const cx = (gallery.minX + gallery.maxX) / 2, cz = (gallery.minZ + gallery.maxZ) / 2;
    const heavies = ["jade_dragon", "golden_accordion", "award_trophy", "mirror_ball", "giant_toaster", "crt_tv"];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = cx + (i - 1.5) * 9, z = cz + (j - 1) * 12;
      boxes.push({ ...box(x, z, 1.4, 1.4, 1.0, "plinth", KERB), color: "#e2ddd2" });
      loot.push({ x, y: KERB + 1.0, z, zone: "shop", pool: heavies, shop: 2, tier: 2 });
    }
    // the giants: near the goods door, on the floor
    const gx = front.side === "N" || front.side === "S" ? gateAt : (front.side === "E" ? gallery.maxX - 6 : gallery.minX + 6);
    const gz = front.side === "E" || front.side === "W" ? gateAt : (front.side === "N" ? gallery.maxZ - 6 : gallery.minZ + 6);
    for (const [u, v] of [[0, 0], [5, 3], [-5, 3]]) {
      const x = gx + (front.side === "N" || front.side === "S" ? u : (front.side === "E" ? -v : v)), z = gz + (front.side === "E" || front.side === "W" ? u : (front.side === "N" ? -v : v));
      // (TR2, Blake's photo: the giant duck waits on a red dolly just inside the goods door)
      const dolly = u === 0 && v === 0;
      if (dolly) {
        boxes.push({ ...box(x, z, 2.2, 1.6, 0.18, "platform", KERB + 0.12), color: "#c0392b" });
        for (const [a, b] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) boxes.push({ ...box(x + a, z + b, 0.22, 0.22, 0.12, "junk", KERB), color: "#26262b" });
      }
      loot.push({ x, y: dolly ? KERB + 0.3 : KERB, z, zone: "shop", pool: dolly ? ["rubber_duck"] : ["rubber_duck", "arcade_machine"], shop: 2, tier: 2 });
    }
    shops.push({ id: 2, name: mu.name, type: "jeweller", rect: gallery, cashier: { x: cx, z: cz, yaw: 0 }, till: { x: cx, y: KERB + 1, z: cz }, floorColor: "#cfc9bd", wallColor: "#a6a39c", maxY: 7, heat: 2 });
    const dpt: XZ = front.side === "N" || front.side === "S" ? [doorAt, front.side === "N" ? mr.maxZ + 1 : mr.minZ - 1] : [front.side === "E" ? mr.maxX + 1 : mr.minX - 1, doorAt];
    const gpt: XZ = front.side === "N" || front.side === "S" ? [gateAt, front.side === "N" ? mr.maxZ + 1 : mr.minZ - 1] : [front.side === "E" ? mr.maxX + 1 : mr.minX - 1, gateAt];
    places.push({ id: "museum", name: mu.name, inside: gallery, door: mu.door, back: mu.back });
    // giants can't leave by the public door (held giants don't collide: a rule, World.giantDoors)
    {
      const [fx, fz] = front.side === "N" ? [0, 1] : front.side === "S" ? [0, -1] : front.side === "E" ? [1, 0] : [-1, 0];
      const wx = fz ? doorAt : fx > 0 ? mr.maxX : mr.minX, wz = fx ? doorAt : fz > 0 ? mr.maxZ : mr.minZ;
      const ax = Math.abs(fz) ? 1.4 : 1.2, az = Math.abs(fx) ? 1.4 : 1.2;
      giantDoors.push({ rect: R(wx - ax, wx + ax, wz - az, wz + az), out: { x: wx - fx * 2.8, z: wz - fz * 2.8, yaw: Math.atan2(-fx, -fz) } });
    }
    TEST_INFO = {
      places,
      museum: { door: dpt, gate: gpt, gallery },
      routes: [
        { id: "street", name: "up Stain Way (quick, in view)", pts: [mu.back!, [-A, -A], [-A, 12], [-T_RING, 12]] },
        { id: "lane", name: "Wood Havoc Lane, behind the pub (slower, hidden)", pts: [mu.back!, ...(P.paths.find((p) => p.id === "al_pub")!.pts.slice().reverse() as XZ[]), [-T_RING, 12]] },
      ],
    };
  }

  // ---- TR2 (Blake's Wood Havoc Lane photo): THE SOGGY SHAMROCK's back door on the lane: a green door up a step, the
  //      pub's sign beside it, a lamp over it, the drainpipe, a green wheelie bin; lamp posts along the lane ----
  {
    const pu = unit("pub"), pr = qr(pu.parts[0]), sd = sideOf(pr, pu.back!), z0 = sd.at;
    boxes.push({ ...onWall(pr, sd.side, z0, 0, 1.6, 0.6, 0.15, KERB), color: "#bdb6aa" });
    boxes.push({ ...onWall(pr, sd.side, z0, 0, 1.2, 0.1, 2.25, KERB), color: "#2f7a3f" });
    boxes.push({ ...onWall(pr, sd.side, z0 + 0.4, 0.1, 0.08, 0.06, 0.25, KERB + 1.0), color: "#c9c4b8" }); // the handle
    boxes.push({ ...onWall(pr, sd.side, z0 + 2.6, 0, 2.8, 0.12, 1.5, KERB + 1.4), color: "#6b3f22", sign: "THE SOGGY SHAMROCK", face: FACE[sd.side] as unknown as [number, number], signBg: "#6b3f22", signFg: "#f0d9a0", signW: 2.6, signY: KERB + 2.15 });
    boxes.push({ ...onWall(pr, sd.side, z0, 0, 0.55, 0.28, 0.35, KERB + 2.65), color: "#ffe58a" });
    boxes.push({ ...onWall(pr, sd.side, z0 - 1.5, 0, 0.18, 0.18, 9.5, KERB), color: "#3b3b40" });
    boxes.push({ ...onWall(pr, sd.side, z0 - 2.6, 0.3, 0.75, 0.8, 1.1, KERB), color: "#2f8f3a" });
    boxes.push({ ...onWall(pr, sd.side, z0 - 2.6, 0.25, 0.85, 0.9, 0.08, KERB + 1.1), color: "#25702d" });
    const lane = P.paths.find((p) => p.id === "al_pub")!.pts;
    for (let i = 1; i < lane.length; i++) { const [a, b] = [lane[i - 1], lane[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let k = 12; k < L - 4; k += 26) decor.push({ kind: "streetlight", x: a[0] + ((b[0] - a[0]) * k) / L + 2, z: a[1] + ((b[1] - a[1]) * k) / L }); }
    // and along Stain Way's south stretch, both pavements
    for (let z = -A + 12; z < 10; z += 24) for (const x of [-A - 6.6, -A + 6.6]) decor.push({ kind: "streetlight", x, z: z + (x < -A ? 12 : 0) });
  }

  // ---- the El: columns only (the deck is looks: drawn as scenery) ----
  // (scenery: declared with the park)
  {
    const [a, b] = P.rail.pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < L; s += 12) {
      const x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L;
      if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) continue;
      scenery.push({ kind: "viaduct", x, z, w: P.rail.deckW, d: 12.3, h: P.rail.deckY, yaw });
    }
  }

  // street-name signs on two corners of every junction of named streets (finding your way in a grey city)
  {
    const named = P.roads.filter((r) => r.kind !== "ring" && r.pts.length === 2);
    const vert = named.filter((r) => r.pts[0][0] === r.pts[1][0]), hor = named.filter((r) => r.pts[0][1] === r.pts[1][1]);
    for (const v of vert) for (const h of hor) {
      const x = v.pts[0][0], z = h.pts[0][1];
      const inV = z >= Math.min(v.pts[0][1], v.pts[1][1]) - 0.1 && z <= Math.max(v.pts[0][1], v.pts[1][1]) + 0.1;
      const inH = x >= Math.min(h.pts[0][0], h.pts[1][0]) - 0.1 && x <= Math.max(h.pts[0][0], h.pts[1][0]) + 0.1;
      if (!inV || !inH) continue;
      for (const s of [1, -1]) {
        const sx = x + s * (v.w / 2 + v.sw - 0.6), sz = z + s * (h.w / 2 + h.sw - 0.6);
        if (Math.abs(sx) > HALF - 3 || Math.abs(sz) > HALF - 3) continue;
        decor.push({ kind: "streetsign", x: sx, z: sz, yaw: 0, yaw2: Math.PI / 2, text: `${v.name}|${h.name}` });
      }
    }
  }

  // spawns at the mats, facing out of the fort (in slot order: the first two players get the west side)
  forts.sort((a, b) => a.slot - b.slot);
  const spawns = forts.map((f) => ({ x: f.padX, z: f.padZ, yaw: f.yaw }));
  const landmarks: ArenaLayout["landmarks"] = {};
  for (const f of forts) landmarks[`fort${f.slot}`] = { x: f.padX, z: f.padZ, yaw: f.yaw };
  landmarks.museumDoor = { x: TEST_INFO!.museum.door[0], z: TEST_INFO!.museum.door[1], yaw: 0 };
  landmarks.museumGate = { x: TEST_INFO!.museum.gate[0], z: TEST_INFO!.museum.gate[1], yaw: 0 };
  for (const p of places) landmarks[p.id] = { x: p.door[0], z: p.door[1], yaw: 0 };
  return {
    halfSize: HALF, boxes: canonTest(boxes), spawns, lootSpawns: loot, forts, landmarks, roads, roadRings, crosswalks, shops, scenery, giantDoors, decor, variant: "test", pace: TEST_PACE,
    // (pedestrian grid: the pavements' middle lines; the test has no passers-by, but the shopkeepers need a graph)
    navLines: NAV, navLinesZ: NAV,
  };
}
