// QUEENS OVERHAUL: THE CITY PLAN AS DATA (layout v2, after Blake's review of v1). Not wired into the game yet: nothing
// imports it but its generator (layout.ts), its checker (check.ts), its tests and the report.
//
// Coordinates in metres: x east, z north (as the game). The home block sits at (0, 0). Roads are centre lines with a
// carriageway and a pavement each side. BLOCKS are the land between the roads; each block is filled by layout.ts from
// its TYPOLOGY (a row of shops with flats above and a rear service alley, a courtyard block, a workshop block, a
// destination block...), around the UNITS placed in it here (every shop, landmark, facility, the pub, the club).
// Every number is a PROPOSAL for review; check.ts validates the rules and works out the route matrix.
//
// v2 (Blake's review, 2026-11-17): a properly sized home block (four 36 x 36 m yards that fit the largest planned
// fort), real building footprints (attached rows, corners, courtyards, workshops, destinations), varied streets (offset
// T-junctions, a bend, jogs, blocks split by alleys), a smaller police station, the pub and the club in their own
// nightlife streets, a stronger railway diagonal, and room for the FULL roster (12 / 8 / 6 + 4): 16 stores playable
// first, 10 more reserved as real shop units.

export type XZ = [number, number];
export interface QRect { minX: number; maxX: number; minZ: number; maxZ: number }
export const R = (minX: number, maxX: number, minZ: number, maxZ: number): QRect => ({ minX, maxX, minZ, maxZ });
export type Side = "N" | "S" | "E" | "W";
export type Tier = "low" | "mid" | "high";
export type Style = Tier | "special" | "home";
export type RoadKind = "ring" | "main" | "side" | "border";
export interface QRoad { id: string; name: string; kind: RoadKind; pts: XZ[]; /** carriageway */ w: number; /** pavement, each side */ sw: number }
export type PathKind = "market" | "alley" | "service" | "walk";
export interface QPath { id: string; kind: PathKind; pts: XZ[]; w: number; note?: string }
export type Material = "timber" | "metal" | "fabric" | "fasteners" | "electronics" | "rubber" | "chemicals" | "luxury" | "food";
export type UnitKind = "shop" | "landmark" | "facility" | "pub" | "club";
export interface QUnit {
  id: string; kind: UnitKind; name: string; block: string;
  /** the footprint (several rectangles for an L or a wing) */
  parts: QRect[];
  /** the public entrance (on a pavement), the second way in/out */
  door: XZ; back?: XZ;
  tier?: Tier;
  /** playable in the first release, or a reserved shop unit (built as an ordinary closed shopfront until its turn) */
  phase: "first" | "reserved";
  floors: number;
  /** the stable id it keeps from today's game */
  keepsId?: string;
  theme?: string; signature?: string; materials?: Material[]; flag?: string;
  /** extra open ground that belongs to it (a forecourt, a drop-off, a loading yard, a beer yard) */
  grounds?: { name: string; rect: QRect }[];
}
/** a block: one or more rectangles of land; `sides` = which edges face a street (get a frontage) */
export type Typology = "row" | "courtyard" | "workshop" | "destination" | "civic" | "precinct";
export interface QBlock {
  id: string; style: Style; type: Typology; label?: string;
  rects: { r: QRect; sides: Side[] }[];
  /** frontage depth (m) and storeys [min, max] for its ordinary buildings */
  depth?: number; floors?: [number, number];
  /** a service alley through the middle ("x" = runs east-west, "z" = north-south) */
  alley?: "x" | "z";
}
export interface QFort { id: string; slot: number; corner: "NW" | "NE" | "SE" | "SW"; yard: QRect; mat: XZ; front: XZ; rear: XZ; colour: string }

/** the playable city: 940 x 690 m (see decisions D-13, D-21: set by the ~60 s sprint to the border, not the picture) */
export const Q_EXTENT = R(-470, 470, -345, 345);
export const Q_BORDER = { N: [0, 335] as XZ, S: [0, -335] as XZ, E: [460, 0] as XZ, W: [-460, 0] as XZ };

// ---- the home block ------------------------------------------------------------------------------------------------
/** yards 36 x 36 m (5.4x today's 16 x 15 lot: the largest planned fort + storage + defences + its own outdoor space);
 *  the market a cross of 28 m lanes with a 28 x 28 m square in the middle; the block's own 5 m pavement; the ring road */
