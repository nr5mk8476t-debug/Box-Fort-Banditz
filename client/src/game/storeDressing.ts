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
import { storeFrame, STORE_SHELLS, STORE_FIXTURES, STORE_FLOOR, STORE_BUILDINGS, storeTop } from "@bfb/shared";
import type { AreaLight, InteriorArea } from "./areas.ts";

/** the interior area of a store: its plot, one floor, drawn from outside within 34 m (hidden past 40) */
export function storeArea(s: StoreDef): InteriorArea {
  const f = storeFrame(s), sp = STORE_SHELLS[s.id], W = f.W, D = f.D, H = sp.H;
  const L = (name: string, u: number, v: number, y: number, color: string, range: number, intensity: number): AreaLight => { const p = f.at(u, v); return { name: "store-" + s.id + "-" + name, x: p.x, y, z: p.z, color, range, intensity, floor: 0 }; };
  const lamp = Math.min(H - 0.8, 3.6);
  const lights: Record<StoreId, AreaLight[]> = {
    rustbucket: [L("bulb", W * 0.3, D * 0.6, lamp, "#ffcf90", 9, 0.85), L("bay", W * 0.78, D * 0.45, lamp, "#e4eeff", 11, 0.9)], // (R13b: a warm bulb over the counter, a cold strip light in the workshop)
    plugpray: [L("tube", W * 0.5, D * 0.45, lamp, "#e8f4ff", 12, 0.87), L("bench", W * 0.5, D * 0.8, lamp, "#ffe0b0", 8, 0.65)],
    needledrop: [L("bins", W * 0.5, D * 0.42, lamp, "#ffcc88", 11, 0.87), L("counter", W * 0.5, D * 0.8, lamp, "#ff9ad0", 8, 0.58)],
    peakfomo: [L("lodge", W * 0.35, D * 0.5, lamp, "#ffd8a0", 11, 0.87), L("till", W * 0.8, D * 0.6, lamp, "#ffe8c0", 8, 0.65)],
    maisonpong: [L("chandelier", W * 0.5, D * 0.45, Math.min(H - 1.4, 5.2), "#fff0d8", 12, 0.65), L("altar", W * 0.5, D * 0.88, 3.2, "#ffe0a0", 7, 0.72)],
    bonbon: [L("front", W * 0.5, D * 0.35, lamp, "#ffe0e8", 11, 0.87), L("counter", W * 0.5, D * 0.75, lamp, "#ffd8b0", 8, 0.65)],
  };
  return { id: "store-" + s.id, rect: s.plot, floors: [{ y0: 0, y1: H }], outside: { on: 34, off: 40 }, lights: lights[s.id] };
}
/** the stores whose shelves and counter this file dresses in full (the city leaves off its generic goods and worktop) */
export const STORE_OWN_FIXTURES = new Set<StoreId>(["rustbucket", "plugpray", "needledrop", "peakfomo", "maisonpong", "bonbon"]);
/** the visibility group of a store's inside */
export const storeGroup = (i: number) => 9410 + i;

