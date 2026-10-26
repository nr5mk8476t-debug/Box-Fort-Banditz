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
  box, polyBox, footSd, inFoot, tierAt, inRect, segDist, type Box, type ArenaLayout, type FeverDef, type FeverArc, type SpawnPoint, type FortLot, type LootZone, type PropDef, type PropKind, type DealKind,
  CLUB, type Rect, type ShopDef, type ShopType, type UnitDef, type RoadNet, type RoadNode, type RoadEdge, type BlockDef, type LobbyDef, type HotShop, type StationDef,
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

/**
 * Which city buildTrashington builds. "classic" = the city up to C5c.3 (its landmarks, still used by their
 * tests); "new" = the R3 redesign (Blake, 2026-10-08): mirrored left / right, the forts on a curve so all four
 * are the same walk from the town centre, the top road gone for big landmark lots, angled buildings along the
 * diagonals and round the roundabout, every road named. Set it before building.
 */
export type CityMap = "classic" | "new";
let CITY_MAP: CityMap = "new"; // (R3: the new city is the real one now; the classic city stays for its tests)
export function setCityMap(m: CityMap) { CITY_MAP = m; }
export function cityMap(): CityMap { return CITY_MAP; }
/** R3: the new city's road lines (x of the edge roads and the avenues, z of the east-west streets) */
export const NEW = {
  /** Lefty Lane / Righty Lane */
  edge: 109,
  /** Leftovers Avenue / Write-Off Avenue: centred between each pair of forts */
  inner: 66.33,
  /** Snob Row: the top road, along the landmark lots */
  snob: 72,
  /** Bin Juice Boulevard: the diagonals leave from its ends */
  binJuice: 45,
  /** Shopping Trolley Terrace */
  trolley: -53,
  /** Gahookz Ghetto Lane: along the top of the fort bowl */
  gahookz: -89,
};
/** R3: the four forts on a curve (slot 0 / 1 = the outer two, 2 / 3 = the middle two), evenly spaced across.
 *  The middle two sit deeper so every fort is the same walk from the roundabout (tuned by the layout test). */
export const NEW_FORTS = { xs: [-99.5, 99.5, -33.17, 33.17], zs: [-102, -102, -112.3, -112.3], half: 8, depth: 15 };
/** R3: the police station (centre of the first long block in the low end). R7: it runs right through the block, from
 *  Shopping Trolley Terrace (its front door) to Gahookz Ghetto Lane (the back, where you come out after a jailbreak) */
const NEW_PRECINCT: Rect = { minX: -10, maxX: 10, minZ: -82.4, maxZ: -59.5 };
/** R7: the left pawn shop's plot (where Hat Hut was), its front on the Gahookz Ghetto Lane pavement; the right one is
 *  its mirror image. Its door is at the Leftovers Avenue end, so both left forts are about the same walk from it. */
export const HOT_PLOT: Rect = { minX: -59.6, maxX: -47.2, minZ: -82.4, maxZ: -71.6 };
const MID_WALL_Z = (NEW.gahookz + 4 + NEW.trolley - 4) / 2;
const PLOT_X = 11.3; // (R5/R6: the clear plot for the station and the pawn shop: x within this)

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
/** R4: Little Italy's shops (parodies) and Chinatown's (name, second sign in Chinese, wall, roof) */
const ITALY_SHOPS = ["MAMMA MIA-ISH", "PASTA LA VISTA", "PIZZA THE ACTION", "CANNOLI BELIEVE IT", "SPAGHETT ABOUT IT", "NONNA KNOWS BEST", "ESPRESSO YOURSELF",
  "MOZZARELLA FELLAS", "GNOCCHI GNOCCHI", "LASAGNA LAND", "TORTELLINI TOWERS", "RAVIOLI RAVIOLI", "THE MEATBALL MAN", "CAFE CAPPUCCI-NO", "LITTLE TONY'S TAILORS", "SALAMI & SONS"];
const CHINA_SHOPS: [string, string, string, string][] = [
  ["DUMPLING DYNASTY", "饺子馆", "#b8322c", "#3f7f4f"], ["LUCKY NOODLE BAR", "面馆", "#e8d8b0", "#b8322c"], ["GOLDEN LEAF TEA HOUSE", "茶楼", "#3d8f6a", "#d8742c"],
  ["JADE HERBAL SHOP", "药材", "#8e1f2e", "#3f7f4f"], ["GOLDEN MOON BAKERY", "饼家", "#c98a2a", "#b8322c"], ["TRIPLE HAPPY GROCER", "杂货", "#b8322c", "#d8742c"],
  ["WOK AND ROLL", "炒锅", "#e8d8b0", "#3f7f4f"], ["BAO DOWN", "包子", "#3d8f6a", "#b8322c"], ["NOODLE ME THIS", "面条", "#8e1f2e", "#d8742c"],
  ["LUCKY DRAGON KARAOKE", "卡拉OK", "#b8322c", "#3f7f4f"], ["TEA-RIFIC", "茶", "#c98a2a", "#3f7f4f"], ["DIM SUM DUMB SUM", "点心", "#e8d8b0", "#b8322c"],
  ["KUNG FU-D", "功夫", "#8e1f2e", "#3f7f4f"], ["GOLDEN WOK", "金锅", "#3d8f6a", "#d8742c"], ["MOONCAKE MOON", "月饼", "#c98a2a", "#b8322c"], ["PEKING DUCK-ISH", "烤鸭", "#b8322c", "#d8742c"],
];
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
  pawn: ["gold_chain", "guitar", "sunglasses", "golden_spork", "snow_globe", "mixtape", "crt_tv", "award_trophy", "vinyl_record", "rolecks_watch"],
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
  layout?: "shelves" | "food" | "arcade" | "laundry" | "thrift" | "jeweller" | "barber" | "office" | "apart" | "pawn";
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
  // (C5c.3: THE DIVE's empty shutter is now PAWN-O-RAMA; the bar comes back with Night & Life)
  pawn: { name: "PAWN-O-RAMA", use: "shop", type: "pawn", layout: "pawn", backroom: true, upper: "apart", access: "fire", wall: "#b8862f", floor: "#d9cfb8" },
  lawyers: { name: "LAWYERS 4 LESS", use: "lobby", layout: "office", upper: "office", access: "inside", wall: "#4a5a6b", floor: "#d8d4cc" },
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
  /** C5c.3: built separately (a landmark took the block): only keeps the random sequence in step */
  phantom?: boolean;
}

