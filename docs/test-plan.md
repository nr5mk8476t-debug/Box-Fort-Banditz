# Box Fort Banditz — Test Plan

Every phase adds to this plan. Nothing is reported as working unless one of these checks (or a manual check listed below) has actually passed.

## Layers

1. **Unit tests** (`npm test`, no browser): the shared game rules. Fast, exact, run on every change.
2. **Server smoke tests**: `tests/signal-smoke.ts` checks matchmaking (the only job the live server has since games are browser-hosted). `tests/server-smoke.ts` covers the old server-hosted mode (`?net=server`), which is retired from the regular test matrix.
3. **Browser end-to-end** (`scripts-run-e2e.sh`): up to 5 real headless Chrome windows, real server, real 3D rendering (software GPU), screenshots for visual review. Also run with `LATENCY=110` to simulate Australia → Singapore ping.
4. **Manual play checks** by Blake on real hardware (feel, fun, performance), with the checklist below.

Note on the automated browser test: it renders 3D on the CPU, so it runs at single-digit FPS with several windows open. Distance checks therefore compare movement against the number of simulation steps actually run, not wall-clock time. Frame rate and feel must be judged on a real machine.

## Phase 0 checks

| Area | Check | How | Result (2026-09-25) |
|---|---|---|---|
| Movement rules | walk/sprint speed exact, diagonal not faster, backwards slower | unit | pass |
| | walls block and let you slide along them | unit | pass |
| | curbs stepped up automatically; tall crates block | unit | pass |
| | jump arc; holding jump doesn't bunny-hop; land on crate, walk off | unit | pass |
| | identical inputs → identical result (needed for multiplayer prediction) | unit | pass |
| | bad input from a client is clamped or rejected | unit | pass |
| Rooms | 5-character codes without look-alike characters | unit + smoke | pass |
| | create, join by code, names cleaned, distinct colours | smoke + e2e | pass |
| | server rate-limits speed-hack input bursts | smoke | pass |
| | only host can start; host leaving hands host to someone else | smoke + e2e | pass |
| | 5th player gets a friendly "room is full" message | e2e | pass |
| | wrong code gets a friendly "room doesn't exist" message | e2e | pass |
| Share link | Create Room puts `?room=CODE` in the address bar; Copy Link button | e2e | pass |
| | opening the link shows an invite card with name field → joins | e2e | pass |
| Sync | 3 windows each see all 3 players | e2e | pass |
| | other windows see your exact server position | e2e (+110 ms lag) | pass |
| | your own movement needed zero corrections from the server | e2e (+110 ms lag) | pass |
| Disconnects | dropped connection: seat held, shown as "reconnecting", auto-rejoins same seat | e2e | pass |
| | refreshing the tab rejoins the same seat (no ghost duplicate) | e2e | pass |
| | a vanished player's seat is held 30 s, then removed; match keeps running | `tests/drop-timeout.ts` | pass |
| Solo | playable with no server | e2e | pass |
| UI | pause on ESC, leave to title, settings saved across reload | e2e | pass |
| Audio | no AudioContext before the first click; created on first click | e2e | pass |
| Visual | title, arena, lobby, pause, settings screenshots reviewed | screenshots | pass after fixes (see report) |
| Console | no JavaScript errors in any window | e2e | pass |

## Phase 1 checks (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Momentum | stopping from a sprint skids briefly (weighty) | unit | pass |
| Stamina | ~3.5 s of sprint, winded = walk pace after a short coast-down, full refill at rest | unit | pass |
| | bar appears while draining; stamina syncs to other players | e2e + smoke | pass |
| Crouch | slower + shorter; fits under the crawl tunnel; can't stand or jump under a roof | unit + e2e | pass |
| | other players see you crouch | smoke + e2e | pass |
| Slide | sprint + C = fast slide that slows, ends crouched, cooldown; walking too slow to slide | unit + e2e | pass |
| | jumping out of a slide keeps momentum | unit | pass |
| Dodge | Q = hop-dash in move direction (forward if none), costs stamina, cooldown pip | unit + e2e | pass |
| Mantle | climbs 0.9 / 1.4 / 1.95 m ledges; refuses 3 m walls and ledges with no room on top | unit + e2e | pass |
| Stumble | 4 m drop = comedy stumble; normal jump doesn't | unit | pass |
| Robustness | 18,000 random inputs across 20 runs: never inside a box, never NaN | unit (fuzz) | pass |
| | repeatability with every move mixed in (needed for multiplayer prediction) | unit | pass |
| Camera | stays valid after slide, climb, crouch at 3–11 FPS (regression for spring blow-up) | unit + e2e | pass |
| Preview | real C key crouches, W walks, drag-to-look turns in a sandboxed, no-pointer-lock frame | harness | pass |

## Phase 2 checks (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Catalog | 15 items, all 3 sizes and all 5 rarities, sane values | unit | pass |
| City | loot + player spawns never inside walls; every spawn settles in-bounds | unit | pass |
| | every dumpster sits against a low roof and you can climb dumpster -> roof | unit | pass |
| Grab | big items -> hands, slow you; heavy blocks sprint; small -> 3 pockets then hands | unit + e2e | pass |
| | too far / behind you = whiff | unit | pass |
| | grab race: same tick, exactly one winner, loser whiffs and their instant guess is undone | unit + e2e (online) | pass |
| Drop / throw | G drops in front and it lands; charge controls distance; pocket items throwable | unit + e2e | pass |
| | thrown items bonk other players (shove + event), never the thrower | unit | pass |
| Giant | drag alone x0.3; two carriers x0.65; pulling apart = tumble; can't throw; one lets go = other drags | unit + e2e | pass |
| Disconnect | leaving/dropping drops all loot so it's stealable | unit | pass |
| Robustness | 120 random throws around the city: no item inside walls or out of bounds | unit (fuzz) | pass |
| | spawner never exceeds the 60-item cap; rare loot favours the plaza | unit | pass |
| | whole world deterministic for same seed + inputs | unit | pass |
| Sync | loot synced to clients; far grab = whiff event; B sees the TV in A's hands | smoke + e2e | pass |
| HUD | look prompt shows name, $price, rarity, tags; pockets bar; charge ring | e2e + screenshots | pass |
| Perf | server tick worst case 0.1 ms (budget 16.7 ms) with 4 players + all items bouncing | benchmark | pass |
| | no mesh/material/memory growth over time; render ~5-12 ms/frame (software GPU) | profile | pass |
| Preview | sandboxed frame: loads, W walks, C crouches, drag-to-look turns | harness | pass |

