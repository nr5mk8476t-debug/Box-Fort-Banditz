import { hyp } from "./fmath.js";
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
  off?: boolean
  /** C4b: a wall covered in background graffiti (looks only) */
  art?: boolean;
  /** C5a: a chain-link fence (drawn see-through) */
  chain?: boolean;
  /** C5a: collision only: something else draws it (tents, the water tank, the map board, the practice dummy...) */
  hide?: boolean;
  /** C5c: the Mayor's statue's plinth: tagging it is worth 5 aura (and big heat) */
  mayor?: boolean;
  /** C5b: a Chinatown shophouse (curved tiled roof, eaves, lanterns, a hanging sign) */
  china?: { roof: string; sign2: string };
  /** C2: a street building's ground floor: a shopfront (glass, door, awning) or a tower lobby */
  front?: "shop" | "lobby";
  /** C5c.3: THE COMPACTOR's dance floor (the crusher bed): its height follows the club clock (see applyClubFloor) */
  pump?: boolean;
  /** C5c.3: the renderer dresses this box up as something particular (a speaker stack, a trash bale, a car cube...) */
  deco?: string;
  /** C5c.3: a conveyor belt: what's standing on it gets carried along at this velocity (m/s on x, z) */
  belt?: [number, number];
  /** R4: a Little Italy building (shutters, flower boxes, a terracotta roof, striped awnings) */
  italy?: boolean;
  /**
   * R3: an angled footprint: a convex polygon on x/z (counter-clockwise, see polyBox). x/z/w/d are then
   * its bounding box (the broadphase uses that); every collision test uses the real shape. Turned
   * buildings, wedges and triangles are made with rotBox / polyBox.
   */
  poly?: [number, number][];
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
  | "hydrant" | "mailbox" | "bikerack" | "board" | "pot" | "bags" | "pallet" | "portaloo" | "mixer" | "trolley"
  // C5b: Chinatown's street stalls
  | "steamer" | "fishtank" | "trinkets"
  // R4: Little Italy's (Chinatown's mirror: the same loot value spot for spot)
  | "pizzacart" | "ricordi" | "deli" | "gelato"
  // C5c: the bank's vault door (it swings open: the box stops blocking), deposit boxes, the WANTED screen's control box
  | "vaultdoor" | "depositbox";

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
  | "shopglass" | "busstop" | "hydrant" | "mailbox" | "bench" | "planter" | "table" | "pallet"
  // C4b: the laundromat's machines (E: open quietly, slowly; punch: force it, loud)
  | "washer" | "dryer"
  // C5a: the lobby squat's practice gear and mini-game buttons
  | "dummy" | "throwgame" | "racegame"
  // C5b: Chinatown: a dumpling steamer cart (E: grab a bite), a souvenir stall (E), a live-seafood tank (punch: SPLASH)
  | "steamer" | "trinkets" | "fishtank"
  // R4: Little Italy: a pizza cart and a gelato cart (E: grab one), a souvenir stall (E), a deli counter (punch: SMASH)
  | "pizzacart" | "ricordi" | "gelato" | "deli"
  // C5c: the bank (its vault door, safety deposit boxes), the Mayor's statue's gold nose, the WANTED screen's
  // control box, and the golden stashes hidden at every landmark
  | "vaultdoor" | "depositbox" | "nose" | "stash"
  | "podium" | "cloakroom" | "dessertcart" | "piano" | "chefstable" | "kitchen"
  // C5c.3: THE COMPACTOR (the bouncer's rope, the DJ's decks in the crane cab, the conveyor bar, the cash safe, the
  // DJ's rider, the staff lockers, the sorting bin, a VIP booth) and PAWN-O-RAMA (Sal's counter, the pawn case)
  | "clubrope" | "djdecks" | "clubbar" | "clubsafe" | "rider" | "lockers" | "sortbin" | "vipbooth"
  | "mocktail" // (R11: NEON FEVER DREAM's bar: a glowing cartoon mocktail, a dance-energy boost)
  | "pawncounter" | "pawncase"
  // R6: the new station's holding cell
  | "toilet" | "celldoor"
  // R7: the walk-in pawn shops' glass counters (smash one: the bouncer comes; nothing to steal in them)
  | "glasscounter"
  // R8: glass doors (E: open / close; NPCs open them)
  | "door"
  // R11.4: SKETCHY STEVE's goods (in his open briefcase: one each)
  | "dealgoods"
  // R12.1: THE SOGGY SHAMROCK: the GUZZLE'S taps (E: a pint, then split the G) and the chalkboard of the best splits
  | "pinttap" | "pubboard"
  // R12.2c: SEAMUS O'SHORTLY (E: a word with him: a tip, a job for a pot of gold); R12.2b: the jukebox
  | "seamus" | "jukebox" | "pooltable" | "dartsoche"
  // R12.6: WEE MICKEY at the pub's cellar door (E with loot in your hands: he fences it, at night) and his gear on a keg
  | "mickey" | "mickgoods";
