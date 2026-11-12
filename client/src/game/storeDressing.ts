// R13 (Blake: "six new shops... proper, distinctive stores... low rendering cost"): what the six stores look like.
//
// The shells (walls, frontage, floor, counter, shelves) are plain boxes from shared/src/stores.ts, drawn with the city.
// This dresses them: signs, window displays, fixtures, stock, lamps. Everything goes through a small kit (StoreKit) the
// city renderer hands over, written in the store's own frame (u along the frontage from the left as you face it, v in
// from the front wall's outer face, y up), so the same code dresses a store whichever way it faces.
//
// Cost rules (docs/perf-budget.md, R13):
// - plain-coloured pieces are merged with the city (one mesh per outline width per tile, or per store inside)
// - pictures (signs, sleeves, posters, screens, neon) come from ONE shared sheet (`STORE_SHEET`): one material for the
//   lit pictures, one for the glowing ones, so a whole street of store signs is one or two draws
// - each store is an interior area (areas.ts): its inside is drawn only near it; two lamps each, lighting only its inside
// - outside pieces are wrapped in `kit.outside(...)` so they're never filed into the store's (hidden) inside
import type { StoreDef, StoreId } from "@bfb/shared";
import { storeFrame, STORE_SHELLS, STORE_FIXTURES, STORE_FLOOR } from "@bfb/shared";
import type { AreaLight, InteriorArea } from "./areas.ts";

/** the interior area of a store: its plot, one floor, drawn from outside within 34 m (hidden past 40) */
export function storeArea(s: StoreDef): InteriorArea {
  const f = storeFrame(s), sp = STORE_SHELLS[s.id], W = f.W, D = f.D, H = sp.H;
  const L = (name: string, u: number, v: number, y: number, color: string, range: number, intensity: number): AreaLight => { const p = f.at(u, v); return { name: "store-" + s.id + "-" + name, x: p.x, y, z: p.z, color, range, intensity, floor: 0 }; };
  const lamp = Math.min(H - 0.8, 3.6);
  const lights: Record<StoreId, AreaLight[]> = {
    rustbucket: [L("bulb", W * 0.3, D * 0.55, lamp, "#ffd8a0", 10, 0.55), L("bay", W * 0.78, D * 0.5, lamp, "#ffe8c0", 10, 0.5)],
    plugpray: [L("tube", W * 0.5, D * 0.45, lamp, "#e8f4ff", 12, 0.6), L("bench", W * 0.5, D * 0.8, lamp, "#ffe0b0", 8, 0.45)],
    needledrop: [L("bins", W * 0.5, D * 0.42, lamp, "#ffcc88", 11, 0.6), L("counter", W * 0.5, D * 0.8, lamp, "#ff9ad0", 8, 0.4)],
    peakfomo: [L("lodge", W * 0.35, D * 0.5, lamp, "#ffd8a0", 11, 0.6), L("till", W * 0.8, D * 0.6, lamp, "#ffe8c0", 8, 0.45)],
    maisonpong: [L("chandelier", W * 0.5, D * 0.45, Math.min(H - 1.4, 5.2), "#fff0d8", 12, 0.65), L("altar", W * 0.5, D * 0.88, 3.2, "#ffe0a0", 7, 0.5)],
    bonbon: [L("front", W * 0.5, D * 0.35, lamp, "#ffe0e8", 11, 0.6), L("counter", W * 0.5, D * 0.75, lamp, "#ffd8b0", 8, 0.45)],
  };
  return { id: "store-" + s.id, rect: s.plot, floors: [{ y0: 0, y1: H }], outside: { on: 34, off: 40 }, lights: lights[s.id] };
}
/** the stores whose shelves and counter this file dresses in full (the city leaves off its generic goods and worktop) */
export const STORE_OWN_FIXTURES = new Set<StoreId>(["needledrop"]);
/** the visibility group of a store's inside */
export const storeGroup = (i: number) => 9410 + i;

