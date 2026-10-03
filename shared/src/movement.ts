// First-person character movement. Pure functions, no engine dependency.
// The SAME code runs on the client (so your own movement feels instant) and on
// the server (which is the referee). If they ever disagree, the client snaps
// to the server's answer and replays its unconfirmed inputs ("reconciliation").
//
// Phase 1 adds: weighty momentum, stamina, crouch, belly slide, dodge, mantle, stumble.
// Actions follow a strict priority order each step so they can never overlap or get stuck:
//   mantle (locks everything) > stumble (limits) > slide > dodge > normal movement.

import { PLAYER, SIM_DT } from "./constants.js";
import { localArena, inWater, inDeepWater, inLobby, type ArenaLayout, type Box } from "./arena.js";

/** Slice 2A: speed while wading through the pond */
export const WADE_SPEED = 0.45;
/** C1.1: floating in the canal: slow, no sprint / jump / climb / slide / dodge (you get out at a ladder) */
export const SWIM_SPEED = 0.38;

export interface MoveInput {
  /** increasing sequence number, used for reconciliation */
  seq: number;
  /** -1..1 strafe (right is +) */
  mx: number;
  /** -1..1 forward (forward is +) */
  mz: number;
  /** look yaw in radians (0 = +z) */
  yaw: number;
  /** look pitch in radians (only used for rendering other players' heads) */
  pitch: number;
  sprint: boolean;
  jump: boolean;
  crouch: boolean;
  dodge: boolean;
}

export interface MoveState {
  x: number;
  y: number; // feet height
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  /** Button latches so holding a button doesn't repeat its action */
  jumpLatch: boolean;
  crouchLatch: boolean;
  dodgeLatch: boolean;
  crouching: boolean;
  stamina: number; // 0..1
  staminaDelay: number; // seconds before stamina starts refilling
  winded: boolean; // emptied the bar: no sprint until it refills a bit
  slideT: number; // >0 while sliding
  slideCd: number;
  dodgeT: number; // >0 while dodging
  dodgeCd: number;
  mantleT: number; // >0 while climbing a ledge
  mantleY: number; // ledge top we are climbing to
  stumbleT: number; // >0 while stumbling after a big fall
  /** Set by the World when you carry something (Phase 2). 1 = empty-handed. */
  carryMul: number;
  carryHeavy: boolean; // heavy item: no sprint, no dodge
  handsFull: boolean; // big item in hands: can't climb ledges
  /** Phase 2.5: knocked down (can't move/act), immunity after getting up, trapped in a mime's box, pigeon swarm */
  knockT: number;
  immuneT: number;
  trapT: number;
  swarmT: number;
  /** Phase 5A: tased by a cop (can't move for ~2 s) */
  stunT: number;
}

/** Every MoveState field, split by type. The server syncs exactly these. */
export const MOVE_NUM_KEYS = [
  "x", "y", "z", "vx", "vy", "vz", "yaw", "pitch", "stamina", "staminaDelay",
  "slideT", "slideCd", "dodgeT", "dodgeCd", "mantleT", "mantleY", "stumbleT", "carryMul",
  "knockT", "immuneT", "trapT", "swarmT", "stunT",
] as const;
export const MOVE_BOOL_KEYS = ["grounded", "jumpLatch", "crouchLatch", "dodgeLatch", "crouching", "winded", "carryHeavy", "handsFull"] as const;

export function makeMoveState(x: number, z: number, yaw = 0): MoveState {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, grounded: true,
    jumpLatch: false, crouchLatch: false, dodgeLatch: false, crouching: false,
    stamina: 1, staminaDelay: 0, winded: false,
    slideT: 0, slideCd: 0, dodgeT: 0, dodgeCd: 0, mantleT: 0, mantleY: 0, stumbleT: 0,
    carryMul: 1, carryHeavy: false, handsFull: false,
    knockT: 0, immuneT: 0, trapT: 0, swarmT: 0, stunT: 0,
  };
}

export function cloneMoveState(s: MoveState): MoveState {
  return { ...s };
}

