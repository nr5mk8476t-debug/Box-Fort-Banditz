// TRASHINGTON 400 (Blake, 2026-11-20: "shrink the city down to 400 by 400", 18 m yards, 10% faster; before that, 2026-11-18:
// "yes build the smallest playable test"; "grey boxes
// first"): the plan obeys every rule; the grey-box test map plays (forts, stock, the museum's two ways out); the
// playtest recorder writes down sightings, trips and the way home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { setCityMap, buildTrashington, TEST_INFO, lootDef, inFoot, type MoveInput } from "../src/index.js";
import { T_PARK } from "../src/queens/trashington400.js";
import { usePlan, validate, routes, floorAreas, railColumns } from "../src/queens/check.js";
import { TRASH400, LOOP_AT, EDGE_AT, T_RING } from "../src/queens/trashington400.js";

const LM = ["bank", "casino", "hotel", "museum"];

test("TR2 the 400 x 400 m plan passes every rule; 18 m yards; the nearest landmark 19-25 s from every fort (estimate), the same for all four", () => {
  usePlan(TRASH400);
  const bad = validate(); assert.deepEqual(bad, [], bad.map((i) => `${i.rule}: ${i.msg}`).join("\n"));
  assert.equal(TRASH400.extent.maxX - TRASH400.extent.minX, 400); assert.equal(TRASH400.extent.maxZ - TRASH400.extent.minZ, 400);
  const rows = routes().rows, near: number[] = [];
  for (const f of TRASH400.forts) {
    const ts = LM.map((id) => rows.find((r) => r.fort === f.id && r.id === id)!.out).sort((a, b) => a - b);
    assert.ok(ts[0] >= 19 && ts[0] <= 25, `${f.id}: nearest landmark ${ts[0].toFixed(1)} s`); near.push(ts[0]);
    for (const tier of ["low", "mid", "high"]) assert.ok(Math.min(...rows.filter((r) => r.fort === f.id && r.tier === tier && r.phase === "first").map((r) => r.out)) <= 22, `${f.id} ${tier} shop within 22 s`);
  }
  assert.ok(Math.max(...near) - Math.min(...near) < 1);
  assert.deepEqual(railColumns().problems, []);
  for (const a of floorAreas()) { if (a.flag && !a.flag.startsWith("brought forward")) continue; assert.ok(a.ratio >= 1.9 && a.ratio <= 2.5, `${a.id}: ${a.ratio.toFixed(2)}x`); }
  assert.ok(LOOP_AT === 100 && EDGE_AT === 192);
});

function testWorld(n = 2) {
  setCityMap("test"); const arena = buildTrashington(); setCityMap("new");
  const w = new World({ seed: 5, arena });
  const ps = []; for (let i = 0; i < n; i++) ps.push(w.addPlayer("p" + i, ["Blake", "Tyson", "C", "D"][i]));
  w.startMatch(); w.takeEvents();
  return { w, ps, arena };
}
const toScavenge = (w: World) => { for (let i = 0; i < 12 && w.match.phase !== "scavenge"; i++) { w.match.timeLeft = 0.001; w.tick(); } assert.equal(w.match.phase, "scavenge"); };
const fwd = (seq: number): MoveInput => ({ seq, mx: 0, mz: 1, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, dodge: false });

