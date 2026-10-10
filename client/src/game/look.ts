// Shared "look" helpers: toon materials + thick outlines. This is the start of the
// Box Fort Banditz art style; it will be refined in the art/polish phases.
import { CellMaterial, Color3, DynamicTexture, Mesh, VertexBuffer, type Scene, type TransformNode, StandardMaterial } from "./babylon.ts";
import { tierAt, type ArenaLayout } from "@bfb/shared";

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

// C5a: the city map. One drawing, used twice: painted on the squat's water tank (the lobby), and the
// M-key map you can open during a match (with you, your friends and the forts on it).

export interface MapMarker { x: number; z: number; color: string; label?: string; yaw?: number; me?: boolean;
  /** C5c.1 WANTED: a rough area (metres) instead of an exact arrow; the stars and bounty line under the name */
  area?: number; wanted?: string }

const TIER_FILL = ["#a0826a", "#c9b08a", "#e6dcc4"];
const TIER_BLDG = ["#6e4a3a", "#8a6f55", "#b8ab94"];
/** District names and where to write them */
const DISTRICTS: [string, number, number][] = [
  ["UPTOWN", 0, 94], ["MARKET ROW", 60, 34], ["OLD BRICK", -72, 22], ["THE YARDS", -24, -70],
  ["TENT TOWN", 0, -104], ["RAIL YARD", -105, 30], ["CANAL", 105, 30], ["THE PARK", 0, 0],
];
/** Places worth knowing (from the layout, where they are) */
const POI: [string, (a: ArenaLayout) => { x: number; z: number } | null][] = [
  ["City Hall", () => ({ x: 0, z: 79 })],
  ["Casino", () => ({ x: 69.5, z: 68 })],
  ["Police", (a) => a.station ? { x: (a.station.rect.minX + a.station.rect.maxX) / 2, z: (a.station.rect.minZ + a.station.rect.maxZ) / 2 } : null],
  ["The Pit", (a) => { const b = a.blocks?.find((q) => q.name.startsWith("The Pit")); return b ? { x: (b.rect.minX + b.rect.maxX) / 2, z: (b.rect.minZ + b.rect.maxZ) / 2 } : null; }],
  ["Laundromat", (a) => { const u = a.units?.find((q) => q.name === "SPIN CYCLE"); return u ? { x: u.x, z: u.z } : null; }],
  ["Market Hall", () => ({ x: 55, z: 0 })],
  ["Chinatown", (a) => a.chinatown ? { x: 81, z: 0 } : null],
  ["Skyscraper", () => ({ x: 47, z: -72 })],
  ["Bank", (a) => a.bank ? { x: (a.bank.rect.minX + a.bank.rect.maxX) / 2, z: (a.bank.rect.minZ + a.bank.rect.maxZ) / 2 } : null],
  ["Mayor Statue", (a) => a.statue ? { x: a.statue.x, z: a.statue.z } : null],
  ["Le Dumpstere", (a) => a.resto ? { x: (a.resto.rect.minX + a.resto.rect.maxX) / 2, z: (a.resto.rect.minZ + a.resto.rect.maxZ) / 2 } : null],
  ["The Compactor", (a) => a.club ? { x: (a.club.rect.minX + a.club.rect.maxX) / 2, z: (a.club.rect.minZ + a.club.rect.maxZ) / 2 } : null],
  ["Pawn-O-Rama", (a) => a.pawnShop && a.units?.[a.pawnShop.unit] ? { x: a.units[a.pawnShop.unit].x, z: a.units[a.pawnShop.unit].z } : null],
];

/** R3: where the roundabout's name goes on the map (just inside its south edge) */
const RING_LABEL = 25.7;
/** the POIs at fixed spots (classic city only) */
const FIXED_POI = new Set(["City Hall", "Casino", "Market Hall", "Skyscraper"]);

