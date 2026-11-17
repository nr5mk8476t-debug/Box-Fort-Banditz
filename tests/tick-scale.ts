// Q0 (Queens overhaul, Stage 0): what the HOST's simulation costs as the city gets busier. One World as the game makes
// it (the server's options), 4 players walking about, the scavenge running; NPCs at 0x, 1x, 2x, 4x the normal count.
// Reports ms per tick (mean, 99th) and how many cars and NPCs were live. Relative numbers: this machine is not Blake's,
// and tsx slows the code (CLAUDE.md: compile with tsc for absolute figures).
//
//   npx tsx tests/tick-scale.ts [seconds=60]
import { World, NPC_COUNT } from "../shared/src/world.js";

const secs = Number(process.argv[2] ?? 60);
function trial(npcs: number) {
  const w: any = new World({ seed: 7, lobby: true, npcs } as any);
  const ps = [0, 1, 2, 3].map((i) => w.addPlayer("p" + i, "P" + i));
  w.startMatch();
  for (let i = 0; i < 60 * 12 && w.match.phase !== "scavenge"; i++) { w.match.timeLeft = Math.min(w.match.timeLeft, 0.02); w.tick(); }
  for (let i = 0; i < 120; i++) w.tick(); // warm up
  const times: number[] = []; let seq = 0;
  for (let i = 0; i < secs * 60; i++) {
    for (const [k, p] of ps.entries()) w.pushInputs(p.id, [{ seq: ++seq, mx: 0, mz: 1, yaw: (i / 600 + k * 1.57) % 6.28, pitch: 0, jump: false, sprint: i % 300 < 150, crouch: false, dodge: false }]);
    const t0 = performance.now(); w.tick(); times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length, p99 = times[Math.floor(times.length * 0.99)];
  return { npcs: w.npc.npcs.size, cars: (w.traffic?.cars?.length ?? 0) + (w.police?.cars?.length ?? 0), phase: w.match.phase, mean, p99 };
}
console.log(`(${secs} s of game per trial; ms per tick; 60 ticks a second = 16.7 ms budget for EVERYTHING the host does)`);
for (const mul of [0, 1, 2, 4]) {
  const r = trial(NPC_COUNT * mul);
  console.log(`NPCs x${mul} (${String(r.npcs).padStart(3)} live, ${r.cars} cars, ${r.phase}): mean ${r.mean.toFixed(3)} ms, 99th ${r.p99.toFixed(3)} ms`);
}
