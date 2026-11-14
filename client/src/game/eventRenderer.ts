// Phase 3 city events, drawn: the garbage truck, the happy-hour zone ring and the airdrop
// landing marker. PLACEHOLDER-QUALITY shapes in the house style (toon + ink).
import { Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured, disposeOwned } from "./look.ts";

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

  dispose() { disposeOwned(this.truck); this.zone.dispose(); this.zoneFill.dispose(); disposeOwned(this.drop); }
}

/**
 * C5b: the dragon dance: a long red-and-gold dragon carried on poles by a troupe of dancers, snaking up
 * Chinatown behind a drummer, with firecrackers popping. Drawn from the match's parade progress (the
 * same route and spacing the rules use), so every screen shows it in the same place.
 */
export class DragonRenderer {
  private root: TransformNode;
  private head: TransformNode;
  private segs: TransformNode[] = [];
  private dancers: TransformNode[] = [];
  private jaw: Mesh;
  private sparks: { m: Mesh; t: number; vx: number; vy: number; vz: number }[] = [];
  private sparkMat: StandardMaterial;
  private on = false;
  private t = 0;
  constructor(private scene: Scene, private route: { x: number; z: number }[], private seg: { n: number; gap: number }) {
    const sc = scene;
    this.root = new TransformNode("dragon", sc);
    const part = (m: Mesh, c: string, parent: TransformNode, o = 0.03) => { m.parent = parent; m.material = toon(sc, c); if (o) ink(m, o); m.isPickable = false; return m; };
    // the head: a big boxy snout, googly eyes, horns, a beard and whiskers, a flapping jaw
    const H = (this.head = new TransformNode("dragonHead", sc)); H.parent = this.root;
    part(MeshBuilder.CreateBox("dhSkull", { width: 1.2, height: 0.9, depth: 1.3 }, sc), "#d8261e", H).position.set(0, 0, 0);
    part(MeshBuilder.CreateBox("dhSnout", { width: 1.0, height: 0.45, depth: 0.8 }, sc), "#e8b422", H).position.set(0, -0.05, 0.9);
    this.jaw = part(MeshBuilder.CreateBox("dhJaw", { width: 0.95, height: 0.2, depth: 0.9 }, sc), "#d8261e", H);
    this.jaw.position.set(0, -0.4, 0.75);
    for (const sx of [-1, 1]) {
      const eye = part(MeshBuilder.CreateSphere("dhEye", { diameter: 0.36, segments: 8 }, sc), "#f4f1ea", H, 0.02); eye.position.set(sx * 0.38, 0.4, 0.45);
      const pup = part(MeshBuilder.CreateSphere("dhPupil", { diameter: 0.16, segments: 6 }, sc), "#1b1420", H, 0); pup.position.set(sx * 0.38, 0.42, 0.62);
      const horn = part(MeshBuilder.CreateCylinder("dhHorn", { diameterTop: 0.02, diameterBottom: 0.16, height: 0.8, tessellation: 6 }, sc), "#e8b422", H, 0.015); horn.position.set(sx * 0.35, 0.8, -0.3); horn.rotation.x = -0.6;
      const wh = part(MeshBuilder.CreateCylinder("dhWhisker", { diameter: 0.04, height: 1.2, tessellation: 4 }, sc), "#e8b422", H, 0); wh.position.set(sx * 0.75, -0.05, 1.1); wh.rotation.set(0.3, 0, sx * 1.1);
    }
    const beard = part(MeshBuilder.CreateCylinder("dhBeard", { diameterTop: 0.5, diameterBottom: 0.05, height: 0.6, tessellation: 8 }, sc), "#f4f1ea", H, 0.015); beard.position.set(0, -0.7, 0.7);
    const mane = part(MeshBuilder.CreateSphere("dhMane", { diameter: 1.3, segments: 8, slice: 0.5 }, sc), "#ffb000", H, 0.02); mane.position.set(0, 0.2, -0.5); mane.rotation.x = -Math.PI / 2;
    // body segments: striped hoops with a fringe, plus the tail tuft on the last one
    for (let i = 0; i < seg.n; i++) {
      const S = new TransformNode("dragonSeg", sc); S.parent = this.root;
      part(MeshBuilder.CreateCylinder("dsBody", { diameter: 0.95, height: seg.gap + 0.15, tessellation: 10 }, sc), i % 2 ? "#e8b422" : "#d8261e", S).rotation.x = Math.PI / 2;
      part(MeshBuilder.CreateTorus("dsHoop", { diameter: 0.98, thickness: 0.08, tessellation: 12 }, sc), "#3f7f4f", S, 0).rotation.x = Math.PI / 2;
      const fin = part(MeshBuilder.CreateCylinder("dsFin", { diameterTop: 0.02, diameterBottom: 0.35, height: 0.45, tessellation: 4 }, sc), "#ffb000", S, 0.01); fin.position.y = 0.6;
      if (i === seg.n - 1) { const tuft = part(MeshBuilder.CreateSphere("dsTail", { diameter: 0.8, segments: 6 }, sc), "#ffb000", S, 0.02); tuft.position.z = -0.8; tuft.scaling.set(1, 0.6, 1.4); }
      this.segs.push(S);
    }
    // the dancers under each piece, holding it up on a pole (black trousers, red tops, gold sashes)
    for (let i = 0; i <= seg.n; i++) {
      const D = new TransformNode("dancer", sc); D.parent = this.root;
      for (const sx of [-0.12, 0.12]) { const leg = part(MeshBuilder.CreateCapsule("dLeg", { height: 0.8, radius: 0.08, tessellation: 6 }, sc), "#1b1420", D, 0.012); leg.position.set(sx, 0.4, 0); }
      part(MeshBuilder.CreateCapsule("dBody", { height: 0.7, radius: 0.22, tessellation: 8 }, sc), i === 0 ? "#e8b422" : "#c0282a", D, 0.02).position.y = 1.1;
      part(MeshBuilder.CreateSphere("dHead", { diameter: 0.34, segments: 8 }, sc), "#e0a878", D, 0.015).position.y = 1.6;
      const band = part(MeshBuilder.CreateTorus("dBand", { diameter: 0.36, thickness: 0.05, tessellation: 10 }, sc), "#ffd54a", D, 0); band.position.y = 1.68;
      const pole = part(MeshBuilder.CreateCylinder("dPole", { diameter: 0.06, height: 1.3, tessellation: 5 }, sc), "#8a5a3a", D, 0); pole.position.y = 1.9;
      this.dancers.push(D);
    }
    this.sparkMat = new StandardMaterial("spark", sc); this.sparkMat.disableLighting = true; this.sparkMat.emissiveColor = Color3.FromHexString("#ffd54a");
    this.root.setEnabled(false);
  }
  /** where a point d metres along the route is */
  private at(d: number) {
    const rt = this.route;
    let left = Math.max(0, d);
    for (let i = 0; i < rt.length - 1; i++) {
      const a = rt[i], b = rt[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= len || i === rt.length - 2) { const k = Math.min(1, left / len); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
      left -= len;
    }
    return { x: rt[0].x, z: rt[0].z, yaw: 0 };
  }
  /** where the head is drawn (for the drum sound) */
  headPos: { x: number; z: number } | null = null;
  private shown = -1;
  update(paradeD: number, dt: number) {
    this.t += dt;
    const on = paradeD >= 0;
    if (on !== this.on) { this.on = on; this.root.setEnabled(on); if (on) this.shown = paradeD; }
    this.updateSparks(dt);
    if (!on) { this.headPos = null; return; }
    // glide toward the host's progress (it moves at a steady walk)
    this.shown = Math.abs(paradeD - this.shown) > 3 ? paradeD : this.shown + (paradeD - this.shown) * (1 - Math.exp(-dt * 8));
    const d = this.shown, t = this.t;
    const place = (n: TransformNode, dd: number, y: number, phase: number) => {
      const p = this.at(dd), sway = Math.sin(t * 2.4 + phase) * 0.9;
      n.position.set(p.x + Math.cos(p.yaw) * sway, y + Math.sin(t * 3.1 + phase) * 0.45, p.z - Math.sin(p.yaw) * sway);
      n.rotation.y = p.yaw + Math.cos(t * 2.4 + phase) * 0.35;
    };
    place(this.head, d, 2.6, 0);
    this.jaw.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.4;
    this.segs.forEach((s, i) => place(s, d - (i + 1) * this.seg.gap, 2.4, -(i + 1) * 0.7));
    this.dancers.forEach((dn, i) => {
      const p = this.at(d - i * this.seg.gap), sway = Math.sin(t * 2.4 - i * 0.7) * 0.9;
      dn.position.set(p.x + Math.cos(p.yaw) * sway, Math.abs(Math.sin(t * 6 + i)) * 0.18, p.z - Math.sin(p.yaw) * sway);
      dn.rotation.y = p.yaw;
    });
    this.headPos = { x: this.head.position.x, z: this.head.position.z };
  }
  /** a string of firecrackers going off */
  firecracker(x: number, z: number) {
    for (let i = 0; i < 14; i++) {
      const m = MeshBuilder.CreateBox("spark", { size: 0.07 }, this.scene); m.material = this.sparkMat; m.isPickable = false;
      m.position.set(x + (Math.random() - 0.5) * 1.5, 0.3, z + (Math.random() - 0.5) * 1.5);
      this.sparks.push({ m, t: 0.6 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 4 });
    }
  }
  private updateSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t -= dt; s.vy -= 12 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y = Math.max(0.05, s.m.position.y + s.vy * dt); s.m.position.z += s.vz * dt;
      if (s.t <= 0) { s.m.dispose(); this.sparks.splice(i, 1); }
    }
  }
}

