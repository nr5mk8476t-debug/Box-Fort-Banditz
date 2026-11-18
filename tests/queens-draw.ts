// QUEENS: draws a window of the ACTIVE plan (check.ts usePlan) as SVG, from its data: blocks, the generated buildings,
// roads, crossings, paths, units, the forts, the market, the El. Shared by the Compact Queens report (and usable for
// v2). Overlays (routes, sightlines, dressing) are drawn by the caller through the `extra` callback in world coordinates.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { P } from "../shared/src/queens/active.js";
import { layout, railColumns, fortMaxRects } from "../shared/src/queens/check.js";
import type { QRect, XZ } from "../shared/src/queens/plan.js";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const TIER: Record<string, string> = { low: "#f0a838", mid: "#6fbf5a", high: "#9a6fd8" };
const STYLE_TINT: Record<string, string> = { low: "#f6d08a", mid: "#bfe0a6", high: "#d6c6f0", special: "#f2b8b8", home: "#ead7ae" };
const USE: Record<string, string> = { mixed: "#c9bfae", apartment: "#b9b0a2", corner: "#a99f8f", garage: "#ddd6c8", office: "#aab3bd" };
export const wrap = (t: string, n: number) => t.split(" ").reduce((ls: string[], w) => { const l = ls.at(-1); if (l !== undefined && (l + " " + w).length <= n) ls[ls.length - 1] = l + " " + w; else ls.push(w); return ls; }, []);

export interface H { X: (x: number) => number; Z: (z: number) => number; K: number;
  rect: (r: QRect, fill: string, extra?: string) => string; poly: (pts: XZ[]) => string;
  text: (x: number, z: number, t: string, size: number, o?: { w?: number; c?: string; a?: string; halo?: boolean; rot?: number }) => string;
  line: (pts: XZ[], stroke: string, w: number, extra?: string) => string; dot: (p: XZ, r: number, fill: string, extra?: string) => string }
