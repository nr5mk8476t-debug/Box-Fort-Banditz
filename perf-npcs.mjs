// Client cost of the pedestrians: draw calls + frame time in solo at the plaza (software GPU).
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto((process.env.CLIENT_URL ?? "http://localhost:4173") + "/?test=1");
await p.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 90000 });
await p.click("#btn-solo");
await p.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
await p.evaluate(() => { window.__bfb.testInput(true); window.__bfb.teleport(0, -12, 0); });
await sleep(4000);
const sample = async (label) => {
  await p.evaluate(() => window.__bfb.perf(true));
  await sleep(4000);
  const r = await p.evaluate(() => ({ i: window.__bfb.info(), perf: window.__bfb.perf(), npc: window.__bfb.npcStats(), meshes: window.__bfb.scene().meshes.length, active: window.__bfb.scene().getActiveMeshes().length }));
  console.log(label, JSON.stringify({ fps: r.i.fps, drawCalls: r.i.drawCalls, npcVisible: r.npc.visible, meshes: r.meshes, activeMeshes: r.active, worstRenderMs: r.perf.render.toFixed(1), worstWorldMs: r.perf.world.toFixed(1), worstApplyMs: r.perf.apply.toFixed(1) }));
};
await sample("plaza, facing north:");
await p.evaluate(() => window.__bfb.setYaw(Math.PI));
await sample("plaza, facing south:");
await browser.close();
