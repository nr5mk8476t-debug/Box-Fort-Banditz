// Trashington, Phase 3.5 overhaul: a ~200 m city. Shared by server, solo and renderer.
//
//   x = east, z = north. Two square ring roads with two-way traffic:
//     ring A (centre line +-30) around the PLAZA, ring B (+-70) around downtown.
//   Connector streets (no traffic, parked cars) link the rings at +-30.
//
//   +----------------------------------------------------------------------+ z = +100 (fence)
//   | NW parking | warehouses |  N FORT  | shops/warehouses | NE junkyard   |   edge band 77..99
//   |------------------------------ ring B ---------------------------------|
//   |  corner block (tower) | side block (SHOP + tower) | corner block        |   downtown 37..63
//   |------------ ring A ------------|  PLAZA (fountain) |-------- ring A ---|
//   |  ... mirrored ...                                                      |
//   | SW construction yard | ...     |  S FORT  | ...          | SE police   |
//   +----------------------------------------------------------------------+ z = -100
//
// Downtown blocks have 26-46 m high-rises, alleys with dumpsters, and one walk-in shop per
// side block (with shelves, a counter, a till and a cashier). Low annexes (3.2 m) can be
// climbed from their dumpsters. Everything is mirrored by direction but each shop differs.
import {
  box, type Box, type ArenaLayout, type SpawnPoint, type FortLot, type LootZone, type PropDef, type PropKind,
  type Rect, type ShopDef, type ShopType, type TrafficLoop,
} from "./arena.js";

const HALF = 100;
const LOW = 3.2; // climbable roof height (from a dumpster)
const RA = 30; // ring A centre line
const RB = 70; // ring B centre line
const RW = 4; // road half-width (two 4 m lanes)

type Dir = "N" | "S" | "E" | "W";
const DIRS: Dir[] = ["N", "E", "S", "W"];

/** (lateral, depth) on a side -> world (x, z). Depth grows toward that side's edge. */
function latDep(dir: Dir, lat: number, dep: number): [number, number] {
  switch (dir) {
    case "N": return [lat, dep];
    case "S": return [-lat, -dep];
    case "E": return [dep, -lat];
    case "W": return [-dep, lat];
  }
}
/** A box in (lateral, depth) coordinates on a side. */
function side(dir: Dir, lat: number, dep: number, wLat: number, wDep: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, baseY = 0): Box {
  const [x, z] = latDep(dir, lat, dep);
  const alongX = dir === "N" || dir === "S";
  return { ...box(x, z, alongX ? wLat : wDep, alongX ? wDep : wLat, h, kind, baseY), ...extra };
}
/** A world rectangle from (lateral, depth) ranges on a side. */
function sideRect(dir: Dir, lat0: number, lat1: number, dep0: number, dep1: number): Rect {
  const [ax, az] = latDep(dir, lat0, dep0), [bx, bz] = latDep(dir, lat1, dep1);
  return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
}
/** Yaw that looks from (lat, dep) toward smaller depth (i.e. toward the city centre). */
function inwardYaw(dir: Dir): number {
  const [ax, az] = latDep(dir, 0, 1), [bx, bz] = latDep(dir, 0, 0);
  return Math.atan2(bx - ax, bz - az);
}
/** Mirror helper for the four corner blocks. */
function q(sx: number, sz: number, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, baseY = 0): Box {
  return { ...box(sx * x, sz * z, w, d, h, kind, baseY), ...extra };
}
function hash(a: number, b: number) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const WAREHOUSE_SIGNS = ["DISCOUNT SOUP", "LAUNDRO-MATT", "PIGEON SUPPLY", "MOP EMPORIUM", "CHEAP WIGS", "HAT HUT", "SOCK OUTLET", "NAPKIN DEPOT"];
const TOWER_SIGNS = ["TRASHCORP", "BIG BANK OF TRASHINGTON", "INSURANCE-ISH", "MEGAMART HQ", "LAWYERS 4 LESS", "CRUNCHO+ TOWER", "HOTEL ADEQUATE", "BOXLY INC"];

