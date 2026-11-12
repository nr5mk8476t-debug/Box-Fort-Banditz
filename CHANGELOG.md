# Changelog

Every update to Box Fort Banditz, newest first. Each round has its screenshots in `screenshots/<round>/`, and the full reasoning and test results are in `docs/design-decisions.md` and `docs/test-plan.md` (search for the round's name, e.g. "R12.2c").

## R13 (in progress): six new stores, two per district (2026-11-12)

- **Six stores on the new map**, each replacing one painted-on building, in mirrored pairs (nothing else in the city
  moves): RUST BUCKET SALVAGE and PLUG & PRAY REPAIRS in The Yards, NEEDLE DROP RECORDS and PEAK FOMO OUTFITTERS in the
  middle, MAISON PONG and BONBON VIVANT on Snob Row.
- **What they do** (using the systems the game already has): a keeper behind the counter, a till you can hold up, real
  stock on the shelves (taking it is shoplifting), the counter (E: sell the specialist what you're holding, or buy the
  store's one thing: trail mix, a spritz that takes heat off, a sugar-rush truffle), a rummage spot once a day, a display
  case you can smash. Snob Row's heat is double.
- **NEEDLE DROP RECORDS is built in full** (record bins, the $1 bin, a sleeve wall, the decks on the counter, the golden
  record in the case, the neon, the A-board). The other five are blockouts with their signs, lamps and one feature each,
  waiting on Blake's review of NEEDLE DROP.
- Each keeper has their own look. Pictures for all six come off one shared sheet; each store is an interior area with
  two lamps.
- Performance: every store view within the R12.9 count +15% (+3% to +8%); see `docs/perf-budget.md` (R13).

## R12.9: faster on your feet, and Blake's pub playtest list (2026-11-12)

- **Movement +15%**: walk 5.8 → 6.67 m/s, sprint 9.4 → 10.8, crouch, slide and dodge with them, and getting going and
  stopping 15% snappier so it feels the same, just quicker. **The police on foot +15% too** (run 6.5 → 7.5), so a chase
  balances like before: you still outrun a cop at a sprint, not at a walk.
- **The balcony's brackets** bolt to an iron plate on the black fascia board (they started inside it and seemed to
  float), and the two that hung in mid-air in front of the cut corner (its wall is 2 m further back) are replaced by a
  pair coming square off the angled wall.
- **The cornice** carries on round the back of the pub instead of stopping at the corners, and **stone quoins** run up
  every outside corner of the upper floor.
- **The flickering painting left of the fireplace** was a gilt mirror with pictures hung over it in its own plane (the
  west wall's mirror too): the pictures keep clear of the mirrors now.
- **The side entrance** is a proper pub doorway: two panelled red doors folded back, the name in gold in the fanlight,
  a FÁILTE ("welcome") mat. No more SIDE BAR boards.
- **The bunting** no longer hangs across the stairwell.
- **Seamus's snug** has a real wooden door (E opens it; it swings shut behind you a few seconds later, never on someone
  standing in it) and **SEAMUS'S SNUG in shamrock-green neon** over it.
- **The upstairs bar**: the gold line through THE SOGGY SHAMROCK and GUZZLE'S on the canopy is gone.
- **The balcony floor outside the French doors** is back: seen from inside the pub it vanished (it was filed under an
  upstairs room's lights-and-visibility group by mistake).

## R12.8: a steadier frame rate: one draw per outline, a fifth of the garbage, and a 240 FPS cap (2026-11-12)

Blake's BENCHMARK on R12.7: the slowest views were upstairs in the pub looking out (~160 FPS, dips to 83-98), and the
counter jumped about a lot. Two causes, both fixed at the source, with no visible downgrade:
- **Every ink outline is one draw call instead of two.** Babylon drew each outline twice (once in colour, once more
  only to write depth), so an outlined thing cost three draws. Now it's drawn once (the outline's back faces, depth
  on): two draws. **−20 to −25% draw calls in every view**: balcony 996 → 775, out of the pub window 887 → 711, the bar
  447 → 337, Little Italy 1,000 → 765, street 700 → 585. It also **flickers less** (5 of 7 test views roughly halved) and
  fixes Little Italy's arch, which looked solid green from the pub balcony (the old outline covered its stripes).
  Outline edges move by about a pixel in places; nothing goes missing or doubles up.
- **Five times less garbage**: the game's simulation made 87 MB of short-lived data a second (Blake's benchmark
  measured 80-100 MB/s); the browser has to stop and clean that up, which caused the frame-time spikes. Now about
  10 MB/s (−89%), with 6× fewer clean-ups, and the simulation runs 2.6× faster (0.94 → 0.36 ms a tick). The main
  cause: the city's 3,900 collision boxes came in 25 different object shapes, and the browser handed back a new number
  object every time collision code read one of them. They're now all built in one shape, and so are the cars;
  `Math.hypot` became a plain square root; the traffic's per-car checks reuse their scratch space.
