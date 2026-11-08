import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inDeepWater, LOOT, lootDef, PLAYER, GIANT_DRAG_MUL, TUG_MAX_TIME, FISTS, ITEM_MAX,
  type MoveInput, type ArenaLayout, type Box, type WorldEvent,
} from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });

/** A flat empty world (no random loot) for precise rule tests. */
function flatWorld(): World {
  const arena: ArenaLayout = { halfSize: 40, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }, { x: 2, z: 0, yaw: 0 }, { x: -2, z: 0, yaw: 0 }, { x: 4, z: 0, yaw: 0 }], lootSpawns: [{ x: 10, y: 0, z: 10, zone: "plaza" }] };
  return new World({ arena, spawnLoot: false });
}
function settle(w: World, seconds = 1) { for (let i = 0; i < seconds * 60; i++) w.tick(); }
function drive(w: World, id: string, steps: number, p: Partial<MoveInput>) {
  const pl = w.players.get(id)!;
  let seq = pl.lastSeq + 1;
  for (let i = 0; i < steps; i++) { w.pushInputs(id, [inp(seq++, p)]); w.tick(); }
}

test("catalog: at least 12 absurd items, all three sizes, all five rarities", () => {
  assert.ok(LOOT.length >= 12, `${LOOT.length} items`);
  for (const s of ["small", "big", "giant"]) assert.ok(LOOT.some((d) => d.size === s), s);
  for (const r of ["common", "uncommon", "rare", "epic", "legendary"]) assert.ok(LOOT.some((d) => d.rarity === r), r);
  for (const d of LOOT) assert.ok(d.valueMax >= d.valueMin && d.radius > 0 && d.weight >= 0 && d.weight < 1, d.type);
});

test("city: loot spawns and player spawns are not inside walls", () => {
  const city = buildTrashington();
  const inside = (x: number, y: number, z: number, r: number, b: Box) =>
    Math.abs(x - b.x) < b.w / 2 + r - 0.05 && Math.abs(z - b.z) < b.d / 2 + r - 0.05 && y + 0.05 < b.y + b.h / 2 && y + 1.2 > b.y - b.h / 2;
  for (const sp of city.lootSpawns!) {
    for (const b of city.boxes) {
      if (b.kind === "sidewalk" || b.kind === "curb" || b.y + b.h / 2 <= 0.2) continue; // (ground)
      assert.ok(!inside(sp.x, sp.y + 0.05, sp.z, 0.3, b), `loot spawn ${sp.zone} ${sp.x},${sp.y},${sp.z} inside ${b.kind} at ${b.x},${b.z}`);
    }
  }
  for (const sp of city.spawns) for (const b of city.boxes) {
    if (b.kind === "sidewalk" || b.kind === "curb" || b.y + b.h / 2 <= 0.2) continue; // (ground)
    assert.ok(!inside(sp.x, 0, sp.z, PLAYER.radius, b), `player spawn inside ${b.kind}`);
  }
  assert.equal(city.forts!.length, 4);
  assert.ok(city.lootSpawns!.length >= 50, `${city.lootSpawns!.length} loot spawn points`);
});

test("city: every loot spawn settles to rest without leaving the world", () => {
  const w = new World({ seed: 3 });
  for (const sp of w.arena.lootSpawns!) w.placeItem("crt_tv", sp.x, sp.y + 0.3, sp.z);
  settle(w, 4);
  for (const it of w.items.values()) {
    assert.ok(Math.abs(it.body.x) < w.arena.halfSize + 1 && Math.abs(it.body.z) < w.arena.halfSize + 1 && it.body.y > 0, `item ${it.id} at ${it.body.x},${it.body.y},${it.body.z}`);
  }
});

test("C1 climbing: run up Tent Town's broken ramp to the lookout; C1.1: cross the canal on a footbridge", () => {
  const w = new World({ seed: 1, spawnLoot: false, npcs: 0 });
  const p = w.addPlayer("a", "Climber");
  // the broken highway ramp: stepped, rising east, ends in a lookout 7.8 m up
  w.debugTeleport("a", -13.5, -112.5, Math.PI / 2);
  drive(w, "a", 20, { yaw: Math.PI / 2 });
  let top = 0;
  for (let i = 0; i < 60 * 6; i++) { drive(w, "a", 1, { yaw: Math.PI / 2, mz: 1 }); top = Math.max(top, p.move.y); }
  assert.ok(top > 7.7, `reached the lookout (${top.toFixed(2)} m up)`);
  // C1.1: the canal's footbridge: step up from the quay, walk across dry (not swimming)
  const bz = -60;
  w.debugTeleport("a", 96.5, bz, Math.PI / 2);
  drive(w, "a", 20, { yaw: Math.PI / 2 });
  let maxX = 0, minY = 9;
  for (let i = 0; i < 60 * 5; i++) { drive(w, "a", 1, { yaw: Math.PI / 2, mz: 1 }); maxX = Math.max(maxX, p.move.x); if (p.move.x > 100 && p.move.x < 112) minY = Math.min(minY, p.move.y); }
  assert.ok(maxX > 113, `crossed the canal on the footbridge (x ${maxX.toFixed(1)})`);
  assert.ok(minY > 0.5, `stayed up on the deck (lowest ${minY.toFixed(2)} m)`);
});

test("grab: big items go to hands and slow you down; heavy blocks sprint", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const tv = w.placeItem("crt_tv", 0, 0, 1.5);
  settle(w, 1);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  assert.equal(w.items.get(tv)!.mode, "held");
  assert.ok(p.move.carryHeavy && p.move.handsFull && p.move.carryMul < 1);
  drive(w, "a", 90, { mz: 1, sprint: true });
  const sp = Math.hypot(p.move.vx, p.move.vz);
  assert.ok(Math.abs(sp - PLAYER.walkSpeed * lootDef("crt_tv").weight * 0 - PLAYER.walkSpeed * (1 - lootDef("crt_tv").weight)) < 1e-6, `heavy carry speed ${sp}`);
});

test("grab: small items fill 3 pockets, then hands, then refuse", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const ids = [0, 1, 2, 3, 4].map((i) => w.placeItem("rubber_chicken", -0.4 + i * 0.2, 0, 1.2));
  settle(w, 1);
  for (const id of ids) { w.action("a", { a: "grab", item: id }); settle(w, 0.25); }
  assert.deepEqual(p.pockets, ids.slice(0, 3));
  assert.equal(p.hand, ids[3]);
  assert.equal(w.items.get(ids[4])!.mode, "free");
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "whiff" && e.reason === "full"));
  assert.equal(p.move.carryMul, 1, "small items don't slow you");
});

test("grab: too far away or behind you = whiff", () => {
  const w = flatWorld();
  w.addPlayer("a", "A");
  const far = w.placeItem("traffic_cone", 0, 0, 6);
  const behind = w.placeItem("traffic_cone", 0, 0, -1.8);
  settle(w, 1);
  w.action("a", { a: "grab", item: far });
  settle(w, 0.3);
  w.action("a", { a: "grab", item: behind });
  const ev = w.takeEvents().filter((e) => e.t === "whiff");
  assert.equal(ev.length, 2);
  assert.equal(w.players.get("a")!.hand, "");
});

test("grab race: two players grab the same item on the same tick, first wins, second whiffs", () => {
  const w = flatWorld();
  w.addPlayer("a", "A"); w.addPlayer("b", "B");
  const pa = w.players.get("a")!, pb = w.players.get("b")!;
  pa.move.x = -0.8; pb.move.x = 0.8;
  const it = w.placeItem("mystery_suitcase", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  w.action("b", { a: "grab", item: it });
  assert.equal(pa.hand, it);
  assert.equal(pb.hand, "");
  assert.ok(w.takeEvents().some((e) => e.t === "whiff" && e.p === "b" && e.reason === "taken"));
});

test("drop puts the item in front of you and it lands", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const it = w.placeItem("traffic_cone", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  settle(w, 0.3);
  w.action("a", { a: "drop" });
  assert.equal(p.hand, "");
  assert.equal(p.move.carryMul, 1);
  settle(w, 2);
  const b = w.items.get(it)!.body;
  assert.ok(b.resting && b.z > 0.5 && Math.abs(b.y - lootDef("traffic_cone").radius) < 0.01, `landed at ${b.x},${b.y},${b.z}`);
});

test("throw: charge controls distance; pocket items can be thrown too", () => {
  const dist = (charge: number) => {
    const w = flatWorld();
    w.addPlayer("a", "A");
    const it = w.placeItem("traffic_cone", 0, 0, 1.2);
    settle(w, 1);
    w.action("a", { a: "grab", item: it });
    settle(w, 0.3);
    w.action("a", { a: "throw", charge, yaw: 0, pitch: -0.2 });
    settle(w, 4);
    return w.items.get(it)!.body.z;
  };
  const weak = dist(0), strong = dist(1);
  assert.ok(strong > weak * 2 && strong > 10, `weak ${weak.toFixed(1)} m, strong ${strong.toFixed(1)} m`);
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const ch = w.placeItem("rubber_chicken", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch });
  settle(w, 0.3);
  assert.equal(p.pockets[0], ch);
  w.action("a", { a: "throw", charge: 0.5, yaw: 0, pitch: 0 });
  assert.equal(p.pockets[0], ch, "fists selected: nothing to throw");
  w.action("a", { a: "select", slot: 0 }); // key 1: take the chicken out
  w.action("a", { a: "throw", charge: 0.5, yaw: 0, pitch: 0 });
  assert.equal(p.pockets[0], "");
  assert.equal(w.items.get(ch)!.mode, "free");
  assert.equal(p.sel, FISTS, "back to fists once it's gone");
});

test("5A.1 item cycling: wheel steps through fists + filled pockets; keys pick a slot; a big item in hands locks it", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const ids = [w.placeItem("rubber_chicken", 0, 0, 1.2), w.placeItem("mixtape", 0.3, 0, 1.2), w.placeItem("snow_globe", -0.3, 0, 1.2)];
  settle(w, 1);
  for (const id of ids) { p.actionCd = 0; w.action("a", { a: "grab", item: id }); }
  assert.deepEqual(p.pockets, ids);
  assert.equal(p.sel, FISTS, "starts on fists");
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) { w.action("a", { a: "cycle", dir: 1 }); seen.push(p.sel); }
  assert.deepEqual(seen, [0, 1, 2, FISTS], "wheel down: 1, 2, 3, fists");
  w.action("a", { a: "cycle", dir: -1 });
  assert.equal(p.sel, 2, "wheel up goes back");
  w.action("a", { a: "select", slot: FISTS });
  assert.equal(p.sel, FISTS);
  // empty pockets are skipped
  w.action("a", { a: "select", slot: 1 });
  p.actionCd = 0; w.action("a", { a: "drop" });
  assert.equal(p.pockets[1], "");
  assert.equal(p.sel, FISTS);
  w.action("a", { a: "cycle", dir: 1 }); w.action("a", { a: "cycle", dir: 1 });
  assert.equal(p.sel, 2, "skipped the empty pocket 2");
  w.action("a", { a: "select", slot: 1 });
  assert.equal(p.sel, 2, "can't select an empty pocket");
  // a TV in your hands locks cycling
  const tv = w.placeItem("crt_tv", 0, 0, 1.2);
  settle(w, 1);
  p.actionCd = 0; w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  const before = p.sel;
  w.action("a", { a: "cycle", dir: 1 });
  assert.equal(p.sel, before, "locked while holding something big");
});

test("5A.1 every item is throwable: a giant item is a short clumsy heave and you stagger", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const duck = w.placeItem("rubber_duck", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: duck });
  settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0 });
  const it = w.items.get(duck)!;
  assert.equal(it.mode, "free", "heaved");
  assert.ok(p.move.stumbleT > 0, "you stagger from the effort");
  settle(w, 4);
  assert.ok(it.body.z > 2.5 && it.body.z < 6.5, `landed ${it.body.z.toFixed(1)} m ahead (a 3-4 m heave)`);
  // every loot type leaves your hands when thrown
  for (const d of LOOT) {
    const w2 = flatWorld();
    const q = w2.addPlayer("a", "A");
    const id = w2.placeItem(d.type, 0, 0, 1.3);
    settle(w2, 1);
    w2.action("a", { a: "grab", item: id });
    if (d.money) continue; // (cash goes straight into your wallet)
    if (q.pockets.includes(id)) w2.action("a", { a: "select", slot: q.pockets.indexOf(id) });
    settle(w2, 0.3);
    w2.action("a", { a: "throw", charge: 0.6, yaw: 0, pitch: 0 });
    assert.equal(w2.items.get(id)!.mode, "free", `${d.type} is throwable`);
  }
});

test("thrown item bonks another player (shove + event), not the thrower", () => {
  const w = flatWorld();
  w.addPlayer("a", "A"); w.addPlayer("b", "B");
  const pb = w.players.get("b")!;
  pb.move.x = 0; pb.move.z = 6;
  const it = w.placeItem("traffic_cone", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0.05 });
  let bonked = false;
  for (let i = 0; i < 90 && !bonked; i++) { w.tick(); bonked = w.takeEvents().some((e) => e.t === "bonk" && e.p === "b" && e.by === "a"); }
  assert.ok(bonked, "B got bonked by A's cone");
});

test("giant items: ONE player drags slowly; a rival grabbing the other end starts a tug of war", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const duck = w.placeItem("rubber_duck", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: duck });
  assert.equal(w.items.get(duck)!.holder, "a");
  assert.ok(Math.abs(a.move.carryMul - GIANT_DRAG_MUL) < 1e-9, "dragging alone is slow");
  settle(w, 0.3);
  w.action("b", { a: "grab", item: duck });
  const it = w.items.get(duck)!;
  assert.equal(it.holder2, "b", "b grabbed the other end");
  assert.equal(a.move.carryMul, 0); assert.equal(b.move.carryMul, 0);
  // b mashes harder: 2 presses for every 1 of a's
  let won = false;
  for (let i = 0; i < 400 && !won; i++) {
    if (i % 5 === 0) w.action("b", { a: "tug" });
    if (i % 10 === 0) w.action("a", { a: "tug" });
    w.tick();
    won = w.takeEvents().some((e) => e.t === "tug" && e.stage === "win" && e.winner === "b");
  }
  assert.ok(won, "the harder masher wins");
  assert.equal(it.holder, "b"); assert.equal(it.holder2, "");
  assert.equal(a.hand, ""); assert.equal(b.hand, duck);
  assert.ok(Math.abs(b.move.carryMul - GIANT_DRAG_MUL) < 1e-9, "winner drags it away");
});

test("tug of war: time runs out -> the holder keeps it; punching the dragger frees it", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const arc = w.placeItem("arcade_machine", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: arc }); settle(w, 0.3);
  w.action("b", { a: "grab", item: arc });
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0 });
  assert.equal(w.items.get(arc)!.mode, "held", "can't heave it away mid tug of war");
  settle(w, TUG_MAX_TIME + 0.5);
  const it = w.items.get(arc)!;
  assert.equal(it.holder, "a"); assert.equal(it.holder2, ""); assert.equal(b.hand, "");
  // knock the dragger down: it drops
  w.knockdown(a, "b");
  assert.equal(it.mode, "free"); assert.equal(a.hand, "");
});

test("disconnect / leave drops everything so it can be stolen", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const tv = w.placeItem("crt_tv", 0, 0, 1.4);
  const ch = w.placeItem("rubber_chicken", 0.5, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch }); settle(w, 0.3);
  w.action("a", { a: "grab", item: tv }); settle(w, 0.3);
  w.setConnected("a", false);
  assert.equal(p.hand, ""); assert.deepEqual(p.pockets, ["", "", ""]);
  assert.equal(w.items.get(tv)!.mode, "free"); assert.equal(w.items.get(ch)!.mode, "free");
  settle(w, 3);
  assert.ok(w.items.get(tv)!.body.resting && w.items.get(ch)!.body.resting, "dropped loot settles");
  w.removePlayer("a");
  assert.equal(w.players.size, 0);
});

test("items never end up inside walls after lots of random throwing (fuzz)", () => {
  const w = new World({ seed: 9 });
  const p = w.addPlayer("a", "Thrower");
  const types = LOOT.filter((d) => d.size !== "giant").map((d) => d.type);
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 120; k++) {
    const id = w.placeItem(types[k % types.length], p.move.x, 1.2, p.move.z + 0.9);
    const it = w.items.get(id)!;
    it.body.y = p.move.y + 1.2;
    w.action("a", { a: "grab", item: id });
    w.action("a", { a: "throw", charge: r(), yaw: r() * 6.28, pitch: r() * 1.4 - 0.9 });
    p.actionCd = 0;
    for (let i = 0; i < 10; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: r() * 6.28, mz: 1, sprint: true })]); w.tick(); }
  }
  settle(w, 6);
  for (const it of w.items.values()) {
    if (it.mode !== "free") continue;
    const def = lootDef(it.type);
    for (const b of w.arena.boxes) {
      const inX = Math.abs(it.body.x - b.x) < b.w / 2 - 0.02, inZ = Math.abs(it.body.z - b.z) < b.d / 2 - 0.02;
      const inY = Math.abs(it.body.y - b.y) < b.h / 2 - 0.02;
      assert.ok(!(inX && inY && inZ), `${it.type} stuck inside ${b.kind} at ${it.body.x.toFixed(2)},${it.body.y.toFixed(2)},${it.body.z.toFixed(2)} box ${b.x},${b.y},${b.z} ${b.w}x${b.h}x${b.d}`);
    }
    assert.ok(Math.abs(it.body.x) <= w.arena.halfSize + 2 && Math.abs(it.body.z) <= w.arena.halfSize + 2 && it.body.y >= def.radius - 0.01, `${it.type} in bounds`);
  }
});

test("the spawner never exceeds the item cap", () => {
  const w = new World({ seed: 5 });
  const loose = () => [...w.items.values()].filter((i) => i.shop < 0 && !lootDef(i.type).junk).length; // (shop shelves have their own cap; C4a: so does street junk)
  for (let i = 0; i < 300; i++) w.spawnOne();
  assert.ok(loose() <= ITEM_MAX, `${loose()} items`);
  settle(w, 30); // top-ups over time also respect the cap
  assert.ok(loose() <= ITEM_MAX);
});

test("spawning: fills the city, rare stuff shows up more in the plaza, respects caps", () => {
  const w = new World({ seed: 42 });
  assert.ok(w.items.size >= 28, `${w.items.size} items spawned`);
  let giants = 0;
  for (const it of w.items.values()) if (lootDef(it.type).size === "giant" && !lootDef(it.type).junk) giants++; // (C4a: junk crates / barrels / trolleys don't count)
  assert.ok(giants <= 2);
  // statistical check over many worlds: plaza gets a higher share of rare+ than streets
  let plazaRare = 0, plazaN = 0, streetRare = 0, streetN = 0;
  for (let s = 0; s < 60; s++) {
    const ww = new World({ seed: 1000 + s });
    for (const it of ww.items.values()) {
      if (lootDef(it.type).junk) continue;
      const near = ww.arena.lootSpawns!.reduce((best, sp) => (Math.hypot(sp.x - it.body.x, sp.z - it.body.z) < Math.hypot(best.x - it.body.x, best.z - it.body.z) ? sp : best));
      const rare = !["common", "uncommon"].includes(lootDef(it.type).rarity);
      if (near.zone === "plaza") { plazaN++; if (rare) plazaRare++; }
      if (near.zone === "street") { streetN++; if (rare) streetRare++; }
    }
  }
  assert.ok(plazaRare / plazaN > (streetRare / streetN) * 1.8, `plaza ${(plazaRare / plazaN).toFixed(2)} vs street ${(streetRare / streetN).toFixed(2)}`);
});

test("world is deterministic: same seed + same inputs = same result", () => {
  const run = () => {
    const w = new World({ seed: 77 });
    w.addPlayer("a", "A"); w.addPlayer("b", "B");
    for (let i = 0; i < 600; i++) {
      w.pushInputs("a", [inp(i, { mz: 1, yaw: i * 0.01, sprint: i % 90 < 40 })]);
      w.pushInputs("b", [inp(i, { mx: 1, yaw: -i * 0.02, jump: i % 50 === 0 })]);
      if (i % 60 === 30) { const near = [...w.items.values()][i % 20]; if (near) w.action("a", { a: "grab", item: near.id }); }
      if (i % 60 === 50) w.action("a", { a: "throw", charge: 0.7, yaw: 1, pitch: -0.1 });
      w.tick();
    }
    return JSON.stringify({ p: [...w.players.values()].map((p) => p.move), i: [...w.items.values()].map((i) => [i.id, i.body, i.mode]) });
  };
  assert.equal(run(), run());
});

test("pressing drop right after a grab isn't lost: it runs when the short cooldown ends", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "Quick");
  const id = w.placeItem("crt_tv", p.move.x, 0.4, p.move.z + 1);
  settle(w, 0.5);
  w.action("a", { a: "grab", item: id });
  assert.equal(p.hand, id);
  w.action("a", { a: "drop" }); // same instant: inside the cooldown
  assert.equal(p.hand, id, "not yet");
  settle(w, 0.3);
  assert.equal(p.hand, "", "the queued drop happened");
  // a third press during a cooldown with one already queued is refused, not stacked
  const id2 = w.placeItem("crt_tv", p.move.x, 0.4, p.move.z + 1);
  settle(w, 0.5);
  w.action("a", { a: "grab", item: id2 });
  w.action("a", { a: "drop" });
  w.action("a", { a: "grab", item: id2 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "whiff" && e.reason === "cooldown"));
});

