// QUEENS Stage 1: draws the city plan from its DATA (shared/src/queens/plan.ts) and writes the generated tables.
//   npx tsx tests/queens-plan-report.ts
// Writes docs/queens/img/queens-plan.svg + .png (a diagram from the plan data: not a screenshot, not concept art),
// docs/queens/city-plan.md (plots, route matrix, fairness, floor areas, the railway) and docs/queens/data/plan.json.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { Q_ROADS, Q_PATHS, Q_PLOTS, Q_FORTS, Q_REMOVED, Q_CROSSINGS, Q_RAIL, Q_EXTENT, Q_BORDER, Q_DISTRICTS, Q_VALUE_SHARE, Q_MATERIALS, type QPlot } from "../shared/src/queens/plan.js";
import { validate, routes, railColumns, floorAreas, MEASURED } from "../shared/src/queens/check.js";

const OUT = "docs/queens"; fs.mkdirSync(`${OUT}/img`, { recursive: true }); fs.mkdirSync(`${OUT}/data`, { recursive: true });
const issues = validate(), rail = railColumns(), rt = routes(), areas = floorAreas();
const K = 1.6, PAD = 30, W = (Q_EXTENT.maxX - Q_EXTENT.minX) * K + PAD * 2, H = (Q_EXTENT.maxZ - Q_EXTENT.minZ) * K + PAD * 2 + 120;
const X = (x: number) => (x - Q_EXTENT.minX) * K + PAD, Z = (z: number) => (Q_EXTENT.maxZ - z) * K + PAD;
const col = { low: "#f3b442", mid: "#8fc86e", high: "#9b7fd4", special: "#e98a8a", home: "#e7d3a8", fabric: "#d9cfbf" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg: string[] = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="DejaVu Sans, Arial, sans-serif">`);
svg.push(`<rect width="${W}" height="${H}" fill="#f4efe4"/>`);
svg.push(`<rect x="${X(Q_EXTENT.minX)}" y="${Z(Q_EXTENT.maxZ)}" width="${(Q_EXTENT.maxX - Q_EXTENT.minX) * K}" height="${(Q_EXTENT.maxZ - Q_EXTENT.minZ) * K}" fill="${col.fabric}"/>`);
for (const d of Q_DISTRICTS) svg.push(`<rect x="${X(d.rect.minX)}" y="${Z(d.rect.maxZ)}" width="${(d.rect.maxX - d.rect.minX) * K}" height="${(d.rect.maxZ - d.rect.minZ) * K}" fill="${(col as any)[d.style]}" fill-opacity="0.38"/>`);
const poly = (pts: [number, number][]) => pts.map((p) => `${X(p[0])},${Z(p[1])}`).join(" ");
for (const p of Q_PATHS.filter((q) => q.kind === "market")) svg.push(`<polyline points="${poly(p.pts)}" fill="none" stroke="#efe3c4" stroke-width="${p.w * K}"/>`);
const shape = (r: { pts: [number, number][]; kind: string }) => r.kind === "ring" ? "polygon" : "polyline";
for (const r of Q_ROADS) svg.push(`<${shape(r)} points="${poly(r.pts)}" fill="none" stroke="#b9b2a4" stroke-width="${(r.w + 2 * r.sw) * K}" stroke-linejoin="round"/>`);
for (const r of Q_ROADS) svg.push(`<${shape(r)} points="${poly(r.pts)}" fill="none" stroke="#56524c" stroke-width="${r.w * K}" stroke-linejoin="round"/>`);
for (const r of Q_ROADS) svg.push(`<${shape(r)} points="${poly(r.pts)}" fill="none" stroke="#e8d36a" stroke-width="1" stroke-dasharray="6 6"/>`);
for (const p of Q_PATHS.filter((q) => q.kind !== "market")) {
  const c = p.kind === "market" ? "#efe3c4" : p.kind === "alley" ? "#26c6da" : "#7fd8e4";
  svg.push(`<polyline points="${poly(p.pts)}" fill="none" stroke="${c}" stroke-width="${Math.max(3, p.w * K)}" ${p.kind === "market" ? "" : 'stroke-dasharray="5 4"'}/>`);
}
for (const z of Q_REMOVED) svg.push(`<rect x="${X(z.rect.minX)}" y="${Z(z.rect.maxZ)}" width="${(z.rect.maxX - z.rect.minX) * K}" height="${(z.rect.maxZ - z.rect.minZ) * K}" fill="none" stroke="#d62828" stroke-width="2" stroke-dasharray="8 5"/><text x="${X(z.rect.maxX) + 4}" y="${Z((z.rect.minZ + z.rect.maxZ) / 2)}" font-size="11" fill="#d62828">road removed</text>`);
// travel: the fastest fort's time to each place (and the slowest's)
const span = (name: string) => { const ts = rt.rows.filter((r) => r.to === name).map((r) => r.out); return `${Math.min(...ts).toFixed(0)}-${Math.max(...ts).toFixed(0)} s`; };
const plotCol = (p: QPlot) => p.kind === "store" ? (col as any)[p.tier!] : p.kind === "landmark" ? "#e05c5c" : p.kind === "facility" ? "#4a78c8" : p.kind === "reserved" ? "#bbbbbb" : col.home;
for (const p of Q_PLOTS) {
  if (p.id === "home") continue;
  const r = p.rect, w = (r.maxX - r.minX) * K, h = (r.maxZ - r.minZ) * K;
  svg.push(`<rect x="${X(r.minX)}" y="${Z(r.maxZ)}" width="${w}" height="${h}" fill="${plotCol(p)}" stroke="#1b1420" stroke-width="1.2" ${p.kind === "reserved" ? 'stroke-dasharray="4 3"' : ""}/>`);
  svg.push(`<circle cx="${X(p.door[0])}" cy="${Z(p.door[1])}" r="3.2" fill="#1b1420"/>`);
  if (p.back) svg.push(`<circle cx="${X(p.back[0])}" cy="${Z(p.back[1])}" r="2.4" fill="none" stroke="#1b1420" stroke-width="1.2"/>`);
  const big = p.kind === "landmark" || p.kind === "facility" || p.kind === "reserved";
  const wrap = (t: string, n: number) => t.split(" ").reduce((ls: string[], w) => { const l = ls.at(-1); if (l !== undefined && (l + " " + w).length <= n) ls[ls.length - 1] = l + " " + w; else ls.push(w); return ls; }, []);
  const lines = big ? [p.name.replace(/ \(.*\)/, ""), p.kind === "reserved" ? "(reserved: later)" : span(p.name)] : [...wrap(p.name, 13), span(p.name)];
  const cx = X((r.minX + r.maxX) / 2), cy = Z((r.minZ + r.maxZ) / 2);
  lines.forEach((t, i) => svg.push(`<text x="${cx}" y="${cy + (i - (lines.length - 1) / 2) * 11 + 4}" font-size="${big ? 12 : 9}" font-weight="${i === lines.length - 1 && !big || big && i ? 400 : 700}" text-anchor="middle" fill="#1b1420" paint-order="stroke" stroke="#ffffffcc" stroke-width="3">${esc(t)}</text>`));
}
for (const c of Q_CROSSINGS) { const ring = 8.5; const [w, h] = c.across === "x" ? [ring * 2, c.w] : [c.w, ring * 2]; svg.push(`<rect x="${X(c.at[0] - w / 2)}" y="${Z(c.at[1] + h / 2)}" width="${w * K}" height="${h * K}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 2"/>`); }
// the home block
for (const f of Q_FORTS) {
  const y = f.yard;
  svg.push(`<rect x="${X(y.minX)}" y="${Z(y.maxZ)}" width="${(y.maxX - y.minX) * K}" height="${(y.maxZ - y.minZ) * K}" fill="#c8a165" stroke="${f.colour}" stroke-width="2.5"/>`);
  svg.push(`<rect x="${X(f.mat[0] - 1.6)}" y="${Z(f.mat[1] + 1.6)}" width="${3.2 * K}" height="${3.2 * K}" fill="${f.colour}"/>`);
  for (const [g, c] of [[f.front, "#2a8a40"], [f.rear, "#3070d0"]] as [[number, number], string][]) svg.push(`<circle cx="${X(g[0])}" cy="${Z(g[1])}" r="3.4" fill="${c}"/>`);
  svg.push(`<text x="${X((y.minX + y.maxX) / 2)}" y="${Z((y.minZ + y.maxZ) / 2) - 6}" font-size="12" font-weight="700" text-anchor="middle" fill="#1b1420">${f.id}</text>`);
}
svg.push(`<text x="${X(0)}" y="${Z(0) + 4}" font-size="10" font-weight="700" text-anchor="middle" fill="#5a3a10">MARKET</text>`);
// the railway: deck + columns
svg.push(`<polyline points="${poly(Q_RAIL.pts)}" fill="none" stroke="#3a3a3a" stroke-width="${Q_RAIL.deckW * K}" stroke-opacity="0.55"/>`);
svg.push(`<polyline points="${poly(Q_RAIL.pts)}" fill="none" stroke="#f4efe4" stroke-width="1.2" stroke-dasharray="3 5"/>`);
for (const c of rail.columns) svg.push(`<rect x="${X(c[0]) - 3}" y="${Z(c[1]) - 3}" width="6" height="6" fill="#1b1420"/>`);
const rm = Q_RAIL.pts[1]; svg.push(`<text x="${X(rm[0]) + 12}" y="${Z(rm[1])}" font-size="12" font-weight="700" fill="#1b1420" transform="rotate(-75 ${X(rm[0]) + 12} ${Z(rm[1])})">THE QUEENS ELEVATED LINE</text>`);
for (const [k, p] of Object.entries(Q_BORDER)) svg.push(`<circle cx="${X(p[0])}" cy="${Z(p[1])}" r="7" fill="#fff" stroke="#d62828" stroke-width="2.5"/><text x="${X(p[0])}" y="${Z(p[1]) + 4}" font-size="9" font-weight="700" text-anchor="middle" fill="#d62828">${k}</text><text x="${X(p[0]) + (p[0] > 0 ? -12 : p[0] < 0 ? 12 : 0)}" y="${Z(p[1]) + (p[1] > 0 ? 20 : p[1] < 0 ? -12 : -12)}" font-size="10" text-anchor="${p[0] > 0 ? "end" : p[0] < 0 ? "start" : "middle"}" fill="#d62828">${span(`${k} border`)}</text>`);
// road names
for (const r of Q_ROADS) if (r.kind !== "border" && r.kind !== "ring") {
  const [a, b] = [r.pts[0], r.pts[1]], horiz = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
  const mx = a[0] + (b[0] - a[0]) * 0.18, mz = a[1] + (b[1] - a[1]) * 0.18;
  svg.push(`<text x="${X(mx)}" y="${Z(mz)}" font-size="9" fill="#fff" text-anchor="middle" ${horiz ? "" : `transform="rotate(-90 ${X(mx)} ${Z(mz)})"`} dy="3">${esc(r.name)}</text>`);
}
// title, label, legend
const y0 = H - 112;
svg.push(`<text x="${PAD}" y="${y0}" font-size="22" font-weight="700" fill="#1b1420">QUEENS: THE CITY PLAN (Stage 1)</text>`);
svg.push(`<text x="${PAD}" y="${y0 + 22}" font-size="13" font-weight="700" fill="#a02020">DIAGRAM FROM THE PLAN DATA (shared/src/queens/plan.ts): not a screenshot, not built yet</text>`);
svg.push(`<text x="${PAD}" y="${y0 + 42}" font-size="12" fill="#1b1420">${(Q_EXTENT.maxX - Q_EXTENT.minX)} x ${(Q_EXTENT.maxZ - Q_EXTENT.minZ)} m. Under each place: the fastest and slowest fort's time to its door, empty-handed and sprinting (ESTIMATED from measured speeds; Stage 2 walks it for real).</text>`);
svg.push(`<text x="${PAD}" y="${y0 + 60}" font-size="12" fill="#1b1420">Rules checked: ${issues.length ? issues.length + " FAILING" : "all pass"} (roads connected, none in the block or the removed zones, nothing on a road, doors on pavements, equal forts, rail columns clear, roster 6/5/5 + 4).</text>`);
const leg: [string, string][] = [[col.low, "low"], [col.mid, "medium"], [col.high, "high"], ["#e05c5c", "landmark"], ["#4a78c8", "police"], ["#bbbbbb", "pub/club (reserved)"], ["#26c6da", "alley / service"], ["#2a8a40", "fort front gate"], ["#3070d0", "fort rear gate"]];
leg.forEach(([c, t], i) => { const x = PAD + i * 150; svg.push(`<rect x="${x}" y="${y0 + 74}" width="16" height="12" fill="${c}" stroke="#1b1420"/><text x="${x + 22}" y="${y0 + 85}" font-size="12" fill="#1b1420">${t}</text>`); });
svg.push(`<text x="${PAD}" y="${y0 + 104}" font-size="11" fill="#1b1420">● door   ○ second way out   ■ railway column   dashed red: Blake's removed roads   N/E/S/W: border points</text>`);
svg.push("</svg>");
fs.writeFileSync(`${OUT}/img/queens-plan.svg`, svg.join("\n"));

// the home block close-up (same data, 10x the scale)
{
  const k = 9, E = 62, w = 2 * E * k, s2: string[] = [];
  const x = (v: number) => (v + E) * k, z = (v: number) => (E - v) * k;
  s2.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w + 70}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${w}" height="${w + 70}" fill="${col.fabric}"/>`);
  const ring = Q_ROADS.find((r) => r.kind === "ring")!, rp = ring.pts.map((p) => `${x(p[0])},${z(p[1])}`).join(" ");
  for (const p of Q_PATHS.filter((q) => q.kind === "market")) s2.push(`<polyline points="${p.pts.map((q) => `${x(q[0])},${z(q[1])}`).join(" ")}" fill="none" stroke="#efe3c4" stroke-width="${p.w * k}"/>`);
  s2.push(`<polygon points="${rp}" fill="none" stroke="#b9b2a4" stroke-width="${(ring.w + 2 * ring.sw) * k}"/><polygon points="${rp}" fill="none" stroke="#56524c" stroke-width="${ring.w * k}"/>`);
  for (const r of Q_ROADS) if (r.kind !== "ring") s2.push(`<polyline points="${r.pts.map((p) => `${x(p[0])},${z(p[1])}`).join(" ")}" fill="none" stroke="#56524c" stroke-width="${r.w * k}"/>`);
  // the block's own pavement and the market lanes over it (pedestrian: no road through the block)
  s2.push(`<rect x="${x(-36)}" y="${z(36)}" width="${72 * k}" height="${72 * k}" fill="#b9b2a4"/>`);
  for (const p of Q_PATHS.filter((q) => q.kind === "market")) { const [a, b] = p.pts, h = a[0] === b[0]; s2.push(`<rect x="${x(h ? -8 : -36)}" y="${z(h ? 36 : 8)}" width="${(h ? 16 : 72) * k}" height="${(h ? 72 : 16) * k}" fill="#efe3c4"/>`); }
  for (const c of Q_CROSSINGS) for (let i = 0; i < Math.round(c.w / 1.2); i++) {
    const o = -c.w / 2 + 0.6 + i * 1.2;
    if (c.across === "z") s2.push(`<rect x="${x(c.at[0] + o - 0.4)}" y="${z(c.at[1] + 4.5)}" width="${0.8 * k}" height="${9 * k}" fill="#f4f1ea"/>`);
    else s2.push(`<rect x="${x(c.at[0] - 4.5)}" y="${z(c.at[1] + o + 0.4)}" width="${9 * k}" height="${0.8 * k}" fill="#f4f1ea"/>`);
  }
  for (const p of Q_PLOTS) if (p.kind === "store" && Math.abs(p.door[0]) < E && Math.abs(p.door[1]) < E) { const r = p.rect; s2.push(`<rect x="${x(Math.max(r.minX, -E))}" y="${z(Math.min(r.maxZ, E))}" width="${(Math.min(r.maxX, E) - Math.max(r.minX, -E)) * k}" height="${(Math.min(r.maxZ, E) - Math.max(r.minZ, -E)) * k}" fill="${col.low}" stroke="#1b1420"/><text x="${x((Math.max(r.minX, -E) + Math.min(r.maxX, E)) / 2)}" y="${z((Math.max(r.minZ, -E) + Math.min(r.maxZ, E)) / 2)}" font-size="13" font-weight="700" text-anchor="middle">${esc(p.name.split(" ").slice(0, 2).join(" ").replace(/ &$/, ""))}</text><circle cx="${x(p.door[0])}" cy="${z(p.door[1])}" r="6" fill="#1b1420"/>`); }
  for (const f of Q_FORTS) {
    const y = f.yard; s2.push(`<rect x="${x(y.minX)}" y="${z(y.maxZ)}" width="${(y.maxX - y.minX) * k}" height="${(y.maxZ - y.minZ) * k}" fill="#c8a165" stroke="${f.colour}" stroke-width="5"/>`);
    s2.push(`<rect x="${x(f.mat[0] - 1.6)}" y="${z(f.mat[1] + 1.6)}" width="${3.2 * k}" height="${3.2 * k}" fill="${f.colour}" stroke="#1b1420"/><text x="${x(f.mat[0])}" y="${z(f.mat[1]) + 26}" font-size="12" text-anchor="middle">mat</text>`);
    s2.push(`<circle cx="${x(f.front[0])}" cy="${z(f.front[1])}" r="9" fill="#2a8a40"/><circle cx="${x(f.rear[0])}" cy="${z(f.rear[1])}" r="9" fill="#3070d0"/>`);
    s2.push(`<text x="${x((y.minX + y.maxX) / 2)}" y="${z(y.maxZ) + 22}" font-size="18" font-weight="700" text-anchor="middle">${f.id} (${f.corner})</text>`);
  }
  for (const [t, cx, cz] of [["SELL", -4, 4], ["BUY", 4, 4], ["CRAFT", -4, -4], ["UPGRADE", 4, -4]] as [string, number, number][]) s2.push(`<rect x="${x(cx - 3)}" y="${z(cz + 1.5)}" width="${6 * k}" height="${3 * k}" fill="#fff" stroke="#c0392b" stroke-width="2"/><text x="${x(cx)}" y="${z(cz) + 5}" font-size="13" font-weight="700" text-anchor="middle">${t}</text>`);
  s2.push(`<text x="${x(0)}" y="${z(-8.5)}" font-size="12" text-anchor="middle">the task board</text>`);
  s2.push(`<text x="12" y="${w + 24}" font-size="16" font-weight="700">THE HOME BLOCK (124 m across): four equal 24 x 24 m yards round the market; the ring road outside it</text>`);
  s2.push(`<text x="12" y="${w + 48}" font-size="13" fill="#a02020" font-weight="700">DIAGRAM FROM THE PLAN DATA: green = front gate (market), blue = rear gate (pavement), striped = crossings. Stall layout is a proposal.</text></svg>`);
  fs.writeFileSync(`${OUT}/img/queens-home-block.svg`, s2.join("\n"));
}

