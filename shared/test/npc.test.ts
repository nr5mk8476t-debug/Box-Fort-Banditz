import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildNavGraph, buildTrashington, inRect, lootDef, PLAYER, NPC_DEFS, PUNCH_COOLDOWN, KNOCK_TIMES, NPC_COUNT, KNOCK_IMMUNITY,
  HEALTH, throwImpact, LOOT, type MoveInput, type WorldEvent,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function settle(w: World, seconds: number, collect?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
function idle(w: World, id: string, seconds: number, p: Partial<MoveInput> = {}, collect?: WorldEvent[]) {
  const pl = w.players.get(id)!;
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs(id, [inp(pl.lastSeq + 1, p)]); w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
/** A quiet city (no random pedestrians, no loot) with one player at the plaza edge facing +z. */
function quiet() {
  const w = new World({ seed: 11, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  p.move.x = 0; p.move.z = -20; p.move.yaw = 0;
  return { w, p };
}

test("route map: every point and every link is clear of walls, all connected, plaza covered", () => {
  const city = buildTrashington();
  const g = buildNavGraph(city);
  assert.ok(g.length > 150, `${g.length} route points`);
  const solid = city.boxes.filter((b) => b.y + b.h / 2 > 0.4 && b.y - b.h / 2 < 1.8);
  const clear = (x: number, z: number) => !solid.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4);
  for (const n of g) {
    assert.ok(clear(n.x, n.z), `node ${n.x},${n.z}`);
    for (const l of n.links) { const m = g[l]; for (let t = 0; t <= 1; t += 0.05) assert.ok(clear(n.x + (m.x - n.x) * t, n.z + (m.z - n.z) * t), `link ${n.x},${n.z} -> ${m.x},${m.z}`); }
  }
  const seen = new Set([0]); const st = [0];
  while (st.length) for (const l of g[st.pop()!].links) if (!seen.has(l)) { seen.add(l); st.push(l); }
  assert.equal(seen.size, g.length, "one connected network");
  assert.ok(g.filter((n) => Math.abs(n.x) < 23 && Math.abs(n.z) < 23).length >= 12, "plenty of plaza points");
  // roads are only crossed at crosswalks
  for (const n of g) for (const l of n.links) {
    const m = g[l];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = n.x + (m.x - n.x) * t, z = n.z + (m.z - n.z) * t;
      if (city.roads!.some((r) => inRect(r, x, z))) assert.ok(city.crosswalks!.some((c) => inRect(c, x, z, 0.3)), `jaywalking link ${n.x},${n.z} -> ${m.x},${m.z}`);
    }
  }
});

test("the crowd wanders for 2 minutes: never inside walls, never stuck, never NaN, stay in town", () => {
  const w = new World({ seed: 5, spawnLoot: false });
  const walkers = () => [...w.npc.npcs.values()].filter((n) => !n.post);
  assert.equal(walkers().length, NPC_COUNT);
  assert.equal(w.npc.npcs.size - NPC_COUNT, w.arena.shops!.length + 6, "one cashier per shop, the doorman, the fisherman, the old lady, Uncle Dumpster and the 2 bank guards");
  const start = new Map([...w.npc.npcs.values()].map((n) => [n.id, { x: n.move.x, z: n.move.z }]));
  const travelled = new Map<string, number>();
  const last = new Map([...start]);
  for (let i = 0; i < 120 * 60; i++) {
    w.tick();
    w.takeEvents();
    if (i % 30 === 0) {
      for (const n of w.npc.npcs.values()) {
        const m = n.move;
        assert.ok(Number.isFinite(m.x + m.z + m.y), `${n.kind} NaN`);
        if (n.kind !== "uncle_dumpster") assert.ok(Math.abs(m.x) < w.arena.halfSize && Math.abs(m.z) < w.arena.halfSize, `${n.kind} wandered off to ${m.x.toFixed(1)},${m.z.toFixed(1)}`);
        for (const b of w.arena.boxes) {
          if (b.y + b.h / 2 <= 0.4 || b.y - b.h / 2 > 1.7) continue;
          assert.ok(!(Math.abs(m.x - b.x) < b.w / 2 - 0.05 && Math.abs(m.z - b.z) < b.d / 2 - 0.05 && m.y < b.y + b.h / 2 - 0.05), `${n.kind} inside ${b.kind}`);
        }
        const l = last.get(n.id)!;
        travelled.set(n.id, (travelled.get(n.id) ?? 0) + Math.hypot(m.x - l.x, m.z - l.z));
        last.set(n.id, { x: m.x, z: m.z });
      }
    }
  }
  for (const [id, d] of travelled) if (!w.npc.npcs.get(id)?.post) assert.ok(d > 30, `pedestrian ${id} only walked ${d.toFixed(1)} m in 2 minutes (stuck?)`);
});

test("punch a businessman: BONK, his loot pops out, he flees; second punch gets nothing", () => {
  const { w, p } = quiet();
  const n = w.npc.place("businessman", 0, -18.8, Math.PI);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  ev.push(...w.takeEvents());
  assert.ok(ev.some((e) => e.t === "punch" && e.hit === "npc"), "hit registered");
  assert.ok(n.robbed);
  const dropped = [...w.items.values()].filter((it) => lootDef(it.type).npcOnly);
  assert.equal(dropped.length, 1, "one item popped out");
  assert.ok(NPC_DEFS.businessman.loot.some(([t]) => t === dropped[0].type));
  assert.ok(p.notoriety >= 10, "notoriety went up");
  settle(w, 1.5, ev);
  assert.equal(n.state, "flee");
  settle(w, 3);
  n.move.x = p.move.x; n.move.z = p.move.z + 1.2; n.state = "idle"; n.stateT = 99;
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal([...w.items.values()].filter((it) => lootDef(it.type).npcOnly).length, 1, "nothing more to steal");
});

test("punching needs empty hands and respects the cooldown", () => {
  const { w, p } = quiet();
  const n = w.npc.place("tourist", 0, -18.8, Math.PI);
  const tv = w.placeItem("traffic_cone", 0, 0, -19);
  settle(w, 1);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(!n.robbed, "can't punch with full hands");
  settle(w, 0.3); // (grab/drop have a 0.18 s anti-spam cooldown)
  w.action("a", { a: "drop" });
  assert.equal(p.hand, "");
  settle(w, 0.3);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents().filter((e) => e.t === "punch");
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal(w.takeEvents().filter((e) => e.t === "punch").length, 0, "second punch within the cooldown is ignored");
  assert.equal(ev.length, 1);
  assert.ok(PUNCH_COOLDOWN > 0.3);
});

test("punch misses when nobody is in front of you", () => {
  const { w } = quiet();
  w.npc.place("tourist", 0, -21.5, 0); // behind the player
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(w.takeEvents().some((e) => e.t === "punch" && e.hit === "none"));
});

test("joggers sometimes sidestep your punch", () => {
  let dodges = 0, hits = 0;
  for (let s = 0; s < 40; s++) {
    const w = new World({ seed: 100 + s, npcs: 0, spawnLoot: false });
    const p = w.addPlayer("a", "A"); p.move.x = 0; p.move.z = -20;
    w.npc.place("jogger", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    const ev = w.takeEvents();
    if (ev.some((e) => e.t === "npcDodge")) dodges++; else if (ev.some((e) => e.t === "npcHit")) hits++;
  }
  assert.ok(dodges >= 5 && hits >= 15, `dodges ${dodges}, hits ${hits}`);
});

test("gym bro fights back: chases you, telegraphs swings, his hits (25 each) knock you down at 0 HP and you drop your stuff", () => {
  const { w, p } = quiet();
  const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
  const ch = w.placeItem("rubber_chicken", 0.3, 0, -19.5);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch }); // pocket it (hands stay free for punching)
  assert.equal(p.pockets[0], ch);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev: WorldEvent[] = [];
  // stand there and take it, checking every 1/10 s
  for (let k = 0; k < 60 && !ev.some((e) => e.t === "knockdown"); k++) idle(w, "a", 0.1, {}, ev);
  assert.ok(ev.some((e) => e.t === "npcAttack"), "he swung at you");
  assert.ok(ev.some((e) => e.t === "knockdown" && e.p === "a" && e.by === bro.id), "knocked down once his hits took all your health");
  assert.equal(p.pockets[0], "", "dropped your pocket loot");
  assert.equal(bro.state, "gloat", "he gloats over you (regression: used to be overwritten by chase -> huff)");
});

test("beat a fighter to 2 hits first: KO with stars + bonus loot", () => {
  const { w } = quiet();
  const cop = w.npc.place("mall_cop", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  settle(w, 0.65); // cooldown passes, he's still dazed/closing in
  cop.move.x = 0; cop.move.z = -18.8;
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "npcKo"), "KO'd");
  assert.equal(cop.state, "ko");
  assert.equal([...w.items.values()].filter((it) => lootDef(it.type).npcOnly).length, 2, "his item + bonus loot");
  assert.ok(w.players.get("a")!.notoriety >= 45, "mall cop hits count extra");
});

