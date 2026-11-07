import { test } from "node:test";
import assert from "node:assert/strict";
import { Snapshotter, applyDelta, emptyState } from "../src/p2p/sync.ts";
import { Spring } from "../src/game/spring.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { footPrism } from "../src/game/cityRenderer.ts";

function view() {
  return {
    phase: "lobby", ownerId: "h", code: "ABCDE", timeLeft: 10,
    players: new Map<string, any>([["h", { x: 1.23456789, z: 0, name: "Host" }]]),
    items: new Map<string, any>([["i1", { type: "tv", x: 5.123456, y: 0, z: 2 }]]),
    npcs: new Map<string, any>(), props: new Map<string, any>(), cars: new Map<string, any>(), copCars: new Map<string, any>(),
  };
}

test("joiner rebuilds the host's view from full snapshot + deltas", () => {
  const v = view();
  const s = new Snapshotter();
  s.diff(v);
  const joiner = emptyState();
  applyDelta(joiner, s.full(), true);
  assert.equal(joiner.code, "ABCDE");
  assert.equal(joiner.players.get("h").x, 1.23456789, "player numbers stay exact (prediction needs them)");
  assert.equal(joiner.items.get("i1").x, 5.123, "drawn-only numbers are rounded to mm");

  // changes: move the player, add a car, remove the item, tick the timer
  v.players.get("h").x = 2;
  v.cars.set("c1", { x: 1, z: 1, yaw: 0 });
  v.items.delete("i1");
  v.timeLeft = 9.9;
  const d = s.diff(v)!;
  assert.deepEqual(d.c!.players, { h: { x: 2 } }, "only the changed field is sent");
  applyDelta(joiner, d);
  assert.equal(joiner.players.get("h").x, 2);
  assert.equal(joiner.players.get("h").name, "Host");
  assert.ok(joiner.cars.has("c1"));
  assert.ok(!joiner.items.has("i1"));
  assert.equal(joiner.timeLeft, 9.9);
  assert.equal(s.diff(v), null, "nothing changed -> nothing sent");

  // sub-millimetre jitter on drawn-only things isn't worth sending
  v.cars.get("c1").x = 1.0001;
  assert.equal(s.diff(v), null);
});

// ---- the camera spring and the building prisms (were test/spring.test.ts) ----
test("spring stays stable and settles at very low frame rates (regression: camera blew up at ~10 FPS)", () => {
  for (const fps of [4, 10, 30, 60, 144]) {
    const s = new Spring(170, 20);
    s.kick(-1.6);
    let maxAbs = 0;
    for (let i = 0; i < fps * 3; i++) { s.update(1 / fps); maxAbs = Math.max(maxAbs, Math.abs(s.value)); }
    assert.ok(Number.isFinite(s.value), `finite at ${fps} fps`);
    assert.ok(maxAbs < 0.2, `dip stays small at ${fps} fps (${maxAbs.toFixed(3)})`);
    assert.ok(Math.abs(s.value) < 1e-3, `settles at ${fps} fps`);
  }
});

// R3 regression (Blake: "the buildings are see-through"): an angled building's mesh was wound inside out, so the
// GPU culled its outside faces. Every triangle must face out of the prism (Babylon: clockwise seen from outside).
test("angled-building prisms face outward (walls, roof and floor), so they aren't see-through", () => {
  const scene = new Scene(new NullEngine());
  const P: [number, number][] = [[0, 0], [6, 0], [5, 4], [1, 5]]; // (counter-clockwise on x/z, like Box.poly)
  for (const grow of [0, 0.25]) {
    const m = footPrism(scene, P, 0, 6, grow);
    const pos = m.getVerticesData(VertexBuffer.PositionKind)!, idx = m.getIndices()!;
    const cx = 3, cy = 3, cz = 2.25;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      // Babylon is left-handed: a front face's u x v (right-handed maths) points INTO the solid, so outward = -(u x v)
      const nx = -(uy * vz - uz * vy), ny = -(uz * vx - ux * vz), nz = -(ux * vy - uy * vx);
      const mx = (pos[a] + pos[b] + pos[c]) / 3 - cx, my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy, mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
      assert.ok(nx * mx + ny * my + nz * mz > 0, `triangle ${t / 3} (grow ${grow}) faces out`);
    }
  }
});

