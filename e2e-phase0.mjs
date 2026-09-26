// Phase 0 end-to-end test: real headless Chrome windows, real server, real rendering.
// Usage: start server (port 2567) + client (vite preview on 4173), then: node tests/e2e-phase0.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.CLIENT_URL ?? "http://localhost:4173";
const OUT = process.env.OUT_DIR ?? "test-output";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (cond, msg) => { results.push({ ok: !!cond, msg }); console.log(cond ? "  ok  " : " FAIL ", msg); };
// Distance covered from standstill with the Phase 1 acceleration (20 m/s^2) up to top speed vmax
const rampDist = (t, vmax, a = 20) => { const tr = vmax / a; return t < tr ? 0.5 * a * t * t : 0.5 * a * tr * tr + vmax * (t - tr); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

async function openPage(name, query = "?test=1") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.__audioCtxCount = 0;
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__audioCtxCount++; } };
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  // generous timeouts: with 3 other windows rendering the city on the CPU, a 4th page loads slowly
  await page.goto(BASE + "/" + query, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 240000 });
  page.label = name;
  return page;
}
const info = (p) => p.evaluate(() => window.__bfb.info());
const hideOverlays = (p) => p.evaluate(() => { document.getElementById("pause").classList.add("hidden"); });
const shot = async (p, file) => { await p.screenshot({ path: `${OUT}/${file}` }); };

