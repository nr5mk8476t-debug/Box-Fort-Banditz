// COMPACT QUEENS: the STREET DRESSING planned for the close-up (Stain Way south: the museum corner, the pub, the
// fishmonger, the repair shop, Queasy Blvd; and the home block's west side). Placed for play, not decoration:
//   blocks = it stops sight (vans, the newsstand, solid fences, the scaffold): used by sight.ts;
//   foot   = a player fits through a gap here but a giant doesn't (gaps 0.9-1.1 m: player radius 0.38, the widest
//            giant 1.5 m across);
// everything else (bins, crates, trees, hydrants, awnings, shop displays) you see over or past, and it keeps 2.4 m+
// of pavement clear (the widest planned loot, 1.5 m, plus the player). All PROPOSED: the blockout places them for real.
import { R, type QRect, type XZ } from "./plan.js";

export type DressKind = "van" | "newsstand" | "busshelter" | "fence" | "gap" | "bins" | "crates" | "tree" | "hydrant" | "awning" | "display" | "shutter" | "fireescape" | "scaffold" | "bench" | "barrel" | "sign" | "lamp" | "skip";
export interface Dress { kind: DressKind; rect: QRect; h: number; blocks?: boolean; foot?: boolean; note?: string }
const box = (kind: DressKind, x: number, z: number, w: number, d: number, h: number, extra: Partial<Dress> = {}): Dress => ({ kind, rect: R(x - w / 2, x + w / 2, z - d / 2, z + d / 2), h, ...extra });

/** the close-up's dressing. Stain Way's centre line is x = -118 (kerbs at -114 / -122, shopfronts at -110 / -126);
 *  Queasy Blvd's is z = 12; Gnome Ave's z = -118; the pub's back lane (Wood Havoc Lane) x = -168. */
