// COMPACT QUEENS: a proposal (Blake, 2026-11-17): "a substantially smaller, denser version of Queens v2". Not wired into
// the game: checked by the same rules as v2 (check.ts usePlan(COMPACT)), drawn by tests/compact-report.ts.
//
// The size is set by ONE trip (Blake): each fort's banking mat to the public entrance of its NEAREST major landmark,
// empty-handed, sprint held under the real stamina rules, on a legal pedestrian route: about 25 s (22-28 s). The border
// falls where the neighbourhood ends.
//
// The shape (see docs/queens/compact/proposal.md):
//   - the home block as v2 (four equal 36 x 36 m yards that fit the largest planned fort), with 20 m market lanes;
//   - FOUR SHOPPING AVENUES in a loop round it (Stain Way west, Rooster Velt north, Dit Marsh east, Gnome south), a
//     landmark on the outside of each corner: every landmark run uses two avenues, so runs to different places share
//     the same strips and crossings;
//   - four SPOKES from the ring to the loop, each offset 12 m from the market's lane in the same turning sense (a
//     pinwheel: no straight sightline across the market, every fort the same shape of trip);
//   - inside the loop, four identical L-shaped blocks (rotated): a row of starter shops facing the ring, mid shops
//     facing the avenue, a BACK LANE between them (yards, garages, fences: the way home unseen), passages through;
//   - outside the loop, one band of blocks to an edge road: the high-end shops, the landmarks, the pub and the club.
import { R, FORT_MAX, type XZ, type QRect, type Side, type QRoad, type QPath, type QBlock, type QUnit, type QFort, type QPlan, type Material } from "./plan.js";

// ---- the numbers --------------------------------------------------------------------------------------------------
/** yards 36 m (v2), market lanes 20 m (v2 28 m: see the proposal), block pavement 4 m, ring road 8 m + 4 m pavements */
export const C_HOME = { yard: 36, lane: 20, half: 46, pave: 4, ringW: 8, ringPave: 4 } as const;
export const C_RING = C_HOME.half + C_HOME.pave + C_HOME.ringW / 2; // 54
/** the avenue loop's centre line, and the edge road's: set so the nearest landmark is ~25 s from every mat */
export const LOOP_AT = 118, EDGE_AT = 196, SPOKE_OFF = 12;
const AV = { w: 8, sw: 4 }, SIDE = { w: 7, sw: 3 }, EDGE = { w: 7, sw: 3 };
const RO = C_RING + C_HOME.ringW / 2 + C_HOME.ringPave; // 62: the ring's outer pavement edge
const AI = LOOP_AT - AV.w / 2 - AV.sw, AO = LOOP_AT + AV.w / 2 + AV.sw; // 120 / 136: the avenue corridor's edges
const EI = EDGE_AT - EDGE.w / 2 - EDGE.sw; // 199.5
const SH = SIDE.w / 2 + SIDE.sw; // 6.5: a spoke's corridor half
const S0 = SPOKE_OFF - SH, S1 = SPOKE_OFF + SH; // 5.5 / 18.5

// ---- the pinwheel: the north-west quadrant is drawn once and turned three times (clockwise), so every fort's
// quadrant is the same shape -----------------------------------------------------------------------------------------
const rotP = (k: number, [x, z]: XZ): XZ => [[x, z], [z, -x], [-x, -z], [-z, x]][k & 3] as XZ;
const rotR = (k: number, r: QRect): QRect => { const a = rotP(k, [r.minX, r.minZ]), b = rotP(k, [r.maxX, r.maxZ]); return R(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])); };
const SIDES: Side[] = ["N", "E", "S", "W"];
const rotS = (k: number, s: Side): Side => SIDES[(SIDES.indexOf(s) + k) & 3];
const U = (x0: number, z0: number, w: number, d: number) => R(x0, x0 + w, z0, z0 + d);
const QUAD = ["NW", "NE", "SE", "SW"] as const;

