// R12.5: adaptive resolution's once-a-second decision (main.ts applies it; client/test/adaptive.test.ts checks it).
// See main.ts's `adapt` for the rules: down 10% after two slow seconds (90th percentile over 22 ms), back up 5% after four
// seconds meeting the 60 FPS target (under 18.5 ms), never below 60%, and a growing wait after a step up that didn't hold.
export interface AdaptState { slow: number; easy: number; lastUp: number; wait: number; waitUntil: number; clock: number }
/** one second's decision (exported for the tests): -0.1, +0.05 or 0 */
export function adaptStep(p90: number, st: AdaptState, scale: number): number {
  if (p90 > 22) {
    st.easy = 0;
    if (++st.slow < 2) return 0;
    st.slow = 0;
    if (scale <= 0.6) return 0;
    if (st.clock - st.lastUp < 8) { st.wait = Math.min(300, st.wait ? st.wait * 2 : 20); st.waitUntil = st.clock + st.wait; } // (the step up didn't hold)
    return -0.1;
  }
  st.slow = 0;
  if (p90 < 18.5) {
    if (++st.easy < 4 || scale >= 1 || st.clock < st.waitUntil) return 0;
    st.easy = 0; st.lastUp = st.clock;
    return 0.05;
  }
  st.easy = 0;
  return 0;
}