export interface PropDef {
  id: string; kind: PropKind; x: number; y: number; z: number; yaw: number; shop?: number; color?: string;
  /** C4a: the arena box this prop is (breakables): index into ArenaLayout.boxes */
  box?: number;
  /** C4a: half-size of its footprint (for reach checks on long things like benches and shop windows) */
  hw?: number; hd?: number;
  /** C5c: what a golden stash holds */
  loot?: string[];
  /** R11.4: a door's look (glass by default; a painted panel; the green steel fire exit) and, for a one-way door, the
   *  way out (a unit vector): from that side there's no handle; such a door swings shut by itself */
  door?: "glass" | "solid" | "exit" | "wood"; oneWay?: [number, number];
  /** R12.9: a door that swings shut by itself this many seconds after it's opened (not while someone's in the doorway) */
  closer?: number;
  /** R11.4: which of STEVE's goods */
  sell?: DealKind;
  /** R12.6: which of WEE MICKEY's gear */
  gear?: GearKind;
}
/**
 * R12.6: WEE MICKEY, the night fence at THE SOGGY SHAMROCK's cellar door (Blake: "Night fence + gear"). After dark he buys
 * the loot in your hands for more than the pawn shops (x0.75 of what it's worth; they pay x0.4), black-market pieces
 * too (the legit shops won't touch them), but every deal is a little heat (more if a cop sees). He sells two bits of
 * cartoon gear, one of each at a time: a LOCKPICK KIT (your next stretch in the cells is halved) and a SMOKE BOMB (it
 * goes off by itself the next time a cop grabs or tasers you: you slip away in the smoke). By day: "come back when it's
 * dark". Hit him and he shuts up shop for a while.
 */
export type GearKind = "pick" | "smoke";
export const MICKEY = {
  fence: 0.75, black: 0.9, heat: 6, copHeat: 18, copRange: 25, sulk: 45, reach: 2.4,
  goods: {
    pick: { name: "LOCKPICK KIT", price: 30, what: "your next stretch in the cells is halved" },
    smoke: { name: "SMOKE BOMB", price: 25, what: "the next cop who grabs or tasers you gets a face full of smoke" },
  } as Record<GearKind, { name: string; price: number; what: string }>,
};
/** R11.4: SKETCHY STEVE's goods */
export type DealKind = "zoomies" | "beef" | "floaty";
export const DEAL = {
  price: 15, comedown: 4, copRange: 14, away: 25, heat: 6,
  goods: {
    zoomies: { name: "ZOOMIES", what: "speed", time: 20 },
    beef: { name: "BEEF JUICE", what: "strength", time: 20 },
    floaty: { name: "FLOATY FIZZ", what: "float", time: 8 },
  } as Record<DealKind, { name: string; what: string; time: number }>,
};

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
  /** R6 (the new city): one big holding cell everybody shares: where you land in it, its locked door (E: pick the
   *  lock), the toilet you can flush, the shower corner (white subway tiles), the reception and the breakroom */
  holding?: { cell: Rect; spots: { x: number; z: number }[]; door: { x: number; z: number }; toilet: { x: number; z: number };
    shower: Rect; reception: Rect; breakroom: Rect; champ: { x: number; z: number; yaw: number } };
  /** R7 (the new city): the grand station: the lobby, the hallway, the interrogation rooms, booking; the walkable first
   *  floor (offices, the chief's corner office, the evidence room where confiscated loot ends up: lift it = heat) */
  grand?: {
    lobby: Rect; hall: Rect; interrogation: Rect[]; booking: Rect; stairs: Rect;
    upY: number; upstairs: Rect; chief: Rect; offices: Rect[];
    evidence: Rect; evidenceSpots: { x: number; y: number; z: number }[]; evidenceDoor: { x: number; z: number };
    /** where the station's own cops walk (ground floor beat, the evidence guard's spot upstairs) */
    beats: { pts: { x: number; z: number }[]; y: number }[];
    /** R8: the real glass windows in the outside walls (u: x on the front N / back S, metres in from the front on
     *  the sides E / W; y0..y1 above the ground) */
    windows: { face: "N" | "S" | "E" | "W"; u0: number; u1: number; y0: number; y1: number }[];
    /** R8: where the holding cell's key sits each morning (on the chief's desk) */
    keySpot: { x: number; y: number; z: number };
  };
}

/** R7: one of the two walk-in pawn shops (left: Twitchy Lou's HOT STUFF; right: its mirror). You sell over the till
 *  counter; the glass counters keep you off the owner's side; the bouncer only comes if you start trouble. */
