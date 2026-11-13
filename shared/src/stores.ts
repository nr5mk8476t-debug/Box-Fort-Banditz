// R13 (Blake: "six new shops: two in each economic district... proper, distinctive stores"): the stores' plots,
// frontages, keepers and trade, shared by the host's rules and the renderer (the same boxes both sides).
//
// Each store replaces one decorative building (a sign on a solid box) that the street generator puts on its plot; the
// generator runs unchanged and the store's builder takes that box out afterwards, so nothing else in the city moves.
// Mirrored west/east pairs, one pair per district (the forts are spread along the south: neither side is favoured).
//
// Layout is written in each store's own frame: u along the frontage (0 at the left end, as you face the shop from the
// street), v in from the frontage (0 at the front wall's outer face, D at the back). `storeFrame` turns that into world
// boxes for whichever way the store faces.
import type { Box, Rect } from "./arena.js";

export type StoreId = "rustbucket" | "plugpray" | "needledrop" | "peakfomo" | "maisonpong" | "bonbon";
export type StoreTier = 0 | 1 | 2;

export interface StoreDef {
  id: StoreId;
  name: string;
  /** 0 low-end (The Yards), 1 medium (the middle), 2 high-end (Snob Row) */
  tier: StoreTier;
  /** the footprint (the decorative building it replaces stood here) */
  plot: Rect;
  /** outward normal of the frontage (the street side) */
  face: [number, number];
  /** the decorative buildings' signs this plot held (what the builder takes out; checked by the tests) */
  replaces: string[];
}

export const STORES: StoreDef[] = [
  { id: "rustbucket", name: "RUST BUCKET SALVAGE", tier: 0, plot: { minX: -59.83, maxX: -50.39, minZ: -70.5, maxZ: -60.5 }, face: [0, 1], replaces: ["NAILS & TAILS", "TYRES (MOSTLY ROUND)"] },
  { id: "plugpray", name: "PLUG & PRAY REPAIRS", tier: 0, plot: { minX: 50.39, maxX: 59.83, minZ: -70.5, maxZ: -60.5 }, face: [0, 1], replaces: ["USED MATTRESS WORLD", "BUDGET DENTIST"] },
  { id: "needledrop", name: "NEEDLE DROP RECORDS", tier: 1, plot: { minX: -83.83, maxX: -72.83, minZ: 33.45, maxZ: 45.19 }, face: [1, 0], replaces: ["VINTAGE RECORDS"] },
  { id: "peakfomo", name: "PEAK FOMO OUTFITTERS", tier: 1, plot: { minX: 72.83, maxX: 83.83, minZ: 33.45, maxZ: 45.19 }, face: [-1, 0], replaces: ["SPECS APPEAL"] },
  { id: "maisonpong", name: "MAISON PONG", tier: 2, plot: { minX: -42.39, maxX: -32.24, minZ: 53.5, maxZ: 65.5 }, face: [0, 1], replaces: ["CRUNCHO+ TOWER"] },
  { id: "bonbon", name: "BONBON VIVANT", tier: 2, plot: { minX: 32.24, maxX: 42.39, minZ: 53.5, maxZ: 65.5 }, face: [0, 1], replaces: ["CAVIAR EXPRESS"] },
];

/** the stores' floor level (the pavement under them is 0.15 m up) */
export const STORE_FLOOR = 0.18;
export const storeById = (id: string): StoreDef | undefined => STORES.find((s) => s.id === id);

/** A store's frame: frontage width W, depth D, and local -> world. */
export interface StoreFrame {
  W: number; D: number;
  /** world point of local (u, v) */
  at(u: number, v: number): { x: number; z: number };
  /** world rect of the local rect u0..u1 x v0..v1 */
  rect(u0: number, u1: number, v0: number, v1: number): Rect;
  /** the yaw (0 = facing +z) of something facing out of the frontage (toward the street) */
  yawOut: number;
  /** a world box from a local rect and a height (and its bottom) */
  box(u0: number, u1: number, v0: number, v1: number, h: number, kind: Box["kind"], y0?: number, extra?: Partial<Box>): Box;
}

