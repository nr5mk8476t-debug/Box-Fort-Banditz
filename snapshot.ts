// Turns a World into the plain data clients see. Used by the server (copied into the synced
// schema) and by solo mode (read directly), so the client reads ONE shape either way.
import type { World } from "./world.js";
import { MOVE_NUM_KEYS, MOVE_BOOL_KEYS } from "./movement.js";
import { lootDef } from "./loot.js";
import { LOCK_TIME, ROUNDS, type EventView } from "./match.js";

export interface PlayerView extends Record<string, any> {
  x: number; y: number; z: number; yaw: number; pitch: number;
  name: string; colorIdx: number; connected: boolean; lastSeq: number;
  hand: string; p0: string; p1: string; p2: string; sel: number;
  /** heat 0..100, rounded (wanted stars at 30 / 60 / 90) */
  heat: number;
  /** Phase 3: cash from finished rounds + value locked in the fort right now */
  cash: number;
  bank: number;
  /** Phase 3.5: seconds until respawn after a car wipeout (0 = fine); hold-up progress (-1 = none) */
  respawnT: number;
  robT: number;
  /** Phase 4: seconds of jail left (0 = free), your lock (seed; the client builds the same lock) */
  jailT: number;
  lockSeed: number;
  /** seconds on the server's lock clock (since you were locked up) */
  lockT: number;
  /** Phase 5A: pawn shop offers for your fort loot (JSON of OfferView[], "" = none); READY pressed */
  shop: string;
  ready: boolean;
}
export interface ItemView {
  type: string;
  /** 0 when the value is secret (mystery items) */
  value: number;
  x: number; y: number; z: number; rot: number;
  mode: string; holder: string; holder2: string; resting: boolean;
  /** banking progress in a fort yard: 0 = not banking, 1..99 = locking, 100 = locked */
  lock: number;
  /** fort slot it is banking in (-1 none) */
  fort: number;
  /** happy hour bonus (1 or 2) */
  mult: number;
  chute: boolean;
  /** Phase 5A tug of war balance (-1 holder wins .. +1 challenger wins; 0 when no tug) */
  tug: number;
}

/** Common "map-like" interface: both Map and Colyseus MapSchema provide forEach(value, key) and get(). */
export interface MapLike<T> { forEach(cb: (v: T, k: string) => void): void; get(k: string): T | undefined; size: number; }

export interface NpcView {
  kind: string;
  x: number; y: number; z: number; yaw: number;
  state: string;
  target: string;
  robbed: boolean;
}

/** Round loop + current city event (flat fields so the server can sync them directly). */
export interface MatchView {
  phase: string; // lobby | intro | scavenge | tally | over
  round: number;
  rounds: number;
  timeLeft: number;
  /** last round's results, JSON of RoundLine[] */
  results: string;
  evKind: string; evStage: string; evX: number; evZ: number; evR: number; evT: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}

/** Phase 3.5: dynamic state of a static prop (dumpster emptied, phone booth smashed, alarm ringing). */
export interface PropView { ready: boolean; alarm: boolean; }
export interface CarView { x: number; z: number; yaw: number; }
/** Phase 4: police cruisers chasing someone. */
export interface CopCarView { x: number; z: number; yaw: number; siren: boolean; }

export interface WorldView extends Partial<MatchView> {
  players: MapLike<PlayerView>;
  items: MapLike<ItemView>;
  npcs?: MapLike<NpcView>;
  props?: MapLike<PropView>;
  cars?: MapLike<CarView>;
  copCars?: MapLike<CopCarView>;
  phase: string;
  ownerId: string;
  code: string;
}

export const PLAYER_EXTRA_KEYS = ["hand", "p0", "p1", "p2", "sel", "lastSeq", "connected", "name", "colorIdx"] as const;
export const ITEM_KEYS = ["type", "value", "x", "y", "z", "rot", "mode", "holder", "holder2", "resting"] as const;

