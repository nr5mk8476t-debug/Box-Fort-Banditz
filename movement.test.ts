import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestArena, makeMoveState, stepMovement, sanitizeInput, horizontalSpeed, cloneMoveState, readMoveState, playerHeight,
  PLAYER, SIM_HZ, type MoveInput, type ArenaLayout,
} from "../src/index.js";

const empty: ArenaLayout = { halfSize: 50, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }] };

function input(p: Partial<MoveInput> = {}, seq = 0): MoveInput {
  return { seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p };
}

function run(s: ReturnType<typeof makeMoveState>, arena: ArenaLayout, seconds: number, inp: Partial<MoveInput>) {
  const n = Math.round(seconds * SIM_HZ);
  for (let i = 0; i < n; i++) stepMovement(s, input(inp, i), arena);
  return s;
}

test("walking forward reaches walk speed quickly and moves along +z at yaw 0", () => {
  const s = run(makeMoveState(0, 0), empty, 0.5, { mz: 1 });
  assert.ok(Math.abs(horizontalSpeed(s) - PLAYER.walkSpeed) < 1e-6, `speed ${horizontalSpeed(s)}`);
  assert.ok(s.z > 1.5 && Math.abs(s.x) < 1e-9, `pos ${s.x},${s.z}`);
});

test("sprinting is faster than walking; sprint does not apply walking backwards", () => {
  const a = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  assert.ok(Math.abs(horizontalSpeed(a) - PLAYER.sprintSpeed) < 1e-6);
  const b = run(makeMoveState(0, 0), empty, 1, { mz: -1, sprint: true });
  assert.ok(Math.abs(horizontalSpeed(b) - PLAYER.walkSpeed * PLAYER.backwardFactor) < 1e-6);
});

test("diagonal movement is not faster than straight movement", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, mx: 1 });
  assert.ok(horizontalSpeed(s) <= PLAYER.walkSpeed + 1e-6);
});

test("yaw 90 degrees turns forward into +x (left-handed Babylon convention)", () => {
  const s = run(makeMoveState(0, 0), empty, 0.5, { mz: 1, yaw: Math.PI / 2 });
  assert.ok(s.x > 1.5 && Math.abs(s.z) < 1e-6);
});

test("releasing keys decelerates to a stop", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1 });
  run(s, empty, 0.5, {});
  assert.equal(horizontalSpeed(s), 0);
});

test("cannot walk through a wall, and slides along it", () => {
  const arena: ArenaLayout = { ...empty, boxes: [{ x: 0, y: 1.5, z: 3, w: 10, h: 3, d: 1, kind: "wall" }] };
  // walk diagonally into wall at z = 2.5 (its near face)
  const s = run(makeMoveState(0, 0), arena, 1.2, { mz: 1, mx: 1 });
  assert.ok(s.z <= 2.5 - PLAYER.radius + 1e-3, `z=${s.z}`);
  assert.ok(s.x > 2.5, `should slide along wall, x=${s.x}`);
});

test("walks up a low curb automatically but is blocked by a tall crate", () => {
  const arena: ArenaLayout = {
    ...empty,
    boxes: [
      { x: 0, y: 0.125, z: 3, w: 4, h: 0.25, d: 2, kind: "curb" },
      { x: 10, y: 1, z: 3, w: 4, h: 2, d: 2, kind: "crate" },
    ],
  };
  const a = run(makeMoveState(0, 0), arena, 0.8, { mz: 1 });
  assert.ok(Math.abs(a.y - 0.25) < 1e-6 && a.grounded, `curb y=${a.y}`);
  const b = run(makeMoveState(10, 0), arena, 1.5, { mz: 1 });
  assert.ok(b.y === 0 && b.z < 2, `crate y=${b.y} z=${b.z}`);
});

test("jumping goes up, comes down, and holding jump does not bunny hop", () => {
  const s = makeMoveState(0, 0);
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(!s.grounded && s.vy > 0);
  let peak = 0;
  for (let i = 0; i < SIM_HZ * 2; i++) {
    stepMovement(s, input({ jump: true }), empty);
    peak = Math.max(peak, s.y);
  }
  assert.ok(s.grounded && s.y === 0, "landed");
  assert.ok(peak > 1 && peak < 1.4, `peak ${peak}`);
  // Still holding jump: must not jump again
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(s.grounded);
  // Release and press again: jumps
  stepMovement(s, input({ jump: false }), empty);
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(!s.grounded);
});