/** Copy the movement fields out of any object that has them (e.g. synced server state). */
export function readMoveState(src: Record<string, any>): MoveState {
  const s = makeMoveState(0, 0);
  for (const k of MOVE_NUM_KEYS) s[k] = Number(src[k]) || 0;
  for (const k of MOVE_BOOL_KEYS) s[k] = src[k] === true;
  if (!(s.carryMul > 0)) s.carryMul = 1; // older/partial state: treat as empty-handed
  return s;
}

export function writeMoveState(dst: Record<string, any>, s: MoveState): void {
  for (const k of MOVE_NUM_KEYS) dst[k] = s[k];
  for (const k of MOVE_BOOL_KEYS) dst[k] = s[k];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Makes a received input safe: clamps ranges and replaces NaN. Server always calls this. */
export function sanitizeInput(raw: Partial<MoveInput> | null | undefined): MoveInput | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const seq = num(raw.seq, -1);
  if (seq < 0 || !Number.isInteger(seq)) return null;
  let mx = clamp(num(raw.mx), -1, 1);
  let mz = clamp(num(raw.mz), -1, 1);
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  return {
    seq,
    mx,
    mz,
    yaw: num(raw.yaw) % (Math.PI * 2),
    pitch: clamp(num(raw.pitch), -1.5, 1.5),
    sprint: raw.sprint === true,
    jump: raw.jump === true,
    crouch: raw.crouch === true,
    dodge: raw.dodge === true,
  };
}

/** Current collision height (crouching and sliding make you shorter). */
export function playerHeight(s: MoveState): number {
  return s.crouching || s.slideT > 0 || s.knockT > 0 ? PLAYER.crouchHeight : PLAYER.height;
}

/** Does a vertical span [y, y+h] overlap the box's vertical span? */
function verticalOverlap(y: number, h: number, b: Box, bottomSlack = 0): boolean {
  const top = b.y + b.h / 2;
  const bottom = b.y - b.h / 2;
  return y + bottomSlack < top && y + h > bottom;
}

/**
 * Push a circle (player footprint) out of a rectangle on the XZ plane.
 * Returns true if a push happened. Mutates s.x/s.z and removes velocity into the wall.
 */
function pushOutXZ(s: MoveState, b: Box): boolean {
  const r = PLAYER.radius;
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  const cx = clamp(s.x, minX, maxX);
  const cz = clamp(s.z, minZ, maxZ);
  const dx = s.x - cx;
  const dz = s.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;

  let nx: number;
  let nz: number;
  let pen: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    nz = dz / d;
    pen = r - d;
  } else {
    // Centre is inside the rectangle: push out along the shallowest axis.
    const left = s.x - minX;
    const right = maxX - s.x;
    const back = s.z - minZ;
    const front = maxZ - s.z;
    const m = Math.min(left, right, back, front);
    if (m === left) { nx = -1; nz = 0; pen = left + r; }
    else if (m === right) { nx = 1; nz = 0; pen = right + r; }
    else if (m === back) { nx = 0; nz = -1; pen = back + r; }
    else { nx = 0; nz = 1; pen = front + r; }
  }
  s.x += nx * pen;
  s.z += nz * pen;
  // Remove the velocity component going into the wall (lets you slide along it).
  const vn = s.vx * nx + s.vz * nz;
  if (vn < 0) {
    s.vx -= vn * nx;
    s.vz -= vn * nz;
  }
  return true;
}

