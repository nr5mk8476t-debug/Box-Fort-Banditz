# Queens layout v2: what changed and why

Blake's review of layout v1 (2026-11-17): the zoning was right, but it read as a big grid round a tiny fort island,
with coloured rectangles instead of neighbourhoods; the police dominated the north; the pub and the club were
isolated placeholders; the streets were too repetitive; and the times were only estimates. This is the correction,
still **as checked data** (`shared/src/queens/plan.ts` + `layout.ts`), still not built. The pictures are diagrams from
that data: [city-plan.md](city-plan.md).

## 1. The differences from the illustrated reference, and where each came from

| | Reference ("Queens Elevated Line") | v1 | Why (constraint or choice) | v2 |
|---|---|---|---|---|
| **Home block** | huge: about a third of the map's width (~320 m at our scale) | 98 m kerb to kerb; 24 m yards | **choice (a mistake):** v1 sized the yards smaller than the largest planned fort. The reference's size is decorative: at 320 m the yards would be ~140 m each and the low shops ~17 s further away | **140 m** kerb to kerb, sized from what has to fit: four 36 x 36 m yards (5.4x today's lot) holding the Mayor's Boxfort (house 18 x 14 m with porch, three shelf units, safe, workbench, board, two trap sockets, the mat behind a return wall, a usable yard), 28 m market lanes and a 28 m square |
| **Streets and blocks** | irregular, curving streets; blocks of many sizes; offset junctions | a regular grid of straight streets | **choice.** Straight segments are cheaper to build (kerbs, building fronts, collision, nav), but v1 overdid the regularity | still mostly straight, with **variation that earns its place**: Queasy Blvd offset 15 m at the home block (no sightline across the city), Rooster Velt bends up into the nightlife quarter, Stain Way jogs, Astorial St is two T-streets ending in small squares, Low Road and Flushed Ave are T-streets; blocks from 55 to 290 m long; long blocks split by alleys and cut-throughs |
| **Building cover** | dense attached brick rows, little empty land | ~2% (shops as boxes in empty rectangles) | **choice:** v1 drew zoning, not buildings | **every footprint drawn**: about 1,400 ordinary buildings from five block typologies, about half of the block land covered (courtyards, yards, loading and garages are the rest) |
| **Shops** | shopfronts in the rows | detached boxes | choice | **units in the rows**: wall-to-wall with neighbours, front door on the pavement, back door on the service alley; corner units where they suit; 16 playable + 10 reserved |
| **Alleys, courtyards** | cyan service alleys dog-legging through blocks | 6 straight alleys | choice | a 5 m service alley behind most rows, with yards and lock-up garages; cut-throughs across long blocks; courtyard blocks with two entrances; the landmarks' service lanes |
| **Railway** | a strong diagonal from the top centre-right to the bottom-right corner; the casino east of it; Neon Fever and the hotel west of it | almost north-south (82 m of drift over 690 m) | **choice** (v1 played safe with plots) | **(220, 345) -> (360, 40) -> (445, -345)**: 225 m of drift, the casino east of it, the club and the hotel west of it; a 7 m strip under it kept free of buildings (columns, parking, garages' yards) |
| **Police** | a modest station | 80 x 90 m in the middle of the north | choice (oversized) | **36 x 28 m** station + its impound yard, facing down Market St; the rest of that ground is Spur Court (flats round a courtyard) |
| **Pub, club** | anchors of their own streets | grey rectangles on the city's edge | choice | **embedded**: THE SOGGY SHAMROCK on the corner of Gnome Ave and Wood Havoc (balcony over the street, WEE MICKEY's yard on a back alley); NEON FEVER on the corner of Dit Marsh and Rooster Velt (its door on the junction, the club lane behind it for the fire exit and DON BINNIE's stairs), facing the casino's marquee across Rooster Velt |
| **Travel, encounters** | unknown scale | estimates 48-71 s to the borders | **constraint:** the ~60 s sprint (measured 573 m) sets the size | estimates **39-61 s** (average ~50); encounters at the 8 ring crossings, the offset Queasy junction, the nightlife strip, the alleys; still estimates until the blockout |
| **The removed roads** | pink-marked | red "road removed" boxes | Blake's call | still removed; the north spur is now the precinct's footpath and Spur Court, the south-east connector is rows of flats and a scrap yard. The annotations are gone from the drawings |

## 2. The home block (dimensioned in `img/queens-home-block.png`)
- Yards 36 x 36 m, exactly equal; front gates at the far end of each yard's market side (the mat sits behind a return
  wall, out of the lanes' sightlines); rear gates on the block's outer pavement, each facing its own crossing and its
  own low store across the road (the pinwheel).
- Market: two 28 m pedestrian lanes crossing in a 28 x 28 m square with the SELL, BUY, CRAFT and UPGRADE stalls and
  the board. Every approach is public: nobody crosses another player's yard.
- The block's own 5 m pavement, then FORT BLOCK ROAD (10 m, chamfered corners), then a 5 m pavement: 140 m kerb to
  kerb. No road between the yards or through the market. Eight crossings (four market exits, four rear gates).

## 3. Neighbourhoods: the five typologies (`shared/src/queens/layout.ts`)
- **Row:** attached buildings along every street side (shops or offices below, flats above: closed, no interiors), a
  5 m service alley down the middle, back yards either side, lock-up garages lining the alley where the yards are deep,
  a pedestrian cut-through every ~120 m on long blocks.
- **Corner:** the building at each end of a row is a square, one storey taller, facing both streets (corner shops
  wrap the junction).
- **Courtyard:** buildings all round a shared courtyard, entered on two opposite sides.
- **Workshop:** a row on one side, single-storey garages opposite, a loading yard open to the street.
- **Destination / precinct:** a big building (a landmark, the pub, the club, the police) with its forecourt,
  drop-off or service yard, and smaller neighbours along the rest of the frontage.

Reused efficiently: one kit per tier (low worn, mid established, high refined) of façade bays, corners, shopfronts,
garages and courtyard gates; one texture sheet per kit; instanced details (windows, fire escapes, AC units, awnings);
statics merged per map tile.

## 4. The roster
16 stores are playable in the first release (6 low / 5 mid / 5 high: Blake), plus the 4 landmarks. The full
roster's 10 other stores (6 low, 3 mid, 1 high) have **reserved shop units** in the rows now: closed shopfronts with
signs until their turn, so the street never has a gap. Market, police, pub and club are extra.

## 5. The landmarks (each a different shape and approach)
- **Bank (NW):** an L-shaped banking hall on the corner of Astorial St and Stain Way (commercial frontage); the counting
  room and vault behind; a gated armoured-van dock on the Stain Way side.
- **Casino (NE, east of the line):** a lit marquee forecourt on Rooster Velt, opposite the club; the floor; the cash
  office's door on East End Rd.
- **Museum (SW):** a columned front up steps from a public forecourt on Jamaker Ave; a goods yard on West End Rd.
- **Hotel (SE, west of the line):** a canopy and drop-off lay-by on Jamaker Ave; the lobby and an L of guest floors
  (tall, but only a few floors simulated); the loading bay off Dit Marsh.

## 6. The city's size
The 940 x 690 m comes from the journey, not the picture: 60 s of sprinting under the real stamina rules is 573 m on
open ground (measured), a few per cent less on streets; with routes ~1.2-1.4x the straight line, the edges sit
~335 m (north/south) and ~460 m (east/west) from the centre. On the plan that gives 39-61 s from the forts to the
four border points (average ~50 s), and **no stretch of empty land was added to reach 60**. Under "running without
sprinting" the same routes take 55-85 s.

## 7. Performance: what this layout is designed for (and what can't be measured yet)
- **Budgets** (proposed, on the test box, relative): any street view no worse than today's worst outdoor view +15%
  (today's park wide view: 317 draws / 227 meshes); the hub view inside that; interiors keep today's budgets; Blake's
  BENCHMARK: median +10%, 99th +20%, no new frames over 50 ms (CLAUDE.md).
- **Visibility:** rows of attached buildings block views far better than detached boxes; Queasy's offset and the
  Rooster bend break the long sightlines; fog distance culling (nothing drawn past the fog: 240 m day, 150 m night)
  is a Stage 2 task. The planning proxy in `city-plan.md` counts buildings within fog range: more city is in view
  than today, so the merge-per-tile, instancing and culling are requirements, not nice-to-haves.
- **Interiors only where you can go in:** the 16 playable shops, the landmarks, the pub and the club; everything else
  is a shell with one collision box. Interiors are drawn only when you're near or inside.
- **Simulation:** NPCs, police and traffic bounded by count and by today's distance-based levels; traffic on the main
  streets; the alleys are pedestrian. The host measured +0.2 ms a tick for twice the NPCs today.
- **Not measurable until the blockout:** draws, meshes and triangles per view, frame times, load time, memory, network.
