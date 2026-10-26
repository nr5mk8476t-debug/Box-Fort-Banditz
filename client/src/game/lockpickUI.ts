// Phase 4 jail: the lock-picking minigame screen. Runs the SAME lock simulation as the server
// (shared/lockpick.ts) on the same seed, so what you see is exactly what the server checks.
// Each press is sent to the server with the lock-clock time it happened at.
import {
  newLockRun, lockPress, lockUpdate, pinPos, bindingPin, tensionLeft, LOCK,
  type LockRun, type LockResult,
} from "@bfb/shared";
import { sfx } from "../audio.ts";
import { PUB, pintLevel, pintMissMm, CEILI, CEILI_8, ceiliChart, ceiliJudge, type CeiliNote } from "@bfb/shared";

const W = 640, H = 380;

export class LockpickUI {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private timerEl: HTMLDivElement;
  run: LockRun | null = null;
  seed = 0;
  sel = 0;
  // The lock clock (seconds since you were locked up). It advances with the same capped frame
  // step the game uses, and never runs ahead of the synced jail timer by more than a hair, so a
  // slow machine or a laggy connection never makes the server see a press "from the future".
  private clock = 0;
  private lastWall = 0;
  private msg = ""; private msgT = 0; private msgColor = "#fff";
  private shake = 0;
  private lastTick = 0;
  /** press to send to the server: (pin, lockTime) */
  onPress: ((pin: number, t: number) => void) | null = null;
  /** last results, for tests */
  history: LockResult[] = [];
  /** the pick cursor (canvas pixels): the mouse moves it while you're locked up; the camera stays put */
  cx = W / 2; cy = 200;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "jail";
    this.root.className = "jail hidden";
    this.root.innerHTML = `
      <div class="jail-title">BUSTED! <span>You're in the Trashington PD lock-up</span></div>
      <div class="jail-timer" id="jail-timer"></div>
      <canvas id="lockpick" width="${W}" height="${H}"></canvas>
      <div class="jail-help"><b>MOUSE</b> moves your pick: <b>CLICK</b> a pin to try it (or <b>A / D</b>). Find the <b>STUCK</b> one, then <b>CLICK</b> / <b>SPACE</b> while its top is in the green. Slips make noise.</div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.g = this.canvas.getContext("2d")!;
    this.timerEl = this.root.querySelector("#jail-timer")!;
    // without mouse capture (drag-look fallback, touchpads), the canvas takes real clicks too
    const toCanvas = (e: PointerEvent) => { const r = this.canvas.getBoundingClientRect(); this.cx = ((e.clientX - r.left) / r.width) * W; this.cy = ((e.clientY - r.top) / r.height) * H; };
    this.canvas.addEventListener("pointermove", toCanvas);
    this.canvas.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); toCanvas(e); this.key("Mouse0"); });
  }

  /** Mouse movement while captured (from the input system). */
  mouse(dx: number, dy: number) {
    this.cx = Math.max(20, Math.min(W - 20, this.cx + dx));
    this.cy = Math.max(20, Math.min(H - 20, this.cy + dy));
  }

  /** Channel geometry (shared by drawing and clicking). */
  private layout(n: number) {
    const chW = 52, gap = (W - 160 - n * chW) / Math.max(1, n - 1);
    return { chW, gap, top: 50, bot: 230, x: (i: number) => 80 + i * (chW + gap) };
  }

  /** Which pin the pick cursor is over (-1 = none). */
  hoverPin(): number {
    const r = this.run;
    if (!r) return -1;
    const L = this.layout(r.def.pins.length);
    for (let i = 0; i < r.def.pins.length; i++) {
      const x = L.x(i);
      if (this.cx >= x - 12 && this.cx <= x + L.chW + 12 && this.cy >= L.top - 25 && this.cy <= L.bot + 45) return i;
    }
    return -1;
  }

  get open() { return !!this.run; }

  setHeadline(title: string, sub: string) {
    const el = this.root.querySelector(".jail-title")!;
    el.innerHTML = "";
    el.append(title);
    const span = document.createElement("span"); span.textContent = sub; el.append(span);
  }

  /** Seconds on the lock clock (smooth between frames). */
  now() { return this.clock + Math.min(0.2, (performance.now() - this.lastWall) / 1000); }

  start(seed: number, lockT: number) {
    this.seed = seed;
    this.run = newLockRun(seed);
    this.sel = 0; this.history = []; this.msg = ""; this.shake = 0;
    this.cx = W / 2; this.cy = 200;
    // the lock clock started when you were busted; we find out a little later than the server
    this.clock = Math.max(0, lockT);
    this.lastWall = performance.now();
    this.root.classList.remove("hidden");
  }

  stop() {
    this.run = null;
    this.root.classList.add("hidden");
  }

  /** A/D/arrows/wheel choose a pin, SPACE/click sets it. */
  /** R6: step away from the lock (the holding cell: back to walking about) */
  onCancel: (() => void) | null = null;
  key(code: string) {
    if ((code === "Escape" || code === "KeyS") && this.onCancel) { this.onCancel(); return; }
    const r = this.run;
    if (!r || r.solved) return;
    const n = r.def.pins.length;
    if (code === "KeyA" || code === "ArrowLeft" || code === "WheelUp") this.select((this.sel + n - 1) % n);
    else if (code === "KeyD" || code === "ArrowRight" || code === "WheelDown") this.select((this.sel + 1) % n);
    else if (/^Digit[1-6]$/.test(code)) { const i = Number(code.slice(5)) - 1; if (i < n) this.select(i); }
    else if (code === "Mouse0") {
      // click a different pin = move the pick onto it; click the pin you're on (or empty space) = try to set it
      const h = this.hoverPin();
      if (h >= 0 && h !== this.sel) this.select(h); else this.press();
    } else if (code === "Space") this.press(); // (not W: trying to walk shouldn't make noise)
  }

  select(i: number) {
    this.sel = i;
    const r = this.run;
    if (r && bindingPin(r) === i && this.now() >= r.lockUntil) sfx.pickTick(); // that one's stuck: you feel it
  }

  press() {
    const r = this.run;
    if (!r) return;
    const t = this.now();
    const res = lockPress(r, this.sel, t);
    if (res === "ignored") return;
    this.history.push(res);
    this.onPress?.(this.sel, t);
    switch (res) {
      case "set": sfx.pickSet(); this.say("CLICK!", "#7dff9a"); break;
      case "solved": sfx.unlock(); this.say("IT OPENED! GO GO GO!", "#7dff9a"); break;
      case "slip": sfx.pickSlip(); this.say("MISSED THE GREEN! a pin dropped", "#ffb14a"); this.shake = 0.25; break;
      case "wrong": sfx.pickSlip(); this.say("THAT PIN'S LOOSE! find the STUCK one", "#ffb14a"); this.shake = 0.25; break;
      case "guard": sfx.guard(); this.say("GUARD: \"HEY! KNOCK IT OFF!\"", "#ff5a5a"); this.shake = 0.5; break;
      case "locked": this.say("Wait for the guard to walk off...", "#ff5a5a"); break;
    }
  }

  private say(m: string, c: string) { this.msg = m; this.msgColor = c; this.msgT = 1.6; }

  update(dt: number, jailT: number, lockT: number) {
    const r = this.run;
    if (!r) return;
    this.timerEl.textContent = jailT > 0 ? `Released in ${Math.ceil(jailT)} s  ·  or pick the lock and bust out the back` : "";
    this.timerEl.classList.toggle("urgent", jailT <= 8);
    this.clock += Math.min(dt, 0.25);
    this.lastWall = performance.now();
    // never run ahead of the server's lock clock (synced; a little behind because of the network)
    if (this.clock > lockT + 0.35) this.clock = lockT + 0.35;
    // (falling behind is fine: the server replays OUR press times, so pins never jump around here)
    const t = this.now();
    if (lockUpdate(r, t) === "tension") { sfx.pickDrop(); this.say("TENSION GONE! all pins dropped", "#ff5a5a"); this.shake = 0.35; }
    this.msgT -= dt; this.shake = Math.max(0, this.shake - dt);
    // faint ticking while you hold a pin
    if (t - this.lastTick > 0.18) { this.lastTick = t; if (bindingPin(r) === this.sel && !r.solved && t >= r.lockUntil) sfx.pickTick(); }
    this.draw(t);
  }

  private draw(t: number) {
    const g = this.g, r = this.run!;
    const n = r.def.pins.length;
    g.clearRect(0, 0, W, H);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    g.save();
    g.translate(sx, 0);
    // lock body
    g.fillStyle = "#3a3f55"; roundRect(g, 40, 30, W - 80, 250, 22); g.fill();
    g.strokeStyle = "#1b1420"; g.lineWidth = 6; g.stroke();
    g.fillStyle = "#c9a227"; roundRect(g, 60, 190, W - 120, 70, 14); g.fill(); // the plug
    g.stroke();
    const { chW, gap, top, bot } = this.layout(n);
    const travel = bot - top - 30;
    const hover = this.hoverPin();
    const yOf = (h: number) => bot - 20 - h * travel;
    const bound = bindingPin(r);
    const locked = t < r.lockUntil;
    for (let i = 0; i < n; i++) {
      const p = r.def.pins[i];
      const x = 80 + i * (chW + gap);
      const isSet = r.def.order.indexOf(i) < r.set;
      const selected = i === this.sel;
      // channel
      g.fillStyle = "#1b1f2e"; g.fillRect(x, top, chW, bot - top);
      // shear line band (green)
      g.fillStyle = isSet ? "rgba(125,255,154,0.55)" : "rgba(125,255,154,0.28)";
      g.fillRect(x, yOf(p.hi), chW, yOf(p.lo) - yOf(p.hi));
      g.strokeStyle = "#7dff9a"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, yOf(p.hi)); g.lineTo(x + chW, yOf(p.hi)); g.moveTo(x, yOf(p.lo)); g.lineTo(x + chW, yOf(p.lo)); g.stroke();
      // the pin
      let h = isSet ? (p.lo + p.hi) / 2 : selected && !locked ? pinPos(p, t) : 0.04;
      let jx = 0;
      if (selected && !isSet && i === bound && !locked) jx = (Math.random() - 0.5) * 3; // binding: trembles
      if (selected && !isSet && i !== bound && !locked) h = Math.min(1, h + Math.sin(t * 40) * 0.01); // loose: rattles
      const py = yOf(h);
      g.fillStyle = isSet ? "#7dff9a" : "#e8c35a";
      roundRect(g, x + 8 + jx, py, chW - 16, bot - py - 4, 6); g.fill();
      g.strokeStyle = "#1b1420"; g.lineWidth = 3; g.stroke();
      g.fillStyle = "#b08a2a"; g.fillRect(x + 8 + jx, py, chW - 16, 8); // pin top
      // selection
      if (selected) { g.strokeStyle = "#ffe14a"; g.lineWidth = 4; g.strokeRect(x - 3, top - 3, chW + 6, bot - top + 6); }
      else if (i === hover) { g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 3; g.strokeRect(x - 3, top - 3, chW + 6, bot - top + 6); }
      // what you feel through the pick
      if (selected && !isSet && !locked) {
        g.font = "bold 13px sans-serif"; g.textAlign = "center";
        g.fillStyle = i === bound ? "#ffe14a" : "#8e96a8";
        g.font = "bold 15px sans-serif";
        g.fillText(i === bound ? "STUCK!" : "loose", x + chW / 2, bot + 44);
      }
      g.fillStyle = "#f3e2b8"; g.font = "bold 14px sans-serif"; g.textAlign = "center";
      g.fillText(String(i + 1), x + chW / 2, top - 8);
    }
    // the pick, coming in from the left under the selected pin
    const px = 80 + this.sel * (chW + gap) + chW / 2;
    g.strokeStyle = "#cfd6e4"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.moveTo(10, 250); g.lineTo(px - 10, 250); g.lineTo(px, 236); g.stroke();
    g.restore();

    // tension bar
    const left = tensionLeft(r, t), frac = Number.isFinite(left) ? Math.max(0, left / r.def.tension) : 1;
    g.fillStyle = "#1b1420"; roundRect(g, 60, 296, W - 120, 18, 9); g.fill();
    g.fillStyle = !Number.isFinite(left) ? "#5a6070" : frac < 0.3 ? "#ff5a5a" : "#ffcf3a";
    roundRect(g, 62, 298, Math.max(0, (W - 124) * frac), 14, 7); g.fill();
    g.fillStyle = "#f3e2b8"; g.font = "bold 13px sans-serif"; g.textAlign = "left";
    g.fillText(Number.isFinite(left) ? `TENSION ${left.toFixed(1)} s` : "TENSION (starts at the first pin)", 64, 332);
    // noise pips
    g.textAlign = "right";
    g.fillText("NOISE", W - 130, 332);
    for (let i = 0; i < LOCK.slipsToGuard; i++) {
      g.beginPath(); g.arc(W - 110 + i * 22, 327, 7, 0, Math.PI * 2);
      g.fillStyle = i < r.noise ? "#ff5a5a" : "#3a3f55"; g.fill();
      g.strokeStyle = "#1b1420"; g.lineWidth = 2; g.stroke();
    }
    // pins set
    g.textAlign = "center"; g.fillStyle = r.set > 0 ? "#7dff9a" : "#f3e2b8";
    g.fillText(`PINS ${r.set} / ${n}`, W / 2, 332);
    // guard lockout
    if (t < r.lockUntil) {
      g.fillStyle = "rgba(20,10,20,0.72)"; g.fillRect(40, 30, W - 80, 250);
      g.fillStyle = "#ff5a5a"; g.font = "bold 30px sans-serif";
      g.fillText("THE GUARD IS WATCHING", W / 2, 140);
      g.fillStyle = "#f3e2b8"; g.font = "bold 18px sans-serif";
      g.fillText(`look innocent for ${(r.lockUntil - t).toFixed(1)} s`, W / 2, 175);
    }
    if (r.solved) {
      g.fillStyle = "rgba(20,60,30,0.75)"; g.fillRect(40, 30, W - 80, 250);
      g.fillStyle = "#7dff9a"; g.font = "bold 34px sans-serif"; g.fillText("CLICK! YOU'RE OUT!", W / 2, 160);
    }
    // the pick cursor
    g.save();
    g.translate(this.cx, this.cy);
    g.rotate(-0.6);
    g.fillStyle = "#cfd6e4"; g.strokeStyle = "#1b1420"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 4); g.lineTo(3, 26); g.lineTo(-3, 26); g.lineTo(-5, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#d6264a"; g.fillRect(-5, 22, 10, 14); g.strokeRect(-5, 22, 10, 14);
    g.restore();
    if (this.msgT > 0 && !r.solved) {
      g.globalAlpha = Math.min(1, this.msgT * 2);
      g.fillStyle = this.msgColor; g.font = "bold 22px sans-serif"; g.textAlign = "center";
      g.fillText(this.msg, W / 2, 364);
      g.globalAlpha = 1;
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------------------------------------------------------------------------------------------------------------
// R12.1: SPLIT THE G. A close-up of your pint of GUZZLE'S: hold the mouse (or SPACE) to gulp and the line (where
// the black meets the cream) drops, faster the longer you hold; let go when it's on the G's bar. The line is drawn
// from the same sum the World checks (pintLevel), so what you see is what you get. Tipsy, the glass sways.
const PW = 300, PH = 440;
export class PintUI {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private help: HTMLDivElement;
  rate = 0;
  holding = false;
  hold = 0;
  /** waiting for the verdict (after you let go), then showing it */
  private sent = false;
  private verdict: { mm: number; grade: string; won: number } | null = null;
  private verdictT = 0;
  private t = 0;
  /** how tipsy (0..1): the glass sways */
  wobble = 0;
  /** the gulp's over: hold seconds */
  onGulp: ((hold: number) => void) | null = null;
  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "pint";
    this.root.className = "pint hidden";
    this.root.innerHTML = `<div class="pint-title">SPLIT THE G</div><canvas width="${PW}" height="${PH}"></canvas><div class="pint-help"></div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.g = this.canvas.getContext("2d")!;
    this.help = this.root.querySelector(".pint-help")!;
  }
  get open() { return this.rate > 0; }
  /** where the line is now (0..1 of the glass) */
  get level() { return pintLevel(this.hold, this.rate); }
  start(rate: number) {
    this.rate = rate; this.hold = 0; this.holding = false; this.sent = false; this.verdict = null; this.verdictT = 0;
    this.help.innerHTML = "<b>HOLD CLICK</b> (or <b>SPACE</b>) to gulp. Let go when the line's on the <b>G</b>'s bar.";
    this.root.classList.remove("hidden");
  }
  /** mouse / SPACE down or up */
  press(down: boolean) {
    if (!this.open || this.sent) return;
    if (down && !this.holding) { this.holding = true; sfx.gulp(true); return; }
    if (!down && this.holding) this.release();
  }
  private release() {
    this.holding = false; this.sent = true; sfx.gulp(false);
    this.onGulp?.(this.hold);
  }
  /** the World's verdict */
  result(mm: number, grade: string, won: number) { this.verdict = { mm, grade, won }; this.verdictT = 2.6; this.sent = true; this.holding = false;
    this.help.innerHTML = grade === "perfect" ? `<b>SPLIT IT!</b> ${mm.toFixed(1)} mm off. +$${won}` : grade === "close" ? `So close: ${mm.toFixed(1)} mm. Your $${won} back.` : `Missed by ${mm.toFixed(1)} mm.`; }
  close() { this.rate = 0; this.holding = false; this.root.classList.add("hidden"); }
  update(dt: number) {
    if (!this.open) return;
    this.t += dt;
    if (this.holding) { this.hold += dt; if (this.level <= 0.02) this.release(); }
    if (this.verdict) { this.verdictT -= dt; if (this.verdictT <= 0) { this.close(); return; } }
    this.draw();
  }
  private draw() {
    const g = this.g, t = this.t;
    g.clearRect(0, 0, PW, PH);
    g.save();
    const sway = this.wobble * (Math.sin(t * 1.7) * 0.07 + Math.sin(t * 3.1) * 0.03);
    g.translate(PW / 2 + Math.sin(t * 1.3) * 14 * this.wobble, PH - 30); g.rotate(sway);
    // the glass (a tulip pint): y up from its foot, 0..H
    const H = 360, top = 100, foot = 72, bulge = 112;
    const half = (u: number) => u < 0.72 ? foot + (bulge - foot) * Math.sin((u / 0.72) * Math.PI / 2) : bulge - (bulge - top * 0.95) * ((u - 0.72) / 0.28);
    const path = (u0: number, u1: number) => { g.beginPath(); const n = 24; for (let k = 0; k <= n; k++) { const u = u0 + ((u1 - u0) * k) / n; g.lineTo(half(u), -u * H); } for (let k = n; k >= 0; k--) { const u = u0 + ((u1 - u0) * k) / n; g.lineTo(-half(u), -u * H); } g.closePath(); };
    const lvl = this.level;
    // the stout (dark ruby-black), the cream head above the line
    path(0.03, lvl); const sg = g.createLinearGradient(-bulge, 0, bulge, 0); sg.addColorStop(0, "#1a0806"); sg.addColorStop(0.5, "#2a0e08"); sg.addColorStop(1, "#140604"); g.fillStyle = sg; g.fill();
    path(lvl, Math.min(0.99, lvl + 0.12 + (this.holding ? 0.01 * Math.sin(t * 30) : 0))); g.fillStyle = "#f2e2bc"; g.fill();
    // the glass outline and its shine
    path(0, 1); g.strokeStyle = "rgba(230,240,255,0.9)"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-bulge + 18, -H * 0.9, 10, H * 0.75);
    // GUZZLE'S and the gold G (its bar at PUB.g)
    const gy = -PUB.g * H;
    g.fillStyle = "#e8c050"; g.font = "bold 20px Georgia, serif"; g.textAlign = "center"; g.fillText("GUZZLE'S", 0, -0.42 * H);
    g.strokeStyle = "#e8c050"; g.lineWidth = 9; g.lineCap = "round";
    g.beginPath(); g.arc(0, gy, 30, 0, 1.68 * Math.PI, false); g.stroke(); // (a G: open at the top right)
    g.beginPath(); g.moveTo(2, gy); g.lineTo(30, gy); g.stroke(); // (the G's bar: this is the line to hit)
    // the target marks either side
    g.strokeStyle = "rgba(255,225,74,0.85)"; g.lineWidth = 2; g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(-bulge - 14, gy); g.lineTo(-bulge + 4, gy); g.moveTo(bulge - 4, gy); g.lineTo(bulge + 14, gy); g.stroke(); g.setLineDash([]);
    g.restore();
    if (this.verdict) {
      const v = this.verdict, col = v.grade === "perfect" ? "#7dff9a" : v.grade === "close" ? "#ffe14a" : "#ff8a7a";
      g.fillStyle = col; g.font = "26px Bungee, sans-serif"; g.textAlign = "center";
      g.lineWidth = 6; g.strokeStyle = "#1b1420"; const txt = v.grade === "perfect" ? "SPLIT THE G!" : v.grade === "close" ? "NEARLY!" : "MISSED IT";
      g.strokeText(txt, PW / 2, 40); g.fillText(txt, PW / 2, 40);
    }
    void pintMissMm;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// R12.2: THE CÉILÍ. Four lanes; the steps fall from the top and you hit them as they reach the shamrocks at the