// ---------------------------------------------------------------------------------------------------------------------
// THE SHARED SHEET: every picture the stores use, packed into one 2048 x 2048 canvas (shelf-packed, in this order)

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
interface Cell { w: number; h: number; draw: Draw; /** stored at this fraction of its size (soft, big pictures) */ s?: number }
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
  sleeves: { w: 512, h: 512, s: 0.75, draw: (c, w) => { const r = seeded(77), n = 4, s = w / n; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sleeve(c, x * s + 4, y * s + 4, s - 8, r); } },
  sleeveRow: { w: 512, h: 128, draw: (c, w, h) => { const r = seeded(31), s = h; for (let x = 0; x < w; x += s) sleeve(c, x + 3, 3, s - 6, r); } },
  posterGig: { w: 256, h: 384, s: 0.75, draw: (c, w, h) => {
    c.fillStyle = "#f4c430"; c.fillRect(0, 0, w, h); c.fillStyle = "#1b1420"; c.fillRect(14, 14, w - 28, h * 0.5);
    c.fillStyle = "#e8463a"; c.beginPath(); c.arc(w / 2, h * 0.27, 60, 0, 6.3); c.fill(); c.fillStyle = "#f4c430"; c.fillRect(w / 2 - 70, h * 0.27 - 8, 140, 16);
    centered(c, "THE BIN LIDS", w / 2, h * 0.64, w * 0.9, 40, CHUNK, "#1b1420");
    centered(c, "LIVE · NEVER", w / 2, h * 0.75, w * 0.8, 28, CHUNK, "#e8463a");
    centered(c, "THE SOGGY SHAMROCK", w / 2, h * 0.86, w * 0.8, 20, CHUNK, "#1b1420");
  } },
  posterTour: { w: 256, h: 384, s: 0.75, draw: (c, w, h) => {
    c.fillStyle = "#1f3a8a"; c.fillRect(0, 0, w, h); for (let k = 0; k < 7; k++) { c.fillStyle = ["#ff5fa8", "#43e0c6", "#ffd54a"][k % 3]; c.beginPath(); c.arc(w / 2, h * 0.36, 110 - k * 15, Math.PI, 0); c.lineTo(w / 2 + 110 - k * 15, h * 0.36); c.fill(); }
    centered(c, "DJ SKIP", w / 2, h * 0.6, w * 0.9, 58, CHUNK, "#f4f1ea", "#0e0d14", 6);
    centered(c, "SCRATCHES EVERYTHING", w / 2, h * 0.72, w * 0.9, 22, CHUNK, "#ffd54a");
    centered(c, "WORLD TOUR (OF HIS FLAT)", w / 2, h * 0.84, w * 0.9, 18, CHUNK, "#9fe3ff");
  } },
  cardsND: { w: 512, h: 128, s: 0.75, draw: (c, w, h) => {
    const labels = ["ROCK", "JAZZ", "SOUL", "PUNK", "DISCO", "POLKA", "BIN"];
    const cw = w / 4;
    labels.slice(0, 4).forEach((t, i) => { c.fillStyle = ["#f4f1ea", "#ffd54a", "#ff8fa3", "#9fe3ff"][i]; c.fillRect(i * cw + 4, 4, cw - 8, h - 8); centered(c, t, i * cw + cw / 2, h / 2, cw - 20, 52, CHUNK, "#1b1420"); });
  } },
  dollarBin: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#ffd54a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#1b1420"; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10); centered(c, "$1 BIN", w / 2, h * 0.4, w * 0.85, 56, CHUNK, "#e8463a", "#1b1420", 4); centered(c, "DIG! (E)", w / 2, h * 0.78, w * 0.7, 30, CHUNK, "#1b1420"); } },
  aboardND: { w: 256, h: 384, s: 0.75, draw: (c, w, h) => {
    c.fillStyle = "#1b1a1e"; c.fillRect(0, 0, w, h); c.strokeStyle = "#8a6a4a"; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
    const r = seeded(4); for (let k = 0; k < 200; k++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * w, r() * h, 6, 2); }
    centered(c, "CRATE", w / 2, h * 0.17, w * 0.8, 50, ROUND, "#f4f1ea"); centered(c, "DIGGERS", w / 2, h * 0.31, w * 0.8, 50, ROUND, "#f4f1ea"); centered(c, "WELCOME", w / 2, h * 0.45, w * 0.8, 46, ROUND, "#43e0c6");
    vinylIcon(c, w / 2, h * 0.69, 52, "#ff5fa8");
    centered(c, "(we buy too)", w / 2, h * 0.9, w * 0.8, 26, ROUND, "#ffd54a");
  } },
  neonND: { w: 512, h: 256, s: 0.75, draw: (c, w, h) => {
    c.clearRect(0, 0, w, h); c.lineCap = "round";
    const glowLine = (col: string, wid: number, f: () => void) => { c.strokeStyle = col; c.globalAlpha = 0.28; c.lineWidth = wid * 3; c.beginPath(); f(); c.stroke(); c.globalAlpha = 1; c.lineWidth = wid; c.beginPath(); f(); c.stroke(); };
    glowLine("#ff5fa8", 9, () => { c.arc(120, 128, 100, 0, 6.3); }); glowLine("#ff5fa8", 6, () => { c.arc(120, 128, 30, 0, 6.3); });
    glowLine("#43e0c6", 6, () => { c.arc(120, 128, 66, -1.2, 0.3); });
    c.font = `bold 92px ${ROUND}`; c.textAlign = "left"; c.textBaseline = "middle"; c.lineWidth = 7;
    for (const [t, y, col] of [["OPEN", 92, "#43e0c6"], ["LATE", 182, "#ff5fa8"]] as const) { c.strokeStyle = col; c.globalAlpha = 0.3; c.lineWidth = 18; c.strokeText(t, 250, y); c.globalAlpha = 1; c.lineWidth = 6; c.strokeText(t, 250, y); }
  } },
  boothSign: { w: 512, h: 128, draw: (c, w, h) => { c.clearRect(0, 0, w, h); c.font = `bold 64px ${ROUND}`; c.textAlign = "center"; c.textBaseline = "middle"; for (const [lw, a] of [[18, 0.3], [6, 1]] as const) { c.globalAlpha = a; c.lineWidth = lw; c.strokeStyle = "#43e0c6"; c.strokeText("LISTENING BOOTH", w / 2, h / 2); } c.globalAlpha = 1; } },
  rustNotes: { w: 256, h: 256, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#e8dcc0"; c.fillRect(0, 0, w, h); c.strokeStyle = "#5a3a20"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    [["NO REFUNDS", "#c83a2a"], ["NO RETURNS", "#1b1420"], ["NO IDEA", "#2f6a8a"], ["ASK PETE", "#c83a2a"]].forEach(([t, col], i) => centered(c, t, w / 2, 40 + i * 58, w * 0.85, 40, ROUND, col)); } },
  arcade: { w: 256, h: 256, draw: (c, w, h) => { c.fillStyle = "#08081a"; c.fillRect(0, 0, w, h); const r = seeded(3); for (let k = 0; k < 40; k++) { c.fillStyle = "#f4f1ea"; c.fillRect(r() * w, r() * h * 0.6, 2, 2); }
    c.fillStyle = "#ff5fa8"; for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) c.fillRect(30 + i * 34, 30 + j * 26, 20, 14);
    c.fillStyle = "#43e0c6"; c.fillRect(110, 200, 36, 14); c.fillRect(124, 190, 8, 10); centered(c, "INSERT COIN", w / 2, 150, w * 0.8, 26, CHUNK, "#ffd54a"); } },
  arcadeSide: { w: 256, h: 512, s: 0.7, draw: (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#7a3fa0"); g.addColorStop(1, "#1f3a8a"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 6; k++) { c.strokeStyle = ["#ff5fa8", "#43e0c6", "#ffd54a"][k % 3]; c.lineWidth = 10; c.beginPath(); c.moveTo(0, 120 + k * 60); c.lineTo(w, 60 + k * 60); c.stroke(); }
    c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); centered(c, "TRASH BLASTER", 0, 0, h * 0.85, 56, CHUNK, "#f4f1ea", "#1b1420", 8); c.restore(); } },
  summit: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#e8463a"; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h / 2); c.lineTo(0, h); c.fill(); centered(c, "SUMMIT", w * 0.38, h / 2, w * 0.6, 40, CHUNK, "#f4f1ea"); } },
  stripes: { w: 256, h: 256, s: 0.75, draw: (c, w, h) => { for (let x = 0; x < w; x += 32) { c.fillStyle = (x / 32) % 2 ? "#ffd6e2" : "#fff4f8"; c.fillRect(x, 0, 32, h); } c.fillStyle = "#e85a8a"; for (let x = 0; x < w; x += 64) for (let y = 16; y < h; y += 64) { c.beginPath(); c.arc(x + 16, y, 4, 0, 6.3); c.fill(); } } },
  rustBand: { w: 1024, h: 128, draw: (c, w, h) => { c.fillStyle = "#e8dcc0"; c.globalAlpha = 0.85; centered(c, "SCRAP · SALVAGE · SURPRISES", w / 2, h / 2, w * 0.94, 70, CHUNK, "#f0e4c8"); c.globalAlpha = 1; } },
  rustSide: { w: 1024, h: 256, s: 0.6, draw: (c, w, h) => { centered(c, "RUST BUCKET", w / 2, h * 0.4, w * 0.94, 150, CHUNK, "#f4e8d0", "#3a2010", 10); centered(c, "WE BUY · WE SELL · WE WELD", w / 2, h * 0.85, w * 0.8, 44, CHUNK, "#ffd54a"); } },
  rustBins: { w: 512, h: 64, draw: (c, w, h) => { ["BOLTS", "TAPS", "KNOBS", "MYSTERY"].forEach((t, i) => { c.fillStyle = "#f4ecd8"; c.fillRect(i * 128 + 6, 6, 116, h - 12); centered(c, t, i * 128 + 64, h / 2, 104, 30, ROUND, "#2a1a10"); }); } },
  rustTag: { w: 256, h: 192, draw: (c, w, h) => { c.fillStyle = "#ffd54a"; c.fillRect(0, 0, w, h); c.fillStyle = "#1b1420"; c.font = `bold 30px ${ROUND}`; c.textAlign = "left"; c.textBaseline = "top"; ["JOB #0001", "WAITING ON PARTS", "SINCE 2019", "- PETE"].forEach((t, i) => c.fillText(t, 14, 12 + i * 44)); } },
  rustChicken: { w: 512, h: 256, s: 0.7, draw: (c, w, h) => { c.fillStyle = "#e8dcc0"; c.fillRect(0, 0, w, h); c.strokeStyle = "#5a3a20"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = "#2a1a10"; c.font = `bold 40px ${ROUND}`; c.textAlign = "center"; c.textBaseline = "middle"; ["CLUCKZILLA", "FROM THE OLD DRIVE-IN", "NOT FOR SALE", "(MAKE AN OFFER)"].forEach((t, i) => c.fillText(t, w / 2, 40 + i * 58)); } },
  rustOpen: { w: 256, h: 128, draw: (c, w, h) => { c.clearRect(0, 0, w, h); c.font = `bold 64px ${ROUND}`; c.textAlign = "center"; c.textBaseline = "middle"; for (const [lw, a] of [[16, 0.3], [5, 1]] as const) { c.globalAlpha = a; c.lineWidth = lw; c.strokeStyle = "#ff7a1a"; c.strokeText("OPEN-ISH", w / 2, h / 2); } c.globalAlpha = 1; } },
  rustSkip: { w: 512, h: 128, draw: (c, w, h) => { c.fillStyle = "#1b1420"; c.fillRect(0, 0, w, h); centered(c, "RUMMAGE SKIP", w / 2, h * 0.36, w * 0.9, 52, CHUNK, "#ffd54a"); centered(c, "DIG (E) · ONCE A DAY · NO REFUNDS", w / 2, h * 0.78, w * 0.9, 26, CHUNK, "#f4f1ea"); } },
  rustFind: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#f4ecd8"; c.fillRect(0, 0, w, h); c.fillStyle = "#c83a2a"; c.font = `bold 34px ${ROUND}`; c.textAlign = "center"; c.fillText("FIND OF THE", w / 2, 44); c.fillText("WEEK!", w / 2, 92); } },
  plugTickets: { w: 512, h: 192, s: 0.8, draw: (c, w, h) => { c.fillStyle = "#c8a878"; c.fillRect(0, 0, w, h); const r = seeded(13);
    for (let i = 0; i < 12; i++) { const x = 10 + (i % 6) * 83, y = 10 + Math.floor(i / 6) * 90, rot = (r() - 0.5) * 0.2; c.save(); c.translate(x + 36, y + 40); c.rotate(rot); c.fillStyle = ["#ffd54a", "#f4f1ea", "#ff8fa3", "#9fe3ff"][i % 4]; c.fillRect(-36, -38, 72, 76); c.fillStyle = "#1b1420"; c.font = `bold 15px ${ROUND}`; c.textAlign = "center"; c.fillText("#" + (412 + i * 7), 0, -18); c.fillText(["TOASTER", "TELLY", "PHONE", "RADIO", "KETTLE", "LAPTOP"][i % 6], 0, 2); c.fillText(["WAITING", "PARTS?", "PRAYING", "DONE", "NOPE", "SOON"][(i * 5) % 6], 0, 22); c.restore(); } } },
  plugPrices: { w: 256, h: 320, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#f4f1ea"; c.fillRect(0, 0, w, h); c.fillStyle = "#e8463a"; c.fillRect(0, 0, w, 56); centered(c, "PRICES", w / 2, 30, w * 0.8, 40, CHUNK, "#f4f1ea");
    c.fillStyle = "#1b1420"; c.font = `bold 22px ${ROUND}`; c.textAlign = "left"; [["LOOK AT IT", "$5"], ["OPEN IT", "$10"], ["FIX IT", "$$$"], ["UN-FIX IT", "FREE"], ["PRAY", "FREE"]].forEach(([a, b], i) => { c.fillText(a, 16, 92 + i * 46); c.textAlign = "right"; c.fillText(b, w - 16, 92 + i * 46); c.textAlign = "left"; }); } },
  plugDrawers: { w: 256, h: 256, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#7a8a90"; c.fillRect(0, 0, w, h); const L = ["FUSES", "VALVES", "KNOBS", "SCREWS", "PLUGS", "BULBS", "WIRES", "??"];
    for (let i = 0; i < 8; i++) { const x = (i % 2) * 128, y = Math.floor(i / 2) * 64; c.fillStyle = "#c8ccd4"; c.fillRect(x + 6, y + 6, 116, 52); c.fillStyle = "#f4f1ea"; c.fillRect(x + 24, y + 12, 80, 20); centered(c, L[i], x + 64, y + 22, 74, 16, ROUND, "#1b1420"); c.fillStyle = "#3a3a40"; c.fillRect(x + 50, y + 40, 28, 8); } } },
  plugZones: { w: 512, h: 192, draw: (c, w, h) => { [["REFURBISHED · FOR SALE", "#43c7a6"], ["AWAITING REPAIR", "#ffd54a"], ["READY FOR COLLECTION", "#ff8fa3"]].forEach(([t, col], i) => { c.fillStyle = col; c.fillRect(0, i * 64 + 4, w, 56); centered(c, t, w / 2, i * 64 + 32, w * 0.92, 34, CHUNK, "#1b1420"); }); } },
  plugReady: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#ff8fa3"; c.fillRect(0, 0, w, h); c.fillStyle = "#1b1420"; c.font = `bold 24px ${ROUND}`; c.textAlign = "center"; c.fillText("MRS. BINKS", w / 2, 36); c.fillText("READY SINCE MARCH", w / 2, 72); c.fillText("(PLEASE)", w / 2, 106); } },
  plugBlade: { w: 128, h: 512, draw: (c, w, h) => { c.clearRect(0, 0, w, h); c.font = `bold 84px ${CHUNK}`; c.textAlign = "center"; c.textBaseline = "middle"; "FIX".split("").concat(["!"]).forEach((ch, i) => { for (const [lw, a] of [[16, 0.3], [5, 1]] as const) { c.globalAlpha = a; c.lineWidth = lw; c.strokeStyle = "#7ff0ff"; c.strokeText(ch, w / 2, 70 + i * 120); } }); c.globalAlpha = 1; } },
  plugGhost: { w: 1024, h: 384, s: 0.6, draw: (c, w, h) => { c.globalAlpha = 0.55; centered(c, "PLUG & PRAY", w / 2, h * 0.3, w * 0.9, 130, CHUNK, "#f4f1ea"); centered(c, "IF IT'S BROKE WE'LL FIX IT", w / 2, h * 0.62, w * 0.9, 56, CHUNK, "#ffd54a"); centered(c, "(EVENTUALLY)", w / 2, h * 0.85, w * 0.5, 44, CHUNK, "#f4f1ea"); c.globalAlpha = 1; } },
  ndBlade: { w: 128, h: 512, draw: (c, w, h) => { c.fillStyle = "#0e0d14"; c.fillRect(0, 0, w, h); c.strokeStyle = "#ff5fa8"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); "RECORDS".split("").forEach((ch, i) => centered(c, ch, w / 2, 44 + i * 66, w * 0.8, 60, CHUNK, i % 2 ? "#43e0c6" : "#f4f1ea")); } },
  ndParapet: { w: 1024, h: 96, draw: (c, w, h) => { centered(c, "NEEDLE DROP · EST. 1979 · STUDIOS UPSTAIRS", w / 2, h / 2, w * 0.95, 52, SERIF, "#efe6d4"); } },
  ndPicks: { w: 256, h: 64, draw: (c, w, h) => { c.fillStyle = "#ff5fa8"; c.fillRect(0, 0, w, h); centered(c, "STAFF PICKS", w / 2, h / 2, w * 0.9, 36, CHUNK, "#0e0d14"); } },
  ndListen: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#0e0d14"; c.fillRect(0, 0, w, h); centered(c, "LISTEN HERE", w / 2, h * 0.36, w * 0.9, 40, CHUNK, "#43e0c6"); c.fillStyle = "#43e0c6"; c.beginPath(); c.moveTo(w * 0.5, h * 0.62); c.lineTo(w * 0.75, h * 0.62); c.lineTo(w * 0.75, h * 0.52); c.lineTo(w * 0.92, h * 0.74); c.lineTo(w * 0.75, h * 0.94); c.lineTo(w * 0.75, h * 0.84); c.lineTo(w * 0.5, h * 0.84); c.fill(); } },
  peakZones: { w: 768, h: 128, s: 0.75, draw: (c, w, h) => { [["HIKE", "#e8902a"], ["CAMP", "#3a6a4a"], ["CLIMB", "#e8463a"]].forEach(([t, col], i) => { c.fillStyle = "#e8d8b8"; c.fillRect(i * 256 + 6, 6, 244, h - 12); c.strokeStyle = col; c.lineWidth = 8; c.strokeRect(i * 256 + 12, 12, 232, h - 24); centered(c, t, i * 256 + 128, h / 2, 210, 64, CHUNK, col); }); } },
  peakMap: { w: 384, h: 288, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#e8dcb0"; c.fillRect(0, 0, w, h); const r = seeded(8); c.strokeStyle = "rgba(90,70,40,0.5)"; c.lineWidth = 2; for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(w * 0.55, h * 0.5, 30 + k * 24, 20 + k * 17, 0.3, 0, 6.3); c.stroke(); }
    c.strokeStyle = "#e8463a"; c.lineWidth = 5; c.setLineDash([12, 8]); c.beginPath(); c.moveTo(30, h - 30); for (let k = 1; k < 6; k++) c.lineTo(30 + k * (w * 0.5 - 30) / 5 + (r() - 0.5) * 30, h - 30 - k * (h * 0.5 - 30) / 5); c.stroke(); c.setLineDash([]);
    centered(c, "X", w * 0.55, h * 0.5, 40, 40, CHUNK, "#e8463a"); centered(c, "EXPEDITION: MT. FOMO (2.3 m)", w / 2, 24, w * 0.9, 24, CHUNK, "#3a2a1a"); centered(c, "BASE CAMP: THE CAR PARK", w * 0.3, h - 12, w * 0.55, 16, CHUNK, "#3a2a1a"); } },
  staffOnly: { w: 256, h: 96, draw: (c, w, h) => { c.fillStyle = "#e8d8b8"; c.fillRect(0, 0, w, h); centered(c, "STAFF ONLY", w / 2, h / 2, w * 0.9, 40, CHUNK, "#3a2a1a"); } },
  maisonLaunch: { w: 384, h: 192, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#14161a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#d9b45a"; c.lineWidth = 3; c.strokeRect(10, 10, w - 20, h - 20); centered(c, "NOUVEAU", w / 2, 48, w * 0.6, 30, SERIF, "#c8b88a"); centered(c, "ALIBI No. 2", w / 2, 100, w * 0.8, 52, SERIF, "#efe8da"); centered(c, "now with extra plausible deniability", w / 2, 152, w * 0.85, 20, SERIF, "#c8b88a"); } },
  maisonPlaque: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#c8a24a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#7a5a1a"; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12); centered(c, "MAISON PONG", w / 2, h * 0.4, w * 0.85, 30, SERIF, "#3a2a10"); centered(c, "by appointment (or not)", w / 2, h * 0.72, w * 0.85, 18, SERIF, "#3a2a10"); } },
  bonbonOrder: { w: 256, h: 128, draw: (c, w, h) => { c.fillStyle = "#fff4f8"; c.fillRect(0, 0, w, h); c.strokeStyle = "#c2185b"; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = "#7a1840"; c.font = `bold 26px ${ROUND}`; c.textAlign = "center"; c.fillText("FOR: THE MAYOR", w / 2, 44); c.fillText("URGENT (AGAIN)", w / 2, 82); } },
  bonbonToday: { w: 256, h: 192, s: 0.75, draw: (c, w, h) => { c.fillStyle = "#3a1a10"; c.fillRect(0, 0, w, h); c.strokeStyle = "#f4f1ea"; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16); centered(c, "TODAY", w / 2, 46, w * 0.7, 36, ROUND, "#ff9ad0"); centered(c, "SALTED", w / 2, 100, w * 0.8, 36, ROUND, "#f4f1ea"); centered(c, "CARAMEL", w / 2, 146, w * 0.8, 36, ROUND, "#f4f1ea"); } },
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
  mural: { w: 512, h: 256, s: 0.7, draw: (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ffb070"); g.addColorStop(1, "#ffe0b0"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffe8a0"; c.beginPath(); c.arc(w * 0.72, h * 0.32, 36, 0, 6.3); c.fill();
    for (const [x0, pk, col] of [[-40, 0.18, "#6a5a7a"], [140, 0.08, "#4a4a6a"], [300, 0.22, "#5a6a7a"]] as const) { c.fillStyle = col; c.beginPath(); c.moveTo(x0, h); c.lineTo(x0 + 130, h * pk); c.lineTo(x0 + 260, h); c.fill(); c.fillStyle = "#f4f1ea"; c.beginPath(); c.moveTo(x0 + 100, h * (pk + 0.12)); c.lineTo(x0 + 130, h * pk); c.lineTo(x0 + 160, h * (pk + 0.12)); c.fill(); }
    c.fillStyle = "#2a5a3a"; for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 11, h - 40 - (x * 7) % 30); c.lineTo(x + 22, h); c.fill(); }
    centered(c, "THE SUMMIT IS A STATE OF MIND", w / 2, h * 0.12, w * 0.9, 28, CHUNK, "#3a2a1a");
  } },
  posterMaison: { w: 256, h: 384, s: 0.75, draw: (c, w, h) => {
    c.fillStyle = "#e9e2d4"; c.fillRect(0, 0, w, h); c.strokeStyle = "#c8a24a"; c.lineWidth = 4; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = "#c8e0e8"; c.beginPath(); c.moveTo(w / 2 - 50, h * 0.62); c.lineTo(w / 2 + 50, h * 0.62); c.lineTo(w / 2 + 60, h * 0.32); c.lineTo(w / 2 - 60, h * 0.32); c.fill();
    c.fillStyle = "#d9b45a"; c.fillRect(w / 2 - 14, h * 0.2, 28, h * 0.12); c.beginPath(); c.arc(w / 2, h * 0.18, 20, 0, 6.3); c.fill();
    centered(c, "ALIBI", w / 2, h * 0.74, w * 0.8, 54, SERIF, "#2a2420"); centered(c, "EAU DE INNOCENCE", w / 2, h * 0.84, w * 0.8, 20, SERIF, "#7a6a4a", undefined, 0);
  } },
  jarsBonbon: { w: 512, h: 128, s: 0.75, draw: (c, w, h) => {
    const r = seeded(21); c.clearRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { const x = i * w / 6 + 8, jw = w / 6 - 16; c.fillStyle = "rgba(220,240,255,0.55)"; c.fillRect(x, 20, jw, h - 24); c.fillStyle = "#c2185b"; c.fillRect(x - 3, 8, jw + 6, 14);
      for (let k = 0; k < 26; k++) { c.fillStyle = ["#ff5fa8", "#ffd54a", "#43e0c6", "#ff7a1a", "#9fe3ff", "#f4f1ea"][Math.floor(r() * 6)]; c.beginPath(); c.arc(x + 6 + r() * (jw - 12), 40 + r() * (h - 50), 5 + r() * 3, 0, 6.3); c.fill(); } }
  } },
};
const SHEET = 2048;
/** where each cell sits on the sheet (pixels), packed once */
const PACK = (() => {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const sz = (cl: Cell) => [Math.ceil(cl.w * (cl.s ?? 1)), Math.ceil(cl.h * (cl.s ?? 1))];
  // (a skyline packer: each picture, tallest first, goes where it sits lowest: 16 px columns)
  const STEP = 16, cols = new Array(SHEET / STEP).fill(0);
  let top = 0;
  for (const [k, cl] of Object.entries(CELLS).sort((p, q) => sz(q[1])[1] - sz(p[1])[1] || sz(q[1])[0] - sz(p[1])[0])) {
    const [w, h] = sz(cl), n = Math.ceil(w / STEP);
    let bx = 0, by = Infinity;
    for (let c = 0; c + n <= cols.length; c++) { let y = 0; for (let q = c; q < c + n; q++) y = Math.max(y, cols[q]); if (y < by) { by = y; bx = c; } }
    out[k] = { x: bx * STEP, y: by, w, h }; for (let q = bx; q < bx + n; q++) cols[q] = by + h; top = Math.max(top, by + h);
  }
  if (top > SHEET) throw new Error("store sheet overflow: " + top + " px tall");
  return out;
})();
export type SheetCell = keyof typeof CELLS;
/** draw the whole sheet (once) */
export function drawStoreSheet(c: CanvasRenderingContext2D) {
  c.clearRect(0, 0, SHEET, SHEET);
  for (const [k, cl] of Object.entries(CELLS)) { const p = PACK[k]; c.save(); c.translate(p.x, p.y); c.beginPath(); c.rect(0, 0, p.w, p.h); c.clip(); if (cl.s) c.scale(cl.s, cl.s); cl.draw(c, cl.w, cl.h); c.restore(); }
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
  /** a prism: a profile (a0..a1 at y0, narrowing to t0..t1 at y1: t0 = t1 for a triangle) across `axis` "u" (the profile
   *  is in u, extruded b0..b1 along v) or "v" (profile in v, extruded along u). Gables, mansards, sawtooth teeth */
  prism(axis: "u" | "v", a0: number, a1: number, t0: number, t1: number, b0: number, b1: number, y0: number, y1: number, col: string, o?: number): void;
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
  const up = FASCIA_UP[k.s.id], span = FASCIA_SPAN[k.s.id] ?? [0.5, W - 0.5], sw = up ? up.w : Math.min(span[1] - span[0], 8.4), sh = sw * 176 / 1024, sc = (span[0] + span[1]) / 2;
  const fasciaY = up ? storeTop(k.s) + up.dy : Math.min(sp.H - 0.2 - sh / 2, gTop + 0.3 + sh / 2 + (k.s.id === "bonbon" ? 0.4 : 0));
  k.outside(() => {
    // the fascia board and its sign (2 cm proud of the board, the board 12 cm proud of the wall)
    const v0 = up ? up.v : 0;
    k.box(sc - sw / 2 - 0.12, sc + sw / 2 + 0.12, v0 - 0.14, v0, fasciaY - sh / 2 - 0.1, fasciaY + sh / 2 + 0.1, "#1b1420", 0.012);
    k.pic(sign[k.s.id], sc, v0 - 0.165, fasciaY, sw, sh, [0, -1]);
  });
  roofs(k);
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
/** R13b: where a store's fascia sits along its frontage (default: across it) */
const FASCIA_SPAN: Partial<Record<StoreId, [number, number]>> = { rustbucket: [0.3, 5.4], maisonpong: [2.9, 7.25], bonbon: [2.6, 9.5] };
/** R13b: a sign that isn't over the shopfront: its height (from the building's top) and how far out it sits */
const FASCIA_UP: Partial<Record<StoreId, { dy: number; w: number; v: number }>> = { peakfomo: { dy: 1.1, w: 5.2, v: -0.1 } };
/** world (x, z) back to the store's (u, v) */
function local(k: StoreKit, x: number, z: number) {
  const f = storeFrame(k.s), o = f.at(0, 0), a = f.at(1, 0), b = f.at(0, 1);
  const ru = [a.x - o.x, a.z - o.z], rv = [b.x - o.x, b.z - o.z];
  return { u: (x - o.x) * ru[0] + (z - o.z) * ru[1], v: (x - o.x) * rv[0] + (z - o.z) * rv[1] };
}

// ---- LOW END: THE YARDS ---------------------------------------------------------------------------------------------

/** stock on a shelf: n little things in a row (cols picked in turn); `kind` shapes them */
function goods(k: StoreKit, u0: number, u1: number, v: number, y: number, n: number, cols: string[], kind: "box" | "can" | "jar" | "bottle", alongV = false, v1 = v) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, u = alongV ? u0 : u0 + (u1 - u0) * t, vv = alongV ? v + (v1 - v) * t : v, col = cols[i % cols.length], h = 0.14 + k.rnd() * 0.12;
    if (kind === "box") k.B(u, vv, y + h / 2, 0.16 + k.rnd() * 0.08, h, 0.14, col, 0.004, (k.rnd() - 0.5) * 0.3);
    else if (kind === "can") k.cyl(u, vv, y + 0.08, 0.1, 0.16, col, 0.004, 10);
    else if (kind === "jar") { k.cyl(u, vv, y + 0.1, 0.13, 0.2, col, 0.004, 10); k.cyl(u, vv, y + 0.21, 0.11, 0.03, "#c8ccd4", 0, 10); }
    else { k.cyl(u, vv, y + 0.1, 0.08, 0.2, col, 0.004, 10, "y", 0.07); k.cyl(u, vv, y + 0.24, 0.03, 0.08, col, 0, 6); k.cyl(u, vv, y + 0.29, 0.04, 0.03, "#d9b45a", 0, 6); }
  }
}

