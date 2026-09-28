// Draws Trashington from the shared layout (the same boxes the game rules collide with).
// PLACEHOLDER-QUALITY ART built from simple shapes, but deliberately styled: toon shading,
// ink outlines, grimy-bright colours, shop signs, parody ads, windows.
// Performance: static meshes are merged by material, so the whole city is a few dozen draw calls.
import {
  Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture, VertexBuffer,
  type ShadowGenerator,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, lightState, type ArenaLayout, type Box } from "@bfb/shared";
import { buildCarParts, buildCopCarParts, buildCopLights } from "./carModel.ts";

const BUILDING_COLORS = [PALETTE.brick, PALETTE.teal, PALETTE.mustard, PALETTE.grape, "#7b6d8d", "#c26b4a", "#5c7a9e", "#8a9a5b"];

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
const TOWER_COLORS = ["#5c7a9e", "#7b6d8d", "#3d8f8a", "#8a9a5b", "#a86a4a", "#6b6f86", "#4f6b7a", "#9a7b5c"];

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

  constructor(private scene: Scene, private arena: ArenaLayout, private shadows: ShadowGenerator | null) {
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

    for (const b of arena.boxes) {
      if (b.kind === "fort") continue; // forts drawn separately (they will evolve in Phase 7)
      if (PROP_BOX_KINDS.has(b.kind)) continue;
      this.group = b.unit ?? -1;
      if (b.kind === "glass") {
        // Slice 2A: big see-through shop windows (they still block you)
        const g = MeshBuilder.CreateBox("glass", { width: b.w, height: b.h, depth: b.d }, scene);
        g.position.set(b.x, b.y, b.z);
        glassPanes.push(g);
        const sill = MeshBuilder.CreateBox("sill", { width: b.w + 0.06, height: 0.35, depth: b.d + 0.1 }, scene);
        sill.position.set(b.x, b.y - b.h / 2 + 0.175, b.z);
        this.add(sill, "#3a3444", 0.02);
        continue;
      }
      const color = b.color ?? (b.kind === "building" ? BUILDING_COLORS[Math.floor(hash(b.x, b.z) * BUILDING_COLORS.length)]
        : b.kind === "tower" ? TOWER_COLORS[Math.floor(hash(b.z, b.x) * TOWER_COLORS.length)] : KIND_COLOR[b.kind] ?? PALETTE.greyA);
      if (b.kind === "tree") { this.tree(b); continue; }
      if (b.kind === "bars") { this.bars(b, color); continue; }
      const m = MeshBuilder.CreateBox("b", { width: b.w, height: b.h, depth: b.d }, scene);
      m.position.set(b.x, b.y, b.z);
      const flat = b.kind === "sidewalk" || b.kind === "curb" || b.kind === "plaza" || b.kind === "shopfloor";
      this.add(m, color, flat ? (b.kind === "shopfloor" ? 0 : 0.02) : b.kind === "tower" ? 0.08 : 0.05, !flat);
      if ((b.kind === "building" || b.kind === "tower") && b.windows) windowPlanes.push(...this.windows(b));
      if (b.sign) this.sign(b);
      this.details(b);
    }
    this.group = -1;
    if (glassPanes.length) {
      const merged = Mesh.MergeMeshes(glassPanes, true, true);
      if (merged) {
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
    if (windowPlanes.length) {
      const merged = Mesh.MergeMeshes(windowPlanes, true, true);
      if (merged) { merged.material = winMat; merged.parent = this.root; merged.isPickable = false; }
    }
    this.buildForts();
    this.buildAds();
    this.flush();
  }

  /** Queue a static mesh for merging (grouped by colour). */
  private add(m: Mesh, color: string, outline = 0.04, castShadow = true) {
    if (this.group >= 0) castShadow = false; // interiors: no shadow casting (they're drawn on and off)
    const key = color + "|" + outline + "|" + (castShadow ? 1 : 0) + "|" + this.group;
    (this.byMaterial.get(key) ?? this.byMaterial.set(key, []).get(key)!).push(m);
    m.isPickable = false;
  }

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
        const merged = chunk.length > 1 ? Mesh.MergeMeshes(chunk, true, true) : chunk[0];
        if (!merged) continue;
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
    for (const r of this.arena.water ?? []) {
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
      if ((r.maxX - r.minX) * (r.maxZ - r.minZ) > 300) continue;
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

  /** Window planes on all four sides of a building (UVs scaled so windows are a constant size). */
  private windows(b: Box): Mesh[] {
    const out: Mesh[] = [];
    const top = b.y + b.h / 2;
    const grounded = b.y - b.h / 2 < 0.5;
    const h = b.kind === "tower" && grounded ? b.h - 5.2 : b.h - 1.2; // towers: lobby band at street level
    if (h < 1.5) return out;
    const cy = top - 0.5 - h / 2;
    const faces: [number, number, number, number, number][] = [
      // x, z, rotY, width, offset axis
      [b.x, b.z - b.d / 2 - WIN_OFF, 0, b.w - 1, 0],
      [b.x, b.z + b.d / 2 + WIN_OFF, Math.PI, b.w - 1, 0],
      [b.x - b.w / 2 - WIN_OFF, b.z, Math.PI / 2, b.d - 1, 0],
      [b.x + b.w / 2 + WIN_OFF, b.z, -Math.PI / 2, b.d - 1, 0],
    ];
    for (const [x, z, ry, w] of faces) {
      if (w < 1.5) continue;
      const p = MeshBuilder.CreatePlane("win", { width: w, height: h }, this.scene);
      p.position.set(x, cy, z);
      p.rotation.y = ry;
      scaleUVs(p, Math.max(1, Math.round(w / 1.6)) / 4, Math.max(1, Math.round(h / 2.2)) / 4);
      out.push(p);
    }
    return out;
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
    if (b.kind === "board") w = 0.9;
    if (b.face && b.kind === "wall" && b.h > 3) w = 5;
    else if (b.face && b.kind === "wall") w = Math.min(w, (b.h + 0.3) / 0.22);
    const p = MeshBuilder.CreatePlane("sign", { width: w, height: w * (b.kind === "board" ? 0.9 : 0.22) }, this.scene);
    const y = b.kind === "board" ? 0.6 : b.face && b.kind === "building" ? top - 0.9 : b.face && b.kind !== "truck" ? b.y : b.kind === "truck" ? 2.55 : b.kind === "roof" ? top - 0.9 : b.kind === "tower" ? 5.5 : b.kind === "plinth" ? 0.6 : Math.min(top - 0.6, 2.9);
    const off = b.kind === "board" || b.kind === "plinth" ? 0.03 : b.kind === "truck" ? 0.12 : 0.34;
    p.position.set(b.x + nx * (b.w / 2 + off), y, b.z + nz * (b.d / 2 + off)); // in front of the window planes
    p.rotation.y = Math.atan2(-nx, -nz);
    const bg = ["#f3e2b8", "#ffe14a", "#43c7a6", "#ff8fa3", "#9fe3ff"][Math.floor(hash(b.x, b.z) * 5)];
    p.material = b.kind === "board"
      ? unlitTextured(this.scene, textTexture(this.scene, b.sign!, { w: 256, h: 230, bg: "#2b2433", fg: "#f4f1ea" }), "boardMat")
      : unlitTextured(this.scene, textTexture(this.scene, b.sign!, { w: 1024, h: 220, bg, fg: "#1b1420" }), "signMat");
    p.material.zOffset = -4; p.material.zOffsetUnits = -8; // beats the (biased) windows behind it
    ink(p, 0.05);
    p.parent = this.root;
    p.isPickable = false;
  }

  private details(b: Box) {
    const sc = this.scene;
    const top = b.y + b.h / 2;
    if (b.kind === "tower") {
      // roof clutter: AC units, a water tower on some, a parapet
      const par = MeshBuilder.CreateBox("parapet", { width: b.w + 0.4, height: 0.6, depth: b.d + 0.4 }, sc);
      par.position.set(b.x, top + 0.3, b.z);
      this.add(par, "#4a4652", 0.05);
      for (let i = 0; i < 3; i++) {
        const ac = MeshBuilder.CreateBox("ac", { width: 1.6, height: 1.0, depth: 1.2 }, sc);
        ac.position.set(b.x - b.w / 4 + i * 1.9 * (hash(b.x, i) > 0.5 ? 1 : -0.5), top + 0.5, b.z + (hash(i, b.z) - 0.5) * b.d * 0.5);
        this.add(ac, "#c8c4cc", 0.04);
      }
      if (hash(b.x + 3, b.z) > 0.5) {
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
      this.add(band, "#3a3444", 0.05);
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
      for (const [x, zz, sw, sd] of [[cx, z.minZ, w, 0.22], [cx, z.maxZ, w, 0.22], [z.minX, cz, 0.22, d], [z.maxX, cz, 0.22, d]]) {
        const line = MeshBuilder.CreateBox("yardline", { width: sw, height: 0.03, depth: sd }, this.scene);
        line.position.set(x, 0.035, zz);
        line.material = toon(this.scene, color, "yard");
        line.isPickable = false;
        line.parent = this.root;
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
    // Slice 2A: the plaza statue is the Mayor of Trashington (a pompous gent in a top hat, for now)
    const st = this.arena.boxes.find((b) => b.kind === "statue");
    if (st) {
      const base = st.y - st.h / 2, gold = "#d9a632";
      const legs = MB.CreateBox("stlegs", { width: 0.7, height: 1.0, depth: 0.4 }, sc); legs.position.set(st.x, base + 0.5, st.z);
      const body = MB.CreateSphere("stbody", { diameter: 1.15, segments: 10 }, sc); body.position.set(st.x, base + 1.45, st.z); body.scaling.set(1, 1.15, 0.85);
      const head = MB.CreateSphere("sthead", { diameter: 0.62, segments: 10 }, sc); head.position.set(st.x, base + 2.25, st.z);
      const brim = MB.CreateCylinder("stbrim", { diameter: 0.85, height: 0.06, tessellation: 12 }, sc); brim.position.set(st.x, base + 2.52, st.z);
      const hat = MB.CreateCylinder("sthat", { diameter: 0.5, height: 0.55, tessellation: 12 }, sc); hat.position.set(st.x, base + 2.82, st.z);
      const arm = MB.CreateCylinder("starm", { diameter: 0.2, height: 0.9, tessellation: 8 }, sc); arm.position.set(st.x + 0.55, base + 1.9, st.z - 0.1); arm.rotation.z = -2.3;
      for (const m of [legs, body, head, brim, hat, arm]) this.add(m, gold, 0.04);
    }
  }

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

