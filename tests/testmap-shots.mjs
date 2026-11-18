// Trashington 500's grey-box playable test (?map=test), solo in the browser: the views a player sees. Screenshots to
// OUT_DIR. (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "testmap-shots"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1&map=test`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "intro", null, { timeout: 30000 });
await sleep(2500); await shot("01-at-the-fort");
const views = JSON.parse(process.env.VIEWS ?? "null") ?? [
  ["02-market", 0, 1.6, -8, 0, 0.05], ["03-leaving-home", -60, 1.6, 12, -Math.PI / 2, 0.02], ["04-stain-way-south", -142, 1.6, 20, Math.PI, 0.03],
  ["05-plug-and-pray", -136, 1.6, -52, 0, 0.0], ["06-museum-front", -176, 1.6, -150, Math.PI, 0.08], ["07-museum-gallery", -195, 1.7, -195, 0.4, 0.05],
  ["08-goods-yard", -210, 1.6, -158, Math.PI, 0.05], ["09-wood-havoc-lane", -196, 1.6, -100, 0, 0.02], ["10-overview", -60, 120, 60, -2.4, 0.7],
];
// draws (the engine's real count, median of 6 frames) and meshes drawn at each view: the performance note
const cost = () => ev(() => new Promise((res) => { const e = window.__bfb.scene().getEngine(); let prev = e._drawCalls.current, k = 0; const dc = []; const f = () => { const c = e._drawCalls.current; dc.push(c - prev); prev = c; if (++k < 7) requestAnimationFrame(f); else { dc.shift(); dc.sort((x, y) => x - y); res({ draws: dc[dc.length >> 1], meshes: window.__bfb.scene().getActiveMeshes().length }); } }; requestAnimationFrame(f); }));
const costs = {};
for (const [n, x, y, z, yaw, pitch] of views) { await ev((a) => window.__bfb.camAt(...a), [x, y, z, yaw, pitch]); await sleep(3500); await shot(n); costs[n] = await cost(); }
console.log("cost", JSON.stringify(costs));
fs.writeFileSync(`${OUT}/costs.json`, JSON.stringify(costs, null, 1));
console.log("errors", errs.length, errs.slice(0, 5).join(" | "));
await browser.close();
