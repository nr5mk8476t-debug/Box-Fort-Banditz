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

## City, Combat, Nightlife & Physical Selling Overhaul (Blake, 2026-09-27)
Working rules (Blake): ask before any design/balance/control/visual/technical/scope decision not explicitly specified; numbered questions with what each affects; approach + risks + test plan before big features; honest progress + results only.
Slices (one upload each): **1** fixes + feel (traffic/pedestrians, controls, throw everything, health, arms/wraps/HUD, 110 ms test mode for browser hosting) -> **2** city overhaul -> **3** physical selling (alley pawn shop, storefronts, safe zones) -> **4** bank -> **5** nightlife + black market.
Blake accepted all recommendations (Q1-26) except:
- **Q18 unsold storefront goods**: player chooses per item: default = back to the fort (raidable next night); a CLEARANCE bin on the stall dumps an item for 30% (sad trombone).
- **Q6 crosshair**: KEEP the white crosshair; REMOVE the blue "Q" dodge circle. **Dodge ready** = a small "Q" chip next to the stamina bar (bottom-left).
- **Q7 hand wraps**: clean white boxer tape, same for everyone; remove the gold sleeve cuffs.
- Blake: "don't be afraid to add comedic things."
Accepted recommendations (summary): 100 HP; player punch 34 (3 = knockdown); NPC fighter hit 25; knockdown at 0 HP drops everything, get up at full HP, 3 s immunity; regen 10 HP/s after 5 s unhit; car = instant wipeout; taser = stun, no damage. A non-KO punch drops the victim's HAND item only. Throw damage by weight x speed 5-30, a throw can never KO; knockback by weight. Giant items: clumsy 3-4 m heave, slow wind-up, 0.5 s self-stagger. Wheel cycles hands + 3 pockets; selecting a pocket item puts it in your hand; a big/giant item in hands locks cycling; keys 1-3 pockets, 4 empty hands. Right mouse reserved. City: keep 200 m footprint, ring roads, 4 fort lots; ~60-70% buildings enterable (ground floor; some stores with 2nd floor); ~70% loot value indoors; <= ~40 simulated NPCs, club dancers mostly cosmetic. Fisherman: ambient + buy a junk fish + push him in the pond (heat). Pawn shop in an alley open during scavenges too; Sal's mood haggling at the counter; pawn 100-125% of value, 3 wanted items/cycle x1.75, storefronts net ~70-90%; stall auto-filled from fort loot (8 slots) with CHEAP/FAIR/GREEDY mode; yard + stall safe by day and in the shop phase, raidable at night, carried loot outside the yard always vulnerable; shop phase 90 s. Bank: guards (baton + taser), hard vault lock game -> alarm -> 3 stars, heavy money bags, night x2 + more guards, one vault per cycle, open for 30 s to others; busted = bags taken, knocked down = bags dropped. Nightlife: 2 clubs + 1 bar at night; bouncers throw fighters out (knockdown + hand drop), hit back 40, no giant items inside. Black market (3/night): Wing Fizz (5 s flight), Ghost Gum (cops blind 8 s), Mega Mitts (3 double punches), Sneaky Socks (no heat 15 s), Banana Boomerang (slip); dealer also buys "hot" items at a premium. Testing: retire ?net=server from the test matrix (keep a matchmaking smoke test).

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
- **Overhaul Slice 1 / 5A.1 DONE (2026-09-27)**: traffic + pedestrian deadlock fix (curb waiting, honk then slide blockers to the curb, walker watchdog); left-fist punch, right click reserved, wheel/1-4 selection (4 = fists), every item throwable incl. giant heave; 100 HP health (punch 34, regen); health + stamina bottom-left with Q chip; lower hands, unlit two-tone shading, clean white tape; ?lag= test mode; matchmaking smoke test. 122 shared + 2 client unit, smoke 8/8, 219/219 browser checks. Preview artifact v10.

### Slice 2 (city overhaul) decisions (Blake, 2026-09-27)
- **Skyline:** mostly towers (high-rise with a shop on the ground floor). No rooftop routes. 2nd floors are reached by inside stairs or outside fire-escape ladders.
- **Size:** the city grows to ~230 m so every shop gets its own building (forts move out a little; runs home ~15% longer; the 3-min day is retested).
- **Shops (15 + pawn):**
  - Kept: Corner Mart, Bagel Barn, Gizmo Garage.
  - New: Leaning Tower of Pizza, Hole Lotta Donuts, taco truck (parked in the plaza), Second Hand Stan's thrift, Spin Cycle laundromat, Kicks R Us, Pixel Palace arcade, Pet Peeves (snitching parrot), Cracked Screens, Drug-ish Mart (parody only), Bling Thing jeweller, Hair Today barber.
  - Pawn-O-Rama moves to the alley (Slice 3). The bank, 2 clubs and a bar come in later slices.
