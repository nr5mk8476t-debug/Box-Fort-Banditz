// R12.6: SPLIT THE G, social: release = result, everyone sees your glass, the shared reveal, the 3-pint challenge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, PUB, GCH, pintLevel, pintMissMm, pintHoldFor, pintGrade } from "../src/index.js";

function settle(w: World, seconds = 1) { for (let i = 0; i < Math.round(seconds * 60); i++) w.tick(); }
function pubWorld(n = 3) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 4, npcs: 0, spawnLoot: false, arena });
  for (let i = 0; i < n; i++) { const p = w.addPlayer("p" + i, "P" + i); p.cash = 200; }
  w.resetCity(false); w.takeEvents();
  const pb = arena.pub!;
  for (let i = 0; i < n; i++) w.debugTeleport("p" + i, pb.taps[0].x + i * 0.4, pb.taps[0].z, 0);
  settle(w, 0.2); w.takeEvents();
  return { w, pb };
}
/** (events the helper below took on the way: the challenge's are kept for the test to read) */
const kept: WorldEvent[] = [];
const take = (w: World) => { const es = w.takeEvents(); kept.push(...es.filter((e) => e.t === "gch")); return es; };
const gchEvents = (w: World) => { const es = [...kept, ...w.takeEvents()]; kept.length = 0; return es.filter((e) => e.t === "gch") as Extract<WorldEvent, { t: "gch" }>[]; };
const evs = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
/** buy a pint and drink it for `hold` s (the sip goes in when you press, the gulp when you let go) */
function split(w: World, pid: string, hold: number, sendHold = hold) {
  w.buyPint(w.players.get(pid)!);
  const r = (evs(take(w), "pint")[0] as any)?.rate as number;
  w.action(pid, { a: "sip" });
  settle(w, hold);
  w.action(pid, { a: "gulp", hold: sendHold });
  return { rate: r, done: evs(take(w), "pintDone").find((e) => e.p === pid)! };
}

test("R12.6 release = result: the score is exactly where the line was when you let go (no settling on)", () => {
  assert.equal(PUB.settle, 0);
  for (const rate of [PUB.rateMin, PUB.rateMax]) for (const h of [0.5, 1.7, 2.4, 3.1]) {
    assert.equal(pintMissMm(h, rate), Math.abs(pintLevel(h, rate) - PUB.g) * PUB.glassMm);
  }
  const rate = 0.11, h = pintHoldFor(PUB.g, rate);
  assert.ok(Math.abs(pintLevel(h, rate) - PUB.g) < 1e-6, "letting go on the bar = 0 mm");
  assert.equal(pintGrade(pintMissMm(h, rate)), "perfect");
});

test("R12.6 everyone sees your pint: full in your hand, the line going down while you drink, gone once it's down; the reveal says where it ended", () => {
  const { w } = pubWorld(1);
  assert.equal(w.pintView("p0").lvl, 0);
  w.buyPint(w.players.get("p0")!); w.takeEvents();
  assert.equal(w.pintView("p0").lvl, Math.round(PUB.start * 1000)); assert.equal(w.pintView("p0").drinking, false);
  w.action("p0", { a: "sip" }); settle(w, 1.5);
  const v = w.pintView("p0");
  assert.ok(v.drinking && v.lvl < PUB.start * 1000 - 50, `going down (${v.lvl})`);
  w.action("p0", { a: "gulp", hold: 1.5 });
  const d = evs(w.takeEvents(), "pintDone")[0];
  assert.equal(w.pintView("p0").lvl, 0, "it's on the bar now");
  assert.ok(d.lvl !== undefined && d.x !== undefined, "the reveal: the final level and where to set the glass down");
  assert.ok(Math.abs(d.lvl! - pintLevel(1.5, (d as any).rate ?? 0.11)) < 0.02);
});

test("R12.6 the host keeps the hold honest: a hold far off the time it saw you drinking is pulled back (0.4 s of slack for the network)", () => {
  const { w } = pubWorld(1);
  const { rate, done } = split(w, "p0", 1.0, 2.6); // (drank 1 s, claims 2.6)
  assert.ok(Math.abs(done.mm - Math.round(pintMissMm(1.4, rate) * 10) / 10) < 0.11, `scored as 1.4 s at most (${done.mm} mm)`);
  const ok = split(w, "p0", 2.0, 2.15); // (a bit of lag: fine)
  assert.ok(Math.abs(ok.done.mm - Math.round(pintMissMm(2.15, ok.rate) * 10) / 10) < 0.11);
});

