import "./styles.css";
import { Engine } from "./game/babylon.ts";
import { TitleScene } from "./game/titleScene.ts";
import { ArenaScene } from "./game/arenaScene.ts";
import { LocalSession, SOLO_ID } from "./localSession.ts";
import { HOST_LEFT } from "./p2p/peerRoom.ts";
import { ShopScreen } from "./ui/shopScreen.ts";
import { FpInput } from "./game/input.ts";
import { settings, updateSettings, onSettingsChange, type Settings } from "./settings.ts";
import { installAudioUnlock, isAudioUnlocked, whenAudioUnlocked, sfx, startTitleMusic, stopMusic } from "./audio.ts";
import {
  createRoom, joinRoom, friendlyError, type GameRoom, inviteLink, roomCodeFromUrl, setUrlRoom, rememberRoom, forgetRoom,
} from "./net.ts";
import {
  MSG, PLAYER_COLORS, normalizeRoomCode, isValidRoomCode, sanitizeName, randomBanditName, buildTrashington,
  lootDef, RARITY_COLOR, starsOf, type MoveInput, pinPos as pinPosOf, type WorldView, type WorldEvent,
} from "@bfb/shared";

// Both the server and this client build the same city from the same shared code.
const CITY = buildTrashington();

// ---------------------------------------------------------------------------
// DOM helpers
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
const TEST_MODE = new URLSearchParams(location.search).has("test");

function toast(text: string, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), ms);
  while ($("toasts").children.length > 4) $("toasts").firstElementChild?.remove();
}

function setStatus(text: string, isError = false) {
  const el = $("title-status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// Never fail silently: show any crash on screen so players can report it.
function showFatal(msg: string) {
  const el = document.getElementById("fatal");
  if (!el) return;
  el.textContent = "Something broke: " + msg + "\nPlease tell the developer what you clicked.";
  el.classList.remove("hidden");
}
window.addEventListener("error", (e) => showFatal(e.message || String(e.error)));
window.addEventListener("unhandledrejection", (e) => showFatal(String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason)));

const CONTROLS_TEXT = "WASD move / SHIFT sprint / SPACE jump + climb / C crouch (sprint+C slide) / Q dodge / E grab + search (mash E in a tug of war) / HOLD R rob a till / G drop / CLICK punch + smash / HOLD CLICK or F throw / RIGHT CLICK pockets / ESC menu";

// ---------------------------------------------------------------------------
// Core objects
const canvas = $<HTMLCanvasElement>("game");
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: TEST_MODE, antialias: true }, true);
const input = new FpInput(canvas);

type Screen = "title" | "loading" | "playing";
let screen: Screen = "title";
let title: TitleScene | null = null;
let arena: ArenaScene | null = null;
let room: GameRoom | null = null;
let mode: "solo" | "online" | null = null;
let dropped = false;
let leaving = false;
let ping = 0;
let lastPhase = "";
let lobbySig = "";
let settingsReturnTo: "title" | "pause" = "title";
/** Phase 5A: shop / upgrades screen open (mouse released, no pause menu) */
let overlayOpen = "";
const shop = new ShopScreen();
shop.send = (act) => arena?.onAction?.(act);

// ---------------------------------------------------------------------------
// Title
function enterTitle(message?: string, isError = false) {
  screen = "title";
  arena?.dispose();
  arena = null;
  input.enabled = false;
  input.releaseLock();
  if (!title) title = new TitleScene(engine);
  show("title");
  show("hud", false);
  show("pause", false);
  show("loading", false);
  const code = roomCodeFromUrl();
  if (code) {
    $("invite-code").textContent = code;
    show("invite-card");
    show("main-menu", false);
  } else {
    show("invite-card", false);
    show("main-menu");
  }
  setStatus(message ?? "", isError);
  startTitleMusic();
}

function leaveTitle() {
  title?.dispose();
  title = null;
  stopMusic();
  show("title", false);
}

function playerName(): string {
  const raw = $<HTMLInputElement>("name-input").value;
  const n = sanitizeName(raw);
  updateSettings({ playerName: n });
  $<HTMLInputElement>("name-input").value = n;
  return n;
}

// ---------------------------------------------------------------------------
// Solo
/** Show a loading note while the arena compiles its shaders, so there's no freeze on entry. */
async function prewarmArena(a: ArenaScene) {
  screen = "loading";
  show("loading");
  $("loading-text").textContent = "Unfolding the arena...";
  try { await a.prewarm(); } catch (e) { console.warn("prewarm failed (continuing)", e); }
}

let local: LocalSession | null = null;

async function startSolo() {
  const name = playerName();
  leaveTitle();
  mode = "solo";
  room = null;
  local = new LocalSession(name);
  arena = new ArenaScene(engine, input, CITY, 0);
  wireArena(arena);
  arena.applyWorld(local.view, SOLO_ID, performance.now());
  await prewarmArena(arena);
  enterPlaying();
  $("lp-title").textContent = "SOLO SCAVENGE";
  show("lp-code-row", false);
  $("lp-players").innerHTML = "";
  addPlayerRow(settings.playerName, 0, ["YOU"], true);
  $("lp-hint").textContent = "Press ENTER to start. Each cycle: 3 min scavenge, 1 min NIGHT scavenge (x2 loot, fort raids), then sell your fort loot at the pawn shop. 3 cycles, richest bandit wins!";
  $("mode-badge").textContent = "PHASE 5A / SOLO";
}

/** Hook the arena's loot actions + feedback up to the right place (server or local world). */
function wireArena(a: ArenaScene) {
  a.onAction = (act) => {
    if (local) local.sendAction(act);
    else if (room && !dropped) { try { room.send(MSG.ACTION, act); } catch { /* reconnecting */ } }
  };
  a.onFeedback = (text, kind) => flash(text, kind);
  a.onScreenFx = (fx, seconds) => screenFx(fx, seconds);
  a.onBanner = (title, sub, kind) => banner(title, sub, kind);
  a.onPawn = (e) => shop.onPawn(e);
}

