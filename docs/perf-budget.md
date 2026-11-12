# Performance budget (R12.5)

The aim: a **steady 60 FPS (16.7 ms a frame) at 1920×1080** on Blake's PC, the reference machine. Until Blake's benchmark
result is in, every number below is a **proposal**: the test box renders in software (SwiftShader, about 1 FPS), so it
measures CPU work, how much is drawn and where the hitches are, but not a real graphics card's speed.

How to measure: pause menu → **BENCHMARK** (about 3 minutes; the same route every time: the fort, the first road, the
pub outside, downstairs, upstairs pool and darts, the balcony, back out, then the views again at night). Copy the result.
On the test box: `CLIENT_URL=... OUT_DIR=... LABEL=... node tests/perf-route.mjs`; compare two runs with
`node tests/perf-compare.mjs before.json after.json`.

## The reference PC after R12.8 (build 0248648, Blake's BENCHMARK, 2026-11-12): it's the MESHES, not the draws

Same PC and settings. **Overall about the same as R12.7**: median 4.0 → 4.1 ms, 99th 8.4 → 8.2, 1% low 104 → 108 FPS,
worst 22 → 24 ms. Balcony along the front 6.1 → 6.0 ms (1% low 98 → 141), out of the window 5.9 → 6.2 (89 → 89).

