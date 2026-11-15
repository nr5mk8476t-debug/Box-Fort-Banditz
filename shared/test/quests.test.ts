// R14 stage 4: quests (shared/src/loop/quests.ts): aura tasks from the fort board, LIVE attempts and interruptions,
// the banana peel, the megaphone, boss jobs + reputation + perks, the deadline, the places being real on both maps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, LOOP, AURA_TASKS, BOSS_JOBS, questLocs, questValid, FORT_SPOTS, fortAt2, QUEST } from "../src/index.js";

const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
const skip = (w: World) => { w.match.timeLeft = 0.001; w.tick(); };
const toPhase = (w: World, ph: string, max = 12) => { for (let i = 0; i < max && w.match.phase !== ph; i++) skip(w); assert.equal(w.match.phase, ph); };
function qWorld(n = 2) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.startMatch(); toPhase(w, "scavenge"); w.takeEvents();
  for (const p of ps) p.cash = 500;
  return { w, ps };
}
const at = (p: { move: { x: number; z: number; y: number } }, x: number, z: number) => { p.move.x = x; p.move.z = z; p.move.y = 0; };
const toBoard = (w: World, p: any) => { const lot = w.arena.forts!.find((f) => f.slot === p.colorIdx)!; const b = fortAt2(lot, FORT_SPOTS.board.u, FORT_SPOTS.board.v); at(p, b.x, b.z); };
/** buy tasks until we get the one wanted (dropping the others) */
function buy(w: World, p: any, id: string) {
  for (let i = 0; i < 40; i++) {
    toBoard(w, p); p.cash = 500; (w.loopQuests as any).of(p).bought = 0;
    w.action(p.id, { a: "taskBuy" });
    const s = (w.loopQuests as any).of(p);
    if (s.task?.def.id === id) { w.takeEvents(); return s.task; }
    if (s.task) w.action(p.id, { a: "questDrop", src: "task" });
    s.lastTask = "";
  }
  throw new Error("never got " + id);
}

test("R14 quests: every task and job points at real places on both maps", () => {
  for (const map of ["new", "classic"] as const) {
    useCity(map); const arena = buildTrashington(); useCity("classic");
    const locs = questLocs(arena);
    for (const l of locs.values()) assert.ok(Number.isFinite(l.x) && Number.isFinite(l.z) && l.r > 0, `${map}: ${l.id}`);
    if (map === "new") {
      for (const d of [...AURA_TASKS, ...BOSS_JOBS]) assert.ok(questValid(d, locs), `new map: ${d.id} can be done`);
      for (const id of ["pub", "seamus", "fever", "fountain", "chinatown", "littleItaly", "store_caratrun"]) assert.ok(locs.has(id), id);
    }
    const valid = AURA_TASKS.filter((d) => questValid(d, locs));
    assert.ok(valid.length >= 3, `${map}: some tasks (${valid.length})`);
  }
});

test("R14 quests: buy at the fort board ($25, then x1.5), one at a time, not away from the board, not in PREP", () => {
  const { w, ps } = qWorld();
  const p = ps[0];
  at(p, p.move.x + 30, p.move.z); w.action("p0", { a: "taskBuy" });
  assert.equal(ev(w.takeEvents(), "questNo")[0]?.reason, "at your fort's board");
  toBoard(w, p); w.action("p0", { a: "taskBuy" });
  const st = ev(w.takeEvents(), "questStart");
  assert.equal(st.length, 1); assert.equal(st[0].cost, LOOP.taskPrice0); assert.equal(p.cash, 500 - 25);
  w.action("p0", { a: "taskBuy" }); assert.equal(ev(w.takeEvents(), "questNo")[0]?.reason, "one task at a time");
  w.action("p0", { a: "questDrop", src: "task" });
  w.action("p0", { a: "taskBuy" }); assert.equal(ev(w.takeEvents(), "questStart")[0].cost, Math.round(25 * 1.5));
  w.action("p0", { a: "questDrop", src: "task" });
  w.action("p0", { a: "taskBuy" }); assert.equal(ev(w.takeEvents(), "questStart")[0].cost, Math.round(25 * 1.5 * 1.5));
  toPhase(w, "prep"); assert.equal((w.loopQuests as any).of(p).task, null, "the deadline ends it");
  w.action("p0", { a: "taskBuy" }); assert.equal(ev(w.takeEvents(), "questNo")[0]?.reason, "tasks are for the scavenge");
  toPhase(w, "scavenge"); assert.equal(w.loopQuests.taskPrice(p), 25, "a new cycle: back to $25");
});

test("R14 quests: a visit task: each place in turn, aura when done; the view shows it to me and LIVE to rivals", () => {
  const { w, ps } = qWorld();
  const a = buy(w, ps[0], "tour");
  const v1 = w.loopQuests.view(ps[1]).q;
  assert.equal(v1.lv.length, 1, "the rival sees the attempt"); assert.equal(v1.lv[0][1], "TOUR OF SHAME");
  const a0 = ps[0].aura;
  for (const l of a.locs) { at(ps[0], l.x, l.z); w.tick(); w.tick(); }
  const end = ev(w.takeEvents(), "questEnd")[0];
  assert.ok(end?.ok, "done"); assert.equal(ps[0].aura - a0, 4);
  assert.equal(w.loopQuests.view(ps[1]).q.lv.length, 0);
});

