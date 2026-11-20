# Box Fort Banditz: standing rules for every session

A first-person 3D browser party game set in the city of Trashington. Babylon.js 9 + TypeScript + Vite (client/), Colyseus (server/), the shared game rules (shared/), a deterministic shared World. The owner is Blake. Read `CHANGELOG.md` (newest first), then the relevant parts of `docs/design-decisions.md` and `docs/test-plan.md`, before starting.

## Working with Blake
- Ask Blake numbered questions about design choices before building. He likes plenty of questions ("ask me loads of questions"). Use the AskUserQuestion tool where it's available.
- Before a big feature, state the approach, the risks and the test plan.
- Never claim tests passed when they didn't. Report: a summary, the files changed, the tests, the limitations, and what's next.

## Content rules
- Characters: no flat boxes or plates on the chest or front (no vests, shirt panels, ties, badges, tee prints, aprons or buttons). `npcRenderer` throws away any part named in `NO_CHEST`.
- Cartoon parody brands only. No real pub or brand names. The pub is THE SOGGY SHAMROCK; its drinks are GUZZLE'S, KILLKENNEL, HARPY LAGER and O'BINLID'S.
- No real-money monetization; in-game cash only. No realistic drug presentation.
- Don't add landmarks unless Blake asks.
- The old 100-file cap is lifted (Blake, R12.5: "if you need to add more files more than 100, do so, and add accordingly to github"). Add files where they make the code clearer, commit them, and don't pad the repo.
- **New stores (Blake, R15):** proper businesses with character, not a shell with a sign and shelves.
  - About 2x the existing shops' usable floor AREA.
  - Planned first: footprint, style, interior, entrances, loot, escape routes, fit with the street.
  - The ground floor of a taller building where it suits the street.
  - Real interiors: entrance, counter, sections, stockroom; varied layouts; aisles wide enough for bulky loot and
    chases.
  - The district shows (low worn, mid established, high refined); goofy labels and jokes; good at night.
  - Efficient: atlases, instancing, merged static decoration, culling, simple collision.
  - Show Blake the first finished shop (street, inside, night, wide street view) before copying the approach.
  - Finish with a walk-through of every store.
  - Full brief: `docs/shop-plan.md`.
- New content follows `docs/content-guide.md` and stays inside `docs/perf-budget.md` (check with the BENCHMARK and `tests/perf-compare.mjs`).

## Every update ("slice")
1. Unit tests: `npm test` (shared + client), and `npm run typecheck`.
2. Smoke tests, with the server running from server/ (`npx tsx src/index.ts`): `npx tsx tests/signal-smoke.ts` and `npx tsx tests/server-smoke.ts`. The server smoke checks the NPC count; update it when NPCs are added or removed.
2b. The draw-call budget (vite preview on 4173): `node tests/draw-budget.mjs`. Over budget = find what it costs and fix that; raise a budget only on purpose (`UPDATE=1`).
3. The browser e2e: `node tests/e2e-phase0.mjs`, with vite preview on port 4173 started from client/ (`npx vite preview --port 4173`), and `OUT_DIR` set for the screenshots.
   - Run it twice: at normal speed and with `LATENCY=110`.
   - Keep the machine idle during the run.
   - It uses `/opt/pw-browsers/chromium` (or `PW_CHROME`) when Playwright's own browser is missing.
4. Do a visual review of the screenshots.
5. Update `docs/design-decisions.md` and `docs/test-plan.md` (newest round first in the test plan).
6. Add a `CHANGELOG.md` entry at the top, and put the round's screenshots in `screenshots/<round>/` (e.g. `screenshots/r12_3/`).
7. Commit as Blake Stokes <blake.stokes12@outlook.com>, ending the message with:
   ```
   Co-Authored-By: Claude
   ```
8. **Push to `main` on GitHub (nr5mk8476t-debug/box-fort-banditz) every update.** Never force-push.

