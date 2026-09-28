// Phase 3.5: loot sources around the city. Runs inside the World (server + solo).
//   - search (E): dumpsters and bins -> random junk (dumpsters sometimes hide a raccoon)
//   - smash (punch): phone booths, vending machines, parking meters, newspaper boxes, parked cars
//   - rob a shop: hold R at the till for 3 s (cash bundle), or grab (E) the whole cash register
//   - shoplifting: swipe something off a shelf while the cashier is watching -> they yell (heat)
// Every source refills after a while (parked cars: once per round). Loud things raise heat and
// set off alarms (the police will listen to those in Phase 4).
import { inRect, type PropDef, type PropKind } from "./arena.js";
import { pickWeighted } from "./npc.js";
import type { World, PlayerSim, ItemSim } from "./world.js";

export interface PropSim { def: PropDef; ready: boolean; t: number; alarmT: number; register: string; }

export const ROB_TIME = 3;
export const USE_RANGE = 2.4;

const REFILL: Record<PropKind, number> = { dumpster: 50, bin: 35, phone: 70, vending: 50, meter: 40, newsbox: 40, car: 1e9, till: 45 };
/** How far a prop's surface is from its centre (for punch / use reach). */
export const PROP_RADIUS: Record<PropKind, number> = { dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, meter: 0.15, newsbox: 0.3, car: 1.4, till: 0.3 };
export const SMASHABLE = new Set<PropKind>(["phone", "vending", "meter", "newsbox", "car"]);
export const SEARCHABLE = new Set<PropKind>(["dumpster", "bin"]);

const DUMPSTER_LOOT: [string, number][] = [
  ["pocket_lint", 3], ["half_sandwich", 4], ["newspaper", 4], ["soda_can", 3], ["candy_bar", 2], ["expired_coupon", 3],
  ["rubber_chicken", 2], ["mixtape", 2], ["trash_bag", 2], ["cursed_sneakers", 1], ["snow_globe", 0.6], ["mystery_wallet", 0.4],
  ["lucky_pigeon", 0.3], ["golden_spork", 0.15],
];
const BIN_LOOT: [string, number][] = [
  ["newspaper", 4], ["soda_can", 4], ["half_sandwich", 3], ["expired_coupon", 3], ["pocket_lint", 2], ["candy_bar", 1], ["coin_pile", 1], ["mixtape", 1],
];
const CAR_LOOT: [string, number][] = [
  ["phone_handset", 3], ["sunglasses", 3], ["mystery_wallet", 2], ["coin_pile", 3], ["fancy_earbuds", 2], ["laptop", 1], ["energy_drink", 2],
];
const SNACKS: [string, number][] = [["candy_bar", 3], ["soda_can", 3], ["energy_drink", 2]];

export type PropEvent =
  | { t: "search"; p: string; prop: string; found: number; raccoon: boolean }
  | { t: "smash"; p: string; prop: string; kind: PropKind }
  | { t: "alarm"; kind: "shop" | "car"; prop: string; x: number; z: number }
  | { t: "robStart"; p: string; prop: string }
  | { t: "robCancel"; p: string; prop: string }
  | { t: "robDone"; p: string; prop: string; value: number }
  | { t: "shoplift"; p: string; shop: number; npc: string }
  | { t: "empty"; p: string; prop: string };

export class PropSystem {
  readonly props = new Map<string, PropSim>();

  constructor(private w: World) {
    for (const def of w.arena.props ?? []) this.props.set(def.id, { def, ready: true, t: 0, alarmT: 0, register: "" });
  }

  /** New round: everything full again, fresh registers on the counters. */
  reset() {
    for (const ps of this.props.values()) {
      ps.ready = true; ps.t = 0; ps.alarmT = 0;
      if (ps.def.kind === "till") {
        const d = ps.def;
        ps.register = this.w.placeItem("cash_register", d.x, d.y, d.z);
        const it = this.w.items.get(ps.register)!;
        it.shop = d.shop ?? -1;
        it.body.rot = d.yaw;
      }
    }
  }