test("can jump onto a crate and walk off its edge", () => {
  const arena: ArenaLayout = { ...empty, boxes: [{ x: 0, y: 0.45, z: 3, w: 2, h: 0.9, d: 2, kind: "crate" }] };
  const s = makeMoveState(0, 0);
  let jumped = false;
  for (let i = 0; i < SIM_HZ * 1.2; i++) {
    const wantJump = s.z > 1.2 && !jumped;
    if (wantJump) jumped = true;
    stepMovement(s, input({ mz: s.z < 3 ? 1 : 0, jump: wantJump }), arena);
  }
  assert.ok(Math.abs(s.y - 0.9) < 1e-6 && s.grounded, `on crate y=${s.y}`);
  run(s, arena, 1.5, { mz: 1 });
  assert.ok(s.y === 0 && s.grounded && s.z > 5, "walked off and landed");
});

test("full test arena: player stays in bounds when running into corners", () => {
  const arena = buildTestArena();
  const s = makeMoveState(0, -22);
  run(s, arena, 6, { mz: -1, mx: -1, sprint: true });
  assert.ok(Math.abs(s.x) <= arena.halfSize && Math.abs(s.z) <= arena.halfSize);
});

test("determinism: identical inputs give bit-identical state (needed for reconciliation)", () => {
  const arena = buildTestArena();
  const seqs: MoveInput[] = [];
  let r = 1;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 600; i++) {
    seqs.push(input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6, sprint: rand() > 0.5, jump: rand() > 0.9 }, i));
  }
  const a = makeMoveState(0, -22);
  const b = makeMoveState(0, -22);
  for (const i of seqs) stepMovement(a, i, arena);
  // replay b in two halves with a clone in between, as reconciliation does
  for (const i of seqs.slice(0, 300)) stepMovement(b, i, arena);
  const c = cloneMoveState(b);
  for (const i of seqs.slice(300)) stepMovement(c, i, arena);
  assert.deepEqual(c, a);
});

test("sanitizeInput rejects junk and clamps values", () => {
  assert.equal(sanitizeInput(null), null);
  assert.equal(sanitizeInput({ seq: -3 } as any), null);
  assert.equal(sanitizeInput({ seq: 1.5 } as any), null);
  const v = sanitizeInput({ seq: 4, mx: 50, mz: 50, pitch: 99, yaw: NaN, sprint: "yes" as any, jump: true })!;
  assert.ok(Math.hypot(v.mx, v.mz) <= 1 + 1e-9);
  assert.equal(v.pitch, 1.5);
  assert.equal(v.yaw, 0);
  assert.equal(v.sprint, false);
  assert.equal(v.jump, true);
});

// ---------------------------------------------------------------- Phase 1 moves

test("momentum: stopping from a sprint takes a moment (weighty skid)", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  const z0 = s.z;
  run(s, empty, 0.15, {});
  assert.ok(horizontalSpeed(s) > 3, `still moving after 0.15 s: ${horizontalSpeed(s)}`);
  run(s, empty, 0.6, {});
  assert.equal(horizontalSpeed(s), 0);
  assert.ok(s.z - z0 > 1, "skidded forward");
});

test("stamina: sprinting drains it, empties to winded (walk speed), then refills at rest", () => {
  const s = makeMoveState(0, 0);
  let wasWinded = false, sprintWhileWinded = false, t = 0, windedFor = 0;
  for (let i = 0; i < 660; i++) {
    stepMovement(s, input({ mz: 1, sprint: true }, i), empty);
    windedFor = s.winded ? windedFor + 1 / 60 : 0;
    // allow ~0.25 s to coast down from sprint speed (momentum), then it must be walking pace
    if (s.winded) { wasWinded = true; if (windedFor > 0.25 && horizontalSpeed(s) > PLAYER.walkSpeed + 0.01) sprintWhileWinded = true; }
    if (!wasWinded) t = i / 60;
  }
  assert.ok(wasWinded, "ran out of stamina");
  assert.ok(t > 7.5 && t < 8.5, `~8 s of sprint before winded (${t.toFixed(2)} s)`);
  assert.ok(!sprintWhileWinded, "winded players can't sprint");
  run(s, empty, 3.5, {});
  assert.equal(s.stamina, 1);
  assert.ok(!s.winded);
});

