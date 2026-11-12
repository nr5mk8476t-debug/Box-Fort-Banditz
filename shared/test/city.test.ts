import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inRect, onRoadAt, CAR_COUNT, fortAt, nearBoxes, PROP_RADIUS, ROB_TIME, WIPEOUT_TIME, CAR_HALF_LEN, UNIT, makeMoveState, stepMovement,
  type WorldEvent, type MoveInput, type PropDef, type UnitDef,
} from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function run(w: World, seconds: number, ev?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const p of w.players.values()) w.pushInputs(p.id, [inp(p.lastSeq + 1, { yaw: p.move.yaw })]);
    w.tick();
    const e = w.takeEvents();
    if (ev) ev.push(...e);
  }
}
function world() {
  const w = new World({ seed: 5 });
  const p = w.addPlayer("a", "Bandit");
  return { w, p };
}
/** Stand in front of a prop, facing it. */
function faceProp(w: World, id: string, d: PropDef, gap = 1.0) {
  const r = PROP_RADIUS[d.kind];
  const x = d.x + Math.sin(d.yaw) * (r + gap), z = d.z + Math.cos(d.yaw) * (r + gap);
  w.debugTeleport(id, x, z, d.yaw + Math.PI);
}
const propsOf = (w: World, kind: string) => (w.arena.props ?? []).filter((p) => p.kind === kind);
const count = (w: World, type: string) => [...w.items.values()].filter((i) => i.type === type).length;

test("city (Slice 2A, C1 layout): ~230 m, towers, 14 shops with cashiers (C4b: the laundromat has none), roads with crosswalks, every kind of loot source", () => {
  const c = buildTrashington();
  assert.equal(c.halfSize, 115);
  const towers = c.boxes.filter((b) => b.kind === "tower");
  assert.ok(towers.length >= 20, `mostly towers (${towers.length})`);
  assert.ok(Math.max(...towers.map((b) => b.y + b.h / 2)) >= 50, "some are really tall");
  assert.equal(c.shops!.length, 15); // (C5c.3: + PAWN-O-RAMA)
  assert.equal(c.units!.length, 19); // (C5c.3: THE SWEATBOX's shutter is now THE COMPACTOR, its own landmark)
  assert.equal(c.units!.filter((u) => u.use === "closed").length, 2, "the cheque cashers and CLUB SUB-PAR: closed until their slices (C5c.3: the bar's shutter is PAWN-O-RAMA, THE SWEATBOX is THE COMPACTOR)");
  for (const sh of c.shops!) {
    assert.ok(inRect(sh.rect, sh.cashier.x, sh.cashier.z), `${sh.name}: cashier inside`);
    const n = c.lootSpawns!.filter((s) => s.shop === sh.id && inRect(sh.rect, s.x, s.z, 1)).length;
    assert.ok(n >= (sh.type === "taco" ? 2 : 4), `${sh.name}: shelf spots (${n})`);
  }
  for (const k of ["dumpster", "bin", "phone", "vending", "meter", "newsbox", "car", "till"]) assert.ok(c.props!.some((p) => p.kind === k), k);
  // nothing that should be on foot sits in a road; props and loot are reachable
  const onRoad = (x: number, z: number) => onRoadAt(c, x, z);
  for (const s of c.lootSpawns!) assert.ok(!onRoad(s.x, s.z), `loot spawn on a road at ${s.x},${s.z}`);
  for (const f of c.forts!) assert.ok(!onRoad(f.padX, f.padZ) && fortAt(c, f.padX, f.padZ) === f.slot);
  for (const p of c.props!) if (p.kind !== "car") assert.ok(!onRoad(p.x, p.z), `${p.id} in the road`);
  for (const cw of c.crosswalks!) assert.ok(onRoad((cw.minX + cw.maxX) / 2, (cw.minZ + cw.maxZ) / 2), "crosswalks are on roads");
  // (C1: traffic lanes are checked in layout.test.ts)
  // the landmarks tests rely on are open ground
  const solid = c.boxes.filter((b) => b.y + b.h / 2 > 0.4);
  for (const [name, lm] of Object.entries(c.landmarks!)) {
    const y0 = (lm as { y?: number }).y ?? 0; // (C5a: the squat's spot is on its roof)
    assert.ok(!solid.some((b) => Math.abs(lm.x - b.x) < b.w / 2 + 0.4 && Math.abs(lm.z - b.z) < b.d / 2 + 0.4 && b.y + b.h / 2 > y0 + 0.4 && b.y - b.h / 2 < y0 + 1.8), `landmark ${name} is clear`);
  }
});

