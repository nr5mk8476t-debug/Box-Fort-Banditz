// TRASHINGTON 400 (Blake, 2026-11-20: "shrink the city down to 400 by 400"; 18 m yards): the plan's pictures and travel table, and the
// grey-box playable test's map. Diagrams FROM THE PLAN DATA (not screenshots). Times WALKED with the game's own movement
// code (tests/compact-walk.ts: stepMovement, sprint held, real stamina, no collisions).
//   npx tsx tests/trash400-report.ts   -> docs/trashington400/img/*.png, docs/trashington400/data/walk.json
import fs from "node:fs";
import { usePlan, validate, routes, layout } from "../shared/src/queens/check.js";
import { TRASH500 } from "../shared/src/queens/trashington.js";
import { TRASH400, LOOP_AT } from "../shared/src/queens/trashington400.js";
import { P } from "../shared/src/queens/active.js";
import { buildNet, type Net } from "../shared/src/queens/net.js";
import { setCityMap, buildTrashington, TEST_INFO } from "../shared/src/index.js";
import { drawMap, toPngs, type H } from "./queens-draw.js";
import { table } from "./compact-walk.js";

const OUT = "docs/trashington400", IMG = `${OUT}/img`; fs.mkdirSync(IMG, { recursive: true }); fs.mkdirSync(`${OUT}/data`, { recursive: true });
const names: string[] = [];
const save = (name: string, svg: string) => { fs.writeFileSync(`${IMG}/${name}.svg`, svg); names.push(name); };
const dij = (net: Net, from: number) => { const n = net.nodes.length, d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n); d[from] = 0; for (;;) { let u = -1, b = Infinity; for (let k = 0; k < n; k++) if (!done[k] && d[k] < b) { b = d[k]; u = k; } if (u < 0) break; done[u] = 1; for (const [v, w] of net.adj[u]) if (d[u] + w < d[v]) d[v] = d[u] + w; } return d; };

// ---- the walk (real movement code) ----
const walked = table(TRASH400);
fs.writeFileSync(`${OUT}/data/walk.json`, JSON.stringify(walked.map(({ outPts, homePts, ...r }: any) => r), null, 1));
console.log("== Trashington 400: walked with the real movement code (no collisions) ==");
for (const r of walked) console.log(`${r.fort} ${r.what.padEnd(13)} ${r.name.padEnd(36)} out ${r.outM.toFixed(0).padStart(4)} m ${r.out.toFixed(1).padStart(5)} s | heavy ${r.heavy.toFixed(0).padStart(4)} s | giant ${r.giant.toFixed(0).padStart(4)} s`);