/** What each kind of shop has on its shelves. */
export const SHOP_POOLS: Record<ShopType, string[]> = {
  mart: ["canned_beans", "energy_drink", "candy_bar", "soda_can", "lottery_ticket", "fancy_cheese"],
  pawn: ["gold_chain", "guitar", "sunglasses", "golden_spork", "snow_globe", "mixtape"],
  bakery: ["bagel", "baguette", "birthday_cake", "fancy_cheese", "energy_drink"],
  gadget: ["phone_handset", "fancy_earbuds", "laptop", "crt_tv", "mixtape"],
};
const SHOPS: Record<Dir, { name: string; type: ShopType; floor: string; wall: string }> = {
  N: { name: "CORNER MART", type: "mart", floor: "#d8e8d0", wall: "#3f8f6a" },
  E: { name: "PAWN-O-RAMA", type: "pawn", floor: "#e8d8b0", wall: "#8a5a2b" },
  S: { name: "BAGEL BARN", type: "bakery", floor: "#f0dcc0", wall: "#c26b4a" },
  W: { name: "GIZMO GARAGE", type: "gadget", floor: "#cfd8e8", wall: "#3d5a9e" },
};

export function buildTrashington(): ArenaLayout {
  const boxes: Box[] = [];
  const loot: SpawnPoint[] = [];
  const props: PropDef[] = [];
  const decor: NonNullable<ArenaLayout["decor"]> = [];
  const spawnAt = (x: number, z: number, zone: LootZone, y = 0, extra: Partial<SpawnPoint> = {}) => loot.push({ x, y, z, zone, ...extra });
  const count: Record<string, number> = {};
  /** An interactable prop (with its collision box, if it has one). Dimensions are for yaw 0 (facing +z). */
  const prop = (kind: PropKind, x: number, z: number, yaw: number, w: number, d: number, h: number, extra: Partial<PropDef> = {}) => {
    const n = (count[kind] = (count[kind] ?? 0) + 1);
    const id = kind + n;
    const turned = Math.abs(Math.sin(yaw)) > 0.5;
    if (h > 0) boxes.push({ ...box(x, z, turned ? d : w, turned ? w : d, h, kind === "till" ? "counter" : kind) });
    props.push({ id, kind, x, y: 0, z, yaw, ...extra });
    return id;
  };
  const dirProp = (dir: Dir, kind: PropKind, lat: number, dep: number, w: number, d: number, h: number, faceOut = false, extra: Partial<PropDef> = {}) => {
    const [x, z] = latDep(dir, lat, dep);
    return prop(kind, x, z, inwardYaw(dir) + (faceOut ? Math.PI : 0), w, d, h, extra);
  };

  // ---- boundary fences (3 m, too tall to climb) ----------------------------------------
  boxes.push(box(0, HALF + 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(0, -HALF - 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(HALF + 0.5, 0, 1, HALF * 2, 3, "fence"));
  boxes.push(box(-HALF - 0.5, 0, 1, HALF * 2, 3, "fence"));

  // ---- roads + crosswalks -----------------------------------------------------------------
  const roads: Rect[] = [];
  const crosswalks: Rect[] = [];
  for (const dir of DIRS) {
    roads.push(sideRect(dir, -(RA + RW), RA + RW, RA - RW, RA + RW)); // ring A side
    roads.push(sideRect(dir, -(RB + RW), RB + RW, RB - RW, RB + RW)); // ring B side
    for (const s of [-1, 1]) {
      roads.push(sideRect(dir, s * RA - RW, s * RA + RW, RA + RW, RB - RW)); // connector (belongs to this side's block)
      crosswalks.push(sideRect(dir, s * 16 - 2, s * 16 + 2, RA - RW, RA + RW)); // ring A crossings
      crosswalks.push(sideRect(dir, s * 50 - 2, s * 50 + 2, RB - RW, RB + RW)); // ring B crossings
      crosswalks.push(sideRect(dir, s * RA - RW, s * RA + RW, 48, 52)); // connector crossings
      for (const [lat, dep] of [[s * 16, RA], [s * 50, RB], [s * RA, 50]]) {
        const [x, z] = latDep(dir, lat, dep);
        decor.push({ kind: "zebra", x, z, yaw: lat === s * RA ? inwardYaw(dir) + Math.PI / 2 : inwardYaw(dir) });
      }
    }
    // centre-line dashes (painted every 6 m)
    for (let t = -RA + 3; t <= RA - 3; t += 6) { const [x, z] = latDep(dir, t, RA); decor.push({ kind: "dash", x, z, yaw: inwardYaw(dir) + Math.PI / 2 }); }
    for (let t = -RB + 3; t <= RB - 3; t += 6) { const [x, z] = latDep(dir, t, RB); decor.push({ kind: "dash", x, z, yaw: inwardYaw(dir) + Math.PI / 2 }); }
  }

  // ---- the plaza (centre): raised paving, fountain + raccoon statue, trees, kiosks -----------
  boxes.push(box(0, 0, 52, 52, 0.15, "plaza"));
  boxes.push(box(0, 0, 7, 7, 0.8, "fountain"));
  boxes.push({ ...box(0, 0, 1.4, 1.4, 2.6, "statue", 0.8), sign: "OUR FOUNDER" });
  for (const [x, z, w, d] of [[0, 6.5, 3, 1], [0, -6.5, 3, 1], [6.5, 0, 1, 3], [-6.5, 0, 1, 3]]) boxes.push(box(x, z, w, d, 0.5, "bench"));
  for (const [x, z] of [[19, 19], [-19, 19], [19, -19], [-19, -19]]) boxes.push(box(x, z, 2.5, 2.5, 0.7, "planter"));
  for (const [x, z] of [[20, 8], [20, -8], [-20, 8], [-20, -8], [12, 20], [-12, 20], [12, -20], [-12, -20]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
  boxes.push({ ...box(19, -13, 2.5, 2, 2.4, "kiosk"), sign: "HOT DOGS?" });
  boxes.push({ ...box(13, 19, 2, 2.5, 2.4, "kiosk"), sign: "MAPS (WRONG)" });
  for (const [x, z, w, d] of [[12, 24.5, 4, 1.2], [-24.5, 12, 1.2, 4], [12, -24.5, 4, 1.2], [24.5, -2, 1.2, 4]]) boxes.push(box(x, z, w, d, 2.6, "busstop"));
  prop("phone", 21, 2, -Math.PI / 2, 1.1, 1.1, 2.3);
  prop("phone", -21, -3, Math.PI / 2, 1.1, 1.1, 2.3);
  prop("vending", 21, -4, -Math.PI / 2, 1.2, 0.9, 1.9);
  prop("vending", -21, 4, Math.PI / 2, 1.2, 0.9, 1.9);
  prop("newsbox", -21, 12, Math.PI / 2, 0.6, 0.5, 1.0);
  prop("newsbox", 21, 12, -Math.PI / 2, 0.6, 0.5, 1.0);
  for (const [x, z] of [[4, 10], [-4, -10], [10, -4], [-10, 4], [18, 22], [-18, -22]]) prop("bin", x, z, 0, 0.7, 0.7, 1.0);
  for (const [x, z] of [[5, 9], [-5, 9], [5, -9], [-5, -9], [9, 5], [-9, -5], [14, 0], [-14, 0], [0, 15], [0, -15], [17, 15], [-17, -15], [10, -17], [-10, 17]]) spawnAt(x, z, "plaza", 0.15);
  for (const [x, z] of [[24, 24], [-24, 24], [24, -24], [-24, -24], [0, 24], [0, -24], [24, 16], [-24, -16]]) decor.push({ kind: "streetlight", x, z });

  // ---- downtown corner blocks: high-rise, alley with a dumpster, climbable annex, mid-rise ----
  const quads: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  quads.forEach(([sx, sz], qi) => {
    boxes.push(q(sx, sz, 50, 50, 32, 32, 0.15, "sidewalk"));
    const tall = 30 + Math.round(hash(sx, sz) * 16);
    boxes.push(q(sx, sz, 45, 45, 14, 14, tall, "tower", { windows: true, sign: TOWER_SIGNS[qi] }));
    boxes.push(q(sx, sz, 59.5, 45, 7, 14, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[qi] }));
    boxes.push(q(sx, sz, 50.5, 59.5, 25, 7, 10 + qi * 2, "building", { windows: true }));
    prop("dumpster", sx * 55.4, sz * 45, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 2.2, 1.2, 1.3);
    prop("bin", sx * 54, sz * 53.5, 0, 0.7, 0.7, 1.0);
    prop("vending", sx * 35.6, sz * 44, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2, 0.9, 1.9);
    prop("meter", sx * 35, sz * 56, 0, 0.3, 0.3, 1.3);
    spawnAt(sx * 54, sz * 41, "alley", 0.15);
    spawnAt(sx * 46, sz * 53.8, "alley", 0.15);
    spawnAt(sx * 59.5, sz * 45, "rooftop", LOW);
    spawnAt(sx * 36, sz * 38, "street", 0.15);
    decor.push({ kind: "streetlight", x: sx * 36, z: sz * 36 }, { kind: "streetlight", x: sx * 64, z: sz * 64 });
  });

  // ---- downtown side blocks: walk-in SHOP (with interior + cashier), tower, alleys ----------
  const shops: ShopDef[] = [];
  DIRS.forEach((dir, di) => {
    const S = SHOPS[dir];
    boxes.push(side(dir, 0, 50, 52, 32, 0.15, "sidewalk"));
    // shop shell: lateral -21..-5, depth 38..50, door (4 m) in the wall facing the plaza
    const H = 4.5, t = 0.4, wall = { color: S.wall };
    boxes.push(side(dir, -18, 38.2, 6, t, H, "wall", wall));
    boxes.push(side(dir, -8, 38.2, 6, t, H, "wall", wall));
    boxes.push(side(dir, -13, 49.8, 16, t, H, "wall", wall));
    boxes.push(side(dir, -20.8, 44, t, 12, H, "wall", wall));
    boxes.push(side(dir, -5.2, 44, t, 12, H, "wall", wall));
    boxes.push(side(dir, -13, 44, 16, 12, 0.3, "roof", { sign: S.name }, H));
    boxes.push(side(dir, -13, 44, 15.2, 11.2, 0.03, "shopfloor", { color: S.floor }, 0.15));
    // interior: two shelf rows, a back fridge, the counter
    boxes.push(side(dir, -18, 44, 1, 6, 1.7, "shelf"));
    boxes.push(side(dir, -14, 44.5, 1, 5, 1.7, "shelf"));
    boxes.push(side(dir, -16.5, 49.2, 8, 0.8, 2.2, "fridge"));
    boxes.push(side(dir, -8.5, 45.5, 4, 1, 1.05, "counter"));
    const [cx, cz] = latDep(dir, -8.5, 46.8);
    const [tx, tz] = latDep(dir, -8.5, 45.5);
    const shopId = di;
    shops.push({
      id: shopId, name: S.name, type: S.type, rect: sideRect(dir, -20.6, -5.4, 38.4, 49.6),
      cashier: { x: cx, z: cz, yaw: inwardYaw(dir) }, till: { x: tx, y: 1.05, z: tz }, floorColor: S.floor, wallColor: S.wall,
    });
    props.push({ id: "till" + (shopId + 1), kind: "till", x: tx, y: 1.05, z: tz, yaw: inwardYaw(dir), shop: shopId });
    const pool = SHOP_POOLS[S.type];
    for (const [lat, dep, y] of [[-18, 42, 1.7], [-18, 44, 1.7], [-18, 46, 1.7], [-14, 43.5, 1.7], [-14, 46, 1.7], [-17.5, 48.2, 0.18], [-12, 48.2, 0.18], [-10, 45.5, 1.05]]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, "shop", y, { pool, shop: shopId });
    }
    // tower + back buildings
    const tall = 26 + Math.round(hash(di, 7) * 14);
    boxes.push(side(dir, 11, 46, 20, 16, tall, "tower", { windows: true, sign: TOWER_SIGNS[4 + di] }));
    boxes.push(side(dir, -12, 59, 18, 8, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[4 + di] }));
    boxes.push(side(dir, 12, 59.5, 18, 7, 12, "building", { windows: true }));
    dirProp(dir, "dumpster", -16, 54.4, 2.2, 1.2, 1.3);
    dirProp(dir, "bin", -8, 52.5, 0.7, 0.7, 1.0);
    dirProp(dir, "bin", -2, 42, 0.7, 0.7, 1.0);
    dirProp(dir, "phone", 23.5, 35.6, 1.1, 1.1, 2.3);
    dirProp(dir, "newsbox", -23, 35.4, 0.6, 0.5, 1.0);
    dirProp(dir, "meter", 8, 34.4, 0.3, 0.3, 1.3);
    // parked car on each connector (no traffic there)
    for (const s of [-1, 1]) {
      const [x, z] = latDep(dir, s * (RA + 2.5), 42 + (s > 0 ? 0 : 14));
      prop("car", x, z, inwardYaw(dir), 1.9, 4.2, 1.5, { color: ["#d6264a", "#3d6fb5", "#ffcf3a", "#8a9a5b", "#e8e2d4", "#6b4c9a", "#43c7a6", "#ff7a1f"][(di * 2 + (s > 0 ? 1 : 0)) % 8] });
    }
    for (const [lat, dep, zone, y] of [[-2, 45, "alley", 0.15], [-12, 52.5, "alley", 0.15], [-12, 59, "rooftop", LOW], [24.5, 50, "street", 0.15], [2, 55, "alley", 0.15]] as [number, number, LootZone, number][]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, zone, y);
    }
    for (const lat of [-24, 0, 24]) { const [x, z] = latDep(dir, lat, 36); decor.push({ kind: "streetlight", x, z }); }
  });

  // ---- edge band: forts in the middle of each side, warehouses and shops around them --------
  const forts: FortLot[] = [];
  const fortOrder: Dir[] = ["S", "N", "W", "E"]; // slot 0 = south, 1 = north, 2 = west, 3 = east
  fortOrder.forEach((dir, slot) => {
    const fortBox = side(dir, 0, 92, 2.4, 1.9, 1.5, "fort");
    boxes.push(fortBox);
    const [padX, padZ] = latDep(dir, 0, 82);
    const zone = sideRect(dir, -8, 8, 77.5, 95.5);
    const [backX, backZ] = latDep(dir, 0, 97.8);
    forts.push({ slot, x: fortBox.x, z: fortBox.z, padX, padZ, yaw: inwardYaw(dir), zone, backX, backZ });
  });
  DIRS.forEach((dir, di) => {
    boxes.push(side(dir, 0, 75.5, 148, 3, 0.15, "sidewalk"));
    boxes.push(side(dir, 22, 88, 22, 18, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[di * 2 % 8] }));
    boxes.push(side(dir, 54, 87.5, 34, 17, 9, "building", { windows: true, sign: WAREHOUSE_SIGNS[(di * 2 + 1) % 8] }));
    boxes.push(side(dir, -22, 87.5, 22, 17, 12, "building", { windows: true, sign: TOWER_SIGNS[(di + 3) % 8] }));
    boxes.push(side(dir, -54, 88, 34, 18, LOW, "building", { windows: true }));
    dirProp(dir, "dumpster", 10.4, 84, 1.2, 2.2, 1.3); // climb aid onto the low warehouse next to the fort
    dirProp(dir, "dumpster", -36.4, 84, 1.2, 2.2, 1.3);
    dirProp(dir, "bin", 35, 80, 0.7, 0.7, 1.0);
    for (const lat of [-45, -20, 20, 45]) dirProp(dir, "meter", lat, 75.2, 0.3, 0.3, 1.3);
    dirProp(dir, "newsbox", 12, 76, 0.6, 0.5, 1.0);
    dirProp(dir, "phone", -12, 76.2, 1.1, 1.1, 2.3);
    for (const [lat, dep, zone, y] of [[35, 88, "alley", 0], [-35, 90, "alley", 0], [22, 88, "rooftop", LOW], [-54, 88, "rooftop", LOW], [60, 75.5, "street", 0.15], [-60, 75.5, "street", 0.15], [0, 98, "alley", 0]] as [number, number, LootZone, number][]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, zone, y);
    }
    for (const lat of [-60, -30, 30, 60]) { const [x, z] = latDep(dir, lat, 76); decor.push({ kind: "streetlight", x, z }); }
  });

  // ---- corners --------------------------------------------------------------------------------
  // SW: construction yard (the movement playground: 0.9 / 1.4 / 1.95 m ledges + crawl tunnel)
  const ledgeZ = -92;
  boxes.push(box(-94, ledgeZ, 3, 2, 0.9, "ledge"));
  boxes.push(box(-89, ledgeZ, 3, 2, 1.4, "ledge"));
  boxes.push(box(-84, ledgeZ, 3, 2, 1.95, "ledge"));
  // crawl tunnel runs along x: slab bottom at 1.25 m, roof from x = -91 to -85
  boxes.push(box(-88, -84, 6, 3.2, 0.3, "slab", 1.25));
  boxes.push(box(-88, -85.8, 6, 0.4, 1.55, "wall"));
  boxes.push(box(-88, -82.2, 6, 0.4, 1.55, "wall"));
  for (const [x, z, w, d, h] of [[-80, -95, 2, 2, 1.2], [-81, -79, 3, 2, 0.9], [-97, -79, 2, 3, 1.6]]) boxes.push(box(x, z, w, d, h, "crate"));
  spawnAt(-89, -96, "yard");
  spawnAt(-84, ledgeZ, "yard", 1.95);
  spawnAt(-82, -84, "yard");
  // NE: junkyard
  for (const [x, z, w, d, h] of [[82, 82, 3, 3, 1.6], [88, 84, 2, 4, 1.1], [94, 80, 3, 2, 2.2], [84, 92, 4, 2, 1.3], [92, 93, 2, 2, 0.9], [96, 88, 2, 3, 1.8]]) {
    boxes.push(box(x, z, w, d, h, "junk"));
  }
  spawnAt(88, 89, "yard");
  spawnAt(94, 80, "yard", 2.2);
  spawnAt(80, 96, "yard");
  // NW: parking lot (parked cars you can break into)
  const lotColors = ["#d6264a", "#3d6fb5", "#e8e2d4", "#ffcf3a", "#2b2433", "#43c7a6"];
  [[-94, 84], [-88, 84], [-82, 84], [-94, 93], [-88, 93], [-82, 93]].forEach(([x, z], i) => prop("car", x, z, i < 3 ? Math.PI : 0, 1.9, 4.2, 1.5, { color: lotColors[i] }));
  spawnAt(-85, 88.5, "yard");
  spawnAt(-97, 88.5, "yard");
  // SE: the Trashington Police Department (Phase 4). Lobby with a front desk, four barred cells
  // along the back (one per player, visible from the lobby), a back alley behind it.
  const PD_H = 4.5, PD = { x0: 78, x1: 98, z0: -95, z1: -79 };
  const pdWall = "#2f3a5c", pdX = (PD.x0 + PD.x1) / 2, pdZ = (PD.z0 + PD.z1) / 2;
  const wall = (x: number, z: number, w: number, d: number, h = PD_H, baseY = 0, kind: Box["kind"] = "wall", color = pdWall) =>
    boxes.push({ ...box(x, z, w, d, h, kind, baseY), color });
  wall(79.5, PD.z1, 3, 0.4); // front wall, left of the door (door: x 81..84)
  wall(91, PD.z1, 14, 0.4); // front wall, right of the door
  wall(82.5, PD.z1, 3, 0.4, PD_H - 2.7, 2.7); // over the door
  wall(pdX, PD.z0, PD.x1 - PD.x0 + 0.4, 0.4); // back wall
  wall(PD.x0, pdZ, 0.4, PD.z1 - PD.z0); // west
  wall(PD.x1, pdZ, 0.4, PD.z1 - PD.z0); // east
  boxes.push({ ...box(pdX, pdZ, PD.x1 - PD.x0 + 0.4, PD.z1 - PD.z0 + 0.4, 0.3, "roof", PD_H), sign: "TRASHINGTON PD", color: "#1f2944" });
  boxes.push({ ...box(pdX, pdZ, PD.x1 - PD.x0 - 0.4, PD.z1 - PD.z0 - 0.4, 0.03, "shopfloor"), color: "#c9ccd6" }); // sits ON the ground
  boxes.push({ ...box(91, -83.6, 9, 0.9, 1.1, "counter"), color: "#5a4632" }); // front desk
  // cells: bars at z = -89 (you can see in from the lobby), dividers between them
  const cellZ0 = -94.8, cellZ1 = -89, cellW = (PD.x1 - PD.x0 - 0.4) / 4;
  const cells: NonNullable<ArenaLayout["station"]>["cells"] = [];
  for (let i = 0; i < 4; i++) {
    const cx0 = PD.x0 + 0.2 + i * cellW, cx1 = cx0 + cellW, cx = (cx0 + cx1) / 2;
    if (i > 0) wall(cx0, (cellZ0 + cellZ1) / 2, 0.3, cellZ1 - cellZ0);
    boxes.push({ ...box(cx, cellZ1, cellW - (i > 0 ? 0.3 : 0), 0.2, PD_H, "bars"), color: "#8e96a8" });
    boxes.push({ ...box(cx, -94.1, 2.2, 0.8, 0.45, "bench"), color: "#6b4a2b" });
    cells.push({ x: cx, z: -91.3, yaw: 0, rect: { minX: cx0 + 0.6, maxX: cx1 - 0.6, minZ: cellZ0 + 0.6, maxZ: cellZ1 - 0.5 } });
  }
  // two patrol cars parked out front (scenery; the ones that chase you are separate)
  for (const x of [89.5, 95]) { boxes.push(box(x, -76.4, 4.2, 1.9, 1.5, "car")); decor.push({ kind: "copcar", x, z: -76.4, yaw: Math.PI / 2 }); }
  for (const [x, z] of [[76, -98], [99.2, -84]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
  spawnAt(80, -98, "alley");
  const station = {
    rect: { minX: PD.x0 - 0.2, maxX: PD.x1 + 0.2, minZ: PD.z0 - 0.2, maxZ: PD.z1 + 0.2 },
    door: { x: 82.5, z: -76.6, yaw: 0 },
    alley: { x: 86, z: -97.6, yaw: -Math.PI / 2 },
    cells,
  };

  // ---- road network for cop cars (centre lines: ring A, ring B, the connectors) -----------------
  const rn: { x: number; z: number }[] = [];
  const rnId = (x: number, z: number) => { let i = rn.findIndex((n) => n.x === x && n.z === z); if (i < 0) { i = rn.length; rn.push({ x, z }); } return i; };
  const redges: [number, number][] = [];
  const rlink = (ax: number, az: number, bx: number, bz: number) => redges.push([rnId(ax, az), rnId(bx, bz)]);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as [number, number][]) {
    // ring A: corner to the next corner (counter-clockwise order)
    rlink(sx * RA, sz * RA, sx === sz ? sx * RA : -sx * RA, sx === sz ? -sz * RA : sz * RA);
    // connectors from the ring A corner out to ring B (one along x, one along z)
    rlink(sx * RA, sz * RA, sx * RA, sz * RB);
    rlink(sx * RA, sz * RA, sx * RB, sz * RA);
    // ring B pieces around this corner
    rlink(sx * RB, sz * RB, sx * RA, sz * RB);
    rlink(sx * RB, sz * RB, sx * RB, sz * RA);
  }
  // ring B middles (between the two connectors on each side)
  rlink(-RA, RB, RA, RB); rlink(-RA, -RB, RA, -RB); rlink(RB, -RA, RB, RA); rlink(-RB, -RA, -RB, RA);
  const roadGraph = { nodes: rn, edges: redges };

  // ---- traffic: two-way loops on both rings (right-hand lanes) --------------------------------
  const loop = (id: string, h: number, ccw: boolean, cars: number, speed: number): TrafficLoop => ({
    id, cars, speed,
    points: ccw ? [{ x: -h, z: -h }, { x: h, z: -h }, { x: h, z: h }, { x: -h, z: h }] : [{ x: -h, z: -h }, { x: -h, z: h }, { x: h, z: h }, { x: h, z: -h }],
  });
  const traffic = [loop("A-ccw", RA + 2, true, 3, 9), loop("A-cw", RA - 2, false, 3, 9), loop("B-ccw", RB + 2, true, 4, 11), loop("B-cw", RB - 2, false, 4, 11)];

  // ---- event geometry -------------------------------------------------------------------------
  const truckRoutes = [
    { name: "NORTH", ax: -76, az: RB - 2, bx: 76, bz: RB - 2 },
    { name: "SOUTH", ax: 76, az: -RB + 2, bx: -76, bz: -RB + 2 },
    { name: "EAST", ax: RB - 2, az: 76, bx: RB - 2, bz: -76 },
    { name: "WEST", ax: -RB + 2, az: -76, bx: -RB + 2, bz: 76 },
  ];
  const happyZones = [
    { x: 0, z: 0, r: 20, name: "the Plaza" },
    { x: 50, z: 50, r: 14, name: "the North-East block" },
    { x: -50, z: 50, r: 14, name: "the North-West block" },
    { x: 50, z: -50, r: 14, name: "the South-East block" },
    { x: -50, z: -50, r: 14, name: "the South-West block" },
  ];
  const airdropSpots: [number, number][] = [[12, 12], [-12, 12], [12, -12], [-12, -12], [0, 15], [15, 0], [0, -15], [-15, 0]];

  const spawns = forts.map((f) => ({ x: f.padX, z: f.padZ, yaw: f.yaw }));
  const landmarks = {
    ledge09: { x: -94, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge14: { x: -89, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge195: { x: -84, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    tunnelEntrance: { x: -93.5, z: -84, yaw: Math.PI / 2, roofStartX: -91, roofEndX: -85 },
    plaza: { x: 0, z: -10, yaw: 0 },
    /** 40+ m of clear paving heading north (sprint / slide tests) */
    runway: { x: -16, z: -21, yaw: 0 },
    /** open spots in the plaza, clear for ~6 m in +z (loot / punch tests) */
    spotA: { x: -16, z: -8, yaw: 0 },
    spotB: { x: -8, z: -8, yaw: 0 },
    spotC: { x: -16, z: 5, yaw: 0 },
  };
  const navLines = [-75.5, -64.5, -50, -35.5, -24.5, -16, -8, 0, 8, 16, 24.5, 35.5, 50, 64.5, 75.5];

  return {
    halfSize: HALF, boxes, spawns, lootSpawns: loot, forts, landmarks, roads, crosswalks, navLines, props,
    shops, traffic, truckRoutes, happyZones, airdropSpots, decor, station, roadGraph,
  };
}