test("5A.1 PvP punches: 34 damage each and knock your HAND item loose; the 3rd punch knocks you down; immunity; repeat knockdowns shorter", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: false });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = 0; a.move.z = -20; b.move.x = 0; b.move.z = -18.9;
  const tv = w.placeItem("crt_tv", 0.9, 0, -18.3);
  const ch = w.placeItem("rubber_chicken", -0.6, 0, -18.3);
  settle(w, 1);
  b.move.yaw = 0.8;
  w.action("b", { a: "grab", item: tv });
  b.move.yaw = -0.8; b.actionCd = 0;
  w.action("b", { a: "grab", item: ch });
  assert.equal(b.hand, tv); assert.equal(b.pockets[0], ch);
  const hitB = () => { b.move.x = 0; b.move.z = -18.9; b.move.vx = 0; b.move.vz = 0; a.punchCd = 0; w.action("a", { a: "punch", yaw: 0, pitch: 0 }); };
  hitB();
  assert.equal(b.hp, HEALTH.max - HEALTH.punch, "first punch: 34 damage");
  assert.equal(b.move.knockT, 0, "still standing");
  assert.equal(b.hand, "", "the TV was knocked out of their hands");
  assert.equal(b.pockets[0], ch, "pockets stay");
  assert.equal(w.items.get(tv)!.mode, "free");
  hitB();
  assert.equal(b.hp, HEALTH.max - 2 * HEALTH.punch);
  hitB();
  assert.equal(b.move.knockT, KNOCK_TIMES[0], "third punch: knocked down");
  assert.equal(b.pockets[0], "", "knockdown drops everything");
  assert.equal(b.hp, 0);
  // knocked players can't act
  w.action("b", { a: "grab", item: tv });
  assert.equal(b.hand, "");
  // immune right after: a punch is blocked; back to full health once up
  idle(w, "b", 2.1);
  assert.equal(b.hp, HEALTH.max, "up again at full health");
  hitB();
  assert.ok(w.takeEvents().some((e) => e.t === "punch" && e.hit === "blocked"));
  idle(w, "b", KNOCK_IMMUNITY + 0.5);
  for (let i = 0; i < 3; i++) hitB();
  assert.equal(b.move.knockT, KNOCK_TIMES[1], "second knockdown within 12 s is shorter");
});

