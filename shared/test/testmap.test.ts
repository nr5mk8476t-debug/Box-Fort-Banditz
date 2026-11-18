// TRASHINGTON 500 (Blake, 2026-11-18: "500 x 500 m, landmarks out"; "yes build the smallest playable test"; "grey boxes
// first"): the plan obeys every rule; the grey-box test map plays (forts, stock, the museum's two ways out); the
// playtest recorder writes down sightings, trips and the way home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { setCityMap, buildTrashington, TEST_INFO, lootDef, type MoveInput } from "../src/index.js";
import { usePlan, validate, routes, floorAreas, railColumns } from "../src/queens/check.js";
import { TRASH500, LOOP_AT, EDGE_AT } from "../src/queens/trashington.js";

const LM = ["bank", "casino", "hotel", "museum"];

test("T500 the 500 x 500 m plan passes every rule; landmarks out: the nearest 30-36 s from every fort (estimate), the same for all four", () => {
  usePlan(TRASH500);
  const bad = validate(); assert.deepEqual(bad, [], bad.map((i) => `${i.rule}: ${i.msg}`).join("\n"));
  assert.equal(TRASH500.extent.maxX - TRASH500.extent.minX, 500); assert.equal(TRASH500.extent.maxZ - TRASH500.extent.minZ, 500);
  const rows = routes().rows, near: number[] = [];
  for (const f of TRASH500.forts) {
    const ts = LM.map((id) => rows.find((r) => r.fort === f.id && r.id === id)!.out).sort((a, b) => a - b);
    assert.ok(ts[0] >= 30 && ts[0] <= 36, `${f.id}: nearest landmark ${ts[0].toFixed(1)} s`); near.push(ts[0]);
    for (const tier of ["low", "mid", "high"]) assert.ok(Math.min(...rows.filter((r) => r.fort === f.id && r.tier === tier && r.phase === "first").map((r) => r.out)) <= 22, `${f.id} ${tier} shop within 22 s`);
  }
  assert.ok(Math.max(...near) - Math.min(...near) < 1);
  assert.deepEqual(railColumns().problems, []);
  for (const a of floorAreas()) { if (a.flag && !a.flag.startsWith("brought forward")) continue; assert.ok(a.ratio >= 1.9 && a.ratio <= 2.5, `${a.id}: ${a.ratio.toFixed(2)}x`); }
  assert.ok(LOOP_AT === 146 && EDGE_AT === 242);
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

test("T500 test map: four equal yards on the home block (rotated forts, mats in the yards), the market, no passers-by, no city events, nothing else on the map's rules", () => {
  const { w, arena } = testWorld();
  assert.equal(arena.variant, "test"); assert.equal(arena.halfSize, 250);
  assert.equal(arena.forts!.length, 4);
  const sizes = arena.forts!.map((f) => [f.zone.maxX - f.zone.minX, f.zone.maxZ - f.zone.minZ]);
  for (const s of sizes) assert.deepEqual(s, [36, 36]);
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

test("T500 test map: PLUG & PRAY, FISHY BUSINESS and the museum are stocked; the museum has a giant and heavies", () => {
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
test("T500 the museum: a GIANT won't go out of the public door (put back, told why, not spammed); it goes out through the goods yard; a heavy goes out of the front", () => {
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
test("T500 the recorder: a sighting on Stain Way (where, when, what each carried, what each did next); none through a building; trips and the way home", () => {
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
  ps2[0].move.x = -12 - 6; ps2[0].move.z = -100; ps2[1].move.x = -A + 6; ps2[1].move.z = -100;
  for (let i = 0; i < 60 * 3; i++) w2.tick();
  assert.equal(w2.playtestReport()!.cycles.at(-1)!.sightings.length, 0, "no line through the inner block");
  // trips: Tyson home from PLUG & PRAY up Stain Way; Blake home from the museum by Wood Havoc Lane
  const { w: w3, ps: ps3 } = testWorld(2); toScavenge(w3);
  const pp = TEST_INFO!.places.find((p) => p.id === "plugpray")!, lane = TRASH500.paths.find((p) => p.id === "al_pub")!.pts as [number, number][];
  const f4 = w3.arena.forts![1]; // (Tyson is the second player: slot 1, the south-west fort)
  assert.ok(f4.padX < 0 && f4.padZ < 0, "the second player's fort is F4 (south-west)");
  walk(w3, ps3[1], [[f4.padX, f4.padZ], [-54, 12], [-A + 6, 12], [-A + 6, -52], [(pp.inside.minX + pp.inside.maxX) / 2, -52], [-A + 6, -52], [-A + 6, 12], [-54, 12], [f4.padX, f4.padZ]]);
  const mu = TEST_INFO!.museum, f1 = w3.arena.forts![0];
  walk(w3, ps3[0], [[f1.padX, f1.padZ], [-54, 12], [-A - 6, 12], [-A - 6, -A - 6], [mu.door[0], -A - 6], [mu.door[0], mu.gallery.maxZ - 4], [mu.gate[0], mu.gallery.maxZ - 4], [mu.gate[0], -A - 6],
    [lane.at(-1)![0], -A - 6], ...lane.slice().reverse(), [-54, 12], [f1.padX, f1.padZ]]);
  const trips = w3.playtestReport()!.cycles.at(-1)!.trips;
  const ty = trips.find((t: any) => t.p === "Tyson"), bl = trips.find((t: any) => t.p === "Blake");
  assert.ok(ty && ty.places.includes("PLUG & PRAY REPAIRS") && ty.wayHome === "Stain Way", JSON.stringify(ty));
  assert.ok(bl && bl.places.includes("THE MUSEUM OF QUESTIONABLE HISTORY") && bl.wayHome === "Wood Havoc Lane", JSON.stringify(bl));
});