## Performance (saved R12.6, from Blake's brief)
- Target: a steady 60 FPS at 1920x1080 on Blake's PC (the reference; CPU bound by MESHES drawn, ~7 µs each: R12.8 cut
  draws 20% with meshes unchanged and the frame didn't move, so count meshes, not just draws). Budgets
  live in `docs/perf-budget.md`; the per-change budget: median +10%, 99th +20%, draws +15%, triangles +15%, no new
  frames over 50 ms on any stretch of the BENCHMARK route (`tests/perf-compare.mjs` flags it).
- Measure before and after every content or rendering change (the BENCHMARK, `tests/perf-route.mjs`, or fixed views)
  on the same machine and settings. The test box renders in software: its numbers are relative only; say so.
- Fix what a change costs at its source (merge, LOD, interior areas, fewer lights); never pay for it by turning the
  whole game's graphics down, and ask Blake before any visible downgrade.
- No blanket depth-bias changes. Mounted things sit clear of their backing's ink outline (it writes depth, 4-12 mm
  proud, with a bias that grows at grazing angles): 1.5-2.5 cm.
- Don't invent universal NPC or building limits without measurements.
- Every update's report has a short **performance impact note**: what was measured, what changed, any regression or
  trade-off, what's unverified.
- New content: `docs/content-guide.md` (where things live, interior areas, lights: 6 per mesh, 4 per floor).

## Process safety
- Never `pkill` (or `pgrep -f`, or a kill loop over grep) a pattern that appears in your own command line. Kill by PID, in a separate command from the launches. List with `ps -o pid,args -p ...` first.

## Next up (as of TR3: the roundabout market park)
- Blake (2026-11-20) likes the 400 m size and the timing. The plan is `docs/trashington400/roadmap.md`. He wants one
  thing at a time: no cars, no shadows, no shops until he's happy with the park. The test map has no ink outline (cheaper)
  and is 8% faster on foot.
- The home block is a round park (`T_PARK` in `trashington400.ts`: plaza 10 m, fences 31 m, kerb 33 m, the road's
  centre line 37 m). It's built in `shared/src/testmap.ts`: the plaza, the stalls, rounded fenced plots with two gates,
  the verge, the trees, the bunting.
- Waiting on Blake: a play of the park, then which stage next (roadmap Stage 1b: the full massing; or Stage 2: the style
  kit on one street).

## Earlier: Next up (as of TR2: Trashington 400, smaller and dressed)
- Blake (2026-11-20, after playing TR1): too big. The plan is now 400 x 400 m with 18 m yards
  (`shared/src/queens/trashington400.ts`, `TRASH400`; pictures and walked times: `npx tsx tests/trash400-report.ts` ->
  `docs/trashington400/`). He wants "quick dopamine... iconic little areas", an arcade loop, not an open world.
- The test map (`?map=test`, `shared/src/testmap.ts`) is built from `TRASH400`. It's 10% faster on foot
  (`arena.pace`) and the route is dressed like his photos (home lots, Stain Way, PLUG & PRAY, the museum's GOODS IN,
  Wood Havoc Lane). Boxes can choose their sign colours (`signBg`/`signFg`/`signW`/`signY`).
