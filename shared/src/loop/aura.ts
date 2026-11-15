// R14: AURA, the other score: reputation, and what qualifies you for MAYOR. Every change goes through here with a reason
// (the client shows "+2 AURA: stole a lava lamp"), and the small earners have rules against farming:
//  - a cop knocked down: +1, each cop once a cycle, 3 a cycle at most
//  - a theft from a rival's fort: +2, each banked thing once a cycle (stealing it back and forth pays once)
//  - banking pays no aura at all; interruptions are once per pair a cycle (quests.ts)
import type { World, PlayerSim } from "../world.js";
import { LOOP } from "./catalog.js";
import type { SecurityEvent } from "./security.js";
import type { MayorEvent } from "./mayor.js";

export type LoopEvent =
  | { t: "storageFull"; p: string }
  | { t: "banked"; p: string; types: string[]; value: number }
  | { t: "vanSold"; p: string; types: string[]; cash: number }
  | { t: "fortNo"; p: string; reason: string }
  | { t: "upgraded"; p: string; id: string; level: number }
  | { t: "crafted"; p: string; id: string }
  | { t: "theftNo"; p: string; reason: string }
  | { t: "theftStart"; p: string; owner: string; type: string; need: number }
  | { t: "fortAlarm"; p: string; thief: string; x: number; z: number; type: string }
  | { t: "theftEnd"; p: string; ok: boolean; reason: string; item?: string; type?: string; owner?: string; value?: number }
  | { t: "loopWarn"; left: number; round: number }
  | { t: "aura"; p: string; n: number; why: string; total: number }
  | { t: "moustache"; p: string }
  // (stage 4: quests.ts)
  | { t: "questNo"; p: string; reason: string }
  | { t: "questStart"; p: string; src: "task" | "job"; name: string; text: string; cost: number; boss?: string }
  | { t: "questEnd"; p: string; src: "task" | "job"; name: string; ok: boolean; reason: string; aura: number; cash: number; rep?: number }
  | { t: "questLive"; p: string; name: string; x: number; z: number }
  | { t: "questInterrupt"; p: string; by: string; name: string; scored: boolean }
  | { t: "bananaSlip"; p: string; owner: string }
  | SecurityEvent
  | MayorEvent;

export class AuraSystem {
  private copsHit = new Map<string, Set<string>>();
  private stolen = new Set<string>();
  constructor(private w: World) {}

  resetMatch() { this.copsHit.clear(); this.stolen.clear(); }
  newCycle() { this.copsHit.clear(); this.stolen.clear(); }

  /** add (or take: n < 0, never below 0) aura, with the reason shown to the player */
  grant(p: PlayerSim, n: number, why: string) {
    const before = p.aura;
    p.aura = Math.max(0, Math.round(p.aura + n));
    const d = p.aura - before;
    if (d) this.w.emit({ t: "aura", p: p.id, n: d, why, total: p.aura });
    return d;
  }
  /** a cop knocked down by `p` */
  cop(p: PlayerSim, copId: string) {
    let s = this.copsHit.get(p.id); if (!s) this.copsHit.set(p.id, (s = new Set()));
    if (s.has(copId) || s.size >= LOOP.copAuraMax) return 0;
    s.add(copId);
    return this.grant(p, LOOP.copAura, "flattened a cop");
  }
  /** a banked thing stolen from a rival's fort: each LOOT once a cycle, whoever steals it, however often it's banked
   *  again in between (`uid`: its permanent identity, Rec.uid) */
  theft(p: PlayerSim, uid: string) {
    if (this.stolen.has(uid)) return 0;
    this.stolen.add(uid);
    return this.grant(p, LOOP.theftAura, "a night-time theft");
  }
}