test("C1.1 the canal: fall in = float slowly, no jumping or climbing the kerb, lose what's in your hands; out at a ladder", () => {
  const w = new World({ seed: 1, spawnLoot: false, npcs: 0 });
  const p = w.addPlayer("a", "Swimmer");
  const water = w.arena.deepWater![0];
  // hop over the kerb from the quay, holding a TV
  w.debugTeleport("a", 96.5, 15, Math.PI / 2);
  const tv = w.placeItem("crt_tv", 96.5 + Math.sin(Math.PI / 2) * 0.9, 1.2, 15);
  drive(w, "a", 10, { yaw: Math.PI / 2 });
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  let inWaterAt = -1;
  const ev: WorldEvent[] = [];
  for (let i = 0; i < 60 * 4 && inWaterAt < 0; i++) {
    w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: Math.PI / 2, mz: 1, jump: i % 20 < 10 })]); w.tick(); ev.push(...w.takeEvents());
    if (inDeepWater(w.arena, p.move.x, p.move.z, p.move.y)) inWaterAt = i;
  }
  assert.ok(inWaterAt >= 0, "jumped the kerb into the canal");
  drive(w, "a", 10, { yaw: Math.PI / 2 });
  ev.push(...w.takeEvents());
  assert.equal(p.hand, "", "the TV floated off");
  assert.ok(ev.some((e) => e.t === "splash"), "splash");
  // paddling is slow, sprint does nothing
  const x0 = p.move.x;
  drive(w, "a", 60, { yaw: Math.PI / 2, mz: 1, sprint: true });
  const v = p.move.x - x0;
  assert.ok(v > 1 && v < 2.2, `paddled ${v.toFixed(2)} m in 1 s (walking is 5)`);
  // can't jump or climb out over the kerb on the far side
  w.debugTeleport("a", water.maxX - 1, 15, Math.PI / 2);
  for (let i = 0; i < 60 * 3; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: Math.PI / 2, mz: 1, jump: i % 20 < 10 })]); w.tick(); }
  assert.ok(p.move.x < water.maxX && p.move.y < 0.3, `still in the water (${p.move.x.toFixed(2)}, y ${p.move.y.toFixed(2)})`);
  // ...but a ladder gets you out
  const ladder = w.arena.scenery!.find((s) => s.kind === "ladder" && s.x > 110)!;
  w.debugTeleport("a", water.maxX - 1, ladder.z, Math.PI / 2);
  drive(w, "a", 60 * 3, { yaw: Math.PI / 2, mz: 1 });
  assert.ok(p.move.x > water.maxX + 0.3 && !inDeepWater(w.arena, p.move.x, p.move.z, p.move.y), `climbed out at the ladder (x ${p.move.x.toFixed(2)})`);
});

// ---------------------------------------------------------------- C4a: smash, noise, heat if seen, dawn repairs
import { propSurfaceDist, BREAK_HP, HYDRANT_SPRAY, makeMoveState, stepMovement, propView } from "../src/index.js";

function c4World(seed = 7) {
  const w = new World({ seed, npcs: 0 });
  const p = w.addPlayer("a", "A");
  return { w, p };
}
/** stand next to a prop, facing it, and punch it n times */
function punchProp(w: World, id: string, n: number) {
  const p = w.players.get("a")!;
  const ps = w.props.props.get(id)!;
  const d = ps.def;
  for (let i = 0; i < n; i++) {
    const yaw = Math.atan2(d.x - p.move.x, d.z - p.move.z);
    w.action("a", { a: "punch", yaw, pitch: 0 });
    settle(w, 0.7);
  }
}
/** a spot on open pavement just off one side of a prop */
function besideProp(w: World, id: string): { x: number; z: number } {
  const d = w.props.props.get(id)!.def;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = d.x + dx * ((d.hw ?? 0.3) + 0.7), z = d.z + dz * ((d.hd ?? 0.3) + 0.7);
    const s = makeMoveState(x, z, 0);
    if (stepMovement(s, inp(1), w.arena).x === x) return { x, z };
  }
  return { x: d.x, z: d.z - (d.hd ?? 0.3) - 0.7 };
}

test("C4a breakables: every shop window, bus stop, hydrant, mailbox, bench, planter, table and pallet in the street is a prop tied to its box", () => {
  const c = buildTrashington();
  const brk = c.props!.filter((p) => p.box !== undefined && p.kind !== "vaultdoor"); // (C5c: the vault door is tied to its box too, but it opens rather than breaks)
  const kinds = new Set(brk.map((p) => p.kind));
  for (const k of ["shopglass", "hydrant", "bench", "planter", "table", "mailbox", "pallet"]) assert.ok(kinds.has(k as never), `has ${k}`);
  assert.ok(brk.length > 100, `${brk.length} breakables`);
  for (const p of brk) { const b = c.boxes[p.box!]; assert.ok(Math.abs(b.x - p.x) < 0.01 && Math.abs(b.z - p.z) < 0.01 && BREAK_HP[p.kind]! >= 1, p.id); }
  assert.ok(brk.filter((p) => p.kind === "shopglass" && p.shop !== undefined).length >= 20, "shop windows know their shop");
});

test("C4a smash a bench: 2 hits break it, it stops blocking, day damage lasts the night, dawn repairs it", () => {
  const { w, p } = c4World();
  const bench = [...w.props.props.values()].find((x) => x.def.kind === "bench" && x.def.hw! + x.def.hd! > 1)!;
  const spot = besideProp(w, bench.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  punchProp(w, bench.def.id, 1);
  assert.equal(bench.ready, true, "one hit: still there");
  punchProp(w, bench.def.id, 1);
  assert.equal(bench.ready, false, "two hits: broken");
  assert.ok(w.arena.boxes[bench.def.box!].off, "its box stops blocking");
  assert.equal(propView(w, bench.def.id).ready, false, "clients are told");
  // walk through where it was
  const d = bench.def, s = makeMoveState(d.x, d.z, 0);
  assert.ok(stepMovement(s, inp(1), w.arena).y < 0.5, "standing where the bench was");
  w.resetCity(true); // nightfall: stays broken
  assert.equal(bench.ready, false, "night: still broken");
  w.resetCity(false); // dawn
  assert.equal(bench.ready, true, "dawn: repaired");
  assert.ok(!w.arena.boxes[bench.def.box!].off && !w.arena.offCount, "and blocking again");
  void p;
});

test("C4a a smashed shop window is a way in until dawn: alarm, the cashier yells", () => {
  const { w, p } = c4World();
  const glass = [...w.props.props.values()].find((x) => x.def.kind === "shopglass" && x.def.shop !== undefined)!;
  const d = glass.def;
  const spot = besideProp(w, d.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  const ev: WorldEvent[] = [];
  for (let i = 0; i < BREAK_HP.shopglass!; i++) { punchProp(w, d.id, 1); ev.push(...w.takeEvents()); }
  assert.equal(glass.ready, false, "shattered");
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "shop"), "the shop alarm goes off");
  assert.ok(p.notoriety > 0, "the cashier saw it: heat");
  // walk straight through the gap into the shop
  const into = { x: d.x - spot.x, z: d.z - spot.z }, l = Math.hypot(into.x, into.z);
  let s = makeMoveState(spot.x, spot.z, Math.atan2(into.x, into.z));
  for (let i = 0; i < 60; i++) s = stepMovement(s, inp(i + 1, { mz: 1, yaw: Math.atan2(into.x, into.z) }), w.arena);
  assert.ok(Math.hypot(s.x - spot.x, s.z - spot.z) > l + 1, `walked in through the window (${Math.hypot(s.x - spot.x, s.z - spot.z).toFixed(1)} m)`);
});

test("C4a heat only if seen: smashing a planter where nobody's looking is free; with a pedestrian watching it isn't", () => {
  const { w, p } = c4World();
  const planters = [...w.props.props.values()].filter((x) => x.def.kind === "planter");
  // somewhere nobody can see (no crowd in this world; the cashiers are inside their shops)
  const lonely = planters.find((x) => !w.witnessed({ ...p, move: { ...p.move, x: x.def.x, z: x.def.z - 1.2 } } as never))!;
  const s1 = besideProp(w, lonely.def.id);
  w.debugTeleport("a", s1.x, s1.z, 0);
  assert.equal(w.witnessed(p), false, "nobody watching");
  punchProp(w, lonely.def.id, BREAK_HP.planter!);
  assert.equal(lonely.ready, false, "smashed");
  assert.equal(p.notoriety, 0, "no heat: nobody saw");
  // now a tourist is standing right there watching
  const other = planters.find((x) => x !== lonely && x.ready)!;
  const s2 = besideProp(w, other.def.id);
  w.debugTeleport("a", s2.x, s2.z, 0);
  const n = w.npc.spawn("tourist")!;
  n.move = makeMoveState(s2.x + 1.5, s2.z + 1.5, 0);
  assert.equal(w.witnessed(p), true, "seen");
  punchProp(w, other.def.id, BREAK_HP.planter!);
  assert.ok(p.notoriety > 0, `heat when seen (${p.notoriety})`);
});