test("TR test map: four equal yards on the home block (rotated forts, mats in the yards), the market, no passers-by, no city events, nothing else on the map's rules", () => {
  const { w, arena } = testWorld();
  assert.equal(arena.variant, "test"); assert.equal(arena.halfSize, 200); assert.equal(arena.pace, 1.08, "8% faster on foot (Blake, TR3)");
  assert.equal(arena.forts!.length, 4);
  const sizes = arena.forts!.map((f) => [f.zone.maxX - f.zone.minX, f.zone.maxZ - f.zone.minZ]);
  for (const s of sizes) assert.deepEqual(s, [18, 18]);
  for (const f of arena.forts!) { assert.ok(f.padX > f.zone.minX && f.padX < f.zone.maxX && f.padZ > f.zone.minZ && f.padZ < f.zone.maxZ, "mat in the yard"); assert.ok(Math.hypot(f.padX - f.x, f.padZ - f.z) > 5, "the mat in front of the fort"); }
  assert.equal(new Set(arena.forts!.map((f) => f.yaw.toFixed(2))).size, 4, "four directions (the pinwheel)");
  assert.equal([...w.npc.npcs.values()].filter((n) => n.kind !== "cashier").length, 0, "no passers-by");
  // no city events (the truck would drive the old city's default routes)
  for (let i = 0; i < 12 && w.match.phase !== "scavenge"; i++) { w.match.timeLeft = 0.001; w.tick(); }
  for (let i = 0; i < 60 * 60 * 6; i++) w.tick();
  assert.equal(w.takeEvents().filter((e) => e.t === "cityEvent").length, 0, "no garbage truck, airdrop or raccoons");
  // the other maps are untouched
  setCityMap("new"); const city = buildTrashington(); assert.notEqual(city.variant, "test"); assert.equal(city.giantDoors, undefined);
});

test("TR test map: PLUG & PRAY, FISHY BUSINESS and the museum are stocked; the museum has a giant and heavies", () => {
  const { w } = testWorld();
  const inside = (id: string) => TEST_INFO!.places.find((p) => p.id === id)!.inside;
  const items = [...w.items.values()];
  const at = (id: string) => items.filter((it) => { const r = inside(id); return it.body.x >= r.minX && it.body.x <= r.maxX && it.body.z >= r.minZ && it.body.z <= r.maxZ; });
  assert.ok(at("plugpray").length >= 2 && at("fishy").length >= 2, `shops: ${at("plugpray").length} / ${at("fishy").length}`);
  assert.ok(at("museum").some((it) => lootDef(it.type).size === "giant"), "a giant exhibit");
  assert.ok(at("museum").filter((it) => lootDef(it.type).heavy && lootDef(it.type).size !== "giant").length >= 2, "heavies on the plinths");
});

/** drag (or carry) something out of the museum northward from x (yaw 0 = north, the museum faces Gnome Ave) */
function carryOut(type: string, x: number) {
  const { w, ps } = testWorld(1); toScavenge(w);
  const p = ps[0], g = TEST_INFO!.museum.gallery;
  p.move.x = x; p.move.z = g.maxZ - 10; p.move.yaw = 0;
  const id = w.placeItem(type, x, 0.8, g.maxZ - 8.6);
  for (let i = 0; i < 30; i++) w.tick();
  w.action("p0", { a: "grab", item: id }); for (let i = 0; i < 10; i++) w.tick();
  assert.equal(w.items.get(id)!.holder, "p0", `holding the ${type}`);
  let seq = 1; for (let i = 0; i < 60 * 8; i++) { w.pushInputs("p0", [fwd(seq++)]); w.tick(); }
  return { out: p.move.z > g.maxZ + 2, bounced: w.takeEvents().filter((e) => e.t === "bounced" && e.reason === "giant").length };
}
test("TR the museum: a GIANT won't go out of the public door (put back, told why, not spammed); it goes out through the goods yard; a heavy goes out of the front", () => {
  const door = TEST_INFO!.museum.door[0], gate = TEST_INFO!.museum.gate[0];
  const d = carryOut("rubber_duck", door); assert.equal(d.out, false, "giant: not by the public door"); assert.ok(d.bounced >= 1 && d.bounced <= 3, `told ${d.bounced} times in 8 s`);
  const g = carryOut("rubber_duck", gate); assert.equal(g.out, true, "giant: out by the goods door"); assert.equal(g.bounced, 0);
  const h = carryOut("jade_dragon", door); assert.equal(h.out, true, "heavy: out by the public door");
});

