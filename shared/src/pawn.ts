// Phase 5A: the shop round. "Honest" Sal at Pawn-O-Rama makes an offer on everything in your fort.
// Accept it, or HAGGLE: read his mood to guess how far he'll go. Push past his limit and he gets
// offended: the offer drops and that's his final word. Anything you don't sell is lost (Blake).
import { lootDef, LOOT } from "./loot.js";

import type { World, PlayerSim } from "./world.js";
import { hyp } from "./fmath.js";

/**
 * C5c.3: PAWN-O-RAMA, Sal's real shop in the Yards (any time of day):
 *  - fence: hand him what's in your hands, cash on the spot (cheaper than the end-of-day offers);
 *  - pawn: a loan now, your thing goes in the window case with your colour on it; buy it back before dawn,
 *    or at dawn it goes on sale to anybody;
 *  - smash the case (3 punches): everything in it spills on the floor, the alarm goes, Big Vinnie comes swinging.
 */
export const PAWN_SHOP = { fence: 0.4, loan: 0.3, back: 0.4, sale: 0.7, smashHeat: 25, caseMax: 8 };
/**
 * R5/R7: the new city's two walk-in pawn shops (HOT STUFF PAWN & LOAN: Twitchy Lou; FINDERS KEEPERS PAWN: Sticky
 * Fran). You sell over the till (cash on the spot, like Sal's counter). Each scavenge each owner wants 3 things: bring
 * one and they pay x3 what it's worth (the first of each only, per shop). They mutter their list to whoever walks up
 * to the till (just them). Nothing to rob: the bouncer only comes if you punch the owner, throw stuff at them or
 * smash a glass counter.
 */
export const HOT_STUFF = { hotMult: 3, listSize: 3, hintR: 2.6, throwR: 1.3 };
export interface PawnSlot { type: string; value: number; owner: string; color: number; loan: number; back: number; sale: boolean }
const price = (v: number, k: number) => Math.max(1, Math.round(v * k));

export type PawnMood = "eager" | "thinking" | "sweaty" | "offended" | "done";
export type OfferState = "open" | "final" | "sold";

export interface PawnOffer {
  id: string;
  type: string;
  /** what it's really worth (the player only sees it if it isn't a mystery item) */
  value: number;
  offer: number;
  /** the most Sal would ever pay (secret) */
  max: number;
  mood: PawnMood;
  state: OfferState;
  haggles: number;
  line: string;
}

/** What a player sees about one offer (no secret max; mystery values stay hidden). */
export interface OfferView { id: string; type: string; value: number; offer: number; mood: PawnMood; state: OfferState; line: string; }

export const MAX_HAGGLES = 4;

const LINES: Record<PawnMood, string[]> = {
  eager: ["Ooh. Ooh! I mean... it's alright.", "My cousin would LOVE this. Uh, I mean, meh.", "*trying very hard not to smile*"],
  thinking: ["Hmm. I dunno, pal.", "*strokes chin* Maybe. Maybe not.", "Times are tough, you know?"],
  sweaty: ["Don't push it, pal.", "*sweating* That's already generous.", "You're killing me here."],
  offended: ["Now you're insulting me. That's my FINAL offer.", "Get outta here with that! Final offer.", "Oh, a comedian! Take it or leave it."],
  done: ["Pleasure doing business.", "Heh. Sucker. I mean, thank you!", "Don't tell anyone where you got it."],
};

export class PawnSystem {
  private offers = new Map<string, PawnOffer[]>();
  private version = new Map<string, number>();
  private cache = new Map<string, { v: number; json: string }>();

  constructor(private w: World) {}

  // ---------------------------------------------------------------- C5c.3 PAWN-O-RAMA
  /** what's in the window case (oldest first) */
  readonly slots: PawnSlot[] = [];
  private noteV = -1; private noteJson = ""; private slotsV = 0;

  private no(p: PlayerSim, reason: "hands" | "full" | "broke" | "nothing" | "black") { this.w.emit({ t: "pawnNo", p: p.id, reason }); }

