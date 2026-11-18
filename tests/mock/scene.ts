// COMPACT QUEENS: a PLANNING MOCK-UP renderer (bundled by tests/compact-mockups.ts). Plain blocks from the plan data:
// not the game's art, not the game's renderer settings, not a blockout. Everything comes from window.SCENE.
import { Engine, Scene, UniversalCamera, Vector3, HemisphericLight, DirectionalLight, MeshBuilder, StandardMaterial, Color3, Color4, Matrix, Viewport, PointLight, Camera } from "@babylonjs/core";

type Box = { x: number; z: number; w: number; d: number; h: number; y?: number; c: string; rot?: number; e?: number; a?: number };
type Cyl = { x: number; z: number; r: number; h: number; y?: number; c: string; e?: number };
type Label = { x: number; y: number; z: number; t: string; c?: string };
type View = { name: string; eye: [number, number, number]; look: [number, number, number]; night?: boolean; labels: Label[] };
declare global { interface Window { SCENE: { boxes: Box[]; cyls: Cyl[]; lamps: [number, number, number][] }; VIEW: View; READY?: boolean; LABELS?: { x: number; y: number; t: string; c?: string; vis: boolean }[] } }

const canvas = document.getElementById("c") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
const V = window.VIEW, night = !!V.night;
scene.clearColor = night ? new Color4(0.05, 0.06, 0.12, 1) : new Color4(0.72, 0.8, 0.9, 1);
scene.fogMode = Scene.FOGMODE_LINEAR; scene.fogStart = night ? 40 : 90; scene.fogEnd = night ? 150 : 240;
scene.fogColor = night ? new Color3(0.05, 0.06, 0.12) : new Color3(0.72, 0.8, 0.9);
scene.ambientColor = night ? new Color3(0.35, 0.35, 0.45) : new Color3(0.5, 0.5, 0.5);
const cam = new UniversalCamera("cam", new Vector3(...V.eye), scene);
cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED; cam.fov = (90 * Math.PI) / 180; cam.minZ = 0.1; cam.maxZ = 500;
cam.setTarget(new Vector3(...V.look));
const hemi = new HemisphericLight("h", new Vector3(0.2, 1, 0.1), scene);
hemi.intensity = night ? 0.3 : 0.55; hemi.groundColor = night ? new Color3(0.05, 0.05, 0.1) : new Color3(0.45, 0.42, 0.38);
const sun = new DirectionalLight("s", new Vector3(-0.5, -1, -0.35), scene); sun.intensity = night ? 0.04 : 0.55;
const mats = new Map<string, StandardMaterial>();
const mat = (c: string, e = 0, a = 1) => {
  const k = `${c}|${e}|${a}`; let m = mats.get(k);
  if (!m) { m = new StandardMaterial(k, scene); const col = Color3.FromHexString(c); m.diffuseColor = col; m.specularColor = new Color3(0, 0, 0); if (e) m.emissiveColor = col.scale(e); m.ambientColor = col.scale(night ? 0.3 : 0.45); if (a < 1) m.alpha = a; m.maxSimultaneousLights = 8; mats.set(k, m); }
  return m;
};
for (const b of window.SCENE.boxes) {
  const m = MeshBuilder.CreateBox("b", { width: b.w, depth: b.d, height: b.h }, scene);
  m.position.set(b.x, (b.y ?? 0) + b.h / 2, b.z); if (b.rot) m.rotation.y = b.rot;
  m.material = mat(b.c, night ? b.e ?? 0 : (b.e ?? 0) * 0.15, b.a ?? 1); m.freezeWorldMatrix();
}
for (const c of window.SCENE.cyls) {
  const m = MeshBuilder.CreateCylinder("c", { diameter: c.r * 2, height: c.h, tessellation: 12 }, scene);
  m.position.set(c.x, (c.y ?? 0) + c.h / 2, c.z); m.material = mat(c.c, night ? c.e ?? 0 : 0); m.freezeWorldMatrix();
}
if (night) {
  // the nearest street lamps as real lights (a mock-up's few: the blockout does lighting properly)
  const eye = new Vector3(...V.eye);
  const near = [...window.SCENE.lamps].sort((a, b) => Vector3.Distance(eye, new Vector3(...a)) - Vector3.Distance(eye, new Vector3(...b))).slice(0, 7);
  for (const p of near) { const l = new PointLight("l", new Vector3(...p), scene); l.diffuse = new Color3(1, 0.82, 0.55); l.intensity = 1.2; l.range = 30; }
}
scene.executeWhenReady(() => {
  scene.render(); scene.render();
  const vp = new Viewport(0, 0, engine.getRenderWidth(), engine.getRenderHeight()), tm = scene.getTransformMatrix();
  window.LABELS = V.labels.map((l) => {
    const p = Vector3.Project(new Vector3(l.x, l.y, l.z), Matrix.Identity(), tm, vp);
    return { x: p.x / engine.getHardwareScalingLevel(), y: p.y / engine.getHardwareScalingLevel(), t: l.t, c: l.c, vis: p.z > 0 && p.z < 1 };
  });
  window.READY = true;
});
