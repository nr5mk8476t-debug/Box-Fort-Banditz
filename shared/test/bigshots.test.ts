import { test } from "node:test";
import assert from "node:assert/strict";
import { World, NPC_DEFS, BIG_SHOTS, BIG_SHOT_FIRST, BIG_SHOT_STAY, SPECIAL_KINDS, NPC_COUNT, lootDef, starsOf, type MoveInput, type WorldEvent } from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function run(w: World, seconds: number, collect?: WorldEvent[]) {
  const p = w.players.get("a")!;
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
function setup(seed = 3) {
  const w = new World({ seed, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, 0, -60, 0);
  return { w, p };
}
/** Stand right in front of an NPC and punch it. */
function punch(w: World, id: string, ev: WorldEvent[]) {
  const n = w.npc.npcs.get(id)!;
  const p = w.players.get("a")!;
  w.movePlayer(p, n.move.x, n.move.z - 1.1, 0);
  run(w, 0.05, ev);
  const m = w.npc.npcs.get(id)!;
  w.action("a", { a: "punch", yaw: Math.atan2(m.move.x - p.move.x, m.move.z - p.move.z), pitch: 0 });
  run(w, 0.7, ev);
}

test("big shots: four kinds, each with a jackpot worth the heat, never part of the everyday crowd", () => {
  assert.deepEqual([...BIG_SHOTS].sort(), ["celebrity", "courier", "crypto_bro", "millionaire"]);
  for (const k of BIG_SHOTS) {
    assert.ok(SPECIAL_KINDS.has(k));
    const best = Math.max(...NPC_DEFS[k].loot.map(([t]) => lootDef(t).valueMax));
    assert.ok(best >= 200, `${k} carries up to $${best}`);
  }
  // a normal pedestrian carries way less
  assert.ok(Math.max(...NPC_DEFS.tourist.loot.map(([t]) => lootDef(t).valueMax)) < 120);
});

test("one big shot at a time: announced, walks around with their entourage, and leaves town eventually", () => {
  const { w } = setup();
  const ev: WorldEvent[] = [];
  run(w, BIG_SHOT_FIRST + 2, ev);
  const arrive = ev.filter((e) => e.t === "bigShot" && e.stage === "arrive");
  assert.equal(arrive.length, 1, "announced once");
  const b = w.npc.activeBigShot()!;
  assert.ok(b);
  const p = w.players.get("a")!;
  assert.ok(Math.hypot(b.move.x - p.move.x, b.move.z - p.move.z) >= 29, "arrives out of your face");
  // nobody near -> after the stay they're gone, and a new one comes later
  const ev2: WorldEvent[] = [];
  run(w, BIG_SHOT_STAY + 5, ev2);
  assert.ok(ev2.some((e) => e.t === "bigShot" && e.stage === "gone" && e.npc === b.id), "left town");
  assert.ok(!w.npc.npcs.has(b.id));
  run(w, 80, ev2);
  assert.ok(ev2.filter((e) => e.t === "bigShot" && e.stage === "arrive").length >= 1, "another one shows up");
  // the everyday crowd is untouched by all this
  const crowd = [...w.npc.npcs.values()].filter((n) => !SPECIAL_KINDS.has(n.kind)).length;
  assert.equal(crowd, 0); // (this test world has no crowd)
  void NPC_COUNT;
});

test("millionaire: punch = gold bar / diamond ring + big heat; the bodyguard comes for you", () => {
  const { w, p } = setup();
  const m = w.npc.spawnBigShot("millionaire")!;
  run(w, 2);
  const guard = [...w.npc.npcs.values()].find((n) => n.leader === m.id)!;
  assert.equal(guard.kind, "bodyguard");
  assert.ok(Math.hypot(guard.move.x - m.move.x, guard.move.z - m.move.z) < 3.5, "bodyguard sticks close");
  const ev: WorldEvent[] = [];
  const h0 = p.notoriety;
  punch(w, m.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "gold_bar" || i.type === "diamond_ring"), "jackpot dropped");
  assert.ok(p.notoriety - h0 >= 25, `heat +${(p.notoriety - h0).toFixed(0)}`);
  assert.ok(ev.some((e) => e.t === "bigShot" && e.stage === "hit"));
  assert.equal(w.npc.npcs.get(guard.id)!.state === "chase" || w.npc.npcs.get(guard.id)!.state === "windup" || w.npc.npcs.get(guard.id)!.state === "stunned", true, "bodyguard is after you");
  assert.equal(w.npc.npcs.get(guard.id)!.target, "a");
});

test("armored courier: takes 2 hits (armor), then the money bag drops and you're instantly 2 stars", () => {
  const { w, p } = setup();
  const c = w.npc.spawnBigShot("courier")!;
  run(w, 1);
  const ev: WorldEvent[] = [];
  punch(w, c.id, ev);
  assert.ok(![...w.items.values()].some((i) => i.type === "money_bag"), "first hit: armor holds");
  const n = w.npc.npcs.get(c.id)!;
  n.state = "walk"; n.stateT = 0; n.attackCd = 5; // (don't let it fight back mid-test)
  punch(w, c.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "money_bag"), "second hit: the bag");
  assert.ok(starsOf(p.notoriety) >= 2, `stars: ${starsOf(p.notoriety)}`);
});

test("celebrity: award trophy; the fans film it (extra heat); crypto bro: a wallet worth $0-500", () => {
  const { w, p } = setup();
  const c = w.npc.spawnBigShot("celebrity")!;
  run(w, 2);
  const fans = [...w.npc.npcs.values()].filter((n) => n.leader === c.id);
  assert.equal(fans.length, 2);
  const ev: WorldEvent[] = [];
  const h0 = p.notoriety;
  punch(w, c.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "award_trophy"));
  assert.ok(fans.some((f) => w.npc.npcs.get(f.id)?.state === "film"), "fans filming");
  assert.ok(p.notoriety - h0 >= 40, `heat +${(p.notoriety - h0).toFixed(0)} (with the fans)`);
  // crypto
  const q = setup(9);
  const cb = q.w.npc.spawnBigShot("crypto_bro")!;
  run(q.w, 1);
  punch(q.w, cb.id, []);
  const wal = [...q.w.items.values()].find((i) => i.type === "hardware_wallet");
  assert.ok(wal && wal.value >= 0 && wal.value <= 500);
  assert.ok(lootDef("hardware_wallet").mystery);
});

test("the entourage follows the boss around (and doesn't get stuck behind)", () => {
  const { w } = setup(5);
  const m = w.npc.spawnBigShot("millionaire")!;
  let far = 0;
  for (let i = 0; i < 60; i++) {
    run(w, 0.5);
    const g = [...w.npc.npcs.values()].find((n) => n.leader === m.id);
    if (g && Math.hypot(g.move.x - m.move.x, g.move.z - m.move.z) > 5) far++;
  }
  assert.ok(far <= 3, `bodyguard strayed ${far}/60 times`);
});
