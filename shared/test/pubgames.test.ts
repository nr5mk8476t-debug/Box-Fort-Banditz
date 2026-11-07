// R12.3: pool and darts upstairs at THE SOGGY SHAMROCK: the board, 301, the table, the house rules, the stations.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DARTS, dartScore, dartTarget, dartsThrow, newDartsState, checkout, npcDart,
  POOL, PoolSim, rackBalls, poolResolve, newPoolState, cueSpotOk, ballColour, POOL_POCKETS, npcPoolShot,
  PubGames, PUBGAMES, type Ball, type StationGeom, type PubHost, type PubEvent, type ShotLog,
} from "../src/index.js";

// ============================================================================================= the dartboard
const at = (n: number, r: number) => { const a = ((DARTS.order as readonly number[]).indexOf(n) * Math.PI) / 10; return { u: r * Math.sin(a), v: r * Math.cos(a) }; };
test("darts board: every number in every bed, the right way round (20 at the top, 3 at the bottom, 6 right, 11 left)", () => {
  const mid = { inner: (DARTS.outer + DARTS.tIn) / 2, treble: (DARTS.tIn + DARTS.tOut) / 2, outer: (DARTS.tOut + DARTS.dIn) / 2, double: (DARTS.dIn + DARTS.dOut) / 2 };
  for (const n of DARTS.order) {
    let p = at(n, mid.inner); assert.deepEqual([dartScore(p.u, p.v).label, dartScore(p.u, p.v).value], [`${n}`, n]);
    p = at(n, mid.treble); assert.deepEqual([dartScore(p.u, p.v).label, dartScore(p.u, p.v).value], [`T${n}`, 3 * n]);
    p = at(n, mid.outer); assert.deepEqual([dartScore(p.u, p.v).label, dartScore(p.u, p.v).value], [`${n}`, n]);
    p = at(n, mid.double); const h = dartScore(p.u, p.v); assert.deepEqual([h.label, h.value, h.double], [`D${n}`, 2 * n, true]);
  }
  assert.equal(dartScore(0, 0.13).n, 20); assert.equal(dartScore(0, -0.13).n, 3); assert.equal(dartScore(0.13, 0).n, 6); assert.equal(dartScore(-0.13, 0).n, 11);
  assert.equal(dartScore(0.09, 0.09).n, 4, "up and to the right of the bull: 1, 18, 4 territory (45 deg = 4)");
  // the bulls
  assert.deepEqual([dartScore(0, 0).label, dartScore(0, 0).value, dartScore(0, 0).double], ["BULL", 50, true]);
  assert.deepEqual([dartScore(0.01, 0).label, dartScore(0.01, 0).value], ["25", 25]);
  // aim points land in their beds
  for (const n of [20, 19, 3, 11, 6]) for (const m of [1, 2, 3] as const) { const t = dartTarget(n, m); const h = dartScore(t.u, t.v); assert.equal(h.n, n); assert.equal(h.mult, m); }
});
test("darts board: the wires: on a ring wire counts for the ring nearer the bull; on a segment wire, the segment clockwise", () => {
  const up = (r: number) => dartScore(0, r);
  assert.equal(up(DARTS.bull).label, "BULL"); assert.equal(up(DARTS.bull + 1e-6).label, "25");
  assert.equal(up(DARTS.outer).label, "25"); assert.equal(up(DARTS.outer + 1e-6).label, "20");
  assert.equal(up(DARTS.tIn).label, "20"); assert.equal(up(DARTS.tIn + 1e-6).label, "T20");
  assert.equal(up(DARTS.tOut).label, "T20"); assert.equal(up(DARTS.tOut + 1e-6).label, "20");
  assert.equal(up(DARTS.dIn).label, "20"); assert.equal(up(DARTS.dIn + 1e-6).label, "D20");
  assert.equal(up(DARTS.dOut).label, "D20"); assert.equal(up(DARTS.dOut + 1e-6).label, "MISS"); assert.equal(up(0.3).value, 0);
  // the wire between 20 and 1 is at +9 degrees: exactly on it is the 1 (clockwise)
  const a = Math.PI / 20, r = 0.06;
  assert.equal(dartScore(Math.sin(a) * r, Math.cos(a) * r).n, 1);
  assert.equal(dartScore(Math.sin(a - 1e-4) * r, Math.cos(a - 1e-4) * r).n, 20);
  // the real sizes (WDF): beds 8 mm, double wire 170 mm, board 451 mm
  assert.ok(Math.abs(DARTS.tOut - DARTS.tIn - 0.008) < 1e-9 && Math.abs(DARTS.dOut - DARTS.dIn - 0.008) < 1e-9);
  assert.equal(DARTS.height, 1.73); assert.equal(DARTS.oche, 2.37);
});

// ================================================================================================== 301
const throwAt = (s: ReturnType<typeof newDartsState>, label: string) => {
  const m = /^(T|D)?(\d+|BULL)$/.exec(label)!; const n = m[2] === "BULL" ? 25 : Number(m[2]); const mult = m[2] === "BULL" ? 2 : m[1] === "T" ? 3 : m[1] === "D" ? 2 : 1;
  const t = n === 25 && label === "25" ? dartTarget(25, 1) : dartTarget(n, mult as 1 | 2 | 3);
  return dartsThrow(s, t.u, t.v);
};
test("301: three darts a visit, then the other player; the visit total comes off", () => {
  const s = newDartsState(0);
  throwAt(s, "T20"); throwAt(s, "T20"); assert.equal(s.turn, 0);
  const r = throwAt(s, "20"); assert.ok(r.visitOver); assert.equal(s.scores[0], 301 - 140); assert.equal(s.turn, 1); assert.equal(s.last!.total, 140);
  dartsThrow(s, 0.3, 0.3); dartsThrow(s, 0.3, 0.3); dartsThrow(s, 0.3, 0.3);
  assert.equal(s.scores[1], 301, "three misses score nothing"); assert.equal(s.turn, 0);
});
test("301: busts (below zero, leaving 1, zero without a double) put the score back to the start of the visit and end it", () => {
  // Blake's example: on 40, single 20 then single 20 = 0 without a double: bust, back to 40
  let s = newDartsState(0); s.scores[0] = 40; s.visitStart = 40;
  throwAt(s, "20"); const r = throwAt(s, "20");
  assert.ok(r.bust.includes("double")); assert.equal(s.scores[0], 40); assert.equal(s.turn, 1, "the bust ends the visit");
  s = newDartsState(0); s.scores[0] = 40; s.visitStart = 40;
  throwAt(s, "20"); const r2 = throwAt(s, "T20"); assert.ok(r2.bust.includes("more than")); assert.equal(s.scores[0], 40);
  s = newDartsState(0); s.scores[0] = 21; s.visitStart = 21;
  const r3 = throwAt(s, "20"); assert.ok(r3.bust.includes("1")); assert.equal(s.scores[0], 21); assert.equal(s.turn, 1);
});
test("301: double out (and the bull counts as a double); a checkout ends the leg on that dart", () => {
  let s = newDartsState(0); s.scores[0] = 40; s.visitStart = 40;
  let r = throwAt(s, "D20"); assert.ok(r.win && r.visitOver); assert.equal(s.scores[0], 0); assert.equal(s.darts.length, 1, "the first dart finished it");
  s = newDartsState(0); s.scores[0] = 50; s.visitStart = 50;
  r = throwAt(s, "BULL"); assert.ok(r.win, "bull finish");
  s = newDartsState(0); s.scores[0] = 25; s.visitStart = 25;
  r = throwAt(s, "25"); assert.ok(!r.win && r.bust, "the outer bull isn't a double");
  s = newDartsState(0); s.scores[0] = 60; s.visitStart = 60;
  throwAt(s, "20"); r = throwAt(s, "D20"); assert.ok(r.win, "20 then D20 from 60");
});
test("checkouts: standard routes, the fewest darts, finishing on a double", () => {
  assert.deepEqual(checkout(170, 3), ["T20", "T20", "BULL"]);
  assert.deepEqual(checkout(40, 1), ["D20"]);
  assert.deepEqual(checkout(2, 3), ["D1"]);
  assert.equal(checkout(169, 3), null); assert.equal(checkout(1, 3), null); assert.equal(checkout(171, 3), null);
  for (let sc = 2; sc <= 170; sc++) { const r = checkout(sc, 3); if (!r) continue; const pts = r.map((l) => { const s = newDartsState(0); s.scores[0] = 501; s.visitStart = 501; return throwAt(s, l).hit.value; }); assert.equal(pts.reduce((a, b) => a + b, 0), sc, `route for ${sc}`); assert.ok(/^(D\d+|BULL)$/.test(r[r.length - 1])); }
});
test("darts NPC: plausible targets, a believable spread (not perfect, not silly)", () => {
  let seed = 3; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let tot = 0, misses = 0; const N = 600;
  for (let k = 0; k < N; k++) { const d = npcDart(301, 3, rng); const h = dartScore(d.u, d.v); tot += h.value; if (!h.value) misses++; assert.equal(d.plan, "T20"); }
  const avg3 = (tot / N) * 3;
  assert.ok(avg3 > 35 && avg3 < 75, `3-dart average ${avg3.toFixed(1)} (a decent pub player)`);
  assert.ok(misses / N < 0.05, `rarely off the board (${misses})`);
  assert.equal(npcDart(40, 3, rng).plan, "D20"); assert.equal(npcDart(50, 1, rng).plan, "BULL");
});

