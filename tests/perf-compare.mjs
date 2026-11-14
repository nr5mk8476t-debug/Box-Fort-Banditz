// R12.5: compare two BENCHMARK results (the JSON the benchmark saves, or the "---- data ----" part of a pasted result) and
// flag any stretch of the route that got more expensive than a change is allowed to make it (the per-change budget in
// docs/perf-budget.md). Use it before accepting a new building, street or interior: same machine, same settings, same
// route; a flagged line means "find out what it costs" before going on, not "turn the graphics down".
// usage: node tests/perf-compare.mjs before.json after.json   (exit code 1 if anything's over budget, 2 if the two runs
//   can't be compared: a different GPU, resolution or mode, or stretches missing from one of them. FORCE=1 compares anyway)
// R13.1: meshes are budgeted too (Blake's PC: the frame follows the meshes drawn); NO new frames over 50 ms (the standing
// brief: it used to let two through); a pure optimisation (OPT=1) may not get worse anywhere beyond the noise (5%).
import fs from "node:fs";
const [a, b] = process.argv.slice(2).map((f) => { const t = fs.readFileSync(f, "utf8"); const j = t.includes("---- data ----") ? t.split("---- data ----")[1] : t; return JSON.parse(j); });
if (!a || !b) { console.log("usage: node tests/perf-compare.mjs before.json after.json"); process.exit(2); }
/** per-change budget: how much worse any one stretch may get (fractions), and slow frames allowed to appear */
export const CHANGE_BUDGET = process.env.OPT
  ? { medianMs: 0.05, p99Ms: 0.05, drawCalls: 0, triangles: 0, meshes: 0, over50: 0 }
  : { medianMs: 0.10, p99Ms: 0.20, drawCalls: 0.15, triangles: 0.15, meshes: 0.15, over50: 0 };
const key = (l) => l.leg + (l.night ? " (night)" : "");
const before = new Map(a.legs.map((l) => [key(l), l]));
const warn = [], rows = [], invalid = [];
const keysB = new Set(b.legs.map(key));
for (const k of before.keys()) if (!keysB.has(k)) invalid.push(`"${k}" is in the before run but not the after run`);
for (const k of keysB) if (!before.has(k)) invalid.push(`"${k}" is in the after run but not the before run`);
for (const l of b.legs) { const o = before.get(key(l)); if (o && (!o.frames || !l.frames)) invalid.push(`"${key(l)}" has no samples in one run`); }
const pct = (x, y) => (y ? (x - y) / y : 0);
for (const l of b.legs) {
  const o = before.get(key(l)); if (!o) continue;
  const d = { med: pct(l.medianMs, o.medianMs), p99: pct(l.p99Ms, o.p99Ms), dc: pct(l.drawCalls, o.drawCalls), tri: pct(l.triangles, o.triangles), am: pct(l.activeMeshes, o.activeMeshes) };
  const flags = [];
  if (d.med > CHANGE_BUDGET.medianMs) flags.push(`median +${Math.round(d.med * 100)}%`);
  if (d.p99 > CHANGE_BUDGET.p99Ms) flags.push(`slow frames +${Math.round(d.p99 * 100)}%`);
  if (d.dc > CHANGE_BUDGET.drawCalls) flags.push(`draw calls +${Math.round(d.dc * 100)}%`);
  if (d.tri > CHANGE_BUDGET.triangles) flags.push(`triangles +${Math.round(d.tri * 100)}%`);
  if (o.activeMeshes !== undefined && d.am > CHANGE_BUDGET.meshes) flags.push(`meshes +${Math.round(d.am * 100)}%`);
  // (only where frames are normally well under 50 ms: on a machine where every frame is over it, the count means nothing)
  if (o.medianMs < 33 && l.over50 > o.over50 + CHANGE_BUDGET.over50) flags.push(`${l.over50 - o.over50} more frames over 50 ms`);
  const f = (x) => (x > 0 ? "+" : "") + Math.round(x * 100) + "%";
  rows.push(`${key(l).slice(0, 44).padEnd(44)} median ${String(o.medianMs).padStart(6)} → ${String(l.medianMs).padStart(6)} (${f(d.med).padStart(5)})  p99 ${f(d.p99).padStart(5)}  draws ${o.drawCalls} → ${l.drawCalls} (${f(d.dc)})  meshes ${o.activeMeshes} → ${l.activeMeshes} (${f(d.am)})  tris ${Math.round(o.triangles / 1000)}k → ${Math.round(l.triangles / 1000)}k (${f(d.tri)})${flags.length ? "   OVER BUDGET: " + flags.join(", ") : ""}`);
  if (flags.length) warn.push(key(l));
}
console.log(`before: ${a.info.build} (${a.info.mode}, ${a.info.gpu})\nafter:  ${b.info.build} (${b.info.mode}, ${b.info.gpu})`);
if (a.info.gpu !== b.info.gpu) invalid.push(`different GPU (${a.info.gpu} / ${b.info.gpu})`);
if (a.info.render !== b.info.render) invalid.push(`different resolution (${a.info.render} / ${b.info.render})`);
if (a.info.mode !== b.info.mode) invalid.push(`different mode (${a.info.mode} / ${b.info.mode})`);
if (invalid.length) { console.log("NOT COMPARABLE:\n  " + invalid.join("\n  ")); if (!process.env.FORCE) process.exit(2); console.log("(FORCE=1: comparing anyway; don't trust the verdict)"); }
console.log(rows.join("\n"));
console.log(`\noverall: median ${a.total.medianMs} → ${b.total.medianMs} ms, 99th ${a.total.p99Ms} → ${b.total.p99Ms} ms, 1% low ${a.total.low1Fps} → ${b.total.low1Fps} FPS, worst ${a.total.maxMs} → ${b.total.maxMs} ms`);
if (a.loadMs && b.loadMs) console.log(`loading: ${(a.loadMs / 1000).toFixed(1)} → ${(b.loadMs / 1000).toFixed(1)} s`);
console.log(warn.length ? `\n${warn.length} stretch(es) over the per-change budget: find out what they cost before accepting the change.` : "\nwithin budget");
process.exit(warn.length ? 1 : 0);
