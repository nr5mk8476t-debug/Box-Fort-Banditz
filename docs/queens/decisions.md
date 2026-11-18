# Queens: decision log

Newest last within each date. "Blake" = Blake decided; "default" = my recommended default, adopted after Blake said
"do accordingly to what you think is right" (2026-11-17). Any default can be reopened; the cost of changing it is noted.

Baseline: `main` at **6fe35d7** (2026-11-16). The R15 work (shop stock, no street spawns, LAST SCREW) is on the branch
`claude/new-session-wsgpbp` only.

## 2026-11-17

**D-01 The ~60 s outskirts benchmark (default).** From each fort, empty-handed, sprint held under the real stamina
rules (it runs out after ~8 s, recovers, sprints again), along the walking network, no fights. Measured: 573 m in 60 s
on open ground (walking only: 400 m). Target band 50-70 s per border, reported per fort, not averaged.
*Changing it to walking pace would shrink the city to about half the area.*

**D-02 Fort tiers (default).** The starting box plus SIX paid upgrades, the sixth being the MAYOR'S BOXFORT (7 stages).
Release 1 keeps today's four levels (box, DUCT-TAPE FORT, PLYWOOD PALACE, MAYOR'S FORT) renamed onto the ladder; the
extra three come in Stage 4 with the economy model. Same yard footprint at every tier.

**D-03 Match length (default).** An evenly matched group can start the mayor race around cycles 5-6 (~50-60 min);
cycle 8 stays the cap. Phase lengths are unchanged (8:00 scavenge, 2:00 PREP): prices and tier costs are tuned to that.

**D-04 Market timing (default).** SELL, BUY, CRAFT and UPGRADE at the market during PREP only (selling is PREP-only
today). Selling uses banked records only: the market never skips the 10 s banking. The street buyers stay for
UNBANKED loot during the scavenge at their lower rates (pawn 30%, specialists 45%, WEE MICKEY 60% vs the market's
60% + the "wanted" bonus), so they're "cash now, less money", not a shortcut.

**D-05 Materials (default).** Release 1: recipes use whole banked objects by category (today's system). Salvaging into
material counts comes later, after the economy model shows it's needed; if added, materials live in one fort bin that
can be stolen from at night, with a size limit. The plan's material groups (timber, metal, fabric, fasteners,
electronics, rubber, chemicals, luxury, food) map onto today's categories; every group has 2+ sources.

**D-06 Landmarks in release 1 (default).** All four plots reserved now. The BANK works fully first; the casino, museum
and hotel get their exteriors and one modest loot area each, then their full interiors one at a time (Stage 6).

**D-07 Gear on knockdown / arrest (default, to verify).** A knockdown keeps your gear and drops what you're carrying (as
today). An arrest takes ONE equipped item to the impound, bought back in PREP. Today's code has no arrest-gear rule
that I found: confirm before changing anything.

**D-08 The railway (default).** Scenery with a cosmetic train on a schedule; no riding, no new travel system.

**D-09 The roster (Blake: "6 in low, 5 in medium and 5 in high, then the 4 landmarks").** 16 stores + 4 landmarks
(the brief had 26 + 4). Chosen to cover every material twice and keep today's stores:
- LOW: SCREW LOOSE HARDWARE (id `lastscrew`), CRUMBS & CONSEQUENCES, RUST BUCKET SALVAGE, PLUG & PRAY REPAIRS,
  WHEELIE DODGY CYCLES, POT LUCK GARDEN CENTRE.
- MID: SECOND CHANCE HOMEWARES, SPIN & SIN LAUNDRETTE (id `spincycle`), NEEDLE DROP RECORDS, PEAK FOMO OUTDOORS,
  PAST ITS PRIME ANTIQUES.
- HIGH: CARAT & RUN, TICKED OFF WATCHES, MAISON PONG, GUCCIO GARBAGE, THE UPPER CRUST.
- LANDMARKS: FIRST NATIONAL BANK OF BOXES (NW), THE LUCKY LOSER CASINO (NE), THE MUSEUM OF QUESTIONABLE HISTORY (SW),
  THE GRAND OVERLOOK-ISH HOTEL (SE). Names are proposals.
- Not in this release (kept as a bench list): Sole Survivors, Dye Trying, The Final Print, Wash Your Problem?, Sew
  What?, Fishy Business, Batter Days Bakery, Lord of the Strings, Party Foul Supplies, Frame & Fortune. R15's
  OVERPRICED KITCHEN & LIVING is dropped.
