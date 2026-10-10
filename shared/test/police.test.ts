import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inRect, onRoadAt, starsOf, JAIL_TIME, BREAKOUT_HEAT, COP_RUN, PLAYER, makeLock, newLockRun, lockPress, lockUpdate,
  pinPos, bindingPin, LOCK, ARREST, type MoveInput, type WorldEvent, type LockRun,
} from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function quiet(seed = 21) {
  const w = new World({ seed, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, -106, -82, 0);
  return { w, p };
}
function run(w: World, id: string, seconds: number, p: Partial<MoveInput> = {}, collect?: WorldEvent[], each?: () => void) {
  const pl = w.players.get(id)!;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.pushInputs(id, [inp(pl.lastSeq + 1, p)]); w.tick();
    const e = w.takeEvents(); if (collect) collect.push(...e);
    each?.();
  }
}
/** Perfect lock-picking: press each binding pin in the middle of its next window. */
function perfectPresses(seed: number, start = 0.5): { pin: number; t: number }[] {
  const r = newLockRun(seed);
  const out: { pin: number; t: number }[] = [];
  let t = start;
  while (!r.solved && t < 60) {
    const pin = bindingPin(r), p = r.def.pins[pin];
    let a = t + 0.05;
    while (!(pinPos(p, a) >= p.lo && pinPos(p, a) <= p.hi)) a += 0.002;
    let b = a;
    while (pinPos(p, b) >= p.lo && pinPos(p, b) <= p.hi) b += 0.002;
    t = (a + b) / 2;
    lockPress(r, pin, t);
    out.push({ pin, t });
  }
  return out;
}

