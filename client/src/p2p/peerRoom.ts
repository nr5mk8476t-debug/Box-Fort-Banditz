// Joining a friend's browser-hosted game: find the host through the matchmaking server by room
// code, then talk to their browser directly. Looks like a Colyseus Room to the rest of the game.
import type { Client, Room } from "@colyseus/sdk";
import { MSG } from "@bfb/shared";
import { PeerLink, type SignalData } from "./channel";
import { applyDelta, emptyState, type NetState } from "./sync";
import { Listeners } from "./emitter";

const CONNECT_TIMEOUT_MS = 20000;
const SILENT_DROP_MS = 8000;
const RECONNECT_FOR_MS = 60000;
/** onLeave code when the host ended the game on purpose */
export const HOST_LEFT = 4001;

export class PeerRoom {
  readonly isHost = false;
  sessionId = "";
  reconnectionToken = "";
  readonly state: NetState = emptyState();
  private link: PeerLink | null = null;
  private stateL = new Listeners<[any]>();
  private msgL = new Map<string, Listeners<[any]>>();
  private dropL = new Listeners<[]>();
  private reconL = new Listeners<[]>();
  private leaveL = new Listeners<[number]>();
  private pings = new Map<number, [number, (ms: number) => void]>();
  private pingId = 0;
  private closed = false;
  private dropped = false;
  private watch = 0;

  private constructor(private client: Client, readonly roomId: string, private name: string) {}

  static async join(client: Client, code: string, name: string, token: string | null): Promise<PeerRoom> {
    const r = new PeerRoom(client, code, name);
    r.reconnectionToken = token ?? "";
    await r.connect();
    r.watch = window.setInterval(() => r.checkAlive(), 1000);
    return r;
  }

  /** One attempt: matchmaking room -> direct connection -> hello -> welcome + full city. */
  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let sig: Room | null = null;
      let link: PeerLink | null = null;
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (sig) { const s = sig; sig = null; void s.leave(true).catch(() => {}); } // not needed once connected
        if (err) { if (link) { link.onClose = () => {}; link.close(); } reject(err); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error("p2p timeout: couldn't connect to the host's computer")), CONNECT_TIMEOUT_MS);
      this.client.joinById(this.roomId, {}).then((s) => {
        if (done) { void s.leave(true).catch(() => {}); return; }
        sig = s;
        s.onMessage("role", () => {});
        s.onMessage("sig", (m: { data: SignalData }) => void link?.signal(m.data));
        s.onMessage("closed", () => finish(new Error("room not found: the host closed the game")));
        // only now: the offer goes out straight away, through this matchmaking room
        link = new PeerLink((d) => { try { sig?.send("sig", { data: d }); } catch { /* ignore */ } }, true);
        this.wire(link, finish);
      }, (e) => finish(e instanceof Error ? e : new Error(String(e))));
    });
  }

  private wire(link: PeerLink, finish: (err?: Error) => void) {
      link.onOpen = () => link.send({ t: "hello", name: this.name, token: this.reconnectionToken });
      link.onClose = () => finish(new Error("p2p closed: couldn't connect to the host's computer"));
      link.onMessage = (m) => {
        if (m?.t === "reject") return finish(new Error(m.reason === "full" ? "room is full" : "rejected"));
        if (m?.t === "welcome") {
          this.sessionId = m.id;
          this.reconnectionToken = m.token;
          return;
        }
        if (m?.t === "s" && m.full && this.sessionId) {
          this.adopt(link);
          this.onHostMessage(m);
          finish();
        }
      };
  }

  private adopt(link: PeerLink) {
    this.link = link;
    link.onMessage = (m) => this.onHostMessage(m);
    link.onClose = () => { if (this.link === link) this.onLinkLost(); };
  }

  private onHostMessage(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.t === "s") {
      applyDelta(this.state, m.d ?? {}, !!m.full);
      this.stateL.emit(this.state);
      if (Array.isArray(m.e) && m.e.length) this.msgL.get(MSG.EVENTS)?.emit(m.e);
    } else if (m.t === "ann") this.msgL.get(MSG.ANNOUNCE)?.emit({ text: String(m.text ?? "") });
    else if (m.t === "pong") {
      const p = this.pings.get(m.id);
      if (p) { this.pings.delete(m.id); p[1](performance.now() - p[0]); }
    } else if (m.t === "bye") this.end(HOST_LEFT);
  }

  private checkAlive() {
    if (this.closed || !this.link || this.dropped) return;
    if (performance.now() - this.link.lastHeard > SILENT_DROP_MS) this.link.close();
  }

  private async onLinkLost() {
    if (this.closed || this.dropped) return;
    this.dropped = true;
    this.link = null;
    this.dropL.emit();
    const until = performance.now() + RECONNECT_FOR_MS;
    while (!this.closed && performance.now() < until) {
      await new Promise((r) => setTimeout(r, 1500));
      if (this.closed) return;
      try {
        await this.connect();
        this.dropped = false;
        this.reconL.emit();
        return;
      } catch (e) {
        if (/rejected|full/.test(String((e as Error)?.message))) break;
      }
    }
    if (!this.closed) this.end(4000);
  }

  private end(code: number) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.watch);
    const l = this.link;
    this.link = null;
    l?.close();
    this.leaveL.emit(code);
  }

  // ------------------------------------------------------------------ the Room API main.ts uses
  send(type: string, msg?: unknown) {
    this.link?.send({ t: type, m: msg });
  }
  onStateChange(cb: (s: any) => void) { return this.stateL.add(cb); }
  onMessage(type: string, cb: (m: any) => void) {
    let l = this.msgL.get(type);
    if (!l) { l = new Listeners(); this.msgL.set(type, l); }
    return l.add(cb);
  }
  onDrop(cb: () => void) { return this.dropL.add(cb); }
  onReconnect(cb: () => void) { return this.reconL.add(cb); }
  onLeave(cb: (code: number) => void) { return this.leaveL.add(cb); }
  ping(cb: (ms: number) => void) {
    if (!this.link) return;
    const id = ++this.pingId;
    this.pings.set(id, [performance.now(), cb]);
    if (this.pings.size > 20) this.pings.delete(this.pings.keys().next().value!);
    this.link.send({ t: "ping", id });
  }
  /** Tests: cut the connection as if the Wi-Fi dropped. */
  testDrop() { this.link?.close(); }

  async leave(_consented = true) {
    if (this.closed) return;
    this.link?.send({ t: "bye" });
    await new Promise((r) => setTimeout(r, 100));
    this.closed = true;
    clearInterval(this.watch);
    this.link?.close();
    this.link = null;
  }
}
