// Joining a friend's browser-hosted game: find the host through the matchmaking server by room
// code, then talk to their browser directly. Looks like a Colyseus Room to the rest of the game.
import type { Client, Room } from "@colyseus/sdk";
import { MSG } from "@bfb/shared";
import { PeerLink, type SignalData } from "./channel";
import { applyDelta, emptyState, type NetState } from "./sync";
import { Listeners } from "./channel";

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
  /** R12.4: the connection attempt that counts (each attempt gets a number; leaving, or a newer attempt, makes the
   *  older ones obsolete: whatever they bring back late is closed and ignored, never attached to the room) */
  private attempt = 0;
  /** call off the attempt in progress (leaving does this) */
  private cancelAttempt: (() => void) | null = null;
  /** the wait between reconnect tries (cleared on leaving) */
  private retryTimer = 0;
  private retryWake: (() => void) | null = null;
  /** (tests) how a direct link is made */
  static makeLink = (send: (d: SignalData) => void, initiator: boolean): PeerLink => new PeerLink(send, initiator);

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
    if (this.closed) return Promise.reject(new Error("left"));
    this.cancelAttempt?.(); // (only ever one attempt at a time)
    const gen = ++this.attempt;
    return new Promise<void>((resolve, reject) => {
      let sig: Room | null = null;
      let link: PeerLink | null = null;
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (this.cancelAttempt === cancel) this.cancelAttempt = null;
        if (sig) { const s = sig; sig = null; void s.leave(true).catch(() => {}); } // not needed once connected
        if (err) { if (link) { const l = link; link = null; l.onOpen = () => {}; l.onMessage = () => {}; l.onClose = () => {}; l.close(); } reject(err); } else resolve();
      };
      const cancel = () => finish(new Error("left"));
      this.cancelAttempt = cancel;
      // (still the attempt that counts, and still in the room?)
      const current = () => gen === this.attempt && !this.closed && !done;
      const timer = setTimeout(() => finish(new Error("p2p timeout: couldn't connect to the host's computer")), CONNECT_TIMEOUT_MS);
      this.client.joinById(this.roomId, {}).then((s) => {
        if (!current()) { void s.leave(true).catch(() => {}); return; }
        sig = s;
        s.onMessage("role", () => {});
        s.onMessage("sig", (m: { data: SignalData }) => { if (current()) void link?.signal(m.data); });
        s.onMessage("closed", () => finish(new Error("room not found: the host closed the game")));
        // only now: the offer goes out straight away, through this matchmaking room
        link = PeerRoom.makeLink((d) => { try { if (current()) sig?.send("sig", { data: d }); } catch { /* ignore */ } }, true);
        this.wire(link, finish, current);
      }, (e) => finish(e instanceof Error ? e : new Error(String(e))));
    });
  }

  private wire(link: PeerLink, finish: (err?: Error) => void, current: () => boolean) {
      link.onOpen = () => { if (current()) link.send({ t: "hello", name: this.name, token: this.reconnectionToken }); else finish(new Error("left")); };
      link.onClose = () => finish(new Error("p2p closed: couldn't connect to the host's computer"));
      link.onMessage = (m) => {
        // (R12.4: a welcome or a first snapshot that turns up after you've left, or for an attempt that's been
        //  superseded, closes its own link: it never brings a closed room back to life)
        if (!current()) { finish(new Error("left")); return; }
        if (m?.t === "reject") return finish(new Error(m.reason === "full" ? "room is full" : "rejected"));
        if (m?.t === "welcome") {
          this.sessionId = m.id;
          this.reconnectionToken = m.token;
          return;
        }
        if (m?.t === "s" && m.full && this.sessionId) {
          if (!this.adopt(link)) { finish(new Error("left")); return; }
          this.onHostMessage(m);
          finish();
        }
      };
  }

  private adopt(link: PeerLink): boolean {
    if (this.closed) return false;
    this.link?.close();
    this.link = link;
    link.onMessage = (m) => this.onHostMessage(m);
    link.onClose = () => { if (this.link === link) this.onLinkLost(); };
    return true;
  }

  private onHostMessage(m: any) {
    if (this.closed || !m || typeof m !== "object") return;
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
      await new Promise<void>((r) => { this.retryWake = r; this.retryTimer = window.setTimeout(r, 1500); });
      this.retryWake = null;
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
    this.shutdown();
    this.leaveL.emit(code);
    this.clearListeners();
  }
  /** R12.4: stop everything: the attempt in progress, the reconnect wait, the watchdog, the link, pending pings */
  private shutdown() {
    this.closed = true;
    this.attempt++;
    this.cancelAttempt?.(); this.cancelAttempt = null;
    clearTimeout(this.retryTimer); this.retryWake?.(); this.retryWake = null;
    clearInterval(this.watch);
    const l = this.link;
    this.link = null;
    if (l) { l.onMessage = () => {}; l.onClose = () => {}; l.close(); }
    this.pings.clear();
  }
  private clearListeners() { this.stateL.clear(); for (const l of this.msgL.values()) l.clear(); this.dropL.clear(); this.reconL.clear(); this.leaveL.clear(); }

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
    // (R12.4: closed straight away: nothing in flight, a reconnect half-done or a late welcome, can attach from here on)
    const l = this.link;
    this.link = null;
    this.shutdown();
    if (l) { l.send({ t: "bye" }); await new Promise((r) => setTimeout(r, 100)); l.onMessage = () => {}; l.onClose = () => {}; l.close(); }
    this.clearListeners();
  }
  /** (tests) is a reconnect attempt in progress? */
  get connecting() { return !!this.cancelAttempt; }
  get isClosed() { return this.closed; }
}
