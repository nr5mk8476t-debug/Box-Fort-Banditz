// R14: YOUR FORT. The deposit mat (10 s there and it's banked), the shelves and the safe (banked things are records
// here, not loose items in the street: one owner, one copy, nothing to duplicate), selling to Sal's van in PREP,
// upgrades, the workbench, and night theft (5 s at a rival's shelves; 10 with their ALARM II).
// Authoritative: only the World (host / server) runs this. The client gets each player's fort in `lp` (see view()).
import type { World, PlayerSim, ItemSim } from "../world.js";
import { lootDef, LOOT } from "../loot.js";
import { itemWorth } from "../match.js";
import { LOOP, UPGRADE, RECIPE, itemCategory, fortLevel, type UpgradeId, type GearId, type ItemCategory } from "./catalog.js";
import { hyp } from "../fmath.js";

/** one banked thing on a fort's shelves (or in its safe) */
export interface Rec { id: string; type: string; value: number; safe: boolean }
export interface FortState {
  ups: Set<UpgradeId>;
  recs: Rec[];
  gear: Partial<Record<GearId, number>>;
  /** this prep's "wanted today" types already sold at x2 */
  wantedSold: Set<string>;
  /** the mat's "storage full" warning (so it's said once a trip) */
  fullWarned: boolean;
  /** bumped on every change: the view's JSON is rebuilt only then */
  v: number;
}
export interface Theft { owner: string; rec: string; t: number; need: number; x: number; z: number }

export class FortSystem {
  readonly forts = new Map<string, FortState>();
  readonly thefts = new Map<string, Theft>();
  /** Sal's "wanted today" list (types; x2 once each in PREP) */
  wanted: string[] = [];
  private nextRec = 1;
  private viewCache = new Map<string, { v: number; json: string }>();

  constructor(private w: World) {}

  of(p: PlayerSim | string): FortState {
    const id = typeof p === "string" ? p : p.id;
    let f = this.forts.get(id);
    if (!f) { f = { ups: new Set(), recs: [], gear: {}, wantedSold: new Set(), fullWarned: false, v: 0 }; this.forts.set(id, f); }
    return f;
  }
  /** a new match: every fort back to a box with nothing in it */
  resetAll() { this.forts.clear(); this.thefts.clear(); this.viewCache.clear(); }

  shelfCap(f: FortState) { return LOOP.shelves[f.ups.has("shelves3") ? 2 : f.ups.has("shelves2") ? 1 : 0]; }
  safeCap(f: FortState) { return LOOP.safe[f.ups.has("safe3") ? 2 : f.ups.has("safe2") ? 1 : 0]; }
  level(f: FortState) { return fortLevel(f.ups); }
  /** things on the shelves (not in the safe); past the shelves' capacity they're "on the lawn" (still yours, exposed) */
  shelfRecs(f: FortState) { return f.recs.filter((r) => !r.safe); }
  /** can a thief take this one? (anything not in the safe) */
  exposed(r: Rec) { return !r.safe; }

  // ------------------------------------------------------------------------------------------------- the deposit mat
  /** the mat of a fort slot (its pad, LOOP.matHalf either way) */
  matOf(slot: number) {
    const f = this.w.arena.forts?.find((q) => q.slot === slot);
    if (!f) return null;
    return { minX: f.padX - LOOP.matHalf, maxX: f.padX + LOOP.matHalf, minZ: f.padZ - LOOP.matHalf, maxZ: f.padZ + LOOP.matHalf };
  }
  private matSlotAt(x: number, z: number): number {
    for (const f of this.w.arena.forts ?? []) if (Math.abs(x - f.padX) <= LOOP.matHalf && Math.abs(z - f.padZ) <= LOOP.matHalf) return f.slot;
    return -1;
  }

