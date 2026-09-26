// Phase 3 city events, drawn: the garbage truck, the happy-hour zone ring and the airdrop
// landing marker. PLACEHOLDER-QUALITY shapes in the house style (toon + ink).
import { Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured } from "./look.ts";

export interface EventState {
  evKind: string; evStage: string; evX: number; evZ: number; evR: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}

export class EventRenderer {
  private truck: TransformNode;
  private wheels: Mesh[] = [];
  private beacon: Mesh;
  private beaconMat: StandardMaterial;
  private truckOn = false;
  private zone: Mesh;
  private zoneFill: Mesh;
  private zoneMat: StandardMaterial;
  private drop: TransformNode;
  private t = 0;
  /** where the truck is drawn (for engine sound distance) */
  truckPos: { x: number; z: number } | null = null;

  constructor(scene: Scene) {
    // ---- garbage truck (about 5.5 x 2.6 m, same footprint as the rules use) ----
    const T = (this.truck = new TransformNode("truck", scene));
    const part = (m: Mesh, c: string, o = 0.04) => { m.parent = T; m.material = toon(scene, c); if (o) ink(m, o); m.isPickable = false; return m; };
    const body = part(MeshBuilder.CreateBox("tbody", { width: 2.5, height: 2.2, depth: 3.6 }, scene), "#3f8f4a");
    body.position.set(0, 1.55, -0.8);
    const stripe = part(MeshBuilder.CreateBox("tstripe", { width: 2.55, height: 0.3, depth: 3.62 }, scene), "#ffe14a", 0);
    stripe.position.set(0, 1.2, -0.8);
    const cab = part(MeshBuilder.CreateBox("tcab", { width: 2.4, height: 1.7, depth: 1.6 }, scene), "#e8e2d4");
    cab.position.set(0, 1.3, 1.9);
    const glass = part(MeshBuilder.CreateBox("tglass", { width: 2.2, height: 0.6, depth: 0.05 }, scene), "#2e4a5a", 0);
    glass.position.set(0, 1.75, 2.71);
    const bumper = part(MeshBuilder.CreateBox("tbump", { width: 2.6, height: 0.3, depth: 0.3 }, scene), "#2b2433", 0.02);
    bumper.position.set(0, 0.45, 2.75);
    const scoop = part(MeshBuilder.CreateBox("tscoop", { width: 2.6, height: 0.5, depth: 0.5 }, scene), "#2b2433", 0.02);
    scoop.position.set(0, 0.35, -2.7);
    for (const [x, z] of [[-1.15, 1.9], [1.15, 1.9], [-1.15, -1.8], [1.15, -1.8]]) {
      const w = part(MeshBuilder.CreateCylinder("twheel", { diameter: 0.9, height: 0.35, tessellation: 12 }, scene), "#1b1420", 0.02);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      this.wheels.push(w);
    }
    this.beacon = MeshBuilder.CreateSphere("tbeacon", { diameter: 0.35, segments: 8 }, scene);
    this.beacon.parent = T;
    this.beacon.position.set(0, 2.35, 1.9);
    this.beaconMat = new StandardMaterial("beaconMat", scene);
    this.beaconMat.disableLighting = true;
    this.beaconMat.emissiveColor = Color3.FromHexString("#ff9a1f");
    this.beacon.material = this.beaconMat;
    const sign = MeshBuilder.CreatePlane("tsign", { width: 2.2, height: 0.55 }, scene);
    sign.parent = T;
    sign.position.set(1.27, 1.9, -0.8);
    sign.rotation.y = -Math.PI / 2;
    sign.material = unlitTextured(scene, textTexture(scene, "TRASHINGTON SANITATION", { w: 1024, h: 200, fg: "#ffe14a", stroke: "#1b1420" }), "tsignMat");
    const sign2 = sign.clone("tsign2");
    sign2.parent = T;
    sign2.position.x = -1.27;
    sign2.rotation.y = Math.PI / 2;
    T.setEnabled(false);

    // ---- happy-hour zone: gold ring + faint fill on the ground ----
    this.zoneMat = new StandardMaterial("zoneMat", scene);
    this.zoneMat.disableLighting = true;
    this.zoneMat.emissiveColor = Color3.FromHexString("#ffcf3a");
    this.zoneMat.alpha = 0.85;
    this.zone = MeshBuilder.CreateTorus("hhRing", { diameter: 2, thickness: 0.025, tessellation: 64 }, scene);
    this.zone.material = this.zoneMat;
    this.zone.isPickable = false;
    this.zoneFill = MeshBuilder.CreateDisc("hhFill", { radius: 1, tessellation: 48 }, scene);
    this.zoneFill.rotation.x = Math.PI / 2;
    const fillMat = new StandardMaterial("zoneFillMat", scene);
    fillMat.disableLighting = true;
    fillMat.emissiveColor = Color3.FromHexString("#ffcf3a");
    fillMat.alpha = 0.2;
    this.zoneFill.material = fillMat;
    this.zoneFill.isPickable = false;
    this.zone.setEnabled(false);
    this.zoneFill.setEnabled(false);

    // ---- airdrop landing marker: red target on the ground ----
    this.drop = new TransformNode("dropMark", scene);
    const redMat = new StandardMaterial("dropMat", scene);
    redMat.disableLighting = true;
    redMat.emissiveColor = Color3.FromHexString("#ff3b30");
    for (const r of [2.5, 1.4]) {
      const ring = MeshBuilder.CreateTorus("dropRing", { diameter: r * 2, thickness: 0.12, tessellation: 40 }, scene);
      ring.material = redMat; ring.parent = this.drop; ring.position.y = 0.2; ring.isPickable = false;
    }
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = MeshBuilder.CreateBox("dropX", { width: 2.6, height: 0.04, depth: 0.25 }, scene);
      bar.material = redMat; bar.parent = this.drop; bar.rotation.y = a; bar.position.y = 0.2; bar.isPickable = false;
    }
    this.drop.setEnabled(false);
  }

  update(s: EventState, dt: number) {
    this.t += dt;
    // truck: glide toward the server position (it moves in a straight line at a steady speed)
    if (s.truckOn) {
      const T = this.truck;
      if (!this.truckOn || Math.hypot(T.position.x - s.truckX, T.position.z - s.truckZ) > 6) T.position.set(s.truckX, 0, s.truckZ);
      else {
        const k = 1 - Math.exp(-dt * 10);
        T.position.x += (s.truckX - T.position.x) * k;
        T.position.z += (s.truckZ - T.position.z) * k;
      }
      T.rotation.y = s.truckYaw;
      for (const w of this.wheels) w.rotation.x += dt * 16;
      T.position.y = Math.abs(Math.sin(this.t * 9)) * 0.03; // rumble
      this.beaconMat.emissiveColor = Math.sin(this.t * 12) > 0 ? Color3.FromHexString("#ff9a1f") : Color3.FromHexString("#5a2a00");
      this.truckPos = { x: T.position.x, z: T.position.z };
    } else this.truckPos = null;
    if (s.truckOn !== this.truckOn) { this.truckOn = s.truckOn; this.truck.setEnabled(s.truckOn); }

    const hh = s.evKind === "happyhour" && s.evStage !== "";
    this.zone.setEnabled(hh);
    this.zoneFill.setEnabled(hh);
    if (hh) {
      const pulse = 1 + Math.sin(this.t * 4) * 0.015;
      this.zone.position.set(s.evX, 0.22, s.evZ);
      this.zone.scaling.set(s.evR * pulse, 1, s.evR * pulse);
      this.zoneFill.position.set(s.evX, 0.19, s.evZ);
      this.zoneFill.scaling.set(s.evR, s.evR, 1);
      this.zoneMat.alpha = s.evStage === "warn" ? 0.4 + Math.sin(this.t * 10) * 0.3 : 0.85;
    }
    const drop = s.evKind === "airdrop" && s.evStage !== "";
    this.drop.setEnabled(drop);
    if (drop) { this.drop.position.set(s.evX, 0, s.evZ); this.drop.rotation.y = this.t * 0.8; }
  }

  dispose() { this.truck.dispose(false, true); this.zone.dispose(); this.zoneFill.dispose(); this.drop.dispose(false, true); }
}