// ---------------------------------------------------------------------------
// Phase 3: round loop HUD
let bannerTimer = 0;
function banner(title: string, sub: string, kind: "good" | "bad" | "info") {
  const el = $("big-banner");
  $("bb-title").textContent = title;
  $("bb-sub").textContent = sub;
  el.className = "big-banner " + kind;
  void el.offsetWidth;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => el.classList.add("hidden"), 3200);
}

/** Owner (online) or solo player, in the lobby or after the final results. */
function canStart(a: ArenaScene) {
  const ph = a.match.phase;
  if (ph !== "lobby" && ph !== "over") return false;
  if (mode === "solo") return true;
  return !!room && (room.state as any).ownerId === room.sessionId;
}
function startMatch() {
  if (!arena || !canStart(arena)) return;
  sfx.uiClick();
  if (local) local.start();
  else if (room) room.send(MSG.START);
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && screen === "playing" && arena && canStart(arena)) { e.preventDefault(); startMatch(); }
});

const fmtTime = (t: number) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
let wipeSig = "";
let matchSig = "", scoresSig = "", tallySig = "", eventSig = "", homeSig = "";
function updateMatchHud(a: ArenaScene) {
  const m = a.match;
  const starter = canStart(a);
  show("btn-start", starter);
  $("btn-start").textContent = m.phase === "over" ? "PLAY AGAIN" : "START MATCH";

  // timer
  let round = "", time = "", sub = "", cls = "mh-time";
  if (m.phase === "lobby") { time = "LOBBY"; sub = starter ? "Press ENTER to start the match" : "Waiting for the host to start"; }
  else if (m.phase === "intro") { round = `CYCLE ${m.round}/${m.rounds}`; time = String(Math.max(1, Math.ceil(m.timeLeft))); sub = "Get ready!"; }
  else if (m.phase === "scavenge") {
    round = `DAY ${m.round}/${m.rounds}`; time = fmtTime(m.timeLeft);
    if (m.timeLeft <= 10) cls += " danger"; else if (m.timeLeft <= 30) cls += " warn";
  } else if (m.phase === "dusk") { round = `CYCLE ${m.round}/${m.rounds}`; time = "NIGHTFALL"; sub = `Night scavenge in ${Math.max(1, Math.ceil(m.timeLeft))}`; }
  else if (m.phase === "night") {
    round = `NIGHT ${m.round}/${m.rounds}`; time = fmtTime(m.timeLeft); sub = "x2 loot / forts can be raided";
    if (m.timeLeft <= 10) cls += " danger"; else if (m.timeLeft <= 15) cls += " warn";
  } else if (m.phase === "dawn") { round = `CYCLE ${m.round}/${m.rounds}`; time = "SUNRISE"; sub = "The pawn shop opens soon"; }
  else if (m.phase === "shop") { round = `CYCLE ${m.round}/${m.rounds}`; time = fmtTime(m.timeLeft); sub = "PAWN SHOP"; }
  else if (m.phase === "upgrades") { round = `CYCLE ${m.round}/${m.rounds}`; time = fmtTime(m.timeLeft); sub = "UPGRADES"; }
  else if (m.phase === "over") { time = "MATCH OVER"; sub = starter ? "Press ENTER to play again" : "Waiting for the host"; }
  const sig = round + time + sub + cls;
  if (sig !== matchSig) {
    matchSig = sig;
    $("mh-round").textContent = round; $("mh-time").textContent = time; $("mh-sub").textContent = sub;
    $("mh-time").className = cls;
  }

  // scoreboard: cash from finished rounds (+ loot locked in your fort right now)
  const sSig = a.scores.map((x) => `${x.id}${x.name}${x.cash}${x.bank}${x.connected}`).join("|") + m.phase;
  if (sSig !== scoresSig) {
    scoresSig = sSig;
    const ol = $("scores");
    ol.innerHTML = "";
    if (m.phase !== "lobby") for (const x of a.scores) {
      const li = document.createElement("li");
      if (x.me) li.className = "me";
      const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PLAYER_COLORS[x.colorIdx % PLAYER_COLORS.length];
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = x.name + (x.connected ? "" : " (away)");
      const cash = document.createElement("span"); cash.className = "cash"; cash.textContent = "$" + x.cash;
      li.append(dot, nm, cash);
      if (x.bank > 0) { const b = document.createElement("span"); b.className = "bank"; b.textContent = "+" + x.bank; b.title = "loot banked in the fort (sell it at the pawn shop)"; li.append(b); }
      ol.appendChild(li);
    }
  }

  // current city event
  let ev = "", bad = false;
  if ((m.phase === "scavenge") && m.evKind) {
    const zone = Math.abs(m.evX) < 1 && Math.abs(m.evZ) < 1 ? "THE PLAZA" : `THE ${m.evZ > 0 ? "NORTH" : "SOUTH"}-${m.evX > 0 ? "EAST" : "WEST"} BLOCK`;
    if (m.evKind === "happyhour") ev = m.evStage === "live" ? `HAPPY HOUR IN ${zone}: DOUBLE LOOT (GOLD RING) - ${m.evT}s` : `HAPPY HOUR IN ${zone}...`;
    if (m.evKind === "truck") { ev = m.evStage === "warn" ? `GARBAGE TRUCK IN ${m.evT}s - CLEAR THE ROAD!` : "GARBAGE TRUCK ON THE ROAD!"; bad = true; }
    if (m.evKind === "airdrop") ev = m.evStage === "warn" ? `AIRDROP IN ${m.evT}s - PLAZA (RED TARGET)` : "AIRDROP CRATE FALLING INTO THE PLAZA!";
    if (m.evKind === "raccoons") { ev = m.evStage === "warn" ? "RACCOONS INCOMING..." : "RACCOONS ARE RAIDING THE FORTS!"; bad = true; }
  }
  if (ev + bad !== eventSig) {
    eventSig = ev + bad;
    const el = $("event-hud");
    el.textContent = ev;
    el.className = "event-hud" + (bad ? " bad" : "") + (ev ? "" : " hidden");
  }

  // home compass (during the round, when you're away from your fort)
  const h = a.home();
  const showHome = (m.phase === "scavenge" || m.phase === "night") && !h.inside;
  const hSig = showHome ? `${Math.round(h.dist)}|${Math.round(h.bearing * 20)}|${m.timeLeft <= (m.phase === "night" ? 15 : 30)}` : "";
  if (hSig !== homeSig) {
    homeSig = hSig;
    show("home-arrow", showHome);
    if (showHome) {
      $("ha-arrow").style.transform = `rotate(${h.bearing}rad)`;
      $("home-arrow").style.setProperty("--home", PLAYER_COLORS[a.myColorIdx % PLAYER_COLORS.length]);
      $("ha-text").textContent = `HOME ${Math.round(h.dist)} m`;
      $("home-arrow").classList.toggle("urgent", m.timeLeft <= (m.phase === "night" ? 15 : 30));
    }
  }

  // wiped out by a car: countdown to respawn
  const wipe = a.respawnT > 0 ? `Hit by a car! Your loot is all over the road. Back at your fort in ${Math.ceil(a.respawnT)}...` : "";
  if (wipe !== wipeSig) {
    wipeSig = wipe;
    show("wipeout", !!wipe);
    $("wipeout-sub").textContent = wipe;
  }

  // tally / final results card
  const showTally = m.phase === "dawn" || m.phase === "over";
  const tSig = showTally ? m.phase + m.round + m.results + Math.ceil(m.timeLeft) + starter : "";
  if (tSig !== tallySig) {
    tallySig = tSig;
    show("tally", showTally);
    if (showTally) renderTally(a, starter);
  }
  document.body.classList.toggle("night", m.phase === "night" || m.phase === "dusk");

  // Phase 5A: pawn shop + upgrades screens (the mouse is released while they're open)
  const ov = m.phase === "shop" ? "shop" : m.phase === "upgrades" ? "upgrades" : "";
  if (ov !== overlayOpen) {
    const was = overlayOpen;
    overlayOpen = ov;
    show("shop", ov === "shop");
    show("upgrades", ov === "upgrades");
    a.fortView = ov === "upgrades";
    if (ov) {
      input.clear();
      input.enabled = false;
      if (input.dragLook) input.enabled = false;
      input.releaseLock();
      show("pause", false);
    } else if (was && screen === "playing") {
      if (input.dragLook) input.enabled = true; else showPause(true);
    }
  }
  const myCash = a.scores.find((x) => x.me)?.cash ?? 0;
  if (ov === "shop") shop.update(a.shopJson, m.timeLeft, myCash, a.ready);
  if (ov === "upgrades") shop.updateUpgrades(m.timeLeft, a.ready);
}

