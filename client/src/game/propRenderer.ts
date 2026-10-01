// The parts of props that change: dumpster lids (open once searched), phone-booth handsets
// (gone when smashed), vending machine glass (cracked), parked car windows (smashed) and
// flashing alarm lights on cars and shop tills. Static bodies are merged into the city.
import { Scene, MeshBuilder, Mesh, StandardMaterial, Color3, TransformNode, Vector3, DynamicTexture } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured } from "./look.ts";
import { buildCarGlass } from "./carModel.ts";
import { PLAYER_COLORS, nearBoxes, type PropDef, type PropView, type TagView, type ArenaLayout } from "@bfb/shared";

/** C4b: the graffiti styles a tag can be (the World picks one per tag) */
const TAG_WORDS = ["BANDITZ", "BOX 4 LIFE", "TRASH KING", "CRUNCH!", "WAS HERE", "HI MOM"];
const WALL_ART = ["NO FUN ALLOWED", "EAT MORE CEREAL", "RAT GANG", "VOTE NOBODY", "PIGEONS R SPIES", "OK", "SKATE OR DIE(T)", "FREE THE SPORK"];

interface Vis { def: PropDef; node: TransformNode; ready: boolean; alarm: boolean; lid?: Mesh; handset?: Mesh; glass?: Mesh; lights?: Mesh[];
  /** C5a: the practice dummy's swinging body, how hard it's wobbling */
  body?: TransformNode; wobble?: number;
  /** C5c: the vault door (swings open), a deposit box's little door, the stash's glint, the hacked screen */
  door?: TransformNode; open?: number; glint?: Mesh; }

export class PropRenderer {
  private map = new Map<string, Vis>();
  private t = 0;
  private alarmMat: StandardMaterial;
  private alarmOff: StandardMaterial;
  private crackedMat: ReturnType<typeof toon>;
  private vendGlass: ReturnType<typeof toon>;

  /** C4a: flying pieces of smashed things (vanish after ~10 s) and burst hydrants' jets */
  private debris: { m: Mesh; vx: number; vy: number; vz: number; t: number; spin: number }[] = [];
  private sprays: { node: TransformNode; t: number; drops: Mesh[] }[] = [];
  private brkDefs = new Map<string, PropDef>();
  private brkReady = new Map<string, boolean>();

