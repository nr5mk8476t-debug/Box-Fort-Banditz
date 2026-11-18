// COMPACT QUEENS (a proposal, 2026-11-17): the smaller, denser plan obeys every v2 rule (the same checker), hits Blake's
// travel target, and keeps the choices it was designed for. Times are ESTIMATES from measured speeds (the real-movement
// walk is tests/compact-walk.ts); sightlines are plan geometry (sight.ts), not the renderer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { usePlan, validate, routes, layout, railColumns, floorAreas } from "../src/queens/check.js";
import { COMPACT } from "../src/queens/compact.js";
import { P } from "../src/queens/active.js";
import { buildNet, route } from "../src/queens/net.js";
import { Sight } from "../src/queens/sight.js";
import { STAIN_DRESSING, blockers } from "../src/queens/dressing.js";
import type { XZ } from "../src/queens/plan.js";

usePlan(COMPACT);
const rows = () => routes().rows;
const LM = ["bank", "casino", "hotel", "museum"];

test("CQ the compact plan passes every rule the v2 plan does", () => {
  const bad = validate();
  assert.deepEqual(bad, [], bad.map((i) => `${i.rule}: ${i.msg}`).join("\n"));
});

test("CQ Blake's benchmark: every fort's NEAREST landmark is 22-28 s (mat to public door, sprinting, estimated); the far corner longer", () => {
  for (const f of P.forts) {
    const ts = LM.map((id) => rows().find((r) => r.fort === f.id && r.id === id)!.out).sort((a, b) => a - b);
    assert.ok(ts[0] >= 22 && ts[0] <= 28, `${f.id}: nearest landmark ${ts[0].toFixed(1)} s`);
    assert.ok(ts[3] - ts[0] >= 6, `${f.id}: crossing town is a decision (${ts[0].toFixed(0)} vs ${ts[3].toFixed(0)} s)`);
  }
  const near = P.forts.map((f) => Math.min(...LM.map((id) => rows().find((r) => r.fort === f.id && r.id === id)!.out)));
  assert.ok(Math.max(...near) - Math.min(...near) < 1, "the same for every fort");
});

test("CQ fair forts: nearest starter / mid / high shop within 6 s across forts; the starter shop is right outside", () => {
  for (const tier of ["low", "mid", "high"]) {
    const t = P.forts.map((f) => Math.min(...rows().filter((r) => r.fort === f.id && r.tier === tier && r.phase === "first").map((r) => r.out)));
    assert.ok(Math.max(...t) - Math.min(...t) <= 6, `${tier}: ${t.map((x) => x.toFixed(1)).join("/")}`);
    if (tier === "low") for (const x of t) assert.ok(x <= 7, `starter shop ${x.toFixed(1)} s`);
  }
});

test("CQ the roster: 8 / 7 / 5 playable first (four brought forward), 12 / 8 / 6 planned, 4 landmarks, the pub west and the club east", () => {
  const n = (t: string, ph?: string) => P.units.filter((u) => u.kind === "shop" && u.tier === t && (!ph || u.phase === ph)).length;
  assert.deepEqual([n("low", "first"), n("mid", "first"), n("high", "first")], [8, 7, 5]);
  assert.deepEqual([n("low"), n("mid"), n("high")], [12, 8, 6]);
  const pub = P.units.find((u) => u.id === "pub")!.parts[0], club = P.units.find((u) => u.id === "club")!.parts[0];
  assert.ok(pub.maxX < -100 && club.minX > 100, "pub west, club east");
  assert.ok(pub.maxX - pub.minX >= 29 && pub.maxZ - pub.minZ >= 26 && club.maxX - club.minX >= 29 && club.maxZ - club.minZ >= 26, "room for today's interiors");
});

test("CQ the hidden ways cost a little: the back lanes and the pub's lane are longer than the avenue, never shorter", () => {
  const net = buildNet({ lane: [-176, -60], q: [-168, 12] }, layout());
  const quick = route(net, ["back:museum", "mat:F1"]), cover = route(net, ["back:museum", "lane", "q", "mat:F1"]);
  assert.ok(cover.dist - quick.dist >= 10 && cover.dist - quick.dist <= 25, `behind the pub costs ${(cover.dist - quick.dist).toFixed(0)} m`);
  // the NW back lane (from Queasy up to Rooster Velt) vs Stain Way between the same two corners
  const a = route(net, ["mat:F1", "door:bank"]);
  assert.ok(a.pts.some((p) => Math.abs(p[0] + 118) < 0.5), "the quickest way to the bank is up Stain Way (the shopping street), not the lane");
});

test("CQ sight: Tyson at PLUG & PRAY's door sees Stain Way to the museum corner; the pub's lane is hidden from him", () => {
  const s = new Sight(layout(), blockers(STAIN_DRESSING)), door: XZ = [-110.5, -52];
  assert.ok(s.sees(door, [-112, -110]), "down Stain Way toward the museum corner");
  assert.ok(!s.sees(door, [-119, -100]), "except right behind the parcel van (it's there to hide you for a moment)");
  assert.ok(!s.sees(door, [-168, -20]), "not the lane behind the pub");
  assert.ok(!s.sees(door, [-60, 30]), "not through the inner block");
});

test("CQ the El: a diagonal on the casino side, its columns clear, every crossing spanned", () => {
  const r = railColumns(); assert.deepEqual(r.problems, []); for (const c of r.crossings) assert.ok(c.ok, c.what);
  const cas = P.units.find((u) => u.id === "casino")!.parts[0], [a, b] = P.rail.pts, side = (p: XZ) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const east = Math.sign(side([204, 204]));
  assert.ok(Math.sign(side([cas.minX, cas.minZ])) === east && Math.sign(side([cas.maxX, cas.maxZ])) === east, "the casino east of the line");
  for (const id of ["bank", "museum", "hotel"]) { const r = P.units.find((u) => u.id === id)!.parts[0]; assert.ok(Math.sign(side([r.minX, r.minZ])) === -east, `${id} west of it`); }
});

test("CQ shops are about twice today's floor area (R15), the specialists flagged", () => {
  for (const a of floorAreas()) { if (a.flag && !a.flag.startsWith("brought forward")) continue; assert.ok(a.ratio >= 1.9 && a.ratio <= 2.5, `${a.id}: ${a.ratio.toFixed(2)}x`); }
});