// ---- the home block ------------------------------------------------------------------------------------------------
const Y = C_HOME.half, L = C_HOME.lane / 2; // 46, 10
export const C_FORTS: QFort[] = [
  { id: "F1", slot: 0, corner: "NW", yard: R(-Y, -L, L, Y), mat: [-20, 28], front: [-L, 40], rear: [-Y, 20], colour: "#e74c3c" },
  { id: "F2", slot: 1, corner: "NE", yard: R(L, Y, L, Y), mat: [28, 20], front: [40, L], rear: [20, Y], colour: "#3498db" },
  { id: "F3", slot: 2, corner: "SE", yard: R(L, Y, -Y, -L), mat: [20, -28], front: [L, -40], rear: [Y, -20], colour: "#2ecc71" },
  { id: "F4", slot: 3, corner: "SW", yard: R(-Y, -L, -Y, -L), mat: [-28, -20], front: [-40, -L], rear: [-20, -Y], colour: "#f1c40f" },
];
/** the market square is 20 x 20 m where the lanes cross: a stall on each of its corners (each seen straight down two
 *  lanes), the board in the middle (seen from all four front gates) */
export const C_STALLS: { id: string; label: string; rect: QRect }[] = [
  { id: "sell", label: "SELL", rect: R(-9.5, -4.5, 4.5, 9.5) }, { id: "buy", label: "BUY", rect: R(4.5, 9.5, 4.5, 9.5) },
  { id: "upgrade", label: "UPGRADE", rect: R(4.5, 9.5, -9.5, -4.5) }, { id: "craft", label: "CRAFT", rect: R(-9.5, -4.5, -9.5, -4.5) },
  { id: "board", label: "BOARD", rect: R(-1.5, 1.5, -1, 1) },
];

// ---- roads ----------------------------------------------------------------------------------------------------------
const CH = 8; // the ring's chamfered corners
const ring: XZ[] = [[-C_RING + CH, -C_RING], [C_RING - CH, -C_RING], [C_RING, -C_RING + CH], [C_RING, C_RING - CH], [C_RING - CH, C_RING], [-C_RING + CH, C_RING], [-C_RING, C_RING - CH], [-C_RING, -C_RING + CH], [-C_RING + CH, -C_RING]];
const A = LOOP_AT, E = EDGE_AT;
export const C_ROADS: QRoad[] = [
  { id: "ring", name: "FORT BLOCK ROAD", kind: "ring", w: C_HOME.ringW, sw: C_HOME.ringPave, pts: ring },
  // the loop: four avenues, each running on to the edge roads (the landmarks sit on the outside of the corners)
  { id: "rooster", name: "ROOSTER VELT AVE", kind: "main", ...AV, pts: [[-E, A], [E, A]] },
  { id: "gnome", name: "GNOME AVE", kind: "main", ...AV, pts: [[-E, -A], [E, -A]] },
  { id: "stainway", name: "STAIN WAY", kind: "main", ...AV, pts: [[-A, -E], [-A, E]] },
  { id: "ditmarsh", name: "DIT MARSH BLVD", kind: "main", ...AV, pts: [[A, -E], [A, E]] },
  // the spokes, offset 12 m from the market's lanes in the same turning sense; the north one stops at Rooster Velt
  // (the removed north spur), the other three run on to the edge
  { id: "mkt_n", name: "MARKET ST", kind: "side", ...SIDE, pts: [[SPOKE_OFF, C_RING], [SPOKE_OFF, A]] },
  { id: "queasy_e", name: "QUEASY BLVD (EAST)", kind: "side", ...SIDE, pts: [[C_RING, -SPOKE_OFF], [E, -SPOKE_OFF]] },
  { id: "mkt_s", name: "MARKET ST (SOUTH)", kind: "side", ...SIDE, pts: [[-SPOKE_OFF, -C_RING], [-SPOKE_OFF, -E]] },
  { id: "queasy_w", name: "QUEASY BLVD", kind: "side", ...SIDE, pts: [[-C_RING, SPOKE_OFF], [-E, SPOKE_OFF]] },
  // the edge roads (buildings on their inner side; beyond: the shore, the rail yard, the expressway wall)
  { id: "border_n", name: "NORTH SHORE RD", kind: "border", ...EDGE, pts: [[-E, E], [E, E]] },
  { id: "border_s", name: "SOUTH SHORE RD", kind: "border", ...EDGE, pts: [[-E, -E], [E, -E]] },
  { id: "border_w", name: "WEST END RD", kind: "border", ...EDGE, pts: [[-E, -E], [-E, E]] },
  { id: "border_e", name: "EAST END RD", kind: "border", ...EDGE, pts: [[E, -E], [E, E]] },
];
// zebra crossings on the ring: one at each market exit (beside its spoke), one outside each fort's rear gate; and on the
// avenues where the shopping strips are crossed most (drawn; the ring's are the checked ones)
const exitN: XZ = [4, C_RING], rearN: XZ = [-C_RING, 20];
export const C_CROSSINGS: { id: string; at: XZ; across: "x" | "z"; w: number }[] = [
  ...QUAD.map((q, k) => ({ id: `x_mkt_${"nesw"[k]}`, at: rotP(k, exitN), across: (k % 2 ? "x" : "z") as "x" | "z", w: 6 })),
  ...QUAD.map((q, k) => ({ id: `x_f${k + 1}`, at: rotP(k, rearN), across: (k % 2 ? "z" : "x") as "x" | "z", w: 5 })),
];
/** the two vehicle roads Blake removed from the reference, at this scale: the top-centre spur north of the first
 *  east-west street, and the bent south-east connector from the fort block toward the hotel */
