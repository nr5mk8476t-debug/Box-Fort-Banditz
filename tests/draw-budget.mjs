// R12.7: the draw-call budget. Blake's PC is draw-call bound (the frame ≈ the CPU sending draws), and draw counts are
// the same on any machine, so this runs on the test box (software rendering) and still means something.
// For each fixed view: draws = meshes drawn + outlined meshes (an ink outline is a second draw), by class.
//   node tests/draw-budget.mjs                 compare with tests/draw-budgets.json (exit 1 when a view's over)
//   UPDATE=1 node tests/draw-budget.mjs        write the budgets (what's measured now + 12%)
//   CLIENT_URL=http://localhost:4173  OUT=report.json  SHOTS=dir (a screenshot of each view)
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.env.CLIENT_URL ?? "http://localhost:4173", file = new URL("./draw-budgets.json", import.meta.url);
const exe = fs.existsSync("/opt/pw-browsers/chromium") && !process.env.PW_OWN ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ ...exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); document.getElementById("hud").style.visibility = "hidden"; });
const pb = await ev(() => window.__bfb.pub()), B = pb.balcony[0], O1 = pb.darts[0], y2 = pb.y2;
const views = {
  balconyFront: [B.minX + 1, y2 + 1.7, (B.minZ + B.maxZ) / 2, Math.PI / 2, 0],
  street: [-50, 1.7, -2, Math.PI / 2, 0.02],
  acrossRoad: [-60.5, 1.7, -3, -2.3, -0.14],
  window: [pb.rect.maxX - 2.2, 1.6, 19.8, Math.PI / 2, 0.02],
  bar: [-79.5, 1.75, 17.5, -Math.PI / 2 - 0.15, 0.06],
  fireside: [-83.5, pb.y1 + 1.7, 25.5, Math.atan2(pb.fire.x + 83.5, pb.fire.z - 25.5), 0.08],
  darts: [O1.oche + 3.5, y2 + 1.8, O1.board.z + 4, -Math.PI / 2 - 0.6, 0.12],
  littleItaly: [-66.33, 1.7, -30, 0, -0.1],
  crossroads: [0, 1.7, 0, 0.8, 0],
  uptown: [40, 1.7, 60, 2.4, -0.05],
};
// R13: the six stores, outside (from across the street) and inside (just in from the door), and each district from above
// (tests/store-views.json, made from shared/src/stores.ts: the same cameras before and after the stores were built)
{ const f = new URL("./store-views.json", import.meta.url); if (fs.existsSync(f) && !process.env.NO_STORES) Object.assign(views, JSON.parse(fs.readFileSync(f, "utf8"))); }
const out = {};
for (const [n, v] of Object.entries(views)) {
  await ev((v) => window.__bfb.camAt(...v), v); await sleep(8000);
  if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: `${process.env.SHOTS}/${n}.png`, timeout: 120000 }); }
  // (the real count: the engine's own draw-call counter over 6 frames; the classes are an estimate from the meshes drawn:
  //  an outlined mesh is two draws, instances of one mesh are one)
  const real = await ev(() => new Promise((res) => { const e = window.__bfb.scene().getEngine(); let prev = e._drawCalls.current, k = 0; const dc = []; const f = () => { const c = e._drawCalls.current; dc.push(c - prev); prev = c; if (++k < 7) requestAnimationFrame(f); else { dc.shift(); dc.sort((x, y) => x - y); res(dc[dc.length >> 1]); } }; requestAnimationFrame(f); }));
  out[n] = await ev((real) => { const sc = window.__bfb.scene(), a = sc.getActiveMeshes(), cls = {}; let draws = 0; const seen = new Set();
    for (let i = 0; i < a.length; i++) { let m = a.data[i]; if (m.sourceMesh) { if (seen.has(m.sourceMesh)) continue; seen.add(m.sourceMesh); m = m.sourceMesh; } else if (m.instances?.length) { if (seen.has(m)) continue; seen.add(m); }
      let p = a.data[i], root = p.name; while (p.parent) { p = p.parent; root = p.name; }
      const mat = m.material?.name ?? "", d = m.renderOutline ? 2 : 1;
      const c = /^npc|^remote/.test(root) ? "people" : /^car|^cop/.test(root) ? "cars" : /^prop/.test(root) ? "props" : root === "tag" ? "tags" : /^item|^loot/.test(root) ? "loot"
        : root !== "city" ? "other" : mat.startsWith("cityvc") && m.name.includes("_merged") ? "cityMerged" : mat.startsWith("skin-") ? "citySkins" : m.name.includes("_merged") ? "cityOtherMerged" : "citySingles";
      cls[c] = (cls[c] ?? 0) + d; draws += d; }
    return { draws: real, est: draws, meshes: a.length, ...cls }; }, real);
}
await browser.close();
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
const cols = ["draws", "est", "meshes", "cityMerged", "citySingles", "citySkins", "cityOtherMerged", "props", "tags", "people", "cars", "loot", "other"];
console.log("view".padEnd(14) + cols.map((c) => c.slice(0, 9).padStart(10)).join(""));
for (const [n, r] of Object.entries(out)) console.log(n.padEnd(14) + cols.map((c) => String(r[c] ?? 0).padStart(10)).join(""));
if (process.env.UPDATE) { const b = {}; for (const [n, r] of Object.entries(out)) b[n] = Math.ceil(r.draws * 1.12); /* (people and cars come and go: the same view varies by ~8% run to run) */ fs.writeFileSync(file, JSON.stringify(b, null, 1) + "\n"); console.log("budgets written"); process.exit(0); }
const budgets = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
let over = 0;
for (const [n, r] of Object.entries(out)) { const b = budgets[n]; if (b === undefined) { console.log(`  (no budget for ${n})`); continue; } if (r.draws > b) { over++; console.log(`OVER BUDGET: ${n}: ${r.draws} draws (budget ${b})`); } }
console.log(over ? `${over} view(s) over the draw budget` : "ALL VIEWS WITHIN THE DRAW BUDGET");
process.exit(over ? 1 : 0);
