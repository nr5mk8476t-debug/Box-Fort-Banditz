import { World } from "../src/index.js";
const w = new World({ seed: 1, npcs: 0, spawnLoot: false });
const cx = -43.8 + 0.5614 * 5, cz = 29.7 + 0.8276 * 5;
const near = w.arena.boxes.filter((b: any) => b.kind === "sidewalk" && Math.abs(b.x - cx) < 12 && Math.abs(b.z - cz) < 12);
const thin = near.filter((b: any) => b.poly).map((b: any) => {
  const P = b.poly as [number, number][]; let A = 0, per = 0;
  for (let k = 0; k < P.length; k++) { const [x1, z1] = P[k], [x2, z2] = P[(k + 1) % P.length]; A += x1 * z2 - x2 * z1; per += Math.hypot(x2 - x1, z2 - z1); }
  A = Math.abs(A) / 2; return { w: (2 * A) / (per / 2 || 1), len: per / 2, b, n: P.length };
}).filter((q) => q.w < 0.08 && q.len > 1.0);
console.log("pieces near", near.length, "of which polys", near.filter((b: any) => b.poly).length, "thin slivers", thin.length);
for (const q of thin.slice(0, 10)) console.log(`  width ${q.w.toFixed(3)} length ${q.len.toFixed(2)} pts ${q.n} at ${q.b.x.toFixed(2)},${q.b.z.toFixed(2)} ${JSON.stringify(q.b.poly.map((p: number[]) => p.map((v) => +v.toFixed(3))))}`);
const rects = near.filter((b: any) => !b.poly && (b.w < 0.08 || b.d < 0.08));
console.log("thin rects", rects.length, rects.slice(0, 5).map((b: any) => `${b.w.toFixed(3)}x${b.d.toFixed(3)} at ${b.x.toFixed(2)},${b.z.toFixed(2)}`));
