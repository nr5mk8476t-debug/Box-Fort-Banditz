// Other players, drawn as PLACEHOLDER chunky capsule bandits with mitten arms and name tags.
// Positions arrive ~20 times a second; we draw them slightly in the past and
// blend between updates ("interpolation") so they move smoothly, not in jumps.
// Poses (crouch, slide, dodge, climb, stumble) use the same ease-toward-target
// animation approach as the first-person hands, so they can't get stuck.
import { Scene, MeshBuilder, TransformNode, Mesh, Vector3, StandardMaterial, Color3 } from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { PLAYER, PLAYER_COLORS, movePose, readMoveState, type MovePose } from "@bfb/shared";

export const INTERP_DELAY_MS = 110;

interface Snap { t: number; x: number; y: number; z: number; yaw: number; pitch: number; }

interface Remote {
  root: TransformNode;
  bodyPivot: TransformNode;
  body: Mesh;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  tag: Mesh;
  snaps: Snap[];
  pose: MovePose;
  connected: boolean;
  phase: number;
  lastPos: Vector3;
  meshes: Mesh[];
  // eased pose values
  crouch: number; lean: number; roll: number; armUp: number; squash: number; armFwd: number; armFwdR: number;
  carry: CarryKind;
  yaw: number;
  punchT: number;
  /** D1: cartwheeling through the air after a car hit; the dizzy stars over a knocked-out head */
  spin?: number; stars?: TransformNode;
}

export type CarryKind = "none" | "small" | "big" | "giant";

