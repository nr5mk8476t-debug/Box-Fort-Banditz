// The parts of props that change: dumpster lids (open once searched), phone-booth handsets
// (gone when smashed), vending machine glass (cracked), parked car windows (smashed) and
// flashing alarm lights on cars and shop tills. Static bodies are merged into the city.
import { Scene, MeshBuilder, Mesh, StandardMaterial, Color3, TransformNode, Vector3 } from "./babylon.ts";
import { toon, ink } from "./look.ts";
import { buildCarGlass } from "./carModel.ts";
import type { PropDef, PropView } from "@bfb/shared";

interface Vis { def: PropDef; node: TransformNode; ready: boolean; alarm: boolean; lid?: Mesh; handset?: Mesh; glass?: Mesh; lights?: Mesh[]; }

export class PropRenderer {
  private map = new Map<string, Vis>();
  private t = 0;
  private alarmMat: StandardMaterial;
  private alarmOff: StandardMaterial;
  private crackedMat: ReturnType<typeof toon>;
  private vendGlass: ReturnType<typeof toon>;

  /** C4a: flying pieces of smashed things (vanish after ~10 s) and burst hydrants' jets */
  private debris: { m: Mesh; vx: number; vy: number; vz: number; t: number; spin: number }[] = [];
  private sprays: { node: TransformNode; t: number; drops: Mesh[] }[] = [];
  private brkDefs = new Map<string, PropDef>();
  private brkReady = new Map<string, boolean>();

  constructor(private scene: Scene, props: PropDef[]) {
    this.alarmMat = new StandardMaterial("alarmOn", scene);
    this.alarmMat.disableLighting = true;
    this.alarmMat.emissiveColor = Color3.FromHexString("#ff3b30");
    this.alarmOff = new StandardMaterial("alarmOff", scene);
    this.alarmOff.disableLighting = true;
    this.alarmOff.emissiveColor = Color3.FromHexString("#ffb000");
    this.crackedMat = toon(scene, "#46505a");
    this.vendGlass = toon(scene, "#9fe3ff");
    for (const d of props) {
      if (d.box !== undefined) { this.brkDefs.set(d.id, d); this.brkReady.set(d.id, true); continue; } // (C4a: drawn in the city, hidden when smashed)
      const node = new TransformNode("prop-" + d.id, scene);
      node.position.set(d.x, d.y, d.z);
      node.rotation.y = d.yaw;
      const v: Vis = { def: d, node, ready: true, alarm: false };
      const part = (m: Mesh, color: string | ReturnType<typeof toon>, outline = 0.02) => {
        m.parent = node; m.material = typeof color === "string" ? toon(scene, color) : color; if (outline) ink(m, outline); m.isPickable = false; return m;
      };
      if (d.kind === "dumpster") {
        v.lid = part(MeshBuilder.CreateBox("lid", { width: 2.3, height: 0.1, depth: 1.3 }, scene), "#2f5c3b", 0.03);
        v.lid.setPivotPoint(new Vector3(0, 0, -0.65)); // hinge at the back
        v.lid.position.set(0, 1.35, 0);
      } else if (d.kind === "phone") {
        v.handset = part(MeshBuilder.CreateBox("handset", { width: 0.1, height: 0.35, depth: 0.1 }, scene), "#1b1420", 0.01);
        v.handset.position.set(0.28, 1.45, -0.3);
      } else if (d.kind === "vending") {
        v.glass = part(MeshBuilder.CreateBox("vendglass", { width: 0.75, height: 1.2, depth: 0.04 }, scene), this.vendGlass, 0.01);
        v.glass.position.set(0.12, 1.05, 0.46);
      } else if (d.kind === "car") {
        v.glass = part(buildCarGlass(scene)[0], "#6fb6d9", 0.01);
        v.lights = [];
        for (const sx of [-0.62, 0.62]) for (const sz of [2.14, -2.14]) {
          const l = MeshBuilder.CreateBox("hazard", { width: 0.36, height: 0.2, depth: 0.04 }, scene);
          l.parent = node; l.position.set(sx, 0.72, sz); l.material = this.alarmOff; l.isPickable = false; l.setEnabled(false);
          v.lights.push(l);
        }
      } else if (d.kind === "till") {
        const l = MeshBuilder.CreateSphere("tillalarm", { diameter: 0.3, segments: 8 }, scene);
        l.parent = node; l.position.set(0, 2.9, 0); l.material = this.alarmMat; l.isPickable = false; l.setEnabled(false);
        v.lights = [l];
      } else {
        continue; // bins, meters, newsboxes: nothing changes visibly (they just go empty)
      }
      this.map.set(d.id, v);
    }
  }

  /** C4a: a breakable changed state. Returns true if it just broke (a hydrant starts spraying). */
  syncBreakable(id: string, ready: boolean): boolean {
    const d = this.brkDefs.get(id);
    if (!d || this.brkReady.get(id) === ready) return false;
    this.brkReady.set(id, ready);
    if (!ready && d.kind === "hydrant") this.spray(d.x, d.z);
    return !ready;
  }

