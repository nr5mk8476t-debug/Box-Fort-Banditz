// COMPACT QUEENS: how often do bandits see each other, and WHERE? A planning simulation over the plan data (not the
// game): players leave their forts on random trips (tier mix below), go inside, come home carrying, bank, repeat for an
// 8:00 scavenge (the last 2:00 at night: 0.6x the spotting distance). Every stretch of time two of them can see each
// other is a SIGHTING (sight.ts: buildings block, 90 m by day). The same simulation on Queens v2 for comparison.
//   npx tsx tests/compact-encounters.ts        -> docs/queens/compact/data/encounters.json
import fs from "node:fs";
import { usePlan, layout } from "../shared/src/queens/check.js";
import { V2_PLAN, type XZ, type QPlan } from "../shared/src/queens/plan.js";
import { COMPACT } from "../shared/src/queens/compact.js";
import { P } from "../shared/src/queens/active.js";
import { buildNet, route } from "../shared/src/queens/net.js";
import { Sight, sightings, type Mover, type Leg, type Load } from "../shared/src/queens/sight.js";

const RUNS = Number(process.env.RUNS ?? 300);
/** a trip: which tier (probability), time inside, what you carry home */
const MIX: { tier: string; p: number; inside: number; loads: Load[] }[] = [
  { tier: "low", p: 0.35, inside: 20, loads: ["big", "big", "empty"] },
  { tier: "mid", p: 0.3, inside: 30, loads: ["big", "heavy"] },
  { tier: "high", p: 0.2, inside: 45, loads: ["heavy"] },
  { tier: "landmark", p: 0.15, inside: 75, loads: ["heavy", "giant"] },
];
function rng(seed: number) { let h = seed >>> 0 || 1; return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909) ^ (h + 0x9e3779b9)), (h >>> 0) / 4294967296); }

/** choice: "uniform" = any shop of the tier; "near" = nearer shops of the tier preferred (weight exp(-trip / 10 s)), the
 *  way players actually pick; magnet = the share of trips that go to the cycle's ONE wanted shop (a shared target) */
