// TR4: the park's finished section, measured and photographed from FIXED cameras (the same before and after), with the
// HUD hidden. Per view: draw calls (the engine's real count, median of 6 frames), active meshes, triangles; per run:
// materials, textures and their memory, the average frame time over 2 s per view, and the load time. Day, dusk, night.
// Software rendering on the test box: frame times are RELATIVE only.
//   OUT_DIR=... LABEL=before node tests/park-measure.mjs     (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "park-measure", LABEL = process.env.LABEL ?? "run"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
const t0 = Date.now();
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1&map=test`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
const loadMs = Date.now() - t0;
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 });
// hide every page element but the game's canvas (the HUD, banners, hints)
await page.addStyleTag({ content: "body * { visibility: hidden !important; } #game { visibility: visible !important; }" });
const VIEWS = {
  "01-stall": [-1.2, 1.6, 5.0, -1.43, 0.03],
  "02-stall-from-below": [-3.6, 1.45, 5.6, -Math.PI / 2, -0.42],
  "03-yard-entrance": [-3.2, 1.65, 22.3, -2.15, 0.06],
  "04-path-approach": [1.5, 1.65, 27, -3.02, 0.03],
  "05-overhead": [-2, 30, 30, -2.68, 0.85],
};
const measure = () => ev(() => new Promise((res) => {
  const sc = window.__bfb.scene(), e = sc.getEngine(); let prev = e._drawCalls.current, k = 0; const dc = [], ft = []; let last = performance.now();
  const f = () => { const c = e._drawCalls.current, now = performance.now(); dc.push(c - prev); ft.push(now - last); prev = c; last = now;
    if (++k < 40) requestAnimationFrame(f);
    else { dc.shift(); ft.shift(); dc.sort((a, b) => a - b); res({ draws: dc[dc.length >> 1], meshes: sc.getActiveMeshes().length, tris: Math.round(sc.getActiveIndices() / 3), frameMs: +(ft.reduce((a, b) => a + b, 0) / ft.length).toFixed(1) }); } };
  requestAnimationFrame(f);
}));
const out = { label: LABEL, loadMs, views: {} };
async function shoot(phase, names) {
  for (const n of names) {
    await ev((a) => window.__bfb.camAt(...a), VIEWS[n]); await sleep(3500);
    await page.screenshot({ path: `${OUT}/${LABEL}-${phase}-${n}.png` });
    out.views[`${phase}:${n}`] = await measure();
    console.log(phase, n, JSON.stringify(out.views[`${phase}:${n}`]));
  }
}
await shoot("day", Object.keys(VIEWS));
// dusk (the sunset phase), then night: skip the clock, give the fade time to finish
for (let k = 0; k < 3 && (await ev(() => window.__bfb.match().phase)) !== "dusk"; k++) { await ev(() => window.__bfb.setTimeLeft(1)); await sleep(1500); }
await sleep(5000); await shoot("dusk", ["01-stall", "04-path-approach"]);
for (let k = 0; k < 3 && (await ev(() => window.__bfb.match().phase)) !== "night"; k++) { await ev(() => window.__bfb.setTimeLeft(1)); await sleep(1500); }
await sleep(5000); await shoot("night", ["01-stall", "03-yard-entrance", "04-path-approach"]);
out.scene = await ev(() => { const sc = window.__bfb.scene(); let texBytes = 0; for (const t of sc.textures) { const s = t.getSize?.(); if (s && s.width) texBytes += s.width * s.height * 4 * (t.noMipmap ? 1 : 1.33); }
  return { materials: sc.materials.length, textures: sc.textures.length, textureMB: +(texBytes / 1048576).toFixed(1), meshesTotal: sc.meshes.length }; });
out.errors = errs;
console.log("scene", JSON.stringify(out.scene), "load", loadMs, "errors", errs.length, errs.slice(0, 3).join(" | "));
fs.writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(out, null, 1));
await browser.close();
