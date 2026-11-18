# Trashington 500: the smallest playable test

Blake's answers (2026-11-18):
1. "500 x 500 m, landmarks out".
2. Keep the original look of Box Fort Banditz, and stop calling it Queens. Grey boxes first.
3. Not sure until a playtest is available.
4. Market lanes at 20 m.
5. Starter yards are junk lots that get upgraded over time.
6. Don't add the WANTED list yet.
7. Build the smallest playable test.

This is that test. The city is grey boxes, built from the plan data, so its distances and sightlines are the real ones.

## How to play it

1. Blake opens the game with `?map=test` on the end of the address, e.g. `https://<the game's address>/?map=test`. The
   badge in the top-right corner says **TRASHINGTON 500 TEST**.
2. Blake presses **CREATE ROOM**, then sends Tyson the invite link (the pause menu's COPY INVITE LINK button). The link
   carries the map. If Tyson types the room code into a normal page instead, his page reloads onto the test map by
   itself before he joins.
3. Blake presses **START MATCH**. Player 1 starts in **F1** (north-west) and player 2 in **F4** (south-west), so both
   are on the museum's side of town.
4. Play a cycle (the 8-minute scavenge, then PREP). Blake's plan is the museum; Tyson's is PLUG & PRAY.
5. When each scavenge ends, **the host's browser saves the playtest report** to Downloads as two files:
   - `trashington500-playtest-<date>-cycle<N>.txt`: plain English;
   - `.json`: everything, including both players' tracks every half second.

   The report is also in the browser console as `__bfb.playtest()`.
6. Then answer the question for each of you: **did spotting the other player change what you decided to do?**

## What's in the test

- **The whole 500 x 500 m city as grey blocks.** Every planned building has its footprint and height; every shop and
  landmark has its name on the door side and a coloured band at its door (orange starter, green mid, purple high-end,
  red landmark). Street-name signs are on the corners.
- **Open: three places.**
  - **PLUG & PRAY REPAIRS:** the inner side of Stain Way, F4's side. TVs, toasters, phones, laptops.
  - **FISHY BUSINESS:** the outer side of Stain Way, next door to the pub. Fish, beans, cheese, the odd golden spork.
  - **THE MUSEUM OF QUESTIONABLE HISTORY:** the south-west corner, on Gnome Ave.
    - A forecourt, and a narrow public door between the columns.
    - One gallery, with heavies on plinths (the jade dragon, the golden accordion, trophies, mirror balls) and giants
      by the goods door (the rubber duck, the arcade machine).
    - **A giant won't go out of the public door**: you're turned back with a message. It leaves through the **GOODS IN**
      door, the goods yard and its gate on Gnome Ave.
- **The two ways home from the museum.**
  - **Up Stain Way** (quick, in view of PLUG & PRAY's door).
  - **Wood Havoc Lane** behind THE SOGGY SHAMROCK and WEE MICKEY's yard (16 m longer, hidden). The lane comes out on
    Gnome Ave opposite the goods yard and on Queasy Blvd at the top.
- **The home block.** Four equal 36 m junk-lot yards, with no walls (walls come with upgrades), the market's 20 m lanes
  and the stalls as markers. Your fort, mat, shelves and PREP work as in the normal game.
- **Not in it:** traffic, police, passers-by, the pub's inside, and the other shops' insides. These are on purpose: two
  players, one city, and what you each saw.

## What the recorder writes down (shared/src/playtest.ts)

- **Every sighting.** A sighting is when you could see each other: a clear line between your eyes, within 90 m by day
  or 54 m at night. For each one it records:
  - where each of you was, by street name;
  - the time;
  - what each of you was carrying;
  - whether you were away from the home block;
  - whether you got close enough to tell what the other was carrying (60 m by day, 36 m at night);
  - what each of you did in the next 20 s: kept going, turned back, stopped or waited, ducked into Wood Havoc Lane, or
    went home.

  Nothing is shown to you while you play.
- **Every trip out of the home block.** Where you went, what you brought back, and which way you came home (Stain Way,
  Wood Havoc Lane, both or other), seen or unseen.
- **What each of you banked** that cycle.

## The numbers

Walked with the game's own movement code: sprint held, real stamina, no collisions. The grey city's corners and kerbs
will add a little.

| | F1 | F4 |
|---|---|---|
| nearest starter shop | 5.0 s | 5.0 s |
| nearest mid shop | 19.4 s | 19.4 s |
| nearest high-end shop | 19.1 s | 18.1 s |
| bank / casino / museum / hotel | 31.6 / 32.5 / 34.0 / 40.9 s | 32.5 / 40.9 / 31.6 / 34.0 s |
| museum giant home (walking, dragging) | 135 s | 126 s |

The whole table, all four forts, is in `data/walk.json`.

## Pictures

| Image | What it shows |
|---|---|
| `img/01-compact-vs-500.png` | The last proposal (408 m) and Trashington 500 at the same scale, and what 25 s of sprinting reaches. |
| `img/02-trashington500-plan.png` | The plan, labelled, with the walked landmark times. |
| `img/03-playable-test.png` | The test: what's open, who starts where, and the two ways home. |
| `../../screenshots/tr1/` | The test in the game (grey boxes): the fort, the market, Stain Way, PLUG & PRAY, the museum, the goods yard, the lane. |
