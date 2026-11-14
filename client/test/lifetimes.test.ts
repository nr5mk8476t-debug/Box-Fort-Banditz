// R13.1: what a character, an item or a remote player owns goes when it goes, and what it shares stays.
// (D) skinBody gives every person a Skeleton (and a Bone per moving part); removing the person used to leave both in the
//     scene (ten people built and removed: ten skeletons, twenty bones behind).
// (and) `dispose(false, true)` disposed the SHARED cached materials too: Babylon then cleared them off every other mesh
//     using them, so the first pedestrian to walk off left everyone else's body with no material, and the next one built
//     got the disposed material back from the cache. disposeOwned() in look.ts is the one way to remove these now.
// Babylon's NullEngine (no drawing); a do-nothing 2D canvas for the text textures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";

const g = globalThis as any;
// (a canvas whose every method does nothing and returns another do-nothing: gradients, measureText, ...)
const ctx: any = new Proxy(function () {}, { get: (_t, k) => (k === "width" ? 10 : ctx), apply: () => ctx, set: () => true });
g.document ??= { hidden: false, createElement: () => ({ width: 256, height: 256, style: {}, getContext: () => ctx, toDataURL: () => "data:," }), getElementById: () => null, addEventListener: () => {}, removeEventListener: () => {} };
g.navigator ??= { userAgent: "test", hardwareConcurrency: 4, platform: "test" };
g.innerWidth ??= 1280; g.innerHeight ??= 720; g.devicePixelRatio ??= 1;
g.location ??= { search: "", href: "http://test/" };

const KINDS = ["pedestrian", "cop", "shopper", "cashier", "raccoon", "jogger", "pedestrian", "cop", "tourist", "pedestrian"];
const npcView = (i: number, kind = KINDS[i % KINDS.length]) => ({ kind, x: i * 3, y: 0, z: 0, yaw: 0, state: "walk", target: "", robbed: false }) as any;
const counts = (s: Scene) => ({ meshes: s.meshes.length, nodes: s.transformNodes.length, skeletons: s.skeletons.length, bones: s.skeletons.reduce((n, k) => n + k.bones.length, 0), materials: s.materials.length, textures: s.textures.length });
/** every mesh still in the scene has a live material (one that's still in the scene's list) */
function liveMaterials(s: Scene, what: string) {
  for (const m of s.meshes) {
    if (!m.isEnabled(false) && !m.material) continue;
    assert.ok(m.material, `${what}: ${m.name} lost its material`);
    assert.ok(s.materials.includes(m.material!), `${what}: ${m.name} draws with a disposed material (${m.material!.name})`);
  }
}

test("R13.1 people: spawn and remove 10 people five times: skeletons, bones, meshes, nodes, materials and textures come back to the same count", async () => {
  const { NpcRenderer } = await import("../src/game/npcRenderer.ts");
  const engine = new NullEngine(), scene = new Scene(engine);
  const r = new NpcRenderer(scene);
  let after: ReturnType<typeof counts> | null = null;
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let i = 0; i < 10; i++) r.sync(`n${i}`, npcView(i), 0); // (the same people each time: the same looks, so the same cached colours)
    const built = counts(scene);
    assert.equal(built.skeletons, 10, "one skeleton a person");
    r.say("n0", "Oi! That's MY bin!"); // (a bubble: removed with its person)
    r.retain(new Set());
    const c = counts(scene);
    assert.equal(c.skeletons, 0, `cycle ${cycle}: skeletons`); assert.equal(c.bones, 0, `cycle ${cycle}: bones`);
    assert.equal(c.meshes, 0, `cycle ${cycle}: meshes`); assert.equal(c.nodes, 0, `cycle ${cycle}: nodes`);
    if (after) assert.deepEqual(c, after, `cycle ${cycle}: back to where the last cycle left it (the shared materials made once)`);
    after = c;
  }
  r.dispose(); scene.dispose(); engine.dispose();
});

test("R13.1 people: removing one person leaves everyone else (and the next one built) with a live, shared material", async () => {
  const { NpcRenderer } = await import("../src/game/npcRenderer.ts");
  const engine = new NullEngine(), scene = new Scene(engine);
  const r = new NpcRenderer(scene);
  for (let i = 0; i < 6; i++) r.sync("n" + i, npcView(i), 0);
  r.retain(new Set(["n1", "n2", "n3", "n4", "n5"])); // n0 walks off
  liveMaterials(scene, "after one left");
  r.retain(new Set(["n5"]));
  liveMaterials(scene, "after four more left");
  r.sync("late", npcView(0), 0);
  liveMaterials(scene, "the next one built");
  const bodies = scene.meshes.filter((m) => m.name.endsWith("-body"));
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].material, bodies[1].material, "bodies still share one material");
  r.dispose(); scene.dispose(); engine.dispose();
});

