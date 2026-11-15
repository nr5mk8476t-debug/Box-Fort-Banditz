// R15: the shops ARE the loot (shopStock.ts): no street spawns on the new map; each store's shelves and counter rolled
// each cycle; taking makes exactly one item; two players on one thing; counters sell and never buy; restock without
// duplicates; every category the upgrades, recipes and boss jobs need is on some shelf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, lootDef, STORE_STOCK, parseStockNote, itemCategory, UPGRADES, RECIPES, BOSS_JOBS, type ItemCategory } from "../src/index.js";

const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
const skip = (w: World) => { w.match.timeLeft = 0.001; w.tick(); };
const toPhase = (w: World, ph: string, max = 12) => { for (let i = 0; i < max && w.match.phase !== ph; i++) skip(w); assert.equal(w.match.phase, ph); };
function sWorld(map: "new" | "classic" = "new", seed = 4, n = 2) {
  useCity(map); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed, npcs: 0, arena });
  const ps = []; for (let i = 0; i < n; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.startMatch(); toPhase(w, "scavenge"); w.takeEvents();
  return { w, ps };
}
const loose = (w: World) => [...w.items.values()].filter((it) => it.mode === "free" && it.shop < 0 && !lootDef(it.type).junk && !lootDef(it.type).npcOnly && it.type !== "cell_key");
/** stand right in front of a slot */
const atSlot = (w: World, p: any, store: string, i: number) => { const s = w.stock.of(store)!.slots[i]; p.move.x = s.x + 0.8; p.move.z = s.z; p.move.y = Math.max(0, s.y - 1.2); };
const firstStocked = (w: World, store: string, pred = (_t: string) => true) => w.stock.of(store)!.things.findIndex((t) => !!t && !t.taken && pred(t.type));

test("R15 the new map: no street loot; tills stay; the classic map keeps its spawns", () => {
  const { w } = sWorld();
  assert.equal(loose(w).length, 0, `nothing loose in the street (${loose(w).map((i) => i.type).join(",")})`);
  for (let i = 0; i < 60 * 30; i++) w.tick();
  assert.equal(loose(w).length, 0, "and none tops up during the day");
  assert.ok([...w.items.values()].some((it) => it.type === "cash_register"), "the tills are still there to hold up");
  const sv = w.stock.shelfValue(); assert.ok(sv.n >= 60, `the stores are stocked (${sv.n} things, $${sv.v})`);
  const c = sWorld("classic");
  assert.ok(loose(c.w).length > 30, "the classic map still spawns street loot");
});

test("R15 rolls: inside the tables (counts, per-type maxes), giants on the floor, deterministic per seed", () => {
  const a = sWorld("new", 7).w, b = sWorld("new", 7).w;
  for (const id of a.stock.storeIds()) {
    const s = a.stock.of(id)!, tab = STORE_STOCK[id];
    const things = s.things.filter(Boolean) as { type: string }[];
    assert.ok(things.length <= tab.n[1] && things.length <= s.slots.length, `${id}: ${things.length} things`);
    for (const [type, , max] of tab.stock) assert.ok(things.filter((t) => t.type === type).length <= max, `${id}: at most ${max} ${type}`);
    s.things.forEach((t, i) => { if (t && lootDef(t.type).size === "giant") assert.ok(s.slots[i].floor, `${id}: ${t.type} on the floor`); });
    assert.equal(a.stock.note(id), b.stock.note(id), `${id}: the same seed, the same shelves`);
    const n = parseStockNote(a.stock.note(id))!;
    assert.equal(n.shelves.length, s.slots.length); assert.equal(n.shelves.filter(Boolean).length, things.length);
  }
});

