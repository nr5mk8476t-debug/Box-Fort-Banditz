// The playable city, first-person. (Art is placeholder-quality; systems are real.)
// Your own movement is simulated immediately in the browser ("prediction") using the
// exact same rules as the server. When the server's answer arrives we quietly correct
// any difference ("reconciliation"), smoothing small corrections so you never feel a snap.
import {
  Scene, Engine, UniversalCamera, Camera, HemisphericLight, DirectionalLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, Mesh,
} from "./babylon.ts";
import { toon, textTexture, unlitTextured } from "./look.ts";
import { FpInput, type LootAction } from "./input.ts";
import { RemotePlayers, type RemoteInfo, type CarryKind } from "./remotePlayers.ts";
import { Viewmodel } from "./viewmodel.ts";
import { Spring } from "./spring.ts";
import { CityRenderer } from "./cityRenderer.ts";
import { ItemRenderer } from "./itemRenderer.ts";
import { NpcRenderer } from "./npcRenderer.ts";
import { EventRenderer } from "./eventRenderer.ts";
import { PropRenderer } from "./propRenderer.ts";
import { CarRenderer } from "./carRenderer.ts";
import { CopCarRenderer } from "./copCarRenderer.ts";
import { LockpickUI } from "./lockpickUI.ts";
import {
  makeMoveState, cloneMoveState, stepMovement, readMoveState, movePose, horizontalSpeed, lootDef,
  throwSpeed, throwVelocity, GRAB_RANGE_CLIENT, POCKETS, NPC_DEFS, fortAt, PLAYER_COLOR_NAMES, ROUNDS, ROB_TIME, PROP_RADIUS, USE_RANGE, SMASHABLE, SEARCHABLE, type PropDef,
  SIM_DT, PLAYER, PLAYER_COLORS, type MoveInput, type MoveState, type ArenaLayout, type MovePose,
  type WorldView, type WorldEvent, type WorldAction, type LootDef,
} from "@bfb/shared";
import { settings } from "../settings.ts";
import { sfx, chargeTone } from "../audio.ts";

export type ServerPlayerView = RemoteInfo & { lastSeq: number };

/** What the HUD needs each frame. */
export interface HudState { stamina: number; winded: boolean; dodgeReady: boolean; pose: MovePose; }

/** The item you're looking at (for the "[E] Grab" prompt). */
export interface LookTarget { id: string; def: LootDef; value: number; dist: number; note: string; }

/** What you'd punch right now (for the "[CLICK] Bonk" / "[CLICK] Smash" prompt). */
export interface PunchTarget { id: string; kind: string; name: string; fighter: boolean; prop?: boolean; empty?: boolean; }

/** A dumpster / bin (E: search) or a shop till in reach (HOLD R: rob). */
export interface UseTarget { id: string; kind: string; name: string; empty: boolean; }

const PROP_NAMES: Record<string, string> = {
  dumpster: "Dumpster", bin: "Trash Can", phone: "Phone Booth", vending: "Vending Machine", meter: "Parking Meter",
  newsbox: "Newspaper Box", car: "Parked Car", till: "the Till",
};

/** Round loop + event state for the HUD (read from the server / solo world). */
export interface MatchHud {
  phase: string; round: number; rounds: number; timeLeft: number; results: string;
  evKind: string; evStage: string; evX: number; evZ: number; evR: number; evT: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}
export interface ScoreLine { id: string; name: string; colorIdx: number; cash: number; bank: number; connected: boolean; me: boolean; }
/** Where home is, relative to where you're looking. */
export interface HomeInfo { inside: boolean; dist: number; bearing: number; }

/** Full-screen effects main.ts draws in HTML (camera flash, pigeon swarm, knocked-down vignette). */
export type ScreenFx = "flash" | "swarm" | "knocked";

/** Your inventory as displayed (server truth + instant local feedback). */
export interface Inventory { hand: string; pockets: string[]; sel: number; }

const CHARGE_TIME = 0.8; // seconds to full throw power
const PUNCH_CD_MS = 550; // matches the server's punch cooldown (the server has the final say)
const PUNCH_REACH = 2.2;
/** Gibberish voice pitch per pedestrian type. */
const NPC_VOICE: Record<string, number> = {
  tourist: 1.15, businessman: 0.8, influencer: 1.45, jogger: 1.1, gym_bro: 0.62, mall_cop: 0.75, mime: 1.0, pigeon_lady: 1.3,
};

/**
 * The camera must never tip past straight up/down: knockdowns lean the view back, shake and roll
 * add on top of the mouse pitch, and without this clamp looking up while getting knocked over
 * flipped the whole view upside down.
 */
const MAX_PITCH = Math.PI / 2 - 0.06;
const MAX_ROLL = 0.6;
const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));
export const safePitch = (p: number) => clampAbs(p, MAX_PITCH);

/** Rough place name for announcements. */
function areaName(x: number, z: number): string {
  if (Math.abs(x) < 26 && Math.abs(z) < 26) return "the Plaza";
  const ns = z > 20 ? "north" : z < -20 ? "south" : "", ew = x > 20 ? "east" : x < -20 ? "west" : "";
  const dir = ns && ew ? `${ns}-${ew}` : ns || ew;
  return Math.max(Math.abs(x), Math.abs(z)) > 74 ? `the ${dir} edge of town` : `downtown ${dir}`;
}

export class ArenaScene {
  scene: Scene;
  readonly arena: ArenaLayout;
  private camera: UniversalCamera;
  private remotes: RemotePlayers;

  // Prediction state
  private cur: MoveState;
  private prev: MoveState;
  private acc = 0;
  private seq = 0;
  private pending: MoveInput[] = [];
  private outbox: MoveInput[] = [];
  private correction = new Vector3();
  /** Stats for the debug overlay + tests */
  stats = { corrections: 0, snaps: 0, lastError: 0, pending: 0, steps: 0, moveSteps: 0, droppedMs: 0 };

  // Feel/sfx bookkeeping
  private stepDist = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private headBob = 0;
  private lastPose: MovePose = "idle";
  private wasWinded = false;
  private mantleTotal = 0;
  private viewmodel: Viewmodel;
  // camera feel
  private eye: number = PLAYER.eyeHeight;
  private fovKick = 0;
  private roll = 0;
  private camDip = new Spring(170, 20);
  private trauma = 0; // screen shake amount 0..1 (decays)
  private time = 0;
  private lie = 0;
  private voicePitch: number;

  // Loot
  private items: ItemRenderer;
  private myId = "";
  private serverInv: Inventory = { hand: "", pockets: ["", "", ""], sel: 0 };
  private optimistic: (Inventory & { until: number }) | null = null;
  private itemTypes = new Map<string, string>();
  private itemViews = new Map<string, { value: number; mode: string; holder: string; holder2: string; lock: number; fort: number; mult: number }>();

