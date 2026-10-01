// Phase 3.5: loot sources around the city. Runs inside the World (server + solo).
//   - search (E): dumpsters and bins -> random junk (dumpsters sometimes hide a raccoon)
//   - smash (punch): phone booths, vending machines, parking meters, newspaper boxes, parked cars
//   - rob a shop: hold R at the till for 3 s (cash bundle), or grab (E) the whole cash register
//   - shoplifting: swipe something off a shelf while the cashier is watching -> they yell (heat)
// Every source refills after a while (parked cars: once per round). Loud things raise heat and
// set off alarms (the police will listen to those in Phase 4).
import { inRect, setBoxOff, inLobby, type PropDef, type PropKind, type LobbyDef } from "./arena.js";
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
  washer: 1e9, dryer: 1e9, // (C4b: one search per machine per day)
  dummy: 0, throwgame: 0, racegame: 0, // (C5a: the lobby's practice dummy and mini-game machines never run out)
  steamer: 60, trinkets: 90, fishtank: 1e9, // (C5b: the seafood tank's glass gets fixed at dawn)
  vaultdoor: 1e9, depositbox: 1e9, nose: 1e9, stash: 1e9, // (C5c: once a day)
};
/** How far a prop's surface is from its centre (for punch / use reach). Breakables use their box (hw/hd) instead. */
export const PROP_RADIUS: Record<PropKind, number> = {
  dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, meter: 0.15, newsbox: 0.3, car: 1.4, till: 0.3,
  shopglass: 0, busstop: 0, hydrant: 0, mailbox: 0, bench: 0, planter: 0, table: 0, pallet: 0, washer: 0, dryer: 0,
  dummy: 0.35, throwgame: 0.6, racegame: 0.3, steamer: 0.75, trinkets: 0.85, fishtank: 0.7,
  vaultdoor: 1.1, depositbox: 0.3, nose: 0.5, stash: 0.3,
};
export const SMASHABLE = new Set<PropKind>(["phone", "vending", "meter", "newsbox", "car", "shopglass", "busstop", "hydrant", "mailbox", "bench", "planter", "table", "pallet", "washer", "dryer", "dummy", "fishtank"]);
/** C5a: the lobby's mini-game machines (E to play) */
export const LOBBY_GAMES = new Set<PropKind>(["throwgame", "racegame"]);
/** C4a: things that break (and stop blocking) after this many hits, by size */
export const BREAK_HP: Partial<Record<PropKind, number>> = { shopglass: 2, busstop: 1, hydrant: 2, mailbox: 2, bench: 2, planter: 2, table: 1, pallet: 1 };
export const BREAKABLE = new Set(Object.keys(BREAK_HP) as PropKind[]);
/** C4a: how far away a noise is heard (m) */
export const NOISE = { smash: 12, alarm: 25, machine: 10 };
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
export const SEARCHABLE = new Set<PropKind>(["dumpster", "bin", "washer", "dryer", "steamer", "trinkets", "depositbox", "stash"]);
/**
 * C5c: things you hold E on for a while (a progress ring): the vault door (drilling it is loud and slow;
 * with the manager's keycard it opens quietly in 3 s), the Mayor's statue's gold nose, the WANTED screen's box.
 */