/** walk a player along waypoints at a steady 6 m/s (placed each tick: the recorder only reads positions) */
function walk(w: World, p: any, pts: [number, number][], speed = 6) {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round((L / speed) * 60));
    for (let k = 1; k <= n; k++) { p.move.x = a[0] + ((b[0] - a[0]) * k) / n; p.move.z = a[1] + ((b[1] - a[1]) * k) / n; p.move.vx = 0; p.move.vz = 0; w.tick(); }
  }
}
test("TR the recorder: a sighting on Stain Way (where, when, what each carried, what each did next); none through a building; trips and the way home", () => {
  const { w, ps } = testWorld(2); toScavenge(w);
  const [blake, tyson] = ps;
  const A = LOOP_AT;
  // Tyson waits outside PLUG & PRAY on Stain Way; Blake comes up Stain Way from the museum corner
  tyson.move.x = -A + 6; tyson.move.z = -50;
  blake.move.x = -A - 6; blake.move.z = -A - 6;
  for (let i = 0; i < 60; i++) w.tick();
  walk(w, blake, [[-A - 6, -A - 6], [-A - 6, -90]]);
  for (let i = 0; i < 60 * 22; i++) w.tick(); // (the reaction window)
  const rep = w.playtestReport()!, cyc = rep.cycles.at(-1)!;
  const s = cyc.sightings.find((x: any) => x.away);
  assert.ok(s, "seen on Stain Way: " + JSON.stringify(cyc.summary));
  assert.match(s.at.a[2] + s.at.b[2], /STAIN WAY/);
  assert.ok(s.next, "what each did next");
  // a building between them: no sighting (Blake in the next street over, Market St south, behind the SW block)
  const { w: w2, ps: ps2 } = testWorld(2); toScavenge(w2);
  ps2[0].move.x = -12 - 6; ps2[0].move.z = -60; ps2[1].move.x = -A + 6; ps2[1].move.z = -60;
  for (let i = 0; i < 60 * 3; i++) w2.tick();
  assert.equal(w2.playtestReport()!.cycles.at(-1)!.sightings.length, 0, "no line through the inner block");
  // trips: Tyson home from PLUG & PRAY up Stain Way; Blake home from the museum by Wood Havoc Lane
  const { w: w3, ps: ps3 } = testWorld(2); toScavenge(w3);
  const pp = TEST_INFO!.places.find((p) => p.id === "plugpray")!, lane = TRASH400.paths.find((p) => p.id === "al_pub")!.pts as [number, number][];
  const f4 = w3.arena.forts![1]; // (Tyson is the second player: slot 1, the south-west fort)
  assert.ok(f4.padX < 0 && f4.padZ < 0, "the second player's fort is F4 (south-west)");
  walk(w3, ps3[1], [[f4.padX, f4.padZ], [-T_RING, 12], [-A + 6, 12], [-A + 6, -52], [(pp.inside.minX + pp.inside.maxX) / 2, -52], [-A + 6, -52], [-A + 6, 12], [-T_RING, 12], [f4.padX, f4.padZ]]);
  const mu = TEST_INFO!.museum, f1 = w3.arena.forts![0];
  walk(w3, ps3[0], [[f1.padX, f1.padZ], [-T_RING, 12], [-A - 6, 12], [-A - 6, -A - 6], [mu.door[0], -A - 6], [mu.door[0], mu.gallery.maxZ - 4], [mu.gate[0], mu.gallery.maxZ - 4], [mu.gate[0], -A - 6],
    [lane.at(-1)![0], -A - 6], ...lane.slice().reverse(), [-T_RING, 12], [f1.padX, f1.padZ]]);
  const trips = w3.playtestReport()!.cycles.at(-1)!.trips;
  const ty = trips.find((t: any) => t.p === "Tyson"), bl = trips.find((t: any) => t.p === "Blake");
  assert.ok(ty && ty.places.includes("PLUG & PRAY REPAIRS") && ty.wayHome === "Stain Way", JSON.stringify(ty));
  assert.ok(bl && bl.places.includes("THE MUSEUM OF QUESTIONABLE HISTORY") && bl.wayHome === "Wood Havoc Lane", JSON.stringify(bl));
});

