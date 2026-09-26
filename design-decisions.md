# Box Fort Banditz — Design Decisions Log

_Last updated: 2026-09-25 (Phase 1 started)._

## Locked by Blake
- Title: **Box Fort Banditz**. City: **Trashington**.
- **3D** browser game, desktop keyboard + mouse, every player on own device, 2–4 players + solo mode.
- Art: cartoon 3D, thick outlines, bright-but-grimy colors, chunky proportions, expressive animation, scrappy urban comedy. Tense/chaotic like R.E.P.O. / Lethal Company but NOT horror; original identity.
- Characters: cartoon humans in patched-together outfits — mischievous street hustlers, not realistic depictions of homelessness.
- Each player owns their own fort and competes. **No co-op (Blake, Phase 5): 4 rivals racing to be Mayor.** Betrayal/stealing/chases are the core fun.
- Priorities: 1 Betrayal chaos, 2 Police chases/escapes, 3 Co-op teamwork, 4 Fort-building fantasy, 5 Shop/haggling (short punchy breather).
- Match: ~25–30 min. Scavenge ~3 min, Shop ~1 min, intro, upgrade breaks, escalating events, final 5–7 min = Mayor finale.
- Progression is match-only (no saves between matches). Rags-to-ridiculous-empire arc every match.
- Regular upgrades bought from a simple menu between rounds; fort visibly transforms. AURA POINTS unlock prestige tiers AND cosmetic clothing/accessories/costumes/hats/shoes/fort decorations.
- Win: **Run for Mayor of Trashington** finale. Huge AURA threshold → apply/ceremony → first to complete becomes temporary Mayor → showdown to wreck/shut down rival forts. Mayor powerful but beatable (limited charges, visible cooldowns, counterplay). Wrecked players get a comeback state (emergency box fort, steal, defend). Warning + prep period before finale. Rivals can ally to overthrow Mayor / steal AURA / sabotage powers. Winner = Mayor at final timer, else highest AURA/fort prestige. Election spectacle: fake posters, cardboard podium, gibberish speeches, fake news ticker, closing ceremony. Fictional President of Trashington — no real political figures.
- All destruction/conflict cartoonish, non-graphic (confetti, collapsing cardboard, flying signs, fleeing raccoons).
- Police central: wanted/notoriety, vision cones + line of sight, chase → searching; hide long enough to escape; being seen again resets escape timer; short funny jail; silly jailbreaks by others.
- Monetization: none. No real purchases, ads, or pay-to-win. YES to fake in-world parody ads/billboards/fake premium popups that collapse instantly — clearly fictional, never interrupt play, never ask for money.
- Audio: generated cartoony music loops, gibberish voices, full SFX set, master/music/SFX volume, no loud autoplay before interaction.
- Hosting: build and test locally first; then Cloudflare Pages (site) + Render (server). Free tier OK in dev.

## Tech stack — APPROVED by Blake (2026-09-25)
- Engine: **Babylon.js 9 + TypeScript + Vite**. Toon/cel shading + outline pass.
- Multiplayer: **Colyseus authoritative server**. Anyone can "host" by creating a room on the server. No peer-to-peer for now.
- Gameplay physics: simple shared TypeScript sim (package `shared/`) run on server + predicted on client. Havok on clients only for cosmetic debris, not synced.
- Netcode: client-side prediction + reconciliation for own player (60 Hz fixed step), interpolation for others, 20 Hz server patches.
- Hosting: Cloudflare Pages + Render **Singapore** region. Free tier sleeps after ~15 min idle (~1 min wake-up); paid always-on instance recommended before real friend nights.

## Design decisions made 2026-09-25 (batch 3)
- **Camera: FIRST-PERSON.** Visible cartoon held-item (viewmodel) system, satisfying movement, clear interaction prompts, comfortable + readable in fast chases. Claude plans extra readability aids for police/hiding: detection meter, glowing police eyes/alert icons, screen-edge danger glow.
- **City layout:** each player's fort sits toward the outer edge of Trashington, facing the centre. Centre = high-risk/high-reward: best loot, most police, most conflict → frantic runs home.
- **Mayor finale:** AURA threshold scales with player count; solo mode has a Mayor finale vs 1–3 AI rival forts. Powerful-but-beatable Mayor, visible warning + prep period, temporary anti-Mayor alliances, comeback after fort wreck.
- Phase 0 scope approved: project setup, 3D title screen, Solo/Create/Copy Link/Join, grey-box FP arena with synced capsules, settings (volumes, sensitivity, FOV, reduced motion, screen shake), no autoplay audio, test plan.
- Not yet answered (using Claude defaults, revisit before Phase 1 art work): character art pipeline (default: restyled CC0 rigged low-poly humans, e.g. Quaternius/Kenney), max players (default: hard cap 4).