export const HOME = { yard: 36, lane: 28, half: 50, pave: 5, ringW: 10, ringPave: 5 } as const;
export const RING = HOME.half + HOME.pave + HOME.ringW / 2; // 60: the ring road's centre line
const Y = HOME.half, L = HOME.lane / 2; // 50, 14
/** the largest planned fort (the MAYOR'S BOXFORT) in yard coordinates: u across the yard's front (toward the market),
 *  v back from it. What must fit: the house + porch, three shelf units, the safe, the workbench, two trap sockets,
 *  the board, the border-and-gate (inset 0.6 m) and a usable outdoor area. Checked by check.ts. */
export const FORT_MAX = {
  border: 0.6,
  house: { u: [-9, 9], v: [16, 30] } as { u: [number, number]; v: [number, number] }, // 18 x 14 m with the porch
  shelves: [{ u: [-15, -11], v: [6, 18] }, { u: [11, 15], v: [6, 18] }, { u: [-6, 6], v: [31.5, 34] }] as { u: [number, number]; v: [number, number] }[],
  safe: { u: [-2, 2], v: [12.5, 14.5] }, workbench: { u: [10, 15], v: [24, 28] }, board: { u: [-15, -11], v: [24, 28] },
  traps: [{ u: [-4, 0], v: [4, 6] }, { u: [5, 9], v: [4, 6] }],
  mat: { u: [-1.6, 1.6], v: [8.4, 11.6] },
};
export const Q_FORTS: QFort[] = [
  // front gates on the market lanes (at the far end of the yard: the mat sits behind a return wall), rear gates on the
  // block's outer pavement, each facing ITS OWN low store across the ring road (the pinwheel)
  { id: "F1", slot: 0, corner: "NW", yard: R(-Y, -L, L, Y), mat: [-24, 32], front: [-L, 44], rear: [-Y, 24], colour: "#e74c3c" },
  { id: "F2", slot: 1, corner: "NE", yard: R(L, Y, L, Y), mat: [32, 24], front: [44, L], rear: [24, Y], colour: "#3498db" },
  { id: "F3", slot: 2, corner: "SE", yard: R(L, Y, -Y, -L), mat: [24, -32], front: [L, -44], rear: [Y, -24], colour: "#2ecc71" },
  { id: "F4", slot: 3, corner: "SW", yard: R(-Y, -L, -Y, -L), mat: [-32, -24], front: [-44, -L], rear: [-24, -Y], colour: "#f1c40f" },
];
/** the market's stalls (proposed spots): four counters round the square, the board in the middle */
export const Q_STALLS: { id: string; label: string; rect: QRect }[] = [
  { id: "sell", label: "SELL", rect: R(-12, -4, 4, 9) }, { id: "buy", label: "BUY", rect: R(4, 12, 4, 9) },
  { id: "craft", label: "CRAFT", rect: R(-12, -4, -9, -4) }, { id: "upgrade", label: "UPGRADE", rect: R(4, 12, -9, -4) },
  { id: "board", label: "BOARD", rect: R(-2, 2, -1.5, 1.5) },
];

