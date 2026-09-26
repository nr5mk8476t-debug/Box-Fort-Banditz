import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRoomCode, isValidRoomCode, normalizeRoomCode, sanitizeName, NAME_MAX_LENGTH } from "../src/index.js";

test("room codes are valid, and normalizing handles lowercase and junk", () => {
  for (let i = 0; i < 200; i++) assert.ok(isValidRoomCode(makeRoomCode()));
  assert.equal(normalizeRoomCode(" ab-c2d9 "), "ABC2D");
  assert.ok(!isValidRoomCode("ABCD0")); // 0 is excluded as look-alike
});

test("names are cleaned and capped", () => {
  assert.equal(sanitizeName("  <b>Bob</b>  "), "bBob/b");
  assert.ok(sanitizeName("x".repeat(100)).length === NAME_MAX_LENGTH);
  assert.ok(sanitizeName("   ").length > 0);
  assert.ok(sanitizeName(42).length > 0);
});
