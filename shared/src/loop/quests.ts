// R14 stage 4: QUESTS: the optional goals that earn AURA (and cash, from the two bosses). All data: a new task or job
// is one entry in AURA_TASKS / BOSS_JOBS, built from seven objective kinds, pointed at places that really exist on
// the map (questLocs: a task whose places are missing on this map is never offered).
//
//  - AURA TASKS: bought at your fort's board ($25, then x1.5 each in a cycle; one at a time). An attempt is LIVE:
//    everyone sees who's going for what, and where. A rival who knocks you down mid-task INTERRUPTS it: it fails,
//    you lose 4 aura and they gain 3 (once per pair per cycle: after that the attempt still fails, nobody scores).
//    A BANANA PEEL (crafted) makes the knocker slip instead and your attempt carries on. A MEGAPHONE gives +50% on
//    a stunt task.
//  - BOSS JOBS: SEAMUS O'SHORTLY (at his bar in THE SOGGY SHAMROCK) and DON BINNIE (his man at NEON FEVER's door).
//    One job per boss per cycle; done = cash + aura + 1 reputation (0-5). A failed job costs nothing (no rep lost).
//    Reputation never gates the basics (pints, the door, the counters); it unlocks PERKS (BOSS_PERKS).
//  - The deadline (end of the scavenge) ends every attempt and job unfinished: nothing carries into PREP.
import type { World, PlayerSim, WorldEvent } from "../world.js";
import type { ArenaLayout } from "../arena.js";
import { lootDef } from "../loot.js";
import { LOOP, itemCategory, type ItemCategory, type GearId } from "./catalog.js";
import { FORT_SPOTS, fortAt2 } from "./fort.js";

/** a place a quest can point at */
export interface Loc { id: string; name: string; x: number; z: number; r: number; y?: number }
export type ObjKind = "visit" | "bring" | "carry" | "stunt" | "escape" | "heist" | "perform";
export interface ObjDef {
  kind: ObjKind;
  /** candidate places (ids from questLocs; "@" + a prefix matches every id starting with it); one is picked */
  at?: string[];
  /** visit: how many different places; carry: metres; stunt: seconds in the air (air) or slides (slide); perform: seconds; heist: hold-ups */
  n?: number;
  /** bring/carry: what you have to have in your hands */
  cat?: ItemCategory | "giant" | "any";
  stunt?: "air" | "slide";
  /** bring: the thing is handed over (jobs) */
  consume?: boolean;
}
export interface TaskDef { id: string; name: string; text: string; obj: ObjDef; time: number; aura: number }
export type BossId = "seamus" | "binnie";
export interface JobDef extends TaskDef { boss: BossId; cash: number; rep: number }

