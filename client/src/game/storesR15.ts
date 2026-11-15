// R15: Blake's six robbery stores (docs/shop-plan.md): their pictures (a second shared sheet: the first is full) and their
// dressing, through the same kit as R13 (storeDressing.ts: u along the frontage from the left as you face it, v in from the
// front wall's outer face, y up). Each store reads as its business from the street and inside; the plain pieces merge with
// the city, the pictures come off this one sheet (two materials), repeated stock is instanced (stockRenderer.ts).
//
// LAST SCREW HARDWARE (low-end, Leftovers Avenue): a worn builders' merchant. The hall (shop) on the right; the timber yard
// on the left behind a chain-link fence and a sliding gate (the side exit); the stockroom in the hall's back left corner
// with a roller door to the yard. Patched corrugated cladding, a sagging awning, hand-painted everything.
import type { StoreKit } from "./storeDressing.ts";
import { centered, seeded, goods, CHUNK, ROUND } from "./storeDressing.ts";
import { STORE_FLOOR, STORE_FIXTURES, STORE_SHELLS, storeTop } from "@bfb/shared";

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
interface Cell { w: number; h: number; draw: Draw; s?: number }

/** a scuffed, hand-painted board */
function board(c: CanvasRenderingContext2D, w: number, h: number, bg: string, seed: number, frame = "#2a1a10") {
  c.fillStyle = bg; c.fillRect(0, 0, w, h); const r = seeded(seed);
  for (let k = 0; k < (w * h) / 350; k++) { c.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.08})`; c.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 4); }
  c.strokeStyle = frame; c.lineWidth = Math.max(4, w / 90); c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
}

export const CELLS_R15: Record<string, Cell> = {
  // ---- LAST SCREW HARDWARE
  signScrew: { w: 1024, h: 176, draw: (c, w, h) => {
    board(c, w, h, "#2f5a3a", 41, "#14261a");
    // a giant screw
    c.save(); c.translate(88, h / 2); c.rotate(-0.5); c.fillStyle = "#c8ccd4"; c.fillRect(-12, -10, 24, 96); c.beginPath(); c.arc(0, -16, 32, 0, 6.3); c.fill();
    c.strokeStyle = "#5a5e68"; c.lineWidth = 6; c.beginPath(); c.moveTo(-18, -16); c.lineTo(18, -16); c.stroke(); for (let y = 0; y < 90; y += 14) { c.beginPath(); c.moveTo(-14, y); c.lineTo(14, y + 8); c.stroke(); } c.restore();
    centered(c, "LAST SCREW", w * 0.52, h * 0.42, w * 0.64, 104, CHUNK, "#ffd54a", "#14261a", 10);
    centered(c, "HARDWARE", w * 0.88, h * 0.42, w * 0.2, 52, CHUNK, "#f4f1ea", "#14261a", 6);
    centered(c, "TIMBER · TOOLS · FIXINGS · REGRETS", w * 0.58, h * 0.82, w * 0.74, 30, CHUNK, "#f4f1ea");
  } },
  screwKeys: { w: 256, h: 512, draw: (c, w, h) => { board(c, w, h, "#ffd54a", 7, "#1b1420");
    c.fillStyle = "#1b1420"; c.beginPath(); c.arc(w / 2, 110, 54, 0, 6.3); c.fill(); c.fillStyle = "#ffd54a"; c.beginPath(); c.arc(w / 2, 110, 22, 0, 6.3); c.fill();
    c.fillStyle = "#1b1420"; c.fillRect(w / 2 - 12, 150, 24, 150); for (const y of [230, 262, 290]) c.fillRect(w / 2, y, 40, 14);
    centered(c, "KEYS CUT", w / 2, 350, w * 0.86, 44, CHUNK, "#1b1420"); centered(c, "WHILE U WAIT", w / 2, 400, w * 0.86, 30, CHUNK, "#1b1420"); centered(c, "(LONG)", w / 2, 450, w * 0.7, 34, CHUNK, "#c83a2a"); } },
  screwPosters: { w: 512, h: 512, s: 0.75, draw: (c, w, h) => {
    const q = [["#f4f1ea", "NAILS:", "POINTY END IN", "#c83a2a"], ["#ffd54a", "WE HAVE IT.", "PROBABLY. SOMEWHERE.", "#1b1420"], ["#9fe3ff", "DIY:", "DO IT YESTERDAY", "#1f3a8a"], ["#ff8fa3", "LOST: 1 SCREW", "KEEP IT. WE'VE LOADS.", "#1b1420"]];
    q.forEach(([bg, a, b, fg], i) => { const x = (i % 2) * w / 2, y = Math.floor(i / 2) * h / 2; c.save(); c.translate(x, y); board(c, w / 2, h / 2, bg, 100 + i, "#1b1420"); centered(c, a, w / 4, h / 2 * 0.36, w / 2 * 0.86, 40, CHUNK, fg); centered(c, b, w / 4, h / 2 * 0.66, w / 2 * 0.86, 26, CHUNK, "#1b1420"); c.restore(); });
  } },
  screwAisles: { w: 512, h: 384, s: 0.75, draw: (c, w, h) => {
    const rows = [["1", "FIXINGS & GLUE"], ["2", "EVERYTHING (PROBABLY)"], ["3", "TOOLS & REGRETS"]];
    rows.forEach(([n, t], i) => { const y = i * h / 3; c.fillStyle = ["#2f5a3a", "#c83a2a", "#1f3a8a"][i]; c.fillRect(0, y, w, h / 3); c.fillStyle = "#ffd54a"; c.beginPath(); c.arc(56, y + h / 6, 40, 0, 6.3); c.fill();
      centered(c, n, 56, y + h / 6, 60, 54, CHUNK, "#1b1420"); centered(c, "AISLE " + n, w * 0.6, y + h / 6 - 24, w * 0.6, 26, CHUNK, "#ffd54a"); centered(c, t, w * 0.6, y + h / 6 + 16, w * 0.7, 30, CHUNK, "#f4f1ea"); });
  } },
  screwLabels: { w: 512, h: 128, draw: (c, w, h) => {
    const t = ["NAILS", "SCREWS", "BOLTS", "WASHERS", "MYSTERY", "ELBOWS", "TEES", "BENDS"], cw = w / 4;
    t.forEach((s, i) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * h / 2; c.fillStyle = i === 4 ? "#ff8fa3" : "#f4f1ea"; c.fillRect(x + 2, y + 2, cw - 4, h / 2 - 4); centered(c, s, x + cw / 2, y + h / 4, cw - 14, 26, CHUNK, "#1b1420"); });
  } },
  screwSpare: { w: 256, h: 128, draw: (c, w, h) => { board(c, w, h, "#f4f1ea", 9, "#1b1420"); centered(c, "SPARE SCREWS", w / 2, h * 0.36, w * 0.88, 34, CHUNK, "#1b1420"); centered(c, "(LOOSE) 5c EACH", w / 2, h * 0.72, w * 0.8, 24, CHUNK, "#c83a2a"); } },
  screwYard: { w: 512, h: 256, draw: (c, w, h) => { board(c, w, h, "#e8b830", 13, "#1b1420");
    for (let x = -40; x < w; x += 48) { c.fillStyle = "#1b1420"; c.beginPath(); c.moveTo(x, h); c.lineTo(x + 24, h); c.lineTo(x + 48, h - 26); c.lineTo(x + 24, h - 26); c.fill(); }
    centered(c, "TIMBER YARD", w / 2, h * 0.28, w * 0.86, 62, CHUNK, "#1b1420"); centered(c, "MIND THE NAILS", w / 2, h * 0.55, w * 0.8, 36, CHUNK, "#c83a2a"); centered(c, "(AND THE DOG. THERE IS NO DOG.)", w / 2, h * 0.73, w * 0.86, 20, CHUNK, "#1b1420"); } },
  screwOpen: { w: 256, h: 96, draw: (c, w, h) => { c.clearRect(0, 0, w, h); c.shadowColor = "#43e0c6"; c.shadowBlur = 14; centered(c, "OPEN-ISH", w / 2, h / 2, w * 0.9, 56, ROUND, "#9ffff0", "#0b2a24", 4); } },
  screwABoard: { w: 256, h: 384, s: 0.75, draw: (c, w, h) => { board(c, w, h, "#1b1a1e", 21, "#8a6a4a");
    centered(c, "TODAY:", w / 2, h * 0.16, w * 0.8, 40, ROUND, "#f4f1ea"); centered(c, "HAMMERS", w / 2, h * 0.32, w * 0.84, 50, ROUND, "#ffd54a");
    centered(c, "TOMORROW:", w / 2, h * 0.54, w * 0.8, 36, ROUND, "#f4f1ea"); centered(c, "ALSO HAMMERS", w / 2, h * 0.7, w * 0.84, 38, ROUND, "#ffd54a"); centered(c, "NAILS 2 FOR 3", w / 2, h * 0.88, w * 0.8, 28, ROUND, "#43e0c6"); } },
  screwStaff: { w: 256, h: 128, draw: (c, w, h) => { board(c, w, h, "#c83a2a", 3, "#1b1420"); centered(c, "STOCKROOM", w / 2, h * 0.36, w * 0.86, 36, CHUNK, "#f4f1ea"); centered(c, "STAFF ONLY (HANK)", w / 2, h * 0.72, w * 0.86, 22, CHUNK, "#ffd54a"); } },
  screwFlat: { w: 256, h: 128, draw: (c, w, h) => { board(c, w, h, "#f4f1ea", 5, "#c83a2a"); centered(c, "FLAT TO LET", w / 2, h * 0.38, w * 0.86, 34, CHUNK, "#c83a2a"); centered(c, "(NO)", w / 2, h * 0.72, w * 0.6, 30, CHUNK, "#1b1420"); } },
  screwGhost: { w: 512, h: 256, s: 0.75, draw: (c, w, h) => { c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, w, h); c.globalAlpha = 0.55;
    centered(c, "HANK'S", w / 2, h * 0.22, w * 0.6, 50, CHUNK, "#f4f1ea"); centered(c, "SCREWS · NAILS · BOLTS", w / 2, h * 0.5, w * 0.9, 40, CHUNK, "#ffd54a"); centered(c, "SINCE 19??", w / 2, h * 0.78, w * 0.6, 40, CHUNK, "#f4f1ea"); c.globalAlpha = 1; } },
};

// ---- the second sheet: the same skyline packing as the first (storeDressing.ts)
const SHEET = 2048;
let used = 0;
const PACK2 = (() => {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const sz = (cl: Cell) => [Math.ceil(cl.w * (cl.s ?? 1)), Math.ceil(cl.h * (cl.s ?? 1))];
  const STEP = 16, cols = new Array(SHEET / STEP).fill(0);
  for (const [k, cl] of Object.entries(CELLS_R15).sort((p, q) => sz(q[1])[1] - sz(p[1])[1] || sz(q[1])[0] - sz(p[1])[0])) {
    const [w, h] = sz(cl), n = Math.ceil(w / STEP);
    let bx = 0, by = Infinity;
    for (let c = 0; c + n <= cols.length; c++) { let y = 0; for (let q = c; q < c + n; q++) y = Math.max(y, cols[q]); if (y < by) { by = y; bx = c; } }
    out[k] = { x: bx * STEP, y: by, w, h }; for (let q = bx; q < bx + n; q++) cols[q] = by + h; used = Math.max(used, by + h);
  }
  if (used > SHEET) throw new Error("R15 store sheet overflow: " + used + " px tall");
  return out;
})();
export type R15Cell = keyof typeof CELLS_R15;
export const isR15Cell = (cell: string) => cell in CELLS_R15;
export function storeSheet2Used() { return used; }
export function drawStoreSheet2(c: CanvasRenderingContext2D) {
  c.clearRect(0, 0, SHEET, SHEET);
  for (const [k, cl] of Object.entries(CELLS_R15)) { const p = PACK2[k]; c.save(); c.translate(p.x, p.y); c.beginPath(); c.rect(0, 0, p.w, p.h); c.clip(); if (cl.s) c.scale(cl.s, cl.s); cl.draw(c, cl.w, cl.h); c.restore(); }
}
export function sheet2UV(cell: string, sub: [number, number, number, number] = [0, 0, 1, 1]): [number, number, number, number] {
  const p = PACK2[cell], x0 = p.x + sub[0] * p.w, x1 = p.x + sub[2] * p.w, y0 = p.y + sub[1] * p.h, y1 = p.y + sub[3] * p.h;
  return [x0 / SHEET, 1 - y1 / SHEET, x1 / SHEET, 1 - y0 / SHEET];
}

// =====================================================================================================================
// LAST SCREW HARDWARE
export function lastscrew(k: StoreKit) {
  const W = k.W, D = k.D, H = k.H, T = k.T, F = STORE_FLOOR, top = storeTop(k.s), sp = STORE_SHELLS.lastscrew, fx = STORE_FIXTURES.lastscrew;
  const GREEN = "#2f5a3a", YEL = "#e8b830", STEEL = "#8a8e98", DARK = "#2a2830", OAK = "#b98a52", PINE = "#d8b07a", RUST = "#a85a2a", RED = "#c83a2a", WALL = sp.wall;
  const YU = sp.yard!.u1, YH = sp.yard!.h, rc = sp.recess!;
  // ================================ OUTSIDE
  k.outside(() => {
    // the hall's frontage: a brick plinth, piers, corrugated cladding above the window (patched: a rusty panel, a blue one)
    k.skin(YU, W, -0.06, 0, 0, 0.6, "brick", "#9a5a3e", 0.008);
    for (const u of [YU + 0.3, 17.0, W - 0.8]) k.skin(u - 0.3, u + 0.3, -0.1, 0, 0, H, "brick", "#9a5a3e", 0.01);
    const panels = [["#8a9098", 9.0, 11.6], ["#a85a2a", 11.6, 12.9], ["#8a9098", 12.9, 15.4], ["#3a6a9a", 15.4, 16.7]] as const;
    for (const [col, u0, u1] of panels) k.skin(u0, u1, -0.08, 0, (sp.glassTop ?? 3) + 0.05, H, "corrugated", col, 0.008);
    k.skin(rc.u0, W - 0.5, -0.08, 0, 3.2, H, "corrugated", "#8a9098", 0.008);
    // a bent cornice and a gutter that's seen things
    k.box(YU, W + 0.05, -0.32, 0, H - 0.02, H + 0.12, "#5a5450", 0.01); k.cyl(14.0, -0.36, H + 0.04, 0.12, W - YU, "#6a6e78", 0.006, 8, "u");
    k.cyl(YU + 0.2, -0.36, H / 2, 0.1, H, "#6a6e78", 0.006, 8); // (the downpipe)
    // the sagging awning over the window: green and white stripes on two drooping brackets, below the sign
    for (let i = 0; i < 8; i++) { const u0 = 9.1 + i * 0.975; k.B(u0 + 0.49, -0.6, 2.62 - (i % 7 === 3 ? 0.05 : 0), 0.96, 0.05, 1.15, i % 2 ? "#f4f1ea" : GREEN, 0.008, 0, -0.32); }
    for (const u of [9.2, 16.8]) k.B(u, -0.52, 2.66, 0.05, 0.05, 1.05, DARK, 0.004, 0, 0.5);
    k.B(13.0, -1.14, 2.36, 7.9, 0.22, 0.04, GREEN, 0.006); // (its valance)
    // the recess: a worn step, a mat, PUSH (HARD) on the door's glass, the key-cutting blade sign beside it
    k.box(rc.u0 + 0.2, rc.u1 - 0.2, 0, rc.depth, 0.15, 0.18, "#7a7470", 0.004);
    k.box((rc.u0 + rc.u1) / 2 - 0.7, (rc.u0 + rc.u1) / 2 + 0.7, rc.depth - 0.9, rc.depth - 0.1, 0.18, 0.2, "#6a3a1e", 0);
    k.box(rc.u1 + 0.05, rc.u1 + 0.15, -0.85, 0, 3.35, 3.43, DARK, 0.004); k.box(rc.u1 + 0.07, rc.u1 + 0.13, -0.8, -0.72, 2.1, 3.4, DARK, 0.004);
    k.pic("screwKeys", rc.u1 + 0.1, -0.6, 2.75, 0.4, 0.8, [1, 0]); k.pic("screwKeys", rc.u1 + 0.1, -0.6, 2.75, 0.4, 0.8, [-1, 0]);
    // the end pier's ghost sign (painted long ago), the A-board on the pavement
    k.pic("screwGhost", W - 0.52, -0.12, 2.1, 1.4, 0.7, [0, -1]);
    k.B(18.0, -1.5, 0.6, 0.6, 1.1, 0.04, "#8a6a4a", 0.006, 0, 0.16); k.B(18.0, -1.32, 0.6, 0.6, 1.1, 0.04, "#8a6a4a", 0.006, 0, -0.16);
    k.pic("screwABoard", 18.0, -1.6, 0.62, 0.5, 0.75, [0, -1]);
    // the window: a pyramid of paint tins, a wheelbarrow (BARROW OF THE MONTH), a ladder, the neon OPEN-ISH
    for (let r = 0; r < 4; r++) for (let i = 0; i <= 3 - r; i++) k.cyl(10.2 + i * 0.3 + r * 0.15, 0.7, F + 0.12 + r * 0.24, 0.26, 0.24, ["#e8463a", "#f4c430", "#2fa4a0", "#f4f1ea"][(i + r) % 4], 0.006, 12);
    { const u = 13.6; k.B(u, 0.9, F + 0.45, 1.0, 0.3, 0.6, RED, 0.01, 0.2, 0.15); k.cyl(u + 0.55, 0.85, F + 0.2, 0.36, 0.08, DARK, 0.006, 12, "u"); for (const s of [-1, 1]) k.B(u - 0.6, 0.9 + s * 0.22, F + 0.42, 0.9, 0.05, 0.05, OAK, 0.004, 0.2, 0.25); }
    for (const s of [0, 1]) k.B(15.8 + s * 0.45, 0.6, 1.6, 0.06, 3.0, 0.06, PINE, 0.004, 0, 0, 0.18); for (let i = 0; i < 7; i++) k.B(16.0 + i * 0.1, 0.6, 0.5 + i * 0.38, 0.5, 0.05, 0.05, PINE, 0.003, 0, 0, 0.18);
    k.pic("screwOpen", 12.0, 0.32, 2.45, 1.0, 0.38, [0, -1], true);
    // upstairs: the office window's sign
    k.pic("screwFlat", 12.0, -0.04, H + 1.9, 0.7, 0.35, [0, -1]);
    void top;
    // ---- THE YARD: the chain-link fence, the sliding gate (open: the two leaves parked behind the fence), the sign
    for (const [u0, u1] of [[0, 2.1], [6.3, YU]]) {
      k.skin(u0, u1, 0.02, 0.1, 0.05, 2.4, "grille", "#9aa0a8", 0.004);
      k.box(u0, u1, 0.02, 0.1, 2.36, 2.44, STEEL, 0.004);
      k.skin(u0 + 0.05, u1 - 0.05, 0.16, 0.22, 0.05, 2.3, "grille", "#8a9098", 0.004); // (the parked gate leaf)
    }
    for (const u of [0.05, 2.1, 6.3, YU - 0.05]) k.cyl(u, 0.06, 1.25, 0.1, 2.5, "#5a5e68", 0.006, 8);
    k.box(2.1, 6.3, 0.0, 0.12, 0.0, 0.04, "#5a5e68", 0); // (the gate's runner)
    k.pic("screwYard", 4.2, -0.05, 3.2, 1.6, 0.8, [0, -1]); k.box(2.0, 6.4, 0.02, 0.1, 2.75, 2.85, STEEL, 0.004); for (const u of [3.4, 5.0]) k.box(u - 0.03, u + 0.03, 0.03, 0.09, 2.44, 2.8, STEEL, 0.003);
    for (let i = 0; i < 9; i++) k.cyl(0.25 + i * 0.22, 0.06, 2.52, 0.08, 0.1, ["#c8ccd4", RED, "#c8ccd4"][i % 3], 0.003, 8); // (tin cans on a string: the burglar alarm)
    // the yard's boundary walls (low brick), its lean-to (corrugated, on posts) over the timber racks
    k.skin(0, T, T, D - T, 0, YH, "brick", "#8a4a32", 0.008); k.skin(0, YU, D - T, D, 0, YH, "brick", "#8a4a32", 0.008);
    for (const u of [0.5, 4.2, 7.9]) k.box(u - 0.07, u + 0.07, 7.4, 7.54, 0, 3.15, DARK, 0.006);
    k.B(YU / 2, (7.3 + D) / 2, 3.0, YU + 0.2, 0.06, D - 7.3 + 0.3, "#8a9098", 0.01, 0, -0.14);
    k.box(0.1, YU, 7.3, 7.6, 3.05, 3.2, DARK, 0.006);
    // the timber racks (the stock sits on top and in front): steel uprights, cantilever arms, bundles of planks
    { const [u0, u1, v0, v1] = fx.solids![5];
      for (let u = u0; u <= u1 + 0.01; u += (u1 - u0) / 4) { k.box(u - 0.06, u + 0.06, v1 - 0.25, v1 - 0.1, 0, 2.5, YEL, 0.006); for (const y of [0.45, 1.05, 1.6]) k.box(u - 0.04, u + 0.04, v0, v1 - 0.1, y - 0.04, y, YEL, 0.004); }
      for (let i = 0; i < 6; i++) for (const y of [0.45, 1.05]) k.B(u0 + 0.6 + i * 1.15, (v0 + v1) / 2 + 0.1, y + 0.1, 1.0, 0.14 + (i % 2) * 0.08, 0.5, i % 3 === 1 ? "#c89a6a" : PINE, 0.006);
      k.pic("screwLabels", (u0 + u1) / 2, v0 - 0.02, 1.85, 1.2, 0.3, [0, -1], false, [0, 0, 1, 0.5]); }
    // the pipe rack on the side wall: long pipes on brackets
    { const [u0, , v0, v1, h] = fx.solids![6];
      for (const v of [v0 + 0.2, (v0 + v1) / 2, v1 - 0.2]) k.box(u0, u0 + 0.12, v - 0.05, v + 0.05, 0, h + 0.4, DARK, 0.004);
      for (let i = 0; i < 7; i++) k.cyl(u0 + 0.2 + (i % 3) * 0.12, (v0 + v1) / 2, 0.4 + i * 0.13, 0.08, v1 - v0 + 0.4, ["#c8743a", "#9aa0a8", "#3a3a40"][i % 3], 0.004, 8, "v"); }
    // the scrap heap and the brick pallets
    { const [u0, u1, v0, v1] = fx.solids![7];
      for (let q = 0; q < 22; q++) k.B(u0 + 0.2 + k.rnd() * (u1 - u0 - 0.4), v0 + 0.2 + k.rnd() * (v1 - v0 - 0.4), 0.15 + k.rnd() * 0.6, 0.2 + k.rnd() * 0.6, 0.06 + k.rnd() * 0.15, 0.15 + k.rnd() * 0.5, [RUST, STEEL, "#5a5a60", "#3a6a8a", "#c8ccd4"][q % 5], 0.006, k.rnd() * 3, (k.rnd() - 0.5) * 0.8, (k.rnd() - 0.5) * 0.8); }
    { const [u0, u1, v0, v1] = fx.solids![8];
      for (const um of [u0 + 0.5, u1 - 0.5]) { k.box(um - 0.48, um + 0.48, v0 + 0.05, v1 - 0.05, 0, 0.14, "#c89a6a", 0.004); for (let r = 0; r < 4; r++) k.skin(um - 0.42, um + 0.42, v0 + 0.15, v1 - 0.15, 0.14 + r * 0.11, 0.24 + r * 0.11, "brick", "#a8543a", 0.003); } }
    // the cement mixer (solid), orange and tilted, a shovel stuck in a sack of something
    { const [u0, u1, v0, v1] = fx.solids![9], um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      k.cyl(um, vm, 0.8, 0.75, 0.9, "#e8742a", 0.012, 14, "y", 0.4); k.B(um, vm, 0.32, 0.9, 0.08, 0.8, DARK, 0.006); for (const s of [-1, 1]) k.cyl(um + s * 0.42, vm, 0.16, 0.3, 0.08, DARK, 0.006, 10, "u");
      k.B(um - 0.7, vm + 0.3, 0.3, 0.45, 0.5, 0.3, "#c8b88a", 0.006); k.B(um - 0.7, vm + 0.3, 0.9, 0.05, 0.9, 0.05, OAK, 0.003, 0, 0.1); }
    // a floodlight on the hall's wall over the yard
    k.B(YU - 0.12, 4.0, 3.9, 0.2, 0.2, 0.3, DARK, 0.006); k.bulb(YU - 0.3, 4.0, 3.85, 0.14, "#fff4d0");
  });
  // ================================ INSIDE THE HALL
  k.box(YU + T, W - T, T, D - T, F + 0.004, F + 0.016, "#8a8478", 0); // (the worn concrete floor)
  // the walls: painted block (green below, cream above), the ceiling: pale tiles under the roof steel
  for (const [u0, u1, v0, v1] of [[YU + T, W - T, T, T + 0.02], [W - T - 0.02, W - T, T, D - T], [YU + T, YU + T + 0.02, T, D - T]] as const) {
    k.box(u0, u1, v0, v1, F, 1.3, "#6a8a6a", 0.003); k.box(u0, u1, v0, v1, 1.3, H - 0.05, "#e8dcc0", 0.003); }
  k.box(12.4, W - T, D - T - 0.02, D - T, 2.9, H - 0.05, "#e8dcc0", 0.003);
  k.box(YU + T, W - T, T, D - T, H - 0.06, H - 0.04, "#d8d4c8", 0);
  for (const u of [11.0, 14.6, 18.2, 21.6]) k.box(u - 0.07, u + 0.07, T, D - T, H - 0.3, H - 0.06, "#5a5e68", 0.006);
  for (const [u0, u1] of [[YU + T, W - T]] as const) k.box(u0, u1, D - T - 0.02, D - T, F, 1.2, "#5a6a5a", 0.004);
  // the doorways in the hall/yard wall: lintels over the side door and the stockroom's roller door (rolled up)
  k.box(YU, YU + T, 3.6, 5.0, 2.4, H, WALL, 0.008); k.box(YU, YU + T, 8.0, 10.3, 2.6, H, WALL, 0.008);
  k.box(YU - 0.05, YU + T + 0.05, 8.0, 10.3, 2.6, 2.95, "#8a9098", 0.006); // (the roller shutter's drum)
  k.box(10.2, 11.4, 6.6, 6.9, 2.3, H, WALL, 0.008); k.pic("screwStaff", 10.8, 6.58, 2.62, 0.9, 0.45, [0, -1]);
  // the three gondolas: a spine of pegboard, two shelves each side (the stock: shopStock racks), a top shelf of boxes,
  // the end caps with the deals, the aisle signs hanging over them
  const gond = fx.solids!.slice(0, 3);
  gond.forEach(([u0, u1, v0, v1, h], gi) => {
    const um = (u0 + u1) / 2;
    k.box(u0 + 0.05, u1 - 0.05, v0 + 0.05, v1 - 0.05, F, 0.2, DARK, 0.006); // (the kick plate)
    k.box(um - 0.03, um + 0.03, v0, v1, F, h, "#c8a878", 0.004); // (the pegboard spine)
    for (const y of [0.6, 1.1, 1.55]) k.box(u0, u1, v0, v1, y - 0.03, y, "#d8d4c8", 0.006);
    for (const v of [v0 + 0.03, v1 - 0.03]) k.box(u0, u1, v - 0.03, v + 0.03, F, h, STEEL, 0.004);
    goods(k, um - 0.25, um + 0.25, v0 + 0.3, 1.55, 6, ["#e8463a", "#f4c430", "#2fa4a0", "#c8ccd4"], "box", true, v1 - 0.3);
    // the cheap stock behind the real things on each shelf: boxes of screws, tins, tubes (scenery: the stealable things
    // sit at the front edge: shopStock racks)
    for (const [y, kind] of [[F + 0.2, "box"], [0.6, gi === 2 ? "can" : "box"], [1.1, gi === 1 ? "jar" : "can"]] as const)
      for (const uu of [u0 + 0.3, u1 - 0.3]) goods(k, uu, uu, v0 + 0.25, y, 9, gi === 0 ? ["#c83a2a", "#f4f1ea", "#e8b830"] : gi === 1 ? ["#2fa4a0", "#e8463a", "#f4c430", "#7a3fa0"] : ["#5a5e68", "#c8ccd4", "#1f3a8a"], kind, true, v1 - 0.25);
    k.pic("screwAisles", um, v0 - 0.02, h - 0.25, 0.85, 0.21, [0, -1], false, [0, gi / 3, 1, (gi + 1) / 3]); // (the end cap's label)
    k.box(um - 0.02, um + 0.02, (v0 + v1) / 2 - 0.02, (v0 + v1) / 2 + 0.02, 3.0, H, DARK, 0); // (the hanging sign's wire)
    for (const n of [[0, -1], [0, 1]] as const) k.pic("screwAisles", um, (v0 + v1) / 2 + n[1] * 0.01, 2.85, 1.6, 0.4, n as [number, number], false, [0, gi / 3, 1, (gi + 1) / 3]);
  });
  // the pipe and fittings bins along the yard wall (labelled), the SPARE SCREWS barrel (the rummage spot)
  { const [u0, u1, v0, v1, h] = fx.solids![3];
    k.box(u0, u1, v0, v1, F, h, "#6a5040", 0.01);
    for (let i = 0; i < 4; i++) { const v = v0 + 0.3 + i * (v1 - v0 - 0.6) / 3; k.box(u0 + 0.08, u1 - 0.08, v - 0.26, v + 0.26, h - 0.02, h + 0.04, ["#8a9098", "#c8743a", "#c8ccd4", "#9a5a3e"][i], 0.004); }
    k.pic("screwLabels", u1 + 0.01, (v0 + v1) / 2, h - 0.3, 1.9, 0.24, [1, 0], false, [0, 0.5, 1, 1]); }
  { const [u0, u1, v0, v1, h] = fx.solids![4], um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    k.cyl(um, vm, F + h / 2 - 0.1, 0.9, h - 0.2, "#3a6a9a", 0.012, 14); k.cyl(um, vm, F + h - 0.15, 0.82, 0.06, "#c8ccd4", 0, 14);
    for (let q = 0; q < 14; q++) { const a = k.rnd() * 6.3, r = k.rnd() * 0.32; k.B(um + Math.cos(a) * r, vm + Math.sin(a) * r, F + h - 0.1, 0.05, 0.02, 0.12, "#c8ccd4", 0, k.rnd() * 3); }
    k.pic("screwSpare", u1 + 0.02, vm, F + h + 0.35, 0.7, 0.35, [1, 0]); }
  // the counter: a scarred wooden top, the key-cutting machine, a jar of loose screws, a bell; the key board behind
  { const [c0, c1, cv0, cv1] = sp.counter, cm = (cv0 + cv1) / 2;
    k.box(c0 - 0.05, c1 + 0.05, cv0 - 0.05, cv1 + 0.05, 1.0, 1.06, OAK, 0.008); k.box(c0, c1, cv0 - 0.02, cv0, F, 0.98, GREEN, 0.004);
    { const u = c1 - 0.6; k.B(u, cm, 1.2, 0.5, 0.28, 0.36, "#c8ccd4", 0.008); k.cyl(u - 0.1, cm, 1.36, 0.14, 0.06, DARK, 0.004, 10, "v"); k.B(u + 0.18, cm, 1.36, 0.2, 0.06, 0.06, RED, 0.003); }
    k.cyl(c0 + 1.3, cm, 1.15, 0.16, 0.2, "#d8eef8", 0.004, 10); k.ball(c0 + 1.7, cm, 1.1, 0.12, "#d9b45a", 0.004, 6);
    const cu = (c0 + c1) / 2;
    k.box(cu - 0.8, cu + 0.8, 4.05, 4.1, 2.55, 3.05, "#c8a878", 0.004); // (the board of key blanks, hung over the keeper's head)
    for (let i = 0; i < 16; i++) k.B(cu - 0.65 + (i % 8) * 0.185, 4.03, 2.68 + Math.floor(i / 8) * 0.22, 0.04, 0.12, 0.01, ["#d9b45a", "#c8ccd4"][i % 2], 0);
    for (const du of [-0.6, 0.6]) k.box(cu + du - 0.01, cu + du + 0.01, 4.06, 4.09, 3.05, H, DARK, 0); }
  // the pegboard walls (the back, the far side): hammers, saws, spanners hung up (decoration: the stock is on the gondolas)
  for (const [u0, u1] of [[12.4, W - T]] as const) {
    k.box(u0, u1, D - T - 0.06, D - T - 0.02, 1.2, 2.9, "#c8a878", 0.004);
    for (let i = 0; i < 26; i++) { const u = u0 + 0.3 + i * (u1 - u0 - 0.6) / 25, y = 1.6 + (i % 3) * 0.42;
      if (i % 4 === 0) { k.B(u, D - T - 0.1, y, 0.04, 0.34, 0.03, OAK, 0.003); k.B(u, D - T - 0.1, y + 0.18, 0.14, 0.05, 0.05, DARK, 0.003); }
      else if (i % 4 === 1) k.B(u, D - T - 0.09, y, 0.36, 0.14, 0.01, "#c8ccd4", 0.003, 0, 0, 0.2);
      else k.B(u, D - T - 0.09, y, 0.05, 0.28, 0.02, ["#c83a2a", "#3a3a40", "#2fa4a0"][i % 3], 0.003); } }
  k.box(W - T - 0.04, W - T, 1.0, D - T - 0.4, 1.2, 2.9, "#c8a878", 0.004);
  for (let i = 0; i < 12; i++) k.B(W - T - 0.08, 1.4 + i * 0.75, 1.9 + (i % 2) * 0.4, 0.02, 0.3, 0.3, ["#e8463a", "#f4c430", "#2fa4a0"][i % 3], 0.003); // (paint charts)
  // the posters (the jokes), a clock that's stopped at 10 to 5, the fluorescent tubes
  k.pic("screwPosters", YU + T + 0.02, 1.9, 2.3, 0.8, 0.8, [1, 0], false, [0, 0, 0.5, 0.5]);
  k.pic("screwPosters", 13.0, D - T - 0.08, 3.3, 0.7, 0.7, [0, -1], false, [0.5, 0, 1, 0.5]);
  k.pic("screwPosters", W - T - 0.06, 6.0, 3.25, 0.7, 0.7, [-1, 0], false, [0, 0.5, 0.5, 1]);
  k.pic("screwPosters", 19.2, D - T - 0.08, 3.3, 0.7, 0.7, [0, -1], false, [0.5, 0.5, 1, 1]);
  k.cyl(16.5, D - T - 0.06, 3.5, 0.5, 0.05, "#f4f1ea", 0.006, 16, "v"); k.B(16.5, D - T - 0.1, 3.55, 0.03, 0.18, 0.01, DARK, 0); k.B(16.55, D - T - 0.1, 3.5, 0.14, 0.03, 0.01, DARK, 0);
  for (const um of [15.3, 18.4]) for (const v of [3.0, 6.6]) { k.box(um - 0.7, um + 0.7, v - 0.06, v + 0.06, H - 0.32, H - 0.26, "#d8d4c8", 0.004); k.bulb(um, v, H - 0.36, 0.08, "#eef6ff"); }
  // ================================ THE STOCKROOM: shelving of boxes, a pallet, the cash tin on its shelf
  // steel shelving along the back wall: uprights, three shelves, boxes (some open: a drill, a bag of nails spilling)
  for (const u of [8.8, 10.4, 12.0]) k.box(u - 0.04, u + 0.04, D - T - 0.5, D - T - 0.42, F, 2.2, STEEL, 0.004);
  for (const y of [0.5, 1.2, 1.9]) { k.box(8.8, 12.0, D - T - 0.5, D - T - 0.02, y - 0.03, y, "#9aa0a8", 0.006);
    for (let q = 0; q < 5; q++) k.B(9.1 + q * 0.6, D - T - 0.26, y + 0.17, 0.48, 0.32 + (q % 2) * 0.06, 0.4, ["#c8a878", "#b98a52", "#d8b88a"][q % 3], 0.006, (k.rnd() - 0.5) * 0.15); }
  for (let i = 0; i < 6; i++) k.B(9.0 + (i % 3) * 0.95, 7.4 + Math.floor(i / 3) * 0.6, F + 0.2 + (i % 2) * 0.1, 0.8, 0.4 + (i % 2) * 0.2, 0.5, "#c8a878", 0.006, (k.rnd() - 0.5) * 0.3);
  k.box(9.2, 11.7, 9.3, 10.0, F, F + 0.14, "#c89a6a", 0.004);
  k.bulb(10.4, 8.6, H - 0.4, 0.1, "#ffe0b0");
}
