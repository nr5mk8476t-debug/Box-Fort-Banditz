// R13.1: solo refresh + applyWorld cost per call, and refreshes per second at a forced frame rate
import { chromium } from "playwright";
const exe = process.env.PW_CHROME || "/opt/pw-browsers/chromium";
const b = await chromium.launch({ executablePath: undefined }).catch(() => chromium.launch({ executablePath: exe }));
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("http://localhost:4173/?test=1&map=new" + (process.env.Q ?? ""));
await p.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await p.click("#btn-solo", { timeout: 240000 });
await p.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await p.evaluate(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
await new Promise((r) => setTimeout(r, 15000));
const runs = [];
for (let i = 0; i < 5; i++) { runs.push(await p.evaluate(() => window.__bfb.applyBench(200))); await new Promise((r) => setTimeout(r, 500)); }
const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[2];
console.log(JSON.stringify({ refreshMs: +med("refresh").toFixed(3), applyMs: +med("apply").toFixed(3), heapKB: runs.map((r) => r.heapKB), ...runs[0], refresh: undefined, apply: undefined }));
await b.close();
