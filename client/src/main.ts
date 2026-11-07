import "./styles.css";
import { Engine } from "./game/babylon.ts";
import { TitleScene } from "./game/titleScene.ts";
import { ArenaScene } from "./game/arenaScene.ts";
import { LocalSession, SOLO_ID } from "./localSession.ts";
import { HOST_LEFT } from "./p2p/peerRoom.ts";
import { ShopScreen } from "./ui/shopScreen.ts";
import { FpInput } from "./game/input.ts";
import { settings, updateSettings, onSettingsChange, type Settings } from "./settings.ts";
import { drawCityMap, type MapMarker } from "./game/look.ts";
import { PLAYER_COLORS as MAP_COLORS, inLobby, ARREST, RESTO, CLUB, CLUB_SAFE, PAWN_SHOP, HOT_STUFF, NPC_DEFS, FEVER, DEAL, PUB, SEAMUS, JUKEBOX, DUSK_TIME, NIGHT_TIME } from "@bfb/shared";
declare const __BFB_BUILD__: string; // (R12.5: the commit, from vite.config.ts)
import { runBench, benchFrame, cancelBench, benchRunning, type FrameParts } from "./game/bench.ts";
import { installAudioUnlock, isAudioUnlocked, whenAudioUnlocked, sfx, renderSfxOffline, startTitleMusic, stopMusic } from "./audio.ts";
import {
  createRoom, joinRoom, friendlyError, type GameRoom, inviteLink, roomCodeFromUrl, setUrlRoom, rememberRoom, forgetRoom,
} from "./net.ts";
import {
  MSG, PLAYER_COLORS, normalizeRoomCode, isValidRoomCode, sanitizeName, randomBanditName, buildTrashington, setCityMap, cityMap, nearBoxes, inFoot,
  lootDef, RARITY_COLOR, starsOf, type MoveInput, pinPos as pinPosOf, type WorldView, type WorldEvent,
} from "@bfb/shared";

// R3: ?map=new / ?map=classic (or a build with VITE_BFB_MAP) picks the city. Everyone in a game needs the same one:
// the host's and the joiners' pages build their own copy.
const MAP_PARAM = new URLSearchParams(location.search).get("map") ?? import.meta.env.VITE_BFB_MAP;
if (MAP_PARAM === "roads" || MAP_PARAM === "roads2" || MAP_PARAM === "new") setCityMap("new");
if (MAP_PARAM === "classic") setCityMap("classic");
const ROAD_TEST = cityMap() === "new";
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

const CONTROLS_TEXT = "WASD move / SHIFT sprint / SPACE jump + climb / C crouch (sprint+C slide) / Q dodge / E grab + search (mash E in a tug of war) / HOLD R rob a till / G drop / WHEEL or 1-4 choose item (4 = fists) / CLICK punch (fists out) or HOLD CLICK throw what you hold / ESC menu";

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
  $("lp-hint").textContent = "Press ENTER to start. Each cycle: an 8-minute scavenge (day, then sunset, then 2 min of NIGHT: x2 loot, fort raids), then sell your fort loot at the pawn shop. 3 cycles, richest bandit wins!";
  $("mode-badge").textContent = ROAD_TEST ? "NEW CITY R3 / SOLO" : "CITY C5c.3 / SOLO";
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
  // (R12.3b: the lobby card (who's here, "Press ENTER to start") belongs to the lobby: once the match is on, the cash
  //  list top-right has everyone, and the card was sitting over the screen for the whole game)
  show("lobby-panel", m.phase === "lobby");

  // timer
  let round = "", time = "", sub = "", cls = "mh-time";
  if (m.phase === "lobby") { time = "LOBBY"; sub = starter ? "Press ENTER to start the match" : "Waiting for the host to start"; }
  else if (m.phase === "intro") { round = `CYCLE ${m.round}/${m.rounds}`; time = String(Math.max(1, Math.ceil(m.timeLeft))); sub = "Get ready!"; }
  else if (m.phase === "scavenge" || m.phase === "dusk" || m.phase === "night") {
    // R12.3: one 8-minute scavenge, one clock: day, then the sun goes down while you play, then night
    const left = m.phase === "scavenge" ? m.timeLeft + DUSK_TIME + NIGHT_TIME : m.phase === "dusk" ? m.timeLeft + NIGHT_TIME : m.timeLeft;
    time = fmtTime(left);
    if (m.phase === "scavenge") { round = `DAY ${m.round}/${m.rounds}`; if (m.timeLeft <= 30) sub = `Sunset in ${Math.max(1, Math.ceil(m.timeLeft))}`; }
    else if (m.phase === "dusk") { round = `SUNSET ${m.round}/${m.rounds}`; sub = `Night falls in ${Math.max(1, Math.ceil(m.timeLeft))}`; }
    else { round = `NIGHT ${m.round}/${m.rounds}`; sub = "x2 loot / forts can be raided"; }
    if (m.phase === "night" && m.timeLeft <= 10) cls += " danger"; else if (m.phase === "night" && m.timeLeft <= 30) cls += " warn";
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
    if (m.evKind === "airdrop") ev = m.evStage === "warn" ? `AIRDROP IN ${m.evT}s - WATCH FOR THE RED TARGET` : "AIRDROP CRATE FALLING - FIND THE RED TARGET!";
    if (m.evKind === "raccoons") { ev = m.evStage === "warn" ? "RACCOONS INCOMING..." : "RACCOONS ARE RAIDING THE FORTS!"; bad = true; }
    if (m.evKind === "parade") ev = m.evStage === "warn" ? `DRAGON PARADE IN CHINATOWN IN ${m.evT}s` : "DRAGON PARADE IN CHINATOWN: GRAB THE RED ENVELOPES!";
    if (m.evKind === "festa") ev = m.evStage === "warn" ? `FESTA IN LITTLE ITALY IN ${m.evT}s` : "FESTA IN LITTLE ITALY: GRAB THE GOLDEN GOODIES!";
  }
  if (ev + bad !== eventSig) {
    eventSig = ev + bad;
    const el = $("event-hud");
    el.textContent = ev;
    el.className = "event-hud" + (bad ? " bad" : "") + (ev ? "" : " hidden");
  }

  // home compass (during the round, when you're away from your fort)
  const h = a.home();
  const showHome = (m.phase === "scavenge" || m.phase === "dusk" || m.phase === "night") && !h.inside; // (R12.3: the whole 8-minute scavenge)
  const hSig = showHome ? `${Math.round(h.dist)}|${Math.round(h.bearing * 20)}|${m.phase === "night" && m.timeLeft <= 30}` : "";
  if (hSig !== homeSig) {
    homeSig = hSig;
    show("home-arrow", showHome);
    if (showHome) {
      $("ha-arrow").style.transform = `rotate(${h.bearing}rad)`;
      $("home-arrow").style.setProperty("--home", PLAYER_COLORS[a.myColorIdx % PLAYER_COLORS.length]);
      $("ha-text").textContent = `HOME ${Math.round(h.dist)} m`;
      $("home-arrow").classList.toggle("urgent", m.phase === "night" && m.timeLeft <= 30);
    }
  }

  // wiped out by a car: countdown to respawn
  const wipe = a.respawnT > 0 ? `${Math.ceil(a.respawnT)}` : ""; // (D1: just the seconds left, in a small ring)
  if (wipe !== wipeSig) {
    wipeSig = wipe;
    show("wipeout", !!wipe);
    $("wipeout-sub").textContent = wipe;
    $("wipeout").style.setProperty("--wo-frac", String(Math.max(0, Math.min(1, a.respawnT / 10))));
  }

  // tally / final results card
  const showTally = m.phase === "dawn" || m.phase === "over";
  const tSig = showTally ? m.phase + m.round + m.results + Math.ceil(m.timeLeft) + starter : "";
  if (tSig !== tallySig) {
    tallySig = tSig;
    show("tally", showTally);
    if (showTally) renderTally(a, starter);
  }
  document.body.classList.toggle("night", m.phase === "night" || (m.phase === "dusk" && m.timeLeft < DUSK_TIME / 2));

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
  let lines: { id: string; name: string; colorIdx: number; banked: number; bankedValue: number; lost: number; lostValue: number; stolen: number; cash: number; aura?: number }[] = [];
  try { lines = JSON.parse(m.results || "[]"); } catch { /* keep empty */ }
  const over = m.phase === "over";
  $("tally-title").textContent = over ? `RICHEST BANDIT: ${lines[0]?.name ?? "?"}` : `CYCLE ${m.round}: SUNRISE`;
  const table = $("tally-table") as HTMLTableElement;
  table.innerHTML = "";
  const head = table.insertRow();
  for (const h of over ? ["BANDIT", "LOST", "AURA", "CASH"] : ["BANDIT", "FORT LOOT", "LOST", "AURA", "CASH"]) { const th = document.createElement("th"); th.textContent = h; head.appendChild(th); }
  lines.forEach((l, i) => {
    const tr = table.insertRow();
    if (i === 0 && over) tr.className = "winner";
    const name = tr.insertCell();
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PLAYER_COLORS[l.colorIdx % PLAYER_COLORS.length];
    name.append(dot, document.createTextNode(l.name));
    if (!over) { const b = tr.insertCell(); b.className = "money"; b.textContent = `$${l.bankedValue}` + (l.banked ? ` (${l.banked})` : ""); }
    const lost = tr.insertCell(); lost.className = l.lost || l.stolen ? "neg" : "";
    lost.textContent = [l.lost ? `${l.lost} item${l.lost > 1 ? "s" : ""}` : "", l.stolen ? `${l.stolen} to raccoons` : ""].filter(Boolean).join(", ") || "-";
    const au = tr.insertCell(); au.className = "aura"; au.textContent = l.aura ? `${l.aura}` : "-"; // (C4b: tags sprayed; the race for Mayor uses these later)
    const tot = tr.insertCell(); tot.className = "money"; tot.textContent = "$" + l.cash;
  });
  $("tally-foot").textContent = over
    ? (starter ? "The race for Mayor comes in a later phase. Press ENTER to play again." : "The race for Mayor comes in a later phase. Waiting for the host...")
    : `Fort loot goes to the pawn shop in ${Math.max(1, Math.ceil(m.timeLeft))}... (sell it or lose it)`;
}

