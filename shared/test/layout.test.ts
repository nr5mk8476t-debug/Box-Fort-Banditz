// City Redesign C1: the layout grey-box. Roads all joined, blocks filled, alleys connected, forts fair.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrashington, setCityMap, setBoxOff, NEW, footSd, inFoot, lootDef, STALL_LOOT, DELI_LOOT, buildLanes, onRoadAt, inWater, inDeepWater, nearBoxes, inRect, tierAt, fortAt, PLAYER, RING, COMPOUND, HIGHWAY,
  type ArenaLayout,
} from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

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
function distFrom(x: number, z: number, fr: Uint8Array = free): Float32Array {
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
      if (!fr[m] || d[m] !== Infinity) continue;
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
  const names = ["TRASHINGTON CITY HALL", "LUCKY DUMPSTER CASINO", "TRASHCORP HQ", "GRAND HOTEL", "MUSEUM OF OLD STUFF", "LUXURY MALL", "GILDED PIGEON RESIDENCES", "TRASHINGTON BANK",
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
    if (city.bank && inRect(city.bank.vault, x, z, 0.5)) continue; // (C5c: so is the bank's vault, until you crack it)
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

test("C1 tiers: low in the south, medium in the middle, high in the north; (C4b) the cops' precinct in the middle tier by the canal", () => {
  const byTier = [0, 1, 2].map((t) => city.lootSpawns!.filter((s) => (s.tier ?? tierAt(s.z)) === t).length);
  assert.ok(byTier.every((n) => n >= 20), `loot per tier ${byTier}`);
  assert.equal(tierAt(-80), 0); assert.equal(tierAt(0), 1); assert.equal(tierAt(80), 2);
  const st = city.station!;
  assert.ok(tierAt(st.rect.minZ) === 1 && tierAt(st.rect.maxZ) === 1, "police precinct in the middle tier");
  assert.ok(st.rect.maxX > 80 && city.deepWater!.some((w) => w.minX - st.rect.maxX < 20), "next to the east road and the canal");
  assert.ok(Math.hypot(st.rect.minX + st.rect.maxX, st.rect.minZ + st.rect.maxZ) / 2 > 60, "not in the middle of town any more");
  assert.ok(onRoadAt(city, st.door.x, st.door.z - 4.5), "its door faces a street");
  assert.ok(!city.landmarks!.ledge09 && !city.landmarks!.ledge195, "the old tutorial ledges are gone");
});

test("C2 façades: every street building has a front facing its street and a parody sign, no repeats in a block", () => {
  const fronts = city.boxes.filter((b) => b.front);
  assert.ok(fronts.length > 45, `street buildings with a front: ${fronts.length}`); // (C5c.3: THE COMPACTOR took a whole block)
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
  assert.ok(pairs >= 6, `neighbour pairs checked: ${pairs}`);
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

// ---------------------------------------------------------------- R3: the new city (mirrored, fair, named)
setCityMap("new");
const nc = buildTrashington();
setCityMap("classic");
// (R8: the glass doors: the walks are measured with them open)
for (const p of nc.props ?? []) if (p.kind === "door" && p.box !== undefined) setBoxOff(nc, p.box, true);
const SZ = nc.southZ!;
/** a walking grid over the new city (it runs further south: the fort bowl) */
function walkGridNew(c: ArenaLayout) {
  const C = 0.5, NX = Math.round((c.halfSize * 2) / C), NZ = Math.round((c.halfSize - SZ) / C), free = new Uint8Array(NX * NZ), r = PLAYER.radius;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = -c.halfSize + (i + 0.5) * C, z = SZ + (j + 0.5) * C;
    let ok = true;
    for (const b of nearBoxes(c, x, z, r + 0.1)) { const top = b.y + b.h / 2, bot = b.y - b.h / 2; if (top <= 0.45 || bot >= 1.8) continue; if (inFoot(b, x, z, r)) { ok = false; break; } }
    free[j * NX + i] = ok ? 1 : 0;
  }
  return { free, NX, NZ, C, at: (x: number, z: number) => Math.floor((z - SZ) / C) * NX + Math.floor((x + c.halfSize) / C) };
}
/** walking distance (8 directions, round corners) from every free cell to the nearest target cell */
function walkFrom(g: ReturnType<typeof walkGridNew>, target: (x: number, z: number) => boolean) {
  const { free, NX, NZ, C } = g, D = new Float32Array(NX * NZ).fill(Infinity);
  const cap = NX * NZ * 9, hc = new Int32Array(cap), hk = new Float32Array(cap); let hn = 0;
  const push = (c: number, d: number) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= d) break; hc[i] = hc[p]; hk[i] = hk[p]; i = p; } hc[i] = c; hk[i] = d; };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const c = j * NX + i; if (free[c] && target(-nc.halfSize + (i + 0.5) * C, SZ + (j + 0.5) * C)) { D[c] = 0; push(c, 0); } }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (hn > 0) {
    const c = hc[0], d = hk[0], lc = hc[--hn], lk = hk[hn];
    let i = 0;
    for (;;) { const l = 2 * i + 1; if (l >= hn) break; let m = l; if (l + 1 < hn && hk[l + 1] < hk[l]) m = l + 1; if (hk[m] >= lk) break; hc[i] = hc[m]; hk[i] = hk[m]; i = m; }
    hc[i] = lc; hk[i] = lk;
    if (d > D[c]) continue;
    const ci = c % NX, cj = (c - ci) / NX;
    for (const [di, dj, w] of nb) {
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
      const m = b * NX + a;
      if (!free[m] || (di && dj && (!free[cj * NX + a] || !free[b * NX + ci]))) continue;
      const nd = d + w * C;
      if (nd < D[m]) { D[m] = nd; push(m, nd); }
    }
  }
  return D;
}
const ng = walkGridNew(nc);

