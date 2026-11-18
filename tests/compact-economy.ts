// COMPACT QUEENS: what shorter trips do to a scavenge's EARNINGS (an estimate, not a playtest). For v2 and Compact:
// each player plans the 8:00 scavenge to bank the most value (a dynamic programme over time and free shelf slots: the
// shelves cap what you can bank, 8 / 12 / 16 records), trips to any playable store or landmark, a haul = what your hands
// and three pockets hold of the best things on its shelves, shared stock (players plan in turn and empty shelves).
// Inputs:
//   - shelves: R15's stock tables (docs/queens/compact/data/r15-stock.json, from the R15 branch: not on main yet), the
//     expected shelf per cycle; stores without a table use their tier's average table;
//   - landmarks: NOT DESIGNED YET: a placeholder haul (a giant ~$350, or a heavy ~$180, plus three smalls ~$60);
//   - times: the route model's distances, the measured speeds; inside 20 / 30 / 45 / 75 s (low / mid / high / landmark);
//     10 s banking; a heavy or giant load can't sprint.
//   npx tsx tests/compact-economy.ts   -> docs/queens/compact/data/economy.json
import fs from "node:fs";
import { usePlan, routes, emptyTime, MEASURED } from "../shared/src/queens/check.js";
import { V2_PLAN, type QPlan } from "../shared/src/queens/plan.js";
import { COMPACT } from "../shared/src/queens/compact.js";
import { P } from "../shared/src/queens/active.js";

const SNAP = JSON.parse(fs.readFileSync("docs/queens/compact/data/r15-stock.json", "utf8"));
type It = { type: string; size: string; heavy: boolean; v: number; n: number };
const shelfOf = (id: string): It[] => {
  const s = SNAP.stores[id]; if (!s) return [];
  const n = (s.n[0] + s.n[1]) / 2, W = s.stock.reduce((a: number, e: any) => a + e.w, 0);
  return s.stock.map((e: any) => ({ type: e.type, size: e.size, heavy: e.heavy || e.size === "giant", v: (e.min + e.maxV) / 2, n: Math.min(e.max, (n * e.w) / W) }));
};
const TABLE: Record<string, string> = { screwloose: "lastscrew", spinsin: "spincycle" };
const TIER_TABLES: Record<string, string[]> = { low: ["rustbucket", "plugpray", "lastscrew", "crumbs"], mid: ["needledrop", "peakfomo", "spincycle", "secondchance"], high: ["maisonpong", "caratrun", "tickedoff"] };
const INSIDE: Record<string, number> = { low: 20, mid: 30, high: 45, landmark: 75 };
const LANDMARK_SHELF = (): It[] => [{ type: "landmark_giant", size: "giant", heavy: true, v: 350, n: 2 }, { type: "landmark_heavy", size: "big", heavy: true, v: 180, n: 3 }, { type: "landmark_small", size: "small", heavy: false, v: 60, n: 9 }];