function footprintOverlapsAt(x: number, z: number, b: Box, shrink = 0.02): boolean {
  const r = PLAYER.radius - shrink;
  const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
  const cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/** Highest surface directly under a footprint at (x,z), at or below `maxY`. */
export function groundHeightAt(x: number, z: number, boxes: Box[], maxY: number): number {
  let g = 0;
  for (const b of boxes) {
    const top = b.y + b.h / 2;
    if (top <= maxY + 1e-6 && top > g && footprintOverlapsAt(x, z, b)) g = top;
  }
  return g;
}

/** Is anything occupying the space [y, y+h] at footprint (x,z)? */
function spaceBlocked(x: number, z: number, y: number, h: number, boxes: Box[]): boolean {
  for (const b of boxes) {
    if (verticalOverlap(y, h, b, 0.02) && footprintOverlapsAt(x, z, b, 0.04)) return true;
  }
  return false;
}

/** Could the player stand up (full height) right now? */
export function canStand(s: MoveState, arena: ArenaLayout): boolean {
  return !spaceBlocked(s.x, s.z, s.y + 0.01, PLAYER.height - 0.01, arena.boxes);
}

/**
 * Look for a ledge in front of the player that can be mantled.
 * Returns the ledge top and landing point, or null.
 */
export function findMantle(s: MoveState, arena: ArenaLayout): { top: number; x: number; z: number } | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  // Probe a point just past our front edge
  const px = s.x + fx * (PLAYER.radius + PLAYER.mantleReach * 0.5);
  const pz = s.z + fz * (PLAYER.radius + PLAYER.mantleReach * 0.5);
  let best: Box | null = null;
  let bestTop = Infinity;
  for (const b of arena.boxes) {
    const top = b.y + b.h / 2;
    const rise = top - s.y;
    if (rise < PLAYER.mantleMin || rise > PLAYER.mantleMax) continue;
    if (b.y - b.h / 2 > s.y + 0.6) continue; // floating slab we can't reach from below
    const inX = Math.abs(px - b.x) <= b.w / 2 + 0.05;
    const inZ = Math.abs(pz - b.z) <= b.d / 2 + 0.05;
    if (inX && inZ && top < bestTop) { best = b; bestTop = top; }
  }
  if (!best) return null;
  // Landing point: far enough onto the ledge that our whole footprint is on it
  const lx = s.x + fx * (PLAYER.radius * 2 + 0.25);
  const lz = s.z + fz * (PLAYER.radius * 2 + 0.25);
  if (groundHeightAt(lx, lz, arena.boxes, bestTop + 0.01) < bestTop - 1e-6) return null; // not solid there
  if (spaceBlocked(lx, lz, bestTop + 0.01, PLAYER.height - 0.02, arena.boxes)) return null; // no room on top
  // Nothing above our head on the way up
  if (spaceBlocked(s.x, s.z, s.y + 0.01, bestTop - s.y + PLAYER.height - 0.02, arena.boxes)) return null;
  return { top: bestTop, x: lx, z: lz };
}

/**
 * Advance one fixed simulation step. Mutates and returns `s`.
 * Deterministic: same state + same input + same arena => same result.
 */