## Phase 1 decisions (Blake, 2026-09-25)
- Blake tested the solo preview: working, and he likes it so far.
- Movement feel: **weighty & a bit clumsy** (R.E.P.O./Lethal Company-style momentum; heavier when carrying loot later; stumbles are funny).
- **Visible stamina** for sprinting (short bursts, fast recovery, "winded" when emptied).
- Moves: **crouch/sneak, belly slide, mantle/climb ledges, dodge/dive**.
- First-person hands: **chunky cartoon fingerless gloves in the player's colour**, patched and taped.

## Phase 2 decisions (Blake, 2026-09-25)
- Blake loves Phase 1. Change: first-person hands become **simple white hand wraps** (bare cartoon hands, no gloves).
- Carrying: **hands + small pockets**. Big items held in both hands (slow you down, heavy ones block sprint/dodge, hands full blocks climbing); small items go in **3 pocket slots**; **giant items need 2 players** (one player can only drag them slowly).
- Loot value: **rarity glow + price on look** (grey/green/blue/purple/gold; exact price tag when you look at it; mystery items show ???).
- Controls: **E grab/pocket, G drop, hold left mouse to charge a throw, right mouse cycles pockets**.
- City: **compact ~120 m square** Trashington block; 4 forts at the edges facing a busy centre plaza; alleys, rooftops, a few enterable shops.
- Architecture (Claude, explained to Blake): game rules move into a shared `World` simulation used by BOTH the server and solo mode, so solo and multiplayer always behave the same.

