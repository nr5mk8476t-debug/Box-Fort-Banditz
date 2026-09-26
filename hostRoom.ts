// "Host from your browser": the player who creates a room runs the whole game (the same World
// the server used to run) right here in their browser, and friends connect straight to them.
// This class looks like a Colyseus Room to the rest of the game, so main.ts barely changes.
import type { Client, Room } from "@colyseus/sdk";
import { MSG, MAX_PLAYERS, SIM_DT, SIGNAL_ROOM, applyDebug, type WorldEvent } from "@bfb/shared";
import { LocalSession } from "../localSession";
import { PeerLink, type SignalData } from "./channel";
import { Snapshotter } from "./sync";
import { Listeners, randomId, backgroundTimer } from "./emitter";

/** How long a player who lost connection keeps their seat (seconds). */
export const SEAT_HOLD_S = 120;
const SEND_EVERY_MS = 50; // 20 updates a second, like the server
const SILENT_DROP_MS = 8000; // no word from a player for this long = connection lost

interface Peer {
  sig: string; // their id in the matchmaking room
  link: PeerLink;
  id: string; // game id once they said hello
  synced: boolean; // received the full snapshot
  stale: boolean; // fell behind: skip updates, then resend everything
  bornT: number;
  lastSent: number;
  bye: boolean;
}
interface Seat { token: string; peer: Peer | null; dropT: number; name: string; }

export class HostRoom {
  readonly isHost = true;
  readonly sessionId: string;
  roomId: string;
  readonly reconnectionToken = "";
  readonly session: LocalSession;
  private sig: Room | null = null;
  private peers = new Map<string, Peer>(); // by signal id
  private seats = new Map<string, Seat>(); // by game id
  private snap = new Snapshotter();
  private pendingEvents: WorldEvent[] = [];
  private stateL = new Listeners<[any]>();
  private msgL = new Map<string, Listeners<[any]>>();
  private leaveL = new Listeners<[number]>();
  private stopTimer: () => void = () => {};
  private last = performance.now();
  private acc = 0;
  private lastFlush = 0;
  private lastChores = 0;
  private closed = false;
  /** bytes sent to players per second (for the debug overlay and tests) */
  stats = { upBytes: 0, upRate: 0, rateT: performance.now() };

  private constructor(private client: Client, name: string, private testMode: boolean) {
    this.sessionId = randomId();
    this.session = new LocalSession(name, this.sessionId);
    this.roomId = "";
  }

  static async create(client: Client, name: string, testMode: boolean): Promise<HostRoom> {
    const h = new HostRoom(client, name, testMode);
    await h.register();
    h.stopTimer = backgroundTimer(1000 / 60, () => h.onTick());
    return h;
  }

  get state() { return this.session.view; }
  get world() { return this.session.world; }
  get playerCount() { return this.world.players.size; }

  /** Open (or re-open) the matchmaking room that lets friends find this game by code. */
  private async register() {
    const sig = await this.client.create(SIGNAL_ROOM, { code: this.roomId || undefined });
    this.sig = sig;
    this.roomId = sig.roomId;
    this.session.view.code = this.roomId;
    this.session.view.ownerId = this.sessionId;
    sig.onMessage("role", () => {});
    sig.onMessage("peer", () => {});
    sig.onMessage("closed", () => {});
    sig.onMessage("gone", () => {});
    sig.onMessage("sig", (m: { from: string; data: SignalData }) => this.onSignal(m.from, m.data));
    sig.onLeave(() => {
      if (this.closed || this.sig !== sig) return;
      this.sig = null;
      // lost the matchmaking server (e.g. it restarted): the game keeps running, but keep trying
      // to re-open the room so new players (and reconnecting ones) can still find it
      const retry = async () => {
        if (this.closed || this.sig) return;
        try { await this.register(); } catch { setTimeout(retry, 5000); }
      };
      setTimeout(retry, 1000);
    });
  }

