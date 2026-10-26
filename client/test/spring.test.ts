import { test } from "node:test";
import assert from "node:assert/strict";
import { Spring } from "../src/game/spring.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { footPrism } from "../src/game/cityRenderer.ts";

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
