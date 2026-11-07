// R12.5: interior areas (areas.ts): floors sorted right, the outside gap, the stairs, the light budget; and the pub (the
// worked example) is within its budget
import { test } from "node:test";
import assert from "node:assert/strict";
import { areaZone, floorVisible, checkAreaLights, LIGHT_BUDGET, type InteriorArea } from "../src/game/areas.ts";
import { buildTrashington, setCityMap } from "@bfb/shared";

const A: InteriorArea = {
  id: "test-shop", rect: { minX: 0, maxX: 20, minZ: 0, maxZ: 10 },
  floors: [{ y0: -1, y1: 4 }, { y0: 4, y1: 8 }],
  outside: { on: 60, off: 66 },
  between: [{ minX: 16, maxX: 20, minZ: 0, maxZ: 3 }],
  lights: [{ name: "l1", x: 5, y: 2.5, z: 5, color: "#ffffff", range: 10, intensity: 1, floor: 0 }],
};

test("R12.5 areas: pieces go in their floor by where their centre is; pieces in the walls or outside stay with the city", () => {
  assert.equal(areaZone(A, 100, 5, 1, 5), 100, "ground floor");
  assert.equal(areaZone(A, 100, 5, 5, 5), 101, "first floor");
  assert.equal(areaZone(A, 100, 0.2, 1, 5), -1, "in the wall: the shell, with the city");
  assert.equal(areaZone(A, 100, 30, 1, 5), -1, "outside");
});

test("R12.5 areas: from outside every floor shows within 60 m and hides past 66 (in between, it stays as it was: no flicker on the edge)", () => {
  for (const f of [0, 1]) {
    assert.equal(floorVisible(A, f, 10 + 40, 1.7, 5, false), true, "40 m out: shown");
    assert.equal(floorVisible(A, f, 10 + 63, 1.7, 5, false), false, "63 m: not switched on yet");
    assert.equal(floorVisible(A, f, 10 + 63, 1.7, 5, true), true, "63 m: not switched off yet");
    assert.equal(floorVisible(A, f, 10 + 70, 1.7, 5, true), false, "70 m: off");
  }
  // walking back and forth across the edge: one switch each way, not one a frame
  let on = false, flips = 0;
  for (let k = 0; k < 400; k++) { const d = 63 + Math.sin(k * 0.3) * 2.5, v = floorVisible(A, 0, 10 + d, 1.7, 5, on); if (v !== on) { flips++; on = v; } }
  assert.equal(flips, 0, "never reaches 60 or 66: no switching at all");
});

test("R12.5 areas: inside you see your own floor; on the stairs, both", () => {
  assert.deepEqual([floorVisible(A, 0, 5, 1.7, 5, true), floorVisible(A, 1, 5, 1.7, 5, true)], [true, false], "downstairs");
  assert.deepEqual([floorVisible(A, 0, 5, 5.7, 5, true), floorVisible(A, 1, 5, 5.7, 5, true)], [false, true], "upstairs");
  assert.deepEqual([floorVisible(A, 0, 18, 3, 1.5, true), floorVisible(A, 1, 18, 3, 1.5, true)], [true, true], "on the stairs");
});

test("R12.5 areas: the light budget catches too many, too far-reaching or misplaced lights; THE SOGGY SHAMROCK is within it", () => {
  assert.deepEqual(checkAreaLights(A), []);
  const many = { ...A, lights: Array.from({ length: LIGHT_BUDGET.perArea + 1 }, (_, i) => ({ ...A.lights![0], name: "l" + i, floor: i % 2 })) };
  assert.ok(checkAreaLights(many).some((w) => w.includes("budget")), "too many");
  assert.ok(checkAreaLights({ ...A, lights: [{ ...A.lights![0], range: 40 }] }).some((w) => w.includes("reaches")), "too far");
  assert.ok(checkAreaLights({ ...A, lights: [{ ...A.lights![0], floor: 5 }] }).some((w) => w.includes("isn't one of its floors")), "no such floor");
  // the pub's area as the city renderer builds it (the same numbers): 5 lamps, 2 on the ground floor, 3 upstairs
  setCityMap("new"); const P = buildTrashington().pub!;
  const pub: InteriorArea = { id: "pub", rect: P.rect, floors: [{ y0: -1, y1: P.y2 }, { y0: P.y2, y1: 20 }], outside: { on: 60, off: 66 },
    lights: [16, 10].map((range, i) => ({ name: "d" + i, x: 0, y: 0, z: 0, color: "#fff", range, intensity: 1, floor: 0 })).concat([12, 10, 13].map((range, i) => ({ name: "u" + i, x: 0, y: 0, z: 0, color: "#fff", range, intensity: 1, floor: 1 }))) };
  assert.deepEqual(checkAreaLights(pub), []);
});
