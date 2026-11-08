// First-person hands: bare cartoon hands with simple white hand wraps (Blake's choice, Phase 2).
// They also hold loot: big items between both hands, small items in the right hand.
// PLACEHOLDER-QUALITY MODEL built from simple shapes, but the animation system is the real one:
//
// Animation state system: every frame we pick ONE pose from the movement state
// (idle, walk, sprint, crouch, slide, dodge, mantle, air, stumble...), compute that pose's
// target positions, and every hand bone eases toward its target. Because we always ease
// toward "the pose for the current state", poses can never conflict, freeze or get stuck:
// changing state simply changes the target. One-off impulses (landing dip) are springs on top.
import { Scene, MeshBuilder, TransformNode, Mesh, Vector3, Color3, Matrix, StandardMaterial, VertexBuffer, type Camera } from "./babylon.ts";
import { ink, PALETTE } from "./look.ts";

/**
 * 5A.1: the hands used the world's cel-shaded lighting, so whole faces went near-black whenever you
 * looked up or turned (the "strange dark blocks" on the arms). Now each part gets its own fixed
 * two-tone shading baked into vertex colours (light from over your shoulder), drawn unlit: the hands
 * always read clearly, day or night.
 */
const VM_LIGHT = new Vector3(0.35, 0.85, -0.4).normalize();
const vmMats = new Map<string, StandardMaterial>();
function shadedPart(scene: Scene, m: Mesh, hex: string) {
  let mat = vmMats.get(scene.uid);
  if (!mat) {
    mat = new StandardMaterial("vmFlat", scene);
    mat.disableLighting = true;
    mat.emissiveColor = Color3.White();
    vmMats.set(scene.uid, mat);
  }
  const c = Color3.FromHexString(hex);
  const rot = Matrix.RotationYawPitchRoll(m.rotation.y, m.rotation.x, m.rotation.z);
  const nrm = m.getVerticesData(VertexBuffer.NormalKind) ?? [];
  const n = m.getTotalVertices();
  const cols = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Vector3.TransformNormal(new Vector3(nrm[i * 3] ?? 0, nrm[i * 3 + 1] ?? 1, nrm[i * 3 + 2] ?? 0), rot);
    const d = Vector3.Dot(v, VM_LIGHT);
    const k = d > 0.35 ? 1 : d > -0.2 ? 0.86 : 0.72; // three soft cartoon bands, never black
    cols[i * 4] = c.r * k; cols[i * 4 + 1] = c.g * k; cols[i * 4 + 2] = c.b * k; cols[i * 4 + 3] = 1;
  }
  m.setVerticesData(VertexBuffer.ColorKind, cols);
  m.useVertexColors = true;
  m.material = mat;
}
import { buildLootModel } from "./models.ts";
import { lootDef, type MovePose } from "@bfb/shared";
import { Spring } from "./spring.ts";

interface HandRig {
  root: TransformNode;
  pos: Vector3;
  rot: Vector3;
}

interface Pose { lp: [number, number, number]; lr: [number, number, number]; rp: [number, number, number]; rr: [number, number, number]; }

const PUNCH_T = 0.26;
const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

