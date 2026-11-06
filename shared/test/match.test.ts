import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, fortAt, LOCK_TIME, ROUND_TIME, INTRO_TIME, TRUCK_SPEED, CYCLES, NIGHT_TIME, DUSK_TIME, DAWN_TIME, SHOP_TIME, UPGRADE_TIME, ITEM_TARGET_NIGHT,
  lootDef, type WorldEvent, type MoveInput,
} from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

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

test("cycle (R12.3): intro -> one 8-min scavenge (5.5 min day -> 30 s sunset -> 2 min night) -> dawn -> shop -> upgrades, x3 -> over; START resets", () => {
  const { w, ps } = quiet(2);
  assert.equal(w.match.phase, "lobby");
  w.debugTeleport("p0", 0, 0, 0);
  toScavenge(w);
  const pad = yard(w, ps[0].colorIdx);
  assert.ok(Math.hypot(ps[0].move.x - pad.padX, ps[0].move.z - pad.padZ) < 0.5, "a cycle starts at home");
  const ev: WorldEvent[] = [];
  assert.equal(ROUND_TIME + DUSK_TIME + NIGHT_TIME, 480, "8 minutes of scavenging");
  assert.ok(Math.abs(w.match.scavengeLeft - 480) < 0.1);
  run(w, ROUND_TIME + 0.05, ev);
  assert.equal(w.match.phase, "dusk");
  assert.ok(!w.match.night && w.match.scavenging, "the sunset: still day for the rules, still scavenging");
  assert.ok(!ev.some((e) => e.t === "round" && e.phase === "hurry"), "no hurry at sunset: nothing's lost");
  run(w, DUSK_TIME / 2);
  assert.ok(w.match.darkness > 0.4 && w.match.darkness < 0.6, `half way down (${w.match.darkness})`);
  run(w, DUSK_TIME / 2 + 0.05);
  assert.equal(w.match.phase, "night");
  assert.ok(w.match.night, "night falls");
  run(w, NIGHT_TIME - 29, ev);
  assert.ok(ev.some((e) => e.t === "round" && e.phase === "hurry"), "30 s to sunrise");
  run(w, 30);
  assert.equal(w.match.phase, "dawn");
  assert.ok(!w.match.night);
  run(w, DAWN_TIME + 0.05);
  assert.equal(w.match.phase, "shop");
  run(w, SHOP_TIME + 0.05);
  assert.equal(w.match.phase, "upgrades");
  // everyone READY skips the wait
  w.action("p0", { a: "ready" }); w.action("p1", { a: "ready" });
  run(w, 1.1);
  assert.equal(w.match.phase, "intro");
  assert.equal(w.match.round, 2);
  const cycle = INTRO_TIME + ROUND_TIME + DUSK_TIME + NIGHT_TIME + DAWN_TIME + SHOP_TIME + 0.4;
  run(w, cycle + UPGRADE_TIME); // cycle 2
  run(w, cycle); // cycle 3: straight to the final results after the shop
  assert.equal(w.match.round, CYCLES);
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

test("time's up (end of the night): carried loot away from home is LOST; at home it lands in your yard", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const [a, b] = ps;
  const fa = yard(w, a.colorIdx);
  const yardTv = w.placeItem("crt_tv", fa.padX + 2, 0.3, fa.padZ);
  run(w, LOCK_TIME + 0.5);
  const yardChicken = w.placeItem("rubber_chicken", fa.padX - 2, 0.3, fa.padZ); // not locked yet at time-up
  const heldTv = w.placeItem("crt_tv", a.move.x + Math.sin(a.move.yaw), 1, a.move.z + Math.cos(a.move.yaw));
  run(w, 0.5);
  w.action(a.id, { a: "grab", item: heldTv });
  assert.equal(a.hand, heldTv);
  w.debugTeleport(b.id, 5, 5, 0);
  const bTv = w.placeItem("crt_tv", 5, 1, 6);
  run(w, 0.5);
  w.action(b.id, { a: "grab", item: bTv });
  assert.equal(b.hand, bTv);
  const expectA = [yardTv, yardChicken, heldTv].reduce((s, id) => s + w.items.get(id)!.value, 0);
  const ev: WorldEvent[] = [];
  run(w, w.match.timeLeft + 0.1, ev);
  assert.equal(w.match.phase, "dusk");
  assert.equal(a.hand, heldTv, "R12.3: sunset isn't time-up: you keep what you carry");
  assert.ok(!ev.some((e) => e.t === "lost"));
  run(w, DUSK_TIME + NIGHT_TIME + 0.1, ev);
  assert.equal(w.match.phase, "dawn");
  assert.equal(a.cash, 0, "loot isn't cash until you sell it");
  assert.equal(a.hand, "");
  for (const id of [yardTv, yardChicken, heldTv]) assert.ok(w.items.get(id)?.locked, `${id} banked in a's fort at sunrise`);
  assert.equal(w.match.bankedValue(a), expectA);
  assert.ok(ev.some((e) => e.t === "lost" && e.p === b.id && e.count === 1), "b lost the TV");
  assert.ok(!w.items.has(bTv));
  assert.equal(w.match.results[0].id, a.id);
  assert.equal(w.match.results.find((l) => l.id === b.id)!.lost, 1);
});

test("night (R12.3): no wipe at nightfall: the day's loot stays, fresh x2 loot appears, heat builds twice as fast", () => {
  const w = new World({ seed: 5, npcs: 0, spawnLoot: true });
  const p = w.addPlayer("p0", "A");
  w.startMatch(); run(w, INTRO_TIME + 0.05);
  w.match.cancelPlannedEvents();
  const loose = () => [...w.items.values()].filter((it) => it.mode === "free" && it.shop < 0 && !lootDef(it.type).junk);
  const day = new Set(loose().map((it) => it.id));
  w.match.timeLeft = 0.01; run(w, 0.05);
  assert.equal(w.match.phase, "dusk");
  run(w, DUSK_TIME + 0.05);
  assert.equal(w.match.phase, "night");
  const now = loose();
  assert.ok([...day].every((id) => w.items.has(id)), "nothing wiped at nightfall");
  const fresh = now.filter((it) => !day.has(it.id));
  assert.ok(fresh.length >= 8, `fresh night loot appears (${fresh.length})`);
  assert.ok(fresh.every((it) => it.mult === 2), "night loot is worth double");
  assert.ok(ITEM_TARGET_NIGHT < day.size, "and it doesn't keep refilling at night (scarce)");
  p.notoriety = 0; w.addHeat(p, 10);
  assert.equal(p.notoriety, 20, "heat x2 at night");
});

test("night raids: banked loot can be taken at night, and the owner's alarm goes off", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const [a, b] = ps;
  const fa = yard(w, a.colorIdx);
  const tv = w.placeItem("crt_tv", fa.padX + 2, 0.3, fa.padZ);
  run(w, LOCK_TIME + 0.5);
  const grabAt = () => { const it = w.items.get(tv)!; w.debugTeleport(b.id, it.body.x, it.body.z - 1.2, 0); b.actionCd = 0; w.action(b.id, { a: "grab", item: tv }); };
  grabAt();
  assert.equal(b.hand, "", "by day banked loot is safe");
  w.takeEvents();
  w.match.timeLeft = 0.01; run(w, DUSK_TIME + 0.2);
  assert.equal(w.match.phase, "night");
  assert.ok(w.items.get(tv)!.locked, "still banked after nightfall");
  grabAt();
  const ev = w.takeEvents();
  assert.equal(b.hand, tv, "raided!");
  assert.ok(ev.some((e) => e.t === "raid" && e.owner === a.id && e.p === b.id), "alarm for the owner");
});

