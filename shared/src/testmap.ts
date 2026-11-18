// TRASHINGTON 500: the SMALLEST PLAYABLE TEST (Blake, 2026-11-18: "yes build the smallest playable test"; "grey boxes
// first"). The whole 500 x 500 m plan (shared/src/queens/trashington.ts) as grey boxes, so distances and sightlines are
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
import { box, canonBoxes, type ArenaLayout, type Box, type FortLot, type Rect, type ShopDef, type SpawnPoint } from "./arena.js";
import { usePlan, layout } from "./queens/check.js";
import { TRASH500, T_HOME, T_RING, T_FORTS, T_STALLS, LOOP_AT, EDGE_AT } from "./queens/trashington.js";
import type { QRect, QUnit, XZ } from "./queens/plan.js";

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
function shell(r: Rect, h: number, openings: { side: "N" | "S" | "E" | "W"; at: number; w: number }[], color: string, out: Box[]) {
  const y0 = KERB, top = KERB + h;
  const wall = (x0: number, x1: number, z0: number, z1: number) => { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) out.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, "wall", y0), color }); };
  for (const side of ["N", "S", "E", "W"] as const) {
    const along = side === "N" || side === "S";
    const lo = along ? r.minX : r.minZ, hi = along ? r.maxX : r.maxZ;
    const cuts = openings.filter((o) => o.side === side).map((o) => [Math.max(lo, o.at - o.w / 2), Math.min(hi, o.at + o.w / 2)] as [number, number]).sort((a, b) => a[0] - b[0]);
    let s = lo;
    const piece = (a: number, b: number) => {
      if (side === "N") wall(a, b, r.maxZ - WALL, r.maxZ); else if (side === "S") wall(a, b, r.minZ, r.minZ + WALL);
      else if (side === "E") wall(r.maxX - WALL, r.maxX, a, b); else wall(r.minX, r.minX + WALL, a, b);
    };
    for (const [a, b] of cuts) { piece(s, a); s = b; }
    piece(s, hi);
    // a lintel over each opening (the roof line stays whole from outside)
    for (const [a, b] of cuts) {
      const lh = Math.max(0, h - 2.8);
      if (lh <= 0) continue;
      const lb = side === "N" ? box((a + b) / 2, r.maxZ - WALL / 2, b - a, WALL, lh, "wall", y0 + 2.8) : side === "S" ? box((a + b) / 2, r.minZ + WALL / 2, b - a, WALL, lh, "wall", y0 + 2.8)
        : side === "E" ? box(r.maxX - WALL / 2, (a + b) / 2, WALL, b - a, lh, "wall", y0 + 2.8) : box(r.minX + WALL / 2, (a + b) / 2, WALL, b - a, lh, "wall", y0 + 2.8);
      out.push({ ...lb, color });
    }
  }
  out.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, 0.3, "roof", top), color });
}

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
const NAV = [-152, -140, -60, -48, -17, -7, 7, 17, 48, 60, 140, 152];

