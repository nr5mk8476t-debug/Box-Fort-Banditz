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
- Target: a steady 60 FPS at 1920x1080 on Blake's PC (the reference; draw-call bound: ~1,900 draws ≈ 7 ms). Budgets
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

## Next up (as of R12.7)
- R12.7: the city's outline widths share one mesh per tile, props' fixed parts merged, graffiti one mesh, traffic lights
  one draw: outdoor views −26% to −40% draw calls. `tests/draw-budget.mjs` guards it.
- Next performance work: the people (4-6 outlined pieces each), the club crowd seen from the crossroads, memory churn.
- Waiting on Blake: a BENCHMARK on R12.7.

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