- Stable ids are kept; renames are display names only.

**D-10 The pub and the club (Blake: not now).** Their plots are reserved (pub on the west edge, club on the east edge,
well away from the home block and apart from each other). They move in a later stage with every interaction.

**D-11 The R15 branch (default).** Validate and merge its shop-stock system (randomised shelves and counters per cycle,
no street spawns on the new map) as the base for the overhaul's loot budgets: Stage 0b. The rest of R15's shop builds
are frozen until the Queens plan places them; LAST SCREW's interior becomes SCREW LOOSE's starting point.

**D-12 Giant loot from a landmark.** The plan's estimate: a landmark giant dragged home ALONE is 380-410 s, most of a
scavenge. So landmark loot is mostly heavy-not-giant; giants are for the DRAG HARNESS / HAND TRUCK (or the
craftables HAUL OF SHAME / PULL ME MAYBE), or a friend helping. Nobody gets sped up.

**D-13 The city's size.** 940 x 690 m (~12x today's new map), set by D-01, not by the reference picture. Most of it is
ordinary city (apartments over shops, garages, yards, courts); the outer high districts are large. Risk: it feels
empty with 2-4 players. The Stage 2 blockout is the test; if it fails, the fallback is pulling the borders in (which
gives up part of the 60 s target), not shrinking the stores.

**D-14 The low stores are a pinwheel.** Each fort's rear gate faces its OWN nearest low store across the ring road,
~20 m away (5 s for all four forts); two more low stores sit on the market streets, each shared by two forts.

**D-15 Crossings.** Eight zebra crossings on the ring road: one at each market exit, one outside each fort's rear gate.
Crossings are where encounters happen; Stage 2 checks the traffic there (no unavoidable collision trap).

**D-16 Where the north spur was.** The police station fills it; a pedestrian-only walk-through joins the two halves of
Astorial St behind it (no vehicles).

**D-17 Store sizes.** A standard store is 15 x 16 m (~222 m2 usable, 2.2x today's average); high-end 16 x 16 (2.3x:
room for cases and a guard). Flagged specialists: RUST BUCKET (a scrap yard, 4.0x) and POT LUCK (an outdoor plant
yard, 3.3x).

**D-18 Money.** Each cycle's shelf value is split by tier (proposed: low 22%, mid 28%, high 30%, landmarks 20%). More
stores share the same budget; they don't add money.

## 2026-11-17: layout v2 (Blake's review of v1)

**D-19 The home block is sized from the largest fort.** Yards 36 x 36 m (5.4x today's 16 x 15 lot), holding the
MAYOR'S BOXFORT: house + porch 18 x 14 m, three shelf units, the safe, the workbench, the board, two trap sockets,
the mat behind a return wall, and usable outdoor space (`FORT_MAX`, checked to fit). Market lanes 28 m, a 28 x 28 m
square, a 5 m block pavement, the 10 m ring road: 140 m kerb to kerb. Not the reference's ~320 m: that would leave
huge empty yards and push the low shops ~17 s further out.

**D-20 Neighbourhoods are generated from five typologies** (row with a service alley, corner, courtyard, workshop,
destination/precinct), seeded per block so the city is the same every time; shops are units IN the rows, wall to
wall with neighbours, front door on the pavement, back door on the alley. Ordinary buildings are closed shells.

**D-21 The city's size stays 940 x 690 m.** On the v2 plan the borders are 39-61 s from the forts (sprinting,
estimated; average ~50 s). No empty land is added to reach 60 s; if Blake wants every border ~60 s, that's another
row of blocks north and south (~+60 m each), not stretching.

**D-22 Streets: few, clear, varied where it earns its place.** Queasy Blvd offset 15 m at the home block (no
sightline across the city), Rooster Velt's bend into the nightlife quarter, Stain Way's jog, Astorial St as two
T-streets with small squares, Low Road and Flushed Ave as T-streets. Straight segments otherwise (cheaper kerbs,
fronts, collision, nav).

**D-23 The full roster has room now.** 26 shop units: 16 playable first (6/5/5), 10 reserved as closed shopfronts in
the rows (6 low, 3 mid, 1 high) until their turn. WASH YOUR PROBLEM? is a drive-through bay in a row, not a detached box.

