// R14: the game loop's rules (Blake's brief + decisions, docs/game-loop-plan.md): the phases, the deposit mat, the
// shelves and the safe, selling in PREP, upgrades and crafting, night theft, aura's anti-farming rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, LOOP, UPGRADE, type MoveInput } from "../src/index.js";

const settle = (w: World, s = 1) => { for (let i = 0; i < Math.round(s * 60); i++) w.tick(); };
const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
function loopWorld(n = 2) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.startMatch(); w.takeEvents();
  return { w, ps };
}
/** jump to the end of the current phase */
const skip = (w: World) => { w.match.timeLeft = 0.001; w.tick(); };
const toPhase = (w: World, ph: string, max = 12) => { for (let i = 0; i < max && w.match.phase !== ph; i++) skip(w); assert.equal(w.match.phase, ph); };
const lot = (w: World, slot: number) => w.arena.forts!.find((f) => f.slot === slot)!;
/** a loose item dropped on a fort's mat */
const onMat = (w: World, slot: number, type: string, value: number, dx = 0) => { const f = lot(w, slot); const id = w.placeItem(type, f.padX + dx, 0.6, f.padZ); w.items.get(id)!.value = value; return id; };
const fwd = (seq: number): MoveInput => ({ seq, mx: 0, mz: 1, yaw: 0, pitch: 0, jump: false, sprint: true, crouch: false, dodge: false });

test("R14 phases: a 5 s countdown at home (frozen), 5:30 day, 0:30 sunset, 2:00 night, 2:00 PREP at home, round 2", () => {
  const { w, ps } = loopWorld();
  assert.equal(w.match.phase, "intro"); assert.equal(Math.round(w.match.timeLeft), LOOP.introTime);
  const z0 = ps[0].move.z;
  for (let i = 1; i <= 60; i++) { w.pushInputs("p0", [fwd(i)]); w.tick(); }
  assert.ok(Math.abs(ps[0].move.z - z0) < 0.01, "can't leave during the countdown");
  toPhase(w, "scavenge"); assert.ok(Math.abs(w.match.timeLeft - 330) < 1);
  toPhase(w, "dusk"); toPhase(w, "night"); assert.ok(Math.abs(w.match.timeLeft - 120) < 1);
  ps[0].move.x += 30; // (out in the city)
  toPhase(w, "prep"); assert.ok(Math.abs(w.match.timeLeft - LOOP.prepTime) < 1);
  for (const p of ps) { const f = lot(w, p.colorIdx); assert.ok(Math.hypot(p.move.x - f.padX, p.move.z - f.padZ) < 1, `${p.id} teleported home`); }
  w.action("p0", { a: "punch", yaw: 0, pitch: 0 }); assert.equal(ev(w.takeEvents(), "punch").length, 0, "no punching in PREP");
  toPhase(w, "intro"); assert.equal(w.match.round, 2);
});

test("R14 phases: warnings at 2:30, 1:00 and 0:10 left; READY skips PREP; after 8 cycles the most aura wins", () => {
  const { w, ps } = loopWorld();
  toPhase(w, "scavenge"); w.takeEvents();
  w.match.timeLeft = 1; w.tick(); toPhase(w, "dusk"); toPhase(w, "night");
  w.match.timeLeft = 151; for (let i = 0; i < 61; i++) w.tick();
  w.match.timeLeft = 61; for (let i = 0; i < 61; i++) w.tick();
  w.match.timeLeft = 11; for (let i = 0; i < 61; i++) w.tick();
  assert.deepEqual(ev(w.takeEvents(), "loopWarn").map((e) => e.left), [150, 60, 10]);
  toPhase(w, "prep");
  for (const p of ps) w.action(p.id, { a: "ready" });
  settle(w, 1.2); assert.equal(w.match.phase, "intro", "everyone ready: on we go");
  ps[1].aura = 12; ps[0].aura = 5; ps[0].cash = 999;
  for (let c = 0; c < 40 && (w.match.phase as string) !== "over"; c++) skip(w);
  assert.equal(w.match.phase, "over"); assert.equal(w.match.round, LOOP.maxCycles);
  assert.equal(w.match.results[0].id, "p1", "most aura wins (cash only breaks a tie)");
});