test("C1 raid alert: a rival walking into your compound at night sets off your alarm at once (not by day, not your own)", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const [a, b] = ps;
  const fa = yard(w, a.colorIdx);
  const alarms = (step: () => void) => { const ev: WorldEvent[] = []; step(); run(w, 0.2, ev); return ev.filter((e) => e.t === "raidEnter"); };
  const outside = () => w.debugTeleport(b.id, fa.padX, fa.zone.maxZ + 3, Math.PI);
  const inside = () => w.debugTeleport(b.id, fa.padX, fa.padZ, Math.PI);
  alarms(outside);
  assert.equal(alarms(inside).length, 0, "by day: no alarm");
  alarms(outside);
  w.match.timeLeft = 0.01; run(w, DUSK_TIME + 0.2);
  assert.equal(w.match.phase, "night");
  assert.equal(alarms(() => w.debugTeleport(a.id, fa.padX + 2, fa.padZ, 0)).length, 0, "the owner at home: no alarm");
  alarms(() => w.debugTeleport(a.id, 0, -80, 0));
  const ev = alarms(inside);
  assert.equal(ev.length, 1);
  assert.ok(ev[0].t === "raidEnter" && ev[0].owner === a.id && ev[0].p === b.id && ev[0].slot === a.colorIdx, "names the raider, for the owner");
  alarms(outside);
  assert.equal(alarms(inside).length, 0, "not again straight away (15 s)");
});

