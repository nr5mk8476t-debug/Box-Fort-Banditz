// Traffic (Phase 3.5): each car is one baked mesh (+ outline), glided toward the synced position.
import { Scene, TransformNode } from "./babylon.ts";
import { toon, bakeGroup } from "./look.ts";
import { buildCarParts } from "./carModel.ts";
import type { CarView } from "@bfb/shared";

const COLORS = ["#d6264a", "#3d6fb5", "#ffcf3a", "#e8e2d4", "#43c7a6", "#6b4c9a", "#ff7a1f", "#2b2433"];

interface CarVis { node: TransformNode; x: number; z: number; yaw: number; init: boolean; }

export class CarRenderer {
  private map = new Map<string, CarVis>();
  private targets = new Map<string, CarView>();

  constructor(private scene: Scene) {}

  private build(id: string): CarVis {
    const node = new TransformNode("car-" + id, this.scene);
    const color = COLORS[(parseInt(id.replace(/\D/g, ""), 10) || 0) % COLORS.length];
    for (const [m, c] of buildCarParts(this.scene, color, true)) { m.parent = node; m.material = toon(this.scene, c); }
    bakeGroup(this.scene, node, 0.035);
    return { node, x: 0, z: 0, yaw: 0, init: false };
  }

  sync(id: string, v: CarView) {
    if (!this.map.has(id)) this.map.set(id, this.build(id));
    this.targets.set(id, { x: v.x, z: v.z, yaw: v.yaw });
  }

  /** Nearest car (for engine sound). */
  nearest(x: number, z: number): { d: number; x: number; z: number } | null {
    let best: { d: number; x: number; z: number } | null = null;
    for (const c of this.map.values()) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (!best || d < best.d) best = { d, x: c.x, z: c.z };
    }
    return best;
  }

  positions() { return [...this.map.values()].map((c) => ({ x: c.x, z: c.z, yaw: c.yaw })); }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 20);
    for (const [id, c] of this.map) {
      const t = this.targets.get(id);
      if (!t) continue;
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
    }
  }

  count() { return this.map.size; }
  dispose() { for (const c of this.map.values()) c.node.dispose(false, true); this.map.clear(); }
}