  /** while scavenging: loot resting on its owner's mat counts down; at 10 s it's banked (all of one player's in one go) */
  matTick(dt: number) {
    const done = new Map<PlayerSim, { type: string; value: number }[]>();
    for (const it of this.w.items.values()) {
      if (it.mode !== "free" || lootDef(it.type).money) { it.fort = -1; it.bankT = 0; continue; }
      const slot = this.matSlotAt(it.body.x, it.body.z);
      const owner = slot >= 0 ? this.w.match.ownerOf(slot) : undefined;
      if (!owner) { it.fort = -1; it.bankT = 0; continue; }
      if (slot !== it.fort) { it.fort = slot; it.bankT = 0; }
      const f = this.of(owner);
      if (this.shelfRecs(f).length >= this.shelfCap(f)) {
        it.bankT = Math.min(it.bankT, LOOP.bankTime - 0.01); // (it waits: "STORAGE FULL")
        if (!f.fullWarned) { f.fullWarned = true; this.w.emit({ t: "storageFull", p: owner.id }); }
        continue;
      }
      it.bankT += dt;
      if (it.bankT < LOOP.bankTime) continue;
      const value = itemWorth(it);
      f.recs.push({ id: "r" + this.nextRec++, type: it.type, value, safe: false });
      f.fullWarned = false; f.v++;
      this.w.items.delete(it.id);
      let l = done.get(owner); if (!l) done.set(owner, (l = []));
      l.push({ type: it.type, value });
    }
    for (const [p, l] of done) this.w.emit({ t: "banked", p: p.id, types: l.map((x) => x.type), value: l.reduce((a, x) => a + x.value, 0) });
  }

  /** time's up: anything not banked is gone (Blake: deleted): what they carry, and what's still counting down on a mat */
  deadline(): { p: PlayerSim; n: number; v: number }[] {
    const out: { p: PlayerSim; n: number; v: number }[] = [];
    for (const p of this.w.players.values()) {
      let n = 0, v = 0;
      for (const it of this.w.carriedItems(p)) { if (lootDef(it.type).money) continue; n++; v += itemWorth(it); this.w.consumeItem(p, it.id); }
      // (on the mat, or just dropped in the yard: unbanked either way)
      const lot = this.w.arena.forts?.find((q) => q.slot === p.colorIdx)?.zone;
      for (const it of [...this.w.items.values()]) {
        if (it.mode !== "free" || lootDef(it.type).money) continue;
        const inYard = !!lot && it.body.x >= lot.minX && it.body.x <= lot.maxX && it.body.z >= lot.minZ && it.body.z <= lot.maxZ;
        if (it.fort === p.colorIdx || inYard) { n++; v += itemWorth(it); this.w.items.delete(it.id); }
      }
      p.hand = ""; p.pockets.fill(""); this.w.refreshCarry(p);
      if (n) { this.w.emit({ t: "lost", p: p.id, count: n, value: v }); out.push({ p, n, v }); }
    }
    this.cancelAllThefts("time");
    return out;
  }

  // ------------------------------------------------------------------------------------------------- PREP: sell, safe
  /** a new PREP: Sal's wanted list for it */
  openPrep() {
    const pool = LOOT.filter((d) => !d.money && !d.blackMarket && !d.junk && d.rarity !== "legendary" && itemCategory(d.type, d) !== "misc" && d.type !== "bank_keycard");
    this.wanted = [];
    while (this.wanted.length < LOOP.wantedCount && pool.length) { const d = pool.splice(Math.floor(this.w.random() * pool.length), 1)[0]; this.wanted.push(d.type); }
    for (const f of this.forts.values()) { f.wantedSold.clear(); f.v++; }
  }
  /** what Sal's van pays for a record now */
  offer(f: FortState, r: Rec, rate: number = LOOP.vanRate) {
    const hot = this.wanted.includes(r.type) && !f.wantedSold.has(r.type);
    return Math.max(1, Math.round(r.value * rate * (hot ? LOOP.wantedMult : 1)));
  }
  sell(p: PlayerSim, recIds: string[]) {
    if (this.w.match.phase !== "prep") return;
    const f = this.of(p);
    let cash = 0; const sold: string[] = [];
    for (const id of recIds) {
      const i = f.recs.findIndex((r) => r.id === id);
      if (i < 0) continue; // (already sold, stolen, used: one sale per record)
      const r = f.recs[i], pay = this.offer(f, r, this.w.loopQuests.vanRate(p));
      if (this.wanted.includes(r.type)) f.wantedSold.add(r.type);
      f.recs.splice(i, 1); cash += pay; sold.push(r.type);
    }
    if (!sold.length) return;
    p.cash += cash; f.v++;
    this.w.emit({ t: "vanSold", p: p.id, types: sold, cash });
  }
  /** (B) choose what's in the safe: in PREP, or by day standing at your own fort; never at night */
  protect(p: PlayerSim, recId: string, on: boolean) {
    const m = this.w.match;
    const ok = m.phase === "prep" || ((m.phase === "scavenge" || m.phase === "dusk") && this.atOwnFort(p));
    if (!ok) return this.w.emit({ t: "fortNo", p: p.id, reason: "safeNight" });
    const f = this.of(p), r = f.recs.find((x) => x.id === recId);
    if (!r || r.safe === on) return;
    if (on && f.recs.filter((x) => x.safe).length >= this.safeCap(f)) return this.w.emit({ t: "fortNo", p: p.id, reason: "safeFull" });
    if (on && this.thefts.size) for (const th of this.thefts.values()) if (th.rec === recId) return; // (being stolen right now: too late)
    r.safe = on; f.v++;
  }
  atOwnFort(p: PlayerSim) {
    const f = this.w.arena.forts?.find((q) => q.slot === p.colorIdx);
    if (!f) return false;
    const z = f.zone;
    return p.move.x >= z.minX && p.move.x <= z.maxX && p.move.z >= z.minZ && p.move.z <= z.maxZ;
  }