export function storeFrame(s: StoreDef): StoreFrame {
  const [nx, nz] = s.face, p = s.plot;
  // looking at the shop from the street you face -n; your right is r = (fz, -fx) with f = -n
  const fx = -nx, fz = -nz, rx = fz, rz = -fx;
  const alongX = Math.abs(rx) > 0.5;
  const W = alongX ? p.maxX - p.minX : p.maxZ - p.minZ, D = alongX ? p.maxZ - p.minZ : p.maxX - p.minX;
  // the frontage's left end (as you face it): on the facade side, at the -r end
  const ox = nx > 0.5 ? p.maxX : nx < -0.5 ? p.minX : rx > 0 ? p.minX : p.maxX;
  const oz = nz > 0.5 ? p.maxZ : nz < -0.5 ? p.minZ : rz > 0 ? p.minZ : p.maxZ;
  const at = (u: number, v: number) => ({ x: ox + rx * u + fx * v, z: oz + rz * u + fz * v });
  const rect = (u0: number, u1: number, v0: number, v1: number): Rect => {
    const a = at(u0, v0), b = at(u1, v1);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  };
  const yawOut = Math.atan2(nx, nz);
  const box = (u0: number, u1: number, v0: number, v1: number, h: number, kind: Box["kind"], y0 = 0, extra: Partial<Box> = {}): Box => {
    const r = rect(u0, u1, v0, v1);
    return { x: (r.minX + r.maxX) / 2, y: y0 + h / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, h, d: r.maxZ - r.minZ, kind, ...extra };
  };
  return { W, D, at, rect, yawOut, box };
}

// ---------------------------------------------------------------------------------------------------------------------
// The shells (R13 blockout): the walls, the frontage (windows, the door, an open bay), the floor, the roof, the counter.
// Everything solid is a plain box the city draws as it is; the stores' dressing comes on top in the renderer.

export type Span = { u0: number; u1: number; t: "wall" | "window" | "door" | "open" };
export interface StoreShellSpec {
  /** wall height (the roof sits on it) */
  H: number;
  /** the frontage, left to right (as you face it), covering 0..W */
  front: Span[];
  /** a recessed entrance: the span u0..u1 of the frontage is set back by `depth`, the door in its back wall */
  recess?: { u0: number; u1: number; depth: number };
  /** the counter (local rect) and where the keeper stands behind it */
  counter: [number, number, number, number];
  keeper: [number, number];
  wall: string; floor: string; roof: string;
  /** how tall the windows' glass goes (default 2.9) */
  glassTop?: number;
}

