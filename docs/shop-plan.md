# R15: six more shops, and shops are where the loot is (plan)

Blake's brief (2026-11-15) and his answers. The six new shops join the six R13 stores (12 in all), and on the new map
**the shops become the city's loot**: no more loose things in the street ("it doesn't make sense how there is a TV on
the street").

## Blake's answers
1. **The six** (his table):

   | District | Shop | Loot and purpose |
   |---|---|---|
   | Low | LAST SCREW HARDWARE | tools, timber bundles, fittings, scrap: construction for early upgrades |
   | Low | CRUMBS & CONSEQUENCES MINI-MART | food, drinks, household supplies, a small till: easy early robberies, food for boss jobs |
   | Mid | SPIN CYCLE LAUNDRETTE | till money, lost jewellery, abandoned bags, cleaning supplies: valuable finds among junk |
   | Mid | SECOND CHANCE HOMEWARES | lamps, stools, small appliances, furnishings: better value, bulky pieces |
   | High | OVERPRICED KITCHEN & LIVING | premium appliances, designer cookware, furnishings: valuable, crafting, security |
   | High | TICKED OFF WATCHES | watches, jewellery, display pieces: small, valuable, locked cases, alarms, a bodyguard |
2. **Where:** beside each district's existing pair, sides as proposed (map: `screenshots/r15/00-planned-locations.png`).
   - HARDWARE takes KEYS CUT (west, beside RUST BUCKET); the MINI-MART takes CASH 4 SPOONS (east, beside PLUG & PRAY).
   - The LAUNDRETTE takes BOOKS (SOME) (the west edge); HOMEWARES takes HAIR FORCE ONE (the east edge).
   - KITCHEN & LIVING takes HOTEL ADEQUATE (beside MAISON PONG); TICKED OFF takes YACHT PARTS (beside CARAT & RUN).
3. **Counters never buy.** They SELL a randomized handful each cycle: a few different items and several of each (the
   hardware: duct tape, liquid nails, nails, a hammer, a saw, pipe...).
4. **High-end security: both.** STORE SECURITY (warn, shove, chase, tackle) AND an alarm that calls the cops.
5. **Loot:** no street spawns on the new map; the shops carry the loot, more of it and more varied. Each stocks 15-25
   things a cycle, randomized, restocked each cycle.
   - **Stays:** bins and dumpsters (searching them), events (the garbage truck, the airdrop), people's pockets, tills and
     the bank.
6. **Shelves AND counters** are randomized each run (several kinds, multiples of each).
7. **The new map only;** the classic map keeps its spawns (legacy/test).
8. **TICKED OFF's cases:** smash them (the existing case: spill, alarm, heat) or pick the lock (the existing lock-pick
   game: quiet, slow, only while the guard isn't looking).

## Approach
- **Stock as data, not items.**
  - Each store has a STOCK table (type, weight, how many), rolled each cycle into its shelf slots.
  - A store's shelves travel as one compact string, drawn as shared instanced models.
  - A thing becomes a real item only when someone takes it, and that counts as shoplifting where staff can see.
  - ~240 things in the city cost no sync and no physics until taken.
- **New loot types** for what the shops carry, each in a category the upgrades and recipes really use:
  - construction: liquid nails, a box of nails, a hammer, a saw, a pipe, a timber bundle, fittings, scrap;
  - food: crisps, drinks;
  - specialist and trophy: watches, a chef's knife set, a stand mixer;
  - and so on. I'll check every category the upgrades, recipes and boss jobs need is stocked somewhere.
- **The economy:** measure a cycle's total available value before (street spawns plus the R13 stock) and after. Keep
  it in the same range, then tune the stock tables.
- **The buildings:** the R13 way (plot, shell, upper floors, the dressing kit, one shared picture sheet, the interior
  area, two lamps).
  - The frontage and layout tell you the business; a little humour; shop at street level; heights fit the street.
  - Rear exits where the block allows.
- **The order:**
  1. the stock system plus no street spawns;
  2. counters that sell;
  3. the HARDWARE and the MINI-MART (screenshots to Blake);
  4. the mid pair;
  5. the high pair with security, alarms and lock-picking;
  6. validation.