// PNGs (the SVGs drawn by the browser)
const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {});
for (const name of ["queens-plan", "queens-home-block"]) {
  const file = path.resolve(`${OUT}/img/${name}.svg`), s = fs.readFileSync(file, "utf8"), [w, h] = [/width="([\d.]+)"/.exec(s)![1], /height="([\d.]+)"/.exec(s)![1]].map(Number);
  const page = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) } });
  await page.goto("file://" + file); await page.screenshot({ path: `${OUT}/img/${name}.png` }); await page.close();
}
await browser.close();

// ---- the generated tables -------------------------------------------------------------------------------------------
const f0 = (v: number) => Number.isFinite(v) ? v.toFixed(0) : "—";
const md: string[] = [];
md.push(`# Queens: the city plan (Stage 1, generated)`, "", `Generated by \`npx tsx tests/queens-plan-report.ts\` from \`shared/src/queens/plan.ts\`. Do not edit by hand.`, "");
md.push(`**Rules:** ${issues.length ? "FAILING:\n" + issues.map((i) => `- ${i.rule}: ${i.msg}`).join("\n") : "all pass (`shared/test/queens-plan.test.ts`)."}`, "");
md.push(`![The plan](img/queens-plan.png)`, "", `![The home block](img/queens-home-block.png)`, "");
md.push(`## How the times are worked out`, "", `Route lengths are along the plan's pedestrian network (road centre lines and paths, joined where they cross; doors joined to the nearest line). Times use speeds **measured** with the game's own movement code: empty-handed = the measured sprint-held curve (573 m in 60 s on open ground) +${((MEASURED.streetLoss - 1) * 100).toFixed(0)}% (today's street routes measured within that of open ground); heavy (an Old CRT TV: no sprint) ${MEASURED.heavy} m/s; a giant dragged alone ${MEASURED.giant} m/s. They are **estimates** until the Stage 2 blockout is walked by the real movement code (\`tests/route-matrix.ts\`).`, "");
md.push(`## Travel matrix (from each fort's mat; seconds out empty / back heavy / back with a giant)`, "");
const forts = Q_FORTS.map((f) => f.id), dests = [...new Set(rt.rows.filter((r) => r.kind !== "fort").map((r) => r.to))];
md.push(`| Place | kind | ${forts.join(" | ")} |`, `|---|---|${forts.map(() => "---").join("|")}|`);
for (const d of dests) {
  const rs = forts.map((f) => rt.rows.find((r) => r.fort === f && r.to === d)!), k = rs[0].tier ?? rs[0].kind;
  md.push(`| ${d} | ${k} | ${rs.map((r) => `${f0(r.dist)} m · ${f0(r.out)} / ${f0(r.heavy)} / ${f0(r.giant)}`).join(" | ")} |`);
}
md.push("", `## Fairness (the brief: report unfair advantages, don't hide them in averages)`, "");
md.push(`| | ${forts.join(" | ")} | spread |`, `|---|${forts.map(() => "---").join("|")}|---|`);
const near = (f: string, p: (r: any) => boolean) => Math.min(...rt.rows.filter((r) => r.fort === f && p(r)).map((r) => r.out));
const avg = (f: string, p: (r: any) => boolean) => { const v = rt.rows.filter((r) => r.fort === f && p(r)).map((r) => r.out); return v.reduce((a, b) => a + b, 0) / v.length; };
for (const [label, fn] of [["nearest low (s)", (f: string) => near(f, (r) => r.tier === "low")], ["nearest mid", (f: string) => near(f, (r) => r.tier === "mid")], ["nearest high", (f: string) => near(f, (r) => r.tier === "high")], ["nearest landmark", (f: string) => near(f, (r) => r.kind === "landmark")], ["average to all 20 businesses", (f: string) => avg(f, (r) => r.kind === "store" || r.kind === "landmark")], ["average to the 4 borders", (f: string) => avg(f, (r) => r.kind === "border")]] as [string, (f: string) => number][]) {
  const v = forts.map(fn); md.push(`| ${label} | ${v.map((x) => x.toFixed(1)).join(" | ")} | ${(Math.max(...v) - Math.min(...v)).toFixed(1)} s |`);
}
md.push("", `Known lopsidedness: the north border is the longest (68-71 s) because the old north spur is removed (Blake); F3/F4 are ~5 s closer to THE UPPER CRUST (south) and F1/F2 to NEEDLE DROP (north). Each fort's own low store (the pinwheel) is 5 s away for all four.`, "");
md.push(`## The 8:00 scavenge (estimates: + 45 s robbing a store / 75 s a landmark objective, + 10 s banking)`, "");
md.push(`| Fort | worst high-end heavy run | runs per scavenge | worst landmark run, giant dragged alone |`, `|---|---|---|---|`);
for (const f of forts) {
  const hi = Math.max(...rt.rows.filter((r) => r.fort === f && r.tier === "high").map((r) => r.out + 45 + r.heavy + 10));
  const lm = Math.max(...rt.rows.filter((r) => r.fort === f && r.kind === "landmark").map((r) => r.out + 75 + r.giant + 10));
  md.push(`| ${f} | ${hi.toFixed(0)} s | ${Math.floor(480 / hi)} | ${lm.toFixed(0)} s (${(lm / 480 * 100).toFixed(0)}% of the scavenge) |`);
}
md.push("", `A landmark giant dragged home alone is most of a scavenge: that's the case for the DRAG HARNESS / HAUL OF SHAME, a friend helping, and landmark loot that is mostly heavy-not-giant (decision log D-12).`, "");
md.push(`## Plots`, "", `| id | kind | tier | name | footprint (m) | door | keeps id | notes |`, `|---|---|---|---|---|---|---|---|`);
for (const p of Q_PLOTS) md.push(`| ${p.id} | ${p.kind} | ${p.tier ?? ""} | ${p.name} | ${p.rect.maxX - p.rect.minX} x ${p.rect.maxZ - p.rect.minZ} | (${p.door.join(", ")}) | ${p.keepsId ?? ""} | ${[p.theme, p.signature && "signature: " + p.signature, p.flag].filter(Boolean).join("; ")} |`);
md.push("", `## Floor areas (R15: about twice today's stores; today's average plot 115 m2, ~103 m2 of floor)`, "", `| store | tier | footprint | usable floor | x today's | flag |`, `|---|---|---|---|---|---|`);
for (const a of areas) md.push(`| ${a.name} | ${a.tier} | ${a.w} x ${a.d} | ${a.usable.toFixed(0)} m2 | ${a.ratio.toFixed(2)} | ${a.flag ?? ""} |`);
md.push("", `## Materials (proposed): who supplies what`, "", `| material | sources |`, `|---|---|`);
for (const m of Q_MATERIALS) md.push(`| ${m} | ${Q_PLOTS.filter((p) => p.materials?.includes(m)).map((p) => p.name).join(", ")} |`);
md.push("", `Loot value per cycle (proposed shares; Stage 3 tunes): ${Object.entries(Q_VALUE_SHARE).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ")}. More shops split the same budget: they don't add money.`, "");
md.push(`## The elevated line`, "", `${rail.columns.length} columns (never on a lane, pavement, path or inside a business); clear spans over the roads it crosses:`, "", ...rail.crossings.map((c) => `- ${c.road}: ${c.span.toFixed(0)} m${c.ok ? "" : " (TOO LONG)"}`), "");
fs.writeFileSync(`${OUT}/city-plan.md`, md.join("\n"));
fs.writeFileSync(`${OUT}/data/plan.json`, JSON.stringify({ issues, rail: { columns: rail.columns, crossings: rail.crossings }, routes: rt.rows, areas }, null, 1));
console.log(issues.length ? `${issues.length} rule(s) failing` : "all rules pass", "| wrote", `${OUT}/city-plan.md, img/queens-plan.{svg,png}, img/queens-home-block.{svg,png}`);
