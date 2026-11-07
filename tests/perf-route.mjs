// R12.5: the BENCHMARK on the test box: the same route round THE SOGGY SHAMROCK, by day and night, in solo (and as a
// host with a joiner, MP=1). Saves the report (text + JSON) to OUT_DIR. Software rendering (SwiftShader): the numbers
// show CPU work, hitches and how much is drawn; they are NOT a real GPU's frame rate.
// usage: CLIENT_URL=http://localhost:4173 OUT_DIR=out LABEL=before [MP=host|join] [W=1280 H=720] [XARGS="..."] node tests/perf-route.mjs
//   MP=host: the benchmark runs in the host's window with a joiner connected; MP=join: in the joiner's window
import { chromium } from "playwright";
import fs from "node:fs";
const base = process.env.CLIENT_URL ?? "http://localhost:4173", out = process.env.OUT_DIR ?? ".", label = process.env.LABEL ?? "run";
const W = +(process.env.W ?? 1280), H = +(process.env.H ?? 720);
const exe = fs.existsSync("/opt/pw-browsers/chromium") && !process.env.PW_OWN ? { executablePath: process.env.PW_CHROME ?? "/opt/pw-browsers/chromium" } : {};
const browser = await chromium.launch({ ...exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-precise-memory-info", ...(process.env.XARGS ? process.env.XARGS.split(" ") : [])] });
const open = async () => { const p = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage(); p.on("pageerror", (e) => console.log("page error:", String(e))); return p; };
const page = await open();
await page.goto(`${base}/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, H - 100);
const t0 = Date.now();
let joiner = null;
if (process.env.MP) {
  await page.click("#btn-create", { timeout: 180000 });
  await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
  const code = await page.evaluate(() => window.__bfb.info().roomCode);
  joiner = await open();
  await joiner.goto(`${base}/?test=1&room=${code}`, { timeout: 480000 });
  await joiner.waitForFunction(() => !!document.querySelector("#btn-accept-invite"), null, { timeout: 480000 });
  await joiner.click("#btn-accept-invite", { timeout: 480000 });
  await joiner.waitForFunction(() => window.__bfb?.info().screen === "playing", null, { timeout: 1500000 }); // (a join takes 6-13 min on the test box)
} else {
  await page.click("#btn-solo", { timeout: 180000 });
  await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
}
const loadMs = Date.now() - t0;
console.log(`${label}: loaded in ${(loadMs / 1000).toFixed(1)} s`);
const target = process.env.MP === "join" && joiner ? joiner : page;
await target.evaluate(() => window.__bfb.testInput(true));
await new Promise((r) => setTimeout(r, 3000));
// PROFILE=1: a CPU profile of the main thread for the whole run (the functions that took the time)
const cdp = process.env.PROFILE ? await target.context().newCDPSession(target) : null;
if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); await cdp.send("Profiler.start"); }
await target.evaluate(() => window.__bfb.bench());
await target.waitForFunction(() => window.__bfb.benchResult(), null, { timeout: 3600000, polling: 2000 });
if (cdp) {
  const { profile } = await cdp.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const nd of profile.nodes) for (const c of nd.children ?? []) parent.set(c, nd.id);
  const self = new Map(), incl = new Map(), dt = profile.timeDeltas;
  const key = (cf) => `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`;
  for (let i = 0; i < profile.samples.length; i++) {
    const ms = (dt[i] ?? 0) / 1000; let id = profile.samples[i];
    const k0 = key(byId.get(id).callFrame); self.set(k0, (self.get(k0) ?? 0) + ms);
    const seen = new Set(); while (id !== undefined) { const k = key(byId.get(id).callFrame); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + ms); } id = parent.get(id); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)} ms  ${k}`).join("\n");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/${label}-cpu.txt`, `SELF TIME\n${top(self, 60)}\n\nINCLUSIVE\n${top(incl, 120)}\n`);
}
const res = await target.evaluate(() => window.__bfb.benchResult());
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/${label}.txt`, `loaded in ${(loadMs / 1000).toFixed(1)} s (click -> playing)\n` + res.text + "\n");
fs.writeFileSync(`${out}/${label}.json`, JSON.stringify({ loadMs, ...JSON.parse(res.json) }, null, 1));
console.log(res.text);
await browser.close();