export const AURA_TASKS: TaskDef[] = [
  { id: "tour", name: "TOUR OF SHAME", text: "Be seen at {n} places: {locs}", obj: { kind: "visit", n: 3, at: ["@store_", "pub", "fever", "chinatown", "littleItaly", "fountain"] }, time: 150, aura: 4 },
  { id: "showtell", name: "SHOW AND TELL", text: "Carry something SPECIALIST to {loc}", obj: { kind: "bring", cat: "specialist", at: ["pub", "fever", "fountain", "chinatown", "littleItaly"] }, time: 150, aura: 4 },
  { id: "heavy", name: "HEAVY LIFTING", text: "Carry a GIANT thing {n} m", obj: { kind: "carry", cat: "giant", n: 40 }, time: 150, aura: 5 },
  { id: "hangtime", name: "HANG TIME", text: "{n} s in the air (jumps, falls, vaults)", obj: { kind: "stunt", stunt: "air", n: 4 }, time: 90, aura: 3 },
  { id: "slideshow", name: "SLIDE SHOW", text: "{n} slides near {loc}", obj: { kind: "stunt", stunt: "slide", n: 5, at: ["fountain", "pub", "fever", "@store_"] }, time: 120, aura: 3 },
  { id: "hotpotato", name: "HOT POTATO", text: "Get a wanted star, then lose the cops", obj: { kind: "escape" }, time: 180, aura: 6 },
  { id: "smashdash", name: "SMASH AND DASH", text: "Hold up a till", obj: { kind: "heist", n: 1 }, time: 180, aura: 6 },
  { id: "busk", name: "STREET PERFORMER", text: "Show off at {loc} for {n} s", obj: { kind: "perform", n: 15, at: ["fountain", "pub", "fever", "chinatown", "littleItaly"] }, time: 120, aura: 3 },
];
export const BOSS_NAMES: Record<BossId, string> = { seamus: "SEAMUS O'SHORTLY", binnie: "DON BINNIE" };
export const BOSS_JOBS: JobDef[] = [
  { boss: "seamus", rep: 0, id: "s_crisps", name: "THE CRISP SHORTAGE", text: "Bring Seamus something to EAT (his bar)", obj: { kind: "bring", cat: "food", consume: true, at: ["seamus"] }, time: 240, aura: 1, cash: 40 },
  { boss: "seamus", rep: 1, id: "s_stool", name: "A STOOL FOR THE SNUG", text: "Bring Seamus some FURNISHING (his bar)", obj: { kind: "bring", cat: "furnishing", consume: true, at: ["seamus"] }, time: 240, aura: 2, cash: 60 },
  { boss: "seamus", rep: 2, id: "s_rival", name: "THE RIVAL TAP", text: "Hold up a till (the rival's takings)", obj: { kind: "heist", n: 1 }, time: 240, aura: 2, cash: 80 },
  { boss: "seamus", rep: 3, id: "s_trophy", name: "THE QUIZ TROPHY", text: "Bring Seamus a TROPHY (his bar)", obj: { kind: "bring", cat: "trophy", consume: true, at: ["seamus"] }, time: 240, aura: 3, cash: 120 },
  { boss: "binnie", rep: 0, id: "b_dance", name: "THE DANCE TAX", text: "Dance outside {loc} for {n} s", obj: { kind: "perform", n: 20, at: ["fever"] }, time: 240, aura: 1, cash: 30 },
  { boss: "binnie", rep: 1, id: "b_shine", name: "SOMETHING SHINY", text: "Bring the Don's man SPECIALIST goods (NEON FEVER's door)", obj: { kind: "bring", cat: "specialist", consume: true, at: ["fever"] }, time: 240, aura: 2, cash: 70 },
  { boss: "binnie", rep: 2, id: "b_heat", name: "DRAW THE HEAT", text: "Get a wanted star, then lose the cops", obj: { kind: "escape" }, time: 240, aura: 2, cash: 90 },
  { boss: "binnie", rep: 3, id: "b_gadget", name: "THE DON'S GADGET", text: "Bring the Don's man ELECTRONICS (NEON FEVER's door)", obj: { kind: "bring", cat: "electronics", consume: true, at: ["fever"] }, time: 240, aura: 3, cash: 120 },
];
/** what reputation earns (never the basics) */
export const BOSS_PERKS: { boss: BossId; rep: number; name: string; blurb: string }[] = [
  { boss: "seamus", rep: 2, name: "A WORD WITH SAL", blurb: "Sal's van pays 70% (not 60%)" },
  { boss: "seamus", rep: 4, name: "THE PEEL BUCKET", blurb: "a free BANANA PEEL every cycle" },
  { boss: "binnie", rep: 2, name: "FRIENDS AND FAMILY", blurb: "aura tasks cost 25% less" },
  { boss: "binnie", rep: 4, name: "THE DON'S TAILOR", blurb: "a free FAKE MOUSTACHE every cycle" },
];
export const QUEST = { boardReach: 2.4, bossReach: 3.6, repMax: 5, vanPerk: 0.7, taskDiscount: 0.75, starHeat: 30, minLocDist: 18, liveEvery: 5 };

