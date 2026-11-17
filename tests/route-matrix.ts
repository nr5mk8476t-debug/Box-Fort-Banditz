// Q0 (Queens overhaul, Stage 0): the TRAVEL MATRIX, measured with the game's own movement code (World.tick ->
// stepMovement, the real stamina rules, the real collisions), a player steered along the pedestrian nav graph
// (findPath). From EVERY fort to every destination: out empty-handed (sprint held: it runs out, recovers, sprints
// again), and back home carrying a heavy thing (an Old CRT TV: heavy, weight 0.35, no sprint) and dragging a giant alone (the Broken Arcade
// Machine). Travel only: no lockpicking, searching, fights or banking.
//
//   npx tsx tests/route-matrix.ts [new|classic] [out.json] [--giant]
//
// A route that stalls (no progress for 4 s: stuck on a corner, a car in the way) is reported as STUCK, not hidden in an
// average. The same tool measures the Queens blockout in Stage 2.
import fs from "node:fs";
import { World } from "../shared/src/world.js";
import { buildTrashington } from "../shared/src/city.js";
import { setCityMap } from "../shared/src/index.js";
import { buildNavGraph, findPath } from "../shared/src/navgraph.js";

const map = (process.argv[2] ?? "new") as "new" | "classic";
const outFile = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "";
const doGiant = process.argv.includes("--giant");
setCityMap(map); const arena: any = buildTrashington(); setCityMap("classic");
const g = buildNavGraph(arena);
const near = (x: number, z: number) => { let b = 0, bd = 1e9; for (const n of g) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = n.id; } } return b; };
type P = { x: number; z: number };
const forts: (P & { slot: number })[] = arena.forts.map((f: any) => ({ slot: f.slot, x: f.padX, z: f.padZ }));
const H = arena.half ?? 115;
const dests: { name: string; kind: string; at: P }[] = [];
for (const s of arena.stores ?? []) dests.push({ name: s.name, kind: ["low", "mid", "high"][s.tier] ?? "store", at: s.door });
if (arena.pub?.out) dests.push({ name: "SOGGY SHAMROCK (pub door)", kind: "nightlife", at: arena.pub.out });
if (arena.fever?.out) dests.push({ name: "NEON FEVER (club door)", kind: "nightlife", at: arena.fever.out });
if (arena.station?.rect) { const r = arena.station.rect; dests.push({ name: "POLICE STATION", kind: "facility", at: { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 } }); }
for (const [n, x, z] of [["N", 0, H], ["E", H, 0], ["S", 0, -H], ["W", -H, 0]] as [string, number, number][]) dests.push({ name: `${n} edge`, kind: "border", at: { x, z } });

// Travel only: the walking-network point outside each destination is where a trip starts or ends (a door's own spot
// can sit inside its wall), and the cars are cleared every tick (a passing car knocking the loot out of your hands is a
// real hazard, but it's a hazard, not travel time: TRAFFIC=1 keeps them and reports the drops)
const keepCars = process.env.TRAFFIC === "1";
const nodeAt = (q: P): P => { const n = g[near(q.x, q.z)]; return { x: n.x, z: n.z }; };
function run(from0: P, to0: P, mode: "empty" | "heavy" | "giant") {
  const from = nodeAt(from0), to = nodeAt(to0);
  const w = new World({ seed: 1, npcs: 0, spawnLoot: false, arena } as any);
  const noCars = () => { if (keepCars) return; const t: any = (w as any).traffic, c: any = (w as any).police; if (t?.cars) t.cars.length = 0; if (c?.cars) c.cars.length = 0; };
  const p: any = w.addPlayer("p0", "P0"); w.debugTeleport("p0", from.x, from.z, 0);
  const path = findPath(g, near(from.x, from.z), near(to.x, to.z)).map((i: number) => g[i]);
  let len = 0, px = from.x, pz = from.z; for (const n of path) { len += Math.hypot(n.x - px, n.z - pz); px = n.x; pz = n.z; }
  if (mode !== "empty") { (w as any).fort.give(p, mode === "heavy" ? "crt_tv" : "arcade_machine", 10); w.tick(); }
  let k = 0, seq = 0, t = 0, best = 1e9, bestT = 0;
  while (k < path.length && t < 600) {
    const n = path[k], dx = n.x - p.move.x, dz = n.z - p.move.z, d = Math.hypot(dx, dz);
    if (d < 1.4) { k++; best = 1e9; continue; }
    if (d < best - 0.05) { best = d; bestT = t; } else if (t - bestT > 4) return { len, t: NaN, why: `stuck at (${p.move.x.toFixed(0)}, ${p.move.z.toFixed(0)})` };
    w.pushInputs("p0", [{ seq: ++seq, mx: 0, mz: 1, yaw: Math.atan2(dx, dz), pitch: 0, jump: false, sprint: mode === "empty", crouch: false, dodge: false }]);
    noCars(); w.tick(); t += 1 / 60;
    if (mode !== "empty" && !p.hand) return { len, t: NaN, why: "dropped the item" };
  }
  return { len, t: k >= path.length ? t : NaN, why: k >= path.length ? "" : "timed out" };
}

const rows: any[] = [];
for (const f of forts) for (const d of dests) {
  const out = run(f, d.at, "empty"), heavy = run(d.at, f, "heavy");
  const giant = doGiant || d.kind === "high" ? run(d.at, f, "giant") : null;
  rows.push({ fort: f.slot, dest: d.name, kind: d.kind, path: Math.round(out.len), out: out.t, heavy: heavy.t, giant: giant?.t ?? null, notes: [out.why, heavy.why, giant?.why].filter(Boolean).join("; ") });
  const s = (v: number | null) => v == null ? "   -" : Number.isNaN(v) ? "FAIL" : v.toFixed(0).padStart(4);
  console.log(`F${f.slot + 1} -> ${d.name.padEnd(28)} ${String(Math.round(out.len)).padStart(4)} m | out ${s(out.t)} s | back heavy ${s(heavy.t)} s | giant ${s(giant?.t ?? null)} s ${rows.at(-1).notes}`);
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ map, measured: new Date().toISOString().slice(0, 10), rows }, null, 1));