// bottom: ← ↓ ↑ → (or D F J K). The steps are the very chart the World judges (ceiliChart, off the reel's own
// notes), on the city clock. Tough: ±70 ms for a perfect, ±140 ms for a good; five misses in a row and you trip.
// What's shown here is predicted; the World's word (ceiliDone / ceiliTrip) is final.
const CW = 300, CHt = 420, LEAD = 1.4, HITY = CHt - 64;
const LANE_COL = ["#7dff9a", "#ffe14a", "#ff9a5a", "#7ad8ff"], ARROW = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];
export class CeiliUI {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private help: HTMLDivElement;
  /** the dance's first bar (city clock, mod 600); <0: not dancing */
  t0 = -1;
  private notes: CeiliNote[] = [];
  private done = new Set<number>();
  private missed = new Set<number>();
  score = 0; combo = 0; best = 0; misses = 0; hits = 0;
  private flash: { txt: string; col: string; t: number } | null = null;
  private laneT = [0, 0, 0, 0];
  private verdict: { txt: string; sub: string; col: string } | null = null;
  private verdictT = 0;
  private t = 0;
  wobble = 0;
  /** for tests: step every note bang on time */
  auto = false;
  /** a step: [lane, city clock mod 600] for the World */
  onStep: ((lane: number, t600: number) => void) | null = null;
  constructor(parent: HTMLElement, private clock: () => number) {
    this.root = document.createElement("div");
    this.root.id = "ceili";
    this.root.className = "pint ceili hidden";
    this.root.innerHTML = `<div class="pint-title">THE CÉILÍ</div><canvas width="${CW}" height="${CHt}"></canvas><div class="pint-help"></div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.g = this.canvas.getContext("2d")!;
    this.help = this.root.querySelector(".pint-help")!;
  }
  get open() { return this.t0 >= 0 || this.verdictT > 0; }
  get dancing() { return this.t0 >= 0 && !this.verdict; }
  /** song time now, relative to the first bar (handles the clock going round 600) */
  private rel(): number { let r = (((this.clock() - this.t0) % 600) + 600) % 600; if (r > 300) r -= 600; return r; }
  start(t0: number) {
    this.t0 = t0; this.notes = ceiliChart(t0).map((n) => ({ ...n, t: n.t - t0 })); // (times from the first bar)
    this.done.clear(); this.missed.clear(); this.score = 0; this.combo = 0; this.best = 0; this.misses = 0; this.hits = 0;
    this.verdict = null; this.verdictT = 0; this.flash = null;
    this.help.innerHTML = ""; // (the prompt says the keys)
    this.root.classList.remove("hidden");
  }
  /** when the last frame was (the clock only moves on frames; a key press lands between them) */
  private frameAt = 0;
  /** a key: lane 0..3 (`at`: for tests, exactly when, from the first bar) */
  step(lane: number, at?: number) {
    if (!this.dancing) return;
    const r = at ?? this.rel() + Math.min(0.25, Math.max(0, (performance.now() - this.frameAt) / 1000));
    this.laneT[lane] = 0.12;
    this.onStep?.(lane, ((((this.t0 + r) % 600) + 600) % 600));
    const j = ceiliJudge(this.notes, this.done, lane, r);
    if (j) {
      this.done.add(j.note); this.hits++; this.score += j.grade === "perfect" ? 2 : 1; this.combo++; this.best = Math.max(this.best, this.combo); this.misses = 0;
      this.flash = j.grade === "perfect" ? { txt: "PERFECT", col: "#7dff9a", t: 0.5 } : { txt: "GOOD", col: "#ffe14a", t: 0.5 };
      sfx.ceiliStep(j.grade === "perfect");
    } else { this.miss(); sfx.ceiliMiss(); }
  }
  private miss() { this.combo = 0; this.misses++; this.flash = { txt: "MISS", col: "#ff8a7a", t: 0.5 }; }
  /** the World's verdict */
  result(grade: string, score: number, max: number, cash: number, aura: number, quit: boolean) {
    const pct = Math.round((score / Math.max(1, max)) * 100);
    this.verdict = quit ? { txt: "YOU STOPPED", sub: "Off the floor.", col: "#f3e2b8" }
      : grade === "great" ? { txt: "SHOW-STOPPER!", sub: `${pct}%  +$${cash}${aura ? "  +1 aura" : ""}`, col: "#7dff9a" }
      : grade === "ok" ? { txt: "NOT BAD!", sub: `${pct}%  +$${cash}${aura ? "  +1 aura" : ""}`, col: "#ffe14a" }
      : { txt: "TWO LEFT FEET", sub: `${pct}%: nothing for that`, col: "#ff8a7a" };
    this.verdictT = quit ? 1.4 : 3.2; this.t0 = -1;
  }
  trip() { this.verdict = { txt: "OVER YOU GO!", sub: "Five in a row. Up you get.", col: "#ff8a7a" }; this.verdictT = 2.6; this.t0 = -1; sfx.ceiliTrip(); }
  close() { this.t0 = -1; this.verdict = null; this.verdictT = 0; this.root.classList.add("hidden"); }
  update(dt: number) {
    if (!this.open) return;
    this.t += dt; this.frameAt = performance.now();
    for (let i = 0; i < 4; i++) this.laneT[i] = Math.max(0, this.laneT[i] - dt);
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    if (this.verdict) { this.verdictT -= dt; if (this.verdictT <= 0) { this.close(); return; } }
    else if (this.t0 >= 0) {
      // (predicted misses: a step that's gone past without you)
      const r = this.rel();
      if (this.auto) for (const n of this.notes) { if (n.t > r) break; if (!this.done.has(n.i) && !this.missed.has(n.i)) this.step(n.lane, n.t); }
      for (const n of this.notes) { if (n.t > r - CEILI.good) break; if (!this.done.has(n.i) && !this.missed.has(n.i)) { this.missed.add(n.i); this.miss(); } }
    }
    this.draw();
  }
  private draw() {
    const g = this.g, t = this.t;
    g.clearRect(0, 0, CW, CHt);
    const r = this.t0 >= 0 ? this.rel() : 1e9, lw = CW / 4;
    const sway = this.wobble * Math.sin(t * 1.6) * 16;
    g.save(); g.translate(sway, 0);
    // the lanes, the shamrock receptors
    for (let l = 0; l < 4; l++) {
      const cx = lw * (l + 0.5);
      g.fillStyle = this.laneT[l] > 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)"; g.fillRect(l * lw + 6, 0, lw - 12, CHt);
      this.shamrock(cx, HITY, 24 + this.laneT[l] * 60, LANE_COL[l], 0.5 + this.laneT[l] * 4);
    }
    // the steps falling
    if (!this.verdict) for (const n of this.notes) {
      const dtn = n.t - r;
      if (dtn > LEAD) break;
      if (dtn < -0.3 || this.done.has(n.i)) continue;
      const y = HITY - (dtn / LEAD) * (HITY - 20) + (this.wobble * Math.sin(t * 4 + n.i) * 6);
      this.arrow(lw * (n.lane + 0.5), y, ARROW[n.lane], this.missed.has(n.i) ? "#6b5a5a" : LANE_COL[n.lane]);
    }
    g.restore();
    g.textAlign = "center";
    // the count-in ("5, 6, 7, 8!")
    if (!this.verdict && r < 0) {
      const beat = Math.floor(-r / (CEILI_8 * 2));
      if (beat < 4) this.big(["8!", "7", "6", "5"][beat], CHt / 2 - 40, "#ffe14a", 48);
    }
    if (this.flash && !this.verdict) this.big(this.flash.txt, HITY - 90, this.flash.col, 28);
    if (!this.verdict && this.t0 >= 0) {
      g.font = "16px Bungee, sans-serif"; g.fillStyle = "#f3e2b8"; g.textAlign = "left";
      g.fillText(`SCORE ${this.score}`, 10, 26); g.textAlign = "right"; g.fillText(`COMBO ${this.combo}`, CW - 10, 26);
      g.textAlign = "center"; g.fillStyle = this.misses >= 3 ? "#ff8a7a" : "rgba(243,226,184,0.7)";
      g.fillText("●".repeat(this.misses) + "○".repeat(Math.max(0, CEILI.trip - this.misses)), CW / 2, CHt - 20);
    }
    if (this.verdict) { this.big(this.verdict.txt, CHt / 2 - 30, this.verdict.col, 30); g.font = "700 18px Nunito, sans-serif"; g.fillStyle = "#f3e2b8"; g.fillText(this.verdict.sub, CW / 2, CHt / 2 + 10); }
  }
  private big(txt: string, y: number, col: string, size: number) {
    const g = this.g; g.font = `${size}px Bungee, sans-serif`; g.textAlign = "center"; g.lineWidth = 6; g.strokeStyle = "#1b1420";
    g.strokeText(txt, CW / 2, y); g.fillStyle = col; g.fillText(txt, CW / 2, y);
  }
  private shamrock(x: number, y: number, s: number, col: string, a: number) {
    const g = this.g; g.save(); g.translate(x, y); g.globalAlpha = Math.min(1, a); g.strokeStyle = col; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { const an = -Math.PI / 2 + (k * 2 * Math.PI) / 3; g.beginPath(); g.arc(Math.cos(an) * s * 0.42, Math.sin(an) * s * 0.42, s * 0.36, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(0, s * 0.2); g.lineTo(s * 0.15, s * 0.8); g.stroke(); g.restore();
  }
  private arrow(x: number, y: number, rot: number, col: string) {
    const g = this.g; g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.moveTo(22, 0); g.lineTo(0, -20); g.lineTo(0, -9); g.lineTo(-20, -9); g.lineTo(-20, 9); g.lineTo(0, 9); g.lineTo(0, 20); g.closePath();
    g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = "#1b1420"; g.stroke(); g.restore();
  }
}
