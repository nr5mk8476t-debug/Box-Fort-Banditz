// R13.1: solo copies the World into its view only when there's something new (a tick, an action, a join, a test hook
// reaching in), not every rendered frame: at 240 FPS three frames in four have no tick and used to re-copy (and the
// game re-apply) the same state. Events still go out exactly once; an instant action shows on the very next frame.
import { test } from "node:test";
import assert from "node:assert/strict";

async function session() {
  const S = await import("@bfb/shared");
  S.setCityMap("new");
  const { LocalSession, SOLO_ID } = await import("../src/localSession.ts");
  const s = new LocalSession("me");
  for (let i = 0; i < 120; i++) s.step(1 / 60);
  s.step(0); // (settle the flags)
  return { s, S, SOLO_ID };
}

test("R13.1 solo at 240 FPS: 60 ticks a second, 60 fresh views (not 240), and every tick's view is fresh", async () => {
  const { s } = await session();
  let refreshes = 0; const orig = s.refresh.bind(s); s.refresh = () => { refreshes++; orig(); };
  let fresh = 0, ticks = 0, t = (s as any).w.time;
  for (let i = 0; i < 240; i++) {
    s.step(1 / 240);
    const now = (s as any).w.time, ticked = now !== t; t = now;
    if (ticked) { ticks++; assert.ok(s.fresh, `frame ${i}: a tick ran, so the view is new`); }
    if (s.fresh) fresh++;
  }
  assert.ok(ticks >= 59 && ticks <= 61, `${ticks} ticks`);
  assert.equal(fresh, ticks, "fresh exactly when a tick ran (nothing else happened)");
  assert.equal(refreshes, ticks);
});

test("R13.1 solo: an action between ticks shows on the next frame (no waiting for a tick), and its events arrive once", async () => {
  const { s, SOLO_ID } = await session();
  const w = (s as any).w;
  // land between ticks: the accumulator's just been emptied, so a quarter-tick step won't tick
  s.step(0);
  s.sendAction({ a: "dance" });
  const t0 = w.time;
  const ev = s.step(1 / 240);
  assert.equal(w.time, t0, "no tick ran");
  assert.ok(s.fresh, "but the action makes the next view fresh");
  const again = s.step(1 / 240);
  const all = [...ev, ...again].filter((e: any) => e.p === SOLO_ID && e.t === "dance");
  assert.ok(all.length <= 1, "an event goes out once");
  assert.ok(!s.fresh || w.time !== t0, "and the frame after that, with nothing new, isn't");
});

test("R13.1 solo: test hooks reaching into the World (cash, teleport, spawn) make the next view fresh, and it shows the change", async () => {
  const { s, SOLO_ID } = await session();
  s.step(0); s.step(0);
  assert.equal(s.fresh, false);
  s.world.players.get(SOLO_ID)!.cash = 777; // (what __bfb.setCash does)
  s.step(0);
  assert.ok(s.fresh);
  assert.equal((s.view.players.get(SOLO_ID) as any).cash, 777);
  s.step(0); assert.equal(s.fresh, false);
  s.teleport(10, 10, 0); s.step(0); assert.ok(s.fresh, "teleport");
  s.step(0);
  const id = s.spawnItem("rubber_chicken", 10, 12); s.step(0);
  assert.ok(s.fresh && s.view.items.has(id), "spawned item in the view");
});