  // Phase 3: round loop
  match: MatchHud = { phase: "lobby", round: 0, rounds: ROUNDS, timeLeft: 0, results: "[]", evKind: "", evStage: "", evX: 0, evZ: 0, evR: 0, evT: 0, truckOn: false, truckX: 0, truckZ: 0, truckYaw: 0 };
  scores: ScoreLine[] = [];
  myColorIdx = 0;
  private events: EventRenderer;
  private lastTickSec = -1;
  private rumbleT = 0;
  // Phase 3.5: props, traffic, hold-ups, wipeouts
  private propsR: PropRenderer;
  private cars: CarRenderer;
  private copCars: CopCarRenderer;
  /** Phase 4 jail: the lock-picking screen (shown while you're locked up) */
  readonly lock: LockpickUI;
  jailT = 0;
  lockSeed = 0;
  lockT = 0;
  private sirenT = 0;
  private copNoticeT = 0;
  private propState = new Map<string, boolean>(); // prop id -> ready
  useTarget: UseTarget | null = null;
  /** a shop till in reach (HOLD R for a hold-up) */
  robTarget: UseTarget | null = null;
  /** seconds left before respawning after a car hit (0 = fine) */
  respawnT = 0;
  /** hold-up progress in seconds (-1 = not robbing) */
  robT = -1;
  private robHeld = false;
  private engineT = 0;
  /** Big centre-screen announcements ("ROUND 1", "GARBAGE TRUCK!"). */
  onBanner: ((title: string, sub: string, kind: "good" | "bad" | "info") => void) | null = null;
  lookTarget: LookTarget | null = null;
  private chargeStart = 0; // performance.now() when a throw wind-up started, 0 = not charging
  private stopChargeTone: (() => void) | null = null;
  /** Called when the player does a loot action (main sends it to the server / local world). */
  onAction: ((a: WorldAction) => void) | null = null;
  /** Short feedback text for the HUD ("Hands full!", "BONK!"...). */
  onFeedback: ((text: string, kind: "bad" | "good" | "info") => void) | null = null;
  private puffs: { m: Mesh; t: number; vx: number; vy: number; vz: number }[] = [];
  private pops: { m: Mesh; t: number; life: number }[] = [];

  // Punching + pedestrians
  private npcs: NpcRenderer;
  private npcIds = new Set<string>();
  private lastPunch = 0;
  private lastScream = 0;
  punchTarget: PunchTarget | null = null;
  /** my heat 0..100 (wanted stars at 30 / 60 / 90) */
  heat = 0;
  /** Full-screen effect requests (main.ts draws them). */
  onScreenFx: ((fx: ScreenFx, seconds: number) => void) | null = null;