// =============================================================================================================
// R12.3b: the pub games as a window sees them. A real host (the World) and the real client view (PubGamesView),
// joined by a pretend network: the host's state goes out 20 times a second, arrives after a delay, and the window
// only looks at the newest state each frame (as the game does), at its own frame rate, with the odd stalled frame.
// =============================================================================================================
const stubEl = (): any => ({ id: "", className: "", innerHTML: "", textContent: "", style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, append() {}, appendChild() {}, getContext: () => new Proxy({}, { get: (t: any, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t: any, k, v) => { t[k] = v; return true; } }) });
function pubRig(seed = 4) {
  const g = globalThis as any;
  g.document ??= { createElement: () => stubEl(), getElementById: () => null, body: stubEl() };
  g.localStorage ??= { getItem: () => null, setItem() {} };
  g.window ??= g; g.addEventListener ??= () => {};
  return (async () => {
    const S = await import("@bfb/shared");
    const { PubGamesView } = await import("../src/game/pubGames.ts");
    S.setCityMap("new");
    const w = new S.World({ seed, npcs: 0, spawnLoot: false });
    const scene = new Scene(new NullEngine());
    const fb: string[] = [];
    const view = new PubGamesView(scene, w.arena, { act: (a) => { const { a: _k, ...rest } = a as any; w.pubGames.act(myId, rest); }, feedback: (t) => fb.push(t) });
    void S.StationFeed;
    let myId = "me";
    const pb = w.arena.pub!;
    const inp = (seq: number) => ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false });
    const shots: string[] = [];
    const hostTick = () => { for (const p of w.players.values()) w.pushInputs(p.id, [inp(p.lastSeq + 1)]); w.tick(); for (const e of w.takeEvents() as any[]) if (e.t === "pgShot") shots.push(`${e.st}/${w.pubGames.st.get(e.st).gid}:${e.n}`); };
    const lightT = () => { const o: Record<string, any> = {}; S.matchView(w, o); return o.lightT as number; };
    const notes = () => { const o: Record<string, string> = {}; for (const id of w.pubGames.st.keys()) o[id] = w.pubGames.note(id); return o; };
    return { S, w, view, pb, fb, hostTick, lightT, notes, shots, setMe: (id: string) => { myId = id; } };
  })();
}
/** a player who takes a sensible shot whenever it's their turn (aims at the nearest ball they're on) */
function poolBot(S: any, w: any, st: string, pid: string, soft = false) {
  const s = w.pubGames.st.get(st), P = s?.pool;
  if (!P || s.phase !== "play" || s.shot || s.seats[P.turn]?.id !== pid) return;
  const cue = P.balls.find((b: any) => b.id === 0), g = P.groups[P.turn];
  const t = P.balls.filter((b: any) => !b.down && b.id !== 0 && (P.breakShot ? b.id === 1 : g ? S.ballColour(b.id) === g : b.id !== 8)).sort((a: any, b: any) => Math.hypot(a.x - cue.x, a.z - cue.z) - Math.hypot(b.x - cue.x, b.z - cue.z))[0] ?? P.balls.find((b: any) => b.id === 8);
  w.pubGames.act(pid, { op: "shot", st, n: P.shots, dx: t.x - cue.x, dz: t.z - cue.z, v: P.breakShot ? 6.5 : soft ? 0.7 : 2.2 });
}
/** run the pretend network for `sec` seconds; returns what the window showed of each shot */
async function playOut(rig: any, o: { sec: number; fps: number; lat: number; stalls?: [number, number][]; me: string; each?: () => void }) {
  const { w, view, hostTick, lightT, notes } = rig;
  const sent: { at: number; lt: number; n: Record<string, string> }[] = [];
  const shown = new Map<any, { mid: number; dur: number; st: string }>();
  let T = 0, nextFrame = 0, nextPatch = 0;
  const shots0 = rig.shots.length;
  const step = 1 / 60;
  for (let k = 0; k < o.sec * 60; k++) {
    o.each?.(); hostTick(); T += step;
    if (T >= nextPatch) { nextPatch += 1 / 20; sent.push({ at: T, lt: lightT(), n: notes() }); }
    const stalled = (o.stalls ?? []).some(([a, d]) => T >= a && T < a + d);
    if (T >= nextFrame && !stalled) {
      const dt = T - (nextFrame - 1 / o.fps); nextFrame = T + 1 / o.fps;
      let latest: any = null; for (const p of sent) if (p.at + o.lat <= T) latest = p;
      if (!latest) continue;
      for (const [id, raw] of Object.entries(latest.n)) view.setNote(id, raw as string, latest.lt);
      const me = w.players.get(o.me)!;
      view.update(Math.min(dt, 0.5), { me: o.me, x: me.move.x, y: me.move.y, z: me.move.z, clock: latest.lt, pints: 0, tipsy: 0, others: [], hurt: false });
      for (const [id, s] of view.st) {
        if (s.kind !== "pool" || !s.sim) continue;
        // (each shot by its name where the window has one, else by the replay itself)
        const key = (s as any).key ? id + "/" + (s as any).key : s.sim;
        const r = shown.get(key) ?? { mid: 0, dur: 0, st: id, why: (s as any).why, gid: s.note?.gid }; shown.set(key, r);
        if (!s.sim.done && s.simT > 0) r.mid++;
      }
    }
  }
  // (a shot still rolling on the host when the time's up hasn't had its chance yet)
  let rolling = 0; for (const s of w.pubGames.st.values()) if (s.shot) rolling++;
  const seen = new Set([...shown.entries()].filter(([, q]) => q.mid >= 2).map(([k]) => k));
  const missing = rig.shots.slice(shots0).filter((k: string) => !seen.has(k));
  return { hostShots: rig.shots.length - shots0 - rolling, shown: [...shown.values()], missing };
}
async function poolGames(rig: any) {
  const { w, pb } = rig;
  w.addPlayer("me", "ME"); w.addPlayer("hana", "HANA"); w.addPlayer("gus", "GUS");
  const T1 = pb.pools[0], T2 = pb.pools[1];
  w.debugTeleport("me", T2.x, T2.z - T2.d / 2 - 0.8, 0, pb.y2);
  w.debugTeleport("hana", T1.x, T1.z - T1.d / 2 - 0.8, 0, pb.y2); w.debugTeleport("gus", T1.x + 0.5, T1.z - T1.d / 2 - 0.8, 0, pb.y2);
  assert.equal(w.pubGames.act("me", { op: "open", st: "pooltable2", vs: "npc", stake: 0 }), "");
  assert.equal(w.pubGames.act("hana", { op: "open", st: "pooltable1", vs: "mate", stake: 0 }), ""); assert.equal(w.pubGames.act("gus", { op: "join", st: "pooltable1" }), "");
}
/** (games turn over quickly: after 8 shots the player gives up and starts another, so the shot numbers start again) */
const concede = (w: any) => { for (const [st, pid] of [["pooltable2", "me"], ["pooltable1", "hana"]] as const) { const s = w.pubGames.st.get(st); if (s.phase === "play" && !s.shot && s.pool.shots >= 8) w.pubGames.act(pid, { op: "leave", st }); } };
const reopen = (w: any) => { for (const [st, pid, vs] of [["pooltable2", "me", "npc"], ["pooltable1", "hana", "mate"]] as const) { const s = w.pubGames.st.get(st); if (s.phase === "free") { w.pubGames.act(pid, { op: "open", st, vs, stake: 0 }); if (vs === "mate") w.pubGames.act("gus", { op: "join", st }); } } };