test("wanted stars: 30 / 60 / 90 heat", () => {
  assert.deepEqual([0, 29, 30, 59, 60, 89, 90, 100].map(starsOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("the station: 4 barred cells inside, door and back alley outside, road network on the roads", () => {
  const c = buildTrashington();
  const st = c.station!;
  assert.equal(st.cells.length, 4);
  for (const cell of st.cells) assert.ok(inRect(st.rect, cell.x, cell.z) && inRect(cell.rect, cell.x, cell.z));
  assert.ok(!inRect(st.rect, st.door.x, st.door.z) && !inRect(st.rect, st.alley.x, st.alley.z));
  assert.ok(c.boxes.filter((b) => b.kind === "bars").length === 4);
  const g = c.roadGraph!;
  // every road link runs down the middle of a road
  for (const [a, b] of g.edges) for (let k = 0; k <= 1; k += 0.05) {
    const x = g.nodes[a].x + (g.nodes[b].x - g.nodes[a].x) * k, z = g.nodes[a].z + (g.nodes[b].z - g.nodes[a].z) * k;
    assert.ok(onRoadAt(c, x, z), `road link off the road at ${x},${z}`);
  }
  const seen = new Set([0]), st2 = [0];
  while (st2.length) { const n = st2.pop()!; for (const [a, b] of g.edges) { const o = a === n ? b : b === n ? a : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); st2.push(o); } } }
  assert.equal(seen.size, g.nodes.length, "road network connected");
});

test("dispatch: 1 star = 1 cop, 2 = 2, 3 = 3 + a cop car; cops arrive from out of sight, 22-42 m away", () => {
  for (const [heat, cops, cars] of [[35, 1, 0], [65, 2, 0], [95, 3, 1]]) {
    const { w, p } = quiet();
    p.notoriety = heat;
    const spawns: WorldEvent[] = [];
    run(w, "a", 10, {}, spawns, () => { if (p.jailT <= 0) p.notoriety = heat; }); // (a new cop every 4 s; heat held)
    const sp = spawns.filter((e) => e.t === "copSpawn");
    // (at 3 stars the cop who hops out of the car counts toward the 3)
    assert.equal(sp.length, cops, `${heat} heat: cops on you`);
    assert.equal(spawns.filter((e) => e.t === "copCar" && e.stage === "dispatch").length, cars, `${heat} heat: cars`);
  }
  // spawn distance + hidden: check right at the moment of spawning
  const { w, p } = quiet(5);
  w.addHeat(p, 65);
  let checked = 0;
  for (let i = 0; i < 60 * 6; i++) {
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick();
    for (const e of w.takeEvents()) if (e.t === "copSpawn") {
      const c = w.npc.npcs.get(e.npc)!;
      const d = Math.hypot(c.move.x - p.move.x, c.move.z - p.move.z);
      assert.ok(d >= 21.5 && d <= 42.5, `spawned ${d.toFixed(1)} m away`);
      checked++;
    }
  }
  assert.equal(checked, 2);
});

test("stand still with a star: a cop walks up, FREEZE, busted -> loot confiscated, heat 0, 30 s in a cell", () => {
  const w = new World({ seed: 8, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, -106, -82, 0);
  const watch = w.placeItem("rolecks_watch", -106, 0.2, -81.4);
  const lint = w.placeItem("pocket_lint", -105.7, 0.2, -81.4);
  run(w, "a", 0.5);
  w.action("a", { a: "grab", item: lint }); run(w, "a", 0.3);
  w.action("a", { a: "grab", item: watch }); run(w, "a", 0.3);
  assert.ok(p.pockets.includes(lint) || p.hand === lint);
  w.addHeat(p, 40); // a crime right here
  const ev: WorldEvent[] = [];
  run(w, "a", 30, {}, ev);
  const b = ev.find((e) => e.t === "busted") as Extract<WorldEvent, { t: "busted" }>;
  assert.ok(b, "busted");
  assert.equal(b.count, 2);
  assert.ok(!w.items.has(watch) && !w.items.has(lint), "confiscated: gone for good");
  assert.ok(ev.some((e) => e.t === "npcSay" && /FREEZE|STOP|Hands/.test(e.line)), "shouted first");
  assert.equal(p.notoriety, 0);
  assert.ok(p.jailT > 0 && p.jailT <= JAIL_TIME);
  const cell = w.arena.station!.cells[p.jailCell];
  assert.ok(inRect(cell.rect, p.move.x, p.move.z, 0.3), "in the cell");
  assert.equal(p.hand, ""); assert.deepEqual(p.pockets, ["", "", ""]);
  // every cop on you goes home
  run(w, "a", 1);
  assert.ok(w.police.cops().every((c) => c.state === "leave"));
});

test("jail: you can't get out of the cell by walking, can't act, nobody can punch you; serve 30 s -> front door, clean", () => {
  const { w, p } = quiet();
  const q = w.addPlayer("b", "B");
  w.police.bust(p, "test", false);
  const cell = w.arena.station!.cells[p.jailCell];
  // walk into the bars / walls for a while
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) run(w, "a", 1.2, { mz: 1, yaw, sprint: true, jump: true });
  assert.ok(inRect(cell.rect, p.move.x, p.move.z, 0.6), `still in the cell (${p.move.x.toFixed(1)}, ${p.move.z.toFixed(1)})`);
  // actions do nothing
  const it = w.placeItem("pocket_lint", p.move.x, 0.2, p.move.z + 0.4);
  w.action("a", { a: "grab", item: it }); run(w, "a", 0.3);
  assert.equal(w.items.get(it)!.mode, "free");
  // a friend outside the bars can't punch you through them
  w.movePlayer(q, cell.x, cell.z + 2.4, Math.PI);
  const ev: WorldEvent[] = [];
  w.action("b", { a: "punch", yaw: Math.PI, pitch: 0 }); run(w, "b", 0.2, {}, ev);
  assert.ok(!ev.some((e) => e.t === "knockdown"));
  const rel: WorldEvent[] = [];
  run(w, "a", JAIL_TIME, {}, rel);
  const r = rel.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && !r.breakout);
  assert.equal(p.jailT, 0);
  const door = w.arena.station!.door;
  assert.ok(Math.hypot(p.move.x - door.x, p.move.z - door.z) < 1.5, "outside the front door");
  assert.equal(p.notoriety, 0);
});

test("lock picking: every lock is different, deterministic, and solvable in time by perfect play", () => {
  const counts = new Set<number>(), patterns = new Set<string>(), orders = new Set<string>();
  for (let s = 1; s <= 300; s++) {
    const d = makeLock(s);
    counts.add(d.pins.length);
    d.pins.forEach((p) => patterns.add(p.pattern));
    orders.add(d.order.join(""));
    assert.deepEqual(makeLock(s), d, "same seed, same lock");
    for (const p of d.pins) { assert.ok(p.lo >= 0.05 && p.hi <= 0.98 && p.hi - p.lo > 0.1); }
    const presses = perfectPresses(s);
    assert.ok(presses[presses.length - 1].t < 20, `lock ${s} takes ${presses[presses.length - 1].t.toFixed(1)} s with perfect play`);
  }
  assert.deepEqual([...counts].sort(), [4, 5, 6]);
  assert.equal(patterns.size, 4);
  assert.ok(orders.size > 150, "binding orders vary");
});

test("lock picking: slips drop a pin, 3 quick slips bring the guard (locked out), tension runs out", () => {
  const seed = 77;
  const r: LockRun = newLockRun(seed);
  const good = perfectPresses(seed);
  // set the first pin properly
  assert.equal(lockPress(r, good[0].pin, good[0].t), "set");
  assert.equal(r.set, 1);
  // press a pin that isn't binding: slip, first pin drops again
  const wrong = (bindingPin(r) + 1) % r.def.pins.length;
  const res = lockPress(r, wrong, good[0].t + 0.3);
  assert.ok(res === "wrong" || res === "slip");
  assert.equal(r.set, 0);
  // two more slips in quick succession: the third one brings the guard
  const n = r.def.pins.length;
  assert.notEqual(lockPress(r, (bindingPin(r) + 1) % n, good[0].t + 0.4), "guard");
  assert.equal(lockPress(r, (bindingPin(r) + 1) % n, good[0].t + 0.5), "guard");
  assert.ok(r.lockUntil > good[0].t);
  assert.equal(lockPress(r, bindingPin(r), good[0].t + 1), "locked");
  // noise fades: 2 slips, wait 9 s, 1 more slip is not the guard
  const r2 = newLockRun(seed);
  const other = (bindingPin(r2) + 1) % r2.def.pins.length;
  lockPress(r2, other, 1); lockPress(r2, other, 1.1);
  assert.notEqual(lockPress(r2, other, 10), "guard");
  // tension: set one pin, then wait too long -> all pins drop
  const r3 = newLockRun(seed);
  lockPress(r3, good[0].pin, good[0].t);
  assert.equal(lockUpdate(r3, good[0].t + r3.def.tension + 0.1), "tension");
  assert.equal(r3.set, 0);
  assert.equal(LOCK.slipsToGuard, 3);
});

test("break out: pick the lock -> back alley, still wanted (1 star); presses from the future are rejected", () => {
  const { w, p } = quiet();
  w.police.bust(p, "test", false);
  const presses = perfectPresses(p.lockSeed, 0.6);
  // pressing ahead of the server's clock is ignored
  w.action("a", { a: "pick", pin: presses[0].pin, t: 25 });
  assert.equal(p.lock!.set, 0);
  const ev: WorldEvent[] = [];
  let i = 0;
  for (let k = 0; k < 60 * 25 && p.jailT > 0; k++) {
    const now = w.time - p.lockT0;
    while (i < presses.length && presses[i].t <= now) { w.action("a", { a: "pick", pin: presses[i].pin, t: presses[i].t }); i++; }
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); ev.push(...w.takeEvents());
  }
  const r = ev.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && r.breakout, "broke out");
  assert.ok(w.time - p.lockT0 < JAIL_TIME);
  const al = w.arena.station!.alley;
  assert.ok(Math.hypot(p.move.x - al.x, p.move.z - al.z) < 1.5, "in the back alley");
  assert.equal(starsOf(p.notoriety), 1);
  assert.equal(p.notoriety <= BREAKOUT_HEAT, true);
});

