// R15: SHOP STOCK. On the new map the shops ARE the city's loot (Blake: "i don't want street spawns anymore because it
// doesn't make sense how there is a TV on the street. shops spawns from now on and there needs to be more abundant loot
// in the stores. with different variety"). Each store, every cycle:
//  - its SHELVES: a randomized mix from its stock table (several kinds, several of each), 15-25 things where it has the
//    room, in its slots (shelf slots take small/big things, floor slots anything). Not world items: data, drawn as shared
//    instanced models. Taking one makes exactly one real item, in your hands, and counts as shoplifting
//    (props.onShopGrab: staff yell, STORE SECURITY's history).
//  - its COUNTER: a randomized handful FOR SALE (a few kinds, several of each). Counters never buy (Blake: no counter
//    that buys back its own stolen stock).
// Restocked at each cycle's reset (World.stockShops), never topped up in between. Synced through the store counter's
// prop note (`stateOf`): one compact string per store, rebuilt only when it changes.
import type { World, PlayerSim } from "./world.js";
import { lootDef, rollValue, type LootDef } from "./loot.js";
import { STORES, STORE_FIXTURES, storeFrame, STORE_FLOOR, type StoreId } from "./stores.js";
import { hyp } from "./fmath.js";

export type StockEvent =
  | { t: "stockNo"; p: string; reason: string }
  | { t: "stockTaken"; p: string; store: string; slot: number; item: string; type: string }
  | { t: "stockBought"; p: string; store: string; type: string; price: number; item: string };

/** [type, weight, at most this many a cycle] */
export type StockEntry = [string, number, number];
export interface StoreStock {
  /** how many things on the shelves a cycle (capped by the slots it has) */
  n: [number, number];
  stock: StockEntry[];
  /** the counter: how many kinds for sale, and [type, price, at most] (several of each, randomized) */
  sell?: { kinds: [number, number]; items: [string, number, number][] };
}

