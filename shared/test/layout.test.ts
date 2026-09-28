// City Redesign C1: the layout grey-box. Roads all joined, blocks filled, alleys connected, forts fair.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrashington, buildLanes, onRoadAt, inWater, nearBoxes, inRect, tierAt, fortAt, PLAYER, RING, COMPOUND, HIGHWAY,
  type ArenaLayout,
} from "../src/index.js";

const city = buildTrashington();

// ---- a walking grid (0.5 m cells) over the whole map: can a bandit stand here? --------------------
const CELL = 0.5, N = Math.round((city.halfSize * 2) / CELL);
const toI = (v: number) => Math.floor((v + city.halfSize) / CELL);
const cx = (i: number) => -city.halfSize + (i + 0.5) * CELL;
function walkGrid(c: ArenaLayout) {
  const free = new Uint8Array(N * N);
  const r = PLAYER.radius;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = cx(i), z = cx(j);
    let ok = true;
    for (const b of nearBoxes(c, x, z, r + 0.1)) {
      const top = b.y + b.h / 2, bot = b.y - b.h / 2;
      if (top <= 0.45 || bot >= 1.8) continue; // steppable / overhead
      if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) { ok = false; break; }
    }
    free[i * N + j] = ok ? 1 : 0;
  }
  return free;
}
const free = walkGrid(city);
/** Walking distance (m) from a point to every cell (4-neighbour BFS, roads included). */
function distFrom(x: number, z: number): Float32Array {
  const d = new Float32Array(N * N).fill(Infinity);
  const q = new Int32Array(N * N);
  let h = 0, t = 0;
  const s = toI(x) * N + toI(z);
  d[s] = 0; q[t++] = s;
  while (h < t) {
    const k = q[h++], i = Math.floor(k / N), j = k % N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const m = a * N + b;
      if (!free[m] || d[m] !== Infinity) continue;
      d[m] = d[k] + CELL; q[t++] = m;
    }
  }
  return d;
}

test("C1 roads: straight and axis-aligned (the ring is the only curve), all joined, no dead ends", () => {
  const net = city.roadNet!;
  for (const e of net.edges) {
    if (e.arc) continue;
    const a = e.pa ?? [net.nodes[e.a].x, net.nodes[e.a].z], b = e.pb ?? [net.nodes[e.b].x, net.nodes[e.b].z];
    assert.ok(a[0] === b[0] || a[1] === b[1], `${e.name}: straight (${a} -> ${b})`);
  }
  const lanes = buildLanes(net);
  const road = lanes.filter((l) => !l.conn);
  // every road lane leads on somewhere, and from any road lane you can drive to any other
  for (const l of road) assert.ok(l.outs.length > 0, `dead end on ${net.edges[l.edge].name}`);
  const reach = (from: number) => {
    const seen = new Set([from]), st = [from];
    while (st.length) {
      const l = lanes[st.pop()!];
      const nxt = l.conn ? [l.outLane] : l.outs;
      for (const n of nxt) if (!seen.has(n)) { seen.add(n); st.push(n); }
    }
    return seen;
  };
  for (const l of road) {
    const s = reach(l.id);
    const missing = road.filter((o) => !s.has(o.id));
    assert.equal(missing.length, 0, `from ${net.edges[l.edge].name} you can't reach ${missing.map((o) => net.edges[o.edge].name).join(", ")}`);
  }
  // lanes run on the asphalt
  for (const l of lanes) for (const p of l.pts) assert.ok(onRoadAt(city, p.x, p.z, 0.4), `lane point ${p.x.toFixed(1)},${p.z.toFixed(1)} off the road`);
  // lights only where the Mile crosses the two crosstown streets; a roundabout; give way elsewhere
  const lights = net.nodes.filter((n) => n.ctl === "light");
  assert.deepEqual(lights.map((n) => [n.x, n.z]), [[0, -50], [0, 50]]);
  assert.equal(net.nodes.filter((n) => n.ctl === "round").length, 4);
  assert.ok(net.nodes.filter((n) => n.ctl === "give").length >= 15);
  assert.ok(net.edges.some((e) => e.name === "Mayor's Mile") && net.edges.some((e) => e.name === "City Hall Loop" && e.oneway) && net.edges.some((e) => e.name === "Market Row" && e.oneway));
});

