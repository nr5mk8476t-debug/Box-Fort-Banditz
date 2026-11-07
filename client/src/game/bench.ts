// R12.5 (Blake: "FPS is becoming noticeably worse... particularly around the Soggy Shamrock"): the BENCHMARK. The same
// route every time (fort 1 → the first road → along the pub's front → the door → downstairs → up the stairs → pool and
// darts → the balcony → back out), stationary views by day and again by night, and a result to copy and send.
//
// What it measures, per stretch of the route:
// - frame times (from the render loop's own clock): median, 95th and 99th percentile, the worst frame, how many frames
//   took over 50 ms and over 100 ms, and the "1% low" FPS (1000 / the mean of the slowest 1% of frames, at least one)
// - the main thread's work per frame, split by part: the game update, the World step (solo), applying the World, the
//   render call (the CPU side of drawing: culling, sorting, WebGL calls; NOT the GPU's time), the HUD
// - the GPU's own time per frame, only where the browser offers timer queries (most don't: then it says so)
// - draw calls, active meshes, triangles drawn, lights and shadow casters, the JS heap (Chrome only) and its drops
//   (most likely garbage collections), the host's World ticks and the network messages (hosting / joining)
// Everything is collected in preallocated arrays; nothing is measured when the benchmark isn't running.
import type { Scene, Engine, AbstractMesh } from "./babylon.ts";
import type { ArenaLayout } from "@bfb/shared";

/** the parts of one frame (ms) as main.ts timed them */
export interface FrameParts { update: number; world: number; apply: number; render: number; hud: number; total: number }

/** costs measured outside the frame (hosting: the World's ticks; joining: the network messages) */
const side = { hostMs: 0, hostTicks: 0, netMs: 0, netMsgs: 0, netBytes: 0 };
let running: Bench | null = null;
/** hostRoom: one World tick (or several) took `ms` */
export function benchHostTick(ms: number, ticks: number) { if (running) { side.hostMs += ms; side.hostTicks += ticks; } }
/** peerRoom: a message from the host took `ms` to read and apply */
export function benchNet(ms: number, bytes: number) { if (running) { side.netMs += ms; side.netMsgs++; side.netBytes += bytes; } }
export function benchRunning() { return !!running; }

export interface BenchCtx {
  scene: Scene; engine: Engine; arena: ArenaLayout; canvas: HTMLCanvasElement;
  mode: "solo" | "hosting" | "joining"; players: () => number; npcs: () => number; cars: () => number;
  setCam: (c: { x: number; y: number; z: number; yaw: number; pitch: number } | null) => void;
  setNight: (on: boolean) => void;
  /** solo only: move the player with the camera (so what's near the player is what's near the camera) */
  teleport?: (x: number, y: number, z: number, yaw: number) => void;
  /** solo only: start a pool game and a darts game against the pub's regulars (so the games are live upstairs) */
  startGames?: () => void; gamesActive?: () => string;
  settings: Record<string, unknown>; build: string; pubSeen: () => boolean;
  status: (s: string) => void;
}

type Cam = { x: number; y: number; z: number; yaw: number; pitch: number };
interface Leg { name: string; night: boolean; secs: number; at: (k: number) => Cam; walk?: boolean; games?: boolean }

const look = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
const still = (c: Cam) => () => c;
/** a walk along waypoints at 5 m/s (the camera faces where it's going) */
function walk(pts: [number, number, number][]) {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[2] - pts[i][2]) + Math.abs(p[1] - pts[i][1]));
  const L = seg.reduce((a, b) => a + b, 0);
  return { secs: L / 5, at: (k: number): Cam => {
    let d = k * L, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = pts[i], b = pts[i + 1], f = seg[i] > 0 ? Math.min(1, d / seg[i]) : 1;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, yaw: look(a[0], a[2], b[0], b[2]), pitch: 0.02 };
  } };
}

