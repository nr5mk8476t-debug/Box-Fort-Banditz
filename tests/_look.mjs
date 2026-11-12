import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR; fs.mkdirSync(OUT, { recursive: true });
const V = JSON.parse(fs.readFileSync(process.env.VIEWS));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); document.getElementById("hud").style.visibility = "hidden"; });
for (const [n, v] of Object.entries(V)) {
  await ev((v) => window.__bfb.camAt(...v), v); await sleep(Number(process.env.WAIT ?? 6000));
  await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 });
}
await browser.close();
