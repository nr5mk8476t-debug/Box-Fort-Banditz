// Phase 4: police cruisers. They come and go (dispatched at 3 stars), glide toward the synced
// position like traffic, and flash red/blue while their siren is on.
import { Scene, TransformNode, StandardMaterial, Color3, type Mesh } from "./babylon.ts";
import { toon, bakeGroup, disposeOwned } from "./look.ts";
import { buildCopCarParts, buildCopLights } from "./carModel.ts";
import type { CopCarView } from "@bfb/shared";

interface CopVis { node: TransformNode; x: number; z: number; yaw: number; init: boolean; siren: boolean; lights: [Mesh, Mesh]; }

export class CopCarRenderer {
  private map = new Map<string, CopVis>();
  private targets = new Map<string, CopCarView>();
  private t = 0;
  private red: StandardMaterial; private blue: StandardMaterial; private off: StandardMaterial;

  constructor(private scene: Scene) {
    const mat = (name: string, hex: string) => { const m = new StandardMaterial(name, scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); return m; };
    this.red = mat("copRed", "#ff2a3a"); this.blue = mat("copBlue", "#2a6bff"); this.off = mat("copOff", "#3a3f55");
  }

  private build(id: string): CopVis {
    const node = new TransformNode("copcar-" + id, this.scene);
    for (const [m, c] of buildCopCarParts(this.scene)) { m.parent = node; m.material = toon(this.scene, c); }
    bakeGroup(this.scene, node, 0.035);
    const lights = buildCopLights(this.scene);
    for (const l of lights) { l.parent = node; l.isPickable = false; }
    return { node, x: 0, z: 0, yaw: 0, init: false, siren: true, lights };
  }

  /** Call every frame with the current set of cruisers (missing ones are removed). */
  syncAll(views: { forEach(cb: (v: CopCarView, k: string) => void): void } | undefined) {
    const seen = new Set<string>();
    views?.forEach((v, id) => {
      seen.add(id);
      if (!this.map.has(id)) this.map.set(id, this.build(id));
      this.targets.set(id, { x: v.x, z: v.z, yaw: v.yaw, siren: v.siren });
    });
    for (const [id, c] of this.map) if (!seen.has(id)) { disposeOwned(c.node); this.map.delete(id); this.targets.delete(id); }
  }

  /** Cruisers with sirens on (for the siren sound). */
  sirens(): { x: number; z: number }[] { return [...this.map.values()].filter((c) => c.siren).map((c) => ({ x: c.x, z: c.z })); }
  positions() { return [...this.map.values()].map((c) => ({ x: c.x, z: c.z, yaw: c.yaw, siren: c.siren })); }
  count() { return this.map.size; }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 20);
    const phase = Math.floor(this.t * 6) % 2;
    for (const [id, c] of this.map) {
      const t = this.targets.get(id);
      if (!t) continue;
      c.siren = t.siren;
      if (!c.init || Math.hypot(t.x - c.x, t.z - c.z) > 8) { c.x = t.x; c.z = t.z; c.yaw = t.yaw; c.init = true; }
      else {
        c.x += (t.x - c.x) * k; c.z += (t.z - c.z) * k;
        let dy = t.yaw - c.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        c.yaw += dy * k;
      }
      c.node.position.set(c.x, 0, c.z);
      c.node.rotation.y = c.yaw;
      c.lights[0].material = c.siren && phase === 0 ? this.red : this.off;
      c.lights[1].material = c.siren && phase === 1 ? this.blue : this.off;
    }
  }

  dispose() { for (const c of this.map.values()) disposeOwned(c.node); this.map.clear(); }
}