export interface HotShop {
  idx: number; name: string; owner: "lou" | "fran"; bouncer: "meat_locker" | "cold_cuts";
  /** the whole building; its front faces -z (Gahookz Ghetto Lane) */
  rect: Rect;
  /** the customers' side and the owner's side of the glass counters */
  floor: Rect; back: Rect;
  /** the door (R7: round the side, on the avenue), just inside it, and where you stand at the till */
  door: { x: number; z: number }; doorIn: { x: number; z: number }; stand: { x: number; z: number };
  boss: { x: number; z: number; yaw: number }; guard: { x: number; z: number; yaw: number };
  /** just outside the door (where the bouncer throws you) */
  out: { x: number; z: number };
  counters: Rect[];
  armour: { x: number; z: number; yaw: number };
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
  /** R12.8: bumped whenever a box is switched off or on (the cached "what still blocks" lists know they're stale) */
  offGen?: number;
  boxes: Box[];
  spawns: { x: number; z: number; yaw: number }[];
  /** loot spawn points (Phase 2+) */
  lootSpawns?: SpawnPoint[];
  forts?: FortLot[];
  // Phase 3.5: the bigger city
  roads?: Rect[];
  /** C1: round road surfaces (the roundabout): r0..r1 from the centre */
  roadRings?: { x: number; z: number; r0: number; r1: number }[];
  /** R2 (road test): diagonal road surfaces, as segments with a half-width */
  roadSegs?: { ax: number; az: number; bx: number; bz: number; hw: number }[];
  /** which city this is ("new" = the R3 city; undefined = the classic city) */
  variant?: string;
  /** R3: the south edge, when the map runs further south than -halfSize (the fort bowl) */
  southZ?: number;
  /** R3: the empty landmark lots (north of Snob Row) for Blake to place the big landmarks on */
  lots?: { name: string; rect: Rect }[];
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
  decor?: { kind: "streetlight" | "hydrant" | "dash" | "zebra" | "grass" | "copcar" | "cone" | "wetfloor" | "scaffold" | "umbrella" | "streetsign"; x: number; z: number; w?: number; d?: number; h?: number; yaw?: number; text?: string;
    /** R3: a street sign's second blade (its yaw; text is "FIRST|SECOND") */
    yaw2?: number }[];
  // Slice 2A
  /** shallow water (the pond): you wade slowly, pedestrians walk around it */
  water?: Rect[];
  /** extra walking routes for pedestrians (e.g. into shops): consecutive points are linked,
   *  the first point also links to the nearest street route points */
  navChains?: { x: number; z: number }[][];
  units?: UnitDef[];
  /** C1.1: people who stand at a spot (the apartment tower's doorman) */
  posts?: { kind: "doorman" | "fisherman" | "old_lady" | "uncle_dumpster" | "bank_guard" | "maitre_d" | "bouncer" | "vinnie" | "lou" | "meat_locker" | "champ" | "fran" | "cold_cuts" | "receptionist" | "don" | "velvet_guard" | "sketchy_steve" | "barman" | "regular" | "trad_band" | "patron" | "barmaid" | "leprechaun" | "lep_buddy" | "drunk_dancer" | "wee_mickey"; x: number; z: number; yaw: number;
    /** R12.1: which one (the regulars, the band's four), and sitting down (stool, bench) */
    v?: number; sit?: number;
    /** C5a: standing height (Uncle Dumpster lives on a rooftop) */
    y?: number;
    /** C4b: where she leans out of her window (the old lady) */
    window?: { x: number; y: number; z: number } }[];
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
  scenery?: { kind: "highway" | "rail" | "canal" | "light" | "grassdisc" | "pillar" | "clock" | "ladder" | "lamp" | "walk" | "viaduct"; x: number; z: number; w?: number; d?: number; h?: number; r?: number; yaw?: number; node?: number; approach?: number }[];
  /** C5a: the lobby: a rooftop squat just past the south edge of town where you wait for the match */
  lobby?: LobbyDef;
  /** C5c: the Trashington Bank (the renderer dresses it; the rules put the vault's gold in each morning) */
  bank?: { rect: Rect; vault: Rect; vaultSpots: { type: string; x: number; y: number; z: number }[]; keycardSpots: { x: number; y: number; z: number }[]; door: { x: number; z: number }; cols?: [number, number][] };
  /** C5c.2: LE DUMPSTÈRE: the building, the front door (the maître d's rule: x/z rect just inside it, where you get
   *  pushed back to), the dining room, the kitchen (its back door), the stairwell to the rooftop terrace */
  /** C5c.3: THE COMPACTOR nightclub: the building, the main hall, the backstage wing, the front door (and where the
   *  bouncer puts you), the crusher-bed dance floor, the DJ's crane cab, the manager's office, the conveyor, the roofs */
  club?: { rect: Rect; hall: Rect; wing: Rect; door: Rect; out: { x: number; z: number; yaw: number }; floor: Rect; cab: Rect; cabY: number;
    office: Rect; belt: Rect; beltY: number; balcony: Rect; balconyY: number; wingY: number; roofY: number; stack: { x: number; z: number; r: number; h: number } };
  /** C5c.3: PAWN-O-RAMA ("Honest" Sal's shop in the Yards): its unit and the pawn case (where pawned things sit) */
  pawnShop?: { unit: number; shop: number; caseX: number; caseY: number; caseZ: number; yaw: number };
  /** R5: the police station's upper storeys (R7: from y0 the outside is dressed; you can walk about inside it up to
   *  walkTop, above that a hidden box keeps you out) */
  stationUpper?: { rect: Rect; y0: number; y1: number; face: [number, number]; walkTop?: number };
  /** R7: the two walk-in pawn shops (the new city) */
  hotShops?: HotShop[];
  /** R11: NEON FEVER DREAM, the nightclub on Market Row (the new city): three levels round an open atrium */
  fever?: FeverDef;
  pub?: PubDef;
  /** C5c.3: indexes of the boxes that pump (the dance floor) */
  pumpBoxes?: number[];
  resto?: { rect: Rect; door: Rect; out: { x: number; z: number; yaw: number }; hall: Rect; kitchen: Rect; stairs: Rect; roofY: number };
  /** C5c: the Mayor's Golden Statue (for the renderer) */
  statue?: { x: number; z: number; plinthH: number; yaw: number };
  /** C5b: Chinatown: the street (for the renderer's lanterns and the dragon parade's route), its two gates */
  chinatown?: { street: Rect; gates: { x: number; z: number; w: number }[]; lanternRows: number[]; route: { x: number; z: number }[] };
  /** R4: Little Italy (Chinatown's mirror on the new map): the street, its two arches, the rows of café lights over it */
  littleItaly?: { street: Rect; gates: { x: number; z: number; w: number }[]; lanternRows: number[]; route: { x: number; z: number }[] };
  /** named places, used by tests and tutorials */
  landmarks?: Record<string, { x: number; z: number; yaw: number; [extra: string]: number }>;
}

/**
 * C5a: the rooftop squat (lobby). Players wait here before the match (and practise); when the host starts,
 * everyone goes to their fort. It sits just outside the city's edge, high up, looking north over the city.
 */
