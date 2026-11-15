# R14: the game loop: plan (for Blake's decisions)

Box fort → scavenge → bank → sell / upgrade / craft → aura → interfere → campaign → MAYOR.
**Confirmed** = from Blake's brief. **Proposed** = my default, open to change (the questions alongside pick between them).

## What exists today (reused, not rewritten)
- A match is 3 cycles of: intro (5 s) → scavenge 8:00 (day 5:30, sunset 0:30, night 2:00) → dawn → pawn-shop round
  (Sal force-buys everything in your fort) → an EMPTY upgrades round → next. Banking: loot left in your yard locks after
  10 s. At night rivals grab locked loot instantly (an alarm goes). Aura: tags (+1; the Mayor's statue +5), the DJ
  decks, the piano, dancing, Seamus's tips. Seamus O'Shortly (THE SOGGY SHAMROCK) gives "bring me a ___" jobs. DON BINNIE
  (NEON FEVER, the VIP throne, two bodyguards) has none. Police, heat, arrests, jail, the bank's guards and alarms,
  the six stores' counters, keepers, display cases, WEE MICKEY's night fence all work.
- Missing: upgrades, crafting, protected storage, timed theft, aura tasks, a quest tracker, boss reputation, the
  president, the mayor campaign, an end other than "3 cycles".

## 1. Phases (confirmed: 8:00 scavenge, ~2:00 prep, repeating; start at your own fort)
| Phase | Time | What |
|---|---|---|
| READY? | 5 s | everyone at their own fort's door, a 3-2-1 countdown, can't leave the yard |
| SCAVENGE: day | 5:30 | explore, loot, tasks, bosses, bank as often as you like |
| SCAVENGE: sunset | 0:30 | still day for the rules; the sky goes |
| SCAVENGE: NIGHT | 2:00 | **fort theft is on** (exposed storage only); x2 street loot; tougher cops |
| PREP (sell / upgrade / craft) | 2:00 | everyone teleported home; no hostile actions; READY skips |
- **Proposed** warnings: "Night falls in 30 s", "1:00 left: bank it or lose it", "0:10". Night is always the last 2:00
  of each scavenge, so theft is predictable.
- **Proposed**: the match repeats until someone becomes MAYOR (or the host ends it). Q: a safety cap?
- Between scavenges: street loot refreshes (stock refills, rummage spots, cases, tills); your fort, cash, aura,
  upgrades, crafted gear, boss reputation and quests in progress stay. A new match resets everything.

## 2. Banking (confirmed: 10 s inside your fort; deliberate; not a held button; shows pending/banked)
- **Proposed**: the **DEPOSIT MAT** (the existing pad in front of your fort door, marked, ~3 x 3 m). Drop or throw loot
  onto it: it's **PENDING** (a 10 s ring over it). After 10 s uninterrupted it's **BANKED**: it leaves the street and
  goes onto your fort's **SHELVES** (a fort inventory record, shown as the item on a shelf spot). One sound for the lot:
  a cardboard *thunk* + a short rising "cha-ching" chord; a small card "+3 BANKED · $410".
- Taken off the mat (by anyone) or knocked off before 10 s: the timer stops; put it back = 10 s again. Pending loot is
  still loose loot: anyone can grab it (that's the risk of the 10 s).
- **Shelves full**: it stays pending on the mat ("STORAGE FULL") until you make room.
- **Deadline (proposed)**: when the scavenge ends, **anything not banked is dropped where it is** (carried or on the mat)
  and stays in the city as loose loot next round. The teleport never secures it. Warned at 1:00 and 0:10.
- No duplication: an item is either a world object or a shelf record, never both; one owner; server-side only.

## 3. Storage (confirmed: SAFE holds 2 at the start, chosen by the player; banked ≠ protected)
- **Proposed**: SHELVES hold 8 to start; SAFE 2. The SAFE is chosen in PREP (and by day at your fort's safe), never at
  night. Each item counts as one (no stacking).

## 4. Night theft (confirmed: 5 s interaction, range, interruptions, exposed only, carry it home and bank it)
- **Proposed**: walk into a rival fort at night, aim at an item on their shelves, hold E (5 s ring). Moving away 1.5 m,
  being knocked down, a full pocket/hands, the item being taken first, or night ending cancels it. The server decides
  who wins a tie. The owner gets "THIEF AT YOUR FORT" (and with the ALARM upgrade, who and what).
- The stolen item is in your hands, unbanked: carry it home, bank it like anything else.

## 5. Money, selling, aura
- **Proposed selling**: in PREP, sell banked items from your shelves to Sal's van at 60% of value; Sal's "WANTED TODAY"
  list pays x2 (one each). Street counters (the six stores, pawn counters, WEE MICKEY) keep buying what you carry
  during the scavenge, at their rates. Q: keep them, or banked-only selling?
- **Aura (proposed)**: shown big next to cash. Modest: +1 a cop you knock down (each cop once a cycle, 3 max a cycle),
  +2 a successful theft (each item once a cycle), tags as now. Big: aura tasks, boss jobs, interruptions. Every change
  shows "+2 AURA: stole a lava lamp".

## 6. Upgrades and crafting (proposed: a small tree, fixed positions on the fort)
| Upgrade | Cost | Gives |
|---|---|---|
| Fort L2 DUCT-TAPE FORT | $150 + 2 construction | unlocks L2 items below |
| Fort L3 PLYWOOD PALACE | $350 + 4 construction + 1 furnishing | unlocks L3 |
| Fort L4 **MAYOR'S FORT** | $700 + 4 construction + 2 furnishing + 1 trophy | mayor qualification |
| SHELVES II / III | $100 / $250 + 2 construction | 8 → 12 → 16 |
| SAFE II / III | $150 / $300 + 1 electronics | 2 → 3 → 4 protected |
| WORKBENCH | $80 + 1 construction | crafting |
| TIN-CAN ALARM | $60 + 1 electronics | names the thief, a ping on your map; thieves glow |
| BOOBY TRAP | $120 + 1 electronics + 1 construction (L2) | night theft at your fort takes 8 s, not 5 |
| BIG POCKETS | $120 | a 4th pocket |
| HAND TRUCK | $150 + 1 construction | big things carried at walking speed |
Crafted at the WORKBENCH (each consumes its ingredients): MEGAPHONE (stunt tasks +50% aura), FAKE MOUSTACHE (a cop
forgets you once), BANANA PEEL x3 (trip a chaser), CAMPAIGN POSTERS (mayor), CEREMONIAL SASH (mayor).
Construction supplies come from the city everywhere (RUST BUCKET's skip, building sites, crates): never one rare drop.

## 7. Loot categories (proposed: a `category` on every item, existing items tagged, a few added)
construction (brick, plank, duct tape, crate, cone, pallet...), electronics (TV, laptop, phone, speaker...),
furnishing (lamp, armchair, rug, mirror ball...), specialist (records, perfume, jewellery...), trophy (gold nose,
medal, the absurd stuff), junk, food, cash.

## 8. Security at the high-end shops (confirmed: readable, escapable, not damage sponges)
- **Proposed**: CARAT & RUN, MAISON PONG and the bank get a doorman/guard in a visible uniform. Browsing and buying: they
  nod. Behind the counter (a marked line) = a warning, then a shove out. Theft or a smashed case = they chase for 10 s
  within 25 m of the shop (they don't leave the block), a tackle knocks you down and they take the item back. A smoke
  bomb, a banana peel or a thrown thing distracts them; they never stand on a fort or block a street.

## 9. Bosses (confirmed: optional, distinct, silly, not generic deliveries)
- **Seamus O'Shortly** (the pub): petty, sentimental, superstitious. Jobs: recover the stolen shillelagh-shaped draught
  excluder from a rival fort (theft); bring back the "lucky" bin lid he swears is priceless (find + carry); win a game of
  darts against BIG DINNY (performance); chalk an insult about the club on its door (stunt).
- **DON BINNIE** (NEON FEVER): vain, image-obsessed. Jobs: deliver a new speaker while wearing the giant inflatable
  banana (carry + restriction); photobomb MAYOR GRUBSWORTH's statue with the club's flyer (stunt at a landmark); get the
  DJ decks at the rival club playing his anthem (performance); retrieve his "priceless" signed napkin from a bin.
- Reputation 0-5 with each, kept all match. Perks: Seamus 2: tips; 3: free pints; 4: his lads guard your fort door at
  night (thieves take 2 s longer). Binnie 2: free VIP; 3: his bodyguards ignore you; 4: aura tasks cost 30% less.
  A failed job: no rep lost, that job off for the cycle. Never needed for upgrades.

## 10. Aura tasks (confirmed: buy, random, escalating price, reusable objective types)
- **Proposed**: buy at your fort's job board (any time by day): $25, then x1.5 each (25, 38, 56, 84...). One at a time.
- Objective types (data, each with variations): CARRY (an awkward thing A → B), VISIT (N places, with a rule: no sprint /
  holding X / in order), STUNT (do X at Y: dance on the bar, tag a landmark, ride THE DROP), HEIST (take a named thing
  from a named place), ESCAPE (reach 2 stars, lose them), COMBO (bring A + B to someone), PERFORM (darts, pool, DJ,
  piano, split the G), ERRAND (deliberately ridiculous: a smelly fish to MAISON PONG). Easy +4, medium +8, hard +12.
- **Interruption (confirmed rules; proposed values)**: the attempt is "LIVE" from a defined start (picked up the thing,
  first checkpoint, first stars...), shown on your HUD. Only a rival player knocking you down, or taking the task object,
  interrupts: the task fails, you lose 4 aura (not below 0), they gain 3. Once per pair per cycle. Cops, timeouts,
  disconnects and phase ends just fail it (no penalty beyond the lost reward).

## 11. HUD and quest tracker (confirmed)
Top: phase + time. Big: CASH and AURA. One tracked objective (auto-switches to a live timed action). Banking/theft
rings in the world. A quest panel (J): boss jobs / aura task / mayor, separately.

## 12. MAYOR (confirmed: qualification, active city-wide campaign, handshake + posters + random goofy objectives)
- **Proposed qualification** (shown in your fort): AURA 40, MAYOR'S FORT, $500 campaign fee (spent), CAMPAIGN POSTERS
  and the CEREMONIAL SASH (crafted, spent). Checked and taken in one server action, so nothing can be sold meanwhile.
- **Proposed campaign**: launched at your fort by day. One candidate at a time. 4:00 on its own clock; the round clock
  pauses for everyone (everyone keeps playing). Objectives: shake hands with **PRESIDENT DUMPSTERFIRE** (appears at an
  announced public spot), put up 5 posters (any 5 of 8 marked spots), 2 random goofy ones (kiss a baby (it's a pigeon),
  a photo op with the giant rubber duck at the statue, deliver the giant ceremonial scissors to the town hall...), then
  the final speech at the plinth RESERVED FOR THE NEXT MAYOR.
- Opponents see the objective list, the president's spot and the poster spots, and a ping of the candidate every 20 s.
- **Proposed failure**: 3 knockdowns by rivals (each also costs 15 s and drops anything carried), an arrest, or time:
  aura halved (rounded down), fort down one level (MAYOR'S FORT → PLYWOOD PALACE: rebuild it), no new campaign until the
  next cycle. Shelves/safe over capacity after a downgrade: the extra items wait in a "BOX ON THE LAWN" (still yours,
  exposed, sellable; nothing deleted).
- **Victory**: the speech done → MAYOR announcement, fireworks, the results screen, the match ends.

## 13. Build (each stage playable, tested, screenshotted)
1. Phases: 8:00 + PREP 2:00, teleport, countdown, restock, warnings.
2. Deposit mat, 10 s banking, shelves, sound, PREP selling, SAFE.
3. Upgrades + workbench + crafting; 5 s night theft.
4. Cash/aura HUD, quest tracker, boss reputation + jobs, aura tasks + interruption.
5. Mayor: qualification, president, posters, campaign, failure, victory.
Data lives in `shared/src/loop/` (items' categories, upgrades, recipes, boss jobs, aura tasks, mayor tasks, balance):
one rules module per system, the World calls them; the client only draws and asks.

## Blake's decisions (2026-11-14)
1. Banking: the **deposit mat** (10 s on the mat, then onto the shelves; grabbable until then).
2. Deadline: unbanked loot (carried, or still on the mat) is **deleted** when the scavenge ends.
3. Street counters keep buying carried loot at **lower rates**: pawn 30%, specialists 45%, WEE MICKEY 60% + heat.
   Banked loot sells in PREP to Sal's van at **60%**; his "wanted today" list x2.
4. No mayor: the match ends after **8 cycles**; the most aura wins (cash breaks a tie). The host can end it.
5. Campaign: **4:00, 3 strikes** (a rival knockdown costs 15 s and drops what you carry; the third ends it; an arrest
   ends it).
6. The round clock **pauses** for everyone during a campaign; one candidate at a time.
7. Qualification: **AURA 60, $800 fee** (spent), MAYOR'S FORT, CAMPAIGN POSTERS + CEREMONIAL SASH (crafted, spent).
8. Failure: aura halved (rounded down), fort down one level, **no campaign until the next cycle**; nothing deleted (a box
   on the lawn for overflow).
9. Theft: **aim at a shelf item**, hold E 5 s.
10. Aura tasks: the fort's job board, **$25 then x1.5**, one at a time.
11. Interruption: owner **-4**, interrupter **+3**, once per pair per cycle.
12. Storage: **8 shelves + 2 safe** (shelves 12/16, safe 3/4 with upgrades).
13. The president: the giant orange-faced one, with a funnier name: **PRESIDENT MARMALADE** (very proud of his handshake).
14. High-end shop guards: **readable bouncers** (warning, shove; theft = a short chase within the block, a tackle).
15. Prices as above.
16. **No alarm by default.** ALARM I: you're told when a thief is at your fort. ALARM II: theft at your fort takes
    **10 s** instead of 5, and you're told who and where (a map ping).

## Status (2026-11-15)
All five stages are built and tested (see CHANGELOG R14, docs/test-plan.md R14). The judgement calls I made where the
brief left room are listed in docs/design-decisions.md under R14 "Fairness choices", for Blake to confirm.