test("dumpsters and bins: search with E for random junk, then they're empty until they refill", () => {
  const { w, p } = world();
  const d = propsOf(w, "dumpster")[0];
  faceProp(w, "a", d);
  const before = w.items.size;
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: d.id });
  run(w, 0.2, ev);
  const found = ev.find((e) => e.t === "search");
  assert.ok(found && found.t === "search" && found.found >= 2, "2-3 items");
  assert.ok(w.items.size >= before + 2);
  p.actionCd = 0;
  w.action("a", { a: "use", prop: d.id });
  run(w, 0.1, ev);
  assert.ok(ev.some((e) => e.t === "empty" && e.prop === d.id), "already searched");
  run(w, 51);
  assert.ok(w.props.props.get(d.id)!.ready, "refilled");
  // too far away = nothing
  w.debugTeleport("a", d.x + 8, d.z, 0);
  const n = w.items.size;
  w.action("a", { a: "use", prop: d.id });
  assert.equal(w.items.size, n);
});

test("smash-and-grab: phone booth -> handset, vending -> snacks, meter -> change, newsbox -> paper; heat goes up (C4a: when someone sees it)", () => {
  for (const [kind, type] of [["phone", "phone_handset"], ["vending", ""], ["meter", "coin_pile"], ["newsbox", "newspaper"]] as const) {
    const { w, p } = world();
    const d = propsOf(w, kind)[0];
    faceProp(w, "a", d, 0.7);
    const watcher = w.npc.spawn("tourist")!; // (C4a: breaking things only adds heat if somebody sees)
    watcher.move = makeMoveState(p.move.x - Math.sin(p.move.yaw) * 2, p.move.z - Math.cos(p.move.yaw) * 2, 0);
    const before = new Set(w.items.keys());
    w.action("a", { a: "punch", yaw: p.move.yaw, pitch: 0 });
    const got = [...w.items.values()].filter((i) => !before.has(i.id));
    assert.ok(got.length >= 1, `${kind}: something popped out`);
    if (type) assert.ok(got.some((i) => i.type === type), `${kind}: ${type} (got ${got.map((i) => i.type)})`);
    else assert.ok(got.some((i) => ["candy_bar", "soda_can", "energy_drink"].includes(i.type)), "snacks");
    assert.ok(p.notoriety > 0, "heat");
    assert.equal(w.props.props.get(d.id)!.ready, false, "broken for a while");
  }
});

test("parked cars: punch the window for what's on the seat, and the alarm goes off", () => {
  const { w, p } = world();
  const car = propsOf(w, "car")[0];
  // stand beside the driver's door
  const sx = Math.cos(car.yaw), sz = -Math.sin(car.yaw);
  w.debugTeleport("a", car.x + sx * 2.0, car.z + sz * 2.0, Math.atan2(-sx, -sz));
  const ev: WorldEvent[] = [];
  const before = w.items.size;
  w.action("a", { a: "punch", yaw: p.move.yaw, pitch: 0 });
  run(w, 0.1, ev);
  assert.ok(w.items.size > before, "loot from the seat");
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "car"), "car alarm");
  assert.ok(w.props.stateOf(car.id).alarm);
});

test("hold-up: hold E at the till for 3 s -> a bundle of cash, the cashier cowers, alarm + heat", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[0];
  faceProp(w, "a", till, 1.0);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.5, ev);
  assert.ok(ev.some((e) => e.t === "robStart"));
  const cashier = w.npc.cashierOf(till.shop!)!;
  assert.equal(cashier.state, "cower", "hands up!");
  run(w, ROB_TIME, ev);
  const done = ev.find((e) => e.t === "robDone");
  assert.ok(done, "robbed");
  assert.ok(count(w, "cash_bundle") >= 1);
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "shop"));
  assert.ok(p.notoriety >= 18, `heat ${p.notoriety}`); // (heat cools a little every second)
  // the till is empty for a while
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.1, ev);
  assert.ok(ev.some((e) => e.t === "empty" && e.prop === till.id));
});

test("hold-up gets cancelled if you walk away or let go", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[1];
  faceProp(w, "a", till, 1.0);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: till.id });
  run(w, 1, ev);
  w.action("a", { a: "robStop" });
  run(w, 3, ev);
  assert.ok(ev.some((e) => e.t === "robCancel") && !ev.some((e) => e.t === "robDone"), "let go of E");
  p.actionCd = 0;
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.5, ev);
  w.debugTeleport("a", p.move.x + Math.sin(till.yaw) * 3, p.move.z + Math.cos(till.yaw) * 3, 0);
  run(w, 3, ev);
  assert.ok(!ev.some((e) => e.t === "robDone"), "walked away");
});

