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

## Process safety
- Never `pkill` (or `pgrep -f`, or a kill loop over grep) a pattern that appears in your own command line. Kill by PID, in a separate command from the launches. List with `ps -o pid,args -p ...` first.

## Next up (as of R12.5)
- R12.5 shipped the performance foundation: the city merged by 64 m tiles (small pieces drawn within 80-95 m), glow batches, outline widths in 8 steps, size-scaled spheres, no material scans while building, NPC simulation levels (far from every player: 10 Hz), interior areas (`client/src/game/areas.ts`, the pub as the worked example), render scale / adaptive resolution / the developer overlay, the BENCHMARK (pause menu), `tests/perf-route.mjs` and `tests/perf-compare.mjs`.
- Before adding content: read `docs/content-guide.md`; check `docs/perf-budget.md` with the BENCHMARK before and after.
- Waiting on Blake: his and his mate's BENCHMARK results (to set the real budgets), and his picks from `docs/expansion-plan.md`.
- Paused (Blake): the black market dealer, extra decoration, the bigger Split the G. Then: the pub brawl, the quiz and the G-split champ; R13: the alleys and fire escapes.
