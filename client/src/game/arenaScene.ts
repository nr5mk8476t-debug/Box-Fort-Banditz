// The playable city, first-person. (Art is placeholder-quality; systems are real.)
// Your own movement is simulated immediately in the browser ("prediction") using the
// exact same rules as the server. When the server's answer arrives we quietly correct
// any difference ("reconciliation"), smoothing small corrections so you never feel a snap.
import {
  Scene, Engine, UniversalCamera, Camera, HemisphericLight, DirectionalLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, Mesh, TransformNode, StandardMaterial,
} from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured } from "./look.ts";
import { FpInput, type LootAction } from "./input.ts";
import { RemotePlayers, type RemoteInfo, type CarryKind } from "./remotePlayers.ts";
import { Viewmodel } from "./viewmodel.ts";
import { Spring } from "./spring.ts";
import { CityRenderer } from "./cityRenderer.ts";
import { RaidAlert } from "../ui/raidAlert.ts";
import { ItemRenderer } from "./itemRenderer.ts";
import { NpcRenderer } from "./npcRenderer.ts";
import { EventRenderer, DragonRenderer } from "./eventRenderer.ts";
import { PropRenderer } from "./propRenderer.ts";
import { CarRenderer } from "./carRenderer.ts";
import { CopCarRenderer } from "./copCarRenderer.ts";
import { LockpickUI } from "./lockpickUI.ts";
import { NightRenderer } from "./nightRenderer.ts";
import {
  inDeepWater, makeMoveState, cloneMoveState, stepMovement, readMoveState, movePose, horizontalSpeed, lootDef,
  throwSpeed, throwVelocity, GRAB_RANGE_CLIENT, POCKETS, FISTS, NPC_DEFS, fortAt, PLAYER_COLOR_NAMES, ROUNDS, ROB_TIME, PROP_RADIUS, USE_RANGE, SMASHABLE, SEARCHABLE, LOBBY_GAMES, inLobby, setBoxOff, propSurfaceDist, propNearest, nearBoxes, TAG, OPEN_TIME, PARADE, HOLD_TIME, KEYCARD_TIME, ARREST, RESTO_USE, RESTO, CLUB, CLUB_USE, PAWN_SHOP, applyClubFloor, clubStage, type PropDef,
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
  // C4a: things you can smash
  shopglass: "Shop Window", busstop: "Bus Stop", hydrant: "Fire Hydrant", mailbox: "Mailbox", bench: "Bench", planter: "Planter", table: "Table", pallet: "Pallet",
  // C4b: the laundromat
  washer: "Washing Machine", dryer: "Dryer",
  // C5a: the lobby squat
  dummy: "Practice Dummy", throwgame: "THROW-O-MATIC", racegame: "TROLLEY GRAND PRIX",
  // C5b: Chinatown's stalls
  steamer: "Dumpling Steamer", trinkets: "Souvenir Stall", fishtank: "Seafood Tank",
  // C5c: Uptown's landmarks
  vaultdoor: "the Vault Door", depositbox: "Safety Deposit Box", nose: "the Mayor's Gold Nose", stash: "a Loose Brick",
  podium: "the Maitre d's Podium", cloakroom: "the Cloakroom", dessertcart: "the Dessert Trolley", piano: "the Grand Piano", chefstable: "the Chef's Table", kitchen: "the Stove",
  // C5c.3: THE COMPACTOR and PAWN-O-RAMA
  clubrope: "Big Crunch's Rope", djdecks: "the DJ's Decks", clubbar: "the Conveyor Bar", clubsafe: "the Club Safe", rider: "the DJ's Rider", lockers: "the Staff Lockers", sortbin: "the Sorting Bin", vipbooth: "the VIP Booth",
  pawncounter: "Sal's Counter", pawncase: "the Pawn Case",
};

/** Round loop + event state for the HUD (read from the server / solo world). */
export interface MatchHud {
  phase: string; round: number; rounds: number; timeLeft: number; results: string;
  evKind: string; evStage: string; evX: number; evZ: number; evR: number; evT: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
  lightT?: number;
  paradeD?: number;
  /** C5c.3: when THE COMPACTOR's last DROP started (same clock as lightT) */
  clubB?: number;
}
export interface ScoreLine { id: string; name: string; colorIdx: number; cash: number; bank: number; connected: boolean; me: boolean; }
/** Where home is, relative to where you're looking. */
export interface HomeInfo { inside: boolean; dist: number; bearing: number; }

/** Full-screen effects main.ts draws in HTML (camera flash, pigeon swarm, knocked-down vignette). */
export type ScreenFx = "flash" | "swarm" | "knocked" | "zap" | "hurt";

/** Your inventory as displayed (server truth + instant local feedback). */
export interface Inventory { hand: string; pockets: string[]; sel: number; }

