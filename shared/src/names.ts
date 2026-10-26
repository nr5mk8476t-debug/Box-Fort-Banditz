import { NAME_MAX_LENGTH } from "./constants.js";

// Room codes avoid look-alike characters (0/O, 1/I/L) so they are easy to read aloud.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  }
  return s;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

const ADJ = ["Sneaky", "Crusty", "Lucky", "Soggy", "Spicy", "Wobbly", "Shifty", "Greasy", "Turbo", "Dusty", "Cheeky", "Grumpy"];
const NOUN = ["Raccoon", "Bandit", "Pigeon", "Noodle", "Hustler", "Gremlin", "Toaster", "Goblin", "Possum", "Cone", "Biscuit", "Crate"];

export function randomBanditName(rand: () => number = Math.random): string {
  return ADJ[Math.floor(rand() * ADJ.length)] + NOUN[Math.floor(rand() * NOUN.length)];
}

/** Trim, strip control/markup characters and cap length. Empty -> random name. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return randomBanditName();
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
  return cleaned.length ? cleaned : randomBanditName();
}
