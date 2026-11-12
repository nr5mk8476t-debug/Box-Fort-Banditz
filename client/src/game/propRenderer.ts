// The parts of props that change: dumpster lids (open once searched), phone-booth handsets
// (gone when smashed), vending machine glass (cracked), parked car windows (smashed) and
// flashing alarm lights on cars and shop tills. Static bodies are merged into the city.
import { Scene, MeshBuilder, Mesh, StandardMaterial, CellMaterial, VertexBuffer, Color3, TransformNode, Vector3, DynamicTexture } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured } from "./look.ts";
import { buildCarGlass } from "./carModel.ts";
import { buildLootModel } from "./models.ts";
import { PLAYER_COLORS, nearBoxes, type PropDef, type PropView, type TagView, type ArenaLayout } from "@bfb/shared";

/** C4b: the graffiti styles a tag can be (the World picks one per tag) */
const TAG_WORDS = ["BANDITZ", "BOX 4 LIFE", "TRASH KING", "CRUNCH!", "WAS HERE", "HI MOM"];
const WALL_ART = ["NO FUN ALLOWED", "EAT MORE CEREAL", "RAT GANG", "VOTE NOBODY", "PIGEONS R SPIES", "OK", "SKATE OR DIE(T)", "FREE THE SPORK"];

interface Vis { def: PropDef; node: TransformNode; ready: boolean; alarm: boolean; lid?: Mesh; handset?: Mesh; glass?: Mesh; lights?: Mesh[];
  /** C5a: the practice dummy's swinging body, how hard it's wobbling */
  body?: TransformNode; wobble?: number;
  /** C5c: the vault door (swings open), a deposit box's little door, the stash's glint, the hacked screen */
  door?: TransformNode; open?: number; glint?: Mesh;
  /** C5c.3: the pawn case: what's on show inside it (rebuilt when its contents change) */
  note?: string; items?: TransformNode;
  /** R8: a glass door's leaves (hinged at their outer edges) */
  leaves?: { hinge: TransformNode; dir: number }[];
 }