**The lesson**: R12.8 cut draw calls 17-23% (balcony front 1,105 → 911) with the number of meshes the engine processes
unchanged (654 → 667), and the render call didn't move (4.9 → 4.9 ms). So on this PC the frame follows the **meshes
drawn** (Babylon's CPU work per mesh: its world matrix, binding its material, uniforms and lights; ~7 µs each), not the
WebGL draw calls themselves: the outline's depth-only pass was nearly free. R12.7 worked because merging cut meshes
and draws together. **To make a view faster: fewer meshes (merge, instance, hide what's far or behind walls) or less
CPU per mesh (freeze static meshes' world matrices and materials)**; draw counts alone don't predict it.

**Garbage**: the first walk 98 → 16 MB/s (−84%). The 4-second legs' heap figures are rough (the browser updates its
heap size lazily): ~35-45 MB/s standing still, so the frame side (drawing, the HUD) still makes some; no frame over
24 ms anywhere, and the odd 13-24 ms frame remains (not the GC: its pauses are ~1 ms now).

## The reference PC after R12.7 (build 01ce133, Blake's BENCHMARK, 2026-11-12)

Same PC, browser, window (2560×1277) and settings as the runs below. Compared with R12.6 (005a42f): **the median frame
went from 5.5 to 4.0 ms (−27%), the 99th from 11.5 to 8.4 ms, the 1% low from 78 to 104 FPS, and the worst frame from 36 to 22 ms.**
Every stretch got faster. None had a frame over 50 ms.

| Stretch | Median 005a42f → 01ce133 | Draws |
|---|---|---|
| Balcony, along the front (busiest) | 8.3 → 6.1 ms (164 FPS) | 1,595 → 1,105 |
| Out of the pub window | 7.9 → 5.9 ms | 1,520 → 1,106 |
| City street | 7.6 → 5.1 ms | 1,352 → 929 |
| Pub from across the road | 6.7 → 5.4 ms | 1,272 → 1,101 |
| Downstairs bar | 4.7 → 3.2 ms | 608 → 500 |
| First approach (walk) | 5.9 → 3.8 ms | 1,004 → 708 |

The render call is still almost the whole frame: about 4.4 µs a draw (1,105 draws ≈ 4.9 ms). The low 1% lows (83–98 FPS on
the balcony front, the window and the walks; one-off 14–22 ms frames) are not draw counts. They line up with garbage
collection: **about 80–100 MB a second of heap churn** (the first walk: 103 collections, 2.9 GB in 30 s). That is now the
next target, ahead of the people's draws.

## The reference PC: Blake's, measured (R12.5b, build 04d267f)

Brave on Windows, 2560×1277 (pixel ratio 1), full detail, solo, the BENCHMARK route. (The first run came out at
15 FPS: Brave had switched its hardware acceleration off. The game now warns about that on the title screen.)

| Stretch | Median | 99th | What limits it |
|---|---|---|---|
| Downstairs bar, fireside, upstairs pool and darts | 3.1–4.2 ms (240–310 FPS) | under 6.2 ms | |
| Pub from across the road, the entrance, a city street | 5.3–6.3 ms (~160 FPS) | under 8.4 ms | |
| Out of the pub window | 7.4 ms (~135 FPS) | 9.8 ms | |
| Balcony, along the front (busiest) | 8.0 ms (~125 FPS) | 10.2 ms | 1,870 draw calls |
| Walks | 3.6–4.8 ms | 7–12 ms | |

**60 FPS is met with about 2× headroom in the busiest view.** On this PC the frame time is almost exactly the CPU's
render call (issuing the draw calls): it's **draw-call bound, not GPU bound**. About 1,900 draws ≈ 7 ms of render
call. Garbage: about 60 MB a second while walking (no spikes yet: 99th 11 ms), worth trimming before the city is busier.
Still needed: the slowest friend's PC, and a 4-player hosting run.

## The frame budget (16.7 ms on the reference PC)

| Part | Budget | What's in it | Where it shows in the benchmark |
|---|---|---|---|
| Game update | 2 ms | input, camera, the player's prediction, NPC and car drawing positions, pub games | `cpu upd` |
| World (solo / hosting) | 2 ms | the authoritative simulation: players, NPCs, traffic, police, pool physics | `cpu wld` (hosting: `hostWorldMsPerTick`) |
| Applying the World / network | 1 ms | copying the state into the scene; reading the host's messages | `cpu apl`, `netMsPerMsg` |
| Render (CPU side) | 4 ms | culling, sorting, one WebGL call per draw | `cpu rnd`, draw calls |
| HUD | 0.5 ms | the DOM | `cpu hud` |
| GPU | 10 ms | triangles, pixels, lights, outlines | not measurable in most browsers: render scale tests narrow it down |
| Headroom | rest | the browser, garbage collection, the odd spike | |

## Scene budgets (any one view)

| | Budget | Measured now (test box, before R12.5) | Notes |
|---|---|---|---|
| Draw calls | 1,500 (busiest view), 600 (indoors): Blake's PC is draw-call bound (~1,900 ≈ 7 ms) | 1,000–1,450 street, 470 bar | each outlined mesh is two draws |
| Triangles | 800k street, 500k indoors | 0.9–1.7 M everywhere (1.05 M at the darts!) | half were city-wide merged meshes nobody could see |
| Real lights on one mesh | 6 (sun + sky + 4) | 7 | interiors: 4 a floor at most (LIGHT_BUDGET) |
| Shadow casters | as now (drawn once) | 33 merged casters, one 2048 map, refreshed once | shadows cost 7–9% here: not the problem |
| Frames over 50 ms | none on the route after the first approach | first approach 2.8 s spike | hitch = anything over 50 ms |
| Loading | under 25 s on the reference PC | 21–31 s on the test box | keep the load-vs-hitch trade visible |

## The per-change budget

Any one addition (a building, a street, an interior, an activity) may make any stretch of the route at most:
**median +10%, slow frames (99th percentile) +20%, draw calls +15%, triangles +15%, and no new frames over 50 ms.**
`tests/perf-compare.mjs` flags anything over it. A flag means *find out what it costs and fix that* (see the content
guide), not *turn the whole game's graphics down to pay for it*.

## What that means for new content

- **A detailed building** (façade, signs, window boxes): free when it's out of view (the city is merged by 64 m tiles
  now). In view: its pieces add triangles; small pieces (under 1.2 m) stop drawing past 110 m. Rough guide: a building
  with 20–40k triangles of detail is fine; the pub's façade had 480k (tiny spheres of 256 triangles each), now a
  fraction of that.
- **A populated street**: passers-by cost CPU in the World (collision, avoidance: about 0.02 ms each a tick on the test
  box) and draws on the client (each NPC is a few merged meshes + outlines). Those beyond 90 m of every player update at
  10 Hz instead of 30. More people where the players are is fine; a crowd in every street isn't free.
- **An interior**: built with the city, drawn only when it can be seen (InteriorArea: floors, the outside distance with
  a gap, stairs). Its lamps light only its own floors (at most 6, 4 a floor). An interior you're not near costs nothing
  to draw.
- **An activity** (a game, a stall): its simulation runs in the World only while someone's using it; its drawing parts
  live in the area's groups.

## Testing limits

- The test box has no GPU: GPU time is "unavailable" in its reports. The render-scale experiment (50% resolution cut
  25–33% of the frame) shows pixels matter; how much on a real card needs Blake's benchmark.
- Hosting and joining on the test box run several software-rendered windows on one 4-thread CPU: their frame times are
  slow for that reason; the host's World cost and the message sizes are the useful numbers.
- Synthetic stress modes (`?test=1&stress=city2`, `stress=npcs2`) are labelled in the report and never shipped.