function renderTally(a: ArenaScene, starter: boolean) {
  const m = a.match;
  let lines: { id: string; name: string; colorIdx: number; banked: number; bankedValue: number; lost: number; lostValue: number; stolen: number; cash: number }[] = [];
  try { lines = JSON.parse(m.results || "[]"); } catch { /* keep empty */ }
  const over = m.phase === "over";
  $("tally-title").textContent = over ? `RICHEST BANDIT: ${lines[0]?.name ?? "?"}` : `CYCLE ${m.round}: SUNRISE`;
  const table = $("tally-table") as HTMLTableElement;
  table.innerHTML = "";
  const head = table.insertRow();
  for (const h of over ? ["BANDIT", "LOST", "CASH"] : ["BANDIT", "FORT LOOT", "LOST", "CASH"]) { const th = document.createElement("th"); th.textContent = h; head.appendChild(th); }
  lines.forEach((l, i) => {
    const tr = table.insertRow();
    if (i === 0 && over) tr.className = "winner";
    const name = tr.insertCell();
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PLAYER_COLORS[l.colorIdx % PLAYER_COLORS.length];
    name.append(dot, document.createTextNode(l.name));
    if (!over) { const b = tr.insertCell(); b.className = "money"; b.textContent = `$${l.bankedValue}` + (l.banked ? ` (${l.banked})` : ""); }
    const lost = tr.insertCell(); lost.className = l.lost || l.stolen ? "neg" : "";
    lost.textContent = [l.lost ? `${l.lost} item${l.lost > 1 ? "s" : ""}` : "", l.stolen ? `${l.stolen} to raccoons` : ""].filter(Boolean).join(", ") || "-";
    const tot = tr.insertCell(); tot.className = "money"; tot.textContent = "$" + l.cash;
  });
  $("tally-foot").textContent = over
    ? (starter ? "The race for Mayor comes in a later phase. Press ENTER to play again." : "The race for Mayor comes in a later phase. Waiting for the host...")
    : `Fort loot goes to the pawn shop in ${Math.max(1, Math.ceil(m.timeLeft))}... (sell it or lose it)`;
}

const fxTimers: Record<string, number> = {};
const fxHistory: string[] = []; // for automated tests (effects can be over before a slow test looks)
/** Full-screen HTML effects: camera flash, pigeon swarm, knocked-down daze. */
function screenFx(fx: "flash" | "swarm" | "knocked" | "zap", seconds: number) {
  if (fxHistory.push(fx) > 50) fxHistory.shift();
  const el = $("fx-" + fx);
  el.classList.remove("hidden", "on");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("on");
  clearTimeout(fxTimers[fx]);
  fxTimers[fx] = window.setTimeout(() => el.classList.add("hidden"), seconds * 1000);
}

let flashTimer = 0;
function flash(text: string, kind: "bad" | "good" | "info") {
  const el = $("flash");
  el.textContent = text;
  el.className = "flash " + kind;
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { el.className = "flash hidden"; }, 1100);
}

// ---------------------------------------------------------------------------
// Online
async function goOnline(kind: "create" | "join", code?: string) {
  const name = playerName();
  screen = "loading";
  show("loading");
  $("loading-text").textContent = kind === "create" ? "Building a room out of cardboard..." : `Knocking on fort ${code}...`;
  try {
    const r = kind === "create" ? await createRoom(name) : await joinRoom(code!, name);
    await waitForFirstState(r);
    sfx.join();
    await enterOnline(r);
  } catch (e) {
    console.warn("join failed", e);
    sfx.error();
    show("loading", false);
    if (kind === "join") setUrlRoom(null);
    enterTitle(friendlyError(e), true);
  }
}

