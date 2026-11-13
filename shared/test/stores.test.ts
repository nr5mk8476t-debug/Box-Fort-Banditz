// R13 / R13b: the six stores' trade at the counters, through the real actions (walk up, press E): money, hands, mashing
// E, two customers at once, a keeper knocked out, the rummage spots, shoplifting heat by district, a new round, a player
// leaving mid-visit. (Blake: "test insufficient funds, full inventory, repeated input, simultaneous customers,
// disconnects, resets")
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, STORES, storeFrame, STORE_SHELLS, STORE_TRADE, STORE_BUY_GAP, SPRITZ_HEAT, FEVER, LOOT, type StoreId } from "../src/index.js";

function settle(w: World, seconds = 1) { for (let i = 0; i < seconds * 60; i++) w.tick(); }
function storeWorld(players = 1) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 5, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.resetCity(false);
  w.takeEvents();
  return { w, ps };
}
const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];
const def = (id: StoreId) => STORES.find((s) => s.id === id)!;
/** stand at the counter, the customer's side, facing it (k: a step along it, for a second customer) */
function atCounter(w: World, pid: string, id: StoreId, k = 0) {
  const f = storeFrame(def(id)), [c0, c1, cv0] = STORE_SHELLS[id].counter, p = f.at((c0 + c1) / 2 + k, cv0 - 0.6), q = f.at((c0 + c1) / 2 + k, cv0 + 1);
  w.debugTeleport(pid, p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z), 0.2);
  settle(w, 0.3); w.takeEvents();
}
function holdNew(w: World, pid: string, type: string, value: number) {
  const pl = w.players.get(pid)!;
  const id = w.placeItem(type, pl.move.x, pl.move.y + 0.3, pl.move.z);
  w.items.get(id)!.value = value;
  w.action(pid, { a: "grab", item: id }); settle(w, 0.4);
  const slot = pl.pockets.indexOf(id);
  if (slot >= 0) w.action(pid, { a: "select", slot });
  assert.equal(w.activeItem(pl)?.item.id, id, `holds the ${type}`);
  return id;
}
const use = (w: World, pid: string, id: StoreId) => w.action(pid, { a: "use", prop: "storecounter_" + id });

test("R13 stores: every counter can be reached from the shop floor and answers (sell, buy, or says why not)", () => {
  const { w } = storeWorld();
  for (const s of STORES) {
    atCounter(w, "p0", s.id);
    w.players.get("p0")!.cash = 500;
    use(w, "p0", s.id);
    const es = w.takeEvents();
    assert.ok(ev(es, "storeBought").length + ev(es, "storeNo").length + ev(es, "storeSold").length > 0, `${s.id}: the counter answered`);
    settle(w, STORE_BUY_GAP + 0.2);
  }
});

test("R13 stores: not enough money buys nothing and takes nothing; enough buys exactly one", () => {
  const { w } = storeWorld();
  const a = w.players.get("p0")!;
  atCounter(w, "p0", "peakfomo");
  const price = STORE_TRADE.peakfomo.sells!.price;
  a.cash = price - 1;
  use(w, "p0", "peakfomo");
  const es = w.takeEvents();
  assert.ok(ev(es, "storeNo").some((e) => e.reason === "broke"), "broke");
  assert.equal(ev(es, "storeBought").length, 0);
  assert.equal(a.cash, price - 1, "kept their money");
  a.cash = 100; use(w, "p0", "peakfomo");
  assert.equal(ev(w.takeEvents(), "storeBought").length, 1);
  assert.equal(a.cash, 100 - price);
  assert.ok(a.move.boostT > FEVER.boost - 1, "the trail mix's stamina");
});

test("R13 stores: mashing E buys once per second (no double charges), then again after the gap", () => {
  const { w } = storeWorld();
  const a = w.players.get("p0")!;
  atCounter(w, "p0", "bonbon");
  a.cash = 200;
  for (let i = 0; i < 6; i++) { use(w, "p0", "bonbon"); w.tick(); }
  assert.equal(ev(w.takeEvents(), "storeBought").length, 1, "one truffle");
  assert.equal(a.cash, 200 - STORE_TRADE.bonbon.sells!.price);
  settle(w, STORE_BUY_GAP + 0.1);
  use(w, "p0", "bonbon");
  assert.equal(ev(w.takeEvents(), "storeBought").length, 1, "and another after the gap");
});

