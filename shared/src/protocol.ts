// Names of messages and rooms shared between client and server.

export const ROOM_NAME = "fort_room";
/** Phase 4.6: tiny matchmaking room that only introduces players to a browser host (WebRTC signaling). */
export const SIGNAL_ROOM = "signal";

export const MSG = {
  /** client -> server: batch of MoveInput */
  INPUT: "in",
  /** client -> server: room owner starts the match (Phase 0: just enters the arena) */
  START: "start",
  /** server -> client: toast/announcement text */
  ANNOUNCE: "announce",
  /** client -> server: loot action (grab / drop / throw / cycle) */
  ACTION: "act",
  /** server -> client: batch of WorldEvents (sounds, effects) */
  EVENTS: "ev",
} as const;

export type RoomPhase = "lobby" | "arena";

export interface JoinOptions {
  name: string;
  /** room code the player typed or got from the link */
  code?: string;
}