test("R13.1 leaving the game and starting another: a fresh scene builds people with live materials and nothing carried over", async () => {
  const { NpcRenderer } = await import("../src/game/npcRenderer.ts");
  for (let game = 0; game < 2; game++) {
    const engine = new NullEngine(), scene = new Scene(engine);
    const r = new NpcRenderer(scene);
    for (let i = 0; i < 4; i++) r.sync("n" + i, npcView(i), 0);
    r.retain(new Set(["n3"]));
    liveMaterials(scene, `game ${game}`);
    r.dispose();
    const c = counts(scene);
    assert.equal(c.skeletons, 0); assert.equal(c.meshes, 0);
    scene.dispose(); engine.dispose();
  }
});

test("R13.1 items and remote players: removing one keeps the rest's shared materials live; cycles settle", async () => {
  const S = await import("@bfb/shared");
  const { ItemRenderer } = await import("../src/game/itemRenderer.ts");
  const { RemotePlayers } = await import("../src/game/remotePlayers.ts");
  const engine = new NullEngine(), scene = new Scene(engine);
  const arena: any = { halfSize: 40, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }], lootSpawns: [] };
  const items = new ItemRenderer(scene, arena), remotes = new RemotePlayers(scene);
  const types = S.LOOT.filter((d) => !d.npcOnly).slice(0, 12).map((d) => d.type);
  const iv = (i: number) => ({ type: types[i % types.length], x: i, y: 0.5, z: 2, rot: 0, mode: "free", holder: "", value: 10 }) as any;
  const rv = (i: number) => ({ x: i, y: 0, z: -2, yaw: 0, pitch: 0, name: "P" + i, colorIdx: i, connected: true }) as any;
  let after: ReturnType<typeof counts> | null = null;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 12; i++) items.sync(`i${i}`, iv(i), 0);
    for (let i = 0; i < 3; i++) remotes.push(`p${i}`, rv(i), 0);
    items.retain(new Set(["i5"])); remotes.retain(new Set(["p1"]));
    liveMaterials(scene, `cycle ${cycle}: one of each left`);
    items.retain(new Set()); remotes.retain(new Set());
    const c = counts(scene);
    assert.equal(c.meshes, 0, `cycle ${cycle}: meshes`); assert.equal(c.skeletons, 0);
    if (after) assert.deepEqual(c, after, `cycle ${cycle}: settled`);
    after = c;
  }
  items.dispose(); remotes.dispose(); scene.dispose(); engine.dispose();
});

test("R13.1 a remote player is 7 meshes (was 13): a mesh per moving group and outline width, plus the name; fading when disconnected reaches all of them", async () => {
  const { RemotePlayers } = await import("../src/game/remotePlayers.ts");
  const engine = new NullEngine(), scene = new Scene(engine);
  const r = new RemotePlayers(scene);
  const info = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, name: "P", colorIdx: 2, connected: true } as any;
  r.push("p1", info, 0);
  const mine = scene.meshes.filter((m) => { let p: any = m; while (p.parent) p = p.parent; return p.name === "remote-p1"; });
  assert.equal(mine.length, 7, mine.map((m) => m.name).join(","));
  // the moving groups still move: the arms swing on their shoulders, the head turns
  for (const want of ["rshoulder", "rheadPivot", "rbodyPivot"]) assert.ok(mine.some((m) => { let p: any = m.parent; while (p) { if (p.name === want) return true; p = p.parent; } return false; }), `something hangs off ${want}`);
  r.push("p1", { ...info, connected: false }, 50);
  assert.ok(mine.filter((m) => m.name !== "rtag").every((m) => m.visibility < 1), "all of it fades when they drop");
  r.dispose(); scene.dispose(); engine.dispose();
});

test("R13.1 the stores' picture sheet fits (it's packed when the module loads: an overflow used to show only in the browser)", async () => {
  const d = await import("../src/game/storeDressing.ts");
  for (const c of ["signCarat", "caratEyes", "caratPigeon", "caratNote", "caratCert"] as const) { const [u0, v0, u1, v1] = d.sheetUV(c); assert.ok(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1 && u1 > u0 && v1 > v0, c); }
});
