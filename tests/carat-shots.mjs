// R13.1: CARAT & RUN's review shots: across the road and both diagonals, inside, the counter, the appraisal bench, the
// pigeon, looking out; by day and by night; and after the vitrine's been smashed (from the player's own eyes: E-key
// trading prompt, the smash, the spill). usage: OUT_DIR=dir node tests/carat-shots.mjs   (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "carat-shots"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); document.getElementById("hud").style.visibility = "hidden"; });
const st = await ev(() => window.__bfb.storeSpots().find((s) => s.id === "caratrun"));
// the store frame from the counter spots: u along the frontage, v in (the same maths as shared/src/stores.ts)
const a = st.spots[0].stand, b = st.spots[2].stand, c = st.spots[0].look;
const ux = (b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z), uz = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z);
const vx = (c.x - a.x) / Math.hypot(c.x - a.x, c.z - a.z), vz = (c.z - a.z) / Math.hypot(c.x - a.x, c.z - a.z);
// (a's u and v: the counter's left end + 0.35, the counter's front - 0.7: see storeSpots in main.ts)
const O = { x: a.x - ux * (3.6 + 0.35) - vx * (8.0 - 0.7), z: a.z - uz * (3.6 + 0.35) - vz * (8.0 - 0.7) };
const at = (u, v) => ({ x: O.x + ux * u + vx * v, z: O.z + uz * u + vz * v });
const cam = (u, v, y, lu, lv, pitch) => { const p = at(u, v), q = at(lu, lv); return [p.x, y, p.z, Math.atan2(q.x - p.x, q.z - p.z), pitch]; };
const views = {
  across: cam(5.07, -11, 1.7, 5.07, 0, -0.08), diagL: cam(-6, -8.5, 1.7, 4, 0, -0.1), diagR: cam(16, -8.5, 1.7, 6, 0, -0.1),
  ringSign: cam(7.5, -3.6, 2.6, 9.9, -0.95, -0.12), recess: cam(4.4, -2.6, 1.6, 4.4, 2, 0.02),
  inside: cam(4.4, 2.2, 1.65, 4.6, 9, 0.1), counter: cam(5.5, 6.4, 1.7, 5.5, 9, 0.35), bench: cam(6.0, 9.6, 1.8, 8.8, 11.4, 0.45),
  pigeon: cam(4.1, 9.9, 1.75, 1.9, 9.6, 0.1), cabinet: cam(3.0, 4.6, 1.7, 0.7, 5.4, 0.2), vitrine: cam(7.7, 2.4, 1.6, 7.7, 4.0, 0.5),
  lookOut: cam(8.7, 10.3, 1.7, 4.4, 0, 0.02),
};
for (const night of [false, true]) {
  await ev((n) => window.__bfb.forceNight(n), night); await sleep(night ? 12000 : 3000); // (the light takes a few seconds to change)
  for (const [n, v] of Object.entries(views)) {
    if (night && !["across", "diagL", "inside", "pigeon", "lookOut"].includes(n)) continue;
    await ev((v) => window.__bfb.camAt(...v), v); await sleep(5000);
    await page.screenshot({ path: `${OUT}/carat-${n}-${night ? "night" : "day"}.png`, timeout: 120000 });
  }
}
await ev(() => { window.__bfb.forceNight(false); window.__bfb.camFree(); }); await sleep(2000);
// the player's eyes: at the counter (the E prompt), then smash the vitrine (punch it), then the spill and the mess
const cs = st.spots[1];
await ev(([s, yaw]) => { window.__bfb.teleport(s.x, s.z, yaw); window.__bfb.setYaw(yaw); window.__bfb.setPitch(0.3); }, [cs.stand, Math.atan2(cs.look.x - cs.stand.x, cs.look.z - cs.stand.z)]);
await ev(() => { document.getElementById("hud").style.visibility = ""; }); // (the player's own views: with the HUD and the prompt)
await sleep(4000); await page.screenshot({ path: `${OUT}/carat-counter-prompt.png` });
const vs = at(7.7, 3.0), vl = at(7.7, 4.0), vy = Math.atan2(vl.x - vs.x, vl.z - vs.z);
await ev(([s, y]) => { window.__bfb.teleport(s.x, s.z, y); window.__bfb.setYaw(y); window.__bfb.setPitch(0.45); }, [vs, vy]); await sleep(2500);
await page.screenshot({ path: `${OUT}/carat-vitrine-before.png` });
for (let i = 0; i < 4 && (await ev(() => window.__bfb.worldProp("storecase_caratrun")?.ready)); i++) { await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(900); }
await sleep(1500);
console.log("smashed:", !(await ev(() => window.__bfb.worldProp("storecase_caratrun")?.ready)), "heat:", await ev(() => window.__bfb.heat?.() ?? null));
await page.screenshot({ path: `${OUT}/carat-vitrine-smashed.png` });
await ev((v) => window.__bfb.camAt(...v), cam(9.7, 2.6, 2.3, 7.7, 4.0, 0.55)); await sleep(3000);
await page.screenshot({ path: `${OUT}/carat-vitrine-smashed-cam.png` });
console.log("errors:", errs.length ? errs.slice(0, 3).join(" | ") : "none");
await browser.close();