/** the route (the new city; the classic city has no pub: the benchmark says so) */
export function benchRoute(A: ArenaLayout): Leg[] {
  const P = A.pub; if (!P) return [];
  const y1 = P.y1 + 1.7, y2 = P.y2 + 1.7, R = P.rect, D = P.door, dc = { x: (D.minX + D.maxX) / 2, z: (D.minZ + D.maxZ) / 2 };
  const T1 = P.pools[0], T2 = P.pools[1] ?? T1, O1 = P.darts[0], B = P.balcony[0], st = P.stairs;
  const sp = A.spawns[0];
  const views: [string, Cam][] = [
    ["pub from across the road", { x: -60.5, y: 1.7, z: -3, yaw: look(-60.5, -3, dc.x, dc.z + 3), pitch: -0.14 }],
    ["the entrance", { x: P.out.x + 2.2, y: 1.7, z: P.out.z - 2.6, yaw: look(P.out.x + 2.2, P.out.z - 2.6, dc.x, dc.z), pitch: -0.05 }],
    ["downstairs: the bar", { x: -79.5, y: y1, z: 17.5, yaw: -Math.PI / 2 - 0.15, pitch: 0.06 }],
    ["downstairs: out of the window", { x: R.maxX - 2.2, y: y1 - 0.1, z: 19.8, yaw: Math.PI / 2, pitch: 0.02 }],
    ["downstairs: the fireside", { x: -83.5, y: y1, z: 25.5, yaw: look(-83.5, 25.5, P.fire.x, P.fire.z), pitch: 0.08 }],
    ["upstairs: pool", { x: (T1.x + T2.x) / 2, y: y2, z: T1.z - T1.d / 2 - 2.6, yaw: 0, pitch: 0.2 }],
    ["upstairs: darts", { x: O1.oche + 3.5, y: y2 + 0.1, z: O1.board.z + 4, yaw: -Math.PI / 2 - 0.6, pitch: 0.12 }],
    ["balcony: out at the city", { x: (B.minX + B.maxX) / 2, y: y2, z: (B.minZ + B.maxZ) / 2, yaw: Math.PI, pitch: -0.05 }],
    ["balcony: along the front", { x: B.minX + 1, y: y2, z: (B.minZ + B.maxZ) / 2, yaw: Math.PI / 2, pitch: 0 }],
    ["city street", { x: -50, y: 1.7, z: -2, yaw: Math.PI / 2, pitch: 0.02 }],
  ];
  const approach = walk([[sp.x, 1.7, sp.z], [sp.x, 1.7, -89], [-109, 1.7, -89], [-109, 1.7, 0], [-80, 1.7, 0], [P.out.x + 1.5, 1.7, P.out.z - 1.5]]);
  const inside = walk([[P.out.x, 1.7, P.out.z], [dc.x - 2, y1, dc.z + 2], [-90, y1, 27], [st.maxX + 0.5, y1, (st.minZ + st.maxZ) / 2], [st.minX - 0.5, y2, (st.minZ + st.maxZ) / 2], [(T1.x + T2.x) / 2, y2, T1.z - T1.d / 2 - 2.6]]);
  const out = walk([[(B.minX + B.maxX) / 2, y2, (B.minZ + B.maxZ) / 2], [st.minX - 0.5, y2, (st.minZ + st.maxZ) / 2], [st.maxX + 0.5, y1, (st.minZ + st.maxZ) / 2], [dc.x - 2, y1, dc.z + 2], [P.out.x, 1.7, P.out.z], [-66, 1.7, -8]]);
  const day: Leg[] = [
    { name: "walk: fort → first road → the pub (first approach)", night: false, ...approach, walk: true },
    ...views.slice(0, 5).map(([n, c]) => ({ name: n, night: false, secs: 4, at: still(c) })),
    { name: "walk: in, up the stairs", night: false, ...inside, walk: true },
    ...views.slice(5, 7).map(([n, c]) => ({ name: n, night: false, secs: 5, at: still(c), games: true })),
    ...views.slice(7, 9).map(([n, c]) => ({ name: n, night: false, secs: 4, at: still(c) })),
    { name: "walk: back down and out", night: false, ...out, walk: true },
    { name: views[9][0], night: false, secs: 4, at: still(views[9][1]) },
  ];
  const night: Leg[] = views.map(([n, c]) => ({ name: n, night: true, secs: 4, at: still(c), games: n.startsWith("upstairs") }));
  return [...day, ...night];
}

