// Phase 4 jail break: a lock-picking minigame that's different every time you're locked up.
//
// The lock has 4-6 pins. Only ONE pin "binds" at a time (a random order per lock): select it
// (A/D) and it trembles; select a loose pin and it just rattles. The selected pin bounces up and
// down in its channel with its own rhythm (smooth, rush, wobble or dash) and you press SPACE when
// it is inside its green band (the shear line) to set it.
//   - Wrong pin or bad timing = a slip: the last pin you set drops again, and it makes noise.
//   - 3 slips close together = the guard hears you: all pins drop and you're locked out for 4 s.
//   - Once the first pin is set the tension wrench is on: set the rest before it gives out
//     (a random 12-17 s) or every pin drops.
// A press counts if the pin was in the green at any moment in the last 0.09 s (LOCK.grace): people
// react a little late, and without that a perfectly-timed-looking click often "didn't register".
// Everything is a pure function of the lock seed and the press times, so the server replays the
// player's presses on its own copy and agrees exactly on when the lock opens.

export type PinPattern = "smooth" | "rush" | "wobble" | "dash";
export interface LockPin { pattern: PinPattern; freq: number; phase: number; lo: number; hi: number; }
export interface LockDef { seed: number; pins: LockPin[]; order: number[]; tension: number; }

export const LOCK = {
  slipsToGuard: 3, // noise level that brings the guard
  noiseDecay: 4, // seconds after your last slip before one noise point fades
  lockout: 4, // seconds the guard makes you stop
  /** a press counts if the pin was in the green at any moment in the last 0.09 s (human reaction + a frame or two) */
  grace: 0.09,
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATTERNS: PinPattern[] = ["smooth", "rush", "wobble", "dash"];

export function makeLock(seed: number): LockDef {
  const r = rng(seed * 7919 + 17);
  const n = 4 + Math.floor(r() * 3); // 4..6 pins
  const pins: LockPin[] = [];
  for (let i = 0; i < n; i++) {
    const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)];
    const freq = (pattern === "dash" ? 0.55 : pattern === "rush" ? 0.5 : 0.6) + r() * 0.45; // cycles per second
    const width = 0.12 + r() * 0.05;
    // dash pins only spend time near the top, so their band sits high
    const centre = pattern === "dash" ? 0.72 + r() * 0.16 : 0.4 + r() * 0.45;
    pins.push({ pattern, freq, phase: r(), lo: Math.max(0.08, centre - width / 2), hi: Math.min(0.97, centre + width / 2) });
  }
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const tension = 5 + n * 1.5 + r() * 2;
  return { seed, pins, order, tension };
}

/** Height of a pin in its channel (0 = bottom, 1 = top) at lock time t (seconds). */
export function pinPos(pin: LockPin, t: number): number {
  const u = t * pin.freq + pin.phase;
  const f = u - Math.floor(u);
  switch (pin.pattern) {
    case "smooth": return 0.5 - 0.5 * Math.cos(Math.PI * 2 * u);
    case "rush": { // snaps up, sinks slowly
      if (f < 0.28) { const k = f / 0.28; return 1 - (1 - k) * (1 - k); }
      return 1 - (f - 0.28) / 0.72;
    }
    case "wobble": return Math.max(0, Math.min(1, 0.5 - 0.42 * Math.cos(Math.PI * 2 * u) + 0.08 * Math.sin(Math.PI * 2 * 3.3 * u)));
    case "dash": { // sits low, then darts up and back
      if (f < 0.5) return 0.04;
      return 0.04 + 0.95 * Math.sin(Math.PI * ((f - 0.5) / 0.5));
    }
  }
}

export interface LockRun {
  def: LockDef;
  set: number; // pins set so far (in binding order)
  noise: number;
  noiseT: number; // time of the last slip (noise fades from here)
  tryT: number; // when the current attempt started (first pin set)
  lockUntil: number; // guard lockout ends
  lastT: number;
  solved: boolean;
  slips: number;
}

export type LockResult = "set" | "slip" | "wrong" | "guard" | "locked" | "solved" | "ignored";

export function newLockRun(seed: number): LockRun {
  return { def: makeLock(seed), set: 0, noise: 0, noiseT: 0, tryT: 0, lockUntil: 0, lastT: 0, solved: false, slips: 0 };
}

/** The pin that is binding right now (the only one that can be set). */
export function bindingPin(run: LockRun): number { return run.def.order[Math.min(run.set, run.def.order.length - 1)]; }

/** Seconds of tension left in this attempt (Infinity before the first pin is set). */
export function tensionLeft(run: LockRun, t: number): number {
  return run.set > 0 ? run.def.tension - (t - run.tryT) : Infinity;
}

/** Advance timers: noise fades, tension runs out. Returns "tension" when the pins just dropped. */
export function lockUpdate(run: LockRun, t: number): "tension" | null {
  if (run.solved) return null;
  while (run.noise > 0 && t - run.noiseT >= LOCK.noiseDecay) { run.noise--; run.noiseT += LOCK.noiseDecay; }
  if (run.set > 0 && t - run.tryT > run.def.tension) { run.set = 0; return "tension"; }
  return null;
}

/** Try to set a pin at lock time t. */
export function lockPress(run: LockRun, pin: number, t: number): LockResult {
  if (run.solved || !Number.isInteger(pin) || pin < 0 || pin >= run.def.pins.length || !Number.isFinite(t) || t < run.lastT - 1e-6) return "ignored";
  run.lastT = t;
  if (t < run.lockUntil) return "locked";
  lockUpdate(run, t);
  const want = bindingPin(run);
  const p = run.def.pins[pin];
  let inBand = false;
  for (let d = 0; d <= LOCK.grace + 1e-9 && !inBand; d += 0.02) { const q = pinPos(p, t - d); inBand = q >= p.lo && q <= p.hi; }
  if (pin === want && inBand) {
    if (run.set === 0) run.tryT = t;
    run.set++;
    if (run.set >= run.def.pins.length) { run.solved = true; return "solved"; }
    return "set";
  }
  run.slips++;
  run.set = Math.max(0, run.set - 1);
  run.noise++;
  run.noiseT = t;
  if (run.noise >= LOCK.slipsToGuard) {
    run.lockUntil = t + LOCK.lockout;
    run.set = 0; run.noise = 0;
    return "guard";
  }
  return pin === want ? "slip" : "wrong";
}
