// A player whose browser vanishes keeps their seat for 30 s, then is removed.
import { Client } from "@colyseus/sdk";
import { spawn } from "node:child_process";
import { ROOM_NAME } from "@bfb/shared";
const url = "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const a = await new Client(url).create(ROOM_NAME, { name: "Host" });
a.onMessage("*", () => {});
// Ghost joins from a separate process, then the process is killed (like closing a laptop).
const ghost = spawn("npx", ["tsx", "tests/ghost-client.ts", url, a.roomId], { stdio: "inherit" });
await new Promise((r) => ghost.on("exit", r));
await sleep(500);
const st: any = a.state;
const ghostP = [...st.players.values()].find((p: any) => p.name === "Ghost");
console.log(ghostP && ghostP.connected === false ? "ok - ghost seat held, shown as disconnected" : "FAIL - ghost not held: " + JSON.stringify(ghostP));
await sleep(31000);
const still = [...st.players.values()].some((p: any) => p.name === "Ghost");
console.log(!still ? "ok - ghost removed after the 30 s window" : "FAIL - ghost still present after 31 s");
console.log(st.players.size === 1 ? "ok - host still in room, match keeps running" : "FAIL");
await a.leave(true);
process.exit(0);
