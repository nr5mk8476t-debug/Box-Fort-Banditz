// R12.3: THE SOGGY SHAMROCK's games upstairs: pub 8-ball on the two pool tables, 301 darts in the two booths.
//
// Everything both ends need lives here, so the drawing, the hit-testing and the rules share ONE set of numbers:
//  - POOL: a UK 7 ft pub table (bed 1.83 x 0.91 m between the cushion noses, 2" balls, a 48 mm cue ball, tight
//    rounded pockets). PoolSim is a deterministic fixed-step 2D simulation using only + - * / and sqrt, so the host
//    and every client replay a shot identically from (start balls, shot). The host's settled positions are the truth.
//  - poolResolve: our HOUSE RULES (traditional pub blackball, simplified; agreed with Blake, R12.3).
//  - DARTS: a WDF-sized bristle board (bull 12.7 mm, outer bull 31.8 mm, treble wire 107.4 mm, double 170 mm,
//    8 mm beds), 1.73 m to the bull, 2.37 m from the board's face to the oche. dartScore is the only hit test.
//  - PubGames: the four stations (two tables, two booths): seats, turns, bets, NPC opponents, interruptions.
//    The host's World runs it; clients get each station's state on its prop's note (JSON).

// ====================================================================================================== POOL
export const POOL = {
  /** the bed between the cushion noses (x across, z along) */
  W: 0.91, L: 1.83,
  /** ball radii: object balls 2" (50.8 mm), the cue ball 48 mm */
  R: 0.0254, RC: 0.024,
  /** the cloth's height above the floor; the cushion rubber's width; the wooden rail's top width */
  cloth: 0.8, cushion: 0.045, rail: 0.1,
  /** corner pockets: the jaw points sit this far along each cushion from the corner (mouth = c x sqrt2 = 86 mm) */
  corner: 0.061,
  /** middle pockets: half the mouth (95 mm mouth) */
  middle: 0.0475,
  /** how far the jaws run back into the pocket */
  jaw: 0.05,
  /** the baulk line: this far from the head cushion (a fifth of the bed) */
  baulk: 1.83 / 5,
  /** rolling: constant slowing (m/s^2) plus a little drag (1/s); restitution off a ball, off a cushion */
  roll: 0.24, drag: 0.07, eBall: 0.94, eCush: 0.72,
  /** a ball slower than this has stopped; the fastest shot (a big break) */
  vStop: 0.006, vMax: 6.5, vMin: 0.25,
  /** the simulation's fixed step, and a hard stop (s) */
  dt: 1 / 240, maxT: 30,
  /** the shot clock (s) */
  clock: 40,
} as const;

/** ball ids: 0 the cue ball, 1-7 reds, 8 the black, 9-15 yellows */
export type BallColour = "cue" | "red" | "yellow" | "black";
export const ballColour = (id: number): BallColour => (id === 0 ? "cue" : id === 8 ? "black" : id < 8 ? "red" : "yellow");
export interface Ball { id: number; x: number; z: number; vx: number; vz: number; down: boolean; }
interface Seg { ax: number; az: number; bx: number; bz: number; }

const SQRT3 = 1.7320508075688772;
/** the cushions and jaws as line segments (table-local: x across, z along, the baulk end at -L/2) */
export const POOL_SEGS: Seg[] = (() => {
  const { W, L, corner: c, middle: m, jaw: J } = POOL, hw = W / 2, hl = L / 2, out: Seg[] = [];
  for (const s of [-1, 1]) {
    // the long cushions (either side of the middle pocket) and the short ones
    out.push({ ax: s * hw, az: -hl + c, bx: s * hw, bz: -m }, { ax: s * hw, az: m, bx: s * hw, bz: hl - c });
    out.push({ ax: -hw + c, az: s * hl, bx: hw - c, bz: s * hl });
    // the middle pocket's jaws (flaring a little)
    for (const t of [-1, 1]) out.push({ ax: s * hw, az: t * m, bx: s * (hw + 0.045), bz: t * (m + 0.008) });
    // the corner jaws: running diagonally back into the pocket
    for (const t of [-1, 1]) {
      out.push({ ax: s * hw, az: t * (hl - c), bx: s * (hw + J), bz: t * (hl - c + J) });
      out.push({ ax: s * (hw - c), az: t * hl, bx: s * (hw - c + J), bz: t * (hl + J) });
    }
  }
  return out;
})();
/** the six pockets (table-local centres, for drawing and for the NPC's aiming) */
export const POOL_POCKETS: { x: number; z: number; corner: boolean }[] = (() => {
  const hw = POOL.W / 2, hl = POOL.L / 2, k = 0.012, out: { x: number; z: number; corner: boolean }[] = [];
  for (const s of [-1, 1]) { for (const t of [-1, 1]) out.push({ x: s * (hw + k), z: t * (hl + k), corner: true }); out.push({ x: s * (hw + 0.03), z: 0, corner: false }); }
  return out;
})();
/** R12.3b: the holes drawn in the cloth and the cups under them (table-local centres, radius POOL_HOLE): each hole's
 *  inner edge sits exactly on the pocket's mouth as the simulation has it (the line between a corner's jaw points; a
 *  middle pocket's cushion line), so a ball looks over the hole exactly when it drops, never while it's still in play.
 *  (They used to start 1.9 cm out on the bed at the middle pockets.) */
export const POOL_HOLE = 0.0525;
export const POOL_HOLES: { x: number; z: number; corner: boolean }[] = (() => {
  const hw = POOL.W / 2, hl = POOL.L / 2, kc = -POOL.corner / 2 + POOL_HOLE / Math.SQRT2, out: { x: number; z: number; corner: boolean }[] = [];
  for (const s of [-1, 1]) { for (const t of [-1, 1]) out.push({ x: s * (hw + kc), z: t * (hl + kc), corner: true }); out.push({ x: s * (hw + POOL_HOLE), z: 0, corner: false }); }
  return out;
})();
const radius = (id: number) => (id === 0 ? POOL.RC : POOL.R);

/** the break: the pack's apex on the foot spot (a quarter of the way from the foot cushion), the black in the middle */
export function rackBalls(): Ball[] {
  const R = POOL.R + 0.0002, apex = POOL.L / 4, rows = [[1], [2, 9], [10, 8, 3], [4, 11, 5, 12], [13, 6, 14, 15, 7]];
  const out: Ball[] = [{ id: 0, x: 0.12, z: -POOL.L / 2 + POOL.baulk - 0.12, vx: 0, vz: 0, down: false }];
  rows.forEach((row, r) => row.forEach((id, q) => out.push({ id, x: (q - (row.length - 1) / 2) * 2 * R, z: apex + r * R * SQRT3, vx: 0, vz: 0, down: false })));
  return out.sort((a, b) => a.id - b.id);
}

/** what happened during a shot (for the rules) */
export interface ShotLog { first: number; potted: number[]; cushionBalls: number; contact: boolean; }

/**
 * One shot, stepped at a fixed rate. Deterministic: only + - * / and sqrt (no trig), always in the same order, so a
 * client replaying (balls, dx, dz, v) gets exactly what the host got.
 */
