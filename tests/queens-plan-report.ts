// QUEENS: draws the city plan from its DATA (shared/src/queens) and writes the generated tables.
//   npx tsx tests/queens-plan-report.ts
// Writes, in docs/queens/: img/queens-plan.{svg,png} (the whole city: roads, every building footprint, the shops, the
// landmarks, the alleys, the line), img/queens-home-block.{svg,png} (the home block with dimensions and the largest
// planned fort laid out in every yard), img/queens-neighbourhood.{svg,png} (one neighbourhood up close), city-plan.md
// and data/plan.json. All of them DIAGRAMS FROM THE PLAN DATA: not screenshots, not concept art, not built yet.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Q_ROADS, Q_PATHS, Q_UNITS, Q_FORTS, Q_CROSSINGS, Q_RAIL, Q_EXTENT, Q_BORDER, Q_BLOCKS, Q_STALLS, Q_VALUE_SHARE, Q_MATERIALS, HOME, RING, type QRect, type XZ } from "../shared/src/queens/plan.js";
import { validate, routes, railColumns, floorAreas, layout, fortMaxRects, visibilityProxy, totalArea, MEASURED } from "../shared/src/queens/check.js";
import { coverage } from "../shared/src/queens/layout.js";
import { buildTrashington } from "../shared/src/city.js";
import { setCityMap } from "../shared/src/index.js";

const OUT = "docs/queens"; fs.mkdirSync(`${OUT}/img`, { recursive: true }); fs.mkdirSync(`${OUT}/data`, { recursive: true });
const issues = validate(), rail = railColumns(), rt = routes().rows, areas = floorAreas(), lay = layout(), vis = visibilityProxy(), cov = coverage(lay);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const TIER = { low: "#f0a838", mid: "#6fbf5a", high: "#9a6fd8" } as Record<string, string>;
const STYLE_TINT = { low: "#f6d08a", mid: "#bfe0a6", high: "#d6c6f0", special: "#f2b8b8", home: "#ead7ae" } as Record<string, string>;
const USE = { mixed: "#c9bfae", apartment: "#b9b0a2", corner: "#a99f8f", garage: "#ddd6c8", office: "#aab3bd" } as Record<string, string>;
const span = (id: string) => { const ts = rt.filter((r) => r.id === id).map((r) => r.out); return `${Math.min(...ts).toFixed(0)}-${Math.max(...ts).toFixed(0)} s`; };
const wrap = (t: string, n: number) => t.split(" ").reduce((ls: string[], w) => { const l = ls.at(-1); if (l !== undefined && (l + " " + w).length <= n) ls[ls.length - 1] = l + " " + w; else ls.push(w); return ls; }, []);