for (const net of [{ fps: 60, lat: 0.05, name: "60 fps, 50 ms" }, { fps: 12, lat: 0.11, name: "12 fps, 110 ms" }, { fps: 30, lat: 0.3, stalls: [[25, 2.5], [70, 1.2]] as [number, number][], name: "30 fps, 300 ms, two stalled spells" }, { fps: 5, lat: 0.2, name: "5 fps, 200 ms" }, { fps: 20, lat: 0.9, stalls: [[40, 6], [95, 3.5]] as [number, number][], name: "20 fps, 900 ms, a 6 s stall (a background tab)" }]) {
  test(`pool (R12.3b): every shot visibly plays out in the window: two tables at once, game after game (${net.name})`, async () => {
    const rig = await pubRig(7);
    await poolGames(rig);
    if (process.env.PGLOG) for (const s of rig.view.st.values()) s.feed.log = [];
    const r = await playOut(rig, { sec: 150, ...net, me: "me", each: () => { const w = rig.w; poolBot(rig.S, w, "pooltable2", "me"); poolBot(rig.S, w, "pooltable1", "hana", true); poolBot(rig.S, w, "pooltable1", "gus"); concede(w); reopen(w); } });
    const visible = r.shown.filter((q) => q.mid >= 2).length, skipped = r.shown.length - visible;
    const why: Record<string, number> = {}; for (const q of r.shown as any[]) why[q.why] = (why[q.why] ?? 0) + 1;
    const games = new Set((r.shown as any[]).map((q) => q.st + "#" + q.gid));
    if (process.env.PGLOG) console.log(rig.view.st.get("pooltable1").feed.log.join("\n"));
    console.log(`  ${net.name}: ${r.hostShots} shots, ${games.size} games, replays by kind ${JSON.stringify(why)}${r.missing.length ? `, not shown: ${r.missing.join(" ")}` : ""}`);
    assert.ok(r.hostShots >= 20, `enough shots to judge (${r.hostShots})`);
    assert.equal(skipped, 0, `${r.hostShots} shots taken; ${skipped} jumped straight to the end in the window`);
    assert.ok([...games].filter((g) => g.startsWith("pooltable2")).length >= 2 && [...games].filter((g) => g.startsWith("pooltable1")).length >= 2, `game after game at both tables (${[...games].join(", ")})`);
    // (a shot that came and went entirely inside a long stall (a background tab) may go unplayed, but never silently:
    //  the window says how many it missed)
    const told = rig.fb.filter((t: string) => /^Missed \d+ shot/.test(t)).reduce((a: number, t: string) => a + Number(t.match(/\d+/)![0]), 0);
    if (!net.stalls?.some(([, d]) => d > 3)) assert.equal(r.missing.length, 0, `not shown: ${r.missing.join(" ")}`);
    else assert.equal(told, r.missing.length, `${r.missing.length} shots not shown (${r.missing.join(" ")}), ${told} reported missed`);
    assert.ok(visible >= r.hostShots - told, `${r.hostShots} shots taken; only ${visible} played out on screen`);
  });
}

