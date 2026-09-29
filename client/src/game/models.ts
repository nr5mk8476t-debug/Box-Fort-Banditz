// Loot models: chunky placeholder shapes with ink outlines. Each model is built around its
// origin at the item's collision-sphere centre, sized to roughly match that sphere.
import { Scene, MeshBuilder, Mesh, TransformNode, StandardMaterial, Color3 } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured, bakeGroup } from "./look.ts";

type Part = (m: Mesh, color: string, outline?: number) => Mesh;

export function buildLootModel(scene: Scene, type: string, outlineColor?: Color3): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode("loot-" + type, scene);
  const meshes: Mesh[] = [];
  // outline 0 = thin decal (screens, labels, slots): no ink shell, or it would cover the decal
  const P: Part = (m, color, outline = 0.025) => {
    m.parent = root;
    m.material = toon(scene, color, "loot");
    if (outline > 0) {
      ink(m, outline);
      if (outlineColor) m.outlineColor = outlineColor;
    }
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const MB = MeshBuilder;
  switch (type) {
    case "rubber_chicken": {
      const body = P(MB.CreateCapsule("b", { radius: 0.09, height: 0.32 }, scene), "#ffe14a");
      body.rotation.z = Math.PI / 2;
      const head = P(MB.CreateSphere("h", { diameter: 0.13, segments: 8 }, scene), "#ffe14a");
      head.position.set(0.17, 0.08, 0);
      const comb = P(MB.CreateBox("c", { width: 0.06, height: 0.06, depth: 0.02 }, scene), "#e14b4b", 0.01);
      comb.position.set(0.17, 0.16, 0);
      const beak = P(MB.CreateCylinder("k", { diameterTop: 0, diameterBottom: 0.05, height: 0.07, tessellation: 6 }, scene), "#ff8a1f", 0.01);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.25, 0.07, 0);
      break;
    }
    case "mixtape": {
      P(MB.CreateBox("b", { width: 0.22, height: 0.03, depth: 0.14 }, scene), "#2b2433");
      for (const x of [-0.05, 0.05]) {
        const r = P(MB.CreateCylinder("r", { diameter: 0.04, height: 0.035, tessellation: 8 }, scene), "#f3e2b8", 0.005);
        r.position.set(x, 0.001, 0);
      }
      const label = P(MB.CreateBox("l", { width: 0.18, height: 0.032, depth: 0.04 }, scene), "#ff5a3c", 0);
      label.position.z = -0.045;
      break;
    }
    case "cursed_sneakers": {
      for (const x of [-0.07, 0.07]) {
        const shoe = P(MB.CreateBox("s", { width: 0.11, height: 0.1, depth: 0.28 }, scene), "#9b5cff");
        shoe.position.set(x, 0.01, 0);
        shoe.rotation.y = x * 2;
        const sole = P(MB.CreateBox("o", { width: 0.12, height: 0.035, depth: 0.3 }, scene), "#ffffff", 0.01);
        sole.position.set(x, -0.055, 0);
        sole.rotation.y = x * 2;
      }
      break;
    }
    case "snow_globe": {
      const base = P(MB.CreateCylinder("b", { diameter: 0.2, height: 0.08, tessellation: 12 }, scene), "#8b5a2b");
      base.position.y = -0.1;
      const glass = P(MB.CreateSphere("g", { diameter: 0.24, segments: 12 }, scene), "#bfe8ff", 0.01);
      glass.position.y = 0.04;
      glass.visibility = 0.55;
      const fort = P(MB.CreateBox("f", { width: 0.07, height: 0.05, depth: 0.06 }, scene), "#c9955b", 0.005);
      fort.position.y = -0.02;
      break;
    }
    case "lucky_pigeon": {
      const ped = P(MB.CreateCylinder("p", { diameter: 0.2, height: 0.1, tessellation: 10 }, scene), "#d4af37");
      ped.position.y = -0.12;
      const body = P(MB.CreateSphere("b", { diameter: 0.22, segments: 10 }, scene), "#9aa3b5");
      body.scaling.set(1, 0.8, 1.3);
      body.position.y = 0.0;
      const head = P(MB.CreateSphere("h", { diameter: 0.11, segments: 8 }, scene), "#6f7a91");
      head.position.set(0, 0.1, 0.11);
      const beak = P(MB.CreateCylinder("k", { diameterTop: 0, diameterBottom: 0.03, height: 0.05, tessellation: 6 }, scene), "#ffcf3a", 0.005);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.09, 0.18);
      break;
    }
    case "golden_spork": {
      const handle = P(MB.CreateBox("h", { width: 0.035, height: 0.02, depth: 0.26 }, scene), "#ffcf3a", 0.01);
      handle.position.z = -0.05;
      const bowl = P(MB.CreateSphere("b", { diameter: 0.1, segments: 8 }, scene), "#ffcf3a", 0.01);
      bowl.scaling.set(1, 0.3, 1.2);
      bowl.position.z = 0.1;
      for (const x of [-0.025, 0, 0.025]) {
        const tine = P(MB.CreateBox("t", { width: 0.01, height: 0.012, depth: 0.05 }, scene), "#ffcf3a", 0.004);
        tine.position.set(x, 0, 0.16);
      }
      break;
    }
    case "traffic_cone": {
      const cone = P(MB.CreateCylinder("c", { diameterTop: 0.05, diameterBottom: 0.36, height: 0.56, tessellation: 14 }, scene), "#ff7a1f");
      cone.position.y = 0.02;
      const band = P(MB.CreateCylinder("w", { diameterTop: 0.2, diameterBottom: 0.25, height: 0.09, tessellation: 14 }, scene), "#ffffff", 0.01);
      band.position.y = 0.05;
      const base = P(MB.CreateBox("b", { width: 0.46, height: 0.05, depth: 0.46 }, scene), "#ff7a1f");
      base.position.y = -0.27;
      break;
    }
    case "cardboard_cutout": {
      const board = P(MB.CreateBox("b", { width: 0.45, height: 0.7, depth: 0.03 }, scene), "#c9955b");
      board.position.y = 0.02;
      const face = MB.CreatePlane("f", { width: 0.38, height: 0.38 }, scene);
      face.parent = root;
      face.position.set(0, 0.17, -0.017);
      face.material = unlitTextured(scene, textTexture(scene, "=)", { w: 256, h: 256, bg: "#f0b98a", fg: "#1b1420" }), "cutoutFace");
      meshes.push(face);
      const leg = P(MB.CreateBox("l", { width: 0.05, height: 0.3, depth: 0.2 }, scene), "#a8743f");
      leg.position.set(0, -0.2, 0.1);
      leg.rotation.x = 0.5;
      break;
    }
    case "trash_bag": {
      const bag = P(MB.CreateSphere("b", { diameter: 0.62, segments: 10 }, scene), "#2b2b33");
      bag.scaling.set(1, 0.85, 0.95);
      const knot = P(MB.CreateSphere("k", { diameter: 0.14, segments: 6 }, scene), "#2b2b33");
      knot.position.y = 0.28;
      const glint = P(MB.CreateBox("g", { width: 0.08, height: 0.08, depth: 0.02 }, scene), "#ffcf3a", 0);
      glint.position.set(0.12, 0.05, -0.28);
      break;
    }
    case "gold_sign": {
      const board = MB.CreateBox("b", { width: 0.72, height: 0.36, depth: 0.04 }, scene);
      board.parent = root;
      board.position.y = 0.12;
      const mat = new StandardMaterial("goldsign", scene);
      mat.diffuseTexture = textTexture(scene, "WE BUY GOLD", { w: 512, h: 256, bg: "#ffe14a", fg: "#c0392b" });
      mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
      board.material = mat;
      ink(board, 0.025);
      if (outlineColor) board.outlineColor = outlineColor;
      meshes.push(board);
      const pole = P(MB.CreateCylinder("p", { diameter: 0.05, height: 0.5, tessellation: 8 }, scene), "#6f6a78");
      pole.position.y = -0.2;
      break;
    }
    case "crt_tv": {
      const box = P(MB.CreateBox("b", { width: 0.62, height: 0.5, depth: 0.52 }, scene), "#d8cfb8");
      const screen = P(MB.CreateBox("s", { width: 0.46, height: 0.36, depth: 0.02 }, scene), "#2e4a5a", 0);
      screen.position.set(-0.03, 0.02, -0.265);
      const knob = P(MB.CreateCylinder("k", { diameter: 0.06, height: 0.03, tessellation: 8 }, scene), "#6f6a78", 0);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.25, 0.1, -0.27);
      for (const s of [-1, 1]) {
        const ant = P(MB.CreateCylinder("a", { diameter: 0.015, height: 0.35, tessellation: 6 }, scene), "#3a3444", 0.004);
        ant.position.set(s * 0.1, 0.38, 0.05);
        ant.rotation.z = -s * 0.5;
      }
      void box;
      break;
    }
    case "giant_toaster": {
      P(MB.CreateBox("b", { width: 0.7, height: 0.46, depth: 0.42 }, scene), "#c9ced8");
      for (const x of [-0.14, 0.14]) {
        const slot = P(MB.CreateBox("s", { width: 0.12, height: 0.02, depth: 0.3 }, scene), "#2b2433", 0);
        slot.position.set(x, 0.235, 0);
        const bread = P(MB.CreateBox("t", { width: 0.1, height: 0.12, depth: 0.26 }, scene), "#d9a05b", 0.01);
        bread.position.set(x, 0.29, 0);
      }
      const lever = P(MB.CreateBox("l", { width: 0.05, height: 0.08, depth: 0.06 }, scene), "#2b2433", 0.005);
      lever.position.set(0.37, 0.05, 0);
      break;
    }
    case "mystery_suitcase": {
      P(MB.CreateBox("b", { width: 0.64, height: 0.44, depth: 0.2 }, scene), "#8b5a2b");
      const handle = P(MB.CreateBox("h", { width: 0.2, height: 0.05, depth: 0.05 }, scene), "#3a2a1a", 0.01);
      handle.position.y = 0.26;
      const q = MB.CreatePlane("q", { width: 0.22, height: 0.22 }, scene);
      q.parent = root;
      q.position.set(0, 0, -0.105);
      q.material = unlitTextured(scene, textTexture(scene, "?", { w: 128, h: 128, fg: "#ffcf3a", stroke: "#1b1420" }), "qmark");
      meshes.push(q);
      break;
    }
    case "arcade_machine": {
      const cab = P(MB.CreateBox("c", { width: 0.8, height: 1.25, depth: 0.7 }, scene), "#6b4c9a");
      cab.position.y = 0.0;
      const screen = P(MB.CreateBox("s", { width: 0.6, height: 0.45, depth: 0.03 }, scene), "#39ffb0", 0);
      screen.position.set(0, 0.25, -0.36);
      const panel = P(MB.CreateBox("p", { width: 0.78, height: 0.08, depth: 0.3 }, scene), "#2b2433", 0.01);
      panel.position.set(0, -0.08, -0.45);
      panel.rotation.x = -0.3;
      const stick = P(MB.CreateSphere("j", { diameter: 0.08, segments: 6 }, scene), "#ff5a3c", 0.005);
      stick.position.set(-0.15, 0.0, -0.5);
      break;
    }
    case "rubber_duck": {
      const body = P(MB.CreateSphere("b", { diameter: 1.3, segments: 14 }, scene), "#ffd23c", 0.04);
      body.scaling.set(1, 0.8, 1.2);
      const head = P(MB.CreateSphere("h", { diameter: 0.75, segments: 12 }, scene), "#ffd23c", 0.04);
      head.position.set(0, 0.55, 0.35);
      const beak = P(MB.CreateSphere("k", { diameter: 0.36, segments: 8 }, scene), "#ff8a1f", 0.03);
      beak.scaling.set(1, 0.45, 1.2);
      beak.position.set(0, 0.5, 0.75);
      for (const x of [-0.17, 0.17]) {
        const eye = P(MB.CreateSphere("e", { diameter: 0.1, segments: 6 }, scene), "#1b1420", 0.01);
        eye.position.set(x, 0.68, 0.66);
      }
      break;
    }
    // ---- pedestrian pocket loot (Phase 2.5) ----
    case "half_sandwich": {
      for (const [y, c] of [[-0.04, "#e8c07a"], [0.0, "#6fbf4a"], [0.02, "#e86a5a"], [0.055, "#e8c07a"]] as const) {
        const s = P(MB.CreateCylinder("s", { diameter: 0.2, height: y === 0 || y === 0.02 ? 0.025 : 0.04, tessellation: 3, arc: 1 }, scene), c, 0.012);
        s.position.y = y; s.scaling.set(1, 1, 0.8);
      }
      break;
    }
    case "pocket_lint": {
      for (const [x, y, d] of [[0, 0, 0.13], [0.06, 0.03, 0.08], [-0.05, 0.02, 0.07]] as const) {
        const b = P(MB.CreateSphere("l", { diameter: d, segments: 6 }, scene), "#9c93a8", 0.01);
        b.position.set(x, y, 0);
      }
      break;
    }
    case "expired_coupon": {
      P(MB.CreateBox("c", { width: 0.2, height: 0.01, depth: 0.11 }, scene), "#fff4b0", 0.008);
      const stamp = P(MB.CreateBox("x", { width: 0.12, height: 0.012, depth: 0.03 }, scene), "#e14b4b", 0);
      stamp.rotation.y = 0.5;
      break;
    }
    case "wrong_map": {
      const m = P(MB.CreateBox("m", { width: 0.24, height: 0.02, depth: 0.16 }, scene), "#bfe0a8", 0.01);
      m.rotation.z = 0.08;
      const route = P(MB.CreateBox("r", { width: 0.16, height: 0.022, depth: 0.012 }, scene), "#e14b4b", 0);
      route.rotation.y = 0.7;
      break;
    }
    case "bread_crumbs": {
      const bag = P(MB.CreateCylinder("b", { diameterTop: 0.12, diameterBottom: 0.18, height: 0.2, tessellation: 8 }, scene), "#d8b98a");
      bag.position.y = -0.02;
      const top = P(MB.CreateSphere("t", { diameter: 0.1, segments: 6 }, scene), "#d8b98a", 0.01);
      top.position.y = 0.1; top.scaling.set(1, 0.6, 1);
      break;
    }
    case "protein_shaker": {
      const cup = P(MB.CreateCylinder("c", { diameter: 0.14, height: 0.26, tessellation: 12 }, scene), "#2fb6ff");
      cup.position.y = -0.02;
      const lid = P(MB.CreateCylinder("l", { diameter: 0.15, height: 0.05, tessellation: 12 }, scene), "#2b2433", 0.012);
      lid.position.y = 0.13;
      break;
    }
    case "disposable_camera": {
      P(MB.CreateBox("b", { width: 0.18, height: 0.1, depth: 0.06 }, scene), "#ffcf3a");
      const lens = P(MB.CreateCylinder("l", { diameter: 0.06, height: 0.03, tessellation: 10 }, scene), "#2b2433", 0.008);
      lens.rotation.x = Math.PI / 2; lens.position.set(0.02, 0, 0.04);
      break;
    }
    case "mime_beret": {
      const b = P(MB.CreateCylinder("b", { diameter: 0.24, height: 0.06, tessellation: 14 }, scene), "#1b1420");
      b.rotation.z = 0.15;
      const nub = P(MB.CreateCylinder("n", { diameter: 0.025, height: 0.04, tessellation: 6 }, scene), "#1b1420", 0.008);
      nub.position.y = 0.05;
      break;
    }
    case "plastic_badge": {
      const star = P(MB.CreateCylinder("s", { diameter: 0.16, height: 0.025, tessellation: 5 }, scene), "#e0e4ea", 0.012);
      star.rotation.x = Math.PI / 2;
      const mid = P(MB.CreateCylinder("m", { diameter: 0.07, height: 0.03, tessellation: 10 }, scene), "#3d5a9e", 0);
      mid.rotation.x = Math.PI / 2;
      break;
    }
    case "fancy_earbuds": {
      const cas = P(MB.CreateCapsule("c", { radius: 0.045, height: 0.13, tessellation: 8 }, scene), "#f4f1ea", 0.01);
      cas.rotation.z = Math.PI / 2;
      break;
    }
    case "bedazzled_phone": {
      P(MB.CreateBox("p", { width: 0.1, height: 0.02, depth: 0.19 }, scene), "#ff6fb5", 0.012);
      for (let i = 0; i < 5; i++) {
        const g = P(MB.CreateSphere("g", { diameter: 0.025, segments: 4 }, scene), i % 2 ? "#bfe8ff" : "#fff4b0", 0);
        g.position.set(-0.03 + (i % 3) * 0.03, 0.013, -0.06 + i * 0.03);
      }
      break;
    }
    case "mystery_wallet": {
      P(MB.CreateBox("w", { width: 0.16, height: 0.04, depth: 0.12 }, scene), "#6b3f24");
      const q = P(MB.CreateBox("q", { width: 0.04, height: 0.042, depth: 0.04 }, scene), "#ffcf3a", 0);
      q.position.x = 0.04;
      break;
    }
    case "rolecks_watch": {
      const face = P(MB.CreateCylinder("f", { diameter: 0.12, height: 0.035, tessellation: 16 }, scene), "#ffcf3a", 0.012);
      face.position.y = 0.01;
      const dial = P(MB.CreateCylinder("d", { diameter: 0.09, height: 0.037, tessellation: 16 }, scene), "#f4f1ea", 0);
      dial.position.y = 0.011;
      for (const z of [-0.09, 0.09]) {
        const strap = P(MB.CreateBox("s", { width: 0.06, height: 0.015, depth: 0.08 }, scene), "#d4af37", 0.008);
        strap.position.set(0, -0.005, z);
      }
      break;
    }
    // ---- Phase 3.5: shop stock, smashed props, parked cars ----
    case "phone_handset": {
      const h = P(MB.CreateBox("h", { width: 0.06, height: 0.05, depth: 0.22 }, scene), "#1b1420", 0.01);
      h.position.y = 0.02;
      for (const z of [-0.1, 0.1]) { const e = P(MB.CreateCylinder("e", { diameter: 0.08, height: 0.05, tessellation: 8 }, scene), "#1b1420", 0.01); e.position.set(0, -0.01, z); }
      const cord = P(MB.CreateTorus("c", { diameter: 0.12, thickness: 0.015, tessellation: 10 }, scene), "#3a3444", 0);
      cord.position.set(0.07, -0.02, 0);
      break;
    }
    case "candy_bar": {
      P(MB.CreateBox("w", { width: 0.2, height: 0.035, depth: 0.07 }, scene), "#8b3fd1", 0.01);
      const band = P(MB.CreateBox("b", { width: 0.08, height: 0.037, depth: 0.072 }, scene), "#ffe14a", 0);
      band.position.x = 0.02;
      break;
    }
    case "soda_can": case "energy_drink": {
      const can = P(MB.CreateCylinder("c", { diameter: 0.13, height: 0.2, tessellation: 12 }, scene), type === "soda_can" ? "#e14b4b" : "#b6ff3c", 0.012);
      can.rotation.z = Math.PI / 2;
      const lab = P(MB.CreateCylinder("l", { diameter: 0.132, height: 0.07, tessellation: 12 }, scene), type === "soda_can" ? "#f4f1ea" : "#1b1420", 0);
      lab.rotation.z = Math.PI / 2;
      break;
    }
    case "coin_pile": {
      for (const [x, y, z] of [[0, -0.03, 0], [0.04, -0.01, 0.03], [-0.03, 0.01, 0.02], [0.01, 0.03, -0.02], [-0.04, -0.03, -0.04]]) {
        const c = P(MB.CreateCylinder("c", { diameter: 0.07, height: 0.015, tessellation: 10 }, scene), "#d4af37", 0.006);
        c.position.set(x, y, z); c.rotation.x = (x + z) * 4;
      }
      break;
    }
    case "newspaper": {
      const n = P(MB.CreateBox("n", { width: 0.26, height: 0.03, depth: 0.18 }, scene), "#e8e2d4", 0.01);
      n.rotation.y = 0.2;
      const hl = P(MB.CreateBox("h", { width: 0.2, height: 0.032, depth: 0.04 }, scene), "#1b1420", 0);
      hl.position.z = -0.05; hl.rotation.y = 0.2;
      break;
    }
    case "donut": {
      const d = P(MB.CreateTorus("d", { diameter: 0.17, thickness: 0.08, tessellation: 14 }, scene), "#d9a05b", 0.012);
      const icing = P(MB.CreateTorus("i", { diameter: 0.17, thickness: 0.07, tessellation: 14 }, scene), "#ff8fc8", 0);
      icing.position.y = 0.018; icing.scaling.y = 0.55; void d;
      break;
    }
    case "gold_bar": {
      const b = P(MB.CreateCylinder("g", { diameterTop: 0.16, diameterBottom: 0.22, height: 0.08, tessellation: 4 }, scene), "#ffcf3a", 0.012);
      b.rotation.y = Math.PI / 4; b.scaling.z = 0.55;
      const shine = P(MB.CreateBox("s", { width: 0.1, height: 0.005, depth: 0.03 }, scene), "#fff6c0", 0);
      shine.position.y = 0.042;
      break;
    }
    case "diamond_ring": {
      const band = P(MB.CreateTorus("b", { diameter: 0.11, thickness: 0.02, tessellation: 14 }, scene), "#ffcf3a", 0.008);
      band.rotation.x = Math.PI / 2;
      const gem = P(MB.CreatePolyhedron("gem", { type: 1, size: 0.045 }, scene), "#bff4ff", 0.008);
      gem.position.y = 0.08;
      break;
    }
    case "money_bag": {
      const bag = P(MB.CreateSphere("bag", { diameter: 0.55, segments: 10 }, scene), "#b99a5c");
      bag.scaling.y = 0.85; bag.position.y = -0.04;
      const neck = P(MB.CreateCylinder("n", { diameterTop: 0.2, diameterBottom: 0.12, height: 0.14, tessellation: 10 }, scene), "#b99a5c", 0.015);
      neck.position.y = 0.25;
      const tie = P(MB.CreateTorus("t", { diameter: 0.14, thickness: 0.03, tessellation: 10 }, scene), "#6b4a2b", 0.01);
      tie.position.y = 0.2;
      const sign = P(MB.CreateBox("s", { width: 0.18, height: 0.22, depth: 0.02 }, scene), "#2f7a3b", 0);
      sign.position.set(0, -0.02, 0.27);
      const bar = P(MB.CreateBox("s2", { width: 0.03, height: 0.26, depth: 0.025 }, scene), "#2f7a3b", 0);
      bar.position.set(0, -0.02, 0.271);
      break;
    }
    case "award_trophy": {
      const base = P(MB.CreateBox("b", { width: 0.22, height: 0.08, depth: 0.22 }, scene), "#3a3444", 0.015);
      base.position.y = -0.2;
      const stem = P(MB.CreateCylinder("s", { diameter: 0.06, height: 0.16, tessellation: 8 }, scene), "#ffcf3a", 0.012);
      stem.position.y = -0.09;
      const cup = P(MB.CreateCylinder("c", { diameterTop: 0.3, diameterBottom: 0.1, height: 0.24, tessellation: 12 }, scene), "#ffcf3a", 0.015);
      cup.position.y = 0.11;
      for (const sx of [-1, 1]) { const h = P(MB.CreateTorus("h", { diameter: 0.12, thickness: 0.025, tessellation: 10 }, scene), "#ffcf3a", 0.008); h.rotation.z = Math.PI / 2; h.position.set(sx * 0.16, 0.12, 0); }
      break;
    }
    case "hardware_wallet": {
      P(MB.CreateBox("w", { width: 0.13, height: 0.03, depth: 0.07 }, scene), "#1b1f2e", 0.01);
      const scr = P(MB.CreateBox("s", { width: 0.07, height: 0.005, depth: 0.04 }, scene), "#39ffb0", 0);
      scr.position.set(-0.02, 0.017, 0);
      const btn = P(MB.CreateCylinder("b", { diameter: 0.025, height: 0.01, tessellation: 8 }, scene), "#ff8a3c", 0);
      btn.position.set(0.045, 0.018, 0);
      break;
    }
    case "cash_bundle": {
      P(MB.CreateBox("c", { width: 0.2, height: 0.07, depth: 0.1 }, scene), "#6fbf4a", 0.01);
      P(MB.CreateBox("b", { width: 0.04, height: 0.072, depth: 0.102 }, scene), "#f4f1ea", 0);
      break;
    }
    case "cash_register": {
      const base = P(MB.CreateBox("b", { width: 0.6, height: 0.25, depth: 0.5 }, scene), "#6f6a78");
      base.position.y = -0.15;
      const top = P(MB.CreateBox("t", { width: 0.55, height: 0.25, depth: 0.3 }, scene), "#8e8a94");
      top.position.set(0, 0.07, -0.08); top.rotation.x = -0.4;
      const screen = P(MB.CreateBox("s", { width: 0.3, height: 0.15, depth: 0.1 }, scene), "#39ffb0", 0.01);
      screen.position.set(0, 0.28, -0.15);
      const drawer = P(MB.CreateBox("d", { width: 0.5, height: 0.08, depth: 0.02 }, scene), "#d4af37", 0);
      drawer.position.set(0, -0.15, 0.26);
      break;
    }
    case "laptop": {
      const b = P(MB.CreateBox("b", { width: 0.5, height: 0.04, depth: 0.35 }, scene), "#9aa3b5");
      b.position.y = -0.1;
      const lid = P(MB.CreateBox("l", { width: 0.5, height: 0.35, depth: 0.03 }, scene), "#9aa3b5");
      lid.position.set(0, 0.07, -0.17); lid.rotation.x = -0.25;
      const scr = P(MB.CreateBox("s", { width: 0.42, height: 0.27, depth: 0.032 }, scene), "#4fb3ff", 0);
      scr.position.set(0, 0.07, -0.155); scr.rotation.x = -0.25;
      break;
    }
    case "sunglasses": {
      for (const x of [-0.05, 0.05]) { const l = P(MB.CreateCylinder("l", { diameter: 0.08, height: 0.02, tessellation: 10 }, scene), "#1b1420", 0.008); l.rotation.x = Math.PI / 2; l.position.x = x; }
      P(MB.CreateBox("br", { width: 0.2, height: 0.015, depth: 0.015 }, scene), "#d4af37", 0);
      break;
    }
    case "canned_beans": {
      P(MB.CreateCylinder("c", { diameter: 0.15, height: 0.18, tessellation: 12 }, scene), "#c9ced8", 0.012);
      P(MB.CreateCylinder("l", { diameter: 0.152, height: 0.1, tessellation: 12 }, scene), "#d9632b", 0);
      break;
    }
    case "lottery_ticket": {
      P(MB.CreateBox("t", { width: 0.2, height: 0.01, depth: 0.1 }, scene), "#ffcf3a", 0.008);
      const sc = P(MB.CreateBox("s", { width: 0.12, height: 0.012, depth: 0.05 }, scene), "#9aa3b5", 0);
      sc.position.x = 0.02;
      break;
    }
    case "fancy_cheese": {
      const w = P(MB.CreateCylinder("w", { diameter: 0.25, height: 0.1, tessellation: 16, arc: 0.85 }, scene), "#ffd23c", 0.012);
      w.rotation.y = 0.5;
      break;
    }
    case "gold_chain": {
      for (let i = 0; i < 3; i++) { const r = P(MB.CreateTorus("r", { diameter: 0.18 - i * 0.03, thickness: 0.025, tessellation: 14 }, scene), "#ffcf3a", 0.006); r.rotation.x = i * 0.6; }
      break;
    }
    case "guitar": {
      const body = P(MB.CreateCylinder("b", { diameter: 0.45, height: 0.1, tessellation: 14 }, scene), "#b5653b");
      body.rotation.x = Math.PI / 2; body.position.z = -0.2;
      const hole = P(MB.CreateCylinder("h", { diameter: 0.12, height: 0.102, tessellation: 10 }, scene), "#1b1420", 0);
      hole.rotation.x = Math.PI / 2; hole.position.z = -0.2;
      const neck = P(MB.CreateBox("n", { width: 0.06, height: 0.04, depth: 0.5 }, scene), "#6b4a2b", 0.01);
      neck.position.set(0, 0, 0.2);
      break;
    }
    case "bagel": {
      P(MB.CreateTorus("b", { diameter: 0.15, thickness: 0.07, tessellation: 12 }, scene), "#c9955b", 0.01);
      break;
    }
    case "baguette": {
      const b = P(MB.CreateCapsule("b", { radius: 0.045, height: 0.34 }, scene), "#d9a05b", 0.01);
      b.rotation.z = Math.PI / 2;
      break;
    }
    case "birthday_cake": {
      const c = P(MB.CreateCylinder("c", { diameter: 0.5, height: 0.25, tessellation: 16 }, scene), "#ff8fa3");
      c.position.y = -0.08;
      const icing = P(MB.CreateCylinder("i", { diameter: 0.52, height: 0.05, tessellation: 16 }, scene), "#f4f1ea", 0.01);
      icing.position.y = 0.06;
      for (const a of [0, 2.1, 4.2]) { const cd = P(MB.CreateCylinder("cd", { diameter: 0.025, height: 0.1 }, scene), "#4fb3ff", 0); cd.position.set(Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12); }
      break;
    }
    // ---- Phase 3 event loot ----
    case "airdrop_crate": {
      P(MB.CreateBox("c", { size: 1.25 }, scene), "#b5824a", 0.04);
      for (const y of [-0.45, 0.45]) {
        const band = P(MB.CreateBox("b", { width: 1.3, height: 0.14, depth: 1.3 }, scene), "#6b4a2b", 0.02);
        band.position.y = y;
      }
      const stamp = P(MB.CreateBox("s", { width: 0.7, height: 0.3, depth: 1.27 }, scene), "#e14b4b", 0);
      stamp.rotation.z = 0.2;
      const star = P(MB.CreateCylinder("st", { diameter: 0.35, height: 1.28, tessellation: 5 }, scene), "#ffe14a", 0);
      star.rotation.z = Math.PI / 2;
      star.position.y = 0.05;
      break;
    }
    // ---- C4a: street junk (sized to each item's collision sphere) ----
    case "cafe_chair": {
      const seat = P(MB.CreateBox("s", { width: 0.42, height: 0.05, depth: 0.42 }, scene), "#c8c4cc", 0.015); seat.position.y = -0.02;
      const back = P(MB.CreateBox("b", { width: 0.42, height: 0.36, depth: 0.04 }, scene), "#c8c4cc", 0.015); back.position.set(0, 0.17, -0.2);
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = P(MB.CreateCylinder("l", { diameter: 0.04, height: 0.32, tessellation: 5 }, scene), "#3a3444", 0.01); l.position.set(x, -0.2, z); }
      break;
    }
    case "bin_lid": {
      P(MB.CreateCylinder("lid", { diameter: 0.62, height: 0.06, tessellation: 16 }, scene), "#8e96a8", 0.02);
      const h = P(MB.CreateBox("h", { width: 0.2, height: 0.05, depth: 0.05 }, scene), "#5a6070", 0.01); h.position.y = 0.06;
      break;
    }
    case "glass_bottle": {
      P(MB.CreateCylinder("b", { diameter: 0.09, height: 0.17, tessellation: 10 }, scene), "#3f8f4f", 0.01);
      const n = P(MB.CreateCylinder("n", { diameterTop: 0.03, diameterBottom: 0.07, height: 0.08, tessellation: 8 }, scene), "#3f8f4f", 0.01); n.position.y = 0.12;
      break;
    }
    case "brick": P(MB.CreateBox("br", { width: 0.22, height: 0.07, depth: 0.11 }, scene), "#b3553f", 0.012); break;
    case "smelly_fish": {
      const b = P(MB.CreateSphere("f", { diameterX: 0.28, diameterY: 0.1, diameterZ: 0.1, segments: 8 }, scene), "#8a9ab0", 0.012);
      void b;
      const t = P(MB.CreateCylinder("t", { diameterTop: 0, diameterBottom: 0.12, height: 0.1, tessellation: 3 }, scene), "#6a7a90", 0.01); t.rotation.z = Math.PI / 2; t.position.x = -0.17;
      const e = P(MB.CreateSphere("e", { diameter: 0.025, segments: 4 }, scene), "#1b1420", 0); e.position.set(0.1, 0.02, 0.04);
      break;
    }
    case "traffic_barrier": {
      const bar = P(MB.CreateBox("bar", { width: 0.9, height: 0.16, depth: 0.05 }, scene), "#f4f1ea", 0.015); bar.position.y = 0.12;
      for (const x of [-0.3, 0, 0.3]) { const st = P(MB.CreateBox("st", { width: 0.12, height: 0.165, depth: 0.055 }, scene), "#e14b4b", 0); st.position.set(x, 0.12, 0); }
      for (const x of [-0.38, 0.38]) { const l = P(MB.CreateBox("l", { width: 0.05, height: 0.42, depth: 0.3 }, scene), "#3a3444", 0.01); l.position.set(x, -0.14, 0); }
      break;
    }
    case "plastic_crate": {
      for (let i = 0; i < 3; i++) { const c = P(MB.CreateBox("c", { width: 0.75, height: 0.36, depth: 0.55 }, scene), i % 2 ? "#3d6fb5" : "#e14b4b", 0.02); c.position.set((i - 1) * 0.04, -0.4 + i * 0.37, 0); c.rotation.y = (i - 1) * 0.12; }
      break;
    }
    case "oil_barrel": {
      P(MB.CreateCylinder("b", { diameter: 0.8, height: 1.0, tessellation: 16 }, scene), "#3d6f5a", 0.03);
      for (const y of [-0.25, 0.25]) { const r = P(MB.CreateTorus("r", { diameter: 0.81, thickness: 0.05, tessellation: 16 }, scene), "#2b4f40", 0); r.position.y = y; }
      break;
    }
    case "shopping_trolley": {
      const basket = P(MB.CreateBox("bk", { width: 0.6, height: 0.45, depth: 0.85 }, scene), "#b8b4c8", 0.02); basket.position.y = 0.15;
      const base = P(MB.CreateBox("bs", { width: 0.5, height: 0.05, depth: 0.8 }, scene), "#8e8a94", 0.01); base.position.y = -0.3;
      const handle = P(MB.CreateBox("h", { width: 0.62, height: 0.05, depth: 0.05 }, scene), "#d6264a", 0.01); handle.position.set(0, 0.45, -0.48);
      for (const [x, z] of [[-0.22, -0.32], [0.22, -0.32], [-0.22, 0.32], [0.22, 0.32]]) { const w = P(MB.CreateCylinder("w", { diameter: 0.14, height: 0.05, tessellation: 8 }, scene), "#1b1420", 0.01); w.rotation.z = Math.PI / 2; w.position.set(x, -0.52, z); }
      break;
    }
    default: {
      P(MB.CreateBox("unknown", { size: 0.4 }, scene), "#ff00ff");
    }
  }
  // Performance (Phase 3.5, ~150 items in the bigger city): merge the coloured parts of each
  // item into ONE mesh (1 draw call + outline instead of 3-8). Decals/glass stay separate.
  if (meshes.length > 1) {
    const outline = Math.max(...meshes.map((m) => (m.renderOutline ? m.outlineWidth : 0)));
    const merged = bakeGroup(scene, root, outline);
    if (merged) {
      if (outlineColor) merged.outlineColor = outlineColor;
      const rest = meshes.filter((m) => !m.isDisposed());
      return { root, meshes: [merged, ...rest] };
    }
  }
  return { root, meshes };
}
