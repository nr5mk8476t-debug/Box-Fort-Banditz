// Shared "look" helpers: toon materials + thick outlines. This is the start of the
// Box Fort Banditz art style; it will be refined in the art/polish phases.
import { CellMaterial, Color3, DynamicTexture, Mesh, VertexBuffer, type Scene, type TransformNode, StandardMaterial } from "./babylon.ts";

const cache = new Map<string, CellMaterial>();

/** Cel-shaded material (hard light/shadow bands = cartoon look). Cached per colour. */
export function toon(scene: Scene, hex: string, name = "toon"): CellMaterial {
  const key = scene.uid + hex + name;
  let m = cache.get(key);
  if (!m) {
    m = new CellMaterial(`${name}-${hex}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.computeHighLevel = true;
    cache.set(key, m);
  }
  return m;
}

export const OUTLINE = Color3.FromHexString("#1b1420");

/** Thick dark outline around a mesh (the "inked" cartoon edge). */
export function ink(mesh: Mesh, width = 0.035): Mesh {
  mesh.renderOutline = true;
  mesh.outlineColor = OUTLINE;
  mesh.outlineWidth = width;
  return mesh;
}

/**
 * Performance helper for animated characters: merges all meshes directly under `node`
 * into ONE mesh that keeps each part's colour (baked as vertex colours) and moves with
 * `node`. Cuts a pedestrian from ~25 draw calls (+25 outline passes) to ~7.
 * Call once right after building, while the character is still at the origin.
 */
export function bakeGroup(scene: Scene, node: TransformNode, outline = 0.022): Mesh | null {
  // only plain toon-coloured parts (textured decals like signs keep their own mesh)
  const parts = node.getChildMeshes(true).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0 && !m.billboardMode && m.material instanceof CellMaterial && m.visibility === 1);
  if (parts.length === 0) return null;
  // make sure every world matrix in the chain is current (the parts are baked in world space)
  let top: TransformNode = node;
  while (top.parent) top = top.parent as TransformNode;
  top.computeWorldMatrix(true);
  for (const d of top.getDescendants(false)) (d as TransformNode).computeWorldMatrix?.(true);
  for (const m of parts) {
    const c = (m.material as CellMaterial | null)?.diffuseColor ?? Color3.White();
    const n = m.getTotalVertices();
    const cols = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1; }
    m.setVerticesData(VertexBuffer.ColorKind, cols);
  }
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) return null;
  merged.material = toon(scene, "#ffffff", "vc");
  merged.useVertexColors = true;
  merged.isPickable = false;
  merged.setParent(node);
  if (outline > 0) ink(merged, outline);
  return merged;
}

/** Colour palette: bright but a bit grimy. */
export const PALETTE = {
  cardboard: "#c9955b",
  cardboardDark: "#a8743f",
  tape: "#e8d9a8",
  asphalt: "#4a4652",
  sidewalk: "#9c96a0",
  brick: "#b3553f",
  teal: "#3d8f8a",
  mustard: "#d9a632",
  grape: "#6b4c9a",
  blanket: "#4f7fd1",
  cone: "#ff7a1f",
  skin: "#f0b98a",
  greyA: "#8e8a94",
  greyB: "#a9a4ad",
  greyC: "#6f6a78",
};

/** A text texture for signs/name tags. */
export function textTexture(scene: Scene, text: string, opts: {
  w?: number; h?: number; bg?: string; fg?: string; font?: string; stroke?: string;
} = {}): DynamicTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const tex = new DynamicTexture("txt-" + text, { width: w, height: h }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, w, h);
  if (opts.bg) {
    c.fillStyle = opts.bg;
    c.fillRect(0, 0, w, h);
  }
  // Shrink the font until the text fits (long bandit names must never be cut off)
  let size = Math.floor(h * 0.62);
  const fontFor = (px: number) => opts.font ?? `bold ${px}px "Bungee", "Arial Black", sans-serif`;
  c.font = fontFor(size);
  while (!opts.font && size > 10 && c.measureText(text).width > w * 0.92) {
    size -= 2;
    c.font = fontFor(size);
  }
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (opts.stroke) {
    c.lineWidth = h * 0.1;
    c.strokeStyle = opts.stroke;
    c.lineJoin = "round";
    c.strokeText(text, w / 2, h / 2 + h * 0.04);
  }
  c.fillStyle = opts.fg ?? "#fff";
  c.fillText(text, w / 2, h / 2 + h * 0.04);
  tex.hasAlpha = !opts.bg;
  tex.update();
  return tex;
}

/** Unlit material showing a texture (signs, name tags, windows). */
export function unlitTextured(scene: Scene, tex: DynamicTexture, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.disableLighting = true;
  m.useAlphaFromDiffuseTexture = tex.hasAlpha;
  m.backFaceCulling = false;
  return m;
}