export function simulate(plan: QPlan, players: number, runs: number, opt: { choice?: "uniform" | "near"; magnet?: number; spot?: number } = {}) {
  usePlan(plan);
  const lay = layout(), net = buildNet({}, lay), sight = new Sight(lay);
  const homeR = P.ring + P.home.ringW / 2 + P.home.ringPave + 10;
  const zone = (p: XZ) => (Math.abs(p[0]) <= homeR && Math.abs(p[1]) <= homeR ? "home" : "away");
  const dests = (tier: string) => P.units.filter((u) => u.phase === "first" && (tier === "landmark" ? u.kind === "landmark" : u.kind === "shop" && u.tier === tier));
  const cache = new Map<string, XZ[]>(), dcache = new Map<string, number>();
  const dist = (a: string, b: string) => { const k = a + ">" + b; let v = dcache.get(k); if (v === undefined) { v = route(net, [a, b]).dist; dcache.set(k, v); } return v; };
  const path = (a: string, b: string) => { const k = a + ">" + b; let v = cache.get(k); if (!v) { v = route(net, [a, b]).pts; cache.set(k, v); } return v; };
  const runsOut: { away: number; perimeter: number; recogniseLoaded: number; firstAway: number | null; spots: { at: XZ; t: number; d: number; loads: string }[] }[] = [];
  for (let r = 0; r < runs; r++) {
    const rand = rng(1000 + r * 7919 + players * 31);
    const pool = P.units.filter((u) => u.phase === "first" && (u.kind === "shop" || u.kind === "landmark")), wanted = pool[Math.floor(rand() * pool.length)];
    const forts = [...P.forts].sort(() => rand() - 0.5).slice(0, players);
    const movers: Mover[] = forts.map((f) => {
      const legs: Leg[] = [{ inside: rand() * 6, at: f.mat }]; let t = 0;
      while (t < 480) {
        let x = rand(), m = MIX[0]; for (const c of MIX) { if (x < c.p) { m = c; break; } x -= c.p; }
        const ds = dests(m.tier), load = m.loads[Math.floor(rand() * m.loads.length)];
        let d = ds[Math.floor(rand() * ds.length)];
        if (opt.choice !== "uniform") { const w = ds.map((u) => Math.exp(-dist("mat:" + f.id, "door:" + u.id) / 9.7 / 10)), tot = w.reduce((a, b) => a + b, 0); let y = rand() * tot; for (let i = 0; i < ds.length; i++) { y -= w[i]; if (y <= 0) { d = ds[i]; break; } } }
        if (opt.magnet && rand() < opt.magnet) d = wanted;
        const out = path("mat:" + f.id, "door:" + d.id), back = path("door:" + d.id, "mat:" + f.id);
        legs.push({ pts: out, load: "empty", label: `to ${d.name}` }, { inside: m.inside, at: d.door, label: d.name }, { pts: back, load, label: `home from ${d.name}` }, { inside: 10, at: f.mat, label: "banking" });
        t = legs.reduce((s, l) => s + ("inside" in l ? l.inside : 0), 0) + 0; // (inside time only: the travel time is added below)
        // total time so far, properly: approximate with the measured speeds via the legs' lengths
        t = 0; for (const l of legs) t += "inside" in l ? l.inside : estimate(l);
      }
      return { name: f.id, legs };
    });
    const sp = opt.spot ?? 1;
    const day = sightings(sight, movers, { dt: 1, tMax: 360, scale: sp }), night = sightings(sight, movers, { dt: 1, tMax: 480, night: true, scale: sp }).filter((s) => s.t1 > 360);
    const all = [...day, ...night];
    const away = all.filter((s) => zone(s.atA) === "away" && zone(s.atB) === "away"), perim = all.filter((s) => (zone(s.atA) === "away") !== (zone(s.atB) === "away"));
    runsOut.push({ away: away.length, perimeter: perim.length, recogniseLoaded: away.filter((s) => s.recognise && (s.loadA !== "empty" || s.loadB !== "empty")).length,
      firstAway: away.length ? Math.min(...away.map((s) => s.t0)) : null,
      spots: away.map((s) => ({ at: [(s.atA[0] + s.atB[0]) / 2, (s.atA[1] + s.atB[1]) / 2] as XZ, t: s.t0, d: s.minD, loads: `${s.loadA}/${s.loadB}` })) });
  }
  const n = runsOut.length, mean = (f: (x: (typeof runsOut)[number]) => number) => runsOut.reduce((s, x) => s + f(x), 0) / n;
  const firsts = runsOut.map((x) => x.firstAway).filter((x): x is number => x !== null).sort((a, b) => a - b);
  return {
    plan: plan.id, players, runs: n, choice: opt.choice ?? "near", magnet: opt.magnet ?? 0, spot: opt.spot ?? 1,
    pAway: runsOut.filter((x) => x.away > 0).length / n, meanAway: mean((x) => x.away), meanPerimeter: mean((x) => x.perimeter),
    pLoaded: runsOut.filter((x) => x.recogniseLoaded > 0).length / n, meanLoaded: mean((x) => x.recogniseLoaded),
    medianFirstAway: firsts.length ? firsts[Math.floor(firsts.length / 2)] : null,
    pNoneIn4Min: runsOut.filter((x) => x.firstAway === null || x.firstAway > 240).length / n,
    spots: runsOut.flatMap((x) => x.spots),
  };
  function estimate(l: Leg) { if ("inside" in l) return l.inside; let L = 0; for (let i = 1; i < l.pts.length; i++) L += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]); return l.load === "empty" ? L / 9.4 : l.load === "big" ? L / 6 : l.load === "heavy" ? L / 4.3 : L / 2.65; }
}

if (process.argv[1]?.endsWith("compact-encounters.ts")) {
  const res = [];
  const cases: [QPlan, number, Parameters<typeof simulate>[3]][] = [];
  for (const plan of [V2_PLAN, COMPACT]) for (const players of [2, 4]) for (const choice of ["near", "uniform"] as const) cases.push([plan, players, { choice }]);
  for (const players of [2, 4]) { cases.push([COMPACT, players, { magnet: 0.3 }]); cases.push([V2_PLAN, players, { magnet: 0.3 }]); cases.push([COMPACT, players, { spot: 1.33 }]); }
  for (const [plan, players, opt] of cases) {
    const r = simulate(plan, players, RUNS, opt); res.push(r);
    console.log(`${plan.id.padEnd(8)} ${players}p ${r.choice}${r.magnet ? " +wanted" : ""}${r.spot !== 1 ? " spot x" + r.spot : ""}: away sightings ${(r.pAway * 100).toFixed(0)}% of scavenges (mean ${r.meanAway.toFixed(1)}), carrying + recognisable ${(r.pLoaded * 100).toFixed(0)}% (mean ${r.meanLoaded.toFixed(1)}), at the perimeter ${r.meanPerimeter.toFixed(1)}, first away sighting median ${r.medianFirstAway ?? "-"} s, none in the first 4 min ${(r.pNoneIn4Min * 100).toFixed(0)}%`);
  }
  fs.mkdirSync("docs/queens/compact/data", { recursive: true });
  fs.writeFileSync("docs/queens/compact/data/encounters.json", JSON.stringify({ runs: RUNS, mix: MIX, assumptions: "sight.ts SPOT: 90 m by day, 60 m to recognise, 0.6x at night; buildings block; inside = unseen", results: res.map((r) => ({ ...r, spots: r.spots.slice(0, 4000) })) }));
}
