// Headless multiplayer smoke test: no browser. Two SDK clients join one room by code.
import { Client } from "@colyseus/sdk";
import { ROOM_NAME, MSG, CAR_COUNT } from "@bfb/shared";

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
// (C5a: Alice starts on the squat's roof facing the view; she walks back into the camp, away from the parapet)
for (let i = 0; i < 60; i++) { a.send(MSG.INPUT, [{ seq: i, mx: 0, mz: 1, yaw: Math.PI, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const alice = (b.state as any).players.get(a.sessionId);
assert(startZ - alice.z > 4.8 && startZ - alice.z < 7.2, `Bob sees Alice moved ~6m: ${(startZ - alice.z).toFixed(2)}`); // (R12.9: walking is 6.67 m/s now, +15%)
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
// (D1: sprint is 9.4 m/s now, so she sprints on into the camp instead of straight into the roof parapet, where a stopped sprint drains nothing)
for (let i = 0; i < 90; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 1, yaw: Math.PI, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const aView = (b.state as any).players.get(a.sessionId);
assert(aView.stamina < 0.9, `Bob sees Alice's stamina drop: ${aView.stamina.toFixed(2)}`);
// (D1: stop first: crouching at a full sprint is a slide, not a crouch)
for (let i = 0; i < 30; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); await sleep(16); }
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
const npcCount = [...(b.state as any).npcs.values()].filter((n: any) => n.kind !== "cop").length; // (R10: cops patrol from the lobby on; counted apart)
const copCount = (b.state as any).npcs.size - npcCount;
// (R3: the server builds the new city: 20 walkers + the taco vendor, the fisherman and Uncle Dumpster; R5: + Twitchy Lou
//  and Meat Locker at the pawn shop; R6: + the Champ in the holding cell; R7: + Sticky Fran, Cold Cuts and the station's receptionist (the patrols
//  only come on duty once the scavenge starts); the classic city had 44 with its shops and landmarks)
assert(copCount >= 4, `R10: the police are out before the match starts: ${copCount} cops`);
assert(npcCount === 63, `pedestrians + the taco vendor, the fisherman, Uncle Dumpster, Lou, Meat Locker, Fran, Cold Cuts, the receptionist, the Champ, NEON FEVER DREAM's bouncer (R11) and DON BINNIE with his two bodyguards (R11.1), SKETCHY STEVE (R11.4), THE SOGGY SHAMROCK's Fergal, two regulars, the four-piece band (R12.1) eight drinkers (R12.1b), MAMMY MOLONEY (R12.2), upstairs Róisín and four more drinkers (R12.2b), SEAMUS O'SHORTLY (in Mammy's place), his six wee buddies and BIG DESSIE (R12.2c), WEE MICKEY at the cellar door (R12.6) synced to clients: ${npcCount} (20 + 43)`);
{
  const st2: any = a.state;
  assert(st2.cars.size === CAR_COUNT, `traffic synced: ${st2.cars.size} cars`);
  assert(st2.props.size >= 40, `props synced: ${st2.props.size}`); // (C1 layout: 82; R3 new city: about 60 before its landmarks come back)
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