  // ------------------------------------------------------------------------------------------------- upgrades + crafting
  /** the records a cost would use (cheapest that fit; the safe's last), or null if you're short */
  private pick(f: FortState, items: Partial<Record<ItemCategory, number>>): Rec[] | null {
    const out: Rec[] = [];
    for (const [cat, n] of Object.entries(items) as [ItemCategory, number][]) {
      const can = f.recs.filter((r) => !out.includes(r) && itemCategory(r.type, lootDef(r.type)) === cat).sort((a, b) => Number(a.safe) - Number(b.safe) || a.value - b.value);
      if (can.length < n) return null;
      out.push(...can.slice(0, n));
    }
    return out;
  }
  canAfford(p: PlayerSim, cash: number, items: Partial<Record<ItemCategory, number>>) { return p.cash >= cash && !!this.pick(this.of(p), items); }
  buyUpgrade(p: PlayerSim, id: UpgradeId) {
    if (this.w.match.phase !== "prep") return;
    const u = UPGRADE.get(id), f = this.of(p);
    if (!u || f.ups.has(id)) return;
    if (u.needs.some((n) => !f.ups.has(n))) return this.w.emit({ t: "fortNo", p: p.id, reason: "needs" });
    const use = this.pick(f, u.items);
    if (p.cash < u.cash || !use) return this.w.emit({ t: "fortNo", p: p.id, reason: "cost" });
    p.cash -= u.cash;
    f.recs = f.recs.filter((r) => !use.includes(r));
    f.ups.add(id); f.v++;
    this.w.emit({ t: "upgraded", p: p.id, id, level: this.level(f) });
  }
  craft(p: PlayerSim, id: GearId) {
    if (this.w.match.phase !== "prep") return;
    const r = RECIPE.get(id), f = this.of(p);
    if (!r) return;
    if (!f.ups.has("workbench")) return this.w.emit({ t: "fortNo", p: p.id, reason: "workbench" });
    const use = this.pick(f, r.items);
    if (p.cash < r.cash || !use) return this.w.emit({ t: "fortNo", p: p.id, reason: "cost" });
    p.cash -= r.cash;
    f.recs = f.recs.filter((x) => !use.includes(x));
    f.gear[id] = (f.gear[id] ?? 0) + r.makes; f.v++;
    this.w.emit({ t: "crafted", p: p.id, id });
  }
  /** use up one of a crafted thing (true if there was one) */
  useGear(p: PlayerSim, id: GearId): boolean {
    const f = this.of(p), n = f.gear[id] ?? 0;
    if (n <= 0) return false;
    f.gear[id] = n - 1; f.v++;
    return true;
  }
  /** take one fort level away (a failed campaign): the level upgrade goes; storage and gear stay; nothing deleted */
  downgrade(p: PlayerSim) {
    const f = this.of(p);
    for (const id of ["level4", "level3", "level2"] as const) if (f.ups.has(id)) { f.ups.delete(id); break; }
    // (anything whose prerequisite went stays bought: you keep what you paid for; only new purchases check it)
    const cap = this.safeCap(f);
    const safe = f.recs.filter((r) => r.safe).sort((a, b) => b.value - a.value);
    for (const r of safe.slice(cap)) r.safe = false; // (the cheapest come out of the safe)
    f.v++;
  }