const MAXF = 20000;
class Bench {
  ft = new Float32Array(MAXF); parts = new Float32Array(MAXF * 5); dc = new Float32Array(MAXF); am = new Float32Array(MAXF); tri = new Float32Array(MAXF); heap = new Float32Array(MAXF); gpu = new Float32Array(MAXF);
  n = 0; leg = 0; t = 0; settle = 0; legStart = 0; prevDraw = 0; prevHeap = 0;
  results: Record<string, unknown>[] = [];
  side0 = { ...side };
  constructor(public ctx: BenchCtx, public legs: Leg[], public gpuTimer: { get: () => number } | null) {}
}

function pct(a: number[], p: number) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }
const r1 = (v: number) => Math.round(v * 10) / 10;

/** what the browser says about the machine (the GPU's name only where the browser shares it) */
export function machineInfo(engine: Engine, canvas: HTMLCanvasElement) {
  const gl = (engine as unknown as { _gl?: WebGLRenderingContext })._gl;
  let gpu = "unknown (the browser doesn't say)";
  try { const ext = gl?.getExtension("WEBGL_debug_renderer_info"); if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); } catch { /* hidden */ }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  return {
    gpu, cpuThreads: nav.hardwareConcurrency ?? 0, memoryGB: nav.deviceMemory ?? "unknown", browser: nav.userAgent, os: nav.userAgentData?.platform ?? nav.platform,
    window: `${innerWidth}×${innerHeight}`, canvasCss: `${canvas.clientWidth}×${canvas.clientHeight}`, render: `${engine.getRenderWidth()}×${engine.getRenderHeight()}`,
    devicePixelRatio: devicePixelRatio, hardwareScaling: engine.getHardwareScalingLevel(), webgl: engine.webGLVersion,
  };
}

/** start the benchmark (resolves with the report, or null when cancelled) */
export async function runBench(ctx: BenchCtx): Promise<{ text: string; json: string } | null> {
  if (running) return null;
  const legs = benchRoute(ctx.arena);
  if (!legs.length) { ctx.status("The benchmark needs the new city (it has THE SOGGY SHAMROCK)."); return null; }
  // the GPU's own frame time: only with timer queries (EXT_disjoint_timer_query); most browsers turn them off
  let gpuTimer: { get: () => number; dispose: () => void } | null = null;
  try {
    if ((ctx.engine.getCaps() as { timerQuery?: unknown }).timerQuery) {
      await import("@babylonjs/core/Engines/Extensions/engine.query.js");
      const { EngineInstrumentation } = await import("@babylonjs/core/Instrumentation/engineInstrumentation.js");
      const ins = new EngineInstrumentation(ctx.engine); ins.captureGPUFrameTime = true;
      gpuTimer = { get: () => ins.gpuFrameTimeCounter.lastSecAverage * 1e-6, dispose: () => ins.dispose() };
    }
  } catch { gpuTimer = null; }
  const b = new Bench(ctx, legs, gpuTimer);
  const pubSeen = ctx.pubSeen();
  if (ctx.mode === "solo" && ctx.startGames) try { ctx.startGames(); } catch { /* games are a bonus */ }
  side.hostMs = side.hostTicks = side.netMs = side.netMsgs = side.netBytes = 0;
  running = b;
  b.legStart = 0; b.settle = 1.0; enter(b);
  const done = await new Promise<boolean>((res) => { finish = res; });
  finish = null; running = null;
  ctx.setCam(null); ctx.setNight(false); gpuTimer?.dispose();
  if (!done) return null;
  return report(b, pubSeen);
}
let finish: ((ok: boolean) => void) | null = null;
export function cancelBench() { finish?.(false); }

function enter(b: Bench) {
  const L = b.legs[b.leg];
  b.ctx.setNight(L.night);
  const c = L.at(0); b.ctx.setCam(c); b.ctx.teleport?.(c.x, c.y - 1.7, c.z, c.yaw);
  b.t = 0; b.settle = L.walk ? 0.4 : 1.2; b.legStart = b.n;
  b.ctx.status(`BENCHMARK ${b.leg + 1}/${b.legs.length}: ${L.name}${L.night ? " (night)" : ""}. ESC cancels.`);
}

