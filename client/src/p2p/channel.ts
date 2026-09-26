// A direct browser-to-browser connection (WebRTC data channel) carrying JSON messages.
// Big messages (the full city snapshot a new player gets) are cut into chunks, because
// some browsers refuse data channel messages over ~64 KB.

/** Public STUN servers: they only tell each browser its internet address, no game data goes through them. */
function iceServers(): RTCIceServer[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const list: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  // Optional relay (TURN) for friends behind very strict networks: set these in the Cloudflare build settings.
  if (env.VITE_TURN_URL) list.push({ urls: env.VITE_TURN_URL.split(","), username: env.VITE_TURN_USER ?? "", credential: env.VITE_TURN_PASS ?? "" });
  return list;
}

export function newPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: iceServers() });
}

const CHUNK = 15000;

/** Signaling payloads passed through the matchmaking server. */
export type SignalData = { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit | null };

/**
 * One peer connection + its "game" data channel. `sendSignal` delivers offer/answer/ICE data to
 * the other side through the matchmaking server; feed what comes back into `signal()`.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  onOpen: () => void = () => {};
  onMessage: (m: any) => void = () => {};
  onClose: () => void = () => {};
  closed = false;
  lastHeard = performance.now();
  private buf = "";
  private pendingIce: RTCIceCandidateInit[] = [];
  private haveRemote = false;

  constructor(private sendSignal: (d: SignalData) => void, initiator: boolean) {
    this.pc = newPeerConnection();
    this.pc.onicecandidate = (e) => this.sendSignal({ ice: e.candidate ? e.candidate.toJSON() : null });
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "failed" || s === "closed") this.close();
    };
    if (initiator) {
      this.attach(this.pc.createDataChannel("game", { ordered: true }));
      void this.makeOffer();
    } else {
      this.pc.ondatachannel = (e) => this.attach(e.channel);
    }
  }

  private async makeOffer() {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendSignal({ sdp: this.pc.localDescription!.toJSON() });
    } catch (e) { console.warn("offer failed", e); this.close(); }
  }

  /** Handle offer / answer / ICE data from the other side. */
  async signal(d: SignalData) {
    if (this.closed || !d) return;
    try {
      if (d.sdp) {
        await this.pc.setRemoteDescription(d.sdp);
        this.haveRemote = true;
        for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
        if (d.sdp.type === "offer") {
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.sendSignal({ sdp: this.pc.localDescription!.toJSON() });
        }
      } else if (d.ice) {
        if (this.haveRemote) await this.pc.addIceCandidate(d.ice).catch(() => {});
        else this.pendingIce.push(d.ice);
      }
    } catch (e) { console.warn("signal failed", e); }
  }

  private attach(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => { this.lastHeard = performance.now(); this.onOpen(); };
    dc.onclose = () => this.close();
    dc.onmessage = (e) => {
      this.lastHeard = performance.now();
      const s = String(e.data);
      const c = s[0];
      if (c === "~") { this.buf += s.slice(1); return; }
      let text = s;
      if (c === "$") { text = this.buf + s.slice(1); this.buf = ""; }
      let m: any;
      try { m = JSON.parse(text); } catch { return; }
      this.onMessage(m);
    };
  }

  get open() { return !this.closed && this.dc?.readyState === "open"; }
  /** Bytes queued but not yet sent (a slow connection falls behind). */
  get backlog() { return this.dc?.bufferedAmount ?? 0; }

  /** Send a message (an object, or one already turned into JSON text). */
  send(m: unknown) {
    if (!this.open) return;
    const s = typeof m === "string" ? m : JSON.stringify(m);
    try {
      if (s.length <= CHUNK) { this.dc!.send(s); return; }
      for (let i = 0; i < s.length; i += CHUNK) {
        const last = i + CHUNK >= s.length;
        this.dc!.send((last ? "$" : "~") + s.slice(i, i + CHUNK));
      }
    } catch (e) { console.warn("send failed", e); this.close(); }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.pc.close(); } catch { /* ignore */ }
    this.onClose();
  }
}