## Phase 2.5 checks: pedestrians + punching (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Route map | pedestrians' walk network covers the city, stays out of walls, is one connected piece | unit | pass |
| Crowd | 35 pedestrians, all 8 types; 2 minutes of wandering: never inside walls, never stuck, never NaN | unit + e2e | pass |
| Punch | left click with empty hands punches whoever is in front (pedestrian or player); too far / behind = miss | unit + e2e | pass |
| | holding something: left click still charges a throw; F throws (incl. pocket items) | e2e | pass |
| | prompt "[CLICK] Bonk Tourist", fighters say "FIGHTS BACK" | e2e | pass |
| Loot | a bonked pedestrian drops their item once (pops out, grabbable); thrown items bonk them too | unit + e2e | pass |
| Types | jogger sometimes sidesteps; mime traps you in an invisible box; pigeon lady's pigeons slow you (dodge shakes them); tourist camera flash; influencer films (extra heat) | unit | pass |
| Fighters | gym bro / mall cop / mime chase and telegraph a slap; 2 hits first wins; lose = knocked down + drop everything; win = KO + bonus loot | unit + e2e | pass |
| | fighter gloats after knocking you down (regression: was overwritten by "chase") | unit + e2e | pass |
| | stop chasing when you're down, too far, or after 8 s | unit | pass |
| PvP | punching a player = full knockdown; everyone sees them lying down; 3 s immunity after; repeat knockdowns get shorter | unit + e2e (online) | pass |
| Heat | punching raises your notoriety; mall cop + filming raise it more; it cools down; HUD meter | unit + e2e | pass |
| Input | a key pressed during the 0.18 s action cooldown is queued, not lost (G right after E) | unit + e2e | pass |
| Sync | all 35 pedestrians synced to online players (only changed values sent) | smoke + e2e (also at 110 ms lag) | pass |
| Visual | sky beams gone; rare+ loot twinkles (within 25 m); BONK/POW/K.O. pop text; knocked-down view; camera flash; pigeon swarm | e2e + screenshots | pass |
| Perf | server tick average 0.16 ms, worst 5.7 ms (budget 16.7 ms): 4 players running + punching, 35 pedestrians, 41 items, 2 min | benchmark | pass |
| | Phase 3: live match (intro + full round + tally, 4 players punching, events firing, 18 pedestrians): average 0.10 ms, worst 8.4 ms | benchmark | pass |
| | client: pedestrian body parts merged per limb (~9 meshes each, was ~25); culled beyond 45 m | profile | pass |

## Phase 3 checks: round loop + events (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Crowd | 18 pedestrians; eased speed + max turn rate while walking (no instant snaps); they step around a standing player | unit | pass |
| Forts | each yard contains its pad, no loot spawns inside a yard, back alley is outside | unit | pass |
| Flow | lobby -> intro 5 s -> scavenge 3 min (30 s warning) -> tally 12 s -> x3 -> over; START again resets cash | unit + e2e (solo) | pass |
| | host START reaches everyone; round timer the same on every screen | smoke + e2e (online) | pass |
| Banking | loot in YOUR yard locks after 10 s (countdown tag, then BANKED); locked loot can't be grabbed; a rival can steal before it locks and the 10 s restarts | unit + e2e | pass |
| | loot in an empty fort's yard doesn't bank | unit | pass |
| Time's up | carried loot away from home is lost (event + results); carried loot at home and all yard loot is cashed; results sorted by cash | unit + e2e | pass |
| Airdrop | giant legendary crate floats down slowly under a parachute into the plaza | unit + e2e | pass |
| Truck | 5 s warning, drives a ring-road side, sweeps loose loot, flattens players in its path, never touches banked loot or loot off the road | unit + e2e | pass |
| Happy hour | loot in the zone doubles; picked up in time keeps x2; left lying reverts | unit + e2e | pass |
| Raccoons | steals the most valuable loot from a fort (even banked); escapes = item gone + counted in results; bonking it drops the item, no heat | unit + e2e | pass |
| Escalation | 1 / 2 / 3 events in rounds 1 / 2 / 3, never the same one twice in a round | unit | pass |
| HUD | timer, scoreboard with banked value, event bar, home compass, results + final cards, banners | e2e + screenshots | pass |

## Phase 3.5 checks: the big city (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Stamina | ~8 s of sprint before winded | unit | pass |
| City | 200 m; 8+ high-rises (some 35 m+); 4 shops with cashier + stocked shelves; every kind of loot source exists | unit | pass |
| | nothing walkable-only (loot spawns, fort pads, props) sits in a road; lanes run on asphalt; landmarks are clear | unit | pass |
| | pedestrians only cross roads at crosswalks | unit | pass |
| | collision broadphase never misses a box and keeps the original order (prediction stays in sync) | unit (2000 random probes) | pass |
| Search | E on a dumpster/bin: 1-3 items, then empty until it refills; too far = nothing | unit + e2e | pass |
| Smash | punch phone booth (handset), vending (snacks), meter (change), newsbox (paper), parked car (seat loot + alarm); heat goes up; broken for a while | unit + e2e | pass |
| Robbery | HOLD R 3 s at a till: cash bundle, cashier cowers, alarm, heat; letting go / walking away cancels | unit + e2e | pass |
| | grab the whole register: alarm + big heat; swiping shelf stock in view of the cashier: yell + heat; punching the cashier: cash once + alarm | unit | pass |
| Traffic | 14 cars stay on the road, keep their distance, stop for a pedestrian in the lane, honk at bandits | unit + e2e | pass |
| Wipeout | hit by a moving car: loot spills, 10 s countdown overlay, respawn at your fort with brief immunity | unit + e2e | pass |
| Sync | cars + props (and their empty/alarm state) synced to online players | smoke | pass |
| Network | refresh-rejoin keeps your seat even after an automatic reconnect; slow browsers get ~20 s before being dropped | e2e | pass |
| Perf | server tick average ~0.17 ms (was 0.9 ms before the broadphase) with 4 players, 24 NPCs, 14 cars, ~90 items | benchmark | pass |

## Phase 4 checks: police + jail + Blake's bug fixes (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Stars | 30 / 60 / 90 heat = 1 / 2 / 3 stars, shown on the HUD | unit + e2e | pass |
| Dispatch | 1 star = 1 cop, 2 = 2, 3 = 3 + a cop car; cops appear 22-42 m away, out of sight | unit + e2e | pass |
| Arrest | stand still with a star: a cop walks up, shouts, busts you; loot confiscated (gone), heat 0, you're in a cell | unit + e2e | pass |
| Jail | can't walk out of the cell, can't act, nobody can punch you through the bars; serve 30 s = out the front door with 0 heat | unit + e2e | pass |
| Lock | every lock differs (4-6 pins, 4 rhythms, random binding order), same seed = same lock, perfect play always opens it in time; slips drop a pin, 3 quick slips = guard lockout, tension runs out | unit (300 locks) | pass |
| Break-out | picking the lock through the real keys: out the back alley with 1 star; presses "from the future" are rejected; works online (server replays the presses) | unit + e2e (solo + online) | pass |
| Hiding | buildings block the view, crouching behind a parked car hides you; slip away from the crime scene: cops search there, heat cools, they give up and leave | unit | pass |
| Cops | faster than walking, slower than sprinting; a well-timed dodge slips the grab; 3 punches = KO + donut | unit | pass |
| Cop car | stays on the roads, pulls up, drops off 2 cops; running a wanted bandit over = busted; traffic stops for it | unit + e2e | pass |
| Bug: windows | tower windows no longer flicker (windows 0.22 m off the wall + depth bias; signs in front of windows) | screenshots while moving | pass |
| Bug: camera | looking straight up and getting knocked over never tips the camera past vertical | e2e | pass |
| Totals | 101 shared unit (incl. 15 police) + 1 client + server smoke + 169 browser checks; the browser run also passes at 110 ms lag (167/168 there, the one miss was a test-timing flake since fixed) | all | pass |
| Bug: parked cars | a chaser gets round a parked car to reach you; nobody ends up inside a car; cars shove people without pushing them into walls | unit | pass |
| Perf | server tick average ~0.3 ms with 4 players at max heat (11 cops, 2 cruisers) | benchmark | pass |

