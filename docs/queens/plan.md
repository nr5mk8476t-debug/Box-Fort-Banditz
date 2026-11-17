# Queens: the staged plan

The overhaul in reviewable stages. Each stage has a goal, a checklist, its exit test (what must be TRUE, measured,
before the next stage starts) and what Blake sees. Ticks mean done AND verified; unticked means not done. The playable
game stays as it is until the Stage 2 blockout is accepted, and the old maps stay selectable for comparison until the
Queens city replaces them.

**Where we are (2026-11-17):** Stages 0 and 1 done; layout v2 (Stage 1.1) drawn after Blake's review and waiting for
his answers ([questions.md](questions.md)). Next: Stage 0b (merge R15's shop stock), then Stage 2 (the blockout of v2).

## The first playable release (the scope Stage 2-7 builds toward)

- The full-size street plan (940 x 690 m, ~60 s sprinting to the border), the nav network, traffic, every plot reserved.
- The four equal forts round the market (SELL / BUY / CRAFT / UPGRADE + the board), the ring road and its 8 crossings.
- 16 stores (6 low / 5 mid / 5 high) at the R15 standard; 4 landmarks (the BANK working, the others with exteriors and
  one modest loot area each, then full interiors one at a time).
- The fort ladder: the box + six upgrades (release 1 starts with today's four levels renamed), the fittings (shelves,
  safe, border-and-gate, alarm, workbench) and two traps (THE SNITCH CHICKEN, WELCOME MATT).
- The elevated line as scenery with a cosmetic train.
- The pub and the club move to their reserved plots in a later stage, with every interaction (pool, darts, Split the G,
  WEE MICKEY, DON BINNIE's lounge, schedules, quests).

## Stage 0: audit and baseline -- DONE (2026-11-17)
- [x] Baseline commit recorded: main 6fe35d7.
- [x] 60 s of running measured with the real movement + stamina (`tests/sustained-run.ts`): 573 m sprinting, 400 m walking.
- [x] Today's travel matrix from all four forts with the real movement (`tests/route-matrix.ts`): unfair by fort today.
- [x] The host's simulation cost vs NPC count (`tests/tick-scale.ts`): not the bottleneck.
- [x] Inventory: what depends on map positions. Nearly everything reads the map's data (`ArenaLayout`: stores, forts,
      pub, fever, station, hotShops, landmarks, lobby, quest spots via `questLocs`), so moving things is a data change,
      not a rewrite. Hard-coded: `city.ts` (3,524 lines, hand-placed round a 230 m square), the BENCHMARK route
      (`client/src/game/bench.ts`), e2e coordinates (`tests/e2e-phase0.mjs`), the quest-shot and server-smoke views.
- [x] Today's rules to keep (`shared/src/loop/catalog.ts` LOOP): 10 s banking; shelves 8/12/16, safe 2/3/4; night theft
      5 s (10 s with ALARM II); PREP selling at 60% (+ "wanted" x2); street buyers 30/45/60%; 8:00 scavenge (5:30 day,
      0:30 sunset, 2:00 night), 2:00 PREP, 8 cycles; aura tasks from $25 x1.5; interruption -4/+3 once per pair a cycle;
      mayor: 60 aura, $800, 5 of 8 posters, a 10 s uninterrupted speech, the handshake, a 240 s campaign, 3 strikes.
- [ ] Carried into Stage 2 (needs the blockout to mean anything): drawing beyond the fog, load time and memory, network
      bytes per client, the hub's worst view.

## Stage 0b: R15's shop stock onto main (D-11)
Goal: shops are the loot (randomised shelves and counters each cycle, no street spawns on the new map), validated and
merged, so the overhaul's loot budgets build on it instead of a second system.
- [ ] Merge main into the R15 branch; resolve; LAST SCREW keeps its interior.
- [ ] Full validation per CLAUDE.md: unit + typecheck, smokes, draw budget, e2e x2 (normal + LATENCY=110), screenshots.
- [ ] The R15 "full loop" tests: stock taken -> carried -> banked -> sold in PREP; two players on one shelf thing; restock.
- [ ] Push to main. Freeze the rest of R15's builds (the Queens plan places the stores).
Exit: R15 stock on main, every test green, the six-store builds marked frozen in docs/shop-plan.md.

## Stage 1: the measured city plan -- DONE (2026-11-17)
- [x] The plan as data (`shared/src/queens/plan.ts`): roads with widths and pavements, 8 crossings, market lanes,
      alleys and service paths, districts, all 20 businesses + the police + the pub/club reservations, the forts
      (yards, mats, front and rear gates), the elevated line, the removed roads, materials, value shares.
- [x] The checker (`check.ts`) and its tests (`shared/test/queens-plan.test.ts`, 10 tests incl. proof it catches a
      broken plan): one connected road network; no road in the home block or the removed zones; nothing built on a
      road; doors on pavements, a second way out within 30 m; equal forts, screened mats; crossings at every gate and
      market exit; the line's 23 columns clear of every lane, pavement, path and business, spans <= 40 m; roster
      6/5/5 + 4; every material from 2+ businesses.
- [x] The travel matrix from every fort (estimates from measured speeds), fairness table, scavenge fit, floor areas.
- [x] The map and the home-block close-up (diagrams from the data): `img/queens-plan.png`, `img/queens-home-block.png`.
Result: borders 48-71 s from every fort (average 55-56 s); each fort's own low store 5 s; nearest mid 20-23 s, high
32-38 s, landmark 65-67 s; average trip to all 20 businesses within 0.3 s across the forts.

## Stage 1.1: layout v2 after Blake's review -- DONE, awaiting Blake (2026-11-17)
- [x] The differences from the reference and from v1, and which were constraints or choices ([layout-v2.md](layout-v2.md)).
- [x] The home block sized from the largest planned fort (36 m yards, 140 m kerb to kerb), dimensioned, the fort's
      fittings laid out in every yard and checked to fit.
- [x] Building footprints for the whole city from five typologies; shops as units in rows with back doors on alleys;
      10 reserved shop units for the full 12/8/6 roster.
- [x] Varied streets (offset, bend, jogs, T-streets), a modest police station, the pub and the club in their streets,
      the line as a real diagonal, the landmarks each different.
- [x] 12 plan tests (incl. the checker catching a broken plan); three diagrams; the city-plan tables regenerated.
Exit: Blake's answers to questions.md.

## Stage 2: the playable blockout (grey boxes, the real game code)
Goal: walk, drive and chase round the Queens city in the game, measured, before any art.
- [ ] A third map choice, `queens` (the `new` and `classic` maps stay; the default stays `new` until accepted).
- [ ] `buildQueens()`: an `ArenaLayout` made FROM `plan.ts` + `layout.ts`: roads + kerbs + pavements + crossings, grey
      shells for every generated building at its storey count, the units with open doors and back doors, the alleys,
      yards, garages and courtyards, the home block (four fort yards using the
      existing fort system at the four slots, the market's stalls as placeholders), the line's deck and columns.
- [ ] The nav graph, the traffic lanes and the police patrols from the plan's roads (one connected network; cars
      never through the block; the ring's crossings).
- [ ] Fog-distance culling (nothing drawn past the fog's end), measured before/after on today's map AND the blockout.
- [ ] Measured: `tests/route-matrix.ts queens` from all four forts (real movement) side by side with the plan's estimates;
      every stuck point fixed or explained; the cars kept (TRAFFIC=1) to see the crossings.
- [ ] Measured: draws/meshes at fixed views (the hub, the ring at each crossing, an avenue, the line from below and from
      a crossing, each landmark corner) with budgets added to `tests/draw-budgets.json`; `tests/tick-scale.ts` on the
      blockout; load time and memory.
- [ ] Blockout screenshots (labelled): overhead, fort-to-market, fort-to-street, each crossing, the line with a car and a
      player for scale, each landmark plot, at day and night, with camera positions written down.
Exit: the measured border times inside 45-75 s from every fort; no fort more than 10% better on any category; a
     giant-loot route from every business home; no stuck points; draw/mesh budgets set; Blake has walked it.
Risk to watch: emptiness (D-13). If it feels empty, fix it with the ordinary city and events first; pulling borders
in is the fallback, and it's Blake's call.

## Stage 3: the core economic vertical slice
Goal: one complete loop in the new city, with two clients.
- [ ] The market's four stalls working from the existing PREP systems (sell banked records only, consume each item
      once, no exclusive seat: several players at once), the board.
- [ ] One store per tier finished (SCREW LOOSE from LAST SCREW; one mid; one high with guard + alarm) using R15 stock.
- [ ] The economy model as a headless simulation: trips per cycle by fort, banking time, storage pressure, sales,
      recipe and tier costs, aura per cycle; tuned so an even group reaches the mayor race at cycles 5-6 (D-03).
- [ ] Two clients through scavenge -> bank -> PREP -> sell/craft/upgrade -> next cycle; disconnect mid-transaction.
Exit: a full cycle with two clients, the economy model's numbers in `perf.md`/`decisions.md`, anti-exploit tests.

## Stage 4: full progression
- [ ] The fort ladder to seven stages (same footprint; a failed campaign drops a level without deleting anything kept).
- [ ] The fittings (shelves, safe, border-and-gate as one upgrade, alarm, workbench) and two traps, each with owner
      immunity, charges, resets, disarming, placement limits (never on the mat or a gate) and tests.
- [ ] The craftables in small batches, reusing today's banana, megaphone, moustache, smoke, hand truck and harness;
      equipment slots so bonuses don't all stack; authoritative effects (smoke hides you on everyone's screen).
Exit: every tier/fitting/trap/craftable with authority and anti-exploit tests; tuned from the Stage 3 model.

## Stage 5: city content
- [ ] The 16 stores at the R15 standard, by district (low, then mid, then high): unique frontages and interiors,
      stockroom, counter, exits, night lighting, R15 stock tables, materials that recipes accept. The first finished
      store of each district shown to Blake before repeating its approach.
- [ ] The ordinary city: apartments over shops, fire escapes, garages, yards, courts, the line's shadow, by district
      (low worn, mid established, high refined); merged per tile, instanced, culled.
- [ ] Every content batch measured against its budgets (`tests/draw-budget.mjs`, `tests/perf-compare.mjs`).
Exit: the walk-through of every store (CLAUDE.md), budgets held, Blake's BENCHMARK on the city.

## Stage 6: landmarks and nightlife
- [ ] One landmark at a time: the BANK first (lobby, counting room, vault, heavy money bags, escalating security), then
      the casino (no real-money games), the museum, the hotel. Two ways in/out each, neither both safer and faster.
- [ ] The pub and the club to their plots, with pool, darts, Split the G, WEE MICKEY, DON BINNIE, NPC schedules, quest
      spots, security zones and dealers moved and retested.
Exit: every landmark's approaches and escapes walked with heavy loot; the pub's and club's regression tests green.

## Stage 7: the campaign and whole-match validation
- [ ] The mayor's campaign, boss jobs and aura tasks retargeted to the new city (poster spots, the handshake route).
- [ ] Whole matches: win, fail and retry, restart and clean-up; 2-4 players; LATENCY=110; Blake and a friend.
- [ ] The final visual and night review; the BENCHMARK solo and hosting.
Exit: complete matches with the agreed length; budgets held; Blake's sign-off.

## Rules for every stage
Per CLAUDE.md: tests and their real results, labelled screenshots with camera positions, performance before/after on the
same machine (software numbers relative only), docs updated (this folder, CHANGELOG, design-decisions, test-plan), a
rollback point (one commit per slice), pushed to main.
