import { Client } from "@colyseus/sdk";
const [url, code] = process.argv.slice(2);
await new Client(url).joinById(code, { name: "Ghost" });
setTimeout(() => process.kill(process.pid, "SIGKILL"), 800);