export const STORE_SHELLS: Record<StoreId, StoreShellSpec> = {
  // the corner plot on Leftovers Avenue: the shop on the left, the covered loading bay on the corner (open to the street)
  rustbucket: { H: 4.6, wall: "#7a6a5a", floor: "#6e6658", roof: "#4a4640",
    front: [{ u0: 0, u1: 0.5, t: "wall" }, { u0: 0.5, u1: 3.3, t: "window" }, { u0: 3.3, u1: 4.9, t: "door" }, { u0: 4.9, u1: 5.6, t: "wall" }, { u0: 5.6, u1: 9.44, t: "open" }],
    counter: [0.8, 4.4, 6.2, 7.0], keeper: [2.6, 7.8] },
  // the mirror plot on Write-Off Avenue: the door by the corner, one long window of stacked tellies
  plugpray: { H: 4.2, wall: "#5a6a72", floor: "#8a8478", roof: "#3a3c40",
    front: [{ u0: 0, u1: 0.5, t: "wall" }, { u0: 0.5, u1: 1.9, t: "door" }, { u0: 1.9, u1: 2.2, t: "wall" }, { u0: 2.2, u1: 8.9, t: "window" }, { u0: 8.9, u1: 9.44, t: "wall" }],
    counter: [2.6, 6.8, 5.6, 6.4], keeper: [4.7, 7.2] },
  // north of the pub: a deep recessed entrance between two display windows
  needledrop: { H: 4.6, wall: "#2e3a5a", floor: "#7a5a3a", roof: "#262630",
    front: [{ u0: 0, u1: 0.4, t: "wall" }, { u0: 0.4, u1: 3.9, t: "window" }, { u0: 3.9, u1: 7.84, t: "door" }, { u0: 7.84, u1: 11.34, t: "window" }, { u0: 11.34, u1: 11.74, t: "wall" }],
    recess: { u0: 3.9, u1: 7.84, depth: 1.6 },
    counter: [3.4, 8.3, 8.4, 9.2], keeper: [5.9, 10.0] },
  // north of the club: a timber front, the door in the middle (the porch comes with the dressing)
  peakfomo: { H: 4.8, wall: "#6a5034", floor: "#8a7a5a", roof: "#2e3a2e",
    front: [{ u0: 0, u1: 0.5, t: "wall" }, { u0: 0.5, u1: 4.7, t: "window" }, { u0: 4.7, u1: 7.04, t: "door" }, { u0: 7.04, u1: 11.24, t: "window" }, { u0: 11.24, u1: 11.74, t: "wall" }],
    counter: [8.4, 11.2, 6.2, 7.0], keeper: [9.8, 7.8] },
  // Snob Row: pale stone, tall windows either side of a recessed door
  maisonpong: { H: 5.2, wall: "#e2dccf", floor: "#d8d0c4", roof: "#5a5650", glassTop: 4.2,
    front: [{ u0: 0, u1: 0.6, t: "wall" }, { u0: 0.6, u1: 3.4, t: "window" }, { u0: 3.4, u1: 6.75, t: "door" }, { u0: 6.75, u1: 9.55, t: "window" }, { u0: 9.55, u1: 10.15, t: "wall" }],
    recess: { u0: 3.4, u1: 6.75, depth: 1.2 },
    counter: [3.6, 6.55, 6.6, 7.4], keeper: [5.07, 8.3] },
  // Snob Row's mirror: the door to one side, a long display window (bowed, with the dressing)
  bonbon: { H: 4.4, wall: "#f2d6dc", floor: "#e8e0d4", roof: "#6a4a52", glassTop: 3.4,
    front: [{ u0: 0, u1: 0.5, t: "wall" }, { u0: 0.5, u1: 2.0, t: "door" }, { u0: 2.0, u1: 2.5, t: "wall" }, { u0: 2.5, u1: 9.65, t: "window" }, { u0: 9.65, u1: 10.15, t: "wall" }],
    counter: [3.2, 8.2, 7.2, 8.0], keeper: [5.7, 8.9] },
};

export interface StoreShellOut {
  boxes: Box[];
  /** the door: its leaf box is the LAST of `boxes` (the city re-finds it by `deco` at the end of the build) */
  door: { x: number; z: number; yaw: number; hw: number; hd: number };
  keeper: { x: number; z: number; yaw: number };
  counter: Rect;
  /** inside (the floor), for the "in the shop" checks */
  inside: Rect;
}

