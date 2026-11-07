# Growing the city: a staged plan (R12.5 proposal, for Blake to choose from)

Nothing here is built yet. Each idea says what players get to *do*, which systems it hooks into, and roughly what it
costs against `docs/perf-budget.md`. Pick, change or bin any of it.

## Stage 0 (R12.5, now): the foundation

- The BENCHMARK (pause menu) and `tests/perf-compare.mjs`: every stage below is measured before and after.
- The city merged by 64 m tiles; small pieces drawn within 110 m; the pub's façade made cheap.
- Interior areas (`client/src/game/areas.ts`): floors, outside visibility with a gap, stairs, lamps with a budget.
- NPC simulation levels: far passers-by at 10 Hz, judged against every player.
- Render scale, adaptive resolution (off by default), the developer overlay (Show FPS).
- **Needs from Blake:** the BENCHMARK result from his PC (and his mate's) to set the real numbers.

## Stage 1: a representative expansion (to prove the foundation)

One new street block, built entirely the new way, then measured against the budget:

**THE HIGH STREET ROW**: three small shops in a terrace (parody names, nothing real):
1. **SUDSY'S LAUNDERETTE**: a stash spot. Put one item in a machine and it's still there after sunrise (one per
   player, any machine can be cracked by a rival with the lockpick game). *Gives players:* a way to bank a risky find
   without running home; a reason to stake out a rival.
2. **THE GOLDEN BATTER** (the chippy): buy chips ($3) for a stamina refill and a short sprint buff; the queue's a
   social spot. *Gives players:* a reason to stop in the middle of a scavenge; an NPC with gossip lines.
3. **SECOND-HAND ROSE'S** (a charity shop): a shelf of random junk for a few dollars, restocked each day; some of it
   is on the pawn shop's wanted list. *Gives players:* a small trading loop: buy low here, sell high at the pawn shop.

Cost guide: 3 interiors (one floor each, 2 lamps each), ~6 shopkeepers and customers (SPECIAL_KINDS), one terrace
façade. The BENCHMARK route gets a "High Street" stretch; perf-compare must stay within the per-change budget.

## Stage 2: R13, the alleys and fire escapes (already planned)

- Back alleys behind the blocks; fire escapes and ladders up to the roofs.
- **Rooftop caches**: a few loot spots only reachable from above. *Gives players:* exploration rewards, escape routes
  from the police, and shortcuts across the city at night.
- Cost: alley props are small pieces (drawn within 110 m); roofs are already in the city tiles.

## Stage 3: the pub's backlog

The pub brawl, the quiz night and the G-split champ (paused for this round). They reuse the pub's area, NPCs and HUD.

## Ideas for later (each a small, connected addition)

| Idea | What players do | Hooks into | Cost guide |
|---|---|---|---|
| A busker on the high street | tip them and a crowd gathers (a distraction for a till robbery nearby) | tills, NPC crowds, heat | 1 special NPC + a crowd near a player only |
| A night market (appears at sunset) | sell hot loot quietly at a worse price; no heat | the day/night cycle, police heat, pawn prices | a few stalls (small pieces), 2 lamps |
| Lost tourist | walk them back to their hotel for a tip; get mugged on the way | NPC follow, pursuit | 1 NPC |
| Regulars' rumours | a pub regular tells you where a cache is tonight (a pin on the M map) | the pub, the map, loot spawns | lines only |
| An arcade cabinet in the chippy | a quick high-score game; the best score of the match on a board | like the G chalkboard | one HUD canvas |

## What stays fixed

- Parody names only; no real pubs or brands; no landmarks unless Blake asks; no chest boxes on characters.
- Every addition: measured (BENCHMARK + perf-compare), built with the content guide, and no quality cut to the rest of
  the city to pay for it.