/** Everything we read from the synced player state. */
export type RemoteInfo = Record<string, any> & {
  x: number; y: number; z: number; yaw: number; pitch: number;
  name: string; colorIdx: number; connected: boolean;
};

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RemotePlayers {
  private map = new Map<string, Remote>();
  constructor(private scene: Scene) {}

  private build(id: string, info: RemoteInfo): Remote {
    const scene = this.scene;
    const color = PLAYER_COLORS[info.colorIdx % PLAYER_COLORS.length];
    const root = new TransformNode("remote-" + id, scene);
    const meshes: Mesh[] = [];
    const reg = <T extends Mesh>(m: T, outline = 0.03) => { ink(m, outline); meshes.push(m); return m; };

    // bodyPivot sits at the feet so leaning/squashing pivots from the ground
    const bodyPivot = new TransformNode("rbodyPivot", scene);
    bodyPivot.parent = root;
    const body = reg(MeshBuilder.CreateCapsule("rbody", { height: 1.25, radius: PLAYER.radius }, scene));
    body.parent = bodyPivot;
    body.position.y = 0.62;
    body.material = toon(scene, color);
    const patch = reg(MeshBuilder.CreateBox("patch", { width: 0.22, height: 0.22, depth: 0.05 }, scene), 0.015);
    patch.parent = body;
    patch.position.set(0.14, 0.05, 0.36);
    patch.rotation.z = 0.3;
    patch.material = toon(scene, PALETTE.tape);

    const head = new TransformNode("rheadPivot", scene);
    head.parent = bodyPivot;
    head.position.y = 1.38;
    const skull = reg(MeshBuilder.CreateSphere("rhead", { diameter: 0.58, segments: 12 }, scene));
    skull.parent = head;
    skull.material = toon(scene, PALETTE.skin);
    const hat = reg(MeshBuilder.CreateCylinder("rhat", { diameterTop: 0.36, diameterBottom: 0.6, height: 0.26 }, scene));
    hat.parent = head;
    hat.position.y = 0.2;
    hat.material = toon(scene, color);
    for (const ex of [-0.11, 0.11]) {
      const eye = reg(MeshBuilder.CreateSphere("reye", { diameter: 0.12, segments: 6 }, scene), 0.012);
      eye.parent = head;
      eye.position.set(ex, 0.03, 0.25);
      eye.material = toon(scene, "#ffffff");
      const pupil = MeshBuilder.CreateSphere("rpupil", { diameter: 0.055, segments: 6 }, scene);
      pupil.parent = eye;
      pupil.position.z = 0.045;
      pupil.material = toon(scene, "#1b1420");
      meshes.push(pupil);
    }
    const nose = reg(MeshBuilder.CreateSphere("rnose", { diameter: 0.14, segments: 6 }, scene), 0.015);
    nose.parent = head;
    nose.position.set(0, -0.06, 0.29);
    nose.material = toon(scene, "#e0976a");

    // Mitten arms (shoulder pivot -> arm -> glove)
    const makeArm = (side: number) => {
      const shoulder = new TransformNode("rshoulder", scene);
      shoulder.parent = bodyPivot;
      shoulder.position.set(side * (PLAYER.radius + 0.06), 1.0, 0);
      const arm = reg(MeshBuilder.CreateCapsule("rarm", { height: 0.55, radius: 0.08 }, scene), 0.02);
      arm.parent = shoulder;
      arm.position.y = -0.25;
      arm.material = toon(scene, "#5a4d6e");
      const mitt = reg(MeshBuilder.CreateSphere("rmitt", { diameter: 0.2, segments: 8 }, scene), 0.02);
      mitt.parent = shoulder;
      mitt.position.y = -0.52;
      mitt.material = toon(scene, color);
      return shoulder;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    const tag = MeshBuilder.CreatePlane("rtag", { width: 1.6, height: 0.4 }, scene);
    tag.parent = root;
    tag.position.y = 2.1;
    tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
    tag.material = unlitTextured(scene, textTexture(scene, info.name, { w: 512, h: 128, fg: color, stroke: "#1b1420" }), "tagMat");
    tag.renderingGroupId = 1; // draw on top so names stay readable (NOTE: must change before stealth in Phase 4)
    meshes.push(tag);

    return {
      root, bodyPivot, body, head, armL, armR, tag, snaps: [], pose: "idle", connected: true, phase: 0,
      lastPos: new Vector3(info.x, info.y, info.z), meshes,
      crouch: 0, lean: 0, roll: 0, armUp: 0, squash: 0, armFwd: 0, armFwdR: 0, carry: "none", yaw: 0, punchT: 0,
    };
  }

  /** Called whenever the server sends new state. */
  push(id: string, info: RemoteInfo, now: number) {
    let r = this.map.get(id);
    if (!r) {
      r = this.build(id, info);
      this.map.set(id, r);
    }
    r.snaps.push({ t: now, x: info.x, y: info.y, z: info.z, yaw: info.yaw, pitch: info.pitch });
    if (r.snaps.length > 30) r.snaps.splice(0, r.snaps.length - 30);
    r.pose = movePose(readMoveState(info));
    if (r.connected !== info.connected) {
      r.connected = info.connected;
      for (const m of r.meshes) m.visibility = info.connected ? 1 : 0.35;
    }
  }

  /** Remove players no longer in the room. */
  retain(ids: Set<string>) {
    for (const [id, r] of this.map) {
      if (!ids.has(id)) {
        r.root.dispose(false, true);
        this.map.delete(id);
      }
    }
  }

  /** Play a jab on a remote player's avatar. */
  punch(id: string) {
    const r = this.map.get(id);
    if (r) r.punchT = 0.26;
  }

  setCarry(id: string, kind: CarryKind) {
    const r = this.map.get(id);
    if (r) r.carry = kind;
  }

  /** Where we're drawing a player right now (items they carry attach here). */
  anchor(id: string): { x: number; y: number; z: number; yaw: number } | null {
    const r = this.map.get(id);
    if (!r) return null;
    return { x: r.root.position.x, y: r.root.position.y, z: r.root.position.z, yaw: r.yaw };
  }

  /** C3: where every remote player is drawn (the park's pigeons flee from them) */
  forEachPos(cb: (x: number, z: number) => void) { for (const r of this.map.values()) cb(r.root.position.x, r.root.position.z); }

  /** Current pose of a remote player (for tests / debugging). */
  poseOf(id: string): MovePose | null { return this.map.get(id)?.pose ?? null; }

  update(now: number, dt: number) {
    const renderT = now - INTERP_DELAY_MS;
    for (const r of this.map.values()) {
      const s = r.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].t <= renderT) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const z = a.z + (b.z - a.z) * k;
      r.root.position.set(x, y, z);
      const yaw = lerpAngle(a.yaw, b.yaw, k);
      r.root.rotation.y = yaw;
      r.yaw = yaw;
      r.head.rotation.x = lerpAngle(a.pitch, b.pitch, k) * 0.6;

      const speed = dt > 0 ? Math.hypot(x - r.lastPos.x, z - r.lastPos.z) / dt : 0;
      // sideways component of motion (for dodge roll direction)
      const side = dt > 0 ? ((x - r.lastPos.x) * Math.cos(yaw) - (z - r.lastPos.z) * Math.sin(yaw)) / dt : 0;
      r.lastPos.set(x, y, z);

      // ---- pose targets ----
      const p = r.pose;
      let tCrouch = 0, tLean = 0, tRoll = 0, tArmUp = 0, tSquash = 0;
      if (p === "crouch" || p === "crouchWalk") { tCrouch = 1; tLean = 0.25; }
      if (p === "slide") { tCrouch = 1; tLean = -1.0; tArmUp = 0.7; }
      if (p === "dodge") { tRoll = Math.max(-0.6, Math.min(0.6, -side * 0.08)); tSquash = 0.15; tArmUp = 0.4; }
      if (p === "mantle") { tLean = 0.5; tArmUp = 1; }
      if (p === "air") { tArmUp = 0.45; }
      if (p === "stumble") { tLean = 0.35; tArmUp = 0.8; }
      if (p === "sprint") { tLean = 0.28; }
      if (p === "walk") { tLean = 0.1; }
      if (p === "knocked") { tLean = -1.45; tArmUp = 0.9; tCrouch = 0.2; }
      if (p === "tumble") { tArmUp = 1; } // (D1: launched by a car: arms and legs everywhere, spinning)
      r.spin = p === "tumble" ? (r.spin ?? 0) + dt * 13 : 0;
      // D1: dizzy stars circling a flattened bandit's head
      if (p === "knocked" || p === "tumble") {
        if (!r.stars) {
          const st = new TransformNode("dizzy", this.scene); st.parent = r.root;
          for (let i = 0; i < 3; i++) { const s = MeshBuilder.CreateSphere("dizzyStar", { diameter: 0.14, segments: 4 }, this.scene); const m = new StandardMaterial("dizzyStar", this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#ffe14a"); s.material = m; s.parent = st; s.isPickable = false; const a = i / 3 * Math.PI * 2; s.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35); }
          r.stars = st;
        }
        r.stars.setEnabled(true);
        r.stars.position.y = p === "knocked" ? 0.55 : 2.0;
        r.stars.rotation.y += dt * 5;
      } else if (r.stars) r.stars.setEnabled(false);
      if (r.carry === "big" || r.carry === "giant") tLean -= 0.15; // lean back under the weight
      const f = 1 - Math.exp(-dt * 14);
      r.crouch += (tCrouch - r.crouch) * f;
      r.lean += (tLean - r.lean) * f;
      r.roll += (tRoll - r.roll) * f;
      r.armUp += (tArmUp - r.armUp) * f;
      r.squash += (tSquash - r.squash) * f;
      // carrying: both arms out front for big/giant things, one arm for small things
      const tFwd = r.carry === "big" || r.carry === "giant" ? 1 : 0;
      const tFwdR = r.carry === "small" ? 1 : tFwd;
      r.armFwd += (tFwd - r.armFwd) * f;
      r.armFwdR += (tFwdR - r.armFwdR) * f;


      // walk cycle
      const cycle = p === "sprint" ? 13 : p === "walk" ? 9 : p === "crouchWalk" ? 7 : p === "stumble" ? 25 : 0;
      r.phase += dt * cycle;
      const moving = Math.min(1, speed / 5);
      const bob = Math.abs(Math.sin(r.phase)) * 0.08 * moving;

      r.bodyPivot.rotation.set(r.lean + (r.spin ?? 0), 0, r.roll + (r.spin ? Math.sin(r.spin * 0.7) * 0.8 : 0));
      r.bodyPivot.scaling.set(1 + r.squash * 0.5, 1 - r.crouch * 0.32 - r.squash, 1 + r.squash * 0.5);
      r.bodyPivot.position.y = bob;
      // arms: swing when walking, raise for climb/slide/stumble
      const swing = Math.sin(r.phase) * 0.7 * moving * (1 - r.armUp);
      const flail = p === "stumble" ? Math.sin(r.phase * 1.3) * 0.8 : 0;
      const carryL = r.armFwd, carryR = r.armFwdR;
      r.armL.rotation.set((swing - r.armUp * 2.6 + flail) * (1 - carryL) - carryL * 1.35, 0, (-0.15 - r.armUp * 0.3) * (1 - carryL) + carryL * 0.25);
      r.armR.rotation.set((-swing - r.armUp * 2.6 - flail) * (1 - carryR) - carryR * 1.35, 0, (0.15 + r.armUp * 0.3) * (1 - carryR) - carryR * 0.25);
      if (r.punchT > 0) {
        r.punchT = Math.max(0, r.punchT - dt);
        const u = 1 - r.punchT / 0.26, k = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
        r.armR.rotation.x = r.armR.rotation.x * (1 - k) - 1.55 * k;
        r.armR.rotation.z *= 1 - k;
      }
      r.tag.position.y = 2.1 - r.crouch * 0.5;
    }
  }

  count() { return this.map.size; }

  dispose() {
    for (const r of this.map.values()) r.root.dispose(false, true);
    this.map.clear();
  }
}
