// Headless multiplayer smoke test: no browser. Two SDK clients join one room by code.
import { Client } from "@colyseus/sdk";
import { ROOM_NAME, MSG } from "@bfb/shared";

const url = process.env.SERVER_URL ?? "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function assert(c: unknown, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } else console.log("ok -", msg); }

const a = await new Client(url).create(ROOM_NAME, { name: "Alice" });
assert(/^[A-Z2-9]{5}$/.test(a.roomId), `room code looks right: ${a.roomId}`);
const b = await new Client(url).joinById(a.roomId, { name: "<Bob>" });
a.onMessage("*", () => {}); b.onMessage("*", () => {});
await sleep(300);
const st: any = a.state;
assert(st.players.size === 2, "both players in room");
assert(st.ownerId === a.sessionId, "creator is owner");
const bob = st.players.get(b.sessionId);
assert(bob.name === "Bob", `name sanitized: ${bob.name}`);
assert(bob.colorIdx !== st.players.get(a.sessionId).colorIdx, "distinct colours");

// Alice walks forward for 1s (60 inputs)
const startZ = st.players.get(a.sessionId).z;
for (let i = 0; i < 60; i++) { a.send(MSG.INPUT, [{ seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const alice = (b.state as any).players.get(a.sessionId);
assert(alice.z - startZ > 4 && alice.z - startZ < 6, `Bob sees Alice moved ~5m: ${(alice.z - startZ).toFixed(2)}`);
assert(alice.lastSeq === 59, `server acked all inputs: ${alice.lastSeq}`);

// Speed hack attempt: 200 inputs at once should NOT all be applied instantly
const before = alice.z;
const burst = []; for (let i = 60; i < 76; i++) burst.push({ seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false });
for (let k = 0; k < 10; k++) a.send(MSG.INPUT, burst.map((x) => ({ ...x, seq: x.seq + k * 16 })));
await sleep(100);
const moved = (b.state as any).players.get(a.sessionId).z - before;
assert(moved < 3, `burst inputs rate-limited (moved ${moved.toFixed(2)}m in 0.1s)`);

// Phase 1 state reaches other players: stamina drain and crouch
let seq = 1000;
for (let i = 0; i < 90; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const aView = (b.state as any).players.get(a.sessionId);
assert(aView.stamina < 0.9, `Bob sees Alice's stamina drop: ${aView.stamina.toFixed(2)}`);
for (let i = 0; i < 20; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: true, dodge: false }]); await sleep(16); }
await sleep(300);
assert((b.state as any).players.get(a.sessionId).crouching === true, "Bob sees Alice crouching");

// Phase 2: loot is synced, and actions produce events
const itemsSeen = (b.state as any).items.size;
assert(itemsSeen >= 28, `loot synced to clients: ${itemsSeen} items`);
let firstItem: any = null;
(b.state as any).items.forEach((it: any, id: string) => { if (!firstItem) firstItem = { id, ...it.toJSON?.() ?? it }; });
assert(typeof firstItem.type === "string" && Number.isFinite(firstItem.x), `item has type + position (${firstItem.type})`);
const evs: any[] = [];
a.onMessage(MSG.EVENTS, (e: any[]) => evs.push(...e));
a.send(MSG.ACTION, { a: "grab", item: firstItem.id }); // far away -> whiff
await sleep(300);
assert(evs.some((e) => e.t === "whiff" && e.p === a.sessionId), "grabbing a far item = whiff event");

// Phase 2.5: pedestrians are synced
const npcCount = (b.state as any).npcs.size;
assert(npcCount === 24, `pedestrians + cashiers synced to clients: ${npcCount}`);
{
  const st2: any = a.state;
  assert(st2.cars.size === 14, `traffic synced: ${st2.cars.size} cars`);
  assert(st2.props.size > 90, `props synced: ${st2.props.size}`);
}
let anNpc: any = null;
(b.state as any).npcs.forEach((n: any) => { if (!anNpc) anNpc = n; });
assert(typeof anNpc.kind === "string" && Number.isFinite(anNpc.x), `pedestrian has kind + position (${anNpc.kind})`);
const x0 = anNpc.x, z0 = anNpc.z;
await sleep(1500);
assert(Math.hypot(anNpc.x - x0, anNpc.z - z0) > 0.3 || anNpc.state !== "walk", "pedestrians are walking around");

// Only owner may start
b.send(MSG.START); await sleep(200);
assert(st.phase === "lobby", "non-owner cannot start");
a.send(MSG.START); await sleep(200);
assert(st.phase === "intro" && st.round === 1, "owner starts round 1");
assert(st.timeLeft > 3 && st.timeLeft <= 5, `intro countdown synced: ${st.timeLeft}`);

// Bad code
try { await new Client(url).joinById("ZZZZZ", { name: "x" }); assert(false, "bad code rejected"); }
catch { assert(true, "bad code rejected"); }

// Owner leaves -> ownership transfers
await a.leave(true); await sleep(300);
assert((b.state as any).ownerId === b.sessionId, "ownership passed to Bob");
await b.leave(true);
console.log("ALL SERVER SMOKE TESTS PASSED");
process.exit(0);
