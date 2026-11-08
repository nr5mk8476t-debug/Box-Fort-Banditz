// usage: VIEWS=views.json node tests/flicker-find.mjs <client url> <out dir> [names]; then python3 tests/flicker-find.py <out dir> name1,name2
// views.json: { "name": [x, y, z, yaw, pitch, night0or1], ... }
// R12.6: z-fight finder. For each view: 7 frames, the camera creeping forward 5 mm a frame (STEP=metres); python flags pixels that
// flip (A->B->A) between neighbouring frames: steady motion moves edges one way, z-fighting flips back and forth.
import { chromium } from "playwright";
import fs from "node:fs";
const [base, out, which = "all"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}), args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-compositing"] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${base}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 500); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); document.getElementById("hud").style.visibility = "hidden"; });
const V = JSON.parse(fs.readFileSync(process.env.VIEWS ?? new URL("./flicker-views.json", import.meta.url)));
for (const [n, v] of Object.entries(V)) {
  if (which !== "all" && !which.split(",").includes(n)) continue;
  const [x, y, z, yaw, pitch, night] = v;
  await ev((nt) => window.__bfb.forceNight(!!nt), night);
  const fx = Math.sin(yaw) * Math.cos(pitch), fz = Math.cos(yaw) * Math.cos(pitch), fy = -Math.sin(pitch);
  for (let k = 0; k < 7; k++) {
    const d = k * (+process.env.STEP || 0.005);
    await ev((a) => window.__bfb.camAt(...a), [x + fx * d, y + fy * d, z + fz * d, yaw, pitch]); await sleep(k === 0 ? 3000 : 900);
    await page.screenshot({ path: `${out}/${n}-${k}.png`, timeout: 120000 });
  }
}
await browser.close();