  tick(dt: number) {
    for (const ps of this.props.values()) {
      if (!ps.ready) { ps.t -= dt; if (ps.t <= 0) ps.ready = true; }
      if (ps.alarmT > 0) ps.alarmT = Math.max(0, ps.alarmT - dt);
    }
    // hold-ups in progress
    for (const p of this.w.players.values()) {
      const r = p.rob;
      if (!r) continue;
      const ps = this.props.get(r.prop);
      const reg = ps ? this.registerOnCounter(ps) : null;
      const moved = Math.hypot(p.move.x - r.x, p.move.z - r.z) > 1.2;
      if (!ps || !ps.ready || !reg || moved || !p.connected || p.move.knockT > 0) { this.cancelRob(p); continue; }
      const cashier = this.w.npc.cashierOf(ps.def.shop ?? -1);
      if (cashier) this.w.npc.cower(cashier.id, 1);
      r.t += dt;
      if (r.t >= ROB_TIME) {
        p.rob = null;
        const d = ps.def;
        const ax = p.move.x - d.x, az = p.move.z - d.z;
        const id = this.w.popLoot("cash_bundle", d.x, d.y + 0.4, d.z, ax, az);
        ps.ready = false; ps.t = REFILL.till;
        this.w.addHeat(p, 20);
        this.alarm(ps, "shop");
        this.w.emit({ t: "robDone", p: p.id, prop: d.id, value: this.w.items.get(id)?.value ?? 0 });
      }
    }
  }

  /** The cash register item, if it's still sitting on this till's counter. */
  private registerOnCounter(ps: PropSim): ItemSim | null {
    const it = ps.register ? this.w.items.get(ps.register) : undefined;
    if (!it || it.mode !== "free") return null;
    return Math.hypot(it.body.x - ps.def.x, it.body.z - ps.def.z) < 1.2 ? it : null;
  }

