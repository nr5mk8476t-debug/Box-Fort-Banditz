import { test } from "node:test";
import assert from "node:assert/strict";
import { Snapshotter, applyDelta, emptyState } from "../src/p2p/sync.ts";

function view() {
  return {
    phase: "lobby", ownerId: "h", code: "ABCDE", timeLeft: 10,
    players: new Map<string, any>([["h", { x: 1.23456789, z: 0, name: "Host" }]]),
    items: new Map<string, any>([["i1", { type: "tv", x: 5.123456, y: 0, z: 2 }]]),
    npcs: new Map<string, any>(), props: new Map<string, any>(), cars: new Map<string, any>(), copCars: new Map<string, any>(),
  };
}

test("joiner rebuilds the host's view from full snapshot + deltas", () => {
  const v = view();
  const s = new Snapshotter();
  s.diff(v);
  const joiner = emptyState();
  applyDelta(joiner, s.full(), true);
  assert.equal(joiner.code, "ABCDE");
  assert.equal(joiner.players.get("h").x, 1.23456789, "player numbers stay exact (prediction needs them)");
  assert.equal(joiner.items.get("i1").x, 5.123, "drawn-only numbers are rounded to mm");

  // changes: move the player, add a car, remove the item, tick the timer
  v.players.get("h").x = 2;
  v.cars.set("c1", { x: 1, z: 1, yaw: 0 });
  v.items.delete("i1");
  v.timeLeft = 9.9;
  const d = s.diff(v)!;
  assert.deepEqual(d.c!.players, { h: { x: 2 } }, "only the changed field is sent");
  applyDelta(joiner, d);
  assert.equal(joiner.players.get("h").x, 2);
  assert.equal(joiner.players.get("h").name, "Host");
  assert.ok(joiner.cars.has("c1"));
  assert.ok(!joiner.items.has("i1"));
  assert.equal(joiner.timeLeft, 9.9);
  assert.equal(s.diff(v), null, "nothing changed -> nothing sent");

  // sub-millimetre jitter on drawn-only things isn't worth sending
  v.cars.get("c1").x = 1.0001;
  assert.equal(s.diff(v), null);
});