function rustbucket(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, RUST = "#a85a2a", STEEL = "#8a8e98", DARK = "#2a2830", BRICK = "#a8543a", YEL = "#e8b830";
  const top = storeTop(k.s), dg = STORE_FIXTURES.rustbucket.dig!;
  // ================================ OUTSIDE: a patched brick shop and office, a corrugated workshop, a chicken on the roof
  k.outside(() => {
    // patched brickwork on the shop half of the frontage (round the window and the door), a corrugated header over the bay
    for (const [u0, u1, y0, y1] of [[0, 0.5, 0, H], [0.5, 3.3, 0, 0.6], [0.5, 3.3, 2.9, H], [3.3, 4.9, 2.6, H], [4.9, 5.6, 0, H]] as const) k.skin(u0, u1, -0.04, 0, y0, y1, "brick", BRICK, 0);
    for (const [u, y, w2, h2, col] of [[0.25, 1.2, 0.4, 0.5, "#7a3a2a"], [4.1, 3.9, 0.9, 0.4, "#c87a5a"], [5.2, 0.9, 0.5, 0.7, "#6a6a70"]] as const) k.skin(u - w2 / 2, u + w2 / 2, -0.06, -0.04, y - h2 / 2, y + h2 / 2, "brick", col, 0.004);
    k.skin(5.6, W, -0.05, 0, 3.4, H + 0.3, "corrugated", "#8a8e98", 0);
    // the corner: corrugated cladding down the open side, the name painted big
    k.skin(W, W + 0.04, 0, D, 0, H + 0.3, "corrugated", "#7a8088", 0);
    k.pic("rustSide", W + 0.06, D / 2, 2.6, 7.2, 1.8, [1, 0]);
    // the roller door, rolled up: its drum, its guides, the bottom bar
    k.box(5.6, W, -0.42, 0, 3.4, 3.88, STEEL, 0.012); k.box(5.62, W - 0.02, -0.12, 0, 3.32, 3.4, DARK, 0.006);
    for (const u of [5.66, W - 0.06]) k.box(u - 0.05, u + 0.05, -0.12, 0, 0, 3.4, DARK, 0.006);
    k.pic("rustBand", 2.8, -0.2, top - 0.45, 5.0, 0.62, [0, -1]); // (painted on the office's parapet)
    k.box(0, 5.6, -0.16, D, top, top + 0.55, BRICK, 0.012); k.box(-0.05, 5.65, -0.2, D, top + 0.55, top + 0.65, "#c8bca8", 0.008);
    // the shop door's steel canopy and an OPEN-ISH neon in the window
    k.box(3.15, 5.05, -0.95, 0, 2.72, 2.8, DARK, 0.01); for (const u of [3.25, 4.95]) k.B(u, -0.5, 3.05, 0.04, 0.04, 1.0, DARK, 0.004, 0, -0.55);
    k.pic("rustOpen", 1.9, 0.42, 2.45, 1.0, 0.5, [0, -1], true);
    // CLUCKZILLA: a giant fibreglass chicken from the old drive-in, bolted to the workshop roof (a silhouette from the corner)
    const cu = 7.6, cv = 1.2, cy = H + 0.3;
    for (const du of [-0.6, 0.6]) k.box(cu + du - 0.05, cu + du + 0.05, cv - 0.05, cv + 0.05, cy, cy + 0.9, DARK, 0.004);
    k.box(cu - 0.9, cu + 0.9, cv - 0.4, cv + 0.4, cy + 0.9, cy + 1.0, DARK, 0.006);
    for (const du of [-0.25, 0.25]) k.cyl(cu + du, cv, cy + 1.35, 0.1, 0.7, "#e8a020", 0.004, 6);
    k.ball(cu, cv, cy + 2.3, 1.7, "#f4f1ea", 0.012, 6); k.ball(cu + 0.75, cv + 0.1, cy + 2.6, 0.9, "#f4f1ea", 0.01, 5); // (the body, the tail)
    k.ball(cu - 0.75, cv - 0.1, cy + 3.15, 0.8, "#f4f1ea", 0.01, 5); // (the head)
    for (let i = 0; i < 3; i++) k.B(cu - 0.75 + (i - 1) * 0.16, cv - 0.1, cy + 3.62 - Math.abs(i - 1) * 0.06, 0.14, 0.24, 0.1, "#e8302a", 0.004);
    k.cyl(cu - 1.18, cv - 0.1, cy + 3.12, 0.18, 0.3, "#f0b020", 0.004, 8, "u", 0.02); k.ball(cu - 1.05, cv - 0.1, cy + 2.85, 0.2, "#e8302a", 0, 3);
    for (const dv of [-0.33, 0.13]) k.ball(cu - 1.08, cv + dv, cy + 3.25, 0.12, "#1b1420", 0, 2);
    k.B(cu, cv - 0.75, cy + 0.6, 1.2, 0.6, 0.04, "#5a3a20", 0.006, 0, 0.25); k.pic("rustChicken", cu, cv - 0.8, cy + 0.6, 1.1, 0.55, [0, -1], false); // (its handwritten board)
  });
  // ================================ THE SHOP (left): concrete, sorted salvage on racks, the counter
  k.skin(T, W - T, T, D - T, F + 0.004, F + 0.016, "concrete", "#3e3a34", 0); // (clear of the slab under it)
  for (let q = 0; q < 6; q++) k.cyl(6 + k.rnd() * 3, 1.2 + k.rnd() * 7, F + 0.016, 0.6 + k.rnd() * 0.8, 0.004, "#2a2622", 0, 12); // (oil, on the workshop side)
  // the window display: a stage of crates, a diver's helmet, a gramophone, a street sign, a rocking horse
  k.skin(0.6, 3.2, 0.32, 1.1, F, 0.62, "crate", "#c8a070", 0.01);
  k.ball(1.0, 0.7, 0.92, 0.55, "#c8902a", 0.008, 5); k.cyl(1.0, 0.43, 0.94, 0.26, 0.04, "#7fb4c8", 0.004, 12, "v"); k.cyl(1.0, 0.7, 0.66, 0.42, 0.1, "#a87020", 0.006, 12);
  k.B(1.85, 0.75, 0.75, 0.36, 0.26, 0.3, "#5a3a20", 0.006); k.cyl(1.95, 0.7, 1.1, 0.5, 0.45, "#d9b45a", 0.006, 12, "y", 0.06);
  k.B(2.75, 0.85, 1.25, 0.06, 1.25, 0.06, STEEL, 0.004); k.B(2.75, 0.83, 1.75, 0.7, 0.18, 0.03, "#2f8a4a", 0.004);
  k.B(2.5, 0.55, 0.85, 0.6, 0.12, 0.18, "#c83a2a", 0.006); k.ball(2.25, 0.55, 1.0, 0.22, "#c83a2a", 0.004, 3);
  // the racks of sorted salvage on the left wall: labelled bins on three shelves, hubcaps above
  { const u0 = T, u1 = T + 0.65, v0 = 1.4, v1 = 5.4;
    for (const y of [0.55, 1.15, 1.75]) k.box(u0, u1, v0, v1, y - 0.04, y, STEEL, 0.006);
    for (const v of [v0 + 0.03, (v0 + v1) / 2, v1 - 0.03]) k.box(u0 + 0.02, u1, v - 0.03, v + 0.03, F, 1.8, DARK, 0.004);
    for (const [y, r] of [[0.55, 0], [1.15, 1], [1.75, 2]] as const) for (let i = 0; i < 4; i++) { const v = v0 + 0.5 + i * 0.95;
      k.B(u0 + 0.33, v, y + 0.16, 0.55, 0.3, 0.8, ["#3a6a8a", "#c83a2a", "#5a6a3a"][r], 0.006); k.pic("rustBins", u1 + 0.005, v, y + 0.16, 0.6, 0.12, [1, 0], false, [((i + r) % 4) / 4, 0, ((i + r) % 4 + 1) / 4, 1]); }
    for (let i = 0; i < 5; i++) k.cyl(T + 0.04, v0 + 0.4 + i * 0.8, 2.3, 0.45, 0.03, "#c8ccd4", 0.006, 14, "u"); }
  // the counter: a steel top on two oil drums, a cash tin, the ledger, a bell
  { const [c0, c1, cv0, cv1] = STORE_SHELLS.rustbucket.counter, cm = (cv0 + cv1) / 2;
    k.box(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.05, STEEL, 0.01);
    for (const u of [c0 + 0.45, c1 - 0.45]) { k.cyl(u, cm, F + 0.4, 0.6, 0.8, u < 2 ? "#2f6a8a" : "#c83a2a", 0.01, 14); k.cyl(u, cm, F + 0.81, 0.62, 0.03, "#c8ccd4", 0, 14); }
    k.box(c0 + 0.9, c1 - 0.9, cv0, cv0 + 0.03, F, 0.98, "#5a5248", 0.004);
    k.cyl(c0 + 0.5, cm, 1.1, 0.14, 0.08, "#d9b45a", 0.004, 10, "y", 0.04); k.B(c0 + 2.4, cm, 1.09, 0.5, 0.06, 0.3, "#c8a878", 0.004, 0.2); k.B(c0 + 1.5, cm, 1.11, 0.3, 0.1, 0.2, "#2f6a3a", 0.004); }
  // behind the counter: the pegboard of spanners, the house rules, the find of the week (a ship's wheel)
  k.box(1.0, 4.2, D - T - 0.04, D - T, 1.4, 2.8, "#c8a878", 0.004);
  for (let i = 0; i < 10; i++) k.B(1.25 + i * 0.32, D - T - 0.07, 2.0 + (i % 2) * 0.35, 0.05, 0.4 + (i % 3) * 0.1, 0.02, STEEL, 0.003);
  k.pic("rustNotes", 4.85, D - T - 0.03, 2.2, 0.75, 0.75, [0, -1]);
  k.cyl(2.6, D - T - 0.08, 3.4, 0.9, 0.06, "#7a4a2a", 0.008, 16, "v"); k.cyl(2.6, D - T - 0.1, 3.4, 0.2, 0.1, "#5a3a20", 0.004, 10, "v");
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; k.B(2.6 + Math.cos(a) * 0.55, D - T - 0.09, 3.4 + Math.sin(a) * 0.55, 0.06, 0.06, 0.05, "#7a4a2a", 0.003); }
  k.pic("rustFind", 2.6, D - T - 0.05, 2.75, 0.5, 0.25, [0, -1]);
  // THE PARTITION between the shop and the workshop (solid: see STORE_FIXTURES): corrugated below, mesh above
  k.skin(5.5, 5.65, 5.0, 9.7, F, 1.2, "corrugated", "#7a8088", 0.008); k.skin(5.52, 5.63, 5.0, 9.7, 1.2, 2.4, "grille", "#9a9ea8", 0.006);
  for (const v of [5.0, 7.35, 9.7]) k.box(5.48, 5.67, v - 0.04, v + 0.04, F, 2.45, DARK, 0.006);
  // ================================ THE WORKSHOP (right): the car in its bay, the hoist, the bench, the skip, the racking
  { const cx = 7.55, cv = 2.2, y0 = F + 0.32;
    for (const [du, dv] of [[-0.95, -0.7], [0.95, -0.7], [-0.95, 0.7], [0.95, 0.7]]) k.box(cx + du - 0.2, cx + du + 0.2, cv + dv - 0.2, cv + dv + 0.2, F, y0, "#9a9a9a", 0.01); // (breeze blocks)
    k.B(cx, cv, y0 + 0.35, 2.6, 0.7, 1.9, RUST, 0.02); k.B(cx + 0.15, cv, y0 + 0.95, 1.4, 0.55, 1.75, "#c8743a", 0.02);
    k.B(cx + 0.15, cv - 0.88, y0 + 0.95, 1.2, 0.4, 0.03, "#7fb4c8", 0.004); k.B(cx + 0.15, cv + 0.88, y0 + 0.95, 1.2, 0.4, 0.03, "#7fb4c8", 0.004);
    k.B(cx + 0.4, cv - 0.96, y0 + 0.35, 1.0, 0.62, 0.04, "#3a6a9a", 0.008); // (the odd door)
    k.B(cx - 1.15, cv, y0 + 0.95, 0.9, 0.05, 1.7, RUST, 0.01, 0, 0, -1.1); // (the bonnet, up)
    k.B(cx - 0.95, cv, y0 + 0.55, 0.6, 0.35, 0.9, "#3a3a3a", 0.01); // (the engine)
    for (const dv of [-0.65, 0.65]) k.cyl(cx - 1.31, cv + dv, y0 + 0.45, 0.22, 0.04, "#f4e2b8", 0, 10, "u");
    k.pic("rustTag", cx - 0.5, cv, y0 + 1.12, 0.36, 0.27, [-1, 0]); // (the job ticket on the windscreen)
    // the engine hoist: an A-frame over the open bonnet, its chain down to the engine
    for (const dv of [-0.8, 0.8]) k.B(cx - 1.85, cv + dv * 0.6, F + 1.1, 0.08, 2.2, 0.08, YEL, 0.006, 0, dv * 0.3);
    k.B(cx - 1.4, cv, F + 2.15, 1.1, 0.09, 0.09, YEL, 0.006); k.cyl(cx - 0.95, cv, F + 1.65, 0.04, 0.9, "#5a5a60", 0, 4);
    for (const dv of [-0.5, 0.5]) k.B(cx - 1.85, cv + dv, F + 0.06, 0.08, 0.08, 0.9, YEL, 0.004, 0, 0, 0);
    // its wheels, leaning on the side wall
    for (let i = 0; i < 4; i++) k.cyl(W - T - 0.18, 0.9 + i * 0.6, F + 0.36, 0.72, 0.22, "#1b1a1e", 0.012, 14, "u"); }
  // the workbench (solid) along the side wall: a vice, a toolbox, the pegboard of tools above, a lamp
  k.skin(8.6, 9.14, 4.2, 7.6, 0.9, 0.96, "wood", "#a8865a", 0.008); k.box(8.62, 9.12, 4.25, 7.55, F, 0.9, "#4a4a50", 0.01);
  k.B(8.85, 4.7, 1.07, 0.2, 0.18, 0.3, "#3a6a9a", 0.006); k.B(8.85, 6.3, 1.06, 0.3, 0.16, 0.5, "#c83a2a", 0.006);
  k.box(W - T - 0.04, W - T, 4.3, 7.5, 1.3, 2.5, "#c8a878", 0.004);
  for (let i = 0; i < 9; i++) k.B(W - T - 0.07, 4.55 + i * 0.33, 1.7 + (i % 3) * 0.25, 0.02, 0.36, 0.05, ["#c8ccd4", "#c83a2a", "#3a3a40"][i % 3], 0.003);
  k.B(8.4, 7.85, F + 0.45, 0.5, 0.9, 0.45, "#c83a2a", 0.01); for (let i = 0; i < 4; i++) k.box(8.16, 8.64, 7.62, 7.63, F + 0.15 + i * 0.2, F + 0.17 + i * 0.2, "#c8ccd4", 0); // (the tool chest)
  // the rummage skip (the dig spot, solid): yellow steel, scrap piled up out of it, its sign
  { const [u, v] = dg;
    k.box(7.0, 8.4, 5.0, 6.2, F, 0.95, YEL, 0.012); k.box(6.98, 8.42, 4.98, 6.22, 0.9, 0.97, "#c89820", 0.006);
    for (let q = 0; q < 26; q++) { const a = k.rnd() * 6.3, r = k.rnd() * 0.55;
      k.B(u + Math.cos(a) * r, v + Math.sin(a) * r * 0.7, 0.95 + k.rnd() * 0.3, 0.15 + k.rnd() * 0.35, 0.08 + k.rnd() * 0.18, 0.15 + k.rnd() * 0.3, ["#7a4a2a", STEEL, "#5a5a60", RUST, "#3a6a8a", "#c8ccd4"][q % 6], 0.006, k.rnd() * 3, (k.rnd() - 0.5) * 0.7, (k.rnd() - 0.5) * 0.7); }
    k.pic("rustSkip", u, 4.97, 0.6, 1.5, 0.375, [0, -1]); }
  // the racking at the back of the bay (the shelf): tyres, gearboxes, a radiator
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.rustbucket.shelves[0];
    k.box(u0, u1, v0, v1, h - 0.05, h, STEEL, 0.008); k.box(u0, u1, v0, v1, 0.45, 0.5, STEEL, 0.008); for (const u of [u0 + 0.05, u1 - 0.05]) k.box(u - 0.04, u + 0.04, v0, v1, F, 2.0, "#e8902a", 0.006);
    k.box(u0, u1, v0, v1, 1.95, 2.0, STEEL, 0.008);
    goods(k, u0 + 0.2, u1 - 0.2, (v0 + v1) / 2, 0.5, 7, ["#c8ccd4", RUST, "#3a6a8a", "#5a5a60"], "can");
    for (let i = 0; i < 3; i++) k.cyl(u0 + 0.6 + i * 1.0, (v0 + v1) / 2, 1.0 + 0.36, 0.7, 0.22, "#1b1a1e", 0.01, 14, "v"); }
  for (let i = 0; i < 3; i++) k.cyl(6.1, 7.4, F + 0.13 + i * 0.26, 0.8, 0.26, "#1b1a1e", 0.012, 14);
  k.cyl(6.15, 8.4, F + 0.45, 0.6, 0.9, "#2f6a8a", 0.012, 14); k.cyl(6.15, 8.4, F + 0.91, 0.62, 0.03, "#c8ccd4", 0, 14);
  // the workshop's roof steel: three beams across, a chain hoist on the middle one
  for (const v of [2.5, 5.0, 7.5]) { k.box(5.6, W - T, v - 0.08, v + 0.08, H - 0.32, H - 0.02, "#4a4a50", 0.008); k.box(5.6, W - T, v - 0.02, v + 0.02, H - 0.5, H - 0.3, "#4a4a50", 0.004); }
  k.cyl(7.3, 2.5, H - 1.0, 0.05, 1.0, "#5a5a60", 0, 4); k.B(7.3, 2.5, H - 1.55, 0.14, 0.18, 0.05, "#5a5a60", 0.004);
  void dg;
}