- **Frame rate cap** (Settings): Off / 240 / 165 / 144 / 120 / 60, **240 by default**. Frames past your screen's
  refresh never show; the BENCHMARK lifts the cap while it measures.
- **Fixed**: `tests/draw-budget.mjs` didn't run at all after a last-minute edit in R12.7 (a comment swallowed the end of
  a line). The budgets are tightened to the new counts.

## R12.7: a third fewer draw calls outdoors, and a draw-call budget test (2026-11-12)

**Faster** (no visual change: before/after screenshots match pixel for pixel, apart from people and cars moving):
- **The city's outlines**: each 64 m tile had a separate mesh for each of 7 outline widths. Each piece's width now
  rides on its shape, so they share one mesh. The biggest single win.
- **Props** (street stalls, doors, vending machines...): their fixed parts are merged; a stall was 20-30 draws, now 2-3.
- **Background graffiti**: one mesh and one texture sheet instead of 40-odd.
- **Traffic lights**: one draw each (was three). **Pigeons**: one each (was two).

Draw calls per frame (test machine): balcony front 1,550 → 942 (−39%), street 1,146 → 713 (−38%), out of the pub
window 1,433 → 856 (−40%), Little Italy 1,329 → 980 (−26%), the pub bar 495 → 443 (−11%).

**New**: `tests/draw-budget.mjs` counts the draw calls in 10 fixed views and fails when one goes over its budget
(`tests/draw-budgets.json`). Draw counts are the same on any machine, so this catches what made R12.6 slower.

## R12.6b: claw back some of the pub's frame time (2026-11-09)

Blake's BENCHMARK on R12.6 was 4-29% slower than R12.5b in places (worst inside the pub: the bar +24%, the fireside +29%).
- **Wee Mickey and his gear aren't drawn from inside the pub** any more (they were, through the back wall), and his
  gear is 4 plain pieces instead of 9 outlined ones: about 13 draw calls fewer at the fireside.
- **The pub's lamps' lists** are changed without Babylon re-checking every mesh in the scene each time (a stutter
  waiting to happen whenever people came and went).
- Still to measure on a real PC: lighting the people inside with the lamps (the likely remaining cost).

## R12.6: a proper pub front, no more flicker, WEE MICKEY, and Split the G with your mates (2026-11-09)

**THE SOGGY SHAMROCK**
- **The balcony** hangs off the wall on curved iron brackets (a cantilever): nothing on the pavement holding it up.
- **The front**: deep oxblood paint, polished mahogany panels and sills, thin gold lines, cream window bars; hanging
  baskets on iron brackets instead of the strip of flowers along the top; at the corner door a hanging pub sign and
  two brass lanterns.
- Fixed: two green slabs sticking out at the corner; a ceiling triangle poking out over the door and on the roof; the
  SIDE BAR mat upside down; a sill across the side door.
- **At night the people inside are lit by the pub's lamps** (they were lit by the sky: grey-blue in a warm room), and so
  are the pool balls, cues and darts.

