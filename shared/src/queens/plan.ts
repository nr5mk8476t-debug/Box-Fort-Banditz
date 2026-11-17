// QUEENS OVERHAUL, Stage 1: THE CITY PLAN AS DATA. Not wired into the game yet (nothing imports it but its checker,
// its tests and the report): the playable map is untouched until the Stage 2 blockout is accepted.
//
// Coordinates in metres: x east, z north (as the game). The home block sits at (0, 0). Roads are centre lines with a
// carriageway width and a pavement each side; plots are rectangles; doors are points on a public pavement or path.
// Every number here is a PROPOSAL for review. `check.ts` validates the rules (one connected road network, nothing on a
// road, every door reachable, the railway's columns clear of every lane and pavement, the removed roads absent, the
// four forts equal) and works out the route matrix; `tests/queens-plan-report.ts` draws it and writes the tables.
//
// Blake (R16 brief + reply): an early-2000s Queens-flavoured cartoon city; four equal forts round one market inside a
// perimeter road; LOW 6, MEDIUM 5, HIGH 5 stores and 4 landmark precincts (bank NW, casino NE, museum SW, hotel SE);
// the pub and the club later (their plots reserved now); an elevated railway on the casino side instead of the
// reference's diagonal road; the top-centre spur and the south-east connector removed; ~60 s (sprinting) to the edge.

export type XZ = [number, number];
export interface QRect { minX: number; maxX: number; minZ: number; maxZ: number }
export type RoadKind = "ring" | "main" | "side" | "border";
export interface QRoad { id: string; name: string; kind: RoadKind; pts: XZ[]; /** carriageway width */ w: number; /** pavement, each side */ sw: number }
export type PathKind = "market" | "gate" | "alley" | "service";
export interface QPath { id: string; kind: PathKind; pts: XZ[]; w: number; note?: string }
export type Tier = "low" | "mid" | "high";
export type PlotKind = "fort" | "market" | "store" | "landmark" | "facility" | "reserved";
export type Material = "timber" | "metal" | "fabric" | "fasteners" | "electronics" | "rubber" | "chemicals" | "luxury" | "food";
export interface QPlot {
  id: string; kind: PlotKind; name: string; rect: QRect;
  /** the public entrance (a point on a pavement or a path) */
  door: XZ;
  /** a second way in/out (a service door, a back gate) */
  back?: XZ;
  tier?: Tier;
  /** the stable id it keeps from today's game, if any (renames are display names only) */
  keepsId?: string;
  floors?: number; theme?: string; signature?: string; materials?: Material[];
  /** a flagged exception (a specialist footprint) */
  flag?: string;
}
export interface QDistrict { id: string; style: Tier | "special" | "home"; label: string; rect: QRect }
export interface QFort { id: string; slot: number; corner: "NW" | "NE" | "SE" | "SW"; yard: QRect; mat: XZ; front: XZ; rear: XZ; colour: string }

export const R = (minX: number, maxX: number, minZ: number, maxZ: number): QRect => ({ minX, maxX, minZ, maxZ });

/** the playable city (the border roads run just inside it) */
export const Q_EXTENT = R(-470, 470, -345, 345);
export const Q_BORDER = { N: [0, 335] as XZ, S: [0, -335] as XZ, E: [460, 0] as XZ, W: [-460, 0] as XZ };

// ---- the home block ------------------------------------------------------------------------------------------------
/** the block (inside its own pavement), the four yards, the market cross between them */
export const HOME = { half: 32, pave: 4, yard: 24, lane: 8 } as const; // yards 24 x 24 m; market lanes 16 m wide
const Y = HOME.half, L = HOME.lane;
export const Q_FORTS: QFort[] = [
  // front gates on the market lanes (offset to the far end of the yard: a return wall screens the mat), rear gates on
  // the outer pavement; mats in the middle of the yard, 9+ m from either gate
  { id: "F1", slot: 0, corner: "NW", yard: R(-Y, -L, L, Y), mat: [-17, 17], front: [-L, 28], rear: [-Y, 12], colour: "#e74c3c" },
  { id: "F2", slot: 1, corner: "NE", yard: R(L, Y, L, Y), mat: [17, 17], front: [28, L], rear: [12, Y], colour: "#3498db" },
  { id: "F3", slot: 2, corner: "SE", yard: R(L, Y, -Y, -L), mat: [17, -17], front: [L, -28], rear: [Y, -12], colour: "#2ecc71" },
  { id: "F4", slot: 3, corner: "SW", yard: R(-Y, -L, -Y, -L), mat: [-17, -17], front: [-28, -L], rear: [-12, -Y], colour: "#f1c40f" },
];