test("R15 taking: exactly one item, in your hands; two players on one thing: the first gets it; reach and hands checked", () => {
  const { w, ps } = sWorld();
  const [a, b] = ps, store = "plugpray";
  const i = firstStocked(w, store, (t) => lootDef(t).size === "small");
  assert.ok(i >= 0);
  const type = w.stock.of(store)!.things[i]!.type, n0 = w.items.size;
  b.move.x = a.move.x + 50; w.stock.take(b, store, i); assert.equal(ev(w.takeEvents(), "stockNo")[0]?.reason, "far");
  atSlot(w, a, store, i); atSlot(w, b, store, i);
  const id = w.stock.take(a, store, i);
  assert.ok(id); assert.equal(w.items.size, n0 + 1, "one item made");
  const it = w.items.get(id)!; assert.equal(it.type, type); assert.equal(it.holder, a.id); assert.ok(a.pockets.includes(id) || a.hand === id);
  assert.equal(w.stock.take(b, store, i), "", "the second player: gone"); assert.equal(ev(w.takeEvents(), "stockNo")[0]?.reason, "gone");
  assert.equal(w.items.size, n0 + 1, "still one");
  assert.equal(parseStockNote(w.stock.note(store))!.shelves[i], null, "off the shelf for everyone");
  // hands full: a big thing needs free hands
  const j = w.stock.of(store)!.things.findIndex((t) => !!t && !t.taken && lootDef(t.type).size === "big");
  if (j >= 0) { const hid = w.placeItem("brick", a.move.x, 1, a.move.z); const h = w.items.get(hid)!; h.holder = a.id; h.mode = "held" as never; a.hand = hid; atSlot(w, a, store, j); assert.equal(w.stock.take(a, store, j), ""); }
});

test("R15 the next cycle restocks: fresh shelves, nothing duplicated, what was taken stays taken (an item)", () => {
  const { w, ps } = sWorld();
  const store = "needledrop", i = firstStocked(w, store, (t) => lootDef(t).size === "small");
  atSlot(w, ps[0], store, i); const id = w.stock.take(ps[0], store, i); assert.ok(id);
  const before = w.stock.note(store);
  toPhase(w, "prep"); toPhase(w, "scavenge");
  const s = w.stock.of(store)!;
  assert.notEqual(w.stock.note(store), before, "re-rolled");
  assert.ok(s.things.every((t) => !t || !t.taken), "all fresh");
  assert.ok(s.things.filter(Boolean).length >= STORE_STOCK[store].n[0] || s.things.filter(Boolean).length === s.slots.length, "full again");
  assert.equal(loose(w).length, 0, "still nothing loose in the street");
});

test("R15 counters sell (a randomized handful, several of each) and never buy; charged once", () => {
  const { w, ps } = sWorld();
  const p = ps[0], store = "plugpray", s = w.stock.of(store)!;
  assert.ok(s.sale.length >= 1);
  const e = s.sale[0], st = w.arena.stores!.find((x) => x.id === store)!;
  p.move.x = (st.counter.minX + st.counter.maxX) / 2 + 1; p.move.z = (st.counter.minZ + st.counter.maxZ) / 2; p.cash = 0;
  w.stock.buy(p, store, e.type); assert.equal(ev(w.takeEvents(), "stockNo")[0]?.reason, "cash");
  p.cash = 1000; const left = e.left;
  const id = w.stock.buy(p, store, e.type);
  assert.ok(id); assert.equal(p.cash, 1000 - e.price, "charged once"); assert.equal(e.left, left - 1);
  for (let k = 0; k < 20; k++) { p.hand = ""; p.pockets.fill(""); w.stock.buy(p, store, e.type); }
  assert.equal(e.left, 0); assert.equal(p.cash, 1000 - e.price * left, "never more than were on offer");
  assert.ok(!("sellTo" in w.stock), "(no buying side at all)");
});

test("R15 every category the upgrades, recipes and boss jobs need is stocked somewhere (and the hardware is the construction shop)", () => {
  const need = new Set<ItemCategory>();
  for (const u of UPGRADES) for (const k of Object.keys(u.items)) need.add(k as ItemCategory);
  for (const r of RECIPES) for (const k of Object.keys(r.items)) need.add(k as ItemCategory);
  for (const j of BOSS_JOBS) if (j.obj.cat && j.obj.cat !== "any" && j.obj.cat !== "giant") need.add(j.obj.cat as ItemCategory);
  const have = new Map<ItemCategory, string[]>();
  for (const [id, tab] of Object.entries(STORE_STOCK)) for (const [type] of tab.stock) { const c = itemCategory(type, lootDef(type)); have.set(c, [...(have.get(c) ?? []), id]); }
  for (const c of need) assert.ok(have.has(c), `${c} is on some shelf`);
  const hw = STORE_STOCK.lastscrew.stock.map(([t]) => itemCategory(t, lootDef(t)));
  assert.ok(hw.filter((c) => c === "construction").length >= 10, "LAST SCREW is the place for construction supplies");
  for (const [, tab] of Object.entries(STORE_STOCK)) for (const [type] of tab.stock) assert.ok(lootDef(type).type === type, `${type} is a real item`);
});