/** The blockout of one store: plain boxes for the shell, the counter, the door's leaf. */
export function storeShell(s: StoreDef): StoreShellOut {
  const f = storeFrame(s), sp = STORE_SHELLS[s.id], T = 0.3, out: Box[] = [];
  const { W, D } = f, H = sp.H, gTop = sp.glassTop ?? 2.9, DH = 2.6;
  const wall = (u0: number, u1: number, v0: number, v1: number, h: number, y0 = 0) => { if (u1 - u0 > 0.01 && v1 - v0 > 0.01 && h > 0.01) out.push(f.box(u0, u1, v0, v1, h, "wall", y0, { color: sp.wall })); };
  // the floor, the roof, the back and the sides
  out.push(f.box(T, W - T, T, D - T, STORE_FLOOR, "shopfloor", 0, { color: sp.floor })); // (its top just above the pavement it stands on)
  out.push(f.box(-0.15, W + 0.15, -0.15, D + 0.15, 0.3, "roof", H, { color: sp.roof }));
  wall(0, W, D - T, D, H); wall(0, T, T, D - T, H); wall(W - T, W, T, D - T, H);
  // the frontage
  const rc = sp.recess;
  let door: StoreShellOut["door"] | null = null;
  const putDoor = (u0: number, u1: number, v: number) => {
    wall(u0, u1, v, v + T, H - DH, DH); // (the lintel)
    const b = f.box(u0, u1, v + 0.1, v + 0.2, DH, "glass", 0, { hide: true, deco: "storedoor:" + s.id });
    const c = f.at((u0 + u1) / 2, v + 0.15), alongX = Math.abs(Math.sin(f.yawOut)) < 0.5;
    door = { x: c.x, z: c.z, yaw: f.yawOut, hw: alongX ? (u1 - u0) / 2 : 0.15, hd: alongX ? 0.15 : (u1 - u0) / 2 };
    return b;
  };
  let leaf: Box | null = null;
  for (const q of sp.front) {
    if (q.t === "wall") wall(q.u0, q.u1, 0, T, H);
    else if (q.t === "window") { wall(q.u0, q.u1, 0, T, 0.6); out.push(f.box(q.u0, q.u1, 0.1, 0.2, gTop - 0.6, "glass", 0.6)); wall(q.u0, q.u1, 0, T, H - gTop, gTop); }
    else if (q.t === "open") wall(q.u0, q.u1, 0, T, H - 3.4, 3.4); // (a bay: open below 3.4 m)
    else if (q.t === "door") {
      if (rc && rc.u0 <= q.u0 + 0.01 && rc.u1 >= q.u1 - 0.01) {
        // the recess: its reveals, its back wall with the door in the middle, the frontage above it
        const dw = Math.min(1.8, (rc.u1 - rc.u0) - 0.8), d0 = (rc.u0 + rc.u1) / 2 - dw / 2, d1 = d0 + dw;
        wall(rc.u0, rc.u0 + 0.2, 0, rc.depth, DH); wall(rc.u1 - 0.2, rc.u1, 0, rc.depth, DH);
        wall(rc.u0, d0, rc.depth, rc.depth + T, DH); wall(d1, rc.u1, rc.depth, rc.depth + T, DH);
        wall(rc.u0, rc.u1, 0, rc.depth + T, H - DH, DH); // (above: the frontage carries on over the recess)
        leaf = putDoor(d0, d1, rc.depth);
      } else leaf = putDoor(q.u0, q.u1, 0);
    }
  }
  if (!leaf || !door) throw new Error("store " + s.id + " has no door");
  const [c0, c1, cv0, cv1] = sp.counter;
  out.push(f.box(c0, c1, cv0, cv1, 1.0, "counter", 0, { color: "#5a4030" }));
  out.push(leaf); // (the door's leaf last: see StoreShellOut)
  const kp = f.at(sp.keeper[0], sp.keeper[1]);
  return { boxes: out, door, keeper: { x: kp.x, z: kp.z, yaw: f.yawOut }, counter: f.rect(c0, c1, cv0, cv1), inside: f.rect(T, W - T, T, D - T) };
}

// ---------------------------------------------------------------------------------------------------------------------
// R13: what each store does (Blake: "functional stores", using the systems the city already has)
//  - its ShopDef: a keeper behind the counter, a till you can hold up, real stock on the shelves (take it = shoplifting)
//  - the counter (E): sell the specialist what's in your hands, or (empty-handed) buy the store's one service
//  - a rummage spot (E, once a day) and/or a display case (punch it: it spills, the alarm goes, heat)
// Prices sit against the pawn shops (40% of an item's worth, 3x for their wanted list) and WEE MICKEY (75%, night only,
// heat): a specialist pays 60% by day, no heat; the salvage yard pays a few dollars for junk nobody else will take.

export type StoreService = "trailmix" | "spritz" | "sugarrush";
export interface StoreTrade {
  type: import("./arena.js").ShopType;
  /** theft heat, against the low-end's 1 */
  heat: number;
  /** the counter buys: these types at `mult` of their worth, or any junk at a flat price */
  buys?: { types?: string[]; mult?: number; junk?: [number, number] };
  sells?: { what: StoreService; name: string; price: number; blurb: string };
  dig?: [string, number][];
  caseLoot?: [string, number][];
}