export interface LobbyDef {
  /** the roof (players can be here even though it's past the city's edge) */
  rect: Rect;
  /** roof height */
  y: number;
  spawns: { x: number; z: number; yaw: number }[];
  /** the painted city map (on the water tank's board) */
  map: { x: number; y: number; z: number; w: number; h: number; yaw: number };
  /** the trolley race: pass the checkpoints in order dragging a trolley (start/finish = checkpoint 0) */
  race: { x: number; z: number; r: number }[];
  /** the throw game's targets (bin lids thrown at them score by how close to the middle) */
  targets: { id: string; x: number; y: number; z: number; r: number; yaw: number }[];
  /** the free-stuff pile (it refills while you wait) */
  pile: { x: number; z: number };
  /** where the bin lids for the throw game are stacked, the trolley bay, the spray can for the tag wall */
  lids: { x: number; z: number };
  trolleys: { x: number; z: number }[];
  cans: { x: number; z: number };
  /** decoration the renderer draws (collision boxes are in the arena's boxes) */
  tents: { x: number; z: number; w: number; d: number; yaw: number; color: string }[];
  fire: { x: number; z: number };
}

/** C5a: on the lobby roof (x/z inside it)? */
export function inLobby(arena: ArenaLayout, x: number, z: number, pad = 0): boolean {
  const l = arena.lobby;
  return !!l && x >= l.rect.minX - pad && x <= l.rect.maxX + pad && z >= l.rect.minZ - pad && z <= l.rect.maxZ + pad;
}

/** On the road surface (straight roads or the roundabout ring)? */
export function onRoadAt(arena: ArenaLayout, x: number, z: number, pad = 0): boolean {
  const roads = arena.roads;
  if (roads) for (let i = 0; i < roads.length; i++) { const r = roads[i]; if (x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad) return true; }
  const rings = arena.roadRings;
  if (rings) for (const g of rings) { const d = hyp(x - g.x, z - g.z); if (d >= g.r0 - pad && d <= g.r1 + pad) return true; }
  const segs = arena.roadSegs;
  if (segs) for (const s of segs) if (segDist(x, z, s.ax, s.az, s.bx, s.bz) <= s.hw + pad) return true;
  return false;
}

/** Distance from (x, z) to the segment a-b. */
export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
  return hyp(x - (ax + vx * t), z - (az + vz * t));
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

/** R12.8: every box rebuilt in ONE shape (every field, the same order). The city's ~3,900 boxes came in 25 shapes
 *  (each builder adds its own optional fields), which made every collision check's reads "megamorphic": V8 falls back to a
 *  generic lookup that hands back a NEW heap number for each decimal field it reads. That was most of the game's garbage
 *  (~1.6 KB per ground check, thousands a tick). Done once, at the end of the build; nothing holds the old objects (props
 *  and the club floor keep indices). Absent fields stay undefined, as before. */
export function canonBoxes(boxes: Box[]): Box[] {
  return boxes.map((b) => ({
    x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: b.d, kind: b.kind, poly: b.poly, off: b.off, belt: b.belt, pump: b.pump, unit: b.unit,
    hide: b.hide, color: b.color, sign: b.sign, windows: b.windows, face: b.face, art: b.art, chain: b.chain, mayor: b.mayor,
    china: b.china, front: b.front, deco: b.deco, italy: b.italy,
  }));
}

export function box(x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], baseY = 0): Box {
  return { x, y: baseY + h / 2, z, w, h, d, kind };
}

// ---------------------------------------------------------------------------------------
// R3: angled footprints. A box with `poly` is an upright prism on a convex polygon; the rest of
// the game asks the helpers below instead of assuming an x/z rectangle.

/** An upright prism on a convex polygon (x/z points in either winding; stored counter-clockwise). */
export function polyBox(pts: [number, number][], h: number, kind: Box["kind"], baseY = 0): Box {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length]; area += ax * bz - bx * az; }
  const poly = (area < 0 ? [...pts].reverse() : [...pts]).map(([x, z]) => [x, z] as [number, number]);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { ...box((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, h, kind, baseY), poly };
}

/** A w x d rectangle turned by `yaw` (the same yaw as everything else: 0 = facing +z) round (cx, cz). */
export function rotBox(cx: number, cz: number, w: number, d: number, yaw: number, h: number, kind: Box["kind"], baseY = 0): Box {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  return polyBox([at(-w / 2, -d / 2), at(w / 2, -d / 2), at(w / 2, d / 2), at(-w / 2, d / 2)], h, kind, baseY);
}

/**
 * Signed distance from (x, z) to a box's footprint (negative inside), and the direction out of it
 * (the outward normal of the nearest face when inside; toward the point when outside).
 */
/** (R12.8: footSd's answer. One object, reused: read it before the next call. It ran thousands of times a tick, and a
 *  new object each time was a big part of the game's garbage.) */
