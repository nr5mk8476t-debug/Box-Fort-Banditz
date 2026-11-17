# Queens: the city and progression overhaul

The working folder for the overhaul in Blake's brief ("Box Fort Banditz: Queens city and progression overhaul"). It
survives between sessions: read it before touching the overhaul.

| File | What's in it |
|---|---|
| [plan.md](plan.md) | The staged plan: scope, every stage's checklist and exit test, where we are |
| [decisions.md](decisions.md) | The decision log: what was decided, by whom, and what it costs |
| [questions.md](questions.md) | Open questions for Blake (none of them blocks the next stage) |
| [perf.md](perf.md) | Performance and travel measurements: before/after tables, how each was measured, what's unverified |
| [city-plan.md](city-plan.md) | GENERATED from the plan data: the map, the travel matrix, fairness, plots, floor areas, materials, the railway |

## Where things live

- **The plan as data:** `shared/src/queens/plan.ts` (roads, crossings, paths, districts, plots, forts, the railway,
  materials). Not wired into the game until the Stage 2 blockout is accepted.
- **Its rules and route model:** `shared/src/queens/check.ts`; tests in `shared/test/queens-plan.test.ts` (they also
  prove the checker catches a broken plan).
- **The generated map and tables:** `npx tsx tests/queens-plan-report.ts` (writes `city-plan.md`, `img/`, `data/plan.json`).
- **Measurements with the real game code:** `tests/route-matrix.ts` (fort-to-everywhere travel with the real movement),
  `tests/sustained-run.ts` (60 s of running under the real stamina rules), `tests/tick-scale.ts` (host cost vs NPCs).

## Labels on pictures

Every picture says what it is: **diagram from data**, **annotated proposal**, **mock-scene screenshot** (throwaway
blocks), **blockout screenshot** (in the game, grey boxes) or **gameplay screenshot** (finished). Concept art is never
used as proof that something exists.
