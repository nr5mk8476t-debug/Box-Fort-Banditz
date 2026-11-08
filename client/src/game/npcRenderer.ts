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
  don: { body: "#f4f1ea", legs: "#ece6dc", skin: "#e0a878", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.5 }, // (R11.1: DON BINNIE: the white suit)
  velvet_guard: { body: "#141018", legs: "#141018", skin: "#b07a52", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.75 },
  sketchy_steve: { body: "#a8865a", legs: "#4a4652", skin: "#8a8a96", hat: "#3a3028", hatShape: "none", prop: "none", bulk: 1.15 }, // (R11.4: a raccoon in a trench coat)
  receptionist: { body: "#8fb4e0", legs: "#1f3a78", skin: "#e8b48a", hat: "#5a3a24", hatShape: "none", prop: "none", bulk: 1.0 },
  champ: { body: "#ff7a1a", legs: "#ff7a1a", skin: "#d9a07a", hat: "#f4f1ea", hatShape: "band", prop: "none", bulk: 2.0 },
  maitre_d: { body: "#1b1420", legs: "#1b1420", skin: "#f0c8a0", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.0 },
  // R12.1: THE SOGGY SHAMROCK (each regular and musician has their own look: PUB_LOOKS)
  barman: { body: "#f4f1ea", legs: "#1b1420", skin: "#f0b898", hat: "#8a3a1a", hatShape: "none", prop: "none", bulk: 1.25 },
  regular: { body: "#6b5a3a", legs: "#4a4038", skin: "#e8b090", hatShape: "none", prop: "none", bulk: 1.15 },
  trad_band: { body: "#2f6b3a", legs: "#2b2433", skin: "#f0c09a", hatShape: "none", prop: "none", bulk: 1.05 },
  patron: { body: "#3a4a6a", legs: "#2b2433", skin: "#f0c09a", hatShape: "none", prop: "none", bulk: 1.1 },
  // R12.2b: RÓISÍN behind the island bar (red hair up, a bottle-green top); R12.2c: SEAMUS O'SHORTLY (a wee leprechaun of a
  // man: green coat, green top hat, a big red beard, a clay pipe), his six wee buddies, BIG DESSIE (red-faced, shirt sleeves)
  barmaid: { body: "#1f4a2e", legs: "#1b1420", skin: "#f5c8a8", hat: "#b8441a", hatShape: "none", prop: "none", bulk: 1.0 },
  leprechaun: { body: "#1f6a2e", legs: "#163a1e", skin: "#f0b898", hat: "#1f6a2e", hatShape: "none", prop: "none", bulk: 1.2 },
  lep_buddy: { body: "#2f8a3a", legs: "#1f4a2a", skin: "#f0c09a", hat: "#2f8a3a", hatShape: "none", prop: "none", bulk: 1.15 },
  drunk_dancer: { body: "#f4f1ea", legs: "#2a2a3a", skin: "#e8907a", hat: "#3a2418", hatShape: "none", prop: "none", bulk: 1.4 },
  pigeon_lady: { body: "#6b8f5a", legs: "#5a4d6e", skin: "#e0a67c", hat: "#b5653b", hatShape: "scarf", prop: "crumbs" },
};

/** R12.1: Old Mossy (tweed and a flat cap), Noreen (a purple cardigan, white curls); THE RUSTY BIN LIDS: fiddle,
 *  tin whistle, bodhrán, banjo */
const PUB_LOOKS: Record<string, Look[]> = {
  regular: [
    { body: "#7a6a48", legs: "#4a4038", skin: "#e8b090", hat: "#5a5040", hatShape: "none", prop: "none", bulk: 1.15 },
    { body: "#8a3a9a", legs: "#3a3444", skin: "#f0c8a8", hat: "#f4f1ea", hatShape: "none", prop: "none", bulk: 1.05 },
  ],
  trad_band: [
    { body: "#2f6b3a", legs: "#2b2433", skin: "#f0c09a", hat: "#c86a2a", hatShape: "none", prop: "none", bulk: 1.05 },
    { body: "#e8e2d4", legs: "#3a4a6a", skin: "#e8b48a", hat: "#3a2418", hatShape: "cap", prop: "none", bulk: 1.0 },
    { body: "#8e1f2e", legs: "#2b2433", skin: "#d9a07a", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.3 },
    { body: "#3a4a6a", legs: "#4a3a2a", skin: "#f0c8a0", hat: "#e0c060", hatShape: "none", prop: "none", bulk: 1.1 },
  ],
  // R12.1b: the eight drinkers: a lad in a green-and-white hooped jersey, a woman in a red coat, a big fella in a
  // cable-knit jumper, a student in a beanie, an old boy in a flat cap and tweed, a woman in a denim jacket, and the
  // two out on the pavement (a suit with his tie loose, a woman in a yellow raincoat)
  // R12.2c: the wee buddies: different greens, different beards (hat: the beard's colour)
  lep_buddy: [
    { body: "#2f8a3a", legs: "#1f4a2a", skin: "#f0c09a", hat: "#c8541a", hatShape: "none", prop: "none", bulk: 1.15 },
    { body: "#3a9a4a", legs: "#3a2a1a", skin: "#e8b48a", hat: "#5a3a1a", hatShape: "none", prop: "none", bulk: 1.2 },
    { body: "#1f7a3a", legs: "#1f4a2a", skin: "#f5c29a", hat: "#e8e2d4", hatShape: "none", prop: "none", bulk: 1.1 },
    { body: "#4aa858", legs: "#2a3a2a", skin: "#d99a6c", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.15 },
    { body: "#2a6a32", legs: "#3a2a1a", skin: "#f0c8a8", hat: "#e0a030", hatShape: "none", prop: "none", bulk: 1.25 },
    { body: "#3a8a5a", legs: "#1f4a2a", skin: "#f0b898", hat: "#a83a1a", hatShape: "none", prop: "none", bulk: 1.1 },
  ],
  patron: [
    { body: "#2f8a4a", legs: "#2b3350", skin: "#f0c09a", hat: "#8a5a2a", hatShape: "none", prop: "none", bulk: 1.15 },
    { body: "#b8262a", legs: "#2b2433", skin: "#e8b48a", hat: "#3a1a0a", hatShape: "none", prop: "none", bulk: 1.0 },
    { body: "#e8dcc4", legs: "#3a3a44", skin: "#d99a6c", hat: "#5a3a24", hatShape: "none", prop: "none", bulk: 1.45 },
    { body: "#5a4a8a", legs: "#3a4a6a", skin: "#f5c29a", hat: "#d62c2c", hatShape: "beret", prop: "none", bulk: 1.0 },
    { body: "#6a5a3a", legs: "#4a4038", skin: "#e8b090", hat: "#4a4030", hatShape: "cap", prop: "none", bulk: 1.15 },
    { body: "#4a6a9a", legs: "#1b1420", skin: "#c98a5c", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.0 },
    { body: "#3a3a44", legs: "#2b2433", skin: "#f0c8a0", hat: "#2b2433", hatShape: "none", prop: "none", bulk: 1.15 },
    { body: "#ffcf3a", legs: "#3a4a6a", skin: "#e8b48a", hat: "#7a3a1a", hatShape: "none", prop: "none", bulk: 1.0 },
  ],
};