test("pool (R12.3b): what the window plays out ends exactly where the host settled the balls", async () => {
  const rig = await pubRig(11);
  await poolGames(rig);
  const { view, w } = rig;
  // check each replay the moment the window finishes it, against the host's settled table
  let checked = 0, worst = 0;
  const origTick = (view as any).tickPool.bind(view);
  (view as any).tickPool = (s: any, dt: number) => {
    const sim = s.sim, key = s.key; origTick(s, dt);
    if (sim && !s.sim && s.kind === "pool") {
      const host = w.pubGames.st.get(s.id); const fin = s.note?.pool?.b ?? [];
      if (host.shot || !host.last || `${host.gid}:${host.last.n}` !== key) return; // (only when the host's on the same shot)
      for (const b of sim.balls) { const h = fin.find((q: any) => q[0] === b.id); if (!h || b.down) continue; worst = Math.max(worst, Math.hypot(h[1] - b.x, h[2] - b.z)); }
      checked++;
    }
  };
  await playOut(rig, { sec: 150, fps: 30, lat: 0.11, me: "me", each: () => { poolBot(rig.S, w, "pooltable2", "me"); poolBot(rig.S, w, "pooltable1", "hana", true); poolBot(rig.S, w, "pooltable1", "gus"); concede(w); reopen(w); } });
  assert.ok(checked >= 15, `checked ${checked} shots`);
  assert.ok(worst < 2e-4, `the replay's balls end within 0.2 mm of the host's (worst ${(worst * 1000).toFixed(3)} mm)`);
});