test("pawn shop: offers below value, haggle up or offend him, SELL = cash, unsold loot is lost", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  const [a] = ps;
  const fa = yard(w, a.colorIdx);
  const ids = [0, 1, 2, 3].map((i) => w.placeItem("crt_tv", fa.padX - 3 + i * 2, 0.3, fa.padZ));
  run(w, LOCK_TIME + 0.5);
  w.match.timeLeft = 0.01; run(w, DUSK_TIME + 0.2);
  w.match.timeLeft = 0.01; run(w, DAWN_TIME + 0.2);
  assert.equal(w.match.phase, "shop");
  const offers = w.pawn.list(a.id);
  assert.equal(offers.length, 4, "an offer for every item in the fort");
  for (const o of offers) assert.ok(o.offer < o.value && o.offer <= o.max, "lowball first");
  assert.ok(ids.every((id) => !w.items.has(id)), "items went to the shop");
  const view = JSON.parse(w.pawn.viewJson(a.id));
  assert.ok(!("max" in view[0]), "his limit is secret");
  const o = offers[0];
  let before = o.offer;
  for (let i = 0; i < 6 && o.state === "open"; i++) {
    w.action(a.id, { a: "haggle", item: o.id });
    if (o.mood === "offended") assert.ok(o.offer < before, "offended: offer drops");
    else assert.ok(o.offer > before, "haggled up");
    before = o.offer;
  }
  assert.equal(o.state, "final");
  assert.ok(o.offer <= o.max, "never above his limit");
  w.action(a.id, { a: "sell", item: o.id });
  assert.equal(a.cash, o.offer);
  w.action(a.id, { a: "sell", item: offers[1].id });
  const cash = a.cash;
  const ev: WorldEvent[] = [];
  run(w, w.match.timeLeft + 0.1, ev);
  assert.equal(a.cash, cash);
  assert.ok(ev.some((e) => e.t === "lost" && e.p === a.id && e.count === 2 && e.unsold), "2 unsold items lost");
});

test("small money goes straight into your cash; the money bag has to be carried home", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  const [a] = ps;
  w.debugTeleport(a.id, 5, 5, 0);
  const coins = w.placeItem("coin_pile", 5, 0.3, 6.2);
  const bag = w.placeItem("money_bag", 5.6, 0.3, 6.2);
  run(w, 0.5);
  const v = w.items.get(coins)!.value;
  w.action(a.id, { a: "grab", item: coins });
  assert.equal(a.cash, v);
  assert.ok(!w.items.has(coins));
  a.actionCd = 0;
  w.action(a.id, { a: "grab", item: bag });
  assert.equal(a.hand, bag, "money bag is carried");
  assert.equal(a.cash, v);
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
  w.traffic.cars.length = 0; // (a rule test for the truck: no other traffic to wipe you out or shove the loot first)
  w.match.trigger("truck");
  const e = w.match.ev!;
  const mid = { x: (e.ax! + e.bx!) / 2, z: (e.az! + e.bz!) / 2 };
  const offRoad = w.placeItem("crt_tv", mid.x * 0.4, 0.3, mid.z * 0.4); // back toward the centre, well off the road
  const p = ps[0];
  const ev: WorldEvent[] = [];
  run(w, 5.1, ev);
  assert.ok(w.match.truck.on, "truck rolling after the warning");
  // (Slice 2A: 18 cars now; drop the loot just ahead of the truck so passing traffic can't shove it aside first)
  const len = Math.hypot(e.bx! - e.ax!, e.bz! - e.az!), ux = (e.bx! - e.ax!) / len, uz = (e.bz! - e.az!) / len;
  const onRoad = w.placeItem("crt_tv", w.match.truck.x + ux * 5, 0.3, w.match.truck.z + uz * 5);
  w.debugTeleport(p.id, w.match.truck.x + ux * 12, w.match.truck.z + uz * 12, 0); // (and the player: cars could have wiped them out already)
  run(w, Math.hypot(e.bx! - e.ax!, e.bz! - e.az!) / TRUCK_SPEED + 1, ev);
  assert.ok(!w.items.has(onRoad), "loot on the road got swept");
  assert.ok(w.items.has(offRoad), "loot off the road is safe");
  assert.ok(ev.some((x) => x.t === "swept"));
  assert.ok(ev.some((x) => x.t === "knockdown" && x.p === p.id && x.by === "truck"), "player in the road got flattened: " + JSON.stringify(ev.filter((x) => x.t === "knockdown" || x.t === "wipeout" || x.t === "hurt")));
  assert.equal(w.match.ev, null, "event over when the truck leaves");
  assert.equal(w.match.truck.on, false);
});