  /** E at Sal's counter (R7: a pawn shop's till) with something in your hands: they buy it there and then */
  fence(p: PlayerSim, shop = -1) {
    const it = this.w.activeItem(p)?.item;
    if (!it) return this.no(p, "hands");
    if (lootDef(it.type).blackMarket) return this.no(p, "black"); // (R6: nobody legit touches the Spoon of Destiny)
    const h = shop >= 0 ? this.lists[shop] : undefined;
    const hot = !!h && h.hot.includes(it.type) && !h.claimed.has(it.type);
    const offer = hot ? Math.max(1, Math.round(it.value * HOT_STUFF.hotMult)) : price(it.value, PAWN_SHOP.fence);
    if (hot) h!.claimed.add(it.type);
    this.w.consumeItem(p, it.id);
    p.cash += offer;
    this.w.emit({ t: "fenced", p: p.id, type: it.type, cash: offer, hot, shop });
  }

  // ---------------------------------------------------------------- R5/R7 the walk-in pawn shops
  private get shops() { return this.w.arena.hotShops ?? []; }
  /** each shop's wanted list today, the ones somebody already brought in, who the owner has told */
  readonly lists: { hot: string[]; claimed: Set<string>; told: Set<string> }[] = [];
  private seenThrown = new Set<string>();

  /** what's still wanted today at a shop */
  wanted(shop = 0): string[] { const h = this.lists[shop]; return h ? h.hot.filter((t) => !h.claimed.has(t)) : []; }
  /** has this shop's owner told this player today's list? */
  knows(pid: string, shop = 0) { return !!this.lists[shop]?.told.has(pid); }
  /** (R5 tests: Lou's list = the first shop's) */
  get hot(): string[] { return this.lists[0]?.hot ?? []; }
  get claimed(): Set<string> { return this.lists[0]?.claimed ?? new Set(); }

  /** a new scavenge: each owner picks 3 things they want (from what's out there today; the two lists differ) */
  rollHot() {
    this.seenThrown.clear();
    this.lists.length = 0;
    const ok = (t: string) => { const d = lootDef(t); return !d.junk && !d.mystery && d.size !== "giant" && !d.money && !d.blackMarket && d.valueMax >= 4; };
    const pool = [...new Set([...this.w.items.values()].filter((it) => it.mode === "free" && it.fort < 0 && it.shop === -1 && ok(it.type)).map((it) => it.type))].sort();
    const fallback = LOOT.filter((d) => d.spawnWeight > 0 && ok(d.type)).map((d) => d.type);
    const taken = new Set<string>();
    for (let i = 0; i < this.shops.length; i++) {
      const out: string[] = [];
      for (const src of [pool, fallback]) {
        const a = src.filter((t) => !taken.has(t));
        while (out.length < HOT_STUFF.listSize && a.length) { const t = a.splice(Math.floor(this.w.random() * a.length), 1)[0]; if (!out.includes(t)) out.push(t); }
      }
      for (const t of out) taken.add(t);
      this.lists.push({ hot: out, claimed: new Set(), told: new Set() });
    }
  }

  private staff(shop: number, bouncer: boolean) {
    const hs = this.shops[shop];
    if (!hs) return null;
    for (const n of this.w.npc.npcs.values()) if (n.kind === (bouncer ? hs.bouncer : hs.owner)) return n;
    return null;
  }

  /** somebody started trouble at a shop: its bouncer comes for them (unless he's out cold) */
  trouble(p: PlayerSim, why: "punch" | "smash" | "throw", shop = 0) {
    const hs = this.shops[shop];
    if (!hs) return;
    const g = this.staff(shop, true);
    if (!g || g.state === "ko") return;
    if (g.state === "chase" && g.target === p.id) return;
    this.w.npc.guardsAlert(p.id, hs.bouncer);
    this.w.emit({ t: "pawnTrouble", p: p.id, why, shop });
  }

  /** (no back rooms any more: nothing to lift) */
  onGrab(_p: PlayerSim, _x: number, _z: number) { /* R7: nothing to steal in the pawn shops */ }

  tick(_dt: number) {
    const shops = this.shops;
    if (!shops.length) return;
    shops.forEach((hs, i) => {
      const h = this.lists[i];
      if (!h) return;
      const boss = this.staff(i, false);
      for (const p of this.w.players.values()) {
        if (!p.connected || p.jailT > 0 || h.told.has(p.id) || !boss || boss.state !== "work") continue;
        // the owner mutters today's list to whoever walks up to the till (just them)
        if (hyp(p.move.x - hs.stand.x, p.move.z - hs.stand.z) < HOT_STUFF.hintR && p.move.y < 1.5) {
          h.told.add(p.id);
          this.w.emit({ t: "louList", p: p.id, types: this.wanted(i), shop: i });
        }
      }
      // stuff thrown at the owner
      for (const it of this.w.items.values()) {
        if (!it.lastThrower || it.thrownT > 1.0 || this.seenThrown.has(it.id)) continue;
        if (hyp(it.body.x - hs.boss.x, it.body.z - hs.boss.z) > HOT_STUFF.throwR || it.body.y < 0.6 || it.body.y > 2.6) continue;
        this.seenThrown.add(it.id);
        const p = this.w.players.get(it.lastThrower);
        if (p) this.trouble(p, "throw", i);
      }
    });
  }

