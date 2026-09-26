import { makeRoomCode } from "@bfb/shared";

// Single-process registry of room codes currently in use.
// (If we ever run several server processes, this moves to Redis presence.)
const active = new Set<string>();

export function claimRoomCode(): string {
  for (let i = 0; i < 1000; i++) {
    const code = makeRoomCode();
    if (!active.has(code)) {
      active.add(code);
      return code;
    }
  }
  throw new Error("Could not allocate a room code");
}

export function releaseRoomCode(code: string): void {
  active.delete(code);
}
