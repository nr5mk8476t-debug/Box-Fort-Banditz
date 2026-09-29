// Draws Trashington from the shared layout (the same boxes the game rules collide with).
// PLACEHOLDER-QUALITY ART built from simple shapes, but deliberately styled: toon shading,
// ink outlines, grimy-bright colours, shop signs, parody ads, windows.
// Performance: static meshes are merged by material, so the whole city is a few dozen draw calls.
import {
  Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture, VertexBuffer, Vector3, VertexData,
  type ShadowGenerator,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, lightState, tierAt, TIER_WALLS, TIER_TOWERS, type ArenaLayout, type Box } from "@bfb/shared";
import { DynamicTexture } from "./babylon.ts";
import { buildCarParts, buildCopCarParts, buildCopLights } from "./carModel.ts";


const KIND_COLOR: Partial<Record<Box["kind"], string>> = {
  wall: "#b8a38a", crate: PALETTE.cardboard, curb: PALETTE.greyB, "ramp-step": PALETTE.mustard, platform: PALETTE.teal,
  ledge: PALETTE.cardboardDark, slab: PALETTE.grape, sidewalk: "#b3aebb", fence: "#4e4a59", dumpster: "#3f7a4f",
  bench: "#8b5a2b", planter: "#b5653b", fountain: "#9aa3b5", kiosk: "#e2e0d8", van: "#eeeae0", busstop: "#3d6fb5",
  junk: "#8e7a63", counter: "#7a4b2a", roof: "#5a5163",
  plaza: "#b9a88a", shelf: "#9a6a3c", fridge: "#e8eef2", shopfloor: "#d8d0c4", statue: "#9aa3b5",
  // Slice 2A
  step: "#8e8a94", arcade: "#2b2240", washer: "#f4f1ea", rack: "#6f6a78", case: "#e8e2d4", table: "#8b5a2b",
  chair: "#b03a48", cage: "#c8c4cc", bed: "#4f7fd1", sofa: "#8a5a9e", desk: "#a8743f", cooler: "#bfe8ff",
  gymbench: "#3a3444", boxes: PALETTE.cardboard, plinth: "#b9b3a6", rim: "#9aa3b5", dock: "#8b5a2b", truck: "#e8b83a",
  hydrant: "#d6264a", mailbox: "#3d6fb5", bikerack: "#6f6a78", board: "#3a3444", pot: "#b5653b", bags: "#2b2433",
  pallet: "#a8743f", portaloo: "#3d8fd6", mixer: "#ff7a1f", trolley: "#b8b4c8",
};
/** Slice 2A: interiors are drawn only when the camera is this close to the building. */
export const INTERIOR_DRAW_DIST = 42;
/** Props are drawn by buildProps (static body here, changing parts in PropRenderer). */
const PROP_BOX_KINDS = new Set<Box["kind"]>(["bin", "phone", "vending", "meter", "newsbox", "car", "statue"]);

// ---- C2: each tier has its own materials ----
// low (south): grimy brick; medium: painted render; high (Uptown): stone walls + glass towers
/** trim (cornices, sills, lintels) per tier */
const TIER_TRIM = ["#5a3a2e", "#f4ecd8", "#f2eee4"];
const AWNING_COLORS = [["#d6264a", "#f4f1ea"], ["#2f8f5a", "#f4f1ea"], ["#3d6fb5", "#f4f1ea"], ["#e8a13a", "#6b3a1e"], ["#6b4c9a", "#ffe14a"], ["#1b1420", "#ff8fa3"]];

const inRectXZ = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

function shade(hex: string, f: number): string {
  const c = Color3.FromHexString(hex);
  const k = (v: number) => Math.max(0, Math.min(1, f < 0 ? v * (1 + f) : v + (1 - v) * f));
  return new Color3(k(c.r), k(c.g), k(c.b)).toHexString();
}

function canvasTexture(scene: Scene, size: number, draw: (c: CanvasRenderingContext2D, r: () => number) => void, scale = 1): Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size * scale;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, size * scale, size * scale);
  c.scale(scale, scale);
  let seed = size + 17;
  draw(c, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
  const t = new Texture(cv.toDataURL(), scene);
  t.hasAlpha = true;
  return t;
}

/** Low tier: brick courses drawn as see-through mortar lines over the wall's own colour (1 tile = 2 x 2 m). */
function brickTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    const rowH = 16, brickW = 42;
    for (let y = 0; y < 256; y += rowH) {
      const off = (y / rowH) % 2 ? brickW / 2 : 0;
      for (let x = -brickW; x < 256 + brickW; x += brickW) {
        const v = r();
        if (v < 0.22) { c.fillStyle = "rgba(0,0,0,0.16)"; c.fillRect(x + off + 2, y + 2, brickW - 3, rowH - 3); }
        else if (v > 0.9) { c.fillStyle = "rgba(255,230,200,0.12)"; c.fillRect(x + off + 2, y + 2, brickW - 3, rowH - 3); }
        c.fillStyle = "rgba(30,20,30,0.32)";
        c.fillRect(x + off, y, 2, rowH);
      }
      c.fillStyle = "rgba(30,20,30,0.32)";
      c.fillRect(0, y, 256, 2);
    }
    // soot streaks running down
    for (let i = 0; i < 5; i++) { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "rgba(20,15,25,0.18)"); g.addColorStop(1, "rgba(20,15,25,0)"); c.fillStyle = g; c.fillRect(r() * 240, 0, 6 + r() * 12, 120 + r() * 136); }
  });
}