test("hiding: buildings block the view, crouching behind a parked car hides you, heat cools once they lose you", () => {
  const { w, p } = quiet();
  // a parked car (long side along z) with open ground 12 m to one side (Slice 2A: the city is denser now)
  const solidsOn = (x0: number, x1: number, z: number, skip: object) => w.arena.boxes.some((b) => b !== skip && b.y + b.h / 2 > 0.4 && b.y - b.h / 2 < 2
    && Math.abs(z - b.z) < b.d / 2 + 0.4 && Math.max(x0, x1) > b.x - b.w / 2 - 0.4 && Math.min(x0, x1) < b.x + b.w / 2 + 0.4);
  let car = w.arena.boxes[0], side = 1;
  for (const b of w.arena.boxes) {
    if (b.kind !== "car" || b.d <= b.w) continue;
    const s = [1, -1].find((k) => !solidsOn(b.x + k * (b.w / 2 + 0.2), b.x + k * (b.w / 2 + 1), b.z, b) && !solidsOn(b.x - k * (b.w / 2 + 0.2), b.x - k * 12.5, b.z, b));
    if (s) { car = b; side = s; break; }
  }
  assert.equal(car.kind, "car", "found a parked car in the open");
  // player crouched right behind the car, cop 12 m away on the other side
  w.movePlayer(p, car.x + side * (car.w / 2 + 0.6), car.z, 0);
  p.notoriety = 40;
  const c = w.police.spawnCop(p, { x: car.x - side * 12, z: car.z })!;
  p.move.crouching = true;
  assert.equal(w.police.canSee(c, p), false, "crouched behind the car");
  p.move.crouching = false;
  assert.equal(w.police.canSee(c, p), true, "standing up");
  // a tower between you and the cop
  const tower = w.arena.boxes.find((b) => b.kind === "tower" && b.y - b.h / 2 < 0.5)!; // (a whole tower, not one sitting on a shop)
  w.movePlayer(p, tower.x + tower.w / 2 + 2, tower.z, 0);
  c.move.x = tower.x - tower.w / 2 - 2; c.move.z = tower.z;
  assert.equal(w.police.canSee(c, p), false);
});