const SD = { d: 0, nx: 0, nz: 0 };
const sd = (d: number, nx: number, nz: number) => { SD.d = d; SD.nx = nx; SD.nz = nz; return SD; };
export function footSd(b: Box, x: number, z: number): { readonly d: number; readonly nx: number; readonly nz: number } {
  if (!b.poly) {
    const minX = b.x - b.w / 2, maxX = b.x + b.w / 2, minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
    const cx = x < minX ? minX : x > maxX ? maxX : x, cz = z < minZ ? minZ : z > maxZ ? maxZ : z;
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 > 1e-20) { const d = Math.sqrt(d2); return sd(d, dx / d, dz / d); }
    const left = x - minX, right = maxX - x, back = z - minZ, front = maxZ - z, m = Math.min(left, right, back, front);
    if (m === left) return sd(-left, -1, 0);
    if (m === right) return sd(-right, 1, 0);
    if (m === back) return sd(-back, 0, -1);
    return sd(-front, 0, 1);
  }
  const P = b.poly, n = P.length;
  let inside = true, maxDot = -Infinity, mnx = 0, mnz = 0;
  let best = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    const A = P[i], C = P[i + 1 === n ? 0 : i + 1], ax = A[0], az = A[1], cx = C[0], cz = C[1];
    const ex = cx - ax, ez = cz - az, len = hyp(ex, ez) || 1;
    const onx = ez / len, onz = -ex / len; // outward (counter-clockwise winding)
    const dot = (x - ax) * onx + (z - az) * onz;
    if (dot > 0) inside = false;
    if (dot > maxDot) { maxDot = dot; mnx = onx; mnz = onz; }
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (len * len)));
    const px = ax + ex * t, pz = az + ez * t, d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best) { best = d2; bx = px; bz = pz; }
  }
  if (inside) return sd(maxDot, mnx, mnz);
  const d = Math.sqrt(best) || 1e-9;
  return sd(d, (x - bx) / d, (z - bz) / d);
}

/** Is (x, z) within `pad` of the footprint? (Plain boxes: the old square test, so nothing changes for them.) */
export function inFoot(b: Box, x: number, z: number, pad = 0): boolean {
  if (!b.poly) return Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
  return footSd(b, x, z).d < pad;
}

/** A box's side faces: each edge of the footprint with its outward normal, length and middle. */
export function footFaces(b: Box): { ax: number; az: number; bx: number; bz: number; nx: number; nz: number; len: number; mx: number; mz: number }[] {
  const P: [number, number][] = b.poly ?? [[b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z + b.d / 2], [b.x - b.w / 2, b.z + b.d / 2]];
  return P.map(([ax, az], i) => {
    const [bx, bz] = P[(i + 1) % P.length], len = hyp(bx - ax, bz - az) || 1;
    return { ax, az, bx, bz, nx: (bz - az) / len, nz: -(bx - ax) / len, len, mx: (ax + bx) / 2, mz: (az + bz) / 2 };
  });
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
interface Grid { cells: Map<number, number[]>; cellBoxes: Map<number, Box[]>; boxes: Box[]; stamp: Uint32Array; gen: number;
  /** R12.8: the lists for spans of cells, kept (callers never change a list they're given) */ spans: Map<number, Box[]> }
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
    g = { cells, cellBoxes, boxes: arena.boxes, stamp: new Uint32Array(arena.boxes.length), gen: 0, spans: new Map() };
    grids.set(arena, g);
  }
  return g;
}
const NONE: Box[] = [];

/** Boxes whose footprint could touch the square (x +- r, z +- r), in original order. */
export function nearBoxes(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  const all = nearBoxesAll(arena, x, z, r);
  if (!arena.offCount) return all;
  // (C4a: smashed things don't block. R12.8: the filtered list kept until something's smashed or put back)
  const gen = arena.offGen ?? 0, hit = offLists.get(all);
  if (hit && hit.gen === gen && hit.arena === arena) return hit.out;
  const out = all.filter((b) => !b.off);
  offLists.set(all, { gen, arena, out });
  return out;
}
const offLists = new WeakMap<Box[], { gen: number; arena: ArenaLayout; out: Box[] }>();

/** C4a: switch a box off (smashed) or back on, keeping the arena's count right. */
export function setBoxOff(arena: ArenaLayout, i: number, off: boolean) {
  const b = arena.boxes[i];
  if (!b || !!b.off === off) return;
  b.off = off;
  arena.offCount = Math.max(0, (arena.offCount ?? 0) + (off ? 1 : -1));
  arena.offGen = (arena.offGen ?? 0) + 1;
}

function nearBoxesAll(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  if (arena.boxes.length < 64) return arena.boxes; // small arenas: not worth it
  const g = gridOf(arena);
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  // (Slice 2A: many more boxes; one cell = a ready-made list, no set/sort)
  if (x0 === x1 && z0 === z1) return g.cellBoxes.get(key(x0, z0)) ?? NONE;
  // (R12.8: the boxes never move, so a span of cells always gives the same list: worked out once, then reused. It was
  //  a new array (and a sort) every collision step of everyone, every tick)
  const sx = x1 - x0, sz = z1 - z0, ck = sx < 8 && sz < 8 ? key(x0, z0) * 64 + sx * 8 + sz : -1;
  if (ck >= 0) { const hit = g.spans.get(ck); if (hit) return hit; }
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
  if (ck >= 0) { if (g.spans.size > 50000) g.spans.clear(); g.spans.set(ck, out); }
  return out;
}

/** A view of the arena holding only the boxes near a point (for one collision step). */
export function localArena(arena: ArenaLayout, x: number, z: number, r: number): ArenaLayout {
  if (arena.boxes.length < 64 && !arena.offCount) return arena;
  // (R12.8: one view per arena, reused: everything else read through to the arena itself. It was a copy of the whole
  //  city layout object, every step of everyone. Only the step that asked for it uses it, before asking again.)
  let v = views.get(arena);
  if (!v) { v = Object.create(arena) as ArenaLayout; views.set(arena, v); }
  v.boxes = nearBoxes(arena, x, z, r);
  return v;
}
const views = new WeakMap<ArenaLayout, ArenaLayout>();