- **Interiors:** mixed. Most shops are one quick room (aisles, counter, back door); flagships (jeweller, arcade) get a back room.
- **Shopkeepers:** each has a personality (the cook throws dough, the barber chases with clippers, the jeweller has a panic button, the parrot squawks for the cops).
- **2nd floors:** apartments (a sleeping resident who wakes on noise), shop stockrooms (a crackable safe), offices (water cooler, yelling boss), a gym (dumbbells, gym bros).
- **Night:** mixed. Corner Mart, the pharmacy and the donut shop are open 24/7; the rest are closed and broken into (smash a window or pick the back lock), which sets off a burglar alarm (heat).
- **Crowds:** cars 14 -> 18, pedestrians 18 -> ~24, plus shopkeepers; stays under ~40 simulated NPCs.
- **Restock:** at the dawn of each cycle.
- **Windows:** big shop windows (loot and staff visible), open doorways.
- **Plaza:** smaller green, pond (comedy dunk: wade slowly, hand item floats away), fisherman (buy a junk fish, push him in = heat, he chases you with his rod), trees, benches, taco truck, Mayor statue (the winner's face goes on it), busker (steal his tip hat), pigeon fountain (coins, wet + slow), food cart row (carts are giant stealable items).
- **Loot:** 3-4 new themed items per shop (~40 new).
- **Clutter (all 4 kinds):**
  - Junk: trash bags, bins, rideable trolleys, cones, pallets.
  - Street furniture: bus stops, hydrants (punch = spray knockback), mailboxes, bike racks.
  - Signs of life: cafe tables, sandwich boards, plants, wet-floor signs.
  - Construction: scaffolding (climb to a 2nd floor), portaloo, cement mixer.
- **Hiding:** a few comedy spots (portaloo, dumpster, thrift changing rooms, arcade mascot costume). Heat drops faster while hidden; a cop who saw you go in checks.
- **Jeweller:** mini-bank (smashing a case = instant 1 star, panic button = 2 stars, baton guard).

### Slice 2A: what was built (2026-09-27)
- City is 230 m (fence at +-115). Ring A at +-30, ring B moved out to +-80; the edge band (forts, warehouses, parking, junkyard, construction yard, police station) moved out 14 m. Fort pads are ~96 m from the centre (was 82).
- 20 street-level buildings downtown (15 x 13 m each): 3 shopfronts per side block facing the plaza, 2 per corner block. Towers sit on top of them. The back of each side block has 2 more towers on ring B, with an alley between them.
- 14 walk-in shops + the taco truck = 15 shops with cashiers. Glass fronts you can see through (they still block you), open doorways, a back door to the alley. The bank, 2 clubs and the bar are shuttered ("OPENING SOON").
- Pawn-O-Rama is no longer a walk-in shop downtown: it moves to the alley in Slice 3. The shop-phase pawn menu still works as before until then.
- Upstairs: Pixel Palace + Bling Thing stockrooms (inside stairs in a staff back room), Lawyers 4 Less offices and The Crumbling Arms apartments (inside stairs in the lobby), apartments above the donut and pizza shops and a gym above Kicks R Us (fire escapes out back).
- Plaza: open paved square (SW quarter, events/airdrops land there), the park + pond with lily pads (NE, you wade at 45% speed; pedestrians walk round), the fisherman's dock (the fisherman comes in 2B), the Mayor's statue ("OUR MAYOR (FOR NOW)"), the pigeon fountain, the taco truck (hold-up at the hatch), kiosk, bus stops.
- Street clutter: pot plants, sandwich boards with jokes, cafe tables + umbrellas at the food shops, trolleys at Corner Mart, bike racks, mailboxes, hydrants, cones, trash bags, pallets, scaffolding + portaloo + cement mixer in the south alley, a wet-floor sign in every shop. (Interactive clutter: 2B.)
- Loot: shelves are stocked at the start of each scavenge (day and night) with a 40% chance per shelf spot; no trickle restock (a cleaned-out shop stays empty). Loose loot now also spawns upstairs (zone "room"). Measured: ~83% of the city's loot value is indoors (target was ~70%) and the city holds ~6,300 of loot at the start of a scavenge (5A.1 city: ~4,000). NEEDS BLAKE'S CALL.
- Crowds: 18 cars. Pedestrians stay at 20 (not 24): with 15 cashiers, 24 would push the simulated NPC count past the ~40 budget. NEEDS BLAKE'S CALL.
- Performance: building interiors are only drawn within 42 m of the camera. Collision lookups got a faster path for the bigger city.
- Moved to 2B: shopkeeper personalities, night shop hours + break-ins, the fisherman, busker, food cart row (stealable), residents, scaffolding climbing, trolley riding, hydrant spray, hiding spots, jeweller as a mini-bank. Moved to 2C: themed loot for the new shops (they use existing items for now), crackable stockroom safe.
- **Overhaul Slice 2A DONE (2026-09-27)**: the new city (see "Slice 2A: what was built"). 128 shared + 2 client unit, matchmaking smoke 8/8, 224/224 browser checks (also 224/224 at 110 ms). Preview artifact v11.

## City Redesign (slices C1-C6), agreed 2026-09-27
- The full brief lives in the Claude doc "Trashington City Redesign Brief": https://claude.ai/code/artifact/964b440e-3cc5-40aa-8347-0f8d528d0861
- Key decisions:
  - Forts all on the south edge in walled compounds under an overhead highway (Tent Town), one in each back corner and two evenly between them.
  - Three tiers south to north: low (average buildings), medium (medium-high end), high (fancy, richest loot, most cops).
  - Straight roads only: Mayor's Mile boulevard, a roundabout around the park, 2 crosstown streets, an Uptown grid, a one-way loop, and an edge ring. Traffic lights where the Mile crosses the crosstown streets; give-way elsewhere.
  - Every block holds several buildings wall to wall, with an alley or courtyard behind. About 21 landmarks; every other block gets a unique hook.
  - Casino: the TRASHMATIC slot machine (about 90% payback), a Ride the Bus table (x1.9 / x2.6 / x3.9 / x15, a 5-11% house edge from a 200k-hand simulation), and a hard heist built after the bank.
  - All 11 open-point recommendations were accepted (see the brief).
- Order of work: C1 layout blockout -> C2 buildings -> C3 park -> C4 mess (props) -> C5 life -> C6 traversal + shops. Then Slice 3 (physical selling), Slice 4 (bank + casino heist), Slice 5 (nightlife).

## City Redesign slice C1 (layout grey-box), built 2026-09-27
- The whole city was rebuilt from a road-network list (junctions + straight roads + the roundabout's quarter arcs). Road surfaces, zebra crossings, lane paint, street lights, cop-car routes and pedestrian route lines are all worked out from that list, so later road changes are one-line edits.
- Traffic is a lane system: a lane each way on every road (one on one-way streets and the ring), curved connectors through junctions, random routes. Lights at the two Mile crossings give one approach at a time (5 s green, 1.5 s amber, 0.5 s all-red; 28 s round). Give-way junctions are first come, first served, one approach at a time. Cars on the ring go first. Cars never enter a junction without room on the far side; a short road between two junctions holds one car. A car jammed 6 s (2.5 s of green at a light) takes another way. Cars stop behind the zebra crossing, not on it.
- Pedestrians: if one won't get off the road, the car honks (2 s), asks them to move (3.5 s), then creeps forward and nudges them aside (9 s). This stopped the "pedestrian and car both wait forever" deadlocks the soak tests found.
- Blocks are filled by rules, not by hand: buildings wall to wall along every street side (width 5-10 m low tier, 6-12 medium, 8-14 high), 4 m pavements, an alley gap and a 1.5 m squeeze gap into the courtyard, units and landmarks placed first. Checked by tests (no blank frontage over 15 m, no empty ground, no sealed courtyards, landmarks at most half a block).
- The 20 street-level units from 2A moved into the new blocks (Corner Mart + Stan's + Pixel Palace + the pizza place + The Dive in the Yards; Old Brick and Market Row get the rest; Bling Thing and Cracked Screens in Uptown). Cracked Screens gained an upstairs stockroom so the rich loot isn't all on the west side.
- The taco truck became a small taco cart on the park promenade by Market Row (the full cart behaviour is slice C5).
- Fort compounds: 2.5 m walls, a 4 m gate facing the city, a 1.6 m squeeze gap in the back wall (raccoons use it too). Slot order: 0 and 1 are the corners, 2 and 3 the middle two.
- Raid alert: a rival stepping into your compound at night sets it off straight away (at most every 15 s): siren, red screen edge, a banner naming the raider, an arrow home with the distance. Taking something sends a second banner naming the item. Everyone in Tent Town (or within 80 m) hears the siren.
- The movement playground and the browser tests' open ground moved to the build yard at the south end of the rail yard.
- Fairness (open question for Blake): from every fort, the walk to the nearest quarter of the richest 20% of loot is within 3.4%, but the average walk to all of it differs by 15% (corners are further from the middle of Uptown). See the C1 report for options.

## City Redesign slice C1.1 (Blake's layout fixes), built 2026-09-28
- Kept as they were: the Uptown and Yards road jogs.
- City Hall: the back of the loop and the Mile's link to the Parade are gone. City Hall Drive is now a one-way U in front of City Hall, which makes Gold St one-way eastbound. A formal garden fills the space behind (hedges, 2 fountains, benches, trees, an empty plinth "RESERVED FOR THE NEXT MAYOR", some loot).
- The high-tier car park became THE GILDED PIGEON RESIDENCES, a luxury apartment tower with a canopy, rope posts, 3 valet cars (parked cars kept) and a "VALET (TIPS MANDATORY)" kiosk. Its doorman is a snooty NPC who stays at his post, fights back and insults you.
- Forts: the compound walls are gone. Every fort starts open and vulnerable. Each yard is 16 x 15 m, marked by bold border lines and corner flags. Walls and defences come as paid upgrades in levels (Slice 5B). Forts are evenly spaced 47.5 m apart. Raccoons may come in from behind.
- Raid alert: kept on entering a rival's yard at night; still nothing by day.
- Sides run the full length to the south fence. West: the rail yard, with a boxcar siding ("RETIRED") at the south end; trains come in C5. East: the canal is deep water (you float, drop your hand item with a splash, paddle at 38% speed, can only climb out at ladders), with 2 footbridges, the marina at the north end and a sewer outfall with a crawlable pipe at the south end. The highway crosses over both.
- The bus depot is scrapped. The edge roads stay.
- Fairness is accepted by Blake: the nearest quarter of the richest loot is within 9.1% from every fort (the test limit is 12%); the average to all of it differs 16.1%.
- Next: C2 (buildings and facades).

## City Redesign slice C2 (buildings and façades), built 2026-09-29
Blake's answers (29 Sep): detailed façades everywhere; materials per tier; a parody sign on every shop; night lighting waits for C5; keep going overnight with my recommendations (each logged here); stay at 100 files; Performance mode hides small detail; fire escapes and balconies are looks only until C6.
- Materials per tier: the Yards are brick (mortar courses, soot streaks) in reds and browns; the middle is painted render (damp stains, hairline cracks) in pastels with cream trim; Uptown is dressed stone and blue-green glass curtain-wall towers. The Mayor's tower stays stone.
- Every street building has a front: shops get a glass shopfront with a door and window displays, a striped awning (6 colour pairs) and a fascia sign; towers get a lobby with glass doors and a canopy (gold-trimmed Uptown, on a polished stone base).
- Detail (normal mode only): window sills on the street side (and the back of Yards buildings), lintels and corner pilasters in the middle tier, window AC units in the Yards, flower boxes in the middle tier, fire escapes on about half the Yards/middle fronts, railed balconies (gold rails Uptown), cornices, belt courses on towers, water tanks and AC units on roofs you can't reach, setback crowns and masts on the tallest Uptown towers.
- Landmarks got their own features: City Hall's pediment, gold band and flags; the Grand Hotel's red canopy and flags; a giant green trash can on TrashCorp HQ; the casino's marquee bulbs and rooftop dice; the museum's pediment; the mall's brand banners and arcade; the country club's topiary; a golden pigeon on the Gilded Pigeon; the market hall's barrel roof; the Bijou's bulb marquee; St. Dumpster's steeple and rose window; the station's arches; the marina office's lifebuoy. Landmark entrances get glass doors.
- Signs: 24 parody names per tier (72 in all). A block never repeats one; touching neighbours never share a colour (both tested).
- Changed a gameplay-visible thing: one-storey shops in the Yards are now 4.8 m+ tall (were 3.2 m+) so the shopfront and fascia sign fit. Rooftop loot on those roofs moves up with them.
- Logged for later (my calls, not yet built): stoops, stairwells and reachable upper entrances need climbing, so they move to C6 with the fire escapes; lit windows and neon are C5.
- Performance: about +30% triangles in view; Performance mode takes most of it back. Shop signs moved to shared texture sheets (fewer draw calls, less memory).

## City Redesign slice C3 (the park), built 2026-09-29 (overnight, my recommendations)
- The fountain is now wadeable: a 0.35 m rim you step over, shallow water inside (slows you like the pond). In the middle, the Golden Mayor sits on a white porcelain toilet with gold fittings on top of his column, reading the paper. The plaque still says "OUR MAYOR (FOR NOW)".
- The pond is pear-shaped (a big round end, a small one) and wadeable. A shark fin circles in the big end (it's just for looks: probably cardboard).
- The fisherman: a new posted NPC at the foot of his jetty with a rod out over the water. He grumbles at bandits ("Shh. You'll scare the fish."), fights back with his rod (2 hp), and goes back to fishing. He counts like the doorman (not part of the crowd).
- Bushes: 5 clumps on the lawn. Crouch inside one and cops can't see you (unless they're close enough to hear you, like everywhere else). Standing up in a bush, or crouching on open grass, doesn't hide you. Two bushes have loot in them.
- Pigeons: a flock of about 14 round the fountain. They scatter when someone walks within 2.5 m or sprints within 6 m, then come back. They're drawn by each player's own screen (not synced): cosmetic only, zero network cost.
- Furniture: lawn out to 16.5 m with the paved promenade ring outside it, 8 park lamps, 2 picnic tables, 3 flower beds, benches, bins.
- Fixed along the way: the zebra crossings where roads meet the roundabout moved 5 m out, so a car waiting to join the ring no longer sits on the crossing (it made walkers wait up to 20 s; found by the soak test after the park changed the random walks).
- Not done (logged): pigeon lady feeding the flock, fishing for loot, the shark as a real hazard. Candidates for C5 (life).

## City Redesign slice C4a (mess: smash, throw, push, noise), built 2026-09-29
Blake's answers (29 Sep): split C4 into C4a (props, noise, heat, reset) and C4b (laundromat + old lady, tagging); aura points are shown now and used by the Mayor race later; a smashed shop window opens a way in until dawn; the old lady yells, calls the cops, then chases with her cane (C4b).
- Smashable street things (each is a real collision box, so smashing it removes it for everyone until dawn): shop windows (2 hits), bus-stop glass (1), hydrants (2), mailboxes (2), benches (2), planters (2), café and picnic tables (1), pallets (1). The old smash-and-grab props (phone booths, vending machines, meters, news boxes, parked cars) work as before.
- A smashed shop window: the shop alarm goes off (heard 25 m away), the cashier yells (heat if awake), and it's a walk-through gap into the shop until dawn.
- A burst hydrant sprays for 20 s; standing in the jet shoves you away and lifts you off your feet.
- A mailbox drops a newspaper, coupon, coins or (rarely) a wallet.
- Smashing is loud (12 m): cops who hear it come to look, walkers stop and stare ("Was that a bench?!").
- Heat only if seen: breaking things adds heat only when a pedestrian, cashier or cop can see you (20 m, clear line of sight). x2 at night as usual. An empty alley is free.
- Throwing counts: a thrown thing slamming into something smashable is a hit by the thrower.
- Street junk (~48 pieces, $0-5 each): café chairs by the tables, bin lids by the bins, bottles in the alleys, crates by the dumpsters, bricks and a barrier at the building site, barrels in the rail yard, trolleys outside Corner Mart, fish at the market and the marina. Chairs, lids, bottles, bricks, fish and barriers are thrown like any item; crates, barrels and trolleys are giant (dragged, slow). Junk never comes from random loot spawns and doesn't count toward the loot caps. It all goes back to its spot at the start of each round.
- Resets: everything smashed is repaired at the start of each day; damage done in the day lasts through the night. Searchables refill as before.
- Sync cost: a smash sends one prop change; resting junk costs nothing (only changes are sent).
- How it's drawn: the smashable things stay part of the merged city meshes (no extra draw calls); a smash collapses just their vertices, and dawn puts them back. Pieces fly out and vanish after ~10 s (only on your screen).
- My calls (logged): hydrants/benches etc. inside shops wait for C6's interiors; street lights, fences, fish tanks and TVs in shop windows aren't smashable yet (C6); rideable trolleys wait for C6 traversal.

## City Redesign slice C4b (laundromat, old lady, tagging, THE PIT) + Blake's fixes, built 2026-09-29
Blake's asks (29 Sep): a small skate park in the low end of town; fix the brick texture drawn over the glass on unenterable buildings (and the mayor building); move the police station out of the centre to the middle tier near the river; remove the tutorial area on the train tracks.
- Laundromat (SPIN CYCLE, low end): 9 washers along one wall, 4 tall dryer stacks along the back. No cashier. E on a machine opens it quietly in 2.2 s (move off and it cancels). A punch forces it open instantly: loud (10 m noise) and heat if anyone sees. One search per machine per day (refilled at dawn, not at night). Inside: loose change and odd socks mostly (odd sock, single shoe, novelty undies), fresh laundry sometimes, rarely a designer piece (a GOOCHY hoodie or VERSAYCHEE scarf, cartoon parody brands). 1 in 20 a cat-or-raccoon leaps out.
- The old lady lives upstairs (the laundromat's upper floor is now an apartment, fire-escape access). She sleeps until a noise within ~4 m of her hearing range (a forced washer, a smash, an alarm): she leans out of her window yelling, calls the cops (+12 heat to whoever made the noise), then after 3 s comes down after you with her cane (slower than you: 4.3 m/s; 2 hp). If you're gone (18 m+) she goes back to bed. While asleep she's not drawn, can't be punched or hit, and doesn't count as a witness.
- Tagging: pick up a spray can (THE PIT, alleys, the build yard, under the arches; Gizmo Garage sells them). With it out, look at a blank wall (a building, wall or fence face, not glass) within 2.6 m and hold E for 1.5 s. A can holds 5 tags; each tag is +1 aura (shown in the round tally; the Mayor race in C5+ will use it). Tags must be 1.6 m apart. Heat 2 if someone sees you. Tags stay through the night and are scrubbed at dawn; aura stays for the match. Tags are drawn in your player colour with a random word ("BANDIT", "TRASH KING", etc.).
- The client times the 1.5 s hold; the host only checks that at least half of it passed (slow or jittery host clocks would otherwise refuse fair tags).
- THE PIT (skate park, Yards, low tier, replacing "Yards: West"): concrete pad, two stepped quarter pipes (0.3 m steps up to a 1.8 m deck) facing each other, a fun box with a rail, a grind rail, a kicker, a bench, graffiti walls covered in background art (both sides), 3 spray cans and loot. Skating itself (boards) is not in C4b; you run up the ramps.
- Background graffiti: up to 36 art pieces on low/middle-tier side walls plus THE PIT's walls (looks only).
- Fix: façade wall textures now draw behind glass (alphaIndex: wall texture 1, glass/windows 2) and start above the shopfront (3.3 m) or tower lobby (4.2 m), so brick no longer covers the glass (City Hall included).
- Fix: the police station moved from the centre to Market Row's precinct block (middle tier, 65..83 x -43.8..-30.5, near the canal), door on a street, cruisers in its own lot. The old block north of the park became ordinary buildings.
- Fix: the tutorial area on the train tracks (practice ledges, crawl tunnel, labels) is gone. The mantle and crawl tests now use a freight dock at the rail yard (a 1.4 m platform) and the sewer pipe mouth.
- My calls (logged): the old lady has no shop or till; she is posted inside the laundromat's ground floor (hidden while asleep) and shown at her window when yelling; the laundromat's floor count checks (14 shops with cashiers) were updated.

## Next slices agreed 2026-09-30 (Blake, before bed)
- Lobby: new players wait in a **rooftop squat** cardboard camp (lobby only; when the match starts everyone spawns at their own box fort). Enticing: a big view of the city, mentor **Uncle Dumpster** (grubby wise hobo in a bathrobe, talks like a kung-fu master about trash), free starter loot. In the lobby: practice everything (dummy, throw targets, tag wall, crates to mantle; nothing counts), **2 mini-games** to start (trolley race, bin-lid target throw), a painted **city map** board, plus an **M-key map** in matches.
- Every block gets **both** a landmark and an activity; Blake's favourite kinds: **weird NPCs** and **big landmarks**.
- Side jobs come from a **payphone network** (ringing payphones), paying **in-game cash + aura**.
- **Chinatown**: a street in the middle tier by the canal: red gates at each end, curved tiled roofs, lanterns over the road, dumpling house / noodle bar / tea house / herbal shop / bakery. Lantern glow at night, a dragon-dance parade event, food stalls and fish tanks to loot. (Respectful, not a caricature: architecture, signs and food, no stereotyped characters.)
- Order: C5a lobby camp -> C5b Chinatown -> block landmarks + weird NPCs -> payphone jobs -> night & life (lighting, Mayor race).
- Performance is not a concern (Blake, 30 Sep): make things detailed.

## City Redesign slice C5a (the lobby squat), built 2026-09-30 (overnight, Blake's answers)
- **Where:** THE SQUAT: a condemned 26 m tenement just past the south fence (x -15..15, z -140..-120). Its roof is the lobby. You arrive there before the match (solo and online); when the host starts, everyone goes to their fort (the old start). Joining mid-match goes straight to your fort. The roof is the one place allowed past the city's edge; a parapet plus a 2.9 m chain-link fence keeps you on it.
- **The view:** the spawn row faces north across the whole city to Uptown's towers. While you're up there the fog is pushed back 2.4x so you can see it all. Far-off suburbs are drawn all round the city, so the horizon never ends in nothing.
- **The camp:** a burning barrel (flickering flames, rising embers), a sagging purple couch and rug, crate seats, three tarp tents, two cardboard huts, fairy lights, a washing line, a water tank with the city map painted across it ("YOU ARE HERE"), a locked stairwell hut, TV aerials, a satellite dish, a pigeon coop, plants in buckets, puddles and patched tar paper, and a "WELCOME TO THE SQUAT * POP: US" banner.
- **Uncle Dumpster:** a grubby old hobo in a maroon bathrobe and fluffy slippers, with a long beard, headband and a mug of tea. He talks like a kung-fu master about trash and goes through 12 tips in order whenever someone is within 7 m (one every 7 s). He dodges every punch ("You punch like wet cardboard").
- **Practice (nothing counts on the roof):** no heat, no noise heard below. There's a practice dummy (punch: THWACK, it wobbles, never breaks), three crates stepped 1.0 / 1.6 / 2.2 m to climb, and a TAG PRACTICE wall with a spray can that restocks. Aura resets to 0 when the match starts.
- **Free stuff:** a FREE STUFF pile restocks every 6 s while waiting (rubber ducks, coupons, sandwiches, coins, chickens...), along with a rack of bin lids and two trolleys. It stops when the match starts, and the match clears the roof.
- **Mini-game 1, THROW-O-MATIC:** press E on the machine, then you have 30 s to throw bin lids at three painted targets on the east fence. Points are 3 / 2 / 1 by distance from the bullseye; the target flashes and pops "+3". Your best score is kept and shown on the squat panel.
- **Mini-game 2, TROLLEY GRAND PRIX:** press E at the chequered-flag post, then drag a shopping trolley round the four cones (a painted dashed track round the camp) and back through the start. The cones only count while you're dragging a trolley. There's a 120 s limit, and your best lap is kept.
- **The squat panel (top right, on the roof only):** what's up there, your current game (time left and points, or cone count), and everyone's best throw score and lap.
- **M map:** press M any time in a match for a map of the city: districts, landmarks (City Hall, Casino, Police, The Pit, Laundromat, Market Hall, Skyscraper), roads, the canal and pond, the park, buildings by tier, the forts in their colours, you (an arrow) and your friends. The same drawing is painted on the water tank.
- **Rule tests** create worlds without the lobby (option `lobby: true` turns it on; the game always does). This keeps the older rule tests starting at the forts as before.
- **My calls (logged):** the roof sits off the edge of town rather than on a city block, so no block had to be demolished. Solo also starts in the squat (it has a lobby phase too). Uncle Dumpster's first tip comes a second after you arrive.

## City Redesign slice C5b (Chinatown), built 2026-09-30 (overnight, Blake's answers)
- **Where:** the Market Row street by the canal (x 69..75, z -21..21, middle tier). The two small "Stalls" blocks east of it (75..87 x -21..-3 and 3..21) became Chinatown. Six shophouses face the street; the market hall's side is opposite.
- **The look (respectful: architecture, signs and food, no caricatured characters):**
  - Shophouses in red, cream, jade and ochre, with glazed hip roofs in green, red or orange, upturned corners and a gold ridge with curled ends.
  - A tiled eave between the floors with red lanterns under it, balconies with red railings on some, and a hanging vertical sign in Chinese (饺子馆, 面馆, 茶楼, 药材, 饼家, 杂货) beside the English fascia.
  - Shops: DUMPLING DYNASTY, LUCKY NOODLE BAR, GOLDEN LEAF TEA HOUSE, JADE HERBAL SHOP, GOLDEN MOON BAKERY, TRIPLE HAPPY GROCER.
  - Two red gates (CHINATOWN boards on both faces, green tiled roofs, lanterns, round stone guardians at their feet), and red and gold lanterns strung across the road.
  - Shophouses skip the generic fire escapes and rooftop water tanks.
- **Lantern night:** all the lanterns glow warm red and gold as it gets dark.
- **Stalls to loot:**
  - Three dumpling steamer carts (E: dumpling boxes, pork bao, fortune cookies, mooncakes).
  - Two souvenir stalls (E: paper fans, fortune cookies, lucky waving cats; rarely a jade dragon statue, a two-handed $80-200 item).
  - A LIVE SEAFOOD tank. Punching it gives a splash and a noise, and a live crab or a fish flops out. The glass stays broken until dawn.
  - Stalls restock after 60-90 s. The stall keeper yells "HEY! You pay for that!" (+3 heat) only if somebody sees you.
- **Dragon parade (a new city event, in the random rotation with the airdrop, truck, happy hour and raccoons):**
  - A gong and a 5 s warning, then a red-and-gold dragon on poles, carried by 10 dancers, snakes up Chinatown from gate to gate behind its drumming (about 35 s).
  - It bumps anyone in its way aside (no knockdown) and scatters a red envelope of lucky money (+$5-40, straight to your wallet) every 2.6 m, with firecrackers.
  - Every screen shows it in the same place: the host sends only how far the head has walked.
- **Items (all only from Chinatown):** dumpling_box, bao_bun, fortune_cookie, mooncake, live_crab, paper_fan, lucky_cat, jade_dragon, red_envelope.
- **M map:** Chinatown is on it.
- **My calls (logged):**
  - The shophouses aren't walk-in (C6 does interiors).
  - The gates stand just inside the street's ends, clear of the crossroads.
  - The parade walks the street's centre line (the cars don't stop for it; it's a cartoon dragon).
  - English plus simple, correct Chinese characters on signs.

## Landmarks agreed 2026-09-30 (Blake)
- Blake's picks: 2 the crashed blimp, 3 the scrapyard car crusher, 4 the burnt-out bus fort, 6 the pigeon cathedral, 7 the Giant Donut, 9 the rusty Ferris wheel, 10 the Mayor's Golden Statue, 12 the giant WANTED screen. Plus a new **Trashington Bank**.
- The country club goes. The grand **Trashington Bank** takes its Uptown block. The small Old Brick bank shop becomes a cheque-cashing shop.
- Bank heist, **sneaky OR loud**:
  - Sneaky: find the manager's keycard hidden in Uptown and open the vault quietly.
  - Loud: drill the vault door (alarms, 3 stars).
- **Golden stash items only at landmarks:** each landmark hides 1-3 secret stashes that refill daily, and a few rare golden items only come from them.
- Order: C5c Uptown (bank, Mayor's Golden Statue, WANTED screen), then C5d low end (blimp, car crusher, bus fort), then C5e middle (pigeon cathedral, Giant Donut, Ferris wheel).

## City Redesign slice C5c (Uptown: the bank, the Mayor's statue, the WANTED screen), built 2026-09-30
- **The Trashington Bank** (Uptown, where the country club was; the Old Brick bank shop is now CHEQUE-O-MATIC):
  - A marble temple of money you can walk into. Five columns hold up a frieze ("IN GOLD WE TRUST") and a pediment with a gold coin. It has a gold dome with ribs, a lantern and a $ flag, tall arched windows, a red carpet up the steps, brass bollards and a NO LOITERING sign.
  - Inside:
    - a chequered marble floor, two gold chandeliers, a velvet-rope queue;
    - a teller counter with glass and hanging TELLER signs, banker's lamps;
    - a portrait of the Mayor, a "LOANS FOR EVERYONE* (*NOT YOU)" banner, a security camera, potted palms;
    - a STAFF ONLY door to the manager's office.
  - The vault sits behind the counter: a round steel door with a spoked gold wheel, bolts and a keycard reader. Inside are a steel bench of gold bars (5, loose), bags of cash (3), stacked decorative gold and 4 walls of safety deposit boxes.
  - **Loud way:** E on the vault door with no keycard = the drill.
    - Heat jumps to 92 (3 stars), the bank alarm rings, and both bank guards come for you (tough: 3 hits).
    - The drill sparks and makes noise every 2 s.
    - Hold still for 20 s (moving over 1.2 m away or getting knocked down stops it). Then the door swings open (inward) and stops blocking.
  - **Sneaky way:** the manager's keycard turns up each morning at one of 6 spots round Uptown (a bin, a planter, the museum steps...). E on the vault while carrying it opens the door in 3 s, quietly: no heat unless somebody sees you (then +30 and the guards come). The card stays in the lock.
  - Safety deposit boxes: search each once a day (pearls, a watch, bearer bonds, an awkward family photo, cash, sometimes gold).
  - Dawn shuts the vault, restocks it and hides a new keycard.
- **The Mayor's Golden Statue** (Mile West):
  - Mayor Grubsworth in gold on a throne on a plinth (MAYOR GRUBSWORTH on its front). He wears a top hat and a magnificent moustache, waves, and holds a giant drumstick as a sceptre. Twinkling sparkles, lamp posts with gold globes, a ring of flowers, and a "PLEASE DO NOT TOUCH THE NOSE" plaque.
  - Climb the plinth and hold E for 5 s to prise off his **gold nose** ($180-320). There's heat if somebody sees you; he's noseless till dawn.
  - Tag his plinth: +5 aura, +15 heat.
- ~~The WANTED screen~~ (Mile East): dropped by Blake on 2026-10-01 (see C5c.1). Mile East is a plain plaza for now.
- **Golden stashes (landmark-only items):** a loose brick or tile with a gold glint, found once a day:
  - the bank manager's office: the Golden Toilet Seat (two hands, $300-600);
  - the back of the Mayor's plinth: the Mayor's Medal of Honour;
  - a low stone wall in the Mile East plaza: the Diamond Pigeon (it stays there until Mile East gets its own landmark).
- **M map:** the Bank and the Mayor's statue are on it.
- **My calls (logged):**
  - The vault door swings inward so it clears the teller counter.
  - The gold on the bench is looks only; the loose bars and bags are the loot.
  - The bank's front columns block you (thin posts), and the frieze is a ledge you can stand on.
  - The duplicate gold_bar entry I'd added was removed: the bank uses the existing $160-260 gold bar.

## C5c.1 (Blake, 2026-10-01): no WANTED screen; bounties and citizen's arrests instead
- Blake didn't like the giant WANTED screen, but liked players knowing each other's heat and being able to help the police for a reward. His answers:
  - **Seeing heat:** on the M map.
  - **Claiming:** a citizen's arrest.
  - **Who pays:** the busted bandit.
  - **Mile East:** another landmark later.
- **Removed:** the screen, its control box and the hack/frame rules.
- **M map WANTED pins:**
  - You always see yourself.
  - Other bandits appear only once they're wanted:
    - 1 star: a red area 26 m across that they're somewhere inside;
    - 2 stars: a 16 m area;
    - 3 stars: exactly where they are.
  - The areas move every 8 s.
  - Under the name: the stars and their bounty (heat × $5).
- **Citizen's arrest:**
  1. Knock a wanted bandit (1+ star) down.
  2. Stand over them (1.9 m, in front of you) and press E. You hold them down, and a red-and-blue light flashes over them.
  3. While you hold them:
     - they stay flat;
     - their heat can't cool;
     - the cops always know exactly where they are.
  4. When a cop cuffs them, you get the bounty: their heat when you pinned them × $5. It's taken first out of the loot the cops seize from them, then out of their cash. If they have less, you get what there is.
- **How a pin ends early:**
  - they mash SPACE 14 times to wriggle free (you're dazed for a moment);
  - a friend knocks you off (you get knocked down or stunned);
  - you move over 1.2 m;
  - 60 s pass.
- **Rules:** you can't pin someone who is clean, standing, too far away, already held by someone else, or on the lobby squat.
- **My calls (logged; easy to change):**
  - The map now hides clean bandits. Before, it showed everyone exactly; otherwise the rough areas would give nothing away.
  - The bounty rate is $5 per point of heat, up to $500 at 100 heat.
  - A pin lasts at most 60 s, and it takes 14 SPACE presses to wriggle free.
  - The pinner doesn't get heat for the knockdown punches beyond the usual rules.

## City Redesign slice C5c.2 (Mile East: LE DUMPSTÈRE), built 2026-10-01
- Blake first picked a nightclub ("CLUB TRASHCAN", built and screenshotted), then scrapped it and chose a **fancy restaurant** instead. Nothing of the club shipped; the restaurant reuses its shell (a doorman at the door, a roof terrace up the stairs). A real basement was ruled out: the city has no underground.
- **Le Dumpstère** ("three bins in the guide"): a two-storey burgundy restaurant with a gold sign, a striped awning, a red carpet, topiaries, lanterns and a menu easel ("CANAL TROUT A LA BIN").
- **The maître d'** at the front door lets you in only if:
  - you've **booked a table** (E at his podium: $20, good until dawn); or
  - you're **dressed for it** (carrying something designer: a hoodie, scarf, sunglasses, gold chain, Rolecks or pearls).
  - Anyone else stepping into the doorway is put back on the pavement ("Do you have a reservation?").
- **Other ways in:**
  - knock the maître d' out (hp 3, fights back);
  - go round the back through the **kitchen door**;
  - climb the crate and boxes onto the **roof terrace** and come down the stairs.
- **Inside (each once a day, restocked at dawn):**
  - the **cloakroom**: designer stuff, wallets, a Rolecks, pearls;
  - the **dessert trolley**: macarons, cake, fancy cheese;
  - the **kitchen stove**: silver cutlery, fancy cheese, baguettes; the chef yells and you get +3 heat if anyone sees you;
  - the **grand piano**: bash out a tune for +3 aura (and a noise);
  - the **chef's table** on the roof: Fancy Fizz, silver cutlery, a gold chain, sometimes a diamond ring or cash.
- **Golden stashes:**
  - the **Golden Truffle** ($260-480), behind a loose brick in the roof parapet;
  - the **Diamond Pigeon**, now in a brick on the back wall.
- **Looks:**
  - posh diners (top hats, pearls) eating at candlelit tables;
  - chandeliers, gold-framed paintings, a red carpet runner;
  - a white-tiled kitchen with steaming pots and a chef who shakes his pan;
  - the roof terrace has herb beds, string lights and umbrellas.
  - Performance mode skips the diners, chef and chandeliers.
- **New items:** Fancy Fizz (sparkling apple juice), Silver Cutlery, Box of Macarons, Golden Truffle.
- **M map:** Le Dumpstere is on it.
- **Also fixed:** at 3 stars a 4th cop could turn up if the cop car arrived after the third foot cop. A car on its way now counts as the cop it brings.
- **My calls (logged; easy to change):**
  - The table fee is $20.
  - These count as designer: hoodie, scarf, sunglasses, gold chain, Rolecks, pearls.
  - The restaurant is open all day; there's no closing time.
  - The kitchen door is always open, but the chef yells and gives +3 heat if he sees you.

## Overhaul agreed 2026-10-01 (Blake): city life, scale and movement
- Five jobs, built as separate tested slices, **feel first**:
  - **D1:** snappier movement and slapstick car hits.
  - **D2:** a giant multi-level bank with a basement vault (needs real underground floors in the engine).
  - **D3:** the **scrapyard with the car crusher** replaces the Pit (my pick, Blake agreed). C5d becomes just the blimp and the bus fort.
  - **D4:** the interiors overhaul (every shop gets its own clutter and story; several buildings get extra floors).

## D1: faster, snappier movement + slapstick car hits, built 2026-10-01
- **Movement:**
  - walk 5.0 → 5.8 m/s, sprint 7.8 → 9.4, crouch 2.3 → 2.7;
  - acceleration 20 → 48 (full walk speed in about 0.12 s), stopping 17 → 34 (a sprint stops in about 0.28 s, a little skid left);
  - pushing against your own momentum (reversing, hard cuts) bites 1.6x harder;
  - air steering 5 → 8;
  - slide 9.4 → 11.2 (it needs 7.0 to start), dodge 10.5 → 12.
  - Carrying still multiplies your speed the same way, so heavy loot is still clearly slower.
- **Chasers kept in step:** foot cops 5.6 → 6.5 (still between walking and sprinting), the default fighter chase speed 5.6 → 6.5, bank guards 6.2 → 7.2, the old lady 4.3 → 5.0.
- **Hit by a car:**
  - You're launched up (8.5 m/s) and along the car's direction (at least 6 m/s), knocked a little to the side, and cartwheel through the air.
  - Other players see you spin with dizzy stars; your own camera rolls and lurches.
  - Everything you carry is flung across the road.
  - You land flat, and the 10 s stun starts when you land. You can't move, punch, grab or sprint (inputs do nothing; you just slide to a stop).
  - A small yellow ring above the hotbar counts the seconds down ("SPLAT!").
  - Then you get up right where you landed (no more trip back to your fort). You get 3 s where cars can't hit you, and 1.5 s where nobody can knock you down again.
  - Sounds and effects: a honk plus a cartoon crunch, a spring BOING and a slide whistle; a dust puff and a "SPLAT!/BOINK!/KA-THUNK!" pop.
- **Tested (2026-10-02):** 181 shared + 2 client unit, matchmaking smoke 8/8, server smoke pass, browser e2e 288/288 normal and 288/288 at 110 ms lag (shipped together with C5c.2 Le Dumpstère). Next: D2, the multi-level bank with a basement.

## C5c.3: THE COMPACTOR (nightclub) + PAWN-O-RAMA, built 2026-10-02
Blake's answers: the club gets a new lot and the restaurant stays; the theme is THE COMPACTOR; the pawn shop does fence plus pawn loans; build both before D2. ("Make this the most unique night club, do not hold off from detail.")

- **Where:**
  - THE COMPACTOR takes the whole Old Brick West South block on Crooked St, backing onto the rail yard. It replaces THE SWEATBOX's "club opening soon" shutter.
  - LAWYERS 4 LESS moved to the empty Uptown West block. The empty block keeps its place in the random sequence, so the blocks after it look the same as before.
  - PAWN-O-RAMA replaces THE DIVE's "bar opening soon" shutter in the Yards (Yards Rd). The bar can come back with Night & Life.
- **The building:**
  - An old trash-compactor plant: a double-height main hall (10 m) with a one-storey backstage wing on the west side.
  - A 22 m smokestack, with neon letters down its side and lasers off the top at night.
  - Tall factory windows that glow pink and teal.
- **The door:**
  - The front door is a garbage-truck hopper mouth with steel teeth and rubber flaps, with a velvet-rope queue on the pavement.
  - Big Crunch the bouncer lets in anyone who has paid the $15 cover at the rope (stamped till dawn) and VIPs (5+ aura, or carrying a VIP wristband).
  - Anyone else stepping into the doorway is put back on the pavement. If he's knocked out, the door's open to all.
- **Sneaky ways in:**
  - **The trash conveyor:** a moving belt (1.7 m/s) from the loading dock through a 1.3 m rubber flap in the west wall. Standing, the flap stops you; crouched, it carries you into the sorting room.
  - **The climb:** dock, then a bale, then the bale stack, then the back roof. From there, the maintenance door opens onto the VIP balcony.
- **The crusher-bed dance floor (7 x 8 m):**
  - It bobs with the beat (124 bpm, never above step height).
  - Every 75 s comes **THE DROP**: the floor builds up to 1.6 m over 6 s, holds, then slams down. Everyone on it is launched up at 12 m/s, along with any loose items, and confetti fires.
  - A giant ram over the floor comes down as the floor goes up.
  - The floor is a moving collision box. Its height depends only on the city clock and the time the drop started (`clubB`, synced), so the host, the client prediction and joiners all work it out the same way. Errors from lag are a few cm.
- **DJ Crunch's crane cab:**
  - It hangs over the north end of the floor, reached across the balcony.
  - Hijacking the decks (E, every 40 s) gives +3 aura and a roar (a 14 m noise), and starts the drop right away.
- **Inside the hall:**
  - A conveyor-belt bar that carries drinks round (E for neon fizz or glow sticks; restocks).
  - A back bar of glowing bottles, speaker stacks that thump, moving-head light beams, and a mirror ball made of 2,000 crushed cans.
  - Crushed-car-cube seats, a photo booth, posters, and the VIP "Bale Room" balcony (a booth to rummage).
  - A crowd: a few by day, the full crowd at night. They dance, put their arms up on the build and fly on the drop.
  - The bass can be heard through the walls.
- **Backstage:**
  - The sorting room: a sort bin, lockers, a forklift, recycling cages.
  - The green room: the DJ's rider ("only blue jellybeans"), a mirror with bulbs.
  - The stair room: staff stairs up to the back roof.
  - The manager's office with **the safe**. Hold E for 6 s (loud) for a bag holding $40 plus every cover charge paid that day. It sets off the alarm, gives 30 heat, and Big Crunch comes for you.
- **The roof:** a lounge with string lights, a "Dumpster Jacuzzi" and the **Golden Record** stash. It's reached by the service stair on the back roof.
- **PAWN-O-RAMA:**
  - "Honest" Sal (the shop's cashier, in a cardigan with glasses and a gold tooth) and his nephew Big Vinnie (a fighter).
  - **Fence:** E at the counter with something out: 40% of its value in cash right away (the end-of-day shop pays 50-75% plus haggling).
  - **Pawn:** E at the window case with something out: 30% now. The item sits in the case tagged in your colour. Buy it back before dawn for 40%; at dawn it goes on sale to anybody for 70%.
  - **Smash & grab:** 3 punches on the case. Everything in it spills out, the alarm goes, you get 25 heat, and Vinnie comes swinging. The case is fixed at dawn.
  - Dressing: a wall of guitars, a stack of tellies showing static, a suit of armour, a stuffed bear, a trophy shelf, bars over the counter, Sal's dog Collateral asleep in his basket. Outside: the three gold balls, "WE BUY ANYTHING* (*ALMOST)", "CASH 4 GOLD (AND SPOONS)", bars on the windows.
- **New loot:** glow stick (junk), neon fizz, rare vinyl, DJ headphones, VIP wristband, crushed-can mirror ball (heavy), the Golden Record (legendary).
- **Engine:**
  - `Box.pump` (a dance floor that follows the clock) and `Box.belt` (carries whatever stands on it).
  - `PropView.note` (the pawn case's contents, synced), `MatchView.clubB`.
  - The client runs the city clock on between snapshots.
- **Fixed on the way:** a lobby washing-line mesh flagged double-sided stopped a whole batch of city meshes merging (over 100 extra draw calls). The geometry is still double-sided, but the flag is now normal.
- **Tested (2026-10-03):** 189 shared + 2 client unit, matchmaking smoke 8/8, server smoke pass (44 NPCs), browser e2e 305/305 normal and 305/305 at 110 ms lag. Next: D2, the multi-level bank with a basement.