test("lose them: commit a crime, slip away out of sight -> cops search the crime scene, heat cools, they give up", () => {
  const { w, p } = quiet(9);
  w.movePlayer(p, -106, -82, 0);
  w.addHeat(p, 65); // reported right here
  run(w, "a", 1);
  // sneak off behind a tower on the far side of downtown
  const tower = w.arena.boxes.find((b) => b.kind === "tower" && b.x > 0 && b.z > 0 && b.y - b.h / 2 < 0.5)!;
  w.movePlayer(p, tower.x + tower.w / 2 + 1.2, tower.z + 3, 0);
  const ev: WorldEvent[] = [];
  let searched = false;
  run(w, "a", 45, { crouch: true }, ev, () => { if (w.police.cops().some((c) => c.state === "search")) searched = true; });
  assert.ok(!ev.some((e) => e.t === "busted"), "got away");
  assert.ok(searched, "cops searched the crime scene");
  assert.ok(p.notoriety < 30, `heat cooled (${p.notoriety.toFixed(0)})`);
  run(w, "a", 40);
  assert.equal(w.police.cops().length, 0, "everyone gave up and left");
});

test("cops are faster than walking, slower than sprinting; a dodge at the right moment slips the grab", () => {
  assert.ok(COP_RUN > PLAYER.walkSpeed && COP_RUN < PLAYER.sprintSpeed);
  const { w, p } = quiet();
  p.notoriety = 40;
  const c = w.police.spawnCop(p, { x: -106, z: -79 }, true)!;
  let dodged = false;
  const ev: WorldEvent[] = [];
  for (let i = 0; i < 60 * 3 && !dodged; i++) {
    const dodge = c.state === "windup" && c.stateT < 0.12;
    w.pushInputs("a", [inp(p.lastSeq + 1, { dodge, mx: dodge ? 1 : 0 })]); w.tick(); ev.push(...w.takeEvents());
    if (dodge && p.move.dodgeT > 0) dodged = true;
  }
  run(w, "a", 0.3, {}, ev);
  assert.ok(dodged, "dodged during the grab");
  assert.ok(!ev.some((e) => e.t === "busted"), "slipped it");
});

test("punch a cop: they stagger (+heat), 3 punches = down for a few seconds, drops a donut", () => {
  const { w, p } = quiet();
  p.notoriety = 35;
  const c = w.police.spawnCop(p, { x: -106, z: -80.8 }, false)!;
  c.state = "search"; c.lostT = 0;
  const h0 = p.notoriety;
  const ev: WorldEvent[] = [];
  for (let k = 0; k < 3; k++) {
    c.move.x = -106; c.move.z = -80.8; c.state = "search"; c.stateT = 0;
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    run(w, "a", 0.7, {}, ev);
  }
  assert.ok(ev.filter((e) => e.t === "npcHit").length === 3, "3 hits");
  assert.ok(p.notoriety >= h0 + 30, `heat ${h0} -> ${p.notoriety.toFixed(0)}`);
  assert.ok(ev.some((e) => e.t === "npcKo" && e.npc === c.id));
  assert.ok([...w.items.values()].some((i) => i.type === "donut"));
});

