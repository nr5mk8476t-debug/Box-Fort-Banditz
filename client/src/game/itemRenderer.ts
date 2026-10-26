// Draws every loot item: loose items (smoothly interpolated), items carried by other
// players (attached to their avatar), your own throws (predicted instantly), rarity
// outlines and a small twinkling sparkle on rare+ loot (Phase 2.5: replaced the sky beams).
import { Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture } from "./babylon.ts";
import { buildLootModel } from "./models.ts";
import { textTexture, unlitTextured, toon, ink } from "./look.ts";
import {
  lootDef, hasSparkle, RARITY_COLOR, PLAYER_COLORS, LOCK_TIME, stepItem, type ItemView, type ItemBody, type ArenaLayout, type LootDef,
} from "@bfb/shared";

const INTERP_MS = 110;
/** Sparkles only show within this distance (they're a "look closer" hint, not a map marker). */
export const SPARKLE_DISTANCE = 25;

interface Snap { t: number; x: number; y: number; z: number; rot: number; }

interface ItemVis {
  id: string;
  def: LootDef;
  root: TransformNode;
  meshes: Mesh[];
  sparkles: Mesh[];
  snaps: Snap[];
  view: ItemView;
  /** local prediction of a throw we just made */
  ghost: { body: ItemBody; until: number } | null;
  shown: boolean;
  wobble: number;
  baseOutline: number;
  // Phase 3: banking countdown / BANKED / x2 tag, parachute
  tag: Mesh | null;
  tagKey: string;
  chute: TransformNode | null;
}

export interface AvatarAnchor { x: number; y: number; z: number; yaw: number; }

export interface ItemRenderContext {
  myId: string;
  /** items I'm holding right now (server-confirmed or optimistic), drawn in my hands instead */
  inMyHands: (id: string) => boolean;
  anchorOf: (playerId: string) => AvatarAnchor | null;
  /** camera position (sparkles fade out beyond SPARKLE_DISTANCE) */
  cam?: { x: number; y: number; z: number };
}

function rarityColor(def: LootDef): string {
  return RARITY_COLOR[def.mystery && def.rarity !== "common" ? "mystery" : def.rarity];
}

export class ItemRenderer {
  private map = new Map<string, ItemVis>();
  private sparkleMats = new Map<string, StandardMaterial>();
  private highlighted: string | null = null;
  private time = 0;

  constructor(private scene: Scene, private arena: ArenaLayout) {}

  /** A 4-point cartoon star with a soft glow, one material per rarity colour. */
  private sparkleMat(color: string): StandardMaterial {
    let m = this.sparkleMats.get(color);
    if (!m) {
      const S = 64, cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const c = cv.getContext("2d")!;
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, color + "cc"); g.addColorStop(0.35, color + "44"); g.addColorStop(1, color + "00");
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.fillStyle = "#ffffff";
      c.beginPath();
      const r = S * 0.48, w = S * 0.09;
      c.moveTo(S / 2, S / 2 - r); c.quadraticCurveTo(S / 2 + w, S / 2 - w, S / 2 + r, S / 2);
      c.quadraticCurveTo(S / 2 + w, S / 2 + w, S / 2, S / 2 + r); c.quadraticCurveTo(S / 2 - w, S / 2 + w, S / 2 - r, S / 2);
      c.quadraticCurveTo(S / 2 - w, S / 2 - w, S / 2, S / 2 - r); c.fill();
      // DynamicTexture mipmaps come out empty on some GPUs, so load the canvas as an image texture
      const tex = new Texture(cv.toDataURL(), this.scene, false, true);
      tex.hasAlpha = true;
      m = new StandardMaterial("sparkle" + color, this.scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.opacityTexture = tex;
      m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false;
      m.useAlphaFromDiffuseTexture = true;
      this.sparkleMats.set(color, m);
    }
    return m;
  }

