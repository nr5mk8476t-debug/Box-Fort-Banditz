# Changelog

Every update to Box Fort Banditz, newest first. Each round has its screenshots in `screenshots/<round>/`, and the full reasoning and test results are in `docs/design-decisions.md` and `docs/test-plan.md` (search for the round's name, e.g. "R12.2c").

## R12.2c: SOGGY SHAMROCK fixes, a hard Split the G, Big Dessie, Seamus O'Shortly and the swarm (2026-10-28)

**Fixed**
- **The pub's front door:** some pieces round the corner door were turned 90°. The red base strip ran through the middle of the doorway and a black board stuck out through the top. They run along the wall now.
- **The sign over the door:** the hood and the clock (moved to the east front) no longer cover it.
- **The A-board:** reads the right way up.
- **Upstairs clipping:** fixed the back bar's crown, the canopy's crown and a row of pendants.
- **The round booths upstairs:** they opened onto the wall; now they open onto the room, with a table you can walk round.

**Changed**
- **Split the G is hard now.** It's first person and you can't see the G until the reveal. Perfect is within 2 mm, close within 6 mm, and every pint drains at its own uneven pace.
- **Mammy Moloney is gone.** Seamus O'Shortly, a wee leprechaun, runs the pub:
  - his jobs pay a pot of gold, and now and then a big job pays the big pot;
  - he gives tips once you have 3+ aura.

**Added**
- **The swarm:** six wee buddies swarm anyone who starts trouble in the pub. They pop in from anywhere, nip at you for 8 s (never below 20 hp), then go home.
- **Big Dessie:** a drunk dancer in front of the band, with unpredictable moves.

Tests: 254 shared + 3 client unit tests; matchmaking and server smoke tests; full browser e2e 396/396 at normal speed and with 110 ms lag.

## R12.2b: THE SOGGY SHAMROCK upstairs reworked (2026-10-26)

**Removed:** the céilí (the dance floor, the rhythm game, the band and the dancers).

**Added upstairs**
- **The island bar:** a mahogany island bar under a canopy ringed with marquee bulbs. Róisín the barmaid serves, and you can split the G there too.
- **Darts:** two Flight Club-style darts booths.
- **Pool:** two pool tables, set up for pub 8-ball (reds and yellows).
- **The lounge:** chesterfields, round booths, high tables, and a second fire with wing chairs.
- **The jukebox:** three original tunes; press E for the next one.

Tests: full browser e2e 389/389 (normal and lag).

## R12.2: upstairs at THE SOGGY SHAMROCK (2026-10-24)

- **Upstairs opened:** the function room, Mammy Moloney's whiskey snug, and the corner balcony.
- **Removed:** the square plates on every character's chest (a standing rule now).

## R12.1b: THE SOGGY SHAMROCK rebuilt (2026-10-22)

- **The building:** the whole block, with a Temple-Bar-style red front, bay windows and sash windows.
- **The bar:** a horseshoe bar in glossy mahogany.
- **Inside:** four snugs, plenty of clutter, and eight drinkers.

## R12.1: THE SOGGY SHAMROCK opens (2026-10-21)

- **The pub:** an Irish pub across from the nightclub, with a live session band.
- **Split the G:** a pint mini-game; get tipsy as you drink.

## Earlier

Phases 0–5, the city redesign (C1–C6) and rounds R2–R11.5 are written up in `docs/design-decisions.md`, from the top.
