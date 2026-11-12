// R12.9: Seamus's snug has a real wooden door (Blake: "a wooden door and... a neon light saying Seamus's snug").
import { test } from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, inFoot } from "../src/index.js";

function settle(w: World, seconds = 1) { for (let i = 0; i < Math.round(seconds * 60); i++) w.tick(); }
function pubWorld() {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 3, npcs: 0, spawnLoot: false, arena });
  w.addPlayer("p0", "P0"); w.resetCity(false); w.takeEvents();
  return { w, arena };
}

test("R12.9 the snug's door: shut, it blocks the doorway; E opens it; it swings shut by itself, but not on someone standing in it", () => {
  const { w, arena } = pubWorld();
  const ps = w.props.props.get("snugdoor")!, d = ps.def, box = arena.boxes[d.box!];
  assert.ok(ps && d.kind === "door" && d.door === "wood" && d.closer === 4, "a wooden door with a closer");
  assert.ok(!box.off && inFoot(box, d.x, d.z), "shut: its leaf fills the doorway");
  // on the landing side, facing the door
  w.debugTeleport("p0", d.x - 0.9, d.z, Math.PI / 2, d.y - 1.3); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "use", prop: "snugdoor" });
  assert.ok(w.takeEvents().some((e) => e.t === "door" && (e as any).prop === "snugdoor" && (e as any).open), "E opens it");
  assert.ok(box.off, "open: you can walk through");
  // stand in the doorway past the closer's time: it waits
  w.debugTeleport("p0", d.x, d.z, Math.PI / 2, d.y - 1.3); settle(w, 5);
  assert.ok(box.off, "it doesn't shut on you");
  // walk on into the snug: it swings shut behind you
  w.debugTeleport("p0", d.x + 2.0, d.z + 1.5, Math.PI / 2, d.y - 1.3); settle(w, 5);
  assert.ok(!box.off, "shut again by itself");
  assert.ok(w.takeEvents().some((e) => e.t === "door" && (e as any).prop === "snugdoor" && !(e as any).open));
});