**No more flicker**
- **Little Italy's sign**: the arch's coloured bands fought over the same spot (and drew lines over the name board). It's
  one clean arch now.
- **Mirrors, pictures, clocks and signs** in the pub sat a hair in front of their frames and flickered (some showed as
  solid gold boards). They all sit properly clear now.

**WEE MICKEY** (new): the night fence in the pub's back yard, by the cellar hatch (in along the back of the pub from the
east street, or down the alley from the north).
- After dark he buys the loot in your hands for more than the pawn shops (75% of its worth), even the black-market
  stuff nobody else touches. Every deal is a bit of heat (more if a cop sees). By day: "come back when it's dark".
- His gear (one of each): a **LOCKPICK KIT** ($30: your next stretch in the cells is halved) and a **SMOKE BOMB** ($25:
  the next time a cop grabs or tasers you, it goes off and you slip away).

**Split the G with your mates**
- **Where you let go is your score** (the head doesn't settle on any more).
- **Everyone sees you drink**: the pint in your hand, raised to your mouth, the line going down.
- **The reveal**: your glass is set down on the bar with the distance over it, for everyone to see.
- **The G CHALLENGE**: press E on the chalk card on the bar. Anyone in the pub has 25 s to join; 3 pints each, the lowest
  total wins $10. Walk out, drop out or run out of time and you're out: nobody can hold the others up.

**Also**: the pool tables and dartboards across the room sound quieter than the one you're at; a short pool shot no
longer flashes by in one frame on a slow screen; after the BENCHMARK you're put back where you were.

**Performance**: no measurable cost (draw calls flat or down, frame times within noise, on the test box).

## R12.5b: a warning when the graphics card isn't being used, and fixes from review (2026-11-08)

**New**
- **"Your browser isn't using your graphics card"**: if the browser is drawing the game in software (hardware
  acceleration off), the title screen says so, with the steps for your browser (Chrome, Edge, Brave, Firefox).
  Blake's PC went from 180-200 FPS to 15 like this: Brave had switched it off.

**Fixed** (several found by a review Blake shared)
- **Adaptive resolution stayed blurry**: on a 60 FPS screen it never came back up (it wanted frames under 14 ms, which a
  60 Hz cap never gives). Now it comes back when the 60 FPS target's met, and waits longer each time a step up doesn't
  hold, so it doesn't flicker between sharp and soft.
- **The benchmark on a fast PC**: it stopped recording after 20,000 frames (the night views came out empty); a tab in
  the background counted as a huge freeze. Now it records any length, leaves paused moments out (and says so), and
  marks anything it couldn't measure. It also records the render scale, adaptive resolution and high-DPI settings, and
  every run starts at full resolution.
- **Split the G**: alt-tabbing (or clicking away) mid-drink kept the pint gulping. Now losing the window lets go, and the pint takes the mouse and SPACE the moment it's poured (a let-go in its first frame used to be missed).
- **Watching a mate throw darts**: you could see the dart twice (stuck in the board and flying in) and hear the
  impact twice. Now one dart, one thud.
- **Crowds**: people stepping apart now only check those next to them (it checked every pair: fine now, but it would
  have grown fast with a bigger population).

## R12.5: faster round THE SOGGY SHAMROCK, a BENCHMARK button, and a foundation for a bigger city (2026-11-07)

**Faster**
- **The whole city isn't drawn from everywhere any more.** The city used to be merged into huge meshes that each
  covered the whole map, so even from inside the pub the game drew the city behind the walls. It's now in 64 m tiles:
  what you can't see isn't drawn, and little things (sills, signs, plants) stop drawing once they're far enough to be
  lost in the fog. On the test route: **40–66% fewer triangles, every stretch 17–37% faster**, the worst frame on the
  first walk to the pub halved.
- **The pub's façade is much lighter**: its ~1,900 tiny flowers and beads and its fairy lights were drawn with far more
  detail than anyone could see (about 480,000 triangles); now a fraction of that, looking the same.
- **Fewer draw calls where it mattered**: Chinatown's lanterns and Little Italy's festoon lights are drawn in batches
  instead of one by one.
- **Loading does less**: building the city no longer slows down the more there is of it.
- **No mid-game builds**: new passers-by are built at most two a frame; the loot sparkles are made while loading.
- **Passers-by far from every player** think a bit less often (10 times a second instead of 30); anyone near any
  player, or doing anything that matters, is exactly as before.

**New**
- **BENCHMARK** (pause menu): about 3 minutes round the same route (the fort, the first road, the pub inside and out,
  pool and darts, the balcony, a city street), by day and night, then a result to copy and send to Blake.
- **Settings**: **Render scale** (50–100%: lower is faster on weaker graphics cards; the HUD stays sharp), **Adaptive
  resolution** (off by default: softens the view a little when frames run slow, never below 60%), and **Sharp on
  high-DPI screens**.
- **Show FPS** now shows the frame time, the worst frame, draw calls, triangles and the render size.

**Fixed**
- Leaving a game in the middle of a pint left the glass on screen and hid your slots in the next game; the pool and
  darts panels piled up one more each game.
- A street closed for a parade could tow a car right on top of a passing police car.

**For building the city** (docs): `docs/perf-budget.md` (the budgets), `docs/content-guide.md` (how to add buildings,
interiors, characters and activities, with the pub as the worked example), `docs/expansion-plan.md` (a staged plan and
ideas to choose from).

## R12.4: no freeze on the way to the pub, a fair Split the G, pub sounds, lit nights, small windows (2026-11-07)

**Fixed**
- **The freeze walking to the pub:** the pub's insides used to be built the moment you came within 100 m, about at the first road from the fort, in one frame of nearly 4 s on a slow machine.
  - Now it's built while the city loads, and its two floors are only drawn when you could see them.
  - On the test box the walk's worst frame went from 2.5 s to 1.4 s, and the pub's views draw up to 40% fewer meshes.
  - Loading takes a little longer instead.
- **Pool:** a newer shot that finished while you were still watching an older one used to vanish. Shots now wait in line and play in order.
- **Pool stand-up:** after your shot the camera holds for a moment, then rises smoothly back to you with the table still in view. Moving hands control straight back.
- **Darts:** after your third dart you step back from the oche as soon as it lands. A dart thrown at the other board no longer holds up yours.
- **Leaving a game** you joined over the internet no longer tries to reconnect you a few seconds later.

**Changed**
- **Split the G (Blake's choice: "visible G, fair & skilled"):**
  - The G faces you.
  - One smooth drink, with no hidden surges.
  - When you put the glass down the head settles a touch further, the same way every time, so the trick is letting go just above the bar.
  - Perfect is within 1.5 mm (the gold bar is exactly that thick), close within 5 mm.
  - Same prices: $6 a pint, $15 for a perfect, your $6 back for a close.
  - The result's marked on the glass.
- **Sound:**
  - Pool: a woody cue strike, sharper ball clicks, cushion thumps, and a ball dropping and rattling down the pocket.
  - Darts: a thwack when the dart lands, a ding for a treble, double or bull, and a clatter for a miss.
  - Split the G: swallows, the glass going down, the head fizzing, then a cheer, an "ooh" or a groan.
- **Night:**
  - The pub has five lamps: the bar, the fire (it flickers), the pool tables, the darts and the upstairs bar. It's darker and warmer, with light where you play.
  - Warm light spills onto the pavement from the door and the bay windows.
  - The street lamps' pools of light show on the pavement now; before, they were hidden under it.
  - Performance mode keeps the old look.
- **Small windows (800×600, 960×540):**
  - The controls line folds to "H: controls" after 20 s, and H opens it.
  - While you drink, the slots step aside.
  - The pool and darts rules don't pop up over the table; press H for them.

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
