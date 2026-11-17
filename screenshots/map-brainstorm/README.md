# Map structure brainstorm (concepts only: nothing here is built)

An exploration of moving all player forts to a shared centre, with value rising outward. **No game code, buildings or
systems were changed.** Every image is labelled with what kind of picture it is:

| Image | Kind | What it shows |
|---|---|---|
| 01-current-map.png | diagram from the game's real map data | Today's new city: forts F1-F4 in the south bowl, low/mid/high stores, landmarks, the "COMING SOON" hoardings (expansion space), measured travel times |
| 02-proposal-A-fort-square.png | annotated proposal | A: forts round one plaza, value in rings |
| 03-proposal-B-cardboard-quarter.png | annotated proposal | B: forts in walled courtyards of a central village, value by distance and direction |
| 04-proposal-C-junk-market.png | annotated proposal | C (recommended): forts round a shared junk market, four themed "petal" districts each running low to high outward |
| 05-proposal-C-centre-closeup.png | annotated proposal | C's centre: front/back gates, mats inside yards, bump points, sightlines |
| 06-proposal-C-routes.png | annotated proposal | Junk, medium and high runs on C, with estimated times |
| 07-10 mock-*.png | mock-scene screenshots | A throwaway scene of plain blocks (not the game, not its art): fort yard to market, leaving to the shops, returning with a giant, aerial |
| 11-13 current-*.png | current-game screenshots | Today's park, today's fort bowl, today's oversized loot; stand-ins only |

## Facts vs estimates
- **Measured** (the game's own movement code, headless, along the walking network, from today's forts): NEEDLE DROP (mid)
  259-272 m, 26-28 s out empty, 53-56 s back heavy; CARAT & RUN (high) 408-451 m, 42-47 s out, 85-93 s back heavy,
  121-135 s dragging a giant. Effective speeds: empty ~9.7 m/s, heavy ~4.8 m/s, giant dragged alone ~2.7 m/s.
- **Measured** draw calls / meshes of today's views (software renderer: relative only): park centre 248/167, wide park
  317/227, fort bowl 114/85.
- **Estimated** (lengths from the drawings x the measured speeds, +0-30% for corners): everything about the proposals.
  Nothing about the proposals' performance has been measured.

## Constraints of the game (for context)
- 4 players max; each cycle is an 8:00 scavenge (5:30 day, 0:30 dusk, 2:00 night) then 2:00 PREP, 8 cycles.
- Loot is banked by standing on your fort's mat; others can steal from forts at night.
- The new city is about 230 m square.

## Open questions
1. Forts visible to each other (spectacle, grudges) or private (courtyards)?
2. Shorter trips: shorten the scavenge, or make high-value loot harder (guards, alarms, weight)?
3. The junk market: free for all, or a limited pile each cycle that you race for?
4. Rebuild the park roundabout as the hub, or keep the park and put the hub elsewhere?