test("TR2/TR3 the test map is 8% faster on foot (sprint and walk), and only the test map", () => {
  const run = (pace: number | undefined, sprint: boolean) => {
    setCityMap("test"); const arena = buildTrashington(); setCityMap("new");
    if (pace === undefined) delete (arena as any).pace; else arena.pace = pace;
    const w = new World({ seed: 5, arena }), p = w.addPlayer("p0", "Blake"); w.startMatch(); toScavenge(w);
    // down Stain Way's inner pavement, north from Gnome Ave (clear for 150 m)
    p.move.x = -LOOP_AT + 6; p.move.z = -LOOP_AT + 10; p.move.yaw = 0; p.move.stamina = 999;
    let seq = 1; for (let i = 0; i < 60 * 3; i++) { w.pushInputs("p0", [{ ...fwd(seq++), sprint }]); w.tick(); }
    return p.move.z - (-LOOP_AT + 10);
  };
  for (const sprint of [true, false]) {
    const base = run(undefined, sprint), fast = run(1.08, sprint);
    assert.ok(fast / base > 1.05 && fast / base < 1.10, `${sprint ? "sprint" : "walk"}: ${base.toFixed(1)} m vs ${fast.toFixed(1)} m in 3 s`);
  }
  setCityMap("new"); assert.equal(buildTrashington().pace, undefined, "the normal city's pace is unchanged");
});

test("TR3 the roundabout market park: a round road, the park inside it; every plot fenced with two open gates (a clear walk from the mat out of each); the stalls on the plaza; no centrepiece", () => {
  setCityMap("test"); const arena = buildTrashington(); setCityMap("new");
  assert.deepEqual(arena.roadRings, [{ x: 0, z: 0, r0: T_PARK.kerbR, r1: T_PARK.kerbR + 8 }]);
  const fences = arena.boxes.filter((b) => b.kind === "fence" && Math.hypot(b.x, b.z) < T_PARK.kerbR);
  assert.ok(fences.length > 40, `${fences.length} fence pieces`);
  const clear = (a: [number, number], b: [number, number]) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t <= L; t += 0.2) { const x = a[0] + ((b[0] - a[0]) * t) / L, z = a[1] + ((b[1] - a[1]) * t) / L; for (const f of fences) for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) if (inFoot(f, x + dx, z + dz)) return `blocked at (${x.toFixed(1)}, ${z.toFixed(1)})`; } return ""; };
  for (const f of TRASH400.forts) {
    const out = (p: [number, number], k: number): [number, number] => [p[0] + Math.sign(p[0]) * (Math.abs(p[0]) === T_HOME_HALF ? k : 0), p[1] + Math.sign(p[1]) * (Math.abs(p[1]) === T_HOME_HALF ? k : 0)];
    // out of the front gate onto the path, and out of the back gate toward the road
    const front = f.front as [number, number], rear = f.rear as [number, number];
    const toPath: [number, number] = Math.abs(front[0]) < 6 ? [Math.sign(front[0]) * 1, front[1]] : [front[0], Math.sign(front[1]) * 1];
    assert.equal(clear(f.mat as [number, number], front), "", `${f.id}: mat to the front gate`);
    assert.equal(clear(front, toPath), "", `${f.id}: through the front gate onto the path`);
    assert.equal(clear(f.mat as [number, number], rear), "", `${f.id}: mat to the back gate`);
    assert.equal(clear(rear, out(rear, 3)), "", `${f.id}: through the back gate`);
  }
  // the stalls are on the plaza, the middle is clear (Blake: nothing to drag loot round)
  for (const b of arena.boxes) if (Math.hypot(b.x, b.z) < 3 && b.h > 0.2 && b.y - b.h / 2 < 2) assert.fail(`something in the middle of the plaza: ${b.kind} at (${b.x}, ${b.z})`);
});
const T_HOME_HALF = 23;