test("pub games (R12.3b): the shot clock counts down in the window even when nothing else changes (and pauses truthfully)", async () => {
  const rig = await pubRig(5);
  const { w, view, pb } = rig;
  w.addPlayer("me", "ME"); w.addPlayer("gus", "GUS");
  const T = pb.pools[1]; w.debugTeleport("me", T.x, T.z - T.d / 2 - 0.8, 0, pb.y2); w.debugTeleport("gus", T.x + 0.6, T.z - T.d / 2 - 0.8, 0, pb.y2);
  w.pubGames.act("me", { op: "open", st: "pooltable2", vs: "mate", stake: 0 }); w.pubGames.act("gus", { op: "join", st: "pooltable2" });
  const s = w.pubGames.st.get("pooltable2")!, up = s.seats[s.pool!.turn].id;
  const samples: [number, number][] = [];
  // (read off the HUD, as a player sees it: "YOUR SHOT · 32s")
  const shownLeft = () => Number(((view as any).hud.innerHTML as string).match(/YOUR SHOT[^0-9]*?(\d+)s/)?.[1] ?? NaN);
  await playOut(rig, { sec: 12, fps: 30, lat: 0.11, me: up, each: () => { const n = (rig as any).frames = ((rig as any).frames ?? 0) + 1; if (n % 60 === 0) samples.push([s.clock, shownLeft()]); } });
  // (the host's own count, and the window's, a second apart: the window's within a second of the host's, counting down)
  assert.ok(samples.length >= 10);
  for (const [host, shown] of samples.slice(1)) assert.ok(Math.abs(shown - Math.ceil(host)) <= 1, `host ${host.toFixed(1)} s left, the window shows ${shown}`);
  assert.ok(samples[samples.length - 1][1] <= 30, `it counts down (${samples.map((q) => q[1]).join(",")})`);
  // the shooter drops out: the clock stops (held seat), and the window says so
  w.players.get(up)!.connected = false;
  const before = s.clock;
  await playOut(rig, { sec: 5, fps: 30, lat: 0.11, me: up === "me" ? "gus" : "me" });
  assert.ok(Math.abs(s.clock - before) < 1e-6, "the host's clock waits for a dropped player");
  assert.equal((view.info() as any).pooltable2.clock, Math.ceil(before), "the window shows the stopped clock (to the other player too)");
  const hud = (view as any).hud.innerHTML as string;
  assert.match(hud, /reconnecting: (39|4\d)s/, `the window shows the held seat counting down: ${hud.slice(0, 160)}`);
});