const CHARGE_TIME = 0.8; // seconds to full throw power
const HEAVE_TIME = 1.4; // giant items: a slow, clumsy wind-up
const PUNCH_CD_MS = 550; // matches the server's punch cooldown (the server has the final say)
const PUNCH_REACH = 2.2;
/** Gibberish voice pitch per pedestrian type. */
const NPC_VOICE: Record<string, number> = {
  tourist: 1.15, businessman: 0.8, influencer: 1.45, jogger: 1.1, gym_bro: 0.62, mall_cop: 0.75, mime: 1.0, pigeon_lady: 1.3, doorman: 0.7, fisherman: 0.75, bouncer: 0.5, vinnie: 0.62,
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

/** Rough place name for announcements (C1 districts). */
function areaName(x: number, z: number): string {
  if (Math.hypot(x, z) < 30) return "the Park";
  if (z < -90) return "Tent Town";
  if (x < -95) return "the rail yard";
  if (x > 95) return "the canal";
  if (z > 46) return "Uptown";
  if (z < -46) return "The Yards";
  return x < 0 ? "Old Brick" : "Market Row";
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
  /** C5a: had a server position yet? */
  private synced = false;
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
  private serverInv: Inventory = { hand: "", pockets: ["", "", ""], sel: FISTS };
  private optimistic: (Inventory & { until: number }) | null = null;
  private itemTypes = new Map<string, string>();
  private itemViews = new Map<string, { value: number; mode: string; holder: string; holder2: string; lock: number; fort: number; mult: number; tug: number; uses: number }>();
  // Phase 5A: night, tug of war, pawn shop, fort view
  private night: NightRenderer;
  /** C4b: the old lady leaning out of her window, shaking her fist (for a few seconds) */
  private windowFigure(x: number, y: number, z: number, yaw: number) {
    const sc = this.scene, node = new TransformNode("oldLadyWindow", sc);
    node.position.set(x + Math.sin(yaw) * 0.25, y, z + Math.cos(yaw) * 0.25);
    node.rotation.y = yaw;
    const part = (m: Mesh, col: string) => { m.parent = node; m.material = toon(sc, col); ink(m, 0.02); m.isPickable = false; return m; };
    part(MeshBuilder.CreateBox("olbody", { width: 0.6, height: 0.6, depth: 0.35 }, sc), "#9f5fd6").position.y = -0.3;
    part(MeshBuilder.CreateSphere("olhead", { diameter: 0.4, segments: 8 }, sc), "#f0c8a0").position.y = 0.2;
    part(MeshBuilder.CreateSphere("olcurlers", { diameter: 0.44, segments: 6, slice: 0.5 }, sc), "#ff8fa3").position.y = 0.25;
    const fist = part(MeshBuilder.CreateSphere("olfist", { diameter: 0.16, segments: 6 }, sc), "#f0c8a0");
    fist.position.set(0.35, 0.25, 0.1);
    const t0 = performance.now();
    const shake = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - t0) / 1000;
      fist.position.y = 0.25 + Math.sin(t * 18) * 0.08;
      if (t > 3.5) { this.scene.onBeforeRenderObservable.remove(shake); node.dispose(false, true); }
    });
    this.pop("OI!", x, y + 0.8, z, "#ff5a3c");
  }

  /** C4b: a blank wall under the crosshair while you've got a spray can out; the tag being held */
  tagTarget: { x: number; y: number; z: number; nx: number; nz: number } | null = null;
  private tagHold: { t0: number; x: number; z: number; target: { x: number; y: number; z: number; nx: number; nz: number } } | null = null;
  /** C4b: the progress ring is for a washer/dryer (not a till) */
  openingMachine = false;
  /** C5c: a long hold in progress (drilling the vault, prising the nose, hacking the screen): its kind and length */
  holdKind = ""; holdTime = 0; private holdArmed = false;
  /** C4b: tags left in the can you have out (-1: no can) */
  canUses = -1;

  private updateTagging(inv: Inventory) {
    const a = this.activeItem(inv);
    const isCan = !!a && this.itemTypes.get(a.id) === "spray_can";
    this.canUses = isCan ? (this.itemViews.get(a!.id)?.uses ?? TAG.uses) : -1;
    this.tagTarget = null;
    if (isCan && this.canUses > 0 && !this.lookTarget && !this.useTarget && this.cur.knockT <= 0) this.tagTarget = this.wallHit();
    const h = this.tagHold;
    if (!h) return;
    if (!isCan || Math.hypot(this.cur.x - h.x, this.cur.z - h.z) > 0.5) { this.tagHold = null; sfx.sprayStop(); return; }
    if (performance.now() - h.t0 >= TAG.hold * 1000) {
      const t = h.target;
      this.tagHold = null;
      sfx.sprayStop();
      this.onAction?.({ a: "tag", x: t.x, y: t.y, z: t.z, nx: t.nx, nz: t.nz });
    }
  }

  /** C4b: where the crosshair meets a wall you could spray (a building, wall or fence face, in reach). */
  private wallHit(): { x: number; y: number; z: number; nx: number; nz: number } | null {
    const cam = this.camera.position, yaw = this.input.yaw, pitch = this.input.pitch;
    const dx = Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
    let best: { t: number; x: number; y: number; z: number; nx: number; nz: number } | null = null;
    for (const b of nearBoxes(this.arena, cam.x, cam.z, TAG.reach + 1)) {
      if (!["building", "tower", "wall", "fence"].includes(b.kind) || b.off) continue;
      // ray vs the box's four side faces
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const fx = b.x + nx * b.w / 2, fz = b.z + nz * b.d / 2;
        const den = nx ? dx * nx : dz * nz;
        if (den >= -1e-3) continue; // facing away
        const t = nx ? (fx - cam.x) / dx : (fz - cam.z) / dz;
        if (t <= 0 || t > TAG.reach + 0.6) continue;
        const x = cam.x + dx * t, y = cam.y + dy * t, z = cam.z + dz * t;
        if (nx ? Math.abs(z - b.z) > b.d / 2 - 0.3 : Math.abs(x - b.x) > b.w / 2 - 0.3) continue;
        if (y < b.y - b.h / 2 + 0.3 || y > b.y + b.h / 2 || y < this.cur.y + 0.4 || y > this.cur.y + 2.5) continue;
        if (!best || t < best.t) best = { t, x, y, z, nx, nz };
      }
    }
    if (!best || Math.hypot(best.x - this.cur.x, best.z - this.cur.z) > TAG.reach) return null;
    return { x: best.x, y: best.y, z: best.z, nx: best.nx, nz: best.nz };
  }

  /** C4a: the layout this screen collides with (tests) */
  get arenaLayout() { return this.arena; }
  /** C4a: breakable prop id -> its arena box */
  private brkBox = new Map<string, number>();
  /** C3: how long building the city's meshes took (perf tests) */
  cityBuildMs = 0;
  /** the static city (Slice 2A: interiors drawn only near the camera) */
  readonly city: CityRenderer;
  private wires: { m: Mesh; t: number }[] = [];
  /** tug of war you're in: balance from YOUR side (+1 = you win), or null */
  tug: { balance: number; rival: string } | null = null;
  /** pawn shop results (main.ts plays the reaction) */
  onPawn: ((e: { item: string; r: string; offer: number }) => void) | null = null;
  /** upgrades round: look at your fort instead of through your eyes */
  fortView = false;
  /** test/screenshot hook (Slice 2A): put the camera anywhere (null = normal first-person view) */
  camOverride: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;

  // Phase 3: round loop
  match: MatchHud = { phase: "lobby", round: 0, rounds: ROUNDS, timeLeft: 0, results: "[]", evKind: "", evStage: "", evX: 0, evZ: 0, evR: 0, evT: 0, truckOn: false, truckX: 0, truckZ: 0, truckYaw: 0, lightT: 0, paradeD: -1, clubB: -999 };
  scores: ScoreLine[] = [];
  myColorIdx = 0;
  private events: EventRenderer;
  /** test/screenshot hook (C5b): pretend it's night (lanterns, lamps) */
  forceNight = false;
  /** C5b: the dragon parade in Chinatown */
  private dragon: DragonRenderer | null = null;
  private drumT = 0;
  /** C1: red screen edge + arrow home while your fort is being raided */
  readonly raidAlert = new RaidAlert();
  private lastTickSec = -1;
  private rumbleT = 0;
  // Phase 3.5: props, traffic, hold-ups, wipeouts
  private propsR: PropRenderer;
  private cars: CarRenderer;
  private copCars: CopCarRenderer;
  /** Phase 4 jail: the lock-picking screen (shown while you're locked up) */
  readonly lock: LockpickUI;
  jailT = 0;
  /** Phase 5A: my pawn shop offers (JSON), READY pressed */
  shopJson = "";
  ready = false;
  lockSeed = 0;
  lockT = 0;
  private sirenT = 0;
  private copNoticeT = 0;
  private playerNames = new Map<string, string>();
  /** C5c.1: the other bandits as the last snapshot had them (heat for the map, knocked-down for citizen's arrests) */
  readonly others = new Map<string, { name: string; colorIdx: number; x: number; y: number; z: number; heat: number; knockT: number; pinBy: string; jailT: number }>();
  /** C5c.1: a knocked-down wanted bandit in reach (E = hold them for the cops); who I'm holding, who's holding me */
  arrestTarget: { id: string; name: string; bounty: number } | null = null;
  pinOn = ""; pinBy = ""; pinS = 0;
  private sirens = new Map<string, Mesh>();
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
  /** C5c.3: my cash and aura (prompts at Big Crunch's rope and Sal's counter) */
  myCash = 0; myAura = 0;
  /** C5c.3: the club clock (the city clock, run on locally between snapshots) and the pawn case's contents */
  private clubClock = 0; private clubLastLightT = -1;
  pawnCase: { t: string; c: number; o: string; p: number; s: number; v: number }[] = [];
  /** 5A.1: my health 0..100 */
  hp = 100;
  private firstWorld = true;
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

    const tCity = performance.now();
    this.city = new CityRenderer(scene, this.arena, shadows, { detail: !settings.lowGraphics }); // (C2: Performance mode skips small façade detail)
    this.cityBuildMs = performance.now() - tCity;
    this.night = new NightRenderer(scene, this.arena, hemi, sun, cam);
    // Only the static city casts shadows, so draw the shadow map once instead of every frame
    const sm = shadows?.getShadowMap();
    if (sm) sm.refreshRate = 0; // RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    this.items = new ItemRenderer(scene, this.arena);
    this.npcs = new NpcRenderer(scene);
    { const ps = arena.pawnShop, sh = ps ? arena.shops?.find((x) => x.id === ps.shop) : undefined; if (sh) this.npcs.salAt = { x: sh.cashier.x, z: sh.cashier.z }; } // (C5c.3)
    this.events = new EventRenderer(scene);
    if (this.arena.chinatown) this.dragon = new DragonRenderer(scene, this.arena.chinatown.route, { n: PARADE.segments, gap: PARADE.gap });
    this.propsR = new PropRenderer(scene, this.arena.props ?? []);
    for (const pd of this.arena.props ?? []) if (pd.box !== undefined) this.brkBox.set(pd.id, pd.box);
    this.propsR.wallArt(this.arena); // (C4b: graffiti round the lower city)
    this.cars = new CarRenderer(scene);
    this.copCars = new CopCarRenderer(scene);
    this.lock = new LockpickUI(document.getElementById("hud") ?? document.body);
    this.lock.onPress = (pin, t) => this.onAction?.({ a: "pick", pin, t });
    input.jailKeys = (code) => this.lock.key(code);
    input.jailMouse = (dx, dy) => this.lock.mouse(dx, dy);

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
    this.clubFloorNow();
    for (const inp of this.pending) stepMovement(s, inp, this.arena);
    const ex = before.x - s.x, ey = before.y - s.y, ez = before.z - s.z;
    const err = Math.hypot(ex, ey, ez);
    this.stats.lastError = err;
    const wasSynced = this.synced;
    this.synced = true;
    if (err > 1e-4) {
      this.stats.corrections++;
      if (err > 2.5) {
        // Too big to hide (e.g. after a reconnect): snap. (C5a: the very first word from the host places
        // you, e.g. on the squat's roof in the lobby: that's arriving, not a prediction miss)
        this.correction.set(0, 0, 0);
        if (wasSynced) this.stats.snaps++;
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
      this.itemViews.set(id, { value: it.value, mode: it.mode, holder: it.holder, holder2: it.holder2, lock: it.lock ?? 0, fort: it.fort ?? -1, mult: it.mult ?? 1, tug: (it as any).tug ?? 0, uses: (it as any).uses ?? -1 });
    });
    this.items.retain(itemIds);
    for (const id of [...this.itemTypes.keys()]) if (!itemIds.has(id)) { this.itemTypes.delete(id); this.itemViews.delete(id); }

    // round loop + event state
    const mv = view as unknown as Record<string, any>;
    for (const k of Object.keys(this.match) as (keyof MatchHud)[]) if (mv[k] !== undefined) (this.match as any)[k] = mv[k];
    const isNight = this.match.phase === "dusk" || this.match.phase === "night";
    this.night.night = isNight || this.forceNight;
    this.npcs.night = isNight;
    if (this.firstWorld) { this.firstWorld = false; this.night.snap(); }
    const scores: ScoreLine[] = [];
    view.players.forEach((p, id) => {
      this.playerNames.set(id, p.name);
      scores.push({ id, name: p.name, colorIdx: p.colorIdx, cash: p.cash ?? 0, bank: p.bank ?? 0, connected: p.connected, me: id === myId });
      if (id === myId) this.myColorIdx = p.colorIdx;
    });
    this.scores = scores.sort((a, b) => b.cash + b.bank - (a.cash + a.bank));
    { // C5c.1: everyone else's heat (the M map's WANTED pins) and who's lying flat nearby (citizen's arrest)
      this.others.clear();
      view.players.forEach((p, id) => {
        if (id === myId || !p.connected) return;
        this.others.set(id, { name: p.name, colorIdx: p.colorIdx, x: p.x, y: p.y, z: p.z, heat: p.heat ?? 0, knockT: p.knockT ?? 0, pinBy: p.pinBy ?? "", jailT: p.jailT ?? 0 });
      });
    }

    view.players.forEach((p, id) => {
      if (id === myId) {
        this.reconcile(p as ServerPlayerView);
        this.serverInv = { hand: p.hand ?? "", pockets: [p.p0 ?? "", p.p1 ?? "", p.p2 ?? ""], sel: p.sel ?? FISTS };
        this.heat = p.heat ?? 0;
        this.hp = p.hp ?? 100;
        this.myCash = p.cash ?? 0; this.myAura = p.aura ?? 0; // (C5c.3: the club's door, Sal's counter)
        this.respawnT = p.respawnT ?? 0;
        this.robT = p.robT ?? -1;
        if (this.robT < 0 && this.holdKind && this.holdArmed) this.holdKind = ""; // (C5c: the hold ended)
        this.holdArmed = this.robT >= 0;
        this.jailT = p.jailT ?? 0;
        this.pinOn = p.pinOn ?? ""; this.pinBy = p.pinBy ?? ""; this.pinS = p.pinS ?? 0;
        this.lockSeed = p.lockSeed ?? 0;
        this.lockT = p.lockT ?? 0;
        this.shopJson = p.shop ?? "";
        this.ready = !!p.ready;
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
    view.props?.forEach((pv, id) => {
      this.propsR.sync(id, pv); this.propState.set(id, pv.ready);
      if (pv.note !== undefined && id.startsWith("pawncase")) { try { this.pawnCase = pv.note ? JSON.parse(pv.note) : []; } catch { this.pawnCase = []; } } // (C5c.3)
      // C4a: smashed things vanish and stop blocking (repaired at dawn)
      const bd = this.brkBox.get(id);
      if (bd !== undefined) { this.propsR.syncBreakable(id, pv.ready); this.city.setBroken(id, !pv.ready); setBoxOff(this.arena, bd, !pv.ready); }
    });
    this.propsR.syncTags(view.tags); // (C4b)
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
              this.onFeedback?.(e.reason === "taken" ? "Too slow!" : e.reason === "far" ? "Can't reach!" : e.reason === "locked" ? "Banked in a fort. Locked until NIGHT!" : e.reason === "full" ? "Pockets full!" : "Hands full!", "bad");
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
          if (e.p === me) {
            sfx.lost();
            this.onFeedback?.(e.unsold ? `${e.count} unsold item${e.count > 1 ? "s" : ""} went in the dumpster.` : `You lost ${e.count} item${e.count > 1 ? "s" : ""}. Get home before time's up!`, "bad");
          }
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
        // ---- C4b: tags, the old lady ----
        case "tag": {
          if (e.p === me) { this.onFeedback?.(`+1 AURA!${e.left > 0 ? ` (${e.left} tag${e.left > 1 ? "s" : ""} left in the can)` : " (that was the last of the paint)"}`, "good"); sfx.cash(); }
          break;
        }
        case "tagStart": {
          if (e.p !== me) { const a = this.remotes.anchor(e.p); if (a) { const g = gainAt(a.x, a.y + 1.4, a.z); if (g > 0.15) sfx.spray(g); } }
          break;
        }
        case "oldLady": {
          const post = (this.arena.posts ?? []).find((q) => q.kind === "old_lady");
          const w = post?.window;
          if (w) {
            const g = gainAt(w.x, w.y, w.z);
            if (g > 0.05) sfx.oldLady(Math.min(1, g * 1.4));
            this.windowFigure(w.x, w.y, w.z, post!.yaw);
          }
          if (e.p === me) this.onFeedback?.("You woke up the old lady! She's calling the cops...", "bad");
          break;
        }
        case "search": {
          const d = this.propsR.def(e.prop) ?? (this.arena.props ?? []).find((x) => x.id === e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.1) sfx.search(g); if (e.raccoon && g > 0.1) sfx.chitter(g); }
          if (e.p === me) this.onFeedback?.(e.raccoon ? "A RACCOON jumped out!" : `Found ${e.found} thing${e.found > 1 ? "s" : ""}!`, e.raccoon ? "bad" : "good");
          break;
        }
        case "smash": {
          const d = this.propsR.def(e.prop) ?? (this.arena.props ?? []).find((x) => x.id === e.prop);
          const x = e.x ?? d?.x ?? 0, z = e.z ?? d?.z ?? 0;
          if (d) {
            const g = gainAt(x, 1, z);
            if (e.kind === "dummy") { this.propsR.wobble(e.prop); if (g > 0.1) { sfx.smash("bench", g * 0.6); this.pop(["THWACK!", "OOF!", "BOING!", "POW!"][Math.floor(Math.random() * 4)], x, d.y + 2.2, z, "#ff8fa3"); } break; }
            if (g > 0.1) { sfx.smash(e.kind, g); this.pop(e.kind === "car" ? "SMASH!" : e.broke ? (e.kind === "shopglass" || e.kind === "busstop" ? "SHATTER!" : "CRUNCH!") : "CLANG!", x, 2.2, z, "#ffe14a"); }
            if (d.box !== undefined) this.propsR.burst(e.kind, x, z, !!e.broke);
          }
          break;
        }
        case "empty": if (e.p === me) this.onFeedback?.("Nothing left in there. It refills later.", "info"); break;
        // C5b: Chinatown
        case "firecracker": { this.dragon?.firecracker(e.x, e.z); const g = gainAt(e.x, 1, e.z); if (g > 0.05) sfx.firecracker(g); break; }
        case "stallYell": if (e.p === me) this.onFeedback?.("\"HEY! You pay for that!\" (the stall keeper saw: +heat)", "bad"); break;
        // C5c: Uptown's landmarks
        case "drill": { const d = this.propsR.def(e.prop); if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.drill(g); this.propsR.sparks(d.x, d.z - 0.4); } break; }
        case "vault": {
          const d = this.propsR.def(e.prop); if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.vault(g); }
          if (e.p === me) this.onBanner?.("THE VAULT IS OPEN!", e.quiet ? "Nobody heard a thing. Grab the gold and walk out calmly." : "Grab the gold and RUN!", "good");
          break;
        }
        case "nose": if (e.p === me) { sfx.cash(); this.onFeedback?.("You prised off the Mayor's GOLD NOSE!", "good"); } break;
        case "stashFound": {
          const d = this.propsR.def(e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.stash(g); this.pop("GOLDEN STASH!", d.x, d.y + 1.6, d.z, "#ffd54a"); }
          if (e.p === me) this.onFeedback?.("A GOLDEN STASH! Every landmark hides one...", "good");
          break;
        }
        // C5c.2: LE DUMPSTÈRE
        // C5c.3: THE COMPACTOR
        case "cover": if (e.p === me) { sfx.cash(); this.onBanner?.(e.vip ? "VIP. GO ON IN." : "STAMPED!", e.vip ? "Big Crunch nods. No charge for somebody like you (until dawn)." : `$${e.paid} cover paid. You're in till dawn. (It all goes in the manager's safe...)`, "good"); } break;
        case "coverNo": if (e.p === me) this.onFeedback?.(e.reason === "broke" ? `"Fifteen bucks." You haven't got $${CLUB.cover}. (Money you've sold loot for counts. Or get ${CLUB.vipAura} aura and be somebody.)` : "You're already stamped. Go on in!", "info"); break;
        case "clubDrop": {
          const c = this.arena.club;
          if (c) {
            const x = (c.floor.minX + c.floor.maxX) / 2, z = (c.floor.minZ + c.floor.maxZ) / 2, g = gainAt(x, 1, z);
            if (g > 0.03) sfx.clubDrop(g);
            this.city.clubBurst();
            if (g > 0.15) this.pop(e.by && e.by === me ? "YOUR DROP!" : "THE DROP!", x, 4.5, z, "#ff3cac");
            if (Math.hypot(this.cur.x - x, this.cur.z - z) < 6 && this.cur.y < CLUB.top + 1) this.addTrauma(0.5);
          }
          break;
        }
        case "djHijack": {
          const d = this.propsR.def(e.prop); if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.scratch(g); this.pop("WIKKA WIKKA!", d.x, d.y + 1.2, d.z, "#43c7a6"); }
          if (e.p === me) this.onBanner?.("YOU'RE THE DJ!", `+${CLUB.djAura} aura. The crowd ROARS. The drop is coming... (everyone on the crusher goes flying)`, "good");
          else this.onFeedback?.(`${this.nameOf(e.p) ?? "Somebody"} hijacked the decks at THE COMPACTOR!`, "info");
          break;
        }
        case "safeCracked": {
          const d = this.propsR.def(e.prop); if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.vault(g); }
          if (e.p === me) this.onBanner?.("SAFE CRACKED!", `$${e.value} of tonight's takings in one fat bag. The alarm's going, Big Crunch is coming: RUN.`, "good");
          break;
        }
        // C5c.3: PAWN-O-RAMA
        case "fenced": if (e.p === me) { sfx.cash(); this.onFeedback?.(`"Pleasure doing business." Sal paid $${e.cash} for the ${lootDef(e.type).name}. No questions asked.`, "good"); } break;
        case "pawned": if (e.p === me) { sfx.cash(); this.onBanner?.("PAWNED", `$${e.cash} now for the ${lootDef(e.type).name}. Buy it back before dawn, or it goes on sale to anybody.`, "good"); } break;
        case "redeemed": if (e.p === me) { sfx.cash(); this.onFeedback?.(e.sale ? `Bought the ${lootDef(e.type).name} off the sale shelf for $${e.cash}.` : `Got your ${lootDef(e.type).name} back ($${e.cash}).`, "good"); } break;
        case "pawnNo": if (e.p === me) { sfx.full(); this.onFeedback?.(e.reason === "hands" ? "Sal squints at your empty hands. \"What, you selling air?\" (Have something out in your hands.)" : e.reason === "full" ? "The case is full. Come back when somebody's bought something." : e.reason === "broke" ? "You can't afford it. Sal doesn't do credit. (Well. He does pawn.)" : "Nothing of yours in the case (and nothing on sale yet).", "info"); } break;
        case "caseSmashed": {
          const d = this.arena.pawnShop; if (d) { const g = gainAt(d.caseX, 1, d.caseZ); if (g > 0.05) sfx.glass(g); this.pop("SMASH & GRAB!", d.caseX, 2.2, d.caseZ, "#ff3b30"); }
          if (e.p === me) this.onBanner?.("SMASH & GRAB!", "Everything in the case is on the floor. Big Vinnie's coming. Grab and GO.", "bad");
          break;
        }
        case "bounced":
          if (e.p === me && e.reason === "cover") { sfx.offended(); this.onFeedback?.(`"Fifteen bucks, or be somebody." Pay Big Crunch's cover at the rope ($${CLUB.cover}), be a VIP (${CLUB.vipAura}+ aura, or a VIP wristband)... or find another way in. Round the back, maybe.`, "bad"); break; }
          if (e.p === me) { sfx.offended(); this.onFeedback?.(`"Do you have a reservation? No? Out." Book a table ($${RESTO.fee}) at the podium, or come dressed for it (carry something designer)... or try the kitchen door round the back.`, "bad"); }
          break;
        case "seated": if (e.p === me) { sfx.cash(); this.onBanner?.("RIGHT THIS WAY", `Table booked ($${e.paid}). The maitre d' will let you in until dawn.`, "good"); } break;
        case "restoNo": if (e.p === me) this.onFeedback?.(e.reason === "broke" ? `A table's $${RESTO.fee} and you've got less than that. (Money you've sold loot for counts.)` : "You've already got a table. Go on in!", "info"); break;
        case "piano": {
          const d = this.propsR.def(e.prop); if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.05) sfx.piano(g); this.pop("PLINK PLONK!", d.x, 2.4, d.z, "#ffd54a"); }
          if (e.p === me) this.onFeedback?.(`You bashed out a tune on the grand piano. +${RESTO.pianoAura} aura (the diners are appalled)`, "good");
          break;
        }
        case "chefYell": if (e.p === me) { sfx.offended(); this.onFeedback?.("\"OI! Get out of my kitchen!\" (the chef saw: +heat)", "bad"); } break;
        // C5c.1: citizen's arrests
        case "pin": {
          const a = e.target === me ? { x: this.cur.x, y: this.cur.y, z: this.cur.z } : this.remotes.anchor(e.target);
          if (a) { this.pop("CITIZEN'S ARREST!", a.x, a.y + 1.8, a.z, "#6fb3ff"); if (gainAt(a.x, a.y, a.z) > 0.1) sfx.whistle(gainAt(a.x, a.y, a.z)); }
          if (e.p === me) this.onFeedback?.(`Holding ${this.nameOf(e.target) ?? "them"} down for the cops. Don't move! Bounty: $${Math.round(e.heat * ARREST.perHeat)}`, "good");
          else if (e.target === me) this.onBanner?.("PINNED!", `${this.nameOf(e.p) ?? "Someone"} is holding you down for the cops. MASH SPACE to wriggle free!`, "bad");
          break;
        }
        case "pinFail":
          if (e.p === me) this.onFeedback?.(e.reason === "clean" ? "They're not wanted (no stars): no bounty on them." : e.reason === "standing" ? "Knock them down first!" : e.reason === "taken" ? "Someone's already holding them." : e.reason === "lobby" ? "Not up here: nothing counts on the squat." : "Too far away.", "info");
          break;
        case "pinEnd": {
          const why = e.why === "free" ? "wriggled free" : e.why === "rescued" ? "got rescued" : e.why === "moved" ? "got away (you let go)" : e.why === "time" ? "slipped away (the cops took too long)" : "";
          if (e.p === me && why) this.onFeedback?.(`${this.nameOf(e.target) ?? "They"} ${why}!`, "bad");
          else if (e.target === me && why) this.onFeedback?.(e.why === "free" ? "You wriggled free! RUN!" : "You're loose! RUN!", "good");
          break;
        }
        case "bounty": {
          if (e.p === me) { sfx.cash(); this.onBanner?.("BOUNTY PAID!", `$${e.value} for turning in ${this.nameOf(e.target) ?? "a bandit"}${e.value < e.want ? ` (they only had $${e.value} on them)` : ""}`, "good"); }
          else if (e.target === me) this.onBanner?.("TURNED IN!", `${this.nameOf(e.p) ?? "Someone"} held you down for the cops and took $${e.value} of bounty off you.`, "bad");
          else this.onFeedback?.(`${this.nameOf(e.p) ?? "Someone"} turned in ${this.nameOf(e.target) ?? "someone"} for $${e.value}.`, "info");
          break;
        }
        // C5a: the lobby's mini-games
        case "target": {
          this.city.flashTarget(e.target);
          const tg = this.arena.lobby?.targets.find((q) => q.id === e.target);
          if (tg) { this.pop(e.pts === 3 ? "BULLSEYE! +3" : `+${e.pts}`, tg.x - 0.4, tg.y + 0.8, tg.z, e.pts === 3 ? "#b6ff3c" : "#ffe14a"); const g = gainAt(tg.x, tg.y, tg.z); if (g > 0.05) sfx.target(e.pts, g); }
          break;
        }
        case "lobbyGame": {
          if (e.p !== me) break;
          const nm = e.game === "throw" ? "THROW-O-MATIC" : "TROLLEY GRAND PRIX";
          if (e.stage === "start") { sfx.gameStart(); this.onFeedback?.(e.game === "throw" ? `${nm}: 30 seconds! Throw bin lids at the targets!` : `${nm}: grab a trolley and drag it round the 4 cones!`, "info"); }
          else if (e.stage === "cp") { sfx.checkpoint(); { const cp = e.cp ?? 1; this.onFeedback?.(`Checkpoint ${cp - 1} of 3${cp > 3 ? ": now back to the start!" : ""}`, "good"); } }
          else if (e.stage === "done") { sfx.gameDone(); this.onFeedback?.(e.game === "throw" ? `Time! ${e.score} points (best ${e.best})` : `FINISH! ${e.score.toFixed(1)} s (best ${e.best.toFixed(1)} s)`, "good"); }
          else this.onFeedback?.(`${nm}: out of time.`, "bad");
          break;
        }
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
          if (g > 0.08) { sfx.honk(g); sfx.splat(g); }
          this.puff(e.x, 0.4, e.z, 1.5);
          this.pop(["SPLAT!", "BOINK!", "KA-THUNK!", "WHUMP!"][Math.floor(Math.random() * 4)], e.x, 2.0, e.z, "#ff5a3c");
          if (e.p === me) {
            this.addTrauma(1); this.optimistic = null; this.robHeld = false;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            this.onScreenFx?.("knocked", 10);
          }
          break;
        }
        case "respawn": if (e.p === me) { sfx.respawn(); this.onFeedback?.("You peel yourself off the road. Look both ways next time! (3 s grace from traffic)", "info"); } break;
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
          // (Blake, Phase 5A: big shots are never announced or highlighted: spot them yourself)
          if (e.stage === "hit" && e.by === me) this.onFeedback?.(e.kind === "courier" ? "Armored! Keep swinging!" : `You robbed the ${def.name.toLowerCase()}! RUN.`, "good");
          void title; void areaName;
          break;
        }
        case "copCar":
          if (e.p === me && e.stage === "dispatch") { sfx.siren(1); this.onBanner?.("COP CAR INCOMING!", "Max heat. Get off the streets and out of sight!", "bad"); }
          if (e.stage === "deploy" && e.p === me) sfx.cellDoor(); // car doors slam
          break;
        // ---- 5A.1 health
        case "hurt":
          if (e.p === me) { this.hp = e.hp; this.addTrauma(0.35); this.onScreenFx?.("hurt", 0.5); }
          break;
        // ---- Phase 5A
        case "cash":
          if (e.p === me) {
            sfx.cash();
            const p = this.items.drawnPos(e.item) ?? { x: this.cur.x, y: this.cur.y + 1, z: this.cur.z };
            this.pop("+$" + e.value, p.x, p.y + 0.6, p.z, "#7fe07a");
            this.onFeedback?.(`+$${e.value} cash (${lootDef(e.type).name})`, "good");
          }
          break;
        case "splash":
          sfx.splash(gainAt(e.x, 0.3, e.z));
          if (e.p === me) { const t = this.itemTypes.get(e.item); this.onFeedback?.(`SPLASH! Your ${t ? lootDef(t).name : "loot"} floats off. Climb out at a ladder.`, "bad"); }
          break;
        case "raidEnter": {
          // C1: the loud, direct raid alert (the owner), and a siren everyone in Tent Town hears
          const f = this.arena.forts?.find((x) => x.slot === e.slot);
          const raider = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
          if (e.owner === me) {
            sfx.raidAlarm(); sfx.raidSiren(1);
            if (f) this.raidAlert.start(f.x, f.z, 12);
            this.onBanner?.(`${raider.toUpperCase()} IS RAIDING YOUR FORT!`, "They're in your compound. Follow the arrow home!", "bad");
          } else if (e.p === me) {
            const o = this.scores.find((x) => x.id === e.owner)?.name ?? "a rival";
            this.onFeedback?.(`You're in ${o}'s compound. The siren's going: be quick!`, "good");
          } else if (f) {
            const d = Math.hypot(f.x - this.cur.x, f.z - this.cur.z);
            if (d < 80 || this.cur.z < -85) sfx.raidSiren(Math.max(0.25, 1 - d / 120));
          }
          break;
        }
        case "raid":
          if (e.owner === me) {
            sfx.raidAlarm();
            const t = this.itemTypes.get(e.item);
            const raider = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
            const f = this.arena.forts?.find((x) => x.slot === this.myColorIdx);
            if (f) this.raidAlert.start(f.x, f.z, 10);
            this.onBanner?.(`${raider.toUpperCase()} STOLE YOUR ${t ? lootDef(t).name.toUpperCase() : "LOOT"}!`, "Get home and get it back!", "bad");
          }
          else if (e.p === me) { const o = this.scores.find((x) => x.id === e.owner)?.name ?? "a rival"; this.onFeedback?.(`Raiding ${o}'s fort! Their alarm is going off...`, "good"); }
          break;
        case "tug":
          if (e.stage === "start") {
            const it = this.itemViews.get(e.item);
            if (it && (it.holder === me || it.holder2 === me)) { sfx.tugStart(); this.onFeedback?.("TUG OF WAR! Mash E!", "bad"); }
          } else if (e.stage === "win") {
            if (e.winner === me) { sfx.tugWin(); this.onFeedback?.("You won the tug of war!", "good"); }
            else if (e.loser === me) { sfx.lost(); this.addTrauma(0.4); this.onFeedback?.("Lost the tug of war!", "bad"); }
          }
          break;
        case "pawn":
          if (e.p === me) this.onPawn?.({ item: e.item, r: e.r, offer: e.offer });
          break;
        case "taser": {
          const q = this.npcs.pos(e.npc);
          if (e.stage === "aim") {
            if (e.p === me) { sfx.taserAim(); this.onFeedback?.("TASER! Dodge (Q) or get behind something!", "bad"); }
          } else {
            const g = q ? gainAt(q.x, q.y, q.z) : 0;
            if (e.stage === "hit") {
              const tgt = e.p === me ? { x: this.cur.x, y: this.cur.y + 1.1, z: this.cur.z } : this.remotes.anchor(e.p);
              if (q && tgt) this.wire(q.x, q.y + 1.2, q.z, tgt.x, (tgt as any).y + (e.p === me ? 0 : 1.1), tgt.z);
              if (e.p === me) { sfx.zap(1); this.addTrauma(0.7); this.onScreenFx?.("zap", 2); this.onFeedback?.("ZAPPED! You dropped what you were holding.", "bad"); }
              else if (g > 0.1) sfx.zap(g);
            } else if (e.p === me) { sfx.whiff(); this.onFeedback?.("Dodged the taser!", "good"); }
          }
          break;
        }
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
      case "intro": sfx.roundIntro(); this.onBanner?.(`CYCLE ${round} OF ${this.match.rounds}`, "Scavenge by day, raid by night, sell at the pawn shop", "info"); break;
      case "scavenge": sfx.roundStart(); this.onBanner?.("SCAVENGE!", "Bring loot home: it banks in your fort after 10 s", "good"); break;
      case "hurry":
        sfx.hurry();
        if (this.match.phase === "night") this.onBanner?.("15 SECONDS!", "Get home before sunrise!", "bad");
        else this.onBanner?.("30 SECONDS!", "Get home, or lose whatever you're carrying!", "bad");
        break;
      case "dusk": sfx.timeUp(); setTimeout(() => sfx.nightfall(), 600); this.onBanner?.("NIGHT FALLS...", "Scarce loot worth DOUBLE. Forts can be RAIDED. Twice the cops.", "info"); break;
      case "night": sfx.roundStart(); this.onBanner?.("NIGHT SCAVENGE!", "1 minute. Raid a fort or grab the x2 loot. Guard your own!", "good"); break;
      case "dawn": sfx.timeUp(); this.onBanner?.("SUNRISE", "Time to sell your loot at the pawn shop", "info"); break;
      case "shop": sfx.shopBell(); break;
      case "upgrades": sfx.uiClick(); break;
      case "over": sfx.roundIntro(); break;
    }
  }

  private onCityEvent(kind: string, stage: string, detail: string) {
    if (stage === "warn") {
      if (kind === "airdrop") { sfx.plane(); this.onBanner?.("AIRDROP INCOMING!", "A crate is parachuting onto an open square. It takes two to carry.", "good"); }
      if (kind === "truck") { sfx.truckHorn(); this.onBanner?.(`GARBAGE TRUCK: ${detail} ROAD`, "It hoovers up loot and flattens bandits. Move it!", "bad"); }
      if (kind === "happyhour") { sfx.happyHour(); this.onBanner?.("HAPPY HOUR!", `Loot in ${detail} is worth DOUBLE for 30 s. Grab it!`, "good"); }
      if (kind === "raccoons") { sfx.chitter(1); this.onBanner?.("RACCOON HEIST!", "Raccoons are sneaking into the forts. Bonk them!", "bad"); }
      if (kind === "parade") { sfx.gong(); this.onBanner?.("DRAGON PARADE!", "The dragon dances up Chinatown scattering red envelopes of lucky money. Get down there!", "good"); }
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
    if ((m.phase === "scavenge" || m.phase === "night") && m.timeLeft <= 10 && m.timeLeft > 0) {
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
    // Left click with nothing in your hands (fists selected) = punch; with something in your hands = wind up a throw
    if (a === "chargeStart" && src === "mouse" && !this.activeItem(inv)) { this.punch(now); return; }
    if (a === "special") return; // right mouse: reserved for special items (5A.1)
    const hold = 600; // ms the optimistic guess is trusted before the server must confirm
    if (a === "grabEnd") { if (this.tagHold) { this.tagHold = null; sfx.sprayStop(); } return; }
    if (a === "grab" && this.arrestTarget && !this.pinOn) { // (C5c.1: citizen's arrest: beats grabbing whatever's lying there)
      this.onAction?.({ a: "arrest", p: this.arrestTarget.id });
      return;
    }
    // C4b: a spray can out and a blank wall in front of you: hold E to tag it
    if (a === "grab" && this.tagTarget && !this.lookTarget && !this.useTarget && !this.tug) {
      this.tagHold = { t0: now, x: this.cur.x, z: this.cur.z, target: this.tagTarget };
      this.onAction?.({ a: "tagStart" });
      sfx.spray();
      return;
    }
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
    if (a === "grab" && this.tug) { this.onAction?.({ a: "tug" }); sfx.tugPull(); this.viewmodel.kick(0.25); return; }
    if (a === "grab") this.updateLookTarget();
    if (a === "grab" && !this.lookTarget && this.useTarget) {
      const u = this.useTarget;
      if (u.empty) { sfx.full(); this.onFeedback?.(u.kind === "washer" || u.kind === "dryer" ? "Already emptied today." : u.kind === "djdecks" ? "The decks are still warm. Give DJ Crunch a minute." : u.kind === "pawncase" ? "The case is smashed. Sal's boarding it up till dawn." : u.kind === "clubsafe" ? "Cleaned out. The takings start again tomorrow." : "Already searched. It'll refill later.", "info"); return; }
      this.openingMachine = u.kind === "washer" || u.kind === "dryer";
      const ht = HOLD_TIME[u.kind as keyof typeof HOLD_TIME];
      this.holdKind = ht !== undefined ? u.kind : "";
      this.holdTime = u.kind === "vaultdoor" && this.carryingType("bank_keycard") ? KEYCARD_TIME : ht ?? 0;
      if (this.holdKind === "vaultdoor" && this.holdTime === KEYCARD_TIME) this.holdKind = "keycard";
      this.onAction?.({ a: "use", prop: u.id });
      return;
    }
    if (a === "grab") {
      this.updateLookTarget(); // fresh: a slow frame can leave the target pointing at something we already picked up
      const t = this.lookTarget;
      this.logAction("grab-target:" + (t?.id ?? "none"));
      if (!t) return;
      if (t.note.startsWith("LOCKED")) { sfx.full(); this.onFeedback?.("Banked in a fort. Locked until NIGHT!", "info"); return; }
      const size = t.def.size;
      if (t.def.money || size === "giant") {
        // cash goes straight into your wallet (the server confirms with a "cash" event)
      } else if (size === "small" && inv.pockets.includes("")) {
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
      const src = this.anyItem(inv);
      if (!src) return;
      this.optimistic = this.without(inv, src, now + hold);
      sfx.drop();
      this.onAction?.({ a: "drop" });
    } else if (a === "cycleNext" || a === "cyclePrev" || a.startsWith("select")) {
      // wheel / keys 1-4: same rule as the server (fists + filled pockets; locked while holding something big)
      if (inv.hand) { sfx.full(); this.onFeedback?.("Hands full! Drop (G) or throw it first", "bad"); return; }
      let sel = inv.sel;
      if (a.startsWith("select")) {
        const slot = Number(a.slice(6));
        if (slot !== FISTS && !inv.pockets[slot]) { sfx.full(); return; }
        sel = slot;
        this.onAction?.({ a: "select", slot });
      } else {
        const opts = [FISTS, ...[0, 1, 2].filter((i) => inv.pockets[i])];
        const k = Math.max(0, opts.indexOf(inv.sel)), dir = a === "cycleNext" ? 1 : -1;
        sel = opts[(k + dir + opts.length) % opts.length];
        this.onAction?.({ a: "cycle", dir });
      }
      this.optimistic = { ...inv, pockets: [...inv.pockets], sel, until: now + hold };
      sfx.uiHover();
      this.viewmodel.kick(0.15);
    } else if (a === "chargeStart") {
      const src = this.activeItem(inv);
      if (!src) return;
      if (this.tug) return; // (mid tug of war: mash E)
      this.chargeStart = now;
      this.stopChargeTone = chargeTone();
    } else if (a === "chargeEnd") {
      if (!this.chargeStart) return;
      const src0 = this.activeItem(inv), t0 = src0 ? this.itemTypes.get(src0.id) : undefined;
      const charge = Math.min(1, (now - this.chargeStart) / 1000 / (t0 && lootDef(t0).size === "giant" ? HEAVE_TIME : CHARGE_TIME));
      this.chargeStart = 0;
      this.stopChargeTone?.(); this.stopChargeTone = null;
      const src = this.activeItem(inv);
      if (!src) { this.viewmodel.setCharge(0); return; }
      const type = this.itemTypes.get(src.id);
      this.optimistic = this.without(inv, src, now + hold);
      this.onAction?.({ a: "throw", charge, yaw: this.input.yaw, pitch: this.input.pitch });
      this.viewmodel.throwAnim();
      sfx.throw(charge);
      // Predict the flight locally with the same maths the server uses (a giant heave is left to the server)
      if (type && lootDef(type).size !== "giant") {
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

  /** Same rule as the server: what you hold, else the pocket item you have out (fists = nothing). */
  private activeItem(inv: Inventory): { id: string; from: "hand" | number } | null {
    if (inv.hand) return { id: inv.hand, from: "hand" };
    if (inv.sel >= 0 && inv.sel < POCKETS && inv.pockets[inv.sel]) return { id: inv.pockets[inv.sel], from: inv.sel };
    return null;
  }

  /** G drops these one by one: hands / selected first, then any pocket. */
  private anyItem(inv: Inventory): { id: string; from: "hand" | number } | null {
    const a = this.activeItem(inv);
    if (a) return a;
    for (let i = 0; i < POCKETS; i++) if (inv.pockets[i]) return { id: inv.pockets[i], from: i };
    return null;
  }

  private without(inv: Inventory, src: { from: "hand" | number }, until: number): Inventory & { until: number } {
    const pockets = [...inv.pockets];
    if (src.from !== "hand") pockets[src.from] = "";
    return { hand: src.from === "hand" ? "" : inv.hand, pockets, sel: src.from === inv.sel ? FISTS : inv.sel, until };
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
      const night = this.match.phase === "night" || this.match.phase === "dusk";
      if (iv.lock >= 100) note = night ? (iv.fort === this.myColorIdx ? "" : "RAID:" + iv.fort) : "LOCKED:" + iv.fort;
      if (iv.mode === "held") {
        if (this.npcs.kindOf(iv.holder)) continue; // being carried off by a raccoon: bonk it instead
        // a rival dragging a giant item: grab the other end for a tug of war
        if (def.size !== "giant" || iv.holder2 || iv.holder === this.myId) continue;
        note = "TUG";
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
    const best = this.propInFront((d) => SEARCHABLE.has(d.kind) || LOBBY_GAMES.has(d.kind) || RESTO_USE.has(d.kind) || CLUB_USE.has(d.kind) || HOLD_TIME[d.kind] !== undefined, USE_RANGE);
    if (best) this.useTarget = { id: best.id, kind: best.kind, name: PROP_NAMES[best.kind] ?? best.kind, empty: this.propState.get(best.id) === false };
  }

  /**
   * C5c.1 citizen's arrest: a knocked-down bandit with a star, right in front of you = E to hold them for the
   * cops. Held down yourself: SPACE to wriggle. Flashing red and blue over anyone being held.
   */
  private updateArrest(dt: number) {
    this.arrestTarget = null;
    const me = this.cur, yaw = this.input.yaw;
    if (!this.pinOn && me.knockT <= 0 && this.jailT <= 0) {
      let best = Infinity;
      for (const [id, o] of this.others) {
        if (o.knockT <= 0 || o.heat < ARREST.minHeat || o.pinBy || o.jailT > 0) continue;
        const a = o; // (the latest snapshot: the drawn body can trail behind on a slow connection)
        const dx = a.x - me.x, dz = a.z - me.z, d = Math.hypot(dx, dz);
        if (d > ARREST.reach - 0.1 || Math.abs(a.y - me.y) > 1.2) continue;
        let ang = Math.atan2(dx, dz) - yaw;
        while (ang > Math.PI) ang -= Math.PI * 2;
        while (ang < -Math.PI) ang += Math.PI * 2;
        if (Math.abs(ang) > 1.1 && d > 0.8) continue;
        if (d < best) { best = d; this.arrestTarget = { id, name: o.name, bounty: Math.round(o.heat * ARREST.perHeat) }; }
      }
    }
    // the flashing light over anyone being held down (me included)
    const held = new Set<string>();
    for (const [id, o] of this.others) if (o.pinBy) held.add(id);
    if (this.pinBy) held.add("__me");
    const t = performance.now() / 1000;
    for (const id of held) {
      let m = this.sirens.get(id);
      if (!m) {
        m = MeshBuilder.CreateSphere("arrestSiren", { diameter: 0.28, segments: 6 }, this.scene);
        const mat = new StandardMaterial("arrestSiren", this.scene); mat.disableLighting = true; m.material = mat; m.isPickable = false;
        this.sirens.set(id, m);
      }
      const a = id === "__me" ? { x: me.x, y: me.y, z: me.z } : this.remotes.anchor(id) ?? this.others.get(id)!;
      m.position.set(a.x, a.y + 1.1 + Math.sin(t * 4) * 0.05, a.z);
      (m.material as StandardMaterial).emissiveColor = Math.floor(t * 6) % 2 ? Color3.FromHexString("#ff3b30") : Color3.FromHexString("#3b7bff");
      m.setEnabled(id !== "__me");
    }
    for (const [id, m] of this.sirens) if (!held.has(id)) { m.dispose(); this.sirens.delete(id); }
    void dt;
  }

  /** C5c.1: pinned down: each SPACE press (key down, so none are missed on a slow frame) is a wriggle */
  struggle() { if (!this.pinBy) return false; this.onAction?.({ a: "struggle" }); sfx.tugPull(); return true; }

  /** C5c: a player's name (for event messages) */
  nameOf(id: string): string | null { return this.playerNames.get(id) ?? null; }
  /** C5c.3: the club floor follows the city clock (run on locally between snapshots) */
  private clubFloorNow() {
    if (!this.arena.club) return;
    const b = this.match.clubB ?? -999;
    const d = b < -900 ? 1e9 : (((this.clubClock - b) % 600) + 600) % 600;
    applyClubFloor(this.arena, this.clubClock, this.clubClock - d);
  }
  private tickClubClock(dt: number) {
    const lt = this.match.lightT ?? 0;
    if (lt !== this.clubLastLightT) { const ahead = this.clubClock - lt; if (this.clubLastLightT < 0 || Math.abs(ahead) > 0.5) this.clubClock = lt; this.clubLastLightT = lt; }
    else this.clubClock += dt;
  }
  private clubBeatN = -1;
  /** C5c.3: the bass through the walls of THE COMPACTOR (muffled outside, loud inside; quiet during the build-up) */
  private clubBeat() {
    const c = this.arena.club;
    if (!c || settings.muted) return;
    const cx = (c.hall.minX + c.hall.maxX) / 2, cz = (c.hall.minZ + c.hall.maxZ) / 2;
    const inside = c.hall.minX < this.cur.x && this.cur.x < c.hall.maxX && c.hall.minZ < this.cur.z && this.cur.z < c.hall.maxZ;
    const d = Math.hypot(this.cur.x - cx, this.cur.z - cz);
    if (!inside && d > 48) return;
    const n = Math.floor(this.clubClock * CLUB.bpm / 60 * 2);
    if (n === this.clubBeatN) return;
    const first = this.clubBeatN < 0; this.clubBeatN = n;
    if (first) return;
    const g = (inside ? 0.55 : 0.28 * (1 - d / 48)) * (0.6 + this.night.level * 0.4);
    const st = clubStage(this.clubDropT);
    if (st === "build" || st === "hold") { sfx.hat(g * 1.2); if (n % 2 === 0) sfx.hat(g); return; }
    if (n % 2 === 0) sfx.kick(g); else if (inside) sfx.hat(g * 0.8);
  }
  /** C5c.3: where the DROP is right now (seconds since it started building; huge = none) */
  get clubDropT(): number { const b = this.match.clubB ?? -999; return b < -900 ? 1e9 : (((this.clubClock - b) % 600) + 600) % 600; }
  /** C5c.3: what's in the pawn case for me: my own pawned thing (buy back), else the first thing on sale */
  pawnPick(): { type: string; price: number; sale: boolean } | null {
    const mine = this.pawnCase.find((x) => x.o === this.myId && !x.s);
    const s = mine ?? this.pawnCase.find((x) => x.s === 1);
    return s ? { type: s.t, price: s.p, sale: !!s.s } : null;
  }
  get pawnCaseFull() { return this.pawnCase.length >= PAWN_SHOP.caseMax; }
  /** C5c.3: what's out in my hands (for Sal's prompts): type and value */
  heldInfo(): { type: string; value: number } | null {
    const id = this.activeItem(this.inventory)?.id;
    if (!id) return null;
    const type = this.itemTypes.get(id);
    return type ? { type, value: this.itemViews.get(id)?.value ?? 0 } : null;
  }
  /** C5c: am I carrying one of these (hands or pockets)? */
  carryingType(type: string): boolean {
    const inv = this.inventory;
    return !!inv && [inv.hand, ...inv.pockets].some((id) => !!id && this.itemTypes.get(id) === type);
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
      if (d.box !== undefined && this.propState.get(d.id) === false) continue; // (C4a: already smashed)
      const n = propNearest(d, me.x, me.z); // (C4a: long things: aim at the nearest bit)
      const dx = n.x - me.x, dz = n.z - me.z, dist = Math.hypot(dx, dz);
      if (propSurfaceDist(d, me.x, me.z) > reach || Math.abs(d.y - me.y) > 2.2) continue;
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
      this.clubFloorNow();
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
    // (C1.1: floating in the canal: eyes just above the water)
    const swimming = inDeepWater(this.arena, cur.x, cur.z, cur.y);
    const eyeTarget = pose === "knocked" || pose === "tumble" ? 0.35 : swimming ? 0.6 : pose === "slide" ? PLAYER.slideEyeHeight : cur.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
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
    const rollTarget = (pose === "tumble" ? (reduced ? 0.3 : Math.sin(this.time * 9) * 1.1) : 0) + (pose === "knocked" ? (reduced ? 0.2 : 0.55) : 0) + (reduced ? 0 : (pose === "slide" ? 0.05 : 0) - strafe * 0.018 + (pose === "stumble" ? Math.sin(this.time * 18) * 0.05 : 0));
    this.roll += (rollTarget - this.roll) * ease(8);

    const camDip = this.camDip.update(dt);

    // Screen shake: trauma^2 so small bumps stay subtle; scaled by the player's setting
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shakeAmt = reduced ? 0 : this.trauma * this.trauma * settings.screenShake;
    const n = (f: number, o: number) => Math.sin(this.time * f + o) * Math.sin(this.time * f * 0.63 + o * 2.1);
    const shakeP = n(41, 0) * 0.035 * shakeAmt, shakeY = n(37, 3) * 0.035 * shakeAmt, shakeR = n(29, 7) * 0.05 * shakeAmt;

    this.camera.position.set(px, py + this.eye + bob + (reduced ? 0 : camDip), pz);
    // knocked down: you're looking up at the sky from the pavement
    const lieBack = pose === "knocked" ? -0.55 : pose === "tumble" && !reduced ? Math.sin(this.time * 11) * 0.5 : 0; // (D1: cartwheeling after a car hit)
    this.lie += (lieBack - this.lie) * ease(8);
    this.camera.rotation.set(safePitch(this.input.pitch + shakeP + this.lie), this.input.yaw + shakeY, clampAbs(this.roll + shakeR, MAX_ROLL));
    if (this.fortView) this.aimAtFort();
    const co = this.camOverride;
    if (co) { this.camera.position.set(co.x, co.y, co.z); this.camera.rotation.set(co.pitch, co.yaw, 0); }
    this.viewmodel.setVisible(!this.fortView && !co);
    if (!Number.isFinite(this.camera.position.y) || !Number.isFinite(this.camera.rotation.z) || !Number.isFinite(this.camera.rotation.x)) {
      // last line of defence: never leave the camera broken
      this.camera.position.set(px, py + PLAYER.eyeHeight, pz);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
      this.roll = 0; this.trauma = 0;
    }

    // Loot in hands (viewmodel), throw wind-up, look target
    const inv = this.inventory;
    const heldId = this.activeItem(inv)?.id ?? ""; // (the pocket item you have out is drawn in your hand)
    let heldType = heldId ? this.itemTypes.get(heldId) ?? null : null;
    // giant items stay in the world (dragged in front of you / carried between two players)
    if (heldType && lootDef(heldType).size === "giant") heldType = null;
    this.viewmodel.setHeld(heldType, heldType ? lootDef(heldType).size : "big");
    if (this.chargeStart) {
      if (!this.activeItem(inv)) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); }
      this.viewmodel.setCharge(this.chargeStart ? this.throwCharge : 0);
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
    this.night.update(dt);
    this.city.update(this.camera.position.x, this.camera.position.z);
    // C3: the park's pigeons scatter from anyone who comes close (only worth checking near the park)
    if (Math.hypot(this.camera.position.x, this.camera.position.z) < 60) {
      const threats: { x: number; z: number; speed: number }[] = [{ x: this.cur.x, z: this.cur.z, speed: Math.hypot(this.cur.vx, this.cur.vz) }];
      this.remotes.forEachPos((x, z) => { if (Math.abs(x) < 25 && Math.abs(z) < 25) threats.push({ x, z, speed: 0 }); });
      this.npcs.forEachVisible((_id, x, _y, z, _state, kind) => { if (kind !== "pigeon_lady" && Math.abs(x) < 25 && Math.abs(z) < 25) threats.push({ x, z, speed: 0 }); });
      this.city.updatePark(dt, threats);
    }
    // C5a: the squat: its fire, and the view from up there
    this.city.updateLobby(dt);
    this.city.updateUptown(dt);
    // C5c.3: THE COMPACTOR: the crusher bed, the crowd, the lights (only worked out when you're near)
    this.tickClubClock(dt);
    this.city.updateClub(dt, this.clubClock, this.clubDropT, this.night.level, this.camera.position.x, this.camera.position.z);
    this.clubBeat();
    const L = this.arena.lobby;
    this.night.setFarView(L && inLobby(this.arena, this.cur.x, this.cur.z, 3) && this.cur.y > L.y - 4 ? 2.4 : 1);
    this.city.updateLights(this.match.lightT ?? 0);
    this.raidAlert.update(dt, this.camera.position.x, this.camera.position.z, this.camera.rotation.y);
    this.updateWires(dt);
    // tug of war (from my side: +1 = I'm winning)
    const hv = hand ? this.itemViews.get(hand) : undefined;
    if (hv && hv.mode === "held" && hv.holder2 && (hv.holder === myId || hv.holder2 === myId)) {
      this.tug = { balance: hv.holder2 === myId ? hv.tug : -hv.tug, rival: hv.holder2 === myId ? hv.holder : hv.holder2 };
    } else this.tug = null;
    this.events.update(this.match, dt);
    // C5b: the dragon parade, its drum; Chinatown's lanterns glow at night
    if (this.dragon) {
      this.dragon.update(this.match.paradeD ?? -1, dt);
      this.drumT -= dt;
      const hp = this.dragon.headPos;
      if (hp && this.drumT <= 0) { this.drumT = 0.42; const dd = Math.hypot(hp.x - this.cur.x, hp.z - this.cur.z); if (dd < 70) sfx.drum(1 / (1 + dd / 10)); }
    }
    this.city.setNight(this.night.level, dt);
    this.propsR.update(dt);
    this.cars.update(dt);
    this.copCars.update(dt);
    this.jailScreen(dt);
    this.sirenSounds(dt);
    this.trafficSounds(dt);
    this.matchSounds(dt);
    this.updateLookTarget();
    this.updateUseTarget();
    this.updateArrest(dt);
    this.updatePunchTarget(this.activeItem(inv)?.id ?? ""); // (a pocket item out in your hand = a click throws it, no punch prompt)
    this.updateTagging(inv);
    this.updatePuffs(dt);
    this.updatePops(dt);
  }

  /** Throw power 0..1 while winding up (for the HUD), else -1. */
  get throwCharge(): number {
    if (this.robT >= 0) return Math.min(1, this.robT / (this.holdKind ? this.holdTime : this.openingMachine ? OPEN_TIME : ROB_TIME));
    if (this.tagHold) return Math.min(1, (performance.now() - this.tagHold.t0) / 1000 / TAG.hold);
    if (!this.chargeStart) return -1;
    const a = this.activeItem(this.inventory), t = a ? this.itemTypes.get(a.id) : undefined;
    return Math.min(1, (performance.now() - this.chargeStart) / 1000 / (t && lootDef(t).size === "giant" ? HEAVE_TIME : CHARGE_TIME));
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

  /** Upgrades round: a slow orbit around your fort. */
  private aimAtFort() {
    const f = this.arena.forts?.find((x) => x.slot === this.myColorIdx);
    if (!f) return;
    // stand out on the street side of the yard, looking back at the fort
    const ox = f.padX - f.backX, oz = f.padZ - f.backZ, l = Math.max(0.01, Math.hypot(ox, oz));
    const sway = Math.sin(this.time * 0.25) * 0.35;
    const dirx = (ox / l) * Math.cos(sway) - (oz / l) * Math.sin(sway), dirz = (ox / l) * Math.sin(sway) + (oz / l) * Math.cos(sway);
    const cx = f.x + dirx * 11, cz = f.z + dirz * 11, cy = 5.5;
    this.camera.position.set(cx, cy, cz);
    const tx = f.x - cx, tz = f.z - cz, ty = 1.2 - cy;
    this.camera.rotation.set(Math.atan2(-ty, Math.hypot(tx, tz)), Math.atan2(tx, tz), 0);
  }

  /** The taser's wires: a jagged line from the cop to whoever got zapped. */
  private wire(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8, j = i === 0 || i === 8 ? 0 : 0.12;
      pts.push(new Vector3(ax + (bx - ax) * k + (Math.random() - 0.5) * j, ay + (by - ay) * k + (Math.random() - 0.5) * j, az + (bz - az) * k + (Math.random() - 0.5) * j));
    }
    const m = MeshBuilder.CreateLines("wire", { points: pts }, this.scene);
    m.color = Color3.FromHexString("#8fe3ff");
    m.isPickable = false;
    this.wires.push({ m, t: 0.6 });
  }

  private updateWires(dt: number) {
    for (let i = this.wires.length - 1; i >= 0; i--) {
      const w = this.wires[i];
      w.t -= dt;
      w.m.visibility = Math.max(0, w.t / 0.6) * (Math.random() > 0.3 ? 1 : 0.4);
      if (w.t <= 0) { w.m.dispose(); this.wires.splice(i, 1); }
    }
  }

  /** Test hook: is it night on this screen, and how dark (0..1)? */
  get nightLevel() { return this.night.level; }

  hud(): HudState {
    return { stamina: this.cur.stamina, winded: this.cur.winded, dodgeReady: this.cur.dodgeCd <= 0 && this.cur.dodgeT <= 0 && this.cur.stamina >= PLAYER.dodgeStamina, pose: movePose(this.cur) };
  }

  /** Test-only (solo, ?test=1): place the player somewhere. */
  debugTeleport(x: number, z: number, yaw: number, y?: number) {
    this.cur = makeMoveState(x, z, yaw);
    if (inLobby(this.arena, x, z) && this.arena.lobby) this.cur.y = this.arena.lobby.y; // (C5a: onto the squat's roof)
    if (y !== undefined) this.cur.y = y;
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

  /** Test hook: what the owner sees when a rival walks into their compound at night. */
  debugRaid(name = "TEST BANDIT") {
    const f = this.arena.forts?.find((x) => x.slot === this.myColorIdx);
    sfx.raidAlarm(); sfx.raidSiren(1);
    if (f) this.raidAlert.start(f.x, f.z, 12);
    this.onBanner?.(`${name} IS RAIDING YOUR FORT!`, "They're in your compound. Follow the arrow home!", "bad");
  }

  dispose() {
    this.raidAlert.dispose();
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