// ---- 1. Trashington 500 (the last test) and 400 side by side, the same scale (the second panel's ids renamed: both
//      panels define the same clip paths) ----
{
  const K = 1.05, parts: { svg: string; w: number; h: number }[] = [];
  for (const plan of [TRASH500, TRASH400]) {
    usePlan(plan);
    const net = buildNet({}, layout()), ds = P.forts.map((f) => dij(net, net.at.get("mat:" + f.id)!));
    const reach = 235;
    parts.push((() => {
      const svg = drawMap(P.extent, K, { labels: "none", pad: 14, title: [plan === TRASH500 ? "TRASHINGTON 500 (the last test)" : "TRASHINGTON 400"], fade: 0.35,
        extra: (h: H) => {
          const s: string[] = [];
          for (let a = 0; a < net.nodes.length; a++) for (const [b] of net.adj[a]) if (b > a) { const m = Math.min(...ds.map((d) => Math.max(d[a], d[b]))); if (m <= reach) s.push(h.line([net.nodes[a], net.nodes[b]], "#1e88e5", 3.2, 'stroke-opacity="0.85"')); }
          for (const u of P.units.filter((x) => x.kind === "landmark")) { for (const p of u.parts) s.push(h.rect(p, "#d32f2f", 'stroke="#1b1420" stroke-width="1"')); const p = u.parts[0]; s.push(h.text((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2, u.id.toUpperCase(), 10, {})); }
          return s.join("");
        } });
      return { svg, w: +/width="([\d.]+)"/.exec(svg)![1], h: +/height="([\d.]+)"/.exec(svg)![1] };
    })());
  }
  const gap = 24, W = parts[0].w + gap + parts[1].w, Ht = Math.max(parts[0].h, parts[1].h) + 96;
  save("01-500-vs-400", `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" font-family="DejaVu Sans, Arial, sans-serif"><rect width="${W}" height="${Ht}" fill="#f4efe4"/>
    <svg x="0" y="0" width="${parts[0].w}" height="${parts[0].h}">${parts[0].svg}</svg><svg x="${parts[0].w + gap}" y="0" width="${parts[1].w}" height="${parts[1].h}">${parts[1].svg.replace(/id="/g, 'id="b_').replace(/url\(#/g, "url(#b_").replace(/href="#/g, 'href="#b_')}</svg>
    <text x="16" y="${Ht - 66}" font-size="17" font-weight="700" fill="#1b1420">THE SAME SCALE. DIAGRAMS FROM THE PLAN DATA: not screenshots.</text>
    <text x="16" y="${Ht - 44}" font-size="13" fill="#1e88e5" font-weight="700">Blue: every street, lane and path within 25 s of sprinting from ANY fort's mat (235 m along the walking network).</text>
    <text x="16" y="${Ht - 24}" font-size="13" fill="#1b1420">Red: the four landmarks. At 400 m each fort's nearest is back inside the 25 s reach (see the plan for the walked times, at today's speed; the test map is 10% faster).</text>
  </svg>`);
}

// ---- 2. the clean labelled plan ----
usePlan(TRASH400);
const issues = validate(), rt = routes().rows;
const wspan = (id: string) => { const ts = walked.filter((r: any) => r.id === id).map((r: any) => r.out); return `${Math.min(...ts).toFixed(0)}-${Math.max(...ts).toFixed(0)} s`; };
save("02-trashington400-plan", drawMap(P.extent, 2.6, { labels: "city", legend: true, streetNames: true, tierWash: true,
  title: ["TRASHINGTON 400: THE PLAN", "DIAGRAM FROM THE PLAN DATA (shared/src/queens/trashington400.ts). Not a screenshot.",
    `400 x 400 m, 18 m yards. ${issues.length ? issues.length + " RULES FAILING" : "Every rule passes (the same checker as before)."} Black dots: front doors; white: second ways out (back doors, docks, goods gates).`,
    "Landmark doors: the walk from the four mats (sprint held, real stamina, today's speed; the test map is 10% faster). Washes: orange starter, green mid, purple high-end, red landmark corners."],
  extra: (h) => {
    const s: string[] = [];
    for (const u of P.units.filter((x) => x.kind === "landmark")) { const p = u.parts[0]; s.push(h.text((p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2 - 8, `door ${wspan(u.id)}`, 10, { w: 400 })); }
    for (const [k, p] of Object.entries(P.border)) { const t = rt.filter((r) => r.id === "border_" + k).map((r) => r.out); s.push(h.text(p[0] + (p[0] > 0 ? -30 : p[0] < 0 ? 30 : 46), p[1] + (p[1] > 0 ? 4 : p[1] < 0 ? -4 : 0), `edge ${Math.min(...t).toFixed(0)}-${Math.max(...t).toFixed(0)} s`, 9, { c: "#c62828" })); }
    return s.join("");
  } }));

// ---- 3. the playable test: what's open, who starts where, the two ways home from the museum ----
setCityMap("test"); buildTrashington(); setCityMap("new"); usePlan(TRASH400);
{
  const T = TEST_INFO!, A = LOOP_AT;
  save("03-playable-test", drawMap(P.extent, 2.6, { labels: "city", fade: 0.6, streetNames: true,
    title: ["THE SMALLEST PLAYABLE TEST (?map=test): grey boxes, the whole 400 m city, three places open", "DIAGRAM FROM THE PLAN DATA. Green: open (PLUG & PRAY, FISHY BUSINESS, the museum). Everything else: a closed grey block with its name on it.",
      "Player 1 starts in F1 (north-west), player 2 in F4 (south-west). Red: the quick way home from the museum (up Stain Way). Blue: the covered way (Wood Havoc Lane, behind the pub).",
      "Giants can't leave by the museum's public door (you're turned back): only through the GOODS IN door and the goods yard. No traffic, no police, no passers-by."],
    extra: (h) => {
      const s: string[] = [];
      for (const p of T.places) s.push(h.rect(p.inside, "#43a047", 'fill-opacity="0.75" stroke="#1b5e20" stroke-width="2"'));
      const [quick, lane] = T.routes;
      s.push(h.line(quick.pts, "#e53935", 5, 'stroke-opacity="0.85"'));
      s.push(h.line(lane.pts, "#1e88e5", 5, 'stroke-opacity="0.85" stroke-dasharray="10 6"'));
      s.push(h.text(T.museum.door[0], T.museum.door[1] + 6, "public door (no giants)", 10, { c: "#1b1420", w: 300 }));
      s.push(h.text(T.museum.gate[0], T.museum.gate[1] + 6, "GOODS IN (giants)", 10, { c: "#1b1420", w: 300 }));
      for (const [id, lbl] of [["F1", "P1 (Blake)"], ["F4", "P2 (Tyson)"]] as const) { const f = P.forts.find((x) => x.id === id)!; s.push(h.text(f.mat[0], f.mat[1], lbl, 11, { c: "#b71c1c", w: 300 })); }
      s.push(h.text(-A, -A / 2, "", 9, {}));
      return s.join("");
    } }));
}

await toPngs(IMG, names);
for (const n of names) fs.rmSync(`${IMG}/${n}.svg`);
console.log("images:", names.join(", "));
