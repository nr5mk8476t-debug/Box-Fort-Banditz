// R12.5: compare two BENCHMARK results (the JSON the benchmark saves, or the "---- data ----" part of a pasted result) and
// flag any stretch of the route that got more expensive than a change is allowed to make it (the per-change budget in
// docs/perf-budget.md). Use it before accepting a new building, street or interior: same machine, same settings, same
// route; a flagged line means "find out what it costs" before going on, not "turn the graphics down".
// usage: node tests/perf-compare.mjs before.json after.json   (exit code 1 if anything's over budget)
import fs from "node:fs";
const [a, b] = process.argv.slice(2).map((f) => { const t = fs.readFileSync(f, "utf8"); const j = t.includes("---- data ----") ? t.split("---- data ----")[1] : t; return JSON.parse(j); });
if (!a || !b) { console.log("usage: node tests/perf-compare.mjs before.json after.json"); process.exit(2); }
/** per-change budget: how much worse any one stretch may get (fractions), and slow frames allowed to appear */
export const CHANGE_BUDGET = { medianMs: 0.10, p99Ms: 0.20, drawCalls: 0.15, triangles: 0.15, over50: 2 };
const key = (l) => l.leg + (l.night ? " (night)" : "");
const before = new Map(a.legs.map((l) => [key(l), l]));
const warn = [], rows = [];
const pct = (x, y) => (y ? (x - y) / y : 0);
for (const l of b.legs) {
  const o = before.get(key(l)); if (!o) continue;
  const d = { med: pct(l.medianMs, o.medianMs), p99: pct(l.p99Ms, o.p99Ms), dc: pct(l.drawCalls, o.drawCalls), tri: pct(l.triangles, o.triangles) };
  const flags = [];
  if (d.med > CHANGE_BUDGET.medianMs) flags.push(`median +${Math.round(d.med * 100)}%`);
  if (d.p99 > CHANGE_BUDGET.p99Ms) flags.push(`slow frames +${Math.round(d.p99 * 100)}%`);
  if (d.dc > CHANGE_BUDGET.drawCalls) flags.push(`draw calls +${Math.round(d.dc * 100)}%`);
  if (d.tri > CHANGE_BUDGET.triangles) flags.push(`triangles +${Math.round(d.tri * 100)}%`);
  // (only where frames are normally well under 50 ms: on a machine where every frame is over it, the count means nothing)
  if (o.medianMs < 33 && l.over50 > o.over50 + CHANGE_BUDGET.over50) flags.push(`${l.over50 - o.over50} more frames over 50 ms`);
  const f = (x) => (x > 0 ? "+" : "") + Math.round(x * 100) + "%";
  rows.push(`${key(l).slice(0, 44).padEnd(44)} median ${String(o.medianMs).padStart(6)} → ${String(l.medianMs).padStart(6)} (${f(d.med).padStart(5)})  p99 ${f(d.p99).padStart(5)}  draws ${o.drawCalls} → ${l.drawCalls} (${f(d.dc)})  tris ${Math.round(o.triangles / 1000)}k → ${Math.round(l.triangles / 1000)}k (${f(d.tri)})${flags.length ? "   OVER BUDGET: " + flags.join(", ") : ""}`);
  if (flags.length) warn.push(key(l));
}
console.log(`before: ${a.info.build} (${a.info.mode}, ${a.info.gpu})\nafter:  ${b.info.build} (${b.info.mode}, ${b.info.gpu})`);
if (a.info.gpu !== b.info.gpu || a.info.render !== b.info.render) console.log("NOTE: different GPU or resolution: not a fair comparison");
console.log(rows.join("\n"));
console.log(`\noverall: median ${a.total.medianMs} → ${b.total.medianMs} ms, 99th ${a.total.p99Ms} → ${b.total.p99Ms} ms, 1% low ${a.total.low1Fps} → ${b.total.low1Fps} FPS, worst ${a.total.maxMs} → ${b.total.maxMs} ms`);
if (a.loadMs && b.loadMs) console.log(`loading: ${(a.loadMs / 1000).toFixed(1)} → ${(b.loadMs / 1000).toFixed(1)} s`);
console.log(warn.length ? `\n${warn.length} stretch(es) over the per-change budget: find out what they cost before accepting the change.` : "\nwithin budget");
process.exit(warn.length ? 1 : 0);