/** the places quests can point at on this map (only what's really there) */
export function questLocs(a: ArenaLayout): Map<string, Loc> {
  const m = new Map<string, Loc>();
  const add = (l: Loc) => { if (Number.isFinite(l.x) && Number.isFinite(l.z)) m.set(l.id, l); };
  if (a.pub) { add({ id: "pub", name: "THE SOGGY SHAMROCK", x: a.pub.out.x, z: a.pub.out.z, r: 4 }); add({ id: "seamus", name: "SEAMUS's bar", x: a.pub.seamus.x, z: a.pub.seamus.z, r: QUEST.bossReach }); }
  if (a.fever) add({ id: "fever", name: "NEON FEVER", x: a.fever.out.x, z: a.fever.out.z, r: 4.5 });
  for (const s of a.stores ?? []) add({ id: "store_" + s.id, name: s.name, x: s.door.x, z: s.door.z, r: 3.5 });
  if (a.chinatown?.route[0]) add({ id: "chinatown", name: "CHINATOWN", x: a.chinatown.route[0].x, z: a.chinatown.route[0].z, r: 5 });
  if (a.littleItaly?.route[0]) add({ id: "littleItaly", name: "LITTLE ITALY", x: a.littleItaly.route[0].x, z: a.littleItaly.route[0].z, r: 5 });
  const L = a.landmarks ?? {};
  if (L.fountain) add({ id: "fountain", name: "the FOUNTAIN", x: L.fountain.x, z: L.fountain.z, r: 5 });
  return m;
}
function candidates(locs: Map<string, Loc>, at: string[] | undefined): Loc[] {
  if (!at) return [];
  const out: Loc[] = [];
  for (const k of at) {
    if (k.startsWith("@")) { for (const l of locs.values()) if (l.id.startsWith(k.slice(1))) out.push(l); }
    else { const l = locs.get(k); if (l) out.push(l); }
  }
  return out;
}
/** can this task/job be done on this map? (every place it needs exists) */
export function questValid(def: TaskDef, locs: Map<string, Loc>) {
  const o = def.obj;
  if (o.kind === "visit") return candidates(locs, o.at).length >= (o.n ?? 1);
  if (o.kind === "bring" || o.kind === "perform") return candidates(locs, o.at).length > 0;
  if (o.kind === "stunt" && o.at) return candidates(locs, o.at).length > 0;
  return true;
}

interface Active {
  src: "task" | "job"; def: TaskDef; text: string; locs: Loc[]; prog: number; need: number; t: number;
  stage: number; lastX: number; lastZ: number; slid: boolean; megaphone: boolean;
}
interface PState { task: Active | null; job: Active | null; bought: number; jobsTried: Set<BossId>; rep: Record<BossId, number>; lastTask: string; v: number; liveT: number }

export class QuestSystem {
  readonly locs: Map<string, Loc>;
  private ps = new Map<string, PState>();
  /** pairs (owner|interrupter) that have scored an interruption this cycle */
  private pairs = new Set<string>();
  constructor(private w: World) { this.locs = questLocs(w.arena); }

  of(p: PlayerSim): PState {
    let s = this.ps.get(p.id);
    if (!s) this.ps.set(p.id, (s = { task: null, job: null, bought: 0, jobsTried: new Set(), rep: { seamus: 0, binnie: 0 }, lastTask: "", v: 0, liveT: 0 }));
    return s;
  }
  resetMatch() { this.ps.clear(); this.pairs.clear(); }
  /** a new cycle's scavenge: prices back to $25, every boss has a job again, the perks' free gear */
  newCycle() {
    this.pairs.clear();
    for (const [id, s] of this.ps) {
      s.bought = 0; s.jobsTried.clear(); s.v++;
      const p = this.w.players.get(id); if (!p) continue;
      const g = this.w.fort.of(p).gear;
      if (s.rep.seamus >= 4) g.banana = (g.banana ?? 0) + 1;
      if (s.rep.binnie >= 4) g.moustache = (g.moustache ?? 0) + 1;
      this.w.fort.of(p).v++;
    }
  }
  /** the deadline: everything unfinished ends (no aura lost; nothing carries into PREP) */
  phaseEnd() {
    for (const [id, s] of this.ps) {
      const p = this.w.players.get(id);
      for (const a of [s.task, s.job]) if (a && p) this.end(p, a, false, "the deadline");
      s.task = null; s.job = null; s.v++;
    }
  }
  /** what a task costs this player now */
  taskPrice(p: PlayerSim) {
    const s = this.of(p);
    return Math.round(LOOP.taskPrice0 * Math.pow(LOOP.taskPriceMult, s.bought) * (s.rep.binnie >= 2 ? QUEST.taskDiscount : 1));
  }
  vanRate(p: PlayerSim) { return this.of(p).rep.seamus >= 2 ? QUEST.vanPerk : LOOP.vanRate; }
  private live() { const ph = this.w.match.phase; return ph === "scavenge" || ph === "dusk" || ph === "night"; }