/** one drawing of a window of the plan at a scale (px per metre) */
function draw(win: QRect, K: number, opts: { labels: "city" | "close"; floors?: boolean; dims?: boolean; title: string[]; legend?: boolean }) {
  const PAD = 24, W = (win.maxX - win.minX) * K + PAD * 2, top = 0, H = (win.maxZ - win.minZ) * K + PAD * 2 + 120;
  const X = (x: number) => (x - win.minX) * K + PAD, Z = (z: number) => (win.maxZ - z) * K + PAD + top;
  const rect = (r: QRect, fill: string, extra = "") => `<rect x="${X(r.minX)}" y="${Z(r.maxZ)}" width="${(r.maxX - r.minX) * K}" height="${(r.maxZ - r.minZ) * K}" fill="${fill}" ${extra}/>`;
  const poly = (pts: XZ[]) => pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(" ");
  const text = (x: number, z: number, t: string, size: number, o: { w?: number; c?: string; a?: string; halo?: boolean; rot?: number } = {}) =>
    `<text x="${X(x)}" y="${Z(z)}" font-size="${size}" font-weight="${o.w ?? 700}" fill="${o.c ?? "#1b1420"}" text-anchor="${o.a ?? "middle"}" ${o.halo === false ? "" : 'paint-order="stroke" stroke="#ffffffd9" stroke-width="3"'} ${o.rot ? `transform="rotate(${o.rot} ${X(x)} ${Z(z)})"` : ""} dominant-baseline="middle">${esc(t)}</text>`;
  const s: string[] = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, sans-serif"><defs>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="6" stroke="#888" stroke-width="2.5"/></pattern>
    <clipPath id="win"><rect x="${PAD}" y="${PAD}" width="${(win.maxX - win.minX) * K}" height="${(win.maxZ - win.minZ) * K}"/></clipPath></defs>`);
  s.push(`<rect width="${W}" height="${H}" fill="#f4efe4"/><g clip-path="url(#win)">`);
  s.push(rect(win, "#d5ccbc"));
  // the land: blocks, tinted by tier (the overlay), with the open ground in them
  for (const b of Q_BLOCKS) for (const p of b.rects) s.push(rect(p.r, STYLE_TINT[b.style], 'fill-opacity="0.85"'));
  for (const g of lay.grounds) s.push(rect(g.rect, g.kind === "court" ? "#c9dfb0" : g.kind === "parking" ? "#cfcac2" : g.kind === "loading" ? "#d8d2c6" : "#e3dccb", 'fill-opacity="0.9"'));
  // roads: pavement, carriageway, centre dashes
  const shape = (k: string) => (k === "ring" ? "polygon" : "polyline");
  for (const p of Q_PATHS.filter((q) => q.kind === "market")) s.push(`<polyline points="${poly(p.pts)}" fill="none" stroke="#efe3c4" stroke-width="${p.w * K}"/>`);
  for (const r of Q_ROADS) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#bdb6a8" stroke-width="${(r.w + 2 * r.sw) * K}" stroke-linejoin="round"/>`);
  for (const r of Q_ROADS) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#5a5650" stroke-width="${r.w * K}" stroke-linejoin="round"/>`);
  for (const r of Q_ROADS) s.push(`<${shape(r.kind)} points="${poly(r.pts)}" fill="none" stroke="#e8d36a" stroke-width="${Math.max(0.6, 0.25 * K)}" stroke-dasharray="${3 * K} ${3 * K}"/>`);
  // the block's own pavement + market lanes over it
  s.push(rect({ minX: -55, maxX: 55, minZ: -55, maxZ: 55 }, "#bdb6a8"));
  s.push(rect({ minX: -L, maxX: L, minZ: -55, maxZ: 55 }, "#efe3c4"), rect({ minX: -55, maxX: 55, minZ: -L, maxZ: L }, "#efe3c4"));
  for (const c of Q_CROSSINGS) for (let i = 0; i < Math.round(c.w / 1.2); i++) {
    const o = -c.w / 2 + 0.6 + i * 1.2, hw = HOME.ringW / 2;
    s.push(c.across === "z" ? rect({ minX: c.at[0] + o - 0.35, maxX: c.at[0] + o + 0.35, minZ: c.at[1] - hw, maxZ: c.at[1] + hw }, "#f4f1ea") : rect({ minX: c.at[0] - hw, maxX: c.at[0] + hw, minZ: c.at[1] + o - 0.35, maxZ: c.at[1] + o + 0.35 }, "#f4f1ea"));
  }
  // paths: alleys and walks (pedestrian only)
  for (const p of [...Q_PATHS.filter((q) => q.kind !== "market"), ...lay.alleys]) s.push(`<polyline points="${poly(p.pts)}" fill="none" stroke="${p.kind === "alley" || p.kind === "service" ? "#7ccfd9" : "#a6dfe6"}" stroke-width="${Math.max(2, p.w * K)}" stroke-linecap="butt"/>`);
  // the ordinary buildings (non-enterable): attached rows, corners, garages, offices
  for (const b of lay.buildings) s.push(rect(b.rect, USE[b.use], `stroke="#6e665a" stroke-width="${Math.max(0.4, K * 0.12)}"`));
  // the tier overlay (the city map): a light wash over each block and a border in its tier's colour
  if (opts.labels === "city") for (const b of Q_BLOCKS) for (const p of b.rects) s.push(rect(p.r, STYLE_TINT[b.style], `fill-opacity="0.38" stroke="${({ low: "#e0901a", mid: "#4f9f3a", high: "#7a4fc0", special: "#c84040", home: "#a08050" } as Record<string, string>)[b.style]}" stroke-width="3" stroke-opacity="0.9"`));
  // the units' grounds and footprints
  for (const u of Q_UNITS) for (const g of u.grounds ?? []) s.push(rect(g.rect, "#f1ead6", `stroke="#8a7a5a" stroke-width="0.8" stroke-dasharray="3 2"`));
  for (const u of Q_UNITS) for (const p of u.parts) {
    const fill = u.kind === "shop" ? (u.phase === "first" ? TIER[u.tier!] : "url(#hatch)") : u.kind === "landmark" ? "#e06060" : u.kind === "facility" ? "#4a78c8" : "#c46ad0";
    s.push(rect(p, fill, `stroke="#1b1420" stroke-width="${Math.max(1, K * 0.25)}" ${u.phase === "reserved" && u.kind !== "shop" ? 'stroke-dasharray="4 3"' : ""}`));
    if (u.kind === "shop" && u.phase === "reserved") s.push(rect(p, "none", `stroke="${TIER[u.tier!]}" stroke-width="${Math.max(2, K * 0.6)}"`));
  }
  // the home block
  for (const f of Q_FORTS) {
    s.push(rect(f.yard, "#c8a165", `stroke="${f.colour}" stroke-width="${Math.max(2, K * 0.5)}"`));
    if (opts.labels === "close") for (const p of fortMaxRects(f)) s.push(rect(p.rect, p.name.startsWith("house") ? "#8a5a2a" : p.name === "mat" ? f.colour : p.name.startsWith("trap") ? "#d62828" : "#efe6d2", `stroke="#1b1420" stroke-width="1"`));
    else s.push(rect({ minX: f.mat[0] - 1.6, maxX: f.mat[0] + 1.6, minZ: f.mat[1] - 1.6, maxZ: f.mat[1] + 1.6 }, f.colour));
    for (const [g, c] of [[f.front, "#2a8a40"], [f.rear, "#3070d0"]] as [XZ, string][]) s.push(`<circle cx="${X(g[0])}" cy="${Z(g[1])}" r="${Math.max(3, K * 1.4)}" fill="${c}" stroke="#fff" stroke-width="1"/>`);
  }
  for (const st of Q_STALLS) s.push(rect(st.rect, "#ffffff", `stroke="#c0392b" stroke-width="${Math.max(1, K * 0.3)}"`));
  // the line: deck + columns
  s.push(`<polyline points="${poly(Q_RAIL.pts)}" fill="none" stroke="#2c2c2c" stroke-width="${Q_RAIL.deckW * K}" stroke-opacity="0.62"/>`);
  s.push(`<polyline points="${poly(Q_RAIL.pts)}" fill="none" stroke="#f4efe4" stroke-width="${Math.max(1, K * 0.3)}" stroke-dasharray="${2 * K} ${3 * K}"/>`);
  for (const c of rail.columns) s.push(`<rect x="${X(c[0]) - Math.max(2.5, K)}" y="${Z(c[1]) - Math.max(2.5, K)}" width="${2 * Math.max(2.5, K)}" height="${2 * Math.max(2.5, K)}" fill="#111"/>`);
  // doors
  for (const u of Q_UNITS) {
    s.push(`<circle cx="${X(u.door[0])}" cy="${Z(u.door[1])}" r="${Math.max(2.6, K * 1.1)}" fill="#1b1420"/>`);
    if (u.back) s.push(`<circle cx="${X(u.back[0])}" cy="${Z(u.back[1])}" r="${Math.max(2.2, K * 0.9)}" fill="#fff" stroke="#1b1420" stroke-width="1.2"/>`);
  }
  if (opts.floors) for (const b of lay.buildings) if (b.rect.maxX > win.minX && b.rect.minX < win.maxX && b.rect.maxZ > win.minZ && b.rect.minZ < win.maxZ) s.push(text((b.rect.minX + b.rect.maxX) / 2, (b.rect.minZ + b.rect.maxZ) / 2, b.use === "garage" ? "g" : String(b.floors), Math.min(12, K * 3), { w: 400, c: "#3b342b", halo: false }));
  // labels
  for (const u of Q_UNITS) {
    const p = u.parts[0], big = u.kind !== "shop";
    const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    const name = u.name.replace(/^THE /, "");
    const lines = opts.labels === "city" ? (big ? [u.name, u.phase === "reserved" ? "(reserved: later)" : span(u.id)] : [...wrap(name, 12), u.phase === "first" ? span(u.id) : "reserved"]) : [...wrap(u.name, 16), u.phase === "first" ? `${span(u.id)} from the forts` : "reserved shop unit"];
    const size = opts.labels === "city" ? (big ? 11 : 8) : 13;
    lines.forEach((t, i) => s.push(text(cx, cz + ((lines.length - 1) / 2 - i) * (size * 1.15) / K, t, size, { w: i === lines.length - 1 ? 400 : 700 })));
  }
  if (opts.labels === "city") {
    for (const r of Q_ROADS) if (r.kind !== "border" && r.kind !== "ring") { const [a, b] = [r.pts[0], r.pts[1]], horiz = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]), t = 0.12; s.push(text(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r.name, 9, { c: "#fff", w: 700, halo: false, rot: horiz ? 0 : -90 })); }
    for (const f of Q_FORTS) s.push(text((f.yard.minX + f.yard.maxX) / 2, (f.yard.minZ + f.yard.maxZ) / 2, f.id, 12));
    s.push(text(0, 0, "MARKET", 10, { c: "#7a4a10" }));
    for (const [k, p] of Object.entries(Q_BORDER)) { const t = rt.filter((r) => r.id === "border_" + k).map((r) => r.out); s.push(`<circle cx="${X(p[0])}" cy="${Z(p[1])}" r="8" fill="#fff" stroke="#c62828" stroke-width="2.5"/>`, text(p[0], p[1], k, 9, { c: "#c62828", halo: false }), text(p[0] + (p[0] > 0 ? -40 : p[0] < 0 ? 40 : 0), p[1] + (p[1] > 0 ? -12 : p[1] < 0 ? 12 : 12), `${Math.min(...t).toFixed(0)}-${Math.max(...t).toFixed(0)} s`, 10, { c: "#c62828" })); }
    const rm = Q_RAIL.pts[1]; s.push(text(rm[0] + 22, rm[1] + 70, "THE QUEENS ELEVATED LINE", 11, { rot: -66 }));
  }
  s.push("</g>");
  // title + legend
  let y = (win.maxZ - win.minZ) * K + PAD * 2 + 18;
  opts.title.forEach((t, i) => { s.push(`<text x="${PAD}" y="${y}" font-size="${i === 0 ? 20 : i === 1 ? 13 : 12}" font-weight="${i < 2 ? 700 : 400}" fill="${i === 1 ? "#a02020" : "#1b1420"}">${esc(t)}</text>`); y += i === 0 ? 22 : 17; });
  if (opts.legend) {
    const leg: [string, string][] = [[TIER.low, "low shop (first)"], [TIER.mid, "mid shop (first)"], [TIER.high, "high shop (first)"], ["url(#hatch)", "reserved shop unit"], ["#e06060", "landmark"], ["#4a78c8", "police"], ["#c46ad0", "pub / club (later)"], [USE.mixed, "shops + flats (closed)"], [USE.office, "offices"], [USE.garage, "garages"], ["#c9dfb0", "courtyard"], ["#7ccfd9", "alley / walk"]];
    leg.forEach(([c, t], i) => { const x = PAD + (i % 6) * 168, yy = y + Math.floor(i / 6) * 18; s.push(`<rect x="${x}" y="${yy - 10}" width="16" height="12" fill="${c}" stroke="#1b1420"/><text x="${x + 22}" y="${yy}" font-size="12" fill="#1b1420">${t}</text>`); });
  }
  s.push("</svg>");
  return s.join("\n");
}
const L = HOME.lane / 2;