test("crouch: slower, shorter, and you can't stand up under a low ceiling", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, crouch: true });
  assert.ok(s.crouching);
  assert.ok(Math.abs(horizontalSpeed(s) - PLAYER.crouchSpeed) < 1e-6);
  const tunnel = { ...empty, boxes: [{ x: 0, y: 1.4, z: 5, w: 4, h: 0.3, d: 4, kind: "slab" as const }] };
  // standing: blocked by slab edge
  const a = run(makeMoveState(0, 0), tunnel, 1.5, { mz: 1 });
  assert.ok(a.z < 3, `standing player blocked: z=${a.z}`);
  // crouching: fits under
  const b = run(makeMoveState(0, 0), tunnel, 1.8, { mz: 1, crouch: true });
  assert.ok(b.z > 3.5, `crouching player gets under: z=${b.z}`);
  // release crouch while under the slab: stays crouched
  run(b, tunnel, 0.2, {});
  assert.ok(b.crouching, "can't stand under the slab");
  // no jumping into the ceiling either
  stepMovement(b, input({ jump: true }), tunnel);
  assert.ok(b.grounded);
});

test("belly slide: sprint + crouch = fast slide that slows down, then cooldown", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  stepMovement(s, input({ mz: 1, sprint: true, crouch: true }), empty);
  assert.ok(s.slideT > 0, "slide started");
  assert.ok(horizontalSpeed(s) > PLAYER.sprintSpeed + 1, "slide is faster than sprint");
  run(s, empty, 1.2, { mz: 1, crouch: true });
  assert.equal(s.slideT, 0, "slide ended");
  assert.ok(s.crouching, "ends crouched while crouch held");
  // walking speed is too slow to slide
  const w = run(makeMoveState(0, 0), empty, 1, { mz: 1 });
  stepMovement(w, input({ mz: 1, crouch: true }), empty);
  assert.equal(w.slideT, 0);
});

test("jumping out of a slide keeps the momentum", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  stepMovement(s, input({ mz: 1, crouch: true }), empty);
  stepMovement(s, input({ mz: 1, crouch: true }), empty);
  stepMovement(s, input({ mz: 1, jump: true }), empty);
  assert.equal(s.slideT, 0);
  assert.ok(!s.grounded && horizontalSpeed(s) > PLAYER.sprintSpeed);
});

test("dodge: quick hop-dash sideways, costs stamina, has a cooldown", () => {
  const s = makeMoveState(0, 0);
  stepMovement(s, input({ mx: 1, dodge: true }), empty);
  assert.ok(s.dodgeT > 0 && !s.grounded);
  assert.ok(s.vx > 9, "dashing right");
  assert.ok(Math.abs(s.stamina - (1 - PLAYER.dodgeStamina)) < 0.01);
  run(s, empty, 0.5, { mx: 1, dodge: true }); // holding dodge doesn't repeat
  assert.ok(s.x > 2, `dodged ${s.x}m`);
  assert.ok(s.dodgeCd > 0, "cooldown running");
  stepMovement(s, input({ mx: 1 }), empty);
  stepMovement(s, input({ mx: 1, dodge: true }), empty);
  assert.equal(s.dodgeT, 0, "can't dodge during cooldown");
  // with no direction held, dodge goes forward
  const f = makeMoveState(0, 0);
  stepMovement(f, input({ dodge: true }), empty);
  assert.ok(f.vz > 9);
});

