# Changelog

Every update to Box Fort Banditz, newest first. Each round has its screenshots in `screenshots/<round>/`, and the full reasoning and test results are in `docs/design-decisions.md` and `docs/test-plan.md` (search for the round's name, e.g. "R12.2c").

## R12.3b: pool shots play out, timers tell the truth, traffic keeps moving, pavements join cleanly (2026-11-07)

**Fixed**
- **Pool shots skipping:** sometimes the balls jumped straight to where they stopped. There were three causes:
  - The game's shared clock is sent rounded to 0.1 s. About 1 shot in 4 began just after a rounding step, looked 599.9 s old, and started at its last frame.
  - Shot numbers start again every game, so the first shot of a new game with the same number as one you'd already watched was skipped.
  - A black on the break re-racked with the shot count back at 0.

  Now each shot has its own name (game + shot), the timing copes with the clock wrapping and rounding, and a window that falls behind plays the shot from the start a bit faster until it catches up. If your tab was in the background and a whole shot came and went, it's replayed quickly. If more than one did, the game tells you how many you missed.
- **Your turn waits for the replay:** you step up to the table only once your window has finished showing the last shot.
- **Countdowns:** the shot and throw clocks, the "reconnecting" and "walked off" timers now count down on screen. They used to freeze until something else happened at the table.
- **One game finishing doesn't touch another:** a game ending at table 1 (or a board) used to pull you off your cue at table 2, or close your menu.
- **Ball in hand:** the white now stays where you put it while you aim. It used to jump back, away from the cue.
- **Pockets:** the holes in the cloth sit exactly where the balls drop. The middle ones used to start 2 cm out on the playing surface. You can also no longer see through the pocket cups to the cloth.
- **Police jams:** patrol cars and ordinary cars used to sit nose to nose, each waiting for the other, and within a minute the jam spread over the whole city for the rest of the game.
  - Police cars now drive in the lanes with everyone else. With the siren on they get through junctions first and pick their way to you.
  - A car that drops an officer off stops in its own lane, waits about 8 s and moves on, circling the area.
  - No more clipping through cars, driving on the pavement or blocking a road for good.
- **Two cars merging into the same lane** at the same moment no longer drive into each other.
- **Pavements:** they used to overlap or clip:
  - round the roundabout the square pavement ran 0.6 m into the curved pieces, at the same height, so it flickered;
  - along the two diagonal roads a smooth strip sat 2 cm above the stepped pavement you actually walk on;
  - beside some kerbs there was a thin strip with no pavement.

  Every piece is now cut to meet the next edge to edge, at one height, and the ink line only draws the kerbs, not every join.
- **The HUD:** the "SOLO SCAVENGE / Press ENTER to start" card no longer stays up for the whole game.

**Changed**
- **Pool and darts HUD:** a compact panel in the top-right corner while you aim, showing:
  - who's playing and whose turn it is;
  - the colours left, or the darts scores;
  - the clock, and your power or steadiness;
  - the keys in one line.

  The full instructions show for your first two games, then with **H**. While you aim, the home arrow, cash list and inventory step aside. Health, heat and the match clock stay, because the pub isn't a safe zone.
- **Disconnects (Blake's call):** a dropped player's seat is still held 45 s. If they're still gone after that and the other player's still here, it's a forfeit, so pulling the plug can't dodge a losing bet. If both are gone, or the host's gone, the game's called off and stakes come back. Stakes are still taken and paid out exactly once.
- **Police cars arrive a few seconds later** than before, because they now drive round the corners instead of cutting across.

## R12.3: pool and darts upstairs at THE SOGGY SHAMROCK, and one 8-minute scavenge (2026-11-06)

**Added**
- **Pool on both upstairs tables:** pub 8-ball by our house rules.
  - Reds v yellows; the first pot after the break picks your colour.
  - A foul gives the other player two visits; the white goes behind the baulk line.
  - The black early, with the white or on a foul loses; the black on the break means a re-rack.
  - **Controls:** E at the table, then crouch over the cue ball and aim with the mouse. Hold the click, pull back for power and let go to strike.
  - **Aim guide:** a line to the first ball, a ghost ball, and where both go.
  - Play HUGHIE (the regular by the pool) or a mate.
- **301 darts at both oches:** double out, three darts a visit, the bull counts as a double, and busts are explained.
  - Aim with the mouse. Your hand sways gently and the ring shows exactly where the dart will land; hold SHIFT to steady it. Pints make you sway more.
  - Play BIG DINNY or a mate. The cabinet doors chalk up the scores, with a checkout hint.
- **Bets:** optional, $5–50, taken once and paid out once.
  - NPCs bet up to $20 and can only lose $40 a cycle each.
- **Spectators and players joining late** see the real game: the balls rolling, the darts in the board, the scores.

**Changed**
- **One 8-minute scavenge:**
  - **Day:** about 5½ minutes.
  - **Sunset:** 30 seconds, and you keep playing through it.
  - **Night:** 2 minutes. Fresh x2 loot appears, fort raids are on, and the cops get tougher.
  - Nothing's wiped and nothing's lost until sunrise.
- **The pool room:**
  - The tables were moved apart, so two people can shoot at once with full-length cues.
  - They're proper 7 ft pub tables now: real-size balls, real cushions and jaws, pockets you can see down into, a ball-collection window, and a low three-shade lamp.
  - New round the room: a spectators' ledge (drinks well away from the cloth), the cue rack, chalk scoreboards, house rules, league photos and a trophy shelf.
- **The darts booths:**
  - A WDF-sized board in a mahogany cabinet, lit by brass picture lights. No ring of bulbs any more.
  - A bottle-green scoreboard and leaded glass.
  - A brass oche exactly 2.37 m from the board's face, with the bull 1.73 m up.

**Fixed**
- **The darts oche** was 16.5 cm short, and the bull rings were drawn about 60% too big.
- **The jukebox's name plate** read backwards.
- **Refusals** ("Not your turn.", "Wait for the balls to stop.") reached the player blank.
- **Server-hosted rooms** didn't show the tables, boards or scores changing.
- **The table's menu** missed a quick "1" straight after E on a slow PC.

**Rules for pub games**
- **Last orders:** no new games 90 s before sunrise.
- **Sunrise:** unfinished games are called off and stakes refunded.
- **Dropped connection:** your seat is held 45 s.
- **Walking off:** going downstairs or getting arrested forfeits. Fetching a pint is fine.

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