test("R14 banking: 10 s on your mat (all at once, one event), off the mat it stops, a full shelf waits, the deadline takes the rest", () => {
  const { w, ps } = loopWorld();
  toPhase(w, "scavenge"); w.takeEvents();
  const a = onMat(w, 0, "crt_tv", 40, -0.5), b = onMat(w, 0, "lava_lamp", 20, 0.5);
  settle(w, 5);
  assert.ok(w.items.get(a)!.bankT > 3 && w.items.has(b), "counting down");
  settle(w, 5.5);
  const bk = ev(w.takeEvents(), "banked");
  assert.equal(bk.length, 1, "one event for the batch"); assert.equal(bk[0].types.length, 2); assert.equal(bk[0].value, 60);
  assert.ok(!w.items.has(a) && !w.items.has(b), "off the street"); assert.equal(w.fort.of(ps[0]).recs.length, 2);
  // taken off the mat: the count stops; back on: from zero
  const c = onMat(w, 0, "plank", 5); settle(w, 6);
  const f = lot(w, 0), it = w.items.get(c)!; it.body.x = f.padX + 4; it.body.resting = true; settle(w, 0.2);
  assert.equal(it.bankT, 0, "off the mat: no count");
  // a full shelf: it waits ("STORAGE FULL")
  const fs = w.fort.of(ps[0]);
  while (fs.recs.length < LOOP.shelves[0]) fs.recs.push({ id: "x" + fs.recs.length, type: "brick", value: 1, safe: false });
  const d = onMat(w, 0, "duct_tape", 5); settle(w, 11);
  assert.ok(w.items.has(d), "waits on the mat"); assert.equal(ev(w.takeEvents(), "storageFull").length, 1);
  // the deadline: still on the mat, or carried: gone (Blake); banked: kept into the next cycle
  toPhase(w, "dusk"); toPhase(w, "night"); toPhase(w, "prep");
  assert.ok(!w.items.has(d) && !w.items.has(c), "unbanked loot deleted");
  toPhase(w, "intro"); toPhase(w, "scavenge");
  assert.equal(w.fort.of(ps[0]).recs.length, LOOP.shelves[0], "banked kept across the cycle");
});

test("R14 PREP: the van pays 60% (wanted x2 once), a sale happens once, the safe holds 2 and only off-night, upgrades and crafting use cash + items", () => {
  const { w, ps } = loopWorld();
  const [a] = ps, f = w.fort.of(a);
  f.recs.push({ id: "t1", type: "crt_tv", value: 100, safe: false }, { id: "t2", type: "plank", value: 10, safe: false }, { id: "t3", type: "plank", value: 10, safe: false }, { id: "t4", type: "lava_lamp", value: 20, safe: false }, { id: "t5", type: "laptop", value: 50, safe: false });
  w.action("p0", { a: "vanSell", recs: ["t1"] }); assert.equal(a.cash, 0, "no van outside PREP");
  toPhase(w, "scavenge"); toPhase(w, "dusk"); toPhase(w, "night");
  w.action("p0", { a: "protect", rec: "t1", on: true }); assert.equal(f.recs.find((r) => r.id === "t1")!.safe, false, "not at night");
  toPhase(w, "prep");
  w.fort.wanted = ["crt_tv"];
  w.action("p0", { a: "vanSell", recs: ["t1", "t1"] }); assert.equal(a.cash, Math.round(100 * LOOP.vanRate * LOOP.wantedMult), "wanted x2, sold once");
  for (const id of ["t2", "t3", "t4"]) w.action("p0", { a: "protect", rec: id, on: true });
  assert.equal(f.recs.filter((r) => r.safe).length, LOOP.safe[0], "the safe holds 2");
  a.cash = 0; w.action("p0", { a: "upgrade", id: "workbench" }); assert.ok(!f.ups.has("workbench"), "no money, no workbench");
  a.cash = 500; w.action("p0", { a: "upgrade", id: "level3" }); assert.ok(!f.ups.has("level3"), "needs level 2 first");
  w.action("p0", { a: "upgrade", id: "workbench" });
  assert.ok(f.ups.has("workbench")); assert.equal(a.cash, 500 - UPGRADE.get("workbench")!.cash);
  assert.equal(f.recs.filter((r) => r.type === "plank").length, 1, "one plank used (the unprotected one first)");
  w.action("p0", { a: "craft", id: "megaphone" }); assert.ok(!f.gear.megaphone, "a megaphone needs junk too");
  f.recs.push({ id: "j1", type: "newspaper", value: 2, safe: false });
  w.action("p0", { a: "craft", id: "megaphone" }); assert.equal(f.gear.megaphone, 1);
  assert.ok(!f.recs.some((r) => r.id === "t5" || r.id === "j1"), "the ingredients are gone");
});