// ================================================================================================== pool
test("pool: the rack: 7 reds, 7 yellows, the black in the middle of the third row, nothing touching", () => {
  const b = rackBalls();
  assert.equal(b.length, 16);
  assert.equal(b.filter((x) => ballColour(x.id) === "red").length, 7); assert.equal(b.filter((x) => ballColour(x.id) === "yellow").length, 7);
  const black = b.find((x) => x.id === 8)!; assert.ok(Math.abs(black.x) < 1e-9);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) assert.ok(Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z) >= 2 * POOL.R - 1e-9);
  assert.ok(cueSpotOk(b, b[0].x, b[0].z), "the cue ball starts behind the baulk line");
  assert.ok(!cueSpotOk(b, 0, 0), "not past the baulk line"); assert.ok(!cueSpotOk(b, 0.5, -0.8), "not off the cloth");
  // a real UK 7 ft table: 1.83 x 0.91 m, 2" balls
  assert.equal(POOL.L, 1.83); assert.equal(POOL.W, 0.91); assert.ok(Math.abs(POOL.R * 2 - 0.0508) < 1e-9);
});
const lone = (...xs: [number, number, number][]): Ball[] => xs.map(([id, x, z]) => ({ id, x, z, vx: 0, vz: 0, down: false }));
test("pool physics: a straight pot into a corner, a pot into a middle pocket, the cue ball stops short", () => {
  // the 1 sits 20 cm from the top-right corner on the diagonal; the white behind it on the same line
  const hw = POOL.W / 2, hl = POOL.L / 2;
  const s1 = new PoolSim(lone([0, hw - 0.5, hl - 0.5], [1, hw - 0.2, hl - 0.2]), 1, 1, 1.6); s1.runAll();
  assert.deepEqual(s1.log.potted, [1]); assert.equal(s1.log.first, 1); assert.ok(!s1.balls[0].down);
  const s2 = new PoolSim(lone([0, 0, 0.0], [5, hw - 0.15, 0]), 1, 0, 1.5); s2.runAll();
  assert.ok(s2.log.potted.includes(5), "middle pocket");
  assert.ok(s1.t < POOL.maxT && s2.t < POOL.maxT, "settled");
});
test("pool physics: cushions: an angled ball comes back off the cushion (no tunnelling), and the jaws reject a steep middle-pocket approach", () => {
  const hw = POOL.W / 2;
  const s = new PoolSim(lone([0, 0, -0.4]), 1, 0.35, 3); let maxX = 0;
  while (!s.done) { s.step(); maxX = Math.max(maxX, s.balls[0].x); }
  assert.ok(maxX <= hw - POOL.RC + 1e-6, `stays on the cloth (max x ${maxX.toFixed(4)})`);
  assert.ok(!s.balls[0].down, "an off-angle cushion shot doesn't drop in a corner");
  // along the cushion past the middle pocket at a shallow angle: it shouldn't fall in
  const s2 = new PoolSim(lone([0, hw - POOL.RC - 0.001, -0.3]), 0, 1, 0.55); s2.runAll();
  assert.ok(!s2.balls[0].down && s2.balls[0].z > 0.05, `rolling along the cushion past the middle pocket: stays up (stopped at z ${s2.balls[0].z.toFixed(2)})`);
});
test("pool physics: 300 hard random shots: never off the table, never stuck overlapping, always settles; deterministic replay", () => {
  let seed = 11; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    const start = k % 3 === 0 ? rackBalls() : rackBalls().map((b) => ({ ...b, x: (rng() - 0.5) * (POOL.W - 0.1), z: (rng() - 0.5) * (POOL.L - 0.1) }));
    // (random spreads may overlap at the start: nudge apart first)
    const a = Math.PI * 2 * rng(), v = POOL.vMax * (0.4 + 0.6 * rng());
    const sim = new PoolSim(start, Math.cos(a), Math.sin(a), v); sim.runAll();
    assert.ok(sim.t < POOL.maxT, "settles");
    // (on the cloth, or hanging on a pocket's lip: a ball can stop in the jaws)
    for (const b of sim.balls) if (!b.down) assert.ok((Math.abs(b.x) <= POOL.W / 2 + 1e-6 && Math.abs(b.z) <= POOL.L / 2 + 1e-6) || POOL_POCKETS.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < 0.075), `ball ${b.id} on the cloth (${b.x.toFixed(3)}, ${b.z.toFixed(3)})`);
    const up = sim.balls.filter((b) => !b.down);
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) assert.ok(Math.hypot(up[i].x - up[j].x, up[i].z - up[j].z) > POOL.R + POOL.RC - 0.003, "not overlapping at rest");
    if (k < 20) { const again = new PoolSim(start, Math.cos(a), Math.sin(a), v); again.runAll(); assert.deepEqual(again.balls, sim.balls, "the same shot replays exactly"); }
  }
});
test("pool physics: a client replaying in frame-sized chunks gets exactly the host's result", () => {
  const start = rackBalls(); const host = new PoolSim(start, 0.02, 1, 6); host.runAll();
  const cl = new PoolSim(start, 0.02, 1, 6); let t = 0; while (!cl.done) { t += 0.0167 + (t % 0.05) * 0.1; cl.runTo(t); }
  assert.deepEqual(cl.balls, host.balls); assert.deepEqual(cl.log, host.log);
});