  /** at your fort's board: buy the next random task */
  buyTask(p: PlayerSim): boolean {
    const no = (reason: string) => { this.w.emit({ t: "questNo", p: p.id, reason }); return false; };
    if (!this.live()) return no("tasks are for the scavenge");
    const lot = this.w.arena.forts?.find((f) => f.slot === p.colorIdx);
    if (!lot) return no("no fort");
    const b = fortAt2(lot, FORT_SPOTS.board.u, FORT_SPOTS.board.v);
    if (Math.hypot(p.move.x - b.x, p.move.z - b.z) > QUEST.boardReach + 1) return no("at your fort's board");
    const s = this.of(p);
    if (s.task) return no("one task at a time");
    const price = this.taskPrice(p);
    if (p.cash < price) return no(`it costs $${price}`);
    const pool = AURA_TASKS.filter((d) => d.id !== s.lastTask && questValid(d, this.locs));
    if (!pool.length) return no("no tasks on this map");
    const def = pool[Math.floor(this.w.random() * pool.length)];
    p.cash -= price; s.bought++; s.lastTask = def.id;
    s.task = this.begin(p, "task", def);
    if (def.obj.kind === "stunt" && this.w.fort.useGear(p, "megaphone")) s.task.megaphone = true;
    this.w.emit({ t: "questStart", p: p.id, src: "task", name: def.name, text: s.task.text, cost: price });
    this.broadcastLive(p, s.task);
    return true;
  }
  /** near a boss: take their job for this cycle */
  takeJob(p: PlayerSim, boss: BossId): boolean {
    const no = (reason: string) => { this.w.emit({ t: "questNo", p: p.id, reason }); return false; };
    if (!this.live()) return no("jobs are for the scavenge");
    const at = this.bossSpot(boss);
    if (!at || Math.hypot(p.move.x - at.x, p.move.z - at.z) > QUEST.bossReach + 1) return no(`go and see ${BOSS_NAMES[boss]}`);
    const s = this.of(p);
    if (s.job) return no("finish the job you've got");
    if (s.jobsTried.has(boss)) return no(`${BOSS_NAMES[boss]} has nothing more for you this cycle`);
    const def = this.jobFor(p, boss);
    if (!def) return no("no work on this map");
    s.jobsTried.add(boss);
    s.job = this.begin(p, "job", def);
    this.w.emit({ t: "questStart", p: p.id, src: "job", name: def.name, text: s.job.text, cost: 0, boss });
    return true;
  }
  drop(p: PlayerSim, src: "task" | "job") {
    const s = this.of(p), a = src === "task" ? s.task : s.job;
    if (!a) return;
    this.end(p, a, false, "dropped");
  }
  /** the job a boss would give this player now (the next one their rep allows) */
  jobFor(p: PlayerSim, boss: BossId): JobDef | null {
    const rep = this.of(p).rep[boss];
    const list = BOSS_JOBS.filter((j) => j.boss === boss && j.rep <= rep && questValid(j, this.locs));
    return list.length ? list[list.length - 1 - ((this.w.match.round + rep) % Math.min(2, list.length))] : null;
  }
  bossSpot(boss: BossId): Loc | null { return this.locs.get(boss === "seamus" ? "seamus" : "fever") ?? null; }

