// R15, solo in the browser: the stores' shelves drawn from the stock (instanced), aiming at a thing (E = take it: one item
// in your hands, gone from the shelf), the counter's FOR SALE list (BUY: charged once). Screenshots to OUT_DIR.
import { chromium } from "playwright";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = process.env.OUT_DIR ?? "stock-shots"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
const ev = (f, a) => page.evaluate(f, a);
const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log("shot", n); };
let fails = 0; const check = (ok, what) => { console.log(ok ? "PASS" : "FAIL", what); if (!ok) fails++; };
await page.goto(`${process.env.URL ?? "http://localhost:4173"}/?test=1&map=new`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 400); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await page.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 });
await ev(() => window.__bfb.setCash(200));
for (const store of ["plugpray", "needledrop"]) {
  const h = await ev((s) => window.__bfb.stockHost(s), store);
  const i = h.things.findIndex((t) => t && !t.taken && t.type);
  const sl = h.slots[i];
  // stand 1.2 m from the slot, looking at it
  const st = (await ev(() => window.__bfb.arenaLayout?.() ?? null));
  void st;
  await ev(({ sl }) => { const dx = 1.2; window.__bfb.teleport(sl.x + dx, sl.z, -Math.PI / 2); }, { sl });
  await sleep(2500);
  // try the four sides until one has a clear view of it
  let tgt = null;
  for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
    await ev(({ sl, dx, dz }) => { window.__bfb.teleport(sl.x + dx, sl.z + dz, Math.atan2(-dx, -dz)); }, { sl, dx, dz });
    await sleep(1200);
    await ev((sl) => { const m = window.__bfb.move(); window.__bfb.setPitch(Math.atan2(m.y + 1.6 - (sl.y + 0.12), Math.hypot(sl.x - m.x, sl.z - m.z))); }, sl);
    await sleep(900);
    tgt = await ev(() => window.__bfb.stockTarget());
    if (tgt) break;
  }
  const drawn = await ev(() => window.__bfb.stockDrawn());
  check(drawn > 20, `${store}: the stores' stock is drawn (${drawn} things)`);
  check(!!tgt && tgt.store === store, `${store}: aiming at a thing on the shelf: ${JSON.stringify(tgt)}`);
  await shot(`stock-${store}-aim`);
  if (tgt) {
    await page.keyboard.press("KeyE"); await sleep(1500);
    const inv = await ev(() => window.__bfb.serverInventory());
    const h2 = await ev((s) => window.__bfb.stockHost(s), store);
    check((inv.hand || inv.pockets.some(Boolean)) && h2.things[tgt.slot]?.taken, `${store}: E took it (hand ${inv.hand}, pockets ${inv.pockets.join(",")})`);
    await shot(`stock-${store}-taken`);
    await ev(() => window.__bfb.clearHands?.());
  }
}
// the counter: PLUG & PRAY's FOR SALE list
const lay = await ev(() => window.__bfb.storesLayout?.() ?? null);
if (lay) {
  const pp = lay.find((s) => s.id === "plugpray"), c = pp.counter, cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
  await ev(() => window.__bfb.clearHands?.());
  for (const [dx, dz] of [[0, 1.3], [0, -1.3], [1.3, 0], [-1.3, 0]]) {
    await ev(({ cx, cz, dx, dz }) => { window.__bfb.teleport(cx + dx, cz + dz, Math.atan2(-dx, -dz)); window.__bfb.setPitch(0.35); }, { cx, cz, dx, dz });
    await sleep(1500);
    if (/selling/i.test(await ev(() => document.getElementById("prompt").textContent))) break;
  }
  await page.keyboard.press("KeyE"); await sleep(1200);
  check((await ev(() => window.__bfb.counterOpen())) === "plugpray", "E at the counter (empty hands): the FOR SALE list opens");
  await shot("stock-counter-menu");
  const cash0 = await ev(() => window.__bfb.myCash());
  const btn = await page.$('#counter-menu button[data-buy]:not([disabled])');
  if (btn) { await btn.click(); await sleep(1500); }
  const cash1 = await ev(() => window.__bfb.myCash());
  check(!!btn && cash1 < cash0, `BUY: charged once ($${cash0} -> $${cash1})`);
  await shot("stock-counter-bought");
} else check(false, "no storesLayout hook");
check(errs.length === 0, "no page errors " + errs.slice(0, 3).join(" | "));
console.log(fails ? `${fails} FAILED` : "ALL PASS");
await browser.close();
process.exit(fails ? 1 : 0);