// ---- roads ---------------------------------------------------------------------------------------------------------
const C = 10; // the ring's chamfered corners
export const Q_ROADS: QRoad[] = [
  { id: "ring", name: "FORT BLOCK ROAD", kind: "ring", w: HOME.ringW, sw: HOME.ringPave,
    pts: [[-RING + C, -RING], [RING - C, -RING], [RING, -RING + C], [RING, RING - C], [RING - C, RING], [-RING + C, RING], [-RING, RING - C], [-RING, -RING + C], [-RING + C, -RING]] },
  { id: "mkt_n", name: "MARKET ST NORTH", kind: "side", w: 7, sw: 3.5, pts: [[0, RING], [0, 150]] },
  { id: "mkt_s", name: "MARKET ST SOUTH", kind: "side", w: 7, sw: 3.5, pts: [[0, -RING], [0, -150]] },
  // Queasy Blvd: the one through street east-west, OFFSET at the home block (no straight sightline across the city)
  { id: "queasy_w", name: "QUEASY BLVD", kind: "main", w: 10, sw: 4, pts: [[-RING, 0], [-460, 0]] },
  { id: "queasy_e", name: "QUEASY BLVD (EAST)", kind: "main", w: 10, sw: 4, pts: [[RING, -15], [460, -15]] },
  // Rooster Velt Ave: north, with a gentle bend up where the nightlife quarter starts
  { id: "rooster", name: "ROOSTER VELT AVE", kind: "main", w: 9, sw: 4, pts: [[-460, 150], [110, 150], [150, 170], [460, 170]] },
  { id: "gnome", name: "GNOME AVE", kind: "main", w: 9, sw: 4, pts: [[-460, -150], [460, -150]] },
  // the avenues: Stain Way jogs west at Rooster; Dit Marsh runs the full height on the line's side
  { id: "stainway", name: "STAIN WAY", kind: "main", w: 9, sw: 4, pts: [[-230, -335], [-230, 150], [-250, 175], [-250, 335]] },
  { id: "ditmarsh", name: "DIT MARSH BLVD", kind: "main", w: 9, sw: 4, pts: [[200, -335], [200, 335]] },
  { id: "woodhavoc", name: "WOOD HAVOC AVE", kind: "side", w: 7, sw: 3.5, pts: [[-360, -150], [-360, 150]] },
  { id: "flushed", name: "FLUSHED AVE", kind: "side", w: 7, sw: 3.5, pts: [[330, -255], [330, -15]] },
  { id: "lowroad", name: "LOW ROAD", kind: "side", w: 7, sw: 3.5, pts: [[70, -150], [70, -255]] },
  // Astorial St: two halves, each a T off an avenue, ending in a small turning square either side of the police yard
  { id: "astorial_w", name: "ASTORIAL ST", kind: "side", w: 7, sw: 3.5, pts: [[-460, 255], [-60, 255]] },
  { id: "astorial_e", name: "ASTORIAL ST (EAST)", kind: "side", w: 7, sw: 3.5, pts: [[60, 255], [200, 255]] },
  { id: "jamaker", name: "JAMAKER AVE", kind: "side", w: 7, sw: 3.5, pts: [[-460, -255], [460, -255]] },
  // the border loop (buildings on its inner side only)
  { id: "border_n", name: "NORTH SHORE RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, 335], [460, 335]] },
  { id: "border_s", name: "SOUTH SHORE RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, -335], [460, -335]] },
  { id: "border_w", name: "WEST END RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, -335], [-460, 335]] },
  { id: "border_e", name: "EAST END RD", kind: "border", w: 8, sw: 3.5, pts: [[460, -335], [460, 335]] },
];
/** zebra crossings over the ring: one at each market exit, one outside each fort's rear gate (toward its low store) */
export const Q_CROSSINGS: { id: string; at: XZ; across: "x" | "z"; w: number }[] = [
  { id: "x_mkt_n", at: [0, RING], across: "z", w: 8 }, { id: "x_mkt_s", at: [0, -RING], across: "z", w: 8 },
  { id: "x_mkt_e", at: [RING, -6], across: "x", w: 8 }, { id: "x_mkt_w", at: [-RING, 0], across: "x", w: 8 },
  { id: "x_f1", at: [-RING, 26], across: "x", w: 6 }, { id: "x_f2", at: [26, RING], across: "z", w: 6 },
  { id: "x_f3", at: [RING, -34], across: "x", w: 6 }, { id: "x_f4", at: [-26, -RING], across: "z", w: 6 },
];
/** where Blake removed two roads from the reference: no road may enter (pedestrian paths may) */
export const Q_REMOVED: { id: string; why: string; rect: QRect }[] = [
  { id: "spur_n", why: "the short top-centre spur from the north edge to the first east-west street", rect: R(-12, 12, 160, 330) },
  { id: "connector_se", why: "the bent south-east connector outside the fort block (towards the hotel)", rect: R(75, 190, -140, -70) },
];

// ---- explicit paths (block alleys are generated by layout.ts) -------------------------------------------------------
export const Q_PATHS: QPath[] = [
  { id: "mkt_ns", kind: "market", w: HOME.lane, pts: [[0, -RING], [0, RING]] },
  { id: "mkt_ew", kind: "market", w: HOME.lane, pts: [[-RING, 0], [RING, 0]] },
  // where the north spur was: a pedestrian walk through the police yard and the courtyard behind it, to the shore
  { id: "walk_police", kind: "walk", w: 6, pts: [[-60, 255], [60, 255]], note: "joins the two halves of Astorial St" },
  { id: "walk_spur", kind: "walk", w: 5, pts: [[-24, 150], [-24, 255]], note: "the old spur, now a footpath beside the police to the Astorial walk" },
  { id: "walk_court", kind: "walk", w: 5, pts: [[0, 255], [0, 335]], note: "on through Spur Court (a courtyard of flats) to the north shore" },
  // the pub's back alley (WEE MICKEY's yard) and the club's fire-exit lane
  { id: "al_pub", kind: "service", w: 5, pts: [[-460, -100], [-360, -100]], note: "behind the SOGGY SHAMROCK: WEE MICKEY's yard, the snug's side door" },
  { id: "al_club", kind: "service", w: 5, pts: [[248, -15], [248, 170]], note: "the club lane: NEON FEVER's fire exit and DON BINNIE's back stairs" },
  // the landmarks' controlled service sides
  { id: "svc_bank", kind: "service", w: 6, pts: [[-250, 312], [-269.5, 312]], note: "the bank's armoured-van dock (gated)" },
  { id: "svc_casino", kind: "service", w: 6, pts: [[460, 260], [431, 260]], note: "the casino's cash-office door off East End Rd" },
  { id: "svc_museum", kind: "service", w: 6, pts: [[-460, -300], [-411, -300]], note: "the museum's goods yard" },
  { id: "svc_hotel", kind: "service", w: 6, pts: [[200, -295], [249, -295]], note: "the hotel's loading bay and kitchen door" },
];

// ---- blocks --------------------------------------------------------------------------------------------------------
// Edges: each block's rectangles stop at the road corridors (centre +/- carriageway/2 + pavement).
export const Q_BLOCKS: QBlock[] = [
  // ---- LOW: wrapped round the ring (L-shaped blocks, a frontage on the ring AND on the outer street) ----
  { id: "B_nw", style: "low", type: "row", alley: "x", rects: [{ r: R(-221.5, -70, 9, 141.5), sides: ["N", "S", "W", "E"] }, { r: R(-70, -7, 70, 141.5), sides: ["N", "S", "E"] }] },
  { id: "B_ne", style: "low", type: "courtyard", rects: [{ r: R(7, 191.5, 70, 141.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_e", style: "low", type: "workshop", rects: [{ r: R(70, 191.5, -6, 70), sides: ["W", "E", "S"] }] },
  { id: "B_se", style: "low", type: "row", alley: "z", rects: [{ r: R(70, 191.5, -141.5, -24), sides: ["N", "S", "W", "E"] }, { r: R(7, 70, -141.5, -70), sides: ["N", "S", "W"] }] },
  { id: "B_sw", style: "low", type: "row", alley: "x", rects: [{ r: R(-221.5, -70, -141.5, -9), sides: ["N", "S", "W", "E"] }, { r: R(-70, -7, -141.5, -70), sides: ["N", "S", "E"] }] },
  // ---- MID ----
  { id: "B_w3", style: "mid", type: "row", alley: "z", rects: [{ r: R(-353, -238.5, 9, 141.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_w4", style: "mid", type: "courtyard", rects: [{ r: R(-353, -238.5, -141.5, -9), sides: ["N", "S", "W", "E"] }] },
  { id: "B_n2", style: "mid", type: "row", alley: "x", rects: [{ r: R(-225, -60, 158.5, 248), sides: ["N", "S", "W"] }] },
  { id: "B_n4", style: "mid", type: "row", alley: "x", rects: [{ r: R(60, 191.5, 178.5, 248), sides: ["N", "S", "E"] }] },
  { id: "B_e2", style: "mid", type: "row", alley: "z", rects: [{ r: R(208.5, 322.5, -141.5, -24), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s3", style: "mid", type: "row", alley: "x", rects: [{ r: R(-221.5, 62.5, -248, -158.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s4", style: "mid", type: "workshop", rects: [{ r: R(77.5, 191.5, -248, -158.5), sides: ["N", "S", "W", "E"] }] },
  // ---- HIGH ----
  { id: "B_w1", style: "high", type: "row", alley: "z", rects: [{ r: R(-452.5, -367, 9, 141.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_pub", style: "high", type: "destination", label: "the pub's street", rects: [{ r: R(-452.5, -367, -141.5, -9), sides: ["N", "S", "W", "E"] }] },
  { id: "B_nw1", style: "high", type: "courtyard", rects: [{ r: R(-452.5, -258.5, 158.5, 248), sides: ["N", "S", "W", "E"] }] },
  { id: "B_n5", style: "high", type: "row", alley: "x", rects: [{ r: R(-241.5, -60, 262, 327.5), sides: ["N", "S", "W"] }] },
  { id: "B_n6", style: "high", type: "row", alley: "x", rects: [{ r: R(60, 191.5, 262, 327.5), sides: ["N", "S", "E"] }] },
  { id: "B_club", style: "high", type: "destination", label: "the nightlife strip", alley: "x", rects: [{ r: R(208.5, 452.5, -6, 161.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_e3", style: "high", type: "row", alley: "x", rects: [{ r: R(337.5, 452.5, -141.5, -24), sides: ["N", "S", "W", "E"] }] },
  { id: "B_sw1", style: "high", type: "row", alley: "x", rects: [{ r: R(-452.5, -238.5, -248, -158.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s6", style: "high", type: "row", alley: "x", rects: [{ r: R(-221.5, 191.5, -327.5, -262), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s5", style: "high", type: "row", alley: "x", rects: [{ r: R(208.5, 322.5, -248, -158.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_s7", style: "high", type: "courtyard", rects: [{ r: R(337.5, 452.5, -248, -158.5), sides: ["N", "S", "W", "E"] }] },
  // ---- the police (smaller than v1) and the courtyard behind it, where the north spur was ----
  { id: "B_police", style: "mid", type: "civic", label: "the precinct + Spur Court", rects: [{ r: R(-60, 60, 158.5, 248), sides: ["S", "N"] }, { r: R(-60, 60, 262, 327.5), sides: ["N", "S"] }] },
  // ---- SPECIAL: the four precincts, each a different shape and approach ----
  { id: "B_bank", style: "special", type: "precinct", rects: [{ r: R(-452.5, -258.5, 262, 327.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_casino", style: "special", type: "precinct", rects: [{ r: R(208.5, 452.5, 178.5, 327.5), sides: ["N", "S", "W", "E"] }] },
  { id: "B_museum", style: "special", type: "precinct", rects: [{ r: R(-452.5, -238.5, -327.5, -262), sides: ["N", "S", "W", "E"] }] },
  { id: "B_hotel", style: "special", type: "precinct", rects: [{ r: R(208.5, 452.5, -327.5, -262), sides: ["N", "S", "W", "E"] }] },
];

// ---- the units: every shop, landmark, facility, the pub and the club -----------------------------------------------
// Shops are ground-floor units IN the rows (flats or offices above), 15 x 16 m (~222 m2 of floor: 2.2x today's store),
// high-end 16 x 16; corner units wrap the junction. Reserved units are built as ordinary closed shopfronts until their
// turn (the brief's "believable buildings or plots", not empty land).
const U = (x0: number, z0: number, w: number, d: number) => R(x0, x0 + w, z0, z0 + d);
export const Q_UNITS: QUnit[] = [
  // ======== LOW (12): 6 first (the pinwheel + two on the market streets), 6 reserved ========
  { id: "screwloose", kind: "shop", tier: "low", phase: "first", block: "B_nw", name: "SCREW LOOSE HARDWARE", keepsId: "lastscrew", parts: [U(-86, 18, 16, 16)], door: [-69.5, 26], back: [-86.5, 26], floors: 3,
    theme: "timber, tools, screws, tape", signature: "the forty-foot ladder nobody can carry upright", materials: ["timber", "metal", "fasteners", "chemicals"] },
  { id: "crumbs", kind: "shop", tier: "low", phase: "first", block: "B_ne", name: "CRUMBS & CONSEQUENCES", keepsId: "crumbs", parts: [U(18, 70, 16, 16)], door: [26, 69.5], back: [26, 86.5], floors: 3,
    theme: "mini-mart food, packaging, batteries", signature: "the pyramid of off-brand cola", materials: ["food", "electronics", "fabric"] },
  { id: "rustbucket", kind: "shop", tier: "low", phase: "first", block: "B_se", name: "RUST BUCKET SALVAGE", keepsId: "rustbucket", parts: [U(70, -46, 14, 20)], door: [69.5, -34], back: [84.5, -40], floors: 2,
    theme: "scrap metal, timber, parts", signature: "the car door that still has a parking ticket", materials: ["metal", "timber", "rubber", "fasteners"],
    grounds: [{ name: "the scrap yard", rect: U(84, -50, 16, 24) }], flag: "specialist: a 14 x 20 office + a fenced scrap yard behind" },
  { id: "plugpray", kind: "shop", tier: "low", phase: "first", block: "B_sw", name: "PLUG & PRAY REPAIRS", keepsId: "plugpray", parts: [U(-34, -86, 16, 16)], door: [-26, -69.5], back: [-26, -86.5], floors: 3,
    theme: "broken appliances, wire, electronics", signature: "the microwave that only plays polka", materials: ["electronics", "metal", "fasteners"] },
  { id: "wheelie", kind: "shop", tier: "low", phase: "first", block: "B_nw", name: "WHEELIE DODGY CYCLES", parts: [U(-23, 100, 16, 15)], door: [-6.5, 107], back: [-23.5, 107], floors: 3,
    theme: "bicycles, chains, wheels", signature: "a tandem with one seat", materials: ["metal", "rubber", "fasteners"] },
  { id: "potluck", kind: "shop", tier: "low", phase: "first", block: "B_se", name: "POT LUCK GARDEN CENTRE", parts: [U(7, -120, 16, 16)], door: [6.5, -112], back: [23.5, -112], floors: 2,
    theme: "plants, gnomes, tools, garden supplies", signature: "the gnome with a getaway plan", materials: ["timber", "chemicals", "rubber"],
    grounds: [{ name: "the plant yard", rect: U(23, -124, 18, 20) }], flag: "specialist: a 16 x 16 shop + an open plant yard" },
  { id: "solesurv", kind: "shop", tier: "low", phase: "reserved", block: "B_nw", name: "SOLE SURVIVORS", parts: [U(-150, 9, 15, 16)], door: [-142.5, 8.5], floors: 3, theme: "discount shoes, rubber, fabric", materials: ["rubber", "fabric"] },
  { id: "dyetrying", kind: "shop", tier: "low", phase: "reserved", block: "B_sw", name: "DYE TRYING", parts: [U(-150, -25, 15, 16)], door: [-142.5, -8.5], floors: 3, theme: "hair salon, wigs, dryers, cosmetics", materials: ["chemicals", "electronics"] },
  { id: "finalprint", kind: "shop", tier: "low", phase: "reserved", block: "B_ne", name: "THE FINAL PRINT", parts: [U(60, 125.5, 15, 16)], door: [67.5, 142], floors: 3, theme: "paper, ink, glue, stationery", materials: ["chemicals", "timber"] },
  { id: "washprob", kind: "shop", tier: "low", phase: "reserved", block: "B_e", name: "WASH YOUR PROBLEM?", parts: [U(70, 28, 16, 20)], door: [69.5, 38], floors: 2, theme: "car wash, hoses, cleaning supplies", materials: ["chemicals", "rubber"], flag: "specialist: a drive-through wash bay" },
  { id: "sewwhat", kind: "shop", tier: "low", phase: "reserved", block: "B_se", name: "SEW WHAT?", parts: [U(130, -141.5, 15, 16)], door: [137.5, -142], floors: 3, theme: "alterations, fabric rolls, sewing machines", materials: ["fabric", "metal"] },
  { id: "fishy", kind: "shop", tier: "low", phase: "reserved", block: "B_sw", name: "FISHY BUSINESS", parts: [U(-110, -141.5, 15, 16)], door: [-102.5, -142], floors: 3, theme: "fishmonger, food, packaging, odd trophies", materials: ["food", "chemicals"] },
  // ======== MID (8): 5 first, 3 reserved ========
  { id: "secondchance", kind: "shop", tier: "mid", phase: "first", block: "B_w3", name: "SECOND CHANCE HOMEWARES", keepsId: "secondchance", parts: [U(-254.5, 60, 16, 16)], door: [-238, 68], back: [-255, 68], floors: 4,
    theme: "furniture, lamps, appliances", signature: "the sofa shaped like a mouth", materials: ["fabric", "timber", "electronics"] },
  { id: "spinsin", kind: "shop", tier: "mid", phase: "first", block: "B_e2", name: "SPIN & SIN LAUNDRETTE", keepsId: "spincycle", parts: [U(208.5, -80, 16, 16)], door: [208, -72], back: [225, -72], floors: 4,
    theme: "machines, lost property, clothing", signature: "the lost-property bin (nobody knows what's in it)", materials: ["fabric", "metal", "electronics"] },
  { id: "needledrop", kind: "shop", tier: "mid", phase: "first", block: "B_n2", name: "NEEDLE DROP RECORDS", keepsId: "needledrop", parts: [U(-150, 158.5, 15, 16)], door: [-142.5, 158], back: [-142.5, 175], floors: 4,
    theme: "records, audio gear, collectibles", signature: "the jukebox that only takes buttons", materials: ["electronics", "luxury"] },
  { id: "peakfomo", kind: "shop", tier: "mid", phase: "first", block: "B_s4", name: "PEAK FOMO OUTDOORS", keepsId: "peakfomo", parts: [U(110, -174.5, 15, 16)], door: [117.5, -158], back: [117.5, -175], floors: 4,
    theme: "camping gear, straps, tents", signature: "the tent that's bigger inside (it isn't)", materials: ["fabric", "rubber", "metal"] },
  { id: "pastprime", kind: "shop", tier: "mid", phase: "first", block: "B_s3", name: "PAST ITS PRIME ANTIQUES", parts: [U(-120, -174.5, 16, 16)], door: [-112, -158], back: [-112, -175], floors: 4,
    theme: "clocks, furnishings, collectibles", signature: "the grandfather clock that's actually a grandmother", materials: ["timber", "luxury", "metal"] },
  { id: "batterdays", kind: "shop", tier: "mid", phase: "reserved", block: "B_n4", name: "BATTER DAYS BAKERY", parts: [U(160, 178.5, 15, 16)], door: [167.5, 178], floors: 4, theme: "food, cookware, kitchen appliances", materials: ["food", "metal", "electronics"] },
  { id: "strings", kind: "shop", tier: "mid", phase: "reserved", block: "B_w4", name: "LORD OF THE STRINGS", parts: [U(-254.5, -90, 16, 15)], door: [-238, -82.5], floors: 4, theme: "instruments, amplifiers, an oversized tuba", materials: ["timber", "electronics", "metal"] },
  { id: "partyfoul", kind: "shop", tier: "mid", phase: "reserved", block: "B_e2", name: "PARTY FOUL SUPPLIES", parts: [U(270, -40, 15, 16)], door: [277.5, -23.5], floors: 4, theme: "costumes, decorations, novelty props", materials: ["fabric", "chemicals"] },
  // ======== HIGH (6): 5 first, 1 reserved ========
  { id: "caratrun", kind: "shop", tier: "high", phase: "first", block: "B_n5", name: "CARAT & RUN", keepsId: "caratrun", parts: [U(-110, 262, 16, 16)], door: [-102, 261.5], back: [-102, 278.5], floors: 6,
    theme: "jewellery and extravagant display pieces", signature: "the DIAMOND PIGEON", materials: ["luxury", "metal"] },
  { id: "tickedoff", kind: "shop", tier: "high", phase: "first", block: "B_n6", name: "TICKED OFF WATCHES", keepsId: "tickedoff", parts: [U(100, 262, 16, 16)], door: [108, 261.5], back: [108, 278.5], floors: 6,
    theme: "watches and precision parts", signature: "the cuckoo clock that sounds the alarm itself", materials: ["luxury", "metal", "fasteners", "electronics"] },
  { id: "maisonpong", kind: "shop", tier: "high", phase: "first", block: "B_w1", name: "MAISON PONG", keepsId: "maisonpong", parts: [U(-383, 60, 16, 16)], door: [-366.5, 68], back: [-383.5, 68], floors: 6,
    theme: "perfume and luxury cosmetics", signature: "EAU DE BIN, the flagship scent", materials: ["luxury", "chemicals"] },
  { id: "guccio", kind: "shop", tier: "high", phase: "first", block: "B_e3", name: "GUCCIO GARBAGE", parts: [U(337.5, -90, 16, 16)], door: [337, -82], back: [354, -82], floors: 6,
    theme: "designer fashion and accessories", signature: "the handbag made of a real bin bag ($900)", materials: ["luxury", "fabric", "rubber"] },
  { id: "uppercrust", kind: "shop", tier: "high", phase: "first", block: "B_s6", name: "THE UPPER CRUST", parts: [U(-150, -278, 16, 16)], door: [-142, -261.5], back: [-142, -278.5], floors: 6,
    theme: "luxury deli, cheese vault, giftware", signature: "the wheel of cheese with its own security guard", materials: ["food", "luxury"] },
  { id: "framefort", kind: "shop", tier: "high", phase: "reserved", block: "B_sw1", name: "FRAME & FORTUNE", parts: [U(-330, -174.5, 16, 16)], door: [-322, -158], floors: 6, theme: "art, sculptures, prestige objects", materials: ["luxury", "timber"] },
  // ======== SPECIAL (4): different shapes, approaches and service sides ========
  { id: "bank", kind: "landmark", phase: "first", block: "B_bank", name: "FIRST NATIONAL BANK OF BOXES", floors: 5,
    parts: [R(-330, -270, 262, 300), R(-300, -270, 300, 318)], door: [-300, 261.5], back: [-270, 312],
    theme: "a corner banking hall on Astorial St; the counting room and the vault behind; the armoured-van dock on the gated service side",
    signature: "the vault door on a novelty key ring", materials: ["luxury", "metal"], grounds: [{ name: "the armoured-van dock (gated)", rect: R(-268, -258.5, 300, 324) }] },
  { id: "casino", kind: "landmark", phase: "first", block: "B_casino", name: "THE LUCKY LOSER CASINO", floors: 4,
    parts: [R(330, 430, 205, 275), R(360, 400, 275, 295)], door: [380, 178], back: [430.5, 260],
    theme: "a lit marquee facing the club across Rooster Velt Ave; the floor (no real-money games); the cash office at the back",
    signature: "the slot machine that pays out in coupons", materials: ["luxury", "electronics", "metal"], grounds: [{ name: "the marquee forecourt", rect: R(340, 420, 179, 205) }] },
  { id: "museum", kind: "landmark", phase: "first", block: "B_museum", name: "THE MUSEUM OF QUESTIONABLE HISTORY", floors: 3,
    parts: [R(-410, -300, -320, -290)], door: [-355, -261.5], back: [-410.5, -300],
    theme: "a columned front up steps from a public forecourt on Jamaker Ave; the galleries; the goods yard round the back",
    signature: "a dinosaur made of shopping trolleys", materials: ["luxury", "timber", "metal"], grounds: [{ name: "the public forecourt + steps", rect: R(-395, -315, -290, -262) }] },
  { id: "hotel", kind: "landmark", phase: "first", block: "B_hotel", name: "THE GRAND OVERLOOK-ISH HOTEL", floors: 10,
    parts: [R(250, 330, -310, -280), R(300, 330, -327, -310)], door: [290, -261.5], back: [249.5, -295],
    theme: "a canopy and a drop-off lay-by on Jamaker Ave; the lobby, service corridors, a few guest floors, the penthouse",
    signature: "the luggage trolley piled with someone's whole life", materials: ["luxury", "fabric", "electronics"], grounds: [{ name: "the canopy drop-off", rect: R(255, 325, -280, -262) }] },
  // ======== FACILITIES (not counted among the stores) ========
  { id: "police", kind: "facility", phase: "first", block: "B_police", name: "THE 1-1-4th PRECINCT", floors: 3, parts: [R(-18, 18, 158.5, 186)], door: [0, 158], back: [0, 186.5],
    theme: "a corner station facing down Market St; the cells and the impound yard behind", grounds: [{ name: "the impound yard", rect: R(18, 50, 158.5, 200) }] },
  // the pub: today's interior is 29 x 26 m (plus its balcony and WEE MICKEY's yard): a corner plot on Gnome Ave + Wood Havoc
  { id: "pub", kind: "pub", phase: "reserved", block: "B_pub", name: "THE SOGGY SHAMROCK", floors: 3, parts: [R(-397, -367, -141.5, -114)], door: [-366.5, -128], back: [-382, -113.5],
    theme: "the Irish pub: the bar, the snug, upstairs pool + darts, the cantilever balcony over Wood Havoc", grounds: [{ name: "WEE MICKEY's yard (the black market)", rect: R(-397, -367, -113.5, -102.5) }],
    flag: "moves here in a later stage (Blake): footprint reserved for today's interior" },
  // the club: today's 29 x 26 m with the chamfered corner door: on the corner of Dit Marsh + Rooster Velt
  { id: "club", kind: "club", phase: "reserved", block: "B_club", name: "NEON FEVER", floors: 3, parts: [R(208.5, 238, 135, 161.5)], door: [208, 161], back: [238.5, 148],
    theme: "the club: its corner door on the junction, the atrium, the roof deck; DON BINNIE's lounge; the fire exit onto the club lane",
    flag: "moves here in a later stage (Blake): footprint reserved for today's interior" },
];

// ---- the elevated line: a stronger diagonal on the casino side (the reference's composition) -----------------------
export const Q_RAIL = {
  name: "THE QUEENS ELEVATED LINE",
  /** north edge -> past the casino (east of it) and the club (west) -> the south-east corner, the hotel to its west */
  pts: [[220, 345], [360, 40], [445, -345]] as XZ[],
  deckW: 8, deckY: 7.5,
  /** the strip under the line: no buildings (columns, parking, garages' yards) */
  clear: 7,
  maxColumnGap: 32,
};

// ---- districts (the tier overlay: neighbourhoods, not rings) -------------------------------------------------------
export const Q_DISTRICTS: { id: string; style: Style; label: string; rect: QRect }[] = Q_BLOCKS.map((b) => {
  const r = b.rects.reduce((a, x) => R(Math.min(a.minX, x.r.minX), Math.max(a.maxX, x.r.maxX), Math.min(a.minZ, x.r.minZ), Math.max(a.maxZ, x.r.maxZ)), R(1e9, -1e9, 1e9, -1e9));
  return { id: b.id, style: b.style, label: b.label ?? "", rect: r };
});

export const Q_MATERIALS: Material[] = ["timber", "metal", "fabric", "fasteners", "electronics", "rubber", "chemicals", "luxury", "food"];
/** each cycle's shelf value split by tier (PROPOSED; Stage 3 tunes): more stores split it, they don't add money */
export const Q_VALUE_SHARE = { low: 0.22, mid: 0.28, high: 0.3, landmark: 0.2 } as const;