export const C_REMOVED: { id: string; why: string; rect: QRect }[] = [
  { id: "spur_n", why: "the short top-centre spur from the north edge to the first east-west street (Market St stops at Rooster Velt)", rect: R(0, 30, AO, EI) },
  { id: "connector_se", why: "the bent south-east connector outside the fort block toward the hotel", rect: R(RO, AI, -AI, -RO) },
];

// ---- paths: the market, and the inner blocks' back lanes and passages (the NW quadrant, turned 4 times) --------------
const qPaths = (k: number): QPath[] => {
  const q = QUAD[k], t = (pts: XZ[]) => pts.map((p) => rotP(k, p));
  return [
    // the BACK LANE: an L of 5 m service lane between the starter row and the avenue row (yards, garages, fences,
    // bins), from the spoke up to the avenue and across to the next spoke. Giant-wide. Each leg has a KINK (8 m out and
    // back round the yards), so the hidden way costs ~16 m more than the avenue: about 2 s empty, 4 s heavy, 6 s dragging a giant. The avenues
    // are the quick way, the lanes the careful way (Blake: "occasionally slip home unseen").
    { id: `lane_${q}_a`, kind: "alley", w: 5, pts: t([[-84, SPOKE_OFF], [-84, 44], [-92, 44], [-92, 76], [-84, 76], [-84, A]]), note: "back lane (giant-wide, with a kink round the yards)" },
    { id: `lane_${q}_b`, kind: "alley", w: 5, pts: t([[-84, 84], [-48, 84], [-48, 92], [-24, 92], [-24, 84], [SPOKE_OFF, 84]]), note: "back lane (giant-wide, with a kink round the yards)" },
  ];
};
export const C_PATHS: QPath[] = [
  { id: "mkt_ns", kind: "market", w: C_HOME.lane, pts: [[0, -C_RING], [0, C_RING]] },
  { id: "mkt_ew", kind: "market", w: C_HOME.lane, pts: [[-C_RING, 0], [C_RING, 0]] },
  ...QUAD.flatMap((_, k) => qPaths(k)),
  // where the north spur was: a footpath past the precinct to the shore
  { id: "walk_n", kind: "walk", w: 5, pts: [[-24, A], [-24, E]], note: "the old spur, now a footpath beside the precinct" },
  // the pub's back lane: WEE MICKEY's yard, the snug's side door; it comes out on Gnome Ave opposite the museum's goods
  // gate (the "duck behind the pub" route home from the museum)
  // It bends round WEE MICKEY's yard: the hidden way home costs ~16 m (about 6 s dragging a giant) over Stain Way.
  { id: "al_pub", kind: "service", w: 5, pts: [[-168, SPOKE_OFF], [-168, -30], [-176, -30], [-176, -76], [-168, -76], [-168, -A]], note: "WOOD HAVOC LANE: behind THE SOGGY SHAMROCK, opposite the museum's goods gate" },
  // the club lane: NEON FEVER's fire exit and DON BINNIE's back stairs, under the El
  { id: "al_club", kind: "service", w: 5, pts: [[160, A], [160, -SPOKE_OFF]], note: "the club lane: NEON FEVER's fire exit, DON BINNIE's stairs" },
];