/** main.ts calls this every frame while the benchmark runs */
export function benchFrame(dt: number, p: FrameParts, scene: Scene) {
  const b = running; if (!b) return;
  const L = b.legs[b.leg];
  if (b.settle > 0) { b.settle -= dt; b.prevDraw = drawCount(scene); return; } // (the first moment of a still view isn't counted: the camera's just jumped)
  b.t += dt;
  const k = Math.min(1, b.t / L.secs), c = L.at(k);
  b.ctx.setCam(c); if (L.walk) b.ctx.teleport?.(c.x, c.y - 1.7, c.z, c.yaw);
  if (b.n < MAXF) {
    const i = b.n++;
    b.ft[i] = dt * 1000;
    b.parts[i * 5] = p.update; b.parts[i * 5 + 1] = p.world; b.parts[i * 5 + 2] = p.apply; b.parts[i * 5 + 3] = p.render; b.parts[i * 5 + 4] = p.hud;
    const d = drawCount(scene); b.dc[i] = d - b.prevDraw; b.prevDraw = d;
    b.am[i] = scene.getActiveMeshes().length; b.tri[i] = scene.getActiveIndices() / 3;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    b.heap[i] = mem ? mem.usedJSHeapSize / 1048576 : -1;
    b.gpu[i] = b.gpuTimer ? b.gpuTimer.get() : -1;
  }
  if (k >= 1) {
    b.results.push(summarise(b, L, scene));
    b.leg++;
    if (b.leg >= b.legs.length) { finish?.(true); return; }
    enter(b);
  }
}
const drawCount = (scene: Scene) => (scene.getEngine() as unknown as { _drawCalls?: { current: number } })._drawCalls?.current ?? 0;

function summarise(b: Bench, L: Leg, scene: Scene) {
  const i0 = b.legStart, i1 = b.n, ft = Array.from(b.ft.subarray(i0, i1));
  const mean = (a: Float32Array, k = 1, o = 0) => { let s = 0, n = 0; for (let i = i0; i < i1; i++) { s += a[i * k + o]; n++; } return n ? s / n : 0; };
  const slow = [...ft].sort((x, y) => y - x), n1 = Math.max(1, Math.round(ft.length * 0.01));
  const low1 = 1000 / (slow.slice(0, n1).reduce((a, v) => a + v, 0) / n1);
  // heap drops between frames over 1 MB: most likely garbage collections (Chrome only)
  let drops = 0, dropMB = 0; for (let i = i0 + 1; i < i1; i++) { const d = b.heap[i - 1] - b.heap[i]; if (b.heap[i] >= 0 && d > 1) { drops++; dropMB += d; } }
  const act = scene.getActiveMeshes(); let lmax = 0, lsum = 0;
  for (let i = 0; i < act.length; i++) { const m = act.data[i] as AbstractMesh; const n = m.lightSources?.length ?? 0; lmax = Math.max(lmax, n); lsum += n; }
  let casters = 0; for (const l of scene.lights) { const g = l.getShadowGenerator(); const rl = g?.getShadowMap()?.renderList; if (rl) casters += rl.length; }
  const gpuOk = b.gpu[i0] >= 0;
  return {
    leg: L.name, night: L.night, frames: ft.length, secs: r1(L.secs),
    medianMs: r1(pct(ft, 0.5)), p95Ms: r1(pct(ft, 0.95)), p99Ms: r1(pct(ft, 0.99)), maxMs: r1(slow[0] ?? 0), low1Fps: r1(low1), fps: r1(ft.length / Math.max(1e-6, ft.reduce((a, v) => a + v, 0) / 1000)),
    over50: ft.filter((v) => v > 50).length, over100: ft.filter((v) => v > 100).length,
    cpu: { update: r1(mean(b.parts, 5, 0)), world: r1(mean(b.parts, 5, 1)), apply: r1(mean(b.parts, 5, 2)), renderCall: r1(mean(b.parts, 5, 3)), hud: r1(mean(b.parts, 5, 4)) },
    gpuMs: gpuOk ? r1(mean(b.gpu)) : "unavailable",
    drawCalls: Math.round(mean(b.dc)), activeMeshes: Math.round(mean(b.am)), triangles: Math.round(mean(b.tri)),
    lightsPerMesh: { max: lmax, mean: r1(act.length ? lsum / act.length : 0) }, lights: scene.lights.filter((l) => l.isEnabled()).length, shadowCasters: casters,
    heapMB: b.heap[i0] >= 0 ? r1(b.heap[i1 - 1]) : "n/a", heapDrops: b.heap[i0] >= 0 ? `${drops} (${r1(dropMB)} MB)` : "n/a",
    games: L.games && b.ctx.gamesActive ? b.ctx.gamesActive() : undefined,
  };
}

