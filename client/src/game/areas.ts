// R12.5 (Blake: "I want Box Fort Banditz to grow substantially... a technical foundation that supports that growth"):
// INTERIOR AREAS. One way to describe a building you can walk into, so the next pub, shop or club costs only what you
// can see. THE SOGGY SHAMROCK is the worked example (cityRenderer.buildPub); docs/content-guide.md walks through adding one.
//
// What an area gives you, for free:
// - its insides sorted by floor, each floor its own visibility group (built while the city loads, drawn only when it
//   can be seen): from outside, all floors within `outside.on` m (the windows), hidden past `outside.off` (the gap
//   stops them flickering on and off at the edge); inside, only your own floor, except in a `between` space (stairs, a
//   gallery) where you can see up and down
// - its shell, signs and front stay with the city (and the city's tiles and fog culling)
// - its lamps: real point lights that light ONLY their floor's pieces, never the whole city; a budget checked when the
//   area's built (see LIGHT_BUDGET), so a new shop can't quietly add a dozen city-wide lights
// Pure functions only here (no Babylon): the city renderer applies them; the unit tests check them.
import type { Rect } from "@bfb/shared";

export interface AreaFloor { y0: number; y1: number }
export interface AreaLight { name: string; x: number; y: number; z: number; color: string; range: number; intensity: number; floor: number; flicker?: boolean }
export interface InteriorArea {
  id: string;
  /** the walls' footprint (pieces whose centre is inside, 0.35 m in from the walls, belong to the area) */
  rect: Rect;
  /** the floors, bottom up (a piece goes in the floor its centre is on) */
  floors: AreaFloor[];
  /** seen from outside: drawn within `on` m of the area's centre, hidden past `off` (off > on) */
  outside: { on: number; off: number };
  /** where you can see every floor (stairs, a gallery): inside this, all floors show */
  between?: Rect[];
  lights?: AreaLight[];
}

/** R12.5: the lighting budget for an interior (measured: the pub's 5 lamps cost nothing visible on the benchmark; a lamp
 *  only costs where its floor's pieces are drawn). A material lights at most `perMesh` lights, sun and sky included */
export const LIGHT_BUDGET = { perArea: 6, perMesh: 6, maxRange: 18, perFloor: 4 };

/** the visibility group ids for an area's floors (base + floor index) */
export const areaGroupId = (base: number, floor: number) => base + floor;

const inRect = (r: Rect, x: number, z: number, m = 0) => x > r.minX + m && x < r.maxX - m && z > r.minZ + m && z < r.maxZ - m;

/** which floor's group a piece goes in (its bounding-box centre), or -1 (outside the area: stays with the city) */
export function areaZone(a: InteriorArea, base: number, cx: number, cy: number, cz: number): number {
  if (!inRect(a.rect, cx, cz, 0.35)) return -1;
  for (let i = a.floors.length - 1; i >= 0; i--) if (cy >= a.floors[i].y0 - 0.05) return areaGroupId(base, i);
  return areaGroupId(base, 0);
}

/** should a floor be drawn, for a camera at (x, y, z)? `was`: whether it's showing now (for the outside gap) */
export function floorVisible(a: InteriorArea, floor: number, x: number, y: number, z: number, was: boolean): boolean {
  const cx = (a.rect.minX + a.rect.maxX) / 2, cz = (a.rect.minZ + a.rect.maxZ) / 2, d = Math.hypot(x - cx, z - cz);
  if (d > (was ? a.outside.off : a.outside.on)) return false;
  if (!inRect(a.rect, x, z, 0.2)) return true; // (outside, near: every floor, through the windows)
  if (a.between?.some((r) => inRect(r, x, z))) return true; // (on the stairs: up and down)
  const f = a.floors[floor];
  const next = a.floors[floor + 1];
  const top = next ? next.y0 : Infinity;
  // inside: the floor you're on (a little slack at the slab, so walking up the last step doesn't blink)
  return y > f.y0 - 0.3 && y < top + 0.4;
}

/** what's wrong with an area's lights (empty: within budget). Run when the area's built, and in the tests */
export function checkAreaLights(a: InteriorArea): string[] {
  const out: string[] = [], L = a.lights ?? [];
  if (L.length > LIGHT_BUDGET.perArea) out.push(`${a.id}: ${L.length} lights (budget ${LIGHT_BUDGET.perArea})`);
  for (const l of L) {
    if (l.range > LIGHT_BUDGET.maxRange) out.push(`${a.id}: ${l.name} reaches ${l.range} m (budget ${LIGHT_BUDGET.maxRange})`);
    if (!(l.floor >= 0 && l.floor < a.floors.length)) out.push(`${a.id}: ${l.name} lights floor ${l.floor}, which isn't one of its floors`);
  }
  for (let f = 0; f < a.floors.length; f++) {
    const n = L.filter((l) => l.floor === f).length;
    if (n > LIGHT_BUDGET.perFloor) out.push(`${a.id}: floor ${f} has ${n} lights (budget ${LIGHT_BUDGET.perFloor}: with the sun and the sky that's the most a material can take)`);
  }
  return out;
}
