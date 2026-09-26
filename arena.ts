// PLACEHOLDER grey-box arena used in Phase 0/1 to test movement and multiplayer.
// The real Trashington city block replaces this in Phase 2.
// Both client (for rendering + prediction) and server (for authority) read this list,
// so collisions are identical on both sides.

export interface Box {
  /** centre */
  x: number;
  y: number;
  z: number;
  /** full sizes */
  w: number; // along x
  h: number; // along y
  d: number; // along z
  kind: BoxKind;
  /** optional look hints for the renderer (colour, sign text, windows...) */
  color?: string;
  sign?: string;
  windows?: boolean;
}

export type BoxKind =
  | "wall" | "crate" | "curb" | "ramp-step" | "platform" | "ledge" | "slab"
  | "building" | "roof" | "sidewalk" | "fence" | "dumpster" | "bench" | "planter" | "fountain"
  | "kiosk" | "van" | "busstop" | "fort" | "tree" | "junk" | "counter"
  // Phase 3.5 city overhaul
  | "tower" | "plaza" | "shelf" | "fridge" | "shopfloor" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "statue"
  // Phase 4 police station
  | "bars";

export interface SpawnPoint {
  x: number; y: number; z: number; zone: LootZone;
  /** only these item types spawn here (shop shelves) */
  pool?: string[];
  /** shop this spot belongs to (cashier yells if you swipe it) */
  shop?: number;
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number; }
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;

/** Things you can search, smash or rob (Phase 3.5). Static list; their state lives in the World. */
export type PropKind = "dumpster" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "till";
export interface PropDef { id: string; kind: PropKind; x: number; y: number; z: number; yaw: number; shop?: number; color?: string; }

export type ShopType = "mart" | "pawn" | "bakery" | "gadget";
export interface ShopDef {
  id: number; name: string; type: ShopType;
  /** inside of the shop (for "caught shoplifting" checks) */
  rect: Rect;
  /** where the cashier stands and which way they face (toward the door) */
  cashier: { x: number; z: number; yaw: number };
  /** till on the counter (the register item sits here) */
  till: { x: number; y: number; z: number };
  floorColor: string; wallColor: string;
}

/** A closed driving loop (lane centre line, corners in driving order) and how many cars use it. */
export interface TrafficLoop { id: string; points: { x: number; z: number }[]; cars: number; speed: number; }
/** Phase 4: the police station (jail cells, where you walk out, where you break out to). */
export interface StationDef {
  /** whole building footprint */
  rect: Rect;
  /** outside the front door: where you're released after serving your time */
  door: { x: number; z: number; yaw: number };
  /** the back alley: where you end up after picking the lock */
  alley: { x: number; z: number; yaw: number };
  /** one cell per player: stand here while locked up (facing the bars) */
  cells: { x: number; z: number; yaw: number; rect: Rect }[];
}

/** Road centre-line network (cop cars drive it): points + straight links between them. */
export interface RoadGraph { nodes: { x: number; z: number }[]; edges: [number, number][]; }

export type LootZone = "plaza" | "street" | "alley" | "rooftop" | "shop" | "yard";

export interface FortLot {
  slot: number;
  /** centre of the drop pad in front of the fort */
  padX: number; padZ: number;
  /** fort box position */
  x: number; z: number;
  /** direction the fort faces (toward the city centre) */
  yaw: number;
  /** the yard around the fort: loot resting here is "at home" (world-aligned rectangle) */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** a spot in the back alley behind the fort (raccoons come from here) */
  backX: number; backZ: number;
}

/** Which fort yard (slot) a point is in, or -1. */
export function fortAt(arena: ArenaLayout, x: number, z: number): number {
  for (const f of arena.forts ?? []) {
    const r = f.zone;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return f.slot;
  }
  return -1;
}

export interface ArenaLayout {
  halfSize: number; // playable area is [-halfSize, halfSize] on x and z
  boxes: Box[];
  spawns: { x: number; z: number; yaw: number }[];
  /** loot spawn points (Phase 2+) */
  lootSpawns?: SpawnPoint[];
  forts?: FortLot[];
  // Phase 3.5: the bigger city
  roads?: Rect[];
  crosswalks?: Rect[];
  /** grid lines pedestrians walk along (x and z) */
  navLines?: number[];
  props?: PropDef[];
  shops?: ShopDef[];
  traffic?: TrafficLoop[];
  truckRoutes?: { name: string; ax: number; az: number; bx: number; bz: number }[];
  happyZones?: { x: number; z: number; r: number; name: string }[];
  airdropSpots?: [number, number][];
  // Phase 4
  station?: StationDef;
  roadGraph?: RoadGraph;
  /** purely visual extras (streetlights, lane paint, parked police cars...) */
  decor?: { kind: "streetlight" | "hydrant" | "dash" | "zebra" | "grass" | "copcar"; x: number; z: number; w?: number; d?: number; yaw?: number }[];
  /** named places, used by tests and tutorials */
  landmarks?: Record<string, { x: number; z: number; yaw: number; [extra: string]: number }>;
}