test("C4a noise: a cop within earshot comes to look where something smashed", () => {
  const { w, p } = c4World();
  const b = [...w.props.props.values()].find((x) => x.def.kind === "bench")!;
  const spot = besideProp(w, b.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  p.notoriety = 35; // wanted enough for a cop to bother
  const cop = w.police.spawnCop(p, { x: spot.x + 9, z: spot.z })!;
  cop.state = "search"; cop.target = "";
  w.noise(p, b.def.x, b.def.z, 12);
  assert.equal(cop.state, "chase");
  assert.ok(Math.hypot(cop.lastX - b.def.x, cop.lastZ - b.def.z) < 0.01, "heading for the noise");
});

test("C4a a burst hydrant sprays: standing in it knocks you back", () => {
  const { w, p } = c4World();
  const h = [...w.props.props.values()].find((x) => x.def.kind === "hydrant")!;
  const spot = besideProp(w, h.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  punchProp(w, h.def.id, BREAK_HP.hydrant!);
  assert.equal(h.ready, false, "burst");
  w.debugTeleport("a", h.def.x + 0.5, h.def.z, 0);
  drive(w, "a", 8, {}); // (players move when their inputs arrive)
  assert.ok(Math.hypot(p.move.x - h.def.x, p.move.z - h.def.z) > 0.7 || p.move.y > 0.3, "shoved away / lifted by the jet");
  assert.ok(HYDRANT_SPRAY.time >= 10);
});

test("C4a street junk: chairs, lids, bottles, bricks, crates, barrels, trolleys, fish at their spots, worth $0-5, back every day", () => {
  const w = new World({ seed: 3, npcs: 0 });
  const junkOf = () => [...w.items.values()].filter((it) => lootDef(it.type).junk);
  const j0 = junkOf();
  assert.ok(j0.length >= 30, `${j0.length} bits of junk`);
  assert.ok(new Set(j0.map((j) => j.type)).size >= 7, "several kinds");
  for (const it of j0) assert.ok(it.value <= 5, `${it.type} $${it.value}`);
  assert.ok(![...w.items.values()].some((it) => lootDef(it.type).junk && it.shop < 0 && !w.arena.junkSpots!.some((s) => Math.hypot(s.x - it.body.x, s.z - it.body.z) < 1.5)), "only at junk spots");
  // take some away; a new day puts it back
  for (const it of j0.slice(0, 10)) w.items.delete(it.id);
  w.resetCity(false);
  assert.ok(junkOf().length >= j0.length, "back the next day");
  // random loot never rolls junk
  for (let i = 0; i < 40; i++) w.spawnOne();
  assert.ok(junkOf().length <= w.arena.junkSpots!.length, "no junk from random loot spawns");
});

test("C4a a thrown brick breaks a planter (counts as the thrower's hit)", () => {
  const { w, p } = c4World();
  const pl = [...w.props.props.values()].find((x) => x.def.kind === "planter" && BREAK_HP.planter === 2)!;
  const spot = besideProp(w, pl.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  for (let k = 0; k < 2; k++) {
    const id = w.placeItem("brick", p.move.x, 0.25, p.move.z); // (thrown low and flat: a planter is knee-high)
    const it = w.items.get(id)!;
    const dx = pl.def.x - p.move.x, dz = pl.def.z - p.move.z, l = Math.hypot(dx, dz);
    it.lastThrower = "a"; it.thrownT = 0;
    it.body.vx = (dx / l) * 12; it.body.vz = (dz / l) * 12; it.body.vy = 0.5; it.body.resting = false;
    settle(w, 0.8);
  }
  assert.equal(pl.ready, false, `two bricks broke it (hp ${pl.hp})`);
  assert.ok(propSurfaceDist(pl.def, pl.def.x, pl.def.z) === 0);
});

// ============================================================================ C4b
import { OPEN_TIME, NOISE, TAG, OLD_LADY, tierAt, tagView } from "../src/index.js";

/** pick up a fresh spray can and have it out */
function giveCan(w: World, id = "a") {
  const p = w.players.get(id)!;
  const it = w.popLoot("spray_can", p.move.x, p.move.y + 0.3, p.move.z, 0, 0);
  settle(w, 0.3);
  p.actionCd = 0;
  w.action(id, { a: "grab", item: it });
  settle(w, 0.3);
  const slot = p.pockets.indexOf(it);
  if (slot >= 0) p.sel = slot;
  assert.ok(p.hand === it || slot >= 0, "holding the can");
  return it;
}
/** THE PIT's back graffiti wall: a spot in front of it and the point on its face */
function pitWall(w: World) {
  const wall = w.arena.boxes.find((b) => b.kind === "wall" && b.sign?.startsWith("THE PIT"))!;
  const fz = wall.z - wall.d / 2;
  return { wall, stand: { x: wall.x, z: fz - 1.1 }, at: (dx: number) => ({ x: wall.x + dx, y: 1.4, z: fz }) };
}
function sprayAt(w: World, pt: { x: number; y: number; z: number }, hold = TAG.hold + 0.1, id = "a") {
  w.action(id, { a: "tagStart" });
  settle(w, hold);
  w.action(id, { a: "tag", x: pt.x, y: pt.y, z: pt.z, nx: 0, nz: -1 } as never);
  return w.takeEvents();
}

test("C4b laundromat: washers and dryers inside it; E opens one quietly in OPEN_TIME (moving off cancels), once a day", () => {
  const { w, p } = c4World();
  const washers = [...w.props.props.values()].filter((x) => x.def.kind === "washer"), dryers = [...w.props.props.values()].filter((x) => x.def.kind === "dryer");
  assert.ok(washers.length >= 3 && dryers.length >= 2, `${washers.length} washers, ${dryers.length} dryers`);
  const m = washers[0];
  const spot = besideProp(w, m.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  // start, then walk away: cancelled
  w.action("a", { a: "use", prop: m.def.id });
  assert.ok(p.rob, "opening...");
  w.debugTeleport("a", spot.x + 3, spot.z, 0);
  settle(w, 0.2);
  assert.equal(p.rob, null, "walked off: cancelled");
  assert.equal(m.ready, true, "still shut");
  // now properly
  w.debugTeleport("a", spot.x, spot.z, 0);
  w.takeEvents();
  w.action("a", { a: "use", prop: m.def.id });
  settle(w, OPEN_TIME - 0.5);
  assert.equal(m.ready, true, "not open yet");
  settle(w, 0.8);
  const ev = w.takeEvents();
  assert.equal(m.ready, false, "open");
  assert.ok(ev.some((e) => e.t === "search" && e.prop === m.def.id && e.found >= 1), "stuff popped out");
  assert.ok(!ev.some((e) => e.t === "noise" || e.t === "oldLady"), "quietly");
  assert.equal(p.notoriety, 0, "no heat");
  // again: empty
  w.action("a", { a: "use", prop: m.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"), "one search per machine");
  w.resetCity(true); assert.equal(m.ready, false, "night: still empty");
  w.resetCity(false); assert.equal(m.ready, true, "dawn: fresh loads");
});

test("C4b punching a washer forces it open: instant, loud (wakes the old lady), heat if seen", () => {
  const { w, p } = c4World();
  const m = [...w.props.props.values()].filter((x) => x.def.kind === "washer")[4];
  const spot = besideProp(w, m.def.id);
  w.debugTeleport("a", spot.x, spot.z, 0);
  w.takeEvents();
  const lady = [...w.npc.npcs.values()].find((n) => n.kind === "old_lady")!;
  assert.equal(lady.state, "sleep");
  let ev: WorldEvent[] = [];
  for (let i = 0; i < 12 && m.ready; i++) { p.actionCd = 0; punchProp(w, m.def.id, 1); ev.push(...w.takeEvents()); }
  assert.equal(m.ready, false, "forced open");
  assert.ok(ev.some((e) => e.t === "search" && e.prop === m.def.id), "loot out");
  assert.ok(ev.some((e) => e.t === "noise"), "a bang");
  assert.ok(ev.some((e) => e.t === "oldLady"), "upstairs, she's awake");
  assert.ok(p.notoriety >= OLD_LADY.heat, `she calls it in (${p.notoriety})`);
  void NOISE;
});

test("C4b the old lady: sleeps upstairs; a noise nearby wakes her -> yells + heat -> comes after you; far off she goes back to bed", () => {
  const { w, p } = c4World();
  const lady = [...w.npc.npcs.values()].find((n) => n.kind === "old_lady")!;
  assert.ok(lady && lady.post, "posted at the laundromat");
  assert.equal(w.npc.npcs.size - [...w.npc.npcs.values()].filter((n) => !n.post).length, w.arena.shops!.length + 9); // (C5a: + Uncle Dumpster; C5c: + 2 bank guards; C5c.2: + the maitre d'; C5c.3: + Big Crunch, Big Vinnie)
  const post = lady.post!;
  // a noise across town: nothing
  w.noise(p, post.x + 60, post.z, 12);
  assert.equal(lady.state, "sleep", "didn't hear that");
  // right outside
  w.debugTeleport("a", post.x, post.z - 8, 0);
  w.takeEvents();
  w.noise(p, post.x, post.z - 6, 10);
  assert.equal(lady.state, "yell");
  assert.ok(w.takeEvents().some((e) => e.t === "oldLady" && e.p === "a"));
  assert.ok(p.notoriety >= OLD_LADY.heat, "she called the cops");
  settle(w, OLD_LADY.yellTime + 0.5);
  assert.equal(lady.state, "chase", "here she comes with the cane");
  // second time: the player's long gone -> back to bed
  const w2 = c4World().w, p2 = w2.players.get("a")!;
  const l2 = [...w2.npc.npcs.values()].find((n) => n.kind === "old_lady")!;
  w2.debugTeleport("a", l2.post!.x + 50, l2.post!.z, 0);
  w2.noise(p2, l2.post!.x, l2.post!.z - 6, 10);
  assert.equal(l2.state, "yell");
  settle(w2, OLD_LADY.yellTime + 0.5);
  assert.equal(l2.state, "sleep", "whoever it was is gone: back to sleep");
});

test("C4b tagging: needs a can out, the full hold, a real wall; +1 aura each, spaced out, 5 per can, then it's gone", () => {
  const { w, p } = c4World();
  const W = pitWall(w);
  w.debugTeleport("a", W.stand.x, W.stand.z, 0);
  // no can: nothing
  assert.ok(!sprayAt(w, W.at(0)).some((e) => e.t === "tag"), "no can, no tag");
  const can = giveCan(w);
  w.debugTeleport("a", W.stand.x, W.stand.z, 0);
  settle(w, 0.2);
  // too short a hold (by the host's clock): it waits; letting go (a new start) drops it
  assert.ok(!sprayAt(w, W.at(0), 0.3).some((e) => e.t === "tag"), "held too briefly");
  // not a wall (the air in front of it)
  assert.ok(!sprayAt(w, { ...W.at(0), z: W.at(0).z - 0.8 }).some((e) => e.t === "tag"), "thin air");
  // proper
  assert.ok(sprayAt(w, W.at(0)).some((e) => e.t === "tag"), "tagged");
  assert.equal(p.aura, 1);
  assert.equal(w.tags.size, 1);
  assert.equal(w.items.get(can)!.uses, TAG.uses - 1);
  // right on top of it: no
  assert.ok(!sprayAt(w, W.at(0.5)).some((e) => e.t === "tag"), "too close to the last one");
  // four more along the wall, the last empties the can
  for (const dx of [-3.4, -1.7, 1.7, 3.4]) {
    w.debugTeleport("a", W.stand.x + dx, W.stand.z, 0); settle(w, 0.2);
    assert.ok(sprayAt(w, W.at(dx)).some((e) => e.t === "tag"), `tag at ${dx}`);
  }
  assert.equal(p.aura, 5);
  assert.equal(w.tags.size, 5);
  assert.ok(!w.items.has(can), "empty can tossed");
  assert.equal(p.notoriety, 0, "nobody saw (no crowd here)");
  assert.equal(tagView(w, [...w.tags.keys()][0]).c, p.colorIdx, "clients get the tags in your colour");
  // night keeps them, dawn scrubs them (aura stays: it's this match's score)
  w.resetCity(true); assert.equal(w.tags.size, 5, "night: still there");
  w.resetCity(false); assert.equal(w.tags.size, 0, "dawn: the council scrubs them");
  assert.equal(p.aura, 5);
});

test("C4b tagging where somebody sees you is heat", () => {
  const { w, p } = c4World();
  const W = pitWall(w);
  w.debugTeleport("a", W.stand.x, W.stand.z, 0);
  giveCan(w);
  w.debugTeleport("a", W.stand.x, W.stand.z, 0); settle(w, 0.2);
  const n = w.npc.spawn("tourist")!;
  n.move = makeMoveState(W.stand.x + 2, W.stand.z - 2, 0);
  n.state = "cower"; n.stateT = 99; // (stays put and watches)
  assert.ok(sprayAt(w, W.at(0)).some((e) => e.t === "tag"));
  assert.ok(p.notoriety >= TAG.heat, `seen: heat (${p.notoriety})`);
});

test("C4b THE PIT: a skate park in the low end with ramps, walls to tag and spray cans lying about (also at the other can spots)", () => {
  const c = buildTrashington();
  const pit = c.blocks!.find((b) => b.name.startsWith("The Pit"))!;
  assert.ok(pit, "the skate park");
  const cz = (pit.rect.minZ + pit.rect.maxZ) / 2;
  assert.equal(tierAt(cz), 0, "low end of town");
  const inPit = (b: { x: number; z: number }) => b.x > pit.rect.minX && b.x < pit.rect.maxX && b.z > pit.rect.minZ && b.z < pit.rect.maxZ;
  assert.ok(c.boxes.filter((b) => b.kind === "ramp-step" && inPit(b)).length >= 12, "stepped quarter pipes");
  const pw = c.landmarks!.pitWall, wall = c.boxes.find((b) => b.kind === "wall" && b.sign?.startsWith("THE PIT"))!;
  assert.ok(Math.abs(wall.x - pw.x) < 0.01 && Math.abs(wall.z - wall.d / 2 - pw.faceZ) < 0.01, "the test landmark faces the graffiti wall");
  const w = new World({ seed: 3, npcs: 0 });
  const cans = [...w.items.values()].filter((i) => i.type === "spray_can");
  assert.ok(cans.length >= 6, `${cans.length} spray cans`);
  assert.ok(cans.filter((i) => inPit(i.body)).length >= 2, "some in the pit");
});

// ============================================================================ C5a: the lobby squat
import { inLobby, THROW_GAME, NPC_DEFS as NPCD } from "../src/index.js";

function lobbyWorld(seed = 3) {
  const w = new World({ seed, npcs: 0, lobby: true });
  const p = w.addPlayer("a", "A");
  return { w, p, L: w.arena.lobby! };
}

test("C5a the squat: a rooftop past the south edge, 26 m up; you arrive there before the match, at your fort once it starts", () => {
  const { w, p, L } = lobbyWorld();
  assert.ok(L && L.rect.maxZ < -w.arena.halfSize, "just past the south fence");
  assert.equal(L.y, 26);
  assert.ok(inLobby(w.arena, p.move.x, p.move.z) && Math.abs(p.move.y - L.y) < 0.01, `spawned on the roof (${p.move.x}, ${p.move.y}, ${p.move.z})`);
  settle(w, 1);
  assert.ok(Math.abs(p.move.y - L.y) < 0.05 && p.move.grounded, "standing on the roof (not falling through it)");
  const b = w.addPlayer("b", "B");
  assert.ok(inLobby(w.arena, b.move.x, b.move.z), "a friend arrives there too");
  p.aura = 7;
  w.startMatch();
  for (const q of [p, b]) assert.ok(!inLobby(w.arena, q.move.x, q.move.z, 3) && q.move.y < 1, "match on: off to the forts");
  assert.equal(p.aura, 0, "aura starts from 0");
  const c = w.addPlayer("c", "C");
  assert.ok(!inLobby(w.arena, c.move.x, c.move.z, 3), "joining mid-match: straight to your fort");
});

test("C5a the squat's fence: walk or sprint at it from anywhere and you stay on the roof", () => {
  const { w, p, L } = lobbyWorld();
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.8, -2.4]) {
    w.debugTeleport("a", 0, -130, yaw);
    drive(w, "a", 60 * 8, { mz: 1, yaw, sprint: true, jump: true });
    assert.ok(inLobby(w.arena, p.move.x, p.move.z) && p.move.y > L.y - 0.2, `yaw ${yaw.toFixed(1)}: still on the roof (${p.move.x.toFixed(1)}, ${p.move.y.toFixed(1)}, ${p.move.z.toFixed(1)})`);
  }
});

test("C5a nothing counts up there: no heat, no noise; the practice dummy just wobbles", () => {
  const { w, p } = lobbyWorld();
  w.addHeat(p, 50);
  assert.equal(p.notoriety, 0, "no heat on the roof");
  w.takeEvents();
  w.noise(p, p.move.x, p.move.z, 30);
  assert.ok(!w.takeEvents().some((e) => e.t === "noise"), "nobody hears the squat");
  const dummy = [...w.props.props.values()].find((x) => x.def.kind === "dummy")!;
  w.debugTeleport("a", dummy.def.x, dummy.def.z + 1.0, Math.PI);
  let ev: WorldEvent[] = [];
  for (let i = 0; i < 4; i++) { p.punchCd = 0; w.action("a", { a: "punch", yaw: Math.PI, pitch: 0 }); settle(w, 0.5); ev.push(...w.takeEvents()); }
  assert.ok(ev.filter((e) => e.t === "smash" && e.kind === "dummy").length >= 3, "THWACK");
  assert.equal(dummy.ready, true, "never breaks");
  assert.equal(p.notoriety, 0);
});

test("C5a the roof restocks while you wait: the free-stuff pile, bin lids, two trolleys, a spray can", () => {
  const { w, L } = lobbyWorld();
  settle(w, 40);
  const near = (x: number, z: number, r: number, t?: string) => [...w.items.values()].filter((it) => (!t || it.type === t) && Math.hypot(it.body.x - x, it.body.z - z) < r && it.body.y > L.y - 1).length;
  assert.ok(near(L.pile.x, L.pile.z, 2.5) >= 4, `free stuff (${near(L.pile.x, L.pile.z, 2.5)})`);
  assert.ok(near(L.lids.x, L.lids.z, 2, "bin_lid") >= 3, "bin lids");
  assert.equal(near(0, -130, 20, "shopping_trolley"), 2, "two trolleys");
  assert.ok(near(L.cans.x, L.cans.z, 1.5, "spray_can") >= 1, "a spray can by the tag wall");
  // taken stuff comes back
  for (const it of [...w.items.values()]) if (near(L.pile.x, L.pile.z, 0.01) >= 0 && Math.hypot(it.body.x - L.pile.x, it.body.z - L.pile.z) < 2.5 && it.body.y > L.y - 1) w.items.delete(it.id);
  settle(w, 40);
  assert.ok(near(L.pile.x, L.pile.z, 2.5) >= 4, "the pile refills");
  // once the match is on, the roof stops restocking (and the match clears it)
  w.startMatch(); settle(w, 20);
  assert.equal(near(0, -130, 20), 0, "match on: nothing up there");
});

test("C5a THROW-O-MATIC: E starts 30 s; lids on the targets score 3/2/1 by the bullseye; best score kept", () => {
  const { w, p, L } = lobbyWorld();
  const tg = L.targets[0];
  const game = [...w.props.props.values()].find((x) => x.def.kind === "throwgame")!;
  w.debugTeleport("a", game.def.x - 1.2, game.def.z, Math.PI / 2);
  w.takeEvents();
  w.action("a", { a: "use", prop: game.def.id });
  assert.equal(p.lobbyGame?.kind, "throw");
  assert.ok(w.takeEvents().some((e) => e.t === "lobbyGame" && e.stage === "start"));
  // two lids hit: dead centre, and the rim
  for (const [dy, pts] of [[0, 3], [tg.r * 0.9, 1]] as const) {
    const id = w.placeItem("bin_lid", tg.x - 1.5, tg.y + dy - 0.2, tg.z);
    const it = w.items.get(id)!;
    it.lastThrower = "a"; it.thrownT = 0; it.body.y = tg.y + dy; it.body.vx = 14; it.body.vy = 1.5; it.body.vz = 0;
    let got: WorldEvent | undefined;
    for (let i = 0; i < 30 && !got; i++) { w.tick(); got = w.takeEvents().find((e) => e.t === "target"); }
    assert.ok(got && got.t === "target" && got.pts === pts, `a lid ${dy ? "on the rim" : "in the bullseye"}: ${JSON.stringify(got)}`);
  }
  assert.equal(p.lobbyGame?.score, 4);
  settle(w, THROW_GAME.time);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "lobbyGame" && e.stage === "done" && e.score === 4), "time's up: 4 points");
  assert.equal(p.throwBest, 4);
  assert.equal(p.lobbyGame, null);
});

test("C5a TROLLEY GRAND PRIX: E at the post, then drag a trolley round the 4 cones and back: your lap time", () => {
  const { w, p, L } = lobbyWorld();
  settle(w, 8); // (the trolleys arrive)
  const post = [...w.props.props.values()].find((x) => x.def.kind === "racegame")!;
  w.debugTeleport("a", post.def.x, post.def.z - 1.0, 0);
  w.action("a", { a: "use", prop: post.def.id });
  assert.equal(p.lobbyGame?.kind, "race");
  // no trolley: the cones don't count
  w.debugTeleport("a", L.race[1].x, L.race[1].z, 0); settle(w, 0.3);
  assert.equal(p.lobbyGame?.cp, 1, "no trolley, no checkpoint");
  // grab a trolley and go round
  const tr = [...w.items.values()].find((it) => it.type === "shopping_trolley" && inLobby(w.arena, it.body.x, it.body.z))!;
  w.debugTeleport("a", tr.body.x, tr.body.z - 1.0, 0); settle(w, 0.3);
  p.actionCd = 0; w.action("a", { a: "grab", item: tr.id }); settle(w, 0.3);
  assert.equal(p.hand, tr.id, "dragging a trolley");
  w.takeEvents();
  for (const cp of [...L.race.slice(1), L.race[0]]) { w.debugTeleport("a", cp.x, cp.z, 0); settle(w, 0.5); }
  const ev = w.takeEvents();
  assert.equal(ev.filter((e) => e.t === "lobbyGame" && e.stage === "cp").length, 3, "3 cones");
  const done = ev.find((e) => e.t === "lobbyGame" && e.stage === "done");
  assert.ok(done && done.t === "lobbyGame" && done.score > 0, `finished: ${JSON.stringify(done)}`);
  assert.ok(p.raceBest > 0 && p.raceBest === (done as { score: number }).score, "best lap kept");
});

test("C5a Uncle Dumpster: lives on the roof, goes through his tips while you're near, and can't be hit", () => {
  const { w, p } = lobbyWorld();
  const u = [...w.npc.npcs.values()].find((n) => n.kind === "uncle_dumpster")!;
  assert.ok(u && u.post && u.move.y > 25, "on the roof");
  settle(w, 1);
  assert.ok(u.move.y > 25, "stays up there");
  const said: string[] = [];
  for (let i = 0; i < 16 * 60; i++) { w.tick(); for (const e of w.takeEvents()) if (e.t === "npcSay" && e.npc === u.id) said.push(e.line); }
  const tips = NPCD.uncle_dumpster.lines.idle;
  assert.ok(said.length >= 2 && said[0] === tips[0] && said[1] === tips[1], `tips in order: ${JSON.stringify(said.slice(0, 3))}`);
  // punch him: he dodges, every time
  w.debugTeleport("a", u.move.x, u.move.z - 1.0, 0);
  let dodged = 0;
  for (let i = 0; i < 4; i++) { p.punchCd = 0; w.action("a", { a: "punch", yaw: 0, pitch: 0 }); settle(w, 0.5); dodged += w.takeEvents().filter((e) => e.t === "npcDodge").length; }
  assert.ok(dodged >= 3, `dodged ${dodged}`);
  assert.equal(p.notoriety, 0);
});

// ============================================================================ C5b: Chinatown
import { STALL_LOOT } from "../src/index.js";

test("C5b Chinatown: six shophouses by the canal, two gates, lanterns, and a stall in front of each", () => {
  const c = buildTrashington();
  const shops = c.boxes.filter((b) => b.china);
  assert.equal(shops.length, 6);
  for (const b of shops) assert.ok(b.x > 75 && b.x < 95 && Math.abs(b.z) < 22 && b.sign && b.china!.sign2.length >= 2, `${b.sign} by the canal`);
  assert.equal(tierAt(0), 1, "middle tier");
  assert.equal(c.chinatown!.gates.length, 2);
  assert.ok(c.chinatown!.lanternRows.length >= 4);
  const stalls = c.props!.filter((p) => p.kind === "steamer" || p.kind === "trinkets" || p.kind === "fishtank");
  assert.equal(stalls.length, 6);
  for (const s of stalls) assert.ok(c.boxes.some((b) => b.kind === s.kind && Math.abs(b.x - s.x) < 0.01 && Math.abs(b.z - s.z) < 0.01), `${s.id} has a box`);
});

test("C5b stalls: E on a dumpling steamer gets you food; the stall keeper yells if anybody sees; empty till it restocks", () => {
  const { w, p } = c4World();
  const st = [...w.props.props.values()].find((x) => x.def.kind === "steamer")!;
  const spot = { x: st.def.x - 1.4, z: st.def.z };
  w.debugTeleport("a", spot.x, spot.z, Math.PI / 2); // (facing the stall)
  const before = new Set(w.items.keys());
  w.action("a", { a: "use", prop: st.def.id });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "search" && e.prop === st.def.id));
  settle(w, 0.5);
  const got = [...w.items.values()].filter((it) => !before.has(it.id));
  assert.ok(got.length >= 1 && got.every((it) => STALL_LOOT.steamer!.some(([t]) => t === it.type)), got.map((it) => it.type).join(","));
  assert.equal(p.notoriety, 0, "nobody watching (no crowd here)");
  w.action("a", { a: "use", prop: st.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"), "sold out");
  // with a watcher: +heat and a yell
  const tr = [...w.props.props.values()].find((x) => x.def.kind === "trinkets")!;
  const s2 = { x: tr.def.x - 1.4, z: tr.def.z };
  w.debugTeleport("a", s2.x, s2.z, Math.PI / 2);
  const n = w.npc.spawn("tourist")!;
  n.move = makeMoveState(s2.x - 2, s2.z, 0);
  n.state = "cower"; n.stateT = 99;
  w.action("a", { a: "use", prop: tr.def.id });
  const ev2 = w.takeEvents();
  assert.ok(ev2.some((e) => e.t === "stallYell"), "HEY! You pay for that!");
  assert.ok(p.notoriety >= 3, `heat (${p.notoriety})`);
});

test("C5b the seafood tank: punch it: SPLASH, a crab or a fish flops out, the glass is gone until dawn", () => {
  const { w, p } = c4World();
  const tank = [...w.props.props.values()].find((x) => x.def.kind === "fishtank")!;
  const spot = { x: tank.def.x - 1.3, z: tank.def.z }; // (on the street side of it)
  w.debugTeleport("a", spot.x, spot.z, Math.PI / 2); // (facing the stall)
  const before = new Set(w.items.keys());
  const ev: WorldEvent[] = [];
  for (let i = 0; i < 8 && tank.ready; i++) { p.punchCd = 0; punchProp(w, tank.def.id, 1); ev.push(...w.takeEvents()); }
  assert.equal(tank.ready, false, "smashed");
  assert.ok(ev.some((e) => e.t === "smash" && e.kind === "fishtank"));
  settle(w, 0.5);
  const got = [...w.items.values()].filter((it) => !before.has(it.id));
  assert.ok(got.some((it) => it.type === "live_crab" || it.type === "smelly_fish"), got.map((it) => it.type).join(","));
  w.resetCity(true); assert.equal(tank.ready, false, "night: still smashed");
  w.resetCity(false); assert.equal(tank.ready, true, "dawn: a new tank");
});

// ============================================================================ C5c: Uptown landmarks
import { HOLD_TIME, KEYCARD_TIME, BANK, MAYOR_TAG, inRect, setBoxOff } from "../src/index.js";

function propOf(w: World, kind: string) { return [...w.props.props.values()].find((x) => x.def.kind === kind)!; }
function holdOn(w: World, id: string, seconds: number) {
  const p = w.players.get("a")!;
  w.action("a", { a: "use", prop: id });
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); }
}

test("C5c the Trashington Bank: a walk-in marble hall where the country club was: vault, deposit boxes, 2 guards, a golden stash; the keycard is somewhere in Uptown", () => {
  const c = buildTrashington();
  assert.ok(c.bank && c.boxes.some((b) => b.sign === "TRASHINGTON BANK"));
  assert.ok(!c.boxes.some((b) => b.sign?.includes("COUNTRY CLUB")), "no more country club");
  assert.equal(tierAt(c.bank!.rect.minZ), 2, "Uptown");
  assert.equal(c.props!.filter((p) => p.kind === "depositbox").length, 4);
  const door = c.props!.find((p) => p.kind === "vaultdoor")!;
  assert.ok(door.box !== undefined && c.boxes[door.box].h >= 2.5, "a real (blocking) vault door");
  assert.equal(c.posts!.filter((p) => p.kind === "bank_guard").length, 2);
  assert.ok(c.props!.filter((p) => p.kind === "stash").length >= 3, "golden stashes at the bank, the statue and the Mile East plaza");
  const w = new World({ seed: 4, npcs: 0 });
  assert.equal([...w.items.values()].filter((it) => it.type === "bank_keycard").length, 1, "one keycard, somewhere");
  const card = [...w.items.values()].find((it) => it.type === "bank_keycard")!;
  assert.ok(c.bank!.keycardSpots.some((k) => Math.hypot(k.x - card.body.x, k.z - card.body.z) < 0.5), "at one of the keycard spots");
  assert.ok([...w.items.values()].filter((it) => it.type === "gold_bar" && inRect(c.bank!.vault, it.body.x, it.body.z)).length >= 5, "gold in the vault");
});

test("C5c the loud way: drilling the vault door: 3 stars at once, alarm, the guards come; 20 s later it swings open (walk in); dawn shuts it and restocks", () => {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const door = propOf(w, "vaultdoor");
  w.debugTeleport("a", door.def.x, door.def.z - 1.6, 0);
  settle(w, 0.3); w.takeEvents();
  w.action("a", { a: "use", prop: door.def.id });
  assert.ok(p.notoriety >= BANK.drillHeat - 0.01, `3 stars straight away (${p.notoriety})`);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "bank"), "the bank alarm");
  assert.ok([...w.npc.npcs.values()].filter((n) => n.kind === "bank_guard").every((n) => n.state === "chase" && n.target === "a"), "both guards come for you");
  // (keep the guards off us for the rule check)
  for (const n of w.npc.npcs.values()) if (n.kind === "bank_guard") { n.state = "work"; n.target = ""; }
  w.police.reset();
  holdOn(w, door.def.id, 0.01);
  for (let i = 0; i < Math.round((HOLD_TIME.vaultdoor! + 0.5) * 60); i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); p.move.knockT = 0; }
  assert.equal(door.ready, false, "open");
  assert.ok(w.arena.boxes[door.def.box!].off, "the door no longer blocks");
  // walk in
  drive(w, "a", 90, { mz: 1, yaw: 0 });
  assert.ok(inRect(w.arena.bank!.vault, p.move.x, p.move.z), `inside the vault (${p.move.x.toFixed(1)}, ${p.move.z.toFixed(1)})`);
  w.resetCity(true); assert.equal(door.ready, false, "night: still open");
  const gold0 = [...w.items.values()].filter((it) => it.type === "gold_bar").length;
  for (const it of [...w.items.values()]) if (it.type === "gold_bar") w.items.delete(it.id);
  w.resetCity(false);
  assert.equal(door.ready, true, "dawn: shut again");
  assert.ok(!w.arena.boxes[door.def.box!].off);
  assert.ok([...w.items.values()].filter((it) => it.type === "gold_bar").length >= Math.min(5, gold0), "and restocked");
});

test("C5c the sneaky way: with the manager's keycard, E on the vault opens it in 3 s, quietly (no heat if nobody sees); the card stays in the lock", () => {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  for (const n of [...w.npc.npcs.values()]) if (n.kind === "bank_guard") w.npc.npcs.delete(n.id); // (nobody on shift)
  const door = propOf(w, "vaultdoor");
  w.debugTeleport("a", door.def.x, door.def.z - 1.6, 0);
  const card = w.placeItem("bank_keycard", p.move.x, 0.3, p.move.z + 0.6);
  settle(w, 0.3);
  p.actionCd = 0; w.action("a", { a: "grab", item: card }); settle(w, 0.3);
  assert.ok(w.carriedItems(p).some((it) => it.id === card), "got the card");
  w.takeEvents();
  holdOn(w, door.def.id, KEYCARD_TIME + 0.3);
  const ev = w.takeEvents();
  assert.equal(door.ready, false, "open");
  assert.ok(ev.some((e) => e.t === "vault" && e.quiet), "quietly");
  assert.ok(!ev.some((e) => e.t === "alarm"), "no alarm");
  assert.equal(p.notoriety, 0, "no heat");
  assert.ok(!w.items.has(card), "the card stays in the lock");
});

test("C5c safety deposit boxes: search each once a day", () => {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const door = propOf(w, "vaultdoor");
  w.props.props.get(door.def.id)!.ready = false; setBoxOff(w.arena, door.def.box!, true);
  const box1 = propOf(w, "depositbox");
  w.debugTeleport("a", box1.def.x + (box1.def.x < 68.5 ? 1.0 : -1.0), box1.def.z, box1.def.x < 68.5 ? -Math.PI / 2 : Math.PI / 2);
  settle(w, 0.3); w.takeEvents();
  w.action("a", { a: "use", prop: box1.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "search" && e.prop === box1.def.id));
  w.action("a", { a: "use", prop: box1.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"));
  void p;
});

test("C5c the Mayor's Golden Statue: prise off his gold nose (hold E 5 s: heat if seen, gone till dawn); tag his plinth: +5 aura, +15 heat", () => {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const nose = propOf(w, "nose");
  const S = w.arena.statue!;
  // up on the plinth, facing the nose
  w.debugTeleport("a", nose.def.x + 0.9, nose.def.z, -Math.PI / 2);
  p.move.y = S.plinthH; settle(w, 0.3);
  assert.ok(Math.abs(p.move.y - S.plinthH) < 0.1, `standing on the plinth (${p.move.y})`);
  w.takeEvents();
  holdOn(w, nose.def.id, HOLD_TIME.nose! + 0.3);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "nose"), "prised off");
  assert.equal(nose.ready, false);
  settle(w, 1);
  assert.ok([...w.items.values()].some((it) => it.type === "gold_nose"), "a golden nose");
  w.resetCity(true); assert.equal(nose.ready, false, "night: still missing");
  w.resetCity(false); assert.equal(nose.ready, true, "dawn: the council glued it back");
  // tag the plinth's front face
  const plinth = w.arena.boxes.find((b) => b.mayor)!;
  const fx = plinth.x + plinth.w / 2;
  w.debugTeleport("a", fx + 1.1, plinth.z - 1.5, -Math.PI / 2); settle(w, 0.3);
  const it = w.placeItem("spray_can", p.move.x, 0.3, p.move.z); settle(w, 0.3);
  p.actionCd = 0; w.action("a", { a: "grab", item: it }); settle(w, 0.3);
  const slot = p.pockets.indexOf(it); if (slot >= 0) p.sel = slot;
  const a0 = p.aura, h0 = p.notoriety;
  w.action("a", { a: "tagStart" }); settle(w, 1.7);
  w.action("a", { a: "tag", x: fx, y: 2.0, z: plinth.z - 1.5, nx: 1, nz: 0 } as never);
  assert.equal(p.aura - a0, MAYOR_TAG.aura, "5 aura");
  assert.ok(p.notoriety - h0 >= MAYOR_TAG.heat - 0.01, "big heat");
});