// ---- C5c.3: THE COMPACTOR's crusher-bed dance floor ----------------------------------------------------------
/** The beat bob, and THE DROP: the floor builds up slowly, holds, then slams down and launches everyone on it. */
export const CLUB = { base: 0.3, bob: 0.12, bpm: 124, cycle: 75, build: 6, hold: 0.9, slam: 0.3, top: 1.6, launch: 12, cover: 15, vipAura: 5, djAura: 3, djNoise: 14, djCooldown: 40, beltSpeed: 1.7 };
/** seconds since the last build started -> where we are in the drop ("" = just the beat) */
// ---- R11: NEON FEVER DREAM -------------------------------------------------------------------------------------
/** The club's levels round an open atrium; the set runs off the city clock (everyone hears the same bar). */
export interface FeverArc { x: number; z: number; r0: number; r1: number; a0: number; a1: number; y: number;
  /** R11.5: its backrest (drawn as one smooth curve with the seat; the boxes are collision only): radius in, angles, height, colour */
  back?: { r0: number; a0: number; a1: number; h: number; col: string }; col?: string }
export interface FeverDef {
  /** the whole plot (the walls stand on its edge; the south-west corner is cut off at 45 degrees: `cham` m) */
  rect: Rect; cham: number;
  /** floor 2's top, the roof deck's top */
  y2: number; roofY: number;
  /** the hole up the middle (floor 2: railings and a catwalk; the roof: a glass floor) */
  atrium: Rect; catwalk: Rect; glassFloor: Rect;
  /** the front door (in the cut corner; the bouncer's rope outside it), the fire exit (east): who's let through */
  door: Rect; out: { x: number; z: number; yaw: number }; exit: Rect; exitOut: { x: number; z: number; yaw: number };
  /** the stairs: floor 1 up to 2 (along the north wall, rising east), 2 up to the roof (along the south wall, rising west) */
  stairs1: Rect; stairs2: Rect;
  /** dance floors (floor 1's little one, floor 2's round the atrium, the roof), floor 2's podiums */
  dance1: Rect; dance2: Rect; danceRoof: Rect; stages: Rect[];
  /** R11.1: curved things: the bars (floor 1's island bar under the atrium; R11.3: the roof's island bar, the corner bar gone), the red U-booths and
   *  floor 2's benches (y: the floor they're on). An arc: centre, radii, angles (x = cx + cos a * r, z = cz + sin a * r) */
  bars: FeverArc[]; booths: FeverArc[];
  /** R11.2: the stairs' approach and landing on floor 1, the top-of-stairs landing on floor 2 (both kept clear), the
   *  host stand in the foyer, floor 1's booth tier */
  stairApproach: Rect; landing2: Rect; host: { x: number; z: number }; tier: Rect;
  /** R11.1: floor 1's restrooms (MEN, WOMEN): the room, its doorway */
  restrooms: { room: Rect; door: Rect; name: string }[];
  /** the potted palms (floor y) */
  pots: { x: number; y: number; z: number; r: number }[];
  /** R11.1: DON BINNIE's private lounge on floor 2 (raised; the rope's gap; where his boys shove you to), his throne */
  vip: Rect; vipOut: { x: number; z: number; yaw: number }; throne: FeverArc;
  /** the DJs: TRASH PANDA on floor 2 (in front of the LED wall), LIL PANDA up on the roof (in the pavilion) */
  dj: { x: number; y: number; z: number; yaw: number }; dj2: { x: number; y: number; z: number; yaw: number }; pavilion: Rect;
  /** floor 2's glass bays: over Market Row (west), R11.3 its twin over the alley (east) */
  bay: Rect; bay2: Rect;
  /** R11.3: TRASH PANDA's corner booth (its outline), the roof's smokers' corner (the fire pit), the roof's island bar */
  djBooth: [number, number][]; smoke: { x: number; z: number }; roofBar: FeverArc;
  /** R11.4: the restroom wing (east, where the fire exit was): its door off the floor, the hallway, the spare room;
   *  the back door (the green EXIT under the stairs: one way, out) and the alley behind; SKETCHY STEVE's spot and
   *  where he hides when the cops come */
  wing: Rect; wingDoor: Rect; hall: Rect; backDoor: Rect; alley: Rect;
  /** R11.5: the slatted timber screens (collision lines: x0, z0, x1, z1, y0, y1) */
  slats: [number, number, number, number, number, number][];
  dealer: { x: number; z: number; yaw: number }; dealerHide: { x: number; z: number };
}
/** R11: the set: 128 BPM; 16 bars of groove, 8 of build, 16 of DROP (75 s), round and round */
export const FEVER = { bpm: 128, groove: 16, build: 8, drop: 16, cover: 20, vipAura: 5, donAura: 8, mocktail: 8, boost: 40, danceEvery: 15, danceMax: 3 };
export const FEVER_BAR = (60 / FEVER.bpm) * 4;
export const FEVER_CYCLE = (FEVER.groove + FEVER.build + FEVER.drop) * FEVER_BAR;
/** where the set is at: the part, the bar number in that part, the beat (0..1 through it) */
export function feverAt(clock: number): { part: "groove" | "build" | "drop"; bar: number; t: number; beat: number; k: number } {
  const t = ((clock % FEVER_CYCLE) + FEVER_CYCLE) % FEVER_CYCLE;
  const bars = t / FEVER_BAR, beat = (t / (FEVER_BAR / 4)) % 1;
  if (bars < FEVER.groove) return { part: "groove", bar: Math.floor(bars), t, beat, k: bars / FEVER.groove };
  if (bars < FEVER.groove + FEVER.build) return { part: "build", bar: Math.floor(bars - FEVER.groove), t, beat, k: (bars - FEVER.groove) / FEVER.build };
  return { part: "drop", bar: Math.floor(bars - FEVER.groove - FEVER.build), t, beat, k: (bars - FEVER.groove - FEVER.build) / FEVER.drop };
}

