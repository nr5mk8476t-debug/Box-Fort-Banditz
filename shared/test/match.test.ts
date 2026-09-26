import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, fortAt, LOCK_TIME, ROUND_TIME, INTRO_TIME, TALLY_TIME, ROUNDS, TRUCK_SPEED,
  lootDef, type WorldEvent, type MoveInput,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });

/** Advance time; players send "stand still" inputs so their timers run like in a real game. */
function run(w: World, seconds: number, ev?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const p of w.players.values()) w.pushInputs(p.id, [inp(p.lastSeq + 1)]);
    w.tick();
    const e = w.takeEvents();
    if (ev) ev.push(...e);
  }
}
function quiet(players = 1) {
  const w = new World({ seed: 7, npcs: 0, spawnLoot: false });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  return { w, ps };
}
/** Start a match and skip the intro. */
function toScavenge(w: World) {
  assert.ok(w.startMatch());
  assert.equal(w.match.phase, "intro");
  run(w, INTRO_TIME + 0.05);
  assert.equal(w.match.phase, "scavenge");
  w.match.cancelPlannedEvents(); // no random events in rule tests
}
const yard = (w: World, slot: number) => w.arena.forts!.find((f) => f.slot === slot)!;

test("fort yards: each contains its pad, no loot spawns inside, fortAt finds the right slot", () => {
  const city = buildTrashington();
  assert.equal(city.forts!.length, 4);
  for (const f of city.forts!) {
    assert.equal(fortAt(city, f.padX, f.padZ), f.slot, `pad of fort ${f.slot}`);
    assert.equal(fortAt(city, f.backX, f.backZ), -1, "back alley is outside the yard");
  }
  for (const sp of city.lootSpawns!) assert.equal(fortAt(city, sp.x, sp.z), -1, `loot spawn inside a fort yard at ${sp.x},${sp.z}`);
  assert.equal(fortAt(city, 0, 0), -1);
});

test("match flow: lobby -> intro -> scavenge (3 min) -> tally -> ... -> over after 3 rounds; START again resets", () => {
  const { w, ps } = quiet(2);
  assert.equal(w.match.phase, "lobby");
  w.debugTeleport("p0", 0, 0, 0);
  toScavenge(w);
  const pad = yard(w, ps[0].colorIdx);
  assert.ok(Math.hypot(ps[0].move.x - pad.padX, ps[0].move.z - pad.padZ) < 0.5, "round start sends you home");
  const ev: WorldEvent[] = [];
  run(w, ROUND_TIME - 29, ev);
  assert.ok(ev.some((e) => e.t === "round" && e.phase === "hurry"), "30 s warning");
  run(w, 30);
  assert.equal(w.match.phase, "tally");
  run(w, TALLY_TIME + 0.05);
  assert.equal(w.match.phase, "intro");
  assert.equal(w.match.round, 2);
  for (let r = 2; r <= ROUNDS; r++) { run(w, INTRO_TIME + ROUND_TIME + TALLY_TIME + 0.2); }
  assert.equal(w.match.phase, "over");
  ps[0].cash = 99;
  assert.ok(w.startMatch());
  assert.equal(ps[0].cash, 0, "new match resets cash");
  assert.equal(w.match.round, 1);
});

test("banking: loot in YOUR yard locks after 10 s; locked loot can't be grabbed; rivals can steal before that", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const f0 = yard(w, ps[0].colorIdx);
  const tv = w.placeItem("crt_tv", f0.padX, 0.3, f0.padZ + (f0.padZ < 0 ? 1.5 : -1.5));
  run(w, LOCK_TIME - 0.5);
  assert.equal(w.items.get(tv)!.locked, false, "not yet");
  // rival (p1) sneaks in and grabs it before it locks
  const it = w.items.get(tv)!;
  w.debugTeleport("p1", it.body.x, it.body.z - Math.sign(it.body.z) * -1.4, it.body.z < f0.padZ ? Math.PI : 0);
  // face the item
  const p1 = ps[1];
  p1.move.yaw = Math.atan2(it.body.x - p1.move.x, it.body.z - p1.move.z);
  w.action("p1", { a: "grab", item: tv });
  assert.equal(p1.hand, tv, "stolen from the yard!");
  // drop it back: the lock timer starts over
  p1.actionCd = 0;
  w.action("p1", { a: "drop" });
  run(w, 1);
  assert.ok(w.items.get(tv)!.bankT < 1.5, "timer restarted");
  const ev: WorldEvent[] = [];
  run(w, LOCK_TIME + 0.5, ev);
  assert.equal(w.items.get(tv)!.locked, true);
  assert.ok(ev.some((e) => e.t === "banked" && e.p === "p0"), "banked event for the fort owner");
  assert.ok(w.match.bankedValue(ps[0]) > 0, "counts toward p0's live score");
  p1.actionCd = 0;
  const l = w.items.get(tv)!;
  p1.move.x = l.body.x; p1.move.z = l.body.z - 1.2; p1.move.yaw = 0;
  w.action("p1", { a: "grab", item: tv });
  assert.equal(p1.hand, "", "locked loot can't be picked up");
});

