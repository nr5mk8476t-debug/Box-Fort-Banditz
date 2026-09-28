// 5A.1: traffic + pedestrians must never lock up (Blake: "NPCs stuck in cars", "traffic blockages").
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, nearBoxes, PLAYER, CAR_CLEAR_AFTER, type WorldEvent } from "../src/index.js";

const MOVING = new Set(["walk", "flee", "chase", "patrol", "sneak", "escape", "scram", "leave", "follow"]);

/** An NPC standing inside something solid (walls, parked cars, benches...). */
function insideSolid(w: World, x: number, z: number, y: number): string | null {
  for (const b of nearBoxes(w.arena, x, z, 1)) {
    if (b.kind === "bars" || b.y + b.h / 2 <= y + 0.35 || b.y - b.h / 2 >= y + 1.6) continue;
    if (Math.abs(x - b.x) < b.w / 2 + PLAYER.radius - 0.12 && Math.abs(z - b.z) < b.d / 2 + PLAYER.radius - 0.12) return b.kind;
  }
  return null;
}

/** Run the city for a while and collect every problem. */
function soak(seed: number, minutes: number, setup?: (w: World) => void, each?: (w: World) => void) {
  const w = new World({ seed });
  for (let i = 0; i < 2; i++) w.addPlayer("p" + i, "P" + i);
  setup?.(w);
  const last = new Map<string, { x: number; z: number; t: number }>();
  const stopped = new Map<string, number>();
  const problems: string[] = [];
  let maxCarStop = 0;
  for (let i = 0; i < minutes * 3600; i++) {
    each?.(w);
    w.tick(); w.takeEvents();
    if (i % 60) continue;
    const t = i / 60;
    for (const n of w.npc.npcs.values()) {
      const k = insideSolid(w, n.move.x, n.move.z, n.move.y);
      if (k) problems.push(`t=${t} ${n.kind} inside ${k}`);
      const l = last.get(n.id);
      if (!l || !MOVING.has(n.state) || Math.hypot(n.move.x - l.x, n.move.z - l.z) > 2) last.set(n.id, { x: n.move.x, z: n.move.z, t });
      else if (t - l.t > 20) { problems.push(`t=${t} ${n.kind} (${n.state}) stuck at ${n.move.x.toFixed(1)},${n.move.z.toFixed(1)}`); last.set(n.id, { x: n.move.x, z: n.move.z, t }); }
    }
    for (const c of w.traffic.cars) {
      const s = c.v < 0.3 ? (stopped.get(c.id) ?? 0) + 1 : 0;
      stopped.set(c.id, s); maxCarStop = Math.max(maxCarStop, s);
    }
  }
  return { w, problems, maxCarStop };
}

// (C1: cars now wait at traffic lights (up to ~21 s of red) and give way at junctions, so "stopped"
//  allows a red light plus a queue; gridlock would be minutes)
test("5-minute city soak (3 seeds): no pedestrian stuck > 20 s, none inside anything, no car stopped > 35 s (one red light + a queue; no gridlock), every road driven", () => {
  for (const seed of [1, 2, 3]) {
    const r = soak(seed, 5);
    assert.deepEqual(r.problems.slice(0, 5), [], `seed ${seed}`);
    assert.ok(r.maxCarStop <= 35, `seed ${seed}: a car stood still for ${r.maxCarStop} s`);
    const tr = r.w.traffic, unused = tr.lanes.filter((l) => !l.conn && tr.laneUse[l.id] === 0);
    assert.equal(unused.length, 0, `seed ${seed}: roads nobody drove: ${unused.map((l) => r.w.arena.roadNet!.edges[l.edge].name).join(", ")}`);
  }
});

test("soak with wanted bandits (cops running through traffic, cop cars): traffic still flows", () => {
  const r = soak(4, 4, undefined, (w) => { for (const p of w.players.values()) if (p.jailT <= 0 && p.respawnT <= 0) p.notoriety = 70; });
  assert.deepEqual(r.problems.filter((x) => !/cop/.test(x)).slice(0, 5), []);
  assert.ok(r.maxCarStop <= 35, `a car stood still for ${r.maxCarStop} s`);
});

test("a knocked-out pedestrian in the lane: the car waits, honks, the body is slid to the curb, traffic resumes", () => {
  const w = new World({ seed: 9 });
  const car = w.traffic.cars[0];
  // wait until the car is on a straight bit of road, then put someone flat on their back 8 m ahead
  const straight = () => Math.abs(Math.sin(car.yaw * 2)) < 1e-6;
  for (let i = 0; i < 600 && !straight(); i++) { w.tick(); w.takeEvents(); }
  for (let i = 0; i < 30; i++) { w.tick(); w.takeEvents(); }
  assert.ok(straight());
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const n = w.npc.place("tourist", car.x + fx * 8, car.z + fz * 8, 0);
  assert.ok(w.npc.onRoad(n.move.x, n.move.z));
  n.state = "ko"; n.stateT = 60;
  const ev: WorldEvent[] = [];
  let stoppedAt = -1, resumedAt = -1;
  for (let i = 0; i < 60 * 20; i++) {
    n.stateT = 60; // stays out cold the whole time
    w.tick(); ev.push(...w.takeEvents());
    if (stoppedAt < 0 && car.v < 0.3) stoppedAt = i / 60;
    if (stoppedAt >= 0 && resumedAt < 0 && car.v > 2) resumedAt = i / 60;
  }
  assert.ok(stoppedAt >= 0, "the car stopped for them");
  assert.ok(ev.some((e) => e.t === "honk" && e.car === car.id), "and honked");
  assert.ok(resumedAt > 0 && resumedAt - stoppedAt < CAR_CLEAR_AFTER + 6, `traffic resumed after ${(resumedAt - stoppedAt).toFixed(1)} s`);
  assert.ok(!w.npc.onRoad(n.move.x, n.move.z), "the body is off the road");
  assert.equal(insideSolid(w, n.move.x, n.move.z, n.move.y), null, "and not pushed into anything");
});

test("pedestrians wait at the curb for an oncoming car instead of stepping in front of it", () => {
  const w = new World({ seed: 5 });
  let waited = 0, badStep = 0;
  for (let i = 0; i < 60 * 120; i++) {
    w.tick(); w.takeEvents();
    if (i % 6) continue;
    for (const n of w.npc.npcs.values()) {
      if (n.state !== "walk") continue;
      if (n.waitT > 0.5) waited++;
      // a walker who has just stepped onto the road with a fast car right on top of them
      if (w.npc.onRoad(n.move.x, n.move.z) && !w.npc.onRoad(n.move.x - n.move.vx * 0.2, n.move.z - n.move.vz * 0.2)) {
        for (const c of w.traffic.cars) {
          const rx = n.move.x - c.x, rz = n.move.z - c.z, fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
          const along = rx * fx + rz * fz, side = rx * fz - rz * fx;
          if (c.v > 6 && along > 0 && along < 5 && Math.abs(side) < 2) badStep++; // stepped right in front of it
        }
      }
    }
  }
  assert.ok(waited > 0, "someone waited for a gap");
  assert.equal(badStep, 0, "nobody stepped out right in front of a fast car");
});