const fxTimers: Record<string, number> = {};
const fxHistory: string[] = []; // for automated tests (effects can be over before a slow test looks)
/** Full-screen HTML effects: camera flash, pigeon swarm, knocked-down daze. */
function screenFx(fx: "flash" | "swarm" | "knocked" | "zap" | "hurt", seconds: number) {
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
  $("mode-badge").textContent = r.isHost ? "CITY C5c / HOSTING" : "CITY C5c / ONLINE";

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
  const ta = performance.now();
  arena.applyWorld(state as WorldView, room.sessionId, ta);
  netApplyMs += performance.now() - ta; // (R12.5: counted in the next frame's "apply")

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
    ctlHint(true, true);
  } else {
    input.clear();
    if (screen === "playing" && $("settings").classList.contains("hidden") && !overlayOpen) showPause(true);
  }
});
function enterDragLook() {
  input.dragLook = true;
  input.enabled = true;
  show("pause", false);
  ctlHint(true, true);
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
// R12.5: the BENCHMARK (the same route every time; a result to copy and send)
onClick("btn-bench", () => void startBench());
onClick("btn-bench-close", () => { show("bench-result", false); showPause(true); });
onClick("btn-bench-copy", () => { const t = $<HTMLTextAreaElement>("bench-text"); t.select(); void navigator.clipboard?.writeText(t.value).catch(() => document.execCommand("copy")); $("btn-bench-copy").textContent = "COPIED"; });
window.addEventListener("keydown", (e) => { if (e.code === "Escape" && benchRunning()) cancelBench(); });
async function startBench() {
  if (!arena || benchRunning()) return;
  const a = arena;
  show("pause", false); show("bench-status", true); document.body.classList.add("benching");
  const res = await runBench({
    scene: a.scene, engine, arena: CITY, canvas,
    mode: local ? "solo" : room?.isHost ? "hosting" : "joining",
    players: () => { let n = 0; netView()?.players?.forEach(() => n++); return n; },
    npcs: () => a.npcStats().total, cars: () => a.carCount(),
    setCam: (c) => { a.camOverride = c; }, setNight: (on) => { a.forceNight = on; },
    teleport: local ? (x, y, z, yaw) => { local!.teleport(x, z, yaw, y); a.debugTeleport(x, z, yaw, y); } : undefined,
    startGames: local ? () => { a.onAction?.({ a: "pg", op: "open", st: "pooltable2", vs: "npc", stake: 0 } as any); a.onAction?.({ a: "pg", op: "open", st: "dartsoche1", vs: "npc", stake: 0 } as any); } : undefined,
    gamesActive: () => { const i = a.pg.info() as any; return ["pooltable2", "dartsoche1"].map((k) => `${k}: ${i?.[k]?.ph ?? "-"}${i?.[k]?.rolling ? " (rolling)" : ""}`).join(", "); },
    settings: { lowGraphics: settings.lowGraphics, fov: settings.fov, showFps: settings.showFps },
    build: __BFB_BUILD__, pubSeen: () => a.city.pubSeen,
    status: (s) => { $("bench-status").textContent = s; },
  });
  show("bench-status", false); document.body.classList.remove("benching");
  if (local) { const sp = CITY.spawns[0]; local.teleport(sp.x, sp.z, 0, 0); a.debugTeleport(sp.x, sp.z, 0, 0); }
  if (!res) { showPause(true); return; }
  $<HTMLTextAreaElement>("bench-text").value = res.text + "\n\n---- data ----\n" + res.json;
  $("btn-bench-copy").textContent = "COPY RESULT";
  show("bench-result", true);
  (window as any).__benchResult = res;
}
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
// C5a: the lobby squat panel (what's up here, the mini-game you're in, everyone's bests) and the M-key map
function netView(): any { return local ? local.view : room?.state; }
function myPlayerId(): string { return local ? SOLO_ID : room?.sessionId ?? ""; }
let squatSig = "";
function updateLobbyHud(a: ArenaScene) {
  const v = netView(), L = a.arenaLayout.lobby, m = a.moveState;
  const me = v?.players?.get(myPlayerId());
  const up = !!L && !!m && !!me && inLobby(a.arenaLayout, m.x, m.z, 3) && m.y > L.y - 4;
  if (!up) { if (squatSig !== "") { squatSig = ""; show("lobby-hud", false); } return; }
  const g = String(me.lg ?? "");
  const rows: [string, number, number][] = [];
  v.players.forEach((p: any) => rows.push([p.name, p.tb ?? 0, p.rb ?? 0]));
  const phase = a.match.phase ?? "lobby";
  const sig = g + "|" + rows.map((r) => r.join(",")).join(";") + "|" + phase;
  if (sig === squatSig) return;
  squatSig = sig;
  const el = $("lobby-hud");
  el.innerHTML = "";
  const h = document.createElement("h3"); h.textContent = "THE SQUAT"; el.append(h);
  const sub = document.createElement("div"); sub.className = "dim";
  sub.textContent = phase === "lobby" ? "Waiting for the match. Practise, race, throw. Nothing up here counts." : "Nothing up here counts.";
  el.append(sub);
  if (g) {
    const [kind, secs, n] = g.split(":");
    const box = document.createElement("div"); box.className = "game";
    box.textContent = kind === "throw" ? `THROW-O-MATIC  ${Math.max(0, 30 - Number(secs))}s  ${n} pts` : `GRAND PRIX  ${secs}s  cone ${Math.min(4, Number(n))}/4`;
    el.append(box);
  }
  const tbl = document.createElement("div");
  const head = document.createElement("div"); head.className = "row dim"; head.innerHTML = "<span>BANDIT</span><span>THROW</span><span>LAP</span>"; tbl.append(head);
  for (const [name, tb, rb] of rows) {
    const r = document.createElement("div"); r.className = "row";
    for (const t of [name, tb ? String(tb) : "-", rb ? rb.toFixed(1) + "s" : "-"]) { const c = document.createElement("span"); c.textContent = t; r.append(c); }
    tbl.append(r);
  }
  el.append(tbl);
  show("lobby-hud", true);
}
let mapOpen = false, mapT = 0;
const roughSpots = new Map<string, { slot: number; x: number; z: number; r: number }>();
function drawMap(a: ArenaScene) {
  const cv = $("city-map") as HTMLCanvasElement, c = cv.getContext("2d");
  if (!c) return;
  const v = netView(), markers: MapMarker[] = [];
  // (C5c.1: you always; other bandits only once they're WANTED: 1-2 stars = a rough area that moves every 8 s,
  //  3 stars = exactly where they are. Stars and bounty under the name.)
  const slot = Math.floor(performance.now() / 8000);
  v?.players?.forEach((p: any, id: string) => {
    const mine = id === myPlayerId(), m = mine ? a.moveState : null;
    const heat = p.heat ?? 0, st = starsOf(heat), color = MAP_COLORS[p.colorIdx % MAP_COLORS.length];
    const wanted = st > 0 && (p.jailT ?? 0) <= 0 ? `${"\u2605".repeat(st)} $${Math.round(heat * ARREST.perHeat)}` : undefined;
    if (mine) { markers.push({ x: m?.x ?? p.x, z: m?.z ?? p.z, yaw: m?.yaw ?? p.yaw, color, label: "YOU", me: true, wanted }); return; }
    if (!wanted || !p.connected) return;
    if (st >= 3) { markers.push({ x: p.x, z: p.z, yaw: p.yaw, color, label: p.name, wanted }); return; }
    const cached = roughSpots.get(id);
    let spot = cached && cached.slot === slot ? cached : null;
    if (!spot) {
      const r = st === 1 ? 26 : 16, h = [...(id + slot)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const ang = (h % 360) * Math.PI / 180, off = ((h >> 9) % 100) / 100 * r * 0.7; // (you're somewhere inside the circle, not at its middle)
      spot = { slot, x: p.x + Math.cos(ang) * off, z: p.z + Math.sin(ang) * off, r };
      roughSpots.set(id, spot);
    }
    markers.push({ x: spot.x, z: spot.z, color, label: p.name, wanted, area: spot.r });
  });
  drawCityMap(c, a.arenaLayout, cv.width, { markers, extraSouth: 30 });
}
function toggleMap(force?: boolean) {
  mapOpen = force ?? !mapOpen;
  show("map-wrap", mapOpen);
  if (mapOpen && arena) { mapT = 0; drawMap(arena); }
}
window.addEventListener("keydown", (e) => { // (C5c.1: held down for the cops: SPACE wriggles)
  if (e.code === "Space" && !e.repeat && screen === "playing" && arena?.pinBy) arena.struggle();
});
// R12.4 (UI at small sizes): the controls line runs over the slots and the bars on a small window, so there it shows for
// the first 20 s, then folds to "H: controls"; H opens and closes it (a station's own H help comes first)
let ctlOpen = true, ctlTimer = 0;
const smallScreen = () => innerWidth <= 1100 || innerHeight <= 680;
function ctlHint(open: boolean, fresh = false) {
  const el = $("controls-hint"), small = smallScreen();
  ctlOpen = open || !small;
  el.textContent = ctlOpen ? (input.dragLook ? "HOLD LEFT MOUSE + DRAG to look / " : "") + CONTROLS_TEXT + (small ? " / H hide" : "") : "H: controls";
  el.classList.toggle("open", ctlOpen && small); el.classList.toggle("min", !ctlOpen);
  clearTimeout(ctlTimer);
  if (fresh && small) ctlTimer = window.setTimeout(() => ctlHint(false), 20000);
}
addEventListener("resize", () => ctlHint(ctlOpen));
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyH" || e.repeat || screen !== "playing" || !arena || arena.pg.mode) return;
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
  ctlHint(!ctlOpen);
});
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyM" || e.repeat || screen !== "playing" || !arena) return;
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;
  toggleMap();
});