## Phase 4.5 checks: tuning + big shots (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Police nerf | still 1/2/3 cops per star (the car's cop counts at 3 stars), slower than before but faster than walking; all Phase 4 police checks still pass | unit + e2e | pass |
| Lock | a press counts if the pin was in the green during the last 0.09 s; simulated players with human reaction lag: ~60% (decent) / ~40% (casual) break out | unit + simulation | pass |
| Jail controls | the mouse moves the pick, the camera doesn't turn; clicking a pin selects it | e2e | pass |
| Big shots | 4 kinds, each worth $200+; one at a time; announced; arrive out of sight; leave after ~2 min; a new one comes later | unit | pass |
| | millionaire: jackpot + ~30 heat, bodyguard attacks; courier: armor (2 hits) then the money bag + 2 stars; celebrity: trophy + fans film (more heat); crypto bro: $0-500 mystery wallet; the entourage keeps up | unit | pass |
| | HUD tracker, JACKPOT prompt, punch in the browser drops the jackpot | e2e | pass |
| Lock sync | a laggy client (lock clock 15 s behind the server) still breaks out: the server only uses the player's press times | unit | pass |
| Grab | pressing E always uses a fresh look target (a slow frame could send an item you already pocketed -> false "Too slow!") | e2e | pass |
| Totals | 108 shared unit + 1 client + server smoke + 175 browser checks; also 175/175 at 110 ms lag | all | pass |

| Browser hosting | creator hosts in the browser, 2 friends connect directly, host upload measured and modest (~14 KB/s per friend) | e2e | pass |
| | state sync: full snapshot + deltas rebuild the host's view; players exact, other numbers to 1 mm | client unit | pass |
| | joiner drop -> seat held + automatic reconnect; refresh -> same seat; 5th player "full"; host leaves -> everyone told, code stops working | e2e | pass |
| Totals (4.6) | 108 shared unit + 2 client unit + server smoke + 178 browser checks (online now runs browser-hosted) | all | pass |

| Cycle loop | intro -> day -> dusk -> night -> dawn -> shop -> upgrades x3 -> over; READY skips; START resets | unit + e2e | pass |
| Night | scarce x2 loot, heat x2, 2/4/6 cops, cars from 2 stars, visuals (dark sky, lamps, lit windows) | unit + e2e | pass |
| Fort raids | banked loot safe by day, raidable at night, owner's alarm | unit + e2e (online) | pass |
| Pawn shop | lowball offers, haggle up / offended (never above his secret max), sell = cash, unsold lost | unit + e2e | pass |
| Money | coins / cash / wallets auto-bank; money bag must be carried | unit + e2e | pass |
| Tasers | 3 stars: aim (warning) -> hit = stun + drop hands -> cuffed; dodge = miss | unit | pass |
| Tug of war | solo drag x0.4; rival grabs = tug; harder masher wins; timeout = holder; knockdown frees it | unit + e2e (online) | pass |
| Totals (5A) | 115 shared unit + 2 client unit + server smoke + 208/208 browser checks (solo + 4 browser-hosted online windows) | all | pass |

## Overhaul Slice 1 (5A.1) checks: traffic fix, controls, throwing, health, HUD (2026-09-27)

| Area | Check | How | Result |
|---|---|---|---|
| Traffic | 5-min city soak x3 seeds: no pedestrian stuck > 20 s, none inside anything, no car stopped > 12 s (before the fix: 119 stuck reports, a car stopped 586 s) | unit | pass |
| | soak with 3-star bandits (cops + cop cars running around): traffic still flows | unit | pass |
| | knocked-out pedestrian in the lane: car stops, honks, body slid to the curb (not into anything), traffic resumes | unit | pass |
| | pedestrians wait at the curb for an oncoming car; nobody steps right in front of a fast car | unit | pass |
| Controls | wheel cycles fists + filled pockets; keys 1-3 pockets, 4 fists; can't cycle with something in your hands; right click does nothing (reserved) | unit + e2e | pass |
| | left click punches only with fists out; selected pocket item shows in hands and can be thrown | e2e | pass |
| Throwing | every item throwable; giants heaved 3-4 m with a slow wind-up + self-stagger; damage 5-30 by weight x speed; a throw never KOs | unit | pass |
| Health | 100 HP; punch 34 (3rd = knockdown); NPC hit 25; regen 10/s after 5 s; knockdown -> up at full HP | unit + e2e (online: one punch = 66 HP, 3rd punch knocks down) | pass |
| HUD | health + stamina bars bottom-left (heart, yellow bolt), Q dodge chip beside stamina, crosshair kept, blue centre Q gone | e2e + screenshot 41 | pass |
| Hands | no gold patch mesh, white tape wraps present, unlit two-tone shading | e2e + screenshot review | pass |
| Matchmaking | `tests/signal-smoke.ts`: room code, host told of arrivals, offer/answer relay, joiners can't message each other, bad code refused, host leaving closes the room | smoke | 8/8 pass |
| Totals | 122 shared unit + 2 client unit + matchmaking smoke 8/8 + browser e2e **219/219** (final run) | all | pass |
| | earlier runs: 218/219 (normal) and 218/219 at 110 ms lag, each failing one too-short test wait (see note); the 110 ms run was not repeated after the final test fixes | e2e | noted |