export const STORE_STOCK: Record<string, StoreStock> = {
  // ---- the R13 stores
  rustbucket: { n: [16, 22], stock: [["scrap_metal", 5, 4], ["pipe", 3, 3], ["pipe_fittings", 3, 3], ["brick", 3, 3], ["plank", 3, 3], ["bin_lid", 2, 2], ["traffic_cone", 2, 2], ["oil_barrel", 1, 1], ["toolbox", 1, 1], ["hammer", 1, 2]],
    sell: { kinds: [2, 3], items: [["duct_tape", 12, 3], ["bag_of_screws", 8, 3], ["scrap_metal", 9, 2]] } },
  plugpray: { n: [15, 20], stock: [["crt_tv", 2, 2], ["laptop", 2, 2], ["phone_handset", 3, 3], ["disposable_camera", 2, 2], ["fancy_earbuds", 2, 2], ["kettle", 3, 3], ["toaster", 3, 3], ["dj_headphones", 1, 1], ["smart_watch", 1, 1]],
    sell: { kinds: [1, 2], items: [["phone_handset", 18, 2], ["fancy_earbuds", 22, 2]] } },
  needledrop: { n: [15, 22], stock: [["vinyl_record", 8, 8], ["mixtape", 5, 5], ["golden_record", 1, 1], ["dj_headphones", 2, 2], ["guitar", 1, 1], ["mirror_ball", 1, 1]],
    sell: { kinds: [1, 2], items: [["mixtape", 8, 3], ["vinyl_record", 20, 2]] } },
  peakfomo: { n: [15, 22], stock: [["designer_hoodie", 4, 4], ["sunglasses", 3, 3], ["cursed_sneakers", 2, 2], ["designer_scarf", 3, 3], ["energy_drink", 3, 3], ["glow_stick", 2, 3]],
    sell: { kinds: [2, 3], items: [["energy_drink", 6, 4], ["sunglasses", 25, 2], ["glow_stick", 3, 4]] } },
  maisonpong: { n: [12, 16], stock: [["fancy_fizz", 4, 4], ["designer_scarf", 3, 3], ["gold_nose", 1, 1], ["silver_cutlery", 2, 2], ["macaron_box", 3, 3]] },
  caratrun: { n: [12, 16], stock: [["diamond_ring", 2, 2], ["gold_chain", 3, 3], ["pearl_necklace", 2, 2], ["rolecks_watch", 1, 1], ["cufflinks", 2, 3]] },
  // ---- R15: Blake's six
  lastscrew: { n: [18, 25], stock: [["duct_tape", 5, 4], ["liquid_nails", 5, 4], ["nails_box", 5, 4], ["hammer", 3, 3], ["handsaw", 3, 2], ["pipe", 3, 3], ["timber_bundle", 2, 2], ["pipe_fittings", 4, 4], ["scrap_metal", 2, 2], ["paint_tin", 3, 3], ["toolbox", 1, 1], ["plank", 3, 3], ["bag_of_screws", 3, 3], ["brick", 2, 2]],
    sell: { kinds: [3, 5], items: [["duct_tape", 12, 3], ["liquid_nails", 10, 3], ["nails_box", 8, 4], ["hammer", 15, 2], ["handsaw", 18, 1], ["pipe", 12, 2], ["plank", 10, 3]] } },
  crumbs: { n: [20, 25], stock: [["crisps", 5, 5], ["bread_loaf", 4, 3], ["milk_carton", 4, 3], ["instant_noodles", 5, 4], ["soda_can", 4, 4], ["energy_drink", 3, 3], ["candy_bar", 4, 4], ["canned_beans", 4, 4], ["donut", 2, 2], ["toilet_roll", 3, 2], ["washing_up", 3, 3], ["lottery_scratch", 1, 2]],
    sell: { kinds: [3, 5], items: [["energy_drink", 6, 4], ["crisps", 3, 5], ["candy_bar", 3, 5], ["soda_can", 3, 4], ["lottery_scratch", 5, 3], ["bread_loaf", 4, 2]] } },
  spincycle: { n: [16, 22], stock: [["laundry_bag", 5, 4], ["detergent", 5, 4], ["odd_sock", 4, 4], ["single_shoe", 2, 2], ["designer_hoodie", 2, 2], ["abandoned_bag", 2, 2], ["lost_ring", 1, 1], ["washing_up", 3, 3], ["novelty_undies", 2, 2], ["family_photo", 1, 1]],
    sell: { kinds: [2, 3], items: [["detergent", 5, 4], ["washing_up", 4, 3], ["odd_sock", 2, 4]] } },
  secondchance: { n: [16, 22], stock: [["table_lamp", 4, 3], ["bar_stool", 3, 3], ["cushion", 4, 4], ["vase", 3, 3], ["rug", 2, 2], ["kettle", 3, 2], ["toaster", 3, 2], ["armchair", 1, 1], ["cafe_chair", 2, 2], ["lava_lamp", 2, 2], ["snow_globe", 2, 2], ["mirror_ball", 1, 1]],
    sell: { kinds: [2, 4], items: [["cushion", 9, 3], ["table_lamp", 16, 2], ["vase", 14, 2], ["kettle", 14, 2]] } },
  overpriced: { n: [14, 18], stock: [["stand_mixer", 2, 2], ["espresso_machine", 2, 2], ["copper_pan", 4, 4], ["knife_block", 3, 3], ["designer_lamp", 2, 2], ["velvet_sofa", 1, 1], ["silver_cutlery", 3, 3], ["fancy_cheese", 2, 2]] },
  tickedoff: { n: [14, 18], stock: [["pocket_watch", 3, 3], ["cufflinks", 3, 3], ["smart_watch", 3, 3], ["rolecks_watch", 2, 2], ["gold_chain", 2, 2], ["watch_winder", 2, 2], ["grandfather_clock", 1, 1], ["diamond_ring", 1, 1]] },
};

/** a place on a store's shelves: shelf slots take small/big things, floor slots anything (giants, bulky) */
export interface StockSlot { x: number; y: number; z: number; floor: boolean }
/** [u0, u1, v, height, how many] = a row of slots from u0 to u1 at depth v; height 0 = the floor (bulky things) */
export type StockRack = [number, number, number, number, number];

/** the slots of a store: its explicit racks (stores.ts STORE_FIXTURES[id].racks) or, failing that, rows along the tops
 *  of its shelves (two rows on a deep shelf) */