export const STAIN_DRESSING: Dress[] = [
  // ---- parked on Stain Way: two delivery vans, kerbside, either side of the pub (each hides a crossing player for a
  // second or two, never the whole street); a skip outside DYE TRYING's refit
  box("van", -120.8, -12, 2.2, 6, 2.6, { blocks: true, note: "FISHY BUSINESS's ice van: hides you crossing at Queasy for ~1 s" }),
  box("van", -115.2, -72, 2.2, 6, 2.6, { blocks: true, note: "a parcel van outside PLUG & PRAY's neighbour" }),
  box("skip", -120.8, -88, 2, 4, 1.4, { note: "a skip outside DYE TRYING (low: you see over it)" }),
  // ---- the pub's frontage: benches, barrels, the A-board; the snug's side door; the gap to FISHY's yard
  box("bench", -124.8, -48, 0.6, 2.4, 0.9), box("bench", -124.8, -60, 0.6, 2.4, 0.9),
  box("barrel", -124.6, -42.6, 0.8, 0.8, 1.1), box("barrel", -124.6, -65, 0.8, 0.8, 1.1),
  box("sign", -122.6, -53, 0.5, 0.8, 1.1, { note: "the A-board: QUIZ TONITE (there is never a quiz)" }),
  box("fence", -133, -38, 14, 0.2, 2.2, { blocks: true, note: "FISHY's yard fence along the pub's side" }),
  box("gap", -126.5, -38, 1, 0.3, 0, { foot: true, note: "a 1 m gap by FISHY's fence: you fit, a giant doesn't. Pavement to WEE MICKEY's yard behind the pub" }),
  // ---- FISHY BUSINESS: the marlin over the door, the ice display, crates of something
  box("display", -125.4, -28.5, 1, 3.2, 1.0, { note: "the ice table: lobsters that may be looking at you" }),
  box("crates", -125.2, -33, 0.9, 1.6, 1.2),
  // ---- PLUG & PRAY (east side): the microwave tower, a fridge on the pavement, a roller shutter half down
  box("display", -110.6, -48, 1, 4, 1.6, { note: "the tower of microwaves; the polka one is on top" }),
  box("shutter", -110.2, -56, 0.3, 3, 0.1),
  // ---- the kerbside line: trees, lamps, a hydrant, bins (all see-past)
  ...[-100, -80, -36, 0].map((z) => box("tree", -122.6, z, 1.2, 1.2, 6)), ...[-104, -64, -24, 6].map((z) => box("tree", -113.4, z, 1.2, 1.2, 6)),
  ...[-110, -58, -18].map((z) => box("lamp", -122.8, z, 0.3, 0.3, 5)), ...[-92, -46, -6].map((z) => box("lamp", -113.2, z, 0.3, 0.3, 5)),
  box("hydrant", -113.6, -30, 0.4, 0.4, 0.8), box("bins", -113.8, -84, 0.9, 2.4, 1.2), box("bins", -122.4, -100, 0.9, 1.8, 1.2),
  // ---- awnings and fire escapes on the façades (overhead: they shade, they don't block)
  ...[[-125.2, -28.5, 1.6, 12], [-125.2, -53, 1.6, 24], [-110.8, -52, 1.6, 14], [-110.8, -20, 1.6, 10]].map(([x, z, w, d]) => box("awning", x, z, w, d, 3)),
  ...[[-126.6, -78, 0.9, 6], [-109.4, -88, 0.9, 6], [-109.4, -4, 0.9, 6]].map(([x, z, w, d]) => box("fireescape", x, z, w, d, 12)),
  // ---- the Queasy corner: the newsstand and the bus shelter (the junction's choice: see the proposal)
  box("newsstand", -111.4, 2, 1.8, 2.6, 2.4, { blocks: true, note: "the newsstand: one solid corner of the junction" }),
  box("busshelter", -123.2, 22, 1.2, 4, 2.6, { note: "the bus shelter (glass: you see through it)" }),
  // ---- the museum corner: the steps, the banner poles; the goods gate across Gnome from the pub's lane
  ...[-146, -140, -134, -128].map((x) => box("lamp", x, -126.6, 0.3, 0.3, 6)),
  box("van", -183, -133, 6, 2.4, 2.8, { blocks: true, note: "the museum's own box van in the goods yard: cover while you drag" }),
  // ---- Wood Havoc Lane (behind the pub): WEE MICKEY's yard, the snug's side door, yard fences either side, bins
  box("fence", -165.5, -9, 0.2, 42, 2.2, { blocks: true, note: "board fences along the lane: you're unseen from Stain Way" }),
  box("fence", -170.5, -9, 0.2, 42, 2.2, { blocks: true }),
  box("fence", -178.5, -53, 0.2, 46, 2.2, { blocks: true, note: "the lane bends round WEE MICKEY's yard" }),
  box("fence", -165.5, -97, 0.2, 42, 2.2, { blocks: true }), box("fence", -170.5, -97, 0.2, 42, 2.2, { blocks: true }),
  box("bins", -176, -40, 0.9, 1.6, 1.2), box("crates", -168, -24, 1.2, 1.2, 1.4), box("bins", -168, -84, 0.9, 1.6, 1.2),
  box("gap", -165.5, 1, 0.3, 1, 0, { foot: true, note: "a 1 m gap in the lane fence into the yards behind FISHY's" }),
  // ---- the home block's west side: the fort yards' fences, the market's exit, the crossings
  box("bins", -58.9, 36, 0.9, 2.4, 1.2), box("tree", -58.8, 44, 1.2, 1.2, 6), box("tree", -58.8, -4, 1.2, 1.2, 6),
  box("display", -61.2, 25, 0.8, 4, 1.0, { note: "SCREW LOOSE: timber on the pavement; the forty-foot ladder sticks out over its yard and the back lane" }),
  box("display", -25, -61.2, 5, 0.8, 0.6, { note: "POT LUCK's gnome crowd on the pavement (they all look the same)" }),
];

/** THE JUNCTION CHOICE (Stain Way x Queasy Blvd, where the museum run comes home): A = the open corner (recommended):
 *  the newsstand only; B = the busy corner: a scaffold on the corner building, a parked removals lorry and a market
 *  barrow too. The proposal shows what each does to the sightline down Stain Way. */
export const JUNCTION_B: Dress[] = [
  box("scaffold", -108.6, -4, 2.4, 12, 9, { blocks: true, note: "scaffold + sheeting on the corner building" }),
  box("van", -115.2, -22, 2.4, 8, 3.2, { blocks: true, note: "a removals lorry, kerbside" }),
  box("newsstand", -121.6, 2, 1.6, 2.4, 2.4, { blocks: true, note: "a second kiosk, west kerb" }),
];
export const blockers = (ds: Dress[]): QRect[] => ds.filter((d) => d.blocks).map((d) => d.rect);
export const at = (d: Dress): XZ => [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2];