  /** C4a: chunks flying out of something that just broke (or a few chips from a hit that didn't). */
  burst(kind: string, x: number, z: number, broke: boolean) {
    const COLORS: Record<string, string[]> = {
      shopglass: ["#bfe8ff", "#9fe3ff", "#e8f7ff"], busstop: ["#bfe8ff", "#3d6fb5"], hydrant: ["#d6264a", "#8a1f2e"], mailbox: ["#3d6fb5", "#f4f1ea"],
      bench: ["#8b5a2b", "#6b4a2b"], planter: ["#b5653b", "#4f8a3a", "#6b4a2b"], table: ["#8b5a2b", "#f4f1ea"], pallet: ["#a8743f", "#8b5a2b"],
    };
    const cols = COLORS[kind] ?? ["#8e8a94"];
    const glass = kind === "shopglass" || kind === "busstop";
    const n = broke ? (glass ? 14 : 8) : 3;
    for (let i = 0; i < n; i++) {
      const sz = glass ? 0.12 + Math.random() * 0.2 : 0.15 + Math.random() * 0.25;
      const m = MeshBuilder.CreateBox("chunk", { width: sz, height: glass ? 0.03 : sz * 0.6, depth: sz }, this.scene);
      m.material = toon(this.scene, cols[i % cols.length]); m.isPickable = false;
      if (!glass) ink(m, 0.01);
      m.position.set(x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * (glass ? 2 : 0.8), z + (Math.random() - 0.5) * 0.6);
      const a = Math.random() * Math.PI * 2, sp = broke ? 2 + Math.random() * 3 : 1.2;
      this.debris.push({ m, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, t: broke ? 10 : 2, spin: (Math.random() - 0.5) * 12 });
    }
    while (this.debris.length > 140) this.debris.shift()!.m.dispose();
  }

  private spray(x: number, z: number) {
    const node = new TransformNode("hydrantSpray", this.scene);
    node.position.set(x, 0, z);
    const jetMat = new StandardMaterial("jet", this.scene);
    jetMat.diffuseColor = Color3.FromHexString("#bfe8ff"); jetMat.emissiveColor = Color3.FromHexString("#4f8fb0"); jetMat.alpha = 0.55;
    const jet = MeshBuilder.CreateCylinder("jet", { diameterTop: 1.2, diameterBottom: 0.3, height: 3.2, tessellation: 10 }, this.scene);
    jet.parent = node; jet.position.y = 1.8; jet.material = jetMat; jet.isPickable = false;
    const drops: Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const d = MeshBuilder.CreateSphere("drop", { diameter: 0.15, segments: 3 }, this.scene);
      d.parent = node; d.material = jetMat; d.isPickable = false; drops.push(d);
    }
    this.sprays.push({ node, t: 20, drops });
  }

  sync(id: string, pv: PropView) {
    const v = this.map.get(id);
    if (!v) return;
    if (pv.ready !== v.ready) {
      v.ready = pv.ready;
      if (v.lid) v.lid.rotation.x = v.ready ? 0 : -1.9; // flipped open after a search
      if (v.handset) v.handset.setEnabled(v.ready);
      if (v.glass && v.def.kind === "vending") v.glass.material = v.ready ? this.vendGlass : this.crackedMat;
      if (v.glass && v.def.kind === "car") v.glass.setEnabled(v.ready); // smashed
    }
    if (pv.alarm !== v.alarm) {
      v.alarm = pv.alarm;
      for (const l of v.lights ?? []) l.setEnabled(pv.alarm);
    }
  }

  update(dt: number) {
    this.t += dt;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      if (d.t <= 0) { d.m.dispose(); this.debris.splice(i, 1); continue; }
      if (d.m.position.y > 0.05 || d.vy > 0) {
        d.vy -= 18 * dt;
        d.m.position.x += d.vx * dt; d.m.position.y = Math.max(0.05, d.m.position.y + d.vy * dt); d.m.position.z += d.vz * dt;
        d.m.rotation.x += d.spin * dt; d.m.rotation.z += d.spin * 0.7 * dt;
        if (d.m.position.y <= 0.05) { d.vy = 0; d.vx *= 0.3; d.vz *= 0.3; }
      }
      if (d.t < 1) d.m.scaling.setAll(Math.max(0.01, d.t));
    }
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const s = this.sprays[i];
      s.t -= dt;
      if (s.t <= 0) { s.node.dispose(false, true); this.sprays.splice(i, 1); continue; }
      s.drops.forEach((d, k) => { const ph = (this.t * 1.6 + k / s.drops.length) % 1, a = k * 2.4; d.position.set(Math.cos(a) * ph * 1.3, 3.4 * ph * (1.6 - ph) * 1.6, Math.sin(a) * ph * 1.3); });
      s.node.scaling.y = s.t < 2 ? s.t / 2 : 1;
    }
    const on = Math.sin(this.t * 14) > 0;
    for (const v of this.map.values()) {
      if (!v.alarm || !v.lights) continue;
      for (const l of v.lights) l.material = on ? this.alarmMat : this.alarmOff;
    }
  }

  /** Where the prop is (for sounds / prompts). */
  def(id: string) { return this.map.get(id)?.def; }

  dispose() { for (const v of this.map.values()) v.node.dispose(false, true); this.map.clear(); }
}