export function stockSlots(id: string): StockSlot[] {
  const st = STORES.find((s) => s.id === id), fx = STORE_FIXTURES[id as StoreId];
  if (!st || !fx) return [];
  const fr = storeFrame(st), out: StockSlot[] = [];
  const row = (u0: number, u1: number, v: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) { const u = n === 1 ? (u0 + u1) / 2 : u0 + ((u1 - u0) * i) / (n - 1); const p = fr.at(u, v); out.push({ x: p.x, y: STORE_FLOOR + y, z: p.z, floor: y <= 0.05 }); }
  };
  const racks = (fx as { racks?: StockRack[] }).racks;
  if (racks) for (const [u0, u1, v, y, n] of racks) row(u0, u1, v, y, n);
  else for (const [u0, u1, v0, v1, h] of fx.shelves) {
    const lu = u1 - u0, lv = v1 - v0;
    if (lu >= lv) { const n = Math.max(1, Math.floor(lu / 0.42)); for (const v of lv > 0.8 ? [v0 + lv * 0.3, v0 + lv * 0.7] : [(v0 + v1) / 2]) row(u0 + 0.2, u1 - 0.2, v, h, n); }
    else { const n = Math.max(1, Math.floor(lv / 0.42)); for (const u of lu > 0.8 ? [u0 + lu * 0.3, u0 + lu * 0.7] : [(u0 + u1) / 2]) for (let i = 0; i < n; i++) { const v = v0 + 0.2 + ((lv - 0.4) * i) / Math.max(1, n - 1); const p = fr.at(u, v); out.push({ x: p.x, y: STORE_FLOOR + h, z: p.z, floor: false }); } }
  }
  return out;
}

const fits = (d: LootDef, s: StockSlot) => s.floor || d.size !== "giant";
const CARRY_REACH = 2.6;

interface Placed { type: string; value: number; taken: boolean }
interface StoreState { id: string; shop: number; slots: StockSlot[]; things: (Placed | null)[]; sale: { type: string; price: number; left: number }[]; v: number; note: string; noteV: number }

export class ShopStock {
  private stores = new Map<string, StoreState>();
  constructor(private w: World) {
    for (const st of this.w.arena.stores ?? []) {
      const shop = (this.w.arena.shops ?? []).find((s) => s.name === st.name)?.id ?? -1;
      this.stores.set(st.id, { id: st.id, shop, slots: stockSlots(st.id), things: [], sale: [], v: 1, note: "", noteV: 0 });
    }
  }
  /** is the shops-are-the-loot rule on (the new map)? */
  get active() { return !!this.w.arena.shopLoot; }
  storeIds() { return [...this.stores.keys()]; }
  of(id: string) { return this.stores.get(id); }

  /** every store: fresh shelves and a fresh counter (the cycle's reset) */
  roll() {
    const r = () => this.w.random();
    for (const s of this.stores.values()) {
      const tab = STORE_STOCK[s.id];
      s.things = s.slots.map(() => null); s.sale = []; s.v++;
      if (!tab) continue;
      const want = Math.min(s.slots.length, tab.n[0] + Math.floor(r() * (tab.n[1] - tab.n[0] + 1)));
      const count = new Map<string, number>();
      // free slots in a shuffled order, the floor ones first for whatever needs the floor
      const order = s.slots.map((_, i) => i).sort(() => r() - 0.5);
      for (let k = 0; k < want; k++) {
        const pool = tab.stock.filter(([t, , max]) => (count.get(t) ?? 0) < max);
        if (!pool.length) break;
        let tot = 0; for (const e of pool) tot += e[1];
        let x = r() * tot, pick = pool[pool.length - 1];
        for (const e of pool) { x -= e[1]; if (x <= 0) { pick = e; break; } }
        const d = lootDef(pick[0]);
        // giants on the floor; everything else on a shelf if there's room, else the floor
        const free = order.filter((i) => s.things[i] === null && fits(d, s.slots[i]));
        const at = d.size === "giant" ? free.find((i) => s.slots[i].floor) : free.find((i) => !s.slots[i].floor) ?? free[0];
        if (at === undefined) { count.set(pick[0], 99); continue; } // (nowhere it fits: not this one)
        s.things[at] = { type: pick[0], value: rollValue(d, r), taken: false };
        count.set(pick[0], (count.get(pick[0]) ?? 0) + 1);
      }
      if (tab.sell) {
        const kinds = tab.sell.kinds[0] + Math.floor(r() * (tab.sell.kinds[1] - tab.sell.kinds[0] + 1));
        const pool = tab.sell.items.slice();
        for (let k = 0; k < kinds && pool.length; k++) {
          const [type, price, max] = pool.splice(Math.floor(r() * pool.length), 1)[0];
          s.sale.push({ type, price, left: 1 + Math.floor(r() * max) });
        }
      }
    }
  }