export function stepMovement(s: MoveState, input: MoveInput, fullArena: ArenaLayout, dt = SIM_DT): MoveState {
  // only the boxes near us (big city); 4 m covers a step's movement, climbing reach and landing spot
  const arena = localArena(fullArena, s.x, s.z, 4);
  s.yaw = input.yaw;
  s.pitch = input.pitch;

  // ---- 1. timers --------------------------------------------------------------
  s.slideCd = Math.max(0, s.slideCd - dt);
  s.dodgeCd = Math.max(0, s.dodgeCd - dt);
  s.stumbleT = Math.max(0, s.stumbleT - dt);
  s.staminaDelay = Math.max(0, s.staminaDelay - dt);
  s.knockT = Math.max(0, s.knockT - dt);
  s.immuneT = Math.max(0, s.immuneT - dt);
  s.trapT = Math.max(0, s.trapT - dt);
  s.swarmT = Math.max(0, s.swarmT - dt);
  s.stunT = Math.max(0, s.stunT - dt);
  // Knocked down, tased, or trapped in a mime's invisible box: no control at all (you still slide to a stop)
  if (s.knockT > 0 || s.trapT > 0 || s.stunT > 0) {
    input = { ...input, mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false };
    s.slideT = 0;
  }

  // C1.1: in the canal you just paddle
  const swimming = inDeepWater(fullArena, s.x, s.z, s.y);
  if (swimming) { input = { ...input, sprint: false, jump: false, crouch: false, dodge: false }; s.slideT = 0; s.crouching = false; }

  // Button edges (pressed this step, not held from before)
  const jumpPressed = input.jump && !s.jumpLatch;
  const crouchPressed = input.crouch && !s.crouchLatch;
  const dodgePressed = input.dodge && !s.dodgeLatch;
  s.jumpLatch = input.jump;
  s.crouchLatch = input.crouch;
  s.dodgeLatch = input.dodge;

  // ---- 2. mantle locks out everything else -------------------------------------
  if (s.mantleT > 0) {
    const step = Math.min(dt, s.mantleT);
    s.x += s.vx * step;
    s.y += s.vy * step;
    s.z += s.vz * step;
    s.mantleT -= step;
    if (s.mantleT <= 1e-9) {
      s.mantleT = 0;
      s.y = s.mantleY;
      s.vx *= 0.25; // keep a little forward drift so it flows
      s.vz *= 0.25;
      s.vy = 0;
      s.grounded = true;
    }
    regenStamina(s, dt, false);
    return s;
  }

  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let mx = input.mx;
  let mz = input.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const hasInput = len > 0.01;
  // forward = (sin, cos), right = (cos, -sin)
  const dirX = sin * mz + cos * mx;
  const dirZ = cos * mz - sin * mx;

  // ---- 3. start a mantle? (jump pressed facing a ledge) ------------------------
  if (jumpPressed && s.stumbleT <= 0 && s.slideT <= 0 && s.dodgeT <= 0 && !s.handsFull) {
    const m = findMantle(s, arena);
    if (m && (s.grounded || s.vy > -6)) {
      const rise = m.top - s.y;
      const T = 0.26 + 0.12 * rise;
      s.mantleT = T;
      s.mantleY = m.top;
      s.vx = (m.x - s.x) / T;
      s.vz = (m.z - s.z) / T;
      s.vy = rise / T;
      s.grounded = false;
      s.crouching = false;
      return s;
    }
  }

  const horiz = Math.hypot(s.vx, s.vz);

  // ---- 4. stance: slide / crouch ------------------------------------------------
  if (s.slideT > 0) {
    s.slideT -= dt;
    const endSlide = s.slideT <= 0 || horiz < 2.5 || !s.grounded;
    if (endSlide) {
      s.slideT = 0;
      s.slideCd = PLAYER.slideCooldown;
      s.crouching = input.crouch || !canStand(s, arena);
    }
  } else if (crouchPressed && s.grounded && horiz >= PLAYER.slideMinSpeed && s.slideCd <= 0 && s.stumbleT <= 0 && s.dodgeT <= 0) {
    s.slideT = PLAYER.slideTime;
    const k = PLAYER.slideSpeed / Math.max(horiz, 1e-6);
    s.vx *= k;
    s.vz *= k;
    s.stamina = Math.max(0, s.stamina - PLAYER.slideStamina);
    s.staminaDelay = PLAYER.staminaRegenDelay;
    s.crouching = true;
  } else {
    s.crouching = input.crouch || (s.crouching && !canStand(s, arena));
  }
  const sliding = s.slideT > 0;

  // ---- 5. dodge -------------------------------------------------------------------
  if (s.dodgeT > 0) {
    s.dodgeT = Math.max(0, s.dodgeT - dt);
    if (s.dodgeT === 0) s.dodgeCd = PLAYER.dodgeCooldown;
  } else if (dodgePressed && s.grounded && !sliding && !s.carryHeavy && s.stumbleT <= 0 && s.dodgeCd <= 0 && s.stamina >= PLAYER.dodgeStamina) {
    let ddx = dirX, ddz = dirZ;
    const dl = Math.hypot(ddx, ddz);
    if (dl < 0.01) { ddx = sin; ddz = cos; } else { ddx /= dl; ddz /= dl; }
    s.dodgeT = PLAYER.dodgeTime;
    s.vx = ddx * PLAYER.dodgeSpeed;
    s.vz = ddz * PLAYER.dodgeSpeed;
    s.vy = PLAYER.dodgeHop;
    s.grounded = false;
    s.crouching = false;
    s.stamina -= PLAYER.dodgeStamina;
    s.staminaDelay = PLAYER.staminaRegenDelay;
    s.swarmT = Math.max(0, s.swarmT - 1.5); // dodging shakes off pigeons
  }
  const dodging = s.dodgeT > 0;

  // ---- 6. horizontal acceleration ---------------------------------------------------
  const backwards = mz < -0.1;
  const stumbling = s.stumbleT > 0;
  const canSprint = input.sprint && !s.winded && !s.carryHeavy && s.stamina > 0 && mz > 0.1 && !s.crouching && !stumbling;
  let speed: number;
  if (stumbling) speed = PLAYER.walkSpeed * PLAYER.stumbleSpeedFactor;
  else if (s.crouching) speed = PLAYER.crouchSpeed;
  else if (canSprint) speed = PLAYER.sprintSpeed;
  else speed = PLAYER.walkSpeed;
  if (backwards && !s.crouching) speed *= PLAYER.backwardFactor;
  speed *= s.carryMul;
  if (s.swarmT > 0) speed *= 0.6; // pigeons everywhere
  if (s.y < 0.3 && inWater(fullArena, s.x, s.z)) speed *= WADE_SPEED; // Slice 2A: wading through the pond
  if (swimming) speed = PLAYER.walkSpeed * SWIM_SPEED * Math.min(1, s.carryMul + 0.3);
  const wishX = dirX * speed;
  const wishZ = dirZ * speed;

  if (sliding) {
    // Friction along the slide, a little steering
    const sp = Math.hypot(s.vx, s.vz);
    const ns = Math.max(0, sp - PLAYER.slideFriction * dt);
    if (sp > 1e-6) { s.vx *= ns / sp; s.vz *= ns / sp; }
    if (hasInput) {
      s.vx += dirX * PLAYER.slideSteer * dt;
      s.vz += dirZ * PLAYER.slideSteer * dt;
    }
  } else if (!dodging) {
    let accel = s.grounded ? (hasInput ? PLAYER.groundAccel : PLAYER.groundDecel) : PLAYER.airAccel;
    // D1: turning hard against your own momentum (reversing, a sharp cut) bites harder, so weaving feels snappy
    if (s.grounded && hasInput && s.vx * wishX + s.vz * wishZ < 0) accel *= PLAYER.turnBoost;
    // Accelerate the velocity vector toward the wish vector (keeps diagonal speed correct).
    if (s.grounded || hasInput) {
      const dvx = wishX - s.vx;
      const dvz = wishZ - s.vz;
      const dvLen = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dvLen <= maxDv) { s.vx = wishX; s.vz = wishZ; }
      else { s.vx += (dvx / dvLen) * maxDv; s.vz += (dvz / dvLen) * maxDv; }
    }
  }

  // ---- 7. stamina -----------------------------------------------------------------
  const actuallySprinting = canSprint && s.grounded && !sliding && Math.hypot(s.vx, s.vz) > PLAYER.walkSpeed + 0.3;
  regenStamina(s, dt, actuallySprinting);

  // ---- 8. jump (also cancels a slide, keeping its momentum) ------------------------
  if (jumpPressed && s.grounded && !stumbling && !dodging) {
    const blocked = s.crouching && !canStand(s, arena);
    if (!blocked) {
      if (sliding) { s.slideT = 0; s.slideCd = PLAYER.slideCooldown; }
      s.crouching = false;
      s.vy = PLAYER.jumpSpeed;
      s.grounded = false;
    }
  }
  if (!s.grounded) {
    s.vy = Math.max(s.vy - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
  }

  // ---- 9. horizontal move + collide -------------------------------------------------
  const h = playerHeight(s);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  for (let iter = 0; iter < 3; iter++) {
    let pushed = false;
    for (const b of arena.boxes) {
      const top = b.y + b.h / 2;
      // Low obstacles we can step onto are handled as ground, not walls (only when grounded).
      const stepable = s.grounded && top - s.y <= PLAYER.stepHeight && top > s.y;
      if (stepable) continue;
      if (!verticalOverlap(s.y, h, b, 0.01)) continue;
      if (pushOutXZ(s, b)) pushed = true;
    }
    if (!pushed) break;
  }

  // Keep inside arena
  const lim = arena.halfSize - PLAYER.radius;
  if (!inLobby(arena, s.x, s.z, 2)) { // (C5a: the lobby roof is past the edge; its fence keeps you on it)
    s.x = clamp(s.x, -lim, lim);
    s.z = clamp(s.z, -lim, lim);
  }

  // ---- 10. vertical move + land -----------------------------------------------------
  if (s.grounded) {
    // Stick to ground / step up curbs / walk off ledges.
    const g = groundHeightAt(s.x, s.z, arena.boxes, s.y + PLAYER.stepHeight);
    if (g >= s.y - 0.05) {
      s.y = g;
      s.vy = 0;
    } else {
      s.grounded = false; // walked off an edge
      s.vy = 0;
    }
  } else {
    const prevY = s.y;
    s.y += s.vy * dt;
    if (s.vy <= 0) {
      const g = groundHeightAt(s.x, s.z, arena.boxes, prevY + 0.001);
      if (s.y <= g) {
        const impact = -s.vy;
        s.y = g;
        s.vy = 0;
        s.grounded = true;
        if (impact > PLAYER.stumbleImpact) {
          s.stumbleT = PLAYER.stumbleTime;
          s.vx *= 0.3;
          s.vz *= 0.3;
          s.slideT = 0;
        }
      }
    } else {
      // Head bump on the underside of anything above
      for (const b of arena.boxes) {
        const bottom = b.y - b.h / 2;
        if (prevY + h <= bottom + 1e-6 && s.y + h > bottom && footprintOverlapsAt(s.x, s.z, b)) {
          s.y = bottom - h;
          s.vy = 0;
        }
      }
    }
  }
  // ---- 11. C5c.3: a conveyor belt carries whatever stands on it ------------------------------------
  if (s.grounded && s.knockT <= 0) {
    for (const b of arena.boxes) {
      if (!b.belt || Math.abs(b.y + b.h / 2 - s.y) > 0.03 || !footprintOverlapsAt(s.x, s.z, b, 0.2)) continue;
      s.x += b.belt[0] * dt; s.z += b.belt[1] * dt;
      break;
    }
  }
  return s;
}

