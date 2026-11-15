// R14 stage 5: RUN FOR MAYOR (Blake's decisions, docs/game-loop-plan.md).
//  - QUALIFY: 60 aura, $800 (the fee), THE MAYOR'S FORT (level 4), CAMPAIGN POSTERS + a CEREMONIAL SASH (crafted).
//    Declared at your fort's board in the scavenge; the fee and the posters + sash are spent all at once.
//  - THE CAMPAIGN: 4:00, and the round's clock stops for everyone while it runs. One candidate at a time.
//    1. shake hands with PRESIDENT MARMALADE (an orange-faced giant, at an announced spot)
//    2. put up 5 of 8 posters (stand at a spot 1.5 s)
//    3. two goofy objectives, picked at random (GOOFY)
//    4. then the final SPEECH at the podium (10 s)
//  - STOPPING THEM: everyone sees the objectives, the President's spot and a ping of the candidate every 20 s.
//    A rival knocking the candidate down = a STRIKE (-15 s; what they carry drops, as always). 3 strikes, an arrest,
//    or the time running out = it FAILS: aura halved, the fort loses a level, no campaign again this cycle; nothing
//    else is lost. A BANANA PEEL makes the rival slip instead (no strike).
//  - WIN: the match ends there; the Mayor tops the results.
import type { World, PlayerSim, WorldEvent } from "../world.js";
import { LOOP } from "./catalog.js";
import { questLocs, type Loc } from "./quests.js";
import { FORT_SPOTS, fortAt2 } from "./fort.js";
import { SPECIAL_KINDS } from "../npc.js";

export const MAYOR = { presReach: 2.2, posterReach: 2.6, posterTime: 1.5, postersNeed: 5, posterSpots: 8, speechTime: 10, podiumReach: 3, pingEvery: 20, fleshReach: 2.0 };
export const PRESIDENT_NAME = "PRESIDENT MARMALADE";
type GoofyKind = "air" | "slides" | "photo" | "flesh";
export const GOOFY: { id: string; name: string; kind: GoofyKind; need: number; text: string }[] = [
  { id: "leap", name: "A DRAMATIC LEAP", kind: "air", need: 2.5, text: "2.5 s in the air: the cameras love it" },
  { id: "slides", name: "SLIDE INTO THE POLLS", kind: "slides", need: 3, text: "3 slides, anywhere" },
  { id: "photo", name: "A PHOTO OP", kind: "photo", need: 6, text: "stand still and smile at {loc} for 6 s" },
  { id: "flesh", name: "PRESS THE FLESH", kind: "flesh", need: 3, text: "get up close to 3 different members of the public" },
];

export type MayorEvent =
  | { t: "mayorNo"; p: string; reason: string }
  | { t: "mayorStart"; p: string; x: number; z: number }
  | { t: "mayorStep"; p: string; what: string }
  | { t: "mayorStrike"; p: string; by: string; strikes: number }
  | { t: "mayorPing"; p: string; x: number; z: number }
  | { t: "mayorEnd"; p: string; ok: boolean; reason: string };

interface Goofy { id: string; name: string; kind: GoofyKind; need: number; text: string; prog: number; loc: Loc | null; slid: boolean; met: Set<string> }
interface Campaign {
  p: string; t: number; strikes: number;
  pres: Loc; presNpc: string; presDone: boolean;
  posters: { loc: Loc; t: number; done: boolean }[];
  goofy: Goofy[];
  podium: Loc; speech: number;
  pingT: number; lastPing: { x: number; z: number } | null; v: number;
}

export class MayorSystem {
  private locs: Map<string, Loc>;
  c: Campaign | null = null;
  /** the cycle each player last failed in (no campaign again that cycle) */
  private failed = new Map<string, number>();
  private v = 0;
  constructor(private w: World) { this.locs = questLocs(w.arena); }

  resetMatch() { this.end(false, "", true); this.failed.clear(); this.v++; }

  /** what qualifying needs, and whether you have it: [label, ok] */
  check(p: PlayerSim): [string, boolean][] {
    const f = this.w.fort.of(p), g = f.gear;
    return [
      [`${LOOP.mayorAura} AURA`, p.aura >= LOOP.mayorAura],
      [`$${LOOP.mayorFee} FEE`, p.cash >= LOOP.mayorFee],
      ["THE MAYOR'S FORT", f.ups.has("level4")],
      ["CAMPAIGN POSTERS", (g.posters ?? 0) > 0],
      ["CEREMONIAL SASH", (g.sash ?? 0) > 0],
    ];
  }
  qualified(p: PlayerSim) { return this.check(p).every(([, ok]) => ok); }

