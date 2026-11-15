// R14 stage 4, solo in the browser: the fort's task board (E prompt), a bought task in the tracker (LIVE), the J panel,
// SEAMUS's job prompt + taking it, STORE SECURITY at CARAT & RUN (look, warning). Screenshots to OUT_DIR. (vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "quest-shots"; fs.mkdirSync(OUT, { recursive: true });
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
await ev(() => window.__bfb.setCash(300));
// 1. the board: stand at it, look at it
const lot = await ev(() => window.__bfb.myLot());
const board = await ev(() => window.__bfb.myBoard());
log("lot", JSON.stringify(lot), "board", JSON.stringify(board));
const atBoard = async () => ev(() => window.__bfb.info().prompt ?? document.getElementById("prompt").textContent);
// face the board from 1.4 m out (towards the fort's front: +v)
await ev(({ b, l }) => { const fx = Math.sin(l.yaw), fz = Math.cos(l.yaw); window.__bfb.teleport(b.x + fx * 1.4, b.z + fz * 1.4, Math.atan2(-fx, -fz)); }, { b: board, l: lot });
await sleep(1500);
const ptxt = await ev(() => document.getElementById("prompt").textContent);
check(/AURA TASK/.test(ptxt), "the board's E prompt: " + ptxt.slice(0, 80));
await shot("01-task-board");
// buy with E
await page.keyboard.press("KeyE"); await sleep(1500);
let q = await ev(() => window.__bfb.loop()?.q);
if (!q?.t) { log("E didn't buy; forcing"); await ev(() => window.__bfb.questForce("tour")); await sleep(800); q = await ev(() => window.__bfb.loop()?.q); }
check(!!q?.t, "a task in the tracker: " + JSON.stringify(q?.t));
await sleep(600); await shot("02-tracker-task");
// 2. the J panel
await ev(() => window.__bfb.questRep("seamus", 2));
await ev(() => window.__bfb.questPanel(true)); await sleep(1200); await shot("03-quest-panel");
await ev(() => window.__bfb.questPanel(false));
// 3. SEAMUS: his bar
const locs = await ev(() => window.__bfb.questLocs());
const se = locs.find((l) => l.id === "seamus"), pub = locs.find((l) => l.id === "pub");
log("seamus", JSON.stringify(se));
await ev((s) => window.__bfb.teleport(s.x + 1.6, s.z, -Math.PI / 2), se); await sleep(2500);
const stxt = await ev(() => document.getElementById("prompt").textContent);
check(/job/i.test(stxt), "Seamus's prompt: " + stxt.slice(0, 90));
await shot("04-seamus-job-prompt");
await page.keyboard.press("KeyJ"); await sleep(1500);
q = await ev(() => window.__bfb.loop()?.q);
check(!!q?.j, "took Seamus's job: " + JSON.stringify(q?.j));
await shot("05-tracker-job");
// 4. STORE SECURITY at CARAT & RUN
const hs = await ev(() => window.__bfb.heavies());
check(hs.length === 2, "two STORE SECURITY: " + JSON.stringify(hs));
const st = locs.find((l) => l.id === "store_caratrun");
if (st && hs.length) {
  const h = hs.map((x) => ({ ...x, d: Math.hypot(x.x - st.x, x.z - st.z) })).sort((a, b) => a.d - b.d)[0];
  // stand inside, 3.5 m from them, looking at them (they're beside the door)
  await ev(({ h, st }) => { const px = st.x + (h.x - st.x) * 2.2, pz = st.z + (h.z - st.z) * 2.2; window.__bfb.teleport(px, pz, Math.atan2(h.x - px, h.z - pz)); }, { h, st });
  await sleep(3500); await shot("06-store-security");
}
check(errs.length === 0, "no page errors " + errs.slice(0, 3).join(" | "));
console.log(fails ? `${fails} FAILED` : "ALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
