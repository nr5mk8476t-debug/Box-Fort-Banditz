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
- Keep the repo to 100 tracked files of code and docs. `CHANGELOG.md`, `CLAUDE.md` and `screenshots/` don't count towards the cap.

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

## Next up (as of R12.3b)
- R12.3 shipped pool (pub 8-ball, Hughie) and darts (301, Big Dinny) upstairs, plus the 8-minute scavenge (day, sunset, night).
- R12.3b fixed pool shots skipping, frozen countdowns, one station's ending kicking you off another, the police/traffic deadlock (cop cars now drive in the lanes), and the pavement overlaps; it also cleaned up the pool/darts HUD and changed disconnects to a forfeit after the 45 s hold.
- Wait for Blake's feel notes: the manual checklists for R12.3 and R12.3b in `docs/test-plan.md`.
- Then: the pub brawl, the quiz and the G-split champ. Then R13: the alleys and fire escapes.