test("pub games (R12.3b): another table or board finishing never touches your aim, your throw, or a menu you've got open", async () => {
  const rig = await pubRig(3);
  const { w, view, pb } = rig;
  for (const id of ["me", "gus", "hana", "dan"]) w.addPlayer(id, id.toUpperCase());
  const T1 = pb.pools[0], T2 = pb.pools[1];
  w.debugTeleport("me", T2.x, T2.z - T2.d / 2 - 0.8, 0, pb.y2); w.debugTeleport("gus", T2.x + 0.6, T2.z - T2.d / 2 - 0.8, 0, pb.y2);
  w.debugTeleport("hana", T1.x, T1.z - T1.d / 2 - 0.8, 0, pb.y2); w.debugTeleport("dan", T1.x + 0.6, T1.z - T1.d / 2 - 0.8, 0, pb.y2);
  w.pubGames.act("me", { op: "open", st: "pooltable2", vs: "mate", stake: 0 }); w.pubGames.act("gus", { op: "join", st: "pooltable2" });
  w.pubGames.act("hana", { op: "open", st: "pooltable1", vs: "mate", stake: 0 }); w.pubGames.act("dan", { op: "join", st: "pooltable1" });
  const s2 = w.pubGames.st.get("pooltable2")!;
  if (s2.seats[s2.pool!.turn].id !== "me") s2.pool!.turn = 1 - s2.pool!.turn; // (my break)
  await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  view.use("pooltable2"); await playOut(rig, { sec: 0.5, fps: 30, lat: 0.05, me: "me" });
  if (view.mode === "place") view.input.button(0, true);
  view.input.button(0, true); view.input.mouse(0, 40); // (drawing the cue back)
  assert.equal(view.mode, "draw", "drawing the cue back at table 2");
  // table 1's game ends (Dan concedes) while I'm mid-stroke
  w.pubGames.act("dan", { op: "leave", st: "pooltable1" });
  await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  assert.equal(w.pubGames.st.get("pooltable1")!.phase, "over");
  assert.equal(view.mode, "draw", "still drawing the cue back: table 1 finishing left me alone");
  assert.equal(view.at, "pooltable2");
  // and when it resets to free
  await playOut(rig, { sec: 8, fps: 30, lat: 0.05, me: "me" });
  assert.equal(w.pubGames.st.get("pooltable1")!.phase, "free"); assert.equal(view.mode, "draw", "nor when it's cleared");
  view.input.button(2, true); view.leave();
  // darts and pool: I'm at the oche throwing; a pool game finishes
  const O = pb.darts[0];
  w.pubGames.act("me", { op: "leave", st: "pooltable2" }); await playOut(rig, { sec: 8, fps: 30, lat: 0.05, me: "me" });
  w.debugTeleport("me", O.oche + 0.3, O.board.z, -Math.PI / 2, pb.y2); w.debugTeleport("gus", O.oche + 1.2, O.board.z + 0.8, 0, pb.y2);
  w.pubGames.act("me", { op: "open", st: "dartsoche1", vs: "mate", stake: 0 }); w.pubGames.act("gus", { op: "join", st: "dartsoche1" });
  const sd = w.pubGames.st.get("dartsoche1")!; if (sd.seats[sd.darts!.turn].id !== "me") sd.darts!.turn = 1 - sd.darts!.turn;
  w.pubGames.act("hana", { op: "open", st: "pooltable1", vs: "mate", stake: 0 }); w.pubGames.act("dan", { op: "join", st: "pooltable1" });
  await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  view.use("dartsoche1"); await playOut(rig, { sec: 0.3, fps: 30, lat: 0.05, me: "me" });
  assert.equal(view.mode, "darts", "at the oche");
  w.pubGames.act("hana", { op: "leave", st: "pooltable1" }); await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  assert.equal(view.mode, "darts", "still at the oche: a pool game finishing didn't pull me off it");
  view.leave();
  // a menu open at table 2 (free) while oche 2's game (gus v dan) finishes
  w.pubGames.act("me", { op: "leave", st: "dartsoche1" }); await playOut(rig, { sec: 8, fps: 30, lat: 0.05, me: "me" });
  const O2 = pb.darts[1]; w.debugTeleport("dan", O2.oche + 0.3, O2.board.z, -Math.PI / 2, pb.y2); w.debugTeleport("gus", O2.oche + 1.2, O2.board.z, 0, pb.y2);
  w.pubGames.act("dan", { op: "open", st: "dartsoche2", vs: "mate", stake: 0 }); w.pubGames.act("gus", { op: "join", st: "dartsoche2" });
  w.debugTeleport("me", T2.x, T2.z - T2.d / 2 - 0.8, 0, pb.y2);
  await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  view.use("pooltable2"); assert.equal(view.mode, "menu");
  w.pubGames.act("gus", { op: "leave", st: "dartsoche2" }); await playOut(rig, { sec: 1, fps: 30, lat: 0.05, me: "me" });
  assert.equal(view.mode, "menu", "my menu at table 2 stays open while oche 2's game ends");
});

test("pool (R12.3b): your turn waits for the window to finish showing the last shot before you step up to the table", async () => {
  const rig = await pubRig(9);
  const { w, view, pb } = rig;
  w.addPlayer("me", "ME"); const T = pb.pools[1]; w.debugTeleport("me", T.x, T.z - T.d / 2 - 0.8, 0, pb.y2);
  w.pubGames.act("me", { op: "open", st: "pooltable2", vs: "npc", stake: 0 });
  let stepped = 0, early = 0;
  await playOut(rig, { sec: 60, fps: 10, lat: 0.3, me: "me", each: () => {
    const st = view.st.get("pooltable2")!;
    if (view.mode === "aim" || view.mode === "place") { if (st.sim) early++; if (!(rig as any).inAim) { stepped++; (rig as any).inAim = true; } const P = w.pubGames.st.get("pooltable2")!.pool; if (P) { const cue = P.balls.find((b) => b.id === 0)!, t = P.balls.find((b) => !b.down && b.id !== 0 && b.id !== 8) ?? P.balls.find((b) => b.id === 8)!; if (view.mode === "place") view.input.button(0, true); (view as any).aimA = Math.atan2(t.x - cue.x, t.z - cue.z); view.input.button(0, true); view.input.mouse(0, 120); view.input.button(0, false); } }
    else (rig as any).inAim = false;
  } });
  assert.ok(stepped >= 2, `stepped up for my shot ${stepped} times`);
  assert.equal(early, 0, "never while the last shot was still rolling in this window");
});
