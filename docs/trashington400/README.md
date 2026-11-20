# Trashington 400: the playable test, round 2

Blake, playtesting the 500 m test (2026-11-20):
- "the Boxfort areas just seem a little bit too big... shrink the whole square accordingly";
- "shrink the city down to 400 by 400... I want quick dopamine... iconic little areas... not a massive big open world.
  It's more an arcade game where you go out, you loot, you bring loot back."

He also sent four photos (a home lot, Stain Way's repair shop, the museum's GOODS IN door, Wood Havoc Lane).

His picks:
- **Yards:** 18 x 18 m (half).
- **City:** 400 x 400 m.
- **Pace:** 10% faster on foot.
- **Look:** dress the test route like the photos.
- **Names:** keep the game's names (THE SOGGY SHAMROCK, THE MUSEUM OF QUESTIONABLE HISTORY).

## How to play it

https://box-fort-banditz.pages.dev/?map=test. The badge reads **TRASHINGTON 400 TEST**.

1. Blake: **CREATE ROOM**, then send Tyson the invite link.
2. **START MATCH**. Player 1 starts in F1 (north-west) and player 2 in F4 (south-west).

The host's browser saves the playtest report to Downloads at the end of each scavenge (`trashington400-...` is the
plan; the report files are still called `trashington500-playtest-...`).

## What changed from the 500 m test

- **The home square:** 18 m yards and 10 m market lanes (the stalls in the square's corners, the board in the middle).
  The whole block is 46 m across (was 92), at ground level so the forts and the DEPOSIT mats sit on it properly.
- **The city:** the avenue loop at +-100 m (was 146), the edge roads at +-192 m (was 242). The landmark doors are 20 m
  past their corners (was 30).
- **The starter shops** sit on their spoke's corner, facing the spoke: the smaller ring is too short for a shop to face
  it.
- **The El** runs from the top edge to the east edge on the casino side, so it crosses each avenue square-ish.
- **Pace:** walking, sprinting and crouching are 10% faster on this map only (`arena.pace`). The normal game is
  unchanged.
- **The dressed route, after Blake's photos.** The rest of the city stays grey.
  - **Home lots:** brown dirt yards with tufts of grass and stones. The fort, its flag and the DEPOSIT mat are the
    game's own, and the mat's lettering shows now.
  - **Stain Way, Gnome Ave to Queasy Blvd:** both sides are coloured terraces (brick and render) with windows and lamp
    posts.
    - **PLUG & PRAY REPAIRS:** a teal shopfront with its fascia sign, a big window with a telly on a table, and a
      yellow plug on a bracket hanging over the pavement.
    - **FISHY BUSINESS:** a blue shopfront.
  - **The museum's GOODS IN door:** stone walls, the roller shutter rolled up, yellow bollards, a hatched loading bay,
    pallets of boxes, cones, and the museum's banner on the wall. Inside, the giant rubber duck waits on a red dolly.
  - **Wood Havoc Lane:** THE SOGGY SHAMROCK in oxblood brick. Its back door on the lane: a green door up a step, the
    pub's sign beside it, a lamp, the drainpipe and a green wheelie bin, with lamp posts along the lane.

## The numbers

Walked with the game's own movement code: sprint held, real stamina, no collisions, at today's speed. The test map is
10% faster, so it takes about 10% off each time.

| | F1 | F4 |
|---|---|---|
| nearest starter shop | 4.0 s | 4.0 s |
| nearest mid shop | 14.8 s | 14.8 s |
| nearest high-end shop | 14.9 s | 13.4 s |
| bank / casino / museum / hotel | 20.8 / 22.5 / 23.6 / 27.3 s | 22.5 / 27.3 / 20.8 / 23.6 s |
| museum giant home (dragging) | 96 s | 88 s |

At the test map's pace, the nearest landmark is about 19 s and the far corner about 25 s. All four forts are in
`data/walk.json`.

## Pictures

| Image | What it shows |
|---|---|
| `img/01-500-vs-400.png` | the last test (500 m) and this one (400 m) at the same scale |
| `img/02-trashington400-plan.png` | the plan, labelled, with the walked landmark times |
| `img/03-playable-test.png` | the test: what's open, who starts where, the two ways home |
| `../../screenshots/tr2/` | the test map in the game: the home lot, the market, Stain Way, PLUG & PRAY, the museum's GOODS IN, the gallery, Wood Havoc Lane, from above |