export class PoolSim {
  balls: Ball[];
  t = 0;
  log: ShotLog = { first: -1, potted: [], cushionBalls: 0, contact: false };
  /** (clients: the clicks and thuds; never changes the result) */
  onHit: ((kind: "ball" | "cushion" | "pocket", speed: number, id: number) => void) | null = null;
  private cushioned = new Set<number>();
  constructor(start: Ball[], dx: number, dz: number, v: number) {
    this.balls = start.map((b) => ({ ...b, vx: 0, vz: 0 }));
    const cue = this.balls.find((b) => b.id === 0)!;
    const n = Math.sqrt(dx * dx + dz * dz) || 1;
    cue.vx = (dx / n) * v; cue.vz = (dz / n) * v;
  }
  get moving() { for (const b of this.balls) if (!b.down && (b.vx !== 0 || b.vz !== 0)) return true; return false; }
  get done() { return !this.moving || this.t >= POOL.maxT; }
  /** advance by whole fixed steps until `untilT` (or it settles) */
  runTo(untilT: number) { while (this.t + POOL.dt <= untilT + 1e-9 && !this.done) this.step(); if (this.t >= POOL.maxT) for (const b of this.balls) { b.vx = 0; b.vz = 0; } }
  runAll() { this.runTo(POOL.maxT); }
  step() {
    const dt = POOL.dt, B = this.balls;
    let vmax = 0;
    for (const b of B) if (!b.down) { const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz); if (s > vmax) vmax = s; }
    const n = Math.max(1, Math.ceil((vmax * dt) / (POOL.R * 0.25)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      for (const b of B) if (!b.down) { b.x += b.vx * h; b.z += b.vz * h; }
      this.collideBalls();
      for (const b of B) if (!b.down) { this.collideCushions(b); this.pocket(b); }
    }
    // rolling friction (once per step)
    for (const b of B) {
      if (b.down) continue;
      const s = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
      if (s === 0) continue;
      const ns = s - POOL.roll * dt - POOL.drag * s * dt;
      if (ns <= POOL.vStop) { b.vx = 0; b.vz = 0; } else { b.vx *= ns / s; b.vz *= ns / s; }
    }
    this.t += dt;
  }
  private collideBalls() {
    const B = this.balls;
    for (let i = 0; i < B.length; i++) {
      const a = B[i]; if (a.down) continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j]; if (b.down) continue;
        const dx = b.x - a.x, dz = b.z - a.z, rr = radius(a.id) + radius(b.id), d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel > 0) {
          const imp = ((1 + POOL.eBall) / 2) * rel;
          a.vx -= imp * nx; a.vz -= imp * nz; b.vx += imp * nx; b.vz += imp * nz;
          if (this.onHit) this.onHit("ball", rel, a.id);
          if (a.id === 0 || b.id === 0) { if (this.log.first < 0) this.log.first = a.id === 0 ? b.id : a.id; this.log.contact = true; }
        }
        const push = (rr - d) / 2 + 1e-7;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      }
    }
  }
  private collideCushions(b: Ball) {
    const r = radius(b.id);
    for (const s of POOL_SEGS) {
      const ex = s.bx - s.ax, ez = s.bz - s.az, L2 = ex * ex + ez * ez;
      let t = ((b.x - s.ax) * ex + (b.z - s.az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + ex * t, qz = s.az + ez * t, dx = b.x - qx, dz = b.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
      if (vn < 0) { if (this.onHit) this.onHit("cushion", -vn, b.id); b.vx -= (1 + POOL.eCush) * vn * nx; b.vz -= (1 + POOL.eCush) * vn * nz; if (b.id !== 0 && !this.cushioned.has(b.id)) { this.cushioned.add(b.id); this.log.cushionBalls++; } }
      b.x = qx + nx * (r + 1e-7); b.z = qz + nz * (r + 1e-7);
    }
  }
  private pocket(b: Ball) {
    const { W, L, corner: c, middle: m } = POOL, hw = W / 2, hl = L / 2, r = radius(b.id);
    const ax = b.x < 0 ? -b.x : b.x, az = b.z < 0 ? -b.z : b.z;
    const inCorner = (ax - hw) + (az - hl) > -c + 0.9 * r;
    const inMiddle = ax > hw + 0.5 * r && az < m + r;
    const off = ax > hw + 0.2 || az > hl + 0.2; // (can't happen: safety)
    if (inCorner || inMiddle || off) { b.down = true; b.vx = 0; b.vz = 0; this.log.potted.push(b.id); if (this.onHit) this.onHit("pocket", 1, b.id); }
  }
}

/** is (x, z) a legal spot for the cue ball in hand (behind the baulk line, on the cloth, touching nothing)? */
export function cueSpotOk(balls: Ball[], x: number, z: number): boolean {
  const { W, L, baulk, RC, R } = POOL;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > W / 2 - RC - 0.002 || z < -L / 2 + RC + 0.002 || z > -L / 2 + baulk) return false;
  return balls.every((b) => b.id === 0 || b.down || Math.hypot(b.x - x, b.z - z) > RC + R + 0.002);
}

// ---------------------------------------------------------------------------------------------- house rules
export type Group = "red" | "yellow" | null;
export interface PoolState {
  balls: Ball[];
  /** whose shot (0/1), their group (null = open table), visits left this turn (1 or 2) */
  turn: number; groups: [Group, Group]; visits: number;
  /** the break hasn't been taken yet; the cue ball's in hand (behind the baulk line) */
  breakShot: boolean; inHand: boolean;
  /** time-outs in a row, per player */
  timeouts: [number, number];
  shots: number;
}
export function newPoolState(breaker = 0): PoolState {
  return { balls: rackBalls(), turn: breaker, groups: [null, null], visits: 1, breakShot: true, inHand: true, timeouts: [0, 0], shots: 0 };
}
export interface PoolVerdict { foul: string; win: number; lose: number; rerack: boolean; assigned: Group; line: string; }
const other = (k: number) => 1 - k;
const left = (balls: Ball[], g: Exclude<Group, null>) => balls.filter((b) => !b.down && ballColour(b.id) === g).length;

/**
 * Apply a finished shot to the game (our house rules). `before` is the table as it was; s.balls already shows the
 * result. Returns what happened (a foul's reason, a win/loss, a re-rack) and updates s.
 */
export function poolResolve(s: PoolState, before: Ball[], log: ShotLog, names: [string, string], timeout = false): PoolVerdict {
  const me = s.turn, you = other(me), g = s.groups[me];
  const v: PoolVerdict = { foul: "", win: -1, lose: -1, rerack: false, assigned: null, line: "" };
  const onBlack = g !== null && left(before, g) === 0;
  const potted = log.potted, cueDown = potted.includes(0), blackDown = potted.includes(8);
  const objects = potted.filter((id) => id !== 0 && id !== 8);
  // ---- the foul (if any) ----
  if (timeout) v.foul = "Out of time";
  else if (!log.contact) v.foul = "Missed everything";
  else if (log.first === 8 && !onBlack) v.foul = "Hit the black first";
  else if (g !== null && !onBlack && ballColour(log.first) !== g) v.foul = "Wrong colour hit first";
  else if (onBlack && log.first !== 8) v.foul = "Had to hit the black first";
  if (!v.foul && cueDown) v.foul = "Potted the white";
  if (!v.foul && g !== null && objects.some((id) => ballColour(id) !== g)) v.foul = `Potted ${names[you]}'s ${g === "red" ? "yellow" : "red"}`;
  if (!v.foul && s.breakShot && !potted.length && log.cushionBalls < 2) v.foul = "Weak break (2 balls must reach a cushion)";
  s.shots++;
  // ---- the black ----
  if (blackDown) {
    if (s.breakShot) { // black on the break: re-rack, the same player breaks again
      v.rerack = true; v.line = "The black went down on the break: re-rack, break again.";
      // (the shot count carries on through the re-rack: every shot in a game has its own number, so a client never
      //  mistakes the new break for the one it just watched)
      Object.assign(s, newPoolState(me), { shots: s.shots }); return v;
    }
    if (cueDown) { v.lose = me; v.win = you; v.line = `${names[me]} potted the black AND the white: ${names[you]} wins!`; return v; }
    if (v.foul) { v.lose = me; v.win = you; v.line = `Black potted on a foul (${v.foul.toLowerCase()}): ${names[you]} wins!`; return v; }
    if (!onBlack) { v.lose = me; v.win = you; v.line = `${names[me]} potted the black too early: ${names[you]} wins!`; return v; }
    v.win = me; v.lose = you; v.line = `${names[me]} pots the black and wins!`; return v;
  }
  // ---- groups: the first legal pot after the break decides; both colours on an open table: still open ----
  if (!v.foul && g === null && !s.breakShot && objects.length) {
    const cols = new Set(objects.map(ballColour));
    if (cols.size === 1) { const c = [...cols][0] as Exclude<Group, null>; s.groups[me] = c; s.groups[you] = c === "red" ? "yellow" : "red"; v.assigned = c; }
  }
  s.breakShot = false;
  s.timeouts[me] = timeout ? s.timeouts[me] + 1 : 0;
  // ---- who's next ----
  if (v.foul) {
    s.turn = you; s.visits = 2; s.inHand = cueDown;
    if (cueDown) { const cue = s.balls.find((b) => b.id === 0)!; cue.down = false; cue.x = 0.12; cue.z = -POOL.L / 2 + POOL.baulk - 0.12; cue.vx = 0; cue.vz = 0; }
    v.line = `${v.foul}: ${names[you]} gets two visits.`;
    return v;
  }
  s.inHand = false;
  const mine = g === null ? objects.length > 0 : objects.some((id) => ballColour(id) === g);
  if (mine) { v.line = v.assigned ? `${names[me]} is on the ${v.assigned === "red" ? "reds" : "yellows"}.` : ""; return v; }
  if (s.visits >= 2) { s.visits = 1; v.line = `${names[me]}'s second visit.`; return v; }
  s.turn = you; s.visits = 1; v.line = "";
  return v;
}