  private begin(p: PlayerSim, src: "task" | "job", def: TaskDef): Active {
    const o = def.obj;
    let locs: Loc[] = [];
    const cands = candidates(this.locs, o.at);
    if (cands.length) {
      const far = cands.filter((l) => Math.hypot(l.x - p.move.x, l.z - p.move.z) > QUEST.minLocDist);
      const pool = (far.length >= (o.kind === "visit" ? (o.n ?? 1) : 1) ? far : cands).slice();
      const k = o.kind === "visit" ? Math.min(o.n ?? 1, pool.length) : 1;
      for (let i = 0; i < k; i++) locs.push(pool.splice(Math.floor(this.w.random() * pool.length), 1)[0]);
    }
    const need = o.kind === "visit" ? locs.length : o.kind === "bring" || o.kind === "escape" ? 1 : o.n ?? 1;
    const text = def.text.replace("{n}", String(o.n ?? need)).replace("{loc}", locs[0]?.name ?? "").replace("{locs}", locs.map((l) => l.name).join(", "));
    const a: Active = { src, def, text, locs, prog: 0, need, t: def.time, stage: 0, lastX: p.move.x, lastZ: p.move.z, slid: false, megaphone: false };
    this.of(p).v++;
    return a;
  }
  private end(p: PlayerSim, a: Active, ok: boolean, reason: string) {
    const s = this.of(p);
    if (s.task === a) s.task = null; if (s.job === a) s.job = null;
    s.v++;
    let aura = 0, cash = 0;
    if (ok) {
      aura = Math.round(a.def.aura * (a.megaphone ? 1.5 : 1));
      if (a.src === "job") { const j = a.def as JobDef; cash = j.cash; p.cash += cash; s.rep[j.boss] = Math.min(QUEST.repMax, s.rep[j.boss] + 1); }
      this.w.loopAura.grant(p, aura, a.def.name.toLowerCase());
    }
    this.w.emit({ t: "questEnd", p: p.id, src: a.src, name: a.def.name, ok, reason, aura, cash, rep: a.src === "job" ? s.rep[(a.def as JobDef).boss] : undefined });
  }
  private broadcastLive(p: PlayerSim, a: Active) {
    const l = a.locs[a.stage] ?? a.locs[0];
    this.w.emit({ t: "questLive", p: p.id, name: a.def.name, x: l?.x ?? p.move.x, z: l?.z ?? p.move.z });
  }

  /** every tick in the scavenge/dusk/night: progress, time limits */
  tick(dt: number) {
    if (!this.live()) return;
    for (const [id, s] of this.ps) {
      const p = this.w.players.get(id);
      if (!p) { s.task = null; s.job = null; continue; }
      for (const a of [s.task, s.job]) {
        if (!a) continue;
        a.t -= dt;
        if (this.step(p, a, dt)) { this.end(p, a, true, "done"); continue; }
        if (a.t <= 0) this.end(p, a, false, "out of time");
      }
    }
  }
  /** one tick of an objective; true = done */
  private step(p: PlayerSim, a: Active, dt: number): boolean {
    const o = a.def.obj, m = p.move;
    const near = (l: Loc | undefined) => !!l && Math.hypot(m.x - l.x, m.z - l.z) < l.r && Math.abs(m.y - (l.y ?? m.y)) < 3;
    const held = () => { const it = p.hand ? this.w.items.get(p.hand) : undefined; return it && it.holder === p.id ? it : undefined; };
    const fits = (type: string) => { const d = lootDef(type); return o.cat === "any" || (o.cat === "giant" ? d.size === "giant" : itemCategory(type, d) === o.cat); };
    const before = Math.floor(a.prog);
    switch (o.kind) {
      case "visit": if (near(a.locs[a.stage])) { a.stage++; a.prog = a.stage; } break;
      case "bring": {
        const it = held();
        if (it && fits(it.type) && near(a.locs[0])) {
          if (o.consume) { p.hand = ""; this.w.items.delete(it.id); }
          a.prog = 1;
        }
        break;
      }
      case "carry": {
        const it = held(), d = Math.hypot(m.x - a.lastX, m.z - a.lastZ);
        if (it && fits(it.type) && d < 2) a.prog += d;
        break;
      }
      case "stunt":
        if (!a.locs.length || near(a.locs[0])) {
          if (o.stunt === "air") { if (!m.grounded && m.knockT <= 0) a.prog += dt; }
          else { const sliding = m.slideT > 0; if (sliding && !a.slid) a.prog += 1; a.slid = sliding; }
        }
        break;
      case "escape":
        if (p.jailT > 0) { a.t = 0; break; }
        if (a.stage === 0 && p.notoriety >= QUEST.starHeat) { a.stage = 1; this.of(p).v++; }
        else if (a.stage === 1 && p.notoriety < QUEST.starHeat) a.prog = 1;
        break;
      case "heist": break; // (robDone events)
      case "perform": if (near(a.locs[0]) && m.grounded && m.knockT <= 0) a.prog += dt; break;
    }
    a.lastX = m.x; a.lastZ = m.z;
    if (Math.floor(a.prog) !== before) this.of(p).v++;
    return a.prog >= a.need;
  }

