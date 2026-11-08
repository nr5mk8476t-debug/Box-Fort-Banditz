// R12.6: the BENCHMARK records the whole route at any frame rate (it used to stop at 20,000 frames: on a 240 FPS PC the
// last stretches came out empty), leaves a paused tab out, keeps occasional long frames in, and its overall numbers
// cover the whole run. Simulated frame rates; the scene is Babylon's NullEngine (no drawing).
import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";

const g = globalThis as any;
g.document ??= { hidden: false, createElement: () => ({ getContext: () => null }), getElementById: () => null };
g.navigator ??= { userAgent: "test", hardwareConcurrency: 4, platform: "test" };
g.innerWidth ??= 1280; g.innerHeight ??= 720; g.devicePixelRatio ??= 1;

async function run(fps: number, opts: { spikes?: boolean; pauseAt?: number } = {}) {
  const S = await import("@bfb/shared");
  const { runBench, benchFrame } = await import("../src/game/bench.ts");
  S.setCityMap("new");
  const arena = S.buildTrashington();
  const engine = new NullEngine(), scene = new Scene(engine);
  const p = runBench({
    scene, engine, arena, canvas: { clientWidth: 1280, clientHeight: 720 } as any, mode: "solo",
    players: () => 1, npcs: () => 0, cars: () => 0, setCam: () => {}, setNight: () => {},
    settings: { renderScale: 1 }, build: "test", pubSeen: () => false, status: () => {},
  });
  await Promise.resolve();
  const parts = { update: 0.1, world: 0.1, apply: 0, render: 0.5, hud: 0, total: 1 };
  let done: { text: string; json: string } | null = null; p.then((r) => { done = r; });
  let frames = 0, t = 0;
  while (!done && frames < 400000) {
    let dt = 1 / fps;
    if (opts.spikes && frames % 997 === 500) dt = 0.25; // (an occasional 250 ms hitch: counted)
    if (opts.pauseAt !== undefined && Math.abs(t - opts.pauseAt) < 1 / fps / 2) dt = 30; // (a 30 s background tab: left out)
    benchFrame(dt, parts, scene); frames++; t += dt;
    if (frames % 5000 === 0) await Promise.resolve();
    await Promise.resolve();
  }
  assert.ok(done, `finished (${frames} frames)`);
  return JSON.parse((done as any).json);
}

for (const fps of [30, 60, 144, 240]) {
  test(`R12.6 benchmark at a simulated ${fps} FPS: every stretch measured, the overall numbers cover the whole run`, async () => {
    const r = await run(fps, { spikes: true });
    const empty = r.legs.filter((l: any) => !l.frames).map((l: any) => l.leg);
    assert.deepEqual(empty, [], "no stretch without samples");
    const sum = r.legs.reduce((a: number, l: any) => a + l.frames, 0);
    assert.equal(r.total.frames, sum, "the overall count is every stretch's frames");
    assert.ok(Math.abs(r.total.medianMs - 1000 / fps) < 1000 / fps * 0.1 + 0.1, `median ${r.total.medianMs} ms at ${fps} FPS`);
    assert.ok(r.total.maxMs >= 249 && r.total.maxMs <= 251, `the 250 ms hitch counted (${r.total.maxMs})`);
  });
}

test("R12.6 benchmark: a tab left in the background for 30 s is left out of the numbers and reported", async () => {
  const r = await run(144, { pauseAt: 20 });
  assert.ok(r.total.maxMs < 100, `no 30 s 'frame' (${r.total.maxMs} ms)`);
  assert.ok(r.legs.every((l: any) => l.frames > 0), "the route still finished every stretch");
  assert.equal(r.info.paused, 1, "the pause is reported");
});