- Known: `canonBoxes` drops `wallKind`/`winKind` on every map (the R13 stores' upper floors never got theirs); the
  test map keeps them itself (`canonTest`). Fixing it for the normal city changes its look: ask Blake first.
- Waiting on Blake: a play of the 400 m test with Tyson, the reports, his verdict on size and pace, what to dress or open
  next.

## Earlier: Next up (as of TR1: Trashington 500, the smallest playable test)
- Blake (2026-11-18): "500 x 500 m, landmarks out"; keep the original look and DON'T SAY "QUEENS" (in messages, docs,
  names: it's Trashington); grey boxes first; 20 m market lanes; junk-lot starter yards; no WANTED list yet.
- The plan: `shared/src/queens/trashington.ts` (`TRASH500`; the folder keeps its old name for now), checked by
  `check.ts` (`usePlan(TRASH500)`). Pictures and the walked table: `npx tsx tests/trash500-report.ts` ->
  `docs/trashington500/`.
- The playable test: `?map=test` (`shared/src/testmap.ts`). The whole city as grey boxes; PLUG & PRAY, FISHY BUSINESS
  and the museum open; giants leave the museum by the goods yard only (`arena.giantDoors`); two players start west
  (`TEST_SLOT`). The recorder `shared/src/playtest.ts` (host only) saves a report at each PREP. How to play it:
  `docs/trashington500/README.md`.
- Waiting on Blake: a play with Tyson, the saved reports, and both answers to "did spotting the other player change
  what you decided to do?" Then his calls on the size (500 m), the landmark distance (31.6 s) and what to open next.

## Earlier: Next up (as of CQ1: Compact Queens, a proposal)
- Blake asked for a smaller, denser Queens sized by the trip to the nearest landmark (~25 s). The proposal:
  `docs/queens/compact/proposal.md`; the plan `shared/src/queens/compact.ts`, checked by the same `check.ts`
  (`usePlan(COMPACT)`; `active.ts` holds the plan being checked). Decisions D-29 to D-36 in `docs/queens/decisions.md`.
- Its tools: `net.ts` (routes), `sight.ts` (line of sight, encounters over time), `dressing.ts`; the report, the walk with
  the real movement code, the encounter simulation, the economy estimate and the mock-ups are `tests/compact-*.ts`.
- Waiting on Blake: his review of the pictures and `docs/queens/questions.md` (the Compact questions). Don't build the
  playable test until he approves it.

## Earlier: Next up (as of Q1: the Queens overhaul)
- Blake's Queens brief is a staged plan in `docs/queens/`. Read `plan.md` first, then `decisions.md` (D-01..D-18).
  Stages 0 and 1 are done.
- The city is checked DATA: `shared/src/queens/plan.ts`, validated by `check.ts`. Change the plan there, then run
  `npx tsx tests/queens-plan-report.ts` to redraw the map and tables. It is not wired into the game until the Stage 2
  blockout is accepted.
- The roster (Blake): 6 low / 5 mid / 5 high + 4 landmarks; the pub and the club later (plots reserved).
- Measure travel with the REAL movement: `tests/route-matrix.ts`, `tests/sustained-run.ts`, `tests/tick-scale.ts`.
- Q1.1 (layout v2, after Blake's review): every building footprint is generated by `shared/src/queens/layout.ts` from
  the block's typology. The home block is sized from `FORT_MAX`, the largest fort. Waiting on Blake:
  `docs/queens/questions.md`.
- Next: Stage 0b (validate and merge R15's shop stock from `claude/new-session-wsgpbp`), then Stage 2 (the `queens`
  blockout of v2: grey boxes, measured travel, fog culling, draw budgets).

## Earlier: Next up (as of R14)
- R14: the first complete loop. The rules are in `shared/src/loop/` (catalog, fort, aura, quests, security, mayor), all
  data-driven; Blake's answers are in `docs/game-loop-plan.md`.
  - Banked things are RECORDS, not world items.
  - Per-player loop state rides in the player view's `shop` JSON field (the schema is at its 63-field limit):
    `World.loopJson`, cached by a version key. A new system adds `view(p)` and `version(p)` there.
  - Quest places come from `questLocs` (only what's on the map).
  - New tests: `shared/test/{loop,quests,security,mayor}.test.ts`; `tests/{loop-shots,fort-levels,quest-shots,mayor-shots}.mjs`.
- Waiting on Blake: a play of the full loop (are 8 cycles too long? task prices, the -4/+3, the van at 60%), his calls on
  my fairness choices (design-decisions R14), whether the President may stand in the road at Chinatown, and a
  BENCHMARK with a friend.
- Then: Blake's pick (the pub brawl, the quiz, the G-split champ, R13's alleys), plus balance from playtests.

## Earlier: Next up (as of R13.1)
- R13.1: four bugs fixed (E at the store counters: `eUsable()` is the ONE list of what E targets; a carry speed of 0
  survives to the client; a giant mid tug can't be sold; removing a character no longer disposes SHARED materials:
  use `disposeOwned()`, never `dispose(false, true)`, and `shareMat()` for a new cache). Solo refreshes only on a new
  state; door leaves and remote players merged; CARAT & RUN (the jeweller, the DIAMOND PIGEON, PERCY FACET) replaced
  BONBON VIVANT (the sugar-rush truffle is gone, not moved). Budgets hold meshes; unbudgeted views fail.
- Waiting on Blake: a BENCHMARK on R13.1 (solo at his refresh rate, and hosting with a friend), a walk round CARAT & RUN,
  and his call on the remote players' outlines (one skinned mesh would save 6 more meshes a player but thins the outline).
- Then: Blake's pick (the pub brawl, the quiz, the G-split champ, R13's alleys).

## Earlier: Next up (as of R13)
- R13: six stores as whole buildings (`shared/src/stores.ts` for plots, shells, upper floors, trade; the look in
  `client/src/game/storeDressing.ts` through a kit in each store's own frame; pictures on one shared sheet). People are one
  skinned mesh each (`look.ts` skinBody; `?skin=0` for the old way). New buildings: upper floors are façade shells
  (`wallKind`/`winKind` on the box), roofs as merged prisms.
- Waiting on Blake: a BENCHMARK on R13 (the people change should show), a walk round the six stores.
- Then: Blake's pick (the pub brawl, the quiz, the G-split champ, R13's alleys).

## Earlier: Next up (as of R12.9)
- R12.9: movement +15% (cops on foot too); Blake's pub list fixed (brackets, cornice + quoins, fireplace mirror flicker,
  side doorway, stair bunting, Seamus's snug door + neon, the canopy's gold line, the balcony floor from inside).
  Building outside pieces from inside the pub's build: wrap them in `outsideOnly` or they're filed into a room.