export function clubStage(d: number): "build" | "hold" | "slam" | "" {
  if (d < 0) return "";
  if (d < CLUB.build) return "build";
  if (d < CLUB.build + CLUB.hold) return "hold";
  if (d < CLUB.build + CLUB.hold + CLUB.slam) return "slam";
  return "";
}
/** Height of the dance floor's top. clock: the city clock (seconds); clubB: when the last build started. */
export function clubFloorY(clock: number, clubB: number): number {
  const d = clock - clubB;
  const st = clubStage(d);
  const beat = CLUB.base + CLUB.bob * Math.abs(Math.sin(Math.PI * clock * CLUB.bpm / 60 / 2));
  if (st === "build") { const k = d / CLUB.build; const e = k * k * (3 - 2 * k); return beat + (CLUB.top - beat) * e + 0.03 * Math.sin(d * 40) * k; }
  if (st === "hold") return CLUB.top;
  if (st === "slam") { const k = (d - CLUB.build - CLUB.hold) / CLUB.slam; return CLUB.top + (0.05 - CLUB.top) * k * k; }
  return beat;
}
/** Move the dance floor's collision to the clock (the host before it steps everyone, the client before it predicts). */
export function applyClubFloor(arena: ArenaLayout, clock: number, clubB: number): number {
  const y = clubFloorY(clock, clubB);
  for (const i of arena.pumpBoxes ?? []) { const b = arena.boxes[i]; b.h = y; b.y = y / 2; }
  return y;
}

// ---- R12.1: THE SOGGY SHAMROCK ---------------------------------------------------------------------------------
/** The Irish pub across from the club (the row where CHEESE LOUISE, BREAD PITT BAKERY and BRICK & MORTAR stood): an
 *  old Dublin pub downstairs (the long bar, the snugs, the fire, the session corner), floor 2 built and roped off */
export interface PubDef {
  /** the whole plot (R12.1b: the whole block; its south-east corner, at the crossroads, cut off at 45 degrees: `cham` m) */
  rect: Rect; cham: number; y1: number; y2: number; roofY: number;
  /** the main door (in the cut corner) and where you stand outside it; R12.1b: the side door on the side street */
  door: Rect; out: { x: number; z: number; yaw: number }; door2: Rect; out2: { x: number; z: number; yaw: number };
  /** R12.1b: the horseshoe (its outer edge), the staff's flap, the gantry in the middle, the lane inside; the taps (and
   *  which way each faces the customers) */
  bar: Rect; flap: Rect; gantry: Rect; lane: Rect; taps: { x: number; y: number; z: number; face: [number, number] }[];
  /** the stairs up (along the north wall, rising west) */
  stairs: Rect;
  /** the snugs (one partition between each pair), the fireplace, the band's stage */
  snugs: Rect[]; fire: { x: number; z: number }; stage: Rect;
  /** barrel tables, the window seat's round tables, the window seat, the pavement's barrel tables, the bar stools */
  tables: { x: number; z: number; r: number }[]; rounds: { x: number; z: number; r: number }[]; windowSeat: Rect; outside: { x: number; z: number }[]; stools: { x: number; z: number }[];
  barman: { x: number; z: number; yaw: number };
  /** the bay windows jutting out over the pavement */
  bays: Rect[];
  /** R12.2 upstairs: the balcony (its parts; the corner triangle joins them) and its standing tables, the whiskey snug,
   *  the landing, where SEAMUS O'SHORTLY sits (R12.2c; Mammy's old chair), where his six buddies hang about, the snug's
   *  fire, the two old fellas reading the paper; BIG DESSIE's patch of floor in front of the band */
  balcony: Rect[]; balTables: { x: number; z: number }[];
  /** R12.6: the back yard behind the pub (between the two buildings north of it), the cellar hatch, WEE MICKEY's spot */
  yard?: Rect; hatch?: Rect; mickey?: { x: number; z: number; yaw: number };
  snug2: Rect; hall: Rect; seamus: { x: number; z: number; yaw: number }; buddies: { x: number; z: number }[]; dancer: { x: number; z: number }; snugFire: { x: number; z: number };
  readers: { x: number; z: number; yaw: number }[];
  /** R12.2b (Blake: "a laid back area where you can have fun with your friends"): the island bar under its canopy (its
   *  outer edge, the staff's lane and flap, the back bar in the middle) and the barmaid; the two darts booths (the
   *  board on the west wall, which way it faces, the oche's x, the booth, the scoring podium, the glowing ledge); the
   *  pool area (open to the front room) and its two tables (long along z); the lounge: chesterfields and low tables,
   *  round booths, high tables, the second fire and its wing chairs; the jukebox */
  bar2: Rect; lane2: Rect; flap2: Rect; gantry2: Rect; barmaid: { x: number; z: number; yaw: number };
  darts: { board: { x: number; y: number; z: number }; face: [number, number]; faceX: number; oche: number; booth: Rect; ledge: Rect }[];
  poolArea: Rect; pools: { x: number; z: number; w: number; d: number }[]; poolLedge: Rect;
  sofas: { x: number; z: number; w: number; d: number; yaw: number }[]; lowTables: { x: number; z: number; r: number }[];
  roundBooths: { x: number; z: number; r: number; a0: number; a1: number }[]; highTables: { x: number; z: number }[];
  fire2: { x: number; z: number }; wings: { x: number; z: number; yaw: number }[]; jukebox: { x: number; z: number; yaw: number };
}
/** R12.1: a pint of GUZZLE'S and splitting the G. The glass is 160 mm tall; the line (where the black meets the
 *  cream) starts at 0.86 of it; the G's bar is at 0.62. Hold to gulp: the line drops faster the longer you hold
 *  (`rate` differs pint to pint); let go on the bar. Perfect (4 mm): $15 and the room cheers; close (12 mm): your $6
 *  back; the best 5 of the match on the chalkboard. Every pint makes you tipsier (45 s more, 3 min at most); after 6,
 *  Fergal cuts you off till you're sober */