  constructor(engine: Engine, private input: FpInput, arena: ArenaLayout, spawnIndex = 0, private networked = true) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.62, 0.8, 0.95, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.62, 0.8, 0.95);
    scene.fogStart = 80;
    scene.fogEnd = 240;
    this.arena = arena;

    const sp = this.arena.spawns[spawnIndex % this.arena.spawns.length];
    this.cur = makeMoveState(sp.x, sp.z, sp.yaw);
    this.prev = cloneMoveState(this.cur);
    input.yaw = sp.yaw;
    input.pitch = 0;

    const cam = (this.camera = new UniversalCamera("fpCam", new Vector3(sp.x, PLAYER.eyeHeight, sp.z), scene));
    cam.inputs.clear(); // we drive the camera ourselves
    cam.minZ = 0.05;
    cam.maxZ = 500;
    cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    this.applyFov();

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.7;
    hemi.groundColor = new Color3(0.45, 0.42, 0.55);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.35), scene);
    sun.position = new Vector3(30, 50, -30);
    sun.intensity = 1.0;
    // Performance mode: no shadow pass (the biggest single cost in the 200 m city) and a closer fog
    let shadows: ShadowGenerator | null = null;
    if (!settings.lowGraphics) {
      shadows = new ShadowGenerator(2048, sun);
      shadows.usePercentageCloserFiltering = true;
      shadows.darkness = 0.4;
      shadows.bias = 0.002;
      shadows.normalBias = 0.02;
    } else {
      scene.fogStart = 50;
      scene.fogEnd = 150;
    }

    new CityRenderer(scene, this.arena, shadows);
    // Only the static city casts shadows, so draw the shadow map once instead of every frame
    const sm = shadows?.getShadowMap();
    if (sm) sm.refreshRate = 0; // RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    this.items = new ItemRenderer(scene, this.arena);
    this.npcs = new NpcRenderer(scene);
    this.events = new EventRenderer(scene);
    this.propsR = new PropRenderer(scene, this.arena.props ?? []);
    this.cars = new CarRenderer(scene);
    this.copCars = new CopCarRenderer(scene);
    this.lock = new LockpickUI(document.getElementById("hud") ?? document.body);
    this.lock.onPress = (pin, t) => this.onAction?.({ a: "pick", pin, t });
    input.jailKeys = (code) => this.lock.key(code);
    input.jailMouse = (dx, dy) => this.lock.mouse(dx, dy);

    // Tutorial signs in the construction yard (the old movement playground)
    const label = (text: string, x: number, y: number, z: number, rotY = 0) => {
      const p = MeshBuilder.CreatePlane("label", { width: 6, height: 1.2 }, scene);
      p.position.set(x, y, z);
      p.rotation.y = rotY;
      p.material = unlitTextured(scene, textTexture(scene, text, { w: 1024, h: 200, fg: "#ffffff", stroke: "#1b1420" }), "labelMat");
      p.isPickable = false;
    };
    const lm = this.arena.landmarks ?? {};
    if (lm.ledge14) label("CLIMB: FACE LEDGE + SPACE", lm.ledge14.x, 3.4, lm.ledge14.z - 0.5, Math.PI);
    if (lm.tunnelEntrance) label("CROUCH (C) TO CRAWL", lm.tunnelEntrance.x - 1, 2.6, lm.tunnelEntrance.z, -Math.PI / 2);

    this.remotes = new RemotePlayers(scene);
    const color = PLAYER_COLORS[spawnIndex % PLAYER_COLORS.length];
    this.viewmodel = new Viewmodel(scene, cam, color);
    this.voicePitch = [1.0, 1.25, 0.85, 1.45][spawnIndex % 4];
    input.onAction = (a, src) => this.lootAction(a, src);
    void toon;
  }

  /** Compile every shader before the player drops in (avoids a freeze on the first frames). */
  async prewarm(): Promise<void> {
    this.update(0, performance.now());
    await this.scene.whenReadyAsync();
    // Render the whole city once from high above so every material/outline/beam shader is
    // compiled now, not the first time you turn to look at something (that caused hitches).
    const cam = this.camera;
    const pos = cam.position.clone(), rot = cam.rotation.clone(), fov = cam.fov, maxZ = cam.maxZ;
    cam.maxZ = 1000;
    cam.fov = 1.6;
    for (const [x, y, z, rx] of [[0, 150, -130, 0.85], [0, 150, 130, 0.85], [0, 6, 0, 0.2], [-13, 2, -40, 0.1]]) {
      cam.position.set(x, y, z);
      cam.rotation.set(rx, z > 0 ? Math.PI : 0, 0);
      this.scene.render();
    }
    await this.scene.whenReadyAsync();
    this.scene.render();
    cam.position.copyFrom(pos); cam.rotation.copyFrom(rot); cam.fov = fov; cam.maxZ = maxZ;
  }

  applyFov() {
    this.camera.fov = (settings.fov * Math.PI) / 180;
  }

  /** Inputs generated since last call; the network layer sends these to the server. */
  takeOutbox(): MoveInput[] {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  /** Online mode: the server's authoritative view of me. */
  reconcile(me: ServerPlayerView) {
    // Drop inputs the server has already applied
    let i = 0;
    while (i < this.pending.length && this.pending[i].seq <= me.lastSeq) i++;
    if (i) this.pending.splice(0, i);

    const before = cloneMoveState(this.cur);
    const s: MoveState = readMoveState(me);
    for (const inp of this.pending) stepMovement(s, inp, this.arena);
    const ex = before.x - s.x, ey = before.y - s.y, ez = before.z - s.z;
    const err = Math.hypot(ex, ey, ez);
    this.stats.lastError = err;
    if (err > 1e-4) {
      this.stats.corrections++;
      if (err > 2.5) {
        // Too big to hide (e.g. after a reconnect): snap.
        this.correction.set(0, 0, 0);
        this.stats.snaps++;
      } else {
        // Hide the correction: keep drawing where we were, then glide to the truth.
        this.correction.addInPlaceFromFloats(ex, ey, ez);
      }
      // keep interpolation consistent with the corrected state
      this.prev.x -= ex; this.prev.y -= ey; this.prev.z -= ez;
      Object.assign(this.cur, s);
    }
  }

  /**
   * Apply a new world state (from the server, or from the local World in solo).
   * Returns ids of other players (for the lobby list).
   */
  applyWorld(view: WorldView, myId: string, now: number) {
    this.myId = myId;
    const ids = new Set<string>();
    // items first (players' carry poses look items up)
    const itemIds = new Set<string>();
    view.items.forEach((it, id) => {
      itemIds.add(id);
      this.items.sync(id, it, now);
      this.itemTypes.set(id, it.type);
      this.itemViews.set(id, { value: it.value, mode: it.mode, holder: it.holder, holder2: it.holder2, lock: it.lock ?? 0, fort: it.fort ?? -1, mult: it.mult ?? 1 });
    });
    this.items.retain(itemIds);
    for (const id of [...this.itemTypes.keys()]) if (!itemIds.has(id)) { this.itemTypes.delete(id); this.itemViews.delete(id); }

    // round loop + event state
    const mv = view as unknown as Record<string, any>;
    for (const k of Object.keys(this.match) as (keyof MatchHud)[]) if (mv[k] !== undefined) (this.match as any)[k] = mv[k];
    const scores: ScoreLine[] = [];
    view.players.forEach((p, id) => {
      scores.push({ id, name: p.name, colorIdx: p.colorIdx, cash: p.cash ?? 0, bank: p.bank ?? 0, connected: p.connected, me: id === myId });
      if (id === myId) this.myColorIdx = p.colorIdx;
    });
    this.scores = scores.sort((a, b) => b.cash + b.bank - (a.cash + a.bank));

    view.players.forEach((p, id) => {
      if (id === myId) {
        this.reconcile(p as ServerPlayerView);
        this.serverInv = { hand: p.hand ?? "", pockets: [p.p0 ?? "", p.p1 ?? "", p.p2 ?? ""], sel: p.sel ?? 0 };
        this.heat = p.heat ?? 0;
        this.respawnT = p.respawnT ?? 0;
        this.robT = p.robT ?? -1;
        this.jailT = p.jailT ?? 0;
        this.lockSeed = p.lockSeed ?? 0;
        this.lockT = p.lockT ?? 0;
        // drop the optimistic guess once the server agrees (or it expires)
        const o = this.optimistic;
        if (o && (now > o.until || (o.hand === this.serverInv.hand && o.pockets.join() === this.serverInv.pockets.join()))) this.optimistic = null;
      } else {
        ids.add(id);
        this.remotes.push(id, p as RemoteInfo, now);
        const h = p.hand as string;
        const t = h ? this.itemTypes.get(h) : undefined;
        const kind: CarryKind = !t ? "none" : (lootDef(t).size as CarryKind);
        this.remotes.setCarry(id, kind);
      }
    });
    this.remotes.retain(ids);

    // props (dumpsters emptied, booths smashed, alarms) + traffic
    view.props?.forEach((pv, id) => { this.propsR.sync(id, pv); this.propState.set(id, pv.ready); });
    view.cars?.forEach((cv, id) => this.cars.sync(id, cv));
    this.copCars.syncAll(view.copCars);

    // pedestrians
    if (view.npcs) {
      const seen = this.npcIds;
      seen.clear();
      view.npcs.forEach((n, id) => { seen.add(id); this.npcs.sync(id, n, now); });
      this.npcs.retain(seen);
    }
    return ids;
  }

  /** Inventory as shown: instant local feedback, corrected by the server. */
  get inventory(): Inventory {
    const o = this.optimistic;
    return o && performance.now() <= o.until ? o : this.serverInv;
  }

  itemType(id: string) { return this.itemTypes.get(id) ?? null; }

  /** Sounds and effects for things that happened in the world. */
  handleEvents(events: WorldEvent[]) {
    const me = this.myId;
    const cam = this.camera.position;
    const gainAt = (x: number, y: number, z: number) => 1 / (1 + Math.hypot(x - cam.x, y - cam.y, z - cam.z) / 8);
    for (const e of events) {
      switch (e.t) {
        case "grab":
          if (e.p !== me) { const a = this.remotes.anchor(e.p); if (a && gainAt(a.x, a.y, a.z) > 0.25) sfx.grab(); }
          break;
        case "whiff":
          if (e.p === me) {
            this.optimistic = null;
            if (e.reason !== "cooldown") {
              sfx.whiff();
              this.onFeedback?.(e.reason === "taken" ? "Too slow!" : e.reason === "far" ? "Can't reach!" : e.reason === "locked" ? "Banked in a fort. Locked!" : e.reason === "full" ? "Pockets full!" : "Hands full!", "bad");
            }
          }
          break;
        case "impact": {
          const t = this.itemTypes.get(e.item);
          const g = gainAt(e.x, e.y, e.z);
          if (t && g > 0.12) sfx.impact(lootDef(t).material, e.speed, g);
          if (g > 0.1) this.puff(e.x, e.y, e.z, Math.min(1, e.speed / 10));
          break;
        }
        case "bonk":
          if (e.p === me) { sfx.bonk(); this.addTrauma(0.5); this.onFeedback?.("BONK!", "bad"); }
          else { const a = this.remotes.anchor(e.p); if (a) { sfx.bonk(); if (e.by === me) this.onFeedback?.("BONK! Nice shot.", "good"); } }
          break;
        case "tumble": sfx.tumble(); break;
        case "drop": case "throw": case "spawn": break;

        // ---- punching + pedestrians (Phase 2.5) ----
        case "punch": {
          const tp = e.hit === "npc" ? this.npcs.pos(e.target) : e.hit === "player" || e.hit === "blocked" ? (e.target === me ? cam : this.remotes.anchor(e.target)) : null;
          if (e.p === me) {
            if (e.hit === "npc" && tp) { sfx.punchHit(); this.addTrauma(0.22); this.pop("BONK!", tp.x, tp.y + 1.9, tp.z, "#ffe14a"); }
            else if (e.hit === "player" && tp) { sfx.punchPlayer(); this.addTrauma(0.35); this.pop("POW!", tp.x, tp.y + 1.9, tp.z, "#ff5a3c"); }
            else if (e.hit === "blocked") { sfx.blocked(); this.onFeedback?.("They're still dizzy - no double-dipping!", "info"); }
          } else {
            this.remotes.punch(e.p);
            const a = this.remotes.anchor(e.p);
            const g = a ? gainAt(a.x, a.y, a.z) : 0;
            if (g > 0.15) {
              if (e.hit === "npc") sfx.punchHit(g); else if (e.hit === "player") sfx.punchPlayer(g); else sfx.punchWhoosh();
              if (tp && e.hit !== "none" && e.target !== me) this.pop(e.hit === "npc" ? "BONK!" : "POW!", tp.x, tp.y + 1.9, tp.z, e.hit === "npc" ? "#ffe14a" : "#ff5a3c");
            }
          }
          break;
        }
        case "npcHit": {
          this.npcs.bump(e.npc);
          if (e.how === "throw") {
            const p = this.npcs.pos(e.npc);
            if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.punchHit(gainAt(p.x, p.y, p.z)); this.pop("BONK!", p.x, p.y + 1.9, p.z, "#ffe14a"); }
            if (e.by === me) this.onFeedback?.("BONK! Nice shot.", "good");
          }
          break;
        }
        case "npcSay": {
          const p = this.npcs.pos(e.npc);
          if (!p) break;
          const g = gainAt(p.x, p.y, p.z);
          if (g < 0.12) break; // too far to hear or read
          this.npcs.say(e.npc, e.line);
          const kind = this.npcs.kindOf(e.npc) ?? "tourist";
          if (kind !== "mime") sfx.npcVoice(NPC_VOICE[kind] ?? 1, g); // mimes say nothing, obviously
          break;
        }
        case "npcAttack": {
          this.npcs.slap(e.npc);
          if (e.p === me) {
            if (e.hit) { sfx.punchPlayer(); this.addTrauma(0.5); this.camDip.kick(-0.5); this.onFeedback?.("SLAPPED!", "bad"); }
            else sfx.whiff();
          } else {
            const p = this.npcs.pos(e.npc);
            if (p && gainAt(p.x, p.y, p.z) > 0.15) (e.hit ? sfx.punchPlayer : sfx.slapWindup)(gainAt(p.x, p.y, p.z));
          }
          break;
        }
        case "npcDodge": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.dodgeNpc(gainAt(p.x, p.y, p.z)); this.pop("MISS", p.x, p.y + 1.9, p.z, "#b6ff3c"); }
          if (e.p === me) this.onFeedback?.("Too slow! The jogger dodged.", "bad");
          break;
        }
        case "npcKo": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.ko(gainAt(p.x, p.y, p.z)); this.pop("K.O.!", p.x, p.y + 2.2, p.z, "#ff6fb5"); }
          if (e.by === me) this.onFeedback?.("K.O.! Bonus loot!", "good");
          break;
        }
        case "panic": {
          const p = this.npcs.pos(e.npc);
          const nowMs = performance.now();
          if (p && nowMs - this.lastScream > 350) {
            const g = gainAt(p.x, p.y, p.z);
            if (g > 0.15 && this.npcs.kindOf(e.npc) !== "mime") { this.lastScream = nowMs; sfx.scream(g, NPC_VOICE[this.npcs.kindOf(e.npc) ?? ""] ?? 1); }
          }
          break;
        }
        case "knockdown":
          if (e.p === me) {
            sfx.knockdown(); this.addTrauma(0.8); this.optimistic = null;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            this.onFeedback?.(e.by === "truck" ? "FLATTENED BY THE GARBAGE TRUCK!" : "KNOCKED DOWN! You dropped everything.", "bad");
            this.onScreenFx?.("knocked", e.time);
          } else {
            const a = this.remotes.anchor(e.p);
            if (a && gainAt(a.x, a.y, a.z) > 0.12) { sfx.knockdown(); this.pop("DOWN!", a.x, a.y + 1.4, a.z, "#ff5a3c"); }
            if (e.by === me) this.onFeedback?.("KNOCKDOWN! Their loot is up for grabs.", "good");
          }
          break;
        // ---- Phase 3: rounds, banking, city events ----
        case "round": this.onRound(e.phase, e.round); break;
        case "banked": {
          if (e.p !== me) break;
          const p = this.items.drawnPos(e.item);
          sfx.cash();
          if (p) this.pop("+$" + e.value, p.x, p.y + 0.9, p.z, "#7fe07a");
          break;
        }
        case "lost":
          if (e.p === me) { sfx.lost(); this.onFeedback?.(`You lost ${e.count} item${e.count > 1 ? "s" : ""} worth $${e.value}. Get home next time!`, "bad"); }
          break;
        case "cityEvent": this.onCityEvent(e.kind, e.stage, e.detail); break;
        case "swept": { if (gainAt(e.x, 0.5, e.z) > 0.1) this.puff(e.x, 0.4, e.z, 0.8); break; }
        case "raccoonGrab": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.1) sfx.chitter(gainAt(p.x, p.y, p.z));
          if (e.p === me) { const t = this.itemTypes.get(e.item); this.onFeedback?.(`A raccoon is stealing your ${t ? lootDef(t).name : "loot"}! Bonk it!`, "bad"); }
          break;
        }
        case "raccoonEscaped":
          if (e.p === me) this.onFeedback?.(`The raccoon got away with your ${lootDef(e.type).name} ($${e.value})`, "bad");
          break;
        // ---- Phase 3.5: loot sources, hold-ups, traffic ----
        case "search": {
          const d = this.propsR.def(e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.1) sfx.search(g); if (e.raccoon && g > 0.1) sfx.chitter(g); }
          if (e.p === me) this.onFeedback?.(e.raccoon ? "A RACCOON jumped out!" : `Found ${e.found} thing${e.found > 1 ? "s" : ""}!`, e.raccoon ? "bad" : "good");
          break;
        }
        case "smash": {
          const d = this.propsR.def(e.prop) ?? (this.arena.props ?? []).find((x) => x.id === e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.1) { sfx.smash(e.kind, g); this.pop(e.kind === "car" ? "SMASH!" : "CLANG!", d.x, 2.2, d.z, "#ffe14a"); } }
          break;
        }
        case "empty": if (e.p === me) this.onFeedback?.("Nothing left in there. It refills later.", "info"); break;
        case "alarm": {
          const g = gainAt(e.x, 1, e.z);
          if (g > 0.06) { sfx.alarm(e.kind, Math.min(1, g * 1.5)); }
          break;
        }
        case "robStart": if (e.p === me) { sfx.robStart(); this.onFeedback?.("STICK EM UP! Keep holding R!", "info"); } break;
        case "robCancel": if (e.p === me) { this.robHeld = false; this.onFeedback?.("Hold-up called off", "info"); } break;
        case "robDone": if (e.p === me) { this.robHeld = false; sfx.cash(); this.onFeedback?.(`Got a bundle of cash ($${e.value})! Now RUN.`, "good"); } break;
        case "shoplift": if (e.p === me) this.onFeedback?.("The cashier saw that! (+heat)", "bad"); break;
        case "wipeout": {
          const g = gainAt(e.x, 0.5, e.z);
          if (g > 0.08) sfx.crash(g);
          if (e.p === me) {
            this.addTrauma(1); this.optimistic = null; this.robHeld = false;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            this.onScreenFx?.("knocked", 10);
          } else if (g > 0.1) this.pop("SPLAT!", e.x, 1.2, e.z, "#ff5a3c");
          break;
        }
        case "respawn": if (e.p === me) { sfx.respawn(); this.onFeedback?.("Back at your fort. Look both ways next time!", "info"); } break;
        case "honk": { const g = gainAt(e.x, 1, e.z); if (g > 0.1) sfx.honk(g); break; }
        // ---- Phase 4: police
        case "copSpawn":
          if (e.p === me && this.copNoticeT <= 0) { this.copNoticeT = 6; sfx.radio(); this.onFeedback?.("Somebody called the cops on you!", "bad"); }
          break;
        case "spotted": {
          if (e.p === me) { sfx.whistle(); this.onFeedback?.("SPOTTED! Break line of sight to lose them!", "bad"); }
          else { const q = this.npcs.pos(e.npc); if (q) { const g = gainAt(q.x, q.y, q.z); if (g > 0.15) sfx.whistle(g * 0.6); } }
          break;
        }
        case "busted":
          if (e.p === me) {
            sfx.cuffs(); setTimeout(() => sfx.cellDoor(), 500);
            this.optimistic = null; this.robHeld = false;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            // the jail screen is the headline; it says what they took
            this.lock.setHeadline(e.car ? "RUN OVER & BUSTED!" : "BUSTED!", e.count ? `They confiscated ${e.count} item${e.count > 1 ? "s" : ""} ($${e.value})` : "You're in the Trashington PD lock-up");
          } else {
            const name = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
            this.onFeedback?.(`${name} got BUSTED!${e.count ? ` ($${e.value} of loot confiscated)` : ""}`, "info");
          }
          break;
        case "released":
          if (e.p === me) {
            // face the way out (the alley runs west; the front door faces the street)
            const st = this.arena.station;
            if (st) { const spot = e.breakout ? st.alley : st.door; this.input.yaw = ((spot.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); this.input.pitch = 0; }
            this.roll = 0; this.lie = 0; this.trauma = 0; this.correction.set(0, 0, 0);
            if (e.breakout) { sfx.unlock(); this.onBanner?.("JAILBREAK!", "You're out the back. The cops know... RUN!", "good"); }
            else { sfx.respawn(); this.onFeedback?.("Time served. You're free (and your record is clean).", "info"); }
          } else if (e.breakout) {
            const name = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
            this.onFeedback?.(`${name} BROKE OUT of jail!`, "info");
          }
          break;
        case "lock": break; // the jailed player's own screen handles its sounds
        // ---- Phase 4.5: big shots
        case "bigShot": {
          const def = NPC_DEFS[e.kind];
          const title = def.bigShot?.title ?? def.name.toUpperCase();
          if (e.stage === "arrive") { sfx.bigShot(); this.onBanner?.(`${title} IS IN TOWN!`, `Look for the $$$ near ${areaName(e.x, e.z)}. A jackpot... and a LOT of heat.`, "good"); }
          else if (e.stage === "hit") {
            if (e.by === me) this.onFeedback?.(e.kind === "courier" ? "Armored courier! Knock them out for the money bag!" : "JACKPOT! Grab it and RUN (the cops are coming)", "good");
            else { const name = this.scores.find((x) => x.id === e.by)?.name ?? "Someone"; this.onFeedback?.(`${name} is robbing the ${def.name.toLowerCase()}!`, "info"); }
          } else if (e.stage === "gone") this.onFeedback?.(`The ${def.name.toLowerCase()} left town.`, "info");
          break;
        }
        case "copCar":
          if (e.p === me && e.stage === "dispatch") { sfx.siren(1); this.onBanner?.("COP CAR INCOMING!", "Max heat. Get off the streets and out of sight!", "bad"); }
          if (e.stage === "deploy" && e.p === me) sfx.cellDoor(); // car doors slam
          break;
        case "flash":
          if (e.p === me) { sfx.cameraFlash(); this.onScreenFx?.("flash", 1.2); this.onFeedback?.("Say cheese! (the tourist got a photo)", "info"); }
          break;
        case "trap":
          if (e.p === me) { sfx.mimeBox(); this.onFeedback?.("Trapped in an invisible box!", "bad"); }
          break;
        case "swarm":
          if (e.p === me) { sfx.coo(); setTimeout(() => sfx.coo(0.7), 700); this.onScreenFx?.("swarm", 5); this.onFeedback?.("PIGEONS! (dodge to shake them off)", "bad"); }
          break;
      }
    }
  }

  private onRound(phase: string, round: number) {
    switch (phase) {
      case "intro": sfx.roundIntro(); this.onBanner?.(`ROUND ${round} OF ${this.match.rounds}`, "Get ready to scavenge...", "info"); break;
      case "scavenge": sfx.roundStart(); this.onBanner?.("SCAVENGE!", "Bring loot home: it banks in your fort after 10 s", "good"); break;
      case "hurry": sfx.hurry(); this.onBanner?.("30 SECONDS!", "Get home, or lose whatever you're carrying!", "bad"); break;
      case "tally": sfx.timeUp(); this.onBanner?.("TIME'S UP!", "", "info"); break;
      case "over": sfx.roundIntro(); break;
    }
  }

  private onCityEvent(kind: string, stage: string, detail: string) {
    if (stage === "warn") {
      if (kind === "airdrop") { sfx.plane(); this.onBanner?.("AIRDROP INCOMING!", "A crate is parachuting into the plaza. It takes two to carry.", "good"); }
      if (kind === "truck") { sfx.truckHorn(); this.onBanner?.(`GARBAGE TRUCK: ${detail} ROAD`, "It hoovers up loot and flattens bandits. Move it!", "bad"); }
      if (kind === "happyhour") { sfx.happyHour(); this.onBanner?.("HAPPY HOUR!", `Loot in ${detail} is worth DOUBLE for 30 s. Grab it!`, "good"); }
      if (kind === "raccoons") { sfx.chitter(1); this.onBanner?.("RACCOON HEIST!", "Raccoons are sneaking into the forts. Bonk them!", "bad"); }
    } else if (stage === "end") {
      if (kind === "happyhour") this.onFeedback?.("Happy hour is over", "info");
    }
  }

  /** Locked up: show the lock-picking screen, freeze movement; hide it when you're out. */
  private jailScreen(dt: number) {
    this.copNoticeT -= dt;
    const jailed = this.jailT > 0 && this.lockSeed > 0;
    if (jailed) {
      if (!this.lock.open || this.lock.seed !== this.lockSeed) {
        this.lock.start(this.lockSeed, this.lockT);
        // face the bars, level, and keep the camera still while you pick (no swinging around)
        this.input.yaw = 0; this.input.pitch = 0.05;
        this.roll = 0; this.lie = 0; this.trauma = 0;
      }
      this.input.setFrozen(true);
      this.lock.update(dt, this.jailT, this.lockT);
    } else if (this.lock.open) {
      this.lock.stop();
      this.input.setFrozen(false);
    }
  }

  /** Wee-woo from the nearest cruiser with its siren on. */
  private sirenSounds(dt: number) {
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.9;
    let best = Infinity;
    for (const c of this.copCars.sirens()) best = Math.min(best, Math.hypot(c.x - this.cur.x, c.z - this.cur.z));
    if (best < 90) sfx.siren(1 / (1 + best / 12));
  }

  /** Test hooks. */
  copCarPositions() { return this.copCars.positions(); }

  /** The big shot in town (not yet robbed): name, distance, and bearing relative to where you look. */
  get bigShot(): { id: string; kind: string; name: string; dist: number; rel: number } | null {
    const b = this.npcs.bigShots().find((x) => !x.robbed);
    if (!b) return null;
    const dx = b.x - this.cur.x, dz = b.z - this.cur.z;
    let rel = Math.atan2(dx, dz) - this.input.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const def = NPC_DEFS[b.kind as keyof typeof NPC_DEFS];
    return { id: b.id, kind: b.kind, name: def?.name ?? b.kind, dist: Math.hypot(dx, dz), rel };
  }

  /** Engine noise from the nearest car. */
  private trafficSounds(dt: number) {
    this.engineT -= dt;
    if (this.engineT > 0) return;
    this.engineT = 0.35;
    const n = this.cars.nearest(this.cur.x, this.cur.z);
    if (n && n.d < 22) sfx.engine(1 / (1 + n.d / 5));
  }

  /** Round countdown ticks, garbage truck rumble. */
  private matchSounds(dt: number) {
    const m = this.match;
    if (m.phase === "scavenge" && m.timeLeft <= 10 && m.timeLeft > 0) {
      const sec = Math.ceil(m.timeLeft);
      if (sec !== this.lastTickSec) { this.lastTickSec = sec; sfx.tick(sec <= 3); }
    } else this.lastTickSec = -1;
    const tp = this.events.truckPos;
    if (tp) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) {
        this.rumbleT = 0.3;
        const d = Math.hypot(tp.x - this.cur.x, tp.z - this.cur.z);
        if (d < 45) sfx.rumble(1 / (1 + d / 8));
      }
    }
  }

  private npcAnchor(id: string) {
    const p = this.npcs.pos(id);
    return p ? { x: p.x, y: p.y - 0.4, z: p.z, yaw: 0 } : null;
  }

  /** Where your fort is, for the HUD compass. */
  home(): HomeInfo {
    const f = this.arena.forts?.find((x) => x.slot === this.myColorIdx);
    if (!f) return { inside: false, dist: 0, bearing: 0 };
    const dx = f.padX - this.cur.x, dz = f.padZ - this.cur.z;
    let b = Math.atan2(dx, dz) - this.input.yaw;
    while (b > Math.PI) b -= Math.PI * 2;
    while (b < -Math.PI) b += Math.PI * 2;
    return { inside: fortAt(this.arena, this.cur.x, this.cur.z) === this.myColorIdx, dist: Math.hypot(dx, dz), bearing: b };
  }

  fortName(slot: number) { return PLAYER_COLOR_NAMES[slot] ?? "someone"; }

  /** Floating comic text ("BONK!") that pops up and fades. */
  private popMats = new Map<string, ReturnType<typeof unlitTextured>>();
  private pop(text: string, x: number, y: number, z: number, color: string) {
    if (this.pops.length > 12) { this.pops[0].m.dispose(); this.pops.shift(); }
    const key = text + color;
    let mat = this.popMats.get(key);
    if (!mat) { mat = unlitTextured(this.scene, textTexture(this.scene, text, { w: 512, h: 160, fg: color, stroke: "#1b1420" }), "pop"); this.popMats.set(key, mat); }
    const m = MeshBuilder.CreatePlane("pop", { width: 1.4, height: 0.44 }, this.scene);
    m.material = mat;
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    m.renderingGroupId = 1;
    m.isPickable = false;
    m.position.set(x, y, z);
    m.rotation.z = (Math.random() - 0.5) * 0.4;
    this.pops.push({ m, t: 0, life: 0.8 });
  }

  private updatePops(dt: number) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.life;
      p.m.position.y += dt * 0.9;
      const s = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15));
      p.m.scaling.setAll(s);
      p.m.visibility = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
      if (k >= 1) { p.m.dispose(); this.pops.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- loot actions
  /** last few input actions and what happened to them (test diagnostics) */
  readonly actionLog: string[] = [];
  private logAction(m: string) { this.actionLog.push(m); if (this.actionLog.length > 30) this.actionLog.shift(); }

  private lootAction(a: LootAction, src?: "mouse" | "key") {
    this.logAction(a + ":" + (this.lookTarget?.id ?? "-"));
    const inv = this.inventory;
    const now = performance.now();
    // Left click with empty hands = punch (pocket items are thrown with F)
    if (a === "chargeStart" && src === "mouse" && !inv.hand) { this.punch(now); return; }
    const hold = 600; // ms the optimistic guess is trusted before the server must confirm
    if (a === "grabEnd") return;
    if (a === "robEnd") {
      if (this.robHeld) { this.robHeld = false; this.onAction?.({ a: "robStop" }); }
      return;
    }
    if (a === "robStart") {
      const r = this.robTarget;
      if (!r) return;
      if (r.empty) { sfx.full(); this.onFeedback?.("The till's empty right now (or the register's gone)!", "info"); return; }
      this.robHeld = true;
      this.onAction?.({ a: "use", prop: r.id });
      return;
    }
    if (a === "grab") this.updateLookTarget();
    if (a === "grab" && !this.lookTarget && this.useTarget) {
      const u = this.useTarget;
      if (u.empty) { sfx.full(); this.onFeedback?.("Already searched. It'll refill later.", "info"); return; }
      this.onAction?.({ a: "use", prop: u.id });
      return;
    }
    if (a === "grab") {
      this.updateLookTarget(); // fresh: a slow frame can leave the target pointing at something we already picked up
      const t = this.lookTarget;
      this.logAction("grab-target:" + (t?.id ?? "none"));
      if (!t) return;
      if (t.note.startsWith("LOCKED")) { sfx.full(); this.onFeedback?.("Banked in a fort. Locked!", "info"); return; }
      const size = t.def.size;
      if (size === "small" && inv.pockets.includes("")) {
        const pockets = [...inv.pockets];
        pockets[pockets.indexOf("")] = t.id;
        this.optimistic = { ...inv, pockets, until: now + hold };
        sfx.pocket();
      } else if (!inv.hand) {
        this.optimistic = { ...inv, pockets: [...inv.pockets], hand: t.id, until: now + hold };
        sfx.grab();
        this.viewmodel.kick(0.3);
      } else {
        sfx.full();
        this.onFeedback?.(size === "small" ? "Pockets full!" : "Hands full!", "bad");
        return;
      }
      this.onAction?.({ a: "grab", item: t.id });
    } else if (a === "drop") {
      const src = this.activeItem(inv);
      if (!src) return;
      this.optimistic = this.without(inv, src, now + hold);
      sfx.drop();
      this.onAction?.({ a: "drop" });
    } else if (a === "cycle") {
      const sel = (inv.sel + 1) % POCKETS;
      this.optimistic = { ...inv, pockets: [...inv.pockets], sel, until: now + hold };
      sfx.uiHover();
      this.onAction?.({ a: "cycle" });
    } else if (a === "chargeStart") {
      const src = this.activeItem(inv);
      if (!src) return;
      const t = this.itemTypes.get(src.id);
      if (t && lootDef(t).size === "giant") { this.onFeedback?.("Too big to throw!", "bad"); return; }
      this.chargeStart = now;
      this.stopChargeTone = chargeTone();
    } else if (a === "chargeEnd") {
      if (!this.chargeStart) return;
      const charge = Math.min(1, (now - this.chargeStart) / 1000 / CHARGE_TIME);
      this.chargeStart = 0;
      this.stopChargeTone?.(); this.stopChargeTone = null;
      const src = this.activeItem(inv);
      if (!src) { this.viewmodel.setCharge(0); return; }
      const type = this.itemTypes.get(src.id);
      this.optimistic = this.without(inv, src, now + hold);
      this.onAction?.({ a: "throw", charge, yaw: this.input.yaw, pitch: this.input.pitch });
      this.viewmodel.throwAnim();
      sfx.throw(charge);
      // Predict the flight locally with the same maths the server uses
      if (type) {
        const def = lootDef(type);
        const v = throwVelocity(this.input.yaw, this.input.pitch, throwSpeed(def, charge));
        const m = this.cur;
        const eyeY = m.y + (m.crouching || m.slideT > 0 ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
        this.items.predictThrow(src.id, {
          x: m.x + v.dx * 0.55, y: eyeY - 0.15 + v.dy * 0.55, z: m.z + v.dz * 0.55,
          vx: v.vx + m.vx * 0.5, vy: v.vy, vz: v.vz + m.vz * 0.5, rot: m.yaw, spin: 0, resting: false,
        }, now);
      }
    }
  }

  private punch(now: number) {
    if (now - this.lastPunch < PUNCH_CD_MS) return;
    if (this.cur.knockT > 0 || this.cur.mantleT > 0) return;
    this.lastPunch = now;
    this.viewmodel.punchAnim();
    sfx.punchWhoosh();
    this.onAction?.({ a: "punch", yaw: this.input.yaw, pitch: this.input.pitch });
  }

  /** Same priority as the server: hands first, then selected pocket, then any pocket. */
  private activeItem(inv: Inventory): { id: string; from: "hand" | number } | null {
    if (inv.hand) return { id: inv.hand, from: "hand" };
    for (const i of [inv.sel, ...[0, 1, 2].filter((k) => k !== inv.sel)]) if (inv.pockets[i]) return { id: inv.pockets[i], from: i };
    return null;
  }

  private without(inv: Inventory, src: { from: "hand" | number }, until: number): Inventory & { until: number } {
    const pockets = [...inv.pockets];
    if (src.from !== "hand") pockets[src.from] = "";
    return { hand: src.from === "hand" ? "" : inv.hand, pockets, sel: inv.sel, until };
  }

  /** Find the item under the crosshair within reach. */
  private updateLookTarget() {
    const cam = this.camera.position;
    const yaw = this.input.yaw, pitch = this.input.pitch;
    const dx0 = Math.sin(yaw) * Math.cos(pitch), dy0 = -Math.sin(pitch), dz0 = Math.cos(yaw) * Math.cos(pitch);
    let best: LookTarget | null = null;
    let bestScore = Infinity;
    const inv = this.inventory;
    for (const [id, iv] of this.itemViews) {
      const type = this.itemTypes.get(id)!;
      const def = lootDef(type);
      if (iv.mode === "pocket") continue;
      if (id === inv.hand || inv.pockets.includes(id)) continue;
      let note = "";
      if (iv.lock >= 100) note = "LOCKED:" + iv.fort;
      if (iv.mode === "held") {
        if (this.npcs.kindOf(iv.holder)) continue; // being carried off by a raccoon: bonk it instead
        // only a giant item with a free second handle can be joined
        if (def.size !== "giant" || iv.holder2 || iv.holder === this.myId) continue;
        note = "HELP CARRY";
      }
      const p = this.items.drawnPos(id);
      if (!p) continue;
      const vx = p.x - cam.x, vy = p.y - cam.y, vz = p.z - cam.z;
      const dist = Math.hypot(vx, vy, vz);
      if (dist - def.radius > GRAB_RANGE_CLIENT) continue;
      const cos = (vx * dx0 + vy * dy0 + vz * dz0) / Math.max(1e-6, dist);
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      const allowance = Math.atan((def.radius + 0.28) / Math.max(0.3, dist)) + 0.08;
      if (angle > allowance) continue;
      const score = angle - allowance;
      if (score < bestScore) { bestScore = score; best = { id, def, value: iv.value, dist, note }; }
    }
    this.lookTarget = best;
    this.items.highlight(best?.id ?? null);
  }

  /** Pedestrian you'd hit if you punched now (only when your hands are empty). */
  /** Dumpster / bin / till in reach in front of you. */
  private updateUseTarget() {
    this.useTarget = null;
    this.robTarget = null;
    if (this.cur.knockT > 0) return;
    // a till in reach: HOLD R for a hold-up (works even while looking at the register itself)
    const till = this.propInFront((d) => d.kind === "till", USE_RANGE + 0.3);
    if (till) this.robTarget = { id: till.id, kind: "till", name: PROP_NAMES.till, empty: this.propState.get(till.id) === false || !this.registerNear(till) };
    if (this.lookTarget) return;
    const best = this.propInFront((d) => SEARCHABLE.has(d.kind), USE_RANGE);
    if (best) this.useTarget = { id: best.id, kind: best.kind, name: PROP_NAMES[best.kind] ?? best.kind, empty: this.propState.get(best.id) === false };
  }

  /** Is the cash register still sitting on this till's counter? */
  private registerNear(d: PropDef): boolean {
    for (const [id, iv] of this.itemViews) {
      if (iv.mode !== "free" || this.itemTypes.get(id) !== "cash_register") continue;
      const p = this.items.drawnPos(id);
      if (p && Math.hypot(p.x - d.x, p.z - d.z) < 1.2) return true;
    }
    return false;
  }

  /** The closest prop (matching a filter) roughly under the crosshair and within reach. */
  private propInFront(filter: (d: PropDef) => boolean, reach: number): PropDef | null {
    const me = this.cur, yaw = this.input.yaw;
    let best: PropDef | null = null, bestScore = Infinity;
    for (const d of this.arena.props ?? []) {
      if (!filter(d)) continue;
      const dx = d.x - me.x, dz = d.z - me.z, dist = Math.hypot(dx, dz);
      if (dist - PROP_RADIUS[d.kind] > reach || Math.abs(d.y - me.y) > 2.2) continue;
      let ang = Math.atan2(dx, dz) - yaw;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      const allow = Math.atan((PROP_RADIUS[d.kind] + 0.5) / Math.max(0.5, dist)) + 0.15;
      if (Math.abs(ang) > allow && dist > 1.2) continue;
      const score = dist + Math.abs(ang) * 2;
      if (score < bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  private updatePunchTarget(hand: string) {
    this.punchTarget = null;
    if (hand || this.lookTarget || this.useTarget || this.robTarget || this.cur.knockT > 0) return;
    const prop = this.propInFront((d) => SMASHABLE.has(d.kind), 1.9);
    const me = this.cur, yaw = this.input.yaw;
    let best = Infinity;
    this.npcs.forEachVisible((id, x, y, z, state, kind) => {
      if (state === "ko" || Math.abs(y - me.y) > 1.6) return;
      const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
      if (d > PUNCH_REACH) return;
      let ang = Math.atan2(dx, dz) - yaw;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > 0.9 && d > 0.6) return;
      const score = d + Math.abs(ang) * 1.5;
      if (score < best) {
        best = score;
        const def = NPC_DEFS[kind as keyof typeof NPC_DEFS];
        this.punchTarget = { id, kind, name: def?.name ?? kind, fighter: !!def?.fighter };
      }
    });
    if (!this.punchTarget && prop) this.punchTarget = { id: prop.id, kind: prop.kind, name: PROP_NAMES[prop.kind] ?? prop.kind, fighter: false, prop: true, empty: this.propState.get(prop.id) === false };
  }

  /** Little dust puff where something landed hard. */
  private puff(x: number, y: number, z: number, strength: number) {
    for (let i = 0; i < 5; i++) {
      const m = MeshBuilder.CreateSphere("puff", { diameter: 0.25, segments: 4 }, this.scene);
      m.material = toon(this.scene, "#d8d0c4", "puff");
      m.position.set(x, Math.max(0.1, y - 0.2), z);
      m.isPickable = false;
      const a = (i / 5) * Math.PI * 2;
      this.puffs.push({ m, t: 0, vx: Math.cos(a) * (1 + strength), vy: 0.6 + strength, vz: Math.sin(a) * (1 + strength) });
    }
  }

  private updatePuffs(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.vx *= 0.9; p.vz *= 0.9;
      const k = p.t / 0.5;
      p.m.scaling.setAll(1 + k * 1.5);
      p.m.visibility = Math.max(0, 1 - k);
      if (k >= 1) { p.m.dispose(); this.puffs.splice(i, 1); }
    }
  }

  get position() { return { x: this.cur.x, y: this.cur.y, z: this.cur.z }; }

  update(dt: number, now: number) {
    // ---- fixed-step simulation (60 Hz) ----
    if (dt > 0.25) this.stats.droppedMs += (dt - 0.25) * 1000;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.stats.steps++;
      const a = this.input.axes();
      if (a.mx || a.mz) this.stats.moveSteps++;
      const inp: MoveInput = {
        seq: this.seq++, mx: a.mx, mz: a.mz, yaw: this.input.yaw, pitch: this.input.pitch,
        sprint: a.sprint, jump: a.jump, crouch: a.crouch, dodge: a.dodge,
      };
      this.prev = cloneMoveState(this.cur);
      stepMovement(this.cur, inp, this.arena);
      if (this.networked) {
        this.pending.push(inp);
        this.outbox.push(inp);
      }
      this.feel(inp);
    }
    if (this.pending.length > 180) this.pending.splice(0, this.pending.length - 180);
    this.stats.pending = this.pending.length;

    // ---- render position: blend between the last two steps + fading correction ----
    const k = this.acc / SIM_DT;
    const decay = Math.exp(-dt * 14);
    this.correction.scaleInPlace(decay);
    const px = this.prev.x + (this.cur.x - this.prev.x) * k + this.correction.x;
    const py = this.prev.y + (this.cur.y - this.prev.y) * k + this.correction.y;
    const pz = this.prev.z + (this.cur.z - this.prev.z) * k + this.correction.z;

    this.time += dt;
    const cur = this.cur;
    const pose = movePose(cur);
    const hs = horizontalSpeed(cur);
    const reduced = settings.reducedMotion;
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);

    // Eye height follows stance (crouch / slide lower the camera smoothly)
    const eyeTarget = pose === "knocked" ? 0.35 : pose === "slide" ? PLAYER.slideEyeHeight : cur.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eye += (eyeTarget - this.eye) * ease(12);

    // Head bob (off with reduced motion)
    if (cur.grounded && hs > 0.5 && pose !== "slide") this.headBob += dt * hs * 1.9;
    const bobAmt = reduced ? 0 : Math.min(1, hs / PLAYER.sprintSpeed) * (cur.crouching ? 0.02 : 0.045);
    const bob = Math.sin(this.headBob * 2) * bobAmt;

    // FOV kick when going fast (sprint/slide/dodge)
    const kickTarget = reduced ? 0 : pose === "slide" ? 10 : pose === "dodge" ? 8 : pose === "sprint" ? 5 : 0;
    this.fovKick += (kickTarget - this.fovKick) * ease(6);
    this.camera.fov = ((settings.fov + this.fovKick) * Math.PI) / 180;

    // Roll: slight lean into strafes, more when sliding
    const strafe = this.input.axes().mx;
    const rollTarget = (pose === "knocked" ? (reduced ? 0.2 : 0.55) : 0) + (reduced ? 0 : (pose === "slide" ? 0.05 : 0) - strafe * 0.018 + (pose === "stumble" ? Math.sin(this.time * 18) * 0.05 : 0));
    this.roll += (rollTarget - this.roll) * ease(8);

    const camDip = this.camDip.update(dt);

    // Screen shake: trauma^2 so small bumps stay subtle; scaled by the player's setting
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shakeAmt = reduced ? 0 : this.trauma * this.trauma * settings.screenShake;
    const n = (f: number, o: number) => Math.sin(this.time * f + o) * Math.sin(this.time * f * 0.63 + o * 2.1);
    const shakeP = n(41, 0) * 0.035 * shakeAmt, shakeY = n(37, 3) * 0.035 * shakeAmt, shakeR = n(29, 7) * 0.05 * shakeAmt;

    this.camera.position.set(px, py + this.eye + bob + (reduced ? 0 : camDip), pz);
    // knocked down: you're looking up at the sky from the pavement
    const lieBack = pose === "knocked" ? -0.55 : 0;
    this.lie += (lieBack - this.lie) * ease(8);
    this.camera.rotation.set(safePitch(this.input.pitch + shakeP + this.lie), this.input.yaw + shakeY, clampAbs(this.roll + shakeR, MAX_ROLL));
    if (!Number.isFinite(this.camera.position.y) || !Number.isFinite(this.camera.rotation.z) || !Number.isFinite(this.camera.rotation.x)) {
      // last line of defence: never leave the camera broken
      this.camera.position.set(px, py + PLAYER.eyeHeight, pz);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
      this.roll = 0; this.trauma = 0;
    }

    // Loot in hands (viewmodel), throw wind-up, look target
    const inv = this.inventory;
    const heldId = inv.hand || (this.chargeStart ? this.activeItem(inv)?.id ?? "" : "");
    let heldType = heldId ? this.itemTypes.get(heldId) ?? null : null;
    // giant items stay in the world (dragged in front of you / carried between two players)
    if (heldType && lootDef(heldType).size === "giant") heldType = null;
    this.viewmodel.setHeld(heldType, heldType ? lootDef(heldType).size : "big");
    if (this.chargeStart) {
      if (!this.activeItem(inv)) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); }
      this.viewmodel.setCharge(this.chargeStart ? Math.min(1, (performance.now() - this.chargeStart) / 1000 / CHARGE_TIME) : 0);
    }

    const mantleFrac = cur.mantleT > 0 && this.mantleTotal > 0 ? 1 - cur.mantleT / this.mantleTotal : 0;
    this.viewmodel.update(dt, pose, hs, this.input.yaw, this.input.pitch, reduced, mantleFrac);

    this.remotes.update(now, dt);
    const myId = this.myId;
    const hand = inv.hand;
    this.items.update(now, dt, {
      myId,
      inMyHands: (id) => (id === hand || id === heldId) && !!heldType,
      anchorOf: (pid) => pid === myId ? { x: this.cur.x, y: this.cur.y, z: this.cur.z, yaw: this.cur.yaw } : this.remotes.anchor(pid) ?? this.npcAnchor(pid),
      cam: this.camera.position,
    });
    this.npcs.update(now, dt, this.camera);
    this.events.update(this.match, dt);
    this.propsR.update(dt);
    this.cars.update(dt);
    this.copCars.update(dt);
    this.jailScreen(dt);
    this.sirenSounds(dt);
    this.trafficSounds(dt);
    this.matchSounds(dt);
    this.updateLookTarget();
    this.updateUseTarget();
    this.updatePunchTarget(inv.hand);
    this.updatePuffs(dt);
    this.updatePops(dt);
  }

  /** Throw power 0..1 while winding up (for the HUD), else -1. */
  get throwCharge(): number {
    if (this.robT >= 0) return Math.min(1, this.robT / ROB_TIME);
    return this.chargeStart ? Math.min(1, (performance.now() - this.chargeStart) / 1000 / CHARGE_TIME) : -1;
  }

  /** Sounds + one-off effects triggered by movement changes (only for real steps, never replays). */
  private feel(inp: MoveInput) {
    const s = this.cur;
    const pose = movePose(s);
    const last = this.lastPose;
    if (pose !== last) {
      if (pose === "slide") { sfx.slide(); this.addTrauma(0.2); this.viewmodel.kick(0.4); }
      if (pose === "dodge") { sfx.dodge(); this.addTrauma(0.15); }
      if (pose === "mantle") { sfx.mantle(this.voicePitch); this.mantleTotal = s.mantleT; }
      if (pose === "stumble") { sfx.stumble(); this.addTrauma(0.6); }
      if (last === "mantle") { this.viewmodel.kick(0.5); this.camDip.kick(-0.6); }
    }
    this.lastPose = pose;
    if (this.wasGrounded && !s.grounded && s.vy > 0 && pose !== "mantle" && pose !== "dodge") sfx.jump();
    if (!this.wasGrounded && s.grounded && last !== "mantle") {
      const impact = Math.abs(this.lastVy);
      if (impact > 9) { sfx.heavyLand(); this.addTrauma(Math.min(0.7, impact / 25)); } else sfx.land(impact);
      this.viewmodel.kick(Math.min(1.2, impact * 0.08));
      this.camDip.kick(-Math.min(1.6, impact * 0.12));
    }
    if (s.winded && !this.wasWinded) sfx.winded(this.voicePitch);
    this.wasWinded = s.winded;
    this.wasGrounded = s.grounded;
    this.lastVy = s.vy;
    const hs = horizontalSpeed(s);
    if (s.grounded && hs > 0.5 && pose !== "slide") {
      this.stepDist += hs * SIM_DT;
      const kind = s.crouching ? "sneak" : pose === "sprint" ? "sprint" : "walk";
      const stride = kind === "sprint" ? 2.5 : kind === "sneak" ? 1.3 : 1.9;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        sfx.step(kind);
      }
    }
    void inp;
  }

  private addTrauma(t: number) { this.trauma = Math.min(1, this.trauma + t); }

  hud(): HudState {
    return { stamina: this.cur.stamina, winded: this.cur.winded, dodgeReady: this.cur.dodgeCd <= 0 && this.cur.dodgeT <= 0 && this.cur.stamina >= PLAYER.dodgeStamina, pose: movePose(this.cur) };
  }

  /** Test-only (solo, ?test=1): place the player somewhere. */
  debugTeleport(x: number, z: number, yaw: number) {
    this.cur = makeMoveState(x, z, yaw);
    this.prev = cloneMoveState(this.cur);
    this.input.yaw = yaw;
    this.input.pitch = 0;
  }

  get moveState() { return cloneMoveState(this.cur); }

  remotePose(id: string) { return this.remotes.poseOf(id); }

  remoteCount() { return this.remotes.count(); }

  /** Test/debug: how many pedestrians exist and how many are drawn (not distance-culled). */
  npcStats() { return { total: this.npcs.count(), visible: this.npcs.visibleCount() }; }
  npcDrawnPos(id: string) { return this.npcs.pos(id); }
  carCount() { return this.cars.count(); }
  carPositions() { return this.cars.positions(); }

  dispose() {
    this.stopChargeTone?.();
    this.input.onAction = null;
    this.input.jailKeys = null;
    this.input.jailMouse = null;
    this.input.setFrozen(false);
    this.lock.root.remove();
    this.copCars.dispose();
    this.items.dispose();
    this.npcs.dispose();
    this.events.dispose();
    this.propsR.dispose();
    this.cars.dispose();
    this.remotes.dispose();
    this.scene.dispose();
  }
}