test("mantle: climbs waist, chest and head-high ledges; not too-high walls", () => {
  for (const h of [0.9, 1.4, 1.95]) {
    const arena = { ...empty, boxes: [{ x: 0, y: h / 2, z: 2, w: 3, h, d: 2, kind: "ledge" as const }] };
    const s = run(makeMoveState(0, 0), arena, 0.6, { mz: 1 }); // walk up to it
    stepMovement(s, input({ mz: 1, jump: true }), arena);
    assert.ok(s.mantleT > 0, `mantle started on ${h}m ledge`);
    run(s, arena, 0.8, { jump: true }); // let go of forward so we don't walk off the far side
    assert.ok(Math.abs(s.y - h) < 1e-6 && s.grounded, `on top of ${h}m ledge (y=${s.y})`);
  }
  const wall = { ...empty, boxes: [{ x: 0, y: 1.5, z: 2, w: 3, h: 3, d: 2, kind: "wall" as const }] };
  const w = run(makeMoveState(0, 0), wall, 0.6, { mz: 1 });
  stepMovement(w, input({ mz: 1, jump: true }), wall);
  assert.equal(w.mantleT, 0, "3m wall is not climbable");
});

test("mantle is refused when there's no room on top", () => {
  const arena = { ...empty, boxes: [
    { x: 0, y: 0.5, z: 2, w: 3, h: 1, d: 2, kind: "ledge" as const },
    { x: 0, y: 1.5, z: 2.5, w: 3, h: 1, d: 1.2, kind: "crate" as const },
  ] };
  const s = run(makeMoveState(0, 0), arena, 0.6, { mz: 1 });
  stepMovement(s, input({ mz: 1, jump: true }), arena);
  assert.equal(s.mantleT, 0);
});

test("big fall = comedy stumble (slowed briefly), small hop = no stumble", () => {
  const drop = { ...empty, boxes: [{ x: 0, y: 2, z: 0, w: 2, h: 4, d: 2, kind: "platform" as const }] };
  const s = makeMoveState(0, 0);
  s.y = 4;
  run(s, drop, 1.5, { mz: 1 });
  assert.ok(s.grounded && s.y === 0);
  // landed and stumbled at some point: check by replaying and watching stumbleT
  const t = makeMoveState(0, 0); t.y = 4;
  let stumbled = false;
  for (let i = 0; i < 90; i++) { stepMovement(t, input({ mz: 1 }, i), drop); if (t.stumbleT > 0) stumbled = true; }
  assert.ok(stumbled, "stumbled after a 4 m drop");
  const j = makeMoveState(0, 0);
  let sj = false;
  stepMovement(j, input({ jump: true }), empty);
  for (let i = 0; i < 90; i++) { stepMovement(j, input({}, i), empty); if (j.stumbleT > 0) sj = true; }
  assert.ok(!sj, "normal jump doesn't stumble");
});

test("determinism with all Phase 1 moves mixed in", () => {
  const arena = buildTestArena();
  const seqs: MoveInput[] = [];
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) {
    seqs.push(input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6, sprint: rand() > 0.3,
      jump: rand() > 0.85, crouch: rand() > 0.8, dodge: rand() > 0.93 }, i));
  }
  const a = makeMoveState(-10, -14);
  const b = makeMoveState(-10, -14);
  for (const i of seqs) stepMovement(a, i, arena);
  for (const i of seqs.slice(0, 700)) stepMovement(b, i, arena);
  const c = readMoveState({ ...b });
  for (const i of seqs.slice(700)) stepMovement(c, i, arena);
  assert.deepEqual(c, a);
});

test("never ends up inside a box, whatever you press (fuzz)", () => {
  const arena = buildTestArena();
  let r = 99;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let run_ = 0; run_ < 20; run_++) {
    const sp = arena.spawns[run_ % 4];
    const s = makeMoveState(sp.x + rand() * 30 - 15, sp.z + rand() * 30);
    for (let i = 0; i < 900; i++) {
      stepMovement(s, input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6.28, sprint: rand() > 0.3,
        jump: rand() > 0.8, crouch: rand() > 0.85, dodge: rand() > 0.95 }, i), arena);
      if (s.mantleT > 0) continue;
      const h = playerHeight(s);
      for (const b of arena.boxes) {
        const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
        const insideY = s.y + 0.05 < top && s.y + h - 0.05 > bottom;
        const insideXZ = Math.abs(s.x - b.x) < b.w / 2 - 0.05 && Math.abs(s.z - b.z) < b.d / 2 - 0.05;
        assert.ok(!(insideY && insideXZ), `run ${run_} step ${i}: inside ${b.kind} at ${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`);
      }
      assert.ok(Number.isFinite(s.x + s.y + s.z) && s.y >= -1e-9, "finite and above ground");
    }
  }
});