try {
  console.log("\n# Title screen");
  const A = await openPage("A");
  await sleep(1500);
  await shot(A, "01-title.png");
  ok((await A.evaluate(() => window.__audioCtxCount)) === 0, "no audio starts before the player interacts (no autoplay)");
  await A.mouse.click(200, 600);
  await sleep(200);
  ok((await A.evaluate(() => window.__audioCtxCount)) === 1, "audio switches on after the first click");
  ok(await A.isVisible("#main-menu"), "main menu visible");

  console.log("\n# Settings persist");
  await A.click("#btn-settings");
  await A.locator('[data-setting="fov"]').fill("100");
  await A.locator('[data-setting="showFps"]').check();
  await shot(A, "06-settings.png");
  await A.click("#btn-settings-close");
  await A.reload({ waitUntil: "domcontentloaded" });
  await A.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 90000 });
  await A.click("#btn-settings");
  ok((await A.locator('[data-setting="fov"]').inputValue()) === "100", "FOV setting remembered after reload");
  ok(await A.locator('[data-setting="showFps"]').isChecked(), "checkbox setting remembered after reload");
  await A.click("#btn-settings-close");

  console.log("\n# Solo mode");
  await A.click("#btn-solo");
  await A.waitForFunction(() => window.__bfb.info().screen === "playing");
  let i = await info(A);
  ok(i.mode === "solo", "solo mode starts without a server");
  await A.click("#btn-resume");
  await sleep(1800);
  if (await A.isVisible("#pause")) { await A.click("#btn-resume"); await sleep(1800); }
  ok(!(await A.isVisible("#pause")), "clicking PLAY enters the game (mouse captured, or drag-to-look fallback)");
  // Headless Chrome throttles frames to ~1/s while the mouse is captured, so from here on the
  // test releases the mouse and uses a test-only input mode that behaves as if it were captured.
  await A.evaluate(() => document.exitPointerLock());
  await sleep(300);
  await A.evaluate(() => window.__bfb.testInput(true));
  await sleep(1000); // let shaders finish compiling (software rendering in CI is slow)
  i = await info(A);
  const start = i.pos, st0 = i.stats.moveSteps;
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1, sprint: true }));
  // (wait for ~0.7 s of game time rather than wall time: the first seconds can be slow on the test machine)
  await A.waitForFunction((n) => window.__bfb.info().stats.moveSteps >= n, st0 + 40, { timeout: 90000, polling: 250 }).catch(() => {});
  i = await info(A);
  await A.evaluate(() => window.__bfb.setAxes(null));
  const soloSteps = i.stats.moveSteps - st0, soloMoved = i.pos.z - start.z, soloExp = rampDist(soloSteps / 60, 7.8);
  console.log(`   [diag] solo fps ${i.fps}, lost to stalls ${i.stats.droppedMs.toFixed(0)}ms total`);
  ok(soloMoved > 0.3 && Math.abs(soloMoved - soloExp) < 0.6, `solo: sprinted ${soloMoved.toFixed(2)}m over ${soloSteps} sim steps (expected ~${soloExp.toFixed(2)}m)`);
  // ---- Phase 1 moves (solo) ----
  console.log("\n# Phase 1 moves");
  const mv = () => A.evaluate(() => window.__bfb.move());
  const axes = (a) => A.evaluate((x) => window.__bfb.setAxes(x), a);
  const waitMove = (fnSrc, ms = 20000) => A.waitForFunction(new Function("const m = window.__bfb.move(); return " + fnSrc), null, { timeout: ms }).then(() => true, () => false);
  const hide = () => A.evaluate(() => { document.getElementById("pause").classList.add("hidden"); });
  const camOk = async (what) => ok(await A.evaluate(() => { const c = window.__bfb.scene().activeCamera; return [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y, c.rotation.z, c.fov].every(Number.isFinite); }), `camera still valid after ${what}`);

  const LM0 = await A.evaluate(() => window.__bfb.landmarks());
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM0.runway);
  await axes(null); await sleep(600); await hide();
  await shot(A, "10-hands-idle.png");

  // Sprint -> stamina drains, HUD bar shows
  await axes({ mx: 0, mz: 1, sprint: true });
  ok(await waitMove("m.stamina < 0.8"), "sprinting drains stamina");
  ok(await A.evaluate(() => !document.getElementById("stamina").classList.contains("full")), "stamina bar appears while draining");
  await shot(A, "11-hands-sprint.png");
  // Slide (teleport resets stamina; sprint up to speed, then press C)
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z - 4, l.yaw), LM0.runway);
  await axes({ mx: 0, mz: 1, sprint: true });
  ok(await waitMove("Math.hypot(m.vx, m.vz) > 6.5", 8000), "reached sprint speed");
  await axes({ mx: 0, mz: 1, sprint: true, crouch: true });
  ok(await waitMove("m.slideT > 0", 8000), "sprint + C starts a belly slide");
  await shot(A, "12-hands-slide.png");
  await camOk("sprint + slide");
  await axes(null);
  ok(await waitMove("m.slideT === 0 && Math.hypot(m.vx, m.vz) < 0.1"), "slide ends and you come to a stop");

  // Dodge
  await axes({ mx: 1, mz: 0, dodge: true });
  ok(await waitMove("m.dodgeT > 0 || m.dodgeCd > 0", 8000), "Q dodge fires");
  await axes(null);
  ok(await A.evaluate(() => !document.getElementById("dodge-pip").classList.contains("ready")), "dodge pip shows cooldown");

  // Mantle the 1.4 m ledge in the construction yard
  const LM = await A.evaluate(() => window.__bfb.landmarks());
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM.ledge14);
  await axes({ mx: 0, mz: 1 });
  await waitMove(`m.z > ${LM.ledge14.frontZ - 0.5}`, 8000);
  await axes({ mx: 0, mz: 0, jump: true }); // just SPACE while facing the ledge
  ok(await waitMove("m.mantleT > 0", 8000), "SPACE facing a ledge starts a climb");
  await shot(A, "13-hands-mantle.png");
  await camOk("climb");
  await axes(null);
  ok(await waitMove("Math.abs(m.y - 1.4) < 0.01 && m.grounded"), "climbed onto the 1.4 m ledge");

  // Crawl tunnel (runs along +x, roof from roofStartX to roofEndX): standing is blocked, crouching gets through
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM.tunnelEntrance);
  await axes({ mx: 0, mz: 1 });
  await sleep(2500);
  const blockedX = (await mv()).x;
  ok(blockedX < LM.tunnelEntrance.roofStartX - 0.2, `standing player can't enter the crawl tunnel (x=${blockedX.toFixed(2)})`);
  await axes({ mx: 0, mz: 1, crouch: true });
  ok(await waitMove(`m.x > ${LM.tunnelEntrance.roofStartX + 1} && m.crouching`, 30000), "crouching player crawls into the tunnel");
  await axes({ mx: 0, mz: 0, crouch: false }); // let go of C while under the roof
  await sleep(600);
  const tun = await mv();
  ok(tun.crouching && tun.x < LM.tunnelEntrance.roofEndX - 0.2, `can't stand up under the tunnel roof (x=${tun.x.toFixed(2)}, crouching=${tun.crouching})`);
  await A.evaluate(() => window.__bfb.setPitch(0.1));
  await shot(A, "14-crouch-tunnel.png");
  await camOk("crouch");

  // ---- Phase 2 loot (solo, real keys + mouse) ----
  console.log("\n# Phase 2 loot (solo)");
  const items = await A.evaluate(() => window.__bfb.items());
  ok(items.length >= 28, `the city spawned ${items.length} loot items`);
  ok(new Set(items.map((x) => x.type)).size >= 6, `variety: ${new Set(items.map((x) => x.type)).size} different item types`);
  const inv = () => A.evaluate(() => window.__bfb.serverInventory());
  const waitInv = (src, ms = 15000) => A.waitForFunction(new Function("const v = window.__bfb.serverInventory(); return " + src), null, { timeout: ms }).then(() => true, () => false);
  // (wait for THAT item when we know its id: a slow frame can still show the previous target)
  const lookAt = async (type, id = null) => A.waitForFunction(([t, id]) => { const l = window.__bfb.lookTarget(); return l?.type === t && (!id || l.id === id); }, [type, id], { timeout: 15000 }).then(() => true, () => false);
  // each check gets its own clean patch of plaza (so a TV dropped earlier can't steal the crosshair)
  const spawnAhead = async (type, x = -16, z = -8) => {
    // keep wandering pedestrians out of the way of these precise loot checks
    await A.evaluate(([x, z]) => { window.__bfb.teleport(x, z, 0); window.__bfb.clearNpcs(x, z + 8, 16); }, [x, z]);
    await sleep(500);
    return A.evaluate(([t, x, z]) => { const id = window.__bfb.spawnItem(t, x, z + 1.6); window.__bfb.setPitch(Math.atan2(1.55 - 0.2, 1.6)); return id; }, [type, x, z]);
  };
  await axes(null);
  await spawnAhead("crt_tv");
  ok(await lookAt("crt_tv"), "looking at a TV shows the grab prompt");
  ok(await A.isVisible("#prompt") && /CRT TV/i.test(await A.textContent("#prompt")) && /\$\d+/.test(await A.textContent("#prompt")), `prompt text: "${(await A.textContent("#prompt")).slice(0, 60)}..."`);
  await hide();
  await shot(A, "15-look-prompt.png");
  await A.keyboard.press("e");
  ok(await waitInv("v.hand !== ''"), "E grabs the TV into your hands");
  const inv1 = await inv();
  ok(inv1.carryMul < 1, `carrying the TV slows you down (speed x${inv1.carryMul.toFixed(2)})`);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await sleep(600);
  await shot(A, "16-holding-tv.png");
  await A.keyboard.press("g");
  ok(await waitInv("v.hand === ''"), "G drops it");
  await sleep(400);

  // pockets: three small items go in pockets, a fourth goes to your hands
  for (let k = 0; k < 4; k++) {
    const cid = await spawnAhead("rubber_chicken", -13);
    await lookAt("rubber_chicken", cid);
    await A.keyboard.press("e");
    // wait until that grab has landed (a busy test machine can take a while)
    await A.waitForFunction((n) => { const v = window.__bfb.serverInventory(); return v && [v.hand, ...v.pockets].filter(Boolean).length >= n; }, k + 1, { timeout: 10000 }).catch(() => {});
    await sleep(250);
  }
  const inv2 = await inv();
  const why = inv2.hand ? "" : ` | look=${JSON.stringify(await A.evaluate(() => window.__bfb.lookTarget()))} flash="${await A.evaluate(() => document.getElementById("flash")?.textContent ?? "")}" items near=${JSON.stringify(await A.evaluate(() => window.__bfb.items().filter((i) => Math.hypot(i.x + 13, i.z + 6.4) < 3).map((i) => i.type + ":" + i.mode)))}`;
  ok(inv2.pockets.every((x) => x) && inv2.hand, `3 pockets filled + 4th chicken in hands (${JSON.stringify(inv2.pockets.map(Boolean))}, hand=${!!inv2.hand})${why}`);
  ok(/Chicken/.test(await A.textContent("#slot-0")), "pocket HUD shows what you carry");
  await A.mouse.click(640, 360, { button: "right" });
  ok(await waitInv("v.sel === 1", 5000), "right click cycles the selected pocket");

  // throw from hands: hold left mouse ~1 s, release
  const thrownId = inv2.hand;
  await A.evaluate(() => window.__bfb.clearNpcs(-16, 0, 16));
  await A.evaluate(() => window.__bfb.setPitch(-0.25));
  await A.mouse.down();
  await sleep(1000);
  ok(await A.isVisible("#charge"), "charge ring shows while winding up");
  await A.mouse.up();
  ok(await waitInv("v.hand === ''", 5000), "releasing throws the item");
  const landed = await A.waitForFunction((id) => { const it = window.__bfb.items().find((x) => x.id === id); return it && it.mode === "free" && it.resting ? it : null; }, thrownId, { timeout: 20000 }).then((h) => h.jsonValue(), () => null);
  const me = await mv();
  ok(landed && Math.hypot(landed.x - me.x, landed.z - me.z) > 5, `thrown chicken landed ${landed ? Math.hypot(landed.x - me.x, landed.z - me.z).toFixed(1) : "?"} m away`);
  // empty pockets, then drag a giant duck alone
  for (let k = 0; k < 4; k++) { await A.keyboard.press("g"); await sleep(350); }
  ok(await waitInv("v.hand === '' && v.pockets.every((x) => !x)", 8000), "G empties pockets one by one");
  await spawnAhead("rubber_duck", -8, 5);
  ok(await lookAt("rubber_duck"), "looking at the giant duck");
  ok(/DRAG IT/.test(await A.textContent("#prompt")), "giant items say you drag them");
  await A.keyboard.press("e");
  ok(await waitInv("Math.abs(v.carryMul - 0.4) < 0.01"), "dragging a giant item alone is slow (x0.4)");
  await hide();
  await A.evaluate(() => window.__bfb.setPitch(0.3));
  await sleep(600);
  await shot(A, "17-dragging-duck.png");
  await A.keyboard.press("g");
  await sleep(400);
  await camOk("loot");

  // ---- Phase 2.5 pedestrians + punching (solo, real mouse clicks) ----
  console.log("\n# Phase 2.5 pedestrians (solo)");
  // (tests above cleared a few people out of the way; the crowd refills every 5 s)
  // (the everyday crowd only: cashiers, cops, raccoons and big shots + their entourage have their own jobs)
  const CROWD = ["tourist", "businessman", "influencer", "jogger", "gym_bro", "mall_cop", "mime", "pigeon_lady"];
  await A.waitForFunction((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)).length === 20, CROWD, { timeout: 10000 }).catch(() => {});
  const npcs0 = await A.evaluate((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)), CROWD);
  ok(npcs0.length === 20, `the streets have ${npcs0.length} pedestrians`);
  ok((await A.evaluate(() => window.__bfb.npcs().filter((n) => n.kind === "cashier").length)) === 4, "a cashier in each of the 4 shops");
  ok(new Set(npcs0.map((n) => n.kind)).size >= 6, `mix of types: ${[...new Set(npcs0.map((n) => n.kind))].join(", ")}`);
  await sleep(2500);
  const npcs1 = await A.evaluate((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)), CROWD);
  const walked = npcs1.filter((n) => { const o = npcs0.find((x) => x.id === n.id); return o && Math.hypot(n.x - o.x, n.z - o.z) > 0.5; }).length;
  ok(walked >= 12, `${walked}/20 pedestrians walked around in 2.5 s`);
  const ns = await A.evaluate(() => window.__bfb.npcStats());
  ok(ns.total >= 24 && ns.visible < ns.total && ns.visible > 0, `${ns.total} people exist; ones beyond 60 m are culled (${ns.visible} drawn from here)`);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.filter((m) => m.name === "beam").length === 0), "no sky beams any more");
  // (away from the loot left lying around by the tests above, so nothing else is under the crosshair)
  await A.evaluate(() => { window.__bfb.teleport(-8, -8, 0); });
  await sleep(400);
  await A.evaluate(() => { window.__bfb.spawnItem("golden_spork", -7.2, -5.5); window.__bfb.setPitch(0.3); });
  await sleep(1500);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.some((m) => m.name === "sparkle" && m.isEnabled())), "rare loot twinkles with a sparkle");

  // punch a tourist placed right in front of us
  const tId = await A.evaluate(() => window.__bfb.placeNpc("tourist", -8, -6.7, Math.PI));
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const sawTarget = await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "tourist", null, { timeout: 10000 }).then(() => true, () => false);
  ok(sawTarget, "facing a tourist with empty hands = punch target");
  ok(/Bonk/.test(await A.textContent("#prompt")) && /Tourist/.test(await A.textContent("#prompt")), `prompt: "${(await A.textContent("#prompt")).slice(0, 50)}"`);
  const itemsBefore = new Set((await A.evaluate(() => window.__bfb.items())).map((x) => x.id));
  await A.mouse.click(640, 360);
  const hitState = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return n && n.robbed ? n.state : null; }, tId, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  ok(hitState, `left click punched the tourist (now "${hitState}")`);
  await sleep(250);
  await hide();
  await shot(A, "18-bonk-tourist.png");
  const dropped = (await A.evaluate(() => window.__bfb.items())).filter((x) => !itemsBefore.has(x.id) && Math.hypot(x.x + 8, x.z + 6.7) < 5);
  ok(dropped.length >= 1, `the tourist dropped loot: ${dropped.map((x) => x.type).join(", ")}`);
  ok((await A.evaluate(() => window.__bfb.heat())) > 0, `punching raises your heat (${await A.evaluate(() => window.__bfb.heat())})`);
  ok(await A.isVisible("#heat"), "heat meter appears on the HUD");
  await sleep(1500);
  await shot(A, "19-tourist-flees.png");

  // a gym bro fights back: stand still and lose the slap fight (2 hits = knocked down)
  await A.evaluate(() => { window.__bfb.teleport(-16, 5, 0); });
  await sleep(500);
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", -16, 6.4); window.__bfb.setPitch(Math.atan2(1.35, 1.4)); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "chicken in pocket before the fight");
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const gId = await A.evaluate(() => window.__bfb.placeNpc("gym_bro", -16, 6.6, Math.PI));
  await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "gym_bro", null, { timeout: 10000 }).catch(() => {});
  ok(/FIGHTS BACK/.test(await A.textContent("#prompt")), "prompt warns that the gym bro fights back");
  await A.mouse.click(640, 360);
  const fought = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return n && (n.state === "chase" || n.state === "windup"); }, gId, { timeout: 10000 }).then(() => true, () => false);
  ok(fought, "the gym bro comes at you");
  const knocked = await A.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: 30000 }).then(() => true, () => false);
  ok(knocked, "two slaps from the gym bro = you're knocked down");
  const [kPose, gState] = await A.evaluate((id) => [window.__bfb.info().hud.pose, window.__bfb.npcs().find((x) => x.id === id)?.state], gId);
  ok(kPose === "knocked", `HUD pose says knocked (${kPose})`);
  ok(gState === "gloat", `the gym bro gloats (${gState})`);
  await hide();
  await shot(A, "20-knocked-down.png");
  ok(await waitInv("v.hand === '' && v.pockets.every((x) => !x)", 5000), "getting knocked down drops everything you carried");
  const up = await A.waitForFunction(() => window.__bfb.move().knockT <= 0, null, { timeout: 15000 }).then(() => true, () => false);
  ok(up, "you get back up");
  await camOk("knockdown");

  // ---- Phase 3.5: the big city (solo, real keys + mouse) ----
  console.log("\n# Phase 3.5 big city (solo)");
  const defs = await A.evaluate(() => window.__bfb.propDefs());
  const faceProp = (d, gap) => A.evaluate(([d, gap, r]) => { window.__bfb.teleport(d.x + Math.sin(d.yaw) * (r + gap), d.z + Math.cos(d.yaw) * (r + gap), d.yaw + Math.PI); window.__bfb.setPitch(0.35); }, [d, gap, { dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, till: 0.3 }[d.kind] ?? 0.5]);
  // (the punching tests above made us wanted: cops crossing the road would make traffic brake)
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); });
  await sleep(1500);
  const cars0 = await A.evaluate(() => window.__bfb.cars());
  ok(cars0.length === 14, `${cars0.length} cars on the roads`);
  await sleep(2000);
  const cars1 = await A.evaluate(() => window.__bfb.cars());
  ok(cars1.filter((c, i) => Math.hypot(c.x - cars0[i].x, c.z - cars0[i].z) > 1).length >= 9, "traffic is moving");
  // search a dumpster with E
  const dump = defs.find((d) => d.kind === "dumpster");
  await faceProp(dump, 1.0);
  const useOk = await A.waitForFunction((id) => window.__bfb.useTarget()?.id === id, dump.id, { timeout: 15000 }).then(() => true, () => false);
  ok(useOk && /Search/.test(await A.textContent("#prompt")), `dumpster prompt: "${(await A.textContent("#prompt")).slice(0, 40)}"`);
  const before = (await A.evaluate(() => window.__bfb.items())).length;
  await A.keyboard.press("e");
  ok(await A.waitForFunction((n) => window.__bfb.items().length >= n + 1, before, { timeout: 15000 }).then(() => true, () => false), "E on a dumpster: junk pops out");
  await sleep(400); await hide();
  await shot(A, "30-dumpster-search.png");
  // smash a phone booth
  const booth = defs.find((d) => d.kind === "phone");
  await faceProp(booth, 0.6);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await A.mouse.move(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.punchTarget()?.prop, null, { timeout: 15000 }).then(() => true, () => false) && /Smash/.test(await A.textContent("#prompt")), `phone booth prompt: "${(await A.textContent("#prompt")).slice(0, 40)}"`);
  await A.mouse.click(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "phone_handset"), null, { timeout: 15000 }).then(() => true, () => false), "punching a phone booth: the handset pops out");
  ok(await A.waitForFunction((id) => window.__bfb.props().find((p) => p.id === id)?.ready === false, booth.id, { timeout: 5000 }).then(() => true, () => false), "the booth stays broken for a while");
  // hold-up at a till: HOLD E for 3 s
  const till = defs.find((d) => d.kind === "till");
  await faceProp(till, 1.0);
  await A.evaluate(() => window.__bfb.setPitch(0.3));
  ok(await A.waitForFunction(() => window.__bfb.robTarget()?.kind === "till", null, { timeout: 15000 }).then(() => true, () => false) && /HOLD R/.test(await A.textContent("#prompt")), `till prompt: "${(await A.textContent("#prompt")).slice(0, 90)}"`);
  await hide();
  await shot(A, "31-shop-till.png");
  await A.keyboard.down("r");
  ok(await A.waitForFunction(() => window.__bfb.robT() > 0.3, null, { timeout: 15000 }).then(() => true, () => false), "holding E: hold-up in progress (progress ring)");
  const robbed = await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "cash_bundle"), null, { timeout: 30000 }).then(() => true, () => false);
  await A.keyboard.up("r");
  ok(robbed, "after 3 s: a bundle of cash");
  // get hit by a car: wiped out, respawn at the fort after 10 s
  await A.evaluate(() => window.__bfb.wipeout());
  ok(await A.waitForFunction(() => !document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 10000 }).then(() => true, () => false), "wiped out: countdown overlay");
  await sleep(500); await hide();
  await shot(A, "32-wiped-out.png");
  ok(await A.waitForFunction(() => window.__bfb.respawnT() === 0 && document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 40000 }).then(() => true, () => false), "respawned after 10 s");
  const home = await A.evaluate(() => { const m = window.__bfb.move(); return Math.hypot(m.x, m.z); });
  ok(home > 75, `back at the fort (${home.toFixed(0)} m from the centre)`);
  ok(await A.evaluate(() => !!document.querySelector('[data-setting="lowGraphics"]')), "performance mode setting exists");

  // ---- Phase 4: police + jail (solo) ----
  console.log("\n# Phase 4 police (solo)");
  // camera can never flip: look straight up and get knocked down
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.setPitch(-1.5); window.__bfb.wipeout(); });
  let worstPitch = 0;
  for (let i = 0; i < 12; i++) { const cp = await A.evaluate(() => window.__bfb.camPitch()); if (cp !== null) worstPitch = Math.min(worstPitch, cp); await sleep(120); }
  ok(worstPitch > -Math.PI / 2, `camera never tips past straight up when knocked over looking up (pitch ${worstPitch.toFixed(2)})`);
  await A.waitForFunction(() => window.__bfb.respawnT() === 0, null, { timeout: 40000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setPitch(0));
  // 1 star: a cop comes for you
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.clearNpcs(-16, -8, 12); window.__bfb.setHeat(40); });
  ok(await A.waitForFunction(() => window.__bfb.stars() === 1, null, { timeout: 10000 }).then(() => true, () => false), "40 heat = 1 wanted star on the HUD");
  ok(await A.waitForFunction(() => window.__bfb.cops().length >= 1, null, { timeout: 15000 }).then(() => true, () => false), "a cop is dispatched");
  // stand still: busted
  const busted = await A.waitForFunction(() => window.__bfb.jail()?.jailT > 0, null, { timeout: 90000 }).then(() => true, () => false);
  ok(busted, "stood around: BUSTED");
  ok(await A.waitForFunction(() => window.__bfb.jail()?.open && !document.getElementById("jail").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false), "jail screen with the lock-picking game");
  const st = await A.evaluate(() => window.__bfb.station());
  const inCell = (m) => st.cells.some((c) => m.x >= c.rect.minX - 0.4 && m.x <= c.rect.maxX + 0.4 && m.z >= c.rect.minZ - 0.4 && m.z <= c.rect.maxZ + 0.4);
  await sleep(600);
  ok(inCell(await A.evaluate(() => window.__bfb.move())), "you're in a cell at the police station");
  ok((await A.evaluate(() => window.__bfb.heat())) === 0, "heat reset to 0");
  // can't walk: W does nothing; A/D choose pins
  const m0 = await A.evaluate(() => window.__bfb.move());
  await A.keyboard.down("w"); await sleep(800); await A.keyboard.up("w");
  const m1 = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.2, "can't walk around while picking the lock");
  ok((await A.evaluate(() => window.__bfb.jail())).noise === 0, "trying to walk doesn't count as a lock-pick press (no noise)");
  // the mouse moves the pick cursor, the camera stays still (Blake: the camera swung around in jail)
  const yaw0 = await A.evaluate(() => window.__bfb.scene().activeCamera.rotation.y);
  const cur0 = await A.evaluate(() => window.__bfb.jail());
  await A.mouse.move(640, 360); await A.mouse.move(520, 330, { steps: 6 });
  await sleep(300);
  const cur1 = await A.evaluate(() => window.__bfb.jail());
  const yaw1 = await A.evaluate(() => window.__bfb.scene().activeCamera.rotation.y);
  ok(Math.abs(yaw1 - yaw0) < 0.01 && Math.hypot(cur1.cx - cur0.cx, cur1.cy - cur0.cy) > 20, "in jail the mouse moves the lock pick, not the camera");
  const sel0 = (await A.evaluate(() => window.__bfb.jail())).sel;
  await A.keyboard.press("d");
  ok((await A.evaluate(() => window.__bfb.jail())).sel !== sel0, "D moves the pick to the next pin");
  await sleep(300); await hide();
  await shot(A, "33-jail-lockpick.png");
  // pick it (perfect timing, through the real keys)
  // (slow headless frames make the auto-picker slow; give it time, the lock clock is separate)
  await A.evaluate(() => window.__bfb.setJailTime(90));
  const broke = await A.evaluate(() => window.__bfb.lockAutoPlay());
  const out = await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0, null, { timeout: 60000 }).then(() => true, () => false);
  ok(broke && out, "picked the lock: broke out");
  const mo = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(mo.x - st.alley.x, mo.z - st.alley.z) < 3, "broke out into the back alley");
  ok(await A.waitForFunction(() => window.__bfb.stars() === 1, null, { timeout: 5000 }).then(() => true, () => false), "still wanted after a jailbreak (1 star)");
  await sleep(300); await hide();
  await shot(A, "34-jailbreak.png");
  // serve the time instead: out the front door, clean
  await A.evaluate(() => window.__bfb.clearCops());
  await A.evaluate(() => window.__bfb.bust());
  await A.waitForFunction(() => window.__bfb.jail()?.jailT > 0, null, { timeout: 10000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setJailTime(1.2));
  ok(await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0 && !window.__bfb.jail()?.open, null, { timeout: 20000 }).then(() => true, () => false), "time served: released, jail screen gone");
  const md = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(md.x - st.door.x, md.z - st.door.z) < 3 && (await A.evaluate(() => window.__bfb.heat())) === 0, "served: out the front door with 0 heat");
  // 3 stars: the cop car
  await A.evaluate(() => { window.__bfb.teleport(0, -40, Math.PI); window.__bfb.setHeat(100); });
  let carSeen = false;
  for (let i = 0; i < 80 && !carSeen; i++) { await A.evaluate(() => { if (window.__bfb.jail()?.jailT === 0) window.__bfb.setHeat(100); }); carSeen = (await A.evaluate(() => window.__bfb.copCars())).length > 0; if (!carSeen) await sleep(250); }
  ok(carSeen, "max heat: a cop car comes after you");
  ok((await A.evaluate(() => window.__bfb.stars())) === 3 || (await A.evaluate(() => window.__bfb.jail()?.jailT > 0)), "3 stars on the HUD");
  await sleep(1500); await hide();
  await shot(A, "35-three-stars.png");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); });
  await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0 || window.__bfb.jail() === null, null, { timeout: 5000 }).catch(() => {});

  // ---- Phase 4.5: big shots ----
  console.log("\n# Phase 4.5 big shots (solo)");
  await A.evaluate(() => { window.__bfb.teleport(-16, -11, 0); window.__bfb.setPitch(0); window.__bfb.clearNpcs(-16, -3, 14); });
  const bsId = await A.evaluate(() => window.__bfb.spawnBigShot("millionaire"));
  ok(!!bsId, "a millionaire comes to town");
  await sleep(1500);
  ok(await A.evaluate(() => !document.getElementById("bigshot") && !/IN TOWN/.test(document.getElementById("bb-title").textContent)), "5A: no tracker, no banner, no $$$: big shots just show up");
  // a millionaire standing right in front of you: punch = jackpot
  await A.evaluate(() => { window.__bfb.clearNpcs(-16, -3, 14); window.__bfb.placeNpc("millionaire", -16, -9.8, Math.PI); });
  await sleep(800);
  await A.mouse.move(640, 360);
  const heatBs0 = await A.evaluate(() => window.__bfb.heat());
  ok(await A.waitForFunction(() => /Bonk/.test(document.getElementById("prompt").textContent) && !/JACKPOT/.test(document.getElementById("prompt").textContent), null, { timeout: 10000 }).then(() => true, () => false), "5A: the prompt doesn't give away the jackpot");
  await A.mouse.click(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "gold_bar" || i.type === "diamond_ring"), null, { timeout: 15000 }).then(() => true, () => false), "punching the millionaire: gold bar / diamond ring pops out");
  ok((await A.evaluate(() => window.__bfb.heat())) - heatBs0 >= 25, "and that's a lot of heat");
  await sleep(300); await hide();
  await shot(A, "36-bigshot.png");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); window.__bfb.clearNpcs(-16, -8, 20); });

  // ---- Phase 5A: the cycle loop (solo, real keys) ----
  console.log("\n# Phase 5A cycle (solo)");
  const M = () => A.evaluate(() => window.__bfb.match());
  const waitPhase = (ph, ms = 60000) => A.waitForFunction((x) => window.__bfb.match().phase === x, ph, { timeout: ms }).then(() => true, () => false);
  ok((await M()).phase === "lobby" && /LOBBY/.test(await A.textContent("#mh-time")), "starts in the lobby (free roam)");
  ok(/ENTER/.test(await A.textContent("#mh-sub")), `lobby hint: "${await A.textContent("#mh-sub")}"`);
  await A.keyboard.press("Enter");
  ok(await A.waitForFunction(() => window.__bfb.match().phase !== "lobby", null, { timeout: 10000 }).then(() => true, () => false), "ENTER starts the match (intro countdown)");
  ok(/CYCLE 1 OF 3/.test(await A.textContent("#bb-title")), `banner: "${await A.textContent("#bb-title")}"`);
  ok((await M()).home.inside, "a cycle starts at home");
  ok(await waitPhase("scavenge", 30000), "intro -> scavenge");
  await A.evaluate(() => window.__bfb.noEvents());
  ok(/^[23]:\d\d$/.test(await A.textContent("#mh-time")) && /DAY 1/.test(await A.textContent("#mh-round")), `day timer shows ${await A.textContent("#mh-round")} ${await A.textContent("#mh-time")}`);
  ok(await A.isVisible("#scores"), "scoreboard shows during the round");
  // bank a TV: drop it in the yard and wait 10 s
  const yardPos = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  const fwd = { x: Math.sin(yardPos.yaw), z: Math.cos(yardPos.yaw) };
  await A.evaluate(([x, z]) => window.__bfb.spawnItem("crt_tv", x, z), [yardPos.x + fwd.x * 2, yardPos.z + fwd.z * 2]);
  const banked = await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "crt_tv" && i.lock === 100), null, { timeout: 60000 }).then(() => true, () => false);
  ok(banked, "loot resting in your yard locks in (banked) after 10 s");
  const bankNow = (await M()).scores[0].bank;
  ok(bankNow > 0 && /\+\d+/.test(await A.textContent("#scores")), `scoreboard shows the fort loot value (+${bankNow})`);
  await A.evaluate(() => window.__bfb.setPitch(0.35));
  await sleep(600);
  await hide();
  await shot(A, "24-banked-loot.png");
  // events: each one shows up
  for (const [kind, rx] of [["happyhour", /HAPPY HOUR/], ["truck", /GARBAGE TRUCK/], ["airdrop", /AIRDROP/], ["raccoons", /RACCOON/]]) {
    await A.evaluate((k) => window.__bfb.triggerEvent(k), kind);
    const seen = await A.waitForFunction((r) => new RegExp(r).test(document.getElementById("event-hud").textContent), rx.source, { timeout: 15000 }).then(() => true, () => false);
    ok(seen, `${kind}: event bar says "${await A.textContent("#event-hud")}"`);
    if (kind === "truck") {
      ok(await A.waitForFunction(() => window.__bfb.match().truckOn && window.__bfb.scene().getTransformNodeByName("truck").isEnabled(), null, { timeout: 20000 }).then(() => true, () => false), "the garbage truck drives in");
    }
    if (kind === "airdrop") ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "airdrop_crate"), null, { timeout: 20000 }).then(() => true, () => false), "an airdrop crate spawns");
    if (kind === "raccoons") ok(await A.waitForFunction(() => window.__bfb.npcs().some((n) => n.kind === "raccoon"), null, { timeout: 45000 }).then(() => true, () => false), "a raccoon sneaks toward your fort");
  }
  // small money goes straight into your cash
  await A.evaluate(() => { window.__bfb.clearNpcs(-8, -8, 8); window.__bfb.teleport(-8, -8, 0); });
  await sleep(500);
  await A.evaluate(() => { window.__bfb.spawnItem("coin_pile", -8, -6.4); window.__bfb.setPitch(Math.atan2(1.35, 1.6)); });
  await lookAt("coin_pile");
  ok(/STRAIGHT TO YOUR WALLET/.test(await A.textContent("#prompt")), "coins say they go straight to your wallet");
  const cash0 = (await M()).scores[0].cash;
  await A.keyboard.press("e");
  ok(await A.waitForFunction((c) => window.__bfb.match().scores[0].cash > c, cash0, { timeout: 15000 }).then(() => true, () => false), "grabbing coins = instant cash");
  ok(await waitInv("v.pockets.every((x) => !x)", 5000), "(not in your pockets)");
  // carry something away from home when time runs out = lost
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", -8, -6.4); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "pocketed a chicken out in the city");
  ok(await A.isVisible("#home-arrow") && /HOME \d+ m/.test(await A.textContent("#home-arrow")), `home compass: "${await A.textContent("#home-arrow")}"`);
  await A.evaluate(() => window.__bfb.setTimeLeft(2));
  ok(await waitPhase("dusk", 30000), "time's up -> nightfall");
  ok(await waitInv("v.pockets.every((x) => !x)", 5000), "the chicken is gone (lost)");
  ok(/NIGHT FALLS/.test(await A.textContent("#bb-title")), `banner: "${await A.textContent("#bb-title")}"`);
  ok(await waitPhase("night", 30000), "dusk -> night scavenge");
  ok(await A.waitForFunction(() => window.__bfb.night().level > 0.9 && window.__bfb.night().body, null, { timeout: 20000 }).then(() => true, () => false), "the city goes dark (night visuals)");
  ok(/NIGHT 1/.test(await A.textContent("#mh-round")) && /^[01]:\d\d$/.test(await A.textContent("#mh-time")), `night timer: ${await A.textContent("#mh-time")}`);
  const nightItems = await A.evaluate(() => window.__bfb.items().filter((i) => i.mode === "free"));
  const tvStill = nightItems.find((i) => i.type === "crt_tv" && i.lock === 100);
  ok(!!tvStill, "your banked TV is still in the fort at night");
  ok(nightItems.filter((i) => i.type !== "crt_tv").every((i) => i.mult === 2), "night loot is worth x2");
  await A.evaluate(() => { window.__bfb.teleport(-8, -30, 0); window.__bfb.setPitch(0.05); });
  await sleep(1500); await hide();
  await shot(A, "37-night.png");
  await A.evaluate(() => window.__bfb.setTimeLeft(1));
  ok(await waitPhase("dawn", 30000), "night -> sunrise");
  ok(await A.isVisible("#tally") && /SUNRISE/.test(await A.textContent("#tally")), "sunrise results card");
  const res = JSON.parse((await M()).results)[0];
  ok(res.lost >= 1 && res.banked >= 1, `results: fort loot ${res.banked} ($${res.bankedValue}), lost ${res.lost}`);
  await A.evaluate(() => window.__bfb.setTimeLeft(0.5));
  ok(await waitPhase("shop", 30000), "sunrise -> pawn shop");
  ok(await A.waitForFunction(() => window.__bfb.shop().open && !document.getElementById("shop").classList.contains("hidden"), null, { timeout: 10000 }).then(() => true, () => false), "the pawn shop screen opens (mouse released)");
  const offers = (await A.evaluate(() => window.__bfb.shop())).offers;
  const tvOffer = offers.find((o) => o.type === "crt_tv");
  ok(tvOffer && tvOffer.offer < tvOffer.value, `Sal lowballs the TV: $${tvOffer?.offer} for a $${tvOffer?.value} TV (${tvOffer?.mood})`);
  await A.click(`.offer button[data-act=haggle][data-id=${tvOffer.id}]`);
  await A.waitForFunction(([id, v]) => window.__bfb.shop().offers.find((o) => o.id === id)?.offer !== v, [tvOffer.id, tvOffer.offer], { timeout: 15000 }).catch(() => {});
  const tvNow = (await A.evaluate(() => window.__bfb.shop())).offers.find((o) => o.id === tvOffer.id);
  ok(tvNow && tvNow.offer !== tvOffer.offer, `haggled: $${tvOffer.offer} -> $${tvNow?.offer} (${tvNow?.mood}: "${tvNow?.line}")`);
  await sleep(200);
  await shot(A, "38-pawn-shop.png");
  const cashBefore = (await M()).scores[0].cash;
  const price = (await A.evaluate((id) => window.__bfb.shop().offers.find((o) => o.id === id).offer, tvOffer.id));
  await A.click(`.offer button[data-act=sell][data-id=${tvOffer.id}]`);
  ok(await A.waitForFunction(([c, v]) => window.__bfb.match().scores[0].cash === c + v, [cashBefore, price], { timeout: 15000 }).then(() => true, () => false), `SELL: +$${price} cash`);
  ok(await A.waitForFunction((id) => window.__bfb.shop().offers.find((o) => o.id === id)?.state === "sold", tvOffer.id, { timeout: 10000 }).then(() => true, () => false), "the TV shows as SOLD");
  await A.click("#btn-shop-done");
  ok(await waitPhase("upgrades", 15000), "DONE (everyone ready) skips to the upgrades round");
  ok(await A.waitForFunction(() => window.__bfb.overlay() === "upgrades" && window.__bfb.fortView(), null, { timeout: 10000 }).then(() => true, () => false), "upgrades screen over a view of your fort ('coming soon')");
  await sleep(1200);
  await shot(A, "39-upgrades.png");
  await A.click("#btn-upg-done");
  ok(await waitPhase("intro", 15000) && (await M()).round === 2, "READY -> cycle 2");
  ok(await A.waitForFunction(() => window.__bfb.overlay() === "" && !window.__bfb.fortView(), null, { timeout: 5000 }).then(() => true, () => false), "screens close for the next cycle");
  // fast-forward to the end of the match
  for (let k = 0; k < 40 && (await M()).phase !== "over"; k++) { await A.evaluate(() => window.__bfb.setTimeLeft(0.2)); await sleep(600); }
  ok((await M()).phase === "over", "after 3 cycles: match over");
  ok(/RICHEST BANDIT/.test(await A.textContent("#tally")), `final card: "${(await A.textContent("#tally-title"))}"`);
  await hide();
  await shot(A, "26-final-results.png");
  await A.keyboard.press("Enter");
  ok(await waitPhase("intro", 5000) && (await M()).round === 1 && (await M()).scores[0].cash === 0, "ENTER plays again (fresh match)");

  await A.evaluate(() => window.__bfb.testInput(false));
  await sleep(300);
  ok(await A.isVisible("#pause"), "releasing the mouse (ESC) opens the pause menu");
  await hideOverlays(A);
  await shot(A, "02-solo-arena.png");
  await A.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await shot(A, "07-pause-menu.png");
  await A.click("#btn-leave");
  await A.waitForFunction(() => window.__bfb.info().screen === "title");
  ok(true, "leave from solo returns to title");

  console.log("\n# Create room");
  await A.fill("#name-input", "Alice");
  await A.click("#btn-create");
  await A.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  i = await info(A);
  const code = i.roomCode;
  ok(/^[A-Z2-9]{5}$/.test(code), `room created with code ${code}`);
  ok((await A.url()).includes(`room=${code}`), "address bar shows shareable link");
  ok((await A.textContent("#lp-code")) === code, "lobby panel shows code");
  ok(await A.isVisible("#btn-start"), "host sees START MATCH");

  console.log("\n# Friends join by link");
  const B = await openPage("B", `?room=${code}&test=1`);
  ok(await B.isVisible("#invite-card"), "invite link shows 'join room' card");
  ok((await B.textContent("#invite-code")) === code, "invite card shows right code");
  await B.fill("#name-input", "Bob");
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  const C = await openPage("C", `?room=${code}&test=1`);
  await C.click("#btn-accept-invite");
  await C.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  await sleep(800);
  for (const p of [A, B, C]) {
    const x = await info(p);
    ok(Object.keys(x.players).length === 3 && x.remotes === 2, `${p.label}: sees 3 players (${x.remotes} others drawn)`);
  }
  ok(!(await B.isVisible("#btn-start")), "non-host does not see START MATCH");
  // Phase 4.6: A hosts the game in their browser; B and C are connected straight to A
  const hs = await A.evaluate(() => window.__bfb.hostStats());
  ok(hs && hs.peers === 2, `A is hosting in the browser with 2 players connected directly (${JSON.stringify(hs)})`);
  ok(/HOSTING/.test(await A.textContent("#mode-badge")), "host's badge says HOSTING");
  await sleep(1500);
  const hs2 = await A.evaluate(() => window.__bfb.hostStats());
  ok(hs2.upRate > 0 && hs2.upRate < 150000, `host upload is modest: ${(hs2.upRate / 1024).toFixed(1)} KB/s for 2 players`);
  ok(Object.values((await info(A)).players).some((p) => p.name === "Bob"), "invited player could set their name (Bob)");

  console.log("\n# Movement sync");
  await sleep(2000);
  const aStart = (await info(A)).pos;
  const s0 = (await info(A)).stats, t0 = Date.now();
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
  // walk for at least ~0.75 s of game time (the test machine may render very few frames per second)
  await A.waitForFunction((n) => window.__bfb.info().stats.moveSteps >= n, s0.moveSteps + 45, { timeout: 60000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setAxes(null));
  const s1 = (await info(A)).stats, t1 = Date.now();
  console.log(`   [diag] A sim steps ${s1.steps - s0.steps} in ${t1 - t0}ms wall; time lost to >250ms frame stalls: ${(s1.droppedMs - s0.droppedMs).toFixed(0)}ms; fps ${(await info(A)).fps}`);
  await sleep(700);
  // compare only once A has fully stopped (the weighty skid takes a moment), then give the
  // server + B a moment to receive A's last inputs
  await A.waitForFunction(() => { const m = window.__bfb.move(); return Math.hypot(m.vx, m.vz) === 0; }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  const aNow = (await info(A)).pos;
  const aSid = (await info(A)).sessionId;
  const bView = (await info(B)).players[aSid];
  // Wall-clock distance depends on this machine's CPU rendering speed, so instead check that
  // the distance matches the number of simulation steps actually run (5.2 m/s walking, minus ~0.1 s ramp-up).
  const steps = s1.moveSteps - s0.moveSteps, moved = aNow.z - aStart.z, expected = rampDist(steps / 60, 5.0);
  ok(moved > 0.3 && Math.abs(moved - expected) < 0.8, `A walked ${moved.toFixed(2)}m over ${steps} sim steps (expected ~${expected.toFixed(2)}m)`);
  ok(Math.abs(bView.z - aNow.z) < 0.05, `B's view of A matches A (diff ${Math.abs(bView.z - aNow.z).toFixed(3)}m)`);
  const aStats = (await info(A)).stats;
  ok(aStats.snaps === 0, `A's prediction never needed a hard snap (corrections: ${aStats.corrections})`);

  // Phase 1: other players see your crouch
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 0, crouch: true }));
  const aSid2 = (await info(A)).sessionId;
  const sawCrouch = await B.waitForFunction((id) => { const p = window.__bfb.info().remotePoses?.[id]; return p === "crouch" || p === "crouchWalk"; }, aSid2, { timeout: 15000 }).then(() => true, () => false);
  ok(sawCrouch, "B sees A crouching");

  // ---- Phase 2 loot online ----
  console.log("\n# Phase 2 loot (online)");
  await A.evaluate(() => window.__bfb.setAxes(null));
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(true));
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.clearNpcs(-16, -5, 14); });
  await sleep(800);
  await A.evaluate(() => { window.__bfb.spawnItem("crt_tv", -16, -6.4); window.__bfb.setPitch(Math.atan2(1.2, 1.6)); });
  const aLook = await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "crt_tv", null, { timeout: 15000 }).then(() => true, () => false);
  ok(aLook, "A looks at a TV spawned in the online room");
  await A.keyboard.press("e");
  const aId = (await info(A)).sessionId;
  const bSawHeld = await B.waitForFunction((id) => window.__bfb.items().some((x) => x.type === "crt_tv" && x.mode === "held" && x.holder === id), aId, { timeout: 15000 }).then(() => true, () => false);
  ok(bSawHeld, "B sees the TV in A's hands");
  await A.keyboard.press("g");
  ok(await A.waitForFunction(() => window.__bfb.serverInventory().hand === "", null, { timeout: 20000 }).then(() => true, () => false), "A drops the TV (hands empty before the race)");

  // Grab race: A and C both go for the same suitcase at the same moment
  await A.evaluate(() => window.__bfb.teleport(-16, -4.7, 0));
  await C.evaluate(() => window.__bfb.teleport(-14.3, -3, -Math.PI / 2));
  await sleep(1200);
  await A.evaluate(() => { window.__bfb.spawnItem("mystery_suitcase", -16, -3); window.__bfb.setPitch(0.45); });
  await C.evaluate(() => window.__bfb.setPitch(0.45));
  const bothLook = await Promise.all([A, C].map((P) => P.waitForFunction(() => window.__bfb.lookTarget()?.type === "mystery_suitcase", null, { timeout: 15000 }).then(() => true, () => false)));
  ok(bothLook.every(Boolean), "A and C are both looking at the suitcase");
  await Promise.all([A.keyboard.press("e"), C.keyboard.press("e")]);
  await sleep(2500);
  const hands = await Promise.all([A, C].map((P) => P.evaluate(() => window.__bfb.serverInventory().hand)));
  const raceItems = await A.evaluate(() => window.__bfb.items().filter((x) => Math.hypot(x.x + 16, x.z + 4) < 6).map((x) => `${x.id}:${x.type}:${x.mode}:${x.holder}`));
  console.log(`   [diag] race hands A=${hands[0]} C=${hands[1]} nearby=${JSON.stringify(raceItems)}`);
  const winners = hands.filter(Boolean).length;
  ok(winners === 1, `grab race: exactly one winner (A: ${hands[0] ? "got it" : "whiffed"}, C: ${hands[1] ? "got it" : "whiffed"})`);
  const loser = hands[0] ? C : A;
  ok(!(await loser.evaluate(() => window.__bfb.inventory().hand)), "the loser's hands are empty again (instant guess undone)");
  await (hands[0] ? A : C).keyboard.press("g");
  await sleep(500);

  // ---- Phase 5A: tug of war over a giant item ----
  console.log("\n# Tug of war (online)");
  await A.evaluate(() => { window.__bfb.teleport(-16, -4.7, 0); window.__bfb.clearNpcs(-16, -3, 10); });
  await C.evaluate(() => window.__bfb.teleport(-14.3, -2.9, -Math.PI / 2));
  await sleep(1000);
  await A.evaluate(() => window.__bfb.spawnItem("rubber_duck", -16, -2.9));
  const duck = await A.waitForFunction(() => window.__bfb.items().find((i) => i.type === "rubber_duck" && i.resting)?.id, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
  ok(!!duck, "a giant duck lands between A and C");
  await A.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck);
  ok(await A.waitForFunction((id) => window.__bfb.serverInventory().hand === id, duck, { timeout: 15000 }).then(() => true, () => false), "A drags the duck (alone)");
  await C.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck);
  ok(await C.waitForFunction(() => !!window.__bfb.tug() && !document.getElementById("tug").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false), "C grabs the other end: TUG OF WAR (mash meter)");
  ok(await A.waitForFunction(() => !!window.__bfb.tug(), null, { timeout: 15000 }).then(() => true, () => false), "A sees the tug of war too");
  // C mashes E (about 12 presses a second, right in the page so test lag doesn't slow it); A doesn't
  const mashing = C.evaluate(async () => { for (let k = 0; k < 40; k++) { window.__bfb.tugPress(); await new Promise((r) => setTimeout(r, 80)); } });
  await sleep(700);
  await hideOverlays(C);
  await shot(C, "40-tug-of-war.png");
  await mashing;
  ok(await C.waitForFunction((id) => window.__bfb.serverInventory().hand === id, duck, { timeout: 15000 }).then(() => true, () => false), "C mashed harder and won the duck");
  ok(await A.waitForFunction(() => window.__bfb.serverInventory().hand === "" && !window.__bfb.tug(), null, { timeout: 15000 }).then(() => true, () => false), "A lost their grip");
  await C.keyboard.press("g");
  await A.keyboard.press("g"); // (in case A kept it)
  await sleep(500);

  // ---- Phase 2.5 PvP punch online: A punches C = full knockdown, everyone sees it ----
  console.log("\n# Phase 2.5 punch (online)");
  ok((await A.evaluate(() => window.__bfb.npcs().length)) >= 24, "pedestrians + cashiers are synced to online players");
  const cSidP = (await info(C)).sessionId;
  await A.evaluate(() => window.__bfb.clearNpcs(-8, -7, 8));
  // park the mouse on the crosshair first: moving it there later would turn A's view (mouse look)
  await A.mouse.move(640, 360);
  await sleep(200);
  await A.evaluate(() => window.__bfb.teleport(-8, -8, 0));
  await C.evaluate(() => window.__bfb.teleport(-8, -6.8, Math.PI));
  await sleep(1500);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await A.mouse.click(640, 360);
  const cKnocked = await C.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: 15000 }).then(() => true, () => false);
  ok(cKnocked, "A's punch knocks C down");
  // (the daze effect only lasts as long as the knockdown, so check it straight away)
  ok(await C.evaluate(() => window.__bfb.fxHistory().includes("knocked")), "C gets the knocked-down screen effect");
  const bSeesDown = await B.waitForFunction((id) => window.__bfb.info().remotePoses?.[id] === "knocked", cSidP, { timeout: 15000 }).then(() => true, () => false);
  ok(bSeesDown, "B sees C lying on the ground");
  await sleep(300);
  await hideOverlays(C);
  await shot(C, "21-online-C-knocked.png");
  await sleep(700);
  await A.mouse.click(640, 360);
  await sleep(1500);
  ok(await C.evaluate(() => window.__bfb.move().immuneT > 0), "C is briefly immune after a knockdown (no spam-knocking)");
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(false));
  await sleep(300);

  // Face B toward A and screenshot
  const bPos = (await info(B)).pos;
  const yaw = Math.atan2(aNow.x - bPos.x, aNow.z - bPos.z);
  await B.evaluate((y) => window.__bfb.setYaw(y), yaw);
  await sleep(400);
  await hideOverlays(B);
  await shot(B, "03-online-B-sees-A-crouching.png");
  await A.evaluate(() => window.__bfb.setAxes(null));
  await hideOverlays(A);
  await shot(A, "04-online-A-lobby.png");

  console.log("\n# Phase 4 jail (online)");
  // busted online: the server replays your lock-pick presses and lets you out the back
  for (const P of [A, C]) await P.evaluate(() => { window.__bfb.testInput(true); window.__bfb.setAxes(null); });
  await C.evaluate(() => window.__bfb.bust());
  ok(await C.waitForFunction(() => window.__bfb.jail()?.open, null, { timeout: 20000 }).then(() => true, () => false), "online: busted -> jail screen");
  const aSeesC = await A.waitForFunction(() => Object.values(window.__bfb.info().players ?? {}).some((p) => p.x > 77 && p.x < 99 && p.z < -88 && p.z > -95), null, { timeout: 15000 }).then(() => true, () => false);
  ok(aSeesC, "others see you in the cell");
  await C.evaluate(() => window.__bfb.setJailTime(90));
  const brokeOnline = await C.evaluate(() => window.__bfb.lockAutoPlay());
  ok(brokeOnline && await C.waitForFunction(() => window.__bfb.jail()?.jailT === 0, null, { timeout: 90000 }).then(() => true, () => false), "online: the server accepted the lock-picking and let you out");
  const stC = await C.evaluate(() => window.__bfb.station());
  await C.waitForFunction((al) => { const m = window.__bfb.move(); return Math.hypot(m.x - al.x, m.z - al.z) < 3; }, stC.alley, { timeout: 5000 }).catch(() => {});
  const mC = await C.evaluate(() => window.__bfb.move());
  ok(Math.hypot(mC.x - stC.alley.x, mC.z - stC.alley.z) < 3, `online: out in the back alley (at ${mC.x.toFixed(1)}, ${mC.z.toFixed(1)}; history ${JSON.stringify((await C.evaluate(() => window.__bfb.jail()))?.history ?? [])})`);
  await C.evaluate(() => window.__bfb.clearCops());
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(false));

  console.log("\n# Connection drop + automatic reconnect");
  const cSid = (await info(C)).sessionId;
  await C.evaluate(() => window.__bfb.dropConnection());
  let sawOffline = false;
  for (let k = 0; k < 20 && !sawOffline; k++) { await sleep(150); sawOffline = (await info(A)).players[cSid]?.connected === false; }
  ok(sawOffline, "others see C as 'reconnecting' (seat held, not deleted)");
  let back = false;
  for (let k = 0; k < 60 && !back; k++) { await sleep(250); back = (await info(A)).players[cSid]?.connected === true; }
  ok(back, "C reconnected automatically to the same seat");
  ok((await info(C)).sessionId === cSid, "C kept same identity after reconnect");

  console.log("\n# Refresh the tab and rejoin");
  const bSid = (await info(B)).sessionId;
  await B.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await B.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 30000 });
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  await sleep(600);
  ok((await info(B)).sessionId === bSid, "refreshed player got their old seat back");
  ok(Object.keys((await info(A)).players).length === 3, "still 3 players after refresh (no ghost duplicate)");

  console.log("\n# Room full + bad code");
  const D = await openPage("D", `?room=${code}&test=1`);
  await D.click("#btn-accept-invite", { timeout: 120000 }); // 4 windows on one CPU: this page is slow
  await D.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 240000 });
  const E = await openPage("E", `?room=${code}&test=1`);
  await E.click("#btn-accept-invite", { timeout: 120000 });
  await E.waitForFunction(() => window.__bfb.info().screen === "title" && document.getElementById("title-status").textContent.length > 0, null, { timeout: 15000 });
  const fullMsg = await E.textContent("#title-status");
  ok(/full/i.test(fullMsg), `5th player gets friendly message: "${fullMsg}"`);
  await E.fill("#code-input", "ZZZZZ");
  await E.click("#btn-join");
  await E.waitForFunction(() => /exist/i.test(document.getElementById("title-status").textContent), null, { timeout: 15000 });
  ok(true, `bad code message: "${await E.textContent("#title-status")}"`);
  await shot(E, "05-room-full-message.png");
  await E.context().close();
  await D.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await D.click("#btn-leave");
  await sleep(300);

  console.log("\n# Host starts, then host leaves");
  await A.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await A.click("#btn-start");
  const started = await B.waitForFunction(() => window.__bfb.info().phase === "intro", null, { timeout: 15000 }).then(() => true, () => false);
  ok(started, "host START reaches everyone (round 1 intro)");
  // (4 windows share one CPU here, so a busy window can lag a moment: compare once both are in the round)
  await Promise.all([A, B].map((P) => P.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 }).catch(() => {})));
  const [ta, tb] = await Promise.all([A, B].map((P) => P.evaluate(() => window.__bfb.match().timeLeft)));
  ok(Math.abs(ta - tb) < 4, `everyone sees the same round timer (${ta.toFixed(1)} vs ${tb.toFixed(1)})`);

  // ---- Phase 5A: night raid ----
  console.log("\n# Night raid (online)");
  await A.evaluate(() => window.__bfb.noEvents());
  const aHome = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  const tvAt = { x: aHome.x + Math.sin(aHome.yaw) * 2, z: aHome.z + Math.cos(aHome.yaw) * 2 };
  await A.evaluate(([x, z]) => window.__bfb.spawnItem("crt_tv", x, z), [tvAt.x, tvAt.z]);
  const tvId = await A.waitForFunction(() => window.__bfb.items().find((i) => i.type === "crt_tv" && i.lock === 100)?.id, null, { timeout: 40000 }).then((h) => h.jsonValue(), () => null);
  ok(!!tvId, "A banks a TV in their fort");
  await A.evaluate(() => window.__bfb.setTimeLeft(0.3));
  ok(await B.waitForFunction(() => window.__bfb.match().phase === "night", null, { timeout: 40000 }).then(() => true, () => false), "night falls for everyone");
  ok(await B.waitForFunction(() => window.__bfb.night().level > 0.5, null, { timeout: 20000 }).then(() => true, () => false), "B's city goes dark too");
  const tvNow2 = await B.evaluate((id) => window.__bfb.items().find((i) => i.id === id), tvId);
  // stand between the TV and the city centre (away from the fort box), facing the TV
  const dl = Math.hypot(tvNow2.x, tvNow2.z), bx = tvNow2.x - (tvNow2.x / dl) * 1.3, bz = tvNow2.z - (tvNow2.z / dl) * 1.3;
  await B.evaluate(([x, z, y]) => window.__bfb.teleport(x, z, y), [bx, bz, Math.atan2(tvNow2.x - bx, tvNow2.z - bz)]);
  await sleep(1500);
  let raided = false;
  for (let k = 0; k < 3 && !raided; k++) {
    await B.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), tvId);
    raided = await B.waitForFunction((id) => window.__bfb.serverInventory().hand === id, tvId, { timeout: 8000 }).then(() => true, () => false);
  }
  if (!raided) console.log(`   [diag] raid: B at ${JSON.stringify(await B.evaluate(() => window.__bfb.move()))} tv ${JSON.stringify(await B.evaluate((id) => window.__bfb.items().find((i) => i.id === id), tvId))} flash "${await B.textContent("#flash")}" phase ${(await B.evaluate(() => window.__bfb.match())).phase}`);
  ok(raided, "B raids A's fort at night and takes the TV");
  ok(await A.waitForFunction(() => /RAIDED/.test(document.getElementById("bb-title").textContent), null, { timeout: 15000 }).then(() => true, () => false), "A's raid alarm goes off");
  await A.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await A.click("#btn-leave");
  await sleep(600);
  ok((await info(A)).screen === "title", "host returned to title");
  // Phase 4.6: the game ran in the host's browser, so everyone else is told the host ended it
  const bBack = await B.waitForFunction(() => window.__bfb.info().screen === "title", null, { timeout: 15000 }).then(() => true, () => false);
  const bMsg = await B.textContent("#title-status");
  ok(bBack && /host ended/i.test(bMsg), `players get a clear message when the host leaves: "${bMsg}"`);
  // and the room code is gone: nobody can join a game that no longer exists
  await B.fill("#code-input", code);
  await B.click("#btn-join");
  await B.waitForFunction(() => /exist/i.test(document.getElementById("title-status").textContent), null, { timeout: 30000 }).catch(() => {});
  ok(/exist/i.test(await B.textContent("#title-status")), "the closed room's code no longer works");

  console.log("\n# Console errors");
  for (const p of [A, B, C, D]) {
    // (B deliberately tried the closed room's code: the matchmaker answers "not found" = HTTP 522)
    const errs = p.errors.filter((e) => !/favicon|fonts\.g/.test(e) && !(p === B && /status of 522/.test(e)));
    ok(errs.length === 0, `${p.label}: no JS errors${errs.length ? " -> " + errs.slice(0, 3).join(" | ") : ""}`);
  }
} catch (e) {
  ok(false, "test crashed: " + (e?.stack ?? e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
}