function report(b: Bench, pubSeen: boolean) {
  const c = b.ctx, s = c.scene;
  const info = {
    build: c.build, when: new Date().toISOString(), mode: c.mode, players: c.players(), npcs: c.npcs(), cars: c.cars(),
    pubAlreadySeen: pubSeen, settings: c.settings, ...machineInfo(c.engine, c.canvas),
    hostWorldMsPerTick: side.hostTicks ? r1(side.hostMs / side.hostTicks) : undefined, hostTicks: side.hostTicks || undefined,
    netMsgs: side.netMsgs || undefined, netMsPerMsg: side.netMsgs ? r1(side.netMs / side.netMsgs) : undefined, netKBps: side.netMsgs ? r1(side.netBytes / 1024 / Math.max(1, b.ft.subarray(0, b.n).reduce((a, v) => a + v, 0) / 1000)) : undefined,
    meshes: s.meshes.length, materials: s.materials.length, textures: s.textures.length,
  };
  const all = Array.from(b.ft.subarray(0, b.n)), slow = [...all].sort((x, y) => y - x), n1 = Math.max(1, Math.round(all.length * 0.01));
  const total = { frames: all.length, medianMs: r1(pct(all, 0.5)), p99Ms: r1(pct(all, 0.99)), low1Fps: r1(1000 / (slow.slice(0, n1).reduce((a, v) => a + v, 0) / n1)), maxMs: r1(slow[0] ?? 0) };
  const pad = (v: unknown, w: number) => String(v).padStart(w);
  const lines = [
    `BOX FORT BANDITZ BENCHMARK  build ${info.build}  ${info.when}`,
    `${info.mode}, ${info.players} player(s), ${info.npcs} NPCs, ${info.cars} cars; pub ${pubSeen ? "already visited this session" : "first visit"}`,
    `GPU: ${info.gpu}`, `CPU threads: ${info.cpuThreads}, memory: ${info.memoryGB} GB, OS: ${info.os}`, `Browser: ${info.browser}`,
    `Window ${info.window}, rendering ${info.render} (pixel ratio ${info.devicePixelRatio}, scaling ${info.hardwareScaling}), WebGL ${info.webgl}`,
    `Settings: ${JSON.stringify(info.settings)}`,
    `GPU time: ${b.gpuTimer ? "measured (timer queries)" : "unavailable in this browser (CPU numbers only)"}`,
    "",
    "stretch                                        med   p95   p99   max  1%low  >50ms  cpu(upd/wld/apl/rnd/hud)  draws  meshes   tris",
    ...b.results.map((r: any) => `${(r.leg + (r.night ? " (night)" : "")).slice(0, 44).padEnd(44)} ${pad(r.medianMs, 5)} ${pad(r.p95Ms, 5)} ${pad(r.p99Ms, 5)} ${pad(r.maxMs, 5)} ${pad(r.low1Fps, 6)} ${pad(r.over50, 5)}  ${`${r.cpu.update}/${r.cpu.world}/${r.cpu.apply}/${r.cpu.renderCall}/${r.cpu.hud}`.padEnd(24)} ${pad(r.drawCalls, 6)} ${pad(r.activeMeshes, 6)} ${pad(r.triangles, 7)}`),
    "",
    `Overall: ${total.frames} frames, median ${total.medianMs} ms, 99th ${total.p99Ms} ms, 1% low ${total.low1Fps} FPS, worst ${total.maxMs} ms`,
  ];
  return { text: lines.join("\n"), json: JSON.stringify({ info, total, legs: b.results }) };
}