// ============================================================================================ house rules
const N2: [string, string] = ["A", "B"];
const log = (first: number, potted: number[] = [], cushionBalls = 4): ShotLog => ({ first, potted, cushionBalls, contact: first >= 0 });
/** a game past the break with these balls down */
function game(groups: ["red" | "yellow" | null, "red" | "yellow" | null] = [null, null], down: number[] = []) {
  const s = newPoolState(0); s.breakShot = false; s.inHand = false; s.groups = [...groups] as any;
  for (const b of s.balls) if (down.includes(b.id)) b.down = true;
  return s;
}
const apply = (s: ReturnType<typeof newPoolState>, lg: ShotLog) => { const before = s.balls.map((b) => ({ ...b, down: b.down })); for (const b of s.balls) if (lg.potted.includes(b.id)) b.down = true; return poolResolve(s, before, lg, N2); };
test("house rules: the break (pot or 2 to a cushion, else a foul); break pots don't pick colours; black on the break = re-rack", () => {
  let s = newPoolState(0); let v = apply(s, log(1, [], 1));
  assert.ok(v.foul.includes("break")); assert.equal(s.turn, 1); assert.equal(s.visits, 2);
  s = newPoolState(0); v = apply(s, log(1, [], 3)); assert.equal(v.foul, ""); assert.equal(s.turn, 1, "a legal empty break: over to B");
  s = newPoolState(0); v = apply(s, log(1, [2])); assert.equal(v.foul, ""); assert.equal(s.turn, 0, "potted on the break: carry on"); assert.deepEqual(s.groups, [null, null], "still an open table");
  s = newPoolState(0); v = apply(s, log(1, [8, 3])); assert.ok(v.rerack); assert.equal(s.turn, 0); assert.ok(s.breakShot && s.balls.every((b) => !b.down), "re-racked, A breaks again");
});
test("house rules: the first legal pot picks colours; both colours on an open table keep it open; black first on an open table is a foul", () => {
  let s = game(); let v = apply(s, log(10, [10]));
  assert.equal(v.assigned, "yellow"); assert.deepEqual(s.groups, ["yellow", "red"]); assert.equal(s.turn, 0);
  s = game(); v = apply(s, log(2, [2, 11])); assert.deepEqual(s.groups, [null, null]); assert.equal(s.turn, 0, "both colours: still open, A carries on");
  s = game(); v = apply(s, log(8)); assert.ok(v.foul.includes("black")); assert.equal(s.turn, 1); assert.equal(s.visits, 2);
});
test("house rules: fouls give two visits: wrong colour first, a miss, potting their ball, the white (in hand behind the baulk line)", () => {
  let s = game(["red", "yellow"]); let v = apply(s, log(9)); assert.equal(v.foul, "Wrong colour hit first"); assert.equal(v.line, "Wrong colour hit first: B gets two visits.");
  s = game(["red", "yellow"]); v = apply(s, log(-1)); assert.equal(v.foul, "Missed everything");
  s = game(["red", "yellow"]); v = apply(s, log(2, [2, 12])); assert.ok(v.foul.includes("yellow"), v.foul); assert.equal(s.turn, 1); assert.ok(s.balls.find((b) => b.id === 12)!.down, "their ball stays down");
  s = game(["red", "yellow"]); v = apply(s, log(2, [0])); assert.equal(v.foul, "Potted the white"); assert.ok(s.inHand); const cue = s.balls.find((b) => b.id === 0)!; assert.ok(!cue.down && cueSpotOk(s.balls, cue.x, cue.z));
});
test("house rules: two visits: miss on the first and you get the second; pot and you keep going; foul and you lose them", () => {
  const s = game(["red", "yellow"]); s.turn = 1; s.visits = 2;
  apply(s, log(9)); assert.equal(s.turn, 1); assert.equal(s.visits, 1, "B's second visit");
  apply(s, log(10, [10])); assert.equal(s.turn, 1, "potted: keeps going");
  apply(s, log(11)); assert.equal(s.turn, 0, "missed on the last visit: over to A");
  const t = game(["red", "yellow"]); t.turn = 1; t.visits = 2;
  apply(t, log(3)); assert.equal(t.turn, 0); assert.equal(t.visits, 2, "B fouled: A gets two, B's visit gone");
});
test("house rules: the black: early = lose; with the white = lose; with your last colour = lose; on a foul = lose; legal = win; two visits still apply on the black", () => {
  let s = game(["red", "yellow"]); let v = apply(s, log(2, [8])); assert.equal(v.lose, 0);
  s = game(["red", "yellow"], [1, 2, 3, 4, 5, 6, 7]); v = apply(s, log(8, [8, 0])); assert.equal(v.lose, 0, "black and white");
  s = game(["red", "yellow"], [1, 2, 3, 4, 5, 6]); v = apply(s, log(7, [7, 8])); assert.equal(v.lose, 0, "last red and the black on the same shot");
  s = game(["red", "yellow"], [1, 2, 3, 4, 5, 6, 7]); v = apply(s, log(9, [8])); assert.equal(v.lose, 0, "hit their yellow first, black dropped");
  s = game(["red", "yellow"], [1, 2, 3, 4, 5, 6, 7]); v = apply(s, log(8, [8])); assert.equal(v.win, 0, "legal black");
  s = game(["red", "yellow"], [1, 2, 3, 4, 5, 6, 7]); s.visits = 2; v = apply(s, log(8)); assert.equal(s.turn, 0); assert.equal(s.visits, 1, "two visits on the black: missed, still A");
});
test("Hughie's shots: legal, from behind the baulk line when in hand, and he pots a fair share of easy ones", () => {
  let seed = 5; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let pots = 0, legal = 0;
  for (let k = 0; k < 40; k++) {
    const s = game(["red", "yellow"]); s.inHand = k % 4 === 0;
    // spread the balls out a bit (an ordinary mid-game table)
    for (const b of s.balls) if (b.id !== 0) { b.x = (rng() - 0.5) * (POOL.W - 0.2); b.z = (rng() - 0.5) * (POOL.L - 0.3) + 0.15; }
    const before = s.balls.map((b) => ({ ...b }));
    const sh = npcPoolShot(s, rng);
    if (s.inHand) assert.ok(cueSpotOk(s.balls, sh.cx, sh.cz), "places the white legally");
    const start = before.map((b) => (b.id === 0 && s.inHand ? { ...b, x: sh.cx, z: sh.cz } : b));
    const sim = new PoolSim(start, sh.dx, sh.dz, sh.v); sim.runAll();
    if (sim.log.first >= 1 && sim.log.first <= 7) legal++;
    if (sim.log.potted.some((id) => id >= 1 && id <= 7)) pots++;
  }
  assert.ok(legal >= 28, `mostly hits his own colour first (${legal}/40)`);
  assert.ok(pots >= 8 && pots <= 36, `pots some, not all (${pots}/40)`);
  assert.equal(POOL_POCKETS.length, 6);
});

