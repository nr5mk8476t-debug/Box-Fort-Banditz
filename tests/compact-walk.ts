// COMPACT QUEENS: the travel table WALKED WITH THE GAME'S OWN MOVEMENT CODE (stepMovement: acceleration, turning,
// stamina: sprint held runs out, you're winded, you recover, you sprint again), along each route's polyline from the
// plan's pedestrian network (net.ts). Carrying uses the game's own carry rules (carrySpeedMul + carryHeavy, exactly
// as World sets them): an Old CRT TV (heavy) and the Broken Arcade Machine (a giant, dragged alone).
// No collision geometry (there are no buildings yet): it measures the movement over the route, not snagging.
//   npx tsx tests/compact-walk.ts   -> docs/queens/compact/data/walk.json
import fs from "node:fs";
import { stepMovement, makeMoveState } from "../shared/src/movement.js";
import { SIM_DT } from "../shared/src/constants.js";
import { lootDef, carrySpeedMul } from "../shared/src/loot.js";
import { usePlan, layout } from "../shared/src/queens/check.js";
import { COMPACT } from "../shared/src/queens/compact.js";
import { V2_PLAN, type XZ, type QPlan } from "../shared/src/queens/plan.js";
import { P } from "../shared/src/queens/active.js";
import { buildNet, route } from "../shared/src/queens/net.js";

const arena: any = { boxes: [], ramps: [], half: 5000, size: 10000, roads: [], forts: [] };
export function walk(pts: XZ[], carry: "" | "crt_tv" | "arcade_machine") {
  const s: any = makeMoveState(pts[0][0], pts[0][1]); let t = 0, seq = 0, k = 1;
  if (carry) { const d = lootDef(carry)!; s.carryMul = carrySpeedMul(d, 1); s.carryHeavy = !!d.heavy || d.size === "giant"; s.handsFull = true; }
  while (k < pts.length && t < 900) {
    const n = pts[k], dx = n[0] - s.x, dz = n[1] - s.z;
    if (Math.hypot(dx, dz) < (k === pts.length - 1 ? 0.6 : 1.2)) { k++; continue; }
    stepMovement(s, { seq: ++seq, mx: 0, mz: 1, yaw: Math.atan2(dx, dz), pitch: 0, sprint: !carry, jump: false, crouch: false, dodge: false }, arena, SIM_DT);
    t += SIM_DT;
  }
  return t;
}

export function table(plan: QPlan) {
  usePlan(plan);
  const net = buildNet({}, layout()), rows: any[] = [];
  const first = P.units.filter((u) => u.phase === "first" && (u.kind === "shop" || u.kind === "landmark"));
  for (const f of P.forts) {
    const pick: { label: string; id: string }[] = [];
    for (const tier of ["low", "mid", "high"]) {
      const c = first.filter((u) => u.kind === "shop" && u.tier === tier).map((u) => ({ u, d: route(net, ["mat:" + f.id, "door:" + u.id]).dist })).sort((a, b) => a.d - b.d)[0];
      pick.push({ label: `nearest ${tier}`, id: c.u.id });
    }
    for (const id of ["bank", "casino", "museum", "hotel"]) pick.push({ label: "landmark", id });
    for (const p of pick) {
      const u = P.units.find((x) => x.id === p.id)!, out = route(net, ["mat:" + f.id, "door:" + u.id]);
      // home: heavy loot by whichever door is quicker; a landmark's GIANTS leave by its loading side (the dock, the
      // goods yard...: the front has steps or revolving doors), a shop's by its front door
      const front = route(net, ["door:" + u.id, "mat:" + f.id]), back = u.back ? route(net, ["back:" + u.id, "mat:" + f.id]) : front;
      const heavyWay = back.dist < front.dist ? back : front, giantWay = u.kind === "landmark" ? back : front;
      rows.push({ fort: f.id, what: p.label, id: u.id, name: u.name, kind: u.kind, tier: u.tier, outM: out.dist, out: walk(out.pts, ""), heavyM: heavyWay.dist, heavy: walk(heavyWay.pts, "crt_tv"), giantM: giantWay.dist, giant: walk(giantWay.pts, "arcade_machine"), outPts: out.pts, homePts: giantWay.pts });
    }
  }
  return rows;
}

if (process.argv[1]?.endsWith("compact-walk.ts")) {
  const out: any = {};
  for (const plan of [COMPACT, V2_PLAN]) {
    const rows = table(plan); out[plan.id] = rows.map(({ outPts, homePts, ...r }) => r);
    console.log(`\n== ${plan.name}: walked with the real movement code (no collisions) ==`);
    for (const r of rows) console.log(`${r.fort} ${r.what.padEnd(13)} ${r.name.padEnd(36)} out ${r.outM.toFixed(0).padStart(4)} m ${r.out.toFixed(1).padStart(5)} s | heavy ${r.heavyM.toFixed(0).padStart(4)} m ${r.heavy.toFixed(0).padStart(4)} s | giant ${r.giantM.toFixed(0).padStart(4)} m ${r.giant.toFixed(0).padStart(4)} s`);
  }
  fs.mkdirSync("docs/queens/compact/data", { recursive: true });
  fs.writeFileSync("docs/queens/compact/data/walk.json", JSON.stringify(out, null, 1));
}