/** Medium tier: painted render with damp stains and hairline cracks (1 tile = 4 x 4 m). */
function renderTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let i = 0; i < 26; i++) {
      const x = r() * 256, y = r() * 256, rad = 6 + r() * 26;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(60,40,40,${0.05 + r() * 0.07})`); g.addColorStop(1, "rgba(60,40,40,0)");
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    c.strokeStyle = "rgba(40,30,40,0.35)"; c.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { let x = r() * 256, y = r() * 256; c.beginPath(); c.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 22; y += 6 + r() * 10; c.lineTo(x, y); } c.stroke(); }
  });
}

/** High tier: dressed stone blocks (1 tile = 3 x 3 m). */
function stoneTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let y = 0; y < 256; y += 64) {
      const off = (y / 64) % 2 ? 64 : 0;
      c.fillStyle = "rgba(60,50,60,0.22)"; c.fillRect(0, y, 256, 2);
      for (let x = off; x < 256; x += 128) c.fillRect(x, y, 2, 64);
      if (r() > 0.6) { c.fillStyle = "rgba(255,255,255,0.05)"; c.fillRect(off + 4, y + 4, 120, 56); }
    }
  });
}

/** High tier: glass curtain wall for towers (one pane per 1.6 x 2.2 m cell, like the windows). */
function curtainTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const g = c.createLinearGradient(i * 64, j * 64, i * 64 + 64, j * 64 + 64);
      const lit = r();
      g.addColorStop(0, lit > 0.7 ? "#d9f4ff" : "#8fc4dc"); g.addColorStop(1, lit > 0.85 ? "#ffe9a8" : "#4f7f9e");
      c.fillStyle = g; c.fillRect(i * 64, j * 64, 64, 64);
      c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.moveTo(i * 64 + 8, j * 64 + 60); c.lineTo(i * 64 + 22, j * 64 + 60); c.lineTo(i * 64 + 52, j * 64 + 4); c.lineTo(i * 64 + 38, j * 64 + 4); c.fill();
    }
    c.fillStyle = "#2b3040";
    for (let k = 0; k <= 256; k += 64) { c.fillRect(k - 3, 0, 6, 256); c.fillRect(0, k - 4, 256, 8); }
  }, 2);
}

/** A shopfront bay (4 m wide, 3 m tall): two big display windows either side of a door. */
function shopfrontTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    c.fillStyle = "#2b2433"; c.fillRect(0, 64, 256, 192);               // frame (the texture's top quarter is left empty)
    const pane = (x: number, w: number) => {
      const g = c.createLinearGradient(x, 80, x + w, 240);
      g.addColorStop(0, "#bfe8ff"); g.addColorStop(1, "#5f8fae");
      c.fillStyle = g; c.fillRect(x, 78, w, 150);
      c.fillStyle = "rgba(255,255,255,0.45)"; c.beginPath(); c.moveTo(x + 8, 220); c.lineTo(x + 26, 220); c.lineTo(x + w - 10, 86); c.lineTo(x + w - 28, 86); c.fill();
      // goods on display
      const cols = ["#e14b4b", "#ffcf3a", "#43c7a6", "#ff8fa3", "#f4f1ea", "#6b4c9a"];
      for (let k = 0; k < 4; k++) { c.fillStyle = cols[Math.floor(r() * cols.length)]; const bw = 10 + r() * 14, bh = 12 + r() * 22; c.fillRect(x + 8 + k * (w - 16) / 4, 226 - bh, bw, bh); }
      c.fillStyle = "#2b2433"; c.fillRect(x, 190, w, 4); // shelf line
    };
    pane(10, 86); pane(160, 86);
    c.fillStyle = "#6b3a1e"; c.fillRect(104, 92, 48, 164);                // door
    c.fillStyle = "#9fe3ff"; c.fillRect(112, 102, 32, 58);
    c.fillStyle = "#ffcf3a"; c.fillRect(140, 176, 7, 5);                   // handle
    c.fillStyle = "#1b1420"; c.fillRect(0, 238, 256, 18);                  // kick plate
  }, 2);
}


function hash(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** One shared window-grid texture; each facade scales its UVs so windows tile at a fixed size. */
function windowTexture(scene: Scene): Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, 256, 256);
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const lit = r() > 0.5;
    c.fillStyle = lit ? (r() > 0.3 ? "#ffd98a" : "#9fe3ff") : "#2b2433";
    c.fillRect(i * 64 + 14, j * 64 + 12, 36, 42);
    c.strokeStyle = "#1b1420";
    c.lineWidth = 5;
    c.strokeRect(i * 64 + 14, j * 64 + 12, 36, 42);
  }
  const t = new Texture(cv.toDataURL(), scene);
  t.hasAlpha = true;
  return t;
}

/**
 * How far window planes float in front of a facade. The ink outline pass re-draws each building
 * 0.05-0.08 m bigger into the depth buffer, so windows must sit well clear of that shell or they
 * z-fight with it at a distance (the "flickering windows" bug). The material also gets a depth bias.
 */
const WIN_OFF = 0.22;

function scaleUVs(m: Mesh, su: number, sv: number) {
  const uv = m.getVerticesData(VertexBuffer.UVKind);
  if (!uv) return;
  for (let i = 0; i < uv.length; i += 2) { uv[i] *= su; uv[i + 1] *= sv; }
  m.setVerticesData(VertexBuffer.UVKind, uv);
}

export class CityRenderer {
  root: TransformNode;
  private byMaterial = new Map<string, Mesh[]>();
  /** Slice 2A: which unit (building interior) new meshes belong to (-1 = always drawn) */
  private group = -1;
  private unitMeshes = new Map<number, Mesh[]>();
  private unitOn = new Map<number, boolean>();
  /** textured interior planes (posters): toggled with their building */
  private unitPlanes = new Map<number, Mesh[]>();

  /** C2: façade planes, one merged mesh per material */
  private planes = { windows: [] as Mesh[], curtain: [] as Mesh[], brick: [] as Mesh[], render: [] as Mesh[], stone: [] as Mesh[], front: [] as Mesh[] };
  /** C2: shop signs share a few big textures (one draw call per sheet instead of one per sign) */
  private atlasSigns: { mesh: Mesh; text: string; bg: string }[] = [];
  /** C2: small modelled façade detail (sills, fire escapes, awning stripes...); off in Performance mode */
  readonly detail: boolean;
  /** C2: how many façade detail pieces were built (perf tests) */
  detailPieces = 0;

  constructor(private scene: Scene, private arena: ArenaLayout, private shadows: ShadowGenerator | null, opts: { detail?: boolean } = {}) {
    this.detail = opts.detail ?? true;
    this.root = new TransformNode("city", scene);
    this.buildGround();
    const winMat = new StandardMaterial("windows", scene);
    winMat.diffuseTexture = windowTexture(scene);
    winMat.emissiveTexture = winMat.diffuseTexture;
    winMat.disableLighting = true;
    winMat.useAlphaFromDiffuseTexture = true;
    winMat.backFaceCulling = false;
    winMat.zOffset = -2; // polygon offset toward the camera: wins every depth tie with the wall
    winMat.zOffsetUnits = -4;
    const windowPlanes: Mesh[] = [];
    const glassPanes: Mesh[] = [];

    // C4a: which boxes are breakable props (their pieces are tagged so they can vanish when smashed)
    const brkOfBox = new Map<number, string>();
    for (const pd of arena.props ?? []) if (pd.box !== undefined) brkOfBox.set(pd.box, pd.id);
    for (let bi = 0; bi < arena.boxes.length; bi++) {
      const b = arena.boxes[bi];
      this.brk = brkOfBox.get(bi) ?? "";
      if (b.kind === "fort") continue; // forts drawn separately (they will evolve in Phase 7)
      if (PROP_BOX_KINDS.has(b.kind)) continue;
      this.group = b.unit ?? -1;
      if (b.kind === "glass") {
        // Slice 2A: big see-through shop windows (they still block you)
        const g = MeshBuilder.CreateBox("glass", { width: b.w, height: b.h, depth: b.d }, scene);
        g.position.set(b.x, b.y, b.z);
        if (this.brk) g.metadata = { brk: this.brk };
        glassPanes.push(g);
        const sill = MeshBuilder.CreateBox("sill", { width: b.w + 0.06, height: 0.35, depth: b.d + 0.1 }, scene);
        sill.position.set(b.x, b.y - b.h / 2 + 0.175, b.z);
        this.add(sill, "#3a3444", 0.02);
        continue;
      }
      const tier = tierAt(b.z);
      const color = b.color ?? (b.kind === "building" ? TIER_WALLS[tier][Math.floor(hash(b.x, b.z) * TIER_WALLS[tier].length)]
        : b.kind === "tower" ? TIER_TOWERS[tier][Math.floor(hash(b.z, b.x) * TIER_TOWERS[tier].length)] : KIND_COLOR[b.kind] ?? PALETTE.greyA);
      if (b.kind === "tree") { this.tree(b); continue; }
      if (b.kind === "bars") { this.bars(b, color); continue; }
      const m = MeshBuilder.CreateBox("b", { width: b.w, height: b.h, depth: b.d }, scene);
      m.position.set(b.x, b.y, b.z);
      const flat = b.kind === "sidewalk" || b.kind === "curb" || b.kind === "plaza" || b.kind === "shopfloor";
      this.add(m, color, flat ? (b.kind === "shopfloor" ? 0 : 0.02) : b.kind === "tower" ? 0.08 : 0.05, !flat);
      if ((b.kind === "building" || b.kind === "tower") && b.windows) this.facade(b, color, tier);
      if (b.sign) this.sign(b);
      this.details(b);
    }
    this.group = -1;
    this.brk = "";
    if (glassPanes.length) {
      const ranges = this.rangesOf(glassPanes);
      const merged = Mesh.MergeMeshes(glassPanes, true, true);
      if (merged) {
        this.trackRanges(merged, ranges);
        const gm = new StandardMaterial("shopGlass", scene);
        gm.diffuseColor = Color3.FromHexString("#9fe3ff"); gm.emissiveColor = Color3.FromHexString("#2a5a70");
        gm.specularColor = Color3.FromHexString("#ffffff"); gm.alpha = 0.28; gm.backFaceCulling = false;
        merged.material = gm; merged.parent = this.root; merged.isPickable = false;
      }
    }
    this.buildWater();
    this.buildProps();
    this.buildShops();
    this.buildDecor();
    this.buildScenery();
    this.buildPark();
    this.planes.windows.push(...windowPlanes);
    const planeMat = (name: string, tex: Texture, zo: number) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true;
      m.useAlphaFromDiffuseTexture = true; m.backFaceCulling = false;
      m.zOffset = zo; m.zOffsetUnits = zo * 2;
      return m;
    };
    const mats: Record<keyof CityRenderer["planes"], StandardMaterial> = {
      windows: winMat, curtain: planeMat("curtainWall", curtainTexture(scene), -2), front: planeMat("shopfront", shopfrontTexture(scene), -2),
      brick: planeMat("brickWall", brickTexture(scene), -1), render: planeMat("renderWall", renderTexture(scene), -1), stone: planeMat("stoneWall", stoneTexture(scene), -1),
    };
    for (const k of Object.keys(this.planes) as (keyof CityRenderer["planes"])[]) {
      const list = this.planes[k];
      for (let i = 0; i < list.length; i += 1500) {
        const merged = Mesh.MergeMeshes(list.slice(i, i + 1500), true, true);
        if (merged) { merged.material = mats[k]; merged.parent = this.root; merged.isPickable = false; merged.freezeWorldMatrix(); }
      }
    }
    this.buildSignAtlas();
    this.buildForts();
    this.buildAds();
    this.flush();
  }

  /** Queue a static mesh for merging (grouped by colour). */
  private add(m: Mesh, color: string, outline = 0.04, castShadow = true) {
    if (this.group >= 0) castShadow = false; // interiors: no shadow casting (they're drawn on and off)
    if (this.brk) { m.metadata = { brk: this.brk }; castShadow = false; } // (C4a: breakables: the shadow map is drawn once)
    const key = color + "|" + outline + "|" + (castShadow ? 1 : 0) + "|" + this.group;
    (this.byMaterial.get(key) ?? this.byMaterial.set(key, []).get(key)!).push(m);
    m.isPickable = false;
  }

  /** C4a: the breakable prop whose pieces are being built right now ("" = none) */
  private brk = "";
  /** C4a: where each breakable's vertices sit inside the merged city meshes (so a smash can hide them) */
  private brkRanges = new Map<string, { mesh: Mesh; start: number; count: number }[]>();
  private brkPos = new Map<Mesh, { pos: Float32Array; orig: Float32Array }>();
  private brkBroken = new Set<string>();

  /** vertex ranges of tagged meshes, in merge order */
  private rangesOf(meshes: Mesh[]): { brk: string; start: number; count: number }[] {
    const out: { brk: string; start: number; count: number }[] = [];
    let v = 0;
    for (const m of meshes) {
      const n = m.getTotalVertices();
      const b = (m.metadata as { brk?: string } | null)?.brk;
      if (b) out.push({ brk: b, start: v, count: n });
      v += n;
    }
    return out;
  }
  private trackRanges(merged: Mesh, ranges: { brk: string; start: number; count: number }[]) {
    if (!ranges.length) return;
    const pos = merged.getVerticesData(VertexBuffer.PositionKind);
    if (!pos) return;
    const arr = new Float32Array(pos);
    merged.setVerticesData(VertexBuffer.PositionKind, arr, true); // (updatable: smashed pieces get collapsed)
    this.brkPos.set(merged, { pos: arr, orig: new Float32Array(arr) });
    for (const r of ranges) (this.brkRanges.get(r.brk) ?? this.brkRanges.set(r.brk, []).get(r.brk)!).push({ mesh: merged, start: r.start, count: r.count });
  }

  /** C4a: hide (smashed) or show (repaired at dawn) a breakable's pieces. */
  setBroken(propId: string, broken: boolean) {
    if (this.brkBroken.has(propId) === broken) return;
    if (broken) this.brkBroken.add(propId); else this.brkBroken.delete(propId);
    const touched = new Set<Mesh>();
    for (const r of this.brkRanges.get(propId) ?? []) {
      const st = this.brkPos.get(r.mesh);
      if (!st) continue;
      const a = r.start * 3, e = (r.start + r.count) * 3;
      if (broken) { for (let k = a; k < e; k += 3) { st.pos[k] = st.orig[a]; st.pos[k + 1] = -5; st.pos[k + 2] = st.orig[a + 2]; } }
      else st.pos.set(st.orig.subarray(a, e), a);
      touched.add(r.mesh);
    }
    for (const m of touched) m.updateVerticesData(VertexBuffer.PositionKind, this.brkPos.get(m)!.pos);
  }
  get brokenCount() { return this.brkBroken.size; }

  /**
   * Merge everything queued so far. Colours are baked into vertex colours, so the whole static
   * city is a handful of meshes (one per outline width / shadow flag) instead of one per colour:
   * far fewer draw calls in the 200 m city.
   */
  private flush() {
    const groups = new Map<string, Mesh[]>();
    for (const [key, meshes] of this.byMaterial) {
      const [color, outline, cast, grp] = key.split("|");
      const c = Color3.FromHexString(color);
      for (const m of meshes) {
        const n = m.getTotalVertices();
        const cols = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1; }
        m.setVerticesData(VertexBuffer.ColorKind, cols);
      }
      const gk = outline + "|" + cast + "|" + grp;
      (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(...meshes);
    }
    for (const [gk, meshes] of groups) {
      const [outline, cast, grp] = gk.split("|");
      // MergeMeshes needs 32-bit indices for big batches; split very large groups to stay friendly to older GPUs
      for (let i = 0; i < meshes.length; i += 400) {
        const chunk = meshes.slice(i, i + 400);
        const ranges = this.rangesOf(chunk);
        const merged = chunk.length > 1 ? Mesh.MergeMeshes(chunk, true, true) : chunk[0];
        if (!merged) continue;
        this.trackRanges(merged, ranges);
        merged.parent = this.root;
        merged.material = toon(this.scene, "#ffffff", "cityvc");
        merged.useVertexColors = true;
        ink(merged, Number(outline));
        if (Number(outline) === 0) merged.renderOutline = false;
        merged.receiveShadows = true;
        merged.freezeWorldMatrix();
        merged.isPickable = false;
        if (cast === "1" && this.shadows) this.shadows.addShadowCaster(merged);
        const g = Number(grp);
        if (g >= 0) { (this.unitMeshes.get(g) ?? this.unitMeshes.set(g, []).get(g)!).push(merged); merged.setEnabled(false); this.unitOn.set(g, false); }
      }
    }
    this.byMaterial.clear();
  }

  /** Slice 2A: draw building interiors only near the camera. Call every frame. */
  update(camX: number, camZ: number) {
    for (const u of this.arena.units ?? []) {
      const on = Math.hypot(u.x - camX, u.z - camZ) < INTERIOR_DRAW_DIST;
      if (this.unitOn.get(u.id) === on) continue;
      this.unitOn.set(u.id, on);
      for (const m of this.unitMeshes.get(u.id) ?? []) m.setEnabled(on);
      for (const m of this.unitPlanes.get(u.id) ?? []) m.setEnabled(on);
    }
  }

  /** How many building interiors are being drawn right now (tests / perf overlay). */
  get interiorsDrawn() { let n = 0; for (const v of this.unitOn.values()) if (v) n++; return n; }

  /** Slice 2A: the pond (you can wade in it). */
  private buildWater() {
    // C1.1: the deep canal (dark, no lily pads; the water sits a bit lower than the pond's)
    for (const r of this.arena.deepWater ?? []) {
      const w = MeshBuilder.CreateGround("canal", { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, this.scene);
      w.position.set((r.minX + r.maxX) / 2, 0.3, (r.minZ + r.maxZ) / 2);
      const m = new StandardMaterial("canalMat", this.scene);
      m.diffuseColor = Color3.FromHexString("#2f6f9a"); m.emissiveColor = Color3.FromHexString("#0f2f45");
      m.specularColor = Color3.FromHexString("#ffffff"); m.alpha = 0.85;
      w.material = m; w.parent = this.root; w.isPickable = false;
      const bed = MeshBuilder.CreateGround("canalbed", { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, this.scene);
      bed.position.set((r.minX + r.maxX) / 2, 0.02, (r.minZ + r.maxZ) / 2);
      this.add(bed, "#1f3a4a", 0, false);
    }
    const shape = this.arena.pondShape ?? [];
    const inShape = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => shape.some((c) => Math.hypot((r.minX + r.maxX) / 2 - c.x, (r.minZ + r.maxZ) / 2 - c.z) < c.r + 0.5);
    for (const r of this.arena.water ?? []) {
      if (inShape(r)) continue; // (C3: the pear-shaped pond is drawn from its real shape in buildPark)
      const w = MeshBuilder.CreateGround("pond", { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, this.scene);
      w.position.set((r.minX + r.maxX) / 2, 0.38, (r.minZ + r.maxZ) / 2);
      const m = new StandardMaterial("pondMat", this.scene);
      m.diffuseColor = Color3.FromHexString("#3f8fc9"); m.emissiveColor = Color3.FromHexString("#123a55");
      m.specularColor = Color3.FromHexString("#ffffff"); m.alpha = 0.78;
      w.material = m; w.parent = this.root; w.isPickable = false;
      const bed = MeshBuilder.CreateGround("pondbed", { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, this.scene);
      bed.position.set((r.minX + r.maxX) / 2, 0.16, (r.minZ + r.maxZ) / 2);
      this.add(bed, "#2f5a4a", 0, false);
      // lily pads (the pond, not the canal)
      if ((r.maxX - r.minX) * (r.maxZ - r.minZ) > 300 || inRectXZ(r, 0, 0)) continue; // (no lily pads in the canal or the fountain)
      for (let i = 0; i < 5; i++) {
        const pad = MeshBuilder.CreateCylinder("lily", { diameter: 0.6 + hash(i, r.minX) * 0.4, height: 0.02, tessellation: 10 }, this.scene);
        pad.position.set(r.minX + 1 + hash(i, 3) * (r.maxX - r.minX - 2), 0.4, r.minZ + 1 + hash(7, i) * (r.maxZ - r.minZ - 2));
        this.add(pad, "#5a9e4b", 0, false);
      }
    }
  }

  private buildGround() {
    const s = this.arena.halfSize * 2 + 4;
    const ground = MeshBuilder.CreateGround("asphalt", { width: s, height: s }, this.scene);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#57525f"; c.fillRect(0, 0, 128, 128);
    // grime speckles
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { c.fillStyle = r() > 0.5 ? "#4d4855" : "#625c69"; c.fillRect(r() * 128, r() * 128, 2 + r() * 5, 2 + r() * 5); }
    const tex = new Texture(cv.toDataURL(), this.scene);
    tex.uScale = tex.vScale = s / 4;
    tex.anisotropicFilteringLevel = 8;
    const gm = new StandardMaterial("groundMat", this.scene);
    gm.diffuseTexture = tex;
    gm.specularColor = Color3.Black();
    ground.material = gm;
    ground.receiveShadows = true;
    ground.parent = this.root;
    ground.isPickable = false;

  }

  /**
   * C2: a building's façades. Every face gets its tier's wall material (brick / render / stone) and
   * windows (glass curtain walls on Uptown towers). The street face of a shop gets a shopfront, an
   * awning and a fascia sign; towers get a lobby. Small modelled detail (sills, lintels, pilasters,
   * fire escapes, balconies, window AC units, cornices, roof clutter) is skipped in Performance mode.
   * All of it is looks only: nothing here changes what you collide with.
   */
  private facade(b: Box, color: string, tier: number) {
    const sc = this.scene;
    const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
    const grounded = bottom < 0.5;
    const tower = b.kind === "tower";
    const thin = Math.min(b.w, b.d) < 2.5; // (upstairs room walls in walk-in shops)
    const fx = b.face ? Math.round(b.face[0]) : 0, fz = b.face ? Math.round(b.face[1]) : 0;
    // Uptown towers are glass, except landmark towers built in stone (the Mayor's tower)
    const glass = tier === 2 && tower && (!!b.front || !!b.sign);
    const H = (k: number) => hash(b.x * 1.3 + k * 7.1, b.z * 0.7 - k * 3.3);
    const trim = tier === 0 ? shade(color, -0.35) : TIER_TRIM[tier];
    const detail = this.detail && b.unit === undefined && !thin;
    const piece = (m: Mesh, col: string, outline = 0.02, cast = false) => { this.add(m, col, outline, cast); this.detailPieces++; return m; };
    const faces: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [nx, nz] of faces) {
      const fw = nx ? b.d : b.w;
      if (fw < 1.5) continue;
      const street = nx === fx && nz === fz && (fx !== 0 || fz !== 0);
      const ry = Math.atan2(-nx, -nz);
      const ax = Math.cos(ry), az = -Math.sin(ry);            // along the face (the plane's local x)
      const wx = b.x + nx * (b.w / 2), wz = b.z + nz * (b.d / 2); // centre of the wall surface
      const at = (m: Mesh, along: number, y: number, out: number) => { m.position.set(wx + ax * along + nx * out, y, wz + az * along + nz * out); m.rotation.y = ry; return m; };
      const shop = street && grounded && b.front === "shop";
      const lobby = street && grounded && b.front === "lobby";
      // a landmark's main entrance (glass doors in the middle of its signed face)
      const entrance = street && grounded && !b.front && !!b.sign && b.h >= 6 && fw >= 6;
      // ---- wall material ----
      if (!thin && !glass) {
        const tile = tier === 0 ? 2 : tier === 1 ? 4 : 3;
        const p = at(MeshBuilder.CreatePlane("wallmat", { width: fw, height: b.h }, sc), 0, b.y, 0.12);
        scaleUVs(p, fw / tile, b.h / tile);
        (tier === 0 ? this.planes.brick : tier === 1 ? this.planes.render : this.planes.stone).push(p);
      }
      // ---- windows ----
      const winBottom = shop || entrance ? bottom + 4.8 : tower && grounded ? bottom + 4.7 : bottom + 0.7;
      const winTop = top - 0.5;
      const ph = winTop - winBottom, pw = fw - 1;
      let rows = 0, rowH = 0, cols = 0, cellW = 0;
      if (ph >= 1.5 && pw >= 1.5) {
        rows = Math.max(1, Math.round(ph / 2.2)); rowH = ph / rows;
        cols = Math.max(1, Math.round(pw / 1.6)); cellW = pw / cols;
        const p = at(MeshBuilder.CreatePlane("win", { width: pw, height: ph }, sc), 0, (winTop + winBottom) / 2, WIN_OFF);
        scaleUVs(p, cols / 4, rows / 4);
        (glass ? this.planes.curtain : this.planes.windows).push(p);
      }
      // ---- shopfront / lobby glazing ----
      if (entrance) {
        const ew = Math.min(fw - 2, 8);
        const p = at(MeshBuilder.CreatePlane("entrance", { width: ew, height: 3 }, sc), 0, 1.75, 0.2);
        scaleUVs(p, Math.max(1, Math.round(ew / 4)), 0.75);
        this.planes.front.push(p);
      }
      if ((shop || lobby) && fw >= 3) {
        const bays = Math.max(1, Math.round((fw - 0.8) / 4));
        const p = at(MeshBuilder.CreatePlane("front", { width: fw - 0.8, height: 3 }, sc), 0, 1.75, lobby ? 0.27 : 0.2);
        scaleUVs(p, bays, 0.75);
        this.planes.front.push(p);
      }
      if (!detail) continue;
      // ---- awning over a shop (striped) / canopy over a tower lobby ----
      if (shop && fw >= 3) {
        const aw = Math.min(fw - 0.6, 8), [c1, c2] = AWNING_COLORS[Math.floor(H(1) * AWNING_COLORS.length)];
        const slope = 0.36, depth = 1.35;
        const base = at(MeshBuilder.CreateBox("awning", { width: aw, height: 0.08, depth }, sc), 0, 3.45 - Math.sin(slope) * depth / 2, depth / 2 + 0.05);
        base.rotation.x = slope; piece(base, c1, 0.025);
        const n = Math.floor(aw / 0.7);
        for (let i = 1; i < n; i += 2) {
          const st = at(MeshBuilder.CreateBox("stripe", { width: aw / n, height: 0.02, depth: depth - 0.02 }, sc), -aw / 2 + (i + 0.5) * aw / n, 3.45 - Math.sin(slope) * depth / 2 + 0.05, depth / 2 + 0.05);
          st.rotation.x = slope; piece(st, c2, 0);
        }
        piece(at(MeshBuilder.CreateBox("valance", { width: aw, height: 0.3, depth: 0.05 }, sc), 0, 3.45 - Math.sin(slope) * depth - 0.1, depth + 0.02), c1, 0.02);
      }
      if (lobby && fw >= 5) {
        const cw = Math.min(fw * 0.5, 7);
        piece(at(MeshBuilder.CreateBox("canopy", { width: cw, height: 0.3, depth: 2.4 }, sc), 0, 4.35, 1.3), tier === 2 ? "#2b2433" : trim, 0.03);
        if (tier === 2) piece(at(MeshBuilder.CreateBox("canopytrim", { width: cw + 0.06, height: 0.1, depth: 2.46 }, sc), 0, 4.2, 1.3), "#d9a632", 0);
        for (const sx of [-1, 1]) piece(at(MeshBuilder.CreateCylinder("canopypost", { diameter: 0.14, height: 4.2, tessellation: 6 }, sc), sx * (cw / 2 - 0.3), 2.1, 2.3), "#3a3444", 0.015);
      }
      // ---- per-window trim on the street face (and the back of low-tier buildings) ----
      const trimFace = street || (tier === 0 && !tower && nx === -fx && nz === -fz);
      if (rows && trimFace && !tower) {
        for (let i = 0; i < rows; i++) {
          const cellTop = winTop - i * rowH;
          const sillY = cellTop - (54 / 64) * rowH - 0.05, lintY = cellTop - (12 / 64) * rowH + 0.08;
          for (let c = 0; c < cols; c++) {
            const along = -pw / 2 + (c + 0.5) * cellW;
            piece(at(MeshBuilder.CreateBox("sill", { width: cellW * 0.62, height: 0.1, depth: 0.36 }, sc), along, sillY, 0.18), trim, 0.012);
            if (tier === 1) piece(at(MeshBuilder.CreateBox("lintel", { width: cellW * 0.66, height: 0.16, depth: 0.32 }, sc), along, lintY, 0.16), trim, 0.012);
            // window AC units hanging out of the cheap flats
            if (tier === 0 && H(i * 31 + c) < 0.14 && sillY > 3) piece(at(MeshBuilder.CreateBox("winac", { width: 0.7, height: 0.45, depth: 0.5 }, sc), along, sillY + 0.3, 0.45), "#c8c4cc", 0.02);
            // flower boxes in the middle tier
            if (tier === 1 && H(i * 17 + c + 5) < 0.18) {
              piece(at(MeshBuilder.CreateBox("flowerbox", { width: cellW * 0.6, height: 0.22, depth: 0.3 }, sc), along, sillY + 0.14, 0.34), "#8b5a2b", 0.012);
              piece(at(MeshBuilder.CreateBox("flowers", { width: cellW * 0.55, height: 0.16, depth: 0.24 }, sc), along, sillY + 0.3, 0.34), H(c + i) > 0.5 ? "#ff8fa3" : "#ffe14a", 0);
            }
          }
        }
      }
      // ---- belt courses on towers (every 4th floor) ----
      if (rows && tower) for (let i = 4; i < rows; i += 4) piece(at(MeshBuilder.CreateBox("belt", { width: fw + 0.3, height: 0.22, depth: 0.4 }, sc), 0, winTop - i * rowH, 0.2), tier === 2 ? "#e8e2d4" : trim, 0.015);
      // ---- pilasters at the corners of middle-tier fronts ----
      if (street && tier === 1 && !tower && b.h > 4) for (const sx of [-1, 1]) piece(at(MeshBuilder.CreateBox("pilaster", { width: 0.45, height: b.h - 0.6, depth: 0.32 }, sc), sx * (fw / 2 - 0.22), bottom + (b.h - 0.6) / 2, 0.16), trim, 0.02);
      // ---- fire escape (low + middle tier street fronts, 3+ floors) ----
      if (street && tier < 2 && !tower && rows >= 2 && cols >= 2 && H(9) < 0.5) {
        const c0 = Math.floor(H(10) * (cols - 1));
        const along = -pw / 2 + (c0 + 1) * cellW, span = Math.min(cellW * 2 + 0.4, 3.4);
        const iron = "#2b2433";
        let prevY = -1;
        for (let i = rows - 1; i >= 0; i--) {
          const y = winTop - i * rowH - (54 / 64) * rowH - 0.12;
          if (y < 4.2) continue;
          piece(at(MeshBuilder.CreateBox("fe-deck", { width: span, height: 0.08, depth: 1.0 }, sc), along, y, 0.62), iron, 0.012);
          piece(at(MeshBuilder.CreateBox("fe-rail", { width: span, height: 0.06, depth: 0.06 }, sc), along, y + 0.9, 1.1), iron, 0.008);
          for (const sx of [-1, 1]) piece(at(MeshBuilder.CreateBox("fe-post", { width: 0.06, height: 0.9, depth: 0.06 }, sc), along + sx * span / 2, y + 0.45, 1.1), iron, 0.008);
          if (prevY > 0) {
            const run = y - prevY, st = at(MeshBuilder.CreateBox("fe-stair", { width: 0.55, height: 0.06, depth: Math.hypot(run, span * 0.7) }, sc), along, (y + prevY) / 2, 0.7);
            st.rotation.set(Math.atan2(run, span * 0.7), ry + Math.PI / 2 * (i % 2 ? 1 : -1), 0);
            piece(st, iron, 0.008);
          } else {
            // the drop ladder that stops out of reach (climbing comes in C6)
            for (const sx of [-0.22, 0.22]) piece(at(MeshBuilder.CreateBox("fe-ladder", { width: 0.05, height: 2.2, depth: 0.05 }, sc), along + span / 2 - 0.4 + sx, y - 1.1, 1.05), iron, 0.006);
          }
          prevY = y;
        }
      }
      // ---- balconies (middle + high tier) ----
      if (street && tier >= 1 && !tower && rows >= 2 && H(11) < (tier === 2 ? 0.6 : 0.3)) {
        for (let i = 0; i < rows - 1; i++) {
          if (H(i + 40) < 0.4) continue;
          const y = winTop - i * rowH - (54 / 64) * rowH - 0.1, c0 = Math.floor(H(i + 50) * cols), along = -pw / 2 + (c0 + 0.5) * cellW;
          if (y < 4.2) continue;
          piece(at(MeshBuilder.CreateBox("balcony", { width: cellW * 1.1, height: 0.14, depth: 0.9 }, sc), along, y, 0.47), trim, 0.015);
          const rail = tier === 2 ? "#d9a632" : "#2b2433";
          piece(at(MeshBuilder.CreateBox("balcrail", { width: cellW * 1.1, height: 0.06, depth: 0.06 }, sc), along, y + 0.9, 0.88), rail, 0.008);
          for (const sx of [-1, 0, 1]) piece(at(MeshBuilder.CreateBox("baluster", { width: 0.05, height: 0.85, depth: 0.05 }, sc), along + sx * cellW * 0.52, y + 0.47, 0.88), rail, 0.006);
        }
      }
    }
    if (b.sign) this.landmark(b, color);
    if (!detail) return;
    // ---- cornice round the top (not on towers: they have a parapet) ----
    if (!tower && b.h > 3) piece((() => { const m = MeshBuilder.CreateBox("cornice", { width: b.w + 0.5, height: 0.45, depth: b.d + 0.5 }, sc); m.position.set(b.x, top - 0.28, b.z); return m; })(), trim, 0.03);
    // ---- roof clutter on roofs you can't reach (low roofs stay clear: rooftop loot lives there) ----
    if (!tower && b.h >= 9) {
      if (H(20) < 0.45) {
        const tx = b.x + (H(21) - 0.5) * b.w * 0.4, tz = b.z + (H(22) - 0.5) * b.d * 0.4;
        const tank = MeshBuilder.CreateCylinder("tank", { diameter: 2, height: 1.9, tessellation: 12 }, sc); tank.position.set(tx, top + 1.6, tz); piece(tank, "#8b5a2b", 0.04);
        const cone = MeshBuilder.CreateCylinder("tankroof", { diameterTop: 0, diameterBottom: 2.2, height: 0.7, tessellation: 12 }, sc); cone.position.set(tx, top + 2.9, tz); piece(cone, "#5a3a24", 0.03);
        for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) { const leg = MeshBuilder.CreateBox("tankleg", { width: 0.12, height: 0.7, depth: 0.12 }, sc); leg.position.set(tx + lx, top + 0.35, tz + lz); piece(leg, "#3a3444", 0.015); }
      }
      if (H(23) < 0.7) { const ac = MeshBuilder.CreateBox("ac", { width: 1.4, height: 0.9, depth: 1.1 }, sc); ac.position.set(b.x - b.w * 0.2, top + 0.45, b.z + b.d * 0.15); piece(ac, "#c8c4cc", 0.03); }
    }
    // ---- Uptown tower crowns: a setback and, on the tallest, a mast ----
    if (tower && tier === 2 && b.h > 30 && Math.min(b.w, b.d) > 5) {
      const crown = MeshBuilder.CreateBox("crown", { width: b.w * 0.62, height: 4.5, depth: b.d * 0.62 }, sc);
      crown.position.set(b.x, top + 2.85, b.z); piece(crown, shade(color, -0.2), 0.05);
      if (b.h > 45) {
        const mast = MeshBuilder.CreateCylinder("mast", { diameterTop: 0.12, diameterBottom: 0.4, height: 9, tessellation: 6 }, sc);
        mast.position.set(b.x, top + 9.6, b.z); piece(mast, "#c8c4cc", 0.02);
        const tip = MeshBuilder.CreateSphere("masttip", { diameter: 0.5, segments: 4 }, sc); tip.position.set(b.x, top + 14.2, b.z); piece(tip, "#ff3a3a", 0);
      }
    }
  }

  /** Jail-cell bars: vertical rods with rails top, middle and bottom (you can see through them). */
  private bars(b: Box, color: string) {
    const sc = this.scene;
    const alongX = b.w >= b.d, len = alongX ? b.w : b.d;
    const bottom = b.y - b.h / 2, top = b.y + b.h / 2;
    const n = Math.max(2, Math.round(len / 0.24));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len * i) / n;
      const rod = MeshBuilder.CreateBox("bar", { width: 0.06, height: b.h, depth: 0.06 }, sc);
      rod.position.set(b.x + (alongX ? t : 0), b.y, b.z + (alongX ? 0 : t));
      this.add(rod, color, 0.012);
    }
    for (const y of [bottom + 0.08, bottom + 1.2, top - 0.3]) {
      const rail = MeshBuilder.CreateBox("rail", { width: alongX ? len : 0.1, height: 0.1, depth: alongX ? 0.1 : len }, sc);
      rail.position.set(b.x, y, b.z);
      this.add(rail, "#5a6070", 0.015);
    }
  }

  /** Shop sign on the face that looks toward the city centre. */
  private sign(b: Box) {
    const toC = [-b.x, -b.z];
    let nx = 0, nz = 0;
    if (b.face) { nx = Math.round(b.face[0]); nz = Math.round(b.face[1]); }
    else if (Math.abs(toC[0]) * (b.d / (b.w + b.d)) > Math.abs(toC[1]) * (b.w / (b.w + b.d))) nx = Math.sign(toC[0]); else nz = Math.sign(toC[1]);
    const len = nx ? b.d : b.w;
    const top = b.y + b.h / 2;
    let w = Math.min(len * 0.8, 7);
    if (b.front === "shop") w = Math.min(len - 0.8, 5.2); // C2: fascia sign above the shopfront
    if (b.kind === "board") w = 0.9;
    if (b.face && b.kind === "wall" && b.h > 3) w = 5;
    else if (b.face && b.kind === "wall") w = Math.min(w, (b.h + 0.3) / 0.22);
    const p = MeshBuilder.CreatePlane("sign", { width: w, height: w * (b.kind === "board" ? 0.9 : 0.22) }, this.scene);
    const y = b.front === "shop" ? Math.min(4.05, top - 0.5 - w * 0.11) : b.kind === "board" ? 0.6 : b.face && b.kind === "building" ? top - 0.9 : b.face && b.kind !== "truck" ? b.y : b.kind === "truck" ? 2.55 : b.kind === "roof" ? top - 0.9 : b.kind === "tower" ? 5.5 : b.kind === "plinth" ? 0.6 : Math.min(top - 0.6, 2.9);
    const off = b.kind === "board" || b.kind === "plinth" ? 0.03 : b.kind === "truck" ? 0.12 : 0.34;
    p.position.set(b.x + nx * (b.w / 2 + off), y, b.z + nz * (b.d / 2 + off)); // in front of the window planes
    p.rotation.y = Math.atan2(-nx, -nz);
    const bg = ["#f3e2b8", "#ffe14a", "#43c7a6", "#ff8fa3", "#9fe3ff"][Math.floor(hash(b.x, b.z) * 5)];
    p.isPickable = false;
    if (b.kind !== "board") { this.atlasSigns.push({ mesh: p, text: b.sign!, bg }); return; } // C2: drawn on a shared sheet
    p.material = unlitTextured(this.scene, textTexture(this.scene, b.sign!, { w: 256, h: 230, bg: "#2b2433", fg: "#f4f1ea" }), "boardMat");
    p.material.zOffset = -4; p.material.zOffsetUnits = -8; // beats the (biased) windows behind it
    ink(p, 0.05);
    p.parent = this.root;
  }

  /**
   * C2: the landmarks' own features (always drawn, even in Performance mode: they're how you find
   * your way). Looks only, like the rest of the façades.
   */
  private landmark(b: Box, color: string) {
    const sc = this.scene, top = b.y + b.h / 2, name = b.sign ?? "";
    const fx = b.face ? Math.round(b.face[0]) : 0, fz = b.face ? Math.round(b.face[1]) : -1;
    const fw = fx ? b.d : b.w;
    const ry = Math.atan2(-fx, -fz), ax = Math.cos(ry), az = -Math.sin(ry);
    const wx = b.x + fx * (b.w / 2), wz = b.z + fz * (b.d / 2);
    const put = <M extends Mesh>(m: M, along: number, y: number, out: number, col: string, outline = 0.03): M => {
      m.position.set(wx + ax * along + fx * out, y, wz + az * along + fz * out); m.rotation.y = ry; this.add(m, col, outline, false); return m;
    };
    const roof = <M extends Mesh>(m: M, dx: number, y: number, dz: number, col: string, outline = 0.03): M => { m.position.set(b.x + dx, y, b.z + dz); this.add(m, col, outline, false); return m; };
    const prism = (w: number, h: number, d: number) => { const m = MeshBuilder.CreateCylinder("pediment", { diameter: 1, height: 1, tessellation: 3 }, sc); m.scaling.set(h, w, d); m.rotation.z = Math.PI / 2; m.bakeCurrentTransformIntoVertices(); return m; };
    const bulbs = (from: number, to: number, y: number, out: number, step = 0.7) => { for (let t = from; t <= to; t += step) put(MeshBuilder.CreateSphere("bulb", { diameter: 0.22, segments: 3 }, sc), t, y, out, "#fff2a8", 0); };
    const flag = (along: number, y: number, col: string) => {
      put(MeshBuilder.CreateCylinder("flagpole", { diameter: 0.08, height: 2.6, tessellation: 5 }, sc), along, y, 1.1, "#c8c4cc", 0.01).rotation.x = 0.9;
      put(MeshBuilder.CreateBox("flag", { width: 0.05, height: 0.9, depth: 1.3 }, sc), along, y + 0.55, 2.3, col, 0.015);
    };
    if (name === "TRASHINGTON CITY HALL") {
      // a pediment over the columns, gold trim, flags on the roof
      put(MeshBuilder.CreateBox("entablature", { width: 17, height: 0.9, depth: 1.6 }, sc), 0, 10.45, 0.6, "#f4f1ea");
      const ped = prism(17, 2.4, 1.4); put(ped, 0, 12.1, 0.6, "#f4f1ea");
      put(MeshBuilder.CreateBox("goldband", { width: 18.2, height: 0.25, depth: 0.2 }, sc), 0, 9.9, 0.3, "#d9a632", 0.01);
      for (const x of [-7, 7]) { roof(MeshBuilder.CreateCylinder("pole", { diameter: 0.12, height: 5, tessellation: 5 }, sc), x, top + 2.5, 1, "#c8c4cc", 0.01); roof(MeshBuilder.CreateBox("rflag", { width: 1.8, height: 1.1, depth: 0.05 }, sc), x + 0.95, top + 4.4, 1, x < 0 ? "#d6264a" : "#3d6fb5", 0.015); }
    } else if (name === "GRAND HOTEL") {
      put(MeshBuilder.CreateBox("carpetcanopy", { width: 4, height: 0.35, depth: 4 }, sc), 0, 4.3, 2, "#8a1f2e");
      put(MeshBuilder.CreateBox("canopygold", { width: 4.1, height: 0.12, depth: 4.1 }, sc), 0, 4.1, 2, "#d9a632", 0);
      for (const x of [-1.8, 1.8]) put(MeshBuilder.CreateCylinder("canopypost", { diameter: 0.16, height: 4.1, tessellation: 6 }, sc), x, 2.05, 3.9, "#d9a632", 0.015);
      for (const x of [-3, 0, 3]) flag(x, 7, x === 0 ? "#d9a632" : "#8a1f2e");
      roof(MeshBuilder.CreateBox("crownband", { width: b.w + 0.4, height: 1.2, depth: b.d + 0.4 }, sc), 0, top - 0.6, 0, "#d9a632", 0.03);
    } else if (name === "TRASHCORP HQ") {
      // a giant green trash can on the roof (the company logo)
      roof(MeshBuilder.CreateCylinder("logocan", { diameterTop: 4.6, diameterBottom: 3.6, height: 5, tessellation: 14 }, sc), 0, top + 3.2, 0, "#3f8f4f", 0.06);
      roof(MeshBuilder.CreateCylinder("logolid", { diameter: 5.2, height: 0.5, tessellation: 14 }, sc), 0, top + 6, 0, "#2f6f3f", 0.05).rotation.z = 0.25;
      roof(MeshBuilder.CreateBox("logobase", { width: 5, height: 0.7, depth: 5 }, sc), 0, top + 0.35, 0, "#2b2433", 0.04);
    } else if (name === "LUCKY DUMPSTER CASINO") {
      bulbs(-5.2, 5.2, 4.5, 1.45, 0.65); bulbs(-5.2, 5.2, 5.05, 1.45, 0.65);
      bulbs(-b.w / 2 + 0.3, b.w / 2 - 0.3, top - 0.2, 0.25, 0.8);
      const dice = (x: number, r: number) => { const d = roof(MeshBuilder.CreateBox("dice", { size: 2.4 }, sc), x, top + 1.4, 0, "#f4f1ea", 0.05); d.rotation.set(r, r * 1.3, 0); };
      dice(-3, 0.3); dice(3, -0.5);
    } else if (name === "MUSEUM OF OLD STUFF") {
      put(MeshBuilder.CreateBox("entablature", { width: 11, height: 0.8, depth: 1.8 }, sc), 0, 9.4, 0.7, "#f4f1ea");
      put(prism(11, 2, 1.6), 0, 10.8, 0.7, "#f4f1ea");
      put(MeshBuilder.CreateBox("frieze", { width: b.w, height: 0.5, depth: 0.25 }, sc), 0, top - 1.2, 0.12, "#d9a632", 0.01);
    } else if (name.startsWith("LUXURY MALL")) {
      ["#1b1420", "#d9a632", "#e8e2d4", "#d6264a"].forEach((col, i) => put(MeshBuilder.CreateBox("banner", { width: 1.6, height: 6, depth: 0.08 }, sc), -6.75 + i * 4.5, 9.5, 0.45, col, 0.02));
      put(MeshBuilder.CreateBox("arcade", { width: b.w - 2, height: 0.4, depth: 3 }, sc), 0, 4.4, 1.5, "#e8e2d4");
    } else if (name.startsWith("TRASHINGTON COUNTRY CLUB")) {
      put(MeshBuilder.CreateBox("clubawning", { width: 6, height: 0.2, depth: 2.2 }, sc), 0, 3.3, 1.1, "#2f6f3f");
      for (const x of [-4, 4]) { put(MeshBuilder.CreateSphere("topiary", { diameter: 1.4, segments: 6 }, sc), x, 1.3, 0.9, "#4f8a3a", 0.03); put(MeshBuilder.CreateBox("topiarypot", { size: 0.8 }, sc), x, 0.4, 0.9, "#e8e2d4", 0.02); }
    } else if (name === "THE GILDED PIGEON RESIDENCES") {
      roof(MeshBuilder.CreateBox("goldcrown", { width: b.w + 0.5, height: 1.4, depth: b.d + 0.5 }, sc), 0, top - 0.7, 0, "#d9a632", 0.03);
      // a golden pigeon on the roof, very proud of itself
      roof(MeshBuilder.CreateSphere("pigeonbody", { diameterX: 3, diameterY: 2.6, diameterZ: 4.4, segments: 8 }, sc), 0, top + 1.8, 0, "#e8b83a", 0.05);
      roof(MeshBuilder.CreateSphere("pigeonhead", { diameter: 1.6, segments: 8 }, sc), 0, top + 3.6, -1.6, "#e8b83a", 0.04);
      const beak = roof(MeshBuilder.CreateCylinder("pigeonbeak", { diameterTop: 0, diameterBottom: 0.5, height: 0.8, tessellation: 6 }, sc), 0, top + 3.5, -2.6, "#ff9a3c", 0.02); beak.rotation.x = -Math.PI / 2;
    } else if (name === "MARKET ROW HALL") {
      // a barrel roof: a long cylinder half sunk into the building (the hidden half is inside the walls)
      const arch = roof(MeshBuilder.CreateCylinder("hallroof", { diameter: Math.min(b.d * 0.8, 2 * b.h - 1), height: b.w - 1, tessellation: 18 }, sc), 0, top, 0, "#8a4a3a", 0.05);
      arch.rotation.z = Math.PI / 2;
    } else if (name.startsWith("THE BIJOU")) {
      put(MeshBuilder.CreateBox("marquee", { width: 9, height: 1.4, depth: 2.4 }, sc), 0, 4.2, 1.2, "#2b2433");
      bulbs(-4.3, 4.3, 3.45, 2.42, 0.6); bulbs(-4.3, 4.3, 4.95, 2.42, 0.6);
    } else if (name === "ST. DUMPSTER'S") {
      // a steeple on the bell tower beside it (the tower box sits at -71, 32) and a round window
      const st = MeshBuilder.CreateCylinder("steeple", { diameterTop: 0, diameterBottom: 5.4, height: 7, tessellation: 4 }, sc);
      st.position.set(-71, 29.5, 32); st.rotation.y = Math.PI / 4; this.add(st, "#5a5163", 0.04, false);
      const cross = MeshBuilder.CreateBox("cross", { width: 0.2, height: 1.6, depth: 0.2 }, sc); cross.position.set(-71, 33.8, 32); this.add(cross, "#d9a632", 0.01, false);
      const disc = MeshBuilder.CreateCylinder("rosewin", { diameter: 3, height: 0.15, tessellation: 16 }, sc);
      put(disc, 0, 7, 0.3, "#9f5fd6", 0.03).rotation.set(Math.PI / 2, ry, 0);
    } else if (name === "TRASHINGTON GRAND STATION") {
      for (const t of [-11, -5.5, 0, 5.5, 11]) {
        put(MeshBuilder.CreateBox("archrecess", { width: 3.4, height: 5.5, depth: 0.2 }, sc), t, 3.1, 0.3, "#2b2433", 0.02);
        const a = MeshBuilder.CreateCylinder("archtop", { diameter: 3.4, height: 0.22, tessellation: 12, arc: 0.5 }, sc); a.rotation.x = Math.PI / 2;
        put(a, t, 5.85, 0.3, "#2b2433", 0.02).rotation.set(Math.PI / 2, ry, 0);
      }
    } else if (name === "MARINA OFFICE") {
      put(MeshBuilder.CreateTorus("lifebuoy", { diameter: 1.1, thickness: 0.22, tessellation: 12 }, sc), 0.9, 1.9, 0.2, "#ff5a3c", 0.02).rotation.set(Math.PI / 2, ry, 0);
      put(MeshBuilder.CreateBox("navystripe", { width: fw, height: 0.3, depth: 0.1 }, sc), 0, 2.7, 0.08, "#f4f1ea", 0);
    }
  }

  /**
   * C2: every shop sign is drawn onto a few shared 2048 x 2048 sheets (72 signs a sheet, 512 x 112 each)
   * and the sign planes are merged per sheet: ~5 draw calls for ~300 signs, and a fraction of the
   * texture memory one texture per sign used.
   */
  private buildSignAtlas() {
    const CW = 512, CH = 112, SZ = 2048, PER_ROW = SZ / CW, PER_SHEET = PER_ROW * Math.floor(SZ / CH);
    for (let s0 = 0; s0 < this.atlasSigns.length; s0 += PER_SHEET) {
      const batch = this.atlasSigns.slice(s0, s0 + PER_SHEET);
      const tex = new DynamicTexture("signSheet" + s0, { width: SZ, height: SZ }, this.scene, true);
      const c = tex.getContext() as unknown as CanvasRenderingContext2D;
      c.clearRect(0, 0, SZ, SZ);
      batch.forEach((sg, i) => {
        const x0 = (i % PER_ROW) * CW, y0 = Math.floor(i / PER_ROW) * CH;
        c.fillStyle = sg.bg; c.fillRect(x0, y0, CW, CH);
        c.strokeStyle = "#1b1420"; c.lineWidth = 6; c.strokeRect(x0 + 3, y0 + 3, CW - 6, CH - 6);
        let size = Math.floor(CH * 0.6);
        const font = (px: number) => `bold ${px}px "Bungee", "Arial Black", sans-serif`;
        c.font = font(size);
        while (size > 10 && c.measureText(sg.text).width > CW * 0.9) { size -= 2; c.font = font(size); }
        c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#1b1420";
        c.fillText(sg.text, x0 + CW / 2, y0 + CH / 2 + CH * 0.04);
        // point the plane's UVs at its cell (the texture is flipped: canvas top = v 1)
        const uv = sg.mesh.getVerticesData(VertexBuffer.UVKind);
        if (uv) {
          for (let k = 0; k < uv.length; k += 2) {
            uv[k] = (x0 + uv[k] * CW) / SZ;
            uv[k + 1] = 1 - (y0 + (1 - uv[k + 1]) * CH) / SZ;
          }
          sg.mesh.setVerticesData(VertexBuffer.UVKind, uv);
        }
      });
      tex.update();
      const merged = Mesh.MergeMeshes(batch.map((b) => b.mesh), true, true);
      if (!merged) continue;
      const m = unlitTextured(this.scene, tex, "signSheet");
      m.useAlphaFromDiffuseTexture = false;
      m.zOffset = -4; m.zOffsetUnits = -8;
      merged.material = m;
      ink(merged, 0.05);
      merged.parent = this.root;
      merged.isPickable = false;
      merged.freezeWorldMatrix();
    }
    this.atlasSigns = [];
  }

  private details(b: Box) {
    const sc = this.scene;
    const top = b.y + b.h / 2;
    if (b.kind === "tower") {
      // roof clutter: AC units, a water tower on some, a parapet
      const par = MeshBuilder.CreateBox("parapet", { width: b.w + 0.4, height: 0.6, depth: b.d + 0.4 }, sc);
      par.position.set(b.x, top + 0.3, b.z);
      this.add(par, "#4a4652", 0.05);
      const crowned = this.detail && tierAt(b.z) === 2 && b.h > 30 && Math.min(b.w, b.d) > 5 && b.unit === undefined;
      for (let i = 0; i < (crowned ? 0 : 3); i++) {
        const ac = MeshBuilder.CreateBox("ac", { width: 1.6, height: 1.0, depth: 1.2 }, sc);
        ac.position.set(b.x - b.w / 4 + i * 1.9 * (hash(b.x, i) > 0.5 ? 1 : -0.5), top + 0.5, b.z + (hash(i, b.z) - 0.5) * b.d * 0.5);
        this.add(ac, "#c8c4cc", 0.04);
      }
      if (!crowned && hash(b.x + 3, b.z) > 0.5) {
        const tank = MeshBuilder.CreateCylinder("tank", { diameter: 2.4, height: 2.2, tessellation: 12 }, sc);
        tank.position.set(b.x + b.w / 4, top + 2.4, b.z - b.d / 4);
        this.add(tank, "#8b5a2b", 0.05);
        const cone = MeshBuilder.CreateCylinder("tankroof", { diameterTop: 0, diameterBottom: 2.6, height: 0.9, tessellation: 12 }, sc);
        cone.position.set(b.x + b.w / 4, top + 3.95, b.z - b.d / 4);
        this.add(cone, "#5a3a24", 0.04);
        for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
          const leg = MeshBuilder.CreateBox("tankleg", { width: 0.15, height: 1.3, depth: 0.15 }, sc);
          leg.position.set(b.x + b.w / 4 + lx, top + 0.65, b.z - b.d / 4 + lz);
          this.add(leg, "#3a3444", 0.02);
        }
      }
      // ground-floor lobby band (a darker strip so the base reads as shops/lobby)
      if (b.y - b.h / 2 > 0.5) return;
      const band = MeshBuilder.CreateBox("lobby", { width: b.w + 0.1, height: 4, depth: b.d + 0.1 }, sc);
      band.position.set(b.x, 2.15, b.z);
      this.add(band, tierAt(b.z) === 2 ? "#d8d0c4" : "#3a3444", 0.05); // (C2: polished stone base Uptown)
    } else if (b.kind === "shelf") {
      // products on three shelf levels
      const long = b.d > b.w;
      const len = long ? b.d : b.w;
      const cols = ["#e14b4b", "#ffcf3a", "#43c7a6", "#4f7fd1", "#ff8fa3", "#f4f1ea", "#8a9a5b"];
      const base = b.y - b.h / 2; // (Slice 2A: shelves upstairs too)
      for (const lvl0 of [0.45, 0.95, 1.45]) {
        const lvl = base + lvl0 * (b.h / 1.7);
        const plank = MeshBuilder.CreateBox("plank", { width: long ? b.w + 0.1 : len, height: 0.05, depth: long ? len : b.d + 0.1 }, sc);
        plank.position.set(b.x, lvl - 0.05, b.z);
        this.add(plank, "#6b4a2b", 0.01);
        for (let t = -len / 2 + 0.3; t < len / 2 - 0.2; t += 0.5) { // (Slice 2A: 15 shops, fewer, chunkier products)
          const h = 0.2 + hash(t, lvl0) * 0.2;
          for (const sd of [-1, 1]) {
            const prod = MeshBuilder.CreateBox("prod", { width: long ? 0.36 : 0.22, height: h, depth: long ? 0.22 : 0.36 }, sc);
            prod.position.set(b.x + (long ? sd * (b.w / 2 + 0.05) : t), lvl + h / 2, b.z + (long ? t : sd * (b.d / 2 + 0.05)));
            this.add(prod, cols[Math.floor(hash(t * 3 + sd, lvl0 + b.x) * cols.length)], 0);
          }
        }
      }
    } else if (b.kind === "fridge") {
      const glass = MeshBuilder.CreateBox("fridgeglass", { width: b.w > b.d ? b.w - 0.3 : b.w + 0.04, height: b.h - 0.5, depth: b.w > b.d ? b.d + 0.04 : b.d - 0.3 }, sc);
      glass.position.set(b.x, b.y + 0.1, b.z);
      this.add(glass, "#9fe3ff", 0.01);
    } else if (b.kind === "counter") {
      const topSlab = MeshBuilder.CreateBox("countertop", { width: b.w + 0.2, height: 0.06, depth: b.d + 0.2 }, sc);
      topSlab.position.set(b.x, top + 0.03, b.z);
      this.add(topSlab, "#e8e2d4", 0.02);
    } else if (b.kind === "van") {
      const long = b.w > b.d;
      for (const s of [-1, 1]) for (const e of [-1, 1]) {
        const wheel = MeshBuilder.CreateCylinder("wheel", { diameter: 0.8, height: 0.3, tessellation: 10 }, sc);
        wheel.rotation.set(long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0);
        wheel.position.set(b.x + (long ? e * b.w * 0.33 : s * (b.w / 2)), 0.4, b.z + (long ? s * (b.d / 2) : e * b.d * 0.33));
        this.add(wheel, "#222", 0.02);
      }
      const win = MeshBuilder.CreateBox("vanwin", { width: long ? b.w * 0.3 : b.w + 0.04, height: 0.6, depth: long ? b.d + 0.04 : b.d * 0.3 }, sc);
      win.position.set(b.x + (long ? b.w * 0.3 : 0), top - 0.55, b.z + (long ? 0 : b.d * 0.3));
      this.add(win, "#6fb6d9", 0.02);
    } else if (b.kind === "kiosk") {
      const aw = MeshBuilder.CreateBox("awning", { width: b.w + 0.6, height: 0.12, depth: b.d + 0.6 }, sc);
      aw.position.set(b.x, top + 0.06, b.z);
      aw.rotation.x = 0.05;
      this.add(aw, "#e14b4b", 0.03);
    } else if (b.kind === "fountain") {
      const water = MeshBuilder.CreateCylinder("water", { diameter: b.w * 0.8, height: 0.05, tessellation: 20 }, sc);
      water.position.set(b.x, top + 0.03, b.z);
      this.add(water, "#4fb3ff", 0, false);
      const spout = MeshBuilder.CreateCylinder("spout", { diameter: 0.5, height: 1.2, tessellation: 10 }, sc);
      spout.position.set(b.x, top + 0.6, b.z);
      this.add(spout, "#9aa3b5", 0.03);
    } else if (b.kind === "planter") {
      const bush = MeshBuilder.CreateSphere("bush", { diameter: b.w * 0.9, segments: 8 }, sc);
      bush.position.set(b.x, top + 0.3, b.z);
      bush.scaling.y = 0.7;
      this.add(bush, "#5a9e4b", 0.03);
    } else if (b.kind === "busstop") {
      const roof = MeshBuilder.CreateBox("bsroof", { width: b.w + 0.4, height: 0.1, depth: b.d + 0.8 }, sc);
      roof.position.set(b.x, top, b.z);
      this.add(roof, "#2b4f82", 0.03);
    } else {
      this.details2A(b, top);
    }
  }

  /** Slice 2A fixtures + street clutter: a few extra shapes so each reads at a glance. */
  private details2A(b: Box, top: number) {
    const sc = this.scene, MB = MeshBuilder;
    const long = b.w >= b.d, bottom = b.y - b.h / 2;
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, o = 0.02) => {
      const m = MB.CreateBox("d2a", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); this.add(m, color, o); return m;
    };
    const cols = ["#e14b4b", "#ffcf3a", "#43c7a6", "#4f7fd1", "#ff8fa3", "#f4f1ea", "#8a9a5b"];
    switch (b.kind) {
      case "arcade": {
        // glowing screen + marquee on the side facing the shop's middle (toward smaller |lateral|): both faces, cheap
        for (const s of [-1, 1]) {
          bx(long ? b.w * 0.7 : 0.04, 0.5, long ? 0.04 : b.d * 0.7, b.x + (long ? 0 : s * (b.w / 2 + 0.01)), bottom + 1.3, b.z + (long ? s * (b.d / 2 + 0.01) : 0), cols[Math.floor(hash(b.x, b.z + s) * cols.length)], 0);
        }
        bx(b.w + 0.04, 0.25, b.d + 0.04, b.x, top - 0.15, b.z, "#ff4fb3", 0.01);
        break;
      }
      case "washer": {
        for (const s of [-1, 1]) {
          const door = MB.CreateCylinder("wdoor", { diameter: 0.5, height: 0.04, tessellation: 14 }, sc);
          door.rotation.set(long ? Math.PI / 2 : 0, 0, long ? 0 : Math.PI / 2);
          door.position.set(b.x + (long ? 0 : s * (b.w / 2 + 0.01)), bottom + Math.min(0.55, b.h - 0.4), b.z + (long ? s * (b.d / 2 + 0.01) : 0));
          this.add(door, "#6fb6d9", 0.01);
        }
        break;
      }
      case "rack": {
        // a rail with clothes hanging off it
        const len = long ? b.w : b.d;
        for (let t = -len / 2 + 0.2; t < len / 2 - 0.1; t += 0.28) {
          const c = cols[Math.floor(hash(t, b.x + b.z) * cols.length)];
          bx(long ? 0.12 : 0.45, 0.8, long ? 0.45 : 0.12, b.x + (long ? t : 0), top - 0.55, b.z + (long ? 0 : t), c, 0.005);
        }
        break;
      }
      case "case": {
        bx(b.w + 0.02, 0.35, b.d + 0.02, b.x, top - 0.2, b.z, "#bfe8ff", 0.01);
        for (let i = 0; i < 4; i++) bx(0.12, 0.08, 0.12, b.x + (hash(i, b.x) - 0.5) * b.w * 0.6, top - 0.3, b.z + (hash(b.z, i) - 0.5) * b.d * 0.6, i % 2 ? "#ffcf3a" : "#f4f1ea", 0);
        break;
      }
      case "table": {
        if (b.color) break; // (tinted = a rack / stand)
        bx(b.w + 0.2, 0.06, b.d + 0.2, b.x, top + 0.03, b.z, "#e8e2d4", 0.01);
        break;
      }
      case "chair": {
        bx(long ? b.w : 0.12, 0.7, long ? 0.12 : b.d, b.x, top + 0.35, b.z, "#8e1f2e", 0.02);
        break;
      }
      case "cage": {
        for (let i = 0; i < 3; i++) {
          const along = long ? b.w : b.d;
          const t = -along / 2 + along * (i + 0.5) / 3;
          bx(long ? 0.5 : 0.6, 0.35, long ? 0.6 : 0.5, b.x + (long ? t : 0), top - 0.3, b.z + (long ? 0 : t), cols[i], 0);
        }
        break;
      }
      case "bed": {
        bx(long ? 0.4 : b.w * 0.7, 0.14, long ? b.d * 0.7 : 0.4, b.x + (long ? b.w / 2 - 0.3 : 0), top + 0.07, b.z + (long ? 0 : b.d / 2 - 0.3), "#f4f1ea", 0.01);
        break;
      }
      case "sofa": {
        bx(long ? b.w : 0.25, 0.4, long ? 0.25 : b.d, b.x, top + 0.2, b.z, "#6b3f7a", 0.02);
        break;
      }
      case "desk": {
        bx(0.5, 0.35, 0.06, b.x, top + 0.2, b.z, "#2b2433", 0.01); // monitor
        break;
      }
      case "cooler": {
        const bottle = MB.CreateCylinder("bottle", { diameter: 0.32, height: 0.45, tessellation: 10 }, sc);
        bottle.position.set(b.x, top + 0.22, b.z); this.add(bottle, "#6fc3ff", 0.01);
        break;
      }
      case "gymbench": {
        if (!b.color) bx(long ? b.w * 0.9 : 0.1, 0.9, long ? 0.1 : b.d * 0.9, b.x, top + 0.45, b.z, "#6f6a78", 0.01);
        break;
      }
      case "boxes": {
        bx(b.w + 0.02, 0.06, 0.12, b.x, top, b.z, PALETTE.tape, 0);
        break;
      }
      case "plinth": {
        bx(b.w + 0.3, 0.2, b.d + 0.3, b.x, bottom + 0.1, b.z, "#8e8a94", 0.02);
        break;
      }
      case "hydrant": {
        const cap = MB.CreateSphere("hcap", { diameter: b.w, segments: 6 }, sc); cap.position.set(b.x, top, b.z); this.add(cap, "#d6264a", 0.02);
        break;
      }
      case "bikerack": {
        break;
      }
      case "pot": {
        const bush = MB.CreateSphere("potbush", { diameter: b.w * 1.3, segments: 6 }, sc); bush.position.set(b.x, top + 0.25, b.z); this.add(bush, "#5a9e4b", 0.02);
        break;
      }
      case "bags": {
        for (let i = 0; i < 3; i++) {
          const bag = MB.CreateSphere("bag", { diameter: 0.8, segments: 6 }, sc);
          bag.position.set(b.x + (long ? (i - 1) * 0.7 : 0), bottom + 0.35, b.z + (long ? 0 : (i - 1) * 0.7)); bag.scaling.y = 0.85;
          this.add(bag, i === 1 ? "#1f1a28" : "#2b2433", 0.02);
        }
        break;
      }
      case "portaloo": {
        bx(b.w + 0.1, 0.12, b.d + 0.1, b.x, top + 0.06, b.z, "#2b6fb5", 0.02);
        break;
      }
      case "mixer": {
        const drum = MB.CreateCylinder("drum", { diameterTop: 0.7, diameterBottom: 1.3, height: 1.3, tessellation: 12 }, sc);
        drum.rotation.z = 1.0; drum.position.set(b.x, top + 0.2, b.z); this.add(drum, "#ffcf3a", 0.03);
        break;
      }
      case "trolley": {
        bx(b.w, 0.05, b.d, b.x, bottom + 0.25, b.z, "#6f6a78", 0.01);
        break;
      }
      case "truck": {
        // the taco truck: wheels under the long body, a striped awning over the hatch
        if (b.h > 2.5 && b.d > 4) for (const s of [-1, 1]) for (const e of [-1, 1]) {
          const wheel = MB.CreateCylinder("twheel", { diameter: 0.8, height: 0.3, tessellation: 10 }, sc);
          wheel.rotation.z = Math.PI / 2; wheel.position.set(b.x - 1.2 * s - 0.1, 0.4, b.z + e * 1.8); this.add(wheel, "#222", 0.02);
        }
        if (b.sign) { const aw = bx(0.9, 0.08, 5.2, b.x - 0.5, 2.2, b.z, "#c9442f", 0.02); aw.rotation.z = -0.25; }
        break;
      }
    }
  }

  private tree(b: Box) {
    const trunk = MeshBuilder.CreateCylinder("trunk", { diameter: b.w, height: b.h, tessellation: 8 }, this.scene);
    trunk.position.set(b.x, b.y, b.z);
    this.add(trunk, "#7a4b2a", 0.03);
    const canopy = MeshBuilder.CreateSphere("canopy", { diameter: 3.2, segments: 8 }, this.scene);
    canopy.position.set(b.x, b.y + b.h / 2 + 1, b.z);
    this.add(canopy, "#4f9a55", 0.05);
  }

  /** Tier-1 forts: one battered box with a blanket awning, flag in the owner's colour. */
  private buildForts() {
    for (const f of this.arena.forts ?? []) {
      const color = PLAYER_COLORS[f.slot % PLAYER_COLORS.length];
      const node = new TransformNode("fort" + f.slot, this.scene);
      node.position.set(f.x, 0, f.z);
      node.rotation.y = f.yaw;
      node.parent = this.root;
      const part = (m: Mesh, c: string, o = 0.03) => { m.parent = node; m.material = toon(this.scene, c); ink(m, o); m.isPickable = false; this.shadows?.addShadowCaster(m); m.receiveShadows = true; return m; };
      const box = part(MeshBuilder.CreateBox("fortbox", { width: 2.4, height: 1.5, depth: 1.9 }, this.scene), PALETTE.cardboard);
      box.position.y = 0.75;
      box.rotation.z = 0.03;
      const awning = part(MeshBuilder.CreateBox("awning", { width: 2.8, height: 0.05, depth: 1.4 }, this.scene), PALETTE.blanket);
      awning.position.set(0, 1.75, 1.35);
      awning.rotation.x = 0.35;
      for (const sx of [-1.25, 1.25]) {
        const stick = part(MeshBuilder.CreateCylinder("stick", { diameter: 0.07, height: 1.55 }, this.scene), "#6b4a2b", 0.015);
        stick.position.set(sx, 0.78, 1.95);
      }
      const pole = part(MeshBuilder.CreateCylinder("pole", { diameter: 0.06, height: 1.4 }, this.scene), "#6b4a2b", 0.01);
      pole.position.set(0.9, 2.2, -0.3);
      const flag = part(MeshBuilder.CreateBox("flag", { width: 0.7, height: 0.45, depth: 0.03 }, this.scene), color, 0.015);
      flag.position.set(1.25, 2.65, -0.3);
      // drop pad marking in front (Phase 3 uses it for returning loot)
      const pad = MeshBuilder.CreateGround("pad", { width: 5, height: 4 }, this.scene);
      pad.position.set(f.padX, 0.02, f.padZ);
      pad.rotation.y = f.yaw;
      pad.material = toon(this.scene, color, "pad");
      pad.visibility = 0.5;
      pad.parent = this.root;
      const label = MeshBuilder.CreatePlane("fortlabel", { width: 3.2, height: 0.7 }, this.scene);
      label.parent = node;
      label.position.set(0, 2.2, 1.0);
      label.rotation.y = Math.PI;
      label.material = unlitTextured(this.scene, textTexture(this.scene, PLAYER_COLOR_NAMES[f.slot] + "'S FORT", { w: 1024, h: 220, fg: color, stroke: "#1b1420" }), "fortLabel");
      label.isPickable = false;
      // Phase 3: painted yard boundary. Loot resting inside it banks for this fort after 10 s.
      const z = f.zone;
      const w = z.maxX - z.minX, d = z.maxZ - z.minZ, cx = (z.minX + z.maxX) / 2, cz = (z.minZ + z.maxZ) / 2;
      // (C1.1: bold, on top of Tent Town's ground, with a flag post at each corner: your safe zone)
      for (const [x, zz, sw, sd] of [[cx, z.minZ, w + 0.5, 0.5], [cx, z.maxZ, w + 0.5, 0.5], [z.minX, cz, 0.5, d], [z.maxX, cz, 0.5, d]]) {
        const line = MeshBuilder.CreateBox("yardline", { width: sw, height: 0.03, depth: sd }, this.scene);
        line.position.set(x, 0.17, zz);
        line.material = toon(this.scene, color, "yard");
        line.isPickable = false;
        line.parent = this.root;
      }
      for (const [x, zz] of [[z.minX, z.minZ], [z.maxX, z.minZ], [z.minX, z.maxZ], [z.maxX, z.maxZ]]) {
        const post = MeshBuilder.CreateCylinder("yardpost", { diameter: 0.1, height: 1.8, tessellation: 6 }, this.scene);
        post.position.set(x, 1.05, zz); post.material = toon(this.scene, "#3a3444"); post.parent = this.root; post.isPickable = false;
        const flag = MeshBuilder.CreateBox("yardflag", { width: 0.5, height: 0.32, depth: 0.03 }, this.scene);
        flag.position.set(x + (x < cx ? 0.27 : -0.27), 1.78, zz); flag.material = toon(this.scene, color, "yard"); flag.parent = this.root; flag.isPickable = false;
        ink(flag, 0.015);
      }
    }
  }

  /** Place a mesh at a prop's local offset (x right, z forward, rotated by the prop's yaw). */
  private at(m: Mesh, d: { x: number; y: number; z: number; yaw: number }, lx: number, ly: number, lz: number) {
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    m.position.set(d.x + lx * c + lz * s, d.y + ly, d.z - lx * s + lz * c);
    m.rotation.y = d.yaw;
    return m;
  }

  /** Static bodies of interactable props (the changing bits live in PropRenderer). */
  private buildProps() {
    const sc = this.scene, MB = MeshBuilder;
    for (const d of this.arena.props ?? []) {
      switch (d.kind) {
        case "bin": {
          const can = this.at(MB.CreateCylinder("bin", { diameter: 0.7, height: 0.95, tessellation: 12 }, sc), d, 0, 0.475, 0);
          this.add(can, "#3f6a4f", 0.03);
          const rim = this.at(MB.CreateTorus("binrim", { diameter: 0.7, thickness: 0.06, tessellation: 12 }, sc), d, 0, 0.95, 0);
          this.add(rim, "#2b4a36", 0.01);
          break;
        }
        case "phone": {
          for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) this.add(this.at(MB.CreateBox("post", { width: 0.1, height: 2.3, depth: 0.1 }, sc), d, lx, 1.15, lz), "#2b4f82", 0.02);
          this.add(this.at(MB.CreateBox("roof", { width: 1.2, height: 0.15, depth: 1.2 }, sc), d, 0, 2.35, 0), "#2b4f82", 0.03);
          this.add(this.at(MB.CreateBox("back", { width: 1.0, height: 2.0, depth: 0.06 }, sc), d, 0, 1.1, -0.5), "#bfe8ff", 0.02);
          this.add(this.at(MB.CreateBox("unit", { width: 0.4, height: 0.6, depth: 0.2 }, sc), d, 0, 1.4, -0.38), "#8e8a94", 0.02);
          const sign = this.at(MB.CreatePlane("phsign", { width: 1.0, height: 0.25 }, sc), d, 0, 2.2, 0.62);
          sign.rotation.y = d.yaw + Math.PI;
          sign.material = unlitTextured(sc, textTexture(sc, "PHONE", { w: 256, h: 64, bg: "#2b4f82", fg: "#ffffff" }), "phoneSign");
          sign.parent = this.root;
          break;
        }
        case "vending": {
          this.add(this.at(MB.CreateBox("vend", { width: 1.2, height: 1.9, depth: 0.9 }, sc), d, 0, 0.95, 0), "#d6264a", 0.04);
          this.add(this.at(MB.CreateBox("vendtop", { width: 1.2, height: 0.3, depth: 0.05 }, sc), d, 0, 1.75, 0.46), "#ffe14a", 0);
          this.add(this.at(MB.CreateBox("slot", { width: 0.5, height: 0.2, depth: 0.05 }, sc), d, -0.2, 0.3, 0.46), "#1b1420", 0);
          break;
        }
        case "meter": {
          this.add(this.at(MB.CreateCylinder("pole", { diameter: 0.08, height: 1.0 }, sc), d, 0, 0.5, 0), "#6f6a78", 0.01);
          this.add(this.at(MB.CreateBox("head", { width: 0.28, height: 0.4, depth: 0.2 }, sc), d, 0, 1.15, 0), "#9aa3b5", 0.02);
          this.add(this.at(MB.CreateBox("face", { width: 0.2, height: 0.16, depth: 0.02 }, sc), d, 0, 1.2, 0.11), "#e8e2d4", 0);
          break;
        }
        case "newsbox": {
          this.add(this.at(MB.CreateBox("news", { width: 0.6, height: 0.9, depth: 0.5 }, sc), d, 0, 0.55, 0), "#3d6fb5", 0.03);
          this.add(this.at(MB.CreateBox("newswin", { width: 0.45, height: 0.3, depth: 0.02 }, sc), d, 0, 0.8, 0.26), "#f4f1ea", 0);
          break;
        }
        case "car": {
          for (const [m, color, outline] of buildCarParts(sc, d.color ?? "#d6264a", false)) {
            // parts are built around (0,0,0) facing +z: move them into place
            const lx = m.position.x, ly = m.position.y, lz = m.position.z, ry = m.rotation.y, rz = m.rotation.z;
            this.at(m, d, lx, ly, lz);
            m.rotation.y += ry; m.rotation.z = rz;
            this.add(m, color, outline);
          }
          break;
        }
      }
    }
    // C3: the Golden Mayor of Trashington sits on a golden toilet on top of his column, reading the paper
    const st = this.arena.boxes.find((b) => b.kind === "statue");
    if (st) {
      const base = st.y - st.h / 2, gold = "#d9a632", x = st.x, z = st.z;
      const bowl = MB.CreateCylinder("loobowl", { diameterTop: 1.25, diameterBottom: 0.8, height: 0.75, tessellation: 16 }, sc); bowl.position.set(x, base + 0.38, z);
      const seat = MB.CreateTorus("looseat", { diameter: 1.1, thickness: 0.16, tessellation: 16 }, sc); seat.position.set(x, base + 0.78, z);
      const tank = MB.CreateBox("lootank", { width: 1.1, height: 0.95, depth: 0.42 }, sc); tank.position.set(x, base + 1.2, z + 0.62);
      const lid = MB.CreateBox("lootanklid", { width: 1.2, height: 0.1, depth: 0.5 }, sc); lid.position.set(x, base + 1.72, z + 0.62);
      const flush = MB.CreateBox("looflush", { width: 0.22, height: 0.06, depth: 0.08 }, sc); flush.position.set(x + 0.4, base + 1.55, z + 0.4);
      const body = MB.CreateSphere("stbody", { diameter: 1.05, segments: 10 }, sc); body.position.set(x, base + 1.35, z + 0.05); body.scaling.set(1, 1.1, 0.85);
      const head = MB.CreateSphere("sthead", { diameter: 0.58, segments: 10 }, sc); head.position.set(x, base + 2.12, z);
      const brim = MB.CreateCylinder("stbrim", { diameter: 0.8, height: 0.06, tessellation: 12 }, sc); brim.position.set(x, base + 2.38, z);
      const hat = MB.CreateCylinder("sthat", { diameter: 0.46, height: 0.5, tessellation: 12 }, sc); hat.position.set(x, base + 2.65, z);
      const thighs = MB.CreateBox("stthighs", { width: 0.7, height: 0.3, depth: 0.8 }, sc); thighs.position.set(x, base + 0.95, z - 0.4);
      const shins = MB.CreateBox("stshins", { width: 0.7, height: 0.8, depth: 0.28 }, sc); shins.position.set(x, base + 0.5, z - 0.72);
      const paper = MB.CreateBox("stpaper", { width: 1.0, height: 0.7, depth: 0.04 }, sc); paper.position.set(x, base + 1.45, z - 0.55); paper.rotation.x = -0.35;
      for (const m of [bowl, tank]) this.add(m, "#f4f1ea", 0.04); // (white porcelain, gold fittings, a golden Mayor)
      for (const m of [seat, lid, flush, body, head, brim, hat, thighs, shins]) this.add(m, gold, 0.04);
      this.add(paper, "#f4f1ea", 0.03);
    }
  }

  /** C3: the park's pond (its real pear shape), bushes, the shark fin and the pigeons. */
  private fin: Mesh | null = null;
  private pigeons: { mesh: TransformNode; hx: number; hz: number; x: number; z: number; y: number; vx: number; vy: number; vz: number; flee: number; peck: number }[] = [];
  private buildPark() {
    const sc = this.scene, MB = MeshBuilder;
    const shape = this.arena.pondShape ?? [];
    if (shape.length) {
      const waterMat = new StandardMaterial("pearPond", sc);
      waterMat.diffuseColor = Color3.FromHexString("#3f8fc9"); waterMat.emissiveColor = Color3.FromHexString("#0e2a40");
      waterMat.specularColor = Color3.FromHexString("#ffffff"); waterMat.alpha = 0.82; waterMat.backFaceCulling = false;
      // the outline of the pear, marched out from the middle in every direction (the shape is star-shaped from there)
      const cx = shape.reduce((a, c) => a + c.x, 0) / shape.length, cz = shape.reduce((a, c) => a + c.z, 0) / shape.length;
      const inside = (x: number, z: number) => shape.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
      const outline: [number, number][] = [];
      for (let k = 0; k < 96; k++) {
        const t = (k / 96) * Math.PI * 2, dx = Math.cos(t), dz = Math.sin(t);
        let lo = 0, hi = 12;
        for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (inside(cx + dx * m, cz + dz * m)) lo = m; else hi = m; }
        outline.push([cx + dx * lo, cz + dz * lo]);
      }
      // one flat fan for the water (overlapping discs would show a darker seam) and one for the bed
      const fan = (name: string, y: number) => {
        const m = new Mesh(name, sc), vd = new VertexData();
        const pos = [cx, y, cz], idx: number[] = [], nor = [0, 1, 0], uv = [0.5, 0.5];
        outline.forEach(([x, z]) => { pos.push(x, y, z); nor.push(0, 1, 0); uv.push((x - cx) / 20 + 0.5, (z - cz) / 20 + 0.5); });
        for (let k = 0; k < outline.length; k++) idx.push(0, 1 + k, 1 + ((k + 1) % outline.length));
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.uvs = uv; vd.applyToMesh(m); // (uvs: it's merged with meshes that have them)
        return m;
      };
      const water = fan("pondwater", 0.3);
      water.material = waterMat; water.parent = this.root; water.isPickable = false;
      this.add(fan("pondbed", 0.1), "#2f5a4a", 0, false);
      // the stone rim along the outline
      const path = [...outline, outline[0]].map(([x, z]) => new Vector3(x, 0.2, z));
      const rim = MB.CreateTube("pondrim", { path, radius: 0.22, tessellation: 8, cap: 0 }, sc);
      this.add(rim, "#9aa3b5", 0.02, false);
      // a shark fin circling in the big end (probably cardboard)
      const fin = MB.CreateCylinder("sharkfin", { diameterTop: 0, diameterBottom: 0.7, height: 0.7, tessellation: 3 }, sc);
      fin.scaling.set(0.25, 1, 1); fin.material = toon(sc, "#6f7a91"); ink(fin, 0.02); fin.parent = this.root; fin.isPickable = false;
      this.fin = fin;
    }
    // bushes: clumps of round shrubs (walk into them, crouch, and you're hidden)
    for (const r of this.arena.bushes ?? []) {
      const x = (r.minX + r.maxX) / 2, z = (r.minZ + r.maxZ) / 2, w = r.maxX - r.minX;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + hash(x, z), rr = i === 0 ? 0 : w * 0.28;
        const b = MB.CreateSphere("bush", { diameter: w * (i === 0 ? 0.75 : 0.55), segments: 7 }, sc);
        b.position.set(x + Math.cos(a) * rr, 0.55 + (i === 0 ? 0.25 : 0), z + Math.sin(a) * rr); b.scaling.y = 0.8;
        this.add(b, i % 2 ? "#3f7a3a" : "#4f8a3a", 0.03, false);
      }
    }
    // pigeons round the fountain (just for looks: every screen has its own flock)
    const pigeonBody = toon(sc, "#8a94a8"), pigeonHead = toon(sc, "#5a6478");
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash(i, 3), r = 4.5 + hash(i, 9) * 3;
      const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
      if (shape.some((c) => Math.hypot(hx - c.x, hz - c.z) < c.r + 1)) continue;
      const node = new TransformNode("pigeon", sc); node.parent = this.root;
      const body = MB.CreateSphere("pbody", { diameterX: 0.22, diameterY: 0.2, diameterZ: 0.32, segments: 6 }, sc); body.material = pigeonBody; body.parent = node; body.position.y = 0.13;
      const head = MB.CreateSphere("phead", { diameter: 0.13, segments: 6 }, sc); head.material = pigeonHead; head.parent = node; head.position.set(0, 0.26, 0.14);
      for (const m of [body, head]) { ink(m, 0.012); m.isPickable = false; }
      node.position.set(hx, 0, hz); node.rotation.y = hash(i, 5) * 6.28;
      this.pigeons.push({ mesh: node, hx, hz, x: hx, z: hz, y: 0, vx: 0, vy: 0, vz: 0, flee: 0, peck: hash(i, 7) * 3 });
    }
  }

  /** C3: pigeons scatter when someone comes close (walking: 2.5 m, running: 6 m), then drift back. */
  updatePark(dt: number, threats: { x: number; z: number; speed: number }[]) {
    const t = performance.now() / 1000;
    if (this.fin) {
      const c = (this.arena.pondShape ?? [])[0];
      const a = t * 0.6;
      this.fin.position.set(c.x + Math.cos(a) * c.r * 0.55, 0.45 + Math.sin(t * 3) * 0.04, c.z + Math.sin(a) * c.r * 0.55);
      this.fin.rotation.y = -a;
    }
    for (const p of this.pigeons) {
      if (p.flee <= 0) {
        for (const th of threats) {
          const d = Math.hypot(th.x - p.x, th.z - p.z);
          if (d < (th.speed > 6 ? 6 : 2.5)) {
            const ax = (p.x - th.x) / (d || 1), az = (p.z - th.z) / (d || 1);
            p.vx = ax * 5 + (Math.random() - 0.5) * 2; p.vz = az * 5 + (Math.random() - 0.5) * 2; p.vy = 3 + Math.random() * 1.5;
            p.flee = 6 + Math.random() * 4;
            this.scatters++;
            break;
          }
        }
      }
      if (p.flee > 0) {
        p.flee -= dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.min(9, p.y + p.vy * dt);
        if (p.flee <= 0) { p.x = p.hx + (Math.random() - 0.5); p.z = p.hz + (Math.random() - 0.5); p.y = 0; } // (they come back when nobody's looking)
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        p.mesh.rotation.z = Math.sin(t * 30) * 0.3; // (flapping)
      } else {
        p.mesh.rotation.z = 0;
        p.peck -= dt;
        if (p.peck < 0) { p.peck = 1 + Math.random() * 3; p.mesh.rotation.y += (Math.random() - 0.5) * 1.5; }
      }
      p.mesh.position.set(p.x, p.y, p.z);
      const head = p.mesh.getChildMeshes(true)[1];
      if (head) head.position.y = p.flee <= 0 && p.peck < 0.3 ? 0.16 : 0.26;
    }
  }
  /** C3: how many times a pigeon took off (tests) */
  scatters = 0;
  get pigeonCount() { return this.pigeons.length; }
  get pigeonsFlying() { return this.pigeons.filter((p) => p.flee > 0).length; }

  /** Slice 2A: per-building extras: awning, neon OPEN sign, posters and ceiling lights inside. */
  private buildShops() {
    const sc = this.scene;
    const posters = ["SALE: EVERYTHING", "NO LOITERING (PLEASE)", "SMILE, YOU'RE ON CAMERA", "EMPLOYEE OF THE MONTH: NOBODY", "SHOPLIFTERS WILL BE YELLED AT", "NO REFUNDS. NO REGRETS."];
    for (const u of this.arena.units ?? []) {
      const [nx, nz] = u.out, rx = -nz, rz = nx;
      const P = (du: number, dv: number, y: number): [number, number, number] => [u.doorX + rx * du - nx * dv, y, u.doorZ + rz * du - nz * dv];
      const yawOut = Math.atan2(nx, nz);
      if (u.use === "closed") {
        // roller shutter
        this.group = -1;
        const sh = MeshBuilder.CreateBox("shutter", { width: Math.abs(nx) > 0.5 ? 0.1 : 12, height: 3, depth: Math.abs(nx) > 0.5 ? 12 : 0.1 }, sc);
        const [x, y, z] = P(0, -0.05, 1.6); sh.position.set(x, y, z);
        this.add(sh, "#8e8a94", 0.02);
        continue;
      }
      // awning over the door (outside, always drawn)
      this.group = -1;
      const awn = MeshBuilder.CreateBox("awning", { width: 5.0, height: 0.1, depth: 1.5 }, sc);
      { const [x, y, z] = P(0, -0.75, 3.35); awn.position.set(x, y, z); awn.rotation.y = yawOut; awn.rotation.x = 0.2; }
      this.add(awn, u.wallColor, 0.03);
      if (u.use === "shop") {
        const neon = unlitTextured(sc, textTexture(sc, "OPEN", { w: 256, h: 96, fg: "#ff4fb3", stroke: "#1b1420" }), "neon");
        const p = MeshBuilder.CreatePlane("neon", { width: 1.2, height: 0.45 }, sc);
        const [x, y, z] = P(4.2, 0.25, 2.5); p.position.set(x, y, z); p.rotation.y = yawOut + Math.PI; p.material = neon; p.parent = this.root; p.isPickable = false;
      }
      // inside (drawn only when you're near): ceiling lights + posters
      this.group = u.id;
      for (const dv of [3, 8]) {
        const l = MeshBuilder.CreateBox("ceilLight", { width: Math.abs(nx) > 0.5 ? 0.3 : 8, height: 0.08, depth: Math.abs(nx) > 0.5 ? 8 : 0.3 }, sc);
        const [x, y, z] = P(0, dv, 4.4); l.position.set(x, y, z);
        this.add(l, "#fffbe0", 0, false);
      }
      for (const [i, du] of [[0, -7.2], [1, 7.2]] as const) {
        const p = MeshBuilder.CreatePlane("poster", { width: 2.4, height: 0.8 }, sc);
        const [x, y, z] = P(du, 6, 3.0); p.position.set(x, y, z);
        p.rotation.y = yawOut + (du < 0 ? -Math.PI / 2 : Math.PI / 2);
        p.material = unlitTextured(sc, textTexture(sc, posters[(u.id + i) % posters.length], { w: 1024, h: 256, bg: "#ffe14a", fg: "#1b1420" }), "poster");
        p.parent = this.root; p.isPickable = false;
        (this.unitPlanes.get(u.id) ?? this.unitPlanes.set(u.id, []).get(u.id)!).push(p);
      }
    }
    this.group = -1;
  }

  /** Lane paint, zebra crossings, street lights, park grass. */
  private buildDecor() {
    const sc = this.scene;
    for (const d of this.arena.decor ?? []) {
      if (d.kind === "dash") {
        const m = MeshBuilder.CreateGround("dash", { width: 0.25, height: 2.5 }, sc);
        m.position.set(d.x, 0.015, d.z); m.rotation.y = d.yaw ?? 0;
        this.add(m, "#e8d56a", 0, false);
      } else if (d.kind === "zebra") {
        // stripes run the way pedestrians walk (yaw); stepped along the road
        const yaw = d.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (let i = -1.5; i <= 1.5; i += 1) {
          const m = MeshBuilder.CreateGround("zebra", { width: 0.55, height: 7.2 }, sc);
          m.position.set(d.x + rx * i, 0.02, d.z + rz * i);
          m.rotation.y = yaw;
          this.add(m, "#f4f1ea", 0, false);
        }
      } else if (d.kind === "streetlight") {
        const pole = MeshBuilder.CreateCylinder("lamppole", { diameter: 0.14, height: 5.2, tessellation: 8 }, sc);
        pole.position.set(d.x, 2.75, d.z);
        this.add(pole, "#3a3444", 0.02);
        const lamp = MeshBuilder.CreateBox("lamp", { width: 0.7, height: 0.2, depth: 0.35 }, sc);
        lamp.position.set(d.x, 5.35, d.z);
        this.add(lamp, "#fff1b0", 0.02, false);
      } else if (d.kind === "copcar") {
        // parked cruiser outside the station (lights off)
        const pose = { x: d.x, y: 0, z: d.z, yaw: d.yaw ?? 0 };
        for (const [m, color, outline] of [...buildCopCarParts(sc), ...buildCopLights(sc).map((l) => [l, "#3a3f55", 0.01] as [Mesh, string, number])]) {
          const lx = m.position.x, ly = m.position.y, lz = m.position.z, rz = m.rotation.z;
          this.at(m, pose, lx, ly, lz);
          m.rotation.z = rz;
          this.add(m, color, outline);
        }
      } else if (d.kind === "grass") {
        const g = MeshBuilder.CreateGround("grass", { width: d.w ?? 10, height: d.d ?? 10 }, sc);
        g.position.set(d.x, d.h ?? 0.012, d.z);
        this.add(g, "#6aa84f", 0, false);
      } else if (d.kind === "cone") {
        const c = MeshBuilder.CreateCylinder("cone", { diameterTop: 0.05, diameterBottom: 0.4, height: 0.7, tessellation: 10 }, sc);
        c.position.set(d.x, 0.5, d.z); this.add(c, PALETTE.cone, 0.02);
      } else if (d.kind === "wetfloor") {
        const inUnit = (this.arena.units ?? []).find((u) => d.x >= u.rect.minX - 0.5 && d.x <= u.rect.maxX + 0.5 && d.z >= u.rect.minZ - 0.5 && d.z <= u.rect.maxZ + 0.5);
        this.group = inUnit ? inUnit.id : -1;
        const a = MeshBuilder.CreateBox("wet", { width: 0.45, height: 0.6, depth: 0.04 }, sc);
        a.position.set(d.x, 0.48, d.z); a.rotation.y = d.yaw ?? 0; a.rotation.x = 0.2;
        this.add(a, "#ffcf3a", 0.01);
        this.group = -1;
      } else if (d.kind === "umbrella") {
        const pole = MeshBuilder.CreateCylinder("upole", { diameter: 0.05, height: 2.2, tessellation: 6 }, sc);
        pole.position.set(d.x, 1.25, d.z); this.add(pole, "#e8e2d4", 0.01);
        const top = MeshBuilder.CreateCylinder("utop", { diameterTop: 0.1, diameterBottom: 2.0, height: 0.45, tessellation: 8 }, sc);
        top.position.set(d.x, 2.4, d.z); this.add(top, hash(d.x, d.z) > 0.5 ? "#e14b4b" : "#43c7a6", 0.02);
      } else if (d.kind === "scaffold") {
        // poles + planks up the side of a building (Slice 2B makes it climbable)
        const yaw = d.yaw ?? 0, w = d.w ?? 12, h = d.h ?? 12;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (let t = -w / 2; t <= w / 2 + 0.01; t += w / 4) {
          const pole = MeshBuilder.CreateCylinder("spole", { diameter: 0.08, height: h, tessellation: 6 }, sc);
          pole.position.set(d.x + rx * t, h / 2, d.z + rz * t); this.add(pole, "#8e8a94", 0.01);
        }
        for (let y = 2; y < h; y += 2.2) {
          const plank = MeshBuilder.CreateBox("splank", { width: Math.abs(rx) > 0.5 ? w : 0.9, height: 0.08, depth: Math.abs(rx) > 0.5 ? 0.9 : w }, sc);
          plank.position.set(d.x, y, d.z); this.add(plank, PALETTE.cardboardDark, 0.01);
        }
      }
    }
  }

  /** C1: traffic-light lamps (red / amber / green per approach), recoloured every frame from the light clock */
  private lamps: { node: number; approach: number; red: StandardMaterial; amber: StandardMaterial; green: StandardMaterial; state: string }[] = [];

  /** C1 scenery: the park lawn inside the roundabout, railway tracks, traffic lights, the station clock. */
  private buildScenery() {
    const sc = this.scene, MB = MeshBuilder;
    for (const d of this.arena.scenery ?? []) {
      if (d.kind === "grassdisc") {
        const prom = MB.CreateDisc("promenade", { radius: d.r ?? 20, tessellation: 64 }, sc);
        prom.rotation.x = Math.PI / 2; prom.position.set(d.x, 0.02, d.z);
        this.add(prom, "#c9bfa8", 0, false);
        const lawn = MB.CreateDisc("lawn", { radius: d.h ?? 15, tessellation: 64 }, sc);
        lawn.rotation.x = Math.PI / 2; lawn.position.set(d.x, 0.035, d.z);
        this.add(lawn, "#6aa84f", 0, false);
        const kerb = MB.CreateTorus("kerb", { diameter: (d.r ?? 20) * 2, thickness: 0.35, tessellation: 64 }, sc);
        kerb.position.set(d.x, 0.08, d.z); kerb.scaling.y = 0.4;
        this.add(kerb, "#9aa3b5", 0.01, false);
      } else if (d.kind === "rail") {
        const len = d.d ?? 50;
        for (const off of [-0.72, 0.72]) {
          const rail = MB.CreateBox("rail", { width: 0.1, height: 0.14, depth: len }, sc);
          rail.position.set(d.x + off, 0.22, d.z); this.add(rail, "#8e8a94", 0.01, false);
        }
        for (let t = -len / 2 + 0.4; t < len / 2; t += 0.9) {
          const sl = MB.CreateBox("sleeper", { width: 2.2, height: 0.08, depth: 0.28 }, sc);
          sl.position.set(d.x, 0.17, d.z + t); this.add(sl, "#6b4a2b", 0, false);
        }
      } else if (d.kind === "lamp") {
        // C3: an old-fashioned park lamp
        const pole = MB.CreateCylinder("parklamp", { diameterTop: 0.1, diameterBottom: 0.18, height: 3.4, tessellation: 8 }, sc);
        pole.position.set(d.x, 1.7, d.z); this.add(pole, "#2b3a2b", 0.015, false);
        const globe = MB.CreateSphere("parkglobe", { diameter: 0.5, segments: 8 }, sc);
        globe.position.set(d.x, 3.6, d.z); this.add(globe, "#fff2b0", 0.015, false);
        const cap = MB.CreateCylinder("parklampcap", { diameterTop: 0.05, diameterBottom: 0.5, height: 0.25, tessellation: 8 }, sc);
        cap.position.set(d.x, 3.95, d.z); this.add(cap, "#2b3a2b", 0.01, false);
      } else if (d.kind === "light") {
        const yaw = d.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
        const pole = MB.CreateCylinder("tlpole", { diameter: 0.16, height: 4.2, tessellation: 8 }, sc);
        pole.position.set(d.x, 2.1, d.z); this.add(pole, "#3a3444", 0.02);
        const head = MB.CreateBox("tlhead", { width: 0.45, height: 1.3, depth: 0.35 }, sc);
        head.position.set(d.x, 4.0, d.z); head.rotation.y = yaw; this.add(head, "#2b2433", 0.03);
        const mk = (name: string, y: number) => {
          const m = MB.CreateDisc("tl" + name, { radius: 0.14, tessellation: 12 }, sc);
          // (faces the cars coming toward it)
          m.position.set(d.x + fx * 0.27, y, d.z + fz * 0.27); m.rotation.y = yaw + Math.PI; // (clear of the head's ink outline)
          const mat = new StandardMaterial("tlMat" + name, sc); mat.disableLighting = true;
          m.material = mat; m.parent = this.root; m.isPickable = false;
          return mat;
        };
        const lamp = { node: d.node ?? 0, approach: d.approach ?? 0, red: mk("r", 4.4), amber: mk("a", 4.0), green: mk("g", 3.6), state: "" };
        this.lamps.push(lamp);
      } else if (d.kind === "ladder") {
        // two rails and rungs down the quay wall (the way out of the canal)
        const yaw = d.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (const s of [-0.35, 0.35]) {
          const rail = MB.CreateBox("ladrail", { width: 0.06, height: 1.5, depth: 0.06 }, sc);
          rail.position.set(d.x + rx * s, 0.6, d.z + rz * s); this.add(rail, "#d9a632", 0.01);
        }
        for (let y = 0.2; y < 1.3; y += 0.3) {
          const rung = MB.CreateBox("ladrung", { width: Math.abs(rx) > 0.5 ? 0.7 : 0.05, height: 0.05, depth: Math.abs(rx) > 0.5 ? 0.05 : 0.7 }, sc);
          rung.position.set(d.x, y, d.z); this.add(rung, "#d9a632", 0.01);
        }
      } else if (d.kind === "clock") {
        const face = MB.CreatePlane("clock", { width: 4, height: 4 }, sc);
        face.position.set(d.x + Math.sin(d.yaw ?? 0) * 0.05, d.h ?? 20, d.z + Math.cos(d.yaw ?? 0) * 0.05);
        face.rotation.y = (d.yaw ?? 0) + Math.PI;
        face.material = unlitTextured(sc, textTexture(sc, "XII  III  VI  IX", { w: 256, h: 256, bg: "#f4f1ea", fg: "#1b1420" }), "clockMat");
        ink(face, 0.06); face.parent = this.root; face.isPickable = false;
      }
    }
    this.updateLights(0);
  }

  /** Test hook: every traffic light's current colour. */
  lampStates() { return this.lamps.map((l) => l.state); }

  /** C1: set the traffic lights from the (synced) light clock. */
  updateLights(t: number) {
    const net = this.arena.roadNet;
    if (!net) return;
    const on = { red: Color3.FromHexString("#ff3b3b"), amber: Color3.FromHexString("#ffb13b"), green: Color3.FromHexString("#3bff7a") };
    const off = Color3.FromHexString("#2b2433");
    for (const l of this.lamps) {
      const st = lightState(net, l.node, l.approach, t);
      if (st === l.state) continue;
      l.state = st;
      l.red.emissiveColor = st === "red" ? on.red : off;
      l.amber.emissiveColor = st === "amber" ? on.amber : off;
      l.green.emissiveColor = st === "green" ? on.green : off;
    }
  }

  /** Parody billboards: clearly fictional, never clickable, never ask for money. */
  private buildAds() {
    const ads = [
      { text: "CRUNCHO+ PREMIUM ULTRA", bg: "#ffe14a", fg: "#d6264a", at: [40, 14, 113], ry: 0 },
      { text: "TRASHFLIX: NOW WITH MORE TRASH", bg: "#1f1f2e", fg: "#ff4a6e", at: [113, 14, -40], ry: Math.PI / 2 },
      { text: "BOXLY: IT'S A BOX", bg: "#43c7a6", fg: "#1b1420", at: [-40, 14, -113], ry: Math.PI },
      { text: "VOTE NOBODY FOR MAYOR", bg: "#f3e2b8", fg: "#3b3f8f", at: [-113, 14, 40], ry: -Math.PI / 2 },
      { text: "LAWYERS 4 LESS: WE MIGHT WIN", bg: "#f4f1ea", fg: "#1b1420", at: [-40, 14, 113], ry: 0 },
      { text: "HOTEL ADEQUATE: IT HAS BEDS", bg: "#ff8fa3", fg: "#1b1420", at: [113, 14, 40], ry: Math.PI / 2 },
    ];
    for (const ad of ads) {
      const board = MeshBuilder.CreatePlane("ad", { width: 16, height: 4 }, this.scene);
      board.position.set(ad.at[0], ad.at[1], ad.at[2]);
      board.rotation.y = ad.ry; // front faces the city centre
      board.material = unlitTextured(this.scene, textTexture(this.scene, ad.text, { w: 1024, h: 256, bg: ad.bg, fg: ad.fg }), "adMat");
      ink(board, 0.1);
      board.parent = this.root;
      for (const s of [-5, 5]) {
        const leg = MeshBuilder.CreateBox("adleg", { width: 0.3, height: ad.at[1] - 2, depth: 0.3 }, this.scene);
        const lx = ad.ry === 0 || ad.ry === Math.PI ? ad.at[0] + s : ad.at[0];
        const lz = ad.ry === 0 || ad.ry === Math.PI ? ad.at[2] : ad.at[2] + s;
        leg.position.set(lx, (ad.at[1] - 2) / 2, lz);
        leg.parent = this.root;
        leg.material = toon(this.scene, "#3a3444");
      }
    }
  }
}