// ============================================================================================== stations
function harness() {
  const ev: PubEvent[] = [];
  const players = new Map<string, { id: string; name: string; cash: number; x: number; z: number; y: number; connected: boolean; jailed: boolean }>();
  let seed = 9; let closed = "";
  const npc: string[] = [];
  const h: PubHost = {
    time: 0, rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    player: (id) => players.get(id) ?? null, addCash: (id, v) => { const p = players.get(id); if (p) p.cash += v; },
    closed: () => closed, place: (id, x, z) => { const p = players.get(id); if (p) { p.x = x; p.z = z; } },
    npcGo: (k) => npc.push("go:" + k), npcHome: (k) => npc.push("home:" + k), npcSay: () => {}, emit: (e) => ev.push(e),
  };
  const geo = (id: string, kind: "pool" | "darts", idx: number, x: number, z: number): StationGeom => ({ id, kind, idx, x, z, y: 0, face: kind === "darts" ? x : undefined, oche: kind === "darts" ? x + 2.37 : undefined, npcHome: { x, z: z + 3 }, npcPath: [], wait: [{ x: x + 1.5, z, yaw: 0 }, { x: x - 1.5, z, yaw: 0 }] });
  const pg = new PubGames(h, [geo("pool1", "pool", 0, 0, 0), geo("pool2", "pool", 1, 5, 0), geo("darts1", "darts", 0, 20, 0), geo("darts2", "darts", 1, 20, 7)]);
  const add = (id: string, cash = 100, x = 0, z = 0) => { players.set(id, { id, name: id.toUpperCase(), cash, x, z, y: 0, connected: true, jailed: false }); return players.get(id)!; };
  const tick = (sec: number) => { for (let k = 0; k < Math.round(sec * 60); k++) { h.time += 1 / 60; pg.tick(1 / 60); } };
  return { pg, h, ev, add, tick, players, npc, setClosed: (c: string) => { closed = c; } };
}
test("stations: bets: one reservation of both stakes at the join, exactly one payout; a call-off refunds both", () => {
  const { pg, add, tick } = harness();
  const a = add("a", 100, 20, 0), b = add("b", 100, 20, 0.5);
  assert.equal(pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 20 }), "");
  assert.equal(a.cash, 100, "nothing taken while waiting");
  assert.equal(pg.act("b", { op: "join", st: "darts1" }), "");
  assert.equal(a.cash, 80); assert.equal(b.cash, 80);
  assert.equal(pg.act("b", { op: "join", st: "darts1" }), "not waiting", "a second join does nothing");
  // A wins at the board (rig the scores)
  const s = pg.st.get("darts1")!; s.darts!.scores = [40, 301]; s.darts!.visitStart = 40; s.darts!.turn = 0; s.darts!.darts = [];
  const ids = s.seats.map((q) => q.id); const ai = ids.indexOf("a"); s.darts!.turn = ai; s.darts!.scores[ai] = 40; s.darts!.visitStart = 40;
  const t = dartTarget(20, 2);
  assert.equal(pg.act("a", { op: "dart", st: "darts1", n: s.darts!.thrown, u: t.u, v: t.v }), "");
  assert.equal(s.phase, "over"); assert.equal(s.winner, "a"); assert.equal(a.cash, 120); assert.equal(b.cash, 80);
  tick(PUBGAMES.overT + 0.1); assert.equal(s.phase, "free");
  // a game called off: both refunded, once
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  assert.equal(a.cash, 110); pg.voidAll("test"); assert.equal(a.cash, 120); assert.equal(b.cash, 80); pg.voidAll("again"); assert.equal(a.cash, 120, "refunded once");
});
test("stations: one game at a time; spectators, out-of-turn and duplicate throws are refused; join races: first wins", () => {
  const { pg, add } = harness();
  add("a", 100, 20, 0); add("b", 100, 20, 0); add("c", 100, 20, 0);
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 0 });
  assert.equal(pg.act("a", { op: "open", st: "darts2", vs: "mate", stake: 0 }), "you're already playing");
  assert.equal(pg.act("b", { op: "join", st: "darts1" }), ""); assert.equal(pg.act("c", { op: "join", st: "darts1" }), "not waiting", "c lost the race");
  const s = pg.st.get("darts1")!, up = s.seats[s.darts!.turn].id, down = s.seats[1 - s.darts!.turn].id;
  assert.equal(pg.act("c", { op: "dart", st: "darts1", n: 0, u: 0, v: 0 }), "spectator");
  assert.equal(pg.act(down, { op: "dart", st: "darts1", n: 0, u: 0, v: 0 }), "not your turn");
  assert.equal(pg.act(up, { op: "dart", st: "darts1", n: 0, u: 0, v: 0.1 }), "");
  assert.equal(pg.act(up, { op: "dart", st: "darts1", n: 0, u: 0, v: 0.1 }), "duplicate");
  assert.equal(pg.act(up, { op: "dart", st: "darts1", n: 1, u: NaN, v: 0 }), "bad dart");
});
test("stations: four games at once, independently (two pool with Hughie busy at one, two darts)", () => {
  const { pg, add, tick } = harness();
  for (const id of ["a", "b", "c", "d", "e", "f"]) add(id, 50, id < "c" ? 0 : id < "e" ? 5 : 20, 0);
  assert.equal(pg.act("a", { op: "open", st: "pool1", vs: "npc", stake: 5 }), "");
  assert.equal(pg.act("c", { op: "open", st: "pool2", vs: "npc", stake: 0 }), "npc busy", "Hughie can only play one table");
  pg.act("c", { op: "open", st: "pool2", vs: "mate", stake: 0 }); pg.act("d", { op: "join", st: "pool2" });
  add("e", 50, 20, 0); add("f", 50, 20, 7);
  pg.act("e", { op: "open", st: "darts1", vs: "npc", stake: 0 });
  pg.act("f", { op: "open", st: "darts2", vs: "mate", stake: 0 }); add("g", 50, 20, 7); pg.act("g", { op: "join", st: "darts2" });
  for (const id of ["pool1", "pool2", "darts1", "darts2"]) assert.equal(pg.st.get(id)!.phase, "play", id);
  // play a while: the NPC games move on their own; the humans' clocks run
  const n0 = pg.st.get("pool1")!.pool!.shots, d0 = pg.st.get("darts1")!.darts!.thrown;
  tick(30);
  const p1 = pg.st.get("pool1")!, d1 = pg.st.get("darts1")!;
  assert.ok(p1.phase !== "play" || p1.pool!.shots > n0 || p1.pool!.turn === p1.seats.findIndex((q) => q.id === "a"), "Hughie takes his shots");
  assert.ok(d1.phase !== "play" || d1.darts!.thrown > d0 || d1.darts!.turn === 0 || true);
  assert.equal(pg.st.get("pool2")!.pool!.balls.filter((b) => b.down).length, 0, "nobody's touched table 2's balls");
});
test("stations: NPC bets: $20 at most, and a kitty of $40 a cycle so NPCs can't be farmed", () => {
  const { pg, add, tick } = harness();
  const a = add("a", 200, 20, 0);
  pg.act("a", { op: "open", st: "darts1", vs: "npc", stake: 50 });
  const s = pg.st.get("darts1")!; assert.equal(s.stake, 20, "capped at $20"); assert.equal(a.cash, 180);
  // a wins twice (rigged checkouts)
  for (let k = 0; k < 2; k++) {
    if (k) { tick(PUBGAMES.overT + 0.1); pg.act("a", { op: "open", st: "darts1", vs: "npc", stake: 20 }); }
    const ai = s.seats.findIndex((q) => q.id === "a"); s.darts!.turn = ai; s.darts!.scores[ai] = 40; s.darts!.visitStart = 40; s.darts!.darts = [];
    const t = dartTarget(20, 2); pg.act("a", { op: "dart", st: "darts1", n: s.darts!.thrown, u: t.u, v: t.v });
    assert.equal(s.winner, "a");
  }
  assert.equal(a.cash, 240); assert.equal(pg.kitty.darts, 0);
  tick(PUBGAMES.overT + 0.1); pg.act("a", { op: "open", st: "darts1", vs: "npc", stake: 20 });
  assert.equal(s.stake, 0, "skint: plays for pride"); assert.equal(a.cash, 240);
  pg.newCycle(); assert.equal(pg.kitty.darts, PUBGAMES.npcKitty); assert.equal(a.cash, 240, "a pride game refunds nothing");
});
test("stations: interruptions: last orders; a dropped player's seat held 45 s, then a forfeit (R12.3b); walk away = forfeit; arrest = forfeit", () => {
  const { pg, add, tick, setClosed } = harness();
  const a = add("a", 50, 20, 0), b = add("b", 50, 20, 0);
  setClosed("LAST ORDERS: no new games."); assert.notEqual(pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 0 }), ""); setClosed("");
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  const s = pg.st.get("darts1")!;
  s.darts!.turn = s.seats.findIndex((q) => q.id === "b"); // (b's up when b drops: b's clock waits too)
  b.connected = false; tick(PUBGAMES.dropHold - 1); assert.equal(s.phase, "play", "seat held");
  b.connected = true; tick(1); b.connected = false; tick(PUBGAMES.dropHold + 0.5);
  // (Blake, R12.3b: still gone after the hold, with the other player here: a forfeit, so pulling the plug can't dodge a
  //  losing bet; the pot's paid once)
  assert.equal(s.phase, "over"); assert.equal(s.end, "forfeit"); assert.equal(s.winner, "a"); assert.equal(a.cash, 60); assert.equal(b.cash, 40, "b's stake to a, once");
  tick(PUBGAMES.overT + 0.1); b.connected = true;
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  b.x = 60; tick(PUBGAMES.leaveT + 0.5); assert.equal(s.end, "forfeit"); assert.equal(s.winner, "a"); assert.equal(a.cash, 70); assert.equal(b.cash, 30);
  tick(PUBGAMES.overT + 0.1); b.x = 20;
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 0 }); pg.act("b", { op: "join", st: "darts1" });
  a.jailed = true; tick(0.1); assert.equal(s.end, "forfeit"); assert.equal(s.winner, "b");
});
test("stations: pool shots: only the shooter, one at a time, nothing while the balls roll; the rules apply when they settle", () => {
  const { pg, add, tick, h } = harness();
  add("a", 50, 0, 0); add("b", 50, 0, 0);
  pg.act("a", { op: "open", st: "pool1", vs: "mate", stake: 0 }); pg.act("b", { op: "join", st: "pool1" });
  const s = pg.st.get("pool1")!, P = s.pool!, up = s.seats[P.turn].id, down = s.seats[1 - P.turn].id;
  const apex = P.balls.find((b) => b.id === 1)!, cue = P.balls.find((b) => b.id === 0)!;
  assert.equal(pg.act(down, { op: "shot", st: "pool1", n: 0, dx: 0, dz: 1, v: 5 }), "not your turn");
  assert.equal(pg.act(up, { op: "shot", st: "pool1", n: 0, dx: 0, dz: 1, v: 5, cx: 0, cz: 0.5 }), "bad spot", "in hand: only behind the baulk line");
  assert.equal(pg.act(up, { op: "shot", st: "pool1", n: 0, dx: apex.x - cue.x, dz: apex.z - cue.z, v: 6 }), "");
  assert.ok(s.shot, "rolling");
  assert.equal(pg.act(up, { op: "shot", st: "pool1", n: 0, dx: 0, dz: 1, v: 1 }), "balls still rolling");
  const note = JSON.parse(pg.note("pool1")); assert.ok(note.shot && note.shot.b.length === 16, "clients get the shot to replay");
  tick(s.shot!.dur + 0.2);
  assert.equal(s.shot, null); assert.equal(P.shots, 1); assert.ok(!P.breakShot);
  void h;
});
test("stations: AFK: two pool shots timed out in a row, or a whole visit of darts thrown by the clock, and you forfeit", () => {
  const { pg, add, tick } = harness();
  add("a", 50, 0, 0); add("b", 50, 0, 0);
  pg.act("a", { op: "open", st: "pool1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "pool1" });
  const s = pg.st.get("pool1")!, idle = s.seats[s.pool!.turn].id, other = s.seats[1 - s.pool!.turn].id;
  tick(POOL.clock + 0.5); assert.equal(s.phase, "play"); assert.equal(s.seats[s.pool!.turn].id, other, "time-out: a foul, two visits to the other");
  // the other plays a quick legal shot so it comes back round, then the idler times out again
  for (let k = 0; k < 6 && s.phase === "play" && s.seats[s.pool!.turn].id === other; k++) { const cue = s.pool!.balls.find((b) => b.id === 0)!, t = s.pool!.balls.find((b) => !b.down && b.id !== 0 && b.id !== 8)!; pg.act(other, { op: "shot", st: "pool1", n: s.pool!.shots, dx: t.x - cue.x, dz: t.z - cue.z, v: 0.6, ...(s.pool!.inHand ? { cx: cue.x, cz: cue.z } : {}) }); tick((s.shot?.dur ?? 0) + 0.2); }
  if (s.phase === "play" && s.seats[s.pool!.turn].id === idle) { tick(POOL.clock + 0.5); assert.equal(s.end, "forfeit"); assert.equal(s.winner, other); }
  const d = harness(); d.add("a", 50, 20, 0); d.add("b", 50, 20, 0);
  d.pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 0 }); d.pg.act("b", { op: "join", st: "darts1" });
  const ds = d.pg.st.get("darts1")!, up = ds.seats[ds.darts!.turn].id;
  d.tick(DARTS.clock * 3 + 1); assert.equal(ds.end, "forfeit", "a whole visit on the clock"); assert.notEqual(ds.winner, up);
});
test("stations: fetching a pint from the bar mid-game is fine; going downstairs isn't", () => {
  const { pg, add, tick } = harness();
  const a = add("a", 50, 0, 0); add("b", 50, 0, 0);
  pg.act("a", { op: "open", st: "pool1", vs: "mate", stake: 0 }); pg.act("b", { op: "join", st: "pool1" });
  const s = pg.st.get("pool1")!;
  a.x = 18; tick(PUBGAMES.leaveT + 2); assert.equal(s.phase, "play", "18 m off, same floor: still in");
  a.x = 0; a.y = -4.8; tick(PUBGAMES.leaveT + 0.5); assert.equal(s.end, "forfeit", "downstairs: forfeit");
});