  // ------------------------------------------------------------------------------------------------- night theft
  /** start stealing `recId` from `ownerId`'s shelves: night, in their yard, in reach, it's exposed, your hands can take it */
  theftStart(p: PlayerSim, ownerId: string, recId: string) {
    const no = (reason: string) => this.w.emit({ t: "theftNo", p: p.id, reason });
    if (this.w.match.phase !== "night") return no("day");
    const owner = this.w.players.get(ownerId);
    if (!owner || owner === p || p.move.knockT > 0 || p.jailT > 0) return no("cant");
    const f = this.of(owner), r = f.recs.find((x) => x.id === recId);
    if (!r) return no("gone");
    if (r.safe) return no("safe");
    for (const th of this.thefts.values()) if (th.rec === recId && th.owner === ownerId) return no("taken"); // (someone else is on it)
    const lot = this.w.arena.forts?.find((q) => q.slot === owner.colorIdx);
    if (!lot) return no("far");
    // (R14: measured to the thing itself, where it's drawn: the client aims within theftReach of the same spot. The
    //  fort's centre was 5.9 m at most, but the outer shelf spots stand 5.7 m out to the side: you could aim and be refused)
    const exposed = f.recs.filter((x) => !x.safe), k = exposed.indexOf(r), at = shelfSpot(lot, k < this.shelfCap(f) ? k : 16 + (k - this.shelfCap(f)));
    if (hyp(p.move.x - at.x, p.move.z - at.z) > LOOP.theftReach + 0.6) return no("far");
    if (!this.canCarry(p, r.type)) return no("hands");
    const need = f.ups.has("alarm2") ? LOOP.theftTimeAlarm : LOOP.theftTime;
    this.thefts.set(p.id, { owner: ownerId, rec: recId, t: 0, need, x: p.move.x, z: p.move.z });
    this.w.emit({ t: "theftStart", p: p.id, owner: ownerId, type: r.type, need });
    if (f.ups.has("alarm1")) this.w.emit({ t: "fortAlarm", p: ownerId, thief: f.ups.has("alarm2") ? p.id : "", x: f.ups.has("alarm2") ? p.move.x : 0, z: f.ups.has("alarm2") ? p.move.z : 0, type: r.type });
  }
  theftStop(p: PlayerSim) { if (this.thefts.delete(p.id)) this.w.emit({ t: "theftEnd", p: p.id, ok: false, reason: "let go" }); }
  private canCarry(p: PlayerSim, type: string) {
    const d = lootDef(type);
    if (d.size === "small") return p.pockets.includes("") || !p.hand;
    return !p.hand;
  }
  theftTick(dt: number) {
    for (const [pid, th] of this.thefts) {
      const p = this.w.players.get(pid), owner = this.w.players.get(th.owner);
      const f = owner ? this.of(owner) : undefined, r = f?.recs.find((x) => x.id === th.rec);
      const cancel = (reason: string) => { this.thefts.delete(pid); this.w.emit({ t: "theftEnd", p: pid, ok: false, reason }); };
      if (!p || !owner || !f || !r || r.safe) { cancel("gone"); continue; }
      if (!p.connected || p.move.knockT > 0 || p.jailT > 0 || p.respawnT > 0) { cancel("knocked"); continue; }
      if (this.w.match.phase !== "night") { cancel("time"); continue; }
      if (hyp(p.move.x - th.x, p.move.z - th.z) > LOOP.theftDrift) { cancel("moved"); continue; }
      th.t += dt;
      if (th.t < th.need) continue;
      if (!this.canCarry(p, r.type)) { cancel("hands"); continue; }
      // done: off their shelves, into your hands (unbanked: carry it home and bank it)
      f.recs = f.recs.filter((x) => x !== r); f.v++;
      this.thefts.delete(pid);
      const id = this.give(p, r.type, r.value);
      this.w.emit({ t: "theftEnd", p: pid, ok: true, reason: "", item: id, type: r.type, owner: owner.id, value: r.value });
      this.w.loopAura?.theft(p, r.id);
    }
  }
  cancelAllThefts(reason: string) { for (const pid of [...this.thefts.keys()]) { this.thefts.delete(pid); this.w.emit({ t: "theftEnd", p: pid, ok: false, reason }); } }
  /** a brand-new item straight into a player's pocket or hands (theft, rewards) */
  give(p: PlayerSim, type: string, value: number): string {
    const d = lootDef(type), m = p.move;
    const id = this.w.placeItem(type, m.x, m.y + 0.6, m.z);
    const it = this.w.items.get(id)! as ItemSim;
    it.value = value; it.mult = 1;
    const slot = d.size === "small" ? p.pockets.indexOf("") : -1;
    if (slot >= 0) { p.pockets[slot] = id; it.mode = "pocket"; it.holder = p.id; }
    else if (!p.hand) { p.hand = id; it.mode = "held"; it.holder = p.id; it.holder2 = ""; }
    // (no room: it lands at your feet)
    this.w.refreshCarry(p);
    return id;
  }