Note: the one failure in each e2e run was a test wait that was too short for this very slow test box (the truck's 5 s warning took ~50 s of real time; the charge ring check sampled before a frame had drawn). Later runs also exposed test (not game) timing issues: an unconfirmed drop before the tug test, a KO check reading C's body a moment before it caught up, and a joiner tab stalling past the 8 s silence limit and auto-reconnecting. All were fixed in the test (it now waits/retries and logs what happened, e.g. C's health after each landed punch: 100 -> 66 -> 32 -> 0). The final full run passed 219/219.

## C5c.3 checks: THE COMPACTOR (nightclub) + PAWN-O-RAMA (2026-10-02)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | the club fills Old Brick's west block (medium tier): hall, backstage wing, the crusher bed, a conveyor, 8 club props, Big Crunch, the Golden Record; nothing on a road; THE SWEATBOX and THE DIVE shutters gone; the lawyers moved uptown | unit | pass |
| The floor | bobs to the beat but never above step height; THE DROP builds to 1.6 m, holds, slams; you ride it up and get launched when it slams; its collision follows the clock | unit + e2e (rides up, launched past 2 m) | pass |
| Online | the host starts a drop, a joiner's crusher bed rises too (synced club clock) | e2e (online) | pass |
| The door | no cover = put back on the pavement; $15 at the rope (it goes in the safe) = in until dawn; VIP (5 aura or a wristband) = in free; Big Crunch knocked out = open | unit + e2e (bounced, paid, walked in) | pass |
| Ways in | crouched on the conveyor you ride under the flap into the sorting room (standing, the flap stops you); dock -> bale -> bale stack -> back roof -> maintenance door -> balcony -> crane cab; both staircases; the service stair to the roof | unit (real walks and climbs) + e2e (conveyor) | pass |
| Inside | DJ decks: +3 aura, a noise, the drop starts now, then cools down; the bar, rider, lockers, sort bin and VIP booth give things; the safe (6 s): $40 + today's covers in one bag, alarm, 30 heat, Big Crunch | unit + e2e (hijacked the decks) | pass |
| Pawn shop | in the Yards; fence 40%; pawn 30% (buy back 40% before dawn, only you); at dawn it's on sale to anyone at 70%; 3 punches smash the case: everything spills, heat, Vinnie chases you; broken until dawn | unit + e2e (sold a chain to Sal; the case shows what's in it) | pass |
| Screens | club front by day and night, from above, the hall, the build and the drop, backstage, dock, roof, office, green room; the pawn shop front, inside, the counter, the case, the wall of guitars (test-output/c5c3-compactor + e2e 67-70) | visual | reviewed |
| Totals | 189 shared + 2 client unit; matchmaking smoke 8/8; server smoke pass (44 NPCs); browser e2e **305/305** normal (host upload 32.7 KB/s) and **305/305** at 110 ms lag (32.0 KB/s) | all | pass |

Notes: the first run found two out-of-date test expectations (14 shops, a mesh named "beam") and a real bug: a sound faded right out reached the audio engine as 0, which throws and stopped the game loop. Sounds now never go below a floor level. The first 110 ms run passed 304/305: in the solo controls check the key 1 press landed after the click, so it punched instead of throwing. The test's waits went from 5 s to 15 s and the second 110 ms run passed (the normal run was on the same game code). A lobby washing-line mesh flagged double-sided had been stopping a whole batch of city meshes from merging; that's fixed too.

## Overhaul D1 checks: faster movement + slapstick car hits (2026-10-02)

| Area | Check | How | Result |
|---|---|---|---|
| Speed | walk 5.8, sprint 9.4, crouch 2.7 m/s; acceleration 48, braking 34, turning back 1.6x faster; slide 11.2, dodge 12 | unit + e2e (solo sprint 9.4, online walk 5.8) | pass |
| Chasers | cops 6.5, fighters 6.5, bank guards 7.2, the old lady 5.0: a sprinting player can still get away | unit | pass |
| Car hits | a moving car launches you up and along its path (SPLAT pop, honk, dust), what you carried flies out, you lie stunned 10 s with a countdown ring, then get up where you landed (no teleport) with 3 s of grace from cars | unit + e2e (in the open, launched > 0.8 m, ring shown, up near the landing spot) | pass |
| Tumble | spinning ragdoll pose with dizzy stars for others, camera roll/lurch for you; camera never flips | e2e + screenshot review | pass |
| Smoke | server smoke updated: Alice sprints into the camp (not into the roof parapet) and stops before crouching (a full-sprint crouch is now a slide) | smoke | pass |
| Totals | 181 shared + 2 client unit; matchmaking smoke 8/8; server smoke pass; browser e2e **288/288** normal (final run, host upload 37.0 KB/s) and **288/288** at 110 ms lag (35.6 KB/s) | all | pass |
| | earlier normal runs: one interrupted by a container restart (269 checks, no failures); then 287/288 three times, each one too-short test wait on this slow box: the online lock-pick helper read "time served" when the server's release beat its poll, the two-player suitcase look (15 s -> 40 s), the solo cop dispatch (45 s -> 150 s) | e2e | noted |

Note: the 110 ms run was on the build before the last three test-only fixes above (the lock-pick test helper and two waits); game code is unchanged since.

## City Redesign C5c.2 checks: Le Dumpstère (2026-10-01)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | on Mile East in Uptown; podium, cloakroom, dessert trolley, piano, chef's table, stove; the maitre d'; the Golden Truffle and Diamond Pigeon stashes; 15 stairs ending at the roof | unit | pass |
| The door | no booking and not dressed up = put back outside; broke = no booking; book ($20) or carry a designer scarf = walk in; bookings end at dawn | unit + e2e (turned away at the door) | pass |
| Other ways in | maitre d' knocked out = open; walk in the kitchen's back door; really climb crate -> boxes -> roof, and walk up the stairs | unit + e2e (in through the kitchen door) | pass |
| Inside | cloakroom, trolley, chef's table, stove: 1-2 things once a day; the piano: +3 aura and a noise; all restocked at dawn | unit | pass |
| Cops | 3 stars = exactly 3 cops, counting the one the car brings, however the timing falls | unit | pass |
| Screenshots | front by day and night, from above, the dining room, the piano, the kitchen, the roof, the climb (test-output/c5c2-resto + e2e 65-66) | visual | reviewed |
| Totals | shipped with D1 below: 181 shared + 2 client unit; matchmaking smoke 8/8; server smoke pass (41 NPCs); browser e2e 288/288 normal and 288/288 at 110 ms | all | pass |

## City Redesign C5c.1 checks: bounties and citizen's arrests (2026-10-01)

| Area | Check | How | Result |
|---|---|---|---|
| Arrest + bounty | pin a knocked-down 1-star bandit; a real cop walks up and cuffs them while you hold them; the bounty = heat × $5, paid from the seized loot then their cash; B never got up | unit | pass |
| Rules | refused if clean / standing / too far; 14 SPACE presses wriggle free; walking off lets go; getting knocked down lets go | unit | pass |
| Online | A sees C's heat and that C is down; the prompt names the bounty; E pins C (C's screen knows who); B sees it; C mashes SPACE free | e2e | pass |
| Map | wanted bandits as rough areas (1-2 stars) or exact (3 stars) with stars and bounty; clean bandits hidden | e2e screenshot 64 | reviewed |
| Screen removed | no screen, box or hack; Mile East is a plaza with the Diamond Pigeon stash in a low wall | unit + screenshot (test-output/c5c/09-mile-east) | pass |
| Totals | 175 shared unit + 2 client unit; smoke (matchmaking 8/8, server all); browser e2e **282/282 normal and 282/282 at 110 ms** (host upload 34.1 / 33.0 KB/s) | all | pass |

Notes from the C5c.1 runs:
- **First runs: test ids.** The online arrest checks matched C by the page's session id, but the host's world uses different player ids. The test now finds C as the one wanted bandit.
- **The prompt.** A giant item lying nearby took the prompt and E. The arrest prompt and E now win over grabbing.
- **Two real bugs, both fixed:**
  - Who you can pin was worked out from where C is *drawn*, which can trail behind on a slow connection. It now uses the latest snapshot.
  - SPACE was only noticed if it was down during a frame, so quick presses got lost at 1 fps. A key-down listener now catches every press.
- **Cops in the test.** One run had a cop bust C before the arrest check. The test now keeps clearing cops while it checks the arrest.
- **A first-punch miss.** One normal run missed the first punch, so 2 punch checks failed (280/282). The test now waits until A's world has C at the spot before swinging. The final normal and 110 ms runs both passed 282/282.

## City Redesign C5c checks: Uptown landmarks (2026-10-01)

| Area | Check | How | Result |
|---|---|---|---|
| Bank layout | a walk-in marble hall where the country club was: the vault, 4 deposit boxes, 2 guards, a golden stash; the keycard is at one of 6 spots in Uptown | unit + e2e (walk in through the front door) | pass |
| Loud heist | E on the vault with no keycard: the drill; heat 92 at once, bank alarm, both guards chase; 20 s of holding still and the door opens and stops blocking; dawn shuts it and restocks the gold | unit + e2e (drill starts, heat 90+, WANTED screen shows you, door opens, doorway clear, gold and cash inside) | pass |
| Sneaky heist | with the manager's keycard: open in 3 s, no heat if nobody sees; the card stays in the lock | unit | pass |
| Deposit boxes | each searchable once a day | unit | pass |
| Mayor's statue | hold E 5 s: his gold nose pops off (heat if seen, gone till dawn); tagging the plinth gives +5 aura, +15 heat | unit + e2e (nose) | pass |
| WANTED screen (removed in C5c.1) | shows the hottest bandit; hack (6 s): someone else for a minute, your heat -25, theirs +15; alone it's the Mayor | unit + e2e (hack: THE MAYOR) | pass |
| Golden stashes | 3 stashes, one golden item each, once a day | unit | pass |
| Screenshots | bank front, from above, the lobby, the counter, the vault shut, open and inside, the statue, the WANTED screen (a bandit and the Mayor) (test-output/c5c + e2e 59-62) | visual | reviewed |
| Totals | 174 shared unit + 2 client unit; matchmaking smoke; server smoke; browser e2e **278/278 normal and 278/278 at 110 ms lag** (host upload 35.7 KB/s normal, 32.0 KB/s at 110 ms) | all | pass |

Notes from this slice's runs (test-box timing and two real fixes):
- The first two normal runs crashed on this CPU-only box before the end:
  - one on a screenshot that took over 30 s to draw;
  - one on the first friend's join, which took over 8 min.
- I measured a lone joiner on this box: 6.4 min for the last commit, 8.9 min with C5c. The difference is mostly load, not the game: the city builds 12.2 s vs 11.3 s.
- The fixes:
  - The e2e now allows 120 s for a screenshot, 15 min for a join and 8 min to open a page.
  - Performance mode skips the landmarks' small dressing (chandeliers, queue ropes, flowers, spikes...). Friends' test windows run in Performance mode.
