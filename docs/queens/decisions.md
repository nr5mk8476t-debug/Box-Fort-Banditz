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
