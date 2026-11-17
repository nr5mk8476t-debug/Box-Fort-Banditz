// QUEENS: the city plan's rules (shared/src/queens, layout v2). The plan passes them all, AND the checker catches a
// broken plan: a checker that passes everything proves nothing. Travel times are ESTIMATES from measured speeds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, routes, floorAreas, railColumns, emptyTime, MEASURED, layout, resetLayout, resetRoutes, fortMaxRects } from "../src/queens/check.js";
import { coverage } from "../src/queens/layout.js";
import { Q_ROADS, Q_UNITS, Q_FORTS, FORT_MAX, HOME, R } from "../src/queens/plan.js";

const fresh = () => { resetLayout(); resetRoutes(); };
const rules = () => { fresh(); return validate().map((i) => i.rule); };
const rowsOf = (f: string) => routes().rows.filter((r) => r.fort === f);
const playable = (r: any) => r.phase === "first";
const nearest = (f: string, pred: (r: any) => boolean) => Math.min(...rowsOf(f).filter(pred).map((r) => r.out));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("Q1.1 the plan passes every rule", () => {
  fresh(); const bad = validate();
  assert.deepEqual(bad, [], bad.map((i) => `${i.rule}: ${i.msg}`).join("\n"));
});

test("Q1.1 the checker catches a broken plan", () => {
  Q_ROADS.push({ id: "bad_spur", name: "BAD", kind: "side", w: 7, sw: 3.5, pts: [[0, 150], [0, 335]] });
  try { assert.ok(rules().includes("removed roads")); } finally { Q_ROADS.pop(); }
  Q_UNITS.push({ id: "bad", kind: "shop", tier: "low", phase: "first", block: "B_sw", name: "BAD", parts: [R(-10, 10, -155, -145)], door: [0, -160], floors: 2 });
  try { const r = rules(); assert.ok(r.includes("nothing on a road")); assert.ok(r.includes("roster")); } finally { Q_UNITS.pop(); }
  const y = Q_FORTS[2].yard, keep = y.maxX; y.maxX -= 2;
  try { const r = rules(); assert.ok(r.includes("equal forts")); } finally { y.maxX = keep; }
  const h = FORT_MAX.house.v[1]; FORT_MAX.house.v[1] = 40;
  try { assert.ok(rules().includes("the largest fort fits")); } finally { FORT_MAX.house.v[1] = h; }
  Q_ROADS.push({ id: "island", name: "ISLAND", kind: "side", w: 7, sw: 3.5, pts: [[-440, -300], [-420, -300]] });
  try { assert.ok(rules().includes("roads connected")); } finally { Q_ROADS.pop(); }
  assert.deepEqual(rules(), [], "and clean again afterwards");
});

test("Q1.1 the home block: four equal 36 m yards that fit the largest planned fort; one road round the outside", () => {
  fresh();
  for (const f of Q_FORTS) {
    assert.equal(f.yard.maxX - f.yard.minX, HOME.yard); assert.equal(f.yard.maxZ - f.yard.minZ, HOME.yard);
    const house = fortMaxRects(f).find((p) => p.name.startsWith("house"))!.rect;
    assert.ok((house.maxX - house.minX) * (house.maxZ - house.minZ) >= 18 * 14 - 0.01, `${f.id}: the mansion's 18 x 14 m fits`);
  }
  const ring = Q_ROADS.filter((r) => r.kind === "ring");
  assert.equal(ring.length, 1, "one perimeter road");
});

test("Q1.1 the roster: 6/5/5 playable first, 12/8/6 planned (the rest as real reserved shop units), 4 landmarks", () => {
  const n = (t: string, ph?: string) => Q_UNITS.filter((u) => u.kind === "shop" && u.tier === t && (!ph || u.phase === ph)).length;
  assert.deepEqual([n("low", "first"), n("mid", "first"), n("high", "first")], [6, 5, 5]);
  assert.deepEqual([n("low"), n("mid"), n("high")], [12, 8, 6]);
  const lm = (id: string) => Q_UNITS.find((u) => u.id === id)!.parts[0];
  assert.ok(lm("bank").maxX < 0 && lm("bank").minZ > 0, "bank NW"); assert.ok(lm("casino").minX > 0 && lm("casino").minZ > 0, "casino NE");
  assert.ok(lm("museum").maxX < 0 && lm("museum").maxZ < 0, "museum SW"); assert.ok(lm("hotel").minX > 0 && lm("hotel").maxZ < 0, "hotel SE");
  const pub = Q_UNITS.find((u) => u.id === "pub")!.parts[0], club = Q_UNITS.find((u) => u.id === "club")!.parts[0];
  assert.ok(pub.maxX < -300 && club.minX > 150, "the pub west, the club east, apart");
  assert.ok((pub.maxX - pub.minX) >= 29 && (pub.maxZ - pub.minZ) >= 26, "room for today's pub interior (29 x 26 m)");
});

