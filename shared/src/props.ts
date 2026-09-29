// Phase 3.5: loot sources around the city. Runs inside the World (server + solo).
//   - search (E): dumpsters and bins -> random junk (dumpsters sometimes hide a raccoon)
//   - smash (punch): phone booths, vending machines, parking meters, newspaper boxes, parked cars
//   - rob a shop: hold R at the till for 3 s (cash bundle), or grab (E) the whole cash register
//   - shoplifting: swipe something off a shelf while the cashier is watching -> they yell (heat)
// Every source refills after a while (parked cars: once per round). Loud things raise heat and
// set off alarms (the police will listen to those in Phase 4).
import { inRect, setBoxOff, type PropDef, type PropKind } from "./arena.js";
import { pickWeighted } from "./npc.js";
import type { World, PlayerSim, ItemSim } from "./world.js";

export interface PropSim {
  def: PropDef; ready: boolean; t: number; alarmT: number; register: string;
  /** C4a: hits left before a breakable breaks */
  hp: number;
  /** C4a: world time it broke (hydrants spray for a while after) */
  brokeAt: number;
}

export const ROB_TIME = 3;
export const USE_RANGE = 2.4;

const REFILL: Record<PropKind, number> = {
  dumpster: 50, bin: 35, phone: 70, vending: 50, meter: 40, newsbox: 40, car: 1e9, till: 45,
  // (C4a: broken things stay broken until the city resets at dawn)
  shopglass: 1e9, busstop: 1e9, hydrant: 1e9, mailbox: 1e9, bench: 1e9, planter: 1e9, table: 1e9, pallet: 1e9,
};
/** How far a prop's surface is from its centre (for punch / use reach). Breakables use their box (hw/hd) instead. */
export const PROP_RADIUS: Record<PropKind, number> = {
  dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, meter: 0.15, newsbox: 0.3, car: 1.4, till: 0.3,
  shopglass: 0, busstop: 0, hydrant: 0, mailbox: 0, bench: 0, planter: 0, table: 0, pallet: 0,
};
export const SMASHABLE = new Set<PropKind>(["phone", "vending", "meter", "newsbox", "car", "shopglass", "busstop", "hydrant", "mailbox", "bench", "planter", "table", "pallet"]);
/** C4a: things that break (and stop blocking) after this many hits, by size */
export const BREAK_HP: Partial<Record<PropKind, number>> = { shopglass: 2, busstop: 1, hydrant: 2, mailbox: 2, bench: 2, planter: 2, table: 1, pallet: 1 };
export const BREAKABLE = new Set(Object.keys(BREAK_HP) as PropKind[]);
/** C4a: how far away a noise is heard (m) */
export const NOISE = { smash: 12, alarm: 25 };
/** C4a: a broken hydrant sprays for this long, knocking back anyone who stands in it */
export const HYDRANT_SPRAY = { time: 20, r: 1.3, push: 7, lift: 5 };

/** Distance from a point to a prop's surface (0 inside it). */
export function propSurfaceDist(d: PropDef, x: number, z: number): number {
  if (d.hw !== undefined && d.hd !== undefined) return Math.hypot(Math.max(0, Math.abs(x - d.x) - d.hw), Math.max(0, Math.abs(z - d.z) - d.hd));
  return Math.max(0, Math.hypot(x - d.x, z - d.z) - PROP_RADIUS[d.kind]);
}
/** The point on a prop nearest to (x, z) (breakables are long: benches, shop windows). */
export function propNearest(d: PropDef, x: number, z: number): { x: number; z: number } {
  if (d.hw === undefined || d.hd === undefined) return { x: d.x, z: d.z };
  return { x: Math.max(d.x - d.hw, Math.min(d.x + d.hw, x)), z: Math.max(d.z - d.hd, Math.min(d.z + d.hd, z)) };
}
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
  | { t: "smash"; p: string; prop: string; kind: PropKind; broke?: boolean; x?: number; z?: number }
  | { t: "alarm"; kind: "shop" | "car"; prop: string; x: number; z: number }
  | { t: "robStart"; p: string; prop: string }
  | { t: "robCancel"; p: string; prop: string }
  | { t: "robDone"; p: string; prop: string; value: number }
  | { t: "shoplift"; p: string; shop: number; npc: string }
  | { t: "empty"; p: string; prop: string };

export class PropSystem {
  readonly props = new Map<string, PropSim>();

  constructor(private w: World) {
    for (const def of w.arena.props ?? []) this.props.set(def.id, { def, ready: true, t: 0, alarmT: 0, register: "", hp: BREAK_HP[def.kind] ?? 1, brokeAt: -99 });
  }