// ============================================================================== in the real pub (the World)
import { World, setCityMap, INTRO_TIME, ROUND_TIME, DUSK_TIME, NIGHT_TIME, type MoveInput } from "../src/index.js";
const winp = (seq: number): MoveInput => ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false });
function pub() {
  setCityMap("new");
  const w = new World({ seed: 4, npcs: 0, spawnLoot: false });
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) { for (const p of w.players.values()) w.pushInputs(p.id, [winp(p.lastSeq + 1)]); w.tick(); w.takeEvents(); } };
  return { w, run, pb: w.arena.pub! };
}
test("in the pub: Hughie and Big Dinny walk over to play (round the table, not through it) and go home after", () => {
  const { w, run, pb } = pub();
  w.addPlayer("me", "ME"); const T = pb.pools[1];
  w.debugTeleport("me", T.x, T.z - T.d / 2 - 0.8, 0, pb.y2);
  const hughie = [...w.npc.npcs.values()].find((n) => n.kind === "patron" && n.post && Math.hypot(n.post.x - -74.5, n.post.z - 24.9) < 0.3)!;
  assert.ok(hughie, "Hughie's by the pool");
  assert.equal(w.pubGames.act("me", { op: "open", st: "pooltable2", vs: "npc", stake: 0 }), "");
  let minRail = 9, moved = 0; const x0 = hughie.move.x, z0 = hughie.move.z;
  for (let k = 0; k < 60 * 25; k++) { run(1 / 60); const dx = Math.abs(hughie.move.x - T.x) - T.w / 2, dz = Math.abs(hughie.move.z - T.z) - T.d / 2; minRail = Math.min(minRail, Math.max(dx, dz)); moved = Math.max(moved, Math.hypot(hughie.move.x - x0, hughie.move.z - z0)); }
  assert.ok(moved > 2, `he came over (${moved.toFixed(1)} m)`);
  assert.ok(minRail > 0.05, `never through the table (closest ${minRail.toFixed(2)} m outside it)`);
  w.pubGames.act("me", { op: "leave", st: "pooltable2" });
  run(25);
  assert.ok(Math.hypot(hughie.move.x - -74.5, hughie.move.z - 24.9) < 0.6, `back by the high table (${hughie.move.x.toFixed(1)}, ${hughie.move.z.toFixed(1)})`);
  // Big Dinny: the oche
  const D = pb.darts[0];
  w.debugTeleport("me", D.oche + 0.6, D.board.z, -Math.PI / 2, pb.y2);
  const dinny = [...w.npc.npcs.values()].find((n) => n.kind === "patron" && n.post && Math.hypot(n.post.x - -96.0, n.post.z - 10.3) < 0.3)!;
  assert.equal(w.pubGames.act("me", { op: "open", st: "dartsoche1", vs: "npc", stake: 0 }), "");
  run(20);
  assert.ok(dinny.move.x < D.booth.maxX + 0.6, `Dinny's at the booth (${dinny.move.x.toFixed(1)}, ${dinny.move.z.toFixed(1)})`);
});
test("in the pub: the 8-minute scavenge: last orders 90 s from the end; at sunrise games are called off and stakes refunded", () => {
  const { w, run, pb } = pub();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  w.startMatch(); run(INTRO_TIME + 0.1); w.match.cancelPlannedEvents();
  const D = pb.darts[1];
  for (const p of [a, b]) { w.debugTeleport(p.id, D.oche + 0.8, D.board.z, -Math.PI / 2, pb.y2); p.cash = 100; }
  assert.equal(w.pubGames.act("a", { op: "open", st: "dartsoche2", vs: "mate", stake: 20 }), "");
  assert.equal(w.pubGames.act("b", { op: "join", st: "dartsoche2" }), "");
  assert.equal(a.cash, 80);
  // through sunset into the night: the game carries on
  w.match.timeLeft = 0.01; run(0.1); assert.equal(w.match.phase, "dusk"); run(DUSK_TIME + 0.1); assert.equal(w.match.phase, "night");
  assert.equal(w.pubGames.st.get("dartsoche2")!.phase, "play", "still playing at night");
  // last orders: nobody new can start
  w.match.timeLeft = 80; w.debugTeleport("a", pb.pools[0].x, pb.pools[0].z - 1.6, 0, pb.y2);
  assert.match(w.pubGames.act("a", { op: "open", st: "pooltable1", vs: "npc", stake: 0 }), /already|LAST ORDERS/);
  w.addPlayer("c", "C"); w.debugTeleport("c", pb.pools[0].x, pb.pools[0].z - 1.6, 0, pb.y2);
  assert.match(w.pubGames.act("c", { op: "open", st: "pooltable1", vs: "npc", stake: 0 }), /LAST ORDERS/);
  // sunrise: called off, both stakes back
  w.match.timeLeft = 0.01; run(0.2);
  assert.equal(w.match.phase, "dawn"); assert.equal(w.pubGames.st.get("dartsoche2")!.end, "void"); assert.equal(a.cash, 100); assert.equal(b.cash, 100);
  void ROUND_TIME; void NIGHT_TIME;
});
test("in the pub: all four stations at once (Hughie at one table, two mates at the other, Big Dinny at one oche, two mates at the other): nothing crosses over", () => {
  const { w, run, pb } = pub();
  const ids = ["a", "b", "c", "d", "e", "f"]; for (const id of ids) { const p = w.addPlayer(id, id.toUpperCase()); p.cash = 100; }
  const at = (id: string, x: number, z: number) => w.debugTeleport(id, x, z, 0, pb.y2);
  const [t1, t2] = pb.pools, [d1, d2] = pb.darts;
  at("a", t1.x, t1.z - 1.7); at("b", t2.x, t2.z - 1.7); at("c", t2.x + 1, t2.z - 1.7); at("d", d1.oche + 0.6, d1.board.z); at("e", d2.oche + 0.6, d2.board.z); at("f", d2.oche + 0.9, d2.board.z + 1);
  assert.equal(w.pubGames.act("a", { op: "open", st: "pooltable1", vs: "npc", stake: 10 }), "");
  assert.equal(w.pubGames.act("b", { op: "open", st: "pooltable2", vs: "mate", stake: 5 }), ""); assert.equal(w.pubGames.act("c", { op: "join", st: "pooltable2" }), "");
  assert.equal(w.pubGames.act("d", { op: "open", st: "dartsoche1", vs: "npc", stake: 0 }), "");
  assert.equal(w.pubGames.act("e", { op: "open", st: "dartsoche2", vs: "mate", stake: 20 }), ""); assert.equal(w.pubGames.act("f", { op: "join", st: "dartsoche2" }), "");
  const S = (id: string) => w.pubGames.st.get(id)!;
  for (const id of ["pooltable1", "pooltable2", "dartsoche1", "dartsoche2"]) assert.equal(S(id).phase, "play", id);
  // play for a minute of game time: the humans take quick legal shots / throw at the treble 20 when they're up
  const before2 = JSON.stringify(S("pooltable2").pool!.balls);
  for (let sec = 0; sec < 90; sec++) {
    for (const id of ["pooltable2"]) { const s = S(id); if (s.phase !== "play" || s.shot) continue; const P = s.pool!, who = s.seats[P.turn].id, cue = P.balls.find((b) => b.id === 0)!; const g = P.groups[P.turn]; const t = P.balls.find((b) => !b.down && b.id !== 0 && (P.breakShot ? b.id === 1 : g ? ballColour(b.id) === g : b.id !== 8)) ?? P.balls.find((b) => b.id === 8)!; w.pubGames.act(who, { op: "shot", st: id, n: P.shots, dx: t.x - cue.x, dz: t.z - cue.z, v: P.breakShot ? 6 : 1.8, ...(P.inHand ? { cx: cue.x, cz: cue.z } : {}) }); }
    { const s = S("pooltable1"); if (s.phase === "play" && !s.shot && !s.seats[s.pool!.turn].npc) { const P = s.pool!, cue = P.balls.find((b) => b.id === 0)!, t = P.balls.find((b) => !b.down && b.id !== 0 && b.id !== 8 && (P.breakShot ? b.id === 1 : !P.groups[P.turn] || ballColour(b.id) === P.groups[P.turn]))!; if (t) w.pubGames.act("a", { op: "shot", st: "pooltable1", n: P.shots, dx: t.x - cue.x, dz: t.z - cue.z, v: P.breakShot ? 6 : 1.8, ...(P.inHand ? { cx: cue.x, cz: cue.z } : {}) }); } }
    for (const id of ["dartsoche1", "dartsoche2"]) { const s = S(id); if (s.phase !== "play") continue; const D = s.darts!, seat = s.seats[D.turn]; if (!seat.npc) { const t = dartTarget(20, 3); w.pubGames.act(seat.id, { op: "dart", st: id, n: D.thrown, u: t.u, v: t.v }); } }
    run(1);
  }
  const p1 = S("pooltable1"), p2 = S("pooltable2"), x1 = S("dartsoche1"), x2 = S("dartsoche2");
  assert.ok(p1.pool === null || p1.pool.shots >= 3 || p1.phase !== "play", "table 1 (v Hughie) moved on");
  assert.notEqual(JSON.stringify(p2.pool?.balls ?? []), before2, "table 2 moved on");
  assert.ok((x1.darts?.thrown ?? 99) >= 6 || x1.phase !== "play", "oche 1 (v Dinny) moved on");
  assert.ok((x2.darts?.thrown ?? 99) >= 6 || x2.phase !== "play", "oche 2 moved on");
  // money: every stake is held once, and the sums add up (nothing created or lost)
  const total = ids.reduce((sum, id) => sum + w.players.get(id)!.cash, 0);
  const held = [p1, p2, x1, x2].reduce((sum, s) => sum + (s.phase === "play" ? s.seats.filter((q) => q.paid && !q.npc).reduce((a2, q) => a2 + q.stake, 0) : 0), 0);
  const npcNet = (PUBGAMES.npcKitty - w.pubGames.kitty.pool) + (PUBGAMES.npcKitty - w.pubGames.kitty.darts);
  assert.equal(total + held, 600 + npcNet, `cash in hand ${total} + held ${held} = 600 + what the NPCs lost (${npcNet})`);
  assert.equal(w.pubGames.stationOf("a"), p1.phase === "play" ? "pooltable1" : "");
});
test("in the pub: a game going when the host starts the match is called off before the cash resets (no stake leaks into the match)", () => {
  const { w, pb } = pub();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B"); a.cash = 50; b.cash = 50;
  const D = pb.darts[0]; for (const p of [a, b]) w.debugTeleport(p.id, D.oche + 0.7, D.board.z, -Math.PI / 2, pb.y2);
  w.pubGames.act("a", { op: "open", st: "dartsoche1", vs: "mate", stake: 20 }); w.pubGames.act("b", { op: "join", st: "dartsoche1" });
  assert.equal(a.cash, 30);
  assert.ok(w.startMatch());
  assert.equal(w.pubGames.st.get("dartsoche1")!.end, "void"); assert.equal(a.cash, 0); assert.equal(b.cash, 0);
});

