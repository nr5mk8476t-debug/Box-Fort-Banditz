// Q0: `npx tsx tests/sustained-run.ts`. 
// Sustained empty-handed running on open flat ground, using the game's own stepMovement + stamina rules. Three ways:
// walk only; sprint held the whole time (winded -> walk -> sprint again at 35%); and the "best" human pattern I could
// find (release sprint just before empty so you never get winded). Distances at 30/45/60/75 s.
import { stepMovement, makeMoveState } from "../shared/src/movement.js";
import { SIM_DT } from "../shared/src/constants.js";
const arena: any = { boxes: [], ramps: [], half: 5000, size: 10000, roads: [], forts: [] };
function run(policy: (s: any) => boolean) {
  const s: any = makeMoveState(0, 0, 0); let t = 0, seq = 0; const out: Record<number, number> = {};
  for (const mark of [30, 45, 60, 75]) { while (t < mark) { stepMovement(s, { seq: ++seq, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: policy(s), jump: false, crouch: false, dodge: false }, arena, SIM_DT); t += SIM_DT; } out[mark] = s.z; }
  return out;
}
let pulse = true;
const fmt = (o: any) => Object.entries(o).map(([k, v]: any) => `${k}s ${v.toFixed(0)} m (${(v / +k).toFixed(2)} m/s)`).join(" | ");
console.log("walk only      ", fmt(run(() => false)));
console.log("sprint held    ", fmt(run(() => true)));
console.log("pulse 0.1..1.0 ", fmt(run((s) => { if (s.stamina < 0.1) pulse = false; if (s.stamina >= 0.999) pulse = true; return pulse; })));
pulse = true;
console.log("pulse 0.05..0.5", fmt(run((s) => { if (s.stamina < 0.05) pulse = false; if (s.stamina >= 0.5) pulse = true; return pulse; })));