/** where to stand to play a shot from the cue ball along (dx, dz): just outside the cabinet, behind the ball */
export function poolStance(cueX: number, cueZ: number, dx: number, dz: number): { x: number; z: number } {
  const hx = POOL.W / 2 + POOL.cushion + POOL.rail, hz = POOL.L / 2 + POOL.cushion + POOL.rail;
  const n = Math.hypot(dx, dz) || 1, bx = -dx / n, bz = -dz / n;
  const tx = bx > 0 ? (hx - cueX) / bx : bx < 0 ? (-hx - cueX) / bx : 1e9, tz = bz > 0 ? (hz - cueZ) / bz : bz < 0 ? (-hz - cueZ) / bz : 1e9;
  const t = Math.min(tx, tz) + 0.32;
  return { x: cueX + bx * t, z: cueZ + bz * t };
}

// ===================================================================================================== DARTS
export const DARTS = {
  bull: 0.00635, outer: 0.0159, tIn: 0.0994, tOut: 0.1074, dIn: 0.162, dOut: 0.17,
  /** the whole board (the number ring's outside) */
  board: 0.2255,
  /** clockwise from the top */
  order: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5],
  /** floor to the bull's centre; the board's face to the oche's front edge */
  height: 1.73, oche: 2.37,
  /** R12.3 (Blake: "a darts match should only go for a minute or two"): 301, double out */
  start: 301,
  /** seconds per dart before it's thrown for you (a miss) */
  clock: 20,
} as const;

export interface DartHit { value: number; mult: 0 | 1 | 2 | 3; n: number; label: string; double: boolean; }
/**
 * Score a dart at (u, v) on the board (metres from the bull: u to the right as you face it, v up). A dart exactly on
 * a wire counts for the ring nearer the bull; exactly on a segment wire, for the segment clockwise of it.
 */
export function dartScore(u: number, v: number): DartHit {
  const r = Math.sqrt(u * u + v * v);
  if (!(r <= DARTS.dOut)) return { value: 0, mult: 0, n: 0, label: "MISS", double: false };
  if (r <= DARTS.bull) return { value: 50, mult: 2, n: 25, label: "BULL", double: true };
  if (r <= DARTS.outer) return { value: 25, mult: 1, n: 25, label: "25", double: false };
  let a = Math.atan2(u, v); if (a < 0) a += 2 * Math.PI;
  const idx = Math.floor((a + Math.PI / 20) / (Math.PI / 10)) % 20, n = DARTS.order[idx];
  if (r <= DARTS.tIn) return { value: n, mult: 1, n, label: `${n}`, double: false };
  if (r <= DARTS.tOut) return { value: 3 * n, mult: 3, n, label: `T${n}`, double: false };
  if (r <= DARTS.dIn) return { value: n, mult: 1, n, label: `${n}`, double: false };
  return { value: 2 * n, mult: 2, n, label: `D${n}`, double: true };
}
/** the middle of a bed, for aiming at it (n = 25 for the bulls) */
export function dartTarget(n: number, mult: 1 | 2 | 3, outerSingle = true): { u: number; v: number } {
  if (n === 25) return mult === 2 ? { u: 0, v: 0 } : { u: 0, v: (DARTS.bull + DARTS.outer) / 2 };
  const idx = (DARTS.order as readonly number[]).indexOf(n), a = (idx * Math.PI) / 10;
  const r = mult === 3 ? (DARTS.tIn + DARTS.tOut) / 2 : mult === 2 ? (DARTS.dIn + DARTS.dOut) / 2 : outerSingle ? (DARTS.tOut + DARTS.dIn) / 2 : (DARTS.outer + DARTS.tIn) / 2;
  return { u: r * Math.sin(a), v: r * Math.cos(a) };
}