  /** at your fort's board: declare (and start the campaign now) */
  run(p: PlayerSim): boolean {
    const no = (reason: string) => { this.w.emit({ t: "mayorNo", p: p.id, reason }); return false; };
    const m = this.w.match;
    if (!m.scavenging) return no("only during the scavenge");
    if (this.c) return no(this.c.p === p.id ? "you're already running" : "someone else is campaigning: stop them first");
    if (this.failed.get(p.id) === m.round) return no("not again this cycle");
    const lot = this.w.arena.forts?.find((f) => f.slot === p.colorIdx);
    if (!lot) return no("no fort");
    const b = fortAt2(lot, FORT_SPOTS.board.u, FORT_SPOTS.board.v);
    if (Math.hypot(p.move.x - b.x, p.move.z - b.z) > 3.4) return no("at your fort's board");
    const miss = this.check(p).filter(([, ok]) => !ok).map(([l]) => l);
    if (miss.length) return no("you need: " + miss.join(", "));
    const all = [...this.locs.values()].filter((l) => l.id !== "seamus");
    if (all.length < 3) return no("this map has nowhere to campaign");
    // spend it all at once
    const f = this.w.fort.of(p);
    p.cash -= LOOP.mayorFee; f.gear.posters! -= 1; f.gear.sash! -= 1; f.v++;
    const Q = this.w.loopQuests; Q.drop(p, "task"); Q.drop(p, "job");
    const pick = <T,>(xs: T[]) => xs.splice(Math.floor(this.w.random() * xs.length), 1)[0];
    const podium = this.locs.get("fountain") ?? this.locs.get("pub") ?? all[0];
    const presPool = all.filter((l) => l.id !== podium.id && Math.hypot(l.x - p.move.x, l.z - p.move.z) > 25);
    const pres = pick(presPool.length ? presPool : all.filter((l) => l.id !== podium.id));
    const posterPool = all.filter((l) => l.id !== podium.id).slice();
    const posters: Campaign["posters"] = [];
    while (posters.length < MAYOR.posterSpots && posterPool.length) posters.push({ loc: pick(posterPool), t: 0, done: false });
    const gPool = GOOFY.slice(), goofy: Goofy[] = [];
    for (let i = 0; i < 2; i++) {
      const g = pick(gPool);
      const loc = g.kind === "photo" ? all[Math.floor(this.w.random() * all.length)] : null;
      goofy.push({ ...g, text: g.text.replace("{loc}", loc?.name ?? ""), prog: 0, loc, slid: false, met: new Set() });
    }
    const npc = this.w.npc.spawnAt("president", pres.x, pres.z, Math.atan2(p.move.x - pres.x, p.move.z - pres.z));
    this.c = { p: p.id, t: LOOP.campaignTime, strikes: 0, pres, presNpc: npc?.id ?? "", presDone: false, posters, goofy, podium, speech: 0, pingT: 0, lastPing: { x: p.move.x, z: p.move.z }, v: 0 };
    m.paused = true; this.v++;
    this.w.emit({ t: "mayorStart", p: p.id, x: pres.x, z: pres.z });
    return true;
  }

  private end(ok: boolean, reason: string, silent = false) {
    const c = this.c;
    if (!c) return;
    this.c = null; this.v++;
    this.w.match.paused = false;
    if (c.presNpc) this.w.npc.npcs.delete(c.presNpc);
    if (silent) return;
    const p = this.w.players.get(c.p);
    this.w.emit({ t: "mayorEnd", p: c.p, ok, reason });
    if (!p) return;
    if (ok) { this.w.match.finish(p.id); return; }
    this.failed.set(p.id, this.w.match.round);
    this.w.loopAura.grant(p, -Math.floor(p.aura / 2), "the campaign failed");
    this.w.fort.downgrade(p);
  }