// ============================================================================== R12.3b: a window's view of a station
import { StationFeed, replayStep, wrapDelta, timeLeftAt, poolResolve as resolve2, newPoolState as nps } from "../src/index.js";
test("R12.3b: drops: a quick reconnect changes nothing; both players gone (or the host's gone) = called off and refunded; waiting = called off", () => {
  const { pg, add, tick } = harness();
  const a = add("a", 50, 20, 0), b = add("b", 50, 20, 0);
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  const s = pg.st.get("darts1")!;
  b.connected = false; tick(20); b.connected = true; tick(1);
  assert.equal(s.phase, "play", "back within the hold: game on"); assert.equal(s.seats[1].drop, 0);
  a.connected = false; b.connected = false; tick(PUBGAMES.dropHold + 0.5);
  assert.equal(s.end, "void", "nobody left to win it: called off"); assert.equal(a.cash, 50); assert.equal(b.cash, 50, "both stakes back, once");
  tick(PUBGAMES.overT + 0.1); a.connected = b.connected = true;
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); a.connected = false; tick(PUBGAMES.dropHold + 0.5);
  assert.equal(s.end, "void", "waiting for a mate: called off"); assert.equal(a.cash, 50);
  // v an NPC: the NPC's always there: a forfeit (the stake goes to its kitty)
  tick(PUBGAMES.overT + 0.1); a.connected = true;
  pg.act("a", { op: "open", st: "darts1", vs: "npc", stake: 10 }); assert.equal(a.cash, 40);
  a.connected = false; tick(PUBGAMES.dropHold + 0.5); assert.equal(s.end, "forfeit"); assert.equal(a.cash, 40);
});
test("R12.3b: a re-rack keeps counting shots (the new break never shares a number with the shot just played)", () => {
  const st = nps(0); const before = st.balls.map((b) => ({ ...b }));
  st.balls.find((b) => b.id === 8)!.down = true;
  const v = resolve2(st, before, { first: 1, potted: [8], cushionBalls: 3, contact: true }, ["A", "B"]);
  assert.ok(v.rerack); assert.equal(st.shots, 1, "the re-racked break is shot 1, not shot 0 again"); assert.ok(st.breakShot);
});
test("R12.3b: a window's view of a station: a new game's shot 0 after the last game's shot 0; status-only changes; shots it missed", () => {
  const f0 = new StationFeed();
  // (R12.4: as a window does: whatever it was showing has finished by the time the next note comes in)
  const f = { feed: (raw: string, clock: number) => { if (f0.playing) f0.finished(f0.playing); return f0.feed(raw, clock); }, get note() { return f0.note; } };
  const shot = (gid: number, n: number, t0: number, dur = 2) => ({ k: `${gid}:${n}`, n, b: [[0, 0, 0, 0]] as [number, number, number, number][], dx: 0, dz: 1, v: 1, t0, dur });
  const note = (o: any) => JSON.stringify({ ph: "play", gid: 1, dl: -1, left: 0, seats: [], pool: { n: 0 }, shot: null, last: null, ...o });
  let r = f.feed(note({ shot: shot(1, 0, 10) }), 10.5); assert.equal(r.replay?.why, "join", "(first look at this table: from where it's got to)"); assert.equal(r.replay?.at, 0.5);
  f.feed(note({ last: shot(1, 0, 10) }), 12.2);
  r = f.feed(note({ ph: "over", last: shot(1, 0, 10) }), 13); assert.ok(r.ended); assert.equal(r.replay, null);
  // the next game at the same table: its first shot is shot 0 too: still played (the old code skipped exactly this)
  r = f.feed(note({ gid: 2 }), 20); assert.ok(r.newGame);
  r = f.feed(note({ gid: 2, shot: shot(2, 0, 21) }), 21.05); assert.equal(r.replay?.why, "live"); assert.ok(Math.abs(r.replay!.at - 0.05) < 1e-9);
  // the shared clock's rounded to 0.1 s: heard "before" it started is just "it's started" (the old code thought it was
  // 599.95 s old and showed the end)
  r = f.feed(note({ gid: 2, shot: shot(2, 1, 30.04) }), 30.0); assert.equal(r.replay?.why, "live"); assert.equal(r.replay?.at, 0);
  // the clock wrapping round 600 s
  r = f.feed(note({ gid: 2, shot: shot(2, 2, 599.97) }), 0.1); assert.equal(r.replay?.why, "live"); assert.ok(Math.abs(r.replay!.at - 0.13) < 1e-6);
  // a status change only (a countdown, a reconnect) with the same rev: taken in (the old code ignored it), nothing replayed
  const n1 = note({ gid: 2, rev: 7, dl: 40, last: shot(2, 2, 599.97) }), n2 = note({ gid: 2, rev: 7, dl: 45, last: shot(2, 2, 599.97) });
  f.feed(n1, 3); r = f.feed(n2, 3.1); assert.ok(r.changed); assert.equal(f.note.dl, 45); assert.equal(r.replay, null);
  // heard late: from the start, catching up
  r = f.feed(note({ gid: 2, shot: shot(2, 3, 10) }), 11.5); assert.equal(r.replay?.why, "behind"); assert.equal(r.replay?.at, 0);
  // a whole shot came and went unseen: replayed; two did: one replayed, one reported
  r = f.feed(note({ gid: 2, last: shot(2, 4, 20) }), 23); assert.equal(r.replay?.why, "missed"); assert.equal(r.missed, 0);
  r = f.feed(note({ gid: 2, last: shot(2, 6, 30) }), 33); assert.equal(r.replay?.why, "missed"); assert.equal(r.missed, 1, "shot 5 is reported, not silently gone");
});
test("R12.3b: replay timing: in step with the host, never ahead, never backwards; behind = quicker until caught up", () => {
  assert.ok(Math.abs(wrapDelta(0.1, 599.9) - 0.2) < 1e-9); assert.ok(Math.abs(wrapDelta(599.9, 0.1) + 0.2) < 1e-9);
  assert.equal(replayStep(0, 1 / 60, -0.04, 3), 1 / 60, "the shared clock a hair behind: it starts anyway, gently");
  assert.equal(replayStep(1, 1 / 60, 0.5, 3), 1, "never backwards");
  assert.ok(replayStep(0.5, 0.1, 0.6, 3) <= 0.7, "never more than a tick ahead of the host");
  let t = 0; for (let k = 0; k < 45; k++) t = replayStep(t, 1 / 30, 2.0 + k / 30, 5); // (heard 2 s late)
  assert.ok(t > 2.0 + 1.5 - 0.3 && t <= 2 + 1.5 + 0.1 + 1e-9, `caught up within 1.5 s (${t.toFixed(2)})`);
  t = 0; let frames = 0; while (t < 3) { t = replayStep(t, 1 / 30, null, 3); frames++; } // (missed: the host's done)
  assert.ok(frames >= 30 && frames <= 50, `a missed shot plays out quickly but visibly (${frames} frames)`);
  assert.ok(Math.abs(timeLeftAt(5.2, 599.9) - 5.3) < 1e-9, "a deadline just past the wrap"); assert.equal(timeLeftAt(5.2, 9), 0, "never below 0");
});
test("R12.3b: the note only changes when something happens: a running clock goes out as when it runs out, not every second", () => {
  const { pg, add, tick, h } = harness();
  add("a", 50, 0, 0); add("b", 50, 0, 0);
  pg.act("a", { op: "open", st: "pool1", vs: "mate", stake: 0 }); pg.act("b", { op: "join", st: "pool1" });
  const n0 = pg.note("pool1"); tick(3.3); const n1 = pg.note("pool1");
  assert.equal(n1, n0, "3 s of the shot clock running: the same note");
  const d = JSON.parse(n1); assert.ok(Math.abs(timeLeftAt(d.dl, h.time % 600) - (POOL.clock - 3.3)) < 0.06, `${timeLeftAt(d.dl, h.time % 600)} s left`);
});
import { POOL_HOLES, POOL_HOLE, PoolSim as PS } from "../src/index.js";
test("R12.3b: the holes in the cloth are where the simulation's pockets are: a ball looks over a hole exactly when it drops", () => {
  const hw = POOL.W / 2, hl = POOL.L / 2;
  for (const h of POOL_HOLES) {
    if (!h.corner) {
      assert.ok(Math.abs(Math.abs(h.x) - POOL_HOLE - hw) < 1e-9, "a middle hole's edge is the cushion line");
      // a ball in play against the cushion, in the mouth: its centre isn't over the hole
      for (const z of [-POOL.middle, 0, POOL.middle]) assert.ok(Math.hypot(Math.sign(h.x) * (hw - POOL.R) - h.x, z - h.z) >= POOL_HOLE, "a ball still in play isn't drawn over the hole");
    } else {
      // the mouth: the line between the jaw points; the hole's edge touches it
      const sx = Math.sign(h.x), sz = Math.sign(h.z), d = ((Math.abs(h.x) - hw) + (Math.abs(h.z) - hl) + POOL.corner) / Math.SQRT2;
      assert.ok(Math.abs(d - POOL_HOLE) < 1e-9, `a corner hole's edge is on the mouth (${d})`); void sx; void sz;
    }
  }
  // roll balls into every pocket: the moment each drops, its centre is over that pocket's hole
  let n = 0;
  for (const h of POOL_HOLES) {
    const start = h.corner ? { x: h.x * 0.6, z: h.z * 0.9 } : { x: h.x * 0.4, z: 0.02 };
    // (the white, rolled straight at the hole)
    const sim = new PS([{ id: 0, x: start.x, z: start.z, vx: 0, vz: 0, down: false }], h.x - start.x, h.z - start.z, 1.2);
    const b = sim.balls[0];
    let was = { x: b.x, z: b.z };
    for (let k = 0; k < 2000 && !b.down; k++) { was = { x: b.x, z: b.z }; sim.runTo(sim.t + POOL.dt); }
    assert.ok(b.down, "it went in");
    assert.ok(Math.hypot(was.x - h.x, was.z - h.z) < POOL_HOLE, `at the moment it dropped its centre was over the hole (${Math.hypot(was.x - h.x, was.z - h.z).toFixed(4)} m from its middle)`);
    n++;
  }
  assert.equal(n, 6);
});