function waitForFirstState(r: GameRoom): Promise<void> {
  return new Promise((resolve, reject) => {
    const ready = () => (r.state as any)?.players?.get?.(r.sessionId);
    if (ready()) return resolve();
    const timer = setTimeout(() => reject(new Error("timeout waiting for room state")), 8000);
    const off = r.onStateChange(() => {
      if (ready()) {
        clearTimeout(timer);
        (off as any)?.clear?.();
        resolve();
      }
    });
  });
}

async function enterOnline(r: GameRoom) {
  leaveTitle();
  room = r;
  mode = "online";
  dropped = false;
  leaving = false;
  lastPhase = "";
  lobbySig = "";
  setUrlRoom(r.roomId);
  rememberRoom(r);
  const me = (r.state as any).players.get(r.sessionId);
  local = null;
  arena = new ArenaScene(engine, input, CITY, me.colorIdx);
  wireArena(arena);
  r.onStateChange((state: any) => onRoomState(state));
  r.onMessage(MSG.EVENTS, (ev: WorldEvent[]) => arena?.handleEvents(ev));
  onRoomState(r.state);
  await prewarmArena(arena);
  enterPlaying();
  lobbySig = ""; // force the lobby panel (and host's START button) to redraw after entering
  onRoomState(r.state);
  $("lp-title").textContent = "LOBBY";
  show("lp-code-row");
  $("lp-code").textContent = r.roomId;
  $("mode-badge").textContent = r.isHost ? "PHASE 5A / HOSTING" : "PHASE 5A / ONLINE";

  r.onMessage(MSG.ANNOUNCE, (m: { text: string }) => toast(m.text));
  r.onDrop(() => {
    dropped = true;
    show("reconnect-banner");
  });
  r.onReconnect(() => {
    dropped = false;
    show("reconnect-banner", false);
    toast("Reconnected!");
    rememberRoom(r);
  });
  r.onLeave((code: number) => {
    if (leaving || room !== r) return;
    room = null;
    forgetRoom();
    setUrlRoom(null);
    sfx.error();
    enterTitle(code === HOST_LEFT
      ? "The host ended the game (the game runs in their browser). Create a room to host your own!"
      : `You were disconnected from the room (code ${code}). You can create or join a new one.`, true);
  });
  onRoomState(r.state);
}

let savedToken = "";
function onRoomState(state: any) {
  if (!arena || !room) return;
  // the SDK gets a new reconnection token after an automatic reconnect: keep the saved one fresh
  if (room.reconnectionToken && room.reconnectionToken !== savedToken) { savedToken = room.reconnectionToken; rememberRoom(room); }
  arena.applyWorld(state as WorldView, room.sessionId, performance.now());

  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
  }
  // Rebuild the player list only when something visible changed
  const list: string[] = [];
  state.players.forEach((p: any, sid: string) => list.push(`${sid}:${p.name}:${p.colorIdx}:${p.connected}`));
  const sig = list.join("|") + state.ownerId + state.phase;
  if (sig !== lobbySig) {
    lobbySig = sig;
    $("lp-title").textContent = state.phase === "lobby" ? "LOBBY" : "MATCH";
    $("lp-players").innerHTML = "";
    state.players.forEach((p: any, sid: string) => {
      const tags: string[] = [];
      if (sid === room!.sessionId) tags.push("YOU");
      if (sid === state.ownerId) tags.push("HOST");
      addPlayerRow(p.name + (p.connected ? "" : " (reconnecting)"), p.colorIdx, tags, p.connected);
    });
    const isOwner = state.ownerId === room.sessionId;
    $("lp-hint").textContent = state.phase === "lobby"
      ? (isOwner ? `${state.players.size}/4 bandits. Press ENTER (or ESC > START MATCH) when everyone's here.${room.isHost ? " You're hosting: the game runs in this tab, so keep it open!" : ""}` : "Waiting for the host to start. Explore meanwhile!")
      : "Scavenge, get home before time's up, sell at the pawn shop. Richest after 3 cycles wins!";
  }
}

function addPlayerRow(name: string, colorIdx: number, tags: string[], connected: boolean) {
  const li = document.createElement("li");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const nm = document.createElement("span");
  nm.textContent = name; // textContent: names can never inject HTML
  if (!connected) nm.className = "off";
  li.append(dot, nm);
  for (const t of tags) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t;
    li.appendChild(tag);
  }
  $("lp-players").appendChild(li);
}

async function leaveGame() {
  sfx.uiBack();
  if (room) {
    leaving = true;
    const r = room;
    room = null;
    try { await r.leave(true); } catch { /* already gone */ }
  }
  forgetRoom();
  setUrlRoom(null);
  mode = null;
  local = null;
  show("reconnect-banner", false);
  enterTitle();
}

// ---------------------------------------------------------------------------
// Playing / pause
function enterPlaying() {
  screen = "playing";
  show("loading", false);
  show("hud");
  show("btn-pause-copy", mode === "online");
  show("btn-start", false);
  showPause(true);
}

function showPause(on: boolean) {
  show("pause", on);
  $("btn-resume").textContent = arena && input.enabled === false && !document.pointerLockElement && screen === "playing" && lastLockTime === 0
    ? "CLICK TO PLAY" : "RESUME";
}

let lastLockTime = 0;
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (input.dragLook && !locked) return;
  input.enabled = locked;
  if (locked) {
    lastLockTime = performance.now();
    show("pause", false);
    show("controls-hint", true);
    $("controls-hint").textContent = CONTROLS_TEXT;
  } else {
    input.clear();
    if (screen === "playing" && $("settings").classList.contains("hidden") && !overlayOpen) showPause(true);
  }
});
function enterDragLook() {
  input.dragLook = true;
  input.enabled = true;
  show("pause", false);
  $("controls-hint").textContent = "HOLD LEFT MOUSE + DRAG to look / " + CONTROLS_TEXT;
  canvas.focus();
}