function plugpray(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, GREY = "#5a5248", TEAL = "#2a4a52", rc = STORE_SHELLS.plugpray.recess!, top = storeTop(k.s);
  k.skin(T, W - T, T, D - T, F + 0.004, F + 0.016, "panel", "#34403e", 0); // (worn lino)
  // ================================ OUTSIDE: a teal shopfront under two floors of flats; the corner's painted ad, a blade sign
  k.outside(() => {
    for (const u of [0.2, 2.6, W - 0.27]) k.box(u - 0.2, u + 0.2, -0.12, 0, 0, H, TEAL, 0.012);
    k.box(2.8, 8.9, -0.1, 0, 0, 0.6, TEAL, 0.008); k.box(2.8, 8.9, -0.14, 0, 0.58, 0.64, "#c8ccd4", 0.006);
    // the recessed door: checked tiles, a price notice and the ticket rules on its sides
    for (let a = 0; a < 6; a++) for (let b = 0; b < 3; b++) k.box(rc.u0 + 0.2 + a * (rc.u1 - rc.u0 - 0.4) / 6, rc.u0 + 0.2 + (a + 1) * (rc.u1 - rc.u0 - 0.4) / 6, b * rc.depth / 3, (b + 1) * rc.depth / 3, 0.15, 0.17, (a + b) % 2 ? "#e8e4d8" : TEAL, 0);
    k.pic("plugPrices", rc.u0 + 0.225, rc.depth / 2, 1.5, 0.55, 0.69, [1, 0]);
    // the corner: the old painted ad on the ground floor's side, a blade sign (FIX!) on its bracket
    k.pic("plugGhost", -0.03, D / 2 + 0.4, 2.15, 7.2, 2.7, [-1, 0]);
    k.box(0.2, 0.3, -0.75, 0, 5.6, 5.68, "#3a3a40", 0.006); k.box(0.21, 0.29, -0.7, -0.62, 3.9, 5.7, "#3a3a40", 0.004);
    k.pic("plugBlade", 0.25, -0.5, 4.8, 0.45, 1.8, [1, 0], true); k.pic("plugBlade", 0.25, -0.5, 4.8, 0.45, 1.8, [-1, 0], true);
    // on the roof: a dish and a forest of aerials (somebody upstairs is testing tellies)
    k.cyl(2.0, D - 2.0, top + 1.3, 0.06, 1.0, "#5a5a60", 0, 6); k.cyl(2.0, D - 2.2, top + 1.9, 1.0, 0.08, "#e8e4d8", 0.008, 16, "v", 0.9);
    for (const [u, h] of [[5.5, 2.2], [6.8, 1.6], [7.6, 2.6]] as const) { k.cyl(u, D - 3, top + 0.82 + h / 2, 0.05, h, "#5a5a60", 0, 4); for (let q = 0; q < 3; q++) k.box(u - 0.5 + q * 0.1, u + 0.5 - q * 0.1, D - 3.02, D - 2.98, top + 0.82 + h - 0.2 - q * 0.25, top + 0.84 + h - 0.2 - q * 0.25, "#5a5a60", 0); }
  });
  // the window: a wall of stacked tellies, all on (static, test cards, NO SIGNAL), facing the street
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const u = 3.3 + i * 0.97, y = 0.85 + row * 0.6;
    k.B(u, 0.55, y, 0.86, 0.54, 0.5, row % 2 ? "#3a3640" : GREY, 0.012);
    k.pic("screens", u, 0.295, y + 0.02, 0.66, 0.42, [0, -1], true, [((i + row) % 4) / 4, 0, ((i + row) % 4 + 1) / 4, 1]);
  }
  // THE LEFT WALL: refurbished stock for sale at the front, the jobs awaiting repair behind the counter (yellow tickets)
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.plugpray.shelves[0];
    for (const y of [0.45, 0.85, h]) k.box(u0, u1, v0, v1, y - 0.04, y, "#7a6a5a", 0.008);
    for (const vv of [v0 + 0.05, 5.9, v1 - 0.05]) k.box(u0, u1, vv - 0.04, vv + 0.04, F, h + 0.6, "#4a3a2a", 0.006);
    goods(k, (u0 + u1) / 2, 0, v0 + 0.3, 0.45, 4, ["#c8ccd4", "#e8463a", "#ffd54a"], "box", true, 5.6);
    goods(k, (u0 + u1) / 2, 0, v0 + 0.3, 0.85, 4, ["#3a3640", "#f4f1ea", "#2fa4a0"], "box", true, 5.6);
    for (let i = 0; i < 4; i++) k.B(u1 + 0.01, v0 + 0.5 + i * 0.6, 0.62, 0.02, 0.08, 0.14, "#43c7a6", 0); // (price tags)
    for (let i = 0; i < 9; i++) { const vv = 6.4 + (i % 5) * 0.62, y = i < 5 ? 0.45 : 0.85; k.B((u0 + u1) / 2, vv, y + 0.14, 0.4, 0.28, 0.42, ["#c8ccd4", "#5a5248", "#e8463a", "#3a3640"][i % 4], 0.006, (k.rnd() - 0.5) * 0.4); k.B(u1 + 0.01, vv, y + 0.24, 0.02, 0.14, 0.1, "#ffd54a", 0); }
    k.pic("plugZones", u1 + 0.02, 4.4, h + 0.4, 1.9, 0.23, [1, 0], false, [0, 0, 1, 1 / 3]);
    k.pic("plugZones", u1 + 0.02, 7.7, h + 0.4, 1.9, 0.23, [1, 0], false, [0, 1 / 3, 1, 2 / 3]); }
  // THE INTAKE COUNTER: laminate, the ticket spike, the bell, a kettle being booked in, the job that's ready (Mrs Binks's)
  { const [c0, c1, cv0, cv1] = STORE_SHELLS.plugpray.counter, cm = (cv0 + cv1) / 2;
    k.box(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.05, "#b8b4a8", 0.01); k.box(c0, c1, cv0 - 0.02, cv0, F, 0.98, "#3a6a8a", 0.004);
    k.pic("plugZones", (c0 + c1) / 2, cv0 - 0.04, 0.7, 2.2, 0.27, [0, -1], false, [0, 2 / 3, 1, 1]); // (READY FOR COLLECTION, on its front)
    k.cyl(c0 + 0.3, cm, 1.12, 0.06, 0.06, "#3a3a40", 0, 8); k.cyl(c0 + 0.3, cm, 1.22, 0.012, 0.2, "#c8ccd4", 0, 4); k.B(c0 + 0.3, cm, 1.18, 0.1, 0.03, 0.08, "#ffd54a", 0);
    k.cyl(c0 + 0.7, cm, 1.1, 0.14, 0.08, "#d9b45a", 0.004, 10, "y", 0.04);
    k.cyl(c0 + 1.5, cm, 1.16, 0.22, 0.24, "#c8ccd4", 0.006, 12); k.B(c0 + 1.5, cm - 0.14, 1.12, 0.06, 0.1, 0.02, "#ffd54a", 0);
    k.B(c1 - 0.6, cm, 1.15, 0.36, 0.2, 0.24, "#e8463a", 0.006); k.pic("plugReady", c1 - 0.6, cm - 0.14, 1.32, 0.28, 0.14, [0, -1]); }
  // THE BENCH (solid) along the back: the technician's: a magnifier lamp, a soldering station, a telly with its back off,
  // a radio's insides; the tickets on the board above it; the spare-parts drawers on the side wall
  { const u0 = 1.4, u1 = 7.4, v0 = 8.9, v1 = 9.6;
    k.box(u0, u1, v0, v1, F, 0.9, "#6a5a4a", 0.012); k.skin(u0, u1, v0, v1, 0.9, 0.96, "wood", "#a8865a", 0.008);
    k.pic("plugTickets", 3.2, D - T - 0.03, 2.2, 2.6, 0.97, [0, -1]);
    k.box(4.8, 7.2, D - T - 0.04, D - T, 1.3, 2.6, "#c8a878", 0.004);
    for (let q = 0; q < 8; q++) k.B(5.0 + q * 0.28, D - T - 0.07, 1.6 + (q % 3) * 0.32, 0.05, 0.3, 0.03, ["#e8463a", "#ffd54a", "#3a3640", "#2fa4a0"][q % 4], 0.004);
    k.B(2.4, 9.25, 1.15, 0.6, 0.4, 0.45, GREY, 0.008); k.B(2.4, 9.0, 1.15, 0.5, 0.32, 0.02, "#2a2a30", 0); // (a telly, its back off)
    for (let q = 0; q < 5; q++) k.B(2.25 + q * 0.07, 9.48, 1.1 + (q % 2) * 0.08, 0.02, 0.2, 0.02, ["#e8463a", "#ffd54a", "#2fa4a0"][q % 3], 0, 0, 0.4);
    k.B(4.0, 9.2, 1.02, 0.4, 0.1, 0.3, "#e8463a", 0.006); k.cyl(4.25, 9.2, 1.12, 0.02, 0.28, "#c8ccd4", 0, 4, "y"); // (the soldering station)
    k.cyl(3.3, 9.4, 1.35, 0.03, 0.8, "#3a3a40", 0, 4); k.cyl(3.3, 9.1, 1.72, 0.3, 0.06, "#3a3a40", 0.004, 14, "y", 0.24); k.bulb(3.3, 9.1, 1.69, 0.1, "#f4f8ff"); // (the magnifier lamp)
    k.B(5.6, 9.25, 1.06, 0.6, 0.14, 0.4, "#c8a878", 0.006); k.B(5.6, 9.25, 1.15, 0.5, 0.04, 0.3, "#2f8a3a", 0.003); // (a radio, opened)
    k.cyl(3.6, 8.4, F + 0.35, 0.36, 0.06, "#3a3a40", 0.006, 12); k.cyl(3.6, 8.4, F + 0.17, 0.05, 0.34, "#c8ccd4", 0, 6); }
  { const u1 = W - T, u0 = u1 - 0.45; k.box(u0, u1, 6.6, 7.9, F, 1.6, "#7a8a90", 0.01); k.pic("plugDrawers", u0 - 0.01, 7.25, 0.95, 1.2, 1.2, [-1, 0]); }
  k.pic("plugPrices", W - T - 0.03, 4.2, 1.8, 0.7, 0.88, [-1, 0]);
  // THE GUTTED ARCADE CABINET (part of the workshop: on the bench's end, its side off, the work lamp on it, wires to the bench)
  { const cu = 8.1, cv = 8.6, y0 = F;
    k.B(cu, cv, y0 + 0.95, 0.95, 1.9, 0.8, "#1b1420", 0.012);
    k.pic("arcadeSide", cu + 0.49, cv, y0 + 1.05, 0.7, 1.4, [1, 0]);
    k.B(cu - 0.48, cv, y0 + 0.9, 0.04, 1.3, 0.6, "#3a3444", 0.004); // (its other side's panel off: the guts)
    for (let i = 0; i < 6; i++) k.B(cu - 0.44, cv - 0.2 + i * 0.08, y0 + 0.6 + (i % 3) * 0.3, 0.02, 0.4, 0.02, ["#e8463a", "#ffd54a", "#2fa4a0", "#f4f1ea"][i % 4], 0, 0, 0, 0.3);
    k.pic("arcade", cu, cv - 0.41, y0 + 1.45, 0.62, 0.55, [0, -1], true);
    k.B(cu, cv - 0.5, y0 + 1.0, 0.85, 0.08, 0.35, "#3a3444", 0.006, 0, 0.35); k.cyl(cu - 0.2, cv - 0.55, y0 + 1.1, 0.06, 0.12, "#e8463a", 0, 8);
    k.bulb(cu - 0.3, cv - 0.42, y0 + 1.84, 0.07, "#ff5fa8"); k.bulb(cu + 0.3, cv - 0.42, y0 + 1.84, 0.07, "#43e0c6");
    k.B(cu - 0.4, cv - 0.6, y0 + 2.05, 0.3, 0.06, 0.06, "#3a3a40", 0.004, 0, 0, 0.5); k.bulb(cu - 0.5, cv - 0.65, y0 + 1.98, 0.09, "#f4f8ff"); }
  // the ceiling: extension leads in loops, a clock that's always wrong
  for (let i = 0; i < 4; i++) { const u = 2.0 + i * 1.8, v = 3 + (i % 2) * 2; k.cyl(u, v, H - 0.6, 0.03, 1.2, ["#f4f1ea", "#ff7a1a", "#1b1420"][i % 3], 0, 4); k.B(u, v, H - 1.25, 0.1, 0.12, 0.06, "#f4f1ea", 0.004); }
  k.cyl(W - T - 0.03, 5.5, 3.2, 0.7, 0.04, "#f4f1ea", 0.008, 22, "u"); k.B(W - T - 0.06, 5.5, 3.27, 0.02, 0.26, 0.04, "#1b1420", 0); k.B(W - T - 0.06, 5.6, 3.2, 0.02, 0.04, 0.2, "#1b1420", 0);
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
    // R13b: the sign arrangement: the fascia, a blade sign out over the pavement by the pub, the old name on the parapet
    k.box(0.15, 0.25, -0.85, 0, 4.15, 4.23, "#1b1420", 0.006); k.box(0.16, 0.24, -0.8, -0.72, 2.45, 4.2, "#1b1420", 0.004);
    k.pic("ndBlade", 0.2, -0.58, 3.3, 0.42, 1.68, [1, 0]); k.pic("ndBlade", 0.2, -0.58, 3.3, 0.42, 1.68, [-1, 0]);
    { const tp = storeTop(k.s); k.pic("ndParapet", W / 2, -0.24, tp + 0.46, W - 1.0, 0.44, [0, -1]); }
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
  k.skin(T, W - T, T + 0.02, D - T, F, F + 0.015, "boards", "#4a2c16", 0); // (R13b: Blake: "floor too bright")
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
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { const v = 2.6 + i * 1.12, y = 1.8 + row * 0.62;
      k.B(u - 0.005, v, y, 0.02, 0.56, 0.56, INK, 0.004);
      k.pic("sleeves", u - 0.03, v, y, 0.5, 0.5, [-1, 0], false, [((i + row) % 4) / 4, ((row * 2 + i) % 4) / 4, ((i + row) % 4 + 1) / 4, ((row * 2 + i) % 4 + 1) / 4]); }
    k.box(W - T - 0.35, W - T, 2.2, 6.9, 1.18, 1.22, OAK, 0.008); // (a ledge of new arrivals, leaning on the wall)
    for (let i = 0; i < 8; i++) k.B(W - T - 0.16, 2.45 + i * 0.58, 1.38, 0.02, 0.32, 0.32, sleeveCol(), 0.004, 0, 0, 0.18); }
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
      let u = 1.25; while (u < W - 1.3) { if (u > W / 2 - 1.1 && u < W / 2 + 1.1) { u = W / 2 + 1.1; continue; } const w = 0.006 + k.rnd() * 0.012; k.box(u, u + w, D - T - 0.32, D - T - 0.02, y + 0.03, y + 0.34, sleeveCol(), 0); u += w + 0.002; } }
    // the speakers (either end of the back wall)
    for (const u of [0.85, W - 0.85]) { k.box(u - 0.35, u + 0.35, D - T - 0.55, D - T, 0, 1.3, "#1e1c22", 0.012); k.cyl(u, D - T - 0.56, 0.4, 0.42, 0.03, "#3a3842", 0.004, 16, "v"); k.cyl(u, D - T - 0.56, 0.95, 0.24, 0.03, "#3a3842", 0.004, 14, "v"); }
  }
  // THE LISTENING BOOTH (the centrepiece): a little oak room in the back right corner, glass to the shop, a doorway; a
  // stool, a deck on a shelf, headphones hanging on hooks, a lamp, a sign on top
  { const u0 = 9.0, v0 = 7.4, u1 = W - T, v1 = D - T, top = 2.5, F2 = STORE_FLOOR;
    k.skin(u0, u0 + 0.12, v0, v1 - 1.2, F2, F2 + top, "wood", OAK2, 0.012); // (its side to the shop: glass above the waist, the doorway at the back)
    k.skin(u0, u0 + 0.12, v1 - 1.2, v1, F2 + 2.1, F2 + top, "wood", OAK2, 0.012); // (over the doorway)
    k.skin(u0, u1, v0, v0 + 0.12, F2, F2 + top, "wood", OAK2, 0.012);
    k.skin(u0 - 0.04, u1, v0 - 0.04, v1, F2 + top, F2 + top + 0.1, "wood", OAK, 0.012); // (its roof)
    k.glassBox(u0 - 0.01, u0 + 0.13, v0 + 0.3, v1 - 1.2, F2 + 1.0, F2 + top - 0.15); // (the window into it: the browse spot looks in)
    k.box(u0 - 0.03, u0 + 0.15, v0 + 0.25, v1 - 1.15, F2 + 0.95, F2 + 1.02, OAK, 0.006);
    k.pic("boothSign", (u0 + u1) / 2, v0 - 0.03, F2 + top + 0.35, 1.9, 0.48, [0, -1], true);
    k.box((u0 + u1) / 2 - 0.9, (u0 + u1) / 2 + 0.9, v0 - 0.02, v0 + 0.02, F2 + top + 0.08, F2 + top + 0.12, INK, 0);
    // inside: a shelf with a deck, the headphones on hooks, a stool, a little lamp, a poster
    k.box(u0 + 0.4, u1 - 0.1, v1 - 0.45, v1, F2 + 0.95, F2 + 1.0, OAK, 0.006);
    k.B((u0 + u1) / 2, v1 - 0.25, F2 + 1.05, 0.45, 0.08, 0.36, "#c8ccd4", 0.006); k.cyl((u0 + u1) / 2 - 0.05, v1 - 0.25, F2 + 1.1, 0.3, 0.02, INK, 0.004, 18); k.cyl((u0 + u1) / 2 - 0.05, v1 - 0.25, F2 + 1.115, 0.1, 0.01, TEAL, 0, 10);
    for (let i = 0; i < 3; i++) { const u = u0 + 0.5 + i * 0.55; k.cyl(u, v1 - 0.06, F2 + 1.75, 0.03, 0.12, "#c8ccd4", 0, 6, "v"); k.cyl(u, v1 - 0.16, F2 + 1.6, 0.22, 0.04, [PINK, TEAL, "#ffd54a"][i], 0.004, 14, "v", undefined); k.B(u, v1 - 0.16, F2 + 1.72, 0.04, 0.2, 0.04, INK, 0); }
    k.cyl(u0 + 1.0, v0 + 1.2, F2 + 0.35, 0.36, 0.06, "#7a2f3a", 0.006, 14); k.cyl(u0 + 1.0, v0 + 1.2, F2 + 0.17, 0.06, 0.34, "#c8ccd4", 0, 6);
    k.pic("posterTour", u1 - 0.03, (v0 + v1) / 2, F2 + 1.7, 0.55, 0.82, [-1, 0]);
    k.bulb(u0 + 0.7, v1 - 0.4, F2 + 2.2, 0.12, "#ffcc88"); }
  // HANGING THINGS: records on strings over the bins, a string of pennant bunting across the shop, a record clock
  for (const [u0, u1] of [[1.2, 3.4], [8.34, 10.54]] as const) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const u = u0 + 0.4 + i * (u1 - u0 - 0.8) / 2, v = 3.9 + j * 2.0, y = 2.9 + ((i + j) % 2) * 0.3;
    k.cyl(u, v, (y + H) / 2, 0.008, H - y, "#c8ccd4", 0, 3);
    k.cyl(u, v, y, 0.42, 0.012, INK, 0.004, 18, "v"); k.cyl(u, v, y, 0.14, 0.016, [PINK, TEAL, "#ffd54a", "#e8463a"][(i + j * 3) % 4], 0, 10, "v"); }
  for (let i = 0; i < 18; i++) { const t = i / 17, u = 1.0 + t * (W - 2.0), v = 2.2 + Math.sin(t * Math.PI) * 0.6, y = 3.6 - Math.sin(t * Math.PI) * 0.5;
    k.B(u, v, y - 0.14, 0.26, 0.26, 0.01, [PINK, TEAL, "#ffd54a", "#f4f1ea"][i % 4], 0, 0, 0, Math.PI / 4); }
  { const cu = W / 2 - 2.6, y = 3.0; k.cyl(cu, D - T - 0.03, y, 0.62, 0.025, INK, 0.006, 22, "v"); k.cyl(cu, D - T - 0.05, y, 0.2, 0.012, PINK, 0, 12, "v"); k.B(cu + 0.06, D - T - 0.07, y + 0.08, 0.025, 0.2, 0.01, "#f4f1ea", 0, 0, 0, -0.6); }
  // GUITARS on the left wall (between the posters and the cassettes): bodies, necks, headstocks, on hooks
  for (let i = 0; i < 3; i++) { const v = 5.5 + i * 0.6, u = T + 0.09, col = ["#c84a2a", "#1b1420", "#e8c050"][i];
    k.B(u, v, 1.75, 0.08, 0.5, 0.38, col, 0.008); k.B(u, v, 1.95, 0.08, 0.28, 0.3, col, 0.008); k.B(u, v, 2.35, 0.05, 0.6, 0.06, "#5a3a20", 0.004); k.B(u, v, 2.72, 0.05, 0.16, 0.09, INK, 0.004); }
  // R13b: THE ROUTE: a runner from the door past the $1 bin to the counter (the bins either side, the booth beyond)
  k.box(5.3, 6.45, 1.95, 4.75, F + 0.016, F + 0.024, "#5a1a2a", 0); k.box(5.3, 6.45, 6.05, 8.3, F + 0.016, F + 0.024, "#5a1a2a", 0);
  for (const [v0, v1] of [[1.95, 4.75], [6.05, 8.3]]) for (const u of [5.36, 6.39]) k.box(u - 0.03, u + 0.03, v0, v1, F + 0.017, F + 0.026, "#d9b45a", 0);
  // STAFF PICKS: three sleeves faced out in the middle of the back wall's spines (they break up the shelving)
  k.pic("ndPicks", W / 2, D - T - 0.36, 2.95, 1.1, 0.27, [0, -1]);
  for (let i = 0; i < 3; i++) { const u = W / 2 - 0.7 + i * 0.7; k.box(u - 0.29, u + 0.29, D - T - 0.08, D - T - 0.04, 1.3, 1.88, "#1b1420", 0.004); k.pic("sleeves", u, D - T - 0.09, 1.59, 0.5, 0.5, [0, -1], false, [(i + 1) / 4, 0.5, (i + 2) / 4, 0.75]); }
  // the way into the booth: a sign on its side by the doorway
  k.pic("ndListen", 8.97, 9.1, 1.9, 0.6, 0.3, [-1, 0]);
  // the listening chair by the window (a battered armchair) and a crate as a side table
  k.box(1.0, 1.9, 1.5, 2.3, F, 0.48, "#7a2f3a", 0.012); k.box(1.0, 1.9, 2.15, 2.4, 0.48, 1.1, "#7a2f3a", 0.012); for (const u of [1.0, 1.75]) k.box(u, u + 0.15, 1.5, 2.3, 0.48, 0.7, "#6a2832", 0.008);
  k.skin(2.1, 2.55, 1.6, 2.05, F, 0.5, "crate", "#c8a070", 0.008);
  void CREAM;
}