test("5A.1 health regenerates 10/s after 5 s without being hurt; thrown items hurt (5-30) but never knock you out", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: false });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = 0; a.move.z = -20; b.move.x = 0; b.move.z = -18.9;
  settle(w, 0.5);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal(b.hp, 66);
  idle(w, "b", 4.5);
  assert.equal(b.hp, 66, "no regen for 5 s");
  idle(w, "b", 2);
  assert.ok(b.hp > 66 + 5 && b.hp < 66 + 25, `regenerating: ${b.hp.toFixed(0)}`);
  idle(w, "b", 5);
  assert.equal(b.hp, HEALTH.max);
  // impact numbers: a chicken barely hurts, a TV hurts a lot, a heaved duck hurts and shoves hardest
  const chick = throwImpact(lootDef("rubber_chicken"), 16), tv = throwImpact(lootDef("crt_tv"), 11.5), duck = throwImpact(lootDef("rubber_duck"), 7);
  assert.ok(chick.dmg >= 5 && chick.dmg <= 8, `chicken ${chick.dmg}`);
  assert.ok(tv.dmg >= 20 && tv.dmg <= 30, `tv ${tv.dmg}`);
  assert.ok(duck.dmg >= 18 && duck.knock > tv.knock && tv.knock > chick.knock, `duck ${duck.dmg} knock ${duck.knock}`);
  for (const d of LOOT) assert.ok(throwImpact(d, 16).dmg <= HEALTH.throwMax);
  // thrown things can't finish you off
  b.hp = 3;
  w.hurt(b, 30, "a", { canKO: false });
  assert.equal(b.hp, 1);
  assert.equal(b.move.knockT, 0);
});