export const STORE_TRADE: Record<StoreId, StoreTrade> = {
  rustbucket: { type: "salvage", heat: 1, buys: { junk: [2, 6] },
    dig: [["brick", 3], ["plastic_crate", 2], ["bin_lid", 2], ["traffic_cone", 3], ["crt_tv", 1], ["giant_toaster", 0.8], ["gold_sign", 0.6], ["golden_spork", 0.05]] },
  plugpray: { type: "repair", heat: 1, buys: { types: ["crt_tv", "giant_toaster", "arcade_machine", "laptop", "phone_handset", "bedazzled_phone", "fancy_earbuds", "disposable_camera", "dj_headphones"], mult: 0.6 } },
  needledrop: { type: "records", heat: 1.25, buys: { types: ["vinyl_record", "golden_record", "mixtape", "guitar", "dj_headphones", "golden_accordion", "mirror_ball"], mult: 0.6 },
    dig: [["vinyl_record", 6], ["mixtape", 5], ["golden_record", 0.35]], caseLoot: [["golden_record", 1], ["vinyl_record", 3]] },
  peakfomo: { type: "outdoor", heat: 1.25, sells: { what: "trailmix", name: "TRAIL MIX", price: 10, blurb: "stamina for 40 s" } },
  maisonpong: { type: "perfume", heat: 2, sells: { what: "spritz", name: "A SPRITZ", price: 40, blurb: "you smell innocent: a lot less heat" },
    caseLoot: [["fancy_fizz", 2], ["pearl_necklace", 1], ["designer_scarf", 1]] },
  bonbon: { type: "sweets", heat: 2, sells: { what: "sugarrush", name: "SUGAR RUSH TRUFFLE", price: 25, blurb: "speed for 20 s (then the crash)" },
    buys: { types: ["macaron_box", "golden_truffle", "fancy_cheese", "fancy_fizz", "cheese_wheel", "birthday_cake", "tiramisu", "mooncake"], mult: 0.6 },
    caseLoot: [["golden_truffle", 1], ["macaron_box", 3]] },
};
/** what a spritz takes off your heat */
export const SPRITZ_HEAT = 30;
/** (repeated E: one purchase per press, and not two within this many seconds) */
export const STORE_BUY_GAP = 1.0;

/** where the fixtures go, in the store's frame (u, v): the till on the counter, the rummage spot, the display case, shelves
 *  (u0, u1, v0, v1, height) and the real stock spots on them (u, v, which shelf) */
export interface StoreFixtures { till: [number, number]; dig?: [number, number]; case?: [number, number, number, number, number]; shelves: [number, number, number, number, number][]; stock: [number, number, number][];
  /** R13b: the centrepiece's solid parts (u0, u1, v0, v1, height): you bump into them (drawn by the store's dressing) */
  solids?: [number, number, number, number, number][] }
export const STORE_FIXTURES: Record<StoreId, StoreFixtures> = {
  rustbucket: { till: [1.5, 6.6], dig: [7.7, 5.6], shelves: [[5.9, 9.0, 8.9, 9.6, 1.0]], stock: [[6.7, 9.25, 0], [8.2, 9.25, 0]],
    // R13b: the car on blocks in the repair bay; the partition between the shop and the workshop (a doorway at its
    // front end, by the street); the rummage skip; the workbench along the bay's side wall
    solids: [[6.2, 8.9, 1.1, 3.3, 1.25], [5.5, 5.65, 5.0, 9.7, 2.4], [7.0, 8.4, 5.0, 6.2, 0.95], [8.6, 9.14, 4.2, 7.6, 0.95]] },
  plugpray: { till: [6.2, 6.0], shelves: [[0.35, 1.0, 3.2, 9.6, 1.2]], stock: [[0.68, 4.4, 0], [0.68, 6.4, 0], [0.68, 8.4, 0]],
    solids: [[7.6, 8.6, 7.7, 8.5, 1.9]] }, // (the gutted arcade cabinet)
  needledrop: { till: [7.7, 8.8], dig: [5.87, 5.4], case: [0.32, 1.0, 7.4, 10.4, 1.4], shelves: [[1.2, 3.4, 3.4, 6.4, 0.9], [8.34, 10.54, 3.4, 6.4, 0.9]], stock: [[2.3, 4.2, 0], [2.3, 5.7, 0], [9.44, 4.2, 1], [9.44, 5.7, 1]],
    // (the listening booth in the back right corner: its two walls; glass in its side, a doorway at the side's back end)
    solids: [[9.0, 9.12, 7.4, 9.5, 2.5], [9.0, 11.44, 7.4, 7.52, 2.5]] }, // (the doorway: the back 1.2 m of its side)
  peakfomo: { till: [10.6, 6.6], shelves: [[1.0, 4.4, 3.0, 6.0, 0.4], [0.32, 0.92, 6.6, 10.4, 1.5]], stock: [[2.7, 4.5, 0], [0.62, 7.6, 1], [0.62, 9.4, 1]] },
  maisonpong: { till: [6.0, 7.0], case: [3.2, 6.95, 11.0, 11.7, 1.8], shelves: [[1.4, 2.2, 4.4, 5.2, 1.1], [7.95, 8.75, 4.4, 5.2, 1.1]], stock: [[1.8, 4.8, 0], [8.35, 4.8, 1]],
    solids: [[4.27, 5.87, 3.1, 4.7, 0.6]] }, // (the perfume fountain's basin)
  bonbon: { till: [7.7, 7.6], case: [3.0, 5.3, 4.0, 4.8, 1.0], shelves: [[6.0, 8.6, 4.0, 4.8, 1.0]], stock: [[6.8, 4.4, 0], [7.9, 4.4, 0]],
    solids: [[8.4, 9.6, 9.9, 11.1, 2.4]] }, // (the chocolate tower)
};

