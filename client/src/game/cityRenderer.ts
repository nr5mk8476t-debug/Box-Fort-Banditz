// Draws Trashington from the shared layout (the same boxes the game rules collide with).
// PLACEHOLDER-QUALITY ART built from simple shapes, but deliberately styled: toon shading,
// ink outlines, grimy-bright colours, shop signs, parody ads, windows.
// Performance: static meshes are merged by material, so the whole city is a few dozen draw calls.
import {
  Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture, VertexBuffer, Vector3, VertexData, Quaternion,
  type ShadowGenerator,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured, drawCityMap } from "./look.ts";
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, lightState, tierAt, TIER_WALLS, TIER_TOWERS, CLUB, clubFloorY, clubStage, feverAt, footFaces, HOT_PLOT, type ArenaLayout, type Box } from "@bfb/shared";
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
/** C5c: a triangular prism (a pediment, a gable): base centred on the origin, apex up, ridge along z */
function prism(sc: Scene, w: number, h: number, d: number): Mesh {
  const x = w / 2, z = d / 2;
  const faces: number[][][] = [
    [[-x, 0, -z], [0, h, -z], [x, 0, -z]], [[x, 0, z], [0, h, z], [-x, 0, z]],
    [[-x, 0, -z], [-x, 0, z], [0, h, z], [0, h, -z]], [[x, 0, -z], [0, h, -z], [0, h, z], [x, 0, z]],
    [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]],
  ];
  const pos: number[] = [], ind: number[] = [];
  for (const f of faces) { const b = pos.length / 3; for (const v of f) pos.push(...v); for (let i = 1; i < f.length - 1; i++) ind.push(b, b + i, b + i + 1); }
  const norms: number[] = []; VertexData.ComputeNormals(pos, ind, norms);
  const vd = new VertexData(); vd.positions = pos; vd.indices = ind; vd.normals = norms; vd.uvs = new Array((pos.length / 3) * 2).fill(0);
  const m = new Mesh("prism", sc); vd.applyToMesh(m); return m;
}
/** C5c: a cartoon Mayor (round face, top hat, big moustache) for the portrait and the WANTED screen */
function drawMayorFace(c: CanvasRenderingContext2D, x: number, y: number, r: number, skin: string) {
  c.save();
  c.fillStyle = skin; c.strokeStyle = "#1b1420"; c.lineWidth = r * 0.06;
  c.beginPath(); c.ellipse(x, y + r * 0.1, r * 0.95, r * 0.85, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(x, y + r * 0.72, r * 0.7, r * 0.3, 0, 0, Math.PI); c.fill(); c.stroke(); // (chins)
  c.fillStyle = "#1b1420"; c.fillRect(x - r * 0.95, y - r * 0.72, r * 1.9, r * 0.14); c.fillRect(x - r * 0.55, y - r * 1.55, r * 1.1, r * 0.9);
  c.fillStyle = "#c0282a"; c.fillRect(x - r * 0.55, y - r * 0.85, r * 1.1, r * 0.14);
  for (const s of [-1, 1]) { c.fillStyle = "#fff"; c.beginPath(); c.arc(x + s * r * 0.35, y - r * 0.15, r * 0.16, 0, Math.PI * 2); c.fill(); c.fillStyle = "#1b1420"; c.beginPath(); c.arc(x + s * r * 0.33, y - r * 0.12, r * 0.07, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = "#ffd54a"; c.beginPath(); c.ellipse(x, y + r * 0.12, r * 0.16, r * 0.2, 0, 0, Math.PI * 2); c.fill(); c.stroke(); // (the gold nose, naturally)
  c.fillStyle = "#6b3f22"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * r * 0.3, y + r * 0.38, r * 0.34, r * 0.12, s * 0.35, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

/** Slice 2A: interiors are drawn only when the camera is this close to the building. */
export const INTERIOR_DRAW_DIST = 42;
/** Props are drawn by buildProps (static body here, changing parts in PropRenderer). */
const PROP_BOX_KINDS = new Set<Box["kind"]>(["bin", "phone", "vending", "meter", "newsbox", "car", "statue", "steamer", "fishtank", "trinkets", "pizzacart", "gelato", "ricordi", "deli", "vaultdoor", "depositbox"]);

// ---- C2: each tier has its own materials ----
// low (south): grimy brick; medium: painted render; high (Uptown): stone walls + glass towers
/** trim (cornices, sills, lintels) per tier */
const TIER_TRIM = ["#5a3a2e", "#f4ecd8", "#f2eee4"];
const AWNING_COLORS = [["#d6264a", "#f4f1ea"], ["#2f8f5a", "#f4f1ea"], ["#3d6fb5", "#f4f1ea"], ["#e8a13a", "#6b3a1e"], ["#6b4c9a", "#ffe14a"], ["#1b1420", "#ff8fa3"]];

/** R5: wall-material plane lists (drawn first, under the windows) */
const WALL_KINDS = new Set<string>(["brick", "render", "stone", "paint", "concrete", "tile", "corrugated", "clapboard", "roof", "roofLight", "wallpaper", "subway"]);
type WallKind = "brick" | "render" | "stone" | "paint" | "concrete" | "tile" | "corrugated" | "clapboard";
/** each material's tile size (m) */
const WALL_TILE: Record<WallKind, number> = { brick: 2, render: 4, stone: 3, paint: 2, concrete: 4, tile: 2, corrugated: 2, clapboard: 2 };
/** R5: which walls each tier gets (weights) */
const TIER_WALL_MIX: [WallKind, number][][] = [
  [["brick", 0.36], ["paint", 0.16], ["corrugated", 0.12], ["concrete", 0.16], ["clapboard", 0.2]],
  [["render", 0.3], ["brick", 0.2], ["clapboard", 0.14], ["tile", 0.16], ["paint", 0.2]],
  [["stone", 0.42], ["concrete", 0.3], ["tile", 0.28]],
];
const TIER_WIN_MIX: [string, number][][] = [
  [["windows", 0.3], ["winBoarded", 0.22], ["winBlinds", 0.2], ["winCurtain", 0.28]],
  [["winShutter", 0.3], ["winArched", 0.22], ["winCurtain", 0.26], ["windows", 0.22]],
  [["winBlinds", 0.5], ["winArched", 0.2], ["windows", 0.3]],
];
const pickMix = <T,>(mix: [T, number][], v: number): T => { let t = 0; const tot = mix.reduce((a, [, w]) => a + w, 0); for (const [k, w] of mix) { t += w / tot; if (v < t) return k; } return mix[mix.length - 1][0]; };
/** R5: funny names for the little shops on ground floors that weren't given one (cartoon parody only) */
const FAKE_SHOPS = ["BAGELS & BEAGLES", "KNOCK-OFF WATCHES", "SOCKS N STUFF", "DISCOUNT SOUP", "NAIL IT", "PHONE BONES", "WIGS WIGS WIGS", "TOTALLY LEGIT CASH",
  "PIZZA BY THE INCH", "USED MATTRESS WORLD", "DOLLAR DOLLAR", "CRUMBS BAKERY", "LAUNDRO-MAAAT", "VAPE ABOVE IT", "PET ROCKS", "GOLD 4 CASH 4 GOLD", "TAXIDERMY TIM",
  "NOODLE ME THIS", "SPEEDY KEYS", "THRIFTY THREADS", "BEEF JERKY HUT", "SHOE GOO", "MANNEQUIN MADNESS", "CHEAP ANTIQUES", "PRETZEL LOGIC", "VIDEO RENTALS (STILL)",
  "BAIT & TACKLE & CAKE", "FAKE PLANTS", "LOST & FOUND & SOLD", "DENTIST?", "TUXEDO RENTALS", "MYSTERY MEAT DELI", "CELL PHONE CASES", "DONUT WORRY", "RAT TRAP DEPOT"];

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
        // (R5: stronger: every brick a touch lighter or darker, a few chipped)
        if (v < 0.3) { c.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.14})`; c.fillRect(x + off + 2, y + 2, brickW - 3, rowH - 3); }
        else if (v > 0.78) { c.fillStyle = `rgba(255,230,200,${0.08 + r() * 0.12})`; c.fillRect(x + off + 2, y + 2, brickW - 3, rowH - 3); }
        c.fillStyle = "rgba(30,20,30,0.42)";
        c.fillRect(x + off, y, 2, rowH);
      }
      c.fillStyle = "rgba(30,20,30,0.42)";
      c.fillRect(0, y, 256, 2);
    }
    // soot streaks running down
    for (let i = 0; i < 5; i++) { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "rgba(20,15,25,0.18)"); g.addColorStop(1, "rgba(20,15,25,0)"); c.fillStyle = g; c.fillRect(r() * 240, 0, 6 + r() * 12, 120 + r() * 136); }
  });
}

// ---- R5: more wall materials, so no two neighbours look alike (all are see-through overlays on the wall's colour) ----
/** whitewashed brick, the paint peeling off in patches (1 tile = 2 x 2 m) */
function paintedBrickTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    c.fillStyle = "rgba(255,250,240,0.42)"; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) { c.fillStyle = "rgba(60,50,60,0.18)"; c.fillRect(0, y, 256, 2); const off = (y / 16) % 2 ? 21 : 0; for (let x = off; x < 256; x += 42) c.fillRect(x, y, 2, 16); }
  });
}
/** big cast concrete panels with tie holes and rust stains (1 tile = 4 x 4 m) */
function concreteTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    c.fillStyle = "rgba(40,36,44,0.4)"; c.fillRect(0, 0, 256, 3); c.fillRect(0, 128, 256, 3); c.fillRect(0, 0, 3, 256); c.fillRect(128, 0, 3, 256);
  });
}
/** small glazed tiles with dark grout and a shine (1 tile = 2 x 2 m) */
function tileTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
      const v = r(); c.fillStyle = v < 0.2 ? "rgba(0,0,0,0.12)" : v > 0.85 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0)"; c.fillRect(x + 2, y + 2, 28, 28);
      c.fillStyle = "rgba(255,255,255,0.22)"; c.fillRect(x + 5, y + 5, 10, 3);
    }
    c.fillStyle = "rgba(30,26,34,0.45)"; for (let k = 0; k < 256; k += 32) { c.fillRect(k, 0, 2, 256); c.fillRect(0, k, 256, 2); }
  });
}
/** R10: big floor tiles, 2 x 2 per texture: a little shade per tile, a soft sheen, dark grout */
function floorTileTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let y = 0; y < 256; y += 128) for (let x = 0; x < 256; x += 128) {
      const v = r(); c.fillStyle = v < 0.35 ? "rgba(0,0,0,0.07)" : v > 0.7 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0)"; c.fillRect(x, y, 128, 128);
      c.fillStyle = "rgba(255,255,255,0.07)"; c.beginPath(); c.moveTo(x + 14, y + 128); c.lineTo(x + 54, y + 128); c.lineTo(x + 128, y + 54); c.lineTo(x + 128, y + 14); c.fill();
      for (let k = 0; k < 18; k++) { c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)"; c.fillRect(x + r() * 124, y + r() * 124, 2, 2); }
    }
    c.fillStyle = "rgba(38,36,46,0.55)"; for (const k of [0, 128]) { c.fillRect(k, 0, 3, 256); c.fillRect(0, k, 256, 3); }
  });
}
/** corrugated metal, rusting at the seams (1 tile = 2 x 2 m) */
function corrugatedTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let x = 0; x < 256; x += 16) { const g = c.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, "rgba(0,0,0,0.28)"); g.addColorStop(0.5, "rgba(255,255,255,0.18)"); g.addColorStop(1, "rgba(0,0,0,0.28)"); c.fillStyle = g; c.fillRect(x, 0, 16, 256); }
    c.fillStyle = "rgba(30,26,34,0.4)"; c.fillRect(0, 126, 256, 4);
  });
}
/** painted wooden clapboard, the shadow under each board, a few bare planks (1 tile = 2 x 2 m) */
function clapboardTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    for (let y = 0; y < 256; y += 21) {
      const g = c.createLinearGradient(0, y, 0, y + 21); g.addColorStop(0, "rgba(255,255,255,0.12)"); g.addColorStop(0.8, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)"); c.fillStyle = g; c.fillRect(0, y, 256, 21);
    }
  });
}
/** soot and rain: dark at the foot of the wall, streaks running down from the roof (stretched over the whole wall) */
function grimeTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    const g = c.createLinearGradient(0, 256, 0, 196); g.addColorStop(0, "rgba(25,20,28,0.45)"); g.addColorStop(1, "rgba(25,20,28,0)"); c.fillStyle = g; c.fillRect(0, 196, 256, 60);
    const t = c.createLinearGradient(0, 0, 0, 26); t.addColorStop(0, "rgba(25,20,28,0.35)"); t.addColorStop(1, "rgba(25,20,28,0)"); c.fillStyle = t; c.fillRect(0, 0, 256, 26);
  });
}
/** a tar-and-gravel roof (opaque; 1 tile = 3 x 3 m); light = pale gravel */
function roofTexture(scene: Scene, light = false) {
  return canvasTexture(scene, 128, (c, r) => {
    c.fillStyle = light ? "#b4aca0" : "#86808c"; c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 600; i++) { const v = r(); c.fillStyle = light ? (v > 0.66 ? "#bab2a4" : v > 0.33 ? "#aea698" : "#b0a89a") : v > 0.66 ? "#8c8692" : v > 0.33 ? "#7e7884" : "#88828e"; c.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); } // (R6: subtle: no spotty look)
    c.fillStyle = "rgba(20,18,24,0.35)"; c.fillRect(0, 62, 128, 3); c.fillRect(62, 0, 3, 128);
  });
}
/** a roller shutter, pulled down over a shut shop, sprayed with tags (opaque; 1 tile = 4 x 2.8 m) */
function shutterTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
    c.fillStyle = "#8e96a8"; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 10) { c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(0, y, 256, 3); c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, y + 7, 256, 3); }
    const tags = ["#ff6fb5", "#7aff6b", "#ffd54a", "#43c7a6", "#ff5a3c", "#9f5fd6"];
    for (let i = 0; i < 5; i++) {
      c.save(); c.translate(20 + r() * 200, 60 + r() * 150); c.rotate((r() - 0.5) * 0.5);
      c.strokeStyle = "#1b1420"; c.lineWidth = 9; c.lineCap = "round"; c.fillStyle = tags[Math.floor(r() * tags.length)];
      c.font = `bold ${26 + Math.floor(r() * 20)}px 'Luckiest Guy', Impact, sans-serif`;
      const word = ["BOX", "TRASH", "LOU", "OI", "BANDITZ", "NOPE", "MEAT", "RAT", "YO"][Math.floor(r() * 9)];
      c.strokeText(word, 0, 0); c.fillText(word, 0, 0); c.restore();
    }
    c.fillStyle = "#3a3444"; c.fillRect(0, 244, 256, 12); c.fillStyle = "#c8c4cc"; c.fillRect(118, 236, 20, 10); // (the handle and the lock)
  });
}
/** R5: faded striped wallpaper with damp stains (opaque; inside the pawn shop; 1 tile = 2 x 2 m) */
function wallpaperTexture(scene: Scene) {
  return canvasTexture(scene, 128, (c, r) => {
    c.fillStyle = "#6f7f5a"; c.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { c.fillStyle = "#7f8f68"; c.fillRect(x, 0, 6, 128); c.fillStyle = "#c9a84a"; c.fillRect(x + 10, 0, 1.5, 128); }
    c.fillStyle = "#4a3a2a"; c.fillRect(0, 118, 128, 10); // (a skirting board)
  });
}
/** R6: white subway tiles with grey grout (opaque; 1 tile = 1.2 x 1.2 m: 8 rows of 4) */
function subwayTexture(scene: Scene) {
  return canvasTexture(scene, 128, (c) => {
    c.fillStyle = "#b8bcc4"; c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) {
      const ox = x * 32 + (y % 2 ? 16 : 0);
      const g = c.createLinearGradient(0, y * 16, 0, y * 16 + 16); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#e8ecf0");
      c.fillStyle = g; c.fillRect(ox + 1.5, y * 16 + 1.5, 29, 13);
    }
  });
}
/** R5: window styles (same 4 x 4 grid of cells as windowTexture, so any facade can swap one for another) */
/** R8: unlit window panes: dusky blue-greys (they read as glass reflecting the sky, not black holes) */
const DARK_PANES = ["#667a94", "#5c7088", "#70849c", "#62768e"];
/** a pale diagonal streak of sky across a dark pane */
function skyGlint(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, "rgba(190,220,240,0.35)"); g.addColorStop(1, "rgba(190,220,240,0)");
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = "rgba(230,245,255,0.3)"; c.beginPath(); c.moveTo(x + 4, y + h - 4); c.lineTo(x + 12, y + h - 4); c.lineTo(x + w - 4, y + 10); c.lineTo(x + w - 12, y + 10); c.fill();
}
function windowStyleTexture(scene: Scene, style: "shutter" | "arched" | "blinds" | "curtain" | "boarded"): Texture {
  return canvasTexture(scene, 256, (c, r) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 64 + 14, y = j * 64 + 12, w = 36, h = 42, lit = r() > 0.5;
      const glass = lit ? (r() > 0.3 ? "#ffd98a" : "#9fe3ff") : DARK_PANES[Math.floor(r() * DARK_PANES.length)]; // (R8: unlit panes a dusky blue-grey, not black)
      c.fillStyle = glass;
      if (style === "arched") { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + 14); c.arc(x + w / 2, y + 14, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); c.fill(); if (!lit) { c.save(); c.clip(); skyGlint(c, x, y, w, h); c.restore(); } c.strokeStyle = "#3a3444"; c.lineWidth = 4; c.stroke(); c.fillStyle = "#3a3444"; c.fillRect(x + w / 2 - 1.5, y, 3, h); continue; }
      c.fillRect(x, y, w, h);
      if (style === "blinds") { c.fillStyle = lit ? "rgba(255,255,255,0.55)" : "rgba(200,196,204,0.4)"; const down = 10 + r() * 30; for (let k = 0; k < down; k += 4) c.fillRect(x, y + k, w, 2.5); }
      if (style === "curtain") { const cols = ["#d6264a", "#2f8f4e", "#ffcf3a", "#3d6fb5", "#ff8fa3", "#9f5fd6"]; c.fillStyle = cols[Math.floor(r() * cols.length)]; const o = 4 + r() * 10; c.fillRect(x, y, o, h); c.fillRect(x + w - o, y, o, h); c.fillRect(x, y, w, 5); }
      if (style === "boarded" && r() < 0.35) { c.fillStyle = "#a8743f"; for (let k = 0; k < 3; k++) { c.save(); c.translate(x + w / 2, y + 8 + k * 13); c.rotate((r() - 0.5) * 0.5); c.fillRect(-w / 2 - 3, -4, w + 6, 8); c.restore(); } }
      else if (style === "boarded" && r() < 0.25) { c.strokeStyle = "#f4f1ea"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 8, y + 6); c.lineTo(x + 18, y + 20); c.lineTo(x + 12, y + 34); c.moveTo(x + 18, y + 20); c.lineTo(x + 30, y + 16); c.stroke(); } // (a cracked pane)
      if (!lit) skyGlint(c, x, y, w, h);
      c.strokeStyle = "#3a3444"; c.lineWidth = 4; c.strokeRect(x, y, w, h);
      if (style === "shutter") { const cols = ["#2f6f4f", "#3d6fb5", "#8e1f2e", "#6b4c9a"]; c.fillStyle = cols[(i + j * 3) % 4]; for (const sx of [-1, 1]) { const px = sx < 0 ? x - 12 : x + w + 2; c.fillRect(px, y, 10, h); c.fillStyle = "rgba(0,0,0,0.3)"; for (let k = 4; k < h; k += 5) c.fillRect(px + 1, y + k, 8, 1.5); c.fillStyle = cols[(i + j * 3) % 4]; } }
    }
  });
}

/** Medium tier: painted render with damp stains and hairline cracks (1 tile = 4 x 4 m). */
function renderTexture(scene: Scene) {
  return canvasTexture(scene, 256, (c, r) => {
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
    c.fillStyle = lit ? (r() > 0.3 ? "#ffd98a" : "#9fe3ff") : DARK_PANES[Math.floor(r() * DARK_PANES.length)];
    c.fillRect(i * 64 + 14, j * 64 + 12, 36, 42);
    if (!lit) skyGlint(c, i * 64 + 14, j * 64 + 12, 36, 42);
    c.strokeStyle = "#3a3444";
    c.lineWidth = 4;
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
const WIN_OFF = 0.11; // (R9: was 0.22, which stood out from the walls; 0.1 still clears the 0.05-0.08 m outline shell)

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
  /** R7: interiors that aren't units (the station's two floors, the pawn shops): drawn only near the camera too */
  private extraGroups: { id: number; x: number; z: number; rect: { minX: number; maxX: number; minZ: number; maxZ: number }; y0: number; y1: number; dist?: number }[] = [];
  private groupOfBox(b: Box): number {
    if (b.unit !== undefined) return b.unit;
    for (const g of this.extraGroups) {
      const r = g.rect;
      if (b.x > r.minX && b.x < r.maxX && b.z > r.minZ && b.z < r.maxZ && b.y > g.y0 && b.y < g.y1 && b.kind !== "roof" && b.kind !== "glass" && b.kind !== "sidewalk" && b.kind !== "curb" && b.kind !== "plaza" && b.deco !== "shell") return g.id; // (R8: never the pavement);
    }
    return -1;
  }
  private unitOn = new Map<number, boolean>();
  /** textured interior planes (posters): toggled with their building */
  private unitPlanes = new Map<number, Mesh[]>();

  /** C2: façade planes, one merged mesh per material */
  private planes = { windows: [] as Mesh[], curtain: [] as Mesh[], brick: [] as Mesh[], render: [] as Mesh[], stone: [] as Mesh[], front: [] as Mesh[],
    // R5: more walls, grime, roofs, shutters, window styles
    paint: [] as Mesh[], concrete: [] as Mesh[], tile: [] as Mesh[], corrugated: [] as Mesh[], clapboard: [] as Mesh[], grime: [] as Mesh[], roof: [] as Mesh[], roofLight: [] as Mesh[], wallpaper: [] as Mesh[], subway: [] as Mesh[], shutter: [] as Mesh[],
    floorTile: [] as Mesh[], winShutter: [] as Mesh[], winArched: [] as Mesh[], winBlinds: [] as Mesh[], winCurtain: [] as Mesh[], winBoarded: [] as Mesh[] };
  /** C2: shop signs share a few big textures (one draw call per sheet instead of one per sign) */
  private atlasSigns: { mesh: Mesh; text: string; bg: string; fg?: string }[] = [];
  /** C2: small modelled façade detail (sills, fire escapes, awning stripes...); off in Performance mode */
  readonly detail: boolean;
  /** C2: how many façade detail pieces were built (perf tests) */
  detailPieces = 0;
  /** R4: gate arches drawn in Little Italy / Chinatown (for the e2e) */
  districtGates = { italy: 0, china: 0 };

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
    // (R7: the station's ground floor and first floor, the two pawn shops: their insides drawn only when you're near)
    {
      const st = arena.station, g = st?.grand, ins = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) => ({ minX: r.minX + m, maxX: r.maxX - m, minZ: r.minZ + m, maxZ: r.maxZ - m });
      if (st && g) {
        const r = ins(st.rect, 0.65), cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
        // (R9: you see into the station through its glass from right across the street: drawn from further off)
        this.extraGroups.push({ id: 9001, x: cx, z: cz, rect: r, y0: 0, y1: g.upY, dist: 95 }, { id: 9002, x: cx, z: cz, rect: r, y0: g.upY, y1: 9.2, dist: 95 });
      }
      if (arena.fever) { const f = arena.fever, r = ins(f.rect, 0.6), cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2; this.extraGroups.push({ id: 9201, x: cx, z: cz, rect: r, y0: -1, y1: f.y2 - 0.2, dist: 100 }, { id: 9202, x: cx, z: cz, rect: r, y0: f.y2 - 0.2, y1: f.roofY - 0.2, dist: 100 }); } // (R11: NEON FEVER DREAM's floors)
      for (const h of arena.hotShops ?? []) this.extraGroups.push({ id: 9101 + h.idx, x: (h.rect.minX + h.rect.maxX) / 2, z: (h.rect.minZ + h.rect.maxZ) / 2, rect: ins(h.rect, 0.35), y0: 0, y1: 4.3, dist: 60 });
    }
    for (let bi = 0; bi < arena.boxes.length; bi++) {
      const b = arena.boxes[bi];
      this.brk = brkOfBox.get(bi) ?? "";
      if (b.kind === "fort") continue; // forts drawn separately (they will evolve in Phase 7)
      if (PROP_BOX_KINDS.has(b.kind)) continue;
      if (b.hide) continue; // (C5a: collision only; drawn by buildLobby)
      if (b.pump) continue; // (C5c.3: THE COMPACTOR's crusher bed moves: buildClub draws it)
      if (b.chain) { this.chainFences.push(b); continue; }
      this.group = this.groupOfBox(b);
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
      const m = b.poly ? footPrism(scene, b.poly, b.y - b.h / 2, b.y + b.h / 2) : MeshBuilder.CreateBox("b", { width: b.w, height: b.h, depth: b.d }, scene);
      if (!b.poly) m.position.set(b.x, b.y, b.z);
      const flat = b.kind === "sidewalk" || b.kind === "curb" || b.kind === "plaza" || b.kind === "shopfloor";
      this.add(m, color, flat ? (b.kind === "shopfloor" ? 0 : 0.02) : b.kind === "tower" ? 0.08 : 0.05, !flat);
      if ((b.kind === "building" || b.kind === "tower") && b.windows) this.facade(b, color, tier);
      if (b.china) this.chinaDress(b);
      if (b.italy) this.italyDress(b);
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
        merged.material = gm; merged.parent = this.root; merged.isPickable = false; merged.alphaIndex = 2;
      }
    }
    this.buildWater();
    this.buildProps();
    this.buildShops();
    this.buildDecor();
    this.buildScenery();
    this.buildPark();
    this.buildPit();
    this.buildLobby();
    this.buildChinatown();
    this.buildLittleItaly();
    this.buildBank();
    this.buildStatue();
    this.buildResto();
    this.buildClub();
    this.buildFever();
    this.buildPawnShop();
    if (arena.hotShops?.length) { this.buildPawnShops(); this.buildStationUpper(); } // (R7: the new city's two pawn shops, the grand station)
    this.planes.windows.push(...windowPlanes);
    const planeMat = (name: string, tex: Texture, zo: number) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true;
      m.useAlphaFromDiffuseTexture = true; m.backFaceCulling = false;
      m.zOffset = zo; m.zOffsetUnits = zo * 2;
      return m;
    };
    const winStyleMat = (style: Parameters<typeof windowStyleTexture>[1]) => {
      const m = new StandardMaterial("win-" + style, scene);
      m.diffuseTexture = windowStyleTexture(scene, style); m.emissiveTexture = m.diffuseTexture; m.disableLighting = true; m.useAlphaFromDiffuseTexture = true;
      m.zOffset = -2; m.zOffsetUnits = -4; m.backFaceCulling = false;
      return m;
    };
    const mats: Record<keyof CityRenderer["planes"], StandardMaterial> = {
      windows: winMat, curtain: planeMat("curtainWall", curtainTexture(scene), -2), front: planeMat("shopfront", shopfrontTexture(scene), -2),
      brick: planeMat("brickWall", brickTexture(scene), -1), render: planeMat("renderWall", renderTexture(scene), -1), stone: planeMat("stoneWall", stoneTexture(scene), -1),
      paint: planeMat("paintWall", paintedBrickTexture(scene), -1), concrete: planeMat("concreteWall", concreteTexture(scene), -1), tile: planeMat("tileWall", tileTexture(scene), -1),
      corrugated: planeMat("corrWall", corrugatedTexture(scene), -1), clapboard: planeMat("clapWall", clapboardTexture(scene), -1), grime: planeMat("grime", grimeTexture(scene), -1.5),
      roof: planeMat("roofTar", roofTexture(scene), -4), roofLight: planeMat("roofGravel", roofTexture(scene, true), -4), wallpaper: planeMat("wallpaper", wallpaperTexture(scene), -1), subway: planeMat("subway", subwayTexture(scene), -1), floorTile: planeMat("floorTile", floorTileTexture(scene), -1), shutter: planeMat("shutter", shutterTexture(scene), -2),
      winShutter: winStyleMat("shutter"), winArched: winStyleMat("arched"), winBlinds: winStyleMat("blinds"), winCurtain: winStyleMat("curtain"), winBoarded: winStyleMat("boarded"),
    };
    for (const k of Object.keys(this.planes) as (keyof CityRenderer["planes"])[]) {
      const list = this.planes[k];
      for (let i = 0; i < list.length; i += 1500) {
        const merged = Mesh.MergeMeshes(list.slice(i, i + 1500), true, true);
        if (merged) {
          merged.material = mats[k]; merged.parent = this.root; merged.isPickable = false; merged.freezeWorldMatrix();
          // (see-through layers are drawn in this order, so the wall texture never paints over glass or windows)
          merged.alphaIndex = WALL_KINDS.has(k) ? 1 : k === "grime" ? 1.5 : 2;
        }
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
  /** R7: the pawn shops' counter glass (own meshes: see-through) */
  private glassOf = new Map<string, Mesh>();
  private counterGlassMat: StandardMaterial | null = null;
  setBroken(propId: string, broken: boolean) {
    if (this.brkBroken.has(propId) === broken) return;
    if (broken) this.brkBroken.add(propId); else this.brkBroken.delete(propId);
    this.glassOf.get(propId)?.setEnabled(!broken);
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
    if (this.neon.length || this.stationLights) this.updateNeon();
    this.updateHeli(Math.min(0.1, (performance.now() - this.lastUpd) / 1000)); this.lastUpd = performance.now();
    for (const u of [...(this.arena.units ?? []), ...this.extraGroups]) {
      const on = Math.hypot(u.x - camX, u.z - camZ) < ((u as { dist?: number }).dist ?? INTERIOR_DRAW_DIST);
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
    // (R3: an angled footprint has one face per edge; a plain box its four sides, in the old order)
    const faces = b.poly ? footFaces(b).map((f) => ({ nx: f.nx, nz: f.nz, fw: f.len, wx: f.mx, wz: f.mz }))
      : ([[0, -1], [0, 1], [-1, 0], [1, 0]] as const).map(([nx, nz]) => ({ nx, nz, fw: nx ? b.d : b.w, wx: b.x + nx * (b.w / 2), wz: b.z + nz * (b.d / 2) }));
    const bf = b.face ? Math.hypot(b.face[0], b.face[1]) || 1 : 1, ffx = b.face ? b.face[0] / bf : 0, ffz = b.face ? b.face[1] / bf : 0;
    // R5: each building its own wall material and window style
    const wk: WallKind = b.italy ? "render" : b.china ? (H(70) < 0.5 ? "brick" : "paint") : tower ? (tier === 2 ? (H(70) < 0.6 ? "concrete" : "stone") : H(70) < 0.5 ? "brick" : "concrete") : pickMix(TIER_WALL_MIX[tier], H(70));
    const winKey = (glass ? "curtain" : b.italy ? "windows" : b.china ? "winCurtain" : pickMix(TIER_WIN_MIX[tier], H(71))) as keyof CityRenderer["planes"];
    let faceN = 0;
    for (const { nx, nz, fw, wx, wz } of faces) {
      if (fw < 1.5) continue;
      faceN++;
      const street = (fx !== 0 || fz !== 0) && (b.poly ? nx * ffx + nz * ffz > 0.9 : nx === fx && nz === fz);
      const ry = Math.atan2(-nx, -nz);
      const ax = Math.cos(ry), az = -Math.sin(ry);            // along the face (the plane's local x)
      const at = (m: Mesh, along: number, y: number, out: number) => { m.position.set(wx + ax * along + nx * out, y, wz + az * along + nz * out); m.rotation.y = ry; return m; };
      const shop = street && grounded && b.front === "shop";
      const lobby = street && grounded && b.front === "lobby";
      // a landmark's main entrance (glass doors in the middle of its signed face)
      const entrance = street && grounded && !b.front && !!b.sign && b.h >= 6 && fw >= 6;
      // R5: every other ground floor on a street gets something: a little shop, a roller shutter, boards, a front door
      const gf = street && grounded && !shop && !lobby && !entrance && !tower && !thin && fw >= 4 && b.h >= 3.5 && !b.china
        ? pickMix<"shop" | "shutter" | "boarded" | "door">(tier === 2 ? [["shop", 0.65], ["door", 0.35]] : [["shop", 0.45], ["shutter", 0.28], ["boarded", 0.1], ["door", 0.17]], H(72 + faceN)) : null; // (R9: nothing shut or boarded in the high end)
      const gShop = gf === "shop" || gf === "shutter" || gf === "boarded";
      // ---- wall material ----
      if (!thin && !glass) {
        const tile = WALL_TILE[wk];
        // (the wall texture stops above a shopfront / entrance / lobby: it never covers the glass)
        const base = shop || entrance || lobby || gShop ? Math.min(bottom + (lobby ? 4.2 : 3.3), top) : bottom;
        const wh = top - base;
        if (wh > 0.2) {
          const p = at(MeshBuilder.CreatePlane("wallmat", { width: fw, height: wh }, sc), 0, base + wh / 2, 0.09); // (R9: tighter to the wall)
          scaleUVs(p, fw / tile, wh / tile);
          this.planes[wk].push(p);
          if (tier < 2) { // (R9: the high end is clean: no soot, no streaks)
            const gr = at(MeshBuilder.CreatePlane("grime", { width: fw, height: wh }, sc), 0, base + wh / 2, 0.095);
            scaleUVs(gr, Math.max(1, Math.round(fw / 4)), 1);
            this.planes.grime.push(gr);
          }
        }
      }
      // ---- windows ----
      const winBottom = shop || entrance || gShop ? bottom + 4.8 : gf === "door" ? bottom + 3.4 : tower && grounded ? bottom + 4.7 : bottom + 0.7;
      const winTop = top - 0.5;
      const ph = winTop - winBottom, pw = fw - 1;
      let rows = 0, rowH = 0, cols = 0, cellW = 0;
      if (ph >= 1.5 && pw >= 1.5) {
        rows = Math.max(1, Math.round(ph / 2.2)); rowH = ph / rows;
        cols = Math.max(1, Math.round(pw / 1.6)); cellW = pw / cols;
        const p = at(MeshBuilder.CreatePlane("win", { width: pw, height: ph }, sc), 0, (winTop + winBottom) / 2, WIN_OFF);
        scaleUVs(p, cols / 4, rows / 4);
        this.planes[winKey].push(p);
      }
      // ---- shopfront / lobby glazing ----
      if (entrance) {
        const ew = Math.min(fw - 2, 8);
        const p = at(MeshBuilder.CreatePlane("entrance", { width: ew, height: 3 }, sc), 0, 1.75, 0.13);
        scaleUVs(p, Math.max(1, Math.round(ew / 4)), 0.75);
        this.planes.front.push(p);
      }
      const shutShop = shop && b.unit === undefined && fw >= 3 && tier < 2 && H(73 + faceN) < 0.18; // (R5: some shops are shut: the shutter's down, tagged)
      if (shutShop) { const p = at(MeshBuilder.CreatePlane("shutter", { width: fw - 0.8, height: 2.9 }, sc), 0, 1.6, 0.14); scaleUVs(p, Math.max(1, Math.round((fw - 0.8) / 4)), 1); this.planes.shutter.push(p); }
      if ((shop || lobby) && fw >= 3 && !shutShop) {
        const bays = Math.max(1, Math.round((fw - 0.8) / 4));
        const p = at(MeshBuilder.CreatePlane("front", { width: fw - 0.8, height: 3 }, sc), 0, 1.75, lobby ? 0.17 : 0.13);
        scaleUVs(p, bays, 0.75);
        this.planes.front.push(p);
      }
      if (gf === "shop" || gf === "boarded") {
        const bays = Math.max(1, Math.round((fw - 0.8) / 4));
        const p = at(MeshBuilder.CreatePlane("front", { width: fw - 0.8, height: 3 }, sc), 0, 1.75, 0.2);
        scaleUVs(p, bays, 0.75);
        this.planes.front.push(p);
      }
      if (gf === "shutter") {
        const p = at(MeshBuilder.CreatePlane("shutter", { width: fw - 0.8, height: 2.9 }, sc), 0, 1.6, 0.22);
        scaleUVs(p, Math.max(1, Math.round((fw - 0.8) / 4)), 1);
        this.planes.shutter.push(p);
      }
      if (gf === "shop" || gf === "shutter") {
        // a fascia board with a name (on the shared sign sheet)
        const sw = Math.min(fw - 0.8, 5.2), sp = at(MeshBuilder.CreatePlane("sign", { width: sw, height: sw * 0.22 }, sc), 0, 3.6, 0.36);
        sp.isPickable = false;
        this.atlasSigns.push({ mesh: sp, text: FAKE_SHOPS[Math.floor(H(80 + faceN) * FAKE_SHOPS.length)], bg: ["#f3e2b8", "#ffe14a", "#43c7a6", "#ff8fa3", "#9fe3ff", "#f4f1ea"][Math.floor(H(81 + faceN) * 6)] });
      }
      if (!detail) continue;
      // ---- R5: ground floors: awnings on the little shops, boards over the shut ones, front doors with steps ----
      if (gf === "shop") {
        const aw = Math.min(fw - 0.6, 7), [c1, c2] = AWNING_COLORS[Math.floor(H(82 + faceN) * AWNING_COLORS.length)], depth = 1.2, slope = 0.4;
        const base = at(MeshBuilder.CreateBox("awning", { width: aw, height: 0.08, depth }, sc), 0, 3.2 - Math.sin(slope) * depth / 2, depth / 2 + 0.05);
        base.rotation.x = slope; piece(base, c1, 0.025);
        const n = Math.floor(aw / 0.7);
        for (let i = 1; i < n; i += 2) { const st = at(MeshBuilder.CreateBox("stripe", { width: aw / n, height: 0.02, depth: depth - 0.02 }, sc), -aw / 2 + (i + 0.5) * aw / n, 3.2 - Math.sin(slope) * depth / 2 + 0.05, depth / 2 + 0.05); st.rotation.x = slope; piece(st, c2, 0); }
      }
      if (gf === "boarded") {
        for (let k = 0; k < 4; k++) { const pl = at(MeshBuilder.CreateBox("board", { width: fw - 1.2, height: 0.42, depth: 0.06 }, sc), (H(90 + k) - 0.5) * 0.4, 0.7 + k * 0.62, 0.32); pl.rotation.z = (H(95 + k) - 0.5) * 0.12; piece(pl, k % 2 ? "#a8743f" : "#b98a52", 0.012); }
      }
      if (gf === "door") {
        const dxA = (H(85) - 0.5) * (fw - 2.4);
        piece(at(MeshBuilder.CreateBox("door", { width: 1.2, height: 2.3, depth: 0.12 }, sc), dxA, 1.15, 0.14), ["#6b3a1e", "#2f4a5a", "#8e1f2e", "#2f6f4f"][Math.floor(H(86) * 4)], 0.015);
        piece(at(MeshBuilder.CreateBox("doorframe", { width: 1.5, height: 0.18, depth: 0.2 }, sc), dxA, 2.4, 0.16), trim, 0.012);
        piece(at(MeshBuilder.CreateBox("step", { width: 1.8, height: 0.18, depth: 0.6 }, sc), dxA, 0.09, 0.42), "#9a96a0", 0.012);
        piece(at(MeshBuilder.CreateBox("intercom", { width: 0.22, height: 0.4, depth: 0.05 }, sc), dxA + 0.9, 1.35, 0.15), "#c8c4cc", 0.008);
        piece(at(MeshBuilder.CreateBox("housenum", { width: 0.4, height: 0.25, depth: 0.03 }, sc), dxA, 2.75, 0.15), "#f4f1ea", 0.008);
        const lamp = MeshBuilder.CreateSphere("doorlamp", { diameter: 0.22, segments: 5 }, sc); at(lamp, dxA - 0.95, 2.15, 0.3); lamp.material = this.glowMat("#ffe9a8"); lamp.parent = this.root; lamp.isPickable = false;
      }
      // ---- awning over a shop (striped) / canopy over a tower lobby ----
      if (shop && fw >= 3) {
        const aw = Math.min(fw - 0.6, 8), [c1, c2] = b.italy ? (H(1) < 0.5 ? ["#2f8f4e", "#f4f1ea"] : ["#c8322c", "#f4f1ea"]) : AWNING_COLORS[Math.floor(H(1) * AWNING_COLORS.length)];
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
      const trimFace = street || (tier === 0 && !tower && (b.poly ? nx * ffx + nz * ffz < -0.9 : nx === -fx && nz === -fz));
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
      if (street && tier < 2 && !tower && rows >= 2 && cols >= 2 && H(9) < 0.5 && !b.china) { // (C5b: Chinatown's shophouses have balconies instead)
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
    if (b.sign && !b.poly) this.landmark(b, color);
    // ---- R5: a tar-and-gravel roof on top (not on the glass towers or Chinatown's tiles) ----
    if (!glass && !b.china && !b.italy && !b.poly && b.w > 1.5 && b.d > 1.5) {
      const rp = MeshBuilder.CreateGround("roofmat", { width: b.w - 0.1, height: b.d - 0.1 }, sc); rp.position.set(b.x, top + 0.07, b.z); // (clear of the outline shell, which writes depth ~0.05 above the roof)
      scaleUVs(rp, (b.w - 0.1) / 3, (b.d - 0.1) / 3); rp.isPickable = false; (H(55) < 0.4 ? this.planes.roofLight : this.planes.roof).push(rp);
    }
    if (!detail) return;
    // ---- cornice round the top (not on towers: they have a parapet) ----
    if (!tower && b.h > 3) piece(b.poly ? footPrism(sc, b.poly, top - 0.5, top - 0.05, 0.25) : (() => { const m = MeshBuilder.CreateBox("cornice", { width: b.w + 0.5, height: 0.45, depth: b.d + 0.5 }, sc); m.position.set(b.x, top - 0.28, b.z); return m; })(), trim, 0.03);
    const [ccx, ccz] = b.poly ? centroid(b.poly) : [b.x, b.z]; // (R3: roof clutter round the middle of an angled roof)
    // ---- R5: every roof: little vents, a hatch, a chimney on the older blocks (none in the way on low, lootable roofs) ----
    if (!tower && !b.china && b.h >= 4 && !b.poly && Math.min(b.w, b.d) > 3) {
      const ex = b.w / 2 - 0.6, ez = b.d / 2 - 0.6;
      for (let k = 0; k < 2 + Math.floor(H(30) * 3); k++) {
        const vx = b.x + (H(31 + k) - 0.5) * 2 * ex, vz = b.z + (H(36 + k) - 0.5) * 2 * ez;
        if (H(41 + k) < 0.5) { const v = MeshBuilder.CreateCylinder("vent", { diameter: 0.28, height: 0.5, tessellation: 8 }, sc); v.position.set(vx, top + 0.25, vz); piece(v, "#c8c4cc", 0.012); const cap = MeshBuilder.CreateCylinder("ventcap", { diameter: 0.42, height: 0.08, tessellation: 8 }, sc); cap.position.set(vx, top + 0.55, vz); piece(cap, "#9a96a0", 0.01); }
        else { const v = MeshBuilder.CreateBox("ventbox", { width: 0.6, height: 0.35, depth: 0.45 }, sc); v.position.set(vx, top + 0.18, vz); piece(v, "#9a96a0", 0.012); }
      }
      if (H(46) < 0.5) { const hx = b.x + (H(47) - 0.5) * ex, hz = b.z + (H(48) - 0.5) * ez; const h1 = MeshBuilder.CreateBox("hatch", { width: 0.9, height: 0.18, depth: 0.9 }, sc); h1.position.set(hx, top + 0.09, hz); piece(h1, "#5a5560", 0.012); }
      if (tier < 2 && b.h >= 6 && H(49) < 0.55) { const cx2 = b.x + (H(50) < 0.5 ? -ex : ex) * 0.9, cz2 = b.z + (H(51) - 0.5) * ez; const ch = MeshBuilder.CreateBox("chimney", { width: 0.6, height: 1.3, depth: 0.6 }, sc); ch.position.set(cx2, top + 0.65, cz2); piece(ch, tier === 0 ? "#8a4a3a" : "#b8a890", 0.02); const chc = MeshBuilder.CreateBox("chimneycap", { width: 0.75, height: 0.12, depth: 0.75 }, sc); chc.position.set(cx2, top + 1.35, cz2); piece(chc, "#5a5560", 0.01); }
      if (b.h >= 9 && H(52) < 0.3) { const ant = MeshBuilder.CreateCylinder("antenna", { diameterTop: 0.03, diameterBottom: 0.08, height: 3, tessellation: 5 }, sc); ant.position.set(b.x + ex * 0.7, top + 1.5, b.z - ez * 0.7); piece(ant, "#c8c4cc", 0.008); }
    }
    // ---- roof clutter on roofs you can't reach (low roofs stay clear: rooftop loot lives there) ----
    if (!tower && b.h >= 9 && !b.china) { // (C5b: not under a tiled roof)
      if (H(20) < 0.45) {
        const tx = b.poly ? ccx : b.x + (H(21) - 0.5) * b.w * 0.4, tz = b.poly ? ccz : b.z + (H(22) - 0.5) * b.d * 0.4;
        const tank = MeshBuilder.CreateCylinder("tank", { diameter: 2, height: 1.9, tessellation: 12 }, sc); tank.position.set(tx, top + 1.6, tz); piece(tank, "#8b5a2b", 0.04);
        const cone = MeshBuilder.CreateCylinder("tankroof", { diameterTop: 0, diameterBottom: 2.2, height: 0.7, tessellation: 12 }, sc); cone.position.set(tx, top + 2.9, tz); piece(cone, "#5a3a24", 0.03);
        for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) { const leg = MeshBuilder.CreateBox("tankleg", { width: 0.12, height: 0.7, depth: 0.12 }, sc); leg.position.set(tx + lx, top + 0.35, tz + lz); piece(leg, "#3a3444", 0.015); }
      }
      if (H(23) < 0.7 && !b.poly) { const ac = MeshBuilder.CreateBox("ac", { width: 1.4, height: 0.9, depth: 1.1 }, sc); ac.position.set(b.x - b.w * 0.2, top + 0.45, b.z + b.d * 0.15); piece(ac, "#c8c4cc", 0.03); }
    }
    // ---- Uptown tower crowns: a setback and, on the tallest, a mast ----
    if (tower && tier === 2 && b.h > 30 && Math.min(b.w, b.d) > 5) {
      const crown = b.poly ? footPrism(sc, b.poly.map(([x, z]) => [ccx + (x - ccx) * 0.62, ccz + (z - ccz) * 0.62] as [number, number]), top + 0.6, top + 5.1)
        : MeshBuilder.CreateBox("crown", { width: b.w * 0.62, height: 4.5, depth: b.d * 0.62 }, sc);
      if (!b.poly) crown.position.set(b.x, top + 2.85, b.z);
      piece(crown, shade(color, -0.2), 0.05);
      if (b.h > 45) {
        const mast = MeshBuilder.CreateCylinder("mast", { diameterTop: 0.12, diameterBottom: 0.4, height: 9, tessellation: 6 }, sc);
        mast.position.set(ccx, top + 9.6, ccz); piece(mast, "#c8c4cc", 0.02);
        const tip = MeshBuilder.CreateSphere("masttip", { diameter: 0.5, segments: 4 }, sc); tip.position.set(ccx, top + 14.2, ccz); piece(tip, "#ff3a3a", 0);
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
    if (b.poly) { this.polySign(b); return; }
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
    const y = b.front === "shop" ? Math.min(4.05, top - 0.5 - w * 0.11) : b.kind === "board" ? 0.6 : b.face && b.kind === "building" ? top - 0.9 : b.face && b.kind !== "truck" ? b.y : b.kind === "truck" ? 2.55 : b.kind === "roof" ? top - 0.9 : b.kind === "tower" ? 5.5 : b.kind === "plinth" ? (b.mayor ? b.y : 0.6) : Math.min(top - 0.6, 2.9);
    const off = b.mayor ? 0.08 : b.kind === "board" || b.kind === "plinth" ? 0.03 : b.kind === "truck" ? 0.12 : 0.34;
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

  /** R3: the sign on an angled building: on the face that looks most along b.face (or toward the city centre). */
  private polySign(b: Box) {
    const want = b.face ?? [-b.x, -b.z], wl = Math.hypot(want[0], want[1]) || 1;
    const f = footFaces(b).filter((q) => q.len >= 2).sort((p, q) => (q.nx * want[0] + q.nz * want[1]) / wl - (p.nx * want[0] + p.nz * want[1]) / wl)[0];
    if (!f) return;
    const top = b.y + b.h / 2;
    const w = b.front === "shop" ? Math.min(f.len - 0.8, 5.2) : Math.min(f.len * 0.8, 7);
    if (w < 1) return;
    const p = MeshBuilder.CreatePlane("sign", { width: w, height: w * 0.22 }, this.scene);
    const y = b.front === "shop" ? Math.min(4.05, top - 0.5 - w * 0.11) : b.kind === "tower" ? 5.5 : top - 0.9;
    p.position.set(f.mx + f.nx * 0.34, y, f.mz + f.nz * 0.34);
    p.rotation.y = Math.atan2(-f.nx, -f.nz);
    p.isPickable = false;
    this.atlasSigns.push({ mesh: p, text: b.sign!, bg: ["#f3e2b8", "#ffe14a", "#43c7a6", "#ff8fa3", "#9fe3ff"][Math.floor(hash(b.x, b.z) * 5)] });
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
        c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = sg.fg ?? "#1b1420";
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
    if (b.kind === "tower" && b.poly) { // (R3: an angled tower: a parapet round its own outline)
      this.add(footPrism(sc, b.poly, top, top + 0.6, 0.2), "#4a4652", 0.05);
      return;
    }
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
    } else if (b.kind === "shelf" && !b.deco) { // (C5c.3: dressed-up shelves (guitars, trophies, the back bar, lockers) get their own things)
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
        // (a round door on every side: the ones against the wall or a neighbour are hidden anyway; C4b: the
        // tall ones are a dryer stacked on a washer, so two doors)
        for (const ax of [true, false]) for (const s of [-1, 1]) for (const y of b.h > 1.5 ? [0.55, 1.4] : [Math.min(0.55, b.h - 0.4)]) {
          const door = MB.CreateCylinder("wdoor", { diameter: 0.5, height: 0.08, tessellation: 14 }, sc);
          door.rotation.set(ax ? Math.PI / 2 : 0, 0, ax ? 0 : Math.PI / 2);
          door.position.set(b.x + (ax ? 0 : s * (b.w / 2 + 0.03)), bottom + y, b.z + (ax ? s * (b.d / 2 + 0.03) : 0)); // (proud of the box's ink outline)
          this.add(door, y > 1 ? "#e0a860" : "#6fb6d9", 0.01);
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
        if (b.deco === "jewels") break; // (R7: the pawn shops' glass counters: buildPawnShops fills them; the glass is the prop's)
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
  /**
   * C4b: THE PIT's dressing (looks only): steel coping on every ramp lip and the fun box, flood lights on
   * the corners, a painted logo and skid marks on the concrete, stickers on the ramps, litter, a drinks
   * cooler, a boombox on the bench.
   */
  /** C5b: Chinatown's lanterns (they glow at night) */
  private lanternMat: StandardMaterial | null = null;
  private lanternMeshes: Mesh[] = [];
  private lanternT = 0;
  private lanternMatFor(): StandardMaterial {
    if (!this.lanternMat) {
      const m = new StandardMaterial("lantern", this.scene);
      m.diffuseColor = Color3.FromHexString("#d8261e"); m.specularColor = Color3.FromHexString("#ffb0a0");
      m.emissiveColor = Color3.FromHexString("#5a1010");
      this.lanternMat = m;
    }
    return this.lanternMat;
  }
  /** a red paper lantern: body, gold caps, a tassel (swings a little) */
  private lantern(x: number, y: number, z: number, size = 1, gold = false): Mesh {
    const sc = this.scene;
    const body = MeshBuilder.CreateSphere("lantern", { diameter: 0.55 * size, segments: 10 }, sc);
    body.scaling.y = 0.82; body.position.set(x, y, z); body.parent = this.root; body.isPickable = false;
    body.material = gold ? (() => { const m = this.lanternMatFor().clone("lanternGold"); m.diffuseColor = Color3.FromHexString("#ffb000"); return m; })() : this.lanternMatFor();
    ink(body, 0.02);
    for (const dy of [0.24, -0.24]) {
      const cap = MeshBuilder.CreateCylinder("lcap", { diameter: 0.26 * size, height: 0.07 * size, tessellation: 10 }, sc);
      cap.position.set(x, y + dy * size, z); this.add(cap, "#e8b422", 0.01, false);
    }
    const tas = MeshBuilder.CreateCylinder("tassel", { diameter: 0.05 * size, height: 0.3 * size, tessellation: 5 }, sc);
    tas.position.set(x, y - 0.42 * size, z); this.add(tas, "#e8b422", 0, false);
    this.lanternMeshes.push(body);
    return body;
  }

  /**
   * C5b: a Chinatown shophouse's dressing (looks only): a glazed hip roof with upturned corners and a
   * ridge, a tiled eave across the front between the floors, red lanterns under it, a balcony with a red
   * railing on some, and a hanging vertical sign with the shop's name in Chinese.
   */
  private chinaDress(b: Box) {
    if (!b.china) return;
    const sc = this.scene, MB = MeshBuilder, top = b.y + b.h / 2;
    const [nx, nz] = b.face ?? [-1, 0];
    const ux = -nz, uz = nx; // along the front
    const frontLen = nx ? b.d : b.w, depth = nx ? b.w : b.d;
    const roofC = b.china.roof, H = hash(b.x, b.z);
    this.group = -1;
    // the hip roof: a squashed square frustum, then corner horns and a ridge with curled ends
    const roof = MB.CreateCylinder("chinaRoof", { diameterTop: 0.25, diameterBottom: 1.414, height: 1.7, tessellation: 4 }, sc);
    roof.rotation.y = Math.PI / 4; roof.bakeCurrentTransformIntoVertices();
    roof.scaling.set(b.w + 1.6, 1, b.d + 1.6); roof.position.set(b.x, top + 0.85, b.z); roof.bakeCurrentTransformIntoVertices();
    this.add(roof, roofC, 0.04, false);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const horn = MB.CreateCylinder("horn", { diameterTop: 0.02, diameterBottom: 0.28, height: 0.9, tessellation: 6 }, sc);
      horn.position.set(b.x + cx * (b.w / 2 + 0.75), top + 0.25, b.z + cz * (b.d / 2 + 0.75));
      horn.rotation.set(cz * 0.9, 0, -cx * 0.9); this.add(horn, roofC, 0.02, false);
    }
    const ridgeAlong = b.w > b.d;
    const ridge = MB.CreateBox("ridge", { width: ridgeAlong ? Math.max(0.5, b.w - b.d + 0.4) : 0.22, height: 0.22, depth: ridgeAlong ? 0.22 : Math.max(0.5, b.d - b.w + 0.4) }, sc);
    ridge.position.set(b.x, top + 1.72, b.z); this.add(ridge, "#e8b422", 0.02, false);
    for (const s2 of [-1, 1]) {
      const curl = MB.CreateSphere("curl", { diameter: 0.4, segments: 6 }, sc);
      curl.position.set(b.x + (ridgeAlong ? s2 * (b.w - b.d + 0.4) / 2 : 0), top + 1.85, b.z + (ridgeAlong ? 0 : s2 * (b.d - b.w + 0.4) / 2)); this.add(curl, "#e8b422", 0.02, false);
    }
    // eave between the floors, with a row of tile ends and lanterns under it
    const fx = b.x + nx * (depth / 2), fz = b.z + nz * (depth / 2), ey = 3.7;
    const eave = MB.CreateBox("eave", { width: nx ? 1.2 : frontLen + 0.6, height: 0.12, depth: nx ? frontLen + 0.6 : 1.2 }, sc);
    eave.position.set(fx + nx * 0.55, ey, fz + nz * 0.55); eave.rotation.set(nz * 0.35, 0, -nx * 0.35); this.add(eave, roofC, 0.02, false);
    for (let t = -frontLen / 2; t <= frontLen / 2 + 0.01; t += 0.4) {
      const tile = MB.CreateCylinder("tileEnd", { diameter: 0.14, height: 0.12, tessellation: 8 }, sc);
      tile.rotation.set(nz ? Math.PI / 2 : 0, 0, nx ? Math.PI / 2 : 0);
      tile.position.set(fx + nx * 1.12 + ux * t, ey - 0.2, fz + nz * 1.12 + uz * t); this.add(tile, "#e8b422", 0, false);
    }
    for (const t of [-frontLen / 3, 0, frontLen / 3]) this.lantern(fx + nx * 0.8 + ux * t, ey - 0.75, fz + nz * 0.8 + uz * t, 1.1);
    // a balcony on some (2nd floor)
    if (H < 0.6 && b.h > 7.5) {
      const by = 4.9;
      const slab = MB.CreateBox("balc", { width: nx ? 0.9 : frontLen * 0.7, height: 0.15, depth: nx ? frontLen * 0.7 : 0.9 }, sc);
      slab.position.set(fx + nx * 0.45, by, fz + nz * 0.45); this.add(slab, "#5a4636", 0.02, false);
      for (let t = -frontLen * 0.35; t <= frontLen * 0.35 + 0.01; t += 0.35) {
        const post = MB.CreateBox("rail", { width: 0.06, height: 0.9, depth: 0.06 }, sc);
        post.position.set(fx + nx * 0.85 + ux * t, by + 0.5, fz + nz * 0.85 + uz * t); this.add(post, "#c0282a", 0, false);
      }
      const rail = MB.CreateBox("railTop", { width: nx ? 0.08 : frontLen * 0.7, height: 0.08, depth: nx ? frontLen * 0.7 : 0.08 }, sc);
      rail.position.set(fx + nx * 0.85, by + 0.95, fz + nz * 0.85); this.add(rail, "#c0282a", 0.01, false);
    }
    // the hanging vertical sign, sticking out from the front corner
    {
      const tex = new DynamicTexture("csign", { width: 128, height: 448 }, sc, true);
      const c = tex.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = H < 0.5 ? "#8e1f2e" : "#1b1420"; c.fillRect(0, 0, 128, 448);
      c.strokeStyle = "#e8b422"; c.lineWidth = 8; c.strokeRect(6, 6, 116, 436);
      const chars = [...b.china.sign2];
      c.fillStyle = "#ffd54a"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = `bold ${Math.min(96, Math.floor(400 / chars.length))}px "Noto Sans SC", "Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif`;
      chars.forEach((ch, i) => c.fillText(ch, 64, 32 + (i + 0.5) * (384 / chars.length)));
      tex.update();
      const m = unlitTextured(sc, tex, "csign");
      const sx = fx + nx * 0.75 + ux * (frontLen / 2 - 0.4), sz = fz + nz * 0.75 + uz * (frontLen / 2 - 0.4);
      const pl = MB.CreatePlane("csign", { width: 0.7, height: 2.4 }, sc);
      pl.position.set(sx, 6.1, sz); pl.rotation.y = Math.atan2(ux, uz); pl.material = m; pl.parent = this.root; pl.isPickable = false;
      const bracket = MB.CreateBox("cbrk", { width: nx ? 1.3 : 0.06, height: 0.06, depth: nx ? 0.06 : 1.3 }, sc);
      bracket.position.set(fx + nx * 0.6 + ux * (frontLen / 2 - 0.4), 7.35, fz + nz * 0.6 + uz * (frontLen / 2 - 0.4)); this.add(bracket, "#3a3444", 0, false);
    }
  }

  /**
   * R4: a Little Italy building's dressing (looks only): a low terracotta hip roof, green shutters either side of every
   * upstairs window on the street, flower boxes of red geraniums, an iron balcony on some, wall lamps by the door.
   */
  private italyDress(b: Box) {
    const sc = this.scene, MB = MeshBuilder, top = b.y + b.h / 2, bottom = b.y - b.h / 2;
    const [nx, nz] = b.face ?? [1, 0];
    const ux = -nz, uz = nx; // along the front
    const frontLen = nx ? b.d : b.w, depth = nx ? b.w : b.d, H = hash(b.x * 1.7, b.z);
    this.group = -1;
    // the roof: a low terracotta hip with a little overhang
    const roof = MB.CreateCylinder("itRoof", { diameterTop: 0.35, diameterBottom: 1.414, height: 1.1, tessellation: 4 }, sc);
    roof.rotation.y = Math.PI / 4; roof.bakeCurrentTransformIntoVertices();
    roof.scaling.set(b.w + 0.9, 1, b.d + 0.9); roof.position.set(b.x, top + 0.55, b.z); roof.bakeCurrentTransformIntoVertices();
    this.add(roof, H < 0.5 ? "#c4562e" : "#b04a28", 0.04, false);
    const fx = b.x + nx * (depth / 2), fz = b.z + nz * (depth / 2);
    const at = (m: Mesh, along: number, y: number, out: number, col: string, o = 0.012) => { m.position.set(fx + ux * along + nx * out, y, fz + uz * along + nz * out); m.rotation.y = Math.atan2(nx, nz); this.add(m, col, o, false); return m; };
    // the upstairs windows (the same grid as the façade's)
    const winBottom = bottom + 4.8, winTop = top - 0.5, ph = winTop - winBottom, pw = frontLen - 1;
    if (ph >= 1.5 && pw >= 1.5) {
      const rows = Math.max(1, Math.round(ph / 2.2)), rowH = ph / rows, cols = Math.max(1, Math.round(pw / 1.6)), cellW = pw / cols;
      const shutter = H < 0.33 ? "#2f6f4e" : H < 0.66 ? "#3d6f8f" : "#6b8f3a";
      for (let i = 0; i < rows; i++) {
        const cellTop = winTop - i * rowH, cy = cellTop - rowH * 0.5, sill = cellTop - (54 / 64) * rowH - 0.05;
        for (let c = 0; c < cols; c++) {
          const along = -pw / 2 + (c + 0.5) * cellW;
          for (const s2 of [-1, 1]) at(MB.CreateBox("shutter", { width: cellW * 0.2, height: rowH * 0.58, depth: 0.06 }, sc), along + s2 * cellW * 0.4, cy, 0.17, shutter);
          if (H * 7 + i + c * 3 > 0 && (i + c + Math.floor(H * 10)) % 2 === 0) {
            at(MB.CreateBox("fbox", { width: cellW * 0.6, height: 0.22, depth: 0.3 }, sc), along, sill + 0.12, 0.32, "#8b5a2b");
            for (let f = 0; f < 4; f++) at(MB.CreateSphere("gera", { diameter: 0.16, segments: 4 }, sc), along - cellW * 0.22 + f * cellW * 0.15, sill + 0.3, 0.33, f % 2 ? "#e0283c" : "#ff6b7a", 0);
            for (let f = 0; f < 3; f++) at(MB.CreateSphere("leaf", { diameter: 0.12, segments: 3 }, sc), along - cellW * 0.15 + f * cellW * 0.15, sill + 0.24, 0.4, "#3f8f4a", 0);
          }
        }
        // an iron balcony across the middle on some floors
        if (i < rows - 1 && (H * 13 + i) % 3 < 1.1 && frontLen >= 5) {
          const by = cellTop - (54 / 64) * rowH - 0.1, bw = Math.min(frontLen * 0.5, 4);
          at(MB.CreateBox("ibal", { width: bw, height: 0.12, depth: 0.85 }, sc), 0, by, 0.45, "#e8d8b0", 0.01);
          at(MB.CreateBox("irail", { width: bw, height: 0.05, depth: 0.05 }, sc), 0, by + 0.9, 0.85, "#2b2433", 0);
          for (let t = -bw / 2; t <= bw / 2 + 0.01; t += 0.3) at(MB.CreateBox("ibar", { width: 0.03, height: 0.85, depth: 0.03 }, sc), t, by + 0.47, 0.85, "#2b2433", 0);
          for (const t of [-bw / 2 + 0.3, bw / 2 - 0.3]) at(MB.CreateCylinder("ipot", { diameterTop: 0.3, diameterBottom: 0.22, height: 0.3, tessellation: 8 }, sc), t, by + 0.21, 0.6, "#b5653b", 0.01);
        }
      }
    }
    // wall lamps either side of the shopfront
    for (const s2 of [-1, 1]) {
      const along = s2 * (frontLen / 2 - 0.35);
      at(MB.CreateBox("lampArm", { width: 0.05, height: 0.05, depth: 0.4 }, sc), along, 3.15, 0.3, "#2b2433", 0);
      const lamp = MB.CreateSphere("itLamp", { diameter: 0.24, segments: 6 }, sc);
      lamp.position.set(fx + ux * along + nx * 0.5, 3.05, fz + uz * along + nz * 0.5); lamp.material = this.glowMat("#ffd98a"); lamp.parent = this.root; lamp.isPickable = false;
    }
  }

  /**
   * R4: Little Italy's two arches (green, white and red bands, a "LITTLE ITALY" board, warm bulbs, potted cypresses),
   * café string lights zig-zagging across the street, and washing lines between the upstairs windows.
   */
  private buildLittleItaly() {
    const C = this.arena.littleItaly;
    if (!C) return;
    this.districtGates.italy = C.gates.length;
    const sc = this.scene, MB = MeshBuilder, bulb = this.glowMat("#ffd98a");
    this.group = -1; this.brk = "";
    const light = (x: number, y: number, z: number, d = 0.16) => { const m = MB.CreateSphere("festoon", { diameter: d, segments: 5 }, sc); m.position.set(x, y, z); m.material = bulb; m.parent = this.root; m.isPickable = false; };
    for (const g of C.gates) {
      const half = g.w / 2 - 0.2, H0 = 5.2;
      for (const sx of [-1, 1]) {
        const pil = MB.CreateBox("itPillar", { width: 0.7, height: H0, depth: 0.7 }, sc); pil.position.set(g.x + sx * half, H0 / 2, g.z); this.add(pil, "#efe3c8", 0.04);
        const cap = MB.CreateBox("itCap", { width: 0.95, height: 0.3, depth: 0.95 }, sc); cap.position.set(g.x + sx * half, H0 + 0.15, g.z); this.add(cap, "#d8c8a0", 0.03);
        const base = MB.CreateBox("itBase", { width: 0.95, height: 0.5, depth: 0.95 }, sc); base.position.set(g.x + sx * half, 0.25, g.z); this.add(base, "#b9a06b", 0.03);
        // a potted cypress at each foot (on the pavement side)
        const pot = MB.CreateCylinder("cypPot", { diameterTop: 0.7, diameterBottom: 0.5, height: 0.55, tessellation: 10 }, sc); pot.position.set(g.x + sx * (half + 0.9), 0.28, g.z); this.add(pot, "#b5653b", 0.02);
        const tree = MB.CreateCylinder("cypress", { diameterTop: 0.05, diameterBottom: 0.75, height: 2.6, tessellation: 8 }, sc); tree.position.set(g.x + sx * (half + 0.9), 1.85, g.z); this.add(tree, "#2f5a3a", 0.03);
      }
      // the arch: three bands (green outside, white, red inside) of small blocks round a half circle, bulbs along it
      const bands: [number, string][] = [[half + 0.05, "#2f8f4e"], [half - 0.3, "#f4f1ea"], [half - 0.65, "#c8322c"]];
      for (const [r, col] of bands) {
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI, am = (a0 + a1) / 2, seg = r * (a1 - a0) + 0.04;
          const m = MB.CreateBox("arch", { width: seg, height: 0.36, depth: 0.5 }, sc);
          m.position.set(g.x + Math.cos(am) * r, H0 + Math.sin(am) * r * 0.55, g.z);
          m.rotation.z = Math.atan2(Math.cos(am) * 0.55, -Math.sin(am)); // (along the arch's curve)
          this.add(m, col, 0.02);
        }
      }
      for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI, r = half + 0.35; light(g.x + Math.cos(a) * r, H0 + Math.sin(a) * r * 0.55, g.z - 0.28, 0.14); light(g.x + Math.cos(a) * r, H0 + Math.sin(a) * r * 0.55, g.z + 0.28, 0.14); }
      // the name board, both faces, hanging under the top of the arch
      const bm = unlitTextured(sc, textTexture(sc, "LITTLE ITALY", { w: 512, h: 128, bg: "#f4f1ea", fg: "#2f8f4e" }), "itBoard");
      for (const ry of [0, Math.PI]) {
        const pl = MB.CreatePlane("itBoard", { width: 3.6, height: 0.9 }, sc);
        pl.position.set(g.x, H0 + half * 0.55 - 1.0, g.z + (ry ? 0.3 : -0.3)); pl.rotation.y = ry; pl.material = bm; pl.parent = this.root; pl.isPickable = false;
      }
      const frame = MB.CreateBox("itFrame", { width: 3.8, height: 1.05, depth: 0.34 }, sc); frame.position.set(g.x, H0 + half * 0.55 - 1.0, g.z); this.add(frame, "#c8322c", 0.03); // (thin: its outline stays behind the boards at ±0.3)
    }
    // café lights: warm bulbs on sagging wires zig-zagging across the street, and washing lines higher up
    const S = C.street, x0 = S.minX - 2.3, x1 = S.maxX + 2.3;
    C.lanternRows.forEach((z, ri) => {
      const za = z - 1.6, zb = z + 1.6, y = 5.9, n = 10;
      for (const [zs, ze] of [[za, zb], [zb, za]] as const) {
        const pts: Vector3[] = [];
        for (let i = 0; i <= n; i++) { const t = i / n, sag = Math.sin(t * Math.PI) * 0.7; pts.push(new Vector3(x0 + (x1 - x0) * t, y - sag, zs + (ze - zs) * t)); if (i > 0 && i < n) light(x0 + (x1 - x0) * t, y - sag - 0.12, zs + (ze - zs) * t); }
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[i + 1], len = Vector3.Distance(a, b);
          const w = MB.CreateCylinder("fwire", { diameter: 0.02, height: len, tessellation: 4 }, sc);
          w.position.copyFrom(a.add(b).scale(0.5)); w.lookAt(b); w.rotation.x += Math.PI / 2; this.add(w, "#1b1420", 0, false);
        }
      }
      if (ri % 2 === 0) { // a washing line with the laundry out
        const y2 = 8.6, cols = ["#f4f1ea", "#ff8fa3", "#4fb3ff", "#ffe14a", "#c8322c", "#43c7a6"];
        const wire = MB.CreateCylinder("lline", { diameter: 0.02, height: x1 - x0, tessellation: 4 }, sc); wire.rotation.z = Math.PI / 2; wire.position.set((x0 + x1) / 2, y2, z + 0.4); this.add(wire, "#e8e2d4", 0, false);
        for (let i = 0; i < 7; i++) {
          const cx = x0 + 1.2 + i * ((x1 - x0 - 2.4) / 6), sh = hash(cx, z);
          // (two single-sided planes back to back: a double-sided mesh would stop the city's meshes merging)
          for (const ry of [0, Math.PI]) {
            const cloth = MB.CreatePlane("laundry", { width: 0.5 + sh * 0.4, height: 0.6 + sh * 0.5 }, sc);
            cloth.position.set(cx, y2 - 0.35 - sh * 0.2, z + 0.4); cloth.rotation.y = ry;
            this.add(cloth, cols[Math.floor(sh * cols.length)], 0, false);
          }
        }
      }
    });
  }

  /** C5b: Chinatown's two red gates and the lanterns strung across the street */
  private buildChinatown() {
    const C = this.arena.chinatown;
    if (!C) return;
    const sc = this.scene, MB = MeshBuilder;
    this.districtGates.china = C.gates.length;
    this.group = -1; this.brk = "";
    for (const g of C.gates) {
      const half = g.w / 2 - 0.2;
      for (const sx of [-1, 1]) {
        const pil = MB.CreateBox("gatePillar", { width: 0.6, height: 7.2, depth: 0.6 }, sc); pil.position.set(g.x + sx * half, 3.6, g.z); this.add(pil, "#c0282a", 0.04);
        const base = MB.CreateBox("gateBase", { width: 0.9, height: 0.5, depth: 0.9 }, sc); base.position.set(g.x + sx * half, 0.25, g.z); this.add(base, "#8e8a94", 0.03);
        // stone lion-ish guardians at each foot (friendly, round)
        const lion = MB.CreateSphere("guardian", { diameter: 0.7, segments: 8 }, sc); lion.position.set(g.x + sx * (half + 0.9), 0.45, g.z - Math.sign(g.z) * 0.6); this.add(lion, "#b9b3ac", 0.03);
        const lhead = MB.CreateSphere("guardianHead", { diameter: 0.5, segments: 8 }, sc); lhead.position.set(g.x + sx * (half + 0.9), 0.95, g.z - Math.sign(g.z) * 0.75); this.add(lhead, "#b9b3ac", 0.03);
      }
      for (const [y, h, extra] of [[6.2, 0.35, 0.4], [7.1, 0.45, 1.4]] as const) {
        const beam = MB.CreateBox("gateBeam", { width: g.w + extra, height: h, depth: 0.5 }, sc); beam.position.set(g.x, y, g.z); this.add(beam, "#c0282a", 0.04);
      }
      const roof = MB.CreateCylinder("gateRoof", { diameterTop: 0.2, diameterBottom: 1.414, height: 1.0, tessellation: 4 }, sc);
      roof.rotation.y = Math.PI / 4; roof.bakeCurrentTransformIntoVertices();
      roof.scaling.set(g.w + 2.4, 1, 1.8); roof.position.set(g.x, 7.85, g.z); roof.bakeCurrentTransformIntoVertices(); this.add(roof, "#3f7f4f", 0.04);
      for (const sx of [-1, 1]) { const horn = MB.CreateCylinder("gHorn", { diameterTop: 0.02, diameterBottom: 0.25, height: 0.8, tessellation: 6 }, sc); horn.position.set(g.x + sx * (g.w / 2 + 1.2), 7.5, g.z); horn.rotation.z = -sx * 0.9; this.add(horn, "#3f7f4f", 0.02); }
      // the name board, both faces
      const bm = unlitTextured(sc, textTexture(sc, "CHINATOWN", { w: 512, h: 128, bg: "#1b1420", fg: "#ffd54a" }), "gateBoard");
      for (const ry of [0, Math.PI]) {
        const pl = MB.CreatePlane("gateBoard", { width: 3.2, height: 0.8 }, sc);
        pl.position.set(g.x, 6.65, g.z + (ry ? 0.27 : -0.27)); pl.rotation.y = ry; pl.material = bm; pl.parent = this.root; pl.isPickable = false;
      }
      for (const sx of [-1, 1]) this.lantern(g.x + sx * 2.2, 5.6, g.z, 1.3);
    }
    // lanterns strung across the road (red and gold, a little sag), on thin wires between the buildings
    const S = C.street;
    for (const z of C.lanternRows) {
      const x0 = S.minX - (this.arena.variant ? 2.3 : 1.5), x1 = S.maxX + (this.arena.variant ? 2.3 : 2.5), y = 6.4, n = 6;
      for (let i = 0; i <= n; i++) {
        const t = i / n, sag = Math.sin(t * Math.PI) * 0.6;
        if (i > 0 && i < n) this.lantern(x0 + (x1 - x0) * t, y - sag - 0.45, z, 0.9, i % 2 === 0);
      }
      const len = x1 - x0, wire = MB.CreateCylinder("lwire", { diameter: 0.02, height: len, tessellation: 4 }, sc);
      wire.rotation.z = Math.PI / 2; wire.position.set((x0 + x1) / 2, y - 0.3, z); this.add(wire, "#1b1420", 0, false);
    }
  }

  // =================================================================================================
  // C5c: UPTOWN LANDMARKS (looks only; the collision is in the layout)
  // =================================================================================================
  private uptownT = 0;
  private sparkles: { m: Mesh; ph: number }[] = [];
  private glowMat(col: string): StandardMaterial {
    const m = new StandardMaterial("glow" + col, this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(col); return m;
  }
  /** a gold sparkle (a little 4-point star that twinkles; see updateUptown) */
  private sparkle(x: number, y: number, z: number, size = 0.35) {
    const m = MeshBuilder.CreatePlane("sparkle", { size }, this.scene);
    m.position.set(x, y, z); m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false; m.parent = this.root;
    m.material = this.sparkleMat ??= (() => {
      const t = new DynamicTexture("sparkleTex", { width: 64, height: 64 }, this.scene, true);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.clearRect(0, 0, 64, 64); c.fillStyle = "#fff6c0";
      c.beginPath(); c.moveTo(32, 0); c.quadraticCurveTo(36, 28, 64, 32); c.quadraticCurveTo(36, 36, 32, 64); c.quadraticCurveTo(28, 36, 0, 32); c.quadraticCurveTo(28, 28, 32, 0); c.fill();
      t.hasAlpha = true; t.update();
      const mm = unlitTextured(this.scene, t, "sparkleMat"); mm.alphaMode = 1; return mm;
    })();
    this.sparkles.push({ m, ph: this.sparkles.length * 1.37 });
  }
  private sparkleMat: StandardMaterial | null = null;

  /**
   * THE TRASHINGTON BANK: a marble temple of money. A columned portico with a frieze and pediment, a gold
   * dome, a red carpet up the steps; inside, a chequered marble floor, chandeliers, velvet queue ropes,
   * teller signs, a portrait of the Mayor, a security camera; the vault door itself is a prop.
   */
  private buildBank() {
    const B = this.arena.bank;
    if (!B) return;
    const sc = this.scene, MB = MeshBuilder, r = B.rect, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, H = 8;
    const W = r.maxX - r.minX, D = r.maxZ - r.minZ;
    const gold = "#e8b83a", goldHi = "#ffd54a", marble = "#e8e2d4", marble2 = "#cfc6b6", red = "#9e1b2c";
    this.group = -1; this.brk = "";
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, o = 0.03, cast = true, ry = 0) => {
      const m = MB.CreateBox("bk", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; this.add(m, col, o, cast); return m;
    };
    const cyl = (d: number, h: number, x: number, y: number, z: number, col: string, o = 0.03, t = 16, top?: number) => {
      const m = MB.CreateCylinder("bkc", { diameter: d, diameterTop: top ?? d, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, o); return m;
    };
    const plane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial) => {
      const p = MB.CreatePlane("bkp", { width: w, height: h }, sc); p.position.set(x, y, z); p.rotation.y = Math.atan2(-nx, -nz);
      p.material = mat; p.parent = this.root; p.isPickable = false; return p;
    };
    const front = r.minZ;
    // ---- the portico: fluted columns (a shaft of 8 facets, gold rings), a frieze with a motto, a pediment with a coin
    for (const [x, z] of B.cols ?? []) {
      bx(0.95, 0.3, 0.95, x, 0.15, z, marble2, 0.03);
      cyl(0.7, 0.2, x, 0.4, z, marble);
      cyl(0.62, 6.2, x, 3.6, z, marble, 0.03, 8, 0.56);
      cyl(0.72, 0.12, x, 6.62, z, gold, 0.02);
      bx(0.95, 0.3, 0.95, x, 6.85, z, marble2, 0.03);
    }
    const fz = 89.15 - 0.95; // (the frieze's front face)
    bx(W + 0.8, 0.14, 0.12, cx, 7.12, fz - 0.1, gold, 0.02);
    bx(W + 0.8, 0.14, 0.12, cx, 7.72, fz - 0.1, gold, 0.02);
    plane(11, 0.5, cx, 7.42, fz - 0.17, 0, -1, unlitTextured(sc, textTexture(sc, "IN GOLD WE TRUST", { w: 1024, h: 48, bg: marble, fg: "#8a6a1a" }), "bankMotto"));
    {
      const ped = prism(sc, W + 0.4, 2.4, 1.9); ped.position.set(cx, 7.8, 89.15);
      this.add(ped, marble, 0.04);
      const coin = MB.CreateCylinder("coin", { diameter: 1.4, height: 0.16, tessellation: 24 }, sc); coin.rotation.x = Math.PI / 2; coin.position.set(cx, 8.55, 88.1); this.add(coin, gold, 0.02);
      plane(1.1, 1.1, cx, 8.55, 87.96, 0, -1, unlitTextured(sc, textTexture(sc, "$", { w: 128, h: 128, bg: goldHi, fg: "#8a6a1a" }), "bankCoin"));
    }
    // red carpet up the steps and in through the door; gold door frame
    bx(2.6, 0.03, 4.6, cx, 0.17, 90.2, red, 0, false);
    for (const sx of [-1, 1]) bx(0.22, 3.7, 0.3, cx + sx * 1.6, 1.85, front - 0.02, gold, 0.02);
    bx(3.6, 0.25, 0.3, cx, 3.6, front - 0.02, gold, 0.02);
    // tall windows with gold frames on the east half of the front and down both sides
    const glass = this.glowMat("#30507a"); glass.emissiveColor = Color3.FromHexString("#2c4a70");
    const win = (x: number, z: number, nx: number, nz: number) => {
      const p = plane(1.6, 4.2, x + nx * 0.1, 3.9, z + nz * 0.1, nx, nz, glass);
      p.material = glass;
      const along = nx ? [0, 1] : [1, 0];
      for (const s of [-1, 1]) bx(nx ? 0.14 : 0.16, 4.5, nx ? 0.16 : 0.14, x + along[0] * s * 0.88 + nx * 0.07, 3.9, z + along[1] * s * 0.88 + nz * 0.07, gold, 0.01, false);
      bx(nx ? 0.16 : 1.9, 0.18, nx ? 1.9 : 0.16, x + nx * 0.07, 6.1, z + nz * 0.07, gold, 0.01, false);
      bx(nx ? 0.3 : 1.9, 0.12, nx ? 1.9 : 0.3, x + nx * 0.12, 1.7, z + nz * 0.12, marble2, 0.01, false);
      const arch = MB.CreateCylinder("arch", { diameter: 1.6, height: 0.1, tessellation: 16, arc: 0.5 }, sc);
      arch.rotation.set(Math.PI / 2, nx ? Math.PI / 2 : 0, 0); arch.position.set(x + nx * 0.12, 6.0, z + nz * 0.12); this.add(arch, gold, 0.01, false);
    };
    for (const x of [77.3, 81.3]) win(x, front, 0, -1);
    for (const z of [92.5, 96, 99.5]) { win(r.maxX, z, 1, 0); win(r.minX, z, -1, 0); }
    // the cornice (a gold band), the drum and the gold dome with a lantern and a flag on top
    bx(W + 0.5, 0.35, D + 0.5, cx, 7.9, cz, gold, 0.03);
    cyl(7.6, 0.9, cx, H + 0.4 + 0.45, cz, marble, 0.04, 24);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bx(0.35, 0.9, 0.35, cx + Math.cos(a) * 3.85, H + 0.85, cz + Math.sin(a) * 3.85, marble2, 0.02, true, -a); }
    const dome = MB.CreateSphere("dome", { diameter: 7.2, segments: 20, slice: 0.5 }, sc); dome.position.set(cx, H + 1.3, cz); this.add(dome, gold, 0.05);
    for (let i = 0; i < 12; i++) { // (gold ribs up the dome)
      const a = i / 12 * Math.PI * 2, path: Vector3[] = [];
      for (let k = 0; k <= 12; k++) { const e = k / 12 * Math.PI / 2 * 0.97; path.push(new Vector3(cx + Math.cos(a) * Math.cos(e) * 3.63, H + 1.3 + Math.sin(e) * 3.63, cz + Math.sin(a) * Math.cos(e) * 3.63)); }
      const rib = MB.CreateTube("rib", { path, radius: 0.07, tessellation: 6 }, sc); this.add(rib, "#c99a22", 0, false);
    }
    cyl(1.2, 1.1, cx, H + 1.3 + 3.6 + 0.4, cz, marble, 0.03, 12);
    const top = MB.CreateSphere("domeTop", { diameter: 1.0, segments: 10 }, sc); top.position.set(cx, H + 1.3 + 4.5, cz); this.add(top, gold, 0.03);
    cyl(0.08, 2.4, cx, H + 1.3 + 5.9, cz, "#c9ccd4", 0.01, 6);
    const flag = MB.CreatePlane("bankFlag", { width: 1.3, height: 0.8 }, sc); flag.position.set(cx + 0.66, H + 1.3 + 6.6, cz); flag.parent = this.root; flag.isPickable = false;
    flag.material = unlitTextured(sc, textTexture(sc, "$", { w: 128, h: 80, bg: "#2f7a4f", fg: goldHi }), "bankFlagMat"); (flag.material as StandardMaterial).backFaceCulling = false;
    this.sparkle(cx, H + 1.3 + 4.9, cz, 0.8);
    // ---- the lobby: a chequered marble floor, chandeliers, velvet ropes, teller signs, the Mayor's portrait
    if (this.detail) { // (Performance mode skips the small dressing)
    for (let x = r.minX + 1.2; x < r.maxX - 0.6; x += 1.6) for (let z = front + 1.2; z < 94.2; z += 1.6) {
      bx(0.8, 0.02, 0.8, x, 0.19, z, "#8a7f70", 0, false, Math.PI / 4);
    }
    const bulb = this.glowMat("#fff1b0"), bulbList: Mesh[] = [];
    for (const x of [67, 79]) {
      const y = 6.4, z = 92.4;
      cyl(0.05, H - 0.4 - y - 0.3, x, (H - 0.4 + y + 0.3) / 2, z, gold, 0, 5);
      for (const [d, dy] of [[1.9, 0], [1.2, 0.45], [0.6, 0.8]] as const) {
        const ring = MB.CreateTorus("chand", { diameter: d, thickness: 0.07, tessellation: 20 }, sc); ring.position.set(x, y + dy, z); this.add(ring, gold, 0.01, false);
        const n = Math.round(d * 4);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2, b = MB.CreateSphere("cbulb", { diameter: 0.16, segments: 5 }, sc);
          b.position.set(x + Math.cos(a) * d / 2, y + dy + 0.1, z + Math.sin(a) * d / 2); bulbList.push(b);
          if (i % 2 === 0) { const drop = MB.CreateSphere("crystal", { diameter: 0.1, segments: 4 }, sc); drop.scaling.y = 1.8; drop.position.set(x + Math.cos(a) * d / 2, y + dy - 0.2, z + Math.sin(a) * d / 2); this.add(drop, "#e8f7ff", 0, false); }
        }
      }
    }
    { const mb = Mesh.MergeMeshes(bulbList, true, true); if (mb) { mb.material = bulb; mb.parent = this.root; mb.isPickable = false; mb.freezeWorldMatrix(); } }
    // the queue: brass posts and red ropes
    const qz = [91.6, 93.0];
    for (const z of qz) for (let x = 76; x <= 81; x += 1.25) {
      cyl(0.09, 0.95, x, 0.66, z, gold, 0.01, 8); cyl(0.3, 0.06, x, 0.21, z, gold, 0.01, 10);
      const k = MB.CreateSphere("knob", { diameter: 0.14, segments: 6 }, sc); k.position.set(x, 1.16, z); this.add(k, gold, 0.01, false);
      if (x + 1.25 <= 81.01) { const rope = MB.CreateCylinder("rope", { diameter: 0.07, height: 1.25, tessellation: 6 }, sc); rope.rotation.z = Math.PI / 2; rope.position.set(x + 0.625, 0.98, z); this.add(rope, red, 0, false); }
    }
    // teller signs hanging over the counter glass (facing the lobby)
    ["TELLER 1", "TELLER 2", "CLOSED", "TELLER 4"].forEach((t, i) => {
      const x = 65.5 + i * 3.6;
      plane(1.3, 0.34, x, 2.75, 94.7 - 0.2, 0, -1, unlitTextured(sc, textTexture(sc, t, { w: 256, h: 68, bg: t === "CLOSED" ? red : "#1b1420", fg: goldHi }), "teller" + i));
      for (const s of [-0.5, 0.5]) cyl(0.02, 0.8, x + s, 3.3, 94.5, gold, 0, 4);
    });
    // a little gold desk lamp and a pen-on-a-chain at each window
    for (let i = 0; i < 4; i++) { const x = 65.5 + i * 3.6; cyl(0.08, 0.3, x + 0.4, 1.25, 94.6, gold, 0.01, 6); const sh = MB.CreateCylinder("lampShade", { diameterTop: 0.1, diameterBottom: 0.3, height: 0.18, tessellation: 10 }, sc); sh.position.set(x + 0.4, 1.45, 94.6); this.add(sh, "#2f7a4f", 0.01, false); }
    }
    // the Mayor's portrait (lobby west wall) and a banner (east wall)
    const portrait = new DynamicTexture("mayorPortrait", { width: 256, height: 320 }, sc, true);
    { const c = portrait.getContext() as unknown as CanvasRenderingContext2D; c.fillStyle = "#6b3f22"; c.fillRect(0, 0, 256, 320); c.fillStyle = "#e8b83a"; c.fillRect(10, 10, 236, 300); c.fillStyle = "#2f4a3a"; c.fillRect(26, 26, 204, 230); drawMayorFace(c, 128, 150, 70, "#f0c8a0"); c.fillStyle = "#6b3f22"; c.font = "bold 22px 'Arial Black', sans-serif"; c.textAlign = "center"; c.fillText("OUR MAYOR", 128, 290); portrait.update(); }
    plane(1.8, 2.25, r.minX + 0.5 + 0.08, 4.2, 92.4, 1, 0, unlitTextured(sc, portrait, "portraitMat"));
    plane(5.5, 1.1, r.maxX - 0.5 - 0.08, 5.2, 92.8, -1, 0, unlitTextured(sc, textTexture(sc, "LOANS FOR EVERYONE* (*NOT YOU)", { w: 1024, h: 200, bg: "#2f7a4f", fg: goldHi }), "bankBanner"));
    plane(2.4, 0.5, 68.5, 3.4, 96.5 - 0.12, 0, -1, unlitTextured(sc, textTexture(sc, "VAULT", { w: 256, h: 54, bg: "#3a3444", fg: goldHi }), "vaultPlate"));
    plane(2.2, 0.5, 81, 3.0, 96.75 - 0.35, 0, -1, unlitTextured(sc, textTexture(sc, "STAFF ONLY", { w: 256, h: 58, bg: red, fg: "#f4f1ea" }), "staffOnly"));
    if (this.detail) { // (Performance mode skips the small dressing)
    // a security camera in the corner watching the lobby, and potted palms by the door
    bx(0.25, 0.25, 0.5, r.minX + 0.8, 6.8, front + 0.9, "#3a3444", 0.02, false, 0.7);
    const lens = MB.CreateSphere("camLens", { diameter: 0.12, segments: 6 }, sc); lens.position.set(r.minX + 1.0, 6.8, front + 1.1); lens.material = this.glowMat("#ff3b30"); lens.parent = this.root; lens.isPickable = false;
    for (const x of [cx - 2.4, cx + 2.4]) {
      cyl(0.6, 0.7, x, 0.53, front + 1.0, "#b5653b", 0.02, 10, 0.75);
      for (let i = 0; i < 5; i++) { const lf = MB.CreateBox("palm", { width: 0.2, height: 0.04, depth: 1.1 }, sc); lf.position.set(x, 1.4, front + 1.0); lf.rotation.set(0.6, i / 5 * Math.PI * 2, 0); lf.bakeCurrentTransformIntoVertices(); lf.position.set(Math.sin(i / 5 * Math.PI * 2) * 0.35, 0, Math.cos(i / 5 * Math.PI * 2) * 0.35); this.add(lf, "#4f8a3a", 0.01, false); }
    }
    }
    // the vault inside: a steel floor, stacked (decorative) gold behind the shelf, a warning stripe at the door
    bx(B.vault.maxX - B.vault.minX - 0.8, 0.02, B.vault.maxZ - B.vault.minZ - 0.8, (B.vault.minX + B.vault.maxX) / 2 - 0.1, 0.2, (B.vault.minZ + B.vault.maxZ) / 2 + 0.1, "#8a8a96", 0, false);
    if (this.detail) { // (Performance mode skips the small dressing)
    for (const x0 of [64.1, 66, 68, 70]) for (let lv = 0; lv < 2; lv++) for (let k = 0; k < 2 - lv; k++) for (const dz of [-0.13, 0.13]) { // (stacks of gold on the bench between the loose bars: looks only, bolted down)
      const g = MB.CreateBox("goldPile", { width: 0.4, height: 0.15, depth: 0.22 }, sc); g.position.set(x0 + (k - (1 - lv) / 2) * 0.43, 1.085 + lv * 0.16, B.vault.maxZ - 0.9 + dz); this.add(g, (lv + k) % 2 ? gold : goldHi, 0.01, false);
    }
    for (let i = 0; i < 5; i++) bx(0.4, 0.021, 0.5, 67.7 + i * 0.4, 0.2, B.vault.minZ + 0.8, i % 2 ? "#1b1420" : goldHi, 0, false, 0.5);
    for (let i = 0; i < 4; i++) this.sparkle(64 + i * 2.6, 1.9, B.vault.maxZ - 0.6, 0.3);
    }
    // outside: brass bollards along the kerb, a "NO LOITERING" sign that nobody reads
    for (let x = r.minX + 1; x <= r.maxX - 1; x += 3.1) if (Math.abs(x - cx) > 2) { cyl(0.28, 0.9, x, 0.45, 87.1, gold, 0.02, 10); const k = MB.CreateSphere("bol", { diameter: 0.3, segments: 8 }, sc); k.position.set(x, 0.92, 87.1); this.add(k, gold, 0.02, false); }
    cyl(0.08, 2.2, r.maxX + 1.4, 1.1, 88.2, "#6f6a78", 0.01, 6);
    plane(1.2, 0.5, r.maxX + 1.4, 2.0, 88.14, 0, -1, unlitTextured(sc, textTexture(sc, "NO LOITERING", { w: 256, h: 104, bg: "#f4f1ea", fg: red }), "noLoiter"));
  }

  /**
   * THE MAYOR'S GOLDEN STATUE: Mayor Grubsworth, three metres of solid(ish) gold, lounging on a throne on
   * top of the plinth, waving, with a giant drumstick for a sceptre and a top hat. His nose is a prop.
   */
  private buildStatue() {
    const S = this.arena.statue;
    if (!S) return;
    const sc = this.scene, MB = MeshBuilder, Y = S.plinthH;
    const gold = "#e8b83a", goldHi = "#ffd54a", goldLo = "#c99a22";
    this.group = -1; this.brk = "";
    const d = { x: S.x, y: Y, z: S.z, yaw: S.yaw };
    const put = (m: Mesh, col: string, lx: number, ly: number, lz: number, o = 0.03, rx = 0, rz = 0) => {
      this.at(m, d, lx, ly, lz); m.rotation.x = rx; m.rotation.z = rz; this.add(m, col, o); return m;
    };
    const box = (w: number, h: number, dd: number) => MB.CreateBox("st", { width: w, height: h, depth: dd }, sc);
    const sph = (dia: number, seg = 12) => MB.CreateSphere("st", { diameter: dia, segments: seg }, sc);
    const cyl = (dia: number, h: number, top?: number, t = 14) => MB.CreateCylinder("st", { diameter: dia, diameterTop: top ?? dia, height: h, tessellation: t }, sc);
    // the throne: seat, a tall back with a scalloped crest, arms with lion's-paw ends, ball feet
    put(box(2.1, 0.5, 1.7), goldLo, 0, 0.3, -0.1);
    put(box(2.3, 3.3, 0.35), goldLo, 0, 1.75, -0.95);
    for (const [x, s] of [[-0.8, 0.5], [0, 0.75], [0.8, 0.5]] as const) put(sph(s), gold, x, 3.45, -0.95, 0.02);
    for (const sx of [-1, 1]) { put(box(0.32, 0.55, 1.5), goldLo, sx * 1.0, 0.8, -0.05); put(sph(0.42), gold, sx * 1.0, 1.1, 0.72, 0.02); put(sph(0.3), gold, sx * 0.9, 0.08, 0.6, 0.02); put(sph(0.3), gold, sx * 0.9, 0.08, -0.85, 0.02); }
    // the Mayor: a big round belly, short legs, shiny shoes
    put(sph(1.65, 16), gold, 0, 1.3, 0.3).scaling.set(1.08, 1.0, 0.92);
    for (const sx of [-1, 1]) {
      put(cyl(0.42, 0.9), gold, sx * 0.34, 0.72, 0.6, 0.03, Math.PI / 2);
      put(cyl(0.38, 0.6), gold, sx * 0.34, 0.35, 1.02);
      put(sph(0.42), goldHi, sx * 0.34, 0.08, 1.18, 0.02).scaling.set(0.9, 0.55, 1.3);
    }
    // a sash and medals across the belly
    put(box(0.2, 1.7, 0.1), goldHi, 0, 1.4, 1.0, 0.01, 0, 0.6);
    for (const [x, y] of [[-0.3, 1.75], [0.05, 1.55]] as const) put(cyl(0.2, 0.05, undefined, 10), goldHi, x, y, 0.98, 0.01, Math.PI / 2);
    // head: chins, cheeks, a magnificent moustache; top hat
    put(sph(1.05, 16), gold, 0, 2.05, 0.55);
    put(sph(0.8, 12), gold, 0, 1.75, 0.62).scaling.set(1.15, 0.6, 1);
    for (const sx of [-1, 1]) {
      put(sph(0.36), goldHi, sx * 0.3, 1.9, 0.95, 0.02);
      put(sph(0.3), gold, sx * 0.2, 1.73, 1.02, 0.01).scaling.set(1.5, 0.55, 0.7);
      put(sph(0.12, 8), goldLo, sx * 0.2, 2.2, 1.02, 0.01).scaling.set(1, 0.6, 0.6);
      put(sph(0.22), gold, sx * 0.52, 2.08, 0.5, 0.01); // (ears)
    }
    put(cyl(1.25, 0.08, undefined, 20), goldLo, 0, 2.5, 0.5, 0.02, -0.12);
    put(cyl(0.78, 0.95, 0.82, 16), gold, 0, 2.98, 0.45, 0.03, -0.12);
    put(cyl(0.8, 0.14, undefined, 16), goldHi, 0, 2.65, 0.49, 0.01, -0.12);
    // the right arm waving, the left holding a giant drumstick like a sceptre
    put(cyl(0.3, 0.8), gold, 0.82, 2.0, 0.35, 0.02, 0, -0.5);
    put(cyl(0.26, 0.7), gold, 1.05, 2.65, 0.4, 0.02, 0, 0.15);
    put(sph(0.36), goldHi, 1.0, 3.05, 0.45, 0.02).scaling.set(0.8, 1.1, 0.5);
    for (let i = 0; i < 4; i++) put(cyl(0.08, 0.26, undefined, 6), goldHi, 0.88 + i * 0.08, 3.28, 0.45, 0.01, 0, 0.15 - i * 0.1);
    put(cyl(0.3, 0.8), gold, -0.85, 1.6, 0.35, 0.02, 0, 0.35);
    put(sph(0.34), goldHi, -1.0, 1.25, 0.65, 0.02);
    put(cyl(0.14, 1.8), goldHi, -1.0, 1.9, 0.72, 0.02);
    put(sph(0.6, 12), gold, -1.0, 2.9, 0.72, 0.02).scaling.set(1, 1.3, 1); // (the drumstick's meaty end)
    for (const sx of [-1, 1]) put(sph(0.18, 8), goldHi, -1.0 + sx * 0.08, 0.98, 0.72, 0.01);
    // a cape down the back of the throne
    put(box(2.0, 2.4, 0.08), goldLo, 0, 1.4, -1.18, 0.01, 0.12);
    const px = S.x + 0.4, pz = S.z; // (the plinth's middle; the statue sits a bit back on it)
    if (this.detail) { // (Performance mode skips the small dressing)
    // sparkles round him (twinkling), lamp posts with gold globes at the corners, flowers round the base
    for (const [lx, ly, lz] of [[0, 3.6, 0.5], [1.1, 3.4, 0.4], [-1.0, 3.3, 0.8], [0.5, 1.2, 1.3], [-0.6, 0.6, 1.1]] as const) {
      const c = Math.cos(S.yaw), s = Math.sin(S.yaw); this.sparkle(S.x + lx * c + lz * s, Y + ly, S.z - lx * s + lz * c, 0.45);
    }
    const bulb = this.glowMat("#fff1b0"), globes: Mesh[] = [];
    for (const [ox, oz] of [[-4.2, -4.2], [-4.2, 4.2], [4.2, -4.2], [4.2, 4.2]]) {
      const post = cyl(0.14, 3.6, undefined, 8); post.position.set(px + ox, 1.8, pz + oz); this.add(post, "#2b2433", 0.02);
      const g = sph(0.5, 10); g.position.set(px + ox, 3.8, pz + oz); globes.push(g);
      const cap = cyl(0.3, 0.12); cap.position.set(px + ox, 4.1, pz + oz); this.add(cap, gold, 0.01, false);
    }
    { const mg = Mesh.MergeMeshes(globes, true, true); if (mg) { mg.material = bulb; mg.parent = this.root; mg.isPickable = false; ink(mg, 0.02); mg.freezeWorldMatrix(); } }
    const cols = ["#e0502c", "#ffd54a", "#ff8fa3", "#f4f1ea"];
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2, rr = 3.45 + (i % 2) * 0.12;
      const x = px + Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * rr, z = pz + Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * rr;
      const f = sph(0.26, 6); f.position.set(x, 0.18, z); this.add(f, i % 3 ? "#4f8a3a" : cols[i % 4], 0.01, false);
    }
    }
    // the hint: a little plaque on a post
    const hp = cyl(0.07, 1.1, undefined, 6); hp.position.set(px + 3.6, 0.55, pz - 2.2); this.add(hp, "#2b2433", 0.01);
    const hint = MB.CreatePlane("noseHint", { width: 1.1, height: 0.42 }, sc); hint.position.set(px + 3.6, 1.2, pz - 2.2); hint.rotation.y = -Math.PI / 2; hint.parent = this.root; hint.isPickable = false;
    const hm = unlitTextured(sc, textTexture(sc, "PLEASE DO NOT TOUCH THE NOSE", { w: 512, h: 196, bg: "#f4f1ea", fg: "#8e1f2e" }), "noseHint"); hm.backFaceCulling = false; hint.material = hm;
  }

  // =================================================================================================
  // C5c.2: LE DUMPSTÈRE (looks only; the walls, tables, stairs and props are in the layout)
  // =================================================================================================
  private restoBob: { m: TransformNode; ph: number; y: number }[] = [];
  private restoFlames: Mesh[] = [];
  private restoSteam: { m: Mesh; ph: number; x: number; y: number; z: number }[] = [];
  private restoT = 0;
  private buildResto() {
    const C = this.arena.resto;
    if (!C) return;
    const sc = this.scene, MB = MeshBuilder, r = C.rect, Y = C.roofY;
    const gold = "#e8b83a", cream = "#f4f1ea", wine = "#6b1f2e";
    this.group = -1; this.brk = "";
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, o = 0.02, cast = false, ry = 0) => {
      const m = MB.CreateBox("rs", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; this.add(m, col, o, cast); return m;
    };
    const cyl = (d: number, h: number, x: number, y: number, z: number, col: string, o = 0.02, t = 12, top?: number) => {
      const m = MB.CreateCylinder("rsc", { diameter: d, diameterTop: top ?? d, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m;
    };
    const sph = (d: number, x: number, y: number, z: number, col: string, o = 0.02, seg = 8) => { const m = MB.CreateSphere("rss", { diameter: d, segments: seg }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m; };
    const glow = (col: string) => { const m = new StandardMaterial("restoGlow" + col, sc); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(col); return m; };
    const plane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial) => {
      const p = MB.CreatePlane("rsp", { width: w, height: h }, sc); p.position.set(x, y, z); p.rotation.y = Math.atan2(-nx, -nz); p.material = mat; p.parent = this.root; p.isPickable = false; return p;
    };
    const fancySign = (text: string, sub: string, w: number, h: number) => {
      const W = 1024, H = Math.round(1024 * h / w);
      const t = new DynamicTexture("restoSign-" + text, { width: W, height: H }, sc, true);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#1b1420"; c.fillRect(0, 0, W, H);
      c.strokeStyle = gold; c.lineWidth = H * 0.05; c.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
      c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffd54a";
      let s = H * 0.42; c.font = `italic bold ${s}px Georgia, "Times New Roman", serif`;
      while (s > 12 && c.measureText(text).width > W * 0.86) { s -= 4; c.font = `italic bold ${s}px Georgia, "Times New Roman", serif`; }
      c.fillText(text, W / 2, H * 0.42);
      c.font = `bold ${H * 0.16}px Georgia, serif`; c.fillStyle = cream; c.fillText(sub, W / 2, H * 0.76);
      t.update();
      return unlitTextured(sc, t, "restoSignMat-" + text);
    };
    const warm = glow("#ffd890"), flame = glow("#ffb02e");
    // ---- outside: the gold sign over the door, a striped awning, a red carpet, topiaries, lanterns, the menu easel
    const fx = r.minX - 0.12, dz = (C.door.minZ + C.door.maxZ) / 2;
    plane(7.0, 1.5, fx, 4.15, dz, -1, 0, fancySign("Le Dumpstère", "*** THREE BINS IN THE GUIDE ***", 7.0, 1.5));
    for (let i = 0; i < 7; i++) { const a = bx(1.6, 0.06, 0.44, r.minX - 0.75, 3.2, C.door.minZ - 0.5 + i * 0.43 + 0.22, i % 2 ? cream : wine, 0.01, false); a.rotation.z = -0.35; }
    for (const s of [-1, 1]) cyl(0.07, 3.2, r.minX - 1.45, 1.6, dz + s * 1.45, gold, 0.01, 6);
    bx(2.0, 0.03, 2.4, r.minX - 0.7, 0.17, dz, "#9e1b2c", 0, false);
    for (const z of [C.door.minZ - 0.5, C.door.maxZ + 0.5]) {
      cyl(0.6, 0.6, r.minX - 0.45, 0.45, z, "#e8e2d4", 0.02, 10, 0.75); cyl(0.12, 0.6, r.minX - 0.45, 1.0, z, "#6b4a2b", 0.01, 6);
      sph(0.9, r.minX - 0.45, 1.7, z, "#3f7f4f", 0.02); sph(0.6, r.minX - 0.45, 2.35, z, "#4f8a3a", 0.02);
      const lamp = MB.CreateBox("restoLamp", { width: 0.25, height: 0.4, depth: 0.25 }, sc); lamp.position.set(r.minX - 0.2, 2.6, z + (z < dz ? -0.6 : 0.6)); lamp.material = warm; lamp.parent = this.root; lamp.isPickable = false; ink(lamp, 0.02);
    }
    // the menu on an easel
    for (const s of [-1, 1]) { const l = cyl(0.05, 1.6, r.minX - 2.0, 0.8, 58.0 + s * 0.35, "#6b4a2b", 0, 4); l.rotation.x = s * 0.12; }
    plane(0.9, 1.1, r.minX - 2.06, 1.15, 58.0, -1, 0, unlitTextured(sc, textTexture(sc, "TONIGHT: CANAL TROUT A LA BIN $$$", { w: 256, h: 310, bg: "#1b1420", fg: cream }), "restoMenu"));
    // tall windows with warm light inside (the street sees the diners' candlelight)
    for (const z of [58.6, 64.4]) { const p = plane(1.2, 2.4, fx - 0.02, 2.2, z, -1, 0, warm); void p; bx(0.14, 2.6, 1.4, r.minX - 0.08, 2.2, z, gold, 0.01); bx(0.2, 0.12, 1.5, r.minX - 0.14, 0.95, z, cream, 0.01); }
    for (let x = 9; x < 17; x += 4) { plane(1.2, 2.4, x, 2.2, r.minZ - 0.14, 0, -1, warm); bx(1.4, 2.6, 0.14, x, 2.2, r.minZ - 0.08, gold, 0.01); }
    // ---- inside: a red carpet runner, chandeliers, a candle, plates and glasses on every table, posh diners,
    // paintings, the piano's keys and lid; the kitchen: pots, steam, hanging pans, the chef
    const H = C.hall;
    bx(H.maxX - H.minX - 2, 0.02, 1.2, (H.minX + H.maxX) / 2 - 0.6, 0.19, 62.8, "#9e1b2c", 0, false);
    if (this.detail) {
      const bulbs: Mesh[] = [];
      for (const x of [10.4, 13.9]) {
        cyl(0.04, 0.6, x, 4.7, 62.8, gold, 0, 4);
        const ring = MB.CreateTorus("restoChand", { diameter: 1.4, thickness: 0.06, tessellation: 18 }, sc); ring.position.set(x, 4.3, 62.8); this.add(ring, gold, 0.01, false);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = MB.CreateSphere("rbulb", { diameter: 0.13, segments: 4 }, sc); b.position.set(x + Math.cos(a) * 0.7, 4.4, 62.8 + Math.sin(a) * 0.7); bulbs.push(b); }
      }
      const mb = Mesh.MergeMeshes(bulbs, true); if (mb) { mb.material = warm; mb.parent = this.root; mb.isPickable = false; }
    }
    const shirts = ["#1b1420", "#3d6fb5", "#8e1f4e", "#2f7a4f", "#e8e2d4", "#9f5fd6", "#c9a56b", "#1b1420"];
    let di = 0;
    for (const b of this.arena.boxes) {
      if (b.kind !== "desk" || b.color !== cream || b.y > 2 || !inRectXZ(H, b.x, b.z)) continue;
      const top = b.y + b.h / 2;
      bx(b.w + 0.1, 0.25, b.d + 0.1, b.x, top - 0.1, b.z, cream, 0.01); // (the tablecloth's drop)
      cyl(0.08, 0.22, b.x, top + 0.11, b.z, cream, 0.005, 6);
      const fl = MB.CreateSphere("candle", { diameter: 0.08, segments: 4 }, sc); fl.scaling.y = 1.8; fl.position.set(b.x, top + 0.28, b.z); fl.material = flame; fl.parent = this.root; fl.isPickable = false; this.restoFlames.push(fl);
      for (const s of [-1, 1]) {
        cyl(0.34, 0.03, b.x + s * 0.32, top + 0.02, b.z, "#ffffff", 0.005, 14);
        cyl(0.07, 0.18, b.x + s * 0.32, top + 0.1, b.z + 0.3, "#e8f7ff", 0.005, 6, 0.1);
        if (!this.detail) continue;
        // a posh diner on each chair (looks only): bobbing as they eat, a top hat or a string of pearls
        const d = new TransformNode("diner", sc); d.parent = this.root; d.position.set(b.x + s * 0.95, 0, b.z); d.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        const body = MB.CreateCylinder("dinerBody", { diameterTop: 0.38, diameterBottom: 0.46, height: 0.75, tessellation: 8 }, sc); body.position.y = 1.0; body.material = toon(sc, shirts[di % 8]); ink(body, 0.02); body.parent = d; body.isPickable = false;
        const head = MB.CreateSphere("dinerHead", { diameter: 0.34, segments: 8 }, sc); head.position.y = 1.55; head.material = toon(sc, ["#f0c8a0", "#c98a5a", "#8a5a3a", "#f7d9b8"][di % 4]); ink(head, 0.02); head.parent = d; head.isPickable = false;
        if (di % 2 === 0) { const hat = MB.CreateCylinder("dinerHat", { diameter: 0.26, height: 0.3, tessellation: 10 }, sc); hat.position.y = 1.82; hat.material = toon(sc, "#1b1420"); ink(hat, 0.01); hat.parent = d; hat.isPickable = false; const brim = MB.CreateCylinder("brim", { diameter: 0.4, height: 0.03, tessellation: 12 }, sc); brim.position.y = 1.68; brim.material = toon(sc, "#1b1420"); brim.parent = d; brim.isPickable = false; }
        else { const pearls = MB.CreateTorus("pearls", { diameter: 0.34, thickness: 0.05, tessellation: 14 }, sc); pearls.position.y = 1.36; pearls.material = toon(sc, "#f7f3ec"); pearls.parent = d; pearls.isPickable = false; }
        const arm = MB.CreateCylinder("dinerArm", { diameter: 0.1, height: 0.5, tessellation: 5 }, sc); arm.rotation.x = Math.PI / 2.3; arm.position.set(0.18, 1.15, 0.2); arm.material = toon(sc, shirts[di % 8]); arm.parent = d; arm.isPickable = false;
        this.restoBob.push({ m: d, ph: di * 1.1, y: 0 });
        di++;
      }
    }
    // paintings on the dining room's north wall
    ["A BIN AT DUSK", "STILL LIFE WITH TROUT", "PORTRAIT OF A PIGEON"].forEach((t, i) => {
      const x = 9 + i * 3.5;
      bx(1.5, 1.1, 0.06, x, 2.9, r.maxZ - 0.45, gold, 0.01);
      plane(1.3, 0.9, x, 2.9, r.maxZ - 0.49, 0, -1, unlitTextured(sc, textTexture(sc, t, { w: 256, h: 180, bg: ["#3f7f4f", "#3d6fb5", "#c9a56b"][i], fg: cream }), "painting" + i));
    });
    // the piano: keys and a raised lid
    const piano = this.arena.boxes.find((b) => b.kind === "desk" && b.color === "#1b1420" && inRectXZ(H, b.x, b.z));
    if (piano) {
      const top = piano.y + piano.h / 2;
      bx(0.25, 0.05, piano.d - 0.2, piano.x - piano.w / 2 + 0.12, top + 0.02, piano.z, cream, 0.005);
      for (let i = 0; i < 9; i++) bx(0.14, 0.06, 0.05, piano.x - piano.w / 2 + 0.16, top + 0.04, piano.z - piano.d / 2 + 0.25 + i * 0.15, "#1b1420", 0);
      const lid = bx(piano.w - 0.3, 0.05, piano.d - 0.1, piano.x + 0.1, top + 0.45, piano.z, "#1b1420", 0.02); lid.rotation.x = 0; lid.rotation.z = -0.55;
      cyl(0.03, 0.6, piano.x + 0.45, top + 0.28, piano.z + 0.6, "#1b1420", 0, 4);
      for (const s of [-1, 1]) cyl(0.12, piano.y - piano.h / 2 + 0.9, piano.x + s * 0.4, 0.45, piano.z + 0.55, "#1b1420", 0.01, 6);
    }
    // the kitchen: white tiled walls, pots on the stove (steaming), hanging pans, the chef (looks only, shaking a pan)
    const K = C.kitchen;
    {
      const tt = new DynamicTexture("kitchenTiles", { width: 128, height: 128 }, sc, true), c = tt.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#c9ccd4"; c.fillRect(0, 0, 128, 128); c.fillStyle = "#f4f6f8"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) c.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); tt.update();
      tt.wrapU = 1; tt.wrapV = 1;
      const tm = new StandardMaterial("kitchenTileMat", sc); tm.diffuseTexture = tt; tm.specularColor = Color3.Black(); tm.emissiveColor = Color3.FromHexString("#3a3a40");
      const wallTile = (w: number, x: number, z: number, nx: number, nz: number) => { const p = MB.CreatePlane("ktile", { width: w, height: 3.2 }, sc); p.position.set(x + nx * 0.07, 1.75, z + nz * 0.07); p.rotation.y = Math.atan2(-nx, -nz); p.material = tm; p.parent = this.root; p.isPickable = false; (tm.diffuseTexture as DynamicTexture).uScale = 2; return p; };
      wallTile(K.maxX - K.minX, (K.minX + K.maxX) / 2, K.maxZ, 0, -1);
      wallTile(K.maxX - K.minX, (K.minX + K.maxX) / 2, K.minZ, 0, 1);
      wallTile(61.0 - K.minZ, K.maxX, (K.minZ + 61.0) / 2, -1, 0); wallTile(K.maxZ - 62.6, K.maxX, (62.6 + K.maxZ) / 2, -1, 0);
      wallTile(61.0 - K.minZ, K.minX, (K.minZ + 61.0) / 2, 1, 0); wallTile(K.maxZ - 62.4, K.minX, (62.4 + K.maxZ) / 2, 1, 0);
    }
    for (let i = 0; i < 3; i++) {
      const x = K.minX + 0.6 + i * 0.85, z = K.maxZ - 0.45;
      cyl(0.45, 0.35, x, 1.18, z, "#8e8a94", 0.02, 12);
      for (let k = 0; k < 3; k++) { const st = MB.CreateSphere("steam", { diameter: 0.25, segments: 5 }, sc); const sm = new StandardMaterial("steam", sc); sm.disableLighting = true; sm.emissiveColor = Color3.White(); sm.alpha = 0.3; st.material = sm; st.parent = this.root; st.isPickable = false; this.restoSteam.push({ m: st, ph: i * 0.4 + k * 0.33, x, y: 1.4, z }); }
    }
    for (let i = 0; i < 4; i++) { const pan = MB.CreateCylinder("pan", { diameter: 0.35, height: 0.05, tessellation: 12 }, sc); pan.rotation.x = Math.PI / 2; pan.position.set(K.minX + 0.5 + i * 0.6, 3.2, K.minZ + 0.1); this.add(pan, "#6f6a78", 0.01, false); cyl(0.02, 0.5, K.minX + 0.5 + i * 0.6, 3.6, K.minZ + 0.1, "#3a3444", 0, 4); }
    if (this.detail) {
      const chef = new TransformNode("chef", sc); chef.parent = this.root; chef.position.set(K.minX + 1.4, 0.15, (K.minZ + K.maxZ) / 2 + 1.2); chef.rotation.y = 0;
      const part = (m: Mesh, col: string, o = 0.02) => { m.parent = chef; m.material = toon(sc, col); ink(m, o); m.isPickable = false; return m; };
      part(MB.CreateCylinder("chefBody", { diameterTop: 0.5, diameterBottom: 0.6, height: 1.0, tessellation: 10 }, sc), cream).position.y = 0.95;
      part(MB.CreateSphere("chefHead", { diameter: 0.4, segments: 8 }, sc), "#f0c8a0").position.y = 1.65;
      part(MB.CreateCylinder("chefHat", { diameterTop: 0.5, diameterBottom: 0.32, height: 0.45, tessellation: 10 }, sc), "#ffffff", 0.01).position.y = 2.05;
      for (const s of [-1, 1]) { const m = part(MB.CreateSphere("tache", { diameter: 0.14, segments: 5 }, sc), "#3a2a1a", 0); m.scaling.set(1.4, 0.5, 0.6); m.position.set(s * 0.08, 1.58, 0.18); }
      const pan = part(MB.CreateCylinder("chefPan", { diameter: 0.4, height: 0.05, tessellation: 12 }, sc), "#3a3444", 0.01); pan.position.set(0.25, 1.15, 0.45);
      this.restoBob.push({ m: chef, ph: 0.3, y: 0.15 });
    }
    // ---- the roof terrace: herbs in the beds, string lights, umbrellas, a "CHEF'S TABLE" sign
    const bed = this.arena.boxes.find((b) => b.kind === "rim" && b.y > 4);
    if (bed) { bx(bed.w - 0.3, 0.06, bed.d - 0.3, bed.x, Y + 0.58, bed.z, "#3a2a1a", 0, false); for (let i = 0; i < 12; i++) sph(0.35, bed.x - bed.w / 2 + 0.45 + (i % 4) * 0.5, Y + 0.75, bed.z - bed.d / 2 + 0.45 + Math.floor(i / 4) * 0.7, i % 3 ? "#4f8a3a" : "#7fbf4f", 0.01, 6); }
    const bulbs: Mesh[] = [];
    for (const z of [60.2, 62.4, 64.6]) for (let i = 0; i <= 12; i++) { const x = r.minX + 0.6 + i * (r.maxX - r.minX - 1.2) / 12, sag = Math.sin(i / 12 * Math.PI) * 0.4; const b = MB.CreateSphere("terraceBulb", { diameter: 0.14, segments: 4 }, sc); b.position.set(x, Y + 2.3 - sag, z); bulbs.push(b); }
    { const mb = Mesh.MergeMeshes(bulbs, true); if (mb) { mb.material = warm; mb.parent = this.root; mb.isPickable = false; } }
    for (const [x, z] of [[r.minX + 0.4, 60.2], [r.maxX - 0.4, 60.2], [r.minX + 0.4, 64.6], [r.maxX - 0.4, 64.6], [r.minX + 0.4, 62.4], [r.maxX - 0.4, 62.4]]) cyl(0.08, 2.5, x, Y + 1.25, z, "#1b1420", 0.01, 6);
    for (const [x, z, c] of [[12.5, 61, wine], [9, 60.5, cream]] as const) { cyl(0.06, 2.2, x, Y + 1.1, z, "#c9ccd4", 0, 5); const u = MB.CreateCylinder("umb", { diameterTop: 0.05, diameterBottom: 2.4, height: 0.5, tessellation: 10 }, sc); u.position.set(x, Y + 2.3, z); this.add(u, c, 0.02, false); }
    plane(2.4, 0.6, 15, Y + 1.7, r.maxZ - 0.35, 0, -1, fancySign("Chef's Table", "BY INVITATION ONLY", 2.4, 0.6)).rotation.y = Math.PI;
  }

  /** C5c.2: the diners eat, the chef tosses his pan, candles flicker, pots steam */
  private updateResto(dt: number) {
    if (!this.restoFlames.length && !this.restoBob.length) return;
    this.restoT += dt;
    const t = this.restoT;
    for (const b of this.restoBob) { b.m.position.y = b.y + Math.max(0, Math.sin(t * 2.4 + b.ph)) * 0.05; b.m.rotation.z = Math.sin(t * 1.3 + b.ph) * 0.04; }
    this.restoFlames.forEach((f, i) => f.scaling.set(1, 1.6 + Math.sin(t * 13 + i * 2.1) * 0.3 + Math.sin(t * 7.3 + i) * 0.2, 1));
    for (const s of this.restoSteam) { const k = (t * 0.5 + s.ph) % 1; s.m.position.set(s.x + Math.sin(t + s.ph * 9) * 0.06, s.y + k * 1.2, s.z); s.m.scaling.setAll(0.5 + k * 1.2); (s.m.material as StandardMaterial).alpha = 0.35 * (1 - k); }
  }


  // =================================================================================================
  // C5c.3: THE COMPACTOR (looks only; the walls, floors, stairs, bar and props are in the layout). Static dressing is
  // merged into the city; the moving parts (the crusher bed and the ram over it, the crowd, the DJ, the lights, the
  // lasers off the stack, the belts, the smoke) only get worked out while the camera's near.
  // =================================================================================================
  private clubT = 0;
  private clubNear = false;
  private clubDyn: TransformNode | null = null;
  private clubBed: { top: TransformNode; skirt: Mesh; pistons: Mesh[]; tex: DynamicTexture; beat: number; ram: TransformNode; ramRods: Mesh[] } | null = null;
  private clubDancers: { n: TransformNode; armL: TransformNode; armR: TransformNode; ph: number; floor: boolean; baseY: number; night: boolean; air: number; vy: number; spin: number }[] = [];
  private clubBeams: { pivot: TransformNode; mat: StandardMaterial; ph: number; tx: number; tz: number }[] = [];
  private clubLasers: { pivot: TransformNode; mat: StandardMaterial; ph: number }[] = [];
  private clubBelts: Texture[] = [];
  private clubBottles: { m: Mesh; u: number; x0: number; x1: number; y: number; z: number }[] = [];
  private clubPulse: Mesh[] = [];
  private clubSpin: { m: TransformNode; speed: number }[] = [];
  private clubSmoke: { m: Mesh; ph: number; x: number; y: number; z: number }[] = [];
  private clubSpots: { m: Mesh; ph: number; mat: StandardMaterial }[] = [];
  private clubGlow: StandardMaterial[] = [];
  private clubNeon: { mat: StandardMaterial; base: Color3; ph: number }[] = [];
  private clubConfetti: { m: Mesh; vx: number; vy: number; vz: number; t: number; spin: number }[] = [];
  private clubDj: { n: TransformNode; arm: TransformNode } | null = null;
  private clubQueue: { n: TransformNode; ph: number }[] = [];

  private buildClub() {
    const C = this.arena.club;
    if (!C) return;
    const sc = this.scene, MB = MeshBuilder, r = C.rect, Y = C.roofY, WY = C.wingY;
    const hz = C.hall;
    this.group = -1; this.brk = "";
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, o = 0.02, cast = false, ry = 0) => {
      const m = MB.CreateBox("cb", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; this.add(m, col, o, cast); return m;
    };
    const cyl = (d: number, h: number, x: number, y: number, z: number, col: string, o = 0.02, t = 12, top?: number) => {
      const m = MB.CreateCylinder("cc", { diameter: d, diameterTop: top ?? d, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m;
    };
    const sph = (d: number, x: number, y: number, z: number, col: string, o = 0.02, seg = 8) => { const m = MB.CreateSphere("cs", { diameter: d, segments: seg }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m; };
    const glow = (col: string, alpha = 1) => { const m = new StandardMaterial("clubGlow" + col + alpha, sc); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(col); m.diffuseColor = Color3.Black(); if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; } this.clubGlow.push(m); return m; };
    const plane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial, parent: TransformNode = this.root) => {
      const p = MB.CreatePlane("cp", { width: w, height: h }, sc); p.position.set(x, y, z); p.rotation.y = Math.atan2(-nx, -nz); p.material = mat; p.parent = parent; p.isPickable = false; return p;
    };
    const dyn = new TransformNode("clubDyn", sc); dyn.parent = this.root; this.clubDyn = dyn;
    const part = (m: Mesh, col: string | StandardMaterial, o = 0.02, parent: TransformNode = dyn) => { m.parent = parent; m.material = typeof col === "string" ? toon(sc, col) : col; if (o) ink(m, o); m.isPickable = false; return m; };
    /** a neon sign: glowing letters on a see-through sheet (they pulse at night) */
    const neon = (text: string, col: string, w: number, h: number, font = "Bungee") => {
      const W = 1024, H = Math.max(64, Math.round(1024 * h / w));
      const t = new DynamicTexture("clubNeon-" + text, { width: W, height: H }, sc, true);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.clearRect(0, 0, W, H);
      let size = H * 0.72; c.font = `bold ${size}px "${font}", "Arial Black", sans-serif`;
      while (size > 12 && c.measureText(text).width > W * 0.9) { size -= 4; c.font = `bold ${size}px "${font}", "Arial Black", sans-serif`; }
      c.textAlign = "center"; c.textBaseline = "middle";
      c.lineJoin = "round"; c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = H * 0.16; c.strokeText(text, W / 2, H / 2);
      c.globalAlpha = 1; c.lineWidth = H * 0.05; c.strokeText(text, W / 2, H / 2);
      c.fillStyle = "#ffffff"; c.fillText(text, W / 2, H / 2);
      t.hasAlpha = true; t.update();
      const m = unlitTextured(sc, t, "clubNeonMat-" + text);
      this.clubNeon.push({ mat: m, base: Color3.White(), ph: text.length * 0.7 });
      return m;
    };
    const stripes = (() => {
      const t = new DynamicTexture("clubHazard", { width: 128, height: 32 }, sc, true), c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#1b1420"; c.fillRect(0, 0, 128, 32); c.fillStyle = "#ffd54a";
      for (let i = -2; i < 10; i++) { c.beginPath(); c.moveTo(i * 16, 32); c.lineTo(i * 16 + 8, 32); c.lineTo(i * 16 + 24, 0); c.lineTo(i * 16 + 16, 0); c.fill(); }
      t.update(); t.wrapU = 1; return unlitTextured(sc, t, "clubHazardMat");
    })();
    const brickPlane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number) => {
      const p = MB.CreatePlane("clubBrick", { width: w, height: h }, sc); p.position.set(x + nx * 0.12, y, z + nz * 0.12); p.rotation.y = Math.atan2(-nx, -nz);
      scaleUVs(p, w / 2, h / 2); this.planes.brick.push(p);
    };
    const poster = (text: string, bg: string, fg: string, w: number, h: number, x: number, y: number, z: number, nx: number, nz: number) =>
      plane(w, h, x + nx * 0.07, y, z + nz * 0.07, nx, nz, unlitTextured(sc, textTexture(sc, text, { w: 256, h: Math.round(256 * h / w), bg, fg }), "clubPoster" + text), this.root);

    // ---------------------------------------------------------------- outside: brick, factory windows, the hopper door
    const hallTop = 10, wingTop = 5;
    brickPlane(r.maxZ - r.minZ, hallTop, r.maxX, hallTop / 2, (r.minZ + r.maxZ) / 2, 1, 0); // (east, the street)
    brickPlane(hz.maxX - hz.minX + 0.8, hallTop, (hz.minX + hz.maxX) / 2 + 0.2, hallTop / 2, r.minZ, 0, -1);
    brickPlane(hz.maxX - hz.minX + 0.8, hallTop, (hz.minX + hz.maxX) / 2 + 0.2, hallTop / 2, r.maxZ, 0, 1);
    brickPlane(r.maxZ - r.minZ, wingTop, r.minX, wingTop / 2, (r.minZ + r.maxZ) / 2, -1, 0);
    brickPlane(7, wingTop, -78.5, wingTop / 2, r.minZ, 0, -1); brickPlane(7, wingTop, -78.5, wingTop / 2, r.maxZ, 0, 1);
    brickPlane(r.maxZ - r.minZ, hallTop - wingTop, -75.2, (hallTop + wingTop) / 2, (r.minZ + r.maxZ) / 2, -1, 0);
    // tall factory windows high up (they glow pink at night: you can see the party from the street)
    const winTex = new DynamicTexture("clubWin", { width: 128, height: 128 }, sc, true);
    { const c = winTex.getContext() as unknown as CanvasRenderingContext2D; c.fillStyle = "#2b2433"; c.fillRect(0, 0, 128, 128); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 3 ? "#ff3cac" : "#43c7a6"; c.fillRect(i * 32 + 3, j * 32 + 3, 26, 26); } winTex.update(); }
    const winMat = unlitTextured(sc, winTex, "clubWinMat"); this.clubNeon.push({ mat: winMat, base: Color3.White(), ph: 0.3 });
    // (a steel frame round each: four bars, sitting just proud of the glass)
    const frame = (x: number, z: number, nx: number, nz: number) => {
      const ax = Math.abs(nz), az = Math.abs(nx);
      for (const s2 of [-1, 1]) {
        bx(ax * 2.7 + az * 0.12, 0.15, az * 2.7 + ax * 0.12, x + nx * 0.2, 7.4 + s2 * 1.36, z + nz * 0.2, "#3a3444", 0.01);
        bx(ax * 0.15 + az * 0.12, 2.9, az * 0.15 + ax * 0.12, x + nx * 0.2 + ax * s2 * 1.28, 7.4, z + nz * 0.2 + az * s2 * 1.28, "#3a3444", 0.01);
      }
      bx(ax * 2.6 + az * 0.08, 0.06, az * 2.6 + ax * 0.08, x + nx * 0.18, 7.4, z + nz * 0.18, "#3a3444", 0);
    };
    for (const z of [-37, -33, -25, -21, -17, -13]) { plane(2.4, 2.6, r.maxX + 0.15, 7.4, z, 1, 0, winMat); frame(r.maxX, z, 1, 0); }
    for (const x of [-72, -67.5]) for (const [z, n] of [[r.minZ, -1], [r.maxZ, 1]] as const) { plane(2.4, 2.6, x, 7.4, z + n * 0.15, 0, n, winMat); frame(x, z, 0, n); }
    // the front door is a giant garbage truck's hopper mouth: yellow cheeks, a sloped lip, steel teeth, hazard stripes
    const dz = (C.door.minZ + C.door.maxZ) / 2, fx = r.maxX;
    for (const s of [-1, 1]) {
      bx(1.4, 3.6, 0.35, fx + 0.7, 1.8, dz + s * 1.35, "#ffcf3a", 0.03, true);
      plane(1.35, 0.35, fx + 0.7, 0.5, dz + s * 1.55, 0, s, stripes);
    }
    const lip = bx(1.9, 0.4, 3.1, fx + 0.85, 3.75, dz, "#ffcf3a", 0.03, true); lip.rotation.z = -0.35;
    for (let i = 0; i < 7; i++) { const t = MB.CreateCylinder("tooth", { diameterTop: 0, diameterBottom: 0.22, height: 0.4, tessellation: 4 }, sc); t.position.set(fx + 1.55, 3.25, dz - 1.2 + i * 0.4); t.rotation.z = Math.PI; this.add(t, "#c9ccd4", 0.01, false); }
    bx(0.25, 0.25, 3.0, fx + 1.6, 3.55, dz, "#8e8a94", 0.01);
    // rubber flaps hanging in the doorway (you walk through them)
    const flapMat = new StandardMaterial("clubFlap", sc); flapMat.diffuseColor = Color3.FromHexString("#1b1420"); flapMat.alpha = 0.55; flapMat.backFaceCulling = false; flapMat.specularColor = Color3.Black();
    for (let i = 0; i < 6; i++) { const f = MB.CreatePlane("doorFlap", { width: 0.32, height: 2.9 }, sc); f.position.set(fx + 0.02, 1.65, C.door.minZ + 0.18 + i * 0.33); f.rotation.y = -Math.PI / 2; f.material = flapMat; f.parent = this.root; f.isPickable = false; }
    bx(0.12, 1.9, 7.0, fx + 0.12, 5.15, dz, "#1b1420", 0.02); // (the neon's backing board)
    plane(6.6, 1.6, fx + 0.28, 5.15, dz, 1, 0, neon("THE COMPACTOR", "#ff3cac", 6.6, 1.6));
    plane(2.6, 0.55, fx + 0.28, 3.95, dz, 1, 0, neon("OPEN TIL DAWN", "#43c7a6", 2.6, 0.55));
    poster("NO BOXES ON THE DANCE FLOOR", "#1b1420", "#ffcf3a", 1.6, 0.9, fx, 1.9, C.door.minZ - 1.6, 1, 0);
    poster("TONIGHT: DJ CRUNCH", "#ff3cac", "#1b1420", 1.6, 1.0, fx, 1.9, C.door.maxZ + 1.7, 1, 0);
    // the velvet-rope queue along the pavement (gold posts, red rope), a lamp-post sign
    const qx = fx + 2.55;
    for (let i = 0; i < 6; i++) { cyl(0.08, 1.0, qx, 0.65, C.door.minZ - 1.3 - i * 1.4, "#e8b83a", 0.01, 6); sph(0.14, qx, 1.17, C.door.minZ - 1.3 - i * 1.4, "#e8b83a", 0.01, 6); }
    for (let i = 0; i < 5; i++) { const rope = cyl(0.06, 1.4, qx, 0.95, C.door.minZ - 2.0 - i * 1.4, "#c41e3a", 0.005, 6); rope.rotation.x = Math.PI / 2; }
    // ---------------------------------------------------------------- the smokestack (on the wing), neon down its side, lasers at night
    const st = C.stack;
    const stack = MB.CreateCylinder("clubStack", { diameterBottom: st.r * 2, diameterTop: st.r * 1.65, height: st.h, tessellation: 20 }, sc); stack.position.set(st.x, WY + st.h / 2, st.z); this.add(stack, "#8a3f30", 0.05, true);
    for (const [y, c] of [[WY + st.h - 1.0, "#f4f1ea"], [WY + st.h - 2.4, "#d6264a"], [WY + st.h - 3.8, "#f4f1ea"]] as const) cyl(st.r * 1.72, 0.9, st.x, y, st.z, c, 0.01, 20);
    const lip2 = MB.CreateTorus("stackLip", { diameter: st.r * 1.7, thickness: 0.25, tessellation: 20 }, sc); lip2.position.set(st.x, WY + st.h, st.z); this.add(lip2, "#3a3444", 0.01, false);
    for (let i = 0; i < 2; i++) cyl(0.07, st.h - 1, st.x + st.r + 0.15, WY + (st.h - 1) / 2, st.z + (i ? 0.3 : -0.3), "#6f6a78", 0, 4);
    for (let y = WY + 0.6; y < WY + st.h - 1; y += 0.45) bx(0.06, 0.06, 0.66, st.x + st.r + 0.15, y, st.z, "#6f6a78", 0);
    "COMPACTOR".split("").forEach((ch, i) => plane(1.6, 1.6, st.x + st.r * 0.95, WY + st.h - 5.2 - i * 1.65, st.z, 1, 0, neon(ch, i % 2 ? "#43c7a6" : "#ff3cac", 1.6, 1.6)));
    for (let i = 0; i < 4; i++) {
      const pivot = new TransformNode("laserPivot", sc); pivot.parent = dyn; pivot.position.set(st.x, WY + st.h + 0.2, st.z);
      const mat = glow(["#5aff7a", "#ff3cac", "#43c7a6", "#ffd54a"][i], 0.55);
      const beam = MB.CreateCylinder("laser", { diameter: 0.28, height: 70, tessellation: 6 }, sc); beam.position.y = 35; beam.material = mat; beam.parent = pivot; beam.isPickable = false;
      this.clubLasers.push({ pivot, mat, ph: i * 1.7 });
    }
    for (let i = 0; i < 5; i++) { const puff = MB.CreateSphere("stackSmoke", { diameter: 1.6, segments: 5 }, sc); const m = new StandardMaterial("stackSmokeMat" + i, sc); m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#c9c5d6"); m.alpha = 0.3; puff.material = m; puff.parent = dyn; puff.isPickable = false; this.clubSmoke.push({ m: puff, ph: i / 5, x: st.x, y: WY + st.h, z: st.z }); }
    // ---------------------------------------------------------------- the loading dock: the hopper over the conveyor, the belt, the flap
    const b = C.belt, by = C.beltY, bz = (b.minZ + b.maxZ) / 2;
    const hop = MB.CreateCylinder("dockHopper", { diameterTop: 3.4, diameterBottom: 1.6, height: 1.6, tessellation: 4 }, sc); hop.rotation.y = Math.PI / 4; hop.position.set(b.minX + 0.9, by + 1.6, bz); this.add(hop, "#ffcf3a", 0.03, true);
    for (const s of [-1, 1]) cyl(0.12, by + 0.9, b.minX + 0.9 + s * 0.8, (by + 0.9) / 2, bz + s * 0.8, "#4a4652", 0.01, 6);
    plane(1.8, 0.45, b.minX - 0.35, by + 2.65, bz, -1, 0, unlitTextured(sc, textTexture(sc, "TRASH IN", { w: 256, h: 64, bg: "#1b1420", fg: "#ffd54a" }), "clubTrashIn"));
    const beltTex = new DynamicTexture("clubBelt", { width: 64, height: 16 }, sc, true);
    { const c = beltTex.getContext() as unknown as CanvasRenderingContext2D; c.fillStyle = "#2b2433"; c.fillRect(0, 0, 64, 16); c.fillStyle = "#4a4652"; for (let i = 0; i < 4; i++) c.fillRect(i * 16, 0, 6, 16); beltTex.update(); }
    beltTex.wrapU = 1;
    const beltMat = new StandardMaterial("clubBeltMat", sc); beltMat.diffuseTexture = beltTex; beltMat.specularColor = Color3.Black(); beltMat.emissiveColor = Color3.FromHexString("#202020");
    { const bp = MB.CreateGround("beltTop", { width: b.maxX - b.minX, height: b.maxZ - b.minZ - 0.1 }, sc); bp.position.set((b.minX + b.maxX) / 2, by + 0.012, bz); bp.material = beltMat; bp.parent = this.root; bp.isPickable = false; beltTex.uScale = (b.maxX - b.minX) / 0.8; this.clubBelts.push(beltTex); }
    for (let x = b.minX + 0.4; x < b.maxX; x += 1.1) for (const s of [-1, 1]) bx(0.12, 0.12, 0.12, x, by - 0.15, bz + s * 0.74, "#c9ccd4", 0);
    plane(b.maxX - b.minX, 0.2, (b.minX + b.maxX) / 2, by - 0.1, b.minZ - 0.01, 0, -1, stripes);
    plane(4.2, 0.25, -84.25, 0.78, -24.42, 0, -1, stripes);
    for (let i = 0; i < 5; i++) { const f = MB.CreatePlane("beltFlap", { width: 0.28, height: 1.3 }, sc); f.position.set(r.minX + 0.2, by + 0.65, b.minZ + 0.14 + i * 0.28); f.rotation.y = Math.PI / 2; f.material = flapMat; f.parent = this.root; f.isPickable = false; }
    poster("STAFF ONLY. NO CLUBBERS ON THE CONVEYOR. (WE MEAN IT)", "#f4f1ea", "#d6264a", 2.4, 0.9, r.minX, 3.0, b.maxZ + 1.8, -1, 0);
    // bales: crushed cans bound with straps (the climb up to the back roof)
    for (const bb of this.arena.boxes) {
      if (bb.deco !== "bale") continue;
      const top = bb.y + bb.h / 2, bot = bb.y - bb.h / 2;
      for (const k of [0.25, 0.75]) { bx(bb.w + 0.06, 0.08, bb.d + 0.06, bb.x, bot + (top - bot) * k, bb.z, "#1b1420", 0); }
      for (let i = 0; i < Math.round(bb.h * 5); i++) { const h = hash(bb.x + i, bb.z - i); const sx = (hash(i, bb.x) - 0.5) * (bb.w - 0.2), sy = bot + 0.15 + hash(bb.z, i) * (bb.h - 0.3); const side = h > 0.5 ? 1 : -1; bx(0.18, 0.1, 0.03, bb.x + sx, sy, bb.z + side * (bb.d / 2 + 0.01), ["#d6264a", "#3d6fb5", "#c9ccd4", "#ffd54a", "#3d8f5a"][i % 5], 0); }
    }
    // ---------------------------------------------------------------- the hall: the crusher bed, the ram, the crane, the lights
    const f = C.floor, fcx = (f.minX + f.maxX) / 2, fcz = (f.minZ + f.maxZ) / 2, fw = f.maxX - f.minX, fd = f.maxZ - f.minZ;
    {
      const top = new TransformNode("bedTop", sc); top.parent = dyn;
      const slab = MB.CreateBox("bedSlab", { width: fw, height: 0.3, depth: fd }, sc); slab.position.y = -0.15; part(slab, "#5c5866", 0.03, top);
      const tex = new DynamicTexture("bedLeds", { width: 7, height: 8 }, sc, false, Texture.NEAREST_SAMPLINGMODE);
      { const c = tex.getContext() as unknown as CanvasRenderingContext2D; for (let i = 0; i < 7; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? "#ff3cac" : "#43c7a6"; c.fillRect(i, j, 1, 1); } tex.update(); }
      const ledMat = unlitTextured(sc, tex, "bedLedMat");
      const led = MB.CreateGround("bedLed", { width: fw - 0.4, height: fd - 0.4 }, sc); led.position.y = 0.015; led.material = ledMat; led.parent = top; led.isPickable = false;
      for (const [w, d, x, z, ry] of [[fw, 0.2, 0, fd / 2 - 0.1, 0], [fw, 0.2, 0, -fd / 2 + 0.1, 0], [fd, 0.2, fw / 2 - 0.1, 0, Math.PI / 2], [fd, 0.2, -fw / 2 + 0.1, 0, Math.PI / 2]] as const) {
        const hs = MB.CreateGround("bedHaz", { width: w, height: d }, sc); hs.position.set(x, 0.02, z); hs.rotation.y = ry; hs.material = stripes; hs.parent = top; hs.isPickable = false;
      }
      top.position.set(fcx, CLUB.base, fcz);
      const skirt = MB.CreateBox("bedSkirt", { width: fw - 0.3, height: 1, depth: fd - 0.3 }, sc); part(skirt, "#1b1420", 0.02); skirt.position.set(fcx, 0.5, fcz);
      const pistons: Mesh[] = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = MB.CreateCylinder("bedPiston", { diameter: 0.35, height: 1, tessellation: 10 }, sc); part(p, "#d8dce4", 0.01); p.position.set(fcx + sx * (fw / 2 - 0.05), 0.5, fcz + sz * (fd / 2 - 0.05)); pistons.push(p); }
      // the ram: a giant press plate hanging over the floor on four rods (it comes down as the floor goes up)
      const ram = new TransformNode("ram", sc); ram.parent = dyn; ram.position.set(fcx, 8.6, fcz - 0.5);
      part(MB.CreateBox("ramPlate", { width: fw, height: 0.5, depth: fd - 1 }, sc), "#6f6a78", 0.04, ram);
      for (const s of [-1, 1]) { const h = MB.CreatePlane("ramHaz", { width: fw, height: 0.4 }, sc); h.position.set(0, 0, s * ((fd - 1) / 2 + 0.01)); h.rotation.y = s > 0 ? Math.PI : 0; h.material = stripes; h.parent = ram; h.isPickable = false; }
      const warn = MB.CreatePlane("ramWarn", { width: 3.2, height: 0.42 }, sc); warn.position.set(0, -0.26, 0); warn.rotation.x = Math.PI / 2; warn.material = unlitTextured(sc, textTexture(sc, "MIND THE CRUSHER", { w: 512, h: 68, bg: "#ffd54a", fg: "#1b1420" }), "ramWarn"); warn.parent = ram; warn.isPickable = false;
      const ramRods: Mesh[] = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = MB.CreateCylinder("ramRod", { diameter: 0.3, height: 1, tessellation: 8 }, sc); part(p, "#d8dce4", 0.01); p.position.set(fcx + sx * (fw / 2 - 0.8), 9, fcz - 0.5 + sz * ((fd - 1) / 2 - 0.8)); ramRods.push(p); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(0.6, 0.5, fcx + sx * (fw / 2 - 0.8), hallTop - 0.25, fcz - 0.5 + sz * ((fd - 1) / 2 - 0.8), "#4a4652", 0.01, 10);
      this.clubBed = { top, skirt, pistons, tex, beat: -1, ram, ramRods };
    }
    // the gantry crane: rails along the side walls, a girder across over the cab, cables down to it
    for (const x of [hz.minX + 0.25, hz.maxX - 0.25]) bx(0.3, 0.45, hz.maxZ - hz.minZ - 0.6, x, 8.6, (hz.minZ + hz.maxZ) / 2, "#ffcf3a", 0.02);
    bx(hz.maxX - hz.minX, 0.6, 0.6, (hz.minX + hz.maxX) / 2, 8.9, (C.cab.minZ + C.cab.maxZ) / 2, "#ffcf3a", 0.03);
    plane(hz.maxX - hz.minX, 0.25, (hz.minX + hz.maxX) / 2, 8.9, (C.cab.minZ + C.cab.maxZ) / 2 - 0.31, 0, -1, stripes);
    for (const s of [-1, 1]) cyl(0.05, 8.6 - (C.cabY + 2.5), (C.cab.minX + C.cab.maxX) / 2 + s * 1.2, (8.6 + C.cabY + 2.5) / 2, (C.cab.minZ + C.cab.maxZ) / 2, "#3a3444", 0, 4);
    plane(2.6, 0.5, (C.cab.minX + C.cab.maxX) / 2, C.cabY + 2.75, C.cab.minZ - 0.02, 0, -1, neon("DJ CRUNCH", "#43c7a6", 2.6, 0.5));
    // the lighting truss, moving heads with beams of light that sweep the floor
    const tz0 = f.minZ - 1.2, tz1 = f.maxZ + 0.2, tx0 = f.minX - 1, tx1 = f.maxX + 1;
    for (const [w, d, x, z] of [[tx1 - tx0, 0.3, (tx0 + tx1) / 2, tz0], [tx1 - tx0, 0.3, (tx0 + tx1) / 2, tz1], [0.3, tz1 - tz0, tx0, (tz0 + tz1) / 2], [0.3, tz1 - tz0, tx1, (tz0 + tz1) / 2]] as const) bx(w, 0.3, d, x, 9.4, z, "#c9ccd4", 0.01);
    const beamCols = ["#ff3cac", "#43c7a6", "#ffd54a", "#9b3fd6", "#3d8fd6", "#5aff7a"];
    const heads: [number, number][] = [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1], [fcx, tz0], [fcx, tz1]];
    heads.forEach(([x, z], i) => {
      bx(0.4, 0.35, 0.4, x, 9.1, z, "#1b1420", 0.01);
      const pivot = new TransformNode("beamPivot", sc); pivot.parent = dyn; pivot.position.set(x, 8.9, z);
      const mat = glow(beamCols[i], 0.16);
      const cone = MB.CreateCylinder("clubBeam", { diameterTop: 0.25, diameterBottom: 2.2, height: 8.6, tessellation: 12, cap: Mesh.NO_CAP }, sc); cone.position.y = -4.3; cone.material = mat; cone.parent = pivot; cone.isPickable = false;
      // (a cone hangs straight down: tilt it about x by +a to swing its foot toward +z, about z by -a toward +x)
      const lean = (d: number) => Math.atan2(d, 8.6) * 0.8;
      this.clubBeams.push({ pivot, mat, ph: i * 1.3, tx: -lean(fcz - z), tz: lean(fcx - x) });
    });
    // the mirror ball (two thousand crushed cans) over the bar end, and the spots it throws
    {
      const t = new DynamicTexture("canBall", { width: 128, height: 64 }, sc, false);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      for (let i = 0; i < 16; i++) for (let j = 0; j < 8; j++) { const h = hash(i, j); c.fillStyle = h > 0.85 ? "#d6264a" : h > 0.75 ? "#3d6fb5" : h > 0.65 ? "#ffd54a" : `rgb(${190 + h * 60},${190 + h * 60},${200 + h * 55})`; c.fillRect(i * 8, j * 8, 7, 7); }
      t.update();
      const m = new StandardMaterial("canBallMat", sc); m.diffuseTexture = t; m.emissiveTexture = t; m.emissiveColor = Color3.FromHexString("#888888"); m.specularColor = Color3.White(); m.specularPower = 8;
      const ball = MB.CreateSphere("mirrorBall", { diameter: 1.5, segments: 10 }, sc); ball.material = m; ball.parent = dyn; ball.isPickable = false; ball.position.set(fcx, 7.2, -29.2); ink(ball, 0.02);
      cyl(0.04, 2.6, fcx, 8.7, -29.2, "#3a3444", 0, 4);
      this.clubSpin.push({ m: ball, speed: 0.6 });
      for (let i = 0; i < 12; i++) { const sm = glow(beamCols[i % beamCols.length], 0.6); const d = MB.CreateDisc("spot", { radius: 0.22, tessellation: 10 }, sc); d.rotation.x = Math.PI / 2; d.material = sm; d.parent = dyn; d.isPickable = false; this.clubSpots.push({ m: d, ph: i / 12 * Math.PI * 2, mat: sm }); }
    }
    // speaker stacks: woofers that thump
    for (const bb of this.arena.boxes) {
      if (bb.deco !== "speaker") continue;
      const toward = Math.sign(fcx - bb.x) || 1;
      for (const [y, d] of [[bb.y - bb.h / 2 + 0.6, 0.75], [bb.y - bb.h / 2 + 1.45, 0.75], [bb.y + bb.h / 2 - 0.4, 0.3]] as const) {
        const w = MB.CreateCylinder("woofer", { diameter: d, height: 0.08, tessellation: 16 }, sc); w.rotation.z = Math.PI / 2; w.position.set(bb.x + toward * (bb.w / 2 + 0.03), y, bb.z); part(w, "#3a3444", 0.01);
        const cone = MB.CreateCylinder("cone", { diameterTop: d * 0.25, diameterBottom: d * 0.8, height: 0.1, tessellation: 14 }, sc); cone.rotation.z = -toward * Math.PI / 2; cone.position.set(bb.x + toward * (bb.w / 2 + 0.09), y, bb.z); part(cone, "#6f6a78", 0);
        if (d > 0.5) this.clubPulse.push(cone);
      }
      bx(bb.w + 0.04, 0.06, bb.d + 0.04, bb.x, bb.y + bb.h / 2 - 0.03, bb.z, "#c9ccd4", 0);
    }
    // the conveyor bar: the belt on top (drinks ride round), glowing bottles on the back bar, a neon BAR sign
    for (const bb of this.arena.boxes) {
      if (bb.deco === "beltbar") {
        const top = bb.y + bb.h / 2;
        const bt = new DynamicTexture("barBelt", { width: 64, height: 16 }, sc, true);
        { const c = bt.getContext() as unknown as CanvasRenderingContext2D; c.fillStyle = "#1b1420"; c.fillRect(0, 0, 64, 16); c.fillStyle = "#ff3cac"; for (let i = 0; i < 4; i++) c.fillRect(i * 16, 6, 8, 4); bt.update(); }
        bt.wrapU = 1; bt.uScale = bb.w / 0.6;
        const bm = new StandardMaterial("barBeltMat", sc); bm.diffuseTexture = bt; bm.emissiveTexture = bt; bm.disableLighting = true;
        const g = MB.CreateGround("barBeltTop", { width: bb.w - 0.2, height: 0.4 }, sc); g.position.set(bb.x, top + 0.012, bb.z); g.material = bm; g.parent = this.root; g.isPickable = false; this.clubBelts.push(bt);
        for (const s of [-1, 1]) bx(bb.w, 0.08, 0.06, bb.x, top + 0.04, bb.z + s * 0.25, "#c9ccd4", 0);
        const cols = ["#ff3cac", "#43c7a6", "#ffd54a", "#5aff7a"];
        for (let i = 0; i < 9; i++) { const m = MB.CreateCylinder("beltBottle", { diameter: 0.09, height: 0.26, tessellation: 8 }, sc); m.material = glow(cols[i % 4]); m.parent = dyn; m.isPickable = false; this.clubBottles.push({ m, u: i / 9, x0: bb.x - bb.w / 2 + 0.2, x1: bb.x + bb.w / 2 - 0.2, y: top + 0.14, z: bb.z }); }
        plane(2.0, 0.7, bb.x, 3.4, -38.25, 0, 1, neon("BAR", "#43c7a6", 2.0, 0.7));
        poster("NEON FIZZ $5. GLOW STICKS FREE (ASK NICELY)", "#1b1420", "#ffd54a", 2.4, 0.5, bb.x - 2.8, 2.8, -38.25, 0, 1);
      }
      if (bb.deco === "backbar") {
        const cols = ["#ff3cac", "#43c7a6", "#ffd54a", "#9fe3ff"];
        const mats = cols.map((c) => glow(c));
        const groups: Mesh[][] = [[], [], [], []];
        for (const y of [bb.y - bb.h / 2 + 0.9, bb.y - bb.h / 2 + 1.5, bb.y - bb.h / 2 + 2.1]) {
          bx(bb.w, 0.05, 0.5, bb.x, y - 0.03, bb.z + 0.05, "#c9ccd4", 0);
          for (let i = 0; i < 18; i++) { const k = Math.floor(hash(i, y) * 4); const m = MB.CreateCylinder("bb", { diameter: 0.09, height: 0.3 + hash(y, i) * 0.12, tessellation: 6 }, sc); m.position.set(bb.x - bb.w / 2 + 0.25 + i * (bb.w - 0.5) / 17, y + 0.17, bb.z + 0.12); groups[k].push(m); }
        }
        groups.forEach((g, k) => { const mm = Mesh.MergeMeshes(g, true); if (mm) { mm.material = mats[k]; mm.parent = this.root; mm.isPickable = false; } });
      }
      if (bb.deco === "carcube") {
        // a crushed car: a squashed window band, a headlight, a wheel stuck to one side, a number plate
        const top = bb.y + bb.h / 2, bot = bb.y - bb.h / 2;
        bx(bb.w + 0.02, 0.12, bb.d + 0.02, bb.x, bot + bb.h * 0.62, bb.z, "#2b3350", 0);
        sph(0.18, bb.x - bb.w / 2, bot + bb.h * 0.35, bb.z + bb.d / 2 - 0.25, "#ffe9a8", 0);
        const wh = MB.CreateCylinder("cubeWheel", { diameter: 0.42, height: 0.12, tessellation: 12 }, sc); wh.rotation.x = Math.PI / 2; wh.position.set(bb.x + bb.w / 4, bot + 0.25, bb.z + (bb.d / 2 + 0.04)); this.add(wh, "#1b1420", 0.01, false);
        bx(0.34, 0.12, 0.02, bb.x, bot + 0.18, bb.z - bb.d / 2 - 0.01, "#f4f1ea", 0);
        void top;
      }
      if (bb.deco === "lockers") {
        const n = 6, w = bb.w / n, fz2 = bb.z + bb.d / 2 + 0.01;
        for (let i = 0; i < n; i++) { bx(w - 0.06, bb.h - 0.1, 0.02, bb.x - bb.w / 2 + w * (i + 0.5), bb.y, fz2, i % 2 ? "#6a8aa8" : "#5c7a9e", 0); for (let k = 0; k < 3; k++) bx(w * 0.5, 0.03, 0.02, bb.x - bb.w / 2 + w * (i + 0.5), bb.y + bb.h / 2 - 0.25 - k * 0.07, fz2 + 0.01, "#3a3444", 0); }
      }
      if (bb.deco === "flightcase") { for (const s of [-1, 1]) for (const t2 of [-1, 1]) bx(0.05, bb.h, 0.05, bb.x + s * bb.w / 2, bb.y, bb.z + t2 * bb.d / 2, "#c9ccd4", 0); bx(bb.w * 0.7, 0.18, 0.02, bb.x, bb.y, bb.z + bb.d / 2 + 0.01, "#f4f1ea", 0); }
      if (bb.deco === "monitors") { const top = bb.y + bb.h / 2; const scr = glow("#5a9e8a"); for (let i = 0; i < 3; i++) { bx(0.45, 0.35, 0.25, bb.x - 0.55 + i * 0.55, top + 0.22, bb.z + 0.2, "#2b2433", 0.01); const p = plane(0.38, 0.27, bb.x - 0.55 + i * 0.55, top + 0.22, bb.z + 0.06, 0, -1, scr); void p; } }
      if (bb.deco === "files") { for (let i = 0; i < 3; i++) bx(bb.w - 0.1, 0.02, 0.02, bb.x, bb.y - bb.h / 2 + 0.5 + i * 0.6, bb.z + bb.d / 2 + 0.01, "#1b1420", 0); }
      if (bb.deco === "rider") { const top = bb.y + bb.h / 2; cyl(0.4, 0.12, bb.x, top + 0.06, bb.z, "#f4f1ea", 0.01, 12, 0.5); for (let i = 0; i < 10; i++) sph(0.06, bb.x + (hash(i, 1) - 0.5) * 0.28, top + 0.13, bb.z + (hash(1, i) - 0.5) * 0.28, "#3d8fd6", 0, 4); plane(0.5, 0.35, bb.x + 0.3, top + 0.01, bb.z - 0.3, 0, -1, unlitTextured(sc, textTexture(sc, "RIDER: ONLY BLUE JELLYBEANS", { w: 256, h: 180, bg: "#f4f1ea", fg: "#1b1420" }), "riderNote")).rotation.x = Math.PI / 2; }
      if (bb.deco === "bulbmirror" ) {
        const mm = new StandardMaterial("clubMirror", sc); mm.diffuseColor = Color3.FromHexString("#bfe8ff"); mm.emissiveColor = Color3.FromHexString("#3a5a6a"); mm.specularColor = Color3.White();
        plane(1.4, 1.0, bb.x - 0.06, 1.7, bb.z, -1, 0, mm);
        const bulbs: Mesh[] = [];
        for (let i = 0; i < 7; i++) for (const y of [1.15, 2.25]) { const s2 = MB.CreateSphere("mb", { diameter: 0.09, segments: 4 }, sc); s2.position.set(bb.x - 0.08, y, bb.z - 0.7 + i * 0.233); bulbs.push(s2); }
        for (let i = 1; i < 5; i++) for (const zz of [bb.z - 0.75, bb.z + 0.75]) { const s2 = MB.CreateSphere("mb", { diameter: 0.09, segments: 4 }, sc); s2.position.set(bb.x - 0.08, 1.15 + i * 0.22, zz); bulbs.push(s2); }
        const m2 = Mesh.MergeMeshes(bulbs, true); if (m2) { m2.material = glow("#ffe9a8"); m2.parent = this.root; m2.isPickable = false; }
      }
      if (bb.deco === "photobooth") {
        bx(bb.w, bb.h, bb.d, bb.x, bb.y, bb.z, "#ff3cac", 0.03, true);
        const cur = MB.CreatePlane("boothCurtain", { width: 0.7, height: 1.6 }, sc); cur.position.set(bb.x - bb.w / 2 - 0.02, 1.1, bb.z); cur.rotation.y = Math.PI / 2; cur.material = toon(sc, "#c41e3a"); cur.parent = this.root; cur.isPickable = false;
        plane(1.1, 0.4, bb.x - bb.w / 2 - 0.03, 2.0, bb.z, -1, 0, neon("PHOTO $2", "#ffd54a", 1.1, 0.4));
      }
      if (bb.deco === "forklift") {
        const x = bb.x, z = bb.z, base = 0.18;
        bx(1.1, 0.7, 1.4, x, base + 0.6, z + 0.2, "#ffcf3a", 0.03, true);
        bx(1.0, 0.5, 0.5, x, base + 1.0, z + 0.7, "#3a3444", 0.02);
        for (const s of [-1, 1]) { cyl(0.06, 1.0, x + s * 0.48, base + 1.45, z + 0.05, "#3a3444", 0, 4); cyl(0.08, 2.0, x + s * 0.35, base + 1.0, z - 0.6, "#4a4652", 0, 4); bx(0.12, 0.05, 0.9, x + s * 0.25, base + 0.1, z - 1.0, "#6f6a78", 0); }
        bx(1.1, 0.06, 1.0, x, base + 1.95, z + 0.05, "#3a3444", 0.01);
        for (const [s, t2] of [[-1, 0.6], [1, 0.6], [-1, -0.2], [1, -0.2]]) { const w = MB.CreateCylinder("flw", { diameter: 0.45, height: 0.2, tessellation: 12 }, sc); w.rotation.z = Math.PI / 2; w.position.set(x + s * 0.58, base + 0.22, z + t2); this.add(w, "#1b1420", 0.01, false); }
      }
      if (bb.deco === "safe") {
        // (the safe's door and dial are the prop's: it swings open when cracked)
      }
      if (bb.deco === "hottub") {
        const top = bb.y + bb.h / 2;
        const wm = new StandardMaterial("tubWater", sc); wm.diffuseColor = Color3.FromHexString("#43c7d6"); wm.emissiveColor = Color3.FromHexString("#1f6f7a"); wm.alpha = 0.8;
        const water = MB.CreateGround("tubWater", { width: bb.w - 0.25, height: bb.d - 0.25 }, sc); water.position.set(bb.x, top - 0.12, bb.z); water.material = wm; water.parent = this.root; water.isPickable = false;
        plane(bb.w, 0.3, bb.x, top - 0.3, bb.z - bb.d / 2 - 0.01, 0, -1, unlitTextured(sc, textTexture(sc, "THE DUMPSTER JACUZZI", { w: 512, h: 60, bg: "#3d8f5a", fg: "#f4f1ea" }), "tubSign"));
        for (let i = 0; i < 6; i++) { const bub = MB.CreateSphere("bubble", { diameter: 0.14, segments: 4 }, sc); const mm = glow("#e8f7ff", 0.6); bub.material = mm; bub.parent = dyn; bub.isPickable = false; this.clubSmoke.push({ m: bub, ph: -1 - i / 6, x: bb.x + (hash(i, 3) - 0.5) * (bb.w - 0.6), y: top - 0.12, z: bb.z + (hash(3, i) - 0.5) * (bb.d - 0.6) }); }
      }
    }
    // posters round the hall
    poster("COMPACT DISCO", "#ff3cac", "#1b1420", 2.2, 1.4, hz.minX, 3.0, -21, 1, 0);
    poster("THE RECYCLERS - LIVE", "#43c7a6", "#1b1420", 2.2, 1.4, hz.minX, 3.0, -35.5, 1, 0);
    poster("TRASH TALK TUESDAYS", "#ffd54a", "#1b1420", 2.2, 1.4, hz.maxX, 3.0, -24.5, -1, 0);
    poster("MIND THE CRUSHER", "#1b1420", "#ffd54a", 2.0, 1.0, hz.minX, 2.6, -27.8, 1, 0);
    plane(2.2, 0.5, (C.balcony.minX + C.balcony.maxX) / 2 - 2, C.balconyY + 2.1, hz.maxZ - 0.08, 0, -1, neon("THE BALE ROOM (VIP)", "#ffd54a", 3.2, 0.5));
    // ---------------------------------------------------------------- the roof lounge: string lights, a neon sign
    const bulbs: Mesh[] = [];
    for (const z of [-36.5, -31.5, -26.5, -21.5]) for (let i = 0; i <= 10; i++) { const x = hz.minX + 0.6 + i * (hz.maxX - hz.minX - 1.2) / 10, sag = Math.sin(i / 10 * Math.PI) * 0.35; const bb2 = MB.CreateSphere("roofBulb", { diameter: 0.14, segments: 4 }, sc); bb2.position.set(x, Y + 2.3 - sag, z); bulbs.push(bb2); }
    { const mb = Mesh.MergeMeshes(bulbs, true); if (mb) { mb.material = glow("#ffd890"); mb.parent = this.root; mb.isPickable = false; } }
    for (const z of [-36.5, -31.5, -26.5, -21.5]) for (const x of [hz.minX + 0.4, hz.maxX - 0.4]) cyl(0.08, 2.5, x, Y + 1.25, z, "#1b1420", 0.01, 6);
    plane(3.0, 0.7, (hz.minX + hz.maxX) / 2, Y + 1.4, -38.55, 0, 1, neon("ROOF LOUNGE", "#ff3cac", 3.0, 0.7));
    // ---------------------------------------------------------------- the people (looks only)
    const shirts = ["#ff3cac", "#43c7a6", "#ffd54a", "#9b3fd6", "#3d8fd6", "#5aff7a", "#f4f1ea", "#ff7a1f", "#1b1420"];
    const skins = ["#f0c8a0", "#c98a5a", "#8a5a3a", "#f7d9b8", "#e0a878"];
    const person = (x: number, y: number, z: number, yaw: number, i: number, extra?: (n: TransformNode) => void) => {
      const n = new TransformNode("clubber", sc); n.parent = dyn; n.position.set(x, y, z); n.rotation.y = yaw;
      const body = MB.CreateCylinder("cbBody", { diameterTop: 0.36, diameterBottom: 0.44, height: 0.8, tessellation: 8 }, sc); body.position.y = 0.95; part(body, shirts[i % shirts.length], 0.02, n);
      const legs = MB.CreateBox("cbLegs", { width: 0.34, height: 0.55, depth: 0.22 }, sc); legs.position.y = 0.3; part(legs, i % 3 ? "#2b3350" : "#1b1420", 0.01, n);
      const head = MB.CreateSphere("cbHead", { diameter: 0.34, segments: 8 }, sc); head.position.y = 1.55; part(head, skins[i % skins.length], 0.02, n);
      const hair = MB.CreateSphere("cbHair", { diameter: 0.36, segments: 6, slice: 0.5 }, sc); hair.position.y = 1.58; part(hair, ["#1b1420", "#ffd54a", "#ff3cac", "#5a3a24", "#43c7a6"][(i * 7) % 5], 0.01, n);
      const arms: TransformNode[] = [];
      for (const s of [-1, 1]) { const sh = new TransformNode("cbShoulder", sc); sh.parent = n; sh.position.set(s * 0.24, 1.28, 0); const a = MB.CreateCylinder("cbArm", { diameter: 0.1, height: 0.55, tessellation: 5 }, sc); a.position.y = -0.27; part(a, shirts[i % shirts.length], 0.01, sh); arms.push(sh); }
      if (i % 4 === 0) { const gs = MB.CreateCylinder("glowStick", { diameter: 0.04, height: 0.3, tessellation: 4 }, sc); gs.position.y = -0.55; gs.material = glow(["#5aff7a", "#ff3cac", "#43c7a6"][i % 3]); gs.parent = arms[1]; gs.isPickable = false; }
      if (i % 5 === 2) { const sh = MB.CreateBox("shades", { width: 0.3, height: 0.07, depth: 0.03 }, sc); sh.position.set(0, 1.58, 0.17); part(sh, "#1b1420", 0, n); }
      extra?.(n);
      return { n, armL: arms[0], armR: arms[1] };
    };
    const detail = this.detail;
    let k = 0;
    const onFloor: [number, number][] = [];
    for (let i = 0; i < (detail ? 16 : 6); i++) onFloor.push([f.minX + 0.8 + (i % 4) * (fw - 1.6) / 3 + (hash(i, 2) - 0.5) * 0.6, f.minZ + 1.0 + Math.floor(i / 4) * (fd - 2.4) / 3 + (hash(2, i) - 0.5) * 0.6]);
    onFloor.forEach(([x, z], i) => { const p = person(x, CLUB.base, z, hash(i, 9) * Math.PI * 2, k++); this.clubDancers.push({ ...p, ph: hash(i, 5) * 6, floor: true, baseY: CLUB.base, night: i >= (detail ? 5 : 3), air: 0, vy: 0, spin: 0 }); });
    const around: [number, number, number][] = detail ? [[-74.0, -23, 0.18], [-74.0, -19, 0.18], [-65.6, -22, 0.18], [-65.6, -25, 0.18], [-72, -27.6, 0.18], [-67, -27.4, 0.18], [-68.5, -33.4, 0.18], [-72.4, -33.6, 0.18], [-73.4, -10.8, C.balconyY], [-68.2, -10.4, C.balconyY], [-66.2, -12.2, C.balconyY], [-72.0, -12.3, C.balconyY]] : [[-74.0, -23, 0.18], [-68.5, -33.4, 0.18]];
    around.forEach(([x, z, y], i) => { const p = person(x, y, z, Math.atan2(fcx - x, fcz - z), k++); this.clubDancers.push({ ...p, ph: hash(i, 7) * 6, floor: false, baseY: y, night: i % 3 !== 0, air: 0, vy: 0, spin: 0 }); });
    // the bartender behind the bar (shaking a shaker) and the DJ in the cab
    { const p = person(-70.5, 0.18, -36.6, 0, 3); this.clubDancers.push({ ...p, ph: 0, floor: false, baseY: 0.18, night: false, air: 0, vy: 0, spin: 0 }); const sh = MB.CreateCylinder("shaker", { diameter: 0.12, height: 0.25, tessellation: 8 }, sc); sh.position.y = -0.58; part(sh, "#d8dce4", 0.01, p.armR); }
    {
      const dx = (C.cab.minX + C.cab.maxX) / 2, dzz = -16.3;
      const p = person(dx, C.cabY, dzz, Math.PI, 8, (n) => {
        const band = MB.CreateTorus("phones", { diameter: 0.4, thickness: 0.05, tessellation: 12 }, sc); band.rotation.z = Math.PI / 2; band.position.y = 1.6; part(band, "#1b1420", 0, n);
        for (const s of [-1, 1]) { const cup = MB.CreateCylinder("cup", { diameter: 0.16, height: 0.08, tessellation: 10 }, sc); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.2, 1.55, 0); part(cup, "#ff3cac", 0.01, n); }
      });
      this.clubDj = { n: p.n, arm: p.armR };
      // turntables and a mixer on the decks
      const deskTop = C.cabY + 1.0;
      for (const s of [-1, 1]) { const tt = new TransformNode("platter", sc); tt.parent = dyn; tt.position.set(dx + s * 0.75, deskTop + 0.05, -17.25); const pl = MB.CreateCylinder("platterDisc", { diameter: 0.55, height: 0.04, tessellation: 18 }, sc); part(pl, "#1b1420", 0.01, tt); const lab = MB.CreateCylinder("label", { diameter: 0.18, height: 0.045, tessellation: 12 }, sc); part(lab, s < 0 ? "#ff3cac" : "#43c7a6", 0, tt); this.clubSpin.push({ m: tt, speed: 3.5 }); }
      bx(0.5, 0.08, 0.4, dx, deskTop + 0.05, -17.25, "#3a3444", 0.01);
      const knobs: Mesh[] = []; for (let i = 0; i < 6; i++) { const kn = MB.CreateSphere("knob", { diameter: 0.05, segments: 4 }, sc); kn.position.set(dx - 0.15 + (i % 3) * 0.15, deskTop + 0.1, -17.35 + Math.floor(i / 3) * 0.15); knobs.push(kn); }
      const km = Mesh.MergeMeshes(knobs, true); if (km) { km.material = glow("#5aff7a"); km.parent = this.root; km.isPickable = false; }
    }
    // the queue outside
    if (detail) for (let i = 0; i < 5; i++) { const p = person(qx + 0.65, 0.15, C.door.minZ - 1.6 - i * 1.25, 0, 20 + i); this.clubQueue.push({ n: p.n, ph: i * 1.3 }); }
    dyn.setEnabled(false);
  }

  // =================================================================================================
  // R11: NEON FEVER DREAM (Blake: "a neon fever dream", his three pics: purple uplights up the brick, a glowing
  // corner lamp, a starry ceiling with neon rings, a glowing bar with bottle shelves, LED floor waves, a giant light
  // rig and an LED equaliser wall behind the DJ). The walls and floors are boxes (shared layout); here: the brick
  // skin, all the neon, the LED floors, the rig and lasers, the two DJs and the crowd (looks only, cheap instanced
  // figures), the drop's smoke and confetti, the sky beams off the roof at night.
  // =================================================================================================
  private feverDyn: TransformNode | null = null;
  private feverNear = false;
  private feverT = 0;
  private feverLed: { tex: DynamicTexture; t: number; ctx: CanvasRenderingContext2D } | null = null;
  private feverEq: { tex: DynamicTexture; t: number; ctx: CanvasRenderingContext2D } | null = null;
  private feverRig: StandardMaterial[] = [];
  private feverStrips: { mat: StandardMaterial; col: Color3; ph: number }[] = [];
  private feverLasers: { pivot: TransformNode; mat: StandardMaterial; ph: number; spd: number }[] = [];
  private feverBeams: { pivot: TransformNode; mat: StandardMaterial; ph: number }[] = [];
  private feverPeople: { n: TransformNode; armL: TransformNode; armR: TransformNode; ph: number; y: number; night: boolean; dj?: boolean; air: number; vy: number }[] = [];
  private feverPlatters: TransformNode[] = [];
  private feverFx: { m: Mesh; vx: number; vy: number; vz: number; t: number; t0: number; spin: number; smoke: boolean; floorY: number }[] = [];
  private feverFxMats: StandardMaterial[] = [];
  private feverSmokeMat: StandardMaterial | null = null;
  private buildFever() {
    const F = this.arena.fever;
    if (!F) return;
    const sc = this.scene, MB = MeshBuilder, r = F.rect, Y2 = F.y2, RY = F.roofY, A = F.atrium, S2 = Math.SQRT2;
    this.group = -1; this.brk = "";
    const dyn = new TransformNode("feverDyn", sc); dyn.parent = this.root; this.feverDyn = dyn;
    const glowCache = new Map<string, StandardMaterial>();
    const glow = (col: string, alpha = 1) => {
      const key = col + alpha;
      let m = glowCache.get(key);
      if (!m) { m = new StandardMaterial("fvGlow" + key, sc); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(col); m.diffuseColor = Color3.Black(); if (alpha < 1) { m.alpha = alpha; m.backFaceCulling = false; } glowCache.set(key, m); }
      return m;
    };
    // static glowing pieces, merged per colour; inside ones toggle with the club (outside ones always drawn)
    const statics = new Map<string, Mesh[]>();
    const gl = (m: Mesh, col: string, inside: boolean) => { const key = col + "|" + (inside ? 1 : 0); (statics.get(key) ?? statics.set(key, []).get(key)!).push(m); m.isPickable = false; return m; };
    const gbox = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, inside = true, ry = 0) => { const m = MB.CreateBox("fvg", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; return gl(m, col, inside); };
    const cyl = (d: number, h: number, x: number, y: number, z: number, col: string, o = 0.02, t = 12, top?: number) => { const m = MB.CreateCylinder("fvc", { diameter: d, diameterTop: top ?? d, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m; };
    const plane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial, parent: TransformNode = this.root) => {
      const p = MB.CreatePlane("fvp", { width: w, height: h }, sc); p.position.set(x, y, z); p.rotation.y = Math.atan2(-nx, -nz); p.material = mat; p.parent = parent; p.isPickable = false; return p;
    };
    const flat = (x0: number, x1: number, z0: number, z1: number, y: number, mat: StandardMaterial, parent: TransformNode = dyn, uv = 0) => {
      const p = MB.CreateGround("fvf", { width: x1 - x0, height: z1 - z0 }, sc); p.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); p.material = mat; p.parent = parent; p.isPickable = false;
      if (uv) scaleUVs(p, (x1 - x0) / uv, (z1 - z0) / uv);
      return p;
    };
    /** a neon sign: glowing letters on a see-through sheet (they pulse with the music) */
    const neon = (text: string, col: string, w: number, h: number) => {
      const W = 1024, H = Math.max(64, Math.round(1024 * h / w));
      const t = new DynamicTexture("fvNeon-" + text + col, { width: W, height: H }, sc, true);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.clearRect(0, 0, W, H);
      let size = H * 0.72; c.font = `bold ${size}px "Bungee", "Arial Black", sans-serif`;
      while (size > 12 && c.measureText(text).width > W * 0.92) { size -= 4; c.font = `bold ${size}px "Bungee", "Arial Black", sans-serif`; }
      c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
      c.strokeStyle = col; c.globalAlpha = 0.35; c.lineWidth = H * 0.18; c.strokeText(text, W / 2, H / 2);
      c.globalAlpha = 1; c.lineWidth = H * 0.06; c.strokeText(text, W / 2, H / 2);
      c.fillStyle = "#ffffff"; c.fillText(text, W / 2, H / 2);
      t.hasAlpha = true; t.update();
      const m = unlitTextured(sc, t, "fvNeonMat-" + text + col);
      this.feverStrips.push({ mat: m, col: Color3.White(), ph: text.length * 0.7 });
      return m;
    };
    /** a strip of neon whose glow pulses (its own material) */
    const strip = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, parent: TransformNode, ph = 0, ry = 0) => {
      const m = MB.CreateBox("fvStrip", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; m.parent = parent; m.isPickable = false;
      const mat = new StandardMaterial("fvStripMat", sc); mat.disableLighting = true; const c3 = Color3.FromHexString(col); mat.emissiveColor = c3.clone(); mat.diffuseColor = Color3.Black(); m.material = mat;
      this.feverStrips.push({ mat, col: c3, ph }); return m;
    };
    const PURPLE = "#b04dff", BLUE = "#3d7bff", PINK = "#ff3cd2", CYAN = "#3df0ff";
    const MX = r.minX + F.cham / 2, MZ = r.minZ + F.cham / 2; // (the cut corner's middle: the front door)
    // ---------------------------------------------------------------- outside: the brick, the uplights, the sign, the lamp
    {
      for (const b of this.arena.boxes) {
        if (b.deco !== "shell") continue;
        const y0 = b.y - b.h / 2, h = b.h;
        if (b.poly) { // (the cut corner: brick on its outer face)
          let best = 0, bv = Infinity;
          for (let q = 0; q < b.poly.length; q++) { const [ax, az] = b.poly[q], [cx, cz] = b.poly[(q + 1) % b.poly.length]; const v = ax + az + cx + cz; if (v < bv) { bv = v; best = q; } }
          const [ax, az] = b.poly[best], [cx, cz] = b.poly[(best + 1) % b.poly.length], len = Math.hypot(cx - ax, cz - az);
          const p = MB.CreatePlane("fvBrick", { width: len, height: h }, sc); p.position.set((ax + cx) / 2 - 0.1 / S2, y0 + h / 2, (az + cz) / 2 - 0.1 / S2); p.rotation.y = Math.atan2(1, 1); scaleUVs(p, len / 2, h / 2); this.planes.brick.push(p);
          continue;
        }
        const faces: [number, number, number, number, number][] = []; // (centre x, z, width, normal x, z)
        if (b.x - b.w / 2 <= r.minX + 0.02) faces.push([b.x - b.w / 2 - 0.09, b.z, b.d, -1, 0]);
        if (b.x + b.w / 2 >= r.maxX - 0.02) faces.push([b.x + b.w / 2 + 0.09, b.z, b.d, 1, 0]);
        if (b.z - b.d / 2 <= r.minZ + 0.02) faces.push([b.x, b.z - b.d / 2 - 0.09, b.w, 0, -1]);
        if (b.z + b.d / 2 >= r.maxZ - 0.02 && y0 + h > 11) faces.push([b.x, b.z + b.d / 2 + 0.09, b.w, 0, 1]);
        for (const [x, z, w, nx, nz] of faces) { const p = MB.CreatePlane("fvBrick", { width: w, height: h }, sc); p.position.set(x, y0 + h / 2, z); p.rotation.y = Math.atan2(-nx, -nz); scaleUVs(p, w / 2, h / 2); this.planes.brick.push(p); }
        // (purple uplights up every pier at street level: a glowing slot and a wash of light up the brick)
        if (y0 > 0.85 && y0 < 0.95 && b.h < 4.1 && (b.w < 0.8 || b.d < 0.8)) for (const [x, z, , nx, nz] of faces) {
          gbox(nx ? 0.06 : 0.5, 0.12, nz ? 0.06 : 0.5, x + nx * 0.08, 0.32, z + nz * 0.08, PURPLE, false);
          plane(0.9, 4.6, x + nx * 0.05, 2.6, z + nz * 0.05, nx, nz, glow(PURPLE, 0.22));
        }
      }
      // the floor-2 band and the parapet: neon trim right round the street sides (and the cut corner)
      const trim = (y: number, col: string) => {
        strip(0.08, 0.1, r.maxZ - r.minZ - F.cham, r.minX - 0.12, y, (r.minZ + F.cham + r.maxZ) / 2, col, this.root, 0.2);
        strip(r.maxX - r.minX - F.cham, 0.1, 0.08, (r.minX + F.cham + r.maxX) / 2, y, r.minZ - 0.12, col, this.root, 0.5);
        strip(F.cham * S2, 0.1, 0.08, MX - 0.12 / S2, y, MZ - 0.12 / S2, col, this.root, 0.8, Math.PI / 4);
        strip(0.08, 0.1, r.maxZ - r.minZ, r.maxX + 0.12, y, (r.minZ + r.maxZ) / 2, col, this.root, 1.1);
      };
      trim(5.0, PINK); trim(Y2 + 0.5, PURPLE); trim(RY + 1.15, CYAN);
      // the sign: over the door in the cut corner, along Market Row and the side street
      plane(6.4, 1.3, MX - 0.25 / S2, 4.15, MZ - 0.25 / S2, -1 / S2, -1 / S2, neon("NEON FEVER DREAM", PINK, 6.4, 1.3));
      plane(12, 1.0, r.minX - 0.2, 5.4, 19.5, -1, 0, neon("NEON FEVER DREAM", PURPLE, 12, 1.0));
      plane(12, 1.0, 90, 5.4, r.minZ - 0.2, 0, -1, neon("NEON FEVER DREAM", PURPLE, 12, 1.0));
      plane(3.0, 0.5, MX - 0.25 / S2, 3.45, MZ - 0.25 / S2, -1 / S2, -1 / S2, neon("ALL NIGHT. EVERY NIGHT.", CYAN, 3.0, 0.5));
      // the corner lamp (pic 1): a black post, a glowing purple lantern
      const lx = MX - 2.6 / S2, lz = MZ - 2.6 / S2;
      cyl(0.16, 4.6, lx, 0.15 + 2.3, lz, "#1b1420", 0.02, 8);
      cyl(0.5, 0.18, lx, 4.6, lz, "#1b1420", 0.01, 8);
      gl(MB.CreateCylinder("fvLamp", { diameterTop: 0.75, diameterBottom: 0.4, height: 0.85, tessellation: 8 }, sc), "#e9a8ff", false).position.set(lx, 5.15, lz);
      cyl(0.82, 0.12, lx, 5.62, lz, "#1b1420", 0.01, 8);
      plane(3.2, 3.2, lx, 5.1, lz, -1 / S2, -1 / S2, glow(PURPLE, 0.12)).billboardMode = Mesh.BILLBOARDMODE_ALL;
      // the door: a red carpet, brass posts and a velvet rope
      { const c = MB.CreateGround("fvCarpet", { width: 2.4, height: 4.2 }, sc); c.position.set(MX - 1.6 / S2, 0.17, MZ - 1.6 / S2); c.rotation.y = Math.PI / 4; this.add(c, "#8e1f3a", 0, false); }
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        const px = MX - (1.0 + k * 1.3) / S2 + s * 1.5 / S2, pz = MZ - (1.0 + k * 1.3) / S2 - s * 1.5 / S2;
        cyl(0.09, 1.0, px, 0.65, pz, "#d9a632", 0.01, 8); cyl(0.2, 0.06, px, 0.18, pz, "#d9a632", 0.01, 8);
        if (k < 2) { const ro = MB.CreateCylinder("fvRope", { diameter: 0.06, height: 1.3, tessellation: 6 }, sc); ro.position.set(px - 0.65 / S2, 0.95, pz - 0.65 / S2); ro.rotation.set(Math.PI / 2, Math.PI / 4, 0); this.add(ro, "#7a1030", 0, false); }
      }
      // the bay's glass and frame; floor 2's ribbon of glass is in the shell (see-through panes)
      const B = F.bay;
      const gmat = new StandardMaterial("fvBayGlass", sc); gmat.diffuseColor = Color3.FromHexString("#3a2a6a"); gmat.emissiveColor = Color3.FromHexString("#2a1a4a"); gmat.alpha = 0.28; gmat.backFaceCulling = false; gmat.specularColor = Color3.White();
      for (const b of this.arena.boxes) if (b.deco === "bay") { const m = MB.CreateBox("fvBay", { width: b.w, height: b.h, depth: b.d }, sc); m.position.set(b.x, b.y, b.z); m.material = gmat; m.parent = this.root; m.isPickable = false; }
      for (const [x, z] of [[B.minX, B.minZ], [B.minX, B.maxZ]] as [number, number][]) gbox(0.1, RY - 0.9 - Y2, 0.1, x + 0.05, (Y2 + RY - 0.9) / 2, z, PINK, false);
      gbox(0.08, 0.08, B.maxZ - B.minZ, B.minX + 0.04, Y2 + 0.02, (B.minZ + B.maxZ) / 2, PINK, false);
      gbox(0.08, 0.08, B.maxZ - B.minZ, B.minX - 0.16, RY - 0.52, (B.minZ + B.maxZ) / 2, PINK, false);
    }
    // ---------------------------------------------------------------- glass railings (both floors and the roof), the roof's glass floor
    {
      const rmat = new StandardMaterial("fvRailGlass", sc); rmat.diffuseColor = Color3.FromHexString("#6a5aff"); rmat.emissiveColor = Color3.FromHexString("#2a2060"); rmat.alpha = 0.25; rmat.backFaceCulling = false;
      for (const b of this.arena.boxes) if (b.deco === "rail") {
        const m = MB.CreateBox("fvRail", { width: b.w, height: b.h, depth: b.d }, sc); m.position.set(b.x, b.y, b.z); m.material = rmat; m.isPickable = false;
        const top = b.y + b.h / 2 > RY + 0.5;
        m.parent = top ? this.root : dyn;
        gbox(b.w + 0.02, 0.05, b.d + 0.02, b.x, b.y + b.h / 2, b.z, top ? CYAN : BLUE, !top);
      }
      const gf = F.glassFloor;
      const fmat = new StandardMaterial("fvGlassFloor", sc); fmat.diffuseColor = Color3.FromHexString("#9ad8ff"); fmat.emissiveColor = Color3.FromHexString("#1a2a50"); fmat.alpha = 0.22; fmat.backFaceCulling = false; fmat.specularColor = Color3.White();
      const g = MB.CreateBox("fvGlassFloorPane", { width: gf.maxX - gf.minX, height: 0.08, depth: gf.maxZ - gf.minZ }, sc); g.position.set((gf.minX + gf.maxX) / 2, RY - 0.05, (gf.minZ + gf.maxZ) / 2); g.material = fmat; g.parent = this.root; g.isPickable = false;
      for (let x = gf.minX; x <= gf.maxX + 0.01; x += (gf.maxX - gf.minX) / 4) gbox(0.08, 0.06, gf.maxZ - gf.minZ, x, RY + 0.01, (gf.minZ + gf.maxZ) / 2, PINK, false);
      for (const z of [gf.minZ, gf.maxZ]) gbox(gf.maxX - gf.minX, 0.06, 0.08, (gf.minX + gf.maxX) / 2, RY + 0.01, z, PINK, false);
    }
    // ---------------------------------------------------------------- the LED floor (floor 1 under the atrium, floor 2 round it, the roof)
    {
      const tex = new DynamicTexture("fvLed", { width: 256, height: 256 }, sc, false);
      tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
      const mat = new StandardMaterial("fvLedMat", sc); mat.disableLighting = true; mat.emissiveTexture = tex; mat.diffuseColor = Color3.Black();
      this.feverLed = { tex, t: 0, ctx: tex.getContext() as unknown as CanvasRenderingContext2D };
      this.feverLed.ctx.fillStyle = "#05030c"; this.feverLed.ctx.fillRect(0, 0, 256, 256); tex.update(false); // (drawn once now: a texture never drawn is never "ready")
      const roofMat = new StandardMaterial("fvLedRoof", sc); roofMat.disableLighting = true; roofMat.emissiveTexture = tex; roofMat.diffuseColor = Color3.Black();
      flat(A.minX, A.maxX, A.minZ, A.maxZ, 0.215, mat, dyn, 12);
      const d2 = F.dance2, yy = Y2 + 0.065; // (clear of the slab's outline)
      flat(d2.minX, d2.maxX, d2.minZ, A.minZ - 0.1, yy, mat, dyn, 12); flat(d2.minX, d2.maxX, A.maxZ + 0.1, d2.maxZ, yy, mat, dyn, 12);
      flat(d2.minX, A.minX - 0.1, A.minZ - 0.1, A.maxZ + 0.1, yy, mat, dyn, 12); flat(A.maxX + 0.1, d2.maxX, A.minZ - 0.1, A.maxZ + 0.1, yy, mat, dyn, 12);
      const dr = F.danceRoof, ry = RY + 0.065, s2 = F.stairs2;
      flat(dr.minX, dr.maxX, s2.maxZ + 0.2, A.minZ - 0.15, ry, roofMat, this.root, 12); flat(dr.minX, dr.maxX, A.maxZ + 0.15, dr.maxZ, ry, roofMat, this.root, 12);
      flat(dr.minX, A.minX - 0.15, A.minZ - 0.15, A.maxZ + 0.15, ry, roofMat, this.root, 12);
    }
    // ---------------------------------------------------------------- inside: the starry ceilings and neon rings, wall neon, the stairs' LED
    {
      const stars = new DynamicTexture("fvStars", { width: 512, height: 512 }, sc, false);
      const c = stars.getContext() as unknown as CanvasRenderingContext2D;
      c.fillStyle = "#07051a"; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) { const v = hash(i, 3.3); c.fillStyle = v < 0.55 ? "#ffffff" : v < 0.8 ? "#9ad8ff" : "#e9a8ff"; c.globalAlpha = 0.4 + hash(i, 7.1) * 0.6; const s = hash(i, 1.9) < 0.9 ? 1.6 : 3; c.fillRect(hash(i, 5.5) * 512, hash(9.1, i) * 512, s, s); }
      c.globalAlpha = 1; stars.update();
      stars.wrapU = Texture.WRAP_ADDRESSMODE; stars.wrapV = Texture.WRAP_ADDRESSMODE;
      const smat = new StandardMaterial("fvStarsMat", sc); smat.disableLighting = true; smat.emissiveTexture = stars; smat.diffuseColor = Color3.Black(); smat.backFaceCulling = false;
      const ceil = (y: number, holes: { minX: number; maxX: number; minZ: number; maxZ: number }[]) => {
        const x0 = r.minX + 0.3, x1 = r.maxX - 0.3, z0 = r.minZ + 0.3, z1 = r.maxZ - 0.3;
        const h = holes[0];
        for (const [a, b2, c2, d] of [[r.minX + F.cham, x1, z0, h.minZ], [x0, x1, h.maxZ, z1], [x0, h.minX, h.minZ, h.maxZ], [h.maxX, x1, h.minZ, h.maxZ]] as [number, number, number, number][]) {
          const p = flat(a, b2, c2, d, y, smat, dyn, 8); p.rotation.x = Math.PI; // (facing down)
        }
      };
      ceil(Y2 - 0.42, [A]); ceil(RY - 0.42, [A]);
      // neon rings on the ceilings (pic 2) round the atrium, and over the bar
      const ring = (x: number, y: number, z: number, d: number, col: string, ph: number) => { const t = MB.CreateTorus("fvRing", { diameter: d, thickness: 0.07, tessellation: 40 }, sc); t.position.set(x, y, z); t.parent = dyn; t.isPickable = false; const mat = new StandardMaterial("fvRingMat", sc); mat.disableLighting = true; const c3 = Color3.FromHexString(col); mat.emissiveColor = c3.clone(); t.material = mat; this.feverStrips.push({ mat, col: c3, ph }); };
      const ax = (A.minX + A.maxX) / 2, az = (A.minZ + A.maxZ) / 2;
      ring(ax, Y2 - 0.5, az, 14.5, PURPLE, 0); ring(ax, Y2 - 0.55, az, 17.5, BLUE, 1.3);
      ring(94.3, Y2 - 0.5, 27.6, 4.5, PINK, 2.1); ring(81, Y2 - 0.5, 12, 4, CYAN, 3.3); ring(81, Y2 - 0.55, 25, 3.2, PURPLE, 4.1);
      // wall neon (floor 1: low and high; floor 2: low, and a line under the rig)
      const wallLines = (y: number, col: string, ph: number) => {
        strip(0.05, 0.06, r.maxZ - r.minZ - F.cham - 0.6, r.minX + 0.36, y, (r.minZ + F.cham + r.maxZ) / 2, col, dyn, ph); // (from the cut corner on)
        strip(0.05, 0.06, r.maxZ - r.minZ - 0.8, r.maxX - 0.36, y, (r.minZ + r.maxZ) / 2, col, dyn, ph + 0.5);
        strip(r.maxX - r.minX - F.cham - 0.4, 0.06, 0.05, (r.minX + F.cham + r.maxX) / 2, y, r.minZ + 0.36, col, dyn, ph + 1);
        strip(r.maxX - r.minX - 0.8, 0.06, 0.05, (r.minX + r.maxX) / 2, y, r.maxZ - 0.36, col, dyn, ph + 1.5);
      };
      wallLines(0.45, PURPLE, 0); wallLines(5.2, BLUE, 0.7); wallLines(Y2 + 0.4, PINK, 1.4); wallLines(RY - 1.6, PURPLE, 2.1);
      // every step's nose: an LED strip (purple and blue, alternately)
      for (const b of this.arena.boxes) if (b.kind === "step" && inRectXZ(r, b.x, b.z)) {
        const along = b.d > b.w; const top = b.y + b.h / 2;
        gbox(along ? 0.04 : b.w, 0.03, along ? b.d : 0.04, b.x - (along ? b.w / 2 : 0) * (b.x > 95 ? -1 : 1), top + 0.005, b.z, Math.round(top * 5) % 2 ? PURPLE : BLUE, true);
      }
      // the stages and the catwalk: LED edges
      for (const s of F.stages) { const sx = (s.minX + s.maxX) / 2, sz = (s.minZ + s.maxZ) / 2; for (const dz of [-1, 1]) gbox(s.maxX - s.minX + 0.04, 0.06, 0.04, sx, Y2 + 0.68, sz + dz * (s.maxZ - s.minZ) / 2, CYAN); for (const dx of [-1, 1]) gbox(0.04, 0.06, s.maxZ - s.minZ, sx + dx * (s.maxX - s.minX) / 2, Y2 + 0.68, sz, CYAN); }
      const cw = F.catwalk; for (const z of [cw.minZ, cw.maxZ]) gbox(cw.maxX - cw.minX, 0.05, 0.05, (cw.minX + cw.maxX) / 2, Y2 - 0.27, z, PINK);
    }
    // ---------------------------------------------------------------- floor 1: the bar (glowing bottles), the booths' tables, the speakers
    {
      const B = F.bar, bz = r.maxZ - 0.55;
      strip(B.maxX - B.minX, 0.08, 0.04, (B.minX + B.maxX) / 2, 1.0, B.minZ - 0.02, BLUE, dyn, 0.3);
      strip(B.maxX - B.minX, 0.05, 0.04, (B.minX + B.maxX) / 2, 0.3, B.minZ - 0.02, PURPLE, dyn, 0.9);
      gbox(B.maxX - B.minX, 0.03, 0.9, (B.minX + B.maxX) / 2, 1.27, (B.minZ + B.maxZ) / 2, "#e8e2ff");
      for (const y of [1.45, 2.15, 2.85]) {
        gbox(B.maxX - B.minX, 0.03, 0.5, (B.minX + B.maxX) / 2, y - 0.04, bz + 0.05, CYAN); // (the lit shelf)
        for (let x = B.minX + 0.2; x < B.maxX - 0.1; x += 0.22) { const k = Math.floor(hash(x * 3, y * 7) * 4); const b = MB.CreateCylinder("fvBottle", { diameter: 0.09, diameterTop: 0.04, height: 0.3 + (k % 2) * 0.08, tessellation: 6 }, sc); b.position.set(x, y + 0.17, bz); gl(b, ["#ff3cd2", "#3df0ff", "#b04dff", "#ffd54a"][k], true); }
      }
      for (const b of this.arena.boxes) if (b.deco === "glowtable") gl(MB.CreateCylinder("fvTableGlow", { diameter: Math.min(b.w, b.d) * 1.1, height: 0.03, tessellation: 16 }, sc), "#d8b0ff", true).position.set(b.x, b.y + b.h / 2 + 0.02, b.z);
      for (const b of this.arena.boxes) if (b.deco === "speaker") { const ax = (A.minX + A.maxX) / 2, az = (A.minZ + A.maxZ) / 2, yaw = Math.atan2(ax - b.x, az - b.z); for (const y of [0.9, 1.75]) { const cone = MB.CreateCylinder("fvCone", { diameter: 0.55, diameterTop: 0.3, height: 0.08, tessellation: 12 }, sc); cone.rotation.set(Math.PI / 2, yaw, 0); cone.position.set(b.x + Math.sin(yaw) * 0.46, y, b.z + Math.cos(yaw) * 0.46); this.group = 9201; this.add(cone, "#2b2433", 0.01, false); this.group = -1; } gbox(0.6, 0.04, 0.6, b.x, 2.33, b.z, PINK); }
      // the bar's sign, a menu
      plane(4.0, 0.7, 94.3, 3.9, bz - 0.25, 0, -1, neon("MOCKTAILS", CYAN, 4.0, 0.7), dyn);
      plane(5.0, 0.5, 94.3, 3.3, bz - 0.25, 0, -1, neon("THE FEVER  -  BLUE SCREEN  -  THE DROP  $8", PINK, 5.0, 0.5), dyn);
    }
    // ---------------------------------------------------------------- floor 2: the light rig, lasers, the LED equaliser wall, TRASH PANDA's decks
    const ax = (A.minX + A.maxX) / 2, az = (A.minZ + A.maxZ) / 2;
    {
      const rigY = RY - 1.15, x0 = A.minX - 3, x1 = A.maxX + 3, z0 = A.minZ - 3, z1 = A.maxZ + 3;
      const truss = (w: number, d: number, x: number, z: number) => { const m = MB.CreateBox("fvTruss", { width: w, height: 0.3, depth: d }, sc); m.position.set(x, rigY, z); this.group = 9202; this.add(m, "#2b2a33", 0.015, false); this.group = -1; };
      truss(x1 - x0, 0.3, ax, z0); truss(x1 - x0, 0.3, ax, z1); truss(0.3, z1 - z0, x0, az); truss(0.3, z1 - z0, x1, az);
      for (const x of [x0, x1]) for (const z of [z0, z1]) { const m = MB.CreateBox("fvHang", { width: 0.06, height: RY - 0.4 - rigY, depth: 0.06 }, sc); m.position.set(x, (rigY + RY - 0.4) / 2, z); this.group = 9202; this.add(m, "#1b1420", 0, false); this.group = -1; }
      for (let g = 0; g < 3; g++) { const mat = new StandardMaterial("fvRig" + g, sc); mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString([PINK, CYAN, "#ffffff"][g]); this.feverRig.push(mat); }
      let k = 0;
      const bar = (x: number, z: number, alongX: boolean) => { const m = MB.CreateBox("fvRigBar", { width: alongX ? 1.1 : 0.12, height: 0.1, depth: alongX ? 0.12 : 1.1 }, sc); m.position.set(x, rigY - 0.22, z); m.material = this.feverRig[k++ % 3]; m.parent = dyn; m.isPickable = false; };
      for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.4) { bar(x, z0, true); bar(x, z1, true); }
      for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.4) { bar(x0, z, false); bar(x1, z, false); }
      // lasers: thin beams from the rig's corners and the DJ's wall
      const cols = ["#3dff7a", "#3df0ff", "#ff3cd2", "#b04dff"];
      const laser = (x: number, y: number, z: number, i: number, len: number) => {
        const pv = new TransformNode("fvLaserPivot", sc); pv.parent = dyn; pv.position.set(x, y, z);
        const m = MB.CreateBox("fvLaser", { width: 0.03, height: 0.03, depth: len }, sc); m.position.z = len / 2; m.parent = pv; m.isPickable = false;
        const mat = new StandardMaterial("fvLaserMat", sc); mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString(cols[i % 4]); mat.alpha = 0.55; mat.backFaceCulling = false; m.material = mat;
        this.feverLasers.push({ pivot: pv, mat, ph: i * 1.7, spd: 0.4 + (i % 3) * 0.25 });
      };
      let li = 0;
      for (const x of [x0, x1]) for (const z of [z0, z1]) for (let q = 0; q < 2; q++) laser(x, rigY - 0.3, z, li++, 16);
      for (let q = 0; q < 4; q++) laser(r.maxX - 0.6, Y2 + 4.8, 15.5 + q * 2.6, li++, 22);
      for (let q = 0; q < 3; q++) laser(ax - 3 + q * 3, Y2 - 0.6, az + (q - 1) * 5.5, li++, 9); // (floor 1: from under the floor-2 slab)
      // the LED equaliser wall behind the decks (pic 3's pink bars)
      const tex = new DynamicTexture("fvEq", { width: 512, height: 256 }, sc, false);
      const mat = new StandardMaterial("fvEqMat", sc); mat.disableLighting = true; mat.emissiveTexture = tex; mat.diffuseColor = Color3.Black();
      this.feverEq = { tex, t: 0, ctx: tex.getContext() as unknown as CanvasRenderingContext2D };
      this.feverEq.ctx.fillStyle = "#07030e"; this.feverEq.ctx.fillRect(0, 0, 512, 256); tex.update(false);
      plane(9.0, 4.4, r.maxX - 0.34, Y2 + 3.4, 19.5, -1, 0, mat, dyn);
      plane(5.5, 1.0, r.maxX - 0.36, Y2 + 6.0, 19.5, -1, 0, neon("DJ TRASH PANDA", PINK, 5.5, 1.0), dyn);
      // the decks: a desk on the booth, two spinning platters, a mixer
      const dj = F.dj, deskX = dj.x - 1.0;
      const desk = MB.CreateBox("fvDesk", { width: 0.8, height: 1.0, depth: 3.2 }, sc); desk.position.set(deskX, dj.y + 0.5, dj.z); this.group = 9202; this.add(desk, "#141018", 0.015, false); this.group = -1;
      strip(0.04, 0.06, 3.2, deskX - 0.42, dj.y + 0.95, dj.z, CYAN, dyn, 0.4); strip(0.04, 0.06, 3.2, deskX - 0.42, dj.y + 0.1, dj.z, PINK, dyn, 1.0);
      for (const s of [-1, 1]) { const pv = new TransformNode("fvPlatter", sc); pv.parent = dyn; pv.position.set(deskX, dj.y + 1.03, dj.z + s * 0.9); const pl = MB.CreateCylinder("fvPl", { diameter: 0.6, height: 0.04, tessellation: 18 }, sc); pl.parent = pv; pl.material = toon(sc, "#1b1420"); pl.isPickable = false; const lab = MB.CreateBox("fvLab", { width: 0.25, height: 0.05, depth: 0.04 }, sc); lab.parent = pv; lab.position.y = 0.01; lab.material = glow(PINK); lab.isPickable = false; this.feverPlatters.push(pv); }
      gbox(0.4, 0.08, 0.5, deskX, dj.y + 1.04, dj.z, "#3dff7a");
      // LIL PANDA's decks on the roof, his pavilion's neon
      const d2 = F.dj2, P = F.pavilion;
      const desk2 = MB.CreateBox("fvDesk2", { width: 0.7, height: 1.0, depth: 2.4 }, sc); desk2.position.set(d2.x - 0.9, d2.y + 0.5, d2.z); this.add(desk2, "#141018", 0.015, false);
      strip(0.04, 0.06, 2.4, d2.x - 1.27, d2.y + 0.95, d2.z, PINK, this.root, 0.6);
      for (const s of [-1, 1]) { const pv = new TransformNode("fvPlatter2", sc); pv.parent = this.root; pv.position.set(d2.x - 0.9, d2.y + 1.03, d2.z + s * 0.65); const pl = MB.CreateCylinder("fvPl2", { diameter: 0.5, height: 0.04, tessellation: 16 }, sc); pl.parent = pv; pl.material = toon(sc, "#1b1420"); pl.isPickable = false; this.feverPlatters.push(pv); }
      for (const b of this.arena.boxes) if (b.deco === "canopy") { strip(b.w + 0.04, 0.12, 0.06, b.x, b.y - 0.1, b.z - b.d / 2, PINK, this.root, 0.3); strip(b.w + 0.04, 0.12, 0.06, b.x, b.y - 0.1, b.z + b.d / 2, PINK, this.root, 0.9); strip(0.06, 0.12, b.d, b.x - b.w / 2, b.y - 0.1, b.z, PINK, this.root, 1.5); }
      for (const b of this.arena.boxes) if (b.deco === "crown") {
        const nm = neon("NEON FEVER DREAM", CYAN, 6, 0.8);
        plane(Math.min(6, b.w - 0.1), 0.8, b.x, b.y, b.z - b.d / 2 - 0.05, 0, -1, nm); plane(Math.min(6, b.d - 0.1), 0.8, b.x - b.w / 2 - 0.05, b.y, b.z, -1, 0, nm);
        strip(b.w + 0.06, 0.08, b.d + 0.06, b.x, b.y + b.h / 2 + 0.02, b.z, PURPLE, this.root, 2.2);
      }
      plane(3.6, 0.7, P.minX - 0.05, RY + 3.4, (P.minZ + P.maxZ) / 2, -1, 0, neon("LIL PANDA", PURPLE, 3.6, 0.7));
      // string lights over the roof's dance floor
      { const bulbs: Mesh[] = []; for (const z of [12, 17, 22, 27]) for (let i = 0; i <= 12; i++) { const x = r.minX + 3 + i * (P.minX - r.minX - 4) / 12, sag = Math.sin(i / 12 * Math.PI) * 0.4; const b = MB.CreateSphere("fvBulb", { diameter: 0.14, segments: 4 }, sc); b.position.set(x, RY + 3.2 - sag, z); bulbs.push(b); }
        const mb = Mesh.MergeMeshes(bulbs, true); if (mb) { mb.material = glow("#ffd8ff"); mb.parent = this.root; mb.isPickable = false; }
        for (const z of [12, 17, 22, 27]) { cyl(0.08, 3.4, r.minX + 2.6, RY + 1.7, z, "#1b1420", 0.01, 6); const w = MB.CreateBox("fvCable", { width: P.minX - r.minX - 2.6, height: 0.02, depth: 0.02 }, sc); w.position.set((r.minX + 2.6 + P.minX) / 2, RY + 3.3, z); this.add(w, "#1b1420", 0, false); } }
      // the sky beams (night): two big searchlights off the pavilion, seen right across town
      for (let q = 0; q < 2; q++) {
        const pv = new TransformNode("fvBeamPivot", sc); pv.parent = this.root; pv.position.set(P.minX + 1 + q * (P.maxX - P.minX - 2), RY + 4.4, P.minZ + 0.6);
        const m = MB.CreateCylinder("fvBeam", { diameterTop: 5, diameterBottom: 0.4, height: 70, tessellation: 12 }, sc); m.position.y = 35; m.parent = pv; m.isPickable = false;
        const mat = new StandardMaterial("fvBeamMat", sc); mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString(q ? "#b04dff" : "#3d7bff"); mat.alpha = 0.08; mat.backFaceCulling = false; m.material = mat;
        this.feverBeams.push({ pivot: pv, mat, ph: q * 2.4 });
      }
    }
    // ---------------------------------------------------------------- the people (looks only): instanced, so 45 cost a few draw calls
    {
      const detail = this.detail;
      const shirts = ["#ff3cd2", "#3df0ff", "#ffd54a", "#b04dff", "#f4f1ea", "#5aff7a"];
      const skins = ["#f0c8a0", "#c98a5a", "#8a5a3a", "#f7d9b8"];
      const src = (mk: () => Mesh, col: string, emis = 0.25) => { const m = mk(); const mat = new StandardMaterial("fvPpl" + col, sc); mat.diffuseColor = Color3.FromHexString(col); mat.emissiveColor = Color3.FromHexString(col).scale(emis); mat.specularColor = Color3.Black(); m.material = mat; m.parent = dyn; m.position.y = -500; m.isPickable = false; return m; };
      const bodies = shirts.map((c) => src(() => MB.CreateCylinder("fvBody", { diameterTop: 0.36, diameterBottom: 0.44, height: 0.8, tessellation: 8 }, sc), c));
      const arms = shirts.map((c) => src(() => MB.CreateCylinder("fvArm", { diameter: 0.1, height: 0.55, tessellation: 5 }, sc), c));
      const heads = skins.map((c) => src(() => MB.CreateSphere("fvHead", { diameter: 0.34, segments: 6 }, sc), c, 0.15));
      const legs = src(() => MB.CreateBox("fvLegs", { width: 0.34, height: 0.55, depth: 0.22 }, sc), "#1b1a2a", 0.1);
      const hair = ["#1b1420", "#ffd54a", "#ff3cd2", "#5a3a24"].map((c) => src(() => MB.CreateSphere("fvHair", { diameter: 0.36, segments: 5, slice: 0.5 }, sc), c, 0.2));
      const sticks = ["#5aff7a", "#ff3cd2", "#3df0ff"].map((c) => { const m = MB.CreateCylinder("fvStick", { diameter: 0.04, height: 0.3, tessellation: 4 }, sc); m.material = glow(c); m.parent = dyn; m.position.y = -500; m.isPickable = false; return m; });
      let id = 0;
      const person = (x: number, y: number, z: number, yaw: number, night: boolean, scale = 1) => {
        const i = id++;
        const n = new TransformNode("fvPerson", sc); n.parent = dyn; n.position.set(x, y, z); n.rotation.y = yaw; n.scaling.setAll(scale);
        const inst = (s: Mesh, px: number, py: number, pz: number, parent: TransformNode = n) => { const m = s.createInstance("fvI"); m.parent = parent; m.position.set(px, py, pz); m.isPickable = false; return m; };
        inst(bodies[i % shirts.length], 0, 0.95, 0); inst(legs, 0, 0.3, 0); inst(heads[i % skins.length], 0, 1.55, 0); inst(hair[(i * 7) % 4], 0, 1.58, 0);
        const sh: TransformNode[] = [];
        for (const s of [-1, 1]) { const p = new TransformNode("fvShoulder", sc); p.parent = n; p.position.set(s * 0.24, 1.28, 0); inst(arms[i % shirts.length], 0, -0.27, 0, p); sh.push(p); }
        if (i % 3 === 0) inst(sticks[i % 3], 0, -0.55, 0, sh[1]);
        this.feverPeople.push({ n, armL: sh[0], armR: sh[1], ph: hash(i, 5) * 6, y, night, air: 0, vy: 0 });
        return { n, armL: sh[0], armR: sh[1] };
      };
      const pick = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }, n: number, y: number, seed: number, ok: (x: number, z: number) => boolean, faceTo?: [number, number]) => {
        let made = 0;
        for (let q = 0; q < 400 && made < n; q++) {
          const x = rect.minX + 0.5 + hash(q, seed) * (rect.maxX - rect.minX - 1), z = rect.minZ + 0.5 + hash(seed, q) * (rect.maxZ - rect.minZ - 1);
          if (!ok(x, z) || this.feverPeople.some((p) => Math.abs(p.y - y) < 1 && Math.hypot(p.n.position.x - x, p.n.position.z - z) < 0.9)) continue;
          person(x, y, z, faceTo ? Math.atan2(faceTo[0] - x, faceTo[1] - z) + (hash(q, 2) - 0.5) : hash(q, 9) * 6.28, made >= Math.ceil(n / 3));
          made++;
        }
      };
      const notIn = (q: { minX: number; maxX: number; minZ: number; maxZ: number }, m: number) => (x: number, z: number) => !(x > q.minX - m && x < q.maxX + m && z > q.minZ - m && z < q.maxZ + m);
      const f1 = detail ? 1 : 0.55;
      // floor 1: under the atrium, at the bar
      pick(A, Math.round(10 * f1), 0.2, 11, () => true, [ax, az]);
      pick({ minX: F.bar.minX, maxX: F.bar.maxX, minZ: F.bar.minZ - 1.4, maxZ: F.bar.minZ - 0.3 }, Math.round(5 * f1), 0.2, 13, () => true, [94, r.maxZ]);
      // floor 2: round the atrium (facing the DJ), on the stages, on the catwalk
      const dj = F.dj;
      pick(F.dance2, Math.round(14 * f1), Y2, 17, (x, z) => notIn(A, 0.4)(x, z) && notIn(F.stages[0], 0.3)(x, z) && notIn(F.stages[1], 0.3)(x, z), [dj.x, dj.z]);
      for (const s of F.stages) pick(s, 2, Y2 + 0.7, 19 + s.minZ, () => true, [dj.x, dj.z]);
      pick(F.catwalk, detail ? 2 : 1, Y2, 23, () => true, [dj.x, dj.z]);
      // the roof: round the glass floor (facing LIL PANDA)
      pick(F.danceRoof, Math.round(10 * f1), RY, 29, (x, z) => notIn(A, 0.4)(x, z) && notIn(F.stairs2, 0.6)(x, z), [F.dj2.x, F.dj2.z]);
      // the two DJs: raccoons in LED helmets
      const raccoon = (x: number, y: number, z: number, yaw: number, scale: number, helmet: string) => {
        const n = new TransformNode("fvPanda", sc); n.parent = dyn; n.position.set(x, y, z); n.rotation.y = yaw; n.scaling.setAll(scale);
        const p = (m: Mesh, col: string | StandardMaterial, px: number, py: number, pz: number, parent: TransformNode = n) => { m.parent = parent; m.position.set(px, py, pz); m.material = typeof col === "string" ? toon(sc, col) : col; ink(m, 0.02); m.isPickable = false; return m; };
        p(MB.CreateCapsule("pBody", { height: 1.1, radius: 0.34, tessellation: 8 }, sc), "#8a8a96", 0, 0.75, 0);
        p(MB.CreateSphere("pBelly", { diameter: 0.5, segments: 8 }, sc), "#c8c8d0", 0, 0.75, 0.15).scaling.set(1, 1.2, 0.6);
        const head = new TransformNode("pHead", sc); head.parent = n; head.position.y = 1.5;
        p(MB.CreateSphere("pSkull", { diameter: 0.58, segments: 10 }, sc), "#8a8a96", 0, 0, 0, head);
        p(MB.CreateBox("pMask", { width: 0.56, height: 0.14, depth: 0.1 }, sc), "#1b1420", 0, 0.02, 0.24, head);
        p(MB.CreateSphere("pSnout", { diameter: 0.22, segments: 6 }, sc), "#e8e8ee", 0, -0.1, 0.26, head);
        p(MB.CreateSphere("pNose", { diameter: 0.08, segments: 4 }, sc), "#1b1420", 0, -0.08, 0.37, head);
        for (const s of [-1, 1]) p(MB.CreateCylinder("pEar", { diameterTop: 0, diameterBottom: 0.18, height: 0.2, tessellation: 4 }, sc), "#6a6a76", s * 0.2, 0.3, 0, head);
        // the LED helmet: a glowing dome and a visor strip
        const dome = MB.CreateSphere("pHelmet", { diameter: 0.68, segments: 10, slice: 0.55 }, sc); dome.parent = head; dome.position.y = 0.04; dome.material = glow(helmet, 0.55); dome.isPickable = false;
        strip(0.5, 0.07, 0.06, 0, 0.02, 0.31, helmet, head, 0.2);
        for (let q = 0; q < 5; q++) p(MB.CreateCylinder("pTail", { diameter: 0.2 - q * 0.02, height: 0.18, tessellation: 8 }, sc), q % 2 ? "#1b1420" : "#a8a8b4", 0, 0.45 + q * 0.03, -0.38 - q * 0.16).rotation.x = 1.1;
        const sh: TransformNode[] = [];
        for (const s of [-1, 1]) { const so = new TransformNode("pShoulder", sc); so.parent = n; so.position.set(s * 0.36, 1.12, 0.05); p(MB.CreateCylinder("pArm", { diameter: 0.14, height: 0.6, tessellation: 6 }, sc), "#8a8a96", 0, -0.3, 0, so); p(MB.CreateSphere("pPaw", { diameter: 0.17, segments: 5 }, sc), "#1b1420", 0, -0.62, 0, so); sh.push(so); }
        this.feverPeople.push({ n, armL: sh[0], armR: sh[1], ph: 0, y, night: false, dj: true, air: 0, vy: 0 });
      };
      raccoon(dj.x, dj.y, dj.z, dj.yaw, 1.25, CYAN);
      raccoon(F.dj2.x, F.dj2.y, F.dj2.z, F.dj2.yaw, 0.95, PINK);
      // the queue outside (night): up Market Row's pavement from the rope
      if (detail) for (let q = 0; q < 7; q++) person(r.minX - 1.2 + (q % 2) * 0.35, 0.15, MZ + 2.5 + q * 1.15, Math.PI, true);
      // a bartender (behind the bar, shaking)
      person(92.5, 0.2, F.bar.maxZ + 0.6, Math.PI, false);
    }
    // ---------------------------------------------------------------- merge the static glow
    for (const [key, list] of statics) {
      const [col, ins] = key.split("|");
      for (let i = 0; i < list.length; i += 800) {
        const m = Mesh.MergeMeshes(list.slice(i, i + 800), true, true);
        if (!m) continue;
        m.material = glow(col); m.isPickable = false; m.parent = ins === "1" ? dyn : this.root;
      }
    }
    dyn.setEnabled(false);
  }

  /** R11: the DROP: confetti from the rig, smoke off the stages, everybody jumps */
  feverDrop() {
    const F = this.arena.fever;
    if (!F || !this.feverNear) return;
    const A = F.atrium, cols = ["#ff3cd2", "#3df0ff", "#ffd54a", "#b04dff", "#5aff7a", "#f4f1ea"];
    if (!this.feverFxMats.length) for (const c of cols) { const m = new StandardMaterial("fvConf" + c, this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(c); m.backFaceCulling = false; this.feverFxMats.push(m); }
    if (!this.feverSmokeMat) { const m = new StandardMaterial("fvSmoke", this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#c8b8ff"); m.alpha = 0.18; this.feverSmokeMat = m; }
    const n = this.detail ? 80 : 30;
    for (let i = 0; i < n; i++) {
      const m = MeshBuilder.CreatePlane("fvConfetti", { width: 0.12, height: 0.08 }, this.scene); m.material = this.feverFxMats[i % cols.length]; m.isPickable = false; m.parent = this.feverDyn;
      const x = A.minX - 3 + Math.random() * (A.maxX - A.minX + 6), z = A.minZ - 3 + Math.random() * (A.maxZ - A.minZ + 6);
      m.position.set(x, F.roofY - 1.4, z);
      this.feverFx.push({ m, vx: (Math.random() - 0.5) * 2, vy: -0.5 - Math.random(), vz: (Math.random() - 0.5) * 2, t: 6 + Math.random() * 3, t0: 9, spin: (Math.random() - 0.5) * 14, smoke: false, floorY: x > A.minX && x < A.maxX && z > A.minZ && z < A.maxZ ? 0.25 : F.y2 + 0.03 });
    }
    for (const s of F.stages) for (let i = 0; i < (this.detail ? 6 : 3); i++) {
      const m = MeshBuilder.CreateSphere("fvSmokePuff", { diameter: 1, segments: 5 }, this.scene); m.material = this.feverSmokeMat; m.isPickable = false; m.parent = this.feverDyn;
      m.position.set((s.minX + s.maxX) / 2 + (Math.random() - 0.5), F.y2 + 0.8, (s.minZ + s.maxZ) / 2 + (Math.random() - 0.5));
      this.feverFx.push({ m, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5, t: 3.5, t0: 3.5, spin: 0, smoke: true, floorY: 0 });
    }
    for (const p of this.feverPeople) if (!p.dj && p.air <= 0) { p.vy = 3 + Math.random() * 1.5; p.air = 1; }
  }

  /** R11: everything that moves at NEON FEVER DREAM (inside: only worked out when you're near). level: 0 outside,
   *  1-2 the floors, 3 the roof (the camera's) */
  updateFever(dt: number, clock: number, night: number, camX: number, camY: number, camZ: number, level: number) {
    const F = this.arena.fever, dyn = this.feverDyn;
    if (!F || !dyn) return;
    void camY; void level;
    const r = F.rect, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    const near = Math.hypot(camX - cx, camZ - cz) < 100;
    if (near !== this.feverNear) { this.feverNear = near; dyn.setEnabled(near); }
    this.feverT += dt;
    const t = this.feverT, at = feverAt(clock), beat = at.beat, pulse = Math.pow(1 - beat, 2.2);
    const drop = at.part === "drop", build = at.part === "build";
    const energy = drop ? 1 : build ? 0.55 + at.k * 0.45 : 0.45 + 0.1 * Math.sin(t);
    // the neon breathes with the kick (brighter at night)
    const nk = 0.55 + night * 0.45;
    for (const s of this.feverStrips) { const fl = nk * (0.75 + 0.25 * (drop ? pulse : 0.5 + 0.5 * Math.sin(t * 1.3 + s.ph))); s.mat.emissiveColor = s.col.scale(fl); }
    // the sky beams (night only), swaying
    for (const b of this.feverBeams) { b.pivot.setEnabled(night > 0.3); b.pivot.rotation.z = Math.sin(t * 0.25 + b.ph) * 0.5; b.pivot.rotation.x = Math.cos(t * 0.19 + b.ph) * 0.35; b.mat.alpha = 0.05 + 0.05 * night + (drop ? 0.04 * pulse : 0); }
    for (const pv of this.feverPlatters) pv.rotation.y += dt * 3.5;
    // the people (the roof's and the queue are drawn with the rest: all under dyn)
    if (!near) return;
    for (const p of this.feverPeople) {
      if (!p.dj) p.n.setEnabled(!p.night || night > 0.35);
      if (p.air > 0) { p.vy -= 14 * dt; p.n.position.y += p.vy * dt; if (p.n.position.y <= p.y) { p.n.position.y = p.y; p.air = 0; } p.armL.rotation.z = 2.7; p.armR.rotation.z = -2.7; continue; }
      const ph = p.ph, bob = Math.abs(Math.sin(Math.PI * (clock * 128 / 60) + ph * 0.2)) * (p.dj ? 0.06 : 0.1 + energy * 0.12);
      p.n.position.y = p.y + bob + (drop && !p.dj ? Math.max(0, Math.sin(Math.PI * clock * 128 / 60 + ph)) * 0.18 : 0);
      if (p.dj) { const up = drop ? 2.6 + Math.sin(t * 8) * 0.3 : build ? 0.8 + at.k * 1.9 : 0.5 + Math.abs(Math.sin(t * 3)) * 0.5; p.armL.rotation.z = up; p.armR.rotation.z = -(drop ? up : 0.6 + Math.abs(Math.sin(t * 4.1)) * 0.3); continue; }
      const up = drop ? 2.5 + Math.sin(t * 9 + ph) * 0.3 : build ? 0.6 + at.k * 2.1 + Math.sin(t * 16 + ph) * 0.15 * at.k : 0.4 + Math.abs(Math.sin(t * 2.07 + ph)) * 1.4;
      p.armL.rotation.z = up; p.armR.rotation.z = -(drop || build ? up : 0.4 + Math.abs(Math.cos(t * 1.9 + ph)) * 1.7);
      p.n.rotation.y += Math.sin(t * 0.5 + ph) * dt * 0.5;
    }
    // the rig: chase on the groove, strobe on the drop, everything white at the top of the build
    this.feverRig.forEach((m, g) => {
      const on = drop ? (Math.floor(beat * 4) % 3 === g ? 1 : 0.15) * (0.4 + pulse * 0.8) : build ? (at.k > 0.9 ? 1 : (Math.floor(t * (4 + at.k * 20)) % 3 === g ? 1 : 0.1)) : (Math.floor(t * 2) % 3 === g ? 0.8 : 0.15);
      const base = g === 2 ? [1, 1, 1] : g === 0 ? [1, 0.24, 0.82] : [0.24, 0.94, 1];
      m.emissiveColor = new Color3(base[0] * on, base[1] * on, base[2] * on);
    });
    // lasers: slow sweeps on the groove, fast on the build, a fan on the drop
    const wild = drop ? 1.6 : build ? 0.6 + at.k * 3 : 0.5;
    for (const l of this.feverLasers) {
      l.pivot.rotation.y = Math.sin(t * l.spd * wild + l.ph) * 1.3 + l.ph;
      l.pivot.rotation.x = 0.6 + Math.sin(t * l.spd * 0.7 * wild + l.ph * 1.3) * 0.45;
      l.mat.alpha = (drop ? 0.35 + 0.5 * pulse : build ? 0.25 + 0.3 * at.k : 0.22) * (0.7 + night * 0.3);
    }
    // the LED floor and the equaliser wall (redrawn ~20 times a second)
    const led = this.feverLed;
    if (led && (led.t += dt) > 0.05) {
      led.t = 0;
      const c = led.ctx, N = 16, S = 256 / N, k = clock * 128 / 60;
      c.fillStyle = "#05030c"; c.fillRect(0, 0, 256, 256);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = i - N / 2 + 0.5, dz = j - N / 2 + 0.5, d = Math.sqrt(dx * dx + dz * dz);
        const w = drop ? 0.5 + 0.5 * Math.sin(d * 0.9 - k * Math.PI) : build ? 0.5 + 0.5 * Math.sin((i + j) * 0.6 - t * (3 + at.k * 14)) : 0.5 + 0.5 * Math.sin(i * 0.5 + t * 1.2) * Math.sin(j * 0.45 - t * 0.9);
        const v = Math.min(1, w * (drop ? 0.55 + pulse * 0.6 : 0.65));
        const hue = drop ? (d * 18 + k * 30) % 360 : build ? 270 + 40 * Math.sin(t + i * 0.2) : 230 + 50 * Math.sin(t * 0.3 + j * 0.15);
        c.fillStyle = `hsl(${hue.toFixed(0)}, 95%, ${(8 + v * 55).toFixed(0)}%)`;
        c.fillRect(i * S + 1, j * S + 1, S - 2, S - 2);
      }
      led.tex.update(false);
      const eq = this.feverEq;
      if (eq) {
        const e = eq.ctx; e.fillStyle = "#07030e"; e.fillRect(0, 0, 512, 256);
        for (let q = 0; q < 32; q++) {
          const h = (0.25 + 0.75 * Math.abs(Math.sin(q * 0.7 + t * (2 + (q % 5)) + Math.sin(t * 0.7 + q)))) * (drop ? 0.55 + pulse * 0.45 : build ? 0.3 + at.k * 0.6 : 0.35 + 0.15 * pulse);
          const g = e.createLinearGradient(0, 256, 0, 256 - h * 240); g.addColorStop(0, "#ff3cd2"); g.addColorStop(1, drop ? "#ffffff" : "#b04dff");
          e.fillStyle = g; e.fillRect(q * 16 + 2, 256 - h * 240, 12, h * 240);
        }
        eq.tex.update(false);
      }
    }
    // confetti and smoke
    for (let i = this.feverFx.length - 1; i >= 0; i--) {
      const c = this.feverFx[i];
      c.t -= dt;
      if (c.t <= 0) { c.m.dispose(); this.feverFx.splice(i, 1); continue; }
      if (c.smoke) { c.vy *= 1 - dt * 0.8; c.m.scaling.setAll(1 + (1 - c.t / c.t0) * 3); c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt; continue; }
      c.vy = Math.max(-0.9, c.vy - 3 * dt);
      c.m.position.x += c.vx * dt; c.m.position.z += c.vz * dt; c.m.position.y = Math.max(c.floorY, c.m.position.y + c.vy * dt);
      if (c.m.position.y > c.floorY) { c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.6 * dt; }
    }
  }

  /** C5c.3: the DROP just happened: confetti cannons */
  clubBurst() {
    const C = this.arena.club;
    if (!C || !this.clubNear) return;
    const f = C.floor, cols = ["#ff3cac", "#43c7a6", "#ffd54a", "#9b3fd6", "#5aff7a", "#f4f1ea"];
    for (let i = 0; i < (this.detail ? 70 : 25); i++) {
      const m = MeshBuilder.CreatePlane("confetti", { width: 0.12, height: 0.08 }, this.scene);
      const mat = new StandardMaterial("confettiMat", this.scene); mat.disableLighting = true; mat.emissiveColor = Color3.FromHexString(cols[i % cols.length]); mat.backFaceCulling = false; m.material = mat; m.isPickable = false;
      const sx = i % 2 ? f.minX : f.maxX;
      m.position.set(sx, 3.5, f.minZ + Math.random() * (f.maxZ - f.minZ));
      this.clubConfetti.push({ m, vx: (sx < (f.minX + f.maxX) / 2 ? 1 : -1) * (2 + Math.random() * 4), vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 3, t: 4 + Math.random() * 2, spin: (Math.random() - 0.5) * 14 });
    }
    // everyone on the crusher goes flying
    for (const d of this.clubDancers) if (d.floor && d.air <= 0) { d.vy = 7 + Math.random() * 3; d.air = 1; d.spin = (Math.random() - 0.5) * 10; }
  }

  /** C5c.3: everything that moves at THE COMPACTOR. clock: the city clock; dropT: seconds since the last DROP started building. */
  updateClub(dt: number, clock: number, dropT: number, night: number, camX: number, camZ: number) {
    const C = this.arena.club, dyn = this.clubDyn;
    if (!C || !dyn) return;
    const cx = (C.rect.minX + C.rect.maxX) / 2, cz = (C.rect.minZ + C.rect.maxZ) / 2;
    const near = Math.hypot(camX - cx, camZ - cz) < 90;
    if (near !== this.clubNear) { this.clubNear = near; dyn.setEnabled(near); }
    // (the neon glows at night from anywhere: it's the stack you see across town)
    const nk = 0.45 + night * 0.55;
    this.clubT += dt;
    const t = this.clubT;
    for (const n of this.clubNeon) { const fl = 0.85 + 0.15 * Math.sin(t * 9 + n.ph * 5) * Math.sin(t * 3.1 + n.ph); n.mat.emissiveColor = new Color3(nk * fl, nk * fl, nk * fl); }
    if (!near) return;
    const st = clubStage(dropT);
    const y = clubFloorY(clock, clock - dropT);
    const beat = Math.abs(Math.sin(Math.PI * clock * CLUB.bpm / 60 / 2));
    const k = Math.max(0, Math.min(1, (y - CLUB.base) / (CLUB.top - CLUB.base)));
    // the bed and its LEDs, the ram coming down as the bed goes up
    const bed = this.clubBed;
    if (bed) {
      bed.top.position.y = y;
      bed.skirt.scaling.y = Math.max(0.05, y - 0.3); bed.skirt.position.y = Math.max(0.05, y - 0.3) / 2;
      for (const p of bed.pistons) { p.scaling.y = Math.max(0.05, y - 0.3); p.position.y = Math.max(0.05, y - 0.3) / 2; }
      bed.ram.position.y = 8.6 - k * 2.0;
      for (const r of bed.ramRods) { const top = 9.75, bot = bed.ram.position.y + 0.25; r.scaling.y = top - bot; r.position.y = (top + bot) / 2; }
      const bi = Math.floor(clock * CLUB.bpm / 60);
      if (bi !== bed.beat) {
        bed.beat = bi;
        const c = bed.tex.getContext() as unknown as CanvasRenderingContext2D;
        const pal = st === "build" || st === "hold" ? ["#ff3b30", "#ffd54a", "#1b1420"] : ["#ff3cac", "#43c7a6", "#ffd54a", "#9b3fd6", "#3d8fd6", "#1b1420", "#1b1420"];
        for (let i = 0; i < 7; i++) for (let j = 0; j < 8; j++) { c.fillStyle = pal[Math.floor(hash(i + bi * 3.1, j - bi) * pal.length)]; c.fillRect(i, j, 1, 1); }
        bed.tex.update();
      }
    }
    // speakers thump, belts roll, things spin
    for (const m of this.clubPulse) m.scaling.set(1, 1 + beat * 0.6, 1);
    for (const b of this.clubBelts) b.uOffset -= dt * CLUB.beltSpeed / 0.8 * 0.25;
    for (const s of this.clubSpin) s.m.rotation.y += dt * s.speed;
    for (const b of this.clubBottles) { b.u = (b.u + dt * 0.05) % 1; b.m.position.set(b.x0 + (b.x1 - b.x0) * b.u, b.y, b.z); }
    // beams sweep (wild on the build, all pointing straight down on the drop)
    const wild = st === "build" ? 2.5 : st === "hold" ? 0 : 1;
    for (const b of this.clubBeams) {
      // (each head leans in toward the middle of the floor and sweeps a little round it: the beams stay inside)
      b.pivot.rotation.x = b.tx + Math.sin(t * 0.9 * wild + b.ph) * 0.22 * Math.min(1, wild);
      b.pivot.rotation.z = b.tz + Math.cos(t * 0.7 * wild + b.ph * 1.7) * 0.22 * Math.min(1, wild);
      b.mat.alpha = (0.08 + 0.12 * beat) * (0.6 + night * 0.4) + (st === "hold" ? 0.15 : 0);
    }
    const ball = this.clubSpin[0]?.m;
    this.clubSpots.forEach((s, i) => { const a = s.ph + t * 0.6; const rr = 3.5 + (i % 3) * 1.6; s.m.position.set((ball?.position.x ?? -69.5) + Math.cos(a) * rr, 0.21 + (i % 2) * 0.002, (ball?.position.z ?? -29) + Math.sin(a) * rr * 0.8); s.mat.alpha = 0.35 + beat * 0.3; });
    for (const l of this.clubLasers) { l.pivot.rotation.z = Math.sin(t * 0.5 + l.ph) * 0.9; l.pivot.rotation.x = Math.cos(t * 0.37 + l.ph) * 0.9; l.pivot.setEnabled(night > 0.35); l.mat.alpha = 0.4 + 0.3 * beat; }
    for (const s of this.clubSmoke) {
      if (s.ph >= 0) { const kk = (t * 0.12 + s.ph) % 1; s.m.position.set(s.x + kk * 3, s.y + kk * 9, s.z + Math.sin(kk * 6 + s.ph * 9) * 0.6); s.m.scaling.setAll(0.6 + kk * 2.2); (s.m.material as StandardMaterial).alpha = 0.32 * (1 - kk); }
      else { const kk = (t * 0.7 - s.ph) % 1; s.m.position.set(s.x, s.y + kk * 0.25, s.z); s.m.scaling.setAll(0.5 + kk); }
    }
    // the crowd: bob to the beat, arms up on the build, launched on the drop (night: the full crowd; day: a few)
    for (const d of this.clubDancers) {
      d.n.setEnabled(!d.night || night > 0.4);
      if (d.air > 0) {
        d.vy -= 22 * dt; d.n.position.y += d.vy * dt; d.n.rotation.x += d.spin * dt * 0.3;
        const ground = d.floor ? y : d.baseY;
        if (d.n.position.y <= ground && d.vy < 0) { d.n.position.y = ground; d.air = 0; d.n.rotation.x = 0; }
        d.armL.rotation.z = 2.6; d.armR.rotation.z = -2.6;
        continue;
      }
      const ph = d.ph;
      const bob = Math.abs(Math.sin(Math.PI * clock * CLUB.bpm / 60 + ph * 0.3)) * 0.12;
      d.n.position.y = (d.floor ? y : d.baseY) + bob;
      const up = st === "build" || st === "hold" ? 2.7 + Math.sin(t * 14 + ph) * 0.2 : 0.5 + Math.abs(Math.sin(t * 2.07 + ph)) * 1.6;
      d.armL.rotation.z = up; d.armR.rotation.z = -(st ? up : 0.4 + Math.abs(Math.cos(t * 1.9 + ph)) * 1.9);
      d.n.rotation.y += Math.sin(t * 0.5 + ph) * dt * 0.4;
    }
    if (this.clubDj) { this.clubDj.n.position.y = C.cabY + Math.abs(Math.sin(Math.PI * clock * CLUB.bpm / 60)) * 0.06; this.clubDj.arm.rotation.z = -(st === "hold" ? 2.9 : 0.6 + Math.abs(Math.sin(t * 4)) * 0.4); }
    for (const q of this.clubQueue) { q.n.setEnabled(night > 0.25); q.n.position.y = 0.15 + Math.max(0, Math.sin(t * 1.3 + q.ph)) * 0.03; q.n.rotation.y = Math.sin(t * 0.3 + q.ph) * 0.4; }
    // confetti
    for (let i = this.clubConfetti.length - 1; i >= 0; i--) {
      const c = this.clubConfetti[i];
      c.t -= dt;
      if (c.t <= 0) { c.m.material?.dispose(); c.m.dispose(); this.clubConfetti.splice(i, 1); continue; }
      c.vy = Math.max(-1.2, c.vy - 9 * dt); c.vx *= 1 - dt * 0.8; c.vz *= 1 - dt * 0.8;
      c.m.position.x += c.vx * dt; c.m.position.y = Math.max(0.2, c.m.position.y + c.vy * dt); c.m.position.z += c.vz * dt;
      c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.6 * dt;
    }
  }

  // =================================================================================================
  // C5c.3: PAWN-O-RAMA (looks only): a wall of guitars, telly sets showing static, a suit of armour, a stuffed bear,
  // trophies, bars over Sal's counter, Sal's dog Collateral asleep in his basket; outside: the three gold balls,
  // a neon WE BUY ANYTHING*. The pawn case's contents are the prop's (they come and go).
  // =================================================================================================
  private pawnStatic: { tex: DynamicTexture; t: number } | null = null;
  private buildPawnShop() {
    const ps = this.arena.pawnShop;
    if (!ps) return;
    const u = this.arena.units![ps.unit];
    const sc = this.scene, MB = MeshBuilder;
    const [nx, nz] = u.out, rx = -nz, rz = nx;
    const P = (uu: number, v: number): [number, number] => [u.doorX + rx * uu - nx * v, u.doorZ + rz * uu - nz * v];
    const yawIn = Math.atan2(-nx, -nz), yawOut = Math.atan2(nx, nz);
    const node = (uu: number, v: number, y: number, yaw = yawOut) => { const [x, z] = P(uu, v); const n = new TransformNode("pawnBit", sc); n.position.set(x, y, z); n.rotation.y = yaw; return n; };
    const bake = (n: TransformNode) => { // (looks-only bits: bake into the city's merged meshes)
      n.computeWorldMatrix(true);
      for (const m of n.getChildMeshes(false) as Mesh[]) {
        const col = (m.metadata as { col?: string } | null)?.col ?? "#8e8a94";
        const wm = m.computeWorldMatrix(true).clone();
        m.parent = null; m.position.setAll(0); m.rotation.setAll(0); m.scaling.setAll(1); m.rotationQuaternion = null;
        m.bakeTransformIntoVertices(wm);
        this.add(m, col, 0.015, false);
      }
      n.dispose();
    };
    const mk = (n: TransformNode, m: Mesh, col: string, x: number, y: number, z: number) => { m.parent = n; m.position.set(x, y, z); m.metadata = { col }; return m; };
    // ---- outside (always drawn): the three gold balls on a bracket, the neon in the window, a banner
    this.group = -1;
    {
      const n = node(-3.4, -0.25, 0);
      mk(n, MB.CreateBox("bracket", { width: 0.08, height: 0.08, depth: 0.9 }, sc), "#3a3444", 0, 4.05, -0.45);
      for (const [x, y] of [[-0.22, 3.55], [0.22, 3.55], [0, 3.22]]) { mk(n, MB.CreateSphere("pawnBall", { diameter: 0.34, segments: 10 }, sc), "#ffd54a", x, y, -0.85); mk(n, MB.CreateCylinder("ballRod", { diameter: 0.02, height: 4.05 - y, tessellation: 4 }, sc), "#3a3444", x, (4.05 + y) / 2, -0.85); }
      bake(n);
      const [wx, wz] = P(-5.0, -0.12);
      const p = MB.CreatePlane("pawnNeon", { width: 2.8, height: 0.7 }, sc); p.position.set(wx, 2.6, wz); p.rotation.y = Math.atan2(-nx, -nz); p.parent = this.root; p.isPickable = false;
      const t = textTexture(sc, "WE BUY ANYTHING*", { w: 512, h: 128, fg: "#ff3cac", stroke: "#1b1420" }); p.material = unlitTextured(sc, t, "pawnNeonMat");
      const [w2x, w2z] = P(-5.0, -0.12);
      const p2 = MB.CreatePlane("pawnNeon2", { width: 1.2, height: 0.25 }, sc); p2.position.set(w2x, 2.15, w2z); p2.rotation.y = p.rotation.y; p2.parent = this.root; p2.isPickable = false;
      p2.material = unlitTextured(sc, textTexture(sc, "*ALMOST", { w: 256, h: 54, fg: "#43c7a6" }), "pawnNeon2Mat");
      const [bxx, bzz] = P(4.4, -0.3);
      const ban = MB.CreatePlane("pawnBanner", { width: 3.2, height: 0.55 }, sc); ban.position.set(bxx, 3.75, bzz); ban.rotation.y = p.rotation.y; ban.parent = this.root; ban.isPickable = false;
      ban.material = unlitTextured(sc, textTexture(sc, "CASH 4 GOLD (AND SPOONS)", { w: 512, h: 88, bg: "#ffd54a", fg: "#1b1420" }), "pawnBanner");
      // window bars outside the glass
      for (let i = 0; i < 11; i++) { const [x, z] = P(-6.8 + i * 0.5, -0.1); const bar = MB.CreateCylinder("winBar", { diameter: 0.05, height: 3.0, tessellation: 4 }, sc); bar.position.set(x, 1.85, z); this.add(bar, "#3a3444", 0, false); }
      for (const y of [0.45, 3.3]) { const [x, z] = P(-4.3, -0.1); const rail = MB.CreateBox("winRail", { width: 5.2, height: 0.06, depth: 0.06 }, sc); rail.position.set(x, y, z); rail.rotation.y = yawOut; this.add(rail, "#3a3444", 0, false); }
    }
    // ---- inside (drawn with the building)
    this.group = ps.unit;
    for (const b of this.arena.boxes) {
      if (b.unit !== ps.unit || !b.deco) continue;
      const lu = -((b.x - u.doorX) * rx + (b.z - u.doorZ) * rz) * -1, lv = -((b.x - u.doorX) * nx + (b.z - u.doorZ) * nz);
      if (b.deco === "guitars") {
        const cols = ["#d6264a", "#1b1420", "#ffd54a", "#3d6fb5", "#f4f1ea"];
        for (let i = 0; i < 5; i++) {
          const n = node(lu + 0.25, lv - 1.8 + i * 0.9, 0, Math.atan2(rx, rz)); // (facing into the shop, off the left wall)
          mk(n, MB.CreateSphere("gBody", { diameter: 0.45, segments: 8 }, sc), cols[i], 0, 1.05, 0).scaling.set(1, 1.25, 0.25);
          mk(n, MB.CreateSphere("gBody2", { diameter: 0.34, segments: 8 }, sc), cols[i], 0, 1.38, 0).scaling.set(1, 1, 0.25);
          mk(n, MB.CreateBox("gNeck", { width: 0.07, height: 0.75, depth: 0.04 }, sc), "#8b5a2b", 0, 1.85, 0);
          mk(n, MB.CreateBox("gHead", { width: 0.12, height: 0.18, depth: 0.04 }, sc), "#5a3a24", 0, 2.3, 0);
          mk(n, MB.CreateCylinder("gHole", { diameter: 0.12, height: 0.02, tessellation: 10 }, sc), "#1b1420", 0, 1.3, 0.06).rotation.x = Math.PI / 2;
          bake(n);
        }
      } else if (b.deco === "tvstack") {
        const st = this.pawnStatic ?? (() => { const tex = new DynamicTexture("tvStatic", { width: 64, height: 64 }, sc, false); const c = tex.getContext() as unknown as CanvasRenderingContext2D; for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const v = Math.floor(Math.random() * 255); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(i, j, 1, 1); } tex.update(); tex.wrapU = 1; tex.wrapV = 1; this.pawnStatic = { tex, t: 0 }; return this.pawnStatic; })();
        const smat = new StandardMaterial("tvStaticMat", sc); smat.diffuseTexture = st.tex; smat.emissiveTexture = st.tex; smat.disableLighting = true;
        for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
          const w = 0.72, h = 0.6, cu = lu - 0.38 + col * 0.76, y = 0.3 + row * 0.66;
          const n = node(cu, lv, 0, yawIn);
          mk(n, MB.CreateBox("tvBox", { width: w, height: h, depth: 0.9 }, sc), ["#8b5a2b", "#3a3444", "#c9c5d6"][(row + col) % 3], 0, y + h / 2, 0);
          mk(n, MB.CreateBox("tvKnob", { width: 0.06, height: 0.06, depth: 0.04 }, sc), "#ffd54a", w / 2 - 0.08, y + 0.15, -0.46);
          bake(n);
          const [sx, sz] = P(cu - 0.06, lv - 0.47);
          const scr = MB.CreatePlane("tvScreen", { width: w - 0.22, height: h - 0.16 }, sc); scr.position.set(sx, y + h / 2 + 0.02, sz); scr.rotation.y = Math.atan2(nx, nz) + Math.PI; scr.material = smat; scr.parent = this.root; scr.isPickable = false;
          (this.unitPlanes.get(ps.unit) ?? this.unitPlanes.set(ps.unit, []).get(ps.unit)!).push(scr); scr.setEnabled(false);
        }
      } else if (b.deco === "armour") {
        const n = node(lu, lv, 0, yawIn + Math.PI);
        mk(n, MB.CreateBox("plinth", { width: 0.7, height: 0.2, depth: 0.7 }, sc), "#5a3a24", 0, 0.1, 0);
        for (const s of [-1, 1]) mk(n, MB.CreateCylinder("aLeg", { diameter: 0.17, height: 0.75, tessellation: 8 }, sc), "#b8b4c8", s * 0.12, 0.6, 0);
        mk(n, MB.CreateCylinder("aBody", { diameterTop: 0.5, diameterBottom: 0.38, height: 0.65, tessellation: 10 }, sc), "#c9ccd4", 0, 1.3, 0);
        mk(n, MB.CreateCylinder("aHelm", { diameter: 0.3, height: 0.36, tessellation: 10 }, sc), "#d8dce4", 0, 1.82, 0);
        mk(n, MB.CreateBox("aVisor", { width: 0.2, height: 0.04, depth: 0.04 }, sc), "#1b1420", 0, 1.84, 0.15);
        mk(n, MB.CreateCylinder("aPlume", { diameterTop: 0.02, diameterBottom: 0.1, height: 0.3, tessellation: 6 }, sc), "#d6264a", 0, 2.12, -0.03);
        for (const s of [-1, 1]) mk(n, MB.CreateCylinder("aArm", { diameter: 0.13, height: 0.6, tessellation: 6 }, sc), "#b8b4c8", s * 0.32, 1.25, 0);
        mk(n, MB.CreateBox("aSword", { width: 0.05, height: 1.1, depth: 0.02 }, sc), "#e8ecf2", 0.38, 0.95, 0.1);
        mk(n, MB.CreateBox("aTag", { width: 0.22, height: 0.14, depth: 0.01 }, sc), "#f4f1ea", 0, 1.25, 0.26);
        bake(n);
      } else if (b.deco === "bear") {
        const n = node(lu, lv, 0, yawIn + Math.PI);
        mk(n, MB.CreateBox("plinth", { width: 0.9, height: 0.2, depth: 0.9 }, sc), "#5a3a24", 0, 0.1, 0);
        mk(n, MB.CreateSphere("bBody", { diameter: 0.8, segments: 10 }, sc), "#7a4a2a", 0, 0.75, 0).scaling.set(1, 1.3, 0.9);
        mk(n, MB.CreateSphere("bBelly", { diameter: 0.5, segments: 8 }, sc), "#c9a07a", 0, 0.72, 0.2).scaling.set(1, 1.2, 0.6);
        mk(n, MB.CreateSphere("bHead", { diameter: 0.5, segments: 10 }, sc), "#7a4a2a", 0, 1.4, 0.05);
        mk(n, MB.CreateSphere("bSnout", { diameter: 0.2, segments: 6 }, sc), "#c9a07a", 0, 1.35, 0.27);
        mk(n, MB.CreateSphere("bNose", { diameter: 0.08, segments: 4 }, sc), "#1b1420", 0, 1.38, 0.36);
        for (const s of [-1, 1]) { mk(n, MB.CreateSphere("bEar", { diameter: 0.16, segments: 6 }, sc), "#7a4a2a", s * 0.18, 1.62, 0); const a = mk(n, MB.CreateCylinder("bArm", { diameter: 0.18, height: 0.55, tessellation: 6 }, sc), "#7a4a2a", s * 0.38, 1.15, 0.05); a.rotation.z = -s * 2.4; }
        mk(n, MB.CreateBox("bTag", { width: 0.3, height: 0.18, depth: 0.01 }, sc), "#f4f1ea", 0, 0.75, 0.38);
        bake(n);
      } else if (b.deco === "trophies") {
        for (let i = 0; i < 6; i++) {
          const n = node(lu - 0.05, lv - 1.3 + i * 0.5, b.y + b.h / 2, Math.atan2(-rx, -rz));
          const s = 0.7 + hash(i, 4) * 0.6;
          mk(n, MB.CreateBox("tBase", { width: 0.16 * s, height: 0.08 * s, depth: 0.16 * s }, sc), "#1b1420", 0, 0.04 * s, 0);
          mk(n, MB.CreateCylinder("tStem", { diameter: 0.04 * s, height: 0.14 * s, tessellation: 6 }, sc), "#e8b83a", 0, 0.15 * s, 0);
          mk(n, MB.CreateCylinder("tCup", { diameterTop: 0.2 * s, diameterBottom: 0.08 * s, height: 0.18 * s, tessellation: 10 }, sc), i % 3 ? "#e8b83a" : "#c9ccd4", 0, 0.31 * s, 0);
          bake(n);
        }
      } else if (b.deco === "cagebars") {
        for (let i = 0; i < 17; i++) { const [x, z] = P(lu - b.w / 2 + 0.12 + i * 0.235, lv); const bar = MB.CreateCylinder("cageBar", { diameter: 0.035, height: b.h, tessellation: 4 }, sc); bar.position.set(x, b.y, z); this.add(bar, "#3a3444", 0, false); }
        const [x, z] = P(lu, lv); const rail = MB.CreateBox("cageRail", { width: 4, height: 0.05, depth: 0.05 }, sc); rail.position.set(x, b.y + b.h / 2, z); rail.rotation.y = yawOut; this.add(rail, "#3a3444", 0, false);
      }
    }
    // Collateral the dog, asleep in his basket behind the counter; signs on the walls
    {
      const n = node(6.3, 5.4, 0.18, yawIn + 0.6);
      mk(n, MB.CreateCylinder("basket", { diameter: 0.85, height: 0.22, tessellation: 14 }, sc), "#a8743f", 0, 0.11, 0);
      mk(n, MB.CreateCylinder("cushion", { diameter: 0.7, height: 0.06, tessellation: 12 }, sc), "#d6264a", 0, 0.2, 0);
      mk(n, MB.CreateSphere("dog", { diameter: 0.5, segments: 8 }, sc), "#c9a07a", 0, 0.32, 0).scaling.set(1, 0.6, 1.3);
      mk(n, MB.CreateSphere("dogHead", { diameter: 0.26, segments: 8 }, sc), "#c9a07a", 0.08, 0.38, 0.28);
      for (const s of [-1, 1]) mk(n, MB.CreateSphere("dogEar", { diameter: 0.12, segments: 5 }, sc), "#7a4a2a", 0.08 + s * 0.1, 0.43, 0.26).scaling.set(0.6, 1.2, 0.6);
      mk(n, MB.CreateSphere("dogNose", { diameter: 0.06, segments: 4 }, sc), "#1b1420", 0.08, 0.36, 0.42);
      bake(n);
    }
    const sign = (text: string, bg: string, fg: string, uu: number, v: number, y: number, w: number, h: number, yaw: number) => {
      const [x, z] = P(uu, v); const p = MB.CreatePlane("pawnSign", { width: w, height: h }, sc); p.position.set(x, y, z); p.rotation.y = yaw; p.parent = this.root; p.isPickable = false;
      p.material = unlitTextured(sc, textTexture(sc, text, { w: 512, h: Math.round(512 * h / w), bg, fg }), "pawnSign" + text);
      (this.unitPlanes.get(ps.unit) ?? this.unitPlanes.set(ps.unit, []).get(ps.unit)!).push(p); p.setEnabled(false);
    };
    sign("NO REFUNDS. NO REGRETS.", "#1b1420", "#ffd54a", 4.6, 4.5, 2.85, 2.4, 0.5, yawIn);
    sign("YOU BREAK IT, VINNIE BREAKS YOU", "#d6264a", "#f4f1ea", 0, 8.96, 3.0, 3.0, 0.45, yawIn);
    sign("RING FOR SAL", "#f4f1ea", "#1b1420", 3.0, 3.48, 1.32, 0.7, 0.16, yawIn);
    this.group = -1;
  }

  /** C5c.3: the pawn shop's tellies hiss with static */
  updatePawn(dt: number) {
    const st = this.pawnStatic;
    if (!st) return;
    st.t -= dt;
    if (st.t > 0) return;
    st.t = 0.06;
    st.tex.uOffset = Math.random(); st.tex.vOffset = Math.random();
  }

  /** C5c: the gold sparkles twinkle */
  updateUptown(dt: number) {
    this.uptownT += dt;
    const t = this.uptownT;
    for (const s of this.sparkles) { const k = Math.max(0, Math.sin(t * 2.2 + s.ph * 3.1)); s.m.scaling.setAll(0.2 + k * k * 1.1); s.m.rotation.z = t * 0.8 + s.ph; }
    this.updateResto(dt);
    this.updatePawn(dt);
  }


  /** C5b: how dark it is (0 day .. 1 night): the lanterns glow, and sway gently */
  setNight(n: number, dt: number) {
    if (this.heliBeam) this.heliBeam.setEnabled(n > 0.5); // (R6: the helicopter's searchlight sweeps at night)
    if (!this.lanternMat) return;
    this.lanternT += dt;
    const glow = Color3.Lerp(Color3.FromHexString("#5a1010"), Color3.FromHexString("#ff5a30"), Math.min(1, n * 1.3));
    this.lanternMat.emissiveColor = glow;
    for (const m of this.lanternMeshes) if (m.material && m.material !== this.lanternMat) (m.material as StandardMaterial).emissiveColor = Color3.Lerp(Color3.FromHexString("#5a4010"), Color3.FromHexString("#ffc040"), Math.min(1, n * 1.3));
  }

  /** C5a: chain-link fences (the squat's roof) */
  private chainFences: Box[] = [];
  /** C5a: the squat's moving bits: the fire's flames and embers, the throw targets (flash on a hit) */
  private flames: Mesh[] = [];
  private embers: { m: Mesh; t: number; x: number; z: number }[] = [];
  private targetMats = new Map<string, StandardMaterial>();
  private targetFlash = new Map<string, number>();
  private lobbyT = 0;

  /**
   * C5a: THE SQUAT: the lobby's rooftop camp (all looks; the collision boxes come from the layout). A tarp
   * tent village round a burning barrel, a sagging couch, fairy lights, washing on a line, a water tank with
   * the city map painted on it, the practice corner, the THROW-O-MATIC lane and targets, the TROLLEY GRAND
   * PRIX track, a stairwell hut, aerials and a pigeon coop; and, all round the outside of the city, the
   * far-off suburbs so the view from up there doesn't end in nothing.
   */
  private buildLobby() {
    const L = this.arena.lobby;
    if (!L) return;
    const sc = this.scene, MB = MeshBuilder, Y = L.y;
    this.group = -1; this.brk = "";
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, o = 0.02, ry = 0) => {
      const m = MB.CreateBox("lb", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); m.rotation.y = ry; this.add(m, col, o, false); return m; // (no shadow casting: it's all far from the city)
    };
    const cyl = (d: number, h: number, x: number, y: number, z: number, col: string, o = 0.02, t = 12, top?: number) => {
      const m = MB.CreateCylinder("lc", { diameter: d, diameterTop: top ?? d, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, o, false); return m;
    };
    const rope = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col = "#2b2433", d = 0.03) => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const m = MB.CreateCylinder("rope", { diameter: d, height: len, tessellation: 5 }, sc);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      const dir = new Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
      const axis = Vector3.Cross(Vector3.Up(), dir); const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir))));
      if (axis.length() > 1e-4) m.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), ang);
      this.add(m, col, 0, false);
      return m;
    };
    // the roof deck: tar paper with patches, puddles, a painted race track
    bx(L.rect.maxX - L.rect.minX - 0.8, 0.1, L.rect.maxZ - L.rect.minZ - 0.8, (L.rect.minX + L.rect.maxX) / 2, Y + 0.05, (L.rect.minZ + L.rect.maxZ) / 2, "#4a4450", 0); // (tar paper, above the building's ink outline)
    for (let i = 0; i < 14; i++) {
      const pt = MB.CreateGround("tarPatch", { width: 1 + rnd() * 2.5, height: 0.8 + rnd() * 2 }, sc);
      pt.position.set(L.rect.minX + 2 + rnd() * 26, Y + 0.11, L.rect.minZ + 2 + rnd() * 16); pt.rotation.y = rnd() * 3; this.add(pt, rnd() < 0.5 ? "#3d3844" : "#57505e", 0, false);
    }
    for (let i = 0; i < 4; i++) { const pd = MB.CreateDisc("puddle", { radius: 0.5 + rnd() * 0.7, tessellation: 14 }, sc); pd.rotation.x = Math.PI / 2; pd.position.set(L.rect.minX + 3 + rnd() * 24, Y + 0.115, L.rect.minZ + 3 + rnd() * 14); this.add(pd, "#6f8fae", 0, false); }
    // the race track: a dashed loop through the four cones, a chequered start line, cones
    const race = L.race;
    for (let i = 0; i < race.length; i++) {
      const a = race[i], b = race[(i + 1) % race.length], len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let t = 0.5; t < len - 0.5; t += 1.2) {
        const d = MB.CreateGround("lane", { width: 0.12, height: 0.6 }, sc);
        d.position.set(a.x + (b.x - a.x) * t / len, Y + 0.12, a.z + (b.z - a.z) * t / len); d.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); this.add(d, "#f4f1ea", 0, false);
      }
      const cone = cyl(0.45, 0.75, a.x + 1.2, Y + 0.375, a.z, "#ff7a1a", 0.02, 10, 0.06);
      bx(0.5, 0.04, 0.5, cone.position.x, Y + 0.02, a.z, "#ff7a1a", 0);
      cyl(0.36, 0.1, cone.position.x, Y + 0.45, a.z, "#f4f1ea", 0, 10);
    }
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) bx(0.35, 0.02, 0.35, race[0].x - 1.4 + i * 0.35, Y + 0.125, race[0].z - 0.35 + j * 0.35 + 0.175, (i + j) % 2 ? "#1b1420" : "#f4f1ea", 0);
    // tarp tents: two sloping panels on a ridge pole, guy ropes, a sleeping bag poking out
    for (const t of L.tents) {
      const half = t.d / 2, h = 1.5, slant = Math.hypot(half, h), ang = Math.atan2(h, half);
      for (const s2 of [-1, 1]) {
        const pnl = MB.CreateBox("tarp", { width: t.w, height: 0.04, depth: slant }, sc);
        pnl.position.set(t.x, Y + h / 2, t.z + s2 * half / 2); pnl.rotation.x = s2 * ang; // (edges down, ridge up)
        // (its own matte material: the toon shader washed the sunny side out to white)
        const tm = new StandardMaterial("tarp", sc); tm.diffuseColor = Color3.FromHexString(t.color); tm.specularColor = Color3.Black(); tm.emissiveColor = Color3.FromHexString(t.color).scale(0.25);
        pnl.material = tm; pnl.parent = this.root; pnl.isPickable = false; ink(pnl, 0.02);
      }
      rope(t.x - t.w / 2 - 0.2, Y + h + 0.02, t.z, t.x + t.w / 2 + 0.2, Y + h + 0.02, t.z, "#8a6a4a", 0.06);
      for (const s2 of [-1, 1]) { cyl(0.06, h, t.x + s2 * (t.w / 2 + 0.1), Y + h / 2, t.z, "#8a6a4a", 0, 6); rope(t.x + s2 * (t.w / 2 + 0.1), Y + h, t.z, t.x + s2 * (t.w / 2 + 1.0), Y, t.z, "#d8d0c4"); }
      bx(0.9, 0.2, 0.6, t.x + t.w / 2 - 0.6, Y + 0.1, t.z + t.d / 2 - 0.1, "#3a6ea8", 0.01);
    }
    // box huts: cardboard lean-tos along the north-west
    for (const [x, z, w] of [[-13.2, -121.8, 1.6], [-8.6, -121.6, 1.2]]) {
      bx(w, 1.1, 1.1, x, Y + 0.55, z, "#c9a56b", 0.02);
      bx(w * 0.6, 0.02, 0.7, x, Y + 0.6, z + 0.56, "#1b1420", 0);
      bx(w + 0.2, 0.05, 1.3, x, Y + 1.13, z, "#b08a55", 0.01);
    }
    // the burning barrel: rusty drum with holes, flames and embers
    const f = L.fire;
    cyl(0.7, 1.0, f.x, Y + 0.5, f.z, "#7a3f22", 0.03, 14);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; bx(0.1, 0.1, 0.02, f.x + Math.sin(a) * 0.35, Y + 0.45, f.z + Math.cos(a) * 0.35, "#ffb000", 0, a); }
    const flameMat = new StandardMaterial("flame", sc);
    flameMat.emissiveColor = Color3.FromHexString("#ff9a1a"); flameMat.diffuseColor = Color3.Black(); flameMat.disableLighting = true; flameMat.alpha = 0.92;
    const flameCore = flameMat.clone("flameCore"); flameCore.emissiveColor = Color3.FromHexString("#ffe14a");
    for (let i = 0; i < 5; i++) {
      const fl = MB.CreateCylinder("flame", { diameterTop: 0, diameterBottom: 0.28 + (i % 2) * 0.1, height: 0.7, tessellation: 6 }, sc);
      fl.position.set(f.x + Math.sin(i * 1.3) * 0.14, Y + 1.25, f.z + Math.cos(i * 1.3) * 0.14); fl.material = i % 2 ? flameCore : flameMat; fl.parent = this.root; fl.isPickable = false;
      this.flames.push(fl);
    }
    for (let i = 0; i < 10; i++) {
      const e = MB.CreateBox("ember", { size: 0.04 }, sc); e.material = flameCore; e.parent = this.root; e.isPickable = false;
      this.embers.push({ m: e, t: rnd() * 2, x: f.x + (rnd() - 0.5) * 0.4, z: f.z + (rnd() - 0.5) * 0.4 });
    }
    // couch cushions, a coffee-table crate with mugs, a rug
    const rug = MB.CreateGround("rug", { width: 3.6, height: 2.2 }, sc); rug.position.set(0, Y + 0.12, -130.2); this.add(rug, "#8e1f2e", 0, false);
    for (const s2 of [-0.6, 0.6]) bx(1.1, 0.15, 0.7, s2, Y + 0.58, -131.5, "#9a6fb0", 0.01);
    for (const s2 of [-1.35, 1.35]) bx(0.25, 0.35, 0.9, s2, Y + 0.68, -131.6, "#6a3f7f", 0.01);
    for (const [x, z] of [[-2.6, -128.8], [2.6, -129.1]]) cyl(0.1, 0.12, x, Y + 0.51, z, "#f4f1ea", 0.01, 8);
    // fairy lights: bulbs strung from the tents to a pole by the couch and across the camp
    const bulb = new StandardMaterial("bulb", sc); bulb.disableLighting = true; bulb.emissiveColor = Color3.FromHexString("#ffe9a0");
    const bulbs = ["#ffe9a0", "#ff8fa3", "#9fe3ff", "#b6ff3c"].map((c2, i) => { const m = bulb.clone("bulb" + i); m.emissiveColor = Color3.FromHexString(c2); return m; });
    cyl(0.1, 3.2, 4.2, Y + 1.6, -133.4, "#5a4636", 0.01, 6); cyl(0.1, 3.2, -4.2, Y + 1.6, -125.6, "#5a4636", 0.01, 6);
    const strings: [number, number, number, number, number, number][] = [[-10, Y + 1.5, -124.3, -4.2, Y + 3.1, -125.6], [-4.2, Y + 3.1, -125.6, 4.2, Y + 3.1, -133.4], [4.2, Y + 3.1, -133.4, 10.2, Y + 1.5, -137.6], [-10, Y + 1.5, -129, 4.2, Y + 3.1, -133.4]];
    let bi = 0;
    for (const [x0, y0, z0, x1, y1, z1] of strings) {
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n, sag = Math.sin(t * Math.PI) * 0.45;
        const b = MB.CreateSphere("bulb", { diameter: 0.09, segments: 4 }, sc);
        b.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - sag, z0 + (z1 - z0) * t); b.material = bulbs[bi++ % bulbs.length]; b.parent = this.root; b.isPickable = false;
        if (i < n) { const t2 = (i + 1) / n, sag2 = Math.sin(t2 * Math.PI) * 0.45; rope(b.position.x, b.position.y + 0.04, b.position.z, x0 + (x1 - x0) * t2, y0 + (y1 - y0) * t2 - sag2 + 0.04, z0 + (z1 - z0) * t2, "#1b1420", 0.015); }
      }
    }
    // a washing line with shirts, socks and a pair of enormous pants
    cyl(0.08, 2.2, -13.6, Y + 1.1, -131.8, "#5a4636", 0.01, 6); cyl(0.08, 2.2, -8.2, Y + 1.1, -131.8, "#5a4636", 0.01, 6);
    rope(-13.6, Y + 2.1, -131.8, -8.2, Y + 2.1, -131.8, "#d8d0c4");
    ["#ff5a3c", "#43c7a6", "#ffe14a", "#f4f1ea", "#4fb3ff", "#ff8fa3"].forEach((c2, i) => {
      // (C5c.3: both faces built into the geometry; the mesh keeps the default side flag, or it can't be merged with the rest)
      const cl = MB.CreatePlane("cloth", { width: i === 3 ? 1.1 : 0.6, height: i === 3 ? 0.8 : 0.55, sideOrientation: Mesh.DOUBLESIDE }, sc);
      const so = MB.CreateBox("probe", { size: 0.01 }, sc); cl.sideOrientation = so.sideOrientation; so.dispose();
      cl.position.set(-13.1 + i * 0.85, Y + 1.75, -131.8); this.add(cl, c2, 0, false);
    });
    // the water tank: wooden staves, iron hoops, a pointy lid, a ladder; the city map painted across its front
    const tk = { x: L.map.x, z: L.map.z - 1.95 };
    cyl(3.6, 3.2, tk.x, Y + 3.2 + 1.6, tk.z, "#8a5a3a", 0.04, 20);
    for (const hy of [0.4, 1.6, 2.8]) { const hp = MB.CreateTorus("hoop", { diameter: 3.62, thickness: 0.06, tessellation: 24 }, sc); hp.position.set(tk.x, Y + 3.2 + hy, tk.z); this.add(hp, "#3a3444", 0, false); }
    cyl(3.9, 1.1, tk.x, Y + 6.95, tk.z, "#5a4636", 0.03, 20, 0.2);
    bx(4.2, 0.2, 4.2, tk.x, Y + 3.15, tk.z, "#5a4636", 0.02);
    for (let r = 0; r < 12; r++) bx(0.5, 0.05, 0.05, tk.x + 2.0, Y + 0.3 + r * 0.3, tk.z - 1.2, "#3a3444", 0);
    for (const s2 of [-0.25, 0.25]) bx(0.05, 3.6, 0.05, tk.x + 2.0 + s2, Y + 1.8, tk.z - 1.2, "#3a3444", 0);
    {
      const M = L.map;
      const cv = new DynamicTexture("cityMapPaint", { width: 1024, height: 1024 }, sc, true);
      const c2 = cv.getContext() as unknown as CanvasRenderingContext2D;
      drawCityMap(c2, this.arena, 1024, { painted: true, extraSouth: 30 });
      cv.update();
      const mat = unlitTextured(sc, cv, "cityMapBoard");
      const pl = MB.CreatePlane("cityMapBoard", { width: M.w, height: M.h }, sc);
      pl.position.set(M.x, M.y, M.z + 0.02); pl.rotation.y = Math.PI; pl.material = mat; pl.parent = this.root; pl.isPickable = false;
      bx(M.w + 0.3, M.h + 0.3, 0.12, M.x, M.y, M.z - 0.08, "#6a4a30", 0.03);
      const title = MB.CreatePlane("mapTitle", { width: 3.6, height: 0.6 }, sc);
      title.position.set(M.x, M.y + M.h / 2 + 0.5, M.z + 0.03); title.rotation.y = Math.PI; title.parent = this.root; title.isPickable = false;
      title.material = unlitTextured(sc, textTexture(sc, "TRASHINGTON", { w: 512, h: 90, bg: "#ffe14a", fg: "#1b1420" }), "mapTitle");
    }
    // the stairwell hut (locked), aerials, a satellite dish, a pigeon coop
    bx(2.4, 2.6, 2.4, -7.2, Y + 1.3, -138.2, "#8a6a58", 0.04);
    bx(0.9, 1.9, 0.06, -7.2, Y + 0.95, -136.97, "#3f5a7a", 0.01);
    const nope = MB.CreatePlane("nope", { width: 0.8, height: 0.3 }, sc); nope.position.set(-7.2, Y + 1.5, -136.93); nope.rotation.y = Math.PI; nope.parent = this.root; nope.isPickable = false;
    nope.material = unlitTextured(sc, textTexture(sc, "NO ENTRY", { w: 256, h: 96, bg: "#d8342c", fg: "#fff" }), "nope");
    for (const [x, z, h] of [[-6.5, -138.6, 3.4], [-7.9, -137.6, 2.8]]) {
      cyl(0.05, h, x, Y + 2.6 + h / 2, z, "#c9ccd4", 0, 6);
      for (let r = 0; r < 4; r++) bx(1.1 - r * 0.2, 0.03, 0.03, x, Y + 2.6 + h - 0.3 - r * 0.35, z, "#c9ccd4", 0);
    }
    const dish = MB.CreateSphere("dish", { diameter: 1.3, slice: 0.3, segments: 10 }, sc);
    dish.position.set(-5.9, Y + 3.0, -137.6); dish.rotation.x = -2.2; this.add(dish, "#e8e2d4", 0.02, false);
    bx(1.6, 1.0, 1.0, 13.3, Y + 0.5, -122.4, "#8e7a5a", 0.02);
    bx(1.7, 0.08, 1.1, 13.3, Y + 1.05, -122.4, "#5a4636", 0.01);
    for (let i = 0; i < 4; i++) { const pg = MB.CreateSphere("pigeon", { diameter: 0.22, segments: 5 }, sc); pg.position.set(12.8 + i * 0.35, Y + 1.2, -122.3); this.add(pg, "#8e8a94", 0.01, false); }
    // buckets with scraggly plants, a shopping trolley bay sign, the free-stuff pile's sign
    for (const [x, z] of [[-14, -126.5], [-14, -134], [7.2, -139], [14, -139]]) { cyl(0.45, 0.45, x, Y + 0.23, z, "#4f7fb0", 0.02, 10, 0.55); const pl2 = MB.CreateSphere("plant", { diameter: 0.6, segments: 5 }, sc); pl2.position.set(x, Y + 0.65, z); this.add(pl2, "#4f7a3a", 0.02, false); }
    const sign = (text: string, x: number, y: number, z: number, ry: number, w: number, bg: string, fg = "#1b1420") => {
      const pl3 = MB.CreatePlane("lsign", { width: w, height: w * 0.25 }, sc);
      pl3.position.set(x, y, z); pl3.rotation.y = ry; pl3.parent = this.root; pl3.isPickable = false;
      pl3.material = unlitTextured(sc, textTexture(sc, text, { w: 512, h: 128, bg, fg }), "lsign");
      bx(w + 0.1, w * 0.25 + 0.1, 0.05, x - Math.sin(ry) * 0.03, y, z - Math.cos(ry) * 0.03, "#5a4636", 0.01, ry);
    };
    sign("FREE STUFF", L.pile.x, Y + 1.3, L.pile.z - 0.9, Math.PI, 1.6, "#43c7a6");
    cyl(0.06, 1.2, L.pile.x, Y + 0.6, L.pile.z - 0.95, "#5a4636", 0, 6);
    sign("TROLLEY BAY", L.trolleys[0].x - 1.0, Y + 1.25, L.trolleys[0].z + 0.45, Math.PI, 1.8, "#ffe14a");
    // the welcome banner over the camp (read it when you turn round from the view)
    cyl(0.1, 3.4, -5.2, Y + 1.7, -126.8, "#5a4636", 0.01, 6); cyl(0.1, 3.4, 5.2, Y + 1.7, -126.8, "#5a4636", 0.01, 6);
    { // (painted on both sides)
      const bm = unlitTextured(sc, textTexture(sc, "WELCOME TO THE SQUAT  *  POP: US", { w: 1024, h: 120, bg: "#f3e2b8", fg: "#8e1f2e" }), "welcome");
      for (const [dz, ry] of [[0.02, Math.PI], [-0.02, 0]]) {
        const ban = MB.CreatePlane("welcome", { width: 9.6, height: 1.1 }, sc);
        ban.position.set(0, Y + 2.9, -126.8 + dz); ban.rotation.y = ry; ban.parent = this.root; ban.isPickable = false; ban.material = bm;
      }
    }
    // the throw targets: painted rings on plywood, flash when hit
    for (const tg of L.targets) {
      const tex = new DynamicTexture("tgt-" + tg.id, { width: 256, height: 256 }, sc, true);
      const c3 = tex.getContext() as unknown as CanvasRenderingContext2D;
      ["#f4f1ea", "#d8342c", "#f4f1ea", "#d8342c", "#ffe14a"].forEach((col, i) => { c3.fillStyle = col; c3.beginPath(); c3.arc(128, 128, 126 - i * 25, 0, Math.PI * 2); c3.fill(); });
      tex.hasAlpha = true; tex.update();
      const mat = unlitTextured(sc, tex, "target"); mat.useAlphaFromDiffuseTexture = true;
      const disc = MB.CreatePlane("target", { size: tg.r * 2 }, sc);
      const nx = Math.sin(tg.yaw), nz = Math.cos(tg.yaw);
      disc.position.set(tg.x + nx * 0.02, tg.y, tg.z + nz * 0.02); disc.rotation.y = tg.yaw + Math.PI; disc.material = mat; disc.parent = this.root; disc.isPickable = false;
      this.targetMats.set(tg.id, mat);
      bx(0.08, tg.r * 2.1, tg.r * 2.1, tg.x - nx * 0.06, tg.y, tg.z, "#a8743f", 0.02);
      cyl(0.08, tg.y - Y, tg.x - nx * 0.1, Y + (tg.y - Y) / 2, tg.z, "#5a4636", 0, 6);
    }
    sign("THROW-O-MATIC LANE", 14.2, Y + 3.3, -127.4, -Math.PI / 2, 3.4, "#ff8fa3");
    // chain-link fences: a diamond-mesh texture on see-through planes, with posts
    // (each fence gets its own little texture: its tiling differs, and a cloned DynamicTexture never becomes "ready")
    for (const b of this.chainFences) {
      const along = b.w > b.d, len = along ? b.w : b.d;
      const tex = new DynamicTexture("chain", { width: 64, height: 64 }, sc, true);
      const c4 = tex.getContext() as unknown as CanvasRenderingContext2D;
      c4.clearRect(0, 0, 64, 64); c4.strokeStyle = "#c9ccd4"; c4.lineWidth = 3;
      c4.beginPath(); c4.moveTo(0, 32); c4.lineTo(32, 0); c4.lineTo(64, 32); c4.lineTo(32, 64); c4.closePath(); c4.stroke();
      tex.hasAlpha = true; tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE;
      tex.uScale = len / 0.25; tex.vScale = b.h / 0.25; tex.update();
      const mat = new StandardMaterial("chainMat", sc);
      mat.diffuseTexture = tex; mat.useAlphaFromDiffuseTexture = true; mat.backFaceCulling = false; mat.specularColor = Color3.Black();
      mat.emissiveColor = Color3.FromHexString("#55525c");
      const pl4 = MB.CreatePlane("chainfence", { width: len, height: b.h }, sc);
      pl4.position.set(b.x, b.y, b.z); pl4.rotation.y = along ? 0 : Math.PI / 2;
      pl4.material = mat; pl4.parent = this.root; pl4.isPickable = false; pl4.alphaIndex = 2;
      for (let u = -len / 2; u <= len / 2 + 0.01; u += 2.5) cyl(0.07, b.h, b.x + (along ? u : 0), b.y, b.z + (along ? 0 : u), "#8e8a94", 0, 6);
      bx(along ? len : 0.05, 0.05, along ? 0.05 : len, b.x, b.y + b.h / 2, b.z, "#8e8a94", 0);
    }
    // the far-off suburbs all round the city, so the view from the roof (and anywhere else) has a horizon
    const H = this.arena.halfSize;
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2, r = H + 45 + rnd() * 140;
      const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 1.1;
      if (Math.abs(x) < H + 30 && Math.abs(z) < H + 30) continue;
      if (Math.abs(x) < 40 && z < -H && z > -H - 60) continue; // (keep clear round the squat)
      const h = 6 + rnd() * rnd() * 55, w = 8 + rnd() * 14;
      bx(w, h, 8 + rnd() * 14, x, h / 2, z, ["#7a8298", "#8a8fa6", "#6e7488", "#9aa0b4"][Math.floor(rnd() * 4)], 0, rnd() * 0.3);
    }
    const out = MB.CreateGround("outskirts", { width: H * 2 + 700, height: H * 2 + 700 }, sc);
    out.position.y = -0.05; this.add(out, "#6a6570", 0, false);
  }

  /** C5a: flicker the squat's fire, float its embers, fade target flashes */
  updateLobby(dt: number) {
    if (!this.flames.length) return;
    this.lobbyT += dt;
    const t = this.lobbyT, Y = this.arena.lobby!.y;
    this.flames.forEach((f, i) => { const s = 0.75 + Math.sin(t * (9 + i * 1.7) + i) * 0.18 + Math.sin(t * 23 + i * 3) * 0.08; f.scaling.set(1, s, 1); f.position.y = Y + 1.0 + 0.35 * s; });
    for (const e of this.embers) {
      e.t += dt; if (e.t > 2) e.t -= 2;
      e.m.position.set(e.x + Math.sin(e.t * 3 + e.x * 9) * 0.15, Y + 1.2 + e.t * 1.2, e.z + Math.cos(e.t * 2 + e.z * 7) * 0.15);
      e.m.scaling.setAll(Math.max(0.1, 1 - e.t / 2));
    }
    for (const [id, until] of this.targetFlash) {
      const m = this.targetMats.get(id); if (!m) continue;
      const on = t < until && Math.floor(t * 12) % 2 === 0;
      m.emissiveColor = on ? Color3.FromHexString("#b6ff3c") : Color3.White();
      if (t >= until) this.targetFlash.delete(id);
    }
  }
  /** C5a: a thrown lid hit a target */
  flashTarget(id: string) { this.targetFlash.set(id, this.lobbyT + 0.8); }

  private buildPit() {
    const blk = this.arena.blocks?.find((b) => b.name.startsWith("The Pit"));
    if (!blk) return;
    const sc = this.scene, MB = MeshBuilder, r = blk.rect;
    const inner = { minX: r.minX + 4, maxX: r.maxX - 4, minZ: r.minZ + 4, maxZ: r.maxZ - 4 };
    const cx = (inner.minX + inner.maxX) / 2, cz = (inner.minZ + inner.maxZ) / 2;
    const inPit = (b: Box) => b.x > inner.minX - 0.5 && b.x < inner.maxX + 0.5 && b.z > inner.minZ - 0.5 && b.z < inner.maxZ + 0.5;
    this.group = -1; this.brk = "";
    let seed = 71;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pipe = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, d = 0.09, col = "#c9ccd4") => {
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const c = MB.CreateCylinder("coping", { diameter: d, height: len, tessellation: 8 }, sc);
      c.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      if (Math.abs(x1 - x0) > 0.01) c.rotation.z = Math.PI / 2; else if (Math.abs(z1 - z0) > 0.01) c.rotation.x = Math.PI / 2;
      this.add(c, col, 0.01);
    };
    for (const b of this.arena.boxes) {
      if (!inPit(b)) continue;
      const top = b.y + b.h / 2;
      if (b.kind === "platform" && b.h > 1.5) {
        // the deck lip, on the side facing the middle, plus a railing at the back
        const side = b.x < cx ? 1 : -1, ex = b.x + side * b.w / 2;
        pipe(ex, top + 0.03, b.z - b.d / 2, ex, top + 0.03, b.z + b.d / 2, 0.1);
        const bx2 = b.x - side * (b.w / 2 - 0.08);
        pipe(bx2, top + 0.95, b.z - b.d / 2 + 0.1, bx2, top + 0.95, b.z + b.d / 2 - 0.1, 0.06, "#3a3444");
        for (const t of [-1, 0, 1]) pipe(bx2, top, b.z + t * (b.d / 2 - 0.1), bx2, top + 0.95, b.z + t * (b.d / 2 - 0.1), 0.06, "#3a3444");
      } else if (b.kind === "platform") {
        // the fun box: steel angle on all four top edges
        const hw = b.w / 2, hd = b.d / 2;
        pipe(b.x - hw, top, b.z - hd, b.x + hw, top, b.z - hd, 0.07); pipe(b.x - hw, top, b.z + hd, b.x + hw, top, b.z + hd, 0.07);
        pipe(b.x - hw, top, b.z - hd, b.x - hw, top, b.z + hd, 0.07); pipe(b.x + hw, top, b.z - hd, b.x + hw, top, b.z + hd, 0.07);
      } else if (b.kind === "rim") {
        // grind rails: a round bar on little posts
        const long = b.w > b.d, len = long ? b.w : b.d;
        pipe(b.x - (long ? len / 2 : 0), top + 0.04, b.z - (long ? 0 : len / 2), b.x + (long ? len / 2 : 0), top + 0.04, b.z + (long ? 0 : len / 2), 0.07, "#d9dde5");
      } else if (b.kind === "ramp-step" && rnd() < 0.55) {
        // stickers on the risers
        const st = MB.CreatePlane("sticker", { width: 0.25 + rnd() * 0.25, height: 0.12 + rnd() * 0.1 }, sc);
        const face = b.x < cx ? 1 : -1;
        st.position.set(b.x + face * (b.w / 2 + 0.012), top - 0.15, b.z + (rnd() - 0.5) * (b.d - 0.8));
        st.rotation.y = face > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.add(st, ["#ff5a3c", "#43c7a6", "#ffe14a", "#ff8fa3", "#4fb3ff", "#f4f1ea"][Math.floor(rnd() * 6)], 0);
      }
    }
    // flood lights on the four corners (a tall pole, a crossbar, two lamp heads)
    for (const [x, z] of [[r.minX + 1.2, r.minZ + 1.2], [r.maxX - 1.2, r.minZ + 1.2], [r.minX + 1.2, r.maxZ - 1.2], [r.maxX - 1.2, r.maxZ - 1.2]]) {
      pipe(x, 0, z, x, 7.5, z, 0.2, "#3a3444");
      const dx = Math.sign(cx - x) * 0.5, dz = Math.sign(cz - z) * 0.5;
      pipe(x - dz, 7.5, z + dx, x + dz, 7.5, z - dx, 0.12, "#3a3444");
      for (const s2 of [-1, 1]) {
        const head = MB.CreateBox("flood", { width: 0.6, height: 0.35, depth: 0.25 }, sc);
        head.position.set(x + s2 * dz * 0.9 + dx * 0.3, 7.7, z - s2 * dx * 0.9 + dz * 0.3);
        head.rotation.y = Math.atan2(cx - x, cz - z); head.rotation.x = 0.5;
        this.add(head, "#fff4c2", 0.02);
      }
    }
    // painted logo and skid marks on the concrete
    const logo = unlitTextured(sc, textTexture(sc, "THE PIT", { w: 512, h: 160, fg: "#ff5a3c", stroke: "#1b1420" }), "pitLogo");
    const lp = MB.CreateGround("pitLogo", { width: 6, height: 1.9 }, sc);
    lp.position.set(cx + 1, 0.23, cz + 2.8); lp.material = logo; lp.parent = this.root; lp.isPickable = false; lp.alphaIndex = 1;
    (logo.diffuseTexture as Texture).hasAlpha = true; logo.useAlphaFromDiffuseTexture = true;
    const skid = new StandardMaterial("skid", sc);
    skid.diffuseColor = Color3.FromHexString("#2a2530"); skid.specularColor = Color3.Black(); skid.alpha = 0.35;
    for (let i = 0; i < 16; i++) {
      const m = MB.CreateGround("skid", { width: 0.06, height: 1.5 + rnd() * 3 }, sc);
      m.position.set(inner.minX + 3 + rnd() * (inner.maxX - inner.minX - 6), 0.22, inner.minZ + 3 + rnd() * (inner.maxZ - inner.minZ - 6));
      m.rotation.y = rnd() * Math.PI; m.material = skid; m.parent = this.root; m.isPickable = false;
    }
    // litter: crushed cans, a pizza box, a drinks cooler; a boombox on the bench
    for (let i = 0; i < 14; i++) {
      const can = MB.CreateCylinder("litter", { diameter: 0.07, height: 0.12, tessellation: 6 }, sc);
      can.position.set(r.minX + 1 + rnd() * (r.maxX - r.minX - 2), 0.2, r.minZ + 1 + rnd() * (r.maxZ - r.minZ - 2));
      can.rotation.set(Math.PI / 2, rnd() * 3, 0);
      this.add(can, ["#d8342c", "#43c7a6", "#c9ccd4", "#ffe14a"][i % 4], 0);
    }
    const pz = MB.CreateBox("pizzabox", { width: 0.45, height: 0.05, depth: 0.45 }, sc);
    pz.position.set(inner.maxX - 1.5, 0.21, inner.minZ + 1.4); pz.rotation.y = 0.4; this.add(pz, "#e8c79a", 0.01);
    const cooler = MB.CreateBox("cooler", { width: 0.7, height: 0.45, depth: 0.45 }, sc);
    cooler.position.set(inner.minX + 4.4, 0.41, inner.minZ + 1.1); this.add(cooler, "#2f7fd0", 0.02);
    const lid = MB.CreateBox("coolerlid", { width: 0.74, height: 0.08, depth: 0.49 }, sc);
    lid.position.set(inner.minX + 4.4, 0.67, inner.minZ + 1.1); this.add(lid, "#f4f1ea", 0.01);
    const bench = this.arena.boxes.find((b) => b.kind === "bench" && inPit(b));
    if (bench) {
      const bb = MB.CreateBox("boombox", { width: 0.55, height: 0.3, depth: 0.18 }, sc);
      bb.position.set(bench.x + 0.6, bench.y + bench.h / 2 + 0.15, bench.z); this.add(bb, "#1b1420", 0.02);
      for (const s2 of [-1, 1]) {
        const spk = MB.CreateCylinder("spk", { diameter: 0.18, height: 0.02, tessellation: 12 }, sc);
        spk.rotation.x = Math.PI / 2; spk.position.set(bench.x + 0.6 + s2 * 0.15, bench.y + bench.h / 2 + 0.15, bench.z - 0.1);
        this.add(spk, "#c9ccd4", 0);
      }
    }
  }

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
      } else if (d.kind === "streetsign") {
        // R3: a street-name sign: a pole and two green blades, each along its road, readable from both sides
        const pole = MeshBuilder.CreateCylinder("signpole", { diameter: 0.1, height: 3.3, tessellation: 6 }, sc);
        pole.position.set(d.x, 1.65, d.z);
        this.add(pole, "#3a3444", 0.015);
        const [t1, t2] = (d.text ?? "|").split("|");
        ([[t1, d.yaw ?? 0, 3.05], [t2, d.yaw2 ?? 0, 2.7]] as [string, number, number][]).forEach(([text, yaw, y]) => {
          if (!text) return;
          const w = Math.min(3.2, 0.5 + text.length * 0.13);
          for (const side of [0, Math.PI]) {
            const blade = MeshBuilder.CreatePlane("streetblade", { width: w, height: 0.34 }, sc);
            // (the blade runs along the road: its face looks across it)
            const ry = yaw + Math.PI / 2 + side;
            blade.position.set(d.x + Math.sin(yaw) * (w / 2 - 0.1) - Math.sin(ry) * 0.03, y, d.z + Math.cos(yaw) * (w / 2 - 0.1) - Math.cos(ry) * 0.03);
            blade.rotation.y = ry;
            blade.isPickable = false;
            this.atlasSigns.push({ mesh: blade, text, bg: "#2e8b57", fg: "#ffffff" });
          }
        });
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
        // (R4: Little Italy's are green, white or red with a white trim; Chinatown's are red paper parasols with a gold rim)
        const ucol = d.text === "it" ? ["#2f8f4e", "#f4f1ea", "#c8322c"][Math.floor(hash(d.x, d.z) * 3)] : d.text === "cn" ? "#c0282a" : hash(d.x, d.z) > 0.5 ? "#e14b4b" : "#43c7a6";
        top.position.set(d.x, 2.4, d.z); this.add(top, ucol, 0.02);
        if (d.text === "it" || d.text === "cn") {
          const rim = MeshBuilder.CreateTorus("urim", { diameter: 1.96, thickness: 0.06, tessellation: 16 }, sc); rim.position.set(d.x, 2.18, d.z); this.add(rim, d.text === "cn" ? "#e8b422" : "#f4f1ea", 0, false);
          const knob = MeshBuilder.CreateSphere("uknob", { diameter: 0.14, segments: 5 }, sc); knob.position.set(d.x, 2.66, d.z); this.add(knob, d.text === "cn" ? "#e8b422" : "#c8322c", 0, false);
          if (d.text === "cn") this.lantern(d.x + 0.7, 1.95, d.z, 0.6);
        }
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

  // =================================================================================================
  // R5: HOT STUFF PAWN & LOAN (looks only). A crooked, grimy little shop: Twitchy Lou's barred booth in the middle
  // of the front with a brass tray and a bell, a flickering neon flame over it, a door each side (OPEN / OPE neon),
  // half-down roller shutters with tags, a sagging awning, barbed wire along the roof, a CCTV camera, a big roof
  // sign facing the forts; Lou's Square paved out front. Inside: a wall of guitars, a stack of tellies all showing
  // static, a stuffed bear, Lou's desk (cash box, a little fan, a lamp), the back room's safe; signs everywhere.
  // =================================================================================================
  private neon: { mats: StandardMaterial[]; base: Color3[]; seed: number }[] = [];
  private stationLights: { red: StandardMaterial; blue: StandardMaterial } | null = null;
  private buildPawnShops() {
    const sc = this.scene, MB = MeshBuilder, L = HOT_PLOT, H = 4.4;
    for (const hs of this.arena.hotShops ?? []) {
      const sx = hs.idx ? 1 : -1, X = (x: number) => (sx < 0 ? x : -x), lou = hs.idx === 0;
      const Fz = L.minZ, Bz = L.maxZ, x0 = L.minX, x1 = L.maxX, zv = (v: number) => Fz + v;
      const G = 9101 + hs.idx; // (the inside's group: drawn only when you're near)
      this.group = -1; this.brk = "";
      const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, outline = 0.02) => { const m = MB.CreateBox("ps", { width: w, height: h, depth: d }, sc); m.position.set(X(x), y, z); this.add(m, col, outline, false); return m; };
      const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, outline = 0.012, t = 8) => { const m = MB.CreateCylinder("psc", { diameter: dia, height: h, tessellation: t }, sc); m.position.set(X(x), y, z); this.add(m, col, outline, false); return m; };
      const sph = (dia: number, x: number, y: number, z: number, col: string, outline = 0.01, seg = 6) => { const m = MB.CreateSphere("pss", { diameter: dia, segments: seg }, sc); m.position.set(X(x), y, z); this.add(m, col, outline, false); return m; };
      const plane = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial) => { const p = MB.CreatePlane("psp", { width: w, height: h }, sc); p.position.set(X(x), y, z); p.rotation.y = Math.atan2(-nx * -sx, -nz); p.material = mat; p.parent = this.root; p.isPickable = false; return p; };
      const sign = (text: string, w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, o: { bg?: string; fg?: string; stroke?: string } = {}) =>
        inG(plane(w, h, x, y, z, nx, nz, unlitTextured(sc, textTexture(sc, text, { w: 512, h: Math.max(64, Math.round(512 * h / w)), ...o }), "psSign-" + text))); // (inside: drawn near only)
      const skin = (list: Mesh[], w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, off = 0.12, tile = 2) => { const p = MB.CreatePlane("psk", { width: w, height: h }, sc); p.position.set(X(x + nx * off), y, z + nz * off); p.rotation.y = Math.atan2(-nx * -sx, -nz); scaleUVs(p, w / tile, h / tile); list.push(p); return p; };
      const bulbs: Mesh[] = [];
      const glow = (x: number, y: number, z: number, _col: string, d = 0.18) => { const b = MB.CreateSphere("psBulb", { diameter: d, segments: 5 }, sc); b.position.set(X(x), y, z); bulbs.push(b); return b; }; // (merged into one mesh at the end)
      const inG = (m: Mesh) => { if (this.group >= 0) { (this.unitPlanes.get(this.group) ?? this.unitPlanes.set(this.group, []).get(this.group)!).push(m); m.setEnabled(false); } return m; };
      const flicker = (mat: StandardMaterial) => { this.neon.push({ mats: [mat], base: [mat.emissiveColor.clone()], seed: this.neon.length * 7.3 + 1 + hs.idx }); return mat; };
      const dvm = 1.5, dw = 1.8, W = x1 - x0;
      // ---- outside: brick round the window and the door, the shop window, the fascia with the name
      const brick = this.planes.brick;
      skin(brick, 0.6, H, x0 + 0.3, H / 2, Fz, 0, -1); skin(brick, 0.6, H, x1 - 0.3, H / 2, Fz, 0, -1);
      skin(brick, W - 1.2, 0.6, (x0 + x1) / 2, 0.3, Fz, 0, -1); skin(brick, W - 1.2, H - 2.8, (x0 + x1) / 2, 2.8 + (H - 2.8) / 2, Fz, 0, -1);
      skin(brick, dvm - dw / 2, H, x0, H / 2, zv((dvm - dw / 2) / 2), -1, 0); skin(brick, dw, H - 2.6, x0, 2.6 + (H - 2.6) / 2, zv(dvm), -1, 0);
      skin(brick, Bz - zv(dvm + dw / 2), H, x0, H / 2, (zv(dvm + dw / 2) + Bz) / 2, -1, 0);
      skin(brick, W, H, (x0 + x1) / 2, H / 2, Bz, 0, 1); skin(brick, Bz - Fz, H, x1, H / 2, (Fz + Bz) / 2, 1, 0);
      for (const k of [1, 2, 3]) bx(0.08, 2.2, 0.1, x0 + 0.6 + k * (W - 1.2) / 4, 1.7, Fz + 0.15, "#2b2433", 0.005); // (the window's mullions)
      bx(W - 0.6, 0.85, 0.16, (x0 + x1) / 2, 3.45, Fz - 0.12, lou ? "#7a2f3a" : "#2f5a3a", 0.02); // (the fascia board)
      sign(hs.name, W - 1.4, 0.6, (x0 + x1) / 2, 3.5, Fz - 0.32, 0, -1, { fg: "#ffd54a", stroke: "#1b1420" });
      sign(lou ? "CASH 4 GOLD, GUITARS, GRANDMA'S TEETH" : "WE BUY. WE SELL. WE DON'T ASK.", W - 3, 0.26, (x0 + x1) / 2, 3.12, Fz - 0.32, 0, -1, { fg: "#f4f1ea", stroke: "#1b1420" });
      // the awning over the window, the three gold balls over the door (the pawnbroker's sign), the door's frame and mat
      { const aw = bx(W - 1.2, 0.08, 1.1, (x0 + x1) / 2, 2.72, Fz - 0.6, lou ? "#a83a3a" : "#3a7a5a", 0.02); aw.rotation.x = -0.35; }
      bx(0.9, 0.08, 0.08, x0 - 0.45, 3.55, zv(dvm), "#3a3444", 0.01);
      for (const [dz, y] of [[-0.25, 3.05], [0.25, 3.05], [0, 2.72]]) { sph(0.32, x0 - 0.85, y, zv(dvm) + dz, "#ffd54a", 0.012, 10); cyl(0.02, 3.55 - y, x0 - 0.85, (3.55 + y) / 2, zv(dvm) + dz, "#3a3444", 0); }
      bx(0.3, 0.15, dw + 0.3, x0 - 0.05, 2.62, zv(dvm), "#2b2433", 0.015);
      for (const e of [-1, 1]) bx(0.3, 2.55, 0.14, x0 - 0.05, 1.28, zv(dvm) + e * (dw / 2 + 0.05), "#2b2433", 0.01);
      bx(0.9, 0.03, 1.5, x0 - 0.6, 0.05, zv(dvm), "#6b3a1e", 0);
      { const nm = new StandardMaterial("psOpen" + hs.idx, sc); nm.disableLighting = true; const tx = textTexture(sc, "OPEN", { w: 256, h: 96, fg: "#43c7a6", stroke: "#0b2a24" }); nm.diffuseTexture = tx; nm.emissiveTexture = tx; nm.useAlphaFromDiffuseTexture = true; nm.emissiveColor = new Color3(1, 1, 1); plane(0.9, 0.34, x0 - 0.18, 2.95, zv(dvm + 1.5), -1, 0, flicker(nm)); }
      // the neon in the window: HOT STUFF with a flame (Lou's) / FINDERS KEEPERS with a grabbing hand (Fran's)
      {
        const t = new DynamicTexture("psNeon" + hs.idx, { width: 512, height: 256 }, sc, true), c = t.getContext() as unknown as CanvasRenderingContext2D;
        c.clearRect(0, 0, 512, 256);
        c.font = "bold 84px 'Luckiest Guy', Impact, sans-serif"; c.textBaseline = "middle"; c.lineWidth = 10;
        if (lou) {
          const flame = (x: number, y: number, s: number) => { c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x - 40 * s, y - 50 * s, x - 10 * s, y - 90 * s, x + 5 * s, y - 130 * s); c.bezierCurveTo(x + 20 * s, y - 80 * s, x + 50 * s, y - 60 * s, x, y); c.closePath(); };
          c.lineWidth = 9; c.strokeStyle = "#ff7a1a"; c.fillStyle = "rgba(255,140,40,0.35)"; flame(70, 230, 1.6); c.fill(); c.stroke();
          c.strokeStyle = "#5a0f14"; c.lineWidth = 10; c.strokeText("HOT", 150, 80); c.strokeText("STUFF", 150, 180);
          c.fillStyle = "#ff3c3c"; c.fillText("HOT", 150, 80); c.fillStyle = "#ffb03c"; c.fillText("STUFF", 150, 180);
        } else {
          c.strokeStyle = "#7aff6b"; c.lineWidth = 8; c.beginPath(); c.arc(70, 130, 46, 0, Math.PI * 2); c.stroke();
          for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(40 + i * 20, 95); c.lineTo(40 + i * 20, 40); c.stroke(); }
          c.strokeStyle = "#0b2a24"; c.lineWidth = 10; c.strokeText("FINDERS", 140, 80); c.strokeText("KEEPERS", 140, 180);
          c.fillStyle = "#7aff6b"; c.fillText("FINDERS", 140, 80); c.fillStyle = "#ff6fb5"; c.fillText("KEEPERS", 140, 180);
        }
        t.update(); t.hasAlpha = true;
        const m = new StandardMaterial("psNeonMat" + hs.idx, sc); m.diffuseTexture = t; m.emissiveTexture = t; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true; m.backFaceCulling = false; m.emissiveColor = new Color3(1, 1, 1);
        plane(2.6, 1.3, -55.4, 2.1, zv(0.35), 0, -1, flicker(m));
      }
      // the suit of armour out front (on a plinth by the door, a sword, a FOR SALE tag)
      {
        const a = hs.armour, ax = sx < 0 ? a.x : -a.x, az = a.z;
        bx(0.75, 0.2, 0.75, ax, 0.1, az, "#5a3a24", 0.01);
        for (const s of [-1, 1]) cyl(0.17, 0.75, ax, 0.6, az + s * 0.12, "#b8b4c8", 0.012);
        { const body = MB.CreateCylinder("aBody", { diameterTop: 0.5, diameterBottom: 0.38, height: 0.65, tessellation: 10 }, sc); body.position.set(X(ax), 1.3, az); this.add(body, "#c9ccd4", 0.015, false); }
        cyl(0.3, 0.36, ax, 1.82, az, "#d8dce4", 0.012, 10);
        bx(0.04, 0.04, 0.2, ax - 0.15, 1.84, az, "#1b1420", 0);
        { const pl = MB.CreateCylinder("aPlume", { diameterTop: 0.02, diameterBottom: 0.1, height: 0.3, tessellation: 6 }, sc); pl.position.set(X(ax + 0.03), 2.12, az); this.add(pl, "#d6264a", 0, false); }
        for (const s of [-1, 1]) cyl(0.13, 0.6, ax, 1.25, az + s * 0.32, "#b8b4c8", 0.01);
        bx(0.02, 1.1, 0.05, ax - 0.12, 0.95, az + 0.38, "#e8ecf2", 0.008);
        sign(lou ? "SIR CLANKS-A-LOT  $900" : "GENUINE KNIGHT (ONE OWNER)", 0.7, 0.25, ax - 0.27, 1.25, az, -1, 0, { bg: "#f4f1ea", fg: "#1b1420" });
      }
      // a roof sign facing Gahookz, lit
      {
        const y = H + 1.5, sz = zv(1.2);
        for (const x of [-56.0, -50.8]) { bx(0.12, 1.6, 0.12, x, H + 0.8, sz, "#3a3444", 0.01); }
        bx(6.4, 1.3, 0.2, -53.4, y, sz, "#1b1420", 0.03);
        sign(lou ? "HOT STUFF  -  WE BUY ANYTHING" : "FINDERS KEEPERS  -  NO QUESTIONS", 6.2, 1.1, -53.4, y, sz - 0.22, 0, -1, { bg: "#1b1420", fg: lou ? "#ff4a2a" : "#7aff6b" });
        for (let x = -56.4; x <= -50.4; x += 0.6) glow(x, y + 0.72, sz, "#ffe08a", 0.13);
      }
      // ---- inside (drawn near only): wallpaper, a slatwall of junk at the back, guitars, bare bulbs, the counters' clutter
      this.group = G;
      const wp = (w: number, h: number, x: number, y: number, z: number, nx: number, nz: number) => skin(this.planes.wallpaper, w, h, x, y, z, nx, nz, 0.1, 2);
      wp(W - 0.6, H, (x0 + x1) / 2, H / 2, Bz - 0.3, 0, -1);
      wp(Bz - Fz - 0.6, H, x1 - 0.3, H / 2, (Fz + Bz) / 2, -1, 0);
      wp(Bz - zv(dvm + dw / 2) - 0.3, H, x0 + 0.3, H / 2, (zv(dvm + dw / 2) + Bz - 0.3) / 2, 1, 0);
      wp(W - 0.6, H - 2.8, (x0 + x1) / 2, 2.8 + (H - 2.8) / 2, Fz + 0.3, 0, 1);
      // the slatwall: white slats right across the back, crammed with stuff
      const sb = this.arena.boxes.find((b) => b.deco === "slatwall" && Math.abs(b.x - hs.boss.x) < 8)!;
      const sz0 = sb.z - sb.d / 2; // (its front face, toward the counters)
      bx(W - 0.8, 2.4, 0.06, (x0 + x1) / 2, 1.2 + 0.25, sz0 + 0.03, "#ece8dc", 0.01);
      for (let k = 0; k < 14; k++) bx(W - 0.8, 0.02, 0.05, (x0 + x1) / 2, 0.35 + k * 0.17, sz0 - 0.01, "#b8b4a8", 0);
      const cols = ["#d6264a", "#1b1420", "#ffd54a", "#3d6fb5", "#f4f1ea", "#43c7a6", "#ff8fa3", "#8b5a2b", "#6b3f7a", "#c9ccd4"];
      const H2 = (i: number, j: number) => hash(i * 3.1 + hs.idx * 17, j * 1.7 + 5);
      for (let i = 0; i < 22; i++) {
        const x = x0 + 0.8 + (i + 0.5) * (W - 1.6) / 22, row = i % 3, y = 0.6 + row * 0.75 + H2(i, 1) * 0.15, z = sz0 - 0.12, c = cols[Math.floor(H2(i, 2) * cols.length)];
        const kind = Math.floor(H2(i, 3) * 7);
        if (kind === 0) { bx(0.45, 0.3, 0.18, x, y, z, c, 0.01); bx(0.35, 0.2, 0.02, x, y, z - 0.1, "#1b1420", 0); } // a boombox
        else if (kind === 1) { sph(0.32, x, y + 0.1, z, c, 0.012, 8).scaling.set(1, 0.8, 0.5); bx(0.03, 0.4, 0.03, x, y + 0.42, z, "#3a3444", 0); } // a hat on a hook
        else if (kind === 2) { bx(0.38, 0.5, 0.04, x, y + 0.1, z, "#8b5a2b", 0.01); bx(0.3, 0.42, 0.02, x, y + 0.1, z - 0.03, c, 0); } // a framed picture
        else if (kind === 3) { bx(0.5, 0.12, 0.2, x, y, z, "#1b1420", 0.01); for (let k = 0; k < 6; k++) bx(0.05, 0.02, 0.12, x - 0.2 + k * 0.08, y + 0.07, z - 0.02, "#f4f1ea", 0); } // a little keyboard
        else if (kind === 4) { cyl(0.22, 0.3, x, y, z, c, 0.01, 10); } // a drum
        else if (kind === 5) { sph(0.28, x, y, z, c, 0.01, 6).scaling.set(1, 1.3, 0.6); bx(0.24, 0.04, 0.04, x, y + 0.22, z, "#3a3444", 0); } // a handbag
        else { bx(0.34, 0.24, 0.14, x, y, z, c, 0.01); cyl(0.12, 0.05, x - 0.08, y + 0.02, z - 0.08, "#1b1420", 0).rotation.x = Math.PI / 2; } // a camera
      }
      // a moose head (well, a moose), a ship in a bottle on the top shelf, a disco ball
      { const mz = sz0 - 0.2; sph(0.5, -53.4, 3.2, mz, "#7a4a2a", 0.015, 8).scaling.set(1, 0.9, 0.8); for (const s of [-1, 1]) { const an = bx(0.5, 0.05, 0.05, -53.4 + s * 0.35, 3.55, mz, "#c9a07a", 0.01); an.rotation.z = s * 0.5; } }
      { const db = sph(0.4, -50.0, H - 0.6, zv(6.5), "#c9ccd4", 0.01, 8); void db; cyl(0.01, 0.3, -50.0, H - 0.25, zv(6.5), "#3a3444", 0); }
      // the guitars on the owner's side wall
      const gb = this.arena.boxes.find((b) => b.deco === "guitars" && Math.abs(b.x - hs.boss.x) < 8);
      if (gb) for (let i = 0; i < 5; i++) {
        const z = gb.z - gb.d / 2 + 0.4 + i * (gb.d - 0.8) / 4, x = (sx < 0 ? gb.x : -gb.x) + 0.25, c = cols[i * 2 % cols.length];
        sph(0.45, x, 1.05, z, c, 0.015, 8).scaling.set(0.25, 1.25, 1); sph(0.34, x, 1.38, z, c, 0.015, 8).scaling.set(0.25, 1, 1);
        bx(0.04, 0.75, 0.07, x, 1.85, z, "#8b5a2b", 0.01); bx(0.04, 0.18, 0.12, x, 2.3, z, "#5a3a24", 0.01);
      }
      // the counters: jewellery busts, watches, rings, chains, old phones, coins (and the glass over them breaks)
      hs.counters.forEach((r0, ci) => {
        const r = { minX: sx < 0 ? r0.minX : -r0.maxX, maxX: sx < 0 ? r0.maxX : -r0.minX, minZ: r0.minZ, maxZ: r0.maxZ }; // (in the left shop's x)
        const w = r.maxX - r.minX, d = r.maxZ - r.minZ, cxx = (r.minX + r.maxX) / 2, czz = (r.minZ + r.maxZ) / 2, top = 1.05;
        bx(w - 0.08, 0.04, d - 0.08, cxx, top - 0.37, czz, "#4a2a3a", 0); // (the felt inside, under the glass)
        const n = Math.max(3, Math.round((w * d) / 0.18));
        for (let i = 0; i < n; i++) {
          const u = r.minX + 0.15 + H2(ci * 50 + i, 7) * (w - 0.3), v = r.minZ + 0.12 + H2(ci * 50 + i, 8) * (d - 0.24), k = Math.floor(H2(ci * 50 + i, 9) * 6), c = ["#ffd54a", "#c9ccd4", "#d6264a", "#43c7a6"][i % 4];
          if (k === 0) { cyl(0.1, 0.22, u, top - 0.24, v, "#7a1a2a", 0.005); const ch = MB.CreateTorus("chain", { diameter: 0.12, thickness: 0.012, tessellation: 10 }, sc); ch.position.set(X(u), top - 0.16, v); ch.rotation.x = 0.4; this.add(ch, "#ffd54a", 0, false); }
          else if (k === 1) { const rg = MB.CreateTorus("ring", { diameter: 0.05, thickness: 0.012, tessellation: 8 }, sc); rg.position.set(X(u), top - 0.33, v); this.add(rg, c, 0, false); sph(0.025, u, top - 0.31, v, "#9fe3ff", 0, 4); }
          else if (k === 2) { cyl(0.07, 0.015, u, top - 0.34, v, "#1b1420", 0.004, 10); bx(0.03, 0.01, 0.14, u, top - 0.345, v, "#5a3a24", 0); } // a watch
          else if (k === 3) { bx(0.09, 0.02, 0.16, u, top - 0.34, v, "#3a3444", 0.004); } // an old phone
          else if (k === 4) { for (let j = 0; j < 3; j++) cyl(0.05, 0.01, u + j * 0.02, top - 0.345 + j * 0.01, v, "#e8b83a", 0, 8); } // coins
          else { const nk = MB.CreateTorus("necklace", { diameter: 0.18, thickness: 0.01, tessellation: 12 }, sc); nk.position.set(X(u), top - 0.34, v); this.add(nk, c, 0, false); }
        }
        // the glass: its own mesh, tagged with its prop (smashed: it disappears)
        const pid = [...(this.arena.props ?? [])].find((p) => p.kind === "glasscounter" && Math.abs(p.x - (r0.minX + r0.maxX) / 2) < 0.05 && Math.abs(p.z - czz) < 0.05)?.id ?? "";
        // (see-through, and its own mesh: a smash hides it)
        const gm = this.counterGlassMat ?? (() => { const m = new StandardMaterial("counterGlass", sc); m.diffuseColor = Color3.FromHexString("#bfe8ff"); m.emissiveColor = Color3.FromHexString("#2a5a70"); m.specularColor = Color3.FromHexString("#ffffff"); m.alpha = 0.25; m.backFaceCulling = false; return (this.counterGlassMat = m); })();
        const gmesh = MB.CreateBox("counterGlass", { width: w + 0.02, height: 0.34, depth: d + 0.02 }, sc); gmesh.position.set(X(cxx), top - 0.17, czz); gmesh.material = gm; gmesh.parent = this.root; gmesh.isPickable = false; gmesh.alphaIndex = 2;
        if (pid) this.glassOf.set(pid, gmesh);
        bx(w + 0.04, 0.03, d + 0.04, cxx, top + 0.005, czz, "#c9a227", 0.006); // (the brass rim)
      });
      // the till: an old cash register, a bell, a sign; Lou's / Fran's stool, a calendar, a fan
      {
        const tx = sx < 0 ? hs.boss.x : -hs.boss.x, tz = hs.stand.z + 0.95;
        bx(0.5, 0.32, 0.4, tx, 1.25, tz, "#c9a227", 0.012); bx(0.36, 0.12, 0.08, tx, 1.48, tz + 0.12, "#1b1420", 0);
        bx(0.6, 0.04, 0.3, tx + 0.45, 1.08, tz - 0.05, "#3a3444", 0);
        { const bell = MB.CreateSphere("psBell", { diameter: 0.12, segments: 6, slice: 0.5 }, sc); bell.position.set(X(tx - 0.5), 1.08, tz - 0.1); this.add(bell, "#d9a632", 0.01, false); }
        sign(lou ? "RING 4 LOU" : "RING 4 FRAN (SHE HEARS YOU)", 0.9, 0.22, tx, 1.3, hs.stand.z + 0.58, 0, -1, { bg: "#f4f1ea", fg: "#c41e3a" });
        cyl(0.4, 0.06, tx + 0.6, 0.75, hs.boss.z + 0.3, "#5a3a24", 0.01, 10); cyl(0.05, 0.72, tx + 0.6, 0.37, hs.boss.z + 0.3, "#3a3444", 0);
        sign(lou ? "PIN-UP CALENDAR 1987" : "CATS OF 1993", 0.6, 0.8, -57.5, 2.0, sz0 - 0.08, 0, -1, { bg: "#f4f1ea", fg: "#c41e3a" });
      }
      // signs, bare bulbs
      sign(lou ? "YOU BREAK IT, MEAT BREAKS YOU" : "YOU BREAK IT, COLD CUTS BREAKS YOU", 2.8, 0.4, -50.5, 3.2, sz0 - 0.1, 0, -1, { bg: "#ffd54a", fg: "#1b1420" });
      sign("NO REFUNDS. NO RECEIPTS. NO REGRETS.", 2.6, 0.36, -56.0, 3.3, sz0 - 0.1, 0, -1, { bg: "#1b1420", fg: "#ffd54a" });
      sign("DO NOT TAP ON THE GLASS", 1.6, 0.3, x1 - 0.42, 2.2, zv(3.0), -1, 0, { bg: "#c41e3a", fg: "#f4f1ea" });
      // more clutter: a bicycle on the wall over the side case, a rug, a standing lamp, a ceiling fan, a mannequin
      { const bz0 = zv(3.0), bxw = x1 - 0.45; for (const dz of [-0.55, 0.55]) { const wh = MB.CreateTorus("bikeWheel", { diameter: 0.62, thickness: 0.04, tessellation: 14 }, sc); wh.position.set(X(bxw), 2.75, bz0 + dz); wh.rotation.z = Math.PI / 2; this.add(wh, "#1b1420", 0, false); } bx(0.05, 0.05, 1.1, bxw, 2.85, bz0, "#d6264a", 0.006); bx(0.05, 0.5, 0.05, bxw, 3.0, bz0 + 0.25, "#d6264a", 0.006); bx(0.06, 0.04, 0.3, bxw, 3.25, bz0 + 0.3, "#1b1420", 0); }
      bx(3.4, 0.015, 2.2, -54.4, 0.035, zv(2.8), "#8e1f2e", 0); bx(3.0, 0.016, 1.8, -54.4, 0.04, zv(2.8), "#c9a227", 0); bx(2.6, 0.017, 1.4, -54.4, 0.045, zv(2.8), "#8e1f2e", 0);
      cyl(0.04, 1.7, x0 + 0.6, 0.85, zv(4.9), "#3a3444", 0); { const sh = MB.CreateCylinder("lampShade", { diameterTop: 0.25, diameterBottom: 0.45, height: 0.35, tessellation: 10 }, sc); sh.position.set(X(x0 + 0.6), 1.85, zv(4.9)); this.add(sh, "#e8b45a", 0.01, false); } glow(x0 + 0.6, 1.78, zv(4.9), "#ffe9a8", 0.15);
      cyl(0.18, 0.12, -53.4, H - 0.3, zv(4.0), "#5a3a24", 0.01); for (const a of [0, Math.PI / 2]) { const bl = bx(1.5, 0.02, 0.2, -53.4, H - 0.38, zv(4.0), "#5a3a24", 0.005); bl.rotation.y = a + 0.4; }
      // the cabinets under the glass counters (gold-trimmed wood)
      for (const r0 of hs.counters) {
        const r = { minX: sx < 0 ? r0.minX : -r0.maxX, maxX: sx < 0 ? r0.maxX : -r0.minX, minZ: r0.minZ, maxZ: r0.maxZ };
        const w = r.maxX - r.minX, d = r.maxZ - r.minZ, cxx = (r.minX + r.maxX) / 2, czz = (r.minZ + r.maxZ) / 2;
        bx(w, 0.68, d, cxx, 0.34, czz, "#5a3a24", 0.02); bx(w + 0.04, 0.05, d + 0.04, cxx, 0.69, czz, "#c9a227", 0.008);
        for (const sxx of [-1, 1]) for (const szz of [-1, 1]) bx(0.04, 0.34, 0.04, cxx + sxx * (w / 2 - 0.02), 0.87, czz + szz * (d / 2 - 0.02), "#c9a227", 0);
      }
      for (const [x, v] of [[-57.5, 2.6], [-54.2, 2.8], [-50.8, 2.6], [-55.8, 7.8], [-51.0, 7.8]] as [number, number][]) { cyl(0.02, 0.5, x, H - 0.25, zv(v), "#1b1420", 0); glow(x, H - 0.55, zv(v), "#ffe9a8", 0.2); }
      // the window display: the bear, the drums, the tellies (static)
      for (const b of this.arena.boxes) {
        if (!b.deco || Math.abs(b.x - hs.boss.x) > 8 || b.z < Fz || b.z > Bz) continue;
        const lx = sx < 0 ? b.x : -b.x; // (left-shop x)
        if (b.deco === "bear") {
          bx(0.8, 0.2, 0.7, lx, 0.1, b.z, "#5a3a24", 0.01);
          sph(0.8, lx, 0.75, b.z, "#7a4a2a", 0.02, 10).scaling.set(1, 1.3, 0.9); sph(0.5, lx, 1.4, b.z - 0.05, "#7a4a2a", 0.02, 10); sph(0.2, lx, 1.35, b.z - 0.27, "#c9a07a", 0.01);
          for (const s of [-1, 1]) sph(0.16, lx + s * 0.18, 1.62, b.z, "#7a4a2a", 0.01);
          sign("$40 OBO", 0.4, 0.2, lx, 0.8, b.z - 0.45, 0, -1, { bg: "#f4f1ea", fg: "#1b1420" });
        } else if (b.deco === "mannequin") {
          bx(0.6, 0.12, 0.6, lx, 0.06, b.z, "#3a3444", 0.01); cyl(0.04, 0.8, lx, 0.5, b.z, "#c8c4cc", 0);
          sph(0.5, lx, 1.3, b.z, "#1b1420", 0.015).scaling.set(1, 1.4, 0.7); // (the leather jacket)
          for (const s2 of [-1, 1]) { const arm = cyl(0.14, 0.6, lx + s2 * 0.3, 1.2, b.z, "#1b1420", 0.01); arm.rotation.z = s2 * 0.15; }
          sph(0.26, lx, 1.78, b.z, "#e8dcc8", 0.01); bx(0.2, 0.05, 0.03, lx, 1.8, b.z - 0.13, "#1b1420", 0); // (head, shades)
          sign("BARELY WORN", 0.45, 0.18, lx, 0.85, b.z - 0.31, 0, -1, { bg: "#f4f1ea", fg: "#c41e3a" });
        } else if (b.deco === "drums") {
          cyl(0.55, 0.4, lx, 0.5, b.z, "#d6264a", 0.012, 12).rotation.x = Math.PI / 2;
          cyl(0.32, 0.18, lx - 0.35, 0.75, b.z - 0.15, "#f4f1ea", 0.01, 10); cyl(0.32, 0.18, lx + 0.35, 0.75, b.z - 0.15, "#f4f1ea", 0.01, 10);
          cyl(0.4, 0.02, lx + 0.4, 1.2, b.z + 0.1, "#e8b83a", 0.005, 12); cyl(0.02, 1.2, lx + 0.4, 0.6, b.z + 0.1, "#3a3444", 0);
        } else if (b.deco === "tvstack") {
          for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
            const x = lx - 0.3 + col * 0.6, y = 0.3 + row * 0.55 + 0.27;
            bx(0.58, 0.5, 0.6, x, y, b.z, ["#8b5a2b", "#3a3444", "#c9c5d6"][(row + col) % 3], 0.015);
            const scr = MB.CreatePlane("tvScreen", { width: 0.42, height: 0.36 }, sc); scr.position.set(X(x), y, b.z - 0.31); scr.rotation.y = 0;
            scr.material = this.tvStaticMat(); scr.parent = this.root; scr.isPickable = false; inG(scr);
          }
        }
      }
      this.group = -1;
      const merged = bulbs.length ? Mesh.MergeMeshes(bulbs, true, true) : null;
      if (merged) { merged.material = this.glowMat("#ffe9a8"); merged.parent = this.root; merged.isPickable = false; merged.freezeWorldMatrix(); }
    }
  }

  /** (one shared material of TV static for the pawn shop's tellies) */
  private tvStaticMat(): StandardMaterial {
    if (this.tvMat) return this.tvMat;
    const st = this.pawnStatic ?? (() => { const tex = new DynamicTexture("tvStatic", { width: 64, height: 64 }, this.scene, false); const c = tex.getContext() as unknown as CanvasRenderingContext2D; for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) { const v = Math.floor(Math.random() * 255); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(i, j, 1, 1); } tex.update(); tex.wrapU = 1; tex.wrapV = 1; this.pawnStatic = { tex, t: 0 }; return this.pawnStatic; })();
    const m = new StandardMaterial("tvStaticMat2", this.scene); m.diffuseTexture = st.tex; m.emissiveTexture = st.tex; m.disableLighting = true;
    return (this.tvMat = m);
  }
  private tvMat: StandardMaterial | null = null;

  // =================================================================================================
  // R6: the new city's police station (looks only), after Blake's photo: a modern civic building. Red-brick wings
  // either side of a light stone centre, a tall glass entrance bay rising above the roof, a cantilevered canopy over
  // the doors with POLICE standing on it, ribbon windows, three stone upper floors with a blue fascia, a helipad with
  // a police helicopter (its rotor turns; its searchlight sweeps at night). Inside: the reception, the breakroom,
  // and the holding cell (white subway tiles in the shower corner, a toilet, a bench, tally marks on the wall).
  // =================================================================================================
  private heliRotor: Mesh[] = [];
  private lastUpd = performance.now();
  private heliBeam: Mesh | null = null;
  private buildStationUpper() {
    const U = this.arena.stationUpper, st = this.arena.station;
    if (!U || !st) return;
    const sc = this.scene, MB = MeshBuilder, q = U.rect, y0 = U.y0, y1 = U.y1, cx = (q.minX + q.maxX) / 2, cz = (q.minZ + q.maxZ) / 2;
    const W = q.maxX - q.minX, D = q.maxZ - q.minZ, R0 = st.rect, fz = R0.maxZ - 0.2, bz = R0.minZ + 0.2, xL = R0.minX + 0.2, xR = R0.maxX - 0.2;
    const GH = 4.5, CB = 3.2; // (the ground floor's height; the stone centre bay's half-width)
    this.group = -1; this.brk = "";
    const bx = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, outline = 0.02, cast = false) => { const m = MB.CreateBox("pd", { width: w, height: h, depth: d }, sc); m.position.set(x, y, z); this.add(m, col, outline, cast); return m; };
    const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, outline = 0.015, t = 10) => { const m = MB.CreateCylinder("pdc", { diameter: dia, height: h, tessellation: t }, sc); m.position.set(x, y, z); this.add(m, col, outline, false); return m; };
    const plane = (w: number, hh: number, x: number, y: number, z: number, nx: number, nz: number, mat: StandardMaterial) => { const p = MB.CreatePlane("pdp", { width: w, height: hh }, sc); p.position.set(x, y, z); p.rotation.y = Math.atan2(-nx, -nz); p.material = mat; p.parent = this.root; p.isPickable = false; return p; };
    const over = (list: Mesh[], w: number, hh: number, x: number, y: number, z: number, nx: number, nz: number, tile: number, off = 0.12) => { const p = MB.CreatePlane("pdo", { width: w, height: hh }, sc); p.position.set(x + nx * off, y, z + nz * off); p.rotation.y = Math.atan2(-nx, -nz); scaleUVs(p, w / tile, hh / tile); list.push(p); return p; };
    const win = (list: Mesh[], w: number, hh: number, x: number, y: number, z: number, nx: number, nz: number) => { const p = MB.CreatePlane("win", { width: w, height: hh }, sc); p.position.set(x + nx * WIN_OFF, y, z + nz * WIN_OFF); p.rotation.y = Math.atan2(-nx, -nz); scaleUVs(p, Math.max(1, Math.round(w / 1.6)) / 4, Math.max(1, Math.round(hh / 2.2)) / 4); list.push(p); return p; };
    // ---- R8: the outside skins, cut round the real windows (and the front doors): brick on the ground floor's wings,
    //      sides and back, stone round the doors, stone panels upstairs. Each window gets a dark frame and mullions.
    const gw0 = st.grand?.windows ?? [];
    type Hole = { u0: number; u1: number; y0: number; y1: number };
    const faceOf = (f: "N" | "S" | "E" | "W") => f === "N" ? { nx: 0, nz: 1, ua: xL, ub: xR, at: (u: number) => [u, fz] as [number, number] }
      : f === "S" ? { nx: 0, nz: -1, ua: xL - 0.2, ub: xR + 0.2, at: (u: number) => [u, bz] as [number, number] }
      : f === "E" ? { nx: 1, nz: 0, ua: 0, ub: fz - bz, at: (u: number) => [xR + 0.2, fz - u] as [number, number] }
      : { nx: -1, nz: 0, ua: 0, ub: fz - bz, at: (u: number) => [xL - 0.2, fz - u] as [number, number] };
    const skinFace = (list: Mesh[], f: "N" | "S" | "E" | "W", ua: number, ub: number, ya: number, yb: number, holes: Hole[], tile: number) => {
      const F = faceOf(f), hs = holes.filter((h) => h.u1 > ua && h.u0 < ub && h.y1 > ya && h.y0 < yb);
      const ys = [...new Set([ya, yb, ...hs.flatMap((h) => [Math.max(ya, h.y0), Math.min(yb, h.y1)])])].sort((p1, p2) => p1 - p2);
      for (let i = 0; i + 1 < ys.length; i++) {
        const y0s = ys[i], y1s = ys[i + 1]; if (y1s - y0s < 0.01) continue;
        const act = hs.filter((h) => h.y0 <= y0s && h.y1 >= y1s).sort((p1, p2) => p1.u0 - p2.u0);
        let u = ua;
        const put = (u0: number, u1: number) => { if (u1 - u0 < 0.01) return; const [x, z] = F.at((u0 + u1) / 2); over(list, u1 - u0, y1s - y0s, x, (y0s + y1s) / 2, z, F.nx, F.nz, tile); };
        for (const h of act) { put(u, Math.max(ua, h.u0)); u = Math.max(u, h.u1); }
        put(u, ub);
      }
    };
    const holes = (f: "N" | "S" | "E" | "W"): Hole[] => [...gw0.filter((w) => w.face === f), ...(f === "N" ? [{ u0: -1.5, u1: 1.5, y0: 0, y1: 2.8 }] : [])];
    // (the frames: a dark surround, mullions every 1.6 m or so, a stone sill)
    for (const w of gw0) {
      const F = faceOf(w.face), len = w.u1 - w.u0, n = Math.max(1, Math.round(len / 1.6)), ry = Math.atan2(-F.nx, -F.nz);
      const frame = (u: number, y: number, along: number, tall: number, col: string, d = 0.12) => { const [x, z] = F.at(u); const m = MB.CreateBox("pdFrame", { width: along, height: tall, depth: d }, sc); m.position.set(x + F.nx * 0.03, y, z + F.nz * 0.03); m.rotation.y = ry; this.add(m, col, 0.006, false); };
      frame((w.u0 + w.u1) / 2, w.y1, len + 0.1, 0.1, "#2b3040"); frame((w.u0 + w.u1) / 2, w.y0 - 0.06, len + 0.3, 0.12, "#e8e2d4", 0.3);
      for (let k = 0; k <= n; k++) frame(w.u0 + (len * k) / n, (w.y0 + w.y1) / 2, 0.08, w.y1 - w.y0, "#2b3040");
    }
    for (const sx of [-1, 1]) skinFace(this.planes.brick, "N", sx < 0 ? xL : CB, sx < 0 ? -CB : xR, 0, GH, holes("N"), 2);
    skinFace(this.planes.brick, "E", 0, fz - bz, 0, GH, holes("E"), 2); skinFace(this.planes.brick, "W", 0, fz - bz, 0, GH, holes("W"), 2);
    skinFace(this.planes.brick, "S", xL - 0.2, xR + 0.2, 0, GH, holes("S"), 2);
    // the stone centre bay round the doors; the stone piers
    skinFace(this.planes.concrete, "N", -CB, CB, 0, GH, holes("N"), 4);
    for (const sx of [-1, 1]) bx(0.35, GH + 0.1, 0.45, sx * CB, GH / 2, fz + 0.12, "#e8e2d4", 0.025); // (stone piers)
    // ---- the canopy over the doors, POLICE standing on it, two struts
    {
      const cw = 9, cd = 3.4, cy = 3.25;
      bx(cw, 0.32, cd, 0, cy, fz + cd / 2, "#3a4558", 0.03, true);
      bx(cw + 0.1, 0.12, cd + 0.1, 0, cy - 0.2, fz + cd / 2, "#2f5a9a", 0.015);
      // (R9: two tie rods from the canopy's front corners up to the wall above it, with a plate where each meets the wall)
      for (const sx of [-1, 1]) {
        const ax = sx * 3.9, A = new Vector3(ax, cy + 0.12, fz + cd - 0.25), Bp = new Vector3(ax, cy + 1.9, fz + 0.04), len = Vector3.Distance(A, Bp);
        const rod = MB.CreateBox("pdTie", { width: 0.1, height: 0.1, depth: len }, sc); rod.position.copyFrom(A.add(Bp).scale(0.5)); rod.lookAt(Bp); this.add(rod, "#3a4558", 0.008, false);
        bx(0.32, 0.32, 0.06, ax, cy + 1.9, fz + 0.03, "#3a4558", 0.006);
        bx(0.2, 0.2, 0.2, ax, cy + 0.2, fz + cd - 0.25, "#3a4558", 0.006);
      }
      const t = textTexture(sc, "POLICE", { w: 1024, h: 220, fg: "#f4f1ea", stroke: "#3a4558" });
      const m = new StandardMaterial("pdPolice", sc); m.diffuseTexture = t; m.emissiveTexture = t; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true; m.emissiveColor = new Color3(1, 1, 1); m.backFaceCulling = false;
      plane(6.4, 1.2, 0, cy + 0.78, fz + cd - 0.35, 0, 1, m);
      for (let i = 0; i < 6; i++) bx(0.06, 0.3, 0.06, -2.7 + i * 1.08, cy + 0.3, fz + cd - 0.4, "#3a4558", 0);
      const lamp = MB.CreateBox("canopyLight", { width: 0.5, height: 0.06, depth: 0.5 }, sc); lamp.position.set(0, cy - 0.2, fz + 1.4); lamp.material = this.glowMat("#fff2c8"); lamp.parent = this.root; lamp.isPickable = false;
    }
    // ---- the upper floors: stone panels, a ribbon window on every floor, a blue fascia on top (R7: the first floor
    //      is real (walls, offices: the station's own boxes); the solid block only starts above it)
    const wt = U.walkTop ?? y0;
    bx(W, y1 - wt, D, cx, (wt + y1) / 2, cz, "#d8d2c6", 0.05, true);
    // (the stone belt course between the ground floor and the first: a ring round the outside, not a slab through it)
    for (const [w2, d2, x2, z2] of [[xR - xL + 0.6, 0.3, cx, fz + 0.15], [xR - xL + 0.6, 0.3, cx, bz - 0.15], [0.3, fz - bz, xL - 0.15, (fz + bz) / 2], [0.3, fz - bz, xR + 0.15, (fz + bz) / 2]] as [number, number, number, number][]) bx(w2, 0.35, d2, x2, y0 + 0.05, z2, "#e8e2d4", 0.03);
    bx(W + 0.9, 0.7, D + 0.9, cx, y1 + 0.2, cz, "#2f5a9a", 0.03);
    // (the first floor's real glass is cut out of the stone; the two floors above it get painted ribbon windows)
    for (const f of ["N", "S", "E", "W"] as const) { const F = faceOf(f); skinFace(this.planes.concrete, f, F.ua, F.ub, GH, y1, holes(f), 3); }
    const floors = 2, fh = (y1 - wt) / floors;
    for (const [nx, nz, fw, wx, wz] of [[0, 1, xR - xL, cx, fz], [0, -1, xR - xL, cx, bz], [1, 0, fz - bz, xR + 0.2, (fz + bz) / 2], [-1, 0, fz - bz, xL - 0.2, (fz + bz) / 2]] as [number, number, number, number, number][]) {
      for (let k = 0; k < floors; k++) {
        const wy = wt + k * fh + fh * 0.55;
        win(this.planes.winBlinds, fw - 1.6, fh * 0.5, wx, wy, wz, nx, nz);
        const ry = Math.atan2(-nx, -nz), band = MB.CreateBox("pdband", { width: fw - 1.2, height: 0.14, depth: 0.32 }, sc); band.position.set(wx + nx * 0.16, wy - fh * 0.29, wz + nz * 0.16); band.rotation.y = ry; this.add(band, "#e8e2d4", 0.01, false);
      }
    }
    // ---- the glass entrance bay: rising out of the canopy above the roof, stone piers either side, a blue cap
    {
      const gw = 4.4, gz = fz + 0.3, top = y1 + 2.2;
      bx(gw, top - GH, 1.0, 0, GH + (top - GH) / 2, gz - 0.2, "#2b3a55", 0.03, true);
      const cw2 = MB.CreatePlane("curt", { width: gw - 0.4, height: top - GH - 0.6 }, sc); cw2.position.set(0, GH + (top - GH) / 2, gz + 0.42); cw2.rotation.y = Math.PI; scaleUVs(cw2, 2, Math.round((top - GH) / 2.2)); this.planes.curtain.push(cw2);
      for (const sx of [-1, 1]) bx(0.7, top - GH + 0.6, 1.2, sx * (gw / 2 + 0.3), GH + (top - GH) / 2 + 0.3, gz - 0.2, "#e8e2d4", 0.03, true);
      bx(gw + 2.2, 0.5, 1.8, 0, top + 0.6, gz - 0.2, "#2f5a9a", 0.03);
      const star = MB.CreateCylinder("pdStar", { diameter: 1.4, height: 0.14, tessellation: 6 }, sc); star.rotation.x = Math.PI / 2; star.position.set(0, top - 1.0, gz + 0.45); this.add(star, "#d9a632", 0.02, false);
    }
    // ---- the roof: a helipad with a police helicopter, an antenna, AC units
    {
      const hx = cx - 2.0, hz = cz - 0.6, ry = y1 + 0.6;
      const pad = MB.CreateCylinder("helipad", { diameter: 8.4, height: 0.12, tessellation: 32 }, sc); pad.position.set(hx, ry, hz); this.add(pad, "#3a3a44", 0.02, false);
      const ring = MB.CreateTorus("padring", { diameter: 7.4, thickness: 0.18, tessellation: 32 }, sc); ring.position.set(hx, ry + 0.07, hz); this.add(ring, "#ffd54a", 0, false);
      const hm = unlitTextured(sc, textTexture(sc, "H", { w: 256, h: 256, fg: "#f4f1ea" }), "padH"); const hp = MB.CreateGround("padH", { width: 3.2, height: 3.2 }, sc); hp.position.set(hx, ry + 0.08, hz); hp.material = hm; hp.parent = this.root; hp.isPickable = false;
      for (let a = 0; a < 8; a++) { const l = MB.CreateSphere("padlamp", { diameter: 0.16, segments: 4 }, sc); l.position.set(hx + Math.cos(a * Math.PI / 4) * 4.1, ry + 0.12, hz + Math.sin(a * Math.PI / 4) * 4.1); l.material = this.glowMat("#7fd0ff"); l.parent = this.root; l.isPickable = false; }
      // the helicopter (nose to the north-east)
      const yaw = 0.7, X = (u: number, w: number) => hx + Math.cos(yaw) * u + Math.sin(yaw) * w, Z = (u: number, w: number) => hz - Math.sin(yaw) * u + Math.cos(yaw) * w;
      const node = new TransformNode("heli", sc); node.position.set(hx, ry + 0.1, hz); node.rotation.y = yaw;
      const mk = (m: Mesh, col: string, x: number, y: number, z: number, outline = 0.025) => { m.parent = node; m.position.set(x, y, z); this.add(m, col, outline, false); return m; };
      const body = MB.CreateSphere("heliBody", { diameter: 1, segments: 12 }, sc); body.scaling.set(2.1, 1.7, 3.6); mk(body, "#1f3a78", 0, 1.55, 0.2, 0.035);
      const belly = MB.CreateSphere("heliBelly", { diameter: 1, segments: 10 }, sc); belly.scaling.set(2.0, 0.9, 3.2); mk(belly, "#f4f1ea", 0, 1.1, 0.25, 0.02);
      const glass = MB.CreateSphere("heliGlass", { diameter: 1, segments: 10 }, sc); glass.scaling.set(1.7, 1.2, 1.6); mk(glass, "#9fe3ff", 0, 1.8, 1.45, 0.02);
      const boom = MB.CreateCylinder("heliBoom", { diameterTop: 0.25, diameterBottom: 0.6, height: 4.2, tessellation: 10 }, sc); boom.rotation.x = Math.PI / 2; mk(boom, "#1f3a78", 0, 1.8, -3.3, 0.02);
      const fin = MB.CreateBox("heliFin", { width: 0.12, height: 1.4, depth: 0.9 }, sc); mk(fin, "#1f3a78", 0, 2.3, -5.2, 0.015);
      const tr = MB.CreateBox("heliTail", { width: 0.06, height: 1.1, depth: 0.14 }, sc); mk(tr, "#2b2433", 0.12, 2.3, -5.3, 0.01);
      for (const sx of [-1, 1]) {
        const sk = MB.CreateCylinder("heliSkid", { diameter: 0.12, height: 3.8, tessellation: 8 }, sc); sk.rotation.x = Math.PI / 2; mk(sk, "#2b2433", sx * 0.95, 0.15, 0.3, 0.01);
        for (const sz of [-0.8, 1.2]) { const leg = MB.CreateBox("heliLeg", { width: 0.08, height: 0.8, depth: 0.08 }, sc); leg.rotation.z = sx * 0.3; mk(leg, "#2b2433", sx * 0.82, 0.55, sz, 0.008); }
      }
      const mast = MB.CreateCylinder("heliMast", { diameter: 0.22, height: 0.6, tessellation: 8 }, sc); mk(mast, "#2b2433", 0, 3.25, 0.1, 0.01);
      const pm = unlitTextured(sc, textTexture(sc, "POLICE", { w: 512, h: 128, fg: "#f4f1ea" }), "heliText");
      for (const sx of [-1, 1]) { const p = MB.CreatePlane("heliText", { width: 1.6, height: 0.4 }, sc); p.parent = node; p.position.set(sx * 1.07, 1.45, -0.3); p.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; p.material = pm; p.isPickable = false; }
      const strobe = MB.CreateSphere("heliStrobe", { diameter: 0.18, segments: 4 }, sc); strobe.parent = node; strobe.position.set(0, 2.3, -0.4); strobe.material = this.stationLights?.red ?? this.glowMat("#ff2a3a"); strobe.isPickable = false;
      // the main rotor and the tail rotor turn: own meshes (not merged), spun every frame
      const rotor = new Mesh("heliRotor", sc); rotor.parent = this.root; rotor.position.set(hx + Math.sin(yaw) * 0.1, ry + 0.1 + 3.6, hz + Math.cos(yaw) * 0.1);
      const bm = toon(sc, "#2b2433");
      for (const a of [0, Math.PI / 2]) { const bl = MB.CreateBox("blade", { width: 9.5, height: 0.06, depth: 0.32 }, sc); bl.rotation.y = a; bl.parent = rotor; bl.material = bm; bl.isPickable = false; }
      const hub = MB.CreateCylinder("hub", { diameter: 0.45, height: 0.2, tessellation: 8 }, sc); hub.parent = rotor; hub.material = bm; hub.isPickable = false;
      const tailRotor = new Mesh("heliTailRotor", sc); tailRotor.parent = this.root; tailRotor.position.set(X(0.2, -5.3), ry + 0.1 + 2.3, Z(0.2, -5.3)); tailRotor.rotation.y = yaw;
      for (const a of [0, Math.PI / 2]) { const bl = MB.CreateBox("tblade", { width: 0.04, height: 1.3, depth: 0.12 }, sc); bl.rotation.x = a; bl.parent = tailRotor; bl.material = bm; bl.isPickable = false; }
      this.heliRotor = [rotor, tailRotor];
      void X; void Z;
      // the searchlight under the nose (on at night, sweeping)
      const beam = MB.CreateCylinder("heliBeam", { diameterTop: 0.3, diameterBottom: 6, height: 14, tessellation: 16 }, sc);
      beam.setPivotPoint(new Vector3(0, 7, 0)); beam.position.set(hx + Math.sin(yaw) * 2.0, ry + 0.9 - 7, hz + Math.cos(yaw) * 2.0);
      const bmat = new StandardMaterial("heliBeamMat", sc); bmat.disableLighting = true; bmat.emissiveColor = Color3.FromHexString("#fff6c8"); bmat.alpha = 0.14; bmat.backFaceCulling = false; beam.material = bmat; beam.parent = this.root; beam.isPickable = false; beam.setEnabled(false);
      this.heliBeam = beam;
      bx(1.4, 0.9, 1.1, q.maxX - 1.5, y1 + 0.95, q.minZ + 1.5, "#c8c4cc", 0.02);
      bx(1.4, 0.9, 1.1, q.maxX - 3.2, y1 + 0.95, q.minZ + 1.5, "#c8c4cc", 0.02);
      const ant = MB.CreateCylinder("pdAnt", { diameterTop: 0.04, diameterBottom: 0.14, height: 5, tessellation: 5 }, sc); ant.position.set(q.maxX - 1, y1 + 3.0, q.maxZ - 1); this.add(ant, "#c8c4cc", 0.01, false);
      const red = this.glowMat("#ff2a3a").clone("pdRed"), blue = this.glowMat("#2a6aff").clone("pdBlue");
      this.stationLights = { red, blue };
      strobe.material = red;
      for (const [sx, m2] of [[-0.6, red], [0.6, blue]] as [number, StandardMaterial][]) { const l = MB.CreateSphere("pdLight", { diameter: 0.5, segments: 6 }, sc); l.position.set(sx, y1 + 3.6, q.maxZ + 0.3); l.material = m2; l.parent = this.root; l.isPickable = false; }
    }
    // ---- out front: blue lamps on posts, planters of grasses, boulders, a flagpole
    {
      for (const sx of [-1, 1]) {
        bx(0.14, 3.2, 0.14, sx * 5.4, 1.6, fz + 3.0, "#2b2433", 0.01);
        const lamp = MB.CreateBox("pdLamp", { width: 0.42, height: 0.5, depth: 0.42 }, sc); lamp.position.set(sx * 5.4, 3.45, fz + 3.0); lamp.material = this.glowMat("#5aa8ff"); lamp.parent = this.root; lamp.isPickable = false;
        for (let k = 0; k < 3; k++) { const gx = sx * (6.6 + k * 1.1), gz = fz + 0.8; cyl(0.9, 0.12, gx, 0.06, gz, "#b9a68a", 0.01); for (let i = 0; i < 5; i++) { const blade = MB.CreateCylinder("grass", { diameterTop: 0, diameterBottom: 0.08, height: 0.55, tessellation: 4 }, sc); blade.position.set(gx + (hash(i, k) - 0.5) * 0.5, 0.35, gz + (hash(k, i) - 0.5) * 0.5); blade.rotation.z = (hash(i + 3, k) - 0.5) * 0.5; this.add(blade, "#8aa05a", 0, false); } }
      }
      cyl(0.1, 7, xL + 1.0, 3.5, fz + 1.3, "#c8c4cc", 0.01);
      bx(0.05, 0.9, 1.4, xL + 1.0, 6.4, fz + 2.0, "#1f3a78", 0.01);
    }
    // ---- the back, on Gahookz Ghetto Lane: a staff door, a sign, a camera, a bike rack of confiscated bikes
    {
      bx(1.6, 2.5, 0.12, 4.0, 1.25, bz - 0.26, "#3a4558", 0.015);
      bx(0.12, 0.12, 0.12, 4.55, 1.2, bz - 0.34, "#c9a227", 0);
      win(this.planes.winBlinds, 6.5, 1.4, -4.6, 2.4, bz - 0.06, 0, -1);
      plane(5.6, 0.7, -3.5, 3.6, bz - 0.3, 0, -1, unlitTextured(sc, textTexture(sc, "TRASHINGTON PD  -  STAFF ONLY", { w: 1024, h: 128, bg: "#1f3a78", fg: "#f4f1ea" }), "pdBackSign"));
      plane(3.0, 0.5, 4.0, 2.9, bz - 0.3, 0, -1, unlitTextured(sc, textTexture(sc, "NO LOITERING (WE MEAN YOU)", { w: 512, h: 86, bg: "#f4f1ea", fg: "#c41e3a" }), "pdBackSign2"));
      bx(0.3, 0.2, 0.42, -8.6, 3.9, bz - 0.25, "#c8c4cc", 0.015).rotation.x = -0.35;
    }
    // ---- inside (drawn near only). R7: the grand station's two floors
    const g = st.grand, h = st.holding;
    if (g && h) {
      const V = (v: number) => (R0.maxZ - 0.2) - v, x0 = R0.minX + 0.2, x1 = R0.maxX - 0.2, UY = g.upY;
      const inG = (m: Mesh) => { if (this.group >= 0) { (this.unitPlanes.get(this.group) ?? this.unitPlanes.set(this.group, []).get(this.group)!).push(m); m.setEnabled(false); } return m; };
      const sign = (text: string, w: number, hh: number, x: number, y: number, z: number, nx: number, nz: number, o: { bg?: string; fg?: string } = {}) => inG(plane(w, hh, x + nx * 0.1, y, z + nz * 0.1, nx, nz, unlitTextured(sc, textTexture(sc, text, { w: 512, h: Math.max(64, Math.round(512 * hh / w)), ...o }), "pdSign-" + text))); // (0.1 m off the wall: clear of its ink outline)
      const glowBox = (w: number, hh: number, d: number, x: number, y: number, z: number, col: string) => { const m = MB.CreateBox("pdGlow", { width: w, height: hh, depth: d }, sc); m.position.set(x, y, z); m.material = this.glowMat(col); m.parent = this.root; m.isPickable = false; return inG(m); };
      const sph = (dia: number, x: number, y: number, z: number, col: string, outline = 0.01) => { const m = MB.CreateSphere("pds", { diameter: dia, segments: 6 }, sc); m.position.set(x, y, z); this.add(m, col, outline, false); return m; };
      const tile = (list: Mesh[], w: number, hh: number, x: number, y: number, z: number, nx: number, nz: number, t = 1.2) => { const p = MB.CreatePlane("pdt", { width: w, height: hh }, sc); p.position.set(x + nx * 0.1, y, z + nz * 0.1); p.rotation.y = Math.atan2(-nx, -nz); scaleUVs(p, w / t, hh / t); list.push(p); return p; };
      // R10: big grey floor tiles, and a two-tone band with a rail round the walls (the station was too bland)
      const floorTiles = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, y: number, t: number) => {
        const p = MB.CreatePlane("pdFloor", { width: r.maxX - r.minX, height: r.maxZ - r.minZ }, sc);
        p.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2); p.rotation.x = Math.PI / 2;
        scaleUVs(p, (r.maxX - r.minX) / t, (r.maxZ - r.minZ) / t); this.planes.floorTile.push(p);
      };
      const wallBands = (floorY: number) => {
        for (const b of this.arena.boxes) {
          const base = b.y - b.h / 2;
          if (b.kind !== "wall" || !(Math.abs(base - floorY) < 0.1 ? b.h >= 2.4 : floorY > 0 && base < 0.1 && b.y + b.h / 2 > floorY + 2.4) || !(b.x > R0.minX && b.x < R0.maxX && b.z > R0.minZ && b.z < R0.maxZ)) continue;
          bx(b.w + 0.12, 1.0, b.d + 0.12, b.x, floorY + 0.5, b.z, "#8a97ab", 0); // (clear of the wall's outline)
          bx(b.w + 0.17, 0.07, b.d + 0.17, b.x, floorY + 1.02, b.z, "#4a5568", 0);
        }
      };
      // ======== GROUND FLOOR ========
      this.group = 9001;
      floorTiles({ minX: x0, maxX: x1, minZ: R0.minZ + 0.4, maxZ: R0.maxZ - 0.4 }, 0.22, 2.4); // (clear of the floor's outline)
      wallBands(0);
      const Hl = g.hall;
      // the lobby: polished floor bands, the front desk's monitor and bell and sign, the crest over the hallway door,
      // wanted posters, a flag, ceiling lights
      const deskZ = V(4.0);
      bx(0.5, 0.36, 0.05, -1.2, 1.38, deskZ - 0.3, "#1b1420", 0.01); bx(0.1, 0.2, 0.1, -1.2, 1.18, deskZ - 0.3, "#3a3444", 0);
      bx(0.5, 0.36, 0.05, 1.4, 1.38, deskZ - 0.3, "#1b1420", 0.01); bx(0.1, 0.2, 0.1, 1.4, 1.18, deskZ - 0.3, "#3a3444", 0);
      { const bell = MB.CreateSphere("pdBell", { diameter: 0.14, segments: 6, slice: 0.5 }, sc); bell.position.set(0.3, 1.12, deskZ + 0.15); this.add(bell, "#d9a632", 0.01, false); }
      bx(0.4, 0.1, 0.3, -0.5, 1.15, deskZ, "#f4f1ea", 0.005); // (a stack of forms)
      sign("TRASHINGTON PD  -  FRONT DESK", 3.2, 0.36, 0, 0.75, deskZ + 0.47, 0, 1, { bg: "#1f3a78", fg: "#f4f1ea" });
      sign("TO PROTECT AND TO SERVE (EVENTUALLY)", 4.6, 0.5, 0, 3.6, V(7.6) + 0.02, 0, 1, { bg: "#1f3a78", fg: "#ffd54a" });
      cyl(1.2, 0.08, 0, 3.0, V(7.6) + 0.06, "#d9a632", 0.015, 6).rotation.x = Math.PI / 2;
      for (const [i, txt] of ["WANTED: YOU", "HAVE YOU SEEN THIS RACCOON?", "WANTED: BOX FORT BANDITZ", "MISSING: ONE (1) DONUT"].entries()) sign(txt, 1.0, 1.3, 3.2 + i * 1.3, 2.4, V(7.6) + 0.02, 0, 1, { bg: "#f3e2b8", fg: "#1b1420" });
      sign("PLEASE TAKE A NUMBER (THERE ARE NO NUMBERS)", 2.6, 0.4, -4.6, 2.6, V(7.6) + 0.02, 0, 1, { bg: "#f4f1ea", fg: "#1f3a78" });
      for (const [x, v] of [[-4, 2.5], [4, 2.5], [-4, 6], [4, 6], [0, 6.5]] as [number, number][]) glowBox(1.2, 0.06, 0.3, x, 4.44, V(v), "#f4f6ff");
      // the stairs: a handrail, a sign
      { const st0 = g.stairs; const hx = st0.maxX - 0.08; /* (R9: on the treads, not hanging off the side) */ for (const k of [0.04, 0.27, 0.5, 0.73, 0.96]) bx(0.05, 1.0, 0.05, hx, 0.5 + 0.18 + (UY - 0.18) * k, st0.maxZ - (st0.maxZ - st0.minZ) * k, "#c8c4cc", 0.004);
        const hr = bx(0.06, 0.06, Math.hypot(st0.maxZ - st0.minZ, UY - 0.18) + 0.2, hx, 1.06 + UY / 2, (st0.minZ + st0.maxZ) / 2, "#c8c4cc", 0.006); hr.rotation.x = Math.atan2(UY - 0.18, st0.maxZ - st0.minZ); /* (R9: the +z end is the bottom) */ }
      sign("UPSTAIRS: STAFF ONLY. EVIDENCE: DEFINITELY STAFF ONLY.", 1.8, 0.5, x0 + 0.6, 2.6, V(0.45), 0, -1, { bg: "#c41e3a", fg: "#f4f1ea" });
      // the hallway: lights, signs over the doors, a notice board, a water fountain, a mop and bucket
      for (let v = 9.0; v < 22; v += 2.6) glowBox(0.9, 0.06, 0.3, 0, 4.44, V(v), "#f4f6ff");
      sign("INTERROGATION 1", 1.4, 0.3, Hl.minX + 0.02, 2.9, V(10.75), 1, 0, { bg: "#3a4558", fg: "#f4f1ea" });
      sign("INTERROGATION 2", 1.4, 0.3, Hl.minX + 0.02, 2.9, V(15.25), 1, 0, { bg: "#3a4558", fg: "#f4f1ea" });
      sign("BREAK ROOM", 1.2, 0.3, Hl.minX + 0.02, 2.9, V(19.85), 1, 0, { bg: "#3a4558", fg: "#f4f1ea" });
      sign("BOOKING", 1.2, 0.3, Hl.maxX - 0.02, 2.9, V(9.75), -1, 0, { bg: "#3a4558", fg: "#f4f1ea" });
      sign("HOLDING  >>  (DON'T FEED THE CHAMP)", 2.2, 0.36, 0, 3.4, V(22.5) + 0.05, 0, 1, { bg: "#ff7a1a", fg: "#1b1420" });
      bx(1.4, 0.9, 0.05, Hl.minX + 0.05, 1.7, V(12.2), "#8a6a4a", 0.01).rotation.y = Math.PI / 2;
      for (let i = 0; i < 5; i++) bx(0.02, 0.22, 0.18, Hl.minX + 0.09, 1.55 + (i % 2) * 0.3, V(12.2) - 0.5 + i * 0.25, ["#f4f1ea", "#ffd54a", "#ff8fa3"][i % 3], 0);
      bx(0.3, 0.9, 0.3, Hl.maxX - 0.25, 0.45, V(21.6), "#c8c4cc", 0.01); cyl(0.4, 0.3, Hl.minX + 0.35, 0.15, V(21.8), "#ffd54a", 0.01); bx(0.04, 1.3, 0.04, Hl.minX + 0.45, 0.8, V(21.8), "#8b5a2b", 0);
      // (the one-way mirrors: dark frames)
      for (const [m0, m1] of [[8.5, 9.6], [13.4, 14.4]]) bx(0.08, 1.2, m1 - m0 + 0.12, Hl.minX - 0.12, 1.6, V((m0 + m1) / 2), "#2b2433", 0.005);
      // the interrogation rooms: a hanging lamp over the table, a camera in the corner, a sign
      for (const r of g.interrogation) {
        const mz = (r.minZ + r.maxZ) / 2;
        cyl(0.02, 1.4, -5.4, 3.8, mz, "#1b1420", 0); { const shade = MB.CreateCylinder("lampShade", { diameterTop: 0.15, diameterBottom: 0.6, height: 0.3, tessellation: 10 }, sc); shade.position.set(-5.4, 3.0, mz); this.add(shade, "#3a4a3a", 0.01, false); }
        glowBox(0.3, 0.05, 0.3, -5.4, 2.85, mz, "#fff2c8");
        bx(0.25, 0.18, 0.3, r.minX + 0.3, 3.8, r.maxZ - 0.3, "#c8c4cc", 0.01).rotation.y = 0.7;
        sign("SMILE. YOU'RE ON CAMERA.", 1.8, 0.35, -5.4, 2.4, r.maxZ - 0.02, 0, -1, { bg: "#f4f1ea", fg: "#1b1420" });
        bx(0.3, 0.04, 0.22, -5.25, 0.81, mz, "#f4f1ea", 0); cyl(0.08, 0.1, -5.7, 0.84, mz + 0.1, "#f4f1ea", 0.005);
      }
      // booking: a height chart for mugshots, a camera on a tripod, the fingerprint pad, a counter of forms
      const bk = g.booking;
      tile(this.planes.paint, 2.4, 2.4, (bk.minX + bk.maxX) / 2 + 1.4, 1.3, bk.minZ, 0, 1, 2.4);
      for (let k = 0; k < 7; k++) bx(2.0, 0.025, 0.02, (bk.minX + bk.maxX) / 2 + 1.4, 0.6 + k * 0.3, bk.minZ + 0.12, "#1b1420", 0);
      sign("SAY CHEESE (OR DON'T)", 1.6, 0.3, (bk.minX + bk.maxX) / 2 + 1.4, 2.75, bk.minZ + 0.13, 0, 1, { bg: "#1f3a78", fg: "#f4f1ea" });
      for (const s2 of [-1, 0, 1]) { const leg = bx(0.04, 1.3, 0.04, 3.8 + s2 * 0.18, 0.65, V(9.4) + (s2 === 0 ? 0.2 : -0.1), "#1b1420", 0); leg.rotation.z = s2 * 0.2; }
      bx(0.35, 0.25, 0.3, 3.8, 1.4, V(9.4), "#2b2433", 0.01);
      bx(0.25, 0.03, 0.18, 5.0, 0.92, V(10.6), "#1b1420", 0);
      for (const [x, v] of [[5, 9], [5, 11.8]] as [number, number][]) glowBox(1.0, 0.06, 0.3, x, 4.44, V(v), "#f4f6ff");
      // the breakroom: the coffee machine, a box of donuts, mugs, stools, a TV of static, a sign
      const br = h.breakroom, cy = 0.95, ctrZ = br.minZ + 0.45;
      bx(0.4, 0.45, 0.35, -6.8, cy + 0.23, ctrZ, "#2b2433", 0.012); bx(0.18, 0.12, 0.05, -6.8, cy + 0.32, ctrZ + 0.18, "#ff3a3a", 0);
      bx(0.6, 0.12, 0.45, -5.2, cy + 0.06, ctrZ + 0.05, "#ff8fa3", 0.01);
      for (let i = 0; i < 4; i++) { const dn = MB.CreateTorus("donut", { diameter: 0.14, thickness: 0.06, tessellation: 10 }, sc); dn.position.set(-5.4 + (i % 2) * 0.22, cy + 0.15, ctrZ - 0.05 + Math.floor(i / 2) * 0.17); this.add(dn, ["#f2c94c", "#ff8fa3", "#7a4a2a", "#f4f1ea"][i], 0.005, false); }
      const tz = (br.minZ + br.maxZ) / 2;
      for (let i = 0; i < 3; i++) cyl(0.1, 0.12, -6.2 + i * 0.4, 0.82, tz - 0.2 + i * 0.15, ["#f4f1ea", "#3d6fb5", "#d6264a"][i], 0.005);
      for (const [dx2, dz2] of [[-1.5, 0], [1.5, 0], [0, -1.0], [0, 1.0]]) bx(0.45, 0.45, 0.45, -5.6 + dx2, 0.23, tz + dz2, "#3a4a72", 0.012);
      bx(0.08, 0.7, 1.2, br.minX + 0.08, 2.6, tz, "#1b1420", 0.01);
      { const tv = MB.CreatePlane("pdTV", { width: 1.05, height: 0.58 }, sc); tv.position.set(br.minX + 0.14, 2.6, tz); tv.rotation.y = -Math.PI / 2; tv.material = this.tvStaticMat(); tv.parent = this.root; tv.isPickable = false; inG(tv); }
      sign("BREAK ROOM: NO BANDITS. NO EXCEPTIONS.", 2.4, 0.5, -5.6, 2.8, br.maxZ - 0.02, 0, -1, { bg: "#f4f1ea", fg: "#1f3a78" });
      glowBox(1.0, 0.06, 0.3, -5.6, 4.44, tz, "#fff2c8");
      // the cell's walls: cinder block (concrete) where there are no tiles
      {
        const c2 = h.cell, s2 = h.shower;
        tile(this.planes.concrete, c2.maxX - c2.minX + 0.6, 4.4, (c2.minX + c2.maxX) / 2, 2.2, V(13.1), 0, -1, 1.5);
        tile(this.planes.concrete, V(13.1) - s2.maxZ, 4.4, x1 - 0.2, 2.2, (V(13.1) + s2.maxZ) / 2, -1, 0, 1.5);
      }
      // the holding cell: white subway tiles round the shower corner, shower heads, a drain, tally marks, a slit window
      const cell = h.cell, shw = h.shower, hv = cell.minZ - 0.3; // (the back wall's inside face)
      for (const nz of [-1, 1]) tile(this.planes.subway, 1.8, 2.1, x1 - 2.6, 1.05, V(19.2) + nz * 0.06, 0, nz); // (the tiled half-wall, both faces)
      tile(this.planes.subway, shw.maxZ - shw.minZ, 2.6, x1 - 0.2, 1.3, (shw.minZ + shw.maxZ) / 2, -1, 0);       // (the east wall in the shower corner)
      tile(this.planes.subway, shw.maxX - shw.minX, 2.6, (shw.minX + shw.maxX) / 2, 1.3, hv + 0.02, 0, 1);       // (the back wall in the shower corner)
      { const fl = MB.CreateGround("showerFloor", { width: shw.maxX - shw.minX, height: shw.maxZ - shw.minZ }, sc); fl.position.set((shw.minX + shw.maxX) / 2, 0.05, (shw.minZ + shw.maxZ) / 2); scaleUVs(fl, (shw.maxX - shw.minX) / 0.6, (shw.maxZ - shw.minZ) / 0.6); fl.isPickable = false; this.planes.subway.push(fl); }
      for (const k of [0.3, 0.7]) { const z = shw.minZ + (shw.maxZ - shw.minZ) * k; bx(0.4, 0.06, 0.06, x1 - 0.25, 2.3, z, "#c8ccd4", 0.008); cyl(0.2, 0.08, x1 - 0.42, 2.25, z, "#c8ccd4", 0.008); }
      cyl(0.3, 0.02, (shw.minX + shw.maxX) / 2, 0.065, (shw.minZ + shw.maxZ) / 2, "#5a5560", 0);
      tile(this.planes.paint, cell.maxX - shw.minX + 1.0, 2.0, (cell.minX + shw.minX) / 2, 1.0, hv + 0.02, 0, 1, 2);
      sign("IIII IIII IIII II", 1.4, 0.4, cell.minX + 1.0, 1.7, hv + 0.05, 0, 1, { fg: "#3a3444" });
      sign("THE CHAMP: UNDEFEATED 1998-2009 (AND COUNTING)", 2.6, 0.4, 3.6, 2.3, hv + 0.05, 0, 1, { bg: "#ff7a1a", fg: "#1b1420" });
      bx(1.6, 0.3, 0.1, 5.0, 3.6, hv + 0.02, "#9fd8ff", 0); for (let i = 0; i < 5; i++) bx(0.04, 0.32, 0.04, 4.3 + i * 0.35, 3.6, hv + 0.08, "#3a3444", 0);
      glowBox(1.0, 0.06, 0.3, 4.5, 4.44, V(17), "#e8f0ff");
      // ======== FIRST FLOOR ========
      this.group = 9002;
      const up = g.upstairs;
      // carpet tiles, ceiling lights
      { const sw = g.stairs; // (R8: the carpet goes round the stairwell, not over it)
        bx(up.maxX - sw.maxX - 0.05, 0.02, up.maxZ - up.minZ - 0.1, (sw.maxX + up.maxX) / 2, UY + 0.012, (up.minZ + up.maxZ) / 2, "#5a6478", 0);
        bx(sw.maxX - up.minX - 0.05, 0.02, sw.minZ - up.minZ - 0.1, (up.minX + sw.maxX) / 2, UY + 0.012, (up.minZ + sw.minZ) / 2, "#5a6478", 0);
        // (R10: carpet tiles you can see, and the wall band up here too)
        floorTiles({ minX: sw.maxX + 0.03, maxX: up.maxX - 0.03, minZ: up.minZ + 0.05, maxZ: up.maxZ - 0.05 }, UY + 0.07, 1.0);
        floorTiles({ minX: up.minX + 0.03, maxX: sw.maxX - 0.03, minZ: up.minZ + 0.05, maxZ: sw.minZ - 0.05 }, UY + 0.07, 1.0);
        wallBands(UY);
 }
      for (let v = 2; v < 22; v += 3.2) for (const x of [-6.5, 0, 6.5]) glowBox(1.2, 0.06, 0.3, x, 8.95, V(v), "#f4f6ff");
      // the chief's corner office: a big desk (nameplate, a lamp, a golf putter), a trophy fish, a flag, blinds
      const ch = g.chief, cmx = (ch.minX + ch.maxX) / 2;
      sign("CHIEF O'NOTHING", 0.8, 0.2, 7.4, UY + 0.92, V(3.0) - 0.47, 0, -1, { bg: "#d9a632", fg: "#1b1420" });
      cyl(0.04, 0.5, 8.3, UY + 1.05, V(3.0), "#1b1420", 0); glowBox(0.25, 0.15, 0.25, 8.3, UY + 1.35, V(3.0), "#fff2c8");
      { const fish = sph(0.5, cmx, UY + 2.4, ch.minZ + 0.36, "#5a9e8a", 0.012); fish.scaling.set(1.8, 0.7, 0.2); }
      bx(1.0, 0.6, 0.05, cmx, UY + 2.4, ch.minZ + 0.27, "#5a3a24", 0.01);
      sign("WORLD'S OKAYEST CHIEF", 1.4, 0.3, cmx, UY + 3.1, ch.minZ + 0.14, 0, 1, { bg: "#f4f1ea", fg: "#1f3a78" });
      // wood panelling, a rug, a bookcase, a bowling trophy
      // (R10: on the walls' faces; the west wall's panelling stops at the doorway and carries on over it)
      tile(this.planes.clapboard, ch.maxX - ch.minX - 0.3, 3.9, cmx, UY + 2.05, ch.minZ + 0.11, 0, 1, 1.4);
      for (const [va, vb, y0, y1] of [[0.45, 4.5, 0.1, 4.0], [4.5, 6.0, 2.6, 4.0], [6.0, 6.25, 0.1, 4.0]] as [number, number, number, number][])
        tile(this.planes.clapboard, vb - va, y1 - y0, ch.minX - 0.04, UY + (y0 + y1) / 2, V((va + vb) / 2), 1, 0, 1.4);
      bx(3.0, 0.015, 2.6, 7.4, UY + 0.085, V(3.4), "#7a1a2a", 0); bx(2.6, 0.016, 2.2, 7.4, UY + 0.09, V(3.4), "#c9a227", 0); // (R10: on top of the carpet tiles)
      bx(0.4, 2.0, 1.4, x1 - 0.25, UY + 1.0, V(2.0), "#5a3a24", 0.015);
      for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) bx(0.25, 0.32, 0.12, x1 - 0.32, UY + 0.4 + k * 0.45, V(2.0) - 0.55 + j * 0.2, ["#8e1f2e", "#1f3a78", "#3a7a3a", "#c9a227"][(k + j) % 4], 0);
      cyl(0.12, 0.3, 6.4, UY + 0.95, V(3.0), "#e8b83a", 0.006); sph(0.16, 6.4, UY + 1.18, V(3.0), "#1b1420", 0.006);
      sign("CHIEF O'NOTHING - KNOCK. THEN GO AWAY.", 1.4, 0.35, ch.minX - 0.26, UY + 2.75, V(5.25), -1, 0, { bg: "#1f3a78", fg: "#f4f1ea" });
      bx(0.03, 0.03, 1.2, 7.8, UY + 0.4, V(4.6), "#c8c4cc", 0).rotation.x = 0.3; // (the putter)
      // the offices down the east side: names on the doors, piles of paper, a plant each
      g.offices.forEach((r, i) => {
        const mz = (r.minZ + r.maxZ) / 2;
        sign(["DETECTIVES (ASLEEP)", "RECORDS (MISPLACED)", "INTERNAL AFFAIRS: DO NOT KNOCK"][i] ?? "OFFICE", 1.5, 0.32, r.minX - 0.26, UY + 2.8, r.maxZ - 1.95, -1, 0, { bg: "#3a4558", fg: "#f4f1ea" });
        for (let k = 0; k < 4; k++) bx(0.3, 0.05 + k * 0.03, 0.22, 7.0 + k * 0.25, UY + 0.81 + k * 0.02, mz - 0.2, "#f4f1ea", 0.004);
        bx(0.4, 0.4, 0.4, r.maxX - 0.4, UY + 0.2, r.minZ + 0.4, "#8b5a2b", 0.01); sph(0.55, r.maxX - 0.4, UY + 0.7, r.minZ + 0.4, "#3a7a3a", 0.012);
      });
      // the cubicles: a monitor, papers, a mug and a family photo on every desk
      for (const b of this.arena.boxes) {
        if (b.deco !== "cubicle" || b.y < UY) continue;
        const top = b.y + b.h / 2;
        bx(0.32, 0.04, 0.24, b.x - 0.3, top + 0.02, b.z, "#f4f1ea", 0);
        cyl(0.08, 0.1, b.x + 0.42, top + 0.05, b.z - 0.15, ["#d6264a", "#3d6fb5", "#ffd54a"][Math.floor(hash(b.x, b.z) * 3)], 0.004);
        bx(0.12, 0.15, 0.02, b.x + 0.2, top + 0.08, b.z + 0.2, "#c9a227", 0);
      }
      sign("BANDITZ TASK FORCE (THAT'S 2 GUYS)", 2.4, 0.36, 0, UY + 1.05, V(7.95) - 0.04, 0, 1, /* (R10: on the partition, not floating over it) */ { bg: "#c41e3a", fg: "#f4f1ea" });
      // the squad room: a whiteboard of suspects, lockers' vents
      bx(2.6, 1.3, 0.05, -6.6, UY + 1.9, V(7.9) - 0.02, "#f4f1ea", 0.01);
      for (const sx of [-1.25, 1.25]) { bx(0.06, 2.55, 0.06, -6.6 + sx, UY + 1.275, V(7.9) - 0.02, "#8e96a8", 0.006); bx(0.08, 0.05, 0.7, -6.6 + sx, UY + 0.025, V(7.9) - 0.02, "#8e96a8", 0.006); } // (R10: the whiteboard stands on legs)
      sign("SUSPECTS: 1) A BOX  2) ANOTHER BOX  3) ??? ", 2.4, 1.1, -6.6, UY + 1.9, V(7.9) + 0.035, 0, -1, { fg: "#1f3a78" });
      // the evidence room: the cage, boxes and bags on the racks, a sign, a sign-out clipboard nobody uses
      const ev = g.evidence;
      sign("EVIDENCE  -  DO NOT TOUCH. WE MEAN IT. (WE COUNT.)", 3.2, 0.45, (ev.minX + ev.maxX) / 2, UY + 2.9, ev.maxZ + 0.0, 0, 1, { bg: "#ffd54a", fg: "#1b1420" });
      sign("LOST & FOUND (MOSTLY FOUND)", 1.8, 0.35, (ev.minX + ev.maxX) / 2, UY + 2.3, ev.minZ - 0.04, 0, 1, { bg: "#f4f1ea", fg: "#1f3a78" });
      for (const b of this.arena.boxes) {
        if (b.deco !== "evidence" || b.y < UY) continue;
        const top = b.y + b.h / 2;
        for (let k = 0; k < 4; k++) {
          const ox = -b.w / 2 + 0.3 + k * (b.w - 0.6) / 3;
          if (hash(b.x + k, b.z) < 0.45) continue; // (gaps: room for your loot)
          const kind = hash(b.z + k, b.x);
          if (kind < 0.5) { bx(0.36, 0.28, 0.36, b.x + ox, top + 0.14, b.z, "#c9a07a", 0.01); bx(0.2, 0.08, 0.01, b.x + ox, top + 0.14, b.z - 0.19, "#f4f1ea", 0); }
          else { sph(0.36, b.x + ox, top + 0.16, b.z, "#e8e4dc", 0.01).scaling.set(1, 0.8, 0.7); bx(0.18, 0.12, 0.01, b.x + ox, top + 0.18, b.z - 0.13, "#ffd54a", 0); } // (an evidence bag, tagged)
        }
        for (let k = 0; k < 3; k++) { // (the shelf's own boxes, on its levels)
          for (const lv of b.h > 1.5 ? [0.45, 1.05] : [0.45]) bx(0.42, 0.3, Math.min(0.5, b.d - 0.1), b.x - b.w / 2 + 0.6 + k * (b.w - 1.2) / 2, b.y - b.h / 2 + lv, b.z - 0.02, ["#c9a07a", "#a8743f", "#e8e4dc"][k], 0.008);
        }
      }
      bx(0.3, 0.4, 0.03, ev.maxX + 0.25, UY + 1.4, ev.maxZ + 0.3, "#8b5a2b", 0.005);
      glowBox(1.0, 0.06, 0.3, (ev.minX + ev.maxX) / 2, 8.95, (ev.minZ + ev.maxZ) / 2, "#fff2c8");
      this.group = -1;
    }
  }

  /** R6: the helicopter's rotors, every frame */
  private updateHeli(dt: number) {
    if (!this.heliRotor.length) return;
    this.heliRotor[0].rotation.y += dt * 1.4;
    this.heliRotor[1].rotation.x += dt * 6;
    if (this.heliBeam?.isEnabled()) this.heliBeam.rotation.z = 0.5 + Math.sin(performance.now() / 1600) * 0.35;
  }

  /** R5: neon flicker and the station's roof lights (every frame) */
  private updateNeon() {
    const t = performance.now() / 1000;
    for (const n of this.neon) {
      const k = Math.sin(t * 13 + n.seed) + Math.sin(t * 31 + n.seed * 2.1);
      const off = k > 1.55 || (Math.floor(t * 0.7 + n.seed) % 9 === 0 && Math.sin(t * 50) > 0);
      for (let i = 0; i < n.mats.length; i++) n.mats[i].emissiveColor.copyFrom(off ? n.base[i].scale(0.25) : n.base[i]);
    }
    if (this.stationLights) {
      const on = Math.floor(t * 2.5) % 2 === 0;
      this.stationLights.red.emissiveColor.set(on ? 1 : 0.25, on ? 0.16 : 0.04, on ? 0.23 : 0.06);
      this.stationLights.blue.emissiveColor.set(on ? 0.04 : 0.16, on ? 0.1 : 0.42, on ? 0.25 : 1);
    }
  }

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
      } else if (d.kind === "viaduct") {
        // R3: a piece of the curved viaduct over the fort bowl (looks only: nothing up there to stand on)
        const y = d.h ?? 9.5, yaw = d.yaw ?? 0, L = d.d ?? 10, W = d.w ?? 14;
        const deck = MB.CreateBox("deck", { width: W, height: 1, depth: L }, sc);
        deck.position.set(d.x, y + 0.5, d.z); deck.rotation.y = yaw; this.add(deck, "#8e8a94", 0.04);
        for (const o of [-W / 2 + 0.2, W / 2 - 0.2]) {
          const wall = MB.CreateBox("deckwall", { width: 0.4, height: 1.1, depth: L }, sc);
          wall.position.set(d.x + Math.cos(yaw) * o, y + 1.55, d.z - Math.sin(yaw) * o); wall.rotation.y = yaw; this.add(wall, "#b9b3a6", 0.02);
        }
        const under = MB.CreateBox("deckunder", { width: W - 3, height: 0.6, depth: L }, sc);
        under.position.set(d.x, y - 0.3, d.z); under.rotation.y = yaw; this.add(under, "#6e6a78", 0.02, false);
      } else if (d.kind === "pillar") {
        // R3: a pair of viaduct pillars across the deck (their collision boxes are in the layout)
        const t = d.yaw ?? 0, y = d.h ?? 9.5;
        for (const o of [-4.5, 4.5]) {
          const p = MB.CreateBox("pillar", { width: 1.8, height: y, depth: 1.8 }, sc);
          p.position.set(d.x + Math.sin(t) * o, y / 2, d.z + Math.cos(t) * o); this.add(p, "#9aa3b5", 0.04);
        }
        const cap = MB.CreateBox("pillarcap", { width: 2.4, height: 0.6, depth: 11 }, sc);
        cap.position.set(d.x, y - 0.3, d.z); cap.rotation.y = t; this.add(cap, "#9aa3b5", 0.03);
      } else if (d.kind === "walk") {
        // R2: a smooth pavement strip along a diagonal road (the collision underneath is 0.5 m steps)
        const slab = MB.CreateBox("walk", { width: d.w ?? 2.5, height: 0.17, depth: d.d ?? 10 }, sc);
        slab.position.set(d.x, 0.085, d.z); slab.rotation.y = d.yaw ?? 0;
        this.add(slab, KIND_COLOR.sidewalk ?? "#b3aebb", 0.02, false);
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
    // (R3: the city runs further south; the south billboard stands behind the fort bowl instead of over it)
    const south = this.arena.southZ;
    if (south !== undefined) for (const ad of ads) if (ad.at[2] < -100) ad.at[2] = south - 4;
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

/** R3: the middle of a polygon (its vertex average: fine for the convex footprints we use). */
function centroid(P: [number, number][]): [number, number] {
  let x = 0, z = 0;
  for (const [px, pz] of P) { x += px; z += pz; }
  return [x / P.length, z / P.length];
}

/**
 * R3: an upright prism on a convex x/z polygon (counter-clockwise), from y0 to y1, its outline grown by
 * `grow` metres. Flat-shaded, with UVs, so it merges with the city's boxes.
 */
export function footPrism(scene: Scene, P: [number, number][], y0: number, y1: number, grow = 0): Mesh {
  let pts = P;
  if (grow) {
    // push each edge out by `grow` and re-intersect neighbours (a convex outline stays convex)
    const n = P.length, lines = P.map(([ax, az], i) => {
      const [bx, bz] = P[(i + 1) % n], l = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / l, nz = -(bx - ax) / l;
      return { px: ax + nx * grow, pz: az + nz * grow, dx: (bx - ax) / l, dz: (bz - az) / l };
    });
    pts = lines.map((L, i) => {
      const M = lines[(i + n - 1) % n], den = M.dx * L.dz - M.dz * L.dx;
      if (Math.abs(den) < 1e-6) return [L.px, L.pz] as [number, number];
      const t = ((L.px - M.px) * L.dz - (L.pz - M.pz) * L.dx) / den;
      return [M.px + M.dx * t, M.pz + M.dz * t] as [number, number];
    });
  }
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], u: number) => {
    const o = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(0, 0, u, 0, u, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3); // (wound so the outside faces out: Babylon culls the other side)
  };
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], Math.hypot(bx - ax, bz - az));
  }
  // caps (a fan from the first point)
  for (const [y, up] of [[y1, true], [y0, false]] as const) {
    const o = pos.length / 3;
    for (const [x, z] of pts) { pos.push(x, y, z); uv.push(x, z); }
    for (let i = 1; i < n - 1; i++) up ? idx.push(o, o + i, o + i + 1) : idx.push(o, o + i + 1, o + i);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, idx, normals);
  const vd = new VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uv;
  const m = new Mesh("prism", scene);
  vd.applyToMesh(m);
  return m;
}

