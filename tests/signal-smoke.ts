// Matchmaking smoke test (5A.1): the only thing the live server does now is introduce players to
// a browser host. No browser needed: two SDK clients play host + joiner.
import { Client } from "@colyseus/sdk";
import { SIGNAL_ROOM } from "@bfb/shared";

const url = process.env.SERVER_URL ?? "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function assert(c: unknown, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } else console.log("ok -", msg); }

const host = await new Client(url).create(SIGNAL_ROOM, {});
assert(/^[A-Z2-9]{5}$/.test(host.roomId), `host got a room code: ${host.roomId}`);
const hostGot: any[] = [];
host.onMessage("role", () => {});
host.onMessage("peer", (m) => hostGot.push(["peer", m]));
host.onMessage("gone", (m) => hostGot.push(["gone", m]));
host.onMessage("sig", (m) => hostGot.push(["sig", m]));

const joiner = await new Client(url).joinById(host.roomId, {});
const joinerGot: any[] = [];
joiner.onMessage("role", (m) => joinerGot.push(["role", m]));
joiner.onMessage("sig", (m) => joinerGot.push(["sig", m]));
joiner.onMessage("closed", () => joinerGot.push(["closed"]));
await sleep(300);
assert(hostGot.some(([t, m]) => t === "peer" && m.id === joiner.sessionId), "host is told a player arrived");

joiner.send("sig", { data: { sdp: { type: "offer", sdp: "fake" } } });
await sleep(300);
const offer = hostGot.find(([t]) => t === "sig");
assert(offer && offer[1].from === joiner.sessionId && offer[1].data.sdp.type === "offer", "joiner's offer reaches the host");
host.send("sig", { to: joiner.sessionId, data: { sdp: { type: "answer", sdp: "fake" } } });
await sleep(300);
assert(joinerGot.some(([t, m]) => t === "sig" && m.data.sdp.type === "answer"), "host's answer reaches the joiner");

// a joiner can't talk to another joiner, only to the host
const nosy = await new Client(url).joinById(host.roomId, {});
const nosyGot: any[] = [];
nosy.onMessage("*", (t, m) => nosyGot.push([t, m]));
joiner.send("sig", { to: nosy.sessionId, data: { hi: 1 } });
await sleep(300);
assert(!nosyGot.some(([t]) => t === "sig"), "joiners can't message each other");

// bad code
let bad = false;
try { await new Client(url).joinById("ZZZZZ", {}); } catch { bad = true; }
assert(bad, "a code that doesn't exist is refused");

// host leaves: the room closes
await host.leave(true);
await sleep(500);
assert(joinerGot.some(([t]) => t === "closed"), "players are told the host closed the game");
let gone = false;
try { await new Client(url).joinById(host.roomId, {}); } catch { gone = true; }
assert(gone, "the closed room's code no longer works");
console.log("ALL MATCHMAKING SMOKE TESTS PASSED");
process.exit(0);
