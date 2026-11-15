// R14 stage 5, solo in the browser: qualify, RUN FOR MAYOR at the board (E), the campaign tracker, PRESIDENT MARMALADE,
// the handshake, posters going up, the speech, YOU ARE THE MAYOR + the results. Screenshots to OUT_DIR. (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "mayor-shots"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const log = (...a) => console.log(...a);
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 });
await ev(() => window.__bfb.mayorQualify()); await sleep(800);
const lot = await ev(() => window.__bfb.myLot()), board = await ev(() => window.__bfb.myBoard());
await ev(({ b, l }) => { const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw); window.__bfb.teleport(b.x + fx * 1.4, b.z + fz * 1.4, Math.atan2(-fx, -fz)); }, { b: board, l: lot });
await sleep(1500);
const ptxt = await ev(() => document.getElementById("prompt").textContent);
check(/RUN FOR MAYOR/.test(ptxt), "the board offers the campaign: " + ptxt.slice(0, 60));
await shot("01-run-for-mayor-prompt");
const t0 = await ev(() => window.__bfb.match().timeLeft);
await page.keyboard.press("KeyE"); await sleep(1500);
let m = await ev(() => window.__bfb.mayor());
check(!!m, "the campaign started");
if (!m) { console.log(errs); process.exit(1); }
await sleep(2000); await shot("02-campaign-started");
const t1 = await ev(() => window.__bfb.match().timeLeft);
check(Math.abs(t1 - t0) < 1.5, `the round clock stopped (${t0.toFixed(1)} -> ${t1.toFixed(1)})`);
// the President: look at him from 4 m
await ev((p) => { const fx = Math.sin(p.yaw ?? 0), fz = Math.cos(p.yaw ?? 0); window.__bfb.teleport(p.x + fx * 4 + fz * 0.8, p.z + fz * 4 - fx * 0.8, Math.atan2(-(fx * 4 + fz * 0.8), -(fz * 4 - fx * 0.8))); }, m.pres); await sleep(3500);
await shot("03-president-marmalade");
await ev((p) => { window.__bfb.teleport(p.x + 1.4, p.z, -Math.PI / 2); }, m.pres); await sleep(1500);
m = await ev(() => window.__bfb.mayor()); check(m.presDone, "shook hands");
// 5 posters
for (const [i, ps] of m.posters.entries()) {
  if (i >= 8) break;
  await ev((q) => window.__bfb.teleport(q.x, q.z, 0), ps);
  const ok = await page.waitForFunction((k) => window.__bfb.mayor()?.posters[k]?.done, i, { timeout: 12000 }).then(() => true).catch(() => false);
  if (!ok) log("poster spot not reached:", ps.name, JSON.stringify(await ev(() => window.__bfb.worldMe?.())));
  if ((await ev(() => window.__bfb.mayor().posters.filter((p) => p.done).length)) >= 5) break;
}
m = await ev(() => window.__bfb.mayor());
check(m.posters.filter((p) => p.done).length >= 5, "5 posters up: " + m.posters.filter((p) => p.done).length);
{ const p = m.posters.find((q) => q.done); let k = 0; for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) { await ev(({ q, dx, dz }) => window.__bfb.camAt(q.x + dx, 2.4, q.z + dz, Math.atan2(-dx, -dz), 0.0), { q: p, dx, dz }); await sleep(1500); await shot("04-a-poster-" + k++); } await ev(() => window.__bfb.camFree()); }
await ev(() => window.__bfb.mayorGoofyDone());
await ev((q) => window.__bfb.teleport(q.x, q.z, 0), m.podium); await sleep(4000);
await shot("05-the-speech");
await page.waitForFunction(() => window.__bfb.match().phase === "over", null, { timeout: 30000 }).catch(() => log("NOT OVER"));
await sleep(1500); await shot("06-mayor-elected");
const mt = await ev(() => window.__bfb.match());
check(mt.phase === "over", "the match is over: " + mt.phase);
check(errs.length === 0, "no page errors " + errs.slice(0, 3).join(" | "));
console.log(fails ? `${fails} FAILED` : "ALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
