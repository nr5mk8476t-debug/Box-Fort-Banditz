// Draws the people of Trashington. PLACEHOLDER-QUALITY chunky shapes, but each type has a
// readable silhouette + colours, and every behaviour state has a pose:
// walk, idle, flee (arms up, running), stunned (spin + stars), chase (angry, red "!"),
// windup (arm pulled back), ko (flat on the ground + stars), film (phone up), gloat, huff.
// Poses ease toward targets (same animation approach as the players), so they never get stuck.
import { Scene, MeshBuilder, Mesh, TransformNode, StandardMaterial, Color3, type Camera } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured, bakeGroup } from "./look.ts";
import { NPC_DEFS, type NpcView } from "@bfb/shared";

const INTERP_MS = 110;
const DRAW_DISTANCE = 60;
const COP_DRAW_DISTANCE = 90; // you want to see them coming
const BIGSHOT_DRAW_DISTANCE = 90; // (no $$$ any more, Blake 5A: spot them by their fancy clothes)

interface Snap { t: number; x: number; y: number; z: number; yaw: number; }

interface Look {
  body: string; legs: string; skin: string; hat?: string; hatShape?: "cap" | "sunhat" | "beret" | "band" | "none" | "scarf";
  prop?: "camera" | "briefcase" | "phone" | "none" | "crumbs" | "cane" | "moneybag" | "laptop" | "rod"; bulk?: number; face?: string;
}

/** C5c.3: "Honest" Sal at PAWN-O-RAMA (he's that shop's cashier) */
const SAL_LOOK: Look = { body: "#8b5a2b", legs: "#3a3444", skin: "#f0c8a0", hat: "#5a4a3a", hatShape: "none", prop: "none", bulk: 1.3 };
const LOOKS: Record<string, Look> = {
  tourist: { body: "#ff9a3c", legs: "#e8d7a8", skin: "#f0b98a", hat: "#f3e2b8", hatShape: "sunhat", prop: "camera" },
  businessman: { body: "#5b6170", legs: "#3e4350", skin: "#e8a878", hat: "#2b2433", hatShape: "none", prop: "briefcase" },
  influencer: { body: "#ff6fb5", legs: "#f4f1ea", skin: "#f5c29a", hat: "#ffe14a", hatShape: "cap", prop: "phone" },
  jogger: { body: "#b6ff3c", legs: "#2b2433", skin: "#c98a5c", hat: "#ff5a3c", hatShape: "band", prop: "none" },
  gym_bro: { body: "#2fb6ff", legs: "#3e4350", skin: "#d99a6c", hat: "#2b2433", hatShape: "cap", prop: "none", bulk: 1.35 },
  mall_cop: { body: "#3d5a9e", legs: "#2b3350", skin: "#e8b48a", hat: "#2b3350", hatShape: "cap", prop: "none", bulk: 1.15 },
  mime: { body: "#f4f1ea", legs: "#1b1420", skin: "#ffffff", hat: "#1b1420", hatShape: "beret", prop: "none" },
  old_lady: { body: "#9f5fd6", legs: "#6b4c9a", skin: "#f0c8a0", hat: "#e8e2d4", hatShape: "scarf", prop: "cane", bulk: 1.05 },
  uncle_dumpster: { body: "#8e1f2e", legs: "#e0a878", skin: "#e0a878", hat: "#d8d0c4", hatShape: "band", prop: "none", bulk: 1.15 },
  fisherman: { body: "#4f6b3a", legs: "#3a4a2a", skin: "#e0a878", hat: "#8a9a5b", hatShape: "sunhat", prop: "rod", bulk: 1.15 },
  doorman: { body: "#6b1f2e", legs: "#1b1420", skin: "#e8b48a", hat: "#6b1f2e", hatShape: "cap", prop: "none", bulk: 1.2 },
  cashier: { body: "#d6264a", legs: "#2b2433", skin: "#e8b48a", hat: "#ffcf3a", hatShape: "cap", prop: "none" },
  raccoon: { body: "#8a8a96", legs: "#4a4652", skin: "#a3a3ae", hatShape: "none", prop: "none", bulk: 1.25 },
  millionaire: { body: "#2b2433", legs: "#1b1420", skin: "#f0c8a0", hat: "#1b1420", hatShape: "none", prop: "cane", bulk: 1.3 },
  bodyguard: { body: "#1b1420", legs: "#1b1420", skin: "#b07a52", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.45 },
  courier: { body: "#5a6070", legs: "#3e4350", skin: "#d99a6c", hat: "#3a3f55", hatShape: "none", prop: "moneybag", bulk: 1.25 },
  celebrity: { body: "#9b3fd6", legs: "#ffcf3a", skin: "#f5c29a", hat: "#ffcf3a", hatShape: "none", prop: "none" },
  fan: { body: "#ff6fb5", legs: "#3d6fb5", skin: "#e8b48a", hat: "#ff6fb5", hatShape: "cap", prop: "phone" },
  crypto_bro: { body: "#3d8f5a", legs: "#2b2433", skin: "#f0b98a", hat: "#3d8f5a", hatShape: "none", prop: "laptop" },
  cop: { body: "#1f3a78", legs: "#18203a", skin: "#e0a67c", hat: "#18203a", hatShape: "cap", prop: "none", bulk: 1.12 },
  // C5c.3: THE COMPACTOR's bouncer (Big Crunch), PAWN-O-RAMA's Big Vinnie; Le Dumpstère's maitre d'
  bouncer: { body: "#1b1420", legs: "#1b1420", skin: "#8a5a3a", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.6 },
  vinnie: { body: "#6b3fa0", legs: "#6b3fa0", skin: "#e0a878", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.45 },
  // R5: HOT STUFF PAWN & LOAN: Twitchy Lou (skinny, shifty) and Meat Locker (enormous)
  lou: { body: "#d8c9a0", legs: "#4a3a2a", skin: "#e8c09a", hat: "#2f8f4e", hatShape: "none", prop: "none", bulk: 0.85 },
  meat_locker: { body: "#f4f1ea", legs: "#2b2433", skin: "#c98a5c", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 2.0 },
  // R6: the Champ: an old prison arm-wrestling champion (orange jumpsuit, grey beard, a champion's belt, a golden spoon)
  // R7: Sticky Fran (FINDERS KEEPERS PAWN), Cold Cuts (Meat Locker's twin), Officer Pam on the station's front desk
  fran: { body: "#c84a8a", legs: "#2b2433", skin: "#f0c09a", hat: "#ff8fd0", hatShape: "none", prop: "none", bulk: 1.05 },
  cold_cuts: { body: "#3a4a3a", legs: "#2b2433", skin: "#c98a5c", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 2.0 },
  receptionist: { body: "#8fb4e0", legs: "#1f3a78", skin: "#e8b48a", hat: "#5a3a24", hatShape: "none", prop: "none", bulk: 1.0 },
  champ: { body: "#ff7a1a", legs: "#ff7a1a", skin: "#d9a07a", hat: "#f4f1ea", hatShape: "band", prop: "none", bulk: 2.0 },
  maitre_d: { body: "#1b1420", legs: "#1b1420", skin: "#f0c8a0", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.0 },
  pigeon_lady: { body: "#6b8f5a", legs: "#5a4d6e", skin: "#e0a67c", hat: "#b5653b", hatShape: "scarf", prop: "crumbs" },
};

