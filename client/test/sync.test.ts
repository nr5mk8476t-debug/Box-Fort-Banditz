import { test } from "node:test";
import assert from "node:assert/strict";
import { Snapshotter, applyDelta, emptyState } from "../src/p2p/sync.ts";
import { Spring } from "../src/game/spring.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { footPrism } from "../src/game/cityRenderer.ts";

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

// ---- the camera spring and the building prisms (were test/spring.test.ts) ----
test("spring stays stable and settles at very low frame rates (regression: camera blew up at ~10 FPS)", () => {
  for (const fps of [4, 10, 30, 60, 144]) {
    const s = new Spring(170, 20);
    s.kick(-1.6);
    let maxAbs = 0;
    for (let i = 0; i < fps * 3; i++) { s.update(1 / fps); maxAbs = Math.max(maxAbs, Math.abs(s.value)); }
    assert.ok(Number.isFinite(s.value), `finite at ${fps} fps`);
    assert.ok(maxAbs < 0.2, `dip stays small at ${fps} fps (${maxAbs.toFixed(3)})`);
    assert.ok(Math.abs(s.value) < 1e-3, `settles at ${fps} fps`);
  }
});

// R3 regression (Blake: "the buildings are see-through"): an angled building's mesh was wound inside out, so the
// GPU culled its outside faces. Every triangle must face out of the prism (Babylon: clockwise seen from outside).
test("angled-building prisms face outward (walls, roof and floor), so they aren't see-through", () => {
  const scene = new Scene(new NullEngine());
  const P: [number, number][] = [[0, 0], [6, 0], [5, 4], [1, 5]]; // (counter-clockwise on x/z, like Box.poly)
  for (const grow of [0, 0.25]) {
    const m = footPrism(scene, P, 0, 6, grow);
    const pos = m.getVerticesData(VertexBuffer.PositionKind)!, idx = m.getIndices()!;
    const cx = 3, cy = 3, cz = 2.25;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      // Babylon is left-handed: a front face's u x v (right-handed maths) points INTO the solid, so outward = -(u x v)
      const nx = -(uy * vz - uz * vy), ny = -(uz * vx - ux * vz), nz = -(ux * vy - uy * vx);
      const mx = (pos[a] + pos[b] + pos[c]) / 3 - cx, my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy, mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
      assert.ok(nx * mx + ny * my + nz * mz > 0, `triangle ${t / 3} (grow ${grow}) faces out`);
    }
  }
});