test("go loud: grab the whole cash register (alarm, big heat); shelf items make the cashier yell", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[2];
  const reg = [...w.items.values()].find((i) => i.type === "cash_register" && Math.hypot(i.body.x - till.x, i.body.z - till.z) < 1)!;
  assert.ok(reg, "a register sits on every counter");
  faceProp(w, "a", till, 0.9);
  const ev: WorldEvent[] = [];
  run(w, 0.3);
  w.action("a", { a: "grab", item: reg.id });
  run(w, 0.1, ev);
  assert.equal(p.hand, reg.id, "carrying the till");
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "shop"));
  assert.ok(p.notoriety >= 24, `heat ${p.notoriety}`);
  // shoplifting
  const q = world();
  q.w.stockShops(true); q.w.stockShops(true); q.w.stockShops(true); // (Slice 2A: shelves start ~40% stocked)
  const shelfItem = [...q.w.items.values()].find((i) => i.shop >= 0 && q.w.arena.shops![i.shop].type !== "taco" && i.type !== "cash_register" && i.body.y < 0.6)!;
  assert.ok(shelfItem, "stock on the shelves");
  q.w.debugTeleport("a", shelfItem.body.x + 0.3, shelfItem.body.z + 0.3, 0);
  q.p.move.yaw = Math.atan2(shelfItem.body.x - q.p.move.x, shelfItem.body.z - q.p.move.z);
  const ev2: WorldEvent[] = [];
  q.w.action("a", { a: "grab", item: shelfItem.id });
  run(q.w, 0.1, ev2);
  assert.ok(q.p.hand === shelfItem.id || q.p.pockets.includes(shelfItem.id), "swiped it");
  assert.ok(ev2.some((e) => e.t === "shoplift"), "cashier saw that");
  assert.ok(q.p.notoriety >= 7.9, `heat ${q.p.notoriety}`);
});

test("punching the cashier: cash drops once, they cower, shop alarm", () => {
  const { w, p } = world();
  const shop = w.arena.shops![3];
  const c = w.npc.cashierOf(shop.id)!;
  w.debugTeleport("a", c.move.x - Math.sin(c.move.yaw) * -1.2, c.move.z - Math.cos(c.move.yaw) * -1.2, 0);
  // stand right next to the cashier, facing them (behind the counter is fine for this rule test)
  w.debugTeleport("a", c.move.x + 1.0, c.move.z, -Math.PI / 2);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "punch", yaw: -Math.PI / 2, pitch: 0 });
  run(w, 0.2, ev);
  assert.ok(ev.some((e) => e.t === "npcHit" && e.npc === c.id));
  assert.equal(c.state, "cower");
  assert.ok(count(w, "cash_bundle") >= 1);
  assert.ok(ev.some((e) => e.t === "alarm"));
  assert.ok(p.notoriety >= 19, `heat ${p.notoriety}`);
});