interface Vis {
  root: TransformNode;
  pivot: TransformNode;
  head: TransformNode;
  armL: TransformNode; armR: TransformNode;
  legL: TransformNode; legR: TransformNode;
  prop: TransformNode | null;
  stars: TransformNode;
  bang: Mesh;
  huh: Mesh;
  /** big shots: no marker (Blake 5A), but the renderer still knows who they are */
  big: boolean;
  /** cops: flashlight beam (night) + taser laser (aiming) */
  beam: Mesh | null;
  laser: Mesh | null;
  bubble: Mesh | null;
  bubbleT: number;
  snaps: Snap[];
  view: NpcView;
  phase: number;
  lastX: number; lastZ: number;
  lean: number; armUp: number; spin: number; flat: number; windup: number; phoneUp: number;
  enabled: boolean;
  hitT: number; slapT: number;
  speed: number; phase0: number;
}

export class NpcRenderer {
  private map = new Map<string, Vis>();
  private bubbleTex = new Map<string, ReturnType<typeof unlitTextured>>();
  private time = 0;
  /** night: cops carry flashlights */
  night = false;
  private beamM: StandardMaterial | null = null;
  private laserM: StandardMaterial | null = null;

  constructor(private scene: Scene) {}

  private beamMat() {
    if (!this.beamM) {
      const m = (this.beamM = new StandardMaterial("beamMat", this.scene));
      m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#fff3c4"); m.alpha = 0.16; m.backFaceCulling = false;
    }
    return this.beamM;
  }
  private laserMat() {
    if (!this.laserM) {
      const m = (this.laserM = new StandardMaterial("laserMat", this.scene));
      m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#ff2030");
    }
    return this.laserM;
  }

  /** C5c.3: where Sal stands behind PAWN-O-RAMA's counter (the cashier there is "Honest" Sal) */
  salAt: { x: number; z: number } | null = null;

