// Talking to the Colyseus multiplayer server.
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, normalizeRoomCode, isValidRoomCode } from "@bfb/shared";

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
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
export function rememberRoom(room: Room): void {
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
  if (/not found|invalid|expired/i.test(msg)) return "That room doesn't exist any more. Check the code, or create a new room.";
  if (/locked|full|maxClients/i.test(msg)) return "That room is full (4 bandits max).";
  if (/fetch|network|ECONNREFUSED|Failed|timeout|offline/i.test(msg)) return "Can't reach the game server. It may be waking up (free hosting takes ~1 minute) or offline. Try again shortly.";
  return "Something went wrong joining the room: " + msg.slice(0, 120);
}

export async function createRoom(name: string): Promise<Room> {
  return getClient().create(ROOM_NAME, { name });
}

export async function joinRoom(rawCode: string, name: string): Promise<Room> {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) throw new Error("invalid room code");
  const token = savedToken(code);
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