test("R12.6 the challenge: open at the chalkboard, opt in, starts with 2+, 3 pints each counted, lowest total wins the prize", () => {
  const { w } = pubWorld(3); kept.length = 0;
  const [a, b] = [w.players.get("p0")!, w.players.get("p1")!];
  w.gchUse(a); w.gchUse(b);
  assert.equal(w.gch?.state, "open"); assert.equal(w.gch?.ps.size, 2);
  w.gchUse(b); assert.equal(w.gch?.ps.size, 1, "B backs out");
  w.gchUse(b);
  split(w, "p0", 1.0); // (before it starts: doesn't count)
  settle(w, GCH.joinT + 0.5);
  assert.ok(gchEvents(w).some((e) => e.what === "start")); assert.equal(w.gch?.state, "on");
  w.gchUse(w.players.get("p2")!); assert.equal(w.gch?.ps.has("p2"), false, "no joining halfway");
  const cashA = a.cash, cashB = b.cash;
  let totA = 0, totB = 0;
  for (let k = 0; k < 3; k++) {
    totA += split(w, "p0", pintHoldFor(PUB.g, 0.11) * 0 + 2.1).done.mm;
    totB += split(w, "p1", 0.6).done.mm;
  }
  const end = gchEvents(w).find((e) => e.what === "end");
  assert.ok(end, "over after 3 each");
  assert.ok(end!.rank![0].total <= end!.rank![1].total);
  const winner = totA < totB ? "p0" : "p1";
  assert.equal(end!.winner, winner);
  assert.equal(w.gch, null);
  const pays = (pid: string, before: number) => w.players.get(pid)!.cash - before;
  assert.ok(pays(winner, winner === "p0" ? cashA : cashB) > pays(winner === "p0" ? "p1" : "p0", winner === "p0" ? cashB : cashA), "the winner's up the prize");
  // a 4th pint after it's over counts for nothing
  split(w, "p0", 1.0); assert.equal(gchEvents(w).length, 0);
});

test("R12.6 the challenge: leavers can't trap the others (walk out = OUT, the rest finish); alone = called off", () => {
  const { w, pb } = pubWorld(3); kept.length = 0;
  const [a, b, c] = ["p0", "p1", "p2"].map((id) => w.players.get(id)!);
  w.gchUse(a); w.gchUse(b); w.gchUse(c);
  settle(w, GCH.joinT + 0.5); gchEvents(w);
  split(w, "p0", 1.2);
  w.debugTeleport("p2", pb.rect.minX - 80, pb.rect.minZ - 40, 0); settle(w, 0.3);
  assert.ok(gchEvents(w).some((e) => e.what === "out" && e.p === "p2" && e.why === "left"));
  b.connected = false; settle(w, 0.3);
  assert.ok(gchEvents(w).some((e) => e.what === "out" && e.p === "p1"));
  split(w, "p0", 1.2); split(w, "p0", 1.2);
  const end = gchEvents(w).find((e) => e.what === "end");
  assert.ok(end && end.winner === "p0", "A finishes and wins; nobody waits on the leavers");
  // the clock: someone who just stands there is out when time's up
  b.connected = true;
  w.debugTeleport("p1", a.move.x, a.move.z, 0); w.debugTeleport("p2", a.move.x, a.move.z, 0); settle(w, 0.2);
  w.gchUse(a); w.gchUse(b); settle(w, GCH.joinT + 0.5); gchEvents(w);
  for (let k = 0; k < 3; k++) split(w, "p0", 1.0);
  assert.ok(w.gch, "still waiting on B");
  settle(w, GCH.timeT + 1);
  const end2 = gchEvents(w).find((e) => e.what === "end");
  assert.ok(end2 && end2.winner === "p0" && end2.rank!.find((r) => r.p === "p1")!.out, "B ran out of time");
  // nobody joins: called off
  w.gchUse(a); settle(w, GCH.joinT + 0.5);
  assert.ok(gchEvents(w).some((e) => e.what === "cancel" && e.why === "alone")); assert.equal(w.gch, null);
});