export interface DrawOpts {
  title: string[]; labels: "city" | "close" | "none"; legend?: boolean;
  /** a white wash over the base map (0-1), for overlays */
  fade?: number; fort?: "mat" | "max" | "starter"; floors?: boolean; tierWash?: boolean; streetNames?: boolean;
  extra?: (h: H) => string; footer?: string[]; pad?: number;
}
export function drawMap(win: QRect, K: number, o: DrawOpts) {
  const lay = layout(), rail = railColumns(), PAD = o.pad ?? 24, W = (win.maxX - win.minX) * K + PAD * 2;
  const titleH = o.title.length ? 26 + o.title.length * 17 : 0, legH = o.legend ? 52 : 0, footH = (o.footer?.length ?? 0) * 16;
  const H0 = titleH, Hh = (win.maxZ - win.minZ) * K + PAD * 2 + titleH + legH + footH;
  const X = (x: number) => (x - win.minX) * K + PAD, Z = (z: number) => (win.maxZ - z) * K + PAD + H0;
  const h: H = {
    X, Z, K,
    rect: (r, fill, extra = "") => `<rect x="${X(r.minX).toFixed(1)}" y="${Z(r.maxZ).toFixed(1)}" width="${((r.maxX - r.minX) * K).toFixed(1)}" height="${((r.maxZ - r.minZ) * K).toFixed(1)}" fill="${fill}" ${extra}/>`,
    poly: (pts) => pts.map((p) => `${X(p[0]).toFixed(1)},${Z(p[1]).toFixed(1)}`).join(" "),
    text: (x, z, t, size, q = {}) => `<text x="${X(x).toFixed(1)}" y="${Z(z).toFixed(1)}" font-size="${size}" font-weight="${q.w ?? 700}" fill="${q.c ?? "#1b1420"}" text-anchor="${q.a ?? "middle"}" ${q.halo === false ? "" : 'paint-order="stroke" stroke="#ffffffe0" stroke-width="3"'} ${q.rot ? `transform="rotate(${q.rot} ${X(x).toFixed(1)} ${Z(z).toFixed(1)})"` : ""} dominant-baseline="middle">${esc(t)}</text>`,
    line: (pts, stroke, w, extra = "") => `<polyline points="${pts.map((p) => `${X(p[0]).toFixed(1)},${Z(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`,
    dot: (p, r, fill, extra = "") => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Z(p[1]).toFixed(1)}" r="${r}" fill="${fill}" ${extra}/>`,
  };
  const { rect, poly, text } = h, s: string[] = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${Hh.toFixed(0)}" font-family="DejaVu Sans, Arial, sans-serif"><defs>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#888" stroke-width="2.5"/></pattern>
    <clipPath id="win"><rect x="${PAD}" y="${PAD + H0}" width="${(win.maxX - win.minX) * K}" height="${(win.maxZ - win.minZ) * K}"/></clipPath></defs>`);
  s.push(`<rect width="${W}" height="${Hh}" fill="#f4efe4"/>`);
  o.title.forEach((t, i) => s.push(`<text x="${PAD}" y="${22 + i * 17 + (i ? 6 : 0)}" font-size="${i === 0 ? 20 : 12.5}" font-weight="${i < 2 ? 700 : 400}" fill="${i === 1 ? "#a02020" : "#1b1420"}">${esc(t)}</text>`));
  s.push(`<g clip-path="url(#win)">`, rect(win, "#cfc6b4"));
  const L = P.home.lane / 2, HB = P.home.half + P.home.pave;
  for (const b of P.blocks) for (const p of b.rects) s.push(rect(p.r, STYLE_TINT[b.style], 'fill-opacity="0.85"'));
  for (const g of lay.grounds) s.push(rect(g.rect, g.kind === "court" ? "#c9dfb0" : g.kind === "parking" ? "#cfcac2" : g.kind === "loading" ? "#d8d2c6" : "#e3dccb", 'fill-opacity="0.9"'));
  const shape = (k: string) => (k === "ring" ? "polygon" : "polyline");
  for (const r of P.roads) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#bdb6a8" stroke-width="${(r.w + 2 * r.sw) * K}" stroke-linejoin="round"/>`);
  for (const r of P.roads) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#5a5650" stroke-width="${r.w * K}" stroke-linejoin="round"/>`);
  for (const r of P.roads) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#e8d36a" stroke-width="${Math.max(0.6, 0.25 * K)}" stroke-dasharray="${3 * K} ${3 * K}"/>`);
  s.push(rect({ minX: -HB, maxX: HB, minZ: -HB, maxZ: HB }, "#bdb6a8"));
  s.push(rect({ minX: -L, maxX: L, minZ: -HB, maxZ: HB }, "#efe3c4"), rect({ minX: -HB, maxX: HB, minZ: -L, maxZ: L }, "#efe3c4"));
  for (const c of P.crossings) for (let i = 0; i < Math.round(c.w / 1.2); i++) {
    const off = -c.w / 2 + 0.6 + i * 1.2, hw = P.home.ringW / 2;
    s.push(c.across === "z" ? rect({ minX: c.at[0] + off - 0.35, maxX: c.at[0] + off + 0.35, minZ: c.at[1] - hw, maxZ: c.at[1] + hw }, "#f4f1ea") : rect({ minX: c.at[0] - hw, maxX: c.at[0] + hw, minZ: c.at[1] + off - 0.35, maxZ: c.at[1] + off + 0.35 }, "#f4f1ea"));
  }
  for (const p of [...P.paths.filter((q) => q.kind !== "market"), ...lay.alleys]) s.push(`<polyline points="${poly(p.pts)}" fill="none" stroke="${p.kind === "alley" || p.kind === "service" ? "#7ccfd9" : "#a6dfe6"}" stroke-width="${Math.max(2, p.w * K)}" stroke-linejoin="miter"/>`);
  for (const b of lay.buildings) s.push(rect(b.rect, USE[b.use], `stroke="#6e665a" stroke-width="${Math.max(0.4, K * 0.12)}"`));
  if (o.tierWash) for (const b of P.blocks) for (const p of b.rects) s.push(rect(p.r, STYLE_TINT[b.style], `fill-opacity="0.32" stroke="${({ low: "#e0901a", mid: "#4f9f3a", high: "#7a4fc0", special: "#c84040", home: "#a08050" } as Record<string, string>)[b.style]}" stroke-width="2.5" stroke-opacity="0.85"`));
  for (const u of P.units) for (const g of u.grounds ?? []) s.push(rect(g.rect, "#f1ead6", `stroke="#8a7a5a" stroke-width="0.8" stroke-dasharray="3 2"`));
  for (const u of P.units) for (const p of u.parts) {
    const fill = u.kind === "shop" ? (u.phase === "first" ? TIER[u.tier!] : "url(#hatch)") : u.kind === "landmark" ? "#e06060" : u.kind === "facility" ? "#4a78c8" : "#c46ad0";
    s.push(rect(p, fill, `stroke="#1b1420" stroke-width="${Math.max(1, K * 0.25)}" ${u.phase === "reserved" && u.kind !== "shop" ? 'stroke-dasharray="4 3"' : ""}`));
    if (u.kind === "shop" && u.phase === "reserved") s.push(rect(p, "none", `stroke="${TIER[u.tier!]}" stroke-width="${Math.max(2, K * 0.6)}"`));
  }
  for (const f of P.forts) {
    s.push(rect(f.yard, o.fort === "starter" ? "#b9a77f" : "#c8a165", `stroke="${f.colour}" stroke-width="${Math.max(2, K * 0.5)}"`));
    if (o.fort === "max") for (const q of fortMaxRects(f)) s.push(rect(q.rect, q.name.startsWith("house") ? "#8a5a2a" : q.name === "mat" ? f.colour : q.name.startsWith("trap") ? "#d62828" : "#efe6d2", `stroke="#1b1420" stroke-width="1"`));
    else if (o.fort === "starter") {
      // today's starter fort: the 2.4 x 1.9 m cardboard box, 4 m behind the mat, facing the front gate; one shelf unit
      const m = f.mat, dx = Math.sign(f.front[0] - m[0]) * (Math.abs(f.front[0] - m[0]) > Math.abs(f.front[1] - m[1]) ? 1 : 0), dz = dx ? 0 : Math.sign(f.front[1] - m[1]);
      const c: XZ = [m[0] - dx * 5, m[1] - dz * 5], hw = dx ? 0.95 : 1.2, hd = dx ? 1.2 : 0.95;
      s.push(rect({ minX: c[0] - hw, maxX: c[0] + hw, minZ: c[1] - hd, maxZ: c[1] + hd }, "#b07a3a", `stroke="#1b1420" stroke-width="1"`));
      s.push(rect({ minX: m[0] - 1.6, maxX: m[0] + 1.6, minZ: m[1] - 1.6, maxZ: m[1] + 1.6 }, f.colour, 'fill-opacity="0.85"'));
      const sh: XZ = [m[0] - dz * 6, m[1] + dx * 6]; s.push(rect({ minX: sh[0] - (dz ? 0.4 : 2), maxX: sh[0] + (dz ? 0.4 : 2), minZ: sh[1] - (dz ? 2 : 0.4), maxZ: sh[1] + (dz ? 2 : 0.4) }, "#efe6d2", `stroke="#1b1420" stroke-width="1"`));
    } else s.push(rect({ minX: f.mat[0] - 1.6, maxX: f.mat[0] + 1.6, minZ: f.mat[1] - 1.6, maxZ: f.mat[1] + 1.6 }, f.colour));
    for (const [g, c] of [[f.front, "#2a8a40"], [f.rear, "#3070d0"]] as [XZ, string][]) s.push(h.dot(g, Math.max(3, K * 1.2), c, 'stroke="#fff" stroke-width="1"'));
  }
  for (const st of P.stalls) s.push(rect(st.rect, "#ffffff", `stroke="#c0392b" stroke-width="${Math.max(1, K * 0.3)}"`));
  s.push(`<polyline points="${poly(P.rail.pts)}" fill="none" stroke="#2c2c2c" stroke-width="${P.rail.deckW * K}" stroke-opacity="0.55"/>`);
  s.push(`<polyline points="${poly(P.rail.pts)}" fill="none" stroke="#f4efe4" stroke-width="${Math.max(1, K * 0.3)}" stroke-dasharray="${2 * K} ${3 * K}"/>`);
  for (const c of rail.columns) s.push(`<rect x="${(X(c[0]) - Math.max(2, K * 0.8)).toFixed(1)}" y="${(Z(c[1]) - Math.max(2, K * 0.8)).toFixed(1)}" width="${(2 * Math.max(2, K * 0.8)).toFixed(1)}" height="${(2 * Math.max(2, K * 0.8)).toFixed(1)}" fill="#111"/>`);
  for (const u of P.units) { s.push(h.dot(u.door, Math.max(2.4, K * 0.9), "#1b1420")); if (u.back) s.push(h.dot(u.back, Math.max(2, K * 0.75), "#fff", 'stroke="#1b1420" stroke-width="1.2"')); }
  if (o.floors) for (const b of lay.buildings) if (b.rect.maxX > win.minX && b.rect.minX < win.maxX && b.rect.maxZ > win.minZ && b.rect.minZ < win.maxZ) s.push(text((b.rect.minX + b.rect.maxX) / 2, (b.rect.minZ + b.rect.maxZ) / 2, b.use === "garage" ? "g" : String(b.floors), Math.min(11, K * 2.6), { w: 400, c: "#3b342b", halo: false }));
  if (o.fade) s.push(rect(win, "#ffffff", `fill-opacity="${o.fade}"`));
  if (o.labels !== "none") {
    for (const u of P.units) {
      const p = u.parts[0], big = u.kind !== "shop", cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
      const nm = u.name.replace(/^THE /, ""), size = o.labels === "city" ? (big ? 10 : 7.5) : 11;
      const lines = o.labels === "city" ? (big ? wrap(u.name, 18) : wrap(nm, 11)) : wrap(u.name, 14);
      if (u.kind === "shop" && u.phase === "reserved") lines.push("(reserved)");
      lines.forEach((t, i) => s.push(text(cx, cz + ((lines.length - 1) / 2 - i) * (size * 1.1) / K, t, size, { w: i === lines.length - 1 && u.phase === "reserved" ? 400 : 700 })));
    }
    for (const f of P.forts) s.push(text((f.yard.minX + f.yard.maxX) / 2, (f.yard.minZ + f.yard.maxZ) / 2 + (o.fort === "max" ? -14 : 0), f.id, o.labels === "city" ? 11 : 14));
    s.push(text(0, 0, o.labels === "city" ? "MKT" : "", 9, { c: "#7a4a10" }));
  }
  if (o.streetNames) for (const r of P.roads) if (r.kind !== "border" && r.kind !== "ring") {
    const [a, b] = [r.pts[0], r.pts[r.pts.length - 1]], horiz = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    for (const t of r.kind === "main" ? [0.2, 0.8] : [0.55]) s.push(text(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r.name, 9, { c: "#fff", halo: false, rot: horiz ? 0 : -90 }));
  }
  if (o.extra) s.push(o.extra(h));
  s.push("</g>");
  let y = (win.maxZ - win.minZ) * K + PAD * 2 + H0 + 14;
  if (o.legend) {
    const leg: [string, string][] = [[TIER.low, "starter shop (low)"], [TIER.mid, "mid shop"], [TIER.high, "high-end shop"], ["url(#hatch)", "reserved shop unit (later)"], ["#e06060", "landmark"], ["#c46ad0", "pub / club"], ["#4a78c8", "police"], [USE.mixed, "shops + flats (closed)"], [USE.garage, "garage / lock-up"], ["#7ccfd9", "back lane / service yard way"], ["#f1ead6", "forecourt, dock, yard"], ["#111", "El column"]];
    leg.forEach(([c, t], i) => { const x = PAD + (i % 6) * 190, yy = y + Math.floor(i / 6) * 18; s.push(`<rect x="${x}" y="${yy - 10}" width="16" height="12" fill="${c}" stroke="#1b1420"/><text x="${x + 22}" y="${yy}" font-size="12" fill="#1b1420">${t}</text>`); });
    y += legH;
  }
  (o.footer ?? []).forEach((t) => { s.push(`<text x="${PAD}" y="${y}" font-size="12" fill="#1b1420">${esc(t)}</text>`); y += 16; });
  s.push("</svg>");
  return s.join("\n");
}

export async function toPngs(dir: string, names: string[]) {
  const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {});
  for (const name of names) {
    const file = path.resolve(`${dir}/${name}.svg`), s = fs.readFileSync(file, "utf8"), [w, hh] = [/width="([\d.]+)"/.exec(s)![1], /height="([\d.]+)"/.exec(s)![1]].map(Number);
    const page = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(hh) } });
    await page.goto("file://" + file); await page.screenshot({ path: `${dir}/${name}.png` }); await page.close();
  }
  await browser.close();
}
