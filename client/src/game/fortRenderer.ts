// R14: each fort as its owner has built it: the shelves with what's banked on them (the real things: a thief aims at
// one), the safe, the workbench, the alarm, the fort's level (DUCT-TAPE FORT, PLYWOOD PALACE, MAYOR'S FORT), the lawn
// for overflow. Positions come from shared FORT_SPOTS / shelfSpot (the thief's aim uses the same).
// Cost: the fixed parts of a fort are ONE merged mesh per outline width (rebuilt only when its upgrades change); each
// banked thing is its own small model (merged by buildLootModel), added and removed as records come and go, not rebuilt.
import { MeshBuilder, Mesh, TransformNode, Vector3, Color3, type Scene } from "./babylon.ts";
import { toon, bakeGroup, disposeOwned } from "./look.ts";
import { buildLootModel } from "./models.ts";
import { fortAt2, shelfSpot, FORT_SPOTS, type ArenaLayout, type FortLot } from "@bfb/shared";

/** a fort's state as it arrives (World.loopJson): level, shelves, safe, upgrades, records [id, type, value, safe] */
export interface LoopView {
  L: number; S: number; F: number; u: string[]; r: [string, string, number, number][]; g: Record<string, number>;
  w?: string[]; ws?: string[]; th?: [string, string, number, number];
  [k: string]: unknown;
}
export function parseLoop(json: string): LoopView | null { if (!json) return null; try { return JSON.parse(json) as LoopView; } catch { return null; } }

interface FortVis {
  lot: FortLot; json: string; upsKey: string;
  furniture: TransformNode | null;
  items: Map<string, { root: TransformNode; meshes: Mesh[]; spot: number }>;
  loop: LoopView | null;
}

export class FortRenderer {
  private forts = new Map<number, FortVis>();
  private highlighted: Mesh[] = [];
  constructor(private scene: Scene, private arena: ArenaLayout) {}

  /** the latest state of the fort in `slot` (call every applyWorld; it does nothing unless the JSON changed) */
  update(slot: number, json: string) {
    const lot = this.arena.forts?.find((f) => f.slot === slot);
    if (!lot) return;
    let v = this.forts.get(slot);
    if (!v) { v = { lot, json: "", upsKey: "", furniture: null, items: new Map(), loop: null }; this.forts.set(slot, v); }
    if (v.json === json) return;
    v.json = json; v.loop = parseLoop(json);
    const L = v.loop;
    if (!L) return;
    const upsKey = [...L.u].sort().join(",") + "|" + L.S + "|" + L.F;
    if (upsKey !== v.upsKey) { v.upsKey = upsKey; if (v.furniture) disposeOwned(v.furniture); v.furniture = this.buildFurniture(lot, L); }
    // the banked things: shelves first (in order), the safe's are inside it (not shown), past the shelves: the lawn
    const want = new Map<string, { type: string; spot: number }>();
    let i = 0;
    for (const [id, type, , safe] of L.r) { if (safe) continue; want.set(id, { type, spot: i < L.S ? i : 16 + (i - L.S) }); i++; }
    for (const [id, it] of v.items) if (!want.has(id)) { disposeOwned(it.root); v.items.delete(id); }
    for (const [id, w] of want) {
      let it = v.items.get(id);
      if (!it) { const m = buildLootModel(this.scene, w.type); it = { root: m.root, meshes: m.meshes, spot: -1 }; this.fit(it.root); v.items.set(id, it); }
      if (it.spot !== w.spot) { it.spot = w.spot; const p = shelfSpot(lot, w.spot); it.root.position.set(p.x, p.y + 0.02 + (it.root.metadata?.lift ?? 0), p.z); it.root.rotation.y = lot.yaw + Math.PI; }
    }
  }
  /** a fort's last state (for the thief's aim and the prompts) */
  loopOf(slot: number) { return this.forts.get(slot)?.loop ?? null; }
  /** clear the forts nobody owns any more */
  retain(slots: Set<number>) { for (const [s, v] of this.forts) if (!slots.has(s)) { if (v.furniture) disposeOwned(v.furniture); for (const it of v.items.values()) disposeOwned(it.root); this.forts.delete(s); } }
  /** gold outline on the thing a thief is aiming at (or none) */
  highlight(slot: number, recId: string | null) {
    for (const m of this.highlighted) if (!m.isDisposed()) m.outlineColor = Color3.FromHexString("#1b1420");
    this.highlighted = [];
    if (!recId) return;
    const it = this.forts.get(slot)?.items.get(recId);
    if (!it) return;
    for (const m of it.meshes) if (!m.isDisposed()) { m.outlineColor = Color3.FromHexString("#ffd23c"); this.highlighted.push(m); }
  }
  dispose() { this.retain(new Set()); }