// ---- 1. the whole city ----
const city = draw(Q_EXTENT, 1.7, { labels: "city", legend: true, title: [
  "QUEENS: THE CITY PLAN (layout v2)",
  "DIAGRAM FROM THE PLAN DATA (shared/src/queens): every building footprint generated from its block's typology. Not a screenshot; not built yet.",
  `940 x 690 m. Under each place: the fastest and slowest fort's time to its door, empty-handed, sprinting (ESTIMATED from measured speeds). ${issues.length ? issues.length + " RULES FAILING" : "All plan rules pass."}`,
  "Each block is washed and outlined in its tier's colour (orange low, green mid, purple high, red special) over the physical city. Black dots: front doors; white: second ways out; black squares: the line's columns."] });
fs.writeFileSync(`${OUT}/img/queens-plan.svg`, city);

// ---- 2. the home block close-up, dimensioned ----
{
  const win = { minX: -95, maxX: 95, minZ: -95, maxZ: 95 }, K = 6.2;
  let svg = draw(win, K, { labels: "close", title: [
    "THE HOME BLOCK (layout v2): four equal 36 x 36 m yards, the market, the ring road",
    "DIAGRAM FROM THE PLAN DATA, to scale. In every yard: the LARGEST planned fort (the Mayor's Boxfort) and its fittings, checked to fit.",
    "Brown: house + porch (18 x 14 m). Red: trap sockets. Light: three shelf units, the safe, the workbench, the board. The fort's coloured square is its mat.",
    "Green dot: front gate (market lane). Blue dot: rear gate (outer pavement) -> its own crossing -> its own low store. Nobody walks through another yard."] });
  const PAD = 24, X = (x: number) => (x - win.minX) * K + PAD, Z = (z: number) => (win.maxZ - z) * K + PAD;
  const dim = (x0: number, z0: number, x1: number, z1: number, t: string, off = 0) => {
    const horiz = z0 === z1, ox = horiz ? 0 : off, oz = horiz ? off : 0;
    return `<g stroke="#1b1420" stroke-width="1.4"><line x1="${X(x0 + ox)}" y1="${Z(z0 + oz)}" x2="${X(x1 + ox)}" y2="${Z(z1 + oz)}"/><line x1="${X(x0 + ox)}" y1="${Z(z0 + oz) - 5}" x2="${X(x0 + ox)}" y2="${Z(z0 + oz) + 5}" ${horiz ? "" : 'transform="rotate(90 ' + X(x0 + ox) + " " + Z(z0 + oz) + ')"'}/><line x1="${X(x1 + ox)}" y1="${Z(z1 + oz) - 5}" x2="${X(x1 + ox)}" y2="${Z(z1 + oz) + 5}" ${horiz ? "" : 'transform="rotate(90 ' + X(x1 + ox) + " " + Z(z1 + oz) + ')"'}/></g><text x="${(X(x0 + ox) + X(x1 + ox)) / 2 + (horiz ? 0 : 8)}" y="${(Z(z0 + oz) + Z(z1 + oz)) / 2 + (horiz ? -6 : 4)}" font-size="13" font-weight="700" fill="#1b1420" text-anchor="${horiz ? "middle" : "start"}" paint-order="stroke" stroke="#fff" stroke-width="3">${t}</text>`;
  };
  const dims = [
    dim(-50, 57, -14, 57, "yard 36 m"), dim(-14, 57, 14, 57, "lane 28 m"), dim(14, 57, 50, 57, "yard 36 m"),
    dim(-58, 14, -58, 50, "36 m"), dim(50, -36, 55, -36, "5", 0), dim(55, -30, 65, -30, "road 10", 0), dim(65, -36, 70, -36, "5", 0),
    dim(-70, -88, 70, -88, "the whole block, kerb to kerb: 140 m (110 m inside its own pavement)"),
  ].join("");
  svg = svg.replace("</svg>", dims + "</svg>");
  fs.writeFileSync(`${OUT}/img/queens-home-block.svg`, svg);
}