export function buildTrashington(): ArenaLayout {
  const R2 = CITY_MAP === "new"; // (R3: the new city; "R2" named it while it was the road test)
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
  let pawnShop: ArenaLayout["pawnShop"];
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
    if (spec.layout === "pawn") {
      // C5c.3: PAWN-O-RAMA: the pawn case by the window, Sal's counter (ring the bell), Big Vinnie by the guitars
      const [kx, kz] = P(-5.2, 2.0), [qx, qz] = P(3.0, 3.5), [vx, vz] = P(-2.6, 6.4);
      props.push({ id: "pawncase1", kind: "pawncase", x: kx, y: 1.05, z: kz, yaw: yawOut, hw: alongX ? 0.5 : 1.7, hd: alongX ? 1.7 : 0.5 });
      props.push({ id: "pawncounter1", kind: "pawncounter", x: qx, y: 1.05, z: qz, yaw: yawOut });
      posts.push({ kind: "vinnie", x: vx, z: vz, yaw: yawOut });
      pawnShop = { unit: uid, shop: shopId, caseX: kx, caseY: 1.05, caseZ: kz, yaw: yawOut };
    }
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
  if (R2) {
    // ---- R3: the new city (Blake's drawing, mirrored and named) ----
    const { edge: E, inner: I, snob: SN, binJuice: BJ, trolley: TT, gahookz: GZ } = NEW;
    const ringAt = (deg: number): [number, number] => [Math.round(Math.cos((deg * Math.PI) / 180) * RR * 100) / 100, Math.round(Math.sin((deg * Math.PI) / 180) * RR * 100) / 100];
    // the diagonals run straight at the middle of the roundabout from the avenue corners, so they meet the ring square on
    const fork = (Math.atan2(BJ, I) * 180) / Math.PI;
    const [qx, qz] = ringAt(fork);
    const ring: [number, number][] = [[RR, 0], [qx, qz], [0, RR], [-qx, qz], [-RR, 0], [0, -RR]];
    for (const [x, z] of ring) nd(x, z, "round");
    for (const x of [-I, I]) for (const z of [BJ, 0, TT]) nd(x, z, "light");
    nd(0, BJ, "light");
    path([[-E, GZ], [-E, 0], [-E, SN]], 4, "Lefty Lane");
    path([[E, GZ], [E, 0], [E, SN]], 4, "Righty Lane");
    path([[-E, GZ], [-I, GZ], [I, GZ], [E, GZ]], 4, "Gahookz Ghetto Lane");
    path([[-E, SN], [-I, SN], [0, SN], [I, SN], [E, SN]], 4, "Snob Row");
    path([[-I, GZ], [-I, TT], [-I, 0], [-I, BJ], [-I, SN]], 4, "Leftovers Avenue");
    path([[I, GZ], [I, TT], [I, 0], [I, BJ], [I, SN]], 4, "Write-Off Avenue");
    path([[-I, BJ], [0, BJ], [I, BJ]], 4, "Bin Juice Boulevard");
    path([[-I, TT], [0, TT], [I, TT]], 4, "Shopping Trolley Terrace");
    path([[-RR, 0], [-I, 0], [-E, 0]], 4, "Mayor's Mugshot Mile");
    path([[RR, 0], [I, 0], [E, 0]], 4, "Mayor's Mugshot Mile");
    path([[0, RR], [0, BJ], [0, SN]], 4, "Dead-Centre Drive");
    path([[0, -RR], [0, TT]], 4, "Loose Change Lane");
    rd(-I, BJ, -qx, qz, 4, "Dodgy Cut-Through"); rd(I, BJ, qx, qz, 4, "Bank Run");
    // THE SPIN CYCLE: the roundabout, counter-clockwise
    const arc = { cx: 0, cz: 0, r: RR };
    for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; rd(a[0], a[1], b[0], b[1], 4, "The Spin Cycle", { oneway: true, arc }); }
  } else {
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
  }
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
  // (R2: a road that isn't along x or z is a diagonal: no rect, a segment surface; see roadSegs)
  const isDiag = (e: RoadEdge) => { const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b"); return Math.abs(bx - ax) > 0.5 && Math.abs(bz - az) > 0.5; };
  const lines = edges.filter((e) => !e.arc);
  const straight = lines.filter((e) => !isDiag(e));
  const diags = lines.filter(isDiag);
  const roadSegs = diags.map((e) => { const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b"); return { ax, az, bx, bz, hw: e.hw }; });
  const rectOfEdge = new Map<RoadEdge, Rect>();
  for (const e of straight) {
    const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b");
    const ext = (id: number) => nodes[id].ctl === "round" ? 0 : Math.max(0, ...lines.filter((o) => o !== e && (o.a === id || o.b === id)).map((o) => o.hw));
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
    const inc = lines.filter((e) => e.a === n.id || e.b === n.id);
    for (const e of inc) {
      const [px, pz] = e.a === n.id ? endP(e, "a") : endP(e, "b");
      const [qx, qz] = e.a === n.id ? endP(e, "b") : endP(e, "a");
      const len = Math.hypot(qx - px, qz - pz);
      const dx = (qx - px) / len, dz = (qz - pz) / len;
      let reach = 0;
      if (n.ctl === "round") reach = RING.r1 - RR + 5; // (C3: 5 m back from the ring, so a car waiting to join the ring isn't parked on the zebra)
      for (const o of inc) {
        if (o === e) continue;
        const r = rectOfEdge.get(o);
        // how far the other road reaches along this road's direction from the junction centre
        let far: number;
        if (r && !isDiag(e)) far = dx > 0.5 ? r.maxX - px : dx < -0.5 ? px - r.minX : dz > 0.5 ? r.maxZ - pz : pz - r.minZ;
        else {
          // (R2: a diagonal meets it: how far along this road the other road's surface reaches, from the angle between them)
          const [ox, oz] = o.a === n.id ? endP(o, "b") : endP(o, "a"), ol = Math.hypot(ox - px, oz - pz);
          const sin = Math.max(0.3, Math.abs((dx * (oz - pz) - dz * (ox - px)) / ol)), cos = (dx * (ox - px) + dz * (oz - pz)) / ol;
          far = o.hw / sin + e.hw * Math.abs(cos) / sin;
        }
        reach = Math.max(reach, far);
      }
      const dc = reach + 1.5;
      if (dc + 3 > len) continue;
      const cx = px + dx * dc, cz = pz + dz * dc;
      if (crosswalks.some((c) => Math.hypot((c.minX + c.maxX) / 2 - cx, (c.minZ + c.maxZ) / 2 - cz) < 4)) continue;
      if (isDiag(e)) {
        // (R2: a crossing on a diagonal: a square box over it; the zebra turned to match)
        const h = e.hw + 0.5;
        crosswalks.push(R(cx - h, cx + h, cz - h, cz + h));
        decor.push({ kind: "zebra", x: cx, z: cz, yaw: Math.atan2(dx, dz) - Math.PI / 2 });
        continue;
      }
      const alongX = Math.abs(dx) > 0.5;
      const cw = alongX ? R(cx - 1.5, cx + 1.5, cz - e.hw - 0.5, cz + e.hw + 0.5) : R(cx - e.hw - 0.5, cx + e.hw + 0.5, cz - 1.5, cz + 1.5);
      crosswalks.push(cw);
      if (alongX) xLines.add(Math.round(cx * 10) / 10); else zLines.add(Math.round(cz * 10) / 10);
      decor.push({ kind: "zebra", x: cx, z: cz, yaw: alongX ? 0 : Math.PI / 2 });
    }
  }
  // the ring crossings to the park (classic: the four at 45 degrees; R2: north, SW, SE: the fork takes NE and NW)
  const parkCross = R2 ? [62, 118, 225, 315] : [45, 135, 225, 315]; // (R3: between the six arms)
  for (const deg of parkCross) {
    const t = (deg * Math.PI) / 180, sx = Math.cos(t), sz = Math.sin(t);
    const a = RING.r0 - 1, b = RING.r1 + 1, ax = sx * a, bx = sx * b, az = sz * a, bz = sz * b;
    crosswalks.push(R(Math.min(ax, bx) - 1.2, Math.max(ax, bx) + 1.2, Math.min(az, bz) - 1.2, Math.max(az, bz) + 1.2));
    decor.push({ kind: "zebra", x: sx * RR, z: sz * RR, yaw: Math.atan2(sx, sz) });
  }
  // lane paint + street lights along the straight roads (skipping junction boxes)
  const nearJunction = (x: number, z: number, pad: number) => nodes.some((n) => n.ctl !== "end" && Math.abs(n.x - x) < pad && Math.abs(n.z - z) < pad);
  for (const e of lines) {
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
    let a1 = Math.atan2(B.z, B.x);
    while (a1 <= a0) a1 += Math.PI * 2;
    const nk = Math.max(2, Math.round((a1 - a0) / (Math.PI / 6))); // (about every 30 degrees: 3 pieces a quarter, like before)
    let prev = e.a;
    for (let k = 1; k < nk; k++) {
      const t = a0 + (k * (a1 - a0)) / nk;
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
    for (const d of parkCross) navChains.push([P(d, 31.8), P(d, 18.2)]);
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
    if (b.phantom) return;
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
    B("Yards: East", 61, 87, -85, -56, ALL, { units: [{ spec: U.pawn, dir: "N", at: 74 }] }),
    // ---- MEDIUM: Old Brick (west), Market Row (east), round the park ----
    // (C5c.3: "Old Brick: West South" is now THE COMPACTOR; see below. Its slot stays, so the blocks after it keep their looks)
    B("Old Brick: West South", -87, -59, -44, -4, ALL, { phantom: true }),
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
    B("Uptown: West", -87, -59, 52, 80, ALL, { units: [{ spec: U.lawyers, dir: "E", at: 66 }] }), // (C5c.3: the lawyers moved uptown)
    B("Uptown: Hotel block", -53, -24, 52, 80, ["S", "N", "W", { dir: "E", from: 67, to: 80 }], { units: [{ spec: U.bling, dir: "S", at: -41.5 }], keep: [LM.hotel] }),
    B("Uptown: HQ block", 24, 53, 56, 80, ["S", "N", "E", { dir: "W", from: 67, to: 80 }], { units: [{ spec: U.cracked, dir: "S", at: 41.5 }], keep: [LM.hq] }),
    B("Uptown: Casino block", 59, 87, 56, 80, ALL, { keep: [LM.casino] }),
    B("Uptown: Apartment tower block", -87, -59, 86, 104, ALL, { keep: [LM.tower, LM.valet] }),
    B("Uptown: Museum block", -53, -24, 86, 104, ["N", "S", "W"], { keep: [LM.museum] }),
    B("Uptown: Mall block", 24, 53, 86, 104, ["N", "S", "E"], { keep: [LM.mall] }),
  ];
  // =================================================================================================
  // R2: THE ROAD TEST's blocks. No hand-made blocks: the ground is worked out on a 0.5 m grid (every cell off
  // the road is pavement, merged into strips), then every road gets a row of plain buildings down each side,
  // set back behind the pavement. Along the diagonals the buildings are squares stepped along the road (boxes
  // can't turn). Loot, bins, hydrants and rooftop stashes go along the rows like on the classic streets.
  // =================================================================================================
  const fillRoadTest = () => {
    const CELL = 0.5, X0 = -HALF, Z0 = HIGHWAY.z1 + 3, NX = Math.round((2 * HALF) / CELL), NZ = Math.round((HALF - Z0) / CELL);
    /** how far (x, z) is from the nearest road surface (0 = on it; -1 = in the park) */
    const roadDist = (x: number, z: number) => {
      const rr = Math.hypot(x, z);
      if (rr < RING.r0) return -1;
      if (rr <= RING.r1) return 0;
      let d = rr - RING.r1;
      for (const r of roads) {
        const dx = Math.max(r.minX - x, 0, x - r.maxX), dz = Math.max(r.minZ - z, 0, z - r.maxZ);
        if (dx === 0 && dz === 0) return 0;
        d = Math.min(d, Math.hypot(dx, dz));
      }
      for (const g of roadSegs) { const q = segDist(x, z, g.ax, g.az, g.bx, g.bz) - g.hw; if (q <= 0) return 0; d = Math.min(d, q); }
      return d;
    };
    const dist = new Float32Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) dist[j * NX + i] = roadDist(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL);
    const cellAt = (x: number, z: number) => {
      const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
      return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : dist[j * NX + i];
    };
    // ---- the pavement: runs of off-road cells along each row, stacked into strips while they line up ----
    let open = new Map<string, Rect>();
    // (the band round the roundabout's outside is laid as smooth curved pieces instead, below: the grid's
    //  cells would leave a stepped kerb)
    const BAND = RING.r1 + 3;
    const paved = (i: number, j: number) => dist[j * NX + i] > 0 && Math.hypot(X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL) >= BAND;
    for (let j = 0; j <= NZ; j++) {
      const next = new Map<string, Rect>();
      if (j < NZ) {
        for (let i = 0; i < NX;) {
          if (!paved(i, j)) { i++; continue; }
          const i0 = i;
          while (i < NX && paved(i, j)) i++;
          const key = i0 + "," + i, z1 = Z0 + (j + 1) * CELL, o = open.get(key);
          if (o) { o.maxZ = z1; open.delete(key); next.set(key, o); } else next.set(key, R(X0 + i0 * CELL, X0 + i * CELL, Z0 + j * CELL, z1));
        }
      }
      for (const r of open.values()) ground(r);
      open = next;
    }
    // (the pavement along a diagonal is 0.5 m steps underneath: a smooth kerb strip on top, looks only)
    for (const e of diags) {
      const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b"), L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      for (const side of [-1, 1]) {
        const nx = -uz * side, nz = ux * side, at = (t: number, o: number) => cellAt(ax + ux * t + nx * o, az + uz * t + nz * o);
        let best: [number, number] = [0, 0], run = -1;
        for (let t = 0; t <= L + 0.01; t += 0.25) {
          const ok = at(t, e.hw + 0.6) > 0 && at(t, e.hw + 2.2) > 0;
          if (ok && run < 0) run = t;
          if ((!ok || t + 0.25 > L) && run >= 0) { const end = ok ? t : t - 0.25; if (end - run > best[1] - best[0]) best = [run, end]; run = -1; }
        }
        if (best[1] - best[0] < 2) continue;
        const tm = (best[0] + best[1]) / 2, om = e.hw + (2.2 - 0.35) / 2;
        scenery.push({ kind: "walk", x: ax + ux * tm + nx * om, z: az + uz * tm + nz * om, w: 2.55, d: best[1] - best[0], yaw: Math.atan2(ux, uz) });
      }
    }
    // ---- R3: the pavement round the roundabout: 96 curved pieces from its kerb out past where the grid starts,
    //      each cut back square from the roads that leave the ring ----
    {
      type P2 = [number, number];
      const clipHP = (P: P2[], ox: number, oz: number, nx: number, nz: number): P2[] => {
        const out: P2[] = [];
        for (let q = 0; q < P.length; q++) {
          const A = P[q], B = P[(q + 1) % P.length], da = (A[0] - ox) * nx + (A[1] - oz) * nz, db = (B[0] - ox) * nx + (B[1] - oz) * nz;
          if (da >= 0) out.push(A);
          if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
        }
        return out;
      };
      const segs = 96, r0 = RING.r1, r1 = BAND + 0.6;
      for (let q = 0; q < segs; q++) {
        const a0 = (q / segs) * Math.PI * 2, a1 = ((q + 1) / segs) * Math.PI * 2;
        let P: P2[] = [[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a0) * r1, Math.sin(a0) * r1], [Math.cos(a1) * r1, Math.sin(a1) * r1], [Math.cos(a1) * r0, Math.sin(a1) * r0]];
        const cx = Math.cos((a0 + a1) / 2) * (r0 + r1) / 2, cz = Math.sin((a0 + a1) / 2) * (r0 + r1) / 2;
        for (const r of roads) {
          if (!(r.maxX > Math.min(...P.map((p) => p[0])) && r.minX < Math.max(...P.map((p) => p[0])) && r.maxZ > Math.min(...P.map((p) => p[1])) && r.minZ < Math.max(...P.map((p) => p[1])))) continue;
          const gaps = [r.minX - cx, cx - r.maxX, r.minZ - cz, cz - r.maxZ], m = Math.max(...gaps);
          if (m < 0) { P = []; break; }
          const side = gaps.indexOf(m);
          P = side === 0 ? clipHP(P, r.minX, 0, -1, 0) : side === 1 ? clipHP(P, r.maxX, 0, 1, 0) : side === 2 ? clipHP(P, 0, r.minZ, 0, -1) : clipHP(P, 0, r.maxZ, 0, 1);
          if (P.length < 3) break;
        }
        for (const g of roadSegs) {
          if (P.length < 3) break;
          const vx = g.bx - g.ax, vz = g.bz - g.az, l = Math.hypot(vx, vz), nx = -vz / l, nz = vx / l;
          const sd = (cx - g.ax) * nx + (cz - g.az) * nz, sgn = sd >= 0 ? 1 : -1, t = ((cx - g.ax) * vx + (cz - g.az) * vz) / (l * l);
          if (Math.abs(sd) > g.hw + 8 || t < -0.05 || t > 1.15) continue; // (only beside the diagonal itself, not its line carried on past the ring)
          if (Math.abs(sd) < g.hw) { P = []; break; }
          P = clipHP(P, g.ax + nx * g.hw * sgn, g.az + nz * g.hw * sgn, nx * sgn, nz * sgn);
        }
        if (P.length < 3) continue;
        let A = 0;
        for (let k = 0; k < P.length; k++) A += P[k][0] * P[(k + 1) % P.length][1] - P[(k + 1) % P.length][0] * P[k][1];
        if (Math.abs(A) / 2 < 0.05) continue;
        boxes.push(polyBox(P, 0.15, "sidewalk"));
      }
    }
    blocks.push({ name: "Road test: the city", rect: R(-HALF, HALF, Z0, HALF), tier: 1, open: ["N", "S", "E", "W"] });
    // ---- the buildings (R3: rows along every road; turned to match a diagonal; cut into wedges where a row runs
    //      into a diagonal or the roundabout) ----
    type Pt = [number, number];
    const placed: Rect[] = [], placedB: Box[] = [];
    const SN = NEW.snob, lotZ = SN + 4 + SW; // (north of Snob Row: the landmark lots)
    /** R3: the pavement in front of the buildings (Blake: 4 m looked too big); R4: buildings vary their setback from it */
    const PW = 2.5;
    /** R4: LITTLE ITALY: along Leftovers Avenue between Gahookz Ghetto Lane and Mayor's Mugshot Mile (its mirror on
     *  Write-Off Avenue is CHINATOWN). Cafés stand back for tables and umbrellas; stalls in front of some. */
    const DZ0 = NEW.gahookz + 4 + 3, DZ1 = -4 - 3;
    const ITALY_WALLS = ["#e8b45a", "#d8742c", "#f3e2b8", "#c26b4a", "#e8d0a0", "#f0c8a0", "#d9a07a", "#b5653b"];
    let italyN = 0, stallN = 0;
    const STALLS: PropKind[] = ["deli", "pizzacart", "ricordi", "gelato", "pizzacart", "ricordi", "gelato"];
    // (R5: the station, the passages down its sides, Lou's Square, the pawn shop: one clear plot)
    const keepOut: Rect[] = [R(-PLOT_X, PLOT_X, NEW_PRECINCT.minZ - 0.3, NEW_PRECINCT.maxZ + 0.5), // (R7: the station; the pawn shops)
      R(HOT_PLOT.minX - 0.3, HOT_PLOT.maxX + 0.3, HOT_PLOT.minZ - 0.3, HOT_PLOT.maxZ + 0.3), R(-HOT_PLOT.maxX - 0.3, -HOT_PLOT.minX + 0.3, HOT_PLOT.minZ - 0.3, HOT_PLOT.maxZ + 0.3),
      R(29, 34.5, -15, -9) /* the taco cart */, R(-HALF, HALF, lotZ - 0.5, HALF)];
    const bbox = (P: Pt[]): Rect => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [x, z] of P) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); } return R(a, b, c, d); };
    const area = (P: Pt[]) => { let A = 0; for (let q = 0; q < P.length; q++) { const [x0, z0] = P[q], [x1, z1] = P[(q + 1) % P.length]; A += x0 * z1 - x1 * z0; } return Math.abs(A) / 2; };
    /** keep the part of P where (p - o) . n >= 0 */
    const clip = (P: Pt[], ox: number, oz: number, nx: number, nz: number): Pt[] => {
      const out: Pt[] = [];
      for (let q = 0; q < P.length; q++) {
        const A = P[q], B = P[(q + 1) % P.length], da = (A[0] - ox) * nx + (A[1] - oz) * nz, db = (B[0] - ox) * nx + (B[1] - oz) * nz;
        if (da >= 0) out.push(A);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      return out;
    };
    /** cut a candidate footprint back from the diagonals and the roundabout (they make the wedges) */
    const carve = (P: Pt[]): Pt[] => {
      let Q = P;
      const [cx, cz] = Q.reduce((a, p) => [a[0] + p[0] / Q.length, a[1] + p[1] / Q.length], [0, 0]);
      for (const g of roadSegs) {
        const vx = g.bx - g.ax, vz = g.bz - g.az, l = Math.hypot(vx, vz), gnx = -vz / l, gnz = vx / l;
        const sd = (cx - g.ax) * gnx + (cz - g.az) * gnz, sgn = sd >= 0 ? 1 : -1, off = g.hw + PW;
        // (only near this diagonal's length)
        const t = ((cx - g.ax) * vx + (cz - g.az) * vz) / (l * l);
        if (t < -0.05 || t > 1.05) continue;
        Q = clip(Q, g.ax + gnx * off * sgn, g.az + gnz * off * sgn, gnx * sgn, gnz * sgn);
        if (Q.length < 3) return Q;
      }
      // the straight roads: back off from the side of each one the footprint's middle is on
      for (const r of roads) {
        const bb = bbox(Q);
        if (!rectI(bb, R(r.minX - PW, r.maxX + PW, r.minZ - PW, r.maxZ + PW))) continue;
        const gaps = [r.minX - cx, cx - r.maxX, r.minZ - cz, cz - r.maxZ], m = Math.max(...gaps);
        if (m < 0) return [];
        const side = gaps.indexOf(m);
        Q = side === 0 ? clip(Q, r.minX - PW, 0, -1, 0) : side === 1 ? clip(Q, r.maxX + PW, 0, 1, 0) : side === 2 ? clip(Q, 0, r.minZ - PW, 0, -1) : clip(Q, 0, r.maxZ + PW, 0, 1);
        if (Q.length < 3) return Q;
      }
      // the roundabout: a flat face square on to the middle of the park
      const rl = Math.hypot(cx, cz);
      if (rl < RING.r1 + PW + 16) { const ux = cx / (rl || 1), uz = cz / (rl || 1), o = RING.r1 + PW; Q = clip(Q, ux * o, uz * o, ux, uz); }
      return Q;
    };
    /** convex polygons overlap? (separating axes, a hair of slack) */
    const overlap = (A: Pt[], B: Pt[]) => {
      for (const P of [A, B]) for (let q = 0; q < P.length; q++) {
        const [x0, z0] = P[q], [x1, z1] = P[(q + 1) % P.length], nx = z1 - z0, nz = x0 - x1;
        let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
        for (const [x, z] of A) { const v = x * nx + z * nz; amin = Math.min(amin, v); amax = Math.max(amax, v); }
        for (const [x, z] of B) { const v = x * nx + z * nz; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
        const sl = 0.02 * Math.hypot(nx, nz);
        if (amax <= bmin + sl || bmax <= amin + sl) return false;
      }
      return true;
    };
    const asPoly = (b: Box): Pt[] => b.poly ?? [[b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z + b.d / 2], [b.x - b.w / 2, b.z + b.d / 2]];
    /** a decent shape? (big enough, no sliver corners) */
    const shapely = (P: Pt[]) => {
      if (P.length < 3 || area(P) < 22) return false;
      for (let q = 0; q < P.length; q++) {
        const A = P[(q + P.length - 1) % P.length], B = P[q], C = P[(q + 1) % P.length];
        const ax2 = A[0] - B[0], az2 = A[1] - B[1], cx2 = C[0] - B[0], cz2 = C[1] - B[1];
        const la = Math.hypot(ax2, az2), lc = Math.hypot(cx2, cz2);
        if (la < 1.2 || lc < 1.2) return false;
        if ((ax2 * cx2 + az2 * cz2) / (la * lc) > Math.cos((24 * Math.PI) / 180)) return false;
      }
      return true;
    };
    const fits = (P: Pt[]) => {
      const rc = bbox(P);
      if (rc.maxX > -0.05) return false; // (the west half only: the east half is its mirror image, see below)
      if (rc.minX < -HALF + 1 || rc.maxX > HALF - 1 || rc.maxZ > HALF - 1 || rc.minZ < Z0) return false;
      const rm = R(-rc.maxX, -rc.minX, rc.minZ, rc.maxZ); // (its mirror twin on the east half must fit too)
      if (keepOut.some((q) => rectI(q, rc) || rectI(q, rm))) return false;
      for (let q = 0; q < placed.length; q++) if (rectI(placed[q], rc) && overlap(asPoly(placedB[q]), P)) return false;
      const probe = polyBox(P, 1, "building");
      for (let x = rc.minX + 0.25; x < rc.maxX; x += 0.5) for (let z = rc.minZ + 0.25; z < rc.maxZ; z += 0.5) {
        if (footSd(probe, x, z).d < -0.05 && cellAt(x, z) < PW - 0.3) return false;
      }
      return true;
    };
    const inBuilding = (x: number, z: number, pad = 0) => placedB.some((b) => inFoot(b, x, z, pad));
    const roofLoot: [Box, number][] = [];
    // (what this builds on the west half, to mirror onto the east half at the end: the two halves are the same city)
    const lootStart = loot.length, boxStart = boxes.length, decorStart = decor.length, chainStart = navChains.length;
    const propLog: [PropKind, number, number, number, number, number, number][] = [];
    const len = (e: RoadEdge) => { const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b"); return Math.hypot(bx - ax, bz - az); };
    let bseed2 = 0, k = 0;
    for (const e of [...lines].sort((a, b) => (isDiag(b) ? 1 : 0) - (isDiag(a) ? 1 : 0) || len(b) - len(a))) { // (the diagonals first: they get the corner lots)
      const [ax, az] = endP(e, "a"), [bx, bz] = endP(e, "b"), L = len(e), ux = (bx - ax) / L, uz = (bz - az) / L, diag = isDiag(e);
      for (const side of [-1, 1]) {
        const nx = -uz * side, nz = ux * side; // (into this side's block)
        bseed2++;
        const H = (q: number) => hash(bseed2 * 7.13 + q + 500, bseed2 * 1.7 + q * 0.37);
        // (faces the road: exactly, along a diagonal; otherwise the nearest of the four directions)
        const face: [number, number] = diag ? [-nx, -nz] : Math.abs(nx) >= Math.abs(nz) ? [-Math.sign(nx), 0] : [0, -Math.sign(nz)];
        const signStart = Math.floor(H(99) * 24);
        let signCount = 0, prevColor = "";
        const put = (P: Pt[], front: number, plain: boolean, italy = false) => {
          const rc = bbox(P), [, mz] = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]);
          const tier = tierAt(mz);
          const hRaw = tier === 0 ? 4.8 + H(k + 50) * 4.9 : tier === 1 ? 5 + H(k + 50) * 11 : 12 + H(k + 50) * H(k + 90) * 42;
          const h = Math.round(hRaw * 2) / 2;
          const signs = tier === 0 ? SIGNS_LOW : tier === 1 ? SIGNS_MID : SIGNS_HIGH;
          const name = signs[(signStart + signCount++) % signs.length];
          const pal = h > 20 ? TIER_TOWERS[tier] : TIER_WALLS[tier];
          let ci = Math.floor(H(k + 85) * pal.length);
          if (pal[ci] === prevColor) ci = (ci + 1 + Math.floor(H(k + 86) * (pal.length - 1))) % pal.length;
          prevColor = pal[ci];
          const kind = h > 20 ? "tower" : "building";
          const b: Box = {
            ...(plain ? box((rc.minX + rc.maxX) / 2, (rc.minZ + rc.maxZ) / 2, rc.maxX - rc.minX, rc.maxZ - rc.minZ, h, kind) : polyBox(P, h, kind)),
            color: pal[ci], windows: true, face, front: h > 20 ? "lobby" : "shop", ...(front >= 3 ? { sign: name } : {}),
          };
          if (italy && kind === "building") { // (R4: Little Italy: warm walls, Italian-ish names, the dressing; its mirror is Chinatown)
            b.color = ITALY_WALLS[italyN % ITALY_WALLS.length];
            b.sign = ITALY_SHOPS[italyN % ITALY_SHOPS.length];
            b.italy = true; italyN++;
          }
          boxes.push(b); placed.push(rc); placedB.push(b);
          if (h <= 7 && H(k + 60) < 0.35) roofLoot.push([b, h]);
        };
        for (let t = diag ? 0 : -8; t < L + (diag ? 0 : 8);) { // (a diagonal's row stops at its ends: past them is another block)
          const tier = tierAt(az + uz * t);
          const [wMin, wMax] = [[6, 11], [7, 13], [9, 15]][tier];
          const w = wMin + H(++k) * (wMax - wMin);
          let step = 0;
          // (R4: every building its own setback; in Little Italy a café stands well back for its tables)
          const mid = az + uz * (t + w / 2), inDist = e.name === "Leftovers Avenue" && mid > DZ0 && mid < DZ1;
          const cafe = inDist && H(k + 7) < 0.55;
          const sb = cafe ? 6.5 : PW + [0, 0, 0.5, 1, 2][Math.floor(H(k + 8) * 5)] * (inDist ? 0.5 : 1);
          const off = e.hw + sb;
          const at = (u: number, v: number): Pt => [ax + ux * u + nx * v, az + uz * u + nz * v];
          // (quick outs: this spot is on the east half, or its front corner is inside a building already)
          const [fx0, fz0] = at(t + 0.3, off + 0.3);
          if (fx0 > -0.3 || inBuilding(fx0, fz0)) { t += 0.5; continue; }
          for (let ww = w; ww >= 3 && !step; ww -= 1.5) {
            for (let d = [10, 11, 12][tier]; d >= 4 && !step; d -= 1) {
              const P0 = [at(t, off), at(t + ww, off), at(t + ww, off + d), at(t, off + d)];
              const P = carve(P0);
              if (!shapely(P) || !fits(P)) continue;
              // (a plain row building stays a plain box; turned or cut ones are angled footprints)
              const plain = P.length === 4 && P.every(([x0, z0], q) => { const [x1, z1] = P[(q + 1) % 4]; return Math.abs(x1 - x0) < 1e-6 || Math.abs(z1 - z0) < 1e-6; });
              put(P, ww, plain, inDist);
              step = ww;
              if (cafe && ww >= 5) {
                // the café's terrace: tables under umbrellas, and a street stall in front of some
                const us = ww >= 8 ? [0.22, 0.78] : [0.3];
                for (const f of us) {
                  const [tx, tz] = at(t + ww * f, e.hw + 4.6);
                  boxes.push({ ...box(tx, tz, 1.0, 1.0, 0.75, "table"), color: "#f4f1ea" });
                  decor.push({ kind: "umbrella", x: tx, z: tz, text: "it" });
                }
                {
                  const kind = STALLS[stallN++ % STALLS.length], [sx, sz] = at(t + ww * (ww >= 8 ? 0.5 : 0.75), e.hw + 4.4), yaw = Math.atan2(-nx, -nz);
                  const [w2, d2, h2] = kind === "deli" ? [1.4, 0.8, 1.3] : [1.6, 0.9, 1.05];
                  prop(kind, sx, sz, yaw, w2, d2, h2);
                  propLog.push([kind, sx, sz, yaw, w2, d2, h2]);
                }
              }
            }
          }
          t += step || 0.5;
        }
        // street life along this side: loot on the pavement, a bin or a booth against the buildings, a hydrant
        for (let t = 6; t < L - 3; t += 17) {
          const px = ax + ux * t + nx * (e.hw + 1.3), pz = az + uz * t + nz * (e.hw + 1.3);
          if (px < -0.5 && cellAt(px, pz) > 1 && !inBuilding(px, pz, 0.5)) spawnAt(px, pz, "street", 0.15);
        }
        if (!diag && L > 12) {
          const kinds: [PropKind, number, number, number][] = [["bin", 0.7, 0.7, 1.0], ["newsbox", 0.6, 0.5, 1.0], ["phone", 1.1, 1.1, 2.3], ["vending", 1.2, 0.9, 1.9], ["bin", 0.7, 0.7, 1.0]];
          const pk = kinds[Math.floor(H(k + 11) * kinds.length)];
          const t = 5 + H(k + 12) * (L - 10), off = e.hw + PW - 0.2 - pk[2] / 2;
          const px = ax + ux * t + nx * off, pz = az + uz * t + nz * off;
          if (px < -1 && cellAt(px, pz) > 1.5 && !inBuilding(px, pz, 0.8) && !keepOut.some((q) => inRect(q, px, pz, 1))) {
            prop(pk[0], px, pz, Math.atan2(-nx, -nz), pk[1], pk[2], pk[3]);
            propLog.push([pk[0], px, pz, Math.atan2(-nx, -nz), pk[1], pk[2], pk[3]]);
          }
        }
        if (H(k + 13) < 0.6) {
          const t = 3 + H(k + 14) * Math.max(0, L - 6), hx = ax + ux * t + nx * (e.hw + 0.4), hz = az + uz * t + nz * (e.hw + 0.4);
          const clash = loot.some((q) => Math.hypot(q.x - hx, q.z - hz) < 1.5) || crosswalks.some((c) => inRect(c, hx, hz, 1));
          if (hx < -0.5 && !clash && cellAt(hx, hz) > 0.1) boxes.push(box(hx, hz, 0.45, 0.45, 0.8, "hydrant"));
        }
        // walking routes along a diagonal's pavement (the street grid's route lines only run along x and z)
        if (diag && ax + bx < 0) {
          const chain: { x: number; z: number }[] = [];
          for (let t = 3; t < L - 2; t += 4) {
            const px = ax + ux * t + nx * (e.hw + 1.2), pz = az + uz * t + nz * (e.hw + 1.2);
            if (cellAt(px, pz) > 0.8 && !inBuilding(px, pz, 0.4)) chain.push({ x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100 });
          }
          if (chain.length > 1) navChains.push(chain);
        }
      }
    }
    // R4: a 3 m brick wall down the middle of the long low-end block (from the police station out to each avenue):
    // the only ways from the fort bowl into town stay round the avenue ends, the same walk for every fort
    // (buildings set back at different depths would otherwise leave gaps right through the block)
    const midWall: Box[] = [];
    {
      const zc = MID_WALL_Z, xa = NEW_PRECINCT.maxX + 0.2, xb = NEW.inner - 4 - PW - 0.3; // (from the station's side: no short cut through the middle plot)
      for (const sgn of [-1, 1]) midWall.push({ ...box(sgn * (xa + xb) / 2, zc, xb - xa, 0.5, 3, "wall"), color: "#8a4a3a", art: true });
      for (const w of midWall) boxes.push(w);
    }
    // no sealed courtyards: flood the open ground from the Service Rd pavement; a pocket nobody can walk into
    // loses the smallest building between it and the street (an alley appears), until there are none
    {
      const r = 0.45, free = new Uint8Array(NX * NZ);
      for (let pass = 0; pass < 60; pass++) {
        for (let c = 0; c < NX * NZ; c++) free[c] = dist[c] >= 0 ? 1 : 0;
        // (each building blots out the cells it covers, its own outline grown by a body's radius)
        for (const b of [...placedB, ...midWall]) {
          const i0 = Math.max(0, Math.floor((b.x - b.w / 2 - r - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((b.x + b.w / 2 + r - X0) / CELL));
          const j0 = Math.max(0, Math.floor((b.z - b.d / 2 - r - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((b.z + b.d / 2 + r - Z0) / CELL));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inFoot(b, X0 + (i + 0.5) * CELL, Z0 + (j + 0.5) * CELL, r)) free[j * NX + i] = 0;
        }
        const seen = new Uint8Array(NX * NZ), q: number[] = [];
        const s0 = Math.floor((NEW.gahookz + 5.5 - Z0) / CELL) * NX + Math.floor(NX / 2);
        seen[s0] = 1; q.push(s0);
        while (q.length) {
          const c = q.pop()!, i = c % NX, j = (c - i) / NX;
          for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
            const m = b * NX + a;
            if (free[m] && !seen[m]) { seen[m] = 1; q.push(m); }
          }
        }
        // the first sealed pocket
        let pocket = -1;
        for (let c = 0; c < NX * NZ && pocket < 0; c++) if (free[c] && !seen[c]) pocket = c;
        if (pocket < 0) break;
        // the smallest building next to it (flood the pocket, collect the buildings it touches)
        const cells = [pocket], inP = new Uint8Array(NX * NZ); inP[pocket] = 1;
        const touch = new Set<number>();
        while (cells.length) {
          const c = cells.pop()!, i = c % NX, j = (c - i) / NX, x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
          placedB.forEach((b, bi) => { if (inFoot(b, x, z, r + 0.6)) touch.add(bi); });
          for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
            const m = b * NX + a;
            if (free[m] && !inP[m]) { inP[m] = 1; cells.push(m); }
          }
        }
        const pick = [...touch].sort((a, b) => placedB[a].w * placedB[a].d - placedB[b].w * placedB[b].d)[0];
        if (pick === undefined) break;
        const gone = placedB[pick];
        placed.splice(pick, 1); placedB.splice(pick, 1);
        boxes.splice(boxes.indexOf(gone), 1);
        for (let n = roofLoot.length - 1; n >= 0; n--) if (roofLoot[n][0] === gone) roofLoot.splice(n, 1);
      }
    }
    for (const [b, h] of roofLoot) {
      const [cx, cz] = b.poly ? b.poly.reduce((a, p) => [a[0] + p[0] / b.poly!.length, a[1] + p[1] / b.poly!.length], [0, 0]) : [b.x, b.z];
      spawnAt(cx, cz, "rooftop", h);
    }
    // R3: street-name signs: a green two-blade sign on a pole at a corner of every junction, one blade along each road
    for (const n of nodes) {
      if (n.ctl === "end" || n.x > 0.5) continue;
      const arms = lines.filter((e) => e.a === n.id || e.b === n.id).map((e) => {
        const [qx, qz] = e.a === n.id ? endP(e, "b") : endP(e, "a"), l = Math.hypot(qx - n.x, qz - n.z);
        return { e, ux: (qx - n.x) / l, uz: (qz - n.z) / l };
      });
      if (n.ctl === "round") { // (a roundabout entry: the arm's own name and the roundabout's)
        const a0 = arms[0];
        if (!a0) continue;
        const rx = -a0.uz, rz = a0.ux, x = n.x + a0.ux * (RING.r1 - RING.r + 7) + rx * (a0.e.hw + 1.4), z = n.z + a0.uz * (RING.r1 - RING.r + 7) + rz * (a0.e.hw + 1.4);
        if (cellAt(x, z) > 0.4 && !inBuilding(x, z, 0.6)) decor.push({ kind: "streetsign", x, z, yaw: Math.atan2(a0.ux, a0.uz), yaw2: Math.atan2(rx, rz), text: `${a0.e.name!.toUpperCase()}|THE SPIN CYCLE` });
        continue;
      }
      // two arms with different names, at a corner between them
      let done = false;
      for (const A of arms) for (const B of arms) {
        if (done || A === B || A.e.name === B.e.name) continue;
        const x = n.x + A.ux * (B.e.hw + 1.3) + B.ux * (A.e.hw + 1.3), z = n.z + A.uz * (B.e.hw + 1.3) + B.uz * (A.e.hw + 1.3);
        if (cellAt(x, z) <= 0.4 || inBuilding(x, z, 0.6) || crosswalks.some((c) => inRect(c, x, z, 0.3))) continue;
        decor.push({ kind: "streetsign", x, z, yaw: Math.atan2(A.ux, A.uz), yaw2: Math.atan2(B.ux, B.uz), text: `${A.e.name!.toUpperCase()}|${B.e.name!.toUpperCase()}` });
        done = true;
      }
    }
    // a few stashes in the courtyards behind the rows (the open ground no building took)
    for (let n = 0, tries = 0; n < 24 && tries < 4000; tries++) {
      const x = -HALF + 6 + hash(tries, 3.1) * (2 * HALF - 12), z = Z0 + 6 + hash(7.7, tries) * (HALF - Z0 - 12);
      if (x > -0.5 || cellAt(x, z) < SW + 6 || inBuilding(x, z, 1.5) || keepOut.some((q) => inRect(q, x, z, 1))) continue;
      spawnAt(x, z, "alley", 0.15);
      n++;
    }
    // ---- the mirror: everything on the west half, flipped onto the east half (same shapes, heights, loot spots,
    //      bins and routes, so neither side's forts get a better half of town; colours and shop names differ) ----
    const swapName: Record<string, string> = { "LEFTY LANE": "RIGHTY LANE", "LEFTOVERS AVENUE": "WRITE-OFF AVENUE", "DODGY CUT-THROUGH": "BANK RUN" };
    for (const [a, b] of Object.entries(swapName)) swapName[b] = a;
    let chinaN = 0;
    for (const b of [...placedB]) {
      const base = b.y - b.h / 2, tier = tierAt(b.z);
      if (b.italy) { // (R4: Little Italy's mirror image: Chinatown, shop for shop)
        const m = b.poly ? polyBox(b.poly.map(([x, z]) => [-x, z] as Pt), b.h, b.kind, base) : box(-b.x, b.z, b.w, b.d, b.h, b.kind, base);
        const [name, sign2, wall, roof] = CHINA_SHOPS[chinaN++ % CHINA_SHOPS.length];
        boxes.push({ ...m, color: wall, windows: true, face: [-(b.face?.[0] ?? 0), b.face?.[1] ?? 0], front: b.front, sign: name, ...(b.poly ? {} : { china: { roof, sign2 } }) });
        continue;
      }
      const m: Box = b.poly ? polyBox(b.poly.map(([x, z]) => [-x, z] as Pt), b.h, b.kind, base) : box(-b.x, b.z, b.w, b.d, b.h, b.kind, base);
      const pal = b.h > 20 ? TIER_TOWERS[tier] : TIER_WALLS[tier];
      const signs = tier === 0 ? SIGNS_LOW : tier === 1 ? SIGNS_MID : SIGNS_HIGH;
      const j = Math.floor(hash(-b.x, b.z * 1.3) * 1000);
      boxes.push({ ...m, color: pal[(pal.indexOf(b.color!) + 1 + (j % (pal.length - 1))) % pal.length], windows: true, face: [-(b.face?.[0] ?? 0), b.face?.[1] ?? 0], front: b.front, ...(b.sign ? { sign: signs[(signs.indexOf(b.sign) + 11 + (j % 7)) % signs.length] } : {}) });
    }
    const blocked = (x: number, z: number) => keepOut.some((q) => inRect(q, x, z, 0.8)); // (the taco cart isn't mirrored)
    for (const b of boxes.slice(boxStart)) if ((b.kind === "hydrant" || b.kind === "table") && b.x < -0.5 && !blocked(-b.x, b.z)) boxes.push({ ...box(-b.x, b.z, b.w, b.d, b.h, b.kind), ...(b.kind === "table" ? { color: "#8e1f2e" } : {}) });
    // (R4: Little Italy's stalls become Chinatown's, worth the same: pizza and gelato carts = dumpling steamers,
    //  souvenirs = souvenirs, the deli counter = the seafood tank)
    const TWIN: Partial<Record<PropKind, PropKind>> = { pizzacart: "steamer", gelato: "steamer", ricordi: "trinkets", deli: "fishtank" };
    for (const [kind, x, z, yaw, w, d, h] of propLog) if (!blocked(-x, z)) prop(TWIN[kind] ?? kind, -x, z, -yaw, w, d, h);
    for (const l of loot.slice(lootStart)) if (l.x < -0.5 && (l.y > 0.5 || !blocked(-l.x, l.z))) spawnAt(-l.x, l.z, l.zone, l.y);
    for (const dd of decor.slice(decorStart)) if (dd.kind === "umbrella" && dd.x < -0.5) decor.push({ ...dd, x: -dd.x, text: "cn" });
    for (const dd of decor.slice(decorStart)) {
      if (dd.kind !== "streetsign" || dd.x > -0.5) continue;
      const text = (dd.text ?? "|").split("|").map((t) => swapName[t] ?? t).join("|");
      decor.push({ ...dd, x: -dd.x, yaw: -(dd.yaw ?? 0), yaw2: -(dd.yaw2 ?? 0), text });
    }
    for (const ch of navChains.slice(chainStart)) navChains.push(ch.map((q) => ({ x: -q.x, z: q.z })));
  };
  // (R2: the road test builds its own plain blocks and skips every landmark below, down to Tent Town)
  let bank: NonNullable<ArenaLayout["bank"]> | undefined, statue: NonNullable<ArenaLayout["statue"]> | undefined, resto: NonNullable<ArenaLayout["resto"]> | undefined;
  let club: NonNullable<ArenaLayout["club"]> | undefined, chinatown: NonNullable<ArenaLayout["chinatown"]> | undefined, littleItaly: NonNullable<ArenaLayout["chinatown"]> | undefined;
  const pumpBoxes: number[] = [];
  const pit = R(-87, -59, -85, -52);
  /** the build yard (classic: the rail yard's south end; R2: the park) */
  const T = R2 ? { x: 0, z: -8 } : { x: -97.5, z: -62 };
  const dock = R(-99, -96, 8, 16);
  if (R2) {
    fillRoadTest();
    // R4: the two themed streets: their gates (just inside each end), the lights strung across, the parade route
    const z0 = NEW.gahookz + 4 + 6, z1 = -4 - 6, I = NEW.inner;
    const street = (x: number) => R(x - 4, x + 4, z0 - 6, z1 + 6);
    const rows: number[] = [];
    for (let z = z0 + 4; z < z1 - 3; z += 6.5) if (Math.abs(z - NEW.trolley) > 8) rows.push(Math.round(z * 10) / 10);
    const gates = (x: number) => [{ x, z: z0, w: 12 }, { x, z: z1, w: 12 }];
    for (const x of [-I, I]) for (const g of gates(x)) for (const sx of [-1, 1]) boxes.push({ ...box(g.x + sx * (g.w / 2 - 0.2), g.z, 0.6, 0.6, 7.2, "wall"), hide: true });
    chinatown = { street: street(I), gates: gates(I), lanternRows: rows, route: [{ x: I, z: z0 - 4 }, { x: I, z: z1 + 4.5 }] };
    littleItaly = { street: street(-I), gates: gates(-I), lanternRows: rows, route: [{ x: -I, z: z0 - 4 }, { x: -I, z: z1 + 4.5 }] };
  }
  else {
  for (const s of specs) fillBlock(s);
  // =================================================================================================
  // C5c: UPTOWN LANDMARKS: the Trashington Bank (where the country club was), the Mayor's Golden Statue
  // (Mile West), and a golden stash in each (Mile East plaza too).
  // =================================================================================================
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

    // ---- C5c.2: LE DUMPSTÈRE on Mile East (Blake: a fancy restaurant). The maître d' at the front door only
    // lets you in if you've booked a table ($20 at his podium) or you're dressed for it (carrying something
    // designer); knock him out, or slip in the kitchen's back door (the chef yells if he sees you), or climb the
    // crates round the back onto the roof terrace and come down the stairs. Inside: the dining room (a grand
    // piano, the cloakroom, the dessert trolley), the kitchen; up top: the chef's table, herb beds, a golden stash.
    // (The Diamond Pigeon's brick is round the back.)
    const me = R(5, 24, 56, 67);
    ground(me, "sidewalk");
    blocks.push({ name: "Uptown: LE DUMPSTERE", rect: me, tier: 2, open: ["N", "S", "E", "W"] });
    const C = R(6.5, 21.5, 57.5, 65.5), CH = 5, CT = 0.4, wallC = "#6b1f2e", roofY = CH + 0.3;
    const cw = (x0: number, x1: number, z0: number, z1: number, h: number, y = 0, col = wallC) => boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, "wall", y), color: col });
    boxes.push({ ...box(14, 61.5, C.maxX - C.minX - 0.8, C.maxZ - C.minZ - 0.8, 0.03, "shopfloor", 0.15), color: "#d8c8a8" });
    cw(C.minX, C.minX + CT, C.minZ, 60.5, CH); cw(C.minX, C.minX + CT, 62.5, C.maxZ, CH); cw(C.minX, C.minX + CT, 60.5, 62.5, CH - 3.2, 3.2); // (west: the front door, 2 m wide)
    cw(C.maxX - CT, C.maxX, C.minZ, 61.0, CH); cw(C.maxX - CT, C.maxX, 62.6, C.maxZ, CH); cw(C.maxX - CT, C.maxX, 61.0, 62.6, CH - 2.8, 2.8); // (east: the kitchen's back door)
    cw(C.minX, C.maxX, C.minZ, C.minZ + CT, CH); cw(C.minX, C.maxX, C.maxZ - CT, C.maxZ, CH);
    // the kitchen wall (a swing-door gap) between the dining room and the kitchen
    const KX = 17.9;
    cw(KX, KX + 0.25, C.minZ + CT, 61.0, CH, 0, "#e8e2d4"); cw(KX, KX + 0.25, 62.4, C.maxZ - CT, CH, 0, "#e8e2d4"); cw(KX, KX + 0.25, 61.0, 62.4, CH - 2.6, 2.6, "#e8e2d4");
    // the roof (a hole over the stairs) and its parapet (a gap on the east side, where the crates are)
    const SX0 = 11, SX1 = 17.75, SZ0 = C.minZ + CT, SZ1 = SZ0 + 1.2;
    const roof = (x0: number, x1: number, z0: number, z1: number) => boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.3, "roof", CH), color: "#5a5163" });
    roof(C.minX, C.maxX, SZ1, C.maxZ); roof(C.minX, SX0, C.minZ, SZ1); roof(SX1, C.maxX, C.minZ, SZ1);
    const par = (x0: number, x1: number, z0: number, z1: number, h = 0.9) => cw(x0, x1, z0, z1, h, roofY, "#e8e2d4");
    par(C.minX, C.minX + 0.3, C.minZ, C.maxZ); par(C.minX, C.maxX, C.maxZ - 0.3, C.maxZ); par(C.minX, C.maxX, C.minZ, C.minZ + 0.3);
    par(C.maxX - 0.3, C.maxX, C.minZ, 59.4); par(C.maxX - 0.3, C.maxX, 60.6, C.maxZ);
    par(SX0, SX1, SZ1, SZ1 + 0.1, 1.0); par(SX0 - 0.1, SX0, SZ0, SZ1, 1.0); // (a rail round the stairwell)
    // the stairs up to the roof (15 steps along the south wall)
    for (let i = 0; i < 15; i++) boxes.push({ ...box(SX0 + 0.225 + i * 0.45, (SZ0 + SZ1) / 2, 0.45, 1.2, (i + 1) * 0.35, "step"), color: "#8e7a63" });
    // the climb round the back: a crate, then a stack of boxes, then the gap in the parapet
    boxes.push({ ...box(23.2, 58.6, 1.4, 1.2, 1.6, "crate") });
    boxes.push({ ...box(22.3, 60.0, 1.4, 1.4, 3.4, "boxes") });
    prop("stash", C.maxX + 0.02, 63.8, Math.PI / 2, 0, 0, 0, { y: 0.35, loot: ["diamond_pigeon"] });
    // the dining room: four tables with white cloths, a grand piano, the cloakroom by the door, the dessert trolley
    for (const [x, z] of [[10.4, 61.6], [13.9, 61.6], [10.4, 64.0], [13.9, 64.0]]) {
      boxes.push({ ...box(x, z, 1.2, 1.2, 0.76, "desk"), color: "#f4f1ea" });
      for (const s of [-1, 1]) boxes.push({ ...box(x + s * 0.95, z, 0.45, 0.45, 0.5, "chair"), color: "#6b1f2e" });
    }
    boxes.push({ ...box(16.4, 60.4, 1.3, 1.7, 1.0, "desk"), color: "#1b1420" });
    prop("piano", 16.4, 60.4, -Math.PI / 2, 0, 0, 0, { y: 1.0 });
    boxes.push({ ...box(8.4, 58.8, 2.4, 0.7, 1.1, "counter"), color: "#6b3f22" });
    prop("cloakroom", 8.4, 58.8, Math.PI, 0, 0, 0, { y: 1.1 });
    prop("dessertcart", 16.3, 64.2, Math.PI, 0, 0, 0, { y: 0.9 });
    // the kitchen: a stove along the north wall, a prep counter along the south
    boxes.push({ ...box(19.75, 64.55, 2.7, 0.8, 1.0, "counter"), color: "#c9ccd4" });
    prop("kitchen", 19.75, 64.55, 0, 0, 0, 0, { y: 1.0 });
    boxes.push({ ...box(19.75, 58.45, 2.7, 0.8, 1.0, "counter"), color: "#c9ccd4" });
    for (const [x, z] of [[9, 62.8], [12.2, 62.8], [19.5, 61.8]]) spawnAt(x, z, "shop", 0.18);
    // the rooftop terrace: the chef's table, herb beds, banquettes, the Golden Truffle behind a loose brick in the parapet
    boxes.push({ ...box(15, 63.5, 1.6, 0.9, 0.75, "desk", roofY), color: "#f4f1ea" });
    prop("chefstable", 15, 63.5, Math.PI, 0, 0, 0, { y: roofY + 0.75 });
    boxes.push({ ...box(19.4, 63.4, 2.4, 2.4, 0.6, "rim", roofY), color: "#8b5a2b" });
    for (const [x, z, w, d] of [[10, 64.6, 2.6, 0.9], [7.4, 62.5, 0.9, 2.4]] as const) boxes.push({ ...box(x, z, w, d, 0.5, "sofa", roofY), color: "#6b1f2e" });
    prop("stash", 12.2, C.maxZ - 0.3 - 0.02, Math.PI, 0, 0, 0, { y: roofY + 0.4, loot: ["golden_truffle"] });
    spawnAt(12.5, 62.5, "rooftop", roofY);
    // the maître d's podium and the maître d' out front
    prop("podium", 5.6, 59.8, -Math.PI / 2, 0, 0, 0, {});
    posts.push({ kind: "maitre_d", x: 5.75, z: 63.0, yaw: -Math.PI / 2 });
    spawnAt(22.8, 64.5, "street", 0.15);
    resto = { rect: C, door: R(6.3, 7.4, 60.5, 62.5), out: { x: 5.2, z: 61.5, yaw: -Math.PI / 2 }, hall: R(7, KX, SZ1, C.maxZ - CT), kitchen: R(KX + 0.25, C.maxX - CT, C.minZ + CT, C.maxZ - CT), stairs: R(SX0, SX1, SZ0, SZ1), roofY };
  }
  // =================================================================================================
  // C5c.3: THE COMPACTOR (Blake: "the most unique night club, do not hold off from detail"). An old trash-compactor
  // plant on Crooked St, backing onto the rail yard. Big Crunch on the door ($15 cover, or VIPs: 5+ aura or a VIP
  // wristband). Sneak in on the trash conveyor at the loading dock (crouch under the rubber flap), or climb the dock's
  // bales onto the back roof and take the maintenance door onto the balcony. Inside: the main hall with the CRUSHER-BED
  // dance floor (it pumps to the beat; every 75 s THE DROP builds it up, slams it down and launches everyone on it),
  // the DJ in a crane cab over the floor (hijack the decks: aura, a roar, and the drop starts NOW), the conveyor-belt
  // bar, the VIP "Bale Room" balcony; backstage: the sorting room, the green room (the DJ's rider), the manager's
  // office (the safe holds every cover charge paid today). Up top: the smokestack and a roof lounge with a dumpster
  // hot tub and the Golden Record.
  // =================================================================================================
  {
    const blk = R(-87, -59, -44, -4);
    ground(blk, "sidewalk");
    blocks.push({ name: "Old Brick: THE COMPACTOR", rect: blk, tier: 1, open: ["N", "S", "E", "W"] });
    const C = R(-82, -64, -39, -9), HH = 10, WH = 5, wingY = 5.3, roofY = HH + 0.3, balY = 5.3;
    const brick = "#8a3f30", inner = "#2b2433";
    const cw = (x0: number, x1: number, z0: number, z1: number, h: number, y = 0, col = brick, extra: Partial<Box> = {}) =>
      boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, "wall", y), color: col, ...extra });
    const bx = (x0: number, x1: number, z0: number, z1: number, h: number, kind: Box["kind"], y = 0, extra: Partial<Box> = {}) => {
      boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, kind, y), ...extra });
      return boxes.length - 1;
    };
    const at = (x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], y = 0, extra: Partial<Box> = {}) => bx(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h, kind, y, extra);
    // floors: black rubber in the hall, concrete backstage
    bx(-74.8, -64.4, -38.6, -9.4, 0.03, "shopfloor", 0.15, { color: "#1f1a28" });
    bx(-81.6, -75.2, -38.6, -9.4, 0.03, "shopfloor", 0.15, { color: "#6a6670" });
    // ---- outer walls: the backstage wing (west, one storey) and the main hall (east, double height) ----
    cw(-82, -75, -39, -38.6, WH); cw(-75, -64, -39, -38.6, HH);
    cw(-82, -75, -9.4, -9, WH); cw(-75, -64, -9.4, -9, HH);
    // west: the conveyor's rubber flap (1.3 m high over the belt: crouch to get through)
    cw(-82, -81.6, -39, -21.7, WH); cw(-82, -81.6, -20.3, -9, WH); cw(-82, -81.6, -21.7, -20.3, WH - 2.2, 2.2, brick, { deco: "flap" });
    // east (Crooked St): the front door through the hopper mouth, THE COMPACTOR over it
    cw(-64.4, -64, -39, -30.5, HH); cw(-64.4, -64, -28.5, -9, HH);
    cw(-64.4, -64, -30.5, -28.5, HH - 3.2, 3.2, brick); // (its neon sign is drawn by the renderer)
    // the partition between the wing and the hall (the hall's west wall above the wing's roof): a staff door at the
    // bottom (under the balcony), the maintenance door onto the balcony from the wing's roof
    cw(-75.2, -74.8, -39, -14.4, HH, 0, inner); cw(-75.2, -74.8, -13.0, -11.6, HH, 0, inner); cw(-75.2, -74.8, -10.4, -9, HH, 0, inner);
    cw(-75.2, -74.8, -14.4, -13.0, HH - 2.4, 2.4, inner);
    cw(-75.2, -74.8, -11.6, -10.4, wingY, 0, inner); cw(-75.2, -74.8, -11.6, -10.4, HH - 7.6, 7.6, inner, { deco: "maintdoor" });
    // ---- backstage: the office | the green room | the sorting room | the stair room (doors at x -78.7..-77.3) ----
    for (const z of [-33.2, -27.2, -16.6]) {
      cw(-81.6, -78.7, z, z + 0.2, WH, 0, "#6b6f86"); cw(-77.3, -75.2, z, z + 0.2, WH, 0, "#6b6f86"); cw(-78.7, -77.3, z, z + 0.2, WH - 2.4, 2.4, "#6b6f86");
    }
    // the wing's roof (a hole over the stair room's stairs) and its parapet (a gap on the west, over the dock's bales)
    const wroof = (x0: number, x1: number, z0: number, z1: number) => bx(x0, x1, z0, z1, 0.3, "roof", WH, { color: "#5c5058" });
    wroof(-82, -74.8, -39, -12.6); wroof(-80.2, -74.8, -12.6, -9); wroof(-82, -81.6, -12.6, -9); wroof(-81.6, -80.2, -9.4, -9);
    const wpar = (x0: number, x1: number, z0: number, z1: number, h = 0.6) => cw(x0, x1, z0, z1, h, wingY, "#6f5a50");
    wpar(-82, -75.2, -39, -38.7); wpar(-82, -75.2, -9.3, -9); wpar(-82, -81.7, -39, -27.2); wpar(-82, -81.7, -25.6, -9.3);
    wpar(-81.6, -80.2, -12.7, -12.6, 1.0); // (a rail on the stairwell's open side)
    // the staff stairs in the stair room: 15 steps up the west wall, out onto the wing's roof
    for (let i = 0; i < 15; i++) bx(-81.5, -80.3, -15.4 + i * 0.4, -15.0 + i * 0.4, ((i + 1) * wingY) / 15, "step", 0, { color: "#5c5866" });
    // ---- the office: the manager's desk (CCTV monitors), the safe ----
    at(-78.6, -36.2, 1.8, 0.9, 0.8, "desk", 0, { color: "#3a2a1c", deco: "monitors" });
    at(-80.8, -37.0, 0.5, 0.5, 0.5, "chair", 0, { color: "#1b1420" });
    at(-81.15, -35.0, 0.8, 0.9, 1.0, "crate", 0, { deco: "safe", hide: true });
    prop("clubsafe", -80.68, -35.0, Math.PI / 2, 0, 0, 0, { y: 0.55 });
    at(-76.0, -38.1, 1.6, 0.6, 2.0, "shelf", 0, { color: "#4a4652", deco: "files" });
    // ---- the green room: a sofa, the DJ's rider on a table, a clothes rail, a mirror with bulbs ----
    at(-80.9, -30.1, 0.9, 2.4, 0.5, "sofa", 0, { color: "#9b3fd6" });
    at(-77.6, -30.1, 1.2, 1.2, 0.8, "table", 0, { color: "#f4f1ea", deco: "rider" });
    prop("rider", -77.6, -30.1, -Math.PI / 2, 0, 0, 0, { y: 0.8 });
    at(-76.0, -28.0, 1.6, 0.5, 1.6, "rack", 0, { color: "#2b2433" });
    at(-75.45, -31.4, 0.1, 1.6, 2.0, "wall", 0, { color: "#f4f1ea", deco: "bulbmirror", hide: true });
    // ---- the sorting room: the conveyor comes in through the west wall's flap, a recycling cage, bales, the lockers ----
    const belt = bx(-86.4, -77.6, -21.7, -20.3, 0.9, "platform", 0, { color: "#2b2433", belt: [CLUB.beltSpeed, 0], deco: "belt" });
    void belt;
    at(-77.0, -23.4, 1.4, 1.8, 1.2, "dumpster", 0, { color: "#3d8f5a", deco: "sortbin" });
    prop("sortbin", -77.0, -23.4, Math.PI, 0, 0, 0, { y: 1.2 });
    at(-80.6, -18.3, 1.6, 1.4, 1.4, "cage", 0, { color: "#8a8a96" });
    at(-76.3, -18.0, 1.2, 1.2, 1.2, "boxes", 0, { deco: "bale", color: "#6b8f5a" });
    at(-80.6, -24.2, 1.2, 2.0, 2.0, "boxes", 0, { deco: "forklift", hide: true });
    at(-79.8, -26.7, 2.4, 0.5, 2.0, "shelf", 0, { color: "#5c7a9e", deco: "lockers" });
    prop("lockers", -79.8, -26.4, 0, 0, 0, 0, { y: 1.2 });
    // ---- the stair room: flight cases ----
    at(-76.6, -11.0, 1.0, 0.8, 0.9, "boxes", 0, { color: "#1b1420", deco: "flightcase" });
    at(-76.6, -12.3, 1.0, 0.8, 0.6, "boxes", 0, { color: "#1b1420", deco: "flightcase" });
    // ---- the hall ----
    // the CRUSHER BED (the dance floor): its height follows the club clock (see applyClubFloor)
    const floor = R(-73, -66, -25, -17);
    pumpBoxes.push(bx(floor.minX, floor.maxX, floor.minZ, floor.maxZ, CLUB.base, "platform", 0, { color: "#5c5866", pump: true, deco: "crusher" }));
    // speaker stacks round the floor
    at(-74.2, -26.2, 1.0, 1.2, 2.6, "boxes", 0, { color: "#1b1420", deco: "speaker" });
    at(-74.2, -15.8, 1.0, 1.2, 2.6, "boxes", 0, { color: "#1b1420", deco: "speaker" });
    at(-65.0, -26.2, 1.0, 1.2, 2.6, "boxes", 0, { color: "#1b1420", deco: "speaker" });
    // the conveyor-belt bar along the south wall, the back bar, stools
    at(-70.5, -35.1, 7, 0.8, 1.1, "counter", 0, { color: "#3a3444", deco: "beltbar" });
    prop("clubbar", -70.5, -35.1, 0, 0, 0, 0, { y: 1.1 });
    at(-70.5, -38.3, 8, 0.5, 2.4, "shelf", 0, { color: "#2b2433", deco: "backbar" });
    for (const x of [-73.3, -71.7, -70.1, -68.5]) at(x, -34.2, 0.45, 0.45, 0.7, "chair", 0, { color: "#ff3cac" });
    // crushed-car-cube seats along the west wall, a photo booth by the door
    at(-74.1, -30.5, 1.2, 1.6, 0.6, "sofa", 0, { color: "#d6264a", deco: "carcube" });
    at(-74.1, -32.8, 1.2, 1.6, 0.6, "sofa", 0, { color: "#3d6fb5", deco: "carcube" });
    at(-72.6, -31.6, 0.8, 0.8, 0.45, "table", 0, { color: "#8a8a96" });
    at(-65.3, -32.6, 1.2, 1.2, 2.2, "boxes", 0, { deco: "photobooth", hide: true });
    // the stairs up to the balcony (along the east wall, rising north)
    for (let i = 0; i < 15; i++) bx(-65.8, -64.4, -19.75 + i * 0.45, -19.3 + i * 0.45, ((i + 1) * balY) / 15, "step", 0, { color: "#4a4652" });
    // the balcony (the Bale Room, VIPs) across the north end; its railing leaves gaps for the crane cab and the stairs
    bx(-74.8, -64.4, -13, -9.4, 0.3, "slab", balY - 0.3, { color: "#3a3444" });
    cw(-74.8, -71.5, -13.1, -13.0, 1.05, balY, "#ffcf3a", { deco: "rail" }); cw(-67.5, -65.8, -13.1, -13.0, 1.05, balY, "#ffcf3a", { deco: "rail" });
    at(-66.6, -10.4, 1.8, 1.2, 0.6, "sofa", balY, { color: "#ffcf3a", deco: "carcube" });
    at(-70.5, -9.95, 2.4, 0.7, 0.6, "sofa", balY, { color: "#9b3fd6", deco: "carcube" });
    at(-70.5, -11.1, 1.0, 0.8, 0.5, "table", balY, { color: "#f4f1ea" });
    prop("vipbooth", -70.5, -11.1, Math.PI, 0, 0, 0, { y: balY + 0.5 });
    // the DJ's crane cab, hanging over the north end of the dance floor (in from the balcony)
    const cab = R(-71.5, -67.5, -17.8, -13);
    bx(cab.minX, cab.maxX, cab.minZ, cab.maxZ, 0.3, "slab", balY - 0.3, { color: "#ffcf3a", deco: "cab" });
    cw(cab.minX, cab.minX + 0.15, cab.minZ, cab.maxZ, 1.0, balY, "#ffcf3a"); cw(cab.maxX - 0.15, cab.maxX, cab.minZ, cab.maxZ, 1.0, balY, "#ffcf3a");
    cw(cab.minX, cab.maxX, cab.minZ, cab.minZ + 0.15, 1.0, balY, "#ffcf3a");
    bx(cab.minX, cab.maxX, cab.minZ, cab.minZ + 0.1, 1.1, "glass", balY + 1.0);
    bx(cab.minX, cab.maxX, cab.minZ, cab.maxZ - 0.6, 0.2, "roof", balY + 2.3, { color: "#ffcf3a", deco: "cabroof" });
    at(-69.5, -17.25, 2.4, 0.7, 1.0, "desk", balY, { color: "#1b1420", deco: "decks" });
    prop("djdecks", -69.5, -17.25, Math.PI, 0, 0, 0, { y: balY + 1.0 });
    // ---- the roofs: the smokestack on the wing, the service stair up to the hall's roof, the roof lounge ----
    bx(-75.2, -64, -39, -9, 0.3, "roof", HH, { color: "#3a3444" });
    const hpar = (x0: number, x1: number, z0: number, z1: number) => cw(x0, x1, z0, z1, 0.7, roofY, "#6f5a50");
    hpar(-75.2, -64, -39, -38.7); hpar(-75.2, -64, -9.3, -9); hpar(-64.3, -64, -39, -9); hpar(-75.2, -74.9, -39, -25.3); hpar(-75.2, -74.9, -23.9, -9);
    const stack = { x: -79, z: -36, r: 1.4, h: 22 };
    at(stack.x, stack.z, 2.8, 2.8, stack.h, "wall", wingY, { deco: "stack", hide: true });
    for (let i = 0; i < 13; i++) bx(-76.6, -75.2, -31.1 + i * 0.5, -30.6 + i * 0.5, ((i + 1) * (roofY - wingY)) / 13, "step", wingY, { color: "#5c5866", deco: "fireescape" });
    at(-69, -33, 2.6, 2.0, 0.6, "rim", roofY, { color: "#3d8f5a", deco: "hottub" });
    at(-72.6, -28.5, 0.8, 2.0, 0.4, "sofa", roofY, { color: "#ff3cac" });
    at(-66.2, -28.5, 0.8, 2.0, 0.4, "sofa", roofY, { color: "#43c7a6" });
    prop("stash", -69.5, -38.68, 0, 0, 0, 0, { y: roofY + 0.4, loot: ["golden_record"] });
    // ---- outside: the loading dock (west, by the railway), its bales (the climb), the rope and the queue (east) ----
    bx(-86.4, -82.1, -24.4, -21.7, 0.9, "dock", 0, { color: "#8a8a96" });
    bx(-86.4, -85.4, -25.2, -24.4, 0.45, "step", 0, { color: "#8a8a96" });
    at(-84.2, -25.3, 1.4, 1.4, 2.8, "boxes", 0, { deco: "bale", color: "#8a9a5b" });
    at(-82.9, -26.4, 1.2, 1.4, 4.4, "boxes", 0, { deco: "bale", color: "#6b8f5a" });
    prop("clubrope", -62.8, -31.6, Math.PI / 2, 0, 0, 0, { y: 1.0 });
    posts.push({ kind: "bouncer", x: -62.6, z: -27.3, yaw: Math.PI / 2 });
    spawnAt(-72, -30, "shop", 0.18); spawnAt(-68, -11.5, "shop", 0.18); spawnAt(-79, -19.5, "room", 0.18); spawnAt(-73.6, -10.6, "room", balY); spawnAt(-67, -36, "rooftop", roofY);
    spawnAt(-84.6, -22.6, "alley", 0.9);
    club = {
      rect: C, hall: R(-74.8, -64.4, -38.6, -9.4), wing: R(-81.6, -75.2, -38.6, -9.4), door: R(-64.6, -63.3, -30.5, -28.5),
      out: { x: -62.0, z: -29.5, yaw: Math.PI / 2 }, floor, cab, cabY: balY, office: R(-81.6, -75.2, -38.6, -33.2),
      belt: R(-86.4, -77.6, -21.7, -20.3), beltY: 0.9, balcony: R(-74.8, -64.4, -13, -9.4), balconyY: balY, wingY, roofY, stack,
    };
  }

  // C5b: CHINATOWN: the Market Row street by the canal (x 69..75, z -21..21). Two rows of shophouses face
  // it from the east (curved tiled roofs, lanterns, hanging signs), street stalls in front of them, the
  // market hall's side on the west, a red gate at each end and lanterns strung across the road.
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
  boxes.push(box(-110, -91.5, 1.3, 1.3, 2.4, "portaloo"));
  boxes.push(box(-104, -91.5, 2.0, 1.4, 1.6, "mixer"));
  boxes.push(box(-99, -91.5, 1.2, 1.2, 0.5, "pallet"));
  boxes.push({ ...box(-114.6, -66, 0.6, 40, 2.6, "fence"), sign: "BUILD YARD: KEEP OUT (OR DON'T)", face: [1, 0] });
  for (const [x, z] of [[-110, -50], [-102, -78]]) spawnAt(x, z, "yard", 0.15);
  // --- the junkyard (C4b: the old tutorial ledges and crawl tunnel are gone; the browser tests climb the
  //     freight loading dock and crawl the sewer pipe instead) ---
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

  } // (end of the classic city's blocks and landmarks)

  // =================================================================================================
  // TENT TOWN under the highway, between the railway and the canal: four open fort yards (no walls:
  // walls are bought in the upgrades), evenly spaced, junk clusters between them, the broken ramp lookout
  // =================================================================================================
  const forts: FortLot[] = [];
  let southZ = -HALF;
  const lots: { name: string; rect: Rect }[] = [];
  if (R2) {
    // ---- R3: the fort bowl under a curved viaduct. The four yards sit on a curve (the middle two deeper, so all
    //      four are the same walk from the roundabout), evenly spaced across, the outer two 7.5 m from the side
    //      walls. The viaduct is looks only: no deck to stand on, no ramp; just its pillars on the ground. ----
    const F = NEW_FORTS, top = NEW.gahookz - 4; // (the lane's south kerb)
    southZ = Math.min(...F.zs) - F.depth / 2 - 9;
    ground(R(-HALF, HALF, southZ, top), "plaza", "#9a8a6e");
    blocks.push({ name: "Tent Town", rect: R(-HALF, HALF, southZ, top), tier: 0, open: ["N", "S", "E", "W"] });
    F.xs.forEach((cx, slot) => {
      const zc = F.zs[slot], z0 = zc - F.depth / 2, z1 = zc + F.depth / 2;
      const fortBox = box(cx, z0 + 3.5, 2.4, 1.9, 1.5, "fort");
      boxes.push(fortBox);
      forts.push({ slot, x: cx, z: fortBox.z, padX: cx, padZ: z0 + 9.5, yaw: 0, zone: R(cx - F.half, cx + F.half, z0, z1), backX: cx, backZ: z0 - 2 });
    });
    // the viaduct: a circle through the four yards, symmetric about the middle (centre (0, c) north of town)
    const [xo, xi] = [F.xs[1], F.xs[3]], [zo, zi] = [F.zs[1], F.zs[3]];
    const c = (xo * xo + zo * zo - xi * xi - zi * zi) / (2 * (zo - zi)), Rv = Math.hypot(xi, zi - c);
    const curveZ = (x: number) => c - Math.sqrt(Math.max(0, Rv * Rv - x * x));
    const segs = 24, x0 = -HALF - 2, x1 = HALF + 2;
    for (let q = 0; q < segs; q++) {
      const xa = x0 + ((x1 - x0) * q) / segs, xb = x0 + ((x1 - x0) * (q + 1)) / segs, za = curveZ(xa), zb = curveZ(xb);
      scenery.push({ kind: "viaduct", x: (xa + xb) / 2, z: (za + zb) / 2, w: 14, d: Math.hypot(xb - xa, zb - za) + 0.3, h: HIGHWAY.y, yaw: Math.atan2(xb - xa, zb - za) });
    }
    // pillars in pairs either side of the deck's middle line, between the yards (solid, on the ground)
    const between = [-HALF + 2, (F.xs[0] + F.xs[2]) / 2, 0, (F.xs[3] + F.xs[1]) / 2, HALF - 2];
    for (const x of between) {
      const z = curveZ(x), t = Math.atan2(x, c - z); // (the curve's normal points at its centre)
      for (const o of [-4.5, 4.5]) boxes.push({ ...box(x + Math.sin(t) * o, z + Math.cos(t) * o, 1.8, 1.8, HIGHWAY.y, "wall"), color: "#9aa3b5", hide: true });
      scenery.push({ kind: "pillar", x, z, yaw: t, h: HIGHWAY.y });
    }
    // junk between the yards: tents, crates, burning barrels (cover for raids), the same round every yard
    const junk = (x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "junk", color?: string) => boxes.push({ ...box(x, z, w, d, h, kind), ...(color ? { color } : {}) });
    const gaps = [(F.xs[0] + F.xs[2]) / 2, 0, (F.xs[3] + F.xs[1]) / 2];
    gaps.forEach((gx, q) => {
      const gz = curveZ(gx);
      junk(gx - 5, gz + 4, 3, 2.4, 1.4, "junk", ["#3d6fb5", "#e14b4b", "#6aa84f"][q]);
      junk(gx + 5, gz - 3, 2.6, 2.6, 1.3, "junk", ["#ffcf3a", "#43c7a6", "#9f5fd6"][q]);
      junk(gx - 2, gz - 6, 2, 2, 1.1, "crate");
      junk(gx + 3, gz + 6, 1.2, 1.2, 0.9, "crate");
      prop("bin", gx + 1.5, gz + 1, 0, 0.7, 0.7, 1.0); // burning barrel
      spawnAt(gx, gz - 2, "yard", 0.15); spawnAt(gx - 4, gz + 7, "yard", 0.15);
    });
    for (const x of [-HALF + 4, HALF - 4]) spawnAt(x, curveZ(x) + 6, "yard", 0.15);
    for (const x of [-99.5, -66.33, -33.17, 0, 33.17, 66.33, 99.5]) decor.push({ kind: "streetlight", x, z: top - 1.2 });
    // the south fence (the squat's tenement stands in it, between the middle yards)
    boxes.push(box(0, southZ - 0.5, HALF * 2 + 2, 1, 3, "fence"));
    // THE LANDMARK LOTS north of Snob Row: big empty plots behind hoardings, for Blake to place the landmarks
    const lz0 = NEW.snob + 4 + SW, lz1 = HALF - 2;
    const spans: [string, number, number][] = [["Lot W2", -111, -71], ["Lot W1", -67, -24], ["Lot C", -20, 20], ["Lot E1", 24, 67], ["Lot E2", 71, 111]];
    for (const [name, a, b] of spans) {
      const r = R(a, b, lz0, lz1);
      lots.push({ name, rect: r });
      const ply = "#c8a46a", hh = 2.6, t = 0.3;
      const wall = (x: number, z: number, w: number, d: number, extra: Partial<Box> = {}) => boxes.push({ ...box(x, z, w, d, hh, "wall"), color: ply, ...extra });
      wall((a + b) / 2, lz0 + t / 2, b - a, t, { sign: "COMING SOON: SOMETHING EXPENSIVE", face: [0, -1] });
      wall((a + b) / 2, lz1 - t / 2, b - a, t);
      wall(a + t / 2, (lz0 + lz1) / 2, t, lz1 - lz0 - 2 * t);
      wall(b - t / 2, (lz0 + lz1) / 2, t, lz1 - lz0 - 2 * t);
    }
  } else {
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
  }

  // =================================================================================================
  // THE POLICE PRECINCT, Market Row by the east road and the canal, front door on the south street
  // =================================================================================================
  const station = (() => {
    if (R2) {
      // ============ R7: the grand station, all the way from Shopping Trolley Terrace to Gahookz Ghetto Lane (the pawn shop
      // moved out to the sides). GROUND FLOOR: the lobby (the receptionist's desk, the stairs up), a hallway down the
      // middle, two interrogation rooms (one-way mirrors onto the hallway), the breakroom, booking, and the holding cell
      // tucked away at the back. FIRST FLOOR (walkable): cubicles and partitions, offices, the chief's corner office and
      // the evidence room (your confiscated loot, guarded). The floors above are looks only.
      const P0 = NEW_PRECINCT, H = 4.5, UY = 4.8, UT = 9.0, D = P0.maxZ - P0.minZ, zf = P0.maxZ, x0 = P0.minX, x1 = P0.maxX;
      const V = (v: number) => zf - v;
      const RV = (xa: number, xb: number, va: number, vb: number) => R(xa, xb, Math.min(V(va), V(vb)), Math.max(V(va), V(vb)));
      const wc = "#d8d2c6";
      const wall = (xa: number, xb: number, va: number, vb: number, h = H, y0 = 0, color = wc, kind: Box["kind"] = "wall", extra: Partial<Box> = {}) =>
        boxes.push({ ...box((xa + xb) / 2, (V(va) + V(vb)) / 2, xb - xa, Math.abs(vb - va), h, kind, y0), color, ...extra });
      const thing = (x: number, v: number, w: number, d: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, y0 = 0) =>
        boxes.push({ ...box(x, V(v), w, d, h, kind, y0), ...extra });
      // (a wall along v with doorways: gaps [from, to] in v; a wall along x with gaps in x)
      const wallV = (x: number, va: number, vb: number, gaps: [number, number][], h = H, y0 = 0, color = wc) => {
        let a = va;
        for (const [g0, g1] of gaps) { if (g0 > a) wall(x - 0.15, x + 0.15, a, g0, h, y0, color); wall(x - 0.15, x + 0.15, g0, g1, h - 2.6, y0 + 2.6, color); a = g1; }
        if (vb > a) wall(x - 0.15, x + 0.15, a, vb, h, y0, color);
      };
      const wallX = (v: number, xa: number, xb: number, gaps: [number, number][], h = H, y0 = 0, color = wc) => {
        let a = xa;
        for (const [g0, g1] of gaps) { if (g0 > a) wall(a, g0, v - 0.15, v + 0.15, h, y0, color); wall(g0, g1, v - 0.15, v + 0.15, h - 2.6, y0 + 2.6, color); a = g1; }
        if (xb > a) wall(a, xb, v - 0.15, v + 0.15, h, y0, color);
      };
      // ---- the shell: the glass front doors in the middle, the outside walls up to the first floor's ceiling ----
      // (R8: real glass: ribbon windows on the ground floor's front wings and right round the first floor, the chief's
      //  corner office glass to the corner on both sides; the walls are built round them. u: x on the front / back,
      //  metres in from the front on the sides)
      const windows: NonNullable<StationDef["grand"]>["windows"] = [
        { face: "N", u0: x0 + 0.8, u1: -3.6, y0: 1.0, y1: 3.0 }, { face: "N", u0: 3.6, u1: x1 - 0.8, y0: 1.0, y1: 3.0 },
        { face: "N", u0: x0 + 0.8, u1: 4.3, y0: 5.6, y1: 7.8 }, { face: "N", u0: 4.6, u1: x1, y0: 5.0, y1: 8.6 },
        { face: "E", u0: 0, u1: 6.4, y0: 5.0, y1: 8.6 }, { face: "E", u0: 6.8, u1: D - 0.8, y0: 5.6, y1: 7.8 },
        { face: "W", u0: 0.8, u1: D - 0.8, y0: 5.6, y1: 7.8 }, { face: "S", u0: x0 + 0.8, u1: x1 - 0.8, y0: 5.6, y1: 7.8 },
      ];
      const faceWall = (face: "N" | "S" | "E" | "W", ua: number, ub: number, holes: { u0: number; u1: number; y0: number; y1: number; glass: boolean }[]) => {
        const seg = (u0: number, u1: number, y0: number, y1: number, kind: Box["kind"]) => {
          if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
          const t = kind === "glass" ? 0.1 : 0.4, c = kind === "glass" ? undefined : wc;
          if (face === "N" || face === "S") { const vc = face === "N" ? 0.2 : D - 0.2; boxes.push({ ...box((u0 + u1) / 2, V(vc), u1 - u0, t, y1 - y0, kind, y0), ...(c ? { color: c } : {}) }); }
          else { const xc = face === "W" ? x0 : x1; boxes.push({ ...box(xc, (V(u0) + V(u1)) / 2, t, u1 - u0, y1 - y0, kind, y0), ...(c ? { color: c } : {}) }); }
        };
        const ys = [...new Set([0, UT, ...holes.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
        for (let i = 0; i + 1 < ys.length; i++) {
          const ya = ys[i], yb = ys[i + 1], act = holes.filter((h) => h.y0 <= ya && h.y1 >= yb).sort((a, b) => a.u0 - b.u0);
          let u = ua;
          for (const h of act) { seg(u, h.u0, ya, yb, "wall"); u = Math.max(u, h.u1); }
          seg(u, ub, ya, yb, "wall");
        }
        for (const h of holes) if (h.glass) seg(h.u0, h.u1, h.y0, h.y1, "glass"); // (one pane per window, not one per strip)
      };
      const holesOf = (f: string) => windows.filter((w) => w.face === f).map((w) => ({ ...w, glass: true }));
      faceWall("N", x0, x1, [...holesOf("N"), { u0: -1.5, u1: 1.5, y0: 0, y1: 2.8, glass: false }]); // (the front doors' opening)
      faceWall("S", x0 - 0.2, x1 + 0.2, holesOf("S")); faceWall("W", 0, D, holesOf("W")); faceWall("E", 0, D, holesOf("E"));
      // the front doors: two glass leaves (E: open / close; cops open them too)
      boxes.push({ ...box(0, V(0.2), 3.0, 0.12, 2.8, "glass"), hide: true });
      props.push({ id: "door1", kind: "door", x: 0, y: 1.4, z: V(0.2), yaw: 0, hw: 1.5, hd: 0.15, box: boxes.length - 1 });
      boxes.push({ ...box(0, (P0.minZ + P0.maxZ) / 2, x1 - x0 - 0.4, D - 0.4, 0.03, "shopfloor", 0.15), color: "#a3a6ad" }); // (R10: on the pavement, which covered it) // (R10: grey, under big floor tiles)
      // ---- the stairs: up the west side of the lobby, rising toward the back ----
      // (R9: one flight of the slate steps right across, from the wall out; Blake liked them)
      const SX0 = x0 + 0.2, SX1 = x0 + 2.3, SV0 = 1.0, steps = UNIT.steps, run = UNIT.stepRun, SV1 = SV0 + steps * run;
      for (let i = 1; i <= steps; i++) thing((SX0 + SX1) / 2, SV0 + (i - 0.5) * run, SX1 - SX0, run, 0.18 + (i * (UY - 0.18)) / steps, "step", { color: "#5a6070" });
      // the ground floor's ceiling = the first floor (a hole over the stairs), the first floor's ceiling
      wall(SX1, x1 - 0.2, 0.4, D - 0.4, 0.3, H, "#b8b2a6", "roof");
      wall(SX0, SX1, SV1, D - 0.4, 0.3, H, "#b8b2a6", "roof");
      wall(x0 + 0.2, x1 - 0.2, 0.4, D - 0.4, 0.3, UT, "#9a948a", "roof");
      wall(SX1 + 0.02, SX1 + 0.12, 0.6, SV1 - 1.2, 1.0, UY, "#3a4458"); // (the railing round the stairwell upstairs)
      // ---- the lobby: the receptionist's desk, benches, a water cooler, the wanted board ----
      const LV = 7.6;
      thing(0, 4.0, 6, 0.9, 1.1, "counter", { color: "#4a3a2c", deco: "reception" });
      posts.push({ kind: "receptionist", x: 0, z: V(5.0), yaw: 0 });
      for (const v of [1.6, 4.6]) thing(x1 - 0.6, v, 0.6, 2.4, 0.45, "bench", { color: "#3a4a72" });
      thing(x1 - 0.55, 6.7, 0.5, 0.5, 1.3, "cooler", { color: "#d8e8f4" });
      thing(SX1 + 0.6, 6.9, 0.6, 0.6, 1.0, "pot", { color: "#3a7a3a" });
      wallX(LV + 0.15, SX0, x1 - 0.2, [[-1.4, 1.4]]);
      // ---- the hallway down the middle; interrogation rooms, the breakroom (west); booking, the holding cell (east) ----
      const HX = 1.4, HV1 = D - 0.4;
      const I1 = [LV + 0.3, 12.8] as const, I2 = [13.1, 17.6] as const, BR = [17.9, HV1] as const;
      wallV(-HX - 0.15, LV + 0.3, HV1, [[10.0, 11.5], [14.5, 16.0], [19.1, 20.6]]);
      // (the one-way mirrors: glass in the hallway wall, high enough to peer through)
      for (const [m0, m1] of [[8.5, 9.6], [13.4, 14.4]]) wall(-HX - 0.2, -HX - 0.1, m0, m1, 1.1, 1.05, "#1a2028", "glass");
      wallX(12.95, x0 + 0.2, -HX - 0.3, []); wallX(17.75, x0 + 0.2, -HX - 0.3, []);
      for (const [a, b] of [I1, I2]) {
        const mv = (a + b) / 2;
        thing(-5.4, mv, 1.6, 0.9, 0.78, "table", { color: "#5a5a62", deco: "interrogation" });
        thing(-5.4, mv - 1.0, 0.5, 0.5, 0.9, "chair", { color: "#3a3a42" });
        thing(-5.4, mv + 1.0, 0.5, 0.5, 0.9, "chair", { color: "#3a3a42" });
      }
      // the breakroom
      thing(-5.6, (BR[0] + BR[1]) / 2, 2.2, 1.2, 0.75, "table", { color: "#8a6a4a" });
      thing(x0 + 0.65, BR[1] - 0.55, 0.9, 0.8, 1.9, "fridge", { color: "#e8e4dc" });
      thing(-6.0, BR[1] - 0.45, 3.4, 0.6, 0.95, "counter", { color: "#7a5a3a", deco: "coffee" });
      thing(-HX - 1.0, BR[1] - 0.55, 1.1, 0.8, 1.9, "vending", { color: "#c41e3a" });
      thing(x0 + 0.65, BR[0] + 1.4, 0.9, 2.0, 0.8, "sofa", { color: "#5a6a8a" });
      // booking: the fingerprint desk, the mugshot wall, filing cabinets
      const BK = [LV + 0.3, 12.8] as const;
      wallV(HX + 0.15, LV + 0.3, 12.95, [[9.0, 10.5]]);
      wallX(12.95, HX + 0.3, x1 - 0.2, []);
      thing(5.4, 10.6, 2.4, 0.8, 0.9, "desk", { color: "#6a5a4a", deco: "booking" });
      for (const v of [8.6, 9.6]) thing(x1 - 0.45, v, 0.5, 0.9, 1.4, "shelf", { color: "#7a8494", deco: "filing" });
      // the holding cell: bars along the hallway, its door in them; a bench, the toilet, the shower corner
      const CV0 = 13.1, CX0 = HX + 0.15;
      const CDV = 14.6; // (the cell door, in the bars)
      thing(CX0, (CV0 + CDV - 0.6) / 2, 0.16, CDV - 0.6 - CV0, H, "bars", { color: "#8e96a8" });
      thing(CX0, (CDV + 0.6 + HV1) / 2, 0.16, HV1 - CDV - 0.6, H, "bars", { color: "#8e96a8" });
      thing(CX0, CDV, 0.16, 1.2, H, "bars", { color: "#8e96a8" });
      const cellDoorBox = boxes.length - 1;
      const cxa = CX0 + 0.1, cxb = x1 - 0.2;
      thing(4.2, HV1 - 0.4, 4.8, 0.6, 0.45, "bench", { color: "#6b4a2b" });
      const toilet = { x: x1 - 0.65, z: V(15.6) };
      boxes.push({ ...box(toilet.x, toilet.z, 0.75, 0.55, 0.45, "plinth"), hide: true });
      props.push({ id: "toilet1", kind: "toilet", x: toilet.x, y: 0.45, z: toilet.z, yaw: -Math.PI / 2 });
      const door = { x: CX0, z: V(14.6) };
      props.push({ id: "celldoor1", kind: "celldoor", x: door.x, y: 1.2, z: door.z, yaw: -Math.PI / 2, hw: 0.35, hd: 0.7, box: cellDoorBox });
      const cell = RV(cxa + 0.3, cxb - 0.3, CV0 + 0.45, HV1 - 0.3);
      const shower = RV(x1 - 3.4, cxb, 19.2, HV1);
      thing(x1 - 2.6, 19.2, 1.8, 0.12, 2.1, "wall", { color: "#f4f4f4" }); // (a tiled half-wall round the shower corner)
      const champ = { x: 4.6, z: V(20.4), yaw: 0 };
      posts.push({ kind: "champ", x: champ.x, z: champ.z, yaw: champ.yaw });
      const spots = [0, 1, 2, 3].map((i) => ({ x: cxa + 1.3 + i * 1.7, z: V(16.4) }));
      const cells: NonNullable<ArenaLayout["station"]>["cells"] = [{ x: spots[0].x, z: spots[0].z, yaw: Math.PI, rect: cell }];
      // ---- the FIRST FLOOR ----
      // the chief's corner office (front-east, glass to the floor), offices down the east side, the evidence room
      // (back-west, behind a cage), the squad room by the stairs, cubicles in the middle
      const CH = RV(4.6, x1 - 0.2, 0.4, 6.4);
      wallV(4.45, 0.4, 6.4, [[4.5, 6.0]], UT - UY, UY, "#c8c2b6");
      wallX(6.4, 4.3, x1 - 0.2, [], UT - UY, UY, "#c8c2b6");
      thing(7.4, 3.0, 2.6, 1.1, 0.8, "desk", { color: "#5a3a24", deco: "chiefdesk" }, UY);
      const keySpot = { x: 6.6, y: UY + 0.8, z: V(3.2) }; // (R8: the holding cell's key, on the chief's desk)
      thing(7.4, 1.6, 0.6, 0.6, 1.1, "chair", { color: "#7a2a2a" }, UY);
      thing(x1 - 0.5, 5.4, 0.6, 0.6, 1.0, "pot", { color: "#3a7a3a" }, UY);
      const OFF = [[6.7, 11.8], [12.1, 17.2], [17.5, HV1]] as const;
      wallV(5.1, 6.4, HV1, OFF.map(([a]) => [a + 1.2, a + 2.7] as [number, number]), UT - UY, UY, "#c8c2b6");
      for (const [, b] of OFF.slice(0, 2)) wallX(b + 0.15, 5.25, x1 - 0.2, [], UT - UY, UY, "#c8c2b6");
      for (const [a, b] of OFF) {
        thing(7.6, (a + b) / 2, 1.8, 0.9, 0.78, "desk", { color: "#6a5a4a", deco: "office" }, UY);
        thing(x1 - 0.45, b - 0.6, 0.5, 0.9, 1.4, "shelf", { color: "#7a8494", deco: "filing" }, UY);
      }
      const EV = RV(x0 + 0.2, -4.4, 15.6, HV1);
      thing((x0 + 0.2 - 5.5) / 2, 15.6, -5.5 - (x0 + 0.2), 0.12, UT - UY, "bars", { color: "#8e96a8" }, UY); // (the cage front, its gate at the east end)
      thing(-4.95, 15.6, 1.1, 0.12, UT - UY - 2.4, "bars", { color: "#8e96a8" }, UY + 2.4);
      wallV(-4.25, 15.6, HV1, [], UT - UY, UY, "#c8c2b6");
      const evidenceSpots: { x: number; y: number; z: number }[] = [];
      for (const v of [17.0, 18.8, 20.6]) { thing(-7.0, v, 3.6, 0.7, 1.0, "shelf", { color: "#5a6070", deco: "evidence" }, UY); for (const x of [-8.3, -7.0, -5.7]) evidenceSpots.push({ x, y: UY + 1.0, z: V(v) }); }
      thing(-7.0, HV1 - 0.35, 5.0, 0.5, 1.8, "shelf", { color: "#5a6070", deco: "evidence" }, UY);
      for (const x of [-8.8, -7.0, -5.2]) evidenceSpots.push({ x, y: UY + 1.8, z: V(HV1 - 0.35) });
      const evidenceDoor = { x: -4.95, z: V(15.6) };
      // the squad room (lockers, a whiteboard, a long table) between the stairs and the evidence room
      thing(-6.6, 11.6, 3.4, 1.0, 0.78, "table", { color: "#7a6a5a" }, UY);
      for (const v of [9.0, 10.0, 11.0, 12.0, 13.0]) thing(x0 + 0.45, v, 0.5, 0.95, 1.9, "shelf", { color: "#6a7a8a", deco: "lockers" }, UY);
      // cubicles: low partitions and desks between the squad room and the offices
      for (const v of [8.0, 11.2, 14.4, 17.6, 20.8]) {
        thing(0.0, v, 6.6, 0.1, 1.4, "wall", { color: "#7a8aa0" }, UY);
        for (const x of [-2.2, 0.0, 2.2]) {
          thing(x, v + 0.55, 0.1, 1.1, 1.4, "wall", { color: "#7a8aa0" }, UY);
          thing(x + 0.9, v + 0.5, 1.2, 0.6, 0.78, "desk", { color: "#8a7a62", deco: "cubicle" }, UY);
        }
      }
      thing(-3.6, 6.0, 0.5, 0.5, 1.3, "cooler", { color: "#d8e8f4" }, UY);
      // the station's cops: one walks the ground floor, one stands at the evidence room
      // (R8: four: by the front doors, walking the hallway, outside the holding cell, at the evidence room)
      const beats = [
        { pts: [{ x: 3.0, z: V(6.2) }, { x: 0, z: V(9.0) }, { x: 0, z: V(12.4) }, { x: 0, z: V(9.0) }], y: 0 },
        { pts: [{ x: -4.2, z: V(14.6) }], y: UY },
        { pts: [{ x: 3.2, z: V(1.4) }], y: 0 },
        { pts: [{ x: -0.4, z: V(21.4) }], y: 0 },
      ];
      navChains.push([{ x: 0, z: V(-2.4) }, { x: 0, z: V(1.6) }, { x: 4.4, z: V(2.6) }, { x: 4.4, z: V(6.4) }, { x: 0, z: V(6.8) }, { x: 0, z: V(9.0) }, { x: 0, z: V(15.0) }, { x: 0, z: V(21.4) }]);
      const back = { x: 0, z: P0.minZ - 1.5, yaw: Math.PI };
      spawnAt(x0 - 1.2, back.z, "alley"); spawnAt(x1 + 1.2, back.z, "alley");
      return {
        rect: { minX: x0 - 0.2, maxX: x1 + 0.2, minZ: P0.minZ - 0.2, maxZ: P0.maxZ + 0.2 },
        door: { x: 0, z: V(-2.4), yaw: 0 },
        alley: back,
        cells,
        holding: { cell, spots, door, toilet, shower, reception: RV(SX1, x1 - 0.2, 0.4, LV), breakroom: RV(x0 + 0.2, -HX - 0.3, BR[0], BR[1]), champ },
        grand: {
          lobby: RV(x0 + 0.2, x1 - 0.2, 0.4, LV), hall: RV(-HX, HX, LV + 0.3, HV1), interrogation: [RV(x0 + 0.2, -HX - 0.3, I1[0], I1[1]), RV(x0 + 0.2, -HX - 0.3, I2[0], I2[1])],
          booking: RV(HX + 0.3, x1 - 0.2, BK[0], BK[1]), stairs: RV(SX0, SX1, SV0, SV1),
          upY: UY, upstairs: RV(x0 + 0.2, x1 - 0.2, 0.4, HV1), chief: CH, offices: OFF.map(([a, b]) => RV(5.25, x1 - 0.2, a, b)),
          evidence: EV, evidenceSpots, evidenceDoor, beats, windows, keySpot,
        },
      };
    }
    // (R3: the station faces north, so "in from the front" runs south: sg = -1)
    const sg = R2 ? -1 : 1;
    const P0 = R2 ? NEW_PRECINCT : LM.precinct, PD_H = 4.5, D = P0.maxZ - P0.minZ, zf = sg > 0 ? P0.minZ : P0.maxZ;
    const x0 = P0.minX, x1 = P0.maxX, pdX = (x0 + x1) / 2, pdZ = (P0.minZ + P0.maxZ) / 2;
    const V = (v: number) => zf + sg * v; // v = metres in from the front
    const out = sg > 0 ? Math.PI : 0; // (facing out of the front door)
    const pdWall = "#2f3a5c";
    const wall = (x: number, z: number, w: number, d: number, h = PD_H, baseY = 0, kind: Box["kind"] = "wall", color = pdWall) =>
      boxes.push({ ...box(x, z, w, d, h, kind, baseY), color });
    // (the door is 3 m wide: classic 3 m in from the west corner; R3 in the middle, so it's the same walk from either side)
    const dl = R2 ? (x1 - x0) / 2 - 1.5 : 3;
    wall(x0 + dl / 2, V(0), dl, 0.4); // front wall, left of the door
    wall((x0 + dl + 3 + x1) / 2, V(0), x1 - x0 - dl - 3, 0.4); // right of the door
    wall(x0 + dl + 1.5, V(0), 3, 0.4, PD_H - 2.7, 2.7); // over the door
    wall(pdX, V(D), x1 - x0 + 0.4, 0.4); // back wall
    wall(x0, pdZ, 0.4, D); wall(x1, pdZ, 0.4, D);
    boxes.push({ ...box(pdX, pdZ, x1 - x0 + 0.4, D + 0.4, 0.3, "roof", PD_H), sign: "TRASHINGTON PD", face: [0, -sg], color: "#1f2944" });
    boxes.push({ ...box(pdX, pdZ, x1 - x0 - 0.4, D - 0.4, 0.03, "shopfloor"), color: "#c9ccd6" });
    boxes.push({ ...box(R2 ? pdX : x0 + 11.5, V(R2 ? 5.2 : 4.6), R2 ? 6 : 8, 0.9, 1.1, "counter"), color: "#5a4632" }); // front desk
    const cellV0 = D - 6, cellV1 = D - 0.2, cellW = (x1 - x0 - 0.4) / 4;
    const cells: NonNullable<ArenaLayout["station"]>["cells"] = [];
    for (let i = 0; i < 4; i++) {
      const cx0 = x0 + 0.2 + i * cellW, cx1 = cx0 + cellW, cx = (cx0 + cx1) / 2;
      if (i > 0) wall(cx0, V((cellV0 + cellV1) / 2), 0.3, cellV1 - cellV0);
      boxes.push({ ...box(cx, V(cellV0), cellW - (i > 0 ? 0.3 : 0), 0.2, PD_H, "bars"), color: "#8e96a8" });
      boxes.push({ ...box(cx, V(D - 0.9), 2.2, 0.8, 0.45, "bench"), color: "#6b4a2b" });
      const ca = V(cellV0 + 0.5), cb = V(cellV1 - 0.6);
      cells.push({ x: cx, z: V(D - 3.3), yaw: out, rect: { minX: cx0 + 0.6, maxX: cx1 - 0.6, minZ: Math.min(ca, cb), maxZ: Math.max(ca, cb) } });
    }
    // two cruisers parked in the lot behind (side on)
    // (R5, the new city: the car park is the pawn shop now; the station's back alley is the gap between them)
    const alleyZ = V(D) + sg * 1.6;
    if (!R2) {
      const lot = LM.copLot, lz = (lot.minZ + lot.maxZ) / 2;
      for (const x of [lot.maxX - 3, lot.maxX - 8]) { boxes.push(box(x, lz, 4.2, 1.9, 1.5, "car")); decor.push({ kind: "copcar", x, z: lz, yaw: Math.PI / 2 }); }
    }
    spawnAt(R2 ? x0 - 1.2 : x1 + 1.5, alleyZ, "alley");
    if (R2) spawnAt(x1 + 1.2, alleyZ, "alley"); // (one at each end of the alley: fair)
    return {
      rect: { minX: x0 - 0.2, maxX: x1 + 0.2, minZ: P0.minZ - 0.2, maxZ: P0.maxZ + 0.2 },
      door: { x: x0 + dl + 1.5, z: V(-2.4), yaw: out },
      alley: { x: R2 ? x0 + 4 : x0 + 8, z: alleyZ, yaw: -Math.PI / 2 },
      cells,
    };
  })();

  // =================================================================================================
  // R7: TWO WALK-IN PAWN SHOPS on Gahookz Ghetto Lane, one for each side (Blake): HOT STUFF PAWN & LOAN (Twitchy Lou,
  // Meat Locker on the door) where Hat Hut was, and its mirror image FINDERS KEEPERS PAWN (Sticky Fran, Cold Cuts).
  // You walk in; glass counters full of junk keep you off the owner's side; you sell over the till. Nothing to rob.
  // A suit of armour stands out front. And the police station's upper floors (the first one is walkable now).
  // =================================================================================================
  let stationUpper: ArenaLayout["stationUpper"];
  const hotShops: HotShop[] = [];
  if (R2) {
    for (const [idx, sx] of [[0, -1], [1, 1]] as [number, 1 | -1][]) {
      const L = HOT_PLOT, Fz = L.minZ, Hh = 4.4, wc = idx ? "#3e4a3a" : "#4a3438";
      const X = (x: number) => (sx < 0 ? x : -x); // (built for the left shop; the right one is its mirror image)
      const Y = (yaw: number) => (sx < 0 ? yaw : -yaw);
      const zv = (v: number) => Fz + v; // v = metres in from the front (the front faces -z)
      const RX = (xa: number, xb: number, va: number, vb: number) => R(Math.min(X(xa), X(xb)), Math.max(X(xa), X(xb)), zv(Math.min(va, vb)), zv(Math.max(va, vb)));
      const B = (xa: number, xb: number, va: number, vb: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, y0 = 0) => {
        const r = RX(xa, xb, va, vb);
        boxes.push({ ...box((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, r.maxX - r.minX, r.maxZ - r.minZ, h, kind, y0), ...extra });
      };
      const x0 = L.minX, x1 = L.maxX, BACK = L.maxZ - L.minZ;
      // (the door is round the corner on the avenue side, near the front: the nearest the two forts on this side can
      //  be to the same walk; the counter line)
      const dv0 = 0.6, dv1 = 2.4, CV = 5.25, CD = 0.7;
      // the front: the shop window right across (low wall, glass, the sign band above), solid corners
      B(x0, x0 + 0.6, 0, 0.3, Hh, "wall", { color: wc }); B(x1 - 0.6, x1, 0, 0.3, Hh, "wall", { color: wc });
      B(x0 + 0.6, x1 - 0.6, 0, 0.3, 0.6, "wall", { color: wc });
      B(x0 + 0.6, x1 - 0.6, 0.1, 0.2, 2.2, "glass", {}, 0.6);
      B(x0 + 0.6, x1 - 0.6, 0, 0.3, Hh - 2.8, "wall", { color: wc }, 2.8);
      // the side on the avenue: the door; the back; the other side
      B(x0, x0 + 0.3, 0.3, dv0, Hh, "wall", { color: wc }); B(x0, x0 + 0.3, dv0, dv1, Hh - 2.6, "wall", { color: wc }, 2.6); B(x0, x0 + 0.3, dv1, BACK, Hh, "wall", { color: wc });
      // (R8: a glass door in it: E opens and closes it; the bouncer and walkers open it themselves)
      B(x0 + 0.1, x0 + 0.2, dv0, dv1, 2.6, "glass", { hide: true });
      { const r = RX(x0 + 0.1, x0 + 0.2, dv0, dv1); props.push({ id: `door${2 + idx}`, kind: "door", x: (r.minX + r.maxX) / 2, y: 1.3, z: (r.minZ + r.maxZ) / 2, yaw: Y(-Math.PI / 2), hw: 0.15, hd: (dv1 - dv0) / 2, box: boxes.length - 1, shop: idx }); }
      B(x0, x1, BACK - 0.3, BACK, Hh, "wall", { color: wc }); B(x1 - 0.3, x1, 0.3, BACK, Hh, "wall", { color: wc });
      B(x0 - 0.15, x1 + 0.15, -0.15, BACK + 0.15, 0.3, "roof", { color: "#2b2226" }, Hh);
      B(x0 + 0.3, x1 - 0.3, 0.3, BACK - 0.3, 0.03, "shopfloor", { color: "#9a7a52" });
      // the glass counters: a line right across (the till in the middle of it), a case down the side wall, an island
      const tx0 = -55.2, tx1 = -53.0, tillX = (tx0 + tx1) / 2;
      const counters: Rect[] = [];
      const glass = (xa: number, xb: number, va: number, vb: number) => {
        B(xa, xb, va, vb, 1.05, "case", { color: "#c9a227", deco: "jewels", hide: true }); // (drawn by the renderer: a cabinet, the junk, the glass)
        const r = RX(xa, xb, va, vb); counters.push(r);
        props.push({ id: `glasscounter${props.filter((q) => q.kind === "glasscounter").length + 1}`, kind: "glasscounter", x: (r.minX + r.maxX) / 2, y: 1.05, z: (r.minZ + r.maxZ) / 2, yaw: Y(Math.PI), hw: (r.maxX - r.minX) / 2, hd: (r.maxZ - r.minZ) / 2, shop: idx });
      };
      glass(x0 + 0.3, tx0, CV, CV + CD);
      B(tx0, tx1, CV, CV + CD, 1.05, "counter", { color: "#5a3a24", deco: "till" });
      glass(tx1, x1 - 0.3, CV, CV + CD);
      glass(x1 - 1.0, x1 - 0.3, 1.4, 4.6);
      glass(-52.6, -50.8, 2.3, 3.3);
      // clutter: guitars and a slatwall of junk on the back wall, tellies, a stuffed bear, a drum kit, a keyboard
      B(x0 + 0.4, x1 - 0.4, BACK - 0.85, BACK - 0.3, 2.4, "shelf", { color: "#e8e2d4", deco: "slatwall", hide: true });
      B(x0 + 0.35, x0 + 0.95, CV + CD + 0.4, BACK - 1.0, 2.0, "shelf", { color: "#5a3a24", deco: "guitars" });
      // (the window display: an old arcade machine, a mannequin in a leather jacket, a stuffed bear, a drum kit, a stack of tellies)
      B(-57.0, -56.2, 0.45, 1.15, 1.8, "arcade", { color: "#3a2a5a" });
      B(-55.6, -54.9, 0.5, 1.1, 1.9, "plinth", { deco: "mannequin", hide: true });
      B(-53.6, -52.8, 0.45, 1.1, 1.5, "plinth", { deco: "bear", hide: true });
      B(-52.0, -51.1, 0.45, 1.1, 1.3, "plinth", { deco: "drums", hide: true });
      B(-50.6, -49.4, 0.45, 1.1, 1.6, "boxes", { deco: "tvstack", hide: true });
      const boss = { x: X(tillX), z: zv(CV + CD + 0.7), yaw: Y(Math.PI) };
      const guard = { x: X(x0 + 0.9), z: zv(3.9), yaw: Y(Math.PI / 2) };
      const owner = idx ? "fran" as const : "lou" as const, bouncer = idx ? "cold_cuts" as const : "meat_locker" as const;
      posts.push({ kind: owner, x: boss.x, z: boss.z, yaw: boss.yaw });
      posts.push({ kind: bouncer, x: guard.x, z: guard.z, yaw: guard.yaw });
      props.push({ id: `pawncounter${idx + 1}`, kind: "pawncounter", x: X(tillX), y: 1.05, z: zv(CV), yaw: Y(Math.PI), shop: idx });
      // the suit of armour out front (on the pavement, by the door)
      const armour = { x: X(x0 - 0.65), z: zv(3.3), yaw: Y(-Math.PI / 2) };
      boxes.push({ ...box(armour.x, armour.z, 0.75, 0.75, 1.95, "plinth"), deco: "armour", hide: true });
      const dvm = (dv0 + dv1) / 2;
      navChains.push([{ x: X(x0 - 1.4), z: zv(dvm) }, { x: X(x0 + 1.1), z: zv(dvm) }, { x: X(tillX), z: zv(3.4) }, { x: X(-49.6), z: zv(3.8) }]);
      hotShops.push({
        idx, name: idx ? "FINDERS KEEPERS PAWN" : "HOT STUFF PAWN & LOAN", owner, bouncer,
        rect: R(Math.min(X(x0), X(x1)), Math.max(X(x0), X(x1)), L.minZ, L.maxZ),
        floor: RX(x0 + 0.3, x1 - 0.3, 0.3, CV), back: RX(x0 + 0.3, x1 - 0.3, CV + CD, BACK - 0.3),
        door: { x: X(x0), z: zv(dvm) }, doorIn: { x: X(x0 + 1.1), z: zv(dvm) }, stand: { x: X(tillX), z: zv(CV - 0.6) }, boss, guard, out: { x: X(x0 - 1.3), z: zv(dvm) }, counters, armour,
      });
    }
    // the police station's upper floors: the first is walkable (built with the station); above it, looks only
    const P0 = NEW_PRECINCT, up = R(P0.minX + 0.2, P0.maxX - 0.2, P0.minZ + 0.2, P0.maxZ - 0.2);
    boxes.push({ ...box((up.minX + up.maxX) / 2, (up.minZ + up.maxZ) / 2, up.maxX - up.minX, up.maxZ - up.minZ, 15.6 - 9.3, "wall", 9.3), hide: true });
    stationUpper = { rect: up, y0: 4.8, y1: 15.6, face: [0, 1], walkTop: 9.3 };
  }

  // ==== boundary fences (3 m, too tall to climb) ====================================================
  // (R3: the south fence is further south, round the fort bowl; the side fences run down to it)
  boxes.push(box(0, HALF + 0.5, HALF * 2 + 2, 1, 3, "fence"));
  if (!R2) boxes.push(box(0, -HALF - 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(HALF + 0.5, (HALF + southZ) / 2, 1, HALF - southZ, 3, "fence"));
  boxes.push(box(-HALF - 0.5, (HALF + southZ) / 2, 1, HALF - southZ, 3, "fence"));

  for (const [x, z] of streetLoot) spawnAt(x, z, "street", 0.15);

  // ==== event geometry ==============================================================================
  // (the garbage truck drives the right-hand lane of a straight road)
  const truckRoutes = R2 ? [
    { name: "GAHOOKZ GHETTO LANE", ax: -100, az: NEW.gahookz - 2, bx: 100, bz: NEW.gahookz - 2 },
    { name: "SNOB ROW", ax: 100, az: NEW.snob + 2, bx: -100, bz: NEW.snob + 2 },
    { name: "LEFTY LANE", ax: -NEW.edge + 2, az: -80, bx: -NEW.edge + 2, bz: 64 },
    { name: "RIGHTY LANE", ax: NEW.edge - 2, az: 64, bx: NEW.edge - 2, bz: -80 },
  ] : [
    { name: "the SERVICE ROAD", ax: -84, az: -91, bx: 84, bz: -91 },
    { name: "NORTH PARADE", ax: 84, az: 110, bx: -84, bz: 110 },
    { name: "the WEST ROAD", ax: -89, az: -82, bx: -89, bz: 102 },
    { name: "the EAST ROAD", ax: 89, az: 102, bx: 89, bz: -82 },
  ];
  const happyZones = R2 ? [
    { x: 0, z: 0, r: 18, name: "the Park" },
    { x: 0, z: 58, r: 12, name: "Bin Juice Boulevard" },
    { x: -33, z: -40, r: 12, name: "Shopping Trolley Terrace" },
    { x: 33, z: -40, r: 12, name: "Shopping Trolley Terrace" },
  ] : [
    { x: 0, z: 0, r: 18, name: "the Park" },
    { x: 55, z: -30, r: 14, name: "Market Row" },
    { x: -30, z: -60, r: 14, name: "The Yards" },
    { x: -40, z: 25, r: 14, name: "Old Brick" },
    { x: 0, z: 78, r: 12, name: "City Hall" },
  ];
  const airdropSpots: [number, number][] = R2 ? [[-12, 6], [12, -10], [-8, -14], [6, 14], [0, 12]] : [[-12, 76], [12, 76], [0, 76], [-14, 86], [14, 86], [T.x - 8, T.z - 10], [T.x - 10, T.z + 6], [T.x - 4, T.z - 2]];

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
    martDoor: R2 ? { x: 0, z: -18, yaw: 0 } : { x: units[0].doorX + units[0].out[0] * 1.5, z: units[0].doorZ + units[0].out[1] * 1.5, yaw: Math.atan2(-units[0].out[0], -units[0].out[1]) },
    pondEdge: { x: 10, z: pond.minZ - 2.5, yaw: 0, waterZ: pond.minZ },
    parkCentre: { x: 0, z: -8, yaw: 0 },
    // C3: a bush to hide in, the fountain
    bush: { x: (bushes[0].minX + bushes[0].maxX) / 2, z: (bushes[0].minZ + bushes[0].maxZ) / 2, yaw: 0 },
    fountain: { x: 0, z: -2.2, yaw: 0 },
    cityHall: { x: 0, z: 76, yaw: 0 },
  };
  if (R2) { // (R2: the classic-only spots the road test doesn't have)
    for (const k of ["ledge14", "pitWall", "tunnelEntrance", "cityHall"] as const) delete (landmarks as Record<string, unknown>)[k];
  }
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

  // R11: NEON FEVER DREAM (Blake: "a neon fever dream, 3 stories high, intricate floor plans, use as much floor space as
  // you want"). It takes the whole Market Row block where BRICK & MORTAR and the two SEW WHATs stood, the alley and the
  // three shops behind them: 29 x 26 m. The south-west corner (the crossroads) is cut at 45 degrees and the front door
  // is in the cut, with a bouncer and a rope outside. Floor 1: the bar, booths, a dance floor under the atrium. Floor 2
  // (6.3 m up, 6.8 m high): the main room round the atrium (a catwalk across it, stages, DJ TRASH PANDA's booth against
  // the east wall), a glass bay out over Market Row. The roof (13.5 m): open air, a glass floor over the atrium (you
  // see straight down two floors), LIL PANDA's pavilion in the north-east corner. Not a building box (it's walls and
  // floors), so it has no mirror twin; its loot spots move up the alley behind it (the west side keeps its twins).
  let fever: FeverDef | undefined;
  if (R2) {
    type Pt = [number, number];
    const F = R(73.6, 102.7, 6.3, 32.2), CH = 5, T = 0.3, Y2 = 6.3, RY = 13.5, SL = 0.4, PAR = 1.2, S2 = Math.SQRT2;
    const BRICK = "#3b2a33", DARK = "#1b1424";
    // ---- clear the plot (the shops on it go; prop box indexes are kept straight) ----
    {
      const keep = boxes.map((b) => b.kind === "sidewalk" || !inRect(F, b.x, b.z, 0.1));
      const remap = new Map<number, number>();
      const kept: Box[] = [];
      boxes.forEach((b, i) => { if (keep[i]) { remap.set(i, kept.length); kept.push(b); } });
      for (const pd of props) if (pd.box !== undefined) pd.box = remap.get(pd.box);
      for (let q = 0; q < pumpBoxes.length; q++) pumpBoxes[q] = remap.get(pumpBoxes[q]) ?? -1;
      boxes.length = 0; boxes.push(...kept);
      // (the alley loot moves 26 m up the alley, past the club's back wall)
      const clearAt = (x: number, z: number) => !inRect(F, x, z, 1) && !boxes.some((b) => (b.kind === "building" || b.kind === "tower") && footSd(b, x, z).d < 0.8);
      for (const l of loot) if (l.y < 0.5 && inRect(F, l.x, l.z, 0.3)) {
        const dz = [26, 24, 28, 22, 30, 20, 32, 18, 34].find((d) => clearAt(l.x, l.z + d));
        if (dz !== undefined) { l.z += dz; l.tier = tierAt(l.z); } else { l.y = -99; } // (nowhere clear: dropped below the map, never spawns)
      }
    }
    const wb = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, kind: Box["kind"] = "wall", extra: Partial<Box> = {}) => {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01 || y1 - y0 < 0.01) return;
      boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, kind, y0), ...extra });
    };
    const top = RY + PAR;
    // the bands up a glazed wall: solid plinth, floor 1's windows, the floor-2 band, floor 2's glass, the parapet
    const BANDS: [number, number, boolean][] = [[0, 0.9, false], [0.9, 4.8, true], [4.8, Y2 + 0.6, false], [Y2 + 0.6, RY - 0.9, true], [RY - 0.9, top, false]];
    /** a wall along x (at z0..z1) or along z (at x0..x1), glazed in the glass bands: piers every ~4 m */
    const facade = (alongX: boolean, f0: number, f1: number, a0: number, a1: number, bands: [number, number, boolean][], open?: (a: number, b: number, y0: number) => boolean) => {
      const put = (a: number, b: number, y0: number, y1: number, kind: Box["kind"], th = 1) => {
        const m = ((f1 - f0) * (1 - th)) / 2;
        if (alongX) wb(a, b, f0 + m, f1 - m, y0, y1, kind, kind === "wall" ? { color: BRICK, deco: "shell" } : {}); else wb(f0 + m, f1 - m, a, b, y0, y1, kind, kind === "wall" ? { color: BRICK, deco: "shell" } : {});
      };
      for (const [y0, y1, glass] of bands) {
        if (!glass) { put(a0, a1, y0, y1, "wall"); continue; }
        const n = Math.max(1, Math.round((a1 - a0) / 4.2)), step = (a1 - a0) / n, pw = 0.7;
        for (let q = 0; q <= n; q++) { const c = a0 + q * step; put(Math.max(a0, c - pw / 2), Math.min(a1, c + pw / 2), y0, y1, "wall"); }
        for (let q = 0; q < n; q++) {
          const a = a0 + q * step + pw / 2, b = a0 + (q + 1) * step - pw / 2;
          if (open?.(a, b, y0)) continue;
          put(a, b, y0, y1, "glass", 0.4);
        }
      }
    };
    // ---- the shell ----
    facade(true, F.minZ, F.minZ + T, F.minX + CH, F.maxX, BANDS);                                    // south (the side street)
    const BAY = R(72.4, F.minX, 12, 26);
    facade(false, F.minX, F.minX + T, F.minZ + CH, F.maxZ, BANDS, (a, b, y0) => y0 > Y2 && a >= BAY.minZ - 0.5 && b <= BAY.maxZ + 0.5); // west (Market Row; the bay opens off floor 2)
    // (the bay's opening: the panes between its piers are gone, so the piers in it go too)
    for (let q = boxes.length - 1; q >= 0; q--) { const b = boxes[q]; if (b.kind === "wall" && b.color === BRICK && b.x < F.minX + T && b.z > BAY.minZ + 0.2 && b.z < BAY.maxZ - 0.2 && b.y - b.h / 2 > Y2 && b.y + b.h / 2 < RY) boxes.splice(q, 1); }
    // north (the back: R11.4: the green EXIT under the stairs, out into the alley)
    const BD = R(85.0, 86.2, F.maxZ - T, F.maxZ);
    wb(F.minX, BD.minX, F.maxZ - T, F.maxZ, 0, top, "wall", { color: BRICK, deco: "shell" }); wb(BD.maxX, F.maxX, F.maxZ - T, F.maxZ, 0, top, "wall", { color: BRICK, deco: "shell" });
    wb(BD.minX, BD.maxX, F.maxZ - T, F.maxZ, 2.35, top, "wall", { color: BRICK, deco: "shell" });
    wb(F.maxX - T, F.maxX, F.minZ, F.maxZ, 0, Y2 + 0.6, "wall", { color: BRICK, deco: "shell" }); // east (R11.4: the open fire exit's bricked up)
    facade(false, F.maxX - T, F.maxX, F.minZ, F.maxZ, BANDS.slice(3));
    // R11.3: a second bay, the west one's mirror, out over the alley on the east; both bays' openings are cut clean
    // through the shell from floor 2 up (R11.2's bug: the floor-2 band stood 0.6 m above the floor across the
    // west bay: "a little wall blocking to get there")
    const BAY2 = R(F.maxX, F.maxX + 1.2, 12, 26);
    const cutOut = (xa: number, xb: number, z0: number, z1: number) => {
      for (let q = boxes.length - 1; q >= 0; q--) {
        const b = boxes[q];
        if (b.poly || (b.kind !== "wall" && b.kind !== "glass") || b.deco !== "shell" && b.kind === "wall" || b.x < xa || b.x > xb) continue;
        const bz0 = b.z - b.d / 2, bz1 = b.z + b.d / 2, by0 = b.y - b.h / 2, by1 = b.y + b.h / 2;
        if (bz1 <= z0 + 0.01 || bz0 >= z1 - 0.01 || by1 <= Y2 + 0.01 || by0 >= RY - 0.91) continue;
        boxes.splice(q, 1);
        const { x: _x, y: _y, z: _z, w: _w, d: _d, h: _h, ...ex } = b; void _x; void _y; void _z; void _w; void _d; void _h;
        const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        if (bz0 < z0) wb(x0, x1, bz0, z0, by0, by1, b.kind, ex);
        if (bz1 > z1) wb(x0, x1, z1, bz1, by0, by1, b.kind, ex);
        if (by0 < Y2) wb(x0, x1, Math.max(bz0, z0), Math.min(bz1, z1), by0, Y2, b.kind, ex);
        if (by1 > RY - 0.9) wb(x0, x1, Math.max(bz0, z0), Math.min(bz1, z1), RY - 0.9, by1, b.kind, ex);
      }
    };
    cutOut(F.minX - 0.01, F.minX + T + 0.01, BAY.minZ, BAY.maxZ); cutOut(F.maxX - T - 0.01, F.maxX + 0.01, BAY2.minZ, BAY2.maxZ);
    // the cut corner: three pieces along the diagonal, the front door (3.2 m) in the middle one
    {
      const P0: Pt = [F.minX, F.minZ + CH], P1: Pt = [F.minX + CH, F.minZ], d = T / S2;
      const outer = (s: number): Pt => [P0[0] + (P1[0] - P0[0]) * s, P0[1] + (P1[1] - P0[1]) * s];
      const inner = (s: number): Pt => s <= 0 ? [F.minX + T, F.minZ + CH + T * S2 - T] : s >= 1 ? [F.minX + CH + T * S2 - T, F.minZ + T] : [outer(s)[0] + d, outer(s)[1] + d];
      const seg = (s0: number, s1: number, y0: number, y1: number) => boxes.push({ ...polyBox([outer(s0), outer(s1), inner(s1), inner(s0)], y1 - y0, "wall", y0), color: BRICK, deco: "shell" });
      const L = CH * S2, sd0 = 0.5 - 1.6 / L, sd1 = 0.5 + 1.6 / L;
      seg(0, sd0, 0, top); seg(sd1, 1, 0, top); seg(sd0, sd1, 3.2, top);
    }
    // ---- floors: floor 1 (on the pavement), floor 2's slab and the roof deck round their holes ----
    const A = R(83.5, 93.5, 14.5, 24.5);                      // the atrium
    const SW1 = R(77.0, 86.9, 29.3, F.maxZ - T);              // floor 1 -> 2: along the north wall, rising east (R11.2: 1 m further east: a proper landing at its foot)
    const SW2 = R(88.5, 99.9, F.minZ + T, 9.0);               // floor 2 -> roof: along the south wall, rising west
    const CW = R(A.minX, A.maxX, 18.9, 20.1);                 // the catwalk across the atrium
    const cornerCut = F.minX + F.minZ + CH + T * S2;          // (inside the cut corner: x + z >= this)
    const clipCorner = (P: Pt[]): Pt[] => {
      const out: Pt[] = [];
      for (let q = 0; q < P.length; q++) {
        const a = P[q], b = P[(q + 1) % P.length], da = a[0] + a[1] - cornerCut, db = b[0] + b[1] - cornerCut;
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    const slab = (holes: Rect[], y0: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}) => {
      const x0 = F.minX + T, x1 = F.maxX - T, z0 = F.minZ + T, z1 = F.maxZ - T;
      const xs = [...new Set([x0, x1, F.minX + CH, ...holes.flatMap((q) => [q.minX, q.maxX])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
      const zs = [...new Set([z0, z1, F.minZ + CH, ...holes.flatMap((q) => [q.minZ, q.maxZ])])].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
      for (let j = 0; j + 1 < zs.length; j++) {
        let i = 0;
        while (i + 1 < xs.length) {
          const free = (k: number) => !holes.some((q) => (xs[k] + xs[k + 1]) / 2 > q.minX && (xs[k] + xs[k + 1]) / 2 < q.maxX && (zs[j] + zs[j + 1]) / 2 > q.minZ && (zs[j] + zs[j + 1]) / 2 < q.maxZ);
          if (!free(i)) { i++; continue; }
          let k = i; while (k + 1 < xs.length - 1 && free(k + 1) && !(xs[k + 1] === F.minX + CH && zs[j] < F.minZ + CH)) k++;
          const ra = xs[i], rb = xs[k + 1], za = zs[j], zb = zs[j + 1];
          if (ra + za < cornerCut) {
            const P = clipCorner([[ra, za], [rb, za], [rb, zb], [ra, zb]]);
            if (P.length >= 3) boxes.push({ ...polyBox(P, h, kind, y0), ...extra });
          } else boxes.push({ ...box((ra + rb) / 2, (za + zb) / 2, rb - ra, zb - za, h, kind, y0), ...extra });
          i = k + 1;
        }
      }
    };
    slab([], 0.15, 0.04, "shopfloor", { color: "#120e1c" });
    slab([A, SW1], Y2 - SL, SL, "roof", { color: "#241a30" });
    slab([A, SW2], RY - SL, SL, "roof", { color: "#2a2034" });
    boxes.push({ ...box((A.minX + A.maxX) / 2, (A.minZ + A.maxZ) / 2, A.maxX - A.minX, A.maxZ - A.minZ, 0.3, "glass", RY - 0.3), hide: true }); // (the glass floor: drawn by the renderer)
    // the stairs (LED strips on every step, see the renderer)
    { const n = 33, run = (SW1.maxX - SW1.minX) / n, rise = (Y2 - 0.15) / n;
      // (R11.4: once there's headroom under them they're floating treads: the space under the stairs is open, the EXIT's there)
      for (let q = 1; q <= n; q++) { const topY = 0.15 + q * rise, y0 = topY > 2.75 ? topY - 0.32 : 0; boxes.push({ ...box(SW1.minX + (q - 0.5) * run, (SW1.minZ + SW1.maxZ) / 2, run, SW1.maxZ - SW1.minZ, topY - y0, "step", y0), color: "#1f1830" }); } }
    { const n = 38, run = (SW2.maxX - SW2.minX) / n, rise = (RY - Y2) / n;
      for (let q = 1; q <= n; q++) boxes.push({ ...box(SW2.maxX - (q - 0.5) * run, (SW2.minZ + SW2.maxZ) / 2, run, SW2.maxZ - SW2.minZ, q * rise, "step", Y2), color: "#1f1830" }); }
    // glass railings: round the atrium (gaps for the catwalk), along the stairwells, the catwalk's sides
    const rail = (x0: number, x1: number, z0: number, z1: number, y: number) => wb(x0, x1, z0, z1, y, y + 1.1, "glass", { hide: true, deco: "rail" });
    // (R11.1: the atrium's an octagon on floor 2: its corners filled in, a glass rail round all eight sides)
    const OC = 2.6;
    const railD = (ax: number, az: number, bx: number, bz: number, y: number) => { const l = Math.hypot(bx - ax, bz - az), ox = (-(bz - az) / l) * 0.04, oz = ((bx - ax) / l) * 0.04; boxes.push({ ...polyBox([[ax + ox, az + oz], [bx + ox, bz + oz], [bx - ox, bz - oz], [ax - ox, az - oz]], 1.1, "glass", y), hide: true, deco: "rail" }); };
    for (const [cx, cz, sx, sz] of [[A.minX, A.minZ, 1, 1], [A.maxX, A.minZ, -1, 1], [A.minX, A.maxZ, 1, -1], [A.maxX, A.maxZ, -1, -1]] as [number, number, number, number][]) {
      boxes.push({ ...polyBox([[cx, cz], [cx + sx * OC, cz], [cx, cz + sz * OC]], SL, "roof", Y2 - SL), color: "#241a30" });
      railD(cx + sx * OC, cz, cx, cz + sz * OC, Y2);
    }
    rail(A.minX + OC, A.maxX - OC, A.minZ - 0.08, A.minZ, Y2); rail(A.minX + OC, A.maxX - OC, A.maxZ, A.maxZ + 0.08, Y2);
    rail(A.minX - 0.08, A.minX, A.minZ + OC, CW.minZ, Y2); rail(A.minX - 0.08, A.minX, CW.maxZ, A.maxZ - OC, Y2);
    rail(A.maxX, A.maxX + 0.08, A.minZ + OC, CW.minZ, Y2); rail(A.maxX, A.maxX + 0.08, CW.maxZ, A.maxZ - OC, Y2);
    wb(CW.minX, CW.maxX, CW.minZ, CW.maxZ, Y2 - 0.25, Y2, "platform", { color: "#2b2440", deco: "catwalk" });
    rail(CW.minX, CW.maxX, CW.minZ, CW.minZ + 0.06, Y2); rail(CW.minX, CW.maxX, CW.maxZ - 0.06, CW.maxZ, Y2);
    rail(SW1.minX, SW1.maxX, SW1.minZ - 0.08, SW1.minZ, Y2); rail(SW1.minX - 0.08, SW1.minX, SW1.minZ, SW1.maxZ, Y2);
    rail(SW2.minX, SW2.maxX, SW2.maxZ, SW2.maxZ + 0.08, RY); rail(SW2.maxX, SW2.maxX + 0.08, SW2.minZ, SW2.maxZ, RY);
    rail(A.minX - 0.1, A.maxX + 0.1, A.minZ - 0.1, A.minZ, RY); rail(A.minX - 0.1, A.maxX + 0.1, A.maxZ, A.maxZ + 0.1, RY); // (the glass floor's ends: a knee rail)
    // floor 2's glass bay out over Market Row: a floor, glass on three sides, a lid
    wb(BAY.minX, BAY.maxX + T, BAY.minZ, BAY.maxZ, Y2 - SL, Y2, "platform", { color: "#241a30" });
    wb(BAY.minX, BAY.minX + 0.12, BAY.minZ, BAY.maxZ, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY.minX, BAY.maxX, BAY.minZ, BAY.minZ + 0.12, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY.minX, BAY.maxX, BAY.maxZ - 0.12, BAY.maxZ, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY.minX - 0.2, BAY.maxX, BAY.minZ - 0.2, BAY.maxZ + 0.2, RY - 0.9, RY - 0.5, "roof", { color: DARK });
    // (R11.3: its twin on the east, over the alley)
    wb(BAY2.minX - T, BAY2.maxX, BAY2.minZ, BAY2.maxZ, Y2 - SL, Y2, "platform", { color: "#241a30" });
    wb(BAY2.maxX - 0.12, BAY2.maxX, BAY2.minZ, BAY2.maxZ, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY2.minX, BAY2.maxX, BAY2.minZ, BAY2.minZ + 0.12, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY2.minX, BAY2.maxX, BAY2.maxZ - 0.12, BAY2.maxZ, Y2, RY - 0.9, "glass", { hide: true, deco: "bay" });
    wb(BAY2.minX, BAY2.maxX + 0.2, BAY2.minZ - 0.2, BAY2.maxZ + 0.2, RY - 0.9, RY - 0.5, "roof", { color: DARK });
    // ---- R11.1 (Blake: "more interesting than 1 big open room": his floor plan, curving red booths, a couple of
    //      bars that curve round, pot plants; floor 2 the main dance floor, curved benches, DON BINNIE's lounge) ----
    const Y1 = 0.19, PI = Math.PI;
    /** an arc of boxes (convex quads round a centre): a curved counter, a booth's seat or back, a bench */
    const arcBox = (a: FeverArc, y0: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, segs = 0) => {
      const n = segs || Math.max(3, Math.ceil(((a.a1 - a.a0) * a.r1) / 0.7));
      for (let q = 0; q < n; q++) {
        const u0 = a.a0 + ((a.a1 - a.a0) * q) / n, u1 = a.a0 + ((a.a1 - a.a0) * (q + 1)) / n;
        const P = (r: number, u: number): Pt => [a.x + Math.cos(u) * r, a.z + Math.sin(u) * r];
        boxes.push({ ...polyBox([P(a.r0, u0), P(a.r1, u0), P(a.r1, u1), P(a.r0, u1)], h, kind, y0), ...extra });
      }
    };
    const disc = (x: number, z: number, r: number, y0: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}) => {
      const P: Pt[] = []; for (let q = 0; q < 8; q++) { const u = (q / 8) * 2 * PI + PI / 8; P.push([x + Math.cos(u) * r, z + Math.sin(u) * r]); }
      boxes.push({ ...polyBox(P, h, kind, y0), ...extra });
    };
    const booths: FeverArc[] = [];
    /** a curved red U-booth opening toward angle d (its table in the middle) */
    const booth = (x: number, z: number, d: number, y: number, col = "#9e1b32") => {
      // (R11.5: the backrest stops short of the seat's ends: its end pieces stood up like posts beside the table, the
      // "weird boxes"; both are drawn as smooth curves, the boxes are collision only)
      const a: FeverArc = { x, z, r0: 0.95, r1: 1.75, a0: d + PI - 1.8, a1: d + PI + 1.8, y, col, back: { r0: 1.42, a0: d + PI - 1.35, a1: d + PI + 1.35, h: 1.15, col: "#6e0f22" } };
      arcBox(a, y, 0.5, "sofa", { color: col, deco: "booth", hide: true });
      arcBox({ ...a, r0: 1.42, a0: a.back!.a0, a1: a.back!.a1 }, y, 1.15, "sofa", { color: "#6e0f22", deco: "boothback", hide: true });
      disc(x, z, 0.55, y, 0.72, "table", { color: "#f0d8ff", deco: "glowtable" });
      booths.push(a);
    };
    // FLOOR 1 (R11.2: Blake: "a real, layered venue"; the restrooms were pinching the stairs). Zones: the foyer (the
    // coat-check hatch, the host stand), the booth tier along the south wall, the west-wall booths, the island bar,
    // THE FEVER BAR and its back-of-house corner, the little dance floor, the powder-room corridor (south-east, off
    // the fire-exit side); the stairs' approach and landing kept completely clear (tested)
    const STAIR_APPROACH = R(F.minX + T, SW1.minX + 4.5, 24.6, F.maxZ - T);
    // the booth tier: a step up (0.25 m), a brass rail along its front with two openings (a step in each)
    const TY = Y1 + 0.25, TIER = R(79.4, 95.1, F.minZ + T, 11.2); // (R11.4: 1.3 m shorter: the restroom wing)
    const brass = (x0: number, x1: number, z0: number, z1: number, y: number) => wb(x0, x1, z0, z1, y, y + 1.0, "wall", { hide: true, deco: "brassrail" });
    wb(TIER.minX, TIER.maxX, TIER.minZ, TIER.maxZ, Y1, TY, "platform", { color: "#1a1020", deco: "tier" });
    { let a = TIER.minX; for (const [g0, g1] of [[83.8, 85.4], [89.8, 91.4]]) { brass(a, g0, TIER.maxZ - 0.06, TIER.maxZ, TY); wb(g0, g1, TIER.maxZ, TIER.maxZ + 0.45, Y1, Y1 + 0.125, "step", { color: "#2a1a30", deco: "tierstep" }); a = g1; } brass(a, TIER.maxX, TIER.maxZ - 0.06, TIER.maxZ, TY); }
    brass(TIER.minX, TIER.minX + 0.06, TIER.minZ, TIER.maxZ, TY); brass(TIER.maxX - 0.06, TIER.maxX, TIER.minZ, TIER.maxZ, TY);
    for (const x of [82.0, 87.6, 93.0]) booth(x, F.minZ + T + 1.95, PI / 2, TY);
    // the foyer: the coat check (a closet with a hatch onto the foyer) and the host stand, both off the door's path
    const CC = R(F.minX + T, 75.6, 11.0, 14.4), CCC = "#2a1f3a";
    wb(CC.minX, CC.maxX, CC.minZ, CC.minZ + 0.15, Y1, Y2 - SL, "wall", { color: CCC }); wb(CC.minX, CC.maxX, CC.maxZ - 0.15, CC.maxZ, Y1, Y2 - SL, "wall", { color: CCC });
    wb(CC.maxX - 0.15, CC.maxX, CC.minZ + 0.15, 11.6, Y1, Y2 - SL, "wall", { color: CCC }); wb(CC.maxX - 0.15, CC.maxX, 13.8, CC.maxZ - 0.15, Y1, Y2 - SL, "wall", { color: CCC });
    wb(CC.maxX - 0.15, CC.maxX, 11.6, 13.8, Y1 + 2.2, Y2 - SL, "wall", { color: CCC, deco: "coatsign" });
    wb(CC.maxX - 0.15, CC.maxX + 0.3, 11.6, 13.8, Y1, Y1 + 1.05, "counter", { color: "#3a2416", deco: "coatcheck" });
    const HOST = { x: 77.4, z: 13.7 };
    wb(HOST.x - 0.35, HOST.x + 0.35, HOST.z - 0.25, HOST.z + 0.25, Y1, Y1 + 1.15, "counter", { color: "#1b1424", deco: "hoststand" });
    // the west wall's booths (the quieter edge, under the window), clear of the stair approach
    for (const z of [16.9, 21.6]) booth(F.minX + T + 1.95, z, 0, Y1);
    // R11.4 (Blake: "make it more of a room/hallway area where you actually have to open a door... enclose that area
    // a bit more... a little bit bigger for future stuff"): the restroom wing, where the fire exit was (east). A door
    // off the floor into a hallway; off the hallway MEN and WOMEN (two stalls each, a row of sinks under a mirror,
    // frosted street windows) and a spare room for later, each behind its own door. You can't see in from the bar
    // (R11.5, Blake: "the bathroom area feels kind of too big... delete the spare room... put the door to the hallway on
    // the other side, not the wall facing the island bar": MEN and WOMEN only; the door's at the north end now)
    const W = R(95.4, F.maxX - T, F.minZ + T, 15.4), WC = "#2a1f3a", HX = 97.2, WT = 0.15, DH = Y1 + 2.6, CEIL = Y2 - SL;
    const doors: { x: number; z: number; z0: number; z1: number; name: string; alongX?: boolean }[] = [];
    /** a wall along z at x0..x1 with doorways (z0..z1 each), a lintel over each; its leaves are doors you open */
    const wallZ = (x0: number, x1: number, z0: number, z1: number, gaps: [number, number, string][], deco: string) => {
      let a = z0;
      for (const [g0, g1, name] of gaps) { wb(x0, x1, a, g0, Y1, CEIL, "wall", { color: WC, deco }); wb(x0, x1, g0, g1, DH, CEIL, "wall", { color: WC, deco }); doors.push({ x: (x0 + x1) / 2, z: (g0 + g1) / 2, z0: g0, z1: g1, name }); a = g1; }
      wb(x0, x1, a, z1, Y1, CEIL, "wall", { color: WC, deco });
    };
    wb(W.minX - WT, W.minX, W.minZ, W.maxZ + WT, Y1, CEIL, "wall", { color: WC, deco: "wingout" }); // (the side facing the island bar: solid now)
    { const g0 = W.minX + 0.2, g1 = W.minX + 1.6; // (the door: the hallway's north end)
      wb(W.minX - WT, g0, W.maxZ, W.maxZ + WT, Y1, CEIL, "wall", { color: WC, deco: "wingout" }); wb(g1, W.maxX, W.maxZ, W.maxZ + WT, Y1, CEIL, "wall", { color: WC, deco: "wingout" });
      wb(g0, g1, W.maxZ, W.maxZ + WT, DH, CEIL, "wall", { color: WC, deco: "wingout" });
      doors.push({ x: (g0 + g1) / 2, z: W.maxZ + WT / 2, z0: g0, z1: g1, name: "wing", alongX: true }); }
    wallZ(HX, HX + WT, W.minZ, W.maxZ, [[7.9, 9.3, "MEN"], [12.5, 13.9, "WOMEN"]], "wingin");
    wb(HX + WT, W.maxX, 11.0, 11.0 + WT, Y1, CEIL, "wall", { color: WC, deco: "wingin" });
    const restrooms: { room: Rect; door: Rect; name: string }[] = [];
    for (const [name, z0, z1] of [["MEN", W.minZ, 11.0], ["WOMEN", 11.0 + WT, 15.4]] as [string, number, number][]) {
      // two stalls against the east wall (a front with two doorways, a partition between), sinks under a mirror
      const sz0 = z0 + 0.0, sz1 = z0 + 3.6, mid = (sz0 + sz1) / 2;
      wb(100.4, 100.5, sz0, sz1, Y1, Y1 + 2.0, "wall", { color: "#4a3a6a", deco: "stallfront" }); // (its doorways cut below)
      wb(100.5, W.maxX, mid - 0.05, mid + 0.05, Y1, Y1 + 2.0, "wall", { color: "#4a3a6a", deco: "stall" });
      wb(100.4, W.maxX, sz1, sz1 + 0.1, Y1, Y1 + 2.0, "wall", { color: "#4a3a6a", deco: "stall" });
      for (const wz of [(sz0 + mid) / 2, (mid + sz1) / 2]) boxes.push({ ...box(101.85, wz, 0.5, 0.6, 0.45, "plinth", Y1), hide: true, deco: "wc", face: [-1, 0] });
      wb(97.7, 99.9, z1 - 0.55, z1, Y1, Y1 + 0.85, "counter", { color: "#e8e2f0", deco: "sink", face: [0, -1] });
      const dd = doors.find((d) => d.name === name)!;
      restrooms.push({ room: R(HX + WT, W.maxX, z0, z1), door: R(HX, HX + WT, dd.z0, dd.z1), name });
    }
    // (the stall fronts' doorways: the fronts were laid whole; cut them now)
    for (let q = boxes.length - 1; q >= 0; q--) {
      const b = boxes[q];
      if (b.deco !== "stallfront") continue;
      boxes.splice(q, 1);
      const z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, m = (z0 + z1) / 2, e = { color: "#4a3a6a", deco: "stall" };
      wb(100.4, 100.5, z0, z0 + 0.4, Y1, Y1 + 2.0, "wall", e); wb(100.4, 100.5, z0 + 1.35, m + 0.4, Y1, Y1 + 2.0, "wall", e); wb(100.4, 100.5, m + 1.35, z1, Y1, Y1 + 2.0, "wall", e);
    }
    wb(95.5, 96.3, W.minZ + 0.1, W.minZ + 0.7, Y1, Y1 + 1.0, "boxes", { color: "#5a6a8a", deco: "cleancart" });
    // the doors (E opens and shuts them; all shut at dawn)
    for (const d of doors) {
      if (d.alongX) { wb(d.z0, d.z1, d.z - 0.05, d.z + 0.05, Y1, DH, "wall", { hide: true, deco: "doorleaf" }); props.push({ id: "feverdoor_" + d.name, kind: "door", x: d.x, y: Y1 + 1.3, z: d.z, yaw: 0, hw: (d.z1 - d.z0) / 2, hd: 0.15, box: boxes.length - 1, door: "solid" }); continue; } // (z0/z1: its x span)
      wb(d.x - 0.05, d.x + 0.05, d.z0, d.z1, Y1, DH, "wall", { hide: true, deco: "doorleaf" });
      props.push({ id: "feverdoor_" + d.name, kind: "door", x: d.x, y: Y1 + 1.3, z: d.z, yaw: -PI / 2, hw: 0.15, hd: (d.z1 - d.z0) / 2, box: boxes.length - 1, door: "solid" });
    }
    const WD = doors.find((d) => d.name === "wing")!;
    // a booth by the wing's corner, facing the floor
    booth(F.maxX - T - 1.95, 23.0, PI, Y1);
    // the island bar under the atrium (you drink and look up at floor 2 and the sky): a ring with a gap for the
    // bartenders, a tower of glowing bottles in the middle
    // (R11.3, Blake: "get rid of the corner bar... almost double the size of the island bar and move it back a bit
    // more": 9 m across now (5.8 before), 3 m further back; a back-bar ring of bottles round the tower inside it)
    const AC: Pt = [(A.minX + A.maxX) / 2, (A.minZ + A.maxZ) / 2], IC: Pt = [AC[0], AC[1] + 3];
    const bars: FeverArc[] = [];
    const island: FeverArc = { x: IC[0], z: IC[1], r0: 3.55, r1: 4.5, a0: PI / 2 + 0.26, a1: PI / 2 + 2 * PI - 0.26, y: Y1 }; // (a 2.3 m gap at the north for the bartenders)
    arcBox(island, Y1, 1.1, "counter", { color: "#1f1530", deco: "feverbar" }, 28); bars.push(island);
    arcBox({ x: IC[0], z: IC[1], r0: 2.05, r1: 2.5, a0: PI / 2 + 0.5, a1: PI / 2 + 2 * PI - 0.5, y: Y1 }, Y1, 1.0, "shelf", { color: "#1b1424", deco: "backbar" }, 16);
    disc(IC[0], IC[1], 1.0, Y1, 3.6, "shelf", { color: "#141018", deco: "bottletower" });
    // the back corner (where the corner bar was): a booth nook, and the staff door (scenery) on the back wall
    booth(95.2, F.maxZ - T - 1.95, -PI / 2, Y1); booth(F.maxX - T - 1.95, 28.3, PI, Y1);
    // the little dance floor: in the middle now, just south of the island bar (its stools touch the edge), speakers
    const D1 = R(84.4, 92.6, 11.9, 17.6);
    for (const x of [83.0, 94.0]) wb(x - 0.4, x + 0.4, 12.0, 12.8, Y1, 2.2, "boxes", { color: "#141018", deco: "speaker" });
    // FLOOR 2: curved booths (south-west, west, north-west), two curved benches round the atrium's west side (a gap
    // for the catwalk), two round podiums on the dance floor
    // (R11.3: the south-west corner is DON BINNIE's now: its booths and the podium moved out)
    booth(F.minX + T + 1.95, 27.6, 0, Y2); booth(80.0, 27.2, -PI / 2, Y2); // (clear of the bay's mouth)
    for (const [u0, u1] of [[150, 172], [188, 210]]) {
      const b: FeverArc = { x: AC[0], z: AC[1], r0: 5.55, r1: 6.2, a0: (u0 * PI) / 180, a1: (u1 * PI) / 180, y: Y2, col: "#9e1b32", back: { r0: 5.95, a0: (u0 * PI) / 180, a1: (u1 * PI) / 180, h: 1.1, col: "#6e0f22" } };
      arcBox(b, Y2, 0.5, "sofa", { color: "#9e1b32", deco: "booth", hide: true }); arcBox({ ...b, r0: 5.95 }, Y2, 1.1, "sofa", { color: "#6e0f22", deco: "boothback", hide: true });
      booths.push(b);
    }
    const stages: Rect[] = [];
    for (const [x, z] of [[98.0, 20.6], [93.6, 11.6]] as Pt[]) { disc(x, z, 1.15, Y2, 0.7, "platform", { color: "#2b2440", deco: "stage" }); stages.push(R(x - 1.1, x + 1.1, z - 1.1, z + 1.1)); }
    // TRASH PANDA's booth (R11.3: the north-east corner, turned to the floor: the first thing you see off the stairs)
    const DJP: Pt[] = [[96.2, F.maxZ - T], [F.maxX - T, F.maxZ - T], [F.maxX - T, 25.7]];
    boxes.push({ ...polyBox(DJP, 1.1, "platform", Y2), color: "#1b1424", deco: "djbooth" });
    { const mx = 99.3, mz = 28.8, tx = 1 / S2, tz = -1 / S2, nx = -1 / S2, nz = -1 / S2;
      const P = (s: number, o: number): Pt => [mx + tx * s + nx * o, mz + tz * s + nz * o];
      boxes.push({ ...polyBox([P(-0.9, 0), P(0.9, 0), P(0.9, 0.7), P(-0.9, 0.7)], 0.55, "step", Y2), color: "#2b2440" }); } // (a step up to it)
    const dj = { x: 100.5, y: Y2 + 1.1, z: 30.0, yaw: -3 * PI / 4 };
    // the performance corner: flight cases by the booth (R11.2); a drinks ledge with stools in both bays
    wb(93.3, 95.0, 31.0, F.maxZ - T, Y2, Y2 + 0.8, "boxes", { color: "#1b1b22", deco: "cases" });
    wb(BAY.minX + 0.12, BAY.minX + 0.5, 13.0, 25.0, Y2, Y2 + 1.05, "counter", { color: "#1b1424", deco: "bayledge" });
    wb(BAY2.maxX - 0.5, BAY2.maxX - 0.12, 13.0, 25.0, Y2, Y2 + 1.05, "counter", { color: "#1b1424", deco: "bayledge" });
    const LAND2 = R(SW1.maxX, 92.9, 27.4, F.maxZ - T); // (the top of the stairs: kept clear, like the bottom)
    // DON BINNIE's lounge (R11.3, Blake: "move him back to where one of the windows are... make his area a little
    // bigger"): the south-west corner along the side-street windows, the far side of the room from the stairs.
    // Raised, glass rails, the gap where his two boys stand (facing the room), the throne-booth with its back to the
    // windows, a gold table
    const VIP = R(F.minX + T, 88.4, F.minZ + T, 12.4), VG = [82.6, 84.2] as const, VY = Y2 + 0.35;
    boxes.push({ ...polyBox(clipCorner([[VIP.minX, VIP.minZ], [VIP.maxX, VIP.minZ], [VIP.maxX, VIP.maxZ], [VIP.minX, VIP.maxZ]]), VY - Y2, "platform", Y2), color: "#2a0f1e", deco: "viplounge" });
    wb(VG[0], VG[1], VIP.maxZ, VIP.maxZ + 0.7, Y2, Y2 + 0.18, "step", { color: "#3a1428" });
    rail(VIP.minX, VG[0], VIP.maxZ, VIP.maxZ + 0.08, Y2); rail(VG[1], VIP.maxX, VIP.maxZ, VIP.maxZ + 0.08, Y2);
    rail(VIP.maxX, VIP.maxX + 0.08, VIP.minZ, VIP.maxZ, Y2);
    const throne: FeverArc = { x: 80.6, z: 8.7, r0: 1.2, r1: 2.0, a0: -PI / 2 - 2.0, a1: -PI / 2 + 2.0, y: VY }; // (its back to the windows, open toward the room)
    throne.col = "#6b2a9e"; throne.back = { r0: 1.7, a0: throne.a0, a1: throne.a1, h: 1.45, col: "#4a1a72" };
    arcBox(throne, VY, 0.5, "sofa", { color: "#6b2a9e", deco: "throne", hide: true }); arcBox({ ...throne, r0: 1.7 }, VY, 1.45, "sofa", { color: "#4a1a72", deco: "throneback", hide: true }); // (R11.1: purple and gold; R11.5: drawn smooth)
    disc(80.6, 10.2, 0.5, VY, 0.7, "table", { color: "#ffd54a", deco: "goldtable" });
    posts.push({ kind: "don", x: throne.x, z: throne.z, yaw: 0, y: VY });
    posts.push({ kind: "velvet_guard", x: VG[0] - 0.6, z: VIP.maxZ + 1.1, yaw: 0, y: Y2 }, { kind: "velvet_guard", x: VG[1] + 0.6, z: VIP.maxZ + 1.1, yaw: 0, y: Y2 });
    const vipOut = { x: (VG[0] + VG[1]) / 2, z: VIP.maxZ + 1.6, yaw: 0 };
    // potted palms (all three levels)
    const pots = [[78.4, Y1, 8.2], [74.4, Y1, 15.0], [87.5, Y1, 28.3], [95.9, Y1, 21.8], [96.3, Y1, 24.6],
      [86.9, Y2, 7.4], [75.0, Y2, 11.2], [74.6, Y2, 31.1], [95.7, Y2, 31.1], [97.4, Y2, 10.0], [83.0, Y2, 28.4],
      [75.0, RY, 26.4], [81.9, RY, 26.4], [95.2, RY, 23.6], [101.9, RY, 10.4], [86.4, RY, 10.0], [74.6, RY, 12.6]].map(([x, y, z]) => ({ x, y, z, r: 0.42 }));
    for (const pt of pots) disc(pt.x, pt.z, pt.r, pt.y, 0.55, "pot", { color: "#2b2433", deco: "palm" });
    // ---- the roof (R11.3, Blake: "more of a social area... another island bar up there, visible speakers, DJ a bit
    //      more centred, plants, seating area, smoking area kind of vibe"; open air under pergolas). LIL PANDA's
    //      pavilion in the middle of the back edge facing the glass floor (the dance floor); speaker stacks on poles
    //      either side; the island bar on the west under a pergola; the lounge along the east; the smokers' corner
    //      (fire pit, heaters; nobody shown smoking) in the north-east; booths and tables in the south-west ----
    const PAV = R(84.0, 93.0, 28.4, F.maxZ - T);
    wb(PAV.minX, PAV.maxX, PAV.minZ, PAV.maxZ, RY, RY + 0.6, "platform", { color: "#1b1424", deco: "pavilion" });
    wb(87.5, 89.5, PAV.minZ - 0.8, PAV.minZ, RY, RY + 0.3, "step", { color: "#2b2440" });
    for (const [x, z] of [[PAV.minX + 0.2, PAV.minZ + 0.2], [PAV.maxX - 0.2, PAV.minZ + 0.2], [PAV.minX + 0.2, PAV.maxZ - 0.2], [PAV.maxX - 0.2, PAV.maxZ - 0.2]] as Pt[]) wb(x - 0.15, x + 0.15, z - 0.15, z + 0.15, RY + 0.6, RY + 4.0, "wall", { color: DARK });
    wb(PAV.minX - 0.6, PAV.maxX + 0.6, PAV.minZ - 0.6, PAV.maxZ + 0.3, RY + 4.0, RY + 4.35, "roof", { color: DARK, deco: "canopy" });
    wb(PAV.minX + 2.0, PAV.maxX - 2.0, PAV.minZ + 1.0, PAV.maxZ - 0.6, RY + 4.35, RY + 5.6, "wall", { color: DARK, deco: "crown" });
    for (const x of [PAV.minX - 1.4, PAV.maxX + 1.4]) wb(x - 0.14, x + 0.14, 30.0, 30.28, RY, RY + 3.4, "wall", { color: "#1b1420", deco: "roofspeaker" });
    const roofBar: FeverArc = { x: 78.4, z: 19.5, r0: 1.9, r1: 2.75, a0: PI + 0.42, a1: PI + 2 * PI - 0.42, y: RY }; // (the bartenders' gap faces the parapet)
    arcBox(roofBar, RY, 1.1, "counter", { color: "#1f1530", deco: "feverbar" }, 16); bars.push(roofBar);
    disc(roofBar.x, roofBar.z, 0.6, RY, 2.4, "shelf", { color: "#141018", deco: "bottletower" });
    for (const [x, z] of [[74.9, 15.3], [81.9, 15.3], [74.9, 23.7], [81.9, 23.7]] as Pt[]) wb(x - 0.09, x + 0.09, z - 0.09, z + 0.09, RY, RY + 3.0, "wall", { color: "#5a3a22", deco: "pergola" });
    booth(F.maxX - T - 1.95, 13.4, PI, RY); booth(F.maxX - T - 1.95, 18.6, PI, RY); booth(81.4, F.minZ + T + 2.05, PI / 2, RY);
    for (const [x, z] of [[77.6, 11.6], [77.2, 28.9], [80.6, 29.6]] as Pt[]) disc(x, z, 0.42, RY, 0.72, "table", { color: "#2b2433", deco: "rooftable" });
    const SMOKE = { x: 99.0, z: 28.6 };
    disc(SMOKE.x, SMOKE.z, 0.7, RY, 0.45, "table", { color: "#3a3440", deco: "firepit" });
    { const b: FeverArc = { x: SMOKE.x, z: SMOKE.z, r0: 1.55, r1: 2.15, a0: PI / 4 - 1.9, a1: PI / 4 + 1.9, y: RY };
      b.col = "#3a4a3a"; arcBox(b, RY, 0.45, "sofa", { color: "#3a4a3a", deco: "smokebench", hide: true }); booths.push(b); }
    for (const [x, z] of [[95.9, 31.3], [102.0, 24.5]] as Pt[]) wb(x - 0.12, x + 0.12, z - 0.12, z + 0.12, RY, RY + 2.3, "wall", { color: "#8a8a96", deco: "heater" });
    // ---- R11.4: the back EXIT (green steel, a push bar inside, no handle outside; it swings shut by itself) and the
    //      back alley behind it (between SPECS APPEAL and HAIR FORCE ONE): dumpsters, bins, a crate stack, and
    //      SKETCHY STEVE under a lamp with his briefcase of goods on a crate (Blake: "a drug dealer and he deals funny
    //      drugs that give you temporary buffs": made-up cartoon stuff, nothing real) ----
    wb(BD.minX, BD.maxX, F.maxZ - T + 0.1, F.maxZ - 0.1, 0, 2.35, "wall", { hide: true, deco: "doorleaf" });
    props.push({ id: "feverdoor_exit", kind: "door", x: (BD.minX + BD.maxX) / 2, y: 1.3, z: F.maxZ - T / 2, yaw: 0, hw: (BD.maxX - BD.minX) / 2, hd: 0.15, box: boxes.length - 1, door: "exit", oneWay: [0, 1] });
    const ALLEY = R(83.8, 91.5, F.maxZ, 45.0);
    wb(89.9, 91.45, 33.4, 35.3, 0, 1.45, "boxes", { color: "#2f5a3a", deco: "dumpster" });
    wb(83.85, 85.4, 42.0, 43.9, 0, 1.45, "boxes", { color: "#3a4a6a", deco: "dumpster" });
    for (const z of [36.0, 36.8]) wb(83.9, 84.6, z, z + 0.7, 0, 1.0, "boxes", { color: "#2b2b33", deco: "bin" });
    wb(83.9, 85.1, 39.6, 40.8, 0, 0.9, "boxes", { color: "#6b4a2b", deco: "crates" });
    const DEALER = { x: 90.6, z: 37.7, yaw: -PI / 2 }, DEALER_HIDE = { x: 87.4, z: 47.5 };
    wb(88.9, 89.5, 37.3, 38.1, 0, 0.75, "boxes", { color: "#5a4632", deco: "stevecrate" });
    for (const [k, z] of [["zoomies", 37.45], ["beef", 37.7], ["floaty", 37.95]] as [DealKind, number][]) props.push({ id: "deal_" + k, kind: "dealgoods", x: 89.2, y: 0.9, z, yaw: PI / 2, sell: k });
    posts.push({ kind: "sketchy_steve", x: DEALER.x, z: DEALER.z, yaw: DEALER.yaw });
    // ---- R11.5 (Blake's staircase photo: "these slats, kind of verticals... implemented into the nightclub"): warm
    //      timber slat screens, floor to ceiling up the open sides of both staircases, and screens between booths;
    //      each is a thin wall you can't get through (the renderer draws the slats) ----
    const SLATS: [number, number, number, number, number, number][] = [
      [SW1.minX, SW1.minZ - 0.08, 84.3, SW1.minZ, 0, Y2 - SL], // (floor 1: the open side, stopping short of the way under to the EXIT)
      [SW1.minX, SW1.minZ - 0.08, SW1.maxX, SW1.minZ, Y2, RY - SL], [SW1.minX - 0.08, SW1.minZ, SW1.minX, F.maxZ - T, Y2, RY - SL], // (floor 2: the stairwell)
      [SW2.minX, SW2.maxZ, SW2.maxX, SW2.maxZ + 0.08, Y2, RY - SL], // (the stairs to the roof)
      [84.76, F.minZ + T, 84.84, 10.0, TY, TY + 2.2], [90.26, F.minZ + T, 90.34, 10.0, TY, TY + 2.2], // (between the tier's booths)
      [F.minX + T, 19.21, 76.4, 19.29, Y1, Y1 + 2.2], // (between the west wall's booths)
      [97.0, 28.8, 97.08, F.maxZ - T, Y1, Y1 + 2.2], // (the back corner's booths: hard against the first one's back)
      [100.6, 15.96, F.maxX - T, 16.04, RY, RY + 2.2], // (the roof's lounge booths)
    ];
    for (const [x0, z0, x1, z1, y0, y1] of SLATS) wb(x0, x1, z0, z1, y0, y1, "wall", { hide: true, deco: "slats" });
    // ---- the door, the rope, the bouncer, the bar's mocktail tap ----
    const M: Pt = [F.minX + CH / 2, F.minZ + CH / 2], n: Pt = [1 / S2, 1 / S2], t: Pt = [1 / S2, -1 / S2];
    const door = R(M[0] + n[0] * 0.9 - 1.1, M[0] + n[0] * 0.9 + 1.1, M[1] + n[1] * 0.9 - 1.1, M[1] + n[1] * 0.9 + 1.1);
    const out = { x: M[0] - n[0] * 2.4, z: M[1] - n[1] * 2.4, yaw: Math.atan2(-1, -1) };
    prop("clubrope", M[0] - n[0] * 1.5 - t[0] * 2.3, M[1] - n[1] * 1.5 - t[1] * 2.3, Math.atan2(-1, -1), 0, 0, 0, { y: 1.0 });
    posts.push({ kind: "bouncer", x: M[0] - n[0] * 1.7 + t[0] * 2.4, z: M[1] - n[1] * 1.7 + t[1] * 2.4, yaw: Math.atan2(-1, -1) });
    // the mocktail taps: one on the island bar (its south side), one on the roof's bar (its east side)
    prop("mocktail", IC[0], IC[1] - island.r1 - 0.15, Math.PI, 0, 0, 0, { y: 1.3 });
    prop("mocktail", roofBar.x + roofBar.r1 + 0.15, roofBar.z, PI / 2, 0, 0, 0, { y: RY + 1.11 }); // (R11.3: the corner bar's tap is on the roof bar now)
    fever = {
      rect: F, cham: CH, y2: Y2, roofY: RY, atrium: A, catwalk: CW, glassFloor: A, door, out,
      exit: BD, exitOut: { x: (BD.minX + BD.maxX) / 2, z: F.maxZ + 1.3, yaw: 0 },
      stairs1: SW1, stairs2: SW2, dance1: D1, dance2: R(A.minX, F.maxX - T - 0.4, 9.4, 27.4), danceRoof: R(82.4, 94.6, 9.8, 27.6),
      bars, booths, pots, stages, restrooms, stairApproach: STAIR_APPROACH, landing2: LAND2, host: HOST, tier: TIER, vip: VIP, vipOut, throne, dj, dj2: { x: (PAV.minX + PAV.maxX) / 2, y: RY + 0.6, z: (PAV.minZ + PAV.maxZ) / 2 + 0.4, yaw: Math.PI }, djBooth: DJP, smoke: SMOKE, roofBar,
      pavilion: PAV, bay: BAY, bay2: BAY2,
      wing: W, wingDoor: R(WD.z0, WD.z1, W.maxZ, W.maxZ + WT), hall: R(W.minX, HX, W.minZ, W.maxZ), backDoor: BD, alley: ALLEY, slats: SLATS,
      dealer: DEALER, dealerHide: DEALER_HIDE,
    };
  }

  // R12.1: THE SOGGY SHAMROCK (Blake: "the mirrored side to the night club, an Irish pub, 2 levels, bottom level a
  // cool pub experience where you have to split the G, Irish themed, Irish music playing").
  // R12.1b (Blake: "make the bar a bit bigger... the outside somewhat like the Temple Bar, the red building... 1 wall
  // between the booths... more clutter, really lived in... darker glossy mahogany... the outside completely different
  // from the club, less blocky, bits that jut out, heaps of detail"): the whole block now, like the club (the alley
  // between the two rows goes; it carries on behind). Three street fronts in pillar-box red, gold on black, with bays;
  // the main door in the cut corner at the crossroads and a side door on the side street. Inside: a big horseshoe
  // island bar round a carved gantry, four high-backed snugs down the west wall (one partition between each pair), the
  // fire, the band's little stage in the north-east corner, the stairs along the north wall (roped off till R12.2),
  // window seats, barrel tables; eight regulars-in-the-making who live there (two out on the pavement)
  let pub: ArenaLayout["pub"];
  if (R2) {
    type Pt = [number, number];
    const P = R(-102.7, -73.6, 6.3, 32.4), CH = 5, T = 0.3, Y1 = 0.19, Y2 = 4.8, SL = 0.35, RY = 9.4, PAR = 0.9, S2 = Math.SQRT2, PI = Math.PI;
    const BRICK = "#5a2a22";
    // ---- clear the plot (prop box indexes kept straight); its loot moves up the alley behind or onto the pavement ----
    {
      const keep = boxes.map((b) => b.kind === "sidewalk" || !inRect(P, b.x, b.z, 0.1));
      const remap = new Map<number, number>();
      const kept: Box[] = [];
      boxes.forEach((b, i) => { if (keep[i]) { remap.set(i, kept.length); kept.push(b); } });
      for (const pd of props) if (pd.box !== undefined) pd.box = remap.get(pd.box);
      for (let q = 0; q < pumpBoxes.length; q++) pumpBoxes[q] = remap.get(pumpBoxes[q]) ?? -1;
      boxes.length = 0; boxes.push(...kept);
      const clearAt = (x: number, z: number) => !inRect(P, x, z, 1) && !boxes.some((b) => (b.kind === "building" || b.kind === "tower") && footSd(b, x, z).d < 0.8);
      for (const l of loot) if (l.y < 0.5 && inRect(P, l.x, l.z, 0.3)) {
        const ax = Math.max(-91.0, Math.min(-84.4, l.x)); // (into the alley's line, then up it)
        const dz = [27, 25, 29, 23, 31, 21, 33].map((d) => P.maxZ + 1.5 + ((l.z - P.minZ) / (P.maxZ - P.minZ)) * 8 + d - 27).find((zz) => clearAt(ax, zz));
        if (dz !== undefined) { l.x = ax; l.z = dz; l.tier = tierAt(l.z); } else l.y = -99;
      }
    }
    const wb = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, kind: Box["kind"] = "wall", extra: Partial<Box> = {}) => {
      if (x1 - x0 < 0.01 || z1 - z0 < 0.01 || y1 - y0 < 0.01) return;
      boxes.push({ ...box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, kind, y0), ...extra });
    };
    const disc = (x: number, z: number, r: number, y0: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}) => {
      const Q: Pt[] = []; for (let q = 0; q < 8; q++) { const u = (q / 8) * 2 * PI + PI / 8; Q.push([x + Math.cos(u) * r, z + Math.sin(u) * r]); }
      boxes.push({ ...polyBox(Q, h, kind, y0), ...extra });
    };
    /** a ring sector of quads (a rounded corner of the bar) */
    const ring = (cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, h: number, kind: Box["kind"], extra: Partial<Box>) => {
      const n = 3;
      for (let q = 0; q < n; q++) { const u0 = a0 + ((a1 - a0) * q) / n, u1 = a0 + ((a1 - a0) * (q + 1)) / n; const Pq = (r: number, u: number): Pt => [cx + Math.cos(u) * r, cz + Math.sin(u) * r]; boxes.push({ ...polyBox([Pq(r0, u0), Pq(r1, u0), Pq(r1, u1), Pq(r0, u1)], h, kind, y0), ...extra }); }
    };
    const top = RY + PAR, sh = { color: BRICK, deco: "pubshell" };
    // ---- the shell: three street fronts (south: the side street; east: across from the club; west: the far avenue),
    //      the party wall (north, onto the alley), the cut corner with the main door. Floor 1's shopfront: a plinth,
    //      big windows between piers, the fascia band; upstairs: separate sash windows in brick ----
    const SD = R(-96.3, -94.3, P.minZ, P.minZ + T), DH = 2.9; // (the side door, on the side street)
    const front = (alongX: boolean, f0: number, f1: number, a0: number, a1: number, gaps: [number, number][] = []) => {
      const put = (a: number, b: number, y0: number, y1: number, kind: Box["kind"], th = 1, ex: Partial<Box> = {}) => {
        if (b - a < 0.02) return;
        const m = ((f1 - f0) * (1 - th)) / 2;
        const e = kind === "wall" ? { ...sh, ...ex } : { deco: "pubwindow", ...ex };
        if (alongX) wb(a, b, f0 + m, f1 - m, y0, y1, kind, e); else wb(f0 + m, f1 - m, a, b, y0, y1, kind, e);
      };
      // the solid bits, cut round the doors
      const solid = (y0: number, y1: number) => { let a = a0; for (const [g0, g1] of gaps) { if (y0 < DH) { put(a, g0, y0, y1, "wall"); a = g1; } } put(a, a1, y0, y1, "wall"); if (y0 < DH) for (const [g0, g1] of gaps) put(g0, g1, DH, y1, "wall"); };
      solid(0, 0.75);
      // floor 1: the big windows between piers (a door gap is a gap)
      { const n = Math.max(1, Math.round((a1 - a0) / 2.6)), step = (a1 - a0) / n, pw = 0.5;
        for (let q = 0; q <= n; q++) { const c = a0 + q * step, s0 = Math.max(a0, c - pw / 2), s1 = Math.min(a1, c + pw / 2); if (!gaps.some(([g0, g1]) => s1 > g0 - 0.3 && s0 < g1 + 0.3)) put(s0, s1, 0.75, 3.3, "wall"); }
        for (let q = 0; q < n; q++) {
          const g0 = a0 + q * step + pw / 2, g1 = a0 + (q + 1) * step - pw / 2;
          const cuts = gaps.filter(([x0, x1]) => x1 > g0 && x0 < g1);
          if (!cuts.length) { put(g0, g1, 0.75, 3.3, "glass", 0.4); continue; }
          let a = g0; for (const [x0, x1] of cuts) { put(a, x0 - 0.25, 0.75, 3.3, "wall"); a = x1 + 0.25; } put(a, g1, 0.75, 3.3, "wall");
          for (const [x0, x1] of cuts) { put(x0 - 0.25, x0, 0.75, 3.3, "wall"); put(x1, x1 + 0.25, 0.75, 3.3, "wall"); put(x0, x1, DH, 3.3, "wall"); }
        }
      }
      put(a0, a1, 3.3, 5.5, "wall");
      // upstairs: sash windows (1.1 m) every ~2.6 m, brick between
      { const n = Math.max(1, Math.round((a1 - a0) / 2.6)), step = (a1 - a0) / n, ww = 1.1;
        let a = a0; for (let q = 0; q < n; q++) { const c = a0 + (q + 0.5) * step; put(a, c - ww / 2, 5.5, 8.3, "wall"); put(c - ww / 2, c + ww / 2, 5.5, 8.3, "glass", 0.4, { deco: "pubsash" }); a = c + ww / 2; } put(a, a1, 5.5, 8.3, "wall"); }
      put(a0, a1, 8.3, top, "wall");
    };
    front(true, P.minZ, P.minZ + T, P.minX, P.maxX - CH, [[SD.minX, SD.maxX]]);
    front(false, P.maxX - T, P.maxX, P.minZ + CH, P.maxZ);
    front(false, P.minX, P.minX + T, P.minZ, P.maxZ);
    wb(P.minX + T, P.maxX, P.maxZ - T, P.maxZ, 0, top, "wall", sh);
    // the cut corner: the main door (2.4 m) in the middle
    const DW = 2.4, DHc = 3.0;
    const P0: Pt = [P.maxX - CH, P.minZ], P1: Pt = [P.maxX, P.minZ + CH];
    {
      const d = T / S2, L = CH * S2;
      const outer = (s: number): Pt => [P0[0] + (P1[0] - P0[0]) * s, P0[1] + (P1[1] - P0[1]) * s];
      const inner = (s: number): Pt => { const o = outer(s); return [o[0] - d, o[1] + d]; };
      const seg = (s0: number, s1: number, y0: number, y1: number) => boxes.push({ ...polyBox([outer(s0), outer(s1), inner(s1), inner(s0)], y1 - y0, "wall", y0), ...sh });
      const sd0 = 0.5 - DW / 2 / L, sd1 = 0.5 + DW / 2 / L;
      seg(0, sd0, 0, top); seg(sd1, 1, 0, top); seg(sd0, sd1, DHc, top);
    }
    const M: Pt = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2], nIn: Pt = [-1 / S2, 1 / S2];
    const cut = P.maxX - P.minZ - CH - T * S2; // (inside the cut corner: x - z <= this)
    const clip = (Q: Pt[]): Pt[] => {
      const out: Pt[] = [];
      for (let q = 0; q < Q.length; q++) {
        const a = Q[q], b = Q[(q + 1) % Q.length], da = cut - (a[0] - a[1]), db = cut - (b[0] - b[1]);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    // bay windows jutting out over the pavement (east and south fronts): a panelled base, glass, a lead roof
    const bays: Rect[] = [R(P.maxX, P.maxX + 0.45, 15.0, 18.0), R(P.maxX, P.maxX + 0.45, 21.5, 24.5), R(-91.5, -88.5, P.minZ - 0.45, P.minZ), R(-86.0, -83.0, P.minZ - 0.45, P.minZ), R(P.minX - 0.45, P.minX, 13.0, 16.0), R(P.minX - 0.45, P.minX, 24.0, 27.0)];
    for (const b of bays) wb(b.minX, b.maxX, b.minZ, b.maxZ, 0, 0.75, "wall", { ...sh, deco: "pubbay" });
    // ---- floors: floor 1 (boards), floor 2's slab round the stairwell, the roof ----
    const IN = R(P.minX + T, P.maxX - T, P.minZ + T, P.maxZ - T);
    const ST = R(-100.8, -93.6, IN.maxZ - 1.3, IN.maxZ); // (the stairs: along the north wall, rising west to a landing)
    const slab = (y0: number, h: number, kind: Box["kind"], hole: Rect | null, extra: Partial<Box>) => {
      const parts: Rect[] = hole ? [R(IN.minX, IN.maxX, IN.minZ, hole.minZ), R(IN.minX, hole.minX, hole.minZ, hole.maxZ), R(hole.maxX, IN.maxX, hole.minZ, hole.maxZ)] : [IN];
      for (const r of parts) {
        if (r.maxX - r.minX < 0.01 || r.maxZ - r.minZ < 0.01) continue;
        const Q = clip([[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]]);
        if (Q.length >= 3) boxes.push({ ...polyBox(Q, h, kind, y0), ...extra });
      }
    };
    slab(0.15, 0.04, "shopfloor", null, { color: "#22140a", deco: "pubfloor" });
    slab(Y2 - SL, SL, "roof", ST, { color: "#2a1810", deco: "pubfloor2" });
    slab(RY - SL, SL, "roof", null, { color: "#2a2a30", deco: "pubroof" });
    { const n = 23, run = (ST.maxX - ST.minX) / n, rise = (Y2 - Y1) / n;
      for (let q = 1; q <= n; q++) wb(ST.maxX - q * run, ST.maxX - (q - 1) * run, ST.minZ, ST.maxZ, 0, Y1 + q * rise, "step", { color: "#2a140a", deco: "pubstep" }); }
    wb(ST.minX, ST.maxX, ST.minZ - 0.08, ST.minZ, 0, Y2 - SL, "wall", { hide: true, deco: "spindles" }); // (the open side, closed in under the stairs)
    wb(ST.minX, ST.maxX, ST.minZ - 0.08, ST.minZ, Y2, Y2 + 1.0, "wall", { hide: true, deco: "banister" });
    wb(ST.maxX, ST.maxX + 0.08, ST.minZ, ST.maxZ, Y2, Y2 + 1.0, "wall", { hide: true, deco: "banister" });
    // (R12.2: the rope's off: upstairs is open)
    // ---- the horseshoe: an island bar (a ring of counter with rounded corners, a flap at the back for the staff)
    //      round a tall carved gantry (shelves, mirrors, the stained-glass signs on top, the chalkboard) ----
    const HB = R(-94.5, -83.5, 13.5, 21.5), CD = 0.75, CR = 1.0, FLAP = R(-89.25, -87.75, HB.maxZ - CD, HB.maxZ);
    const bx = { color: "#2a0e06", deco: "pubbar", hide: true }, BH = 1.1;
    wb(HB.minX + CR, HB.maxX - CR, HB.minZ, HB.minZ + CD, Y1, Y1 + BH, "counter", bx);
    wb(HB.minX, HB.minX + CD, HB.minZ + CR, HB.maxZ - CR, Y1, Y1 + BH, "counter", bx);
    wb(HB.maxX - CD, HB.maxX, HB.minZ + CR, HB.maxZ - CR, Y1, Y1 + BH, "counter", bx);
    wb(HB.minX + CR, FLAP.minX, HB.maxZ - CD, HB.maxZ, Y1, Y1 + BH, "counter", bx); wb(FLAP.maxX, HB.maxX - CR, HB.maxZ - CD, HB.maxZ, Y1, Y1 + BH, "counter", bx);
    for (const [cx, cz, a0] of [[HB.minX + CR, HB.minZ + CR, PI], [HB.maxX - CR, HB.minZ + CR, 1.5 * PI], [HB.maxX - CR, HB.maxZ - CR, 0], [HB.minX + CR, HB.maxZ - CR, PI / 2]] as [number, number, number][]) ring(cx, cz, CR - CD, CR, a0, a0 + PI / 2, Y1, BH, "counter", bx);
    const GT = R(-91.2, -86.8, 16.9, 18.1);
    wb(GT.minX, GT.maxX, GT.minZ, GT.maxZ, Y1, Y1 + 3.4, "shelf", { color: "#2a0e06", deco: "pubgantry", hide: true });
    const LANE = R(HB.minX + CD, HB.maxX - CD, HB.minZ + CD, HB.maxZ - CD);
    // the taps: two on the front (south), one on the east side; the chalkboard on the gantry's front
    const taps = [{ x: -91.0, y: Y1 + 1.12, z: HB.minZ + 0.25, face: [0, -1] as [number, number] }, { x: -86.0, y: Y1 + 1.12, z: HB.minZ + 0.25, face: [0, -1] as [number, number] }, { x: HB.maxX - 0.25, y: Y1 + 1.12, z: 18.6, face: [1, 0] as [number, number] }];
    taps.forEach((t, i) => props.push({ id: `pinttap${i + 1}`, kind: "pinttap", x: t.x, y: t.y, z: t.z, yaw: Math.atan2(t.face[0], t.face[1]) }));
    props.push({ id: "pubboard1", kind: "pubboard", x: (GT.minX + GT.maxX) / 2, y: Y1 + 2.65, z: GT.minZ - 0.04, yaw: PI });
    const barman = { x: -89.0, z: 15.4, yaw: PI };
    posts.push({ kind: "barman", x: barman.x, z: barman.z, yaw: barman.yaw, y: Y1 });
    // the stools all round the outside (none in front of a tap); the regulars' two are on the west side
    const stools: { x: number; z: number }[] = [];
    for (let x = HB.minX + 1.1; x < HB.maxX - 1.0; x += 0.9) if (!taps.some((t) => t.face[1] && Math.abs(t.x - x) < 0.85) && Math.abs(x - -88.5) > 0.6) stools.push({ x, z: HB.minZ - 0.5 });
    for (let z = HB.minZ + 1.2; z < HB.maxZ - 1.0; z += 0.9) { stools.push({ x: HB.minX - 0.5, z }); if (!taps.some((t) => t.face[0] && Math.abs(t.z - z) < 0.85) && Math.abs(z - 15.6) > 0.5) stools.push({ x: HB.maxX + 0.5, z }); }
    for (let x = HB.minX + 1.1; x < HB.maxX - 1.0; x += 0.9) if (x < FLAP.minX - 0.5 || x > FLAP.maxX + 0.5) stools.push({ x, z: HB.maxZ + 0.5 });
    const sitAt = new Set<string>(); // (stools somebody's sitting on: no box under them)
    const regs: Pt[] = [[HB.minX - 0.5, HB.minZ + 2.1], [HB.minX - 0.5, HB.minZ + 3.0]];
    posts.push({ kind: "regular", x: regs[0][0] - 0.1, z: regs[0][1], yaw: PI / 2, y: Y1, v: 0, sit: 0.72 }, { kind: "regular", x: regs[1][0] - 0.1, z: regs[1][1], yaw: PI / 2, y: Y1, v: 1, sit: 0.72 });
    // ---- the drinkers (R12.1b: "more real NPCs"): eight who live here, six inside, two out on the pavement ----
    const patrons: { x: number; z: number; yaw: number; sit?: number; y?: number }[] = [
      { x: -88.5, z: HB.minZ - 0.75, yaw: 0 }, // (leaning on the bar's front, between the taps)
      { x: HB.maxX + 0.6, z: 15.6, yaw: -PI / 2, sit: 0.72 }, // (on a stool on the east side)
      { x: -101.6, z: 9.45, yaw: 0, sit: 0.46 }, { x: -100.6, z: 15.98, yaw: 0, sit: 0.46 }, // (in the snugs)
      { x: -86.0, z: 10.25, yaw: PI }, // (at a barrel table)
      { x: IN.maxX - 0.3, z: 19.0, yaw: -PI / 2, sit: 0.46 }, // (in the window seat)
      { x: P.maxX + 1.4, z: 22.9, yaw: PI }, { x: P.maxX + 1.9, z: 27.75, yaw: PI }, // (out on the pavement, at the parasols)
    ];
    for (const s of [...regs, [patrons[1].x - 0.1, patrons[1].z] as Pt]) for (const st of stools) if (Math.hypot(st.x - s[0], st.z - s[1]) < 0.5) sitAt.add(`${st.x},${st.z}`);
    stools.forEach((s) => { if (!sitAt.has(`${s.x},${s.z}`)) disc(s.x, s.z, 0.2, Y1, 0.72, "table", { hide: true, deco: "barstool" }); });
    patrons.forEach((p, v) => posts.push({ kind: "patron", x: p.x, z: p.z, yaw: p.yaw, y: Y1, v, sit: p.sit }));
    // ---- the snugs: four down the west wall, one partition between each pair (dark wood below, stained glass
    //      above); tufted leather benches against both faces of every partition; a table each ----
    const snugs: Rect[] = [];
    const PZ = [9.0, 12.3, 15.6, 18.9, 22.2], SX = IN.minX + 3.0;
    for (const z of PZ) wb(IN.minX, SX, z - 0.06, z + 0.06, Y1, Y1 + 2.4, "wall", { hide: true, deco: "snugwall" });
    for (let k = 0; k + 1 < PZ.length; k++) {
      const z0 = PZ[k] + 0.06, z1 = PZ[k + 1] - 0.06;
      snugs.push(R(IN.minX, SX, z0, z1));
      for (const [a, b] of [[z0, z0 + 0.55], [z1 - 0.55, z1]] as [number, number][]) {
        const seat = patrons.some((p) => p.sit && p.x < SX && p.z > a - 0.1 && p.z < b + 0.1);
        if (!seat) wb(IN.minX, SX - 0.2, a, b, Y1, Y1 + 0.46, "sofa", { hide: true, deco: "snugbench" });
      }
      disc(IN.minX + 0.75, (z0 + z1) / 2, 0.42, Y1, 0.76, "table", { hide: true, deco: "snugtable" }); // (against the wall: a table out in the middle sealed off the corners)
    }
    // ---- the fire (north wall, the middle), two wing chairs; the band's stage in the north-east corner ----
    const FIRE = { x: -88.5, z: IN.maxZ - 0.3 };
    wb(FIRE.x - 1.8, FIRE.x + 1.8, IN.maxZ - 0.6, IN.maxZ, Y1, Y2 - SL, "wall", { hide: true, deco: "chimney" });
    wb(FIRE.x - 1.4, FIRE.x + 1.4, IN.maxZ - 1.2, IN.maxZ - 0.6, Y1, Y1 + 0.1, "platform", { hide: true, deco: "hearth" });
    for (const x of [FIRE.x - 1.3, FIRE.x + 1.3]) wb(x - 0.45, x + 0.45, 28.9, 29.8, Y1, Y1 + 0.95, "sofa", { hide: true, deco: "armchair" });
    const STAGE = R(-80.6, IN.maxX, 26.2, IN.maxZ), SY = Y1 + 0.3;
    wb(STAGE.minX, STAGE.maxX, STAGE.minZ, STAGE.maxZ, Y1, SY, "platform", { hide: true, deco: "pubstage" });
    [[-79.3, 28.6], [-77.7, 29.6], [-76.0, 29.8], [-75.0, 28.0]].forEach(([x, z], v) => posts.push({ kind: "trad_band", x, z, yaw: Math.atan2(-88 - x, 20 - z), y: SY, v, sit: 0.62 }));
    // ---- tables: barrels (stand at them) by the doors and round the room, little round ones in the window seat ----
    const tables = [[-91.5, 9.5], [-86.0, 9.5], [-80.5, 16.0], [-80.0, 21.5], [-95.5, 26.0], [-84.0, 26.0]].map(([x, z]) => ({ x, z, r: 0.42 }));
    for (const t of tables) disc(t.x, t.z, t.r, Y1, 1.05, "table", { hide: true, deco: "barrel" });
    const WS = R(IN.maxX - 0.6, IN.maxX, 12.8, 25.4); // (the window seat along the east windows)
    for (const [a, b] of [[12.8, 18.4], [19.6, 25.4]] as [number, number][]) wb(WS.minX, WS.maxX, a, b, Y1, Y1 + 0.46, "sofa", { hide: true, deco: "windowseat" });
    const rounds = [[IN.maxX - 1.3, 14.5], [IN.maxX - 1.3, 19.0], [IN.maxX - 1.3, 23.5]].map(([x, z]) => ({ x, z, r: 0.36 }));
    for (const t of rounds) disc(t.x, t.z, t.r, Y1, 0.76, "table", { hide: true, deco: "roundtable" });
    // ---- out on the pavement: two barrel tables under GUZZLE'S parasols ----
    const outside = [{ x: P.maxX + 1.4, z: 22.1 }, { x: P.maxX + 1.9, z: 26.9 }];
    for (const t of outside) disc(t.x, t.z, 0.4, 0.1, 1.05, "table", { hide: true, deco: "outbarrel" });
    // ================================================================ R12.2: UPSTAIRS (Blake's answers: the function room
    // along the street fronts with the céilí floor and the céilí band's stage, the balcony off it round the corner; at the
    // back, off the landing, Mammy Moloney's whiskey snug, and the games room (pool and darts: R12.3 / R12.4))
    const U = Y2, UC = RY - SL, BW = 23.4, WT2 = 0.12, wc = { color: "#4a1612", deco: "pubwall2" };
    // the back rooms' walls: the snug (x -93.0..-84.6) and the games room (east of it), each with an open doorway
    const SNUG2 = R(-93.0 + WT2, -84.6, BW + WT2, IN.maxZ), GAMES = R(-84.6 + WT2, IN.maxX, BW + WT2, IN.maxZ), HALL = R(IN.minX, -93.0, BW, IN.maxZ);
    wb(-93.0, -93.0 + WT2, BW, 25.2, U, UC, "wall", wc); wb(-93.0, -93.0 + WT2, 26.7, IN.maxZ, U, UC, "wall", wc); wb(-93.0, -93.0 + WT2, 25.2, 26.7, U + 2.4, UC, "wall", wc); // (the snug's door, off the landing)
    wb(-93.0, -84.6, BW, BW + WT2, U, UC, "wall", wc);
    wb(-84.6, -84.6 + WT2, BW, IN.maxZ, U, UC, "wall", wc);
    wb(-84.6, -80.6, BW, BW + WT2, U, UC, "wall", wc); wb(-79.1, IN.maxX, BW, BW + WT2, U, UC, "wall", wc); wb(-80.6, -79.1, BW, BW + WT2, U + 2.4, UC, "wall", wc); // (the games room's door, off the function room)
    // the function room: the céilí floor in the middle, the céilí band's stage on the west wall, tables round it
    const CEILI_FLOOR = R(-96.0, -83.0, 10.2, 21.0), STAGE2 = R(IN.minX, -98.6, 11.5, 19.5), SY2 = U + 0.4;
    wb(STAGE2.minX, STAGE2.maxX, STAGE2.minZ, STAGE2.maxZ, U, SY2, "platform", { hide: true, deco: "pubstage2" });
    wb(STAGE2.maxX, STAGE2.maxX + 0.5, 14.8, 16.2, U, U + 0.2, "step", { hide: true, deco: "pubstage2step" });
    [[-100.9, 12.7], [-99.6, 14.4], [-99.6, 16.6], [-100.9, 18.3]].forEach(([x, z], v) => posts.push({ kind: "ceili_band", x, z, yaw: PI / 2, y: SY2, v, sit: 0.62 }));
    // the six dancers, two lines facing each other across the floor
    [[-92.5, 13.6], [-89.5, 13.6], [-86.5, 13.6], [-92.5, 17.6], [-89.5, 17.6], [-86.5, 17.6]].forEach(([x, z], v) => posts.push({ kind: "ceili_dancer", x, z, yaw: v < 3 ? 0 : PI, y: U, v }));
    const tables2 = [[-95.5, 8.3], [-89.0, 8.3], [-82.5, 8.3], [-76.6, 12.6], [-76.6, 17.2], [-76.6, 21.4], [-98.0, 22.0]].map(([x, z]) => ({ x, z, r: 0.45 }));
    for (const t of tables2) disc(t.x, t.z, t.r, U, 0.76, "table", { hide: true, deco: "table2" });
    // the balcony: French doors in the cut corner, a wrought-iron balcony round the corner and along both fronts a bit
    {
      const L = CH * S2, sd0 = 0.5 - 1.1 / L, sd1 = 0.5 + 1.1 / L;
      // (the cut corner's middle piece is re-cut: wall over the shop door up to floor 2, the French doors, wall above)
      for (let q = boxes.length - 1; q >= 0; q--) { const b = boxes[q]; if (b.poly && b.deco === "pubshell" && b.y - b.h / 2 > 2.9 && b.y - b.h / 2 < 3.1) boxes.splice(q, 1); }
      const outer = (s: number): Pt => [P0[0] + (P1[0] - P0[0]) * s, P0[1] + (P1[1] - P0[1]) * s], d = T / S2;
      const inner = (s: number): Pt => { const o = outer(s); return [o[0] - d, o[1] + d]; };
      const seg = (s0: number, s1: number, y0: number, y1: number) => boxes.push({ ...polyBox([outer(s0), outer(s1), inner(s1), inner(s0)], y1 - y0, "wall", y0), ...sh });
      const sdA = 0.5 - DW / 2 / L, sdB = 0.5 + DW / 2 / L;
      seg(sdA, sdB, DHc, U); seg(sdA, sd0, U, top); seg(sd1, sdB, U, top); seg(sd0, sd1, U + 2.6, top);
    }
    const BAL = { y: U, parts: [R(-82.3, -72.0, 4.7, P.minZ), R(P.maxX, -72.0, P.minZ, 15.0)] };
    for (const q of BAL.parts) wb(q.minX, q.maxX, q.minZ, q.maxZ, U - 0.15, U, "platform", { hide: true, deco: "balcony" });
    boxes.push({ ...polyBox([[P0[0], P0[1]], [P.maxX, P0[1]], [P1[0], P1[1]]], 0.15, "platform", U - 0.15), hide: true, deco: "balcony" });
    const rail2 = (x0: number, x1: number, z0: number, z1: number) => wb(x0, x1, z0, z1, U, U + 1.05, "wall", { hide: true, deco: "balrail" });
    rail2(-82.3, -72.0, 4.7, 4.78); rail2(-72.08, -72.0, 4.7, 15.0); rail2(-82.3, -82.22, 4.78, P.minZ); rail2(P.maxX, -72.0, 14.92, 15.0);
    const balTables = [{ x: -73.0, z: 5.6 }, { x: -80.4, z: 5.5 }];
    for (const t of balTables) disc(t.x, t.z, 0.3, U, 1.05, "table", { hide: true, deco: "baltable" });
    // MAMMY MOLONEY's whiskey snug: her chair by the fire (north wall), two old fellas reading the paper (drawn), a
    // talk spot in front of her (E)
    const MAMMY = { x: -90.4, z: 29.6, yaw: Math.atan2(-88.8 - -90.4, 25.0 - 29.6) };
    posts.push({ kind: "mammy", x: MAMMY.x, z: MAMMY.z, yaw: MAMMY.yaw, y: U, sit: 0.5 });
    props.push({ id: "mammy1", kind: "mammy", x: MAMMY.x + Math.sin(MAMMY.yaw) * 0.55, y: U + 0.8, z: MAMMY.z + Math.cos(MAMMY.yaw) * 0.55, yaw: MAMMY.yaw });
    const SNUGFIRE = { x: -88.6, z: IN.maxZ - 0.3 };
    wb(SNUGFIRE.x - 1.4, SNUGFIRE.x + 1.4, IN.maxZ - 0.55, IN.maxZ, U, UC, "wall", { hide: true, deco: "chimney2" });
    const readers = [{ x: -86.2, z: 26.0, yaw: -PI / 2 }, { x: -86.2, z: 28.4, yaw: -PI / 2 }];
    for (const rd of readers) wb(rd.x - 0.45, rd.x + 0.45, rd.z - 0.45, rd.z + 0.45, U, U + 0.95, "sofa", { hide: true, deco: "readerchair" });
    wb(-92.8, -92.3, 27.4, 30.4, U, U + 2.2, "shelf", { hide: true, deco: "whiskeyshelf" });
    // the games room: the pool table (R12.3) and the dartboard (R12.4)
    const POOL = { x: -79.2, z: 28.2, w: 2.2, d: 1.2 };
    wb(POOL.x - POOL.w / 2, POOL.x + POOL.w / 2, POOL.z - POOL.d / 2, POOL.z + POOL.d / 2, U, U + 0.82, "table", { hide: true, deco: "pooltable" });
    const DART = { x: IN.maxX, y: U + 1.73, z: 25.4 };
    const door = R(M[0] + nIn[0] * 0.6 - 1.0, M[0] + nIn[0] * 0.6 + 1.0, M[1] + nIn[1] * 0.6 - 1.0, M[1] + nIn[1] * 0.6 + 1.0);
    pub = {
      rect: P, cham: CH, y1: Y1, y2: Y2, roofY: RY, door, out: { x: M[0] - nIn[0] * 2.2, z: M[1] - nIn[1] * 2.2, yaw: Math.atan2(nIn[0], nIn[1]) },
      door2: SD, out2: { x: (SD.minX + SD.maxX) / 2, z: P.minZ - 1.3, yaw: 0 },
      bar: HB, flap: FLAP, gantry: GT, lane: LANE, taps, stairs: ST, snugs, fire: FIRE, stage: STAGE, tables, rounds, windowSeat: WS, outside, stools, barman, bays,
      ceili: CEILI_FLOOR, stage2: STAGE2, tables2, balcony: BAL.parts, balTables, snug2: SNUG2, games: GAMES, hall: HALL, mammy: MAMMY, snugFire: SNUGFIRE, readers, pool: POOL, dart: DART,
    };
  }

  // C4a: street things you can smash, one prop per box (shop windows, bus-stop glass, hydrants, mailboxes,
  // benches, planters, café and picnic tables, pallets). Broken = the box stops blocking until dawn.
  {
    const BREAK: Partial<Record<Box["kind"], PropKind>> = { glass: "shopglass", busstop: "busstop", hydrant: "hydrant", mailbox: "mailbox", bench: "bench", planter: "planter", table: "table", pallet: "pallet" };
    const nb: Record<string, number> = {};
    boxes.forEach((b, i) => {
      const k = BREAK[b.kind];
      if (!k || b.y - b.h / 2 > 0.5 || b.hide) return; // (ground level only; R8: not the glass doors' hidden boxes)
      if (R2 && inRect(NEW_PRECINCT, b.x, b.z, 0.6)) return; // (R10: nothing in or on the police station breaks: benches, planters, glass)
      if (fever && inRect(fever.rect, b.x, b.z, 2)) return; // (R11: nor in the club: it's just a vibe)
      if (pub && inRect(pub.rect, b.x, b.z, 3)) return; // (R12.1: nor in the pub; R12.1b: nor its pavement tables)
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
    const put = (type: string, x: number, z: number, r: number, yaw = 0, face?: { x: number; z: number }) => {
      for (const [dx, dz] of [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [1.4, 1.4], [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4]]) {
        // (R5: a chair turns to face its table wherever it ends up; its seat faces local +z)
        if (clear(x + dx, z + dz, r)) { junkSpots.push({ type, x: x + dx, z: z + dz, yaw: face ? Math.atan2(face.x - (x + dx), face.z - (z + dz)) : yaw }); return true; }
      }
      return false;
    };
    // chairs beside the outdoor café and picnic tables, lids beside the bins
    for (const b of boxes) if (b.kind === "table" && b.unit === undefined && b.y - b.h / 2 < 0.5 && !(fever && inRect(fever.rect, b.x, b.z, 1)) && !(pub && inRect(pub.rect, b.x, b.z, 3))) put("cafe_chair", b.x + b.w / 2 + 0.6, b.z, 0.35, 0, b);
    for (const pr of props) if (pr.kind === "bin") put("bin_lid", pr.x + 0.9, pr.z + 0.4, 0.32);
    // bottles in the alleys, crates by the courtyard dumpsters
    loot.filter((l) => l.zone === "alley").slice(0, 12).forEach((l, i) => put("glass_bottle", l.x + (i % 2 ? 0.7 : -0.7), l.z + 0.6, 0.12));
    for (const pr of props) if (pr.kind === "dumpster") put("plastic_crate", pr.x + 2.2, pr.z, 0.6);
    // the building site by the half-built skyscraper: bricks, a barrier; the build yard: barriers, barrels
    if (!R2) for (let i = 0; i < 6; i++) put("brick", 41 + (i % 3) * 0.7, -62 - Math.floor(i / 3) * 0.7, 0.12, i * 0.7);
    if (!R2) { put("traffic_barrier", 42, -83, 0.45); put("traffic_barrier", T.x - 4, T.z + 12, 0.45, Math.PI / 2); }
    if (!R2) for (const [x, z] of [[-110, -44], [-99, -46], [-111, -5], [-98, -3]]) put("oil_barrel", x, z, 0.55);
    // trolleys outside Corner Mart
    const mart = units[0];
    if (mart) for (const s2 of [-1.6, 1.6]) put("shopping_trolley", mart.doorX + mart.out[0] * 2.4 - mart.out[1] * s2, mart.doorZ + mart.out[1] * 2.4 + mart.out[0] * s2, 0.6, Math.atan2(mart.out[0], mart.out[1]));
    // C4b: spray cans: in the skate park, a few alleys, the build yard, under the railway arches
    if (!R2) for (const [x, z] of [[(pit.minX + pit.maxX) / 2 - 3, pit.maxZ - 5.5], [(pit.minX + pit.maxX) / 2 + 2, (pit.minZ + pit.maxZ) / 2 - 1], [pit.minX + 5.5, pit.minZ + 6], [-109, 10], [-109, 42]]) put("spray_can", x, z, 0.1);
    if (!R2) [[6, 8], [-6, 6], [4, -6], [-4, -8], [8, 0], [0, 10]].some(([dx, dz]) => put("spray_can", T.x + dx, T.z + dz, 0.1));
    loot.filter((l) => l.zone === "alley").filter((_, i) => i % 3 === 1).forEach((l) => put("spray_can", l.x - 0.9, l.z - 0.9, 0.1));
    // fish at the Market Row stalls and the marina
    if (!R2) for (const [x, z] of [[50, -11.5], [60, -11.5], [97, 75], [97, 88]]) put("smelly_fish", x, z, 0.15);
  }

  return {
    halfSize: HALF, boxes, spawns, lootSpawns: loot, forts, landmarks, roads, roadRings, ...(R2 ? { roadSegs, variant: "new", southZ, lots } : {}), crosswalks, navLines, navLinesZ, props,
    shops, truckRoutes, happyZones, airdropSpots, decor, station, roadGraph, water, navChains, units,
    roadNet, blocks, scenery, posts, deepWater, bushes, pondShape, junkSpots, lobby, chinatown, bank, statue, resto, club, pumpBoxes, pawnShop, littleItaly, stationUpper, hotShops: R2 ? hotShops : undefined, fever, pub,
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
    case "pawn": {
      // C5c.3: PAWN-O-RAMA: the pawn case by the window (its prop is placed by buildUnit), a wall of guitars, a stack of
      // telly sets all showing static, a suit of armour, a stuffed bear, a trophy shelf, bars over Sal's counter
      F(-5.2, 2.0, 3.4, 1.0, 1.05, "case", "#c9a227");
      B(-6.95, 6.2, 0.3, 4.6, 2.6, "shelf", { ...inside, deco: "guitars", color: "#5a3a24" });
      B(-4.3, 7.8, 1.6, 1.0, 2.0, "boxes", { ...inside, deco: "tvstack", hide: true });
      B(-2.6, 8.7, 0.7, 0.7, 2.0, "plinth", { ...inside, deco: "armour", hide: true });
      B(5.6, 6.6, 0.9, 0.9, 1.5, "plinth", { ...inside, deco: "bear", hide: true });
      B(6.75, 7.3, 0.3, 3.2, 1.9, "shelf", { ...inside, deco: "trophies", color: "#5a3a24" });
      B(4.6, 4.45, 4, 0.06, 1.25, "glass", { ...inside, deco: "cagebars" }, 1.05);
      loot.push([-4.3, 7.8, 2.0], [6.75, 6.3, 1.9], [6.75, 8.2, 1.9], [-1.0, 6.8, 0.18], [3.2, 7.4, 0.18]);
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