export function economy(plan: QPlan, players: number, cap: number) {
  usePlan(plan);
  const rt = routes().rows, sites = P.units.filter((u) => u.phase === "first" && (u.kind === "shop" || u.kind === "landmark"));
  const stock = new Map<string, It[]>();
  for (const u of sites) {
    if (u.kind === "landmark") { stock.set(u.id, LANDMARK_SHELF()); continue; }
    const own = shelfOf(TABLE[u.id] ?? u.keepsId ?? u.id);
    if (own.length) { stock.set(u.id, own); continue; }
    // no table yet: the average of its tier's tables (values and sizes), as one blended shelf
    const pool = TIER_TABLES[u.tier!].flatMap((t) => shelfOf(t)).map((x) => ({ ...x, n: x.n / TIER_TABLES[u.tier!].length }));
    stock.set(u.id, pool);
  }
  const supply = [...stock.entries()].reduce((a, [id, xs]) => a + (P.units.find((u) => u.id === id)!.kind === "landmark" ? 0 : xs.reduce((b, x) => b + x.v * x.n, 0)), 0);
  const forts = P.forts.slice(0, players), result: any[] = [];
  for (const f of forts) {
    // the haul options at each site, given what's left: (a) the best big/giant in hand + the 3 best smalls; (b) 4 smalls
    const opts = (k: number) => sites.flatMap((u) => {
      const xs = stock.get(u.id)!, smalls = xs.filter((x) => x.size === "small" && x.n > 0.5).sort((a, b) => b.v - a.v), bigs = xs.filter((x) => x.size !== "small" && x.n > 0.5).sort((a, b) => b.v - a.v);
      const r = rt.find((q) => q.fort === f.id && q.id === u.id)!, out = r.out, back = (heavy: boolean, giant: boolean) => giant ? r.dist / MEASURED.giant + (plan === COMPACT && u.kind === "landmark" ? 38 / MEASURED.giant : 0) : heavy ? r.dist / MEASURED.heavy : emptyTime(r.dist) / 0.85;
      const pick = (list: It[], m: number) => { const got: It[] = []; for (const x of list) for (let c = 0; c < Math.floor(x.n) && got.length < m; c++) got.push(x); return got; };
      const o: { site: string; tier: string; items: It[]; t: number; v: number }[] = [];
      const sm = pick(smalls, Math.min(3, k));
      if (bigs.length && k >= 1) { const b = bigs[0], items = [b, ...pick(smalls, Math.min(3, k - 1))]; o.push({ site: u.id, tier: u.kind === "landmark" ? "landmark" : u.tier!, items, t: out + INSIDE[u.kind === "landmark" ? "landmark" : u.tier!] + back(b.heavy, b.size === "giant") + LOOP_BANK, v: items.reduce((a, x) => a + x.v, 0) }); }
      const s4 = pick(smalls, Math.min(4, k)); if (s4.length) o.push({ site: u.id, tier: u.kind === "landmark" ? "landmark" : u.tier!, items: s4, t: out + INSIDE[u.kind === "landmark" ? "landmark" : u.tier!] + back(false, false) + LOOP_BANK, v: s4.reduce((a, x) => a + x.v, 0) });
      void sm; return o;
    });
    // DP over (seconds left, free slots): the best value and the plan
    const T = 480, best = new Map<string, { v: number; plan: any[] }>();
    const solve = (t: number, k: number): { v: number; plan: any[] } => {
      if (k <= 0 || t <= 0) return { v: 0, plan: [] };
      const key = `${Math.floor(t / 4)}|${k}`; const c = best.get(key); if (c) return c;
      let b = { v: 0, plan: [] as any[] };
      for (const o of opts(k)) if (o.t <= t && o.items.length) { const r = solve(t - o.t, k - o.items.length); if (r.v + o.v > b.v) b = { v: r.v + o.v, plan: [o, ...r.plan] }; }
      best.set(key, b); return b;
    };
    const sol = solve(T, cap);
    for (const o of sol.plan) for (const it of o.items) { const x = stock.get(o.site)!.find((y) => y.type === it.type)!; x.n -= 1; }
    result.push({ fort: f.id, value: sol.v, trips: sol.plan.length, items: sol.plan.reduce((a: number, o: any) => a + o.items.length, 0), time: sol.plan.reduce((a: number, o: any) => a + o.t, 0), route: sol.plan.map((o: any) => `${o.site}(${o.items.length}, $${o.v.toFixed(0)}, ${o.t.toFixed(0)} s)`) });
  }
  return { plan: plan.id, players, cap, supply, perPlayer: result.reduce((a, r) => a + r.value, 0) / result.length, players_: result };
}
const LOOP_BANK = 10;

if (process.argv[1]?.endsWith("compact-economy.ts")) {
  const rows: any[] = [];
  for (const cap of [8, 12, 16]) for (const players of [1, 2, 4]) for (const plan of [V2_PLAN, COMPACT]) {
    const r = economy(plan, players, cap); rows.push(r);
    console.log(`${plan.id.padEnd(8)} shelves ${String(cap).padStart(2)} ${players}p: banked $${r.perPlayer.toFixed(0)} a player (shelf supply $${r.supply.toFixed(0)}) | ${r.players_.map((p: any) => `${p.fort} ${p.trips} trips ${p.items} items ${p.time.toFixed(0)} s: ${p.route.join(" > ")}`).join(" || ")}`);
  }
  fs.writeFileSync("docs/queens/compact/data/economy.json", JSON.stringify(rows, null, 1));
}
