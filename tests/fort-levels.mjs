// R14: every upgrade on a fort, one level at a time (solo; vite preview on 4173): screenshots to OUT_DIR
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "fort-levels"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); document.getElementById("hud").style.visibility = "hidden"; });
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 30000 });
const lot = await ev(() => window.__bfb.myLot());
for (const [t, n] of [["plank", 16], ["lava_lamp", 6], ["crt_tv", 5], ["golden_spork", 1], ["newspaper", 2], ["vinyl_record", 1]]) await ev(([t, n]) => window.__bfb.fortGive(t, n, 20), [t, n]);
await ev(() => window.__bfb.setCash(5000));
for (let i = 0; i < 20 && (await ev(() => window.__bfb.match().phase)) !== "prep"; i++) { await ev(() => window.__bfb.setTimeLeft(0.5)); await sleep(1500); }
const view = async (n) => { await ev(() => { document.getElementById("prep").style.display = "none"; }); await ev((l) => window.__bfb.camAt(l.x + 7.5, 3.2, l.z + 8.5, Math.PI + 0.72, 0.2), lot); await sleep(2500); await page.screenshot({ path: `${OUT}/${n}.png` }); await ev(() => { document.getElementById("prep").style.display = ""; }); };
await view("L1");
for (const [name, ids] of [["L2", ["level2", "workbench", "alarm1", "shelves2", "safe2"]], ["L3", ["level3", "alarm2", "shelves3", "safe3", "handtruck"]], ["L4", ["level4"]]]) {
  if (name === "L4") await ev(() => window.__bfb.fortGive("plank", 6, 20));
  for (const id of ids) { await page.click(`button[data-up="${id}"]`).catch(() => console.log("no button", id)); await sleep(700); }
  console.log(name, JSON.stringify((await ev(() => window.__bfb.loop())).u));
  await view(name);
}
console.log("errors:", errs.length ? errs.slice(0, 3).join(" | ") : "none");
await browser.close();
