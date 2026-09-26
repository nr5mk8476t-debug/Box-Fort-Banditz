// Phase 5A: the shop round. "Honest" Sal at Pawn-O-Rama makes an offer on everything in your fort.
// Accept it, or HAGGLE: read his mood to guess how far he'll go. Push past his limit and he gets
// offended: the offer drops and that's his final word. Anything you don't sell is lost (Blake).
import { lootDef } from "./loot.js";
import type { World, PlayerSim } from "./world.js";

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
