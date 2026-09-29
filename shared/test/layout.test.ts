// City Redesign C1: the layout grey-box. Roads all joined, blocks filled, alleys connected, forts fair.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrashington, buildLanes, onRoadAt, inWater, inDeepWater, nearBoxes, inRect, tierAt, fortAt, PLAYER, RING, COMPOUND, HIGHWAY,
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
  assert.ok(net.edges.some((e) => e.name === "Mayor's Mile") && net.edges.some((e) => e.name === "City Hall Drive" && e.oneway) && net.edges.some((e) => e.name === "Market Row" && e.oneway));
  // C1.1: no road behind City Hall any more (the Mayor's garden runs up to North Parade); Gold St one-way east
  assert.ok(!net.edges.some((e) => !e.arc && Math.abs((e.pa?.[1] ?? net.nodes[e.a].z) - 96) < 1 && Math.abs(net.nodes[e.a].x) < 25), "no road at z 96");
  assert.ok(net.edges.filter((e) => e.name === "Gold St").every((e) => e.oneway && net.nodes[e.b].x > net.nodes[e.a].x), "Gold St runs east only");
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
    if (onRoadAt(city, x, z) || inWater(city, x, z) || inDeepWater(city, x, z) || Math.hypot(x, z) < RING.r0) continue;
    if (nearBoxes(city, x, z, 0).some((b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2 && b.y - b.h / 2 < 0.5)) continue;
    if (flat.some((b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2)) continue;
    empty.push(`${x},${z}`);
  }
  console.log(`  ground samples with nothing on them: ${empty.length}`);
  assert.ok(empty.length <= 6, `empty ground at ${empty.slice(0, 10).join(" ")} (${empty.length})`);
  // landmark shells: named, and none takes more than half its block
  const names = ["TRASHINGTON CITY HALL", "LUCKY DUMPSTER CASINO", "TRASHCORP HQ", "GRAND HOTEL", "MUSEUM OF OLD STUFF", "LUXURY MALL", "GILDED PIGEON RESIDENCES", "COUNTRY CLUB",
    "GRAND STATION", "MARINA OFFICE", "TRASHINGTON PD", "ST. DUMPSTER'S", "THE BIJOU", "LUCKY NOODLE GATE", "MARKET ROW HALL", "OPENING 1987", "THE ARCHES", "SEWER OUTFALL",
    "BUILD YARD", "OUR MAYOR", "RESERVED FOR THE NEXT MAYOR"];
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

test("C1.1 Tent Town: 4 open fort yards (no walls) under the highway, evenly spaced between the railway and the canal", () => {
  const forts = city.forts!;
  assert.equal(forts.length, 4);
  assert.deepEqual(forts.map((f) => f.x), COMPOUND.xs);
  const xs = [...COMPOUND.xs].sort((a, b) => a - b);
  // even: the same gap between neighbours, and half of it from the outer yards to the railway / canal
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - 47.5) < 0.01, "47.5 m apart");
  assert.ok(Math.abs(xs[0] - -95 - 23.75) < 0.01 && Math.abs(95 - xs[3] - 23.75) < 0.01, "evenly between the railway and the canal");
  // 2 players: the two back corners; 3 players: + one of the middle two
  assert.deepEqual([Math.abs(forts[0].x), Math.abs(forts[1].x)], [71.25, 71.25]);
  const deck = city.boxes.find((b) => b.sign === "INTERSTATE 0")!;
  assert.ok(Math.abs(deck.y - deck.h / 2 - HIGHWAY.y) < 0.01 && deck.w > 220, "the highway runs right across, over the railway and the canal");
  for (const f of forts) {
    assert.ok(f.z > deck.z - deck.d / 2 && f.z < deck.z + deck.d / 2, "under the highway");
    assert.equal(fortAt(city, f.padX, f.padZ), f.slot);
    // open yard: nothing tall around it (no walls), walkable in from every side
    const walls = city.boxes.filter((b) => b.kind === "wall" && b.h > 1.2 && b.h < 5 && inRect(f.zone, b.x, b.z, 1));
    assert.equal(walls.length, 0, "no walls");
    for (const [x, z] of [[f.x, f.zone.maxZ + 1], [f.zone.minX - 1, f.padZ], [f.zone.maxX + 1, f.padZ], [f.x, f.zone.minZ - 1]]) assert.ok(free[toI(x) * N + toI(z)], `open at ${x},${z}`);
  }
  // the railway and the canal both reach the south fence
  const rails = city.scenery!.filter((s) => s.kind === "rail");
  assert.ok(rails.every((r) => r.z - r.d! / 2 <= -114), "tracks to the south fence");
  assert.ok(city.deepWater!.some((w) => w.minZ <= -107), "the canal runs down past the forts");
  assert.ok(city.boxes.some((b) => b.sign?.includes("SEWER OUTFALL")) && city.boxes.some((b) => b.sign?.includes("(RETIRED)")), "outfall + boxcar siding at the south end");
  assert.ok(!city.boxes.some((b) => b.sign?.includes("BUS DEPOT") || b.sign?.includes("PARK-O-RAMA")), "no bus depot, no car park");
});

