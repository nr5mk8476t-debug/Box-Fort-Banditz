// R12.5: adaptive resolution: it comes back up at a capped 60 FPS (it used to need under 14 ms, which a 60 Hz cap never
// gives: stuck at 60% for good), it doesn't flip back and forth, and it never goes below 60%
import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptStep, type AdaptState } from "../src/game/adaptive.ts";

const fresh = (): AdaptState => ({ slow: 0, easy: 0, lastUp: -1e9, wait: 0, waitUntil: 0, clock: 0 });
/** run `secs` seconds of one-second windows at a given 90th percentile, from `scale`; returns the scale after */
function run(st: AdaptState, scale: number, p90: number | ((t: number) => number), secs: number) {
  for (let k = 0; k < secs; k++) { st.clock += 1; scale = Math.max(0.6, Math.min(1, scale + adaptStep(typeof p90 === "number" ? p90 : p90(st.clock), st, scale))); }
  return scale;
}

test("R12.5 adaptive resolution: slow frames step it down to 60% at the least; a capped 60 FPS (16.7 ms) brings it back to 100%", () => {
  const st = fresh();
  let s = run(st, 1, 30, 20);
  assert.ok(Math.abs(s - 0.6) < 1e-9, `down to the floor: ${s}`);
  s = run(st, s, 16.7, 120);
  assert.ok(Math.abs(s - 1) < 1e-9, `back up at a steady 60 FPS: ${s}`);
});

test("R12.5 adaptive resolution: sitting right on the edge it doesn't flip back and forth (each failed step up waits longer)", () => {
  const st = fresh();
  // a machine that's fine at 90% and slow at 100%: the 90th percentile depends on the scale
  let s = 0.9, changes = 0;
  for (let k = 0; k < 600; k++) { st.clock += 1; const p90 = s > 0.92 ? 26 : 17; const step = adaptStep(p90, st, s); if (step) { changes++; s = Math.max(0.6, Math.min(1, s + step)); } }
  assert.ok(changes <= 14, `${changes} changes in 10 minutes`);
  assert.ok(st.wait >= 80, `it learnt to wait (${st.wait} s)`);
});

test("R12.5 adaptive resolution: a mid-range frame rate (between the two thresholds) leaves it alone", () => {
  const st = fresh();
  assert.equal(run(st, 0.8, 20, 60), 0.8);
});
