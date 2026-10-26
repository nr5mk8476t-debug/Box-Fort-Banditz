// Animated 3D title backdrop: a dusk Trashington street with a very shabby box fort.
// PLACEHOLDER ART built from simple shapes. Real models + props arrive in later phases.
import {
  Scene, Engine, UniversalCamera, HemisphericLight, DirectionalLight, PointLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, Mesh, TransformNode, DynamicTexture,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { settings } from "../settings.ts";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function windowTexture(scene: Scene, rand: () => number, cols: number, rows: number): DynamicTexture {
  const cw = 48, ch = 56;
  const tex = new DynamicTexture("windows", { width: cols * cw, height: rows * ch }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, cols * cw, rows * ch);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = rand() > 0.45;
      c.fillStyle = lit ? (rand() > 0.3 ? "#ffd98a" : "#9fe3ff") : "#2b2433";
      c.fillRect(i * cw + 10, j * ch + 9, cw - 20, ch - 18);
      c.strokeStyle = "#1b1420";
      c.lineWidth = 4;
      c.strokeRect(i * cw + 10, j * ch + 9, cw - 20, ch - 18);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

function skyTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("sky", { width: 16, height: 256 }, scene, false);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#3b3f8f");
  g.addColorStop(0.45, "#c46a9a");
  g.addColorStop(0.8, "#ff9a62");
  g.addColorStop(1, "#ffc98a");
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 256);
  tex.update();
  return tex;
}

export class TitleScene {
  scene: Scene;
  private camera: UniversalCamera;
  private t = 0;
  private sign!: Mesh;
  private awning!: Mesh;