// ---- roads ---------------------------------------------------------------------------------------------------------
const RING = Y + HOME.pave + 4.5; // 40.5: the ring road's centre line (a 9 m carriageway)
export const Q_ROADS: QRoad[] = [
  { id: "ring", name: "FORT BLOCK ROAD", kind: "ring", w: 9, sw: 4, pts: [[-RING, -RING], [RING, -RING], [RING, RING], [-RING, RING], [-RING, -RING]] },
  // out of the ring: north stops at Rooster Velt Ave (the old spur to the edge is REMOVED), south jogs at Gnome Ave
  { id: "mkt_n", name: "MARKET ST NORTH", kind: "side", w: 7, sw: 3.5, pts: [[0, RING], [0, 130]] },
  { id: "mkt_s", name: "MARKET ST SOUTH", kind: "side", w: 7, sw: 3.5, pts: [[0, -RING], [0, -125]] },
  { id: "mkt_s2", name: "LOW ROAD", kind: "side", w: 7, sw: 3.5, pts: [[60, -125], [60, -335]] },
  { id: "queasy_w", name: "QUEASY BLVD (WEST)", kind: "main", w: 10, sw: 4, pts: [[-RING, 0], [-460, 0]] },
  { id: "queasy_e", name: "QUEASY BLVD (EAST)", kind: "main", w: 10, sw: 4, pts: [[RING, 0], [460, 0]] },
  // the avenues (north-south), with a jog in the west and short stubs: not a perfect grid
  { id: "stainway", name: "STAIN WAY", kind: "main", w: 9, sw: 4, pts: [[-150, -335], [-150, 130], [-170, 160], [-170, 335]] },
  { id: "ditmarsh", name: "DIT MARSH BLVD", kind: "main", w: 9, sw: 4, pts: [[150, -335], [150, 335]] },
  { id: "woodhavoc", name: "WOOD HAVOC AVE", kind: "side", w: 7, sw: 3.5, pts: [[-290, -240], [-290, 240]] },
  { id: "flushed", name: "FLUSHED AVE", kind: "side", w: 7, sw: 3.5, pts: [[300, -240], [300, 240]] },
  // the cross streets (east-west)
  { id: "rooster", name: "ROOSTER VELT AVE", kind: "main", w: 9, sw: 4, pts: [[-460, 130], [460, 130]] },
  { id: "gnome", name: "GNOME AVE", kind: "main", w: 9, sw: 4, pts: [[-460, -125], [460, -125]] },
  { id: "north240", name: "ASTORIAL ST", kind: "side", w: 7, sw: 3.5, pts: [[-460, 240], [-20, 240]] },
  { id: "north240e", name: "ASTORIAL ST (EAST)", kind: "side", w: 7, sw: 3.5, pts: [[20, 240], [460, 240]] },
  { id: "south240", name: "JAMAKER AVE", kind: "side", w: 7, sw: 3.5, pts: [[-460, -240], [460, -240]] },
  // the border loop (the city's edge: buildings on its inner side only)
  { id: "border_n", name: "NORTH SHORE RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, 335], [460, 335]] },
  { id: "border_s", name: "SOUTH SHORE RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, -335], [460, -335]] },
  { id: "border_w", name: "WEST END RD", kind: "border", w: 8, sw: 3.5, pts: [[-460, -335], [-460, 335]] },
  { id: "border_e", name: "EAST END RD", kind: "border", w: 8, sw: 3.5, pts: [[460, -335], [460, 335]] },
];
/** zebra crossings over the ring road (the brief: several, readable, wide enough for giant loot): one at each market
 *  exit and one outside each fort's rear gate, pointing straight at that fort's own low store (the pinwheel) */
export const Q_CROSSINGS: { id: string; at: XZ; across: "x" | "z"; w: number }[] = [
  { id: "x_mkt_n", at: [0, RING], across: "z", w: 6 }, { id: "x_mkt_s", at: [0, -RING], across: "z", w: 6 },
  { id: "x_mkt_e", at: [RING, 0], across: "x", w: 6 }, { id: "x_mkt_w", at: [-RING, 0], across: "x", w: 6 },
  { id: "x_f1", at: [-RING, 20], across: "x", w: 5 }, { id: "x_f2", at: [20, RING], across: "z", w: 5 },
  { id: "x_f3", at: [RING, -20], across: "x", w: 5 }, { id: "x_f4", at: [-20, -RING], across: "z", w: 5 },
];
/** zones where Blake removed a road: the checker fails if any road enters them (pedestrian paths may) */
export const Q_REMOVED: { id: string; why: string; rect: QRect }[] = [
  { id: "spur_n", why: "the short top-centre spur from the north edge to the first east-west street", rect: R(-12, 12, 140, 330) },
  { id: "connector_se", why: "the bent south-east connector outside the fort block (towards the hotel)", rect: R(52, 140, -118, -52) },
];

// ---- paths (pedestrian only: no vehicles) --------------------------------------------------------------------------
export const Q_PATHS: QPath[] = [
  // the market cross (pedestrian), out across the pavement to the ring road on all four sides
  { id: "mkt_ns", kind: "market", w: 16, pts: [[0, -RING], [0, RING]] },
  { id: "mkt_ew", kind: "market", w: 16, pts: [[-RING, 0], [RING, 0]] },
  // service alleys (cyan on the reference): mid-block cut-throughs between neighbourhoods; none runs to a fort
  { id: "al_nw", kind: "alley", w: 4, pts: [[-150, 78], [-290, 78]], note: "behind Second Chance to Wood Havoc" },
  { id: "al_ne", kind: "alley", w: 4, pts: [[150, 70], [300, 70]], note: "behind Dit Marsh to Flushed" },
  { id: "al_sw", kind: "alley", w: 4, pts: [[-150, -60], [-290, -60]] },
  { id: "al_se", kind: "alley", w: 4, pts: [[150, -82], [300, -82]] },
  { id: "al_n", kind: "alley", w: 4, pts: [[-80, 130], [-80, 240]], note: "past Needle Drop to Astorial" },
  { id: "al_s", kind: "alley", w: 4, pts: [[-60, -125], [-60, -240]], note: "Gnome Ave to the Upper Crust" },
  { id: "al_police", kind: "service", w: 5, pts: [[-20, 240], [20, 240]], note: "the police yard's walk-through where the spur was: pedestrians only" },
  { id: "al_bank", kind: "service", w: 5, pts: [[-290, 240], [-290, 290], [-305.5, 290]], note: "the bank's loading dock" },
  { id: "al_casino", kind: "service", w: 5, pts: [[300, 240], [300, 290], [305.5, 290]], note: "the casino's cash-office yard (under the line's shadow)" },
  { id: "al_museum", kind: "service", w: 5, pts: [[-290, -240], [-290, -290], [-305.5, -290]], note: "the museum's goods yard" },
  { id: "al_hotel", kind: "service", w: 5, pts: [[300, -240], [300, -290], [305.5, -290]], note: "the hotel's service entrance" },
];

// ---- districts (the colour of the neighbourhood: low worn, mid established, high refined) --------------------------
export const Q_DISTRICTS: QDistrict[] = [
  { id: "home", style: "home", label: "HOME BLOCK", rect: R(-49, 49, -49, 49) },
  { id: "low_n", style: "low", label: "LOW: north of the block", rect: R(-150, 150, 49, 130) },
  { id: "low_s", style: "low", label: "LOW: south of the block", rect: R(-150, 150, -125, -49) },
  { id: "low_w", style: "low", label: "LOW: west", rect: R(-150, -49, -49, 49) },
  { id: "low_e", style: "low", label: "LOW: east", rect: R(49, 150, -49, 49) },
  { id: "mid_w", style: "mid", label: "MID: west", rect: R(-290, -150, -125, 130) },
  { id: "mid_e", style: "mid", label: "MID: east", rect: R(150, 300, -125, 130) },
  { id: "mid_n", style: "mid", label: "MID: north", rect: R(-150, 150, 130, 240) },
  { id: "mid_s", style: "mid", label: "MID: south", rect: R(-150, 150, -240, -125) },
  { id: "high_nw", style: "high", label: "HIGH", rect: R(-460, -150, 130, 240) },
  { id: "high_ne", style: "high", label: "HIGH", rect: R(150, 460, 130, 240) },
  { id: "high_w", style: "high", label: "HIGH", rect: R(-460, -290, -125, 130) },
  { id: "high_e", style: "high", label: "HIGH", rect: R(300, 460, -125, 130) },
  { id: "high_sw", style: "high", label: "HIGH", rect: R(-460, -150, -240, -125) },
  { id: "high_se", style: "high", label: "HIGH", rect: R(150, 460, -240, -125) },
  { id: "high_n", style: "high", label: "HIGH: north shore", rect: R(-150, 150, 240, 335) },
  { id: "high_s", style: "high", label: "HIGH: south shore", rect: R(-150, 150, -335, -240) },
  { id: "sp_bank", style: "special", label: "BANK PRECINCT", rect: R(-460, -150, 240, 335) },
  { id: "sp_casino", style: "special", label: "CASINO PRECINCT", rect: R(150, 460, 240, 335) },
  { id: "sp_museum", style: "special", label: "MUSEUM PRECINCT", rect: R(-460, -150, -335, -240) },
  { id: "sp_hotel", style: "special", label: "HOTEL PRECINCT", rect: R(150, 460, -335, -240) },
];

// ---- the plots ------------------------------------------------------------------------------------------------------
// Store footprints: the originals average 115 m2 of plot (~105 m2 of floor). R15's rule is about twice the usable
// floor, so a standard Queens store is 15 x 16 m (usable ~222 m2: 2.2x); a high-end one 16 x 16 (~237: 2.3x, room for
// cases and a guard). Specialists are flagged where a yard or workshop makes them bigger.
export const Q_PLOTS: QPlot[] = [
  { id: "home", kind: "market", name: "THE MARKET (sell, buy, craft, upgrade + the board)", rect: R(-Y, Y, -Y, Y), door: [0, -36] },
  // ---- LOW (6): a PINWHEEL across the ring road (each fort's back gate faces its own nearest low store, ~20 m away
  //      across the road: equal by construction) and two more on the market streets (shared by two forts each) ----
  { id: "screwloose", kind: "store", tier: "low", keepsId: "lastscrew", name: "SCREW LOOSE HARDWARE", rect: R(-66, -51, 16, 32), door: [-50, 24], back: [-58.5, 32.5],
    theme: "timber, tools, screws, tape", signature: "the forty-foot ladder nobody can carry upright", materials: ["timber", "metal", "fasteners", "chemicals"] },
  { id: "crumbs", kind: "store", tier: "low", keepsId: "crumbs", name: "CRUMBS & CONSEQUENCES", rect: R(16, 32, 51, 66), door: [24, 50], back: [32.5, 58.5],
    theme: "mini-mart food, packaging, batteries", signature: "the pyramid of off-brand cola", materials: ["food", "electronics", "fabric"] },
  { id: "rustbucket", kind: "store", tier: "low", keepsId: "rustbucket", name: "RUST BUCKET SALVAGE", rect: R(51, 73, -34, -14), door: [50, -24], back: [62, -34.5],
    theme: "scrap metal, timber, parts (a fenced scrap yard behind)", signature: "the car door that still has a parking ticket", materials: ["metal", "timber", "rubber", "fasteners"],
    flag: "specialist: a scrap yard (22 x 20) beside a small office" },
  { id: "plugpray", kind: "store", tier: "low", keepsId: "plugpray", name: "PLUG & PRAY REPAIRS", rect: R(-32, -16, -66, -51), door: [-24, -50], back: [-32.5, -58.5],
    theme: "broken appliances, wire, electronics", signature: "the microwave that only plays polka", materials: ["electronics", "metal", "fasteners"] },
  { id: "wheelie", kind: "store", tier: "low", name: "WHEELIE DODGY CYCLES", rect: R(-24, -9, 88, 104), door: [-8, 96], back: [-16.5, 104.5],
    theme: "bicycles, chains, wheels", signature: "a tandem with one seat", materials: ["metal", "rubber", "fasteners"] },
  { id: "potluck", kind: "store", tier: "low", name: "POT LUCK GARDEN CENTRE", rect: R(9, 29, -104, -86), door: [8, -95], back: [19, -104.5],
    theme: "plants, gnomes, tools, garden supplies (an open-air yard)", signature: "the gnome with a getaway plan", materials: ["timber", "chemicals", "rubber"],
    flag: "specialist: half of it is an outdoor plant yard" },
  // ---- MEDIUM (5): one block further out ----
  { id: "secondchance", kind: "store", tier: "mid", keepsId: "secondchance", name: "SECOND CHANCE HOMEWARES", rect: R(-174, -159, 52, 68), door: [-158.5, 60], back: [-166.5, 68.5],
    theme: "furniture, lamps, appliances", signature: "the sofa shaped like a mouth", materials: ["fabric", "timber", "electronics"] },
  { id: "spinsin", kind: "store", tier: "mid", keepsId: "spincycle", name: "SPIN & SIN LAUNDRETTE", rect: R(159, 174, -68, -52), door: [158.5, -60], back: [166.5, -68.5],
    theme: "machines, lost property, clothing", signature: "the lost-property bin (nobody knows what's in it)", materials: ["fabric", "metal", "electronics"] },
  { id: "needledrop", kind: "store", tier: "mid", keepsId: "needledrop", name: "NEEDLE DROP RECORDS", rect: R(-67.5, -52.5, 139, 155), door: [-60, 138.5], back: [-60, 155.5],
    theme: "records, audio gear, collectibles", signature: "the jukebox that only takes buttons", materials: ["electronics", "luxury"] },
  { id: "peakfomo", kind: "store", tier: "mid", keepsId: "peakfomo", name: "PEAK FOMO OUTDOORS", rect: R(92.5, 107.5, -150, -134), door: [100, -133.5], back: [100, -150.5],
    theme: "camping gear, straps, tents", signature: "the tent that's bigger inside (it isn't)", materials: ["fabric", "rubber", "metal"] },
  { id: "pastprime", kind: "store", tier: "mid", name: "PAST ITS PRIME ANTIQUES", rect: R(-141, -126, -193, -177), door: [-141, -185], back: [-125.5, -185],
    theme: "clocks, furnishings, collectibles", signature: "the grandfather clock that's actually a grandmother", materials: ["timber", "luxury", "metal"] },
  // ---- HIGH (5): the outer premium streets ----
  { id: "caratrun", kind: "store", tier: "high", keepsId: "caratrun", name: "CARAT & RUN", rect: R(-238, -222, 249, 265), door: [-230, 247.5], back: [-230, 265.5],
    theme: "jewellery and extravagant display pieces", signature: "the DIAMOND PIGEON", materials: ["luxury", "metal"] },
  { id: "tickedoff", kind: "store", tier: "high", keepsId: "tickedoff", name: "TICKED OFF WATCHES", rect: R(92, 108, 249, 265), door: [100, 247.5], back: [100, 265.5],
    theme: "watches and precision parts", signature: "the cuckoo clock that sounds the alarm itself", materials: ["luxury", "metal", "fasteners", "electronics"] },
  { id: "maisonpong", kind: "store", tier: "high", keepsId: "maisonpong", name: "MAISON PONG", rect: R(-314, -298, 52, 68), door: [-297.5, 60], back: [-314.5, 60],
    theme: "perfume and luxury cosmetics", signature: "EAU DE BIN, the flagship scent", materials: ["luxury", "chemicals"] },
  { id: "guccio", kind: "store", tier: "high", name: "GUCCIO GARBAGE", rect: R(308, 324, -68, -52), door: [307.5, -60], back: [324.5, -60],
    theme: "designer fashion and accessories", signature: "the handbag made of a real bin bag ($900)", materials: ["luxury", "fabric", "rubber"] },
  { id: "uppercrust", kind: "store", tier: "high", name: "THE UPPER CRUST", rect: R(-68, -52, -265, -249), door: [-60, -247.5], back: [-60, -265.5],
    theme: "luxury deli, cheese vault, giftware", signature: "the wheel of cheese with its own security guard", materials: ["food", "luxury"] },
  // ---- SPECIAL (4): the corner precincts (plots reserved now; the bank works first) ----
  { id: "bank", kind: "landmark", name: "FIRST NATIONAL BANK OF BOXES", rect: R(-445, -306, 249, 322), door: [-375, 247.5], back: [-305.5, 290],
    theme: "public lobby, restricted counting room, the vault: heavy money bags", signature: "the vault door on a novelty key ring", materials: ["luxury", "metal"] },
  { id: "casino", kind: "landmark", name: "THE LUCKY LOSER CASINO", rect: R(306, 445, 249, 322), door: [375, 247.5], back: [305.5, 290],
    theme: "the floor (no real-money games), monitored valuables, the cash office", signature: "the slot machine that pays out in coupons", materials: ["luxury", "electronics", "metal"] },
  { id: "museum", kind: "landmark", name: "THE MUSEUM OF QUESTIONABLE HISTORY", rect: R(-445, -306, -322, -249), door: [-375, -247.5], back: [-305.5, -290],
    theme: "galleries, the gift shop, guarded collectibles, oversized exhibits", signature: "a dinosaur made of shopping trolleys", materials: ["luxury", "timber", "metal"] },
  { id: "hotel", kind: "landmark", name: "THE GRAND OVERLOOK-ISH HOTEL", rect: R(306, 445, -322, -249), door: [375, -247.5], back: [305.5, -290],
    theme: "the lobby, service routes, a few guest floors, the penthouse suite", signature: "the luggage trolley piled with someone's whole life", materials: ["luxury", "fabric", "electronics"] },
  // ---- FACILITIES (not counted among the stores) ----
  { id: "police", kind: "facility", name: "THE 1-1-4th PRECINCT (police)", rect: R(-40, 40, 140, 230), door: [0, 138.5], back: [0, 230.5] },
  { id: "pub", kind: "reserved", name: "SOGGY SHAMROCK (reserved: moves here later)", rect: R(-451, -385, -205, -150), door: [-452, -178] },
  { id: "club", kind: "reserved", name: "NEON FEVER (reserved: moves here later)", rect: R(385, 451, 150, 205), door: [452, 178] },
];

// ---- the elevated line (scenery first: a cosmetic train, no riding) ------------------------------------------------
export const Q_RAIL = {
  name: "THE QUEENS ELEVATED LINE",
  /** the centre line, north edge to south edge, on the casino side; the casino and the hotel are east of it */
  pts: [[190, 345], [250, 120], [272, -345]] as XZ[],
  deckW: 8, deckY: 7.5,
  /** columns every this many metres or less, never on a lane, a pavement, a path or inside a business plot */
  maxColumnGap: 32,
};

// ---- materials, loot budget (PROPOSED tuning: Stage 3 measures and adjusts) ----------------------------------------
export const Q_MATERIALS: Material[] = ["timber", "metal", "fabric", "fasteners", "electronics", "rubber", "chemicals", "luxury", "food"];
/** each cycle's shelf value split by tier (the market's junk pile is extra and small); more stores do NOT add money */
export const Q_VALUE_SHARE = { low: 0.22, mid: 0.28, high: 0.3, landmark: 0.2 } as const;