test("R13 stores: selling: the specialist pays for its kind of thing once (mash E), refuses the wrong thing and keeps it out of your hands' way", () => {
  const { w } = storeWorld();
  const a = w.players.get("p0")!;
  atCounter(w, "p0", "needledrop");
  a.cash = 0;
  holdNew(w, "p0", "vinyl_record", 40);
  for (let i = 0; i < 5; i++) { use(w, "p0", "needledrop"); w.tick(); }
  const es = w.takeEvents();
  assert.equal(ev(es, "storeSold").length, 1, "paid once");
  assert.equal(a.cash, Math.round(40 * STORE_TRADE.needledrop.buys!.mult!));
  assert.ok(!w.activeItem(a), "the record's gone");
  const wrong = LOOT.find((d) => !d.money && !d.blackMarket && !STORE_TRADE.needledrop.buys!.types!.includes(d.type) && d.size === "small")!;
  holdNew(w, "p0", wrong.type, 30);
  use(w, "p0", "needledrop");
  assert.ok(ev(w.takeEvents(), "storeNo").some((e) => e.reason === "wrong"), "wrong thing: no");
  assert.ok(w.activeItem(a), "and you still have it");
  // empty hands at a shop that only buys: it tells you what it wants
  w.action("p0", { a: "drop" }); settle(w, 0.5); w.takeEvents();
  use(w, "p0", "needledrop");
  assert.ok(ev(w.takeEvents(), "storeNo").some((e) => e.reason === "hands"));
});

test("R13 stores: two customers at the same counter in the same tick: each served once, each charged once", () => {
  const { w } = storeWorld(2);
  const [a, b] = [w.players.get("p0")!, w.players.get("p1")!];
  atCounter(w, "p0", "maisonpong", -0.7); atCounter(w, "p1", "maisonpong", 0.7);
  a.cash = b.cash = 100; a.notoriety = b.notoriety = 60;
  use(w, "p0", "maisonpong"); use(w, "p1", "maisonpong");
  const es = ev(w.takeEvents(), "storeBought");
  assert.deepEqual(es.map((e) => e.p).sort(), ["p0", "p1"]);
  const price = STORE_TRADE.maisonpong.sells!.price;
  assert.equal(a.cash, 100 - price); assert.equal(b.cash, 100 - price);
  assert.equal(a.notoriety, 60 - SPRITZ_HEAT); assert.equal(b.notoriety, 60 - SPRITZ_HEAT);
});

test("R13 stores: a keeper knocked out or cowering shuts the counter; a new round opens it again", () => {
  const { w } = storeWorld();
  const a = w.players.get("p0")!;
  atCounter(w, "p0", "plugpray");
  const shop = w.arena.shops!.find((s) => s.name === def("plugpray").name)!;
  const keeper = w.npc.cashierOf(shop.id)!;
  keeper.state = "ko"; keeper.stateT = 30;
  holdNew(w, "p0", "crt_tv", 50);
  use(w, "p0", "plugpray");
  assert.ok(ev(w.takeEvents(), "storeNo").some((e) => e.reason === "shut"), "shut");
  assert.equal(a.cash, 0);
  w.resetCity(false); settle(w, 0.5); w.takeEvents();
  assert.notEqual(w.npc.cashierOf(shop.id)!.state, "ko", "back at work next round");
});

test("R13 stores: a rummage spot gives once a day, even with full pockets (the finds land on the floor, not lost), and refills next round", () => {
  const { w } = storeWorld();
  const a = w.players.get("p0")!;
  for (const id of ["rustbucket", "needledrop"] as const) {
    const d = w.arena.props!.find((p) => p.id === "storedig_" + id)!;
    w.debugTeleport("p0", d.x, d.z - 1.0, 0, 0.2); settle(w, 0.3);
    for (let i = 0; i < a.pockets.length; i++) a.pockets[i] = a.pockets[i] || "full-" + i; // (pockets full)
    const n0 = w.items.size;
    w.action("p0", { a: "use", prop: d.id }); settle(w, 1.5);
    assert.ok(w.items.size > n0, `${id}: something turned up`);
    const n1 = w.items.size;
    w.action("p0", { a: "use", prop: d.id }); settle(w, 1.5);
    assert.equal(w.items.size, n1, `${id}: once a day`);
    for (let i = 0; i < a.pockets.length; i++) if (a.pockets[i].startsWith("full-")) a.pockets[i] = "";
  }
  w.resetCity(false); settle(w, 0.5);
  const d = w.arena.props!.find((p) => p.id === "storedig_rustbucket")!;
  w.debugTeleport("p0", d.x, d.z - 1.0, 0, 0.2); settle(w, 0.3);
  const n2 = w.items.size;
  w.action("p0", { a: "use", prop: d.id }); settle(w, 1.5);
  assert.ok(w.items.size > n2, "a new round: it's been filled up again");
});

test("R13 stores: a player who leaves mid-visit takes nothing with them from the counter, and the next customer's served", () => {
  const { w } = storeWorld(2);
  atCounter(w, "p0", "bonbon", -0.7); atCounter(w, "p1", "bonbon", 0.7);
  w.players.get("p0")!.cash = 100;
  use(w, "p0", "bonbon");
  w.removePlayer("p0");
  settle(w, 0.2);
  const b = w.players.get("p1")!;
  b.cash = 100; use(w, "p1", "bonbon");
  assert.equal(ev(w.takeEvents(), "storeBought").filter((e) => e.p === "p1").length, 1);
  assert.equal(b.cash, 100 - STORE_TRADE.bonbon.sells!.price);
});
