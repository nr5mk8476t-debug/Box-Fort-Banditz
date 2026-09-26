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

  constructor(scene: Scene, props: PropDef[]) {
    this.alarmMat = new StandardMaterial("alarmOn", scene);
    this.alarmMat.disableLighting = true;
    this.alarmMat.emissiveColor = Color3.FromHexString("#ff3b30");
    this.alarmOff = new StandardMaterial("alarmOff", scene);
    this.alarmOff.disableLighting = true;
    this.alarmOff.emissiveColor = Color3.FromHexString("#ffb000");
    this.crackedMat = toon(scene, "#46505a");
    this.vendGlass = toon(scene, "#9fe3ff");
    for (const d of props) {
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