test("C1 blocks: no blank street frontage over 15 m, no empty ground, landmarks at most half a block", () => {
  const tall = city.boxes.filter((b) => b.y - b.h / 2 < 1 && b.y + b.h / 2 > 2.5);
  const covered = (x: number, z: number) => tall.some((b) => Math.abs(x - b.x) <= b.w / 2 + 0.05 && Math.abs(z - b.z) <= b.d / 2 + 0.05);
  const SW = 4;
  const gaps: string[] = [];
  let sidesChecked = 0, worstAll = 0;
  for (const bl of city.blocks!) {
    for (const s of bl.sides ?? []) {
      if (bl.open?.includes(s.dir)) continue;
      const r = bl.rect, ns = s.dir === "N" || s.dir === "S";
      const lo = s.from ?? (ns ? r.minX : r.minZ), hi = s.to ?? (ns ? r.maxX : r.maxZ);
      let run = 0, worst = 0;
      for (let u = lo + SW; u <= hi - SW; u += 0.5) {
        let hit = false;
        for (let d = SW + 0.3; d <= SW + 4 && !hit; d += 0.5) {
          const x = ns ? u : s.dir === "E" ? r.maxX - d : r.minX + d, z = ns ? (s.dir === "N" ? r.maxZ - d : r.minZ + d) : u;
          if (Math.hypot(x, z) < RING.clear + 12) { hit = true; break; } // (round the roundabout: the promenade)
          hit = covered(x, z);
        }
        run = hit ? 0 : run + 0.5; worst = Math.max(worst, run);
      }
      sidesChecked++; worstAll = Math.max(worstAll, worst);
      if (worst > 15) gaps.push(`${bl.name} ${s.dir}: ${worst} m`);
    }
  }
  console.log(`  ${sidesChecked} street sides checked, longest blank stretch ${worstAll} m`);
  assert.ok(sidesChecked > 60);
  assert.deepEqual(gaps, [], "blank frontage");
  // every bit of ground is something: road, pavement / plaza / yard, a building, water or the park
  const flat = city.boxes.filter((b) => b.y + b.h / 2 <= 0.2 && b.h <= 0.2);
  const empty: string[] = [];
  for (let x = -114; x <= 114; x += 2) for (let z = -114; z <= 114; z += 2) {
    if (onRoadAt(city, x, z) || inWater(city, x, z) || Math.hypot(x, z) < RING.r0) continue;
    if (nearBoxes(city, x, z, 0).some((b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2 && b.y - b.h / 2 < 0.5)) continue;
    if (flat.some((b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2)) continue;
    empty.push(`${x},${z}`);
  }
  console.log(`  ground samples with nothing on them: ${empty.length}`);
  assert.ok(empty.length <= 6, `empty ground at ${empty.slice(0, 10).join(" ")} (${empty.length})`);
  // landmark shells: named, and none takes more than half its block
  const names = ["TRASHINGTON CITY HALL", "LUCKY DUMPSTER CASINO", "TRASHCORP HQ", "GRAND HOTEL", "MUSEUM OF OLD STUFF", "LUXURY MALL", "PARK-O-RAMA", "COUNTRY CLUB",
    "GRAND STATION", "MARINA OFFICE", "TRASHINGTON PD", "ST. DUMPSTER'S", "THE BIJOU", "LUCKY NOODLE GATE", "MARKET ROW HALL", "OPENING 1987", "THE ARCHES", "BUS DEPOT",
    "BUILD YARD", "OUR MAYOR"];
  for (const n of names) assert.ok(city.boxes.some((b) => b.sign?.includes(n)), `landmark ${n}`);
  for (const bl of city.blocks!) {
    if (bl.open?.length === 4) continue;
    const area = (bl.rect.maxX - bl.rect.minX) * (bl.rect.maxZ - bl.rect.minZ);
    for (const b of city.boxes) {
      if (!b.sign || !names.some((n) => b.sign!.includes(n)) || !inRect(bl.rect, b.x, b.z)) continue;
      assert.ok(b.w * b.d <= area / 2 + 1, `${b.sign} takes ${((b.w * b.d) / area * 100).toFixed(0)}% of ${bl.name}`);
    }
  }
});

test("C1 alleys: every bit of walkable ground connects to the streets (no sealed courtyards)", () => {
  const home = distFrom(0, -89 + 5.5); // (the service road pavement)
  const pockets: string[] = [];
  const st = city.station!;
  for (let i = 2; i < N - 2; i += 2) for (let j = 2; j < N - 2; j += 2) {
    const k = i * N + j;
    if (!free[k] || home[k] !== Infinity) continue;
    const x = cx(i), z = cx(j);
    if (st.cells.some((c) => inRect(c.rect, x, z, 1))) continue; // (jail cells are locked, by design)
    pockets.push(`${x.toFixed(1)},${z.toFixed(1)}`);
  }
  assert.ok(pockets.length === 0, `sealed ground at ${pockets.slice(0, 12).join(" ")} (${pockets.length} cells)`);
});

test("C1 Tent Town: 4 walled compounds under the highway, evenly spaced, a gate and a squeeze gap each", () => {
  const forts = city.forts!;
  assert.equal(forts.length, 4);
  assert.deepEqual(forts.map((f) => f.x), COMPOUND.xs);
  const xs = [...COMPOUND.xs].sort((a, b) => a - b);
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - 66) < 1, "about 66 m apart");
  // 2 players: the two back corners; 3 players: + one of the middle two
  assert.deepEqual([Math.abs(forts[0].x), Math.abs(forts[1].x)], [99, 99]);
  const deck = city.boxes.find((b) => b.sign === "INTERSTATE 0")!;
  assert.ok(Math.abs(deck.y - deck.h / 2 - HIGHWAY.y) < 0.01 && deck.w > 220);
  for (const f of forts) {
    assert.ok(f.z > deck.z - deck.d / 2 && f.z < deck.z + deck.d / 2, "under the highway");
    assert.equal(fortAt(city, f.padX, f.padZ), f.slot);
    // walls too tall to climb; the gate and the gap are open
    const walls = city.boxes.filter((b) => b.kind === "wall" && Math.abs(b.x - f.x) < 9 && b.z < -95 && b.z > -112 && b.h === COMPOUND.wallH);
    assert.ok(walls.length >= 6, `${walls.length} wall pieces`);
    assert.ok(free[toI(f.x) * N + toI(COMPOUND.z1)], "gate open");
    assert.ok(free[toI(f.gapX!) * N + toI(COMPOUND.z0)], "squeeze gap open");
    assert.ok(!free[toI(f.x + 3) * N + toI(COMPOUND.z1)], "wall beside the gate");
  }
});

