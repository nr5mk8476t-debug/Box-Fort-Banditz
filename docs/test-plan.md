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

## R12.8: one-draw outlines, the simulation's garbage, the frame-rate cap (2026-11-12)

| Area | Check | How | Before (R12.7) | Result |
|---|---|---|---|---|
| Draw calls | fixed views, real counts, old outline (`?ink=old`) vs new, same build | A/B script | balcony 996, window 887, bar 447, darts 191, street 700, Little Italy 1,000, façade close 394 | 775, 711, 337, 171, 585, 765, 312 (−20 to −25%) |
| Draw budget | 10 views | `tests/draw-budget.mjs` | (the R12.7 version didn't run: fixed) | all within; budgets tightened (balcony 1,143 → 931, window 1,063 → 846, bar 489 → 390, uptown 1,321 → 1,054...) |
| Looks | 7 views, old vs new outline | screenshots + pixel diff (`screenshots/r12_8/ink-*`) | - | edges move ~1 px; Little Italy's arch now shows its stripes (fixed); nothing missing or doubled |
| Flicker | 7 views, R12.7 build vs this one | `tests/flicker-find.mjs` + `.py` | 525 / 12,588 / 2,641 / 975 / 2,862 / 395 / 351 | 191 / 21,749 (a customer moving in front of the camera, in both) / 2,330 / 300 / 1,606 / 182 / 152 |
| Garbage | 60 game s of the city sim (57 people, 22 cars), compiled with `tsc` like the browser build | `node --trace-gc` | 87 MB/s, 333 collections, 0.94 ms/tick | 9.7 MB/s, 37 collections, 0.31 ms/tick |
| Garbage | the browser on the test box, balcony view, 40 s | Chrome `--trace-gc` | 6.7 MB/s | 5.1 MB/s (the test box draws ~2 frames a second, so it runs far fewer sim ticks than a real PC: the Node figure is the one that applies to Blake's) |
| Sim results | determinism, replays, traffic, NPCs | `npm test` | | 312 + 31, pass |
| Frame cap | the setting exists, defaults to 240, the BENCHMARK lifts it | settings + code | - | by inspection; the real effect needs Blake's PC (the test box can't reach 60) |
| Smokes | | signal + server smoke | | pass |
| Browser e2e | normal / 110 ms | e2e | | 439/439 / PENDING |
| Real PC | Blake's BENCHMARK (build 0248648) | Blake | R12.7: median 4.0 ms, 99th 8.4, 1% low 104 FPS, worst 22 ms; balcony front 6.1 ms (1% low 98), window 5.9 (89); first walk ~98 MB/s of garbage | median 4.1, 99th 8.2, 1% low 108, worst 24; balcony front 6.0 (141), window 6.2 (89); first walk ~16 MB/s. Draws −17 to −23% but the render call didn't drop (balcony 4.9 → 4.9 ms): see perf-budget.md |

## R12.7: draw calls (2026-11-12)

| Area | Check | How | Before | Result |
|---|---|---|---|---|
| Draw calls | 10 fixed views, real counts (the engine's counter) | `tests/draw-budget.mjs` | balcony 1,550, street 1,146, window 1,433, across the road 512, bar 495, fireside 352, darts 244, Little Italy 1,329, crossroads 1,194, uptown 1,449 | 942, 713, 856, 344, 443, 274, 202, 980, 1,012, 1,160; budgets recorded |
| Looks | screenshots of every view, before and after | pixel diff + by eye | - | identical apart from people and cars that moved |
| Unit, smokes | | `npm test`, smokes | | 312 + 31, pass |
| Browser e2e | normal / 110 ms | e2e | | 438/438; at 110 ms one run failed one check ("results: lost 0": the chicken at sunrise, game rules, not drawing), the re-run passed 438/438 |
| Real PC | Blake's BENCHMARK | Blake | - | to do |

## R12.6b: the pub's frame time (2026-11-09)

| Area | Check | How | Before | Result |
|---|---|---|---|---|
| Draws | the fireside view: active meshes | in-page count, R12.5b / R12.6 / R12.6b | 171 / 190 | 179 (Mickey and his gear hidden from inside; the rest: the new façade through the windows) |
| Stutter | Babylon re-checks of lights while standing at the bar 30 s | in-page counter | 0 / 0 | 0 (the hooks are bypassed now anyway) |
| Route | R12.5b vs R12.6 on the test box | `perf-route` + `perf-compare` | - | medians -11%..+5%; the fireside's draws +18-22% (fixed above) |
| Unit, smokes | | `npm test`, smokes | | 312 + 31, pass |
| Browser e2e | normal / 110 ms | e2e | | 438/438, 439/439 |
| Real PC | Blake's BENCHMARK | Blake | R12.6: bar 4.7, fireside 4.0 ms (R12.5b 3.8, 3.1) | to do |

## R12.6: façade, balcony, flicker, night lighting, WEE MICKEY, Split the G social (2026-11-09)

| Area | Check | How | Before | Result |
|---|---|---|---|---|
| Façade | front, angled, side, corner: day and night, before/after | screenshots (`screenshots/r12_6/facade-*`) | bright red, flower ridge, green slabs at the corner, tin triangle on the roof | pass (reviewed) |
| Façade | the SIDE BAR mat reads from the street; no sill across the side door | screenshots | upside down; a sill at knee height | pass |
| Balcony | cantilever: brackets off both walls, nothing on the pavement; floor continuous | screenshots (`balcony-before-after-*`) | posts on the pavement | pass |
| Flicker | z-fight finder (`tests/flicker-find.mjs`: 7 frames 5 mm apart, A→B→A pixels) at Little Italy (near, far, night, angled), pub walls, façade, 40-60 m views | automated + by eye | arch bands flipping; lines on the board | pass: none left on the arch (moving people/cars flag, checked by eye) |
| Flicker | mirrors, clocks, pictures, signs from below, the side and far | screenshots + clips (`flicker-italy.mp4`, `flicker-mirrors.mp4`, frame-stepped) | solid gold mirrors, gold boards | pass |
| Night | people and the games' pieces inside lit by the floor's lamps | screenshots (`night-bar-people.jpg`, `night-upstairs-people.jpg`) | grey-blue figures | pass |
| Mickey | in the yard, reachable, the gap from the east street open; shut by day; x0.75 / black market x0.9; heat on every deal; no money or junk; one payment per item; out of reach = nothing | unit (`shared/test/mickey.test.ts`) | - | pass (6 tests) |
| Mickey | gear: one of each, broke = no; a punch shuts him; the kit halves your stretch once; the smoke bomb beats a grab once; both reset with the match | unit | - | pass |
| Mickey | the yard, him, his gear, the lamp at night; overhead | screenshots (`mickey-*`) | - | pass (reviewed) |
| Split the G | release = result; the host clamps a hold more than 0.4 s off what it saw; everyone sees your pint (level, drinking) | unit (`shared/test/splitg.test.ts`) | settled 2-3 mm on after you let go | pass |
| Split the G | a spectator sees the glass in hand and the drink to the mouth; the reveal on the bar with the distance | 2 browsers (host + guest), screenshots (`splitg-*`) | - | pass (reviewed) |
| Challenge | open, opt in/out, 2+ to start, no joining halfway, 3 pints counted, lowest wins the prize, nothing after it's over | unit | - | pass |
| Challenge | leavers (walk out, drop out) are OUT and the rest finish; time runs out = OUT; nobody joins = called off | unit | - | pass |
| Challenge | the card on the bar: prompt, open, a guest joins, it starts, the HUD | 2 browsers, screenshots | - | pass |
| Pool | a short shot never flashes by in one frame (5 fps); sync tests count only shots the window had time to show | client unit (`sync.test.ts`) | 2 shots skipped at 5 fps (exposed when Mickey shifted the random sequence) | pass |
| Server | the player schema fits Colyseus's 63 fields (gear + pint packed in one) | server smoke | the server wouldn't start with 3 new fields | pass |
| Smokes | `signal-smoke.ts`, `server-smoke.ts` (NPCs: 63, + Mickey) | smoke | - | pass |
| Unit | shared + client | `npm test` | - | 312 + 31 pass |
| Browser e2e | the whole run (4 windows, solo, online, the new city, the pub, games) | `node tests/e2e-phase0.mjs` | - | 438/438 pass |
| Browser e2e | the same at 110 ms latency | `LATENCY=110 node tests/e2e-phase0.mjs` | - | 439/439 pass |

**Audit of R12.5's open bugs** (inspection / automated / gameplay):

| Bug | Automated coverage | Status |
|---|---|---|
| Traffic deadlock | `R12.3b: police cruisers... never lock up (4 seeds x 4 min)`, `the reproduced jam`, `chases`, `a parade closing a street` | pass (automated) |
| Pavement overlaps | `R12.3b pavement: no two pieces overlap`, `no gaps`, `walking along and across the joins` | pass (automated + R12.3b screenshots) |
| Pool skips and turns | sync tests (5 network conditions, two tables, game after game), `the line of shots...`, `replay timing` | pass (automated; the 5 fps case fixed this round) |
| Pool camera | the stand-up blend: eased, real time, capped step | inspection + R12.4 clip |
| Darts handover and sync | `darts (R12.4): your third dart's in the air...`, `the other board`, `darts (R12.5): watching a mate throw` | pass (automated) |
| Leave and reconnect | `PeerRoom (R12.4)` x2, e2e reconnect / host-leaves checks | pass (automated) |
| Minigame cleanup | e2e: leave mid-pint (+ blur) on the new city; `ArenaScene.dispose` | pass (automated, e2e) |
| Benchmark at 30/60/144/240 FPS, a background tab | `client/test/bench.test.ts` | pass; settings recorded; now puts you back where you were |

## Manual checklist for Blake (R12.6)
- [ ] Split the G: does "where you let go is your score" feel fair? Try the challenge with a mate.
- [ ] Watch a mate drink: does the glass in their hand and the reveal on the bar read well?
- [ ] Wee Mickey: are his prices and the heat right? Does the smoke bomb feel worth $25?
- [ ] The new front at night and by day; the balcony from the street.
- [ ] Any flicker left anywhere (Little Italy, the pub's walls, far-off buildings)?

## R12.5b: GPU warning, review fixes (2026-11-08)

| Area | Check | How | Before the fix | Result |
|---|---|---|---|---|
| GPU warning | software rendering detected; the warning and steps shown; hidden with hardware (the test box is always software: checked with ?gpucheck=1) | browser (1280×720, 960×540) | (new) | shown with ?gpucheck=1 at both sizes; hidden without |
| Adaptive resolution | down to 60% at 30 ms frames, back to 100% at a capped 60 FPS (16.7 ms); right on the edge, at most 14 changes in 10 minutes; between the thresholds, left alone | client unit (new, 3) | stuck at 60% at 60 FPS (needed under 14 ms) | pass |
| Benchmark | room for ~10 min at 300 FPS; paused tab frames left out and reported; empty stretches marked; settings recorded; starts at full resolution | Blake's run (filled at 20,000 frames: 5 night views empty; a 162 s "frame" from a background tab) | | fixed (re-run by Blake pending) |
| Pint | losing the window mid-drink lets go | e2e (new check) | kept gulping | pass (it first FAILED on the R12.5b build: the drink only took the mouse and SPACE a frame after the pint was poured, so a let-go or a lost window in that frame went nowhere; fixed: bound the moment it's poured) |
| Darts | watching: one dart showing at a time, one impact, when the host's state arrives before the throw's event | client unit (new; fails on the old code) | two darts, two impacts | pass |
| Crowds | 30 people pressed together step apart | shared unit (new) | (all pairs: same result) | pass |
| Everything | 301 shared + 31 client unit (incl. the benchmark at simulated 30/60/144/240 FPS and a 30 s paused tab); typecheck; smokes | full suite | | pass |
| | browser e2e, normal / 110 ms | e2e | | normal: 437/438 (the blur check: fixed), then 439/439 on the fixed build; 110 ms: 438/438 |

## R12.5: performance and a foundation for a bigger city (2026-11-07)

Before/after on the same test box, same build settings, same route (the BENCHMARK, `tests/perf-route.mjs`), and the same
fixed views (`views.mjs` in the session scratchpad). The test box renders in software (about 1–2 FPS): every number is
relative CPU/draw cost, NOT a real graphics card's frame rate. GPU time: unavailable here. Blake's PC result is pending.

| Area | Check | How | Before | Result |
|---|---|---|---|---|
| Whole route (solo) | median / 99th / 1% low / worst frame | BENCHMARK (`base-solo` → `after2-solo`) | 822 / 1,616 ms, 0.4 FPS, 2,835 ms | 610 / 1,229 ms, 0.8 FPS, 1,286 ms |
| Every stretch | median, triangles | perf-compare | | median −17 to −37%, triangles −41 to −66% on all 23 stretches |
| Draw calls | per fixed view (across the road, bar, window, darts, balcony, street) | views.mjs, baseline build d61660e vs now | 505 / 473 / 1,237 / 215 / 1,339 / 1,100 | 529 / 488 / 1,377 / 235 / 1,473 / 1,143 (+3 to +11%: within the +15% budget) |
| Triangles | same views | views.mjs | 975k / 1,267k / 1,474k / 1,050k / 1,611k / 902k | 417k / 549k / 839k / 408k / 964k / 524k |
| First walk to the pub | worst frame | BENCHMARK | 2,835 ms (median 925) | 1,286 ms (median 580) |
| Loading | the scene's own build work | CPU profile of the loading | ~7.1 s (5 s of it material scans) | ~3.2 s; wall-clock loading on this box is noisy (21–33 s both builds) |
| Hosting | the host's window with a joiner: whole route; the host's World; the first walk's render call | BENCHMARK, MP=host (`base-host` → `after-host`) | median 2,349 ms, worst 7,231 ms; World 1.3 ms a tick; render call 667 ms | median 1,692 ms (−28%), worst 3,709 ms; World 1.2 ms a tick; render call 218 ms. The profile showed a friend's avatar shaders compiling mid-game (~3.6 s here): now compiled under the loading screen (not re-measured on MP yet) |
| Looks | 9 views by day and night: the façade, the balcony floor and from below, the entrance and flowers, Little Italy's gate and festoons, Chinatown's lanterns, the bar, the darts, street outlines | matched screenshots, both builds | | the same (only passing cars differ) |
| Small sphere detail | flowers, beads, fairy lights, festoons | the screenshots above | | no visible change |
| NPC levels | a far passer-by updates one step in three and still walks; next to the SECOND player it updates every step | shared unit (new) | | pass |
| NPC levels | pedestrians ease into walking (now measured over each one's own update time); traffic soaks with police (4 seeds), chases, parade | shared unit (existing) | failed with the levels on: seed 2 overlap 1.9 m | pass: the cause was a parade tow dropping a car on a police car (fixed); kerbside walkers stay at full rate |
| Interior areas | floors, the outside gap (no switching when pacing the edge), stairs, the light budget, the pub within it | client unit (new) | | pass (4 tests) |
| Leaving mid-pint | no glass, panels, buffs or body classes left | e2e (new check) | the glass and `pint-on` stayed; panels piled up | pass (110 ms run: the pint was up, nothing left behind) |
| Stress (SYNTHETIC) | every building stacked on itself (about twice the façades) + twice the passers-by (77 → 98 NPCs), same build | BENCHMARK with STRESS=city2,npcs2 | normal: median 612 ms | draw calls 0 to +7% outdoors (tiles absorb it), triangles +20–39%, outdoor medians +18–60%, indoors ~0; the World's CPU +22%; loading +9 s. The next limit for a denser city: detailed façade geometry in view, not draw calls |
| Everything | shared + client unit; typecheck; smokes | full suite | | pass: 300/300 shared, 22/22 client; typecheck clean; both smokes pass |
| | full browser e2e, normal / 110 ms | e2e | | normal: pass, 437/437 (before the leave-mid-pint check moved to the new city; it skipped itself in the classic city). 110 ms: pass, 438/438 (finished after the push to main, at Blake's request), the leave-mid-pint check included |

## Manual checklist for Blake (R12.5)

- [ ] Run the BENCHMARK on your PC (pause menu → BENCHMARK, about 3 minutes) and paste me the result; same for your mate.
- [ ] Does the city look the same to you? Look at the pub's flowers and fairy lights, Chinatown's lanterns, Little
      Italy's festoons, the balcony, and the black outlines on buildings.
- [ ] Walk from your fort to the pub: any hitch left?
- [ ] Settings: try Render scale at 70% and Adaptive resolution: does it help on your mate's PC?
- [ ] Read `docs/expansion-plan.md` and pick what to build first.

## R12.4: pub games, the approach freeze, sound, Split the G, night lighting, small windows (2026-11-07)

The regression tests below were run against the R12.3b code first (a worktree of cc18e62) and failed for the reason given.
Performance numbers are from the CPU-only test box (SwiftShader, about 1–2 fps), the same route and cameras on both builds.

| Area | Check | How | Before the fix | Result |
|---|---|---|---|---|
| Pool queue | a delayed window: an older shot still playing while a newer one settles; the newer one plays next, in order; at most 2 waiting, the rest reported missed | shared unit (StationFeed) + client unit | the newer shot vanished | pass |
| Darts handover | your third dart lands, the turn's gone over: you step back 0.7 s later without a new message | client unit | stuck at the oche till the next message | pass |
| Darts flights | a dart in the air at the other board doesn't block your throw | client unit | blocked | pass |
| Peer leave | leaving cancels the reconnect attempt and its retry timer; a late link is closed, not adopted | client unit (fake link) | reconnected a few seconds after leaving | pass (3 tests) |
| Stand-up | 0.3 s hold, 0.65 s rise, table in view, release swallowed, WASD hands back | clip (film mode, 30 fps), Blake's review | (new) | approved (v3) |
| Approach freeze | the first walk fort → pub, worst frame | perf script (compositing off) | 2,506 ms (4,477 with compositing on; the pub build) | 1,382 ms (median 1,090, was 1,106) |
| Pub draw | active meshes / draw calls per view, day and night, 8 views | perf script | downstairs bar 361 / 499 | 221 / 467; every view the same speed or a little faster |
| Load | solo click → playing | perf script | 21–23 s | 30–32 s (the pub build + warm-up views; on a real GPU about 1.5 s more) |
| First frame | the 4–7 s frame after loading | CPU profile; `--disable-gpu-compositing` | 4.4 s (old build too) | not the game: the main thread is idle and it goes away without GPU compositing (the test box drawing the HUD) |
| Split the G | smooth (always down, speed never jumps), 2–3.5 s to the G, the settle 2–3.5 mm, no jump on letting go, settled in 0.6 s, 1.5 mm perfect, 5 mm close, the perfect window 0.12–0.22 s, no surges in the pint event | shared unit | (rules changed) | pass |
| Split the G in the game | a perfect (let go 2.7 mm high: "dead on the bar", +$15) and an instinctive one (let go on the bar: 2.9 mm low, NEARLY) | clips | | as designed |
| Sound | pool, darts and Split the G effects in clips, rendered from the game's own sound log | clips with sound, Blake's review | | approved ("all of those look really good") |
| Night lighting | 8 views before/after, night (and day) | screenshots, Blake's review | flat; pavement pools hidden under the pavement | warmer inside with lamp contrast, spill at the door and bays; approved |
| Small windows | 800×600 and 960×540: street (controls open, then folded), pint, pool, darts | screenshots | the controls line over the slots and bars; the pint text over the slots; the pool rules over half the table | reviewed |
| Everything | 299 shared + 18 client unit; typecheck; matchmaking + server smoke | full suite | | pass: 299/299 and 18/18; typecheck clean; both smokes pass |
| | full browser e2e, normal | e2e | | pass, 437/437 (run straight after the push, at Blake's request; an earlier attempt was void: the test box's game server stopped mid-run) |
| | full browser e2e, 110 ms lag | e2e | | pass, 436/436 |

## Manual checklist for Blake (R12.4)

- [ ] Walk from the fort to the pub on your PC: any freeze left? How long does loading take now?
- [ ] Split the G: does the settle feel fair once you've learnt it? Is 1.5 mm too tight or about right?
- [ ] Pool, darts and the pint with sound on: anything too loud, too quiet or annoying after a while?
- [ ] Night in the pub and outside the door: warm enough? Anywhere too dark to play?
- [ ] A small window (or a laptop): does "H: controls" make sense? Anything still overlapping?

## R12.3b: pool playback, timers, stations, police traffic, pavement, the HUD (2026-11-07)

Every new test below was run against the code before the fix first (a worktree of R12.3) and failed for the reason given.

| Area | Check | How | Before the fix | Result |
|---|---|---|---|---|
| Pool playback | every shot a window is shown plays out (more than one frame mid-roll): two tables at once, games conceded and reopened, 150 s, at 60 fps / 50 ms, 12 fps / 110 ms, 30 fps / 300 ms with stalled spells, 5 fps / 200 ms, and 20 fps / 900 ms with a 6 s stall (a background tab) | client unit (real World host + real PubGamesView, pretend network) | 3, 2, 2 of 72 shots jumped to the end | pass: 0 skipped; in the background-tab case one missed shot is replayed quickly and one is reported ("Missed 1 shot") |
| Rounded clock | the clock heard a hair before `t0`; the clock wrapping round 600 s | shared unit (StationFeed) | (simulated: 24.6% of shots started at their last frame) | pass |
| Shot names | a new game's shot 0 after the last game's shot 0; a re-rack keeps counting | shared unit | the new shot 0 skipped; the re-racked break was shot 0 again | pass |
| Catch-up | in step, never ahead, never backwards; 2 s late, caught up in about 1.3 s; a missed shot plays in 30–50 frames | shared unit (replayStep) | (new) | pass |
| Settled positions | each replay ends where the host settled the balls | client unit | (new) | pass: within 0.2 mm |
| Your turn | you never step up while your window's still showing the last shot | client unit (10 fps, 300 ms) | (new) | pass |
| Countdowns | the HUD's shot clock tracks the host (within a second) with no other change; a dropped player's clock stops and the window shows it; "reconnecting: 4Xs" counts down | client unit | host 37 s, window still 40 | pass |
| Note size | 3 s of a running clock: the same note (it doesn't change every second) | shared unit | (new) | pass |
| Stations | mid-draw at table 2 while table 1 finishes and frees; at the oche while a pool game ends; a menu open at table 2 while oche 2 ends | client unit | table 1 finishing pulled the player off the cue | pass |
| Disconnects (Blake) | held 45 s, then a forfeit if the other's still here (pot paid once); a quick reconnect changes nothing; both gone = called off, both refunded once; waiting = called off; v an NPC = forfeit | shared unit | (rule change) | pass |
| Pockets | each hole's edge on the simulation's mouth; a ball in play isn't over a hole; a ball rolled into each of the six pockets is over its hole when it drops | shared unit | (new) | pass |
| Police in traffic | 4 patrol seeds × 4 min (new city): no car still more than 75 s, no cruiser more than 45 s, no mutual wait more than 3 s, no overlap, no cop car off the road, every car gets more than 150 m | shared unit | a car still 224 s (gridlock) | pass |
| Chases | 3 seeds × 4 min, two wanted bandits: real dispatches and drop-offs, the same checks, a cop car never sits more than 14 s where it stopped | shared unit | a car still 178 s; 1,900–5,800 overlap samples | pass |
| The reproduced jam | seed 1, 2 min (cop1 and c19 at junction 2) | shared unit | a car still 104 s | pass |
| Parade | a parade closing a street, cops about, 2 min | shared unit | a car still 120 s | pass |
| Merges | two cars from different ways committing to one exit lane at once | soak (car-to-car overlap) | 4 samples, 0.73 m | 0 |
| Old police tests | dispatch counts (16 s window: the car drives the lanes now); a bandit in the cop car's lane is rammed = busted; a cruiser that sees you turns its siren on | shared unit (updated) | (the tests teleported cars outside the lanes) | pass |
| Pavement overlaps | no two ground pieces overlap anywhere in the new city; no looks-only strips | shared unit | 222 overlapping pairs | pass |
| Pavement gaps | every point within 1 m of a kerb (roads, diagonals, the ring) has pavement | shared unit | 1,349 points | pass |
| Pavement walking | round the roundabout on the join, along a diagonal, across its cuts: feet at 0.15 m, no snag | shared unit | (passed before too: a guard) | pass |
| Pavement look | from above and at eye height, before and after: the diagonal, the ring's join, an off-grid kerb | screenshots | ink lines on joins, overlaps flickering | one smooth surface, kerb lines only |
| HUD | lobby (card shown), scavenge (card gone), pool aiming at 1280×720, 960×540, 800×600 (panel top-right, out of the shot; help then H), darts aiming | screenshots | the card stayed all game; the panel sat over the shot and the board | reviewed |
| Everything | 298 shared + 12 client unit; typecheck; matchmaking + server smoke | full suite | | pass: 298/298 and 12/12; typecheck clean; both smokes pass |
| | full browser e2e, normal | e2e | | pass, 437/437 |
| | full browser e2e, 110 ms lag | e2e | | pass, 437/437 (third run). The first was cut off by a container restart. The second failed one check, 435/436: the classic city's sunrise card showed the carried chicken not lost. In the night screenshot the player still has it, with a foot cop at the door (heat left from the 3-star section; the box drawing at 2 fps). It passed in the 7 other runs, so it looks like a timing flake in an area this round didn't change. |
| Speed | the same five views, the R12.3 build against this one, alternating, twice each | fps (scratch script) | | the same or a touch better: street 1.1 → 1.2, ring 1.4 → 1.4, a junction 2.7 → 2.8, pool 1.3 → 1.4, darts 1.8 → 1.9 fps. (This container draws at 1-3 fps, slower than R12.3's: the numbers only compare the two builds.) |

## Manual checklist for Blake (R12.3b)

- [ ] Pool: does every shot play out now, on your PC and your mates'? Try a shot, then switch tabs and come back mid-shot.
- [ ] The shot clock and "reconnecting" timers: do they count down smoothly?
- [ ] Play pool at one table while a mate finishes a game at the other: you shouldn't be pulled off your cue.
- [ ] Traffic with the police about (get 3 stars): does it keep moving? Do cop cars look right in the lanes, and pulling in to drop an officer off?
- [ ] Pavements round the roundabout and along the two diagonal roads: any flicker, step or gap left?
- [ ] The pool and darts panel: is it in the way anywhere? Is the H help useful?

## R12.3: pool and darts upstairs at THE SOGGY SHAMROCK, and one 8-minute scavenge (2026-11-06)

| Area | Check | How | Result |
|---|---|---|---|
| Cycle | intro → 5.5 min day → 30 s sunset (still scavenging, nothing lost) → 2 min night (raids, x2) → dawn; one clock; "30 s to sunrise" warning; no wipe at nightfall, fresh x2 loot appears; carried loot lost only at sunrise | unit (match) + e2e | pass (unit and e2e) |
| Board | every number in every bed (single inner/outer, treble, double), 20 top / 3 bottom / 6 right / 11 left; aim points land in their beds; WDF sizes; the oche 2.37 m from the face, the bull 1.73 m | unit | pass |
| Wires | on a ring wire = the ring nearer the bull (bull/25/T/single/D/miss boundaries); on a segment wire = clockwise | unit | pass |
| 301 | three-dart visits; busts below zero, leaving 1, zero without a double (Blake's 40 → 20, 20 example) restore the visit's start and end it; double out; bull finish; the outer bull isn't a double; a checkout ends the leg on that dart | unit | pass |
| Checkouts | 170 = T20 T20 BULL; 40 = D20; no route for 169 or 1; every route adds up and finishes on a double | unit | pass |
| Pool table | the rack (7/7/black in the middle, nothing touching); UK 7 ft sizes; a straight pot in a corner and a middle; a cushion shot never tunnels; rolling along a cushion past the middle pocket stays up | unit | pass |
| Physics | 300 hard random shots: always settle, never off the cloth (or hanging on a pocket's lip), never overlapping at rest; deterministic replay; a client replaying in frame-sized chunks gets the host's exact result | unit | pass |
| House rules | break (2 to a cushion or a pot, else a foul); black on the break = re-rack; first legal pot picks colours; both colours = open; black first on an open table = foul; wrong colour first, a miss, their ball, the white (in hand behind the line) = two visits; two visits play out (second visit / keep going / lost on a foul); the black early, with the white, with your last colour, on a foul = loss; legal black = win; two visits on the black | unit | pass |
| Hughie | legal shots (28+/40 hit his colour first), places the white legally, pots some not all; walks over round the table (never through it) and home again | unit + unit (world) | pass. First version potted 1 in 5 (0.8° error): lowered to 0.3°, aimed at the pocket's mouth. |
| Big Dinny | treble 20 to score, checkout routes to finish, 3-dart average 35–75 (measured 57), rarely off the board; walks to the booth | unit + unit (world) | pass |
| Stations | bets taken once at the join, one payout, refunds once; one game at a time; spectators, out of turn, duplicates, bad values refused; join race: first wins; NPC $20 cap and $40 kitty, refilled each cycle | unit | pass |
| Four at once | Hughie at one table, two mates at the other, Dinny at one oche, two mates at the other, 90 s: all move on, nothing crosses over, the money adds up | unit (world) | pass |
| Interruptions | last orders 90 s from the end; sunrise calls off and refunds; the match starting calls off before the cash resets; a dropped seat (and its clock) held 45 s then called off; walking off (downstairs / 30 m) = forfeit, fetching a pint = fine; arrest = forfeit; AFK: two timed-out shots, or a whole visit thrown by the clock = forfeit | unit + unit (world) | pass. Two bugs caught: a dropped player could lose on the clock inside the 45 s hold (the clock now waits); stakes refunded after the match reset cash (now before). |
| Layout | full-cue room round both tables at elbow height (every 5°); 2.9 m+ between them; tables not shrunk; the throwing lanes clear; everything still reachable | unit (layout) | pass |
| Browser (solo) | the table's prompt, the menu (E), a game v Hughie; shots through the player's own controls; balls roll and sit on the cloth; the camera crouched behind the white; concede, the table frees; darts v Dinny: the ring sways gently, a dart aimed at the treble 20 scores T20 = 60; E steps back to normal controls | e2e (R12.3 solo) | pass. A quick E then 1 was missed at a low frame rate (the menu only took the keys a frame later): fixed. Under lag, HUGHIE's run outlasted the test's 40 polls: the test now plays on a time budget. |
| Browser (online) | two games at once (Hughie, Dinny) seen in both windows; one game at a time; a spectator's dart refused; a $10 stakes game: taken once; out of turn refused; a reload mid-game: the whole game comes back and the seat was held; the match starting calls it off | e2e (R12.3 online) | pass, 18/18. Two game bugs caught: refusal messages reached the player empty, and server-hosted rooms never synced the tables' state. Both fixed. |
| | full browser e2e, normal | e2e | pass, 436/436 |
| | full browser e2e, 110 ms lag | e2e | pass, 437/437 (the crouched-camera check also ran) |
| Speed | the same views, the pre-R12.3 build v this one, side by side | fps (scratch script) | same within noise (pool 24–29 v 23–28, darts 10–13 v 11–12, room 7 v 8–10). Both builds slow down the longer a headless page runs (the test box, not the game). |
| Looks | the approach, the pool room, both booths, the pockets, a tight shooting spot, the aim view, a game with the opponent, the oche view, the board after a dart, spectating Dinny, the scoreboard, both at night | screenshots (eye height) | reviewed (see below) |
| Everything | 285 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass. The server smoke's "sees Alice crouching" failed once on the busy box, then passed. |

## Manual checklist for Blake (R12.3)

- [ ] Pool: does the crouch-and-pull-back feel good? Is the power range right (a soft safety to a big break)?
- [ ] Pool: is Hughie a fair game (he pots about 3 in 5 of what he goes for)?
- [ ] Darts: is the sway readable? Is Shift-to-steady useful? Too easy, too hard? (Treble beds are 8 mm, like the real thing.)
- [ ] Darts: does 301 fit in a minute or two with your mates?
- [ ] The 8-minute scavenge: does the sunset feel right? Is 2 minutes of night enough?
- [ ] The room from the stairs: does it feel like a pub that's been here for decades?
- [ ] Anything clipping, floating, or in the way when you shoot or throw?

## R12.2c: THE SOGGY SHAMROCK fixes (the front door, clipping, the booths), a hard Split the G, Big Dessie, Seamus O'Shortly and the swarm (2026-10-28)

| Area | Check | How | Result |
|---|---|---|---|
| Front door | the red line and the black bar through the doorway are gone; the name over the door reads clear; the A-board is the right way up; the clock's on the east front | screenshots (first person from the pavement) | pass. The cause: pieces turned 90° the wrong way. |
| Clipping | every pair of pub collision boxes that overlap in 3D | script (scratch) | only wall corners, and the old booth tables (rebuilt). Visual: the upstairs back bar's crown, the canopy crown, and the pendants through the glass rack were fixed. |
| Booths | you can walk into each round booth, up to its table and round it | unit (layout) | pass. Took three goes: first the ring faced the wall, then the aisle was too thin for a player (0.38 m radius); now a 2.1 m booth with a 0.35 m table. |
| Seamus | Mammy's gone; Seamus, his six lads round the snug, Big Dessie in front of the band; nobody posted inside anything solid; you can reach Big Dessie and Seamus | unit (layout) | pass |
| Hard G | the line always goes down; the hold that lands on the G is perfect; 1.5 mm past is perfect, 4 mm close, 8 mm a miss; the perfect window is 50–400 ms; two rhythms at the same rate need different holds; a pint carries its own surges; the chalkboard and close grades still work | unit (world) | pass |
| Jobs | a job, "still waiting", paid in gold (double); a big job (lucky things) for the big pot (×4, $80 at least) seen inside 40 tries; tips at 3+ aura | unit (world) | pass |
| Swarm | punch a drinker downstairs: the swarm's on, the lads pop out round you on your floor (4+ pops), all six chase you; 6 s standing still: 4+ nips, hp down but never below 20, no knockdown; over at 8 s; 4 s later they're back in the snug; hitting Seamus sets them off and he stays up | unit (world) | pass first time |
| People | 62 NPCs | server smoke | pass |
| Browser | drinking: no G showing; after the verdict the glass turns and shows the G; Seamus, his 6 lads, Big Dessie, no Mammy; Seamus's prompt and his answer; walked into a round booth up to its table; facing Big Dessie, a punch: the swarm's on, the lads round you downstairs, the swarm ends | e2e (pub part of the new-city block) | pass 39/39 |
| | full browser e2e, normal | e2e | pass 396/396 |
| | full browser e2e, 110 ms lag | e2e | pass 396/396. The first lag run was cut off at 234 checks (no failures so far) when the test machine restarted; the second ran clean. |
| Looks | the front door (far, mid, near, the A-board, the clock), the hard G (drinking, the reveal), Seamus in his chair with a lad, Big Dessie mid-move, the swarm | screenshots | reviewed |
| Everything | 254 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R12.2c)

- [ ] The front door from the street: clean now? Anything else clipping that you can see?
- [ ] Split the G: hard enough? Too hard? (2 mm perfect, and the gulp surges.)
- [ ] Big Dessie: unpredictable enough? Funny?
- [ ] Walk into a round booth: enough room?
- [ ] Punch someone in the pub: does the swarm feel like a swarm? Too much damage, or too little?

## R12.2b: THE SOGGY SHAMROCK upstairs reworked (the céilí's gone; the island bar, the darts, the pool, the lounge, the jukebox) (2026-10-26)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | from the top of the stairs you can walk to every side of the island bar and in through its flap, both oches and podiums, all round both pool tables, to the chesterfields, the round booths, every high table, the fire and its wing chairs, the jukebox, up to Mammy and out on the balcony; no walking off the balcony; nobody posted inside anything solid; Róisín, 4 drinkers upstairs, 2 darts booths, 2 pool tables, 3 taps on the island bar, 1 jukebox; the céilí's stage is gone. Downstairs counts unchanged (8 drinkers, 3 taps on floor 1) | unit (layout) | pass. It first failed three times: the drinker leaning on the bar's east side stood in a stool (the stool's gone), and two reach points were too close to a high table and a wing chair (moved out). |
| Upstairs bar | up the stairs; a pint at the island bar; Róisín's behind it and says the pour line; split the G up there; B upstairs is just the ordinary dance; no céilí NPCs | unit (world) | pass |
| Jukebox | E: the next tune; its prop note says which; not again within 3 s; round the three and back | unit (world) | pass |
| People | the pub's people stay put (12 drinkers, Fergal, Róisín, the regulars, the band) | unit (world) | pass |
| | 55 NPCs | server smoke | pass |
| Police (R7) | a wanted bandit right in front of a patrolling cop gets chased (the stand-in point moved after the new NPCs shifted the seed) | unit (world) | pass |
| Browser | up the stairs, level 2; Róisín, Mammy, 12 drinkers, no céilí folk; the island bar's tap prompt; a pint upstairs and the verdict; the jukebox's prompt; E changes the tune; the jukebox loud upstairs (0.67) and the jig through the floor (0.30); standing on both oches; beside both pool tables; Mammy's prompt and her answer; the balcony; no céilí prompt | e2e (pub part of the new-city block) | first run 30/32: the upstairs pint said "finish the one you've got first" (one pint per 30 s, and the downstairs one had just been poured). The test now tries again until the pour's done. Then 32/32. |
| | full browser e2e, normal | e2e | pass 389/389 (with the preinstalled Chromium) |
| | full browser e2e, 110 ms lag | e2e | pass 389/389 |
| Looks | the island bar and canopy (day, night), the darts booths (against Blake's photo), the pool area, the lounge, the fire, the jukebox, Róisín close up (no chest squares), Mammy's snug, the balcony at night | screenshots | reviewed. Fixed: the screens over the boards drew black (the picture was flush with its frame), and the jukebox's tubes were candy colours (now orange, gold and green, thinner). |
| Everything | 253 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R12.2b)

- [ ] Stand by the island bar. Is it "sick" enough? Too many bulbs, or too few?
- [ ] The darts booths next to your Flight Club photo: close enough? Big enough?
- [ ] The pool area: room to play round both tables?
- [ ] Sit-down spots: the chesterfields, round booths, high tables, fire. Enough? Too much?
- [ ] The jukebox: do the three tunes fit the vibe? Want more tunes?

## R12.2: THE SOGGY SHAMROCK upstairs (the function room, the céilí, MAMMY MOLONEY, the corner balcony; no chest squares) (2026-10-24)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | floor 2: from the top of the stairs you can walk (at the floor's height) to the céilí floor, the stage, every table, Mammy, the pool table, the oche and out the French doors onto the balcony all the way round the corner; you can't walk off the balcony's edge; nobody posted inside anything solid; 4 band, 6 dancers, Mammy | unit (layout) | pass. The balcony's east strip was first blocked by a third table (removed). |
| The céilí | the reel goes round the 10-minute city clock exactly (9 times); a dance is 32 bars of 5-6 steps, lanes 0-3, in time order; ±70 ms perfect, ±140 ms good. Up the stairs; B on the floor joins; a perfect dance pays $25 and +1 aura; 3 aura a day at most; five misses in a row trips you; walking off quits; off the floor, B is the ordinary dance | unit (world) | pass |
| Mammy | a job (bring her the thing), "still waiting", then paid double; a tip once you've 3+ aura; hit someone in her pub and you're out the front door | unit (world) | pass. It first failed: the job checked your hands, but pocketed things are "active" items (it uses the active item now). |
| People | 60 NPCs in the city (the 11 upstairs added) | server smoke | pass (the crouch check was flaky once and passed on 2 reruns) |
| Browser | up the stairs (y 4.8); level 2; the céilí prompt; the reel loud upstairs (0.85) and the jig through the floor (0.30); the 4 + 6 + Mammy; B joins; steps judged on the beat; real arrow keys are steps, not walking; B stops; a trip; Mammy's prompt and her answer; standing on the balcony | e2e (new-city block) | The first run failed 3. **The prompt:** it didn't refresh upstairs (its signature didn't include the céilí). **The steps:** the World tripped me before my steps arrived (fixed below). **The trip check:** fixed once the steps were. After the fixes, the new-city block passed 28/28 (pub part only) and then 80/80. |
| | full browser e2e, normal | e2e | 384/385. The one miss was "miss five in a row: over you go". R3 is solo, so the World runs in that window, and on this CPU-only box it ran at about 2 fps with the sim up to 10x behind real time. A trip needs about 7 s of sim time and the check gave it 30 s of real time. The check now waits up to 150 s. The new-city block then passed 80/80 at normal speed. |
| | full browser e2e, 110 ms lag | e2e | pass 385/385 |
| Timing fixes | the client's city clock runs every frame and is nudged toward the server's (it lost a frame every server tick, then snapped); each step is stamped at the real key press, not the last frame; the World waits 1.5 s (was 0.6) before calling a step missed | e2e above | pass |
| Looks | the function room by day and night, the dancers close up (no chest squares; each in her own colour), the céilí screen, Mammy's snug, the games room, the balcony from the street at night | screenshots | pass (reviewed). Fixed on the way: every dancer was blue and the band and Mammy stood, because the upstairs posts weren't passed to the renderer. The céilí screen was too big for the window, and its help text doubled the prompt. |
| Everything | 253 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R12.2)

- [ ] Characters: any chest squares left anywhere? (They should all be gone.)
- [ ] Join the céilí (B on the floor upstairs). Is it tough-but-fair? Does it feel in time with the music on your PC?
- [ ] The reel upstairs and the jig downstairs: does each sound right through the floor?
- [ ] Mammy Moloney: are the jobs fun? Are her tips useful? Try starting trouble and see what happens.
- [ ] The balcony at night: enough? Too much?
- [ ] The pool table and dartboard are just set dressing until R12.3/R12.4. Do they look right for what's coming?

## R12.1b: THE SOGGY SHAMROCK rebuilt (the whole block, the horseshoe, the Temple-Bar-style front, the drinkers) (2026-10-22)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | the six shops are gone; about 29 x 26 m; no loot or street junk inside. From both doors (the corner and the side street) you can walk to every tap, all round the horseshoe, into all four snugs, to the fire, the stage and the foot of the stairs; the stairs are roped off; you can get inside the horseshoe through the flap. Every front is solid except its doors; the back wall is solid. 5 partitions for 4 snugs (one between each pair). Fergal inside the horseshoe; 2 regulars sitting; the band of 4 on the stage; 8 drinkers, 2 of them out on the pavement; 3 taps, 1 chalkboard; nobody posted inside anything solid; the parasol tables keep clear of the kerb | unit (layout) | pass. It first failed three times: the staff flap was too narrow to walk through (1.2 -> 1.5 m), a snug drinker was in the partition (moved), and the snug tables out in the middle sealed off walkable cells behind them (now against the wall) |
| Pints, tipsy | the R12.1 tests, at the horseshoe's taps (they face the customers now) | unit (world) | pass |
| People | the 15 pub people stay put | unit (world) + server smoke (49 NPCs) | pass |
| Pavement | the parasol barrels don't become smashable tables and get no café chairs (both exclusions widened to 3 m round the pub) | screenshots | pass (reviewed). There was a chair under a drinker before. |
| Browser | in the corner door; outside the side door, then in through it; a pint at the horseshoe's tap, the close-up, the line drops, the verdict, one pint in you; the session's gain inside (0.48) and the audio running; Fergal, the regulars, the band | e2e (new-city block) | pass 67/67 at normal speed (before a small gain change) and with 110 ms lag (after it, and again after the side-door wait) |
| | full browser e2e, normal | e2e | pass 372/372 |
| | full browser e2e, 110 ms lag | e2e | 371/372. The new "outside the side door" check read the pub level 0.6 s after the teleport, and with lag the teleport hadn't landed yet. It waits for it now (up to 15 s). The new-city block then passed 67/67 with lag; the full run wasn't repeated. |
| Looks | outside by day and night (the red shopfronts, pilasters, small panes, fascia, cornice, flowers and ivy, bays, sash windows, baskets, the canopy, the clock, lanterns, fairy lights, parasols, chimneys); the horseshoe and gantry (signs, arches, backlit bottles, the glass rack, the taps); the snugs' leaded glass and tufted leather; the fire, the stage, the walls of stuff, the stairs; the pint close-up | screenshots | pass (reviewed). Fixed on the way: a bottle index went negative and crashed the build; the leaded glass and mosaic showed black (their textures were clamped, not tiled); the wood and floor were too light; the leather was too red; the tap towers were a big gold T; the globes were muddy. |
| Everything | 249 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R12.1b)

- [ ] Stand at the crossroads by day and at night. Temple Bar enough? Anything still blocky?
- [ ] Walk round the horseshoe: is it big enough? Is the gantry right?
- [ ] Sit in a snug: are one partition each and the tufted leather right?
- [ ] Is there enough clutter? Too much anywhere?
- [ ] The drinkers: right number? Do they get in the way?

## R12.1: THE SOGGY SHAMROCK (the Irish pub): the ground floor, split the G, the session (2026-10-21)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | the three shops are gone and the alley behind is still a walk; about 12 x 27 m; no loot spots or street junk inside; in from the crossroads, you can walk to both taps, the three snugs, the fire, the foot of the stairs and the lane behind the bar; the stairs are roped off; the street and alley walls are solid apart from the door in the cut; Fergal in the lane, 2 regulars sitting, the band's four (v 0-3); 2 taps, 1 chalkboard; nothing solid under anyone sitting | unit (layout) | pass. It first failed twice: the snug tables crowded their benches, and the stairs-foot check point was too close to the rope (test point moved). |
| Split the G | the line drops faster the longer you hold; the perfect hold for each gulp rate is 1.5-4 s; perfect / close / miss bands (4 / 12 mm) | unit (world) | pass |
| Pints | broke: no pint; $6; one at a time ("busy"); a perfect split pays $15; close gives your $6 back; no pint, no gulp; the chalkboard keeps the 5 best, closest first, and syncs through the board's prop note; a pint left 30 s goes flat | unit (world) | pass |
| Tipsy | 45 s a pint, 3 min at most; no drift at 2 pints, a drift from the 3rd; walking "straight" at 6 pints wanders off line, the same both times; cut off after 6; sober again, pints back to 0, served again | unit (world) | pass. It first failed: the sober-up check stood still with no input (no movement steps); it walks now. |
| Sync | the sober-up timer (0.1 s) and the pint count ride in the packed buffs, still a safe integer | unit | pass |
| People | Fergal, the 2 regulars and the band stay put in the pub | unit (world) + server smoke (41 NPCs) | pass. The server smoke's NPC count went 34 -> 41. Its "Bob sees Alice crouching" check failed in the first 2 runs and passed in the next 3 (timing; nothing changed there). |
| Browser | the pub's in the new city; walk in the front door; the tap's prompt; E: a pint, the close-up's up with its own gulp rate; hold: the line drops; let go: the verdict; one pint in you; the session's gain in there (and the audio really running); Fergal, 2 regulars, the band of 4 | e2e (new-city block), normal and 110 ms lag | pass 65/65 both |
| | full browser e2e, normal | e2e | **not a clean pass.** 5 runs; every check before the 4th window passed in the last one (288/289), but in all of the last 3 runs the 4th window (D) didn't finish loading within 25 min, so the run stopped there. The earlier runs also had one-off timing failures in old solo checks (pocket keys, the coins prompt, the yard bank, the punch target), each passing in other runs. |
| | full browser e2e, 110 ms lag | e2e | **not a clean pass.** 288/289: everything up to the 4th window passed, then D didn't load within 25 min. |
| Join speed | why the 4th window: one joiner alone took 13.5 min to load today (6.5-9 min was measured before). R11.5 against R12.1, solo on the same box: the city's build is about 4% longer (36-37 s vs 37-40 s), the same fps. The pub's details (about 1.5-3 s here) are only built once you're within 100 m. The joiners now drop to Performance mode once they're in. | measured | the 4th window is still too slow on this box |
| Looks | outside by day and night (the shopfront, the gold leaf, the window boxes, the hanging sign, the lanterns, the A-board); the bar (panelling, damask, tin ceiling, beams, pendants, the back bar's bottles and mirror, the taps, the stools, the chalkboard); the snugs' stained glass; the fire; the session corner and the band playing; the stairs, spindles and rope; the pint close-up | screenshots | pass (reviewed). Fixed on the way: the mirror was too bright, the picture over the fire faced the wall, the G on the glass was drawn wrong, the close-up was too big, the fiddle and whistle poses, and the inside was too dark at night (it's brighter now). |
| Everything | 249 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R12.1)

- [ ] Walk in from the crossroads. Does it feel like an old Dublin pub? Too dark, too bright?
- [ ] Split the G: is the hold too easy or too hard? Is the window for a perfect one fair?
- [ ] The jig: does it sound like a session? Too loud in the pub, or too quiet from the street?
- [ ] Have 3+ pints: is the sway fun or annoying?
- [ ] Fergal, Old Mossy, Noreen and THE RUSTY BIN LIDS: right look? Funny lines?

## R11.5: NEON FEVER DREAM's textures, timber slats, smooth booths, smaller restroom wing (2026-10-19)

| Area | Check | How | Result |
|---|---|---|---|
| Textures | every club and alley box gets a skin (14 canvas patterns, world-space UVs, merged per material); no plain walls or floors on floor 1, floor 2, the roof, the restrooms, under the stairs or the alley (its ground is asphalt now) | screenshots (night) | pass (reviewed) |
| Slats | 8+ slat walls in the world (`deco: "slats"`); the stairs' open side is slatted floor to ceiling; the way under the stairs to the EXIT is still open; every walkable cell still joins up | unit (layout) | pass. It first failed: the north-east booth screen sealed off a cell behind it (moved hard against the booth). The R11.2 stair-approach test now skips the slats, which stand beside the stairs, not in them. |
| Booths | the seat and back boxes are hidden; the backs are shorter than R11.4's; smooth curved sofas drawn instead, with no boxes poking out | unit (layout) + screenshots | pass |
| Wing | 2 restrooms (no spare room); the west wall facing the island bar is solid; the wing's door is at the north end; the wing is under 10 m long; walk in from the north door to MEN and WOMEN; 4 club doors | unit (layout, world) + e2e (the wing's door from the north) | pass |
| Browser | full browser e2e, normal | e2e | pass 360/360 |
| | full browser e2e, 110 ms lag | e2e | 359/360. The one fail is the old "facing a tourist = punch target" check. It timed out at 10 s, but the next check saw the "Bonk Tourist" prompt and the punch landed: the machine was slow, the club isn't involved. An earlier lag run died when the workspace restarted, and one before that timed out loading the third player (15 min). Neither failed a check. |
| Everything | 243 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass. The first matchmaking smoke run failed while the server was still starting up; the rerun passed. |

## Manual checklist for Blake (R11.5)

- [ ] Walk the whole club and roof. Any plain wall or floor left?
- [ ] The slats: right amount? Too busy anywhere?
- [ ] The booths: are the boxes gone, and do the sofas look right?
- [ ] The restroom wing: is the door on the north side where you wanted it, and is it the right size now?

## R11.4: NEON FEVER DREAM's flicker fix, restroom wing, back EXIT, SKETCHY STEVE (2026-10-18)

| Area | Check | How | Result |
|---|---|---|---|
| Flicker | the starry ceilings on both floors, looked up at from 5 spots; floor 2's tiles, walls and LED from far off; the roof's deck, LED and glass from both ends | screenshots (night) | pass (reviewed). No plain patches in any view. Cause: the ink-outline shells sat where the textures were. Those boxes have no outline now, and the textures have 6-10 cm of clearance. The roof's plain deck and the gap east of its glass are decking and LED now. |
| Layout | the east wall's solid all the way along (no fire exit); the north wall's only opening is the EXIT, and it opens into the alley; five club doors (wing, MEN, WOMEN, spare, exit), the exit one-way; the wing walled in on the floor's side except its door; the wing is at least 7 x 14 m with a spare room; STEVE and his three goods in the alley; under the stairs is clear to the EXIT up to 2.3 m; every walkable cell joins up (with the doors open) | unit (layout) | pass. It first failed: the room doorways were too narrow for the walk grid (widened 1.2 m to 1.4 m). |
| Doors | the wing's door, then each room's door: shut, it stops you; E opens it; walk into MEN, WOMEN and the spare room | unit (world) + e2e (the wing's door) | pass |
| EXIT | from the floor, under the floating treads to the door; shut, it stops you; E pushes it open; out into the alley; it swings shut by itself after 3 s; from the alley, no handle (doorLocked); B opens it from inside and A, outside, can't slip back in (bounced "exit") | unit (world) + e2e (push it, out, then EXIT ONLY outside) | pass |
| STEVE | broke: no deal; ZOOMIES: $15, 20 s, walks over 1.3x faster, then a comedown (slower than normal); FLOATY FIZZ: 3 jumps off thin air, floating over 3 m up; BEEF JUICE: 20 s, and a heavy load sprints over 1.6x as far; a cop turns up: Steve legs it up the alley, no deals ("away"), and he's back when it's quiet | unit (world, movement) + e2e (buy ZOOMIES and FLOATY, the buffs kick in, the HUD shows them) | pass. It first failed: a teleport rebuilt the move state and wiped the buffs (fixed: they're kept). |
| Sync | the four buff timers and the jump count, packed into one synced number and back, to 0.02 s, never overflowing | unit + server smoke | pass. The server first failed to start: its player schema hit Colyseus's 63-field limit with five new fields. Hence the packing. |
| Looks | the wing from the floor (velvet, the door, no tile in sight); the hallway; MEN and WOMEN (stalls, toilets, sinks, mirror, frosted window); under the stairs (stringers, the green EXIT and sign); the alley both ways (fire escapes, dumpsters, bags, cones, puddles, graffiti, lamps, the blue far light); STEVE and his briefcase; the roof's decking | screenshots | pass (reviewed). The heater and fire-pit billboard glows were already gone (R11.3). |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 55/55 both |
| | full browser e2e, normal | e2e | pass 360/360 |
| | full browser e2e, 110 ms lag | e2e | pass 360/360 |
| Everything | 242 shared + 3 client unit; matchmaking + server smoke (34 NPCs: + STEVE); typecheck | full suite | pass |

## Manual checklist for Blake (R11.4)

- [ ] Look up at the ceilings and across the roof while walking. Any flicker left?
- [ ] Open the POWDER ROOMS door, then MEN / WOMEN / the spare room.
- [ ] Out the green EXIT under the stairs, then try to get back in that way.
- [ ] Buy each of Steve's goods. Fun? Too strong? Is the comedown annoying or good?
- [ ] Lure a cop into the alley and watch Steve leg it.

## R11.3: NEON FEVER DREAM's bigger bar, second bay, the Don by the windows, the social roof (2026-10-14)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | the corner bar's gone (no shelves); the island bar is about 9 m across and moved back; the dance floor is centred with nothing on it; both bays' openings are clear above floor 2 (no upstand); the lounge is by the south windows, more than 15 m from the stairs, bigger than R11.1's; on the roof, LIL PANDA is centred on the back edge, the glass dance floor is clear, there are 2 pole speakers, the fire pit and heaters, 4+ plants and 3+ booths | unit (layout) | pass. It first failed: a floor-2 booth sat in the west bay's mouth (moved). |
| Real route | walk off the floor-2 landing into both bays; walk from floor 2 to the second stairs and up onto the roof; walk across the roof to the SKY BAR, the smokers' corner and LIL PANDA's step | unit (world) | pass. It first failed: the lounge's shove-out also fired on the roof above it (now floor 2 only). |
| Kept | the R11.2 circulation tests (stair approach and landing clear, restrooms away from the stairs, walk-ins, fire exit); DON BINNIE at 7 vs 8 aura, entered from the new gap; punch him and you're thrown out | unit + e2e | pass (the lounge tests now walk in against the shove and stand in front of him) |
| Browser | the east bay: walk straight in off floor 2 | e2e | pass |
| | new-city block on its own | e2e, normal and 110 ms lag | pass 44/44 both |
| | full browser e2e, normal | e2e | NOT passed: 347/349. It ran to the end; the friends-join step passed this time. Failed: "THE DROP builds: the crusher bed carries you up" and "the slam: the floor drops and launches you", both Big Crunch checks in the classic city that wait on the game clock. No club code runs there. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 348/349. It ran to the end. Failed: "facing a tourist with empty hands = punch target" (classic city, the first window). |
| Bugs | the textures only showing up close; the "carpet" cutting off the view on the stairs | screenshots across floors 1 and 2 at distance; on both stairs | fixed (reviewed). Causes: the ink-outline shells won the depth test at shallow angles, and the starry ceilings ran across both stairwells. |
| Looks | the island bar and back-bar; the central dance floor; the north-east nook; both stairs (the clear climb, the second balustrade); arriving at TRASH PANDA's corner; the lounge (curtains, drapes, carpet, dancers) from close and from across the floor; both bays; the roof (LIL PANDA, pole speakers, the SKY BAR's pergola, string lights, umbrellas, the smokers' corner) | screenshots (night) | pass (reviewed). The billboard glows on the heaters and fire pit, and a haze, showed as hard rectangles, so they were replaced by warm pools of light on the deck. |
| Everything | 236 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R11.3)

- [ ] Floor 1: is the island bar the right size now, and does the dance floor feel central?
- [ ] Walk into both bays on floor 2.
- [ ] Come up the stairs: TRASH PANDA ahead, DON BINNIE across the room by the windows. Better?
- [ ] Climb to the roof: is the glass rail there, and does the roof feel social?
- [ ] Do the textures look right from across the room on your computer now?

## R11.2: NEON FEVER DREAM's circulation and dressing (2026-10-14)

| Area | Check | How | Result |
|---|---|---|---|
| Circulation | nothing solid in the stair approach (floor 1), on the floor-2 landing, or on the fire-exit route; every restroom room more than 8 m from the stairs and their approach | unit (layout) | pass |
| Real route | walk (no teleports) from the front door past the host stand and the booth pocket to the stair foot, up, and onto the floor-2 landing; walk from the dance floor down the corridor into MEN and WOMEN; walk out the fire exit | unit (world) | pass. It found the R11.1 bug: the store cupboard sat on the stair foot (the old e2e only got up by teleporting). Fixed by the redesign. |
| Kept | the door, the cover, the stairs to floor 2 and the roof, the atrium, the mocktail, dancing, DON BINNIE's lounge (7 aura shoved, 8 walks in) | unit + new-city e2e | pass |
| Looks | the stair foot (inlay, downlight, UP sign, art, handrail); the coat check and host stand; the booth tier's brass rails and smoked glass; the POWDER ROOMS corridor; the floor-2 WELCOME landing; the DJ spotlight, stacks and NO PHOTOS board | screenshots (night) | pass (reviewed). A palm by the corridor mouth crowds one camera view; it's not on a route. |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 43/43 both |
| | full browser e2e, normal | e2e | NOT passed: 232/235. It crashed at the same old-city friends-join step as R11.1. Also failed: "5A.1: mouse wheel selects pocket 1" and "5A.1: key 3 selects pocket 3", two 5-second classic-city hotbar timing checks (the HUD highlight check between them passed). No club code runs there. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 233/235. It crashed at the same friends-join step. Also failed: "5A.1: mouse wheel selects pocket 1". |
| Everything | 234 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R11.2)

- [ ] Walk in the front door and straight to the stairs. Does the route read at a glance?
- [ ] Find the powder rooms (the corridor off the little dance floor). Do they feel separate from the stairs?
- [ ] Sit in a booth pocket. Is it dark and cosy enough, or too dark?
- [ ] Frame rate inside on your computer, now that there's more clutter?

## R11.1: NEON FEVER DREAM's floor plan, DON BINNIE's lounge (2026-10-13)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | nothing to pick up in the club (no loot, no junk); the MEN and WOMEN restrooms; the octagonal atrium (four corner fills); every walkable cell still joins up | unit (layout) | pass. It first failed: the stall gap was too narrow and the corner behind the restrooms sealed. Fixed (wider gap, a store cupboard). |
| Lounge | DON BINNIE and his two bodyguards are there; under 8 aura you're shoved back out, 8+ walks in; punch him and both come, one hit and you're out cold outside with your stamp gone | unit (world) + e2e (7 vs 8 aura) | pass |
| Door | walk in after paying the cover | e2e | pass. It failed once: a palm sat in the doorway's path (moved). The walk-in checks now wait on the game clock, not the wall clock. |
| Looks | the island bar and bottle tower, THE FEVER BAR, the red booths and carpet, the restrooms, the octagon's rails, the lounge, the Don, the glam dancers | screenshots | pass (reviewed) |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 43/43 both |
| | full browser e2e, normal | e2e | NOT passed: 233/235. It crashed at the multi-window friends-join step (the old R4.1-R9 crash point; it had passed in R10 and R11). Also failed: "after 3 s: a bundle of cash" (the classic city's till: a timing check). Both are classic-city windows, where none of the club code runs. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 234/235. It crashed at the same friends-join step; everything before it passed. |
| Everything | 232 shared + 3 client unit; matchmaking + server smoke (33 NPCs: + the Don and his boys); typecheck | full suite | pass |

## Manual checklist for Blake (R11.1)

- [ ] Walk floor 1: the island bar, THE FEVER BAR, the booths, the little dance floor, the restrooms.
- [ ] Floor 2: get to 8 aura (dance!) and walk into DON BINNIE's lounge. Punch him if you dare.
- [ ] Frame rate inside on your computer?

## R11: NEON FEVER DREAM (2026-10-11)

| Area | Check | How | Result |
|---|---|---|---|
| Layout | the club takes the Market Row block (the six shops gone, their west twins kept); its loot moved up the alley, never inside a building; the other R3 rules (no buildings on the pavement) still hold | unit (layout) | pass |
| Door | walk at the front door unpaid: turned back; pay $20 at the rope: walk in | unit (world) + e2e | pass |
| Floors | stairs reach floor 2 (y 6.30) and the roof (y 13.50); the atrium's railing stops you; the catwalk crosses it; the roof's glass floor holds you | unit (world) + e2e | pass |
| Dancing | B dances, moving stops it; +1 aura per 15 s in the club, 3 a day at most | unit (world) + e2e (B, the prompt) | pass |
| Bar | the mocktail: $8, 40 s of dance energy | unit (world) + e2e | pass. The e2e first failed: the client never picked up the boost while standing still. Fixed (it always takes the server's state now). |
| Nothing breaks | the only props in or by the club are the rope and the bar | unit | pass |
| Loading | the game loads with the club in (the LED floor's texture is drawn once at build) | e2e | pass. Before the fix the game hung on the loading screen. |
| Looks | outside by day and night (the cut corner, the bay, uplights, signs, the lamp, the queue, the bouncer); floor 1 looking up the atrium; floor 2 (LED floor, rig, lasers, DJ TRASH PANDA, the equaliser wall); the roof (glass floor, the pavilion, LIL PANDA); straight down through the glass; the sky beams from across town | screenshots | pass (reviewed) |
| Frame rate | the club's cost on the CPU-only test box | camera swapped street/club back to back | About 10% inside, against the trend. NOTE: on this box the frame rate falls steadily with time (38 to 12 in 90 s) wherever the camera is, with the R8 build too. The page's main thread is ~95% idle at 11 fps, so it's the software GPU. Not chased this slice. |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 41/41 both |
| | full browser e2e, normal | e2e | **pass 346/346** |
| | full browser e2e, 110 ms lag | e2e | **pass 346/346** |
| Everything | 229 shared + 3 client unit; matchmaking + server smoke (the bouncer counted: 30 NPCs); typecheck | full suite | pass |

## Manual checklist for Blake (R11)

- [ ] Walk up to the club at night from Market Row: the corner, the queue, the music getting louder.
- [ ] Pay the cover, get a mocktail, dance (B) on floor 1, then up the stairs to floor 2 and the roof. Wait for a drop.
- [ ] Stand on the roof's glass floor and look down. Stand in floor 2's bay over the street.
- [ ] Does it run smoothly inside on your computer? (Tell me your fps in there.)
- [ ] The music: too loud or quiet? Should it be audible further away?

## R10: police from the start, a less bland station, signs on the walls (2026-10-11)

| Area | Check | How | Result |
|---|---|---|---|
| Police | in the lobby (before the match starts): the station's 4, 8+ foot patrols, both cruisers | unit (world) | pass |
| | browser: cops and both cruisers are out before the match starts | e2e (new-city block) | pass |
| | server: cops are out in the lobby (counted apart from the other NPCs) | server smoke | pass (9 cops) |
| Station | nothing in or on it can be smashed: only the door, the toilet and the cell door are props | unit (layout) | pass |
| Visuals | the chief's doorway is clear; the door signs, task-force banner, whiteboard and evidence signs are on their walls; floor tiles both floors; the wall band | screenshots | pass (reviewed) |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 29/29 both |
| | full browser e2e, normal | e2e | **pass 334/334**: the first full pass since R4. It got past the multi-window friends-join step that had crashed every slice since R4.1. The time-served check passed with its 60 s timeout. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 333/334. One check failed: "5A.1: mouse wheel selects pocket 1" missed its 5 s window. That's the classic city's inventory, which R10 didn't touch, and it passed in the normal run. |
| Everything | 226 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R10)

- [ ] Load in and don't start the match: can you see cops on the streets and in the station, and the cruisers driving round?
- [ ] Walk through the station: do the floor tiles and the wall band look better? Anything still floating?

## R9: doors that shut again, cops you can see, a cleaner high end (2026-10-11)

| Area | Check | How | Result |
|---|---|---|---|
| Doors | no prop shares a door's box (doors can't be smashed) | unit (layout) | pass |
| | browser: E opens the station's doors, the prompt says Close, E shuts them, E opens them again | e2e (new-city block) | pass. It failed on the first run: the client treated an open door as "used up" and refused. Fixed. |
| Police | a station cop who chased you out walks back to his beat (through the front doors); 4 station cops; the cruiser test made deterministic | unit (world) | pass |
| | browser: 10 town patrols plus 4 station cops on the map; a cop on the pavement in the street; cops in the lobby | screenshots + the NPC list | pass (14 cops counted) |
| Stairs | one flight of the slate steps from the wall out; the handrail and posts on the treads, sloping with them | screenshots | pass (reviewed) |
| Station front | the entrance tower shows its glass, not a plain navy panel; the windows show from far away | screenshots | pass (reviewed) |
| Canopy | tie rods from the canopy's front corners to the wall | screenshots | pass (reviewed) |
| Windows | painted windows and wall skins sit closer to the walls on every building | screenshots | pass (reviewed) |
| Bodyguards | no band round the middle (a round belly instead) | screenshots | pass (reviewed) |
| High end | no shutters or grime | code + screenshots | pass (reviewed) |
| Browser | new-city block on its own | e2e, normal and 110 ms lag | pass 28/28 both |
| | full browser e2e, normal | e2e | NOT passed: 230/235. It crashed at the same multi-window join point as R4.1-R8. Also failed: "time served: released" and "served: out the front door" (the jail clock), and "loot in your yard banks after 10 s" plus the scoreboard check after it (the game clock; these passed in the lag run). |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 233/235. It crashed at the same join point. Also failed: "time served: released". |
| | the jail clock, measured on its own with the machine idle | scratch script, R8 build vs R9 build | Both builds were slow. 1.2 s of jail time took about 10 s (R8) and 12.5 s (R9) of wall time, at about 20-38 fps. The check's timeout went from 20 s to 60 s; the full e2e has not been re-run since. |
| Everything | 224 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R9)

- [ ] Open the station's front doors, then shut them again; try a shop door too.
- [ ] Walk round town for a minute: do you see cops on the pavements now? Is it too many?
- [ ] Look at the station from the front, and walk up the stairs.

## R8: glass doors, real windows, the chief's key, visual fixes (2026-10-10)

| Area | Check | How | Result |
|---|---|---|---|
| Station glass | first-floor windows on all four faces; ground-floor glass on the front; the chief's corner glass on the front and the side; one pane per window | unit (layout) + screenshots | pass |
| Doors | three glass doors (the station, two shops), each a box that blocks while shut | unit (layout) | pass |
| | E opens and shuts one; shut it blocks; open you walk through; a cop on the way opens a shut door himself | unit (world) | pass |
| | browser: the door prompt, E opens the station's doors | e2e (new-city block) | pass |
| Fairness | the walks measured with the doors open: unchanged (roundabout 137.7-138.3, police door 121.3-121.8, shops 53.6 / 46.9) | unit (layout) | pass |
| The key | on the chief's desk each day; lifting it is heat; E at the cell door opens it (key used up); a jailed bandit who walks out is free with 1 star; it shuts again after 20 s | unit (world) | pass |
| Guards | four station cops, all inside | unit (world) | pass |
| Visual fixes | pavement round the shops and station from far away; the stairwell open from the stairs; the stairs off the wall; no flag; the bouncers' apron bits gone; lighter windows | screenshots | pass (reviewed) |
| Browser | new-city block: everything from R7 plus the doors | e2e (new-city block on its own), normal and 110 ms lag | pass 26/26 both |
| | full browser e2e, normal | e2e | NOT passed: 233/235. It crashed at the same multi-window join point as R4.1-R7. Also "the gym bro comes at you" (the classic city) missed its 10 s window; it timed out the same way in R6's normal run and passed in the lag run. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 233/235. It crashed at the same join point. Also "picked up a spray can and got it out" missed its 10 s window (it read 5 uses a moment later: lag timing). The gym bro passed in this run. |
| Everything | 223 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

## Manual checklist for Blake (R8)

- [ ] Open and shut the station's and the shops' doors; get chased through one.
- [ ] Steal the chief's key, get a friend busted, and let them out.
- [ ] Look at the station from across the street: can you see inside now?

## R7: two pawn shops, the grand station, police presence (2026-10-10)

| Area | Check | How | Result |
|---|---|---|---|
| Pawn shops | two, mirror images, fronts on Gahookz, doors round the corner; glass counters (smashable) split the customers' side from the owner's; owner behind them, bouncer on the floor; a till; armour out front; nothing to steal; no city building on top | unit (layout) | pass |
| Fairness | the two forts on each side to their shop: 53.6 / 46.9 m (within 8 m; the middle forts are closer, as close as that plot gets). The other walks are unchanged (roundabout 137.7-138.3, police door 121.3-121.8) | unit (layout) | pass |
| Station | runs to Gahookz; receptionist in the lobby; 2 interrogation rooms and the breakroom west of the hallway, booking and the cell east, the cell at the back; one-way mirrors; stairs up to the first floor (4.8 m); offices, the chief's corner office, the evidence room's shelves behind a cage; two station beats; the jailbreak comes out the back | unit (layout) | pass |
| Ground | everything walkable still joins up (behind the shop counters left out on purpose) | unit (layout) | pass |
| Selling | each owner buys at the till (40%); separate x3 lists (no overlap), first of each only; each owner tells only whoever walks up; new lists every scavenge | unit (world) | pass |
| Bouncers | hanging about 30 s and picking things up: nothing; punching the owner, throwing at them, smashing a glass counter: he comes (both shops); one hit = out cold 6 s, everything dropped, thrown; he follows you out through the door | unit (world) | pass |
| | 28+ punches, out 40 s, back at his post | unit (world) | pass |
| Evidence | busted with 2 things: both go up onto the shelves (same value); the guard is on duty upstairs; lifting one is +35 heat and the guard chases | unit (world) | pass |
| Patrols | 6 foot patrols and 2 cruisers (lights off) on duty, the station's two cops; they walk; a clean bandit next to one is ignored; wanted in sight: chased; heat gone: back on patrol (not removed); a cruiser that sees you wanted turns its siren on | unit (world) | pass |
| The Champ | 1st and 2nd punch: no stun, he turns on you; 3rd inside 4 s: dizzy 2 s+; punches 4+ s apart never stun | unit (world) | pass |
| Receptionist | punching her is heat; she ducks | unit (world) | pass |
| Server | 29 people synced in the lobby phase (20 walkers + 9 posted; the patrols come on duty when the scavenge starts) | server smoke | pass |
| Browser | new-city block: all four shop people in, two shops, Lou and Fran each tell you their list at the till, the till prompts; walking up the station stairs reaches the first floor (y 4.80); the holding cell checks; no JS errors | e2e (new-city block on its own), normal and 110 ms lag | pass 23/23 both |
| | full browser e2e, normal | e2e | NOT passed: 234/235. Every check up to friends joining passed (the new-city block included), then it crashed at the same multi-window join point as R4.1-R6. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 233/235. It crashed at the same join point. Also "after 3 s: a bundle of cash" (the classic city's till hold-up) timed out once; it passed in the normal run and in R6's lag run, and nothing in R7 touches tills. |
| Draw calls | per frame, R6 / R7 (software GPU, the same spots): fort 869 / 1006, Trolley St 519 / 634, Gahookz 701 / 791, Gahookz west 471 / 535, the lobby 532 / 604, Leftovers Ave 550 / 605. About +10-20%, mostly the 8 extra cops and the cruisers; the shop and station insides are drawn only near (42 m) | GL draw counter | measured |
| Everything | 219 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

Visual review:
- both shop fronts (name, neon, armour, gold balls, awning, roof sign, see-through window);
- inside Lou's shop (counters with junk under the glass, slatwall, guitars, rug, display);
- the station from high up and from Gahookz;
- the lobby (Officer Pam, posters, crest);
- the hallway (bars, notice board), an interrogation room, the cell (tiles, cinder block, the Champ);
- upstairs: the cubicles, the chief's office, the evidence room.

## Manual checklist for Blake (R7)

- [ ] Sell at both shops (and try Fran's list).
- [ ] Smash a glass counter and see who comes.
- [ ] Get busted carrying something, then go upstairs and steal it back.
- [ ] Count the cops on the streets: enough presence now?

## R6: the real station, the holding cell, the Champ, the pawn shop turned round (2026-10-10)

| Area | Check | How | Result |
|---|---|---|---|
| Station | the holding cell, reception and breakroom are inside; one cell door, the toilet and the shower in the cell; upper floors 10 m+ tall; ground still joins up | unit (layout) | pass |
| Pawn shop | faces Gahookz (face -1) on the pavement; the other fairness walks are unchanged (within 2 m) | unit (layout) | pass |
| Holding cell | land in the cell free to move, no lock; E at the door starts the lock, S/Esc stops it; the flush knocks back everyone in the cell (cooldown) | unit (world) | pass |
| The Champ | about 25 punches; his hit knocks you down and he sits on you until you get up; KO drops the Spoon of Destiny; Lou and the fence refuse it | unit (world) | pass |
| Meat Locker | 28+ punches, hp 30, fast windup | unit (world) | pass |
| Server | 26 people synced in the new city (20 walkers + 6 posted) | server smoke | pass |
| Browser | new-city block: the shop prompt from the Gahookz side; busted into the holding cell with no lockpick; cell prompt; toilet prompt; the flush splashes dirty water; released; no JS errors | e2e (new-city block on its own), normal and 110 ms lag | pass 19/19 both |
| | full browser e2e, normal | e2e | NOT passed: 232/235. The run crashed at the same point as R4.1/R5: the friends' windows joining don't reach the game in time on this 2-CPU box. "The gym bro comes at you" and "time served" timed out at 8 fps with 112 s of stalls; both passed in the lag run. |
| | full browser e2e, 110 ms lag | e2e | NOT passed: 234/235. Every check up to the friends joining passed, including the gym bro and time served; then it crashed at the same multi-window join point. |
| Everything | 214 shared + 3 client unit; matchmaking + server smoke; typecheck | full suite | pass |

Visual review:
- the station front (brick wings, stone bay, glass tower, the POLICE canopy) and from high up;
- the roof and the helicopter;
- the reception, the cell (subway tiles, toilet, the Champ) and the breakroom;
- the pawn front on Gahookz with its doors open;
- the streets with the cleaner textures.

## Manual checklist for Blake (R6)

- [ ] Get busted: walk round the cell, flush the toilet with a friend in there, then pick the lock at the door.
- [ ] Try the Champ. (Good luck.)
- [ ] At night: does the helicopter's searchlight sweep?
- [ ] Are the building walls clean enough now?

## R5: HOT STUFF PAWN & LOAN, the station's second storey, textures (2026-10-10)

| Area | Check | How | Result |
|---|---|---|---|
| Chairs | every café chair faces its table | unit (layout) | pass |
| The shop | dead centre below the station, facing it across Lou's Square, its back on the Gahookz pavement; barred window in the middle; a door each side (mirrored); Lou in his booth, Meat Locker; 6+ stocked back-room shelf spots; nothing else built in it or its alley; the station has a second storey | unit (layout) | pass |
| Fairness | Lou's window: 131.7 / 132.2 / 131.7 / 131.7 m from the four forts (all the other walks still within 0.5 m: roundabout 137.3-137.8, police door 121.3-121.8, middle lot 233.3-233.8, Bin Juice 200.7-201.2) | unit (layout) | pass |
| Ground | all walkable ground still joins up (Lou's booth is shut on purpose) | unit (layout) | pass |
| Selling | the window buys for 40% cash; the 3 wanted things pay x3, the first of each only; a new list every scavenge; Lou tells only whoever walks up | unit (world) | pass |
| Meat Locker | comes for you when you punch Lou, smash the case, lift from the back room, throw at the window, or loiter (warned first) | unit (world) | pass |
| | his punch: out cold 6 s+, everything dropped, sent flying; he gets out of the shop to you through a door | unit (world) | pass |
| | 12+ punches to knock out; out 40 s (no trouble for lifting meanwhile), then back at his post with full health | unit (world) | pass |
| Server | 25 people synced in the new city (20 walkers + 5 posted) | server smoke | pass |
| Browser | new-city block: Lou and Meat Locker in, the shop is there, Lou mutters his list when you walk up, the window prompt, no JS errors | e2e (new-city block on its own) | pass 12/12 |
| | full browser e2e at normal speed | e2e | NOT passed: crashed at 233/235. The third window joining the room didn't reach the game in 15 min (Bob alone took 14 min, against 6.5-9 min before). "Mouse wheel selects pocket 1" also missed its 5 s. Same failure point as the three R4.1 runs; the test box is about 2-3x slower than it was (the unit tests take 400 s, were 137 s). Lag run not attempted. |
| Everything | 211 shared + 3 client unit; matchmaking + server smoke | full suite | pass |

Visual review:
- the shop front from Lou's Square: neon flame, booth and tray, shutters with tags, awning, barbed wire, CCTV;
- Lou behind his bars; the shop floor (wallpaper, bare bulbs, signs) and Meat Locker at the back-room door;
- the back on Gahookz (brick, graffiti, the roof sign facing the forts);
- the station: second storey, chief's office, flags, lit sign, lamps, planters;
- streets in each tier and the rooftops (new wall materials, grime, window styles, shutters, tar and gravel roofs, vents, chimneys).

## Manual checklist for Blake (R5)

- [ ] Walk to Lou's window from each side of the station: does the square feel right?
- [ ] Sell something on Lou's list (x3), then try your luck with Meat Locker.
- [ ] Do the streets look less plain now?

## R4.1: screenshot fixes (2026-10-09)

| Area | Check | How | Result |
|---|---|---|---|
| Parades and traffic | 3 seeds each of the dragon and the festa: no moving car gets within 1.5 m of a parade body in front of it, and no car of any kind gets within 1.5 m of one (the street is closed, so nothing is left waiting in it) | unit (match; fails without the fix: 0.02 m) | pass |
| | 8 seeds with full traffic and walkers: every parade and festa finishes (no deadlock with waiting cars); closest car 2.0 m | sim script | pass |
| Gate board | LITTLE ITALY readable on the gates, from the street (north and south faces) | screenshots | pass (reviewed) |
| Everything | 206 shared + 3 client unit; matchmaking + server smoke | unit + smoke | pass |
| | new-city browser block on its own (districts drawn, festa announced "IN 10s", rolls up Leftovers Avenue, drawn, no JS errors) | e2e (solo block) | pass 8/8 |
| | full browser e2e at normal speed | e2e | NOT passed: three runs crashed on timeouts while the extra windows were joining (the 4th window after 25 min; twice the 3rd window after 15 min), after 288, 234 and 234 passing checks with no other failures. The test box itself had slowed: the R4 commit, with none of these changes, now also takes 32 s for the first click after Settings, so I raised that click's timeout. Not run at 110 ms lag. To rerun when the box is quicker. |

## R4: Little Italy, Chinatown and the festa (2026-10-09)

| Area | Check | How | Result |
|---|---|---|---|
| Districts | Little Italy on Leftovers Avenue, Chinatown on Write-Off Avenue, between Gahookz Ghetto Lane and Mayor's Mugshot Mile; mirror images shop for shop (9 each), no two Little Italy shops share a name | unit (layout) | pass |
| Stalls | each Little Italy stall (deli, pizza cart, souvenirs, gelato) has its Chinatown twin opposite, and pays the same on average (deli = seafood tank) | unit (layout) | pass |
| Gates and lights | 2 gates each, pillars on the pavement (not the road); 6+ rows of lights over each street | unit (layout) | pass |
| Terraces | 6+ café tables, each under an umbrella, in front of cafés set 6.5 m back | unit (layout) | pass |
| Setbacks | buildings stand back from the kerb by different amounts (not all 2.5 m) | unit (layout) | pass |
| Fairness | with the setbacks and the mid-block wall: roundabout 138.7 / 139.2 / 139.6 / 139.6; police door 120.7 / 121.2 / 121.5 / 121.5; middle lot 233.0 / 233.5 / 233.9 / 233.9; Bin Juice x Dead-Centre 200.4 / 200.9 / 201.3 / 201.3 (all within 0.9 m) | unit (layout) | pass |
| Festa | each of the three rolls up Little Italy, gets a bandit out of its way (the meatball knocks you down; the band refills stamina; the gondola splashes), drops 12+ money items (each worth a red envelope) along the street, then leaves | unit (match) | pass |
| | the dragon parade and the festa are both on the new map's event list | unit (match) | pass |
| Browser | new-city block: both districts drawn, the festa announced, rolling up Leftovers Avenue and drawn in the street, no JS errors | e2e | pass |
| Everything | 205 shared + 3 client unit; matchmaking + server smoke; e2e 313/313 normal and 313/313 at 110 ms lag | full suite | pass |

Notes (R4): the first lag run went 311/313. "Left click punched the tourist" missed the robbed state within 10 s, though the tourist did drop loot. "A cop is dispatched" failed because the heat cooled before a cop was sent (the game clock crawls at lag); the cop busted you 10 s after the test topped the heat up. The punch check now waits 30 s, and the cop check keeps the heat on the way the bust check already does. After those changes the lag run passed 313/313. The normal run passed 313/313 before the two test changes.

Visual review: Little Italy street (arch gate, festoon lights, laundry, awnings, shutters, terracotta roofs, terraces), Chinatown street (lanterns, gates), the giant meatball rolling through the Little Italy arch.

## Manual checklist for Blake (R4)

- [ ] Walk Leftovers Avenue: do the gates, lights and terraces look appealing enough?
- [ ] Do the varied setbacks make the streets feel less uniform?
- [ ] Catch the festa a few times (it comes round with the other city events) and try all three.

## R3.1 fixes (2026-10-08)

| Area | Check | How | Result |
|---|---|---|---|
| Angled buildings | every triangle of an angled-building mesh faces outward (walls, roof, floor; cornices too) | client unit (fails on the old winding) | pass |
| | a bare angled box beside a plain one: solid from the side and from above | screenshots | pass (reviewed) |
| Roundabout | smooth curved pavement round the ring, cut square at the roads (the diagonals only beside themselves) | screenshots | pass (reviewed) |
| Pavement | buildings 2.5 m from the kerb, never on it | unit (layout) | pass |
| Fairness | all walks within 1.3 m (roundabout 140.1-141.4 m) | unit (layout) | pass |
| Everything | 201 shared + 3 client unit; matchmaking + server smoke; e2e 309/309 normal and 309/309 at 110 ms lag | full suite | pass |

## R3: angled walls + the new city (2026-10-08)

| Area | Check | How | Result (2026-10-08) |
|---|---|---|---|
| Angled walls | a turned box at yaw 0 = a plain box (distances, overlaps); 45-degree squares and triangles have the right footprint and outward faces | unit (movement) | pass |
| | running at a 45-degree wall: never inside it, a steady 1.4 m/s slide along it | unit (movement) | pass |
| | can't walk into a triangle; stand on its roof; climb a 2 m crate turned 30 degrees just like a plain one | unit (movement) | pass |
| | a thrown item glances off an angled wall the right way and never ends up inside | unit (movement) | pass |
| | cops can't see through an angled wall; walkers can't cut through it; a spray tag sits flat on its angled face | unit (world) | pass |
| | angled buildings draw with façades, shopfronts, signs, cornices | screenshots | pass (reviewed) |
| Roads | Blake's 9 names plus 5 more; every road named; the whole network mirrored; no Bin Juice stub; no top road; Dead-Centre Drive; the diagonals leave the avenue corners pointing at the roundabout's middle; all joined; no dead-end lanes | unit (layout) | pass |
| Forts | 4 yards evenly spaced (66.33 m), the outer two 7.5 m from the side walls, avenues centred between each pair, the viaduct over every yard, nothing to climb in the bowl, no ramp, no deck | unit (layout) | pass |
| Fairness | walk from each fort (outer W / E, middle W / E): roundabout 134.9 / 135.4 / 134.9 / 134.9; police door 118.0 / 118.5 / 118.0 / 118.0; middle lot 229.5 / 230.0 / 230.3 / 230.3; Bin Juice x Dead-Centre 196.9 / 197.4 / 197.7 / 197.7 (all within 2 m) | unit (layout) | pass |
| Blocks | every building has a mirror twin; none on a road or pavement; 16+ angled, with triangles, odd wedges and some round the roundabout; no loot in roads or buildings | unit (layout) | pass |
| | all walkable ground joins up (the lots, the cells and the squat are closed on purpose) | unit (layout) | pass |
| North | 5 empty lots behind hoardings north of Snob Row, no road through them | unit (layout) | pass |
| Signs | every junction has a green sign naming roads that meet there | unit (layout) | pass |
| City life | 5 minutes: 22 cars never off the road, longest wait 24 s; no pedestrian inside a building | sim script | pass |
| Classic city | every earlier unit test, pinned to `?map=classic` | unit | pass (201 shared + 2 client in all) |
| Server | matchmaking smoke; server smoke on the new city (23 NPCs: 20 walkers + 3; 40+ props) | smoke | pass |
| Browser | full e2e (classic city) + the new-city block (badge, match starts in the bowl, run out of the fort, map, no JS errors) | e2e normal | 308/309: "a cop is dispatched" missed (the cop did come: BUSTED passed right after). The earlier normal run passed all 301 classic checks |
| | | e2e 110 ms lag | 308/309: "the gym bro comes at you" missed his chase state between two polls (he knocked you down in the next check). That check now also accepts the punch or the knockdown |

Visual review: overview, along Dodgy Cut-Through, the wedges, the roundabout, a street sign, the fort bowl under the viaduct, the lots, the police front, the map with every road's name. Known: in the fort bowl the e2e's high overview shot comes out washed out (daytime fog at 120 m up). The city builds in about 1.2 s (the classic city: 0.2 s).

## Manual checklist for Blake (R3)

- [ ] Run from each fort to the roundabout: do they feel the same?
- [ ] The diagonals and the wedge buildings: is the hand-built look right?
- [ ] Street signs: can you read them while sprinting?
- [ ] The empty lots up north: big enough for the bank, casino and club?
- [ ] Anything that feels too open (the plazas behind the rows) or too closed?

## R2: road-layout test map (2026-10-07)

| Area | Check | How | Result (2026-10-08) |
|---|---|---|---|
| Roads | every road from Blake's drawing is there (ring, double north road, avenues, Uptown Ave, Yards Rd, spokes, south spur, the fork, the roundabout) | unit (layout) | pass |
| | the avenues stop at Gold St (one long block along the top, as drawn) | unit (layout) | pass |
| | the fork's two diagonals run from Uptown Ave to the ring and count as road; nothing up the middle north of the park; the south spur stops at Yards Rd | unit (layout) | pass |
| | every junction joined; every car lane leads on (no dead ends) | unit (layout) | pass |
| Blocks | over 150 buildings; none reaches the pavement or the road (sampled every 1 m) | unit (layout) | pass |
| | no loot in the road or inside a building | unit (layout) | pass |
| | all walkable ground joins up (no sealed courtyards); every fort walks into town; the fork's pavement is reachable | unit (layout) | pass |
| | the park, 4 forts, the squat and the police station kept; no classic landmarks | unit (layout) | pass |
| Traffic + people | 5 minutes of city: 22 cars never off the road, longest wait 24 s (classic: 21 s); no pedestrian inside a building | sim script (not in the suite) | pass |
| Client | `?map=roads` / the road-test preview build: badge "ROAD TEST / SOLO", solo match starts, run out of the fort into town, no JS errors | browser script + preview harness | pass |
| | the map shows the diagonals, THE PARK, TENT TOWN and POLICE only | screenshot | pass (reviewed) |
| Classic city | unchanged: all earlier checks still pass | full suite | pass: 192 shared + 2 client unit, matchmaking smoke, server smoke, e2e 305/305 normal and 305/305 at 110 ms lag |

Visual review: overview, the fork from above, street level on a diagonal (the smooth kerb strip hides the 0.5 m steps underneath), the map, and in play. Known looks: the buildings along the diagonals are stepped squares (a sawtooth frontage); the ring's outer kerb is stepped like before.

## Manual checklist for Blake (R2 road test)

- [ ] Run around the whole map. Does the layout feel right? Too big / too small?
- [ ] The fork north of the park: does the Y feel like your drawing? Is the triangle block worth keeping?
- [ ] The long thin block between the two north roads: keep it, or one road?
- [ ] Where should the landmarks go (bank, City Hall, casino, Chinatown, Le Dumpstère, The Compactor, Pawn-O-Rama, the skate park)?
- [ ] Do you want the rail yard and the canal back down the sides (the edge roads sit where they were)?

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
