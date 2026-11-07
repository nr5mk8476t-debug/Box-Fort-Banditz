// Phase 4 jail: the lock-picking minigame screen. Runs the SAME lock simulation as the server
// (shared/lockpick.ts) on the same seed, so what you see is exactly what the server checks.
// Each press is sent to the server with the lock-clock time it happened at.
import {
  newLockRun, lockPress, lockUpdate, pinPos, bindingPin, tensionLeft, LOCK,
  type LockRun, type LockResult,
} from "@bfb/shared";
import { sfx } from "../audio.ts";
import { PUB, pintLevel, pintSettled } from "@bfb/shared";

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
// R12.1: SPLIT THE G. R12.4 (Blake chose "visible G, fair & skilled"): the pint's in front of you with its G facing
// you the whole time. Hold the mouse (or SPACE) to drink: one smooth drink, easing in and then steady (no hidden
// surges; the World judges with the very same curve). Let go and the head settles: the line carries on a touch and
// stops, the same way every pint, so the skill is letting go just above the bar. The gold bar is drawn exactly as thick
// as a perfect split (1.5 mm either way); the result's marked on the glass where the line stopped.
const PW = 300, PH = 440;
export class PintUI {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private help: HTMLDivElement;
  rate = 0;
  holding = false;
  private swallowT = 0;
  private stung = false;
  private swallows = 0;
  /** seconds since you let go (the head settling) */
  private since = 0;
  hold = 0;
  /** waiting for the verdict (after you let go), then showing it */
  private sent = false;
  private verdict: { mm: number; grade: string; won: number } | null = null;
  private verdictT = 0;
  private t = 0;
  /** how far the glass is tipped up to your face (0 resting .. 1 tipped) */
  private tip = 0;
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
  get level() { return this.sent ? pintSettled(this.hold, this.rate, this.since) : pintLevel(this.hold, this.rate); }
  /** for tests: is the G showing? (R12.4: always) */
  get gShown() { return this.open; }
  /** the head's settled (the result can show) */
  get settled() { return this.sent && this.since > 0.6; }
  start(rate: number) {
    this.rate = rate; this.hold = 0; this.since = 0; this.stung = false; this.holding = false; this.sent = false; this.verdict = null; this.verdictT = 0; this.tip = 0;
    this.help.innerHTML = "<b>HOLD CLICK</b> (or <b>SPACE</b>) to drink. Let go just above the <b>G</b>'s bar: the head settles a touch after.";
    this.root.classList.remove("hidden"); document.body.classList.add("pint-on");
  }
  /** mouse / SPACE down or up */
  press(down: boolean) {
    if (!this.open || this.sent) return;
    if (down && !this.holding) { this.holding = true; this.swallowT = 0.42; this.swallows = 0; return; }
    if (!down && this.holding) this.release();
  }
  private release() {
    this.holding = false; this.sent = true; sfx.glassDown();
    this.onGulp?.(this.hold);
  }
  /** the World's verdict */
  result(mm: number, grade: string, won: number) { this.verdict = { mm, grade, won }; this.verdictT = 3.9; this.sent = true; this.holding = false; }
  private showVerdict() {
    const { mm, grade, won } = this.verdict!;
    if (!this.stung) { this.stung = true; sfx.pintResult(grade); if (grade !== "miss") sfx.cash(); if (grade === "perfect") sfx.cheer(1); }
    this.help.innerHTML = grade === "perfect" ? `<b>SPLIT IT!</b> ${mm.toFixed(1)} mm off. +$${won}` : grade === "close" ? `So close: ${mm.toFixed(1)} mm. Your $${won} back.` : `Missed by ${mm.toFixed(1)} mm.`; }
  close() { this.rate = 0; this.holding = false; this.root.classList.add("hidden"); document.body.classList.remove("pint-on"); }
  update(dt: number) {
    if (!this.open) return;
    this.t += dt;
    if (this.holding) {
      this.hold += dt;
      if ((this.swallowT += dt) >= 0.42) { this.swallowT -= 0.42; sfx.swallow(this.swallows++); }
      if (this.level <= 0.02) this.release();
    }
    else if (this.sent) { const was = this.settled; this.since += dt; if (!was && this.settled && this.verdict) this.showVerdict(); }
    // the glass up to your mouth while you drink; down again after; it turns round once the verdict's in
    const up = this.holding ? 1 : 0;
    this.tip += (up - this.tip) * Math.min(1, dt * (this.holding ? 4 : 5));
    if (this.verdict && this.settled) { if (this.verdictT === 3.9) this.showVerdict(); this.verdictT -= dt; if (this.verdictT <= 0) { this.close(); return; } }
    this.draw();
  }
  private draw() {
    const g = this.g, t = this.t, tip = this.tip;
    g.clearRect(0, 0, PW, PH);
    g.save();
    // lifted towards you while you drink (a small lean, so the line still reads against the G); tipsy: it sways
    const sway = this.wobble * (Math.sin(t * 1.7) * 0.07 + Math.sin(t * 3.1) * 0.03);
    g.translate(PW / 2 + Math.sin(t * 1.3) * 14 * this.wobble, PH - 22 - tip * 16);
    g.rotate(sway - tip * 0.1);
    const sc = 0.92 * (1 + tip * 0.04); g.scale(sc, sc);
    // the glass (a tulip pint): y up from its foot, 0..H
    const H = 360, top = 100, foot = 72, bulge = 112, mmPx = H / PUB.glassMm;
    const half = (u: number) => u < 0.72 ? foot + (bulge - foot) * Math.sin((u / 0.72) * Math.PI / 2) : bulge - (bulge - top * 0.95) * ((u - 0.72) / 0.28);
    const path = (u0: number, u1: number) => { g.beginPath(); const n = 24; for (let k = 0; k <= n; k++) { const u = u0 + ((u1 - u0) * k) / n; g.lineTo(half(u), -u * H); } for (let k = n; k >= 0; k--) { const u = u0 + ((u1 - u0) * k) / n; g.lineTo(-half(u), -u * H); } g.closePath(); };
    const lvl = this.level, settling = this.sent && !this.settled;
    // the stout (dark ruby-black), the cream head above the line (frothing while you drink, calming as it settles)
    path(0.03, lvl); const sg = g.createLinearGradient(-bulge, 0, bulge, 0); sg.addColorStop(0, "#1a0806"); sg.addColorStop(0.5, "#2a0e08"); sg.addColorStop(1, "#140604"); g.fillStyle = sg; g.fill();
    const froth = this.holding ? 0.006 * Math.sin(t * 30) : settling ? 0.003 * Math.sin(t * 24) * Math.exp(-this.since * 6) : 0;
    path(lvl, Math.min(0.99, lvl + 0.12 + froth)); g.fillStyle = "#f2e2bc"; g.fill();
    // the line itself: a crisp edge where the black meets the cream (what's judged)
    g.strokeStyle = "rgba(255,248,230,0.9)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-half(lvl) + 2, -lvl * H); g.lineTo(half(lvl) - 2, -lvl * H); g.stroke();
    if (this.holding) { g.fillStyle = "rgba(255,240,210,0.55)"; for (let k = 0; k < 7; k++) { const u = ((t * 0.9 + k * 0.137) % 1); g.beginPath(); g.arc(Math.sin(k * 3.7 + t * 2) * 60, -(0.05 + u * (lvl - 0.05)) * H, 3 + (k % 3), 0, 6.3); g.fill(); } }
    // the glass outline and its shine
    path(0, 1); g.strokeStyle = "rgba(230,240,255,0.9)"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-bulge + 18, -H * 0.9, 10, H * 0.75);
    // GUZZLE'S and the gold G; its bar is exactly the perfect band (1.5 mm either side of PUB.g); faint ticks at 5 mm
    const gy = -PUB.g * H, band = PUB.perfectMm * mmPx;
    g.fillStyle = "#e8c050"; g.font = "bold 20px Georgia, serif"; g.textAlign = "center"; g.fillText("GUZZLE'S", 0, -0.42 * H);
    g.strokeStyle = "#e8c050"; g.lineCap = "butt"; g.lineWidth = 6; g.beginPath(); g.arc(0, gy - 2, 30, 0.1 * Math.PI, 1.62 * Math.PI, false); g.stroke();
    g.fillStyle = "rgba(232,192,80,0.92)"; g.fillRect(2, gy - band, 34, band * 2);
    g.fillStyle = "rgba(255,225,74,0.75)";
    for (const sx of [-1, 1]) { const ex = sx * (half(PUB.g) + 3); g.fillRect(sx < 0 ? ex - 14 : ex, gy - band, 14, band * 2); g.fillRect(sx < 0 ? ex - 7 : ex, gy - PUB.closeMm * mmPx - 0.5, 7, 1); g.fillRect(sx < 0 ? ex - 7 : ex, gy + PUB.closeMm * mmPx - 0.5, 7, 1); }
    if (this.verdict && this.settled) {
      // the result on the glass: an arrow where the line stopped, and how far off
      const v = this.verdict, col = v.grade === "perfect" ? "#7dff9a" : v.grade === "close" ? "#ffe14a" : "#ff8a7a", ly = -lvl * H, ex = half(lvl) + 6;
      g.fillStyle = col; g.beginPath(); g.moveTo(ex, ly); g.lineTo(ex + 12, ly - 7); g.lineTo(ex + 12, ly + 7); g.closePath(); g.fill();
    }
    g.restore();
    if (this.verdict && this.settled) {
      const v = this.verdict, col = v.grade === "perfect" ? "#7dff9a" : v.grade === "close" ? "#ffe14a" : "#ff8a7a";
      g.fillStyle = col; g.font = "26px Bungee, sans-serif"; g.textAlign = "center";
      g.lineWidth = 6; g.strokeStyle = "#1b1420"; const txt = v.grade === "perfect" ? "SPLIT THE G!" : v.grade === "close" ? "NEARLY!" : "MISSED IT";
      g.strokeText(txt, PW / 2, 34); g.fillText(txt, PW / 2, 34);
      // how far off, and which way (the arrow on the glass shows where)
      const lab = v.mm < 0.05 ? "dead on the bar" : `${v.mm.toFixed(1)} mm ${this.level > PUB.g ? "above" : "below"} the bar`;
      g.font = "bold 16px sans-serif"; g.lineWidth = 4; g.strokeText(lab, PW / 2, 58); g.fillText(lab, PW / 2, 58);
    }
  }
}
