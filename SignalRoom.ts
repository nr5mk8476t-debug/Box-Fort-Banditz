import { Room, type Client } from "colyseus";
import { normalizeRoomCode, isValidRoomCode } from "@bfb/shared";
import { claimRoomCode, claimSpecificCode, releaseRoomCode } from "./roomCodes.ts";

/**
 * Phase 4.6 "host from your browser": the game itself runs in the host player's browser and
 * players talk to it directly (WebRTC). This room only introduces them: it passes the
 * connection offers/answers between the host and each joining player, then gets out of the way.
 * No game simulation here, so it costs the free server almost nothing.
 *
 * - The first client (the host) creates it; the room code is the invite code.
 * - Everyone else joins by code and may only message the host; the host may message anyone.
 * - If the host leaves, the room closes (the game lived in their browser).
 */
export class SignalRoom extends Room {
  maxClients = 16; // host + players still connecting / reconnecting
  maxMessagesPerSecond = 80;
  private hostId = "";
  private code = "";

  onCreate(options: { code?: string }) {
    const wanted = normalizeRoomCode(String(options?.code ?? ""));
    // a host whose browser game is still running can re-register its old code (e.g. after the server restarted)
    this.code = isValidRoomCode(wanted) && claimSpecificCode(wanted) ? wanted : claimRoomCode();
    this.roomId = this.code;

    this.onMessage("sig", (client, m: any) => {
      if (!m || typeof m !== "object") return;
      const fromHost = client.sessionId === this.hostId;
      const to = fromHost ? String(m.to ?? "") : this.hostId;
      const target = this.clients.getById(to);
      if (!target || target === client) return;
      const data = m.data;
      if (JSON.stringify(data ?? null).length > 20000) return; // offers/answers are a few KB
      target.send("sig", { from: client.sessionId, data });
    });
  }

  onJoin(client: Client) {
    if (!this.hostId) {
      this.hostId = client.sessionId;
      client.send("role", { host: true, code: this.code });
      return;
    }
    client.send("role", { host: false, code: this.code });
    this.clients.getById(this.hostId)?.send("peer", { id: client.sessionId });
  }

  onLeave(client: Client) {
    if (client.sessionId === this.hostId) {
      // the host closed their game: nobody can join it any more
      this.broadcast("closed", {});
      void this.disconnect();
      return;
    }
    this.clients.getById(this.hostId)?.send("gone", { id: client.sessionId });
  }

  onDispose() {
    releaseRoomCode(this.code);
  }
}
