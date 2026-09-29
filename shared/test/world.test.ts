import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inDeepWater, LOOT, lootDef, PLAYER, GIANT_DRAG_MUL, TUG_MAX_TIME, FISTS, ITEM_MAX,
  type MoveInput, type ArenaLayout, type Box, type WorldEvent,
} from "../src/index.js";

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
  const brk = c.props!.filter((p) => p.box !== undefined);
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
  assert.ok(![...w.items.values()].some((it) => lootDef(it.type).junk && !w.arena.junkSpots!.some((s) => Math.hypot(s.x - it.body.x, s.z - it.body.z) < 1.5)), "only at junk spots");
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