test("C5c golden stashes: each hides one golden item, found once a day", () => {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const stashes = [...w.props.props.values()].filter((x) => x.def.kind === "stash");
  const st = stashes.find((x) => x.def.loot?.includes("diamond_pigeon"))!;
  w.debugTeleport("a", st.def.x + Math.sin(st.def.yaw) * 0.9, st.def.z + Math.cos(st.def.yaw) * 0.9, st.def.yaw + Math.PI); settle(w, 0.3); w.takeEvents(); // (in front of it, facing it)
  w.action("a", { a: "use", prop: st.def.id });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "stashFound"), "found it");
  settle(w, 1);
  assert.ok([...w.items.values()].some((it) => it.type === "diamond_pigeon"));
  w.action("a", { a: "use", prop: st.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"), "once a day");
  void p;
});

// ============================================================================ C5c.2: LE DUMPSTÈRE
import { RESTO } from "../src/index.js";
function walkInto(w: World, id: string, yaw: number, seconds: number) {
  const p = w.players.get(id)!;
  const ev: WorldEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs(id, [inp(p.lastSeq + 1, { mz: 1, yaw })]); w.tick(); ev.push(...w.takeEvents()); }
  return ev;
}
function clubWorld() {
  const w = new World({ seed: 4, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const c = w.arena.resto!;
  return { w, p, c };
}
const atFront = (w: World, c: NonNullable<ReturnType<typeof buildTrashington>["resto"]>) => { w.debugTeleport("a", c.out.x - 0.6, (c.door.minZ + c.door.maxZ) / 2, Math.PI / 2); w.players.get("a")!.move.y = 0.15; };

test("C5c.2 LE DUMPSTERE: on Mile East, a 2-storey restaurant: dining room, piano, cloakroom, dessert trolley, kitchen, stairs to a roof terrace, a maitre d', 2 golden stashes", () => {
  const c = buildTrashington();
  assert.ok(c.resto && tierAt(c.resto.rect.minZ) === 2, "Uptown");
  for (const k of ["podium", "cloakroom", "dessertcart", "piano", "chefstable", "kitchen"]) assert.equal(c.props!.filter((p) => p.kind === k).length, 1, k);
  assert.ok(c.posts!.some((p) => p.kind === "maitre_d"));
  const stashes = c.props!.filter((p) => p.kind === "stash").map((p) => p.loot?.[0]);
  assert.ok(stashes.includes("golden_truffle") && stashes.includes("diamond_pigeon"));
  const steps = c.boxes.filter((b) => b.kind === "step" && inRect(c.resto!.stairs, b.x, b.z));
  assert.equal(steps.length, 15);
  assert.ok(Math.abs(steps[steps.length - 1].h - c.resto.roofY) < 0.1);
});

test("C5c.2 the maitre d': no booking and no designer clothes = put back outside; book a table ($20) or carry something designer and you're in; broke = no; bookings end at dawn", () => {
  const { w, p, c } = clubWorld();
  atFront(w, c); settle(w, 0.3); w.takeEvents();
  let ev = walkInto(w, "a", Math.PI / 2, 3);
  assert.ok(ev.some((e) => e.t === "bounced" && e.reason === "dress"), "not dressed for it");
  assert.ok(p.move.x < c.door.minX, `still outside (x ${p.move.x.toFixed(1)})`);
  const pod = [...w.props.props.values()].find((x) => x.def.kind === "podium")!;
  w.debugTeleport("a", pod.def.x - 0.9, pod.def.z, Math.PI / 2); settle(w, 0.3); w.takeEvents();
  w.action("a", { a: "use", prop: pod.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "restoNo" && e.reason === "broke"));
  p.cash = 50;
  w.action("a", { a: "use", prop: pod.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "seated"));
  assert.equal(p.cash, 50 - RESTO.fee);
  atFront(w, c); settle(w, 0.3); w.takeEvents();
  ev = walkInto(w, "a", Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced"), "shown to your table");
  assert.ok(p.move.x > c.door.maxX, `inside (x ${p.move.x.toFixed(1)})`);
  w.resetCity(false);
  assert.equal(w.restoPass.size, 0, "bookings end at dawn");
  // dressed up: a designer scarf in your pocket gets you in without booking
  const { w: w2, p: p2, c: c2 } = clubWorld();
  atFront(w2, c2); settle(w2, 0.3);
  const scarf = w2.placeItem("designer_scarf", p2.move.x, 0.3, p2.move.z);
  w2.action("a", { a: "grab", item: scarf }); settle(w2, 0.5);
  assert.ok(w2.dressedUp(p2), "dressed for it");
  atFront(w2, c2); settle(w2, 0.3); w2.takeEvents();
  ev = walkInto(w2, "a", Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced") && p2.move.x > c2.door.maxX, "\"Right this way, monsieur\"");
});

test("C5c.2 knock the maitre d' out and the front door's open to anyone; the kitchen's back door is always open; the roof: climb the crates", () => {
  const { w, p, c } = clubWorld();
  const m = [...w.npc.npcs.values()].find((n) => n.kind === "maitre_d")!;
  assert.ok(m, "he's there");
  m.state = "ko"; m.stateT = 60;
  atFront(w, c); settle(w, 0.3); w.takeEvents();
  let ev = walkInto(w, "a", Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced") && p.move.x > c.door.maxX, "walked straight in");
  // the back door: from the alley straight into the kitchen
  m.state = "work";
  w.debugTeleport("a", c.rect.maxX + 1.2, 61.8, -Math.PI / 2); p.move.y = 0.15; settle(w, 0.3);
  let inKitchen = false;
  for (let i = 0; i < 150 && !inKitchen; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: -Math.PI / 2 })]); w.tick(); inKitchen = inRect(c.kitchen, p.move.x, p.move.z); }
  assert.ok(inKitchen, `walked into the kitchen (x ${p.move.x.toFixed(1)}, z ${p.move.z.toFixed(1)})`);
  const crate = w.arena.boxes.find((x) => x.kind === "crate" && Math.abs(x.x - 23.2) < 0.01)!, stack = w.arena.boxes.find((x) => x.kind === "boxes" && Math.abs(x.x - 22.3) < 0.01)!;
  const top = (x: typeof crate) => x.y + x.h / 2;
  assert.ok(top(crate) <= PLAYER.mantleMax && top(stack) - top(crate) <= PLAYER.mantleMax && c.roofY - top(stack) <= PLAYER.mantleMax, "every step of the climb is a mantle");
});

test("C5c.2 inside: the cloakroom, the dessert trolley, the chef's table and the kitchen give 1-2 things once a day (the chef yells if he sees you); the piano: +3 aura and a noise", () => {
  const { w, p } = clubWorld();
  for (const k of ["cloakroom", "dessertcart", "chefstable", "kitchen"]) {
    const ps = [...w.props.props.values()].find((x) => x.def.kind === k)!;
    w.debugTeleport("a", ps.def.x + Math.sin(ps.def.yaw) * 1.1, ps.def.z + Math.cos(ps.def.yaw) * 1.1, ps.def.yaw + Math.PI);
    if (k === "chefstable") p.move.y = w.arena.resto!.roofY;
    settle(w, 0.4); w.takeEvents();
    w.action("a", { a: "use", prop: ps.def.id });
    const ev = w.takeEvents();
    assert.ok(ev.some((e) => e.t === "search" && e.found >= 1), `${k}: found something`);
    assert.equal(ps.ready, false);
    settle(w, 30);
    assert.equal(ps.ready, false, `${k}: not again today`);
  }
  const pn = [...w.props.props.values()].find((x) => x.def.kind === "piano")!;
  w.debugTeleport("a", pn.def.x - 1.2, pn.def.z, Math.PI / 2); settle(w, 0.4); w.takeEvents();
  const a0 = p.aura;
  w.action("a", { a: "use", prop: pn.def.id });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "piano"));
  assert.ok(ev.some((e) => e.t === "noise" && e.r >= RESTO.pianoNoise));
  assert.equal(p.aura - a0, RESTO.pianoAura);
  w.resetCity(false);
  assert.ok([...w.props.props.values()].filter((x) => ["cloakroom", "dessertcart", "chefstable", "kitchen", "piano"].includes(x.def.kind)).every((x) => x.ready), "restocked at dawn");
});

test("C5c.2 the climb round the back really works: crate -> boxes -> over the parapet gap onto the roof", () => {
  const { w, p, c } = clubWorld();
  w.debugTeleport("a", 23.2, 57.0, 0); p.move.y = 0.15; settle(w, 0.3); // (standing on the pavement)
  // (walk + hop at each ledge; stop once you're standing on top of the next one)
  const go = (yaw: number, s: number, top: number) => { for (let i = 0; i < s * 60; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw, jump: i % 20 < 10 })]); w.tick(); if (p.move.grounded && p.move.y > top - 0.05) return; } };
  go(0, 3, 1.6); // north onto the crate
  assert.ok(p.move.y > 1.4, `on the crate (y ${p.move.y.toFixed(2)})`);
  w.debugTeleport("a", 22.8, 58.7, 0); p.move.y = 1.6; settle(w, 0.2); // (from the crate's corner by the stack)
  go(0, 3, 3.4); // north onto the boxes
  assert.ok(p.move.y > 3.2, `on the boxes (y ${p.move.y.toFixed(2)})`);
  w.debugTeleport("a", 22.3, 60.0, -Math.PI / 2); p.move.y = 3.4; settle(w, 0.2);
  go(-Math.PI / 2, 3, w.arena.resto!.roofY); // west through the gap onto the roof
  assert.ok(p.move.y > c.roofY - 0.1 && p.move.x < c.rect.maxX, `on the roof (y ${p.move.y.toFixed(2)}, x ${p.move.x.toFixed(1)})`);
  // and the stairs inside: walk straight up them from the dance floor to the roof
  const st = w.arena.resto!.stairs;
  w.debugTeleport("a", st.minX - 0.6, (st.minZ + st.maxZ) / 2, Math.PI / 2); p.move.y = 0.18; settle(w, 0.2);
  for (let i = 0; i < 6 * 60 && p.move.y < w.arena.resto!.roofY - 0.1; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: Math.PI / 2 })]); w.tick(); }
  assert.ok(p.move.y > w.arena.resto!.roofY - 0.2, `walked up the stairs (y ${p.move.y.toFixed(2)})`);
});

// ============================================================================ C5c.3: THE COMPACTOR + PAWN-O-RAMA
import { CLUB, CLUB_SAFE, PAWN_SHOP, clubFloorY, applyClubFloor, onRoadAt } from "../src/index.js";
function compactor() {
  const w = new World({ seed: 5, npcs: 0 });
  const p = w.addPlayer("a", "A");
  const c = w.arena.club!;
  return { w, p, c };
}
const cprop = (w: World, kind: string) => [...w.props.props.values()].find((x) => x.def.kind === kind)!;
const facing = (w: World, kind: string, dist = 1.1, y?: number) => {
  const ps = cprop(w, kind);
  w.debugTeleport("a", ps.def.x + Math.sin(ps.def.yaw) * dist, ps.def.z + Math.cos(ps.def.yaw) * dist, ps.def.yaw + Math.PI);
  if (y !== undefined) w.players.get("a")!.move.y = y;
  return ps;
};

test("C5c.3 THE COMPACTOR: in Old Brick on Crooked St: hall + backstage wing, crusher-bed floor, DJ crane cab, bar, balcony, safe, stack, roof stash, Big Crunch; the lawyers moved uptown", () => {
  const c = buildTrashington();
  assert.ok(c.club && tierAt(c.club.rect.minZ) === 1, "Old Brick (medium)");
  for (const k of ["clubrope", "djdecks", "clubbar", "clubsafe", "rider", "lockers", "sortbin", "vipbooth"]) assert.equal(c.props!.filter((p) => p.kind === k).length, 1, k);
  assert.ok(c.posts!.some((p) => p.kind === "bouncer"));
  assert.ok(c.props!.some((p) => p.kind === "stash" && p.loot?.[0] === "golden_record"), "the Golden Record");
  assert.equal(c.pumpBoxes!.length, 1, "one crusher bed");
  assert.ok(c.boxes[c.pumpBoxes![0]].pump, "it pumps");
  assert.ok(c.boxes.some((b) => b.belt), "a conveyor");
  assert.ok(!c.units!.some((u) => u.name === "THE SWEATBOX" || u.name === "THE DIVE"), "the two empty shutters are gone");
  const law = c.units!.find((u) => u.name === "LAWYERS 4 LESS")!;
  assert.ok(law && tierAt(law.rect.minZ) === 2, "the lawyers are uptown now");
  // nothing of the club pokes into the road
  for (const b of c.boxes) if (inRect(c.club.rect, b.x, b.z)) assert.ok(!onRoadAt(c, b.x, b.z), `box at ${b.x},${b.z} on a road`);
});

test("C5c.3 the crusher bed: bobs to the beat under step height, THE DROP builds it up, holds, slams it down; a launch when the slam ends", () => {
  for (let t = 0; t < 30; t += 0.07) { const y = clubFloorY(t, -999); assert.ok(y >= CLUB.base - 1e-6 && y <= CLUB.base + CLUB.bob + 1e-6 && y < 0.18 + PLAYER.stepHeight, `beat y ${y}`); }
  assert.ok(clubFloorY(100 + CLUB.build * 0.5, 100) > CLUB.base + CLUB.bob, "building up");
  assert.ok(Math.abs(clubFloorY(100 + CLUB.build + 0.2, 100) - CLUB.top) < 1e-6, "held at the top");
  assert.ok(clubFloorY(100 + CLUB.build + CLUB.hold + CLUB.slam * 0.99, 100) < 0.2, "slammed down");
  const { w, p, c } = compactor();
  const f = c.floor;
  // stand on the floor; wait for a drop: the floor carries you up, and at the slam you go flying
  w.debugTeleport("a", (f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, 0);
  const idle = () => { w.pushInputs("a", [inp(p.lastSeq + 1, {})]); w.tick(); };
  for (let i = 0; i < 30; i++) idle();
  assert.ok(p.move.y >= CLUB.base - 0.02, `standing on the bed (y ${p.move.y.toFixed(2)})`);
  w.clubB = w.traffic.clock + 0.05; // (a drop starts now)
  let top = 0, launched = false, peak = 0;
  for (let i = 0; i < (CLUB.build + CLUB.hold + CLUB.slam + 2) * 60; i++) {
    idle();
    if (w.traffic.clock - w.clubB < CLUB.build + CLUB.hold) top = Math.max(top, p.move.y);
    peak = Math.max(peak, p.move.y);
    if (w.takeEvents().some((e) => e.t === "clubDrop" && e.n >= 1)) launched = true;
  }
  assert.ok(top > CLUB.top - 0.1, `rode the floor up (y ${top.toFixed(2)})`);
  assert.ok(launched, "THE DROP launched somebody");
  assert.ok(peak > CLUB.top + 0.5, `went flying (peak ${peak.toFixed(2)})`);
  // the floor's collision follows the clock
  const b = w.arena.boxes[w.arena.pumpBoxes![0]];
  applyClubFloor(w.arena, 500 + CLUB.build + 0.3, 500);
  assert.ok(Math.abs(b.y + b.h / 2 - CLUB.top) < 1e-6);
});

test("C5c.3 Big Crunch: no cover = back on the pavement; $15 cover (into the safe) or a VIP (5 aura / a wristband) gets you in; knocked out = open; stamps end at dawn", () => {
  const { w, p, c } = compactor();
  const front = () => { w.debugTeleport("a", c.out.x + 0.8, (c.door.minZ + c.door.maxZ) / 2, -Math.PI / 2); p.move.y = 0.15; settle(w, 0.3); w.takeEvents(); };
  front();
  let ev = walkInto(w, "a", -Math.PI / 2, 3);
  assert.ok(ev.some((e) => e.t === "bounced" && e.reason === "cover"), "no cover, no entry");
  assert.ok(p.move.x > c.door.minX, `still outside (x ${p.move.x.toFixed(1)})`);
  const rope = facing(w, "clubrope", 1.0); p.move.y = 0.15; settle(w, 0.3); w.takeEvents();
  w.action("a", { a: "use", prop: rope.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "coverNo" && e.reason === "broke"));
  p.cash = 40;
  w.action("a", { a: "use", prop: rope.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "cover" && e.paid === CLUB.cover && !e.vip));
  assert.equal(p.cash, 40 - CLUB.cover);
  assert.equal(w.clubPot, CLUB.cover, "the cover goes in the safe");
  front();
  ev = walkInto(w, "a", -Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced") && p.move.x < c.door.minX, `stamped, in (x ${p.move.x.toFixed(1)})`);
  w.resetCity(false);
  assert.equal(w.clubPass.size, 0, "stamps wash off at dawn");
  assert.equal(w.clubPot, 0);
  // VIP: 5 aura
  p.aura = CLUB.vipAura; front();
  ev = walkInto(w, "a", -Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced") && p.move.x < c.door.minX, "VIP");
  // a wristband does it too
  p.aura = 0; front();
  const band = w.placeItem("vip_wristband", p.move.x, 0.3, p.move.z);
  w.action("a", { a: "grab", item: band }); settle(w, 0.5);
  assert.ok(w.clubVip(p), "wristband = VIP");
  // knocked out: open to all
  w.dropAll(p); settle(w, 0.3);
  for (const it of [...w.items.values()]) if (it.type === "vip_wristband") w.items.delete(it.id);
  const bc = [...w.npc.npcs.values()].find((n) => n.kind === "bouncer")!;
  assert.ok(bc, "Big Crunch is there");
  bc.state = "ko"; bc.stateT = 60;
  front();
  ev = walkInto(w, "a", -Math.PI / 2, 3);
  assert.ok(!ev.some((e) => e.t === "bounced") && p.move.x < c.door.minX, "walked past the snoozing bouncer");
});

test("C5c.3 the trash conveyor: crouch on it at the dock and it carries you under the flap into the sorting room (standing, the flap stops you)", () => {
  const { w, p, c } = compactor();
  const b = c.belt, mid = (b.minZ + b.maxZ) / 2;
  // standing: the belt pushes you against the wall over the flap
  w.debugTeleport("a", b.minX + 1.0, mid, Math.PI / 2); p.move.y = c.beltY;
  for (let i = 0; i < 6 * 60; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: Math.PI / 2 })]); w.tick(); }
  assert.ok(p.move.x > b.minX + 3, `the belt carried you along (x ${p.move.x.toFixed(2)})`);
  assert.ok(p.move.x < c.rect.minX, `stopped at the flap standing up (x ${p.move.x.toFixed(2)})`);
  // crouching: under the flap and inside
  w.debugTeleport("a", b.minX + 1.0, mid, Math.PI / 2); p.move.y = c.beltY; settle(w, 0.1);
  for (let i = 0; i < 8 * 60 && p.move.x < c.wing.minX + 1; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { crouch: true, yaw: Math.PI / 2 })]); w.tick(); }
  assert.ok(inRect(c.wing, p.move.x, p.move.z), `carried into the sorting room (x ${p.move.x.toFixed(2)}, z ${p.move.z.toFixed(2)})`);
});

