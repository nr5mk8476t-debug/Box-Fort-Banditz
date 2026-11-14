// R13.1: a giant thing mid tug of war, and the carry state that rides to the client.
// (B) a carry speed of 0 (the tug: both players held still) survives writeMoveState/readMoveState, so the client
//     predicts what the host does; missing or junk data still reads as empty-handed (1).
// (C) selling, pawning or fencing a contested giant is refused until the tug's won (either end, any order, mashed);
//     anything that does delete an item lets go of it for EVERY carrier; a stale hand recovers by itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import {
  setCityMap as useCity, STORES, storeFrame, STORE_SHELLS, STORE_TRADE, GIANT_DRAG_MUL,
  makeMoveState, writeMoveState, readMoveState, stepMovement, type MoveInput, type MoveState, type ArenaLayout,
} from "../src/index.js";

const settle = (w: World, s = 1) => { for (let i = 0; i < s * 60; i++) w.tick(); };
const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];

// ------------------------------------------------------------------------------------------------ (B)
const EMPTY: ArenaLayout = { halfSize: 60, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }], lootSpawns: [] };
const fwd = (seq: number): MoveInput => ({ seq, mx: 0, mz: 1, yaw: 0, pitch: 0, jump: false, sprint: false, crouch: false, dodge: false });
function roundTrip(s: MoveState) { const o: Record<string, unknown> = {}; writeMoveState(o, s); return readMoveState(o); }
function run(s: MoveState, n = 60) { for (let i = 0; i < n; i++) stepMovement(s, fwd(i + 1), EMPTY); return s; }

test("R13.1 move state: carry speed 0 (a tug of war) survives the trip to the client, and the client predicts the same standstill", () => {
  const host = makeMoveState(0, 0); host.carryMul = 0; host.carryHeavy = true; host.handsFull = true;
  const client = roundTrip(host);
  assert.equal(client.carryMul, 0); assert.equal(client.carryHeavy, true); assert.equal(client.handsFull, true);
  run(host); run(client);
  assert.equal(client.z, host.z, "same place after 60 forward steps");
  assert.ok(Math.abs(host.z) < 1e-9, "and nobody moved");
});

test("R13.1 move state: ordinary carrying round-trips exactly; missing or junk carryMul still means empty-handed", () => {
  const host = makeMoveState(0, 0); host.carryMul = GIANT_DRAG_MUL; host.carryHeavy = true; host.handsFull = true;
  const client = roundTrip(host);
  assert.equal(client.carryMul, GIANT_DRAG_MUL);
  run(host); run(client);
  assert.equal(client.z, host.z);
  assert.ok(host.z > 0.3, "dragging alone still moves");
  const o: Record<string, unknown> = {}; writeMoveState(o, makeMoveState(0, 0));
  for (const bad of [undefined, null, NaN, -1, "x", Infinity]) {
    const c = { ...o, carryMul: bad };
    if (bad === undefined) delete c.carryMul;
    assert.equal(readMoveState(c).carryMul, 1, `carryMul ${String(bad)} -> 1`);
  }
  assert.equal(readMoveState({}).carryMul, 1, "an empty object");
});

// ------------------------------------------------------------------------------------------------ (C)
function plugWorld() {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 7, npcs: 0, spawnLoot: false, arena });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  w.resetCity(false); w.takeEvents();
  const st = STORES.find((s) => s.id === "plugpray")!, f = storeFrame(st), [c0, c1, cv0] = STORE_SHELLS.plugpray.counter;
  const mid = (c0 + c1) / 2;
  // a stands at the counter, b behind them; the arcade machine sits between, to one side
  const pa = f.at(mid - 0.5, cv0 - 0.6), pb = f.at(mid - 0.5, cv0 - 3.0), pm = f.at(mid + 0.4, cv0 - 1.8), pc = f.at(mid, cv0 + 1);
  const face = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
  w.debugTeleport("a", pa.x, pa.z, face(pa, pm), 0.2); w.debugTeleport("b", pb.x, pb.z, face(pb, pm), 0.2);
  const arc = w.placeItem("arcade_machine", pm.x, 0.9, pm.z);
  w.items.get(arc)!.value = 200;
  settle(w, 1); w.takeEvents();
  const towardCounter = (p: typeof a) => { p.move.yaw = face({ x: p.move.x, z: p.move.z }, pc); };
  return { w, a, b, arc, towardCounter };
}
function startTug(first: "a" | "b") {
  const r = plugWorld();
  const second = first === "a" ? "b" : "a";
  r.w.action(first, { a: "grab", item: r.arc }); settle(r.w, 0.3);
  r.w.action(second, { a: "grab", item: r.arc }); r.w.tick();
  const it = r.w.items.get(r.arc)!;
  assert.ok(it.holder && it.holder2, "a tug of war is on");
  assert.equal(r.a.move.carryMul, 0); assert.equal(r.b.move.carryMul, 0);
  r.w.takeEvents();
  return r;
}
const use = (w: World, pid: string) => w.action(pid, { a: "use", prop: "storecounter_plugpray" });