  private create(id: string, v: ItemView): ItemVis {
    const def = lootDef(v.type);
    const color = rarityColor(def);
    const outline = def.rarity === "common" && !def.mystery ? undefined : Color3.FromHexString(color);
    const { root, meshes } = buildLootModel(this.scene, v.type, outline);
    const baseOutline = def.rarity === "common" ? 0.022 : 0.03;
    for (const m of meshes) if (m.renderOutline) m.outlineWidth = Math.max(m.outlineWidth, baseOutline);
    const sparkles: Mesh[] = [];
    if (hasSparkle(def)) {
      // more sparkles for better loot: rare 1, epic 2, legendary 3
      const n = def.rarity === "legendary" ? 3 : def.rarity === "epic" ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const sp = MeshBuilder.CreatePlane("sparkle", { size: 1 }, this.scene);
        sp.billboardMode = Mesh.BILLBOARDMODE_ALL;
        sp.material = this.sparkleMat(color);
        sp.isPickable = false;
        sparkles.push(sp);
      }
    }
    return { id, def, root, meshes, sparkles, snaps: [], view: { ...v }, ghost: null, shown: true, wobble: 0, baseOutline, tag: null, tagKey: "", chute: null };
  }

  sync(id: string, v: ItemView, now: number) {
    let it = this.map.get(id);
    if (!it) { it = this.create(id, v); this.map.set(id, it); }
    // Copy only what we need (the view object may be reused by the network layer)
    it.view.type = v.type; it.view.value = v.value; it.view.mode = v.mode;
    it.view.holder = v.holder; it.view.holder2 = v.holder2; it.view.resting = v.resting;
    it.view.x = v.x; it.view.y = v.y; it.view.z = v.z; it.view.rot = v.rot;
    it.view.lock = v.lock ?? 0; it.view.fort = v.fort ?? -1; it.view.mult = v.mult ?? 1; it.view.chute = !!v.chute;
    const last = it.snaps[it.snaps.length - 1];
    if (!last || last.x !== v.x || last.y !== v.y || last.z !== v.z || last.rot !== v.rot || now - last.t > 200) {
      it.snaps.push({ t: now, x: v.x, y: v.y, z: v.z, rot: v.rot });
      if (it.snaps.length > 20) it.snaps.splice(0, it.snaps.length - 20);
    }
  }

  retain(ids: Set<string>) {
    for (const [id, it] of this.map) {
      if (!ids.has(id)) {
        it.root.dispose(false, true);
        for (const sp of it.sparkles) sp.dispose();
        it.tag?.dispose(); it.chute?.dispose(false, true);
        this.map.delete(id);
      }
    }
  }

  /** Start drawing a throw immediately (before the server confirms it). */
  predictThrow(id: string, body: ItemBody, now: number) {
    const it = this.map.get(id);
    if (!it) return;
    it.ghost = { body: { ...body }, until: now + 450 };
  }

  highlight(id: string | null) {
    if (id === this.highlighted) return;
    const old = this.highlighted ? this.map.get(this.highlighted) : undefined;
    if (old) for (const m of old.meshes) if (m.renderOutline) m.outlineWidth = old.baseOutline;
    this.highlighted = id;
    const it = id ? this.map.get(id) : undefined;
    if (it) for (const m of it.meshes) if (m.renderOutline) m.outlineWidth = it.baseOutline * 1.35;
  }

  get(id: string) { return this.map.get(id); }
  entries() { return this.map.values(); }

  /** World position we are currently drawing an item at. */
  drawnPos(id: string): { x: number; y: number; z: number } | null {
    const it = this.map.get(id);
    if (!it || !it.shown) return null;
    return { x: it.root.position.x, y: it.root.position.y, z: it.root.position.z };
  }

  update(now: number, dt: number, ctx: ItemRenderContext) {
    this.time += dt;
    const renderT = now - INTERP_MS;
    for (const it of this.map.values()) {
      const v = it.view;
      let show = true;
      if (v.mode === "pocket") show = false;
      else if (it.def.size !== "giant" && ctx.inMyHands(it.id)) show = false;

      if (show && v.mode === "held" && it.def.size !== "giant") {
        // carried by another player: sits in front of their chest
        const a = ctx.anchorOf(v.holder);
        if (a) {
          const small = it.def.size === "small";
          it.root.position.set(a.x + Math.sin(a.yaw) * (small ? 0.45 : 0.62) + (small ? Math.cos(a.yaw) * 0.25 : 0), a.y + (small ? 1.0 : 1.05), a.z + Math.cos(a.yaw) * (small ? 0.45 : 0.62) - (small ? Math.sin(a.yaw) * 0.25 : 0));
          it.root.rotation.set(0, a.yaw, 0);
        } else {
          it.root.position.set(v.x, v.y, v.z);
        }
      } else if (show && v.mode === "held" && it.def.size === "giant") {
        // giant: between the two carriers (or dragged in front of one), using drawn avatar positions
        const a = ctx.anchorOf(v.holder), b = v.holder2 ? ctx.anchorOf(v.holder2) : null;
        if (a && b) {
          it.root.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 1.0, (a.z + b.z) / 2);
          it.root.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, 0);
        } else if (a) {
          const r = it.def.radius;
          it.root.position.set(a.x + Math.sin(a.yaw) * (0.38 + r + 0.1), a.y + r, a.z + Math.cos(a.yaw) * (0.38 + r + 0.1));
          it.root.rotation.set(0, a.yaw, Math.sin(this.time * 9) * 0.04); // scraping wobble
        } else {
          this.placeFromSnaps(it, renderT);
        }
      } else if (show) {
        if (it.ghost && now < it.ghost.until) {
          stepItem(it.ghost.body, it.def.radius, it.def.bounce, this.arena, Math.min(dt, 0.05));
          it.root.position.set(it.ghost.body.x, it.ghost.body.y, it.ghost.body.z);
          it.root.rotation.set(0, it.ghost.body.rot, 0);
        } else {
          if (it.ghost) it.ghost = null;
          this.placeFromSnaps(it, renderT);
        }
        // tumbling in the air looks alive; resting loot sits still
        if (!v.resting) it.wobble += dt * 8; else it.wobble *= 0.9;
        it.root.rotation.x = Math.sin(it.wobble) * 0.25 * (v.resting ? 0 : 1);
      }
      // distance culling: loot beyond 75 m is lost in the fog anyway (big city = lots of items)
      if (show && ctx.cam && v.mode === "free") {
        const p = it.root.position;
        if (Math.abs(p.x - ctx.cam.x) > 75 || Math.abs(p.z - ctx.cam.z) > 75) show = false;
      }
      if (show !== it.shown) {
        it.shown = show;
        it.root.setEnabled(show);
      }
      if (it.sparkles.length) {
        let on = show && v.mode === "free";
        const p = it.root.position;
        if (on && ctx.cam) on = Math.hypot(p.x - ctx.cam.x, p.y - ctx.cam.y, p.z - ctx.cam.z) < SPARKLE_DISTANCE;
        const r = it.def.radius;
        for (let i = 0; i < it.sparkles.length; i++) {
          const sp = it.sparkles[i];
          if (sp.isEnabled() !== on) sp.setEnabled(on);
          if (!on) continue;
          // each star pops in, twinkles and fades on its own offset cycle around the item
          const ph = this.time * 1.6 + i * 2.1 + p.x * 0.7;
          const cyc = ph - Math.floor(ph);
          const size = Math.sin(cyc * Math.PI) ** 2 * (0.22 + r * 0.9);
          const ang = Math.floor(ph) * 2.4 + i * 1.7;
          sp.position.set(p.x + Math.cos(ang) * (r + 0.08), p.y + r * 0.6 + 0.1 + cyc * 0.18, p.z + Math.sin(ang) * (r + 0.08));
          sp.scaling.setAll(Math.max(0.001, size));
        }
      }
      this.updateTag(it, show, ctx);
      this.updateChute(it, show);
    }
  }

  private tagMats = new Map<string, StandardMaterial>();

  /** Floating tag: banking countdown ("7"), "BANKED" in the owner's colour, or "x2" during happy hour. */
  private updateTag(it: ItemVis, show: boolean, ctx: ItemRenderContext) {
    const v = it.view;
    let key = "";
    if (show && v.mode === "free") {
      if (v.lock >= 100) key = "BANKED|" + v.fort;
      else if (v.lock > 0) key = String(Math.max(1, Math.ceil(LOCK_TIME * (1 - v.lock / 100)))) + "|" + v.fort;
      else if (v.mult > 1) key = "x2|gold";
    }
    const p = it.root.position;
    if (key && ctx.cam && Math.hypot(p.x - ctx.cam.x, p.z - ctx.cam.z) > 30) key = "";
    if (key !== it.tagKey) {
      it.tagKey = key;
      it.tag?.dispose(); it.tag = null;
      if (key) {
        let mat = this.tagMats.get(key);
        if (!mat) {
          const [text, who] = key.split("|");
          const color = who === "gold" ? "#ffcf3a" : PLAYER_COLORS[Number(who) % PLAYER_COLORS.length] ?? "#ffffff";
          mat = unlitTextured(this.scene, textTexture(this.scene, text, { w: 512, h: 160, fg: text === "BANKED" || who === "gold" ? color : "#ffffff", stroke: "#1b1420" }), "tag");
          this.tagMats.set(key, mat);
        }
        const wide = key.startsWith("BANKED");
        it.tag = MeshBuilder.CreatePlane("itemTag", { width: wide ? 0.8 : 0.55, height: wide ? 0.25 : 0.32 }, this.scene);
        it.tag.material = mat;
        it.tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
        it.tag.isPickable = false;
      }
    }
    if (it.tag) it.tag.position.set(p.x, p.y + it.def.radius + 0.45 + Math.sin(this.time * 3 + p.x) * 0.04, p.z);
  }

  /** Airdrop crate parachute (shown while it floats down). */
  private updateChute(it: ItemVis, show: boolean) {
    const on = show && it.view.chute && it.view.mode === "free";
    if (on && !it.chute) {
      const c = (it.chute = new TransformNode("chute", this.scene));
      const canopy = MeshBuilder.CreateSphere("canopy", { diameter: 3.4, segments: 12, slice: 0.5 }, this.scene);
      canopy.material = toon(this.scene, "#e14b4b");
      ink(canopy, 0.05);
      canopy.parent = c; canopy.position.y = 2.6; canopy.scaling.y = 0.6; canopy.isPickable = false;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const rope = MeshBuilder.CreateCylinder("rope", { diameter: 0.03, height: 2.5 }, this.scene);
        rope.material = toon(this.scene, "#f4f1ea");
        rope.parent = c; rope.position.set(x * 0.6, 1.4, z * 0.6); rope.rotation.set(z * 0.25, 0, -x * 0.25); rope.isPickable = false;
      }
    }
    if (!on && it.chute) { it.chute.dispose(false, true); it.chute = null; }
    if (it.chute) {
      const p = it.root.position;
      it.chute.position.set(p.x, p.y, p.z);
      it.chute.rotation.set(Math.sin(this.time * 1.3) * 0.08, this.time * 0.3, Math.cos(this.time * 1.1) * 0.08);
    }
  }

  private placeFromSnaps(it: ItemVis, renderT: number) {
    const s = it.snaps;
    if (!s.length) return;
    let a = s[0], b = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= renderT) { a = s[i]; b = s[Math.min(i + 1, s.length - 1)]; break; }
    }
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    it.root.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    it.root.rotation.y = a.rot + (b.rot - a.rot) * k;
  }

  dispose() {
    for (const it of this.map.values()) { it.root.dispose(false, true); for (const sp of it.sparkles) sp.dispose(); it.tag?.dispose(); it.chute?.dispose(false, true); }
    this.map.clear();
  }
}