test("R3 roads: Blake's names, the whole network mirrored left / right, no upper-left stub, no top road, Dead-Centre Drive up the middle", () => {
  const net = nc.roadNet!;
  const names = new Set(net.edges.map((e) => e.name));
  for (const n of ["Lefty Lane", "Righty Lane", "Gahookz Ghetto Lane", "Dead-Centre Drive", "Bin Juice Boulevard", "Mayor's Mugshot Mile", "Shopping Trolley Terrace", "Dodgy Cut-Through", "Bank Run",
    "Snob Row", "Leftovers Avenue", "Write-Off Avenue", "The Spin Cycle", "Loose Change Lane"]) assert.ok(names.has(n), `a road called ${n}`);
  assert.ok(net.edges.every((e) => e.name), "every road has a name");
  // mirrored: every junction has its twin on the other side, every road its mirror image
  const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const nodeAt = new Set(net.nodes.map((n) => key(n.x, n.z)));
  for (const n of net.nodes) assert.ok(nodeAt.has(key(-n.x, n.z)), `junction ${n.x},${n.z} has a mirror twin`);
  const seg = new Set(net.edges.map((e) => { const a = net.nodes[e.a], b = net.nodes[e.b]; return [key(a.x, a.z), key(b.x, b.z)].sort().join("|"); }));
  for (const e of net.edges) { const a = net.nodes[e.a], b = net.nodes[e.b]; assert.ok(seg.has([key(-a.x, a.z), key(-b.x, b.z)].sort().join("|")), `${e.name} has a mirror image`); }
  // the stub on the upper cross street is gone (it stops at the avenues), the top road is gone, Dead-Centre Drive runs north
  assert.ok(!onRoadAt(nc, -90, NEW.binJuice) && !onRoadAt(nc, 90, NEW.binJuice), "Bin Juice Boulevard stops at the two avenues");
  assert.ok(!onRoadAt(nc, 0, 104) && !onRoadAt(nc, -60, 104), "no road along the very top");
  assert.ok(onRoadAt(nc, 0, 35) && onRoadAt(nc, 0, 60), "Dead-Centre Drive runs up the middle to Snob Row");
  // the diagonals leave from the avenue corners and run straight at the middle of the roundabout (clean joins)
  for (const g of nc.roadSegs!) {
    assert.ok(Math.abs(Math.abs(g.ax) - NEW.inner) < 0.01 && Math.abs(g.az - NEW.binJuice) < 0.01, "from an avenue corner");
    const cross = g.ax * g.bz - g.az * g.bx;
    assert.ok(Math.abs(cross) / Math.hypot(g.ax, g.az) < 0.05, "pointing at the roundabout's middle");
  }
  // all joined; every car lane leads on
  const seen = new Set([0]), q = [0];
  while (q.length) { const n = q.pop()!; for (const e of net.edges) { const o = e.a === n ? e.b : e.b === n ? e.a : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); q.push(o); } } }
  assert.equal(seen.size, net.nodes.length, "every junction joined up");
  const lanes = buildLanes(net);
  assert.equal(lanes.filter((l) => !l.conn && l.outs.length === 0).length, 0, "no dead-end lanes");
});

