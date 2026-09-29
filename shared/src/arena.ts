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
  /** Slice 2A: which way the sign faces (unit vector on x/z); default = toward the city centre */
  face?: [number, number];
  /** Slice 2A: drawn only when the camera is near this building (interiors); see ArenaLayout.units */
  unit?: number;
  /** C4a: smashed (a broken bench / shop window): collision ignores it until the city resets */
  off?: boolean;
  /** C2: a street building's ground floor: a shopfront (glass, door, awning) or a tower lobby */
  front?: "shop" | "lobby";
}

export type BoxKind =
  | "wall" | "crate" | "curb" | "ramp-step" | "platform" | "ledge" | "slab"
  | "building" | "roof" | "sidewalk" | "fence" | "dumpster" | "bench" | "planter" | "fountain"
  | "kiosk" | "van" | "busstop" | "fort" | "tree" | "junk" | "counter"
  // Phase 3.5 city overhaul
  | "tower" | "plaza" | "shelf" | "fridge" | "shopfloor" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "statue"
  // Phase 4 police station
  | "bars"
  // Slice 2A city overhaul: storefront glass, stairs, shop fixtures, upstairs furniture, street clutter
  | "glass" | "step" | "arcade" | "washer" | "rack" | "case" | "table" | "chair" | "cage"
  | "bed" | "sofa" | "desk" | "cooler" | "gymbench" | "boxes" | "plinth" | "rim" | "dock" | "truck"
  | "hydrant" | "mailbox" | "bikerack" | "board" | "pot" | "bags" | "pallet" | "portaloo" | "mixer" | "trolley";

export interface SpawnPoint {
  x: number; y: number; z: number; zone: LootZone;
  /** only these item types spawn here (shop shelves) */
  pool?: string[];
  /** shop this spot belongs to (cashier yells if you swipe it) */
  shop?: number;
  /** City Redesign C1: 0 = low (south, cheap), 1 = medium, 2 = high (north, richest) */
  tier?: number;
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number; }
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;

/** Things you can search, smash or rob (Phase 3.5). Static list; their state lives in the World. */
export type PropKind = "dumpster" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "till"
  // C4a: street things you can smash (each is one of the arena's boxes; broken = it stops blocking until dawn)
  | "shopglass" | "busstop" | "hydrant" | "mailbox" | "bench" | "planter" | "table" | "pallet";
export interface PropDef {
  id: string; kind: PropKind; x: number; y: number; z: number; yaw: number; shop?: number; color?: string;
  /** C4a: the arena box this prop is (breakables): index into ArenaLayout.boxes */
  box?: number;
  /** C4a: half-size of its footprint (for reach checks on long things like benches and shop windows) */
  hw?: number; hd?: number;
}

export type ShopType = "mart" | "pawn" | "bakery" | "gadget"
  // Slice 2A
  | "donut" | "pharmacy" | "pizza" | "taco" | "arcade" | "thrift" | "sneaker" | "jeweller" | "phone" | "laundry" | "barber" | "pet";
export interface ShopDef {
  id: number; name: string; type: ShopType;
  /** inside of the shop (for "caught shoplifting" checks) */
  rect: Rect;
  /** where the cashier stands and which way they face (toward the door) */
  cashier: { x: number; z: number; yaw: number };
  /** till on the counter (the register item sits here) */
  till: { x: number; y: number; z: number };
  floorColor: string; wallColor: string;
  /** Slice 2A: the shop floor is at ground level; anyone higher up (the floor above) isn't "in the shop" */
  maxY?: number;
}

/**
 * Slice 2A: a building plot along a street. Ground floor = a walk-in shop / lobby (or a closed
 * front for things that open in later slices: the bank, clubs, the bar), maybe a floor above.
 * The renderer uses this to draw each interior only when you're near it.
 */