test("the mime traps you in an invisible box, then fights", () => {
  const { w, p } = quiet();
  const mime = w.npc.place("mime", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(p.move.trapT > 0, "trapped");
  const z0 = p.move.z;
  idle(w, "a", 0.5, { mz: 1, sprint: true });
  assert.ok(Math.abs(p.move.z - z0) < 0.35, "can't walk out of the box");
  settle(w, 0.8);
  assert.ok(["chase", "windup"].includes(mime.state), `mime ${mime.state}`);
});

test("pigeon lady: swarm slows you; dodging shakes some pigeons off", () => {
  const { w, p } = quiet();
  w.npc.place("pigeon_lady", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(p.move.swarmT > 4, "swarmed");
  idle(w, "a", 1, { mz: 1 });
  assert.ok(Math.hypot(p.move.vx, p.move.vz) <= PLAYER.walkSpeed * 0.6 + 0.01, "slowed down");
  const before = p.move.swarmT;
  idle(w, "a", 1 / 60, { mz: 1, dodge: true });
  assert.ok(p.move.swarmT < before - 1.4, "dodge shook pigeons off");
});

test("tourist camera flash, bystanders flee, influencer films (extra notoriety)", () => {
  const { w, p } = quiet();
  w.npc.place("tourist", 0, -18.8, Math.PI);
  const by = w.npc.place("businessman", 3, -16, 0);
  const inf = w.npc.place("influencer", -4, -15, 0);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "flash" && e.p === "a"));
  assert.equal(by.state, "flee", "bystander flees");
  assert.equal(inf.state, "film", "influencer films");
  assert.ok(p.notoriety >= 20, `notoriety ${p.notoriety}`);
});

test("thrown items bonk pedestrians and knock their loot out", () => {
  const { w } = quiet();
  const n = w.npc.place("businessman", 0, -14, Math.PI);
  const cone = w.placeItem("traffic_cone", 0, 0, -19.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: cone });
  settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0.12 });
  const ev: WorldEvent[] = [];
  settle(w, 1.5, ev);
  assert.ok(ev.some((e) => e.t === "npcHit" && e.how === "throw"), "bonked by the cone");
  assert.ok(n.robbed);
});

test("the crowd stays full: robbed pedestrians far from everyone get replaced", () => {
  const w = new World({ seed: 8, spawnLoot: false });
  w.addPlayer("a", "A");
  for (const n of [...w.npc.npcs.values()].slice(0, 6)) n.robbed = true;
  settle(w, 6);
  assert.equal([...w.npc.npcs.values()].filter((n) => !n.post).length, NPC_COUNT);
});

test("pedestrian world is deterministic (same seed + inputs = same crowd)", () => {
  const run = () => {
    const w = new World({ seed: 21, spawnLoot: false });
    w.addPlayer("a", "A");
    for (let i = 0; i < 900; i++) {
      w.pushInputs("a", [inp(i, { mz: 1, yaw: 0.3 })]);
      if (i % 50 === 0) w.action("a", { a: "punch", yaw: 0.3, pitch: 0 });
      w.tick();
    }
    return JSON.stringify([...w.npc.npcs.values()].map((n) => [n.id, n.move.x.toFixed(6), n.move.z.toFixed(6), n.state]));
  };
  assert.equal(run(), run());
});

test("fighters give up: when you get far away, and after 8 s of chasing", () => {
  // run away (far)
  {
    const { w } = quiet();
    const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    idle(w, "a", 0.8);
    assert.ok(["chase", "windup"].includes(bro.state), `chasing (${bro.state})`);
    w.debugTeleport("a", 30, -30, 0); // 30+ m away
    idle(w, "a", 0.5);
    assert.ok(["huff", "walk"].includes(bro.state), `gave up when far (${bro.state})`);
  }
  // keep just out of reach for a long time: gives up after ~8 s
  {
    const { w, p } = quiet();
    const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    let gaveUp = -1;
    for (let k = 0; k < 120 && gaveUp < 0; k++) {
      // stay 6 m ahead of him (teleport-kite: tests the timer, not our running skill)
      const dx = p.move.x - bro.move.x, dz = p.move.z - bro.move.z, l = Math.max(0.01, Math.hypot(dx, dz));
      w.debugTeleport("a", bro.move.x + (dx / l) * 6, bro.move.z + (dz / l) * 6, 0);
      idle(w, "a", 0.1);
      if (bro.state === "huff") gaveUp = k * 0.1;
    }
    assert.ok(gaveUp > 6 && gaveUp < 10, `gave up after ${gaveUp.toFixed(1)} s`);
  }
});