test("traffic: cars drive their lanes, keep their distance, and stop for pedestrians", () => {
  const w = new World({ seed: 2, spawnLoot: false });
  assert.equal(w.traffic.cars.length, CAR_COUNT); // (C1: 22 cars on the new road network)
  const start = w.traffic.cars.map((c) => ({ x: c.x, z: c.z }));
  let minGap = 99;
  for (let i = 0; i < 60 * 30; i++) {
    w.tick(); w.takeEvents();
    if (i % 10) continue;
    for (const a of w.traffic.cars) for (const b of w.traffic.cars) if (a !== b && a.lane === b.lane) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
    for (const c of w.traffic.cars) assert.ok(onRoadAt(w.arena, c.x, c.z, 0.5), `car ${c.id} left the road at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
  }
  assert.ok(w.traffic.cars.filter((c, i) => Math.hypot(c.x - start[i].x, c.z - start[i].z) > 1).length >= CAR_COUNT - 2, "they move");
  assert.ok(minGap > CAR_HALF_LEN * 2, `no pile-ups (closest ${minGap.toFixed(1)} m)`);
  // a pedestrian standing in the lane ahead: the car stops before reaching them
  // (a car moving along a road with 22+ m of straight lane still ahead of it)
  const ahead = (c: typeof w.traffic.cars[0]) => { const l = w.traffic.lanes[c.lane]; return !l.conn && l.len - c.s > 22 && c.v > 4; };
  let car = w.traffic.cars.find(ahead);
  for (let i = 0; i < 60 * 20 && !car; i++) { w.tick(); w.takeEvents(); car = w.traffic.cars.find(ahead); }
  assert.ok(car, "a car on a straight");
  const px = car!.x + Math.sin(car!.yaw) * 14, pz = car!.z + Math.cos(car!.yaw) * 14;
  const ped = w.npc.place("tourist", px, pz, 0);
  for (let i = 0; i < 60 * 5; i++) { ped.move.x = px; ped.move.z = pz; ped.state = "idle"; ped.stateT = 999; w.tick(); w.takeEvents(); }
  assert.ok(Math.hypot(car!.x - px, car!.z - pz) > CAR_HALF_LEN + 0.3, "didn't hit them");
  assert.ok(car!.v < 0.5, `stopped for the pedestrian (v=${car!.v.toFixed(2)})`);
});

test("D1 hit by a car: launched up and along, your loot scatters, 10 s flat from the moment you land (no moving or punching), then up where you landed with 3 s grace from traffic", () => {
  const { w, p } = world();
  // hold something and pocket something, then stand in the lane in front of a moving car
  const tv = w.placeItem("crt_tv", p.move.x, 1, p.move.z + 1);
  run(w, 0.3);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  const ev: WorldEvent[] = [];
  let hit = false, hitAt = { x: 0, z: 0 };
  for (let k = 0; k < w.traffic.cars.length && !hit; k++) {
    const c = w.traffic.cars[(7 + k) % w.traffic.cars.length];
    w.debugTeleport("a", c.x + Math.sin(c.yaw) * 12, c.z + Math.cos(c.yaw) * 12, c.yaw + Math.PI);
    for (let i = 0; i < 150 && !hit; i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); const e = w.takeEvents(); ev.push(...e); if (e.some((x) => x.t === "wipeout" && x.p === "a")) { hit = true; hitAt = { x: p.move.x, z: p.move.z }; } }
  }
  assert.ok(hit, "hit");
  assert.equal(p.hand, "", "dropped everything");
  const t = w.items.get(tv)!;
  assert.equal(t.mode, "free", "the TV is flying across the road");
  assert.ok(Math.hypot(t.body.vx, t.body.vz) > 1 || t.body.vy > 1, "scattered, not just dropped");
  // the flight
  let peak = p.move.y, airborne = 0;
  while (!p.move.grounded && airborne < 5 * 60) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, sprint: true })]); w.tick(); w.takeEvents(); peak = Math.max(peak, p.move.y); airborne++; }
  assert.ok(peak > 1.2 && airborne > 20, `launched (peak ${peak.toFixed(1)} m, ${(airborne / 60).toFixed(2)} s in the air)`);
  const landed = { x: p.move.x, z: p.move.z };
  assert.ok(Math.hypot(landed.x - hitAt.x, landed.z - hitAt.z) > 2, "flew along the road");
  // flat for 10 s from landing: inputs do nothing, punches do nothing
  w.takeEvents();
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(!w.takeEvents().some((e) => e.t === "punch"), "can't punch while stunned");
  for (let i = 0; i < Math.round((WIPEOUT_TIME - 0.3) * 60); i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, sprint: true })]); w.tick(); ev.push(...w.takeEvents()); }
  assert.ok(p.respawnT > 0 && p.move.knockT > 0, "still flat just before the 10 s are up");
  assert.ok(Math.hypot(p.move.x - landed.x, p.move.z - landed.z) < 1.5, "couldn't crawl off (only slid to a stop)");
  const ev2: WorldEvent[] = [];
  for (let i = 0; i < 40; i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); ev2.push(...w.takeEvents()); }
  assert.ok(ev2.some((e) => e.t === "respawn" && e.p === "a"), "up again");
  assert.equal(p.move.knockT, 0);
  assert.ok(Math.hypot(p.move.x - landed.x, p.move.z - landed.z) < 1.5, "right where you landed (not teleported home)");
  assert.ok(p.splatGrace > w.time, "a few seconds' grace");
  // grace: a car driving straight through you doesn't hit you again
  const c = w.traffic.cars[0];
  c.x = p.move.x - Math.sin(c.yaw) * 1.0; c.z = p.move.z - Math.cos(c.yaw) * 1.0; c.v = 8;
  const ev3: WorldEvent[] = [];
  for (let i = 0; i < 20; i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); ev3.push(...w.takeEvents()); }
  assert.ok(!ev3.some((e) => e.t === "wipeout"), "not chained by the next car");
  // movement works again
  const x0 = p.move.x, z0 = p.move.z;
  run(w, 0.5);
  for (let i = 0; i < 30; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1 })]); w.tick(); }
  assert.ok(Math.hypot(p.move.x - x0, p.move.z - z0) > 0.5, "walking again");
});

test("cars honk at bandits in the road (they won't stop for you!)", () => {
  const { w } = world();
  const car = w.traffic.cars[0];
  const ev: WorldEvent[] = [];
  w.debugTeleport("a", car.x + Math.sin(car.yaw) * 12, car.z + Math.cos(car.yaw) * 12, 0);
  run(w, 0.3, ev);
  assert.ok(ev.some((e) => e.t === "honk"));
});

test("collision broadphase: near-box lookup never misses a box and keeps the original order", () => {
  const c = buildTrashington();
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2000; k++) {
    const x = (r() - 0.5) * 210, z = (r() - 0.5) * 210, rad = r() * 5;
    const near = nearBoxes(c, x, z, rad);
    const idx = near.map((b) => c.boxes.indexOf(b));
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], "original order");
    for (const b of c.boxes) {
      const touches = Math.abs(b.x - x) <= b.w / 2 + rad && Math.abs(b.z - z) <= b.d / 2 + rad;
      if (touches) assert.ok(near.includes(b), `missed ${b.kind} at ${b.x},${b.z} for ${x.toFixed(1)},${z.toFixed(1)} r${rad.toFixed(1)}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Slice 2A: walk-in shops, upstairs, the pond

/** Local (u across, v in) -> world, for a building plot. */
function unitP(u: UnitDef) {
  const [nx, nz] = u.out, rx = -nz, rz = nx;
  return (a: number, v: number) => ({ x: u.doorX + rx * a - nx * v, z: u.doorZ + rz * a - nz * v });
}
/** Walk a player from one point toward another (plain movement rules), return where they end up. */
function walk(arena: ReturnType<typeof buildTrashington>, from: { x: number; z: number }, to: { x: number; z: number }, seconds: number, y = 0.2) {
  let s = makeMoveState(from.x, from.z, 0);
  s.y = y;
  for (let i = 0; i < seconds * 60; i++) {
    const dx = to.x - s.x, dz = to.z - s.z, d = Math.hypot(dx, dz);
    s = stepMovement(s, inp(i + 1, { yaw: d > 0.01 ? Math.atan2(dx, dz) : s.yaw, mz: d > 0.25 ? 1 : 0 }), arena);
  }
  return s;
}

test("2A: every shop and lobby can be walked into from the street, and out the back door", () => {
  const c = buildTrashington();
  for (const u of c.units!) {
    if (u.use === "closed") continue;
    const P = unitP(u);
    const s = walk(c, P(0, -2.5), P(0, 6), 3);
    assert.ok(inRect(u.rect, s.x, s.z) && Math.hypot(s.x - P(0, 6).x, s.z - P(0, 6).z) < 0.8, `${u.name}: walked in (ended at ${s.x.toFixed(1)},${s.z.toFixed(1)})`);
    // back door: a clear line from the aisle to the door on the right, then out
    const a = walk(c, P(0, 6), P(0, 10.8), 2);
    const b = walk(c, { x: a.x, z: a.z }, P(UNIT.w / 2 - 2.6, 10.8), 3);
    const out = walk(c, { x: b.x, z: b.z }, P(UNIT.w / 2 - 2.6, 15), 3);
    const [bx, bz] = [P(UNIT.w / 2 - 2.6, 14).x, P(UNIT.w / 2 - 2.6, 14).z];
    assert.ok(!inRect(u.rect, out.x, out.z) && Math.hypot(out.x - bx, out.z - bz) < 1.5, `${u.name}: out the back door (ended at ${out.x.toFixed(1)},${out.z.toFixed(1)})`);
  }
});

test("2A: every upstairs can be reached: inside stairs climb to the floor above, fire escapes lead to the back door", () => {
  const c = buildTrashington();
  const ups = c.units!.filter((u) => u.upper);
  assert.equal(ups.length, 10, "stockrooms (3: C1 gave Cracked Screens one), offices, apartments (5: C4b the old lady above the laundromat; C5c.3 Sal's flat over PAWN-O-RAMA), the gym");
  for (const u of ups) {
    const P = unitP(u);
    const hw = UNIT.w / 2, run = UNIT.stepRun * UNIT.steps;
    let top;
    if (u.access === "inside") {
      const bandV = UNIT.d - 0.4 - 0.75, bot = -hw + 0.4 + run;
      // (Pixel Palace / Bling Thing: through the back room door first)
      const a = walk(c, P(0, 6), P(0, 7.5), 2), b = walk(c, { x: a.x, z: a.z }, P(5, 8.6), 3);
      const d = walk(c, { x: b.x, z: b.z }, P(5, 10.3), 2);
      const start = walk(c, { x: d.x, z: d.z }, P(bot + 1.2, bandV), 3);
      top = walk(c, { x: start.x, z: start.z }, P(-hw + 0.9, bandV), 5, start.y);
      assert.ok(top.y > UNIT.upper - 0.1, `${u.name}: climbed the stairs (y ${top.y.toFixed(2)})`);
      // step off the top onto the upstairs floor (toward the front)
      const off = walk(c, { x: top.x, z: top.z }, P(-hw + 0.9, 3), 2, top.y);
      assert.ok(off.y > UNIT.upper - 0.1 && Math.hypot(off.x - P(-hw + 0.9, 3).x, off.z - P(-hw + 0.9, 3).z) < 1, `${u.name}: upstairs (y ${off.y.toFixed(2)})`);
    } else {
      const fb = hw - 7.0;
      const start = walk(c, P(fb + 2, UNIT.d + 3), P(fb + 1.2, UNIT.d + 0.7), 2);
      top = walk(c, { x: start.x, z: start.z }, P(-hw + 0.9, UNIT.d + 0.7), 5, start.y);
      assert.ok(top.y > UNIT.upper - 0.1, `${u.name}: up the fire escape (y ${top.y.toFixed(2)})`);
      const inside = walk(c, { x: top.x, z: top.z }, P(-hw + 1.0, 8), 3, top.y);
      assert.ok(inside.y > UNIT.upper - 0.1 && inRect(u.rect, inside.x, inside.z), `${u.name}: through the upstairs back door (at ${inside.x.toFixed(1)},${inside.y.toFixed(1)},${inside.z.toFixed(1)})`);
    }
  }
});

test("2A: loot is mostly indoors (shops + upstairs), and there's loot upstairs", () => {
  let vin = 0, vout = 0, up = 0;
  for (const seed of [1, 2, 3]) {
    const w = new World({ seed, npcs: 0 });
    const c = w.arena;
    const indoor = (x: number, z: number) => c.units!.some((u) => inRect(u.rect, x, z)) || c.shops!.some((s) => inRect(s.rect, x, z, 1.5)) || (!!c.bank && inRect(c.bank.rect, x, z)); // (C5c: the bank)
    for (const it of w.items.values()) {
      if (indoor(it.body.x, it.body.z)) vin += it.value; else vout += it.value;
      if (it.body.y > UNIT.upper) up++;
    }
  }
  const share = vin / (vin + vout);
  assert.ok(share >= 0.7, `indoor share ${share.toFixed(2)}`);
  assert.ok(up >= 6, `items upstairs: ${up}`);
});

test("2A: shoplifting only counts on the shop floor (not from the stockroom upstairs)", () => {
  const { w, p } = world();
  const u = w.arena.units!.find((x) => x.name === "BLING THING")!;
  const shop = w.arena.shops![u.shop!];
  const P = unitP(u);
  const at = P(0, 5);
  const it = w.placeItem("mixtape", at.x, UNIT.upper + 0.1, at.z);
  w.items.get(it)!.shop = shop.id;
  run(w, 1);
  w.debugTeleport("a", at.x + 0.4, at.z, 0);
  p.move.y = UNIT.upper; p.move.grounded = true;
  const ev: WorldEvent[] = [];
  p.move.yaw = Math.atan2(at.x - p.move.x, at.z - p.move.z);
  w.action("a", { a: "grab", item: it });
  run(w, 0.1, ev);
  assert.ok(p.hand === it || p.pockets.includes(it), "grabbed it");
  assert.ok(!ev.some((e) => e.t === "shoplift"), "the cashier downstairs can't see you");
});

test("2A: the pond: you wade through it slowly, pedestrians walk round it", () => {
  const c = buildTrashington();
  const pond = c.water!.find((r) => inRect(r, 10, -1.75))!; // (C3: the widest strip of the pear-shaped pond)
  const cz = (pond.minZ + pond.maxZ) / 2;
  const land = walk(c, { x: -14, z: -14 }, { x: -14, z: 20 }, 1, 0.15);
  let s = makeMoveState(pond.minX + 1, cz, Math.PI / 2); s.y = 0.15;
  for (let i = 0; i < 60; i++) s = stepMovement(s, inp(i + 1, { yaw: Math.PI / 2, mz: 1 }), c);
  const wade = s.x - (pond.minX + 1);
  assert.ok(wade < Math.hypot(land.x + 14, land.z + 14) * 0.6, `wading ${wade.toFixed(2)} m/s vs ${Math.hypot(land.x + 14, land.z + 14).toFixed(2)} on land`);
  assert.ok(wade > 1, "but you can get through");
  const w = new World({ seed: 4 });
  for (let i = 0; i < 60 * 60; i++) { w.tick(); w.takeEvents(); if (i % 30) continue;
    for (const n of w.npc.npcs.values()) assert.ok(!c.water!.some((r) => inRect(r, n.move.x, n.move.z)) || n.state === "ko" || n.post, `${n.kind} walked into the water at ${n.move.x.toFixed(1)},${n.move.z.toFixed(1)}`); }
});

test("2A: pedestrians wander into shops (and back out)", () => {
  // (C4b: two 3-minute crowds: one crowd can happen to visit only 2 shops; across 8 seeds it's 2-7)
  const visited = new Set<string>();
  for (const seed of [6, 8]) {
    const w = new World({ seed });
    const units = w.arena.units!.filter((u) => u.use === "shop");
    for (let i = 0; i < 60 * 180; i++) {
      w.tick(); w.takeEvents();
      if (i % 30) continue;
      for (const n of w.npc.npcs.values()) {
        if (n.kind === "cashier") continue;
        for (const u of units) if (inRect(u.rect, n.move.x, n.move.z, -1)) visited.add(u.name);
      }
    }
  }
  assert.ok(visited.size >= 4, `pedestrians went into ${[...visited].join(", ") || "no shops"}`);
});

// =============================================================================================================
// R12.3b (Blake: "some sidewalk sections overlap or clip over one another"). The new city's pavement: the grid of
// square cells, the curved pieces round the roundabout and the cuts along the diagonals and the straight roads.
// Before: 400 overlapping pairs (427 m²): 222 at the same height (they flickered), 178 a smooth strip laid 2 cm above
// the stepped collision along the diagonals; and thin strips of nothing beside kerbs that aren't on the 0.5 m grid.
// =============================================================================================================
function groundPieces(w: World): [number, number][][] {
  const polyOf = (b: any): [number, number][] => b.poly ?? [[b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z + b.d / 2], [b.x - b.w / 2, b.z + b.d / 2]];
  return w.arena.boxes.filter((b) => (b.kind === "sidewalk" || b.kind === "plaza" || b.kind === "curb") && b.y + b.h / 2 < 0.5).map(polyOf);
}
const areaOf = (p: [number, number][]) => { let a = 0; for (let k = 0; k < p.length; k++) a += p[k][0] * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * p[k][1]; return a / 2; };
function overlapArea(A: [number, number][], B: [number, number][]) {
  let out = A; const cw = areaOf(B) < 0;
  for (let k = 0; k < B.length && out.length; k++) {
    const P = B[k], Q = B[(k + 1) % B.length], inp2 = out; out = [];
    const ins = (p: [number, number]) => { const v = (Q[0] - P[0]) * (p[1] - P[1]) - (Q[1] - P[1]) * (p[0] - P[0]); return cw ? v <= 1e-9 : v >= -1e-9; };
    for (let j = 0; j < inp2.length; j++) {
      const a = inp2[j], b = inp2[(j + 1) % inp2.length], ia = ins(a), ib = ins(b);
      if (ia) out.push(a);
      if (ia !== ib) { const dx = b[0] - a[0], dz = b[1] - a[1], ex = Q[0] - P[0], ez = Q[1] - P[1], t = (ex * (P[1] - a[1]) - ez * (P[0] - a[0])) / (ex * dz - ez * dx); out.push([a[0] + dx * t, a[1] + dz * t]); }
    }
  }
  return out.length >= 3 ? Math.abs(areaOf(out)) : 0;
}
test("R12.3b pavement: no two pieces of ground overlap anywhere in the new city (nothing coplanar to flicker, no lip, no strip on top)", () => {
  useCity("new"); const w = new World({ seed: 1, npcs: 0, spawnLoot: false }); useCity("classic");
  const P = groundPieces(w), bb = P.map((p) => [Math.min(...p.map((q) => q[0])), Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[1]))]);
  const bad: string[] = [];
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
    const A = bb[a], B = bb[b];
    if (A[1] <= B[0] || B[1] <= A[0] || A[3] <= B[2] || B[3] <= A[2]) continue;
    const ar = overlapArea(P[a], P[b]); if (ar > 0.01) bad.push(`${ar.toFixed(2)} m² at ${((A[0] + A[1]) / 2).toFixed(1)},${((A[2] + A[3]) / 2).toFixed(1)}`);
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} overlapping pairs`);
  assert.equal((w.arena.scenery ?? []).filter((d) => d.kind === "walk").length, 0, "no looks-only strips laid over the pavement: what you see is what you walk on");
});
test("R12.3b pavement: no gaps between kerb and pavement round the roundabout, along the diagonals, or beside kerbs off the 0.5 m grid", () => {
  useCity("new"); const w = new World({ seed: 1, npcs: 0, spawnLoot: false }); useCity("classic");
  const P = groundPieces(w), a: any = w.arena, net = a.roadNet;
  const G = new Map<string, [number, number][][]>();
  for (const p of P) { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); for (let gx = Math.floor(Math.min(...xs) / 4); gx <= Math.floor(Math.max(...xs) / 4); gx++) for (let gz = Math.floor(Math.min(...zs) / 4); gz <= Math.floor(Math.max(...zs) / 4); gz++) { const k = gx + "," + gz; (G.get(k) ?? G.set(k, []).get(k)!).push(p); } }
  const inPoly = (p: [number, number][], x: number, z: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
  const diag = net.edges.filter((e: any) => !e.arc && Math.abs(net.nodes[e.a].x - net.nodes[e.b].x) > 1 && Math.abs(net.nodes[e.a].z - net.nodes[e.b].z) > 1).map((e: any) => ({ ax: e.pa?.[0] ?? net.nodes[e.a].x, az: e.pa?.[1] ?? net.nodes[e.a].z, bx: e.pb?.[0] ?? net.nodes[e.b].x, bz: e.pb?.[1] ?? net.nodes[e.b].z, hw: e.hw }));
  const segD = (x: number, z: number, g: any) => { const ex = g.bx - g.ax, ez = g.bz - g.az, L2 = ex * ex + ez * ez, k = Math.max(0, Math.min(1, ((x - g.ax) * ex + (z - g.az) * ez) / L2)); return Math.hypot(g.ax + ex * k - x, g.az + ez * k - z); };
  let checked = 0; const gaps: string[] = [];
  // (the city's streets: inside the outer ring road, off the map's edge)
  for (let x = -109.87; x < 110; x += 0.25) for (let z = -92.87; z < 108; z += 0.25) {
    if (a.roads.some((q: any) => x >= q.minX && x <= q.maxX && z >= q.minZ && z <= q.maxZ) || diag.some((g: any) => segD(x, z, g) <= g.hw) || Math.hypot(x, z) <= 29.7) continue;
    const kerb = a.roads.some((q: any) => x > q.minX - 1 && x < q.maxX + 1 && z > q.minZ - 1 && z < q.maxZ + 1) || diag.some((g: any) => segD(x, z, g) < g.hw + 1) || Math.hypot(x, z) < 34;
    if (!kerb) continue;
    checked++;
    if (!(G.get(Math.floor(x / 4) + "," + Math.floor(z / 4)) ?? []).some((p) => inPoly(p, x, z))) gaps.push(`${x.toFixed(2)},${z.toFixed(2)}`);
  }
  assert.ok(checked > 20000, `${checked} points along the kerbs`);
  assert.deepEqual(gaps.slice(0, 8), [], `${gaps.length} points along a kerb with no pavement: ${gaps.slice(0, 8).join(" ")}`);
});
test("R12.3b pavement: walking along and across the joins (round the roundabout, along a diagonal, across its cuts): no snag, no step, no sinking", () => {
  useCity("new"); const w = new World({ seed: 1, npcs: 0, spawnLoot: false }); useCity("classic");
  const p = w.addPlayer("a", "A");
  const walk = (x: number, z: number, path: (t: number) => { yaw: number }, sec: number) => {
    w.debugTeleport("a", x, z, path(0).yaw, 0.2);
    for (let i = 0; i < 20; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: path(0).yaw })]); w.tick(); w.takeEvents(); }
    let minY = 9, maxY = -9, dist = 0, lx = p.move.x, lz = p.move.z;
    for (let i = 0; i < sec * 60; i++) {
      w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: path(i / 60).yaw })]); w.tick(); w.takeEvents();
      dist += Math.hypot(p.move.x - lx, p.move.z - lz); lx = p.move.x; lz = p.move.z;
      if (i > 10) { minY = Math.min(minY, p.move.y); maxY = Math.max(maxY, p.move.y); }
    }
    return { minY, maxY, dist };
  };
  // 1. round the roundabout on the join between the curved pieces and the grid (r = 33.3), a quarter turn
  // (between the diagonal leaving the ring at ~0.6 rad and the road at 1.57; held on the join, 33.2 m out)
  const R = 33.2, a0 = 0.85;
  const r1 = walk(Math.cos(a0) * R, Math.sin(a0) * R, () => { const ang = Math.atan2(p.move.z, p.move.x), k = 0.6 * (R - Math.hypot(p.move.x, p.move.z)); return { yaw: Math.atan2(-Math.sin(ang) + k * Math.cos(ang), Math.cos(ang) + k * Math.sin(ang)) }; }, 3);
  // 2. along a diagonal, 1.2 m from its kerb (where the cut pieces meet the grid)
  const net = w.arena.roadNet!, e = net.edges.find((q) => q.name === "Dodgy Cut-Through")!, A = net.nodes[e.a], B = net.nodes[e.b];
  const L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L, nx = -uz, nz = ux, off = e.hw + 1.2;
  const r2 = walk(A.x + ux * L * 0.3 + nx * off, A.z + uz * L * 0.3 + nz * off, () => ({ yaw: Math.atan2(ux, uz) }), 5); // (R12.9: 6 s walked off its end at the faster walk)
  // 3. away from that diagonal's kerb, straight across the cut pieces into the grid
  // (0.6 s: across the cut pieces into the grid, stopping short of the buildings 4 m back; against the same along the pavement)
  const r3 = walk(A.x + ux * L * 0.5 + nx * (e.hw + 0.3), A.z + uz * L * 0.5 + nz * (e.hw + 0.3), () => ({ yaw: Math.atan2(nx, nz) }), 0.6);
  const ref = walk(A.x + ux * L * 0.3 + nx * off, A.z + uz * L * 0.3 + nz * off, () => ({ yaw: Math.atan2(ux, uz) }), 0.6);
  for (const [k, r] of [["round the roundabout", r1], ["along the diagonal", r2], ["across the diagonal's cuts", r3]] as const) {
    assert.ok(r.minY > 0.13 && r.maxY < 0.17, `${k}: feet stay on the pavement's top (y ${r.minY.toFixed(3)}..${r.maxY.toFixed(3)})`);
    if (k === "across the diagonal's cuts") assert.ok(r.dist > ref.dist * 0.95, `${k}: no snag (walked ${r.dist.toFixed(2)} m, ${ref.dist.toFixed(2)} m on plain pavement)`);
    else assert.ok(r.dist > ({ "round the roundabout": 3, "along the diagonal": 5 } as Record<string, number>)[k] * 3.2, `${k}: no snag (walked ${r.dist.toFixed(1)} m)`);
  }
});