test("R14 night theft: 5 s at a rival's shelves, into your hands; cancelled by moving; never the safe; one thief per item; ALARM II = 10 s and names you; +2 aura once per item a cycle", () => {
  const { w, ps } = loopWorld();
  const [a, b] = ps, fb = w.fort.of(b);
  fb.recs.push({ id: "s1", type: "lava_lamp", value: 30, safe: false }, { id: "s2", type: "laptop", value: 80, safe: true });
  const atB = () => { const f = lot(w, b.colorIdx); w.debugTeleport("p0", f.x, f.z + 2, Math.PI, 0.2); };
  toPhase(w, "scavenge"); atB(); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "steal", owner: "p1", rec: "s1" });
  assert.ok(ev(w.takeEvents(), "theftNo").some((e) => e.reason === "day"), "only at night");
  toPhase(w, "dusk"); toPhase(w, "night"); atB(); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "steal", owner: "p1", rec: "s2" });
  assert.ok(ev(w.takeEvents(), "theftNo").some((e) => e.reason === "safe"), "the safe's off limits");
  w.action("p0", { a: "steal", owner: "p1", rec: "s1" }); settle(w, 2);
  a.move.x += 3; settle(w, 0.1);
  assert.ok(ev(w.takeEvents(), "theftEnd").some((e) => !e.ok && e.reason === "moved"), "moved away: cancelled");
  assert.ok(fb.recs.some((r) => r.id === "s1"), "still theirs");
  atB(); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "steal", owner: "p1", rec: "s1" }); settle(w, LOOP.theftTime + 0.2);
  const done = ev(w.takeEvents(), "theftEnd").find((e) => e.ok)!;
  assert.ok(done, "stolen"); assert.ok(!fb.recs.some((r) => r.id === "s1"));
  const held = w.items.get(done.item!)!;
  assert.equal(held.holder, "p0"); assert.equal(held.value, 30); assert.equal(a.aura, LOOP.theftAura);
  assert.equal(ev(w.takeEvents(), "fortAlarm").length, 0, "no alarm without the upgrade");
  // ALARM II: 10 s, the owner's told who
  fb.ups.add("alarm1"); fb.ups.add("alarm2"); fb.recs.push({ id: "s3", type: "plank", value: 6, safe: false });
  w.consumeItem(a, held.id); settle(w, 0.1); atB(); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "steal", owner: "p1", rec: "s3" });
  const al = ev(w.takeEvents(), "fortAlarm")[0];
  assert.ok(al && al.p === "p1" && al.thief === "p0", "ALARM II: who");
  settle(w, LOOP.theftTime + 0.5); assert.ok(fb.recs.some((r) => r.id === "s3"), "not done at 5 s");
  settle(w, LOOP.theftTimeAlarm - LOOP.theftTime); assert.ok(!fb.recs.some((r) => r.id === "s3"), "done at 10 s");
  // the same thing stolen back and forth pays aura once a cycle
  const auraBefore = a.aura; w.loopAura.theft(a, "s1"); assert.equal(a.aura, auraBefore, "s1 already paid this cycle");
  // night ends mid-theft: cancelled cleanly
  fb.recs.push({ id: "s4", type: "plank", value: 6, safe: false });
  for (const it of w.carriedItems(a)) w.consumeItem(a, it.id);
  atB(); settle(w, 0.3); w.action("p0", { a: "steal", owner: "p1", rec: "s4" }); settle(w, 1); w.takeEvents();
  toPhase(w, "prep");
  assert.ok(ev(w.takeEvents(), "theftEnd").some((e) => !e.ok), "cancelled at the phase change"); assert.ok(fb.recs.some((r) => r.id === "s4"));
});

test("R14 two thieves, one item: the first one's on it, the second's refused; aura for a cop once per cop, 3 a cycle", () => {
  const { w, ps } = loopWorld(3);
  const [a, b, c] = ps, fc = w.fort.of(c);
  fc.recs.push({ id: "z1", type: "lava_lamp", value: 30, safe: false });
  toPhase(w, "scavenge"); toPhase(w, "dusk"); toPhase(w, "night");
  const f = lot(w, c.colorIdx);
  w.debugTeleport("p0", f.x - 1, f.z + 2, Math.PI, 0.2); w.debugTeleport("p1", f.x + 1, f.z + 2, Math.PI, 0.2); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "steal", owner: "p2", rec: "z1" }); w.action("p1", { a: "steal", owner: "p2", rec: "z1" });
  assert.ok(ev(w.takeEvents(), "theftNo").some((e) => e.p === "p1" && e.reason === "taken"));
  settle(w, LOOP.theftTime + 0.3);
  assert.equal(w.carriedItems(a).length, 1); assert.equal(w.carriedItems(b).length, 0);
  for (const id of ["c1", "c1", "c2", "c3", "c4"]) w.loopAura.cop(b, id);
  assert.equal(b.aura, LOOP.copAuraMax, "each cop once, three a cycle");
});