test("C5c.3 the climb: dock -> bale -> bale stack -> the back roof; the maintenance door onto the balcony; the staff stairs; the service stair to the roof", () => {
  const { w, p, c } = compactor();
  const go = (yaw: number, s: number, top: number) => { for (let i = 0; i < s * 60; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw, jump: i % 20 < 10 })]); w.tick(); if (p.move.grounded && p.move.y > top - 0.05) return; } };
  const tops = w.arena.boxes.filter((x) => x.deco === "bale" && x.x < c.rect.minX).sort((a, b) => a.h - b.h);
  assert.equal(tops.length, 2);
  w.debugTeleport("a", -84.2, -23.0, Math.PI); p.move.y = 0.9; settle(w, 0.2); // (on the dock)
  go(Math.PI, 3, tops[0].h);
  assert.ok(p.move.y > tops[0].h - 0.1, `on the first bale (y ${p.move.y.toFixed(2)})`);
  w.debugTeleport("a", tops[0].x + 0.3, tops[0].z - 0.4, Math.PI / 2 + 0.5); p.move.y = tops[0].h; settle(w, 0.2);
  go(Math.PI / 2 + 0.5, 3, tops[1].h);
  assert.ok(p.move.y > tops[1].h - 0.1, `on the bale stack (y ${p.move.y.toFixed(2)})`);
  w.debugTeleport("a", tops[1].x + 0.2, tops[1].z, Math.PI / 2); p.move.y = tops[1].h; settle(w, 0.2);
  go(Math.PI / 2, 3, c.wingY);
  assert.ok(p.move.y > c.wingY - 0.1 && p.move.x > c.rect.minX, `on the back roof (y ${p.move.y.toFixed(2)}, x ${p.move.x.toFixed(1)})`);
  // across the back roof and through the maintenance door onto the balcony
  w.debugTeleport("a", -76.5, -11.0, Math.PI / 2); p.move.y = c.wingY; settle(w, 0.2);
  walkInto(w, "a", Math.PI / 2, 1.5);
  assert.ok(inRect(c.balcony, p.move.x, p.move.z) && p.move.y > c.balconyY - 0.1, `on the balcony (x ${p.move.x.toFixed(1)}, y ${p.move.y.toFixed(2)})`);
  // the balcony to the crane cab
  w.debugTeleport("a", -69.5, -12.0, Math.PI); p.move.y = c.balconyY; settle(w, 0.2);
  walkInto(w, "a", Math.PI, 0.8);
  assert.ok(inRect(c.cab, p.move.x, p.move.z) && p.move.y > c.cabY - 0.1, `in the crane cab (z ${p.move.z.toFixed(1)}, y ${p.move.y.toFixed(2)})`);
  // the public stairs: hall floor -> balcony
  w.debugTeleport("a", -65.1, -20.6, 0); p.move.y = 0.18; settle(w, 0.2);
  for (let i = 0; i < 4 * 60 && p.move.y < c.balconyY - 0.1; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: 0 })]); w.tick(); }
  assert.ok(p.move.y > c.balconyY - 0.15, `up the stairs to the balcony (y ${p.move.y.toFixed(2)})`);
  // the staff stairs: stair room -> back roof
  w.debugTeleport("a", -80.9, -16.0, 0); p.move.y = 0.18; settle(w, 0.2);
  for (let i = 0; i < 4 * 60 && p.move.y < c.wingY - 0.1; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: 0 })]); w.tick(); }
  assert.ok(p.move.y > c.wingY - 0.15, `up the staff stairs (y ${p.move.y.toFixed(2)})`);
  // the service stair on the back roof: up to the hall's roof
  w.debugTeleport("a", -75.9, -31.6, 0); p.move.y = c.wingY; settle(w, 0.2);
  for (let i = 0; i < 4 * 60 && p.move.y < c.roofY - 0.1; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { mz: 1, yaw: 0 })]); w.tick(); }
  assert.ok(p.move.y > c.roofY - 0.15, `up the service stair (y ${p.move.y.toFixed(2)})`);
  walkInto(w, "a", Math.PI / 2, 1);
  assert.ok(p.move.x > -74.8 && p.move.y > c.roofY - 0.1, `onto the hall's roof (x ${p.move.x.toFixed(1)})`);
});

test("C5c.3 the DJ's decks: +3 aura, a roar, the DROP starts now (then they cool down); the bar, the rider, the lockers, the bins, the VIP booth give things", () => {
  const { w, p, c } = compactor();
  settle(w, 1);
  w.clubB = w.traffic.clock - 30; // (between drops)
  const decks = facing(w, "djdecks", 1.0, c.cabY); settle(w, 0.3); w.takeEvents();
  const a0 = p.aura;
  w.action("a", { a: "use", prop: decks.def.id });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "djHijack"));
  assert.ok(ev.some((e) => e.t === "noise" && e.r >= CLUB.djNoise));
  assert.equal(p.aura - a0, CLUB.djAura);
  assert.ok(Math.abs(w.clubB - w.traffic.clock) < 0.05, "the drop starts building now");
  w.action("a", { a: "use", prop: decks.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"), "cooling down");
  for (const k of ["clubbar", "rider", "lockers", "sortbin", "vipbooth"]) {
    const ps = cprop(w, k);
    const y = k === "vipbooth" ? c.balconyY : 0.18;
    w.debugTeleport("a", ps.def.x + Math.sin(ps.def.yaw) * 1.2, ps.def.z + Math.cos(ps.def.yaw) * 1.2, ps.def.yaw + Math.PI); p.move.y = y; settle(w, 0.3); w.takeEvents();
    w.action("a", { a: "use", prop: ps.def.id });
    assert.ok(w.takeEvents().some((e) => e.t === "search" && e.found >= 1), `${k}: found something`);
  }
});

test("C5c.3 the safe: hold E 6 s: a fat bag of cash = $40 + every cover charge paid today; the alarm, heat, Big Crunch comes for you", () => {
  const { w, p } = compactor();
  w.clubPot = 45;
  const safe = cprop(w, "clubsafe");
  w.debugTeleport("a", safe.def.x + 0.9, safe.def.z, -Math.PI / 2); p.move.y = 0.18; settle(w, 0.3); w.takeEvents();
  w.action("a", { a: "use", prop: safe.def.id });
  assert.ok(p.rob, "cracking it");
  const ev: WorldEvent[] = [];
  for (let i = 0; i < 7 * 60; i++) { w.tick(); ev.push(...w.takeEvents()); }
  const cracked = ev.find((e) => e.t === "safeCracked") as any;
  assert.ok(cracked && cracked.value === CLUB_SAFE.base + 45, `cracked: $${cracked?.value}`);
  assert.ok([...w.items.values()].some((it) => it.type === "cash_bag" && it.value === CLUB_SAFE.base + 45), "the bag holds the takings");
  assert.equal(w.clubPot, 0);
  assert.ok(p.notoriety >= CLUB_SAFE.heat - 1, `heat ${p.notoriety}`);
  assert.ok(ev.some((e) => e.t === "alarm"));
});

test("C5c.3 PAWN-O-RAMA: in the Yards; fence (40%), pawn (30% now, buy back 40% before dawn), unclaimed = on sale (70%) to anybody; a smashed case spills everything and Big Vinnie comes", () => {
  const w = new World({ seed: 6, npcs: 0 });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  const ps = w.arena.pawnShop!;
  assert.ok(ps && tierAt(w.arena.units![ps.unit].rect.minZ) === 0, "The Yards (low)");
  assert.equal(w.arena.units![ps.unit].name, "PAWN-O-RAMA");
  assert.ok(w.arena.posts!.some((x) => x.kind === "vinnie"));
  const counter = cprop(w, "pawncounter"), cs = cprop(w, "pawncase");
  const hold = (pl: typeof a, type: string, value: number) => {
    const id = w.placeItem(type, pl.move.x, pl.move.y + 0.3, pl.move.z);
    w.items.get(id)!.value = value;
    w.action(pl.id, { a: "grab", item: id }); settle(w, 0.5);
    const slot = pl.pockets.indexOf(id);
    if (slot >= 0) w.action(pl.id, { a: "select", slot });
    assert.equal(w.activeItem(pl)?.item.id, id, `${pl.id} holds the ${type}`);
  };
  const stand = (pl: typeof a, prop: typeof counter) => { w.debugTeleport(pl.id, prop.def.x + Math.sin(prop.def.yaw) * 1.3, prop.def.z + Math.cos(prop.def.yaw) * 1.3, prop.def.yaw + Math.PI); pl.move.y = 0.18; settle(w, 0.3); w.takeEvents(); };
  // fence: empty hands = no; with something = 40% on the spot
  stand(a, counter);
  w.action("a", { a: "use", prop: counter.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "pawnNo" && e.reason === "hands"));
  hold(a, "gold_chain", 100);
  w.action("a", { a: "use", prop: counter.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "fenced" && e.cash === 40));
  assert.equal(a.cash, 40); assert.equal(w.activeItem(a), null);
  // pawn: 30% now, it's in the case with A's colour
  stand(a, cs);
  hold(a, "rolecks_watch", 200);
  w.action("a", { a: "use", prop: cs.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "pawned" && e.cash === 60));
  assert.equal(a.cash, 100);
  let note = JSON.parse(w.props.stateOf(cs.def.id).note);
  assert.equal(note.length, 1); assert.equal(note[0].t, "rolecks_watch"); assert.equal(note[0].p, 80); assert.equal(note[0].o, "a");
  // B can't buy it before dawn (it's A's to buy back); A buys it back for 40%
  stand(b, cs); b.cash = 500;
  w.action("b", { a: "use", prop: cs.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "pawnNo" && e.reason === "nothing"));
  stand(a, cs);
  w.action("a", { a: "use", prop: cs.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "redeemed" && e.cash === 80 && !e.sale));
  assert.equal(a.cash, 20);
  assert.ok([...w.items.values()].some((it) => it.type === "rolecks_watch" && it.value === 200), "got it back (same value)");
  // pawn again; dawn comes; now it's on sale to anybody at 70%
  for (const it of [...w.items.values()]) if (it.type === "rolecks_watch") w.items.delete(it.id);
  stand(a, cs); hold(a, "rolecks_watch", 200);
  w.action("a", { a: "use", prop: cs.def.id }); w.takeEvents();
  w.resetCity(false);
  note = JSON.parse(w.props.stateOf(cs.def.id).note);
  assert.equal(note[0].s, 1, "on sale"); assert.equal(note[0].p, 140);
  stand(b, cs);
  w.action("b", { a: "use", prop: cs.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "redeemed" && e.sale && e.cash === 140));
  assert.equal(b.cash, 360);
  // smash: fill the case, punch it 3 times: everything spills, heat, Vinnie comes swinging
  for (const [t, v] of [["laptop", 80], ["guitar", 40]] as [string, number][]) { stand(a, cs); hold(a, t, v); w.action("a", { a: "use", prop: cs.def.id }); }
  w.takeEvents();
  const before = w.items.size;
  stand(b, cs);
  const vin = [...w.npc.npcs.values()].find((n) => n.kind === "vinnie")!;
  assert.ok(vin, "Big Vinnie is in");
  for (let i = 0; i < 3; i++) { w.props.smash(b, cs.def.id); }
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "caseSmashed"));
  assert.equal(w.items.size - before, 2, "both things spilled out");
  assert.equal(w.pawn.caseNote(), "", "the case is empty");
  assert.ok(b.notoriety >= PAWN_SHOP.smashHeat - 1);
  assert.equal(vin.state, "chase"); assert.equal(vin.target, "b");
  w.action("a", { a: "use", prop: cs.def.id });
  assert.ok(w.takeEvents().some((e) => e.t === "empty"), "a broken case: no business till dawn");
});

// ---------------------------------------------------------------- R3: angled walls in the world (cops, walkers, spray tags)
import { rotBox as rotBoxW, footSd as footSdW } from "../src/index.js";
test("R3 angled walls: cops can't see through one, walkers can't walk through one, and you can tag its angled face", () => {
  const { w, p } = c4World();
  const T = w.arena.landmarks!.testYard;
  // a wall turned 45 degrees in the build yard: its face toward (T.x + 2, T.z - 2) looks south-east
  const wall = rotBoxW(T.x, T.z, 8, 1.2, -Math.PI / 4, 4, "wall"); // (yaw -45: it runs south-west to north-east)
  w.arena.boxes = [...w.arena.boxes, wall];
  const n = 0.7071;
  // the cops' line of sight: through the wall (blocked) and past its end (clear)
  assert.equal(w.police.los(T.x + 2, 1.6, T.z - 2, T.x - 2, 1.6, T.z + 2), false, "seen through the angled wall");
  assert.equal(w.police.los(T.x + 6, 1.6, T.z - 2, T.x + 6, 1.6, T.z + 6), true, "clear past its end");
  // pedestrians' straight-line check
  assert.equal(w.npc.lineClear(T.x + 2, T.z - 2, T.x - 2, T.z + 2, 0), false, "walkers can't cut through it");
  // spray a tag on the angled face, standing in front of it
  giveCan(w);
  w.debugTeleport("a", T.x + 1.1, T.z - 1.1, -Math.PI * 3 / 4);
  settle(w, 0.3);
  const fx = T.x + 0.6 * n, fz = T.z - 0.6 * n; // (the face is 0.6 m out from the middle line; the cops look every 0.7 m, so walls this thick)
  assert.ok(Math.abs(footSdW(wall, fx, fz).d) < 0.02, "the point is on the face");
  w.action("a", { a: "tagStart" });
  settle(w, TAG.hold + 0.1);
  w.action("a", { a: "tag", x: fx, y: 1.4, z: fz, nx: n, nz: -n } as never);
  const tag = [...w.tags.values()].find((t) => t.by === "a");
  assert.ok(tag, "tagged the angled wall");
  assert.ok(Math.abs(tag!.nx - n) < 0.01 && Math.abs(tag!.nz + n) < 0.01, `the tag lies flat on the face (normal ${tag!.nx.toFixed(2)}, ${tag!.nz.toFixed(2)})`);
  void p;
});

// ---------------------------------------------------------------- R5: HOT STUFF PAWN & LOAN (the new city)
function hotWorld(players = 2, seed = 5) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.resetCity(false);
  w.takeEvents();
  return { w, ps, hs: arena.hotShops![0], shops: arena.hotShops! };
}
function holdNew(w: World, pl: { id: string; move: { x: number; y: number; z: number }; pockets: string[] }, type: string, value: number) {
  const id = w.placeItem(type, pl.move.x, pl.move.y + 0.3, pl.move.z);
  w.items.get(id)!.value = value;
  w.action(pl.id, { a: "grab", item: id }); settle(w, 0.4);
  const slot = pl.pockets.indexOf(id);
  if (slot >= 0) w.action(pl.id, { a: "select", slot });
  assert.equal(w.activeItem(pl as never)?.item.id, id, `holds the ${type}`);
  return id;
}
const inR = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number, m = 0) => x >= r.minX - m && x <= r.maxX + m && z >= r.minZ - m && z <= r.maxZ + m;
const meat = (w: World, kind = "meat_locker") => [...w.npc.npcs.values()].find((n) => n.kind === kind)!;
const louN = (w: World, kind = "lou") => [...w.npc.npcs.values()].find((n) => n.kind === kind)!;
const shopProp = (w: World, kind: string, shop: number) => [...w.props.props.values()].find((p) => p.def.kind === kind && p.def.shop === shop)!;

test("R7 the two pawn shops: each owner buys over the till (40%), each has their own 3 wanted things (x3, the first of each), and mutters them only to whoever walks up", () => {
  const { w, ps: [a, b], shops } = hotWorld();
  assert.equal(shops.length, 2);
  assert.ok(louN(w, "lou") && louN(w, "fran") && meat(w, "meat_locker") && meat(w, "cold_cuts"), "Lou, Fran, Meat Locker and Cold Cuts are in");
  assert.equal(w.pawn.lists.length, 2);
  assert.ok(w.pawn.lists.every((l) => l.hot.length === 3), "3 wanted each");
  assert.ok(!w.pawn.lists[0].hot.some((t) => w.pawn.lists[1].hot.includes(t)), "different lists");
  for (const hs of shops) {
    const i = hs.idx, till = shopProp(w, "pawncounter", i);
    assert.ok(Math.hypot(till.def.x - hs.stand.x, till.def.z - hs.stand.z) < 1, "the till is by the stand");
    a.cash = 0;
    w.debugTeleport(b.id, 40, -95, 0);
    w.debugTeleport(a.id, hs.stand.x, hs.stand.z, 0); a.move.y = 0.18;
    settle(w, 0.3);
    const told = w.takeEvents().filter((e) => e.t === "louList") as Extract<WorldEvent, { t: "louList" }>[];
    assert.equal(told.length, 1, `shop ${i}: told once`); assert.equal(told[0].p, a.id, "only to A"); assert.equal(told[0].shop, i);
    assert.deepEqual(told[0].types, w.pawn.wanted(i));
    holdNew(w, a, "gold_chain", 100);
    w.action(a.id, { a: "use", prop: till.def.id });
    assert.ok(w.takeEvents().some((e) => e.t === "fenced" && e.cash === 40 && !e.hot), "40% on the spot"); assert.equal(a.cash, 40);
    const want = w.pawn.lists[i].hot[0];
    holdNew(w, a, want, 50);
    w.action(a.id, { a: "use", prop: till.def.id });
    assert.ok(w.takeEvents().some((e) => e.t === "fenced" && e.cash === 150 && e.hot), "x3"); assert.equal(a.cash, 190);
    holdNew(w, a, want, 50);
    w.action(a.id, { a: "use", prop: till.def.id });
    assert.ok(w.takeEvents().some((e) => e.t === "fenced" && e.cash === 20 && !e.hot), "already got one");
    assert.ok(!w.pawn.wanted(i).includes(want), "crossed off");
  }
  // a new scavenge: new lists, everybody's told again
  const old = w.pawn.lists.map((l) => l.hot.join()).join("|");
  let changed = false;
  for (let i = 0; i < 4 && !changed; i++) { w.resetCity(true); changed = w.pawn.lists.map((l) => l.hot.join()).join("|") !== old; }
  assert.ok(changed, "new lists");
  w.takeEvents(); w.debugTeleport(a.id, shops[1].stand.x, shops[1].stand.z, 0); a.move.y = 0.18; settle(w, 0.3);
  assert.ok(w.takeEvents().some((e) => e.t === "louList" && e.p === a.id && e.shop === 1));
});

test("R7 the bouncers: nothing to rob, so walking about, lingering and picking things up is fine; punch the owner, throw stuff at them or smash a glass counter and he comes; one hit = out cold 6 s, everything dropped, thrown out", () => {
  for (const shop of [0, 1]) for (const why of ["fine", "punch", "smash", "throw"] as const) {
    const { w, ps: [a], shops } = hotWorld(1);
    const hs = shops[shop], g = meat(w, hs.bouncer), boss = louN(w, hs.owner);
    w.takeEvents();
    if (why === "fine") {
      w.debugTeleport(a.id, hs.stand.x, hs.stand.z, 0); a.move.y = 0.18; settle(w, 30);
      const id = w.placeItem("gold_chain", hs.stand.x + 0.6, 0.5, hs.stand.z); settle(w, 0.6);
      w.action(a.id, { a: "grab", item: id }); settle(w, 0.5);
      assert.equal(g.state, "work", `shop ${shop}: hanging about and picking things up is fine (${g.state})`);
      continue;
    }
    if (why === "punch") {
      w.debugTeleport(a.id, hs.stand.x, hs.stand.z, 0); a.move.y = 0.18; settle(w, 0.2);
      w.npc.hit(boss.id, a.id, a.move.x, a.move.z); settle(w, 0.2);
    } else if (why === "smash") {
      const c = hs.counters[2] ?? hs.counters[0];
      const cs = [...w.props.props.values()].find((p) => p.def.kind === "glasscounter" && Math.hypot(p.def.x - (c.minX + c.maxX) / 2, p.def.z - (c.minZ + c.maxZ) / 2) < 0.1)!;
      const side = Math.sign(hs.door.x) || 1; // (stand on the shop-floor side of the side case)
      const x = side < 0 ? c.minX - 0.6 : c.maxX + 0.6;
      w.debugTeleport(a.id, x, (c.minZ + c.maxZ) / 2, side < 0 ? Math.PI / 2 : -Math.PI / 2); a.move.y = 0.18; settle(w, 0.2);
      for (let i = 0; i < 3; i++) { w.props.smash(a, cs.def.id); settle(w, 0.4); }
    } else {
      w.debugTeleport(a.id, hs.stand.x, hs.stand.z, 0); a.move.y = 0.18; settle(w, 0.2);
      holdNew(w, a, "brick", 1);
      a.move.yaw = 0;
      w.action(a.id, { a: "throw", charge: 0.35, yaw: 0, pitch: -0.05 }); settle(w, 1.2);
    }
    const ev = w.takeEvents();
    assert.ok((g.state === "chase" && g.target === a.id) || a.move.knockT > 0, `shop ${shop}, ${why}: ${hs.bouncer} comes (${g.state}; ${ev.filter((e) => e.t === "pawnTrouble" || e.t === "smash").map((e) => JSON.stringify(e)).join(" ")})`);
  }
  // his punch: out cold for 6 s, everything you carry flies, you sail backwards
  const { w, ps: [a], hs } = hotWorld(1);
  const g = meat(w);
  w.debugTeleport(a.id, hs.stand.x - 1, hs.stand.z - 1, 0); a.move.y = 0.18;
  holdNew(w, a, "gold_chain", 100); const pocket = w.placeItem("mixtape", a.move.x, 0.5, a.move.z); w.action(a.id, { a: "grab", item: pocket }); settle(w, 0.3);
  w.pawn.trouble(a, "punch", 0);
  let hit = false, t = 0;
  for (; t < 20 && !hit; t += 1 / 60) { w.tick(); if (a.move.knockT > 0) hit = true; }
  assert.ok(hit, `he got to you (${g.state}, ${g.move.x.toFixed(1)},${g.move.z.toFixed(1)})`);
  assert.ok(a.move.knockT >= 5.9, `out cold ${a.move.knockT.toFixed(1)} s`);
  assert.ok(!a.hand && a.pockets.every((s) => !s), "dropped everything");
  assert.ok(Math.hypot(a.move.vx, a.move.vz) > 5, "sent flying");
  // and he follows you out of the shop (through the door, not the wall)
  const { w: w2, ps: [c], hs: h2 } = hotWorld(1);
  const g2 = meat(w2);
  w2.debugTeleport(c.id, h2.out.x - 6, h2.out.z - 2, 0); c.move.y = 0.18; settle(w2, 0.2);
  w2.pawn.trouble(c, "throw", 0);
  let caught = false;
  for (let i = 0; i < 20 * 60 && !caught; i++) { w2.tick(); c.move.vx = c.move.vz = 0; if (c.move.knockT > 0) caught = true; }
  assert.ok(caught, `out of the shop after you (${g2.state} at ${g2.move.x.toFixed(1)},${g2.move.z.toFixed(1)})`);
});

test("R5/R7 the bouncer can be beaten: heaps of punches, out cold 40 s, then he's back at his post", () => {
  const { w, ps: [a], hs } = hotWorld(1);
  const g = meat(w);
  let n = 0;
  a.move.immuneT = 1e9; // (so his swings can't stop the test)
  while (g.state !== "ko" && n < 60) { g.state = "work"; w.npc.hit(g.id, a.id, g.move.x, g.move.z - 1); n++; settle(w, 0.25); }
  assert.equal(g.state, "ko"); assert.ok(n >= 28, `${n} punches (R6: heaps stronger)`);
  settle(w, 30); assert.equal(g.state, "ko", "still out at 30 s");
  settle(w, 12);
  assert.notEqual(g.state, "ko"); assert.equal(g.hp, 30, "back to full health");
  settle(w, 8);
  assert.ok(Math.hypot(g.move.x - hs.guard.x, g.move.z - hs.guard.z) < 1, "back at his post");
});

