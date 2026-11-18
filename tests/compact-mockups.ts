// COMPACT QUEENS: PLANNING MOCK-UPS at player height. A throwaway scene of plain blocks built from the plan DATA
// (every footprint, storey count, door, lane, the El, the planned dressing), rendered with Babylon (the game's engine)
// from the game's own eye height (1.55 m) and default field of view (90 degrees horizontal), fog as today's (240 m day,
// 150 m night). NOT the game, NOT its art or lighting, NOT a blockout: a picture of the plan from where you'd stand.
//   npx tsx tests/compact-mockups.ts   -> docs/queens/compact/img/07-10-mock-*.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "esbuild";
import { usePlan, layout, railColumns } from "../shared/src/queens/check.js";
import { COMPACT } from "../shared/src/queens/compact.js";
import { P } from "../shared/src/queens/active.js";
import { STAIN_DRESSING } from "../shared/src/queens/dressing.js";
import type { XZ, QRect } from "../shared/src/queens/plan.js";

usePlan(COMPACT);
const lay = layout(), rail = railColumns();
type Box = { x: number; z: number; w: number; d: number; h: number; y?: number; c: string; rot?: number; e?: number; a?: number };
const boxes: Box[] = [], cyls: { x: number; z: number; r: number; h: number; y?: number; c: string; e?: number }[] = [], lamps: [number, number, number][] = [];
const rb = (r: QRect, h: number, c: string, y = 0, extra: Partial<Box> = {}) => boxes.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ, h, y, c, ...extra });
const seg = (a: XZ, b: XZ, width: number, h: number, c: string, y = 0, extra: Partial<Box> = {}) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); boxes.push({ x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, w: width, d: L, h, y, c, rot: Math.atan2(b[0] - a[0], b[1] - a[1]), ...extra }); };
const near = (p: XZ, q: XZ, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;

// ---- the ground: asphalt, the blocks' land, the yards, the pavements, the lanes ----
rb(P.extent, 0.1, "#4b4945", -0.1);
for (const b of P.blocks) for (const p of b.rects) rb(p.r, 0.14, "#9a947f");
for (const g of lay.grounds) rb(g.rect, 0.16, g.kind === "court" ? "#7d9460" : g.kind === "parking" ? "#7c7a74" : "#8d8a6c");
for (const r of P.roads) for (let i = 1; i < r.pts.length; i++) {
  const [a, b] = [r.pts[i - 1], r.pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L, o = r.w / 2 + r.sw / 2;
  for (const sgn of [-1, 1]) seg([a[0] + nx * o * sgn, a[1] + nz * o * sgn], [b[0] + nx * o * sgn, b[1] + nz * o * sgn], r.sw, 0.15, "#b7b0a2");
  for (let d = 2; d < L; d += 6) { const t = d / L; seg([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * (t + 2.5 / L), a[1] + (b[1] - a[1]) * (t + 2.5 / L)], 0.15, 0.02, "#d8c35a"); }
}
const HB = P.home.half + P.home.pave, L2 = P.home.lane / 2;
rb({ minX: -HB, maxX: HB, minZ: -HB, maxZ: HB }, 0.15, "#b7b0a2");
rb({ minX: -L2, maxX: L2, minZ: -HB, maxZ: HB }, 0.17, "#cdb98d"); rb({ minX: -HB, maxX: HB, minZ: -L2, maxZ: L2 }, 0.17, "#cdb98d");
for (const p of [...P.paths.filter((q) => q.kind !== "market"), ...lay.alleys]) for (let i = 1; i < p.pts.length; i++) seg(p.pts[i - 1], p.pts[i], p.w, 0.16, p.kind === "walk" ? "#b5ae9c" : "#8f8a80");
for (const c of P.crossings) for (let i = 0; i < Math.round(c.w / 1.2); i++) { const o = -c.w / 2 + 0.6 + i * 1.2, hw = P.home.ringW / 2; rb(c.across === "z" ? { minX: c.at[0] + o - 0.35, maxX: c.at[0] + o + 0.35, minZ: c.at[1] - hw, maxZ: c.at[1] + hw } : { minX: c.at[0] - hw, maxX: c.at[0] + hw, minZ: c.at[1] + o - 0.35, maxZ: c.at[1] + o + 0.35 }, 0.02, "#eeeeea"); }

// ---- the buildings: storeys from the plan; a shopfront band on the street side; units with their signs and awnings ----
const BRICK: Record<string, string[]> = { low: ["#8e4f3c", "#7c4a3a", "#9a6048", "#6f5a4c"], mid: ["#a0674e", "#8d6a55", "#b07a5c", "#7f6a5e"], high: ["#c2b296", "#b9a98c", "#a9a39a", "#cfc3ab"], special: ["#d6cbb5", "#c9bfa9"], home: ["#a08050"] };
const faceOf = (r: QRect, s: string) => s === "N" ? { a: [r.minX, r.maxZ] as XZ, b: [r.maxX, r.maxZ] as XZ, n: [0, 1] } : s === "S" ? { a: [r.minX, r.minZ] as XZ, b: [r.maxX, r.minZ] as XZ, n: [0, -1] } : s === "E" ? { a: [r.maxX, r.minZ] as XZ, b: [r.maxX, r.maxZ] as XZ, n: [1, 0] } : { a: [r.minX, r.minZ] as XZ, b: [r.minX, r.maxZ] as XZ, n: [-1, 0] };
lay.buildings.forEach((b, i) => {
  const h = b.use === "garage" ? 3 : b.floors * 3.2 + 0.6, pal = BRICK[b.style] ?? BRICK.low;
  rb(b.rect, h, b.use === "garage" ? "#8a857c" : pal[i % pal.length], 0.14);
  rb({ minX: b.rect.minX + 0.4, maxX: b.rect.maxX - 0.4, minZ: b.rect.minZ + 0.4, maxZ: b.rect.maxZ - 0.4 }, 0.5, "#4f4a46", 0.14 + h);
  if (b.use === "mixed" || b.use === "corner") { const f = faceOf(b.rect, b.face); seg([f.a[0] + f.n[0] * 0.12, f.a[1] + f.n[1] * 0.12], [f.b[0] + f.n[0] * 0.12, f.b[1] + f.n[1] * 0.12], 0.25, 2.6, i % 3 ? "#2f3b44" : "#59606a", 0.5, { e: 0.6 }); seg([f.a[0] + f.n[0] * 0.2, f.a[1] + f.n[1] * 0.2], [f.b[0] + f.n[0] * 0.2, f.b[1] + f.n[1] * 0.2], 0.2, 0.7, ["#c0392b", "#2e86c1", "#d4ac0d", "#239b56", "#7d3c98"][i % 5], 3.2, { e: 0.5 }); }
  if (b.use !== "garage") for (let fl = 1; fl < b.floors; fl++) { const f = faceOf(b.rect, b.face); seg([f.a[0] + f.n[0] * 0.08, f.a[1] + f.n[1] * 0.08], [f.b[0] + f.n[0] * 0.08, f.b[1] + f.n[1] * 0.08], 0.12, 1.3, (i + fl) % 4 ? "#3a4651" : "#e8d9a0", 0.14 + fl * 3.2 + 1, { e: (i + fl) % 4 ? 0 : 0.9 }); }
});
const TIERC: Record<string, string> = { low: "#f0a838", mid: "#5fb34f", high: "#9a6fd8" };
for (const u of P.units) {
  const col = u.kind === "landmark" ? "#d8ccb8" : u.kind === "facility" ? "#5b7fb8" : u.kind === "pub" ? "#4a1e1a" : u.kind === "club" ? "#3a2050" : "#a87a5e";
  u.parts.forEach((p, i) => { const h = u.floors * 3.4 + (u.kind === "landmark" ? 3 : 0.6) - (i ? 3 : 0); rb(p, h, col, 0.14); });
  for (const g of u.grounds ?? []) rb(g.rect, 0.18, "#c8c0ae");
  const p = u.parts[0], d = u.door, side = Math.abs(d[0] - p.minX) < 1.6 ? "W" : Math.abs(d[0] - p.maxX) < 1.6 ? "E" : Math.abs(d[1] - p.minZ) < 1.6 ? "S" : "N";
  const f = faceOf(p, side), sc = u.kind === "shop" ? TIERC[u.tier!] : u.kind === "landmark" ? "#b03a2e" : u.kind === "pub" ? "#1e8449" : u.kind === "club" ? "#ff2bd6" : "#2e86c1";
  if (u.kind !== "landmark") { seg([f.a[0] + f.n[0] * 0.15, f.a[1] + f.n[1] * 0.15], [f.b[0] + f.n[0] * 0.15, f.b[1] + f.n[1] * 0.15], 0.3, 2.8, "#26323a", 0.3, { e: 0.9 });
    seg([f.a[0] + f.n[0] * 0.3, f.a[1] + f.n[1] * 0.3], [f.b[0] + f.n[0] * 0.3, f.b[1] + f.n[1] * 0.3], 0.3, 1.1, u.phase === "reserved" && u.kind === "shop" ? "#8a8a8a" : sc, 3.3, { e: 1 });
    if (u.kind === "shop" || u.kind === "pub") seg([f.a[0] + f.n[0] * 0.9, f.a[1] + f.n[1] * 0.9], [f.b[0] + f.n[0] * 0.9, f.b[1] + f.n[1] * 0.9], 1.6, 0.15, sc, 2.9); }
  else { // a landmark: a columned / lit front
    for (let k = 0; k <= 5; k++) { const t = k / 5; cyls.push({ x: f.a[0] + (f.b[0] - f.a[0]) * t + f.n[0] * 1.2, z: f.a[1] + (f.b[1] - f.a[1]) * t + f.n[1] * 1.2, r: 0.5, h: 7, c: "#e8e2d4" }); }
    seg([f.a[0] + f.n[0] * 0.3, f.a[1] + f.n[1] * 0.3], [f.b[0] + f.n[0] * 0.3, f.b[1] + f.n[1] * 0.3], 0.5, 1.4, sc, 7.4, { e: 1 }); }
}
// ---- the home block: yard ground, fences with gaps at the gates, starter boxes, mats; the market's stalls and board ----
for (const f of P.forts) {
  rb(f.yard, 0.2, "#9c8f6a");
  const y = f.yard, sides: [XZ, XZ][] = [[[y.minX, y.minZ], [y.maxX, y.minZ]], [[y.maxX, y.minZ], [y.maxX, y.maxZ]], [[y.maxX, y.maxZ], [y.minX, y.maxZ]], [[y.minX, y.maxZ], [y.minX, y.minZ]]];
  for (const [a, b] of sides) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let t0 = 0; const gaps = [f.front, f.rear].map((g) => { const ps = (g[0] - a[0]) * (b[0] - a[0]) / L + (g[1] - a[1]) * (b[1] - a[1]) / L, off = Math.abs((g[0] - a[0]) * (b[1] - a[1]) / L - (g[1] - a[1]) * (b[0] - a[0]) / L); return off < 0.5 ? ps : -99; }).filter((x) => x > -99).sort((p, q) => p - q);
    for (const gp of [...gaps, L + 2]) { const t1 = Math.min(L, gp - 2); if (t1 > t0) seg([a[0] + (b[0] - a[0]) * t0 / L, a[1] + (b[1] - a[1]) * t0 / L], [a[0] + (b[0] - a[0]) * t1 / L, a[1] + (b[1] - a[1]) * t1 / L], 0.08, 1.8, "#9aa3a8", 0.2, { a: 0.55 }); t0 = gp + 2; } }
  const m = f.mat, dx = Math.abs(f.front[0] - m[0]) > Math.abs(f.front[1] - m[1]) ? Math.sign(f.front[0] - m[0]) : 0, dz = dx ? 0 : Math.sign(f.front[1] - m[1]);
  rb({ minX: m[0] - 1.6, maxX: m[0] + 1.6, minZ: m[1] - 1.6, maxZ: m[1] + 1.6 }, 0.06, f.colour, 0.2, { e: 0.6 });
  rb({ minX: m[0] - dx * 5 - (dx ? 0.95 : 1.2), maxX: m[0] - dx * 5 + (dx ? 0.95 : 1.2), minZ: m[1] - dz * 5 - (dx ? 1.2 : 0.95), maxZ: m[1] - dz * 5 + (dx ? 1.2 : 0.95) }, 1.5, "#b07a3a", 0.2);
}
for (const st of P.stalls) { rb(st.rect, st.id === "board" ? 2.2 : 2.4, st.id === "board" ? "#3d2b1f" : "#efe6d2", 0.17); if (st.id !== "board") rb({ minX: st.rect.minX - 0.4, maxX: st.rect.maxX + 0.4, minZ: st.rect.minZ - 0.4, maxZ: st.rect.maxZ + 0.4 }, 0.25, ({ sell: "#c0392b", buy: "#2e86c1", craft: "#d68910", upgrade: "#7d3c98" } as Record<string, string>)[st.id], 2.6, { e: 0.8 }); }
// ---- the El: the deck, side girders and columns ----
for (let i = 1; i < P.rail.pts.length; i++) { seg(P.rail.pts[i - 1], P.rail.pts[i], P.rail.deckW, 1.1, "#3b3f45", P.rail.deckY); for (const o of [-1, 1]) { const [a, b] = [P.rail.pts[i - 1], P.rail.pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L * o * (P.rail.deckW / 2), nz = -(b[0] - a[0]) / L * o * (P.rail.deckW / 2); seg([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], 0.4, 1.6, "#2b6b4f", P.rail.deckY + 1.1); } }
for (const c of rail.columns) for (const o of [-3, 3]) { const [a, b] = [P.rail.pts[0], P.rail.pts[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L * o, nz = -(b[0] - a[0]) / L * o; rb({ minX: c[0] + nx - 0.4, maxX: c[0] + nx + 0.4, minZ: c[1] + nz - 0.4, maxZ: c[1] + nz + 0.4 }, P.rail.deckY, "#2b6b4f"); }
// ---- street dressing: the planned close-up dressing, plus a generic kerbside line on the avenues and spokes ----
const DC: Record<string, string> = { van: "#e8e8e8", newsstand: "#6a1b9a", busshelter: "#9ccbe8", fence: "#6b4f3a", bins: "#2e7d32", crates: "#a1887f", hydrant: "#c0392b", display: "#f0b429", shutter: "#8a8a8a", fireescape: "#1f1f1f", scaffold: "#e67e22", bench: "#6d4c41", barrel: "#5d4037", sign: "#f4d03f", skip: "#e67e22" };
for (const d of STAIN_DRESSING) {
  if (d.kind === "gap" || d.kind === "awning") continue;
  if (d.kind === "tree") { const c: XZ = [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2]; cyls.push({ x: c[0], z: c[1], r: 0.18, h: 3, c: "#5b4636" }); boxes.push({ x: c[0], z: c[1], w: 3.2, d: 3.2, h: 2.8, y: 2.8, c: "#4f8a3c" }); continue; }
  if (d.kind === "lamp") { const c: XZ = [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2]; cyls.push({ x: c[0], z: c[1], r: 0.1, h: 5, c: "#2b2b2b" }); boxes.push({ x: c[0], z: c[1], w: 0.6, d: 0.6, h: 0.3, y: 5, c: "#fff3c4", e: 1 }); lamps.push([c[0], 5, c[1]]); continue; }
  if (d.kind === "fireescape") { rb(d.rect, d.h - 3, "#1f1f1f", 3.2, { a: 0.8 }); continue; }
  rb(d.rect, d.h, DC[d.kind] ?? "#888", 0.15, d.kind === "busshelter" ? { a: 0.45 } : {});
}
const doors = P.units.flatMap((u) => [u.door, ...(u.back ? [u.back] : [])]);
const busy = (p: XZ) => doors.some((d) => near(d, p, 7)) || P.crossings.some((c) => near(c.at, p, 9)) || STAIN_DRESSING.some((d) => near([(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2], p, 5));
let k = 0;
for (const r of P.roads.filter((q) => q.kind === "main" || q.kind === "side")) for (let i = 1; i < r.pts.length; i++) {
  const [a, b] = [r.pts[i - 1], r.pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
  for (let d = 10; d < L - 6; d += 13) for (const sgn of [-1, 1]) {
    const t = d / L, o = r.w / 2 + 0.7, p: XZ = [a[0] + (b[0] - a[0]) * t + nx * o * sgn, a[1] + (b[1] - a[1]) * t + nz * o * sgn];
    if (busy(p) || P.roads.some((q) => q !== r && q.pts.some((_, j) => j > 0 && segD(p, q.pts[j - 1], q.pts[j]) < q.w / 2 + q.sw + 2))) continue;
    k++;
    if (k % 3 === 0) { cyls.push({ x: p[0], z: p[1], r: 0.18, h: 3, c: "#5b4636" }); boxes.push({ x: p[0], z: p[1], w: 3, d: 3, h: 2.6, y: 2.8, c: k % 2 ? "#4f8a3c" : "#5f9a48" }); }
    else if (k % 3 === 1) { cyls.push({ x: p[0], z: p[1], r: 0.1, h: 5, c: "#2b2b2b" }); boxes.push({ x: p[0], z: p[1], w: 0.6, d: 0.6, h: 0.3, y: 5, c: "#fff3c4", e: 1 }); lamps.push([p[0], 5, p[1]]); }
    else if (k % 7 === 2) { const q: XZ = [p[0] - nx * sgn * 1.9, p[1] - nz * sgn * 1.9]; boxes.push({ x: q[0], z: q[1], w: 1.9, d: 4.4, h: 1.45, y: 0.1, c: ["#c0392b", "#2e86c1", "#e5e7e9", "#1c2833", "#d4ac0d"][k % 5], rot: Math.atan2(b[0] - a[0], b[1] - a[1]) }); }
    else if (k % 11 === 5) { const q: XZ = [p[0] - nx * sgn * 2, p[1] - nz * sgn * 2]; boxes.push({ x: q[0], z: q[1], w: 2.2, d: 6, h: 2.6, y: 0.1, c: "#ecf0f1", rot: Math.atan2(b[0] - a[0], b[1] - a[1]) }); }
    else if (k % 5 === 4) boxes.push({ x: p[0], z: p[1], w: 0.8, d: 1.6, h: 1.2, y: 0.15, c: "#2e7d32" });
  }
}
function segD(p: XZ, a: XZ, b: XZ) { const ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0; return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t); }
// ---- people and loot (the views' actors) ----
const person = (x: number, z: number, c: string) => { cyls.push({ x, z, r: 0.36, h: 1.15, y: 0.2, c }); cyls.push({ x, z, r: 0.24, h: 0.45, y: 1.38, c: "#f1c27d" }); };
const giant = (x: number, z: number) => { rb({ minX: x - 0.75, maxX: x + 0.75, minZ: z - 1.6, maxZ: z + 1.6 }, 1.0, "#d9d2c3", 0.2); rb({ minX: x - 0.3, maxX: x + 0.3, minZ: z + 1.2, maxZ: z + 2.6 }, 0.5, "#d9d2c3", 1.4); rb({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 2.6, maxZ: z - 1.4 }, 0.35, "#d9d2c3", 0.9); };
person(-119.5, -79, "#e74c3c"); giant(-119.5, -82.2); // Blake dragging the museum's dinosaur up Stain Way (view 2)
person(-110.2, -50.5, "#f1c40f"); // Tyson coming out of PLUG & PRAY
person(-169.5, -126.5, "#e74c3c"); giant(-169.5, -130.2); // Blake at the goods gate (view 3)
person(-62, 31, "#3498db"); // a rival on the pavement outside SCREW LOOSE (view 1)
person(2, 48, "#2ecc71"); person(-3, 92, "#f1c40f"); // the market at night (view 4)

// ---- the views ----
const views = [
  { name: "07-mock-leaving-starter-fort", eye: [-43, 1.55 + 0.2, 21] as [number, number, number], look: [-110, 4, 20] as [number, number, number],
    title: "Leaving F1 by its rear gate: across the ring road to its own starter shop, down Queasy Blvd to Stain Way",
    labels: [{ x: -69, y: 9, z: 30, t: "SCREW LOOSE HARDWARE (F1's own, 5 s)" }, { x: -103, y: 7, z: 25, t: "WHEELIE DODGY CYCLES" }, { x: -118, y: 2, z: 12, t: "Stain Way (64 m)" }, { x: -54, y: 0.5, z: 20, t: "the crossing" }, { x: -62, y: 2.4, z: 31, t: "a rival (F2)" }, { x: -150, y: 12, z: 0, t: "the pub's block" }] },
  { name: "08-mock-stain-way", eye: [-112.2, 1.55 + 0.15, -104] as [number, number, number], look: [-118, 3, 0] as [number, number, number],
    title: "Stain Way, the busiest strip: the pub and FISHY BUSINESS left, PLUG & PRAY right; Blake dragging the museum's dinosaur north",
    labels: [{ x: -141, y: 12, z: -53, t: "THE SOGGY SHAMROCK" }, { x: -133, y: 6, z: -28, t: "FISHY BUSINESS" }, { x: -103, y: 6, z: -52, t: "PLUG & PRAY" }, { x: -119.5, y: 2.6, z: -80, t: "Blake + the dinosaur" }, { x: -110.2, y: 2.2, z: -50.5, t: "Tyson" }, { x: -103, y: 8, z: 60, t: "SECOND CHANCE" }, { x: -133, y: 6, z: -84, t: "DYE TRYING (later)" }] },
  { name: "09-mock-museum-goods-gate", eye: [-163.5, 1.55 + 0.3, -141] as [number, number, number], look: [-168, 1.5, -40] as [number, number, number],
    title: "Out of the museum's goods gate with a giant: across Gnome Ave into Wood Havoc Lane behind the pub, or right to Stain Way",
    labels: [{ x: -169.5, y: 2.4, z: -126.5, t: "you, with the dinosaur" }, { x: -168, y: 3, z: -100, t: "Wood Havoc Lane (hidden, +16 m)" }, { x: -141, y: 12, z: -53, t: "THE SOGGY SHAMROCK (behind)" }, { x: -118, y: 3, z: -115, t: "Stain Way (quick, in view)" }, { x: -160, y: 3, z: -70, t: "WEE MICKEY's yard" }] },
  { name: "10-mock-market-night", eye: [3, 1.55 + 0.17, -17] as [number, number, number], look: [10, 3, 120] as [number, number, number], night: true,
    title: "NIGHT: the market square looking out up Market St to Rooster Velt and the precinct (the view to benchmark first)",
    labels: [{ x: 0, y: 2.6, z: 0, t: "the board" }, { x: -7, y: 3.2, z: -7, t: "CRAFT" }, { x: 7, y: 3.2, z: -7, t: "UPGRADE" }, { x: -7, y: 3.2, z: 7, t: "SELL" }, { x: 7, y: 3.2, z: 7, t: "BUY" }, { x: 4, y: 4, z: 70, t: "out to Market St and Rooster Velt" }, { x: 2, y: 2.2, z: 48, t: "a rival leaving" }] },
];

// ---- bundle the renderer, write the page, screenshot each view ----
const SCRATCH = process.env.MOCK_TMP ?? "/tmp/bfb-mock"; fs.mkdirSync(SCRATCH, { recursive: true });
await build({ entryPoints: ["tests/mock/scene.ts"], bundle: true, format: "iife", outfile: `${SCRATCH}/scene.js`, minify: true, logLevel: "error" });
const js = fs.readFileSync(`${SCRATCH}/scene.js`, "utf8");
const IMG = "docs/queens/compact/img", W = 1600, H = 900;
const browser = await chromium.launch({ ...(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
console.log(`scene: ${boxes.length} boxes, ${cyls.length} cylinders`);
for (const v of views) {
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:#000;overflow:hidden}canvas{width:${W}px;height:${H}px;display:block}#o{position:absolute;inset:0;font-family:DejaVu Sans,Arial,sans-serif}
    .l{position:absolute;transform:translate(-50%,-100%);background:#fffbe8e8;color:#1b1420;font-size:13px;font-weight:700;padding:2px 6px;border:1.5px solid #1b1420;border-radius:3px;white-space:nowrap}
    .l:after{content:"";position:absolute;left:50%;top:100%;width:1.5px;height:10px;background:#1b1420}
    #t{position:absolute;left:0;right:0;top:0;background:#1b1420d9;color:#fff;font-size:15px;padding:7px 12px}#t b{color:#ffcf40}
    #f{position:absolute;left:0;right:0;bottom:0;background:#1b1420d9;color:#ddd;font-size:12.5px;padding:5px 12px}</style></head>
    <body><canvas id="c" width="${W}" height="${H}"></canvas><div id="o"></div>
    <script>window.SCENE=${JSON.stringify({ boxes, cyls, lamps })};window.VIEW=${JSON.stringify(v)};</script><script>${js}</script></body></html>`;
  const file = path.resolve(`${SCRATCH}/${v.name}.html`); fs.writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto("file://" + file); await page.waitForFunction(() => (window as any).READY === true, null, { timeout: 180000 });
  await page.evaluate(({ title, night }) => {
    const o = document.getElementById("o")!;
    for (const l of (window as any).LABELS) if (l.vis && l.x > 20 && l.x < innerWidth - 20 && l.y > 50 && l.y < innerHeight - 30) { const d = document.createElement("div"); d.className = "l"; d.style.left = l.x + "px"; d.style.top = (l.y - 10) + "px"; d.textContent = l.t; o.appendChild(d); }
    const t = document.createElement("div"); t.id = "t"; t.innerHTML = `<b>PLANNING MOCK-UP</b> (plain blocks from the plan data; not the game, not its art or lighting) &nbsp;|&nbsp; ${title}`; o.appendChild(t);
    const f = document.createElement("div"); f.id = "f"; f.textContent = `Eye height 1.55 m, 90 degrees horizontal FOV, ${night ? "night fog 150 m" : "day fog 240 m"} (as the game). Storeys, footprints, doors, lanes and the planned dressing from shared/src/queens. Shopfront colours = tier (orange starter, green mid, purple high).`; o.appendChild(f);
  }, { title: v.title, night: !!(v as any).night });
  await page.screenshot({ path: `${IMG}/${v.name}.png` }); await page.close(); console.log("wrote", v.name);
}
await browser.close();