  tick(dt: number) {
    const c = this.c;
    if (!c) return;
    const p = this.w.players.get(c.p);
    if (!p || !p.connected) return this.end(false, "the candidate left");
    if (!this.w.match.scavenging) return this.end(false, "time's up");
    if (p.jailT > 0) return this.end(false, "arrested");
    c.t -= dt;
    if (c.t <= 0) return this.end(false, "out of time");
    c.pingT += dt;
    if (c.pingT >= MAYOR.pingEvery) { c.pingT = 0; c.lastPing = { x: p.move.x, z: p.move.z }; c.v++; this.w.emit({ t: "mayorPing", p: p.id, x: p.move.x, z: p.move.z }); }
    const m = p.move, up = m.knockT <= 0;
    const near = (l: Loc, r: number) => Math.hypot(m.x - l.x, m.z - l.z) < r;
    const step = (what: string) => { c.v++; this.w.emit({ t: "mayorStep", p: p.id, what }); };
    if (!up) return;
    if (!c.presDone) {
      const pn = this.w.npc.npcs.get(c.presNpc), px = pn?.move.x ?? c.pres.x, pz = pn?.move.z ?? c.pres.z;
      if (Math.hypot(m.x - px, m.z - pz) < MAYOR.presReach) { c.presDone = true; step("shook hands with " + PRESIDENT_NAME); }
    }
    for (const ps of c.posters) {
      if (ps.done || !near(ps.loc, MAYOR.posterReach)) { if (!ps.done) ps.t = 0; continue; }
      ps.t += dt;
      if (ps.t >= MAYOR.posterTime) { ps.done = true; step("a poster at " + ps.loc.name); }
    }
    for (const g of c.goofy) {
      if (g.prog >= g.need) continue;
      const before = Math.floor(g.prog);
      if (g.kind === "air") { if (!m.grounded) g.prog += dt; }
      else if (g.kind === "slides") { const s = m.slideT > 0; if (s && !g.slid) g.prog += 1; g.slid = s; }
      else if (g.kind === "photo") { if (g.loc && near(g.loc, g.loc.r) && m.grounded && Math.hypot(m.vx, m.vz) < 0.5) g.prog += dt; }
      else if (g.kind === "flesh") {
        for (const n of this.w.npc.npcs.values()) if (!SPECIAL_KINDS.has(n.kind) && n.state !== "ko" && !g.met.has(n.id) && Math.hypot(n.move.x - m.x, n.move.z - m.z) < MAYOR.fleshReach) { g.met.add(n.id); g.prog += 1; }
      }
      if (g.prog >= g.need) step(g.name);
      else if (Math.floor(g.prog) !== before) c.v++;
    }
    const ready = c.presDone && c.posters.filter((x) => x.done).length >= MAYOR.postersNeed && c.goofy.every((g) => g.prog >= g.need);
    if (ready && near(c.podium, MAYOR.podiumReach) && m.grounded) {
      const before = Math.floor(c.speech);
      c.speech += dt;
      if (Math.floor(c.speech) !== before) c.v++;
      if (c.speech >= MAYOR.speechTime) return this.end(true, "elected");
    } else if (c.speech > 0) { c.speech = 0; c.v++; }
  }

  /** a rival knocks the candidate down: a strike (or they slip on a banana peel) */
  onEvent(e: WorldEvent) {
    const c = this.c;
    if (!c || e.t !== "knockdown" || e.p !== c.p) return;
    const p = this.w.players.get(e.p), by = this.w.players.get(e.by);
    if (!p || !by || by === p) return;
    if (this.w.fort.useGear(p, "banana")) { this.w.emit({ t: "bananaSlip", p: by.id, owner: p.id }); this.w.knockdown(by, "banana"); return; }
    c.strikes++; c.t = Math.max(0.01, c.t - LOOP.strikeTime); c.v++;
    this.w.emit({ t: "mayorStrike", p: p.id, by: by.id, strikes: c.strikes });
    if (c.strikes >= LOOP.campaignStrikes) this.end(false, "3 strikes");
  }

  /** for the client: the campaign (everyone sees it) and my qualification */
  view(p: PlayerSim) {
    const c = this.c;
    const mq = this.check(p).map(([l, ok]) => [l, ok ? 1 : 0] as [string, number]);
    const cool = this.failed.get(p.id) === this.w.match.round ? 1 : 0;
    if (!c) return { mq, mc: cool };
    const o: [string, number, number | null, number | null][] = [];
    o.push([`Shake hands with ${PRESIDENT_NAME} (${c.pres.name})`, c.presDone ? 1 : 0, c.pres.x, c.pres.z]);
    const nP = c.posters.filter((x) => x.done).length;
    o.push([`Posters: ${nP}/${MAYOR.postersNeed}`, nP >= MAYOR.postersNeed ? 1 : 0, null, null]);
    for (const g of c.goofy) o.push([`${g.name}: ${g.text} (${Math.min(g.need, Math.floor(g.prog))}/${g.need})`, g.prog >= g.need ? 1 : 0, g.loc?.x ?? null, g.loc?.z ?? null]);
    o.push([`The SPEECH at ${c.podium.name} (${Math.floor(c.speech)}/${MAYOR.speechTime} s)`, 0, c.podium.x, c.podium.z]);
    const ps = c.posters.map((x) => [Math.round(x.loc.x * 10) / 10, Math.round(x.loc.z * 10) / 10, x.done ? 1 : 0] as [number, number, number]);
    return { mq, mc: cool, c: { p: c.p, t: Math.ceil(c.t), s: c.strikes, o, ps, pg: c.lastPing ? [Math.round(c.lastPing.x), Math.round(c.lastPing.z)] : null } };
  }
  version(p: PlayerSim) {
    const c = this.c;
    return this.v + ":" + this.check(p).map(([, ok]) => (ok ? 1 : 0)).join("") + (this.failed.get(p.id) ?? "") + (c ? ":" + c.v + "." + Math.ceil(c.t) : "");
  }
}