export function playerView(w: World, id: string, out: Record<string, any> = {}): PlayerView {
  const p = w.players.get(id)!;
  for (const k of MOVE_NUM_KEYS) out[k] = p.move[k];
  for (const k of MOVE_BOOL_KEYS) out[k] = p.move[k];
  out.name = p.name; out.colorIdx = p.colorIdx; out.connected = p.connected; out.lastSeq = p.lastSeq;
  out.hand = p.hand; out.p0 = p.pockets[0]; out.p1 = p.pockets[1]; out.p2 = p.pockets[2]; out.sel = p.sel;
  out.heat = Math.round(p.notoriety);
  out.cash = p.cash;
  out.bank = w.match.bankedValue(p);
  out.respawnT = Math.max(0, Math.ceil(p.respawnT * 10) / 10);
  out.robT = p.rob ? Math.round(p.rob.t * 20) / 20 : -1;
  out.jailT = p.jailT > 0 ? Math.max(0.1, Math.ceil(p.jailT * 10) / 10) : 0;
  out.lockSeed = p.jailT > 0 ? p.lockSeed : 0;
  out.lockT = p.jailT > 0 ? Math.floor((w.time - p.lockT0) * 20) / 20 : 0;
  out.shop = w.pawn.viewJson(id);
  out.ready = w.match.ready.has(id);
  return out as PlayerView;
}

export function itemView(w: World, id: string, out: Record<string, any> = {}): ItemView {
  const it = w.items.get(id)!;
  const b = it.body;
  out.type = it.type;
  out.value = lootDef(it.type).mystery ? 0 : it.value;
  out.x = b.x; out.y = b.y; out.z = b.z; out.rot = b.rot;
  out.mode = it.mode; out.holder = it.holder; out.holder2 = it.holder2; out.resting = b.resting;
  out.lock = it.locked ? 100 : it.fort >= 0 ? Math.min(99, Math.max(1, Math.floor((it.bankT / LOCK_TIME) * 100))) : 0;
  out.fort = it.fort; out.mult = it.mult; out.chute = it.chute;
  out.tug = it.holder2 ? Math.round(it.tug * 100) / 100 : 0;
  return out as ItemView;
}

export const NPC_KEYS = ["kind", "x", "y", "z", "yaw", "state", "target", "robbed"] as const;

export function npcView(w: World, id: string, out: Record<string, any> = {}): NpcView {
  const n = w.npc.npcs.get(id)!;
  out.kind = n.kind; out.x = n.move.x; out.y = n.move.y; out.z = n.move.z; out.yaw = n.move.yaw;
  out.state = n.state; out.target = n.target; out.robbed = n.robbed;
  return out as NpcView;
}

const evScratch: EventView = { kind: "", stage: "", x: 0, z: 0, r: 0, timeLeft: 0, truckOn: false, truckX: 0, truckZ: 0, truckYaw: 0 };
let lastResults: unknown = null, lastResultsJson = "[]";

/** Round loop state (writes only the flat fields, so it can target the synced room state). */
export function matchView(w: World, out: Record<string, any>): MatchView {
  const m = w.match;
  out.phase = m.phase; out.round = m.round; out.rounds = ROUNDS;
  out.timeLeft = Math.ceil(m.timeLeft * 10) / 10;
  if (m.results !== lastResults) { lastResults = m.results; lastResultsJson = JSON.stringify(m.results); }
  out.results = lastResultsJson;
  const e = m.view(evScratch);
  out.evKind = e.kind; out.evStage = e.stage; out.evX = e.x; out.evZ = e.z; out.evR = e.r; out.evT = Math.ceil(e.timeLeft);
  out.truckOn = e.truckOn; out.truckX = e.truckX; out.truckZ = e.truckZ; out.truckYaw = e.truckYaw;
  return out as MatchView;
}

export function propView(w: World, id: string, out: Record<string, any> = {}): PropView {
  const st = w.props.stateOf(id);
  out.ready = st.ready; out.alarm = st.alarm;
  return out as PropView;
}

export function carView(w: World, i: number, out: Record<string, any> = {}): CarView {
  const c = w.traffic.cars[i];
  out.x = c.x; out.z = c.z; out.yaw = c.yaw;
  return out as CarView;
}

export function copCarView(w: World, id: string, out: Record<string, any> = {}): CopCarView {
  const c = w.police.cars.find((x) => x.id === id)!;
  out.x = c.x; out.z = c.z; out.yaw = c.yaw; out.siren = c.mode !== "leave";
  return out as CopCarView;
}
