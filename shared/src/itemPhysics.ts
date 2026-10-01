// Simple, deterministic physics for loose items (thrown, dropped, bouncing).
// Items are spheres for collision (cheap and stable); they look like TVs and chickens.
// Shared by the server and solo mode, and by the client to predict your own throws.
import { nearBoxes, inLobby, type ArenaLayout, type Box } from "./arena.js";

export interface ItemBody {
  x: number; y: number; z: number; // centre of the collision sphere
  vx: number; vy: number; vz: number;
  rot: number; // visual yaw
  spin: number; // visual spin speed (rad/s)
  resting: boolean;
}

export const ITEM_GRAVITY = 24;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface ItemStepResult {
  /** strongest impact speed this step (for sounds/dust), 0 if none */
  impact: number;
  outOfBounds: boolean;
}

/** Push a sphere out of a box. Returns the contact normal's y (1 = standing on top) or null. */
function collideSphereBox(b: ItemBody, r: number, box: Box, bounce: number, out: { impact: number }): number | null {
  const minX = box.x - box.w / 2, maxX = box.x + box.w / 2;
  const minY = box.y - box.h / 2, maxY = box.y + box.h / 2;
  const minZ = box.z - box.d / 2, maxZ = box.z + box.d / 2;
  const cx = clamp(b.x, minX, maxX), cy = clamp(b.y, minY, maxY), cz = clamp(b.z, minZ, maxZ);
  let dx = b.x - cx, dy = b.y - cy, dz = b.z - cz;
  let d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return null;
  let nx: number, ny: number, nz: number, pen: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; nz = dz / d;
    pen = r - d;
  } else {
    // centre inside the box: leave along the shallowest face (prefer up)
    const faces = [
      { n: [0, 1, 0], p: maxY - b.y }, { n: [0, -1, 0], p: b.y - minY },
      { n: [1, 0, 0], p: maxX - b.x }, { n: [-1, 0, 0], p: b.x - minX },
      { n: [0, 0, 1], p: maxZ - b.z }, { n: [0, 0, -1], p: b.z - minZ },
    ];
    let best = faces[0];
    for (const f of faces) if (f.p < best.p) best = f;
    [nx, ny, nz] = best.n;
    pen = best.p + r;
  }
  b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) {
    out.impact = Math.max(out.impact, -vn);
    // reflect the normal part with bounciness, damp the sliding part a little
    b.vx -= (1 + bounce) * vn * nx;
    b.vy -= (1 + bounce) * vn * ny;
    b.vz -= (1 + bounce) * vn * nz;
    b.vx *= 0.85; b.vz *= 0.85;
    b.spin *= 0.7;
  }
  return ny;
}

/**
 * Advance a loose item one step. Mutates `b`.
 * Returns the strongest impact (for effects) and whether it left the world.
 */
export function stepItem(b: ItemBody, radius: number, bounce: number, arena: ArenaLayout, dt: number): ItemStepResult {
  const res = { impact: 0, outOfBounds: false };
  if (b.resting) return res;
  b.vy -= ITEM_GRAVITY * dt;
  // Sub-step fast items so they can't tunnel through thin walls
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.min(8, Math.max(1, Math.ceil((speed * dt) / (radius * 0.5))));
  const h = dt / n;
  let supported = false;
  const boxes = nearBoxes(arena, b.x, b.z, radius + speed * dt + 1.5);
  for (let i = 0; i < n; i++) {
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    for (const box of boxes) {
      const ny = collideSphereBox(b, radius, box, bounce, res);
      if (ny !== null && ny > 0.7) supported = true;
    }
    if (b.y - radius < 0) {
      b.y = radius;
      if (b.vy < 0) {
        res.impact = Math.max(res.impact, -b.vy);
        b.vy = -b.vy * bounce;
        b.vx *= 0.8; b.vz *= 0.8;
        b.spin *= 0.6;
      }
      supported = true;
    }
  }
  b.rot += b.spin * dt;
  if (supported) {
    // ground friction
    const f = Math.max(0, 1 - 6 * dt);
    b.vx *= f; b.vz *= f;
    if (Math.abs(b.vy) < 0.8 && Math.hypot(b.vx, b.vz) < 0.15) {
      b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
      b.resting = true;
    }
  }
  const lim = arena.halfSize + 2;
  if (!Number.isFinite(b.x + b.y + b.z) || b.y < -5 || ((Math.abs(b.x) > lim || Math.abs(b.z) > lim) && !inLobby(arena, b.x, b.z, 1))) res.outOfBounds = true;
  return res;
}

/** Wake an item up (it was moved, or something under it changed). */
export function wakeItem(b: ItemBody) {
  b.resting = false;
}