  private build(id: string, v: NpcView): Vis {
    const sc = this.scene;
    const sal = v.kind === "cashier" && !!this.salAt && Math.hypot(v.x - this.salAt.x, v.z - this.salAt.z) < 3;
    const L = sal ? SAL_LOOK : LOOKS[v.kind] ?? LOOKS.tourist;
    const bulk = L.bulk ?? 1;
    const root = new TransformNode("npc-" + id, sc);
    const pivot = new TransformNode("npcPivot", sc);
    pivot.parent = root;
    const part = (m: Mesh, c: string, parent: TransformNode, outline = 0.025) => { m.parent = parent; m.material = toon(sc, c); if (outline > 0) ink(m, outline); m.isPickable = false; return m; };
    // legs (hip pivots)
    const leg = (side: number) => {
      const hip = new TransformNode("hip", sc); hip.parent = pivot; hip.position.set(side * 0.14, 0.72, 0);
      const l = part(MeshBuilder.CreateCapsule("leg", { height: 0.72, radius: 0.085, tessellation: 6 }, sc), L.legs, hip, 0.018);
      l.position.y = -0.34;
      return hip;
    };
    const legL = leg(-1), legR = leg(1);
    // (R9: a capsule shorter than its own width turns inside out, and that inverted band was the bodyguards'
    // "apron": the big lads get a round belly instead)
    const tr = 0.27 * bulk;
    const torso = part(2 * tr > 0.74 ? MeshBuilder.CreateSphere("torso", { diameterX: 2 * tr, diameterY: Math.max(0.86, 1.7 * tr), diameterZ: 2 * tr, segments: 10 }, sc)
      : MeshBuilder.CreateCapsule("torso", { height: 0.78, radius: tr, tessellation: 8 }, sc), L.body, pivot, 0.03);
    torso.position.y = 1.08;
    const head = new TransformNode("npcHead", sc); head.parent = pivot; head.position.y = 1.6;
    const skull = part(MeshBuilder.CreateSphere("head", { diameter: 0.4, segments: 8 }, sc), L.skin, head, 0.02);
    void skull;
    for (const ex of [-0.07, 0.07]) {
      const eye = part(MeshBuilder.CreateSphere("eye", { diameter: 0.06, segments: 4 }, sc), "#1b1420", head, 0);
      eye.position.set(ex, 0.03, 0.18);
    }
    if (v.kind === "uncle_dumpster") {
      // C5a: a long grey beard, bushy eyebrows, a bathrobe with a belt and lapels, fluffy slippers, a mug of tea
      const beard = part(MeshBuilder.CreateCylinder("beard", { diameterTop: 0.3, diameterBottom: 0.08, height: 0.5, tessellation: 8 }, sc), "#d8d0c4", head, 0.015); beard.position.set(0, -0.28, 0.1);
      const mo = part(MeshBuilder.CreateTorus("tache", { diameter: 0.18, thickness: 0.05, tessellation: 8 }, sc), "#d8d0c4", head, 0.01); mo.position.set(0, -0.07, 0.17); mo.rotation.x = Math.PI / 2; mo.scaling.y = 0.5;
      for (const ex of [-0.08, 0.08]) { const br = part(MeshBuilder.CreateBox("brow", { width: 0.1, height: 0.03, depth: 0.03 }, sc), "#d8d0c4", head, 0); br.position.set(ex, 0.1, 0.18); br.rotation.z = ex > 0 ? -0.3 : 0.3; }
      const belt = part(MeshBuilder.CreateTorus("robeBelt", { diameter: 0.56, thickness: 0.05, tessellation: 12 }, sc), "#f3e2b8", pivot, 0.01); belt.position.y = 0.98;
      const skirt = part(MeshBuilder.CreateCylinder("robe", { diameterTop: 0.52, diameterBottom: 0.62, height: 0.45, tessellation: 12 }, sc), "#8e1f2e", pivot, 0.02); skirt.position.y = 0.66;
      for (const sx of [-1, 1]) { const lap = part(MeshBuilder.CreateBox("lapel", { width: 0.1, height: 0.4, depth: 0.03 }, sc), "#f3e2b8", pivot, 0); lap.position.set(sx * 0.1, 1.22, 0.27); lap.rotation.z = sx * 0.35; }
      for (const sx of [-0.14, 0.14]) { const sl = part(MeshBuilder.CreateSphere("slipper", { diameter: 0.22, segments: 6 }, sc), "#ff8fa3", pivot, 0.015); sl.position.set(sx, 0.06, 0.06); sl.scaling.set(1, 0.6, 1.4); }
      const mug = part(MeshBuilder.CreateCylinder("mug", { diameter: 0.12, height: 0.14, tessellation: 10 }, sc), "#f4f1ea", pivot, 0.01); mug.position.set(0.36, 1.05, 0.2);
    }
    if (v.kind === "mime") { const mouth = part(MeshBuilder.CreateBox("mouth", { width: 0.12, height: 0.03, depth: 0.02 }, sc), "#d62c2c", head, 0); mouth.position.set(0, -0.08, 0.19); }
    // hats
    const hc = L.hat ?? "#2b2433";
    if (L.hatShape === "sunhat") { const h = part(MeshBuilder.CreateCylinder("sunhat", { diameter: 0.62, height: 0.05, tessellation: 12 }, sc), hc, head, 0.015); h.position.y = 0.17; const c = part(MeshBuilder.CreateCylinder("crown", { diameter: 0.3, height: 0.14, tessellation: 10 }, sc), hc, head, 0.015); c.position.y = 0.24; }
    if (L.hatShape === "cap") { const h = part(MeshBuilder.CreateSphere("cap", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), hc, head, 0.015); h.position.y = 0.05; const b = part(MeshBuilder.CreateBox("brim", { width: 0.26, height: 0.03, depth: 0.18 }, sc), hc, head, 0.01); b.position.set(0, 0.1, 0.2); }
    if (L.hatShape === "beret") { const h = part(MeshBuilder.CreateCylinder("beret", { diameter: 0.4, height: 0.08, tessellation: 12 }, sc), hc, head, 0.015); h.position.set(0.04, 0.2, 0); h.rotation.z = -0.25; }
    if (L.hatShape === "band") { const h = part(MeshBuilder.CreateTorus("band", { diameter: 0.4, thickness: 0.06, tessellation: 12 }, sc), hc, head, 0.01); h.position.y = 0.08; }
    if (L.hatShape === "scarf") { const h = part(MeshBuilder.CreateTorus("scarf", { diameter: 0.34, thickness: 0.12, tessellation: 10 }, sc), hc, pivot, 0.015); h.position.y = 1.42; const bird = part(MeshBuilder.CreateSphere("pigeon", { diameter: 0.16, segments: 6 }, sc), "#8a94a8", pivot, 0.012); bird.position.set(0.28, 1.5, 0); }
    if (v.kind === "doorman") {
      // gold buttons, epaulettes, white gloves
      for (const y of [0.95, 1.1, 1.25]) { const b = part(MeshBuilder.CreateBox("btn", { width: 0.05, height: 0.05, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); b.position.set(0, y, 0.26 * bulk); }
      for (const s of [-1, 1]) { const e = part(MeshBuilder.CreateBox("epaulette", { width: 0.14, height: 0.04, depth: 0.14 }, sc), "#ffcf3a", pivot, 0); e.position.set(s * 0.25 * bulk, 1.42, 0); }
    }
    if (v.kind === "bouncer") {
      // SECURITY on the tee, shades, an earpiece, a clipboard (the list nobody's on), a bald shiny head
      const tee = part(MeshBuilder.CreatePlane("tee", { width: 0.5, height: 0.16 }, sc), "#f4f1ea", pivot, 0); tee.position.set(0, 1.25, 0.31 * bulk + 0.03); tee.rotation.y = Math.PI;
      tee.material = unlitTextured(sc, textTexture(sc, "SECURITY", { w: 256, h: 80, fg: "#f4f1ea" }), "teeSec"); (tee.material as StandardMaterial).backFaceCulling = false;
      const shades = part(MeshBuilder.CreateBox("shades", { width: 0.3, height: 0.07, depth: 0.03 }, sc), "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
      const ear = part(MeshBuilder.CreateSphere("earpiece", { diameter: 0.05, segments: 4 }, sc), "#e8e2d4", head, 0); ear.position.set(0.2, 0, 0);
      const shine = part(MeshBuilder.CreateSphere("shine", { diameter: 0.08, segments: 4 }, sc), "#c98a5a", head, 0); shine.position.set(0.05, 0.17, 0.08);
      const board = part(MeshBuilder.CreateBox("clipboard", { width: 0.25, height: 0.32, depth: 0.02 }, sc), "#a8743f", pivot, 0.01); board.position.set(-0.4 * bulk, 1.0, 0.25); board.rotation.x = -0.4;
    }
    if (v.kind === "vinnie") {
      // a shiny tracksuit with white stripes, a gold chain, slicked-back hair
      for (const sx of [-1, 1]) { const st = part(MeshBuilder.CreateBox("stripe", { width: 0.04, height: 0.7, depth: 0.03 }, sc), "#f4f1ea", pivot, 0); st.position.set(sx * 0.3 * bulk, 1.05, 0.08); }
      const chain = part(MeshBuilder.CreateTorus("chain", { diameter: 0.34, thickness: 0.04, tessellation: 12 }, sc), "#ffcf3a", pivot, 0); chain.position.y = 1.4; chain.rotation.x = 0.35;
      const hair = part(MeshBuilder.CreateSphere("slick", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), "#1b1420", head, 0.01); hair.position.set(0, 0.05, -0.04);
    }
    if (v.kind === "lou") {
      // a green gambler's visor, suspenders, a toothpick, mismatched eyes (one twitches), a pencil behind his ear
      const vis = part(MeshBuilder.CreateBox("visor", { width: 0.36, height: 0.03, depth: 0.2 }, sc), "#2f8f4e", head, 0.01); vis.position.set(0, 0.12, 0.13); vis.rotation.x = -0.25;
      const band = part(MeshBuilder.CreateTorus("visorband", { diameter: 0.4, thickness: 0.035, tessellation: 12 }, sc), "#2f8f4e", head, 0); band.position.y = 0.1;
      for (const sx of [-1, 1]) { const su = part(MeshBuilder.CreateBox("suspender", { width: 0.05, height: 0.6, depth: 0.03 }, sc), "#8e1f2e", pivot, 0); su.position.set(sx * 0.1, 1.1, 0.24); }
      const pick = part(MeshBuilder.CreateCylinder("toothpick", { diameter: 0.012, height: 0.14, tessellation: 3 }, sc), "#e8d7a8", head, 0); pick.rotation.z = 1.2; pick.position.set(0.08, -0.08, 0.19);
      const pencil = part(MeshBuilder.CreateCylinder("pencil", { diameter: 0.02, height: 0.16, tessellation: 4 }, sc), "#ffd54a", head, 0); pencil.rotation.x = 1.3; pencil.position.set(0.19, 0.05, 0.02);
      const bag = part(MeshBuilder.CreateSphere("eyebag", { diameter: 0.07, segments: 4 }, sc), "#b08a6a", head, 0); bag.position.set(0.07, -0.01, 0.17); bag.scaling.set(1, 0.4, 0.5);
      const stub = part(MeshBuilder.CreateSphere("stubble", { diameter: 0.3, segments: 6, slice: 0.4 }, sc), "#9a8a7a", head, 0); stub.position.set(0, -0.06, 0.06); stub.rotation.x = Math.PI;
    }
    if (v.kind === "fran") {
      // big pink hair, cat-eye glasses, hoop earrings, a pink bubble of gum
      const hair = part(MeshBuilder.CreateSphere("franHair", { diameter: 0.6, segments: 8 }, sc), "#ff8fd0", head, 0.012); hair.position.set(0, 0.16, -0.05); hair.scaling.set(1.1, 0.9, 1);
      const specs = part(MeshBuilder.CreateBox("catEyes", { width: 0.26, height: 0.06, depth: 0.03 }, sc), "#c41e3a", head, 0); specs.position.set(0, 0.03, 0.19);
      for (const sx of [-1, 1]) { const hoop = part(MeshBuilder.CreateTorus("hoop", { diameter: 0.09, thickness: 0.012, tessellation: 10 }, sc), "#ffd54a", head, 0); hoop.position.set(sx * 0.19, -0.06, 0.02); hoop.rotation.z = Math.PI / 2; }
      const gum = part(MeshBuilder.CreateSphere("gum", { diameter: 0.12, segments: 6 }, sc), "#ff8fb5", head, 0); gum.position.set(0, -0.09, 0.24);
    }
    if (v.kind === "receptionist") {
      // a hair bun, reading glasses on a chain, a badge, a headset
      const bun = part(MeshBuilder.CreateSphere("bun", { diameter: 0.2, segments: 6 }, sc), "#5a3a24", head, 0.01); bun.position.set(0, 0.2, -0.12);
      const hair = part(MeshBuilder.CreateSphere("pamHair", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), "#5a3a24", head, 0.01); hair.position.set(0, 0.05, -0.04);
      const specs = part(MeshBuilder.CreateBox("specs", { width: 0.24, height: 0.05, depth: 0.03 }, sc), "#1b1420", head, 0); specs.position.set(0, 0.02, 0.19);
      const badge = part(MeshBuilder.CreateBox("badge", { width: 0.1, height: 0.12, depth: 0.02 }, sc), "#d9a632", pivot, 0); badge.position.set(0.14, 1.3, 0.26);
      const mic = part(MeshBuilder.CreateBox("headset", { width: 0.02, height: 0.02, depth: 0.16 }, sc), "#1b1420", head, 0); mic.position.set(0.18, -0.05, 0.1);
    }
    if (v.kind === "meat_locker" || v.kind === "cold_cuts") {
      // a vest, a bald shiny head, tiny shades, a gold tooth, forearms like hams (R9: no apron)
      const shades = part(MeshBuilder.CreateBox("shades", { width: 0.2, height: 0.05, depth: 0.03 }, sc), "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
      const shine = part(MeshBuilder.CreateSphere("shine", { diameter: 0.08, segments: 4 }, sc), "#e0a878", head, 0); shine.position.set(0.05, 0.17, 0.08);
      const tooth = part(MeshBuilder.CreateBox("goldtooth", { width: 0.05, height: 0.03, depth: 0.02 }, sc), "#ffd54a", head, 0); tooth.position.set(-0.04, -0.09, 0.19);
      const neck = part(MeshBuilder.CreateCylinder("neck", { diameter: 0.34, height: 0.2, tessellation: 8 }, sc), L.skin, pivot, 0.01); neck.position.y = 1.5;
    }
    if (v.kind === "champ") {
      const beard = part(MeshBuilder.CreateCylinder("beard", { diameterTop: 0.32, diameterBottom: 0.12, height: 0.34, tessellation: 8 }, sc), "#c8c4cc", head, 0.012); beard.position.set(0, -0.2, 0.1);
      const tache = part(MeshBuilder.CreateBox("tache", { width: 0.24, height: 0.05, depth: 0.04 }, sc), "#c8c4cc", head, 0); tache.position.set(0, -0.06, 0.19);
      const belt = part(MeshBuilder.CreateTorus("champbelt", { diameter: 0.58 * 2.0 * 0.85, thickness: 0.09, tessellation: 14 }, sc), "#d9a632", pivot, 0.01); belt.position.y = 0.82;
      const plate = part(MeshBuilder.CreateCylinder("beltplate", { diameter: 0.3, height: 0.05, tessellation: 12 }, sc), "#ffe14a", pivot, 0.01); plate.rotation.x = Math.PI / 2; plate.position.set(0, 0.82, 0.5);
      const num = part(MeshBuilder.CreatePlane("inmatenum", { width: 0.34, height: 0.12 }, sc), "#f4f1ea", pivot, 0); num.position.set(0.18, 1.3, 0.55); num.rotation.y = Math.PI;
      num.material = unlitTextured(sc, textTexture(sc, "No. 1", { w: 192, h: 64, bg: "#f4f1ea", fg: "#1b1420" }), "champNum"); (num.material as StandardMaterial).backFaceCulling = false;
    }
    if (v.kind === "maitre_d") {
      const tash = part(MeshBuilder.CreateBox("tash", { width: 0.22, height: 0.04, depth: 0.03 }, sc), "#1b1420", head, 0); tash.position.set(0, -0.06, 0.19); tash.rotation.z = 0.05;
      const bow = part(MeshBuilder.CreateBox("bowtie", { width: 0.18, height: 0.07, depth: 0.03 }, sc), "#c41e3a", pivot, 0); bow.position.set(0, 1.42, 0.27);
      const shirt = part(MeshBuilder.CreateBox("shirtfront", { width: 0.16, height: 0.32, depth: 0.03 }, sc), "#f4f1ea", pivot, 0); shirt.position.set(0, 1.22, 0.265);
    }
    if (v.kind === "mall_cop") { const badge = part(MeshBuilder.CreateBox("badge", { width: 0.08, height: 0.1, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); badge.position.set(-0.12, 1.22, 0.26 * bulk); }
    if (v.kind === "millionaire") {
      const brim = part(MeshBuilder.CreateCylinder("tophatbrim", { diameter: 0.46, height: 0.03, tessellation: 14 }, sc), "#1b1420", head, 0.012); brim.position.y = 0.17;
      const crown = part(MeshBuilder.CreateCylinder("tophat", { diameter: 0.3, height: 0.34, tessellation: 14 }, sc), "#1b1420", head, 0.015); crown.position.y = 0.34;
      const band = part(MeshBuilder.CreateCylinder("hatband", { diameter: 0.31, height: 0.05, tessellation: 14 }, sc), "#d6264a", head, 0); band.position.y = 0.2;
      const mono = part(MeshBuilder.CreateTorus("monocle", { diameter: 0.1, thickness: 0.015, tessellation: 12 }, sc), "#ffcf3a", head, 0); mono.rotation.x = Math.PI / 2; mono.position.set(0.07, 0.03, 0.2);
      const tash = part(MeshBuilder.CreateBox("tash", { width: 0.22, height: 0.04, depth: 0.03 }, sc), "#f4f1ea", head, 0); tash.position.set(0, -0.06, 0.19);
      const vest = part(MeshBuilder.CreateBox("vest", { width: 0.3, height: 0.36, depth: 0.04 }, sc), "#d6264a", pivot, 0); vest.position.set(0, 1.12, 0.3 * bulk);
    }
    if (v.kind === "bodyguard" || v.kind === "celebrity") {
      const shades = part(MeshBuilder.CreateBox("shades", { width: 0.3, height: 0.07, depth: 0.03 }, sc), v.kind === "celebrity" ? "#ff6fb5" : "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
    }
    if (v.kind === "bodyguard") { const ear = part(MeshBuilder.CreateSphere("earpiece", { diameter: 0.05, segments: 4 }, sc), "#e8e2d4", head, 0); ear.position.set(0.2, 0, 0); }
    if (v.kind === "celebrity") {
      const scarf = part(MeshBuilder.CreateTorus("boa", { diameter: 0.36, thickness: 0.12, tessellation: 10 }, sc), "#ff9ad5", pivot, 0.012); scarf.position.y = 1.42;
      const hair = part(MeshBuilder.CreateSphere("hair", { diameter: 0.44, segments: 8, slice: 0.55 }, sc), "#ffe14a", head, 0.012); hair.position.y = 0.04;
    }
    if (v.kind === "courier") {
      const helmet = part(MeshBuilder.CreateSphere("helmet", { diameter: 0.44, segments: 8, slice: 0.55 }, sc), "#3a3f55", head, 0.015); helmet.position.y = 0.04;
      const visor = part(MeshBuilder.CreateBox("visor", { width: 0.3, height: 0.08, depth: 0.03 }, sc), "#9fe3ff", head, 0); visor.position.set(0, 0.06, 0.19);
      const plate = part(MeshBuilder.CreateBox("armor", { width: 0.5 * bulk, height: 0.45, depth: 0.1 }, sc), "#8e96a8", pivot, 0.015); plate.position.set(0, 1.12, 0.22 * bulk);
    }
    if (v.kind === "crypto_bro") {
      const hood = part(MeshBuilder.CreateSphere("hood", { diameter: 0.5, segments: 8, slice: 0.6 }, sc), "#3d8f5a", head, 0.015); hood.position.set(0, 0.02, -0.05); hood.rotation.x = -0.4;
      const coin = part(MeshBuilder.CreateCylinder("coinpin", { diameter: 0.1, height: 0.02, tessellation: 12 }, sc), "#ffcf3a", pivot, 0); coin.rotation.x = Math.PI / 2; coin.position.set(0.12, 1.25, 0.28);
    }
    if (v.kind === "cop") {
      const badge = part(MeshBuilder.CreatePolyhedron("copbadge", { type: 1, size: 0.07 }, sc), "#ffcf3a", pivot, 0.008); badge.position.set(-0.13, 1.24, 0.28 * bulk);
      const belt = part(MeshBuilder.CreateTorus("belt", { diameter: 0.6 * bulk, thickness: 0.07, tessellation: 12 }, sc), "#1b1420", pivot, 0); belt.position.y = 0.76;
      const buckle = part(MeshBuilder.CreateBox("buckle", { width: 0.1, height: 0.07, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); buckle.position.set(0, 0.76, 0.31 * bulk);
      const capBadge = part(MeshBuilder.CreateBox("capbadge", { width: 0.08, height: 0.07, depth: 0.02 }, sc), "#ffcf3a", head, 0); capBadge.position.set(0, 0.14, 0.2);
      const tash = part(MeshBuilder.CreateBox("moustache", { width: 0.16, height: 0.04, depth: 0.03 }, sc), "#4a2f1e", head, 0); tash.position.set(0, -0.06, 0.19);
    }
    if (sal) {
      // "Honest" Sal: a cardigan, half-moon glasses, a comb-over, a gold tooth, a jeweller's loupe on a cord
      for (const y of [0.95, 1.1, 1.25]) { const b = part(MeshBuilder.CreateSphere("btn", { diameter: 0.05, segments: 4 }, sc), "#e8b83a", pivot, 0); b.position.set(0, y, 0.27 * bulk); }
      for (const sx of [-1, 1]) { const g = part(MeshBuilder.CreateTorus("specs", { diameter: 0.1, thickness: 0.015, tessellation: 10 }, sc), "#1b1420", head, 0); g.rotation.x = Math.PI / 2; g.position.set(sx * 0.07, 0.0, 0.19); }
      const comb = part(MeshBuilder.CreateBox("combover", { width: 0.3, height: 0.03, depth: 0.08 }, sc), "#5a4a3a", head, 0); comb.position.set(0, 0.17, 0.02); comb.rotation.z = 0.15;
      const tooth = part(MeshBuilder.CreateBox("goldtooth", { width: 0.04, height: 0.03, depth: 0.02 }, sc), "#ffd54a", head, 0); tooth.position.set(0.04, -0.08, 0.19);
      const loupe = part(MeshBuilder.CreateCylinder("loupe", { diameter: 0.06, height: 0.05, tessellation: 8 }, sc), "#3a3444", pivot, 0); loupe.rotation.x = Math.PI / 2; loupe.position.set(0.1, 1.05, 0.29 * bulk);
    }
    if (v.kind === "cashier" && !sal) { const apron = part(MeshBuilder.CreateBox("apron", { width: 0.4, height: 0.5, depth: 0.04 }, sc), "#f4f1ea", pivot, 0); apron.position.set(0, 1.0, 0.27); const tag = part(MeshBuilder.CreateBox("nametag", { width: 0.1, height: 0.06, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); tag.position.set(0.1, 1.3, 0.28); }
    if (v.kind === "businessman") { const tie = part(MeshBuilder.CreateBox("tie", { width: 0.07, height: 0.32, depth: 0.03 }, sc), "#d62c2c", pivot, 0); tie.position.set(0, 1.18, 0.27); }
    if (v.kind === "mime") for (let i = 0; i < 3; i++) { const st = part(MeshBuilder.CreateTorus("stripe", { diameter: 0.56, thickness: 0.05, tessellation: 12 }, sc), "#1b1420", pivot, 0); st.position.y = 0.88 + i * 0.16; }
    // arms (shoulder pivots)
    const arm = (side: number) => {
      const sh = new TransformNode("shoulder", sc); sh.parent = pivot; sh.position.set(side * (0.3 * bulk + 0.05), 1.38, 0);
      const a = part(MeshBuilder.CreateCapsule("arm", { height: 0.6, radius: 0.075 * bulk, tessellation: 6 }, sc), L.body, sh, 0.018);
      a.position.y = -0.27;
      const hand = part(MeshBuilder.CreateSphere("hand", { diameter: 0.16 * bulk, segments: 6 }, sc), L.skin, sh, 0.012);
      hand.position.y = -0.58;
      return sh;
    };
    const armL = arm(-1), armR = arm(1);
    // props held in the right hand
    let prop: TransformNode | null = null;
    if (L.prop && L.prop !== "none") {
      prop = new TransformNode("prop", sc); prop.parent = armR; prop.position.set(0, -0.62, 0.06);
      if (L.prop === "camera") part(MeshBuilder.CreateBox("cam", { width: 0.16, height: 0.1, depth: 0.08 }, sc), "#2b2433", prop, 0.01);
      if (L.prop === "briefcase") { const b = part(MeshBuilder.CreateBox("case", { width: 0.1, height: 0.3, depth: 0.4 }, sc), "#6b4a2b", prop, 0.015); b.position.y = -0.12; }
      if (L.prop === "phone") part(MeshBuilder.CreateBox("phone", { width: 0.09, height: 0.16, depth: 0.02 }, sc), "#ff9ad5", prop, 0.008);
      if (L.prop === "crumbs") part(MeshBuilder.CreateSphere("bag", { diameter: 0.18, segments: 6 }, sc), "#d9c9a0", prop, 0.01);
      if (L.prop === "cane") { const c = part(MeshBuilder.CreateCylinder("cane", { diameter: 0.04, height: 0.9, tessellation: 6 }, sc), "#1b1420", prop, 0.008); c.position.y = -0.35; const k = part(MeshBuilder.CreateSphere("knob", { diameter: 0.09, segments: 6 }, sc), "#ffcf3a", prop, 0.008); k.position.y = 0.1; }
      if (L.prop === "moneybag") { const b = part(MeshBuilder.CreateSphere("mbag", { diameter: 0.42, segments: 8 }, sc), "#b99a5c", prop, 0.015); b.position.y = -0.18; const d = part(MeshBuilder.CreateBox("mbagsign", { width: 0.14, height: 0.18, depth: 0.02 }, sc), "#2f7a3b", prop, 0); d.position.set(0, -0.18, 0.21); }
      if (L.prop === "rod") {
        // C3: a fishing rod held out over the water, the line dangling
        const r = part(MeshBuilder.CreateCylinder("rod", { diameterTop: 0.02, diameterBottom: 0.05, height: 2.6, tessellation: 6 }, sc), "#6b4a2b", prop, 0.006);
        r.rotation.x = 1.0; r.position.set(0, 0.55, 1.1);
        const line = part(MeshBuilder.CreateCylinder("fishline", { diameter: 0.01, height: 1.6, tessellation: 3 }, sc), "#f4f1ea", prop, 0);
        line.position.set(0, 0.35, 2.2);
        const bob = part(MeshBuilder.CreateSphere("bobber", { diameter: 0.09, segments: 4 }, sc), "#ff3a3a", prop, 0.006); bob.position.set(0, -0.45, 2.2);
      }
      if (L.prop === "laptop") { const l = part(MeshBuilder.CreateBox("lap", { width: 0.34, height: 0.03, depth: 0.24 }, sc), "#9aa3b5", prop, 0.01); l.position.y = -0.02; }
    }
    // dizzy stars
    const stars = new TransformNode("stars", sc); stars.parent = root; stars.position.y = 2.05;
    for (let i = 0; i < 3; i++) {
      const s = part(MeshBuilder.CreatePolyhedron("star", { type: 0, size: 0.07 }, sc), "#ffe14a", stars, 0);
      const a = (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    }
    stars.setEnabled(false);
    // angry "!" when chasing you
    const bang = MeshBuilder.CreatePlane("bang", { width: 0.4, height: 0.5 }, sc);
    bang.parent = root; bang.position.y = 2.25; bang.billboardMode = Mesh.BILLBOARDMODE_ALL; bang.isPickable = false;
    bang.material = unlitTextured(sc, textTexture(sc, "!", { w: 128, h: 160, fg: "#ff3b30", stroke: "#1b1420" }), "bang");
    bang.setEnabled(false);
    // cops searching for you get a "?"
    const huh = MeshBuilder.CreatePlane("huh", { width: 0.4, height: 0.5 }, sc);
    huh.parent = root; huh.position.y = 2.25; huh.billboardMode = Mesh.BILLBOARDMODE_ALL; huh.isPickable = false;
    huh.material = unlitTextured(sc, textTexture(sc, "?", { w: 128, h: 160, fg: "#ffcf3a", stroke: "#1b1420" }), "huh");
    huh.setEnabled(false);
    const big = !!NPC_DEFS[v.kind as keyof typeof NPC_DEFS]?.bigShot;
    // cops: a flashlight beam at night (a soft cone in front of them) and a red taser laser
    let beam: Mesh | null = null, laser: Mesh | null = null;
    if (v.kind === "cop") {
      beam = MeshBuilder.CreateCylinder("beam", { diameterTop: 3.2, diameterBottom: 0.12, height: 9, tessellation: 16, cap: Mesh.NO_CAP }, sc);
      beam.rotation.x = Math.PI / 2 + 0.12; // pointing forward, slightly down
      beam.position.set(0.3, 1.3, 4.6);
      beam.parent = root; beam.isPickable = false;
      beam.material = this.beamMat();
      beam.setEnabled(false);
      laser = MeshBuilder.CreateBox("laser", { width: 0.02, height: 0.02, depth: 6.5 }, sc);
      laser.position.set(0.25, 1.25, 3.3);
      laser.parent = root; laser.isPickable = false;
      laser.material = this.laserMat();
      laser.setEnabled(false);
    }
    if (v.kind === "raccoon") {
      // bandit mask, round ears, striped tail; the whole raccoon is drawn at about half size
      const mask = part(MeshBuilder.CreateBox("mask", { width: 0.36, height: 0.1, depth: 0.12 }, sc), "#1b1420", head, 0);
      mask.position.set(0, 0.03, 0.14);
      for (const ex of [-0.12, 0.12]) {
        const ear = part(MeshBuilder.CreateSphere("ear", { diameter: 0.14, segments: 6 }, sc), "#4a4652", head, 0.012);
        ear.position.set(ex, 0.19, -0.02);
      }
      const snout = part(MeshBuilder.CreateSphere("snout", { diameter: 0.14, segments: 6 }, sc), "#e0dcd2", head, 0.01);
      snout.position.set(0, -0.06, 0.18);
      for (let i = 0; i < 5; i++) {
        const seg = part(MeshBuilder.CreateCylinder("tail", { diameter: 0.2 - i * 0.02, height: 0.16, tessellation: 8 }, sc), i % 2 ? "#2b2433" : "#8a8a96", pivot, 0.01);
        seg.rotation.x = -1.0;
        seg.position.set(0, 0.62 + i * 0.07, -0.3 - i * 0.12);
      }
      root.scaling.setAll(0.55);
    }
    if (v.kind === "meat_locker" || v.kind === "cold_cuts") root.scaling.setAll(1.32); // (R5: enormous; R7: his twin too)
    if (v.kind === "champ") {
      root.scaling.setAll(1.38); // (R6: bigger still)
      const sp = new TransformNode("spoon", sc); sp.parent = armR; sp.position.set(0, -0.62, 0.06);
      const bowl = part(MeshBuilder.CreateSphere("spoonbowl", { diameter: 0.12, segments: 6 }, sc), "#ffd54a", sp, 0.008); bowl.scaling.set(0.8, 0.3, 1.2); bowl.position.y = 0.18;
      const handle = part(MeshBuilder.CreateBox("spoonhandle", { width: 0.03, height: 0.22, depth: 0.02 }, sc), "#ffd54a", sp, 0.006); handle.position.y = 0.03;
      const paper = part(MeshBuilder.CreateBox("crossword", { width: 0.3, height: 0.02, depth: 0.22 }, sc), "#f4f1ea", armL, 0.006); paper.position.set(0, -0.62, 0.12);
    }
    // merge each moving body part into one mesh (big draw-call saving with a crowd on screen)
    for (const g of [pivot, head, legL, legR, armL, armR, prop, stars]) if (g) bakeGroup(sc, g, g === stars ? 0 : 0.022);
    return {
      root, pivot, head, armL, armR, legL, legR, prop, stars, bang, huh, big, beam, laser, bubble: null, bubbleT: 0,
      snaps: [], view: { ...v }, phase: Math.random() * 6, lastX: v.x, lastZ: v.z,
      lean: 0, armUp: 0, spin: 0, flat: 0, windup: 0, phoneUp: 0, enabled: true, hitT: 0, slapT: 0, speed: 0, phase0: Math.random() * 6,
    };
  }

  sync(id: string, v: NpcView, now: number) {
    let n = this.map.get(id);
    if (!n) { n = this.build(id, v); this.map.set(id, n); }
    n.view.state = v.state; n.view.target = v.target; n.view.robbed = v.robbed; n.view.kind = v.kind;
    n.snaps.push({ t: now, x: v.x, y: v.y, z: v.z, yaw: v.yaw });
    if (n.snaps.length > 16) n.snaps.splice(0, n.snaps.length - 16);
  }

  retain(ids: Set<string>) {
    for (const [id, n] of this.map) if (!ids.has(id)) { n.root.dispose(false, true); n.bubble?.dispose(); this.map.delete(id); }
  }

  /** Speech bubble over a pedestrian's head for a couple of seconds. */
  say(id: string, line: string) {
    const n = this.map.get(id);
    if (!n || !line) return;
    n.bubble?.dispose();
    let mat = this.bubbleTex.get(line);
    if (!mat) {
      mat = unlitTextured(this.scene, textTexture(this.scene, line, { w: 768, h: 128, bg: "#fffaf0", fg: "#1b1420" }), "bubble");
      this.bubbleTex.set(line, mat);
    }
    const b = MeshBuilder.CreatePlane("bubble", { width: 2.3, height: 0.38 }, this.scene);
    b.material = mat;
    b.parent = n.root;
    b.position.y = 2.55;
    b.billboardMode = Mesh.BILLBOARDMODE_ALL;
    b.renderingGroupId = 1;
    ink(b, 0.02);
    b.isPickable = false;
    n.bubble = b;
    n.bubbleT = 2.6;
  }

  /** Squash-and-stretch when they get bonked. */
  bump(id: string) { const n = this.map.get(id); if (n) n.hitT = 0.3; }
  /** Big slap swing (fighters hitting back). */
  slap(id: string) { const n = this.map.get(id); if (n) n.slapT = 0.3; }
  kindOf(id: string) { return this.map.get(id)?.view.kind ?? null; }

  /** Where a pedestrian is drawn right now (for hit effects). */
  pos(id: string) {
    const n = this.map.get(id);
    return n ? { x: n.root.position.x, y: n.root.position.y, z: n.root.position.z } : null;
  }

  /** Every pedestrian currently drawn (not culled): id, drawn position, state, kind. */
  forEachVisible(cb: (id: string, x: number, y: number, z: number, state: string, kind: string) => void) {
    for (const [id, n] of this.map) if (n.enabled && n.snaps.length) cb(id, n.root.position.x, n.root.position.y, n.root.position.z, n.view.state, n.view.kind);
  }

  /** Big shots in town (latest synced position, even when not drawn): for the HUD tracker. */
  bigShots(): { id: string; kind: string; x: number; z: number; robbed: boolean }[] {
    const out: { id: string; kind: string; x: number; z: number; robbed: boolean }[] = [];
    for (const [id, n] of this.map) if (n.big && n.snaps.length) { const s = n.snaps[n.snaps.length - 1]; out.push({ id, kind: n.view.kind, x: s.x, z: s.z, robbed: n.view.robbed }); }
    return out;
  }

  count() { return this.map.size; }
  visibleCount() { let c = 0; for (const n of this.map.values()) if (n.enabled) c++; return c; }

  update(now: number, dt: number, camera: Camera) {
    this.time += dt;
    const renderT = now - INTERP_MS;
    const cam = camera.globalPosition;
    for (const n of this.map.values()) {
      const s = n.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= renderT) { a = s[i]; b = s[Math.min(i + 1, s.length - 1)]; break; }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const yaw = a.yaw + dy * k;
      // distance culling (keeps the crowd affordable)
      const far = Math.hypot(x - cam.x, z - cam.z) > (n.big ? BIGSHOT_DRAW_DISTANCE : n.view.kind === "cop" && n.view.state !== "beat" ? COP_DRAW_DISTANCE : DRAW_DISTANCE)
        || n.view.state === "sleep"; // (C4b: the old lady asleep upstairs isn't drawn)
      if (far === n.enabled) { n.enabled = !far; n.root.setEnabled(!far); }
      const speed = dt > 0 ? Math.hypot(x - n.lastX, z - n.lastZ) / dt : 0;
      n.lastX = x; n.lastZ = z;
      if (far) continue;
      n.root.position.set(x, y, z);

      const st = n.view.state;
      const f = 1 - Math.exp(-dt * 12);
      const tLean = st === "flee" ? 0.25 : st === "chase" ? 0.35 : st === "huff" ? 0.4 : st === "gloat" ? -0.2
        : st === "sneak" ? 0.45 : st === "escape" || st === "scram" ? 0.3 : 0;
      const tArmUp = st === "flee" || st === "escape" || st === "cower" ? 1 : st === "gloat" ? 0.8 : 0; // raccoons hold loot over their heads, cashiers put their hands up
      const tFlat = st === "ko" ? 1 : 0;
      const tWind = st === "windup" || st === "aim" ? 1 : 0;
      const tPhone = st === "film" || (n.view.kind === "influencer" && st === "idle") ? 1 : 0;
      n.lean += (tLean - n.lean) * f; n.armUp += (tArmUp - n.armUp) * f; n.flat += (tFlat - n.flat) * f;
      n.windup += (tWind - n.windup) * (1 - Math.exp(-dt * 20)); n.phoneUp += (tPhone - n.phoneUp) * f;
      if (st === "stunned") n.spin += dt * 14; else n.spin *= Math.exp(-dt * 6);
      n.root.rotation.y = yaw + n.spin;
      n.pivot.rotation.x = n.lean - n.flat * 1.45;
      n.pivot.position.y = n.flat * 0.25;

      // walk cycle: one stride per ~1.1 m travelled, so feet match the ground (no moonwalking);
      // longer strides + bigger arm swing when running, gentle bob + hip sway, breathing when still
      n.speed += (speed - n.speed) * (1 - Math.exp(-dt * 8));
      const sp = n.speed;
      n.phase += dt * sp * 2.9;
      const moving = Math.min(1, sp / 1.2);
      const stride = (0.32 + 0.3 * Math.min(1, sp / 5)) * moving * (1 - n.flat);
      const sw = Math.sin(n.phase) * stride;
      n.legL.rotation.x = sw; n.legR.rotation.x = -sw;
      const armSw = sw * (0.55 + 0.4 * Math.min(1, sp / 5));
      n.armL.rotation.x = -armSw * (1 - n.armUp) - n.armUp * 2.9;
      n.armR.rotation.x = armSw * (1 - n.armUp) * (1 - n.phoneUp) - n.armUp * 2.9 - n.phoneUp * 1.6 + n.windup * 1.2;
      const breathe = Math.sin(this.time * 2 + n.phase0) * 0.012 * (1 - moving);
      n.pivot.position.y += Math.abs(Math.cos(n.phase)) * 0.045 * moving + breathe;
      n.pivot.rotation.z = Math.sin(n.phase) * 0.04 * moving + Math.sin(this.time * 0.7 + n.phase0) * 0.02 * (1 - moving);
      n.pivot.rotation.y = Math.sin(n.phase) * 0.08 * moving; // shoulders twist with the stride
      n.armR.rotation.z = -n.windup * 0.6;
      if (n.view.kind === "cop" && n.windup > 0.01) {
        // grab: both arms straight out in front
        n.armL.rotation.x = n.armL.rotation.x * (1 - n.windup) - 1.45 * n.windup;
        n.armR.rotation.x = n.armR.rotation.x * (1 - n.windup) - 1.45 * n.windup;
        n.armR.rotation.z = 0;
      }
      if (n.slapT > 0) {
        n.slapT = Math.max(0, n.slapT - dt);
        const u = 1 - n.slapT / 0.3, sk = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
        n.armR.rotation.x = n.armR.rotation.x * (1 - sk) - 1.5 * sk;
        n.armR.rotation.z = -0.9 * sk + 0.6 * sk * (1 - u);
      }
      if (n.hitT > 0) {
        n.hitT = Math.max(0, n.hitT - dt);
        const q = Math.sin((n.hitT / 0.3) * Math.PI) * 0.25;
        n.pivot.scaling.set(1 + q, 1 - q, 1 + q);
      } else if (n.pivot.scaling.y !== 1) n.pivot.scaling.setAll(1);
      if (st === "sit") {
        // R6: the Champ sitting on whoever he beat: legs out in front, bouncing a little, the crossword up
        n.pivot.position.y = 0.32 + Math.abs(Math.sin(this.time * 3)) * 0.04;
        n.legL.rotation.x = n.legR.rotation.x = -1.5;
        n.armL.rotation.x = n.armR.rotation.x = -1.1;
      }
      n.armL.rotation.z = st === "flee" ? Math.sin(this.time * 18) * 0.3 : 0;
      n.head.rotation.z = st === "huff" ? Math.sin(this.time * 10) * 0.08 : 0;
      // stars when dazed / KO, "!" when coming for you
      const dazed = st === "stunned" || st === "ko";
      n.stars.setEnabled(dazed);
      if (dazed) { n.stars.rotation.y += dt * 5; n.stars.position.y = 2.05 - n.flat * 1.6; }
      n.bang.setEnabled(st === "chase" || st === "windup");
      n.huh.setEnabled(st === "search");
      if (n.beam) n.beam.setEnabled(this.night && st !== "ko" && st !== "stunned");
      if (n.laser) n.laser.setEnabled(st === "aim" && Math.sin(this.time * 40) > -0.6);
      if (st === "search") n.head.rotation.y = Math.sin(this.time * 2.2 + n.phase0) * 0.7; else if (n.head.rotation.y !== 0) n.head.rotation.y *= Math.exp(-dt * 8);
      if (n.bubble) { n.bubbleT -= dt; if (n.bubbleT <= 0) { n.bubble.dispose(); n.bubble = null; } }
    }
  }

  dispose() {
    for (const n of this.map.values()) { n.root.dispose(false, true); n.bubble?.dispose(); }
    this.map.clear();
  }
}