export const HOLD_TIME: Partial<Record<PropKind, number>> = { vaultdoor: 20, nose: 5 };
export const KEYCARD_TIME = 3;
/** C5c: the bank heist: heat for drilling (3 stars straight away), for being seen with the keycard, the drill's noise */
export const BANK = { drillHeat: 92, keycardSeenHeat: 30, noseHeat: 25, noiseEvery: 2 };
const DEPOSIT_LOOT: [string, number][] = [["pearl_necklace", 3], ["rolecks_watch", 2], ["bearer_bond", 1.5], ["family_photo", 3], ["cash_bag", 2], ["gold_bar", 0.8]];
/** C5c: things that reset once a day, at dawn (not at night) */
const DAILY = new Set<PropKind>(["washer", "dryer", "fishtank", "vaultdoor", "depositbox", "nose", "stash"]);
/** C5b: Chinatown's stalls: help yourself (the stall keeper yells if anybody sees, a little heat) */
export const STALL_LOOT: Partial<Record<PropKind, [string, number][]>> = {
  steamer: [["dumpling_box", 4], ["bao_bun", 5], ["fortune_cookie", 3], ["mooncake", 1.5]],
  trinkets: [["paper_fan", 5], ["fortune_cookie", 2], ["lucky_cat", 1.2], ["jade_dragon", 0.25]],
};
const FISHTANK_LOOT: [string, number][] = [["live_crab", 3], ["smelly_fish", 4]];
/** C4b: laundromat machines: open quietly (E, takes OPEN_TIME) or force with a punch (instant, loud, heat if seen) */
export const MACHINES = new Set<PropKind>(["washer", "dryer"]);
export const OPEN_TIME = 2.2;
/** C4b: what's in the machines. A designer piece is about 1 search in 25-50; a cat-or-raccoon surprise 1 in 20. */
const LAUNDRY_LOOT: [string, number][] = [
  ["coin_pile", 6], ["odd_sock", 6], ["single_shoe", 3], ["novelty_undies", 3], ["mystery_wallet", 0.8], ["fresh_laundry", 2.2], ["designer_hoodie", 0.2], ["designer_scarf", 0.2],
];

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
  | { t: "stallYell"; p: string; prop: string }
  | { t: "smash"; p: string; prop: string; kind: PropKind; broke?: boolean; x?: number; z?: number }
  | { t: "alarm"; kind: "shop" | "car" | "bank"; prop: string; x: number; z: number }
  | { t: "drill"; p: string; prop: string }
  | { t: "vault"; p: string; prop: string; quiet: boolean }
  | { t: "nose"; p: string; prop: string }
  | { t: "stashFound"; p: string; prop: string }
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
      if (DAILY.has(ps.def.kind) && !repair) continue; // (C4b: one search per machine per day; C5b/C5c: the seafood tank, the bank's vault, the stashes: once a day)
      if (ps.def.kind === "vaultdoor" && ps.def.box !== undefined) setBoxOff(this.w.arena, ps.def.box, false); // (C5c: the vault shuts again at dawn)
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
      if (ps && HOLD_TIME[ps.def.kind] !== undefined) {
        // C5c: a long hold (drilling the vault, prising the nose, hacking the screen)
        const moved = Math.hypot(p.move.x - r.x, p.move.z - r.z) > 1.2;
        if (!ps.ready || moved || !p.connected || p.move.knockT > 0) { this.cancelRob(p); continue; }
        const before = r.t;
        r.t += dt;
        if (ps.def.kind === "vaultdoor" && !r.quiet && Math.floor(r.t / BANK.noiseEvery) !== Math.floor(before / BANK.noiseEvery)) {
          this.w.noise(p, ps.def.x, ps.def.z, NOISE.alarm); // (the drill: GRRRRRRR)
          this.w.emit({ t: "drill", p: p.id, prop: ps.def.id });
        }
        if (r.t >= (r.quiet ? KEYCARD_TIME : HOLD_TIME[ps.def.kind]!)) { p.rob = null; this.finishHold(p, ps, !!r.quiet); }
        continue;
      }
      if (ps && MACHINES.has(ps.def.kind)) {
        // C4b: opening a machine quietly
        const moved = Math.hypot(p.move.x - r.x, p.move.z - r.z) > 1.0;
        if (!ps.ready || moved || !p.connected || p.move.knockT > 0) { this.cancelRob(p); continue; }
        r.t += dt;
        if (r.t >= OPEN_TIME) { p.rob = null; this.openMachine(p, ps, false); }
        continue;
      }
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
    if (HOLD_TIME[d.kind] !== undefined) return this.startHold(p, ps);
    if (LOBBY_GAMES.has(d.kind)) { this.w.lobby.start(p, d.kind === "throwgame" ? "throw" : "race"); return; }
    if (MACHINES.has(d.kind)) {
      if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return; }
      if (!p.rob) { p.rob = { prop: d.id, t: 0, x: p.move.x, z: p.move.z }; this.w.emit({ t: "robStart", p: p.id, prop: d.id }); }
      return;
    }
    if (!SEARCHABLE.has(d.kind)) return;
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return; }
    ps.ready = false; ps.t = REFILL[d.kind];
    if (d.kind === "stash" || d.kind === "depositbox") {
      // C5c: a golden stash (behind a loose brick, inside a statue...) or a safety deposit box
      const table: [string, number][] = d.kind === "stash" ? (d.loot ?? ["golden_spork"]).map((t) => [t, 1]) : DEPOSIT_LOOT;
      const n = d.kind === "stash" ? 1 : 1 + (this.w.random() < 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) this.w.popLoot(pickWeighted(table, () => this.w.random()), d.x, d.y + 0.9, d.z, p.move.x - d.x, p.move.z - d.z);
      this.w.emit({ t: "search", p: p.id, prop: d.id, found: n, raccoon: false });
      if (d.kind === "stash") this.w.emit({ t: "stashFound", p: p.id, prop: d.id });
      return;
    }
    const stall = STALL_LOOT[d.kind];
    if (stall) {
      // C5b: a Chinatown stall: 1-2 things off the counter; the stall keeper yells if anyone sees
      const n = 1 + (this.w.random() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) this.w.popLoot(pickWeighted(stall, () => this.w.random()), d.x, 1.2, d.z, p.move.x - d.x, p.move.z - d.z);
      const seen = this.w.witnessed(p);
      if (seen) this.w.addHeat(p, 3);
      this.w.emit({ t: "search", p: p.id, prop: d.id, found: n, raccoon: false });
      if (seen) this.w.emit({ t: "stallYell", p: p.id, prop: d.id });
      return;
    }
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

  /**
   * C4b: a washer or dryer comes open: 1-2 things pop out (loose change and odd socks mostly, fresh laundry
   * sometimes, a designer piece rarely), 1 in 20 a cat-or-raccoon leaps out screeching. Forced open (a punch)
   * is loud: a 10 m noise (the old lady upstairs hears it) and heat if anybody sees.
   */
  private openMachine(p: PlayerSim, ps: PropSim, forced: boolean) {
    const d = ps.def;
    ps.ready = false; ps.t = REFILL[d.kind];
    const rnd = () => this.w.random();
    const n = 1 + (rnd() < 0.45 ? 1 : 0);
    for (let i = 0; i < n; i++) this.w.popLoot(pickWeighted(LAUNDRY_LOOT, rnd), d.x, 1.1, d.z, p.move.x - d.x, p.move.z - d.z);
    const critter = rnd() < 0.05;
    if (critter) this.w.npc.spawnCritter(d.x, d.z, p.move.x, p.move.z);
    this.w.emit({ t: "search", p: p.id, prop: d.id, found: n, raccoon: critter });
    if (forced) {
      this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind });
      this.w.noise(p, d.x, d.z, NOISE.machine);
      if (this.w.witnessed(p)) this.w.addHeat(p, 3);
    }
  }

  /** C5c: start a long hold (see HOLD_TIME). The vault door: quiet with the keycard, otherwise the drill (loud). */
  private startHold(p: PlayerSim, ps: PropSim) {
    const d = ps.def;
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return; }
    if (p.rob) return;
    const quiet = d.kind === "vaultdoor" && this.w.carriedItems(p).some((it) => it.type === "bank_keycard");
    p.rob = { prop: d.id, t: 0, x: p.move.x, z: p.move.z, quiet };
    this.w.emit({ t: "robStart", p: p.id, prop: d.id });
    if (d.kind === "vaultdoor" && !quiet) {
      // the drill: every alarm in the building goes off, the guards come running, 3 stars straight away
      this.alarm(ps, "bank");
      if (p.notoriety < BANK.drillHeat) this.w.addHeat(p, BANK.drillHeat - p.notoriety);
      this.w.npc.guardsAlert(p.id);
    }
  }

  /** C5c: a long hold finished */
  /** (public for the test harness: skip to the end of a long hold) */
  finishHold(p: PlayerSim, ps: PropSim, quiet: boolean) {
    const d = ps.def;
    ps.ready = false; ps.t = REFILL[d.kind];
    if (d.kind === "vaultdoor") {
      if (d.box !== undefined) setBoxOff(this.w.arena, d.box, true);
      for (const it of this.w.items.values()) if (it.body.resting && propSurfaceDist(d, it.body.x, it.body.z) < 1.5) it.body.resting = false;
      if (quiet) {
        const card = this.w.carriedItems(p).find((it) => it.type === "bank_keycard");
        if (card) this.w.consumeItem(p, card.id); // (the card stays in the lock)
        if (this.w.witnessed(p)) { this.w.addHeat(p, BANK.keycardSeenHeat); this.w.npc.guardsAlert(p.id); }
      }
      this.w.emit({ t: "vault", p: p.id, prop: d.id, quiet });
    } else if (d.kind === "nose") {
      this.w.popLoot("gold_nose", d.x, d.y + 0.3, d.z, p.move.x - d.x, p.move.z - d.z);
      if (this.w.witnessed(p)) this.w.addHeat(p, BANK.noseHeat);
      this.w.emit({ t: "nose", p: p.id, prop: d.id });
    }
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
    if (d.kind === "dummy") { this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind }); return true; } // (C5a: THWACK. It wobbles, that's all)
    if (BREAKABLE.has(d.kind)) return this.hitBreakable(p, ps);
    if (MACHINES.has(d.kind)) {
      if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return true; }
      this.openMachine(p, ps, true);
      return true;
    }
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
      case "fishtank": pop(pickWeighted(FISHTANK_LOOT, rnd), 1.1); if (rnd() < 0.5) pop(pickWeighted(FISHTANK_LOOT, rnd), 1.1); break; // (C5b: SPLASH)
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

  private alarm(ps: PropSim, kind: "shop" | "car" | "bank") {
    ps.alarmT = kind === "car" ? 8 : kind === "bank" ? 25 : 6;
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

// C5a: the lobby squat. A rooftop camp just past the south edge of town where everyone waits for the match
// (and where solo players start): free stuff that keeps refilling, a practice dummy, crates to climb, a
// wall to tag, Uncle Dumpster's tips, and two mini-games:
//   THROW-O-MATIC: E on the machine, then 30 s to throw bin lids at the three targets (3 / 2 / 1 points
//     by how close to the bullseye). Your best score is kept for the match.
//   TROLLEY GRAND PRIX: E on the starter's post, then drag a shopping trolley round the four checkpoint
//     cones and back through the start. Your best lap is kept.
// Nothing here gives heat. When the host starts the match everyone goes to their fort (resetCity).

export const THROW_GAME = { time: 30, lids: 5 };
export const RACE_GAME = { timeout: 120, cpRadius: 2.2 };
const PILE_TYPES = ["rubber_duck", "expired_coupon", "pocket_lint", "half_sandwich", "coin_pile", "candy_bar", "rubber_chicken", "wrong_map"];

export interface LobbyGame { kind: "throw" | "race"; t: number; score: number; cp: number }

export type LobbyEvent =
  | { t: "target"; p: string; target: string; pts: number }
  | { t: "lobbyGame"; p: string; game: "throw" | "race"; stage: "start" | "cp" | "done" | "fail"; score: number; best: number; cp?: number };

export class LobbySystem {
  private refillT = 0;
  constructor(private w: World) {}
  get def(): LobbyDef | undefined { return this.w.arena.lobby; }

  on(p: PlayerSim) { return inLobby(this.w.arena, p.move.x, p.move.z, 1) && p.move.y > (this.def?.y ?? 0) - 3; }

  /** Stock the roof: the free-stuff pile, a rack of bin lids, a couple of trolleys, a spray can for the tag wall. */
  tick(dt: number) {
    const L = this.def;
    if (!L || !this.w.lobbyOn) return;
    this.refillT -= dt;
    if (this.refillT <= 0 && (this.w.match.phase === "lobby" || this.w.match.phase === "over")) {
      this.refillT = 6;
      const near = (x: number, z: number, r: number, f: (it: ItemSim) => boolean) =>
        [...this.w.items.values()].filter((it) => it.mode === "free" && f(it) && Math.hypot(it.body.x - x, it.body.z - z) < r && Math.abs(it.body.y - L.y) < 3).length;
      const pile = L.pile;
      if (near(pile.x, pile.z, 2.5, () => true) < 5) this.place(PILE_TYPES[Math.floor(this.w.random() * PILE_TYPES.length)], pile.x + (this.w.random() - 0.5) * 1.6, pile.z + (this.w.random() - 0.5) * 1.2);
      const rack = L.lids;
      if (near(rack.x, rack.z, 2, (it) => it.type === "bin_lid") < 4) this.place("bin_lid", rack.x + (this.w.random() - 0.5) * 1.2, rack.z + (this.w.random() - 0.5) * 0.8);
      for (const tr of L.trolleys) if (near(tr.x, tr.z, 1.5, (it) => it.type === "shopping_trolley") < 1 && near(tr.x, tr.z, 30, (it) => it.type === "shopping_trolley") < L.trolleys.length) this.place("shopping_trolley", tr.x, tr.z);
      const cans = L.cans;
      if (near(cans.x, cans.z, 1.5, (it) => it.type === "spray_can") < 1) this.place("spray_can", cans.x, cans.z);
    }
    // mini-games in progress
    for (const p of this.w.players.values()) {
      const g = p.lobbyGame;
      if (!g) continue;
      g.t += dt;
      if (!this.on(p) || !p.connected) { this.end(p, "fail"); continue; }
      if (g.kind === "throw") {
        if (g.t >= THROW_GAME.time) this.end(p, "done");
      } else {
        if (g.t >= RACE_GAME.timeout) { this.end(p, "fail"); continue; }
        const hand = p.hand ? this.w.items.get(p.hand) : undefined;
        if (!hand || hand.type !== "shopping_trolley") continue; // (checkpoints only count while you drag a trolley)
        const cp = L.race[g.cp % L.race.length];
        if (Math.hypot(p.move.x - cp.x, p.move.z - cp.z) < cp.r) {
          if (g.cp >= L.race.length) { g.score = Math.round(g.t * 100) / 100; this.end(p, "done"); continue; }
          g.cp++;
          this.w.emit({ t: "lobbyGame", p: p.id, game: "race", stage: "cp", score: g.t, best: p.raceBest, cp: g.cp });
        }
      }
    }
  }

  private place(type: string, x: number, z: number) {
    const id = this.w.placeItem(type, x, (this.def?.y ?? 0) + 0.3, z);
    this.w.emit({ t: "spawn", item: id });
  }

  /** E on the THROW-O-MATIC or the race post */
  start(p: PlayerSim, game: "throw" | "race") {
    if (!this.def || !this.on(p)) return;
    p.lobbyGame = { kind: game, t: 0, score: 0, cp: 1 };
    this.w.emit({ t: "lobbyGame", p: p.id, game, stage: "start", score: 0, best: game === "throw" ? p.throwBest : p.raceBest });
  }

  private end(p: PlayerSim, stage: "done" | "fail") {
    const g = p.lobbyGame;
    if (!g) return;
    p.lobbyGame = null;
    if (stage === "done") {
      if (g.kind === "throw") p.throwBest = Math.max(p.throwBest, g.score);
      else p.raceBest = p.raceBest > 0 ? Math.min(p.raceBest, g.score) : g.score;
    }
    this.w.emit({ t: "lobbyGame", p: p.id, game: g.kind, stage, score: g.score, best: g.kind === "throw" ? p.throwBest : p.raceBest });
  }

  /** A thrown thing hit something: did it land on a target? (3 / 2 / 1 points by how close to the bullseye) */
  itemImpact(it: ItemSim, thrower: PlayerSim) {
    const L = this.def;
    if (!L) return false;
    for (const tg of L.targets) {
      const d = Math.hypot(it.body.x - tg.x, it.body.y - tg.y, it.body.z - tg.z);
      if (d > tg.r + 0.35) continue;
      const pts = d < tg.r * 0.4 ? 3 : d < tg.r * 0.75 ? 2 : 1;
      const g = thrower.lobbyGame;
      if (g && g.kind === "throw") g.score += pts;
      this.w.emit({ t: "target", p: thrower.id, target: tg.id, pts });
      return true;
    }
    return false;
  }

  /** The match starts: games stop, scores stay (bragging rights), aura goes back to 0. */
  matchStart() {
    for (const p of this.w.players.values()) { p.lobbyGame = null; p.aura = 0; }
  }
}