## Risks
- **The economy:** removing street loot changes every round. Measured, and tuned through the stock tables.
- **Performance:** 12 full stores. Instanced stock, merged dressing, the interior areas, and no lights per item. Draws,
  meshes and frame times measured before and after.
- **Tests that expect street loot:** some unit tests and e2e checks spawn on the street. Those get fixed spawns (or the
  classic map) where they're testing something else.
- **The high-end plots are 6 m deep:** grown back into their block if it's free, otherwise a shallower layout.

## Test plan
- Unit tests:
  - stock rolls are random but deterministic per seed and inside the tables;
  - restocking each cycle doesn't duplicate;
  - taking a thing makes exactly one item;
  - two players on the same item: one gets it;
  - two players on the same till: one hold-up;
  - counters never buy and charge once;
  - the new map has no street spawns, while bins, events, pockets and tills still pay;
  - every category the upgrades, recipes and jobs need is stocked somewhere;
  - security, alarm and lock-pick at the high end.
- Browser (solo, a script per shop): rob it, escape, bank the loot, sell or craft with it, and check the next cycle
  restocks. Online: two players take the same item and hold up the same till.
- The usual slice: unit tests, smokes (NPC count), the draw budget (new views for each shop), e2e at normal and 110 ms,
  screenshots, docs.

## Blake's design requirements for the six (2026-11-15, verbatim intent)
Thoughtfully designed, detailed, believable businesses with character, attractive architecture, and interiors that
clearly reflect what they sell. A plain rectangular shell with a sign and some shelves is not enough.

- **About TWICE the usable floor area of the existing shops.** Measure the current shops first. That's double the
  AREA (not double the width and the depth). Use the extra space for interesting layouts and robbery gameplay.
- **Plan each store before building it:** footprint, architectural style, interior arrangement, entrances, loot
  locations, escape routes, and how it fits its street and neighbours.
- **The city's scale:** no tiny standalone shops beside massive buildings. Where it fits, the shop is the ground floor
  of a taller building with convincing upper façades (those can stay cheap exterior shells).
- **Distinctive architecture:** recessed entrances, deep shopfront windows, columns, awnings, cornices, rooflines,
  varied shapes. Features have believable thickness and support. No random protruding blocks or purposeless decoration.
- **The district shows:**
  - low-end: worn, patched, full of personality;
  - mid-range: established and maintained;
  - high-end: elegant proportions, refined materials, polished displays.
- **Real interiors:**
  - an entrance area, a counter, product sections, shelving, and a stockroom where it suits;
  - layouts that differ from shop to shop;
  - aisles wide enough for bulky loot, NPCs and multiplayer chases.
- **The bigger footprint is for gameplay:**
  - sneak behind displays, reach the valuable stock, get spotted, escape;
  - rear or side exits where the streets allow;
  - no empty oversized rooms, no confusing mazes.
- **The merchandise sells the theme:**
  - hardware: timber racks, tools, fittings;
  - homewares: furniture displays;
  - watches: refined cases, secure stock.
  - Mix cheap decorative stock with clearly recognisable stealable items.
- **The goofy BFB personality:** funny product labels, questionable adverts, small visual jokes. The architecture stays
  convincing.
- **Good at night:** readable illuminated signs, warm windows, carefully limited lighting within the budgets.
- **Efficient detail:**
  - reuse materials and atlases, instance repeated products, merge static decoration, interior culling;
  - simple collision; no decorative product as its own physics object;
  - meshes, draws and frame times measured before and after; never paid for by lowering the whole game's quality.
- **Work with Blake visually:**
  1. an initial layout plan;
  2. in-game screenshots of the FIRST finished shop: from the street, inside, at night, plus a wider street view for
     scale;
  3. Blake's feedback on that shop, before the approach is copied to all six.
- **Finally, walk every store.** Check for flicker, missing floors, floating details, clipping, blocked doors,
  unreachable loot and stuck NPCs. Every shop supports robbery → escape → fort banking → selling or crafting.
