# Adding to the city (R12.5)

How to add a building, an interior, characters or an activity so the city can keep growing without getting slower.
The worked example is THE SOGGY SHAMROCK. Before and after any addition, run the BENCHMARK and
`node tests/perf-compare.mjs` (see `docs/perf-budget.md`).

## 1. Where things live

| Part | Where | What it decides |
|---|---|---|
| Layout: footprints, collision boxes, doors, stations | `shared/src/city.ts` (+ a `XxxDef` in `shared/src/arena.ts`) | the same on every machine: the World's collision and rules use it |
| Rules and state: buying, games, NPC behaviour | `shared/src/world.ts`, `npcSim.ts`, `pubgames.ts` | authoritative: runs on the host (or in solo), sent to everyone |
| Looks: meshes, materials, lights | `client/src/game/cityRenderer.ts` (+ `areas.ts`) | drawing only: never changes what happens |
| Characters' looks | `client/src/game/npcRenderer.ts` (`LOOKS`) | no flat boxes on the chest (`NO_CHEST`) |

## 2. A building's outside

Build it with the city renderer's helpers (`box`, `cyl`, `sb` for textured pieces). Everything static is merged for you
**by 64 m map tile**, so it's culled with its tile; pieces under 1.2 m (sills, trims, plants, little signs) go in the
tile's small-piece mesh and stop drawing past 110 m. You don't need to do anything for that.

Do:
- reuse the colours and skins already in use (every colour is a vertex colour on one shared material; skins are
  cached per name and colour)
- size little round things with `sphereSegs(d, want)`: a 12 cm flower needs 36 triangles, not 256
- keep each building's detail to a few tens of thousands of triangles

Don't:
- make one giant mesh for a whole street by hand (it can't be culled)
- add a light per window or sign: signs and windows are **emissive** (they glow; they don't light anything)

## 3. An interior: an `InteriorArea`

The pub, from `cityRenderer.pubArea()`:

```ts
{
  id: "the-soggy-shamrock", rect: P.rect,                  // the walls' footprint
  floors: [{ y0: -1, y1: P.y2 }, { y0: P.y2, y1: 20 }],     // bottom up
  outside: { on: 60, off: 66 },                            // seen through the windows within 60 m; hidden past 66
  between: [stairsWell],                                   // where you can see up and down
  lights: [                                                // at most 6, 4 a floor, 18 m reach (LIGHT_BUDGET)
    { name: "pubLampBar", x, y, z, color: "#ffc883", range: 16, intensity: 1.0, floor: 0 },
    { name: "pubLampFire", ..., floor: 0, flicker: true },
    ...
  ],
}
```

Then, in the build:

```ts
const area = this.pubArea();
this.beginArea(area, 9301);       // makes a visibility group per floor (ids 9301, 9302)
this.buildPubInner();             // every piece built now goes in its floor's group (by where its centre is)
this.pubZone = null; this.flush();
this.areaLights(area, 9301);      // the lamps: each lights only its own floor's pieces
```

What you get: the insides are built while the city loads (no freeze when someone walks up), drawn only when they can
be seen, with a gap so they don't blink at the edge; the lamps don't touch the rest of the city's shaders; the light
budget is checked when it's built (a console warning) and in `client/test/areas.test.ts`.

Pick a new block of group ids (the pub uses 9301–9302; the clubs 9201+, stations 9001+, hot shops 9101+).

Moving parts (a fire's flames, pool balls, a jukebox) go under the area's own `TransformNode` (the pub's `pubDyn`),
switched off when nobody's within 90 m.

## 4. Characters

- Passers-by: `NPC_DEFS` in `shared/src/npc.ts`. Beyond 90 m of **every** player and only walking or idling, they update
  at 10 Hz (`NPC_LOD`); near anyone, or doing anything that matters, every step. A new everyday kind gets this for free.
- Characters with a job (a barman, a dealer, a bouncer): add the kind to `SPECIAL_KINDS`. They're always updated fully
  and never recycled.
- Looks: `LOOKS` in `npcRenderer.ts`; each look is merged into a few meshes when built.

## 5. An activity

- Rules and state in the shared World (like `pubgames.ts`): it only does work while someone's at it; idle stations are
  cheap. Results are decided by the host and sent to everyone.
- Its screen parts (HUD panels, overlays) must be removed in `dispose()`; leaving a game must leave nothing behind (the
  e2e checks this for the pint and the pub games).

## 5b. Things on walls, and things that move (R12.6)

- **Clearance**: every outlined mesh also writes its ink outline's depth, a few mm proud of it (the outline width:
  4-12 mm), with a depth bias that grows at grazing angles. Anything mounted on it (a picture's canvas, a mirror, a
  clock face, a sign board) sits **1.5-2.5 cm** in front of it, or it flickers and, from the side, vanishes behind the
  frame. Textured sheets (`sheet()`) also have a small polygon offset; don't rely on it alone.
- **No overlapping faces in one plane** (two colours of a sign overlapping flat): build bands as one solid with inlays
  in front (see Little Italy's arch). `tests/flicker-find.mjs` + `.py` finds z-fighting: frames 5 mm apart, pixels
  that flip back and forth (moving people and cars flag too: check by eye).
- **Lit with the room**: an interior's lamps light only its floor's meshes. People and moving props inside get added
  to the lamps of the floor they're on (`CityRenderer.pubLightDynamic`, a few times a second): copy that for a new
  interior, or its people stay sky-lit (grey-blue in a warm room at night).

## 6. Before you call it done

1. `npm test`, `npm run typecheck`
2. the BENCHMARK before and after (same machine, settings, route): `node tests/perf-compare.mjs before.json after.json`
3. screenshots from outside, inside, the stairs and the doors (nothing missing or popping)
4. at night: does it fit in without adding lights to the whole city?
