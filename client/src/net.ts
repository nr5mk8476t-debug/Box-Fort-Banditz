// Online play. Phase 4.6: by default the player who creates a room HOSTS the game in their own
// browser and friends connect straight to them (lowest lag, no server CPU limits). The server only
// introduces players to each other. The old server-hosted rooms still work with ?net=server.
import { Client } from "@colyseus/sdk";
import { ROOM_NAME, normalizeRoomCode, isValidRoomCode } from "@bfb/shared";
import { HostRoom } from "./p2p/hostRoom";
import { PeerRoom } from "./p2p/peerRoom";

/** What the game needs from a room, whoever runs it (the server, this browser, or a friend's browser). */
export interface GameRoom {
  roomId: string;
  sessionId: string;
  state: any;
  reconnectionToken: string;
  readonly isHost?: boolean;
  send(type: string, msg?: unknown): void;
  onStateChange(cb: (s: any) => void): unknown;
  onMessage(type: string, cb: (m: any) => void): unknown;
  onDrop(cb: () => void): unknown;
  onReconnect(cb: () => void): unknown;
  onLeave(cb: (code: number) => void): unknown;
  ping(cb: (ms: number) => void): void;
  leave(consented?: boolean): Promise<unknown>;
  testDrop?(): void;
}

/** ?net=server: play on the game server instead of hosting in the browser. */
export const SERVER_HOSTED = new URLSearchParams(location.search).get("net") === "server";
const TEST_MODE = new URLSearchParams(location.search).has("test");

/** Blake's hosted game server (Render). */
export const PUBLIC_SERVER = "https://box-fort-banditz-server.onrender.com";

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  // The public site (Cloudflare) talks to the public game server (Render, Singapore),
  // even if the build forgot the VITE_SERVER_URL setting.
  if (/\.(pages|workers)\.dev$/.test(location.hostname)) return PUBLIC_SERVER;
  // Local development: server runs on port 2567 on the same machine.
  return `${location.protocol}//${location.hostname}:2567`;
}

let client: Client | null = null;
function getClient(): Client {
  if (!client) client = new Client(serverUrl());
  return client;
}

const TOKEN_KEY = "bfb.reconnect";

/** Remember how to get back into this room if the tab is refreshed. */
export function rememberRoom(room: GameRoom): void {
  if (room.isHost) { forgetRoom(); return; } // a host's game lives in this tab: nothing to come back to after a refresh
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code: room.roomId, token: room.reconnectionToken }));
  } catch { /* storage blocked */ }
}

export function forgetRoom(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function savedToken(code: string): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v.code === code ? v.token : null;
  } catch {
    return null;
  }
}

/** Turns a raw error into a sentence a player understands. */
export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? "");
  if (/not found|invalid|expired/i.test(msg)) return "That room doesn't exist any more (the host may have closed their game). Check the code, or create a new room.";
  if (/p2p/i.test(msg)) return "Couldn't connect to the host's computer. Check you're both online and try again; some school/work/mobile networks block direct connections.";
  if (/locked|full|maxClients/i.test(msg)) return "That room is full (4 bandits max).";
  if (/fetch|network|ECONNREFUSED|Failed|timeout|offline/i.test(msg)) return "Can't reach the game server. It may be waking up (free hosting takes ~1 minute) or offline. Try again shortly.";
  return "Something went wrong joining the room: " + msg.slice(0, 120);
}

export async function createRoom(name: string): Promise<GameRoom> {
  if (!SERVER_HOSTED) return HostRoom.create(getClient(), name, TEST_MODE);
  return getClient().create(ROOM_NAME, { name }) as unknown as GameRoom;
}

export async function joinRoom(rawCode: string, name: string): Promise<GameRoom> {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) throw new Error("invalid room code");
  const token = savedToken(code);
  if (!SERVER_HOSTED) return PeerRoom.join(getClient(), code, name, token);
  return (await joinServerRoom(code, name, token)) as unknown as GameRoom;
}

async function joinServerRoom(code: string, name: string, token: string | null) {
  if (token) {
    try {
      return await getClient().reconnect(token);
    } catch {
      forgetRoom(); // seat expired: join as a new player instead
    }
  }
  return getClient().joinById(code, { name });
}

export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("room", code);
  // (R3: friends need the host's city: pass the map along when it isn't the default one)
  const map = new URLSearchParams(location.search).get("map");
  if (map) u.searchParams.set("map", map);
  return u.toString();
}

export function roomCodeFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get("room");
  if (!c) return null;
  const n = normalizeRoomCode(c);
  return isValidRoomCode(n) ? n : null;
}

export function setUrlRoom(code: string | null): void {
  const u = new URL(location.href);
  if (code) u.searchParams.set("room", code);
  else u.searchParams.delete("room");
  history.replaceState(null, "", u.toString());
}