export interface UnitDef {
  id: number;
  name: string;
  /** "shop" | "lobby" (stairs up, no cashier) | "closed" */
  use: "shop" | "lobby" | "closed";
  shop?: number;
  /** footprint (world rectangle) and centre */
  rect: Rect; x: number; z: number;
  /** direction out of the front door (unit vector) and the door centre on the front face */
  out: [number, number]; doorX: number; doorZ: number;
  /** what's upstairs, and how you get there */
  upper?: "stock" | "office" | "apart" | "gym";
  access?: "inside" | "fire";
  wallColor: string; floorColor: string;
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

/**
 * City Redesign C1: the real road network traffic drives. Junctions (nodes) joined by roads (edges).
 * Straight roads are axis-aligned; the roundabout ring is made of arcs (one-way, counter-clockwise).
 * Traffic keeps right; lanes are built from this by the TrafficSystem.
 */
export interface RoadNode {
  id: number; x: number; z: number;
  /** light = traffic lights (one approach at a time), give = give way (first come, one approach at a time),
   *  round = a roundabout entry (cars on the ring go first), end = a road end (no junction) */
  ctl: "light" | "give" | "round" | "end";
  name?: string;
}
export interface RoadEdge {
  a: number; b: number;
  /** half-width of the road surface (two-way roads: one lane each side of the centre line) */
  hw: number;
  /** one-way from a to b */
  oneway?: boolean;
  /** where the road actually starts / ends if not at the node centre (e.g. the jog at the Mile) */
  pa?: [number, number]; pb?: [number, number];
  /** an arc around (cx, cz), counter-clockwise from a to b, lane centre radius r */
  arc?: { cx: number; cz: number; r: number };
  name?: string;
}
export interface RoadNet { nodes: RoadNode[]; edges: RoadEdge[]; }

/** A city block: ground between streets, lined with buildings. Used by the layout checks and loot tiers. */
export interface BlockDef {
  name: string; rect: Rect; tier: number;
  /** street sides that are allowed to be open (a park, a plaza, a forecourt) */
  open?: ("N" | "S" | "E" | "W")[];
  /** the sides that face a street (optionally only part of a side) */
  sides?: { dir: "N" | "S" | "E" | "W"; from?: number; to?: number }[];
}

/** Which tier a z position is in (0 low / south, 1 medium, 2 high / north). */
export function tierAt(z: number): number { return z > 46 ? 2 : z < -46 ? 0 : 1; }

export type LootZone = "plaza" | "street" | "alley" | "rooftop" | "shop" | "yard"
  // Slice 2A: indoors, upstairs (apartments, offices, the gym, stockrooms)
  | "room";

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
  /** C1: walled compound: the squeeze gap in the back wall (raccoons sneak in and out through it) */
  gapX?: number; gapZ?: number;
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
  /** C4a: how many boxes are switched off (smashed) right now; 0 = nearBoxes skips the filter */
  offCount?: number;
  boxes: Box[];
  spawns: { x: number; z: number; yaw: number }[];
  /** loot spawn points (Phase 2+) */
  lootSpawns?: SpawnPoint[];
  forts?: FortLot[];
  // Phase 3.5: the bigger city
  roads?: Rect[];
  /** C1: round road surfaces (the roundabout): r0..r1 from the centre */
  roadRings?: { x: number; z: number; r0: number; r1: number }[];
  crosswalks?: Rect[];
  /** grid lines pedestrians walk along (x and z) */
  navLines?: number[];
  /** C1: separate z lines (navLines are then the x lines) */
  navLinesZ?: number[];
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
  decor?: { kind: "streetlight" | "hydrant" | "dash" | "zebra" | "grass" | "copcar" | "cone" | "wetfloor" | "scaffold" | "umbrella"; x: number; z: number; w?: number; d?: number; h?: number; yaw?: number; text?: string }[];
  // Slice 2A
  /** shallow water (the pond): you wade slowly, pedestrians walk around it */
  water?: Rect[];
  /** extra walking routes for pedestrians (e.g. into shops): consecutive points are linked,
   *  the first point also links to the nearest street route points */
  navChains?: { x: number; z: number }[][];
  units?: UnitDef[];
  /** C1.1: people who stand at a spot (the apartment tower's doorman) */
  posts?: { kind: "doorman" | "fisherman"; x: number; z: number; yaw: number }[];
  /** C4a: where the street junk sits each day (chairs by café tables, lids by bins, bricks on building sites...) */
  junkSpots?: { type: string; x: number; z: number; y?: number; yaw?: number }[];
  /** C3: bushes you can crouch in to hide from the cops (walk-through) */
  bushes?: Rect[];
  /** C3: the pond's real shape for the renderer (a union of circles; the wading area is in \`water\`) */
  pondShape?: { x: number; z: number; r: number }[];
  /** C1.1: deep water (the canal): you float, can't climb out except at ladders */
  deepWater?: Rect[];
  /** C1: the road network cars drive, and the city blocks */
  roadNet?: RoadNet;
  blocks?: BlockDef[];
  /** C1: purely visual scenery the renderer draws (highway deck, rails, canal...) */
  scenery?: { kind: "highway" | "rail" | "canal" | "light" | "grassdisc" | "pillar" | "clock" | "ladder" | "lamp"; x: number; z: number; w?: number; d?: number; h?: number; r?: number; yaw?: number; node?: number; approach?: number }[];
  /** named places, used by tests and tutorials */
  landmarks?: Record<string, { x: number; z: number; yaw: number; [extra: string]: number }>;
}

