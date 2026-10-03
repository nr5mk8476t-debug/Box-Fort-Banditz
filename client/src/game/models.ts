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
    // ---- C4b: laundry finds + spray cans ----
    case "odd_sock": {
      const leg = P(MB.CreateBox("leg", { width: 0.08, height: 0.16, depth: 0.05 }, scene), "#ff8fa3", 0.01); leg.position.y = 0.03;
      const foot = P(MB.CreateBox("foot", { width: 0.08, height: 0.06, depth: 0.14 }, scene), "#ff8fa3", 0.01); foot.position.set(0, -0.05, 0.05);
      const stripe = P(MB.CreateBox("st", { width: 0.085, height: 0.03, depth: 0.055 }, scene), "#43c7a6", 0); stripe.position.y = 0.08;
      break;
    }
    case "single_shoe": {
      const sole = P(MB.CreateBox("sole", { width: 0.1, height: 0.03, depth: 0.26 }, scene), "#f4f1ea", 0.01); sole.position.y = -0.05;
      const up = P(MB.CreateBox("up", { width: 0.1, height: 0.08, depth: 0.2 }, scene), "#d6264a", 0.012); up.position.set(0, 0.0, -0.02);
      break;
    }
    case "novelty_undies": {
      const b = P(MB.CreateBox("u", { width: 0.22, height: 0.12, depth: 0.03 }, scene), "#ffe14a", 0.01);
      void b;
      for (const x of [-0.06, 0.05]) { const dot = P(MB.CreateCylinder("pz", { diameter: 0.04, height: 0.035, tessellation: 3 }, scene), "#e14b4b", 0); dot.rotation.x = Math.PI / 2; dot.position.set(x, 0.01, 0); }
      break;
    }
    case "fresh_laundry": case "designer_hoodie": {
      const col = type === "designer_hoodie" ? "#1b1420" : "#4f7fd1";
      const body = P(MB.CreateBox("h", { width: 0.28, height: 0.07, depth: 0.22 }, scene), col, 0.012); void body;
      const hood = P(MB.CreateBox("hd", { width: 0.14, height: 0.05, depth: 0.08 }, scene), col, 0.01); hood.position.set(0, 0.05, -0.08);
      if (type === "designer_hoodie") { const logo = P(MB.CreateBox("g", { width: 0.09, height: 0.075, depth: 0.09 }, scene), "#d9a632", 0); logo.position.set(0, 0.0, 0.04); }
      else { const tag = P(MB.CreateBox("t", { width: 0.1, height: 0.075, depth: 0.03 }, scene), "#f4f1ea", 0); tag.position.set(0, 0.0, 0.1); }
      break;
    }
    case "designer_scarf": {
      for (let i = 0; i < 3; i++) { const seg = P(MB.CreateBox("s", { width: 0.07, height: 0.02, depth: 0.1 }, scene), i % 2 ? "#d9a632" : "#8a1f2e", 0.008); seg.position.set(-0.06 + i * 0.06, 0, (i % 2) * 0.03); seg.rotation.y = i * 0.5; }
      break;
    }
    // ---- C5b: Chinatown ----
    case "dumpling_box": {
      P(MB.CreateBox("b", { width: 0.2, height: 0.08, depth: 0.14 }, scene), "#f4f1ea", 0.01);
      for (let i = 0; i < 3; i++) { const dp = P(MB.CreateSphere("d", { diameter: 0.06, segments: 5 }, scene), "#f3e2b8", 0.005); dp.scaling.y = 0.6; dp.position.set(-0.06 + i * 0.06, 0.05, 0); }
      const lid = P(MB.CreateBox("l", { width: 0.2, height: 0.01, depth: 0.05 }, scene), "#c0282a", 0); lid.position.set(0, 0.045, -0.06);
      break;
    }
    case "bao_bun": {
      const b = P(MB.CreateSphere("b", { diameter: 0.15, segments: 8 }, scene), "#f7efe0", 0.01); b.scaling.y = 0.7;
      const top = P(MB.CreateSphere("t", { diameter: 0.04, segments: 4 }, scene), "#e8d8b0", 0); top.position.y = 0.05;
      break;
    }
    case "fortune_cookie": {
      const c = P(MB.CreateTorus("c", { diameter: 0.07, thickness: 0.04, tessellation: 8 }, scene), "#e8b45a", 0.008); c.scaling.set(1, 0.6, 1.4);
      const slip = P(MB.CreateBox("s", { width: 0.06, height: 0.005, depth: 0.015 }, scene), "#f4f1ea", 0); slip.position.set(0.05, 0, 0);
      break;
    }
    case "mooncake": {
      P(MB.CreateCylinder("m", { diameter: 0.15, height: 0.06, tessellation: 12 }, scene), "#c98a2a", 0.01);
      const pat = P(MB.CreateTorus("p", { diameter: 0.1, thickness: 0.012, tessellation: 12 }, scene), "#a8641e", 0); pat.position.y = 0.03;
      break;
    }
    case "live_crab": {
      const b = P(MB.CreateSphere("b", { diameter: 0.18, segments: 6 }, scene), "#e0502c", 0.01); b.scaling.y = 0.5;
      for (const sx of [-1, 1]) {
        const cl = P(MB.CreateSphere("c", { diameter: 0.07, segments: 5 }, scene), "#e0502c", 0.008); cl.position.set(sx * 0.1, 0.02, 0.09);
        for (let k = 0; k < 3; k++) { const lg = P(MB.CreateBox("l", { width: 0.08, height: 0.012, depth: 0.012 }, scene), "#c8401e", 0); lg.position.set(sx * 0.1, -0.02, -0.04 + k * 0.04); lg.rotation.z = sx * 0.4; }
      }
      for (const sx of [-0.03, 0.03]) { const e = P(MB.CreateSphere("e", { diameter: 0.025, segments: 4 }, scene), "#1b1420", 0); e.position.set(sx, 0.05, 0.07); }
      break;
    }
    case "paper_fan": {
      const f = P(MB.CreateCylinder("f", { diameter: 0.26, height: 0.01, tessellation: 12, arc: 0.5 }, scene), "#c0282a", 0.008); void f;
      const h = P(MB.CreateBox("h", { width: 0.015, height: 0.012, depth: 0.1 }, scene), "#8a5a3a", 0); h.position.set(0, 0, -0.04);
      break;
    }
    case "lucky_cat": {
      P(MB.CreateBox("b", { width: 0.14, height: 0.14, depth: 0.1 }, scene), "#f4f1ea", 0.01);
      const hd = P(MB.CreateSphere("h", { diameter: 0.13, segments: 8 }, scene), "#f4f1ea", 0.01); hd.position.y = 0.12;
      for (const sx of [-0.04, 0.04]) { const ear = P(MB.CreateCylinder("e", { diameterTop: 0, diameterBottom: 0.04, height: 0.04, tessellation: 4 }, scene), "#f4f1ea", 0.005); ear.position.set(sx, 0.18, 0); }
      const paw = P(MB.CreateBox("p", { width: 0.035, height: 0.08, depth: 0.035 }, scene), "#f4f1ea", 0.005); paw.position.set(0.08, 0.14, 0.02);
      const coin = P(MB.CreateCylinder("c", { diameter: 0.06, height: 0.01, tessellation: 10 }, scene), "#ffd54a", 0); coin.rotation.x = Math.PI / 2; coin.position.set(0, 0.0, 0.055);
      const collar = P(MB.CreateBox("col", { width: 0.1, height: 0.015, depth: 0.08 }, scene), "#c0282a", 0); collar.position.y = 0.075;
      break;
    }
    case "jade_dragon": {
      const base = P(MB.CreateCylinder("base", { diameter: 0.4, height: 0.08, tessellation: 12 }, scene), "#5a3a2a", 0.02); base.position.y = -0.2;
      for (let i = 0; i < 6; i++) { const seg = P(MB.CreateSphere("s", { diameter: 0.16 - i * 0.012, segments: 6 }, scene), "#3fae78", 0.01); seg.position.set(Math.sin(i * 1.1) * 0.12, -0.12 + i * 0.07, Math.cos(i * 1.1) * 0.08); }
      const head = P(MB.CreateBox("h", { width: 0.12, height: 0.1, depth: 0.16 }, scene), "#3fae78", 0.01); head.position.set(0, 0.32, 0.06);
      for (const sx of [-0.04, 0.04]) { const horn = P(MB.CreateCylinder("hr", { diameterTop: 0, diameterBottom: 0.025, height: 0.08, tessellation: 4 }, scene), "#e8b422", 0); horn.position.set(sx, 0.4, 0.02); }
      break;
    }
    case "red_envelope": {
      P(MB.CreateBox("e", { width: 0.1, height: 0.01, depth: 0.16 }, scene), "#d8261e", 0.008);
      const g = P(MB.CreateBox("g", { width: 0.05, height: 0.012, depth: 0.05 }, scene), "#ffd54a", 0); g.position.set(0, 0.002, 0.02);
      break;
    }
    // ---- C5c: the bank and the golden stashes ----
    case "cash_bag": {
      const b = P(MB.CreateSphere("b", { diameter: 0.26, segments: 8 }, scene), "#c9b98a", 0.012); b.scaling.y = 0.85;
      const neck = P(MB.CreateCylinder("n", { diameterTop: 0.1, diameterBottom: 0.06, height: 0.07, tessellation: 8 }, scene), "#c9b98a", 0.008); neck.position.y = 0.13;
      const tie = P(MB.CreateTorus("t", { diameter: 0.07, thickness: 0.015, tessellation: 10 }, scene), "#8a5a3a", 0); tie.position.y = 0.11;
      const d = P(MB.CreateBox("d", { width: 0.02, height: 0.1, depth: 0.02 }, scene), "#2f7a4f", 0); d.position.set(0, 0.0, 0.112);
      for (const y of [0.025, -0.025]) { const bar = P(MB.CreateBox("s", { width: 0.07, height: 0.016, depth: 0.02 }, scene), "#2f7a4f", 0); bar.position.set(0, y, 0.11); }
      break;
    }
    case "pearl_necklace": {
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, pr = P(MB.CreateSphere("p", { diameter: 0.035, segments: 5 }, scene), "#f7f3ec", 0.004); pr.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.1); }
      const cl = P(MB.CreateSphere("c", { diameter: 0.03, segments: 4 }, scene), "#ffd54a", 0); cl.position.set(0, 0, -0.1);
      break;
    }
    case "bearer_bond": {
      const sheet = P(MB.CreateBox("s", { width: 0.2, height: 0.008, depth: 0.14 }, scene), "#e8e0c8", 0.006); void sheet;
      const border = P(MB.CreateBox("b", { width: 0.17, height: 0.01, depth: 0.11 }, scene), "#2f7a4f", 0); border.position.y = 0.001;
      const inner = P(MB.CreateBox("i", { width: 0.15, height: 0.011, depth: 0.09 }, scene), "#e8e0c8", 0); inner.position.y = 0.002;
      const seal = P(MB.CreateCylinder("se", { diameter: 0.035, height: 0.013, tessellation: 10 }, scene), "#c0282a", 0); seal.position.set(0.05, 0.004, -0.03);
      break;
    }
    case "family_photo": {
      P(MB.CreateBox("f", { width: 0.16, height: 0.2, depth: 0.02 }, scene), "#8a5a3a", 0.008);
      const ph = P(MB.CreateBox("p", { width: 0.13, height: 0.16, depth: 0.022 }, scene), "#9fc8e0", 0); void ph;
      for (let i = 0; i < 3; i++) { const hd = P(MB.CreateSphere("h", { diameter: 0.035, segments: 4 }, scene), "#f0c8a0", 0); hd.position.set(-0.04 + i * 0.04, 0.02, 0.013); const bd = P(MB.CreateBox("b", { width: 0.03, height: 0.05, depth: 0.004 }, scene), ["#c0282a", "#ffd54a", "#3d6fb5"][i], 0); bd.position.set(-0.04 + i * 0.04, -0.03, 0.012); }
      break;
    }
    case "bank_keycard": {
      P(MB.CreateBox("k", { width: 0.13, height: 0.008, depth: 0.085 }, scene), "#f4f1ea", 0.006);
      const stripe = P(MB.CreateBox("s", { width: 0.13, height: 0.01, depth: 0.02 }, scene), "#1b1420", 0); stripe.position.z = -0.025;
      const chip = P(MB.CreateBox("c", { width: 0.025, height: 0.011, depth: 0.02 }, scene), "#ffd54a", 0); chip.position.set(-0.035, 0, 0.015);
      const logo = P(MB.CreateBox("l", { width: 0.03, height: 0.011, depth: 0.03 }, scene), "#2f7a4f", 0); logo.position.set(0.035, 0, 0.015);
      const lanyard = P(MB.CreateTorus("y", { diameter: 0.12, thickness: 0.008, tessellation: 12 }, scene), "#c0282a", 0); lanyard.position.set(0, 0, 0.1);
      break;
    }
    case "gold_nose": {
      const n = P(MB.CreateSphere("n", { diameter: 0.18, segments: 10 }, scene), "#ffd54a", 0.01); n.scaling.set(0.85, 0.8, 1.5);
      for (const sx of [-0.03, 0.03]) { const nos = P(MB.CreateSphere("h", { diameter: 0.03, segments: 4 }, scene), "#8a6a1a", 0); nos.position.set(sx, -0.05, 0.08); }
      break;
    }
    case "mayors_medal": {
      const m = P(MB.CreateCylinder("m", { diameter: 0.12, height: 0.02, tessellation: 16 }, scene), "#ffd54a", 0.008); m.rotation.x = Math.PI / 2;
      const star = P(MB.CreateCylinder("s", { diameter: 0.07, height: 0.024, tessellation: 5 }, scene), "#e8b83a", 0); star.rotation.x = Math.PI / 2;
      for (const [x, c] of [[-0.02, "#c0282a"], [0.02, "#3d6fb5"]] as const) { const rb = P(MB.CreateBox("r", { width: 0.035, height: 0.1, depth: 0.012 }, scene), c, 0.004); rb.position.set(x, 0.1, 0); }
      break;
    }
    case "golden_toilet_seat": {
      const ring = P(MB.CreateTorus("r", { diameter: 0.42, thickness: 0.09, tessellation: 20 }, scene), "#ffd54a", 0.015); ring.scaling.z = 1.25;
      const lid = P(MB.CreateCylinder("l", { diameter: 0.5, height: 0.03, tessellation: 20 }, scene), "#e8b83a", 0.012); lid.scaling.z = 1.2; lid.position.set(0, 0.2, -0.26); lid.rotation.x = -1.35;
      for (const sx of [-0.12, 0.12]) { const h = P(MB.CreateCylinder("h", { diameter: 0.05, height: 0.07, tessellation: 8 }, scene), "#c99a22", 0.006); h.rotation.z = Math.PI / 2; h.position.set(sx, 0.02, -0.28); }
      break;
    }
    case "diamond_pigeon": {
      const body = P(MB.CreatePolyhedron("b", { type: 1, size: 0.1 }, scene), "#bfe8ff", 0.008); body.scaling.set(1, 0.9, 1.5);
      const head = P(MB.CreatePolyhedron("h", { type: 1, size: 0.05 }, scene), "#e8f7ff", 0.006); head.position.set(0, 0.1, 0.12);
      const beak = P(MB.CreateCylinder("k", { diameterTop: 0, diameterBottom: 0.03, height: 0.05, tessellation: 4 }, scene), "#ffd54a", 0); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.1, 0.18);
      const tail = P(MB.CreateBox("t", { width: 0.1, height: 0.02, depth: 0.1 }, scene), "#9fd4f0", 0.004); tail.position.set(0, 0.02, -0.16); tail.rotation.x = -0.3;
      const base = P(MB.CreateCylinder("base", { diameter: 0.14, height: 0.03, tessellation: 12 }, scene), "#ffd54a", 0.006); base.position.y = -0.1;
      break;
    }
    // ---- C5c.2: LE DUMPSTÈRE ----
    case "fancy_fizz": {
      P(MB.CreateCylinder("b", { diameter: 0.1, height: 0.24, tessellation: 10 }, scene), "#2f7a4f", 0.008);
      const neck = P(MB.CreateCylinder("n", { diameterTop: 0.04, diameterBottom: 0.09, height: 0.1, tessellation: 10 }, scene), "#2f7a4f", 0.006); neck.position.y = 0.17;
      const foil = P(MB.CreateCylinder("f", { diameter: 0.05, height: 0.05, tessellation: 8 }, scene), "#ffd54a", 0); foil.position.y = 0.24;
      const lbl = P(MB.CreateCylinder("l", { diameter: 0.104, height: 0.08, tessellation: 10 }, scene), "#f4f1ea", 0); lbl.position.y = -0.02;
      break;
    }
    case "silver_cutlery": {
      for (let i = 0; i < 3; i++) { const h = P(MB.CreateBox("c", { width: 0.025, height: 0.012, depth: 0.2 }, scene), "#d8dce4", 0.004); h.position.x = -0.04 + i * 0.04; const head = P(MB.CreateBox("h", { width: 0.04, height: 0.013, depth: 0.05 }, scene), "#e8ecf2", 0.004); head.position.set(-0.04 + i * 0.04, 0, 0.12); }
      const ribbon = P(MB.CreateBox("r", { width: 0.14, height: 0.016, depth: 0.03 }, scene), "#6b1f2e", 0); ribbon.position.z = 0.02;
      break;
    }
    case "macaron_box": {
      P(MB.CreateBox("b", { width: 0.22, height: 0.06, depth: 0.1 }, scene), "#ffd6e6", 0.008);
      ["#ff8fa3", "#b6ff3c", "#ffd54a", "#9fd4f0"].forEach((c, i) => { const m = P(MB.CreateCylinder("m", { diameter: 0.045, height: 0.035, tessellation: 10 }, scene), c, 0.003); m.rotation.z = Math.PI / 2; m.position.set(-0.075 + i * 0.05, 0.045, 0); });
      break;
    }
    case "golden_truffle": {
      const t = P(MB.CreateSphere("t", { diameter: 0.16, segments: 6 }, scene), "#ffd54a", 0.01); t.scaling.set(1, 0.85, 1.1);
      for (let i = 0; i < 6; i++) { const b = P(MB.CreateSphere("k", { diameter: 0.05, segments: 4 }, scene), "#e8b83a", 0); b.position.set(Math.cos(i) * 0.07, Math.sin(i * 2.1) * 0.04, Math.sin(i) * 0.07); }
      const cush = P(MB.CreateBox("c", { width: 0.2, height: 0.03, depth: 0.2 }, scene), "#8e1f4e", 0.006); cush.position.y = -0.08;
      break;
    }
    // ---- C5c.3: THE COMPACTOR ----
    case "glow_stick": {
      const g = P(MB.CreateCylinder("g", { diameter: 0.045, height: 0.3, tessellation: 8 }, scene), "#5aff7a", 0.006); g.rotation.z = 0.3;
      const cap = P(MB.CreateCylinder("c", { diameter: 0.05, height: 0.03, tessellation: 8 }, scene), "#f4f1ea", 0); cap.position.set(-0.044, 0.142, 0);
      break;
    }
    case "neon_fizz": {
      P(MB.CreateCylinder("b", { diameter: 0.09, height: 0.2, tessellation: 10 }, scene), "#ff3cac", 0.008);
      const neck = P(MB.CreateCylinder("n", { diameterTop: 0.035, diameterBottom: 0.08, height: 0.08, tessellation: 10 }, scene), "#ff3cac", 0.006); neck.position.y = 0.14;
      const cap = P(MB.CreateCylinder("c", { diameter: 0.04, height: 0.03, tessellation: 8 }, scene), "#5aff7a", 0); cap.position.y = 0.195;
      const lbl = P(MB.CreateCylinder("l", { diameter: 0.094, height: 0.07, tessellation: 10 }, scene), "#1b1420", 0); lbl.position.y = -0.01;
      break;
    }
    case "vinyl_record": {
      const sl = P(MB.CreateBox("s", { width: 0.32, height: 0.32, depth: 0.02 }, scene), "#ffd54a", 0.008); sl.rotation.x = -0.2;
      const rec = P(MB.CreateCylinder("r", { diameter: 0.3, height: 0.012, tessellation: 18 }, scene), "#1b1420", 0.004); rec.rotation.x = Math.PI / 2 - 0.2; rec.position.set(0.09, 0.03, -0.01);
      const lab = P(MB.CreateCylinder("l", { diameter: 0.1, height: 0.014, tessellation: 12 }, scene), "#ff3cac", 0); lab.rotation.x = Math.PI / 2 - 0.2; lab.position.set(0.09, 0.03, -0.012);
      break;
    }
    case "dj_headphones": {
      const band = P(MB.CreateTorus("b", { diameter: 0.24, thickness: 0.03, tessellation: 14 }, scene), "#1b1420", 0.006); band.rotation.x = Math.PI / 2; band.scaling.y = 1.1;
      for (const s of [-1, 1]) { const cup = P(MB.CreateCylinder("c", { diameter: 0.11, height: 0.06, tessellation: 12 }, scene), "#ff3cac", 0.006); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.12, -0.05, 0); }
      break;
    }
    case "vip_wristband": {
      const b = P(MB.CreateTorus("w", { diameter: 0.11, thickness: 0.025, tessellation: 14 }, scene), "#ffd54a", 0.005); b.rotation.x = 0.4;
      const tag = P(MB.CreateBox("t", { width: 0.05, height: 0.03, depth: 0.01 }, scene), "#ff3cac", 0); tag.position.set(0, 0.0, 0.06);
      break;
    }
    case "mirror_ball": {
      const ball = P(MB.CreateSphere("m", { diameter: 0.5, segments: 8 }, scene), "#c9ccd4", 0.012);
      void ball;
      for (let i = 0; i < 14; i++) { const a = i * 2.4, e = Math.sin(i * 1.7) * 0.9; const can = P(MB.CreateBox("c", { width: 0.07, height: 0.07, depth: 0.02 }, scene), ["#d6264a", "#3d6fb5", "#ffd54a", "#e8ecf2"][i % 4], 0); can.position.set(Math.cos(a) * Math.cos(e) * 0.25, Math.sin(e) * 0.25, Math.sin(a) * Math.cos(e) * 0.25); can.lookAt(can.position.scale(2)); }
      const hook = P(MB.CreateTorus("h", { diameter: 0.08, thickness: 0.015, tessellation: 8 }, scene), "#3a3444", 0); hook.position.y = 0.27;
      break;
    }
    case "golden_record": {
      const fr = P(MB.CreateBox("f", { width: 0.36, height: 0.36, depth: 0.03 }, scene), "#1b1420", 0.008);
      void fr;
      const rec = P(MB.CreateCylinder("r", { diameter: 0.28, height: 0.012, tessellation: 20 }, scene), "#ffd54a", 0.004); rec.rotation.x = Math.PI / 2; rec.position.z = 0.02;
      const lab = P(MB.CreateCylinder("l", { diameter: 0.09, height: 0.014, tessellation: 12 }, scene), "#d6264a", 0); lab.rotation.x = Math.PI / 2; lab.position.z = 0.022;
      const plate = P(MB.CreateBox("p", { width: 0.16, height: 0.03, depth: 0.005 }, scene), "#e8b83a", 0); plate.position.set(0, -0.155, 0.02);
      break;
    }
    case "spray_can": {
      P(MB.CreateCylinder("c", { diameter: 0.075, height: 0.18, tessellation: 12 }, scene), "#43c7a6", 0.01);
      const cap = P(MB.CreateCylinder("cap", { diameter: 0.07, height: 0.04, tessellation: 12 }, scene), "#ff5a3c", 0.008); cap.position.y = 0.11;
      const nz = P(MB.CreateBox("nz", { width: 0.02, height: 0.02, depth: 0.03 }, scene), "#f4f1ea", 0); nz.position.set(0, 0.14, 0.02);
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