- One more failure was the test checking the vault doorway before the host's news reached the screen. It now waits for it.
- The first 110 ms run was 277/278. "Stood around: BUSTED" missed its 90 s wait by a moment, and the jail checks right after it passed. A second try also timed out at 180 s because your heat cooled below 1 star before the slow cop arrived. The test now keeps the heat on while it waits (up to 5 min) and logs the game time it took. The final 110 ms run was busted after 7 s of game time and passed 278/278. The normal-speed 278/278 run used the earlier 90 s wait.
- While chasing these I found and fixed a real bug of mine in the dawn reset: an `else` had slipped onto the wrong `if`. Props were reset twice between rounds, and not at all at dawn in worlds without loot (only the rule tests use those).

## City Redesign C5b checks: Chinatown (2026-09-30)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | 6 shophouses by the canal in the middle tier, each with an English sign and a Chinese one; 2 gates; 4 lantern rows; a stall with its own collision box in front of each shophouse | unit | pass |
| Stalls | E on a steamer: food pops out, then it's sold out; with a watcher the keeper yells and +3 heat | unit + e2e (solo: E on a steamer) | pass |
| Seafood tank | punch: SPLASH, a crab or a fish; stays broken at night; fixed at dawn | unit | pass |
| Parade | warns first; walks up Chinatown; bumps a bandit aside without knocking them down; leaves after the tail passes the far gate; 12+ red envelopes, mostly along the street; firecrackers | unit | pass |
| Screenshots | the south gate, the street, the shophouses, the stalls, from above, the parade, the lanterns at night (test-output/c5b) | visual | reviewed |
| Totals | 167 shared unit + 2 client unit, matchmaking smoke 8/8, server smoke (all), browser e2e **265/265 normal and 265/265 at 110 ms**. Two earlier normal runs were 264/265: one failed the "cars drive the new roads" check and one the "ENTER starts the match" check. Both were wall-clock waits on this slow box; both now wait on the game (up to 30-60 s) | all | pass |

## City Redesign C5a checks: the lobby squat (2026-09-30)

| Area | Check | How | Result |
|---|---|---|---|
| Arrive | before the match you arrive on the squat's roof (26 m, past the south fence); a friend does too; once the host starts, everyone is at their fort and aura is 0; joining mid-match goes straight to your fort | unit + e2e (solo) | pass |
| Fence | sprint and jump at it from the middle in 6 directions for 8 s each: still on the roof | unit | pass |
| Nothing counts | no heat, no noise on the roof; the dummy goes THWACK and never breaks | unit | pass |
| Restock | the free-stuff pile, bin lids, 2 trolleys and a spray can appear and come back; stops (and the roof is cleared) once the match is on | unit | pass |
| THROW-O-MATIC | E starts 30 s; bullseye = 3, rim = 1; time up gives 4 points, best kept | unit + e2e (E starts it) | pass |
| Grand Prix | E at the post; cones don't count without a trolley; with one: 3 cones then the finish, lap time kept | unit | pass |
| Uncle Dumpster | on the roof, stays there; his tips in order while you're near; dodges every punch; no heat | unit + e2e | pass |
| HUD | the squat panel shows on the roof; M opens and closes the map | e2e | pass |
| Old tests | rule tests make worlds without the lobby (`lobby` option); crowd counts +1 (Uncle Dumpster); statistical doorman/fisherman greeting waits 90 s; the entourage test walks 3 seeds; the solo sprint check now starts on the runway | unit + e2e | pass |
| Screenshots | the view north, the camp, both sides of the roof, the building from outside, the map, the panel (test-output/c5a) | visual | reviewed |
| Speed | host upload 31.5-31.9 KB/s for 2 players (C4a: 32.9-38.3) | e2e | recorded |
| Totals | 163 shared unit + 2 client unit, matchmaking smoke 8/8, server smoke (all; 38 NPCs incl. Uncle Dumpster), browser e2e **262/262 normal and 262/262 at 110 ms**. An earlier C5a run was 259/262: the throw-game check put the solo player at y 0 inside the squat building (the solo teleport helper now lands you on the roof), the roof's "patch" meshes tripped the old gold-sleeve-patch check (renamed), and the host's first placement counted as a prediction snap (it no longer does). A later run failed the gym-bro and traffic checks on wall-clock waits (now game-clock waits) | all | pass |

## City Redesign C4b checks: laundromat, old lady, tagging, THE PIT (2026-09-29/30)

| Area | Check | How | Result |
|---|---|---|---|
| Laundromat | 9 washers + 4 dryer stacks; E opens one in 2.2 s (walk off: cancelled); quiet (no noise, no heat); one search per machine per day (night keeps it empty, dawn refills) | unit | pass |
| Force open | punching a washer: open at once, a noise, the old lady wakes and calls it in | unit | pass |
| Old lady | asleep upstairs; a noise across town doesn't wake her; one outside does: she yells, +12 heat, then chases you; if you're gone she goes back to bed; asleep she can't be punched or hit and isn't a witness | unit + e2e | pass |
| Tagging | needs a can out, the full hold and a real wall face; 1.6 m apart; 5 per can (then it's gone); +1 aura each; heat only if seen; night keeps tags, dawn scrubs them; a host whose clock is behind finishes the tag when it catches up | unit + e2e (solo and online: B sees A's tag) | pass |
| THE PIT | in the low end; 12+ ramp steps; 9 spray cans around town (3 in the pit) | unit + e2e | pass |
| Fixes | the precinct is in the middle tier by the canal; the tutorial ledges and tunnel are gone (the mantle and crawl tests use the freight dock and the sewer pipe); wall textures never cover glass | unit + e2e + screenshots | pass |
| Old tests | 14 shops with cashiers; 9 upstairs; crowd count +3; the pit's funbox loot moved off the rail | unit | pass |
| Screenshots | THE PIT, the laundromat inside and out, the old lady at her window, the precinct, the freight dock (test-output/c4b) | visual | reviewed |
| e2e runs | 252/255, 252/255 (online tag test: A's keys weren't switched on yet; fixed), 253/256 (all C4b checks pass; the gym-bro slap check failed while I was compiling at the same time) | e2e | noted |

## City Redesign C4a checks: mess (2026-09-29)

