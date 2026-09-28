// Trashington, City Redesign slice C1 (layout grey-box): a 230 m city in three tiers, south to north.
// Shared by the host / solo game rules and the renderer (same boxes on both sides).
//
//   x = east, z = north. Fence at +-115.
//
//   z 104..115  North Parade ................................................. (fence)
//   z  46..104  HIGH: Uptown (hotel, museum, HQ, casino, mall, car park, country club) around the
//               City Hall one-way loop; Gold St crosstown.           station (NW)  |  marina (NE)
//   z -46..46   MEDIUM: the park inside the roundabout, the police precinct north of it, Old Brick
//               (west, Crooked St), Market Row (east, one-way loop round the market hall).
//               rail yard + arches (W)  |  canal quay (E)
//   z -85..-46  LOW: The Yards (half-built skyscraper, walk-ups, corner shops).
//               build yard (W)  |  bus depot (E)
//   z -115..-85 Tent Town under the overhead highway: 4 walled fort compounds, service road.
//
// Roads are straight and axis-aligned (collision is box-only), all joined, no dead ends:
// Mayor's Mile (x = 0) runs from the service road through the roundabout and the City Hall loop
// to North Parade; an edge ring (west road, east road, service road, North Parade); crosstown
// Yards Road and Uptown Ave (each with a small jog at the Mile); Gold St; Crooked St (x = -56);
// Uptown's east street (x = 56); the Market Row loop. Traffic lights where the Mile crosses the two
// crosstown streets, give way everywhere else, cars on the roundabout go first.
//
// Every block is lined with buildings wall to wall (a gap for the alley into the courtyard behind);
// landmarks take at most half a block. The 20 street-level units from Slice 2A (14 walk-in shops,
// 2 lobbies, the bank, two clubs and the bar) are placed along the new streets.
import {
  box, tierAt, type Box, type ArenaLayout, type SpawnPoint, type FortLot, type LootZone, type PropDef, type PropKind,
  type Rect, type ShopDef, type ShopType, type UnitDef, type RoadNet, type RoadNode, type RoadEdge, type BlockDef,
} from "./arena.js";

const HALF = 115;
/** sidewalk width along every street */
const SW = 4;
export const UNIT = {
  w: 15, d: 13,
  /** ground-floor ceiling slab 4.5..4.8; upstairs floor at 4.8; upstairs ceiling 9.0..9.3 */
  gf: 4.5, upper: 4.8, ufTop: 9.0,
  door: 2.6, glassH: 3.3,
  stepRun: 0.45, steps: 15,
};
/** The roundabout round the park: lane centre radius, road surface r0..r1, and no buildings inside RING_CLEAR. */
export const RING = { r: 25.7, r0: 21.7, r1: 29.7, clear: 32.7 };
/** Tent Town fort compounds (x centres; slot 0/1 = the corners, 2/3 = the middle two) */
export const COMPOUND = { xs: [-99, 99, -33, 33], z0: -111, z1: -96, half: 8, wallH: 2.5 };
/** The overhead highway over Tent Town */
export const HIGHWAY = { z0: -110, z1: -96, y: 9.5, h: 1 };

type Dir = "N" | "S" | "E" | "W";

function hash(a: number, b: number) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
const rectI = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const R = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

const SIGNS_LOW = ["DISCOUNT SOUP", "PIGEON SUPPLY", "MOP EMPORIUM", "CHEAP WIGS", "HAT HUT", "SOCK OUTLET", "NAPKIN DEPOT", "USED MATTRESS WORLD", "CASH 4 SPOONS", "BUDGET DENTIST", "PAWN-ISH", "LIQUOR-ISH"];
const SIGNS_MID = ["BRICK & MORTAR", "VINTAGE RECORDS", "NOODLE PALACE", "LAUNDRO-MATT", "FANCY-ISH FLOWERS", "OLD TIMEY BARBER", "BOOKS (SOME)", "TAILOR SWIFTLY", "DELI-CIOUS", "CHEESE LOUISE", "BAGELS & BAGELS", "RENT-A-CANOE"];
const SIGNS_HIGH = ["INSURANCE-ISH", "BOXLY INC", "YELLING NEWS 24", "GOOCHY", "VERSAYCHEE", "PRADUH", "HOTEL ADEQUATE", "CRUNCHO+ TOWER", "GOLDMAN SNACKS", "LAWYERS 4 MORE", "THE PENTHOUSE", "ART-ISH GALLERY"];

/** What each kind of shop has on its shelves (Slice 2C adds themed items for the new shops). */
export const SHOP_POOLS: Record<ShopType, string[]> = {
  mart: ["canned_beans", "energy_drink", "candy_bar", "soda_can", "lottery_ticket", "fancy_cheese"],
  pawn: ["gold_chain", "guitar", "sunglasses", "golden_spork", "snow_globe", "mixtape"],
  bakery: ["bagel", "baguette", "birthday_cake", "fancy_cheese", "donut"],
  gadget: ["phone_handset", "fancy_earbuds", "laptop", "crt_tv", "mixtape"],
  donut: ["donut", "soda_can", "energy_drink", "birthday_cake", "candy_bar"],
  pharmacy: ["energy_drink", "protein_shaker", "sunglasses", "candy_bar", "lottery_ticket", "soda_can"],
  pizza: ["half_sandwich", "soda_can", "fancy_cheese", "baguette", "energy_drink"],
  taco: ["half_sandwich", "soda_can", "energy_drink", "coin_pile"],
  arcade: ["coin_pile", "mixtape", "snow_globe", "award_trophy", "rubber_chicken", "disposable_camera"],
  thrift: ["cursed_sneakers", "mixtape", "guitar", "snow_globe", "sunglasses", "mime_beret"],
  sneaker: ["cursed_sneakers", "sunglasses", "protein_shaker", "fancy_earbuds"],
  jeweller: ["gold_chain", "diamond_ring", "rolecks_watch", "golden_spork", "gold_chain"],
  phone: ["phone_handset", "bedazzled_phone", "fancy_earbuds", "disposable_camera", "phone_handset"],
  laundry: ["coin_pile", "pocket_lint", "mystery_wallet", "expired_coupon", "cursed_sneakers"],
  barber: ["sunglasses", "gold_chain", "coin_pile", "energy_drink", "newspaper"],
  pet: ["lucky_pigeon", "bread_crumbs", "canned_beans", "rubber_chicken"],
};

/** A street-level building from Slice 2A and what goes in it. */
interface UnitSpec {
  name: string;
  use: "shop" | "lobby" | "closed";
  type?: ShopType;
  /** fixtures layout on the shop floor */
  layout?: "shelves" | "food" | "arcade" | "laundry" | "thrift" | "jeweller" | "barber" | "office" | "apart";
  /** back fixture kind for "shelves" shops */
  back?: "fridge" | "table" | "cage" | "shelf";
  backroom?: boolean;
  upper?: "stock" | "office" | "apart" | "gym";
  access?: "inside" | "fire";
  wall: string; floor: string;
  /** closed-front colour + sign */
  sub?: string;
}

const U: Record<string, UnitSpec> = {
  mart: { name: "CORNER MART", use: "shop", type: "mart", layout: "shelves", back: "fridge", wall: "#3f8f6a", floor: "#d8e8d0" },
  donut: { name: "HOLE LOTTA DONUTS", use: "shop", type: "donut", layout: "food", upper: "apart", access: "fire", wall: "#e0779a", floor: "#fbe3ea" },
  pharm: { name: "DRUG-ISH MART", use: "shop", type: "pharmacy", layout: "shelves", back: "fridge", wall: "#4f8fc9", floor: "#e6f0f7" },
  pizza: { name: "LEANING TOWER OF PIZZA", use: "shop", type: "pizza", layout: "food", upper: "apart", access: "fire", wall: "#c9442f", floor: "#f2e1c8" },
  bank: { name: "BIG BANK OF TRASHINGTON", use: "closed", sub: "OPENING SOON", wall: "#8a7d5c", floor: "#e8e2d4" },
  bagel: { name: "BAGEL BARN", use: "shop", type: "bakery", layout: "food", wall: "#c26b4a", floor: "#f0dcc0" },
  arcade: { name: "PIXEL PALACE", use: "shop", type: "arcade", layout: "arcade", backroom: true, upper: "stock", access: "inside", wall: "#6b3fa0", floor: "#2b2240" },
  thrift: { name: "SECOND HAND STAN'S", use: "shop", type: "thrift", layout: "thrift", wall: "#8a6a3c", floor: "#e8dcc4" },
  kicks: { name: "KICKS R US", use: "shop", type: "sneaker", layout: "shelves", back: "shelf", upper: "gym", access: "fire", wall: "#2f2f3a", floor: "#e0e0e6" },
  gizmo: { name: "GIZMO GARAGE", use: "shop", type: "gadget", layout: "shelves", back: "table", wall: "#3d5a9e", floor: "#cfd8e8" },
  bling: { name: "BLING THING", use: "shop", type: "jeweller", layout: "jeweller", backroom: true, upper: "stock", access: "inside", wall: "#1f1f2e", floor: "#f4efe0" },
  cracked: { name: "CRACKED SCREENS", use: "shop", type: "phone", layout: "shelves", back: "table", upper: "stock", access: "inside", wall: "#2a8f8a", floor: "#d8efec" },
  spin: { name: "SPIN CYCLE", use: "shop", type: "laundry", layout: "laundry", wall: "#43a7c7", floor: "#e8f4f8" },
  hair: { name: "HAIR TODAY", use: "shop", type: "barber", layout: "barber", wall: "#b03a48", floor: "#f4f1ea" },
  pet: { name: "PET PEEVES", use: "shop", type: "pet", layout: "shelves", back: "cage", wall: "#6aa84f", floor: "#eef5e6" },
  subpar: { name: "CLUB SUB-PAR", use: "closed", sub: "OPENS AFTER DARK (SOON)", wall: "#2b1f3a", floor: "#1f1a28" },
  dive: { name: "THE DIVE", use: "closed", sub: "BAR (OPENING SOON)", wall: "#5a3a24", floor: "#3a2a1c" },
  lawyers: { name: "LAWYERS 4 LESS", use: "lobby", layout: "office", upper: "office", access: "inside", wall: "#4a5a6b", floor: "#d8d4cc" },
  sweatbox: { name: "THE SWEATBOX", use: "closed", sub: "CLUB (OPENING SOON)", wall: "#3a1f2b", floor: "#1f1a28" },
  arms: { name: "THE CRUMBLING ARMS", use: "lobby", layout: "apart", upper: "apart", access: "inside", wall: "#8a6a5a", floor: "#d8ccc0" },
};

/** One block: its ground, its street sides (optionally only part of a side), what's reserved in it. */
interface BlockSpec {
  name: string; rect: Rect;
  /** street frontages: the side, and optionally the stretch of it that faces a street */
  sides: { dir: Dir; from?: number; to?: number }[];
  /** sides that may stay open (plaza, forecourt, the roundabout) */
  open?: Dir[];
  /** clip the ground (and keep buildings out of) the roundabout */
  ring?: boolean;
  /** street-level units: spec, which side they face, where along it */
  units?: { spec: UnitSpec; dir: Dir; at: number; height?: number }[];
  /** landmark footprints (built separately): the filler keeps out of them */
  keep?: Rect[];
  /** no courtyard alley gap (thin blocks) */
  noAlley?: boolean;
}

