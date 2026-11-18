// Trashington 500's grey-box test, ONLINE: Blake hosts with ?map=test; Tyson types the room code into a plain page (no
// ?map=): he's moved onto the host's city and joins. The host's game records them seeing each other on Stain Way, and
// saves the playtest report when the scavenge ends. (server from server/ + vite preview on 4173)
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "testmap-2p"; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.URL ?? "http://localhost:4173";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); c ? pass++ : fail++; };
async function open(name, q) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { const k = "bfb.settings.v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.lowGraphics = true; localStorage.setItem(k, JSON.stringify(s)); } catch {} });
  const p = await ctx.newPage(); p.errors = []; p.label = name;
  p.on("pageerror", (e) => p.errors.push(String(e))); p.on("console", (m) => { if (m.type() === "error") p.errors.push(m.text()); });
  await p.goto(BASE + "/" + q, { timeout: 480000 });
  await p.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
  return p;
}
const A = await open("Blake", "?test=1&map=test");
await A.fill("#name-input", "Blake"); await A.click("#btn-create");
await A.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 180000 });
const code = (await A.evaluate(() => window.__bfb.info())).roomCode;
ok(/TRASHINGTON 500 TEST \/ HOSTING/.test(await A.textContent("#mode-badge")), `host on the test map (${await A.textContent("#mode-badge")}), room ${code}`);
// Tyson: a plain page, types the code
const B = await open("Tyson", "?test=1");
await B.fill("#name-input", "Tyson"); await B.fill("#code-input", code); await B.click("#btn-join");
// (he's sent to ?map=test&room=CODE: the page reloads, then the invite card joins)
await B.waitForFunction(() => location.search.includes("map=test"), null, { timeout: 180000 }).catch(() => {});
ok(B.url().includes("map=test"), `the joiner was moved onto the host's map (${B.url()})`);
await B.waitForFunction(() => window.__bfb?.info().screen === "title" || window.__bfb?.info().screen === "playing", null, { timeout: 480000 });
if ((await B.evaluate(() => window.__bfb.info().screen)) === "title") { await B.fill("#name-input", "Tyson").catch(() => {}); await B.click("#btn-accept-invite", { timeout: 60000 }); }
await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 1500000 });
ok(/TRASHINGTON 500 TEST/.test(await B.textContent("#mode-badge")), `joiner's badge: ${await B.textContent("#mode-badge")}`);
await A.waitForFunction(() => Object.keys(window.__bfb.info().players).length === 2, null, { timeout: 60000 }).catch(() => {});
ok(Object.keys((await A.evaluate(() => window.__bfb.info())).players).length === 2, "two players in the host's game");
// the match: F1 (Blake) and F4 (Tyson), the west side
await A.click("#btn-start");
await A.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 });
const lots = await A.evaluate(() => window.__bfb.info().players);
// put them on Stain Way, 40 m apart, in plain view
await A.evaluate(() => window.__bfb.teleport(-140, -20, Math.PI));
await B.evaluate(() => window.__bfb.teleport(-140, -60, 0));
await sleep(8000);
await A.screenshot({ path: `${OUT}/01-blake-sees-tyson.png` }); await B.screenshot({ path: `${OUT}/02-tyson-sees-blake.png` });
const rep = await A.evaluate(() => window.__bfb.playtest());
const sg = rep?.cycles?.at(-1)?.sightings ?? [];
ok(sg.some((s) => s.away && /STAIN WAY/.test(s.at.a[2] + s.at.b[2])), `the host recorded the sighting on Stain Way (${JSON.stringify(sg[0] ?? null)})`);
ok((await B.evaluate(() => window.__bfb.playtest?.())) === null, "the joiner doesn't record (the host does)");
// the scavenge ends: the host saves the report
const dl = A.waitForEvent("download", { timeout: 120000 }).catch(() => null);
for (let k = 0; k < 4; k++) { await A.evaluate(() => window.__bfb.setTimeLeft(1)); await sleep(1500); }
const d = await dl;
ok(!!d && /trashington500-playtest-.*\.(json|txt)$/.test(d.suggestedFilename()), `the host's report was saved (${d?.suggestedFilename()})`);
if (d) await d.saveAs(`${OUT}/${d.suggestedFilename()}`);
for (const p of [A, B]) { const errs = p.errors.filter((e) => !/favicon|fonts\.g/.test(e)); ok(errs.length === 0, `${p.label}: no JS errors ${errs.slice(0, 3).join(" | ")}`); }
console.log(`${pass}/${pass + fail} checks passed`);
await browser.close();
process.exit(fail ? 1 : 0);