  constructor(engine: Engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.98, 0.62, 0.45, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString("#ffb07a");
    scene.fogStart = 35;
    scene.fogEnd = 120;

    const cam = (this.camera = new UniversalCamera("titleCam", new Vector3(-4.2, 2.1, -6.5), scene));
    cam.setTarget(new Vector3(2.2, 3.2, 8));
    cam.fov = 0.9;
    cam.minZ = 0.1;
    cam.inputs.clear();

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.diffuse = new Color3(1, 0.85, 0.75);
    hemi.groundColor = new Color3(0.45, 0.35, 0.6);
    hemi.intensity = 0.75;
    const sun = new DirectionalLight("sun", new Vector3(0.6, -0.55, 0.6), scene);
    sun.position = new Vector3(-20, 20, -20);
    sun.diffuse = new Color3(1, 0.78, 0.55);
    sun.intensity = 1.1;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.darkness = 0.35;
    shadows.bias = 0.002;
    shadows.normalBias = 0.02;

    const rand = rng(7);

    // Street + sidewalk
    const road = MeshBuilder.CreateGround("road", { width: 120, height: 16 }, scene);
    road.position.z = -2;
    road.material = toon(scene, PALETTE.asphalt);
    road.receiveShadows = true;
    const walk = MeshBuilder.CreateBox("walk", { width: 120, height: 0.2, depth: 14 }, scene);
    walk.position.set(0, 0.1, 13);
    walk.material = toon(scene, PALETTE.sidewalk);
    walk.receiveShadows = true;
    // road stripes
    for (let x = -50; x < 50; x += 5) {
      const s = MeshBuilder.CreateBox("stripe", { width: 2.2, height: 0.02, depth: 0.25 }, scene);
      s.position.set(x, 0.01, -4);
      s.material = toon(scene, "#e8d56a");
    }

    // Sky backdrop (gradient) far behind the city
    const sky = MeshBuilder.CreatePlane("sky", { width: 400, height: 160 }, scene);
    sky.position.set(0, 50, 120);
    sky.material = unlitTextured(scene, skyTexture(scene), "skyMat");
    sky.applyFog = false;

    // Skyline: a row of small shops, then a row of towers behind
    const colors = [PALETTE.brick, PALETTE.teal, PALETTE.mustard, PALETTE.grape, "#7b6d8d", "#c26b4a", "#5c7a9e"];
    const rows = [
      { z0: 22, hMin: 4, hMax: 9, dMin: 6, dMax: 8 },
      { z0: 44, hMin: 16, hMax: 42, dMin: 8, dMax: 12 },
    ];
    for (const row of rows) {
      let x = -60;
      while (x < 60) {
        const w = 5 + rand() * 7;
        const h = row.hMin + rand() * (row.hMax - row.hMin);
        const d = row.dMin + rand() * (row.dMax - row.dMin);
        const z = row.z0 + rand() * 3 + d / 2;
        const b = MeshBuilder.CreateBox("bld", { width: w, height: h, depth: d }, scene);
        b.position.set(x + w / 2, h / 2, z);
        b.material = toon(scene, colors[Math.floor(rand() * colors.length)]);
        ink(b, 0.08);
        b.receiveShadows = true;
        // windows on the front face (each building draws its own window grid)
        const fw = w - 1.2, fh = h - (row.z0 < 30 ? 1.8 : 2.5);
        const cols = Math.max(1, Math.round(fw / 1.6)), rws = Math.max(1, Math.round(fh / 2.2));
        const wp = MeshBuilder.CreatePlane("win", { width: fw, height: fh }, scene);
        wp.position.set(x + w / 2, (row.z0 < 30 ? 1.8 : 2.5) + fh / 2 - 0.4, z - d / 2 - 0.14); // must sit in front of the 0.08 outline shell
        wp.material = unlitTextured(scene, windowTexture(scene, rand, cols, rws), "winMat");
        // rooftop junk
        if (rand() > 0.5) {
          const tank = MeshBuilder.CreateCylinder("tank", { diameter: 1.6, height: 2 }, scene);
          tank.position.set(x + w / 2 + (rand() - 0.5) * w * 0.5, h + 1, z);
          tank.material = toon(scene, "#7a5a3a");
          ink(tank, 0.05);
        }
        x += w + 0.3 + rand() * 1.2;
      }
    }

    // Parody billboards (clearly fictional, never clickable, never ask for money)
    const ads = [
      { text: "CRUNCHO+ PREMIUM", bg: "#ffe14a", fg: "#d6264a" },
      { text: "TRASHFLIX ULTRA MAX", bg: "#1f1f2e", fg: "#ff4a6e" },
      { text: "BOXLY: IT'S A BOX", bg: "#43c7a6", fg: "#1b1420" },
    ];
    ads.forEach((ad, i) => {
      const board = MeshBuilder.CreatePlane("ad", { width: 8, height: 2.5 }, scene);
      board.position.set(-16 + i * 16, 11 + (i % 2) * 3, 21.5);
      board.material = unlitTextured(scene, textTexture(scene, ad.text, { w: 1024, h: 320, bg: ad.bg, fg: ad.fg }), "adMat");
      ink(board, 0.08);
    });

    this.buildFort(scene, shadows);

    // Streetlamp with warm light
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.18, height: 5 }, scene);
    pole.position.set(5.5, 2.5, 7.5);
    pole.material = toon(scene, "#3a3444");
    ink(pole);
    const lamp = MeshBuilder.CreateSphere("lamp", { diameter: 0.7 }, scene);
    lamp.position.set(5.5, 5, 7.5);
    const lm = toon(scene, "#fff2b0", "lampbulb");
    lamp.material = lm;
    const pl = new PointLight("lampLight", new Vector3(5.5, 4.6, 7.2), scene);
    pl.diffuse = new Color3(1, 0.85, 0.5);
    pl.intensity = 0.8;
    pl.range = 14;
  }

  private buildFort(scene: Scene, shadows: ShadowGenerator) {
    const fort = new TransformNode("fort", scene);
    fort.position.set(1.2, 0.2, 6);
    fort.rotation.y = -0.35;
    const card = toon(scene, PALETTE.cardboard);
    const cardDark = toon(scene, PALETTE.cardboardDark);

    const add = (m: Mesh, mat = card, outline = 0.03) => {
      m.parent = fort;
      m.material = mat;
      ink(m, outline);
      shadows.addShadowCaster(m);
      m.receiveShadows = true;
      return m;
    };

    // The main battered box, slightly squashed and tilted
    const box = add(MeshBuilder.CreateBox("mainBox", { width: 2.4, height: 1.5, depth: 1.9 }, scene));
    box.position.set(0, 0.75, 0);
    box.rotation.z = 0.03;
    // open flaps
    const flapL = add(MeshBuilder.CreateBox("flap", { width: 1.2, height: 0.04, depth: 1.8 }, scene), cardDark);
    flapL.position.set(-1.65, 1.35, 0);
    flapL.rotation.z = 0.6;
    const flapR = add(MeshBuilder.CreateBox("flap", { width: 1.2, height: 0.04, depth: 1.8 }, scene), cardDark);
    flapR.position.set(1.62, 1.28, 0);
    flapR.rotation.z = -0.9;
    // dark doorway
    const door = add(MeshBuilder.CreatePlane("door", { width: 0.9, height: 1.0 }, scene), toon(scene, "#2a2130"), 0.0);
    door.position.set(0.25, 0.55, -0.96);
    // tape strips
    for (const [px, py, rz] of [[-0.7, 1.1, 0.4], [0.9, 0.35, -0.3], [-0.2, 1.42, 0]] as const) {
      const tape = add(MeshBuilder.CreateBox("tape", { width: 0.7, height: 0.12, depth: 0.02 }, scene), toon(scene, PALETTE.tape), 0.01);
      tape.position.set(px, py, -0.97);
      tape.rotation.z = rz;
    }
    // blanket awning on two sticks
    const awning = (this.awning = add(MeshBuilder.CreateBox("awning", { width: 2.8, height: 0.05, depth: 1.4 }, scene), toon(scene, PALETTE.blanket)));
    awning.position.set(0, 1.75, -1.35);
    awning.rotation.x = -0.35;
    for (const sx of [-1.25, 1.25]) {
      const stick = add(MeshBuilder.CreateCylinder("stick", { diameter: 0.07, height: 1.55 }, scene), toon(scene, "#6b4a2b"), 0.015);
      stick.position.set(sx, 0.78, -1.95);
      stick.rotation.z = sx * 0.03;
    }
    // hand-painted sign
    const sign = (this.sign = MeshBuilder.CreatePlane("sign", { width: 1.5, height: 0.55 }, scene));
    sign.parent = fort;
    sign.position.set(-0.3, 2.25, -1.0);
    sign.rotation.z = 0.09;
    sign.material = unlitTextured(scene, textTexture(scene, "OPEN-ISH", { w: 512, h: 190, bg: "#f3e2b8", fg: "#c0392b" }), "signMat");
    ink(sign, 0.04);
    // stacked small boxes, cone, trash can
    const small = add(MeshBuilder.CreateBox("small", { width: 0.8, height: 0.6, depth: 0.7 }, scene));
    small.position.set(1.8, 0.3, -0.6);
    small.rotation.y = 0.4;
    const small2 = add(MeshBuilder.CreateBox("small2", { width: 0.6, height: 0.45, depth: 0.55 }, scene), cardDark);
    small2.position.set(1.75, 0.83, -0.55);
    small2.rotation.y = -0.2;
    const cone = add(MeshBuilder.CreateCylinder("cone", { diameterTop: 0.05, diameterBottom: 0.5, height: 0.8 }, scene), toon(scene, PALETTE.cone));
    cone.position.set(-1.9, 0.4, -1.3);
    const can = add(MeshBuilder.CreateCylinder("can", { diameter: 0.8, height: 1.1 }, scene), toon(scene, "#5d7a6a"));
    can.position.set(-2.6, 0.55, 0.3);
  }

  update(dt: number) {
    this.t += dt;
    const sway = settings.reducedMotion ? 0 : 1;
    this.camera.position.x = -4.2 + Math.sin(this.t * 0.25) * 0.5 * sway;
    this.camera.position.y = 2.1 + Math.sin(this.t * 0.4) * 0.1 * sway;
    this.camera.setTarget(new Vector3(2.2, 3.2, 8));
    // the sign and blanket wobble in the breeze
    this.sign.rotation.z = 0.09 + Math.sin(this.t * 1.7) * 0.04 * sway;
    this.awning.rotation.x = -0.35 + Math.sin(this.t * 2.3) * 0.03 * sway;
  }

  dispose() {
    this.scene.dispose();
  }
}
