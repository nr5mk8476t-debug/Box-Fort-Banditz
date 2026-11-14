// R13.1: E has to be able to pick out everything the host answers a "use" for. R13's six counters were answered by
// PropSystem.use() but missing from the client's targeting list, so E never reached them. This reads use()'s own
// dispatch (every `d.kind === "..."` it tests) and checks each of those kinds, and every such prop in both maps,
// is in eUsable() (the till's the one exception: that's HOLD R, the robbery).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, eUsable, STORES, type PropKind } from "../src/index.js";

const src = readFileSync(fileURLToPath(new URL("../src/props.ts", import.meta.url)), "utf8");
const body = src.slice(src.indexOf("  use(p: PlayerSim, propId: string)"), src.indexOf("\n  }\n", src.indexOf("  use(p: PlayerSim, propId: string)")));
const handled = new Set([...body.matchAll(/d\.kind === "(\w+)"/g)].map((m) => m[1] as PropKind));
handled.delete("till" as PropKind);

test("R13.1 every kind the host's use() answers to can be targeted with E", () => {
  assert.ok(handled.size > 15, "read use()'s dispatch");
  for (const k of handled) assert.ok(eUsable(k), `${k}: the host answers it, E can't reach it`);
});

test("R13.1 all six store counters (both maps' props) are E targets", () => {
  for (const map of ["new", "classic"] as const) {
    useCity(map); const arena = buildTrashington(); useCity("classic");
    const counters = (arena.props ?? []).filter((p) => p.kind === "storecounter");
    if (map === "new") assert.equal(counters.length, STORES.length, "one per store");
    for (const c of counters) assert.ok(eUsable(c.kind), c.id);
    for (const p of arena.props ?? []) if (handled.has(p.kind)) assert.ok(eUsable(p.kind), p.id);
  }
});