/** every bed you can aim at, as [label, value, n, mult] */
const BEDS: [string, number, number, 1 | 2 | 3][] = (() => {
  const out: [string, number, number, 1 | 2 | 3][] = [];
  for (let n = 1; n <= 20; n++) out.push([`T${n}`, 3 * n, n, 3], [`D${n}`, 2 * n, n, 2], [`${n}`, n, n, 1]);
  out.push(["BULL", 50, 25, 2], ["25", 25, 25, 1]);
  return out;
})();
const PREF_D = [20, 16, 8, 18, 12, 10, 4, 14, 6, 2, 25, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
/** a checkout route for `score` in at most `darts` darts, finishing on a double (null = none) */
export function checkout(score: number, darts: number): string[] | null {
  if (score > 170 || score < 2 || darts < 1) return null;
  const doubles = BEDS.filter((b) => b[3] === 2).sort((a, b) => PREF_D.indexOf(a[2]) - PREF_D.indexOf(b[2]));
  const setup = BEDS.filter((b) => b[3] !== 2 || true).sort((a, b) => b[1] - a[1]);
  for (let k = 1; k <= darts; k++) {
    for (const d of doubles) {
      const rest = score - d[1];
      if (k === 1) { if (rest === 0) return [d[0]]; continue; }
      if (k === 2) { const a = setup.find((x) => x[1] === rest && x[3] !== 2) ?? setup.find((x) => x[1] === rest); if (a) return [a[0], d[0]]; continue; }
      for (const a of setup) { const b = setup.find((x) => x[1] === rest - a[1] && x[3] !== 2); if (b) return [a[0], b[0], d[0]]; }
    }
  }
  return null;
}
const bedOf = (label: string) => BEDS.find((b) => b[0] === label)!;

export interface DartView { u: number; v: number; label: string; value: number; }
export interface DartsState {
  scores: [number, number];
  turn: number;
  /** this visit's darts, and the score at the start of it */
  darts: DartView[];
  visitStart: number;
  /** the last visit (shown while the next one starts): who, the darts, the total, "BUST" or "" */
  last: { who: number; darts: DartView[]; total: number; note: string } | null;
  thrown: number;
}
export const newDartsState = (first = 0): DartsState => ({ scores: [DARTS.start, DARTS.start], turn: first, darts: [], visitStart: DARTS.start, last: null, thrown: 0 });
export interface DartVerdict { hit: DartHit; bust: string; win: boolean; visitOver: boolean; }
/** a dart lands at (u, v): 301, double out (the bull counts as a double); a bust puts the score back and ends the visit */
export function dartsThrow(s: DartsState, u: number, v: number): DartVerdict {
  const hit = dartScore(u, v), me = s.turn, before = s.scores[me], after = before - hit.value;
  const dv: DartView = { u, v, label: hit.label, value: hit.value };
  s.darts.push(dv); s.thrown++;
  let bust = "";
  if (after < 0) bust = `BUST: ${hit.value} is more than the ${before} left`;
  else if (after === 1) bust = "BUST: you can't finish on 1";
  else if (after === 0 && !hit.double) bust = `BUST: you have to finish on a double (${hit.label} isn't one)`;
  if (bust) {
    s.scores[me] = s.visitStart;
    s.last = { who: me, darts: s.darts, total: 0, note: "BUST" };
    endVisit(s);
    return { hit, bust, win: false, visitOver: true };
  }
  s.scores[me] = after;
  if (after === 0) { s.last = { who: me, darts: s.darts, total: s.visitStart, note: "CHECKOUT" }; return { hit, bust: "", win: true, visitOver: true }; }
  if (s.darts.length >= 3) { s.last = { who: me, darts: s.darts, total: s.visitStart - after, note: "" }; endVisit(s); return { hit, bust: "", win: false, visitOver: true }; }
  return { hit, bust: "", win: false, visitOver: false };
}
function endVisit(s: DartsState) { s.turn = other(s.turn); s.darts = []; s.visitStart = s.scores[s.turn]; }

/** the NPC's choice for its next dart: a checkout route if there is one, else the treble 20 (or a set-up shot) */
export function dartsPlan(score: number, dartsLeft: number): { label: string; n: number; mult: 1 | 2 | 3 } {
  const route = checkout(score, dartsLeft);
  if (route) { const b = bedOf(route[0]); return { label: b[0], n: b[2], mult: b[3] }; }
  if (score > 60 + 32) return { label: "T20", n: 20, mult: 3 };
  if (score > 60 && score - 60 >= 2) return { label: "T20", n: 20, mult: 3 };
  // leave a nice double: 32 (D16) or 40 (D20), else any even number
  for (const keep of [32, 40, 16, 8, 24, 20, 36, 12]) { const s1 = score - keep; if (s1 >= 1 && s1 <= 20) return { label: `${s1}`, n: s1, mult: 1 }; }
  const s1 = score % 2 ? 1 : 2; return { label: `${s1}`, n: s1, mult: 1 };
}

// ================================================================================================== STATIONS
export const PUBGAMES = {
  /** stakes on offer (in-game $); NPCs only up to $20, and each can only lose this much per cycle */
  stakes: [0, 5, 10, 20, 50], npcStakeMax: 20, npcKitty: 40,
  /** last orders: no new games this long before the end of the scavenge */
  lastOrders: 90,
  /** a dropped connection's seat is held this long, then the game's called off */
  dropHold: 45,
  /** leave the floor (go downstairs, out of the pub) or get this far from your station, and you have this long to
   *  come back or you forfeit (fetching a pint from the island bar while they shoot is fine) */
  leaveR: 30, leaveT: 10,
  /** how long a finished game's result stays up before the station frees */
  overT: 7,
  /** NPC thinking time (s), per shot / per dart */
  npcThink: [2.2, 3.6], npcDart: [0.9, 1.6],
  /** NPC accuracy: pool aim error (radians, ~0.3 deg: he pots about 3 in 5 of the pots he goes for) and power error; darts spread (m) */
  npcAim: 0.005, npcPow: 0.1, npcDarts: 0.018,
  /** the time limit for a whole game (s): a stalled game is called off */
  maxGame: 900,
} as const;

export type StationKind = "pool" | "darts";
export interface StationGeom {
  id: string; kind: StationKind; idx: number;
  /** pool: the table's centre (its long side along z, the baulk end at -z); darts: the board's centre (facing +x) */
  x: number; z: number; y: number;
  /** darts: the board's face (x) and the oche's front edge (x) */
  face?: number; oche?: number;
  /** where the NPC lives, and how it walks over (waypoints) */
  npcHome: { x: number; z: number }; npcPath: { x: number; z: number }[];
  /** where the player who isn't playing waits */
  wait: { x: number; z: number; yaw: number }[];
}
export type StationPhase = "free" | "waiting" | "play" | "over";
export interface Seat { id: string; name: string; npc: boolean; stake: number; paid: boolean; away: number; drop: number; /** darts: darts in a row thrown for you by the clock */ idle?: number; }
export interface StationState {
  phase: StationPhase;
  seats: Seat[];
  stake: number;
  /** pool or darts */
  pool: PoolState | null;
  darts: DartsState | null;
  /** pool: the shot rolling now (its start, the shot, the server clock it started on) */
  shot: PoolShot | null;
  /** pool: the shot before (kept so a client that missed it entirely, a stalled frame or a background tab, can still
   *  play it out instead of the balls just jumping) */
  last: PoolShot | null;
  /** this game's id (new for every game at every station, never reused): with the shot number it names each shot */
  gid: number;
  clock: number;
  /** what just happened (shown on the station's board and the HUD); the winner ("" = none / called off) */
  msg: string; winner: string;
  /** why it ended ("win", "forfeit", "void") */
  end: string;
  overT: number; gameT: number; npcT: number;
  /** increments on every change (clients use it to spot new shots and darts) */
  rev: number;
}
export interface PoolShot { n: number; balls: Ball[]; dx: number; dz: number; v: number; t0: number; dur: number }
const freshStation = (): StationState => ({ phase: "free", seats: [], stake: 0, pool: null, darts: null, shot: null, last: null, gid: 0, clock: 0, msg: "", winner: "", end: "", overT: 0, gameT: 0, npcT: 0, rev: 0 });

/** NPC opponents (existing upstairs regulars who come over to play) */
export const PUB_NPCS = {
  pool: { name: "HUGHIE", lines: {
    start: ["Rack 'em. Mind the cloth.", "Go on so. Winner stays on.", "I've been playing this table since before it was green."],
    good: ["Ah, lovely.", "Didn't even look.", "Textbook."],
    miss: ["The cushion's off on that side.", "Ah, the cloth's slow today.", "I meant that. Safety."],
    win: ["That's the way it goes. Rack 'em again?", "Black's down. Pint's on you."],
    lose: ["Fair play to you.", "You're a hustler, that's what you are."],
    foul: ["Two visits. I'll take them."],
  } },
  darts: { name: "BIG DINNY", lines: {
    start: ["Three-oh-one, double out. Nearest the bull throws first, but you go ahead.", "Mind your feet on the oche."],
    good: ["Bed of nails!", "Ton!", "Ooh, that'll do."],
    miss: ["Bounced off me pint, that one.", "The board moved.", "Ah, sure look."],
    win: ["Double top! Never in doubt.", "Game shot. Another?"],
    lose: ["Game shot to you. Well thrown.", "I'll have you next time."],
    foul: ["Bust! Ah, the state of me."],
  } },
} as const;

/** what the PubGames system needs from the World */
export interface PubHost {
  /** a clock clients share (the traffic-light clock: clients see it, mod 600 s, as lightT) */
  time: number;
  rng(): number;
  player(id: string): { id: string; name: string; cash: number; x: number; z: number; y: number; connected: boolean; jailed: boolean } | null;
  addCash(id: string, v: number): void;
  /** can a new game start now (last orders, match phase)? "" = yes */
  closed(): string;
  /** stand a player at (x, z) facing yaw (the shooter / the thrower) */
  place(id: string, x: number, z: number, yaw: number): void;
  /** NPC hooks: walk the regular along waypoints to (x, z) facing yaw / back home; a short line */
  npcGo(kind: StationKind, path: { x: number; z: number }[], yaw: number): void;
  npcHome(kind: StationKind): void;
  npcSay(kind: StationKind, line: string): void;
  emit(e: PubEvent): void;
}
export type PubEvent =
  | { t: "pgShot"; st: string; n: number }
  | { t: "pgDart"; st: string; who: string; label: string; value: number; bust: string; u: number; v: number }
  | { t: "pgMsg"; st: string; msg: string; to?: string }
  | { t: "pgEnd"; st: string; winner: string; end: string; pot: number };

/** an action from a player (validated by the host) */
export type PubAction =
  | { op: "open"; st: string; vs: "npc" | "mate"; stake: number }
  | { op: "join"; st: string }
  | { op: "leave"; st: string }
  | { op: "shot"; st: string; n: number; dx: number; dz: number; v: number; cx?: number; cz?: number }
  | { op: "dart"; st: string; n: number; u: number; v: number };

export class PubGames {
  readonly st = new Map<string, StationState>();
  readonly geom = new Map<string, StationGeom>();
  /** each NPC's kitty: how much more it can lose this cycle */
  readonly kitty: Record<StationKind, number> = { pool: PUBGAMES.npcKitty, darts: PUBGAMES.npcKitty };
  /** which NPC is busy at which station */
  private npcAt: Record<StationKind, string> = { pool: "", darts: "" };
  /** the last game id handed out (game ids are never reused, at any station) */
  private gidN = 0;
  constructor(private h: PubHost, stations: StationGeom[]) {
    for (const g of stations) { this.geom.set(g.id, g); this.st.set(g.id, freshStation()); }
  }
  /** the station a player's seated at ("" = none) */
  stationOf(pid: string): string { for (const [id, s] of this.st) if (s.phase !== "free" && s.phase !== "over" && s.seats.some((q) => q.id === pid)) return id; return ""; }
  /** a new cycle: kitties refill; games still going are called off and refunded (the match moved on) */
  newCycle() { this.kitty.pool = PUBGAMES.npcKitty; this.kitty.darts = PUBGAMES.npcKitty; this.voidAll("the night's over: game called off, stakes back"); }
  voidAll(why: string) { for (const id of this.st.keys()) { const s = this.st.get(id)!; if (s.phase === "waiting" || s.phase === "play") this.finish(id, "", "void", why); } }

  // ---------------------------------------------------------------- actions
  act(pid: string, a: PubAction): string {
    const s = this.st.get(a?.st), g = this.geom.get(a?.st);
    if (!s || !g) return "no such station";
    const p = this.h.player(pid);
    if (!p) return "no player";
    switch (a.op) {
      case "open": {
        if (s.phase !== "free") return "busy";
        const cur = this.stationOf(pid); if (cur) return "you're already playing";
        const why = this.h.closed(); if (why) { this.msg(a.st, why, pid); return why; }
        if (Math.hypot(p.x - g.x, p.z - g.z) > 6) return "too far";
        let stake = PUBGAMES.stakes.includes(Number(a.stake) as any) ? Number(a.stake) : 0;
        if (a.vs === "npc") {
          if (this.npcAt[g.kind]) { this.msg(a.st, `${PUB_NPCS[g.kind].name}'s busy at the other ${g.kind === "pool" ? "table" : "board"}.`, pid); return "npc busy"; }
          stake = Math.min(stake, PUBGAMES.npcStakeMax);
          if (stake > this.kitty[g.kind]) { stake = 0; this.msg(a.st, `${PUB_NPCS[g.kind].name}: "Skint till tomorrow, but I'll play you for pride."`, pid); }
        }
        if (p.cash < stake) { this.msg(a.st, `You need $${stake} for that stake.`, pid); return "broke"; }
        s.seats = [{ id: pid, name: p.name, npc: false, stake, paid: false, away: 0, drop: 0 }];
        s.stake = stake; s.msg = ""; s.winner = ""; s.end = ""; s.gid = ++this.gidN; s.shot = null; s.last = null;
        if (a.vs === "npc") {
          this.h.addCash(pid, -stake); s.seats[0].paid = true;
          s.seats.push({ id: "npc:" + g.kind, name: PUB_NPCS[g.kind].name, npc: true, stake, paid: true, away: 0, drop: 0 });
          this.npcAt[g.kind] = a.st;
          this.h.npcGo(g.kind, [...g.npcPath, g.wait[1] ?? g.wait[0]], g.wait[1]?.yaw ?? 0);
          this.h.npcSay(g.kind, pick(PUB_NPCS[g.kind].lines.start, this.h.rng));
          this.begin(a.st);
        } else { s.phase = "waiting"; this.bump(s); }
        return "";
      }
      case "join": {
        if (s.phase !== "waiting") return "not waiting";
        if (s.seats[0]?.id === pid) return "your own game";
        if (this.stationOf(pid)) return "you're already playing";
        const why = this.h.closed(); if (why) { this.msg(a.st, why, pid); return why; }
        if (Math.hypot(p.x - g.x, p.z - g.z) > 6) return "too far";
        const host = this.h.player(s.seats[0].id);
        if (!host) { this.finish(a.st, "", "void", "the other player's gone"); return "gone"; }
        if (p.cash < s.stake) { this.msg(a.st, `You need $${s.stake} to match the stake.`, pid); return "broke"; }
        if (host.cash < s.stake) { this.finish(a.st, "", "void", `${host.name} can't cover the stake any more`); return "host broke"; }
        // the one reservation of both stakes
        this.h.addCash(host.id, -s.stake); s.seats[0].paid = true;
        this.h.addCash(pid, -s.stake);
        s.seats.push({ id: pid, name: p.name, npc: false, stake: s.stake, paid: true, away: 0, drop: 0 });
        this.begin(a.st);
        return "";
      }
      case "leave": {
        const k = s.seats.findIndex((q) => q.id === pid);
        if (k < 0) return "not seated";
        if (s.phase === "waiting") { this.finish(a.st, "", "void", "called off"); return ""; }
        if (s.phase === "play") { const w = s.seats[1 - k]; this.finish(a.st, w.id, "forfeit", `${s.seats[k].name} concedes. ${w.name} wins!`); return ""; }
        return "over";
      }
      case "shot": return this.shot(a.st, pid, a);
      case "dart": return this.dart(a.st, pid, a);
    }
    return "?";
  }

  private begin(id: string) {
    const s = this.st.get(id)!, g = this.geom.get(id)!;
    s.phase = "play"; s.gameT = 0; s.msg = ""; s.npcT = 0;
    const first = Math.floor(this.h.rng() * 2);
    if (g.kind === "pool") { s.pool = newPoolState(first); s.darts = null; s.clock = POOL.clock; }
    else { s.darts = newDartsState(first); s.pool = null; s.clock = DARTS.clock; }
    s.shot = null; s.last = null;
    s.msg = g.kind === "pool" ? `${s.seats[first].name} breaks.` : `${s.seats[first].name} throws first. 301, double out.`;
    this.placeTurn(id);
    this.bump(s);
  }

  /** stand whoever's up in position (the thrower on the oche; the other waits) */
  private placeTurn(id: string) {
    const s = this.st.get(id)!, g = this.geom.get(id)!;
    const turn = s.pool?.turn ?? s.darts?.turn ?? 0;
    s.seats.forEach((q, k) => {
      const w = g.wait[k] ?? g.wait[0];
      if (g.kind === "darts") {
        const spot = k === turn ? { x: g.oche! + 0.28, z: g.z, yaw: -Math.PI / 2 } : w;
        if (q.npc) this.h.npcGo("darts", [spot], spot.yaw); else if (k === turn) this.h.place(q.id, spot.x, spot.z, spot.yaw);
      } else if (q.npc && k !== turn) this.h.npcGo("pool", [w], w.yaw);
    });
  }

  private shot(id: string, pid: string, a: Extract<PubAction, { op: "shot" }>): string {
    const s = this.st.get(id)!, g = this.geom.get(id)!, P = s.pool;
    if (g.kind !== "pool" || s.phase !== "play" || !P) return "no game";
    const k = s.seats.findIndex((q) => q.id === pid);
    if (k < 0) return "spectator";
    if (k !== P.turn) return "not your turn";
    if (s.shot) return "balls still rolling";
    if (Number(a.n) !== P.shots) return "duplicate";
    const dx = Number(a.dx), dz = Number(a.dz), v = Number(a.v);
    if (![dx, dz, v].every(Number.isFinite) || Math.hypot(dx, dz) < 1e-6) return "bad shot";
    if (P.inHand && a.cx !== undefined && a.cz !== undefined) {
      if (!cueSpotOk(P.balls, Number(a.cx), Number(a.cz))) return "bad spot";
      const cue = P.balls.find((b) => b.id === 0)!; cue.x = Number(a.cx); cue.z = Number(a.cz);
    }
    this.startShot(id, dx, dz, Math.max(POOL.vMin, Math.min(POOL.vMax, v)));
    return "";
  }
  private startShot(id: string, dx: number, dz: number, v: number) {
    const s = this.st.get(id)!, P = s.pool!, g = this.geom.get(id)!;
    const n = Math.hypot(dx, dz); dx /= n; dz /= n;
    const start = P.balls.map((b) => ({ ...b }));
    const sim = new PoolSim(start, dx, dz, v);
    sim.runAll();
    s.shot = { n: P.shots, balls: start, dx, dz, v, t0: this.h.time, dur: sim.t };
    (s as any)._sim = sim;
    // stand the shooter behind the cue ball (it's drawn there for everyone)
    const cue = start.find((b) => b.id === 0)!, st = poolStance(cue.x, cue.z, dx, dz), seat = s.seats[P.turn];
    const yaw = Math.atan2(dx, dz);
    if (seat.npc) this.h.npcGo("pool", [{ x: g.x + st.x, z: g.z + st.z }], yaw); else this.h.place(seat.id, g.x + st.x, g.z + st.z, yaw);
    this.h.emit({ t: "pgShot", st: id, n: P.shots });
    this.bump(s);
  }
  /** the shot's finished rolling: apply the rules */
  private settle(id: string, timeout = false) {
    const s = this.st.get(id)!, P = s.pool!, g = this.geom.get(id)!;
    const sim: PoolSim | undefined = (s as any)._sim;
    const before = s.shot ? s.shot.balls : P.balls.map((b) => ({ ...b }));
    const log: ShotLog = timeout ? { first: -1, potted: [], cushionBalls: 0, contact: false } : sim!.log;
    if (sim) P.balls = sim.balls.map((b) => ({ ...b, vx: 0, vz: 0 }));
    const shooter = P.turn, seat = s.seats[shooter];
    const names: [string, string] = [s.seats[0].name, s.seats[1].name];
    const v = poolResolve(P, before, log, names, timeout);
    s.last = s.shot; s.shot = null; delete (s as any)._sim; s.clock = POOL.clock;
    if (v.win >= 0) {
      const w = s.seats[v.win];
      if (s.seats[v.lose].npc) this.h.npcSay("pool", pick(PUB_NPCS.pool.lines.lose, this.h.rng)); else if (w.npc) this.h.npcSay("pool", pick(PUB_NPCS.pool.lines.win, this.h.rng));
      this.finish(id, w.id, "win", v.line); return;
    }
    if (timeout && P.timeouts[shooter] >= 2) { const w = s.seats[1 - shooter]; this.finish(id, w.id, "forfeit", `${seat.name} timed out twice: ${w.name} wins.`); return; }
    s.msg = v.line || (P.turn === shooter ? `${seat.name} again.` : `${s.seats[P.turn].name} to play.`);
    if (seat.npc && g.kind === "pool") { if (v.foul) this.h.npcSay("pool", pick(PUB_NPCS.pool.lines.miss, this.h.rng)); else if (log.potted.length && P.turn === shooter && this.h.rng() < 0.3) this.h.npcSay("pool", pick(PUB_NPCS.pool.lines.good, this.h.rng)); }
    else if (v.foul && s.seats[P.turn].npc && this.h.rng() < 0.5) this.h.npcSay("pool", pick(PUB_NPCS.pool.lines.foul, this.h.rng));
    s.npcT = 0;
    this.placeTurn(id);
    this.bump(s);
  }

  private dart(id: string, pid: string, a: Extract<PubAction, { op: "dart" }>): string {
    const s = this.st.get(id)!, g = this.geom.get(id)!, D = s.darts;
    if (g.kind !== "darts" || s.phase !== "play" || !D) return "no game";
    const k = s.seats.findIndex((q) => q.id === pid);
    if (k < 0) return "spectator";
    if (k !== D.turn) return "not your turn";
    if (Number(a.n) !== D.thrown) return "duplicate";
    const u = Number(a.u), v = Number(a.v);
    if (!Number.isFinite(u) || !Number.isFinite(v) || Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return "bad dart";
    this.throwDart(id, u, v);
    return "";
  }
  private throwDart(id: string, u: number, v: number, byClock = false) {
    const s = this.st.get(id)!, D = s.darts!, me = D.turn, seat = s.seats[me];
    if (!byClock) seat.idle = 0;
    const r = dartsThrow(D, u, v);
    s.clock = DARTS.clock; s.npcT = 0;
    this.h.emit({ t: "pgDart", st: id, who: seat.id, label: r.hit.label, value: r.hit.value, bust: r.bust, u, v });
    if (seat.npc) {
      if (r.bust) this.h.npcSay("darts", pick(PUB_NPCS.darts.lines.foul, this.h.rng));
      else if (r.visitOver && !r.win && D.last && D.last.total >= 100) this.h.npcSay("darts", pick(PUB_NPCS.darts.lines.good, this.h.rng));
    }
    if (r.win) {
      const other2 = s.seats[1 - me];
      if (seat.npc) this.h.npcSay("darts", pick(PUB_NPCS.darts.lines.win, this.h.rng)); else if (other2.npc) this.h.npcSay("darts", pick(PUB_NPCS.darts.lines.lose, this.h.rng));
      this.finish(id, seat.id, "win", `${seat.name} checks out on ${r.hit.label}! Game shot.`); return;
    }
    s.msg = r.bust ? `${seat.name}: ${r.bust}. Back to ${s.darts!.scores[me]}.` : r.visitOver ? `${seat.name} scored ${D.last?.total ?? 0}. ${s.seats[D.turn].name} to throw.` : "";
    if (r.visitOver) this.placeTurn(id);
    this.bump(s);
  }

  /** end a game: pay the pot to the winner, or refund both stakes (void); free the NPC */
  private finish(id: string, winner: string, end: "win" | "forfeit" | "void", msg: string) {
    const s = this.st.get(id)!, g = this.geom.get(id)!;
    if (s.phase === "free" || s.phase === "over") return;
    let pot = 0;
    for (const q of s.seats) if (q.paid) pot += q.stake;
    if (end === "void") { for (const q of s.seats) if (q.paid && !q.npc) this.h.addCash(q.id, q.stake); pot = 0; }
    else {
      const w = s.seats.find((q) => q.id === winner);
      if (w && !w.npc) this.h.addCash(w.id, pot);
      const npc = s.seats.find((q) => q.npc);
      if (npc && s.stake > 0) this.kitty[g.kind] = Math.min(PUBGAMES.npcKitty, this.kitty[g.kind] + (w?.npc ? s.stake : -s.stake));
    }
    for (const q of s.seats) q.paid = false;
    if (s.seats.some((q) => q.npc)) { this.npcAt[g.kind] = ""; this.h.npcHome(g.kind); }
    s.phase = "over"; s.winner = winner; s.end = end; s.msg = msg; s.overT = PUBGAMES.overT; s.shot = null; delete (s as any)._sim;
    this.h.emit({ t: "pgEnd", st: id, winner, end, pot });
    this.bump(s);
  }

  // ---------------------------------------------------------------- the clock
  tick(dt: number) {
    for (const [id, s] of this.st) {
      const g = this.geom.get(id)!;
      if (s.phase === "over") { s.overT -= dt; if (s.overT <= 0) { Object.assign(s, freshStation(), { rev: s.rev + 1, gid: s.gid }); } continue; }
      if (s.phase === "free") continue;
      // seats: dropped connections (held 45 s, then void), walking off (10 s, then forfeit), arrests (forfeit)
      let ended = false;
      for (let k = 0; k < s.seats.length && !ended; k++) {
        const q = s.seats[k]; if (q.npc) continue;
        const p = this.h.player(q.id);
        if (!p || !p.connected) {
          q.drop += dt;
          if (q.drop >= PUBGAMES.dropHold) {
            // (Blake, R12.3b: held 45 s for a genuine dropout; still gone after that with the other player here, it's a
            //  forfeit, so pulling the plug can't dodge a losing bet. Nobody left to win it (both gone, the host's
            //  gone): called off, stakes back. Waiting for a mate: called off.)
            const o = s.seats[1 - k], oHere = !!o && (o.npc || (this.h.player(o.id)?.connected ?? false));
            if (s.phase === "play" && oHere) this.finish(id, o.id, "forfeit", `${q.name} never came back: ${o.name} wins.`);
            else this.finish(id, "", "void", `${q.name} dropped out: game called off, stakes back.`);
            ended = true;
          }
          continue;
        }
        q.drop = 0;
        const other2 = s.seats[1 - k];
        if (p.jailed) { if (s.phase === "waiting" || !other2) this.finish(id, "", "void", `${q.name} got lifted.`); else this.finish(id, other2.id, "forfeit", `${q.name} got lifted by the guards: ${other2.name} wins.`); ended = true; continue; }
        const far = Math.hypot(p.x - g.x, p.z - g.z) > PUBGAMES.leaveR || Math.abs(p.y - (g.kind === "darts" ? g.y - DARTS.height : g.y)) > 2.5;
        q.away = far ? q.away + dt : 0;
        if (q.away >= PUBGAMES.leaveT) { if (s.phase === "waiting" || !other2) this.finish(id, "", "void", `${q.name} wandered off.`); else this.finish(id, other2.id, "forfeit", `${q.name} walked away: ${other2.name} wins.`); ended = true; }
      }
      if (ended || s.phase !== "play") continue;
      s.gameT += dt;
      if (s.gameT > PUBGAMES.maxGame) { this.finish(id, "", "void", "That's gone on long enough: game called off, stakes back."); continue; }
      if (g.kind === "pool") this.tickPool(id, s, dt); else this.tickDarts(id, s, dt);
    }
  }
  private tickPool(id: string, s: StationState, dt: number) {
    const P = s.pool!;
    if (s.shot) { if (this.h.time - s.shot.t0 >= s.shot.dur) this.settle(id); return; }
    const seat = s.seats[P.turn];
    if (seat.npc) {
      s.npcT += dt;
      const think = PUBGAMES.npcThink[0] + (P.shots % 3) * ((PUBGAMES.npcThink[1] - PUBGAMES.npcThink[0]) / 2);
      if (s.npcT >= think) { const sh = npcPoolShot(P, this.h.rng); if (P.inHand) { const cue = P.balls.find((b) => b.id === 0)!; cue.x = sh.cx; cue.z = sh.cz; } this.startShot(id, sh.dx, sh.dz, sh.v); }
      return;
    }
    if (seat.drop > 0) return; // (their connection dropped: the seat's held, and so is the clock)
    s.clock -= dt;
    if (s.clock <= 0) { this.settle(id, true); }
  }
  private tickDarts(id: string, s: StationState, dt: number) {
    const D = s.darts!, seat = s.seats[D.turn];
    if (seat.npc) {
      s.npcT += dt;
      const wait = D.darts.length === 0 ? 2.2 : PUBGAMES.npcDart[0] + (D.thrown % 3) * ((PUBGAMES.npcDart[1] - PUBGAMES.npcDart[0]) / 2);
      if (s.npcT >= wait) { const t = npcDart(D.scores[D.turn], 3 - D.darts.length, this.h.rng); this.throwDart(id, t.u, t.v); }
      return;
    }
    if (seat.drop > 0) return; // (their connection dropped: the seat's held, and so is the clock)
    s.clock -= dt;
    if (s.clock <= 0) {
      // out of time: that dart's a miss; a whole visit missed on the clock and you've wandered off: forfeit
      seat.idle = (seat.idle ?? 0) + 1;
      if (seat.idle >= 3) { const w = s.seats[1 - D.turn]; this.finish(id, w.id, "forfeit", `${seat.name} let the clock throw a whole visit: ${w.name} wins.`); return; }
      this.throwDart(id, 0.4, 0.4, true);
    }
  }

  /** is the station's clock counting down right now (a person's turn, nothing rolling, their seat not on hold)? */
  clockRunning(s: StationState): boolean {
    if (s.phase !== "play") return false;
    const turn = s.pool?.turn ?? s.darts?.turn ?? -1, seat = s.seats[turn];
    return !!seat && !seat.npc && seat.drop <= 0 && !(s.pool && s.shot);
  }
  private msg(id: string, msg: string, to?: string) { this.h.emit({ t: "pgMsg", st: id, msg, to }); }
  private bump(s: StationState) { s.rev++; }

  /** the state clients see on the station's prop (compact JSON) */
  note(id: string): string {
    const s = this.st.get(id); if (!s) return "";
    const r3 = (x: number) => Math.round(x * 1e4) / 1e4;
    // (R12.3b: countdowns go out as the moment they run out, on the shared clock, so the note only changes when a clock
    //  starts, stops or resets, not every second, and a window that hasn't heard from the host for a moment still
    //  counts down truthfully. A clock that's stopped (a dropped player's held seat) sends what's left instead.)
    const at = (t: number) => Math.round(((((this.h.time + t) % 600) + 600) % 600) * 10) / 10;
    const run = this.clockRunning(s);
    const wire = (q: PoolShot) => ({ k: `${s.gid}:${q.n}`, n: q.n, b: q.balls.map((b) => [b.id, b.x, b.z, b.down ? 1 : 0]), dx: q.dx, dz: q.dz, v: q.v, t0: Math.round((((q.t0 % 600) + 600) % 600) * 1000) / 1000, dur: q.dur });
    return JSON.stringify({
      ph: s.phase, gid: s.gid, rev: s.rev, stake: s.stake, msg: s.msg, win: s.winner, end: s.end,
      dl: run ? at(s.clock) : -1, left: run || s.phase !== "play" ? 0 : Math.ceil(s.clock),
      // (each seat: id, name, NPC?, when a dropped player's held seat runs out (-1 = here), when a player who walked off
      //  forfeits (-1 = here))
      seats: s.seats.map((q) => [q.id, q.name, q.npc ? 1 : 0, q.drop > 0 ? at(PUBGAMES.dropHold - q.drop) : -1, q.away > 0 ? at(PUBGAMES.leaveT - q.away) : -1]),
      pool: s.pool ? { b: s.pool.balls.map((b) => [b.id, r3(b.x), r3(b.z), b.down ? 1 : 0]), turn: s.pool.turn, g: s.pool.groups, vis: s.pool.visits, brk: s.pool.breakShot ? 1 : 0, hand: s.pool.inHand ? 1 : 0, n: s.pool.shots } : null,
      // (the rolling shot: the exact start (full precision, so the replay matches the host's), the shot, when it started;
      //  its name k = game id : shot number, never reused)
      shot: s.shot ? wire(s.shot) : null,
      last: s.last ? wire(s.last) : null,
      darts: s.darts ? { sc: s.darts.scores, turn: s.darts.turn, d: s.darts.darts.map((x) => [r3(x.u), r3(x.v), x.label, x.value]), vs: s.darts.visitStart, n: s.darts.thrown, last: s.darts.last ? { who: s.darts.last.who, d: s.darts.last.darts.map((x) => [r3(x.u), r3(x.v), x.label, x.value]), tot: s.darts.last.total, note: s.darts.last.note } : null } : null,
    });
  }
}

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length) % xs.length];
const gauss = (rng: () => number) => { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** the darts NPC's dart: aim at the planned bed, land with a believable spread round it */
export function npcDart(score: number, dartsLeft: number, rng: () => number): { u: number; v: number; plan: string } {
  const plan = dartsPlan(score, dartsLeft), t = dartTarget(plan.n, plan.mult);
  return { u: t.u + gauss(rng) * PUBGAMES.npcDarts, v: t.v + gauss(rng) * PUBGAMES.npcDarts, plan: plan.label };
}

/** is the straight path of a ball of radius r from a to b clear of every other ball (ignoring ids in skip)? */
function pathClear(balls: Ball[], ax: number, az: number, bx: number, bz: number, r: number, skip: number[]): boolean {
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
  for (const o of balls) {
    if (o.down || skip.includes(o.id)) continue;
    let t = ((o.x - ax) * ex + (o.z - az) * ez) / L2; t = Math.max(0, Math.min(1, t));
    if (Math.hypot(ax + ex * t - o.x, az + ez * t - o.z) < r + POOL.R) return false;
  }
  return true;
}
/**
 * HUGHIE's shot: the same shot system as yours. Every legal target ball x every pocket, through the ghost-ball spot;
 * the clear ones scored by cut angle and distance; then a little error in the angle (about 0.3 deg) and the power. Nothing on: he
 * rolls up to the nearest legal ball (a safety). The break: hard at the pack.
 */
export function npcPoolShot(P: PoolState, rng: () => number): { dx: number; dz: number; v: number; cx: number; cz: number } {
  const g = P.groups[P.turn];
  const targets = P.balls.filter((b) => !b.down && b.id !== 0 && (g === null ? b.id !== 8 : left(P.balls, g) === 0 ? b.id === 8 : ballColour(b.id) === g));
  const cue0 = P.balls.find((b) => b.id === 0)!;
  const spots: { x: number; z: number }[] = P.inHand ? [[0, -0.12], [0.2, -0.12], [-0.2, -0.12], [0.3, -0.25], [-0.3, -0.25], [0, -0.3]].map(([x, dz]) => ({ x, z: -POOL.L / 2 + POOL.baulk + dz })).filter((q) => cueSpotOk(P.balls, q.x, q.z)) : [{ x: cue0.x, z: cue0.z }];
  if (!spots.length) spots.push({ x: cue0.x, z: cue0.z });
  if (P.breakShot) { const c = spots[0]; const apex = P.balls.find((b) => b.id === 1)!; return { dx: apex.x - c.x + (rng() - 0.5) * 0.01, dz: apex.z - c.z, v: 5.6 + rng() * 0.6, cx: c.x, cz: c.z }; }
  let best: { score: number; dx: number; dz: number; v: number; c: { x: number; z: number } } | null = null;
  const hw = POOL.W / 2, hl = POOL.L / 2;
  for (const c of spots) for (const t of targets) for (const pk of POOL_POCKETS) {
    // aim the object ball at the middle of the pocket's mouth (a touch inside it)
    const sx = Math.sign(pk.x), sz = Math.sign(pk.z);
    const px = pk.corner ? sx * (hw - POOL.corner / 2 + 0.012) : sx * (hw + 0.01), pz = pk.corner ? sz * (hl - POOL.corner / 2 + 0.012) : 0;
    const ox = px - t.x, oz = pz - t.z, od = Math.hypot(ox, oz);
    if (!pk.corner && Math.abs(oz) / od > 0.55) continue; // (a middle pocket only takes a ball coming fairly straight at it)
    if (pk.corner && (sx * ox + sz * oz) / (od * Math.SQRT2) < 0.25) continue; // (nor a corner one from along the far cushion)
    const gx = t.x - (ox / od) * (POOL.R + POOL.RC), gz = t.z - (oz / od) * (POOL.R + POOL.RC);
    const ax = gx - c.x, az = gz - c.z, ad = Math.hypot(ax, az);
    if (ad < 0.02) continue;
    const cut = (ax * ox + az * oz) / (ad * od); // cos of the cut angle
    if (cut < 0.5) continue;
    if (!pathClear(P.balls, c.x, c.z, gx, gz, POOL.RC, [0, t.id]) || !pathClear(P.balls, t.x, t.z, px, pz, POOL.R, [0, t.id])) continue;
    const score = cut * 2 - ad * 0.6 - od * 0.5 + (pk.corner ? 0.1 : 0);
    if (!best || score > best.score) best = { score, dx: ax, dz: az, v: Math.min(4.2, 0.9 + 1.4 * (ad + od) / Math.max(0.45, cut)), c };
  }
  if (!best) {
    // a safety: roll up to the nearest legal ball
    const c = spots[0]; let nb = targets[0], nd = 1e9;
    for (const t of targets) { const d = Math.hypot(t.x - c.x, t.z - c.z); if (d < nd && pathClear(P.balls, c.x, c.z, t.x, t.z, POOL.RC, [0, t.id])) { nd = d; nb = t; } }
    if (!nb) nb = P.balls.find((b) => !b.down && b.id !== 0)!;
    best = { score: 0, dx: nb.x - c.x, dz: nb.z - c.z, v: 0.8 + Math.hypot(nb.x - c.x, nb.z - c.z) * 0.9, c };
  }
  // the error: a small turn of the aim (about 0.3 degrees), +-10% power
  const e = gauss(rng) * PUBGAMES.npcAim, n = Math.hypot(best.dx, best.dz), ux = best.dx / n, uz = best.dz / n, ce = Math.cos(e), se = Math.sin(e);
  return { dx: ux * ce - uz * se, dz: ux * se + uz * ce, v: Math.max(POOL.vMin, Math.min(POOL.vMax, best.v * (1 + (rng() * 2 - 1) * PUBGAMES.npcPow))), cx: best.c.x, cz: best.c.z };
}

// ================================================================================================ a window's view of a station
// R12.3b: what each window (the host's own included) makes of the notes a station sends. Kept here, with no drawing, so
// the tests can drive it exactly as the client does.

/** a - b on the shared clock, which goes out wrapped at 600 s: the signed difference, in (-300, 300] */
export function wrapDelta(a: number, b: number): number {
  let d = (a - b) % 600;
  if (d > 300) d -= 600; else if (d <= -300) d += 600;
  return d;
}

/** seconds left until a deadline on the shared clock (never below 0) */
export function timeLeftAt(deadline: number, clock: number): number { return deadline < 0 ? 0 : Math.max(0, wrapDelta(deadline, clock)); }

export interface WireShot { k: string; n: number; b: [number, number, number, number][]; dx: number; dz: number; v: number; t0: number; dur: number }
/** a shot to play out: from `at` seconds in; why ("live" = in step with the host; "join" = you've just walked in on
 *  this game: from where it's got to; "behind" = this window heard late: from the start, catching up; "missed" = the
 *  whole shot came and went between two looks (a stalled frame, a background tab): played through quickly) */
export interface ReplayPlan { shot: WireShot; at: number; why: "live" | "join" | "behind" | "missed" }
/** missed: shots that came and went entirely while this window wasn't looking (more than the one it can still replay):
 *  the window says so rather than letting them vanish */
export interface FeedResult { changed: boolean; newGame: boolean; ended: boolean; replay: ReplayPlan | null; missed: number }

/** a window's reading of one station's notes: which game it's on, which shots it's already shown */
export class StationFeed {
  raw = ""; gid = -1; played = ""; playedN = -1;
  note: any = null;
  /** (diagnostics: ?pgdebug in the address, or tests) what happened, newest last */
  log: string[] | null = null;
  feed(raw: string, clock: number): FeedResult {
    const none: FeedResult = { changed: false, newGame: false, ended: false, replay: null, missed: 0 };
    if (raw === this.raw) return none;
    this.raw = raw;
    let n: any = null; try { n = raw ? JSON.parse(raw) : null; } catch { n = null; }
    if (!n) return none;
    const prev = this.note; this.note = n;
    // (a status change, a clock starting, someone reconnecting, is still a change: only the identities below decide
    //  whether anything new happened)
    const fresh = n.gid !== this.gid, firstLook = !prev;
    if (fresh) { this.gid = n.gid; this.played = ""; this.playedN = -1; }
    const ended = !!prev && prev.ph === "play" && (n.ph !== "play" || prev.gid !== n.gid);
    let replay: ReplayPlan | null = null, missed = 0;
    const sh: WireShot | null = n.shot, last: WireShot | null = n.last;
    // (a window that's only just arrived takes the game as it finds it; one that's been watching counts what it missed)
    const gap = (k: number) => (firstLook ? 0 : Math.max(0, k - this.playedN - 1));
    if (sh && sh.k !== this.played) {
      const el = wrapDelta(clock, sh.t0);
      // (the shot before this one came and went unseen: it plays first, quickly, then this one catches up)
      if (!firstLook && last && last.k !== this.played && last.n === sh.n - 1 && last.n > this.playedN) { missed = gap(last.n); replay = { shot: last, at: 0, why: "missed" }; this.queued = sh; }
      else { missed = gap(sh.n); this.queued = null; }
      this.played = sh.k; this.playedN = sh.n;
      if (!replay) {
        if (firstLook) replay = { shot: sh, at: Math.max(0, Math.min(sh.dur, el)), why: "join" };
        // (a patch or two late is normal: in step with the host; later than that, from the start and catch up: a
        //  shot's never just skipped)
        else if (el <= 0.6) replay = { shot: sh, at: Math.max(0, el), why: "live" };
        else replay = { shot: sh, at: 0, why: "behind" };
      }
    } else if (!sh && last && last.k !== this.played && !firstLook) {
      missed = gap(last.n);
      this.played = last.k; this.playedN = last.n;
      // (old news, minutes ago in a background tab: just the table as it is)
      if (wrapDelta(clock, last.t0) - last.dur < 6) replay = { shot: last, at: 0, why: "missed" }; else missed++;
    }
    if (this.log) {
      const sk = replay ? replay.shot.k : sh?.k ?? "-";
      this.log.push(`gid ${n.gid} ph ${n.ph} shot ${sk}${replay ? ` t0 ${replay.shot.t0} heard ${clock} el ${wrapDelta(clock, replay.shot.t0).toFixed(2)} -> ${replay.why} from ${replay.at.toFixed(2)}/${replay.shot.dur.toFixed(2)}` : ""}${ended ? " ENDED" : ""}${prev?.shot && !sh ? " settled" : ""}`);
      if (this.log.length > 60) this.log.shift();
    }
    return { changed: true, newGame: fresh, ended, replay, missed };
  }
  /** the shot that came in while a missed one was being caught up (play it next, catching up with the host) */
  queued: WireShot | null = null;
  next(): ReplayPlan | null { const q = this.queued; this.queued = null; return q && this.note?.shot?.k === q.k ? { shot: q, at: 0, why: "behind" } : null; }
}

/** a replay's next time: in step with the host's clock, never ahead of it, never backwards; if it's behind (heard late,
 *  a stalled frame, the host already finished), it plays faster until it's caught up. hostEl = how far the host is
 *  into this shot, or null once the host's done with it. */
export const REPLAY_CATCHUP = 2.5;
export function replayStep(t: number, dt: number, hostEl: number | null, dur: number): number {
  const target = hostEl === null ? dur : Math.min(dur, hostEl);
  let nt = t + dt * (target - t > 0.3 ? REPLAY_CATCHUP : 1);
  if (hostEl !== null) nt = Math.min(nt, hostEl + 0.1);
  return Math.min(dur, Math.max(t, nt));
}
