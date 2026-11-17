// QUEENS Stage 1: the city plan's rules (shared/src/queens). The plan passes them all, AND the checker catches a broken
// plan (a road through a removed zone, a building on a road, unequal forts, a cut-off road): a checker that passes
// everything proves nothing. Travel times are plan ESTIMATES from measured speeds (docs/queens/perf.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, routes, floorAreas, railColumns, emptyTime, MEASURED } from "../src/queens/check.js";
import { Q_ROADS, Q_PLOTS, Q_FORTS, R } from "../src/queens/plan.js";

const rules = () => validate().map((i) => i.rule);
const rowsOf = (f: string) => routes().rows.filter((r) => r.fort === f);
const nearest = (f: string, pred: (r: any) => boolean) => Math.min(...rowsOf(f).filter(pred).map((r) => r.out));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("Q1 the plan passes every rule", () => {
  const bad = validate();
  assert.deepEqual(bad, [], bad.map((i) => `${i.rule}: ${i.msg}`).join("\n"));
});

test("Q1 the checker catches a broken plan", () => {
  // a road back through the removed north spur
  Q_ROADS.push({ id: "bad_spur", name: "BAD", kind: "side", w: 7, sw: 3.5, pts: [[0, 130], [0, 335]] });
  try { assert.ok(rules().includes("removed roads")); } finally { Q_ROADS.pop(); }
  // a store built on Gnome Ave
  Q_PLOTS.push({ id: "bad_plot", kind: "store", tier: "low", name: "BAD", rect: R(-10, 10, -130, -120), door: [0, -133] });
  try { assert.ok(rules().includes("nothing on a road")); assert.ok(rules().includes("roster")); } finally { Q_PLOTS.pop(); }
  // one fort bigger than the rest
  const y = Q_FORTS[2].yard, keep = y.maxX; y.maxX += 2;
  try { assert.ok(rules().includes("equal forts")); } finally { y.maxX = keep; }
  // a road on its own, joined to nothing
  Q_ROADS.push({ id: "island", name: "ISLAND", kind: "side", w: 7, sw: 3.5, pts: [[-420, -300], [-400, -300]] });
  try { assert.ok(rules().includes("roads connected")); } finally { Q_ROADS.pop(); }
  assert.deepEqual(validate(), [], "and clean again afterwards");
});

test("Q1 the roster: 6 low, 5 mid, 5 high, 4 landmarks; every material from 2+ places", () => {
  const n = (t: string) => Q_PLOTS.filter((p) => p.kind === "store" && p.tier === t).length;
  assert.deepEqual([n("low"), n("mid"), n("high")], [6, 5, 5]);
  assert.deepEqual(Q_PLOTS.filter((p) => p.kind === "landmark").map((p) => p.id).sort(), ["bank", "casino", "hotel", "museum"]);
  const lm = (id: string) => Q_PLOTS.find((p) => p.id === id)!.rect;
  assert.ok(lm("bank").maxX < 0 && lm("bank").minZ > 0, "bank NW"); assert.ok(lm("casino").minX > 0 && lm("casino").minZ > 0, "casino NE");
  assert.ok(lm("museum").maxX < 0 && lm("museum").maxZ < 0, "museum SW"); assert.ok(lm("hotel").minX > 0 && lm("hotel").maxZ < 0, "hotel SE");
});

test("Q1 fair forts: each one's nearest low store, and its average trip, match the others'", () => {
  const forts = Q_FORTS.map((f) => f.id);
  for (const tier of ["low", "mid", "high"]) {
    const near = forts.map((f) => nearest(f, (r) => r.tier === tier));
    assert.ok(Math.max(...near) - Math.min(...near) <= 6.5, `nearest ${tier}: ${near.map((t) => t.toFixed(0)).join("/")} s`);
  }
  for (const f of forts) assert.ok(nearest(f, (r) => r.tier === "low") <= 8, `${f}: a low store within 8 s`);
  const avg = forts.map((f) => mean(rowsOf(f).filter((r) => r.kind === "store" || r.kind === "landmark").map((r) => r.out)));
  assert.ok(Math.max(...avg) / Math.min(...avg) <= 1.05, `average trip per fort within 5%: ${avg.map((t) => t.toFixed(1)).join("/")} s`);
});

test("Q1 value rises outward: low < mid < high < landmarks, from every fort", () => {
  for (const f of Q_FORTS) {
    const m = (pred: (r: any) => boolean) => mean(rowsOf(f.id).filter(pred).map((r) => r.out));
    const lo = m((r) => r.tier === "low"), mi = m((r) => r.tier === "mid"), hi = m((r) => r.tier === "high"), lm = m((r) => r.kind === "landmark");
    assert.ok(lo < mi && mi < hi && hi < lm, `${f.id}: ${[lo, mi, hi, lm].map((t) => t.toFixed(0)).join(" < ")}`);
  }
});

test("Q1 the ~60 s outskirts target: every fort reaches every border in 45-75 s (sprinting, estimated)", () => {
  for (const f of Q_FORTS) for (const r of rowsOf(f.id).filter((x) => x.kind === "border")) assert.ok(r.out >= 45 && r.out <= 75, `${f.id} -> ${r.to}: ${r.out.toFixed(0)} s`);
  const all = routes().rows.filter((r) => r.kind === "border").map((r) => r.out);
  assert.ok(mean(all) >= 50 && mean(all) <= 65, `average ${mean(all).toFixed(0)} s`);
});

test("Q1 the 8:00 scavenge fits: two high-end heavy runs, or one landmark giant run with time to spare", () => {
  const rob = 45, bank = 10;
  for (const f of Q_FORTS) {
    const high = rowsOf(f.id).filter((r) => r.tier === "high"), lm = rowsOf(f.id).filter((r) => r.kind === "landmark");
    const heavyRun = Math.max(...high.map((r) => r.out + rob + r.heavy + bank));
    assert.ok(2 * heavyRun <= 480, `${f.id}: worst high-end heavy run ${heavyRun.toFixed(0)} s`);
    const giantRun = Math.max(...lm.map((r) => r.out + 75 + r.giant + bank));
    assert.ok(giantRun <= 420, `${f.id}: worst landmark giant run ${giantRun.toFixed(0)} s (dragged alone)`);
  }
});

test("Q1 floor areas: standard stores about twice today's; bigger ones are flagged specialists", () => {
  for (const a of floorAreas()) {
    if (a.flag) { assert.ok(a.ratio >= 1.8, `${a.id} (specialist)`); continue; }
    assert.ok(a.ratio >= 1.9 && a.ratio <= 2.5, `${a.id}: ${a.ratio.toFixed(2)}x`);
  }
});

test("Q1 the elevated line: columns clear of everything, short spans over every road it crosses", () => {
  const r = railColumns();
  assert.deepEqual(r.problems, []);
  assert.ok(r.crossings.length >= 5, "it crosses the city's streets");
  for (const c of r.crossings) assert.ok(c.ok, `${c.road}: ${c.span.toFixed(0)} m`);
});

test("Q1 the time model matches the measured runs", () => {
  assert.ok(Math.abs(emptyTime(573) / MEASURED.streetLoss - 60) < 0.01);
  assert.ok(Math.abs(emptyTime(291) / MEASURED.streetLoss - 30) < 0.01);
  assert.ok(emptyTime(900) > emptyTime(718));
});