  private onSignal(from: string, data: SignalData) {
    let peer = this.peers.get(from);
    if (!peer) {
      if (!data?.sdp || data.sdp.type !== "offer") return;
      const link = new PeerLink((d) => { try { this.sig?.send("sig", { to: from, data: d }); } catch { /* signal gone */ } }, false);
      peer = { sig: from, link, id: "", synced: false, stale: false, bornT: performance.now(), lastSent: 0, bye: false };
      const p = peer;
      this.peers.set(from, p);
      link.onMessage = (m) => this.onPeerMessage(p, m);
      link.onClose = () => this.onPeerClosed(p);
    }
    void peer.link.signal(data);
  }

  // ------------------------------------------------------------------ messages from players
  private onPeerMessage(peer: Peer, m: any) {
    if (!m || typeof m !== "object") return;
    if (m.t === "hello") return this.onHello(peer, m);
    if (m.t === "ping") { this.sendTo(peer, { t: "pong", id: m.id }); return; }
    if (!peer.id) return;
    if (m.t === MSG.INPUT) this.world.pushInputs(peer.id, m.m);
    else if (m.t === MSG.ACTION) this.world.action(peer.id, m.m);
    else if (m.t === "dbg" && this.testMode) applyDebug(this.world, peer.id, m.m);
    else if (m.t === "bye") { peer.bye = true; peer.link.close(); }
    // START: only the host starts the match
  }

  private onHello(peer: Peer, m: any) {
    if (peer.id) return;
    const name = String(m.name ?? "").slice(0, 40);
    const token = typeof m.token === "string" ? m.token : "";
    let id = "";
    for (const [sid, seat] of this.seats) if (token && seat.token === token) id = sid;
    const seatHeld = id && this.world.players.has(id);
    if (seatHeld) {
      const seat = this.seats.get(id)!;
      const old = seat.peer;
      seat.peer = peer;
      peer.id = id;
      if (old && old !== peer) { old.id = ""; old.link.close(); } // their old connection hasn't noticed it's dead yet
      this.world.setConnected(id, true);
      this.announce(`${this.world.players.get(id)!.name} is back!`);
    } else {
      if (this.world.players.size >= MAX_PLAYERS) {
        peer.link.send({ t: "reject", reason: "full" });
        setTimeout(() => peer.link.close(), 1000);
        return;
      }
      id = randomId();
      const p = this.world.addPlayer(id, name);
      this.seats.set(id, { token: randomId(24), peer, dropT: 0, name: p.name });
      peer.id = id;
      this.announce(`${p.name} joined the fort party`, peer);
    }
    const seat = this.seats.get(id)!;
    peer.link.send({ t: "welcome", id, token: seat.token, code: this.roomId });
    // bring everyone else up to date, then send the newcomer the whole city
    this.session.refresh();
    this.flush(performance.now());
    peer.link.send({ t: "s", full: 1, d: this.snap.full() });
    peer.synced = true;
    this.stateL.emit(this.state);
  }

  private onPeerClosed(peer: Peer) {
    this.peers.delete(peer.sig);
    const id = peer.id;
    if (!id) return;
    peer.id = "";
    const seat = this.seats.get(id);
    if (!seat || seat.peer !== peer) return;
    seat.peer = null;
    const name = this.world.players.get(id)?.name ?? seat.name;
    if (peer.bye || this.closed) {
      this.removeSeat(id);
      if (!this.closed) this.announce(`${name} left`);
      return;
    }
    seat.dropT = performance.now();
    this.world.setConnected(id, false);
    this.announce(`${name} lost connection... holding their spot`);
  }

  private removeSeat(id: string) {
    this.seats.delete(id);
    this.world.removePlayer(id);
    this.session.refresh();
  }