let lockFailures = 0;
async function resume() {
  sfx.uiClick();
  if (input.dragLook) { enterDragLook(); return; }
  const ok = await input.requestLock();
  if (!ok && screen === "playing") {
    lockFailures++;
    // Browsers refuse a re-lock for ~1s after ESC; a second refusal means this page can't capture the mouse.
    if (lockFailures >= 2 || window.top !== window.self) {
      toast("Mouse capture isn't allowed here, so hold the left mouse button and drag to look.", 6000);
      enterDragLook();
    } else {
      toast("Click again to capture the mouse");
    }
  } else if (ok) {
    lockFailures = 0;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && screen === "playing" && input.dragLook && $("pause").classList.contains("hidden") && $("settings").classList.contains("hidden")) {
    input.enabled = false;
    input.clear();
    showPause(true);
  }
});

canvas.addEventListener("click", () => {
  if (screen === "playing" && !input.locked && !input.dragLook && !overlayOpen) void resume();
});

// ---------------------------------------------------------------------------
// Settings UI
function syncSettingsUI(s: Settings) {
  document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((el) => {
    const k = el.dataset.setting as keyof Settings;
    if (el.type === "checkbox") el.checked = Boolean(s[k]);
    else el.value = String(s[k]);
  });
  const fv = document.querySelector<HTMLElement>('[data-val="fov"]');
  if (fv) fv.textContent = `(${s.fov}°)`;
}

document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((el) => {
  el.addEventListener("input", () => {
    const k = el.dataset.setting as keyof Settings;
    const v = el.type === "checkbox" ? el.checked : Number(el.value);
    updateSettings({ [k]: v } as Partial<Settings>);
  });
});
onSettingsChange((s) => {
  syncSettingsUI(s);
  arena?.applyFov();
  show("debug", s.showFps);
});

function openSettings(from: "title" | "pause") {
  sfx.uiClick();
  settingsReturnTo = from;
  syncSettingsUI(settings);
  show("pause", false);
  show("settings");
}
function closeSettings() {
  sfx.uiBack();
  show("settings", false);
  if (settingsReturnTo === "pause" && screen === "playing") showPause(true);
}

// ---------------------------------------------------------------------------
// Buttons
function onClick(id: string, fn: () => void) {
  const el = $(id);
  el.addEventListener("click", fn);
  el.addEventListener("pointerenter", () => { if (isAudioUnlocked()) sfx.uiHover(); });
}

onClick("btn-solo", () => { sfx.uiClick(); void startSolo(); });
const PREVIEW_SOLO = import.meta.env.VITE_PREVIEW_SOLO === "1";
const previewOnly = () => { sfx.error(); setStatus("This preview page is solo-only. Multiplayer rooms need the game server, which comes with the real website link.", true); };
onClick("btn-create", () => { if (PREVIEW_SOLO) return previewOnly(); sfx.uiClick(); void goOnline("create"); });
onClick("btn-join", () => {
  if (PREVIEW_SOLO) return previewOnly();
  const code = normalizeRoomCode($<HTMLInputElement>("code-input").value);
  if (!isValidRoomCode(code)) {
    sfx.error();
    setStatus("Room codes are 5 characters, like KB7QX.", true);
    return;
  }
  sfx.uiClick();
  void goOnline("join", code);
});
$("code-input").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") $("btn-join").click(); });
onClick("btn-settings", () => openSettings("title"));
onClick("btn-accept-invite", () => {
  const code = roomCodeFromUrl();
  sfx.uiClick();
  if (code) void goOnline("join", code);
});
onClick("btn-decline-invite", () => {
  sfx.uiBack();
  setUrlRoom(null);
  show("invite-card", false);
  show("main-menu");
});
onClick("btn-resume", () => void resume());
onClick("btn-pause-settings", () => openSettings("pause"));
onClick("btn-settings-close", closeSettings);
onClick("btn-leave", () => void leaveGame());
onClick("btn-start", () => startMatch());
const copyInvite = async () => {
  if (!room) return;
  const ok = await copyText(inviteLink(room.roomId));
  if (ok) { sfx.copied(); toast("Invite link copied! Paste it to your friends."); }
  else { sfx.error(); toast(`Couldn't copy automatically. Share this code: ${room.roomId}`, 5000); }
};
onClick("btn-copy", () => void copyInvite());
onClick("btn-pause-copy", () => void copyInvite());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("settings").classList.contains("hidden")) closeSettings();
});

