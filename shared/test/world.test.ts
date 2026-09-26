import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, LOOT, lootDef, PLAYER, GIANT_TETHER, ITEM_MAX,
  type MoveInput, type ArenaLayout, type Box,
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
      if (b.kind === "sidewalk" || b.kind === "curb") continue;
      assert.ok(!inside(sp.x, sp.y + 0.05, sp.z, 0.3, b), `loot spawn ${sp.zone} ${sp.x},${sp.y},${sp.z} inside ${b.kind} at ${b.x},${b.z}`);
    }
  }
  for (const sp of city.spawns) for (const b of city.boxes) {
    if (b.kind === "sidewalk" || b.kind === "curb") continue;
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

test("city: every dumpster is against a low roof you can climb onto", () => {
  const w = new World({ seed: 1, spawnLoot: false });
  const dumpsters = w.arena.boxes.filter((b) => b.kind === "dumpster");
  assert.ok(dumpsters.length >= 8);
  for (const d of dumpsters) {
    const p = w.addPlayer("a", "Climber");
    const m = p.move;
    // which wall is it against? find the low building/roof touching its short side
    const along = d.d > d.w ? "z" : "x"; // long axis runs along the alley
    const dirs = along === "z" ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    let wallDir: number[] | null = null;
    for (const [ux, uz] of dirs) {
      const px = d.x + ux * (d.w / 2 + 0.1), pz = d.z + uz * (d.d / 2 + 0.1);
      if (w.arena.boxes.some((b) => (b.kind === "building" || b.kind === "wall" || b.kind === "roof") && Math.abs(b.y + b.h / 2 - 3.2) < 0.01
        && Math.abs(px - b.x) <= b.w / 2 + 0.05 && Math.abs(pz - b.z) <= b.d / 2 + 0.05)) wallDir = [ux, uz];
    }
    assert.ok(wallDir, `dumpster at ${d.x},${d.z} is against a low roof`);
    const [ux, uz] = wallDir!;
    // stand on the alley side, facing the dumpster and the wall behind it
    m.x = d.x - ux * (d.w / 2 + 0.5); m.z = d.z - uz * (d.d / 2 + 0.5); m.y = 0; m.grounded = true;
    const yaw = Math.atan2(ux, uz);
    drive(w, "a", 3, { yaw }); // settle onto the sidewalk surface first
    let climbedRoof = false;
    for (let i = 0; i < 240 && !climbedRoof; i++) {
      drive(w, "a", 1, { yaw, mz: 1, jump: i % 2 === 0 }); // walking forward, tapping SPACE
      climbedRoof = m.grounded && Math.abs(m.y - 3.2) < 1e-6;
    }
    assert.ok(climbedRoof, `climbed dumpster at ${d.x},${d.z} onto the roof (y=${m.y.toFixed(2)})`);
    w.removePlayer("a");
  }
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
  assert.equal(p.pockets[0], "");
  assert.equal(w.items.get(ch)!.mode, "free");
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

test("giant items: one player drags slowly, two carry together, pulling apart makes it tumble", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const duck = w.placeItem("rubber_duck", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: duck });
  assert.equal(w.items.get(duck)!.holder, "a");
  assert.ok(Math.abs(a.move.carryMul - 0.3) < 1e-9, "dragging alone is very slow");
  settle(w, 0.3);
  w.action("b", { a: "grab", item: duck });
  const it = w.items.get(duck)!;
  assert.equal(it.holder2, "b");
  assert.ok(Math.abs(a.move.carryMul - 0.65) < 1e-9 && Math.abs(b.move.carryMul - 0.65) < 1e-9, "two carriers move faster");
  // walk apart sideways until the tether breaks
  let tumbled = false;
  for (let i = 0; i < 240 && !tumbled; i++) {
    w.pushInputs("a", [inp(a.lastSeq + 1, { mx: -1 })]);
    w.pushInputs("b", [inp(b.lastSeq + 1, { mx: 1 })]);
    w.tick();
    tumbled = w.takeEvents().some((e) => e.t === "tumble");
  }
  assert.ok(tumbled, "pulled apart = tumble");
  assert.equal(it.mode, "free");
  assert.equal(a.hand, ""); assert.equal(b.hand, "");
  assert.ok(Math.hypot(a.move.x - b.move.x, a.move.z - b.move.z) > GIANT_TETHER - 0.2);
});

test("giant: can't be thrown; one carrier letting go leaves the other dragging", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const arc = w.placeItem("arcade_machine", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: arc }); settle(w, 0.3);
  w.action("b", { a: "grab", item: arc }); settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0 });
  assert.equal(w.items.get(arc)!.mode, "held");
  settle(w, 0.3);
  w.action("a", { a: "drop" });
  const it = w.items.get(arc)!;
  assert.equal(it.holder, "b"); assert.equal(it.holder2, "");
  assert.equal(a.hand, "");
  assert.ok(Math.abs(b.move.carryMul - 0.3) < 1e-9);
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
      assert.ok(!(inX && inY && inZ), `${it.type} stuck inside ${b.kind}`);
    }
    assert.ok(Math.abs(it.body.x) <= w.arena.halfSize + 2 && Math.abs(it.body.z) <= w.arena.halfSize + 2 && it.body.y >= def.radius - 0.01, `${it.type} in bounds`);
  }
});

test("the spawner never exceeds the item cap", () => {
  const w = new World({ seed: 5 });
  for (let i = 0; i < 300; i++) w.spawnOne();
  assert.ok(w.items.size <= ITEM_MAX, `${w.items.size} items`);
  settle(w, 30); // top-ups over time also respect the cap
  assert.ok(w.items.size <= ITEM_MAX);
});

test("spawning: fills the city, rare stuff shows up more in the plaza, respects caps", () => {
  const w = new World({ seed: 42 });
  assert.ok(w.items.size >= 28, `${w.items.size} items spawned`);
  let giants = 0;
  for (const it of w.items.values()) if (lootDef(it.type).size === "giant") giants++;
  assert.ok(giants <= 2);
  // statistical check over many worlds: plaza gets a higher share of rare+ than streets
  let plazaRare = 0, plazaN = 0, streetRare = 0, streetN = 0;
  for (let s = 0; s < 60; s++) {
    const ww = new World({ seed: 1000 + s });
    for (const it of ww.items.values()) {
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