/**
 * Draw the city onto a 2D canvas: north (+z) up. `size` px square, the city fills it with a margin.
 * `painted`: the hand-painted look for the water tank (thicker lines, a wobbly frame, no markers).
 */
export function drawCityMap(c: CanvasRenderingContext2D, arena: ArenaLayout, size: number, opts: { painted?: boolean; markers?: MapMarker[]; extraSouth?: number } = {}) {
  const H = arena.halfSize, south = opts.extraSouth ?? 0;
  const span = H * 2 + south, m = size * 0.04, k = (size - m * 2) / span;
  const X = (x: number) => m + (x + H) * k, Z = (z: number) => m + (H - z) * k;
  const rect = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => [X(r.minX), Z(r.maxZ), (r.maxX - r.minX) * k, (r.maxZ - r.minZ) * k] as const;
  c.save();
  c.fillStyle = opts.painted ? "#2b2530" : "rgba(24,20,30,0.92)";
  c.fillRect(0, 0, size, size);
  // ground by tier
  for (let t = 0; t < 3; t++) {
    const z0 = t === 0 ? -H : t === 1 ? -46 : 46, z1 = t === 0 ? -46 : t === 1 ? 46 : H;
    c.fillStyle = TIER_FILL[t];
    c.fillRect(X(-H), Z(z1), H * 2 * k, (z1 - z0) * k);
  }
  // water
  c.fillStyle = "#4f9fd9";
  for (const r of arena.deepWater ?? []) c.fillRect(...rect(r));
  for (const s of arena.pondShape ?? []) { c.beginPath(); c.arc(X(s.x), Z(s.z), s.r * k, 0, Math.PI * 2); c.fill(); }
  // grass (the park lawn and the garden)
  c.fillStyle = "#6fae4f";
  for (const d of arena.decor ?? []) if (d.kind === "grass" && d.w && d.d) c.fillRect(X(d.x - d.w / 2), Z(d.z + d.d / 2), d.w * k, d.d * k);
  for (const s of arena.scenery ?? []) if (s.kind === "grassdisc" && s.r) { c.beginPath(); c.arc(X(s.x), Z(s.z), s.r * k, 0, Math.PI * 2); c.fill(); }
  // roads
  c.fillStyle = opts.painted ? "#3a3444" : "#4a4452";
  for (const r of arena.roads ?? []) c.fillRect(...rect(r));
  c.strokeStyle = c.fillStyle;
  for (const g of arena.roadRings ?? []) { c.lineWidth = (g.r1 - g.r0) * k; c.beginPath(); c.arc(X(g.x), Z(g.z), ((g.r0 + g.r1) / 2) * k, 0, Math.PI * 2); c.stroke(); }
  for (const g of arena.roadSegs ?? []) { c.lineWidth = g.hw * 2 * k; c.beginPath(); c.moveTo(X(g.ax), Z(g.az)); c.lineTo(X(g.bx), Z(g.bz)); c.stroke(); } // (R2: diagonals)
  // buildings
  for (const b of arena.boxes) {
    if ((b.kind !== "building" && b.kind !== "tower") || b.y - b.h / 2 > 1 || Math.abs(b.z) > H || Math.abs(b.x) > H) continue;
    c.fillStyle = b.kind === "tower" ? "#5b5566" : TIER_BLDG[tierAt(b.z)];
    if (b.poly) { c.beginPath(); b.poly.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.closePath(); c.fill(); continue; } // (R3: angled)
    c.fillRect(X(b.x - b.w / 2), Z(b.z + b.d / 2), b.w * k, b.d * k);
  }
  // forts
  (arena.forts ?? []).forEach((f, i) => {
    c.fillStyle = ["#ff5a3c", "#43c7a6", "#ffe14a", "#9f5fd6"][i % 4];
    c.fillRect(X(f.x) - 4 * k, Z(f.z) - 4 * k, 8 * k, 8 * k);
  });
  // labels
  const font = (px: number) => `bold ${Math.round(px)}px "Bungee", "Arial Black", sans-serif`;
  // R4: the two themed streets
  if (arena.variant) for (const [name, d, col] of [["LITTLE ITALY", arena.littleItaly, "#7fe0a0"], ["CHINATOWN", arena.chinatown, "#ff9a8a"]] as const) {
    if (!d) continue;
    const S = d.street, cx = (S.minX + S.maxX) / 2, cz = (S.minZ + S.maxZ) / 2;
    c.save(); c.translate(X(cx), Z(cz)); c.rotate(-Math.PI / 2);
    c.font = `bold ${Math.round(size * 0.022)}px "Bungee", "Arial Black", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = size * 0.006; c.strokeStyle = "#1b1420"; c.strokeText(name, 0, -size * 0.022); c.fillStyle = col; c.fillText(name, 0, -size * 0.022);
    c.restore();
  }
  // R7: the two pawn shops and the police station
  if (arena.variant && arena.hotShops?.length) {
    c.font = `bold ${Math.round(size * 0.014)}px "Bungee", "Arial Black", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = size * 0.005; c.strokeStyle = "#1b1420";
    for (const h of arena.hotShops) { const r = h.rect, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, t = h.idx ? "FINDERS $" : "HOT STUFF $"; c.strokeText(t, X(cx), Z(cz)); c.fillStyle = h.idx ? "#7aff6b" : "#ff7a3c"; c.fillText(t, X(cx), Z(cz)); }
    if (arena.station) { const s2 = arena.station.rect; c.strokeText("PD", X((s2.minX + s2.maxX) / 2), Z((s2.minZ + s2.maxZ) / 2)); c.fillStyle = "#8fb4ff"; c.fillText("PD", X((s2.minX + s2.maxX) / 2), Z((s2.minZ + s2.maxZ) / 2)); }
  }
  // R3: every road's name, written along it once (on its longest straight stretch)
  if (arena.variant && arena.roadNet) {
    const net = arena.roadNet, best = new Map<string, { ax: number; az: number; bx: number; bz: number; l: number }>();
    for (const e of net.edges) {
      if (!e.name) continue;
      const A = net.nodes[e.a], B = net.nodes[e.b];
      const l = e.arc ? 0 : Math.hypot(B.x - A.x, B.z - A.z);
      const cur = best.get(e.name);
      if (!cur || l > cur.l) best.set(e.name, { ax: A.x, az: A.z, bx: B.x, bz: B.z, l });
    }
    c.save();
    c.textAlign = "center"; c.textBaseline = "middle";
    for (const [name, g] of best) {
      if (g.l === 0) { // (the roundabout)
        c.font = font(size * 0.016); c.lineWidth = size * 0.004; c.strokeStyle = "#1b1420"; c.fillStyle = "#c9f7d8";
        c.strokeText(name.toUpperCase(), X(0), Z(-RING_LABEL)); c.fillText(name.toUpperCase(), X(0), Z(-RING_LABEL));
        continue;
      }
      let ang = Math.atan2(Z(g.bz) - Z(g.az), X(g.bx) - X(g.ax));
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI; // (never upside down)
      c.save(); c.translate(X((g.ax + g.bx) / 2), Z((g.az + g.bz) / 2)); c.rotate(ang);
      let px = size * 0.017;
      c.font = font(px);
      while (px > 6 && c.measureText(name.toUpperCase()).width > g.l * k * 0.9) { px -= 1; c.font = font(px); }
      c.lineWidth = size * 0.004; c.strokeStyle = "#1b1420"; c.strokeText(name.toUpperCase(), 0, 0);
      c.fillStyle = "#c9f7d8"; c.fillText(name.toUpperCase(), 0, 0);
      c.restore();
    }
    c.restore();
  }
  c.textAlign = "center"; c.textBaseline = "middle";
  c.lineJoin = "round";
  // (R2: the road test has none of the classic city's districts or hand-placed landmarks)
  for (const [name, x, z] of arena.variant ? DISTRICTS.filter(([n]) => n === "TENT TOWN" || n === "THE PARK") : DISTRICTS) {
    c.save(); c.translate(X(x), Z(z));
    if (Math.abs(x) > 100) c.rotate(x < 0 ? -Math.PI / 2 : Math.PI / 2); // (the rail yard and the canal: written along them)
    c.font = font(size * 0.034);
    c.lineWidth = size * 0.008; c.strokeStyle = "#1b1420"; c.strokeText(name, 0, 0);
    c.fillStyle = "#fff4c2"; c.fillText(name, 0, 0);
    c.restore();
  }
  for (const [name, at] of POI) {
    if (arena.variant && FIXED_POI.has(name)) continue;
    const p = at(arena);
    if (!p) continue;
    c.fillStyle = "#ff5a3c";
    c.beginPath(); c.arc(X(p.x), Z(p.z), size * 0.008, 0, Math.PI * 2); c.fill();
    c.font = font(size * 0.02);
    c.lineWidth = size * 0.005; c.strokeStyle = "#1b1420"; c.strokeText(name, X(p.x), Z(p.z) - size * 0.02);
    c.fillStyle = "#ffffff"; c.fillText(name, X(p.x), Z(p.z) - size * 0.02);
  }
  // the squat, off the south edge (the painted map says YOU ARE HERE)
  if (arena.lobby && south > 0) {
    const L = arena.lobby;
    c.fillStyle = "#6e4a3a"; c.fillRect(...rect(L.rect));
    c.font = font(size * 0.022); c.fillStyle = "#ffe14a";
    c.fillText(opts.painted ? "YOU ARE HERE" : "THE SQUAT", X(0), Z(L.rect.minZ) + size * 0.03);
  }
  // players
  for (const mk of opts.markers ?? []) {
    const x = X(mk.x), y = Z(mk.z), r = size * (mk.me ? 0.018 : 0.013);
    if (mk.area) { // (C5c.1: 1-2 stars: somewhere round here)
      c.save(); c.globalAlpha = 0.28; c.fillStyle = "#ff3b30"; c.beginPath(); c.arc(x, y, mk.area * k, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.9; c.setLineDash([6, 5]); c.strokeStyle = "#ff3b30"; c.lineWidth = 2; c.stroke(); c.restore();
      c.font = font(size * 0.018); c.fillStyle = "#fff"; c.fillText(mk.label ?? "", x, y - size * 0.006);
      if (mk.wanted) { c.fillStyle = "#ffd54a"; c.fillText(mk.wanted, x, y + size * 0.018); }
      continue;
    }
    if (mk.wanted) { c.save(); c.strokeStyle = "#ff3b30"; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r * 2.2, 0, Math.PI * 2); c.stroke(); c.restore(); }
    c.save(); c.translate(x, y); c.rotate(mk.yaw ?? 0);
    c.fillStyle = mk.color; c.strokeStyle = "#1b1420"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -r * 1.4); c.lineTo(r, r); c.lineTo(0, r * 0.4); c.lineTo(-r, r); c.closePath(); c.fill(); c.stroke();
    c.restore();
    if (mk.label) { c.font = font(size * 0.018); c.fillStyle = "#fff"; c.fillText(mk.label, x, y + r * 2.2 + (mk.wanted ? r * 0.8 : 0)); }
    if (mk.wanted) { c.font = font(size * 0.018); c.fillStyle = "#ffd54a"; c.fillText(mk.wanted, x, y + r * 2.2 + size * 0.022); }
  }
  // a north arrow and a frame
  c.font = font(size * 0.03); c.fillStyle = "#fff4c2"; c.fillText("N", size - m * 1.2 - size * 0.02, m + size * 0.03);
  c.strokeStyle = opts.painted ? "#fff4c2" : "#ffe14a"; c.lineWidth = opts.painted ? size * 0.012 : 3;
  c.strokeRect(m * 0.5, m * 0.5, size - m, size - m);
  c.restore();
}