test("TR4 the finished section: F1's plot, the SELL stall and the north path, drawn by the park kit over hidden collision; clutter never in the biggest fort's footprint or on the ways in; a giant-wide route through both gates; a clear approach to the stall; the stall's goods aren't loot", async () => {
  const { fortMaxRects } = await import("../src/queens/check.js");
  const { FIN_FORT } = await import("../src/testmap.js");
  setCityMap("test"); const arena = buildTrashington(); setCityMap("new");
  usePlan(TRASH400);
  const pk = arena.park!;
  assert.ok(pk && pk.fort === 0, "the finished plot is the first player's (F1)");
  assert.ok(pk.fences.length > 12 && pk.yardPoly.length >= 4 && pk.trees.length >= 3 && pk.track.length === 5, JSON.stringify({ f: pk.fences.length, t: pk.trees.length }));
  assert.equal(pk.stall?.id, "sell");
  assert.deepEqual(pk.props.map((p) => p.kind).sort(), ["crates", "pallets", "sofa", "tyres"]);
  const f1 = TRASH400.forts.find((f) => f.id === FIN_FORT)!, plan = fortMaxRects(f1);
  const segD = (p: [number, number], a: [number, number], b: [number, number]) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); };
  const routes: [[number, number], [number, number]][] = [[pk.track[0], pk.track[1]], [pk.track[1], pk.track[2]], [pk.track[3], pk.track[4]]];
  for (const q of pk.props) {
    const half = Math.max(q.w, q.d) / 2;
    for (const r of plan) assert.ok(!(q.x + half > r.rect.minX && q.x - half < r.rect.maxX && q.z + half > r.rect.minZ && q.z - half < r.rect.maxZ), `${q.kind} sits in the planned ${r.name}`);
    for (const [a, b] of routes) assert.ok(segD([q.x, q.z], a, b) > half + 1.1, `${q.kind} too close to a way in (${segD([q.x, q.z], a, b).toFixed(1)} m)`);
    const r0 = Math.hypot(q.x, q.z); assert.ok(r0 < T_PARK.fenceR - half && r0 > T_PARK.plazaR + half, `${q.kind} inside the fence`);
  }
  // the ways in, a player's width either side (a carried giant follows its carrier without colliding: the gates' openings
  // are checked against the widest giant below), against everything solid (not the ground)
  const solid = arena.boxes.filter((b) => b.h > 0.3 && b.y - b.h / 2 < 1.8 && b.kind !== "fort");
  for (const [a, b] of routes) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0.4; t <= L - 0.4; t += 0.25) {
      const x = a[0] + ((b[0] - a[0]) * t) / L, z = a[1] + ((b[1] - a[1]) * t) / L;
      for (const s of solid) for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) if (inFoot(s, x + dx, z + dz)) assert.fail(`${s.kind} in the way at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  // each gate's opening is wider than the widest giant (1.5 m across) with room for its carrier
  const widest = Math.max(...["rubber_duck", "arcade_machine"].map((t) => lootDef(t).radius * 2));
  for (const g of [pk.track[0], pk.track[4]]) {
    let open = 0;
    for (const [ux, uz] of [[1, 0], [0, 1]]) { let lo = 0, hi = 0; const hit = (o: number) => solid.some((s) => inFoot(s, g[0] + ux * o, g[1] + uz * o));
      while (lo > -4 && !hit(lo - 0.05)) lo -= 0.05; while (hi < 4 && !hit(hi + 0.05)) hi += 0.05; open = Math.max(open, Math.min(hi - lo, 8)); }
    assert.ok(open >= widest + 0.8, `the gate at (${g}) is ${open.toFixed(1)} m open (the widest giant is ${widest.toFixed(1)} m)`);
  }
  // the stall: 1.6 m clear in front of it (the customer's side) along its whole front; no loot spot or prop at it
  const st = pk.stall!, [fx, fz] = st.face;
  for (let o = -st.w / 2; o <= st.w / 2; o += 0.3) for (const d of [0.3, 0.9, 1.5]) {
    const x = st.x + fx * (st.w / 2 + d) + (fz ? o : 0), z = st.z + fz * (st.w / 2 + d) + (fx ? o : 0);
    for (const s of solid) if (inFoot(s, x, z)) assert.fail(`${s.kind} in the stall's approach at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }
  const near = (x: number, z: number) => Math.abs(x - st.x) < st.w && Math.abs(z - st.z) < st.w;
  assert.ok(!(arena.lootSpawns ?? []).some((l) => near(l.x, l.z)), "no loot spot at the stall");
  assert.ok(!(arena.props ?? []).some((p) => near(p.x, p.z)), "no usable prop at the stall");
});