  // ---- C4b: spray-painted tags ----
  private tagMats = new Map<string, StandardMaterial>();
  private tagMeshes = new Map<string, Mesh>();
  /** paint a word in a colour onto a see-through texture (cached per word + colour) */
  private tagMat(word: string, color: string, seed: number): StandardMaterial {
    const key = word + color;
    let m = this.tagMats.get(key);
    if (m) return m;
    const tex = new DynamicTexture("tag-" + key, { width: 256, height: 128 }, this.scene, true);
    const c = tex.getContext() as unknown as CanvasRenderingContext2D;
    c.clearRect(0, 0, 256, 128);
    c.save(); c.translate(128, 64); c.rotate((seed % 7 - 3) * 0.04);
    let size = 58;
    c.font = `bold ${size}px "Bungee", "Arial Black", sans-serif`;
    while (size > 16 && c.measureText(word).width > 236) { size -= 3; c.font = `bold ${size}px "Bungee", "Arial Black", sans-serif`; }
    c.textAlign = "center"; c.textBaseline = "middle";
    c.lineJoin = "round"; c.lineWidth = 10; c.strokeStyle = "#1b1420"; c.strokeText(word, 0, 4);
    c.fillStyle = color; c.fillText(word, 0, 4);
    // drips
    c.fillStyle = color;
    for (let i = 0; i < 4; i++) { const x = -90 + ((seed * 37 + i * 53) % 180); c.fillRect(x, 20, 4, 14 + ((seed + i * 11) % 22)); }
    c.restore();
    tex.hasAlpha = true; tex.update();
    m = new StandardMaterial("tagMat", this.scene);
    m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true; m.useAlphaFromDiffuseTexture = true; m.backFaceCulling = false;
    m.zOffset = -3; m.zOffsetUnits = -6;
    this.tagMats.set(key, m);
    return m;
  }
  private decal(x: number, y: number, z: number, nx: number, nz: number, w: number, mat: StandardMaterial, out = 0.26): Mesh {
    const p = MeshBuilder.CreatePlane("tag", { width: w, height: w / 2 }, this.scene);
    p.position.set(x + nx * out, y, z + nz * out); // (buildings: in front of the wall's texture and window layers; plain walls: right on them)
    p.rotation.y = Math.atan2(-nx, -nz);
    p.material = mat; p.isPickable = false; p.alphaIndex = 3;
    return p;
  }
  /** C4b: a player's tag appeared (or was scrubbed off at dawn). */
  syncTags(tags: { forEach(cb: (v: TagView, k: string) => void): void } | undefined) {
    const seen = new Set<string>();
    tags?.forEach((t, id) => {
      seen.add(id);
      if (this.tagMeshes.has(id)) return;
      const color = PLAYER_COLORS[t.c % PLAYER_COLORS.length];
      const near = this.layout ? nearBoxes(this.layout, t.x, t.z, 0.4) : [];
      const onBuilding = !this.layout || near.some((b) => b.kind === "building" || b.kind === "tower");
      const onSign = near.some((b) => !!b.sign && (b.kind === "wall" || b.kind === "fence")); // (sprayed right over a painted sign)
      this.tagMeshes.set(id, this.decal(t.x, t.y, t.z, t.nx, t.nz, 1.5, this.tagMat(TAG_WORDS[t.s % TAG_WORDS.length], color, t.s), onBuilding ? 0.26 : onSign ? 0.46 : 0.03));
    });
    for (const [id, m] of this.tagMeshes) if (!seen.has(id)) { m.dispose(); this.tagMeshes.delete(id); }
  }
  get tagCount() { return this.tagMeshes.size; }
  /** C4b: background graffiti on low- and middle-tier side walls (looks only, always there) */
  private layout: ArenaLayout | null = null;
  wallArt(arena: ArenaLayout) {
    this.layout = arena;
    const cols = ["#ff5a3c", "#43c7a6", "#ffe14a", "#ff8fa3", "#9f5fd6", "#4fb3ff", "#b6ff3c"];
    let n = 0;
    arena.boxes.forEach((b, i) => {
      if (b.art) { // (C4b: THE PIT's walls: covered both sides)
        const along = b.w > b.d ? [1, 0] : [0, 1], len = Math.max(b.w, b.d), k = Math.max(1, Math.floor(len / 3.2));
        for (const s of [-1, 1]) for (let j = 0; j < k; j++) {
          const off = (j - (k - 1) / 2) * (len / k), nx = along[1] * s, nz = along[0] * s;
          this.decal(b.x + along[0] * off + nx * b.w / 2, 1.2, b.z + along[1] * off + nz * b.d / 2, nx, nz, Math.min(4, len / k - 0.3), this.tagMat(WALL_ART[(i + j * 3 + s + 7) % WALL_ART.length], cols[(i + j + s + 2) % cols.length], i * 7 + j * 3 + s), 0.03);
        }
        return;
      }
      if (n >= 36 || b.kind !== "building" || b.y - b.h / 2 > 0.5 || b.z > 46 || b.unit !== undefined || b.h < 4) return;
      const h = Math.sin(i * 12.9898) * 43758.5453, r = h - Math.floor(h);
      if (r > 0.3) return;
      // the side walls (not the street front): east or west face
      const f = b.face ? [-(b.face[1]), b.face[0]] : [1, 0];
      const nx = Math.round(f[0]) || 1, nz = Math.round(f[1]);
      const len = nx ? b.d : b.w;
      if (len < 4) return;
      const x = b.x + nx * b.w / 2, z = b.z + nz * b.d / 2;
      this.decal(x, 1.6, z, nx, nz, Math.min(3, len - 1), this.tagMat(WALL_ART[i % WALL_ART.length], cols[i % cols.length], i));
      n++;
    });
  }