/** On the road surface (straight roads or the roundabout ring)? */
export function onRoadAt(arena: ArenaLayout, x: number, z: number, pad = 0): boolean {
  const roads = arena.roads;
  if (roads) for (let i = 0; i < roads.length; i++) { const r = roads[i]; if (x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad) return true; }
  const rings = arena.roadRings;
  if (rings) for (const g of rings) { const d = Math.hypot(x - g.x, z - g.z); if (d >= g.r0 - pad && d <= g.r1 + pad) return true; }
  return false;
}

/** C1.1: in the deep water (the canal)? (feet at the water level: standing on a dock or a bridge doesn't count) */
export function inDeepWater(arena: ArenaLayout, x: number, z: number, y = 0): boolean {
  if (!arena.deepWater || y > 0.25) return false;
  for (const r of arena.deepWater) if (inRect(r, x, z)) return true;
  return false;
}

/** C3: inside a bush (crouch there and the cops can't see you)? */
export function inBush(arena: ArenaLayout, x: number, z: number): boolean {
  if (!arena.bushes) return false;
  for (const r of arena.bushes) if (inRect(r, x, z)) return true;
  return false;
}

/** Slice 2A: standing in water (the pond)? */
export function inWater(arena: ArenaLayout, x: number, z: number): boolean {
  if (!arena.water) return false;
  for (const r of arena.water) if (inRect(r, x, z)) return true;
  return false;
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
interface Grid { cells: Map<number, number[]>; cellBoxes: Map<number, Box[]>; boxes: Box[]; stamp: Uint32Array; gen: number; }
const grids = new WeakMap<ArenaLayout, Grid>();
const key = (cx: number, cz: number) => (cx + 1000) * 4096 + (cz + 1000);

function gridOf(arena: ArenaLayout): Grid {
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
    const cellBoxes = new Map<number, Box[]>();
    for (const [k, list] of cells) cellBoxes.set(k, list.map((i) => arena.boxes[i]));
    g = { cells, cellBoxes, boxes: arena.boxes, stamp: new Uint32Array(arena.boxes.length), gen: 0 };
    grids.set(arena, g);
  }
  return g;
}
const NONE: Box[] = [];

/** Boxes whose footprint could touch the square (x +- r, z +- r), in original order. */
export function nearBoxes(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  const all = nearBoxesAll(arena, x, z, r);
  return arena.offCount ? all.filter((b) => !b.off) : all; // (C4a: smashed things don't block)
}

/** C4a: switch a box off (smashed) or back on, keeping the arena's count right. */
export function setBoxOff(arena: ArenaLayout, i: number, off: boolean) {
  const b = arena.boxes[i];
  if (!b || !!b.off === off) return;
  b.off = off;
  arena.offCount = Math.max(0, (arena.offCount ?? 0) + (off ? 1 : -1));
}

function nearBoxesAll(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  if (arena.boxes.length < 64) return arena.boxes; // small arenas: not worth it
  const g = gridOf(arena);
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  // (Slice 2A: many more boxes; one cell = a ready-made list, no set/sort)
  if (x0 === x1 && z0 === z1) return g.cellBoxes.get(key(x0, z0)) ?? NONE;
  if (++g.gen === 0xffffffff) { g.stamp.fill(0); g.gen = 1; }
  const gen = g.gen, stamp = g.stamp;
  const idx: number[] = [];
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
    const list = g.cells.get(key(cx, cz));
    if (!list) continue;
    for (let j = 0; j < list.length; j++) { const i = list[j]; if (stamp[i] !== gen) { stamp[i] = gen; idx.push(i); } }
  }
  idx.sort((a, b) => a - b);
  const out = new Array<Box>(idx.length);
  for (let j = 0; j < idx.length; j++) out[j] = g.boxes[idx[j]];
  return out;
}

/** A view of the arena holding only the boxes near a point (for one collision step). */
export function localArena(arena: ArenaLayout, x: number, z: number, r: number): ArenaLayout {
  if (arena.boxes.length < 64 && !arena.offCount) return arena;
  return { ...arena, boxes: nearBoxes(arena, x, z, r) };
}
