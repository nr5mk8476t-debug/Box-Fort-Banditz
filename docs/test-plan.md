# Box Fort Banditz — Test Plan

Every phase adds to this plan. Nothing is reported as working unless one of these checks (or a manual check listed below) has actually passed.

## Layers

1. **Unit tests** (`npm test`, no browser): the shared game rules. Fast, exact, run on every change.
2. **Server smoke test** (`tests/server-smoke.ts`): two headless clients talk to a real server. No rendering.
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