export function buildTestMap(): ArenaLayout {
  usePlan(TRASH500);
  const P = TRASH500, lay = layout();
  const boxes: Box[] = [], roads: Rect[] = [], crosswalks: Rect[] = [];
  const A = LOOP_AT, E = EDGE_AT, HALF = 250;

  // ---- roads: the carriageways at 0, the pavements (and every block's ground) at kerb height ----
  // (the ring road is squared off for the test: its chamfers only matter to the drawing)
  const segs: { a: XZ; b: XZ; w: number; sw: number }[] = [];
  for (const r of P.roads) {
    if (r.kind === "ring") {
      const c = T_RING, sq: XZ[] = [[-c, -c], [c, -c], [c, c], [-c, c], [-c, -c]];
      for (let i = 1; i < sq.length; i++) segs.push({ a: sq[i - 1], b: sq[i], w: r.w, sw: r.sw });
    } else for (let i = 1; i < r.pts.length; i++) segs.push({ a: r.pts[i - 1], b: r.pts[i], w: r.w, sw: r.sw });
  }
  const segRect = (s: { a: XZ; b: XZ }, half: number, ext: number) => R(Math.min(s.a[0], s.b[0]) - (s.a[0] === s.b[0] ? half : ext), Math.max(s.a[0], s.b[0]) + (s.a[0] === s.b[0] ? half : ext),
    Math.min(s.a[1], s.b[1]) - (s.a[1] === s.b[1] ? half : ext), Math.max(s.a[1], s.b[1]) + (s.a[1] === s.b[1] ? half : ext));
  for (const s of segs) roads.push(segRect(s, s.w / 2, s.w / 2));
  const corridors = segs.map((s) => segRect(s, s.w / 2 + s.sw, s.w / 2 + s.sw));
  for (const p of minusAll(corridors, roads)) boxes.push(slab(p, KERB, "sidewalk"));
  // every block's ground (back lanes, yards, the gaps between buildings) at kerb height, flush with the pavements
  for (const b of P.blocks) for (const { r } of b.rects) for (const p of minusAll([qr(r)], [...roads, ...corridors])) boxes.push(slab(p, KERB, "sidewalk", "#a39d94"));
  // the strip between the edge roads and the boundary
  const outer = R(-HALF, HALF, -HALF, HALF), inner = R(-E - 6.5, E + 6.5, -E - 6.5, E + 6.5);
  for (const p of minus(outer, inner)) boxes.push(slab(p, KERB, "sidewalk", "#8d8a84"));
  // the boundary: a high wall all round (the shore / the rail yard / the expressway beyond, not built)
  for (const [x, z, w, d] of [[0, HALF - 0.5, 2 * HALF, 1], [0, -HALF + 0.5, 2 * HALF, 1], [HALF - 0.5, 0, 1, 2 * HALF], [-HALF + 0.5, 0, 1, 2 * HALF]] as const) boxes.push({ ...box(x, z, w, d, 6, "wall", KERB), color: "#6c6a70" });
  // zebra crossings at the market exits and the rear gates (the plan's checked ones)
  for (const c of P.crossings) crosswalks.push(c.across === "z" ? R(c.at[0] - c.w / 2, c.at[0] + c.w / 2, c.at[1] - 4, c.at[1] + 4) : R(c.at[0] - 4, c.at[0] + 4, c.at[1] - c.w / 2, c.at[1] + c.w / 2));

  // ---- the home block: the yards (junk lots), the market lanes, the stalls ----
  const H = T_HOME.half + T_HOME.pave; // the block's edge (50)
  boxes.push(slab(R(-H, H, -H, H), KERB, "sidewalk"));
  for (const f of T_FORTS) boxes.push(slab(qr(f.yard), 0.02, "plaza", "#8a7a5e", KERB));
  for (const s of T_STALLS) {
    const r = qr(s.rect);
    boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, s.id === "board" ? 2.2 : 2.6, s.id === "board" ? "board" : "kiosk", KERB), sign: s.label, color: "#b9b2a6", face: [0, 1] });
  }
  // forts: the box, the mat (pad) in front, facing out of the yard toward the market (the plan's pinwheel)
  const forts: FortLot[] = [];
  for (const f of T_FORTS) {
    const r = qr(f.yard), cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    const dx = Math.sign(Math.round(f.mat[0] - cx)), dz = Math.sign(Math.round(f.mat[1] - cz)), yaw = Math.atan2(dx, dz);
    const fx = f.mat[0] - dx * 6, fz = f.mat[1] - dz * 6;
    boxes.push({ ...box(fx, fz, Math.abs(dx) ? 1.9 : 2.4, Math.abs(dx) ? 2.4 : 1.9, 1.5, "fort", KERB) });
    forts.push({ slot: TEST_SLOT[f.id], x: fx, z: fz, padX: f.mat[0], padZ: f.mat[1], yaw, zone: r, backX: f.rear[0], backZ: f.rear[1] });
    // junk-lot dressing: piles in the back corners (walk round them; they hide you a little)
    const back = (u: number, v: number): [number, number] => [fx - dx * v + dz * u, fz - dz * v - dx * u];
    for (const [u, v, w, h] of [[-12, 4, 3, 1.4], [11, 5, 2.4, 2.0], [-6, 9, 4, 1.1], [14, -8, 2.5, 1.6]] as const) {
      const [x, z] = back(u, v); if (x > r.minX + 2 && x < r.maxX - 2 && z > r.minZ + 2 && z < r.maxZ - 2) boxes.push({ ...box(x, z, w, w * 0.8, h, "junk", KERB), color: "#6f6250" });
    }
  }

  // ---- the city's buildings: closed grey blocks ----
  for (const b of lay.buildings) {
    const r = qr(b.rect), g = GREY[b.style] ?? GREY.low, h = Math.max(2, b.floors) * FLOOR_H;
    boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, "building", KERB), color: g[Math.floor(hash(r.minX, r.minZ) * g.length)] });
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
      boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, "building", KERB), color: u.phase === "reserved" ? "#9a958c" : "#8e8890",
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
  const shopShell = (u: QUnit, sid: number, type: ShopDef["type"], pool: string[]) => {
    const r = qr(u.parts[0]), sd = sideOf(r, u.door), bk = u.back ? sideOf(r, u.back) : null;
    const h = 4.2;
    shell(r, h, [{ ...sd, w: 2.4 }, ...(bk ? [{ ...bk, w: 1.6 }] : [])], "#9a948c", boxes);
    // the sign over the door, on a band above the opening
    const face: [number, number] = sd.side === "N" ? [0, 1] : sd.side === "S" ? [0, -1] : sd.side === "E" ? [1, 0] : [-1, 0];
    boxes.push({ ...box(face[1] ? sd.at : (face[0] > 0 ? r.maxX + 0.2 : r.minX - 0.2), face[0] ? sd.at : (face[1] > 0 ? r.maxZ + 0.2 : r.minZ - 0.2), face[1] ? 6 : 0.3, face[0] ? 6 : 0.3, 1.0, "wall", KERB + h - 1.1), color: SIGN_TINT[u.tier ?? "low"], sign: u.name, face });
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
  shopShell(unit("plugpray"), 0, "repair", ["crt_tv", "giant_toaster", "phone_handset", "laptop", "disposable_camera"]);
  shopShell(unit("fishy"), 1, "mart", ["smelly_fish", "canned_beans", "fancy_cheese", "soda_can", "golden_spork"]);

  // ---- the museum: forecourt, a narrow public door, one gallery, the goods-yard gate ----
  const mu = unit("museum"), mr = qr(mu.parts[0]);
  const court = qr(mu.grounds![0].rect), yard = qr(mu.grounds![1].rect);
  // the public door: on the building's wall facing the forecourt, opposite the plan's door point
  const front = sideOf(mr, [(court.minX + court.maxX) / 2, (court.minZ + court.maxZ) / 2]);
  const doorAt = front.side === "N" || front.side === "S" ? mu.door[0] : mu.door[1];
  const gateAt = front.side === "N" || front.side === "S" ? mu.back![0] : mu.back![1];
  shell(mr, 7, [{ side: front.side, at: doorAt, w: MUSEUM_DOOR_W }, { side: front.side, at: gateAt, w: 4.5 }], "#a6a39c", boxes);
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
    boxes.push({ ...box(wx + fx * 0.15 + (fz ? gateAt - doorAt : 0), wz + fz * 0.15 + (fx ? gateAt - doorAt : 0), fz ? 6 : 0.3, fx ? 6 : 0.3, 0.9, "wall", KERB + 7 - 1.2), color: "#5c5a60", sign: "GOODS IN", face: [fx, fz] });
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
      loot.push({ x, y: KERB, z, zone: "shop", pool: ["rubber_duck", "arcade_machine"], shop: 2, tier: 2 });
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

  // ---- the El: columns only (the deck is looks: drawn as scenery) ----
  const scenery: NonNullable<ArenaLayout["scenery"]> = [];
  {
    const [a, b] = P.rail.pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s < L; s += 12) {
      const x = a[0] + ((b[0] - a[0]) * s) / L, z = a[1] + ((b[1] - a[1]) * s) / L;
      if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) continue;
      scenery.push({ kind: "viaduct", x, z, w: P.rail.deckW, d: 12.3, h: P.rail.deckY, yaw });
    }
  }

  // street-name signs on two corners of every junction of named streets (finding your way in a grey city)
  const decor: NonNullable<ArenaLayout["decor"]> = [];
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
    halfSize: HALF, boxes: canonBoxes(boxes), spawns, lootSpawns: loot, forts, landmarks, roads, crosswalks, shops, scenery, giantDoors, decor, variant: "test",
    // (pedestrian grid: the pavements' middle lines; the test has no passers-by, but the shopkeepers need a graph)
    navLines: NAV, navLinesZ: NAV,
  };
}
