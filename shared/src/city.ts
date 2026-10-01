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
  box, tierAt, inRect, type Box, type ArenaLayout, type SpawnPoint, type FortLot, type LootZone, type PropDef, type PropKind,
  type Rect, type ShopDef, type ShopType, type UnitDef, type RoadNet, type RoadNode, type RoadEdge, type BlockDef, type LobbyDef,
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
/** Tent Town fort yards (x centres, evenly spaced between the railway and the canal; slot 0/1 = the
 *  corners, 2/3 = the middle two). No walls: walls come as upgrades. */
export const COMPOUND = { xs: [-71.25, 71.25, -23.75, 23.75], z0: -111, z1: -96, half: 8 };
/** The overhead highway over Tent Town */
export const HIGHWAY = { z0: -110, z1: -96, y: 9.5, h: 1 };

type Dir = "N" | "S" | "E" | "W";

function hash(a: number, b: number) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
const rectI = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
const R = (minX: number, maxX: number, minZ: number, maxZ: number): Rect => ({ minX, maxX, minZ, maxZ });

const SIGNS_LOW = ["DISCOUNT SOUP", "PIGEON SUPPLY", "MOP EMPORIUM", "CHEAP WIGS", "HAT HUT", "SOCK OUTLET", "NAPKIN DEPOT", "USED MATTRESS WORLD", "CASH 4 SPOONS", "BUDGET DENTIST", "PAWN-ISH", "LIQUOR-ISH",
  "99c-ISH STORE", "TAXES (DONE BADLY)", "LOOSE BATTERIES", "GUM UNDER GLASS", "DAVE'S CHICKEN-ADJACENT", "TYRES (MOSTLY ROUND)", "NAILS & TAILS", "KEYS CUT WHILE U WAIT (LONG)", "PAYDAY LOANS-ISH", "FISH? FISH.", "ONE SHOE SHOP", "CHEQUES CASHED (MAYBE)"];
const SIGNS_MID = ["BRICK & MORTAR", "VINTAGE RECORDS", "NOODLE PALACE", "LAUNDRO-MATT", "FANCY-ISH FLOWERS", "OLD TIMEY BARBER", "BOOKS (SOME)", "TAILOR SWIFTLY", "DELI-CIOUS", "CHEESE LOUISE", "BAGELS & BAGELS", "RENT-A-CANOE",
  "SOUP-ER MARKET", "WOK THIS WAY", "PHO-KING GOOD", "LETTUCE PRAY SALADS", "SEW WHAT", "PLANT DADDY", "SPECS APPEAL", "BEAN THERE CAFE", "HAIR FORCE ONE", "THAI TANIC", "CURL UP & DYE", "BREAD PITT BAKERY"];
const SIGNS_HIGH = ["INSURANCE-ISH", "BOXLY INC", "YELLING NEWS 24", "GOOCHY", "VERSAYCHEE", "PRADUH", "HOTEL ADEQUATE", "CRUNCHO+ TOWER", "GOLDMAN SNACKS", "LAWYERS 4 MORE", "THE PENTHOUSE", "ART-ISH GALLERY",
  "BALENCI-AGAIN", "LOUIS VUITTONISH", "ROLEXISH", "TIFFANY-ADJACENT", "CARTIER-ISH", "HERMEZ", "MONOCLE WAREHOUSE", "CAVIAR EXPRESS", "YACHT PARTS (NEW)", "OVERPRICED WATER BAR", "SMALL DOG BOUTIQUE", "HEDGE FUND & SONS"];

// ---- C2: each tier has its own materials (the renderer draws brick / render / stone + glass) ----
export const TIER_WALLS: string[][] = [
  ["#9e4a36", "#8a3f30", "#b3553f", "#7a4a3a", "#a86a4a", "#6f5a50", "#9a6a3c", "#84563f"],
  ["#d9b98a", "#a9c4a0", "#e8a98a", "#9fc4d9", "#c9b0d9", "#e8d58a", "#c98a7a", "#b9c9a0"],
  ["#e8e2d4", "#d8d0c4", "#cfc8b8", "#bfb7a6", "#e4dccb", "#a9a4ad", "#d9cfb9", "#c4bca9"],
];
export const TIER_TOWERS: string[][] = [
  ["#7a4a3a", "#6f5a50", "#8a3f30", "#5c5058", "#84563f", "#6b6f86"],
  ["#c9a86a", "#8a9a7b", "#a88a7a", "#7b8da8", "#9a8aa8", "#b39a6a"],
  ["#5c7a9e", "#3d8f8a", "#4f6b7a", "#8a9ab0", "#6a8aa8", "#9a8a6a", "#4a5a7a", "#7aa8b0"],
];

/** What each kind of shop has on its shelves (Slice 2C adds themed items for the new shops). */
export const SHOP_POOLS: Record<ShopType, string[]> = {
  mart: ["canned_beans", "energy_drink", "candy_bar", "soda_can", "lottery_ticket", "fancy_cheese"],
  pawn: ["gold_chain", "guitar", "sunglasses", "golden_spork", "snow_globe", "mixtape"],
  bakery: ["bagel", "baguette", "birthday_cake", "fancy_cheese", "donut"],
  gadget: ["phone_handset", "fancy_earbuds", "laptop", "crt_tv", "mixtape", "spray_can"], // (C4b: the hardware corner sells spray paint)
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
  /** C4b: a self-service shop (the laundromat): no cashier, no till */
  noCashier?: boolean;
}

