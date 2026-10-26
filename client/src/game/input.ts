// Keyboard + mouse for first-person play. Uses physical key positions (e.code),
// so WASD works on AZERTY/QWERTZ keyboards too.
import { settings } from "../settings.ts";

export type LootAction = "grab" | "grabEnd" | "drop" | "cycleNext" | "cyclePrev" | "select0" | "select1" | "select2" | "select3" | "special" | "chargeStart" | "chargeEnd" | "robStart" | "robEnd" | "dance";

export interface Axes { mx: number; mz: number; sprint: boolean; jump: boolean; crouch: boolean; dodge: boolean; }

// Crouch is C (NOT Ctrl): browsers reserve Ctrl+W to close the tab and games can't block it.
export class FpInput {
  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement;
  enabled = false;
  /** Fallback when the browser/page refuses pointer lock: hold left mouse + drag to look. */
  dragLook = false;
  /** Test hook (only used by automated tests with ?test=1): forces movement axes. */
  override: Axes | null = null;
  /**
   * Loot controls (5A.1): E grab, G drop, LEFT mouse = punch (fists out) or hold to throw what's in your hands,
   * F = throw, mouse WHEEL = next/previous item, keys 1-3 = pockets, 4 = fists. RIGHT mouse is reserved
   * for special items later (it no longer cycles).
   */
  /** src says whether a charge came from the mouse (empty hands = punch) or the F key (always throws). */
  onAction: ((a: LootAction, src?: "mouse" | "key") => void) | null = null;
  private charging: "mouse" | "key" | null = null;
  /**
   * Phase 4 jail: while frozen you can't move or act; keys and clicks go to `jailKeys` instead
   * (A/D or arrows choose a pin, SPACE or click sets it). Mouse look still works.
   */
  frozen = false;
  jailKeys: ((code: string) => void) | null = null;
  /** while frozen the mouse moves the lock-pick cursor instead of the camera */
  jailMouse: ((dx: number, dy: number) => void) | null = null;
  /** R12.1: splitting the G: while a pint's up, the left mouse button / SPACE are the gulp (held down = gulping) */
  gulp: ((down: boolean) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("pointermove", this.onMouseMove);
    // pointer events (not mouse events): Babylon cancels the pointer press on the canvas,
    // which makes browsers skip the older mousedown/mouseup events entirely
    canvas.addEventListener("pointerdown", this.onMouseDown);
    window.addEventListener("pointerup", this.onMouseUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", this.onWheel, { passive: true });
  }

  private onMouseDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (this.frozen) { if (e.button === 0) this.jailKeys?.("Mouse0"); return; }
    if (this.gulp && e.button === 0) { this.gulp(true); return; }
    if (e.button === 0 && this.locked && !this.charging) { this.charging = "mouse"; this.onAction?.("chargeStart", "mouse"); }
    if (e.button === 2) this.onAction?.("special"); // (reserved: does nothing yet)
  };
  private onMouseUp = (e: PointerEvent) => {
    if (this.gulp && e.button === 0) { this.gulp(false); return; }
    if (e.button === 0 && this.charging === "mouse") { this.charging = null; if (this.enabled) this.onAction?.("chargeEnd", "mouse"); }
  };
  private wheelAcc = 0;
  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    if (this.frozen) { this.jailKeys?.(e.deltaY > 0 ? "WheelDown" : "WheelUp"); return; }
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) >= 60) { const down = this.wheelAcc > 0; this.wheelAcc = 0; this.onAction?.(down ? "cycleNext" : "cyclePrev"); }
  };

  /** Freeze / unfreeze (jail). Drops held keys and any throw charge so nothing sticks. */
  setFrozen(on: boolean) {
    if (this.frozen === on) return;
    this.frozen = on;
    this.keys.clear();
    this.charging = null;
  }

  /** Cancel an in-progress throw charge (e.g. the item left our hands). */
  cancelCharge() { this.charging = null; }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("pointermove", this.onMouseMove);
  }

  /** Test-only: behave as if the mouse were captured (headless Chrome throttles frames under pointer lock). */
  assumeLocked = false;

  get locked(): boolean {
    return this.assumeLocked || document.pointerLockElement === this.canvas;
  }

  /** Resolves false if the browser refused to capture the mouse. */
  requestLock(): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => { if (!done) { done = true; cleanup(); resolve(v); } };
      const onChange = () => finish(this.locked);
      const onError = () => finish(false);
      const cleanup = () => {
        document.removeEventListener("pointerlockchange", onChange);
        document.removeEventListener("pointerlockerror", onError);
      };
      document.addEventListener("pointerlockchange", onChange);
      document.addEventListener("pointerlockerror", onError);
      setTimeout(() => finish(this.locked), 1500);
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === "function") p.catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (this.frozen) {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (!e.repeat) this.jailKeys?.(e.code);
      return;
    }
    if (this.gulp && e.code === "Space") { e.preventDefault(); if (!e.repeat) this.gulp(true); return; }
    this.keys.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyE") this.onAction?.("grab");
    else if (e.code === "KeyG") this.onAction?.("drop");
    else if (e.code === "KeyR") this.onAction?.("robStart"); // hold R at a shop till
    else if (e.code === "KeyB" && !e.repeat) this.onAction?.("dance"); // (R11: B for boogie)
    else if (e.code === "Digit1" || e.code === "Numpad1") this.onAction?.("select0");
    else if (e.code === "Digit2" || e.code === "Numpad2") this.onAction?.("select1");
    else if (e.code === "Digit3" || e.code === "Numpad3") this.onAction?.("select2");
    else if (e.code === "Digit4" || e.code === "Numpad4") this.onAction?.("select3");
    else if (e.code === "KeyF" && !this.charging) { this.charging = "key"; this.onAction?.("chargeStart", "key"); }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (this.gulp && e.code === "Space") { this.gulp(false); return; }
    if (e.code === "KeyE" && this.enabled) this.onAction?.("grabEnd");
    if (e.code === "KeyR" && this.enabled) this.onAction?.("robEnd"); // letting go of R stops a hold-up
    if (e.code === "KeyF" && this.charging === "key") { this.charging = null; if (this.enabled) this.onAction?.("chargeEnd", "key"); }
  };
  clear = () => { this.keys.clear(); };

  private lastX: number | null = null;
  private lastY = 0;

  private onMouseMove = (e: PointerEvent) => {
    let dx: number, dy: number;
    if (this.locked) {
      // Ignore absurd spikes some browsers produce when pointer lock engages
      dx = Math.abs(e.movementX) > 400 ? 0 : e.movementX;
      dy = Math.abs(e.movementY) > 400 ? 0 : e.movementY;
    } else {
      // Drag-to-look: measure the pointer ourselves (movementX isn't reliable without pointer lock)
      const held = this.dragLook && (e.buttons & 1) === 1;
      if (!held || this.lastX === null) {
        this.lastX = held ? e.clientX : null;
        this.lastY = e.clientY;
        return;
      }
      dx = e.clientX - this.lastX;
      dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dx *= 1.6; // dragging covers less distance than a captured mouse
      dy *= 1.6;
    }
    if (!this.enabled) return;
    if (this.frozen) { this.jailMouse?.(dx, dy); return; } // camera holds still in jail
    // 0.0022 rad per pixel at sensitivity 1 feels close to common FPS defaults
    const k = 0.0022 * settings.mouseSensitivity;
    this.yaw += dx * k;
    this.pitch += dy * k * (settings.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    const tau = Math.PI * 2;
    this.yaw = ((this.yaw % tau) + tau) % tau;
  };

  private down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Movement axes in -1..1 */
  axes(): Axes {
    if (this.frozen) return { mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false }; // jailed: nothing moves you
    if (this.override) return this.override;
    if (!this.enabled) return { mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false };
    const mz = (this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0);
    const mx = (this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0);
    return {
      mx, mz,
      sprint: this.down("ShiftLeft", "ShiftRight"),
      jump: this.down("Space"),
      crouch: this.down("KeyC"),
      dodge: this.down("KeyQ"),
    };
  }
}