// Base poses in camera space (x right, y up, z forward). Rotations are radians (pitch, yaw, roll).
// (5A.1: every pose sits 5 cm lower than before so the hands cover less of the screen.)
const POSES: Record<MovePose, Pose> = {
  idle:       { lp: V(-0.30, -0.35, 0.55), lr: V(0.1, 0.25, -0.3), rp: V(0.30, -0.35, 0.55), rr: V(0.1, -0.25, 0.3) },
  walk:       { lp: V(-0.31, -0.37, 0.54), lr: V(0.1, 0.25, -0.3), rp: V(0.31, -0.37, 0.54), rr: V(0.1, -0.25, 0.3) },
  sprint:     { lp: V(-0.30, -0.41, 0.50), lr: V(0.5, 0.35, -0.5), rp: V(0.30, -0.41, 0.50), rr: V(0.5, -0.35, 0.5) },
  crouch:     { lp: V(-0.26, -0.39, 0.50), lr: V(0.3, 0.3, -0.2), rp: V(0.26, -0.39, 0.50), rr: V(0.3, -0.3, 0.2) },
  crouchWalk: { lp: V(-0.26, -0.40, 0.50), lr: V(0.3, 0.3, -0.2), rp: V(0.26, -0.40, 0.50), rr: V(0.3, -0.3, 0.2) },
  slide:      { lp: V(-0.42, -0.17, 0.45), lr: V(-0.6, 0.5, -1.0), rp: V(0.42, -0.17, 0.45), rr: V(-0.6, -0.5, 1.0) },
  dodge:      { lp: V(-0.38, -0.27, 0.50), lr: V(-0.2, 0.6, -0.9), rp: V(0.38, -0.27, 0.50), rr: V(-0.2, -0.6, 0.9) },
  mantle:     { lp: V(-0.22, -0.10, 0.62), lr: V(-0.9, 0.1, -0.1), rp: V(0.22, -0.10, 0.62), rr: V(-0.9, -0.1, 0.1) },
  air:        { lp: V(-0.34, -0.25, 0.52), lr: V(-0.2, 0.3, -0.5), rp: V(0.34, -0.25, 0.52), rr: V(-0.2, -0.3, 0.5) },
  stumble:    { lp: V(-0.40, -0.20, 0.48), lr: V(-0.4, 0.4, -1.2), rp: V(0.40, -0.20, 0.48), rr: V(-0.4, -0.4, 1.2) },
  // flat on your back: hands flop up in front of your face
  knocked:    { lp: V(-0.50, -0.35, 0.42), lr: V(-0.7, 0.6, -1.4), rp: V(0.52, -0.37, 0.44), rr: V(-0.8, -0.5, 1.5) },
  dance:      { lp: V(-0.34, -0.02, 0.58), lr: V(-1.3, 0.3, -0.4), rp: V(0.34, -0.02, 0.58), rr: V(-1.3, -0.3, 0.4) }, // (R11: hands up, pumping to the beat)
  tumble:     { lp: V(-0.62, 0.10, 0.36), lr: V(-1.6, 0.8, -1.2), rp: V(0.64, 0.12, 0.36), rr: V(-1.6, -0.8, 1.2) }, // (D1: arms flung up, flying after a car hit)
};

export class Viewmodel {
  private left: HandRig;
  private right: HandRig;
  private rootNode: TransformNode;
  /** R12.6: your hands and what's in them (lit by the room you're in) */
  get node(): TransformNode { return this.rootNode; }
  private t = 0;
  private phase = 0;
  private dip = new Spring(160, 18); // landing dip
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private mantleProgress = 0;
  private scene: Scene;
  private holdNode: TransformNode;
  private held: { type: string; size: "small" | "big" | "giant"; root: TransformNode } | null = null;
  private charge = 0; // 0..1 while winding up a throw
  private throwT = 0; // >0 right after a throw (follow-through)
  private punchT = 0; // >0 during a jab
  /** 5A.1 (Blake): left click = a jab with the LEFT fist, every time */
  private punchSide: 1 | -1 = -1;

  constructor(scene: Scene, camera: Camera, color: string) {
    this.rootNode = new TransformNode("viewmodel", scene);
    this.rootNode.parent = camera;
    this.rootNode.scaling.setAll(0.8);
    this.scene = scene;
    this.holdNode = new TransformNode("hold", scene);
    this.holdNode.parent = this.rootNode;
    this.left = this.buildHand(scene, color, -1);
    this.right = this.buildHand(scene, color, 1);
    const init = POSES.idle;
    this.left.pos.set(...init.lp); this.left.rot.set(...init.lr);
    this.right.pos.set(...init.rp); this.right.rot.set(...init.rr);
    // Hands draw after the world with a cleared depth buffer, so they never poke through walls.
    scene.setRenderingAutoClearDepthStencil(2, true, true, true);
  }