test("loot in an empty (unowned) fort yard doesn't bank", () => {
  const { w } = quiet(1); // slot 0 only
  toScavenge(w);
  const f3 = yard(w, 3);
  const id = w.placeItem("crt_tv", f3.padX, 0.3, f3.padZ);
  run(w, LOCK_TIME + 1);
  assert.equal(w.items.get(id)!.locked, false);
});

test("time's up: carried loot outside your fort is LOST; at home it's cashed; yard loot is cashed", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const [a, b] = ps;
  const fa = yard(w, a.colorIdx);
  // a: stands at home holding a TV, plus a locked TV and an unlocked chicken in the yard
  const yardTv = w.placeItem("crt_tv", fa.padX + 2, 0.3, fa.padZ);
  run(w, LOCK_TIME + 0.5);
  const yardChicken = w.placeItem("rubber_chicken", fa.padX - 2, 0.3, fa.padZ);
  const heldTv = w.placeItem("crt_tv", a.move.x + Math.sin(a.move.yaw), 1, a.move.z + Math.cos(a.move.yaw));
  run(w, 0.5);
  w.action(a.id, { a: "grab", item: heldTv });
  assert.equal(a.hand, heldTv);
  // b: out in the plaza with a TV
  w.debugTeleport(b.id, 5, 5, 0);
  const bTv = w.placeItem("crt_tv", 5, 1, 6);
  run(w, 0.5);
  w.action(b.id, { a: "grab", item: bTv });
  assert.equal(b.hand, bTv);
  const expectA = [yardTv, yardChicken, heldTv].reduce((s, id) => s + w.items.get(id)!.value, 0);
  const ev: WorldEvent[] = [];
  run(w, w.match.timeLeft + 0.1, ev);
  assert.equal(w.match.phase, "tally");
  assert.equal(a.cash, expectA, "everything at home cashed in");
  assert.equal(b.cash, 0);
  assert.ok(ev.some((e) => e.t === "lost" && e.p === b.id && e.count === 1), "b lost the TV");
  assert.ok(!w.items.has(bTv) && !w.items.has(heldTv));
  const res = w.match.results;
  assert.equal(res[0].id, a.id, "results sorted by cash");
  assert.equal(res[1].lost, 1);
  // next round: fresh start, cash kept
  run(w, TALLY_TIME + 0.1);
  assert.equal(w.match.round, 2);
  assert.equal(a.cash, expectA);
  assert.equal(a.hand, "");
});

test("happy hour: loot in the zone is worth double; grab it in time to keep the bonus", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  w.match.trigger("happyhour");
  const e = w.match.ev!;
  const inside = w.placeItem("crt_tv", e.x + 1, 0.3, e.z + 1);
  const outside = w.placeItem("crt_tv", e.x + e.r + 5, 0.3, e.z);
  run(w, 4);
  assert.equal(w.match.ev!.stage, "live");
  run(w, 1);
  assert.equal(w.items.get(inside)!.mult, 2);
  assert.equal(w.items.get(outside)!.mult, 1);
  // grab one, leave another lying
  const kept = w.placeItem("rubber_chicken", e.x - 1, 0.3, e.z - 1);
  run(w, 1);
  const p = ps[0];
  w.debugTeleport(p.id, e.x - 1, e.z - 2.2, 0);
  w.action(p.id, { a: "grab", item: kept });
  assert.equal(p.pockets[0], kept);
  run(w, 30);
  assert.equal(w.match.ev, null, "happy hour over");
  assert.equal(w.items.get(inside)!.mult, 1, "left lying around: bonus gone");
  assert.equal(w.items.get(kept)!.mult, 2, "grabbed during happy hour: keeps the bonus");
});