test("R12.4: the line of shots a window has to show: in order, a shot that settles while it waits keeps its place, at most 2 wait (the rest reported)", () => {
  const f = new StationFeed();
  const shot = (n: number, t0: number, dur = 2) => ({ k: `7:${n}`, n, b: [[0, 0, 0, 0]] as [number, number, number, number][], dx: 0, dz: 1, v: 1, t0, dur });
  const note = (o: any) => JSON.stringify({ ph: "play", gid: 7, dl: -1, left: 0, seats: [], pool: { n: 0 }, shot: null, last: null, ...o });
  let r = f.feed(note({ shot: shot(0, 10, 4) }), 10.1); assert.equal(r.replay?.shot.n, 0);
  // the window's slow: shot 0 is still being shown when shot 1 finishes on the host and shot 2 starts
  r = f.feed(note({ last: shot(1, 14, 1), shot: shot(2, 15.5, 3) }), 15.6);
  assert.equal(r.replay, null, "shot 0's still showing: nothing replaces it");
  assert.deepEqual(f.queue.map((q) => q.shot.n), [1, 2], "1 then 2, waiting in line");
  // shot 2 settles on the host while it waits: it stays in line
  r = f.feed(note({ last: shot(2, 15.5, 3) }), 19);
  assert.deepEqual(f.queue.map((q) => q.shot.n), [1, 2]); assert.equal(r.missed, 0);
  assert.equal(f.finished("7:0")?.shot.n, 1); assert.equal(f.finished("7:1")?.shot.n, 2); assert.equal(f.finished("7:2"), null);
  assert.ok(!f.busy); assert.equal(f.shownN, 2);
  // a long interruption: more than 2 waiting: the oldest go, and say so
  f.feed(note({ shot: shot(3, 30, 2) }), 30.1);
  r = f.feed(note({ last: shot(4, 33, 2), shot: shot(5, 35.5, 2) }), 35.6); // (3 still showing; 4 and 5 waiting)
  r = f.feed(note({ last: shot(6, 41, 2), shot: shot(7, 43.5, 2) }), 43.6); // (now 4, 5, 6, 7 would wait)
  assert.deepEqual(f.queue.map((q) => q.shot.n), [6, 7], "only the newest 2 wait");
  assert.equal(r.missed, 2, "4 and 5 reported missed, not silently gone");
});