  private buildHand(scene: Scene, color: string, side: 1 | -1): HandRig {
    const root = new TransformNode("hand" + side, scene);
    root.parent = this.rootNode;
    const parts: Mesh[] = [];
    const add = (m: Mesh, mat: string, outline = 0.007) => {
      m.parent = root;
      queueMicrotask(() => shadedPart(scene, m, mat)); // (after the caller has set its rotation)
      ink(m, outline);
      m.renderingGroupId = 2;
      m.isPickable = false;
      parts.push(m);
      return m;
    };
    const WRAP = "#f4f1ea";
    const WRAP_SHADE = "#dcd6c8";
    // sleeve (patched jacket) going back toward the body
    const sleeve = add(MeshBuilder.CreateCylinder("sleeve", { diameterTop: 0.12, diameterBottom: 0.13, height: 0.15, tessellation: 10 }, scene), "#5a4d6e");
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.02, -0.13);
    // 5A.1 clean boxer tape (Blake): layered wrist wraps, snug bands round the palm, a knuckle pad,
    // (The old mustard sleeve patch is gone; tape has no ink lines of its own, only the hand does.)
    for (const [z, d, c] of [[-0.06, 0.118, WRAP_SHADE], [-0.03, 0.122, WRAP], [0.0, 0.116, WRAP_SHADE]] as const) {
      const ring = add(MeshBuilder.CreateCylinder("wristWrap", { diameter: d, height: 0.032, tessellation: 12 }, scene), c, 0);
      ring.renderOutline = d > 0.12; // one outline round the whole wrist wrap, not every layer
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, -0.01, z);
    }
    // bare cartoon hand (palm)
    // (thin ink: the outline shell is written into the depth buffer, so the tape must sit outside it)
    const palm = add(MeshBuilder.CreateBox("palm", { width: 0.15, height: 0.075, depth: 0.15 }, scene), PALETTE.skin, 0.004);
    palm.position.set(0, 0, 0.05);
    // two snug tape bands round the palm (only a hair bigger than the hand: tape, not blocks)
    for (const [z, h] of [[0.008, 0.03], [0.055, 0.028]] as const) {
      const band = add(MeshBuilder.CreateBox("wrap", { width: 0.166, height: 0.093, depth: h }, scene), WRAP, 0);
      band.renderOutline = false; // (outlines on thin tape read as black stripes)
      band.position.set(0, 0, z);
    }
    // padded knuckles
    const knuckle = add(MeshBuilder.CreateBox("wrapK", { width: 0.164, height: 0.03, depth: 0.052 }, scene), WRAP, 0);
    knuckle.renderOutline = false;
    knuckle.position.set(0, 0.034, 0.1);
    // fingers + thumb (bare)
    for (let i = 0; i < 4; i++) {
      const f = add(MeshBuilder.CreateCapsule("finger", { radius: 0.021, height: 0.09, tessellation: 6 }, scene), PALETTE.skin, 0.005);
      f.rotation.x = Math.PI / 2 + 0.35;
      f.position.set(-0.054 + i * 0.036, -0.012, 0.14);
    }
    const thumb = add(MeshBuilder.CreateCapsule("thumb", { radius: 0.024, height: 0.085, tessellation: 6 }, scene), PALETTE.skin, 0.005);
    thumb.rotation.set(Math.PI / 2, 0, side * -0.9);
    thumb.position.set(side * -0.085, 0.008, 0.07);
    void color;
    return { root, pos: new Vector3(), rot: new Vector3() };
  }

  /** Show an item in the hands (or clear with null). */
  setHeld(type: string | null, size: "small" | "big" | "giant" = "big") {
    if (this.held && this.held.type === type) return;
    if (this.held) { this.held.root.dispose(false, true); this.held = null; }
    if (!type) return;
    const { root, meshes } = buildLootModel(this.scene, type);
    for (const m of meshes) { m.renderingGroupId = 2; if (m.renderOutline) m.outlineWidth = Math.min(m.outlineWidth, 0.012); }
    root.parent = this.holdNode;
    // small things in your fist are shown about fist-sized (5A.1: a big snow globe used to fill the screen)
    root.scaling.setAll(size === "small" ? Math.max(0.3, Math.min(1.1, 0.075 / lootDef(type).radius)) : 0.62);
    this.held = { type, size, root };
  }

  get heldType() { return this.held?.type ?? null; }

  setCharge(c: number) { this.charge = c; }

  /** Throw follow-through animation. */
  throwAnim() { this.throwT = 0.28; this.charge = 0; }

  /** Cartoon jab: alternates hands each punch. */
  punchAnim() { this.punchT = PUNCH_T; this.punchSide = -1; }

  /** Landing / impact dip (bigger impact = deeper dip). */
  /** Hide the hands (upgrades screen looks at your fort from outside). */
  setVisible(on: boolean) { if (this.rootNode.isEnabled() !== on) this.rootNode.setEnabled(on); }

  kick(amount: number) {
    this.dip.kick(-amount);
  }

  update(dt: number, pose: MovePose, speed: number, yaw: number, pitch: number, reducedMotion: boolean, mantleFrac: number) {
    this.t += dt;
    const motion = reducedMotion ? 0.35 : 1;
    const base = POSES[pose];

    // Cycle speed follows actual movement speed
    const cycleRate = pose === "sprint" ? 11 : pose === "walk" ? 8 : pose === "crouchWalk" ? 6 : pose === "stumble" ? 22 : 0;
    this.phase += dt * cycleRate * Math.min(1.3, Math.max(0.5, speed / 5));

    // Global placement: poses are authored relative to this offset (keeps hands clear of the lens)
    const lp = [base.lp[0] * 0.95, base.lp[1] + 0.07, base.lp[2] + 0.1], lr = [...base.lr];
    const rp = [base.rp[0] * 0.95, base.rp[1] + 0.07, base.rp[2] + 0.1], rr = [...base.rr];
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    if (pose === "walk" || pose === "crouchWalk") {
      lp[1] += Math.abs(s) * 0.02 * motion; rp[1] += Math.abs(c) * 0.02 * motion;
      lp[2] += s * 0.02 * motion; rp[2] -= s * 0.02 * motion;
    } else if (pose === "sprint") {
      // pumping arms: alternate forward/back and up/down
      lp[2] += s * 0.09 * motion; rp[2] -= s * 0.09 * motion;
      lp[1] += s * 0.05 * motion; rp[1] -= s * 0.05 * motion;
      lr[0] += s * 0.35 * motion; rr[0] -= s * 0.35 * motion;
    } else if (pose === "idle" || pose === "crouch") {
      const br = Math.sin(this.t * 1.8) * 0.008 * motion; // breathing
      lp[1] += br; rp[1] += br;
    } else if (pose === "stumble") {
      // flail!
      lp[1] += s * 0.08 * motion; rp[1] -= s * 0.08 * motion;
      lr[2] += c * 0.6 * motion; rr[2] -= c * 0.6 * motion;
    } else if (pose === "mantle") {
      // reach up and grab (first half), then push down and haul over (second half)
      const k = mantleFrac < 0.5 ? mantleFrac * 2 : 1 - (mantleFrac - 0.5) * 2;
      lp[1] += (k - 0.5) * 0.2; rp[1] += (k - 0.5) * 0.2;
      lp[2] += (1 - k) * 0.08; rp[2] += (1 - k) * 0.08;
    }
    this.mantleProgress = mantleFrac;

    // Carrying overrides the arm pose (hands go where the item is)
    this.throwT = Math.max(0, this.throwT - dt);
    const bigCarry = this.held && this.held.size !== "small";
    if (bigCarry) {
      const bob = Math.sin(this.phase) * 0.015 * motion;
      lp[0] = -0.27; lp[1] = -0.33 + bob; lp[2] = 0.62; lr[0] = 0.2; lr[1] = 1.0; lr[2] = -0.2;
      rp[0] = 0.27; rp[1] = -0.33 - bob; rp[2] = 0.62; rr[0] = 0.2; rr[1] = -1.0; rr[2] = 0.2;
      this.holdNode.position.set(0, -0.36 + bob, 0.72);
      this.holdNode.rotation.set(0.1, 0, Math.sin(this.phase * 0.5) * 0.03 * motion); // heavy wobble
    } else if (this.held) {
      this.holdNode.position.set(rp[0] - 0.02, rp[1] + 0.07, rp[2] + 0.12);
      this.holdNode.rotation.set(rr[0], rr[1] + Math.PI / 2, 0);
    }
    // Winding up a throw: pull the throwing hand(s) back and up
    const ch = this.charge;
    if (ch > 0) {
      const shake = ch > 0.95 ? Math.sin(this.t * 60) * 0.006 : 0; // full power: straining
      rp[2] -= 0.22 * ch; rp[1] += 0.08 * ch + shake; rr[0] -= 0.7 * ch;
      if (bigCarry) { lp[2] -= 0.22 * ch; lp[1] += 0.08 * ch + shake; lr[0] -= 0.7 * ch; this.holdNode.position.z -= 0.22 * ch; this.holdNode.position.y += 0.1 * ch; }
      else if (this.held) { this.holdNode.position.z -= 0.22 * ch; this.holdNode.position.y += 0.08 * ch; }
    }
    if (this.throwT > 0) {
      const k = this.throwT / 0.28; // 1 -> 0
      rp[2] += 0.2 * k; rp[1] += 0.06 * k; rr[0] += 0.6 * k;
      lp[2] += 0.1 * k;
    }

    this.punchT = Math.max(0, this.punchT - dt);
    if (this.punchT > 0 && !this.held) {
      // fast out (first 35%), slower return
      const u = 1 - this.punchT / PUNCH_T;
      const k = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
      const p = this.punchSide === 1 ? rp : lp, r = this.punchSide === 1 ? rr : lr;
      p[0] -= this.punchSide * 0.2 * k; p[1] += 0.16 * k; p[2] += 0.38 * k;
      r[0] -= 0.25 * k; r[1] += -this.punchSide * 0.2 * k;
      const o = this.punchSide === 1 ? lp : rp; o[2] -= 0.06 * k; // other hand guards
    }

    // Look sway: hands lag slightly behind fast mouse movement
    let dyaw = yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const swayTargetX = Math.max(-0.05, Math.min(0.05, -dyaw * 1.2)) * motion;
    const swayTargetY = Math.max(-0.04, Math.min(0.04, dpitch * 1.0)) * motion;
    const sw = 1 - Math.exp(-dt * 10);
    this.swayX += (swayTargetX - this.swayX) * sw;
    this.swayY += (swayTargetY - this.swayY) * sw;

    const dip = this.dip.update(dt);

    const follow = 1 - Math.exp(-dt * (this.punchT > 0 ? 34 : pose === "dodge" || pose === "mantle" ? 22 : 14));
    const apply = (h: HandRig, p: number[], r: number[]) => {
      h.pos.x += (p[0] + this.swayX - h.pos.x) * follow;
      h.pos.y += (p[1] + this.swayY + dip * motion - h.pos.y) * follow;
      h.pos.z += (p[2] - h.pos.z) * follow;
      h.rot.x += (r[0] - h.rot.x) * follow;
      h.rot.y += (r[1] - h.rot.y) * follow;
      h.rot.z += (r[2] - h.rot.z) * follow;
      h.root.position.copyFrom(h.pos);
      h.root.rotation.copyFrom(h.rot);
    };
    apply(this.left, lp, lr);
    apply(this.right, rp, rr);
  }

  get debugMantle() { return this.mantleProgress; }
}