// ---------------------------------------------------------------- R6: the new station's holding cell
test("R6 holding cell: busted = in the one shared cell, free to walk about; E at the door starts picking (and you can step away); the toilet erupts and knocks everyone in the cell back", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const h = w.arena.station!.holding!;
  for (const p of [a, b]) { p.notoriety = 60; w.police.bust(p, "test", false); }
  for (const p of [a, b]) { assert.ok(p.jailT > 0 && inR(h.cell, p.move.x, p.move.z), `${p.id} in the cell`); assert.equal(p.lock, null, "not picking yet"); }
  // walk about
  const x0 = a.move.x;
  for (let i = 0; i < 40; i++) { w.pushInputs(a.id, [{ seq: a.lastSeq + 1, mx: 0, mz: 1, yaw: Math.PI / 2, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); w.tick(); }
  assert.ok(Math.abs(a.move.x - x0) > 1, "walks about the cell");
  assert.ok(inR(h.cell, a.move.x, a.move.z, 0.5), "still inside");
  // the door: start picking, step away
  const door = cprop(w, "celldoor");
  w.debugTeleport(a.id, h.door.x + 1.0, h.door.z, -Math.PI / 2); a.move.y = 0.18; settle(w, 0.2); w.takeEvents(); // (R7: the bars run along the hallway)
  w.action(a.id, { a: "use", prop: door.def.id });
  assert.ok(a.lock && w.takeEvents().some((e) => e.t === "lockStart" && e.p === a.id), "picking");
  w.action(a.id, { a: "pickStop" } as never);
  assert.equal(a.lock, null, "stepped away");
  // the toilet
  const toilet = cprop(w, "toilet");
  w.debugTeleport(a.id, h.toilet.x - 0.9, h.toilet.z, Math.PI / 2); a.move.y = 0.18; w.debugTeleport(b.id, h.toilet.x - 3, h.toilet.z - 1.5, 0); b.move.y = 0.18;
  settle(w, 0.3); w.takeEvents();
  w.action(a.id, { a: "use", prop: toilet.def.id });
  const ev = w.takeEvents().find((e) => e.t === "flush") as Extract<WorldEvent, { t: "flush" }> | undefined;
  assert.ok(ev && ev.hit.includes(a.id) && ev.hit.includes(b.id), "both soaked");
  assert.ok(Math.hypot(b.move.vx, b.move.vz) > 3 && b.move.vy > 2, "knocked back");
  w.action(a.id, { a: "use", prop: toilet.def.id });
  assert.ok(!w.takeEvents().some((e) => e.t === "flush"), "it has to refill first");
});

test("R6 the Champ: nearly unbeatable (40 punches); his one hit knocks you down and he sits on you till you're up; knock him out and he drops the Spoon of Destiny, which Lou won't buy", () => {
  const { w, ps: [a] } = hotWorld(1);
  const h = w.arena.station!.holding!;
  const champ = [...w.npc.npcs.values()].find((n) => n.kind === "champ")!;
  assert.ok(champ && inR(h.cell, champ.move.x, champ.move.z), "the Champ is in the cell");
  a.notoriety = 60; w.police.bust(a, "test", false);
  w.debugTeleport(a.id, champ.move.x, champ.move.z + 1.1, Math.PI); a.move.y = 0.18; settle(w, 0.2);
  w.action(a.id, { a: "punch", yaw: Math.PI, pitch: 0 } as never);
  let down = false;
  for (let i = 0; i < 6 * 60 && !down; i++) { w.tick(); if (a.move.knockT > 0) down = true; }
  assert.ok(down, `he knocked you down (${champ.state})`);
  assert.ok(a.move.knockT >= 5.5, "for a while");
  settle(w, 0.5);
  assert.equal(champ.state, "sit", "he's sitting on you");
  assert.ok(Math.hypot(champ.move.x - a.move.x, champ.move.z - a.move.z) < 0.6, "right on top of you");
  for (let i = 0; i < 9 * 60 && a.move.knockT > 0; i++) { w.pushInputs(a.id, [{ seq: a.lastSeq + 1, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); w.tick(); } // (time passes for you as your inputs arrive)
  settle(w, 0.3);
  assert.notEqual(champ.state, "sit", `up you get, off he gets (knockT ${a.move.knockT.toFixed(1)}, ${champ.state})`);
  // knock him out (it takes a gang)
  let n = 0; a.move.immuneT = 1e9;
  while ((champ.state as string) !== "ko" && n < 80) { champ.state = "work"; w.npc.hit(champ.id, a.id, champ.move.x, champ.move.z + 1); n++; settle(w, 0.1); }
  assert.equal(champ.state, "ko"); assert.ok(n >= 38, `${n} punches`);
  settle(w, 0.8);
  const spoon = [...w.items.values()].find((it) => it.type === "golden_spoon");
  assert.ok(spoon, "the Spoon of Destiny");
  assert.ok(lootDef("golden_spoon").blackMarket && lootDef("golden_spoon").valueMin >= 2000, "black market only, worth a fortune");
  // Lou won't touch it
  const { w: w2, ps: [c], hs } = hotWorld(1);
  w2.debugTeleport(c.id, hs.stand.x, hs.stand.z, 0); c.move.y = 0.18; settle(w2, 0.2);
  holdNew(w2, c, "golden_spoon", 3000); w2.takeEvents();
  w2.action(c.id, { a: "use", prop: cprop(w2, "pawncounter").def.id });
  assert.ok(w2.takeEvents().some((e) => e.t === "pawnNo" && e.reason === "black"), "Lou won't touch it");
  assert.equal(c.cash, 0);
});

// ---------------------------------------------------------------- R7: the grand station, the city's police presence
import { CHAMP as CHAMP7, PATROL, EVIDENCE_HEAT } from "../src/index.js";
function onDuty(w: World) { const m = w.match as unknown as { phase: string; timeLeft: number }; m.phase = "scavenge"; m.timeLeft = 9999; }

test("R7 the Champ: punches 1 and 2 just nudge him back; the 3rd (inside a few seconds) makes him dizzy, spinning; spaced out, they never add up", () => {
  const { w, ps: [a] } = hotWorld(1);
  const champ = [...w.npc.npcs.values()].find((n) => n.kind === "champ")!;
  a.notoriety = 60; w.police.bust(a, "test", false); // (in the cell with him)
  w.debugTeleport(a.id, champ.move.x, champ.move.z + 1.2, Math.PI); a.move.y = 0.18;
  a.move.immuneT = 1e9;
  const punch = () => { w.npc.hit(champ.id, a.id, champ.move.x, champ.move.z + 1); settle(w, 0.3); };
  punch(); assert.notEqual(champ.state, "stunned", "1: a nudge"); assert.equal(champ.state, "chase", "and he turns on you");
  punch(); assert.notEqual(champ.state, "stunned", "2: a nudge");
  punch(); assert.equal(champ.state, "stunned", "3: dizzy"); assert.ok(champ.stateT > 1.5, `for ${champ.stateT.toFixed(1)} s`);
  settle(w, CHAMP7.dizzy + 0.5);
  assert.notEqual(champ.state, "stunned", "he shakes it off");
  for (let i = 0; i < 4; i++) { champ.state = "work"; punch(); settle(w, CHAMP7.stunWindow + 0.2); assert.notEqual(champ.state, "stunned", `spaced-out punch ${i + 1}: no stun`); }
});

test("R7 the evidence room: busted, your loot goes up onto its shelves; anybody can lift it back, but that's stealing from the police (heat, and the guard comes)", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const g = w.arena.station!.grand!;
  holdNew(w, a, "gold_chain", 120);
  const pk = w.placeItem("mixtape", a.move.x, 0.5, a.move.z); w.action(a.id, { a: "grab", item: pk }); settle(w, 0.3);
  a.notoriety = 60; w.police.bust(a, "test", false);
  settle(w, 1.0);
  const bagged = [...w.items.values()].filter((it) => it.evidence);
  assert.equal(bagged.length, 2, "both things went to evidence");
  for (const it of bagged) assert.ok(inR(g.evidence, it.body.x, it.body.z) && it.body.y > g.upY, `${it.type} on the shelves upstairs (${it.body.x.toFixed(1)},${it.body.y.toFixed(1)},${it.body.z.toFixed(1)})`);
  assert.equal(bagged.find((it) => it.type === "gold_chain")!.value, 120, "still worth the same");
  // the station's cops come on duty: one walks the ground floor, one guards the evidence room
  onDuty(w); settle(w, 2);
  const guard = [...w.npc.npcs.values()].find((n) => n.kind === "cop" && n.beat === 1);
  assert.ok(guard && guard.move.y > 4, "the evidence guard stands upstairs");
  // B sneaks in and lifts the chain
  const chain = bagged.find((it) => it.type === "gold_chain")!;
  w.debugTeleport(b.id, chain.body.x + 0.8, chain.body.z, -Math.PI / 2); b.move.y = g.upY + 0.05; settle(w, 0.3); w.takeEvents();
  w.action(b.id, { a: "grab", item: chain.id }); settle(w, 0.3);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "evidenceLift" && e.p === b.id), "lifted from evidence");
  assert.ok(b.notoriety >= EVIDENCE_HEAT * 0.9, `heat ${b.notoriety}`);
  assert.ok(guard!.state === "chase" && guard!.target === b.id, `the guard comes for you (${guard!.state})`);
});

test("R7 police presence: foot patrols walk the town and cruisers drive round all day; they leave you alone till you're wanted, then chase; afterwards they go back on patrol", () => {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 4, spawnLoot: false, arena });
  const a = w.addPlayer("a", "A");
  w.resetCity(false); onDuty(w);
  w.debugTeleport(a.id, 0, -95, 0);
  settle(w, 20);
  const cops = () => [...w.npc.npcs.values()].filter((n) => n.kind === "cop");
  assert.equal(cops().filter((c) => c.patrol).length, PATROL.foot, "foot patrols");
  assert.equal(w.police.cars.filter((c) => c.patrol).length, PATROL.cars, "cruisers");
  assert.ok(w.police.cars.every((c) => c.mode === "cruise"), "cruising (no sirens)");
  assert.equal(cops().filter((c) => c.beat !== undefined).length, 4, "the station's own four (R8)");
  const p0 = cops().find((c) => c.patrol)!;
  const x0 = p0.move.x, z0 = p0.move.z;
  settle(w, 6);
  assert.ok(Math.hypot(p0.move.x - x0, p0.move.z - z0) > 3, "they walk their beat");
  // stand right in front of one, clean: nothing
  w.debugTeleport(a.id, p0.move.x + 2, p0.move.z, 0); settle(w, 2);
  assert.equal(p0.state, "beat", "a clean bandit is left alone");
  // wanted, in plain sight: they're on you
  w.debugTeleport(a.id, p0.move.x + Math.sin(p0.move.yaw) * 3, p0.move.z + Math.cos(p0.move.yaw) * 3, 0); a.notoriety = 40; a.seenT = w.time; settle(w, 0.6); // (right in front of them)
  assert.ok(((p0.state as string) === "chase" || (p0.state as string) === "windup") && p0.target === a.id, `chased (${p0.state})`);
  // heat gone: back on patrol, not sent home
  a.notoriety = 0; settle(w, 3);
  assert.equal(p0.state, "beat", "back on patrol"); assert.ok(w.npc.npcs.has(p0.id));
  // a cruiser that sees you wanted turns its siren on
  const car = w.police.cars.find((c) => c.patrol)!;
  a.jailT = 0; a.lock = null; a.move.knockT = 0; // (in case that cop already got you)
  w.police.placeCar(car, 30, -87, Math.PI / 2); // (on Gahookz Ghetto Lane, looking east; R12.3b: in its lane)
  w.debugTeleport(a.id, 37, -87, 0); a.notoriety = 65; settle(w, 1.2);
  assert.ok(car.mode !== "cruise" && car.target === a.id, `the cruiser's after you (${car.mode})`);
});

test("R7 the receptionist: punch the front desk (in a police station) and it's heat", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pam = [...w.npc.npcs.values()].find((n) => n.kind === "receptionist")!;
  assert.ok(pam, "Officer Pam at the front desk");
  w.npc.hit(pam.id, a.id, pam.move.x, pam.move.z + 1);
  assert.ok(a.notoriety >= 25, `heat ${a.notoriety}`);
  assert.equal(pam.state, "cower");
});

// ---------------------------------------------------------------- R8: doors, the chief's key, the station's guards
import { CELL_KEY, nearBoxes as nearB } from "../src/index.js";
test("R8 glass doors: E opens and shuts them (shut, you can't walk through); a cop on the way opens a shut door himself", () => {
  const { w, ps: [a] } = hotWorld(1);
  const door = cprop(w, "door");
  const d = door.def, b = w.arena.boxes[d.box!];
  assert.ok(door.ready, "shut to start with");
  assert.ok(nearB(w.arena, d.x, d.z, 0.1).includes(b), "a shut door blocks");
  w.debugTeleport(a.id, d.x, d.z + 1.2, Math.PI); a.move.y = 0.18; settle(w, 0.2); w.takeEvents();
  w.action(a.id, { a: "use", prop: d.id });
  assert.ok(!door.ready && w.takeEvents().some((e) => e.t === "door" && e.open), "opened");
  assert.ok(!nearB(w.arena, d.x, d.z, 0.1).includes(b), "open: walk right through");
  w.action(a.id, { a: "use", prop: d.id });
  assert.ok(door.ready, "shut again");
  // a cop jogging up to it opens it
  const cop = w.police.spawnCop(a, { x: d.x, z: d.z - 1.0 }, true)!;
  cop.move.vx = 0; cop.move.vz = 2;
  a.notoriety = 60; w.debugTeleport(a.id, d.x, d.z + 4, Math.PI); a.move.y = 0.18;
  let opened = false;
  for (let i = 0; i < 4 * 60 && !opened; i++) { w.tick(); if (!door.ready) opened = true; }
  assert.ok(opened, "the cop opened it");
});

test("R8 the chief's key: on the chief's desk each day; lifting it is heat; E at the cell door: it opens for 20 s and whoever walks out is free (wanted); then it shuts", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const g = w.arena.station!.grand!, h = w.arena.station!.holding!;
  const key = [...w.items.values()].find((it) => it.type === "cell_key")!;
  assert.ok(key && Math.hypot(key.body.x - g.keySpot.x, key.body.z - g.keySpot.z) < 0.5, "on the desk");
  // B gets busted; A lifts the key upstairs
  b.notoriety = 60; w.police.bust(b, "test", false);
  w.debugTeleport(a.id, key.body.x - 0.6, key.body.z, Math.PI / 2); a.move.y = g.upY + 0.05; settle(w, 0.4); w.takeEvents();
  w.action(a.id, { a: "grab", item: key.id }); settle(w, 0.2);
  assert.ok(w.takeEvents().some((e) => e.t === "keyLift" && e.p === a.id), "lifted"); assert.ok(a.notoriety >= 30, `heat ${a.notoriety}`);
  a.notoriety = 0;
  // A at the cell door, from the hallway
  const cd = cprop(w, "celldoor");
  w.debugTeleport(a.id, h.door.x - 0.8, h.door.z, Math.PI / 2); a.move.y = 0.18; settle(w, 0.2); w.takeEvents();
  w.action(a.id, { a: "use", prop: cd.def.id });
  assert.ok(!cd.ready && w.takeEvents().some((e) => e.t === "cellOpen"), "the cell's open");
  assert.ok(!w.items.has(key.id), "the key's used up");
  assert.ok(b.jailT > 0, "B's still inside");
  // B walks out through the door
  w.debugTeleport(b.id, h.door.x + 0.6, h.door.z, -Math.PI / 2); b.move.y = 0.18;
  for (let i = 0; i < 2 * 60 && b.jailT > 0; i++) { w.pushInputs(b.id, [{ seq: b.lastSeq + 1, mx: 0, mz: 1, yaw: -Math.PI / 2, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); w.tick(); }
  assert.equal(b.jailT, 0, `walked out (${b.move.x.toFixed(1)},${b.move.z.toFixed(1)})`);
  assert.ok(b.notoriety >= 30, "free, but wanted");
  settle(w, CELL_KEY.open + 0.5);
  assert.ok(cd.ready, "it shuts again");
});

test("R8 four cops guard the station (front doors, the hallway, outside the cell, the evidence room)", () => {
  const { w } = hotWorld(1);
  onDuty(w); settle(w, 3);
  const st = [...w.npc.npcs.values()].filter((n) => n.kind === "cop" && n.beat !== undefined);
  assert.equal(st.length, 4, `${st.length} station cops`);
  assert.ok(st.every((c) => inR(w.arena.station!.rect, c.move.x, c.move.z)), "all inside");
});

test("R9 a station cop who chased you out comes back to his beat afterwards (he isn't sent home)", () => {
  const { w, ps: [a] } = hotWorld(1);
  onDuty(w); settle(w, 3);
  const c = [...w.npc.npcs.values()].find((n) => n.kind === "cop" && n.beat === 0)!;
  assert.ok(c, "the hallway cop");
  // he chases you out into Trolley Street, then you're not wanted any more
  c.state = "chase"; c.target = a.id; a.notoriety = 60;
  c.move.x = 0; c.move.z = -54; c.move.y = 0; w.debugTeleport(a.id, 6, -54, 0);
  settle(w, 0.5); a.notoriety = 0; settle(w, 25);
  assert.ok(w.npc.npcs.has(c.id), "still on duty");
  const st = w.arena.station!;
  assert.ok(inR(st.rect, c.move.x, c.move.z), `back inside (${c.move.x.toFixed(1)},${c.move.z.toFixed(1)}, ${c.state})`);
});

test("R10 the police are out before the match starts too (free roam in the lobby): foot patrols, both cruisers, the station's 4", () => {
  const { w } = hotWorld(1);
  assert.equal(w.match.phase, "lobby");
  settle(w, 20);
  const cops = [...w.npc.npcs.values()].filter((n) => n.kind === "cop");
  assert.equal(cops.filter((c) => c.beat !== undefined).length, 4, "the station's own");
  assert.ok(cops.filter((c) => c.patrol).length >= 8, `${cops.filter((c) => c.patrol).length} town patrols`);
  assert.equal(w.police.cars.filter((c) => c.patrol).length, 2, "two cruisers");
});

test("R10 nothing in or on the police station can be smashed (benches, planters, glass): only its door, toilet and cell door are props", () => {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const st = arena.station!;
  const inside = (arena.props ?? []).filter((p) => p.x > st.rect.minX - 0.5 && p.x < st.rect.maxX + 0.5 && p.z > st.rect.minZ - 0.5 && p.z < st.rect.maxZ + 0.5);
  assert.deepEqual(inside.map((p) => p.kind).sort(), ["celldoor", "door", "toilet"]);
});

// ---- R11: NEON FEVER DREAM ----
test("R11 NEON FEVER DREAM: the bouncer turns you back at the door till you pay the $20 cover (or you're a VIP); then you're in", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  const inside = { x: (f.door.minX + f.door.maxX) / 2 + 2, z: (f.door.minZ + f.door.maxZ) / 2 + 2 };
  // walk at the door from outside: bounced
  w.debugTeleport(a.id, f.out.x, f.out.z, Math.PI / 4, 0.2);
  drive(w, a.id, 120, { mz: 1, yaw: Math.PI / 4 });
  assert.ok(!inRect(f.rect, a.move.x, a.move.z, -0.5) || a.move.x + a.move.z < f.rect.minX + f.rect.minZ + f.cham + 1, `kept out (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  // pay at the rope
  a.cash = 50;
  const rope = w.arena.props!.find((p) => p.kind === "clubrope")!;
  w.debugTeleport(a.id, rope.x + 0.6, rope.z + 0.6, Math.atan2(rope.x - (rope.x + 0.6), rope.z - (rope.z + 0.6)), 0.2);
  w.takeEvents(); w.props.use(a, rope.id);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "cover" && e.paid === 20), "paid the $20 cover");
  assert.equal(a.cash, 30);
  w.debugTeleport(a.id, f.out.x, f.out.z, Math.PI / 4, 0.2);
  drive(w, a.id, 150, { mz: 1, yaw: Math.PI / 4 });
  assert.ok(Math.hypot(a.move.x - inside.x, a.move.z - inside.z) < 3.5 || a.move.x + a.move.z > f.rect.minX + f.rect.minZ + f.cham + 2, `walked in (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
});

test("R11 NEON FEVER DREAM: the stairs go floor 1 -> floor 2 (6.3 m) -> the roof (13.5 m); railings round the atrium; the roof's glass floor holds you", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  const s1 = f.stairs1, s2 = f.stairs2;
  w.debugTeleport(a.id, s1.minX - 0.6, (s1.minZ + s1.maxZ) / 2, Math.PI / 2, 0.2);
  drive(w, a.id, 360, { mz: 1, yaw: Math.PI / 2 });
  assert.ok(Math.abs(a.move.y - f.y2) < 0.15, `up on floor 2 (y ${a.move.y.toFixed(2)})`);
  w.debugTeleport(a.id, s2.maxX + 0.6, (s2.minZ + s2.maxZ) / 2, -Math.PI / 2, f.y2);
  drive(w, a.id, 420, { mz: 1, yaw: -Math.PI / 2 });
  assert.ok(Math.abs(a.move.y - f.roofY) < 0.15, `up on the roof (y ${a.move.y.toFixed(2)})`);
  // floor 2: walk north at the atrium from the south: the glass railing stops you
  w.debugTeleport(a.id, (f.atrium.minX + f.atrium.maxX) / 2 - 2, f.atrium.minZ - 2, 0, f.y2);
  drive(w, a.id, 180, { mz: 1, yaw: 0 });
  assert.ok(Math.abs(a.move.y - f.y2) < 0.15 && a.move.z < f.atrium.minZ, `stopped at the atrium's rail (y ${a.move.y.toFixed(2)}, z ${a.move.z.toFixed(1)})`);
  // the catwalk takes you across it
  w.debugTeleport(a.id, f.catwalk.minX - 1.2, (f.catwalk.minZ + f.catwalk.maxZ) / 2, Math.PI / 2, f.y2);
  drive(w, a.id, 240, { mz: 1, yaw: Math.PI / 2 });
  assert.ok(a.move.x > f.catwalk.maxX && Math.abs(a.move.y - f.y2) < 0.15, `across the catwalk (x ${a.move.x.toFixed(1)}, y ${a.move.y.toFixed(2)})`);
  // the roof: stand on the glass over the atrium
  w.debugTeleport(a.id, (f.atrium.minX + f.atrium.maxX) / 2, (f.atrium.minZ + f.atrium.maxZ) / 2, 0, f.roofY + 0.5);
  drive(w, a.id, 120, {});
  assert.ok(Math.abs(a.move.y - f.roofY) < 0.15, `standing on the glass floor (y ${a.move.y.toFixed(2)})`);
});

test("R11 NEON FEVER DREAM: B dances (moving stops it); 15 s of dancing in the club is +1 aura, 3 a day at most; the bar's mocktail ($8) is 40 s of dance energy; nothing in there breaks", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  w.debugTeleport(a.id, (f.atrium.minX + f.atrium.maxX) / 2, (f.atrium.minZ + f.atrium.maxZ) / 2, 0, 0.2);
  settle(w, 0.5);
  w.action(a.id, { a: "dance" });
  settle(w, 0.2);
  assert.ok(a.move.danceT > 0, "dancing");
  const aura0 = a.aura;
  settle(w, 16);
  assert.equal(a.aura, aura0 + 1, "+1 aura after 15 s");
  settle(w, 60);
  assert.equal(a.aura, aura0 + 3, "3 a day at most");
  drive(w, a.id, 10, { mz: 1 });
  assert.equal(a.move.danceT, 0, "moving stops it");
  // the mocktail
  a.cash = 10;
  const tap = w.arena.props!.find((p) => p.kind === "mocktail")!;
  w.debugTeleport(a.id, tap.x, tap.z - 0.8, 0, 0.2);
  w.takeEvents(); w.props.use(a, tap.id);
  assert.ok(w.takeEvents().some((e) => e.t === "mocktail"), "a mocktail");
  assert.equal(a.cash, 2); assert.ok(a.move.boostT > 39, "dance energy");
  // nothing breakable in the club
  assert.deepEqual(w.arena.props!.filter((p) => inRect(f.rect, p.x, p.z, 1)).map((p) => p.kind).sort(), ["clubrope", "door", "door", "door", "door", "mocktail", "mocktail"]); // (the rope is just outside the door; R11.4: five doors, none of them breakable)
});

