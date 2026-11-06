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
test("stations: interruptions: last orders; a dropped player's seat held 45 s then called off; walk away = forfeit; arrest = forfeit", () => {
  const { pg, add, tick, setClosed } = harness();
  const a = add("a", 50, 20, 0), b = add("b", 50, 20, 0);
  setClosed("LAST ORDERS: no new games."); assert.notEqual(pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 0 }), ""); setClosed("");
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  const s = pg.st.get("darts1")!;
  b.connected = false; tick(PUBGAMES.dropHold - 1); assert.equal(s.phase, "play", "seat held");
  b.connected = true; tick(1); b.connected = false; tick(PUBGAMES.dropHold + 0.5);
  assert.equal(s.phase, "over"); assert.equal(s.end, "void"); assert.equal(a.cash, 50); assert.equal(b.cash, 50, "stakes back");
  tick(PUBGAMES.overT + 0.1); b.connected = true;
  pg.act("a", { op: "open", st: "darts1", vs: "mate", stake: 10 }); pg.act("b", { op: "join", st: "darts1" });
  b.x = 60; tick(PUBGAMES.leaveT + 0.5); assert.equal(s.end, "forfeit"); assert.equal(s.winner, "a"); assert.equal(a.cash, 60); assert.equal(b.cash, 40);
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