test("R14 quests: interrupted by a rival: it fails, -4 / +3 once per pair per cycle; a banana peel makes them slip instead", () => {
  const { w, ps } = qWorld();
  const [me, rival] = ps;
  me.aura = 10; rival.aura = 0;
  buy(w, me, "hangtime"); w.takeEvents();
  w.knockdown(me, rival.id);
  let es = w.takeEvents();
  assert.equal(ev(es, "questEnd")[0]?.ok, false); assert.match(ev(es, "questEnd")[0].reason, /interrupted/);
  assert.equal(me.aura, 10 - LOOP.interruptLoss); assert.equal(rival.aura, LOOP.interruptGain);
  // again, same pair, same cycle: it still fails, nobody scores
  me.move.knockT = 0; me.move.immuneT = 0;
  buy(w, me, "hangtime"); w.takeEvents();
  w.knockdown(me, rival.id);
  es = w.takeEvents();
  assert.equal(ev(es, "questInterrupt")[0]?.scored, false); assert.equal(me.aura, 6); assert.equal(rival.aura, 3);
  // a banana peel: the rival slips; my attempt carries on
  me.move.knockT = 0; me.move.immuneT = 0; rival.move.knockT = 0; rival.move.immuneT = 0;
  w.fort.of(me).gear.banana = 1;
  buy(w, me, "hangtime"); w.takeEvents();
  w.knockdown(me, rival.id);
  es = w.takeEvents();
  assert.equal(ev(es, "bananaSlip").length, 1); assert.ok(rival.move.knockT > 0, "they slipped");
  assert.ok((w.loopQuests as any).of(me).task, "still going"); assert.equal(w.fort.of(me).gear.banana, 0);
  // a cop (not a player) knocking me down isn't an interruption
  me.move.knockT = 0; me.move.immuneT = 0; w.knockdown(me, "cop1");
  assert.ok((w.loopQuests as any).of(me).task, "cops don't count");
});

test("R14 quests: stunts (air time, the megaphone's +50%), carrying a giant thing, the time limit", () => {
  const { w, ps } = qWorld(1);
  const p = ps[0];
  w.fort.of(p).gear.megaphone = 1;
  const a = buy(w, p, "hangtime");
  assert.equal(a.megaphone, true); assert.equal(w.fort.of(p).gear.megaphone, 0);
  const a0 = p.aura;
  for (let i = 0; i < 60 * 5; i++) { p.move.grounded = false; p.move.y = 0; (w.loopQuests as any).tick(1 / 60); if (!(w.loopQuests as any).of(p).task) break; }
  assert.equal(p.aura - a0, Math.round(3 * 1.5));
  // time runs out
  buy(w, p, "smashdash"); (w.loopQuests as any).of(p).task.t = 0.01; w.takeEvents(); w.tick();
  assert.equal(ev(w.takeEvents(), "questEnd")[0]?.reason, "out of time");
  // a hold-up counts for the heist
  buy(w, p, "smashdash"); w.emit({ t: "robDone", p: p.id, prop: "till1", value: 10 }); w.tick();
  assert.ok(ev(w.takeEvents(), "questEnd")[0]?.ok);
});

test("R14 quests: boss jobs: at the boss, one per boss per cycle, cash + aura + rep; a failed job costs no rep; perks", () => {
  const { w, ps } = qWorld(1);
  const p = ps[0], Q = w.loopQuests as any;
  w.action("p0", { a: "jobTake", boss: "seamus" }); assert.match(ev(w.takeEvents(), "questNo")[0].reason, /SEAMUS/);
  const s = Q.bossSpot("seamus"); at(p, s.x, s.z);
  w.action("p0", { a: "jobTake", boss: "seamus" });
  const job = Q.of(p).job; assert.equal(job?.def.id, "s_crisps");
  // bring food: it's handed over
  const id = w.placeItem("donut", p.move.x, 1, p.move.z); const it = w.items.get(id)!; it.holder = p.id; it.mode = "held" as never; p.hand = id;
  const c0 = p.cash; w.tick();
  const end = ev(w.takeEvents(), "questEnd")[0];
  assert.ok(end?.ok); assert.equal(p.cash - c0, 40); assert.equal(Q.of(p).rep.seamus, 1); assert.equal(w.items.has(id), false, "Seamus kept the donut");
  w.action("p0", { a: "jobTake", boss: "seamus" }); assert.match(ev(w.takeEvents(), "questNo")[0].reason, /nothing more/);
  // a failed job: no rep lost
  const f = Q.bossSpot("binnie"); at(p, f.x, f.z);
  w.action("p0", { a: "jobTake", boss: "binnie" }); Q.of(p).job.t = 0.01; w.tick();
  assert.equal(ev(w.takeEvents(), "questEnd")[0]?.ok, false); assert.equal(Q.of(p).rep.binnie, 0);
  // perks
  Q.of(p).rep.seamus = 2; Q.of(p).rep.binnie = 2;
  assert.equal(w.loopQuests.vanRate(p), QUEST.vanPerk); assert.equal(w.loopQuests.taskPrice(p), Math.round(25 * QUEST.taskDiscount));
  Q.of(p).rep.seamus = 4; Q.of(p).rep.binnie = 4;
  toPhase(w, "prep"); toPhase(w, "scavenge");
  assert.equal(w.fort.of(p).gear.banana, 1); assert.equal(w.fort.of(p).gear.moustache, 1);
});