  /** scale a model to fit a shelf spot (0.5 m at most), standing on it */
  private fit(root: TransformNode) {
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.01);
    const k = Math.min(1, 0.5 / size);
    root.scaling.setAll(k);
    root.metadata = { lift: -min.y * k };
  }

  /** the fixed parts: shelf units for the capacity, the safe, the upgrades' pieces, the fort's level */
  private buildFurniture(lot: FortLot, L: LoopView): TransformNode {
    const sc = this.scene, node = new TransformNode("fort-furniture-" + lot.slot, sc), ups = new Set(L.u);
    const B = (u: number, v: number, y: number, w: number, h: number, d: number, col: string, ry = 0) => {
      const m = MeshBuilder.CreateBox("ff", { width: w, height: h, depth: d }, sc); const p = fortAt2(lot, u, v);
      m.position.set(p.x, y, p.z); m.rotation.y = lot.yaw + ry; m.material = toon(sc, col); m.parent = node; m.isPickable = false; return m;
    };
    const C = (u: number, v: number, y: number, d: number, h: number, col: string, top?: number) => {
      const m = MeshBuilder.CreateCylinder("ff", { diameter: d, diameterTop: top ?? d, height: h, tessellation: 12 }, sc); const p = fortAt2(lot, u, v);
      m.position.set(p.x, y, p.z); m.material = toon(sc, col); m.parent = node; m.isPickable = false; return m;
    };
    // shelf units: the left always; the right's lower tier with SHELVES II, its upper with III
    FORT_SPOTS.shelfUnits.forEach((su, k) => {
      if (k === 1 && L.S <= 8) return;
      const tiers = k === 0 ? 2 : L.S >= 16 ? 2 : 1, top = FORT_SPOTS.shelfTiers[tiers - 1] + 0.05;
      for (const du of [-1.3, 1.3]) B(su.u + du, su.v, top / 2, 0.08, top, 0.5, "#8a6a4a");
      for (let t = 0; t < tiers; t++) B(su.u, su.v, FORT_SPOTS.shelfTiers[t] - 0.03, 2.66, 0.05, 0.5, "#c9955b");
      B(su.u, su.v - 0.24, top / 2, 2.66, top, 0.03, "#a8743f");
    });
    // the safe: a squat steel box with a dial (a gold handle for SAFE II, gold trim for III)
    { const s = FORT_SPOTS.safe; B(s.u, s.v, 0.38, 0.8, 0.76, 0.7, "#4a4f5a"); const d = C(s.u, s.v + 0.36, 0.45, 0.2, 0.04, "#c8ccd4"); d.rotation.x = Math.PI / 2; B(s.u + 0.25, s.v + 0.36, 0.3, 0.05, 0.2, 0.04, ups.has("safe2") ? "#d9b45a" : "#8a8e98");
      if (ups.has("safe3")) B(s.u, s.v, 0.77, 0.84, 0.03, 0.74, "#d9b45a"); }
    if (ups.has("workbench")) { const w = FORT_SPOTS.workbench; B(w.u, w.v, 0.85, 1.6, 0.08, 0.7, "#8a5a2b"); for (const du of [-0.7, 0.7]) for (const dv of [-0.28, 0.28]) B(w.u + du, w.v + dv, 0.42, 0.08, 0.84, 0.08, "#5a3a20"); B(w.u - 0.5, w.v, 0.97, 0.22, 0.16, 0.18, "#5a6070"); B(w.u + 0.3, w.v, 0.9, 0.5, 0.03, 0.06, "#c8ccd4", 0.4); }
    if (ups.has("alarm1")) { const a = FORT_SPOTS.alarm; C(a.u, a.v, 1.0, 0.06, 2.0, "#6a6a72"); for (let q = 0; q < 4; q++) { const can = C(a.u + 0.18, a.v, 1.75 - q * 0.22, 0.1, 0.14, "#c8ccd4"); can.position.x += 0; }
      if (ups.has("alarm2")) { const b = C(a.u, a.v, 2.12, 0.34, 0.26, "#d9b45a", 0.12); void b; C(a.u, a.v, 2.3, 0.1, 0.08, "#ff3b30"); } }
    // the fort's level, round the cardboard box (it's 2.4 x 1.9 x 1.5 at (0, 0))
    if (L.L >= 2) { for (const y of [0.4, 1.05]) B(0, 0, y, 2.46, 0.12, 1.96, "#a8acb4"); C(-1.0, -0.6, 2.2, 0.05, 1.4, "#6a6a72"); B(-0.7, -0.6, 2.65, 0.55, 0.36, 0.03, ["#e14b4b", "#3d6fb5", "#6aa84f", "#ffcf3a"][lot.slot % 4]); }
    if (L.L >= 3) { B(0, 0, 1.2, 3.3, 2.4, 0.08, "#c8a46a"); for (const s2 of [-1, 1]) { B(s2 * 1.65, 0.0, 1.2, 0.08, 2.4, 2.7, "#c8a46a"); B(s2 * 0.82, 0, 2.62, 1.9, 0.08, 2.9, "#7a4a2a", 0).rotation.z = s2 * 0.45; }
      B(0, 1.35, 2.0, 3.3, 0.8, 0.08, "#c8a46a"); }
    if (L.L >= 4) { for (const du of [-1.3, -0.45, 0.45, 1.3]) C(du, 1.55, 1.3, 0.24, 2.6, "#f4f0ea"); B(0, 1.55, 2.66, 3.2, 0.14, 0.4, "#f4f0ea"); const dome = MeshBuilder.CreateSphere("ff", { diameter: 1.8, segments: 12, slice: 0.5 }, sc); const p = fortAt2(lot, 0, 0); dome.position.set(p.x, 3.0, p.z); dome.material = toon(sc, "#d9b45a"); dome.parent = node; dome.isPickable = false;
      const pad = fortAt2(lot, 0, 0), dl = Math.hypot(lot.padX - pad.x, lot.padZ - pad.z); B(0, (dl - 1.5) / 2 + 1.6, 0.03, 1.1, 0.02, Math.max(0.5, dl - 3.2), "#b3263a"); }
    // one mesh per outline width: everything here has the same ink
    const merged = bakeGroup(sc, node, 0.02);
    if (merged) merged.isPickable = false;
    void Vector3;
    return node;
  }
}