/** R13: the keepers (each store's cashier, in their own clothes) and what they say at the counter */
export interface StoreVoice { keeper: string; sold: string; bought: string; wrong: string; nobuy: string; hands: string; broke: string; shut: string; black: string }
export const STORE_VOICE: Record<StoreId, StoreVoice> = {
  rustbucket: { keeper: "RUSTY PETE", sold: `"Scrap's scrap. Here."`, bought: "", wrong: `"That's not scrap, that's somebody's. Pawn shop's next door."`, nobuy: "", hands: `"Bring me junk. Bin lids, crates, trolleys. I pay cash."`, broke: "", shut: `"We're CLOSED. Somebody's been at my till."`, black: `"I don't want that near my crowbars."` },
  plugpray: { keeper: "VOLTS VALENTINA", sold: `"Ooh, I can fix that. Probably. Here's your money."`, bought: "", wrong: `"Does it plug in? No? Then I can't help you."`, nobuy: "", hands: `"Tellies, toasters, phones, laptops. Bring me anything with a plug."`, broke: "", shut: `"N-not now! The alarm's going!"`, black: `"That's... cursed. Take it away."` },
  needledrop: { keeper: "DEZ", sold: `"Hm. Acceptable taste. Here."`, bought: "", wrong: `"This is a record shop."`, nobuy: "", hands: `"Records, tapes, guitars, headphones. I'll know if it's good."`, broke: "", shut: `"Shop's shut. Somebody ruined the vibe."`, black: `"No."` },
  peakfomo: { keeper: "SUMMIT STEPH", sold: "", bought: `"FUEL UP! The mountains await! (I wouldn't know.)"`, wrong: "", nobuy: `"We sell adventure, we don't buy it! TRAIL MIX though?"`, hands: "", broke: `"Ten dollars for the summit, friend!"`, shut: `"Not right now, there's a SITUATION!"`, black: "" },
  maisonpong: { keeper: "MONSIEUR NEZ", sold: "", bought: `"Top notes of innocence, a base of plausible deniability."`, wrong: "", nobuy: `"We do not purchase, monsieur. We anoint."`, hands: "", broke: `"Forty. The innocence is not cheap."`, shut: `"The boutique is closed. The air is... ruined."`, black: "" },
  bonbon: { keeper: "MADAME GANACHE", sold: `"Acceptable. Your money, darling."`, bought: `"Mind the crash, sweetie."`, wrong: `"We are a confectioner. Not a skip."`, nobuy: "", hands: "", broke: `"Twenty-five, darling. Come back richer."`, shut: `"We are closed. There has been an incident."`, black: `"Absolutely not."` },
};