  // ------------------------------------------------------------------------------------------------- the view
  /** a player's fort as the client sees it (everyone sees everyone's shelves: that's how a thief picks) */
  view(p: PlayerSim): object {
    const f = this.of(p), th = this.thefts.get(p.id);
    return {
      L: this.level(f), S: this.shelfCap(f), F: this.safeCap(f), u: [...f.ups],
      r: f.recs.map((r) => [r.id, r.type, r.value, r.safe ? 1 : 0]),
      g: f.gear,
      ...(this.w.match.phase === "prep" ? { w: this.wanted, ws: [...f.wantedSold] } : {}),
      ...(th ? { th: [th.owner, th.rec, Math.round(th.t * 10) / 10, th.need] } : {}),
    };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// WHERE THINGS ARE IN A FORT (shared by the renderer and the thief's aim). In the fort's own frame: u to the right as
// you face the fort from the city, v toward the city; the fort box is at (0, 0). Two shelf units
// (8 spots each, two tiers) either side of its front, the safe by the door, the workbench and the job board in the back
// corners, the "lawn" (over capacity) in front.
export interface FortLotLike { x: number; z: number; yaw: number; padX: number; padZ: number }
export const FORT_SPOTS = {
  shelfUnits: [{ u: -4.4, v: 1.2 }, { u: 4.4, v: 1.2 }], // (either side of the fort's front, facing the mat: you see what you've banked)
  shelfTiers: [0.62, 1.32], shelfCols: [-0.93, -0.31, 0.31, 0.93],
  safe: { u: 1.9, v: 0.7 }, workbench: { u: 5.4, v: -2.2 }, board: { u: -5.4, v: -2.2 }, alarm: { u: -1.9, v: 1.3 },
} as const;
/** a point in a fort's frame → world (x, z) */
export function fortAt2(lot: FortLotLike, u: number, v: number) {
  const s = Math.sin(lot.yaw), c = Math.cos(lot.yaw);
  return { x: lot.x + u * c + v * s, z: lot.z - u * s + v * c };
}
/** the i-th shelf spot (0-15: the left unit's lower tier, its upper, then the right unit's) or, past 16, the lawn */
export function shelfSpot(lot: FortLotLike, i: number): { x: number; y: number; z: number } {
  if (i >= 16) { const k = i - 16, p = fortAt2(lot, -2.4 + (k % 6) * 0.95, 2.2 + Math.floor(k / 6) * 0.9); return { x: p.x, y: 0.15, z: p.z }; }
  const unit = FORT_SPOTS.shelfUnits[Math.floor(i / 8)], tier = Math.floor((i % 8) / 4), col = i % 4;
  const p = fortAt2(lot, unit.u + FORT_SPOTS.shelfCols[col], unit.v);
  return { x: p.x, y: FORT_SPOTS.shelfTiers[tier], z: p.z };
}
