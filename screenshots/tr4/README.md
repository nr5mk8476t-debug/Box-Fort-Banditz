# TR4: the park's first finished section (2026-11-20)

Real in-game screenshots (`?map=test`, software renderer, HUD hidden): `before-*` is TR3, `after-*` this round, from the
same fixed cameras (`tests/park-measure.mjs`). The section: F1's plot (north-west), the SELL stall, the north path.

| View | Draws | Meshes | Triangles | Frame ms (software, relative) |
|---|---|---|---|---|
| day:01-stall | 75 → 71 | 75 → 71 | 33,996 → 40,652 | 223.8 → 256 |
| day:02-stall-from-below | 73 → 69 | 73 → 69 | 32,972 → 39,628 | 152.6 → 208 |
| day:03-yard-entrance | 82 → 81 | 83 → 81 | 38,118 → 44,822 | 203.7 → 254 |
| day:04-path-approach | 115 → 111 | 115 → 111 | 45,262 → 51,930 | 166.8 → 179.2 |
| day:05-overhead | 117 → 113 | 117 → 113 | 46,138 → 52,804 | 184.1 → 183.6 |
| dusk:01-stall | 77 → 74 | 77 → 74 | 36,966 → 43,628 | 228.5 → 263.6 |
| dusk:04-path-approach | 115 → 113 | 115 → 113 | 42,392 → 51,986 | 175.3 → 197.5 |
| night:01-stall | 77 → 74 | 77 → 74 | 36,966 → 43,628 | 236.3 → 275.8 |
| night:03-yard-entrance | 84 → 83 | 84 → 83 | 38,168 → 44,878 | 211 → 256.1 |
| night:04-path-approach | 115 → 113 | 115 → 113 | 42,392 → 51,986 | 185.6 → 202.7 |

Whole scene: materials 141 → 142, textures 55 → 60 (119.3 → 125.9 MB), meshes 274 → 268; load 5300 → 6942 ms.