// ---------------------------------------------------------------------------
// HUD: stamina bar (only visible when not full) + winded flash + dodge-ready pip
let hudStaminaShown = -1;
function updateHud(a: ArenaScene) {
  const h = a.hud();
  const pct = Math.round(h.stamina * 100);
  if (pct !== hudStaminaShown) {
    hudStaminaShown = pct;
    $("stamina-fill").style.width = pct + "%";
  }
  $("stamina").classList.toggle("full", pct >= 100 && !h.winded);
  $("stamina").classList.toggle("winded", h.winded);
  $("dodge-pip").classList.toggle("ready", h.dodgeReady);

  // Look prompt: "[E] Grab Old CRT TV  $34"
  const t = a.lookTarget;
  const pt = a.punchTarget;
  const prompt = $("prompt");
  const ut = a.useTarget;
  const robbing = a.robT >= 0;
  const rt = a.robTarget;
  const jailed = a.jailT > 0;
  const sig = jailed ? "jail" : robbing ? "rob" : t ? t.id + t.note + t.value + (rt ? "R" : "") : ut ? "use" + ut.id + ut.empty : rt ? "till" + rt.id + rt.empty : pt ? "npc" + pt.id + pt.empty : "";
  const simple = (keyText: string, verbText: string, nameText: string, metaText: string) => {
    prompt.innerHTML = "";
    const key = document.createElement("span"); key.className = "key"; key.textContent = keyText;
    const verb = document.createElement("span"); verb.textContent = verbText;
    const name = document.createElement("b"); name.textContent = nameText;
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = metaText;
    prompt.append(key, verb, name, meta);
    prompt.classList.remove("hidden");
  };
  if (sig !== promptSig) {
    promptSig = sig;
    if (jailed) prompt.classList.add("hidden");
    else if (robbing) simple("HOLD R", " Robbing ", "the till", "keep holding... don't move!");
    else if (!t && ut) simple("E", " Search ", ut.name, ut.empty ? "EMPTY - refills later" : "random junk inside (maybe treasure, maybe a raccoon)");
    else if (!t && rt) simple("HOLD R", " Rob ", "the till", rt.empty ? "EMPTY right now (refills later)" : "3 s hold-up: sets off the alarm");
    else if (!t && pt?.prop) {
      simple("CLICK", " Smash ", pt.name, pt.empty ? "already smashed - comes back later" : pt.kind === "car" ? "grab what's on the seat (car alarm!)" : "loot inside");
    } else if (!t && pt) {
      // "[CLICK] Bonk Gym Bro  - fights back!"
      simple("CLICK", " Bonk ", pt.name, pt.kind === "bodyguard" ? "protects the boss: hits hard" : pt.kind === "cashier" ? "drops the float... and sets off the alarm" : pt.kind === "cop" ? "RESISTING ARREST: huge heat, 3 hits to drop them" : pt.fighter ? "FIGHTS BACK - land 2 hits before they do" : "might drop something");
    } else if (!t) prompt.classList.add("hidden");
    else {
      const d = t.def;
      const rarity = d.mystery && d.rarity !== "common" ? "mystery" : d.rarity;
      const tags: string[] = [];
      if (d.size === "small") tags.push("POCKETABLE");
      if (d.heavy && d.size !== "giant") tags.push("HEAVY");
      if (d.size === "giant") tags.push("DRAG IT (SLOW)");
      if (d.money) tags.push("CASH: STRAIGHT TO YOUR WALLET");
      prompt.innerHTML = "";
      const locked = t.note.startsWith("LOCKED");
      const raid = t.note.startsWith("RAID");
      const key = document.createElement("span"); key.className = "key"; key.textContent = locked ? "BANKED" : "E";
      const verb = document.createElement("span");
      verb.textContent = t.note === "TUG" ? " Tug of war for " : raid ? ` RAID ${a.fortName(Number(t.note.split(":")[1]))}'s fort: ` : locked ? ` in ${a.fortName(Number(t.note.split(":")[1]))}'s fort (safe until night): ` : " Grab ";
      const name = document.createElement("b"); name.textContent = d.name; name.style.color = RARITY_COLOR[rarity];
      const price = document.createElement("span"); price.className = "price"; price.textContent = d.mystery ? "  $???" : `  $${t.value}`;
      const meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = [rarity.toUpperCase(), ...tags].join("  /  ") + "  -  " + d.blurb + (rt && d.type === "cash_register" ? "  |  or HOLD R for a quick hold-up" : "");
      prompt.append(key, verb, name, price, meta);
      prompt.classList.remove("hidden");
    }
  }

  // Pockets bar
  const inv = a.inventory;
  const invSig = inv.hand + "|" + inv.pockets.join(",") + "|" + inv.sel;
  if (invSig !== pocketsSig) {
    pocketsSig = invSig;
    const slot = (el: HTMLElement, id: string, selected: boolean) => {
      const type = id ? a.itemType(id) : null;
      el.classList.toggle("sel", selected);
      el.classList.toggle("filled", !!type);
      el.textContent = type ? lootDef(type).name : "empty";
      el.style.borderColor = type ? RARITY_COLOR[lootDef(type).mystery && lootDef(type).rarity !== "common" ? "mystery" : lootDef(type).rarity] : "";
    };
    slot($("slot-hand"), inv.hand, false);
    for (let i = 0; i < 3; i++) slot($("slot-" + i), inv.pockets[i], i === inv.sel && !inv.hand);
  }

  // Heat meter + wanted stars (30 / 60 / 90 heat)
  const heat = a.heat;
  if (heat !== heatShown) {
    heatShown = heat;
    $("heat-fill").style.width = heat + "%";
    $("heat").classList.toggle("cold", heat <= 0);
    $("heat").classList.toggle("hot", heat >= 60);
    const stars = starsOf(heat);
    $("stars").querySelectorAll("b").forEach((b, i) => b.classList.toggle("on", i < stars));
    $("heat").classList.toggle("wanted", stars > 0);
  }
  document.body.classList.toggle("jailed", jailed);

  // tug of war meter (your side on the right)
  const tg = a.tug;
  show("tug", !!tg);
  if (tg) $("tug-knob").style.left = `${Math.round(50 + tg.balance * 50)}%`;

  updateMatchHud(a);

  // Throw charge ring
  const c = a.throwCharge;
  const ring = $("charge");
  if (c < 0) ring.classList.add("hidden");
  else {
    ring.classList.remove("hidden");
    ring.style.setProperty("--p", String(Math.round(c * 100)));
    ring.classList.toggle("max", c >= 1);
  }
}
let promptSig = "";
let heatShown = -1;
let pocketsSig = "";

