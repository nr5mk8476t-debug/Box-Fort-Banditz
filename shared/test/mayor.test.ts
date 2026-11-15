// R14 stage 5: RUN FOR MAYOR (loop/mayor.ts): qualifying (spent atomically), the campaign (clock paused, PRESIDENT
// MARMALADE, posters, goofy objectives, the speech), strikes, an arrest, failure's penalties, victory ends the match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, LOOP, FORT_SPOTS, fortAt2, MAYOR } from "../src/index.js";

const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
const skip = (w: World) => { w.match.timeLeft = 0.001; w.tick(); };
const toPhase = (w: World, ph: string, max = 12) => { for (let i = 0; i < max && w.match.phase !== ph; i++) skip(w); assert.equal(w.match.phase, ph); };
function mWorld() {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 0, spawnLoot: false, arena });
  const ps = [w.addPlayer("p0", "P0"), w.addPlayer("p1", "P1")];
  w.startMatch(); toPhase(w, "scavenge"); w.takeEvents();
  return { w, ps };
}
const toBoard = (w: World, p: any) => { const lot = w.arena.forts!.find((f) => f.slot === p.colorIdx)!; const b = fortAt2(lot, FORT_SPOTS.board.u, FORT_SPOTS.board.v); p.move.x = b.x; p.move.z = b.z; };
const qualify = (w: World, p: any) => { p.aura = 70; p.cash = 1000; const f = w.fort.of(p); f.ups.add("level2"); f.ups.add("level3"); f.ups.add("level4"); f.gear.posters = 1; f.gear.sash = 1; f.v++; };
const at = (w: World, p: any, x: number, z: number, s = 0.3) => { p.move.x = x; p.move.z = z; p.move.y = 0; p.move.grounded = true; p.move.vx = 0; p.move.vz = 0; for (let i = 0; i < Math.round(s * 60); i++) { p.move.x = x; p.move.z = z; w.tick(); } };

