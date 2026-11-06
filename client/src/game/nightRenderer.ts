// Phase 5A: the NIGHT bonus round. The sky goes dark, street lamps glow and throw pools of light,
// lit windows / neon / signs stand out (they're unlit materials, so they keep their brightness
// while everything else darkens) and a moon comes up. Everything fades in over a few seconds at dusk and out again at dawn.
import {
  Scene, MeshBuilder, Mesh, StandardMaterial, DynamicTexture, Color3, Color4,
  type HemisphericLight, type DirectionalLight, type UniversalCamera,
} from "./babylon.ts";
import type { ArenaLayout } from "@bfb/shared";

const DAY_SKY = new Color3(0.62, 0.8, 0.95);
const NIGHT_SKY = new Color3(0.05, 0.06, 0.16);

function poolTexture(scene: Scene) {
  const t = new DynamicTexture("lampPool", { width: 128, height: 128 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(255,226,150,0.9)");
  g.addColorStop(0.5, "rgba(255,210,120,0.35)");
  g.addColorStop(1, "rgba(255,200,100,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  t.update();
  t.hasAlpha = true;
  return t;
}

export class NightRenderer {
  /** 0 = full day, 1 = full night */
  level = 0;
  private target = 0;
  private bulbs: Mesh | null = null;
  private pools: Mesh | null = null;
  private poolMat: StandardMaterial;
  private bulbMat: StandardMaterial;
  private moon: Mesh;
  private hemiDay: number;
  private sunDay: number;
  private fogStartDay: number;
  private fogEndDay: number;
  /** C5a: up on the squat's roof you can see much further (fog pushed back) */
  private far = 1;
  setFarView(f: number) {
    if (Math.abs(f - this.far) < 0.01) return;
    this.far = f;
    this.camera.maxZ = f > 1 ? 1200 : 500;
    this.apply();
  }

  constructor(private scene: Scene, arena: ArenaLayout, private hemi: HemisphericLight, private sun: DirectionalLight, private camera: UniversalCamera) {
    this.hemiDay = hemi.intensity;
    this.sunDay = sun.intensity;
    this.fogStartDay = scene.fogStart;
    this.fogEndDay = scene.fogEnd;
    const lamps = (arena.decor ?? []).filter((d) => d.kind === "streetlight");
    // glowing bulbs under each lamp head
    this.bulbMat = new StandardMaterial("bulbMat", scene);
    this.bulbMat.disableLighting = true;
    this.bulbMat.emissiveColor = Color3.FromHexString("#fff1b0");
    const bulbs: Mesh[] = [];
    const pools: Mesh[] = [];
    for (const d of lamps) {
      const b = MeshBuilder.CreateBox("bulb", { width: 0.6, height: 0.06, depth: 0.28 }, scene);
      b.position.set(d.x, 5.23, d.z);
      bulbs.push(b);
      const p = MeshBuilder.CreateGround("pool", { width: 9, height: 9 }, scene);
      p.position.set(d.x, 0.03, d.z);
      pools.push(p);
    }
    if (bulbs.length) { this.bulbs = Mesh.MergeMeshes(bulbs, true, true); if (this.bulbs) { this.bulbs.material = this.bulbMat; this.bulbs.isPickable = false; } }
    this.poolMat = new StandardMaterial("poolMat", scene);
    this.poolMat.disableLighting = true;
    this.poolMat.emissiveTexture = poolTexture(scene);
    this.poolMat.opacityTexture = this.poolMat.emissiveTexture;
    this.poolMat.alpha = 0;
    this.poolMat.zOffset = -1;
    if (pools.length) { this.pools = Mesh.MergeMeshes(pools, true, true); if (this.pools) { this.pools.material = this.poolMat; this.pools.isPickable = false; this.pools.setEnabled(false); } }
    // the moon
    this.moon = MeshBuilder.CreateDisc("moon", { radius: 9, tessellation: 24 }, scene);
    const mm = new StandardMaterial("moonMat", scene);
    mm.disableLighting = true;
    mm.emissiveColor = Color3.FromHexString("#f4f1d8");
    mm.fogEnabled = false;
    this.moon.material = mm;
    this.moon.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.moon.isPickable = false;
    this.moon.setEnabled(false);
    // (no extra light: a point light makes every material's shader heavier all game long)
  }

  /** Night on / off (fades over ~3 s). */
  set night(on: boolean) { this.target = on ? 1 : 0; }
  /** R12.3: the sunset: any level in between (0 day .. 1 night), followed at the same ~3 s rate */
  set darkness(v: number) { this.target = Math.max(0, Math.min(1, v)); }
  get night() { return this.target > 0; }

  /** Jump straight to day or night (entering a game already at night). */
  snap() { this.level = this.target; this.apply(); }

  update(dt: number) {
    if (this.level !== this.target) {
      const step = dt / 3;
      this.level = this.target > this.level ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
      this.apply();
    }
    if (this.level > 0) {
      const c = this.camera.position;
      this.moon.position.set(c.x - 120, c.y + 110, c.z + 160);
    }
  }

  private apply() {
    const n = this.level;
    const sc = this.scene;
    this.hemi.intensity = this.hemiDay * (1 - 0.5 * n);
    this.hemi.diffuse = Color3.Lerp(Color3.White(), Color3.FromHexString("#8fa2ff"), n);
    this.sun.intensity = this.sunDay * (1 - 0.88 * n);
    const sky = Color3.Lerp(DAY_SKY, NIGHT_SKY, n);
    sc.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    sc.fogColor = sky;
    sc.fogStart = this.fogStartDay * (1 - 0.35 * n) * this.far;
    sc.fogEnd = this.fogEndDay * (1 - 0.3 * n) * this.far;
    this.poolMat.alpha = 0.6 * n;
    this.pools?.setEnabled(n > 0.01);
    this.moon.setEnabled(n > 0.05);
    this.bulbMat.emissiveColor = Color3.Lerp(Color3.FromHexString("#d8cfa0"), Color3.FromHexString("#fff6c8"), n);
  }
}