/** steer a player along waypoints with the real movement code (forward input, turned toward the next point each tick) */
function drive(w: World, id: string, pts: [number, number][], maxS = 40) {
  const p = w.players.get(id)!; let seq = 1, i = 0;
  for (let t = 0; t < maxS * 60 && i < pts.length; t++) {
    const [x, z] = pts[i], dx = x - p.move.x, dz = z - p.move.z;
    if (Math.hypot(dx, dz) < 0.6) { i++; continue; }
    const yaw = Math.atan2(dx, dz);
    w.pushInputs(id, [{ seq: seq++, mx: 0, mz: 1, yaw, pitch: 0, jump: false, sprint: false, crouch: false, dodge: false }]); w.tick();
  }
  return i >= pts.length;
}
test("TR4 playing the finished section: drag a GIANT in through F1's front gate onto the mat (it banks); walk out of the back gate; two players at the SELL stall at once", () => {
  setCityMap("test"); const arena = buildTrashington(); setCityMap("new");
  const w = new World({ seed: 21, arena }), a = w.addPlayer("a", "Blake"), b = w.addPlayer("b", "Tyson"); w.startMatch(); toScavenge(w);
  const pk = arena.park!, lot = arena.forts!.find((f) => f.slot === pk.fort)!, [gate, mat] = [pk.track[0], pk.track[1]];
  // the duck on the north path, outside the gate; Blake grabs it and drags it home: path -> gate -> mat
  a.move.x = 1.5; a.move.z = gate[1]; a.move.yaw = Math.atan2(-1, 0);
  const duck = w.placeItem("rubber_duck", 0.0, 0.8, gate[1]); for (let i = 0; i < 20; i++) w.tick();
  w.action("a", { a: "grab", item: duck }); for (let i = 0; i < 10; i++) w.tick();
  assert.equal(w.items.get(duck)!.holder, "a", "holding the duck");
  assert.ok(drive(w, "a", [[gate[0] + 1.2, gate[1]], [gate[0] - 1.5, gate[1] - 0.6], [mat[0], mat[1] + 0.8]], 60), `reached the mat (at ${a.move.x.toFixed(1)}, ${a.move.z.toFixed(1)})`);
  w.action("a", { a: "drop" }); for (let i = 0; i < 60 * 12; i++) w.tick();
  assert.ok(w.fort.of(a).recs.some((r) => r.type === "rubber_duck"), `the duck banked on F1's mat (${JSON.stringify(w.fort.of(a).recs.map((r) => r.type))})`);
  // out of the back gate (round the fort), to the verge
  const rear = pk.track[4];
  assert.ok(drive(w, "a", [[lot.x + 2.5, lot.z - 2.8], [lot.x - 3, lot.z - 2.8], [rear[0] + 1.5, rear[1]], [rear[0] - 2, rear[1]]], 40), `out of the back gate (at ${a.move.x.toFixed(1)}, ${a.move.z.toFixed(1)})`);
  // both players walk up to the SELL stall's front and stand there together
  const st = pk.stall!, front: [number, number] = [st.x + st.face[0] * (st.w / 2 + 0.8), st.z + st.face[1] * (st.w / 2 + 0.8)];
  a.move.x = front[0] + 3; a.move.z = front[1] - 1; b.move.x = front[0] + 3; b.move.z = front[1] + 1;
  assert.ok(drive(w, "a", [[front[0], front[1] - 0.7]], 15) && drive(w, "b", [[front[0], front[1] + 0.7]], 15), "both reached the counter's front");
});