  constructor(private scene: Scene, props: PropDef[]) {
    this.alarmMat = new StandardMaterial("alarmOn", scene);
    this.alarmMat.disableLighting = true;
    this.alarmMat.emissiveColor = Color3.FromHexString("#ff3b30");
    this.alarmOff = new StandardMaterial("alarmOff", scene);
    this.alarmOff.disableLighting = true;
    this.alarmOff.emissiveColor = Color3.FromHexString("#ffb000");
    this.crackedMat = toon(scene, "#46505a");
    this.vendGlass = toon(scene, "#9fe3ff");
    for (const d of props) {
      if (d.box !== undefined && d.kind !== "vaultdoor") { this.brkDefs.set(d.id, d); this.brkReady.set(d.id, true); continue; } // (C4a: drawn in the city, hidden when smashed)
      const node = new TransformNode("prop-" + d.id, scene);
      node.position.set(d.x, d.y, d.z);
      node.rotation.y = d.yaw;
      const v: Vis = { def: d, node, ready: true, alarm: false };
      const part = (m: Mesh, color: string | ReturnType<typeof toon>, outline = 0.02) => {
        m.parent = node; m.material = typeof color === "string" ? toon(scene, color) : color; if (outline) ink(m, outline); m.isPickable = false; return m;
      };
      if (d.kind === "dumpster") {
        v.lid = part(MeshBuilder.CreateBox("lid", { width: 2.3, height: 0.1, depth: 1.3 }, scene), "#2f5c3b", 0.03);
        v.lid.setPivotPoint(new Vector3(0, 0, -0.65)); // hinge at the back
        v.lid.position.set(0, 1.35, 0);
      } else if (d.kind === "phone") {
        v.handset = part(MeshBuilder.CreateBox("handset", { width: 0.1, height: 0.35, depth: 0.1 }, scene), "#1b1420", 0.01);
        v.handset.position.set(0.28, 1.45, -0.3);
      } else if (d.kind === "vending") {
        v.glass = part(MeshBuilder.CreateBox("vendglass", { width: 0.75, height: 1.2, depth: 0.04 }, scene), this.vendGlass, 0.01);
        v.glass.position.set(0.12, 1.05, 0.46);
      } else if (d.kind === "car") {
        v.glass = part(buildCarGlass(scene)[0], "#6fb6d9", 0.01);
        v.lights = [];
        for (const sx of [-0.62, 0.62]) for (const sz of [2.14, -2.14]) {
          const l = MeshBuilder.CreateBox("hazard", { width: 0.36, height: 0.2, depth: 0.04 }, scene);
          l.parent = node; l.position.set(sx, 0.72, sz); l.material = this.alarmOff; l.isPickable = false; l.setEnabled(false);
          v.lights.push(l);
        }
      } else if (d.kind === "till") {
        const l = MeshBuilder.CreateSphere("tillalarm", { diameter: 0.3, segments: 8 }, scene);
        l.parent = node; l.position.set(0, 2.9, 0); l.material = this.alarmMat; l.isPickable = false; l.setEnabled(false);
        v.lights = [l];
      } else if (d.kind === "steamer" || d.kind === "trinkets" || d.kind === "fishtank") {
        // C5b: Chinatown's street stalls (local x = along the counter, z = toward the street)
        const bx = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.02) => { const m = MeshBuilder.CreateBox("st", { width: w, height: h, depth: dd }, scene); m.position.set(x, y, z); return part(m, col, o); };
        const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, o = 0.015) => { const m = MeshBuilder.CreateCylinder("st", { diameter: dia, height: h, tessellation: 12 }, scene); m.position.set(x, y, z); return part(m, col, o); };
        if (d.kind === "fishtank") {
          bx(1.4, 0.55, 0.8, 0, 0.28, 0, "#3a3444");
          const glass = MeshBuilder.CreateBox("tankGlass", { width: 1.36, height: 0.75, depth: 0.76 }, scene); glass.position.y = 0.93; glass.parent = node; glass.isPickable = false;
          const gm = new StandardMaterial("tankGlassMat", scene); gm.diffuseColor = Color3.FromHexString("#4fa8d8"); gm.emissiveColor = Color3.FromHexString("#123a55"); gm.alpha = 0.45; glass.material = gm; v.glass = glass;
          for (let i = 0; i < 3; i++) { const cr = MeshBuilder.CreateSphere("crab", { diameter: 0.18, segments: 5 }, scene); cr.scaling.y = 0.5; cr.position.set(-0.4 + i * 0.4, 0.66, (i % 2 ? 0.15 : -0.15)); part(cr, "#e0502c", 0.01); }
          for (let i = 0; i < 2; i++) { const fish = MeshBuilder.CreateSphere("fish", { diameter: 0.22, segments: 5 }, scene); fish.scaling.set(1.8, 0.7, 0.5); fish.position.set(-0.2 + i * 0.5, 1.0 + i * 0.12, 0); part(fish, "#8fb0c8", 0.01); }
          bx(1.5, 0.05, 0.86, 0, 1.32, 0, "#3a3444", 0.01);
          const sg = MeshBuilder.CreatePlane("tankSign", { width: 1.2, height: 0.3 }, scene); sg.position.set(0, 1.55, 0.3); sg.rotation.y = Math.PI; sg.parent = node; sg.isPickable = false;
          sg.material = unlitTextured(scene, textTexture(scene, "LIVE SEAFOOD", { w: 512, h: 128, bg: "#1b1420", fg: "#6fe0ff" }), "tankSign");
        } else {
          // a red cart with a striped awning; bamboo steamer stacks, or a souvenir display
          bx(1.6, 0.9, 0.9, 0, 0.45, 0, "#c0282a");
          bx(1.7, 0.06, 1.0, 0, 0.93, 0, "#8a5a3a", 0.01);
          for (const sx of [-0.7, 0.7]) cyl(0.3, 0.1, sx, 0.08, 0.4, "#1b1420", 0.01).rotation.x = Math.PI / 2;
          for (const sx of [-0.78, 0.78]) bx(0.05, 1.3, 0.05, sx, 1.6, -0.35, "#8a5a3a", 0);
          for (let i = 0; i < 6; i++) { const aw = bx(0.28, 0.04, 1.1, -0.7 + i * 0.28, 2.25, 0.05, i % 2 ? "#f4f1ea" : "#c0282a", 0); aw.rotation.x = 0.25; }
          if (d.kind === "steamer") {
            for (const [x, n] of [[-0.45, 3], [0.1, 2], [0.55, 4]] as const) for (let k = 0; k < n; k++) cyl(0.42, 0.14, x, 1.03 + k * 0.15, -0.05, k === n - 1 ? "#c9a56b" : "#b08a55", 0.01);
            // steam puffs
            for (let i = 0; i < 3; i++) { const puff = MeshBuilder.CreateSphere("steam", { diameter: 0.22 + i * 0.08, segments: 5 }, scene); puff.position.set(-0.45 + i * 0.05, 1.6 + i * 0.22, -0.05); puff.parent = node; puff.isPickable = false; const pm = new StandardMaterial("steam", scene); pm.disableLighting = true; pm.emissiveColor = Color3.White(); pm.alpha = 0.35; puff.material = pm; }
          } else {
            for (let i = 0; i < 4; i++) { const cat = bx(0.16, 0.2, 0.14, -0.6 + i * 0.4, 1.06, -0.1, i % 2 ? "#f4f1ea" : "#ffd54a", 0.01); cat.rotation.y = 0.2; bx(0.05, 0.12, 0.05, -0.53 + i * 0.4, 1.2, -0.1, "#f4f1ea", 0); }
            for (let i = 0; i < 3; i++) { const fan = MeshBuilder.CreateCylinder("fan", { diameter: 0.5, height: 0.02, tessellation: 12, arc: 0.5 }, scene); fan.rotation.x = Math.PI / 2; fan.position.set(-0.5 + i * 0.5, 1.55, -0.38); part(fan, ["#c0282a", "#3f7f4f", "#ffb000"][i], 0.01); }
          }
          const sg = MeshBuilder.CreatePlane("stallSign", { width: 1.4, height: 0.32 }, scene); sg.position.set(0, 2.05, 0.55); sg.rotation.y = Math.PI; sg.parent = node; sg.isPickable = false;
          sg.material = unlitTextured(scene, textTexture(scene, d.kind === "steamer" ? "HOT DUMPLINGS" : "LUCKY SOUVENIRS", { w: 512, h: 120, bg: "#ffd54a", fg: "#8e1f2e" }), "stallSign");
        }
      } else if (d.kind === "dummy") {
        // C5a: a stuffed sack dummy on a spring post, with a painted face and a "PUNCH ME" sign
        const box = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.02, par: TransformNode = node) => { const m = MeshBuilder.CreateBox("dm", { width: w, height: h, depth: dd }, scene); m.position.set(x, y, z); part(m, col, o); m.parent = par; return m; };
        box(0.7, 0.12, 0.7, 0, 0.06, 0, "#3a3444");
        const spring = MeshBuilder.CreateCylinder("spring", { diameter: 0.14, height: 0.5, tessellation: 8 }, scene); spring.position.y = 0.37; part(spring, "#c9ccd4", 0.01);
        const body = new TransformNode("dummyBody", scene); body.parent = node; body.position.y = 0.6;
        const sack = MeshBuilder.CreateCylinder("sack", { diameterTop: 0.5, diameterBottom: 0.6, height: 0.95, tessellation: 12 }, scene); sack.position.y = 0.48; part(sack, "#c9a56b", 0.03); sack.parent = body;
        const head = MeshBuilder.CreateSphere("dhead", { diameter: 0.46, segments: 8 }, scene); head.position.y = 1.15; part(head, "#d8b37a", 0.03); head.parent = body;
        for (const sx of [-0.09, 0.09]) { box(0.07, 0.07, 0.02, sx, 1.2, 0.22, "#1b1420", 0, body); }
        box(0.18, 0.03, 0.02, 0, 1.05, 0.225, "#8e1f2e", 0, body);
        box(0.62, 0.1, 0.62, 0, 0.05, 0, "#8e1f2e", 0.01, body); // (a belt)
        for (const sx of [-1, 1]) { const arm = MeshBuilder.CreateCylinder("darm", { diameter: 0.14, height: 0.55, tessellation: 8 }, scene); arm.rotation.z = sx * 1.2; arm.position.set(sx * 0.42, 0.72, 0); part(arm, "#c9a56b", 0.02); arm.parent = body; }
        const sg = MeshBuilder.CreatePlane("punchme", { width: 0.9, height: 0.3 }, scene);
        sg.position.set(0, 0.35, 0.39); sg.rotation.y = Math.PI; sg.parent = node; sg.isPickable = false;
        sg.material = unlitTextured(scene, textTexture(scene, "PUNCH ME", { w: 256, h: 84, bg: "#ffe14a", fg: "#1b1420" }), "punchme");
        v.body = body; v.wobble = 0;
      } else if (d.kind === "throwgame") {
        // C5a: THROW-O-MATIC: a battered arcade cabinet made of a fridge, with a big red button
        const cab = MeshBuilder.CreateBox("tcab", { width: 0.9, height: 1.6, depth: 0.9 }, scene); cab.position.y = 0.8; part(cab, "#ff8fa3", 0.04);
        const scr = MeshBuilder.CreateBox("tscr", { width: 0.7, height: 0.45, depth: 0.04 }, scene); scr.position.set(0, 1.2, 0.46); part(scr, "#1b1420", 0.01);
        const btn = MeshBuilder.CreateCylinder("tbtn", { diameter: 0.22, height: 0.08, tessellation: 12 }, scene); btn.rotation.x = Math.PI / 2; btn.position.set(0, 0.8, 0.48); part(btn, "#d8342c", 0.01);
        const top = MeshBuilder.CreatePlane("ttop", { width: 1.3, height: 0.36 }, scene); top.position.set(0, 1.82, 0.46); top.rotation.y = Math.PI; top.parent = node; top.isPickable = false;
        top.material = unlitTextured(scene, textTexture(scene, "THROW-O-MATIC", { w: 512, h: 140, bg: "#1b1420", fg: "#ffe14a" }), "ttop");
        const hint = MeshBuilder.CreatePlane("thint", { width: 0.66, height: 0.4 }, scene); hint.position.set(0, 1.2, 0.485); hint.rotation.y = Math.PI; hint.parent = node; hint.isPickable = false;
        hint.material = unlitTextured(scene, textTexture(scene, "E: 30s", { w: 256, h: 150, bg: "#0e2a40", fg: "#b6ff3c" }), "thint");
      } else if (d.kind === "racegame") {
        // C5a: the TROLLEY GRAND PRIX starter's post: a pole, a chequered flag, a hand-painted sign
        const pole = MeshBuilder.CreateCylinder("rpole", { diameter: 0.1, height: 2.8, tessellation: 8 }, scene); pole.position.y = 1.4; part(pole, "#c9ccd4", 0.01);
        const flagTex = new DynamicTexture("chequer", { width: 64, height: 64 }, scene, true);
        const c = flagTex.getContext() as unknown as CanvasRenderingContext2D;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? "#1b1420" : "#f4f1ea"; c.fillRect(i * 16, j * 16, 16, 16); }
        flagTex.update();
        const flag = MeshBuilder.CreatePlane("rflag", { width: 0.9, height: 0.6 }, scene); flag.position.set(0.5, 2.45, 0); flag.parent = node; flag.isPickable = false;
        const fm = unlitTextured(scene, flagTex, "rflag"); fm.backFaceCulling = false; flag.material = fm;
        const sg = MeshBuilder.CreatePlane("rsign", { width: 1.5, height: 0.5 }, scene); sg.position.set(0, 1.3, 0.07); sg.rotation.y = Math.PI; sg.parent = node; sg.isPickable = false;
        const sm = unlitTextured(scene, textTexture(scene, "TROLLEY GRAND PRIX", { w: 512, h: 170, bg: "#ffe14a", fg: "#8e1f2e" }), "rsign"); sm.backFaceCulling = false; sg.material = sm;
      } else if (d.kind === "vaultdoor" || d.kind === "depositbox" || d.kind === "nose" || d.kind === "stash") {
        this.buildC5c(d, v, node, part);
      } else {
        continue; // bins, meters, newsboxes: nothing changes visibly (they just go empty)
      }
      this.map.set(d.id, v);
    }
  }

  private glintMat: StandardMaterial | null = null;
  private depositMat: StandardMaterial | null = null;
  /** C5c: the bank's vault door, deposit boxes, the Mayor's gold nose, loose-brick stashes */
  private buildC5c(d: PropDef, v: Vis, node: TransformNode, part: (m: Mesh, color: string | ReturnType<typeof toon>, outline?: number) => Mesh) {
    const sc = this.scene, MB = MeshBuilder;
    const bx = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.02, par: TransformNode = node) => { const m = MB.CreateBox("c5", { width: w, height: h, depth: dd }, sc); m.position.set(x, y, z); part(m, col, o); m.parent = par; return m; };
    const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, o = 0.02, par: TransformNode = node, t = 20) => { const m = MB.CreateCylinder("c5c", { diameter: dia, height: h, tessellation: t }, sc); m.position.set(x, y, z); part(m, col, o); m.parent = par; return m; };
    const steel = "#8e8a9a", dark = "#3a3444", gold = "#e8b83a";
    if (d.kind === "vaultdoor") {
      // a great round steel door (faces -z: the corridor behind the counter), hinged on its west side, with a
      // spoked wheel and a ring of bolts; a thick frame round the doorway
      const face = -1;
      const frame = MB.CreateTorus("vaultFrame", { diameter: 2.75, thickness: 0.3, tessellation: 28 }, sc); frame.rotation.x = Math.PI / 2; frame.position.set(0, 1.4, face * 0.3); part(frame, dark, 0.03);
      const hinge = new TransformNode("vaultHinge", sc); hinge.parent = node; hinge.position.set(-1.1, 0, face * 0.42);
      const door = new TransformNode("vaultDoor", sc); door.parent = hinge; door.position.set(1.1, 0, 0);
      const slab = cyl(2.45, 0.42, 0, 1.4, 0, steel, 0.03, door, 32); slab.rotation.x = Math.PI / 2;
      const rim = MB.CreateTorus("vaultRim", { diameter: 2.3, thickness: 0.12, tessellation: 28 }, sc); rim.rotation.x = Math.PI / 2; rim.position.set(0, 1.4, face * 0.22); part(rim, "#b8b4c8", 0.01); rim.parent = door;
      const bolts: Mesh[] = [];
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, b = MB.CreateCylinder("bolt", { diameter: 0.14, height: 0.08, tessellation: 8 }, sc); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 0.95, 1.4 + Math.sin(a) * 0.95, face * 0.23); bolts.push(b); }
      const bm = Mesh.MergeMeshes(bolts, true); if (bm) { part(bm, "#c9ccd4", 0.01); bm.parent = door; }
      const hub = cyl(0.36, 0.2, 0, 1.4, face * 0.3, gold, 0.02, door, 16); hub.rotation.x = Math.PI / 2;
      const wheel = new TransformNode("vaultWheel", sc); wheel.parent = door; wheel.position.set(0, 1.4, face * 0.38);
      const wr = MB.CreateTorus("wheelRim", { diameter: 1.1, thickness: 0.07, tessellation: 24 }, sc); wr.rotation.x = Math.PI / 2; part(wr, gold, 0.01); wr.parent = wheel;
      const spokes: Mesh[] = [];
      for (let i = 0; i < 3; i++) { const sp = MB.CreateBox("spoke", { width: 1.1, height: 0.07, depth: 0.07 }, sc); sp.rotation.z = i * Math.PI / 3; spokes.push(sp); }
      const smm = Mesh.MergeMeshes(spokes, true); if (smm) { part(smm, gold, 0.01); smm.parent = wheel; }
      bx(0.5, 0.35, 0.08, 0.72, 2.25, face * 0.26, dark, 0.01, door); // (the keycard reader)
      const led = MB.CreateBox("vaultLed", { width: 0.12, height: 0.08, depth: 0.03 }, sc); led.parent = door; led.position.set(0.72, 2.25, face * 0.31); led.isPickable = false;
      const lm = new StandardMaterial("vaultLed", sc); lm.disableLighting = true; lm.emissiveColor = Color3.FromHexString("#ff3b30"); led.material = lm;
      // hazard stripes on the floor in front
      for (const odd of [0, 1]) { const ss: Mesh[] = []; for (let i = odd; i < 6; i += 2) { const st = MB.CreateBox("stripe", { width: 0.3, height: 0.02, depth: 0.9 }, sc); st.position.set(-1.1 + i * 0.44, -d.y + 0.21, face * 1.0); st.rotation.y = 0.5; ss.push(st); } const sm = Mesh.MergeMeshes(ss, true); if (sm) { part(sm, odd ? "#1b1420" : "#ffd54a", 0); } }
      v.door = hinge; v.body = wheel; v.open = 0; v.lights = [led];
    } else if (d.kind === "depositbox") {
      // a wall of little brass-handled boxes; one springs open once it's been rifled
      bx(1.3, 1.7, 0.34, 0, 0, -0.2, steel, 0.02);
      const grid = MB.CreatePlane("dbGrid", { width: 1.24, height: 1.64 }, sc); grid.parent = node; grid.position.set(0, 0, 0.0); grid.rotation.y = Math.PI; grid.isPickable = false;
      grid.material = this.depositMat ??= (() => { // (one drawn sheet of little doors instead of 22 meshes: it's a lot of boxes in view)
        const t = new DynamicTexture("dbGridTex", { width: 124, height: 164 }, sc, true), c = t.getContext() as unknown as CanvasRenderingContext2D;
        c.fillStyle = "#3a3444"; c.fillRect(0, 0, 124, 164);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) {
          const x = 5 + k * 40, y = 6 + r * 40;
          if (r === 2 && k === 1) continue; // (the one that opens is a real little door)
          c.fillStyle = "#a9a5b6"; c.fillRect(x, y, 34, 32); c.fillStyle = "#c9c5d6"; c.fillRect(x, y, 34, 4);
          c.fillStyle = "#e8b83a"; c.fillRect(x + 12, y + 14, 10, 4); c.fillStyle = "#1b1420"; c.fillRect(x + 26, y + 4, 4, 4);
        }
        t.update(); return unlitTextured(sc, t, "dbGrid");
      })();
      const hinge = new TransformNode("dbHinge", sc); hinge.parent = node; hinge.position.set(-0.18, -0.2, -0.02);
      bx(0.36, 0.34, 0.03, 0.18, 0, 0, "#c9c5d6", 0.005, hinge); bx(0.1, 0.04, 0.04, 0.18, 0, 0.03, gold, 0, hinge);
      v.door = hinge; v.open = 0;
    } else if (d.kind === "nose") {
      // the Mayor's golden nose (points along local +z); a sad stump once it's been prised off
      const nose = MB.CreateSphere("goldNose", { diameter: 0.34, segments: 10 }, sc); nose.scaling.set(0.85, 0.8, 1.5); nose.position.z = 0.12; part(nose, "#ffd54a", 0.015);
      const stump = MB.CreateSphere("noseStump", { diameter: 0.2, segments: 8 }, sc); stump.scaling.z = 0.4; stump.position.z = 0.0; part(stump, "#8a6a1a", 0.01);
      v.glass = nose; v.glint = this.glint(node, 0, 0.12, 0.3);
    } else {
      // a stash: a loose brick (or tile) sitting a little proud, with a gold glint; pulled out once found
      const brick = bx(0.42, 0.2, 0.08, 0, 0, 0.03, d.y > 1 ? "#d8d0c4" : "#b5653b", 0.015);
      bx(0.44, 0.02, 0.1, 0, -0.11, 0.03, "#1b1420", 0);
      v.glass = brick; v.glint = this.glint(node, 0.12, 0.05, 0.12);
    }
  }
  /** C5c: a little twinkling star (on the nose, the stashes) */
  private glint(node: TransformNode, x: number, y: number, z: number): Mesh {
    const m = MeshBuilder.CreatePlane("glint", { size: 0.35 }, this.scene);
    m.parent = node; m.position.set(x, y, z); m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false;
    m.material = this.glintMat ??= (() => {
      const t = new DynamicTexture("glintTex", { width: 64, height: 64 }, this.scene, true);
      const c = t.getContext() as unknown as CanvasRenderingContext2D;
      c.clearRect(0, 0, 64, 64); c.fillStyle = "#fff6c0";
      c.beginPath(); c.moveTo(32, 0); c.quadraticCurveTo(36, 28, 64, 32); c.quadraticCurveTo(36, 36, 32, 64); c.quadraticCurveTo(28, 36, 0, 32); c.quadraticCurveTo(28, 28, 32, 0); c.fill();
      t.hasAlpha = true; t.update();
      const mm = unlitTextured(this.scene, t, "glintMat"); mm.alphaMode = 1; return mm;
    })();
    return m;
  }
  /** C5c: sparks off the drill at the vault door */
  sparks(x: number, z: number) {
    const mat = this.sparkMat ??= (() => { const m = new StandardMaterial("spark", this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString("#ffd54a"); return m; })();
    for (let i = 0; i < 10; i++) {
      const m = MeshBuilder.CreateBox("spark", { size: 0.05 }, this.scene); m.material = mat; m.isPickable = false;
      m.position.set(x + (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.4, z);
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      this.debris.push({ m, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: -Math.abs(Math.sin(a)) * sp, t: 0.7, spin: 20 });
    }
  }
  private sparkMat: StandardMaterial | null = null;

  /** C5a: the practice dummy got hit */
  wobble(id: string) { const v = this.map.get(id); if (v && v.body) v.wobble = 1; }

  /** C4a: a breakable changed state. Returns true if it just broke (a hydrant starts spraying). */
  syncBreakable(id: string, ready: boolean): boolean {
    const d = this.brkDefs.get(id);
    if (!d || this.brkReady.get(id) === ready) return false;
    this.brkReady.set(id, ready);
    if (!ready && d.kind === "hydrant") this.spray(d.x, d.z);
    return !ready;
  }

  /** C4a: chunks flying out of something that just broke (or a few chips from a hit that didn't). */
  burst(kind: string, x: number, z: number, broke: boolean) {
    const COLORS: Record<string, string[]> = {
      shopglass: ["#bfe8ff", "#9fe3ff", "#e8f7ff"], busstop: ["#bfe8ff", "#3d6fb5"], hydrant: ["#d6264a", "#8a1f2e"], mailbox: ["#3d6fb5", "#f4f1ea"],
      bench: ["#8b5a2b", "#6b4a2b"], planter: ["#b5653b", "#4f8a3a", "#6b4a2b"], table: ["#8b5a2b", "#f4f1ea"], pallet: ["#a8743f", "#8b5a2b"],
    };
    const cols = COLORS[kind] ?? ["#8e8a94"];
    const glass = kind === "shopglass" || kind === "busstop";
    const n = broke ? (glass ? 14 : 8) : 3;
    for (let i = 0; i < n; i++) {
      const sz = glass ? 0.12 + Math.random() * 0.2 : 0.15 + Math.random() * 0.25;
      const m = MeshBuilder.CreateBox("chunk", { width: sz, height: glass ? 0.03 : sz * 0.6, depth: sz }, this.scene);
      m.material = toon(this.scene, cols[i % cols.length]); m.isPickable = false;
      if (!glass) ink(m, 0.01);
      m.position.set(x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * (glass ? 2 : 0.8), z + (Math.random() - 0.5) * 0.6);
      const a = Math.random() * Math.PI * 2, sp = broke ? 2 + Math.random() * 3 : 1.2;
      this.debris.push({ m, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, t: broke ? 10 : 2, spin: (Math.random() - 0.5) * 12 });
    }
    while (this.debris.length > 140) this.debris.shift()!.m.dispose();
  }

  private spray(x: number, z: number) {
    const node = new TransformNode("hydrantSpray", this.scene);
    node.position.set(x, 0, z);
    const jetMat = new StandardMaterial("jet", this.scene);
    jetMat.diffuseColor = Color3.FromHexString("#bfe8ff"); jetMat.emissiveColor = Color3.FromHexString("#4f8fb0"); jetMat.alpha = 0.55;
    const jet = MeshBuilder.CreateCylinder("jet", { diameterTop: 1.2, diameterBottom: 0.3, height: 3.2, tessellation: 10 }, this.scene);
    jet.parent = node; jet.position.y = 1.8; jet.material = jetMat; jet.isPickable = false;
    const drops: Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const d = MeshBuilder.CreateSphere("drop", { diameter: 0.15, segments: 3 }, this.scene);
      d.parent = node; d.material = jetMat; d.isPickable = false; drops.push(d);
    }
    this.sprays.push({ node, t: 20, drops });
  }

  sync(id: string, pv: PropView) {
    const v = this.map.get(id);
    if (!v) return;
    if (pv.ready !== v.ready) {
      v.ready = pv.ready;
      if (v.lid) v.lid.rotation.x = v.ready ? 0 : -1.9; // flipped open after a search
      if (v.handset) v.handset.setEnabled(v.ready);
      if (v.glass && v.def.kind === "vending") v.glass.material = v.ready ? this.vendGlass : this.crackedMat;
      if (v.glass && (v.def.kind === "car" || v.def.kind === "fishtank")) v.glass.setEnabled(v.ready); // smashed (C5b: the seafood tank too)
      if (v.glass && (v.def.kind === "nose" || v.def.kind === "stash")) v.glass.setEnabled(v.ready); // (C5c: taken)
      if (v.glint) v.glint.setEnabled(v.ready);
      if (v.def.kind === "vaultdoor" && v.lights) (v.lights[0].material as StandardMaterial).emissiveColor = Color3.FromHexString(v.ready ? "#ff3b30" : "#6fff8a");
    }
    if (pv.alarm !== v.alarm) {
      v.alarm = pv.alarm;
      for (const l of v.lights ?? []) l.setEnabled(pv.alarm);
    }
  }

  update(dt: number) {
    this.t += dt;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t -= dt;
      if (d.t <= 0) { d.m.dispose(); this.debris.splice(i, 1); continue; }
      if (d.m.position.y > 0.05 || d.vy > 0) {
        d.vy -= 18 * dt;
        d.m.position.x += d.vx * dt; d.m.position.y = Math.max(0.05, d.m.position.y + d.vy * dt); d.m.position.z += d.vz * dt;
        d.m.rotation.x += d.spin * dt; d.m.rotation.z += d.spin * 0.7 * dt;
        if (d.m.position.y <= 0.05) { d.vy = 0; d.vx *= 0.3; d.vz *= 0.3; }
      }
      if (d.t < 1) d.m.scaling.setAll(Math.max(0.01, d.t));
    }
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const s = this.sprays[i];
      s.t -= dt;
      if (s.t <= 0) { s.node.dispose(false, true); this.sprays.splice(i, 1); continue; }
      s.drops.forEach((d, k) => { const ph = (this.t * 1.6 + k / s.drops.length) % 1, a = k * 2.4; d.position.set(Math.cos(a) * ph * 1.3, 3.4 * ph * (1.6 - ph) * 1.6, Math.sin(a) * ph * 1.3); });
      s.node.scaling.y = s.t < 2 ? s.t / 2 : 1;
    }
    for (const v of this.map.values()) { // (C5a: the practice dummy springs back)
      if (!v.body || !v.wobble) continue;
      v.wobble = Math.max(0, v.wobble - dt * 1.4);
      v.body.rotation.x = Math.sin(this.t * 13) * v.wobble * 0.5;
      v.body.rotation.z = Math.cos(this.t * 11) * v.wobble * 0.3;
    }
    for (const v of this.map.values()) { // (C5c: the vault door swings, a deposit box pops open, glints twinkle)
      if (v.door) {
        const want = v.ready ? 0 : 1, sp = v.def.kind === "vaultdoor" ? 0.35 : 2.5;
        if (v.open !== want) {
          v.open = want > v.open! ? Math.min(want, v.open! + dt * sp) : Math.max(want, v.open! - dt * sp);
          const k = v.open! * v.open! * (3 - 2 * v.open!);
          v.door.rotation.y = v.def.kind === "vaultdoor" ? -k * 1.55 : -k * 1.9; // (the vault door swings in, clear of the counter)
          if (v.body) v.body.rotation.z = k * 6;
        }
      }
      if (v.glint && v.ready) { const k = Math.max(0, Math.sin(this.t * 2.6 + v.def.x * 1.7)); v.glint.scaling.setAll(0.15 + k * k * k * 1.2); }
    }
    const on = Math.sin(this.t * 14) > 0;
    for (const v of this.map.values()) {
      if (!v.alarm || !v.lights) continue;
      for (const l of v.lights) l.material = on ? this.alarmMat : this.alarmOff;
    }
  }

  /** Where the prop is (for sounds / prompts). */
  def(id: string) { return this.map.get(id)?.def ?? this.brkDefs.get(id); }

  dispose() { for (const v of this.map.values()) v.node.dispose(false, true); this.map.clear(); }
}
