// A damped spring that stays stable at ANY frame rate.
// Bug found in Phase 1 testing: a plain spring update exploded to infinity at ~10 FPS
// (large time steps), which broke the camera entirely. Sub-stepping in small fixed slices
// keeps it stable; the finite-check is a last line of defence.
export class Spring {
  value = 0;
  velocity = 0;
  constructor(private stiffness: number, private damping: number) {}

  kick(v: number) { this.velocity += v; }

  update(dt: number): number {
    const slice = 1 / 240;
    let remaining = Math.min(dt, 0.5);
    while (remaining > 1e-9) {
      const h = Math.min(slice, remaining);
      // semi-implicit Euler: velocity first, then position
      this.velocity += (-this.stiffness * this.value - this.damping * this.velocity) * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) { this.value = 0; this.velocity = 0; }
    return this.value;
  }
}