  // ------------------------------------------------------------------ the game loop
  private onTick() {
    if (this.closed) return;
    const now = performance.now();
    this.acc += Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    let steps = 0;
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.world.tick();
      steps++;
    }
    if (steps) {
      const ev = this.world.takeEvents();
      this.session.refresh();
      if (ev.length) this.pendingEvents.push(...ev);
      // the host's own screen: skip while the tab is hidden (nothing is drawn anyway)
      if (typeof document === "undefined" || !document.hidden) {
        this.stateL.emit(this.state);
        if (ev.length) this.msgL.get(MSG.EVENTS)?.emit(ev);
      }
    }
    if (now - this.lastFlush >= SEND_EVERY_MS) this.flush(now);
    if (now - this.lastChores >= 1000) { this.lastChores = now; this.chores(now); }
  }

  /** Send what changed (and the latest events) to every player. */
  private flush(now: number) {
    this.lastFlush = now;
    const d = this.snap.diff(this.state);
    const ev = this.pendingEvents;
    this.pendingEvents = [];
    let msg = "";
    for (const p of this.peers.values()) {
      if (!p.synced || !p.link.open) continue;
      if (p.stale) {
        // a slow connection fell behind: once its backlog clears, resend everything
        if (p.link.backlog < 64 * 1024) { p.stale = false; this.sendTo(p, { t: "s", full: 1, d: this.snap.full(), e: ev.length ? ev : undefined }); }
        continue;
      }
      if (p.link.backlog > 512 * 1024) { p.stale = true; continue; }
      if (d || ev.length) this.sendTo(p, msg ||= JSON.stringify({ t: "s", d: d ?? {}, e: ev.length ? ev : undefined }));
      else if (now - p.lastSent > 1000) this.sendTo(p, { t: "k" }); // keep-alive
    }
  }

  private sendTo(p: Peer, m: any) {
    p.lastSent = performance.now();
    const s = typeof m === "string" ? m : JSON.stringify(m);
    this.stats.upBytes += s.length;
    p.link.send(s);
  }

  private chores(now: number) {
    const dt = (now - this.stats.rateT) / 1000;
    if (dt >= 1) { this.stats.upRate = Math.round(this.stats.upBytes / dt); this.stats.upBytes = 0; this.stats.rateT = now; }
    for (const p of [...this.peers.values()]) {
      if (!p.id && now - p.bornT > 25000) p.link.close(); // never finished connecting
      else if (p.id && now - p.link.lastHeard > SILENT_DROP_MS) p.link.close(); // went silent
    }
    for (const [id, seat] of [...this.seats]) {
      if (!seat.peer && seat.dropT && now - seat.dropT > SEAT_HOLD_S * 1000) {
        const name = this.world.players.get(id)?.name ?? seat.name;
        this.removeSeat(id);
        this.announce(`${name} left`);
      }
    }
  }

  private announce(text: string, except?: Peer) {
    for (const p of this.peers.values()) if (p !== except && p.synced) this.sendTo(p, { t: "ann", text });
    this.msgL.get(MSG.ANNOUNCE)?.emit({ text });
  }

  // ------------------------------------------------------------------ the Room API main.ts uses
  send(type: string, msg?: unknown) {
    if (type === MSG.INPUT) this.session.sendInputs(msg as any);
    else if (type === MSG.ACTION) this.session.sendAction(msg as any);
    else if (type === MSG.START) this.world.startMatch();
    else if (type === "dbg" && this.testMode) applyDebug(this.world, this.sessionId, msg);
  }
  onStateChange(cb: (s: any) => void) { return this.stateL.add(cb); }
  onMessage(type: string, cb: (m: any) => void) {
    let l = this.msgL.get(type);
    if (!l) { l = new Listeners(); this.msgL.set(type, l); }
    return l.add(cb);
  }
  onDrop(_cb: () => void) { /* the host can't lose connection to itself */ }
  onReconnect(_cb: () => void) {}
  onLeave(cb: (code: number) => void) { return this.leaveL.add(cb); }
  ping(cb: (ms: number) => void) { cb(0); }
  /** Players connected right now (not counting the host). */
  get connectedPeers() { let n = 0; for (const s of this.seats.values()) if (s.peer) n++; return n; }

  async leave(_consented = true) {
    if (this.closed) return;
    for (const p of this.peers.values()) if (p.link.open) p.link.send({ t: "bye" });
    this.closed = true;
    this.stopTimer();
    // give the goodbye a moment to go out before hanging up
    await new Promise((r) => setTimeout(r, 150));
    for (const p of [...this.peers.values()]) p.link.close();
    try { await this.sig?.leave(true); } catch { /* ignore */ }
    this.sig = null;
    this.stateL.clear();
    this.msgL.clear();
  }
}