// ---- 3. a neighbourhood up close: north-west of the block (the low streets, toward the mid avenue) ----
{
  const win = { minX: -262, maxX: 2, minZ: -2, maxZ: 182 };
  const svg = draw(win, 4.6, { labels: "close", floors: true, title: [
    "A NEIGHBOURHOOD UP CLOSE: north-west of the home block (low), to Stain Way (mid)",
    "DIAGRAM FROM THE PLAN DATA, to scale. Numbers = storeys of each ordinary building (shops or offices below, flats above: closed, no interiors); g = lock-up garage.",
    "Coloured units are playable shops (SCREW LOOSE across the ring from F1, WHEELIE DODGY on Market St); hatched units are reserved shopfronts for later stores.",
    "Each row backs onto a 5 m service alley with yards and garages; a cut-through splits the long block; corner buildings wrap the junctions."], legend: true });
  fs.writeFileSync(`${OUT}/img/queens-neighbourhood.svg`, svg);
}

// ---- PNGs ----
const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {});
for (const name of ["queens-plan", "queens-home-block", "queens-neighbourhood"]) {
  const file = path.resolve(`${OUT}/img/${name}.svg`), s = fs.readFileSync(file, "utf8"), [w, h] = [/width="([\d.]+)"/.exec(s)![1], /height="([\d.]+)"/.exec(s)![1]].map(Number);
  const page = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) } });
  await page.goto("file://" + file); await page.screenshot({ path: `${OUT}/img/${name}.png` }); await page.close();
}
await browser.close();