// ---- blocks ---------------------------------------------------------------------------------------------------------
const inner = (k: number): QBlock => ({
  id: `B_${QUAD[k]}`, style: "low", type: "row", label: `the ${QUAD[k]} inner block`,
  rects: [{ r: rotR(k, R(-AI, -RO, S1, AI)), sides: (["N", "S", "W", "E"] as Side[]).map((s) => rotS(k, s)) },
    { r: rotR(k, R(-RO, S0, RO, AI)), sides: (["N", "S", "E"] as Side[]).map((s) => rotS(k, s)) }],
});
export const C_BLOCKS: QBlock[] = [
  ...QUAD.map((_, k) => inner(k)),
  // the outer band: the high-end strips, the pub's and the club's streets, the precinct, the four landmark corners
  { id: "B_w1", style: "high", type: "row", alley: "z", label: "Stain Way, uptown end", rects: [{ r: R(-EI, -AO, S1, AI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_pub", style: "mid", type: "destination", label: "the pub's block", rects: [{ r: R(-EI, -AO, -AI, S0), sides: ["N", "S", "W", "E"] }] },
  { id: "B_n1", style: "high", type: "row", alley: "x", label: "Rooster Velt, jewellery row", rects: [{ r: R(-AI, -26.5, AO, EI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_police", style: "mid", type: "civic", label: "the precinct", rects: [{ r: R(-21.5, 30, AO, EI), sides: ["S", "N", "E"] }] },
  { id: "B_n2", style: "high", type: "row", alley: "x", label: "Rooster Velt, under the El", rects: [{ r: R(30, AI, AO, EI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_club", style: "mid", type: "destination", label: "the nightlife strip", rects: [{ r: R(AO, EI, -S0, AI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_e2", style: "high", type: "row", alley: "z", label: "Dit Marsh, hotel end", rects: [{ r: R(AO, EI, -AI, -S1), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s2", style: "high", type: "row", alley: "x", label: "Gnome Ave, deli row", rects: [{ r: R(-S0, AI, -EI, -AO), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s1", style: "mid", type: "row", alley: "x", label: "Gnome Ave, gallery row", rects: [{ r: R(-AI, -S1, -EI, -AO), sides: ["N", "S", "W", "E"] }] },
  { id: "B_bank", style: "special", type: "precinct", rects: [{ r: R(-EI, -AO, AO, EI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_casino", style: "special", type: "precinct", rects: [{ r: R(AO, EI, AO, EI), sides: ["N", "S", "W", "E"] }] },
  { id: "B_hotel", style: "special", type: "precinct", rects: [{ r: R(AO, EI, -EI, -AO), sides: ["N", "S", "W", "E"] }] },
  { id: "B_museum", style: "special", type: "precinct", rects: [{ r: R(-EI, -AO, -EI, -AO), sides: ["N", "S", "W", "E"] }] },
];

// ---- the units ------------------------------------------------------------------------------------------------------
type Info = Pick<QUnit, "id" | "name" | "tier" | "phase" | "keepsId" | "theme" | "signature" | "materials" | "flag" | "grounds"> & { floors?: number };
/** the four template shops of a quadrant (NW coordinates): its fort's own starter shop on the ring, the spoke shop,
 *  and two on the avenues (one each side of the corner) */
const SLOTS = {
  pin: { parts: [U(-76, 22, 14, 16)], door: [-61.5, 30] as XZ, back: [-76.5, 30] as XZ, floors: 3 },
  spoke: { parts: [U(-AI, S1, 16, 14)], door: [-AI + 8, S1 - 0.5] as XZ, back: [-AI + 8, S1 + 14.5] as XZ, floors: 3 },
  aveA: { parts: [U(-AI, 52, 14, 16)], door: [-AI + 0.5, 60] as XZ, back: [-AI + 14.5, 60] as XZ, floors: 4 },
  aveB: { parts: [U(-60, AI - 14, 16, 14)], door: [-52, AI + 0.5] as XZ, back: [-52, AI - 14.5] as XZ, floors: 4 },
};
const slot = (k: number, s: keyof typeof SLOTS, block: string, info: Info): QUnit => {
  const t = SLOTS[s];
  return { kind: "shop", block, floors: info.floors ?? t.floors, parts: t.parts.map((r) => rotR(k, r)), door: rotP(k, t.door), back: rotP(k, t.back), ...info } as QUnit;
};
const M = (...m: Material[]) => m;
export const C_UNITS: QUnit[] = [
  // ======== the NW quadrant (F1's side): Stain Way north and Rooster Velt west ========
  slot(0, "pin", "B_NW", { id: "screwloose", name: "SCREW LOOSE HARDWARE", tier: "low", phase: "first", keepsId: "lastscrew", theme: "timber, tools, screws, tape", signature: "the forty-foot ladder sticking out over its yard and the back lane", materials: M("timber", "metal", "fasteners", "chemicals") }),
  slot(0, "spoke", "B_NW", { id: "wheelie", name: "WHEELIE DODGY CYCLES", tier: "low", phase: "first", theme: "bicycles, chains, wheels", signature: "a tandem with one seat, chained to the lamp post", materials: M("metal", "rubber", "fasteners") }),
  slot(0, "aveA", "B_NW", { id: "secondchance", name: "SECOND CHANCE HOMEWARES", tier: "mid", phase: "first", keepsId: "secondchance", theme: "furniture, lamps, appliances", signature: "the sofa shaped like a mouth, out on the pavement", materials: M("fabric", "timber", "electronics") }),
  slot(0, "aveB", "B_NW", { id: "needledrop", name: "NEEDLE DROP RECORDS", tier: "mid", phase: "first", keepsId: "needledrop", theme: "records, audio gear, collectibles", signature: "the jukebox that only takes buttons", materials: M("electronics", "luxury") }),
  // ======== the NE quadrant (F2's side): Rooster Velt east and Dit Marsh north ========
  slot(1, "pin", "B_NE", { id: "crumbs", name: "CRUMBS & CONSEQUENCES", tier: "low", phase: "first", keepsId: "crumbs", theme: "mini-mart food, packaging, batteries", signature: "the pyramid of off-brand cola in the window", materials: M("food", "electronics", "fabric") }),
  slot(1, "spoke", "B_NE", { id: "finalprint", name: "THE FINAL PRINT", tier: "low", phase: "first", theme: "paper, ink, glue, stationery", signature: "a photocopier that only copies your bum", materials: M("chemicals", "timber"), flag: "brought forward (reserved in v2): stupid junk on Market St, the precinct at the end of the street" }),
  slot(1, "aveA", "B_NE", { id: "batterdays", name: "BATTER DAYS BAKERY", tier: "mid", phase: "first", theme: "food, cookware, kitchen appliances", signature: "the cops' doughnut supply: a stack of boxes by the till", materials: M("food", "metal", "electronics"), flag: "brought forward (reserved in v2): across Rooster Velt from the precinct's end of the street" }),
  // (the one shop off its quadrant's slot: the El crosses Dit Marsh where the slot is, so it moves 26 m south)
  { id: "spinsin", kind: "shop", tier: "mid", phase: "first", block: "B_NE", name: "SPIN & SIN LAUNDRETTE", keepsId: "spincycle", parts: [U(AI - 14, 18, 14, 16)], door: [AI + 0.5, 26], back: [AI - 14.5, 26], floors: 4,
    theme: "machines, lost property, clothing", signature: "the lost-property bin (nobody knows what's in it); open all night, the El's columns outside", materials: M("fabric", "metal", "electronics") },
  // ======== the SE quadrant (F3's side): Dit Marsh south and Gnome Ave east ========
  slot(2, "pin", "B_SE", { id: "rustbucket", name: "RUST BUCKET SALVAGE", tier: "low", phase: "first", keepsId: "rustbucket", theme: "scrap metal, timber, parts", signature: "the car door that still has a parking ticket, hung on the fence", materials: M("metal", "timber", "rubber", "fasteners") }),
  slot(2, "spoke", "B_SE", { id: "washprob", name: "WASH YOUR PROBLEM?", tier: "low", phase: "reserved", theme: "car wash, hoses, cleaning supplies", materials: M("chemicals", "rubber") }),
  slot(2, "aveA", "B_SE", { id: "peakfomo", name: "PEAK FOMO OUTDOORS", tier: "mid", phase: "first", keepsId: "peakfomo", theme: "camping gear, straps, tents", signature: "the tent pitched on the pavement (bigger inside: it isn't)", materials: M("fabric", "rubber", "metal") }),
  slot(2, "aveB", "B_SE", { id: "partyfoul", name: "PARTY FOUL SUPPLIES", tier: "mid", phase: "reserved", theme: "costumes, decorations, novelty props", materials: M("fabric", "chemicals") }),
  // ======== the SW quadrant (F4's side): Gnome Ave west and Stain Way south ========
  slot(3, "pin", "B_SW", { id: "potluck", name: "POT LUCK GARDEN CENTRE", tier: "low", phase: "first", theme: "plants, gnomes, tools, garden supplies", signature: "a crowd of suspiciously identical gnomes on the pavement", materials: M("timber", "chemicals", "rubber") }),
  slot(3, "spoke", "B_SW", { id: "sewwhat", name: "SEW WHAT?", tier: "low", phase: "reserved", theme: "alterations, fabric rolls, sewing machines", materials: M("fabric", "metal") }),
  slot(3, "aveA", "B_SW", { id: "pastprime", name: "PAST ITS PRIME ANTIQUES", tier: "mid", phase: "first", theme: "clocks, furnishings, collectibles", signature: "the grandfather clock that's actually a grandmother, in the window facing the museum", materials: M("timber", "luxury", "metal") }),
  slot(3, "aveB", "B_SW", { id: "plugpray", name: "PLUG & PRAY REPAIRS", tier: "low", phase: "first", keepsId: "plugpray", floors: 3, theme: "broken appliances, wire, electronics", signature: "the microwave that only plays polka, in the window opposite the pub", materials: M("electronics", "metal", "fasteners") }),

  // ======== Stain Way, outside the loop: the west shopping street (worn) ========
  { id: "maisonpong", kind: "shop", tier: "high", phase: "first", block: "B_w1", name: "MAISON PONG", keepsId: "maisonpong", parts: [U(-AO - 16, 86, 16, 16)], door: [-AO + 0.5, 94], back: [-AO - 16.5, 94], floors: 5,
    theme: "perfume and luxury cosmetics", signature: "EAU DE BIN, the flagship scent; a giant atomiser over the door", materials: M("luxury", "chemicals") },
  { id: "solesurv", kind: "shop", tier: "low", phase: "reserved", block: "B_w1", name: "SOLE SURVIVORS", parts: [U(-AO - 14, 38, 14, 16)], door: [-AO + 0.5, 45.5], floors: 3, theme: "discount shoes, rubber, fabric", materials: M("rubber", "fabric") },
  { id: "fishy", kind: "shop", tier: "low", phase: "first", block: "B_pub", name: "FISHY BUSINESS", parts: [U(-AO - 14, -36, 14, 16)], door: [-AO + 0.5, -28.5], back: [-AO - 14.5, -28.5], floors: 3,
    theme: "fishmonger, food, packaging, odd trophies", signature: "a fibreglass marlin over the door and a tank of very suspicious lobsters", materials: M("food", "chemicals"), flag: "brought forward (reserved in v2): the museum run's way home passes it, next door to the pub" },
  { id: "dyetrying", kind: "shop", tier: "low", phase: "reserved", block: "B_pub", name: "DYE TRYING", parts: [U(-AO - 14, -92, 14, 16)], door: [-AO + 0.5, -84.5], floors: 3, theme: "hair salon, wigs, dryers, cosmetics", materials: M("chemicals", "electronics") },
  // ======== Rooster Velt, outside the loop: uptown (refined) ========
  { id: "caratrun", kind: "shop", tier: "high", phase: "first", block: "B_n1", name: "CARAT & RUN", keepsId: "caratrun", parts: [U(-98, AO, 16, 16)], door: [-90, AO - 0.5], back: [-90, AO + 16.5], floors: 6,
    theme: "jewellery and extravagant display pieces", signature: "the DIAMOND PIGEON in the window; a doorman who isn't a doorman", materials: M("luxury", "metal") },
  { id: "tickedoff", kind: "shop", tier: "high", phase: "first", block: "B_n2", name: "TICKED OFF WATCHES", keepsId: "tickedoff", parts: [U(32, AO, 16, 16)], door: [40, AO - 0.5], back: [40, AO + 16.5], floors: 6,
    theme: "watches and precision parts", signature: "the street clock on a bracket that runs backwards; the cuckoo that sounds the alarm", materials: M("luxury", "metal", "fasteners", "electronics") },
  // ======== Dit Marsh, outside the loop: the nightlife strip under the El ========
  { id: "strings", kind: "shop", tier: "mid", phase: "first", block: "B_club", name: "LORD OF THE STRINGS", parts: [U(AO, 66, 15, 16)], door: [AO - 0.5, 74], back: [AO + 15.5, 74], floors: 4,
    theme: "instruments, amplifiers, an oversized tuba", signature: "the tuba in the window, bigger than the door it has to leave by", materials: M("timber", "electronics", "metal"), flag: "brought forward (reserved in v2): next door to NEON FEVER, under the El" },
  { id: "guccio", kind: "shop", tier: "high", phase: "first", block: "B_e2", name: "GUCCIO GARBAGE", parts: [U(AO, -88, 16, 16)], door: [AO - 0.5, -80], back: [AO + 16.5, -80], floors: 6,
    theme: "designer fashion and accessories", signature: "the handbag made of a real bin bag ($900) on a plinth in the window", materials: M("luxury", "fabric", "rubber") },
  // ======== Gnome Ave, outside the loop: the gallery and deli rows (established) ========
  { id: "uppercrust", kind: "shop", tier: "high", phase: "reserved", block: "B_s2", name: "THE UPPER CRUST", parts: [U(80, -AO - 16, 16, 16)], door: [88, -AO + 0.5], back: [88, -AO - 16.5], floors: 6,
    theme: "luxury deli, cheese vault, giftware", signature: "the wheel of cheese with its own security guard", materials: M("food", "luxury") },
  { id: "framefort", kind: "shop", tier: "high", phase: "first", block: "B_s1", name: "FRAME & FORTUNE", parts: [U(-96, -AO - 16, 16, 16)], door: [-88, -AO + 0.5], back: [-88, -AO - 16.5], floors: 6,
    theme: "art, sculptures, prestige objects", signature: "a gold frame round nothing (\$4,000: \"it's conceptual\"); the museum's gift shop it isn't", materials: M("luxury", "timber"), flag: "brought forward (reserved in v2): the museum corner's high-end shop" },

  // ======== the landmarks: one outside each corner of the loop, each on its own approach ========
  { id: "bank", kind: "landmark", phase: "first", block: "B_bank", name: "FIRST NATIONAL BANK OF BOXES", floors: 5,
    parts: [R(-164, -AO, AO, 156), R(-164, -142, 156, 184)], door: [-AO + 0.5, A + 14], back: [-AO + 0.5, A + 52],
    theme: "a corner banking hall facing down Stain Way; the counting room and the vault in the back wing; the armoured-van dock 38 m on up Stain Way (giants and money bags leave that way)",
    signature: "the vault door on a novelty key ring", materials: M("luxury", "metal"), grounds: [{ name: "the armoured-van dock (gated, giant-wide)", rect: R(-142, -AO, 158, 182) }] },
  { id: "casino", kind: "landmark", phase: "first", block: "B_casino", name: "THE LUCKY LOSER CASINO", floors: 4,
    parts: [R(AO, 184, 142, 184)], door: [A + 14, AO - 0.5], back: [A + 52, AO - 0.5],
    theme: "a lit marquee over a forecourt on Rooster Velt, facing NEON FEVER's door across the junction; the floor (no real-money games); the cash-office yard 38 m on along Rooster Velt",
    signature: "the slot machine that pays out in coupons", materials: M("luxury", "electronics", "metal"), grounds: [{ name: "the marquee forecourt", rect: R(AO, 156, AO, 142) }, { name: "the cash-office yard (gated, giant-wide)", rect: R(158, 182, AO, 142) }] },
  { id: "hotel", kind: "landmark", phase: "first", block: "B_hotel", name: "THE GRAND OVERLOOK-ISH HOTEL", floors: 10,
    parts: [R(140, 182, -158, -AO), R(140, 168, -184, -158)], door: [AO - 0.5, -A - 14], back: [AO - 0.5, -A - 52],
    theme: "a canopy and a drop-off lay-by on Dit Marsh; the lobby, service corridors, a few guest floors, the penthouse; the loading bay 38 m on down Dit Marsh",
    signature: "the luggage trolley piled with someone's whole life", materials: M("luxury", "fabric", "electronics"), grounds: [{ name: "the canopy drop-off", rect: R(AO, 140, -150, -AO) }, { name: "the loading bay (giant-wide)", rect: R(AO, 140, -182, -158) }] },
  { id: "museum", kind: "landmark", phase: "first", block: "B_museum", name: "THE MUSEUM OF QUESTIONABLE HISTORY", floors: 3,
    parts: [R(-184, -AO, -176, -148)], door: [-A - 14, -AO + 0.5], back: [-170, -AO + 0.5],
    theme: "a columned front up steps from a forecourt on Gnome Ave; the galleries; the GOODS YARD gate on Gnome Ave, opposite the pub's back lane",
    signature: "a dinosaur made of shopping trolleys", materials: M("luxury", "timber", "metal"),
    grounds: [{ name: "the forecourt + steps (foot and heavy; giants go by the goods yard)", rect: R(-150, -AO, -148, -AO) }, { name: "the goods yard (gated, giant-wide)", rect: R(-184, -156, -148, -AO) }] },

  // ======== facilities ========
  { id: "police", kind: "facility", phase: "first", block: "B_police", name: "THE 1-1-4th PRECINCT", floors: 3, parts: [R(-4, 26, AO, 152)], door: [SPOKE_OFF, AO - 0.5], back: [SPOKE_OFF, 152.5],
    theme: "a corner station facing straight down Market St; the cells and the impound yard behind", grounds: [{ name: "the impound yard", rect: R(-4, 26, 152, 180) }] },
  { id: "pub", kind: "pub", phase: "reserved", block: "B_pub", name: "THE SOGGY SHAMROCK", floors: 3, parts: [R(-156, -AO, -66, -40)], door: [-AO + 0.5, -53], back: [-156.5, -44],
    theme: "the Irish pub on Stain Way: the bar, the snug, upstairs pool + darts, the balcony over the street; WEE MICKEY's yard on Wood Havoc Lane behind",
    grounds: [{ name: "WEE MICKEY's yard (the black market)", rect: R(-173.5, -156, -66, -48) }], flag: "moves here in a later stage (Blake): footprint for today's 29 x 26 m interior" },
  { id: "club", kind: "club", phase: "reserved", block: "B_club", name: "NEON FEVER", floors: 3, parts: [R(AO, 156, 84, AI)], door: [AO - 0.5, 102], back: [156.5, 92],
    theme: "the club on the Dit Marsh / Rooster Velt corner, the casino's marquee across the junction, the El overhead; the fire exit onto the club lane",
    flag: "moves here in a later stage (Blake): footprint for today's 29 x 26 m interior" },
];

// ---- the elevated line: one strong diagonal on the casino side --------------------------------------------------------
export const C_RAIL = { name: "THE QUEENS ELEVATED LINE", pts: [[20, 214], [194, -70]] as XZ[], deckW: 8, deckY: 7.5, clear: 7, maxColumnGap: 36 }; // 36: one longer truss where it crosses Dit Marsh on the skew (34.5 m of corridor)

export const COMPACT: QPlan = {
  id: "compact", name: "Compact Queens", extent: R(-204, 204, -204, 204),
  border: { N: [0, E], S: [0, -E], E: [E, 0], W: [-E, 0] },
  home: C_HOME, ring: C_RING, fortMax: FORT_MAX, forts: C_FORTS, stalls: C_STALLS, roads: C_ROADS, crossings: C_CROSSINGS, removed: C_REMOVED,
  paths: C_PATHS, blocks: C_BLOCKS, units: C_UNITS, rail: C_RAIL,
  materials: ["timber", "metal", "fabric", "fasteners", "electronics", "rubber", "chemicals", "luxury", "food"],
  valueShare: { low: 0.22, mid: 0.28, high: 0.3, landmark: 0.2 },
  marketExits: QUAD.map((_, k) => rotP(k, exitN)),
  roster: { first: [8, 7, 5], planned: [12, 8, 6] },
};