test("C1 fairness: from every fort, the walk to the richest loot stays within Blake's accepted spread (C1.1: 5% target relaxed, numbers reported)", () => {
  const spawns = city.lootSpawns!.filter((s) => !s.pool);
  // richest 20%: high tier first, then closest to City Hall (the richest spot in town)
  // (C1.1: the tie-break used to be "furthest north", which just rewarded whichever side of Uptown Ave's
  //  jog sits 4 m further north)
  const hall = { x: 0, z: 83 };
  const rich = [...spawns].sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || Math.hypot(a.x - hall.x, a.z - hall.z) - Math.hypot(b.x - hall.x, b.z - hall.z)).slice(0, Math.ceil(spawns.length * 0.2));
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
  // (the brief's target was 5%. With the forts moved in for C1.1 it measures ~9% on this metric;
  //  Blake accepted the fairness as good enough on 2026-09-28. This guard catches it getting worse.)
  const lo = Math.min(...near), hi = Math.max(...near);
  assert.ok(hi / lo <= 1.12, `spread ${((hi / lo - 1) * 100).toFixed(1)}%`);
});

test("C1 tiers: low in the south, medium in the middle, high in the north; cops' precinct by the park", () => {
  const byTier = [0, 1, 2].map((t) => city.lootSpawns!.filter((s) => (s.tier ?? tierAt(s.z)) === t).length);
  assert.ok(byTier.every((n) => n >= 20), `loot per tier ${byTier}`);
  assert.equal(tierAt(-80), 0); assert.equal(tierAt(0), 1); assert.equal(tierAt(80), 2);
  const st = city.station!;
  assert.ok(st.rect.minZ > RING.r1 && st.rect.maxX > 0 && st.rect.minX < 30, "police precinct just north of the roundabout");
  assert.ok(Math.hypot(st.door.x, st.door.z) < 35, "its door faces the park");
});

test("C2 façades: every street building has a front facing its street and a parody sign, no repeats in a block", () => {
  const fronts = city.boxes.filter((b) => b.front);
  assert.ok(fronts.length > 50, `street buildings with a front: ${fronts.length}`);
  let signed = 0;
  for (const b of fronts) {
    assert.ok(b.face, "a front knows which way its street is");
    const [fx, fz] = b.face!;
    // the street side really is a street: a step out from the face is pavement or road, not another building
    const px = b.x + fx * (b.w / 2 + 2), pz = b.z + fz * (b.d / 2 + 2);
    const blocked = city.boxes.some((q) => (q.kind === "building" || q.kind === "tower") && q !== b && Math.abs(px - q.x) < q.w / 2 && Math.abs(pz - q.z) < q.d / 2);
    assert.ok(!blocked, `front at ${b.x.toFixed(1)},${b.z.toFixed(1)} faces another building`);
    if (b.front === "shop") assert.ok(b.h >= 4.8, `a shop is tall enough for its shopfront + fascia sign (${b.h} m)`);
    const width = fx ? b.d : b.w;
    if (width >= 3) { assert.ok(b.sign, `a ${width.toFixed(1)} m front at ${b.x.toFixed(1)},${b.z.toFixed(1)} has no sign`); signed++; }
  }
  assert.ok(signed >= fronts.length * 0.9, `signed ${signed} of ${fronts.length} (slivers under 3 m wide go without)`);
  for (const blk of city.blocks ?? []) {
    const names = fronts.filter((b) => b.sign && inRect(blk.rect, b.x, b.z)).map((b) => b.sign!);
    assert.equal(new Set(names).size, names.length, `${blk.name} repeats a sign: ${names.join(", ")}`);
  }
});

