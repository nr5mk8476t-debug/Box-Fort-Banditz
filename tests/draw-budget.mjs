// R12.7: the draw-call budget. Blake's PC is draw-call bound (the frame ≈ the CPU sending draws), and draw counts are
// the same on any machine, so this runs on the test box (software rendering) and still means something.
// For each fixed view: draws = meshes drawn + outlined meshes (an ink outline is a second draw), by class.
//   node tests/draw-budget.mjs                 compare with tests/draw-budgets.json (exit 1 when a view's over)
//   UPDATE=1 node tests/draw-budget.mjs        write the budgets (what's measured now + 12%): ALL of them, on purpose
//   UPDATE=new node tests/draw-budget.mjs      add budgets for views that have none yet (keeps the others)
// R13.1: meshes are budgeted too (on Blake's PC the frame follows the meshes drawn, ~7 µs each, more than the draws);
// a view with no budget, or a budgeted view that wasn't measured, FAILS (it used to be skipped: a pass that
// checked nothing). Old budget files (a number per view) are the draws only.
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
// R13.1: every glass / panel door, from 3.5 m out on each side (the doors are props: each leaf moves on its own hinge)
for (const d of await ev(() => window.__bfb.propDefs().filter((p) => p.kind === "door").map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw }))))
  for (const [k, sg] of [["a", 1], ["b", -1]]) { const nx = Math.sin(d.yaw) * sg, nz = Math.cos(d.yaw) * sg; views[`door_${d.id}_${k}`] = [d.x + nx * 3.5, d.y + 0.4, d.z + nz * 3.5, Math.atan2(-nx, -nz), 0.05]; }
if (process.env.ONLY) for (const n of Object.keys(views)) if (!new RegExp(process.env.ONLY).test(n)) delete views[n];
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
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const norm = (b) => (typeof b === "number" ? { draws: b } : b);
const fresh = (r) => ({ draws: Math.ceil(r.draws * 1.12), meshes: Math.ceil(r.meshes * 1.12) }); /* (people and cars come and go: the same view varies by ~8% run to run) */
if (process.env.UPDATE) {
  const b = process.env.UPDATE === "new" ? { ...old } : {};
  let added = 0;
  for (const [n, r] of Object.entries(out)) if (process.env.UPDATE !== "new" || b[n] === undefined) { b[n] = fresh(r); added++; }
  fs.writeFileSync(file, JSON.stringify(b, null, 1) + "\n"); console.log(`budgets written (${added} view(s))`); process.exit(0);
}
let over = 0;
for (const [n, r] of Object.entries(out)) {
  const b = old[n] === undefined ? undefined : norm(old[n]);
  if (b === undefined) { over++; console.log(`NO BUDGET: ${n} (${r.draws} draws, ${r.meshes} meshes): add it on purpose with UPDATE=new`); continue; }
  if (r.draws > b.draws) { over++; console.log(`OVER BUDGET: ${n}: ${r.draws} draws (budget ${b.draws})`); }
  if (b.meshes !== undefined && r.meshes > b.meshes) { over++; console.log(`OVER BUDGET: ${n}: ${r.meshes} meshes (budget ${b.meshes})`); }
}
if (!process.env.ONLY) for (const n of Object.keys(old)) if (!out[n]) { over++; console.log(`NOT MEASURED: ${n} has a budget but no view: coverage was dropped`); }
console.log(over ? `${over} problem(s): over budget, unbudgeted or missing views` : "ALL VIEWS WITHIN THE DRAW AND MESH BUDGETS");
process.exit(over ? 1 : 0);