test("R3 forts: 4 yards evenly spaced across the bowl, the outer two 5-10 m from the side walls, under a look-only viaduct", () => {
  const f = [...nc.forts!].sort((a, b) => a.x - b.x);
  assert.equal(f.length, 4);
  const gaps = [f[1].x - f[0].x, f[2].x - f[1].x, f[3].x - f[2].x];
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 0.2, `even spacing (${gaps.map((g) => g.toFixed(2)).join(", ")})`);
  for (const q of [f[0], f[3]]) {
    const gap = nc.halfSize - Math.max(Math.abs(q.zone.minX), Math.abs(q.zone.maxX));
    assert.ok(gap >= 5 && gap <= 10, `outer yard ${gap.toFixed(1)} m from the side wall`);
  }
  // the avenues sit centred between each pair of forts
  assert.ok(Math.abs((f[0].x + f[1].x) / 2 + NEW.inner) < 0.1 && Math.abs((f[2].x + f[3].x) / 2 - NEW.inner) < 0.1, "avenues centred between the forts");
  // the viaduct: drawn over every yard; nothing solid up there, no ramp, nothing to climb
  const deck = nc.scenery!.filter((s) => s.kind === "viaduct");
  assert.ok(deck.length > 10);
  for (const q of f) assert.ok(deck.some((s) => Math.hypot(s.x - q.x, s.z - q.z) < 9), `the viaduct passes over fort ${q.slot}`);
  const high = nc.boxes.filter((b) => b.z < NEW.gahookz - 4 && b.y + b.h / 2 > 3 && !b.hide && b.kind !== "fence" && b.kind !== "building" && !inRect(nc.lobby!.rect, b.x, b.z, 0.5));
  assert.deepEqual(high.map((b) => b.kind), [], "nothing tall to climb in the bowl but the pillars");
  assert.ok(!nc.boxes.some((b) => b.kind === "ramp-step" || (b.kind === "slab" && b.y > 8)), "no ramp and no deck to stand on");
});

test("R3 fairness: every fort is the same walk from the roundabout, the police, the north lots and the middle of town", () => {
  const places: [string, (x: number, z: number) => boolean][] = [
    ["the roundabout", (x, z) => Math.hypot(x, z) <= RING.r1],
    ["the police station's door", (x, z) => Math.abs(x - nc.station!.door.x) < 1.5 && Math.abs(z - nc.station!.door.z) < 1],
    ["the middle landmark lot", (x, z) => Math.abs(x) < 3 && Math.abs(z - (NEW.snob + 6)) < 1],
    ["Bin Juice x Dead-Centre", (x, z) => Math.abs(x) < 2 && Math.abs(z - NEW.binJuice) < 1],
  ];
  const report: string[] = [];
  for (const [name, t] of places) {
    const D = walkFrom(ng, t);
    const d = nc.forts!.map((q) => D[ng.at(q.padX, q.padZ)]);
    report.push(`${name}: ${d.map((v) => v.toFixed(1)).join(" / ")}`);
    assert.ok(d.every(Number.isFinite), `every fort can walk to ${name}`);
    assert.ok(Math.max(...d) - Math.min(...d) <= 2, `${name}: within 2 m (${d.map((v) => v.toFixed(1)).join(", ")})`);
  }
  console.log("  R3 fort walks (outer W / outer E / middle W / middle E):\n   " + report.join("\n   "));
});