export const PUB = { price: 6, glassMm: 160, start: 0.86, g: 0.62, rateMin: 0.1, rateMax: 0.12, perfectMm: 1.5, closeMm: 5, prize: 15,
  pour: 30, tipsyAdd: 45, tipsyMax: 180, cutoff: 6, boardN: 5, bpm: 116,
  /** R12.4 (Blake chose "visible G, fair & skilled"): the G faces you the whole time and the drink is smooth: it
   *  eases in over `ease` s, then the line goes down at the pint's own steady `rate` (shown: you see it move), no
   *  hidden surges. When you put it down the head settles: the line carries on a touch, the same way every time (it
   *  slows to a stop, `settle` s worth of the speed it had), so the skill is letting go just before the bar. Perfect
   *  is within 1.5 mm (the gold bar's drawn exactly that thick), close within 5 mm */
  ease: 0.25,
  /** R12.6 (Blake: "Release = result"): the line stops where you let go: no settling on afterwards (it was 0.15 s) */
  settle: 0 };
/**
 * R12.6: the SPLIT THE G CHALLENGE (Blake: "3 pints each, lowest total"): E at the chalkboard opens one; anybody in the
 * pub has `joinT` s to opt in (E at the chalkboard again: in, or back out); with 2+ it starts. Each of you splits
 * `pints` pints (bought at the taps as usual); your misses add up, lowest total wins `prize`. Nobody can hold it up:
 * whoever leaves the pub (more than `leaveR` m off), drops out of the game or hasn't finished by `timeT` s is OUT, and
 * the rest finish without them.
 */
export const GCH = { joinT: 25, timeT: 300, pints: 3, prize: 10, leaveR: 45 };
/** where the line is after drinking for `t` seconds (0..1 of the glass): a smooth ease-in, then steady */
export function pintLevel(t: number, rate: number): number {
  const E = PUB.ease;
  return Math.max(0, PUB.start - rate * (t - E * (1 - Math.exp(-t / E))));
}
/** how fast the line's going down after `t` seconds (glass per second) */
export function pintSpeed(t: number, rate: number): number { return rate * (1 - Math.exp(-t / PUB.ease)); }
/** R12.4: where the line ends up once the head's settled, after letting go at `hold` s; and, `since` s after letting
 *  go, where it is on its way there (it slows exponentially: no jump, done in about half a second) */
export function pintSettled(hold: number, rate: number, since = Infinity): number {
  if (!(PUB.settle > 0)) return pintLevel(hold, rate); // (R12.6: release = result)
  const l = pintLevel(hold, rate), drop = pintSpeed(hold, rate) * PUB.settle;
  return Math.max(0, l - drop * (1 - Math.exp(-since / PUB.settle)));
}
/** how far off the G's bar the line settled (mm) */
export function pintMissMm(hold: number, rate: number): number { return Math.abs(pintSettled(hold, rate) - PUB.g) * PUB.glassMm; }
/** how long to drink so the line settles at `level` (tests, the NPCs): the settled level only goes down with time */
export function pintHoldFor(level: number, rate: number): number {
  let lo = 0, hi = 60;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (pintSettled(m, rate) > level) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export function pintGrade(mm: number): "perfect" | "close" | "miss" { return mm <= PUB.perfectMm ? "perfect" : mm <= PUB.closeMm ? "close" : "miss"; }

/** R12.2b: the upstairs JUKEBOX: E puts on the next tune (a few seconds between changes); every window plays it in time
 *  off the city clock. Three originals. */
export const JUKEBOX = { cd: 3, tunes: ["Soggy Sunday", "Last Bus Home", "Puddle Stomp"] };
/** R12.2c: SEAMUS O'SHORTLY: a tip if he rates you (3+ aura, one every 45 s), else a little job: bring him one of these
 *  for a pot of gold (double what it's worth, $20 at least). Now and then (bonusChance) it's a big job: something rarer,
 *  for the big pot (bonusMult times what it's worth, `bonusMin` at least) */
export const SEAMUS = { tipAura: 3, tipCd: 45, minPay: 20, jobs: ["rubber_chicken", "mixtape", "newspaper", "canned_beans", "baguette", "smelly_fish", "bagel", "disposable_camera", "fancy_cheese", "half_sandwich"],
  bonusChance: 0.2, bonusJobs: ["lucky_pigeon", "lucky_cat", "lottery_ticket", "snow_globe"], bonusMult: 4, bonusMin: 80 };
/** R12.2c: hit anyone in the pub and Seamus's six wee buddies swarm you: they pop out round you (leprechauns), nip at
 *  your ankles (a little damage each, the odd stagger), for `t` seconds; they won't take you below `floor` hp */
export const SWARM = { t: 8, nip: 4, floor: 20, pop: 3.5, stagger: 0.25 };