test("garbage truck: warns, drives the ring road, hoovers loose loot, flattens players, leaves banked loot", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  w.match.trigger("truck");
  const e = w.match.ev!;
  const mid = { x: (e.ax! + e.bx!) / 2, z: (e.az! + e.bz!) / 2 };
  const onRoad = w.placeItem("crt_tv", mid.x, 0.3, mid.z);
  const offRoad = w.placeItem("crt_tv", mid.x * 0.4, 0.3, mid.z * 0.4); // back toward the centre, well off the road
  const p = ps[0];
  w.debugTeleport(p.id, (e.ax! * 3 + e.bx!) / 4, (e.az! * 3 + e.bz!) / 4, 0);
  const ev: WorldEvent[] = [];
  run(w, 5.1, ev);
  assert.ok(w.match.truck.on, "truck rolling after the warning");
  run(w, Math.hypot(e.bx! - e.ax!, e.bz! - e.az!) / TRUCK_SPEED + 1, ev);
  assert.ok(!w.items.has(onRoad), "loot on the road got swept");
  assert.ok(w.items.has(offRoad), "loot off the road is safe");
  assert.ok(ev.some((x) => x.t === "swept"));
  assert.ok(ev.some((x) => x.t === "knockdown" && x.p === p.id && x.by === "truck"), "player in the road got flattened");
  assert.equal(w.match.ev, null, "event over when the truck leaves");
  assert.equal(w.match.truck.on, false);
});

test("airdrop: a giant legendary crate parachutes slowly into the plaza", () => {
  const { w } = quiet(1);
  toScavenge(w);
  w.match.trigger("airdrop");
  run(w, 5.1);
  const crate = [...w.items.values()].find((i) => i.type === "airdrop_crate")!;
  assert.ok(crate && crate.chute && crate.body.y > 20, "falling under a chute");
  const def = lootDef("airdrop_crate");
  assert.equal(def.size, "giant");
  assert.equal(def.rarity, "legendary");
  run(w, 3);
  assert.ok(crate.body.vy >= -3.6, "slow fall");
  run(w, 12);
  assert.equal(crate.chute, false, "landed");
  assert.ok(Math.abs(crate.body.x) < 23 && Math.abs(crate.body.z) < 23, "in the plaza");
  assert.equal(w.match.ev, null);
});

test("raccoon heist: steals the best loot from your yard (even banked), escapes = gone; bonk it = you get it back", () => {
  for (const bonk of [false, true]) {
    const { w, ps } = quiet(1);
    toScavenge(w);
    const f = yard(w, ps[0].colorIdx);
    const junk = w.placeItem("rubber_chicken", f.padX + 2, 0.3, f.padZ);
    const prize = w.placeItem("crt_tv", f.padX - 2, 0.3, f.padZ);
    run(w, LOCK_TIME + 0.5);
    assert.ok(w.items.get(prize)!.locked);
    w.debugTeleport(ps[0].id, 30, 30, 0); // away from home
    w.match.trigger("raccoons");
    const ev: WorldEvent[] = [];
    run(w, 5.1, ev);
    const coon = [...w.npc.npcs.values()].find((n) => n.kind === "raccoon")!;
    assert.ok(coon, "a raccoon appeared behind the fort");
    for (let i = 0; i < 20 * 10 && !coon.carry; i++) run(w, 0.1, ev);
    assert.equal(coon.carry, prize, "went for the most valuable thing");
    assert.ok(ev.some((e) => e.t === "raccoonGrab" && e.p === ps[0].id));
    if (bonk) {
      w.debugTeleport(ps[0].id, coon.move.x, coon.move.z - 1.2, 0);
      ps[0].move.yaw = Math.atan2(coon.move.x - ps[0].move.x, coon.move.z - ps[0].move.z);
      w.action(ps[0].id, { a: "punch", yaw: ps[0].move.yaw, pitch: 0 });
      run(w, 1);
      assert.equal(w.items.get(prize)?.mode, "free", "dropped it");
      assert.equal(ps[0].notoriety, 0, "no heat for bonking a thief");
    } else {
      run(w, 40, ev);
      assert.ok(!w.items.has(prize), "got away with it");
      assert.ok(ev.some((e) => e.t === "raccoonEscaped" && e.p === ps[0].id));
      assert.ok(w.items.has(junk), "only took one thing");
    }
  }
});

test("events escalate: 1 in round 1, 2 in round 2, 3 in round 3, never the same one twice in a round", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: true });
  w.addPlayer("p0", "A");
  w.startMatch();
  const counts: string[][] = [[], [], []];
  const ev: WorldEvent[] = [];
  run(w, INTRO_TIME + ROUND_TIME * 3 + TALLY_TIME * 3 + INTRO_TIME * 2 + 1, ev);
  let round = 0;
  for (const e of ev) {
    if (e.t === "round" && e.phase === "scavenge") round = e.round;
    if (e.t === "cityEvent" && e.stage === "warn") counts[round - 1].push(e.kind);
  }
  assert.deepEqual(counts.map((c) => c.length), [1, 2, 3], JSON.stringify(counts));
  for (const c of counts) assert.equal(new Set(c).size, c.length);
  assert.equal(w.match.phase, "over");
});
