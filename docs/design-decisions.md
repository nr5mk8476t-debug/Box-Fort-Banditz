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

## R2: the road-layout test (Blake's drawing), built 2026-10-07

Blake drew a new road layout and wanted to "just build the roads first, then make the game playable" to see how it feels before deciding anything else. So this is a **separate test map**, not a replacement: the classic city is untouched and is still what the server, multiplayer and every existing test use.

- **How to play it:** the published "Trashington Road Test" preview, or `?map=roads` on the dev client (solo / your own browser only). `setCityMap("roads2")` in shared code picks it before the city is built.
- **The roads (from the drawing; north is up, the forts at the bottom):**
  - An outer ring: West Rd and East Rd at x ±109, North Parade at z 104, the Service Rd at z -89 (above the highway and Tent Town, which are unchanged).
  - A double road along the north: Gold St at z 72, with a long thin block between it and North Parade.
  - Two inner avenues, Crooked St at x -77 and Diamond St at x 77, from the Service Rd up to Gold St. They stop there, so the top strip between Gold St and North Parade is one long block (as drawn).
  - Uptown Ave (z 45) runs from the west edge to Diamond St; Yards Rd (z -53) runs between the two avenues.
  - The park roundabout in the middle, with spokes west and east to the edge roads and a south spur (Mayor's Mile) down to Yards Rd. No road north of the park.
  - **The fork:** two diagonal roads from Uptown Ave (x ±43) to the ring's NW and NE points, making a Y with a triangle block north of the park.
  - Traffic lights where the avenues cross Uptown Ave, Yards Rd and the spokes; give way elsewhere; cars on the ring go first.
- **Diagonal roads are new:**
  - A road that isn't along x or z gets a segment surface (`ArenaLayout.roadSegs`) instead of a rectangle. `onRoadAt` checks them, so pedestrians, loot, junk and cops all treat them as road.
  - Crossings on a diagonal are turned to match. The stop lines and crossings where a diagonal meets a straight road are worked out from the angle between them.
  - The roundabout can now have any number of arms (the fork's two make five); the cop-car route along the ring splits each arc about every 30 degrees.
  - Walls are boxes that can't turn, so the pavement along a diagonal is 0.5 m steps underneath, with a smooth kerb strip drawn on top (looks only). Buildings along a diagonal are squares stepped along the road (a sawtooth frontage).
  - Pedestrians get walking routes along the diagonal pavements (the street grid's route lines only run along x and z).
- **The blocks are generated, not hand-made:**
  - The ground is worked out on a 0.5 m grid: every cell off the road is pavement.
  - Every road gets a row of plain buildings down each side behind a 4 m pavement (the diagonals first, so they get the corner lots). Shopfronts, parody signs, tier colours and heights work like the classic streets.
  - Any courtyard nobody could walk into loses its smallest building, so an alley opens.
  - Loot on the pavements, rooftop and courtyard stashes, bins, phone booths, vending machines, hydrants and street lights go along the rows.
- **Kept:** the park (fountain, pond, bushes, the taco cart), Tent Town and the 4 forts under the highway, the squat (lobby), and the police station (moved to the south-east block, its front on the Service Rd).
- **Left out for now:** every other landmark and walk-in shop (the bank, City Hall, the casino, Chinatown, Le Dumpstère, The Compactor, Pawn-O-Rama, the skate park, the rail yard and the canal). The map shows only THE PARK and TENT TOWN.
- **Not done yet:** the D2 bank work is parked on the `d2-bank-wip` branch (it has 3 failing tests and no client rendering yet). Picking it back up depends on whether the new layout replaces the classic city.

## R3: the new city (Blake's redesign brief + answers, 2026-10-08), steps 1 and 2 built 2026-10-08

Blake's brief: mirror the city left and right, make the four forts fair, clear the top road for big landmark lots, use angled and wedge buildings, put the police station and the pawn shop centrally in the low end, and name every road. His answers:
- forts on a curve, the map grown south to fit;
- this replaces the real city;
- real angled collision;
- Gahookz Ghetto Lane is the road above the forts;
- landmarks left out for now (he'll place each one with an in-game placement mode);
- the Bin Juice stub to Lefty Lane removed;
- police + pawn shop built now;
- empty fenced lots up north;
- I pick the remaining names;
- green street signs at the corners;
- a Chinatown and, mirrored opposite it, a Little Italy lane (asked for after the plan; not built yet).

**Step 1: angled walls (engine).**
- `Box.poly`: an upright prism on any convex footprint. `rotBox` (a turned rectangle) and `polyBox` (any convex shape) make them; x/z/w/d stay the bounding box for the broadphase.
- Every footprint test goes through `footSd` / `inFoot` / `footFaces`:
  - player collision (smooth sliding along an angled wall, standing on its roof, mantling);
  - thrown items (they bounce off the real face);
  - the cops' line of sight;
  - walkers and their route checks;
  - spray tags (a tag on an angled wall takes that wall's own normal);
  - the minimap.
- Plain boxes keep their exact old code paths, so nothing about the classic city changed.
- Rendered as flat-shaded prisms that merge with the city's boxes. Façades (windows, shopfronts, awnings, cornices, signs, tower crowns) work on every face of an angled building.

**Step 2: the new city ("new" map, now the default; `?map=classic` still builds the old one).**
- **Roads (all named, the whole network a mirror image):**
  - Lefty Lane and Righty Lane at the edges.
  - Gahookz Ghetto Lane above the fort bowl.
  - Snob Row along the top (the very top road is gone).
  - Leftovers Avenue and Write-Off Avenue, centred between each pair of forts (x ±66.33).
  - Bin Juice Boulevard (between the avenues only).
  - Mayor's Mugshot Mile east–west through the roundabout.
  - Shopping Trolley Terrace.
  - Dead-Centre Drive from the roundabout north to Snob Row.
  - Loose Change Lane south to Shopping Trolley Terrace.
  - Dodgy Cut-Through and Bank Run from the avenue corners straight at the middle of The Spin Cycle (the roundabout), so they meet it square on.
- **Blocks are generated on the west half and mirrored onto the east half.** Same shapes, heights, alleys, loot spots, bins and walking routes on both sides; only colours and shop names differ.
  - Buildings line every road. Along a diagonal they turn to face it.
  - Where a row runs into a diagonal or the roundabout it is cut into a wedge, a trapezoid or a triangle.
  - About 30 angled buildings.
  - Courtyards nobody could walk into lose their smallest building (an alley opens).
- **The fort bowl:**
  - The four yards are evenly spaced across (66.3 m apart), the outer two 7.5 m from the side walls.
  - The middle two sit deeper (z -112.3 against -102). The depth was tuned by measuring the real walk, not the straight line. A straight row would give the middle forts a 6 m head start.
  - A curved viaduct over the yards: looks only (no deck, no ramp, nothing to climb), with solid pillars on the ground.
  - The map runs further south (to z -128.8). The squat's tenement stands in the south fence between the middle yards.
- **Fairness, measured** (walking distance from each fort; outer W / outer E / middle W / middle E):
  - roundabout 134.9 / 135.4 / 134.9 / 134.9 m;
  - police door 118.0 / 118.5 / 118.0 / 118.0;
  - the middle landmark lot 229.5 / 230.0 / 230.3 / 230.3;
  - Bin Juice × Dead-Centre 196.9 / 197.4 / 197.7 / 197.7.
  - Within 1 m everywhere. (The 0.5 m east bias is the park's pond and the taco cart, which aren't mirrored.)
- **Police station:** in the middle of the long low-end block, now facing Shopping Trolley Terrace (the town side) with its door in the middle. Facing the forts it was 42 m from the middle forts against 104 m from the outer ones. Its car park behind opens onto Gahookz Ghetto Lane. (Step 3 gives it its own shape and back route.)
- **The north:** five empty landmark lots (W2, W1, C, E1, E2) behind 2.6 m plywood hoardings ("COMING SOON: SOMETHING EXPENSIVE"), too tall to climb.
- **Names:**
  - A green two-blade street sign at a corner of every junction, one blade along each road, readable from both sides.
  - Every road's name written along it on the map; districts that no longer exist are left off.
- **Kept:** the park, Tent Town's forts, the squat.
- **Not on the new map yet:** the bank, the casino, the nightclub, the restaurant, Chinatown, the skate park, Pawn-O-Rama, City Hall, the rail yard and the canal. Their code and tests stay, on the classic city (`?map=classic`); every classic-city unit test and the browser test run there.
- **Multiplayer:** an invite link now carries the host's `map`, so friends build the same city.

**Next (step 3), with Blake's answers (2026-10-08):**
- The police station gets its own footprint and back route.
- **Pawn shop:** at the bottom of Loose Change Lane, facing the police station across Shopping Trolley Terrace (a cops-vs-fence square on the centre line, the same walk from every fort).
- **Little Italy:** along Leftovers Avenue, and **Chinatown** along Write-Off Avenue (its mirror), each between Gahookz Ghetto Lane and Mayor's Mugshot Mile.
- The in-game landmark placement mode, for Blake to place the big landmarks on the north lots.

## R3.1 fixes (Blake, 2026-10-08)

- **See-through angled buildings:** the angled-building meshes were wound inside out, so the GPU drew only their inside faces. From the street you saw straight through them; only the window and shopfront planes showed. Re-wound so the outside faces out. A client test checks every triangle faces out of the prism (it fails on the old winding).
- **Blocky roundabout edge:** the pavement round the outside of The Spin Cycle is now 96 smooth curved pieces from the kerb out to 3.6 m, cut square where the roads leave the ring. The 0.5 m grid pavement starts behind them.
- **Pavement too wide:** buildings now stand 2.5 m from the kerb (was 4 m). The police station moved up with them, and its back stash sits in its car park.
- **Landmarks:** none added. Blake will design the big ones (bank, casino, club...) and I put them in.
- Fairness after the changes (outer W / outer E / middle W / middle E): roundabout 140.9 / 141.4 / 140.1 / 140.1 m; police door 122.4 / 122.9 / 121.6 / 121.6; middle lot 233.6 / 234.1 / 232.8 / 232.8. All within 1.3 m.
- **Next:** Little Italy (Leftovers Avenue) and Chinatown (Write-Off Avenue). Questions sent to Blake: matching stalls and loot, gates and lights, Little Italy extras, the parade.

## R4: Little Italy and Chinatown (Blake's answers, 2026-10-08)

- **Where:** Little Italy on Leftovers Avenue (west), Chinatown on Write-Off Avenue (east), both between Gahookz Ghetto Lane and Mayor's Mugshot Mile. They are mirror images of each other, shop for shop, so neither side of town is luckier.
- **Matching stalls, same loot value (answer 1):** the pizza cart and gelato cart match the dumpling steamer, the souvenir stall (mini gondolas, leaning-tower globes, a rare golden accordion) matches the trinket stall, and the deli counter (cheese wheels, salami) matches the seafood tank. A test checks each pair pays the same on average.
- **Gates and lights (answer 2, "super appealing"):** each end of Leftovers Avenue gets an arch in green, white and red, with bulbs, a LITTLE ITALY board on both faces and potted cypresses. Zig-zag festoon bulbs and laundry lines hang across the street. Chinatown keeps its gates and lantern rows, mirrored.
- **Extras (answer 3):** terracotta roofs, shutters, geranium flower boxes, iron balconies, wall lamps, striped awnings, café tables under umbrellas, a gelato cart. No fountain (Blake wasn't sure).
- **Every building its own setback:** buildings now stand 2.5 to 4.5 m back from the kerb, varying building to building (less variety inside the districts). Little Italy cafés stand 6.5 m back for their terrace of tables and umbrellas, with a street stall in front. To keep the varied gaps from opening short cuts that broke fort fairness, a 3 m brick wall runs down the middle of the long low-end block.
- **The festa (answer 4: options 2, 3 and 5):** a new city event, one of three each time, rolling up Leftovers Avenue the way the dragon parade rolls through Chinatown:
  - **The Giant Meatball Roll:** a rolling meatball with chefs behind. The ball flattens you; the chefs shove you aside.
  - **The Accordion Band March:** dance near the band and your stamina comes back fast.
  - **The Gondola-on-Wheels:** the gondolier splashes canal water every 3 s.
  - All three drop money every 2.6 m (golden meatballs, tip coins, golden roses), each worth what a red envelope is.
- Both events are on the new map's event list.

## R4.1: found in the screenshot review (2026-10-09)

- **The LITTLE ITALY board was blank:** the red frame behind it had a dark cartoon outline that poked out in front of the board and covered it. The frame is thinner now, and the boards hang a little further out.
- **Cars drove through the parades.** Traffic now gives way:
  - A parade's street closes from its warning onward: Write-Off Avenue for the dragon, Leftovers Avenue for the festa. Cars go round it. Where there is no way round, they enter going the same way as the parade, never against it.
  - Any car still in the street when the parade starts is towed to a quiet road elsewhere.
  - Cars stop for any part of a parade in front of them.
  - If a car going the parade's way is stopped just ahead of it (at a light, say), the parade waits for it.
- The dragon parade and the festa now warn for 10 s (was 5 s), so the street can empty first.
- Both routes now start and end just inside their street, not on the cross streets at either end.

## R5: HOT STUFF PAWN & LOAN, the police station's second storey, textures (Blake, 2026-10-09)

- **Chairs:** the café chairs now face their tables.
- **Where:** the pawn shop is dead centre, where the police car park was, back to back with the station.
  - Blake first chose to have it face the forts across Gahookz Ghetto Lane. That would have put the middle forts about 44 m away and the outer forts about 105 m away.
  - So it faces the station instead, across **Lou's Square**. You get into the square down a passage either side of the station from Trolley Street, so every fort walks the same distance (131.7–132.2 m).
  - The station is 2.2 m shallower to make room.
  - Its back is on Gahookz with a big neon roof sign facing the forts. The cruisers are gone from the car park.
- **Twitchy Lou** sits behind a barred window in a booth in the middle of the front. Walk up and press E to sell what you're holding, cash on the spot (40%, like Sal's counter).
  - **Secret list:** each scavenge he wants 3 things, picked from what's out in the city that day. He mutters the list only to whoever walks up to the window.
  - Bring him one and he pays **x3** its value. Only the first one of each counts, so the first bandit there wins.
- **Meat Locker:** enormous, 14 punches to knock out. He comes for you if you:
  - punch Lou (or hit him with something thrown);
  - throw stuff at the window;
  - smash the pawn case;
  - lift anything from the back room;
  - hang about at the window without selling (a warning at 16 s, then he comes at 24 s).
- **His punch:** out cold for 6 s, you drop everything, and you go flying.
- **Beating him:** knock him out and he's down for 40 s. The back room is unguarded meanwhile (Blake's reward pick); then he's back at his post with full health.
- **Inside:**
  - a shop floor wrapped round the booth, with a door each side;
  - guitars, a stack of tellies showing static, a stuffed bear;
  - the pawn case (pawn now, buy back before dawn, as at Sal's);
  - the back room shelves (pawn stock) and a safe.
- **Outside:** a flickering HOT STUFF neon flame, OPEN / OPE door signs, half-down roller shutters with tags, a sagging awning, barbed wire, a CCTV camera, graffiti, and the roof sign.
- **The police station (looks only):**
  - a second storey in stone, with the chief's corner office (blinds, a CHIEF O'NOTHING plaque);
  - a balcony with two flags, a lit TRASHINGTON PD sign, red and blue roof lights;
  - blue lamps by the door, planters, and a "HERE TO HELP (EVENTUALLY)" banner.
- **Textures (the whole city):**
  - Walls: 8 materials instead of 3: brick (stronger), whitewashed brick, stucco, stone, concrete panels, tile, corrugated metal, clapboard. They're mixed per building by area, with grime (soot at the foot, rain streaks, moss) on every wall.
  - Windows: 5 new styles (shutters, arched, blinds, curtains, boarded and cracked).
  - Roofs: tar-and-gravel roofs, vents, hatches, chimneys, antennas.
  - Ground floors: street ground floors without a shop get a little shop (a funny name, an awning), a roller shutter with tags, boards, or a front door with steps. About 1 in 6 of the other shops is shut, with its shutter down.

## R6: the real police station, the holding cell, the Champ, the pawn shop turned round (Blake, 2026-10-10)

- **Spotty shading removed:** the peel patches, speckles, tie holes, rust, rivets, drips, moss, roof blotches, stain blobs and brick chips are gone from the wall and roof textures. The base materials stay, but they're cleaner.
- **The station (after Blake's photo):**
  - Ground floor: brick wings with ribbon windows, a stone centre bay and a glass wall, and a canopy with POLICE letters over the door. No more bland blue.
  - 3 upper floors in stone, with window bands and a blue fascia, plus a glass entrance tower with a gold star. The upper floors are looks only (Blake's pick).
  - Red and blue lights, lamps, grass planters and a flagpole.
- **The helicopter:**
  - parked on a helipad on the roof, with POLICE on the side and its rotors turning (Blake's pick);
  - its searchlight sweeps the streets at night;
  - looks only.
- **Inside (walkable ground floor):**
  - a reception with a desk, a bell, wanted posters and a water cooler;
  - the breakroom, with coffee, donuts, a fridge, a vending machine, a sofa and a TV showing static;
  - one holding cell for everyone.
- **The holding cell:**
  - When you're busted you land in the cell and can walk about. The lockpick opens only when you press E at the cell door (Blake's pick); S or Esc steps away.
  - The toilet flushes back: the screen is covered in dirty water and everyone in the cell gets knocked back. There's a 6 s cooldown.
  - The shower has white subway tiles.
- **Daddy Jaquise:** not built. As described (a big Black prisoner, a bar of soap, dragged into the shower) it combines a racial stereotype with a prison-rape joke. Blake picked a replacement instead:
  - **The Champ:** an old prison arm-wrestling champion in an orange jumpsuit, with a gold belt and his golden spoon.
  - He takes about 25 punches, and one hit from him knocks you down for at least 6 s.
  - If he knocks you down he sits on you and does his crossword until you get up.
  - Knock him out and he drops **The Spoon of Destiny**: legendary, worth $2,500–4,000. Only the black market will buy it (not built yet). Lou and the fence refuse it.
- **Hot Stuff Pawn & Loan:**
  - It's turned round to face Gahookz Lane (Blake: he knows this is easier for the middle two forts and doesn't mind). The Lou-window fairness rule is dropped; all the other walks are still fair.
  - The brick no longer covers the entrances: the walls are built in pieces round the doors and the window.
  - Meat Locker: 30 HP (about 40 punches), chases at 7 m/s, 0.18 s windup, 0.45 s between hits, and he throws you harder.

## R7: two walk-in pawn shops, the grand station, police presence (Blake, 2026-10-10)

- **Two pawn shops:** one for the two forts on each side (Blake). Nothing in them can be robbed; they're only for selling.
  - Left: **HOT STUFF PAWN & LOAN**, run by Twitchy Lou, with Meat Locker on the door. It's where Hat Hut was.
  - Right, its mirror image: **FINDERS KEEPERS PAWN**, run by Sticky Fran, with **Cold Cuts** (Meat Locker's twin, the same in every way but the name) on the door.
  - Each owner has their own 3 wanted things (x3, first of each), and the two lists never overlap. They tell you the list when you walk up to the till.
  - Inside (from Blake's photo): glass counters you can see into (rings, watches, chains, old phones, coins) between you and the owner. Behind them, a slatwall crammed with junk (boomboxes, hats, pictures, keyboards, cameras, handbags), guitars, a moose head and a disco ball.
  - The window display: an arcade machine, a mannequin in a leather jacket, a stuffed bear, a drum kit and tellies showing static. Also a rug, a lamp, a ceiling fan and a bike on the wall.
  - Outside: a **suit of armour** on a plinth by the door, the three gold pawnbroker's balls, a neon sign, an awning, a lit roof sign.
  - The bouncer only comes if you punch the owner, throw stuff at them, or smash a glass counter (2 hits; it's mended at dawn). Hanging about or picking things up is fine. The old loitering rule and the back room are gone.
  - **Fairness (Blake picked "shift to balance"):** the only spot where both forts on a side walk exactly the same distance is in the middle of Leftovers Avenue. Moving the shop a block west just reversed the gap. So it stays on the Hat Hut plot, with its door round the corner on the avenue side, which is as close to even as that plot gets: 53.6 m from the outer fort, 46.9 m from the middle one.
- **The station** now runs right through the block, from Shopping Trolley Terrace to Gahookz Ghetto Lane (it took the old pawn shop's plot).
  - **Ground floor:**
    - the lobby: Officer Pam at the front desk (punch her and it's heat), posters, a crest, the stairs;
    - a hallway down the middle;
    - two interrogation rooms with one-way mirrors onto the hallway, hanging lamps and cameras;
    - the breakroom;
    - booking: a height chart, a camera, a fingerprint desk;
    - the holding cell tucked away at the back, its bars along the hallway, with subway tiles, the toilet, the shower and the Champ.
  - **First floor, walkable (up the stairs):**
    - cubicles with low partitions;
    - three offices (DETECTIVES (ASLEEP), RECORDS (MISPLACED), INTERNAL AFFAIRS);
    - the squad room (lockers, a whiteboard of suspects);
    - the chief's corner office (wood panelling, desk, nameplate, trophy fish, bookcase, rug);
    - the **evidence room**.
  - The floors above that, the roof and the helicopter stay looks only.
  - Picking the lock now lets you out the back door onto the Gahookz pavement.
- **The evidence room:** when you're busted, what you carry goes onto its shelves; the oldest bags go when it's full.
  - Anybody can lift it back (Blake's pick), but that's stealing from the police: +35 heat (just over 1 star), and any cop who sees, including the one guarding the room, comes for you.
  - Bags stay through the night and are cleared at dawn.
- **Police presence:**
  - 6 foot patrols (8 at night) walk the town's routes;
  - 2 cruisers drive round with their lights off (Blake's pick: foot and cars);
  - one cop walks the station's ground floor and one guards the evidence room.
  - They ignore anyone who isn't wanted. If they see you wanted (or see a crime), they chase like ordinary cops, then go back on patrol rather than going home.
  - Missing patrols walk in from somewhere nobody's looking. The patrols are on in the new city only.
- **The Champ:** punches 1 and 2 just nudge him back, and he turns on you. The 3rd inside 4 seconds makes him dizzy for 2.2 s and he spins. Knocking him out still takes about 40 punches.

## R8: glass doors, real windows, the chief's key, visual fixes (Blake, 2026-10-10)

- **Fixes:**
  - **Pavement turning into road (from far away):** the "draw the insides only when near" rule also caught pavement pieces whose middle fell inside the station or shops. Pavement, kerbs and plazas are never grouped now.
  - **Stairs "floored over":** the first-floor carpet ran across the stairwell. It goes round it now.
  - **Bouncers' "square and ring":** the apron logo and strap are gone (Meat Locker and Cold Cuts).
  - **The stairs:** moved 0.6 m in from the wall, with a stringer that rises with the steps, railings on both sides upstairs and a handrail.
  - **The lobby flag:** removed, and the chief's flag with it.
  - **Windows too black city-wide:** unlit panes are dusky blue-greys with a pale streak of sky, and the frames are lighter.
- **Real glass on the station:** see-through ribbon windows on the ground floor's front wings and right round the first floor. The chief's corner office has glass from 5 m to 8.6 m, to the corner on both sides. The walls are built round the windows and the outside skins are cut round them. Dark frames, mullions every ~1.6 m, stone sills. The two floors above are still painted windows.
- **Glass doors (Blake's pick: E opens and closes, NPCs open them):** the station's double front doors and each pawn shop's door.
  - A shut door blocks you; an open one swings aside. They stay how they're left and all shut at dawn.
  - Cops, bouncers and walkers open a shut door when they reach it; posted or idle people don't.
- **Four cops guard the station (Blake's pick):** one by the front doors, one walking the hallway, one outside the holding cell, one at the evidence room.
- **The chief's key (Blake's picks: "door opens 20 s, all walk out"; "once a day, heat to lift"):**
  - One key on the chief's desk each morning. Lifting it is +35 heat, like the evidence room.
  - E at the holding cell door with it: the cell door (its own section of bars now) swings open for 20 s, with a CLANK the cops can hear. The key is used up.
  - Anyone jailed who walks out while it's open is free where they stand, with 1 star (the jailbreak heat). Then the door shuts again.
  - The key stays wherever it is through the night. Pawn shops won't touch it ("A POLICE key?").

## R9: doors that shut again, cops you can see, a cleaner high end (Blake, 2026-10-10)

- **Station stairs:** one flight of the slate steps from the wall out (2.1 m wide). The old part next to the wall, its stringer, one slab and the second railing are gone. The handrail and its posts stand on the treads and slope with them.
- **Station front "plain blue":** the entrance tower's glass sat inside the box's outline shell, so from the front you saw only the navy box. It's in front now.
- **Windows sticking out (every building):** painted windows, wall skins, grime, entrances, shutters and shopfronts sit closer to the walls (windows 0.11 m out, was 0.22; skins 0.09). They still sit in front so they don't flicker.
- **The canopy:** the two low struts are gone. Tie rods run from the canopy's front corners up to plates on the wall 1.9 m above it.
- **Glass doors:** E shuts an open door again (the prompt says Close). Doors can't be smashed any more: the hidden door glass was being picked up as breakable shop glass.
- **Bodyguards' "apron":** the band was a body shape too short for its own width, which turned inside out. Meat Locker and Cold Cuts (and other big NPCs) get a round belly instead.
- **High end of town:** no shuttered shops and no grime; every ground floor there is a shop or a door.
- **Police you can see:**
  - 10 foot patrols by day and 14 at night, plus the 2 cruisers. A missing patrol walks in every 0.5 s from somewhere nobody's looking.
  - The 4 station cops always go back to their beat after a chase, opening the front doors on the way. A cop who goes missing is replaced whenever his spot is out of sight.

## R10: police from the start, a less bland station, signs on the walls (Blake, 2026-10-11)

- **"I can't see any cops":** they only came on duty once the match started (scavenge, dusk and night), so free roam in the lobby before ENTER had none at all. They're out in every phase now except the end screen: the foot patrols, both cruisers and the station's 4.
- **Nothing in the police station breaks:** benches, planters and glass in or on the station aren't smashable props any more. Only its door, the toilet and the cell door are props there.
- **The chief's doorway:** the wood panelling ran straight across the door opening. It stops at the doorway now and carries on above it.
- **Floating signs upstairs:**
  - The office and chief's door signs were inside the walls, showing as black boxes. They're on the wall faces now.
  - The task-force banner hung in the air over a waist-high partition; it's on the partition now.
  - The suspects whiteboard stands on legs.
  - The evidence signs sit on the cage and the wall.
  - Anything closer than about 0.02 m to a surface is hidden by that surface's black outline, so everything sits 0.06 m off.
- **Inside the station:**
  - Big grey floor tiles (1.2 m, grout lines, a little shade per tile) on the ground floor, and carpet tiles (0.5 m) upstairs.
  - A blue-grey band 1 m high with a dark rail round every wall on both floors.
  - The ground floor's own floor sits on the pavement now, which used to cover it (that's why it looked lavender).

## R11: NEON FEVER DREAM, the nightclub on Market Row (Blake, 2026-10-11)

Blake's brief: "a really cool night club... a neon fever dream. 3 stories high. all intricate floor plans... floor 1 the bar area, booths, dancing area; floor 2 an insane dancing area; floor 3 another dancing area... really insane music... Electronic dance music... a cool DJ." Mid-build he added: "add a little shape to the building so it's not just a square." His three reference pics: a brick corner club with purple uplights and a glowing corner lamp; a bar with LED floor waves, a starry ceiling and neon rings; a club with a big light rig, an LED wall behind the DJ and LED-lit steps.

- **Where (Blake's picks):** the whole Market Row block where BRICK & MORTAR and the two SEW WHATs stood (he called them "dumpling sow what and brick & mortar"), plus the three shops behind them and the alley: 29 x 26 m. He saw the marked-up aerial view and OK'd it first.
  - The six shops are gone. Their west-side mirror twins stay (the club isn't a building box, so the mirror test skips its plot).
  - The four alley loot spots move 18-34 m up the alley, so the east side keeps its loot.
- **Shape (Blake: "not just a square"):**
  - The south-west corner, at the crossroads, is cut at 45 degrees, with the front doors in the cut.
  - Floor 2 has a glass bay out over Market Row that you can stand in.
  - LIL PANDA's pavilion rises off the roof: a canopy on four posts and a glowing crown on top.
- **The levels:**
  - **Floor 1:** 6 m ceilings. The bar along the north wall, booths along the south and east walls, a dance floor under the atrium, speaker stacks.
  - **Floor 2:** 6.3 m up, a 6.8 m hall. DJ TRASH PANDA's booth against the east wall in front of the LED equaliser wall, two stages, the LED floor round the atrium, a catwalk across it, the light rig and lasers.
  - **The roof:** 13.5 m, open air. A glass floor over the atrium, LIL PANDA's pavilion, string lights, neon railings.
- **Seeing through (Blake: "being able to see down or up through all the floors would be really cool"):** a 10 x 10 m atrium up the middle.
  - From floor 1 you look up through floor 2 to the sky.
  - Floor 2 has glass railings and the catwalk across the void.
  - On the roof the atrium is a walkable glass floor: stand on it and look straight down two floors.
- **Stairs (Blake's pick: glowing stairs + mezzanine):** floor 1 to 2 along the north wall, floor 2 to the roof along the south wall. An LED strip on every step.
- **Getting in (Blake's pick: bouncer + cover):** $20 in-game cover at the rope, or walk in free as a VIP (5+ aura). The bouncer turns everyone else back at the front door and the east fire exit. The stamp lasts till dawn.
- **Inside it's "just a vibe" (Blake's pick):** nothing to steal and nothing breakable.
  - **B dances (Blake's pick):** any move stops it. Every 15 s dancing in the club is +1 aura, up to 3 a day.
  - **The bar (Blake's pick: glowing cartoon mocktails):** $8 gets 40 s of dance energy (stamina refills 2.5x and sprinting drains half). The drinks have silly names and no alcohol.
- **The music (Blake's pick: big-room house with drops):**
  - 128 BPM, made in code, no audio files. The set loops: 16 bars of groove, an 8-bar build (snare roll, riser, the kick drops out), then 16 bars of DROP (supersaw stabs, a lead hook, rolling bass, a sub boom).
  - It runs off the city clock, so every player hears the same bar and the lights land on the music.
  - Volume: outside, a muffled thump (a low-pass filter) that fades over 75 m; inside it's the full mix, loudest on floor 2.
  - On the drop: a screen shake if you're inside, confetti from the rig, smoke off the stages, and the whole crowd jumps.
- **The DJs (Blake's pick: headliner + rooftop DJ):** DJ TRASH PANDA, a raccoon in a cyan LED helmet, on floor 2; LIL PANDA (pink helmet) on the roof. Cartoon characters, not real DJs.
- **The crowd (Blake's pick: about 45):** about 15 on floor 1, 20 on floor 2, 10 on the roof, plus a bartender and a queue of 7 outside at night. By day only about a third are there.
  - They're scenery: instanced figures (a few draw calls for all of them) that dance to the clock. You can walk through them.
- **The look (Blake's pick: purple + blue, like his pics):**
  - **Outside:** dark brick, purple uplights up every pier, pink, purple and cyan neon trims, NEON FEVER DREAM signs over the door and down both streets, the corner lamp, a red carpet, brass posts, a velvet rope.
  - **Inside:** starry ceilings with neon rings, wall neon, LED floors redrawn about 20 times a second, the rig's chase and strobe, lasers.
  - **Night:** two sky beams off the roof, seen right across town.
- **Fixed on the way:** the client only took the server's movement state when the predicted position was off, so standing still it never picked up timers the server set (a mocktail's boost). It always takes it now.

## R11.1: NEON FEVER DREAM, a proper floor plan, DON BINNIE's lounge (Blake, 2026-10-13)

Blake: "the floor plan could look a little more interesting instead of just 1 big open room and a massive dance floor... downstairs more seating, curving red booth seats, little dance floor somewhere... a couple bars, make them curve around... pot plants... texture on the interior walls and the floors. The second story should be the main dance floor, more curved bench seating and a really fancy private area where a mafia boss is, heaps of really nice looking girls dancing around him, and 2 bodyguards." He sent a nightclub floor plan, a glowing staircase with a glass rail, and a club with tiered red booths behind railings.

(An earlier, interrupted pass at this request had left most of it in the workspace: the curved bars, booths, palms, textures and the lounge with two bodyguards. It's finished here to Blake's answers.)

- **Floor 1 (seating and bars):**
  - Curved red U-booths with gold piping and glowing tables along the south and west walls and by the fire exit.
  - The island bar under the atrium (Blake's pick): a ring of counter with a bartenders' gap, stools all round, and a tower of glowing bottles in the middle. You drink there looking up at floor 2 and the sky.
  - A long curved corner bar, THE FEVER BAR, in the north-east, with lit bottle shelves on both walls.
  - A small LED dance floor in the south-east with a turning mirror ball and speakers.
  - **Restrooms (Blake's pick):** MEN and WOMEN in the north-west corner, behind white tiles with neon signs. Each has a stall, a toilet, a sink and a mirror. They're scenery only (nothing to flush). The men's room's street window is frosted.
- **Floor 2 (the main dance floor):**
  - The LED floor wraps the atrium.
  - **The atrium is now an octagon (Blake's pick):** the corners are filled in, a glass rail runs round all eight sides, and the catwalk still crosses it.
  - Curved booths and benches round the floor, two round podiums, DJ TRASH PANDA as before.
- **DON BINNIE's lounge (north-east, floor 2):**
  - A raised platform with glass rails and a gold trim, a red velvet curtain, and a purple-and-gold throne booth with a gold table and a champagne-style bucket.
  - **DON BINNIE (Blake's pick):** a cartoon mob boss in a white suit with gold chains, slicked hair, shades and a cigar.
  - Eight glam dancers in sparkly party dresses dance round him (cartoon, fully dressed, scenery).
  - **His two bodyguards (Blake's pick: "guard the door"):** they shove out anyone under 8 aura (a VIP); 8+ walks in. Punch the Don and both come for you: one hit and you wake up on the pavement outside, with your cover stamp gone.
- **Textures:** red swirl carpet on floor 1, dark glossy tiles on floor 2 and in the restrooms, quilted velvet on floor 1's walls, panels on floor 2's.
- **Plants:** potted palms on both floors.
- **The stairs (Blake's pic):** a sloping glass balustrade with a gold handrail and a purple LED foot along the open side.
- **Nothing to pick up:** the street-junk generator was putting café chairs next to the club's tables. It skips the club now.

## R11.2: NEON FEVER DREAM, circulation first, then a lived-in club (Blake, 2026-10-14)

Blake: the restroom block got in the way of the stairwell. The stairs need a generous, obvious approach and a clear landing, and the toilets should be a separate powder-room corridor away from them. Then make the whole club layered, intricate and lived-in: zones, varied seating, purposeful clutter, richer materials, a lighting hierarchy and storytelling signs, without turning every surface neon. Keep the identity and gameplay.

- **The bug this fixes:** in R11.1 the store cupboard sat on the stair foot, and the restrooms pinched the approach. The R11.1 e2e only reached floor 2 because it teleported over them. Now a unit test walks the real route from the front door to floor 2.
- **Circulation (collision changes):**
  - **The stairs:** the run moved 1 m east, to x 77.0-86.9. The stair approach R(73.9-81.5, 24.6-32.2) must be free of solid boxes, and so must the floor-2 landing R(86.9-92.9, 27.4-32.2). Both are tested.
  - **The powder-room corridor:** the restrooms moved to the south-east, behind a corridor wall at x 96.9, far from the stairs (every room is more than 8 m from the stairs and their approach; tested). MEN and WOMEN each have a door off the corridor, a stall, a toilet, a sink, a mirror and frosted street windows. A cleaning cart is parked at the corridor's end.
  - **The fire exit route** along the east wall stays clear (tested).
- **Floor 1 zones:**
  - **Entrance:** the host stand (lamp, tablet, wristbands, guest list); the coat check closet with a hatch, coats and a bell; the HOUSE RULES board and the club's own branding board.
  - **The booth tier:** along the south wall, up one step behind brass rails with smoked glass, with two step gaps. Three curved booths sit on carpet, with table lamps.
  - **The west booth pocket and the east pocket:** carpeted and darker, lit by candles.
  - **The bars:** both bars are unchanged in play. They're dressed with glasses, bottles, napkins, candles, warm pendants and a mocktail menu board. Kegs and crates are stacked behind THE FEVER BAR, with a STAFF ONLY door.
  - **The little dance floor and stage:** moved slightly to clear the corridor, with speakers either side.
- **The stair arrival:** brass inlays in the floor at the stair foot and on the landing, warm downlights, warm step lights up the stair wall, art on the wall, and signs: UP: THE MAIN ROOM + ROOFTOP at the foot, WELCOME TO THE MAIN ROOM at the top, and ROOF -> DOWN THE FAR SIDE.
- **Floor 2:** flight cases stencilled TRASH PANDA WORLD TOUR stand by the DJ, with cables and speaker stacks, spotlights on the DJ and the stages, and NO PHOTOS and VIP boards. The bay window has a drinks ledge with stools.
- **Lighting hierarchy:**
  - Warm table lamps and candles in the booths, with darker pockets around them.
  - Saturated uplight washes on the walls.
  - Fewer neon wall lines than R11.1 (two instead of a full set), leaving dark negative space.
  - Strong orientation light at the stairs and green EXIT signs at both exits.
- **Renderer only:** all the clutter (drinks, buckets, menus, wristbands, art, signs, cables) is scenery, merged by colour, with the glassware in one translucent mesh. The only new collision is the coat check, the host stand, the tier with its rails and steps, the corridor walls and fixtures, the kegs, crates, cases and the bay ledge, and none of it is on a route.
- **Kept:** the island bar, THE FEVER BAR, both dance floors, the DJs, DON BINNIE's lounge and his guards, the roof, the cover charge and the mocktails.

## R11.3: NEON FEVER DREAM, a bigger bar, a second bay, the Don by the windows, a social roof (Blake, 2026-10-14)

Blake asked for:

- Floor 1: get rid of the corner bar; make the island bar almost double the size and move it back; make the dance floor more central (fine if it touches the island bar).
- Floor 2: the jutting window with stools on the other side too, plus a fix for the little wall blocking the way into the first one; DON BINNIE moved to the back, by one of the windows, with a bigger area.
- Stairs and roof: the glass side rail on the stairs to the roof too; the roof turned into a social area with another island bar, visible speakers, the DJ more central, plants, seating and a smoking-area vibe.
- Bugs: textures that only load up close, and carpet cutting off the view on the stairs.

His answers:

- The Don's lounge goes by the south-west windows.
- The second bay is the east wall's mirror of the west one, and TRASH PANDA moves to the north-east corner.
- The smoking area is vibe only.
- The island bar is about 9 m across and 3 m back.
- LIL PANDA goes in the middle of the roof's back edge.
- The roof stays open-air, with pergolas.

### Floor 1

- **The bars:**
  - The corner bar, its shelves, kegs and crates are gone. The north-east corner is now a booth nook, with the staff door kept.
  - The island bar is THE FEVER BAR: 9 m across (5.8 before), 3 m further back, with a 2.3 m bartenders' gap at the north.
  - Inside the counter there's a ring of back-bar shelves lined with bottles round a bigger bottle tower, with the menu board on the tower.
- **The dance floor:** 8.2 x 5.7 m (6.3 x 4 before), centred on the room. It sits just south of the island, and the bar stools touch its edge. The speakers flank it.

### Floor 2

- **Both bays:**
  - The west bay's opening is cut clean through the shell. The bug: the floor-2 band stood 0.6 m above the floor across the bay, so you couldn't step in.
  - The east bay mirrors it over the alley, with the same glass, frame and stool ledge.
  - The floor-2 booth that sat in the west bay's mouth moved north.
- **DJ TRASH PANDA:**
  - He's in a raised triangular booth in the north-east corner, turned to the floor, so he's what you see coming up the stairs.
  - LED equaliser walls run on both walls of his corner, with his name across it, a desk across the corner, and speaker stacks at the two ends. The lasers come from his corner.
  - A podium took the old DJ spot on the east side.
- **DON BINNIE's lounge:**
  - It's in the south-west, along the side-street windows, the far side of the room from the stairs. It's 14.5 x 5.8 m less the cut corner (about 75 m², 53 before).
  - It's raised, with red carpet and glass and gold rope rails. The rope's gap faces the room, with his two boys either side.
  - His throne has its back to the windows and faces the room. Velvet curtains run down the cut corner's blank wall, with drapes tied back at the windows.
  - The glam dancers move with him.
  - The shove-out rule (under 8 aura) now only applies on floor 2. The bug: the lounge's rectangle also covered the roof above it.

### The stairs

- The stairs to the roof get the same sloping glass balustrade, gold handrail and purple LED foot as the first stairs.
- **The stairs bug:** the starry ceilings ran right across both stairwells at head height (that's the "carpet" cutting off the view). They're cut round both stairwells now.

### The roof (open air)

- **The DJ and the dance floor:** LIL PANDA's pavilion is in the middle of the back edge, facing the glass floor, which is the dance floor now. Speaker cabinets stand on poles either side of him.
- **The SKY BAR:** an island bar on the west under a timber pergola, with pendants, the second mocktail tap and its own menu.
- **Seating and lights:**
  - Lounge booths along the east.
  - Booths and little tables with umbrellas in the south-west.
  - String lights across the dance floor and round the pergola.
  - Plants all round.
- **The smokers' corner (north-east):**
  - A fire pit ringed by a curved bench, two patio heaters with warm pools of light, and ashtray stands.
  - A SMOKERS' CORNER sign ("FRESH AIR. ALLEGEDLY.").
  - Nobody is shown smoking.

### The textures bug

- The club's floors, walls and ceilings were boxes with ink outlines, and the textured surfaces sat a few cm in front of them.
- The outline shells won the depth test at shallow angles, so a floor only showed its texture when you looked down at it up close.
- The club's texture materials now get the same polygon offset the city's facade planes use. The lounge's carpet sits clear of its platform's shell.
- The surfaces are merged per material and always drawn, not just within 100 m. The patterns are bolder, with anisotropic filtering.
- The carpet pockets are cut out of the tile, not laid 1 cm over it.

## R11.4: NEON FEVER DREAM, the flicker fix, a walled restroom wing, the back EXIT, SKETCHY STEVE's alley (Blake, 2026-10-18)

Blake:
- Fix all the visual and flickering glitches in the nightclub, especially the roof turning from textured to plain colour.
- Make the toilets a room and hallway you open a door to get into, so you can't see the white subway tiles from the bar, and make the area bigger for future stuff.
- Enclose the open back doorway.
- Add a green EXIT door under the stairs that leads out to a back alley, where there's a drug dealer selling funny drugs with temporary buffs (speed, strength, flying). You can only exit through that door, never enter.
- He sent two back-alley photos for the look.

His answers:
- The dealer is a trench-coat raccoon.
- Fly means floaty jumps.
- Strength means punch plus carry.
- $15 each, with a comedown, and heat if a cop sees.
- The wing has a hallway, two restrooms and a spare room.
- Doors open with E.
- The alley is dim and gritty.

### The flicker

- **Cause:** every box in the club had an ink-outline shell (an inflated copy, 5 cm out). The textures sat inside or just past it:
  - floor 2's tiles 5.5 cm up;
  - the starry ceilings 2 cm under the slabs, inside the shell;
  - the wall panels 6 cm out;
  - the roof's LED 6.5 cm up.
  So the two fought for the same pixels, and which won changed with the angle.
- **Fix:** no outline on the club's floors, ceilings, platforms, stairs and inner walls. The wall panels now sit 10 cm out and the ceilings 6 cm under the slabs, with the neon rings below them. The textures keep R11.3's polygon offset.
- **The roof:** it was LED in places and a plain deck elsewhere, with a plain gap east of the glass floor. Now:
  - the gap is LED;
  - the rest of the deck is timber decking;
  - the parapet's inside is dark brick.

### The restroom wing

- 7 x 14.4 m on the east side, where the fire exit was. The booth tier is 1.3 m shorter to fit it.
- A door off the dance floor leads into a hallway with warm lights, a black-and-white floor and a POWDER ROOMS sign outside.
- Off the hallway, each behind its own door:
  - MEN and WOMEN, each with two stalls (open doors), a row of sinks under a mirror, and frosted windows;
  - an empty spare room marked PRIVATE, for later.
- Subway tile only inside; velvet and a smoked mirror on the outside.
- The doors are real: E opens and shuts them, NPCs open them, and they shut at dawn. The solid ones are painted panels with a brass knob.

### The back EXIT

- The east doorway is bricked up.
- **Under the stairs:** the stairs' top treads now float (steel stringers under them), so the space under their high end is open.
- **The door:** a green steel EXIT in the north wall there, with a push bar on the inside only, a green sign and glow, and a frame. Outside it says FIRE EXIT KEEP CLEAR, with a warm cage lamp.
- **How it works:**
  - From inside, E pushes it open, and it swings shut by itself 3 s later (it won't close on someone in the doorway).
  - From outside there's no handle ("EXIT ONLY"), and NPCs won't open it from that side.
  - Anyone who's come out can't slip back in while it's open: they're stopped in the doorway.

### The back alley and SKETCHY STEVE

- **The alley (between SPECS APPEAL and HAIR FORCE ONE):**
  - Wet dark concrete with puddles.
  - Fire escapes up both walls, with drop ladders hooked up.
  - Pipes and a duct, two dumpsters, bins, a crate stack, trash bags, cones.
  - Graffiti: STEVE WUZ HERE, TRASH PANDA, FEVER 4 EVA, NO COPS.
  - Warm lamps over the EXIT and over Steve, and a cold blue light at the far end.
- **SKETCHY STEVE:** a cartoon raccoon in a trench coat and fedora. He holds the coat open on a purple lining of glowing goods, and stands behind a crate with an open briefcase ("PSST. NO REFUNDS").
- **The goods:** obviously made-up cartoon power-ups, nothing real-looking. E on one buys it for $15:
  - ZOOMIES (glowing gummies): 20 s at 1.5x speed.
  - BEEF JUICE (a can): 20 s of strength. Heavy loot carries at full speed, with sprint and dodge. Punches land twice as hard (knockback and stuns 1.8x longer; a player's stagger 0.6 s).
  - FLOATY FIZZ (soda with a balloon): 8 s at 35% gravity, slow falls, and up to 3 jumps in mid-air.
- **The catch:**
  - When the last one wears off, a 4 s comedown: legs at 65%, a wobbly, hue-shifting screen.
  - Buying while a cop can see you adds heat (6), and Steve legs it.
  - Steve also runs whenever a cop comes within 14 m with a line of sight, and if you hit him. He hides up the alley for 25 s, then comes back. No deals while he's gone.
- **HUD:** what you've got and how long it lasts, plus your mid-air jumps left.
- **Sync:** the server's player schema was at Colyseus's 63-field limit, so the four timers and the jump count ride in one packed number ("bf", to 0.02 s).

### Also fixed

- DON BINNIE's bounce message used to fall through to the restaurant's ("Do you have a reservation?"). It's his own line now.
- A teleport (the debug tools, jail) no longer wipes a mocktail's or the goods' timers.

## R11.5: NEON FEVER DREAM, textures everywhere, warm timber slats, smooth booths, a smaller restroom wing (Blake, 2026-10-18)

Blake:
- Every wall and floor area should have some texture: "i don't wanna see any plainness".
- He sent a staircase photo with vertical timber slats and wants them in the club.
- Get rid of the weird boxes on the booth seats.
- The restroom wing feels too big. Delete the spare room, keep the bathrooms, and move the hallway's door off the wall facing the island bar.
- (Fire escapes and more back alleys come next, in R12.)

His answers:
- Textures in the club and its alley.
- Slats on the stairs' open side, on feature walls, round the lounge and the bars, and as booth screens.
- Warm timber.
- The wing's door on its north side, with the wing shrunk to MEN + WOMEN.

### Textures

- Every box in the club and its alley now gets a material picked from what it is (`clubSkin`). The 14 canvas skins are wood, panel, concrete, stair tread, marble, grille, fire-escape steel, dumpster, crate, plaster, ceramic, velvet, timber and asphalt.
- The UVs are box-mapped in world space (`worldUV`), so the pattern stays the same size on every box and runs on across joins.
- Boxes that share a skin are merged into one mesh per material, so the draw calls stay low.
- The alley's ground is wet asphalt rather than a flat colour.

### Timber slats

- Warm timber battens, about 5.5 cm wide at 15-20 cm centres, held by a rail top and bottom, with a thin warm LED strip in every sixth gap. They go:
  - up the stairs' open side, from the floor to floor 2, and on to the roof on both flights;
  - round the island bar's front;
  - along the lounge's north and east edges (its way in is still open);
  - as screens between booths: four on floor 1 (two across the booth tier, one by the west booths, one by the north-east booth) and one on the roof;
  - on the feature walls: the floor-1 north wall west of the stairs, floor 2's stair wall, and the foyer either side of the front door.
- In the shared world they're thin solid walls (`deco: "slats"`), so you can't walk through them and the walk grid knows about them. The slats themselves are drawn by the client.
- The signs, sconces and art in front of them moved out a little, so nothing is buried in the timber.

### Booths

- **The weird boxes:** they were the ends of the backrest's box segments, sticking out past the seat's curve.
- **Fix:** every curved sofa (the booths, floor 2's benches, the Don's throne and the smokers' bench) is now one smooth curved mesh: a seat ring plus a shorter, thinner backrest, with gold piping along its top. The old boxes still exist for collision but are hidden.

### The restroom wing

- The spare room is gone. The wing now runs from z 6.6 to 15.4, about 8.8 m long: a hallway, then MEN and WOMEN with one divider between them.
- The wall facing the island bar (west) is solid now. The wing's door is in its north wall, at the hallway's end, with the POWDER ROOMS sign over it.
- There are four club doors now: the wing, MEN, WOMEN and the EXIT.

## R12.1: THE SOGGY SHAMROCK, the Irish pub across from the club: the ground floor, split the G, the session (Blake, 2026-10-21)

Blake:
- "Let's start working on the mirrored side to the night club, which will be an Irish pub."
- Two levels. The bottom level is a cool pub experience where you have to split the G.
- Irish themed, with Irish music playing. "Ask me loads of questions."

His answers (16 questions):
- **Where:** half the block, the row facing the club (CHEESE LOUISE, BREAD PITT BAKERY and BRICK & MORTAR go). SPECS APPEAL, FANCY-ISH FLOWERS and OLD TIMEY BARBER stay behind the alley.
- **Name:** THE SOGGY SHAMROCK. The stout is GUZZLE'S Extra Stout, a parody.
- **Split the G:** hold and release. Win cash and the pub's cheer, and get on the chalkboard of the match's best splits.
- **Drink:** a $6 pint, with a mild cartoon wobble from the 3rd one.
- **Upstairs:** a function room with a céilí floor, a games room (pool, darts, no arm wrestling), a whiskey snug and a beer garden balcony.
- **Music:** a live trad band.
- **People:** the barman, the old regulars, the G-split champ and céilí dancers.
- **Look:** an old Dublin pub.
- **Fun:** a pub brawl, darts, a physics pool table and a pub quiz (free).
- **Hours:** always open.
- **Order:** three slices, the pub before the alleys. R12.1 is downstairs, the bar, split the G, the band and music, the barman and the regulars. R12.2 is upstairs, the dancers, darts and pool. R12.3 is the brawl, the quiz and the champ. The alleys and fire escapes move to R13.

### The building

- 12 x 27 m, two floors: floor 2 at 4.6 m, the roof at 9.0 m.
- The south-east corner, at the crossroads, is cut at 45 degrees with the front door in it. The doorway is open, with two green doors folded back.
- **Outside:**
  - a painted green shopfront on both street sides: green-tiled plinth, pilasters, a fascia with THE SOGGY SHAMROCK in gold leaf, and a cornice;
  - window boxes of flowers;
  - a hanging sign with a cartoon shamrock;
  - lanterns by the door;
  - a chalk A-board ("GUZZLE'S $6 · SPLIT THE G · WIN $15 · LIVE TRAD NIGHTLY");
  - red brick upstairs.
- **Inside:** mahogany panelling to the dado, dark green damask above it, a pressed-tin ceiling between dark beams, oak floorboards, and brass pendant lamps with green shades. It gets warmer and brighter at night.
- The shops' loot spots move into the alley behind.

### Downstairs

- **The bar:** a long mahogany bar down the alley wall, 13 m with a return at the south end.
  - A brass foot rail and raised panels.
  - The back bar has three shelves of bottles in front of an old smoked mirror, with THE SOGGY SHAMROCK and WINES & SPIRITS on its carved crown.
  - Two GUZZLE'S taps: black handles with a cream band and a gold G.
  - Bar stools with leather tops, and pints on beer mats.
  - The lane behind the bar is open at its north end.
- **The snugs:** three along the street windows. Each has a leather bench, mahogany partitions with stained glass above (a shamrock in the leading), a little table and a lamp.
- **The fire:** a stone chimney breast on the north wall with flickering flames, a mantel (candlesticks, a clock), a picture above it, two leather wing chairs and a rug.
- **The session corner:** the band's bench by the fire with their table of pints, an upturned flat cap for tips, and a THE RUSTY BIN LIDS ~ LIVE TRAD sign.
- **Tables:** three barrel tables down the middle.
- **The stairs:** up the alley wall to a landing, with turned spindles and a handrail, a newel post with a brass ball, and a banister round the stairwell upstairs.
  - The stairs are roped off at the foot ("CEILI NIGHT SOON") until R12.2. The rope is a hidden wall to head height.
- Nothing in the pub breaks, and there's no street junk inside.

### Split the G

- **Buying:** E at a tap gets a pint of GUZZLE'S for $6, and a close-up of the glass comes up.
- **Gulping:** hold the mouse (or SPACE) to gulp, and the line where the black meets the cream drops. It drops faster the longer you hold, and each pint has its own gulp rate (0.06-0.11). Let go when the line's on the G's bar.
- **Scoring:** the World works out where the line stopped with the same sum the close-up draws, from how long you held.
  - Within 4 mm is a perfect split: $15, the room cheers and the band throws in a run.
  - Within 12 mm is close and gets your $6 back.
  - Anything else misses.
  - A pint left more than 30 s goes flat, and walking away from the bar leaves it.
- **The chalkboard** over the back bar shows the best 5 splits of the match (name and mm). It syncs through the board's prop note and is wiped at the start of every match.

### Tipsy

- Every pint adds 45 s to a sober-up timer (3 minutes at most).
- From the 3rd pint your steering drifts in a slow sway, up to 0.3 rad at 6 pints, fading out over the last 20 s. The screen sways a little too, and the HUD shows PINTS n.
- The drift is worked out from the sober-up timer, so it's the same on the host, in prediction and on every machine (tested).
- After 6 pints Fergal cuts you off until you've sobered up.
- The timer and the pint count ride in the packed "bf" buffs field (the player schema is still at its limit), and they survive a teleport.

### The people

- **FERGAL the barman:** a black waistcoat, a white apron, ginger mutton chops and a cloth on his shoulder. He pours, judges your split ("Now THAT'S a split!") and cuts you off.
- **The regulars, on their stools at the south end of the bar** (no box under a sitting person):
  - Old Mossy: tweed, a flat cap, a white moustache.
  - Noreen: a purple cardigan, white curls, round glasses, pearls.
  - They tell tall tales about Trashington and sip their pints.
- **THE RUSTY BIN LIDS,** seated on their bench and playing along: fiddle, tin whistle, bodhrán and banjo.

### The music

- "The Bin Lid Jig": an original jig in D, 6/8 at 116, AABB over 32 bars, made in code like the club's set and run off the city clock.
- The tin whistle and fiddle play the tune, with the jig's lilt and the odd cut.
- The banjo vamps the chords. The bodhrán thumps on 1 and 4 with light taps between.
- It's loud inside (loudest by the band), muffled from the street, and quiet upstairs.

### Load time

- The pub's furniture and dressing (about 1.5-3 s on the CPU-only test box) are built once you're within 100 m, not while the city loads. The brick shell is there from the start.
- In the browser test, the friends who join drop to Performance mode once they're in, like the host. On this box the 4th window still didn't load within 25 min in the last 3 runs; see the test plan.

### Next

- **R12.2:** upstairs: the function room with a céilí floor and dancers (walk on and you join in), the games room (darts for cash, a physics pool table), the whiskey snug and the beer garden balcony. The rope comes off the stairs.
- **R12.3:** the pub brawl, the pub quiz and the G-split champ.
- **R13:** the back alleys and fire escapes.

## R12.1b: THE SOGGY SHAMROCK rebuilt: the whole block, a Temple-Bar-style front, a horseshoe bar, glossy mahogany, clutter, drinkers (Blake, 2026-10-22)

Blake sent photos: Gilhooley's back bar with lit stained-glass beer signs, The Gopher's arched gantry and tufted booths, and Temple Bar's red front. He asked:
- Make the bar a bit bigger.
- Make the outside like Temple Bar, the red building, and nothing like the club. Less blocky, bits that jut out, heaps of detail.
- One wall between booths, not two.
- More clutter: "really lived in, well decorated, but don't make it seem blocky or generated."
- Darker wood, with "that nice glossy mahogany feel".

His answers:
- **Size:** the whole pub gets bigger, taking the whole block. The bar is an island horseshoe.
- **Back bar:** lit stained-glass signs, an arched gantry with glowing shelves, mirrors and adverts, "and heaps more".
- **Inside:** milk-glass globe lamps; high-backed tufted booths; worn boards with mosaic tiles; all four kinds of clutter.
- **People:** more real NPCs (about 8, who live there).
- **Outside:** pillar-box red with gold on black; flower baskets, fairy lights, lanterns, bays and a corner canopy, and an outdoor drinking spot. Old brick upstairs with white sash windows.
- **Band and doors:** the band in a downstairs corner (a little stage). The corner door plus a side door.
- **Order:** the same as planned.

The name stays THE SOGGY SHAMROCK. Every brand is a parody: GUZZLE'S, KILLKENNEL, HARPY LAGER, O'BINLID'S, SMITHEREENS.

### The building

- 29 x 26 m, the whole block like the club, with floor 2 at 4.8 m and the roof at 9.4 m. SPECS APPEAL, FANCY-ISH FLOWERS and OLD TIMEY BARBER go, and so does the alley between the two rows (it carries on behind). Its loot moves up the alley.
- It has three street fronts: south (the side street), east (facing the club across Market Row's mirror) and west (the far avenue). The north wall backs onto the alley.
- The main door is in the cut corner at the crossroads. There's a side door on the side street.
- **The shell:** it now has the shopfront's proportions. A plinth, big windows between piers, a 2.2 m fascia band, then separate 1.1 m sash windows upstairs instead of a ribbon of glass.
- **Bays:** six bay windows jut 45 cm over the pavements (two on each street front). Their panelled bases are solid.

### Outside (Temple Bar, not the club)

- **The shopfront:**
  - glossy pillar-box-red panels on a black skirting;
  - pilasters with bases, black-and-gold capitals and fluting;
  - small-paned windows with a transom;
  - a black fascia with THE SOGGY SHAMROCK in gold leaf and a red "1" roundel each end;
  - console brackets, a dentilled red cornice, and a trough along the top spilling flowers and trailing ivy.
- **The bays:** red frames round small panes, with lead roofs.
- **Upstairs:** weathered brick and white sash windows (a meeting rail, glazing bars, cream sills and lintels). Flower boxes sit on most windows, hanging baskets between some, and a cream stone cornice runs along the top.
- **The corner:** red doors folded back, a black hood canopy with a gold edge, and a two-faced clock on an iron bracket.
- **The side door:** a red door with a SIDE BAR fanlight and a brass plaque.
- **The rest of the outside:**
  - a blue history plaque ("Fergal's da poured his first pint here, 1888");
  - the shamrock hanging sign;
  - iron lanterns on brackets;
  - fairy lights draped in sagging strings across all three fronts, which twinkle and brighten at night;
  - chimney stacks with pots on the roof.
- **The pavement:** two GUZZLE'S parasols over barrel tables, with a drinker at each, and a chalk A-board. Nothing out there breaks or gets street junk next to it.

### Inside

- **The horseshoe:** an island bar in the middle (11 x 8 m) in near-black glossy mahogany. Mahogany and leather skins now have specular highlights.
  - Rounded corners (smooth curved pieces), a bullnose top overhanging the customers' side, raised panels and pilasters on the front.
  - A brass foot rail on posts and a mosaic tile strip round its foot.
  - A staff flap at the back. You can walk in, and Fergal works inside.
  - Stools all round: turned legs, a brass ring, tufted tops.
  - Three tap towers, two on the front and one on the east side, each with GUZZLE'S (black, gold G), KILLKENNEL (red) and HARPY (gold) handles.
  - An overhead rack of upside-down glasses over the front.
  - The bar top is cluttered with beer mats, full and half-drunk pints, candles in bottles, peanuts, a bell and menus.
- **The gantry in the middle:**
  - three arched bays on each face, with backlit shelves of bottles (and mirrors at the back);
  - turned columns with brass rings and a carved crown;
  - the lit stained-glass signs on top: GUZZLE'S EXTRA STOUT, KILLKENNEL RED ALE, HARPY LAGER;
  - the chalkboard of the best splits in the front's middle bay;
  - a brass till on the back counter.
- **The snugs:** four down the west wall. Each pair shares one partition: glossy mahogany below, leaded stained glass above, a turned post with a brass ball at the end. Tufted oxblood leather benches line both faces, with high padded backs. Each snug has a table against the wall, a brass wall lamp with a red shade, a pint and a candle.
- **The fire:** in the north wall's middle, with a mahogany surround and an over-mantel mirror. Leather wing chairs with rounded arms, a rug, a side table with a newspaper, a coal scuttle and irons.
- **THE RUSTY BIN LIDS' stage:** in the north-east corner, raised 30 cm with a brass nosing. A painted backdrop on two walls, the band on stools, a guitar case, the tips cap and a table of pints.
- **The stairs:** along the north wall, rising west, with spindles, a handrail and a newel post. Still roped off ("CEILI NIGHT SOON").
- **Seating and lamps:** a tufted window seat along the east windows with little round tables and chairs, and six barrel tables (bulging staves, hoops). Milk-glass schoolhouse globes hang everywhere.
- **The walls are packed:**
  - **Hung on them:** crowded frames of every size (jittered, never in rows), parody tin signs, gilt mirrors, a big FERGAL TIME clock, a dartboard on a mahogany backboard, a fiddle, crossed hurleys and a bodhrán.
  - **On a high shelf:** jugs, books, whiskey jars, trophies and a ship in a bottle.
  - **From the ceiling:** green-white-orange bunting, an oar, a bicycle and copper pots by the fire.
  - **By the doors:** LADIES · GENTS doors (they go nowhere yet), coats and caps on hooks by the side door, an umbrella stand, and a tiled name at each door.
- **Surfaces:** pressed tin between dark beams on the ceiling, and darker worn boards on the floor.

### The drinkers

- Eight new NPCs ("patron"), posted where they live: one leaning on the bar's front, one on a stool, two in the snugs, one at a barrel table, one in the window seat, and two out at the parasols.
- Each has their own look:
  - a hooped jersey;
  - a red coat with long hair;
  - a big cable-knit with a beard;
  - a beret and scarf;
  - a flat cap and tweed with a moustache;
  - a denim jacket with glasses;
  - a suit with a loose tie;
  - a yellow raincoat.
- They chat, cheer when anyone splits the G (with the regulars and Fergal), and yell if you knock them. A posted person has nothing solid under them (tested).
- Posts now carry a seat height, so stools, benches and the stage all sit right.

### Load time

- The pub's dressing is still built only once you're within 100 m, and almost everything is merged per colour or material (globes, fairy lights, glows, stained glass, textures). Bottles are instanced.

## R12.2: THE SOGGY SHAMROCK upstairs: the function room, the céilí, MAMMY MOLONEY, the corner balcony; no chest squares (Blake, 2026-10-24)

### Standing rule: no chest squares

- Blake: "from now on when your making characters. Stop adding the weird squares objects on their chests."
- Characters get **no flat boxes or plates on the chest or front**: no vests, shirt panels, ties, badges, tee prints, aprons or buttons. Shape comes from the body, scarves (tori), sashes, shawls, skirts, hats, hair and props instead.
- Every existing character had them removed. The NPC renderer throws away any part with one of those names (a `NO_CHEST` list). This also catches a part someone adds later under an old name. The player's chest patch is gone too.

### Upstairs layout (always open; the rope is gone)

- **The function room** at the front (the street side), under a tin ceiling with dark beams and red damask above mahogany wainscot. It holds:
  - a parquet céilí floor (13 x 11 m) with a shamrock inlay and brass edging;
  - the céilí band's stage at the west end, with a "CEILI TONIGHT" backdrop;
  - seven tables with chairs and pints;
  - bunting and milk globes.
- **A landing** at the top of the stairs (north). Off it are **Mammy Moloney's whiskey snug** (back left) and **the games room** (back right), each with a doorway and a sign.
- **The balcony** wraps round the cut corner, through French doors in the corner's upper wall. It has:
  - boards on iron brackets, iron railings with curls, fairy lights and planters;
  - two standing tables (a third blocked the east strip, so it went).
- **Mammy's snug:**
  - a stone fire with its own flames, a wall of whiskey on shelves, an O'BINLID'S sign;
  - her velvet wing chair, a footstool and a tea table;
  - two old fellas reading the paper in leather chairs;
  - a rug, a standard lamp and frames.
- **The games room:**
  - a mahogany pool table with green baize, a lamp over it and a cue rack;
  - a dartboard on a backboard, the oche and a "501 coming soon" scoreboard.
  - The games themselves are R12.3 (8-ball) and R12.4 (501).

### The céilí (a rhythm game, tough)

- **The band:** THE SHAMROCK SHUFFLERS, 4 real NPCs (accordion, fiddle, flute, bodhrán) on the stage, seated. They play an original reel, "The Mopping-Up Reel", in D at 115.2 bpm: 32 bars, AABB.
- **Timing:** one time round is 66.7 s, so exactly 9 times round the city clock's 10 minutes. That lets every window play it in time off the same clock.
- **Join:** press B on the floor. The dance starts on the next bar after a count-in ("5, 6, 7, 8!") and runs one full time round.
- **The steps:** they fall in 4 lanes onto shamrocks. Keys are ← ↓ ↑ → (or D F J K), which are steps, not walking, while you dance.
  - The steps are the reel's own notes, about 5-6 a bar, with the lane taken from the pitch.
  - Lists in shared/src/arena.ts (CEILI_TUNE, `ceiliChart`) are what the music, the screen and the server all use.
- **Judging:**
  - ±70 ms is perfect (2 points) and ±140 ms is good (1).
  - Anything else, or a step that goes by, is a miss.
  - Five misses in a row and you trip (knocked down 2.4 s).
- **Payout:**
  - 85%+ is "great": $25 and +1 aura.
  - 60%+ is "ok": $10 and +1 aura.
  - Aura from the céilí is capped at 3 a day.
- **Stopping:** B again, or walking off, stops the dance.
- **Tipsy:** the lanes sway.
- **Where the music plays:**
  - Upstairs the reel is loud and the downstairs jig is muffled through the floor. Downstairs it's the other way round.
  - Outside, both are faint.
- **The dancers:** six real NPCs in costume. Four girls in stiff embroidered skirts with gold hems, curly wigs and headbands; two lads with sashes. They dance on the beat: arms straight down, hops, kicks.

**How it stays fair over the network:**
- The client stamps each step with the city clock at the moment of the key press (between frames too), and the server judges that stamp against the same chart.
- The client's clock now runs smoothly every frame and is nudged toward the server's. Before, it lost a frame on every server tick and then snapped back.
- The server waits 1.5 s before calling a step missed, so lag doesn't trip you. (The first browser run used 0.6 s, and players tripped before their steps arrived.)
- Server rules: steps from the future are refused, and so are steps more than 3 s old.

### Mammy Moloney (she owns the place)

She sits in the whiskey snug in a shawl, pearls, round glasses and a white bun, with her stick. E has a word with her:

- **A little job:** she asks for one thing from a list (a rubber chicken, a mixtape, the newspaper, a smelly fish...). Bring it in your hands and she pays double what it's worth ($20 at least). Until then: "still waiting".
- **Tips:** once you've a name (3+ aura), every 45 s or so she'll tell you something useful about today's city. That might be the richest free item and which way it is, the nearest cop and how many are out, or which big shot is about.
- **No rough stuff:** hit anyone in her pub (patron, band, dancer, Fergal, the lot) and she throws you out the front door with a yell.
- No dram drinking game (Blake: "don't add the dram drinking game").

### Next

R12.3 is proper pub 8-ball:
- reds vs yellows (the first potted picks), then the black;
- a foul gives two visits; black early, or white with the black, loses;
- NPC or friends, with an optional $5-50 bet.

R12.4 is 501 darts: steady the sway and click. Then the brawl, quiz and G-split champ; then R13, the alleys and fire escapes.

## R12.2b: THE SOGGY SHAMROCK upstairs, reworked: laid back, darts, pool, a sick bar; the céilí's gone (Blake, 2026-10-26)

Blake: "I'm not a fan of the ceili. Get rid of that. I think I want more of a laid back area where you can have fun with your friends. A pool table area section. A darts sections. A sick looking bar area. Etc." He sent a Flight Club Darts photo for the darts area: "Keep the dark mahogany Irish look though."

### What's gone

- The céilí floor and its stage, the rhythm game and its screen, the reel ("The Mopping-Up Reel"), and the céilí band and the six dancers, all taken out.
- Everything to do with them in the code: the céilí constants, chart and judge in shared, the World's céilí state, events and actions, the step keys, and the NPC kinds, looks and animations.
- The old "games room" walls. The pool area is open to the front room now.

### What stays

- Mammy Moloney's whiskey snug: her jobs, tips and throwing troublemakers out.
- The corner balcony.
- The landing, the stairs, and the tin ceiling with its beams.
- The standing rule: no chest squares.

### The new upstairs (Blake's answers)

**Layout:** the bar in the middle of the front room, with the zones round it.

**The island bar.** A mahogany ring with rounded corners and the staff's flap at the back, round a back bar. It's drawn exactly like the horseshoe downstairs (the horseshoe's drawing code is now shared, `drawBar`). Over it hangs the canopy:
- a red fascia with a gold line, ringed top and bottom with warm marquee bulbs;
- a cream crown above it with its own ring of bulbs, hung on brass rods;
- THE SOGGY SHAMROCK in gold on green along the long sides, GUZZLE'S on the ends;
- green pendant lamps over the counter;
- three taps.

**Róisín** is the barmaid: red hair in a bun, gold hoops, a bottle-green top. She pours GUZZLE'S and you can split the G up here too. She has her own lines, and the World picks her rather than Fergal for anyone upstairs.

**Two darts booths** down the west wall, Flight Club style:
- panelled mahogany with oxblood above;
- a red-and-cream ringed surround round a regulation board, 1.73 m to the bull, with a ring of bulbs round it;
- a screen over it on a bracket. It shows a parody "BULLSEYE BAR" logo for now, and the live 501 score comes in R12.4;
- lit amber stained-glass screens either side ("Three Darts ~ good luck ~", stars in the leading), with a turned post and a column of bulbs down its front;
- a dark runner, and the oche 2.37 m out (a brass bar with a glowing strip);
- a scoring podium with a glowing tablet;
- a long ledge behind with a glowing edge, a brass foot rail, pints and a cup of darts;
- "OCHE 1" and "OCHE 2" on the cornices.

**The pool area** (back right): two tables in mahogany and green baize with six pockets each.
- A rack of reds and yellows sits ready on each table (pub 8-ball, R12.3), with the black in the middle and the white.
- A green lamp hangs over each table.
- There's a cue rack and a chalkboard ("winner stays on · 8-ball: coming soon"), plus frames.

**The lounge.** It has all four kinds of seating Blake asked for:
- **Chesterfields:** two pairs of deep-buttoned oxblood leather sofas with rolled arms, round low tables on rugs.
- **Round booths:** two round high-backed buttoned booths on the east wall, each with a table, pints, a candle and a wall lamp.
- **High tables:** five, with stools, by the darts and the pool.
- **The fire:** a second fireplace on the snug's front wall (stone, a mahogany mantel, a gilt mirror, real flames, a coal scuttle), with two green velvet wing chairs angled to it, a rug and a tea table.

**The jukebox:**
- **The cabinet:** mahogany with an arched top and glowing tubes round the arch (orange, gold, green), a brass grille, and a little screen showing what's playing.
- **The tunes:** three originals, generated in audio.ts. "Soggy Sunday" is a slow waltz in G (fiddle and guitar). "Last Bus Home" is a late-night ballad in D (electric piano and low whistle). "Puddle Stomp" is stompy folk-rock in A (bass and drums).
- **Controls:** E puts on the next tune. It's free (the coin slot's broken), and you can change it once every 3 s.
- **Sync:** every window hears the same bar, because the tune comes from the prop's note and the timing from the city clock.
- **Volume:** upstairs the jukebox is loud and the session downstairs is muffled through the floor; downstairs it's the other way round.

**People:** four more drinkers upstairs (at the darts' high tables, leaning on the bar, watching the pool) and Róisín. The city now has 55 NPCs (it had 60 with the céilí folk).

**Lighting:** warm accents only. Bulbs on the bar canopy, round the boards and down the darts screens; the stained glass and the oche strips glow. Everything else is milk globes and mahogany.

### Notes

- Upstairs taps are part of `pub.taps` (each tap has its own height). The pint close-up now only stays open within reach of a tap on your own floor.
- The R7 police test now stands the wanted bandit right in front of the cop. Adding the upstairs NPCs shifted the random seed, and the cop's view had happened to work from beside him before.
- The browser e2e now uses the preinstalled Chromium when Playwright's own build isn't there (`PW_CHROME`, or /opt/pw-browsers/chromium). The scratch new-city recipe's header is now lines 1-50 (was 1-47).

### Next

R12.3 is proper pub 8-ball on these tables:
- reds vs yellows (the first potted picks), then the black;
- a foul gives two visits; black early, or white with the black, loses;
- NPC or friends, with an optional $5-50 bet.

R12.4 is 501 darts on these oches, with the screens showing the score. Then the brawl, quiz and G-split champ; then R13, the alleys and fire escapes.

## R12.2c: THE SOGGY SHAMROCK fixes, a hard Split the G, Big Dessie, open booths, Seamus O'Shortly and the swarm (Blake, 2026-10-28)

### The front door (Blake: "clipping... congested and covering the sign", "the chalkboard sign out the front is upside-down", "the weird red line that cuts through the middle of the front door")

- **The cause:** the corner door's red plinth, its pilasters and the black board behind the name were all turned 90° (`yawOut + PI/2`). So instead of running along the cut corner they stuck straight out through the middle of the doorway. That made the red line, plus a black bar through the top. The same mistake affected the panels round the door inside. They all run along the wall now (`yawOut`), and the plinth stops either side of the door.
- **Removed or moved:**
  - The curved hood over the door is gone. The balcony above shelters the door now, and the hood was squashed under it and covered the sign.
  - The big clock moved off the corner onto its own bracket on the east front.
- **The A-board:** each board is now a frame with the chalk drawn on a plane facing out, so the writing reads the right way up on both sides.
- **Clipping sweep:** a scripted overlap check of every pub collision box found only wall corners (fine) and the old round-booth tables (rebuilt). The visual pass fixed three more:
  - the upstairs back bar's crown poked into the ceiling (the gantry height now respects the ceiling);
  - the canopy's crown touched the beams (lowered);
  - one row of pendants hung through the glass rack (that row's gone).

### Split the G, hard (Blake: "too easy... in real life you actually cannot see where the G is... you just need to visually see that you're drinking. hold the button and stop where you think the G is. needs to be a hard game to win")

- **First person.** The pint's in front of you with its back to you, so the G's on the far side and you can't see it.
  - Hold to drink: the glass tips up to your face (it rises, comes closer and leans back) and the stout drains, with bubbles.
  - Let go where you reckon the G is. The glass comes down and turns round to show the G, the target marks and where your line stopped.
- **Tight grades:** perfect is 2 mm (was 4) and close is 6 mm (was 12).
- **An uneven gulp:** every pint surges and slackens on its own rhythm. The rate is multiplied by 1 + 0.45 × sin(w·t + ph), with w = 1.6–3.4 rad/s and a random phase ph, so you can't just count.
  - The curve is integrated exactly and always goes down.
  - The World sends `w` and `ph` with the pint and judges with the same `pintLevel`.
  - The perfect window is now about 0.1–0.3 s.

### Big Dessie (Blake: "1 drunk dancer dancing to the music in front of where the band is. make his movement unpredictable")

- **Who:** a big red-faced lad in shirt sleeves (no chest squares) with messy hair, rosy cheeks and a pint, in front of the band's stage.
- **How he dances:** every 1.6–3.2 s he picks a new move at random: stagger, spin, flail, drop to his knees, kick-jig, or point at the sky.
  - He wanders about his spot while he does it.
  - The moves come off the clock, so everyone watching sees the same dance.
- He's one of the pub's folk, so hitting him sets off the swarm.

### The round booths (Blake: "the booths you cannot enter")

- The seat ring was bowed the wrong way, so its open side faced the wall.
- Now its back is to the wall and it opens to the room. It's bigger (2.1 m radius), with a small table in the middle and room to walk in round it.
- A walk test proves you can get in.

### Seamus O'Shortly and his lads (Blake: "the boss upstairs, I want her gone and replaced with a different boss, a small leprechaun type. and he's got lots of little buddies with him. and if you hit anyone in the pub they swarm you, damaging you for a little bit")

- **Mammy Moloney is gone.** Seamus O'Shortly sits in the big velvet chair:
  - a wee man in a green coat and a green top hat with a gold band and a shamrock;
  - a big red beard, sideburns, pointy ears and a clay pipe.
- **His six wee buddies** lounge round the snug: pointy green caps, each with his own green and beard colour.
- **E with Seamus:**
  - **A little job:** bring him something for a pot of gold, paid at double its value ($20 at least).
  - **A big job (1 in 5):** bring him something lucky (a lucky pigeon statue, a lucky cat, a lottery ticket or a snow globe) for the big pot: 4× its value, $80 at least.
  - **Tips:** once you have 3+ aura.
- **The swarm.** Hit anyone in the pub (a drinker, the band, Fergal, Róisín, Big Dessie, a buddy) or Seamus himself, and he yells "GET HIM, LADS!":
  - All six run at you.
  - Any who are far off or on another floor pop out round you (they're leprechauns), with a green "POP!".
  - They nip at you: 4 damage a nip, with the odd stagger. They never take you below 20 hp, so it stings but never knocks you out.
  - It lasts 8 s (hitting someone again tops it up). Then they wander back to the snug, popping home if they're far away or stuck.
- **Seamus himself** doesn't go down when you hit him.

### Notes

- The pigeon lady already had a "swarm" event, so the leprechauns' one is `lepSwarm`.
- The city has 62 NPCs now: the 55 from R12.2b (which included Mammy), minus Mammy, plus Seamus, his six buddies and Big Dessie.

## GitHub (Blake, 2026-11-04)

Blake: "i want chat gpt to start seeing the updates too. i want you to start pushing every update onto github."

- **The repo:** private, named `box-fort-banditz`. ChatGPT reads it through its GitHub connector.
- **Every update pushes:**
  - all the code and docs;
  - a `CHANGELOG.md` entry;
  - that round's screenshots in `screenshots/<round>/`.
- **The file cap:** the 100-file cap now counts code and docs only. `CHANGELOG.md` and `screenshots/` sit outside it, because Blake chose screenshots knowing they'd push past it.
- **Status:** the first push is waiting on the repo being created on GitHub and connected to the Claude session. Until then every update is committed locally as usual, and the history is pushed in one go once it's connected.

## R12.3: pool and darts upstairs at THE SOGGY SHAMROCK, and one 8-minute scavenge (Blake, 2026-11-06)

Blake: "make the upstairs somewhere my friends and I actually want to spend time... play pool and darts, watch each other, and enjoy the room." Delivered in stages: inspect, propose and ask; fix the room; pool; darts; multiplayer and interruptions; polish.

### Stage 1: what was there (from the code and from eye height)

Nothing was playable. The tables and booths were decoration, with "coming soon" signs.

**Pool:**
- **Balls:** 110 mm across, twice the real size.
- **Pockets:** flat black discs painted on top of the rail.
- **Lamps:** 3.3 m up, under a 4.25 m ceiling.
- **Gap between the tables:** 3.1 m, too tight for two full cues at once.

**Darts:**
- **Board:** a correct 451 mm board, but sitting in a 3 m arcade ring of red and cream with 30 bulbs.
- **Bull rings:** about 60% too big.
- **Throwing distance:** the oche was 2.37 m from the wall, not from the board's face, so it was 16.5 cm short.
- **Screen:** a magenta "BULLSEYE BAR" screen.

**Also:** the jukebox's name plate faced the wall, so it read backwards.

### Blake's decisions (asked as numbered questions with recommendations)

- **One 8-minute scavenge** (Blake: "instead of a day cycle, then a night cycle... day turning into night, 8 minutes"):
  - about 5.5 min of day, a 30 s sunset you keep playing through, then 2 min of night;
  - no city wipe at dusk, and nothing lost at sunset;
  - fresh x2 loot appears as night falls;
  - raids, double heat and the tougher cops come with the night.
- **Pool:**
  - power: hold the click, pull back to draw the cue, let go to strike;
  - ball in hand: behind the baulk line;
  - potting the other player's ball is a foul (two visits).
- **Darts:**
  - Blake: "a darts match should only go for a minute or two", so the game is 301, double out, one leg;
  - Shift steadies your hand, and each pint adds 15% sway (up to +75%).
- **Interruptions:**
  - last orders 90 s before the end of the scavenge (no new games after that);
  - anything unfinished at sunrise is called off and the stakes refunded;
  - a dropped player's seat is held 45 s, then the game is called off.
- **NPC bets:** up to $20 a game, with a $40 kitty per NPC per cycle, so they can't be farmed.
- **The file cap:** `docs/code-snapshot.md` deleted (a stale Phase 4.5 copy of the source). Two tiny test files merged into their neighbours.

### The room (stage 2)

**The pool tables:**
- moved apart to x −81.6 / −76.65, giving 3.75 m between them and about 2.2 m to each wall;
- a layout test sweeps a 1.45 m cue room round each table at elbow height;
- tables not shrunk.

**The pool tables, rebuilt as UK 7 ft pub tables**, using the same numbers as the simulation (`POOL` in `shared/src/pubgames.ts`):
- **sizes:** a 1.83 × 0.91 m bed, 2" balls and a 48 mm cue ball;
- **pockets:** an 86 mm corner mouth and a 95 mm middle mouth;
- **cushions and jaws:** drawn from the simulation's own cushion segments;
- **pockets you can see into:** holes cut in the cloth, leather cups and lips, and dull brass caps;
- **the cabinet:** a ball-collection window at the foot end (potted balls line up in it), a coin mech, a plinth, turned legs and mother-of-pearl sights;
- **the lamp:** a three-shade green-and-brass billiard lamp, 1.12 m off the cloth.
  - The light pool is baked into the cloth texture, because a real light would make every material's shader heavier.

**Round the tables:**
- a spectators' ledge on the snug wall, with beer mats (no drink near the cloth);
- a cue rack with a short cue, chalk and the brush;
- live chalk scoreboards behind each table;
- the house rules, four league photos and a trophy shelf with a pennant;
- worn boards round the tables;
- owner's notices: "No drink on the cloth. The cloth has suffered enough." and "Lost a bet? Seamus accepts gold. Hughie accepts excuses."

**The darts booths** keep the Flight Club layout (walled booths, screens either side, the ledge behind), with a pub oche instead of an arcade:
- **the board:** drawn by `drawDartboard` from `DARTS`, the same numbers `dartScore` hit-tests with, and checked in a screenshot (20 at the top, 6 right, 3 bottom, 11 left);
- **the cabinet:** mahogany, its doors folded open, with chalkboards on the doors that chalk up each player's running score live;
- **lighting:** two brass picture lights instead of the bulb ring;
- **the scoreboard:** a mahogany-framed board in bottle green and cream;
- **the side screens:** leaded glass (amber, a few green and oxblood quarries) instead of "Three Darts · good luck" stars, and no bulbs;
- **the oche:** a flush brass toe-bar, its front edge exactly 2.37 m from the board's face and 1.73 m below the bull, with a worn runner;
- **notices:** "Darts are for the board. Not for settling arguments." and "Mind the gap: 2.37 m. We measured. Twice."

**Checking the board's ink outline:** the board cylinder's ink outline stood 4 mm proud of its face and hid the board texture. The cylinder now has no outline.

**Frame rate:** an identical before/after comparison (the pre-R12.3 build served next to the new one, the same views in the same order) gave the same fps within noise.

**Measured references:**
- the WDF ring sizes: bull 12.7 mm, 25 ring 31.8 mm, treble wire 107.4 mm, double 170 mm, 8 mm beds;
- WEPF and retailer specs for a 7 ft UK bed (1.83 × 0.91 m).
- **Approximate, not an official template:** the pocket mouths (about 1.7 and 1.85 ball widths). The WEPF template itself wasn't published in what I could find.

### Pool (stage 3)

**The simulation:**
- `PoolSim` is deterministic 2D: a fixed 1/240 s step, plus sub-steps so a ball never moves more than a quarter of its radius at a time.
- It uses only + − × ÷ and sqrt, so every client replays a shot exactly from (start balls, direction, speed).
- It covers equal-mass ball collisions (restitution 0.94), cushions and jaws as segments (0.72), rolling friction plus a little drag, and pocket capture past the mouth.

**How a shot is shared:**
- the host checks the shot, simulates it and stores it on the table's prop note;
- clients replay it in step with the host's traffic-light clock;
- the settled positions are the truth;
- anyone who joins mid-shot fast-forwards to catch up.

**Bug found in play, fixed:**
- **The bug:** on a slow machine the game clock runs slower than real time. The client replayed shots by frame time, finished early, thought the balls had stopped, and its next shot was refused.
- **The fix:** the replay never runs ahead of the host's clock, and "rolling" means the host still has the shot.

**House rules (`poolResolve`):** "our house rules", traditional pub blackball, simplified.

| Situation | Rule |
|---|---|
| Break | Taken from behind the baulk line. Pot a ball or drive at least 2 balls to a cushion; otherwise it's a foul. |
| Black potted on the break | Re-rack; the same player breaks again. |
| Groups | The first legal pot after the break decides. Break pots don't. If both colours go down, the table stays open. |
| First contact | Your own colour (any colour on an open table, but not the black); the black once you've cleared your colour. There's no cushion rule. |
| Foul | Two visits to the opponent. A visit lasts while you keep potting. You lose any visits you have left if you foul. Two visits still apply when you're on the black. |
| White potted | Foul. The opponent places the cue ball behind the baulk line. |
| Their ball potted | Foul, and the ball stays down. |
| The black | You lose if it goes down early, with the white, on a foul, or on the same shot as your last colour. You win if it goes down legally. |
| Shot clock | 40 s. Running out is a foul; two in a row and you forfeit. A whole game is capped at 15 min, then called off. |

**Controls:**
- **Joining:** E at a table opens a keyboard menu: play HUGHIE or wait for a mate, with A/D to change the stake.
- **Your turn:** you crouch behind the cue ball, 0.36 m above the cloth. The camera slides in rather than going through a wall, a person or furniture.
  - Space stands you up. With ball in hand, you place the white behind the line first.
- **Aim:** move the mouse; hold Shift for fine aim.
- **The guide:** a line to the first ball, a ghost ball, and short stubs for where both go. There's no cushion maths.
- **Shooting:** hold the click and pull back (the cue draws back and a meter fills), let go to strike; right-click cancels.
- **While you're at the table:** the mouse, its buttons and the keys all go to the game, so you can't punch, throw or walk off by accident. Being hit puts you back to normal controls.
- **Sound and rolling:** restrained cue, ball, cushion and pocket sounds. Balls roll by distance over radius, and each has a maker's dot so you can see it turn (the white has red spots).

**HUGHIE** (the regular who watched the pool) uses the same shot system:
- he picks a ball and pocket he can actually pot, through the ghost-ball spot and a clear path, aiming for the middle of the pocket's mouth;
- with no pot on, he plays a safety (rolls up to his nearest ball);
- his errors: about 0.3° of aim and ±10% power. That pots about 3 in 5 of the pots he goes for; 0.8° only potted 1 in 5;
- he takes 2–4 s to think, says the odd line, and walks round the table, not through it.

### Darts (stage 4)

**Scoring:**
- `dartScore(u, v)` hit-tests in metres from the bull, using the same numbers the board is drawn from.
- A dart exactly on a ring wire counts for the ring nearer the bull; exactly on a segment wire, for the segment clockwise of it.
- Outside the double ring is a miss, and the dart sticks in the surround. There are no bounce-outs, and darts never deflect each other.

**The rules (301, double out):**
- three darts a visit; the bull is 50 and counts as a double;
- **bust:** going below 0, leaving 1, or reaching 0 without a double. A bust puts the score back to the start of the visit, ends the visit, and says why;
- a checkout ends the leg on that dart;
- `checkout()` gives the standard fewest-darts routes, for the hint and for BIG DINNY.

**Aiming:**
- At the oche the view narrows: the board is about half the screen's height, with the cabinet and its chalk doors either side.
- Moving the mouse moves a ring. Your hand's sway is two slow sine pairs, about ±12 mm.
- **The ring is exactly where the dart lands.** There's no hidden spread.
- **Steadying:** hold Shift to cut the sway to 40% for 2.5 s; after that your hand shakes (150%), and it recharges in 2 s.
- **Pints:** each adds 15% sway, up to +75%.
- **Throwing:** a click throws. The dart flies for 0.2 s and sticks where the ring was.
- **Score feedback:** the score flashes on the scoreboard; busts are explained in words.
- **The clock:** 20 s a dart. A whole visit thrown by the clock forfeits the game.

**BIG DINNY** (the bearded regular at the darts' high table):
- aims for the treble 20 to score, or the first dart of a checkout route, or sets up a good double;
- his darts land with an 18 mm spread, a 3-dart average of about 57 when aiming at the treble 20 (measured over 3,000 darts): a decent pub player.

### Multiplayer and interruptions (stage 5)

**The stations:**
- four stations (`pooltable1/2`, `dartsoche1/2`), each a prop whose note carries the station's whole state as JSON;
- so spectators, late joiners and reloads get everything: seats, scores, the balls or the darts already in the board, and any shot mid-roll.

**What the host controls, and what it refuses:**
- the host controls seats, turns, the simulation, impacts, scores and money;
- it refuses spectators, out-of-turn and duplicate actions, bad values, and a second game for anyone already playing;
- refused actions are explained to the player ("Not your turn.", "Wait for the balls to stop.").

**Bets:**
- both stakes are held once, when the second player joins;
- the winner gets the pot exactly once, and a called-off game refunds each stake exactly once;
- **bug found by the online test, fixed:** a game going when the host started the match was refunded after the match had reset everyone's cash, so the stakes leaked into the match. It's now called off before the reset.

**Interruptions:**
- **Walking away:** going downstairs, or more than 30 m from your station, gives you 10 s to come back, then you forfeit. Fetching a pint from the island bar is fine; 12 m wasn't, so it was raised.
- **Arrest:** you forfeit.
- **Knocked down:** you're dropped out of the aiming view and your clock keeps running.
- **A dropped connection:** the seat and its clock are held for 45 s, then the game's called off.
- **The 8-minute scavenge:** games run through sunset and night; last orders 90 s from the end; at sunrise games are called off and refunded; at a new cycle the NPC kitties refill.
- **No safe zone:** the pub isn't one. Seamus's swarm still deals with anyone who starts trouble.

### Polish: bugs the browser tests caught (stage 6)

- **Empty refusals:** the client never kept the refusal text, and the World sent a second, empty message on top of a station's own one. Now there's one message and it's shown.
- **Server-hosted rooms:** the Colyseus room synced each prop's two flags but not its note, so in server-hosted mode nobody saw the tables or the boards change. The note is synced now (browser-hosted P2P was always fine).
- **A quick E then 1:** the table's menu only took the keyboard on the next frame, so at a low frame rate a fast "1" went to the normal controls and no game started. The menu takes the keys the moment E opens it.

### Files

- `shared/src/pubgames.ts`: the geometry, the simulation, the house rules, 301, NPC play and the stations.
- `client/src/game/pubGames.ts`: the textures, the live games and the controls.
- `shared/test/pubgames.test.ts`: the tests.
- **Changed:** the World glue (`world.ts`), the layout (`city.ts`), the static room (`cityRenderer.ts`), input capture (`input.ts`), the scene hooks (`arenaScene.ts`), the prompt and test hooks (`main.ts`), the 8-minute cycle (`match.ts`, `nightRenderer.ts`, HUD and banners), and the sounds.

## R12.3b: bug fixes and polish: pool playback, timers, stations, police traffic, pavement, the HUD (Blake, 2026-11-07)

Blake's brief: pool shots sometimes skip, police cars and cars jam, pavement sections overlap or clip, the HUD overlaps
the games. Fix the causes, prove each one, and keep 301, the 8-minute scavenge, the pub's look and the house rules.

### Blake's decisions (asked as numbered questions)
1. **Disconnects:** a forfeit after the 45 s hold if the other player's still there. If both are gone, or the host's gone, the game's called off and refunded. (Recommended; chosen.)
2. **A police car dropping an officer off:** it pulls in, waits about 8 s and moves on, circling with its siren on, and never drops off another officer. (Recommended; chosen.)
3. **Instructions:** a compact panel always; the full instructions for your first two games of each kind, then with H. (Recommended; chosen.)
4. **While aiming, hide:** the home arrow and the cash list. The match clock stays. Inventory and the controls line were already hidden while aiming, and the brief asks for that clutter to go, so they stay hidden.

### Pool: why shots skipped (three causes, each reproduced)
- **The shared clock is rounded.** The wrapped clock clients see (`lightT`) goes out at 0.1 s; a shot's start (`t0`) at 1 ms.
  - When the first state carrying a shot had the clock rounded to just before `t0`, the client worked out `((clock - t0) mod 600)` as about 599.95 s, decided the shot was long over and started the replay at its last frame.
  - Simulated over 100,000 shots: 24.6% started at the end. This is the "sometimes".
- **Shot numbers start again every game.** The client only remembered the last shot number it had replayed, so a new game's shot with that number was never played.
- **The re-rack** (black potted on the break) reset the shot count to 0 mid-game. The new break had the same number as the shot just played.

**The fix:**
- **A name for every shot:** game id plus shot number (`gid:n`). Game ids are never reused, and the shot count carries on through a re-rack.
- **Timing (`StationFeed`, `replayStep`, shared and pure):**
  - The replay works with a signed, wrap-aware difference, so "a hair before the start" means "just started".
  - It stays in step with the host's clock, never ahead of it and never backwards.
  - Behind by more than 0.3 s, it plays at 2.5× until it's caught up.
- **Which shots get replayed:**
  - A window seeing a station for the first time joins mid-shot.
  - A window that was watching but heard late plays from the start and catches up.
  - A shot that came and went between two looks (a stalled frame, a background tab) is replayed quickly from a copy the host keeps (`last`).
  - More than one missed shot is reported ("Missed 2 shots…"), never silently skipped.
- **Your turn:** you step up only once your window has finished showing the last shot. The host refuses a shot while its own shot is rolling, as before.
- **Settled positions:** the replay ends where the host settled the balls, to 0.2 mm (tested). Then the host's table is shown.
- **What a new game resets:** the replay, the cue stroke, the drops, whose turn it was, a dart in flight and the cabinet doors' running scores.
- **Diagnostics:** `?pgdebug` in the address logs every game id, shot name, host start, heard-at clock, elapsed time, how the replay started, and when the shot settled. Off by default.

### Countdowns and status
- The note was only taken in when its revision changed, and the host doesn't bump the revision for a ticking clock, a drop or a walk-off. Now every changed note is taken in. Only names (game id, shot name) decide whether something new happened, so status changes never restart a replay.
- Clocks go out as when they run out, on the shared clock (`dl`), or what's left when stopped (`left`). The same goes for a held seat and for a player who walked off. So the note doesn't change every second (less to send), and a window counts down truthfully between messages. The window shows the whole seconds left, never more than the host has.

### Stations stay independent
The client called `leave()` whenever any station went from playing to over. Now a station's changes only move you if you're at that station. Another table or board finishing, or freeing up, never touches your aim, your throw, or a menu you have open elsewhere (tested mid-draw, mid-throw and with a menu open).

### Police and traffic: the deadlock
**Reproduced on the new city, 3 seeds:**
- Patrol cruisers drove down the road's centre line and ignored lanes and lights.
- Cars stopped for any cop car ahead within 2.6 m sideways; a cruiser stopped for any car ahead within 1.8 m sideways.
- Within 30–60 s a cruiser and a car were nose to nose, each waiting for the other. Queues then backed across junctions, and cars stood still for 460 of 480 s.
- In chases, cop cars drove through traffic: 1,900–5,800 overlap samples per 5 minutes. Parked cop cars sat in the middle of the road until the chase ended.

**First attempt:** patching the free-driving cop cars (looking along their real path, keeping right, a turning circle, backing up). Each fix moved the problem; overlaps and standoffs stayed in the hundreds.

**The fix: every cop car drives in the traffic's lanes (`TrafficSystem.riders`).**
- **Siren off** (patrol, heading off): ordinary traffic, with the same lanes, lights, give-way and following distance.
- **Siren on** (chasing):
  - It ignores red lights and give-way, but still needs a clear junction box and room on the road out.
  - Cars coming up to a junction hold back for a siren approaching it.
  - It picks its way to its target over the lane network (distances worked out backwards from the lanes that pass near the target).
- **Dropping an officer off:**
  - It stops in its own lane, on a road, never in a junction, close to the player or as near as the road gets. It tucks toward the kerb.
  - After 8 s it moves on and circles the area at 25–60 m.
- **Spawning:** cop cars start in a lane, never on top of another car.
- **Merging:** an old merge fault was also fixed. Two cars from different approaches could commit to the same exit lane in the same instant. Committed cars now count as occupying it.

**Result (5 chase seeds, 4 patrol seeds):**

| | Before | After |
|---|---|---|
| Overlaps | 1,900–5,800 samples per 5 minutes | 0 |
| Cop cars off the road | 0–12 samples | 0 |
| Mutual waits | the whole run | none |
| Longest car stop | 238–296 s in chases | 25–51 s |

For comparison, the longest car stop with no police at all is 26–69 s, at five-way traffic lights where a queue backs up a short link road. That isn't a deadlock and it clears.

**Diagnostics:** each car keeps why it's stopped and what's holding it up:
- a queue behind a car;
- a junction: no room on the road out, the box occupied, giving way, a red light, a ring car or a siren;
- a pedestrian, the police, the garbage truck or the parade.

`traffic.waits(s)` lists every vehicle stopped longer than `s` seconds.

**Tests** (they fail before the fix: cars stood 224 s, 178 s, 104 s, and 120 s in the parade test):
- four patrol seeds;
- three chase seeds;
- the exact reproduced jam;
- a parade closing a street with the police about.

### Pavement
**Measured:** 400 overlapping pairs of ground surfaces, 427 m² in all.
- **222 at the same height**, where the square pavement grid ran 0.6 m into the curved pieces round the roundabout (they flickered).
- **178 under the smooth strips** laid 2 cm above the 0.5 m stepped collision along the two diagonals. What you saw wasn't what you walked on.
- **1,349 points along kerbs with no pavement** in the gap check. This includes a 17 cm strip beside kerbs that aren't on the 0.5 m grid (e.g. x = −70.33), where the straddling cell counted as road.

**The fix:**
- **Cutting:** a cell the road, a diagonal (its rounded ends included) or the curved band only partly covers is laid, then cut exactly against them. The cut pieces are convex, so they work as collision too.
- **The curved band:** its pieces are cut the same way. A piece whose middle was on a road used to go entirely, leaving a hole.
- **The diagonal strips are gone.** One height (0.15 m) everywhere.

**Drawing:**
- The first build showed ink lines on every join between pieces. They used to be hidden under the diagonal strips, and drew faintly elsewhere.
- The pavement is now drawn as each piece's top plus walls only where an edge isn't against another piece: the kerb.
- The ink outline therefore draws the kerbs and nothing else. The faint seam lines elsewhere in the city are gone too.

**Results:**
- 0 overlapping pairs.
- No new gaps; 335 old unpaved points are now paved city-wide. The rest are at the map's edge, beyond the grid.
- Walking along and across the joins: no snag, no step, no sinking (tested).
- Pieces: 349 → 2,373. Building the city takes about 0.2 s longer.

### The HUD and the pub
- The lobby card shows only in the lobby.
- Aiming:
  - the compact top-right panel, outside the shot (full width, low, on narrow windows);
  - first-time help, then H;
  - the home arrow, cash list and mode badge hide;
  - health, heat and the match clock stay.
- **Pockets:** the holes in the cloth, and the cups under them, are now exactly where the simulation pots a ball. Each hole's edge is on the mouth: the corner jaws' line, or the middle pocket's cushion line. The middle holes used to start 1.85 cm out on the playing surface. The cups are double-sided: you used to see through an open cup's far wall to the cloth.
- **Ball in hand:** the white stays where you put it while you aim. It used to jump back.
- **Walkthrough:** the tables, lamps, cue rack, chalkboards, booths, oche and bar all checked from eye height. Nothing else needed changing. Material and decor changes were left for a later round: functional fixes first.
