# Trashington 400: the roadmap (after TR2)

Blake, after playing TR2 (2026-11-20): happy with the size of the city, the home square and the timing to the edge
and back. Next:
- make the home square a **roundabout** ("give life to the city... a bit more curvature");
- get as close as we can to the **style of his reference pictures**, watching draw calls;
- then **build the city, add the shops, add the game loop**.

This is the order, what each stage delivers, how it's tested and where Blake checks it. Numbered questions are at the
end. Nothing here is built until he's answered them.

---

## 0. How close can we get to the reference pictures?

**Close in look, not identical.** The pictures are a chunky, low-poly cartoon style:
- saturated colours;
- simple shapes with slightly rounded edges;
- painted-looking materials (brick courses, render, panels, wood planks, corrugated metal);
- big readable signs with icons;
- soft light with gentle shadows in the corners.

All of that can run at 60 FPS in the browser, with one exception: the soft global light and contact shadows an image
generator paints for free. Lighting every pixel like that in real time costs far too much. We fake it the way stylised
games do:

| In the pictures | How we'd do it | Cost |
|---|---|---|
| Painted materials (brick, render, wood, metal, shutters) | ONE texture sheet (a "trim sheet": strips of brick, render, window frames, shutters, planks) shared by every building | 1-2 materials for the whole city: merging still works |
| Soft corners and shading (ambient occlusion) | painted into the texture and into the vertex colours when a block is built (darker at the ground and in corners) | free at run time |
| Warm sun, cool shade | a hemisphere light (warm above, cool below) plus the sun; one shadow map only near the player, or none (Blake's call) | small |
| Rounded, chunky edges | bevelled kit pieces (cornices, sills, awnings, door frames) built once and reused | instanced: 1 draw per kind per tile |
| Shop signs with icons (the wrench, the plug, the beer, the museum columns) | sign art painted on the shared sign sheet (we have it), the 3D icon signs as a few kit pieces | 1-2 draws for every sign in view |
| Props (cones, pallets, bins, bollards, bikes, plants) | instanced kit props | 1 draw per prop kind per tile |
| The dark ink outline round everything (today's look) | **a choice**: the pictures don't have one. Keep it, thin it, or drop it (dropping it makes every view cheaper) | dropping it saves ~10-20% of draws |

**Blake's reference pictures help a lot.** One per place (each shop's front, a wide street, the home square, a
landmark, night) gives us a target to build the kit from. They're references, not textures we paste in: the style is
rebuilt with the kit and the trim sheet so it stays cheap.

**The draw-call rule for all of it:**
- every new view stays inside the budgets (`tests/draw-budget.mjs`: draws and meshes per view; +15% per change at most);
- static things are merged per map tile, props instanced, interiors drawn only near them;
- the frame follows the MESHES drawn on Blake's PC (~7 µs each), so mesh counts are what we watch hardest.

---

## Stage 1: the roundabout and the final city layout (2-3 rounds)

**1a. The roundabout.**
- The square ring road round the home block becomes a circle. The four yards and the market sit in a round park in the
  middle: grass verges, trees, a path round the inside, the market plaza at the centre.
- The four spokes meet it at the pinwheel offsets they have now.
- Pedestrian crossings at each spoke and outside each fort's gate.
- Cars go round it: the existing traffic system already drives a roundabout (the old city has one).
- Measured: the walk from each mat to its nearest landmark stays within 1 s of today's, and all four forts stay equal.

**1b. The final massing of the whole city.**
- Every block at its real height and depth; the alleys and back lanes; the landmark corners; the El on its columns.
- Collision, the pedestrian network (NPC walking lines and crossings) and the car network (lanes, junctions, the
  roundabout's give-way).
- Lamp posts, street names, the edge (the shore, the rail yard, the expressway wall).
- Still grey off the test route: this is about the space feeling right before it's dressed.

**1c. Performance foundation for the new city.**
- Merged map tiles, fog distance and culling, interior areas.
- The fixed views for the draw budget: the roundabout, each avenue, each landmark corner, the El, the pub's lane.
- The benchmark route rewritten for the new city.

Blake checks: a play of the roundabout version (with Tyson), and his PC's BENCHMARK.

## Stage 2: the style ("the kit"), proven on one street (2-3 rounds)

**2a. The style sheet.** From Blake's reference pictures, an agreed set of:
- palettes per district (worn low end, established middle, refined high end);
- materials and window styles;
- sign style;
- light settings for day and night.

**2b. The kit.**
- About 30 façade pieces: terrace bays, shopfronts, corner shops, cornices, awnings, roller shutters, fire escapes,
  rooftop clutter.
- About 30 street props.
- One trim sheet and one sign sheet.

**2c. One finished street.** Stain Way south, the test route, built to the final look: both sides, day and night,
PLUG & PRAY and FISHY BUSINESS's fronts, the pub's front. Measured against the budget.

Blake checks: the finished street from the pavement, across the road, from above and at night, with its draw numbers
(the same rule as the first finished shop in R15). **Only then** is the kit used everywhere.

## Stage 3: dress the city (2-3 rounds)

- Every street with the kit, district by district: low end first (the forts' side), then middle, then uptown.
- Each district's character: worn and cluttered at the low end, tidy shopping streets in the middle, refined uptown.
- The roundabout park, the landmarks' outsides (the bank, the casino, the museum, the hotel), the El and its
  stations.
- Night: the windows lit, lamp posts, neon on the club and the pub, a few real lights (6 per mesh, 4 per floor at
  most).

Blake checks: a walk through each district, day and night; the BENCHMARK after each district.

## Stage 4: the shops (4-6 rounds)

- **4a. Merge R15's shop stock** (on `claude/new-session-wsgpbp`):
  - stock as data, rolled each cycle;
  - counters that sell, never buy;
  - security, alarms and lock-picking;
  - no loot in the street.

  Moved onto the new city's shop plots.
- **4b. The 20 first-release shops** (8 low, 7 mid, 5 high-end), each a proper business to the R15 brief:
  - about twice today's floor area;
  - an entrance, a counter, sections and a stockroom;
  - aisles wide enough for bulky loot and chases;
  - a back door onto the lane;
  - a joke or two.

  Built from the kit's interior pieces, two or three shops a round, the test route's first: PLUG & PRAY, FISHY
  BUSINESS, the four starter shops by the forts.
- **4c. The landmarks' insides:**
  - the museum first (it's in the test);
  - then the bank (the vault, the van dock);
  - the casino (the floor, the cash office);
  - the hotel (the lobby, service corridors, the penthouse).
- **4d. The pub and the club move in.** THE SOGGY SHAMROCK's existing interior onto Stain Way (WEE MICKEY's yard on
  Wood Havoc Lane behind it). NEON FEVER onto the Dit Marsh corner under the El.

Every shop: within the per-view budget (+70 meshes at most in any view), its interior drawn only near it.

Blake checks: the first finished shop before the approach is copied, then a walk through every shop.

## Stage 5: the game loop on the new city (2-3 rounds)

- **The forts at 18 m:** the upgrades redesigned to stack upward (towers, platforms, a roof deck) instead of spreading
  out, so the Mayor's Boxfort fits.
- **The market:** the SELL / BUY / UPGRADE / CRAFT stalls become the real counters (selling in PREP, the van, the
  safe, crafting); Sal's board in the middle.
- **Quests and jobs** pointed at the new places (`questLocs`): the boss's jobs, the aura tasks.
- **The cops:**
  - the precinct on Market St;
  - patrols on the avenues and the roundabout;
  - heat and chases tuned to the smaller city (and the 10% pace, if it stays).
- **Events:** the garbage truck's routes, the airdrop spots, the raccoons, happy hour, a parade route.
- **The Mayor's campaign:** posters, the podium, the President's route.
- **People:** passers-by on the new pavements, shoppers in the shops.

Blake checks: a full 8-cycle game with Tyson; the playtest recorder's reports; balance (prices, cycle length).

## Stage 6: make it the game (1-2 rounds)

- The new city becomes the default map; the old one stays for its tests only.
- The e2e test rewritten for the new city.
- The BENCHMARK with a friend; the last performance fixes.

---

## The order, and why

1. **City layout before style.** Dressing a street that then moves is wasted work, so the roundabout and the massing
   come first and get played.
2. **Style on one street before everywhere,** so Blake approves the look and its draw cost once.
3. **Shops after the city's look,** so they're built from the same kit (cheaper, consistent).
4. **The loop last, but early enough to play:** the market, quests and cops depend on where things are.

Throughout:
- every round keeps the test map playable;
- every round runs the full checks;
- every round reports its draw and mesh numbers.

## Questions for Blake

1. **The roundabout:** a circle round the whole home block (the yards inside a round park, the market at its centre),
   or the yards kept square with only the road and its corners rounded? The first is more "park", the second keeps
   today's sizes exactly.
2. **Cars on the roundabout and the avenues:** yes (life, and something to dodge), or quiet streets until Stage 5?
3. **The ink outline:** keep it (today's look), thin it, or drop it to match the pictures (cheaper too)?
4. **Shadows:** a soft shadow near the player (costs a little), or none, with the shading painted in?
5. **Reference pictures:** will you make one per place (each shop front, a wide street, the home square, the
   landmarks, night)? Which first: Stain Way and the home square?
6. **The 10% pace:** keep it for the real game, or was it only for the grey test?
7. **The park in the middle:** trees and grass only, or a centrepiece (a fountain, a statue of the Mayor)? (A new
   landmark only if you want one.)
8. **First-release shops:** still the 20 (8 / 7 / 5), or fewer, finished better, first?