## Phase 2.5 decisions: pedestrians (Blake, 2026-09-25)
- **Sky beams removed** (Blake isn't a fan). Replaced by **rarity outline + small twinkling sparkle** on rare-and-up items (visible ~25 m).
- **Punchable pedestrians**, slapstick BONK style (cartoon swing, spin + stars, loot pops out, they get up grumpy). No blood. Parody brands only ("Rolecks", not Rolex). Claude recommendation accepted implicitly: adult cartoon types only; no kids/elderly/vulnerable targets.
- **All 8 types**: Tourist, Businessman, Influencer, Jogger (mostly flee), Gym Bro + Off-duty Mall Cop (fighters), Mime (fights back silently) + Pigeon Lady (summons pigeons).
- **Fight back = chase + slap fight, no mini-game**: exchange punches in first person, whoever lands 2 hits first wins. Lose -> knocked down, drop loot. Win -> fighter KO'd, drops bonus loot.
- **NPC loot value: low but funny** (half sandwich, lint, coupons...) with occasional surprises (e.g. Rolecks watch).
- **Consequences: track notoriety now**, police read it in Phase 4. Bystanders scream + flee now.
- **PvP punch = full knockdown** (~1.5 s, drop everything). Claude adds anti-grief: 3 s immunity after getting up, diminishing knockdown time on repeat victims, longer attacker cooldown after a PvP knockdown.
- **Punch key: left click when hands are empty**; holding something = left click charges a throw (F still throws, incl. pocket items).
- **Crowds: packed, ~35 pedestrians** (Claude flagged performance risk on older laptops; mitigations: distance culling + lightweight models).
- **Thrown items bonk pedestrians and they drop loot.**
- Built as **Phase 2.5, right now**, before the round loop (Phase 3).

## Phase 3 decisions (Blake, 2026-09-25)
- Blake: pedestrians "really cool". Changes: **fewer (15-20 -> 18)** and **more realistic movement** (done: eased speed, smooth turns, curved corners, side-of-pavement lanes, individual walking pace, glance around when idle, step aside for players, stride-matched walk animation).
- Pockets: Blake didn't know G drops the active item; he's happy with G (no new key).
- **Banking: loot locks in 10 s after it's put down in your fort yard.** Before that anyone can steal it back (dropping it again restarts the 10 s).
- **Time's up: anything you're carrying outside your own fort is LOST** (frantic run home). Loot lying in your yard (locked or not) is cashed in.
- **Events (all four):** airdrop crate (giant, legendary, parachutes into the plaza, needs 2), garbage truck (drives a ring-road side, hoovers loose loot, flattens bandits, warns 5 s ahead), happy hour (30 s, one zone's loot worth double; grab it in time to keep the bonus), raccoon heist (one raccoon per fort steals the most valuable loot, even banked; bonk it to get it back, no heat for that).
- Claude defaults (tell Blake): 3 rounds x 3 min, 5 s intro, 12 s results between rounds; events escalate 1 / 2 / 3 per round, never the same one twice in a round; host starts with ENTER (or pause menu); solo starts with ENTER. Score = cash; winner = most cash ("TOP BANDIT") until the Mayor finale and shop phases exist.

## Phase 3.5 decisions: city overhaul (Blake, 2026-09-26)
- Blake: the map needs more of a city feel (bigger high-rises), cars you can get hit by, shops with interiors and a cashier to rob, more ways to get loot (dumpsters, punching phone booths...), stamina runs out too fast. Tone: "a homeless bum terrorizing the city" (kept cartoonish: slapstick, parody brands, no gore).
- **Map ~200 m, dense** (3x the area): two square ring roads (inner around the plaza, outer around downtown) with two-way traffic, connector streets with parked cars, downtown high-rises 26-46 m, 4 walk-in shops, forts on the outer edge (you cross the outer ring road to get home).
- **Car hit = wiped out**: cartoon pancake, everything you carried spills on the road, respawn at your fort after 10 s. Cars honk but never stop for bandits (they do stop for pedestrians at crosswalks).
- **Robbing shops: both** ways: HOLD R at the till for 3 s (cash bundle, alarm, big heat), or grab (E) the whole cash register (heavy, worth more, alarm). Shelf stock can be swiped; the cashier yells if they see it (heat). Punching the cashier drops their float + alarm.
- **Loot sources: all four**: dumpsters + bins (E: search, random junk, sometimes a raccoon jumps out), smash-and-grab props (phone booths, vending machines, parking meters, newspaper boxes), shop shelves, parked cars (smash the window, car alarm). Everything refills over time (parked cars once per round).
- **Stamina**: ~8 s of sprint (was ~3.5 s), refills in ~2 s.
- Claude defaults: 20 pedestrians (top of Blake's 15-20 now the city is bigger) + 4 cashiers; 14 moving cars; hold-up key is R (E would have grabbed the register instead); a "Performance mode" setting (no shadows, lower resolution) for older laptops.

## Phase 4 decisions: police + jail (Blake, 2026-09-26)
- **Police station** in the SE corner (replaced the park): lobby with a front desk, four barred cells along the back (one per player, visible from the lobby), a back alley, two parked cruisers out front.
- **Busted = 30 s in a cell**, with a **lock-picking minigame** to break out early. Blake: "a lock picking game but make it relatively hard so it feels like time is running out", "different every time".
- **Busted = you lose what you carry** (confiscated, gone for good). Heat resets.
- **Low heat = foot cops only; max heat = cop cars too.**
- **Release**: serve the 30 s = out the front door with 0 heat; pick the lock = out the back alley, still wanted (1 star, and the cops know where you went).
- Claude defaults (tell Blake, easy to tune):
  - stars at 30 / 60 / 90 heat; 1 star = 1 foot cop, 2 = 2, 3 = 3 + a cop car that drops off 2 more; a cop car running you over = busted.
  - Cops run 6.1 m/s (you walk 5.0, sprint 7.8): you can outrun them while stamina lasts, then you need to break line of sight.
  - Cops need line of sight (buildings, alleys; crouching behind a parked car hides you). Heat doesn't cool for 4 s after a crime or a sighting; then slowly while cops are on their way to where you were reported (0.6/s) or when you're not wanted (1/s), fast once they've lost you (3/s). Cops go to the crime scene / last sighting, not to where you are hiding. A crime a cop sees adds +5 and they come running.
  - Grab: FREEZE! (0.4 s telegraph), a dodge (Q) at the right moment slips it; knocked-down players get cuffed fast (so punching a friend near the cops is betrayal).
  - Punching a cop: +15 heat, they stagger; 3 punches = down for 5 s (drops an Evidence Donut).
  - Lock: 4-6 pins, each with its own rhythm (smooth / rush / wobble / dash), its own green band, and a random binding order (only the "stuck" pin can be set; it trembles when you select it). Wrong pin or bad timing = a slip (last pin drops + noise); 3 quick slips = the guard shouts, all pins drop, 4 s lockout; once the first pin is set a tension timer (12-17 s) starts. Simulated players: a sharp player breaks out ~70% of the time in ~17 s, a casual one ~15-40%.
  - Traffic stops for cop cars (sirens have right of way).

## Phase 4.5 decisions: tuning + big shots (Blake, 2026-09-26)
- **Police: light nerf.** Still 1 / 2 / 3 cops for 1 / 2 / 3 stars, but slower (5.6 m/s, was 6.1), shorter sight (24 m, was 30), slower grab (0.55 s wind-up, was 0.4), give up sooner (6 s search, was 9), heat cools faster once they've lost you (4/s, was 3), a new cop every 4 s (was 2.5), the cop car drops off 1 cop (was 2), max 6 foot cops in town (was 8).
- **Lock picking "didn't register"**: two causes found. (1) A person clicking when they SEE the pin in the green is ~70 ms late, and the windows are ~60-150 ms long: simulated late clickers solved only 1-6% of locks. Now a press counts if the pin was in the green in the last 0.09 s. (2) Clicks went to the pin selected with A/D, not the one under your mouse. Now the mouse moves an on-screen pick: click a pin to select it, click again (or SPACE) to set it. Bands slightly narrower and tension slightly shorter so it stays hard (simulated human-like players: ~60% break out if decent, ~40% casual, in ~16-18 s). The stuck pin now says STUCK! when selected.
- **Camera swinging after jail**: the mouse still turned the camera while you were aiming at the lock-picking screen. In jail the camera now holds still facing the bars and the mouse drives the pick; on release you face the way out.
- **Big shots (all four)**: one at a time in town, first after ~35 s, then every 45-75 s after the last one leaves (they stay ~2 min). Announced with a banner, a floating gold $$$ (visible from 130 m), and a HUD tracker (name, distance, arrow).
  - Millionaire (top hat, monocle, cane) + a bodyguard who fights you: gold bar ($160-260) or diamond ring ($140-300); +30 heat.
  - Armored cash courier: armored (2 hits, fights back), drops the Bank Money Bag ($250-400, big + heavy); ~70 heat = instantly 2 stars.
  - Celebrity + 2 superfans who film it (+8 heat each): Golden Award ($120-220); +30 heat (+16 fans).
  - Crypto bro: Crypto Wallet (mystery, $0-500); +20 heat.

## Core match loop (Blake, 2026-09-26) — drives Phase 5+
- **Scavenge -> Bonus scavenge (~1 min) -> Shop round -> Upgrades round -> repeat**, until a player has enough **AURA** to enter the **Mayor round**.
- AURA must be **really hard** to obtain; other players can **contest** the would-be Mayor.
- **Bonus scavenge** (Blake): comes right after the 3-minute scavenge; **resets the arena** (fresh city), **police are twice as hard**, and **loot is scarce**. ~1 minute.
- **Bonus scavenge is a NIGHT round** (Blake): dark sky, lights everywhere, street lamps glowing, lit windows.
- Replaces the Phase 3 placeholder of "3 fixed rounds, then results". Open questions for Phase 5: what makes the bonus scavenge different, how AURA is earned, how contesting works.

## Phase 5 decisions: the match loop, AURA and the Mayor (Blake, 2026-09-26)
**NOT a team game.** 4 rivals racing to become Mayor of Trashington. All co-op ideas are scrapped (no helping carry, no teams, no jailbreaks by friends).

Changes to what exists:
- Stamina bar moves to the **bottom-left corner**.
- Big shots: **no banner, no $$$, no HUD tracker, no JACKPOT prompt**. They spawn randomly and just look fancy; spot them yourself.
- Giant items (rubber duck, airdrop crate): **one person drags them alone, slowly**; a rival can yank it off you.
- **Tasers at 3 stars**: cops try to tase you within **6 m** (telegraphed: aim + wire). Hit = ~2 s stun, drop what's in your hands, cuffed if a cop reaches you. Dodge / cover avoids it.

The cycle (repeats until someone becomes Mayor):
- **3-min scavenge -> 1-min night bonus scavenge -> 60 s shop -> 60 s upgrades.**
- **Cash**: money / loose change you pick up (coins, cash bundles...) goes straight into your cash automatically.
- **Shop round**: pawn-shop screen with the shady pawn guy; he makes an offer for each banked item; accept or haggle (he might go up, or get offended and go down).
- **Night bonus round**: city resets (fresh loot + props), NIGHT visuals (dark sky, glowing lamps, lit windows, neon), loot scarce but **worth x2**; banked stays banked, carried loot lost at the end; **banked loot in forts is stealable only at night** (fort raids).
  - Night cops: double cops per star (2/4/6), heat builds twice as fast, flashlight cones (see further), cop cars from 2 stars.
  - Big shots more likely at night, and their loot is x2 too.

AURA (fame; live leaderboard visible to everyone):
- Earned from: fort upgrades, legendary stunts (robbing big shots, jailbreaks, surviving 3 stars, KO'ing a cop, night fort raids), fame items bought in the shop, round-winner bonus, **knocking out a player**, and **climbing the Founder statue in the plaza and holding T to do a stupid dance for 5 s** (once per cycle, raises heat, everyone can see you).
- Lost by: getting busted (~10%), getting knocked out by a player (they steal a slice), getting your fort raided.
- Target: a strong player reaches Mayor after **~8 cycles (~45 min)**.

Upgrades round (menu over a view of your fort, watching it transform): **bandit gear** (pockets, stamina, sprint, punch, lockpick kit, taser-proof jacket...), **fort defences** (guard dog, tin-can tripwire, spring-loaded boxing glove, lock), **fort prestige** (cardboard -> plywood -> tin mansion -> gold palace: mostly AURA), **dirty tricks** (one-use: banana peel, fake siren, smoke bomb, bribe a cop).

Mayor round:
- When someone reaches the threshold: **starts after the current cycle** (announcement, one last shop/upgrade to prepare).
- Candidate must **hold the podium at City Hall for a campaign speech** (fill a VOTES bar, ~90 s total, pauses when off the podium).
- Rivals contest: **knock them off the podium** (each knockdown drains votes) and **steal their votes/AURA** (if a rival passes the threshold, THEY become the candidate).
- Fail: back to the loop, the candidate loses a big chunk of AURA.

Solo: **3 AI rival bandits**.

Build order: **5A** loop + night + cash auto-bank + pawn shop + fort raids + tasers + UI changes; **5B** upgrades (all 4 kinds) + fort visuals + AURA + leaderboard + statue dance; **5C** Mayor round + solo AI rivals. Blake tests after each.

## Phase 5A details (Blake, 2026-09-26)
- **Haggling = read his mood**: the pawn guy's face/lines hint how far he'll go (sweaty = desperate, greedy, grumpy); push too far and he's offended and drops the offer.
- **Fort raids**: at night rivals can take banked loot from your yard; the owner gets an **alarm sound + warning only** (no arrow/marker).
- **Unsold loot is lost** at the end of the shop round (sell it or lose it).
- **5A ending (temporary)**: 3 cycles, richest wins (replaced by the Mayor race in 5B/5C).
- **Upgrades round in 5A**: keep the 60 s slot with a "coming soon" screen over your fort.
- **Giant items**: one player drags alone, slowly; a rival grabs the other end = **tug of war** (both mash E, harder masher wins); punching the dragger makes them let go.
- **Money bag** (courier) must be carried home; only small money (coins, cash bundles, wallets...) auto-banks.
- **City resets** (fresh loot + props) at the start of **every** scavenge, day and night; fort banked loot untouched.

## Phase 4.6: host from your browser (Blake, 2026-09-26)
The live game felt laggy: the free Render server (0.1 CPU, in Singapore) could only send ~10 updates/s. Blake chose **B: host from your own browser** (free, lowest ping, only friends play):
- Whoever clicks **Create Room** hosts: the whole game (the same shared World) runs in their browser tab. Friends join with the same invite link/code and connect **directly** to the host (WebRTC data channel). Anyone can host.
- The Render server is now only the matchmaker ("signal" room): it passes connection offers between host and joiners, then gets out of the way (no game simulation there).
- The host has zero lag; others' lag = distance to the host's house. The host's tab keeps simulating in the background (worker timer).
- Host leaves/closes the tab = the game ends for everyone (clear message; a "leave site?" warning while friends are connected). No host migration.
- Joiners who drop reconnect automatically to their seat (held 2 min); refresh-rejoin keeps the seat.
- Only STUN (no relay): a friend behind a very strict network (some mobile/school/work networks) may fail to connect; an optional TURN relay can be configured later (`VITE_TURN_URL/USER/PASS`).
- The old server-hosted rooms still exist (`?net=server`) as a fallback.

## Build status
- **LIVE (2026-09-26)**: game site https://box-fort-banditz.pages.dev (Cloudflare, auto-builds from GitHub repo nr5mk8476t-debug/Box-Fort-Banditz; build `npm run build --workspace client`, output `client/dist`, variable `VITE_SERVER_URL=https://box-fort-banditz-server.onrender.com`), game server https://box-fort-banditz-server.onrender.com (Render free plan, Singapore, from `render.yaml`; health check `/health`). Verified: rooms create + two SDK clients join and play on the live server; game clock runs in real time on the free CPU. Free plan sleeps after ~15 min idle (~1 min wake-up). Pushing to GitHub redeploys both (rooms in progress drop while Render redeploys).

- Code lives in the cloud session workspace (`box-fort-banditz/`, git commit 83c4543) and as `box-fort-banditz-phase0.zip` sent to Blake. Full source snapshot: `claude/code-snapshot.md` in this project (latest: Phase 2.5).
- Versions: Babylon.js 9.28, Colyseus 0.18 (server) / @colyseus/sdk 0.18, @colyseus/schema 5, Vite 8, TypeScript 5.9, Node 22.
- Network note: the sandbox's direct route to registry.npmjs.org is stale; run npm with `NO_PROXY=localhost,127.0.0.1` so it goes through the approved proxy.
- **Phase 0 DONE (2026-09-25)**: title screen, solo/create/join/copy-link flow, invite links, FP grey-box arena, server-authoritative movement with client prediction, reconnection, settings, generated audio. 14 unit + smoke + 39 browser checks passing (also at 110 ms lag). Solo preview artifact: https://claude.ai/artifact/TMpUm13DgANDtWcgixrZBx
- Known Phase 0 limitations: placeholder capsule characters; no held-item viewmodel yet; screen-shake setting stored but unused; brief shader-compile hitch on entering the arena; player name tags currently show through walls (must change before hiding/stealth in Phase 4); preview page (v2) loads Babylon from jsDelivr + inlines game code; verified in a sandboxed/CSP harness but confirmed working by Blake.
- **Phase 1 DONE (2026-09-25)**: weighty movement, stamina (+HUD), crouch (C), belly slide (sprint+C), dodge (Q), mantle (SPACE facing ledge), stumble; gloved viewmodel hands with pose-based animation; camera crouch height, FOV kick, roll, landing dip, screen shake (setting respected, off with reduced motion); remote players show poses with mitten arms; generated sfx (footsteps x3, slide, dodge, climb grunt, winded, stumble); shader pre-warm (no entry freeze). 25 unit + 1 client unit + smoke + 55 browser checks passing.
- Controls note: crouch is C, not Ctrl (Ctrl+W closes the browser tab and can't be blocked).
- Bugs fixed in Phase 1: camera/hand springs exploded at low FPS (now sub-stepped + NaN guard); hands too large; slide label blocking spawn view.
- Known Phase 1 limitations: hands + characters still placeholder shapes; no key rebinding yet; name tags still show through walls.
- **Phase 2 DONE (2026-09-25)**: shared World simulation (server + solo run identical rules); ~120 m Trashington city (plaza, 4 blocks with alleys, 2 walk-in shops, climbable low roofs via dumpsters, 4 fort lots, construction yard / junkyard / parking / park corners, parody billboards); 15 loot items with rarity outlines + sky beams for rare+; grab/pocket/drop/charge-throw; giant two-person carry; grab races; bonks; impact sounds per material; dust puffs; white hand wraps; remote carry poses; whole-city shader pre-warm. 43 unit + 1 client + smoke + 79 browser checks passing (also at 110 ms lag).
- Bugs fixed in Phase 2: dumpsters were mid-alley (climb gap) -> moved against walls; item highlight/outline covered thin decals (TV screen); shader-compile hitch when new things came into view (pre-warm from above); host START button disappeared after loading; mouse buttons ignored (Babylon cancels pointerdown -> use pointer events); giant items drawn twice for the carrier; stale test server + cleanup issues in the test script.
- Known Phase 2 limitations: items don't collide with each other (they can overlap); thrown items only shove (stuns + stealing from hands = Phase 4); held big items cover part of the view (by design, ask Blake); sounds are not truly 3D (volume by distance only); name tags still show through walls; mystery item values stay hidden until selling exists (Phase 5).
- Next: Phase 3 (scavenge/shop round loop, timers, city events, base return, basic NPC chase) awaiting Blake's feedback.
- **Phase 2.5 DONE (2026-09-25)**: 35 pedestrians of 8 types walking a route map around the city (shared sim, synced online, culled beyond 45 m, body parts merged per limb for speed); punch = left click with empty hands (jab animation, BONK/POW/K.O. pop text, whoosh + bonk sounds); pedestrians drop funny low-value loot once (13 new pocket items incl. the Rolecks watch); thrown items bonk them too; jogger dodges, mime traps you in an invisible box, pigeon lady's swarm slows you (dodge shakes them), tourist camera flash, influencer films, bystanders scream + flee; gym bro / mall cop / mime chase and slap (2 hits first wins; lose = knocked down, win = KO + bonus loot; they gloat or huff); PvP punch = full knockdown with immunity + diminishing repeats; heat (notoriety) tracked + HUD meter for the police later; knocked-down camera (lying on your back) + daze vignette; sky beams replaced by rarity sparkles (<= 25 m). Key presses during the 0.18 s action cooldown are now queued instead of lost.
- Bugs fixed in Phase 2.5: a fighter's gloat was instantly overwritten by "chase" (then "huff"); G pressed right after E was silently dropped (now queued); test-only: the mouse moving onto the crosshair turned the view before a punch.
- Known Phase 2.5 limitations: pedestrians walk through players (they only avoid each other and walls); speech lines are text bubbles + gibberish (no voice acting); pedestrians don't pick loot back up; heat does nothing yet (police = Phase 4); lots of people on screen is the heaviest thing the client draws, so Blake should check FPS on his machine.
- **Phase 3 DONE (2026-09-25)**: round loop (lobby -> intro -> 3 x 3-min scavenge -> results -> final results -> play again), fort yards (painted outline), 10 s banking with countdown/BANKED tags, loss of carried loot away from home at time-up, live scoreboard (cash + banked), round timer + 30 s warning + last-10 s ticks, home compass, results/final cards, four city events (airdrop crate + parachute + red target, garbage truck, happy hour gold ring + x2 tags, raccoon heist), pedestrians cut to 18 with natural movement.
- Bugs fixed in Phase 3: raccoons got stuck behind the fort box (now path around it); grab + drop in the same instant didn't restart the 10 s bank timer; test flakes on a crowded test machine (effect/timer checks).
- Known Phase 3 limitations: no shop or upgrades yet (cash only scores); rounds are fixed at 3 x 3 min (easy to tune); banked loot just sits in the yard (forts don't visibly grow until the fort phase); the truck drives through parked vans; happy hour zones on the four blocks include rooftops/buildings.
- **Phase 3.5 DONE (2026-09-26)**: 200 m Trashington (roads, crosswalks, lane paint, street lights, high-rises with rooftop clutter, 4 themed shops: Corner Mart, Pawn-O-Rama, Bagel Barn, Gizmo Garage, with shelves, fridges, counters, posters, neon, awnings), traffic (14 cars, lanes, corners, queueing, braking for pedestrians/the truck, honking), wipeouts + 10 s respawn, 106 interactable props, cashiers, hold-ups, register theft, shoplifting, car alarms, 18 new loot items with models, pedestrians only cross at crosswalks, longer stamina, performance mode, collision broadphase (server tick ~5x faster).
- Bugs fixed in Phase 3.5: the old small-city coordinates in tests; hold-up and register grab both on E (moved hold-up to R); busy browsers could be dropped by the server after ~6 s (now ~20 s) and a stale reconnect token after an automatic reconnect made refresh-rejoin create a new seat (token now kept fresh).
- Known Phase 3.5 limitations: buildings (except shops) aren't enterable; cars only queue behind cars in their own lane, so two lanes can overlap briefly at ring corners; garbage truck drives through parked cars; heat still does nothing until police (Phase 4); the bigger city is heavier to draw, so older laptops should try Performance mode.
- **Phase 4 DONE (2026-09-26)**: police station + 4 cells, wanted stars (HUD), dispatch of foot cops (out of sight, to the crime scene), line-of-sight hunting (patrol / chase / search / give up), FREEZE grab with dodge counterplay, punchable cops, 3-star cop cars on a road network (sirens, flashing light bars, drop off 2 cops, run-over bust, traffic yields), busted = confiscation + 30 s jail, lock-picking minigame (random every time, server replays the presses), jailbreak to the back alley, time served out the front. Tests: 101 shared unit (incl. 15 police) + 1 client + smoke + 169 browser checks passing (also online at 110 ms lag). Plus Blake's 3 bug reports: skyscraper windows flickering (z-fighting with the outline pass), camera flipping upside down (knockdown lean added on top of looking up), pedestrians stuck on parked cars (feeler-based obstacle avoidance).
- **Phase 4.5 DONE (2026-09-26)**: light police nerf, lock-picking fix (grace window + mouse-driven pick + clearer STUCK pin), camera holds still in jail, 4 big shots with entourages, $$$ markers, HUD tracker, 5 jackpot items (+ the missing donut model). Also fixed while testing: the server was running the lock's tension/noise timers on ITS clock, so a laggy or slow client could have its pins dropped by the server (now only the player's press times count; the lock clock is synced); pressing E on a slow frame could send an item you'd already pocketed (false "Too slow!"). Tests: 108 shared unit + 1 client + smoke + 175 browser checks (also 175/175 at 110 ms lag).
- **Phase 4.6 DONE (2026-09-26)**: browser hosting (see above). Also on the server path: state copied only before each network patch + client input batching.
- **Phase 5A DONE (2026-09-26)**: the cycle loop (3-min day scavenge -> 5 s dusk -> 1-min NIGHT scavenge -> sunrise results -> 60 s pawn shop -> 60 s upgrades placeholder, x3, richest wins), night visuals (dark sky, moon, glowing lamps + light pools, lit windows/neon, a soft light around you, cop flashlights), night rules (22 loose items instead of 55, all x2, heat x2, cops 2/4/6 per star, cop cars from 2 stars, flashlights see 30 m, big shots usually within seconds), fort loot kept through the night and raidable (owner alarm + banner), pawn shop with Sal (mood face + lines, haggle up/offended, sell/sell all, unsold lost, READY skips), small money auto-banks, tasers at 3 stars (red laser warning, 0.8 s aim, dodge/cover = miss, hit = 2 s stun + drop hands + cuffed), giant items dragged solo (x0.4) with tug of war (mash E, 8 s max, holder wins ties; punching the dragger frees it), UI: stamina bottom-left, no big-shot banner/$$$/tracker/JACKPOT prompt.
- Known Phase 5A limitations: upgrades are a placeholder screen; AURA/leaderboard/statue (5B) and the Mayor round + AI rivals (5C) not built yet; cash is the only score; a player who joins mid-shop sees an empty shop until the next cycle.
- Known Phase 4.6 limitations: host refresh ends the game; no relay for strict networks; the host's upload carries everyone (~15-30 KB/s per friend, fine on NBN).
- Known Phase 4 limitations: cops only chase on foot or in the car (no roadblocks / helicopters); friends can't break you out yet; the lock-picking game is client-timed (the server checks the presses make sense and can't be from the future, but a determined cheater could script it); cops can't climb onto roofs (standing on a low roof keeps them below you, they'll wait and search).