  /** Can this player reach the prop (close enough and roughly facing it)? */
  inReach(p: PlayerSim, ps: PropSim, extra = 0): boolean {
    const d = ps.def, m = p.move;
    const dx = d.x - m.x, dz = d.z - m.z;
    const dist = Math.hypot(dx, dz);
    if (dist - PROP_RADIUS[d.kind] > USE_RANGE + extra) return false;
    if (Math.abs(d.y - m.y) > 2.2) return false;
    const facing = (dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw)) / Math.max(0.001, dist);
    return dist < 1.2 || facing > 0.2;
  }

  /** E on a dumpster / bin (search) or a till (start a hold-up). */
  use(p: PlayerSim, propId: string) {
    const ps = this.props.get(propId);
    if (!ps || !this.inReach(p, ps, 0.4)) return;
    const d = ps.def;
    if (d.kind === "till") return this.startRob(p, ps);
    if (!SEARCHABLE.has(d.kind)) return;
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return; }
    ps.ready = false; ps.t = REFILL[d.kind];
    const table = d.kind === "dumpster" ? DUMPSTER_LOOT : BIN_LOOT;
    const n = d.kind === "dumpster" ? 2 + (this.w.random() < 0.5 ? 1 : 0) : 1 + (this.w.random() < 0.4 ? 1 : 0);
    const top = d.kind === "dumpster" ? 1.6 : 1.2;
    for (let i = 0; i < n; i++) {
      const a = this.w.random() * Math.PI * 2;
      this.w.popLoot(pickWeighted(table, () => this.w.random()), d.x, top, d.z, p.move.x - d.x + Math.cos(a) * 0.8, p.move.z - d.z + Math.sin(a) * 0.8);
    }
    const raccoon = d.kind === "dumpster" && this.w.random() < 0.12;
    if (raccoon) this.w.npc.spawnCritter(d.x, d.z, p.move.x, p.move.z);
    this.w.emit({ t: "search", p: p.id, prop: d.id, found: n, raccoon });
  }

  private startRob(p: PlayerSim, ps: PropSim) {
    if (!ps.ready || !this.registerOnCounter(ps)) { this.w.emit({ t: "empty", p: p.id, prop: ps.def.id }); return; }
    if (p.rob) return;
    p.rob = { prop: ps.def.id, t: 0, x: p.move.x, z: p.move.z };
    const cashier = this.w.npc.cashierOf(ps.def.shop ?? -1);
    if (cashier) { this.w.npc.cower(cashier.id, ROB_TIME + 1); this.w.npc.cashierSay(cashier.id, "holdup"); }
    this.w.emit({ t: "robStart", p: p.id, prop: ps.def.id });
  }

  cancelRob(p: PlayerSim) {
    if (!p.rob) return;
    this.w.emit({ t: "robCancel", p: p.id, prop: p.rob.prop });
    p.rob = null;
  }

  /** A punch that landed on a prop. Returns true if something happened. */
  smash(p: PlayerSim, propId: string): boolean {
    const ps = this.props.get(propId);
    if (!ps || !SMASHABLE.has(ps.def.kind)) return false;
    const d = ps.def;
    this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind });
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return true; }
    ps.ready = false; ps.t = REFILL[d.kind];
    const ax = p.move.x - d.x, az = p.move.z - d.z;
    const pop = (type: string, y = 1.2) => this.w.popLoot(type, d.x, y, d.z, ax, az);
    const rnd = () => this.w.random();
    switch (d.kind) {
      case "phone": pop("phone_handset", 1.5); if (rnd() < 0.3) pop("coin_pile"); break;
      case "vending": { const n = 1 + (rnd() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) pop(pickWeighted(SNACKS, rnd)); if (rnd() < 0.5) pop("coin_pile", 0.8); break; }
      case "meter": pop("coin_pile", 1.3); if (rnd() < 0.3) pop("coin_pile", 1.3); break;
      case "newsbox": pop("newspaper", 1.0); if (rnd() < 0.25) pop("expired_coupon", 1.0); break;
      case "car": pop(pickWeighted(CAR_LOOT, rnd), 1.3); this.alarm(ps, "car"); this.w.addHeat(p, 8); break;
    }
    this.w.addHeat(p, 4);
    return true;
  }

  private alarm(ps: PropSim, kind: "shop" | "car") {
    ps.alarmT = kind === "car" ? 8 : 6;
    this.w.emit({ t: "alarm", kind, prop: ps.def.id, x: ps.def.x, z: ps.def.z });
  }

  /** Someone picked up an item that belongs to a shop (shelf stock or the register). */
  onShopGrab(p: PlayerSim, it: ItemSim) {
    const shop = (this.w.arena.shops ?? []).find((s) => s.id === it.shop);
    it.shop = -1;
    if (!shop) return;
    const cashier = this.w.npc.cashierOf(shop.id);
    const till = [...this.props.values()].find((x) => x.def.kind === "till" && x.def.shop === shop.id);
    if (it.type === "cash_register") {
      // going loud: the whole till
      if (till) { till.register = ""; this.alarm(till, "shop"); }
      this.w.addHeat(p, 25);
      if (cashier) { this.w.npc.cower(cashier.id, 5); this.w.npc.cashierSay(cashier.id, "yell"); }
      return;
    }
    // shoplifting: only counts if the cashier is awake and you're inside the shop
    if (!cashier || cashier.state === "ko" || !inRect(shop.rect, p.move.x, p.move.z, 0.5) || p.move.y > (shop.maxY ?? 99)) return;
    this.w.addHeat(p, 8);
    this.w.npc.cashierSay(cashier.id, "yell");
    this.w.emit({ t: "shoplift", p: p.id, shop: shop.id, npc: cashier.id });
  }

  /** For syncing: which props are empty / alarmed right now. */
  stateOf(id: string): { ready: boolean; alarm: boolean } {
    const ps = this.props.get(id)!;
    return { ready: ps.ready, alarm: ps.alarmT > 0 };
  }
}