// ---- today's map, the same visibility proxy, for comparison ----
setCityMap("new"); const today: any = buildTrashington(); setCityMap("classic");
const tb = today.boxes.filter((b: any) => (b.kind === "building" || b.kind === "tower") && b.h > 2.5);
const tSamples: XZ[] = []; for (const e of today.roadNet?.edges ?? []) { const A = today.roadNet.nodes[e.a], B = today.roadNet.nodes[e.b], Ln = Math.hypot(B.x - A.x, B.z - A.z); for (let k = 0; k <= Ln; k += 25) tSamples.push([A.x + (B.x - A.x) * k / Ln, A.z + (B.z - A.z) * k / Ln]); }
const tCount = (p: XZ, r: number) => tb.filter((b: any) => Math.hypot(b.x - p[0], b.z - p[1]) <= r).length;
const tDay = tSamples.map((p) => tCount(p, 240)), tNight = tSamples.map((p) => tCount(p, 150));
const today_ = { buildings: tb.length, dayMax: Math.max(...tDay), dayMean: tDay.reduce((a, b) => a + b, 0) / tDay.length, nightMax: Math.max(...tNight), nightMean: tNight.reduce((a, b) => a + b, 0) / tNight.length };

// ---- the generated tables ----
const f0 = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const forts = Q_FORTS.map((f) => f.id), md: string[] = [];
md.push(`# Queens: the city plan (layout v2, generated)`, "", `Generated by \`npx tsx tests/queens-plan-report.ts\` from \`shared/src/queens/\`. Do not edit by hand. Every picture here is a **diagram from the plan data**: nothing is built yet.`, "");
md.push(`**Rules:** ${issues.length ? "FAILING:\n" + issues.map((i) => `- ${i.rule}: ${i.msg}`).join("\n") : "all pass (`shared/test/queens-plan.test.ts`)."}`, "");
md.push(`![The city](img/queens-plan.png)`, "", `![The home block](img/queens-home-block.png)`, "", `![A neighbourhood](img/queens-neighbourhood.png)`, "");
md.push(`## The city in numbers`, "", `| | |`, `|---|---|`,
  `| playable area | 940 x 690 m; ${(totalArea() / 1e4).toFixed(1)} ha of blocks |`,
  `| buildings | ${lay.buildings.length} ordinary (${lay.buildings.filter((b) => b.use === "garage").length} of them lock-up garages) + ${Q_UNITS.length} units (${Q_UNITS.filter((u) => u.kind === "shop" && u.phase === "first").length} playable shops, ${Q_UNITS.filter((u) => u.kind === "shop" && u.phase === "reserved").length} reserved shop units, 4 landmarks, the police, the pub, the club) |`,
  `| alleys and walks | ${lay.alleys.length} generated + ${Q_PATHS.filter((p) => p.kind !== "market").length} planned |`,
  `| building cover | ${(cov.reduce((s, c) => s + c.built, 0) / cov.reduce((s, c) => s + c.land, 0) * 100).toFixed(0)}% of block land (per block ${Math.min(...cov.map((c) => c.share * 100)).toFixed(0)}-${Math.max(...cov.map((c) => c.share * 100)).toFixed(0)}%) |`,
  `| the line | ${rail.columns.length} columns, every road and alley crossed with a clear span of ${Math.max(...rail.crossings.map((c) => c.span)).toFixed(0)} m or less |`, "");
