// Test-only tools used by the automated tests (never reachable in a normal game):
// the server enables them with DEV_TOOLS=1, a browser host only in ?test=1 mode.
import type { World } from "./world.js";

export function applyDebug(world: World, id: string, m: any): void {
  if (!m || typeof m !== "object") return;
  if (m.op === "teleport") world.debugTeleport(id, Number(m.x), Number(m.z), Number(m.yaw), m.y === undefined ? undefined : Number(m.y));
  if (m.op === "spawn") world.placeItem(String(m.type), Number(m.x), world.floorAt(Number(m.x), Number(m.z)) + 0.3, Number(m.z));
  if (m.op === "npc") world.npc.place(m.kind, Number(m.x), Number(m.z), Number(m.yaw) || 0);
  if (m.op === "event") world.match.trigger(m.kind);
  if (m.op === "time" && world.match.phase !== "lobby") world.match.timeLeft = Math.max(0.1, Number(m.t) || 1);
  if (m.op === "noEvents") world.match.cancelPlannedEvents();
  if (m.op === "wipeout") { const p = world.players.get(id); if (p) world.traffic.wipeout(p, world.traffic.cars[0]); }
  if (m.op === "clearNpcs") world.npc.removeNear(Number(m.x), Number(m.z), Number(m.r) || 10);
  const me = world.players.get(id);
  if (me && m.op === "heat") { me.notoriety = 0; world.addHeat(me, Number(m.v) || 0); }
  if (me && m.op === "knock") { me.move.knockT = Math.max(0.1, Number(m.t) || 3); me.hp = 0; } // (C5c.1 tests: lie flat)
  if (me && m.op === "bust") world.police.bust(me, "dbg", false);
  if (me && m.op === "jailTime" && me.jailT > 0) me.jailT = Math.max(0.1, Number(m.t) || 1);
  if (m.op === "clearCops") world.police.reset();
  if (m.op === "clubDrop") world.clubB = world.traffic.clock; // (C5c.3: THE DROP starts building now)
  if (me && m.op === "cash") me.cash = Math.max(0, Number(m.v) || 0);
  if (me && m.op === "aura") me.aura = Math.max(0, Number(m.v) || 0);
  if (m.op === "bigShot") world.npc.spawnBigShot(m.kind || undefined);
}