test("heat: punching raises notoriety, mall cops count extra, and it cools down over time", () => {
  const { w, p } = quiet();
  w.npc.place("tourist", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const afterTourist = p.notoriety;
  assert.ok(afterTourist >= 10, `tourist punch heat ${afterTourist}`);
  idle(w, "a", 20);
  assert.ok(p.notoriety < afterTourist, `cooled down: ${afterTourist} -> ${p.notoriety.toFixed(1)}`);
  const q = quiet();
  q.w.npc.place("mall_cop", 0, -18.8, Math.PI);
  q.w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(q.p.notoriety >= afterTourist + 15 - 0.01, `mall cop heat ${q.p.notoriety} vs tourist ${afterTourist}`);
});

test("pedestrians step around players instead of walking through them", () => {
  const w = new World({ seed: 21, spawnLoot: false });
  const p = w.addPlayer("a", "Blocker");
  p.move.x = 0; p.move.z = -11; // on a busy route line near the plaza
  let closest = 9;
  for (let i = 0; i < 60 * 60; i++) {
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); w.takeEvents();
    for (const n of w.npc.npcs.values()) closest = Math.min(closest, Math.hypot(n.move.x - p.move.x, n.move.z - p.move.z));
  }
  assert.ok(closest > 0.45, `closest pedestrian got to ${closest.toFixed(2)} m (bodies overlap below ~0.76)`);
});

test("pedestrians ease into walking and curve around corners (no instant 90-degree snaps)", () => {
  const w = new World({ seed: 4, spawnLoot: false });
  let maxTurn = 0, maxAccel = 0;
  const prev = new Map<string, { yaw: number; v: number }>();
  for (let i = 0; i < 20 * 60; i++) {
    w.tick(); w.takeEvents();
    if (i % 2) continue; // pedestrians update at 30 Hz
    for (const n of w.npc.npcs.values()) {
      if (n.state !== "walk") { prev.delete(n.id); continue; }
      const v = n.curSpeed, o = prev.get(n.id); // intended walking speed (bumping a wall can still stop you dead)
      if (o) {
        let d = Math.abs(n.move.yaw - o.yaw); if (d > Math.PI) d = Math.PI * 2 - d;
        maxTurn = Math.max(maxTurn, d * 30); maxAccel = Math.max(maxAccel, Math.abs(v - o.v) * 30);
      }
      prev.set(n.id, { yaw: n.move.yaw, v });
    }
  }
  assert.ok(maxTurn <= 3.3, `walking turn rate peaked at ${maxTurn.toFixed(2)} rad/s`);
  assert.ok(maxAccel < 6, `walking acceleration peaked at ${maxAccel.toFixed(2)} m/s^2`);
});

test("pedestrians walk around parked cars: a chaser reaches you behind one, nobody ends up inside", () => {
  const city = buildTrashington();
  const cars = city.boxes.filter((b) => b.kind === "car");
  assert.ok(cars.length >= 10);
  let reached = 0;
  for (const c of cars.slice(0, 8)) {
    const long = c.d > c.w; // car's long axis along z?
    const w = new World({ seed: 4, npcs: 0, spawnLoot: false });
    const p = w.addPlayer("a", "A");
    // player on one long side of the car, gym bro straight across on the other side
    const ox = long ? c.w / 2 + 0.9 : 0, oz = long ? 0 : c.d / 2 + 0.9;
    p.move.x = c.x + ox; p.move.z = c.z + oz; p.move.immuneT = 99; // no knockdowns, just the chase
    const n = w.npc.place("gym_bro", c.x - ox, c.z - oz, 0);
    n.state = "chase"; n.target = "a"; n.chaseT = 0;
    let best = 99;
    for (let i = 0; i < 60 * 6; i++) {
      w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); w.takeEvents();
      const m = n.move;
      assert.ok(!(Math.abs(m.x - c.x) < c.w / 2 + 0.1 && Math.abs(m.z - c.z) < c.d / 2 + 0.1), "inside the car");
      best = Math.min(best, Math.hypot(m.x - p.move.x, m.z - p.move.z));
    }
    if (best < 1.6) reached++;
  }
  assert.ok(reached >= 7, `chaser got round the car ${reached}/8 times`);
});