function regenStamina(s: MoveState, dt: number, sprinting: boolean) {
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - PLAYER.staminaDrain * dt);
    s.staminaDelay = PLAYER.staminaRegenDelay;
    if (s.stamina <= 0) s.winded = true;
  } else if (s.staminaDelay <= 0) {
    s.stamina = Math.min(1, s.stamina + PLAYER.staminaRegen * dt);
  }
  if (s.winded && s.stamina >= PLAYER.windedRecover) s.winded = false;
}

/** Horizontal speed, handy for animation + tests. */
export function horizontalSpeed(s: MoveState): number {
  return Math.hypot(s.vx, s.vz);
}

/** High-level pose, used by animation (hands, other players) and sounds. */
export type MovePose = "tumble" | "knocked" | "mantle" | "stumble" | "slide" | "dodge" | "air" | "crouch" | "crouchWalk" | "sprint" | "walk" | "idle";

export function movePose(s: MoveState): MovePose {
  if (s.knockT > 0) return s.grounded ? "knocked" : "tumble"; // (D1: flying through the air after a car hit)
  if (s.mantleT > 0) return "mantle";
  if (s.stumbleT > 0 || s.stunT > 0) return "stumble";
  if (s.slideT > 0) return "slide";
  if (s.dodgeT > 0) return "dodge";
  if (!s.grounded) return "air";
  const sp = horizontalSpeed(s);
  if (s.crouching) return sp > 0.4 ? "crouchWalk" : "crouch";
  if (sp > PLAYER.walkSpeed + 0.4) return "sprint";
  if (sp > 0.4) return "walk";
  return "idle";
}