export class PropRenderer {
  private map = new Map<string, Vis>();
  private doorGlass: StandardMaterial | null = null;
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
    this.paintTag(c, word, color, seed);
    tex.hasAlpha = true; tex.update();
    m = this.tagMaterial(tex);
    this.tagMats.set(key, m);
    return m;
  }
  private tagMaterial(tex: DynamicTexture): StandardMaterial {
    const m = new StandardMaterial("tagMat", this.scene);
    m.diffuseTexture = tex; m.emissiveTexture = tex; m.disableLighting = true; m.useAlphaFromDiffuseTexture = true; m.backFaceCulling = false;
    m.zOffset = -3; m.zOffsetUnits = -6;
    return m;
  }
  /** a tag's paint, in a 256 x 128 cell whose top-left corner is the canvas origin */
  private paintTag(c: CanvasRenderingContext2D, word: string, color: string, seed: number) {
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
    // R12.7: the background graffiti is ONE mesh with one texture (every word-and-colour painted into a grid of cells): it
    // was a mesh and a texture for each (40-odd draw calls in a street view). Players' own tags stay separate (they come and go)
    const CW = 256, CH = 128, NX = 8, NY = 8;
    const atlas = new DynamicTexture("tagAtlas", { width: CW * NX, height: CH * NY }, this.scene, true), ac = atlas.getContext() as unknown as CanvasRenderingContext2D;
    ac.clearRect(0, 0, CW * NX, CH * NY);
    const cells = new Map<string, number>(), planes: Mesh[] = [];
    const art = (x: number, y: number, z: number, nx: number, nz: number, w: number, word: string, color: string, seed: number, out = 0.26) => {
      const key = word + color; let cell = cells.get(key);
      if (cell === undefined) { if (cells.size >= NX * NY) return; cell = cells.size; cells.set(key, cell); ac.save(); ac.translate((cell % NX) * CW, Math.floor(cell / NX) * CH); ac.beginPath(); ac.rect(0, 0, CW, CH); ac.clip(); this.paintTag(ac, word, color, seed); ac.restore(); }
      const p = MeshBuilder.CreatePlane("tag", { width: w, height: w / 2 }, this.scene);
      p.position.set(x + nx * out, y, z + nz * out); p.rotation.y = Math.atan2(-nx, -nz);
      const uv = p.getVerticesData(VertexBuffer.UVKind)!, cx = cell % NX, cy = Math.floor(cell / NX);
      for (let i = 0; i < uv.length; i += 2) { uv[i] = (cx + uv[i]) / NX; uv[i + 1] = 1 - (cy + 1 - uv[i + 1]) / NY; }
      p.setVerticesData(VertexBuffer.UVKind, uv);
      planes.push(p);
    };
    arena.boxes.forEach((b, i) => {
      if (b.art) { // (C4b: THE PIT's walls: covered both sides)
        const along = b.w > b.d ? [1, 0] : [0, 1], len = Math.max(b.w, b.d), k = Math.max(1, Math.floor(len / 3.2));
        for (const s of [-1, 1]) for (let j = 0; j < k; j++) {
          const off = (j - (k - 1) / 2) * (len / k), nx = along[1] * s, nz = along[0] * s;
          art(b.x + along[0] * off + nx * b.w / 2, 1.2, b.z + along[1] * off + nz * b.d / 2, nx, nz, Math.min(4, len / k - 0.3), WALL_ART[(i + j * 3 + s + 7) % WALL_ART.length], cols[(i + j + s + 2) % cols.length], i * 7 + j * 3 + s, 0.03);
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
      art(x, 1.6, z, nx, nz, Math.min(3, len - 1), WALL_ART[i % WALL_ART.length], cols[i % cols.length], i);
      n++;
    });
    atlas.hasAlpha = true; atlas.update();
    const all = planes.length > 1 ? Mesh.MergeMeshes(planes, true, true) : planes[0];
    if (all) { all.name = "tagArt"; all.material = this.tagMaterial(atlas); all.isPickable = false; all.alphaIndex = 3; }
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
      if (d.box !== undefined && d.kind !== "vaultdoor") { this.brkDefs.set(d.id, d); this.brkReady.set(d.id, true); if (d.kind !== "door" && d.kind !== "celldoor") continue; } // (C4a: drawn in the city, hidden when smashed; R8: doors drawn here)
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
      } else if (d.kind === "pizzacart" || d.kind === "gelato" || d.kind === "ricordi" || d.kind === "deli") {
        // R4: Little Italy's street stalls (local x = along the counter, z = toward the street)
        const bx = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.02) => { const m = MeshBuilder.CreateBox("it", { width: w, height: h, depth: dd }, scene); m.position.set(x, y, z); return part(m, col, o); };
        const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, o = 0.015, top?: number) => { const m = MeshBuilder.CreateCylinder("it", { diameterBottom: dia, diameterTop: top ?? dia, height: h, tessellation: 14 }, scene); m.position.set(x, y, z); return part(m, col, o); };
        const sign = (text: string, bg: string, fg: string, y = 2.05, z = 0.55) => { const sg = MeshBuilder.CreatePlane("itSign", { width: 1.4, height: 0.32 }, scene); sg.position.set(0, y, z); sg.rotation.y = Math.PI; sg.parent = node; sg.isPickable = false; sg.material = unlitTextured(scene, textTexture(scene, text, { w: 512, h: 120, bg, fg }), "itSign"); };
        const tricolour = (y: number, depth = 1.1, w = 1.68) => { const cols = ["#2f8f4e", "#f4f1ea", "#c8322c"]; for (let i = 0; i < 6; i++) { const aw = bx(w / 6, 0.04, depth, -w / 2 + w / 12 + i * w / 6, y, 0.05, cols[i % 3], 0); aw.rotation.x = 0.25; } bx(w, 0.12, 0.04, 0, y - 0.18, 0.62, "#c8322c", 0); };
        if (d.kind === "deli") {
          // a glass deli counter: cheese wheels, salamis, a ham hanging over it
          bx(1.4, 0.55, 0.8, 0, 0.28, 0, "#5a3a2a");
          bx(1.42, 0.06, 0.82, 0, 0.58, 0, "#e8e2d4", 0.01);
          const glass = MeshBuilder.CreateBox("deliGlass", { width: 1.36, height: 0.6, depth: 0.76 }, scene); glass.position.y = 0.92; glass.parent = node; glass.isPickable = false;
          const gm = new StandardMaterial("deliGlassMat", scene); gm.diffuseColor = Color3.FromHexString("#cfeeff"); gm.emissiveColor = Color3.FromHexString("#2a4a5a"); gm.alpha = 0.32; glass.material = gm; v.glass = glass;
          for (let i = 0; i < 3; i++) cyl(0.32, 0.14, -0.42 + i * 0.42, 0.7, 0.12, "#f2c94c", 0.01);
          for (let i = 0; i < 3; i++) { const sal = MeshBuilder.CreateCapsule("salami", { radius: 0.06, height: 0.42 }, scene); sal.rotation.z = Math.PI / 2; sal.position.set(-0.4 + i * 0.4, 0.72, -0.18); part(sal, "#8e2a2a", 0.008); }
          bx(1.5, 0.05, 0.86, 0, 1.24, 0, "#5a3a2a", 0.01);
          for (const sx of [-0.6, 0.6]) bx(0.05, 0.8, 0.05, sx, 1.65, -0.35, "#3a3444", 0);
          bx(1.3, 0.04, 0.04, 0, 2.05, -0.35, "#3a3444", 0);
          for (const hx of [-0.35, 0.3]) { const ham = MeshBuilder.CreateSphere("ham", { diameter: 0.28, segments: 6 }, scene); ham.scaling.set(0.8, 1.4, 0.8); ham.position.set(hx, 1.75, -0.35); part(ham, "#b5653b", 0.01); }
          sign("SALAMI & SONS", "#2f8f4e", "#f4f1ea", 2.3, 0.2);
        } else {
          // a cart: bright paint, a striped green-white-red awning on posts, chunky wheels
          const body = d.kind === "pizzacart" ? "#2f8f4e" : d.kind === "gelato" ? "#f7d7e0" : "#f3e2b8";
          bx(1.6, 0.9, 0.9, 0, 0.45, 0, body);
          bx(1.7, 0.06, 1.0, 0, 0.93, 0, "#8a5a3a", 0.01);
          for (const sx of [-0.7, 0.7]) cyl(0.32, 0.1, sx, 0.08, 0.4, "#1b1420", 0.01).rotation.x = Math.PI / 2;
          for (const sx of [-0.78, 0.78]) bx(0.05, 1.3, 0.05, sx, 1.6, -0.35, "#8a5a3a", 0);
          tricolour(2.25);
          if (d.kind === "pizzacart") {
            // a little brick oven with a glowing mouth, pizzas on the counter
            const dome = MeshBuilder.CreateSphere("oven", { diameter: 0.7, segments: 10, slice: 0.5 }, scene); dome.position.set(-0.35, 0.96, -0.1); part(dome, "#b5653b", 0.02);
            const mouth = bx(0.26, 0.16, 0.05, -0.35, 1.04, 0.24, "#ff9a2e", 0); void mouth;
            cyl(0.1, 0.5, -0.35, 1.45, -0.15, "#5a4636", 0.01);
            for (const [x, z] of [[0.3, 0.05], [0.55, -0.15]] as const) { cyl(0.42, 0.04, x, 0.98, z, "#f2c94c", 0.008); for (let k = 0; k < 4; k++) cyl(0.07, 0.02, x - 0.1 + (k % 2) * 0.2, 1.01, z - 0.08 + Math.floor(k / 2) * 0.16, "#c8322c", 0); }
            sign("HOT PIZZA", "#c8322c", "#f4f1ea");
          } else if (d.kind === "gelato") {
            // tubs of gelato in pastel colours under a glass lid, cones in a rack
            const tubs = ["#ffd1dc", "#c9f2c7", "#fff3b0", "#7a4a2a", "#c7e3ff", "#f4f1ea"];
            for (let i = 0; i < 6; i++) { cyl(0.2, 0.08, -0.55 + (i % 3) * 0.32, 1.0, -0.15 + Math.floor(i / 3) * 0.28, tubs[i], 0.006); const sc2 = MeshBuilder.CreateSphere("scoop", { diameter: 0.17, segments: 6 }, scene); sc2.scaling.y = 0.6; sc2.position.set(-0.55 + (i % 3) * 0.32, 1.06, -0.15 + Math.floor(i / 3) * 0.28); part(sc2, tubs[i], 0.006); }
            for (let i = 0; i < 4; i++) cyl(0.08, 0.2, 0.45 + (i % 2) * 0.14, 1.05, -0.1 + Math.floor(i / 2) * 0.18, "#d8a05a", 0.005, 0.01);
            sign("GELATO!", "#ffd1dc", "#2f8f4e");
          } else {
            // souvenirs: little gondolas, leaning towers, flags and postcards
            for (let i = 0; i < 3; i++) { const g = MeshBuilder.CreateBox("gondola", { width: 0.4, height: 0.06, depth: 0.1 }, scene); g.position.set(-0.55 + i * 0.4, 1.0, 0.15); g.rotation.z = 0.15; part(g, "#1b1420", 0.006); }
            for (let i = 0; i < 3; i++) { const t = cyl(0.12, 0.34, -0.5 + i * 0.45, 1.13, -0.18, "#f4f1ea", 0.008); t.rotation.z = 0.12; }
            for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) bx(0.08, 0.16, 0.01, -0.45 + i * 0.45 + (c - 1) * 0.08, 1.55, -0.38, ["#2f8f4e", "#f4f1ea", "#c8322c"][c], 0);
            sign("SOUVENIRS (GENUINE-ISH)", "#f3e2b8", "#2f8f4e");
          }
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
      } else if (d.kind === "podium" || d.kind === "cloakroom" || d.kind === "dessertcart" || d.kind === "piano" || d.kind === "chefstable" || d.kind === "kitchen") {
        this.buildRestoProp(d, v, node, part);
      } else if (d.kind === "clubrope" || d.kind === "clubsafe" || d.kind === "pawncounter" || d.kind === "pawncase") {
        this.buildC5c3(d, v, node, part);
      } else if (d.kind === "toilet") {
        // R6: the holding cell's steel toilet (the flush handle on the tank)
        const steel = "#c8ccd4";
        const base = MeshBuilder.CreateCylinder("tbase", { diameterTop: 0.36, diameterBottom: 0.28, height: 0.3, tessellation: 12 }, scene); base.position.y = -0.3; part(base, steel, 0.012);
        const bowl = MeshBuilder.CreateCylinder("tbowl", { diameterTop: 0.5, diameterBottom: 0.36, height: 0.18, tessellation: 14 }, scene); bowl.scaling.z = 1.25; bowl.position.set(0, -0.06, 0.05); part(bowl, steel, 0.012);
        const water = MeshBuilder.CreateCylinder("twater", { diameter: 0.38, height: 0.01, tessellation: 12 }, scene); water.scaling.z = 1.25; water.position.set(0, 0.02, 0.05); part(water, "#7fb4c8", 0);
        const tank = MeshBuilder.CreateBox("ttank", { width: 0.5, height: 0.45, depth: 0.2 }, scene); tank.position.set(0, 0.2, -0.27); part(tank, steel, 0.012);
        const handle = MeshBuilder.CreateBox("thandle", { width: 0.14, height: 0.03, depth: 0.04 }, scene); handle.position.set(-0.2, 0.36, -0.15); part(handle, "#8e96a8", 0.006);
      } else if (d.kind === "door") {
        // R8: a glass door: one leaf (a pawn shop's) or two (the station's), hinged at the outer edges, swinging out
        const turned = Math.abs(Math.sin(d.yaw)) > 0.5, W = 2 * ((turned ? d.hd : d.hw) ?? 0.9), H = d.door === "wood" ? 2.35 : 2.6; // (R12.9: the snug's doorway is lower)
        const n = W > 2.2 ? 2 : 1, lw = W / n;
        const glassMat = this.doorGlass ?? (() => { const m = new StandardMaterial("doorGlass", scene); m.diffuseColor = Color3.FromHexString("#bfe8ff"); m.emissiveColor = Color3.FromHexString("#2a5a70"); m.alpha = 0.3; m.backFaceCulling = false; return (this.doorGlass = m); })();
        v.leaves = [];
        for (let i = 0; i < n; i++) {
          const side = n === 2 ? (i ? 1 : -1) : -1; // (hinge on this side)
          const hinge = new TransformNode("doorHinge", scene); hinge.parent = node; hinge.position.set(side * W / 2, -1.3 + H / 2 + 0.02, 0); // (R11.4: on whatever floor it's on)
          const cxl = -side * lw / 2;
          // R11.4: a painted panel door (the club's restroom wing) or the green steel fire EXIT, instead of glass
          const panel = d.door === "exit" ? toon(scene, "#2f8f4e") : d.door === "solid" ? toon(scene, "#3a2440") : d.door === "wood" ? toon(scene, "#4a2010") : glassMat;
          const pane = MeshBuilder.CreateBox("doorPane", { width: lw - 0.12, height: H - 0.14, depth: d.door ? 0.06 : 0.04 }, scene); pane.parent = hinge; pane.position.set(cxl, 0, 0); pane.material = panel; pane.isPickable = false;
          if (d.door === "solid") { for (const y2 of [0.55, -0.45]) { const inset = MeshBuilder.CreateBox("doorInset", { width: lw - 0.4, height: 0.75, depth: 0.075 }, scene); inset.parent = hinge; inset.position.set(cxl, y2, 0); inset.material = toon(scene, "#4a2e54"); inset.isPickable = false; } const knob = MeshBuilder.CreateSphere("doorKnob", { diameter: 0.08, segments: 6 }, scene); knob.parent = hinge; knob.position.set(-side * (lw - 0.15), -0.15, 0.06); knob.material = toon(scene, "#c9a227"); knob.isPickable = false; const k2 = knob.clone("doorKnob2"); k2.position.z = -0.06; }
          if (d.door === "wood") { // (R12.9: Seamus's snug: a mahogany door, four sunk panels, a brass knob each side)
            for (const [y2, hp] of [[0.5, 0.75], [-0.42, 0.85]] as const) for (const x2 of [-0.2, 0.2]) for (const zz of [-0.034, 0.034]) { const inset = MeshBuilder.CreateBox("doorInsetW", { width: (lw - 0.5) / 2, height: hp, depth: 0.01 }, scene); inset.parent = hinge; inset.position.set(cxl + x2 * (lw - 0.3) / 0.8, y2, zz); inset.material = toon(scene, "#2e1208"); inset.isPickable = false; }
            for (const zz of [-0.06, 0.06]) { const knob = MeshBuilder.CreateSphere("doorKnob", { diameter: 0.08, segments: 6 }, scene); knob.parent = hinge; knob.position.set(-side * (lw - 0.12), -0.15, zz); knob.material = toon(scene, "#d9a632"); knob.isPickable = false; }
          }
          if (d.door === "exit") { const kick = MeshBuilder.CreateBox("doorKick", { width: lw - 0.14, height: 0.25, depth: 0.07 }, scene); kick.parent = hinge; kick.position.set(cxl, -H / 2 + 0.2, 0); kick.material = toon(scene, "#9aa0a8"); kick.isPickable = false; }
          for (const [w2, h2, x2, y2] of [[lw, 0.08, cxl, H / 2 - 0.04], [lw, 0.12, cxl, -H / 2 + 0.06], [0.07, H, -side * 0.035, 0], [0.07, H, -side * (lw - 0.035), 0]] as [number, number, number, number][]) {
            const f = MeshBuilder.CreateBox("doorFrame", { width: w2, height: h2, depth: 0.07 }, scene); f.parent = hinge; f.position.set(x2, y2, 0); f.material = toon(scene, "#3a3444"); f.isPickable = false;
          }
          if (d.door !== "solid" && d.door !== "wood") {
            // (R11.4: the EXIT's push bar is on the inside only: the outside's bare steel)
            const inZ = d.oneWay ? -(Math.cos(d.yaw) * d.oneWay[1] + Math.sin(d.yaw) * d.oneWay[0]) * 0.07 : 0.06;
            const bar = MeshBuilder.CreateBox("doorBar", { width: lw * (d.door === "exit" ? 0.8 : 0.55), height: 0.06, depth: 0.06 }, scene); bar.parent = hinge; bar.position.set(-side * lw * (d.door === "exit" ? 0.5 : 0.55), 0.05, inZ); bar.material = toon(scene, "#c9ccd4"); bar.isPickable = false;
            if (!d.oneWay) { const bar2 = bar.clone("doorBar2"); bar2.position.z = -0.06; }
          }
          v.leaves.push({ hinge, dir: side });
        }
        v.open = 0;
      } else if (d.kind === "dealgoods") {
        // R11.4: SKETCHY STEVE's goods, each in its own glowing cartoon packaging (made up, obviously)
        const glow = (col: string) => toon(scene, col);
        if (d.sell === "zoomies") {
          const bag = part(MeshBuilder.CreateBox("zoomBag", { width: 0.16, height: 0.2, depth: 0.05 }, scene), glow("#7dff5a"), 0.008); bag.position.y = 0.1;
          for (let i = 0; i < 3; i++) { const g = part(MeshBuilder.CreateSphere("gummy", { diameter: 0.045, segments: 4 }, scene), glow(["#ff3cd2", "#ffd54a", "#3df0ff"][i]), 0); g.position.set(-0.05 + i * 0.05, 0.03, 0.06); }
          const bolt = part(MeshBuilder.CreateBox("zoomBolt", { width: 0.04, height: 0.1, depth: 0.01 }, scene), "#1b1420", 0); bolt.position.set(0, 0.12, -0.03); bolt.rotation.z = 0.5;
        } else if (d.sell === "beef") {
          const can = part(MeshBuilder.CreateCylinder("beefCan", { diameter: 0.09, height: 0.17, tessellation: 12 }, scene), glow("#ff4a3a"), 0.008); can.position.y = 0.085;
          const lid = part(MeshBuilder.CreateCylinder("beefLid", { diameter: 0.085, height: 0.01, tessellation: 12 }, scene), "#c8ccd4", 0); lid.position.y = 0.175;
          const band = part(MeshBuilder.CreateCylinder("beefBand", { diameter: 0.093, height: 0.04, tessellation: 12 }, scene), "#ffd54a", 0); band.position.y = 0.09;
        } else {
          const bottle = part(MeshBuilder.CreateCylinder("floatyBottle", { diameter: 0.07, diameterTop: 0.03, height: 0.2, tessellation: 10 }, scene), glow("#5ae0ff"), 0.008); bottle.position.y = 0.1;
          const string = part(MeshBuilder.CreateCylinder("floatyString", { diameter: 0.005, height: 0.3, tessellation: 3 }, scene), "#f4f1ea", 0); string.position.y = 0.35;
          const balloon = part(MeshBuilder.CreateSphere("floatyBalloon", { diameter: 0.14, segments: 8 }, scene), glow("#ff8fd0"), 0.008); balloon.position.y = 0.55; balloon.scaling.y = 1.15;

        }
      } else if (d.kind === "mickgoods") {
        // R12.6: WEE MICKEY's gear on his keg: a leather roll of lockpicks (picks poking out), a cartoon smoke bomb with a
        // fuse. (R12.6b: two pieces each, no ink: nine little meshes with outlines cost ~13 draw calls even from
        // inside the pub; and they're hidden unless you're out in the yard (see setVisible))
        if (d.gear === "pick") {
          const roll = part(MeshBuilder.CreateCylinder("mickRoll", { diameter: 0.075, height: 0.2, tessellation: 10 }, scene), "#7a4a24", 0); roll.rotation.z = Math.PI / 2; roll.position.y = 0.04;
          const tools = MeshBuilder.CreateBox("mickPickTool", { width: 0.08, height: 0.03, depth: 0.025 }, scene); part(tools, "#c8ccd4", 0); tools.position.set(0.13, 0.045, 0);
        } else {
          const bomb = part(MeshBuilder.CreateSphere("mickBomb", { diameter: 0.12, segments: 8 }, scene), "#2a2a30", 0); bomb.position.y = 0.06;
          const fuse = part(MeshBuilder.CreateCylinder("mickFuse", { diameter: 0.012, height: 0.08, tessellation: 4 }, scene), "#d8c08a", 0); fuse.position.set(0.01, 0.15, 0); fuse.rotation.z = -0.4;
        }
      } else if (d.kind === "celldoor") {
        // R6: the cell door is part of the bars (drawn with the city); just its big padlock here
        const lock = MeshBuilder.CreateBox("padlock", { width: 0.22, height: 0.26, depth: 0.12 }, scene); lock.position.set(0, -0.05, 0); part(lock, "#d9a632", 0.012);
        const shackle = MeshBuilder.CreateTorus("shackle", { diameter: 0.16, thickness: 0.03, tessellation: 10 }, scene); shackle.position.set(0, 0.12, 0); shackle.rotation.x = Math.PI / 2; part(shackle, "#c8ccd4", 0.006);
      } else {
        continue; // bins, meters, newsboxes: nothing changes visibly (they just go empty)
      }
      this.bakeStatic(v);
      this.map.set(d.id, v);
    }
  }

  /**
   * R12.7: a prop's plain-coloured parts that never move or change (everything hung straight off its node that isn't
   * its lid, handset, glass, glint or lamps) become one mesh per outline width, colours baked into the vertices. A
   * street stall was 20-30 draw calls; now 2-3. Looks the same.
   */
  private bakeStatic(v: Vis) {
    const keep = new Set<unknown>([v.lid, v.handset, v.glass, v.glint, ...(v.lights ?? [])]);
    const groups = new Map<number, Mesh[]>();
    for (const m of v.node.getChildMeshes(true)) {
      if (!(m instanceof Mesh) || keep.has(m) || !(m.material instanceof CellMaterial) || m.material === this.vendGlass || m.material === this.crackedMat) continue;
      if (m.getTotalVertices() === 0 || !m.isEnabled(false) || m.visibility !== 1 || m.getChildren().length || m.billboardMode || m.instances?.length) continue;
      const o = m.renderOutline ? m.outlineWidth : 0;
      (groups.get(o) ?? groups.set(o, []).get(o)!).push(m);
    }
    let n = 0; for (const g of groups.values()) n += g.length;
    if (n < 2) return;
    // (merged in the node's own space: the node is put at the origin for the merge, then back)
    const node = v.node, pos = node.position.clone(), rot = node.rotation.clone(), par = node.parent;
    node.parent = null; node.position.set(0, 0, 0); node.rotation.set(0, 0, 0); node.computeWorldMatrix(true);
    for (const [o, parts] of groups) {
      if (parts.length < 2) continue;
      for (const m of parts) {
        m.computeWorldMatrix(true);
        const c = (m.material as CellMaterial).diffuseColor, k = m.getTotalVertices(), cols = new Float32Array(k * 4);
        for (let i = 0; i < k; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1; }
        m.setVerticesData(VertexBuffer.ColorKind, cols);
      }
      const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
      if (!merged) continue;
      merged.name = "propStatic"; merged.parent = node; merged.material = toon(this.scene, "#ffffff", "vc"); merged.useVertexColors = true; merged.isPickable = false;
      if (o > 0) ink(merged, o);
    }
    node.position.copyFrom(pos); node.rotation.copyFrom(rot); node.parent = par;
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
  /** C5c.3: Big Crunch's rope stand, the club's safe (its door swings open when it's cracked), Sal's bell, the pawn case's glass */
  private buildC5c3(d: PropDef, v: Vis, node: TransformNode, part: (m: Mesh, color: string | ReturnType<typeof toon>, outline?: number) => Mesh) {
    const sc = this.scene, MB = MeshBuilder;
    const bx = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.01, par: TransformNode = node) => { const m = MB.CreateBox("c53", { width: w, height: h, depth: dd }, sc); m.position.set(x, y, z); part(m, col, o); m.parent = par; return m; };
    const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, o = 0.01, par: TransformNode = node, t = 12) => { const m = MB.CreateCylinder("c53c", { diameter: dia, height: h, tessellation: t }, sc); m.position.set(x, y, z); part(m, col, o); m.parent = par; return m; };
    if (d.kind === "clubrope") {
      // a little lectern with the stamp pad and the guest list nobody's on, and a COVER sign facing the street
      bx(0.6, 1.0, 0.45, 0, -0.5, 0, "#1b1420", 0.02);
      bx(0.7, 0.05, 0.55, 0, 0.02, 0, "#e8b83a", 0.01);
      bx(0.16, 0.04, 0.12, -0.15, 0.06, 0, "#c41e3a", 0);
      bx(0.3, 0.02, 0.22, 0.12, 0.05, 0, "#f4f1ea", 0);
      const sg = MB.CreatePlane("coverSign", { width: 0.9, height: 0.55 }, sc); sg.parent = node; sg.position.set(0, 0.45, 0.24); sg.rotation.y = Math.PI; sg.isPickable = false;
      const sm = unlitTextured(sc, textTexture(sc, "COVER $15", { w: 256, h: 150, bg: "#ff3cac", fg: "#1b1420" }), "coverSign"); sm.backFaceCulling = false; sg.material = sm;
      cyl(0.04, 0.5, 0.35, 0.2, 0.2, "#3a3444", 0, node, 4);
    } else if (d.kind === "clubsafe") {
      // a squat green safe against the wall (faces local +z): a door with a dial and a handle, swung open once cracked
      bx(0.9, 1.0, 0.8, 0, -0.05, -0.47, "#3a5a4a", 0.02);
      const hinge = new TransformNode("safeHinge", sc); hinge.parent = node; hinge.position.set(-0.42, -0.05, -0.05);
      bx(0.8, 0.85, 0.08, 0.4, 0, 0, "#4a6a5a", 0.015, hinge);
      const dial = cyl(0.24, 0.05, 0.4, 0.15, 0.05, "#c9ccd4", 0.01, hinge, 16); dial.rotation.x = Math.PI / 2;
      bx(0.05, 0.2, 0.05, 0.65, -0.1, 0.06, "#e8b83a", 0, hinge);
      bx(0.35, 0.12, 0.01, 0.4, -0.3, 0.045, "#f4f1ea", 0, hinge);
      v.door = hinge; v.open = 0;
      const lamp = MB.CreateSphere("safeAlarm", { diameter: 0.14, segments: 6 }, sc); lamp.parent = node; lamp.position.set(0, 0.6, -0.5); lamp.material = this.alarmOff; lamp.isPickable = false; lamp.setEnabled(false);
      v.lights = [lamp];
    } else if (d.kind === "pawncounter") {
      // Sal's brass bell (ring for service)
      cyl(0.16, 0.02, 0, 0.01, 0, "#3a3444", 0, node, 12);
      const dome = MB.CreateSphere("bell", { diameter: 0.16, segments: 8, slice: 0.5 }, sc); dome.position.y = 0.02; part(dome, "#e8b83a", 0.01);
      cyl(0.02, 0.05, 0, 0.11, 0, "#e8b83a", 0, node, 4);
    } else if (d.kind === "pawncase") {
      // a glass lid over the case (it goes when the case is smashed); what's inside comes from the case's note
      const g = MB.CreateBox("caseGlass", { width: 3.3, height: 0.45, depth: 0.9 }, sc); g.position.y = 0.23; g.parent = node; g.isPickable = false;
      const gm = new StandardMaterial("caseGlass", sc); gm.diffuseColor = Color3.FromHexString("#9fe3ff"); gm.emissiveColor = Color3.FromHexString("#2a5a70"); gm.alpha = 0.25; gm.backFaceCulling = false; g.material = gm;
      v.glass = g;
      const sg = MB.CreatePlane("caseSign", { width: 1.2, height: 0.22 }, sc); sg.parent = node; sg.position.set(0, -0.3, 0.505); sg.rotation.y = Math.PI; sg.isPickable = false;
      const sm = unlitTextured(sc, textTexture(sc, "PAWNED GOODS", { w: 512, h: 94, bg: "#1b1420", fg: "#ffd54a" }), "caseSign"); sm.backFaceCulling = false; sg.material = sm;
      v.note = "";
    }
  }
  /** C5c.3: show what's in the pawn case: each thing, a tag in its owner's colour, its price */
  private fillCase(v: Vis, note: string) {
    v.items?.dispose(false, true);
    v.items = undefined;
    v.note = note;
    if (!note) return;
    let list: { t: string; c: number; p: number; s: number }[] = [];
    try { list = JSON.parse(note); } catch { return; }
    const sc = this.scene;
    const root = new TransformNode("caseItems", sc); root.parent = v.node; v.items = root;
    list.slice(0, 8).forEach((it, i) => {
      const x = -1.45 + i * 0.41;
      const mdl = buildLootModel(sc, it.t);
      mdl.root.parent = root; mdl.root.position.set(x, 0.12, -0.05); mdl.root.scaling.setAll(0.55); mdl.root.rotation.y = 0.4 + i;
      for (const m of mdl.meshes) m.isPickable = false;
      const tag = MeshBuilder.CreatePlane("caseTag", { width: 0.34, height: 0.16 }, sc); tag.parent = root; tag.position.set(x, 0.05, 0.43); tag.rotation.y = Math.PI; tag.isPickable = false;
      const col = it.s ? "#ffd54a" : PLAYER_COLORS[it.c % PLAYER_COLORS.length];
      const tm = unlitTextured(sc, textTexture(sc, (it.s ? "SALE $" : "$") + it.p, { w: 192, h: 90, bg: col, fg: "#1b1420" }), "caseTag" + i); tm.backFaceCulling = false; tag.material = tm;
    });
  }
  /** C5c.2: Le Dumpstère's props: the maître d's podium, the cloakroom's bell, the dessert trolley, the chef's table, the stove's pots */
  private buildRestoProp(d: PropDef, v: Vis, node: TransformNode, part: (m: Mesh, color: string | ReturnType<typeof toon>, outline?: number) => Mesh) {
    const sc = this.scene, MB = MeshBuilder, gold = "#e8b83a", cream = "#f4f1ea";
    const cyl = (dia: number, h: number, x: number, y: number, z: number, col: string, o = 0.01, t = 10, top?: number) => { const m = MB.CreateCylinder("rp", { diameter: dia, diameterTop: top ?? dia, height: h, tessellation: t }, sc); m.position.set(x, y, z); return part(m, col, o); };
    const bx = (w: number, h: number, dd: number, x: number, y: number, z: number, col: string, o = 0.01) => { const m = MB.CreateBox("rpb", { width: w, height: h, depth: dd }, sc); m.position.set(x, y, z); return part(m, col, o); };
    if (d.kind === "podium") {
      // a little lectern with the reservation book and a lamp
      cyl(0.5, 0.1, 0, 0.05, 0, "#1b1420", 0.01, 12); cyl(0.12, 1.0, 0, 0.55, 0, gold, 0.01, 8);
      const top = bx(0.6, 0.06, 0.45, 0, 1.1, 0, "#6b3f22", 0.02); top.rotation.x = -0.25;
      const book = bx(0.4, 0.04, 0.3, 0, 1.15, 0.02, "#6b1f2e", 0.005); book.rotation.x = -0.25;
      bx(0.36, 0.045, 0.26, 0, 1.17, 0.02, cream, 0).rotation.x = -0.25;
      const sg = MB.CreatePlane("podiumSign", { width: 0.8, height: 0.5 }, sc); sg.parent = node; sg.position.set(0, 0.6, 0.15); sg.rotation.y = Math.PI; sg.isPickable = false;
      const sm = unlitTextured(sc, textTexture(sc, "RESERVATIONS $20", { w: 256, h: 160, bg: "#1b1420", fg: "#ffd54a" }), "podiumSign"); sm.backFaceCulling = false; sg.material = sm;
    } else if (d.kind === "cloakroom") {
      const bell = MB.CreateSphere("bell", { diameter: 0.16, segments: 8, slice: 0.5 }, sc); bell.position.set(0.5, 0.0, 0.1); part(bell, gold, 0.01);
      const tag = MB.CreatePlane("cloakSign", { width: 0.7, height: 0.3 }, sc); tag.parent = node; tag.position.set(-0.4, 0.18, 0.36); tag.rotation.set(-0.4, Math.PI, 0); tag.isPickable = false;
      tag.material = unlitTextured(sc, textTexture(sc, "CLOAKROOM", { w: 256, h: 110, bg: cream, fg: "#6b1f2e" }), "cloakSign");
      for (let i = 0; i < 5; i++) bx(0.35, 0.8, 0.12, -0.9 + i * 0.4, 0.3, -0.5, ["#6b1f2e", "#3d6fb5", "#c9a56b", "#2f7a4f", "#1b1420"][i], 0.01);
      v.glass = cyl(0.25, 0.02, -0.6, 0.01, 0.0, gold, 0, 10); // (the tip dish: gone once it's been raided)
    } else if (d.kind === "dessertcart") {
      // a brass trolley with two shelves of cakes under a glass dome
      bx(1.0, 0.04, 0.6, 0, 0, 0, gold, 0.01); bx(1.0, 0.04, 0.6, 0, -0.45, 0, gold, 0.01);
      for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) cyl(0.04, 0.9, x, -0.45, z, gold, 0, 5);
      for (const s of [-1, 1]) { const w = cyl(0.14, 0.03, s * 0.5, -0.8, 0.28, "#1b1420", 0, 10); w.rotation.z = Math.PI / 2; }
      const cakes = new TransformNode("cakes", sc); cakes.parent = node;
      const cake = MB.CreateCylinder("cake", { diameter: 0.4, height: 0.2, tessellation: 14 }, sc); cake.position.set(-0.2, 0.12, 0); cake.material = toon(sc, "#ffd6e6"); ink(cake, 0.01); cake.parent = cakes; cake.isPickable = false;
      const cherry = MB.CreateSphere("cherry", { diameter: 0.07, segments: 5 }, sc); cherry.position.set(-0.2, 0.25, 0); cherry.material = toon(sc, "#d8261e"); cherry.parent = cakes; cherry.isPickable = false;
      ["#ff8fa3", "#b6ff3c", "#ffd54a", "#9fd4f0", "#ff8fa3"].forEach((c, i) => { const m = MB.CreateCylinder("mac", { diameter: 0.08, height: 0.05, tessellation: 10 }, sc); m.position.set(0.18 + (i % 3) * 0.1, 0.04 + Math.floor(i / 3) * 0.05, -0.05 + (i % 2) * 0.1); m.material = toon(sc, c); m.parent = cakes; m.isPickable = false; });
      const dome = MB.CreateSphere("dome", { diameter: 0.5, segments: 10, slice: 0.5 }, sc); dome.position.set(-0.2, 0.02, 0); const dm = new StandardMaterial("dome", sc); dm.diffuseColor = Color3.FromHexString("#e8f7ff"); dm.alpha = 0.3; dome.material = dm; dome.parent = cakes; dome.isPickable = false;
      v.door = cakes;
    } else if (d.kind === "piano") {
      // (the piano's body is in the city; here just the music on its stand)
      const sheet = MB.CreatePlane("sheet", { width: 0.45, height: 0.3 }, sc); sheet.parent = node; sheet.position.set(0, 0.2, 0.35); sheet.rotation.set(-0.2, Math.PI, 0); sheet.isPickable = false;
      const mm = unlitTextured(sc, textTexture(sc, "CHOPSTICKS", { w: 256, h: 170, bg: cream, fg: "#1b1420" }), "sheetMusic"); mm.backFaceCulling = false; sheet.material = mm;
      bx(0.5, 0.25, 0.03, 0, 0.12, 0.38, "#1b1420", 0.005).rotation.x = -0.2;
    } else if (d.kind === "chefstable") {
      const plates = new TransformNode("chefPlates", sc); plates.parent = node;
      for (const s of [-1, 1]) { const pl = MB.CreateCylinder("plate", { diameter: 0.34, height: 0.03, tessellation: 14 }, sc); pl.position.set(s * 0.45, 0.02, 0); pl.material = toon(sc, "#ffffff"); ink(pl, 0.005); pl.parent = plates; pl.isPickable = false; const food = MB.CreateSphere("food", { diameter: 0.12, segments: 6 }, sc); food.scaling.y = 0.5; food.position.set(s * 0.45, 0.06, 0); food.material = toon(sc, s < 0 ? "#c98a5a" : "#7fbf4f"); food.parent = plates; food.isPickable = false; }
      const bt = MB.CreateCylinder("fizz", { diameter: 0.12, diameterTop: 0.04, height: 0.4, tessellation: 8 }, sc); bt.position.set(0, 0.2, 0.1); bt.material = toon(sc, "#2f7a4f"); ink(bt, 0.01); bt.parent = plates; bt.isPickable = false;
      const dome = MB.CreateSphere("cloche", { diameter: 0.36, segments: 10, slice: 0.5 }, sc); dome.position.set(0, 0.02, -0.2); dome.material = toon(sc, "#c9ccd4"); ink(dome, 0.01); dome.parent = plates; dome.isPickable = false;
      v.door = plates;
    } else {
      // the stove: a big pot of soup and a frying pan
      const pots = new TransformNode("pots", sc); pots.parent = node;
      const pot = MB.CreateCylinder("pot", { diameter: 0.5, height: 0.4, tessellation: 14 }, sc); pot.position.set(-0.5, 0.2, 0); pot.material = toon(sc, "#8e8a94"); ink(pot, 0.01); pot.parent = pots; pot.isPickable = false;
      const soup = MB.CreateCylinder("soup", { diameter: 0.44, height: 0.02, tessellation: 14 }, sc); soup.position.set(-0.5, 0.39, 0); soup.material = toon(sc, "#e0502c"); soup.parent = pots; soup.isPickable = false;
      const pan = MB.CreateCylinder("pan", { diameter: 0.4, height: 0.05, tessellation: 12 }, sc); pan.position.set(0.5, 0.04, 0); pan.material = toon(sc, "#3a3444"); ink(pan, 0.01); pan.parent = pots; pan.isPickable = false;
      v.door = pots;
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
      if (v.glass && (v.def.kind === "car" || v.def.kind === "fishtank" || v.def.kind === "deli")) v.glass.setEnabled(v.ready); // smashed (C5b: the seafood tank too)
      if (v.glass && (v.def.kind === "nose" || v.def.kind === "stash")) v.glass.setEnabled(v.ready); // (C5c: taken)
      if (v.glint) v.glint.setEnabled(v.ready);
      if (v.door && (v.def.kind === "dessertcart" || v.def.kind === "chefstable" || v.def.kind === "kitchen")) v.door.setEnabled(v.ready); // (C5c.2: raided)
      if (v.glass && v.def.kind === "cloakroom") v.glass.setEnabled(v.ready);
      if (v.glass && v.def.kind === "pawncase") v.glass.setEnabled(v.ready); // (C5c.3: smashed)
      if (v.def.kind === "celldoor") for (const m of v.node.getChildMeshes()) m.setEnabled(v.ready); // (R8: the key: the door's gone, so's its padlock)
      if (v.def.kind === "vaultdoor" && v.lights) (v.lights[0].material as StandardMaterial).emissiveColor = Color3.FromHexString(v.ready ? "#ff3b30" : "#6fff8a");
    }
    if (v.def.kind === "pawncase" && (pv.note ?? "") !== v.note) this.fillCase(v, pv.note ?? ""); // (C5c.3)
    if (pv.alarm !== v.alarm) {
      v.alarm = pv.alarm;
      for (const l of v.lights ?? []) l.setEnabled(pv.alarm);
    }
  }

  /** R12.6b: show or hide a prop's model (things out of sight behind a wall the camera's inside) */
  setVisible(id: string, on: boolean) { const v = this.map.get(id); if (v && v.node.isEnabled() !== on) v.node.setEnabled(on); }
  update(dt: number) {
    this.t += dt;
    // R8: doors swing open / shut (open = not ready)
    for (const v of this.map.values()) {
      if (!v.leaves) continue;
      const want = v.ready ? 0 : 1, o = v.open ?? 0;
      if (Math.abs(want - o) < 0.001) continue;
      v.open = o + Math.sign(want - o) * Math.min(Math.abs(want - o), dt * 3);
      for (const l of v.leaves) l.hinge.rotation.y = -l.dir * v.open * 1.45;
    }
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
      if (v.door && (v.def.kind === "vaultdoor" || v.def.kind === "depositbox" || v.def.kind === "clubsafe")) {
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