/** R12.1-R12.2: THE SOGGY SHAMROCK's people (which one; sitting; playing; dancing) */
const PUB_KINDS = new Set(["regular", "trad_band", "barman", "patron", "barmaid", "leprechaun", "lep_buddy", "drunk_dancer"]);
/** R12.2: the chest squares (see build's part()): never built */
const NO_CHEST = new Set(["lapel", "tee", "suspender", "badge", "donShirt", "steveLining", "steveGoods", "steveFlap", "vgTie", "bowtie", "shirtfront", "vest", "armor", "copbadge", "apron", "tag", "tie", "fgVest", "fgBtn", "fgApron", "patShirt", "patTie", "cable", "tbVest", "inmatenum", "btn", "coinpin", "buckle", "donMedal"]);

interface Vis {
  /** R12.1: a pub regular or musician: which one, sitting down (on a stool or the band's bench) */
  pub: { v: number; seat: number } | null;
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
  /** R12.6: the people being drawn (for lighting them with the room they're in) */
  *roots(): Iterable<TransformNode> { for (const v of this.map.values()) if (v.enabled) yield v.root; }
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
  /** R12.1: the pub's posted people (which regular / musician is which; who sits) */
  pubPosts: { kind: string; x: number; z: number; v?: number; sit?: number }[] = [];