function peakfomo(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, PINE = "#6a4a2a", DARKP = "#3a2a1a", MOSS = "#3a6a4a", SHINGLE = "#3a4a3a", gTop = STORE_SHELLS.peakfomo.glassTop ?? 2.9;
  k.skin(T, W - T, T, D - T, F + 0.004, F + 0.016, "boards", "#4a3018", 0);
  // ================================ OUTSIDE: a lodge: a stone base, heavy timber framing, a deep canopy on posts
  k.outside(() => {
    for (const [u0, u1] of [[0, 4.7], [7.04, W]] as const) k.skin(u0, u1, -0.1, 0, 0, 0.55, "stone", "#9a9488", 0.008);
    for (const u of [0.25, 4.7, 7.04, W - 0.25]) k.box(u - 0.17, u + 0.17, -0.16, 0, 0, gTop + 0.35, PINE, 0.012);
    k.box(0, W, -0.16, 0, gTop, gTop + 0.35, DARKP, 0.012); // (the beam over the windows)
    // the canopy: shingles on a timber frame, on four posts with knee braces
    k.B(W / 2, -0.85, H - 0.65, W + 0.5, 0.12, 1.95, SHINGLE, 0.014, 0, 0.16);
    k.box(-0.25, W + 0.25, -1.85, -1.7, H - 0.95, H - 0.8, DARKP, 0.01);
    for (const u of [0.6, 4.4, 7.34, W - 0.6]) { k.cyl(u, -1.75, (H - 0.9) / 2, 0.2, H - 0.9, PINE, 0.012, 8); k.B(u, -1.35, H - 1.2, 0.1, 0.1, 0.75, PINE, 0.006, 0, 0.75); }
    k.box(4.4, 7.34, -1.85, 0, 0.15, 0.27, "#7a5a3a", 0.008); // (the porch boards at the door)
    // a fake pine either side of the door; a boot-scraper
    for (const pu of [4.0, 7.75]) { k.cyl(pu, -0.6, 0.3, 0.42, 0.3, "#7a4a2a", 0.008, 10); for (let q = 0; q < 4; q++) k.cyl(pu, -0.6, 0.7 + q * 0.38, 1.0 - q * 0.22, 0.55, MOSS, 0.01, 10, "y", 0.08); }
  });
  // THE EXPEDITION DISPLAY (in the left window, on the platform): a tent pitched, packs, boots, the route on an easel
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.peakfomo.shelves[0];
    k.box(u0, u1, v0, v1, F, h, "#7a5a3a", 0.01); k.skin(u0, u1, v0, v1, h - 0.02, h, "boards", "#5a3a20", 0);
    const tu = (u0 + u1) / 2 + 0.2, tv = (v0 + v1) / 2 + 0.2;
    k.prism("u", tu - 1.0, tu + 1.0, tu, tu, tv - 0.7, tv + 0.7, h, h + 1.15, "#e8902a", 0.012); k.prism("u", tu - 0.35, tu + 0.35, tu, tu, tv - 0.72, tv - 0.7, h, h + 0.6, "#3a2a1a", 0);
    for (const [du, col] of [[-1.25, "#e8463a"], [1.3, "#2f6a8a"]] as const) { k.B(tu + du, v0 + 0.5, h + 0.33, 0.42, 0.62, 0.32, col, 0.01); k.ball(tu + du, v0 + 0.5, h + 0.66, 0.36, col, 0.006, 3); k.B(tu + du, v0 + 0.32, h + 0.25, 0.3, 0.22, 0.05, "#1b1420", 0.004); }
    for (const du of [-0.55, -0.3]) { k.B(tu + du, v0 + 0.32, h + 0.08, 0.14, 0.14, 0.3, "#5a3a20", 0.006); k.B(tu + du, v0 + 0.25, h + 0.2, 0.14, 0.14, 0.12, "#5a3a20", 0.006); }
    k.B(u0 + 0.5, v0 + 0.55, h + 0.75, 0.04, 1.5, 0.04, PINE, 0.004, 0, -0.2); k.pic("peakMap", u0 + 0.5, v0 + 0.5, h + 1.15, 0.8, 0.6, [0, -1]); k.box(u0 + 0.1, u0 + 0.9, v0 + 0.55, v0 + 0.6, h + 0.82, h + 0.86, PINE, 0); }
  // HIKE: the left wall's shelves of packs, boots and flasks
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.peakfomo.shelves[1];
    k.box(u0, u1 + 0.05, v0, v1, F, h + 1.3, PINE, 0.008); k.box(u0, u0 + 0.05, v0, v1, F, h + 1.3, DARKP, 0);
    for (const y of [0.6, 1.05, h, h + 0.65]) k.box(u0, u1, v0, v1, y - 0.04, y, DARKP, 0.008);
    for (let i = 0; i < 5; i++) { const vv = v0 + 0.4 + i * 0.7, col = ["#e8463a", MOSS, "#2f6a8a", "#ffd54a", "#7a3fa0"][i]; k.B((u0 + u1) / 2, vv, h + 0.28, 0.4, 0.55, 0.45, col, 0.01); k.ball((u0 + u1) / 2, vv, h + 0.55, 0.4, col, 0.006, 4); }
    for (let i = 0; i < 6; i++) { const vv = v0 + 0.35 + i * 0.6; for (const dv of [-0.08, 0.08]) { k.B((u0 + u1) / 2, vv + dv, 0.67, 0.28, 0.12, 0.12, "#5a3a20", 0.004); k.B((u0 + u1) / 2 - 0.07, vv + dv, 0.78, 0.14, 0.14, 0.12, "#5a3a20", 0.004); } }
    goods(k, (u0 + u1) / 2, 0, v0 + 0.3, 1.05, 8, ["#c8ccd4", "#e8463a", MOSS], "bottle", true, v1 - 0.3);
    goods(k, (u0 + u1) / 2, 0, v0 + 0.3, h + 0.65, 7, ["#c89050", "#e8463a", MOSS], "jar", true, v1 - 0.3); }
  // CAMP: a rack of rolled sleeping bags, lanterns, a stove (by the trail-mix barrels)
  { const u0 = 5.6, u1 = 7.4, v0 = 3.0, v1 = 3.6;
    k.box(u0, u1, v0, v1, F, F + 0.08, DARKP, 0.006); for (const u of [u0 + 0.05, u1 - 0.05]) k.box(u - 0.04, u + 0.04, v0, v1, F, 1.6, PINE, 0.006); k.box(u0, u1, v0, v1, 0.8, 0.84, PINE, 0.006);
    for (let i = 0; i < 4; i++) k.cyl(u0 + 0.3 + i * 0.4, (v0 + v1) / 2, 0.5, 0.34, 0.5, ["#e8463a", "#2f6a8a", MOSS, "#e8902a"][i], 0.008, 10, "v");
    for (let i = 0; i < 3; i++) { k.cyl(u0 + 0.4 + i * 0.5, (v0 + v1) / 2, 1.0, 0.18, 0.26, MOSS, 0.004, 8); k.bulb(u0 + 0.4 + i * 0.5, (v0 + v1) / 2, 1.0, 0.1, "#ffd8a0"); } }
  for (const [u, v] of [[8.0, 5.3], [8.7, 5.3]]) { k.cyl(u, v, F + 0.45, 0.6, 0.9, "#8a6a3a", 0.012, 12); k.ball(u, v, F + 0.95, 0.5, "#c89050", 0, 3); }
  // CLIMB: the wall up to the ceiling on the right of the back wall: holds, a top rope and its anchor, a crash mat, the
  // chalk and harness rack beside it
  { const u0 = 6.3, u1 = W - T - 0.1, v = D - T;
    k.box(u0, u1, v - 0.14, v, F, H - 0.1, "#c8b89a", 0.012);
    for (let i = 1; i < 4; i++) k.box(u0 + i * (u1 - u0) / 4 - 0.02, u0 + i * (u1 - u0) / 4 + 0.02, v - 0.16, v - 0.14, F, H - 0.1, "#a89878", 0); // (panel joints)
    for (let q = 0; q < 44; q++) k.B(u0 + 0.2 + k.rnd() * (u1 - u0 - 0.4), v - 0.18, F + 0.4 + k.rnd() * (H - 1.0), 0.12 + k.rnd() * 0.1, 0.1 + k.rnd() * 0.08, 0.08, ["#e8463a", "#ffd54a", "#2fa4a0", "#7a3fa0", "#43c7a6", "#ff7a1a"][q % 6], 0.004, 0, 0, k.rnd() * 3);
    k.box(u0 + 1.4, u0 + 1.6, v - 0.3, v - 0.14, H - 0.35, H - 0.2, "#5a5a60", 0.004); k.cyl(u0 + 1.5, v - 0.45, (F + H - 0.3) / 2, 0.04, H - 0.4 - F, "#e8902a", 0, 4);
    k.box(u0, u1, v - 1.6, v - 0.16, F, F + 0.28, "#2f6a8a", 0.012); k.box(u0 + 0.05, u1 - 0.05, v - 1.55, v - 0.2, F + 0.28, F + 0.3, "#3a7a9a", 0);
    k.box(u0 - 0.8, u0 - 0.1, v - 0.12, v, 0.9, 2.2, PINE, 0.006); for (let i = 0; i < 4; i++) { k.cyl(u0 - 0.65 + i * 0.17, v - 0.2, 1.75, 0.03, 0.2, "#c8ccd4", 0, 4); k.B(u0 - 0.65 + i * 0.17, v - 0.22, 1.5, 0.12, 0.3, 0.06, ["#e8463a", "#2f6a8a", "#ffd54a", MOSS][i], 0.004); }
    k.cyl(u0 - 0.45, v - 0.3, 1.2, 0.2, 0.22, "#f4f1ea", 0.004, 10); }
  k.pic("mural", 3.1, D - T - 0.03, 2.4, 4.0, 2.0, [0, -1]);
  // the hanging zone boards (HIKE / CAMP / CLIMB), a kayak overhead
  for (const [u, v, c] of [[1.4, 6.0, 0], [6.5, 3.3, 1], [8.9, 8.6, 2]] as const) { k.cyl(u - 0.4, v, H - 0.35, 0.01, 0.7, "#3a3444", 0, 3); k.cyl(u + 0.4, v, H - 0.35, 0.01, 0.7, "#3a3444", 0, 3); k.pic("peakZones", u, v, H - 0.85, 1.1, 0.36, [0, -1], false, [c / 3, 0, (c + 1) / 3, 1]); k.pic("peakZones", u, v + 0.005, H - 0.85, 1.1, 0.36, [0, 1], false, [c / 3, 0, (c + 1) / 3, 1]); }
  k.B(4.0, 7.0, H - 0.7, 3.2, 0.3, 0.6, "#e8463a", 0.012); k.B(4.0, 7.0, H - 0.58, 0.8, 0.08, 0.45, "#1b1420", 0.004); for (const u of [2.7, 5.3]) k.cyl(u, 7.0, H - 0.3, 0.02, 0.5, "#3a3444", 0, 3);
  // the counter and the stockroom in the same timber: a log slab on crates, the map under glass, a bell; the STAFF ONLY door
  { const [c0, c1, cv0, cv1] = STORE_SHELLS.peakfomo.counter;
    k.skin(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.08, "timber", "#a8784a", 0.01); k.skin(c0, c1, cv0 - 0.02, cv0, F, 0.98, "crate", "#a8865a", 0.004);
    k.box(c0 + 0.2, c0 + 1.2, cv0 + 0.1, cv1 - 0.1, 1.08, 1.09, "#e8dcb0", 0); k.cyl(c1 - 0.3, (cv0 + cv1) / 2, 1.12, 0.14, 0.08, "#d9b45a", 0.004, 10, "y", 0.04);
    k.box(W - T - 0.5, W - T, 7.4, 9.6, F, 2.3, PINE, 0.01); for (const y of [0.8, 1.5]) k.box(W - T - 0.5, W - T, 7.4, 9.6, y - 0.04, y, DARKP, 0.006);
    for (let i = 0; i < 6; i++) k.B(W - T - 0.25, 7.7 + (i % 3) * 0.7, (i < 3 ? 0.8 : 1.5) + 0.18, 0.4, 0.34, 0.5, "#c8a070", 0.006); }
  k.box(5.45, 6.2, D - T - 0.05, D - T, F, 2.3, "#5a3a20", 0.008); k.pic("staffOnly", 5.82, D - T - 0.06, 1.8, 0.6, 0.22, [0, -1]);
}