test("R11.1 DON BINNIE's lounge: his two boys shove out anyone under 8 aura (7 isn't enough); a somebody (8+) walks in", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  settle(w, 1);
  const don = [...w.npc.npcs.values()].find((n) => n.kind === "don"), guards = [...w.npc.npcs.values()].filter((n) => n.kind === "velvet_guard");
  assert.ok(don && guards.length === 2, "the Don and his two bodyguards are there");
  assert.ok(inRect(f.vip, don!.move.x, don!.move.z) && don!.move.y > f.y2, "the Don's up in his lounge");
  // walk in from the rope's gap
  const inYaw = f.vipOut.yaw + Math.PI; // (the way in: against the shove)
  w.debugTeleport(a.id, f.vipOut.x, f.vipOut.z, inYaw, f.y2);
  w.takeEvents(); a.aura = 7;
  drive(w, a.id, 150, { mz: 1, yaw: inYaw });
  assert.ok(!inRect(f.vip, a.move.x, a.move.z, -0.2), `shoved back out (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  assert.ok(w.takeEvents().some((e) => e.t === "bounced" && e.reason === "don"), "the boys said so");
  a.aura = 8;
  w.debugTeleport(a.id, f.vipOut.x, f.vipOut.z, inYaw, f.y2);
  drive(w, a.id, 120, { mz: 1, yaw: inYaw });
  assert.ok(inRect(f.vip, a.move.x, a.move.z), `a VIP walks right in (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
});

test("R11.1 punch DON BINNIE: both bodyguards come for you; one hit and you're out cold on the pavement outside, your cover stamp gone", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  settle(w, 1);
  a.aura = 10; w.clubPass.add(a.id);
  const don = [...w.npc.npcs.values()].find((n) => n.kind === "don")!;
  w.debugTeleport(a.id, don.move.x + 1.0, don.move.z + 1.0, -3 * Math.PI / 4, don.move.y); // (R11.3: in front of him: he faces the room now)
  w.takeEvents();
  w.npc.hit(don.id, a.id, a.move.x, a.move.z); settle(w, 0.2);
  const guards = [...w.npc.npcs.values()].filter((n) => n.kind === "velvet_guard");
  assert.ok(guards.every((g) => g.state === "chase" && g.target === a.id), `both boys come (${guards.map((g) => g.state).join(",")})`);
  // stand still and take it
  let thrown = false;
  for (let i = 0; i < 60 * 20 && !thrown; i++) { w.tick(); thrown = w.takeEvents().some((e) => e.t === "donThrown"); }
  assert.ok(thrown, "thrown out");
  assert.ok(!inRect(f.rect, a.move.x, a.move.z, -0.5) && a.move.knockT > 0, `out cold outside the club (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  assert.ok(!w.clubPass.has(a.id), "the stamp's scrubbed off");
});

/** walk through waypoints (steering at each), returns the steps it took (or -1 if it never got there) */
function walkTo(w: World, id: string, pts: [number, number][], maxSteps = 900, near = 0.45) {
  const p = w.players.get(id)!;
  let used = 0;
  for (const [x, z] of pts) {
    let k = 0;
    while (Math.hypot(p.move.x - x, p.move.z - z) > near && k < maxSteps) { drive(w, id, 1, { mz: 1, yaw: Math.atan2(x - p.move.x, z - p.move.z) }); k++; }
    if (k >= maxSteps) return -1;
    used += k;
  }
  return used;
}
test("R11.2 NEON FEVER DREAM: walk it for real: in the front door, across the foyer, to the stairs' foot and up to the landing on floor 2", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  w.clubPass.add(a.id);
  w.debugTeleport(a.id, f.out.x, f.out.z, Math.PI / 4, 0.2);
  const s1 = f.stairs1, foot: [number, number] = [s1.minX - 1.2, (s1.minZ + s1.maxZ) / 2];
  const steps = walkTo(w, a.id, [[78.6, 10.9], [79.4, 15.0], [80.6, 24.2], [foot[0], 28.6], foot, [s1.maxX + 1.4, foot[1]]]);
  assert.ok(steps > 0, `walked the route (stuck at ${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  assert.ok(Math.abs(a.move.y - f.y2) < 0.15 && inRect(f.landing2, a.move.x, a.move.z), `up on the floor-2 landing (${a.move.x.toFixed(1)},${a.move.y.toFixed(2)},${a.move.z.toFixed(1)})`);
});

test("R11.3 NEON FEVER DREAM: walk it: off the floor-2 landing into both bays, round to the second stairs and up to the roof, across to the roof's bar, the smokers' corner and LIL PANDA's step", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  w.clubPass.add(a.id);
  const L = f.landing2, at = (): string => `${a.move.x.toFixed(1)},${a.move.y.toFixed(2)},${a.move.z.toFixed(1)}`;
  for (const [name, b, x] of [["west", f.bay, f.bay.minX + 0.75], ["east", f.bay2, f.bay2.maxX - 0.75]] as const) {
    w.debugTeleport(a.id, (L.minX + L.maxX) / 2, L.minZ + 0.6, Math.PI, f.y2);
    const zc = (b.minZ + b.maxZ) / 2;
    const ok = walkTo(w, a.id, [[name === "west" ? 79.5 : 97.0, 26.0], [name === "west" ? 78.0 : 99.5, zc], [x, zc]]);
    assert.ok(ok > 0 && inRect(b, a.move.x, a.move.z) && Math.abs(a.move.y - f.y2) < 0.15, `into the ${name} bay (${at()})`);
  }
  // the second stairs: from the east side of floor 2 to their foot (east end), up them to the roof
  const s2 = f.stairs2, zc2 = (s2.minZ + s2.maxZ) / 2;
  w.debugTeleport(a.id, 97.0, 16.0, Math.PI, f.y2);
  const up = walkTo(w, a.id, [[101.0, 12.0], [101.0, zc2], [s2.maxX + 0.3, zc2], [s2.minX - 1.2, zc2]], 1400);
  assert.ok(up > 0 && Math.abs(a.move.y - f.roofY) < 0.2, `up the second stairs onto the roof (${at()})`);
  // the roof's bar (its tap), the smokers' corner, the DJ's step
  const rb = f.roofBar;
  assert.ok(walkTo(w, a.id, [[s2.minX - 2.0, 11.5], [rb.x + rb.r1 + 0.7, rb.z]]) > 0, `to the roof's bar (${at()})`);
  assert.ok(walkTo(w, a.id, [[82.6, 26.4], [95.5, 27.4], [f.smoke.x - 2.3, f.smoke.z - 2.0]]) > 0 && Math.abs(a.move.y - f.roofY) < 0.2, `to the smokers' corner (${at()})`);
  assert.ok(walkTo(w, a.id, [[94.0, 26.5], [88.5, f.pavilion.minZ - 1.4]]) > 0, `to LIL PANDA's step (${at()})`);
});

import { DEAL, BUFFS, ONE_WAY_SHUT } from "../src/index.js";
/** R11.4: open a door from where you stand (facing it); true if it's open now */
function openDoor(w: World, a: { id: string }, id: string) {
  w.takeEvents(); w.props.use(w.players.get(a.id)!, id); settle(w, 0.1);
  return w.props.props.get(id)!.ready === false;
}
test("R11.4 the restroom wing: shut doors stop you; E opens them; down the hallway into MEN and WOMEN", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  w.clubPass.add(a.id);
  const wd = f.wingDoor, xc = (wd.minX + wd.maxX) / 2; // (R11.5: the door's at the hallway's north end)
  w.debugTeleport(a.id, xc, wd.maxZ + 1.6, Math.PI, 0.2);
  drive(w, a.id, 120, { mz: 1, yaw: Math.PI });
  assert.ok(a.move.z > wd.maxZ, `the wing's door is shut: it stops you (${a.move.z.toFixed(2)})`);
  assert.ok(openDoor(w, a, "feverdoor_wing"), "E opens it");
  assert.ok(walkTo(w, a.id, [[xc, f.hall.maxZ - 1.5]]) > 0 && inRect(f.hall, a.move.x, a.move.z), `into the hallway (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  for (const [name, room] of f.restrooms.map((r) => [r.name, r.room] as const)) {
    const d = w.arena.props!.find((p) => p.id === "feverdoor_" + name)!;
    w.debugTeleport(a.id, (f.hall.minX + f.hall.maxX) / 2, d.z, Math.PI / 2, 0.2); settle(w, 0.1);
    drive(w, a.id, 60, { mz: 1, yaw: Math.PI / 2 });
    assert.ok(a.move.x < d.x, `${name}'s door is shut too`);
    assert.ok(openDoor(w, a, d.id), `E opens ${name}'s door`);
    const ok = walkTo(w, a.id, [[d.x + 1.2, d.z], [(room.minX + room.maxX) / 2 - 0.8, (room.minZ + room.maxZ) / 2]]);
    assert.ok(ok > 0 && inRect(room, a.move.x, a.move.z), `into ${name} (${a.move.x.toFixed(1)},${a.move.z.toFixed(1)})`);
  }
});
test("R11.4 the back EXIT under the stairs: it opens from inside, out into the alley; it swings shut by itself; from the alley there's no handle and you can't slip back in", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const f = w.arena.fever!, bd = f.backDoor, x = (bd.minX + bd.maxX) / 2;
  w.clubPass.add(a.id); w.clubPass.add(b.id);
  // from the floor, under the stairs (the treads float over your head there), to the door
  w.debugTeleport(a.id, x, 27.6, 0, 0.2);
  assert.ok(walkTo(w, a.id, [[x, f.rect.maxZ - 0.9]]) > 0, `under the stairs to the EXIT (${a.move.x.toFixed(1)},${a.move.y.toFixed(2)},${a.move.z.toFixed(1)})`);
  drive(w, a.id, 60, { mz: 1, yaw: 0 });
  assert.ok(a.move.z < bd.minZ, "shut: it stops you");
  assert.ok(openDoor(w, a, "feverdoor_exit"), "E opens it (the push bar)");
  assert.ok(walkTo(w, a.id, [[x, f.rect.maxZ + 2.0]]) > 0, `out into the alley (${a.move.z.toFixed(1)})`);
  settle(w, ONE_WAY_SHUT + 1);
  assert.equal(w.props.props.get("feverdoor_exit")!.ready, true, "it's swung shut behind you");
  w.debugTeleport(a.id, x, f.rect.maxZ + 0.7, Math.PI, 0.1); settle(w, 0.1);
  w.takeEvents(); w.props.use(a, "feverdoor_exit");
  assert.ok(w.takeEvents().some((e) => e.t === "doorLocked") && w.props.props.get("feverdoor_exit")!.ready, "from the alley: no handle (it tells you so)");
  // B opens it from inside; A, outside, tries to slip in while it's open: stopped in the doorway
  w.debugTeleport(b.id, x, f.rect.maxZ - 0.9, 0, 0.2); settle(w, 0.1);
  assert.ok(openDoor(w, b, "feverdoor_exit"), "B opens it from inside");
  w.debugTeleport(b.id, x - 3, 28.0, 0, 0.2);
  w.takeEvents();
  drive(w, a.id, 120, { mz: 1, yaw: Math.PI });
  assert.ok(a.move.z > f.rect.maxZ - 0.5, `A can't get back in that way (${a.move.z.toFixed(2)})`);
  assert.ok(w.takeEvents().some((e) => e.t === "bounced" && (e as any).reason === "exit"), "bounced at the EXIT");
});
test("R11.4 SKETCHY STEVE: $15 each: ZOOMIES (faster), FLOATY FIZZ (low gravity, 3 jumps off thin air), BEEF JUICE (heavy loot at full speed, harder punches); a comedown after; a cop in sight and he legs it", () => {
  const { w, ps: [a] } = hotWorld(1);
  const f = w.arena.fever!;
  settle(w, 1);
  const steve = [...w.npc.npcs.values()].find((n) => n.kind === "sketchy_steve")!;
  assert.ok(steve && inRect(f.alley, steve.move.x, steve.move.z), "Steve's in the alley");
  const goods = (k: string) => w.arena.props!.find((p) => p.kind === "dealgoods" && p.sell === k)!;
  const at = (k: string) => { const g = goods(k); w.debugTeleport(a.id, g.x - 0.9, g.z, Math.PI / 2, 0.1); settle(w, 0.1); };
  // speed: ten steps' walk before and after
  const walk = () => { const x0 = a.move.x, z0 = a.move.z; w.debugTeleport(a.id, 87.6, 33.0, 0, 0.1); settle(w, 0.1); const s0 = a.move.z; drive(w, a.id, 60, { mz: 1, yaw: 0 }); const d = a.move.z - s0; w.debugTeleport(a.id, x0, z0, Math.PI / 2, 0.1); return d; };
  const base = walk();
  a.cash = 10; at("zoomies"); w.takeEvents(); w.props.use(a, goods("zoomies").id);
  assert.ok(w.takeEvents().some((e) => e.t === "dealNo" && (e as any).reason === "broke"), "broke: no deal");
  a.cash = 60; w.props.use(a, goods("zoomies").id);
  assert.ok(w.takeEvents().some((e) => e.t === "deal" && (e as any).kind === "zoomies" && !(e as any).heat), "ZOOMIES");
  assert.equal(a.cash, 60 - DEAL.price);
  assert.ok(a.move.speedT > 19, "20 s of it");
  const fast = walk();
  assert.ok(fast > base * 1.3, `faster (${base.toFixed(2)} -> ${fast.toFixed(2)} m/s)`);
  a.move.speedT = 0.05; drive(w, a.id, 12, {});
  assert.ok(a.move.comedownT > 3.5, "then the comedown");
  const slow = walk();
  assert.ok(slow < base * 0.8, `slow legs (${slow.toFixed(2)})`);
  drive(w, a.id, Math.round((BUFFS.comedown + 0.2) * 60), {});
  // floaty: up to three jumps in the air, higher than a jump ever goes
  at("floaty"); w.props.use(a, goods("floaty").id);
  assert.ok(a.move.floatT > 7, "FLOATY FIZZ");
  w.debugTeleport(a.id, 87.6, 33.0, 0, 0.1); settle(w, 0.1);
  let top = 0;
  for (let k = 0; k < 5; k++) { drive(w, a.id, 1, { jump: true }); drive(w, a.id, 14, { jump: false }); top = Math.max(top, a.move.y); }
  assert.ok(a.move.airJumps === BUFFS.floatJumps, `three jumps off thin air (${a.move.airJumps})`);
  assert.ok(top > 3, `floating up high (${top.toFixed(2)} m)`);
  // beef: sprinting with a heavy load
  const m = a.move; m.floatT = 0; drive(w, a.id, 6 * 60, {});
  at("beef"); w.props.use(a, goods("beef").id);
  assert.ok(a.move.strongT > 19, "BEEF JUICE");
  // the cops: one turns up, Steve legs it; no deals till he's back
  const cop = w.npc.spawn("cop")!;
  cop.move.x = steve.move.x - 6; cop.move.z = steve.move.z; cop.move.y = 0;
  settle(w, 0.5);
  assert.ok((steve.awayT ?? 0) > 0, "Steve legs it");
  w.npc.npcs.delete(cop.id);
  settle(w, 4);
  assert.ok(Math.hypot(steve.move.x - f.dealerHide.x, steve.move.z - f.dealerHide.z) < Math.hypot(f.dealer.x - f.dealerHide.x, f.dealer.z - f.dealerHide.z) - 3, "up the alley");
  at("zoomies"); w.takeEvents(); w.props.use(a, goods("zoomies").id);
  assert.ok(w.takeEvents().some((e) => e.t === "dealNo" && (e as any).reason === "away"), "closed for business");
  settle(w, DEAL.away + 10);
  assert.ok(w.npc.steveOpen(), "back at his crate when it's quiet");
});
test("R11.4 BEEF JUICE: a heavy load at full speed (and you can sprint with it)", () => {
  const arena = { boxes: [], halfSize: 200 } as unknown as ArenaLayout;
  const run = (strong: boolean) => {
    const s = makeMoveState(0, 0, 0); s.carryHeavy = true; s.carryMul = 0.6; if (strong) s.strongT = 10;
    for (let i = 0; i < 120; i++) stepMovement(s, { seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false } as MoveInput, arena);
    return s.z;
  };
  assert.ok(run(true) > run(false) * 1.6, `strong: ${run(true).toFixed(1)} m vs ${run(false).toFixed(1)} m`);
});
import { packBuffs, unpackBuffs } from "../src/index.js";
test("R11.4 the goods' timers sync packed in one number (the player schema is at its field limit), to 0.02 s", () => {
  const s = makeMoveState(0, 0); s.speedT = 13.37; s.strongT = 19.99; s.floatT = 7.5; s.comedownT = 3.21; s.airJumps = 2;
  const o = makeMoveState(0, 0); unpackBuffs(packBuffs(s), o);
  for (const k of ["speedT", "strongT", "floatT", "comedownT", "airJumps"] as const) assert.ok(Math.abs(o[k] - s[k]) <= 0.011, `${k}: ${s[k]} -> ${o[k]}`);
  assert.ok(Number.isSafeInteger(packBuffs({ speedT: 99, strongT: 99, floatT: 99, comedownT: 99, airJumps: 9, pints: 99, tipsyT: 999 })), "never overflows");
});