test("C1.1 the doorman: stands at the apartment tower's door, sneers at bandits, fights back when punched, then goes back to his door", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  const post = w.arena.posts!.find((x) => x.kind === "doorman")!;
  const dm = [...w.npc.npcs.values()].find((n) => n.kind === "doorman")!;
  assert.ok(dm && Math.hypot(dm.move.x - post.x, dm.move.z - post.z) < 0.5 && dm.state === "work", "at his door");
  // stand in front of him for a while: he says something snooty
  w.debugTeleport("a", post.x, post.z - 1.6, 0);
  const ev: WorldEvent[] = [];
  settle(w, 90, ev); // (a greeting is a random chance each tick)
  assert.ok(ev.some((e) => e.t === "npcSay" && e.npc === dm.id && NPC_DEFS.doorman.lines.idle.includes(e.line)), "greets you, snootily");
  // punch him: heat, and he comes after you
  w.debugTeleport("a", dm.move.x, dm.move.z - 1.1, 0);
  settle(w, 0.1);
  const h0 = p.notoriety;
  w.action("a", { a: "punch", yaw: Math.atan2(dm.move.x - p.move.x, dm.move.z - p.move.z), pitch: 0 });
  const states = new Set<string>();
  for (let i = 0; i < 60 * 3; i++) { settle(w, 1 / 60, ev); states.add(dm.state); }
  assert.ok(p.notoriety > h0, "heat");
  assert.ok(states.has("chase") || states.has("windup"), `fights back (${[...states].join(", ")})`);
  // run far away: he gives up and walks back to his door
  w.debugTeleport("a", -97.5, -62, 0);
  settle(w, 40, ev);
  assert.ok(dm.state === "work" && Math.hypot(dm.move.x - post.x, dm.move.z - post.z) < 1, `back at his door (${dm.state} at ${dm.move.x.toFixed(1)},${dm.move.z.toFixed(1)})`);
});

test("C3 the fisherman: sits on his jetty by the pond, grumbles at bandits, whacks you with his rod, goes back to fishing", () => {
  const w = new World({ seed: 5, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  const post = w.arena.posts!.find((x) => x.kind === "fisherman")!;
  const fm = [...w.npc.npcs.values()].find((n) => n.kind === "fisherman")!;
  assert.ok(fm && Math.hypot(fm.move.x - post.x, fm.move.z - post.z) < 0.5 && fm.state === "work", "on his jetty");
  w.debugTeleport("a", post.x - 1.6, post.z, Math.PI / 2);
  const ev: WorldEvent[] = [];
  settle(w, 90, ev); // (a grumble is a random chance each tick)
  assert.ok(ev.some((e) => e.t === "npcSay" && e.npc === fm.id && NPC_DEFS.fisherman.lines.idle.includes(e.line)), "grumbles about the fish");
  w.debugTeleport("a", fm.move.x - 1.1, fm.move.z, Math.PI / 2);
  settle(w, 0.1);
  w.action("a", { a: "punch", yaw: Math.atan2(fm.move.x - p.move.x, fm.move.z - p.move.z), pitch: 0 });
  const states = new Set<string>();
  for (let i = 0; i < 60 * 3; i++) { settle(w, 1 / 60, ev); states.add(fm.state); }
  assert.ok(states.has("chase") || states.has("windup"), `fights back (${[...states].join(", ")})`);
  w.debugTeleport("a", -97.5, -62, 0);
  settle(w, 40, ev);
  assert.ok(fm.state === "work" && Math.hypot(fm.move.x - post.x, fm.move.z - post.z) < 1, `back on his jetty (${fm.state} at ${fm.move.x.toFixed(1)},${fm.move.z.toFixed(1)})`);
});