// ---- HIGH END: SNOB ROW ---------------------------------------------------------------------------------------------

function maisonpong(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, BRONZE = "#7a5a32", IVORY = "#efe8da", STONE = "#e2dccf", BLUSH = "#f2c8c8", NICHE = "#2a2630";
  const gTop = STORE_SHELLS.maisonpong.glassTop ?? 2.9, rc = STORE_SHELLS.maisonpong.recess!;
  k.skin(T, W - T, T, D - T, F + 0.004, F + 0.016, "marble", "#e8e4dc", 0);
  // ================================ OUTSIDE: a stone ground floor with slim bronze framing, a restrained sign, a plaque
  k.outside(() => {
    for (const [u0, u1] of [[0.6, 3.4], [6.75, 9.55]] as const) {
      k.box(u0, u1, -0.08, 0, 0, 0.6, STONE, 0.008); // (the plinth)
      for (const u of [u0, (u0 + u1) / 2, u1]) k.box(u - 0.03, u + 0.03, -0.06, 0, 0.6, gTop, BRONZE, 0.004); // (slim bronze mullions)
      k.box(u0, u1, -0.06, 0, gTop - 0.03, gTop + 0.03, BRONZE, 0.004);
    }
    for (const u of [0.3, 9.85]) k.box(u - 0.3, u + 0.3, -0.1, 0, 0, H, STONE, 0.012);
    k.box(-0.1, W + 0.1, -0.14, 0, H - 0.25, H, STONE, 0.012); // (a cornice over the shopfront)
    k.pic("maisonPlaque", rc.u0 + 0.125, rc.depth * 0.5, 1.5, 0.5, 0.25, [1, 0]);
    k.box(rc.u0, rc.u1, 0, rc.depth, 0.15, 0.17, "#f4f0ea", 0); // (a marble step into the recess)
    // small iron balconies on the first floor's windows
    for (const u of [W * 0.2, W * 0.5, W * 0.8]) { const y = H + 0.3 + 0.75; k.box(u - 0.7, u + 0.7, -0.45, 0, y - 0.06, y, "#3a3a40", 0.006); k.box(u - 0.7, u + 0.7, -0.45, -0.42, y + 0.8, y + 0.85, "#1b1420", 0.004); for (let q = 0; q < 8; q++) k.box(u - 0.66 + q * 0.19, u - 0.64 + q * 0.19, -0.45, -0.43, y, y + 0.8, "#1b1420", 0); }
  });
  // the window displays: one plinth each, one big bottle on it, its poster on an easel behind
  for (const [u0, u1] of [[0.6, 3.4], [6.75, 9.55]] as const) { const um = (u0 + u1) / 2;
    k.skin(um - 0.45, um + 0.45, 0.45, 1.1, F, 0.9, "marble", "#f4f0ea", 0.008); k.cyl(um, 0.78, 1.15, 0.26, 0.5, "#e8c8e8", 0.004, 10); k.cyl(um, 0.78, 1.48, 0.1, 0.12, BRONZE, 0, 8); k.bulb(um, 0.78, 2.4, 0.08, "#fff4d8");
    k.pic("posterMaison", um, 1.35, 1.9, 0.9, 1.35, [0, -1]); for (const du of [-0.3, 0.3]) k.B(um + du, 1.42, 1.35, 0.03, 1.5, 0.03, BRONZE, 0, 0, 0.12);
    for (const u of [u0 + 0.2, u1 - 0.2]) k.box(u - 0.18, u + 0.18, 0.32, 0.45, F, gTop + 0.2, "#7a2040", 0.008); }
  // the walls: ivory pilasters, a dado; LIT NICHES (three a side), one bottle in each under its own small light
  for (const v of [2.4, 6.2, 10.0]) for (const u of [T + 0.06, W - T - 0.06]) k.box(u - 0.06, u + 0.06, v - 0.2, v + 0.2, F, H - 0.4, IVORY, 0.008);
  for (const [u0, u1] of [[T, T + 0.04], [W - T - 0.04, W - T]] as const) k.box(u0, u1, T, D - T, 1.0, 1.06, IVORY, 0);
  for (const [u, n] of [[T, 1], [W - T, -1]] as const) for (const v of [4.3, 8.1]) {
    k.box(u + (n > 0 ? 0 : -0.04), u + (n > 0 ? 0.04 : 0), v - 0.5, v + 0.5, 1.3, 2.6, NICHE, 0); // (the niche: dark, so the bottle glows)
    k.box(u + n * 0.02 - 0.02, u + n * 0.02 + 0.02, v - 0.54, v + 0.54, 1.26, 1.3, BRONZE, 0.003);
    k.box(u + n * 0.02 - 0.02, u + n * 0.02 + 0.02, v - 0.54, v + 0.54, 2.6, 2.64, BRONZE, 0.003);
    k.B(u + n * 0.2, v, 1.38, 0.3, 0.06, 0.6, BRONZE, 0.004); k.cyl(u + n * 0.2, v, 1.6, 0.18, 0.38, ["#e8c8e8", "#c8e4f0"][(v > 6 ? 1 : 0)], 0.004, 10); k.cyl(u + n * 0.2, v, 1.84, 0.07, 0.1, BRONZE, 0, 8);
    k.bulb(u + n * 0.08, v, 2.5, 0.07, "#fff4d8"); }
  // THE PERFUME FOUNTAIN (rescaled for eye level, further in): a low marble basin of pink water, a slim column, the bottle
  // at eye height, catching the chandelier's light
  { const cu = 5.07, cv = 4.6;
    k.cyl(cu, cv, F + 0.24, 1.3, 0.48, "#f4f0ea", 0.012, 24); k.cyl(cu, cv, F + 0.46, 1.14, 0.03, "#ff9ad0", 0, 24);
    k.cyl(cu, cv, F + 0.75, 0.2, 0.62, "#f4f0ea", 0.008, 12); k.cyl(cu, cv, F + 1.08, 0.36, 0.06, BRONZE, 0.004, 14);
    k.cyl(cu, cv, F + 1.3, 0.4, 0.38, "#f2c8d8", 0.01, 8, "y", 0.3); k.cyl(cu, cv, F + 1.53, 0.12, 0.1, "#f2c8d8", 0.004, 8); k.cyl(cu, cv, F + 1.66, 0.22, 0.16, BRONZE, 0.006, 8, "y", 0.16); // (the bottle: faceted glass, a bronze stopper)
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; k.cyl(cu + Math.cos(a) * 0.36, cv + Math.sin(a) * 0.36, F + 0.62, 0.03, 0.3, "#ffd0e8", 0, 4); } }
  // the pedestals: one bottle each under a glass bell
  for (const [u0, u1, v0, v1, h] of STORE_FIXTURES.maisonpong.shelves) { const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    k.skin(u0, u1, v0, v1, F, h, "marble", "#f4f0ea", 0.01); k.box(u0 - 0.02, u1 + 0.02, v0 - 0.02, v1 + 0.02, h - 0.03, h, BRONZE, 0.003);
    k.cyl(um, vm, h + 0.14, 0.16, 0.28, "#e8c8e8", 0.004, 10); k.cyl(um, vm, h + 0.32, 0.06, 0.08, BRONZE, 0, 8); }
  // THE CONSULTATION COUNTER: marble, a bronze edge, two velvet stools, a tray of testers, a little lamp
  { const [c0, c1, cv0, cv1] = STORE_SHELLS.maisonpong.counter, cm = (cv0 + cv1) / 2;
    k.skin(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.06, "marble", "#f4f0ea", 0.01); k.box(c0 - 0.06, c1 + 0.06, cv0 - 0.06, cv1 + 0.06, 0.98, 1.0, BRONZE, 0.004); k.box(c0, c1, cv0 - 0.02, cv0, F, 0.98, "#2a2228", 0.004);
    k.box(c0 + 0.3, c0 + 1.1, cv0 + 0.15, cv1 - 0.15, 1.06, 1.08, BRONZE, 0.003); goods(k, c0 + 0.35, c0 + 1.05, cm, 1.08, 4, ["#e8c8e8", "#c8e4f0", "#f4e2b8", BLUSH], "bottle");
    k.cyl(c1 - 0.4, cm, 1.25, 0.04, 0.36, BRONZE, 0, 6); k.cyl(c1 - 0.4, cm, 1.45, 0.26, 0.16, "#f4e8d0", 0.004, 12, "y", 0.14); k.bulb(c1 - 0.4, cm, 1.4, 0.08, "#fff0d0");
    for (const u of [c0 + 0.9, c1 - 0.9]) { k.cyl(u, cv0 - 0.55, F + 0.5, 0.42, 0.12, "#7a2040", 0.008, 14); k.cyl(u, cv0 - 0.55, F + 0.22, 0.06, 0.44, BRONZE, 0, 6); } }
  // THE LAUNCH (the back case): a row of the new bottle, its card on a stand, a spotlight on it
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.maisonpong.case!;
    k.breakable("storecase_maisonpong", () => { goods(k, u0 + 0.3, u1 - 0.3, (v0 + v1) / 2, h * 0.55, 7, ["#e8c8e8", "#e8c8e8", BLUSH], "bottle"); });
    k.pic("maisonLaunch", (u0 + u1) / 2, D - T - 0.03, h + 0.75, 1.5, 0.75, [0, -1]); k.bulb((u0 + u1) / 2, v0 - 0.2, H - 0.3, 0.1, "#fff4d8"); }
  // the chandelier (smaller, ivory and crystal), the drapes
  const cu = W / 2, cv = D * 0.45, cy = H - 1.2;
  k.cyl(cu, cv, cy, 0.9, 0.05, IVORY, 0.006, 22); k.cyl(cu, cv, (cy + H) / 2, 0.03, H - cy, BRONZE, 0, 4);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283; k.bulb(cu + Math.cos(a) * 0.45, cv + Math.sin(a) * 0.45, cy - 0.08, 0.09, "#fff4d8"); k.cyl(cu + Math.cos(a) * 0.45, cv + Math.sin(a) * 0.45, cy - 0.26, 0.04, 0.2, "#e8f4ff", 0, 6); }
}

