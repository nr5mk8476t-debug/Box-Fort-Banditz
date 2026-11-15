// R14: STORE SECURITY at the high-end stores (CARAT & RUN, MAISON PONG; stores.ts HIGH_END_STORES). Readable, in order:
//  1. you lift something off a shelf: a WARNING ("Pay for that, please.")
//  2. you walk at them with it, still inside: a SHOVE (back into the shop; no damage)
//  3. you leave the store with it: a CHASE: 10 s at most, never more than 25 m from the door (npcSim: the leash)
//  4. they catch you: the TACKLE: you're down, everything drops, and what you lifted goes back to the store
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

interface Lift { p: string; shop: number; heavy: string; item: string; shoved: number }

export class ShopSecurity {
  /** lifted things being watched: item id -> who, which store */
  private lifts = new Map<string, Lift>();
  constructor(private w: World) {}

  private shopOf(i: number) { return (this.w.arena.shops ?? []).find((s) => s.id === i); }
  /** a shoplift (props.ts): only the stores with security care */
  lifted(pid: string, shop: number, item: string) {
    const h = this.w.npc.heavyOf(shop);
    if (!h || !item) return;
    this.lifts.set(item, { p: pid, shop, heavy: h.id, item, shoved: 0 });
    this.w.npc.heavySay(h.id, "warn");
    this.w.emit({ t: "secWarn", p: pid, npc: h.id, store: this.shopOf(shop)?.name ?? "" });
  }
  tick() {
    if (!this.lifts.size) return;
    for (const [id, l] of this.lifts) {
      const it = this.w.items.get(id), p = this.w.players.get(l.p), h = this.w.npc.npcs.get(l.heavy), shop = this.shopOf(l.shop);
      const holding = !!it && !!p && (p.hand === id || p.pockets.includes(id));
      if (!it || !p || !h || h.state === "ko" || !shop || !holding) { if (!(h?.state === "chase" && h.target === l.p && holding)) this.lifts.delete(id); continue; }
      const inside = inRect(shop.rect, p.move.x, p.move.z, 0.3);
      if (inside) {
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
      // out of the door with it: after them
      if (h.state !== "chase" && h.state !== "windup" && h.state !== "huff") {
        this.w.npc.heavyChase(h.id, p.id);
        this.w.emit({ t: "secChase", p: p.id, npc: h.id, store: shop.name });
      } else if (h.state === "huff") this.lifts.delete(id); // (they gave up: it's yours)
    }
  }
  /** the tackle (World.npcHitPlayer): what they lifted from this heavy's store goes back */
  tackled(p: PlayerSim, npcId: string) {
    const types: string[] = [];
    for (const [id, l] of this.lifts) {
      if (l.p !== p.id || l.heavy !== npcId) continue;
      const it = this.w.items.get(id);
      if (it && !it.holder) { types.push(it.type); this.w.items.delete(id); }
      this.lifts.delete(id);
    }
    this.w.npc.heavySay(npcId, "win");
    this.w.emit({ t: "secRetrieve", p: p.id, npc: npcId, types });
  }
  resetAll() { this.lifts.clear(); }
}
