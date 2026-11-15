// R14: STORE SECURITY at the high-end stores (CARAT & RUN, MAISON PONG; stores.ts HIGH_END_STORES). Readable, in order:
//  1. you lift something off a shelf: a WARNING ("Pay for that, please.")
//  2. you walk at them with it, still inside: a SHOVE (back into the shop; no damage)
//  3. you leave the store with it: a CHASE: 10 s at most, never more than 25 m from the door (npcSim: the leash)
//  4. they catch you: the TACKLE: you're down, everything drops, and what you lifted goes back to the store
// The history belongs to the THING, not the thief (R14.1): dropping it, picking it up again or passing it to a mate
// changes nothing; security chases whoever has it. It ends when they take it back or give up (you got away with it).
// They stand inside, beside the door (city.ts): never in the doorway, the street or anyone's fort.
import type { World, PlayerSim } from "../world.js";
import { SECURITY } from "../npc.js";
import { inRect } from "../arena.js";
import { hyp } from "../fmath.js";

export type SecurityEvent =
  | { t: "secWarn"; p: string; npc: string; store: string }
  | { t: "secShove"; p: string; npc: string }
  | { t: "secChase"; p: string; npc: string; store: string }
  | { t: "secRetrieve"; p: string; npc: string; types: string[] };

/** a lifted thing's history: it stays with the THING (dropped, picked up again, passed to a mate) until security takes
 *  it back (the tackle) or the thief gets away with it (security gives up). R14.1: dropping it inside used to wipe it. */
interface Lift { shop: number; heavy: string; carrier: string; shoved: number; chased: boolean }

export class ShopSecurity {
  /** item id -> its history */
  private lifts = new Map<string, Lift>();
  constructor(private w: World) {}

  private shopOf(i: number) { return (this.w.arena.shops ?? []).find((s) => s.id === i); }
  /** who's carrying it now ("" = nobody) */
  private carrierOf(id: string) {
    const it = this.w.items.get(id);
    if (!it?.holder) return undefined;
    const p = this.w.players.get(it.holder);
    return p && (p.hand === id || p.pockets.includes(id)) ? p : undefined;
  }
  /** is this thing stolen from a guarded store (and not yet resolved)? (tests, the UI) */
  isHot(itemId: string) { return this.lifts.has(itemId); }
  /** a shoplift (props.ts): only the stores with security care */
  lifted(pid: string, shop: number, item: string) {
    const h = this.w.npc.heavyOf(shop);
    if (!h || !item) return;
    this.lifts.set(item, { shop, heavy: h.id, carrier: pid, shoved: -99, chased: false });
    this.w.npc.heavySay(h.id, "warn");
    this.w.emit({ t: "secWarn", p: pid, npc: h.id, store: this.shopOf(shop)?.name ?? "" });
  }
  tick() {
    if (!this.lifts.size) return;
    for (const [id, l] of this.lifts) {
      const it = this.w.items.get(id), h = this.w.npc.npcs.get(l.heavy), shop = this.shopOf(l.shop);
      if (!it || !shop) { this.lifts.delete(id); continue; } // (gone: banked, sold, deleted at the deadline)
      const p = this.carrierOf(id);
      // got away with it: the chase was on and security's given up (or been flattened)
      if (l.chased && (!h || h.state === "ko" || (h.state !== "chase" && h.state !== "windup"))) { this.lifts.delete(id); continue; }
      if (!p) continue; // (lying about, in the store or not: still stolen; whoever picks it up next carries the history)
      if (!h || h.state === "ko") continue;
      l.carrier = p.id;
      const inside = inRect(shop.rect, p.move.x, p.move.z, 0.3);
      if (inside && !l.chased) {
        // walking at the security with it: a shove back in (once a second at most)
        if (hyp(p.move.x - h.move.x, p.move.z - h.move.z) < SECURITY.shoveReach && this.w.time - l.shoved > 1) {
          l.shoved = this.w.time;
          const dx = p.move.x - h.move.x, dz = p.move.z - h.move.z, d = Math.max(0.01, hyp(dx, dz));
          const cx = (shop.rect.minX + shop.rect.maxX) / 2 - h.move.x, cz = (shop.rect.minZ + shop.rect.maxZ) / 2 - h.move.z, c = Math.max(0.01, hyp(cx, cz));
          p.move.vx = ((dx / d + cx / c) / 2) * SECURITY.shove; p.move.vz = ((dz / d + cz / c) / 2) * SECURITY.shove;
          this.w.npc.heavySay(h.id, "warn");
          this.w.emit({ t: "secShove", p: p.id, npc: h.id });
        }
        continue;
      }
      if (inside) continue;
      // out of the door with it: after whoever has it now (passed to a mate: after the mate)
      if (!l.chased) {
        l.chased = true;
        this.w.npc.heavyChase(h.id, p.id);
        this.w.emit({ t: "secChase", p: p.id, npc: h.id, store: shop.name });
      } else if (h.target !== p.id) this.w.npc.heavyRetarget(h.id, p.id);
    }
  }
  /** the tackle (World.npcHitPlayer): what they were carrying from this heavy's store goes back */
  tackled(p: PlayerSim, npcId: string) {
    const types: string[] = [];
    for (const [id, l] of this.lifts) {
      if (l.carrier !== p.id || l.heavy !== npcId) continue;
      const it = this.w.items.get(id);
      if (it && !it.holder) { types.push(it.type); this.w.items.delete(id); }
      this.lifts.delete(id);
    }
    this.w.npc.heavySay(npcId, "win");
    this.w.emit({ t: "secRetrieve", p: p.id, npc: npcId, types });
  }
  resetAll() { this.lifts.clear(); }
}
