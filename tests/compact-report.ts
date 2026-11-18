// COMPACT QUEENS: the proposal's pictures and tables, from the plan DATA (shared/src/queens/compact.ts), checked by the
// same rules as v2 (check.ts). Every picture is a DIAGRAM FROM DATA: not a screenshot, not built.
//   npx tsx tests/compact-encounters.ts && npx tsx tests/compact-walk.ts && npx tsx tests/compact-report.ts
// Writes docs/queens/compact/img/*.{svg,png} and docs/queens/compact/travel.md.
import fs from "node:fs";
import { usePlan, validate, routes, layout, railColumns, floorAreas } from "../shared/src/queens/check.js";
import { V2_PLAN, type XZ, type QRect, type QPlan } from "../shared/src/queens/plan.js";
import { COMPACT, LOOP_AT, SPOKE_OFF } from "../shared/src/queens/compact.js";
import { P } from "../shared/src/queens/active.js";
import { buildNet, route, type Net } from "../shared/src/queens/net.js";
import { Sight, sightings, legTime, type Mover, SPOT } from "../shared/src/queens/sight.js";
import { STAIN_DRESSING, JUNCTION_B, blockers, type Dress } from "../shared/src/queens/dressing.js";
import { drawMap, toPngs, esc, type H } from "./queens-draw.js";

const OUT = "docs/queens/compact", IMG = `${OUT}/img`; fs.mkdirSync(IMG, { recursive: true });
const A = LOOP_AT, names: string[] = [];
const save = (name: string, svg: string) => { fs.writeFileSync(`${IMG}/${name}.svg`, svg); names.push(name); };
const dij = (net: Net, from: number) => { const n = net.nodes.length, d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n); d[from] = 0; for (;;) { let u = -1, b = Infinity; for (let k = 0; k < n; k++) if (!done[k] && d[k] < b) { b = d[k]; u = k; } if (u < 0) break; done[u] = 1; for (const [v, w] of net.adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w; } return d; };

