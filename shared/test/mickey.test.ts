// R12.6: WEE MICKEY, the night fence at THE SOGGY SHAMROCK's cellar door (Blake: "Night fence + gear").
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, type WorldEvent } from "../src/world.js";
import { buildTrashington } from "../src/city.js";
import { setCityMap as useCity, LOOT, MICKEY, PAWN_SHOP, inRect, nearBoxes, inFoot } from "../src/index.js";

function settle(w: World, seconds = 1) { for (let i = 0; i < seconds * 60; i++) w.tick(); }
function mickWorld(players = 1) {
  useCity("new"); const arena = buildTrashington(); useCity("classic");
  const w = new World({ seed: 9, npcs: 0, spawnLoot: false, arena });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  w.resetCity(false);
  w.takeEvents();
  return { w, ps, pub: arena.pub! };
}
const night = (w: World) => { w.match.phase = "night"; w.match.timeLeft = 999; };
const prop = (w: World, id: string) => w.props.props.get(id)!;
function stand(w: World, pid: string) {
  const M = w.arena.pub!.mickey!;
  w.debugTeleport(pid, M.x + Math.sin(M.yaw) * 1.1, M.z + Math.cos(M.yaw) * 1.1, M.yaw + Math.PI);
  w.players.get(pid)!.move.y = 0.1; settle(w, 0.3); w.takeEvents();
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
const ev = <T extends WorldEvent["t"]>(es: WorldEvent[], t: T) => es.filter((e) => e.t === t) as Extract<WorldEvent, { t: T }>[];

test("R12.6 Wee Mickey: in the pub's back yard by the cellar hatch, reachable, nothing blocking the way in", () => {
  const { w, pub } = mickWorld();
  const M = pub.mickey!;
  assert.ok(pub.yard && inRect(pub.yard, M.x, M.z), "in the yard behind the pub");
  assert.ok([...w.npc.npcs.values()].some((n) => n.kind === "wee_mickey"), "he's posted");
  assert.ok(prop(w, "mickey1") && prop(w, "mick_pick") && prop(w, "mick_smoke"));
  // the way in from the east street: the gap along the pub's back wall is clear at walking height
  for (let x = -83.5; x < -73.2; x += 0.5) {
    const blocked = nearBoxes(w.arena, x, pub.rect.maxZ + 0.5, 0.1).some((b) => inFoot(b, x, pub.rect.maxZ + 0.5) && b.y - b.h / 2 < 1.5 && b.y + b.h / 2 > 0.3 && b.kind !== "sidewalk");
    assert.ok(!blocked, `the gap at x=${x.toFixed(1)} is open`);
  }
});

test("R12.6 Wee Mickey: shut by day; at night he pays more than the pawn shops (x0.75), takes black-market pieces, and every deal is heat", () => {
  const { w } = mickWorld();
  const a = w.players.get("p0")!;
  w.match.phase = "scavenge"; w.match.timeLeft = 999;
  stand(w, "p0");
  holdNew(w, "p0", "gold_chain", 100);
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.ok(ev(w.takeEvents(), "mickeyNo").some((e) => e.reason === "day"), "by day: come back when it's dark");
  assert.equal(a.cash, 0);
  night(w);
  const heat0 = a.notoriety;
  w.action("p0", { a: "use", prop: "mickey1" });
  const f = ev(w.takeEvents(), "mickey")[0];
  assert.ok(f && f.what === "fenced", "fenced");
  assert.equal(a.cash, Math.round(100 * MICKEY.fence));
  assert.ok(a.cash > 100 * PAWN_SHOP.fence, "more than the pawn shops");
  assert.ok(a.notoriety > heat0, "a little heat");
  assert.ok(!w.activeItem(a), "it's gone from your hands");
  // the spoon of destiny: no legit shop takes it; Mickey does
  holdNew(w, "p0", "golden_spoon", 3000);
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.ok(ev(w.takeEvents(), "mickey").some((e) => e.what === "fenced" && "cash" in e && e.cash === Math.round(3000 * MICKEY.black)));
});

test("R12.6 Wee Mickey exploits: no selling money or junk, empty hands = nothing, mashing E pays once, too far = nothing", () => {
  const { w } = mickWorld();
  const a = w.players.get("p0")!;
  night(w); stand(w, "p0");
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.ok(ev(w.takeEvents(), "mickeyNo").some((e) => e.reason === "hands"));
  const junk = LOOT.find((d) => d.junk && !d.money && d.size !== "giant")!;
  holdNew(w, "p0", junk.type, 0);
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.ok(ev(w.takeEvents(), "mickeyNo").some((e) => e.reason === "junk"), "junk: no");
  w.action("p0", { a: "drop" }); settle(w, 0.5); w.takeEvents();
  holdNew(w, "p0", "gold_chain", 80);
  for (let i = 0; i < 5; i++) w.action("p0", { a: "use", prop: "mickey1" });
  assert.equal(ev(w.takeEvents(), "mickey").length, 1, "one item, one payment");
  assert.equal(a.cash, 60);
  // from across the yard: out of reach (the prop reach check)
  holdNew(w, "p0", "gold_chain", 80);
  w.debugTeleport("p0", w.arena.pub!.mickey!.x, w.arena.pub!.mickey!.z + 6, Math.PI); settle(w, 0.3); w.takeEvents();
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.equal(ev(w.takeEvents(), "mickey").length, 0, "too far");
  assert.equal(a.cash, 60);
});

test("R12.6 Wee Mickey's gear: one of each at a time, paid for; hit him and he shuts up shop", () => {
  const { w } = mickWorld();
  const a = w.players.get("p0")!;
  night(w);
  { const g = w.props.props.get("mick_pick")!.def; w.debugTeleport("p0", g.x + 0.3, g.z + 1.0, Math.PI); a.move.y = 0.1; settle(w, 0.3); w.takeEvents(); }
  a.cash = 10;
  w.action("p0", { a: "use", prop: "mick_pick" });
  assert.ok(ev(w.takeEvents(), "mickeyNo").some((e) => e.reason === "broke"));
  a.cash = 100;
  w.action("p0", { a: "use", prop: "mick_pick" });
  w.action("p0", { a: "use", prop: "mick_pick" });
  const es = w.takeEvents();
  assert.equal(ev(es, "mickey").length, 1); assert.ok(ev(es, "mickeyNo").some((e) => e.reason === "full"));
  assert.equal(a.gear.pick, 1); assert.equal(a.cash, 100 - MICKEY.goods.pick.price);
  w.action("p0", { a: "use", prop: "mick_smoke" });
  assert.equal(a.gear.smoke, 1);
  // a punch: shut for a while
  const mick = [...w.npc.npcs.values()].find((n) => n.kind === "wee_mickey")!;
  w.npc.hit(mick.id, "p0", a.move.x, a.move.z);
  stand(w, "p0");
  holdNew(w, "p0", "gold_chain", 80);
  w.action("p0", { a: "use", prop: "mickey1" });
  assert.ok(ev(w.takeEvents(), "mickeyNo").some((e) => e.reason === "shut"), "shut after a punch");
});

test("R12.6 gear works: the lockpick kit halves your stretch (once); the smoke bomb beats a cop's grab (once)", () => {
  const { w } = mickWorld();
  const a = w.players.get("p0")!;
  a.gear.pick = 1;
  w.police.bust(a, "test", false);
  const half = a.jailT;
  assert.ok(ev(w.takeEvents(), "gearUsed").some((e) => e.gear === "pick"));
  assert.equal(a.gear.pick, 0, "used up");
  for (const p of w.players.values()) { p.jailT = 0; p.lock = null; }
  w.police.bust(a, "test", false);
  assert.equal(half * 2, a.jailT, "half without it");
  a.jailT = 0; a.lock = null;
  // the smoke bomb: smokeOut (what the grab and the taser call) uses it once; you can't be seen for a moment
  a.gear.smoke = 1;
  assert.equal(w.smokeOut(a, "cop1"), true);
  assert.equal(w.smokeOut(a, "cop1"), false, "only one");
  assert.ok(ev(w.takeEvents(), "gearUsed").some((e) => e.gear === "smoke"));
});

test("R12.6 gear resets with the match (like cash)", () => {
  const { w } = mickWorld();
  const a = w.players.get("p0")!;
  a.gear = { pick: 1, smoke: 1 };
  w.match.phase = "over";
  assert.ok(w.match.start());
  assert.deepEqual(a.gear, { pick: 0, smoke: 0 });
});