/** R13: where the browsing customers stand (u, v, and the way they face: du, dv), and how many each store has */
export const STORE_BROWSE: Record<StoreId, { n: number; spots: [number, number, number, number][] }> = {
  rustbucket: { n: 1, spots: [[7.0, 4.4, 0, 1], [6.0, 8.0, 0, 1], [2.5, 5.0, 0, 1], [5.3, 2.4, 1, 0]] },
  plugpray: { n: 1, spots: [[1.7, 5.5, -1, 0], [5.0, 3.6, 0, -1], [2.6, 7.9, 0, 1], [7.5, 4.6, 0, -1]] },
  needledrop: { n: 2, spots: [[4.0, 5.0, -1, 0], [7.7, 4.6, 1, 0], [8.4, 8.6, 1, 0], [5.9, 7.3, 0, 1], [2.0, 8.6, -1, 0], [10.2, 6.9, 1, 0]] },
  peakfomo: { n: 2, spots: [[2.7, 6.9, 0, -1], [1.7, 8.5, -1, 0], [6.0, 5.0, 0, 1], [8.2, 5.4, 0, 1]] },
  maisonpong: { n: 2, spots: [[1.8, 6.0, 0, -1], [8.35, 6.0, 0, -1], [5.07, 9.6, 0, 1], [3.0, 9.0, -1, 0]] },
  bonbon: { n: 2, spots: [[4.15, 5.6, 0, -1], [7.3, 5.6, 0, -1], [2.0, 6.5, -1, 0], [7.5, 10.4, 1, 0]] },
};

// ---------------------------------------------------------------------------------------------------------------------
// R13b (Blake: "design each shop as part of a complete building and streetscape"): what stands above each shop. The upper
// floors are façade shells (the city's own walls and windows: no rooms behind them); the roofs' shapes (sawtooth, gable,
// mansard), cornices and bands come with the dressing. Heights are set against the neighbours (docs/design-decisions.md R13b)
export interface StoreUpper { u0: number; u1: number; floors: number; fh: number; color: string; wall: NonNullable<Box["wallKind"]>; win: NonNullable<Box["winKind"]> }
export interface StoreBuilding { uppers: StoreUpper[]; roof: "flat" | "sawtooth" | "gable" | "mansard"; kind: string }
export const STORE_BUILDINGS: Record<StoreId, StoreBuilding> = {
  // an old workshop: a one-storey brick office over the shop half, the yard bay under a sawtooth roof (north lights)
  rustbucket: { kind: "workshop", roof: "sawtooth", uppers: [{ u0: 0, u1: 5.6, floors: 1, fh: 3.0, color: "#8a4a32", wall: "brick", win: "winBoarded" }] },
  // a narrow tenement: two floors of flats over the repair shop
  plugpray: { kind: "tenement", roof: "flat", uppers: [{ u0: 0, u1: 9.44, floors: 2, fh: 3.1, color: "#7a8a80", wall: "render", win: "winBlinds" }] },
  // an old brick commercial block: three floors (flats, and the studio on top) between the pub and the news tower
  needledrop: { kind: "brick block", roof: "flat", uppers: [{ u0: 0, u1: 11.74, floors: 3, fh: 3.2, color: "#7a3426", wall: "brick", win: "windows" }] },
  // a mountain lodge: a timber upper floor under a steep gable to the street, low on purpose beside the glass tower
  peakfomo: { kind: "lodge", roof: "gable", uppers: [{ u0: 0, u1: 11.74, floors: 1, fh: 3.0, color: "#6a4a30", wall: "clapboard", win: "winCurtain" }] },
  // a stone town house: three floors of tall windows and a mansard, stepping down from the 47 m tower to the hotel
  maisonpong: { kind: "town house", roof: "mansard", uppers: [{ u0: 0, u1: 10.15, floors: 3, fh: 3.4, color: "#e8e0d0", wall: "stone", win: "winArched" }] },
  // a pastel terrace house: three floors, a finished cornice
  bonbon: { kind: "terrace", roof: "flat", uppers: [{ u0: 0, u1: 10.15, floors: 3, fh: 3.2, color: "#f0c4d0", wall: "paint", win: "winCurtain" }] },
};
/** the upper floors' boxes (façade shells), on the shop's roof slab */
export function storeUpperBoxes(s: StoreDef): Box[] {
  const f = storeFrame(s), H = STORE_SHELLS[s.id].H, out: Box[] = [];
  for (const u of STORE_BUILDINGS[s.id].uppers) out.push(f.box(u.u0, u.u1, 0, f.D, u.floors * u.fh, "building", H + 0.3, { color: u.color, windows: true, face: s.face, wallKind: u.wall, winKind: u.win }));
  return out;
}
/** the height of a store's building (its upper floors' top) */
export function storeTop(s: StoreDef): number { const H = STORE_SHELLS[s.id].H; return H + 0.3 + Math.max(0, ...STORE_BUILDINGS[s.id].uppers.map((u) => u.floors * u.fh)); }
