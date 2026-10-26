// A chunky cartoon car (placeholder art), ~4.2 x 1.9 m, built facing +z around the origin.
// Parked cars merge their body into the static city; traffic cars bake everything into one mesh.
import { MeshBuilder, type Mesh, type Scene } from "./babylon.ts";

function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + k), g = Math.min(255, ((n >> 8) & 255) + k), b = Math.min(255, (n & 255) + k);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/** Body parts as [mesh, colour, outline width]. withGlass adds the windows too. */
export function buildCarParts(scene: Scene, color: string, withGlass: boolean): [Mesh, string, number][] {
  const MB = MeshBuilder;
  const out: [Mesh, string, number][] = [];
  const add = (m: Mesh, c: string, o = 0.03, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); out.push([m, c, o]); return m; };
  add(MB.CreateBox("carbody", { width: 1.9, height: 0.7, depth: 4.2 }, scene), color, 0.04, 0, 0.6, 0);
  add(MB.CreateBox("carcab", { width: 1.66, height: 0.55, depth: 2.1 }, scene), lighten(color, 30), 0.03, 0, 1.22, -0.25);
  add(MB.CreateBox("bumperF", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, 2.12);
  add(MB.CreateBox("bumperB", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, -2.12);
  for (const sx of [-0.62, 0.62]) {
    add(MB.CreateBox("headlight", { width: 0.34, height: 0.18, depth: 0.06 }, scene), "#fff6c0", 0, sx, 0.72, 2.11);
    add(MB.CreateBox("taillight", { width: 0.34, height: 0.16, depth: 0.06 }, scene), "#e14b4b", 0, sx, 0.72, -2.11);
  }
  for (const [x, z] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    const w = add(MB.CreateCylinder("wheel", { diameter: 0.72, height: 0.3, tessellation: 12 }, scene), "#1b1420", 0.02, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
  }
  if (withGlass) for (const g of buildCarGlass(scene)) out.push([g, "#6fb6d9", 0]);
  return out;
}

/** The windows (a slightly larger box around the cabin, so they show on every side). */
export function buildCarGlass(scene: Scene): Mesh[] {
  const g = MeshBuilder.CreateBox("carglass", { width: 1.7, height: 0.4, depth: 1.9 }, scene);
  g.position.set(0, 1.25, -0.25);
  return [g];
}

/**
 * Phase 4 police cruiser: black-and-white body, push bar, light bar on the roof.
 * The two light-bar lenses are returned separately (so they can flash); `lights` is null for a
 * parked (scenery) car that gets merged into the city.
 */
export function buildCopCarParts(scene: Scene): [Mesh, string, number][] {
  const MB = MeshBuilder;
  const out: [Mesh, string, number][] = [];
  const add = (m: Mesh, c: string, o = 0.03, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); out.push([m, c, o]); return m; };
  add(MB.CreateBox("copbody", { width: 1.9, height: 0.7, depth: 4.3 }, scene), "#f4f1ea", 0.04, 0, 0.62, 0);
  add(MB.CreateBox("copdoors", { width: 1.94, height: 0.42, depth: 2.2 }, scene), "#1b1f2e", 0.02, 0, 0.52, -0.1); // black doors
  add(MB.CreateBox("copcab", { width: 1.66, height: 0.55, depth: 2.1 }, scene), "#1b1f2e", 0.03, 0, 1.24, -0.25);
  add(MB.CreateBox("copglass", { width: 1.7, height: 0.4, depth: 1.9 }, scene), "#6fb6d9", 0, 0, 1.27, -0.25);
  add(MB.CreateBox("pushbar", { width: 1.5, height: 0.45, depth: 0.14 }, scene), "#2b2433", 0.02, 0, 0.55, 2.25);
  add(MB.CreateBox("bumperB", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, -2.17);
  add(MB.CreateBox("lightbase", { width: 1.3, height: 0.1, depth: 0.34 }, scene), "#2b2433", 0.02, 0, 1.56, -0.2);
  for (const sx of [-0.62, 0.62]) {
    add(MB.CreateBox("headlight", { width: 0.34, height: 0.18, depth: 0.06 }, scene), "#fff6c0", 0, sx, 0.74, 2.16);
    add(MB.CreateBox("taillight", { width: 0.34, height: 0.16, depth: 0.06 }, scene), "#e14b4b", 0, sx, 0.74, -2.16);
  }
  // badge on the doors (a gold star-ish square)
  for (const sx of [-0.98, 0.98]) add(MB.CreateBox("badge", { width: 0.03, height: 0.28, depth: 0.28 }, scene), "#ffcf3a", 0, sx, 0.62, 0.1);
  for (const [x, z] of [[-0.92, 1.38], [0.92, 1.38], [-0.92, -1.38], [0.92, -1.38]]) {
    const w = add(MB.CreateCylinder("wheel", { diameter: 0.72, height: 0.3, tessellation: 12 }, scene), "#1b1420", 0.02, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
  }
  return out;
}

/** The two roof lenses (red left, blue right), for flashing. */
export function buildCopLights(scene: Scene): [Mesh, Mesh] {
  const r = MeshBuilder.CreateBox("lensR", { width: 0.56, height: 0.2, depth: 0.3 }, scene);
  r.position.set(-0.33, 1.7, -0.2);
  const b = MeshBuilder.CreateBox("lensB", { width: 0.56, height: 0.2, depth: 0.3 }, scene);
  b.position.set(0.33, 1.7, -0.2);
  return [r, b];
}