  /** E at the pawn case: pawn what's in your hands; empty-handed, buy back your own (or, after dawn, anything on sale) */
  caseUse(p: PlayerSim) {
    const it = this.w.activeItem(p)?.item;
    if (it) {
      if (lootDef(it.type).blackMarket) return this.no(p, "black");
      if (this.slots.length >= PAWN_SHOP.caseMax) return this.no(p, "full");
      const loan = price(it.value, PAWN_SHOP.loan);
      this.slots.push({ type: it.type, value: it.value, owner: p.id, color: p.colorIdx, loan, back: price(it.value, PAWN_SHOP.back), sale: false });
      this.slotsV++;
      this.w.consumeItem(p, it.id);
      p.cash += loan;
      this.w.emit({ t: "pawned", p: p.id, type: it.type, cash: loan });
      return;
    }
    const mine = this.slots.findIndex((s) => s.owner === p.id && !s.sale);
    const i = mine >= 0 ? mine : this.slots.findIndex((s) => s.sale);
    if (i < 0) return this.no(p, "nothing");
    const s = this.slots[i];
    const cost = s.sale ? price(s.value, PAWN_SHOP.sale) : s.back;
    if (p.cash < cost) return this.no(p, "broke");
    p.cash -= cost;
    this.slots.splice(i, 1); this.slotsV++;
    const ps = this.casePos();
    const id = this.w.popLoot(s.type, ps.x, ps.y + 0.4, ps.z, p.move.x - ps.x, p.move.z - ps.z);
    const got = this.w.items.get(id);
    if (got) got.value = s.value;
    this.w.emit({ t: "redeemed", p: p.id, type: s.type, cash: cost, sale: s.sale });
  }

  /** the case got smashed: everything in it spills toward the smasher */
  smash(p: PlayerSim, x: number, z: number) {
    const ps = this.casePos();
    for (const s of this.slots.splice(0)) {
      const id = this.w.popLoot(s.type, ps.x, ps.y + 0.3, ps.z, x - ps.x + (this.w.random() - 0.5), z - ps.z + (this.w.random() - 0.5));
      const it = this.w.items.get(id);
      if (it) it.value = s.value;
    }
    this.slotsV++;
    this.w.addHeat(p, PAWN_SHOP.smashHeat);
    this.w.npc.guardsAlert(p.id, "vinnie");
    this.trouble(p, "smash");
    const till = [...this.w.props.props.values()].find((x) => x.def.kind === "pawncase");
    if (till) { till.alarmT = 8; this.w.emit({ t: "alarm", kind: "shop", prop: till.def.id, x: till.def.x, z: till.def.z }); }
    this.w.noise(p, ps.x, ps.z, 25);
    this.w.emit({ t: "caseSmashed", p: p.id });
  }

  /** (test tools: put something in the case) */
  debugAdd(type: string, value: number, owner: string, color: number, sale = false) {
    this.slots.push({ type, value, owner, color, loan: price(value, PAWN_SHOP.loan), back: price(value, PAWN_SHOP.back), sale });
    this.slotsV++;
  }
  /** dawn: whatever nobody bought back goes on sale (to anybody) */
  dawn() { let n = 0; for (const s of this.slots) if (!s.sale) { s.sale = true; n++; } if (n) this.slotsV++; }

  private casePos() { const c = this.w.arena.pawnShop; return c ? { x: c.caseX, y: c.caseY, z: c.caseZ } : { x: 0, y: 1, z: 0 }; }

  /** what everybody sees in the case: type, colour of the owner, buy-back or sale price, value (0 = mystery) */
  caseNote(): string {
    if (this.noteV === this.slotsV) return this.noteJson;
    this.noteV = this.slotsV;
    this.noteJson = this.slots.length ? JSON.stringify(this.slots.map((s) => ({ t: s.type, c: s.color, o: s.owner, p: s.sale ? price(s.value, PAWN_SHOP.sale) : s.back, s: s.sale ? 1 : 0, v: lootDef(s.type).mystery ? 0 : s.value }))) : "";
    return this.noteJson;
  }