test("C2 façades: no two neighbours alike (touching street buildings differ in colour)", () => {
  const fronts = city.boxes.filter((b) => b.front);
  let pairs = 0;
  for (let i = 0; i < fronts.length; i++) for (let j = i + 1; j < fronts.length; j++) {
    const a = fronts[i], c = fronts[j];
    if (a.face![0] !== c.face![0] || a.face![1] !== c.face![1]) continue; // (same street side only)
    const touchX = Math.abs(a.x - c.x) <= (a.w + c.w) / 2 + 0.05 && Math.abs(a.z - c.z) < (a.d + c.d) / 2 - 0.5;
    const touchZ = Math.abs(a.z - c.z) <= (a.d + c.d) / 2 + 0.05 && Math.abs(a.x - c.x) < (a.w + c.w) / 2 - 0.5;
    if (!touchX && !touchZ) continue;
    pairs++;
    assert.ok(a.color && c.color && a.color !== c.color, `neighbours at ${a.x.toFixed(1)},${a.z.toFixed(1)} and ${c.x.toFixed(1)},${c.z.toFixed(1)} share ${a.color}`);
    assert.notEqual(a.sign, c.sign, "neighbours share a sign");
  }
  assert.ok(pairs >= 10, `neighbour pairs checked: ${pairs}`);
});

test("C3 park: a pear-shaped pond you can wade in, a fountain with a rim you can step over, bushes on the lawn, all inside the ring", () => {
  const shape = city.pondShape!;
  assert.equal(shape.length, 2, "a big round end and a small one");
  const inShape = (x: number, z: number) => shape.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
  const pondStrips = city.water!.filter((r) => inShape((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2));
  assert.ok(pondStrips.length >= 20, `wading strips across the pear: ${pondStrips.length}`);
  for (const r of pondStrips) for (const [x, z] of [[r.minX + 0.05, (r.minZ + r.maxZ) / 2], [r.maxX - 0.05, (r.minZ + r.maxZ) / 2]]) assert.ok(inShape(x, z), `strip edge ${x.toFixed(1)},${z.toFixed(1)} is outside the pear`);
  // the pear: the small end is narrower than the big one
  assert.ok(shape[1].r < shape[0].r * 0.75);
  assert.ok(inWater(city, 10, -2) && inWater(city, 10, 4) && !inWater(city, 10, -7.2), "wading in both ends, dry outside");
  // the fountain: shallow water inside a rim low enough to step over
  assert.ok(inWater(city, 2, 2), "wading in the fountain");
  const rims = city.boxes.filter((b) => b.kind === "rim" && Math.hypot(b.x, b.z) < 4);
  assert.equal(rims.length, 4);
  for (const r of rims) assert.ok(r.h <= PLAYER.stepHeight, "you can step over the fountain rim");
  // bushes on the lawn, not in the water, inside the roundabout
  assert.ok(city.bushes!.length >= 5);
  for (const b of city.bushes!) {
    const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    assert.ok(Math.hypot(x, z) < RING.r0 - 3 && !inShape(x, z) && !inWater(city, x, z), `bush at ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  // no loot and no bench in the pond
  for (const s of city.lootSpawns!) assert.ok(!inShape(s.x, s.z) || s.y > 0.2, `loot in the pond at ${s.x},${s.z}`);
  assert.ok(city.posts!.some((p) => p.kind === "fisherman" && !inWater(city, p.x, p.z)), "the fisherman stands on dry land (his jetty)");
});