/**
 * R4: Little Italy's festa, drawn from the match's progress along Leftovers Avenue (the same route, speeds and
 * spacing the rules use). Three looks, one at a time:
 *  0 a giant rolling meatball (with a sprig of basil) chased by chefs waving ladles,
 *  1 a marching band: a bandleader with a tip hat, accordion players squeezing, a tuba bringing up the rear,
 *  2 a gondola on a little trailer, a striped gondolier singing at the oar, rose petals in the air.
 */
export class FestaRenderer {
  private roots: TransformNode[] = [];
  private parts: TransformNode[][] = [[], [], []];
  private ball!: TransformNode;
  private bellows: Mesh[] = [];
  private oar!: Mesh;
  private petals: { m: Mesh; t: number; vx: number; vy: number; vz: number }[] = [];
  private petalMat: StandardMaterial;
  private on = -1;
  private t = 0;
  private shown = -1;
  headPos: { x: number; z: number } | null = null;
  constructor(private scene: Scene, private route: { x: number; z: number }[], private spec: { gap: number[]; segments: number[] }) {
    const sc = scene;
    const part = (m: Mesh, c: string, parent: TransformNode, o = 0.03) => { m.parent = parent; m.material = toon(sc, c); if (o) ink(m, o); m.isPickable = false; return m; };
    const person = (parent: TransformNode, shirt: string, trousers: string, hat?: "chef" | "cap" | "straw") => {
      for (const sx of [-0.12, 0.12]) part(MeshBuilder.CreateCapsule("fLeg", { height: 0.8, radius: 0.08, tessellation: 6 }, sc), trousers, parent, 0.012).position.set(sx, 0.4, 0);
      part(MeshBuilder.CreateCapsule("fBody", { height: 0.75, radius: 0.24, tessellation: 8 }, sc), shirt, parent, 0.02).position.y = 1.1;
      part(MeshBuilder.CreateSphere("fHead", { diameter: 0.36, segments: 8 }, sc), "#e8b08a", parent, 0.015).position.y = 1.62;
      const mo = part(MeshBuilder.CreateBox("fMoustache", { width: 0.2, height: 0.05, depth: 0.04 }, sc), "#3a2a1e", parent, 0); mo.position.set(0, 1.56, 0.17);
      if (hat === "chef") { part(MeshBuilder.CreateCylinder("chefHat", { diameter: 0.34, height: 0.36, tessellation: 10 }, sc), "#f4f1ea", parent, 0.015).position.y = 1.95; part(MeshBuilder.CreateSphere("chefPuff", { diameter: 0.46, segments: 8 }, sc), "#f4f1ea", parent, 0.015).position.y = 2.15; }
      if (hat === "cap") part(MeshBuilder.CreateCylinder("bandCap", { diameter: 0.38, height: 0.18, tessellation: 10 }, sc), "#c8322c", parent, 0.012).position.y = 1.86;
      if (hat === "straw") { part(MeshBuilder.CreateCylinder("brim", { diameter: 0.7, height: 0.03, tessellation: 14 }, sc), "#e8c870", parent, 0.01).position.y = 1.8; part(MeshBuilder.CreateCylinder("crown", { diameter: 0.36, height: 0.16, tessellation: 12 }, sc), "#e8c870", parent, 0.01).position.y = 1.88; part(MeshBuilder.CreateTorus("ribbon", { diameter: 0.37, thickness: 0.04, tessellation: 12 }, sc), "#c8322c", parent, 0).position.y = 1.84; }
    };
    // 0: the meatball and its chefs
    {
      const R = new TransformNode("festaMeatball", sc); this.roots.push(R);
      const B = (this.ball = new TransformNode("ball", sc)); B.parent = R;
      part(MeshBuilder.CreateSphere("meatball", { diameter: 2.8, segments: 10 }, sc), "#7a3e22", B, 0.05);
      for (let i = 0; i < 14; i++) { const a = i * 2.4, b = i * 1.3; part(MeshBuilder.CreateSphere("lump", { diameter: 0.7, segments: 5 }, sc), i % 3 ? "#6b3420" : "#8e4a2a", B, 0).position.set(Math.cos(a) * Math.cos(b) * 1.25, Math.sin(b) * 1.25, Math.sin(a) * Math.cos(b) * 1.25); }
      for (let i = 0; i < 4; i++) { const sauce = part(MeshBuilder.CreateSphere("sauce", { diameter: 0.9, segments: 6 }, sc), "#c8322c", B, 0); sauce.scaling.y = 0.3; sauce.position.set(Math.cos(i * 1.6) * 0.9, 1.05, Math.sin(i * 1.6) * 0.9); }
      const basil = new TransformNode("basil", sc); basil.parent = R; basil.position.y = 3.0; this.parts[0].push(basil);
      for (const sx of [-0.2, 0.2]) { const leaf = part(MeshBuilder.CreateSphere("leaf", { diameter: 0.5, segments: 5 }, sc), "#3f8f4a", basil, 0.01); leaf.scaling.set(0.5, 0.15, 1); leaf.position.x = sx; leaf.rotation.y = sx * 2; }
      for (let i = 0; i < this.spec.segments[0]; i++) {
        const C = new TransformNode("chef", sc); C.parent = R; person(C, "#f4f1ea", "#3a3444", "chef");
        const ladle = part(MeshBuilder.CreateCylinder("ladle", { diameter: 0.05, height: 0.9, tessellation: 5 }, sc), "#c9ccd4", C, 0); ladle.position.set(0.35, 1.7, 0.1); ladle.rotation.z = -0.5;
        part(MeshBuilder.CreateSphere("ladleCup", { diameter: 0.18, segments: 6, slice: 0.5 }, sc), "#c9ccd4", C, 0.01).position.set(0.58, 2.1, 0.1);
        this.parts[0].push(C);
      }
    }
    // 1: the band
    {
      const R = new TransformNode("festaBand", sc); this.roots.push(R);
      for (let i = 0; i <= this.spec.segments[1]; i++) {
        const M = new TransformNode("bandsman", sc); M.parent = R;
        person(M, i === 0 ? "#2f8f4e" : i % 2 ? "#c8322c" : "#f4f1ea", "#1b1420", "cap");
        if (i === 0) { // the bandleader: a baton and the tip hat held out
          const baton = part(MeshBuilder.CreateCylinder("baton", { diameter: 0.04, height: 0.7, tessellation: 5 }, sc), "#f4f1ea", M, 0); baton.position.set(0.3, 1.7, 0.2); baton.rotation.x = 0.8;
          const tip = part(MeshBuilder.CreateCylinder("tiphat", { diameterTop: 0.3, diameterBottom: 0.36, height: 0.22, tessellation: 12 }, sc), "#1b1420", M, 0.012); tip.position.set(-0.4, 1.15, 0.25);
          part(MeshBuilder.CreateCylinder("coinsInHat", { diameter: 0.28, height: 0.04, tessellation: 12 }, sc), "#ffd54a", M, 0).position.set(-0.4, 1.27, 0.25);
        } else if (i === this.spec.segments[1]) { // the tuba
          const tuba = part(MeshBuilder.CreateTorus("tuba", { diameter: 0.7, thickness: 0.14, tessellation: 14 }, sc), "#e8b422", M, 0.015); tuba.position.set(0, 1.25, 0.2); tuba.rotation.y = Math.PI / 2;
          const bell = part(MeshBuilder.CreateCylinder("tubaBell", { diameterTop: 0.6, diameterBottom: 0.12, height: 0.5, tessellation: 12 }, sc), "#e8b422", M, 0.015); bell.position.set(0, 1.85, 0.05);
        } else { // an accordion: two red ends and gold bellows that squeeze
          for (const sx of [-0.32, 0.32]) part(MeshBuilder.CreateBox("accEnd", { width: 0.1, height: 0.4, depth: 0.28 }, sc), "#c8322c", M, 0.01).position.set(sx, 1.15, 0.3);
          const bel = part(MeshBuilder.CreateBox("bellows", { width: 0.5, height: 0.36, depth: 0.26 }, sc), "#ffd54a", M, 0.01); bel.position.set(0, 1.15, 0.3);
          this.bellows.push(bel);
        }
        this.parts[1].push(M);
      }
    }
    // 2: the gondola on its trailer
    {
      const R = new TransformNode("festaGondola", sc); this.roots.push(R);
      const G = new TransformNode("gondola", sc); G.parent = R; this.parts[2].push(G);
      part(MeshBuilder.CreateBox("trailer", { width: 1.6, height: 0.25, depth: 5.2 }, sc), "#5a4636", G, 0.03).position.y = 0.55;
      for (const [x, z] of [[-0.8, 1.6], [0.8, 1.6], [-0.8, -1.6], [0.8, -1.6]]) { const w = part(MeshBuilder.CreateCylinder("tw", { diameter: 0.6, height: 0.18, tessellation: 12 }, sc), "#1b1420", G, 0.02); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); }
      const hull = part(MeshBuilder.CreateBox("hull", { width: 1.1, height: 0.55, depth: 4.4 }, sc), "#1b1420", G, 0.04); hull.position.y = 1.0;
      for (const sz of [-1, 1]) { const prow = part(MeshBuilder.CreateCylinder("prow", { diameterTop: 0.05, diameterBottom: 0.5, height: 1.4, tessellation: 6 }, sc), "#1b1420", G, 0.03); prow.position.set(0, 1.5, sz * 2.3); prow.rotation.x = -sz * 0.7; }
      const ferro = part(MeshBuilder.CreateBox("ferro", { width: 0.05, height: 0.5, depth: 0.3 }, sc), "#e8e2d4", G, 0.01); ferro.position.set(0, 2.05, 2.7);
      part(MeshBuilder.CreateBox("seat", { width: 0.9, height: 0.2, depth: 0.9 }, sc), "#c8322c", G, 0.015).position.set(0, 1.35, 0.6);
      for (let i = 0; i < 5; i++) part(MeshBuilder.CreateSphere("rose", { diameter: 0.16, segments: 5 }, sc), "#e0283c", G, 0).position.set(-0.4 + i * 0.2, 1.32, 1.4);
      const P = new TransformNode("gondolier", sc); P.parent = G; P.position.set(0, 1.2, -1.5);
      person(P, "#f4f1ea", "#1b1420", "straw");
      for (let k = 0; k < 3; k++) part(MeshBuilder.CreateTorus("stripe", { diameter: 0.49, thickness: 0.06, tessellation: 12 }, sc), "#1b2a6b", P, 0).position.y = 0.92 + k * 0.18;
      this.oar = part(MeshBuilder.CreateCylinder("oar", { diameter: 0.07, height: 3.2, tessellation: 5 }, sc), "#8a5a3a", P, 0.01);
      this.oar.position.set(0.45, 1.0, -0.2); this.oar.rotation.x = 0.5;
    }
    this.petalMat = new StandardMaterial("petal", sc); this.petalMat.disableLighting = true; this.petalMat.emissiveColor = Color3.FromHexString("#ff4a6e");
    for (const r of this.roots) r.setEnabled(false);
  }
  private at(d: number) {
    const rt = this.route;
    let left = Math.max(0, d);
    for (let i = 0; i < rt.length - 1; i++) {
      const a = rt[i], b = rt[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (left <= len || i === rt.length - 2) { const k = Math.min(1, left / len); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
      left -= len;
    }
    return { x: rt[0].x, z: rt[0].z, yaw: 0 };
  }
  update(festaD: number, variant: number, dt: number) {
    this.t += dt;
    const v = festaD >= 0 ? variant : -1;
    if (v !== this.on) { this.roots.forEach((r, i) => r.setEnabled(i === v)); this.on = v; if (v >= 0) this.shown = festaD; }
    this.updatePetals(dt);
    if (v < 0) { this.headPos = null; return; }
    this.shown = Math.abs(festaD - this.shown) > 3 ? festaD : this.shown + (festaD - this.shown) * (1 - Math.exp(-dt * 8));
    const d = this.shown, t = this.t, gap = this.spec.gap[v];
    const put = (n: TransformNode, dd: number, y: number, bob = 0) => { const p = this.at(dd); n.position.set(p.x, y + bob, p.z); n.rotation.y = p.yaw; return p; };
    if (v === 0) {
      const p = put(this.ball, d, 1.4);
      this.ball.rotation.set(d / 1.4, p.yaw, 0); // (rolling: one turn per 2 pi r of road)
      put(this.parts[0][0], d, 3.0, Math.sin(t * 6) * 0.1);
      this.parts[0].slice(1).forEach((c, i) => put(c, d - (i + 1) * gap - 0.6, 0, Math.abs(Math.sin(t * 9 + i)) * 0.25));
    } else if (v === 1) {
      this.parts[1].forEach((m, i) => put(m, d - i * gap, 0, Math.abs(Math.sin(t * 5 + i * 0.8)) * 0.12));
      this.bellows.forEach((b, i) => { b.scaling.x = 0.7 + Math.abs(Math.sin(t * 4 + i)) * 0.6; });
    } else {
      put(this.parts[2][0], d - gap, 0, Math.sin(t * 1.5) * 0.05);
      this.oar.rotation.x = 0.5 + Math.sin(t * 1.8) * 0.4;
      if (Math.random() < dt * 6) this.petal(this.parts[2][0].position.x, this.parts[2][0].position.z);
    }
    this.headPos = { x: this.at(d).x, z: this.at(d).z };
  }
  /** rose petals (and the splash of canal water, in blue) */
  petal(x: number, z: number, n = 2, color?: string) {
    const mat = color ? (() => { const m = new StandardMaterial("splash", this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(color); m.alpha = 0.7; return m; })() : this.petalMat;
    for (let i = 0; i < n; i++) {
      const m = MeshBuilder.CreateBox("petal", { width: 0.12, height: 0.02, depth: 0.09 }, this.scene); m.material = mat; m.isPickable = false;
      m.position.set(x + (Math.random() - 0.5) * 1.2, 2.6, z + (Math.random() - 0.5) * 1.2);
      this.petals.push({ m, t: 1.2 + Math.random(), vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2 });
    }
  }
  private updatePetals(dt: number) {
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const s = this.petals[i];
      s.t -= dt; s.vy -= 4 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y = Math.max(0.05, s.m.position.y + s.vy * dt); s.m.position.z += s.vz * dt; s.m.rotation.y += dt * 4;
      if (s.t <= 0) { s.m.dispose(); this.petals.splice(i, 1); }
    }
  }
}