function bonbon(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, PINK = "#e85a8a", CHOC = "#5a2e1a", CHOC2 = "#3a1a0e", CREAM = "#fff4e8", MINT = "#bfe8d8", gTop = STORE_SHELLS.bonbon.glassTop ?? 2.9;
  // the floor: big pink and cream checks; the walls quiet cream, the stripes only on the back wall behind the counter
  for (let i = 0; i < Math.floor((W - 2 * T) / 0.8); i++) for (let j = 0; j < Math.floor((D - 2 * T) / 0.8); j++) k.box(T + i * 0.8, T + (i + 1) * 0.8, T + j * 0.8, T + (j + 1) * 0.8, F + 0.004, F + 0.016, (i + j) % 2 ? "#f8d8e2" : "#fff8f4", 0);
  for (const [u0, u1] of [[T, T + 0.03], [W - T - 0.03, W - T]] as const) { k.box(u0, u1, T, D - T, F, 1.0, "#f4c8d4", 0); k.box(u0, u1, T, D - T, 1.0, 1.06, CREAM, 0); k.box(u0, u1, T, D - T, 1.06, H - 0.3, "#fff4ec", 0); }
  k.pic("stripes", W / 2, D - T - 0.03, 2.6, W - 0.8, 3.6, [0, -1]);
  // ================================ OUTSIDE: cream joinery, a pink riser, a refined awning with a scalloped edge
  k.outside(() => {
    for (const u of [0.25, 2.25, W - 0.25]) k.box(u - 0.2, u + 0.2, -0.12, 0, 0, H, CREAM, 0.012);
    k.box(2.5, 9.65, -0.1, 0, 0, 0.55, PINK, 0.008); k.box(2.5, 9.65, -0.14, 0, 0.53, 0.6, CREAM, 0.006);
    const n = 8, a0 = 2.5, a1 = W - 0.5, y = gTop + 0.15;
    for (let i = 0; i < n; i++) { const u0 = a0 + i * (a1 - a0) / n, u1 = u0 + (a1 - a0) / n; k.B((u0 + u1) / 2, -0.55, y, u1 - u0, 0.05, 1.15, i % 2 ? "#ffffff" : PINK, 0.006, 0, 0.38);
      for (const h2 of [0, 0.5]) { const p0 = u0 + h2 * (u1 - u0), p1 = p0 + (u1 - u0) / 2; k.prism("u", p0, p1, (p0 + p1) / 2, (p0 + p1) / 2, -1.12, -1.07, y - 0.22, y - 0.42, i % 2 ? "#ffffff" : PINK, 0.004); } } // (the valance: little points)
    k.box(a0, a1, -0.08, 0, y + 0.1, y + 0.2, CREAM, 0.006);
    k.box(0.5, 2.0, -0.6, 0, 2.7, 2.78, CREAM, 0.008); // (a little canopy over the door)
  });
  // THE WINDOW: a curated display: three cake stands, a giant lollipop, the board of the day, jars on the ledge behind
  k.box(2.6, W - 0.6, 0.32, 1.0, F, 0.7, "#f8e8ee", 0.012);
  for (const [u, tiers] of [[3.6, 3], [5.6, 2], [7.8, 3]] as const) { let y = 0.7;
    for (let t = 0; t < tiers; t++) { const d = 0.7 - t * 0.18; k.cyl(u, 0.65, y + 0.1, 0.05, 0.2, CREAM, 0, 6); k.cyl(u, 0.65, y + 0.22, d, 0.03, CREAM, 0.004, 16); y += 0.24;
      for (let q = 0; q < 6 - t; q++) { const a = (q / (6 - t)) * 6.283; k.cyl(u + Math.cos(a) * d * 0.33, 0.65 + Math.sin(a) * d * 0.33, y, 0.11, 0.07, ["#ff9ad0", MINT, "#ffd54a", "#c8a0e8"][(q + t) % 4], 0.002, 10); } } }
  k.cyl(9.0, 0.7, 1.4, 0.03, 1.4, CREAM, 0, 4); k.cyl(9.0, 0.7, 2.2, 0.7, 0.06, "#ff5fa8", 0.006, 20, "v"); k.cyl(9.0, 0.68, 2.2, 0.4, 0.07, "#ffffff", 0, 16, "v");
  k.B(4.6, 0.75, 1.25, 0.04, 0.6, 0.04, CREAM, 0, 0, 0.15); k.pic("bonbonToday", 4.6, 0.72, 1.2, 0.5, 0.375, [0, -1]);
  k.pic("jarsBonbon", (2.6 + W - 0.6) / 2, 0.98, 0.95, W - 3.6, (W - 3.6) / 8, [0, -1], false, [0, 0.5, 1, 1]);
  // the truffle case's goods; the macaron shelf
  { const [u0, u1, v0, , h] = STORE_FIXTURES.bonbon.case!;
    k.breakable("storecase_bonbon", () => { for (let i = 0; i < 12; i++) k.ball(u0 + 0.25 + (i % 6) * (u1 - u0 - 0.5) / 5, v0 + 0.25 + Math.floor(i / 6) * 0.3, h * 0.55 + 0.06, 0.11, [CHOC, CHOC2, "#d9b45a"][i % 3], 0.003, 2); }); }
  { const [u0, u1, v0, v1, h] = STORE_FIXTURES.bonbon.shelves[0];
    k.box(u0, u1, v0, v1, F, h, "#fff4f8", 0.01); k.box(u0 - 0.03, u1 + 0.03, v0 - 0.03, v1 + 0.03, h - 0.04, h, PINK, 0.004);
    for (let t = 0; t < 3; t++) { const u = u0 + 0.4 + t * 0.9; for (let q = 0; q < 6; q++) k.cyl(u, (v0 + v1) / 2, h + 0.04 + q * 0.07, 0.3 - q * 0.035, 0.06, ["#ff9ad0", "#9fe3ff", "#ffd54a", "#c8f0a0"][(q + t) % 4], 0.003, 12); } }
  // THE COUNTER with THE CHOCOLATE TOWER at its end (on a round plinth that's part of the counter), candy-cane posts
  { const [c0, c1, cv0, cv1] = STORE_SHELLS.bonbon.counter, cm = (cv0 + cv1) / 2;
    k.box(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.05, CREAM, 0.01); k.box(c0, c1, cv0 - 0.02, cv0, F, 0.98, PINK, 0.004);
    k.cyl(c0 - 0.2, cm, F + 0.65, 0.14, 1.3, "#ffffff", 0.006, 10); for (let i = 0; i < 5; i++) k.cyl(c0 - 0.2, cm, F + 0.15 + i * 0.25, 0.15, 0.08, "#e8302a", 0, 10); k.ball(c0 - 0.2, cm, F + 1.35, 0.2, "#e8302a", 0.004, 3);
    k.cyl(c0 + 0.8, cm, 1.15, 0.05, 0.2, CREAM, 0, 6); k.cyl(c0 + 0.8, cm, 1.26, 0.5, 0.03, CREAM, 0.004, 16); k.cyl(c0 + 0.8, cm, 1.38, 0.35, 0.22, "#ff9ad0", 0.006, 16);
    const tu = 9.0, tv = 7.6;
    k.cyl(tu, tv, F + 0.42, 1.3, 0.84, CREAM, 0.012, 22); k.cyl(tu, tv, F + 0.86, 1.36, 0.06, PINK, 0.004, 22);
    [[1.0, 0.5], [0.76, 0.42], [0.5, 0.36]].reduce((y, [d, h]) => { k.cyl(tu, tv, y + h / 2, d, h, CHOC, 0.012, 20); k.cyl(tu, tv, y + h - 0.04, d + 0.04, 0.08, "#ff9ad0", 0.004, 20);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; k.ball(tu + Math.cos(a) * d / 2, tv + Math.sin(a) * d / 2, y + h + 0.03, 0.09, i % 2 ? CHOC2 : "#d9b45a", 0, 2); } return y + h; }, F + 0.9);
    k.ball(tu, tv, F + 2.25, 0.22, "#e8302a", 0.006, 4); k.B(tu, tv, F + 2.38, 0.08, 0.06, 0.08, "#3a8a3a", 0); }
  // THE WRAPPING BENCH behind the counter: ribbon reels on a rail, a paper roll, boxes, the half-wrapped order for the Mayor
  { const u0 = 2.2, u1 = 7.6, v0 = D - T - 0.6, v1 = D - T;
    k.box(u0, u1, v0, v1, F, 0.95, CREAM, 0.01); k.box(u0 - 0.02, u1 + 0.02, v0 - 0.02, v1, 0.95, 1.0, PINK, 0.004);
    k.cyl((u0 + u1) / 2 - 1.4, v1 - 0.12, 1.25, 0.02, 1.8, "#c8ccd4", 0, 4, "u"); for (let i = 0; i < 6; i++) k.cyl((u0 + u1) / 2 - 2.1 + i * 0.28, v1 - 0.12, 1.25, 0.2, 0.08, ["#e8302a", "#ffd54a", "#43c7a6", PINK, "#c8a0e8", "#ffffff"][i], 0.004, 12, "u");
    k.cyl(u1 - 0.6, v1 - 0.2, 1.12, 0.22, 0.9, "#fff4f8", 0.006, 12, "u");
    for (let i = 0; i < 3; i++) k.B(u0 + 0.5 + i * 0.1, v0 + 0.3, 1.05 + i * 0.2, 0.42, 0.18, 0.32, ["#ff9ad0", MINT, "#ffffff"][i], 0.004);
    k.B(4.6, v0 + 0.3, 1.1, 0.5, 0.2, 0.36, "#ffffff", 0.006); k.B(4.6, v0 + 0.3, 1.21, 0.06, 0.02, 0.37, "#e8302a", 0); k.B(4.6, v0 + 0.3, 1.21, 0.5, 0.02, 0.06, "#e8302a", 0);
    k.pic("bonbonOrder", 4.95, v0 + 0.1, 1.15, 0.24, 0.12, [0, -1]); }
  for (const y of [1.7, 2.35]) { k.box(2.0, W - 2.0, D - T - 0.3, D - T, y - 0.04, y, CREAM, 0.006); goods(k, 2.2, W - 2.2, D - T - 0.15, y, 12, ["#ff9ad0", "#ffd54a", "#9fe3ff", "#c8f0a0", "#ff7a1a"], "jar"); }
  for (let i = 0; i < 3; i++) { const u = 2.6 + i * 2.6, v = 3.0 + (i % 2) * 1.6, y = H - 1.4; k.cyl(u, v, (y + H) / 2, 0.02, H - y, "#c8ccd4", 0, 3); k.cyl(u, v, y - 0.3, 0.04, 0.6, "#f4f1ea", 0, 4); k.cyl(u, v, y - 0.75, 0.6, 0.06, ["#ff5fa8", "#43e0c6", "#ffd54a"][i % 3], 0.006, 18, "v"); k.cyl(u, v, y - 0.75, 0.34, 0.07, "#ffffff", 0, 14, "v"); }
}

