# Queens: performance and travel measurements

The test box renders in software (SwiftShader) and runs the simulation under `tsx`: its frame and tick times are
**relative only**. Real frame rates need Blake's PC (the in-game BENCHMARK). Every table says how it was measured.

## Stage 0 baseline (main 6fe35d7, 2026-11-17)

### How far you get in 60 s (the game's own movement + stamina code, open flat ground, empty-handed)
`npx tsx tests/sustained-run.ts`

| How you run | 30 s | 45 s | 60 s | 75 s |
|---|---|---|---|---|
| walk only | 200 m | 300 m | **400 m** | 500 m |
| sprint held (empties, recovers at 35%, sprints again) | 291 m | 434 m | **573 m** | 718 m |
| the best pattern found (let go just before empty) | 292 m | 444 m | 586 m | 738 m |

Stamina: ~8 s of sprint, 0.7 s before it refills, refills at 0.5 a second; sprint 10.81 m/s, walk 6.67 m/s.

### The travel matrix on TODAY's new map (all four forts; real movement along the nav graph; cars cleared)
`npx tsx tests/route-matrix.ts new docs/queens/data/route-matrix-current.json`. Seconds: out empty-handed / back with
a heavy thing (an Old CRT TV) / back dragging a giant alone (the Broken Arcade Machine, high-end stores only).

| Destination | F1 | F2 | F3 | F4 |
|---|---|---|---|---|
| RUST BUCKET (low) | 64 m · stuck* | 185 m · 19 / 42 | 45 m · 4 / 10 | 118 m · 11 / 26 |
| PLUG & PRAY (low) | 185 m · stuck* | 64 m · 6 / 14 | 118 m · 11 / 26 | 45 m · 4 / 10 |
| NEEDLE DROP (mid) | 251 m · 25 / 58 | 395 m · 40 / 91 | 255 m · 26 / 59 | 327 m · 33 / 75 |
| PEAK FOMO (mid) | 395 m · 40 / 92 | 251 m · 25 / 59 | 327 m · 33 / 76 | 255 m · 26 / 60 |
| MAISON PONG (high) | 314 m · 32 / 72 / 120 | 442 m · 46 / 102 / 168 | 318 m · 32 / 73 / 121 | 390 m · 40 / 89 / 148 |
| CARAT & RUN (high) | 442 m · 46 / 101 / 167 | 314 m · 32 / 73 / 120 | 390 m · 40 / 91 / 149 | 318 m · 32 / 74 / 122 |
| SOGGY SHAMROCK | 195 m · 20 / 46 | 339 m · 35 / 79 | 199 m · 20 / 47 | 271 m · 28 / 63 |
| NEON FEVER | 339 m · 35 / 79 | 195 m · 20 / 46 | 271 m · 28 / 63 | 199 m · 20 / 47 |
| POLICE STATION | 109 m · 11 / 24 | 120 m · 12 / 27 | 91 m · 8 / 20 | 102 m · 10 / 23 |
| N edge | 362 m · 37 / 83 | 373 m · 38 / 86 | 366 m · 37 / 84 | 377 m · 39 / 87 |
| E edge | 296 m · 30 / 69 | 152 m · 15 / 36 | 229 m · 23 / 53 | 156 m · 16 / 37 |
| S edge | 98 m · 10 / 22 | 109 m · 11 / 25 | 31 m · 3 / 7 | 42 m · 4 / 9 |
| W edge | 152 m · 15 / 36 | 296 m · 30 / 69 | 156 m · 16 / 37 | 229 m · 23 / 53 |

\* From F1 the harness's straight-line steering gets stuck at a corner near (-60, -80) on the way to both low stores;
the other forts reach them. Not yet known whether a player would snag there too: to look at in Stage 2.

What it shows: today's map is **unfair by fort** (the same store is 4 s from one fort and 19 s from another; the high
end is 32 s from one and 46 s from another), and the longest trips (~46 s out, ~100 s back heavy, ~165 s back with a
giant) are already close to the Queens target, just only in one direction. Measured speeds used by the plan: heavy
~4.3 m/s, giant alone ~2.65 m/s; street routes ran within ~3% of the open-ground sprint curve.

In an earlier run with the cars kept, several heavy and giant returns ended with the item knocked out of the player's hands by
a car: a real hazard on the return trip, noted for the crossings work (D-15).

### The host's simulation cost vs NPC count
`npx tsx tests/tick-scale.ts 60`: the world as the server makes it, 4 players moving, a scavenge running, 60 s per trial.

| Roaming NPCs | live NPCs (incl. the map's own) | cars | mean ms / tick | 99th ms / tick |
|---|---|---|---|---|
| x0 | 76 | 24 | 0.464 | 1.801 |
| x1 (20, today) | 98 | 24 | 0.468 | 1.408 |
| x2 | 117 | 24 | 0.495 | 1.324 |
| x4 | 156 | 24 | 0.674 | 1.905 |

The simulation isn't the risk: doubling the live NPCs costs ~0.2 ms a tick here (budget 16.7 ms for everything the host
does; the host also renders). Collision lookups use a spatial grid, so a bigger city doesn't make each tick slower in
proportion (read in `arena.ts`; measured again on the blockout).

### Not measured yet (each has a Stage 2 test)
- **Drawing beyond the fog:** the fog ends at 240 m by day, 150 m at night, but the camera draws to 500 m. Today the
  whole city is inside 240 m; in a 940 m city, everything between the fog and 500 m would be drawn unseen. Fix:
  distance culling at the fog's end, measured before/after.
- **The hub view:** four forts with full shelves, the market's stalls and players, all in one view (today's fort bowl:
  114 draws / 85 meshes; the park's wide view: 317 / 227).
- **Long sightlines:** the avenues and the elevated line seen from far away.
- **Load time and memory** of the bigger city; network bytes per client with more NPCs and cars.
- **Real frame times:** Blake's BENCHMARK, solo and hosting with a friend.

## Stage 1: the plan's estimates
Generated: [city-plan.md](city-plan.md) (travel matrix, fairness, scavenge fit). Plan estimates only; Stage 2 walks
the blockout with `tests/route-matrix.ts` and puts measured and estimated side by side here.
