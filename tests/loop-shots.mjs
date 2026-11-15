// R14: the game loop, solo, in the browser: the countdown, banking on the mat (the card, the shelves), PREP (the van,
// the safe, building, crafting), back in the city. Screenshots to OUT_DIR. (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "loop-shots"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
const log = (...a) => console.log(...a);
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "intro", null, { timeout: 30000 });
await sleep(1500); await shot("01-countdown");
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 30000 });
// two things on my mat: they bank in 10 s (one card, one sound) and go on the shelves
const lot = await ev(() => window.__bfb.myLot());
log("lot", JSON.stringify(lot));
await ev((l) => { window.__bfb.spawnItem("crt_tv", l.padX - 0.6, l.padZ); window.__bfb.spawnItem("lava_lamp", l.padX + 0.6, l.padZ); window.__bfb.spawnItem("plank", l.padX, l.padZ + 0.5); window.__bfb.spawnItem("duct_tape", l.padX + 0.3, l.padZ - 0.5); }, lot);
await ev((l) => { window.__bfb.camAt(l.padX + 3.5, 2.2, l.padZ + 4.5, Math.atan2(-3.5, -4.5), 0.25); }, lot);
await sleep(5000); await shot("02-pending-on-mat");
await page.waitForFunction(() => (window.__bfb.loop()?.r?.length ?? 0) >= 4, null, { timeout: 30000 }).catch(() => log("NOT BANKED"));
await sleep(600); await shot("03-banked-card");
await ev((l) => { window.__bfb.camAt(l.x + 0.5, 2.0, l.z + 5.5, Math.PI, 0.18); }, lot); await sleep(3000); await shot("04-shelves");
log("loop", JSON.stringify(await ev(() => window.__bfb.loop())));
// PREP: skip the clock
await ev(() => window.__bfb.setCash(600));
await ev(() => window.__bfb.setTimeLeft(1)); await sleep(1500);
await ev(() => window.__bfb.setTimeLeft(1)); await sleep(1500);
await ev(() => window.__bfb.setTimeLeft(1));
await page.waitForFunction(() => window.__bfb.match().phase === "prep", null, { timeout: 30000 }).catch(() => log("NO PREP", JSON.stringify(window.__bfb?.match?.())));
await sleep(2500); await shot("05-prep");
// build a workbench, put the lava lamp in the safe, sell the TV
await page.click('button[data-up="workbench"]').catch((e) => log("no workbench button", e.message)); await sleep(1200);
const loop1 = await ev(() => window.__bfb.loop());
const lamp = loop1.r.find((r) => r[1] === "lava_lamp"), tv = loop1.r.find((r) => r[1] === "crt_tv");
if (lamp) await page.click(`button[data-safe="${lamp[0]}"]`); await sleep(800);
if (tv) await page.click(`button[data-sell="${tv[0]}"]`); await sleep(1200);
await shot("06-prep-after");
log("after prep", JSON.stringify(await ev(() => ({ loop: window.__bfb.loop(), cash: window.__bfb.myCash() }))));
await page.click("#btn-prep-ready"); await sleep(1500);
await page.waitForFunction(() => window.__bfb.match().phase === "intro" || window.__bfb.match().phase === "scavenge", null, { timeout: 30000 });
await sleep(6000);
await ev((l) => { window.__bfb.camAt(l.x + 4.5, 2.4, l.z + 5.0, Math.PI + 0.7, 0.2); }, lot); await sleep(3000); await shot("07-fort-with-workbench");
log("errors:", errs.length ? errs.slice(0, 3).join(" | ") : "none");
await browser.close();