test("C1 fairness: from every fort, the walk to the nearest quarter of the richest 20% of loot is within 5% (the average over all of it is reported)", () => {
  const spawns = city.lootSpawns!.filter((s) => !s.pool);
  // richness: tier first, then how far north (the city gets richer toward City Hall)
  const rich = [...spawns].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || b.z - a.z).slice(0, Math.ceil(spawns.length * 0.2));
  assert.ok(rich.every((s) => s.tier === 2), "the richest 20% are all in the high tier");
  const avg: number[] = [], near: number[] = [];
  for (const f of city.forts!) {
    const d = distFrom(f.padX, f.padZ);
    const ds: number[] = [];
    for (const s of rich) {
      // (a spot up on a roof: the distance to the ground under it)
      let best = Infinity;
      for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) best = Math.min(best, d[(toI(s.x) + di) * N + toI(s.z) + dj] ?? Infinity);
      assert.ok(best < Infinity, `loot at ${s.x},${s.z} reachable from fort ${f.slot}`);
      ds.push(best);
    }
    ds.sort((a, b) => a - b);
    avg.push(ds.reduce((a, b) => a + b, 0) / ds.length);
    const k = Math.ceil(ds.length / 4);
    near.push(ds.slice(0, k).reduce((a, b) => a + b, 0) / k);
  }
  console.log(`  forts -> all of the richest 20%: ${avg.map((a) => a.toFixed(1)).join(" / ")} m (spread ${((Math.max(...avg) / Math.min(...avg) - 1) * 100).toFixed(1)}%)`);
  console.log(`  forts -> nearest quarter of it: ${near.map((a) => a.toFixed(1)).join(" / ")} m (spread ${((Math.max(...near) / Math.min(...near) - 1) * 100).toFixed(1)}%)`);
  const lo = Math.min(...near), hi = Math.max(...near);
  assert.ok(hi / lo <= 1.05, `spread ${((hi / lo - 1) * 100).toFixed(1)}%`);
});

test("C1 tiers: low in the south, medium in the middle, high in the north; cops' precinct by the park", () => {
  const byTier = [0, 1, 2].map((t) => city.lootSpawns!.filter((s) => (s.tier ?? tierAt(s.z)) === t).length);
  assert.ok(byTier.every((n) => n >= 20), `loot per tier ${byTier}`);
  assert.equal(tierAt(-80), 0); assert.equal(tierAt(0), 1); assert.equal(tierAt(80), 2);
  const st = city.station!;
  assert.ok(st.rect.minZ > RING.r1 && st.rect.maxX > 0 && st.rect.minX < 30, "police precinct just north of the roundabout");
  assert.ok(Math.hypot(st.door.x, st.door.z) < 35, "its door faces the park");
});
