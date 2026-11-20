# Changelog

Every update to Box Fort Banditz, newest first. Each round has its screenshots in `screenshots/<round>/`, and the full reasoning and test results are in `docs/design-decisions.md` and `docs/test-plan.md` (search for the round's name, e.g. "R12.2c").

## TR2: Trashington 400, smaller and dressed like Blake's photos (2026-11-20)

Blake, playtesting TR1: the fort yards and the square are too big, the city feels too big ("quick dopamine... iconic
little areas... not a massive big open world"). His picks: 18 m yards, a 400 x 400 m city, 10% faster on foot, the
test route dressed like his four photos, the game's own names kept. Still the test map only (`?map=test`).

- **The 400 x 400 m plan** (`shared/src/queens/trashington400.ts`).
  - The home block is 46 m across: four 18 m yards and 10 m market lanes.
  - The avenue loop is at +-100 m and the edges at +-192 m.
  - The starter shops face their spokes; the El was re-routed so it crosses each avenue cleanly.
  - Every rule passes. Walked at today's speed, the nearest landmark is **20.8 s** from every fort (about 19 s on the
    test map) and the far corner 27.3 s.
- **10% faster on the test map** (`arena.pace`, applied in the movement code; the normal game's pace is unchanged).
- **The dressed route:**
  - the home lots (dirt, grass, stones; the fort and mat at ground level);
  - Stain Way's coloured terraces with windows and lamp posts;
  - PLUG & PRAY's teal shopfront, window telly and hanging plug sign; FISHY BUSINESS's blue front;
  - the museum's GOODS IN (shutter, bollards, hatched bay, pallets, cones, banner, the duck on a red dolly);
  - Wood Havoc Lane with THE SOGGY SHAMROCK's back door (step, sign, lamp, drainpipe, wheelie bin) and lamp posts.
- **Boxes can choose their sign's colours, width and height** (`signBg`, `signFg`, `signW`, `signY`).
- **The DEPOSIT mat's lettering shows** (every map): the mat sat exactly at its rim's height and the two fought for the
  same pixels; it's 1.5 cm above the rim now.
- **Tests:** a new pace test (10% further in 3 s, walking and sprinting, the normal city unchanged); the plan, yard,
  stock, museum and recorder tests moved to the 400 m plan; `tests/trash400-report.ts` (the pictures, the walked table).

## TR1: Trashington 500, the smallest playable test (2026-11-18)

Blake's answers to the Compact questions: "500 x 500 m, landmarks out"; keep the original look and stop calling it
Queens; grey boxes first; 20 m market lanes; starter yards are junk lots that get upgraded; no WANTED list yet; "yes,
build the smallest playable test". The normal game is unchanged: the test is its own map, `?map=test`.

- **The 500 x 500 m plan** (`shared/src/queens/trashington.ts`): the same shape as the last proposal, with the loop of
  shopping avenues at +-146 m (was 118), the edge roads at +-242 m (was 196) and bigger landmark corner plots. Each
  landmark's public door is 30 m past its corner and its goods gate 34 m further on. Every rule passes (the same checker).
  - Walked with the real movement code, each fort's nearest landmark is **31.6 s** away; the others 32.5 / 34.0 / 40.9 s.
  - The nearest starter shop is 5 s away, the nearest mid 18-19 s, the nearest high-end 18-19 s (FRAME & FORTUNE and
    GUCCIO GARBAGE moved nearer their spokes so all four forts match).
- **The grey-box test map** (`shared/src/testmap.ts`, `?map=test`): the whole city as grey blocks with names, coloured
  door bands and street signs.
  - Open: PLUG & PRAY and FISHY BUSINESS on Stain Way, with shelves and stock, and the museum (forecourt, public door,
    one gallery, giants and heavies, the goods yard).
  - Both ways home: Stain Way, and Wood Havoc Lane behind the pub.
  - The home block: four junk-lot yards, rotated forts and the market.
  - No traffic, police, passers-by or city events. Two players start on the west side (F1 and F4).
- **Giants can't leave the museum by its public door** (`World.giantDoors`). Held giants don't collide with walls, so
  a doorway's width can't stop them: you're put back inside and told to use the goods yard.
- **The playtest recorder** (`shared/src/playtest.ts`): the host's game writes down every sighting (where, when, what
  each carried, what each did next), every trip (where, what came back, which way home, seen or unseen) and what was
  banked. The host's browser saves it to Downloads (JSON + a plain-English .txt) at the end of each scavenge.
- **Joining the host's map:** a player who types the room code into a page on a different map is turned away before
  getting a seat, and their page reloads onto the host's map (no ghost player left behind).
- **Tests:** 5 new unit tests (`shared/test/testmap.test.ts`); `tests/testmap-shots.mjs` (the views, with draws and
  meshes); `tests/testmap-2p.mjs` (online: host, join by code from a plain page, sighting recorded, report saved);
  `tests/trash500-report.ts` (the plan images and the walked table).

## CQ1: Compact Queens, a proposal (2026-11-18)

Planning only: **the playable game is unchanged.** Blake asked for a substantially smaller, denser Queens, sized by one
trip (each fort's mat to its nearest major landmark in ~25 s), with more shops on the streets players use and more
chances to see another bandit. The proposal, its pictures and its evidence are in `docs/queens/compact/proposal.md`.

- **408 x 408 m** (v2: 940 x 690 m). Four shopping avenues in a loop round the home block; a landmark outside each
  corner; four spokes, offset in a pinwheel so every fort's trips have the same shape.
- **Nearest landmark 24.0 s from every fort** (the game's own movement code walking the route; the estimate is 24.9 s);
  the others 24.8 / 26.7 / 33.2 s. v2: 54-56 s.
- **20 playable shops** (8 / 7 / 5): v2's 16 plus FISHY BUSINESS, THE FINAL PRINT, BATTER DAYS and LORD OF THE STRINGS,
  each placed on a street that needed it (FRAME & FORTUNE swaps with THE UPPER CRUST). Two proper shopping streets:
  Stain Way and Rooster Velt Ave.
- **Back lanes and Wood Havoc Lane behind the pub**: giant-wide hidden ways home that cost a few seconds more than the
  avenues (the one hard choice, shown both ways).
- **Measured in a planning simulation (sight.ts):** two players see each other away from home in 51% of scavenges (v2:
  35%); four players 98%. The strongest camping spot is a shopping-street corner, not a fort gate.
- **Earnings:** the shelves cap them, not the distance: the same at 8 shelves, +20-25% at 16; 1-4 minutes of every
  scavenge freed. No price changes proposed before a playtest.
- **New tools:** the checker reads any plan (`active.ts`, `usePlan`); the walking network gives routes (`net.ts`);
  line-of-sight and encounters (`sight.ts`); the planned dressing (`dressing.ts`); the report, the walk with the real
  movement code, the encounter simulation, the economy estimate and the player-height mock-ups (`tests/compact-*.ts`).
- **Tests:** 8 new plan tests (`shared/test/compact-plan.test.ts`); the v2 tests unchanged and passing.

## Q1.1: Queens layout v2, after Blake's review (2026-11-17)

Still planning only: **the playable game is unchanged.** Blake's review: v1 read as a big grid round a tiny fort
island, with coloured zones instead of neighbourhoods. v2 corrects the layout, still as checked data. What changed
and why is in `docs/queens/layout-v2.md`; the diagrams are in `docs/queens/img/`.

- **The home block is sized from the largest planned fort:**
  - four equal 36 x 36 m yards; the Mayor's Boxfort (house, shelves, safe, workbench, board, traps, mat) is laid out
    in each and checked to fit;
  - 28 m market lanes and a 28 m square;
  - 140 m kerb to kerb, the ring road round the outside.
- **Real neighbourhoods:** about 1,400 building footprints generated from five reusable block types:
  - a row with a rear service alley;
  - a corner building;
  - a courtyard block;
  - a workshop with garages;
  - a destination or landmark with its neighbours.
  Shops are units in the rows, with back doors on the alleys.
- **Room for the full roster:** 16 stores playable first (6/5/5) and 10 more reserved as real shopfronts
  (12/8/6 in all), plus the 4 landmarks, each with its own shape and approach.
- **Varied streets:**
  - Queasy Blvd is offset at the home block;
  - Rooster Velt Ave bends;
  - Stain Way jogs;
  - Astorial St and Low Road are T-streets.
- **A smaller police station**, with a footpath where the north spur was.
- **The pub and the club have their own streets.** The club faces the casino across Rooster Velt Ave: the nightlife
  strip.
- **The elevated line is a real diagonal** (the casino east of it, the club and the hotel west of it), with 23 columns
  clear of everything.
- **Borders are 39-61 s from the forts** (sprinting, estimated; average about 50 s). No empty land was added to reach 60.
- **Performance planning:** budgets, and a planning proxy for how much city is in view (2.3-4x today's). That makes
  fog culling, per-tile merging, instancing and simple shells requirements for Stage 2 (`docs/queens/perf.md`).
- **12 plan tests**, including proof that the checker catches a broken plan.
- **Tests:** unit (365 shared + 40 client) and typecheck pass; smokes, draw budget and e2e pass (normal 465/465,
  110 ms 464/464 on a rerun; the first runs hit two known flakes, recorded in the test plan).

## Q1: the Queens overhaul, Stages 0 and 1: measured baseline and the city plan (2026-11-17)

Planning only: **the playable game is unchanged.** Blake's Queens brief (a central home block, a bigger city, landmarks
at the corners, an elevated line) is now a staged plan, with the city drawn up as checked data. Blake chose 6 low,
5 mid and 5 high stores plus the four landmarks; the pub and the club move later. Everything is in `docs/queens/`.

- **Stage 0, measured with the game's own code:**
  - 60 s of running, real stamina rules: 573 m sprinting, 400 m walking (`tests/sustained-run.ts`).
  - Today's travel from all four forts with the real movement (`tests/route-matrix.ts`). Today's map is unfair by
    fort: the same low store is 4 s from one fort and 19 s from another.
  - The host's simulation vs NPC count (`tests/tick-scale.ts`): about +0.2 ms a tick for twice the live NPCs.
  - What depends on map positions: almost everything reads the map's data, so moving things is a data change.
- **Stage 1, the city plan** (`shared/src/queens/plan.ts`, checked by `check.ts`):
  - 940 x 690 m. Four equal 24 x 24 m yards round the market, inside a ring road with eight crossings.
  - Each fort's rear gate faces its own low store across the road: 5 s for all four forts.
  - The 16 stores and 4 landmarks, the police, and reserved plots for the pub and the club.
  - An elevated line on the casino side: 23 columns, all clear of every lane, pavement and path.
  - Blake's two removed roads are gone; the police yard has a footpath where the north spur was.
- **The plan's estimates** (from measured speeds; Stage 2 walks it in the game):
  - Every border is 48-71 s from every fort.
  - The average trip to the 20 businesses is within 0.3 s across the forts.
  - Two high-end heavy runs fit in a scavenge. A landmark giant dragged home alone takes about 85% of one
    (decision D-12).
- **10 new tests** (`shared/test/queens-plan.test.ts`), including proof that the checker catches a broken plan.
- **The map and the home block**, drawn from the data: `docs/queens/img/`.
- **Checks:** unit tests (363 shared + 40 client), typecheck and both smokes pass; e2e 465/465 at normal speed and at
  LATENCY=110. Draw budget: one view over (CARAT & RUN looking out, 135 draws against 129). It's the view whose people
  and cars have made it read 119-134 before, and no rendering code changed.

## R14.1: fixes from Blake's review of R14 (2026-11-15)

Blake reproduced four problems in the new loop. Each is fixed, with a regression test that runs his reproduction:
- **Store security can't be dodged by dropping the loot.** Stealing at CARAT & RUN or MAISON PONG, dropping the thing
  inside and picking it up again used to wipe security's memory of it.
  - The history now belongs to the thing: dropped, picked up again or passed to a mate, it's still stolen.
  - Security chases whoever has it now.
  - It ends only when security takes it back (the tackle) or gives up (you got away with it).
- **No more farming theft aura.** Two players stealing the same loot back and forth (re-banking it in between) used to
  earn aura every time.
  - Every loot now keeps a permanent identity through banking, theft and banking again.
  - The +2 theft aura is once per loot per cycle.
- **The banana peel works as advertised.** It's decided before the knockdown, including a punch that would knock you
  out: you keep your feet and everything you carry, and the rival goes down instead. It's used only during a task or a
  campaign.
- **The speech is 10 uninterrupted seconds.** Being knocked down (by anyone) starts it again, as walking off did.
- A source-reading test assumed Unix line endings and failed on Windows (CRLF) checkouts; fixed.

## R14: the first complete game loop: scavenge, bank, steal, build, quests, and RUN FOR MAYOR (2026-11-15)

The whole match is now one loop, built from Blake's brief and his answers (all in `docs/game-loop-plan.md`). The rules
live in `shared/src/loop/` as data: a new upgrade, recipe, aura task or boss job is one entry.

- **The cycle:** a 5 s countdown at home, then **8:00 scavenging** (5:30 day, 0:30 sunset, 2:00 night), then **2:00 PREP**
  at home. There are 8 cycles; after the last, **the most aura wins** (cash only breaks a tie). Warnings come at 2:30,
  1:00 and 0:10. READY skips the rest of PREP when everyone's ready.
- **The DEPOSIT MAT:** drop loot on your fort's mat and it's **banked after 10 s**: off the street and onto your shelves
  (one card, one sound). **Anything not banked at the deadline is deleted.** Street counters still buy, at lower rates
  (pawn 30%, specialists 45%, WEE MICKEY 60%).
- **Your fort:** 8 shelf spots and a 2-slot **SAFE** (up to 16 and 4 with upgrades). The things on your shelves are the
  real things, drawn there. Overflow goes on the lawn.
- **PREP:** sell to **Sal's van** (60%, x2 for the first of each of today's 3 wanted things), choose what goes in the
  safe, and **build** upgrades with cash plus materials by category:
  - DUCT-TAPE FORT → PLYWOOD PALACE → THE MAYOR'S FORT;
  - more shelves and safe slots, a WORKBENCH, ALARM I/II, a HAND TRUCK, a HARNESS.
  - At the **workbench** you craft a MEGAPHONE, a FAKE MOUSTACHE, BANANA PEELS, CAMPAIGN POSTERS and a CEREMONIAL SASH.
- **Night theft:** at night, aim at something on a rival's shelf and **hold E for 5 s**. Moving, being knocked down or
  sunrise stops it. The safe can't be stolen from.
  - There's **no alarm unless you build one** (Blake): ALARM I tells you who and where; ALARM II makes theft take 10 s.
  - A theft is +2 aura (each thing once a cycle).
- **Aura tasks:** **E at your fort's task board** buys a random task. The first costs $25, then x1.5 each that cycle,
  one at a time. There are 8 tasks: TOUR OF SHAME, SHOW AND TELL, HEAVY LIFTING, HANG TIME, SLIDE SHOW, HOT POTATO,
  SMASH AND DASH and STREET PERFORMER.
  - Every attempt is **LIVE**: rivals see who's going for what, and where.
  - A rival who knocks you down mid-task **interrupts** it: you lose 4 aura, they gain 3, once per pair per cycle.
  - A BANANA PEEL makes them slip instead. A MEGAPHONE gives +50% on a stunt task.
- **The bosses:** **SEAMUS O'SHORTLY** (at his bar) and **DON BINNIE** (his man at NEON FEVER's door) each have one job a
  cycle (press J by them). A job pays cash, aura and +1 reputation (0-5); a failed job costs nothing.
  - Reputation only adds perks and never locks anything: Sal pays 70%; a free banana peel each cycle; aura tasks 25%
    off; a free fake moustache each cycle.
- **STORE SECURITY** at CARAT & RUN and MAISON PONG: big, navy, a hi-vis cap and armbands, standing beside the door.
  - In order: a **warning** when you lift something, a **shove** if you walk at them with it, a **chase** if you leave
    with it (10 s, never more than 25 m from the door), then the **tackle**, and it goes back to the store.
- **The HUD:** CASH and AURA up top; a **quest tracker** (your task and job, progress, time, an arrow and distance;
  rivals' live attempts); **J** for the full panel (bosses, reputation, perks).
- **RUN FOR MAYOR:** qualify with **60 aura, $800, THE MAYOR'S FORT, posters and a sash**, then declare at your board.
  The fee and the gear are all spent at once.
  - The **4:00 campaign stops the round's clock for everyone**:
    1. shake **PRESIDENT MARMALADE**'s hand (an orange-faced giant at an announced spot);
    2. put up 5 of 8 posters ("VOTE <you> FOR MAYOR", in your colour);
    3. do two random goofy objectives;
    4. then give **the speech** at the fountain.
  - Rivals see it all, with a ping of you every 20 s. Each knockdown is a strike (-15 s); 3 strikes, an arrest or the
    time running out **fails** it: aura halved, the fort down a level, no campaign again this cycle.
  - **Win and the match ends: YOU ARE THE MAYOR OF TRASHINGTON.**
- **Fixes found on the way:**
  - A cruiser no longer clips a car stopped part-way round the next turn.
  - The pool window steps you up for your turn even if the table's news arrived before it knew who you were.
  - Pedestrians who sidestep an obstacle no longer step off the kerb in front of a car.
  - The e2e found four more, all fixed:
    - you could aim at a thing on an outer shelf and be told "Too far" (the reach is now measured to the thing);
    - a game that ended mid-PREP left the PREP screen over the title;
    - DON BINNIE's job hint hid NEON FEVER's rope prompt (job and board hints now give way to E);
    - old banners piled up behind the final card.

## R13.1: four bug fixes, a leaner frame, and CARAT & RUN replaces BONBON VIVANT (2026-11-14)

- **CARAT & RUN, "FINE JEWELLERY · FLEXIBLE MORALS"**, takes BONBON VIVANT's plot on Snob Row (still six stores). It's a
  pretentious cartoon jeweller:
  - **The building:** emerald and stone, aged brass, a recessed door off to one side, and a giant gold ring with its
    diamond hung off the corner.
  - **Inside:** the velvet wall cabinet, the vitrine (smash it for the alarm and double heat), and the appraisal bench
    (a ring mid-job, a note saying "Diamond? ...glass. Charge double.", and the CERTIFICATE OF GENUINE IMITATION).
  - **The centrepiece:** **the DIAMOND PIGEON**, dog-sized, crowned, under glass, roped off ("Priceless. The alarm is
    extra. PLEASE DO NOT FEED").
  - **The keeper:** PERCY FACET, with an enormous top hat and a monocle.
  - **Trade:** it buys rings, chains, pearls, Rolecks watches and diamond pigeons at 60%, and sells nothing. The
    sugar-rush truffle went with BONBON (the speed buff itself is still SKETCHY STEVE's).
- **E works at all six store counters.** The counters answered, but E never picked them out. Client and host now share
  one list.
- **A tug of war holds still on your own screen too.** Your game used to predict you running off mid-tug, then pull you
  back.
- **Nobody can sell half a thing.** A giant item mid tug of war can't be sold, pawned or fenced until someone wins the
  tug. Whoever was left holding a deleted item used to be stuck at a standstill; now they let go.
- **People no longer lose their look when someone leaves.** Removing one pedestrian, item or player disposed materials
  that everyone shares, so the rest were drawn with a default material. Each person's skeleton is now cleaned up with
  them too.
- **A leaner frame (test box; relative numbers):**
  - Solo copies the world's state 60 times a second, not once per drawn frame. At 240 FPS that was 240 times. Your own
    player is still checked every frame: the e2e caught a first version that let THE DROP's rising bed shove you off.
  - Glass doors are 2 meshes a leaf (it was 7).
  - Other players are 7 meshes each (it was 13).
  - Across 53 fixed views: draws −6.7%, meshes −7.5% against R13.
- **The performance checks check what they claim to.** Mesh budgets are added, and every door is covered. A view with no
  budget, missing stretches, a different machine, or any new frame over 50 ms now fails the check instead of passing.

## R13: six new stores, each a whole building in its street (2026-11-13)

- **Six stores on the new map**, in mirrored pairs (nothing else in the city moved): RUST BUCKET SALVAGE and PLUG & PRAY
  REPAIRS in The Yards, NEEDLE DROP RECORDS and PEAK FOMO OUTFITTERS in the middle, MAISON PONG and BONBON VIVANT on Snob
  Row.
- **Whole buildings** (Blake's brief): an old workshop with a sawtooth roof and CLUCKZILLA, a fibreglass chicken, on top;
  a narrow tenement on the Chinatown corner with its painted ad; a brick block between the pub and the news tower; a
  timber lodge with its name on the gable; a stone town house with a mansard and iron balconies; a pastel terrace with a
  pointed awning. Upper floors are window-and-wall shells (no hidden rooms).
- **Inside, each its own place:** RUST BUCKET's shop and workshop behind a partition, the car in its repair bay under an
  engine hoist; PLUG & PRAY's intake counter, technician's bench and the gutted arcade cabinet; NEEDLE DROP's browsing
  route, staff picks and listening booth; PEAK FOMO's hike / camp / climb zones, the expedition display and the climbing
  wall; MAISON PONG's lit niches, eye-level perfume fountain and consultation counter; BONBON's chocolate tower at the
  counter and the wrapping bench (the Mayor's order, half-wrapped). Their keepers have their own looks, and customers
  browse (1-2 each).
- **What they do:** sell the specialist what you're holding, buy the store's one thing (trail mix, a spritz that takes
  heat off, a sugar-rush truffle), rummage once a day, smash the display case, hold up the till, lift the stock. Snob Row's
  heat is double.
- **People are cheaper:** each character is one skinned mesh now (it was about seven), so the six stores, their buildings
  and 16 more people come out cheaper than before: across the 25 fixed views, draw calls -6.3% and meshes -1.6% against
  R12.9 (the test box: relative numbers).
- **Fixes found on the way:** the stores' lamps were stuck off away from the pub; a car waiting for a walker never asked
  them to move if they hovered at the edge of its path; a police car could drive through a car stopped part-way round a
  turn from the same road.

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