// ---- R12.1: THE SOGGY SHAMROCK ----
import { PUB, pintLevel, pintSpeed, pintSettled, pintMissMm, pintGrade, pintHoldFor, tipsyDrift, tipsyAmount } from "../src/index.js";
test("R12.4 split the G (visible, fair, skilled): a smooth drink (eases in, then steady, always down, no surges); the head settles a set amount after you let go; 1.5 mm perfect, 5 mm close; a short window", () => {
  for (const rate of [PUB.rateMin, 0.11, PUB.rateMax]) {
    for (let t = 0; t < 8; t += 0.05) assert.ok(pintLevel(t + 0.05, rate) <= pintLevel(t, rate) && pintSettled(t + 0.05, rate) <= pintSettled(t, rate), "always going down");
    // smooth: the speed never jumps (no surges): it only ever rises, by less than a 30th of a frame's worth
    for (let t = 0.5; t < 6; t += 1 / 60) { const a = pintSpeed(t, rate), b = pintSpeed(t + 1 / 60, rate); assert.ok(b >= a && b - a < rate * 0.01, `steady at ${t.toFixed(2)} s`); }
    const t = pintHoldFor(PUB.g, rate);
    assert.ok(t > 1.5 && t < 3.5, `about 2-3 s of drinking (${t.toFixed(2)} s)`);
    assert.ok(pintMissMm(t, rate) < 0.01);
    // the settle: the same short carry-on every time (let go ~2-3 mm above the bar), smooth (no jump), done in half a second
    const carry = (pintLevel(t, rate) - pintSettled(t, rate)) * PUB.glassMm;
    assert.ok(carry > 2 && carry < 3.5, `the head settles ${carry.toFixed(2)} mm`);
    assert.ok(Math.abs(pintSettled(t, rate, 0) - pintLevel(t, rate)) < 1e-9, "no jump when you let go");
    assert.ok((pintSettled(t, rate, 0.6) - pintSettled(t, rate)) * PUB.glassMm < 0.1, "settled in about half a second");
    assert.equal(pintGrade(pintMissMm(pintHoldFor(PUB.g - 1.2 / PUB.glassMm, rate), rate)), "perfect");
    assert.equal(pintGrade(pintMissMm(pintHoldFor(PUB.g + 1.2 / PUB.glassMm, rate), rate)), "perfect");
    assert.equal(pintGrade(pintMissMm(pintHoldFor(PUB.g - 4 / PUB.glassMm, rate), rate)), "close");
    assert.equal(pintGrade(pintMissMm(pintHoldFor(PUB.g - 6 / PUB.glassMm, rate), rate)), "miss");
    // skilled: the perfect window is short
    const win = pintHoldFor(PUB.g - 1.5 / PUB.glassMm, rate) - pintHoldFor(PUB.g + 1.5 / PUB.glassMm, rate);
    assert.ok(win > 0.12 && win < 0.22, `the perfect window: ${(win * 1000).toFixed(0)} ms`);
  }
});
test("R12.1 THE SOGGY SHAMROCK: $6 a pint at the tap (broke: no pint); split the G for $15, close gets your $6 back; the chalkboard keeps the best 5 of the match; one pint at a time", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const pub = w.arena.pub!;
  const tap = w.arena.props!.find((p) => p.kind === "pinttap")!;
  const tf = pub.taps[0].face, atTap = (p: typeof a) => { w.debugTeleport(p.id, tap.x + tf[0] * 0.85, tap.z + tf[1] * 0.85, Math.atan2(-tf[0], -tf[1]), pub.y1); settle(w, 0.1); };
  atTap(a);
  a.cash = 5; w.takeEvents(); w.props.use(a, tap.id);
  assert.ok(w.takeEvents().some((e) => e.t === "pintNo" && (e as any).reason === "broke"), "broke: no pint");
  a.cash = 100; w.props.use(a, tap.id);
  const ev = w.takeEvents().find((e) => e.t === "pint") as any;
  assert.ok(ev && ev.paid === 6 && ev.rate >= PUB.rateMin && ev.rate <= PUB.rateMax, "a pint, $6");
  assert.equal(a.cash, 94);
  w.props.use(a, tap.id);
  assert.ok(w.takeEvents().some((e) => e.t === "pintNo" && (e as any).reason === "busy"), "one at a time");
  // a perfect split
  const hold = (e: any, mm = 0) => pintHoldFor(PUB.g - mm / PUB.glassMm, e.rate); // (settling past the G by mm)
  assert.ok(!("w" in ev) && !("ph" in ev), "R12.4: no hidden surges");
  w.action(a.id, { a: "gulp", hold: hold(ev) });
  const d1 = w.takeEvents().find((e) => e.t === "pintDone") as any;
  assert.ok(d1 && d1.grade === "perfect" && d1.won === PUB.prize && d1.best, `split it (${JSON.stringify(d1)})`);
  assert.equal(a.cash, 94 + PUB.prize);
  w.action(a.id, { a: "gulp", hold: 1 });
  assert.ok(!w.takeEvents().some((e) => e.t === "pintDone"), "no pint, no gulp");
  // a close one: your money back
  w.props.use(a, tap.id); const e2 = w.takeEvents().find((e) => e.t === "pint") as any;
  w.action(a.id, { a: "gulp", hold: hold(e2, 4) });
  const d2 = w.takeEvents().find((e) => e.t === "pintDone") as any;
  assert.ok(d2.grade === "close" && d2.won === 6, "close: $6 back");
  // the chalkboard: the best splits, closest first, five at most (b goes on too)
  b.cash = 100; atTap(b);
  for (const off of [2.5, 3, 3.5, 4]) { w.props.use(b, tap.id); const e = w.takeEvents().find((x) => x.t === "pint") as any; w.action(b.id, { a: "gulp", hold: hold(e, off) }); w.takeEvents(); b.move.pints = 0; }
  assert.equal(w.pubBoard.length, PUB.boardN);
  assert.ok(w.pubBoard.every((x, i) => i === 0 || x.mm >= w.pubBoard[i - 1].mm), "closest first");
  assert.equal(w.pubBoard[0].name, a.name);
  const note = w.props.stateOf("pubboard1").note;
  assert.ok(note.split(";").length === 5 && note.startsWith(a.name + "|"), `the board syncs (${note})`);
  // it goes flat if you just stand there
  w.props.use(a, tap.id); w.takeEvents(); settle(w, PUB.pour + 1); w.action(a.id, { a: "gulp", hold: 2 });
  assert.ok(!w.takeEvents().some((e) => e.t === "pintDone"), "flat: no verdict");
});
test("R12.1 tipsy: every pint is 45 s more (3 min at most); from the 3rd your steering drifts (the same every time); Fergal cuts you off after 6 till you've sobered up", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pub = w.arena.pub!;
  const tap = w.arena.props!.find((p) => p.kind === "pinttap")!;
  const tf = pub.taps[0].face; w.debugTeleport(a.id, tap.x + tf[0] * 0.85, tap.z + tf[1] * 0.85, Math.atan2(-tf[0], -tf[1]), pub.y1); settle(w, 0.1);
  a.cash = 500;
  const pint = () => { w.props.use(a, tap.id); const e = w.takeEvents().find((x) => x.t === "pint"); if (e) w.action(a.id, { a: "gulp", hold: 0.5 }); w.takeEvents(); return !!e; };
  for (let i = 1; i <= 2; i++) pint();
  assert.equal(a.move.pints, 2); assert.ok(a.move.tipsyT > 85 && a.move.tipsyT <= 90, `90 s (${a.move.tipsyT.toFixed(1)})`);
  assert.equal(tipsyDrift(a.move), 0, "2 pints: steady");
  pint();
  assert.ok(tipsyAmount(a.move) > 0, "3 pints: a wobble");
  for (let i = 4; i <= 6; i++) pint();
  assert.equal(a.move.pints, 6); assert.ok(a.move.tipsyT <= PUB.tipsyMax, "3 minutes at most");
  w.takeEvents(); w.props.use(a, tap.id);
  assert.ok(w.takeEvents().some((e) => e.t === "pintNo" && (e as any).reason === "cutoff"), "cut off after 6");
  // the drift: walking 'straight' wanders off line (and identically on a second copy: it's all off the timer)
  const drift = () => { w.debugTeleport(a.id, -80.2, 9.5, Math.PI / 2, pub.y1); a.move.tipsyT = 120; a.move.pints = 6; drive(w, a.id, 90, { mz: 1, yaw: Math.PI / 2 }); return a.move.z; };
  const x1 = drift(), x2 = drift();
  assert.ok(Math.abs(x1 - 9.5) > 0.15, `drifted off line (${(x1 - 9.5).toFixed(2)} m)`);
  assert.ok(Math.abs(x1 - x2) < 1e-6, "the same every time");
  // sober again: pints back to 0, served again
  a.move.tipsyT = 0.5; drive(w, a.id, 60, {});
  assert.equal(a.move.pints, 0);
  w.debugTeleport(a.id, tap.x + tf[0] * 0.85, tap.z + tf[1] * 0.85, Math.atan2(-tf[0], -tf[1]), pub.y1); settle(w, 0.1);
  assert.ok(pint(), "served again");
});
test("R12.1 the pub's people: Fergal behind the bar, the regulars on their stools, THE RUSTY BIN LIDS on their stage, the eight drinkers, all staying put", () => {
  const { w } = hotWorld(1);
  const pub = w.arena.pub!;
  settle(w, 5);
  const at = (k: string) => [...w.npc.npcs.values()].filter((n) => n.kind === k);
  assert.equal(at("barman").length, 1); assert.equal(at("regular").length, 2); assert.equal(at("trad_band").length, 4); assert.equal(at("patron").length, 12); assert.equal(at("barmaid").length, 1); // (R12.2b: 4 more drinkers and Róisín upstairs)
  for (const n of [...at("barman"), ...at("regular"), ...at("trad_band"), ...at("patron"), ...at("barmaid")]) assert.ok(n.post && Math.hypot(n.move.x - n.post.x, n.move.z - n.post.z) < 0.35 && inRect(pub.rect, n.move.x, n.move.z, 3), `${n.kind} stays put (${Math.hypot(n.move.x - (n.post?.x ?? 0), n.move.z - (n.post?.z ?? 0)).toFixed(2)} m off)`);
  assert.ok(inRect(pub.lane, at("barman")[0].move.x, at("barman")[0].move.z), "Fergal inside the horseshoe");
});
test("R12.1 the sober-up timer and the pint count ride in the packed buffs too (0.1 s)", () => {
  const s = makeMoveState(0, 0); s.speedT = 19.98; s.strongT = 0.04; s.floatT = 7.98; s.comedownT = 3.98; s.airJumps = 3; s.tipsyT = 179.94; s.pints = 7;
  const o = makeMoveState(0, 0); unpackBuffs(packBuffs(s), o);
  for (const k of ["speedT", "strongT", "floatT", "comedownT", "airJumps"] as const) assert.ok(Math.abs(o[k] - s[k]) <= 0.011, `${k}: ${s[k]} -> ${o[k]}`);
  assert.ok(Math.abs(o.tipsyT - s.tipsyT) <= 0.051 && o.pints === 7, `tipsy ${o.tipsyT}, pints ${o.pints}`);
  assert.ok(Number.isSafeInteger(packBuffs(s)));
});

// ---- R12.2b: the laid-back upstairs (the céilí's gone), the island bar, the jukebox; R12.2c: SEAMUS O'SHORTLY, the swarm ----
import { SEAMUS, SWARM, JUKEBOX } from "../src/index.js";
test("R12.2b up THE SOGGY SHAMROCK's stairs to floor 2; a pint at the island bar (Róisín pours it, split the G up here too); B upstairs is just the ordinary dance (no céilí)", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pb = w.arena.pub!;
  w.debugTeleport(a.id, pb.stairs.maxX + 0.7, (pb.stairs.minZ + pb.stairs.maxZ) / 2, -Math.PI / 2, pb.y1); settle(w, 0.2);
  drive(w, a.id, 300, { mz: 1, yaw: -Math.PI / 2 });
  assert.ok(Math.abs(a.move.y - pb.y2) < 0.2, `up on floor 2 (y ${a.move.y.toFixed(2)})`);
  const tap = w.arena.props!.find((q) => q.kind === "pinttap" && q.y > pb.y2)!, t = pb.taps.find((q) => q.y > pb.y2 && Math.hypot(q.x - tap.x, q.z - tap.z) < 0.01)!;
  w.debugTeleport(a.id, tap.x + t.face[0] * 0.85, tap.z + t.face[1] * 0.85, Math.atan2(-t.face[0], -t.face[1]), pb.y2 + 0.05); settle(w, 0.2);
  a.cash = 50; w.takeEvents(); w.props.use(a, tap.id);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "pint"), "a pint upstairs");
  const rosin = [...w.npc.npcs.values()].find((n) => n.kind === "barmaid")!;
  assert.ok(rosin && inRect(pb.lane2, rosin.move.x, rosin.move.z), "Róisín's behind the island bar");
  assert.ok(ev.some((e) => e.t === "npcSay" && (e as any).npc === rosin.id), "Róisín pours it (she says so)");
  w.action(a.id, { a: "gulp", hold: 2.5 });
  assert.ok(w.takeEvents().some((e) => e.t === "pintDone"), "split the G up here too");
  // B: the ordinary dance; no céilí any more
  settle(w, 0.5); w.takeEvents(); w.action(a.id, { a: "dance" });
  const ev2 = w.takeEvents();
  assert.ok(ev2.some((e) => e.t === "dance" && (e as any).on) && !ev2.some((e) => (e.t as string).startsWith("ceili")), "just a dance");
  assert.ok(![...w.npc.npcs.values()].some((n) => (n.kind as string).startsWith("ceili")), "the céilí band and dancers are gone");
});
test("R12.2b the jukebox: E puts on the next tune (round the three), everyone hears the same (its prop note), not more than once every 3 s", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pb = w.arena.pub!, jb = w.arena.props!.find((q) => q.kind === "jukebox")!;
  w.debugTeleport(a.id, jb.x, jb.z - 0.9, 0, pb.y2 + 0.05); settle(w, 0.3);
  assert.equal(w.props.stateOf(jb.id).note, "0");
  w.takeEvents(); w.props.use(a, jb.id);
  const ev = w.takeEvents().find((e) => e.t === "jukebox") as any;
  assert.ok(ev && ev.tune === 1, "the next tune");
  assert.equal(w.props.stateOf(jb.id).note, "1");
  w.props.use(a, jb.id);
  assert.equal(w.jukeTune, 1, "not again straight away");
  settle(w, JUKEBOX.cd + 0.2); w.props.use(a, jb.id); settle(w, JUKEBOX.cd + 0.2); w.props.use(a, jb.id);
  assert.equal(w.jukeTune, 0, "round the three and back to the first");
});
test("R12.2c SEAMUS O'SHORTLY: a job (bring him something) for a pot of gold, \"still waiting\", then paid; now and then a big job for the big pot; a tip once you've a name (3+ aura); Mammy's gone", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pb = w.arena.pub!;
  settle(w, 1);
  assert.ok(![...w.npc.npcs.values()].some((n) => (n.kind as string) === "mammy"), "Mammy's gone");
  assert.equal([...w.npc.npcs.values()].filter((n) => n.kind === "leprechaun").length, 1);
  assert.equal([...w.npc.npcs.values()].filter((n) => n.kind === "lep_buddy").length, 6);
  const talk = () => { w.debugTeleport(a.id, pb.seamus.x + Math.sin(pb.seamus.yaw) * 1.1, pb.seamus.z + Math.cos(pb.seamus.yaw) * 1.1, pb.seamus.yaw + Math.PI, pb.y2 + 0.05); drive(w, a.id, 10, {}); w.takeEvents(); w.props.use(a, "seamus1"); return w.takeEvents().find((e) => e.t === "seamus") as any; };
  for (const t of [...SEAMUS.jobs, ...SEAMUS.bonusJobs]) assert.ok(lootDef(t), `${t} is a real thing`);
  a.aura = 0;
  // keep asking (job, done) until we've seen both a small job and a big one
  let small = false, big = false;
  for (let k = 0; k < 40 && !(small && big); k++) {
    const j = talk();
    assert.ok(j && (j.kind === "job" || j.kind === "bigJob") && /Bring me/.test(j.line), `a job (${j?.line})`);
    const list = j.kind === "bigJob" ? SEAMUS.bonusJobs : SEAMUS.jobs;
    const type = list.find((t) => j.line.toLowerCase().includes((lootDef(t)!.name).toLowerCase()))!;
    assert.ok(type, "the job names the thing");
    if (!small && !big) assert.equal(talk().kind, "jobWait");
    holdNew(w, a, type, 14);
    a.cash = 0;
    const d = talk();
    const want = j.kind === "bigJob" ? Math.max(SEAMUS.bonusMin, 14 * SEAMUS.bonusMult) : Math.max(SEAMUS.minPay, 28);
    assert.ok(d.kind === "jobDone" && d.reward === want && a.cash === want && !a.hand && a.pockets.every((x) => !x), `paid in gold ($${a.cash}, want $${want})`);
    if (j.kind === "bigJob") big = true; else small = true;
  }
  assert.ok(small && big, "small jobs and the odd big one");
  a.aura = 5;
  const tip = talk();
  assert.ok(tip.kind === "tip" && tip.line.length > 20, `a tip: "${tip.line}"`);
});
test("R12.2c the swarm: hit anyone in the pub and Seamus's six wee buddies come for you (popping out round you, even downstairs), nip at you (a little each, never below the floor), for 8 s, then go back to the snug; hitting Seamus does it too", () => {
  const { w, ps: [a] } = hotWorld(1);
  const pb = w.arena.pub!;
  settle(w, 1);
  const lads = () => [...w.npc.npcs.values()].filter((n) => n.kind === "lep_buddy");
  // trouble downstairs: punch a drinker (the lads are all upstairs)
  const pat = [...w.npc.npcs.values()].find((n) => n.kind === "patron" && inRect(pb.rect, n.move.x, n.move.z) && n.move.y < pb.y2 - 1)!;
  w.debugTeleport(a.id, pat.move.x + 0.8, pat.move.z, -Math.PI / 2, pat.move.y); settle(w, 0.1); w.takeEvents();
  a.hp = 100;
  w.npc.hit(pat.id, a.id, a.move.x, a.move.z);
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "lepSwarm" && (e as any).on && (e as any).p === a.id), "the swarm's on");
  assert.ok(ev.filter((e) => e.t === "npcPop").length >= 4, "they pop out round you (downstairs)");
  assert.ok(lads().every((n) => n.state === "chase" && n.target === a.id), "all six come for you");
  assert.ok(lads().every((n) => Math.abs(n.move.y - a.move.y) < 1 && Math.hypot(n.move.x - a.move.x, n.move.z - a.move.z) < SWARM.pop + 1), "round you, on your floor");
  // stand still and take it for a few seconds: nips, never below the floor
  const hp0 = a.hp; let nips = 0;
  for (let i = 0; i < 6 * 60; i++) { w.pushInputs(a.id, [inp(a.lastSeq + 1, {})]); w.tick(); nips += w.takeEvents().filter((e) => e.t === "hurt" && (e as any).p === a.id).length; }
  assert.ok(nips >= 4, `nipped (${nips} times)`);
  assert.ok(a.hp < hp0 && a.hp >= SWARM.floor && a.move.knockT <= 0, `a little damage, never below ${SWARM.floor} (hp ${a.hp})`);
  assert.ok(w.swarmOn(a.id), "still swarming at 6 s");
  // it ends: they go back up to the snug
  settle(w, SWARM.t - 6 + 1);
  assert.ok(!w.swarmOn(a.id), "over after 8 s");
  settle(w, 4);
  assert.ok(lads().every((n) => n.state !== "chase" && n.state !== "windup"), "they leave you be");
  assert.ok(lads().every((n) => Math.abs(n.move.y - pb.y2) < 0.6 && inRect(pb.snug2, n.move.x, n.move.z, 1.5)), "back in the snug");
  // hitting the boss sets them off too (he doesn't go down)
  const boss = [...w.npc.npcs.values()].find((n) => n.kind === "leprechaun")!;
  w.debugTeleport(a.id, boss.move.x + 0.9, boss.move.z, -Math.PI / 2, boss.move.y); settle(w, 0.2); w.takeEvents();
  assert.equal(w.npc.hit(boss.id, a.id, a.move.x, a.move.z), "hit");
  assert.ok(w.takeEvents().some((e) => e.t === "lepSwarm" && (e as any).on) && boss.state !== "ko", "GET HIM, LADS!");
});

// ---- R12.5: simulation levels for passers-by ----
import { NPC_LOD } from "../src/index.js";
test("R12.5 NPC levels: a passer-by far from every player updates one NPC step in three (and still walks); next to ANY player (here the second one) it updates every step", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  const n = w.npc.spawn("tourist")!;
  n.state = "walk";
  const far = (p: typeof a, dx: number) => { w.debugTeleport(p.id, n.move.x + dx, n.move.z + 0.5, 0); };
  far(a, NPC_LOD.far + 60); far(b, -(NPC_LOD.far + 60));
  settle(w, 0.5);
  const count = (secs: number) => { let moves = 0, steps = 0, x = n.move.x, z = n.move.z; const x0 = x, z0 = z; for (let i = 0; i < secs * 60; i++) { w.tick(); if (i % 2 === 1) { steps++; if (n.move.x !== x || n.move.z !== z) moves++; x = n.move.x; z = n.move.z; } } return { moves, steps, walked: Math.hypot(n.move.x - x0, n.move.z - z0) }; };
  if (n.state !== "walk") n.state = "walk";
  const f = count(6);
  assert.ok(f.moves <= f.steps / NPC_LOD.every + 3, `far: moved on ${f.moves} of ${f.steps} steps`);
  assert.ok(f.walked > 2, `far: still walking (${f.walked.toFixed(1)} m in 6 s)`);
  // the second player walks up to it: from then on, every step (player one is still far away)
  w.debugTeleport(b.id, n.move.x + 3, n.move.z + 3, 0);
  n.state = "walk";
  const near = count(3);
  assert.ok(near.moves >= near.steps * 0.8, `near player two: moved on ${near.moves} of ${near.steps} steps`);
});
test("R12.5 crowds: people pressed together still step apart (separation looks only at neighbouring cells now)", () => {
  const { w, ps: [a, b] } = hotWorld(2);
  w.debugTeleport(a.id, 0, -60, 0); w.debugTeleport(b.id, 0, -60, 0);
  const crowd = Array.from({ length: 30 }, () => w.npc.spawn("tourist")!);
  const x0 = crowd[0].move.x, z0 = crowd[0].move.z;
  crowd.forEach((n, i) => { n.move.x = x0 + (i % 6) * 0.2; n.move.z = z0 + Math.floor(i / 6) * 0.2; n.state = "idle"; n.stateT = 99; });
  const minGap = () => { let m = Infinity; for (let i = 0; i < crowd.length; i++) for (let j = i + 1; j < crowd.length; j++) m = Math.min(m, Math.hypot(crowd[i].move.x - crowd[j].move.x, crowd[i].move.z - crowd[j].move.z)); return m; };
  const before = minGap();
  settle(w, 3);
  assert.ok(minGap() > before + 0.2 && minGap() > 0.45, `spread out: closest pair ${before.toFixed(2)} m -> ${minGap().toFixed(2)} m`);
});