export function buildTrashington(): ArenaLayout {
  const boxes: Box[] = [];
  const loot: SpawnPoint[] = [];
  const props: PropDef[] = [];
  const decor: NonNullable<ArenaLayout["decor"]> = [];
  const scenery: NonNullable<ArenaLayout["scenery"]> = [];
  const shops: ShopDef[] = [];
  const units: UnitDef[] = [];
  const navChains: { x: number; z: number }[][] = [];
  const water: Rect[] = [];
  const streetLoot: [number, number][] = [];
  const spawnAt = (x: number, z: number, zone: LootZone, y = 0, extra: Partial<SpawnPoint> = {}) => loot.push({ x, y, z, zone, tier: tierAt(z), ...extra });
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

  // ==== one downtown building ======================================================================
  /**
   * fx, fz: centre of the front face; out: unit vector out of the front door (toward the street).
   * Local coordinates: u across the front (right = (-out.z, out.x)), v = depth into the building.
   */
  const buildUnit = (spec: UnitSpec, fx: number, fz: number, out: [number, number], height: number) => {
    const { w: W, d: D, gf: GF, upper: UP, ufTop: UT } = UNIT;
    const hw = W / 2;
    const [nx, nz] = out;
    const rx = -nz, rz = nx;
    const uid = units.length;
    const P = (u: number, v: number): [number, number] => [fx + rx * u - nx * v, fz + rz * u - nz * v];
    const alongX = Math.abs(nx) > 0.5; // depth runs along x
    const B = (u: number, v: number, wu: number, wv: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, baseY = 0) => {
      const [x, z] = P(u, v);
      const b: Box = { ...box(x, z, alongX ? wv : wu, alongX ? wu : wv, h, kind, baseY), ...extra };
      boxes.push(b);
      return b;
    };
    const inside = { unit: uid }; // interior things: drawn only when you're near
    const [cx, cz] = P(0, D / 2);
    const [p0x, p0z] = P(-hw, 0), [p1x, p1z] = P(hw, D);
    const rect: Rect = { minX: Math.min(p0x, p1x), maxX: Math.max(p0x, p1x), minZ: Math.min(p0z, p1z), maxZ: Math.max(p0z, p1z) };
    const yawOut = Math.atan2(nx, nz);
    const [doorX, doorZ] = P(0, 0);
    const unit: UnitDef = {
      id: uid, name: spec.name, use: spec.use, rect, x: cx, z: cz, out, doorX, doorZ,
      upper: spec.upper, access: spec.access, wallColor: spec.wall, floorColor: spec.floor,
    };
    units.push(unit);
    const wallC = { color: spec.wall };
    const topOfStreetFloor = spec.upper ? UT + 0.3 : GF + 0.3;

    if (spec.use === "closed") {
      // closed shutters for now (the bank opens in Slice 4, the clubs + bar in Slice 5)
      B(0, D / 2, W, D, GF + 0.3, "building", { color: spec.wall, sign: spec.name, face: out });
      B(0, -0.12, W - 2, 0.2, 3.2, "wall", { color: "#8e8a94", sign: spec.sub ?? "OPENING SOON", face: out });
      B(0, D / 2, W, D, height - (GF + 0.3), "tower", { windows: true }, GF + 0.3);
      return unit;
    }

    // ---- shell: glass front with an open doorway, side walls, back wall with a back door ----
    B(0, D / 2, W - 0.8, D - 0.8, 0.03, "shopfloor", { color: spec.floor }, 0.15);
    for (const s of [-1, 1]) {
      B(s * (hw - 0.2), 0.2, 0.4, 0.4, GF, "wall", wallC); // corner pillars
      const gw = hw - 0.4 - UNIT.door / 2;
      B(s * (UNIT.door / 2 + gw / 2), 0.2, gw, 0.3, UNIT.glassH, "glass");
      B(s * (hw - 0.2), D / 2, 0.4, D, GF, "wall", wallC);
    }
    B(0, 0.2, W, 0.4, GF - UNIT.glassH, "wall", { ...wallC, sign: spec.name, face: out }, UNIT.glassH);
    const backDoorU = hw - 2.6, bd = 1.4;
    const segL = backDoorU - bd / 2 + hw, segR = hw - (backDoorU + bd / 2);
    B(-hw + segL / 2, D - 0.2, segL, 0.4, GF, "wall", wallC);
    B(hw - segR / 2, D - 0.2, segR, 0.4, GF, "wall", wallC);
    B(backDoorU, D - 0.2, bd, 0.4, GF - 2.4, "wall", wallC, 2.4);

    // ---- stairs up (inside, along the back wall, rising toward the left) ----
    const band = 1.5, run = UNIT.stepRun * UNIT.steps;
    const bandV0 = D - 0.4 - band; // steps occupy v in [bandV0, D - 0.4]
    const stairTopU = -hw + 0.4, stairBotU = stairTopU + run;
    if (spec.upper && spec.access === "inside") {
      for (let i = 1; i <= UNIT.steps; i++) {
        const top = 0.18 + (i * (UP - 0.18)) / UNIT.steps;
        B(stairBotU - (i - 0.5) * UNIT.stepRun, bandV0 + band / 2, UNIT.stepRun, band, top, "step", inside);
      }
    }
    // ---- ceiling slab (with a hole over inside stairs) ----
    if (spec.upper && spec.access === "inside") {
      const c = bandV0 - 0.2;
      B(0, c / 2, W, c, 0.3, "roof", { color: "#6a6272" }, GF);
      const rightW = hw - stairBotU;
      B(stairBotU + rightW / 2, (c + D) / 2, rightW, D - c, 0.3, "roof", { color: "#6a6272" }, GF);
      // railing upstairs along the open edge of the stairwell (the top end stays open)
      const railLen = run - 1.4;
      B(stairBotU - railLen / 2, c - 0.05, railLen, 0.1, 1.0, "wall", { color: "#3a3444" }, UP);
    } else {
      B(0, D / 2, W, D, 0.3, "roof", { color: "#6a6272" }, GF);
    }

    // ---- fire escape (outside, along the back, rising toward the left to a landing) ----
    if (spec.upper && spec.access === "fire") {
      const fbU = hw - 7.0; // bottom step's right edge (the landing is at the left end)
      for (let i = 1; i <= UNIT.steps; i++) {
        const top = 0.15 + (i * (UP - 0.15)) / UNIT.steps;
        B(fbU - (i - 0.5) * UNIT.stepRun, D + 0.7, UNIT.stepRun, 1.4, top, "step", { color: "#4a4652" });
      }
      const landL = fbU - run, lw = landL + hw;
      B(-hw + lw / 2, D + 0.7, lw, 1.4, UP, "step", { color: "#4a4652" });
    }

    // ---- upstairs ----
    if (spec.upper) {
      const UH = UT - UP;
      for (const s of [-1, 1]) B(s * (hw - 0.2), D / 2, 0.4, D, UH, "wall", wallC, UP);
      B(0, 0.2, W, 0.4, UH, "building", { color: spec.wall, windows: true }, UP);
      if (spec.access === "fire") {
        const du = -hw + 1.0, dw = 1.1; // back door onto the landing
        const l = du - dw / 2 + hw, r = hw - (du + dw / 2);
        B(-hw + l / 2, D - 0.2, l, 0.4, UH, "wall", wallC, UP);
        B(hw - r / 2, D - 0.2, r, 0.4, UH, "building", { color: spec.wall, windows: true }, UP);
        B(du, D - 0.2, dw, 0.4, UH - 2.3, "wall", wallC, UP + 2.3);
      } else {
        B(0, D - 0.2, W, 0.4, UH, "building", { color: spec.wall, windows: true }, UP);
      }
      B(0, D / 2, W, D, 0.3, "roof", { color: "#6a6272" }, UT);
      const carpet = { color: spec.upper === "gym" ? "#6b6f86" : spec.upper === "office" ? "#b8b4c8" : "#c8b49a", ...inside };
      if (spec.access === "inside") {
        // (leave the stairwell open)
        const c = bandV0 - 0.2;
        B(0, (0.4 + c) / 2, W - 0.8, c - 0.4, 0.02, "shopfloor", carpet, UP);
        B((stairBotU + hw - 0.4) / 2, (c + D - 0.4) / 2, hw - 0.4 - stairBotU, D - 0.4 - c, 0.02, "shopfloor", carpet, UP);
      } else {
        B(0, D / 2, W - 0.8, D - 0.8, 0.02, "shopfloor", carpet, UP);
      }
      for (const [u, v, h] of upstairs(spec, B, UP, inside)) { const [x, z] = P(u, v); spawnAt(x, z, "room", UP + h); }
    }
    // the tower above
    B(0, D / 2, W, D, height - topOfStreetFloor, "tower", { windows: true }, topOfStreetFloor);

    // ---- the shop floor ----
    if (spec.backroom) {
      // staff-only back room (partition with a doorway on the right)
      const pv = 9.2, dU = 5, dW = 1.4;
      const l = dU - dW / 2 + hw - 0.4, r = hw - 0.4 - (dU + dW / 2);
      B(-hw + 0.4 + l / 2, pv, l, 0.3, GF, "wall", wallC);
      B(hw - 0.4 - r / 2, pv, r, 0.3, GF, "wall", wallC);
      B(dU, pv, dW, 0.3, GF - 2.4, "wall", wallC, 2.4);
      B(6.4, 10.2, 1.0, 1.0, 1.2, "boxes", inside);
      B(6.4, 11.8, 1.0, 1.0, 0.9, "boxes", inside);
      const [bx, bz] = P(6.4, 10.2);
      spawnAt(bx, bz, "room", 1.2);
    }
    let shopId = -1;
    const lootSpots: [number, number, number][] = [];
    if (spec.use === "shop") {
      shopId = shops.length;
      unit.shop = shopId;
      B(4.6, 4.0, 4, 1, 1.05, "counter", inside);
      const [cX, cZ] = P(4.6, 5.2), [tX, tZ] = P(4.6, 4.0);
      shops.push({
        id: shopId, name: spec.name, type: spec.type!, rect: rectOf(P, -hw + 0.4, hw - 0.4, 0.4, (spec.backroom ? 9.05 : D - 0.4)),
        cashier: { x: cX, z: cZ, yaw: yawOut }, till: { x: tX, y: 1.05, z: tZ }, floorColor: spec.floor, wallColor: spec.wall, maxY: 3,
      });
      props.push({ id: "till" + (shopId + 1), kind: "till", x: tX, y: 1.05, z: tZ, yaw: yawOut, shop: shopId });
      lootSpots.push([3.1, 4.0, 1.05]);
    } else if (spec.use === "lobby") {
      B(4.6, 4.0, 4, 1, 1.05, "counter", inside); // front desk (nobody home)
    }
    fixtures(spec, B, lootSpots, inside);
    for (const [u, v, y] of lootSpots) {
      const [x, z] = P(u, v);
      if (shopId >= 0) spawnAt(x, z, "shop", y, { pool: SHOP_POOLS[spec.type!], shop: shopId });
      else spawnAt(x, z, "room", y);
    }
    // wet floor sign (always), pedestrians' way in and out
    const [wx, wz] = P(-1.2, 2.2);
    decor.push({ kind: "wetfloor", x: wx, z: wz, yaw: yawOut });
    navChains.push([P(0, -2.5), P(0, 1.0), P(0, 4.5), P(0, 7.4)].map(([x, z]) => ({ x, z })));
    return unit;
  };

  /** Sidewalk clutter in front of a unit: pot plants by the door, a sandwich board, food shop tables... */
  function streetFront(u: UnitDef, dir: Dir | null) {
    const [nx, nz] = u.out, rx = -nz, rz = nx;
    const at = (du: number, dv: number): [number, number] => [u.doorX + rx * du + nx * dv, u.doorZ + rz * du + nz * dv];
    const alongX = Math.abs(nx) < 0.5; // front runs along x
    const put = (du: number, dv: number, w: number, d: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}) => {
      const [x, z] = at(du, dv);
      boxes.push({ ...box(x, z, alongX ? w : d, alongX ? d : w, h, kind), ...extra });
    };
    if (u.use === "closed") { put(5.5, 0.5, 0.45, 0.45, 0.8, "hydrant"); return; }
    put(-2.0, 0.45, 0.6, 0.6, 0.9, "pot");
    put(2.0, 0.45, 0.6, 0.6, 0.9, "pot");
    const jokes = ["TODAY: SAME AS YESTERDAY", "WE HAVE STUFF", "NO SHIRT, NO SHOES, NO PROBLEM", "FREE WIFI (NEXT DOOR)", "SALE!!! (NOT REALLY)", "COME IN, WE'RE BORED"];
    put(3.2, 0.9, 0.7, 0.5, 1.0, "board", { sign: jokes[u.id % jokes.length] });
    const food = /DONUTS|PIZZA|BAGEL/.test(u.name);
    if (food) {
      for (const du of [-4.6, -6.3]) {
        put(du, 1.1, 0.8, 0.8, 0.75, "table");
        const [x, z] = at(du, 1.1); decor.push({ kind: "umbrella", x, z });
      }
    } else if (u.name === "CORNER MART") {
      put(-4.8, 0.7, 0.7, 1.0, 1.0, "trolley"); put(-5.9, 0.7, 0.7, 1.0, 1.0, "trolley");
    } else if (u.id % 3 === 0) {
      put(-5.5, 0.5, 1.8, 0.4, 0.8, "bikerack");
    } else {
      put(-5.5, 0.45, 0.5, 0.5, 1.2, "mailbox");
    }
    put(6.5, 3.4, 0.4, 0.4, 0.8, "hydrant"); // out by the curb
    { const [x, z] = at(-3.5, 3.3); streetLoot.push([x, z]); }
    void dir;
  }


  // =================================================================================================
  // ROADS: junctions + roads. Everything else (road surfaces, crosswalks, lane paint, cop-car routes,
  // pedestrian route lines) is derived from this list.
  // =================================================================================================
  const nodes: RoadNode[] = [];
  const edges: RoadEdge[] = [];
  const nd = (x: number, z: number, ctl?: RoadNode["ctl"], name?: string) => {
    const f = nodes.find((n) => n.x === x && n.z === z);
    if (f) { if (ctl) f.ctl = ctl; if (name) f.name = name; return f.id; }
    nodes.push({ id: nodes.length, x, z, ctl: ctl ?? "give", name });
    return nodes.length - 1;
  };
  const rd = (ax: number, az: number, bx: number, bz: number, hw: number, name: string, o: Partial<RoadEdge> = {}) =>
    edges.push({ a: nd(ax, az), b: nd(bx, bz), hw, name, ...o });
  /** a straight road through several junctions */
  const path = (pts: [number, number][], hw: number, name: string, o: Partial<RoadEdge> = {}) => {
    for (let i = 1; i < pts.length; i++) rd(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], hw, name, o);
  };
  const RR = RING.r;
  nd(0, -50, "light", "Mile x Yards Rd"); nd(0, 50, "light", "Mile x Uptown Ave");
  for (const [x, z] of [[RR, 0], [0, RR], [-RR, 0], [0, -RR]]) nd(x, z, "round");
  // the edge ring
  path([[-91, -89], [-91, -48], [-91, 0], [-91, 48], [-91, 83], [-91, 108]], 4, "West Rd");
  path([[91, -89], [91, -52], [91, 0], [91, 52], [91, 83], [91, 108]], 4, "East Rd");
  path([[-91, -89], [-56, -89], [0, -89], [58, -89], [91, -89]], 4, "Service Rd");
  path([[-91, 108], [-56, 108], [0, 108], [56, 108], [91, 108]], 4, "North Parade");
  // Mayor's Mile
  path([[0, -89], [0, -50], [0, -RR]], 5, "Mayor's Mile");
  path([[0, RR], [0, 50], [0, 70]], 5, "Mayor's Mile");
  rd(0, 96, 0, 108, 4, "Mayor's Mile");
  // crosstown streets (with a jog at the Mile)
  path([[-91, -48], [-56, -48]], 4, "Yards Rd"); rd(-56, -48, 0, -50, 4, "Yards Rd", { pb: [0, -48] });
  rd(0, -50, 58, -52, 4, "Yards Rd", { pa: [0, -52] }); path([[58, -52], [91, -52]], 4, "Yards Rd");
  path([[-91, 48], [-56, 48]], 4, "Uptown Ave"); rd(-56, 48, 0, 50, 4, "Uptown Ave", { pb: [0, 48] });
  rd(0, 50, 56, 52, 4, "Uptown Ave", { pa: [0, 52] }); path([[56, 52], [91, 52]], 4, "Uptown Ave");
  path([[-91, 83], [-56, 83], [-21, 83]], 3, "Gold St");
  path([[21, 83], [56, 83], [91, 83]], 3, "Gold St");
  path([[-56, -89], [-56, -48], [-56, 0], [-56, 48], [-56, 83], [-56, 108]], 3, "Crooked St");
  path([[56, 52], [56, 83], [56, 108]], 3, "Diamond St");
  path([[-91, 0], [-56, 0], [-RR, 0]], 4, "Crooked Spur");
  rd(RR, 0, 38, 0, 3, "Market Link");
  // the Market Row one-way loop (counter-clockwise), its links east and south
  path([[38, 0], [38, -18], [58, -18], [72, -18], [72, 0], [72, 18], [38, 18], [38, 0]], 3, "Market Row", { oneway: true });
  rd(72, 0, 91, 0, 3, "Market Link");
  path([[58, -18], [58, -52], [58, -89]], 3, "Market St");
  // the City Hall one-way loop (counter-clockwise)
  path([[0, 70], [21, 70], [21, 83], [21, 96], [0, 96], [-21, 96], [-21, 83], [-21, 70], [0, 70]], 3, "City Hall Loop", { oneway: true });
  // the roundabout (counter-clockwise quarter arcs)
  const arc = { cx: 0, cz: 0, r: RR };
  rd(RR, 0, 0, RR, 4, "Roundabout", { oneway: true, arc }); rd(0, RR, -RR, 0, 4, "Roundabout", { oneway: true, arc });
  rd(-RR, 0, 0, -RR, 4, "Roundabout", { oneway: true, arc }); rd(0, -RR, RR, 0, 4, "Roundabout", { oneway: true, arc });
  // junction control: bends (2 roads) have none; lights / roundabout set above; the rest give way
  for (const n of nodes) {
    const deg = edges.filter((e) => e.a === n.id || e.b === n.id).length;
    if (n.ctl === "give" && deg <= 2) n.ctl = "end";
  }
  const roadNet: RoadNet = { nodes, edges };

  // ---- derived: road surfaces, crosswalks, route lines, paint -----------------------------------------
  const roads: Rect[] = [];
  const crosswalks: Rect[] = [];
  const xLines = new Set<number>(), zLines = new Set<number>();
  const endP = (e: RoadEdge, end: "a" | "b"): [number, number] => (end === "a" ? e.pa : e.pb) ?? [nodes[e[end]].x, nodes[e[end]].z];
  const straight = edges.filter((e) => !e.arc);
  const rectOfEdge = new Map<RoadEdge, Rect>();
  for (const e of straight) {
    const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b");
    const ext = (id: number) => nodes[id].ctl === "round" ? 0 : Math.max(0, ...straight.filter((o) => o !== e && (o.a === id || o.b === id)).map((o) => o.hw));
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const ea = ext(e.a), eb = ext(e.b);
    let r: Rect;
    if (alongX) {
      const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
      const eLo = ax < bx ? ea : eb, eHi = ax < bx ? eb : ea;
      r = R(lo - eLo, hi + eHi, az - e.hw, az + e.hw);
      zLines.add(az - e.hw - 1.5); zLines.add(az + e.hw + 1.5);
    } else {
      const lo = Math.min(az, bz), hi = Math.max(az, bz);
      const eLo = az < bz ? ea : eb, eHi = az < bz ? eb : ea;
      r = R(ax - e.hw, ax + e.hw, lo - eLo, hi + eHi);
      xLines.add(ax - e.hw - 1.5); xLines.add(ax + e.hw + 1.5);
    }
    roads.push(r);
    rectOfEdge.set(e, r);
  }
  const roadRings = [{ x: 0, z: 0, r0: RING.r0, r1: RING.r1 }];
  // crosswalks: on every road leaving a junction (not at bends), just outside the junction box,
  // where the pavement of the crossing road carries on
  for (const n of nodes) {
    if (n.ctl === "end") continue;
    const inc = straight.filter((e) => e.a === n.id || e.b === n.id);
    for (const e of inc) {
      const [px, pz] = e.a === n.id ? endP(e, "a") : endP(e, "b");
      const [qx, qz] = e.a === n.id ? endP(e, "b") : endP(e, "a");
      const len = Math.hypot(qx - px, qz - pz);
      const dx = (qx - px) / len, dz = (qz - pz) / len;
      let reach = 0;
      if (n.ctl === "round") reach = RING.r1 - RR;
      for (const o of inc) {
        if (o === e) continue;
        const r = rectOfEdge.get(o)!;
        // how far the other road reaches along this road's direction from the junction centre
        const far = dx > 0.5 ? r.maxX - px : dx < -0.5 ? px - r.minX : dz > 0.5 ? r.maxZ - pz : pz - r.minZ;
        reach = Math.max(reach, far);
      }
      const dc = reach + 1.5;
      if (dc + 3 > len) continue;
      const cx = px + dx * dc, cz = pz + dz * dc;
      if (crosswalks.some((c) => Math.hypot((c.minX + c.maxX) / 2 - cx, (c.minZ + c.maxZ) / 2 - cz) < 4)) continue;
      const alongX = Math.abs(dx) > 0.5;
      const cw = alongX ? R(cx - 1.5, cx + 1.5, cz - e.hw - 0.5, cz + e.hw + 0.5) : R(cx - e.hw - 0.5, cx + e.hw + 0.5, cz - 1.5, cz + 1.5);
      crosswalks.push(cw);
      if (alongX) xLines.add(Math.round(cx * 10) / 10); else zLines.add(Math.round(cz * 10) / 10);
      decor.push({ kind: "zebra", x: cx, z: cz, yaw: alongX ? 0 : Math.PI / 2 });
    }
  }
  // the four ring crossings to the park (diagonal, at 45 degrees)
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const a = (RING.r0 - 1) / Math.SQRT2, b = (RING.r1 + 1) / Math.SQRT2;
    crosswalks.push(R(Math.min(sx * a, sx * b) - 1.2, Math.max(sx * a, sx * b) + 1.2, Math.min(sz * a, sz * b) - 1.2, Math.max(sz * a, sz * b) + 1.2));
    decor.push({ kind: "zebra", x: sx * RR / Math.SQRT2, z: sz * RR / Math.SQRT2, yaw: Math.atan2(sx, sz) });
  }
  // lane paint + street lights along the straight roads (skipping junction boxes)
  const nearJunction = (x: number, z: number, pad: number) => nodes.some((n) => n.ctl !== "end" && Math.abs(n.x - x) < pad && Math.abs(n.z - z) < pad);
  for (const e of straight) {
    const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b");
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let s = 4; s < len - 3; s += 6) {
      const x = ax + dx * s, z = az + dz * s;
      if (nearJunction(x, z, 9)) continue;
      if (!e.oneway) decor.push({ kind: "dash", x, z, yaw: Math.atan2(dx, dz) });
    }
    for (let s = 10; s < len - 6; s += 24) {
      const x = ax + dx * s, z = az + dz * s;
      if (nearJunction(x, z, 10)) continue;
      for (const side of [-1, 1]) decor.push({ kind: "streetlight", x: x + dz * side * (e.hw + 0.6), z: z - dx * side * (e.hw + 0.6) });
    }
  }
  // traffic lights: one pole per approach, on the right-hand kerb before the crossing
  for (const n of nodes) {
    if (n.ctl !== "light") continue;
    edges.forEach((e, ei) => {
      if (e.a !== n.id && e.b !== n.id) return;
      const [px, pz] = e.a === n.id ? endP(e, "a") : endP(e, "b");
      const [qx, qz] = e.a === n.id ? endP(e, "b") : endP(e, "a");
      const len = Math.hypot(qx - px, qz - pz), dx = (qx - px) / len, dz = (qz - pz) / len;
      // cars come toward the junction: heading = -(dx, dz); their right-hand kerb
      const hx = -dx, hz = -dz, rx = hz, rz = -hx;
      const d = 7.5;
      scenery.push({ kind: "light", x: px + dx * d + rx * (e.hw + 0.7), z: pz + dz * d + rz * (e.hw + 0.7), yaw: Math.atan2(-hx, -hz), node: n.id, approach: ei });
    });
  }
  // cop-car routes: the road centre lines (the ring split into short straights)
  const gNodes = nodes.map((n) => ({ x: n.x, z: n.z }));
  const gEdges: [number, number][] = [];
  for (const e of edges) {
    if (!e.arc) { gEdges.push([e.a, e.b]); continue; }
    const A = nodes[e.a], B = nodes[e.b];
    const a0 = Math.atan2(A.z, A.x);
    let prev = e.a;
    for (let k = 1; k < 3; k++) {
      const t = a0 + (k * Math.PI / 2) / 3;
      gNodes.push({ x: Math.round(Math.cos(t) * RR * 100) / 100, z: Math.round(Math.sin(t) * RR * 100) / 100 });
      gEdges.push([prev, gNodes.length - 1]);
      prev = gNodes.length - 1;
    }
    gEdges.push([prev, e.b]);
    void B;
  }
  const roadGraph = { nodes: gNodes, edges: gEdges };

  // =================================================================================================
  // THE PARK inside the roundabout (grey-box: slice C3 dresses it)
  // =================================================================================================
  scenery.push({ kind: "grassdisc", x: 0, z: 0, r: RING.r0, h: 15 });
  // the pigeon fountain with the Golden Mayor on his column in the middle
  boxes.push(box(0, 0, 7, 7, 0.8, "fountain"));
  boxes.push({ ...box(0, 0, 1.6, 1.6, 3.0, "plinth", 0.8), sign: "OUR MAYOR (FOR NOW)", face: [0, -1] });
  boxes.push({ ...box(0, 0, 1.2, 1.2, 2.8, "statue", 3.8) });
  // the pond on the east side (Slice C3 makes it pear-shaped with a shark fin)
  const pond: Rect = { minX: 8, maxX: 14, minZ: -4, maxZ: 4 };
  water.push(pond);
  for (const [x, z, w, d] of [[11, -4.15, 6.6, 0.3], [11, 4.15, 6.6, 0.3], [7.85, 0, 0.3, 8.6], [14.15, 0, 0.3, 8.6]]) boxes.push(box(x, z, w, d, 0.3, "rim"));
  boxes.push(box(8.5, 2.5, 1.4, 1.6, 0.2, "dock", 0.3)); // the fisherman's spot (Slice C3)
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) * Math.PI / 4;
    boxes.push(box(Math.cos(t) * 15.5, Math.sin(t) * 15.5, 0.6, 0.6, 3, "tree"));
  }
  for (const t of [Math.PI / 2 + 0.35, Math.PI + 0.35, -Math.PI / 2 + 0.35]) {
    const x = Math.cos(t) * 20.3, z = Math.sin(t) * 20.3, along = Math.abs(Math.cos(t)) > 0.7;
    boxes.push(box(x, z, along ? 0.8 : 3, along ? 3 : 0.8, 0.5, "bench"));
  }
  prop("bin", 0, 19.8, 0, 0.7, 0.7, 1.0);
  prop("bin", -19.8, 0, 0, 0.7, 0.7, 1.0);
  for (const [x, z] of [[-6, 9], [6, -9], [-10, -3], [3, 11], [-4, -12]]) spawnAt(x, z, "plaza", 0);
  // the taco cart on the promenade pavement by Market Row (the old taco truck; slice C5 makes carts rollable
  // and the vendor fight back with his tacos)
  {
    const tx = 31.5, tz = -12, truckShop = shops.length;
    boxes.push({ ...box(tx, tz, 1.2, 2.4, 1.05, "counter"), color: "#e8b83a", sign: "TACO 'BOUT IT", face: [-1, 0] });
    boxes.push({ ...box(tx, tz, 1.3, 2.6, 0.08, "roof", 2.3), color: "#c9442f" });
    for (const dz of [-1.1, 1.1]) boxes.push({ ...box(tx + 0.5, tz + dz, 0.08, 0.08, 1.25, "wall", 1.05), color: "#6f6a78" });
    shops.push({
      id: truckShop, name: "TACO 'BOUT IT", type: "taco", rect: { minX: tx + 0.6, maxX: tx + 2.2, minZ: tz - 1.4, maxZ: tz + 1.4 },
      cashier: { x: tx + 1.3, z: tz, yaw: -Math.PI / 2 }, till: { x: tx - 0.2, y: 1.05, z: tz + 0.6 }, floorColor: "#b3aebb", wallColor: "#e8b83a", maxY: 3,
    });
    props.push({ id: "till" + (truckShop + 1), kind: "till", x: tx - 0.2, y: 1.05, z: tz + 0.6, yaw: -Math.PI / 2, shop: truckShop });
    for (const dz of [-0.8, 0.1]) spawnAt(tx - 0.2, tz + dz, "shop", 1.05, { pool: SHOP_POOLS.taco, shop: truckShop });
  }
  // walking routes round the promenade and across the four ring crossings
  {
    const P = (deg: number, r: number) => ({ x: Math.round(Math.cos((deg * Math.PI) / 180) * r * 100) / 100, z: Math.round(Math.sin((deg * Math.PI) / 180) * r * 100) / 100 });
    const loop = [45, 0, 315, 270, 225, 180, 135, 90, 45].map((d) => P(d, 18.2));
    navChains.push(loop);
    for (const d of [45, 135, 225, 315]) navChains.push([P(d, 31.8), P(d, 18.2)]);
  }

  // =================================================================================================
  // BLOCKS: ground, the 20 street units, buildings wall to wall along every street
  // =================================================================================================
  const blocks: BlockDef[] = [];
  const ground = (r: Rect, kind: Box["kind"] = "sidewalk", color?: string, ring = false) => {
    if (!ring) { boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, 0.15, kind), ...(color ? { color } : {}) }); return; }
    // round the roundabout: 1 m strips that stop at the ring road
    for (let z = r.minZ; z < r.maxZ - 0.01; z += 1) {
      const z1 = Math.min(r.maxZ, z + 1), zn = Math.abs(z) < Math.abs(z1) ? z : z1;
      const near = z < 0 && z1 > 0 ? 0 : zn;
      const chord = Math.abs(near) < RING.r1 ? Math.sqrt(RING.r1 * RING.r1 - near * near) : 0;
      let x0 = r.minX, x1 = r.maxX;
      if (x0 >= 0) x0 = Math.max(x0, chord); else if (x1 <= 0) x1 = Math.min(x1, -chord);
      if (x1 - x0 < 0.2) continue;
      boxes.push({ ...box((x0 + x1) / 2, (z + z1) / 2, x1 - x0, z1 - z, 0.15, kind), ...(color ? { color } : {}) });
    }
  };
  const ringHit = (r: Rect) => {
    const nx = Math.max(r.minX, Math.min(0, r.maxX)), nz = Math.max(r.minZ, Math.min(0, r.maxZ));
    return Math.hypot(nx, nz) < RING.clear;
  };
  const OUT: Record<Dir, [number, number]> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
  let bseed = 0;

  const fillBlock = (b: BlockSpec) => {
    const r = b.rect, tier = tierAt((r.minZ + r.maxZ) / 2);
    bseed++;
    const H = (k: number) => hash(bseed * 7.13 + k, bseed * 1.7 + k * 0.37);
    ground(r, "sidewalk", undefined, b.ring);
    blocks.push({ name: b.name, rect: r, tier, open: b.open, sides: b.sides });
    const has = (d: Dir) => b.sides.some((s) => s.dir === d);
    const keep: Rect[] = [...(b.keep ?? [])];
    // ---- the Slice 2A units ----
    for (const u of b.units ?? []) {
      const out = OUT[u.dir];
      let fx: number, fz: number;
      if (u.dir === "N") { fx = u.at; fz = r.maxZ - SW; } else if (u.dir === "S") { fx = u.at; fz = r.minZ + SW; }
      else if (u.dir === "E") { fx = r.maxX - SW; fz = u.at; } else { fx = r.minX + SW; fz = u.at; }
      const height = u.height ?? [8, 12, 22][tier] + Math.round(H(units.length) * [3, 6, 20][tier]);
      const unit = buildUnit(u.spec, fx, fz, out, height);
      streetFront(unit, null);
      // keep the building, its fire escape and a strip behind it for the back door
      const back = UNIT.d + (u.spec.access === "fire" ? 1.4 : 0) + 1.2;
      const [nx, nz] = out, e = back - UNIT.d, ur = unit.rect;
      keep.push(R(ur.minX - (nx > 0.5 ? e : 0), ur.maxX + (nx < -0.5 ? e : 0), ur.minZ - (nz > 0.5 ? e : 0), ur.maxZ + (nz < -0.5 ? e : 0)));
    }
    // ---- building depths ----
    const dflt = [9, 10, 11][tier];
    const inner = (lo: Dir, hi: Dir, size: number) => size - (has(lo) ? SW : 0) - (has(hi) ? SW : 0);
    const iz = inner("S", "N", r.maxZ - r.minZ), ix = inner("W", "E", r.maxX - r.minX);
    const depth = (both: boolean, size: number) => both ? ((size - 4) / 2 >= 5 ? Math.min(dflt, (size - 4) / 2) : size / 2) : Math.min(dflt, Math.max(4, size - 4));
    let dz = depth(has("N") && has("S"), iz), dx = depth(has("E") && has("W"), ix);
    const oneRowZ = has("N") && has("S") && iz < 9, oneRowX = has("E") && has("W") && ix < 9;
    if (oneRowZ) dz = iz;
    if (oneRowX) dx = ix;
    const courtyard = !oneRowZ && !oneRowX && iz - (has("N") ? dz : 0) - (has("S") ? dz : 0) >= 3 && ix - (has("E") ? dx : 0) - (has("W") ? dx : 0) >= 3;
    // the alley into the courtyard: a 3 m gap in the longest street side (plus a 1.5 m squeeze on another)
    const sideLen = (s: BlockSpec["sides"][number]) => (s.dir === "N" || s.dir === "S" ? (s.to ?? r.maxX) - (s.from ?? r.minX) : (s.to ?? r.maxZ) - (s.from ?? r.minZ));
    // (prefer a side with no units or landmarks on it, the longest one)
    const busy = (d: Dir) => keep.some((q) => (d === "N" ? q.maxZ > r.maxZ - SW - 1 : d === "S" ? q.minZ < r.minZ + SW + 1 : d === "E" ? q.maxX > r.maxX - SW - 1 : q.minX < r.minX + SW + 1));
    const sorted = [...b.sides].sort((a, c) => (busy(a.dir) ? 1 : 0) - (busy(c.dir) ? 1 : 0) || sideLen(c) - sideLen(a));
    const alleySide = courtyard && !b.noAlley ? sorted[0] : undefined;
    const squeezeSide = courtyard && !b.noAlley ? sorted[1] : undefined;
    const placed: Rect[] = [];
    let k = 0;
    for (const s of b.sides) {
      if ((s.dir === "S" && oneRowZ) || (s.dir === "W" && oneRowX)) continue; // (one row serves both streets)
      const ns = s.dir === "N" || s.dir === "S";
      let lo: number, hi: number;
      if (ns) { lo = s.from ?? r.minX + (has("W") ? SW : 0); hi = s.to ?? r.maxX - (has("E") ? SW : 0); }
      else { lo = s.from ?? r.minZ + (has("S") ? SW + (oneRowZ ? 0 : dz) : 0); hi = s.to ?? r.maxZ - (has("N") ? SW + dz : 0); }
      // (a partial side never runs into the pavement or the rows of the sides next to it)
      if (ns) { lo = Math.max(lo, r.minX + (has("W") ? SW : 0)); hi = Math.min(hi, r.maxX - (has("E") ? SW : 0)); }
      else { lo = Math.max(lo, r.minZ + (has("S") ? SW + (oneRowZ ? 0 : dz) : 0)); hi = Math.min(hi, r.maxZ - (has("N") ? SW + dz : 0)); }
      const d0 = ns ? dz : dx;
      const line = s.dir === "N" ? r.maxZ - SW : s.dir === "S" ? r.minZ + SW : s.dir === "E" ? r.maxX - SW : r.minX + SW;
      const mk = (t0: number, t1: number, d: number): Rect => {
        if (s.dir === "N") return R(t0, t1, line - d, line);
        if (s.dir === "S") return R(t0, t1, line, line + d);
        if (s.dir === "E") return R(line - d, line, t0, t1);
        return R(line, line + d, t0, t1);
      };
      const gapAt = s === alleySide ? (lo + hi) / 2 : s === squeezeSide ? lo + (hi - lo) * 0.3 : NaN;
      const gapW = s === alleySide ? 3 : 1.5;
      const [wMin, wMax] = [[5, 10], [6, 12], [8, 14]][tier];
      // obstacles along this row (units, landmarks, buildings already placed, the alley gap), as lateral spans
      const band = mk(lo, hi, 3);
      const spans: [number, number][] = [...keep, ...placed].filter((q) => rectI(q, band)).map((q) => (ns ? [q.minX, q.maxX] : [q.minZ, q.maxZ]) as [number, number]);
      if (!Number.isNaN(gapAt)) spans.push([gapAt - gapW / 2, gapAt + gapW / 2]);
      let t = lo;
      while (t < hi - 0.3) {
        const inside = spans.find(([a, c]) => t >= a - 0.01 && t < c);
        if (inside) { t = inside[1]; continue; }
        const next = Math.min(hi, ...spans.map(([a]) => a).filter((a) => a > t));
        let w = wMin + H(++k) * (wMax - wMin);
        if (next - (t + w) < wMin) w = next - t;
        if (w < 2.5) { t = next; continue; }
        let done = false;
        for (let d = d0; d >= 3; d -= 0.5) {
          const rc = mk(t, t + w, d);
          if (keep.some((q) => rectI(q, rc)) || placed.some((q) => rectI(q, rc)) || (b.ring && ringHit(rc))) continue;
          placed.push(rc);
          const hRaw = tier === 0 ? 3.2 + H(k + 50) * 6.5 : tier === 1 ? 5 + H(k + 50) * 11 : 12 + H(k + 50) * H(k + 90) * 42;
          const h = Math.round(hRaw * 2) / 2;
          const signs = tier === 0 ? SIGNS_LOW : tier === 1 ? SIGNS_MID : SIGNS_HIGH;
          const signed = H(k + 70) < (tier === 2 ? 0.25 : 0.45) && w >= 6;
          boxes.push({
            ...box((rc.minX + rc.maxX) / 2, (rc.minZ + rc.maxZ) / 2, rc.maxX - rc.minX, rc.maxZ - rc.minZ, h, h > 20 ? "tower" : "building"),
            windows: true, ...(signed ? { sign: signs[Math.floor(H(k + 80) * signs.length)], face: OUT[s.dir] } : {}),
          });
          if (h <= 7 && H(k + 60) < 0.35) spawnAt((rc.minX + rc.maxX) / 2, (rc.minZ + rc.maxZ) / 2, "rooftop", h);
          done = true;
          break;
        }
        if (done) t += w; else t += 1;
      }
      // street life along this side: loot on the pavement, a bin or a booth against the buildings
      const [ox, oz] = OUT[s.dir];
      for (let u = lo + 6; u < hi - 3; u += 17) {
        const px = ns ? u : line + ox * 2.5, pz = ns ? line + oz * 2.5 : u;
        if (b.ring && Math.hypot(px, pz) < RING.clear) continue;
        spawnAt(px, pz, "street", 0.15);
      }
      const kinds: [PropKind, number, number, number][] = [["bin", 0.7, 0.7, 1.0], ["newsbox", 0.6, 0.5, 1.0], ["phone", 1.1, 1.1, 2.3], ["vending", 1.2, 0.9, 1.9], ["meter", 0.3, 0.3, 1.3]];
      const pk = kinds[Math.floor(H(k + 11) * kinds.length)];
      const pu = lo + 2 + H(k + 12) * Math.max(0, hi - lo - 4);
      const pd = pk[0] === "meter" ? SW - 0.4 : 0.2 + pk[2] / 2;
      const ppx = ns ? pu : line + ox * pd, ppz = ns ? line + oz * pd : pu;
      const yaw = Math.atan2(ox, oz);
      const fp = R(ppx - 0.8, ppx + 0.8, ppz - 0.8, ppz + 0.8);
      if (!keep.some((q) => rectI(q, fp)) && !(b.ring && Math.hypot(ppx, ppz) < RING.clear)) prop(pk[0], ppx, ppz, yaw, pk[1], pk[2], pk[3]);
      if (H(k + 13) < 0.6) {
        const hu = lo + 1 + H(k + 14) * Math.max(0, hi - lo - 2), hx = ns ? hu : line + ox * (SW - 0.4), hz = ns ? line + oz * (SW - 0.4) : hu;
        const clash = loot.some((q) => Math.hypot(q.x - hx, q.z - hz) < 1.5) || streetLoot.some(([qx, qz]) => Math.hypot(qx - hx, qz - hz) < 1.5);
        if (!clash && !(b.ring && Math.hypot(hx, hz) < RING.clear)) boxes.push(box(hx, hz, 0.45, 0.45, 0.8, "hydrant"));
      }
    }
    // the courtyard: a dumpster against the back of a building, loot, bags
    if (courtyard) {
      const cx0 = r.minX + (has("W") ? SW + dx : 0), cx1 = r.maxX - (has("E") ? SW + dx : 0);
      const cz0 = r.minZ + (has("S") ? SW + dz : 0), cz1 = r.maxZ - (has("N") ? SW + dz : 0);
      const cx = (cx0 + cx1) / 2, cz = (cz0 + cz1) / 2;
      const spot = R(cx - 2, cx + 2, cz - 1.5, cz + 1.5);
      if (!keep.some((q) => rectI(q, spot)) && !placed.some((q) => rectI(q, spot)) && !(b.ring && ringHit(spot))) {
        if (cz1 - cz0 >= 5) prop("dumpster", cx, cz0 + 0.8, 0, 2.2, 1.2, 1.3);
        spawnAt(cx + 1.5, cz + 0.8, "alley", 0.15);
        if (cx1 - cx0 > 8) boxes.push(box(cx - 3, cz1 - 0.6, 2.4, 0.9, 0.7, "bags"));
      }
    }
  };

  // (units first, in this order, so CORNER MART is unit 0 like before)
  const B = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, sides: (BlockSpec["sides"][number] | Dir)[], extra: Partial<BlockSpec> = {}): BlockSpec =>
    ({ name, rect: R(minX, maxX, minZ, maxZ), sides: sides.map((s) => (typeof s === "string" ? { dir: s } : s)), ...extra });
  const ALL: Dir[] = ["N", "S", "E", "W"];
  // landmark footprints
  const LM = {
    skyscraper: R(43, 51, -81, -64), cinema: R(-33, -17, -40, -29), church: R(-77, -63, 25, 40),
    precinct: R(9, 29, 30.5, 44), copLot: R(29, 33, 32, 44), hall: R(45, 65, -9, 9),
    hotel: R(-49, -41, 56, 76), hq: R(41, 49, 60, 76), casino: R(63, 76, 60, 76),
    carpark: R(-83, -63, 90, 100), museum: R(-49, -35, 90, 100), mall: R(28, 46, 90, 100), club: R(63, 83, 90, 100),
    cityHall: R(-18, 18, 73, 93),
  };
  const specs: BlockSpec[] = [
    // ---- LOW: The Yards ----
    B("Yards: Corner Mart block", -53, -5, -85, -52, ALL, { units: [{ spec: U.mart, dir: "N", at: -40 }, { spec: U.thrift, dir: "N", at: -18 }] }),
    B("Yards: West", -87, -59, -85, -52, ALL),
    B("Yards: Skyscraper block", 5, 55, -85, -56, ALL, { units: [{ spec: U.arcade, dir: "N", at: 17 }, { spec: U.pizza, dir: "N", at: 34 }], keep: [LM.skyscraper] }),
    B("Yards: East", 61, 87, -85, -56, ALL, { units: [{ spec: U.dive, dir: "N", at: 74 }] }),
    // ---- MEDIUM: Old Brick (west), Market Row (east), round the park ----
    B("Old Brick: West South", -87, -59, -44, -4, ALL, { units: [{ spec: U.sweatbox, dir: "N", at: -73 }, { spec: U.lawyers, dir: "E", at: -29.5 }] }),
    B("Old Brick: West North", -87, -59, 4, 44, ALL, { units: [{ spec: U.bank, dir: "S", at: -73 }], keep: [LM.church] }),
    B("Old Brick: Laundromat block", -53, -5, -44, -4, ALL, { ring: true, open: ["N", "E"], units: [{ spec: U.spin, dir: "W", at: -32 }, { spec: U.hair, dir: "N", at: -41 }], keep: [LM.cinema] }),
    B("Old Brick: Crumbling Arms block", -53, -5, 4, 44, ALL, { ring: true, open: ["S", "E"], units: [{ spec: U.pet, dir: "S", at: -41 }, { spec: U.subpar, dir: "W", at: 30.5 }, { spec: U.arms, dir: "N", at: -27 }] }),
    B("Market Row: Donut corner", 5, 35, -48, -21, ["S", "W"], { ring: true, open: ["W"], units: [{ spec: U.donut, dir: "S", at: 23 }] }),
    B("Market Row: Bagel corner", 35, 55, -48, -21, ["S", "E", "N"], { units: [{ spec: U.bagel, dir: "S", at: 43.5 }] }),
    B("Market Row: Promenade corner", 5, 35, -21, -3, ["W", "E"], { ring: true, open: ["W", "E", "N"], noAlley: true, keep: [R(29, 34.5, -15, -9)] }),
    B("Market Row: South East", 61, 87, -48, -21, ["S", "E", "W", { dir: "N", from: 61, to: 75 }]),
    B("Market Row: Stalls South", 75, 87, -21, -3, ["E", "W", "N"], { noAlley: true }),
    B("Market Row: Stalls North", 75, 87, 3, 21, ["E", "W", "S"], { noAlley: true }),
    B("Market Row: Market hall", 41, 69, -15, 15, ALL, { keep: [LM.hall], noAlley: true }),
    B("Market Row: Precinct block", 5, 35, 3, 48, ["W", "N"], { ring: true, open: ["W"], keep: [LM.precinct, LM.copLot] }),
    B("Market Row: North", 35, 87, 21, 48, ["N", "E", { dir: "S", from: 35, to: 75 }], { units: [{ spec: U.pharm, dir: "S", at: 44 }, { spec: U.gizmo, dir: "S", at: 60 }, { spec: U.kicks, dir: "S", at: 75.5 }] }),
    // ---- HIGH: Uptown ----
    B("Uptown: West", -87, -59, 52, 80, ALL),
    B("Uptown: Hotel block", -53, -24, 52, 80, ["S", "N", "W", { dir: "E", from: 67, to: 80 }], { units: [{ spec: U.bling, dir: "S", at: -33 }], keep: [LM.hotel] }),
    B("Uptown: Mile West", -24, -5, 52, 67, ["S", "E", "N"], { noAlley: true }),
    B("Uptown: HQ block", 24, 53, 56, 80, ["S", "N", "E", { dir: "W", from: 67, to: 80 }], { units: [{ spec: U.cracked, dir: "S", at: 32.5 }], keep: [LM.hq] }),
    B("Uptown: Mile East", 5, 24, 56, 67, ["S", "W", "N"], { noAlley: true }),
    B("Uptown: Casino block", 59, 87, 56, 80, ALL, { keep: [LM.casino] }),
    B("Uptown: Car park block", -87, -59, 86, 104, ALL, { keep: [LM.carpark] }),
    B("Uptown: Museum block", -53, -24, 86, 104, ["N", "S", "W", { dir: "E", from: 86, to: 99 }], { keep: [LM.museum] }),
    B("Uptown: Mall block", 24, 53, 86, 104, ["N", "S", "E", { dir: "W", from: 86, to: 99 }], { keep: [LM.mall] }),
    B("Uptown: Country club block", 59, 87, 86, 104, ALL, { keep: [LM.club], open: ["N", "S", "E"] }),
  ];
  for (const s of specs) fillBlock(s);
  // City Hall plaza (inside its loop) and the pavements north of the loop
  ground(LM.cityHall, "plaza", "#d8d0c4");
  blocks.push({ name: "City Hall plaza", rect: LM.cityHall, tier: 2, open: ["N", "S", "E", "W"] });
  for (const r of [R(-24, -4, 99, 104), R(4, 24, 99, 104)]) { ground(r); blocks.push({ name: "North pavement", rect: r, tier: 2, open: ["N", "S", "E", "W"] }); }
  for (const [x, z] of [[-12, 76], [12, 76], [-14, 86], [14, 86], [0, 76]]) spawnAt(x, z, "plaza", 0.15);

  // =================================================================================================
  // LANDMARKS (grey-box shells; slice C2 gives them their facades)
  // =================================================================================================
  const shell = (r: Rect, h: number, kind: Box["kind"], color: string, sign?: string, face?: [number, number], baseY = 0) => {
    const b: Box = { ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, kind, baseY), color, windows: kind !== "wall" };
    if (sign) { b.sign = sign; b.face = face; }
    boxes.push(b);
    return b;
  };
  // City Hall: the Mayor's Office tower with a golden trash-can crown
  shell(R(-9, 9, 80, 90), 12, "building", "#e8e2d4", "TRASHINGTON CITY HALL", [0, -1]);
  shell(R(-5, 5, 82, 88), 63, "tower", "#d8d0c4", undefined, undefined, 12);
  shell(R(-3, 3, 83, 87), 5, "building", "#d9a632", undefined, undefined, 75);
  shell(R(-7, 7, 73.2, 73.8), 2.2, "wall", "#3a3444", "TRASHCORP PROUDLY SPONSORS DEMOCRACY", [0, -1]);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) boxes.push({ ...box(x, 79.3, 0.9, 0.9, 10, "wall"), color: "#f4f1ea" });
  // Uptown
  shell(LM.hotel, 44, "tower", "#c9a86a", "GRAND HOTEL", [0, -1]);
  shell(LM.hq, 62, "tower", "#3d5a9e", "TRASHCORP HQ", [0, -1]);
  shell(LM.casino, 14, "building", "#6b3fa0", "LUCKY DUMPSTER CASINO", [0, -1]);
  shell(R(64, 75, 58.6, 60), 0.4, "slab", "#ffcf3a", undefined, undefined, 4.5); // marquee
  shell(LM.museum, 12, "building", "#e8e2d4", "MUSEUM OF OLD STUFF", [0, -1]);
  for (const x of [-47, -44, -41, -38]) boxes.push({ ...box(x, 89.4, 0.8, 0.8, 9, "wall"), color: "#f4f1ea" });
  shell(LM.mall, 16, "building", "#ff8fa3", "LUXURY MALL: GOOCHY / PRADUH / VERSAYCHEE", [0, -1]);
  shell(R(63, 73, 90, 100), 7, "building", "#8a9a5b", "TRASHINGTON COUNTRY CLUB (MEMBERS ONLY)", [0, -1]);
  decor.push({ kind: "grass", x: 78, z: 95, w: 10, d: 10, h: 0.17 });
  // the multi-storey car park: a deck on pillars, a stepped ramp up, cars underneath
  {
    const cp = LM.carpark, deckTop = 3.5;
    for (const x of [cp.minX + 0.4, (cp.minX + cp.maxX) / 2, cp.maxX - 6.4]) for (const z of [cp.minZ + 0.4, cp.maxZ - 0.4]) boxes.push({ ...box(x, z, 0.6, 0.6, deckTop - 0.3, "wall"), color: "#8e8a94" });
    boxes.push({ ...box((cp.minX + cp.maxX - 6) / 2, (cp.minZ + cp.maxZ) / 2, cp.maxX - cp.minX - 6, cp.maxZ - cp.minZ, 0.3, "slab", deckTop - 0.3), color: "#8e8a94", sign: "PARK-O-RAMA (LEVEL 2)", face: [0, -1] });
    boxes.push({ ...box((cp.minX + cp.maxX - 6) / 2, cp.maxZ - 0.2, cp.maxX - cp.minX - 6, 0.3, 1.0, "wall", deckTop), color: "#6f6a78" });
    for (let i = 1; i <= 11; i++) boxes.push({ ...box(cp.maxX - (i - 0.5) * 0.5, cp.minZ + 1.5, 0.5, 2.4, (i * deckTop) / 11, "step"), color: "#8e8a94" });
    ["#d6264a", "#3d6fb5", "#e8e2d4"].forEach((c, i) => prop("car", cp.minX + 3 + i * 4.5, cp.maxZ - 4, Math.PI, 1.9, 4.2, 1.5, { color: c }));
    spawnAt(cp.minX + 6, (cp.minZ + cp.maxZ) / 2, "rooftop", deckTop);
    spawnAt(cp.minX + 3, cp.minZ + 3, "alley", 0.15);
  }
  // Medium
  shell(LM.hall, 8, "building", "#c26b4a", "MARKET ROW HALL", [0, -1]);
  for (const [x, z] of [[46, -12.5], [55, -12.5], [64, -12.5], [46, 12.5], [64, 12.5]]) spawnAt(x, z, "street", 0.15);
  shell(LM.cinema, 10, "building", "#d6264a", "THE BIJOU (STICKY FLOORS)", [0, -1]);
  shell(LM.church, 10, "building", "#b9b3a6", "ST. DUMPSTER'S", [1, 0]);
  shell(R(-73, -69, 30, 34), 16, "tower", "#b9b3a6", undefined, undefined, 10);
  // the noodle gate over Crooked St
  for (const x of [-59.6, -52.4]) boxes.push({ ...box(x, 21.5, 0.5, 0.5, 6, "wall"), color: "#d6264a" });
  boxes.push({ ...box(-56, 21.5, 8.4, 1.2, 1.2, "slab", 6), color: "#d6264a", sign: "LUCKY NOODLE GATE", face: [0, -1] });
  // Low: the half-built skyscraper (concrete core, open floors, a crane)
  {
    const s = LM.skyscraper;
    shell(R(45, 49, -76, -69), 40, "tower", "#8e8a94");
    for (let y = 4; y <= 24; y += 4) boxes.push({ ...box((s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, s.maxX - s.minX, s.maxZ - s.minZ, 0.3, "slab", y), color: "#b9b3a6" });
    boxes.push({ ...box(50, -65, 1, 1, 48, "wall"), color: "#ffcf3a" });
    boxes.push({ ...box(44, -65, 13, 1, 1, "slab", 47), color: "#ffcf3a", sign: "OPENING 1987 (PROBABLY)", face: [0, 1] });
    decor.push({ kind: "scaffold", x: 47, z: -80.6, w: 8, h: 20, yaw: 0 });
    boxes.push(box(44, -63, 1.3, 1.3, 2.4, "portaloo"));
    boxes.push(box(49.5, -62.5, 2.0, 1.4, 1.6, "mixer"));
    spawnAt(44, -79.5, "rooftop", 4.3);
    spawnAt(50, -80, "yard", 0.15);
  }

  // =================================================================================================
  // THE SIDES: rail yard (west), canal (east), the north pavement
  // =================================================================================================
  ground(R(-115, -95, -93, 115), "plaza", "#8e8478");
  ground(R(95, 99, -93, 115), "sidewalk"); ground(R(113, 115, -93, 115), "sidewalk");
  ground(R(99, 113, -93, -40), "plaza", "#8e8a94"); ground(R(99, 113, 104, 115), "sidewalk");
  ground(R(-95, 95, 112, 115), "sidewalk");
  blocks.push({ name: "Rail yard", rect: R(-115, -95, -93, 115), tier: 1, open: ["N", "S", "E", "W"] });
  blocks.push({ name: "Canal side", rect: R(95, 115, -93, 115), tier: 1, open: ["N", "S", "E", "W"] });
  // --- build yard (south end): an open lot. The movement tests + tutorials use it, so it stays clear. ---
  const T = { x: -97.5, z: -62 };
  boxes.push(box(-110, -91.5, 1.3, 1.3, 2.4, "portaloo"));
  boxes.push(box(-104, -91.5, 2.0, 1.4, 1.6, "mixer"));
  boxes.push(box(-99, -91.5, 1.2, 1.2, 0.5, "pallet"));
  boxes.push({ ...box(-114.6, -66, 0.6, 40, 2.6, "fence"), sign: "BUILD YARD: KEEP OUT (OR DON'T)", face: [1, 0] });
  for (const [x, z] of [[-110, -50], [-102, -78]]) spawnAt(x, z, "yard", 0.15);
  // --- junkyard + movement playground ---
  const ledgeZ = -30;
  boxes.push(box(-110, ledgeZ, 3, 2, 0.9, "ledge"));
  boxes.push(box(-105, ledgeZ, 3, 2, 1.4, "ledge"));
  boxes.push(box(-100, ledgeZ, 3, 2, 1.95, "ledge"));
  const tunX = -106, tunZ = -18;
  // (the yard's gravel is 0.15 m up, so the tunnel is too)
  boxes.push(box(tunX, tunZ, 6, 3.2, 0.3, "slab", 1.4));
  boxes.push(box(tunX, tunZ - 1.8, 6, 0.4, 1.7, "wall"));
  boxes.push(box(tunX, tunZ + 1.8, 6, 0.4, 1.7, "wall"));
  for (const [x, z, w, d, h] of [[-113, -37, 3, 3, 1.6], [-99, -39, 2, 4, 1.1], [-113, -25, 3, 2, 2.2], [-98.5, -22, 2.4, 2, 1.3], [-100, -12, 2, 3, 1.8], [-112, -9, 4, 2, 1.3]]) boxes.push(box(x, z, w, d, h, "junk"));
  spawnAt(-106, -24, "yard", 0.15); spawnAt(-100, ledgeZ, "yard", 1.95); spawnAt(-112, -14, "yard", 0.15);
  // --- tracks, boxcars, the railway arches ---
  scenery.push({ kind: "rail", x: -106, z: 28, d: 72 }, { kind: "rail", x: -101, z: 28, d: 72 });
  boxes.push({ ...box(-106, 12, 3, 12, 3.2, "building"), color: "#a8743f", sign: "TRASHINGTON FREIGHT", face: [1, 0] });
  boxes.push({ ...box(-101, 36, 3, 12, 3.2, "building"), color: "#6b4c9a" });
  boxes.push(box(-98.6, 34, 1.4, 1.4, 1.5, "crate"));
  spawnAt(-101, 36, "rooftop", 3.2);
  for (let z = -6; z <= 54; z += 8) boxes.push({ ...box(-112, z, 4, 2, 5, "wall"), color: "#8a4a3a" });
  boxes.push({ ...box(-112, 24, 4.4, 62, 1, "slab", 5), color: "#8a4a3a", sign: "THE ARCHES", face: [1, 0] });
  for (const z of [6, 22, 38, 54]) spawnAt(-112, z, "alley", 0.15);
  // --- the grand station with its clock tower (north end) ---
  shell(R(-113, -98, 64, 100), 12, "building", "#b5653b", "TRASHINGTON GRAND STATION", [1, 0]);
  shell(R(-109, -102, 78, 86), 18, "tower", "#b5653b", undefined, undefined, 12);
  scenery.push({ kind: "clock", x: -101.8, z: 82, h: 26, yaw: Math.PI / 2 });
  spawnAt(-97, 70, "street", 0.15); spawnAt(-97, 95, "street", 0.15);
  // station car park (the NW corner): parked cars you can break into
  ["#d6264a", "#3d6fb5", "#e8e2d4", "#ffcf3a", "#43c7a6"].forEach((c, i) => prop("car", -112 + i * 3.4, 107, i % 2 ? 0 : Math.PI, 1.9, 4.2, 1.5, { color: c }));
  spawnAt(-104, 111.5, "yard", 0.15);
  for (const [x, z] of [[-97, 102], [-97, 88], [-110, 102.5]]) spawnAt(x, z, "street", 0.15);

  // --- canal: quay, bus depot (south end), marina with yachts (north end) ---
  water.push(R(99, 113, -40, 104));
  scenery.push({ kind: "canal", x: 106, z: 32, w: 14, d: 144 });
  for (let z = -36; z <= 100; z += 12) boxes.push({ ...box(98.8, z, 0.25, 0.25, 1.0, "wall"), color: "#3a3444" }); // bollards
  // bus depot
  for (const x of [99.5, 112.5]) for (const z of [-80, -67.5, -55]) boxes.push({ ...box(x, z, 0.6, 0.6, 5, "wall"), color: "#8e8a94" });
  boxes.push({ ...box(106, -67.5, 14, 26, 0.3, "roof", 5), color: "#5a5163", sign: "BUS DEPOT: BUSES (SOMETIMES)", face: [-1, 0] });
  for (const x of [102.5, 109.5]) boxes.push({ ...box(x, -68, 2.6, 10, 3.2, "van"), color: "#ffcf3a" });
  spawnAt(106, -60, "yard", 0.15); spawnAt(106, -82, "yard", 0.15);
  ["#6b4c9a", "#8a9a5b", "#ff7a1f"].forEach((c, i) => prop("car", 101 + i * 5, -88.5, Math.PI / 2, 1.9, 4.2, 1.5, { color: c }));

  spawnAt(102.5, -68, "rooftop", 3.2);
  // marina
  for (const z of [70, 82, 94]) boxes.push({ ...box(103, z, 8, 1.6, 0.4, "dock"), color: "#8b5a2b" });
  for (const [z, name] of [[76, "SS TAX WRITE-OFF"], [88, "YACHT-A-LOT"], [99, ""]] as [number, string][]) {
    boxes.push({ ...box(109.5, z, 3, 8, 2.2, "van"), color: "#f4f1ea", ...(name ? { sign: name, face: [-1, 0] as [number, number] } : {}) });
  }
  spawnAt(106, 70.5, "yard", 0.55); spawnAt(106, 94.5, "yard", 0.55); spawnAt(106, 82.5, "yard", 0.55);
  for (const [x, z] of [[97, 102], [97, 88], [106, 112]]) spawnAt(x, z, "street", 0.15);
  shell(R(97, 101, 104.5, 110), 3.2, "building", "#43a7c7", "MARINA OFFICE", [-1, 0]);

  // =================================================================================================
  // TENT TOWN under the highway: the four fort compounds (walled, a main gate, a squeeze gap round
  // the back), junk clusters between them, the broken ramp lookout
  // =================================================================================================
  ground(R(-115, 115, -115, -93), "plaza", "#9a8a6e");
  blocks.push({ name: "Tent Town", rect: R(-115, 115, -115, -93), tier: 0, open: ["N", "S", "E", "W"] });
  // the highway deck on pillars (10 m up)
  boxes.push({ ...box(0, (HIGHWAY.z0 + HIGHWAY.z1) / 2, 232, HIGHWAY.z1 - HIGHWAY.z0, HIGHWAY.h, "slab", HIGHWAY.y), color: "#8e8a94", sign: "INTERSTATE 0", face: [0, 1] });
  scenery.push({ kind: "highway", x: 0, z: (HIGHWAY.z0 + HIGHWAY.z1) / 2, w: 232, d: HIGHWAY.z1 - HIGHWAY.z0, h: HIGHWAY.y + HIGHWAY.h });
  for (const x of [-66, 0, 66]) for (const z of [-98.5, -107.5]) boxes.push({ ...box(x, z, 1.8, 1.8, HIGHWAY.y, "wall"), color: "#9aa3b5" });
  // the broken ramp: a stepped concrete ramp you can run up to a lookout that ends in mid-air
  for (let i = 1; i <= 26; i++) boxes.push({ ...box(-18 + (i - 0.5) * 0.5, -112.5, 0.5, 1.8, i * 0.3, "ramp-step"), color: "#9aa3b5" });
  boxes.push({ ...box(-3.5, -112.5, 3, 1.8, 7.8, "platform"), color: "#9aa3b5" });
  spawnAt(-3.5, -112.5, "rooftop", 7.8);
  const forts: FortLot[] = [];
  const C = COMPOUND;
  C.xs.forEach((cx, slot) => {
    const wallC = "#8a7a63", H2 = C.wallH, zc = (C.z0 + C.z1) / 2, dep = C.z1 - C.z0;
    const w = (x: number, z: number, ww: number, dd: number) => boxes.push({ ...box(x, z, ww, dd, H2, "wall"), color: wallC });
    // north wall with the main gate (4 m) in the middle
    const seg = C.half - 2;
    w(cx - C.half + seg / 2, C.z1, seg, 0.4); w(cx + C.half - seg / 2, C.z1, seg, 0.4);
    // south wall with a 1.6 m squeeze gap near one corner
    const gx = cx + (cx < 0 ? 5 : -5);
    const l = gx - 0.8 - (cx - C.half), rr = cx + C.half - (gx + 0.8);
    w(cx - C.half + l / 2, C.z0, l, 0.4); w(cx + C.half - rr / 2, C.z0, rr, 0.4);
    w(cx - C.half, zc, 0.4, dep + 0.4); w(cx + C.half, zc, 0.4, dep + 0.4);
    // the fort itself at the back, the drop pad in front of it
    const fortBox = box(cx, C.z0 + 3.5, 2.4, 1.9, 1.5, "fort");
    boxes.push(fortBox);
    const zone = R(cx - C.half + 0.4, cx + C.half - 0.4, C.z0 + 0.4, C.z1 - 0.4);
    forts.push({ slot, x: cx, z: fortBox.z, padX: cx, padZ: C.z0 + 9.5, yaw: 0, zone, backX: cx, backZ: C.z0 - 2, gapX: gx, gapZ: C.z0 });
    // gate sign
    boxes.push({ ...box(cx, C.z1, 4.2, 0.3, 0.6, "slab", 2.9), color: "#6b4a2b" });
  });
  // junk clusters between the compounds (cover + climbing, so raids aren't a straight run)
  const junk = (x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "junk", color?: string) => boxes.push({ ...box(x, z, w, d, h, kind), ...(color ? { color } : {}) });
  for (const cx of [-66, 66]) {
    junk(cx - 6, -101, 3, 2.4, 1.4, "junk", "#3d6fb5"); // tents
    junk(cx + 5, -104, 2.6, 2.6, 1.3, "junk", "#6aa84f");
    junk(cx - 3, -110, 2, 2, 1.1, "crate");
    junk(cx + 7.5, -97.5, 1.2, 1.2, 0.9, "crate");
    junk(cx - 8, -95.5, 1.2, 1.2, 0.5, "pallet");
    prop("bin", cx + 2.5, -99, 0, 0.7, 0.7, 1.0); // burning barrel
    spawnAt(cx, -103, "yard", 0.15); spawnAt(cx - 5, -106, "yard", 0.15);
  }
  for (const [x, z, w, d, h, c] of [[-14, -101, 3, 2.4, 1.4, "#e14b4b"], [11, -100, 2.6, 2.6, 1.3, "#ffcf3a"], [4, -107, 3, 2, 1.1, "#43c7a6"], [-9, -108, 2, 2, 1.5, ""], [16, -109, 1.2, 1.2, 0.9, ""]] as [number, number, number, number, number, string][]) junk(x, z, w, d, h, c ? "junk" : "crate", c || undefined);
  for (const x of [-116, 116]) void x;
  for (const [x, z] of [[-3, -103], [8, -97], [-20, -105]]) spawnAt(x, z, "yard", 0.15);
  for (const [x, z] of [[-50, -97], [50, -97], [-82, -97], [82, -97]]) spawnAt(x, z, "street", 0.15);
  for (const x of [-80, -50, -20, 20, 50, 80]) decor.push({ kind: "streetlight", x, z: -94.2 });

  // =================================================================================================
  // THE POLICE PRECINCT, north of the roundabout, front door facing the park
  // =================================================================================================
  const station = (() => {
    const P0 = LM.precinct, PD_H = 4.5, D = P0.maxZ - P0.minZ, zf = P0.minZ;
    const x0 = P0.minX, x1 = P0.maxX, pdX = (x0 + x1) / 2, pdZ = (P0.minZ + P0.maxZ) / 2;
    const V = (v: number) => zf + v; // v = metres in from the front
    const pdWall = "#2f3a5c";
    const wall = (x: number, z: number, w: number, d: number, h = PD_H, baseY = 0, kind: Box["kind"] = "wall", color = pdWall) =>
      boxes.push({ ...box(x, z, w, d, h, kind, baseY), color });
    wall(x0 + 1.5, V(0), 3, 0.4); // front wall, left of the door (door: x0+3 .. x0+6)
    wall(x0 + 13, V(0), 14, 0.4); // right of the door
    wall(x0 + 4.5, V(0), 3, 0.4, PD_H - 2.7, 2.7); // over the door
    wall(pdX, V(D), x1 - x0 + 0.4, 0.4); // back wall
    wall(x0, pdZ, 0.4, D); wall(x1, pdZ, 0.4, D);
    boxes.push({ ...box(pdX, pdZ, x1 - x0 + 0.4, D + 0.4, 0.3, "roof", PD_H), sign: "TRASHINGTON PD", face: [0, -1], color: "#1f2944" });
    boxes.push({ ...box(pdX, pdZ, x1 - x0 - 0.4, D - 0.4, 0.03, "shopfloor"), color: "#c9ccd6" });
    boxes.push({ ...box(x0 + 13, V(4.6), 9, 0.9, 1.1, "counter"), color: "#5a4632" }); // front desk
    const cellV0 = D - 6, cellV1 = D - 0.2, cellW = (x1 - x0 - 0.4) / 4;
    const cells: NonNullable<ArenaLayout["station"]>["cells"] = [];
    for (let i = 0; i < 4; i++) {
      const cx0 = x0 + 0.2 + i * cellW, cx1 = cx0 + cellW, cx = (cx0 + cx1) / 2;
      if (i > 0) wall(cx0, V((cellV0 + cellV1) / 2), 0.3, cellV1 - cellV0);
      boxes.push({ ...box(cx, V(cellV0), cellW - (i > 0 ? 0.3 : 0), 0.2, PD_H, "bars"), color: "#8e96a8" });
      boxes.push({ ...box(cx, V(D - 0.9), 2.2, 0.8, 0.45, "bench"), color: "#6b4a2b" });
      cells.push({ x: cx, z: V(D - 3.3), yaw: Math.PI, rect: { minX: cx0 + 0.6, maxX: cx1 - 0.6, minZ: V(cellV0 + 0.5), maxZ: V(cellV1 - 0.6) } });
    }
    for (const z of [35.5, 41]) { boxes.push(box(31, z, 1.9, 4.2, 1.5, "car")); decor.push({ kind: "copcar", x: 31, z, yaw: 0 }); }
    spawnAt(x1 + 1.5, V(D) + 1.6, "alley");
    return {
      rect: { minX: x0 - 0.2, maxX: x1 + 0.2, minZ: P0.minZ - 0.2, maxZ: P0.maxZ + 0.2 },
      door: { x: x0 + 4.5, z: V(-2.4), yaw: Math.PI },
      alley: { x: x0 + 8, z: V(D) + 1.6, yaw: -Math.PI / 2 },
      cells,
    };
  })();

  // ==== boundary fences (3 m, too tall to climb) ====================================================
  boxes.push(box(0, HALF + 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(0, -HALF - 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(HALF + 0.5, 0, 1, HALF * 2, 3, "fence"));
  boxes.push(box(-HALF - 0.5, 0, 1, HALF * 2, 3, "fence"));

  for (const [x, z] of streetLoot) spawnAt(x, z, "street", 0.15);

  // ==== event geometry ==============================================================================
  // (the garbage truck drives the right-hand lane of a straight road)
  const truckRoutes = [
    { name: "the SERVICE ROAD", ax: -84, az: -91, bx: 84, bz: -91 },
    { name: "NORTH PARADE", ax: 84, az: 110, bx: -84, bz: 110 },
    { name: "the WEST ROAD", ax: -89, az: -82, bx: -89, bz: 102 },
    { name: "the EAST ROAD", ax: 89, az: 102, bx: 89, bz: -82 },
  ];
  const happyZones = [
    { x: 0, z: 0, r: 18, name: "the Park" },
    { x: 55, z: -30, r: 14, name: "Market Row" },
    { x: -30, z: -60, r: 14, name: "The Yards" },
    { x: -40, z: 25, r: 14, name: "Old Brick" },
    { x: 0, z: 78, r: 12, name: "City Hall" },
  ];
  const airdropSpots: [number, number][] = [[-12, 76], [12, 76], [0, 76], [-14, 86], [14, 86], [T.x - 8, T.z - 10], [T.x - 10, T.z + 6], [T.x - 4, T.z - 2]];

  // fort slots: 0 + 1 are the corners, 2 + 3 the middle (2 players: corners, 3: + one middle)
  const spawns = forts.map((f) => ({ x: f.padX, z: f.padZ, yaw: f.yaw }));
  const landmarks = {
    ledge09: { x: -110, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge14: { x: -105, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge195: { x: -100, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    tunnelEntrance: { x: tunX - 5.5, z: tunZ, yaw: Math.PI / 2, roofStartX: tunX - 3, roofEndX: tunX + 3 },
    /** the open build yard: tests use it as their origin (it replaces the old plaza) */
    testYard: { x: T.x, z: T.z, yaw: 0 },
    plaza: { x: T.x, z: T.z - 10, yaw: 0 },
    /** 40 m of clear ground heading north (sprint / slide tests) */
    runway: { x: T.x - 16, z: T.z - 21, yaw: 0 },
    /** open spots, clear for ~6 m in +z (loot / punch tests) */
    spotA: { x: T.x - 16, z: T.z - 8, yaw: 0 },
    spotB: { x: T.x - 8, z: T.z - 8, yaw: 0 },
    spotC: { x: T.x - 16, z: T.z + 5, yaw: 0 },
    /** far from every walk-in building (interiors culling) */
    noShops: { x: -105, z: -80, yaw: 0 },
    /** Slice 2A: standing in the doorway of Corner Mart, looking in */
    martDoor: { x: units[0].doorX + units[0].out[0] * 1.5, z: units[0].doorZ + units[0].out[1] * 1.5, yaw: Math.atan2(-units[0].out[0], -units[0].out[1]) },
    pondEdge: { x: 11, z: pond.minZ - 2.5, yaw: 0, waterZ: pond.minZ },
    parkCentre: { x: 0, z: -8, yaw: 0 },
    cityHall: { x: 0, z: 76, yaw: 0 },
  };
  // (lines closer than 1.3 m merge into one: crowded route points make walkers dither. A crosswalk's
  //  centre line wins, so the merged line still runs through the crossing)
  const cwX = new Set(crosswalks.filter((c) => c.maxX - c.minX < 3.5).map((c) => Math.round((c.minX + c.maxX) * 5) / 10));
  const cwZ = new Set(crosswalks.filter((c) => c.maxZ - c.minZ < 3.5).map((c) => Math.round((c.minZ + c.maxZ) * 5) / 10));
  const merge = (set: Set<number>, cw: Set<number>) => {
    const vs = [...set].filter((v) => Math.abs(v) < HALF - 1).sort((a, b) => a - b);
    const out: number[] = [];
    for (let i = 0; i < vs.length;) {
      let j = i;
      while (j + 1 < vs.length && vs[j + 1] - vs[i] < 1.3) j++;
      const group = vs.slice(i, j + 1);
      out.push(group.find((v) => cw.has(v)) ?? group[Math.floor(group.length / 2)]);
      i = j + 1;
    }
    return out;
  };
  const navLines = merge(xLines, cwX);
  const navLinesZ = merge(zLines, cwZ);

  return {
    halfSize: HALF, boxes, spawns, lootSpawns: loot, forts, landmarks, roads, roadRings, crosswalks, navLines, navLinesZ, props,
    shops, truckRoutes, happyZones, airdropSpots, decor, station, roadGraph, water, navChains, units,
    roadNet, blocks, scenery,
  };
}

function rectOf(P: (u: number, v: number) => [number, number], u0: number, u1: number, v0: number, v1: number): Rect {
  const [ax, az] = P(u0, v0), [bx, bz] = P(u1, v1);
  return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
}

type UnitBox = (u: number, v: number, wu: number, wv: number, h: number, kind: Box["kind"], extra?: Partial<Box>, baseY?: number) => Box;

/**
 * Shop-floor fixtures. Local coords: u across (-7.5..7.5), v into the shop (0 = front). The middle
 * aisle (|u| < 1.5) stays clear for walking in; the counter + cashier are front-right; the strip
 * along the back (v > 10) stays clear to the back door. Loot spots: [u, v, surface height].
 */
function fixtures(spec: UnitSpec, B: UnitBox, loot: [number, number, number][], inside: Partial<Box>) {
  const F = (u: number, v: number, wu: number, wv: number, h: number, kind: Box["kind"], color?: string) => B(u, v, wu, wv, h, kind, color ? { ...inside, color } : inside);
  switch (spec.layout) {
    case "shelves": {
      const shelfKind: Box["kind"] = spec.type === "pet" ? "cage" : "shelf";
      F(-6.5, 5.0, 0.9, 7, 1.7, "shelf");
      F(-3.3, 5.0, 0.9, 6, 1.7, shelfKind);
      if (spec.back === "fridge") F(4.5, 9.2, 5, 0.8, 2.2, "fridge");
      else if (spec.back === "table") F(4.5, 8.0, 3, 1.2, 0.9, "table");
      else if (spec.back === "cage") F(4.5, 8.8, 5, 1, 1.4, "cage");
      else F(4.5, 9.3, 5, 0.6, 1.7, "shelf");
      loot.push([-6.5, 2.5, 1.7], [-6.5, 5, 1.7], [-6.5, 7.5, 1.7], [-3.3, 3, 1.7], [-3.3, 6.5, 1.7]);
      if (spec.back === "table") loot.push([4.0, 8.0, 0.9], [5.5, 8.0, 0.9]);
      else if (spec.back === "cage") loot.push([4.5, 8.8, 1.4]);
      else if (spec.back === "shelf") loot.push([4.0, 9.3, 1.7]);
      else loot.push([4.5, 8.3, 0.18]);
      break;
    }
    case "food": {
      F(-6.3, 4.5, 1.2, 5, 1.1, "case");
      F(-3.3, 3.0, 1, 1, 0.75, "table");
      F(-3.3, 6.5, 1, 1, 0.75, "table");
      F(4.5, 9.2, 5, 0.8, 2.2, "fridge", spec.type === "pizza" ? "#4a4652" : undefined);
      loot.push([-6.3, 3, 1.1], [-6.3, 6, 1.1], [-3.3, 3, 0.75], [-3.3, 6.5, 0.75], [4.5, 8.3, 0.18]);
      break;
    }
    case "arcade": {
      for (const v of [1.5, 3.0, 4.5, 6.0, 7.5]) F(-6.6, v, 0.9, 0.8, 1.9, "arcade");
      F(3.5, 7.5, 0.9, 0.8, 1.9, "arcade");
      F(5.5, 7.5, 0.9, 0.8, 1.9, "arcade");
      loot.push([-5.4, 2.2, 0.18], [-5.4, 5.3, 0.18], [-6.6, 3.0, 1.9], [4.5, 8.5, 0.18], [-4, 7.2, 0.18]);
      break;
    }
    case "laundry": {
      for (let v = 1.2; v <= 8.5; v += 0.9) F(-6.65, v, 0.8, 0.8, 1.0, "washer");
      for (let u = 2.9; u <= 6.5; u += 0.9) F(u, 9.2, 0.8, 0.8, 1.9, "washer");
      F(-3.3, 5, 1, 3, 0.85, "table");
      loot.push([-6.65, 2.1, 1.0], [-6.65, 5.7, 1.0], [-6.65, 8.4, 1.0], [-3.3, 4.2, 0.85], [-3.3, 5.8, 0.85]);
      break;
    }
    case "thrift": {
      for (const [u, v] of [[-6.3, 3], [-6.3, 7], [-3.5, 3], [-3.5, 7]]) F(u, v, 0.5, 2.6, 1.6, "rack");
      F(4.5, 9.3, 5, 0.6, 1.7, "shelf");
      loot.push([-4.9, 2.0, 0.18], [-4.9, 5.0, 0.18], [-4.9, 8.0, 0.18], [4.0, 9.3, 1.7], [6, 8.0, 0.18]);
      break;
    }
    case "jeweller": {
      F(-6.2, 4.5, 1, 5.5, 1.05, "case");
      F(-2.5, 7.6, 3, 0.9, 1.05, "case");
      loot.push([-6.2, 2.5, 1.05], [-6.2, 4.5, 1.05], [-6.2, 6.5, 1.05], [-3, 7.6, 1.05], [-2, 7.6, 1.05]);
      break;
    }
    case "barber": {
      F(-6.75, 5, 0.5, 6, 0.9, "counter");
      for (const v of [2.8, 5.0, 7.2]) F(-5.6, v, 0.7, 0.7, 1.0, "chair");
      F(4.5, 8.5, 3, 0.6, 0.45, "bench");
      loot.push([-6.6, 2.8, 0.9], [-6.6, 7.2, 0.9], [-5.6, 5, 1.0], [4.5, 8.5, 0.45]);
      break;
    }
    case "office": {
      F(-6.2, 3, 1.2, 1.2, 0.9, "pot");
      F(-6.2, 6.5, 0.8, 2.4, 0.5, "sofa");
      loot.push([-6.2, 6.5, 0.5]);
      break;
    }
    case "apart": {
      F(-6.8, 3.5, 0.5, 2.2, 1.5, "mailbox");
      F(-6.2, 7.0, 1.2, 1.2, 0.9, "pot");
      loot.push([-5.5, 5.5, 0.18]);
      break;
    }
  }
}

/** Upstairs furniture + loot (zone "room"). Keeps clear of the stairwell / fire-escape door at the back left. */
function upstairs(spec: UnitSpec, B: UnitBox, UP: number, inside: Partial<Box>): [number, number, number][] {
  const F = (u: number, v: number, wu: number, wv: number, h: number, kind: Box["kind"], color?: string) => B(u, v, wu, wv, h, kind, { ...inside, ...(color ? { color } : {}) }, UP);
  const spots: [number, number, number][] = [];
  switch (spec.upper) {
    case "stock":
      for (const [u, v, h] of [[-5.5, 2, 1.2], [-3.5, 2, 1.8], [3, 2.5, 1.2], [5.5, 3, 1.5], [5.5, 7.5, 1.2]]) { F(u, v, 1.4, 1.4, h, "boxes"); spots.push([u, v, h]); }
      F(0, 6.5, 6, 0.8, 1.8, "shelf");
      spots.push([-1.5, 6.5, 1.8], [1.5, 6.5, 1.8], [-4.5, 5, 0], [3, 9, 0]);
      break;
    case "office":
      for (const [u, v] of [[-4.5, 2.5], [-1.5, 2.5], [2.5, 2.5], [5.5, 2.5], [-4.5, 6], [-1.5, 6], [2.5, 6], [5.5, 6]]) { F(u, v, 1.4, 0.7, 0.75, "desk"); }
      F(6.6, 9.4, 0.5, 0.5, 1.3, "cooler");
      F(6.7, 5.5, 0.6, 1.8, 1.4, "boxes", "#8e8a94"); // filing cabinets
      spots.push([-4.5, 2.5, 0.75], [2.5, 2.5, 0.75], [-1.5, 6, 0.75], [5.5, 6, 0.75], [0.5, 9, 0]);
      break;
    case "apart":
      F(5.5, 2.0, 2.0, 1.4, 0.55, "bed");
      F(-1.5, 2.2, 2.0, 0.9, 0.8, "sofa");
      F(-1.5, 4.2, 1.0, 0.6, 0.45, "table");
      F(5.5, 7.5, 2.6, 0.7, 0.95, "counter");
      F(2.5, 7.0, 1.0, 1.0, 0.75, "table");
      F(-5.5, 3.5, 1.2, 0.5, 0.6, "table", "#3a3444"); // TV stand
      spots.push([5.5, 2.0, 0.55], [-1.5, 4.2, 0.45], [5.5, 7.5, 0.95], [2.5, 7.0, 0.75], [-5.5, 3.5, 0.6], [0.5, 8.5, 0]);
      break;
    case "gym":
      for (const u of [-3.5, 0, 3.5]) F(u, 3.0, 0.45, 1.4, 0.5, "gymbench");
      F(5.8, 7.5, 0.6, 3.0, 0.9, "table", "#6f6a78"); // dumbbell rack
      F(-2, 7.0, 0.9, 2.0, 1.2, "gymbench", "#2f2f3a"); // treadmill
      spots.push([5.8, 6.5, 0.9], [5.8, 8.5, 0.9], [0, 3.0, 0.5], [2, 9, 0]);
      break;
  }
  return spots;
}