test("airdrop: a giant legendary crate parachutes slowly onto one of the open squares", () => {
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
  assert.ok(w.arena.airdropSpots!.some(([x, z]) => Math.hypot(crate.body.x - x, crate.body.z - z) < 4), `on a drop spot (${crate.body.x.toFixed(1)},${crate.body.z.toFixed(1)})`);
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

test("events escalate: 1 in cycle 1, 2 in cycle 2, 3 in cycle 3 (day only), never the same one twice", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: true });
  w.addPlayer("p0", "A");
  w.startMatch();
  const counts: string[][] = [[], [], []];
  const ev: WorldEvent[] = [];
  const cycle = INTRO_TIME + ROUND_TIME + DUSK_TIME + NIGHT_TIME + DAWN_TIME + SHOP_TIME + UPGRADE_TIME;
  run(w, cycle * 3 + 1, ev);
  let round = 0, night = false;
  for (const e of ev) {
    if (e.t === "round" && e.phase === "scavenge") { round = e.round; night = false; }
    if (e.t === "round" && e.phase === "night") night = true;
    if (e.t === "cityEvent" && e.stage === "warn") { assert.ok(!night, "no city events at night"); counts[round - 1].push(e.kind); }
  }
  assert.deepEqual(counts.map((c) => c.length), [1, 2, 3], JSON.stringify(counts));
  for (const c of counts) assert.equal(new Set(c).size, c.length);
  assert.equal(w.match.phase, "over");
});

// ============================================================================ C5b: Chinatown's dragon parade
import { PARADE } from "../src/index.js";

test("C5b the dragon parade: warns, dances up Chinatown, bumps you out of its way, drops red envelopes of lucky money, then leaves", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  const C = w.arena.chinatown!;
  assert.ok(C && C.route.length >= 2, "Chinatown has a parade route");
  const p = ps[0];
  w.match.trigger("parade");
  assert.equal(w.match.ev?.kind, "parade");
  assert.equal(w.match.paradeD, -1, "not moving during the warning");
  // stand in the street, a bit ahead of the start
  const at = w.match.paradeAt(8);
  w.debugTeleport(p.id, at.x, at.z, 0);
  const ev: WorldEvent[] = [];
  run(w, 10.1, ev); // (R4: the street parades warn for 10 s)
  assert.ok(w.match.paradeD >= 0, "live");
  let bumped = false;
  for (let i = 0; i < 12 * 60 && !bumped; i++) { run(w, 1 / 60, ev); if (Math.abs(p.move.x - at.x) > 0.8) bumped = true; }
  assert.ok(bumped, `the dragon bumped the bandit aside (x ${p.move.x.toFixed(2)} vs ${at.x})`);
  assert.equal(p.move.knockT, 0, "a bump, not a knockdown");
  const total = C.route.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - C.route[i].x, q.z - C.route[i].z), 0);
  run(w, (total + PARADE.segments * PARADE.gap + 4) / PARADE.speed, ev);
  assert.equal(w.match.ev, null, "the parade has left");
  assert.equal(w.match.paradeD, -1);
  const env = [...w.items.values()].filter((it) => it.type === "red_envelope");
  assert.ok(env.length >= 12, `${env.length} red envelopes scattered`);
  assert.ok(ev.filter((e) => e.t === "firecracker").length >= 12, "firecrackers");
  assert.ok(env.filter((it) => Math.abs(it.body.x - 72) < 8).length >= env.length * 0.7, `mostly along the street: ${env.map((it) => it.body.x.toFixed(0)).join(",")}`);
});

