// R12.3: THE SOGGY SHAMROCK's games, the client side: the textures the room is built with (the dartboard drawn from
// the same numbers the scoring uses; the cloth with its pocket holes; chalkboards, notices, league photos), and the
// live games: the balls replaying each shot, the cues, the darts in the board, the scoreboards, and your controls at
// the table (aim, pull back, strike) and at the oche (aim, steady, release).
import { DARTS, POOL, POOL_HOLES, POOL_HOLE } from "@bfb/shared";

type C2D = CanvasRenderingContext2D;
const CHALK = "#efeae0", HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

/** the bristle board, at WDF sizes, 20 at the top (the canvas's top is the board's top; its right is your right) */
export function drawDartboard(c: C2D, S: number) {
  const m = S / 2, k = (m - 4) / DARTS.board, PI = Math.PI;
  c.clearRect(0, 0, S, S);
  // the number ring (black), the sisal's rim
  c.fillStyle = "#151210"; c.beginPath(); c.arc(m, m, DARTS.board * k, 0, 2 * PI); c.fill();
  // the beds: singles black/cream, doubles & trebles red/green, 20 on top, clockwise
  const arcBand = (r0: number, r1: number, a0: number, a1: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(m, m, r1 * k, a0, a1); c.arc(m, m, r0 * k, a1, a0, true); c.closePath(); c.fill(); };
  for (let i = 0; i < 20; i++) {
    const a0 = (i * PI) / 10 - PI / 20 - PI / 2, a1 = a0 + PI / 10, dark = i % 2 === 0;
    arcBand(DARTS.outer, DARTS.dOut, a0, a1, dark ? "#1a1612" : "#efe3c4");
    arcBand(DARTS.tIn, DARTS.tOut, a0, a1, dark ? "#c41f2a" : "#1d7a3c");
    arcBand(DARTS.dIn, DARTS.dOut, a0, a1, dark ? "#c41f2a" : "#1d7a3c");
  }
  c.fillStyle = "#1d7a3c"; c.beginPath(); c.arc(m, m, DARTS.outer * k, 0, 2 * PI); c.fill();
  c.fillStyle = "#c41f2a"; c.beginPath(); c.arc(m, m, DARTS.bull * k, 0, 2 * PI); c.fill();
  // the wires
  c.strokeStyle = "#c8c8c0"; c.lineWidth = Math.max(1.5, S / 600);
  for (const r of [DARTS.bull, DARTS.outer, DARTS.tIn, DARTS.tOut, DARTS.dIn, DARTS.dOut]) { c.beginPath(); c.arc(m, m, r * k, 0, 2 * PI); c.stroke(); }
  for (let i = 0; i < 20; i++) { const a = (i * PI) / 10 - PI / 20 - PI / 2; c.beginPath(); c.moveTo(m + Math.cos(a) * DARTS.outer * k, m + Math.sin(a) * DARTS.outer * k); c.lineTo(m + Math.cos(a) * DARTS.dOut * k, m + Math.sin(a) * DARTS.dOut * k); c.stroke(); }
  // the numbers, upright, round the outside
  c.fillStyle = "#f2f0ea"; c.font = `bold ${Math.round(S * 0.052)}px Arial, Helvetica, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
  const rn = ((DARTS.dOut + DARTS.board) / 2) * k;
  DARTS.order.forEach((n, i) => { const a = (i * PI) / 10 - PI / 2; c.fillText(String(n), m + Math.cos(a) * rn, m + Math.sin(a) * rn); });
}

/** the inside of a cabinet door: a slate with old chalked 301 sums */
export function drawChalkDoor(c: C2D, k: number) {
  c.fillStyle = "#1e2622"; c.fillRect(0, 0, 256, 512);
  c.strokeStyle = "rgba(240,236,224,0.18)"; c.lineWidth = 18; for (let q = 0; q < 6; q++) { c.beginPath(); c.moveTo(20 + q * 40, 470); c.lineTo(60 + q * 30, 40); c.stroke(); }
  c.fillStyle = CHALK; c.font = `bold 34px ${HAND}`; c.textAlign = "center"; c.fillText(k ? "AWAY" : "HOME", 128, 50);
  c.strokeStyle = CHALK; c.lineWidth = 3; c.beginPath(); c.moveTo(128, 70); c.lineTo(128, 490); c.moveTo(24, 70); c.lineTo(232, 70); c.stroke();
  const runs = k ? [301, 241, 196, 155, 100, 60, 20] : [301, 255, 215, 140, 99, 59, 32, 16];
  c.font = `28px ${HAND}`;
  runs.forEach((v, i) => { c.fillText(String(v), 72, 108 + i * 50); if (i < runs.length - 1) { c.beginPath(); c.moveTo(42, 98 + i * 50); c.lineTo(102, 98 + i * 50); c.stroke(); } c.fillText(i ? String(runs[i - 1] - v) : "", 186, 108 + i * 50); });
}

/** the cloth (table-local: canvas x across the bed, canvas top = the foot end), the light pooled under the lamp,
 *  the baulk line; the pockets cut out (transparent) so you see down into the cups */
export function drawCloth(c: C2D, w: number, h: number) {
  const hw = POOL.W / 2 + POOL.cushion, hl = POOL.L / 2 + POOL.cushion;
  const X = (x: number) => ((x + hw) / (2 * hw)) * w, Y = (z: number) => ((hl - z) / (2 * hl)) * h, K = w / (2 * hw);
  c.fillStyle = "#1c6b33"; c.fillRect(0, 0, w, h);
  // the lamp's three shades: warm pools of light down the middle
  for (const z of [-0.55, 0, 0.55]) { const g = c.createRadialGradient(X(0), Y(z), 0, X(0), Y(z), 0.62 * K); g.addColorStop(0, "rgba(255,240,190,0.30)"); g.addColorStop(1, "rgba(255,240,190,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  // the nap, a little wear where the break's taken and round the pockets
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let q = 0; q < 2600; q++) { c.fillStyle = `rgba(0,0,0,${rnd() * 0.05})`; c.fillRect(rnd() * w, rnd() * h, 2, 3); }
  { const g = c.createRadialGradient(X(0), Y(-POOL.L / 2 + POOL.baulk - 0.1), 0, X(0), Y(-POOL.L / 2 + POOL.baulk - 0.1), 0.18 * K); g.addColorStop(0, "rgba(200,220,180,0.10)"); g.addColorStop(1, "rgba(200,220,180,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  // the baulk line and the black's spot
  c.strokeStyle = "rgba(235,240,225,0.55)"; c.lineWidth = Math.max(1, K * 0.003); c.beginPath(); c.moveTo(X(-POOL.W / 2), Y(-POOL.L / 2 + POOL.baulk)); c.lineTo(X(POOL.W / 2), Y(-POOL.L / 2 + POOL.baulk)); c.stroke();
  c.fillStyle = "rgba(235,240,225,0.6)"; c.beginPath(); c.arc(X(0), Y(POOL.L / 4), K * 0.006, 0, 2 * Math.PI); c.fill();
  // the pocket holes (where the simulation's pockets are: R12.3b)
  c.globalCompositeOperation = "destination-out";
  for (const h of POOL_HOLES) { c.beginPath(); c.arc(X(h.x), Y(h.z), POOL_HOLE * K, 0, 2 * Math.PI); c.fill(); }
  c.globalCompositeOperation = "source-over";
}

/** a card in the owner's hand */
export function notice(c: C2D, lines: string[]) {
  c.fillStyle = "#efe4c8"; c.fillRect(0, 0, 256, 184); c.strokeStyle = "#8a6a3a"; c.lineWidth = 6; c.strokeRect(3, 3, 250, 178);
  c.fillStyle = "rgba(120,80,30,0.12)"; c.fillRect(0, 150, 256, 34);
  c.fillStyle = "#2a1a10"; c.textAlign = "center"; c.textBaseline = "middle";
  const step = Math.min(42, 140 / Math.max(1, lines.length));
  lines.forEach((l, i) => { c.font = i === 0 ? `bold 28px ${HAND}` : `24px ${HAND}`; c.fillText(l, 128, 92 - ((lines.length - 1) * step) / 2 + i * step); });
  c.fillStyle = "#b8141c"; c.beginPath(); c.arc(128, 10, 6, 0, 6.3); c.fill();
}

/** the house rules, chalked up by the owner */
export function drawHouseRules(c: C2D, w: number, h: number) {
  c.fillStyle = "#1e2622"; c.fillRect(0, 0, w, h);
  c.fillStyle = CHALK; c.textAlign = "center"; c.font = `bold 30px ${HAND}`; c.fillText("HOUSE RULES", w / 2, 40);
  c.font = `15px ${HAND}`; c.textAlign = "left";
  const L = ["Reds v yellows. First pot (after", "the break) picks your colour.", "Clear your lot, then the black.", "Foul = 2 visits for the other fella.", "White down: place it behind the line.", "Black early, or black + white: you lose.", "Black on the break: rack 'em again.", "40 secs a shot. No jump shots.", "Bets: $5-50. Settle at the table.", "", "  - The Management"];
  L.forEach((l, i) => c.fillText(l, 16, 78 + i * 27));
}

/** a faded league photo: a row of lads with a cup, a caption */
export function drawLeaguePhoto(c: C2D, w: number, h: number, k: number) {
  const tones = ["#b89a6a", "#a8906a", "#c0a878", "#9a8460"];
  c.fillStyle = tones[k % 4]; c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(60,40,20,0.35)"; for (let q = 0; q < 6; q++) { const x = 24 + q * 38 + (k * 7) % 11; c.beginPath(); c.arc(x, 62, 13, 0, 6.3); c.fill(); c.fillRect(x - 15, 76, 30, 60); }
  c.fillStyle = "rgba(220,190,110,0.6)"; c.beginPath(); c.moveTo(w / 2 - 14, 100); c.lineTo(w / 2 + 14, 100); c.lineTo(w / 2 + 8, 128); c.lineTo(w / 2 - 8, 128); c.fill();
  c.fillStyle = "#3a2a18"; c.font = "bold 14px Georgia, serif"; c.textAlign = "center";
  c.fillText(["SHAMROCK A  -  LEAGUE WINNERS 1987", "DARTS NIGHT  -  1979", "CUP RUNNERS-UP  1994", "THE LADS  -  1991"][k % 4], w / 2, h - 16);
  const g = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(40,20,0,0.5)"); c.fillStyle = g; c.fillRect(0, 0, w, h);
}

/** worn boards: scuffed, lighter patches where people stand (transparent round the edge) */
export function wornFloor(c: C2D, S: number) {
  c.clearRect(0, 0, S, S);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let q = 0; q < 260; q++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * S * 0.42, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const fade = 1 - r / (S * 0.45);
    c.fillStyle = `rgba(${150 + rnd() * 40},${105 + rnd() * 30},${70 + rnd() * 20},${0.1 * fade})`;
    c.beginPath(); c.ellipse(x, y, 4 + rnd() * 18, 2 + rnd() * 6, rnd() * 3, 0, 6.3); c.fill();
  }
}

// ================================================================================================ the live games
import { MeshBuilder, Mesh, StandardMaterial, Color3, Vector3, TransformNode, DynamicTexture, Quaternion, type Scene } from "./babylon.ts";
import { unlitTextured } from "./look.ts";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh.js";
import { sfx } from "../audio.ts";
import { settings } from "../settings.ts";
import { PoolSim, cueSpotOk, checkout, ballColour, PUB_NPCS, inFoot, nearBoxes, StationFeed, replayStep, wrapDelta, timeLeftAt, type ArenaLayout, type Ball, type ReplayPlan, type WireShot } from "@bfb/shared";

/** a seat: id, name, NPC?, when a dropped player's held seat runs out (-1 = here), when a player who walked off forfeits
 *  (-1 = here); both on the shared clock */
type Seat = [string, string, number, number, number];
interface Note {
  ph: "free" | "waiting" | "play" | "over"; gid: number; rev: number; stake: number; msg: string; win: string; end: string;
  /** the shot / throw clock: when it runs out on the shared clock (-1 = not running), else what's left on it (stopped) */
  dl: number; left: number; seats: Seat[];
  pool: { b: [number, number, number, number][]; turn: number; g: [string | null, string | null]; vis: number; brk: number; hand: number; n: number } | null;
  shot: WireShot | null; last: WireShot | null;
  darts: { sc: [number, number]; turn: number; d: [number, number, string, number][]; vs: number; n: number; last: { who: number; d: [number, number, string, number][]; tot: number; note: string } | null } | null;
}
export interface PgCtx { me: string; x: number; y: number; z: number; clock: number; pints: number; tipsy: number; others: { x: number; y: number; z: number }[]; hurt: boolean; }
export interface PgHooks { act(a: Record<string, unknown>): void; feedback(t: string, k: "good" | "bad" | "info"): void; }
type Mode = "" | "menu" | "place" | "aim" | "draw" | "darts" | "follow";
/** R12.4 (Blake: "taking a shot feels like being kicked off the table"): after you strike, the shooting view holds a
 *  moment so you see the cue go through and the balls start, then the camera rises to your normal eye level over
 *  STANDUP.rise seconds (the arena blends it), and you're walking again while the balls finish rolling */
export const STANDUP = { hold: 0.3, rise: 0.65 };

const BALL_COL: Record<string, string> = { cue: "#f4f1ea", red: "#c41e1e", yellow: "#e8c020", black: "#141414" };
const SEAT_FLIGHT = ["#1f8a3a", "#8e1f2e"];

const PG_DEBUG = typeof location !== "undefined" && /[?&]pgdebug\b/.test(location.search);

class Station {
  note: Note | null = null;
  /** R12.3b: which game this window's on here, and which shots it's already shown (by name: game id + shot number) */
  feed = new StationFeed();
  // pool: the replay (the shot it's showing, how far in, why it started where it did)
  balls: Mesh[] = []; ballQ: Quaternion[] = []; ballPos: { x: number; z: number; down: boolean }[] = [];
  sim: PoolSim | null = null; simT = 0; key = ""; dur = 0; why = ""; drop: Map<number, number> = new Map();
  cue: TransformNode | null = null; cueT = -1; cueDir = { x: 0, z: 1 }; cueFrom = { x: 0, z: 0 };
  /** (R12.4: when you struck it here yourself: the stroke and its sound are shown at once, not again when the host's
   *  copy of the shot comes back) */
  struckAt = -1e9;
  // darts
  darts: TransformNode[] = []; dartIn: number[] = []; flash = { label: "", t: 0 };
  /** R12.4: the dart in the air at THIS board (each board its own: one board's dart never holds up the other's throw) */
  fly: { k: number; t: number; u: number; v: number; from: Vector3; mine: boolean; label?: string } | null = null;
  /** R12.4: when a dart last landed with no word yet of what it scored (its sting plays when the word comes) */
  landAt = 0;
  board: DynamicTexture | null = null; boardSig = "";
  /** darts: the cabinet doors' chalkboards (each player's score, chalked up as the game goes) */
  doors: DynamicTexture[] = []; doorSig = "";
  constructor(public id: string, public kind: "pool" | "darts", public idx: number, public g: { x: number; z: number; faceX?: number; oche?: number; by?: number }) {}
  seatOf(pid: string) { return this.note ? this.note.seats.findIndex((s) => s[0] === pid) : -1; }
  get turn() { return this.note?.pool?.turn ?? this.note?.darts?.turn ?? -1; }
  /** the host still has the shot rolling, or this window's replay of it is still going (the next shot waits for both) */
  get rolling() { return !!this.note?.shot || !!this.sim || this.feed.busy; }
}

export class PubGamesView {
  readonly st = new Map<string, Station>();
  mode: Mode = ""; at = "";
  /** the camera while you play (null = the normal first-person view) */
  cam: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number } | null = null;
  /** R12.4: the stand-up after a pool shot: the shooting view to blend from, how far through (the arena runs it) */
  blend: { from: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number }; t: number; dur: number; init?: boolean } | null = null;
  private follow: { st: Station; t: number; from: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number } } | null = null;
  private U = 0; private wallZ = 0; private wx = 0;
  private root: TransformNode;
  private mats = new Map<string, StandardMaterial>();
  // pool aim
  private aimA = 0; private drawD = 0; private place = { x: 0, z: 0 }; private stand = false; private fine = false;
  private guide: LinesMesh | null = null;
  // darts aim
  private aim = { u: 0, v: 0.1 }; private steady = { on: false, t: 0, cool: 0, f: 1 }; private swayT = 0; private swayPh = [0, 0, 0, 0];
  private marker: TransformNode | null = null; private thrownN = -1; private thrownAt = 0;
  /** R12.4: your turn at the oche ended while your last dart was in the air: step back once it's landed (and been seen) */
  private handover: { st: Station; t: number } | null = null;
  private fov = 0;
  // the menu
  private menu = { st: "", stake: 0, vs: "npc" as "npc" | "mate", confirm: false };
  private hud: HTMLDivElement; private menuEl: HTMLDivElement;
  private ctx: PgCtx = { me: "", x: 0, y: 0, z: 0, clock: 0, pints: 0, tipsy: 0, others: [], hurt: false };
  private lastTurnMine = new Map<string, boolean>();
  /** your turn came round while this window was still showing the last shot: step up when it's finished */
  private pendingEnter = "";
  /** (tests: scenery screenshots) no HUD panel, no stepping up when your turn comes round */
  quiet = false;
  /** (tests) the last thing the host told me */
  lastMsg = "";
  constructor(private scene: Scene, private arena: ArenaLayout, private hooks: PgHooks) {
    const pb = arena.pub;
    this.root = new TransformNode("pubGames", scene);
    this.hud = document.createElement("div"); this.hud.id = "pg-hud"; this.hud.className = "pg-hud hidden";
    this.menuEl = document.createElement("div"); this.menuEl.id = "pg-menu"; this.menuEl.className = "pg-menu hidden";
    (document.getElementById("hud") ?? document.body).append(this.hud, this.menuEl);
    if (!pb) return;
    this.U = pb.y2; this.wallZ = pb.rect.maxZ - 0.3; this.wx = pb.rect.minX + 0.3;
    pb.pools.forEach((q, i) => { const s = new Station(`pooltable${i + 1}`, "pool", i, { x: q.x, z: q.z }); this.st.set(s.id, s); this.buildPool(s); });
    pb.darts.forEach((d, i) => { const s = new Station(`dartsoche${i + 1}`, "darts", i, { x: d.oche + 0.3, z: d.board.z, faceX: d.faceX, oche: d.oche, by: d.board.y }); this.st.set(s.id, s); this.buildDarts(s); });
    if (PG_DEBUG) for (const s of this.st.values()) s.feed.log = [];
  }

  // ---------------------------------------------------------------- building
  private mat(col: string, shine = 0.5, tex?: DynamicTexture) {
    const k = col + shine + (tex ? tex.name : "");
    let m = this.mats.get(k);
    if (!m) { m = new StandardMaterial("pgMat" + k, this.scene); m.diffuseColor = Color3.FromHexString(col); m.specularColor = new Color3(shine, shine, shine); m.specularPower = 48; m.emissiveColor = Color3.FromHexString(col).scale(0.25); if (tex) m.diffuseTexture = tex; this.mats.set(k, m); }
    return m;
  }
  /** a ball's skin: its colour, a little maker's dot (so you can see it roll); the cue ball's red spots */
  private ballTex(c: string) {
    const t = new DynamicTexture("pgBall" + c, { width: 64, height: 32 }, this.scene, true); const x = t.getContext() as unknown as C2D;
    x.fillStyle = BALL_COL[c]; x.fillRect(0, 0, 64, 32);
    if (c === "cue") { x.fillStyle = "#c41e1e"; for (const [u, v] of [[8, 16], [24, 8], [40, 16], [56, 24], [24, 26]]) { x.beginPath(); x.arc(u, v, 2.6, 0, 6.3); x.fill(); } }
    else { x.fillStyle = c === "black" ? "#f4f1ea" : "rgba(255,255,255,0.75)"; x.beginPath(); x.arc(16, 16, c === "black" ? 3.5 : 2.2, 0, 6.3); x.fill(); x.beginPath(); x.arc(48, 16, 1.6, 0, 6.3); x.fill(); }
    t.update(); return t;
  }
  private buildPool(s: Station) {
    const texs: Record<string, DynamicTexture> = {};
    for (let id = 0; id < 16; id++) {
      const c = ballColour(id), r = id === 0 ? POOL.RC : POOL.R;
      const m = MeshBuilder.CreateSphere("pgBall" + s.id + id, { diameter: 2 * r, segments: 12 }, this.scene);
      m.material = this.mat(BALL_COL[c], 0.9, (texs[c] ??= this.ballTex(c))); m.parent = this.root; m.isPickable = false;
      m.rotationQuaternion = Quaternion.Identity();
      s.balls.push(m); s.ballQ.push(m.rotationQuaternion); s.ballPos.push({ x: 0, z: 0, down: false });
    }
    this.placeRack(s);
    // the cue: a tapered two-tone stick (butt, splice, shaft, ferrule, tip), 1.45 m
    const cue = new TransformNode("pgCue" + s.id, this.scene); cue.parent = this.root;
    const part = (d0: number, d1: number, len: number, z0: number, col: string) => { const m = MeshBuilder.CreateCylinder("pgCueP", { diameterTop: d1, diameter: d0, height: len, tessellation: 10 }, this.scene); m.rotation.x = Math.PI / 2; m.position.z = z0 + len / 2; m.parent = cue; m.material = this.mat(col, 0.3); m.isPickable = false; };
    part(0.03, 0.026, 0.55, -1.45, "#1a0c06"); part(0.026, 0.02, 0.15, -0.9, "#6a3a1a"); part(0.02, 0.0115, 0.74, -0.75, "#d8b078"); part(0.0115, 0.011, 0.012, -0.012, "#f2eee4"); part(0.011, 0.011, 0.006, -0.006, "#3a6ad8");
    cue.setEnabled(false); s.cue = cue;
    // the scoreboard (chalk) on the back wall
    s.board = this.boardPlane(s.id, 1.08, 0.72, new Vector3(s.g.x, this.U + 1.78, this.wallZ - 0.075), 0, 512, 340);
  }
  private buildDarts(s: Station) {
    for (let k = 0; k < 6; k++) {
      const d = new TransformNode("pgDart" + s.id + k, this.scene); d.parent = this.root;
      const part = (dia0: number, dia1: number, len: number, x0: number, col: string) => { const m = MeshBuilder.CreateCylinder("pgDartP", { diameterTop: dia1, diameter: dia0, height: len, tessellation: 8 }, this.scene); m.rotation.z = Math.PI / 2; m.position.x = x0 + len / 2; m.parent = d; m.material = this.mat(col, 0.6); m.isPickable = false; return m; };
      part(0.0005, 0.0022, 0.024, 0, "#c8c8d0"); part(0.0068, 0.0068, 0.05, 0.024, "#9a9aa4"); part(0.0035, 0.0035, 0.034, 0.074, "#2a2a30");
      for (const r of [0, Math.PI / 2]) { const f = MeshBuilder.CreatePlane("pgFlight", { width: 0.034, height: 0.03 }, this.scene); f.parent = d; f.position.x = 0.12; f.rotation.set(r, 0, 0); f.isPickable = false; f.material = this.mat(SEAT_FLIGHT[k < 3 ? 0 : 1], 0.1); (f.material as StandardMaterial).backFaceCulling = false; f.metadata = "flight"; }
      d.rotation.z = 0.16; // (stuck in at a slight upward angle: the flights ride high)
      d.setEnabled(false); s.darts.push(d); s.dartIn.push(0);
    }
    s.board = this.boardPlane(s.id, 1.4, 0.66, new Vector3(this.wx + 0.095, this.U + 2.56, s.g.z), -Math.PI / 2, 768, 362);
    // the cabinet's open doors: a chalkboard each, right beside the board (you see them from the oche): live scores
    for (const e of [-1, 1]) s.doors.push(this.boardPlane(s.id + "door" + e, 0.34, 0.76, new Vector3(this.wx + 0.057, s.g.by!, s.g.z + e * 0.6), -Math.PI / 2, 256, 572));
  }
  private boardPlane(id: string, w: number, h: number, at: Vector3, yaw: number, W: number, H: number) {
    const t = new DynamicTexture("pgBoard" + id, { width: W, height: H }, this.scene, true);
    const p = MeshBuilder.CreatePlane("pgBoardP" + id, { width: w, height: h }, this.scene);
    p.position.copyFrom(at); p.rotation.y = yaw; p.material = unlitTextured(this.scene, t, "pgBoardM" + id); p.parent = this.root; p.isPickable = false;
    return t;
  }
  private placeRack(s: Station) { const b: [number, number, number, number][] = []; for (const q of rackFor()) b.push([q.id, q.x, q.z, 0]); this.showBalls(s, b.map(([id, x, z, d]) => ({ id, x, z, down: !!d }))); }

  // ---------------------------------------------------------------- state from the host
  setNote(id: string, raw: string, clock: number) {
    const s = this.st.get(id); if (!s) return;
    // (R12.3b: every change counts, a countdown or someone reconnecting included; what's NEW (a game, a shot) is told
    //  by its name, never by a revision number)
    const r = s.feed.feed(raw, clock);
    if (!r.changed) return;
    const n = s.feed.note as Note; s.note = n;
    if (r.newGame) this.resetStation(s);
    // (shots that came and went while this window wasn't looking: said so, never silently gone)
    if (r.missed > 0 && (s.seatOf(this.ctx.me) >= 0 || this.near(s, 10))) this.hooks.feedback(`Missed ${r.missed} shot${r.missed > 1 ? "s" : ""} at ${s.idx + 1 ? "table " + (s.idx + 1) : "the table"} while this window was busy.`, "info");
    if (s.kind === "pool") {
      if (r.replay) this.startReplay(s, r.replay);
      else if (!s.sim && !s.feed.busy) { if (n.pool) this.showBalls(s, n.pool.b.map(([bid, x, z, d]) => ({ id: bid, x, z, down: !!d }))); else if (n.ph !== "play") this.placeRack(s); }
    }
    if (PG_DEBUG && s.feed.log?.length) console.log("[pg]", id, s.feed.log[s.feed.log.length - 1]);
    // my turn just started: step up to the table / the oche (once this window's finished showing the last shot)
    const mine = n.ph === "play" && s.seatOf(this.ctx.me) >= 0 && s.turn === s.seatOf(this.ctx.me) && !n.shot;
    const before = this.lastTurnMine.get(id) ?? false; this.lastTurnMine.set(id, mine);
    if (mine && !before && !this.quiet && Math.hypot(this.ctx.x - s.g.x, this.ctx.z - s.g.z) < 7) this.pendingEnter = id;
    if (!mine && this.pendingEnter === id) this.pendingEnter = "";
    // (only what's going on HERE moves you: another table or board finishing never touches your aim, your throw or a
    //  menu you've got open elsewhere)
    if (this.at !== id) return;
    // (R12.4: the moment after your pool shot: the hold and the stand-up see themselves out; the turn passing because
    //  of that very shot doesn't cut it short)
    if (this.mode === "follow") return;
    // (your own dart still in the air at this board: you see it land first, the checkout or the bust included)
    if (r.ended && this.mode === "darts" && s.fly?.mine) { this.handover = { st: s, t: 0.9 }; return; }
    if (!mine && this.mode !== "menu" && (this.mode !== "darts" || !s.fly)) this.leave();
    else if (r.ended) this.leave();
  }
  /** a new game at this station: nothing of the last one carries over (its replay, cue, potted balls, darts in flight,
   *  whose turn it was, the cabinet doors' running scores) */
  private resetStation(s: Station) {
    s.sim = null; s.key = ""; s.why = ""; s.simT = 0; s.cueT = -1; s.drop.clear();
    s.flash = { label: "", t: 0 }; (s as unknown as { hist?: number[][] }).hist = undefined;
    this.lastTurnMine.delete(s.id); if (this.pendingEnter === s.id) this.pendingEnter = "";
    s.fly = null; if (this.handover?.st === s) this.handover = null;
    if (this.at === s.id) this.thrownN = -1;
  }
  /** a shot to play out, from the exact start the host used (see StationFeed for where it starts and why) */
  private startReplay(s: Station, plan: ReplayPlan) {
    const sh = plan.shot, start: Ball[] = sh.b.map(([id, x, z, d]) => ({ id, x, z, vx: 0, vz: 0, down: !!d }));
    s.sim = new PoolSim(start, sh.dx, sh.dz, sh.v); s.key = sh.k; s.dur = sh.dur; s.why = plan.why;
    s.simT = plan.at; s.sim.runTo(plan.at);
    s.sim.onHit = (k, sp) => { if (!this.near(s, 14)) return; if (k === "ball") sfx.ballClick(sp); else if (k === "cushion") sfx.cushion(sp); else sfx.pocketDrop(); };
    for (const b of start) s.ballPos[b.id] = { x: b.x, z: b.z, down: b.down };
    s.drop.clear();
    const own = performance.now() - s.struckAt < 3000; s.struckAt = -1e9;
    if (plan.at < 0.3 && !own) { const cue = start.find((b) => b.id === 0)!; s.cueT = 0; s.cueDir = { x: sh.dx, z: sh.dz }; s.cueFrom = { x: cue.x, z: cue.z }; if (this.near(s, 14)) sfx.cueStrike(sh.v / POOL.vMax); }
    this.showBalls(s, s.sim.balls.map((b) => ({ id: b.id, x: b.x, z: b.z, down: b.down })));
  }
  /** is it my turn at this station (a game on, my seat, nothing rolling on the host)? */
  private myTurn(s: Station) { const n = s.note; const seat = s.seatOf(this.ctx.me); return !!n && n.ph === "play" && seat >= 0 && s.turn === seat && !n.shot; }
  /** the shot / throw clock as this window should show it (whole seconds, never more than the host has left) */
  clockOf(s: Station): number { const n = s.note; if (!n || n.ph !== "play") return 0; return n.dl >= 0 ? Math.ceil(timeLeftAt(n.dl, this.ctx.clock) - 0.05) : n.left; }
  private near(s: Station, r: number) { return Math.hypot(this.ctx.x - s.g.x, this.ctx.z - s.g.z) < r && Math.abs(this.ctx.y - this.U) < 2.5; }
  private showBalls(s: Station, bs: { id: number; x: number; z: number; down: boolean }[]) {
    const pb = this.arena.pub!, q = pb.pools[s.idx]; let k = 0;
    const downs = bs.filter((b) => b.down && b.id !== 0).sort((a, b) => a.id - b.id);
    for (const b of bs) {
      const m = s.balls[b.id], r = b.id === 0 ? POOL.RC : POOL.R, prev = s.ballPos[b.id];
      if (!b.down) {
        const wx = s.g.x + b.x, wz = s.g.z + b.z;
        // roll: turn about the axis across the motion, by distance / radius
        const dx = b.x - prev.x, dz = b.z - prev.z, dl = Math.hypot(dx, dz);
        if (dl > 1e-5 && dl < 0.5 && !prev.down) { const ax = new Vector3(dz / dl, 0, -dx / dl); Quaternion.RotationAxis(ax, dl / r).multiplyToRef(s.ballQ[b.id], s.ballQ[b.id]); }
        m.position.set(wx, this.U + POOL.cloth + r, wz); m.setEnabled(true); s.drop.delete(b.id);
      } else if (b.id === 0) m.setEnabled(false);
      else {
        // potted: a quick drop into the pocket, then it rolls round to the collection window
        const dt0 = s.drop.get(b.id);
        if (!prev.down && dt0 === undefined) s.drop.set(b.id, 0);
        const t = s.drop.get(b.id);
        if (t !== undefined && t < 0.4) { m.position.set(s.g.x + prev.x, this.U + POOL.cloth + r - t * 0.35, s.g.z + prev.z); }
        else { const i = downs.findIndex((d) => d.id === b.id); k = i; const row = k >= 11 ? 1 : 0, col = k % 11; m.position.set(s.g.x - 0.26 + col * 0.052, this.U + 0.495 + row * 0.052, s.g.z + q.d / 2 - 0.03); }
        m.setEnabled(true);
      }
      s.ballPos[b.id] = b.down && t2(s, b.id) ? prev : { x: b.x, z: b.z, down: b.down };
    }
    function t2(st: Station, id: number) { const t = st.drop.get(id); return t !== undefined && t < 0.4; }
  }

  // ---------------------------------------------------------------- events
  onEvent(e: { t: string; [k: string]: unknown }, me: string) {
    const s = this.st.get(String(e.st ?? "")); if (!s) return;
    if (e.t === "pgDart") {
      s.flash = { label: `${e.label}${Number(e.value) ? " · " + e.value : ""}`, t: 2.2 };
      // R12.4: the sound when the dart lands (it may still be in the air: then it plays as it hits the board)
      const g = e.who === me ? 1 : 0.7, label = String(e.label ?? "");
      if (this.near(s, 12)) {
        if (s.fly && s.fly.mine === (e.who === me)) s.fly.label = label;
        else if (performance.now() - s.landAt < 1500) { s.landAt = 0; sfx.dartSting(label, g); }
        else sfx.dartLand(label, g);
      }
      if (e.who === me && e.bust) this.hooks.feedback(String(e.bust), "bad");
      if (e.who !== me && this.near(s, 12)) { const k = (s.note?.darts?.d.length ?? 0); s.fly = s.fly ?? { k, t: 0, u: Number(e.u), v: Number(e.v), from: new Vector3((s.g.oche ?? 0) + 0.35, this.U + 1.7, s.g.z + 0.25), mine: false }; }
    } else if (e.t === "pgMsg") { if (e.to === me && e.msg) { this.lastMsg = String(e.msg); this.hooks.feedback(this.lastMsg, "info"); } }
    else if (e.t === "pgEnd") {
      const mineSeat = s.seatOf(me);
      if (mineSeat >= 0 || this.near(s, 10)) {
        const win = e.winner === me, pot = Number(e.pot) || 0;
        if (win) { sfx.checkout(); if (pot) sfx.cash(); }
        if (mineSeat >= 0) this.hooks.feedback(String(s.note?.msg ?? "") || (win ? "You win!" : e.end === "void" ? "Game called off: stakes back." : "You lose."), win ? "good" : "info");
      }
    }
  }

  // ---------------------------------------------------------------- the frame
  update(dt: number, ctx: PgCtx) {
    this.ctx = ctx;
    for (const s of this.st.values()) {
      if (s.kind === "pool") this.tickPool(s, dt); else this.tickDarts(s, dt);
      this.drawBoard(s, dt);
    }
    if (this.at) { const s = this.st.get(this.at); if (s && (ctx.hurt || Math.hypot(ctx.x - s.g.x, ctx.z - s.g.z) > 9)) this.leave(); }
    // (R12.4: your turn at the oche's over and your last dart's landed: step back now, unless it's come back round)
    if (this.handover) { const h = this.handover; h.t -= dt; if (this.at !== h.st.id || this.mode !== "darts" || this.myTurn(h.st)) this.handover = null; else if (h.t <= 0) { this.handover = null; this.leave(); } }
    // your turn: step up once this window's finished showing the last shot (not into the middle of it)
    if (this.pendingEnter) { const s = this.st.get(this.pendingEnter); if (!s || this.quiet) this.pendingEnter = ""; else if (!s.rolling) { this.pendingEnter = ""; if (this.mode === "" || this.at === s.id) this.enter(s); } }
    this.updateCam(dt);
    this.updateHud();
  }
  private tickPool(s: Station, dt: number) {
    if (s.sim) {
      // follow the host's clock (the game can run slower than real time on a slow machine): never ahead of it, never
      // backwards, and quicker until it's caught up if this window's behind (heard late, a stalled frame, a missed shot)
      // (with shots waiting in line behind it, it hurries: the line catches up, a few shots at most)
      const sh = s.note?.shot, live = !!sh && sh.k === s.key && !s.feed.queue.length;
      s.simT = replayStep(s.simT, dt, live ? wrapDelta(this.ctx.clock, sh!.t0) : null, s.dur);
      s.sim.runTo(s.simT);
      this.showBalls(s, s.sim.balls.map((b) => ({ id: b.id, x: b.x, z: b.z, down: b.down })));
      // played out, and the host's settled it: the table as the host has it (the same to a tenth of a millimetre)
      if ((s.sim.done || s.simT >= s.dur) && !live) {
        s.sim = null;
        // (shown to the end: the next shot in line, if one came in meanwhile: in order, catching up)
        const nx = s.feed.finished(s.key);
        if (nx) this.startReplay(s, nx);
        else if (s.note?.pool) this.showBalls(s, s.note.pool.b.map(([id, x, z, d]) => ({ id, x, z, down: !!d })));
      }
    }
    for (const [id, t] of s.drop) if (t < 0.4) s.drop.set(id, t + dt);
    // the cue: yours while you aim; anyone's stroke when a shot goes
    const cue = s.cue!;
    if (this.at === s.id && (this.mode === "aim" || this.mode === "draw")) {
      const c = this.cueBall(s), d = this.dir();
      const back = 0.03 + this.drawD + (this.mode === "draw" ? 0 : 0.02 * Math.sin(performance.now() / 300));
      this.poseCue(cue, s.g.x + c.x - d.x * back, s.g.z + c.z - d.z * back, d);
      cue.setEnabled(true);
    } else if (s.cueT >= 0) {
      s.cueT += dt; const n = Math.hypot(s.cueDir.x, s.cueDir.z) || 1, d = { x: s.cueDir.x / n, z: s.cueDir.z / n };
      const k = s.cueT < 0.12 ? 0.25 - (s.cueT / 0.12) * 0.25 : -Math.min(0.12, (s.cueT - 0.12) * 0.8);
      this.poseCue(cue, s.g.x + s.cueFrom.x - d.x * (0.02 + k), s.g.z + s.cueFrom.z - d.z * (0.02 + k), d);
      cue.setEnabled(s.cueT < 1.0); if (s.cueT >= 1.0) s.cueT = -1;
    } else cue.setEnabled(false);
  }
  private poseCue(cue: TransformNode, x: number, z: number, d: { x: number; z: number }) {
    cue.position.set(x, this.U + POOL.cloth + POOL.R + 0.012, z);
    cue.rotation.set(0.09, Math.atan2(d.x, d.z), 0); // (butt a little up: over the rail)
  }
  private tickDarts(s: Station, dt: number) {
    const D = s.note?.darts; const by = s.g.by!, fx = s.g.faceX!;
    const show: { u: number; v: number; seat: number }[] = [];
    if (D && s.note!.ph === "play") { if (D.d.length) D.d.forEach(([u, v]) => show.push({ u, v, seat: D.turn })); else if (D.last) D.last.d.forEach(([u, v]) => show.push({ u, v, seat: D.last!.who })); }
    else if (D && s.note!.ph === "over" && D.last) D.last.d.forEach(([u, v]) => show.push({ u, v, seat: D.last!.who }));
    s.darts.forEach((d, k) => {
      const q = show[k];
      if (!q || Math.abs(q.u) > 0.35 || Math.abs(q.v) > 0.35) { d.setEnabled(false); s.dartIn[k] = 0; return; }
      if (s.fly && s.fly.k === k) { d.setEnabled(false); return; }
      s.dartIn[k] = Math.min(1, s.dartIn[k] + dt / 0.12);
      const r = Math.hypot(q.u, q.v), x = r > 0.17 ? fx + 0.0 : fx; // (a miss sticks in the surround, just the same)
      d.position.set(x + (1 - s.dartIn[k]) * 0.4, by + q.v, s.g.z + q.u);
      for (const m of d.getChildMeshes()) if (m.metadata === "flight") m.material = this.mat(SEAT_FLIGHT[q.seat] ?? SEAT_FLIGHT[0], 0.1);
      d.setEnabled(true);
    });
    s.flash.t = Math.max(0, s.flash.t - dt);
    // a dart in flight (yours, or one you're watching)
    if (s.fly) {
      const f = s.fly; f.t += dt; const k = Math.min(1, f.t / 0.2), to = new Vector3(fx, by + f.v, s.g.z + f.u);
      const p = Vector3.Lerp(f.from, to, k); p.y += Math.sin(k * Math.PI) * 0.06;
      const d = s.darts[Math.min(5, f.k)]; d.position.copyFrom(p); d.setEnabled(true);
      if (k >= 1) {
        if (this.near(s, 12)) { if (f.label !== undefined) sfx.dartLand(f.label, f.mine ? 1 : 0.7); else { sfx.dartThunk(f.mine ? 1 : 0.7); s.landAt = performance.now(); } }
        s.fly = null;
        // (R12.4: your last dart's landed: if the turn's gone over meanwhile, step back from the oche once you've seen
        //  where it went (0.7 s): not left waiting for the next message from the host, which may be a while if the
        //  other player takes their time)
        if (this.at === s.id && this.mode === "darts" && !this.myTurn(s)) this.handover = { st: s, t: 0.7 };
      }
    }
  }

  // ---------------------------------------------------------------- the scoreboards
  private drawBoard(s: Station, _dt: number) {
    const n = s.note, t = s.board; if (!t) return;
    const cd = this.clockOf(s);
    const sig = JSON.stringify([s.feed.raw.length, n?.rev, n?.gid, cd, n?.seats.map((q) => [q[3] >= 0, q[4] >= 0]), s.flash.t > 0 ? s.flash.label : "", n?.ph]);
    if (sig === s.boardSig) return; s.boardSig = sig;
    const c = t.getContext() as unknown as C2D, W = t.getSize().width, H = t.getSize().height;
    if (s.kind === "darts") drawDartsBoard(c, W, H, s, n); else drawPoolBoard(c, W, H, s, n, cd);
    t.update();
    // (the left door is the first player's, the right door the second's: facing the board, -z is on your left)
    s.doors.forEach((d, k) => { drawDoorScore(d.getContext() as unknown as C2D, 256, 572, n, k, s); d.update(); });
  }

  // ---------------------------------------------------------------- using a station (E)
  /** E at a table / the oche */
  use(id: string) {
    const s = this.st.get(id); if (!s) return;
    const n = s.note, me = this.ctx.me, seat = s.seatOf(me);
    if (n?.ph === "play" && seat >= 0) { if (s.turn === seat && !s.rolling) { this.enter(s); return; } if (s.turn === seat) return; this.openMenu(s); return; }
    if (n?.ph === "play") { this.hooks.feedback(`Game on: ${n.seats.map((q) => q[1]).join(" v ")}. Pull up a stool and watch.`, "info"); return; }
    if (n?.ph === "over") { this.hooks.feedback(n.msg || "Game over. The table's free in a moment.", "info"); return; }
    this.openMenu(s);
  }
  private openMenu(s: Station) { this.menu = { st: s.id, stake: 0, vs: "npc", confirm: false }; // (no stake unless you choose one)
    this.mode = "menu"; this.at = s.id; this.renderMenu(); }
  private renderMenu() {
    const s = this.st.get(this.menu.st); if (!s) return;
    const n = s.note, me = this.ctx.me, npc = PUB_NPCS[s.kind].name, stakes = PUBGAMES_STAKES;
    const what = s.kind === "pool" ? `POOL · TABLE ${s.idx + 1}` : `DARTS · OCHE ${s.idx + 1} · 301 DOUBLE OUT`;
    let body = "";
    if (!n || n.ph === "free") body = `<div class="pg-stake">Stake: ${stakes.map((v, i) => `<span class="${i === this.menu.stake ? "on" : ""}">${v ? "$" + v : "none"}</span>`).join(" ")}<br><small>A / D to change. ${npc} plays for up to $20.</small></div><div class="pg-opt"><b>1</b> Play ${npc}</div><div class="pg-opt"><b>2</b> Wait for a mate</div>`;
    else if (n.ph === "waiting" && n.seats[0]?.[0] === me) body = `<div class="pg-info">Waiting for a mate to join${n.stake ? ` ($${n.stake} each)` : ""}.</div><div class="pg-opt"><b>1</b> Call it off</div>`;
    else if (n.ph === "waiting") body = `<div class="pg-info">${esc(n.seats[0]?.[1] ?? "?")} wants a game${n.stake ? `, $${n.stake} each (winner takes $${n.stake * 2})` : ""}.</div><div class="pg-opt"><b>1</b> Join</div>`;
    else if (n.ph === "play" && s.seatOf(me) >= 0) body = `<div class="pg-info">${this.menu.confirm ? "Really concede? You'll lose the stake." : "It's not your turn."}</div><div class="pg-opt"><b>1</b> ${this.menu.confirm ? "Yes, concede" : "Concede"}</div>`;
    this.menuEl.innerHTML = `<div class="pg-title">${what}</div>${body}<div class="pg-foot">E to close</div>`;
    this.menuEl.classList.remove("hidden");
  }
  private menuKey(code: string) {
    const s = this.st.get(this.menu.st); if (!s) { this.closeMenu(); return; }
    const n = s.note, me = this.ctx.me;
    if (code === "KeyE" || code === "Backspace") { this.closeMenu(); return; }
    if (!n || n.ph === "free") {
      if (code === "KeyA" || code === "ArrowLeft") this.menu.stake = Math.max(0, this.menu.stake - 1);
      if (code === "KeyD" || code === "ArrowRight") this.menu.stake = Math.min(PUBGAMES_STAKES.length - 1, this.menu.stake + 1);
      if (code === "Digit1" || code === "Digit2") { this.hooks.act({ a: "pg", op: "open", st: s.id, vs: code === "Digit1" ? "npc" : "mate", stake: PUBGAMES_STAKES[this.menu.stake] }); sfx.uiClick(); this.closeMenu(); return; }
    } else if (n.ph === "waiting" && code === "Digit1") { this.hooks.act({ a: "pg", op: n.seats[0]?.[0] === me ? "leave" : "join", st: s.id }); sfx.uiClick(); this.closeMenu(); return; }
    else if (n.ph === "play" && code === "Digit1") { if (!this.menu.confirm) this.menu.confirm = true; else { this.hooks.act({ a: "pg", op: "leave", st: s.id }); this.closeMenu(); return; } }
    this.renderMenu();
  }
  private closeMenu() { this.menuEl.classList.add("hidden"); if (this.mode === "menu") { this.mode = ""; this.at = ""; } }

  /** step up: your shot (the crouch behind the cue ball) or your darts (the oche) */
  private enter(s: Station) {
    if (this.at === s.id && (this.mode === "darts" || this.mode === "aim" || this.mode === "draw" || this.mode === "place")) return; // (already up)
    this.closeMenu(); this.at = s.id; this.fov = 0;
    if (!this.helpCounted.has(s.id + ":" + (s.note?.gid ?? 0))) { this.helpCounted.add(s.id + ":" + (s.note?.gid ?? 0)); this.helpSeen[s.kind] = (this.helpSeen[s.kind] ?? 0) + 1; try { localStorage.setItem("bfb.pgHelp", JSON.stringify(this.helpSeen)); } catch { /* private window */ } }
    if (s.kind === "pool") {
      const P = s.note?.pool; if (!P) return;
      const c = this.cueBall(s);
      // start aiming at the nearest ball you can hit (a sensible default; you can turn anywhere)
      const g = P.g[P.turn]; let best = 1e9;
      for (const [id, x, z, d] of P.b) { if (d || id === 0 || (P.brk && id !== 1)) continue; const col = ballColour(id); if (g ? col !== g && !(col === "black" && P.b.every(([i2, , , d2]) => d2 || ballColour(i2) !== g)) : col === "black") continue; const dd = Math.hypot(x - c.x, z - c.z); if (dd < best) { best = dd; this.aimA = Math.atan2(x - c.x, z - c.z); } }
      this.drawD = 0; this.stand = false;
      if (P.hand) { this.place = { x: c.x, z: c.z }; this.mode = "place"; } else this.mode = "aim";
    } else { this.mode = "darts"; this.aim = { u: 0, v: 0.103 }; this.swayPh = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6]; this.steady = { on: false, t: 0, cool: 0, f: 1 }; }
  }
  /** R12.5: leaving the game: take the panel and the menu off the page (they used to pile up, one more per game) */
  dispose() {
    try { this.leave(); } catch { /* already gone */ }
    this.hud.remove(); this.menuEl.remove();
    document.body.classList.remove("pg-on");
  }
  leave() { this.follow = null; if (this.mode === "menu") this.closeMenu(); this.mode = ""; this.at = ""; this.cam = null; this.drawD = 0; if (this.guide) this.guide.setEnabled(false); if (this.marker) this.marker.setEnabled(false); }
  get active() { return this.mode !== ""; }

  // ---------------------------------------------------------------- input (while you're at a table / the oche)
  readonly input = {
    mouse: (dx: number, dy: number) => {
      if (this.mode === "follow") return; // (the hold: the view stays put; your look's yours again in a moment)
      const s = this.st.get(this.at); if (!s) return;
      const k = settings.mouseSensitivity;
      if (this.mode === "place") { this.place.x = clamp(this.place.x + dx * 0.0011 * k, -POOL.W / 2 + POOL.RC, POOL.W / 2 - POOL.RC); this.place.z = clamp(this.place.z - dy * 0.0011 * k, -POOL.L / 2 + POOL.RC, -POOL.L / 2 + POOL.baulk); }
      else if (this.mode === "aim") this.aimA += dx * 0.0022 * k * (this.fine ? 0.2 : 1);
      else if (this.mode === "draw") this.drawD = clamp(this.drawD + dy * 0.0009, 0, 0.3);
      else if (this.mode === "darts") { this.aim.u = clamp(this.aim.u + dx * 0.00028 * k, -0.3, 0.3); this.aim.v = clamp(this.aim.v - dy * 0.00028 * k * (settings.invertY ? -1 : 1), -0.3, 0.3); }
    },
    button: (b: number, down: boolean) => {
      if (this.mode === "follow") return; // (the release that struck the shot, or a click right after, never becomes a punch)
      const s = this.st.get(this.at); if (!s) return;
      if (this.mode === "place" && b === 0 && down) { if (cueSpotOk(this.ballsOf(s), this.place.x, this.place.z)) { this.mode = "aim"; sfx.uiClick(); } else { sfx.error(); this.hooks.feedback("Not there: behind the baulk line, clear of the other balls.", "bad"); } }
      else if (this.mode === "aim" && b === 0 && down) { this.mode = "draw"; this.drawD = 0; }
      else if (this.mode === "draw" && b === 2 && down) { this.mode = "aim"; this.drawD = 0; }
      else if (this.mode === "draw" && b === 0 && !down) { if (this.drawD < 0.008) { this.mode = "aim"; this.drawD = 0; return; } this.shoot(s, this.dir(), this.power()); }
      else if (this.mode === "darts" && b === 0 && down) this.throwDart(s);
    },
    key: (code: string, down: boolean): boolean => {
      if (this.mode === "menu") { if (down) this.menuKey(code); return true; }
      // (setting off during the hold: you stand up at once and the key moves you)
      if (this.mode === "follow") { if (down && /^Key[WASD]$|^Arrow/.test(code)) { this.standUp(); return false; } return !/^Key[WASD]$|^Arrow|^Shift/.test(code); }
      if (code === "ShiftLeft" || code === "ShiftRight") { this.fine = down; if (this.mode === "darts") this.steadyKey(down); return true; }
      if (!down) return true;
      if (code === "KeyE" || code === "Backspace") { this.leave(); return true; }
      if (code === "KeyH") { this.helpOn = !this.helpOn; return true; }
      if (code === "Space" && (this.mode === "aim" || this.mode === "draw" || this.mode === "place")) { this.stand = !this.stand; return true; }
      return true;
    },
  };
  private steadyKey(down: boolean) { if (down && this.steady.cool <= 0) { this.steady.on = true; this.steady.t = 0; } else if (!down && this.steady.on) { this.steady.on = false; this.steady.cool = 2; } }

  private ballsOf(s: Station): Ball[] { return (s.note?.pool?.b ?? []).map(([id, x, z, d]) => ({ id, x, z, vx: 0, vz: 0, down: !!d })); }
  private cueBall(s: Station) { if (this.mode === "place" || (s.note?.pool?.hand && this.at === s.id && this.mode !== "")) return this.place; const c = s.note?.pool?.b.find((b) => b[0] === 0); return c ? { x: c[1], z: c[2] } : { x: 0, z: -0.6 }; }
  private dir() { return { x: Math.sin(this.aimA), z: Math.cos(this.aimA) }; }
  private power() { return POOL.vMin + (POOL.vMax - POOL.vMin) * Math.pow(this.drawD / 0.3, 1.25); }
  /** take the shot (the host checks it and sends it back for everyone to watch) */
  shoot(s: Station, d: { x: number; z: number }, v: number) {
    const P = s.note?.pool; if (!P) return;
    const a: Record<string, unknown> = { a: "pg", op: "shot", st: s.id, n: P.n, dx: d.x, dz: d.z, v };
    if (P.hand) { a.cx = this.place.x; a.cz = this.place.z; }
    this.hooks.act(a); this.drawD = 0;
    // (R12.4: the cue goes through the white right now, here (just the look of it and its sound: the shot itself is
    //  the host's, played out when it comes back); the view holds, then you stand up)
    const c = this.cueBall(s); s.cueT = 0; s.cueDir = { x: d.x, z: d.z }; s.cueFrom = { x: c.x, z: c.z }; s.struckAt = performance.now();
    sfx.cueStrike(v / POOL.vMax);
    if (this.cam) { this.mode = "follow"; this.follow = { st: s, t: 0, from: { ...this.cam } }; if (this.guide) this.guide.setEnabled(false); }
    else this.leave();
  }
  /** the hold's over (or you set off walking): back to your own feet, the camera rising from the shot */
  private standUp() {
    const f = this.follow; if (!f) return;
    this.follow = null;
    this.leave();
    this.blend = { from: f.from, t: 0, dur: STANDUP.rise };
  }
  private throwDart(s: Station) {
    const D = s.note?.darts; if (!D || s.fly || this.handover || (this.thrownN === D.n && performance.now() - this.thrownAt < 1500)) return;
    const p = this.swayed();
    this.thrownN = D.n; this.thrownAt = performance.now();
    this.hooks.act({ a: "pg", op: "dart", st: s.id, n: D.n, u: p.u, v: p.v });
    sfx.dartWhoosh();
    const c = this.cam; s.fly = { k: D.d.length, t: 0, u: p.u, v: p.v, from: new Vector3((c?.x ?? s.g.x) - 0.25, (c?.y ?? this.U + 1.6) - 0.12, (c?.z ?? s.g.z) + 0.1), mine: true };
  }
  /** where the dart goes if you let go now: your aim plus your hand's sway (the ring shows exactly this) */
  private swayed() {
    const t = this.swayT, f = this.steady.f, A = 0.012 * f * (1 + Math.min(0.75, 0.15 * this.ctx.pints));
    const [a, b, c, d] = this.swayPh;
    return { u: this.aim.u + A * (0.7 * Math.sin(2 * Math.PI * 0.53 * t + a) + 0.5 * Math.sin(2 * Math.PI * 0.31 * t + b)), v: this.aim.v + A * (0.6 * Math.cos(2 * Math.PI * 0.47 * t + c) + 0.5 * Math.sin(2 * Math.PI * 0.23 * t + d)) };
  }

  // ---------------------------------------------------------------- the camera and the aim guide
  private updateCam(dt: number) {
    if (this.mode === "follow" && this.follow) {
      const f = this.follow; f.t += dt; this.cam = { ...f.from };
      if (f.t >= STANDUP.hold || this.ctx.hurt) this.standUp();
      return;
    }
    const s = this.st.get(this.at);
    if (!s || this.mode === "" || this.mode === "menu") { this.cam = null; if (this.guide) this.guide.setEnabled(false); if (this.marker) this.marker.setEnabled(false); return; }
    const base = (settings.fov * Math.PI) / 180;
    if (s.kind === "pool") {
      const c = this.cueBall(s), X = s.g.x, Z = s.g.z, cl = this.U + POOL.cloth;
      let cam: { x: number; y: number; z: number; yaw: number; pitch: number };
      if (this.mode === "place") { cam = { x: X, y: this.U + 1.85, z: Z - POOL.L / 2 - 0.75, yaw: 0, pitch: 0.95 }; }
      else {
        const d = this.dir(), back = this.stand ? 1.55 : 0.95, up = this.stand ? 1.65 : 0.36;
        let k = back;
        // never through a wall, a pillar, a lamp, a person: slide in towards the ball until it's clear
        for (; k > 0.35; k -= 0.05) { const x = X + c.x - d.x * k, z = Z + c.z - d.z * k, y = this.stand ? this.U + up : cl + up; if (!this.blocked(x, y, z)) break; }
        const x = X + c.x - d.x * k, z = Z + c.z - d.z * k, y = this.stand ? this.U + up + (back - k) * 0.4 : cl + up + (back - k) * 0.5;
        const look = this.stand ? 0 : 0.45;
        cam = { x, y, z, yaw: Math.atan2(d.x, d.z), pitch: Math.atan2(y - cl, k + look) };
      }
      this.fov += (base * 0.92 - (this.fov || base)) * Math.min(1, dt * 6) + (this.fov ? 0 : base);
      this.cam = { ...cam, fov: this.fov };
      this.drawGuide(s);
      // the cue ball where you're placing it (and, ball in hand, where you put it while you aim: R12.3b, it used to jump
      // back to where it had been, away from the cue and the aiming line)
      if (this.mode === "place" || (s.note?.pool?.hand && !s.sim && (this.mode === "aim" || this.mode === "draw"))) { const m = s.balls[0]; m.position.set(X + this.place.x, cl + POOL.RC, Z + this.place.z); m.setEnabled(true); }
    } else {
      const fx = s.g.faceX!, by = s.g.by!, ex = (s.g.oche ?? fx + 2.37) + 0.22, ey = this.U + 1.62;
      this.swayT += dt;
      const st = this.steady;
      if (st.on) { st.t += dt; st.f += ((st.t < 2.5 ? 0.4 : 1.5) - st.f) * Math.min(1, dt * 5); }
      else { st.cool = Math.max(0, st.cool - dt); st.f += (1 - st.f) * Math.min(1, dt * 3); }
      const tgt = 0.62; this.fov = this.fov ? this.fov + (tgt - this.fov) * Math.min(1, dt / 0.3 * 2.2) : base;
      this.cam = { x: ex, y: ey, z: s.g.z, yaw: -Math.PI / 2, pitch: Math.atan2(ey - by, ex - fx), fov: this.fov };
      if (!this.marker) this.marker = this.makeMarker();
      const p = this.swayed(); this.marker.position.set(fx + 0.004, by + p.v, s.g.z + p.u); this.marker.setEnabled(!s.fly && !this.handover);
    }
  }
  private blocked(x: number, y: number, z: number) {
    for (const b of nearBoxes(this.arena, x, z, 0.3)) { if (y > b.y - b.h / 2 - 0.1 && y < b.y + b.h / 2 + 0.1 && inFoot(b, x, z, 0.14)) return true; }
    for (const o of this.ctx.others) if (Math.hypot(o.x - x, o.z - z) < 0.4 && y > o.y && y < o.y + 1.9) return true;
    return false;
  }
  private makeMarker() {
    const m = new TransformNode("pgMarker", this.scene); m.parent = this.root;
    const ring = MeshBuilder.CreateTorus("pgMarkRing", { diameter: 0.016, thickness: 0.0018, tessellation: 20 }, this.scene); ring.rotation.z = Math.PI / 2; ring.parent = m;
    const dot = MeshBuilder.CreateDisc("pgMarkDot", { radius: 0.0016, tessellation: 10 }, this.scene); dot.rotation.y = -Math.PI / 2; dot.parent = m;
    const mt = new StandardMaterial("pgMarkM", this.scene); mt.disableLighting = true; mt.emissiveColor = Color3.FromHexString("#fff4d0"); mt.backFaceCulling = false;
    for (const x of [ring, dot]) { x.material = mt; x.isPickable = false; x.renderingGroupId = 1; }
    return m;
  }
  /** a line to the first ball you'd hit, a ghost ball where they meet, short stubs for where both go (no cushion maths) */
  private drawGuide(s: Station) {
    if (this.mode === "place") { if (this.guide) this.guide.setEnabled(false); return; }
    const c = this.cueBall(s), d = this.dir(), X = s.g.x, Z = s.g.z, y = this.U + POOL.cloth + 0.004, rr = POOL.R + POOL.RC;
    let tHit = 1e9, hit: { x: number; z: number } | null = null;
    for (const [id, x, z, dn] of s.note?.pool?.b ?? []) {
      if (dn || id === 0) continue;
      const ox = x - c.x, oz = z - c.z, along = ox * d.x + oz * d.z; if (along <= 0) continue;
      const perp2 = ox * ox + oz * oz - along * along; if (perp2 > rr * rr) continue;
      const t = along - Math.sqrt(rr * rr - perp2); if (t < tHit) { tHit = t; hit = { x, z }; }
    }
    const hw = POOL.W / 2 - POOL.RC, hl = POOL.L / 2 - POOL.RC;
    const tc = Math.min(d.x > 0 ? (hw - c.x) / d.x : d.x < 0 ? (-hw - c.x) / d.x : 1e9, d.z > 0 ? (hl - c.z) / d.z : d.z < 0 ? (-hl - c.z) / d.z : 1e9);
    const t = Math.min(tHit, tc), gx = c.x + d.x * t, gz = c.z + d.z * t;
    const P = (x: number, z: number) => new Vector3(X + x, y, Z + z);
    const lines: Vector3[][] = [[P(c.x, c.z), P(gx, gz)]];
    const ring: Vector3[] = []; for (let k = 0; k <= 20; k++) { const a = (k / 20) * Math.PI * 2; ring.push(P(gx + Math.cos(a) * POOL.RC, gz + Math.sin(a) * POOL.RC)); }
    if (hit && tHit <= tc) {
      const nx = (hit.x - gx) / rr, nz = (hit.z - gz) / rr;
      lines.push(ring, [P(hit.x, hit.z), P(hit.x + nx * 0.25, hit.z + nz * 0.25)]);
      const dot = d.x * nx + d.z * nz, tx = d.x - dot * nx, tz = d.z - dot * nz, tl = Math.hypot(tx, tz);
      lines.push(tl > 0.05 ? [P(gx, gz), P(gx + (tx / tl) * 0.15, gz + (tz / tl) * 0.15)] : [P(gx, gz), P(gx, gz)]);
    } else lines.push(ring, [P(gx, gz), P(gx, gz)], [P(gx, gz), P(gx, gz)]);
    this.guide = MeshBuilder.CreateLineSystem("pgGuide", { lines, updatable: true, instance: this.guide as never }, this.scene);
    this.guide.color = Color3.FromHexString("#f4ecd0"); this.guide.alpha = 0.75; this.guide.isPickable = false; this.guide.setEnabled(true);
  }

  // ---------------------------------------------------------------- the HUD: what's going on here, your controls
  // R12.3b (Blake): while you're aiming, a compact panel in the top-right corner, out of the way of the shot: who's
  // playing and whose turn, the colours / the scores, the clock, your power or steadiness, the keys in one short line.
  // The full instructions: your first two goes at each game, then H. Otherwise a small line above your pockets.
  private helpOn = false; private helpSeen: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem("bfb.pgHelp") ?? "{}") ?? {}; } catch { return {}; } })();
  /** (the games you've stepped up for, so the first-time help counts games, not visits) */
  private helpCounted = new Set<string>();
  private seatTag(q: Seat) {
    const c = this.ctx.clock;
    if (q[3] >= 0) return ` <span class="pg-warn">(reconnecting: ${Math.ceil(timeLeftAt(q[3], c))}s)</span>`;
    if (q[4] >= 0) return ` <span class="pg-warn">(walked off: back in ${Math.ceil(timeLeftAt(q[4], c))}s!)</span>`;
    return "";
  }
  private updateHud() {
    const me = this.ctx.me;
    let s: Station | null = this.st.get(this.at) ?? null;
    if (!s) for (const q of this.st.values()) if (q.seatOf(me) >= 0 && q.note && (q.note.ph === "play" || q.note.ph === "waiting")) s = q;
    if (!s) for (const q of this.st.values()) if (this.near(q, 4.5)) { s = q; break; }
    if (!s || !s.note || s.note.ph === "free" || this.quiet) { this.hud.classList.add("hidden"); document.body.classList.remove("pg-on"); return; }
    const n = s.note, seat = s.seatOf(me), mine = seat >= 0 && s.turn === seat, aiming = this.at === s.id && this.active && this.mode !== "menu";
    const cd = this.clockOf(s), pool = s.kind === "pool";
    const who = n.seats.map((q, i) => `${i === s!.turn && n.ph === "play" ? "▶ " : ""}${esc(q[1])}${this.seatTag(q)}`).join(" v ");
    let html = "";
    if (n.ph === "waiting") html = `<div class="pg-line">${esc(n.seats[0]?.[1] ?? "")} is waiting for a mate${n.stake ? ` ($${n.stake})` : ""}. E at the ${pool ? "table" : "oche"} to join.</div>`;
    else if (n.ph === "over") html = `<div class="pg-line">${esc(n.msg)}</div>`;
    else if (!aiming) {
      const turn = mine ? `<b class="pg-you">YOUR ${pool ? "SHOT" : "THROW"}${cd ? ` · ${cd}s` : ""}</b>${s.rolling ? " (balls still rolling)" : ` · E at the ${pool ? "table" : "oche"}`}` : "";
      html = `<div class="pg-line">${who}${n.stake ? ` · $${n.stake} each` : ""}${turn ? " · " + turn : ""}</div>${n.msg ? `<div class="pg-msg">${esc(n.msg)}</div>` : ""}`;
    } else {
      // the compact panel
      let score = "", meter = "", keys = "", help = "";
      if (pool) {
        const P = n.pool;
        score = n.seats.map((q, i) => { const g = P?.g[i]; const left = g && P ? P.b.filter(([id, , , d]) => !d && ballColour(id) === g).length : -1; return `${esc(q[1])}: ${g ? `<span class="pg-dot ${g}"></span>${left ? `${left} left` : "on the black"}` : P?.brk ? "break" : "open"}`; }).join(" · ") + (P && P.vis > 1 ? ` · <b>2 visits</b>` : "");
        if (this.mode === "draw") meter = `<div class="pg-meter"><i style="width:${Math.round((this.drawD / 0.3) * 100)}%"></i></div>`;
        keys = this.mode === "place" ? "Mouse: place the white · CLICK: set it" : this.mode === "draw" ? "Pull back for power · let go to strike · right-click: cancel" : "Aim · HOLD CLICK + pull back · SHIFT fine · SPACE stand · E back · H help";
        help = "Ball in hand: put the white anywhere behind the baulk line (the line near your end), clear of the other balls, then CLICK.<br>Aim with the mouse (SHIFT for fine aim). The line shows the first ball you'd hit and where both go.<br>HOLD the left button and pull the mouse back for power; LET GO to strike. Right-click cancels.<br>SPACE stands you up for a look round the table. E steps back.<br>House rules: first pot after the break picks your colour; a foul gives the other player two visits; the black last.";
      } else {
        const D = n.darts;
        if (D) { const ck = checkout(D.sc[D.turn], 3 - D.d.length); score = `${n.seats.map((q, i) => `${esc(q[1])} <b>${D.sc[i]}</b>`).join(" · ")} · this visit: ${D.d.map((d) => d[2]).join(" ") || "-"}${ck ? ` · <span class="pg-ck">${ck.join(" ")}</span>` : ""}`; }
        const st = this.steady; meter = `<div class="pg-meter steady" title="steadiness"><i style="width:${Math.round((st.on ? Math.max(0, 1 - st.t / 2.5) : st.cool > 0 ? 1 - st.cool / 2 : 1) * 100)}%"></i></div>`;
        keys = "Aim · HOLD SHIFT steady · CLICK throw · E back · H help";
        help = "The ring is exactly where the dart will land; your hand sways (more after a few pints).<br>HOLD SHIFT to steady it for a couple of seconds; it needs a moment to recover after.<br>301, double out: finish exactly on zero with a double (the outer ring) or the bull. Go below zero, or leave 1, and it's a bust: your score goes back.";
      }
      // (R12.4: on a small window the rules don't open by themselves: they'd cover the table; H shows them)
      const k = s.kind, first = (this.helpSeen[k] ?? 0) <= 2 && (typeof innerWidth === "undefined" || (innerWidth > 1100 && innerHeight > 680));
      html = `<div class="pg-line">${who}${n.stake ? ` · $${n.stake}` : ""}</div><div class="pg-score">${score}</div>`
        + `<div class="pg-clock${mine && cd > 0 && cd <= 10 ? " low" : ""}">${mine ? `YOUR ${pool ? "SHOT" : "THROW"}${cd ? ` · ${cd}s` : ""}` : "WAIT"}</div>${meter}`
        + (n.msg ? `<div class="pg-msg">${esc(n.msg)}</div>` : "")
        + `<div class="pg-keys">${keys}</div>` + (this.helpOn || first ? `<div class="pg-help">${help}</div>` : "");
    }
    if (this.hud.innerHTML !== html) this.hud.innerHTML = html;
    this.hud.classList.remove("hidden");
    this.hud.classList.toggle("top", aiming);
    document.body.classList.toggle("pg-on", aiming);
  }
  /** the prompt when you look at a station */
  prompt(id: string): [string, string, string] {
    const s = this.st.get(id); const n = s?.note;
    const name = s ? (s.kind === "pool" ? `Pool table ${s.idx + 1}` : `Oche ${s.idx + 1}`) : "";
    if (!s || !n || n.ph === "free") return [" Play ", name, s?.kind === "pool" ? `pub 8-ball v ${PUB_NPCS.pool.name} or a mate · stakes $0-50` : `301 double out v ${PUB_NPCS.darts.name} or a mate`];
    const seat = s.seatOf(this.ctx.me);
    if (n.ph === "waiting") return seat === 0 ? [" Call off ", name, "waiting for a mate"] : [" Join ", name, `${n.seats[0]?.[1]}${n.stake ? `: $${n.stake} each` : ""}`];
    if (n.ph === "play" && seat >= 0) return s.turn === seat ? [" Take your " + (s.kind === "pool" ? "shot" : "throw") + " at ", name, ""] : [" Concede at ", name, "it's not your turn"];
    return [" Watch ", name, n.seats.map((q) => q[1]).join(" v ")];
  }

  /** (tests) what's on each station, and your mode */
  info() {
    const out: Record<string, unknown> = { mode: this.mode, at: this.at, cam: this.cam ? { ...this.cam } : null, lastMsg: this.lastMsg };
    for (const s of this.st.values()) out[s.id] = { ph: s.note?.ph ?? "free", seats: s.note?.seats.map((q) => q[1]) ?? [], turn: s.turn, rolling: s.rolling, msg: s.note?.msg ?? "", pool: s.note?.pool ?? null, darts: s.note?.darts ?? null, stake: s.note?.stake ?? 0, end: s.note?.end ?? "", win: s.note?.win ?? "", shown: s.kind === "pool" ? s.balls.filter((b) => b.isEnabled()).length : s.darts.filter((d) => d.isEnabled()).length, ballY: s.kind === "pool" ? s.balls[1].position.y : 0, clock: this.clockOf(s), replay: s.sim ? { k: s.key, t: s.simT, dur: s.dur, why: s.why } : null, log: s.feed.log?.slice(-8) ?? null };
    return out;
  }
  /** (tests) play through your own controls without a mouse: aim at an angle (radians, 0 = up the table) with a power 0..1 */
  testShot(id: string, angle: number, power: number, place?: { x: number; z: number }) {
    const s = this.st.get(id); if (!s) return "no station";
    this.enter(s); if (place) { this.place = { ...place }; this.mode = "aim"; }
    this.aimA = angle; this.drawD = clamp(power, 0, 1) * 0.3; this.mode = "draw";
    this.shoot(s, this.dir(), this.power()); return "";
  }
  /** (tests / clips) turn your aim to an angle (radians) at the table you're at */
  testAim(angle: number) { this.aimA = angle; }
  /** (tests) throw a dart at (u, v) with no sway */
  testDart(id: string, u: number, v: number) { const s = this.st.get(id); if (!s) return; this.enter(s); this.aim = { u, v }; this.steady.f = 0; this.throwDart(s); }
  /** (tests) the aim ring's position (board metres) right now */
  ring() { return this.swayed(); }
}

const PUBGAMES_STAKES = [0, 5, 10, 20, 50];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
function rackFor(): { id: number; x: number; z: number }[] { const R = POOL.R + 0.0002, apex = POOL.L / 4, rows = [[1], [2, 9], [10, 8, 3], [4, 11, 5, 12], [13, 6, 14, 15, 7]], out = [{ id: 0, x: 0.12, z: -POOL.L / 2 + POOL.baulk - 0.12 }]; rows.forEach((row, r) => row.forEach((id, q) => out.push({ id, x: (q - (row.length - 1) / 2) * 2 * R, z: apex + r * R * 1.7320508075688772 }))); return out; }

/** the oche's scoreboard: bottle green, cream lettering, the scores big; this visit's darts; a checkout hint */
function drawDartsBoard(c: C2D, W: number, H: number, s: Station, n: Note | null) {
  c.fillStyle = "#10301f"; c.fillRect(0, 0, W, H); c.strokeStyle = "#c9a040"; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8);
  c.fillStyle = "#e8c050"; c.font = "bold 30px Georgia, serif"; c.textAlign = "center"; c.fillText(`OCHE ${s.idx + 1}  ·  301  ·  DOUBLE OUT`, W / 2, 42);
  c.textAlign = "left";
  if (!n || n.ph === "free") { c.fillStyle = "#f2ead8"; c.font = "bold 64px Georgia, serif"; c.textAlign = "center"; c.fillText("BOARD FREE", W / 2, 170); c.font = "28px Georgia, serif"; c.fillText(`E at the oche: play ${PUB_NPCS.darts.name} or a mate`, W / 2, 230); return; }
  if (n.ph === "waiting") { c.fillStyle = "#f2ead8"; c.font = "bold 46px Georgia, serif"; c.textAlign = "center"; c.fillText("WAITING FOR A MATE", W / 2, 160); c.font = "30px Georgia, serif"; c.fillText(`${n.seats[0]?.[1] ?? ""}${n.stake ? `  ·  $${n.stake} each` : ""}`, W / 2, 215); return; }
  const D = n.darts; if (!D) return;
  n.seats.forEach((q, i) => {
    const y = 108 + i * 92, up = n.ph === "play" && D.turn === i;
    if (up) { c.fillStyle = "rgba(232,192,80,0.16)"; c.fillRect(14, y - 50, W - 28, 80); c.fillStyle = "#e8c050"; c.beginPath(); c.moveTo(24, y - 26); c.lineTo(44, y - 10); c.lineTo(24, y + 6); c.fill(); }
    c.fillStyle = "#f2ead8"; c.font = "bold 36px Georgia, serif"; c.fillText(q[1].slice(0, 12), 56, y);
    c.font = "bold 66px Georgia, serif"; c.textAlign = "right"; c.fillText(String(D.sc[i]), W - 30, y + 8); c.textAlign = "left";
    if (up) { const ck = checkout(D.sc[i], 3 - D.d.length); c.font = "22px Georgia, serif"; c.fillStyle = ck ? "#9ae0a8" : "#c8b890"; c.fillText(ck ? `CHECKOUT: ${ck.join("  ")}` : `${3 - D.d.length} dart${3 - D.d.length === 1 ? "" : "s"} left`, 56, y + 30); }
  });
  // this visit (or the last one)
  const vis = D.d.length ? D.d : D.last?.d ?? [], tot = D.d.length ? D.vs - D.sc[D.turn] : D.last?.tot ?? 0;
  c.font = "bold 30px Georgia, serif"; c.fillStyle = "#f2ead8";
  for (let k = 0; k < 3; k++) { const v = vis[k]; c.strokeStyle = "#c9a040"; c.lineWidth = 2; c.strokeRect(30 + k * 150, 286, 138, 46); c.textAlign = "center"; c.fillText(v ? `${v[2]}${v[3] && v[2] !== String(v[3]) ? " " + v[3] : ""}` : "-", 99 + k * 150, 320); }
  c.textAlign = "left"; c.fillStyle = D.last?.note === "BUST" && !D.d.length ? "#ff8a7a" : "#e8c050"; c.fillText(D.last?.note === "BUST" && !D.d.length ? "BUST" : `VISIT ${tot}`, 500, 320);
  if (s.flash.t > 0) { c.fillStyle = "rgba(16,48,31,0.9)"; c.fillRect(W - 250, 270, 236, 72); c.fillStyle = "#ffe9a8"; c.font = "bold 40px Georgia, serif"; c.textAlign = "center"; c.fillText(s.flash.label, W - 132, 320); }
  if (n.ph === "over") { c.fillStyle = "rgba(10,30,18,0.85)"; c.fillRect(0, 60, W, 210); c.fillStyle = "#ffe9a8"; c.font = "bold 40px Georgia, serif"; c.textAlign = "center"; c.fillText(n.end === "void" ? "GAME CALLED OFF" : "GAME SHOT!", W / 2, 140); c.font = "26px Georgia, serif"; c.fillText(n.msg.slice(0, 48), W / 2, 200); }
}
/** the pool table's chalkboard: who's on what, the balls left, whose shot, visits */
function drawPoolBoard(c: C2D, W: number, H: number, s: Station, n: Note | null, cd: number) {
  c.fillStyle = "#1e2622"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(240,236,224,0.12)"; c.lineWidth = 22; for (let q = 0; q < 5; q++) { c.beginPath(); c.moveTo(q * 120, H); c.lineTo(q * 120 + 90, 0); c.stroke(); }
  c.fillStyle = CHALK; c.textAlign = "center"; c.font = `bold 34px ${HAND}`; c.fillText(`TABLE ${s.idx + 1}`, W / 2, 42);
  c.textAlign = "left";
  if (!n || n.ph === "free") { c.font = `28px ${HAND}`; c.textAlign = "center"; c.fillText("Winner stays on.", W / 2, 120); c.fillText(`Next: ____________`, W / 2, 175); c.font = `22px ${HAND}`; c.fillText(`(E at the table: ${PUB_NPCS.pool.name} or a mate)`, W / 2, 240); return; }
  if (n.ph === "waiting") { c.font = `30px ${HAND}`; c.textAlign = "center"; c.fillText(`${n.seats[0]?.[1] ?? ""} wants a game`, W / 2, 140); if (n.stake) c.fillText(`$${n.stake} a head`, W / 2, 195); return; }
  const P = n.pool;
  n.seats.forEach((q, i) => {
    const y = 105 + i * 82, g = P?.g[i] ?? null, up = n.ph === "play" && P?.turn === i;
    c.fillStyle = CHALK; c.font = `bold 32px ${HAND}`; c.fillText(`${up ? "> " : ""}${q[1].slice(0, 11)}`, 24, y);
    if (g && P) { const left = P.b.filter(([id, , , d]) => !d && ballColour(id) === g).length; for (let k = 0; k < 7; k++) { c.fillStyle = k < left ? (g === "red" ? "#e0484a" : "#f0d040") : "rgba(240,236,224,0.25)"; c.beginPath(); c.arc(290 + k * 28, y - 10, 10, 0, 6.3); c.fill(); } if (!left) { c.fillStyle = CHALK; c.font = `24px ${HAND}`; c.fillText("on the black", 290, y + 22); } }
    else { c.font = `22px ${HAND}`; c.fillStyle = "rgba(240,236,224,0.7)"; c.fillText(P?.brk ? "" : "open table", 290, y - 4); }
  });
  c.fillStyle = CHALK; c.font = `22px ${HAND}`;
  const info = n.ph === "over" ? n.msg : `${P?.brk ? "Break" : P && P.vis > 1 ? "2 visits" : ""}${n.stake ? `   $${n.stake} each` : ""}   ${n.ph === "play" && cd > 0 ? cd + "s" : ""}`;
  c.fillText(info.slice(0, 44), 24, 270);
  if (n.msg && n.ph === "play") { c.fillStyle = "#ffe9a8"; c.fillText(n.msg.slice(0, 44), 24, 310); }
}

/** a cabinet door's chalkboard: one player's 301, the running scores chalked down the side as visits come off */
function drawDoorScore(c: C2D, W: number, H: number, n: Note | null, seat: number, s: Station) {
  c.fillStyle = "#1e2622"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(240,236,224,0.10)"; c.lineWidth = 16; for (let q = 0; q < 5; q++) { c.beginPath(); c.moveTo(q * 60 - 20, H); c.lineTo(q * 60 + 50, 0); c.stroke(); }
  c.fillStyle = CHALK; c.textAlign = "center";
  const D = n?.darts, q = n?.seats[seat];
  if (!n || !D || !q || (n.ph !== "play" && n.ph !== "over")) { c.font = `bold 34px ${HAND}`; c.fillText(seat ? "AWAY" : "HOME", W / 2, 54); c.font = `30px ${HAND}`; c.fillText("301", W / 2, 130); return; }
  c.font = `bold 32px ${HAND}`; c.fillText(q[1].slice(0, 10).toUpperCase(), W / 2, 50);
  c.strokeStyle = CHALK; c.lineWidth = 3; c.beginPath(); c.moveTo(20, 70); c.lineTo(W - 20, 70); c.stroke();
  // the running list (kept per station: each visit's score off, as it happened)
  const hist = (s as unknown as { hist?: number[][] }).hist ??= [[301], [301]];
  if (D.sc[0] === 301 && D.sc[1] === 301 && D.n === 0) { hist[0] = [301]; hist[1] = [301]; }
  for (const k of [0, 1]) if (hist[k][hist[k].length - 1] !== D.sc[k]) hist[k].push(D.sc[k]);
  const h = hist[seat].slice(-7);
  c.font = `30px ${HAND}`;
  h.forEach((v, i) => { const y = 112 + i * 52, last = i === h.length - 1; c.globalAlpha = last ? 1 : 0.7; c.fillText(String(v), W / 2, y); if (!last) { c.beginPath(); c.moveTo(W / 2 - 40, y - 10); c.lineTo(W / 2 + 40, y - 10); c.stroke(); } });
  c.globalAlpha = 1;
  if (n.ph === "play" && D.turn === seat) {
    c.fillStyle = "#ffe9a8"; c.font = `bold 26px ${HAND}`; c.fillText(D.d.map((d) => d[2]).join("  ") || "throwing", W / 2, H - 70);
    const ck = checkout(D.sc[seat], 3 - D.d.length); if (ck) { c.font = `22px ${HAND}`; c.fillStyle = "#9ae0a8"; c.fillText(ck.join(" "), W / 2, H - 34); }
  }
  if (n.ph === "over" && n.win === q[0]) { c.fillStyle = "#ffe9a8"; c.font = `bold 34px ${HAND}`; c.fillText("GAME SHOT", W / 2, H - 50); }
}
