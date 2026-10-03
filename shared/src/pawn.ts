// Phase 5A: the shop round. "Honest" Sal at Pawn-O-Rama makes an offer on everything in your fort.
// Accept it, or HAGGLE: read his mood to guess how far he'll go. Push past his limit and he gets
// offended: the offer drops and that's his final word. Anything you don't sell is lost (Blake).
import { lootDef } from "./loot.js";
import type { World, PlayerSim } from "./world.js";

/**
 * C5c.3: PAWN-O-RAMA, Sal's real shop in the Yards (any time of day):
 *  - fence: hand him what's in your hands, cash on the spot (cheaper than the end-of-day offers);
 *  - pawn: a loan now, your thing goes in the window case with your colour on it; buy it back before dawn,
 *    or at dawn it goes on sale to anybody;
 *  - smash the case (3 punches): everything in it spills on the floor, the alarm goes, Big Vinnie comes swinging.
 */
export const PAWN_SHOP = { fence: 0.4, loan: 0.3, back: 0.4, sale: 0.7, smashHeat: 25, caseMax: 8 };
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

  private no(p: PlayerSim, reason: "hands" | "full" | "broke" | "nothing") { this.w.emit({ t: "pawnNo", p: p.id, reason }); }

  /** E at Sal's counter with something in your hands: he buys it there and then */
  fence(p: PlayerSim) {
    const it = this.w.activeItem(p)?.item;
    if (!it) return this.no(p, "hands");
    const offer = price(it.value, PAWN_SHOP.fence);
    this.w.consumeItem(p, it.id);
    p.cash += offer;
    this.w.emit({ t: "fenced", p: p.id, type: it.type, cash: offer });
  }

  /** E at the pawn case: pawn what's in your hands; empty-handed, buy back your own (or, after dawn, anything on sale) */
  caseUse(p: PlayerSim) {
    const it = this.w.activeItem(p)?.item;
    if (it) {
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
      const list: PawnOffer[] = items.map((it) => {
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
