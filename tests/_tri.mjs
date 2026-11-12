import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
const ev = (f, a) => page.evaluate(f, a);
await page.goto(`http://localhost:4173/?test=1`, { timeout: 480000 });
await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
await page.mouse.click(200, 300); await page.click("#btn-solo", { timeout: 180000 });
await page.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
await ev(() => window.__bfb.testInput(true));
for (const v of [[-75.5, 9.5, 6.5, 0, 1.45], [-79.5, 6.5, 12.5, 2.4, 0.45]]) {
  await ev((v) => window.__bfb.camAt(...v), v); await sleep(5000);
  console.log(JSON.stringify(v), await ev(() => { const sc = window.__bfb.scene(); const act = new Set(); const a = sc.getActiveMeshes(); for (let i = 0; i < a.length; i++) act.add(a.data[i]);
    const out = []; for (const m of sc.meshes) { if (!m.getTotalVertices || !m.getTotalVertices()) continue; const bb = m.getBoundingInfo().boundingBox; const p = { x: -74.3, y: 4.75, z: 7.0 };
      if (p.x < bb.minimumWorld.x || p.x > bb.maximumWorld.x || p.y < bb.minimumWorld.y || p.y > bb.maximumWorld.y || p.z < bb.minimumWorld.z || p.z > bb.maximumWorld.z) continue;
      let r = m, root = m.name; while (r.parent) { r = r.parent; root = r.name; }
      out.push(`${m.name}[${root}] en=${m.isEnabled()} vis=${m.isVisible} act=${act.has(m)} mat=${m.material?.name} bb=${bb.minimumWorld.x.toFixed(0)},${bb.minimumWorld.z.toFixed(0)}..${bb.maximumWorld.x.toFixed(0)},${bb.maximumWorld.z.toFixed(0)}`); }
    return out.join("\n  "); }));
}
await browser.close();
