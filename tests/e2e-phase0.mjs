// Phase 0 end-to-end test: real headless Chrome windows, real server, real rendering.
// Usage: start server (port 2567) + client (vite preview on 4173), then: node tests/e2e-phase0.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.CLIENT_URL ?? "http://localhost:4173";
// 5A.1: browser-hosted games get their lag from the pages themselves (each side delays what it sends by half)
const LAG = Number(process.env.LATENCY) || 0;
const OUT = process.env.OUT_DIR ?? "test-output";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (cond, msg) => { results.push({ ok: !!cond, msg }); console.log(cond ? "  ok  " : " FAIL ", msg); };
// Distance covered from standstill with the Phase 1 acceleration (20 m/s^2) up to top speed vmax
const rampDist = (t, vmax, a = 48) => { const tr = vmax / a; return t < tr ? 0.5 * a * t * t : 0.5 * a * tr * tr + vmax * (t - tr); }; // (D1: groundAccel 48)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// (R12.2b: on a box whose preinstalled Chromium is newer than this Playwright's own, use that one)
const CHROME = process.env.PW_CHROME || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

async function openPage(name, query = "?test=1") {
  // (Slice 2A: the city is heavier to draw on the CPU; friends' windows render at a smaller size so 4 windows fit on the test box)
  const ctx = await browser.newContext({ viewport: name === "A" ? { width: 1280, height: 720 } : { width: 800, height: 450 } });
  // (C3: friends' windows run in Performance mode: with C2's detailed façades, 4 CPU-rendered cities starve
  //  the test box's one software GPU. The host window A keeps full detail.)
  if (name !== "A") await ctx.addInitScript(() => { try { const k = "bfb.settings.v1"; const s = JSON.parse(localStorage.getItem(k) || "{}"); s.lowGraphics = true; localStorage.setItem(k, JSON.stringify(s)); } catch {} });
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
  // (R3: these checks were written for the classic city and its landmarks; E2E_MAP=new runs them on the new one)
  await page.goto(BASE + "/" + query + (LAG ? `&lag=${LAG}` : "") + "&seathold=900&map=" + (process.env.E2E_MAP ?? "classic"), { waitUntil: "domcontentloaded", timeout: 480000 }); // (C5c: 480 s: the 5th window opens while 4 are drawing the city on this CPU)
  await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 480000 });
  page.label = name;
  return page;
}
const info = (p) => p.evaluate(() => window.__bfb.info());
const hideOverlays = (p) => p.evaluate(() => { document.getElementById("pause").classList.add("hidden"); });
const shot = async (p, file) => { await p.screenshot({ path: `${OUT}/${file}`, timeout: 120000 }); }; // (C5c: the CPU-only test box can take a while to draw a frame)

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
  await A.click("#btn-solo", { timeout: 180000 }); // (R4.1: on this test box the first click after closing Settings has taken 32 s)
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
  // ---- C5a: you wake up in the squat (the lobby's rooftop camp) ----
  console.log("\n# C5a the squat (solo lobby)");
  {
    const lob = await A.waitForFunction(() => { const l = window.__bfb.lobby(); return l.onRoof ? l : false; }, null, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
    ok(!!lob && lob.phase === "lobby", `before the match you start on the squat's roof, 26 m up (${JSON.stringify(lob)})`);
    ok(await A.waitForFunction(() => window.__bfb.lobby().hud, null, { timeout: 20000 }).then(() => true, () => false), "the squat's panel is up (practise, race, throw)");
    const unc = await A.evaluate(() => window.__bfb.lobbyNpc());
    ok(unc && unc.y > 25, `Uncle Dumpster is up there too (${JSON.stringify(unc)})`);
    await A.evaluate(() => { const m = window.__bfb.move(); window.__bfb.camAt(m.x, 27.7, m.z, 0, 0.12); });
    await sleep(2500); await A.evaluate(() => document.getElementById("pause").classList.add("hidden"));
    await shot(A, "60-squat-view.png");
    await A.evaluate(() => window.__bfb.camAt(0, 29.5, -121.2, Math.PI, 0.35));
    await sleep(2500);
    await shot(A, "61-squat-camp.png");
    await A.evaluate(() => window.__bfb.camFree());
    // the M map
    await A.keyboard.press("m");
    ok(await A.waitForFunction(() => window.__bfb.mapOpen(), null, { timeout: 10000 }).then(() => true, () => false), "M opens the city map");
    await sleep(600);
    await shot(A, "62-city-map.png");
    await A.keyboard.press("m");
    ok(await A.waitForFunction(() => !window.__bfb.mapOpen(), null, { timeout: 10000 }).then(() => true, () => false), "M closes it again");
    // the THROW-O-MATIC: look at it, E, a 30 s game starts
    const tg = await A.evaluate(() => window.__bfb.propDefs().find((d) => d.kind === "throwgame"));
    await A.evaluate((d) => { window.__bfb.teleport(d.x - 1.3, d.z, Math.PI / 2); window.__bfb.setYaw(Math.PI / 2); window.__bfb.setPitch(0.25); }, tg);
    await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "throwgame", null, { timeout: 30000 }).catch(() => {});
    await A.keyboard.press("e");
    ok(await A.waitForFunction(() => window.__bfb.lobby().lg.startsWith("throw"), null, { timeout: 30000 }).then(() => true, () => false), `E on the THROW-O-MATIC starts a game (${JSON.stringify(await A.evaluate(() => window.__bfb.lobby()))})`);
    await A.evaluate(() => window.__bfb.setPitch(0));
  }
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), (await A.evaluate(() => window.__bfb.landmarks())).runway);
  await sleep(1500);
  i = await info(A);
  const start = i.pos, st0 = i.stats.moveSteps;
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1, sprint: true }));
  // (wait for ~0.7 s of game time rather than wall time: the first seconds can be slow on the test machine)
  await A.waitForFunction((n) => window.__bfb.info().stats.moveSteps >= n, st0 + 40, { timeout: 90000, polling: 250 }).catch(() => {});
  i = await info(A);
  await A.evaluate(() => window.__bfb.setAxes(null));
  const soloSteps = i.stats.moveSteps - st0, soloMoved = i.pos.z - start.z, soloExp = rampDist(soloSteps / 60, 9.4);
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
  const T0 = LM0.testYard; // (C1: the build yard is the tests' open ground; offsets below are from the old plaza)
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM0.runway);
  await axes(null); await sleep(600); await hide();
  await shot(A, "10-hands-idle.png");

  // Sprint -> stamina drains, HUD bar shows
  await axes({ mx: 0, mz: 1, sprint: true });
  ok(await waitMove("m.stamina < 0.8"), "sprinting drains stamina");
  ok(await A.evaluate(() => parseFloat(document.getElementById("stamina-fill").style.width) < 100), "5A.1: the stamina bar (bottom-left) drains");
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
  const spawnAhead = async (type, x0 = -16, z0 = -8) => {
    const x = T0.x + x0, z = T0.z + z0;
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
  const why = inv2.hand ? "" : ` | look=${JSON.stringify(await A.evaluate(() => window.__bfb.lookTarget()))} flash="${await A.evaluate(() => document.getElementById("flash")?.textContent ?? "")}" items near=${JSON.stringify(await A.evaluate(() => window.__bfb.items().filter((i) => Math.hypot(i.x - window.__bfb.T.x + 13, i.z - window.__bfb.T.z + 6.4) < 3).map((i) => i.type + ":" + i.mode)))}`;
  ok(inv2.pockets.every((x) => x) && inv2.hand, `3 pockets filled + 4th chicken in hands (${JSON.stringify(inv2.pockets.map(Boolean))}, hand=${!!inv2.hand})${why}`);
  ok(/Chicken/.test(await A.textContent("#slot-0")), "pocket HUD shows what you carry");
  await A.mouse.click(640, 360, { button: "right" });
  await sleep(500);
  ok((await inv()).sel === 3, "5A.1: right click no longer cycles (reserved)");
  await A.mouse.wheel(0, 120);
  await sleep(500);
  ok((await inv()).sel === 3 && /Hands full/.test(await A.textContent("#flash")), "5A.1: can't cycle while something is in your hands");

  // throw from hands: hold left mouse ~1 s, release
  const thrownId = inv2.hand;
  await A.evaluate(() => window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (0), 16));
  await A.evaluate(() => window.__bfb.setPitch(-0.25));
  await A.mouse.down();
  await sleep(1000);
  ok(await A.waitForSelector("#charge:not(.hidden)", { timeout: 8000 }).then(() => true, () => false), "charge ring shows while winding up");
  await A.mouse.up();
  ok(await waitInv("v.hand === ''", 5000), "releasing throws the item");
  const landed = await A.waitForFunction((id) => { const it = window.__bfb.items().find((x) => x.id === id); return it && it.mode === "free" && it.resting ? it : null; }, thrownId, { timeout: 20000 }).then((h) => h.jsonValue(), () => null);
  const me = await mv();
  ok(landed && Math.hypot(landed.x - me.x, landed.z - me.z) > 5, `thrown chicken landed ${landed ? Math.hypot(landed.x - me.x, landed.z - me.z).toFixed(1) : "?"} m away`);
  // 5A.1 wheel + keys choose what's in your hands
  await A.mouse.wheel(0, 120);
  ok(await waitInv("v.sel === 0", 5000), "5A.1: mouse wheel selects pocket 1");
  ok(await A.waitForFunction(() => document.getElementById("slot-0").classList.contains("sel"), null, { timeout: 5000 }).then(() => true, () => false), "HUD highlights the selected pocket");
  await A.keyboard.press("3");
  ok(await waitInv("v.sel === 2", 5000), "5A.1: key 3 selects pocket 3");
  await A.keyboard.press("4");
  ok(await waitInv("v.sel === 3", 15000) && await A.waitForFunction(() => document.getElementById("slot-fists").classList.contains("sel"), null, { timeout: 15000 }).then(() => true, () => false), "5A.1: key 4 = fists (HUD shows FISTS)");
  await A.keyboard.press("1");
  await waitInv("v.sel === 0", 15000); // (C5c.3: 15 s: once on this slow box the key landed after the click, so it punched)
  const pocketId = (await inv()).pockets[0];
  await A.mouse.down(); await sleep(700); await A.mouse.up();
  ok(await waitInv(`v.pockets[0] === ""`, 15000), "5A.1: left click throws the pocket item you have out");
  ok(await waitInv("v.sel === 3", 5000), "and you're back to fists");
  void pocketId;
  await A.evaluate(() => window.__bfb.setPitch(0.1));
  await sleep(500); await hide();
  await shot(A, "41-hands-hud.png");
  ok(await A.evaluate(() => !window.__bfb.scene().meshes.some((m) => m.name === "patch") && window.__bfb.scene().meshes.some((m) => m.name === "wrapK")), "5A.1: no gold sleeve patch; tape wraps present");
  ok(await A.evaluate(() => { const r = document.getElementById("vitals").getBoundingClientRect(); return r.left < 60 && r.bottom > innerHeight - 60 && !!document.getElementById("crosshair") && document.getElementById("dodge-pip").closest("#vitals"); }), "5A.1: health + stamina bottom-left, Q chip beside stamina, crosshair kept");
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
  const nCash = await A.evaluate(() => window.__bfb.npcs().filter((n) => n.kind === "cashier").length);
  ok(nCash === 15, `a cashier in each of the 15 shops (the laundromat has the old lady instead; C5c.3: Sal at PAWN-O-RAMA) (${nCash})`);
  ok(new Set(npcs0.map((n) => n.kind)).size >= 5, `mix of types: ${[...new Set(npcs0.map((n) => n.kind))].join(", ")}`); // (C1.1: 5+ of the 8 kinds: 20 random people can miss one or two by chance)
  // 2.5 s of GAME time (this headless machine sometimes runs the solo world far slower than real time)
  const walkSteps0 = (await info(A)).stats.steps;
  await A.waitForFunction((n) => window.__bfb.info().stats.steps >= n, walkSteps0 + 150, { timeout: 60000 }).catch(() => {});
  const npcs1 = await A.evaluate((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)), CROWD);
  const walked = npcs1.filter((n) => { const o = npcs0.find((x) => x.id === n.id); return o && Math.hypot(n.x - o.x, n.z - o.z) > 0.5; }).length;
  ok(walked >= 12, `${walked}/20 pedestrians walked around in 2.5 s of game time`);
  await A.evaluate(() => { const l = window.__bfb.landmarks().parkCentre; window.__bfb.teleport(l.x, l.z, 0); }); // (C1: the park, where the crowd is)
  await sleep(600);
  await A.waitForFunction(() => window.__bfb.npcStats()?.visible > 0, null, { timeout: 20000 }).catch(() => {});
  const ns = await A.evaluate(() => window.__bfb.npcStats());
  ok(ns.total >= 24 && ns.visible < ns.total && ns.visible > 0, `${ns.total} people exist; ones beyond 60 m are culled (${ns.visible} drawn from here)`);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.filter((m) => m.name === "beam").length === 0), "no sky beams any more");
  // (away from the loot left lying around by the tests above, so nothing else is under the crosshair)
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-8), 0); });
  await sleep(400);
  await A.evaluate(() => { window.__bfb.spawnItem("golden_spork", window.__bfb.T.x + (-7.2), window.__bfb.T.z + (-5.5)); window.__bfb.setPitch(0.3); });
  await sleep(1500);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.some((m) => m.name === "sparkle" && m.isEnabled())), "rare loot twinkles with a sparkle");

  // punch a tourist placed right in front of us
  await A.evaluate(() => window.__bfb.clearItems(window.__bfb.T.x - 8, window.__bfb.T.z - 7, 6)); // (C5c.2: a stray giant rubber duck here once took the crosshair)
  const tId = await A.evaluate(() => window.__bfb.placeNpc("tourist", window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.7), Math.PI));
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const sawTarget = await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "tourist", null, { timeout: 10000 }).then(() => true, () => false);
  ok(sawTarget, "facing a tourist with empty hands = punch target");
  ok(/Bonk/.test(await A.textContent("#prompt")) && /Tourist/.test(await A.textContent("#prompt")), `prompt: "${(await A.textContent("#prompt")).slice(0, 50)}"`);
  const itemsBefore = new Set((await A.evaluate(() => window.__bfb.items())).map((x) => x.id));
  await A.mouse.click(640, 360);
  const hitState = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return n && n.robbed ? n.state : null; }, tId, { timeout: 30000 }).then((h) => h.jsonValue(), () => null);
  ok(hitState, `left click punched the tourist (now "${hitState}")`);
  await sleep(250);
  await hide();
  await shot(A, "18-bonk-tourist.png");
  const dropped = (await A.evaluate(() => window.__bfb.items())).filter((x) => !itemsBefore.has(x.id) && Math.hypot(x.x - T0.x + 8, x.z - T0.z + 6.7) < 5);
  ok(dropped.length >= 1, `the tourist dropped loot: ${dropped.map((x) => x.type).join(", ")}`);
  ok((await A.evaluate(() => window.__bfb.heat())) > 0, `punching raises your heat (${await A.evaluate(() => window.__bfb.heat())})`);
  ok(await A.isVisible("#heat"), "heat meter appears on the HUD");
  await sleep(1500);
  await shot(A, "19-tourist-flees.png");

  // a gym bro fights back: stand still and lose the slap fight (2 hits = knocked down)
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (5), 0); });
  await sleep(500);
  await A.evaluate(() => window.__bfb.clearItems(window.__bfb.T.x - 16, window.__bfb.T.z + 6.5, 5)); // (D1: nothing else lying here to take the crosshair)
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", window.__bfb.T.x + (-16), window.__bfb.T.z + (6.4)); window.__bfb.setPitch(Math.atan2(1.35, 1.4)); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "chicken in pocket before the fight");
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const gId = await A.evaluate(() => window.__bfb.placeNpc("gym_bro", window.__bfb.T.x + (-16), window.__bfb.T.z + (6.6), Math.PI));
  await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "gym_bro", null, { timeout: 10000 }).catch(() => {});
  ok(/FIGHTS BACK/.test(await A.textContent("#prompt")), "prompt warns that the gym bro fights back");
  await A.mouse.click(640, 360);
  const fought = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return (n && ["chase", "windup", "punch", "gloat"].includes(n.state)) || window.__bfb.info().hud?.pose === "knocked"; }, gId, { timeout: 10000 }) /* (R3: at 110 ms lag he can be on you between two polls) */.then(() => true, () => false);
  ok(fought, "the gym bro comes at you");
  const knocked = await A.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: 75000 }).then(() => true, () => false); // (C5a: 75 s: the game clock crawls on this CPU-only box)
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
  ok(cars0.length === 22, `${cars0.length} cars on the roads`); // (C1: 22 on the new road network)
  // (C5a: wait for a couple of seconds of GAME time, not wall time: the game clock crawls on this box)
  const moving = await A.waitForFunction((c0) => window.__bfb.cars().filter((c, i) => Math.hypot(c.x - c0[i].x, c.z - c0[i].z) > 1).length >= 12, cars0, { timeout: 30000 }).then(() => true, () => false);
  ok(moving, "traffic is moving");
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
  // get hit by a car (D1): launched through the air, land flat, 10 s stunned where you land, then up again
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.landmarks().noShops.x, window.__bfb.landmarks().noShops.z, 0); }); // (out in the open: a hit indoors just bonks you off the ceiling)
  await sleep(1500);
  const hitAt = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z }; });
  await A.evaluate(() => window.__bfb.wipeout());
  // (watch your own view: it catches up with the host's launch a frame or two later)
  const peak = await A.waitForFunction(() => { const m = window.__bfb.move(); return m.y > 0.8 ? m.y : false; }, null, { timeout: 60000, polling: 50 }).then((h) => h.jsonValue(), () => 0);
  ok(peak > 0.8, `SPLAT: launched into the air (${Number(peak).toFixed(1)} m up)`);
  ok(await A.waitForFunction(() => !document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 10000 }).then(() => true, () => false), "a stun ring counts down the seconds");
  ok((await A.evaluate(() => window.__bfb.move().knockT)) > 0, "lying flat, stunned");
  await sleep(500); await hide();
  await shot(A, "32-wiped-out.png");
  ok(await A.waitForFunction(() => window.__bfb.respawnT() === 0 && document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 300000 }).then(() => true, () => false), "up again after 10 s"); // (10 s of GAME time: slow on the test box)
  await A.waitForFunction(() => window.__bfb.move().knockT === 0, null, { timeout: 30000 }).catch(() => {}); // (your own view catches up a frame later)
  const upAt = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z, k: m.knockT }; });
  const flew = Math.hypot(upAt.x - hitAt.x, upAt.z - hitAt.z);
  ok(flew > 0.5 && flew < 25 && upAt.k === 0, `you get up where you landed (${flew.toFixed(1)} m from where you were hit), able to move`);
  ok(await A.evaluate(() => !!document.querySelector('[data-setting="lowGraphics"]')), "performance mode setting exists");

  // ---- City Redesign C1: the new layout, traffic lights, the raid alert ----
  console.log("\n# C1 city layout (solo)");
  const lights0 = await A.evaluate(() => window.__bfb.lights());
  ok(lights0.length >= 8 && lights0.every((x) => ["red", "amber", "green"].includes(x)), `${lights0.length} traffic lights at the two Mile crossings`);
  let lightsChanged = false;
  for (let i = 0; i < 40 && !lightsChanged; i++) { await sleep(500); lightsChanged = JSON.stringify(await A.evaluate(() => window.__bfb.lights())) !== JSON.stringify(lights0); }
  ok(lightsChanged, "the lights change");
  const carsA = await A.evaluate(() => window.__bfb.cars());
  // (C5b: wait on the game clock, not the wall clock: it crawls on this CPU-only box)
  const drove = await A.waitForFunction((c0) => window.__bfb.cars().filter((c, i) => c0[i] && Math.hypot(c.x - c0[i].x, c.z - c0[i].z) > 1).length >= c0.length / 3, carsA, { timeout: 30000 }).then(() => true, () => false);
  ok(carsA.length >= 20 && drove, `${carsA.length} cars drive the new roads`);
  // Tent Town, the highway, the compounds (screenshot), and the loud raid alert
  await A.evaluate(() => window.__bfb.camAt(0, 5.5, -89, Math.PI, 0.12));
  await sleep(1200); await hide();
  await shot(A, "50-tent-town.png");
  await A.evaluate(() => window.__bfb.camFree());
  await A.evaluate(() => { const l = window.__bfb.landmarks().parkCentre; window.__bfb.teleport(l.x, l.z - 14, 0); window.__bfb.setPitch(-0.1); });
  await sleep(1200); await hide();
  await shot(A, "51-park-roundabout.png");
  await A.evaluate(() => window.__bfb.fakeRaid());
  await sleep(1500);
  ok(await A.waitForFunction(() => window.__bfb.raidAlert() && Number(getComputedStyle(document.getElementById("raidEdge")).opacity) > 0.3 && getComputedStyle(document.getElementById("raidArrow")).display === "block", null, { timeout: 45000 }).then(() => true, () => false), "raid alert: red screen edge + arrow home"); // (C5c.2: 45 s below: on this box the first frames after the alert can take a while)
  ok(/RAIDING YOUR FORT/.test(await A.textContent("#bb-title")), `raid banner names the raider: "${await A.textContent("#bb-title")}"`);
  await hide();
  await shot(A, "52-raid-alert.png");
  await A.waitForFunction(() => !window.__bfb.raidAlert(), null, { timeout: 60000 }).catch(() => {});

  // ---- C1.1: the deep canal, the doorman ----
  console.log("\n# C1.1 canal + doorman (solo)");
  await A.evaluate(() => { window.__bfb.teleport(106, 15, 0); window.__bfb.setPitch(0); });
  await sleep(1500);
  ok(await A.waitForFunction(() => window.__bfb.scene().activeCamera.position.y < 1.0, null, { timeout: 15000 }).then(() => true, () => false), `in the canal your eyes are just above the water (camera ${(await A.evaluate(() => window.__bfb.scene().activeCamera.position.y)).toFixed(2)} m)`);
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
  const swim = await A.waitForFunction(() => { const m = window.__bfb.move(); const v = Math.hypot(m.vx, m.vz); return v > 0.5 ? v : false; }, null, { timeout: 20000 }).then((h) => h.jsonValue(), () => 0);
  await A.evaluate(() => window.__bfb.setAxes(null));
  ok(swim > 0.5 && swim < 2.5, `paddling speed ${Number(swim).toFixed(1)} m/s (walking is 5)`);
  await hide();
  await shot(A, "53-in-the-canal.png");
  ok(await A.evaluate(() => window.__bfb.npcs().some((n) => n.kind === "doorman")), "the doorman is at the apartment tower");

  // ---- C2: building façades (looks only) ----
  console.log("\n# C2 façades (solo)");
  const fac = await A.evaluate(() => window.__bfb.facades());
  ok(fac.detail === true && fac.pieces > 2000, `façade detail is on in normal mode (${fac.pieces} pieces: sills, awnings, fire escapes...)`);
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.teleport(-28, -51.5, Math.PI / 2 + 0.25); window.__bfb.setPitch(-0.05); });
  await sleep(2500); await hide();
  await shot(A, "54-c2-shop-street.png");

  // ---- C3: the park (pigeons scatter, the fisherman, the pond) ----
  console.log("\n# C3 park (solo)");
  const pg0 = await A.evaluate(() => window.__bfb.pigeons());
  ok(pg0.count >= 8, `${pg0.count} pigeons round the fountain`);
  ok(await A.evaluate(() => window.__bfb.npcs().some((n) => n.kind === "fisherman")), "the fisherman is at the pond");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.teleport(0, -13, 0); window.__bfb.setPitch(0.1); window.__bfb.clearNpcs(0, 0, 20); });
  await sleep(1500);
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1, sprint: true }));
  const scattered = await A.waitForFunction((n) => window.__bfb.pigeons().scatters > n, pg0.scatters, { timeout: 30000 }).then(() => true, () => false);
  await A.evaluate(() => window.__bfb.setAxes(null));
  ok(scattered, `running at the pigeons scatters them (${(await A.evaluate(() => window.__bfb.pigeons())).flying} flying)`);
  await A.evaluate(() => { window.__bfb.teleport(-2, -9, 0.7); window.__bfb.setPitch(-0.05); });
  await sleep(2000); await hide();
  await shot(A, "55-c3-park.png");

  // ---- C4a: mess (junk to throw, things to smash) ----
  console.log("\n# C4a mess (solo)");
  const junk = await A.evaluate(() => window.__bfb.items().filter((i) => ["cafe_chair", "bin_lid", "glass_bottle", "brick", "plastic_crate", "oil_barrel", "shopping_trolley", "smelly_fish", "traffic_barrier"].includes(i.type)).length);
  ok(junk >= 30, `${junk} bits of street junk lying about`);
  const benchS = await A.evaluate(() => { const ds = window.__bfb.propDefs().filter((d) => d.kind === "bench"); return ds[ds.length - 1]; });
  await A.evaluate((b) => { window.__bfb.clearCops(); const x = b.x + (b.hw > b.hd ? 0 : b.hw + 0.8), z = b.z + (b.hw > b.hd ? b.hd + 0.8 : 0); window.__bfb.teleport(x, z, Math.atan2(b.x - x, b.z - z)); }, benchS);
  await sleep(800);
  // (punch until it breaks: the game clock runs slowly on this CPU-only box, so the punch cooldown takes a while)
  let soloPunches = 0, soloBroke = false;
  for (; soloPunches < 10 && !soloBroke; soloPunches++) {
    await A.evaluate((b) => { const m = window.__bfb.move(); window.__bfb.shopAct({ a: "punch", yaw: Math.atan2(b.x - m.x, b.z - m.z), pitch: 0 }); }, benchS);
    soloBroke = await A.waitForFunction((id) => window.__bfb.props().some((p) => p.id === id && !p.ready), benchS.id, { timeout: 2500 }).then(() => true, () => false);
  }
  ok(soloBroke, `punching smashes a bench (${soloPunches} punches sent; it takes 2 landed hits)`);
  ok(await A.evaluate((b) => window.__bfb.smashed() >= 1 && window.__bfb.blockedAt(b.x, b.z) === false, benchS), "the smashed bench vanishes and stops blocking");
  await hide();
  await shot(A, "56-c4a-smashed.png");

  // ---- C4b: tagging in THE PIT, the old lady ----
  console.log("\n# C4b tag + old lady (solo)");
  const pw = LM.pitWall;
  const cansLying = await A.evaluate(() => window.__bfb.items().filter((i) => i.type === "spray_can").length);
  ok(cansLying >= 6, `${cansLying} spray cans lying about (the skate park, alleys, the arches)`);
  await A.evaluate((l) => { window.__bfb.clearCops(); window.__bfb.setHeat(0); window.__bfb.teleport(l.x - 1.5, l.z, 0); window.__bfb.clearNpcs(l.x, l.z, 25); window.__bfb.setPitch(0); window.__bfb.setYaw(0); }, pw);
  await sleep(800);
  const aura0 = await A.evaluate(() => window.__bfb.aura());
  // a fresh can at your feet: look down, grab it (E), look back up at the wall
  await A.evaluate((l) => window.__bfb.spawnItem("spray_can", l.x - 1.5, l.z - 0.9), pw);
  await A.evaluate(() => { window.__bfb.setYaw(Math.PI); window.__bfb.setPitch(1.1); });
  ok(await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "spray_can", null, { timeout: 15000 }).then(() => true, () => false), "looking at the spray can");
  await A.keyboard.press("e");
  const gotCan = await A.waitForFunction(() => window.__bfb.canUses() > 0 || window.__bfb.serverInventory()?.pockets.some(Boolean), null, { timeout: 15000 }).then(() => true, () => false);
  // (small things go in a pocket: select it)
  if (!(await A.evaluate(() => window.__bfb.canUses() > 0))) { const inv = await A.evaluate(() => window.__bfb.serverInventory()); const slot = inv.pockets.findIndex(Boolean); if (slot >= 0) await A.keyboard.press(String(slot + 1)); }
  await A.evaluate(() => { window.__bfb.setYaw(0); window.__bfb.setPitch(0); });
  ok(gotCan && await A.waitForFunction(() => window.__bfb.canUses() === 5, null, { timeout: 10000 }).then(() => true, () => false), `picked up a spray can and got it out (5 tags) (uses ${await A.evaluate(() => window.__bfb.canUses())})`);
  ok(await A.waitForFunction(() => window.__bfb.tagAim(), null, { timeout: 10000 }).then(() => true, () => false), "aiming at THE PIT's wall: a spot you can tag");
  await A.keyboard.down("e");
  const tagged = await A.waitForFunction((a0) => window.__bfb.aura() > a0 && window.__bfb.tags().length >= 1, aura0, { timeout: 30000 }).then(() => true, () => false);
  await A.keyboard.up("e");
  ok(tagged, `hold E 1.5 s on the wall: a tag, +1 aura (${await A.evaluate(() => window.__bfb.aura())})`);
  ok(await A.waitForFunction(() => window.__bfb.canUses() === 4, null, { timeout: 15000 }).then(() => true, () => false), `4 left in the can (${await A.evaluate(() => window.__bfb.canUses())})`);
  await A.evaluate((l) => window.__bfb.camAt(l.x + 1.5, 1.7, l.z - 2.5, -0.35, 0.05), pw); await sleep(800); await hide();
  await shot(A, "57-c4b-tag.png");
  await A.evaluate(() => window.__bfb.camFree());
  // the old lady: a noise under her window wakes her: she yells (heat) and comes down with her cane
  const lady = await A.evaluate(() => window.__bfb.npcs().find((n) => n.kind === "old_lady"));
  ok(lady && lady.state === "sleep", `the old lady is asleep upstairs (${lady?.state})`);
  await A.evaluate((n) => { window.__bfb.setHeat(0); window.__bfb.teleport(n.x, n.z - 7, 0); window.__bfb.noise(n.x, n.z - 6, 10); }, lady);
  ok(await A.waitForFunction(() => ["yell", "chase"].includes(window.__bfb.npcs().find((n) => n.kind === "old_lady")?.state), null, { timeout: 10000 }).then(() => true, () => false), "a bang outside: she's awake and yelling");
  ok((await A.evaluate(() => window.__bfb.heat())) >= 12, "she called the cops (heat)");
  ok(await A.waitForFunction(() => window.__bfb.npcs().find((n) => n.kind === "old_lady")?.state === "chase", null, { timeout: 60000 }).then(() => true, () => false), "then she comes after you with her cane");
  await A.evaluate(() => { window.__bfb.setHeat(0); window.__bfb.clearCops(); });

  // ---- C5b: Chinatown ----
  console.log("\n# C5b Chinatown (solo)");
  {
    const st = await A.evaluate(() => window.__bfb.propDefs().find((d) => d.kind === "steamer"));
    ok(!!st, "Chinatown's dumpling steamers are out on the street");
    await A.evaluate((d) => { window.__bfb.setHeat(0); window.__bfb.clearCops(); window.__bfb.clearNpcs(d.x, d.z, 25); window.__bfb.teleport(d.x - 1.4, d.z, Math.PI / 2); window.__bfb.setYaw(Math.PI / 2); window.__bfb.setPitch(0.3); }, st);
    ok(await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "steamer", null, { timeout: 30000 }).then(() => true, () => false), "looking at a dumpling steamer: E to help yourself");
    const n0 = await A.evaluate(() => window.__bfb.items().length);
    await A.keyboard.press("e");
    ok(await A.waitForFunction((n) => window.__bfb.items().length > n, n0, { timeout: 30000 }).then(() => true, () => false), "E: dumplings (or buns, or a mooncake) pop out");
    await A.evaluate(() => window.__bfb.setPitch(0));
    await A.evaluate(() => window.__bfb.camAt(72, 1.8, -24, 0, -0.03)); await sleep(1500); await hide();
    await shot(A, "58-c5b-chinatown.png");
    await A.evaluate(() => window.__bfb.camFree());
  }

  // ---- C5c: Uptown landmarks: the Trashington Bank, the Mayor's statue ----
  console.log("\n# C5c Uptown landmarks (solo)");
  {
    const defs = await A.evaluate(() => window.__bfb.propDefs().filter((d) => ["vaultdoor", "nose", "stash", "depositbox"].includes(d.kind)).map((d) => ({ id: d.id, kind: d.kind, x: d.x, y: d.y, z: d.z })));
    const vd = defs.find((d) => d.kind === "vaultdoor"), nose = defs.find((d) => d.kind === "nose");
    ok(!!vd && !!nose && defs.filter((d) => d.kind === "stash").length === 5 && defs.filter((d) => d.kind === "depositbox").length === 4, "Uptown has the bank's vault door and deposit boxes, the Mayor's nose; 5 golden stashes (bank, statue, Le Dumpstere x2, THE COMPACTOR)");
    // walk in through the bank's front door (between the portico's columns)
    await A.evaluate(() => { window.__bfb.setHeat(0); window.__bfb.clearCops(); window.__bfb.clearNpcs(73, 90, 14); window.__bfb.teleport(73, 87.2, 0); window.__bfb.setYaw(0); window.__bfb.setPitch(0.05); });
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
    const inBank = await A.waitForFunction(() => window.__bfb.move().z > 91.5, null, { timeout: 30000 }).then(() => true, () => false);
    await A.evaluate(() => window.__bfb.setAxes(null));
    ok(inBank, "walk up the steps and in through the Trashington Bank's front door");
    await A.evaluate(() => window.__bfb.camAt(63.3, 1.8, 90.9, 0.9, -0.05)); await sleep(1500); await hide();
    await shot(A, "59-c5c-bank-lobby.png");
    await A.evaluate(() => window.__bfb.camFree());
    // the vault door: E with no keycard = the drill (loud: the alarm, the guards, big heat)
    ok(await A.evaluate((d) => window.__bfb.blockedAt(d.x, d.z), vd), "the vault door is shut (it blocks the way in)");
    await A.evaluate((d) => { window.__bfb.clearNpcs(d.x, d.z, 30); window.__bfb.teleport(d.x, d.z - 1.1, 0); window.__bfb.setYaw(0); window.__bfb.setPitch(0.15); }, vd);
    ok(await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "vaultdoor", null, { timeout: 30000 }).then(() => true, () => false), "facing the vault door: E to drill it");
    await A.keyboard.press("e");
    ok(await A.waitForFunction(() => window.__bfb.robT() >= 0, null, { timeout: 30000 }).then(() => true, () => false), "E: the drill starts (hold still)");
    ok(await A.waitForFunction(() => window.__bfb.heat() >= 85, null, { timeout: 30000 }).then(() => true, () => false), "drilling is LOUD: the bank alarm (heat 90+)");
    await A.evaluate((d) => window.__bfb.finishHold(d.id), vd);
    ok(await A.waitForFunction((id) => window.__bfb.worldProp(id)?.ready === false, vd.id, { timeout: 20000 }).then(() => true, () => false), "the drill gets through: the vault door swings open");
    ok(await A.waitForFunction((d) => window.__bfb.blockedAt(d.x, d.z) === false, vd, { timeout: 20000 }).then(() => true, () => false), "the doorway's clear: walk into the vault"); // (once your screen has the news)
    ok((await A.evaluate(() => window.__bfb.items().filter((i) => i.type === "gold_bar" || i.type === "cash_bag").length)) >= 5, "gold bars and bags of cash inside");
    await sleep(3000); await A.evaluate((d) => window.__bfb.camAt(d.x, 2.4, d.z - 5.2, 0, 0.08), vd); await sleep(1500); await hide();
    await shot(A, "60-c5c-vault-open.png");
    await A.evaluate(() => { window.__bfb.camFree(); window.__bfb.setPitch(0); window.__bfb.setHeat(0); window.__bfb.clearCops(); });
    // the Mayor's gold nose
    const n0 = await A.evaluate(() => window.__bfb.items().filter((i) => i.type === "gold_nose").length);
    await A.evaluate((d) => window.__bfb.finishHold(d.id), nose);
    ok(await A.waitForFunction((n) => window.__bfb.items().filter((i) => i.type === "gold_nose").length > n, n0, { timeout: 20000 }).then(() => true, () => false), "prise the Mayor's nose off: The Mayor's Gold Nose");
    await A.evaluate(() => window.__bfb.camAt(-3, 3.5, 58, -Math.PI / 2, -0.05)); await sleep(1500); await hide();
    await shot(A, "62-c5c-mayor-statue.png");
    await A.evaluate(() => { window.__bfb.camFree(); window.__bfb.setHeat(0); window.__bfb.clearCops(); });
  }

  // ---- C5c.2: LE DUMPSTÈRE ----
  console.log("\n# C5c.2 Le Dumpstere (solo)");
  {
    const rs = await A.evaluate(() => window.__bfb.resto());
    ok(!!rs, "Le Dumpstere is on Mile East");
    const dz = (rs.door.minZ + rs.door.maxZ) / 2;
    await A.evaluate(([x, z]) => { window.__bfb.dropAll(); window.__bfb.setHeat(0); window.__bfb.clearCops(); window.__bfb.teleport(x, z, Math.PI / 2); /* (no clearNpcs here: it would clear away the maitre d' too) */ window.__bfb.setYaw(Math.PI / 2); window.__bfb.setPitch(0.05); }, [rs.out.x - 0.5, dz]);
    await sleep(800);
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
    ok(await A.waitForFunction(() => /reservation/.test(document.getElementById("flash")?.textContent ?? ""), null, { timeout: 45000 }).then(() => true, () => false), "no booking, not dressed for it: the maitre d' turns you away");
    await A.evaluate(() => window.__bfb.setAxes(null));
    ok(await A.evaluate((c) => window.__bfb.move().x < c.door.maxX, rs), "...and you're still on the pavement");
    // round the back: the kitchen door's open
    await A.evaluate((c) => { window.__bfb.teleport(c.rect.maxX + 1.2, 61.8, -Math.PI / 2); window.__bfb.setYaw(-Math.PI / 2); }, rs);
    await sleep(800);
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
    ok(await A.waitForFunction((c) => { const m = window.__bfb.move(); return m.x > c.kitchen.minX && m.x < c.kitchen.maxX && m.z > c.kitchen.minZ && m.z < c.kitchen.maxZ; }, rs, { timeout: 45000 }).then(() => true, () => false), "in through the kitchen's back door");
    await A.evaluate(() => window.__bfb.setAxes(null));
    await A.evaluate((c) => window.__bfb.camAt(c.hall.minX + 0.6, 2.4, c.hall.maxZ - 0.6, Math.PI / 2 + 0.55, 0.15), rs);
    await sleep(2500); await hide();
    await shot(A, "65-c5c2-le-dumpstere-inside.png");
    await A.evaluate((c) => window.__bfb.camAt(c.out.x - 11, 3.2, (c.door.minZ + c.door.maxZ) / 2 - 3, Math.PI / 2 + 0.2, 0.0), rs); await sleep(2000); await hide();
    await shot(A, "66-c5c2-le-dumpstere-front.png");
    await A.evaluate(() => window.__bfb.camFree());
  }

  // ---- C5c.3: THE COMPACTOR (the club) + PAWN-O-RAMA ----
  console.log("\n# C5c.3 The Compactor + Pawn-O-Rama (solo)");
  {
    const cl = await A.evaluate(() => window.__bfb.club());
    ok(!!cl, "THE COMPACTOR is on Crooked St");
    const dz = (cl.door.minZ + cl.door.maxZ) / 2;
    const front = async () => { await A.evaluate(([x, z]) => { window.__bfb.teleport(x, z, -Math.PI / 2); window.__bfb.setYaw(-Math.PI / 2); window.__bfb.setPitch(0.05); }, [cl.out.x + 0.6, dz]); await sleep(800); };
    // no cover: Big Crunch puts you back on the pavement
    await A.evaluate(() => { window.__bfb.dropAll(); window.__bfb.setHeat(0); window.__bfb.clearCops(); window.__bfb.setCash(0); window.__bfb.setAura(0); });
    await front();
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
    ok(await A.waitForFunction(() => /Fifteen bucks/.test(document.getElementById("flash")?.textContent ?? ""), null, { timeout: 45000 }).then(() => true, () => false), "no cover: Big Crunch puts you back on the pavement");
    await A.evaluate(() => window.__bfb.setAxes(null));
    ok(await A.evaluate((c) => window.__bfb.move().x > c.door.minX, cl), "...and you're still outside");
    // pay the cover at the rope ($15 of your cash)
    await A.evaluate(() => window.__bfb.setCash(40));
    await A.waitForFunction(() => window.__bfb.myCash() === 40, null, { timeout: 20000 }).catch(() => {});
    const rope = await A.evaluate(() => window.__bfb.propDefs().find((d) => d.kind === "clubrope"));
    await A.evaluate((d) => { window.__bfb.teleport(d.x + 1.0, d.z, -Math.PI / 2); window.__bfb.setYaw(-Math.PI / 2); window.__bfb.setPitch(0.35); }, rope);
    ok(await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "clubrope", null, { timeout: 30000 }).then(() => true, () => false), "at the rope: E to pay the cover");
    await A.keyboard.press("e");
    ok(await A.waitForFunction(() => /STAMPED/.test(document.getElementById("bb-title")?.textContent ?? "") && window.__bfb.myCash() === 25, null, { timeout: 30000 }).then(() => true, () => false), "E: $15 cover paid, stamped till dawn");
    await front();
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
    ok(await A.waitForFunction((c) => window.__bfb.move().x < c.door.minX - 1.5, cl, { timeout: 45000 }).then(() => true, () => false), "stamped: walk in through the hopper door");
    await A.evaluate(() => window.__bfb.setAxes(null));
    // THE DROP: on the crusher bed when the floor builds up and slams: up you go
    const f = cl.floor;
    // (between drops: the bed's down at dance height; a drop already building would push you off its side)
    await A.waitForFunction(() => (window.__bfb.clubFloor() ?? 9) < 0.45, null, { timeout: 180000 }).catch(() => {});
    await A.evaluate((f) => { window.__bfb.clearNpcs((f.minX + f.maxX) / 2, (f.minZ + f.maxZ) / 2, 6); window.__bfb.teleportY((f.minX + f.maxX) / 2, 0.5, (f.minZ + f.maxZ) / 2, Math.PI); window.__bfb.setPitch(0.1); }, f);
    await sleep(1500);
    await A.evaluate(() => window.__bfb.clubDrop());
    ok(await A.waitForFunction(() => (window.__bfb.clubFloor() ?? 0) > 1.3 && window.__bfb.move().y > 1.2, null, { timeout: 120000 }).then(() => true, () => false), "THE DROP builds: the crusher bed carries you up");
    await A.evaluate(() => window.__bfb.camAt(-69.5, 5.6, -33.5, 0, 0.32)); await sleep(500); await hide();
    await shot(A, "67-c5c3-the-build.png");
    await A.evaluate(() => window.__bfb.camFree());
    ok(await A.waitForFunction(() => window.__bfb.move().y > 2.0, null, { timeout: 120000 }).then(() => true, () => false), "the slam: the floor drops and launches you into the air (higher than the floor ever goes)");
    // the trash conveyor: crouch on it at the dock and ride under the flap into the sorting room
    const b = cl.belt;
    await A.evaluate(([b, y]) => window.__bfb.teleportY(b.minX + 1.0, y, (b.minZ + b.maxZ) / 2, Math.PI / 2), [b, cl.beltY]);
    await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 0, crouch: true }));
    ok(await A.waitForFunction((c) => window.__bfb.move().x > c.wing.minX + 0.4, cl, { timeout: 120000 }).then(() => true, () => false), "crouched on the conveyor: carried under the flap into the sorting room");
    await A.evaluate(() => window.__bfb.setAxes(null));
    // the DJ's decks in the crane cab: hijack them
    const decks = await A.evaluate(() => window.__bfb.propDefs().find((d) => d.kind === "djdecks"));
    const aura0 = await A.evaluate(() => window.__bfb.aura());
    await A.evaluate(([d, y]) => { window.__bfb.teleportY(d.x, y, d.z + 1.0, Math.PI); window.__bfb.setYaw(Math.PI); window.__bfb.setPitch(0.3); }, [decks, cl.cabY]);
    ok(await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "djdecks", null, { timeout: 30000 }).then(() => true, () => false), "in the crane cab: E to hijack the decks");
    await A.keyboard.press("e");
    ok(await A.waitForFunction((a0) => window.__bfb.aura() >= a0 + 3, aura0, { timeout: 30000 }).then(() => true, () => false), "E: you're the DJ (+3 aura)");
    await A.evaluate(() => window.__bfb.camAt(-66, 3.0, -36.5, -0.2, 0.05)); await sleep(1500); await hide();
    await shot(A, "68-c5c3-compactor-hall.png");
    await A.evaluate((c) => window.__bfb.camAt(c.out.x + 10, 3.6, c.out.z + 8, -2.21, 0.05), cl); await sleep(1500); await hide();
    await shot(A, "69-c5c3-compactor-front.png");
    await A.evaluate(() => window.__bfb.camFree());
    // PAWN-O-RAMA: sell Sal a gold chain over the counter
    const ps = await A.evaluate(() => window.__bfb.pawnShop());
    ok(!!ps, "PAWN-O-RAMA is in the Yards");
    const counter = await A.evaluate(() => window.__bfb.propDefs().find((d) => d.kind === "pawncounter"));
    const sx = counter.x + Math.sin(counter.yaw) * 1.3, sz = counter.z + Math.cos(counter.yaw) * 1.3, yawIn = counter.yaw + Math.PI;
    await A.evaluate(([x, z, yaw]) => { window.__bfb.setHeat(0); window.__bfb.clearCops(); window.__bfb.teleport(x, z, yaw); window.__bfb.setYaw(yaw); window.__bfb.setPitch(1.0); window.__bfb.clearItems(x, z, 2.5); }, [sx, sz, yawIn]);
    await sleep(800);
    await A.evaluate(([x, z, yaw]) => window.__bfb.spawnItem("gold_chain", x + Math.sin(yaw) * 0.85, z + Math.cos(yaw) * 0.85), [sx, sz, yawIn]);
    ok(await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "gold_chain", null, { timeout: 30000 }).then(() => true, () => false), "looking at a gold chain");
    await A.keyboard.press("e");
    await A.waitForFunction(() => window.__bfb.serverInventory()?.pockets.some(Boolean) || !!window.__bfb.serverInventory()?.hand, null, { timeout: 30000 }).catch(() => {});
    { const inv = await A.evaluate(() => window.__bfb.serverInventory()); const slot = inv.pockets.findIndex(Boolean); if (slot >= 0) await A.keyboard.press(String(slot + 1)); }
    await A.evaluate(() => window.__bfb.setPitch(0.35));
    const cash0 = await A.evaluate(() => window.__bfb.myCash());
    ok(await A.waitForFunction(() => window.__bfb.useTarget()?.kind === "pawncounter" && /Sell to Sal/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `at Sal's counter with the chain out: "Sell to Sal" (${await A.evaluate(() => window.__bfb.promptText())})`);
    await A.keyboard.press("e");
    ok(await A.waitForFunction((c0) => window.__bfb.myCash() > c0 && !window.__bfb.serverInventory()?.pockets.some(Boolean), cash0, { timeout: 30000 }).then(() => true, () => false), "E: Sal buys it on the spot (cash up, chain gone)");
    // the pawn case: Sal's window shows what's in it
    await A.evaluate(() => { window.__bfb.pawnAdd("rolecks_watch", 200); window.__bfb.pawnAdd("crt_tv", 60, true); });
    ok(await A.waitForFunction(() => window.__bfb.pawnCase().length === 2, null, { timeout: 30000 }).then(() => true, () => false), "the pawn case shows what's in it (yours to buy back, and one on sale)");
    const [nx, nz] = ps.out, rx = -nz, rz = nx, P = (u, v) => [ps.doorX + rx * u - nx * v, ps.doorZ + rz * u - nz * v];
    { const [x, z] = P(6.2, 1.2), [tx, tz] = P(-4, 7.5); await A.evaluate(([x, z, yaw]) => window.__bfb.camAt(x, 2.3, z, yaw, 0.18), [x, z, Math.atan2(tx - x, tz - z)]); }
    await sleep(2000); await hide();
    await shot(A, "70-c5c3-pawn-o-rama.png");
    await A.evaluate(() => { window.__bfb.camFree(); window.__bfb.setPitch(0); });
  }

  // ---- Slice 2A: walk-in shops, interiors drawn only nearby, the pond ----
  console.log("\n# Slice 2A city (solo)");
  const units = await A.evaluate(() => window.__bfb.units());
  ok(units.length === 19 && units.filter((u) => u.use === "shop").length === 15, `${units.length} buildings along the streets, ${units.filter((u) => u.use === "shop").length} walk-in shops (+ the taco cart)`);
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); window.__bfb.teleport(window.__bfb.landmarks().noShops.x, window.__bfb.landmarks().noShops.z, 0); }); // (C1: out in the build yard, every shop 42 m+ away)
  ok(await A.waitForFunction(() => window.__bfb.interiors() === 0, null, { timeout: 20000 }).then(() => true, () => false), "standing in the plaza: no shop interiors are drawn (performance)");
  const mart = units.find((u) => u.name === "CORNER MART");
  await A.evaluate((l) => { window.__bfb.teleport(l.x, l.z, l.yaw); window.__bfb.setPitch(0.05); window.__bfb.clearNpcs(l.x, l.z, 6); }, LM.martDoor);
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
  const inMart = await A.waitForFunction((u) => { const m = window.__bfb.move(); const dx = m.x - u.doorX, dz = m.z - u.doorZ; return -(dx * u.out[0] + dz * u.out[1]) > 3; }, mart, { timeout: 30000 }).then(() => true, () => false);
  await A.evaluate(() => window.__bfb.setAxes(null));
  ok(inMart, "walk straight in through Corner Mart's front door");
  ok((await A.evaluate(() => window.__bfb.interiors())) >= 1, `inside a shop: its interior is drawn (${await A.evaluate(() => window.__bfb.interiors())} nearby)`);
  await sleep(800); await hide();
  await shot(A, "42-inside-corner-mart.png");
  // the pond: wading is slow
  await A.evaluate((l) => { window.__bfb.teleport(l.x, l.z, l.yaw); window.__bfb.clearNpcs(l.x, l.z, 6); }, LM.pondEdge);
  await sleep(500);
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
  // (measured a couple of metres in, once you've slowed down from walking)
  const wade = await A.waitForFunction(() => { const m = window.__bfb.move(); const wz = window.__bfb.landmarks().pondEdge.waterZ; return m.z > wz + 2.8 && m.z < wz + 5.5 && Math.hypot(m.vx, m.vz) > 0.5 ? Math.hypot(m.vx, m.vz) : false; }, null, { timeout: 60000 }).then((h) => h.jsonValue(), () => 0);
  await A.evaluate(() => window.__bfb.setAxes(null));
  ok(wade > 0.5 && wade < 3, `wading through the pond: ${Number(wade).toFixed(1)} m/s (walking is 5)`);

  // ---- Phase 4: police + jail (solo) ----
  console.log("\n# Phase 4 police (solo)");
  // camera can never flip: look straight up and get knocked down
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (-8), 0); window.__bfb.setPitch(-1.5); window.__bfb.wipeout(); });
  let worstPitch = 0;
  for (let i = 0; i < 12; i++) { const cp = await A.evaluate(() => window.__bfb.camPitch()); if (cp !== null) worstPitch = Math.min(worstPitch, cp); await sleep(120); }
  ok(worstPitch > -Math.PI / 2, `camera never tips past straight up when knocked over looking up (pitch ${worstPitch.toFixed(2)})`);
  await A.waitForFunction(() => window.__bfb.respawnT() === 0, null, { timeout: 40000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setPitch(0));
  // 1 star: a cop comes for you
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (-8), 0); window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (-8), 12); window.__bfb.setHeat(40); });
  ok(await A.waitForFunction(() => window.__bfb.stars() === 1, null, { timeout: 10000 }).then(() => true, () => false), "40 heat = 1 wanted star on the HUD");
  // (R4: keep the heat on while waiting, like the bust loop below: at 110 ms lag the heat twice cooled off before a cop could be sent)
  let copSent = false;
  for (let i = 0; i < 30 && !copSent; i++) {
    copSent = await A.waitForFunction(() => window.__bfb.cops().length >= 1 || window.__bfb.jail()?.jailT > 0, null, { timeout: 5000, polling: 100 }).then(() => true, () => false);
    if (!copSent && (await A.evaluate(() => window.__bfb.heat())) < 35) await A.evaluate(() => window.__bfb.setHeat(40));
  }
  ok(copSent, "a cop is dispatched (or has already got you)"); // (C4b/D1: up to 150 s: the game clock crawls on this CPU-only box)
  // stand still: busted
  // (C5c: the cop walks over on the game clock, which crawls on this CPU-only box: at 110 ms lag it once took just over 90 s,
  //  and once so long your heat cooled below 1 star first and the cop went home. So keep the heat on while you wait, up to 5 min.)
  const bustT0 = await A.evaluate(() => window.__bfb.worldTime());
  let busted = false;
  for (let i = 0; i < 60 && !busted; i++) {
    busted = await A.waitForFunction(() => window.__bfb.jail()?.jailT > 0, null, { timeout: 5000 }).then(() => true, () => false);
    if (!busted && (await A.evaluate(() => window.__bfb.heat())) < 35) await A.evaluate(() => window.__bfb.setHeat(40));
  }
  console.log(`    (busted after ${((await A.evaluate(() => window.__bfb.worldTime())) - bustT0).toFixed(0)} s of game time)`);
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
  ok(await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0 && !window.__bfb.jail()?.open, null, { timeout: 60000 }) /* (R9: the jail clock crawls on this CPU-only box: 1.2 s took 10-13 s with the machine idle, R8 build and R9 alike) */.then(() => true, () => false), "time served: released, jail screen gone");
  const md = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(md.x - st.door.x, md.z - st.door.z) < 3 && (await A.evaluate(() => window.__bfb.heat())) === 0, "served: out the front door with 0 heat");
  // 3 stars: the cop car
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x - 8, window.__bfb.T.z, Math.PI); window.__bfb.setHeat(100); }); // (C1: the build yard, by the west road)
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
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (-11), 0); window.__bfb.setPitch(0); window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (-3), 14); });
  const bsId = await A.evaluate(() => window.__bfb.spawnBigShot("millionaire"));
  ok(!!bsId, "a millionaire comes to town");
  await sleep(1500);
  ok(await A.evaluate(() => !document.getElementById("bigshot") && !/IN TOWN/.test(document.getElementById("bb-title").textContent)), "5A: no tracker, no banner, no $$$: big shots just show up");
  // a millionaire standing right in front of you: punch = jackpot
  await A.evaluate(() => { window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (-3), 14); window.__bfb.placeNpc("millionaire", window.__bfb.T.x + (-16), window.__bfb.T.z + (-9.8), Math.PI); });
  await sleep(800);
  await A.mouse.move(640, 360);
  const heatBs0 = await A.evaluate(() => window.__bfb.heat());
  ok(await A.waitForFunction(() => /Bonk/.test(document.getElementById("prompt").textContent) && !/JACKPOT/.test(document.getElementById("prompt").textContent), null, { timeout: 10000 }).then(() => true, () => false), "5A: the prompt doesn't give away the jackpot");
  await A.mouse.click(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "gold_bar" || i.type === "diamond_ring"), null, { timeout: 15000 }).then(() => true, () => false), "punching the millionaire: gold bar / diamond ring pops out");
  const heatBs1 = await A.waitForFunction((h0) => window.__bfb.heat() - h0 >= 25 ? window.__bfb.heat() : false, heatBs0, { timeout: 8000 }).then((h) => h.jsonValue(), async () => A.evaluate(() => window.__bfb.heat()));
  ok(heatBs1 - heatBs0 >= 25, `and that's a lot of heat (${Math.round(heatBs0)} -> ${Math.round(heatBs1)})`);
  await sleep(300); await hide();
  await shot(A, "36-bigshot.png");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (-8), 20); });

  // ---- Phase 5A: the cycle loop (solo, real keys) ----
  console.log("\n# Phase 5A cycle (solo)");
  const M = () => A.evaluate(() => window.__bfb.match());
  const waitPhase = (ph, ms = 60000) => A.waitForFunction((x) => window.__bfb.match().phase === x, ph, { timeout: ms }).then(() => true, () => false);
  ok((await M()).phase === "lobby" && /LOBBY/.test(await A.textContent("#mh-time")), "starts in the lobby (free roam)");
  ok(/ENTER/.test(await A.textContent("#mh-sub")), `lobby hint: "${await A.textContent("#mh-sub")}"`);
  await A.keyboard.press("Enter");
  ok(await A.waitForFunction(() => window.__bfb.match().phase !== "lobby", null, { timeout: 60000 }).then(() => true, () => false), "ENTER starts the match (intro countdown)");
  ok(/CYCLE 1 OF 3/.test(await A.textContent("#bb-title")), `banner: "${await A.textContent("#bb-title")}"`);
  ok((await M()).home.inside, "a cycle starts at home");
  ok(await waitPhase("scavenge", 90000), "intro -> scavenge"); // (C3: 5 s of game time; the heavier city draws slower on this CPU-only box)
  await A.evaluate(() => window.__bfb.noEvents());
  ok(/^[23]:\d\d$/.test(await A.textContent("#mh-time")) && /DAY 1/.test(await A.textContent("#mh-round")), `day timer shows ${await A.textContent("#mh-round")} ${await A.textContent("#mh-time")}`);
  ok(await A.isVisible("#scores"), "scoreboard shows during the round");
  // bank a TV: drop it in the yard and wait 10 s
  const yardPos = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  const fwd = { x: Math.sin(yardPos.yaw), z: Math.cos(yardPos.yaw) };
  await A.evaluate(([x, z]) => window.__bfb.spawnItem("crt_tv", x, z), [yardPos.x + fwd.x * 2, yardPos.z + fwd.z * 2]);
  const banked = await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "crt_tv" && i.lock === 100), null, { timeout: 150000 }) /* (C3: 10 s of game time; slow CPU-drawn frames at the fort) */.then(() => true, () => false);
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
      ok(await A.waitForFunction(() => window.__bfb.match().truckOn && window.__bfb.scene().getTransformNodeByName("truck").isEnabled(), null, { timeout: 90000 }).then(() => true, () => false), "the garbage truck drives in");
    }
    // (5 s of GAME time: this headless machine sometimes runs the solo world ~10x slower than real time)
    if (kind === "airdrop") ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "airdrop_crate"), null, { timeout: 90000 }).then(() => true, () => false), "an airdrop crate spawns");
    if (kind === "raccoons") ok(await A.waitForFunction(() => window.__bfb.npcs().some((n) => n.kind === "raccoon"), null, { timeout: 90000 }).then(() => true, () => false), "a raccoon sneaks toward your fort");
  }
  // small money goes straight into your cash
  await A.evaluate(() => { window.__bfb.clearNpcs(window.__bfb.T.x + (-8), window.__bfb.T.z + (-8), 8); window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-8), 0); });
  await sleep(500);
  await A.evaluate(() => { window.__bfb.spawnItem("coin_pile", window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.4)); window.__bfb.setPitch(Math.atan2(1.35, 1.6)); });
  await lookAt("coin_pile");
  ok(/STRAIGHT TO YOUR WALLET/.test(await A.textContent("#prompt")), "coins say they go straight to your wallet");
  const cash0 = (await M()).scores[0].cash;
  await A.keyboard.press("e");
  ok(await A.waitForFunction((c) => window.__bfb.match().scores[0].cash > c, cash0, { timeout: 15000 }).then(() => true, () => false), "grabbing coins = instant cash");
  ok(await waitInv("v.pockets.every((x) => !x)", 5000), "(not in your pockets)");
  // carry something away from home when time runs out = lost
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.4)); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "pocketed a chicken out in the city");
  ok(await A.isVisible("#home-arrow") && /HOME \d+ m/.test(await A.textContent("#home-arrow")), `home compass: "${await A.textContent("#home-arrow")}"`);
  await A.evaluate(() => window.__bfb.setTimeLeft(2));
  // R12.3: one 8-minute scavenge: the sun goes down while you play (nothing's lost at sunset), then night
  ok(await waitPhase("dusk", 30000), "day -> sunset (still scavenging)");
  ok(await waitInv("v.pockets.some(Boolean)", 3000), "R12.3: sunset isn't time-up: still carrying the chicken");
  ok(/SUN'S GOING DOWN/.test(await A.textContent("#bb-title")), `banner: "${await A.textContent("#bb-title")}"`);
  ok(/SUNSET 1/.test(await A.textContent("#mh-round")) && /^[0-2]:\d\d$/.test(await A.textContent("#mh-time")), `one clock through the sunset: ${await A.textContent("#mh-round")} ${await A.textContent("#mh-time")}`);
  await A.evaluate(() => window.__bfb.setTimeLeft(1));
  ok(await waitPhase("night", 150000), "sunset -> night"); // (C5c.2: game time can run up to ~10x slower on this box)
  ok(await A.waitForFunction(() => window.__bfb.night().level > 0.9 && window.__bfb.night().body, null, { timeout: 20000 }).then(() => true, () => false), "the city goes dark (night visuals)");
  ok(/NIGHT 1/.test(await A.textContent("#mh-round")) && /^[0-2]:\d\d$/.test(await A.textContent("#mh-time")), `night timer: ${await A.textContent("#mh-time")}`);
  const nightItems = await A.evaluate(() => window.__bfb.items().filter((i) => i.mode === "free"));
  const tvStill = nightItems.find((i) => i.type === "crt_tv" && i.lock === 100);
  ok(!!tvStill, "your banked TV is still in the fort at night");
  ok(nightItems.some((i) => i.mult === 2), `fresh x2 loot appears as night falls (${nightItems.filter((i) => i.mult === 2).length})`);
  await A.evaluate(() => { const l = window.__bfb.landmarks().martDoor; window.__bfb.teleport(l.x - Math.sin(l.yaw) * 9, l.z - Math.cos(l.yaw) * 9, l.yaw); window.__bfb.setPitch(0.05); }); // (C1: the Yards shops at night)
  await sleep(1500); await hide();
  await shot(A, "37-night.png");
  await A.evaluate(() => window.__bfb.setTimeLeft(1));
  ok(await waitPhase("dawn", 30000), "night -> sunrise");
  ok(await waitInv("v.pockets.every((x) => !x)", 5000), "the chicken is gone (lost: still out in the city at sunrise)");
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
  for (let k = 0; k < 300 && (await M()).phase !== "over"; k++) { await A.evaluate(() => window.__bfb.setTimeLeft(0.2)); await sleep(600); } // (D1: up to 3 min: each phase change takes a few frames, and frames are slow on this box)
  ok((await M()).phase === "over", "after 3 cycles: match over");
  ok(/RICHEST BANDIT/.test(await A.textContent("#tally")), `final card: "${(await A.textContent("#tally-title"))}"`);
  await hide();
  await shot(A, "26-final-results.png");
  await A.keyboard.press("Enter");
  ok(await waitPhase("intro", 30000) && (await M()).round === 1 && (await M()).scores[0].cash === 0, "ENTER plays again (fresh match)");

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
  // (D1: the host window switches to Performance mode for the online part. On this CPU-only box a full-detail host
  //  drawing the city slows every friend's join (measured 6-13 min vs ~6 min); solo above already checked full detail.)
  await A.evaluate(() => window.__bfb.setLowGraphics(true));
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
  // (generous: this test machine now has 2 CPU cores shared by every window + software rendering; C5c: a lone joiner measured 6.5-9 min here, so 15 min) // (R12.1: 25 min: the C join timed out at 15 in 4 of the last 6 full runs, R11.5 included)
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 1500000 });
  const C = await openPage("C", `?room=${code}&test=1`);
  await C.click("#btn-accept-invite");
  await C.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 1500000 });
  // (R12.1: the joiners drop to Performance mode too once they're in (like the host), so the 4th and 5th windows below
  //  get some CPU to load with: in two R12.1 runs the 4th didn't finish loading in 25 min)
  for (const p of [B, C]) await p.evaluate(() => window.__bfb.setLowGraphics(true));
  await sleep(800);
  for (const p of [A, B, C]) {
    const x = await info(p);
    ok(Object.keys(x.players).length === 3 && x.remotes === 2, `${p.label}: sees 3 players (${x.remotes} others drawn)`);
  }
  ok(!(await B.isVisible("#btn-start")), "non-host does not see START MATCH");
  // Phase 4.6: A hosts the game in their browser; B and C are connected straight to A
  // (on this slow test box a joiner's tab can stall past the 8 s silence limit and auto-reconnect; give it time)
  await A.waitForFunction(() => window.__bfb.hostStats()?.peers === 2, null, { timeout: 30000 }).catch(() => {});
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
  const steps = s1.moveSteps - s0.moveSteps, moved = aNow.z - aStart.z, expected = rampDist(steps / 60, 5.8);
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
  console.log("\n# C4a mess (online)");
  {
    const bench = await A.evaluate(() => { const ds = window.__bfb.propDefs().filter((d) => d.kind === "bench"); return ds[0]; });
    await A.evaluate((b) => { const x = b.x + (b.hw > b.hd ? 0 : b.hw + 0.8), z = b.z + (b.hw > b.hd ? b.hd + 0.8 : 0); window.__bfb.teleport(x, z, Math.atan2(b.x - x, b.z - z)); }, bench);
    await sleep(1500);
    let aBroke = false;
    for (let k = 0; k < 10 && !aBroke; k++) {
      await A.evaluate((b) => { const m = window.__bfb.move(); window.__bfb.shopAct({ a: "punch", yaw: Math.atan2(b.x - m.x, b.z - m.z), pitch: 0 }); }, bench);
      aBroke = await A.waitForFunction((id) => window.__bfb.props().some((p) => p.id === id && !p.ready), bench.id, { timeout: 2500 }).then(() => true, () => false);
    }
    const bSees = await B.waitForFunction((id) => window.__bfb.props().some((p) => p.id === id && !p.ready), bench.id, { timeout: 30000 }).then(() => true, () => false);
    ok(bSees, "A smashes a bench: B's screen gets it too");
    ok(await B.evaluate((b) => window.__bfb.smashed() >= 1 && window.__bfb.blockedAt(b.x, b.z) === false, bench), "on B's screen it's gone and doesn't block either (same collision both sides)");
  }

  console.log("\n# C4b tag (online)");
  {
    const pw = LM.pitWall;
    const tagState = () => A.evaluate(() => JSON.stringify({ look: window.__bfb.lookTarget(), inv: window.__bfb.serverInventory(), uses: window.__bfb.canUses(), aim: window.__bfb.tagAim(), tags: window.__bfb.tags().length, aura: window.__bfb.aura() }));
    await A.evaluate(() => window.__bfb.testInput(true)); // (keys work for A from here on)
    await A.evaluate((l) => { window.__bfb.teleport(l.x - 3, l.z, 0); window.__bfb.setYaw(0); window.__bfb.setPitch(0); }, pw);
    await sleep(1500);
    let gotCan = false;
    for (let k = 0; k < 3 && !gotCan; k++) { // (slow CPU-drawn frames with 3 windows: retry the pick-up)
      await A.evaluate((l) => window.__bfb.spawnItem("spray_can", l.x - 3, l.z - 0.9), pw);
      await A.evaluate(() => { window.__bfb.setYaw(Math.PI); window.__bfb.setPitch(1.1); });
      await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "spray_can", null, { timeout: 40000 }).catch(() => {});
      await A.keyboard.press("e");
      gotCan = await A.waitForFunction(() => window.__bfb.canUses() > 0 || window.__bfb.serverInventory()?.pockets.some(Boolean) || !!window.__bfb.serverInventory()?.hand, null, { timeout: 40000 }).then(() => true, () => false);
    }
    if (!(await A.evaluate(() => window.__bfb.canUses() > 0))) { const inv = await A.evaluate(() => window.__bfb.serverInventory()); const slot = inv?.pockets.findIndex(Boolean) ?? -1; if (slot >= 0) await A.keyboard.press(String(slot + 1)); }
    await A.evaluate(() => { window.__bfb.setYaw(0); window.__bfb.setPitch(0); });
    const ready = await A.waitForFunction(() => window.__bfb.canUses() > 0 && window.__bfb.tagAim(), null, { timeout: 40000 }).then(() => true, () => false);
    console.log("   (A before tagging: " + (await tagState()) + ")");
    ok(ready, "online: A has a spray can out, aimed at THE PIT's wall");
    const t0 = await B.evaluate(() => window.__bfb.tags().length);
    await A.keyboard.down("e");
    const aTag = await A.waitForFunction((n) => window.__bfb.tags().length > n, t0, { timeout: 60000 }).then(() => true, () => false);
    await A.keyboard.up("e");
    ok(aTag, `online: A tags THE PIT's wall (${await tagState()})`);
    ok(await B.waitForFunction((n) => window.__bfb.tags().length > n, t0, { timeout: 30000 }).then(() => true, () => false), "B sees A's tag");
    ok((await A.evaluate(() => window.__bfb.aura())) >= 1, "A's aura went up");
    await A.keyboard.press("g"); // (drop the can: pockets empty for the next tests)
    await A.waitForFunction(() => { const i = window.__bfb.serverInventory(); return i && !i.hand && !i.pockets.some(Boolean); }, null, { timeout: 30000 }).catch(() => {});
  }

  console.log("\n# Phase 2 loot (online)");
  await A.evaluate(() => window.__bfb.setAxes(null));
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(true));
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (-8), 0); window.__bfb.clearNpcs(window.__bfb.T.x + (-16), window.__bfb.T.z + (-5), 14); });
  await sleep(800);
  await A.evaluate(() => { window.__bfb.spawnItem("crt_tv", window.__bfb.T.x + (-16), window.__bfb.T.z + (-6.4)); window.__bfb.setPitch(Math.atan2(1.2, 1.6)); });
  const aLook = await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "crt_tv", null, { timeout: 15000 }).then(() => true, () => false);
  ok(aLook, "A looks at a TV spawned in the online room");
  await A.keyboard.press("e");
  const aId = (await info(A)).sessionId;
  const bSawHeld = await B.waitForFunction((id) => window.__bfb.items().some((x) => x.type === "crt_tv" && x.mode === "held" && x.holder === id), aId, { timeout: 15000 }).then(() => true, () => false);
  ok(bSawHeld, "B sees the TV in A's hands");
  await A.keyboard.press("g");
  ok(await A.waitForFunction(() => window.__bfb.serverInventory().hand === "", null, { timeout: 20000 }).then(() => true, () => false), "A drops the TV (hands empty before the race)");

  // Grab race: A and C both go for the same suitcase at the same moment
  await A.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-16), window.__bfb.T.z + (-4.7), 0));
  await C.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-14.3), window.__bfb.T.z + (-3), -Math.PI / 2));
  await sleep(1200);
  await A.evaluate(() => { window.__bfb.spawnItem("mystery_suitcase", window.__bfb.T.x + (-16), window.__bfb.T.z + (-3)); window.__bfb.setPitch(0.45); });
  await C.evaluate(() => window.__bfb.setPitch(0.45));
  const bothLook = await Promise.all([A, C].map((P) => P.waitForFunction(() => window.__bfb.lookTarget()?.type === "mystery_suitcase", null, { timeout: 40000 }).then(() => true, () => false)));
  ok(bothLook.every(Boolean), "A and C are both looking at the suitcase");
  await Promise.all([A.keyboard.press("e"), C.keyboard.press("e")]);
  await sleep(2500);
  const hands = await Promise.all([A, C].map((P) => P.evaluate(() => window.__bfb.serverInventory().hand)));
  const raceItems = await A.evaluate(() => window.__bfb.items().filter((x) => Math.hypot(x.x - window.__bfb.T.x + 16, x.z - window.__bfb.T.z + 4) < 6).map((x) => `${x.id}:${x.type}:${x.mode}:${x.holder}`));
  console.log(`   [diag] race hands A=${hands[0]} C=${hands[1]} nearby=${JSON.stringify(raceItems)}`);
  const winners = hands.filter(Boolean).length;
  ok(winners === 1, `grab race: exactly one winner (A: ${hands[0] ? "got it" : "whiffed"}, C: ${hands[1] ? "got it" : "whiffed"})`);
  const loser = hands[0] ? C : A;
  ok(!(await loser.evaluate(() => window.__bfb.inventory().hand)), "the loser's hands are empty again (instant guess undone)");
  for (const P of [A, C]) {
    for (let k = 0; k < 4 && (await P.evaluate(() => window.__bfb.serverInventory().hand)); k++) {
      await P.keyboard.press("g");
      await P.waitForFunction(() => window.__bfb.serverInventory().hand === "", null, { timeout: 8000 }).catch(() => {});
    }
  }

  // ---- Phase 5A: tug of war over a giant item ----
  console.log("\n# Tug of war (online)");
  // (C1: 8 m further from the build yard's fence than the old plaza spot: the giant duck is wide)
  await A.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-4.7), 0); window.__bfb.clearNpcs(window.__bfb.T.x + (-8), window.__bfb.T.z + (-3), 10); });
  await C.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-6.3), window.__bfb.T.z + (-2.9), -Math.PI / 2));
  await sleep(1000);
  await A.evaluate(() => window.__bfb.spawnItem("rubber_duck", window.__bfb.T.x + (-8), window.__bfb.T.z + (-2.9)));
  // (THIS duck, the one right here: a giant duck can also spawn somewhere else in the city)
  const duck = await A.waitForFunction(() => window.__bfb.items().find((i) => i.type === "rubber_duck" && i.resting && Math.hypot(i.x - window.__bfb.T.x + 8, i.z - window.__bfb.T.z + 2.9) < 4)?.id, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
  ok(!!duck, "a giant duck lands between A and C");
  await A.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck);
  let aDrags = await A.waitForFunction((id) => window.__bfb.serverInventory().hand === id, duck, { timeout: 15000 }).then(() => true, () => false);
  if (!aDrags) {
    console.log(`   [diag] duck grab: A hand=${(await A.evaluate(() => window.__bfb.serverInventory())).hand} A at ${JSON.stringify(await A.evaluate(() => window.__bfb.move()))} duck ${JSON.stringify(await A.evaluate((id) => window.__bfb.items().find((i) => i.id === id), duck))}`);
    await A.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck); // (one retry: a grab sent during a lag spike)
    aDrags = await A.waitForFunction((id) => window.__bfb.serverInventory().hand === id, duck, { timeout: 15000 }).then(() => true, () => false);
  }
  ok(aDrags, "A drags the duck (alone)");
  await C.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck);
  let cTug = await C.waitForFunction(() => !!window.__bfb.tug() && !document.getElementById("tug").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
  if (!cTug) {
    console.log(`   [diag] tug: C at ${JSON.stringify(await C.evaluate(() => window.__bfb.move()))} C hand=${(await C.evaluate(() => window.__bfb.serverInventory())).hand} duck ${JSON.stringify(await C.evaluate((id) => window.__bfb.items().find((i) => i.id === id), duck))}`);
    await C.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), duck); // (one retry, like A's grab)
    cTug = await C.waitForFunction(() => !!window.__bfb.tug() && !document.getElementById("tug").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false);
  }
  ok(cTug, "C grabs the other end: TUG OF WAR (mash meter)");
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
  await A.evaluate(() => window.__bfb.clearNpcs(window.__bfb.T.x + (-8), window.__bfb.T.z + (-7), 8));
  // park the mouse on the crosshair first: moving it there later would turn A's view (mouse look)
  await A.mouse.move(640, 360);
  await sleep(200);
  await A.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-8), 0));
  await C.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.8), Math.PI));
  await sleep(1500);
  // (C5c.1: on this slow box the teleport can take a while to reach A; wait until A's world has C standing there)
  await A.waitForFunction(() => window.__bfb.arrest()?.others.some((o) => Math.hypot(o.x - (window.__bfb.T.x - 8), o.z - (window.__bfb.T.z - 6.8)) < 0.3), null, { timeout: 30000 }).catch(() => {});
  await sleep(800);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await A.mouse.click(640, 360);
  ok(await C.waitForFunction(() => window.__bfb.hp() === 66, null, { timeout: 15000 }).then(() => true, () => false), "5A.1: one punch = 34 damage (C's health bar shows 66)");
  ok(await C.waitForFunction(() => document.getElementById("hp-num").textContent === "66", null, { timeout: 10000 }).then(() => true, () => false), "C's HUD shows 66");
  // punch until C goes down (a click can miss on this slow test box if C's teleport hasn't synced yet;
  // a miss also gives C time to start healing). What matters: every punch that LANDS takes 34,
  // and the one that empties the bar knocks C down.
  const hpLog = [66];
  const hits = [[100, 66]];
  let cKnocked = false;
  for (let k = 0; k < 8 && !cKnocked; k++) {
    await sleep(800); await C.evaluate(() => window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.8), Math.PI)); await sleep(700);
    const before = await C.evaluate(() => window.__bfb.hp());
    await A.mouse.click(640, 360);
    await C.waitForFunction((b) => window.__bfb.move().knockT > 0 || window.__bfb.hp() < b, before, { timeout: 6000 }).catch(() => {});
    const now = await C.evaluate(() => window.__bfb.hp());
    cKnocked = await C.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: now === 0 ? 10000 : 1 }).then(() => true, () => false);
    if (now < before || cKnocked) { hits.push([before, cKnocked ? 0 : now]); hpLog.push(cKnocked ? 0 : now); }
  }
  console.log(`   [diag] C's health after each landed punch: 100 -> ${hpLog.join(" -> ")}`);
  // (+ up to 12 of healing if C was mid-regen between our reading and the punch landing)
  const each34 = hits.every(([b, a]) => a === 0 ? b <= 34 + 12 : a >= b - 34 && a <= b - 34 + 12);
  ok(cKnocked && each34 && hits[hits.length - 1][0] <= 46, `5A.1: every landed punch takes 34, the one that empties the bar knocks C down (${hits.map(([b, a]) => b + "->" + a).join(", ")})`);
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

  // ---- C5c.1: citizen's arrest (online): C is wanted and flat on the ground; A holds C down; C wriggles free ----
  console.log("\n# C5c.1 citizen's arrest (online)");
  {
    for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(true));
    const aSid = (await info(A)).sessionId;
    await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.clearNpcs(window.__bfb.T.x + (-8), window.__bfb.T.z + (-7), 10); window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-8), 0); window.__bfb.setPitch(0.4); window.__bfb.setYaw(0); });
    // (C is wanted, so cops get sent: keep clearing them away so this checks the arrest, not a cop's bust)
    const noCops = setInterval(() => { A.evaluate(() => window.__bfb.clearCops()).catch(() => {}); }, 2000);
    await C.evaluate(() => { window.__bfb.teleport(window.__bfb.T.x + (-8), window.__bfb.T.z + (-6.9), Math.PI); });
    await sleep(1500);
    await C.evaluate(() => { window.__bfb.knockMe(20); window.__bfb.setHeat(45); });
    // (player ids in the host's world aren't the session ids the pages report, so find C as the one wanted bandit)
    const seen = await A.waitForFunction(() => window.__bfb.arrest()?.others.some((o) => o.heat >= 30 && o.knockT > 0), null, { timeout: 30000 }).then(() => true, () => false);
    ok(seen, "A can see C's heat (1 star) and that C is down");
    if (!seen) console.log("    [diag] A:", JSON.stringify(await A.evaluate(() => window.__bfb.arrest())));
    const tgt = await A.waitForFunction(() => !!window.__bfb.arrest()?.target, null, { timeout: 30000 }).then(() => true, () => false);
    ok(tgt, "standing over C: E for a citizen's arrest (bounty shown)");
    if (!tgt) console.log("    [diag] A:", JSON.stringify(await A.evaluate(() => ({ a: window.__bfb.arrest(), me: window.__bfb.move(), yaw: window.__bfb.info().yaw }))));
    const bountyTxt = await A.evaluate(() => document.getElementById("prompt")?.textContent ?? "");
    ok(/Citizen's arrest/.test(bountyTxt) && /bounty \$\d+/.test(bountyTxt), `the prompt names the bounty ("${bountyTxt.slice(0, 80)}")`);
    await A.evaluate(() => window.__bfb.clearCops());
    await A.keyboard.press("e");
    ok(await C.waitForFunction(() => window.__bfb.arrest()?.pinBy !== "", null, { timeout: 30000 }).then(() => true, () => false), "C is pinned down by A (C's screen knows)");
    ok(await B.waitForFunction(() => window.__bfb.arrest()?.others.some((o) => o.pinBy), null, { timeout: 30000 }).then(() => true, () => false), "B sees C being held (the red and blue light)");
    await hideOverlays(B); await sleep(500); await shot(B, "63-c5c1-citizens-arrest.png");
    await A.evaluate(() => window.__bfb.toggleMap(true)); await sleep(1200); await shot(A, "64-c5c1-map-wanted.png"); await A.evaluate(() => window.__bfb.toggleMap(false)); // (C shows as a rough WANTED area)
    // C mashes SPACE (spaced out: the host's game clock is slow on this box)
    let free = false;
    for (let i = 0; i < 40 && !free; i++) {
      await C.keyboard.press("Space"); await sleep(450);
      free = await C.evaluate(() => window.__bfb.arrest()?.pinBy === "");
    }
    ok(free, "C mashed SPACE and wriggled free");
    ok(await A.waitForFunction(() => window.__bfb.arrest()?.pinOn === "", null, { timeout: 20000 }).then(() => true, () => false), "A lost their grip");
    clearInterval(noCops);
    await C.evaluate(() => { window.__bfb.setHeat(0); window.__bfb.clearCops(); });
    for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(false));
  }

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

  console.log("\n# C5c.3 THE COMPACTOR (online)");
  // the host's DROP reaches everyone: the crusher bed rises on the joiners' screens too (it follows the synced club clock)
  await A.evaluate(() => window.__bfb.clubDrop());
  ok(await B.waitForFunction(() => (window.__bfb.clubFloor() ?? 0) > 1.0, null, { timeout: 180000 }).then(() => true, () => false), "online: the host starts THE DROP, B's crusher bed rises too");
  console.log("\n# Phase 4 jail (online)");
  // busted online: the server replays your lock-pick presses and lets you out the back
  for (const P of [A, C]) await P.evaluate(() => { window.__bfb.testInput(true); window.__bfb.setAxes(null); });
  await C.evaluate(() => window.__bfb.bust());
  ok(await C.waitForFunction(() => window.__bfb.jail()?.open, null, { timeout: 20000 }).then(() => true, () => false), "online: busted -> jail screen");
  // (Slice 2A: the station moved out with the edge band: use its cells, not fixed numbers)
  const aSeesC = await A.waitForFunction(() => { const cells = window.__bfb.station()?.cells ?? []; return Object.values(window.__bfb.info().players ?? {}).some((p) => cells.some((c) => p.x > c.rect.minX - 1 && p.x < c.rect.maxX + 1 && p.z > c.rect.minZ - 1 && p.z < c.rect.maxZ + 1)); }, null, { timeout: 30000 }).then(() => true, () => false);
  ok(aSeesC, "others see you in the cell");
  await C.evaluate(() => window.__bfb.setJailTime(90));
  const brokeOnline = await Promise.race([C.evaluate(() => window.__bfb.lockAutoPlay()), sleep(600000).then(() => false)]); // (D1: never hang the run on it)
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
  await B.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
  await B.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 240000 });
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 900000 });
  await B.evaluate(() => window.__bfb.setLowGraphics(true)); // (R12.1: back in Performance mode after the reload)
  await sleep(600);
  ok((await info(B)).sessionId === bSid, "refreshed player got their old seat back");
  ok(Object.keys((await info(A)).players).length === 3, "still 3 players after refresh (no ghost duplicate)");

  console.log("\n# Room full + bad code");
  const D = await openPage("D", `?room=${code}&test=1`);
  await D.click("#btn-accept-invite", { timeout: 120000 }); // 4 windows on one CPU: this page is slow
  await D.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 1500000 }); // (C3: the 4th CPU-rendered window loads slowest; C5c.2: 25 min, it took over 15 once)
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
  const started = await B.waitForFunction(() => ["intro", "scavenge"].includes(window.__bfb.info().phase), null, { timeout: 60000 }).then(() => true, () => false); // (a slow window can miss the short intro)
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
  await B.waitForFunction(() => window.__bfb.match().phase === "dusk", null, { timeout: 40000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setTimeLeft(0.3)); // (R12.3: skip the 30 s sunset)
  ok(await B.waitForFunction(() => window.__bfb.match().phase === "night", null, { timeout: 40000 }).then(() => true, () => false), "night falls for everyone");
  ok(await B.waitForFunction(() => window.__bfb.night().level > 0.5, null, { timeout: 20000 }).then(() => true, () => false), "B's city goes dark too");
  const tvNow2 = await B.evaluate((id) => window.__bfb.items().find((i) => i.id === id), tvId);
  // stand between the TV and the city centre (away from the fort box), facing the TV
  const dl = Math.hypot(tvNow2.x, tvNow2.z), bx = tvNow2.x - (tvNow2.x / dl) * 1.3, bz = tvNow2.z - (tvNow2.z / dl) * 1.3;
  let raided = false;
  const bPosLog = [];
  for (let k = 0; k < 3 && !raided; k++) {
    // (re-teleport each try and wait until B is really there: note anything that moved B away)
    await B.evaluate(([x, z, y]) => window.__bfb.teleport(x, z, y), [bx, bz, Math.atan2(tvNow2.x - bx, tvNow2.z - bz)]);
    await B.waitForFunction(([x, z]) => { const m = window.__bfb.move(); return Math.hypot(m.x - x, m.z - z) < 0.6; }, [bx, bz], { timeout: 10000 }).catch(() => {});
    await sleep(800);
    bPosLog.push(await B.evaluate(() => { const m = window.__bfb.move(); return `${m.x.toFixed(1)},${m.z.toFixed(1)} fx=${window.__bfb.fxHistory().slice(-3).join("/")}`; }));
    await B.evaluate((id) => window.__bfb.shopAct({ a: "grab", item: id }), tvId);
    raided = await B.waitForFunction((id) => window.__bfb.serverInventory().hand === id, tvId, { timeout: 8000 }).then(() => true, () => false);
  }
  console.log(`   [diag] raid tries: B positions before grabbing ${JSON.stringify(bPosLog)}`);
  if (!raided) console.log(`   [diag] raid: B at ${JSON.stringify(await B.evaluate(() => window.__bfb.move()))} tv ${JSON.stringify(await B.evaluate((id) => window.__bfb.items().find((i) => i.id === id), tvId))} flash "${await B.textContent("#flash")}" phase ${(await B.evaluate(() => window.__bfb.match())).phase}`);
  ok(raided, "B raids A's fort at night and takes the TV");
  ok(await A.waitForFunction(() => /RAIDING YOUR FORT|STOLE YOUR/.test(document.getElementById("bb-title").textContent), null, { timeout: 15000 }).then(() => true, () => false), `A's raid alarm goes off, naming the raider ("${await A.textContent("#bb-title")}")`);
  ok(await A.evaluate(() => window.__bfb.raidAlert()), "A gets the red screen edge + the arrow home");
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

  // ---- R3: the new city (the real map now): solo on it, out of a fort into town ----
  console.log("\n# R3 new city (solo)");
  for (const p of [B, C, D]) await p.context().close().catch(() => {}); // (fewer windows drawing on this CPU)
  const R3 = await openPage("R", "?test=1&map=new");
  await R3.click("#btn-solo", { timeout: 240000 });
  await R3.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 480000 });
  ok(/NEW CITY/.test(await R3.textContent("#mode-badge")), "the new city loads (badge says NEW CITY)");
  // R10: the police are out in free roam, before anyone starts the match
  ok(await R3.waitForFunction(() => window.__bfb.match().phase === "lobby" && window.__bfb.npcs().filter((n) => n.kind === "cop").length >= 8 && window.__bfb.copCars().length === 2, null, { timeout: 120000 }).then(() => true, () => false),
    `R10: cops and both cruisers out before the match starts (${await R3.evaluate(() => window.__bfb.npcs().filter((n) => n.kind === "cop").length)} cops, ${await R3.evaluate(() => window.__bfb.copCars().length)} cars)`);
  await R3.evaluate(() => { window.__bfb.testInput(true); window.__bfb.startMatch(); });
  ok(await R3.waitForFunction(() => window.__bfb.move().y < 1 && window.__bfb.move().z < -95, null, { timeout: 120000 }).then(() => true, () => false), "the match starts in a fort down in the bowl");
  const r3start = await R3.evaluate(() => window.__bfb.move());
  await R3.evaluate(() => { window.__bfb.setYaw(0); window.__bfb.setAxes({ mx: 0, mz: 1, sprint: true }); });
  ok(await R3.waitForFunction((z) => window.__bfb.move().z > z + 15, r3start.z, { timeout: 120000 }).then(() => true, () => false), "run north out of the fort, up to Gahookz Ghetto Lane");
  await R3.evaluate(() => window.__bfb.setAxes(null));
  await R3.evaluate(() => window.__bfb.toggleMap(true)); await sleep(1500); await hideOverlays(R3);
  await shot(R3, "r3-new-city-map.png");
  await R3.evaluate(() => window.__bfb.toggleMap(false));
  await R3.evaluate(() => window.__bfb.camAt(0, 120, -170, 0, 0.6)); await sleep(2500); await hideOverlays(R3);
  await shot(R3, "r3-new-city-overview.png");
  await R3.evaluate(() => window.__bfb.camFree());
  // R4: Little Italy (Leftovers Avenue) and Chinatown (Write-Off Avenue), and the festa
  const hasDistricts = await R3.evaluate(() => { const g = window.__bfb.facades().gates; return [g?.italy === 2, g?.china === 2]; });
  ok(hasDistricts.every(Boolean), "Little Italy and Chinatown are drawn (gates, lights, shopfronts)");
  await R3.evaluate(() => window.__bfb.camAt(-66.33 + 6, 6, -64, -0.6, 0.12)); await sleep(2500); await hideOverlays(R3);
  await shot(R3, "r4-little-italy-street.png");
  await R3.evaluate(() => window.__bfb.camAt(66.33 - 6, 6, -64, 0.6, 0.12)); await sleep(2500); await hideOverlays(R3);
  await shot(R3, "r4-chinatown-street.png");
  await R3.evaluate(() => window.__bfb.triggerEvent("festa"));
  ok(await R3.waitForFunction(() => /FESTA/.test(document.getElementById("event-hud").textContent), null, { timeout: 30000 }).then(() => true, () => false), `festa: event bar says "${await R3.textContent("#event-hud")}"`);
  ok(await R3.waitForFunction(() => window.__bfb.match().festaD > 3, null, { timeout: 240000 }).then(() => true, () => false), "the festa rolls up Leftovers Avenue");
  const festaVis = await R3.evaluate(() => ["festaMeatball", "festaBand", "festaGondola"].some((n) => { const t = window.__bfb.scene().getTransformNodeByName(n); return t && t.isEnabled(); }));
  ok(festaVis, "the festa float is drawn in the street");
  const fd = await R3.evaluate(() => window.__bfb.match().festaD);
  await R3.evaluate((d) => window.__bfb.camAt(-66.33 + 1.5, 4.5, -86 + d + 14, Math.PI, 0.18), fd); await sleep(2000); await hideOverlays(R3);
  await shot(R3, "r4-festa.png");
  await R3.evaluate(() => window.__bfb.camFree());
  // R5/R7: the two walk-in pawn shops: Lou and Meat Locker, Fran and Cold Cuts; the owner mutters the list at the till
  const hsPeople = await R3.evaluate(() => window.__bfb.npcs().filter((n) => ["lou", "meat_locker", "fran", "cold_cuts"].includes(n.kind)).map((n) => n.kind).sort().join(","));
  ok(hsPeople === "cold_cuts,fran,lou,meat_locker", `the pawn shops' people are in (${hsPeople})`);
  const shops = await R3.evaluate(() => window.__bfb.hotShops());
  ok(shops.length === 2, "two pawn shops in the new city");
  if (shops.length === 2) {
    for (const [i, who] of [[0, /TWITCHY LOU/], [1, /STICKY FRAN/]]) {
      const hs = shops[i];
      await R3.evaluate(([x, z]) => { window.__bfb.teleport(x, z, 0); window.__bfb.setPitch(0.1); }, [hs.stand.x, hs.stand.z]);
      ok(await R3.waitForFunction((re) => new RegExp(re).test(document.getElementById("bb-title").textContent), who.source, { timeout: 120000 }).then(() => true, () => false), `${hs.name}: the owner mutters today's list ("${(await R3.textContent("#bb-sub")).slice(0, 80)}")`);
      ok(await R3.waitForFunction(() => /Lou|Fran/.test(window.__bfb.promptText()), null, { timeout: 60000 }).then(() => true, () => false), `the till prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 60)}"`);
    }
    const L = shops[0];
    await R3.evaluate(([x, z]) => window.__bfb.camAt(x - 4, 2.6, z - 7.5, 0.55, 0.06), [(L.rect.minX + L.rect.maxX) / 2, L.rect.minZ]); await sleep(2500); await hideOverlays(R3);
    await shot(R3, "r7-pawn-front.png");
    await R3.evaluate(([x, z]) => window.__bfb.camAt(x, 1.7, z, 0.15, 0.08), [L.doorIn.x + 0.4, L.rect.minZ + 0.6]); await sleep(2500); await hideOverlays(R3);
    await shot(R3, "r7-pawn-inside.png");
    await R3.evaluate(() => window.__bfb.camAt(12, 4, -46, -2.45, 0.12)); await sleep(2500); await hideOverlays(R3);
    await shot(R3, "r7-police-station.png");
    await R3.evaluate(() => window.__bfb.camFree());
  }
  // R8: the glass doors: E opens the station's front doors
  {
    const door = await R3.evaluate(() => window.__bfb.props().find((p) => p.id === "door1") ?? null);
    ok(!!door && door.ready, "the station's front doors are there, shut");
    if (door) {
      await R3.evaluate(([x, z]) => { window.__bfb.teleport(x, z, Math.PI); window.__bfb.setPitch(0.1); }, [door.x, door.z + 1.3]);
      await sleep(1500);
      ok(await R3.waitForFunction(() => /Open/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `door prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.keyboard.press("e");
      ok(await R3.waitForFunction(() => window.__bfb.props().find((p) => p.id === "door1")?.ready === false, null, { timeout: 30000 }).then(() => true, () => false), "E opens it");
      ok(await R3.waitForFunction(() => /Close/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `R9: open, it offers to close: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.keyboard.press("e");
      ok(await R3.waitForFunction(() => window.__bfb.props().find((p) => p.id === "door1")?.ready === true, null, { timeout: 30000 }).then(() => true, () => false), "R9: E shuts it again");
      await R3.keyboard.press("e");
      await R3.waitForFunction(() => window.__bfb.props().find((p) => p.id === "door1")?.ready === false, null, { timeout: 30000 }).catch(() => {});
      await R3.evaluate(([x, z]) => window.__bfb.camAt(x + 3, 2.2, z + 5, -2.6, 0.08), [door.x, door.z]); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r8-station-doors.png");
      await R3.evaluate(() => window.__bfb.camFree());
    }
  }
  // R7: the station's stairs really take you up to the first floor
  const grand = await R3.evaluate(() => window.__bfb.station()?.grand ?? null);
  ok(!!grand, "the grand station");
  if (grand) {
    await R3.evaluate(([x, z]) => { window.__bfb.teleport(x, z, Math.PI); window.__bfb.setAxes({ mx: 0, mz: 1, sprint: false }); }, [(grand.stairs.minX + grand.stairs.maxX) / 2, grand.stairs.maxZ + 0.6]);
    ok(await R3.waitForFunction((y) => window.__bfb.move().y > y - 0.3, grand.upY, { timeout: 90000 }).then(() => true, () => false), `up the stairs to the first floor (y ${(await R3.evaluate(() => window.__bfb.move().y)).toFixed(2)})`);
    await R3.evaluate(() => window.__bfb.setAxes(null));
    const ev = grand.evidence;
    await R3.evaluate(([x, y, z]) => window.__bfb.camAt(x + 3.6, y + 1.9, z + 2.6, -2.4, 0.25), [(ev.minX + ev.maxX) / 2, grand.upY, ev.maxZ]); await sleep(2500); await hideOverlays(R3);
    await shot(R3, "r7-upstairs.png");
    await R3.evaluate(() => window.__bfb.camAt(0, 2.0, -60.6, Math.PI, 0.05)); await sleep(2500); await hideOverlays(R3);
    await shot(R3, "r7-lobby.png");
    await R3.evaluate(() => window.__bfb.camFree());
  }
  // R6: the holding cell: you land in it free to walk about, no instant lockpick; the toilet flushes back at you
  const holding = await R3.evaluate(() => window.__bfb.station()?.holding ?? null);
  ok(!!holding, "the new station has a holding cell");
  if (holding) {
    await R3.evaluate(() => { window.__bfb.clearCops(); window.__bfb.bust(); });
    ok(await R3.waitForFunction(() => (window.__bfb.jail()?.jailT ?? 0) > 0, null, { timeout: 60000 }).then(() => true, () => false), "busted: in the holding cell");
    await sleep(1500);
    ok(!(await R3.evaluate(() => window.__bfb.jail().open)), "the lockpick doesn't open straight away");
    ok(await R3.waitForFunction(() => /HOLDING CELL/i.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `cell prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 60)}"`);
    const t = holding.toilet;
    await R3.evaluate(([x, z]) => window.__bfb.teleport(x - 1.1, z, Math.PI / 2), [t.x, t.z]);
    ok(await R3.waitForFunction(() => /Flush/i.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `toilet prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 60)}"`);
    await R3.keyboard.press("e");
    ok(await R3.waitForFunction(() => !!document.getElementById("fx-dirty"), null, { timeout: 30000 }).then(() => true, () => false), "flushing splashes dirty water over the screen");
    await R3.evaluate(() => window.__bfb.setJailTime(0.1));
    ok(await R3.waitForFunction(() => (window.__bfb.jail()?.jailT ?? 1) <= 0, null, { timeout: 60000 }).then(() => true, () => false), "released from the holding cell");
  }
  const r3errs = R3.errors.filter((e) => !/favicon|fonts\.g/.test(e));
  // R11: NEON FEVER DREAM: the bouncer, the cover, the stairs to floor 2 and the roof, dancing, a mocktail, screenshots
  {
    const f = await R3.evaluate(() => window.__bfb.fever());
    ok(!!f, "NEON FEVER DREAM is on Market Row");
    if (f) {
      await R3.evaluate(() => { window.__bfb.forceNight(true); window.__bfb.setCash(60); });
      // walk at the door without paying: bounced
      await R3.evaluate((o) => { window.__bfb.teleport(o.x, o.z, Math.PI / 4); window.__bfb.setPitch(0.05); }, f.out);
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 })); await sleep(2500); await R3.evaluate(() => window.__bfb.setAxes(null));
      const m0 = await R3.evaluate(() => window.__bfb.move());
      ok(m0.x + m0.z < f.rect.minX + f.rect.minZ + f.cham + 1.5, `the bouncer turns you back without the cover (${m0.x.toFixed(1)},${m0.z.toFixed(1)})`);
      // pay at the rope
      const rope = (await R3.evaluate(() => window.__bfb.props())).find((p) => p.kind === "clubrope");
      await R3.evaluate((r) => { window.__bfb.teleport(r.x - 0.9, r.z - 0.9, Math.PI / 4); window.__bfb.setPitch(0.3); }, rope);
      ok(await R3.waitForFunction(() => /cover/i.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `the rope's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.keyboard.press("e");
      ok(await R3.waitForFunction(() => window.__bfb.myCash() === 40, null, { timeout: 30000 }).then(() => true, () => false), "paid the $20 cover");
      await R3.evaluate((o) => { window.__bfb.teleport(o.x, o.z, Math.PI / 4); window.__bfb.setPitch(0.05); }, f.out);
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction((k) => { const m = window.__bfb.move(); return m.x + m.z > k; }, f.rect.minX + f.rect.minZ + f.cham + 2.5, { timeout: 40000 }).catch(() => {}); // (C5b: the game clock, not the wall clock)
      await R3.evaluate(() => window.__bfb.setAxes(null));
      const m1 = await R3.evaluate(() => window.__bfb.move());
      ok(m1.x + m1.z > f.rect.minX + f.rect.minZ + f.cham + 1.5, `then you're in (${m1.x.toFixed(1)},${m1.z.toFixed(1)})`);
      ok(await R3.waitForFunction(() => /Dance/.test(window.__bfb.promptText()), null, { timeout: 20000 }).then(() => true, () => false), "inside: the B prompt says Dance");
      // the stairs: floor 1 -> 2 -> the roof
      await R3.evaluate((s) => window.__bfb.teleport(s.minX - 0.6, (s.minZ + s.maxZ) / 2, Math.PI / 2), f.stairs1);
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      const up2 = await R3.waitForFunction((y) => Math.abs(window.__bfb.move().y - y) < 0.2 && window.__bfb.move().grounded, f.y2, { timeout: 60000 }).then(() => true, () => false);
      await R3.evaluate(() => window.__bfb.setAxes(null));
      ok(up2, `up the stairs to floor 2 (y ${(await R3.evaluate(() => window.__bfb.move().y)).toFixed(2)})`);
      await R3.evaluate((b) => { window.__bfb.camAt(b.minX + 0.5, b.y + 1.8, (b.minZ + b.maxZ) / 2, Math.PI / 2, 0.1); }, { ...f.bay, y: f.y2 }); // (from the bay over Market Row) await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r11-fever-floor2.png"); await R3.evaluate(() => window.__bfb.camFree());
      // R11.3: the east bay (the west one's twin): walk straight into it off floor 2
      await R3.evaluate((b) => window.__bfb.teleportY(b.minX - 3.5, b.y, (b.minZ + b.maxZ) / 2 - 1.5, Math.PI / 2), { ...f.bay2, y: f.y2 });
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction((x) => window.__bfb.move().x > x, f.bay2.minX + 0.4, { timeout: 40000 }).catch(() => {});
      await R3.evaluate(() => window.__bfb.setAxes(null));
      { const m = await R3.evaluate(() => window.__bfb.move()); ok(m.x > f.bay2.minX + 0.2 && Math.abs(m.y - f.y2) < 0.2, `into the east bay over the alley (${m.x.toFixed(1)},${m.y.toFixed(2)},${m.z.toFixed(1)})`); }
      await R3.evaluate((b) => { window.__bfb.camAt(b.maxX - 0.5, b.y + 1.8, (b.minZ + b.maxZ) / 2, -Math.PI / 2, 0.1); }, { ...f.bay2, y: f.y2 }); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r113-fever-eastbay.png"); await R3.evaluate(() => window.__bfb.camFree());
      // R11.1: DON BINNIE's lounge: under 8 aura his boys shove you back out; 8+ and you're in
      const inVip = (m, k = 0.3) => m.x > f.vip.minX + k && m.x < f.vip.maxX - k && m.z > f.vip.minZ + k && m.z < f.vip.maxZ - k;
      const inYaw = f.vipOut.yaw + Math.PI; // (R11.3: the way in, against the shove: the lounge is in the south-west now)
      await R3.evaluate((v) => { window.__bfb.setAura(7); window.__bfb.teleportY(v.vipOut.x, v.y, v.vipOut.z, v.yaw); }, { vipOut: f.vipOut, y: f.y2, yaw: inYaw });
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction(() => window.__bfb.worldTime?.() !== undefined, null, { timeout: 5000 }).catch(() => {});
      { const t0 = await R3.evaluate(() => window.__bfb.worldTime()); await R3.waitForFunction((t) => window.__bfb.worldTime() > t + 3, t0, { timeout: 40000 }).catch(() => {}); }
      await R3.evaluate(() => window.__bfb.setAxes(null));
      const v0 = await R3.evaluate(() => window.__bfb.move());
      ok(!inVip(v0), `DON BINNIE's boys keep you out at 7 aura (${v0.x.toFixed(1)},${v0.z.toFixed(1)})`);
      await R3.evaluate((v) => { window.__bfb.setAura(8); window.__bfb.teleportY(v.vipOut.x, v.y, v.vipOut.z, v.yaw); }, { vipOut: f.vipOut, y: f.y2, yaw: inYaw });
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction((z) => window.__bfb.move().z < z, f.vip.maxZ - 1.0, { timeout: 40000 }).catch(() => {});
      await R3.evaluate(() => window.__bfb.setAxes(null));
      const v1 = await R3.evaluate(() => window.__bfb.move());
      ok(inVip(v1), `at 8 aura you walk into his lounge (${v1.x.toFixed(1)},${v1.z.toFixed(1)})`);
      await R3.evaluate((v) => window.__bfb.camAt(v.maxX - 1.2, v.y + 1.9, v.maxZ - 0.5, -2.2, 0.12), { ...f.vip, y: f.y2 + 0.35 }); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r11-fever-binnie.png"); await R3.evaluate(() => { window.__bfb.camFree(); window.__bfb.setAura(0); });
      await R3.evaluate((s) => window.__bfb.teleportY(s.maxX + 0.6, s.y, (s.minZ + s.maxZ) / 2, -Math.PI / 2), { ...f.stairs2, y: f.y2 });
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      const upR = await R3.waitForFunction((y) => Math.abs(window.__bfb.move().y - y) < 0.2 && window.__bfb.move().grounded, f.roofY, { timeout: 60000 }).then(() => true, () => false);
      await R3.evaluate(() => window.__bfb.setAxes(null));
      ok(upR, `up to the roof (y ${(await R3.evaluate(() => window.__bfb.move().y)).toFixed(2)})`);
      // dance on the roof
      await sleep(500);
      await R3.keyboard.press("b");
      ok(await R3.waitForFunction(() => window.__bfb.move().danceT > 0, null, { timeout: 20000 }).then(() => true, () => false), "B: dancing");
      await R3.evaluate((p) => window.__bfb.camAt((p.minX + p.maxX) / 2, p.y + 2.4, p.minZ - 13, 0, 0.1), { ...f.pavilion, y: f.roofY }); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r11-fever-roof.png");
      await R3.evaluate((s) => window.__bfb.camAt(s.x - 5.5, s.y + 2.2, s.z - 6.5, 0.7, 0.14), { ...f.smoke, y: f.roofY }); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r113-fever-smokers.png"); await R3.evaluate(() => window.__bfb.camFree());
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 })); await sleep(800); await R3.evaluate(() => window.__bfb.setAxes(null));
      ok((await R3.evaluate(() => window.__bfb.move().danceT)) === 0, "moving stops the dance");
      // a mocktail at the bar
      const tap = (await R3.evaluate(() => window.__bfb.props())).find((p) => p.kind === "mocktail");
      await R3.evaluate((t) => { window.__bfb.teleportY(t.x, 0.25, t.z - 0.9, 0); window.__bfb.setPitch(0.35); }, tap);
      ok(await R3.waitForFunction(() => /mocktail/i.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `the bar's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.keyboard.press("e");
      ok(await R3.waitForFunction(() => window.__bfb.move().boostT > 30, null, { timeout: 30000 }).then(() => true, () => false), "a mocktail: dance energy");
      // R11.4: the restroom wing's door; the back EXIT under the stairs (out only) into the alley; SKETCHY STEVE's goods
      const doorOpen = (id) => R3.waitForFunction((i) => window.__bfb.props().find((p) => p.id === i)?.ready === false, id, { timeout: 30000 }).then(() => true, () => false);
      await R3.evaluate((w) => { window.__bfb.teleportY((w.minX + w.maxX) / 2, 0.25, w.maxZ + 0.9, Math.PI); window.__bfb.setPitch(0.1); }, f.wingDoor); // (R11.5: the door's on the wing's north end)
      ok(await R3.waitForFunction(() => /Open/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `the wing's door: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 30)}"`);
      await R3.keyboard.press("e");
      ok(await doorOpen("feverdoor_wing"), "E opens the restroom wing's door");
      const bdx = (f.backDoor.minX + f.backDoor.maxX) / 2;
      await R3.evaluate((v) => { window.__bfb.teleportY(v.x, 0.25, v.z, 0); window.__bfb.setPitch(0.1); }, { x: bdx, z: f.rect.maxZ - 1.0 });
      ok(await R3.waitForFunction(() => /EXIT/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `under the stairs: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.keyboard.press("e");
      ok(await doorOpen("feverdoor_exit"), "E pushes the EXIT open");
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction((z) => window.__bfb.move().z > z, f.rect.maxZ + 1.5, { timeout: 40000 }).catch(() => {});
      await R3.evaluate(() => window.__bfb.setAxes(null));
      ok((await R3.evaluate(() => window.__bfb.move().z)) > f.rect.maxZ + 1, "out into the back alley");
      await R3.waitForFunction(() => window.__bfb.props().find((p) => p.id === "feverdoor_exit")?.ready === true, null, { timeout: 40000 }).catch(() => {});
      await R3.evaluate((v) => { window.__bfb.teleportY(v.x, 0.2, v.z, Math.PI); window.__bfb.setPitch(0.1); }, { x: bdx, z: f.rect.maxZ + 0.8 });
      ok(await R3.waitForFunction(() => /EXIT ONLY/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `from the alley: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      const goods = (await R3.evaluate(() => window.__bfb.props())).filter((p) => p.kind === "dealgoods");
      ok(goods.length === 3, "SKETCHY STEVE's three goods on his crate");
      await R3.evaluate(() => window.__bfb.setCash(60));
      for (const [k, key, name] of [["deal_zoomies", "speedT", "ZOOMIES"], ["deal_floaty", "floatT", "FLOATY"]]) {
        const g = goods.find((p) => p.id === k);
        await R3.evaluate((g) => { window.__bfb.teleportY(g.x - 0.75, 0.2, g.z, Math.PI / 2); window.__bfb.setPitch(0.55); }, g);
        ok(await R3.waitForFunction((n) => new RegExp(n).test(window.__bfb.promptText()), name, { timeout: 30000 }).then(() => true, () => false), `Steve's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
        await R3.keyboard.press("e");
        ok(await R3.waitForFunction((kk) => window.__bfb.move()[kk] > 2, key, { timeout: 30000 }).then(() => true, () => false), `bought ${name}: it kicks in`);
      }
      await R3.evaluate((d) => window.__bfb.camAt(d.x - 3.4, 1.7, d.z - 0.3, Math.PI / 2 - 0.08, 0.1), f.dealer); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r114-fever-steve.png"); await R3.evaluate(() => window.__bfb.camFree());
      await R3.evaluate((o) => window.__bfb.camAt(o.x - 9, 2.0, o.z - 9, Math.PI / 4, -0.08), f.out); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r11-fever-outside.png"); await R3.evaluate(() => { window.__bfb.camFree(); window.__bfb.forceNight(false); });
    }
  }
  // R12.1: THE SOGGY SHAMROCK: walk in from the crossroads, a pint at the tap, split the G (hold, let go), the session's on
  {
    const pb = await R3.evaluate(() => window.__bfb.pub());
    ok(!!pb, "THE SOGGY SHAMROCK is in the new city");
    if (pb) {
      await R3.evaluate(() => window.__bfb.forceNight(false));
      await R3.evaluate((o) => { window.__bfb.teleportY(o.x, 0.2, o.z, o.yaw); window.__bfb.setPitch(0.05); }, pb.out);
      await sleep(600);
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction(() => (window.__bfb.pubInfo()?.level2 ?? 0) === 1, null, { timeout: 40000 }).catch(() => {});
      await R3.evaluate(() => window.__bfb.setAxes(null));
      ok((await R3.evaluate(() => window.__bfb.pubInfo()?.level2)) === 1, "walked in the front door (in the cut corner)");
      // R12.1b: and the side door, off the side street
      await R3.evaluate((o) => { window.__bfb.teleportY(o.x, 0.2, o.z, o.yaw); window.__bfb.setPitch(0.05); }, pb.out2);
      ok(await R3.waitForFunction(() => window.__bfb.pubInfo()?.level2 === 0, null, { timeout: 15000 }).then(() => true, () => false), "outside the side door"); // (R12.1b: waits: with lag the teleport lands a moment later)
      await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
      await R3.waitForFunction((z) => window.__bfb.move().z > z, pb.door2.maxZ + 1.5, { timeout: 40000 }).catch(() => {});
      await R3.evaluate(() => window.__bfb.setAxes(null));
      ok((await R3.evaluate(() => window.__bfb.pubInfo()?.level2)) === 1, "walked in the side door");
      const tap = pb.taps[0];
      await R3.evaluate((t) => { window.__bfb.teleportY(t.x + t.face[0] * 0.85, 0.25, t.z + t.face[1] * 0.85, Math.atan2(-t.face[0], -t.face[1])); window.__bfb.setPitch(0.45); }, tap);
      ok(await R3.waitForFunction(() => /GUZZLE/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `the tap's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
      await R3.evaluate(() => window.__bfb.setCash(40));
      await R3.keyboard.press("e");
      ok(await R3.waitForFunction(() => window.__bfb.pubInfo()?.open, null, { timeout: 30000 }).then(() => true, () => false), "a pint: the close-up's up (SPLIT THE G)");
      const st = await R3.evaluate(() => window.__bfb.pubInfo());
      ok(st && st.rate > 0.05 && st.level > 0.8, `a full pint, its own gulp rate (${st?.rate}, line at ${st?.level?.toFixed(2)})`);
      await sleep(1200); await hideOverlays(R3);
      await shot(R3, "r121-pint.png");
      // hold (the line drops), let go about where the G is
      await R3.evaluate(() => window.__bfb.pintPress(true));
      await R3.waitForFunction(() => (window.__bfb.pubInfo()?.level ?? 1) < 0.66, null, { timeout: 30000 }).catch(() => {});
      const mid = await R3.evaluate(() => window.__bfb.pubInfo());
      ok(mid.holding && mid.level < 0.7, `gulping: the line's dropping (${mid.level.toFixed(2)})`);
      ok(!mid.gShown, "R12.2c: drinking, you can't see the G (it's on the far side)");
      await hideOverlays(R3); await shot(R3, "r122c-pint-drinking.png");
      await R3.evaluate(() => window.__bfb.pintPress(false));
      ok(await R3.waitForFunction(() => /G!|Close|Missed/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false), "the verdict comes back");
      ok(await R3.waitForFunction(() => window.__bfb.pubInfo()?.gShown, null, { timeout: 10000 }).then(() => true, () => false), "R12.2c: then the glass turns round and there's the G");
      await hideOverlays(R3); await shot(R3, "r122c-pint-reveal.png");
      ok(await R3.waitForFunction(() => window.__bfb.move().pints === 1 && window.__bfb.move().tipsyT > 30, null, { timeout: 30000 }).then(() => true, () => false), "one pint in you (the sober-up timer's running)");
      { const pi = await R3.evaluate(() => window.__bfb.pubInfo()); ok(pi.gain > 0.4, `the session's loud in here (gain ${pi.gain.toFixed(2)}; audio running: ${pi.music})`); }
      const npcs = await R3.evaluate(() => { const out = {}; for (const n of window.__bfb.npcs()) out[n.kind] = (out[n.kind] ?? 0) + 1; return out; });
      ok(npcs.barman === 1 && npcs.regular === 2 && npcs.trad_band === 4, `Fergal, the two regulars, the four-piece band (${JSON.stringify({ b: npcs.barman, r: npcs.regular, t: npcs.trad_band })})`);
      await R3.evaluate((b) => window.__bfb.camAt(b.maxX + 4.0, 1.7, b.minZ - 3.5, -0.9, 0.06), pb.bar); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r121-pub-bar.png");
      await R3.evaluate((s) => window.__bfb.camAt(s.minX - 5.5, 1.8, s.minZ - 4.5, 0.75, 0.05), pb.stage); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r121-pub-session.png");
      await R3.evaluate((o) => window.__bfb.camAt(o.x + 7, 2.3, o.z - 7, -Math.PI / 4, 0.0), pb.out); await sleep(2500); await hideOverlays(R3);
      await shot(R3, "r121-pub-outside.png"); await R3.evaluate(() => window.__bfb.camFree());
      // R12.2b: upstairs: up the stairs, a pint at the island bar (Róisín), the jukebox (E: the next tune), the darts booths
      // and the pool tables you can walk up to, MAMMY MOLONEY, the balcony; the céilí's gone; nobody's got a chest square
      {
        const st2 = pb.stairs, y2 = pb.y2;
        await R3.evaluate((s) => { window.__bfb.teleportY(s.maxX + 0.6, 0.25, (s.minZ + s.maxZ) / 2, -Math.PI / 2); window.__bfb.setPitch(0.1); }, st2);
        await sleep(800);
        await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
        const upOk = await R3.waitForFunction((y) => window.__bfb.move().y > y - 0.3, y2, { timeout: 40000 }).then(() => true, () => false);
        await R3.evaluate(() => window.__bfb.setAxes(null));
        ok(upOk, `walked up the stairs (y ${(await R3.evaluate(() => window.__bfb.move().y)).toFixed(2)}, the floor's at ${y2})`);
        ok(await R3.waitForFunction(() => window.__bfb.pubInfo()?.level2 === 2, null, { timeout: 20000 }).then(() => true, () => false), "upstairs (level 2)");
        const npc2 = await R3.evaluate(() => { const out = {}; for (const n of window.__bfb.npcs()) out[n.kind] = (out[n.kind] ?? 0) + 1; return out; });
        ok(npc2.barmaid === 1 && npc2.leprechaun === 1 && npc2.lep_buddy === 6 && npc2.drunk_dancer === 1 && !npc2.mammy && !npc2.ceili_band && npc2.patron === 12, `Róisín, Seamus O'Shortly and his 6 lads, Big Dessie, 12 drinkers, no Mammy, no céilí folk (${JSON.stringify({ r: npc2.barmaid, s: npc2.leprechaun, b: npc2.lep_buddy, d: npc2.drunk_dancer, m: npc2.mammy ?? 0, p: npc2.patron })})`);
        // a pint at the island bar
        const tap2 = pb.taps.find((t) => t.y > y2);
        await R3.evaluate((t) => { window.__bfb.teleportY(t.x + t.face[0] * 0.85, t.y - 1.1 + 0.25, t.z + t.face[1] * 0.85, Math.atan2(-t.face[0], -t.face[1])); window.__bfb.setPitch(0.45); }, tap2);
        ok(await R3.waitForFunction(() => /GUZZLE/.test(window.__bfb.promptText()), null, { timeout: 30000 }).then(() => true, () => false), `the island bar's tap: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
        await R3.evaluate(() => window.__bfb.setCash(40));
        let open2 = false; // (one pint at a time: the one downstairs was poured under 30 s ago, so it may say "finish that first")
        for (let k = 0; k < 6 && !open2; k++) { await R3.keyboard.press("e"); open2 = await R3.waitForFunction(() => window.__bfb.pubInfo()?.open, null, { timeout: 8000 }).then(() => true, () => false); }
        ok(open2, "a pint upstairs: the close-up's up");
        await R3.evaluate(() => window.__bfb.pintPress(true)); await sleep(1500); await R3.evaluate(() => window.__bfb.pintPress(false));
        ok(await R3.waitForFunction(() => /G!|Close|Missed/.test(document.body.innerText), null, { timeout: 30000 }).then(() => true, () => false), "split the G upstairs: the verdict comes back");
        await sleep(3000);
        // the jukebox
        const jb = pb.jukebox;
        await R3.evaluate((o) => { window.__bfb.teleportY(o.x, o.y + 0.25, o.z - 1.1, 0); window.__bfb.setPitch(0.2); }, { ...jb, y: y2 });
        ok(await R3.waitForFunction(() => /Jukebox/.test(window.__bfb.promptText()), null, { timeout: 20000 }).then(() => true, () => false), `the jukebox's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 50)}"`);
        const t0 = await R3.evaluate(() => window.__bfb.pubInfo().jukeTune);
        await R3.keyboard.press("e");
        ok(await R3.waitForFunction((k) => window.__bfb.pubInfo().jukeTune !== k, t0, { timeout: 20000 }).then(() => true, () => false), `E: the next tune (${t0} -> ${await R3.evaluate(() => window.__bfb.pubInfo().jukeTune)}; ${await R3.evaluate(() => window.__bfb.pubInfo().evTail)})`);
        { const pi = await R3.evaluate(() => window.__bfb.pubInfo()); ok(pi.jukeGain > 0.5 && pi.gain < 0.4, `upstairs the jukebox is loud (${pi.jukeGain.toFixed(2)}), the jig's through the floor (${pi.gain.toFixed(2)}; audio running: ${pi.juke})`); }
        await hideOverlays(R3); await shot(R3, "r122b-jukebox.png");
        // the darts booths and the pool tables: walk up to them (on the oche, beside each table)
        for (const [i, d] of pb.darts.entries()) {
          await R3.evaluate((o) => { window.__bfb.teleportY(o.x, o.y + 0.25, o.z, -Math.PI / 2); window.__bfb.setPitch(0.0); }, { x: d.oche + 0.4, y: y2, z: d.board.z });
          await sleep(1500);
          const mv = await R3.evaluate(() => window.__bfb.move());
          ok(Math.abs(mv.y - y2) < 0.4 && Math.abs(mv.x - (d.oche + 0.4)) < 0.5, `standing on oche ${i + 1} (${mv.x.toFixed(1)}, ${mv.y.toFixed(2)}, ${mv.z.toFixed(1)})`);
        }
        await hideOverlays(R3); await shot(R3, "r122b-oche-view.png");
        for (const [i, q] of pb.pools.entries()) {
          await R3.evaluate((o) => { window.__bfb.teleportY(o.x, o.y + 0.25, o.z, Math.PI / 2); }, { x: q.x - q.w / 2 - 0.7, y: y2, z: q.z });
          await sleep(1200);
          const mv = await R3.evaluate(() => window.__bfb.move());
          ok(Math.abs(mv.y - y2) < 0.4 && Math.abs(mv.x - (q.x - q.w / 2 - 0.7)) < 0.5, `beside pool table ${i + 1} (${mv.x.toFixed(1)}, ${mv.z.toFixed(1)})`);
        }
        // R12.2c: SEAMUS O'SHORTLY
        const m = pb.seamus, mx = m.x + Math.sin(m.yaw) * 1.5, mz = m.z + Math.cos(m.yaw) * 1.5;
        await R3.evaluate((o) => { window.__bfb.teleportY(o.x, o.y + 0.25, o.z, o.yaw + Math.PI); window.__bfb.setPitch(0.35); }, { x: mx, y: y2, z: mz, yaw: m.yaw });
        ok(await R3.waitForFunction(() => /Seamus/.test(window.__bfb.promptText()), null, { timeout: 20000 }).then(() => true, () => false), `Seamus's prompt: "${(await R3.evaluate(() => window.__bfb.promptText())).slice(0, 40)}"`);
        await R3.keyboard.press("e");
        ok(await R3.waitForFunction(() => /SEAMUS O'SHORTLY:/.test(document.body.innerText), null, { timeout: 20000 }).then(() => true, () => false), "a word with Seamus (he's after something, for a pot of gold)");
        await R3.evaluate((o) => window.__bfb.camAt(o.x + Math.sin(o.yaw) * 2.4, o.y + 1.1, o.z + Math.cos(o.yaw) * 2.4, o.yaw + Math.PI, 0.18), { ...m, y: y2 }); await sleep(2500); await hideOverlays(R3);
        await shot(R3, "r122c-seamus.png"); await R3.evaluate(() => window.__bfb.camFree());
        // R12.2c: walk into a round booth, up to its table
        { const rb = pb.roundBooths[0];
          await R3.evaluate((o) => window.__bfb.teleportY(o.x, o.y + 0.25, o.z, Math.PI / 2), { x: rb.x - rb.r - 0.6, y: y2, z: rb.z }); await sleep(1200);
          await R3.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
          const inOk = await R3.waitForFunction((x) => window.__bfb.move().x > x, rb.x - 0.9, { timeout: 20000 }).then(() => true, () => false);
          await R3.evaluate(() => window.__bfb.setAxes(null));
          ok(inOk, `walked into a round booth, up to its table (x ${(await R3.evaluate(() => window.__bfb.move().x)).toFixed(1)}, the table at ${rb.x.toFixed(1)})`); }
        // the balcony: stand on it
        const bal = pb.balcony[1], bx = (bal.minX + bal.maxX) / 2, bz = (bal.minZ + bal.maxZ) / 2;
        await R3.evaluate((o) => window.__bfb.teleportY(o.x, o.y + 0.3, o.z, 0), { x: bx, y: y2, z: bz });
        await sleep(2500);
        { const mv = await R3.evaluate(() => window.__bfb.move()); ok(Math.abs(mv.y - y2) < 0.5, `standing on the balcony (y ${mv.y.toFixed(2)})`); }
        // B upstairs: just the ordinary dance now
        await R3.evaluate((o) => window.__bfb.teleportY(o.x, o.y + 0.25, o.z, 0), { x: -80.0, y: y2, z: 16.4 });
        await sleep(1500);
        ok(!/c[ée]il[ií]/i.test(await R3.evaluate(() => window.__bfb.promptText())), "no céilí prompt anywhere upstairs");
        // R12.2c: BIG DESSIE in front of the band; punch him and Seamus's lads swarm you (they pop out round you, downstairs)
        { const d = pb.dancer;
          await R3.evaluate((o) => window.__bfb.camAt(o.x - 3.2, 1.7, o.z - 2.6, 0.9, 0.08), d); await sleep(2500); await hideOverlays(R3);
          await shot(R3, "r122c-dessie.png"); await R3.evaluate(() => window.__bfb.camFree());
          await R3.evaluate((o) => { window.__bfb.teleportY(o.x - 1.2, 0.25, o.z, Math.PI / 2); window.__bfb.setPitch(0.15); }, d);
          const saw = await R3.waitForFunction(() => window.__bfb.punchTarget()?.kind === "drunk_dancer", null, { timeout: 15000 }).then(() => true, () => false);
          ok(saw, "facing Big Dessie (punch target)");
          const vp = R3.viewportSize() ?? { width: 800, height: 450 };
          await R3.mouse.click(vp.width / 2, vp.height / 2);
          ok(await R3.waitForFunction(() => /lepSwarm\*/.test(window.__bfb.pubInfo()?.evTail ?? ""), null, { timeout: 20000 }).then(() => true, () => false), `the swarm's on (${await R3.evaluate(() => window.__bfb.pubInfo()?.evTail)})`);
          ok(await R3.waitForFunction(() => { const me = window.__bfb.move(); return window.__bfb.npcs().filter((n) => n.kind === "lep_buddy" && Math.abs(n.y - me.y) < 1.5 && Math.hypot(n.x - me.x, n.z - me.z) < 5).length >= 3; }, null, { timeout: 20000 }).then(() => true, () => false), "the lads are round you (downstairs)");
          await sleep(1500); await hideOverlays(R3); await shot(R3, "r122c-swarm.png");
          ok(await R3.waitForFunction(() => /lepSwarm\*,?$/.test(window.__bfb.pubInfo()?.evTail ?? "") && (window.__bfb.pubInfo()?.evTail ?? "").split("lepSwarm*").length >= 3, null, { timeout: 60000 }).then(() => true, () => false), "the swarm ends (8 s)");
          await sleep(3000); }
        // the shots: the island bar (day, night), the darts booths, the pool area, the lounge, Mammy's snug, the balcony
        const B2 = pb.bar2, bxm = (B2.minX + B2.maxX) / 2, bzm = (B2.minZ + B2.maxZ) / 2;
        const shots2 = [
          ["r122b-bar.png", { x: bxm + 6.5, y: y2 + 2.0, z: bzm - 5.5, yaw: -0.85, pitch: 0.12 }],
          ["r122b-darts.png", { x: pb.darts[0].oche + 4.6, y: y2 + 1.75, z: pb.darts[0].board.z + 2.2, yaw: -Math.PI / 2 - 0.35, pitch: 0.05 }],
          ["r122b-darts-booth.png", { x: pb.darts[1].oche + 2.6, y: y2 + 1.6, z: pb.darts[1].board.z, yaw: -Math.PI / 2, pitch: 0.0 }],
          ["r122b-pool.png", { x: -79.2, y: y2 + 2.1, z: 23.0, yaw: 0, pitch: 0.32 }],
          ["r122b-lounge.png", { x: -84.0, y: y2 + 1.7, z: 9.5, yaw: 0.7, pitch: 0.1 }],
          ["r122b-fire.png", { x: pb.fire2.x + 0.3, y: y2 + 1.6, z: pb.fire2.z - 5.0, yaw: 0, pitch: 0.05 }],
          ["r122c-seamus-snug.png", { x: m.x + Math.sin(m.yaw) * 2.6, y: y2 + 1.5, z: m.z + Math.cos(m.yaw) * 2.6, yaw: m.yaw + Math.PI, pitch: 0.12 }],
        ];
        for (const [name, c] of shots2) { await R3.evaluate((o) => window.__bfb.camAt(o.x, o.y, o.z, o.yaw, o.pitch), c); await sleep(2500); await hideOverlays(R3); await shot(R3, name); }
        // the drinkers and Róisín close up (no chest squares)
        await R3.evaluate((o) => window.__bfb.camAt(o.x, o.y + 1.5, o.z - 2.2, 0, 0.12), { x: pb.barmaid.x, y: y2, z: pb.barmaid.z - 1.2 }); await sleep(2000); await hideOverlays(R3);
        await shot(R3, "r122b-roisin.png");
        await R3.evaluate(() => window.__bfb.forceNight(true));
        await R3.evaluate((c) => window.__bfb.camAt(c.x, c.y, c.z, c.yaw, c.pitch), shots2[0][1]); await sleep(3000); await hideOverlays(R3);
        await shot(R3, "r122b-bar-night.png");
        await R3.evaluate((c) => window.__bfb.camAt(c.x, c.y, c.z, c.yaw, c.pitch), shots2[1][1]); await sleep(2500); await hideOverlays(R3);
        await shot(R3, "r122b-darts-night.png");
        await R3.evaluate((o) => window.__bfb.camAt(o.x + 9, 2.0, o.z - 9, -Math.PI / 4, -0.2), pb.out); await sleep(3000); await hideOverlays(R3);
        await shot(R3, "r122b-balcony-night.png");
        await R3.evaluate(() => { window.__bfb.forceNight(false); window.__bfb.camFree(); });
      }
    }
  }
  ok(r3errs.length === 0, `new city: no JS errors${r3errs.length ? " -> " + r3errs.slice(0, 3).join(" | ") : ""}`);
  await R3.context().close();

} catch (e) {
  ok(false, "test crashed: " + (e?.stack ?? e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
}