  private build(id: string, v: NpcView): Vis {
    const sc = this.scene;
    const sal = v.kind === "cashier" && !!this.salAt && Math.hypot(v.x - this.salAt.x, v.z - this.salAt.z) < 3;
    let pubV: Vis["pub"] = null;
    if (PUB_KINDS.has(v.kind)) {
      let best: (typeof this.pubPosts)[number] | null = null, bd = 4;
      for (const q of this.pubPosts) { const d = Math.hypot(q.x - v.x, q.z - v.z); if (q.kind === v.kind && d < bd) { bd = d; best = q; } }
      pubV = { v: best?.v ?? 0, seat: best?.sit ?? 0 };
    }
    const L = sal ? SAL_LOOK : (pubV && PUB_LOOKS[v.kind]?.[pubV.v]) || LOOKS[v.kind] || LOOKS.tourist;
    const bulk = L.bulk ?? 1;
    const root = new TransformNode("npc-" + id, sc);
    const pivot = new TransformNode("npcPivot", sc);
    pivot.parent = root;
    // R12.2 (Blake: "stop adding the weird square objects on their chests"): flat boxes and plates stuck on the front of a
    // body (waistcoat fronts, shirt panels, ties, badges, tee prints, aprons, suspenders, armour plates, lapels, buttons)
    // are never built; a character reads from its colours, hair, hats and props instead
    const part = (m: Mesh, c: string, parent: TransformNode, outline = 0.025) => { if (NO_CHEST.has(m.name)) { m.dispose(); return m; } m.parent = parent; m.material = toon(sc, c); if (outline > 0) ink(m, outline); m.isPickable = false; return m; };
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
    if (v.kind === "don") {
      // R11.1: DON BINNIE (Blake's pick): a white suit, gold chains, slicked-back hair, shades indoors, a cigar
      for (const [dy, d] of [[1.36, 0.34], [1.3, 0.42]] as [number, number][]) { const chain = part(MeshBuilder.CreateTorus("donChain", { diameter: d, thickness: 0.035, tessellation: 14 }, sc), "#ffd54a", pivot, 0); chain.position.set(0, dy, 0.16); chain.rotation.x = 1.2; }
      const med = part(MeshBuilder.CreateCylinder("donMedal", { diameter: 0.12, height: 0.02, tessellation: 10 }, sc), "#ffd54a", pivot, 0); med.rotation.x = Math.PI / 2; med.position.set(0, 1.18, 0.29 * bulk);
      const shirt = part(MeshBuilder.CreateBox("donShirt", { width: 0.14, height: 0.3, depth: 0.03 }, sc), "#1b1420", pivot, 0); shirt.position.set(0, 1.25, 0.27 * bulk);
      const rose = part(MeshBuilder.CreateSphere("donRose", { diameter: 0.08, segments: 4 }, sc), "#c41e3a", pivot, 0); rose.position.set(0.16, 1.3, 0.27 * bulk);
      const shades = part(MeshBuilder.CreateBox("donShades", { width: 0.3, height: 0.07, depth: 0.03 }, sc), "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
      const hair = part(MeshBuilder.CreateSphere("donHair", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), "#14100c", head, 0.01); hair.position.set(0, 0.04, -0.02); hair.scaling.set(1, 0.8, 1.08);
      const cigar = part(MeshBuilder.CreateCylinder("donCigar", { diameter: 0.04, height: 0.18, tessellation: 6 }, sc), "#6b3a1a", head, 0); cigar.rotation.x = Math.PI / 2; cigar.rotation.y = 0.3; cigar.position.set(0.07, -0.1, 0.25);
      const tip = part(MeshBuilder.CreateSphere("donCigarTip", { diameter: 0.045, segments: 4 }, sc), "#ff7a1a", head, 0); tip.position.set(0.1, -0.1, 0.34);
      const tash = part(MeshBuilder.CreateBox("donTash", { width: 0.2, height: 0.04, depth: 0.03 }, sc), "#14100c", head, 0); tash.position.set(0, -0.06, 0.19);
      for (const sx of [-1, 1]) { const ring = part(MeshBuilder.CreateTorus("donRing", { diameter: 0.07, thickness: 0.02, tessellation: 8 }, sc), "#ffd54a", pivot, 0); ring.position.set(sx * 0.42 * bulk, 0.8, 0.05); }
    }
    if (v.kind === "sketchy_steve") {
      // R11.4: SKETCHY STEVE: a raccoon in a trench coat (collar up, belt), a battered fedora, the coat held open on a
      // purple lining full of glowing cartoon goods; bandit mask, ears, snout, a striped tail out the back
      const mask = part(MeshBuilder.CreateBox("steveMask", { width: 0.36, height: 0.1, depth: 0.12 }, sc), "#1b1420", head, 0); mask.position.set(0, 0.03, 0.15);
      for (const ex of [-0.13, 0.13]) { const ear = part(MeshBuilder.CreateSphere("steveEar", { diameter: 0.13, segments: 6 }, sc), "#4a4652", head, 0.012); ear.position.set(ex, 0.22, -0.02); }
      const snout = part(MeshBuilder.CreateSphere("steveSnout", { diameter: 0.15, segments: 6 }, sc), "#e0dcd2", head, 0.01); snout.position.set(0, -0.07, 0.19);
      const nose = part(MeshBuilder.CreateSphere("steveNose", { diameter: 0.06, segments: 4 }, sc), "#1b1420", head, 0); nose.position.set(0, -0.05, 0.27);
      const brim = part(MeshBuilder.CreateCylinder("steveBrim", { diameter: 0.56, height: 0.03, tessellation: 14 }, sc), "#3a3028", head, 0.01); brim.position.set(0, 0.2, 0); brim.rotation.x = 0.12;
      const crown = part(MeshBuilder.CreateCylinder("steveCrown", { diameter: 0.34, diameterTop: 0.3, height: 0.18, tessellation: 12 }, sc), "#3a3028", head, 0.01); crown.position.set(0, 0.3, -0.01);
      const band = part(MeshBuilder.CreateCylinder("steveBand", { diameter: 0.345, height: 0.04, tessellation: 12 }, sc), "#8e1f2e", head, 0); band.position.set(0, 0.24, -0.01);
      for (const sx of [-1, 1]) { const col = part(MeshBuilder.CreateBox("steveCollar", { width: 0.14, height: 0.24, depth: 0.05 }, sc), "#96764e", pivot, 0.01); col.position.set(sx * 0.14, 1.42, 0.2); col.rotation.z = sx * 0.3; }
      const lining = part(MeshBuilder.CreateBox("steveLining", { width: 0.34, height: 0.6, depth: 0.02 }, sc), "#5a2a8a", pivot, 0); lining.position.set(0, 1.05, 0.3 * bulk);
      for (let i = 0; i < 6; i++) { const it = part(MeshBuilder.CreateBox("steveGoods", { width: 0.06, height: 0.09, depth: 0.03 }, sc), ["#7dff5a", "#ff4a3a", "#5ae0ff"][i % 3], pivot, 0); it.position.set(-0.1 + (i % 3) * 0.1, 1.2 - Math.floor(i / 3) * 0.22, 0.3 * bulk + 0.02); }
      for (const sx of [-1, 1]) { const flap = part(MeshBuilder.CreateBox("steveFlap", { width: 0.16, height: 0.85, depth: 0.04 }, sc), "#a8865a", pivot, 0.012); flap.position.set(sx * 0.3, 0.98, 0.3 * bulk + 0.04); flap.rotation.y = -sx * 0.6; }
      const belt = part(MeshBuilder.CreateBox("steveBelt", { width: 0.5 * bulk, height: 0.06, depth: 0.5 * bulk }, sc), "#6b4a2b", pivot, 0); belt.position.y = 0.92;
      for (let i = 0; i < 5; i++) { const seg = part(MeshBuilder.CreateCylinder("steveTail", { diameter: 0.2 - i * 0.02, height: 0.16, tessellation: 8 }, sc), i % 2 ? "#2b2433" : "#8a8a96", pivot, 0.01); seg.rotation.x = -1.0; seg.position.set(0, 0.45 + i * 0.07, -0.3 - i * 0.12); }
    }
    if (v.kind === "velvet_guard") {
      // R11.1: the Don's boys: black suits, shades, an earpiece and its wire, a red tie
      const shades = part(MeshBuilder.CreateBox("vgShades", { width: 0.3, height: 0.07, depth: 0.03 }, sc), "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
      const ear = part(MeshBuilder.CreateSphere("vgEar", { diameter: 0.06, segments: 4 }, sc), "#d8dce4", head, 0); ear.position.set(0.19, -0.02, 0.02);
      const wire = part(MeshBuilder.CreateCylinder("vgWire", { diameter: 0.012, height: 0.3, tessellation: 4 }, sc), "#d8dce4", head, 0); wire.position.set(0.17, -0.2, -0.04);
      const tie = part(MeshBuilder.CreateBox("vgTie", { width: 0.07, height: 0.36, depth: 0.02 }, sc), "#8e0f2e", pivot, 0); tie.position.set(0, 1.2, 0.27 * bulk + 0.01);
    }
    if (v.kind === "champ") {
      const beard = part(MeshBuilder.CreateCylinder("beard", { diameterTop: 0.32, diameterBottom: 0.12, height: 0.34, tessellation: 8 }, sc), "#c8c4cc", head, 0.012); beard.position.set(0, -0.2, 0.1);
      const tache = part(MeshBuilder.CreateBox("tache", { width: 0.24, height: 0.05, depth: 0.04 }, sc), "#c8c4cc", head, 0); tache.position.set(0, -0.06, 0.19);
      const belt = part(MeshBuilder.CreateTorus("champbelt", { diameter: 0.58 * 2.0 * 0.85, thickness: 0.09, tessellation: 14 }, sc), "#d9a632", pivot, 0.01); belt.position.y = 0.82;
      const plate = part(MeshBuilder.CreateCylinder("beltplate", { diameter: 0.3, height: 0.05, tessellation: 12 }, sc), "#ffe14a", pivot, 0.01); plate.rotation.x = Math.PI / 2; plate.position.set(0, 0.82, 0.5);
      const num = part(MeshBuilder.CreatePlane("inmatenum", { width: 0.34, height: 0.12 }, sc), "#f4f1ea", pivot, 0); num.position.set(0.18, 1.3, 0.55); num.rotation.y = Math.PI;
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
    if (v.kind === "barman") {
      // R12.1: FERGAL: a black waistcoat, sleeves rolled, a long white apron, ginger mutton chops, a cloth on his shoulder
      const vest = part(MeshBuilder.CreateBox("fgVest", { width: 0.5 * bulk, height: 0.46, depth: 0.04 }, sc), "#1b1420", pivot, 0); vest.position.set(0, 1.18, 0.27 * bulk);
      for (const y of [1.05, 1.17, 1.29]) { const b = part(MeshBuilder.CreateSphere("fgBtn", { diameter: 0.04, segments: 4 }, sc), "#d9a632", pivot, 0); b.position.set(0, y, 0.3 * bulk); }
      const apron = part(MeshBuilder.CreateBox("fgApron", { width: 0.5 * bulk, height: 0.62, depth: 0.04 }, sc), "#f4f1ea", pivot, 0.01); apron.position.set(0, 0.62, 0.27 * bulk);
      for (const sx of [-1, 1]) { const ch = part(MeshBuilder.CreateBox("fgChop", { width: 0.06, height: 0.16, depth: 0.1 }, sc), "#b8562a", head, 0); ch.position.set(sx * 0.18, -0.04, 0.08); }
      const hair = part(MeshBuilder.CreateSphere("fgHair", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), "#b8562a", head, 0.01); hair.position.set(0, 0.06, -0.03);
      const cloth = part(MeshBuilder.CreateBox("fgCloth", { width: 0.16, height: 0.04, depth: 0.32 }, sc), "#e8e2d4", pivot, 0); cloth.position.set(0.24 * bulk, 1.44, 0.02);
    }
    if (v.kind === "regular" && pubV?.v === 0) {
      // Old Mossy: a tweed flat cap, a bushy white moustache, elbow patches
      const cap = part(MeshBuilder.CreateCylinder("mossCap", { diameterTop: 0.36, diameterBottom: 0.44, height: 0.1, tessellation: 12 }, sc), "#5a5040", head, 0.012); cap.position.set(0, 0.17, 0.02); cap.rotation.x = 0.15;
      const peak = part(MeshBuilder.CreateBox("mossPeak", { width: 0.3, height: 0.03, depth: 0.14 }, sc), "#5a5040", head, 0.008); peak.position.set(0, 0.13, 0.2); peak.rotation.x = 0.2;
      const tash = part(MeshBuilder.CreateBox("mossTash", { width: 0.22, height: 0.06, depth: 0.05 }, sc), "#f4f1ea", head, 0); tash.position.set(0, -0.07, 0.18);
      const brows = part(MeshBuilder.CreateBox("mossBrow", { width: 0.24, height: 0.04, depth: 0.03 }, sc), "#f4f1ea", head, 0); brows.position.set(0, 0.09, 0.18);
    }
    if (v.kind === "regular" && pubV?.v === 1) {
      // Noreen: white curls, big round glasses, pearls
      for (let q = 0; q < 7; q++) { const u = (q / 7) * Math.PI * 2; const c = part(MeshBuilder.CreateSphere("norCurl", { diameter: 0.17, segments: 5 }, sc), "#f4f1ea", head, 0.008); c.position.set(Math.cos(u) * 0.15, 0.12 + Math.sin(q * 1.7) * 0.03, Math.sin(u) * 0.13 - 0.03); }
      for (const sx of [-1, 1]) { const g = part(MeshBuilder.CreateTorus("norSpecs", { diameter: 0.11, thickness: 0.016, tessellation: 10 }, sc), "#8a3a9a", head, 0); g.rotation.x = Math.PI / 2; g.position.set(sx * 0.07, 0.03, 0.19); }
      const pearls = part(MeshBuilder.CreateTorus("norPearls", { diameter: 0.3, thickness: 0.03, tessellation: 14 }, sc), "#f8f4ec", pivot, 0); pearls.position.set(0, 1.4, 0.06); pearls.rotation.x = 0.4;
    }
    if (v.kind === "patron") {
      // R12.1b: the drinkers' bits: hair (long for some), a scarf, a tie, glasses, a jersey's hoops
      const vv = pubV?.v ?? 0;
      if (vv === 0) for (const y of [0.92, 1.1, 1.28]) { const hp = part(MeshBuilder.CreateTorus("hoop", { diameter: 0.58 * bulk, thickness: 0.06, tessellation: 14 }, sc), "#f4f1ea", pivot, 0); hp.position.y = y; }
      if (vv === 1 || vv === 5 || vv === 7) { const hair = part(MeshBuilder.CreateSphere("patHair", { diameter: 0.46, segments: 8 }, sc), L.hat ?? "#3a1a0a", head, 0.01); hair.position.set(0, 0.02, -0.08); hair.scaling.set(1, 1.3, 0.95); }
      if (vv === 2) { const beard = part(MeshBuilder.CreateSphere("patBeard", { diameter: 0.32, segments: 6 }, sc), "#5a3a24", head, 0.01); beard.position.set(0, -0.13, 0.1); beard.scaling.set(1, 0.8, 0.7); for (let k = 0; k < 4; k++) { const cb = part(MeshBuilder.CreateBox("cable", { width: 0.04, height: 0.5, depth: 0.03 }, sc), "#d8ccb4", pivot, 0); cb.position.set(-0.15 + k * 0.1, 1.1, 0.27 * bulk + 0.03); } }
      if (vv === 4) { const tash = part(MeshBuilder.CreateBox("patTash", { width: 0.2, height: 0.05, depth: 0.04 }, sc), "#d8d0c4", head, 0); tash.position.set(0, -0.07, 0.18); }
      if (vv === 5) { const specs = part(MeshBuilder.CreateBox("patSpecs", { width: 0.26, height: 0.05, depth: 0.03 }, sc), "#1b1420", head, 0); specs.position.set(0, 0.03, 0.19); }
      if (vv === 6) { const shirt = part(MeshBuilder.CreateBox("patShirt", { width: 0.16, height: 0.34, depth: 0.03 }, sc), "#f4f1ea", pivot, 0); shirt.position.set(0, 1.22, 0.3 * bulk); const tie = part(MeshBuilder.CreateBox("patTie", { width: 0.07, height: 0.3, depth: 0.02 }, sc), "#8e1f2e", pivot, 0); tie.position.set(0.03, 1.18, 0.31 * bulk); tie.rotation.z = 0.25; }
      if (vv === 1 || vv === 3) { const sc2 = part(MeshBuilder.CreateTorus("patScarf", { diameter: 0.34, thickness: 0.1, tessellation: 10 }, sc), vv === 1 ? "#f4f1ea" : "#2f8a4a", pivot, 0.01); sc2.position.y = 1.42; }
    }
    if (v.kind === "barmaid") {
      // R12.2b: RÓISÍN: red hair up in a bun, a fringe, little gold hoops, rolled-up sleeves (no chest squares)
      const hair = part(MeshBuilder.CreateSphere("rosHair", { diameter: 0.45, segments: 8, slice: 0.55 }, sc), L.hat!, head, 0.01); hair.position.set(0, 0.05, -0.03);
      const bun = part(MeshBuilder.CreateSphere("rosBun", { diameter: 0.2, segments: 6 }, sc), L.hat!, head, 0.01); bun.position.set(0, 0.21, -0.12);
      for (const sx of [-1, 1]) { const e = part(MeshBuilder.CreateTorus("rosHoop", { diameter: 0.06, thickness: 0.012, tessellation: 10 }, sc), "#e8c050", head, 0); e.position.set(sx * 0.2, -0.06, 0); e.rotation.z = Math.PI / 2; }
    }
    if (v.kind === "leprechaun" || v.kind === "lep_buddy") {
      // R12.2c: SEAMUS O'SHORTLY and his lads: a top hat (Seamus) or a pointy cap with a brim (the lads), a big beard,
      // sideburns, little pointy ears; Seamus has his clay pipe and a gold band round the hat. All wee.
      const boss = v.kind === "leprechaun", beardCol = boss ? "#c8401a" : (L.hat ?? "#c8541a"), hatCol = boss ? "#1f6a2e" : L.body;
      if (boss) {
        const brim = part(MeshBuilder.CreateCylinder("lepBrim", { diameter: 0.56, height: 0.04, tessellation: 18 }, sc), hatCol, head, 0.012); brim.position.y = 0.17;
        const crown = part(MeshBuilder.CreateCylinder("lepCrown", { diameterTop: 0.34, diameterBottom: 0.3, height: 0.36, tessellation: 16 }, sc), hatCol, head, 0.012); crown.position.y = 0.36;
        const band = part(MeshBuilder.CreateCylinder("lepBand", { diameter: 0.315, height: 0.06, tessellation: 16 }, sc), "#e8c050", head, 0); band.position.y = 0.22;
        const clover = part(MeshBuilder.CreateSphere("lepClover", { diameter: 0.08, segments: 5 }, sc), "#5ad87a", head, 0); clover.position.set(0.16, 0.25, 0.05);
        const bowl = part(MeshBuilder.CreateCylinder("lepPipeBowl", { diameter: 0.07, height: 0.09, tessellation: 8 }, sc), "#f4f1ea", head, 0.006); bowl.position.set(0.16, -0.08, 0.36);
        const stem = part(MeshBuilder.CreateCylinder("lepPipeStem", { diameter: 0.022, height: 0.2, tessellation: 6 }, sc), "#f4f1ea", head, 0); stem.rotation.x = Math.PI / 2 - 0.3; stem.position.set(0.1, -0.11, 0.26);
      } else {
        const brim = part(MeshBuilder.CreateCylinder("lepCapBrim", { diameter: 0.46, height: 0.035, tessellation: 14 }, sc), hatCol, head, 0.012); brim.position.y = 0.16;
        const cap = part(MeshBuilder.CreateCylinder("lepCap", { diameterTop: 0.04, diameterBottom: 0.32, height: 0.36, tessellation: 12 }, sc), hatCol, head, 0.012); cap.position.y = 0.34; cap.rotation.z = (((pubV?.v ?? 0) % 3) - 1) * 0.25;
        const band = part(MeshBuilder.CreateCylinder("lepCapBand", { diameter: 0.29, height: 0.05, tessellation: 12 }, sc), "#e8c050", head, 0); band.position.y = 0.2;
      }
      const beard = part(MeshBuilder.CreateSphere("lepBeard", { diameter: 0.36, segments: 8 }, sc), beardCol, head, 0.01); beard.position.set(0, -0.15, 0.1); beard.scaling.set(1.05, 1.0, 0.75);
      for (const sx of [-1, 1]) { const sb2 = part(MeshBuilder.CreateSphere("lepBurn", { diameter: 0.14, segments: 5 }, sc), beardCol, head, 0.006); sb2.position.set(sx * 0.17, 0.0, 0.03); const ear = part(MeshBuilder.CreateCylinder("lepEar", { diameterTop: 0, diameterBottom: 0.08, height: 0.14, tessellation: 5 }, sc), L.skin, head, 0.006); ear.position.set(sx * 0.21, 0.07, -0.01); ear.rotation.z = -sx * 1.1; }
      root.scaling.setAll(boss ? 0.62 : 0.52);
    }
    if (v.kind === "drunk_dancer") {
      // R12.2c: BIG DESSIE: messy hair, a red face, rosy cheeks, his shirt sleeves rolled up (no chest squares)
      const hair = part(MeshBuilder.CreateSphere("dessieHair", { diameter: 0.46, segments: 7, slice: 0.55 }, sc), L.hat!, head, 0.01); hair.position.set(0.03, 0.06, -0.03); hair.rotation.z = 0.2;
      for (const sx of [-1, 1]) { const ch = part(MeshBuilder.CreateSphere("dessieCheek", { diameter: 0.1, segments: 5 }, sc), "#ff5a5a", head, 0); ch.position.set(sx * 0.12, -0.03, 0.16); }
    }
    if (v.kind === "trad_band") {
      const vv = pubV?.v ?? 0;
      if (vv === 0) { const hair = part(MeshBuilder.CreateSphere("tbHair", { diameter: 0.46, segments: 8, slice: 0.55 }, sc), "#c86a2a", head, 0.01); hair.position.set(0, 0.05, -0.04); const vest = part(MeshBuilder.CreateBox("tbVest", { width: 0.46, height: 0.44, depth: 0.04 }, sc), "#1f4a2a", pivot, 0); vest.position.set(0, 1.18, 0.26 * bulk); }
      if (vv === 2) { const beard = part(MeshBuilder.CreateSphere("tbBeard", { diameter: 0.34, segments: 6 }, sc), "#1b1420", head, 0.01); beard.position.set(0, -0.14, 0.1); beard.scaling.set(1, 0.8, 0.7); }
      if (vv === 3) { const hair = part(MeshBuilder.CreateSphere("tbHair3", { diameter: 0.48, segments: 8 }, sc), "#e0c060", head, 0.01); hair.position.set(0, 0.02, -0.08); hair.scaling.set(1, 1.15, 1); }
    }
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
    // R12.1: the pub: a pint in the regulars' hands; the band's instruments
    if (v.kind === "regular" || v.kind === "patron" || v.kind === "drunk_dancer") {
      const g = part(MeshBuilder.CreateCylinder("pint", { diameterTop: 0.1, diameterBottom: 0.08, height: 0.17, tessellation: 10 }, sc), "#1b0d08", armR, 0.008); g.position.set(0, -0.6, 0.1);
      const h = part(MeshBuilder.CreateCylinder("pintHead", { diameter: 0.1, height: 0.03, tessellation: 10 }, sc), "#f4e8c8", armR, 0); h.position.set(0, -0.505, 0.1);
    }
    if (v.kind === "trad_band") {
      const vv = pubV?.v ?? 0, wood = "#8a4a1a", dark = "#3a1a0a";
      if (vv === 0) { // the fiddle on the left shoulder, the bow in the right hand
        const fid = part(MeshBuilder.CreateBox("fiddle", { width: 0.2, height: 0.07, depth: 0.4 }, sc), wood, pivot, 0.01); fid.position.set(-0.2, 1.42, 0.28); fid.rotation.set(0.15, -0.45, -0.35);
        const neck = part(MeshBuilder.CreateBox("fiddleNeck", { width: 0.04, height: 0.03, depth: 0.28 }, sc), dark, pivot, 0); neck.position.set(-0.36, 1.48, 0.58); neck.rotation.set(0.15, -0.45, -0.35);
        const bow = part(MeshBuilder.CreateBox("bow", { width: 0.62, height: 0.012, depth: 0.012 }, sc), "#e8d7a8", armR, 0); bow.position.set(-0.22, -0.6, 0.12);
      }
      if (vv === 1) { const wh = part(MeshBuilder.CreateCylinder("whistle", { diameter: 0.03, height: 0.32, tessellation: 8 }, sc), "#c8ccd4", armR, 0.006); wh.position.set(-0.06, -0.62, 0.14); wh.rotation.x = 1.2; }
      if (vv === 2) { // the bodhrán on the left arm, the tipper in the right hand
        const dr = part(MeshBuilder.CreateCylinder("bodhran", { diameter: 0.5, height: 0.09, tessellation: 18 }, sc), "#e8dcbc", armL, 0.012); dr.position.set(0.14, -0.5, 0.18); dr.rotation.z = Math.PI / 2; dr.rotation.y = 0.5;
        const rim = part(MeshBuilder.CreateTorus("bodhranRim", { diameter: 0.5, thickness: 0.04, tessellation: 18 }, sc), wood, armL, 0); rim.position.set(0.14, -0.5, 0.18); rim.rotation.z = Math.PI / 2; rim.rotation.y = 0.5;
        const tip = part(MeshBuilder.CreateCylinder("tipper", { diameter: 0.025, height: 0.22, tessellation: 6 }, sc), dark, armR, 0); tip.position.set(0, -0.62, 0.08); tip.rotation.x = Math.PI / 2;
      }
      if (vv === 3) { // the banjo on the lap (held by the left hand up the neck)
        const pot = part(MeshBuilder.CreateCylinder("banjo", { diameter: 0.36, height: 0.07, tessellation: 18 }, sc), "#f4f1ea", pivot, 0.01); pot.rotation.x = Math.PI / 2; pot.rotation.y = 0.2; pot.position.set(0.1, 0.92, 0.38);
        const ring = part(MeshBuilder.CreateTorus("banjoRim", { diameter: 0.37, thickness: 0.035, tessellation: 18 }, sc), "#c8ccd4", pivot, 0); ring.rotation.x = Math.PI / 2; ring.rotation.y = 0.2; ring.position.set(0.1, 0.92, 0.39);
        const neck = part(MeshBuilder.CreateBox("banjoNeck", { width: 0.62, height: 0.05, depth: 0.03 }, sc), wood, pivot, 0.006); neck.position.set(-0.38, 1.02, 0.4); neck.rotation.z = -0.25;
      }
    }
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
    if (v.kind === "meat_locker" || v.kind === "cold_cuts" || v.kind === "velvet_guard") root.scaling.setAll(v.kind === "velvet_guard" ? 1.22 : 1.32); // (R5: enormous; R7: his twin too)
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
      root, pivot, head, armL, armR, legL, legR, prop, stars, bang, huh, big, beam, laser, bubble: null, bubbleT: 0, pub: pubV,
      snaps: [], view: { ...v }, phase: Math.random() * 6, lastX: v.x, lastZ: v.z,
      lean: 0, armUp: 0, spin: 0, flat: 0, windup: 0, phoneUp: 0, enabled: true, hitT: 0, slapT: 0, speed: 0, phase0: Math.random() * 6,
    };
  }

  /** R12.5: building a character is a few ms (dozens of parts merged); once the game's running, at most `buildCap` a frame
   *  (the next ones wait a frame: new passers-by appear away from the players). Loading builds everyone at once. */
  buildCap = Infinity;
  private builtNow = 0;
  /** call once a frame (before the syncs) */
  newFrame() { this.builtNow = 0; }
  sync(id: string, v: NpcView, now: number) {
    let n = this.map.get(id);
    if (!n) { if (this.builtNow >= this.buildCap) return; this.builtNow++; n = this.build(id, v); this.map.set(id, n); }
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
      n.pivot.position.x = 0; n.pivot.position.z = 0; n.head.rotation.x = 0; // (R12.2c: Big Dessie wanders about his spot)

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
      if (n.pub && st === "work") {
        // R12.1: the pub: sitting down (a stool at the bar, the band's bench); the band playing along, the regulars
        // sipping, Fergal polishing a glass
        const t = this.time + n.phase0, beat = t * (116 / 60) * Math.PI; // (the jig: 116 dotted-crotchets a minute)
        const seat = n.pub.seat, high = seat >= 0.6;
        if (seat > 0) { n.pivot.position.y = seat / Math.max(0.1, n.root.scaling.y) - 0.72; /* (R12.2c: wee folk sit right too) */ n.legL.rotation.x = high ? -1.15 : -1.45; n.legR.rotation.x = (high ? -1.15 : -1.45) + (n.view.kind === "trad_band" ? Math.max(0, Math.sin(beat)) * 0.25 : 0); }
        if (n.view.kind === "trad_band") {
          const vv = n.pub.v;
          if (vv === 0) { n.armL.rotation.x = -1.45; n.armL.rotation.z = 0.15; n.armR.rotation.x = -1.1 + Math.sin(beat * 1.5) * 0.28; n.armR.rotation.z = 0.5 + Math.sin(beat * 1.5) * 0.25; n.head.rotation.z = -0.25; }
          else if (vv === 1) { n.armL.rotation.x = n.armR.rotation.x = -1.6 + Math.sin(t * 13) * 0.04; n.armL.rotation.z = 0.35; n.armR.rotation.z = -0.35; }
          else if (vv === 2) { n.armL.rotation.x = -0.9; n.armL.rotation.z = -0.3; n.armR.rotation.x = -1.0 + Math.abs(Math.sin(beat * 1.5)) * 0.55; }
          else { n.armR.rotation.x = -0.75 + Math.sin(beat * 3) * 0.12; n.armL.rotation.x = -1.0; n.armL.rotation.z = -0.9; }
          n.pivot.position.y += Math.abs(Math.sin(beat)) * 0.02;
        } else if (n.view.kind === "leprechaun") {
          // Seamus: puffs his pipe, taps the chair arm, the odd jab of a finger at you
          n.armR.rotation.x = -0.7 + Math.max(0, Math.sin(t * 0.6) - 0.85) * 5; n.armL.rotation.x = -0.4 + Math.sin(t * 2.3) * 0.08;
          n.head.rotation.z = Math.sin(t * 0.4) * 0.08;
        } else if (n.view.kind === "lep_buddy") {
          // the lads lounging: one leg jiggling, counting coins, a wee hop now and then
          n.armL.rotation.x = -0.9 + Math.sin(t * 6) * 0.15; n.armR.rotation.x = -0.9 - Math.sin(t * 6) * 0.15;
          n.legR.rotation.x = Math.max(0, Math.sin(t * 9)) * 0.2;
          n.pivot.position.y += Math.max(0, Math.sin(t * 1.3 + n.phase0) - 0.92) * 2.5;
        } else if (n.view.kind === "drunk_dancer") {
          // R12.2c: BIG DESSIE: every couple of seconds a new move, picked at random (the same for everyone watching:
          // it's off the clock), wandering about his spot: stagger, spin, flail, down on his knees, kick-jig, point at
          // the sky. Never the same twice in a row for long.
          const T = this.time + n.phase0 * 7, len = 1.6 + (Math.sin(Math.floor(T / 2.0) * 3.1) * 0.5 + 0.5) * 1.6, seg = Math.floor(T / len), u = T / len - seg;
          const h = (k: number) => { const x = Math.sin(seg * 127.1 + k * 311.7 + n.phase0 * 13) * 43758.5453; return x - Math.floor(x); };
          const move = Math.floor(h(1) * 6), beat2 = T * (116 / 60) * Math.PI;
          n.pivot.position.x = Math.sin(T * 0.7 + h(2) * 6) * 0.45 + Math.sin(T * 1.9) * 0.12;
          n.pivot.position.z = Math.cos(T * 0.53 + h(3) * 6) * 0.4;
          n.pivot.rotation.z = Math.sin(T * 2.1) * 0.12; n.armR.rotation.z = 0;
          if (move === 0) { n.pivot.rotation.z = Math.sin(T * 3.2) * 0.35; n.armL.rotation.z = 0.9 + Math.sin(T * 4) * 0.3; n.armR.rotation.x = -1.2; n.legL.rotation.x = Math.sin(T * 5) * 0.4; n.legR.rotation.x = -Math.sin(T * 5) * 0.4; }
          else if (move === 1) { n.pivot.rotation.y = u * Math.PI * 2 * (h(4) > 0.5 ? 1.5 : -1.5); n.armL.rotation.z = 1.3; n.armR.rotation.z = -1.3; n.armR.rotation.x = -0.3; n.pivot.position.y += Math.abs(Math.sin(u * Math.PI)) * 0.08; }
          else if (move === 2) { n.armL.rotation.x = Math.sin(T * 9) * 2.4; n.armR.rotation.x = Math.cos(T * 8) * 2.4; n.armL.rotation.z = 0.6; n.pivot.position.y += Math.abs(Math.sin(beat2)) * 0.12; n.head.rotation.z = Math.sin(T * 7) * 0.3; }
          else if (move === 3) { const k = Math.sin(Math.min(1, u * 1.4) * Math.PI); n.pivot.position.y -= 0.42 * k; n.legL.rotation.x = n.legR.rotation.x = -1.4 * k; n.armL.rotation.x = n.armR.rotation.x = -2.9 * k; n.armL.rotation.z = 0.4; n.armR.rotation.z = -0.4; n.head.rotation.x = -0.4 * k; }
          else if (move === 4) { const kk = Math.sin(beat2); n.legL.rotation.x = kk > 0 ? -kk * 1.1 : 0; n.legR.rotation.x = kk < 0 ? kk * 1.1 : 0; n.pivot.position.y += Math.abs(kk) * 0.1; n.armL.rotation.z = 0.5; n.armR.rotation.x = -1.0; }
          else { n.armL.rotation.x = -3.0; n.armL.rotation.z = 0.15 + Math.sin(T * 3) * 0.1; n.armR.rotation.x = -1.3; n.head.rotation.x = -0.35; n.pivot.rotation.z = Math.sin(T * 1.5) * 0.18; n.pivot.position.y += Math.abs(Math.sin(beat2 * 0.5)) * 0.06; }
        } else if (n.view.kind === "regular" || n.view.kind === "patron") {
          const sip = Math.max(0, Math.sin(t * 0.9) - 0.85) / 0.15;
          n.armR.rotation.x = -0.9 - sip * 1.3; n.armL.rotation.x = -0.5;
        } else if (n.view.kind === "barman" || n.view.kind === "barmaid") {
          n.armR.rotation.x = -1.0 + Math.sin(t * 5) * 0.12; n.armR.rotation.z = Math.cos(t * 5) * 0.12; n.armL.rotation.x = -0.9;
        }
      }
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