test("3 stars: the cop car stays on the roads, pulls up, drops off a cop; running you over = busted", () => {
  const { w, p } = quiet(4);
  p.notoriety = 100;
  const ev: WorldEvent[] = [];
  let offRoad = 0;
  run(w, "a", 25, {}, ev, () => {
    p.notoriety = 100; // keep them coming
    for (const c of w.police.cars) if (c.mode === "drive" && !w.arena.roads!.some((r) => inRect(r, c.x, c.z, 1))) offRoad++;
  });
  assert.equal(offRoad, 0, "cop car stayed on the roads");
  assert.ok(ev.some((e) => e.t === "copCar" && e.stage === "deploy"), "deployed");
  // run-over test: stand in the road in front of a moving cop car
  // (a car pulls over before reaching the bandit it's after, so: a wanted bandit standing in
  // the road in front of a car that's chasing somebody else further on)
  const { w: w2, p: p2 } = quiet(6);
  const other = w2.addPlayer("b", "B");
  w2.movePlayer(other, 30, -30, 0);
  other.notoriety = 95; p2.notoriety = 40;
  w2.movePlayer(p2, 0, -30, 0);
  w2.police.cars.push({ id: "copX", x: -20, z: -30, yaw: Math.PI / 2, v: 15, target: "b", mode: "drive", route: [{ x: 30, z: -30 }], replanT: 9, calmT: 0, lifeT: 0, deployed: false });
  const ev2: WorldEvent[] = [];
  run(w2, "a", 2, {}, ev2);
  const b = ev2.find((e) => e.t === "busted") as Extract<WorldEvent, { t: "busted" }>;
  assert.ok(b && b.car, "rammed = busted");
});

test("traffic stops for a cop car (sirens have right of way)", () => {
  const { w } = quiet();
  const car = w.traffic.cars.find((c) => Math.abs(Math.sin(2 * c.yaw)) < 0.01 && Math.abs(c.x) < 60 && Math.abs(c.z) < 60)!; // on a straight
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  w.police.cars.push({ id: "copY", x: car.x + fx * 6, z: car.z + fz * 6, yaw: car.yaw, v: 0, target: "", mode: "parked", route: [], replanT: 9, calmT: -999, lifeT: 0, deployed: true });
  const s0 = car.s;
  for (let i = 0; i < 60 * 2; i++) { w.tick(); w.takeEvents(); w.police.cars[0].calmT = -999; w.police.cars[0].mode = "parked"; }
  assert.ok(Math.abs(car.s - s0) < 4, `traffic car moved ${(car.s - s0).toFixed(1)} m`);
});

test("new round: all cops and cars gone, everyone out of jail", () => {
  const { w, p } = quiet();
  p.notoriety = 100;
  run(w, "a", 4);
  assert.ok(w.police.cops().length > 0);
  w.police.bust(p, "x", false);
  w.resetCity();
  assert.equal(w.police.cops().length, 0);
  assert.equal(w.police.cars.length, 0);
  assert.equal(p.jailT, 0);
  assert.equal(p.lock, null);
});

test("a laggy client (its lock clock far behind the server's) can still pick the lock", () => {
  const { w, p } = quiet();
  w.police.bust(p, "test", false);
  p.jailT = 120; // plenty of time
  run(w, "a", 20); // the server's lock clock is now ~20 s in; the client's lags ~15 s behind
  const presses = perfectPresses(p.lockSeed, 5);
  const ev: WorldEvent[] = [];
  for (const pr of presses) { w.action("a", { a: "pick", pin: pr.pin, t: pr.t }); run(w, "a", 0.05, {}, ev); }
  const r = ev.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && r.breakout, "the server accepted the presses (no tension/noise timeouts on the server's clock)");
});

// ---------------------------------------------------------------- Phase 5A: night + tasers
function nightfall(w: World) { w.match.phase = "night"; w.match.timeLeft = 999; }

test("night: twice the cops per star (2/4/6) and a cop car from 2 stars", () => {
  for (const [heat, cops, cars] of [[35, 2, 0], [65, 4, 1]]) {
    const { w, p } = quiet();
    nightfall(w);
    p.notoriety = heat;
    const ev: WorldEvent[] = [];
    run(w, "a", 10, {}, ev, () => { if (p.jailT <= 0) p.notoriety = heat; });
    const n = ev.filter((e) => e.t === "copSpawn").length;
    assert.ok(n >= cops && n <= cops + cars, `${heat} heat at night: ${n} cops (+1 may hop out of the car)`);
    assert.equal(ev.filter((e) => e.t === "copCar" && e.stage === "dispatch").length, cars, `${heat} heat at night: cars`);
  }
});