for (const first of ["a", "b"] as const) {
  test(`R13.1 contested giant (${first === "a" ? "the seller holds it" : "the seller grabbed the other end"}): the counter won't buy it mid tug, mashed or not; both stay locked in the tug; it sells once the tug's won`, () => {
    const { w, a, b, arc, towardCounter } = startTug(first);
    towardCounter(a);
    for (let i = 0; i < 4; i++) { use(w, "a"); w.tick(); }
    const es = w.takeEvents();
    assert.equal(ev(es, "storeSold").length, 0, "nothing sold");
    assert.ok(ev(es, "whiff").some((e) => e.p === "a" && e.reason === "tug"), "told why");
    assert.ok(w.items.has(arc), "still there");
    assert.equal(a.cash, 0);
    assert.equal(a.hand, arc); assert.equal(b.hand, arc);
    assert.equal(a.move.carryMul, 0); assert.equal(b.move.carryMul, 0);
    // a wins the tug, then sells it: b's free to run, a's paid exactly once
    let won = false;
    for (let i = 0; i < 600 && !won; i++) { if (i % 6 === 0) w.action("a", { a: "tug" }); w.tick(); won = w.takeEvents().some((e) => e.t === "tug" && e.stage === "win"); }
    assert.ok(won, "the tug ended");
    const it = w.items.get(arc)!;
    assert.equal(it.holder, "a"); assert.equal(it.holder2, "");
    assert.equal(b.hand, ""); assert.equal(b.move.carryMul, 1); assert.equal(b.move.carryHeavy, false); assert.equal(b.move.handsFull, false);
    towardCounter(a); settle(w, 0.2); w.takeEvents();
    for (let i = 0; i < 4; i++) { use(w, "a"); w.tick(); }
    const sold = ev(w.takeEvents(), "storeSold");
    assert.equal(sold.length, 1, "sold once");
    assert.equal(a.cash, Math.round(200 * STORE_TRADE.plugpray.buys!.mult!));
    assert.ok(!w.items.has(arc));
    assert.equal(a.hand, ""); assert.equal(a.move.carryMul, 1); assert.equal(a.move.carryHeavy, false); assert.equal(a.move.handsFull, false);
  });
}

test("R13.1 contested giant: same-tick grab and sale (either order): never sold out from under a new tug; nobody left holding a ghost", () => {
  for (const order of ["grab-then-sell", "sell-then-grab"]) {
    const { w, a, b, arc, towardCounter } = plugWorld();
    w.action("a", { a: "grab", item: arc }); settle(w, 0.3); w.takeEvents();
    towardCounter(a);
    if (order === "grab-then-sell") { w.action("b", { a: "grab", item: arc }); use(w, "a"); } else { use(w, "a"); w.action("b", { a: "grab", item: arc }); }
    settle(w, 0.5);
    const es = w.takeEvents(), sold = ev(es, "storeSold").length;
    if (sold) {
      // the sale got in first: the item's gone and b never got hold of it (or let go of it)
      assert.ok(!w.items.has(arc), order);
      assert.equal(b.hand, "", order); assert.equal(b.move.carryMul, 1, order);
    } else {
      assert.ok(w.items.has(arc), order);
      assert.equal(a.cash, 0, order);
    }
    for (const p of [a, b]) if (p.hand) assert.ok(w.items.has(p.hand), `${order}: ${p.id} holds something real`);
  }
});

test("R13.1 contested giant: the pawn counter and the pawn case refuse it mid tug too", () => {
  const { w, a, arc } = startTug("a");
  w.pawn.fence(a, -1); w.pawn.caseUse(a);
  const es = w.takeEvents();
  assert.equal(ev(es, "fenced").length + ev(es, "pawned").length, 0);
  assert.equal(ev(es, "whiff").filter((e) => e.reason === "tug").length, 2);
  assert.ok(w.items.has(arc)); assert.equal(a.cash, 0);
});

test("R13.1 contested giant: a carrier who leaves mid tug hands it to the other; the other can then sell it", () => {
  const { w, a, b, arc, towardCounter } = startTug("b");
  w.removePlayer("b");
  const it = w.items.get(arc)!;
  assert.equal(it.holder, "a"); assert.equal(it.holder2, "");
  assert.ok(Math.abs(a.move.carryMul - GIANT_DRAG_MUL) < 1e-9, "a drags it alone");
  towardCounter(a); settle(w, 0.2); w.takeEvents();
  use(w, "a");
  assert.equal(ev(w.takeEvents(), "storeSold").length, 1);
  assert.equal(a.move.carryMul, 1);
  void b;
});

test("R13.1 consumeItem lets go for every carrier; a stale hand (deleted some other way) recovers within a tick", () => {
  const { w, a, b, arc } = startTug("a");
  w.consumeItem(a, arc); // (a path that doesn't check: both carriers must be let go)
  for (const p of [a, b]) {
    assert.equal(p.hand, "", p.id); assert.equal(p.move.carryMul, 1, p.id); assert.equal(p.move.carryHeavy, false, p.id); assert.equal(p.move.handsFull, false, p.id);
  }
  // an item deleted straight out of the map (the end of a round, the daily keycard swap): hands and pockets let go
  const r = startTug("a");
  r.w.items.delete(r.arc);
  r.w.tick();
  for (const p of [r.a, r.b]) { assert.equal(p.hand, ""); assert.equal(p.move.carryMul, 1); assert.equal(p.move.carryHeavy, false); assert.equal(p.move.handsFull, false); }
  // and they can walk again
  const z0 = r.b.move.z, x0 = r.b.move.x;
  let seq = r.b.lastSeq + 1;
  for (let i = 0; i < 30; i++) { r.w.pushInputs("b", [{ ...fwd(seq++), yaw: r.b.move.yaw }]); r.w.tick(); }
  assert.ok(Math.hypot(r.b.move.z - z0, r.b.move.x - x0) > 1, "b walks off");
});