// ---------------------------------------------------------------------------
// Main loop
let debugTimer = 0;
/** worst-case milliseconds per part of the frame (for performance tests) */
let netOut: MoveInput[] = [];
let lastNetSend = 0;
const perf = { update: 0, world: 0, apply: 0, events: 0, render: 0, hud: 0, frame: 0 };
let fpsSmooth = 60;
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000;
  const now = performance.now();
  if (dt > 0) fpsSmooth += (1 / Math.max(dt, 1e-3) - fpsSmooth) * 0.05;
  if (title) {
    title.update(dt);
    title.scene.render();
  } else if (arena) {
    const t0 = performance.now();
    arena.update(dt, now);
    const t1 = performance.now();
    const out = arena.takeOutbox();
    if (local) {
      // Solo: our own World runs right here, with zero lag
      local.sendInputs(out);
      const ev = local.step(dt);
      const t2 = performance.now();
      arena.applyWorld(local.view, SOLO_ID, now);
      const t3 = performance.now();
      if (ev.length) arena.handleEvents(ev);
      perf.update = Math.max(perf.update, t1 - t0); perf.world = Math.max(perf.world, t2 - t1); perf.apply = Math.max(perf.apply, t3 - t2); perf.events = Math.max(perf.events, performance.now() - t3);
    } else if (room && !dropped) {
      // batch inputs: at most ~30 packets a second (every input is still sent, just grouped),
      // which halves the server's per-message work on the small hosting plan
      if (out.length) netOut.push(...out);
      if (netOut.length && (room.isHost || now - lastNetSend >= 33)) {
        lastNetSend = now;
        const batch = netOut; netOut = [];
        try { room.send(MSG.INPUT, batch); } catch { /* connection mid-drop: reconciliation fixes it */ }
      }
    }
    const tr = performance.now();
    arena.scene.render();
    perf.render = Math.max(perf.render, performance.now() - tr);
    const th = performance.now();
    updateHud(arena);
    perf.hud = Math.max(perf.hud, performance.now() - th);
    perf.frame = Math.max(perf.frame, performance.now() - t0);
    debugTimer += dt;
    if (settings.showFps && debugTimer > 0.25) {
      debugTimer = 0;
      const p = arena.position;
      $("debug").textContent =
        `FPS ${fpsSmooth.toFixed(0)}  ping ${mode === "online" ? ping + "ms" : "n/a"}\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}\n` +
        `unconfirmed inputs ${arena.stats.pending}  corrections ${arena.stats.corrections}\n` +
        `others ${arena.remoteCount()}`;
    }
  } else {
    engine.clear(null as any, true, true);
  }
});
window.addEventListener("resize", () => engine.resize());
// Performance mode renders at a lower resolution (big win on older laptops / integrated graphics)
const applyScaling = () => engine.setHardwareScalingLevel(settings.lowGraphics ? 1.5 : 1);
applyScaling();
onSettingsChange(applyScaling);
setInterval(() => { if (room && !dropped) room.ping((ms: number) => { ping = Math.round(ms); }); }, 2000);