test("R14 mayor: qualifying (60 aura, $800, the Mayor's Fort, posters + sash), spent at once; the clock stops; the President appears", () => {
  const { w, ps } = mWorld();
  const p = ps[0];
  toBoard(w, p); w.action("p0", { a: "mayorRun" });
  assert.match(ev(w.takeEvents(), "mayorNo")[0].reason, /you need: 60 AURA, \$800 FEE, THE MAYOR'S FORT, CAMPAIGN POSTERS, CEREMONIAL SASH/);
  qualify(w, p); p.move.x += 20; w.action("p0", { a: "mayorRun" });
  assert.equal(ev(w.takeEvents(), "mayorNo")[0].reason, "at your fort's board");
  toBoard(w, p); w.action("p0", { a: "mayorRun" });
  const st = ev(w.takeEvents(), "mayorStart");
  assert.equal(st.length, 1);
  assert.equal(p.cash, 1000 - LOOP.mayorFee); assert.equal(w.fort.of(p).gear.posters, 0); assert.equal(w.fort.of(p).gear.sash, 0);
  assert.equal(w.match.paused, true);
  const t0 = w.match.timeLeft; for (let i = 0; i < 120; i++) w.tick(); assert.equal(w.match.timeLeft, t0, "the round's clock stops");
  const pres = [...w.npc.npcs.values()].find((n) => n.kind === "president");
  assert.ok(pres, "PRESIDENT MARMALADE"); assert.ok(Math.hypot(pres!.move.x - st[0].x, pres!.move.z - st[0].z) < 1, "at the announced spot");
  // one at a time
  qualify(w, ps[1]); toBoard(w, ps[1]); w.action("p1", { a: "mayorRun" });
  assert.match(ev(w.takeEvents(), "mayorNo")[0].reason, /someone else/);
  // everyone sees it
  const v1 = w.mayor.view(ps[1]) as any;
  assert.equal(v1.c.p, "p0"); assert.equal(v1.c.o.length, 5); assert.equal(v1.c.ps.length, MAYOR.posterSpots);
});

test("R14 mayor: the whole campaign: handshake, 5 posters, 2 goofy objectives, the speech last = MAYOR, the match ends", () => {
  const { w, ps } = mWorld();
  const p = ps[0]; qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  const c = w.mayor.c!;
  // the speech doesn't count yet
  at(w, p, c.podium.x, c.podium.z, 2); assert.equal(c.speech, 0, "not before the rest");
  const pn = w.npc.npcs.get(c.presNpc)!; at(w, p, pn.move.x + 1, pn.move.z); assert.ok(c.presDone, "shook hands");
  for (const x of c.posters.slice(0, 5)) at(w, p, x.loc.x, x.loc.z, MAYOR.posterTime + 0.2);
  assert.equal(c.posters.filter((x) => x.done).length, 5);
  for (const g of c.goofy) g.prog = g.need; // (each kind: its own test below)
  at(w, p, c.podium.x, c.podium.z, MAYOR.speechTime + 0.5);
  const es = w.takeEvents();
  assert.ok(ev(es, "mayorEnd")[0]?.ok, "elected");
  assert.equal(w.match.phase, "over"); assert.equal(w.match.results[0].id, "p0"); assert.equal(w.match.results[0].mayor, true);
  assert.equal([...w.npc.npcs.values()].some((n) => n.kind === "president"), false, "he leaves");
});

test("R14 mayor: goofy objectives count (air, slides, a photo op, pressing the flesh)", () => {
  const { w, ps } = mWorld();
  const p = ps[0]; qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  const c = w.mayor.c!;
  c.goofy = (["air", "slides", "photo", "flesh"] as const).map((k) => ({ id: k, name: k, kind: k, need: k === "air" ? 1 : k === "photo" ? 1 : k === "slides" ? 2 : 1, text: "", prog: 0, loc: k === "photo" ? c.podium : null, slid: false, met: new Set<string>() }));
  for (let i = 0; i < 70; i++) { p.move.grounded = false; w.mayor.tick(1 / 60); }
  for (let k = 0; k < 2; k++) { p.move.grounded = true; p.move.slideT = 0.5; w.mayor.tick(1 / 60); p.move.slideT = 0; w.mayor.tick(1 / 60); }
  p.move.x = c.podium.x; p.move.z = c.podium.z; p.move.vx = 0; p.move.vz = 0; for (let i = 0; i < 70; i++) w.mayor.tick(1 / 60);
  const civ = w.npc.spawnAt("tourist", p.move.x + 1, p.move.z, 0)!; w.mayor.tick(1 / 60); void civ;
  assert.deepEqual(c.goofy.map((g) => g.prog >= g.need), [true, true, true, true]);
});

test("R14 mayor: 3 strikes (-15 s each) fail it: aura halved, the fort loses a level, not again this cycle; a banana = no strike", () => {
  const { w, ps } = mWorld();
  const [p, r] = ps; qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  const c = w.mayor.c!;
  w.fort.of(p).gear.banana = 1;
  w.knockdown(p, r.id); let es = w.takeEvents();
  assert.equal(ev(es, "bananaSlip").length, 1); assert.equal(c.strikes, 0);
  const up = () => { p.move.knockT = 0; p.move.immuneT = 0; };
  up(); const t0 = c.t; w.knockdown(p, r.id); assert.equal(c.strikes, 1); assert.ok(Math.abs(t0 - c.t - LOOP.strikeTime) < 0.1);
  up(); w.knockdown(p, "cop1"); assert.equal(c.strikes, 1, "only rivals strike");
  up(); w.knockdown(p, r.id); up(); w.knockdown(p, r.id);
  es = w.takeEvents();
  assert.equal(ev(es, "mayorEnd")[0]?.ok, false); assert.equal(ev(es, "mayorEnd")[0].reason, "3 strikes");
  assert.equal(p.aura, 35); assert.equal(w.fort.of(p).ups.has("level4"), false); assert.equal(w.fort.of(p).ups.has("level3"), true);
  assert.equal(w.match.paused, false); assert.equal(w.mayor.c, null);
  qualify(w, p); up(); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  assert.equal(ev(w.takeEvents(), "mayorNo")[0]?.reason, "not again this cycle");
  toPhase(w, "prep"); toPhase(w, "scavenge"); qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  assert.equal(ev(w.takeEvents(), "mayorStart").length, 1, "next cycle: fine");
});

test("R14 mayor: an arrest or the time running out fails it; pings every 20 s", () => {
  const { w, ps } = mWorld();
  const p = ps[0]; qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" }); w.takeEvents();
  for (let i = 0; i < 60 * 21; i++) w.mayor.tick(1 / 60);
  assert.equal(ev(w.takeEvents(), "mayorPing").length, 1);
  p.jailT = 30; w.tick();
  assert.equal(ev(w.takeEvents(), "mayorEnd")[0]?.reason, "arrested");
  p.jailT = 0;
  const { w: w2, ps: ps2 } = mWorld(); const q = ps2[0]; qualify(w2, q); toBoard(w2, q); w2.action("p0", { a: "mayorRun" });
  w2.mayor.c!.t = 0.01; w2.tick();
  assert.equal(ev(w2.takeEvents(), "mayorEnd")[0]?.reason, "out of time");
});

test("R14.1 the speech is 10 UNINTERRUPTED seconds (Blake's repro): knocked down at 4 s, it starts again", () => {
  const { w, ps } = mWorld();
  const p = ps[0]; qualify(w, p); toBoard(w, p); w.action("p0", { a: "mayorRun" });
  const c = w.mayor.c!;
  c.presDone = true; for (const x of c.posters.slice(0, 5)) x.done = true; for (const g of c.goofy) g.prog = g.need;
  at(w, p, c.podium.x, c.podium.z, 4.1);
  assert.ok(c.speech > 3.5, `4 s in (${c.speech.toFixed(1)})`);
  w.knockdown(p, "cop1");
  assert.equal(c.speech, 0, "knocked down: from the start");
  p.move.knockT = 0; p.move.immuneT = 0;
  at(w, p, c.podium.x, c.podium.z, 1);
  assert.ok(c.speech < 1.5 && w.match.phase !== "over", `starts again (${c.speech.toFixed(1)})`);
});