**D-24 The police are a modest corner station** (36 x 28 m + impound yard) facing down Market St North; the rest of
that ground is Spur Court (flats round a courtyard).

**D-25 The north spur is a footpath.** Past the police and through Spur Court to the north shore (pedestrians only).
It makes the north border 39-49 s; without it, 67-76 s.

**D-26 The pub and the club in their own streets.** THE SOGGY SHAMROCK on the corner of Gnome Ave and Wood Havoc
(today's 29 x 26 m interior, its balcony street, WEE MICKEY's yard on a back alley from West End Rd). NEON FEVER on
the corner of Dit Marsh and Rooster Velt (door on the junction, the club lane behind for the fire exit and DON
BINNIE's stairs), facing the casino's marquee across Rooster Velt: the nightlife strip.

**D-27 The line is a real diagonal** ((220, 345) -> (360, 40) -> (445, -345)): the casino east of it, the club and the
hotel west of it. A 7 m strip under it stays free of buildings; 23 columns, spans of 32 m or less over every road
and alley; a cosmetic train first.

**D-28 The landmarks differ in shape and approach.** Bank: an L-shaped corner banking hall + a gated van dock. Casino:
a marquee forecourt + a cash-office door on the edge road. Museum: a forecourt with steps + a goods yard. Hotel: a
canopy drop-off + a loading bay, an L of guest floors.

## 2026-11-18: Compact Queens (a proposal: Blake's brief "a substantially smaller, denser version of Queens v2")

All PROPOSED, waiting on Blake. v2 stays the reference until he chooses. Full reasoning: `compact/proposal.md`.

**D-29 The size is set by one trip.** Each fort's mat to its nearest major landmark's public door, empty-handed, sprint
held, real stamina, a legal walking route: ~25 s (22-28 s). The loop of avenues sits at 118 m from the middle (the trip is
2A - 0.5 m: 235 m is 25 s on the measured curve); one band of buildings outside it to an edge road at 196 m: 408 x 408 m.
Walked with the game's movement code: 24.0 s from every fort. Replaces D-01/D-21 (the ~60 s border) for this proposal.

**D-30 Four shopping avenues in a loop, a landmark outside each corner** (bank NW, casino NE, museum SW, hotel SE). Every
landmark run uses two avenues; runs to different places share strips, corners and crossings. Spokes from the ring to
the loop, offset 12 m from the market's lanes in one turning sense (a pinwheel: no sightline across the market, every
fort's trips the same shape). The north spur and the south-east connector stay removed.

**D-31 The inner blocks are one L-shaped block turned four times:** a starter row facing the ring (each fort's own
starter shop, 5 s), mid shops facing the avenue, a 5 m BACK LANE between with yards and garages. The lanes kink round the
yards so the hidden way costs ~16 m more than the avenue (about 2 s empty, 6 s with a giant): cover is a choice. The
avenues are the quick way.

**D-32 The home block keeps v2's 36 m yards; the market lanes are 20 m** (v2: 28 m), the stalls on the square's corners,
the board in the middle. Starter yards dressed as junk lots until the upgrades fill them.

**D-33 Landmarks: the public door near the corner, the loading side 38 m on along the same avenue** (the bank's van dock,
the casino's cash-office yard, the hotel's loading bay, the museum's goods gate). Giants leave by the loading side;
heavy loot by either. The museum's goods gate faces the end of the Shamrock's back lane across Gnome Ave.

**D-34 20 playable shops (8 / 7 / 5)**, v2's 16 plus FISHY BUSINESS, THE FINAL PRINT, BATTER DAYS and LORD OF THE STRINGS;
FRAME & FORTUNE (playable) swaps with THE UPPER CRUST (reserved) so the museum corner has a high-end shop. 26 planned.
Stain Way and Rooster Velt Ave are the two proper shopping streets. SPIN & SIN is the one shop off its quadrant's slot
(the El crosses Dit Marsh there).

**D-35 The El crosses the NE corner diagonally** ((20, 214) -> (194, -70)): the casino east of it; a 36 m truss where it
crosses Dit Marsh on the skew (the only span over 32 m).

**D-36 No economy change before a playtest.** The fort's shelves cap what a scavenge banks (8 / 12 / 16), not the
distance; Compact frees 1-4 minutes a scavenge and adds 11-25% only with bigger shelves. The first fix if players still
don't meet: Sal's WANTED list on the board at the START of the scavenge (simulated: 51% -> 62% of two-player scavenges).
