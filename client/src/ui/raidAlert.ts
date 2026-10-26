// C1: the loud, direct raid alert: a pulsing red screen edge and a compass arrow pointing home
// (the banners naming the raider and the stolen item come through the normal banner/feedback UI).

export class RaidAlert {
  private edge: HTMLDivElement;
  private arrow: HTMLDivElement;
  private t = 0;
  private x = 0;
  private z = 0;

  constructor() {
    // (one on the page at a time: a new game replaces the old one's)
    document.getElementById("raidEdge")?.remove();
    document.getElementById("raidArrow")?.remove();
    document.getElementById("raidCss")?.remove();
    const css = document.createElement("style");
    css.id = "raidCss";
    css.textContent = `
      #raidEdge { position: fixed; inset: 0; pointer-events: none; z-index: 40; opacity: 0; transition: opacity .25s;
        box-shadow: inset 0 0 90px 30px rgba(255, 30, 40, .85); animation: raidPulse .6s infinite alternate; }
      @keyframes raidPulse { from { filter: brightness(.7); } to { filter: brightness(1.3); } }
      #raidArrow { position: fixed; left: 50%; top: 22%; width: 0; height: 0; pointer-events: none; z-index: 41; display: none; }
      #raidArrow .a { position: absolute; left: -26px; top: -40px; width: 52px; height: 80px; transform-origin: 26px 40px; }
      #raidArrow .a::before { content: ""; position: absolute; left: 0; top: 0; border-left: 26px solid transparent; border-right: 26px solid transparent;
        border-bottom: 38px solid #ff2a36; filter: drop-shadow(0 0 3px #1b1420) drop-shadow(0 2px 0 #1b1420); }
      #raidArrow .a::after { content: ""; position: absolute; left: 16px; top: 36px; width: 20px; height: 30px; background: #ff2a36; box-shadow: 0 2px 0 #1b1420; }
      #raidArrow .lbl { position: absolute; left: -110px; width: 220px; white-space: nowrap; top: 48px; text-align: center; font: 900 15px system-ui, sans-serif;
        color: #fff; text-shadow: 0 2px 0 #1b1420, 0 0 6px #ff2a36; letter-spacing: 1px; }`;
    document.head.appendChild(css);
    this.edge = document.createElement("div");
    this.edge.id = "raidEdge";
    this.arrow = document.createElement("div");
    this.arrow.id = "raidArrow";
    this.arrow.innerHTML = `<div class="a"></div><div class="lbl">YOUR FORT</div>`;
    document.body.append(this.edge, this.arrow);
  }

  /** Flash the alert for `seconds`, the arrow pointing at (x, z). */
  start(x: number, z: number, seconds: number) {
    this.x = x; this.z = z; this.t = Math.max(this.t, seconds);
  }

  get active() { return this.t > 0; }

  /** Every frame: fade it out when time's up, keep the arrow pointing home. */
  update(dt: number, camX: number, camZ: number, camYaw: number) {
    this.t = Math.max(0, this.t - Math.min(dt, 0.25)); // (D1: a slow frame can't eat the whole alert before you see it)
    const on = this.t > 0;
    this.edge.style.opacity = on ? String(Math.min(1, this.t)) : "0";
    this.arrow.style.display = on ? "block" : "none";
    if (!on) return;
    const ang = Math.atan2(this.x - camX, this.z - camZ) - camYaw;
    (this.arrow.firstElementChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
    const d = Math.hypot(this.x - camX, this.z - camZ);
    (this.arrow.lastElementChild as HTMLElement).textContent = `YOUR FORT ${Math.round(d)} m`;
  }

  dispose() { this.edge.remove(); this.arrow.remove(); }
}