md.push(`## How the times are worked out`, "", `Route lengths along the plan's pedestrian network (road centre lines, paths and the generated alleys, joined where they cross). Times use speeds **measured** with the game's own movement code: empty-handed = the sprint-held curve (573 m in 60 s on open ground) +${((MEASURED.streetLoss - 1) * 100).toFixed(0)}%; heavy ${MEASURED.heavy} m/s; a giant dragged alone ${MEASURED.giant} m/s. They are **estimates** until the blockout is walked by the real movement code (\`tests/route-matrix.ts\`).`, "");
md.push(`## Travel matrix (from each fort's mat; seconds out empty / back heavy / back with a giant)`, "", `| Place | | ${forts.join(" | ")} |`, `|---|---|${forts.map(() => "---").join("|")}|`);
const dests = [...new Set(rt.map((r) => r.id))];
for (const d of dests) { const rs = forts.map((f) => rt.find((r) => r.fort === f && r.id === d)!), k = rs[0].kind === "shop" ? `${rs[0].tier}${rs[0].phase === "reserved" ? " (reserved)" : ""}` : rs[0].kind; md.push(`| ${rs[0].to} | ${k} | ${rs.map((r) => `${f0(r.dist)} m · ${f0(r.out)} / ${f0(r.heavy)} / ${f0(r.giant)}`).join(" | ")} |`); }
const near = (f: string, p: (r: any) => boolean) => Math.min(...rt.filter((r) => r.fort === f && p(r)).map((r) => r.out));
const avg = (f: string, p: (r: any) => boolean) => { const v = rt.filter((r) => r.fort === f && p(r)).map((r) => r.out); return v.reduce((a, b) => a + b, 0) / v.length; };
md.push("", `## Fairness (playable places only)`, "", `| | ${forts.join(" | ")} | spread |`, `|---|${forts.map(() => "---").join("|")}|---|`);
for (const [label, fn] of [["nearest low", (f: string) => near(f, (r) => r.tier === "low" && r.phase === "first")], ["nearest mid", (f: string) => near(f, (r) => r.tier === "mid" && r.phase === "first")], ["nearest high", (f: string) => near(f, (r) => r.tier === "high" && r.phase === "first")], ["nearest landmark", (f: string) => near(f, (r) => r.kind === "landmark")], ["average to the 20 playable businesses", (f: string) => avg(f, (r) => (r.kind === "shop" && r.phase === "first") || r.kind === "landmark")], ["average to the 4 borders", (f: string) => avg(f, (r) => r.kind === "border")]] as [string, (f: string) => number][]) {
  const v = forts.map(fn); md.push(`| ${label} | ${v.map((x) => x.toFixed(1)).join(" | ")} | ${(Math.max(...v) - Math.min(...v)).toFixed(1)} s |`);
}
md.push("", `## The 8:00 scavenge (estimates: + 45 s robbing a store / 75 s a landmark objective, + 10 s banking)`, "", `| Fort | worst high-end heavy run | per scavenge | worst landmark run, giant dragged alone |`, `|---|---|---|---|`);
for (const f of forts) { const hi = Math.max(...rt.filter((r) => r.fort === f && r.tier === "high" && r.phase === "first").map((r) => r.out + 45 + r.heavy + 10)); const lm = Math.max(...rt.filter((r) => r.fort === f && r.kind === "landmark").map((r) => r.out + 75 + r.giant + 10)); md.push(`| ${f} | ${hi.toFixed(0)} s | ${Math.floor(480 / hi)} | ${lm.toFixed(0)} s (${(lm / 480 * 100).toFixed(0)}%) |`); }
md.push("", `## The units`, "", `| id | kind | tier | phase | name | footprint | door | keeps id | notes |`, `|---|---|---|---|---|---|---|---|---|`);
for (const u of Q_UNITS) md.push(`| ${u.id} | ${u.kind} | ${u.tier ?? ""} | ${u.phase} | ${u.name} | ${u.parts.map((p) => `${p.maxX - p.minX} x ${p.maxZ - p.minZ}`).join(" + ")} | (${u.door.join(", ")}) | ${u.keepsId ?? ""} | ${[u.theme, u.signature && "signature: " + u.signature, ...(u.grounds ?? []).map((g) => g.name), u.flag].filter(Boolean).join("; ")} |`);
md.push("", `## Floor areas (R15: about twice today's stores; today's average plot 115 m2, ~103 m2 of floor)`, "", `| store | tier | phase | footprint | usable | x today's | flag |`, `|---|---|---|---|---|---|---|`);
for (const a of areas) md.push(`| ${a.name} | ${a.tier} | ${a.phase} | ${a.w} x ${a.d} | ${a.usable.toFixed(0)} m2 | ${a.ratio.toFixed(2)} | ${a.flag ?? ""} |`);
md.push("", `## Blocks`, "", `| block | tier | typology | land | built |`, `|---|---|---|---|---|`, ...cov.map((c) => `| ${c.id} | ${c.style} | ${c.type} | ${(c.land / 1e4).toFixed(2)} ha | ${(c.share * 100).toFixed(0)}% |`));
md.push("", `## Materials (playable shops)`, "", `| material | sources |`, `|---|---|`, ...Q_MATERIALS.map((m) => `| ${m} | ${Q_UNITS.filter((u) => u.phase === "first" && u.materials?.includes(m)).map((u) => u.name).join(", ")} |`));
md.push("", `Loot value per cycle (proposed shares; Stage 3 tunes): ${Object.entries(Q_VALUE_SHARE).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ")}. More shops split the same budget.`, "");
md.push(`## How much city is in view (a PLANNING PROXY, not a rendering measurement)`, "", `Buildings whose centre is within the fog's reach (240 m by day, 150 m at night) of points every 25 m along every street, against the same count on today's new map. Today's city is merged per tile, so what a view costs is tiles x materials, not buildings; but the triangles, the shadows and the silhouettes do grow with this.`, "",
  `| | buildings in the city | in view by day (worst / average) | at night (worst / average) |`, `|---|---|---|---|`,
  `| today's new map | ${today_.buildings} | ${today_.dayMax} / ${today_.dayMean.toFixed(0)} | ${today_.nightMax} / ${today_.nightMean.toFixed(0)} |`,
  `| Queens v2 | ${vis.buildings} | ${vis.dayMax} / ${vis.dayMean.toFixed(0)} | ${vis.nightMax} / ${vis.nightMean.toFixed(0)} |`, "",
  `The worst spot is near the home block (${vis.worst.map((v) => v.toFixed(0)).join(", ")}). See \`perf.md\` for what this means for the budgets.`, "");
md.push(`## The line`, "", ...rail.crossings.map((c) => `- crosses ${c.what}: ${c.span.toFixed(0)} m clear span`), "");
fs.writeFileSync(`${OUT}/city-plan.md`, md.join("\n"));
fs.writeFileSync(`${OUT}/data/plan.json`, JSON.stringify({ issues, rail: { columns: rail.columns, crossings: rail.crossings }, routes: rt, areas, coverage: cov, visibility: { queens: vis, today: today_ } }, null, 1));
console.log(issues.length ? `${issues.length} rule(s) failing` : "all rules pass", "| today:", JSON.stringify(today_), "| queens:", JSON.stringify(vis));