  /** the world's events: hold-ups (heist), knockdowns (interruptions) */
  onEvent(e: WorldEvent) {
    if (e.t === "robDone") {
      const p = this.w.players.get(e.p); if (!p) return;
      const s = this.of(p);
      for (const a of [s.task, s.job]) if (a && a.def.obj.kind === "heist") { a.prog++; s.v++; }
      return;
    }
    if (e.t !== "knockdown" || !this.live()) return;
    const p = this.w.players.get(e.p), by = this.w.players.get(e.by);
    if (!p || !by || by === p) return;
    const s = this.of(p), a = s.task;
    if (!a) return;
    if (this.w.fort.useGear(p, "banana" as GearId)) {
      this.w.emit({ t: "bananaSlip", p: by.id, owner: p.id });
      this.w.knockdown(by, "banana");
      return;
    }
    const key = p.id + "|" + by.id;
    const scores = !this.pairs.has(key);
    if (scores) this.pairs.add(key);
    this.end(p, a, false, "interrupted by " + by.name);
    if (scores) { this.w.loopAura.grant(p, -LOOP.interruptLoss, "interrupted by " + by.name); this.w.loopAura.grant(by, LOOP.interruptGain, "interrupted " + p.name); }
    this.w.emit({ t: "questInterrupt", p: p.id, by: by.id, name: a.def.name, scored: scores });
  }

  /** for the client (World.loopJson): my task/job, prices, rep, what the bosses near me offer, rivals' live attempts */
  view(p: PlayerSim) {
    const s = this.of(p);
    const A = (a: Active | null) => a && [a.def.name, a.text, Math.floor(a.prog * 10) / 10, a.need, Math.ceil(a.t), a.locs[a.stage]?.x ?? a.locs[0]?.x ?? null, a.locs[a.stage]?.z ?? a.locs[0]?.z ?? null, a.stage, a.megaphone ? 1 : 0];
    const lv: [string, string, number, number][] = [];
    for (const [id, o] of this.ps) if (id !== p.id && o.task) { const l = o.task.locs[o.task.stage] ?? o.task.locs[0]; const q = this.w.players.get(id); if (q) lv.push([id, o.task.def.name, Math.round(l?.x ?? q.move.x), Math.round(l?.z ?? q.move.z)]); }
    const jo: [BossId, string, string][] = [];
    for (const b of ["seamus", "binnie"] as BossId[]) if (!s.jobsTried.has(b)) { const j = this.jobFor(p, b); if (j) jo.push([b, j.name, j.text.replace("{n}", String(j.obj.n ?? 1)).replace("{loc}", this.locs.get(j.obj.at?.[0] ?? "")?.name ?? "")]); }
    return { q: { t: A(s.task), j: A(s.job), tp: this.taskPrice(p), rep: [s.rep.seamus, s.rep.binnie], jo, lv, vr: this.vanRate(p) } };
  }
  version(p: PlayerSim) {
    const s = this.of(p);
    let k = s.v + ":" + s.bought;
    for (const a of [s.task, s.job]) if (a) k += ":" + Math.ceil(a.t) + "." + Math.floor(a.prog);
    for (const [id, o] of this.ps) if (id !== p.id && o.task) k += "|" + id + o.task.def.id + o.task.stage;
    return k;
  }
}