// ---------------------------------------------------------------------------
// HUD (5A.1): health (heart) + stamina (lightning bolt) bars bottom-left, dodge-ready "Q" chip
let hudStaminaShown = -1, hudHpShown = -1, hpLag = 100;
function updateHud(a: ArenaScene) {
  const h = a.hud();
  const pct = Math.round(h.stamina * 100);
  if (pct !== hudStaminaShown) {
    hudStaminaShown = pct;
    $("stamina-fill").style.width = pct + "%";
  }
  $("stamina").classList.toggle("winded", h.winded);
  $("dodge-pip").classList.toggle("ready", h.dodgeReady);
  // health: the bar snaps down, a pale "recent damage" bar drains after it
  const hp = Math.max(0, Math.min(100, Math.round(a.hp)));
  hpLag = hp >= hpLag ? hp : Math.max(hp, hpLag - 60 * (engine.getDeltaTime() / 1000));
  if (hp !== hudHpShown) {
    hudHpShown = hp;
    $("hp-fill").style.width = hp + "%";
    $("hp-num").textContent = String(hp);
    $("health").classList.toggle("low", hp > 0 && hp <= 34);
  }
  $("hp-lag").style.width = hpLag.toFixed(1) + "%";
  updateLobbyHud(a);
  if (mapOpen) { mapT -= engine.getDeltaTime() / 1000; if (mapT <= 0) { mapT = 0.1; drawMap(a); } }

  // Look prompt: "[E] Grab Old CRT TV  $34"
  const t = a.lookTarget;
  const pt = a.punchTarget;
  const prompt = $("prompt");
  const ut = a.useTarget;
  const robbing = a.robT >= 0;
  const rt = a.robTarget;
  const jailed = a.jailT > 0;
  const tagT = a.tagTarget, tagHolding = a.throwCharge >= 0 && !!tagT && a.canUses > 0;
  const at = a.arrestTarget;
  const cellUse = jailed && !a.lock.open && ut && (ut.kind === "toilet" || ut.kind === "celldoor") ? ut.kind : ""; // (R6: the holding cell)
  const sig = jailed ? "jail" + cellUse + (a.lock.open ? "L" : "") + Math.ceil(a.jailT) : a.pinBy ? "pinned" + a.pinS : a.pinOn ? "pinning" : at ? "arrest" + at.id + at.bounty : robbing ? "rob" + a.openingMachine + a.holdKind : t ? t.id + t.note + t.value + (rt ? "R" : "") : ut ? "use" + ut.id + ut.empty + a.match.phase + (ut.def?.oneWay && a.outsideOf(ut.def) ? "out" : "") + (ut.kind.startsWith("pawn") || ut.kind === "clubrope" ? JSON.stringify(a.heldInfo()) + a.pawnCase.length + JSON.stringify(a.pawnPick()) + a.myAura : "") + (ut.kind === "jukebox" ? a.jukeTune : "") + (ut.kind === "pooltable" || ut.kind === "dartsoche" ? a.pg.prompt(ut.id).join("|") + a.pg.active : "") : rt ? "till" + rt.id + rt.empty : pt ? "npc" + pt.id + pt.empty : tagT ? "tag" + a.canUses + tagHolding : a.inFever ? "fv" + (a.dancing ? 1 : 0) : "";
  const simple = (keyText: string, verbText: string, nameText: string, metaText: string) => {
    prompt.innerHTML = "";
    const key = document.createElement("span"); key.className = "key"; key.textContent = keyText; if (!keyText) key.style.display = "none";
    const verb = document.createElement("span"); verb.textContent = verbText;
    const name = document.createElement("b"); name.textContent = nameText;
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = metaText;
    prompt.append(key, verb, name, meta);
    prompt.classList.remove("hidden");
  };
  if (sig !== promptSig) {
    promptSig = sig;
    if (jailed && cellUse === "celldoor" && ut?.empty) simple("", " THE CELL'S OPEN ", "", "walk out: you're free (but wanted)");
    else if (jailed && cellUse === "toilet") simple("E", " Flush ", "the toilet", "everyone in the cell gets soaked and knocked flying");
    else if (jailed && cellUse === "celldoor") simple("E", " Pick the lock ", "", `S or Esc to step away from it. Or just wait: out in ${Math.ceil(a.jailT)} s`);
    else if (jailed && a.arenaLayout.station?.holding && !a.lock.open) simple("", " THE HOLDING CELL ", "", `out in ${Math.ceil(a.jailT)} s - or E at the cell door to pick the lock (don't wake the Champ)`);
    else if (jailed) prompt.classList.add("hidden");
    else if (!t && ut && ut.kind === "toilet") simple("", " The toilet ", "", "(you'd have to get yourself locked up first)");
    else if (!t && ut && ut.kind === "celldoor" && ut.empty) simple("", " The holding cell ", "", "standing open: anybody inside can walk out");
    else if (!t && ut && ut.kind === "celldoor" && a.carryingType("cell_key")) simple("E", " Unlock the cell ", "with the chief's key", "it swings open for 20 s: everybody inside walks (wanted)");
    else if (!t && ut && ut.kind === "celldoor") simple("", " The holding cell ", "", "locked. The key's on the chief's desk upstairs...");
    else if (!t && ut && ut.kind === "door" && ut.def?.oneWay && a.outsideOf(ut.def)) simple("", "", "EXIT ONLY", ut.empty ? "it's open... but you can't get in this way" : "no handle on this side"); // (R11.4)
    else if (!t && ut && ut.kind === "door" && ut.def?.door === "exit") simple("E", ut.empty ? " Shut " : " Push ", "the EXIT", ut.empty ? "" : "out to the back alley (no way back in through here)");
    else if (!t && ut && ut.kind === "door") simple("E", ut.empty ? " Close " : " Open ", "the door", "");
    else if (!t && ut && ut.kind === "dealgoods" && ut.def?.sell) { const g = DEAL.goods[ut.def.sell]; simple("E", " Buy " + g.name + ": ", `$${DEAL.price}`, ut.def.sell === "zoomies" ? `glowing gummies: ${g.time} s of SPEED (then a comedown)` : ut.def.sell === "beef" ? `a can of BEEF: ${g.time} s of strength (big punches, heavy loot carries easy)` : `fizzy and floaty: ${g.time} s of low gravity, 3 jumps off thin air`); }
    else if (a.pinBy) simple("SPACE", " PINNED! Mash to wriggle free ", "", `${Math.round(a.pinS * 100)}% free - or hope a friend knocks them off you`);
    else if (a.pinOn) simple("", " Holding them down for the cops... ", "", "don't move! (they're wriggling; the cops are on their way)");
    else if (a.arrestTarget) simple("E", " Citizen's arrest: ", a.arrestTarget.name, `hold them down for the cops: bounty $${a.arrestTarget.bounty} (taken off them)`);
    else if (robbing && a.openingMachine) simple("E", " Opening quietly... ", "", "don't move! (or punch it open: quick but LOUD)");
    else if (robbing && a.holdKind === "vaultdoor") simple("E", " DRILLING THE VAULT... ", "", "keep still! 20 s. Alarms are ringing, the guards are coming!");
    else if (robbing && a.holdKind === "keycard") simple("E", " Swiping the keycard... ", "", "quietly... (don't let a guard see)");
    else if (robbing && a.holdKind === "clubsafe") simple("E", " Cracking the safe... ", "", "keep still! 6 s (click... click... click...)");
    else if (robbing && a.holdKind === "nose") simple("E", " Prising off the gold nose... ", "", "keep still! (heat if anyone sees)");
    else if (robbing) simple("HOLD R", " Robbing ", "the till", "keep holding... don't move!");
    else if (!t && ut && (ut.kind === "steamer" || ut.kind === "trinkets")) simple("E", " Help yourself: ", ut.name, ut.empty ? "SOLD OUT - more soon" : ut.kind === "steamer" ? "dumplings, buns, mooncakes (the stall keeper yells if anyone sees)" : "fans, fortune cookies, lucky cats... (the stall keeper yells if anyone sees)");
    else if (!t && ut && ut.kind === "vaultdoor") simple("E", a.carryingType("bank_keycard") ? " Swipe the keycard: " : " Drill ", ut.name, ut.empty ? "OPEN (it shuts again at dawn)" : a.carryingType("bank_keycard") ? "opens quietly in 3 s" : "20 s, LOUD: alarms, 3 stars, the guards come. (Find the manager's keycard for a quiet job)");
    else if (!t && ut && ut.kind === "nose") simple("E", " Prise off ", ut.name, ut.empty ? "already gone (glued back at dawn)" : "5 s. A golden prize (heat if anyone sees)");
    else if (!t && ut && ut.kind === "podium") simple("E", " Book a table: ", `$${RESTO.fee}`, "slip the maitre d' the fee and he lets you in until dawn");
    // R11: NEON FEVER DREAM's rope and bar
    else if (!t && ut && ut.kind === "clubrope" && a.arenaLayout.fever) simple("E", a.myAura >= FEVER.vipAura || a.carryingType("vip_wristband") ? " VIP: walk in " : " Pay the cover: ", a.myAura >= FEVER.vipAura || a.carryingType("vip_wristband") ? "FREE" : `$${FEVER.cover}`, a.myAura >= FEVER.vipAura || a.carryingType("vip_wristband") ? "the bouncer lifts the rope for you" : `a stamp on your hand till dawn (VIPs free: ${FEVER.vipAura}+ aura)`);
    else if (!t && ut && ut.kind === "pinttap") simple("E", " A pint of GUZZLE'S: ", `$${PUB.price}`, a.pubInfo().pints >= PUB.cutoff ? "Fergal's cut you off till you sober up" : `then split the G: $${PUB.prize} if you nail it`); // (R12.1)
    else if (a.pg.active) prompt.classList.add("hidden"); // (R12.3: at the table / the oche: the game's own panel says what's what)
    else if (!t && ut && (ut.kind === "pooltable" || ut.kind === "dartsoche")) { const [v, n, m] = a.pg.prompt(ut.id); simple("E", v, n, m); } // (R12.3: not while you're aiming)
    else if (!t && ut && ut.kind === "jukebox") simple("E", " Next tune on ", "the Jukebox", `now playing "${JUKEBOX.tunes[a.jukeTune] ?? ""}" (it's free: the coin slot's been broken for years)`); // (R12.2b)
    else if (!t && ut && ut.kind === "seamus") simple("E", " Have a word with ", "Seamus O'Shortly", `he runs the place. Bring him what he's after for a pot of gold; rate high enough (${SEAMUS.tipAura}+ aura) and he'll give you tips. Start trouble and his lads swarm you.`); // (R12.2c)
    else if (!t && ut && ut.kind === "mocktail") simple("E", " Order a mocktail: ", `$${FEVER.mocktail}`, `glowing, silly, totally alcohol-free: ${FEVER.boost} s of dance energy (stamina refills fast)`);
    // C5c.3: THE COMPACTOR
    else if (!t && ut && ut.kind === "clubrope") simple("E", a.myAura >= CLUB.vipAura || a.carryingType("vip_wristband") ? " VIP: walk in " : " Pay the cover: ", a.myAura >= CLUB.vipAura || a.carryingType("vip_wristband") ? "FREE" : `$${CLUB.cover}`, a.myAura >= CLUB.vipAura || a.carryingType("vip_wristband") ? "Big Crunch knows a somebody when he sees one" : `Big Crunch stamps your hand till dawn. (VIPs free: ${CLUB.vipAura}+ aura or a VIP wristband)`);
    else if (!t && ut && ut.kind === "djdecks") simple("E", " Hijack ", ut.name, ut.empty ? "still warm... give it a minute" : `+${CLUB.djAura} aura, the crowd roars, and the DROP starts NOW (everyone on the crusher goes flying)`);
    else if (!t && ut && ut.kind === "clubsafe") simple("E", " Crack ", ut.name, ut.empty ? "cleaned out (the takings start again tomorrow)" : `6 s, LOUD: $${CLUB_SAFE.base} + every cover charge paid today. Alarm, heat, and Big Crunch.`);
    else if (!t && ut && (ut.kind === "clubbar" || ut.kind === "rider" || ut.kind === "lockers" || ut.kind === "sortbin" || ut.kind === "vipbooth")) simple("E", ut.kind === "clubbar" ? " Grab off the belt: " : " Rummage: ", ut.name, ut.empty ? (ut.kind === "clubbar" ? "the belt's empty, more coming" : "picked clean today") : ut.kind === "clubbar" ? "neon fizz, glow sticks..." : ut.kind === "rider" ? "the DJ's demands: rare vinyl, headphones, snacks" : ut.kind === "lockers" ? "staff stuff: wristbands, wallets, glow sticks" : ut.kind === "sortbin" ? "cans, bags... and the odd lost record" : "VIP leftovers: bling, wristbands... a mirror ball?");
    // C5c.3: PAWN-O-RAMA
    else if (!t && ut && ut.kind === "pawncounter" && a.arenaLayout.hotShops?.length) {
      // R7: a walk-in pawn shop's till (Twitchy Lou's or Sticky Fran's)
      const si = a.arenaLayout.props?.find((q) => q.id === ut.id)?.shop ?? 0, hs = a.arenaLayout.hotShops[si] ?? a.arenaLayout.hotShops[0], who = NPC_DEFS[hs.owner].name;
      const wants = a.shopWants[si] ?? [], h = a.heldInfo(), hot = !!h && wants.includes(h.type);
      const want = wants.length ? `wants today (x3): ${wants.map((x) => lootDef(x).name).join(", ")}` : "walk up to the till and they'll tell you what they want today";
      simple("E", h ? (hot ? ` Sell to ${who} x3!: ` : ` Sell to ${who}: `) : ` ${who} `, h ? `${lootDef(h.type).name}  ${h.value ? "$" + Math.max(1, Math.round(h.value * (hot ? HOT_STUFF.hotMult : PAWN_SHOP.fence))) : "$??"}` : "", h ? (hot ? "they WANT this: triple what it's worth (first one only)" : `cash right now. ${want}`) : want);
    }
    else if (!t && ut && ut.kind === "glasscounter") simple("", " The glass counter ", "", ut.empty ? "smashed (fixed at dawn)" : "rings, watches, chains... all junk, honestly. Smash it and the bouncer comes.");
    else if (!t && ut && ut.kind === "pawncounter") { const h = a.heldInfo(); simple("E", h ? " Sell to Sal: " : " Ring for Sal ", h ? `${lootDef(h.type).name}  ${h.value ? "$" + Math.max(1, Math.round(h.value * PAWN_SHOP.fence)) : "$??"}` : "", h ? "cash right now, no questions asked (less than the end-of-day shop pays)" : "hold something out in your hands and he'll make you an offer"); }
    else if (!t && ut && ut.kind === "pawncase") {
      const h = a.heldInfo(), pk = a.pawnPick();
      if (ut.empty) simple("", " The Pawn Case ", "", "SMASHED. Sal's boarding it up till dawn.");
      else if (h) simple("E", " Pawn: ", `${lootDef(h.type).name}  ${h.value ? "$" + Math.max(1, Math.round(h.value * PAWN_SHOP.loan)) : "$??"} now`, a.pawnCaseFull ? "the case is FULL" : `buy it back for ${h.value ? "$" + Math.max(1, Math.round(h.value * PAWN_SHOP.back)) : "a bit more"} before dawn, or it goes on sale to anybody`);
      else if (pk) simple("E", pk.sale ? " Buy: " : " Buy back: ", `${lootDef(pk.type).name}  $${pk.price}`, pk.sale ? "nobody came back for it: it's for sale" : "yours, before dawn (after that anybody can buy it)");
      else simple("E", " The Pawn Case ", "", "hold something out to pawn it... or punch the glass (3 hits: alarm, heat, Big Vinnie)");
    }
    else if (!t && ut && ut.kind === "piano") simple("E", " Play ", ut.name, ut.empty ? "the diners have had enough for today" : `+${RESTO.pianoAura} aura (and a racket everyone hears)`);
    else if (!t && ut && (ut.kind === "cloakroom" || ut.kind === "dessertcart" || ut.kind === "chefstable" || ut.kind === "kitchen")) simple("E", " Help yourself: ", ut.name, ut.empty ? "picked clean today" : ut.kind === "cloakroom" ? "rich people's coats: wallets, designer stuff..." : ut.kind === "dessertcart" ? "macarons, cake, fancy cheese" : ut.kind === "kitchen" ? "silver cutlery, fancy food (the chef yells if he sees you)" : "the good stuff. The really good stuff.");
    else if (!t && ut && ut.kind === "depositbox") simple("E", " Open ", ut.name, ut.empty ? "EMPTY (new deposits tomorrow)" : "someone's valuables...");
    else if (!t && ut && ut.kind === "stash") simple("E", " Search ", ut.name, ut.empty ? "found already today" : "something glints behind it...");
    else if (!t && ut && ut.kind === "throwgame") simple("E", " Play ", ut.name, "30 s: throw bin lids at the 3 targets (bullseye = 3 points)");
    else if (!t && ut && ut.kind === "racegame") simple("E", " Race ", ut.name, "drag a trolley round the 4 cones and back here");
    else if (!t && ut && (ut.kind === "washer" || ut.kind === "dryer")) simple("E", " Open ", ut.name, ut.empty ? "EMPTIED - new loads tomorrow" : "quietly (2 s) - or PUNCH it open: fast but loud");
    else if (!t && ut) simple("E", " Search ", ut.name, ut.empty ? "EMPTY - refills later" : "random junk inside (maybe treasure, maybe a raccoon)");
    else if (!t && rt) simple("HOLD R", " Rob ", "the till", rt.empty ? "EMPTY right now (refills later)" : "3 s hold-up: sets off the alarm");
    else if (!t && pt?.prop) {
      simple("CLICK", pt.kind === "washer" || pt.kind === "dryer" ? " Force open " : " Smash ", pt.name, pt.empty ? "already smashed - comes back later" : pt.kind === "car" ? "grab what's on the seat (car alarm!)" : pt.kind === "dummy" ? "practice your punches (nothing counts up here)" : pt.kind === "fishtank" ? "SPLASH: live crabs inside (loud!)" : pt.kind === "washer" || pt.kind === "dryer" ? "LOUD: wakes the old lady upstairs" : "loot inside");
    } else if (!t && pt) {
      // "[CLICK] Bonk Gym Bro  - fights back!"
      simple("CLICK", " Bonk ", pt.name, pt.kind === "bodyguard" ? "protects the boss: hits hard" : pt.kind === "cashier" ? "drops the float... and sets off the alarm" : pt.kind === "cop" ? "RESISTING ARREST: huge heat, 3 hits to drop them" : pt.fighter ? "FIGHTS BACK - land 2 hits before they do" : "might drop something");
    } else if (!t && tagT) simple("HOLD E", tagHolding ? " Tagging... " : " Tag ", tagHolding ? "" : "this wall", `${a.canUses} tag${a.canUses === 1 ? "" : "s"} left in the can: +1 aura each (heat if anyone sees)`);
    else if (!t && a.inFever) simple("B", a.dancing ? " Stop dancing " : " Dance ", "", a.dancing ? "(or just move)" : "every 15 s on the floor: +1 aura (3 a day)"); // (R11)
    else if (!t) prompt.classList.add("hidden");
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

  // Pockets bar (5A.1): 1-3 pockets + 4 fists; the selected one is highlighted; a big item shows "in hands"
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
    show("slot-hand-wrap", !!inv.hand);
    slot($("slot-hand"), inv.hand, !!inv.hand);
    for (let i = 0; i < 3; i++) slot($("slot-" + i), inv.pockets[i], i === inv.sel && !inv.hand);
    $("slot-fists").classList.toggle("sel", !inv.hand && (inv.sel === 3 || !inv.pockets[inv.sel]));
    $("pockets").classList.toggle("locked", !!inv.hand);
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
/** R12.5: this frame's parts (the benchmark), and the World applied between frames (hosting / joining) */
const fp: FrameParts = { update: 0, world: 0, apply: 0, render: 0, hud: 0, total: 0 };
let netApplyMs = 0;
let fpsSmooth = 60;
/** R12.4 (tests: clips): "film" mode: the live loop stops and the tests step the game a fixed time per frame (the
 *  same code, a steady clock), so a clip shows motion at its real speed on a machine that can't draw it live */
let sfxDepth = 0;
let filming = false, filmNow = 0;
engine.runRenderLoop(() => { if (!filming) frame(engine.getDeltaTime() / 1000, performance.now()); });
function frame(dt: number, now: number) {
  if (dt > 0) fpsSmooth += (1 / Math.max(dt, 1e-3) - fpsSmooth) * 0.05;
  if (title) {
    title.update(dt);
    title.scene.render();
  } else if (arena) {
    const t0 = performance.now();
    arena.update(dt, now);
    const t1 = performance.now();
    fp.update = t1 - t0; fp.world = 0; fp.apply = netApplyMs; netApplyMs = 0;
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
      fp.world = t2 - t1; fp.apply += performance.now() - t2;
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
    if (benchRunning()) { fp.render = th - tr; fp.hud = performance.now() - th; fp.total = performance.now() - t0; benchFrame(dt, fp, arena.scene); }
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
}
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
    // Slice 2A: screenshot camera + how many building interiors are being drawn
    camAt: (x: number, y: number, z: number, yaw: number, pitch: number) => { if (arena) arena.camOverride = { x, y, z, yaw, pitch }; },
    camFree: () => { if (arena) arena.camOverride = null; },
    interiors: () => arena?.city.interiorsDrawn ?? 0,
    // C2: façade detail on/off (Performance mode) and how many pieces were built
    facades: () => ({ detail: arena?.city.detail ?? null, pieces: arena?.city.detailPieces ?? 0, gates: arena?.city.districtGates ?? null }),
    cityBuildMs: () => Math.round(arena?.cityBuildMs ?? 0),
    pubBuildMs: () => Math.round(arena?.city.pubBuildMs ?? 0),
    // C4a: smashed things (how many this screen has hidden) and whether a spot is blocked for this screen
    smashed: () => arena?.city.brokenCount ?? 0,
    worldProp: (id: string) => { const ps = local?.world.props.props.get(id); return ps ? { ready: ps.ready, hp: ps.hp } : null; },
    worldMe: () => { const p = local?.world.players.get(SOLO_ID); return p ? { x: p.move.x, z: p.move.z, knockT: p.move.knockT, punchCd: p.punchCd, hand: p.hand, sel: p.sel, respawnT: p.respawnT, connected: p.connected } : null; },
    blockedAt: (x: number, z: number) => { const a = arena?.arenaLayout; if (!a) return null; return nearBoxes(a, x, z, 0.1).some((b) => inFoot(b, x, z) && b.y - b.h / 2 < 1 && b.y + b.h / 2 > 0.3); },
    // C5a: the lobby squat and the map
    lobby: () => { const me = netView()?.players?.get(myPlayerId()); const m = arena?.moveState; return { phase: arena?.match.phase ?? null, onRoof: !!(arena && m && inLobby(arena.arenaLayout, m.x, m.z, 3) && m.y > 20), y: m?.y ?? null, tb: me?.tb ?? 0, rb: me?.rb ?? 0, lg: me?.lg ?? "", hud: !$("lobby-hud").classList.contains("hidden") }; },
    mapOpen: () => mapOpen,
    forceNight: (on: boolean) => { if (arena) arena.forceNight = on; },
    /** R12.4 (clips): stop the live loop / step it a fixed dt (s) per call */
    film: (on: boolean) => { filming = on; filmNow = performance.now(); },
    filmStep: (dt: number, n = 1) => { for (let k = 0; k < n; k++) { filmNow += dt * 1000; frame(dt, filmNow); } },
    // R12.4: clips with their sound: log every sound effect at its film time, then render the log offline to a WAV
    sfxRec: (on: boolean) => {
      const S = sfx as unknown as Record<string, (...a: unknown[]) => void>, W = window as unknown as { __sfxOrig?: Record<string, (...a: unknown[]) => void>; __sfxLog?: { t: number; name: string; args: unknown[] }[]; __sfxT0?: number };
      if (on && !W.__sfxOrig) {
        W.__sfxOrig = { ...S }; W.__sfxLog = []; W.__sfxT0 = filmNow;
        for (const k of Object.keys(S)) if (typeof S[k] === "function") { const f = W.__sfxOrig[k]; S[k] = (...a: unknown[]) => { if (!sfxDepth) W.__sfxLog!.push({ t: (filmNow - W.__sfxT0!) / 1000, name: k, args: a }); sfxDepth++; try { return f(...a); } finally { sfxDepth--; } }; } // (a sound made of other sounds is logged once)
        return [];
      }
      if (!on && W.__sfxOrig) { Object.assign(S, W.__sfxOrig); W.__sfxOrig = undefined; }
      return W.__sfxLog ?? [];
    },
    sfxWav: async (log: { t: number; name: string; args: unknown[] }[], dur: number) => {
      const [l, r] = await renderSfxOffline(log, dur), n = l.length, b = new DataView(new ArrayBuffer(44 + n * 4));
      const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
      w(0, "RIFF"); b.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 2, true);
      b.setUint32(24, 44100, true); b.setUint32(28, 44100 * 4, true); b.setUint16(32, 4, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { b.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true); b.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true); }
      let bin = ""; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    toggleMap: (on?: boolean) => toggleMap(on),
    lobbyNpc: () => { const out: any[] = []; netView()?.npcs?.forEach((n: any, id: string) => { if (n.kind === "uncle_dumpster") out.push({ id, x: n.x, y: n.y, z: n.z, state: n.state }); }); return out[0] ?? null; },
    // C4b: tags on walls, my aura, and a noise (solo) to wake the old lady
    tags: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.tags?.forEach((t: any, id: string) => out.push({ id, ...t })); return out; },
    aura: () => { const v: any = local ? local.view : room?.state; return v?.players?.get(local ? SOLO_ID : room?.sessionId)?.aura ?? null; },
    noise: (x: number, z: number, r: number) => { const w = local?.world; const p = w?.players.get(SOLO_ID); if (w && p) w.noise(p, x, z, r); },
    canUses: () => (arena as any)?.canUses ?? -1,
    tagAim: () => !!(arena as any)?.tagTarget,
    // C3: the park's pigeons
    pigeons: () => ({ count: arena?.city.pigeonCount ?? 0, flying: arena?.city.pigeonsFlying ?? 0, scatters: arena?.city.scatters ?? 0 }),
    units: () => (arena as any)?.arena?.units?.map((u: any) => ({ id: u.id, name: u.name, use: u.use, x: u.x, z: u.z, doorX: u.doorX, doorZ: u.doorZ, out: u.out, upper: u.upper, access: u.access })) ?? [],
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
    resto: () => CITY.resto ?? null,
    // C5c.3: THE COMPACTOR and PAWN-O-RAMA
    club: () => CITY.club ?? null,
    hotShops: () => CITY.hotShops ?? [],
    fever: () => CITY.fever ?? null, // (R11)
    pub: () => CITY.pub ?? null, // (R12.1)
    pubInfo: () => arena?.pubInfo() ?? null,
    // R12.3: pool and darts: what each station shows; act as this player (open / join / leave a game); take a shot or
    // throw a dart through the player's own controls (no mouse); the aim ring right now
    pg: () => arena?.pg.info() ?? null,
    pgAct: (act: any) => arena?.onAction?.({ a: "pg", ...act }),
    pgUse: (id: string) => arena?.pg.use(id),
    pgAim: (angle: number) => arena?.pg.testAim(angle),
    pgShot: (id: string, angle: number, power: number, place?: { x: number; z: number }) => arena?.pg.testShot(id, angle, power, place),
    pgDart: (id: string, u: number, v: number) => arena?.pg.testDart(id, u, v),
    pgRing: () => arena?.pg.ring() ?? null,
    pgLeave: () => arena?.pg.leave(),
    pgQuiet: (on: boolean) => { if (arena) { arena.pg.quiet = on; if (on) arena.pg.leave(); } },
    pintPress: (down: boolean) => arena?.pint.press(down),
    pawnShop: () => { const ps = CITY.pawnShop; if (!ps) return null; const u = CITY.units![ps.unit]; return { ...ps, x: u.x, z: u.z, doorX: u.doorX, doorZ: u.doorZ, out: u.out, rect: u.rect }; },
    clubDrop: () => { if (local) local.world.clubB = local.world.traffic.clock; else room?.send("dbg", { op: "clubDrop" }); },
    clubFloor: () => { const a2 = (arena as any)?.arena; const i = a2?.pumpBoxes?.[0]; if (i === undefined) return null; const b = a2.boxes[i]; return b.y + b.h / 2; },
    setCash: (v: number) => { if (local) local.world.players.get(SOLO_ID)!.cash = v; else room?.send("dbg", { op: "cash", v }); },
    setAura: (v: number) => { if (local) local.world.players.get(SOLO_ID)!.aura = v; else room?.send("dbg", { op: "aura", v }); },
    myCash: () => arena?.myCash ?? 0,
    teleportY: (x: number, y: number, z: number, yaw: number) => {
      if (local) local.teleport(x, z, yaw, y); else room?.send("dbg", { op: "teleport", x, z, yaw, y });
      arena?.debugTeleport(x, z, yaw, y);
    },
    pawnAdd: (type: string, value: number, sale = false) => { if (local) local.world.pawn.debugAdd(type, value, SOLO_ID, 0, sale); },
    pawnCase: () => arena?.pawnCase ?? [],
    promptText: () => document.getElementById("prompt")?.textContent ?? "",
    clearItems: (x: number, z: number, r: number) => { if (!local) return; const w = local.world; for (const [id, it] of [...w.items]) if (it.mode === "free" && Math.hypot(it.body.x - x, it.body.z - z) < r) w.items.delete(id); },
    setLowGraphics: (on: boolean) => { settings.lowGraphics = on; applyScaling(); },
    dropAll: () => { if (local) local.world.dropAll(local.world.players.get(SOLO_ID)!); },
    /** C1: the open build yard the browser tests use as their origin (the old plaza) */
    T: CITY.landmarks!.testYard,
    raidAlert: () => !!(arena as any)?.raidAlert?.active,
    fakeRaid: () => (arena as any)?.debugRaid(),
    lights: () => (arena as any)?.city?.lampStates() ?? [],
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
    hp: () => arena?.hp ?? null,
    startMatch: () => startMatch(),
    triggerEvent: (kind: string) => { if (local) local.world.match.trigger(kind as never); else room?.send("dbg", { op: "event", kind }); },
    setTimeLeft: (t: number) => { if (local) { if (local.world.match.phase !== "lobby") local.world.match.timeLeft = t; } else room?.send("dbg", { op: "time", t }); },
    noEvents: () => { if (local) local.world.match.cancelPlannedEvents(); else room?.send("dbg", { op: "noEvents" }); },
    fxHistory: () => [...fxHistory],
    props: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.props?.forEach((pv: any, id: string) => { const d = CITY.props?.find((q) => q.id === id); out.push({ id, ready: pv.ready, alarm: pv.alarm, kind: d?.kind, x: d?.x, z: d?.z }); }); return out; },
    propDefs: () => CITY.props,
    cars: () => arena?.carPositions() ?? [],
    useTarget: () => arena?.useTarget ?? null,
    robTarget: () => arena?.robTarget ?? null,
    robT: () => arena?.robT ?? -1,
    respawnT: () => arena?.respawnT ?? 0,
    wipeout: () => { if (local) { const p = local.world.players.get(SOLO_ID)!; local.world.traffic.wipeout(p, local.world.traffic.cars[0]); } else room?.send("dbg", { op: "wipeout" }); },
    npcStats: () => arena?.npcStats() ?? null,
    // R12.5 (test box only): switch one cost off at a time to see what it costs (experiments, not settings)
    perfExp: (o: { outlines?: boolean; shadows?: boolean; scale?: number; bigCity?: boolean }) => {
      const sc = arena?.scene; if (!sc) return null;
      const cnt = { outlined: 0, big: 0, casters: 0 };
      for (const m of sc.meshes) {
        if ((m as any).__ol === undefined) (m as any).__ol = m.renderOutline;
        if (o.outlines !== undefined) m.renderOutline = o.outlines ? (m as any).__ol : false;
        if ((m as any).__ol) cnt.outlined++;
        const bb = m.getBoundingInfo().boundingBox, w = Math.max(bb.extendSizeWorld.x, bb.extendSizeWorld.z) * 2;
        if (w > 150 && m.name !== "ground" && !/road|pave|ground|water|sky/i.test(m.name)) { cnt.big++; if (o.bigCity !== undefined) { if ((m as any).__en === undefined) (m as any).__en = m.isEnabled(false); m.setEnabled(o.bigCity ? (m as any).__en : false); } }
      }
      for (const l of sc.lights) { const g = l.getShadowGenerator() as any; const map = g?.getShadowMap?.(); if (map) { cnt.casters += map.renderList?.length ?? 0; if (o.shadows !== undefined) { l.shadowEnabled = o.shadows; } } }
      if (o.scale !== undefined) engine.setHardwareScalingLevel(1 / o.scale);
      return cnt;
    },
    bench: () => void startBench(), benchResult: () => (window as any).__benchResult ?? null, // (R12.5)
    npcDrawn: (id: string) => arena?.npcDrawnPos(id) ?? null,
    punchTarget: () => arena?.punchTarget ?? null,
    heat: () => arena?.heat ?? null,
    // ---- Phase 4 police + jail
    finishHold: (id: string, quiet = false) => { const w = local?.world; const ps = w?.props.props.get(id); if (w && ps) w.props.finishHold(w.players.get(SOLO_ID)!, ps, quiet); return !!ps; },
    setHeat: (v: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; p.notoriety = 0; local.world.addHeat(p, v); } else room?.send("dbg", { op: "heat", v }); },
    bust: () => { if (local) local.world.police.bust(local.world.players.get(SOLO_ID)!, "test", false); else room?.send("dbg", { op: "bust" }); },
    setJailTime: (t: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; if (p.jailT > 0) p.jailT = t; } else room?.send("dbg", { op: "jailTime", t }); },
    knockMe: (t: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; p.move.knockT = t; p.hp = 0; } else room?.send("dbg", { op: "knock", t }); },
    arrest: () => arena ? { target: arena.arrestTarget, pinOn: arena.pinOn, pinBy: arena.pinBy, pinS: arena.pinS, others: [...arena.others].map(([id, o]) => ({ id, ...o })) } : null,
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
        // (out of jail: true when the picking got there first and the server's release beat our next poll; false when the time was served)
        if (!arena || arena.jailT <= 0) return resolve(L.history.includes("solved"));
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