// ---- R13b: THE BUILDINGS' TOPS (outside: always with the street): roof shapes, cornices, bands between the floors ----
function roofs(k: StoreKit) {
  const b = STORE_BUILDINGS[k.s.id], W = k.W, D = k.D, H = k.H, top = storeTop(k.s);
  k.outside(() => {
    for (const u of b.uppers) {
      // a band at each floor line on the front (and round the corners a little), a cornice at the top
      const trim = u.wall === "brick" ? "#d8ccb4" : u.wall === "stone" ? "#f4eee2" : u.wall === "paint" ? "#fff4f0" : u.wall === "clapboard" ? "#3a2a1a" : "#c8c4b8";
      for (let f = 1; f < u.floors; f++) { const y = H + 0.3 + f * u.fh; k.box(u.u0 - 0.06, u.u1 + 0.06, -0.12, 0.6, y - 0.08, y + 0.08, trim, 0.008); }
      if (b.roof === "flat") { const y = H + 0.3 + u.floors * u.fh; k.box(u.u0 - 0.2, u.u1 + 0.2, -0.32, D, y, y + 0.22, trim, 0.012); k.box(u.u0 - 0.12, u.u1 + 0.12, -0.2, D, y + 0.22, y + 0.7, u.color, 0.012); k.box(u.u0 - 0.18, u.u1 + 0.18, -0.26, D, y + 0.7, y + 0.82, trim, 0.008); }
    }
    if (b.roof === "sawtooth") { // (over the yard bay: three teeth, glazed faces to the back)
      const u0 = 5.6, u1 = W, n = 3, L = D / n, y = H + 0.3;
      for (let i = 0; i < n; i++) { const v0 = i * L, v1 = v0 + L; k.prism("v", v0, v1, v1, v1, u0, u1, y, y + 1.5, "#5a5a60", 0.012); k.box(u0 + 0.1, u1 - 0.1, v1 - 0.06, v1 - 0.02, y + 0.1, y + 1.4, "#9fc4d8", 0.006); }
      k.box(u0 - 0.1, u1 + 0.1, -0.3, D, y, y + 0.18, "#4a4a50", 0.01); // (a gutter line)
    }
    if (b.roof === "gable") { // (the gable to the street, the eaves out over the walls)
      k.prism("u", -0.4, W + 0.4, W / 2, W / 2, 0.3, D + 0.2, top, top + 4.2, "#3a4a3a", 0.016);
      k.prism("u", -0.1, W + 0.1, W / 2, W / 2, -0.06, 0.32, top, top + 3.9, "#6a4a30", 0.012); // (the gable end's boards, in front of the roof's end)
      for (const s2 of [-1, 1]) k.B(W / 2 + s2 * W / 4, -0.12, top + 1.95, Math.hypot(W / 2, 3.9) + 0.3, 0.22, 0.14, "#3a2a1a", 0.008, 0, 0, s2 * Math.atan2(3.9, W / 2)); // (barge boards)
    }
    if (b.roof === "mansard") { // (steep slate slopes, dormers, a flat top)
      k.prism("u", -0.15, W + 0.15, 1.0, W - 1.0, 0, D, top, top + 3.2, "#5a6070", 0.014);
      k.box(-0.3, W + 0.3, -0.3, D, top - 0.3, top, "#f4eee2", 0.012);
      for (const du of [W * 0.25, W * 0.5, W * 0.75]) { k.box(du - 0.55, du + 0.55, 0.35, 1.6, top + 0.3, top + 2.0, "#e8e0d0", 0.01); k.prism("u", du - 0.7, du + 0.7, du, du, 0.25, 1.7, top + 2.0, top + 2.7, "#5a6070", 0.008); k.box(du - 0.35, du + 0.35, 0.32, 0.36, top + 0.6, top + 1.8, "#3a4a5a", 0.004); }
    }
  });
}