  /**
   * New round: everything full again, fresh registers on the counters.
   * (C4a) repair = false at nightfall: things broken during the day stay broken until dawn.
   */
  reset(repair = true) {
    for (const ps of this.props.values()) {
      if (BREAKABLE.has(ps.def.kind)) {
        if (!repair) continue;
        ps.hp = BREAK_HP[ps.def.kind]!; ps.brokeAt = -99;
        if (ps.def.box !== undefined) setBoxOff(this.w.arena, ps.def.box, false);
      }
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
      // C4a: a burst hydrant's jet knocks back anyone standing in it
      if (ps.def.kind === "hydrant" && !ps.ready && this.w.time - ps.brokeAt < HYDRANT_SPRAY.time) {
        for (const p of this.w.players.values()) {
          const m = p.move, dx = m.x - ps.def.x, dz = m.z - ps.def.z, d = Math.hypot(dx, dz);
          if (d > HYDRANT_SPRAY.r || m.y > 2.5 || m.knockT > 0) continue;
          const l = Math.max(0.2, d);
          m.vx = (dx / l) * HYDRANT_SPRAY.push; m.vz = (dz / l) * HYDRANT_SPRAY.push;
          if (m.grounded) { m.vy = HYDRANT_SPRAY.lift; m.grounded = false; }
          m.stumbleT = Math.max(m.stumbleT, 0.3);
        }
      }
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
    const near = propNearest(d, m.x, m.z);
    const dx = near.x - m.x, dz = near.z - m.z;
    const dist = Math.hypot(dx, dz);
    if (propSurfaceDist(d, m.x, m.z) > USE_RANGE + extra) return false;
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
    if (BREAKABLE.has(d.kind)) return this.hitBreakable(p, ps);
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
    this.w.noise(p, d.x, d.z, NOISE.smash);
    if (d.kind === "car") this.w.noise(p, d.x, d.z, NOISE.alarm);
    // (C4a: breaking things only adds heat if somebody sees you do it)
    if (this.w.witnessed(p)) this.w.addHeat(p, 4);
    return true;
  }

  /**
   * C4a: a hit on a breakable. It takes 1-3 hits by size; when it breaks it stops blocking (shop windows
   * become a way in), bursts into pieces on screen, maybe drops something, and makes a noise. Heat only
   * if somebody sees it. Everything is repaired at dawn.
   */
  private hitBreakable(p: PlayerSim, ps: PropSim): boolean {
    const d = ps.def;
    const at = propNearest(d, p.move.x, p.move.z);
    if (!ps.ready) { this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind, broke: false, x: at.x, z: at.z }); return true; }
    ps.hp -= 1;
    const broke = ps.hp <= 0;
    this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind, broke, x: at.x, z: at.z });
    const seen = this.w.witnessed(p);
    this.w.noise(p, at.x, at.z, NOISE.smash);
    if (!broke) { if (seen) this.w.addHeat(p, 1); return true; }
    ps.ready = false; ps.t = REFILL[d.kind]; ps.brokeAt = this.w.time;
    if (d.box !== undefined) {
      setBoxOff(this.w.arena, d.box, true);
      // anything resting on it falls
      for (const it of this.w.items.values()) if (it.body.resting && propSurfaceDist(d, it.body.x, it.body.z) < 0.3) it.body.resting = false;
    }
    const ax = p.move.x - at.x, az = p.move.z - at.z;
    const rnd = () => this.w.random();
    if (d.kind === "mailbox") { this.w.popLoot(pickWeighted([["newspaper", 3], ["expired_coupon", 3], ["coin_pile", 1], ["mystery_wallet", 0.4]], rnd), at.x, 1.0, at.z, ax, az); }
    if (d.kind === "shopglass") {
      // a smashed shop window: the alarm goes off, the cashier yells
      const till = [...this.props.values()].find((x) => x.def.kind === "till" && x.def.shop === d.shop);
      if (till) this.alarm(till, "shop");
      const cashier = this.w.npc.cashierOf(d.shop ?? -1);
      if (cashier) { this.w.npc.cashierSay(cashier.id, "yell"); if (seen || cashier.state !== "ko") this.w.addHeat(p, 8); }
      this.w.noise(p, at.x, at.z, NOISE.alarm);
    } else if (seen) this.w.addHeat(p, 3);
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
  /** C4a: is this prop a broken breakable right now? */
  isBroken(id: string): boolean { const ps = this.props.get(id); return !!ps && BREAKABLE.has(ps.def.kind) && !ps.ready; }

  stateOf(id: string): { ready: boolean; alarm: boolean } {
    const ps = this.props.get(id)!;
    return { ready: ps.ready, alarm: ps.alarmT > 0 };
  }
}