const U: Record<string, UnitSpec> = {
  mart: { name: "CORNER MART", use: "shop", type: "mart", layout: "shelves", back: "fridge", wall: "#3f8f6a", floor: "#d8e8d0" },
  donut: { name: "HOLE LOTTA DONUTS", use: "shop", type: "donut", layout: "food", upper: "apart", access: "fire", wall: "#e0779a", floor: "#fbe3ea" },
  pharm: { name: "DRUG-ISH MART", use: "shop", type: "pharmacy", layout: "shelves", back: "fridge", wall: "#4f8fc9", floor: "#e6f0f7" },
  pizza: { name: "LEANING TOWER OF PIZZA", use: "shop", type: "pizza", layout: "food", upper: "apart", access: "fire", wall: "#c9442f", floor: "#f2e1c8" },
  bank: { name: "CHEQUE-O-MATIC", use: "closed", sub: "CASH FOR CHEQUES (BACK IN 5 MINS)", wall: "#8a7d5c", floor: "#e8e2d4" },
  bagel: { name: "BAGEL BARN", use: "shop", type: "bakery", layout: "food", wall: "#c26b4a", floor: "#f0dcc0" },
  arcade: { name: "PIXEL PALACE", use: "shop", type: "arcade", layout: "arcade", backroom: true, upper: "stock", access: "inside", wall: "#6b3fa0", floor: "#2b2240" },
  thrift: { name: "SECOND HAND STAN'S", use: "shop", type: "thrift", layout: "thrift", wall: "#8a6a3c", floor: "#e8dcc4" },
  kicks: { name: "KICKS R US", use: "shop", type: "sneaker", layout: "shelves", back: "shelf", upper: "gym", access: "fire", wall: "#2f2f3a", floor: "#e0e0e6" },
  gizmo: { name: "GIZMO GARAGE", use: "shop", type: "gadget", layout: "shelves", back: "table", wall: "#3d5a9e", floor: "#cfd8e8" },
  bling: { name: "BLING THING", use: "shop", type: "jeweller", layout: "jeweller", backroom: true, upper: "stock", access: "inside", wall: "#1f1f2e", floor: "#f4efe0" },
  cracked: { name: "CRACKED SCREENS", use: "shop", type: "phone", layout: "shelves", back: "table", upper: "stock", access: "inside", wall: "#2a8f8a", floor: "#d8efec" },
  // (C4b: a laundromat: no cashier; the grumpy old lady lives in the flat upstairs)
  spin: { name: "SPIN CYCLE", use: "shop", type: "laundry", layout: "laundry", upper: "apart", access: "fire", noCashier: true, wall: "#43a7c7", floor: "#e8f4f8" },
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
  const posts: NonNullable<ArenaLayout["posts"]> = [];
  const deepWater: Rect[] = [];
  const water: Rect[] = [];
  const streetLoot: [number, number][] = [];
  const spawnAt = (x: number, z: number, zone: LootZone, y = 0, extra: Partial<SpawnPoint> = {}) => loot.push({ x, y, z, zone, tier: tierAt(z), ...extra });
  const count: Record<string, number> = {};
  /** An interactable prop (with its collision box, if it has one). Dimensions are for yaw 0 (facing +z). */
  const prop = (kind: PropKind, x: number, z: number, yaw: number, w: number, d: number, h: number, extra: Partial<PropDef> = {}) => {
    const n = (count[kind] = (count[kind] ?? 0) + 1);
    const id = kind + n;
    const turned = Math.abs(Math.sin(yaw)) > 0.5;
    if (h > 0) boxes.push({ ...box(x, z, turned ? d : w, turned ? w : d, h, kind === "till" ? "counter" : (kind as Box["kind"])) });
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
    if (spec.use === "shop" && spec.noCashier) {
      // C4b: self-service: the grumpy old lady from upstairs is the only one who'll notice you (when it's loud)
      const [ox, oz] = P(-2, 1.6), [wx, wz] = P(1.5, -0.35);
      posts.push({ kind: "old_lady", x: ox, z: oz, yaw: yawOut, window: { x: wx, y: UP + 1.9, z: wz } });
    } else if (spec.use === "shop") {
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
  // crosstown streets (with a jog at the Mile)
  path([[-91, -48], [-56, -48]], 4, "Yards Rd"); rd(-56, -48, 0, -50, 4, "Yards Rd", { pb: [0, -48] });
  rd(0, -50, 58, -52, 4, "Yards Rd", { pa: [0, -52] }); path([[58, -52], [91, -52]], 4, "Yards Rd");
  path([[-91, 48], [-56, 48]], 4, "Uptown Ave"); rd(-56, 48, 0, 50, 4, "Uptown Ave", { pb: [0, 48] });
  rd(0, 50, 56, 52, 4, "Uptown Ave", { pa: [0, 52] }); path([[56, 52], [91, 52]], 4, "Uptown Ave");
  // (C1.1: one-way eastbound, round the front of City Hall: Blake cut the loop's back off)
  path([[-91, 83], [-56, 83], [-21, 83]], 3, "Gold St", { oneway: true });
  path([[21, 83], [56, 83], [91, 83]], 3, "Gold St", { oneway: true });
  path([[-56, -89], [-56, -48], [-56, 0], [-56, 48], [-56, 83], [-56, 108]], 3, "Crooked St");
  path([[56, 52], [56, 83], [56, 108]], 3, "Diamond St");
  path([[-91, 0], [-56, 0], [-RR, 0]], 4, "Crooked Spur");
  rd(RR, 0, 38, 0, 3, "Market Link");
  // the Market Row one-way loop (counter-clockwise), its links east and south
  path([[38, 0], [38, -18], [58, -18], [72, -18], [72, 0], [72, 18], [38, 18], [38, 0]], 3, "Market Row", { oneway: true });
  rd(72, 0, 91, 0, 3, "Market Link");
  path([[58, -18], [58, -52], [58, -89]], 3, "Market St");
  // the one-way U in front of City Hall: in from Gold St (west), round the front, out to Gold St (east)
  path([[-21, 83], [-21, 70], [0, 70], [21, 70], [21, 83]], 3, "City Hall Drive", { oneway: true });
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
      if (n.ctl === "round") reach = RING.r1 - RR + 5; // (C3: 5 m back from the ring, so a car waiting to join the ring isn't parked on the zebra)
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
  // THE PARK inside the roundabout (C3): grass, a paved promenade ring, the fountain you can wade in with
  // the Golden Mayor on a golden toilet in the middle, a pear-shaped pond (a shark fin, a fisherman),
  // bushes to hide in, lamps, benches, picnic tables, flower beds
  // =================================================================================================
  scenery.push({ kind: "grassdisc", x: 0, z: 0, r: RING.r0, h: 16.5 }); // (lawn to 16.5 m, the paved promenade ring outside it)
  // the fountain: a low rim you can step over (0.35 m), shallow water inside, the Mayor's column in the middle
  for (const [x, z, w, d] of [[0, -3.3, 7, 0.4], [0, 3.3, 7, 0.4], [-3.3, 0, 0.4, 6.2], [3.3, 0, 0.4, 6.2]]) boxes.push({ ...box(x, z, w, d, 0.35, "rim"), color: "#c8c0b0" });
  water.push(R(-3.1, 3.1, -3.1, 3.1));
  boxes.push({ ...box(0, 0, 1.6, 1.6, 3.8, "plinth"), sign: "OUR MAYOR (FOR NOW)", face: [0, -1] });
  boxes.push({ ...box(0, 0, 1.2, 1.2, 2.2, "statue", 3.8) });
  // the pond: pear-shaped (a big round end and a small one), wadeable; its outline is drawn from pondShape
  const pondShape = [{ x: 10, z: -2, r: 4.5 }, { x: 10, z: 3.5, r: 2.8 }];
  for (let z0 = -6.5; z0 < 6.3; z0 += 0.5) {
    // (the wading area: 0.5 m strips across the pear, each as wide as the shape at its middle)
    const zm = z0 + 0.25;
    let x0 = Infinity, x1 = -Infinity;
    for (const c of pondShape) { const dz = Math.abs(zm - c.z); if (dz < c.r) { const hw = Math.sqrt(c.r * c.r - dz * dz); x0 = Math.min(x0, c.x - hw); x1 = Math.max(x1, c.x + hw); } }
    if (x1 > x0) water.push(R(x0, x1, z0, z0 + 0.5));
  }
  const pond: Rect = { minX: 5.5, maxX: 14.5, minZ: -6.5, maxZ: 6.3 };
  boxes.push({ ...box(7.4, 3.5, 1.8, 1.4, 0.2, "dock", 0.3) }); // the fisherman's jetty
  posts.push({ kind: "fisherman", x: 6.0, z: 3.5, yaw: Math.PI / 2 }); // (at the foot of his jetty, rod out over the water)
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) * Math.PI / 4;
    boxes.push(box(Math.cos(t) * 15.5, Math.sin(t) * 15.5, 0.6, 0.6, 3, "tree"));
  }
  for (const t of [Math.PI / 2 + 0.35, Math.PI + 0.35, -Math.PI / 2 + 0.35]) {
    const x = Math.cos(t) * 20.3, z = Math.sin(t) * 20.3, along = Math.abs(Math.cos(t)) > 0.7;
    boxes.push(box(x, z, along ? 0.8 : 3, along ? 3 : 0.8, 0.5, "bench"));
  }
  // lamps round the promenade (looks only)
  for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4 + 0.2; scenery.push({ kind: "lamp", x: Math.cos(t) * 20.4, z: Math.sin(t) * 20.4 }); }
  // picnic tables and flower beds
  for (const [x, z] of [[-3.1, -8.5], [-8.5, 3.1]]) {
    boxes.push(box(x, z, 1.8, 0.9, 0.75, "table"));
    for (const s of [-1, 1]) boxes.push(box(x, z + s * 0.85, 1.8, 0.35, 0.45, "bench"));
  }
  for (const [x, z] of [[-5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) boxes.push({ ...box(x, z, 1.6, 1.6, 0.5, "planter"), color: "#b5653b" });
  // bushes to hide in (walk in, crouch, and the cops lose sight of you)
  const bushes: Rect[] = [];
  for (const deg of [110, 150, 200, 245, 290]) {
    const t = (deg * Math.PI) / 180, x = Math.cos(t) * 12, z = Math.sin(t) * 12;
    bushes.push(R(x - 1.3, x + 1.3, z - 1.3, z + 1.3));
  }
  spawnAt(Math.cos((150 * Math.PI) / 180) * 12, Math.sin((150 * Math.PI) / 180) * 12, "plaza", 0);
  spawnAt(Math.cos((290 * Math.PI) / 180) * 12, Math.sin((290 * Math.PI) / 180) * 12, "plaza", 0);
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
    const signStart = Math.floor(H(99) * 24);
    let signCount = 0;
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
      let prevColor = "";
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
          const hRaw = tier === 0 ? 4.8 + H(k + 50) * 4.9 : /* C2: one-storey shops are 4.8 m+ so the shopfront and fascia sign fit */ tier === 1 ? 5 + H(k + 50) * 11 : 12 + H(k + 50) * H(k + 90) * 42;
          const h = Math.round(hRaw * 2) / 2;
          // C2: every street building has a front (a shop, or a tower lobby) facing its street, with a parody sign
          // (the names go round the tier's list from a per-block start, so a block never repeats one)
          const signs = tier === 0 ? SIGNS_LOW : tier === 1 ? SIGNS_MID : SIGNS_HIGH;
          const signed = (ns ? rc.maxX - rc.minX : rc.maxZ - rc.minZ) >= 3; // (the width along the street)
          const name = signs[(signStart + signCount++) % signs.length];
          // (C2: no two neighbours alike: a colour different from the building before it in the row)
          const pal = h > 20 ? TIER_TOWERS[tier] : TIER_WALLS[tier];
          let ci = Math.floor(H(k + 85) * pal.length);
          if (pal[ci] === prevColor) ci = (ci + 1 + Math.floor(H(k + 86) * (pal.length - 1))) % pal.length;
          prevColor = pal[ci];
          boxes.push({
            ...box((rc.minX + rc.maxX) / 2, (rc.minZ + rc.maxZ) / 2, rc.maxX - rc.minX, rc.maxZ - rc.minZ, h, h > 20 ? "tower" : "building"),
            color: pal[ci], windows: true, face: OUT[s.dir], front: h > 20 ? "lobby" : "shop", ...(signed ? { sign: name } : {}),
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
    precinct: R(65, 83, -43.8, -30.5), copLot: R(65, 83, -30.5, -25.2), hall: R(45, 65, -9, 9),
    hotel: R(-33, -25, 56, 76), hq: R(25, 33, 60, 76), casino: R(63, 76, 60, 76),
    tower: R(-83, -71, 90, 100), valet: R(-70, -63, 90, 100), museum: R(-49, -35, 90, 100), mall: R(28, 46, 90, 100), club: R(63, 83, 90, 100),
    cityHall: R(-18, 18, 73, 86), garden: R(-24, 24, 86, 104),
  };
  const specs: BlockSpec[] = [
    // ---- LOW: The Yards ----
    B("Yards: Corner Mart block", -53, -5, -85, -52, ALL, { units: [{ spec: U.mart, dir: "N", at: -40 }, { spec: U.thrift, dir: "N", at: -18 }] }),
    // (C4b: "Yards: West" is now THE PIT, the skate park; see below)
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
    B("Market Row: Precinct block", 61, 87, -48, -21, ["S", "E", "W", { dir: "N", from: 61, to: 75 }], { keep: [LM.precinct, LM.copLot], noAlley: true }),
    B("Market Row: Market hall", 41, 69, -15, 15, ALL, { keep: [LM.hall], noAlley: true }),
    B("Market Row: North of the park", 5, 35, 3, 48, ["W", "N"], { ring: true, open: ["W"] }),
    B("Market Row: North", 35, 87, 21, 48, ["N", "E", { dir: "S", from: 35, to: 75 }], { units: [{ spec: U.pharm, dir: "S", at: 44 }, { spec: U.gizmo, dir: "S", at: 60 }, { spec: U.kicks, dir: "S", at: 75.5 }] }),
    // ---- HIGH: Uptown ----
    B("Uptown: West", -87, -59, 52, 80, ALL),
    B("Uptown: Hotel block", -53, -24, 52, 80, ["S", "N", "W", { dir: "E", from: 67, to: 80 }], { units: [{ spec: U.bling, dir: "S", at: -41.5 }], keep: [LM.hotel] }),
    B("Uptown: HQ block", 24, 53, 56, 80, ["S", "N", "E", { dir: "W", from: 67, to: 80 }], { units: [{ spec: U.cracked, dir: "S", at: 41.5 }], keep: [LM.hq] }),
    B("Uptown: Casino block", 59, 87, 56, 80, ALL, { keep: [LM.casino] }),
    B("Uptown: Apartment tower block", -87, -59, 86, 104, ALL, { keep: [LM.tower, LM.valet] }),
    B("Uptown: Museum block", -53, -24, 86, 104, ["N", "S", "W"], { keep: [LM.museum] }),
    B("Uptown: Mall block", 24, 53, 86, 104, ["N", "S", "E"], { keep: [LM.mall] }),
  ];
  for (const s of specs) fillBlock(s);
  // =================================================================================================
  // C5c: UPTOWN LANDMARKS: the Trashington Bank (where the country club was), the Mayor's Golden Statue
  // (Mile West), and a golden stash in each (Mile East plaza too).
  // =================================================================================================
  let bank: NonNullable<ArenaLayout["bank"]>, statue: NonNullable<ArenaLayout["statue"]>;
  {
    // ---- the Trashington Bank: a marble hall you can walk into: lobby, teller counter, the back corridor,
    // the vault (a round door: drill it, or open it with the manager's keycard), the manager's office
    const blk = R(59, 87, 86, 104), B0 = R(62, 84, 90, 102), H = 8, T = 0.5;
    ground(blk, "sidewalk");
    boxes.push({ ...box(73, 96, B0.maxX - B0.minX - 0.6, B0.maxZ - B0.minZ - 0.6, 0.03, "shopfloor", 0.15), color: "#e8e2d4" });
    blocks.push({ name: "Uptown: Trashington Bank", rect: blk, tier: 2, open: ["N", "S", "E", "W"] });
    const marble = "#e8e2d4", W = (x: number, z: number, w: number, d: number, h = H, y = 0, extra: Partial<Box> = {}) => boxes.push({ ...box(x, z, w, d, h, "wall", y), color: marble, ...extra });
    // front (south) wall with a 3 m doorway, the other outer walls, the roof
    W((62 + 71.5) / 2, B0.minZ + T / 2, 71.5 - 62, T, H, 0, { sign: "TRASHINGTON BANK", face: [0, -1] });
    W((74.5 + 84) / 2, B0.minZ + T / 2, 84 - 74.5, T);
    W(73, B0.minZ + T / 2, 3, T, H - 3.6, 3.6);
    W(73, B0.maxZ - T / 2, B0.maxX - B0.minX, T);
    W(B0.minX + T / 2, 96, T, B0.maxZ - B0.minZ);
    W(B0.maxX - T / 2, 96, T, B0.maxZ - B0.minZ);
    boxes.push({ ...box(73, 96, B0.maxX - B0.minX, B0.maxZ - B0.minZ, 0.4, "roof", H), color: "#b9b3a6" });
    // steps up to the door, and the partition between the lobby and the back (a door gap at x 80..82)
    boxes.push({ ...box(73, 89.3, 9, 1.2, 0.15, "step"), color: "#d8d0c4" });
    // the portico: six marble columns (round ones are drawn; these are their collision) holding a frieze you can stand on
    const cols: [number, number][] = [[62.8, 89.1], [70.6, 89.1], [75.4, 89.1], [79.3, 89.1], [83.2, 89.1]];
    for (const [x, z] of cols) boxes.push({ ...box(x, z, 0.7, 0.7, 7.0, "wall"), hide: true });
    boxes.push({ ...box(73, 89.15, 22.6, 1.9, 0.8, "wall", 7.0), color: marble });
    // (the vault's front wall is the partition's west half; the tellers can reach its door from behind the counter)
    W((74.5 + 80) / 2, 96.75, 80 - 74.5, 0.5, H);
    W(83, 96.75, 2, 0.5, H);
    // the teller counter (with glass above it) across the lobby
    boxes.push({ ...box(71, 94.7, 15, 0.8, 1.1, "counter"), color: "#6b3f22" });
    boxes.push({ ...box(71, 94.7, 15, 0.08, 1.2, "glass", 1.1) });
    // the vault: steel walls, a round door on its south side (x 70..72)
    const V = R(62.5, 74.5, 96.5, 101.75), steel = "#6f6a78", dx0 = 67.5, dx1 = 69.5; // (the vault backs onto the west wall; its door at x 67.5..69.5)
    boxes.push({ ...box(V.maxX - 0.25, (V.minZ + V.maxZ) / 2, 0.5, V.maxZ - V.minZ, H, "wall"), color: steel });
    boxes.push({ ...box((V.minX + dx0) / 2, V.minZ + 0.25, dx0 - V.minX, 0.5, H, "wall"), color: steel });
    boxes.push({ ...box((dx1 + V.maxX) / 2, V.minZ + 0.25, V.maxX - dx1, 0.5, H, "wall"), color: steel });
    boxes.push({ ...box((dx0 + dx1) / 2, V.minZ + 0.25, 2, 0.5, H - 2.8, "wall", 2.8), color: steel });
    prop("vaultdoor", (dx0 + dx1) / 2, V.minZ + 0.25, 0, 2.0, 0.5, 2.8, { hw: 1.0, hd: 0.35 });
    props[props.length - 1].box = boxes.length - 1; // (its box stops blocking once it's open)
    // shelves of gold at the back, deposit boxes on the side walls, cash bags on the floor
    boxes.push({ ...box(68.5, V.maxZ - 0.9, 9, 0.6, 1.0, "counter"), color: "#8a8a96" }); // (a steel bench, not a shop shelf)
    const vaultSpots: { type: string; x: number; y: number; z: number }[] = [];
    for (const x of [65, 67, 69, 71, 72.6]) vaultSpots.push({ type: "gold_bar", x, y: 1.05, z: V.maxZ - 0.9 });
    for (const x of [65.5, 68.5, 71.5]) vaultSpots.push({ type: "cash_bag", x, y: 0.2, z: V.minZ + 2.0 });
    for (const [x, z] of [[V.minX + 0.37, 98.6], [V.minX + 0.37, 100.2], [V.maxX - 0.62, 98.6], [V.maxX - 0.62, 100.2]]) prop("depositbox", x, z, x < 68.5 ? Math.PI / 2 : -Math.PI / 2, 0, 0, 0, { y: 1.1 });
    // pens, brochures and the odd forgotten wallet in the lobby
    for (const [x, z] of [[64.5, 93], [70, 92.5], [77, 93.2], [82, 94.5]]) spawnAt(x, z, "shop", 0.15);
    // the manager's office (back right): a desk, a golden stash behind a loose marble tile
    boxes.push({ ...box(81, 99.5, 2.2, 1.0, 0.8, "desk"), color: "#6b3f22" });
    prop("stash", 83.35, 101.2, -Math.PI / 2, 0, 0, 0, { y: 0.35, loot: ["golden_toilet_seat"] });
    posts.push({ kind: "bank_guard", x: 66.5, z: 92.2, yaw: 0 }, { kind: "bank_guard", x: 79.5, z: 98.8, yaw: -Math.PI / 2 });
    // the manager's keycard turns up in one of these each morning (a bin, a planter, the museum steps...)
    const keycardSpots = [{ x: -26.2, y: 0.15, z: 54.5 }, { x: 70, y: 0.15, z: 82 }, { x: -42, y: 0.15, z: 88.3 }, { x: 37, y: 0.15, z: 88.4 }, { x: 60.3, y: 0.15, z: 103 }, { x: -3.2, y: 0.15, z: 104.2 }];
    bank = { rect: B0, vault: V, vaultSpots, keycardSpots, door: { x: 73, z: B0.minZ }, cols };

    // ---- the Mayor's Golden Statue on Mile West: a stepped base, a plinth you can climb, the Mayor on a
    // throne (a gold nose you can prise off), a golden stash in the back of the plinth
    const mw = R(-24, -5, 52, 67);
    ground(mw, "sidewalk"); ground(R(mw.minX + 3, mw.maxX - 3, mw.minZ + 3, mw.maxZ - 3), "plaza", "#e6dcc4");
    blocks.push({ name: "Uptown: the Mayor's statue", rect: mw, tier: 2, open: ["N", "S", "E", "W"] });
    const sx = -14.5, sz = 59.5;
    boxes.push({ ...box(sx, sz, 6.4, 6.4, 1.0, "platform"), color: "#d8d0c4" });
    boxes.push({ ...box(sx, sz, 5, 5, 2.0, "plinth", 1.0), color: "#e8e2d4", sign: "MAYOR GRUBSWORTH", face: [1, 0], mayor: true });
    boxes.push({ ...box(sx - 0.4, sz, 1.8, 1.8, 3.2, "wall", 3.0), hide: true });
    prop("nose", sx + 0.62, sz, Math.PI / 2, 0, 0, 0, { y: 4.9 });
    prop("stash", sx - 2.53, sz + 1.2, -Math.PI / 2, 0, 0, 0, { y: 1.4, loot: ["mayors_medal"] });
    for (const [x, z] of [[-21, 55], [-21, 64], [-8, 55], [-8, 64]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
    for (const z of [55.2, 63.8]) boxes.push({ ...box(-9.8, z, 2.6, 0.7, 0.5, "bench") });
    spawnAt(-19.5, 59.5, "street", 0.15); spawnAt(-9, 59.5, "street", 0.15);
    statue = { x: sx - 0.4, z: sz, plinthH: 3.0, yaw: Math.PI / 2 };

    // ---- Mile East: a plain plaza for now (Blake dropped the WANTED screen; another landmark goes here later).
    // A low stone wall by the benches hides the Diamond Pigeon stash.
    const me = R(5, 24, 56, 67);
    ground(me, "sidewalk"); // (just paving: a nested plaza patch here drew dark under its outline)
    blocks.push({ name: "Uptown: Mile East plaza", rect: me, tier: 2, open: ["N", "S", "E", "W"] });
    boxes.push({ ...box(10.5, 61.5, 0.8, 4.2, 0.6, "wall"), color: "#d8d0c4" });
    prop("stash", 10.1 - 0.02, 62.6, -Math.PI / 2, 0, 0, 0, { y: 0.3, loot: ["diamond_pigeon"] });
    for (const [x, z] of [[17, 59], [17, 64], [21.5, 61.5], [9, 58], [9, 65]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
    boxes.push({ ...box(14, 61.5, 0.7, 3, 0.5, "bench") });
    spawnAt(19, 61.5, "street", 0.15);
  }

  // C5b: CHINATOWN: the Market Row street by the canal (x 69..75, z -21..21). Two rows of shophouses face
  // it from the east (curved tiled roofs, lanterns, hanging signs), street stalls in front of them, the
  // market hall's side on the west, a red gate at each end and lanterns strung across the road.
  let chinatown: NonNullable<ArenaLayout["chinatown"]>;
  {
    const street = R(69, 75, -21, 21);
    const SHOPS: [string, string, string, string][] = [
      // name, second (Chinese) sign, wall colour, roof colour
      ["DUMPLING DYNASTY", "饺子馆", "#b8322c", "#3f7f4f"],
      ["LUCKY NOODLE BAR", "面馆", "#e8d8b0", "#b8322c"],
      ["GOLDEN LEAF TEA HOUSE", "茶楼", "#3d8f6a", "#d8742c"],
      ["JADE HERBAL SHOP", "药材", "#8e1f2e", "#3f7f4f"],
      ["GOLDEN MOON BAKERY", "饼家", "#c98a2a", "#b8322c"],
      ["TRIPLE HAPPY GROCER", "杂货", "#b8322c", "#d8742c"],
    ];
    const rows = [R(75, 87, -21, -3), R(75, 87, 3, 21)];
    let k = 0;
    rows.forEach((r, ri) => {
      ground(r, "sidewalk");
      blocks.push({ name: ri === 0 ? "Chinatown: South" : "Chinatown: North", rect: r, tier: 1, open: ["N", "S", "E", "W"] });
      for (let j = 0; j < 3; j++) {
        const [name, sign2, wall, roof] = SHOPS[k++];
        const z0 = r.minZ + j * 6, zc = z0 + 3;
        const h = [8.5, 10.6, 7.6, 9.4, 11.2, 8.2][k - 1];
        boxes.push({ ...box(82.5, zc, 9, 5.8, h, "building"), color: wall, windows: true, face: [-1, 0], front: "shop", sign: name, china: { roof, sign2 } });
        // the street stall in front (a dumpling steamer cart, a souvenir stall or a seafood tank)
        const kind = (["steamer", "trinkets", "steamer", "trinkets", "steamer", "fishtank"] as const)[k - 1];
        prop(kind, 77.3, zc + (j === 1 ? 0.8 : -0.8), -Math.PI / 2, kind === "fishtank" ? 1.4 : 1.6, kind === "fishtank" ? 0.8 : 0.9, kind === "fishtank" ? 1.3 : 1.05);
      }
      spawnAt(76.2, (r.minZ + r.maxZ) / 2 + 2, "street", 0.15);
    });
    // the gates (just inside each end of the street) and the lantern rows over the road
    const gates = [{ x: 72, z: -13, w: 8.6 }, { x: 72, z: 13, w: 8.6 }];
    for (const g of gates) for (const sx of [-1, 1]) boxes.push({ ...box(g.x + sx * (g.w / 2 - 0.2), g.z, 0.6, 0.6, 7.2, "wall"), hide: true });
    chinatown = {
      street, gates,
      lanternRows: [-10.5, -7, 7, 10.5],
      // the dragon parade walks up the middle of the street from the south gate to the north gate
      route: [{ x: 72, z: -26 }, { x: 72, z: 26 }],
    };
  }

  // C4b: THE PIT: a small skate park in the Yards (ramps you can run up, walls to tag, spray cans lying about)
  const pit = R(-87, -59, -85, -52);
  {
    const inner = R(pit.minX + 4, pit.maxX - 4, pit.minZ + 4, pit.maxZ - 4);
    // pavement round the edge (4 strips, so nothing overlaps the concrete: no flicker)
    for (const r of [R(pit.minX, pit.maxX, pit.minZ, inner.minZ), R(pit.minX, pit.maxX, inner.maxZ, pit.maxZ), R(pit.minX, inner.minX, inner.minZ, inner.maxZ), R(inner.maxX, pit.maxX, inner.minZ, inner.maxZ)]) ground(r, "sidewalk");
    ground(inner, "plaza", "#a8a4a0");
    blocks.push({ name: "The Pit (skate park)", rect: pit, tier: 0, open: ["N", "S", "E", "W"] });
    const cx = (inner.minX + inner.maxX) / 2, cz = (inner.minZ + inner.maxZ) / 2;
    const concrete = "#b9b3ac", wood = "#a8743f";
    // graffiti walls along the back (north) edge and the west edge, with gaps to walk through
    boxes.push({ ...box(cx - 5, inner.maxZ - 0.3, 9, 0.5, 2.6, "wall"), color: "#8e8a94", sign: "THE PIT (SKATE AT YOUR OWN RISK)", face: [0, -1] });
    boxes.push({ ...box(cx + 7, inner.maxZ - 0.3, 5, 0.5, 2.6, "wall"), color: "#8e8a94", art: true });
    boxes.push({ ...box(inner.minX + 0.3, cz - 4, 0.5, 9, 2.4, "wall"), color: "#8e8a94", art: true });
    boxes.push({ ...box(inner.minX + 0.3, cz + 7.5, 0.5, 5, 2.4, "wall"), color: "#8e8a94", art: true });
    // two quarter pipes (steps you can run up: 0.3 m each, up to 1.8 m) facing each other across the middle
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? inner.minX + 1.0 : inner.maxX - 1.0; // (the deck's inner edge)
      for (let i = 0; i < 6; i++) boxes.push({ ...box(x0 - side * (0.25 + (5 - i) * 0.5), cz + 1, 0.5, 6, 0.3 * (i + 1), "ramp-step"), color: concrete });
      boxes.push({ ...box(side < 0 ? inner.minX + 0.5 : inner.maxX - 0.5, cz + 1, 1, 6, 1.8, "platform"), color: concrete }); // deck
    }
    // a fun box in the middle with a rail on it, a grind rail, a kicker
    boxes.push({ ...box(cx, cz - 5.5, 4, 2.4, 0.4, "platform"), color: concrete });
    boxes.push({ ...box(cx, cz - 5.5, 3.6, 0.12, 0.35, "rim", 0.4), color: "#3a3444" });
    boxes.push({ ...box(cx - 2.6, cz - 5.5, 1.2, 2.4, 0.2, "ramp-step"), color: concrete }, { ...box(cx + 2.6, cz - 5.5, 1.2, 2.4, 0.2, "ramp-step"), color: concrete });
    boxes.push({ ...box(cx + 4, cz + 7, 6, 0.12, 0.35, "rim"), color: "#3a3444" });
    boxes.push({ ...box(cx - 4.5, cz + 7, 2, 2, 0.35, "ramp-step"), color: wood });
    boxes.push(box(inner.minX + 2.2, inner.minZ + 1.2, 3, 0.8, 0.5, "bench"));
    spawnAt(cx + 1, cz - 4.8, "yard", 0.4); spawnAt(cx + 5, cz - 1, "yard", 0.15); spawnAt(inner.minX + 2, cz + 2, "yard", 1.8);
  }
  // City Hall plaza (inside its U) and the Mayor's formal garden behind it, up to North Parade
  ground(LM.cityHall, "plaza", "#d8d0c4");
  blocks.push({ name: "City Hall plaza", rect: LM.cityHall, tier: 2, open: ["N", "S", "E", "W"] });
  ground(LM.garden, "plaza", "#cfc6b0");
  blocks.push({ name: "The Mayor's garden", rect: LM.garden, tier: 2, open: ["N", "S", "E", "W"] });
  for (const [x, z] of [[-12, 76], [12, 76], [0, 76]]) spawnAt(x, z, "plaza", 0.15);
  {
    decor.push({ kind: "grass", x: -12, z: 96, w: 16, d: 12, h: 0.17 }, { kind: "grass", x: 12, z: 96, w: 16, d: 12, h: 0.17 });
    // clipped hedges (low: hide behind them), two fountains, a plinth waiting for a statue, trees, benches
    for (const sx of [-1, 1]) {
      for (const x of [5, 7, 9, 15, 17, 19]) for (const z of [91, 101]) boxes.push({ ...box(sx * x, z, 2, 1.2, 1.1, "planter"), color: "#4f7a3a" });
      boxes.push(box(sx * 12, 96, 4.5, 4.5, 0.7, "fountain"));
      boxes.push(box(sx * 21.5, 90, 0.6, 0.6, 3, "tree"), box(sx * 21.5, 101.5, 0.6, 0.6, 3, "tree"));
      boxes.push(box(sx * 6, 96, 0.8, 3, 0.5, "bench"));
    }
    boxes.push({ ...box(0, 99, 2.4, 2.4, 1.6, "plinth"), sign: "RESERVED FOR THE NEXT MAYOR", face: [0, -1] });
    for (const [x, z] of [[-12, 93], [12, 99], [-18, 96], [18, 96], [0, 94]]) spawnAt(x, z, "plaza", 0.15);
  }

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
  for (const x of [65.5, 73.5]) spawnAt(x, 58.3, "street", 0.15); // (dropped chips outside the casino)
  shell(LM.museum, 12, "building", "#e8e2d4", "MUSEUM OF OLD STUFF", [0, -1]);
  for (const x of [-47, -44, -41, -38]) boxes.push({ ...box(x, 89.4, 0.8, 0.8, 9, "wall"), color: "#f4f1ea" });
  shell(LM.mall, 16, "building", "#ff8fa3", "LUXURY MALL: GOOCHY / PRADUH / VERSAYCHEE", [0, -1]);
  // the luxury apartment tower (a snooty doorman at the door, the valet's cars beside it)
  {
    const t = LM.tower;
    shell(t, 55, "tower", "#e8e2d4", "THE GILDED PIGEON RESIDENCES", [0, -1]);
    boxes.push({ ...box((t.minX + t.maxX) / 2, t.minZ - 1.2, 5, 2.4, 0.15, "slab", 3.4), color: "#6b1f2e" }); // canopy
    for (const x of [-79, -75]) boxes.push({ ...box(x, 88.6, 0.3, 0.3, 1.0, "wall"), color: "#d9a632" }); // velvet rope posts
    posts.push({ kind: "doorman", x: -77, z: 88.8, yaw: Math.PI });
    ["#6b4c9a", "#8a9a5b", "#ff7a1f"].forEach((c, i) => prop("car", i === 1 ? -64.5 : -68.5, i === 2 ? 97.5 : 92.5, 0, 1.9, 4.2, 1.5, { color: c }));
    boxes.push({ ...box(-64.5, 98.2, 1.0, 0.8, 1.1, "kiosk"), sign: "VALET (TIPS MANDATORY)", face: [0, -1] });
    spawnAt(-66.5, 100.5, "street", 0.15); spawnAt(-72, 101.2, "alley", 0.15);
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
  // THE SIDES: the rail yard (west) and the canal (east) run the full length of the city, fence to fence
  // =================================================================================================
  ground(R(-115, -95, -115, 115), "plaza", "#8e8478");
  ground(R(95, 99, -115, 115), "sidewalk"); ground(R(113, 115, -115, 115), "sidewalk");
  ground(R(99, 113, 104, 115), "sidewalk");
  ground(R(-95, 95, 112, 115), "sidewalk");
  blocks.push({ name: "Rail yard", rect: R(-115, -95, -115, 115), tier: 1, open: ["N", "S", "E", "W"] });
  blocks.push({ name: "Canal side", rect: R(95, 115, -115, 115), tier: 1, open: ["N", "S", "E", "W"] });
  // --- build yard (south end): an open lot. The movement tests + tutorials use it, so it stays clear. ---
  const T = { x: -97.5, z: -62 };
  boxes.push(box(-110, -91.5, 1.3, 1.3, 2.4, "portaloo"));
  boxes.push(box(-104, -91.5, 2.0, 1.4, 1.6, "mixer"));
  boxes.push(box(-99, -91.5, 1.2, 1.2, 0.5, "pallet"));
  boxes.push({ ...box(-114.6, -66, 0.6, 40, 2.6, "fence"), sign: "BUILD YARD: KEEP OUT (OR DON'T)", face: [1, 0] });
  for (const [x, z] of [[-110, -50], [-102, -78]]) spawnAt(x, z, "yard", 0.15);
  // --- the junkyard (C4b: the old tutorial ledges and crawl tunnel are gone; the browser tests climb the
  //     freight loading dock and crawl the sewer pipe instead) ---
  const dock = R(-99, -96, 8, 16);
  boxes.push({ ...box((dock.minX + dock.maxX) / 2, (dock.minZ + dock.maxZ) / 2, dock.maxX - dock.minX, dock.maxZ - dock.minZ, 1.4, "platform"), color: "#6b5a4a", sign: "FREIGHT DOCK", face: [1, 0] });
  spawnAt(-97.5, 12, "yard", 1.4);
  for (const [x, z, w, d, h] of [[-113, -37, 3, 3, 1.6], [-99, -39, 2, 4, 1.1], [-113, -25, 3, 2, 2.2], [-98.5, -22, 2.4, 2, 1.3], [-100, -12, 2, 3, 1.8], [-112, -9, 4, 2, 1.3]]) boxes.push(box(x, z, w, d, h, "junk"));
  spawnAt(-106, -24, "yard", 0.15); spawnAt(-112, -14, "yard", 0.15);
  // --- tracks, boxcars, the railway arches ---
  // (C1.1: the tracks run the whole length of the rail yard, from the station down to the siding by the forts)
  scenery.push({ kind: "rail", x: -106, z: -25.5, d: 179 }, { kind: "rail", x: -101, z: -25.5, d: 179 });
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

  // --- the siding at the south end: abandoned boxcars under the highway, next to the west fort ---
  boxes.push({ ...box(-106, -104, 3, 12, 3.2, "building"), color: "#8a4a3a", sign: "TRASHINGTON FREIGHT (RETIRED)", face: [1, 0] });
  boxes.push({ ...box(-101, -99, 3, 12, 3.2, "building"), color: "#3d6f5a" });
  boxes.push(box(-98.4, -101, 1.4, 1.4, 1.5, "crate"), box(-103.4, -110.5, 1.2, 1.2, 1.2, "crate"));
  spawnAt(-106, -104, "rooftop", 3.2); spawnAt(-101, -99, "rooftop", 3.2); spawnAt(-103.5, -106, "alley", 0.15);

  // --- the canal: deep water, a kerb all along both banks, ladders to climb out, 2 footbridges,
  //     the marina (north end), the sewer outfall with a crawl pipe (south end) ---
  const CANAL = R(99, 113, -108, 104);
  deepWater.push(CANAL);
  scenery.push({ kind: "canal", x: (CANAL.minX + CANAL.maxX) / 2, z: (CANAL.minZ + CANAL.maxZ) / 2, w: CANAL.maxX - CANAL.minX, d: CANAL.maxZ - CANAL.minZ });
  const bridgesZ = [-60, 30];
  const laddersW = [-95, -72, -45, -20, 5, 55, 105 - 20], laddersE = [-85, -25, 60];
  const docksZ = [70, 82, 94];
  const gapsW = [...bridgesZ.map((z) => [z - 1.5, z + 1.5]), ...laddersW.map((z) => [z - 0.7, z + 0.7]), ...docksZ.map((z) => [z - 0.9, z + 0.9])];
  const gapsE = [...bridgesZ.map((z) => [z - 1.5, z + 1.5]), ...laddersE.map((z) => [z - 0.7, z + 0.7])];
  const kerb = (x: number, gaps: number[][]) => {
    const g = [...gaps].sort((p, q) => p[0] - q[0]);
    let z0 = CANAL.minZ;
    for (const [a, b] of [...g, [CANAL.maxZ, CANAL.maxZ]]) {
      if (a - z0 > 0.2) boxes.push({ ...box(x, (z0 + a) / 2, 0.4, a - z0, 1.0, "wall"), color: "#8e8a94" });
      z0 = Math.max(z0, b);
    }
  };
  kerb(CANAL.minX - 0.2, gapsW); kerb(CANAL.maxX + 0.2, gapsE);
  boxes.push({ ...box(106, CANAL.maxZ + 0.2, 14.8, 0.4, 1.0, "wall"), color: "#8e8a94" });
  for (const z of laddersW) scenery.push({ kind: "ladder", x: CANAL.minX + 0.15, z, yaw: Math.PI / 2 });
  for (const z of laddersE) scenery.push({ kind: "ladder", x: CANAL.maxX - 0.15, z, yaw: -Math.PI / 2 });
  for (const z of bridgesZ) {
    boxes.push({ ...box(106, z, 14.8, 2.6, 0.2, "slab", 0.4), color: "#a8743f" });
    for (const s of [-1, 1]) boxes.push({ ...box(106, z + s * 1.25, 14.8, 0.1, 0.9, "wall", 0.6), color: "#6b4a2b" });
    for (const x of [CANAL.minX - 0.3, CANAL.maxX + 0.3]) boxes.push({ ...box(x, z, 0.6, 2.4, 0.35, "step"), color: "#8e8a94" });
  }
  // marina (north end): docks, yachts, the office
  for (const z of docksZ) boxes.push({ ...box(103, z, 8, 1.6, 0.4, "dock"), color: "#8b5a2b" });
  for (const [z, name] of [[76, "SS TAX WRITE-OFF"], [88, "YACHT-A-LOT"], [99, ""]] as [number, string][]) {
    boxes.push({ ...box(109.5, z, 3, 8, 2.2, "van"), color: "#f4f1ea", ...(name ? { sign: name, face: [-1, 0] as [number, number] } : {}) });
  }
  spawnAt(106, 70.5, "yard", 0.55); spawnAt(106, 94.5, "yard", 0.55); spawnAt(106, 82.5, "yard", 0.55);
  for (const [x, z] of [[97, 102], [97, 88], [106, 112]]) spawnAt(x, z, "street", 0.15);
  shell(R(97, 101, 104.5, 110), 3.2, "building", "#43a7c7", "MARINA OFFICE", [-1, 0]);
  // sewer outfall (south end): a concrete block with a pipe you crawl into from the quay. A stash inside,
  // and a hole on the far side where you drop out into the canal
  {
    const g = "#8e8a94", y1 = 1.3, top = 4;
    boxes.push({ ...box(106, -114.2, 14, 1.6, top, "wall"), color: g });
    boxes.push({ ...box(103.5, -108.8, 9, 1.6, top, "wall"), color: g, sign: "SEWER OUTFALL (DO NOT DRINK)", face: [0, 1] });
    boxes.push({ ...box(111.5, -108.8, 3, 1.6, top, "wall"), color: g });
    boxes.push({ ...box(106, -111.5, 14, 3.8, top - y1, "slab", y1), color: g });
    boxes.push({ ...box(112.8, -111.5, 0.4, 3.8, y1, "wall"), color: g }); // the pipe's dead end
    boxes.push({ ...box(106, -111.5, 14, 3.8, 0.03, "shopfloor"), color: "#5a5163" }); // (slimy floor)
    spawnAt(104, -111.5, "alley", 0);
  }
  for (const [x, z] of [[97, -100], [97, -40], [114, 10]]) spawnAt(x, z, "street", 0.15);

  // =================================================================================================
  // TENT TOWN under the highway, between the railway and the canal: four open fort yards (no walls:
  // walls are bought in the upgrades), evenly spaced, junk clusters between them, the broken ramp lookout
  // =================================================================================================
  ground(R(-95, 95, -115, -93), "plaza", "#9a8a6e");
  blocks.push({ name: "Tent Town", rect: R(-95, 95, -115, -93), tier: 0, open: ["N", "S", "E", "W"] });
  // the highway deck on pillars (10 m up), right across, over the railway and the canal too
  boxes.push({ ...box(0, (HIGHWAY.z0 + HIGHWAY.z1) / 2, 232, HIGHWAY.z1 - HIGHWAY.z0, HIGHWAY.h, "slab", HIGHWAY.y), color: "#8e8a94", sign: "INTERSTATE 0", face: [0, 1] });
  scenery.push({ kind: "highway", x: 0, z: (HIGHWAY.z0 + HIGHWAY.z1) / 2, w: 232, d: HIGHWAY.z1 - HIGHWAY.z0, h: HIGHWAY.y + HIGHWAY.h });
  for (const x of [-47.5, 0, 47.5]) for (const z of [-98.5, -107.5]) boxes.push({ ...box(x, z, 1.8, 1.8, HIGHWAY.y, "wall"), color: "#9aa3b5" });
  for (const [x, z] of [[-113.5, -98.5], [-113.5, -107.5], [106, -99], [106, -104]]) boxes.push({ ...box(x, z, 1.6, 1.6, HIGHWAY.y, "wall"), color: "#9aa3b5" }); // bridge piers
  // the broken ramp: a stepped concrete ramp you can run up to a lookout that ends in mid-air
  for (let i = 1; i <= 26; i++) boxes.push({ ...box(-12 + (i - 0.5) * 0.5, -112.5, 0.5, 1.8, i * 0.3, "ramp-step"), color: "#9aa3b5" });
  boxes.push({ ...box(2.5, -112.5, 3, 1.8, 7.8, "platform"), color: "#9aa3b5" });
  spawnAt(2.5, -112.5, "rooftop", 7.8);
  const forts: FortLot[] = [];
  const C = COMPOUND;
  C.xs.forEach((cx, slot) => {
    const fortBox = box(cx, C.z0 + 3.5, 2.4, 1.9, 1.5, "fort");
    boxes.push(fortBox);
    const zone = R(cx - C.half, cx + C.half, C.z0, C.z1);
    forts.push({ slot, x: cx, z: fortBox.z, padX: cx, padZ: C.z0 + 9.5, yaw: 0, zone, backX: cx, backZ: C.z0 - 2 });
  });
  // junk clusters between the yards (cover + climbing, so raids aren't a straight run)
  const junk = (x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "junk", color?: string) => boxes.push({ ...box(x, z, w, d, h, kind), ...(color ? { color } : {}) });
  for (const cx of [-47.5, 47.5]) {
    junk(cx - 5, -101, 3, 2.4, 1.4, "junk", "#3d6fb5"); // tents
    junk(cx + 4.5, -104, 2.6, 2.6, 1.3, "junk", "#6aa84f");
    junk(cx - 3, -110.5, 2, 2, 1.1, "crate");
    junk(cx + 5, -97.5, 1.2, 1.2, 0.9, "crate");
    junk(cx - 6, -95.5, 1.2, 1.2, 0.5, "pallet");
    prop("bin", cx + 2.5, -99.5, 0, 0.7, 0.7, 1.0); // burning barrel
    spawnAt(cx, -103, "yard", 0.15); spawnAt(cx - 4, -106.5, "yard", 0.15);
  }
  for (const [x, z, w, d, h, c] of [[-10, -100.5, 3, 2.4, 1.4, "#e14b4b"], [9, -100, 2.6, 2.6, 1.3, "#ffcf3a"], [5, -107, 3, 2, 1.1, "#43c7a6"], [-7, -107.5, 2, 2, 1.5, ""], [10, -109.5, 1.2, 1.2, 0.9, ""]] as [number, number, number, number, number, string][]) junk(x, z, w, d, h, c ? "junk" : "crate", c || undefined);
  for (const [x, z] of [[-3, -103], [4, -97], [-8, -104]]) spawnAt(x, z, "yard", 0.15);
  for (const [x, z] of [[-36, -97], [36, -97], [-86, -97], [86, -97]]) spawnAt(x, z, "street", 0.15);
  for (const x of [-84, -47.5, -12, 12, 47.5, 84]) decor.push({ kind: "streetlight", x, z: -94.2 });

  // =================================================================================================
  // THE POLICE PRECINCT, Market Row by the east road and the canal, front door on the south street
  // =================================================================================================
  const station = (() => {
    const P0 = LM.precinct, PD_H = 4.5, D = P0.maxZ - P0.minZ, zf = P0.minZ;
    const x0 = P0.minX, x1 = P0.maxX, pdX = (x0 + x1) / 2, pdZ = (P0.minZ + P0.maxZ) / 2;
    const V = (v: number) => zf + v; // v = metres in from the front
    const pdWall = "#2f3a5c";
    const wall = (x: number, z: number, w: number, d: number, h = PD_H, baseY = 0, kind: Box["kind"] = "wall", color = pdWall) =>
      boxes.push({ ...box(x, z, w, d, h, kind, baseY), color });
    wall(x0 + 1.5, V(0), 3, 0.4); // front wall, left of the door (door: x0+3 .. x0+6)
    wall((x0 + 6 + x1) / 2, V(0), x1 - x0 - 6, 0.4); // right of the door
    wall(x0 + 4.5, V(0), 3, 0.4, PD_H - 2.7, 2.7); // over the door
    wall(pdX, V(D), x1 - x0 + 0.4, 0.4); // back wall
    wall(x0, pdZ, 0.4, D); wall(x1, pdZ, 0.4, D);
    boxes.push({ ...box(pdX, pdZ, x1 - x0 + 0.4, D + 0.4, 0.3, "roof", PD_H), sign: "TRASHINGTON PD", face: [0, -1], color: "#1f2944" });
    boxes.push({ ...box(pdX, pdZ, x1 - x0 - 0.4, D - 0.4, 0.03, "shopfloor"), color: "#c9ccd6" });
    boxes.push({ ...box(x0 + 11.5, V(4.6), 8, 0.9, 1.1, "counter"), color: "#5a4632" }); // front desk
    const cellV0 = D - 6, cellV1 = D - 0.2, cellW = (x1 - x0 - 0.4) / 4;
    const cells: NonNullable<ArenaLayout["station"]>["cells"] = [];
    for (let i = 0; i < 4; i++) {
      const cx0 = x0 + 0.2 + i * cellW, cx1 = cx0 + cellW, cx = (cx0 + cx1) / 2;
      if (i > 0) wall(cx0, V((cellV0 + cellV1) / 2), 0.3, cellV1 - cellV0);
      boxes.push({ ...box(cx, V(cellV0), cellW - (i > 0 ? 0.3 : 0), 0.2, PD_H, "bars"), color: "#8e96a8" });
      boxes.push({ ...box(cx, V(D - 0.9), 2.2, 0.8, 0.45, "bench"), color: "#6b4a2b" });
      cells.push({ x: cx, z: V(D - 3.3), yaw: Math.PI, rect: { minX: cx0 + 0.6, maxX: cx1 - 0.6, minZ: V(cellV0 + 0.5), maxZ: V(cellV1 - 0.6) } });
    }
    // two cruisers parked in the lot behind (side on)
    const lot = LM.copLot, lz = (lot.minZ + lot.maxZ) / 2;
    for (const x of [lot.maxX - 3, lot.maxX - 8]) { boxes.push(box(x, lz, 4.2, 1.9, 1.5, "car")); decor.push({ kind: "copcar", x, z: lz, yaw: Math.PI / 2 }); }
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
    // (C4b: movement-test spots on real city things: the 1.4 m freight dock, the sewer outfall's crawl pipe)
    ledge14: { x: -97.5, z: dock.minZ - 2.2, yaw: 0, frontZ: dock.minZ },
    lobby: { x: 0, z: -124.6, yaw: 0, y: 26 }, // (C5a: where you wake up in the squat)
    pitWall: { x: -78, z: -52 - 4 - 0.3 - 0.25 - 1.1, yaw: 0, faceZ: -52 - 4 - 0.3 - 0.25 }, // (C4b: in front of THE PIT's back graffiti wall)
    tunnelEntrance: { x: 94, z: -111.5, yaw: Math.PI / 2, roofStartX: 99, roofEndX: 112.6 },
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
    pondEdge: { x: 10, z: pond.minZ - 2.5, yaw: 0, waterZ: pond.minZ },
    parkCentre: { x: 0, z: -8, yaw: 0 },
    // C3: a bush to hide in, the fountain
    bush: { x: (bushes[0].minX + bushes[0].maxX) / 2, z: (bushes[0].minZ + bushes[0].maxZ) / 2, yaw: 0 },
    fountain: { x: 0, z: -2.2, yaw: 0 },
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

  // C4b: the laundromat's washers and dryers (the tall ones are dryers stacked on washers)
  {
    let nw = 0, nd = 0;
    for (const b of boxes) {
      if (b.kind !== "washer" || b.unit === undefined) continue;
      const dryer = b.h > 1.5;
      props.push({ id: dryer ? "dryer" + ++nd : "washer" + ++nw, kind: dryer ? "dryer" : "washer", x: b.x, y: 0, z: b.z, yaw: 0, hw: b.w / 2, hd: b.d / 2 });
    }
  }

  // =================================================================================================
  // C5a: THE SQUAT: the lobby. A condemned tenement just past the south fence; its roof (26 m up, looking
  // north over the whole city to Uptown's towers) is a cardboard camp where you wait for the match.
  // =================================================================================================
  let lobby: LobbyDef;
  {
    const Y = 26, roof = R(-15, 15, -140, -120);
    const cx = 0, cz = -130;
    // the building (a real box: you could stand on its roof even without the deck)
    boxes.push({ ...box(cx, cz, roof.maxX - roof.minX, roof.maxZ - roof.minZ, Y, "building"), color: "#6e4a3a", windows: true, face: [0, 1] });
    // parapet all round, and a tall chain-link fence on it (see-through; too high to climb)
    const wall = (x: number, z: number, w: number, d: number, h: number, base: number, kind: Box["kind"], extra: Partial<Box> = {}) => boxes.push({ ...box(x, z, w, d, h, kind, base), ...extra });
    for (const [x, z, w, d] of [[cx, roof.maxZ - 0.2, 30, 0.4], [cx, roof.minZ + 0.2, 30, 0.4], [roof.minX + 0.2, cz, 0.4, 20], [roof.maxX - 0.2, cz, 0.4, 20]]) {
      wall(x, z, w, d, 1.0, Y, "wall", { color: "#8a6a58" });
      wall(x, z, w, d * 0.25 + 0.02, 2.9, Y + 1.0, "fence", { chain: true });
    }
    // Uncle Dumpster's camp round a burning barrel: a sagging couch, crate seats, tarp tents, box huts
    const fire = { x: 0, z: -129 };
    wall(fire.x, fire.z, 0.7, 0.7, 1.0, Y, "crate", { hide: true });
    wall(0, -131.6, 2.6, 0.9, 0.5, Y, "sofa", { color: "#7a4f8f" });
    for (const [x, z] of [[-2.7, -128.9], [2.5, -129.2]]) wall(x, z, 0.6, 0.6, 0.45, Y, "crate", { color: "#a8743f" });
    const tents = [
      { x: -11.5, z: -124.3, w: 3.2, d: 2.6, yaw: 0, color: "#3f7fc9" },
      { x: -11.5, z: -129.0, w: 3.2, d: 2.6, yaw: 0, color: "#d8542c" },
      { x: 11.8, z: -137.6, w: 3.2, d: 2.4, yaw: Math.PI, color: "#4f9a3a" },
    ];
    for (const t of tents) wall(t.x, t.z, t.w, t.d, 1.5, Y, "crate", { hide: true });
    // the water tank on its stand, with the painted city map across the front
    const tank = { x: -11.5, z: -136.6 };
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) wall(tank.x + dx, tank.z + dz, 0.25, 0.25, 3.2, Y, "wall", { color: "#5a4636" });
    wall(tank.x, tank.z, 3.6, 3.6, 3.4, Y + 3.2, "wall", { hide: true });
    const map = { x: tank.x, y: Y + 2.4, z: tank.z + 1.95, w: 6.2, h: 4.2, yaw: 0 };
    wall(map.x, map.z - 0.08, map.w, 0.16, map.h, map.y - map.h / 2, "wall", { hide: true });
    // practice corner: a punching dummy, crates to climb, a wall to tag
    prop("dummy", 8.8, -137.2, 0, 0, 0, 0, { y: Y });
    wall(8.8, -137.2, 0.5, 0.5, 1.8, Y, "crate", { hide: true });
    wall(13.2, -133.6, 1.2, 1.2, 1.0, Y, "crate", { color: "#a8743f" });
    wall(13.2, -132.2, 1.2, 1.4, 1.6, Y, "crate", { color: "#9a6a3c" });
    wall(13.2, -130.6, 1.2, 1.6, 2.2, Y, "crate", { color: "#8e5f35" });
    wall(-2.5, -139.2, 6, 0.4, 2.6, Y, "wall", { color: "#9a948c", sign: "TAG PRACTICE", face: [0, 1] });
    // THROW-O-MATIC: a lane along the east side, three targets on the fence, a rack of bin lids
    prop("throwgame", 8.6, -123.6, -Math.PI / 2, 0, 0, 0, { y: Y });
    wall(8.6, -123.6, 0.9, 0.9, 1.6, Y, "crate", { hide: true });
    const targets = [
      { id: "tgt1", x: 14.35, y: Y + 1.7, z: -124.8, r: 0.75, yaw: -Math.PI / 2 },
      { id: "tgt2", x: 14.35, y: Y + 2.6, z: -127.4, r: 0.6, yaw: -Math.PI / 2 },
      { id: "tgt3", x: 14.35, y: Y + 1.4, z: -129.8, r: 0.5, yaw: -Math.PI / 2 },
    ];
    for (const t of targets) wall(t.x + 0.12, t.z, 0.1, t.r * 2.1, t.r * 2.1, t.y - t.r * 1.05, "wall", { hide: true });
    // TROLLEY GRAND PRIX: four cones round the camp; start/finish by the starter's post
    const race = [{ x: -5.2, z: -122.9, r: 2.2 }, { x: 5.8, z: -122.9, r: 2.2 }, { x: 5.8, z: -134.6, r: 2.2 }, { x: -5.2, z: -134.6, r: 2.2 }];
    prop("racegame", -7.2, -122.4, Math.PI, 0, 0, 0, { y: Y });
    wall(-7.2, -122.4, 0.3, 0.3, 1.6, Y, "wall", { hide: true });
    // the locked stairwell hut, the pigeon coop, two cardboard huts (drawn by the renderer)
    wall(-7.2, -138.2, 2.4, 2.4, 2.6, Y, "wall", { hide: true });
    wall(13.3, -122.4, 1.6, 1.0, 1.1, Y, "wall", { hide: true });
    wall(-13.2, -121.8, 1.6, 1.1, 1.15, Y, "crate", { hide: true });
    wall(-8.6, -121.6, 1.2, 1.1, 1.15, Y, "crate", { hide: true });
    // where you wake up: in a row facing the view
    const spawnsL = [-1.5, 0, 1.5, 3, -3, 4.5, -4.5, 6].map((x) => ({ x, z: -124.6, yaw: 0 }));
    posts.push({ kind: "uncle_dumpster", x: 2.6, z: -127.2, yaw: 0, y: Y });
    lobby = {
      rect: roof, y: Y, spawns: spawnsL, map, race, targets, tents, fire,
      pile: { x: 3.6, z: -138.2 }, lids: { x: 10.4, z: -122.4 },
      trolleys: [{ x: -3.2, z: -121.3 }, { x: -1.2, z: -121.3 }], cans: { x: -2.5, z: -138.3 },
    };
  }

  // C4a: street things you can smash, one prop per box (shop windows, bus-stop glass, hydrants, mailboxes,
  // benches, planters, café and picnic tables, pallets). Broken = the box stops blocking until dawn.
  {
    const BREAK: Partial<Record<Box["kind"], PropKind>> = { glass: "shopglass", busstop: "busstop", hydrant: "hydrant", mailbox: "mailbox", bench: "bench", planter: "planter", table: "table", pallet: "pallet" };
    const nb: Record<string, number> = {};
    boxes.forEach((b, i) => {
      const k = BREAK[b.kind];
      if (!k || b.y - b.h / 2 > 0.5) return; // (ground level only)
      if (b.unit !== undefined && k !== "shopglass") return; // (furniture inside shops waits for C6's interiors)
      const shop = k === "shopglass" ? (units.find((u) => inRect(u.rect, b.x, b.z, 0.6))?.shop ?? undefined) : undefined;
      nb[k] = (nb[k] ?? 0) + 1;
      props.push({ id: k + nb[k], kind: k, x: b.x, y: 0, z: b.z, yaw: 0, box: i, hw: b.w / 2, hd: b.d / 2, ...(shop !== undefined ? { shop } : {}) });
    });
  }

  // C4a: street junk spots. Each is checked to be clear ground (not in anything, not on a road, not in water).
  const junkSpots: NonNullable<ArenaLayout["junkSpots"]> = [];
  {
    const clear = (x: number, z: number, r: number) => {
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return false;
      if (roads.some((q) => inRect(q, x, z, r)) || water.some((q) => inRect(q, x, z, r)) || deepWater.some((q) => inRect(q, x, z, r))) return false;
      if (Math.hypot(x, z) > RING.r0 - r && Math.hypot(x, z) < RING.r1 + r) return false;
      for (const b of boxes) {
        const top = b.y + b.h / 2, bot = b.y - b.h / 2;
        if (top <= 0.3 || bot > 2) continue; // (pavements, overheads)
        if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return false;
      }
      return !junkSpots.some((j) => Math.hypot(j.x - x, j.z - z) < r + 0.35);
    };
    /** try a spot, and a few nudges round it */
    const put = (type: string, x: number, z: number, r: number, yaw = 0) => {
      for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [1.4, 1.4], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4]]) {
        if (clear(x + dx, z + dz, r)) { junkSpots.push({ type, x: x + dx, z: z + dz, yaw }); return true; }
      }
      return false;
    };
    // chairs beside the outdoor café and picnic tables, lids beside the bins
    for (const b of boxes) if (b.kind === "table" && b.unit === undefined && b.y - b.h / 2 < 0.5) put("cafe_chair", b.x + b.w / 2 + 0.6, b.z, 0.35, Math.PI / 2);
    for (const pr of props) if (pr.kind === "bin") put("bin_lid", pr.x + 0.9, pr.z + 0.4, 0.32);
    // bottles in the alleys, crates by the courtyard dumpsters
    loot.filter((l) => l.zone === "alley").slice(0, 12).forEach((l, i) => put("glass_bottle", l.x + (i % 2 ? 0.7 : -0.7), l.z + 0.6, 0.12));
    for (const pr of props) if (pr.kind === "dumpster") put("plastic_crate", pr.x + 2.2, pr.z, 0.6);
    // the building site by the half-built skyscraper: bricks, a barrier; the build yard: barriers, barrels
    for (let i = 0; i < 6; i++) put("brick", 41 + (i % 3) * 0.7, -62 - Math.floor(i / 3) * 0.7, 0.12, i * 0.7);
    put("traffic_barrier", 42, -83, 0.45); put("traffic_barrier", T.x - 4, T.z + 12, 0.45, Math.PI / 2);
    for (const [x, z] of [[-110, -44], [-99, -46], [-111, -5], [-98, -3]]) put("oil_barrel", x, z, 0.55);
    // trolleys outside Corner Mart
    const mart = units[0];
    for (const s2 of [-1.6, 1.6]) put("shopping_trolley", mart.doorX + mart.out[0] * 2.4 - mart.out[1] * s2, mart.doorZ + mart.out[1] * 2.4 + mart.out[0] * s2, 0.6, Math.atan2(mart.out[0], mart.out[1]));
    // C4b: spray cans: in the skate park, a few alleys, the build yard, under the railway arches
    for (const [x, z] of [[(pit.minX + pit.maxX) / 2 - 3, pit.maxZ - 5.5], [(pit.minX + pit.maxX) / 2 + 2, (pit.minZ + pit.maxZ) / 2 - 1], [pit.minX + 5.5, pit.minZ + 6], [-109, 10], [-109, 42]]) put("spray_can", x, z, 0.1);
    [[6, 8], [-6, 6], [4, -6], [-4, -8], [8, 0], [0, 10]].some(([dx, dz]) => put("spray_can", T.x + dx, T.z + dz, 0.1));
    loot.filter((l) => l.zone === "alley").filter((_, i) => i % 3 === 1).forEach((l) => put("spray_can", l.x - 0.9, l.z - 0.9, 0.1));
    // fish at the Market Row stalls and the marina
    for (const [x, z] of [[50, -11.5], [60, -11.5], [97, 75], [97, 88]]) put("smelly_fish", x, z, 0.15);
  }

  return {
    halfSize: HALF, boxes, spawns, lootSpawns: loot, forts, landmarks, roads, roadRings, crosswalks, navLines, navLinesZ, props,
    shops, truckRoutes, happyZones, airdropSpots, decor, station, roadGraph, water, navChains, units,
    roadNet, blocks, scenery, posts, deepWater, bushes, pondShape, junkSpots, lobby, chinatown, bank, statue,
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
      // (C4b: a row of plastic seats to wait on, a soap shelf, laundry baskets)
      F(-4.4, 1.9, 1.6, 0.5, 0.45, "chair");
      F(6.3, 2.6, 0.5, 1.4, 1.6, "shelf");
      F(-3.3, 8.1, 1.8, 0.6, 0.3, "cage");
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