test("taser at 3 stars: the cop aims (warning), hits = stunned + drops what's in your hands, then cuffed", () => {
  const { w, p } = quiet();
  const tv = w.placeItem("crt_tv", -106, 0.3, -81);
  run(w, "a", 0.5);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  p.notoriety = 95;
  w.police.spawnCop(p, { x: -106, z: -77.5 }, true);
  const ev: WorldEvent[] = [];
  run(w, "a", 1.2, {}, ev, () => { p.notoriety = 95; });
  assert.ok(ev.some((e) => e.t === "taser" && e.stage === "aim"), "aims first (telegraphed)");
  assert.ok(ev.some((e) => e.t === "taser" && e.stage === "hit"), "zap");
  assert.ok(p.move.stunT > 0, "stunned");
  assert.equal(p.hand, "", "dropped the TV");
  run(w, "a", 3, {}, ev, () => { if (p.jailT <= 0) p.notoriety = 95; });
  assert.ok(ev.some((e) => e.t === "busted"), "the cop reached you and cuffed you");
});

test("taser: dodging while he fires makes it miss", () => {
  const { w, p } = quiet();
  p.notoriety = 95;
  const c = w.police.spawnCop(p, { x: -106, z: -77.5 }, true)!;
  const ev: WorldEvent[] = [];
  let dodged = false;
  for (let i = 0; i < 60 * 1.5 && !ev.some((e) => e.t === "taser" && e.stage !== "aim"); i++) {
    const dodge = c.state === "aim" && c.stateT < 0.12;
    w.pushInputs("a", [inp(p.lastSeq + 1, { dodge, mx: dodge ? 1 : 0 })]); w.tick(); ev.push(...w.takeEvents());
    if (dodge && p.move.dodgeT > 0) dodged = true;
    p.notoriety = 95;
  }
  assert.ok(dodged);
  assert.ok(ev.some((e) => e.t === "taser" && e.stage === "miss"), "missed");
  assert.equal(p.move.stunT, 0);
});

test("C3 park bushes: crouch in a bush and the cops can't see you (standing up, or crouching in the open, they can)", () => {
  const { w, p } = quiet();
  const bush = w.arena.bushes![0];
  const bx = (bush.minX + bush.maxX) / 2, bz = (bush.minZ + bush.maxZ) / 2;
  w.movePlayer(p, bx, bz, 0);
  p.notoriety = 40;
  // the cop 10 m away across the open lawn, towards the fountain
  const d = Math.hypot(bx, bz), ux = -bx / d, uz = -bz / d;
  const c = w.police.spawnCop(p, { x: bx + ux * 10, z: bz + uz * 10 })!;
  c.move.x = bx + ux * 10; c.move.z = bz + uz * 10;
  p.move.crouching = true;
  assert.equal(w.police.canSee(c, p), false, "crouched in the bush");
  p.move.crouching = false;
  assert.equal(w.police.canSee(c, p), true, "standing up in the bush");
  w.movePlayer(p, bx + ux * 4, bz + uz * 4, 0);
  p.move.crouching = true;
  assert.equal(w.police.canSee(c, p), true, "crouching on the open lawn");
  // right next to the bush the cop can hear you
  w.movePlayer(p, bx, bz, 0); p.move.crouching = true;
  c.move.x = bx + ux * 1.5; c.move.z = bz + uz * 1.5;
  assert.equal(w.police.canSee(c, p), true, "a cop close enough to hear you finds you");
});

// ============================================================================ C5c.1 citizen's arrest
function twoBandits(seed = 8) {
  const w = new World({ seed, npcs: 0, spawnLoot: false });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  w.movePlayer(a, -106, -82, 0); w.movePlayer(b, -106, -80.8, Math.PI);
  return { w, a, b };
}
function runBoth(w: World, seconds: number, ev?: WorldEvent[], pb: Partial<MoveInput> = {}) {
  const a = w.players.get("a")!, b = w.players.get("b")!;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.pushInputs("a", [inp(a.lastSeq + 1)]); w.pushInputs("b", [inp(b.lastSeq + 1, pb)]); w.tick();
    const e = w.takeEvents(); if (ev) ev.push(...e);
  }
}