// ---------------------------------------------------------------------------------------------------------------------
// THE SHARED SHEET: every picture the stores use, packed into one 2048 x 2048 canvas (shelf-packed, in this order)

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
interface Cell { w: number; h: number; draw: Draw }
const fitFont = (c: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string, weight = "bold") => {
  c.font = `${weight} ${size}px ${font}`;
  while (size > 8 && c.measureText(text).width > maxW) { size -= 2; c.font = `${weight} ${size}px ${font}`; }
  return size;
};
const centered = (c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, font: string, fill: string, stroke?: string, lw = 6) => {
  fitFont(c, text, maxW, size, font); c.textAlign = "center"; c.textBaseline = "middle";
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = "round"; c.strokeText(text, x, y); }
  c.fillStyle = fill; c.fillText(text, x, y);
};
const CHUNK = `"Bungee", "Arial Black", Impact, sans-serif`, SERIF = `Didot, "Bodoni MT", Georgia, "Times New Roman", serif`, ROUND = `"Luckiest Guy", "Comic Sans MS", "Arial Rounded MT Bold", sans-serif`;
/** a little seeded random (the same pictures every load) */
const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const SLEEVE_COLS = ["#e8463a", "#f4c430", "#2fa4a0", "#1f3a8a", "#ff8fa3", "#f4f1ea", "#1b1420", "#7a3fa0", "#43c7a6", "#ff7a1a", "#9fe3ff", "#3a7a3a"];
/** one record sleeve's art (bold blocks, circles, stripes: made up) */
function sleeve(c: CanvasRenderingContext2D, x: number, y: number, s: number, r: () => number) {
  const a = SLEEVE_COLS[Math.floor(r() * SLEEVE_COLS.length)], b = SLEEVE_COLS[Math.floor(r() * SLEEVE_COLS.length)], k = Math.floor(r() * 5);
  c.fillStyle = a; c.fillRect(x, y, s, s); c.fillStyle = b;
  if (k === 0) { c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.32, 0, 6.3); c.fill(); }
  else if (k === 1) for (let i = 0; i < 4; i++) c.fillRect(x, y + s * (0.12 + i * 0.22), s, s * 0.09);
  else if (k === 2) { c.beginPath(); c.moveTo(x, y + s); c.lineTo(x + s, y); c.lineTo(x + s, y + s); c.fill(); }
  else if (k === 3) { c.fillRect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.7); c.fillStyle = a; c.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4); }
  else { for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + s * (0.25 + i * 0.25), y + s * 0.55, s * 0.1, 0, 6.3); c.fill(); } }
  c.fillStyle = "rgba(255,255,255,0.85)"; c.fillRect(x + s * 0.08, y + s * 0.82, s * (0.3 + r() * 0.5), s * 0.06);
  c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, s - 2, s - 2);
}
function vinylIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number, label: string) {
  c.fillStyle = "#121014"; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill();
  c.strokeStyle = "rgba(255,255,255,0.14)"; c.lineWidth = 1.5; for (let k = 0.45; k < 0.97; k += 0.07) { c.beginPath(); c.arc(x, y, r * k, 0, 6.3); c.stroke(); }
  c.fillStyle = label; c.beginPath(); c.arc(x, y, r * 0.33, 0, 6.3); c.fill(); c.fillStyle = "#121014"; c.beginPath(); c.arc(x, y, r * 0.05, 0, 6.3); c.fill();
}
const CELLS: Record<string, Cell> = {
  // ---- the six fascias (lit: they take the day's light; at night they're lit by the street)
  signRust: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#8a4a22"; c.fillRect(0, 0, w, h); const r = seeded(11);
    for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${r() < 0.5 ? "60,25,10" : "200,110,50"},${r() * 0.35})`; c.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 6); }
    c.fillStyle = "#3a3430"; for (const x of [18, w - 18]) for (const y of [18, h - 18]) { c.beginPath(); c.arc(x, y, 7, 0, 6.3); c.fill(); }
    centered(c, "RUST BUCKET SALVAGE", w / 2, h * 0.43, w * 0.9, 92, CHUNK, "#f4e2b8", "#2a1408", 10);
    centered(c, "WE BUY JUNK  ·  CASH PAID  ·  NO QUESTIONS (SOME QUESTIONS)", w / 2, h * 0.8, w * 0.86, 30, CHUNK, "#ffd54a", "#2a1408", 5);
  } },
  signPlug: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#1e2a30"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffd54a"; for (let x = -40; x < w; x += 56) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 28, h); c.lineTo(x + 56, h - 22); c.lineTo(x + 28, h - 22); c.fill(); }
    centered(c, "PLUG & PRAY", w * 0.36, h * 0.42, w * 0.62, 104, CHUNK, "#7ff0ff", "#0a1418", 10);
    centered(c, "REPAIRS", w * 0.87, h * 0.42, w * 0.2, 56, CHUNK, "#ffd54a", "#0a1418", 6);
    // a lightning bolt
    c.fillStyle = "#ffd54a"; c.beginPath(); c.moveTo(w * 0.725, 20); c.lineTo(w * 0.695, 90); c.lineTo(w * 0.72, 90); c.lineTo(w * 0.7, 150); c.lineTo(w * 0.75, 70); c.lineTo(w * 0.725, 70); c.lineTo(w * 0.745, 20); c.fill();
  } },
  signNeedle: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#0e0d14"; c.fillRect(0, 0, w, h); c.strokeStyle = "#ff5fa8"; c.lineWidth = 5; c.strokeRect(9, 9, w - 18, h - 18);
    vinylIcon(c, 98, h / 2, 70, "#ff5fa8");
    c.save(); c.translate(98, h / 2); c.rotate(-0.6); c.fillStyle = "#e8e4dc"; c.fillRect(-4, -92, 8, 70); c.restore(); // (the tone arm)
    centered(c, "NEEDLE DROP", w * 0.56, h * 0.42, w * 0.72, 100, CHUNK, "#f4f1ea", "#ff5fa8", 4);
    centered(c, "R E C O R D S", w * 0.56, h * 0.8, w * 0.5, 34, CHUNK, "#43e0c6");
  } },
  signPeak: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#3a2a1a"; c.fillRect(0, 0, w, h); const r = seeded(5);
    for (let y = 0; y < h; y += 4) { c.fillStyle = `rgba(${r() < 0.5 ? "20,10,0" : "120,80,40"},${0.1 + r() * 0.2})`; c.fillRect(0, y, w, 2); }
    // the mountain
    c.fillStyle = "#f4f1ea"; c.beginPath(); c.moveTo(30, h - 24); c.lineTo(110, 26); c.lineTo(190, h - 24); c.fill(); c.fillStyle = "#3a6a4a"; c.beginPath(); c.moveTo(30, h - 24); c.lineTo(80, 78); c.lineTo(110, 98); c.lineTo(140, 78); c.lineTo(190, h - 24); c.fill();
    centered(c, "PEAK FOMO", w * 0.58, h * 0.42, w * 0.7, 108, CHUNK, "#ffb84a", "#1a1008", 10);
    centered(c, "OUTFITTERS  ·  EST. LAST TUESDAY", w * 0.58, h * 0.82, w * 0.7, 30, CHUNK, "#f4f1ea");
  } },
  signMaison: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#14161a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#d9b45a"; c.lineWidth = 3; c.strokeRect(14, 14, w - 28, h - 28); c.strokeRect(22, 22, w - 44, h - 44);
    centered(c, "M A I S O N   P O N G", w / 2, h * 0.46, w * 0.84, 88, SERIF, "#e8c878");
    centered(c, "PARFUMERIE  ·  TRASHINGTON  ·  PARIS (TEXAS)", w / 2, h * 0.78, w * 0.6, 22, SERIF, "#c8b88a", undefined, 0);
  } },
  signBonbon: { w: 1024, h: 176, draw: (c, w, h) => {
    c.fillStyle = "#ffd6e2"; c.fillRect(0, 0, w, h); c.fillStyle = "#ffffff"; for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 32, h);
    c.fillStyle = "rgba(255,214,226,0.7)"; c.fillRect(0, 0, w, h);
    centered(c, "Bonbon Vivant", w / 2, h * 0.44, w * 0.84, 116, ROUND, "#c2185b", "#fff4f8", 12);
    centered(c, "CONFISEUR  ·  SWEETS FOR THE SWEETLY LOADED", w / 2, h * 0.84, w * 0.7, 26, CHUNK, "#7a1840");
  } },
  // ---- NEEDLE DROP: the sleeve wall, the browser cards, the posters, the neon
  sleeves: { w: 512, h: 512, draw: (c, w) => { const r = seeded(77), n = 4, s = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sleeve(c, x * s + 4, y * s + 4, s - 8, r); } },
  sleeveRow: { w: 512, h: 128, draw: (c, w, h) => { const r = seeded(31), s = h; for (let x = 0; x < w; x += s) sleeve(c, x + 3, 3, s - 6, r); } },
  posterGig: { w: 256, h: 384, draw: (c, w, h) => {
    c.fillStyle = "#f4c430"; c.fillRect(0, 0, w, h); c.fillStyle = "#1b1420"; c.fillRect(14, 14, w - 28, h * 0.5);
    c.fillStyle = "#e8463a"; c.beginPath(); c.arc(w / 2, h * 0.27, 60, 0, 6.3); c.fill(); c.fillStyle = "#f4c430"; c.fillRect(w / 2 - 70, h * 0.27 - 8, 140, 16);
    centered(c, "THE BIN LIDS", w / 2, h * 0.64, w * 0.9, 40, CHUNK, "#1b1420");
    centered(c, "LIVE · NEVER", w / 2, h * 0.75, w * 0.8, 28, CHUNK, "#e8463a");
    centered(c, "THE SOGGY SHAMROCK", w / 2, h * 0.86, w * 0.8, 20, CHUNK, "#1b1420");
  } },
  posterTour: { w: 256, h: 384, draw: (c, w, h) => {
    c.fillStyle = "#1f3a8a"; c.fillRect(0, 0, w, h); for (let k = 0; k < 7; k++) { c.fillStyle = ["#ff5fa8", "#43e0c6", "#ffd54a"][k % 3]; c.beginPath(); c.arc(w / 2, h * 0.36, 110 - k * 15, Math.PI, 0); c.lineTo(w / 2 + 110 - k * 15, h * 0.36); c.fill(); }
    centered(c, "DJ SKIP", w / 2, h * 0.6, w * 0.9, 58, CHUNK, "#f4f1ea", "#0e0d14", 6);
    centered(c, "SCRATCHES EVERYTHING", w / 2, h * 0.72, w * 0.9, 22, CHUNK, "#ffd54a");
    centered(c, "WORLD TOUR (OF HIS FLAT)", w / 2, h * 0.84, w * 0.9, 18, CHUNK, "#9fe3ff");
  } },
  cardsND: { w: 512, h: 128, draw: (c, w, h) => {
    const labels = ["ROCK", "JAZZ", "SOUL", "PUNK", "DISCO", "POLKA", "BIN"];
    const cw = w / 4;
    labels.slice(0, 4).forEach((t, i) => { c.fillStyle = ["#f4f1ea", "#ffd54a", "#ff8fa3", "#9fe3ff"][i]; c.fillRect(i * cw + 4, 4, cw - 8, h - 8); centered(c, t, i * cw + cw / 2, h / 2, cw - 20, 52, CHUNK, "#1b1420"); });
  } },
  dollarBin: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#ffd54a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#1b1420"; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10); centered(c, "$1 BIN", w / 2, h * 0.4, w * 0.85, 56, CHUNK, "#e8463a", "#1b1420", 4); centered(c, "DIG! (E)", w / 2, h * 0.78, w * 0.7, 30, CHUNK, "#1b1420"); } },
  aboardND: { w: 256, h: 384, draw: (c, w, h) => {
    c.fillStyle = "#1b1a1e"; c.fillRect(0, 0, w, h); c.strokeStyle = "#8a6a4a"; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
    const r = seeded(4); for (let k = 0; k < 200; k++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 6, 2); }
    centered(c, "CRATE", w / 2, h * 0.17, w * 0.8, 50, ROUND, "#f4f1ea"); centered(c, "DIGGERS", w / 2, h * 0.31, w * 0.8, 50, ROUND, "#f4f1ea"); centered(c, "WELCOME", w / 2, h * 0.45, w * 0.8, 46, ROUND, "#43e0c6");
    vinylIcon(c, w / 2, h * 0.69, 52, "#ff5fa8");
    centered(c, "(we buy too)", w / 2, h * 0.9, w * 0.8, 26, ROUND, "#ffd54a");
  } },
  neonND: { w: 512, h: 256, draw: (c, w, h) => {
    c.clearRect(0, 0, w, h); c.lineCap = "round";
    const glowLine = (col: string, wid: number, f: () => void) => { c.strokeStyle = col; c.globalAlpha = 0.28; c.lineWidth = wid * 3; c.beginPath(); f(); c.stroke(); c.globalAlpha = 1; c.lineWidth = wid; c.beginPath(); f(); c.stroke(); };
    glowLine("#ff5fa8", 9, () => { c.arc(120, 128, 100, 0, 6.3); }); glowLine("#ff5fa8", 6, () => { c.arc(120, 128, 30, 0, 6.3); });
    glowLine("#43e0c6", 6, () => { c.arc(120, 128, 66, -1.2, 0.3); });
    c.font = `bold 92px ${ROUND}`; c.textAlign = "left"; c.textBaseline = "middle"; c.lineWidth = 7;
    for (const [t, y, col] of [["OPEN", 92, "#43e0c6"], ["LATE", 182, "#ff5fa8"]] as const) { c.strokeStyle = col; c.globalAlpha = 0.3; c.lineWidth = 18; c.strokeText(t, 250, y); c.globalAlpha = 1; c.lineWidth = 6; c.strokeText(t, 250, y); }
  } },
  // ---- the others' hero pictures (the blockout: one each)
  screens: { w: 512, h: 128, draw: (c, w, h) => {
    const r = seeded(9), s = h;
    for (let i = 0; i < w / s; i++) { const x = i * s, k = i % 4;
      if (k === 0) { const bars = ["#f4f4f4", "#f4f430", "#30f4f4", "#30f430", "#f430f4", "#f43030", "#3030f4"]; bars.forEach((b, j) => { c.fillStyle = b; c.fillRect(x + j * s / 7, 0, s / 7 + 1, h); }); }
      else if (k === 1) { for (let q = 0; q < 1400; q++) { const v = Math.floor(r() * 255); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x + r() * s, r() * h, 3, 2); } }
      else if (k === 2) { c.fillStyle = "#1a3a8a"; c.fillRect(x, 0, s, h); centered(c, "NO SIGNAL", x + s / 2, h / 2, s * 0.85, 26, CHUNK, "#f4f1ea"); }
      else { c.fillStyle = "#2a8a3a"; c.fillRect(x, 0, s, h); c.fillStyle = "#f4f1ea"; c.fillRect(x + s * 0.48, 0, 3, h); c.beginPath(); c.arc(x + s / 2, h / 2, 18, 0, 6.3); c.strokeStyle = "#f4f1ea"; c.lineWidth = 3; c.stroke(); }
    }
  } },
  mural: { w: 512, h: 256, draw: (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ffb070"); g.addColorStop(1, "#ffe0b0"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffe8a0"; c.beginPath(); c.arc(w * 0.72, h * 0.32, 36, 0, 6.3); c.fill();
    for (const [x0, pk, col] of [[-40, 0.18, "#6a5a7a"], [140, 0.08, "#4a4a6a"], [300, 0.22, "#5a6a7a"]] as const) { c.fillStyle = col; c.beginPath(); c.moveTo(x0, h); c.lineTo(x0 + 130, h * pk); c.lineTo(x0 + 260, h); c.fill(); c.fillStyle = "#f4f1ea"; c.beginPath(); c.moveTo(x0 + 100, h * (pk + 0.12)); c.lineTo(x0 + 130, h * pk); c.lineTo(x0 + 160, h * (pk + 0.12)); c.fill(); }
    c.fillStyle = "#2a5a3a"; for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 11, h - 40 - (x * 7) % 30); c.lineTo(x + 22, h); c.fill(); }
    centered(c, "THE SUMMIT IS A STATE OF MIND", w / 2, h * 0.12, w * 0.9, 28, CHUNK, "#3a2a1a");
  } },
  posterMaison: { w: 256, h: 384, draw: (c, w, h) => {
    c.fillStyle = "#e9e2d4"; c.fillRect(0, 0, w, h); c.strokeStyle = "#c8a24a"; c.lineWidth = 4; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = "#c8e0e8"; c.beginPath(); c.moveTo(w / 2 - 50, h * 0.62); c.lineTo(w / 2 + 50, h * 0.62); c.lineTo(w / 2 + 60, h * 0.32); c.lineTo(w / 2 - 60, h * 0.32); c.fill();
    c.fillStyle = "#d9b45a"; c.fillRect(w / 2 - 14, h * 0.2, 28, h * 0.12); c.beginPath(); c.arc(w / 2, h * 0.18, 20, 0, 6.3); c.fill();
    centered(c, "ALIBI", w / 2, h * 0.74, w * 0.8, 54, SERIF, "#2a2420"); centered(c, "EAU DE INNOCENCE", w / 2, h * 0.84, w * 0.8, 20, SERIF, "#7a6a4a", undefined, 0);
  } },
  jarsBonbon: { w: 512, h: 128, draw: (c, w, h) => {
    const r = seeded(21); c.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const x = i * w / 6 + 8, jw = w / 6 - 16; c.fillStyle = "rgba(220,240,255,0.55)"; c.fillRect(x, 20, jw, h - 24); c.fillStyle = "#c2185b"; c.fillRect(x - 3, 8, jw + 6, 14);
      for (let k = 0; k < 26; k++) { c.fillStyle = ["#ff5fa8", "#ffd54a", "#43e0c6", "#ff7a1a", "#9fe3ff", "#f4f1ea"][Math.floor(r() * 6)]; c.beginPath(); c.arc(x + 6 + r() * (jw - 12), 40 + r() * (h - 50), 5 + r() * 3, 0, 6.3); c.fill(); } }
  } },
};
const SHEET = 2048;
/** where each cell sits on the sheet (pixels), packed once */
const PACK = (() => {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  let x = 0, y = 0, rowH = 0;
  for (const [k, cl] of Object.entries(CELLS)) {
    if (x + cl.w > SHEET) { x = 0; y += rowH; rowH = 0; }
    out[k] = { x, y, w: cl.w, h: cl.h }; x += cl.w; rowH = Math.max(rowH, cl.h);
  }
  if (y + rowH > SHEET) throw new Error("store sheet overflow");
  return out;
})();
export type SheetCell = keyof typeof CELLS;
/** draw the whole sheet (once) */
export function drawStoreSheet(c: CanvasRenderingContext2D) {
  c.clearRect(0, 0, SHEET, SHEET);
  for (const [k, cl] of Object.entries(CELLS)) { const p = PACK[k]; c.save(); c.translate(p.x, p.y); c.beginPath(); c.rect(0, 0, p.w, p.h); c.clip(); cl.draw(c, p.w, p.h); c.restore(); }
}
export const STORE_SHEET_SIZE = SHEET;
/** a cell's UV rect (u0, v0, u1, v1; v up, the canvas flipped), optionally a sub-rect of it (fractions, from its top left) */
export function sheetUV(cell: SheetCell, sub: [number, number, number, number] = [0, 0, 1, 1]): [number, number, number, number] {
  const p = PACK[cell], x0 = p.x + sub[0] * p.w, x1 = p.x + sub[2] * p.w, y0 = p.y + sub[1] * p.h, y1 = p.y + sub[3] * p.h;
  return [x0 / SHEET, 1 - y1 / SHEET, x1 / SHEET, 1 - y0 / SHEET];
}

// ---------------------------------------------------------------------------------------------------------------------
// THE KIT (made by the city renderer for each store: see CityRenderer.buildStores)

/** a facing in the store's frame: [du, dv] (the street is [0, -1]: "out"; the back wall faces [0, -1] too) */
export type Facing = [number, number];
export interface StoreKit {
  s: StoreDef; W: number; D: number; H: number; T: number;
  /** an axis-aligned box in the frame (u0..u1, v0..v1, y0..y1) */
  box(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, col: string, o?: number): void;
  /** a box centred at (u, v, y): wu along the frontage, wv in from it, turned `yaw` about y (and tilted: `pitch` about u, `roll` about v) */
  B(u: number, v: number, y: number, wu: number, h: number, wv: number, col: string, o?: number, yaw?: number, pitch?: number, roll?: number): void;
  /** a cylinder standing at (u, v, y) (axis "y"), or lying along u or v */
  cyl(u: number, v: number, y: number, d: number, h: number, col: string, o?: number, t?: number, axis?: "y" | "u" | "v", top?: number): void;
  ball(u: number, v: number, y: number, d: number, col: string, o?: number, seg?: number): void;
  /** a textured (skinned) box: wood, boards, marble, stone, crate, panel... */
  skin(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, skin: string, col: string, o?: number): void;
  /** a glowing ball (a bulb) */
  bulb(u: number, v: number, y: number, d: number, col: string): void;
  /** a picture from the shared sheet: centred at (u, v, y), w x h, facing `n` (glow: unlit, for neon and screens) */
  pic(cell: SheetCell, u: number, v: number, y: number, w: number, h: number, n: Facing, glow?: boolean, sub?: [number, number, number, number]): void;
  /** pieces built in `fn` are outside the store (always drawn with the street) */
  outside(fn: () => void): void;
  /** a breakable's pieces (they vanish when it's smashed); glass: its see-through pane */
  breakable(propId: string, fn: () => void): void;
  glassBox(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number): void;
  rnd(): number;
}

// ---------------------------------------------------------------------------------------------------------------------
// THE STORES

export function dressStore(k: StoreKit) {
  const fx = STORE_FIXTURES[k.s.id];
  common(k, fx);
  ({ rustbucket, plugpray, needledrop, peakfomo, maisonpong, bonbon })[k.s.id](k);
}

/** what every store has: its fascia, the display case (if it has one), lamp shades for its lights */
function common(k: StoreKit, fx: (typeof STORE_FIXTURES)[StoreId]) {
  const sp = STORE_SHELLS[k.s.id], W = k.W, gTop = sp.glassTop ?? 2.9;
  const sign: Record<StoreId, SheetCell> = { rustbucket: "signRust", plugpray: "signPlug", needledrop: "signNeedle", peakfomo: "signPeak", maisonpong: "signMaison", bonbon: "signBonbon" };
  const sw = Math.min(W - 1.0, 8.4), sh = sw * 176 / 1024;
  const fasciaY = Math.min(sp.H - 0.2 - sh / 2, gTop + 0.3 + sh / 2 + (k.s.id === "bonbon" ? 0.55 : 0));
  k.outside(() => {
    // the fascia board and its sign (2 cm proud of the board, the board 12 cm proud of the wall)
    k.box(W / 2 - sw / 2 - 0.12, W / 2 + sw / 2 + 0.12, -0.14, 0, fasciaY - sh / 2 - 0.1, fasciaY + sh / 2 + 0.1, "#1b1420", 0.012);
    k.pic(sign[k.s.id], W / 2, -0.165, fasciaY, sw, sh, [0, -1]);
  });
  // the display case: a base, a glass top, the goods inside (the goods are the store's own: see each store)
  if (fx.case) {
    const [u0, u1, v0, v1, h] = fx.case;
    k.breakable("storecase_" + k.s.id, () => {
      k.box(u0, u1, v0, v1, 0, h * 0.55, "#2a2228", 0.012);
      k.box(u0 - 0.02, u1 + 0.02, v0 - 0.02, v1 + 0.02, h - 0.03, h, "#c9a227", 0.008);
      k.glassBox(u0 + 0.02, u1 - 0.02, v0 + 0.02, v1 - 0.02, h * 0.55, h - 0.03);
    });
  }
  // the lamps' shades and bulbs, where the real lights are
  for (const L of storeArea(k.s).lights ?? []) {
    const p = local(k, L.x, L.z), top = k.H - 0.02;
    k.cyl(p.u, p.v, (top + L.y + 0.25) / 2, 0.02, top - L.y - 0.25, "#1b1420", 0, 4);
    k.cyl(p.u, p.v, L.y + 0.12, 0.42, 0.24, "#1b1420", 0.008, 12, "y", 0.12);
    k.bulb(p.u, p.v, L.y - 0.02, 0.14, L.color);
  }
}
/** world (x, z) back to the store's (u, v) */
function local(k: StoreKit, x: number, z: number) {
  const f = storeFrame(k.s), o = f.at(0, 0), a = f.at(1, 0), b = f.at(0, 1);
  const ru = [a.x - o.x, a.z - o.z], rv = [b.x - o.x, b.z - o.z];
  return { u: (x - o.x) * ru[0] + (z - o.z) * ru[1], v: (x - o.x) * rv[0] + (z - o.z) * rv[1] };
}

// ---- LOW END: THE YARDS ---------------------------------------------------------------------------------------------

function rustbucket(k: StoreKit) {
  const W = k.W, T = k.T;
  // the yard bay (open to the street): a tyre stack, a heap of scrap, an oil drum, a hand-painted price board
  for (let i = 0; i < 4; i++) k.cyl(6.4, 2.0, 0.14 + i * 0.27, 0.8, 0.26, "#1b1a1e", 0.012, 14);
  for (let i = 0; i < 3; i++) k.cyl(7.4, 1.6, 0.14 + i * 0.27, 0.8, 0.26, "#1b1a1e", 0.012, 14);
  k.cyl(8.6, 2.6, 0.45, 0.6, 0.9, "#2f6a8a", 0.012, 14); k.cyl(8.6, 2.6, 0.91, 0.62, 0.03, "#c8ccd4", 0, 14);
  // the rummage heap (the dig spot): scrap in a pile
  const dg = STORE_FIXTURES.rustbucket.dig!;
  for (let q = 0; q < 26; q++) { const a = k.rnd() * 6.3, r = k.rnd() * 0.9, y = 0.12 + (0.9 - r) * 0.5 * k.rnd();
    k.B(dg[0] + Math.cos(a) * r, dg[1] + Math.sin(a) * r, y, 0.2 + k.rnd() * 0.4, 0.1 + k.rnd() * 0.2, 0.2 + k.rnd() * 0.4, ["#7a4a2a", "#8a8a90", "#5a5a60", "#a86a3a", "#3a6a8a", "#c8ccd4"][q % 6], 0.008, k.rnd() * 3, (k.rnd() - 0.5) * 0.6, (k.rnd() - 0.5) * 0.6); }
  // inside: hubcaps on the left wall, a crowbar rack
  for (let i = 0; i < 6; i++) k.cyl(T + 0.04, 2.0 + (i % 3) * 1.2, 1.4 + Math.floor(i / 3) * 0.8, 0.5, 0.03, "#c8ccd4", 0.006, 14, "u");
  k.outside(() => { k.box(0.6, 3.2, -0.5, -0.05, 2.95, 3.05, "#8a4a22", 0.012); }); // (a rusty canopy rail over the window)
  void W;
}

function plugpray(k: StoreKit) {
  // the window: a wall of stacked tellies, all on (static, test cards, NO SIGNAL), facing the street
  const v = 0.55;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const u = 2.75 + i * 1.02, y = 0.85 + row * 0.62;
    k.B(u, v, y, 0.9, 0.56, 0.5, row % 2 ? "#3a3640" : "#5a5248", 0.012);
    k.pic("screens", u, v - 0.255, y + 0.02, 0.7, 0.44, [0, -1], true, [((i + row) % 4) / 4, 0, ((i + row) % 4 + 1) / 4, 1]);
  }
  // the workbench at the back: a pegboard of tools, a lamp, a half-gutted toaster
  k.box(1.2, 4.0, 8.6, 9.3, 0, 0.9, "#6a5a4a", 0.012); k.skin(1.2, 4.0, 8.6, 9.3, 0.9, 0.96, "wood", "#a8865a", 0.008);
  k.box(1.2, 4.0, 9.35, 9.4, 1.3, 2.6, "#c8a878", 0.004);
  for (let i = 0; i < 8; i++) k.B(1.45 + i * 0.33, 9.32, 1.6 + (i % 3) * 0.35, 0.05, 0.3, 0.03, ["#e8463a", "#ffd54a", "#3a3640", "#2fa4a0"][i % 4], 0.004);
  k.B(2.6, 8.95, 1.08, 0.5, 0.3, 0.35, "#c8ccd4", 0.008);
}

// ---- THE MIDDLE ------------------------------------------------------------------------------------------------------

/** NEEDLE DROP RECORDS (the representative store, built in full) */
function needledrop(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, sp = STORE_SHELLS.needledrop, rc = sp.recess!, fx = STORE_FIXTURES.needledrop;
  const NAVY = "#2e3a5a", INK = "#14121a", OAK = "#8a5a32", OAK2 = "#5a3a20", PINK = "#ff5fa8", TEAL = "#43e0c6", CREAM = "#efe6d4";
  const sleeveCol = () => SLEEVE_COLS[Math.floor(k.rnd() * SLEEVE_COLS.length)];
  // ================================ OUTSIDE
  k.outside(() => {
    // pilasters either side of each window and the recess, a black stall riser under the windows
    for (const u of [0.2, 3.9, 7.84, W - 0.2]) k.box(u - 0.22, u + 0.22, -0.1, 0, 0, 3.2, INK, 0.012);
    for (const [a, b] of [[0.4, 3.9], [7.84, 11.34]]) { k.box(a, b, -0.08, 0, 0, 0.62, INK, 0.008); k.box(a, b, -0.12, 0, 0.6, 0.66, "#3a3444", 0.008); }
    // the recess: a black and white tiled floor, posters on its side walls, the neon record above the door
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) k.box(rc.u0 + 0.2 + i * (rc.u1 - rc.u0 - 0.4) / 8, rc.u0 + 0.2 + (i + 1) * (rc.u1 - rc.u0 - 0.4) / 8, j * rc.depth / 3, (j + 1) * rc.depth / 3, 0.15, 0.17, (i + j) % 2 ? "#f4f1ea" : INK, 0); // (on the pavement: 0.15 up)
    k.pic("posterGig", rc.u0 + 0.225, rc.depth * 0.5, 1.55, 0.9, 1.35, [1, 0]);
    k.pic("posterTour", rc.u1 - 0.225, rc.depth * 0.5, 1.55, 0.9, 1.35, [-1, 0]);
    // the A-board on the pavement, to the right of the door
    { const u = 9.6, v = -1.4;
      for (const s of [-1, 1]) { k.B(u, v + s * 0.18, 0.55, 0.62, 1.1, 0.04, "#6a4a2a", 0.008, 0, s * 0.17); k.pic("aboardND", u, v + s * 0.21, 0.6, 0.5, 0.78, [0, s], false); }
      k.B(u, v, 1.12, 0.64, 0.04, 0.1, "#3a2a1a", 0.006); }
  });
  // the window displays (seen from the street; inside the glass, so with the store's inside): a stepped plinth of
  // records facing out, a turntable on the left one, a big sleeve in the right one
  for (const [a, b] of [[0.4, 3.9], [7.84, 11.34]] as const) {
    k.box(a + 0.1, b - 0.1, 0.32, 1.0, 0, 0.7, NAVY, 0.012);
    k.box(a + 0.1, b - 0.1, 0.62, 1.0, 0.7, 1.05, NAVY, 0.012);
    for (let i = 0; i < 4; i++) { const u = a + 0.55 + i * (b - a - 1.1) / 3, lift = i % 2 ? 1.05 : 0.7;
      k.B(u, (i % 2 ? 0.66 : 0.42), lift + 0.17, 0.33, 0.33, 0.02, "#1b1420", 0.004, 0, -0.18);
      k.pic("sleeves", u, (i % 2 ? 0.66 : 0.42) - 0.035, lift + 0.18, 0.31, 0.31, [0, -1], false, [((i * 3) % 4) / 4, ((i + (a > 5 ? 2 : 0)) % 4) / 4, ((i * 3) % 4 + 1) / 4, ((i + (a > 5 ? 2 : 0)) % 4 + 1) / 4]); }
  }
  // the neon hanging in the left window: a record and OPEN LATE
  k.pic("neonND", 2.15, 0.42, 2.25, 1.5, 0.75, [0, -1], true);
  k.cyl(1.55, 0.42, 2.8, 0.01, 0.4, INK, 0, 3); k.cyl(2.75, 0.42, 2.8, 0.01, 0.4, INK, 0, 3);
  // the turntable in the left window
  k.B(2.15, 0.85, 1.1, 0.5, 0.1, 0.4, "#c8ccd4", 0.008); k.cyl(2.08, 0.85, 1.17, 0.32, 0.02, INK, 0.004, 18); k.cyl(2.08, 0.85, 1.185, 0.1, 0.012, PINK, 0, 12); k.B(2.33, 0.75, 1.19, 0.03, 0.03, 0.25, "#e8e4dc", 0, 0.4);
  // ================================ INSIDE
  // the floor: oak boards (just above the shell's floor), a dark skirting, the walls' lower half in black
  const F = STORE_FLOOR;
  k.skin(T, W - T, T + 0.02, D - T, F, F + 0.015, "boards", "#6a4428", 0);
  for (const [u0, u1, v0, v1] of [[T, T + 0.03, T, D - T], [W - T - 0.03, W - T, T, D - T], [T, W - T, D - T - 0.03, D - T]] as const) k.box(u0, u1, v0, v1, 0.05, 1.1, INK, 0);
  // the ceiling's black ductwork and a strip of pink neon along the back wall
  k.cyl(W / 2, D * 0.5, H - 0.45, 0.45, D - 1.2, "#2a2830", 0.008, 12, "v");
  k.box(1.0, W - 1.0, D - T - 0.06, D - T - 0.03, 3.65, 3.7, PINK, 0); k.bulb(1.0, D - T - 0.05, 3.67, 0.08, PINK); k.bulb(W - 1.0, D - T - 0.05, 3.67, 0.08, PINK);
  // THE BROWSER BINS (the two shelves): oak crates on legs, rows of sleeves standing in them, divider cards
  for (const [u0, u1, v0, v1, h] of fx.shelves) {
    k.skin(u0, u1, v0, v1, h - 0.45, h - 0.05, "wood", OAK, 0.012);
    for (const [uu, vv] of [[u0 + 0.06, v0 + 0.06], [u1 - 0.06, v0 + 0.06], [u0 + 0.06, v1 - 0.06], [u1 - 0.06, v1 - 0.06]]) k.box(uu - 0.04, uu + 0.04, vv - 0.04, vv + 0.04, 0, h - 0.45, OAK2, 0.006);
    k.box(u0 + 0.1, u1 - 0.1, v0 + 0.1, v1 - 0.1, 0.12, 0.16, OAK2, 0.004); // (the shelf under it: boxes of overstock)
    for (let i = 0; i < 3; i++) k.B(u0 + 0.4 + i * (u1 - u0 - 0.8) / 2, (v0 + v1) / 2, 0.29, 0.5, 0.26, 0.42, "#c8a878", 0.006);
    // two rows (along v), sleeves leaning back, the divider cards sticking up
    for (const ur of [u0 + (u1 - u0) * 0.27, u0 + (u1 - u0) * 0.73]) {
      const n = Math.round((v1 - v0 - 0.2) / 0.05);
      for (let q = 0; q < n; q++) { const vv = v0 + 0.12 + q * 0.05; k.B(ur, vv, h - 0.12 + (q % 7 === 0 ? 0.03 : 0), 0.9, 0.3, 0.012, sleeveCol(), 0, 0, -0.35); }
      for (let c = 0; c < 4; c++) { const vv = v0 + 0.3 + c * (v1 - v0 - 0.5) / 3; k.pic("cardsND", ur, vv, h + 0.12, 0.34, 0.1, [0, -1], false, [c / 4, 0, (c + 1) / 4, 1]); }
    }
  }
  // the $1 BIN (the rummage spot): a big crate on the floor, sleeves sticking up every which way
  { const [u, v] = fx.dig!;
    k.skin(u - 0.55, u + 0.55, v - 0.4, v + 0.4, F, 0.65, "crate", "#c8a070", 0.012);
    for (let q = 0; q < 22; q++) k.B(u - 0.42 + (q % 11) * 0.085, v - 0.15 + Math.floor(q / 11) * 0.3, 0.67, 0.012, 0.3, 0.3, sleeveCol(), 0, (k.rnd() - 0.5) * 0.5, (k.rnd() - 0.5) * 0.4, (k.rnd() - 0.5) * 0.3);
    k.pic("dollarBin", u, v - 0.43, 0.42, 0.6, 0.3, [0, -1]); }
  // THE SLEEVE WALL (right side wall, above the black dado): framed sleeves in a grid, and a shelf of new arrivals
  { const u = W - T - 0.025;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) { const v = 2.6 + i * 1.12, y = 1.8 + row * 0.62;
      k.B(u - 0.005, v, y, 0.02, 0.56, 0.56, INK, 0.004);
      k.pic("sleeves", u - 0.03, v, y, 0.5, 0.5, [-1, 0], false, [((i + row) % 4) / 4, ((row * 2 + i) % 4) / 4, ((i + row) % 4 + 1) / 4, ((row * 2 + i) % 4 + 1) / 4]); }
    k.box(W - T - 0.35, W - T, 2.2, 9.2, 1.18, 1.22, OAK, 0.008); // (a ledge of new arrivals, leaning on the wall)
    for (let i = 0; i < 12; i++) k.B(W - T - 0.16, 2.45 + i * 0.58, 1.38, 0.02, 0.32, 0.32, sleeveCol(), 0.004, 0, 0, 0.18); }
  // the left wall: the two posters and a shelf of cassettes over the display case
  { const u = T + 0.025;
    k.pic("posterGig", u + 0.01, 3.4, 2.2, 0.8, 1.2, [1, 0]); k.pic("posterTour", u + 0.01, 4.5, 2.2, 0.8, 1.2, [1, 0]);
    k.box(T, T + 0.3, 7.3, 10.5, 2.3, 2.34, OAK, 0.008);
    for (let i = 0; i < 26; i++) k.B(T + 0.14, 7.4 + i * 0.12, 2.4, 0.07, 0.11, 0.1, ["#f4f1ea", "#1b1420", "#e8463a", "#ffd54a", "#43c7a6"][i % 5], 0.002); }
  // the display case's goods: the GOLDEN RECORD on a stand, two rare ones either side (they spill when it's smashed)
  { const [u0, u1, v0, v1, h] = fx.case!; const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    k.breakable("storecase_needledrop", () => {
      k.B(um, vm, h * 0.55 + 0.03, u1 - u0 - 0.1, 0.04, v1 - v0 - 0.1, "#5a1030", 0); // (velvet)
      k.cyl(um + 0.05, vm, h * 0.55 + 0.25, 0.4, 0.02, "#e8c050", 0.004, 20, "u"); k.cyl(um + 0.06, vm, h * 0.55 + 0.25, 0.14, 0.022, "#fff0b0", 0, 12, "u");
      k.B(um - 0.05, vm, h * 0.55 + 0.12, 0.08, 0.2, 0.08, "#3a3444", 0);
      for (const dv of [-0.9, 0.9]) { k.cyl(um + 0.05, vm + dv, h * 0.55 + 0.2, 0.3, 0.015, INK, 0.004, 18, "u"); k.cyl(um + 0.06, vm + dv, h * 0.55 + 0.2, 0.1, 0.017, dv < 0 ? TEAL : PINK, 0, 10, "u"); }
    }); }
  // THE COUNTER: oak with a black front, the shop's own decks on it, a pair of headphones; behind it, the back wall's
  // stock (records spine-out on long shelves) and the listening corner's big speakers
  { const [c0, c1, cv0, cv1] = sp.counter;
    k.skin(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.06, "wood", OAK, 0.01);
    k.box(c0, c1, cv0 - 0.03, cv0, 0.1, 0.96, INK, 0.004);
    for (let i = 0; i < 6; i++) k.pic("sleeveRow", c0 + 0.45 + i * (c1 - c0 - 0.9) / 5, cv0 - 0.045, 0.62, 0.36, 0.36, [0, -1], false, [i / 4 % 1, 0, (i % 4 + 1) / 4, 1]);
    for (const u of [c0 + 0.9, c0 + 2.0]) { k.B(u, (cv0 + cv1) / 2, 1.11, 0.5, 0.08, 0.4, "#2a2830", 0.006); k.cyl(u - 0.05, (cv0 + cv1) / 2, 1.16, 0.32, 0.02, INK, 0.004, 18); k.cyl(u - 0.05, (cv0 + cv1) / 2, 1.172, 0.1, 0.01, u < c0 + 1 ? PINK : TEAL, 0, 10); }
    k.B(c0 + 1.45, (cv0 + cv1) / 2, 1.1, 0.4, 0.06, 0.28, "#3a3444", 0.006); // (the mixer)
    k.cyl(c0 + 2.7, (cv0 + cv1) / 2 - 0.1, 1.14, 0.17, 0.06, INK, 0.004, 12, "u"); k.cyl(c0 + 2.98, (cv0 + cv1) / 2 - 0.1, 1.14, 0.17, 0.06, INK, 0.004, 12, "u"); k.B(c0 + 2.84, (cv0 + cv1) / 2 - 0.1, 1.24, 0.3, 0.03, 0.04, "#3a3444", 0); // (headphones)
    // the back wall: three long shelves of records spine-out
    for (let s = 0; s < 3; s++) { const y = 1.2 + s * 0.55;
      k.box(1.2, W - 1.2, D - T - 0.34, D - T, y, y + 0.03, OAK, 0.006);
      let u = 1.25; while (u < W - 1.3) { const w = 0.006 + k.rnd() * 0.012; k.box(u, u + w, D - T - 0.32, D - T - 0.02, y + 0.03, y + 0.34, sleeveCol(), 0); u += w + 0.002; } }
    // the speakers (either end of the back wall)
    for (const u of [0.85, W - 0.85]) { k.box(u - 0.35, u + 0.35, D - T - 0.55, D - T, 0, 1.3, "#1e1c22", 0.012); k.cyl(u, D - T - 0.56, 0.4, 0.42, 0.03, "#3a3842", 0.004, 16, "v"); k.cyl(u, D - T - 0.56, 0.95, 0.24, 0.03, "#3a3842", 0.004, 14, "v"); }
  }
  // the listening chair by the window (a battered armchair) and a crate as a side table
  k.box(1.0, 1.9, 1.5, 2.3, F, 0.48, "#7a2f3a", 0.012); k.box(1.0, 1.9, 2.15, 2.4, 0.48, 1.1, "#7a2f3a", 0.012); for (const u of [1.0, 1.75]) k.box(u, u + 0.15, 1.5, 2.3, 0.48, 0.7, "#6a2832", 0.008);
  k.skin(2.1, 2.55, 1.6, 2.05, F, 0.5, "crate", "#c8a070", 0.008);
  void CREAM;
}

function peakfomo(k: StoreKit) {
  const W = k.W, D = k.D, T = k.T;
  // the porch: a shingle roof on log posts over the door, a mountain mural inside on the back wall
  k.outside(() => {
    for (const u of [4.4, 7.34]) k.cyl(u, -1.5, 1.55, 0.22, 3.1, "#6a4a2a", 0.012, 10);
    k.B(5.87, -0.8, 3.2, 3.6, 0.1, 1.9, "#3a4a3a", 0.012, 0, 0.18);
    k.box(4.2, 7.54, -1.7, 0, 0, 0.12, "#7a5a3a", 0.008);
  });
  k.pic("mural", W / 2, D - T - 0.03, 2.8, 5.0, 2.5, [0, -1]);
  // a tent on the floor (a triangle prism of two tilted boxes), a canoe on the left wall
  k.B(3.2, 7.6, 0.6, 2.0, 0.04, 1.3, "#e8902a", 0.012, 0, 0.75); k.B(3.2, 8.4, 0.6, 2.0, 0.04, 1.3, "#d87a1a", 0.012, 0, -0.75);
  k.B(T + 0.25, 5.5, 2.6, 0.4, 0.35, 3.6, "#c84a2a", 0.012);
  // trail-mix barrels by the counter
  for (const [u, v] of [[8.6, 5.3], [9.3, 5.3]]) { k.cyl(u, v, 0.45, 0.6, 0.9, "#8a6a3a", 0.012, 12); k.ball(u, v, 0.95, 0.5, "#c89050", 0, 3); }
}

// ---- HIGH END: SNOB ROW ---------------------------------------------------------------------------------------------

function maisonpong(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H;
  // a chandelier (a gold ring of glowing drops), gold trim on the plinths, a poster in each window
  const cu = W / 2, cv = D * 0.45, cy = Math.min(H - 1.4, 5.2) + 0.1;
  k.cyl(cu, cv, cy, 1.2, 0.06, "#d9b45a", 0.006, 24); k.cyl(cu, cv, cy + 0.5, 0.6, 0.05, "#d9b45a", 0.006, 18);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; k.bulb(cu + Math.cos(a) * 0.6, cv + Math.sin(a) * 0.6, cy - 0.1, 0.1, "#fff4d8"); }
  for (const u of [1.2, W - 1.2]) k.pic("posterMaison", u + 0.6 * (u < 5 ? 1 : -1), 0.55, 2.2, 1.0, 1.5, [0, -1]);
  k.outside(() => { for (const u of [0.3, W - 0.3]) k.box(u - 0.3, u + 0.3, -0.1, 0, 0, 7.4, "#d8d0c0", 0.012); });
}

function bonbon(k: StoreKit) {
  const W = k.W;
  // the striped awning over the long window, and jars of sweets along the window's ledge
  k.outside(() => {
    for (let i = 0; i < 12; i++) { const u0 = 2.5 + i * (W - 3.0) / 12, u1 = u0 + (W - 3.0) / 12; k.B((u0 + u1) / 2, -0.62, 3.25, u1 - u0, 0.06, 1.4, i % 2 ? "#ffffff" : "#e85a8a", 0.006, 0, 0.42); }
  });
  k.box(2.6, W - 0.6, 0.32, 1.0, 0, 0.8, "#f8e8ee", 0.012);
  k.pic("jarsBonbon", (2.6 + W - 0.6) / 2, 0.66, 1.18, W - 3.4, (W - 3.4) / 4, [0, -1]);
}
