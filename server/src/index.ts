import { defineServer, defineRoom, WebSocketTransport } from "colyseus";
import { ROOM_NAME } from "@bfb/shared";
import { FortRoom } from "./FortRoom.ts";

const port = Number(process.env.PORT) || 2567;

const server = defineServer({
  // Be patient with busy laptops: the default (3 s x 2 missed pings) dropped players whose
  // browser was busy loading the big city. 5 s x 4 = ~20 s before a silent client is dropped.
  transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 4 }),
  rooms: {
    [ROOM_NAME]: defineRoom(FortRoom),
  },
  // Hosting health check (Render pings this to know the server is up) + a friendly root page.
  express: (app) => {
    app.get("/health", (_req, res) => { res.json({ ok: true }); });
    app.get("/", (_req, res) => { res.type("text").send("Box Fort Banditz game server is running. Play at the game website."); });
  },
});

server.listen(port).then(() => {
  console.log(`[Box Fort Banditz] server listening on :${port}`);
});