test("C5c.1 citizen's arrest: pin a knocked-down wanted bandit, a cop comes and cuffs them, you get heat x $5 (out of their loot, then their cash)", () => {
  const { w, a, b } = twoBandits();
  const watch = w.placeItem("rolecks_watch", b.move.x, 0.2, b.move.z + 0.4);
  runBoth(w, 0.4);
  w.action("b", { a: "grab", item: watch }); runBoth(w, 0.4);
  assert.ok(b.pockets.includes(watch) || b.hand === watch, "B has a watch");
  b.cash = 30;
  w.addHeat(b, 44);
  b.move.knockT = 2.5; // (flattened: punched out)
  w.takeEvents();
  w.action("a", { a: "arrest", p: "b" });
  const ev: WorldEvent[] = [...w.takeEvents()];
  assert.ok(ev.some((e) => e.t === "pin" && e.target === "b"), "pinned");
  runBoth(w, 60, ev);
  const bust = ev.find((e) => e.t === "busted" && e.p === "b") as Extract<WorldEvent, { t: "busted" }>;
  assert.ok(bust, "a cop came and cuffed B while A held them down");
  assert.ok(!ev.some((e) => e.t === "pinEnd"), "B never got up");
  const bounty = ev.find((e) => e.t === "bounty") as Extract<WorldEvent, { t: "bounty" }>;
  assert.ok(bounty && bounty.p === "a" && bounty.target === "b", "bounty paid");
  assert.equal(bounty.want, Math.round(44 * ARREST.perHeat));
  assert.equal(bounty.value, Math.min(bounty.want, bust.value + 30), `paid out of the seized watch ($${bust.value}) then B's $30`);
  assert.equal(a.cash, bounty.value);
  assert.equal(b.cash, 30 - Math.max(0, bounty.value - bust.value));
  assert.equal(a.pin, null);
  assert.equal(a.jailT, 0, "A (clean) isn't in any trouble"); // (B was cuffed: see the busted event)
});

test("C5c.1 citizen's arrest: only a knocked-down bandit with a star, close by; they can wriggle free (mash SPACE), moving or getting hit lets go", () => {
  const { w, a, b } = twoBandits();
  runBoth(w, 0.3); w.takeEvents();
  const fail = () => (w.takeEvents().find((e) => e.t === "pinFail") as any)?.reason;
  b.notoriety = 10; b.move.knockT = 3;
  w.action("a", { a: "arrest", p: "b" }); assert.equal(fail(), "clean", "no star: not wanted");
  b.notoriety = 40; b.move.knockT = 0;
  w.action("a", { a: "arrest", p: "b" }); assert.equal(fail(), "standing", "knock them down first");
  b.move.knockT = 3; w.movePlayer(a, -106, -86, 0);
  w.action("a", { a: "arrest", p: "b" }); assert.equal(fail(), "far");
  // wriggle free: 14 presses
  w.movePlayer(a, -106, -82, 0); b.move.knockT = 3;
  w.action("a", { a: "arrest", p: "b" });
  assert.ok(a.pin);
  const ev: WorldEvent[] = [];
  for (let i = 0; i < ARREST.breakFree; i++) { w.action("b", { a: "struggle" }); runBoth(w, 0.1, ev); }
  runBoth(w, 0.1, ev);
  assert.ok(ev.some((e) => e.t === "pinEnd" && e.why === "free"), "B wriggled free");
  assert.equal(a.pin, null);
  // moving away lets go
  runBoth(w, 2); b.move.knockT = 3; b.notoriety = 40; w.movePlayer(a, b.move.x, b.move.z - 1.2, 0); runBoth(w, 0.2); w.takeEvents();
  w.action("a", { a: "arrest", p: "b" }); assert.ok(a.pin, "pinned again");
  const ev2: WorldEvent[] = [];
  for (let i = 0; i < 90 && a.pin; i++) { w.pushInputs("a", [inp(a.lastSeq + 1, { mz: 1, sprint: true, yaw: Math.PI })]); w.tick(); ev2.push(...w.takeEvents()); }
  assert.ok(ev2.some((e) => e.t === "pinEnd" && e.why === "moved"), "walked off: let go");
  // a friend knocks the pinner down: rescued
  runBoth(w, 0.5); b.move.knockT = 3; b.notoriety = 40; w.movePlayer(a, b.move.x, b.move.z - 1.2, 0); runBoth(w, 0.2); w.takeEvents();
  w.action("a", { a: "arrest", p: "b" }); assert.ok(a.pin);
  a.move.knockT = 1.5; const ev3: WorldEvent[] = []; runBoth(w, 0.1, ev3);
  assert.ok(ev3.some((e) => e.t === "pinEnd" && e.why === "rescued"));
});