// Hosting: the game lives in this tab, so warn before a refresh/close ends it for everyone,
// and say goodbye to the other players if the tab closes anyway.
window.addEventListener("beforeunload", (e) => {
  if (room?.isHost && (room as any).connectedPeers > 0 && !TEST_MODE) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("pagehide", () => { if (room?.isHost) void room.leave(true); });

// ---------------------------------------------------------------------------
// Boot
installAudioUnlock();
whenAudioUnlocked(() => show("sound-hint", false));
if (!settings.playerName) updateSettings({ playerName: randomBanditName() });
$<HTMLInputElement>("name-input").value = settings.playerName;
syncSettingsUI(settings);
show("debug", settings.showFps);
enterTitle();

// Read-only hooks for automated tests (and curious devs). Movement override only in ?test mode.
(window as any).__bfb = {
  info: () => ({
    screen, mode, roomCode: room?.roomId ?? null, sessionId: room?.sessionId ?? null,
    pos: arena?.position ?? null, stats: arena ? { ...arena.stats } : null, remotes: arena?.remoteCount() ?? 0,
    hud: arena ? arena.hud() : null,
    remotePoses: arena && room ? (() => { const o: any = {}; (room!.state as any).players.forEach((_p: any, id: string) => { if (id !== room!.sessionId) o[id] = arena!.remotePose(id); }); return o; })() : null,
    players: room ? (() => { const o: any = {}; (room!.state as any).players.forEach((p: any, id: string) => { o[id] = { name: p.name, x: p.x, z: p.z, connected: p.connected }; }); return o; })() : null,
    phase: room ? (room.state as any).phase : null, ping, fps: Math.round(fpsSmooth),
    drawCalls: (engine as any)._drawCalls?.current ?? null,
  }),
  ...(TEST_MODE ? {
    setAxes: (a: { mx: number; mz: number; sprint?: boolean; jump?: boolean; crouch?: boolean; dodge?: boolean } | null) => {
      input.override = a ? { mx: a.mx, mz: a.mz, sprint: !!a.sprint, jump: !!a.jump, crouch: !!a.crouch, dodge: !!a.dodge } : null;
    },
    setYaw: (y: number) => { input.yaw = y; },
    setPitch: (p: number) => { input.pitch = p; },
    teleport: (x: number, z: number, yaw: number) => {
      if (local) local.teleport(x, z, yaw); else room?.send("dbg", { op: "teleport", x, z, yaw });
      arena?.debugTeleport(x, z, yaw);
    },
    spawnItem: (type: string, x: number, z: number) => { if (local) return local.spawnItem(type, x, z); room?.send("dbg", { op: "spawn", type, x, z }); return null; },
    items: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.items?.forEach((it: any, id: string) => out.push({ id, type: it.type, x: it.x, y: it.y, z: it.z, mode: it.mode, holder: it.holder, holder2: it.holder2, value: it.value, resting: it.resting, lock: it.lock, fort: it.fort, mult: it.mult })); return out; },
    inventory: () => arena?.inventory ?? null,
    serverInventory: () => { const v: any = local ? local.view : room?.state; const p = v?.players?.get(local ? SOLO_ID : room?.sessionId); return p ? { hand: p.hand, pockets: [p.p0, p.p1, p.p2], sel: p.sel, carryMul: p.carryMul } : null; },
    lookTarget: () => arena?.lookTarget ? { id: arena.lookTarget.id, type: arena.lookTarget.def.type } : null,
    landmarks: () => CITY.landmarks,
    worldTime: () => local?.world.time ?? null,
    testInput: (on: boolean) => { input.assumeLocked = on; input.enabled = on; if (!on) input.clear(); show("pause", !on && screen === "playing"); },
    perf: (reset = false) => { const o = { ...perf }; if (reset) for (const k in perf) (perf as any)[k] = 0; return o; },
    move: () => arena?.moveState ?? null,
    scene: () => (title?.scene ?? arena?.scene),
    dropConnection: () => { if (room?.testDrop) room.testDrop(); else (room as any)?.connection?.close?.(); },
    hostStats: () => (room as any)?.stats ? { ...(room as any).stats, peers: (room as any).connectedPeers } : null,
    npcs: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.npcs?.forEach((n: any, id: string) => out.push({ id, kind: n.kind, x: n.x, y: n.y, z: n.z, state: n.state, target: n.target, robbed: n.robbed })); return out; },
    placeNpc: (kind: string, x: number, z: number, yaw = 0) => { if (local) return local.placeNpc(kind, x, z, yaw); room?.send("dbg", { op: "npc", kind, x, z, yaw }); return null; },
    clearNpcs: (x: number, z: number, r: number) => { if (local) local.world.npc.removeNear(x, z, r); else room?.send("dbg", { op: "clearNpcs", x, z, r }); },
    match: () => arena ? { ...arena.match, scores: arena.scores, home: arena.home() } : null,
    // Phase 5A
    shop: () => arena ? { open: overlayOpen === "shop", offers: shop.list, json: arena.shopJson, ready: arena.ready } : null,
    shopAct: (act: any) => arena?.onAction?.(act),
    night: () => arena ? { level: arena.nightLevel, body: document.body.classList.contains("night") } : null,
    tug: () => arena?.tug ?? null,
    overlay: () => overlayOpen,
    fortView: () => arena?.fortView ?? false,
    tugPress: () => arena?.onAction?.({ a: "tug" }),
    startMatch: () => startMatch(),
    triggerEvent: (kind: string) => { if (local) local.world.match.trigger(kind as never); else room?.send("dbg", { op: "event", kind }); },
    setTimeLeft: (t: number) => { if (local) { if (local.world.match.phase !== "lobby") local.world.match.timeLeft = t; } else room?.send("dbg", { op: "time", t }); },
    noEvents: () => { if (local) local.world.match.cancelPlannedEvents(); else room?.send("dbg", { op: "noEvents" }); },
    fxHistory: () => [...fxHistory],
    props: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.props?.forEach((pv: any, id: string) => out.push({ id, ready: pv.ready, alarm: pv.alarm })); return out; },
    propDefs: () => CITY.props,
    cars: () => arena?.carPositions() ?? [],
    useTarget: () => arena?.useTarget ?? null,
    robTarget: () => arena?.robTarget ?? null,
    robT: () => arena?.robT ?? -1,
    respawnT: () => arena?.respawnT ?? 0,
    wipeout: () => { if (local) { const p = local.world.players.get(SOLO_ID)!; local.world.traffic.wipeout(p, local.world.traffic.cars[0]); } else room?.send("dbg", { op: "wipeout" }); },
    npcStats: () => arena?.npcStats() ?? null,
    npcDrawn: (id: string) => arena?.npcDrawnPos(id) ?? null,
    punchTarget: () => arena?.punchTarget ?? null,
    heat: () => arena?.heat ?? null,
    // ---- Phase 4 police + jail
    setHeat: (v: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; p.notoriety = 0; local.world.addHeat(p, v); } else room?.send("dbg", { op: "heat", v }); },
    bust: () => { if (local) local.world.police.bust(local.world.players.get(SOLO_ID)!, "test", false); else room?.send("dbg", { op: "bust" }); },
    setJailTime: (t: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; if (p.jailT > 0) p.jailT = t; } else room?.send("dbg", { op: "jailTime", t }); },
    clearCops: () => { if (local) local.world.police.reset(); else room?.send("dbg", { op: "clearCops" }); },
    jail: () => arena ? { jailT: arena.jailT, seed: arena.lockSeed, open: arena.lock.open, set: arena.lock.run?.set ?? 0, pins: arena.lock.run?.def.pins.length ?? 0, sel: arena.lock.sel, history: [...arena.lock.history], solved: !!arena.lock.run?.solved, noise: arena.lock.run?.noise ?? 0, cx: arena.lock.cx, cy: arena.lock.cy, hover: arena.lock.hoverPin() } : null,
    /** Pick the lock perfectly THROUGH the real UI (keys + timing), like a very good player. */
    lockAutoPlay: () => new Promise<boolean>((resolve) => {
      const L = arena?.lock;
      if (!L?.run) return resolve(false);
      const stepOnce = () => {
        const r = L.run;
        if (!r) return resolve(true);
        if (r.solved) return resolve(true);
        const want = r.def.order[r.set];
        // walk the selection to the binding pin with D presses
        if (L.sel !== want) { L.key("KeyD"); return setTimeout(stepOnce, 30); }
        const p = r.def.pins[want];
        const now = L.now();
        if (now < r.lockUntil) return setTimeout(stepOnce, 100);
        // find the next window, then poll the lock clock and press SPACE while inside it
        let a = now + 0.02; let guard = 0;
        while (!(pinPosOf(p, a) >= p.lo && pinPosOf(p, a) <= p.hi) && guard++ < 5000) a += 0.002;
        let b = a; guard = 0;
        while (pinPosOf(p, b) >= p.lo && pinPosOf(p, b) <= p.hi && guard++ < 5000) b += 0.002;
        const lo = a + (b - a) * 0.25, hi = b - (b - a) * 0.25;
        const poll = () => {
          const t = L.now();
          if (t > hi) return stepOnce(); // missed it (slow frame): aim for the next one
          if (t >= lo) { L.key("Space"); return setTimeout(stepOnce, 40); }
          setTimeout(poll, 4);
        };
        poll();
      };
      stepOnce();
    }),
    copCars: () => arena?.copCarPositions() ?? [],
    cops: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.npcs?.forEach((n: any, id: string) => { if (n.kind === "cop") out.push({ id, x: n.x, z: n.z, state: n.state, target: n.target }); }); return out; },
    station: () => CITY.station,
    camPitch: () => { const sc: any = arena?.scene; return sc?.activeCamera?.rotation?.x ?? null; },
    stars: () => Array.from(document.querySelectorAll("#stars b.on")).length,
    spawnBigShot: (kind?: string) => { if (local) { const n = local.world.npc.spawnBigShot(kind as never); return n?.id ?? null; } room?.send("dbg", { op: "bigShot", kind }); return null; },
    bigShot: () => arena?.bigShot ?? null,
    actionLog: () => [...(arena?.actionLog ?? [])],
  } : {}),
};
