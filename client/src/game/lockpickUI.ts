// Phase 4 jail: the lock-picking minigame screen. Runs the SAME lock simulation as the server
// (shared/lockpick.ts) on the same seed, so what you see is exactly what the server checks.
// Each press is sent to the server with the lock-clock time it happened at.
import {
  newLockRun, lockPress, lockUpdate, pinPos, bindingPin, tensionLeft, LOCK,
  type LockRun, type LockResult,
} from "@bfb/shared";
import { sfx } from "../audio.ts";

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
  key(code: string) {
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