  /** Shop round starts: Sal looks at everything sitting in each player's fort. */
  open(itemsByPlayer: Map<string, { id: string; type: string; value: number }[]>) {
    this.offers.clear();
    const r = () => this.w.random();
    for (const [pid, items] of itemsByPlayer) {
      const list: PawnOffer[] = items.filter((it) => !lootDef(it.type).blackMarket).map((it) => { // (R6: black market goods aren't his business)
        const value = Math.max(1, it.value);
        const offer = Math.max(1, Math.round(value * (0.5 + r() * 0.25)));
        // some days he's desperate, some days he's cheap
        const max = Math.max(offer + 1, Math.round(value * (0.8 + r() * 0.45)));
        const o: PawnOffer = { id: it.id, type: it.type, value: it.value, offer, max, mood: "thinking", state: "open", haggles: 0, line: "" };
        this.setMood(o);
        return o;
      });
      list.sort((a, b) => b.offer - a.offer);
      this.offers.set(pid, list);
      this.bump(pid);
    }
  }

  close() { this.offers.clear(); for (const k of [...this.version.keys()]) this.bump(k); }

  list(pid: string): PawnOffer[] { return this.offers.get(pid) ?? []; }

  /** How far he'll still go shows on his face (and sometimes he bluffs). */
  private setMood(o: PawnOffer) {
    const room = o.max / o.offer;
    let mood: PawnMood = room >= 1.3 ? "eager" : room >= 1.12 ? "thinking" : "sweaty";
    if (this.w.random() < 0.15) mood = mood === "eager" ? "thinking" : mood === "sweaty" ? "thinking" : this.w.random() < 0.5 ? "eager" : "sweaty"; // poker face
    o.mood = mood;
    o.line = pick(LINES[mood], this.w.random());
  }

  haggle(p: PlayerSim, id: string) {
    const o = this.list(p.id).find((x) => x.id === id);
    if (!o || o.state !== "open") return;
    o.haggles++;
    const ask = Math.round(o.offer * (1.12 + this.w.random() * 0.1));
    if (ask <= o.max) {
      o.offer = Math.max(o.offer + 1, ask);
      if (o.haggles >= MAX_HAGGLES) { o.state = "final"; o.mood = "sweaty"; o.line = "That's it. That's all I got. FINAL."; }
      else this.setMood(o);
      this.w.emit({ t: "pawn", p: p.id, item: id, r: "up", offer: o.offer });
    } else {
      o.offer = Math.max(1, Math.round(o.offer * 0.8));
      o.state = "final"; o.mood = "offended";
      o.line = pick(LINES.offended, this.w.random());
      this.w.emit({ t: "pawn", p: p.id, item: id, r: "offended", offer: o.offer });
    }
    this.bump(p.id);
  }

  sell(p: PlayerSim, id: string) {
    const o = this.list(p.id).find((x) => x.id === id);
    if (!o || o.state === "sold") return;
    o.state = "sold"; o.mood = "done";
    o.line = pick(LINES.done, this.w.random());
    p.cash += o.offer;
    this.w.emit({ t: "pawn", p: p.id, item: id, r: "sold", offer: o.offer });
    this.bump(p.id);
  }

  sellAll(p: PlayerSim) { for (const o of this.list(p.id)) if (o.state !== "sold") this.sell(p, o.id); }

  /** Unsold items (lost when the shop closes). */
  unsold(pid: string) { return this.list(pid).filter((o) => o.state !== "sold"); }

  private bump(pid: string) { this.version.set(pid, (this.version.get(pid) ?? 0) + 1); }

  /** JSON the player's screen reads (cached until something changes). */
  viewJson(pid: string): string {
    const v = this.version.get(pid) ?? 0;
    const c = this.cache.get(pid);
    if (c && c.v === v) return c.json;
    const out: OfferView[] = this.list(pid).map((o) => ({
      id: o.id, type: o.type, value: lootDef(o.type).mystery && o.state !== "sold" ? 0 : o.value,
      offer: o.offer, mood: o.mood, state: o.state, line: o.line,
    }));
    const json = out.length ? JSON.stringify(out) : "";
    this.cache.set(pid, { v, json });
    return json;
  }
}

function pick(a: string[], r: number) { return a[Math.floor(r * a.length) % a.length]; }