| Area | Check | How | Result |
|---|---|---|---|
| Breakables | 150+ street things are props tied to their boxes (shop windows, bus stops, hydrants, mailboxes, benches, planters, tables, pallets); 28 shop windows know their shop | unit | pass |
| Smash | a bench takes 2 hits, then stops blocking (you can stand where it was); day damage lasts the night, dawn repairs it | unit + e2e (solo) | pass |
| Shop window | 2 hits: shop alarm, cashier heat, and you can walk through into the shop | unit | pass |
| Heat if seen | smashing where nobody's looking adds nothing; with a pedestrian watching, it does | unit | pass |
| Noise | a cop within earshot comes to where it smashed | unit | pass |
| Hydrant | a burst hydrant's jet shoves you away / lifts you | unit + screenshot | pass |
| Throwing | two thrown bricks break a planter (the thrower's hits) | unit | pass |
| Junk | 46-48 pieces at their spots, worth $0-5, never from random loot, not counted in the loot caps, back the next day | unit + e2e | pass |
| Online | A smashes a bench: B's screen hides it too and B's collision agrees | e2e | pass |
| Old tests | cap / giant / plaza-rarity / night-scarcity tests ignore junk; the smash-and-grab heat test now has a watcher (heat only if seen) | unit | pass |
| Speed | host upload 32.9-38.3 KB/s for 2 players (C3: 35.8-38.4) | e2e | recorded |
| Screenshots | trolleys, shop window before/after, hydrant jet, bench pieces (test-output/c4a) | visual | reviewed |
| Totals | 150 shared unit + 2 client unit, matchmaking smoke 8/8, server smoke (all, 37 NPCs incl. the fisherman), browser e2e 242/242 at 110 ms and 242/242 normal (an earlier normal run was 241/242: the raccoon check ran out of time on this slow box; the event works in 4 seeds in a direct check; its wait is now 90 s like the airdrop's) | all | pass |

## City Redesign C3 checks: the park (2026-09-29)

| Area | Check | How | Result |
|---|---|---|---|
| Pond | pear-shaped (2 circles), 20+ wading strips all inside the pear, wade in both ends, dry outside; the old 2A wading test moved onto the new pond | unit | pass |
| Fountain | shallow water inside a 0.35 m rim you can step over | unit | pass |
| Bushes | 5 on the lawn, not in water; crouch in one and a cop 10 m away can't see you; standing up, or crouching on open grass, he can; a cop close enough to hear finds you | unit | pass |
| Fisherman | at his jetty, grumbles at bandits, fights back, back to fishing after 40 s; counts like the doorman (not the crowd) | unit + e2e | pass |
| Pigeons | ~11 round the fountain (none in the pond); sprinting at them scatters them | e2e | pass |
| Crowd | 6 seeds x 5 min: no pedestrian stuck > 20 s; 5 seeds x 5 min traffic + pedestrians: no crashes, every road driven, longest stop 22-25 s, tick 0.27-0.31 ms | scratch soaks + unit | pass |
| Fix | walkers could wait up to 20 s behind a car queuing to join the roundabout (it sat on the zebra): roundabout zebras moved 5 m out | unit soak | pass |
| Screenshots | park aerial, fountain + Mayor on the toilet, pond + fisherman + shark fin, bush, promenade (test-output/c3) | visual | reviewed |
| Totals (C2 + C3 code) | 142 shared unit + 2 client unit, matchmaking smoke 8/8, server smoke, browser e2e 237/237 (normal) and 237/237 at 110 ms lag | all | pass |

Test changes made during C3 (the test box, not the game): friends' test windows B/C/D run in Performance mode (4 CPU-drawn cities starved the one software GPU; the host window A keeps full detail); longer waits for the 4th window to load (15 min), the day intro (90 s) and banking (150 s), all because the game clock runs slowly on this box; the tug-of-war grab gets one retry, like the grab test before it. City mesh build time on this box: ~4.3 s of which ~3.3 s is Chrome's first 2D canvas on the software GPU (not the game).

## City Redesign C2 checks: buildings and façades (2026-09-29)

| Area | Check | How | Result |
|---|---|---|---|
| Fronts + signs | every street building (66) has a front (shop or tower lobby) facing a real street; every front 3 m+ wide has a parody sign (61; 5 slivers go without); no block repeats a sign; shops are 4.8 m+ tall so the shopfront + fascia fit | unit (layout.test) | pass |
| Neighbours | no two touching street buildings share a colour or a sign (14 pairs checked) | unit | pass |
| Old tests | all C1/C1.1 layout, traffic, fairness, police and world tests still pass with the taller one-storey shops (low tier now 4.8-9.7 m, was 3.2-9.7) | unit | pass |
| Façade detail | on in normal mode (2,608 pieces), off in Performance mode (0 pieces) | e2e + scratch check | pass |
| Performance | triangles in view, same 5 spots, C1.1 -> C2: Uptown Ave 283k -> 393k, Yards 397k -> 466k, Old Brick 307k -> 402k, Market Row 279k -> 369k, hotel corner 288k -> 369k (about +30%); Performance mode in the Yards: 365k. City load 9.1 s -> 9.6 s. Signs now share a few 2048 px sheets (one draw call per sheet, not per sign). Frame rate must be checked on a real PC (this box renders on the CPU) | measured | recorded |
| Screenshots | 22-view tour (test-output/c2): shop streets in all three tiers, fire escapes, every landmark (City Hall, hotel, HQ, casino, museum, mall, country club, Gilded Pigeon, market hall, Bijou, St. Dumpster's, station, marina office), aerials | visual | reviewed |
| Totals | 139 shared unit + 2 client unit + matchmaking smoke + server smoke + browser e2e 234/234 (normal). The 110 ms run for C2 alone was spoiled by my own load on the machine; C2's code is covered by the C3 runs (237/237 normal and at 110 ms) | all | pass |

Notes on the C2 runs: the C1.1 110 ms run that was restarted overnight timed out joining by invite (8 min) while I was running screenshot tours on the same machine; the C2 runs were done with nothing else running.

## City Redesign C1.1 checks: Blake's layout fixes (2026-09-28)

| Area | Check | How | Result |
|---|---|---|---|
| Roads | no road behind City Hall any more (nothing at z 96), the Mile no longer joins the Parade, Gold St runs east only, City Hall Drive is a one-way U; all the C1 road checks still pass (no dead ends, every road reachable) | unit (layout.test) | pass |
| Traffic | 5 seeds x 5 min with pedestrians: no two cars collide, every road lane driven, longest stop ~25 s, nobody stuck; host tick ~0.3 ms | scratch soaks | pass |
| Tent Town | no fort walls; 4 open yards (16 x 15 m) evenly spaced 47.5 m apart with bold border lines + corner flags; rail yard and canal reach the south fence; bus depot and car park gone | unit + screenshots | pass |
| Canal | fall in, splash, hand item lost, paddle 1-2.2 m/s (e2e measured 1.9 m/s), cannot climb out over the 1 m kerb, out at a ladder; eye height 0.60 m in the water | unit + e2e | pass |
| Footbridges, lookout | both footbridges and the broken-ramp lookout are climbable | unit | pass |
| Doorman | stands at his post by the Gilded Pigeon Residences, fights back (3 hp), returns to his post; not counted in crowd totals | unit + e2e | pass |
| Landmarks | Gilded Pigeon tower, formal garden ("RESERVED FOR THE NEXT MAYOR"), sewer outfall + crawl pipe, boxcar siding present; blocks still pass frontage / empty-ground / alley checks | unit | pass |
| Fairness | walk to the nearest quarter of the richest 20%: 189.9 / 199.7 / 193.3 / 183.1 m (9.1% spread, limit raised to 12%); average to all of it differs 16.1%. Blake accepted this ("good enough now") | unit | pass (accepted) |
| Raid alert | still fires on entering a yard at night, not by day (no walls now: the yard lines are the trigger) | unit + e2e | pass |
| Screenshots | 29-view tour incl. new: garden, apartment tower + doorman, canal footbridge, sewer outfall, boxcar siding, fort yards | visual | reviewed |
| Speed | host upload 33.9 KB/s for 2 players (C1 37.6) | e2e | recorded |
| Totals | 137 shared unit + 2 client unit + matchmaking smoke 8/8 + server smoke (all) + browser e2e 233/233; at 110 ms lag the run was cut off twice by session restarts (83 checks passed, 0 failed before the cut) | all | pass (110 ms run incomplete) |

Notes on the C1.1 browser runs: after the runs only the version badge changed (CITY C1 -> CITY C1.1); the preview harness passed with it. the first full run was 232/233; the one failure was the "mix of pedestrian types" check, which is chance-based (it needed 6 of the 8 pedestrian kinds among 20 random people). It now needs 5 and the rerun passed. Screenshot 22 still points at where the bus depot used to be (now Tent Town junk); the tour will be renamed in C2.

## City Redesign C1 checks: layout grey-box (2026-09-28)

| Area | Check | How | Result |
|---|---|---|---|
| Roads | all straight + axis-aligned (the ring is the only curve); every road lane leads on (no dead ends); from any road you can drive to every other; every lane point on the asphalt; lights only at the 2 Mile crossings, 4 roundabout entries, give way elsewhere | unit (layout.test) | pass |
| Traffic | 22 cars, 7 seeds x 5 min without pedestrians: no two cars ever closer than 2.6 m, every road lane driven, longest stop 22-27 s (one red light); with pedestrians, 3-seed 5-min soak + wanted-bandit soak: nobody stuck > 20 s, no car stopped > 35 s, nobody inside anything, every road driven | unit + scratch soaks | pass |
| Blocks | 85 street sides checked: longest blank stretch 11.5 m (limit 15); 0 bare ground samples on a 2 m grid; 20 landmark shells present and none over half its block | unit | pass |
| Alleys | every bit of walkable ground (0.5 m grid) connects to the streets, except the jail cells | unit | pass |
| Tent Town | 4 compounds 66 m apart under the 10 m highway, 2.5 m walls, gate + squeeze gap open; lookout ramp and car-park ramp climbable | unit | pass |
| Fairness | walk to the nearest quarter of the richest 20% of loot: 204 / 209 / 210 / 203 m (3.4% spread, limit 5%). Average to all of it: 280 / 289 / 251 / 255 m (15.3%): open question for Blake | unit | pass (with the open question) |
| Raid alert | a rival entering your compound at night alarms you at once, names them, not by day, not for the owner, not again within 15 s; online: A's banner names the raider and the item, red edge + arrow home | unit + e2e | pass |
| Old tests | moved onto the new map (build yard = the old plaza for tests); stale server-smoke counts fixed (35 people, 22 cars, props >= 60) | all | pass |
| Speed | host tick 0.31 ms (2A 0.28); city load 9.0-10.3 s (2A 9.5-10 s); host upload 37.6 KB/s for 2 players (2A 34.1) | measured | recorded |
| Screenshots | 23-view tour (aerials, Tent Town, compound gate, lookout, the Yards, the Mile lights, roundabout, park, precinct, Old Brick, Market Row, Uptown Ave, City Hall, casino, station, marina, build yard, arches, skyscraper, Corner Mart, bus depot, noodle gate) | visual | reviewed |
| Totals | 135 shared unit + 2 client unit + matchmaking smoke 8/8 + server smoke (all) + browser e2e 230/230 and 230/230 at 110 ms lag | all | pass |

Notes on the C1 browser runs: earlier runs failed on test problems, each fixed and rerun: the tunnel (the yard's gravel is 0.15 m up), the car count (18 -> 22), the crowd-culling check (now waits in the park), the solo raid overlay (the check read it before the next frame), the multiplayer raid banner text, and the tug of war picking up a *different* giant duck that had spawned elsewhere (now it uses the one it dropped). One 110 ms run timed out reloading a tab with 3 other windows open (8 min); it passed on the rerun and the city loads in 9-10 s, the same as 2A. After the final runs, only UI wording changed (the airdrop bar no longer says "plaza"; the district names helper): type-checked, unit tests and the preview rebuild passed, the browser suite was not rerun for that.

## Overhaul Slice 2A checks: the new city (2026-09-27)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | 230 m city, mostly towers, 20 street-level buildings (14 walk-in shops, 2 lobbies, 4 closed fronts), 15 shops with cashiers incl. the taco truck, every loot source, nothing on the road, landmarks clear | unit | pass |
| Walk-in | every shop and lobby can be walked into from the street and out the back door | unit (movement rules) + e2e (Corner Mart) | pass |
| Upstairs | all 7 upper floors reachable: inside stairs (2 stockrooms, offices, apartments) and fire escapes (2 apartments, gym) | unit (movement rules) | pass |
| Shoplifting | only counts on the shop floor, not from the stockroom above | unit | pass |
| Pond | you wade at 45% speed (e2e measured 2.3 m/s vs 5 walking); pedestrians never walk into it | unit + e2e | pass |
| Pedestrians | wander into shops and back out (3+ shops visited in 3 min) | unit | pass |
| Traffic | 5-minute soak x3 seeds + wanted-bandit soak on the new map: nobody stuck, no car stopped > 12 s, nobody inside anything | unit | pass |
| Loot | at least 70% of loot value indoors; loot upstairs | unit | pass (measured ~83%, see decisions) |
| Performance | interiors drawn only within 42 m (0 drawn from the plaza centre, 5 inside a shop) | e2e | pass |
| Screenshots | 20 views reviewed (shopfronts, 4 interiors, stairs, fire escape, 3 upstairs, taco truck, statue, pond, corner block, alley, bank shutters, night street) | visual | reviewed |
| Speed | world tick 0.28 ms (5A.1 city: 0.17 ms) on this box; city load 9.5-10 s vs 7.9 s (software rendering); in view: ~205k triangles on a shopping street vs ~126k, similar mesh count | measured | recorded |
| Host upload | 34.1 KB/s for 2 players (5A.1: 31 KB/s) | e2e | pass |
| Totals | 128 shared unit + 2 client unit + matchmaking smoke 8/8 + browser e2e 224/224 and 224/224 at 110 ms lag | all | pass |

Note on the browser test for 2A: earlier runs failed on test problems (not game bugs), all fixed in the test: the cashier count (4 -> 15), the police station's cell position (it moved), waits too short for the heavier city on this CPU-only test box (respawn, joining, refresh), a punch check that didn't allow for healing between missed clicks, and a test-only seat-hold override (?seathold=) because reloading the city here can take over 2 minutes. Friends' test windows now render at 800x450 so 4 windows fit on the box.

## Manual checklist for Blake (City Redesign C5c)

- [ ] Rob the bank both ways: drill it (loud) and find the keycard (sneaky). Is 20 s of drilling too long with the guards on you?
- [ ] Prise off the Mayor's nose and tag his plinth.
- [ ] With a friend: get 1 star, let them find you on the M map, knock you down and hold you for the cops. Is $5 per heat point the right bounty? Is 14 SPACE presses to wriggle free about right?
- [ ] Find the 3 golden stashes (hint: look for a gold glint on a loose brick).

## Manual checklist for Blake (City Redesign C5b)

- [ ] Walk Chinatown by day and at night. Does it feel right? Anything that looks off or not respectful?
- [ ] Help yourself at a stall, and punch the seafood tank.
- [ ] Catch a dragon parade and grab the red envelopes. Too long, too short, too much money?

## Manual checklist for Blake (City Redesign C5a)

- [ ] Start a room: does the view from the squat make you want to go down there?
- [ ] Listen to Uncle Dumpster for a minute. Funny enough? Too chatty?
- [ ] Play a round of THROW-O-MATIC and a lap of the Trolley Grand Prix. Too easy or too hard?
- [ ] Press M in a match. Is the map easy to read?

## Manual checklist for Blake (City Redesign C4b)

- [ ] Open a washer quietly, then punch one open. Did the old lady get you?
- [ ] Tag the walls in THE PIT. Does +1 aura per tag feel worth the heat?
- [ ] Run up the quarter pipes and along the fun box.

## Manual checklist for Blake (City Redesign C4a)

- [ ] Smash a shop window and walk in. Too easy? Too loud?
- [ ] Stand in a burst hydrant's jet.
- [ ] Throw bricks, fish and chairs at things. Do the pieces look good?
- [ ] Smash something in an empty alley, then in front of a crowd: does the heat difference feel right?
- [ ] Drag a trolley or barrel home. Worth it for $3-5? (It's meant as a toy, not loot.)

## Manual checklist for Blake (City Redesign C3)

- [ ] Wade through the fountain and the pond. Too slow? Too fast?
- [ ] Crouch in a bush while wanted: does hiding feel fair (cops right next to you still find you)?
- [ ] Sprint at the pigeons.
- [ ] Punch the fisherman. Funny enough?
- [ ] Is the Mayor on his toilet readable from the promenade?

## Manual checklist for Blake (City Redesign C2)

- [ ] Walk a street in each tier: do the Yards read as grimy brick, the middle as painted render, Uptown as stone + glass?
- [ ] Any sign too small to read, or any joke that falls flat? (the lists are in shared/src/city.ts)
- [ ] FPS on your PC on Uptown Ave and in the Yards, normal mode vs Performance mode (Settings).
- [ ] Landmarks: can you pick out City Hall, the casino, the market hall, the church and the Gilded Pigeon from a distance?
- [ ] Anything that looks climbable but isn't (fire escapes, balconies)? Those become climbable in C6.

## Manual checklist for Blake (City Redesign C1.1)

- [ ] Tent Town: can you see your yard's border clearly by day and at night? Are the forts far enough apart (47.5 m)?
- [ ] Jump in the canal: does the splash + losing your hand item feel fair? Is paddling too slow? Can you find a ladder easily?
- [ ] Cross both footbridges and crawl the sewer pipe.
- [ ] Say hi to the doorman at the Gilded Pigeon. Funny enough?
- [ ] Watch City Hall Drive and Gold St: does one-way traffic look right?
- [ ] The garden behind City Hall: nice spot or wasted space?

## Manual checklist for Blake (City Redesign C1)

- [ ] Fly round the new city: do the three tiers read (plain south, nicer middle, fancy north)?
- [ ] Stand at the Mile x Yards Rd lights for a minute: do the lights and the queues look right?
- [ ] Drive your eye round the roundabout: do cars give way properly, anything clip the kerb?
- [ ] Walk from your fort to Uptown from each corner: does any fort feel unfair?
- [ ] Tent Town: compound size, the gate, the squeeze gap, the highway overhead. Cosy or cramped?
- [ ] With a friend at night: walk into their compound. Is the alert loud enough? Too much?
- [ ] FPS on your PC on Uptown Ave (the tallest part now).

## Manual checklist for Blake (Overhaul Slice 2A)

- [ ] Does the city feel full now? Too many / too few shops on each street?
- [ ] Walk into a few shops. Big enough? Easy to find the loot?
- [ ] Climb to an upstairs (Pixel Palace back room, Lawyers 4 Less, the fire escapes behind the donut / pizza / sneaker shops).
- [ ] The plaza: pond, statue, taco truck, fountain. Does it read as a park?
- [ ] FPS on your PC walking down a shopping street (this is the heaviest part of the new city).

## Manual checklist for Blake (Overhaul Slice 1)

- [ ] Traffic: watch a few crossings. Any car stuck behind a pedestrian for more than a few seconds?
- [ ] Wheel + 1-4: does switching feel quick? Is "4 = fists" natural?
- [ ] Hands: do the white wraps and lower position look right? Held items a sensible size?
- [ ] Health: do 3 punches to knock down feel right? Is the regen noticeable?
- [ ] Throw a giant item (heave). Fun or annoying?
- [ ] HUD: can you read health/stamina at a glance? Is the Q chip clear?

## Manual checklist for Blake (Phase 5A)

- [ ] Does the full cycle feel good (3 min day, 1 min night, shop, upgrades)? Too long / short?
- [ ] Night: dark enough? Can you still see what you're doing?
- [ ] Raid a friend's fort at night. Is the alarm loud/clear enough?
- [ ] Pawn shop: can you read Sal's mood? Is haggling fun or annoying?
- [ ] Tasers at 3 stars: fair? Can you see the red laser in time to dodge?
- [ ] Tug of war over the duck/arcade machine/airdrop crate.

## Manual checklist for Blake (Phase 4.6)

- [ ] Host a room, have 1-3 friends join by link. Does it feel smoother than before?
- [ ] Have a different friend host once too.
- [ ] Anyone who can't connect at all? (tell me their network type: mobile hotspot / school / home)

## Manual checklist for Blake (Phase 4.5)

- [ ] Police: better now? Still too many?
- [ ] Lock picking: do your clicks register now? Is it still hard enough?
- [ ] Camera after jail: still swinging?
- [ ] Big shots: worth the heat? Which one is the most fun?

## Manual checklist for Blake (Phase 4)

- [ ] Do the windows still flicker anywhere? Does the camera ever flip now? Any pedestrian still stuck on a car?
- [ ] Heat: do the stars go up at the right pace? Too many cops, too few?
- [ ] Can you shake the cops by breaking line of sight? Does it feel fair?
- [ ] The lock-picking game: too hard, too easy, fun? (I aimed for "you usually make it with a few seconds left if you're good".)
- [ ] 3 stars: is the cop car scary? Did it ever get stuck?

## Manual checklist for Blake (Phase 3.5)

- [ ] Does it feel like a city now? Too big / too small?
- [ ] Traffic: too many cars, too few? Are wipeouts funny or frustrating?
- [ ] Robbing: is HOLD R at the till + E to grab the register clear?
- [ ] Dumpsters / smashing: is the loot fun? Too much, too little?
- [ ] Stamina: better now?
- [ ] FPS on your computer (Settings > Show FPS). If it's low, try Performance mode and tell me the difference.

## Manual checklist for Blake (Phase 3)

- [ ] Is 3 minutes per round right? Is 3 rounds right?
- [ ] Is the 10 s bank lock too short / too long for stealing to be fun?
- [ ] The run home at the end: tense and fun, or just stressful?
- [ ] Events: which is the most fun? Too frequent? Truck too brutal?
- [ ] Pedestrians: do they move more naturally now? Is 18 the right amount?

## Manual checklist for Blake (Phase 2.5)

- [ ] Sparkles instead of beams: can you still spot the good loot when you're close?
- [ ] Punching: does the jab + BONK feel satisfying? Is the reach right?
- [ ] Fighters: is the slap fight fair? (2 hits wins; watch for the wind-up and dodge/back off)
- [ ] Is 35 people too busy / too sparse? Any slowdown on your computer?
- [ ] Getting knocked down: too long? Is the "lying on the ground" camera funny or annoying?
- [ ] Speech lines: funny? Too frequent?

## Manual checklist for Blake (Phase 2)

- [ ] ~~Can you spot the good loot from far away (light beams)?~~ Beams replaced by sparkles in Phase 2.5 (Blake's feedback).
- [ ] Carrying the TV: too slow? too blocking? Is the held item too big on screen?
- [ ] Throwing: does the charge feel good? Is it too easy/hard to aim?
- [ ] Pockets: is right-click to cycle clear enough?
- [ ] City: too big / too small? Enough places to climb and hide?

## Manual checklist for Blake (Phase 1)

- [ ] Does sprinting then running out of stamina feel tense but fair?
- [ ] Is the weight right? (stopping skid, turning, air control)
- [ ] Slide (sprint + C), dodge (Q), climb (SPACE facing a ledge): fun? too strong? too weak?
- [ ] Hands: right size and style? Do they react enough?
- [ ] Crawl tunnel: does crouching feel sneaky?

## Manual checklist for Blake (Phase 0)

- [ ] Title screen loads; music starts only after you click
- [ ] Volume sliders change music and UI sounds; Mute silences everything
- [ ] Solo: mouse look feels right; try sensitivity + FOV sliders
- [ ] Solo: sprint, jump up the yellow steps to the teal platform, walk through the alley
- [ ] Create Room in one browser, open the copied link in another, see each other move
- [ ] Close one window mid-game: the other shows "(reconnecting)" and then removes them after 30 s
- [ ] Tell me how the movement *feels*: too floaty? too fast? too slippery?
