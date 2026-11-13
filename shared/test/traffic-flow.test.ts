// 5A.1: traffic + pedestrians must never lock up (Blake: "NPCs stuck in cars", "traffic blockages").
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, nearBoxes, PLAYER, CAR_CLEAR_AFTER, type WorldEvent } from "../src/index.js";
import { setCityMap as useCity } from "../src/index.js";
useCity("classic"); // (R3: these tests were written for the classic city and its landmarks)

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

// =============================================================================================================
// R12.3b (Blake: "police cars get stuck with normal cars on the road, creating traffic jams"). The new city (where the
// cruisers patrol). Before: within a minute a cruiser and a car sat nose to nose, each waiting for the other, and the
// jam spread over the whole city for the rest of the game (cars stopped 460 s of 480).
// =============================================================================================================
import { setCityMap as useMap, COPCAR, CAR_HALF_LEN, CAR_HALF_WIDTH } from "../src/index.js";
/** how deep two boxes (x, z, yaw, half length, half width) overlap (0 = apart) */
function boxOverlap(a: { x: number; z: number; yaw: number; hl: number; hw: number }, b: typeof a) {
  const ax = [[Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(a.yaw), -Math.sin(a.yaw)]], bx = [[Math.sin(b.yaw), Math.cos(b.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)]];
  let min = Infinity;
  for (const [ux, uz] of [...ax, ...bx]) {
    const proj = (o: typeof a, axes: number[][]) => { const c = o.x * ux + o.z * uz, r = o.hl * Math.abs(axes[0][0] * ux + axes[0][1] * uz) + o.hw * Math.abs(axes[1][0] * ux + axes[1][1] * uz); return [c - r, c + r]; };
    const [a0, a1] = proj(a, ax), [b0, b1] = proj(b, bx);
    const o = Math.min(a1, b1) - Math.max(a0, b0); if (o <= 0) return 0; min = Math.min(min, o);
  }
  return min;
}
/** the new city for `minutes` with the police about: every way traffic and police can go wrong, measured */
function policeSoak(seed: number, minutes: number, chase: boolean, setup?: (w: World) => void) {
  useMap("new");
  const w = new World({ seed });
  for (let i = 0; i < 2; i++) w.addPlayer("p" + i, "P" + i);
  w.startMatch();
  const spots = [[-30, 52], [44, -14], [58, 40], [-58, -10], [10, 75]];
  setup?.(w);
  const still = new Map<string, number>(), pair = new Map<string, number>(), parked = new Map<string, number>();
  const r = { carStop: 0, copStop: 0, overlap: 0, offRoad: 0, mutual: 0, parkedMax: 0, deploys: 0, dispatches: 0, moved: new Map<string, number>(), waits: [] as string[], copAt: "" };
  const onRoad = (x: number, z: number) => w.arena.roadNet!.edges.some((e) => { const A = w.arena.roadNet!.nodes[e.a], B = w.arena.roadNet!.nodes[e.b]; if (e.arc) return Math.abs(Math.hypot(x - e.arc.cx, z - e.arc.cz) - e.arc.r) < 6; const ex = B.x - A.x, ez = B.z - A.z, L2 = ex * ex + ez * ez, k = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / L2)); return Math.hypot(A.x + ex * k - x, A.z + ez * k - z) < e.hw + 1.5; });
  for (let i = 0; i < minutes * 3600; i++) {
    if (chase && i % 300 === 0) for (const p of w.players.values()) { p.notoriety = 95; p.crimeT = w.time; p.seenT = w.time; p.jailT = 0; p.lock = null; }
    if (chase && i % 1800 === 0) w.players.forEach((_p, id) => { const q = spots[((id === "p0" ? 0 : 1) + Math.floor(i / 1800)) % 5]; w.debugTeleport(id, q[0], q[1], 0); });
    w.tick();
    for (const e of w.takeEvents() as any[]) if (e.t === "copCar") { if (e.stage === "deploy") r.deploys++; if (e.stage === "dispatch") r.dispatches++; }
    if (i % 6) continue;
    for (const c of w.traffic.cars) { const s = c.v < 0.3 ? (still.get(c.id) ?? 0) + 0.1 : 0; still.set(c.id, s); r.carStop = Math.max(r.carStop, s); r.moved.set(c.id, (r.moved.get(c.id) ?? 0) + c.v * 0.1); }
    for (const c of w.police.cars) {
      const s = c.v < 0.3 && c.mode !== "parked" ? (still.get(c.id) ?? 0) + 0.1 : 0; still.set(c.id, s); if (s > r.copStop) r.copAt = `${c.id} (${c.mode}) at ${c.x.toFixed(1)},${c.z.toFixed(1)}`; r.copStop = Math.max(r.copStop, s);
      const pk = c.mode === "parked" ? (parked.get(c.id) ?? 0) + 0.1 : 0; parked.set(c.id, pk); r.parkedMax = Math.max(r.parkedMax, pk);
      if (!onRoad(c.x, c.z)) r.offRoad++;
      for (const t of w.traffic.cars) {
        r.overlap = Math.max(r.overlap, boxOverlap({ x: c.x, z: c.z, yaw: c.yaw, hl: COPCAR.halfLen, hw: COPCAR.halfWidth }, { x: t.x, z: t.z, yaw: t.yaw, hl: CAR_HALF_LEN, hw: CAR_HALF_WIDTH }));
        // a car and a cop car both stopped, each held up by the other
        const k = c.id + "/" + t.id;
        if (t.v < 0.3 && c.v < 0.3 && t.by === c.id && (c.waitFor === t.id || c.ride?.by === t.id)) { pair.set(k, (pair.get(k) ?? 0) + 0.1); r.mutual = Math.max(r.mutual, pair.get(k)!); } else pair.delete(k);
      }
    }
    for (const q of (w.traffic as any).waits?.(60) ?? []) r.waits.push(`${q.id} ${q.waitT.toFixed(0)} s on ${q.road}: ${q.why} ${q.by}`);
  }
  return r;
}
test("R12.3b: police cruisers on patrol and the traffic never lock up (new city, 4 seeds x 4 min): nobody waits on anybody for good", () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = policeSoak(seed, 4, false);
    assert.ok(r.carStop < 75, `seed ${seed}: a car stood still ${r.carStop.toFixed(0)} s (before the fix: the whole game) ${r.waits.slice(0, 3).join("; ")}`);
    // (R13: 50, was 45. A lock-up is minutes; the worst real wait is at the biggest junction (four ways, 7 s each, 28 m
    //  turns): arrive on red, then lose one green to a slow car still finishing its turn from the phase before: ~49 s.
    //  Found when the stores' customers changed the random sequence; a real lock-up it also found is fixed in traffic.ts
    //  (blockGap: a walker flickering in and out of a car's path kept restarting its wait, so it never asked them to move))
    assert.ok(r.copStop < 50, `seed ${seed}: a cruiser stood still ${r.copStop.toFixed(0)} s (${r.copAt})`);
    assert.ok(r.mutual < 3, `seed ${seed}: a car and a cop car waited on each other ${r.mutual.toFixed(1)} s`);
    assert.ok(r.overlap < 0.05, `seed ${seed}: a cop car and a car overlapped by ${r.overlap.toFixed(2)} m`);
    assert.equal(r.offRoad, 0, `seed ${seed}: a cop car off the road`);
    for (const [id, m] of r.moved) assert.ok(m > 150, `seed ${seed}: ${id} only got ${m.toFixed(0)} m in 4 minutes`);
  }
});
test("R12.3b: chases (two wanted bandits, cop cars sent, officers dropped off, cars moving on, leaving): traffic flows, no clipping, nothing off the road", () => {
  for (const seed of [1, 2, 5]) {
    const r = policeSoak(seed, 4, true);
    assert.ok(r.dispatches >= 5 && r.deploys >= 3, `seed ${seed}: a real chase (${r.dispatches} cars sent, ${r.deploys} officers dropped off)`);
    assert.ok(r.carStop < 75, `seed ${seed}: a car stood still ${r.carStop.toFixed(0)} s ${r.waits.slice(0, 3).join("; ")}`);
    assert.ok(r.mutual < 3, `seed ${seed}: a car and a cop car waited on each other ${r.mutual.toFixed(1)} s`);
    assert.ok(r.overlap < 0.05, `seed ${seed}: a cop car and a car overlapped by ${r.overlap.toFixed(2)} m`);
    assert.equal(r.offRoad, 0, `seed ${seed}: a cop car off the road`);
    // (Blake: it drops an officer off, waits about 8 s and moves on: it never seals a road for long)
    assert.ok(r.parkedMax <= COPCAR.parkFor + 6, `seed ${seed}: a cop car sat ${r.parkedMax.toFixed(0)} s where it stopped`);
  }
});
test("R12.3b: the reproduced jam (seed 1: cop1 and c19 nose to nose at junction 2 from 36 s): it never forms, and traffic keeps moving past", () => {
  const r = policeSoak(1, 2, false);
  assert.ok(r.carStop < 60, `a car stood still ${r.carStop.toFixed(0)} s`);
  assert.ok(r.mutual < 3);
});
test("R12.3b: a parade closing a street with the police about: cars and cruisers go round, nobody's stuck behind it for good", () => {
  const r = policeSoak(3, 3, true, (w) => { w.match.cancelPlannedEvents(); });
  void r;
  useMap("new");
  const w = new World({ seed: 3 });
  for (let i = 0; i < 2; i++) w.addPlayer("p" + i, "P" + i);
  w.startMatch();
  for (let i = 0; i < 60 * 12; i++) { w.tick(); w.takeEvents(); }
  w.match.trigger("parade");
  const still = new Map<string, number>(); let worst = 0, mutual = 0;
  for (let i = 0; i < 60 * 120; i++) {
    w.tick(); w.takeEvents();
    if (i % 6) continue;
    for (const c of [...w.traffic.cars, ...((w.traffic as any).riders ?? [])]) { const s = c.v < 0.3 ? (still.get(c.id) ?? 0) + 0.1 : 0; still.set(c.id, s); worst = Math.max(worst, s); }
    for (const c of w.police.cars) for (const t of w.traffic.cars) if (t.v < 0.3 && c.v < 0.3 && t.by === c.id && c.ride?.by === t.id) mutual++;
  }
  assert.ok(worst < 75, `a car stood still ${worst.toFixed(0)} s during the parade`);
  assert.equal(mutual, 0);
});