// ---- 1. v2 and Compact side by side, the same scale -------------------------------------------------------------------
{
  const K = 1.05, parts: { svg: string; w: number; h: number }[] = [];
  for (const plan of [V2_PLAN, COMPACT]) {
    usePlan(plan);
    const net = buildNet({}, layout()), ds = P.forts.map((f) => dij(net, net.at.get("mat:" + f.id)!));
    const reach = 235; // 25 s sprinting (the measured curve)
    const svg = drawMap(P.extent, K, { labels: "none", pad: 14, title: [plan === V2_PLAN ? "QUEENS v2: 940 x 690 m" : "COMPACT QUEENS: 408 x 408 m"], fade: 0.35,
      extra: (h: H) => {
        const s: string[] = [];
        // what 25 s of sprinting from a mat reaches (the network within 235 m of ANY fort's mat)
        for (let a = 0; a < net.nodes.length; a++) for (const [b] of net.adj[a]) if (b > a) { const m = Math.min(...ds.map((d) => Math.max(d[a], d[b]))); if (m <= reach) s.push(h.line([net.nodes[a], net.nodes[b]], "#1e88e5", 3.2, 'stroke-opacity="0.85"')); }
        const ho = P.ring + P.home.ringW / 2 + P.home.ringPave;
        s.push(h.rect({ minX: -ho, maxX: ho, minZ: -ho, maxZ: ho }, "none", 'stroke="#d81b60" stroke-width="3"'));
        for (const u of P.units.filter((x) => x.kind === "landmark")) { for (const p of u.parts) s.push(h.rect(p, "#d32f2f", 'stroke="#1b1420" stroke-width="1"')); const p = u.parts[0]; s.push(h.text((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2, u.id.toUpperCase(), 10, {})); }
        for (const u of P.units.filter((x) => x.kind === "pub" || x.kind === "club")) for (const p of u.parts) s.push(h.rect(p, "#c46ad0", 'stroke="#1b1420" stroke-width="1"'));
        return s.join("");
      } });
    parts.push({ svg, w: +/width="([\d.]+)"/.exec(svg)![1], h: +/height="([\d.]+)"/.exec(svg)![1] });
  }
  usePlan(COMPACT);
  const gap = 24, W = parts[0].w + gap + parts[1].w, Ht = Math.max(parts[0].h, parts[1].h) + 120;
  const bar = (x: number, y: number) => `<g><rect x="${x}" y="${y}" width="${100 * K}" height="6" fill="#1b1420"/><text x="${x + 50 * K}" y="${y - 5}" font-size="12" text-anchor="middle">100 m</text></g>`;
  save("01-v2-vs-compact", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${W}" height="${Ht}" fill="#f4efe4"/>
    <svg x="0" y="0">${parts[0].svg}</svg><svg x="${parts[0].w + gap}" y="0">${parts[1].svg}</svg>
    ${bar(parts[0].w + gap + 20, parts[1].h + 24)}
    <text x="16" y="${Ht - 92}" font-size="17" font-weight="700" fill="#1b1420">THE SAME SCALE (1 px = 0.95 m). DIAGRAM FROM THE PLAN DATA: not a screenshot, nothing built.</text>
    <text x="16" y="${Ht - 70}" font-size="13" fill="#1b1420">Pink square: the home block to the ring road's outer kerb (v2 150 m; Compact 124 m). Red: the four landmarks' footprints. Purple: the pub and the club.</text>
    <text x="16" y="${Ht - 50}" font-size="13" fill="#1e88e5" font-weight="700">Blue: every street, lane and path within 25 s of sprinting from ANY fort's mat (235 m along the walking network, the measured curve).</text>
    <text x="16" y="${Ht - 30}" font-size="13" fill="#1b1420">In v2, 25 s gets you through the starter streets. In Compact Queens it reaches all four landmark doors: each fort's own is 24-25 s, the far corner 33-34 s.</text>
  </svg>`);
}

// ---- 2. the clean labelled plan -----------------------------------------------------------------------------------
usePlan(COMPACT);
const issues = validate(), rt = routes().rows, lay = layout(), rail = railColumns();
const span = (id: string) => { const ts = rt.filter((r) => r.id === id).map((r) => r.out); return `${Math.min(...ts).toFixed(0)}-${Math.max(...ts).toFixed(0)} s`; };
save("02-compact-plan", drawMap(P.extent, 3.1, { labels: "city", legend: true, streetNames: true, tierWash: true,
  title: ["COMPACT QUEENS: THE PLAN (proposal)", "DIAGRAM FROM THE PLAN DATA (shared/src/queens/compact.ts): every footprint, door and lane as checked. Not a screenshot; nothing is built.",
    `408 x 408 m. ${issues.length ? issues.length + " RULES FAILING" : "Every v2 rule passes (the same checker)."} Black dots: front doors; white: second ways out (back doors, docks, goods gates). Zebras: crossings.`,
    "Washes: orange starter blocks, green mid, purple high-end, red landmark corners. Blue lanes: the back lanes and service ways (giant-wide)."],
  extra: (h) => {
    const s: string[] = [];
    for (const u of P.units.filter((x) => x.kind === "landmark")) { const p = u.parts[0]; s.push(h.text((p.minX + p.maxX) / 2, p.minZ + 4, `door ${span(u.id)}`, 9, { w: 400 })); }
    s.push(h.text(P.rail.pts[0][0] + 28, P.rail.pts[0][1] - 40, "THE EL (elevated line)", 10, { rot: 58 }));
    for (const [k, p] of Object.entries(P.border)) { const t = rt.filter((r) => r.id === "border_" + k).map((r) => r.out); s.push(h.text(p[0] + (p[0] > 0 ? -30 : p[0] < 0 ? 30 : 46), p[1] + (p[1] > 0 ? 4 : p[1] < 0 ? -4 : 0), `edge ${Math.min(...t).toFixed(0)}-${Math.max(...t).toFixed(0)} s`, 9, { c: "#c62828" })); }
    s.push(h.text(0, -P.ring - 1, "MARKET", 9, { c: "#7a4a10" }));
    return s.join("");
  } }));


// ---- 3. the journeys, drawn on the plan (a separate overlay), with where they meet and what's in view ----------------
const extraPts: Record<string, XZ> = { pubLane: [-176, -60], queasyW: [-168, 12], tysonWait: [-58, 4], campA: [0, 0] };
const net = buildNet(extraPts, lay), sight = new Sight(lay, blockers(STAIN_DRESSING));
const go = (keys: string[], avoid: { p: XZ; r: number }[] = []) => route(net, keys, avoid);
const walkJ = JSON.parse(fs.readFileSync(`${OUT}/data/walk.json`, "utf8"));
type J = { id: string; who: string; colour: string; dash?: string; pts: XZ[]; label: string; load: "empty" | "big" | "heavy" | "giant"; t?: number };
const J: J[] = [];
// (1) two players, two forts, two different shops (the same start, as the encounter search found)
const j1a = go(["mat:F1", "door:maisonpong"]), j1b = go(["mat:F4", "door:secondchance"]);
J.push({ id: "1a", who: "Blake (F1) to MAISON PONG", colour: "#e53935", pts: j1a.pts, label: "1a", load: "empty" }, { id: "1b", who: "Tyson (F4) to SECOND CHANCE", colour: "#f9a825", pts: j1b.pts, label: "1b", load: "empty" });
// (2) the museum: in at the front door; out by the goods gate with a giant, two ways home
const j2in = go(["mat:F1", "door:museum"]), j2quick = go(["back:museum", "mat:F1"]), j2cover = go(["back:museum", "pubLane", "queasyW", "mat:F1"], [{ p: [-118, -40], r: 40 }]);
J.push({ id: "2in", who: "Blake (F1) to the museum", colour: "#8e24aa", dash: "6 4", pts: j2in.pts, label: "2", load: "empty" },
  { id: "2q", who: "quick and exposed: along Gnome Ave, up Stain Way past the pub", colour: "#d81b60", pts: j2quick.pts, label: "2Q", load: "giant" },
  { id: "2c", who: "covered: across Gnome into Wood Havoc Lane behind the pub", colour: "#00897b", pts: j2cover.pts, label: "2C", load: "giant" });
// (3) the casino from F3: up Dit Marsh, under the El, past NEON FEVER
const j3 = go(["mat:F3", "door:casino"]);
J.push({ id: "3", who: "F3 to the casino (by the El and NEON FEVER)", colour: "#1e88e5", pts: j3.pts, label: "3", load: "empty" });
// (4) home with loot, a rival seen at the market's west exit: the usual way (rear gate) or round to the front gate
const j4usual = go(["door:secondchance", "mat:F1"]), j4round = go(["door:secondchance", "mat:F1"], [{ p: [-58, 4], r: 48 }]);
J.push({ id: "4u", who: "home from SECOND CHANCE by the rear gate (the usual way)", colour: "#6d4c41", pts: j4usual.pts, label: "4", load: "big" },
  { id: "4r", who: "round by Stain Way, Rooster Velt and Market St to the FRONT gate", colour: "#43a047", dash: "7 4", pts: j4round.pts, label: "4R", load: "big" });
const lenOf = (j: { dist: number }) => j.dist;
// the sightings along these journeys, computed (sight.ts, the close-up's dressing included)
const sit = (a: Mover, b: Mover) => sightings(sight, [a, b], { dt: 0.5 });
const mv = (name: string, legs: Mover["legs"]): Mover => ({ name, legs });
const s1 = sit(mv("Blake", [{ pts: j1a.pts, load: "empty" }, { inside: 30, at: [-126, 94] }, { pts: go(["door:maisonpong", "mat:F1"]).pts, load: "big" }]),
  mv("Tyson", [{ pts: j1b.pts, load: "empty" }, { inside: 30, at: [-110, 60] }, { pts: go(["door:secondchance", "mat:F4"]).pts, load: "big" }]));
// Blake's museum run vs Tyson at PLUG & PRAY (leaves 60 s after Blake: comes out as Blake comes home)
const tyson2 = mv("Tyson", [{ inside: 60, at: [-28, -20] }, { pts: go(["mat:F4", "door:plugpray"]).pts, load: "empty" }, { inside: 45, at: [-104, -52] }, { pts: go(["door:plugpray", "mat:F4"]).pts, load: "big" }]);
const s2q = sit(mv("Blake", [{ pts: j2in.pts, load: "empty" }, { inside: 75, at: [-160, -160] }, { pts: j2quick.pts, load: "giant" }]), tyson2);
const s2c = sit(mv("Blake", [{ pts: j2in.pts, load: "empty" }, { inside: 75, at: [-160, -160] }, { pts: j2cover.pts, load: "giant" }]), tyson2);
// (4): Blake coming home sees Tyson waiting at the market's west exit
const waitAt: XZ = [-58, 4], firstSeen = (() => { let d = 0; const L = j4usual.dist; for (; d <= L; d += 1) { const p = alongP(j4usual.pts, d); if (sight.sees(p, waitAt)) return { d, p }; } return null; })();
function alongP(pts: XZ[], d: number): XZ { for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d <= L) return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * d / L, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * d / L]; d -= L; } return pts[pts.length - 1]; }
const round4 = (() => { let n = 0, L = j4round.dist; for (let d = 0; d <= L; d += 1) if (sight.sees(alongP(j4round.pts, d), waitAt)) n++; return n; })();
// where the journeys share street (within 5 m), as numbered spots
const shared: { at: XZ; a: string; b: string }[] = [];
for (let i = 0; i < J.length; i++) for (let k = i + 1; k < J.length; k++) {
  if (J[i].id[0] === J[k].id[0] || (J[i].id[0] === "2" && J[k].id[0] === "4") || (J[i].id[0] === "1" && J[i].id !== "1b" && J[k].id[0] !== "3")) continue; // (the same player's own trips aside)
  for (let d = 0; d < 600; d += 4) { const p = alongP(J[i].pts, d); if (Math.max(Math.abs(p[0]), Math.abs(p[1])) <= P.ring + 18) continue; if (J[k].pts.some((_, m) => m > 0 && segD(p, J[k].pts[m - 1], J[k].pts[m]) < 5) && !shared.some((q) => Math.hypot(q.at[0] - p[0], q.at[1] - p[1]) < 30)) shared.push({ at: p, a: J[i].id, b: J[k].id }); }
}
function segD(p: XZ, a: XZ, b: XZ) { const ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0; return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t); }
// the camping spot: where on the walking network a waiting player sees the most of the simulated two-player trips
const enc = JSON.parse(fs.readFileSync(`${OUT}/data/encounters.json`, "utf8"));
const trips: XZ[] = []; { const sim = await import("./compact-encounters.js"); void sim; }
const samples: XZ[] = [];
{ const mats = P.forts.map((f) => "mat:" + f.id), doors = P.units.filter((u) => u.phase === "first" && (u.kind === "shop" || u.kind === "landmark")).map((u) => "door:" + u.id);
  for (const m of mats) for (const d of doors) { const r = go([m, d]); for (let x = 0; x <= r.dist; x += 6) samples.push(alongP(r.pts, x)); } }
const homeR = P.ring + 18, away = samples.filter((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])) > homeR);
const cands: XZ[] = []; for (const r of P.roads) for (let i = 1; i < r.pts.length; i++) { const [a, b] = [r.pts[i - 1], r.pts[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let x = 0; x <= L; x += 6) { const p: XZ = [a[0] + (b[0] - a[0]) * x / L, a[1] + (b[1] - a[1]) * x / L]; if (Math.max(Math.abs(p[0]), Math.abs(p[1])) > homeR) cands.push(p); } }
const scored = cands.map((c) => ({ c, n: away.filter((p) => sight.sees(c, p)).length })).sort((a, b) => b.n - a.n);
const camp = scored[0], campB = scored.find((x) => Math.hypot(x.c[0] - camp.c[0], x.c[1] - camp.c[1]) > 60)!;
const viewPoly = (c: XZ, R = SPOT.day) => { const out: XZ[] = []; for (let a = 0; a < 360; a += 2) { const dx = Math.sin(a * Math.PI / 180), dz = Math.cos(a * Math.PI / 180); let lo = 0, hi = R; if (sight.clear(c, [c[0] + dx * R, c[1] + dz * R])) lo = R; else for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (sight.clear(c, [c[0] + dx * m, c[1] + dz * m])) lo = m; else hi = m; } out.push([c[0] + dx * lo, c[1] + dz * lo]); } return out; };
const spots = enc.results.find((r: any) => r.plan === "compact" && r.players === 2 && r.choice === "near" && !r.magnet && r.spot === 1).spots as { at: XZ }[];
const legend4 = J.map((j) => `${j.label}: ${j.who} (${lenOf({ dist: Math.round(polyLen(j.pts)) })} m)`);
function polyLen(pts: XZ[]) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
save("03-compact-routes", drawMap(P.extent, 3.1, { labels: "city", fade: 0.55, streetNames: true,
  title: ["COMPACT QUEENS: FOUR JOURNEYS, WHERE THEY MEET, AND WHERE YOU CAN WATCH FROM", "ROUTE OVERLAY ON THE PLAN DIAGRAM (from data). The sightings are COMPUTED (sight.ts): buildings and tall dressing block; 90 m by day.",
    "Routes are the walking network's shortest paths (2C and 4R deliberately avoid the exposed street). Times: the real movement code (tests/compact-walk.ts) where given.",
    "Small red dots: where two players first saw each other away from home in 300 simulated 2-player scavenges. Grey wedge: the best camping spot's view (90 m)."],
  footer: legend4,
  extra: (h) => {
    const s: string[] = [];
    for (const p of spots) s.push(h.dot(p.at, 2.2, "#e53935", 'fill-opacity="0.45"'));
    for (const [c, col] of [[camp.c, "#455a64"], [campB.c, "#90a4ae"]] as [XZ, string][]) s.push(`<polygon points="${h.poly(viewPoly(c))}" fill="${col}" fill-opacity="0.22" stroke="${col}" stroke-width="1.5"/>`, h.dot(c, 7, col, 'stroke="#fff" stroke-width="2"'));
    s.push(h.text(camp.c[0], camp.c[1] + 7, "CAMP 1", 11, { c: "#263238" }), h.text(campB.c[0], campB.c[1] + 7, "CAMP 2", 11, { c: "#455a64" }));
    for (const j of J) s.push(h.line(j.pts, "#ffffff", 7), h.line(j.pts, j.colour, 4, j.dash ? `stroke-dasharray="${j.dash}"` : ""));
    for (const j of J) { const p = alongP(j.pts, Math.min(polyLen(j.pts) * 0.55, polyLen(j.pts) - 8)); s.push(h.dot(p, 11, j.colour, 'stroke="#fff" stroke-width="2"'), h.text(p[0], p[1], j.label, 10, { c: "#fff", halo: false })); }
    shared.forEach((q, i) => s.push(h.dot(q.at, 9, "#212121", 'stroke="#ffeb3b" stroke-width="3"'), h.text(q.at[0], q.at[1], String.fromCharCode(65 + i), 10, { c: "#ffeb3b", halo: false })));
    const show = (x: any, col: string, tag: string) => { s.push(h.line([x.atA, x.atB], col, 2.5, 'stroke-dasharray="3 3"'), h.dot(x.atA, 5, col), h.dot(x.atB, 5, col), h.text((x.atA[0] + x.atB[0]) / 2 + 6, (x.atA[1] + x.atB[1]) / 2 + 4, tag, 10, { c: col })); };
    for (const x of s1.filter((x) => Math.max(Math.abs(x.atA[0]), Math.abs(x.atA[1])) > homeR).slice(0, 2)) show(x, "#e53935", `seen ${x.minD.toFixed(0)} m`);
    for (const x of s2q.filter((x) => Math.max(Math.abs(x.atA[0]), Math.abs(x.atA[1])) > homeR).slice(0, 1)) show(x, "#d81b60", `2Q: seen at ${x.minD.toFixed(0)} m`);
    if (firstSeen) { s.push(h.line([firstSeen.p, waitAt], "#6d4c41", 2.5, 'stroke-dasharray="3 3"'), h.dot(waitAt, 7, "#f9a825", 'stroke="#1b1420" stroke-width="2"'), h.text(waitAt[0] + 10, waitAt[1] - 6, "rival waiting", 10, { a: "start" })); }
    return s.join("");
  } }));
fs.writeFileSync(`${OUT}/data/journeys.json`, JSON.stringify({
  journeys: J.map((j) => ({ id: j.id, who: j.who, m: Math.round(polyLen(j.pts)) })),
  sightings: { j1: s1, museumQuick: s2q, museumCovered: s2c }, j4: { firstSeen, roundSeenMetres: round4, usual: j4usual.dist, round: j4round.dist },
  shared: shared.map((q, i) => ({ mark: String.fromCharCode(65 + i), at: q.at, between: [q.a, q.b] })),
  camp: { best: camp.c, sees: camp.n, second: campB.c, secondSees: campB.n, of: away.length },
}, null, 1));
console.log("journeys:", J.map((j) => `${j.id} ${Math.round(polyLen(j.pts))} m`).join(", "));
console.log("J1 sightings:", s1.map((x) => `${x.t0}-${x.t1}s ${x.minD.toFixed(0)}m @${x.atA.map((v) => v.toFixed(0))}/${x.atB.map((v) => v.toFixed(0))}`).join(" | "));
console.log("museum quick:", s2q.map((x) => `${x.t0}-${x.t1}s ${x.minD.toFixed(0)}m @${x.atA.map((v) => v.toFixed(0))}/${x.atB.map((v) => v.toFixed(0))} ${x.loadA}`).join(" | "));
console.log("museum covered:", s2c.map((x) => `${x.t0}-${x.t1}s ${x.minD.toFixed(0)}m @${x.atA.map((v) => v.toFixed(0))}/${x.atB.map((v) => v.toFixed(0))} ${x.loadA}`).join(" | "));
console.log("J4 first sees the rival", firstSeen?.d, "m along at", firstSeen?.p, "| usual", j4usual.dist.toFixed(0), "round", j4round.dist.toFixed(0), "round seen for", round4, "m");
console.log("camp", camp.c, camp.n, "/", away.length, "second", campB.c, campB.n, "| shared", shared.map((q) => `${q.a}x${q.b}@${q.at.map((v) => v.toFixed(0))}`).join(" "));


// ---- 4. the close-up: the home block's west side and Stain Way south (the museum corner, the pub, the repair shop) ----
const DCOL: Record<string, string> = { van: "#37474f", newsstand: "#6a1b9a", busshelter: "#90caf9", fence: "#5d4037", gap: "#ff1744", bins: "#2e7d32", crates: "#a1887f", tree: "#66bb6a", hydrant: "#e53935", awning: "#ef9a9a", display: "#ffb300", shutter: "#9e9e9e", fireescape: "#212121", scaffold: "#ff7043", bench: "#795548", barrel: "#6d4c41", sign: "#fdd835", lamp: "#fbc02d", skip: "#fb8c00" };
const drawDress = (h: H, ds: Dress[], labels = true) => {
  const s: string[] = []; let n = 0;
  for (const d of ds) {
    if (d.kind === "awning") { s.push(h.rect(d.rect, DCOL.awning, 'fill-opacity="0.45" stroke="#c62828" stroke-width="0.8" stroke-dasharray="3 2"')); continue; }
    if (d.kind === "tree") { const c: XZ = [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2]; s.push(h.dot(c, 2.6 * h.K / 2, "#66bb6a", 'fill-opacity="0.5" stroke="#2e7d32"'), h.dot(c, 2, "#4e342e")); continue; }
    if (d.kind === "gap") { const c: XZ = [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2]; s.push(h.dot(c, 6, "#ff1744", 'stroke="#fff" stroke-width="2"'), h.text(c[0], c[1], "F", 8, { c: "#fff", halo: false })); continue; }
    s.push(h.rect(d.rect, DCOL[d.kind] ?? "#999", `stroke="${d.blocks ? "#000" : "#333"}" stroke-width="${d.blocks ? 1.6 : 0.6}"`));
  }
  if (labels) for (const d of ds) if (d.note) { n++; const c: XZ = [(d.rect.minX + d.rect.maxX) / 2, (d.rect.minZ + d.rect.maxZ) / 2]; s.push(h.dot([c[0] + 2.5, c[1] + 2.5], 7, "#fff", 'stroke="#1b1420" stroke-width="1.2"'), h.text(c[0] + 2.5, c[1] + 2.5, String(n), 8.5, { halo: false })); }
  return s.join("");
};
const notes0 = STAIN_DRESSING.filter((d) => d.note).map((d, i) => `${i + 1}. ${d.note}${d.blocks ? " [blocks sight]" : ""}${d.foot ? " [foot only]" : ""}`);
{
  const win: QRect = { minX: -192, maxX: 58, minZ: -136, maxZ: 60 };
  const quick = go(["back:museum", "mat:F1"]), cover = go(["back:museum", "pubLane", "queasyW", "mat:F1"], [{ p: [-118, -40], r: 40 }]);
  const pave = (h: H) => { // the usable pavement: the pavement strips of Stain Way and Queasy Blvd, minus what's on them
    const s: string[] = [];
    for (const [x0, x1] of [[-126, -122], [-114, -110]]) s.push(h.rect({ minX: x0, maxX: x1, minZ: -126, maxZ: 60 }, "#b2dfdb", 'fill-opacity="0.75"'));
    for (const [z0, z1] of [[5.5, 8.5], [15.5, 18.5]]) s.push(h.rect({ minX: -192, maxX: -62, minZ: z0, maxZ: z1 }, "#b2dfdb", 'fill-opacity="0.75"'));
    return s.join("");
  };
  save("04-closeup-stainway", drawMap(win, 5, { labels: "close", fort: "mat", floors: true,
    title: ["CLOSE-UP: STAIN WAY SOUTH AND THE HOME BLOCK'S WEST SIDE", "DIAGRAM FROM THE PLAN DATA + the planned dressing (dressing.ts), to scale. Not a screenshot. Numbers in buildings = storeys (g = garage).",
      "Teal: usable pavement (4 m; the dressing keeps 2.4 m+ clear: the widest loot, 1.5 m, plus you). Black-outlined dressing BLOCKS SIGHT; the rest you see past.",
      "Purple dashes: PLUG & PRAY's door to the pub's, across Stain Way (15 m). Red: the widest-loot route out of the museum's goods gate (giant-wide all the way).",
      "Green dashes: its covered twin through Wood Havoc Lane, behind the pub (16 m longer). F = a 1 m gap: you fit, a giant doesn't."],
    footer: notes0,
    extra: (h) => [pave(h),
      h.line(quick.pts, "#ffffff", 4.2 * h.K * 0.6), h.line(quick.pts, "#d81b60", 3, 'stroke-opacity="0.9"'), h.line(cover.pts, "#00897b", 3, 'stroke-dasharray="7 4"'),
      drawDress(h, STAIN_DRESSING),
      h.line([[-110.5, -52], [-125.5, -53]], "#6a1b9a", 2.5, 'stroke-dasharray="4 3"'),
      h.text(-140, -116, "MUSEUM FORECOURT + STEPS", 11), h.text(-170, -116, "GOODS GATE", 11, { c: "#00695c" }), h.text(-176, -12, "WOOD HAVOC LANE", 10, { rot: -90, c: "#00695c" }),
      h.text(-118, 30, "STAIN WAY", 12, { rot: -90, c: "#fff", halo: false }), h.text(-150, 12, "QUEASY BLVD", 12, { c: "#fff", halo: false }), h.text(-60, -122, "GNOME AVE ->", 11, { c: "#fff", halo: false })].join("") }));
}

// ---- 5. the home block: four starter boxes, and the largest planned forts ---------------------------------------------
{
  const win: QRect = { minX: -66, maxX: 66, minZ: -66, maxZ: 66 }, K = 5.6, panels: string[] = [];
  for (const mode of ["starter", "max"] as const) {
    panels.push(drawMap(win, K, { labels: "close", fort: mode, pad: 16,
      title: [mode === "starter" ? "A. FOUR STARTER BOXES (cycle 1)" : "B. FOUR MAYOR'S BOXFORTS (fully upgraded)", mode === "starter" ? "today's 2.4 x 1.9 m box + one shelf unit in a 36 x 36 m yard" : "house 18 x 14 m, 3 shelf units, safe, workbench, board, 2 trap sockets"],
      extra: (h) => {
        const s: string[] = [];
        // what you see from each front gate at eye height: the board in the square, and two stalls straight down the lanes
        for (const f of P.forts) { s.push(h.line([f.front, [0, 0]], "#2a8a40", 1.5, 'stroke-dasharray="3 3"')); }
        for (const st of P.stalls) s.push(h.text((st.rect.minX + st.rect.maxX) / 2, (st.rect.minZ + st.rect.maxZ) / 2, st.label, 7.5, { c: "#c0392b" }));
        const dim = (a: XZ, b: XZ, t: string) => s.push(h.line([a, b], "#1b1420", 1.3), h.text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2, t, 10.5));
        dim([-46, 52], [-10, 52], "yard 36 m"); dim([-10, 52], [10, 52], "lane 20"); dim([10, 52], [46, 52], "yard 36 m");
        dim([-64, -62], [64, -62], "the block, kerb to kerb: 116 m (124 m to the ring's outer kerb)");
        if (mode === "starter") s.push(h.text(28, -32, "a lot of empty yard", 10, { c: "#5d4037", w: 400 }), h.text(-28, 32, "(fence, junk, the box)", 9.5, { c: "#5d4037", w: 400 }));
        return s.join("");
      } }));
  }
  const ws = panels.map((p) => +/width="([\d.]+)"/.exec(p)![1]), hs = panels.map((p) => +/height="([\d.]+)"/.exec(p)![1]);
  const W = ws[0] + ws[1] + 20, Ht = Math.max(...hs) + 92;
  save("05-home-block", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${W}" height="${Ht}" fill="#f4efe4"/>
    <svg x="0" y="0">${panels[0]}</svg><svg x="${ws[0] + 20}" y="0">${panels[1]}</svg>
    <text x="16" y="${Ht - 66}" font-size="15" font-weight="700" fill="#a02020">DIAGRAMS FROM THE PLAN DATA, to scale. The yards are v2's (36 m: the largest planned fort fits, checked); the market lanes are 20 m (v2: 28 m).</text>
    <text x="16" y="${Ht - 46}" font-size="13" fill="#1b1420">Green dots: front gates (on the market lanes); blue: rear gates (to the ring road, a crossing, and that fort's own starter shop 5 s away). Dotted: each front gate's view of the board.</text>
    <text x="16" y="${Ht - 26}" font-size="13" fill="#1b1420">Stalls on the square's corners: each is straight down two lanes, so from any front gate you see the board and two stalls. The yards look EMPTY at cycle 1 (A): see the proposal.</text></svg>`);
}

// ---- 6. the one hard choice: Wood Havoc Lane behind the pub, BENT round WEE MICKEY's yard (A: the hidden way home from
// the museum costs ~16 m) or STRAIGHT (B: it costs nothing). Built as a copy of the plan, checked by the same rules.
// (Tested and dropped as a choice: a dog-leg where Queasy Blvd crosses Stain Way: no change to the encounter rate or the
// camper's view; see the proposal.)
function straightLane(): QPlan {
  const c = structuredClone(COMPACT) as QPlan; c.id = "compact-straightlane"; c.name = "Compact Queens (straight lane behind the pub)";
  c.paths.find((p) => p.id === "al_pub")!.pts = [[-168, SPOKE_OFF], [-168, -A]];
  c.units.find((u) => u.id === "pub")!.grounds![0].rect.minX = -165.5;
  return c;
}
const junction: Record<string, any> = {};
{
  const win: QRect = { minX: -192, maxX: -60, minZ: -126, maxZ: 40 }, K = 4.6, panels: string[] = [];
  for (const [tag, plan] of [["A", COMPACT], ["B", straightLane()]] as [string, QPlan][]) {
    usePlan(plan); const bad = validate(), ly = layout(), nt = buildNet({ pubLane: [tag === "A" ? -176 : -168, -60], queasyW: [-168, SPOKE_OFF] }, ly), sg = new Sight(ly, blockers(STAIN_DRESSING));
    const quick = route(nt, ["back:museum", "mat:F1"]), cover = route(nt, ["back:museum", "pubLane", "queasyW", "mat:F1"], [{ p: [-118, -40], r: 40 }]);
    // the corner camper (the best spot within 25 m of the junction) and what he sees of every trip away from home
    const smp: XZ[] = []; for (const f of P.forts) for (const u of P.units.filter((x) => x.phase === "first" && (x.kind === "shop" || x.kind === "landmark"))) { const r = route(nt, ["mat:" + f.id, "door:" + u.id]); for (let x = 0; x <= r.dist; x += 6) smp.push(alongP(r.pts, x)); }
    const aw = smp.filter((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])) > P.ring + 18);
    const cc: XZ[] = []; for (let x = -140; x <= -96; x += 3) for (let z = -10; z <= 40; z += 3) cc.push([x, z]);
    const best = cc.filter((c) => !ly.buildings.some((b) => c[0] > b.rect.minX && c[0] < b.rect.maxX && c[1] > b.rect.minZ && c[1] < b.rect.maxZ)).map((c) => ({ c, n: aw.filter((p) => sg.sees(c, p)).length })).sort((a, b) => b.n - a.n)[0];
    // how much of the covered museum run (behind the pub) can that camper see
    let coverSeen = 0; for (let d = 0; d <= cover.dist; d += 1) if (sg.sees(best.c, alongP(cover.pts, d))) coverSeen++;
    let quickSeen = 0; for (let d = 0; d <= quick.dist; d += 1) if (sg.sees(best.c, alongP(quick.pts, d))) quickSeen++;
    // Tyson at PLUG & PRAY's door, too: how much of each way home he sees
    const door: XZ = [-110.5, -52]; let qT = 0, cT = 0; for (let d = 0; d <= quick.dist; d += 1) if (sg.sees(door, alongP(quick.pts, d))) qT++; for (let d = 0; d <= cover.dist; d += 1) if (sg.sees(door, alongP(cover.pts, d))) cT++;
    junction[tag] = { rules: bad.length, camp: best.c, campSees: best.n / aw.length, quick: quick.dist, cover: cover.dist, coverSeenM: coverSeen, quickSeenM: quickSeen, quickTyson: qT, coverTyson: cT };
    const vp = (c: XZ) => { const out: XZ[] = []; for (let a = 0; a < 360; a += 2) { const dx = Math.sin(a * Math.PI / 180), dz = Math.cos(a * Math.PI / 180); let lo = 0, hi = SPOT.day; if (sg.clear(c, [c[0] + dx * hi, c[1] + dz * hi])) lo = hi; else for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (sg.clear(c, [c[0] + dx * m, c[1] + dz * m])) lo = m; else hi = m; } out.push([c[0] + dx * lo, c[1] + dz * lo]); } return out; };
    const j = junction[tag];
    panels.push(drawMap(win, K, { labels: "close", fort: "mat", pad: 14,
      title: [tag === "A" ? "A. THE LANE BENDS (recommended)" : "B. A STRAIGHT LANE", tag === "A" ? `hiding behind the pub costs +${(j.cover - j.quick).toFixed(0)} m: ${((j.cover - j.quick) / 2.65).toFixed(0)} s dragging a giant` : "hiding behind the pub costs nothing", `${bad.length ? bad.length + " RULES FAILING" : "every rule passes"}`],
      footer: [`Up Stain Way (red): ${j.quick.toFixed(0)} m. Tyson (PLUG & PRAY's door)`, `  sees ${j.quickTyson} m of it; the corner camper ${j.quickSeenM} m.`,
        `Behind the pub (green): ${j.cover.toFixed(0)} m. Tyson sees ${j.coverTyson} m;`, `  the corner camper ${j.coverSeenM} m (it comes out on Queasy Blvd).`],
      extra: (h) => [`<polygon points="${h.poly(vp(best.c))}" fill="#455a64" fill-opacity="0.2" stroke="#455a64" stroke-width="1.4"/>`,
        h.line(quick.pts, "#d81b60", 3), h.line(cover.pts, "#00897b", 3, 'stroke-dasharray="7 4"'), drawDress(h, tag === "A" ? STAIN_DRESSING : STAIN_DRESSING.filter((d) => !(d.kind === "fence" && d.rect.minX < -170)), false),
        h.dot(best.c, 7, "#455a64", 'stroke="#fff" stroke-width="2"'), h.text(best.c[0] + 4, best.c[1] + 7, "camper", 10, { a: "start", c: "#263238" })].join("") }));
  }
  usePlan(COMPACT);
  const ws = panels.map((p) => +/width="([\d.]+)"/.exec(p)![1]), hs = panels.map((p) => +/height="([\d.]+)"/.exec(p)![1]);
  const W = ws[0] + ws[1] + 20, Ht = Math.max(...hs) + 70;
  save("06-junction-choice", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${W}" height="${Ht}" fill="#f4efe4"/>
    <svg x="0" y="0">${panels[0]}</svg><svg x="${ws[0] + 20}" y="0">${panels[1]}</svg>
    <text x="16" y="${Ht - 44}" font-size="14" font-weight="700" fill="#a02020">${esc("DIAGRAMS FROM THE PLAN DATA, to scale. Views COMPUTED (sight.ts: 90 m; buildings and black-outlined dressing block).")}</text>
    <text x="16" y="${Ht - 24}" font-size="13" fill="#1b1420">${esc("Grey: the best camping spot near the corner, and its view. Red: the museum giant run up Stain Way; green dashes: behind the pub.")}</text></svg>`);
}
fs.writeFileSync(`${OUT}/data/junction.json`, JSON.stringify(junction, null, 1));
console.log("junction", JSON.stringify(junction));

await toPngs(IMG, names);
console.log(issues.length ? `${issues.length} rule(s) failing` : "all rules pass", "| images:", names.join(", "));