- Next: Blake's pick (the pub brawl, the quiz, the G-split champ, R13's alleys); still waiting on his verdict on
  Mickey's prices and a proper play of Split the G.

## Earlier: Next up (as of R12.8)
- R12.8: ink outlines are one draw, not two (`client/src/game/inkOutline.ts`; `?ink=old` for the old way): −20 to −25%
  draws everywhere. The simulation's garbage 87 → ~10 MB/s (`canonBoxes`, `carSim`, `hyp()`): keep shared objects that
  hot code reads (boxes, cars, move states) in ONE shape, and use `hyp()` not `Math.hypot` in per-tick code. A 240 FPS
  cap (Settings) by default; the BENCHMARK lifts it.
- Measuring garbage: `node --trace-gc` on the shared code compiled with `tsc` (not `tsx`: it wraps every function to keep
  its name, which defeats V8's optimisations) gives the real figure; the sampling profiler only ranks.
- Waiting on Blake: a BENCHMARK on R12.8 (the upstairs views). Then back to features unless it shows a problem.

## Earlier: Next up (as of R12.7)
- R12.7: the city's outline widths share one mesh per tile, props' fixed parts merged, graffiti one mesh, traffic lights
  one draw: outdoor views −26% to −40% draw calls. `tests/draw-budget.mjs` guards it.
- Next performance work: the people (4-6 outlined pieces each), the club crowd seen from the crossroads, memory churn.

## Earlier: Next up (as of R12.6)
- R12.6 shipped: the cantilever balcony and the oxblood/mahogany/gold façade (hanging baskets, the corner sign and
  lanterns), the flicker fixes (Little Italy's arch; decorations clear of their outlines; `tests/flicker-find.mjs`), the
  pub's lamps lighting the people and the games' pieces, WEE MICKEY (night fence + gear) in the back yard, Split the
  G social (release = result, the glass in hand for everyone, the reveal on the bar, the 3-pint challenge), quieter
  far-off pub-game sounds, the benchmark putting you back where you were.
- Waiting on Blake: a play of Split the G (and the challenge) before polishing it; his verdict on Mickey's prices
  (x0.75, black market x0.9, kit $30, smoke $25); his and his mate's BENCHMARK results; picks from
  `docs/expansion-plan.md`.
- Then: the pub brawl, the quiz and the G-split champ; R13: the alleys and fire escapes.