export function box(x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], baseY = 0): Box {
  return { x, y: baseY + h / 2, z, w, h, d, kind };
}

export function buildTestArena(): ArenaLayout {
  const half = 30;
  const boxes: Box[] = [];

  // Perimeter walls
  const t = 1;
  const wallH = 4;
  boxes.push(box(0, half + t / 2, half * 2 + t * 2, t, wallH, "wall"));
  boxes.push(box(0, -half - t / 2, half * 2 + t * 2, t, wallH, "wall"));
  boxes.push(box(half + t / 2, 0, t, half * 2, wallH, "wall"));
  boxes.push(box(-half - t / 2, 0, t, half * 2, wallH, "wall"));

  // Central "plaza" crates: things to run around and break line of sight
  boxes.push(box(0, 0, 3, 3, 2.2, "crate"));
  boxes.push(box(5, 4, 2, 2, 1.2, "crate"));
  boxes.push(box(-6, -3, 2.5, 1.5, 1.6, "crate"));
  boxes.push(box(-4, 7, 1.5, 4, 2.5, "crate"));
  boxes.push(box(8, -7, 4, 1, 3, "wall"));

  // Curb strip (walk up automatically: lower than stepHeight)
  boxes.push(box(0, -14, 20, 3, 0.25, "curb"));

  // A staircase of jumpable steps up to a rooftop platform
  boxes.push(box(15, 10, 2, 2, 0.35, "ramp-step"));
  boxes.push(box(15, 12, 2, 2, 0.9, "ramp-step"));
  boxes.push(box(15, 14, 2, 2, 1.45, "ramp-step"));
  boxes.push(box(15, 18, 6, 6, 2.0, "platform"));

  // Alley: two long walls forming a narrow corridor
  boxes.push(box(-18, 8, 1, 14, 3.5, "wall"));
  boxes.push(box(-21.5, 8, 1, 14, 3.5, "wall"));

  // Phase 1 movement playground
  // Mantle ledges: waist-high, chest-high and head-high
  boxes.push(box(-10, -10, 3, 2, 0.9, "ledge"));
  boxes.push(box(-14, -10, 3, 2, 1.4, "ledge"));
  boxes.push(box(-18, -10, 3, 2, 1.95, "ledge"));
  // Crawl tunnel: a low slab (bottom at 1.25 m) between two walls. Crouch to get through.
  boxes.push(box(22, -6, 3.2, 6, 0.3, "slab", 1.25));
  boxes.push(box(20.2, -6, 0.4, 6, 1.55, "wall"));
  boxes.push(box(23.8, -6, 0.4, 6, 1.55, "wall"));

  const spawns = [
    { x: -3, z: -22, yaw: 0 },
    { x: 3, z: -22, yaw: 0 },
    { x: -9, z: -22, yaw: 0 },
    { x: 9, z: -22, yaw: 0 },
  ];

  return { halfSize: half, boxes, spawns };
}

// ---------------------------------------------------------------------------------------
// Broadphase (Phase 3.5): the 200 m city has hundreds of boxes, so collision code asks for
// just the boxes near a point. Boxes come back in their ORIGINAL order, so results are
// identical to checking the full list (client prediction and server stay in lock-step).
const CELL = 8;
const grids = new WeakMap<ArenaLayout, { cells: Map<number, number[]>; boxes: Box[] }>();
const key = (cx: number, cz: number) => (cx + 1000) * 4096 + (cz + 1000);

function gridOf(arena: ArenaLayout) {
  let g = grids.get(arena);
  if (!g || g.boxes !== arena.boxes) {
    const cells = new Map<number, number[]>();
    arena.boxes.forEach((b, i) => {
      const x0 = Math.floor((b.x - b.w / 2) / CELL), x1 = Math.floor((b.x + b.w / 2) / CELL);
      const z0 = Math.floor((b.z - b.d / 2) / CELL), z1 = Math.floor((b.z + b.d / 2) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const list = cells.get(k);
        if (list) list.push(i); else cells.set(k, [i]);
      }
    });
    g = { cells, boxes: arena.boxes };
    grids.set(arena, g);
  }
  return g;
}

/** Boxes whose footprint could touch the square (x +- r, z +- r), in original order. */
export function nearBoxes(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  if (arena.boxes.length < 64) return arena.boxes; // small arenas: not worth it
  const g = gridOf(arena);
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  const seen = new Set<number>();
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
    const list = g.cells.get(key(cx, cz));
    if (list) for (const i of list) seen.add(i);
  }
  const idx = [...seen].sort((a, b) => a - b);
  return idx.map((i) => g.boxes[i]);
}

/** A view of the arena holding only the boxes near a point (for one collision step). */
export function localArena(arena: ArenaLayout, x: number, z: number, r: number): ArenaLayout {
  if (arena.boxes.length < 64) return arena;
  return { ...arena, boxes: nearBoxes(arena, x, z, r) };
}
