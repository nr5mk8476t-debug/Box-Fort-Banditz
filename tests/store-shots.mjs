// R15: a store from the street, a wide street view, inside, the yard/back, and the same at night (Blake's review set).
// STORE=lastscrew VIEWS='{"name":[x,y,z,yaw,pitch],...}' OUT_DIR=... node tests/store-shots.mjs (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "store-shots"; fs.mkdirSync(OUT, { recursive: true });
const views = JSON.parse(process.env.VIEWS);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.DPR ?? 1) })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1&map=new`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 });
await page.addStyleTag({ content: "#hud, #prompt, #big-banner, #flash, #quest, #purse { display: none !important; }" });
for (const night of [false, true]) {
  await ev((n) => window.__bfb.forceNight(n), night); await sleep(2500);
  for (const [n, v] of Object.entries(views)) {
    if (night && !/street|wide|inside/i.test(n)) continue;
    await ev((v) => { const [x, z] = [v[0], v[2]]; window.__bfb.teleport(x, z, v[3]); window.__bfb.camAt(...v); }, v); await sleep(6000);
    await page.screenshot({ path: `${OUT}/${n}${night ? "-night" : ""}.png` }); console.log("shot", n, night ? "night" : "day");
  }
}
console.log(errs.length ? "PAGE ERRORS: " + errs.slice(0, 3).join(" | ") : "no page errors");
await browser.close();