  /** what's on the shelves now (untaken), for tests and the economy */
  shelfValue() { let n = 0, v = 0; for (const s of this.stores.values()) for (const t of s.things) if (t && !t.taken) { n++; v += t.value; } return { n, v }; }

  /** take slot `i` at `storeId`: one real item, in your hands; shoplifting where staff can see */
  take(p: PlayerSim, storeId: string, i: number): string {
    const no = (reason: string) => { this.w.emit({ t: "stockNo", p: p.id, reason }); return ""; };
    const s = this.stores.get(storeId), t = s?.things[i], slot = s?.slots[i];
    if (!s || !slot) return no("gone");
    if (!t || t.taken) return no("gone"); // (two at once: the first one's)
    if (p.move.knockT > 0 || p.jailT > 0) return no("cant");
    if (hyp(p.move.x - slot.x, p.move.z - slot.z) > CARRY_REACH || Math.abs(p.move.y + 1.2 - slot.y) > 2.2) return no("far");
    const d = lootDef(t.type);
    const pocket = d.size === "small" && p.pockets.includes("");
    if (!pocket && p.hand) return no("hands");
    t.taken = true; s.v++;
    const id = this.w.fort.give(p, t.type, t.value);
    const it = this.w.items.get(id);
    if (it) { it.from = storeId; it.shop = s.shop; if (s.shop >= 0) this.w.props.onShopGrab(p, it); }
    this.w.emit({ t: "stockTaken", p: p.id, store: storeId, slot: i, item: id, type: t.type });
    return id;
  }

  /** buy one of what the counter sells (paid once; the counter never buys) */
  buy(p: PlayerSim, storeId: string, type: string): string {
    const no = (reason: string) => { this.w.emit({ t: "stockNo", p: p.id, reason }); return ""; };
    const s = this.stores.get(storeId), e = s?.sale.find((x) => x.type === type);
    if (!s || !e || e.left <= 0) return no("soldout");
    const counter = (this.w.arena.stores ?? []).find((x) => x.id === storeId)?.counter;
    if (!counter || hyp(p.move.x - (counter.minX + counter.maxX) / 2, p.move.z - (counter.minZ + counter.maxZ) / 2) > 4.5) return no("far");
    if (p.cash < e.price) return no("cash");
    const d = lootDef(type);
    if (!(d.size === "small" && p.pockets.includes("")) && p.hand) return no("hands");
    p.cash -= e.price; e.left--; s.v++;
    const id = this.w.fort.give(p, type, rollValue(d, () => this.w.random()));
    this.w.emit({ t: "stockBought", p: p.id, store: storeId, type, price: e.price, item: id });
    return id;
  }

  /** the store's state for its counter's prop note: "type,value|...;saletype,price,left|..." (untaken shelves by slot:
   *  "" for an empty slot) */
  note(storeId: string): string {
    const s = this.stores.get(storeId);
    if (!s) return "";
    if (s.noteV !== s.v) {
      s.noteV = s.v;
      s.note = "S" + s.things.map((t) => (t && !t.taken ? `${t.type},${t.value}` : "")).join("|") + ";" + s.sale.map((e) => `${e.type},${e.price},${e.left}`).join("|");
    }
    return s.note;
  }
}

/** the client's side of a store note: the shelves (by slot) and the counter */
export function parseStockNote(note: string): { shelves: ({ type: string; value: number } | null)[]; sale: { type: string; price: number; left: number }[] } | null {
  if (!note || note[0] !== "S") return null;
  const [sh, sa] = note.slice(1).split(";");
  const shelves = (sh ? sh.split("|") : []).map((x) => { if (!x) return null; const [type, v] = x.split(","); return { type, value: Number(v) }; });
  const sale = (sa ? sa.split("|") : []).filter(Boolean).map((x) => { const [type, p, l] = x.split(","); return { type, price: Number(p), left: Number(l) }; });
  return { shelves, sale };
}