// ============================================================================ R4: Little Italy's festa (new city)
import { FESTA, setCityMap as useMap, buildTrashington as buildCity } from "../src/index.js";
function newCityWorld(players = 1, seed = 7) {
  useMap("new"); const arena = buildCity(); useMap("classic");
  const w = new World({ seed, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  return { w, ps };
}
const festaRun = (w: World, ev: WorldEvent[], until: () => boolean, max = 90) => { for (let i = 0; i < max * 60 && !until(); i++) run(w, 1 / 60, ev); };

test("R4 festa: all three (meatball, band, gondola) roll up Little Italy, drop money worth the dragon's envelopes, then leave", () => {
  const env = lootDef("red_envelope");
  for (const t of FESTA.drop) { const d = lootDef(t); assert.ok(d.money && d.valueMin === env.valueMin && d.valueMax === env.valueMax, `${t} is worth what a red envelope is`); }
  assert.equal(FESTA.dropEvery, PARADE.envelopeEvery, "dropped as often as the envelopes");
  for (let v = 0; v < 3; v++) {
    const { w, ps } = newCityWorld();
    toScavenge(w);
    const LI = w.arena.littleItaly!, p = ps[0];
    assert.ok(LI.route[0].x < 0, "Little Italy is on the west avenue");
    w.match.trigger("festa"); w.match.festaV = v;
    const ev: WorldEvent[] = [];
    // stand in the street ahead of it
    const at = w.match.paradeAt(12, LI.route);
    w.debugTeleport(p.id, at.x, at.z, 0);
    p.move.stamina = 0.2;
    run(w, 10.1, ev);
    assert.ok(w.match.festaD >= 0, `${FESTA.names[v]} is live`);
    let hit = false, knocked = false, maxStam = 0;
    for (let i = 0; i < 30 * 60 && !hit; i++) { run(w, 1 / 60, ev); if (Math.hypot(p.move.x - at.x, p.move.z - at.z) > 0.8 || p.move.knockT > 0) hit = true; if (p.move.knockT > 0) knocked = true; maxStam = Math.max(maxStam, p.move.stamina); }
    assert.ok(hit, `${FESTA.names[v]} got the bandit out of its way`);
    if (v === 0) assert.ok(knocked, "the giant meatball flattens you");
    if (v === 1) assert.ok(maxStam > 0.9, `the band's dance buff refills stamina (${maxStam.toFixed(2)})`);
    festaRun(w, ev, () => w.match.ev === null, 120);
    assert.equal(w.match.ev, null, "it has left"); assert.equal(w.match.festaD, -1);
    const drops = [...w.items.values()].filter((it) => it.type === FESTA.drop[v]);
    assert.ok(drops.length >= 12, `${drops.length} ${FESTA.drop[v]}s dropped`);
    assert.ok(drops.filter((it) => Math.abs(it.body.x - LI.route[0].x) < 8).length >= drops.length * 0.7, "mostly along the street");
    if (v === 2) assert.ok(ev.some((e) => e.t === "festaSplash"), "the gondolier splashes canal water");
  }
});

test("R4 the city's events: the dragon parade and the festa are both on the new map's list (one each side of town)", () => {
  const { w } = newCityWorld();
  assert.ok(w.arena.chinatown && w.arena.littleItaly, "both districts");
  assert.ok(w.arena.chinatown.route[0].x > 0 && Math.abs(w.arena.chinatown.route[0].x + w.arena.littleItaly.route[0].x) < 0.01, "mirror images");
  const kinds = new Set<string>();
  for (let s = 0; s < 40; s++) { (w.match as unknown as { planEvents(): void; round: number }).round = 3; (w.match as unknown as { planEvents(): void }).planEvents(); for (const q of (w.match as unknown as { plan: { kind: string }[] }).plan) kinds.add(q.kind); }
  assert.ok(kinds.has("parade") && kinds.has("festa"), [...kinds].join(","));
});

test("R4 traffic and the parades: their street closes, and no car drives into the dragon or the festa", () => {
  for (const [kind, seed] of [["parade", 7], ["parade", 1], ["parade", 3], ["festa", 7], ["festa", 1], ["festa", 3]] as const) {
    const { w } = newCityWorld(1, seed);
    toScavenge(w);
    w.match.trigger(kind);
    let worst = Infinity, live = 0, engulf = Infinity;
    for (let i = 0; i < 90 * 30; i++) {
      run(w, 1 / 30);
      const bodies = w.match.paradeBodies();
      if (bodies.length) live++;
      for (const c of w.traffic.cars) {
        for (const b of bodies) engulf = Math.min(engulf, Math.hypot(c.x - b.x, c.z - b.z) - b.r);
        if (c.v < 1) continue; // (a stopped car the float rolls past is fine: it doesn't move into it)
        for (const b of bodies) {
          if ((b.x - c.x) * Math.sin(c.yaw) + (b.z - c.z) * Math.cos(c.yaw) <= 0) continue; // (only what's in front of it: the float catching up from behind isn't the car's doing)
          worst = Math.min(worst, Math.hypot(c.x - b.x, c.z - b.z) - b.r);
        }
      }
    }
    assert.ok(live > 600, `${kind} was in the street`);
    assert.ok(worst > 1.5, `${kind} (seed ${seed}): closest a moving car got was ${worst.toFixed(2)} m`);
    assert.ok(engulf > 1.5, `${kind} (seed ${seed}): its street is closed to traffic, so it never rolls through a waiting car (closest ${engulf.toFixed(2)} m)`);
  }
});