test("R3 blocks: the two halves mirror each other; buildings never on a road or the pavement; angled and wedge buildings by the diagonals and the roundabout", () => {
  const blds = nc.boxes.filter((b) => (b.kind === "building" || b.kind === "tower") && b.y - b.h / 2 < 0.5 && b.z > NEW.gahookz - 4 && b.z < NEW.snob + 6);
  assert.ok(blds.length > 120, `a full city (${blds.length} buildings)`);
  const sig = (b: typeof blds[number], m: number) => `${Math.round(m * b.x * 10)},${Math.round(b.z * 10)},${Math.round(b.w * 10)},${Math.round(b.d * 10)},${b.h}`;
  const mine = new Set(blds.map((b) => sig(b, 1)));
  for (const b of blds) if (Math.abs(b.x) > 0.5) assert.ok(mine.has(sig(b, -1)), `building at ${b.x.toFixed(1)},${b.z.toFixed(1)} has a mirror twin`);
  for (const b of blds) for (let x = b.x - b.w / 2 + 0.3; x < b.x + b.w / 2; x += 1) for (let z = b.z - b.d / 2 + 0.3; z < b.z + b.d / 2; z += 1) {
    if (!inFoot(b, x, z)) continue;
    assert.ok(!onRoadAt(nc, x, z, 2.0), `building at ${b.x.toFixed(1)},${b.z.toFixed(1)} reaches the pavement or road`); // (R3: 2.5 m pavement)
  }
  const angled = blds.filter((b) => b.poly);
  assert.ok(angled.length >= 16, `angled buildings (${angled.length})`);
  assert.ok(angled.some((b) => b.poly!.length === 3), "some triangles");
  assert.ok(angled.some((b) => b.poly!.length >= 5), "some odd-shaped wedges");
  assert.ok(angled.some((b) => Math.hypot(b.x, b.z) < RING.r1 + 20), "some round the roundabout");
  // loot never in the road or inside a building
  for (const s of nc.lootSpawns!) {
    if (s.y > 0.5) continue;
    assert.ok(!onRoadAt(nc, s.x, s.z) || nc.crosswalks!.some((c) => inRect(c, s.x, s.z)), `loot in the road at ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
    assert.ok(!blds.some((b) => footSd(b, s.x, s.z).d < 0), `loot inside a building at ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
  }
});

test("R3 ground: everything walkable joins up (no sealed courtyards; the landmark lots are fenced off on purpose)", () => {
  const D = walkFrom(ng, (x, z) => Math.abs(x) < 1 && Math.abs(z - (NEW.gahookz - 6)) < 1);
  const pockets: string[] = [];
  for (let j = 2; j < ng.NZ - 2; j += 2) for (let i = 2; i < ng.NX - 2; i += 2) {
    const c = j * ng.NX + i, x = -nc.halfSize + (i + 0.5) * ng.C, z = SZ + (j + 0.5) * ng.C;
    if (!ng.free[c] || D[c] !== Infinity) continue;
    if (nc.station!.cells.some((q) => inRect(q.rect, x, z, 1))) continue; // (the cells are locked)
    if (nc.lots!.some((l) => inRect(l.rect, x, z, 0.5))) continue; // (the lots: fenced till a landmark goes there)
    if (inRect(nc.lobby!.rect, x, z, 1)) continue; // (the squat's tenement)
    if (nc.hotShops!.some((h) => inRect(h.back, x, z, 0.3))) continue; // (R7: behind the pawn shops' counters)
    pockets.push(`${x.toFixed(1)},${z.toFixed(1)}`);
  }
  assert.ok(pockets.length === 0, `sealed ground at ${pockets.slice(0, 12).join(" ")} (${pockets.length} cells)`);
});

test("R3 north: five empty landmark lots behind hoardings north of Snob Row, nothing built in them, no road up there", () => {
  assert.equal(nc.lots!.length, 5);
  for (const l of nc.lots!) {
    assert.ok(l.rect.minZ > NEW.snob + 4, `${l.name} is north of Snob Row`);
    const inside = nc.boxes.filter((b) => b.kind !== "sidewalk" && inRect(l.rect, b.x, b.z, -1));
    assert.deepEqual(inside.map((b) => b.kind), [], `${l.name} is empty`);
    assert.ok(nc.boxes.some((b) => b.sign === "COMING SOON: SOMETHING EXPENSIVE" && inRect(l.rect, b.x, b.z, 0.5)), `${l.name} has its hoarding sign`);
    for (let x = l.rect.minX; x <= l.rect.maxX; x += 5) assert.ok(!onRoadAt(nc, x, (l.rect.minZ + l.rect.maxZ) / 2), "no road through the lots");
  }
});

test("R3 street signs: every junction has a green name sign, with the names of the roads that meet there", () => {
  const net = nc.roadNet!, signs = nc.decor!.filter((d) => d.kind === "streetsign");
  for (const n of net.nodes) {
    if (n.ctl === "end") continue;
    const here = signs.filter((s) => Math.hypot(s.x - n.x, s.z - n.z) < 14);
    assert.ok(here.length > 0, `a sign at the junction ${n.x},${n.z}`);
    const names = new Set(net.edges.filter((e) => e.a === n.id || e.b === n.id).map((e) => e.name!.toUpperCase()));
    if (n.ctl === "round") names.add("THE SPIN CYCLE");
    assert.ok(here.some((s) => s.text!.split("|").every((t) => names.has(t))), `the sign at ${n.x},${n.z} names roads that meet there (${here.map((s) => s.text).join(" ; ")})`);
  }
});

test("R4 Little Italy and Chinatown: mirror images shop for shop, stall for stall (same loot value), gates, lights, café terraces", () => {
  const I = NEW.inner, LI = nc.littleItaly!, CT = nc.chinatown!;
  assert.ok(Math.abs((LI.street.minX + LI.street.maxX) / 2 + I) < 0.01 && Math.abs((CT.street.minX + CT.street.maxX) / 2 - I) < 0.01, "on Leftovers Avenue and Write-Off Avenue");
  assert.ok(LI.street.minZ > NEW.gahookz && LI.street.maxZ < 0, "between Gahookz Ghetto Lane and Mayor's Mugshot Mile");
  const it = nc.boxes.filter((b) => b.italy), cn = nc.boxes.filter((b) => b.china);
  assert.ok(it.length >= 8 && it.length === cn.length, `${it.length} Little Italy shops, ${cn.length} Chinatown shops`);
  for (const b of it) assert.ok(cn.some((c) => Math.abs(c.x + b.x) < 0.01 && Math.abs(c.z - b.z) < 0.01 && Math.abs(c.w - b.w) < 0.01 && c.h === b.h), `${b.sign} has its Chinatown twin`);
  assert.equal(new Set(it.map((b) => b.sign)).size, it.length, "no two Little Italy shops share a name");
  // stalls: each Little Italy stall has its Chinatown twin, and they're worth the same
  const mean = (pool: [string, number][]) => { const W = pool.reduce((s, [, w]) => s + w, 0); return pool.reduce((s, [t, w]) => { const d = lootDef(t); return s + (w / W) * (d.valueMin + d.valueMax) / 2; }, 0); };
  const TWIN: Record<string, string> = { pizzacart: "steamer", gelato: "steamer", ricordi: "trinkets", deli: "fishtank" };
  const itStalls = nc.props!.filter((p) => TWIN[p.kind]);
  assert.ok(itStalls.length >= 3 && itStalls.some((p) => p.kind === "deli"), `${itStalls.map((p) => p.kind).join(",")}`);
  for (const s of itStalls) {
    assert.ok(nc.props!.some((q) => q.kind === TWIN[s.kind] && Math.abs(q.x + s.x) < 0.01 && Math.abs(q.z - s.z) < 0.01), `${s.id} has its Chinatown twin`);
    if (s.kind !== "deli") assert.ok(Math.abs(mean(STALL_LOOT[s.kind]!) - mean(STALL_LOOT[TWIN[s.kind] as "steamer"]!)) < 0.01, `${s.kind} pays what ${TWIN[s.kind]} pays`);
  }
  assert.ok(Math.abs(mean(DELI_LOOT) - mean([["live_crab", 3], ["smelly_fish", 4]])) < 0.01, "the deli pays what the seafood tank pays");
  // gates (their pillars on the pavement, not the road), lights over the street
  for (const d of [LI, CT]) {
    assert.equal(d.gates.length, 2);
    for (const g of d.gates) for (const sx of [-1, 1]) assert.ok(!onRoadAt(nc, g.x + sx * (g.w / 2 - 0.2), g.z), "gate pillars on the pavement");
    assert.ok(d.lanternRows.length >= 6, `${d.lanternRows.length} rows of lights`);
  }
  // café terraces: tables under umbrellas in front of cafés that stand well back from the road
  const tables = nc.boxes.filter((b) => b.kind === "table" && Math.abs(Math.abs(b.x) - I) < 12 && b.z > NEW.gahookz && b.z < 0);
  assert.ok(tables.length >= 6, `${tables.length} café tables`);
  for (const t of tables) assert.ok(nc.decor!.some((d) => d.kind === "umbrella" && Math.hypot(d.x - t.x, d.z - t.z) < 0.01), "each under an umbrella");
});

test("R4 setbacks: buildings stand back from the kerb by different amounts (not all 2.5 m)", () => {
  const offs = new Map<number, number>();
  for (const b of nc.boxes) {
    if ((b.kind !== "building" && b.kind !== "tower") || b.poly || !b.face || b.y - b.h / 2 > 0.5) continue;
    const [fx, fz] = b.face, ex = b.x + fx * b.w / 2, ez = b.z + fz * b.d / 2;
    // distance from the front face out to the road's edge
    let d = 0;
    while (d < 9 && !onRoadAt(nc, ex + fx * (d + 0.25), ez + fz * (d + 0.25))) d += 0.25;
    if (d >= 9) continue;
    const k = Math.round(d * 2) / 2;
    offs.set(k, (offs.get(k) ?? 0) + 1);
  }
  const total = [...offs.values()].reduce((a, b) => a + b, 0), top = Math.max(...offs.values());
  assert.ok(offs.size >= 4, `setbacks used: ${[...offs.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k} m x${n}`).join(", ")}`);
  assert.ok(top / total < 0.6, `no one setback for most buildings (${top} of ${total})`);
});

test("R7 two walk-in pawn shops on Gahookz (left: where Hat Hut was; right: its mirror), glass counters between you and the owner, a till, a bouncer, a suit of armour out front; about the same walk from both forts on their side", () => {
  const hs = nc.hotShops!;
  assert.equal(hs.length, 2);
  const [L, Rt] = hs;
  assert.ok(L.rect.maxX < -40 && Rt.rect.minX > 40, "one each side");
  assert.ok(Math.abs(L.rect.minX + Rt.rect.maxX) < 0.01 && Math.abs(L.door.x + Rt.door.x) < 0.01 && Math.abs(L.rect.minZ - Rt.rect.minZ) < 0.01, "mirror images");
  for (const h of hs) {
    assert.ok(h.rect.minZ - (NEW.gahookz + 4) < 3 && h.door.z - h.rect.minZ < 3 && !onRoadAt(nc, h.out.x, h.out.z, 0.3), `${h.name}: its front on the Gahookz pavement, its door just round the corner`);
    assert.ok(h.counters.length >= 3 && h.counters.every((c) => nc.props!.some((p) => p.kind === "glasscounter" && inRect(c, p.x, p.z))), "glass counters (smashable)");
    assert.ok(h.floor.maxZ <= h.back.minZ, "the counters split the customers' side from the owner's");
    assert.ok(nc.posts!.some((p) => p.kind === h.owner && inRect(h.back, p.x, p.z)) && nc.posts!.some((p) => p.kind === h.bouncer && inRect(h.floor, p.x, p.z)), "the owner behind the counters, the bouncer on the shop floor");
    assert.ok(nc.props!.some((p) => p.kind === "pawncounter" && p.shop === h.idx && Math.hypot(p.x - h.stand.x, p.z - h.stand.z) < 1), "the till");
    assert.ok(nc.boxes.some((b) => b.deco === "armour" && Math.hypot(b.x - h.armour.x, b.z - h.armour.z) < 0.1 && !inRect(h.rect, b.x, b.z)), "a suit of armour out front");
    assert.ok(!nc.lootSpawns!.some((l) => inRect(h.rect, l.x, l.z)), "nothing to steal");
    const others = nc.boxes.filter((b) => (b.kind === "building" || b.kind === "tower") && inRect(h.rect, b.x, b.z, -0.5));
    assert.equal(others.length, 0, "no city building on top of it");
  }
  assert.ok(!nc.pawnShop, "the old pawn shop behind the station is gone");
  // fairness: the two forts on each side walk about the same to their shop
  const f = [...nc.forts!].sort((a, b) => a.x - b.x);
  const report: string[] = [];
  for (const [h, pair] of [[L, [f[0], f[1]]], [Rt, [f[2], f[3]]]] as const) {
    const D = walkFrom(ng, (x, z) => Math.hypot(x - h.stand.x, z - h.stand.z) < 0.8);
    const d = pair.map((q) => D[ng.at(q.padX, q.padZ)]);
    report.push(`${h.name}: ${d.map((v) => v.toFixed(1)).join(" / ")}`);
    assert.ok(d.every(Number.isFinite), "both can walk there");
    assert.ok(Math.abs(d[0] - d[1]) <= 8, `${h.name}: within 8 m (${d.map((v) => v.toFixed(1)).join(", ")})`);
  }
  console.log("  R7 pawn shop walks (outer / middle):\n   " + report.join("\n   "));
  const up = nc.stationUpper!;
  assert.ok(up && up.y1 - up.y0 >= 10 && up.walkTop! > 9, "the station's upper floors (the first one walkable)");
});

test("R5 the café chairs face their tables", () => {
  const tables = nc.boxes.filter((b) => b.kind === "table");
  const chairs = (nc.junkSpots ?? []).filter((j) => j.type === "cafe_chair");
  assert.ok(chairs.length >= 6);
  for (const c of chairs) {
    const t = tables.reduce((m, b) => (Math.hypot(b.x - c.x, b.z - c.z) < Math.hypot(m.x - c.x, m.z - c.z) ? b : m), tables[0]);
    const fx = Math.sin(c.yaw ?? 0), fz = Math.cos(c.yaw ?? 0), dx = t.x - c.x, dz = t.z - c.z, l = Math.hypot(dx, dz);
    assert.ok((fx * dx + fz * dz) / l > 0.95, `chair at ${c.x.toFixed(1)},${c.z.toFixed(1)} faces its table`);
  }
});

test("R6 the new station: a reception, a breakroom and ONE holding cell (bars, a bench, a toilet, a shower corner, the Champ)", () => {
  const st = nc.station!, h = st.holding!;
  assert.ok(h, "the holding cell");
  assert.equal(st.cells.length, 1, "one cell for everybody");
  for (const sp of h.spots) assert.ok(inRect(h.cell, sp.x, sp.z), "every landing spot is in the cell");
  assert.ok(inRect(h.cell, h.toilet.x, h.toilet.z, 0.6) && inRect(h.cell, (h.shower.minX + h.shower.maxX) / 2, (h.shower.minZ + h.shower.maxZ) / 2, 0.5), "the toilet and the shower are in the cell");
  assert.ok(nc.props!.some((p) => p.kind === "toilet") && nc.props!.some((p) => p.kind === "celldoor"), "the toilet and the cell door can be used");
  assert.ok(nc.posts!.some((p) => p.kind === "champ" && inRect(h.cell, p.x, p.z)), "the Champ is in the cell");
  assert.ok(nc.boxes.some((b) => b.kind === "bars" && (Math.abs(b.z - h.door.z) < 0.3 || (Math.abs(b.x - h.door.x) < 0.3 && b.d > 4))), "bars along the cell's front");
  assert.ok(inRect(st.rect, (h.reception.minX + h.reception.maxX) / 2, (h.reception.minZ + h.reception.maxZ) / 2) && h.breakroom.maxX < h.cell.minX, "the reception at the front, the breakroom beside the cell");
  assert.ok(nc.boxes.some((b) => b.kind === "fridge" && inRect(h.breakroom, b.x, b.z)) && nc.boxes.some((b) => b.kind === "table" && inRect(h.breakroom, b.x, b.z)), "the breakroom has a fridge and a table");
});

test("R7 the grand station: right through the block to Gahookz; the lobby (receptionist, stairs), a hallway, two interrogation rooms, booking, the breakroom, the holding cell at the back; upstairs offices, the chief's corner office, the evidence room", () => {
  const st = nc.station!, g = st.grand!, h = st.holding!;
  assert.ok(g, "the grand station");
  assert.ok(st.rect.minZ - (NEW.gahookz + 4) < 3.2, "its back is on the Gahookz pavement");
  assert.ok(nc.posts!.some((p) => p.kind === "receptionist" && inRect(g.lobby, p.x, p.z)), "the receptionist at her desk in the lobby");
  assert.equal(g.interrogation.length, 2);
  for (const r of [...g.interrogation, h.breakroom]) assert.ok(r.maxX < g.hall.minX, "interrogation rooms and the breakroom off the west of the hallway");
  assert.ok(g.booking.minX > g.hall.maxX && h.cell.minX > g.hall.maxX, "booking and the cell off the east");
  assert.ok((h.cell.minZ + h.cell.maxZ) / 2 < (g.booking.minZ + g.booking.maxZ) / 2 - 4, "the cell tucked away at the back");
  assert.ok(nc.boxes.filter((b) => b.kind === "glass" && b.y > 1 && inRect(st.rect, b.x, b.z)).length >= 2, "one-way mirrors");
  // the stairs climb to the first floor
  const steps = nc.boxes.filter((b) => b.kind === "step" && inRect(g.stairs, b.x, b.z, 0.1));
  assert.ok(steps.length >= 12 && Math.abs(Math.max(...steps.map((b) => b.y + b.h / 2)) - g.upY) < 0.05, "stairs up to the first floor");
  const slab = nc.boxes.some((b) => b.kind === "roof" && Math.abs(b.y + b.h / 2 - g.upY) < 0.05 && inRect(st.rect, b.x, b.z));
  assert.ok(slab, "a floor to stand on upstairs");
  assert.ok(inRect(g.upstairs, (g.chief.minX + g.chief.maxX) / 2, (g.chief.minZ + g.chief.maxZ) / 2) && g.chief.maxX > st.rect.maxX - 1 && g.chief.maxZ > st.rect.maxZ - 1, "the chief's corner office (front, east)");
  assert.ok(g.offices.length >= 3, "offices upstairs");
  assert.ok(g.evidenceSpots.length >= 9 && g.evidenceSpots.every((s) => inRect(g.evidence, s.x, s.z) && s.y > g.upY), "the evidence room's shelves");
  assert.ok(nc.boxes.some((b) => b.kind === "bars" && b.y > g.upY && Math.abs(b.z - g.evidenceDoor.z) < 0.2), "behind a cage");
  assert.ok(g.beats.length >= 2 && g.beats.some((b) => b.y > 4), "a cop walks the ground floor, one guards the evidence room");
  assert.ok(st.alley.z < st.rect.minZ && !onRoadAt(nc, st.alley.x, st.alley.z, 0.3), "a jailbreak comes out the back, on the Gahookz pavement");
});

test("R8 the station's real glass: ribbon windows on the ground floor's front and right round the first floor, the chief's office glass to the corner; three glass doors; the cell door its own bars", () => {
  const st = nc.station!, g = st.grand!;
  const glass = nc.boxes.filter((b) => b.kind === "glass" && !b.hide && inRect(st.rect, b.x, b.z, 0.3) && !inRect(st.rect, b.x, b.z, -0.6));
  assert.ok(glass.some((b) => b.y > g.upY && b.z > st.rect.maxZ - 0.8), "first-floor glass on the front");
  for (const f of ["N", "S", "E", "W"]) assert.ok(g.windows.some((w) => w.face === f && w.y0 > g.upY), `first-floor windows on face ${f}`);
  assert.ok(glass.some((b) => b.y < 3 && b.z > st.rect.maxZ - 0.8), "ground-floor glass on the front");
  const ch = g.chief;
  assert.ok(glass.some((b) => b.y > g.upY && Math.abs(b.x - st.rect.maxX + 0.2) < 0.2 && b.z > ch.minZ && b.z < ch.maxZ + 0.5), "the chief's corner: glass on the side too");
  const doors = nc.props!.filter((p) => p.kind === "door");
  assert.equal(doors.length, 3, "the station's front doors and the two pawn shops' doors");
  for (const d of doors) assert.ok(d.box !== undefined && nc.boxes[d.box].kind === "glass", "each blocks while shut");
  const cd = nc.props!.find((p) => p.kind === "celldoor")!;
  assert.ok(cd.box !== undefined && nc.boxes[cd.box].kind === "bars", "the cell door is its own bars (the key opens it)");
  assert.ok(inRect(ch, g.keySpot.x, g.keySpot.z) && g.keySpot.y > g.upY, "the key's on the chief's desk");
  assert.equal(g.beats.length, 4, "four cops guard the station");
});