test("Q1.1 neighbourhoods, not empty rectangles: every block is built up; shops sit in rows, not alone", () => {
  fresh(); const lay = layout();
  for (const c of coverage(lay)) assert.ok(c.share >= (c.type === "workshop" || c.type === "precinct" ? 0.2 : 0.3), `${c.id}: ${(c.share * 100).toFixed(0)}%`);
  for (const u of Q_UNITS.filter((x) => x.kind === "shop")) {
    const p = u.parts[0], touch = lay.buildings.filter((b) => Math.abs(b.rect.minX - p.maxX) < 0.01 || Math.abs(b.rect.maxX - p.minX) < 0.01 || Math.abs(b.rect.minZ - p.maxZ) < 0.01 || Math.abs(b.rect.maxZ - p.minZ) < 0.01)
      .filter((b) => b.rect.minX < p.maxX + 0.01 && b.rect.maxX > p.minX - 0.01 && b.rect.minZ < p.maxZ + 0.01 && b.rect.maxZ > p.minZ - 0.01);
    assert.ok(touch.length >= 1, `${u.id} has a neighbour wall to wall`);
  }
  assert.ok(lay.alleys.filter((a) => a.kind === "alley").length >= 15, "service alleys behind the rows");
});

test("Q1.1 fair forts: nearest playable low/mid/high/landmark within 7 s across forts; average trip within 5%", () => {
  fresh(); const forts = Q_FORTS.map((f) => f.id);
  for (const [k, p] of [["low", (r: any) => r.tier === "low" && playable(r)], ["mid", (r: any) => r.tier === "mid" && playable(r)], ["high", (r: any) => r.tier === "high" && playable(r)], ["landmark", (r: any) => r.kind === "landmark"]] as [string, (r: any) => boolean][]) {
    const near = forts.map((f) => nearest(f, p));
    assert.ok(Math.max(...near) - Math.min(...near) <= 7, `nearest ${k}: ${near.map((t) => t.toFixed(0)).join("/")} s`);
  }
  for (const f of forts) assert.ok(nearest(f, (r) => r.tier === "low" && playable(r)) <= 8, `${f}: its own low store within 8 s`);
  const avg = forts.map((f) => mean(rowsOf(f).filter((r) => (r.kind === "shop" && playable(r)) || r.kind === "landmark").map((r) => r.out)));
  assert.ok(Math.max(...avg) / Math.min(...avg) <= 1.05, `average trip per fort: ${avg.map((t) => t.toFixed(1)).join("/")} s`);
});

test("Q1.1 value rises outward: low < mid < high < landmarks (playable, from every fort)", () => {
  fresh();
  for (const f of Q_FORTS) {
    const m = (p: (r: any) => boolean) => mean(rowsOf(f.id).filter(p).map((r) => r.out));
    const v = [m((r) => r.tier === "low" && playable(r)), m((r) => r.tier === "mid" && playable(r)), m((r) => r.tier === "high" && playable(r)), m((r) => r.kind === "landmark")];
    assert.ok(v[0] < v[1] && v[1] < v[2] && v[2] < v[3], `${f.id}: ${v.map((t) => t.toFixed(0)).join(" < ")}`);
  }
});

test("Q1.1 the outskirts: every fort reaches every border in 35-75 s (sprinting, estimated); average 45-60 s", () => {
  fresh();
  for (const f of Q_FORTS) for (const r of rowsOf(f.id).filter((x) => x.kind === "border")) assert.ok(r.out >= 35 && r.out <= 75, `${f.id} -> ${r.to}: ${r.out.toFixed(0)} s`);
  const all = routes().rows.filter((r) => r.kind === "border").map((r) => r.out);
  assert.ok(mean(all) >= 45 && mean(all) <= 60, `average ${mean(all).toFixed(0)} s`);
});

test("Q1.1 the 8:00 scavenge fits: two high-end heavy runs; a landmark giant run within 420 s", () => {
  fresh();
  for (const f of Q_FORTS) {
    const hi = Math.max(...rowsOf(f.id).filter((r) => r.tier === "high" && playable(r)).map((r) => r.out + 45 + r.heavy + 10));
    assert.ok(2 * hi <= 480, `${f.id}: worst high-end heavy run ${hi.toFixed(0)} s`);
    const lm = Math.max(...rowsOf(f.id).filter((r) => r.kind === "landmark").map((r) => r.out + 75 + r.giant + 10));
    assert.ok(lm <= 420, `${f.id}: worst landmark giant run ${lm.toFixed(0)} s`);
  }
});

test("Q1.1 floor areas: standard stores about twice today's; bigger ones are flagged specialists", () => {
  for (const a of floorAreas()) { if (a.flag) { assert.ok(a.ratio >= 1.8, a.id); continue; } assert.ok(a.ratio >= 1.9 && a.ratio <= 2.5, `${a.id}: ${a.ratio.toFixed(2)}x`); }
});

test("Q1.1 the elevated line: a real diagonal, columns clear of everything, short spans over every road and alley", () => {
  fresh(); const r = railColumns();
  assert.deepEqual(r.problems, []);
  assert.ok(r.crossings.length >= 8, "it crosses streets and alleys");
  for (const c of r.crossings) assert.ok(c.ok, `${c.what}: ${c.span.toFixed(0)} m`);
});

test("Q1.1 the time model matches the measured runs", () => {
  assert.ok(Math.abs(emptyTime(573) / MEASURED.streetLoss - 60) < 0.01);
  assert.ok(emptyTime(900) > emptyTime(718));
});
