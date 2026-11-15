// R14: STORE SECURITY at CARAT & RUN and MAISON PONG (loop/security.ts): warn, shove, chase (10 s, 25 m), tackle + take it back
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, SECURITY, inRect } from "../src/index.js";

const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
function sWorld() {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 0, spawnLoot: false, arena });
  const p = w.addPlayer("p0", "P0");
  w.takeEvents();
  return { w, p };
}

test("R14 security: one heavy inside each high-end store, beside the door (not in it, not in the street)", () => {
  const { w } = sWorld();
  const hs = [...w.npc.npcs.values()].filter((n) => n.kind === "store_heavy");
  assert.equal(hs.length, 2);
  for (const h of hs) {
    const shop = w.arena.shops!.find((s) => s.id === h.shop)!;
    assert.ok(["CARAT & RUN", "MAISON PONG"].includes(shop.name), shop.name);
    assert.ok(inRect(shop.rect, h.move.x, h.move.z, 0), `${shop.name}: inside`);
    const st = w.arena.stores!.find((s) => s.name === shop.name)!;
    const d = Math.hypot(h.move.x - st.door.x, h.move.z - st.door.z);
    assert.ok(d > 1.2 && d < 3, `${shop.name}: beside the door (${d.toFixed(2)} m)`);
  }
});

test("R14 security: lift = warning; at them with it = shove; out the door = chase; tackled = it goes back; the leash", () => {
  const { w, p } = sWorld();
  const h = [...w.npc.npcs.values()].find((n) => n.kind === "store_heavy")!;
  const shop = w.arena.shops!.find((s) => s.id === h.shop)!;
  const st = w.arena.stores!.find((s) => s.name === shop.name)!;
  const hold = (type: string) => { const id = w.placeItem(type, p.move.x, 1, p.move.z); const it = w.items.get(id)!; it.holder = p.id; it.mode = "held" as never; p.hand = id; return id; };
  // inside, near the counter
  p.move.x = (shop.rect.minX + shop.rect.maxX) / 2; p.move.z = (shop.rect.minZ + shop.rect.maxZ) / 2;
  let id = hold("gold_chain");
  w.security.lifted(p.id, shop.id, id);
  assert.equal(ev(w.takeEvents(), "secWarn").length, 1);
  // walk into the security with it
  p.move.x = h.move.x + 0.8; p.move.z = h.move.z; w.time += 2; w.security.tick();
  assert.equal(ev(w.takeEvents(), "secShove").length, 1, "shoved");
  // out of the door
  p.move.x = st.door.x + (st.door.x - h.move.x) * 2; p.move.z = st.door.z + (st.door.z - h.move.z) * 2;
  assert.ok(!inRect(shop.rect, p.move.x, p.move.z, 0.3));
  w.security.tick();
  assert.equal(ev(w.takeEvents(), "secChase").length, 1); assert.equal(h.state, "chase");
  // the tackle
  (w.npc as any).host.npcHitPlayer(h.id, p.id);
  assert.ok(p.move.knockT > 0, "down");
  const es = w.takeEvents();
  assert.deepEqual(ev(es, "secRetrieve")[0]?.types, ["gold_chain"]); assert.equal(w.items.has(id), false, "back to the store");
  // the leash: 25 m from the door and they give up
  p.move.knockT = 0; p.move.immuneT = 0; h.state = "work";
  p.move.x = (shop.rect.minX + shop.rect.maxX) / 2; p.move.z = (shop.rect.minZ + shop.rect.maxZ) / 2;
  id = hold("gold_chain"); w.security.lifted(p.id, shop.id, id);
  p.move.x = st.door.x + (st.door.x - h.move.x) * 2; p.move.z = st.door.z + (st.door.z - h.move.z) * 2;
  w.security.tick(); assert.equal(h.state, "chase");
  const dx = st.door.x - h.move.x, dz = st.door.z - h.move.z, l = Math.hypot(dx, dz);
  p.move.x = st.door.x + (dx / l) * (SECURITY.leash + 4); p.move.z = st.door.z + (dz / l) * (SECURITY.leash + 4);
  for (let i = 0; i < 30; i++) w.tick();
  assert.notEqual(h.state, "chase", "gave up past the leash");
  for (let i = 0; i < 10; i++) w.tick();
  assert.equal(w.items.has(id), true, "it's yours now");
});
