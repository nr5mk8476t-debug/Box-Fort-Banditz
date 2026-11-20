// TR4 (Blake: "finish one small area first"): the PARK KIT. Draws the first finished section of the roundabout market
// park (the test map's `arena.park`): the SELL stall, F1's cardboard home, its patchy yard and pallet fence, the paved
// plaza and north path, the north-west trees, lanterns, and how it all looks at dusk.
//
// How it stays cheap:
// - ONE painted texture sheet (drawn here, in code, at load: no image files) for every kit piece: wood grain, cardboard
//   with tape, striped canvas, corrugated metal, the tarp, the SELL board, a crown. A piece's colour variation comes from
//   its vertex colours (and a little painted shading: darker near the ground, darker under the canopy).
// - Geometry is written straight into shared arrays (no Babylon mesh per plank) and becomes a handful of meshes: the kit
//   (lit, one material), the paving and the yard ground (one tiled texture each), the lantern glass (glowing), the night
//   glow pools. About eight meshes for the whole section.
// - No real-time light: the lantern glass is emissive (it glows, it doesn't light anything); the warm pools on the ground
//   at night are painted decals that fade in with the dark (like the street lamps' pools); the kit's lit material is
//   lifted a little at night so the canopy and the sign stay readable.
// Collision for all of it is in the shared map (testmap.ts: hidden boxes), matched to these shapes.
import { Mesh, StandardMaterial, DynamicTexture, Texture, Color3, VertexData, CellMaterial, TransformNode, type Scene } from "./babylon.ts";
import type { ArenaLayout } from "@bfb/shared";
import { NIGHT_HOOKS } from "./nightRenderer.ts";

type XZ = [number, number];
type RGB = [number, number, number];
/** a cell of the texture sheet: u0, v0, u1, v1 (0..1) */
type Cell = [number, number, number, number];

// ---- the texture sheet: 4 x 4 cells of 256 px ----------------------------------------------------------------------
const SZ = 1024, C = 256;
const cell = (cx: number, cy: number, w = 1, h = 1): Cell => [cx / 4, 1 - (cy + h) / 4, (cx + w) / 4, 1 - cy / 4];
export const KIT_CELLS = {
  wood: cell(0, 0), woodGrey: cell(1, 0), card: cell(2, 0), cardDark: cell(3, 0),
  canvasRed: cell(0, 1), canvasTeal: cell(1, 1), canvasBlue: cell(2, 1), canvasYellow: cell(3, 1),
  iron: cell(0, 2), corrugated: cell(1, 2), tarp: cell(2, 2), plain: cell(3, 2),
  sell: cell(0, 3, 2, 1), crown: cell(2, 3), sofa: cell(3, 3),
};
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), (s >>> 0) / 4294967296); }

function drawSheet(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("parkKitSheet", { width: SZ, height: SZ }, scene, true);
  const c = t.getContext() as unknown as CanvasRenderingContext2D, r = rng(7);
  const at = (cx: number, cy: number, fn: (x0: number, y0: number) => void) => { c.save(); c.beginPath(); c.rect(cx * C, cy * C, C, C); c.clip(); fn(cx * C, cy * C); c.restore(); };
  // painted planks: boards with grain, darker gaps, a lighter top edge (the "painted bevel")
  const planks = (cx: number, cy: number, base: string, dark: string) => at(cx, cy, (x0, y0) => {
    c.fillStyle = base; c.fillRect(x0, y0, C, C);
    for (let b = 0; b < 4; b++) {
      const bx = x0 + b * 64;
      c.fillStyle = `rgba(255,240,210,${0.06 + r() * 0.08})`; c.fillRect(bx + 2, y0, 60, C);
      for (let g = 0; g < 9; g++) { c.strokeStyle = `rgba(60,35,15,${0.18 + r() * 0.2})`; c.lineWidth = 1 + r() * 1.5; c.beginPath(); let gx = bx + 6 + r() * 52; c.moveTo(gx, y0); for (let y = 0; y <= C; y += 32) { gx += (r() - 0.5) * 5; c.lineTo(gx, y0 + y); } c.stroke(); }
      if (r() < 0.6) { c.fillStyle = "rgba(60,35,15,0.45)"; c.beginPath(); c.ellipse(bx + 14 + r() * 36, y0 + r() * C, 4, 7, 0, 0, 6.3); c.fill(); }
      c.fillStyle = dark; c.fillRect(bx, y0, 3, C); c.fillRect(bx + 61, y0, 3, C);
    }
  });
  planks(0, 0, "#b8875a", "#5a3a20");
  planks(1, 0, "#9a948a", "#4a4640");
  // cardboard: corrugation lines, a darker edge, a strip of tape, a few scuffs
  const card = (cx: number, cy: number, base: string) => at(cx, cy, (x0, y0) => {
    c.fillStyle = base; c.fillRect(x0, y0, C, C);
    for (let y = 0; y < C; y += 6) { c.fillStyle = `rgba(90,55,20,${0.05 + r() * 0.05})`; c.fillRect(x0, y0 + y, C, 2); }
    c.strokeStyle = "rgba(70,40,15,0.55)"; c.lineWidth = 6; c.strokeRect(x0 + 3, y0 + 3, C - 6, C - 6);
    c.fillStyle = "rgba(225,205,160,0.85)"; c.fillRect(x0 + C * 0.42, y0, 26, C); // (the tape down the seam)
    c.strokeStyle = "rgba(160,130,90,0.6)"; c.lineWidth = 1; for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(x0 + C * 0.42, y0 + r() * C); c.lineTo(x0 + C * 0.42 + 26, y0 + r() * C); c.stroke(); }
    for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(60,35,15,${0.08 + r() * 0.1})`; c.beginPath(); c.ellipse(x0 + r() * C, y0 + r() * C, 6 + r() * 16, 3 + r() * 6, r() * 3, 0, 6.3); c.fill(); }
    c.fillStyle = "rgba(60,35,15,0.5)"; c.font = "bold 22px sans-serif"; c.fillText("THIS SIDE UP ↑", x0 + 22, y0 + C - 30);
  });
  card(2, 0, "#c9a06a");
  card(3, 0, "#a87e4e");
  // striped canvas: stripes across, a little sag shading, stitched seams
  const canvas = (cx: number, cy: number, col: string) => at(cx, cy, (x0, y0) => {
    for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? "#f3ead2" : col; c.fillRect(x0 + (k * C) / 6, y0, C / 6, C); }
    const g = c.createLinearGradient(x0, y0, x0, y0 + C); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(40,20,10,0.22)"); c.fillStyle = g; c.fillRect(x0, y0, C, C);
    c.strokeStyle = "rgba(60,30,20,0.25)"; c.setLineDash([6, 5]); for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(x0 + (k * C) / 6, y0); c.lineTo(x0 + (k * C) / 6, y0 + C); c.stroke(); } c.setLineDash([]);
  });
  canvas(0, 1, "#d6402f"); canvas(1, 1, "#1f9e8c"); canvas(2, 1, "#2f6db5"); canvas(3, 1, "#e8b21f");
  // dark iron with rivets; corrugated metal; the blue tarp; plain white (vertex colour only)
  at(0, 2, (x0, y0) => { c.fillStyle = "#3a3a42"; c.fillRect(x0, y0, C, C); for (let k = 0; k < 30; k++) { c.fillStyle = `rgba(255,255,255,${r() * 0.08})`; c.fillRect(x0 + r() * C, y0 + r() * C, 20, 2); } c.fillStyle = "#6a6a74"; for (let y = 20; y < C; y += 60) for (let x = 20; x < C; x += 60) { c.beginPath(); c.arc(x0 + x, y0 + y, 4, 0, 6.3); c.fill(); } });
  at(1, 2, (x0, y0) => { for (let x = 0; x < C; x += 16) { const g = c.createLinearGradient(x0 + x, 0, x0 + x + 16, 0); g.addColorStop(0, "#8a9098"); g.addColorStop(0.5, "#c8ccd2"); g.addColorStop(1, "#6a7078"); c.fillStyle = g; c.fillRect(x0 + x, y0, 16, C); } for (let k = 0; k < 8; k++) { c.fillStyle = `rgba(150,80,30,${0.15 + r() * 0.25})`; c.beginPath(); c.ellipse(x0 + r() * C, y0 + r() * C, 10 + r() * 30, 6 + r() * 14, 0, 0, 6.3); c.fill(); } });
  at(2, 2, (x0, y0) => { c.fillStyle = "#3d74c6"; c.fillRect(x0, y0, C, C); c.strokeStyle = "rgba(20,40,90,0.35)"; c.lineWidth = 2; for (let x = 0; x < C; x += 22) { c.beginPath(); c.moveTo(x0 + x, y0); c.lineTo(x0 + x, y0 + C); c.stroke(); } for (let y = 0; y < C; y += 22) { c.beginPath(); c.moveTo(x0, y0 + y); c.lineTo(x0 + C, y0 + y); c.stroke(); } c.fillStyle = "#e8e8e8"; for (const [x, y] of [[10, 10], [C - 18, 10], [10, C - 18], [C - 18, C - 18]]) { c.beginPath(); c.arc(x0 + x + 4, y0 + y + 4, 6, 0, 6.3); c.fill(); } });
  at(3, 2, (x0, y0) => { c.fillStyle = "#ffffff"; c.fillRect(x0, y0, C, C); });
  // the SELL board (two cells wide): cream, a painted border, big hand-lettered SELL
  c.save(); c.beginPath(); c.rect(0, 3 * C, 2 * C, C); c.clip();
  c.fillStyle = "#f1e2bd"; c.fillRect(0, 3 * C, 2 * C, C);
  c.strokeStyle = "#7a4a22"; c.lineWidth = 16; c.strokeRect(8, 3 * C + 8, 2 * C - 16, C - 16);
  c.fillStyle = "#2e2318"; c.font = "bold 168px 'Bungee', 'Arial Black', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("SELL", C, 3 * C + C / 2 + 8);
  c.restore();
  // a white crown on a transparent-looking dark ground (tinted by the owner's colour through the vertex colour)
  at(2, 3, (x0, y0) => { c.fillStyle = "#2a2a30"; c.fillRect(x0, y0, C, C); c.fillStyle = "#ffffff"; c.beginPath(); c.moveTo(x0 + 40, y0 + 190); c.lineTo(x0 + 40, y0 + 80); c.lineTo(x0 + 88, y0 + 130); c.lineTo(x0 + 128, y0 + 60); c.lineTo(x0 + 168, y0 + 130); c.lineTo(x0 + 216, y0 + 80); c.lineTo(x0 + 216, y0 + 190); c.closePath(); c.fill(); });
  // the sofa's worn fabric
  at(3, 3, (x0, y0) => { c.fillStyle = "#b8483a"; c.fillRect(x0, y0, C, C); for (let k = 0; k < 400; k++) { c.fillStyle = `rgba(${r() < 0.5 ? "255,220,200" : "60,10,10"},${r() * 0.12})`; c.fillRect(x0 + r() * C, y0 + r() * C, 3, 3); } c.fillStyle = "#e0b090"; c.fillRect(x0 + 150, y0 + 60, 50, 30); });
  t.update(true);
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}

/** a small tiled texture: paving stones, or the yard's grass-and-dirt speckle (coloured by the vertex colours) */
function tileTexture(scene: Scene, kind: "paving" | "ground"): DynamicTexture {
  const n = 256, t = new DynamicTexture("parkTile_" + kind, { width: n, height: n }, scene, true), c = t.getContext() as unknown as CanvasRenderingContext2D, r = rng(kind === "paving" ? 11 : 13);
  if (kind === "paving") {
    c.fillStyle = "#8f8270"; c.fillRect(0, 0, n, n); // (the grout)
    const rows = 4;
    for (let y = 0; y < rows; y++) { let x = y % 2 ? -32 : 0; while (x < n) { const w = 48 + Math.floor(r() * 3) * 16, sh = 200 + r() * 40; c.fillStyle = `rgb(${sh},${sh * 0.93},${sh * 0.82})`; c.fillRect(x + 3, y * (n / rows) + 3, w - 6, n / rows - 6); c.fillStyle = "rgba(255,255,255,0.12)"; c.fillRect(x + 3, y * (n / rows) + 3, w - 6, 5); for (let k = 0; k < 3; k++) { c.fillStyle = `rgba(80,60,40,${r() * 0.12})`; c.fillRect(x + 6 + r() * (w - 20), y * (n / rows) + 8 + r() * 40, 10 + r() * 14, 4 + r() * 6); } x += w; } }
  } else {
    c.fillStyle = "#dcdcdc"; c.fillRect(0, 0, n, n);
    for (let k = 0; k < 1800; k++) { const v = 150 + r() * 105; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(r() * n, r() * n, 1 + r() * 2, 3 + r() * 5); }
    for (let k = 0; k < 20; k++) { c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; c.beginPath(); c.ellipse(r() * n, r() * n, 8 + r() * 24, 5 + r() * 12, r() * 3, 0, 6.3); c.fill(); }
  }
  t.update(true);
  t.wrapU = Texture.WRAP_ADDRESSMODE; t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

// ---- the geometry writer ----------------------------------------------------------------------------------------------
class Geo {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  /** painted shading: a vertex this high (world y) or lower is darker (the "contact shadow" painted in) */
  constructor(private ao = 1.1) {}
  private shade(y: number) { return 0.78 + 0.22 * Math.max(0, Math.min(1, y / this.ao)); }
  /**
   * A box: centre, size (w along local x, h up, d along local z), turned by yaw (about y), then tilted by pitch (about the
   * local x axis) and roll (about local z). Each face's texture cell (one for all, or [+x, -x, +y, -y, +z, -z]).
   */
  box(c: [number, number, number], s: [number, number, number], rot: { yaw?: number; pitch?: number; roll?: number }, cells: Cell | Cell[], tint: RGB = [1, 1, 1], under = 1) {
    const [w, h, d] = s.map((v) => v / 2), yaw = rot.yaw ?? 0, pitch = rot.pitch ?? 0, roll = rot.roll ?? 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const tr = (x: number, y: number, z: number): [number, number, number] => {
      // roll (z), then pitch (x), then yaw (y)
      let x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
      const y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp; y1 = y2; z1 = z2;
      return [x1 * cy + z1 * sy, y1, -x1 * sy + z1 * cy];
    };
    const faces: [number[], number[], number[]][] = [
      [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, -1]], [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
    ];
    faces.forEach(([n, uDir, vDir], fi) => {
      const cl = Array.isArray(cells[0]) ? (cells as Cell[])[fi] : (cells as Cell), o = this.pos.length / 3;
      const ext = [w, h, d];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = n[0] * ext[0] + uDir[0] * a * ext[0] + vDir[0] * b * ext[0], ly = n[1] * ext[1] + uDir[1] * a * ext[1] + vDir[1] * b * ext[1], lz = n[2] * ext[2] + uDir[2] * a * ext[2] + vDir[2] * b * ext[2];
        const p = tr(lx, ly, lz), q = tr(n[0], n[1], n[2]);
        this.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]); this.nrm.push(q[0], q[1], q[2]);
        this.uv.push(cl[0] + ((a + 1) / 2) * (cl[2] - cl[0]), cl[1] + ((b + 1) / 2) * (cl[3] - cl[1]));
        const sh = this.shade(c[1] + p[1]) * (n[1] < -0.5 ? under : 1);
        this.col.push(tint[0] * sh, tint[1] * sh, tint[2] * sh, 1);
      }
      this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
  }
  /** an upright prism (a post, a tyre, a pan): n sides, radius r0 at the bottom, r1 at the top */
  prism(c: [number, number, number], r0: number, r1: number, h: number, n: number, cl: Cell, tint: RGB, rot = 0) {
    const ring = (r: number, y: number) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return [c[0] + r * Math.cos(a), c[1] + y, c[2] + r * Math.sin(a)]; });
    const lo = ring(r0, 0), hi = ring(r1, h);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, o = this.pos.length / 3, a = rot + ((i + 0.5) / n) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      for (const [p, u, v] of [[lo[i], 0, 0], [lo[j], 1, 0], [hi[j], 1, 1], [hi[i], 0, 1]] as [number[], number, number][]) {
        this.pos.push(p[0], p[1], p[2]); this.nrm.push(nx, 0, nz); this.uv.push(cl[0] + u * (cl[2] - cl[0]), cl[1] + v * (cl[3] - cl[1]));
        const sh = this.shade(p[1]); this.col.push(tint[0] * sh, tint[1] * sh, tint[2] * sh, 1);
      }
      this.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
    }
    // the top cap
    const o = this.pos.length / 3; for (const p of hi) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(0, 1, 0); this.uv.push((cl[0] + cl[2]) / 2, (cl[1] + cl[3]) / 2); const sh = this.shade(p[1]); this.col.push(tint[0] * sh, tint[1] * sh, tint[2] * sh, 1); }
    for (let i = 1; i < n - 1; i++) this.idx.push(o, o + i + 1, o + i);
  }
  /** a flat polygon (convex or a fan from its first point), at height y, its texture by world x/z / scale */
  flat(pts: XZ[], y: number, scale: number, tint: (x: number, z: number) => RGB) {
    const o = this.pos.length / 3;
    for (const [x, z] of pts) { this.pos.push(x, y, z); this.nrm.push(0, 1, 0); this.uv.push(x / scale, z / scale); const t = tint(x, z); this.col.push(t[0], t[1], t[2], 1); }
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(o, o + i + 1, o + i);
  }
  /** a jittered low-poly ball (a tree's crown): an icosahedron, each face flat-shaded */
  crown(c: [number, number, number], r: number, squash: number, seed: number, greens: RGB[]) {
    const t = (1 + Math.sqrt(5)) / 2, R = rng(seed);
    const v0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(([x, y, z]) => { const l = Math.hypot(x, y, z), k = r * (0.82 + R() * 0.36); return [(x / l) * k, (y / l) * k * squash, (z / l) * k]; });
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const pl = KIT_CELLS.plain;
    F.forEach((f, k) => {
      const [a, b, d] = f.map((i) => v0[i]), ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const g = greens[k % greens.length], sh = 0.8 + 0.25 * Math.max(0, ny), o = this.pos.length / 3;
      for (const p of [a, b, d]) { this.pos.push(c[0] + p[0], c[1] + p[1], c[2] + p[2]); this.nrm.push(nx, ny, nz); this.uv.push(pl[0] + 0.5 / 4, pl[1] + 0.5 / 4); this.col.push(g[0] * sh, g[1] * sh, g[2] * sh, 1); }
      this.idx.push(o, o + 2, o + 1);
    });
  }
  mesh(name: string, scene: Scene): Mesh | null {
    if (!this.idx.length) return null;
    const m = new Mesh(name, scene), vd = new VertexData();
    vd.positions = this.pos; vd.normals = this.nrm; vd.uvs = this.uv; vd.colors = this.col; vd.indices = this.idx;
    vd.applyToMesh(m); m.isPickable = false;
    return m;
  }
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const K = KIT_CELLS;

// ---- the pieces -------------------------------------------------------------------------------------------------------
/** the SELL stall (the shared stall frame + its own goods), in the stall's frame: a across, b toward the customer */
function stall(g: Geo, glass: Geo, pools: XZ[], st: NonNullable<NonNullable<ArenaLayout["park"]>["stall"]>) {
  const [fx, fz] = st.face, rx = fz, rz = -fx; // (right = the face turned a quarter)
  const at = (a: number, b: number): XZ => [st.x + rx * a + fx * b, st.z + rz * a + fz * b];
  const yaw = Math.atan2(fx, fz);
  const P = (a: number, y: number, b: number): [number, number, number] => { const [x, z] = at(a, b); return [x, y, z]; };
  const wood = hex("#c79461"), woodD = hex("#8a5d34"), half = st.w / 2 - 0.1;
  // posts: a sturdy frame, taller at the back (the canopy slopes down to the customer)
  for (const [a, b, h] of [[-half, half, 2.3], [half, half, 2.3], [-half, -half, 2.75], [half, -half, 2.75]] as const) g.box(P(a, h / 2, b), [0.16, h, 0.16], { yaw }, K.wood, woodD);
  // cross braces at the sides, a beam under the canopy's front and back edges (the "plausible connections")
  for (const s of [-1, 1]) { g.box(P(s * half, 1.7, 0), [0.08, 0.1, st.w - 0.3], { yaw, pitch: 0 }, K.wood, woodD); g.box(P(s * half, 1.25, 0), [0.07, 0.07, 2.2], { yaw, pitch: 0.5 }, K.wood, woodD); }
  g.box(P(0, 2.24, half), [st.w - 0.05, 0.12, 0.12], { yaw }, K.wood, woodD); g.box(P(0, 2.69, -half), [st.w - 0.05, 0.12, 0.12], { yaw }, K.wood, woodD);
  // the counter: waist height (1.0 m), a thick top lipped over a planked front, shelves behind
  g.box(P(0, 1.0, half - 0.05), [st.w - 0.1, 0.09, 0.62], { yaw }, K.wood, wood);
  g.box(P(0, 0.48, half + 0.13), [st.w - 0.2, 0.92, 0.06], { yaw }, [K.wood, K.wood, K.wood, K.wood, K.wood, K.wood], hex("#b07c4a"));
  g.box(P(0, 0.06, half - 0.1), [st.w - 0.2, 0.12, 0.5], { yaw }, K.wood, woodD);
  g.box(P(0, 1.3, -half + 0.25), [st.w - 0.3, 0.06, 0.4], { yaw }, K.wood, wood);
  // the canopy: striped canvas sloping from the back (2.85 m) to the front (2.32 m), over the edges a little
  const front = half + 0.45, back = -half - 0.15, yF = 2.36, yB = 2.86, len = Math.hypot(front - back, yB - yF), pitch = Math.atan2(yB - yF, front - back);
  g.box(P(0, (yF + yB) / 2 + 0.04, (front + back) / 2), [st.w + 0.5, 0.04, len], { yaw, pitch }, [K.canvasRed, K.canvasRed, K.canvasRed, K.canvasRed, K.canvasRed, K.canvasRed], [1, 1, 1], 0.82);
  // the hanging edge: scalloped flaps along the front and part way down the sides
  for (let k = 0; k < 9; k++) { const a = -st.w / 2 - 0.2 + (k + 0.5) * ((st.w + 0.4) / 9), col: RGB = k % 2 ? hex("#f3ead2") : hex("#d6402f"); g.box(P(a, yF - 0.08 - (k % 2 ? 0.02 : 0.05), front + 0.02), [(st.w + 0.4) / 9 - 0.02, k % 2 ? 0.2 : 0.26, 0.025], { yaw }, K.plain, col); }
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const b = front - 0.35 - k * 0.7, y = yF + (front - b) * Math.tan(pitch) - 0.1; g.box(P(s * (st.w / 2 + 0.25), y, b), [0.025, 0.22, 0.66], { yaw }, K.plain, k % 2 ? hex("#f3ead2") : hex("#d6402f")); }
  // the SELL sign: a board standing on the canopy's front edge on two little uprights, readable from the path
  for (const s of [-0.8, 0.8]) g.box(P(s, yF + 0.22, front - 0.05), [0.07, 0.42, 0.07], { yaw }, K.wood, woodD);
  g.box(P(0, yF + 0.62, front - 0.02), [2.1, 0.62, 0.07], { yaw }, [K.wood, K.wood, K.wood, K.wood, K.sell, K.wood], [1, 1, 1]);
  // the goods: weighing scales, a salvage crate, a cashbox; spare crates under the counter (out of the way)
  { const [a, b] = [-0.65, half - 0.05]; g.box(P(a, 1.08, b), [0.36, 0.06, 0.26], { yaw }, K.iron, hex("#9aa0a8")); g.box(P(a, 1.25, b), [0.04, 0.3, 0.04], { yaw }, K.iron, hex("#8a9098")); g.box(P(a, 1.4, b), [0.5, 0.03, 0.03], { yaw }, K.iron, hex("#8a9098")); for (const s of [-1, 1]) g.prism(P(a + s * 0.24, 1.3, b), 0.08, 0.12, 0.04, 8, K.plain, hex("#c8a24a")); g.box(P(a, 1.2, b + 0.14), [0.18, 0.18, 0.02], { yaw }, K.plain, hex("#f4f0e0")); }
  { const [a, b] = [0.25, half - 0.08]; g.box(P(a, 1.24, b), [0.55, 0.38, 0.42], { yaw: yaw + 0.12 }, K.woodGrey, hex("#d8c8a8")); g.box(P(a + 0.05, 1.46, b), [0.3, 0.12, 0.2], { yaw: yaw - 0.3 }, K.iron, hex("#c06a3a")); }
  { const [a, b] = [0.95, half - 0.02]; g.box(P(a, 1.12, b), [0.34, 0.14, 0.24], { yaw: yaw - 0.15 }, K.iron, hex("#b8433a")); g.box(P(a, 1.12, b + 0.12), [0.06, 0.05, 0.02], { yaw: yaw - 0.15 }, K.plain, hex("#e8c050")); }
  for (const [a, h, r] of [[-0.75, 0.42, 0.1], [0.55, 0.36, -0.2]] as const) g.box(P(a, h / 2 + 0.12, half - 0.15), [0.55, h, 0.38], { yaw: yaw + r }, K.wood, hex("#d0a070"));
  // lanterns hanging off the canopy's front corners (iron frames; the glass glows: the glass mesh)
  for (const s of [-1, 1]) {
    const [x, z] = at(s * (st.w / 2 + 0.05), front - 0.12);
    g.box([x, yF - 0.18, z], [0.03, 0.3, 0.03], { yaw }, K.iron, hex("#2a2a30"));
    g.box([x, yF - 0.42, z], [0.22, 0.04, 0.22], { yaw }, K.iron, hex("#2a2a30")); g.box([x, yF - 0.7, z], [0.24, 0.04, 0.24], { yaw }, K.iron, hex("#2a2a30"));
    glass.box([x, yF - 0.56, z], [0.17, 0.25, 0.17], { yaw }, K.plain, [1, 1, 1]);
  }
  pools.push(at(0, half + 1.6));
}

/** F1's cardboard home, in the fort's frame (x across its front, z toward the market); collision is the fort box */
function fort(g: Geo, glass: Geo, lot: { x: number; z: number; yaw: number }, owner: RGB) {
  const cy = Math.cos(lot.yaw), sy = Math.sin(lot.yaw);
  const P = (x: number, y: number, z: number): [number, number, number] => [lot.x + x * cy + z * sy, y, lot.z - x * sy + z * cy];
  const yw = lot.yaw, card = hex("#e6c08a"), cardB = hex("#c79a62"), cardC = hex("#b5874f");
  // the main box (2.4 x 1.45 x 1.9), a little skew; a second box on top at the back; flaps folded up
  g.box(P(0, 0.73, 0), [2.4, 1.45, 1.9], { yaw: yw, roll: 0.02 }, [K.card, K.card, K.cardDark, K.cardDark, K.card, K.card], card);
  g.box(P(-0.45, 1.45 + 0.42, -0.35), [1.15, 0.84, 1.0], { yaw: yw + 0.12, roll: -0.04 }, [K.cardDark, K.cardDark, K.card, K.card, K.cardDark, K.cardDark], cardB);
  for (const [x, z, w, d, rx, rz] of [[0.55, 0.62, 1.1, 0.5, -0.9, 0], [0.55, -0.62, 1.1, 0.5, 0.75, 0], [1.05, 0, 0.5, 1.6, 0, 0.6]] as const) g.box(P(x, 1.47 + 0.18, z), [w, 0.03, d], { yaw: yw, pitch: rx, roll: rz }, K.cardDark, cardC);
  // tape over the seams and across the top
  for (const x of [-1.2, 1.2]) g.box(P(x, 0.75, 0.95), [0.1, 1.42, 0.02], { yaw: yw }, K.plain, hex("#e8d8a8"));
  g.box(P(0, 1.46, 0.3), [2.42, 0.012, 0.1], { yaw: yw }, K.plain, hex("#e8d8a8"));
  // the doorway: a dark opening with its flap swung open
  g.box(P(-0.35, 0.55, 0.955), [0.8, 1.05, 0.02], { yaw: yw }, K.plain, hex("#2a1e14"));
  g.box(P(-0.82, 0.55, 1.2), [0.03, 1.0, 0.55], { yaw: yw - 0.5 }, K.cardDark, cardC);
  // the owner's crown painted on the front, and the flag on a broom-handle pole at the back corner
  g.box(P(0.6, 0.8, 0.96), [0.6, 0.48, 0.015], { yaw: yw }, [K.crown, K.crown, K.crown, K.crown, K.crown, K.crown], owner);
  g.prism(P(1.1, 0, -0.85), 0.035, 0.03, 2.9, 6, K.wood, hex("#8a5d34"));
  g.box(P(1.47, 2.6, -0.85), [0.72, 0.46, 0.02], { yaw: yw }, [K.crown, K.crown, K.crown, K.crown, K.crown, K.crown], owner);
  // the tarp awning on two sticks, high enough to walk under (2.05 m at its front)
  for (const x of [-1.15, 1.15]) g.prism(P(x, 0, 2.35), 0.035, 0.03, 2.05, 6, K.wood, hex("#8a5d34"));
  g.box(P(0, 1.85, 1.65), [2.6, 0.03, 1.5], { yaw: yw, pitch: -0.18 }, [K.tarp, K.tarp, K.tarp, K.tarp, K.tarp, K.tarp], [1, 1, 1], 0.85);
  // a tin-can lantern hung from the awning (its glass glows)
  g.box(P(1.0, 1.82, 2.2), [0.02, 0.2, 0.02], { yaw: yw }, K.iron, hex("#2a2a30"));
  glass.box(P(1.0, 1.63, 2.2), [0.14, 0.18, 0.14], { yaw: yw }, K.plain, [1, 1, 1]);
}

/** a pallet fence along a piece: posts, two rails, uneven planks with gaps; every so often a corrugated patch */
function fence(g: Geo, a: XZ, b: XZ, seed: number) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) return;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, yaw = Math.atan2(dx, dz) - Math.PI / 2, R = rng(seed);
  const secs = Math.max(1, Math.round(L / 1.6)), sl = L / secs;
  const WOODS: RGB[] = [hex("#b8875a"), hex("#a8774a"), hex("#c49a6a"), hex("#9a948a"), hex("#8f6a45")];
  for (let s = 0; s < secs; s++) {
    const t0 = s * sl, P = (t: number, y: number): [number, number, number] => [a[0] + dx * t, y, a[1] + dz * t];
    g.box(P(t0, 0.62), [0.11, 1.24, 0.11], { yaw }, K.wood, hex("#7a5232"));
    if (R() < 0.18) { g.box(P(t0 + sl / 2, 0.55), [sl - 0.12, 1.02, 0.03], { yaw, roll: (R() - 0.5) * 0.06 }, K.corrugated, [1, 1, 1]); continue; }
    for (const y of [0.3, 0.82]) g.box(P(t0 + sl / 2, y), [sl, 0.08, 0.05], { yaw }, K.wood, hex("#8a6038"));
    const n = Math.max(2, Math.floor(sl / 0.17));
    for (let k = 0; k < n; k++) {
      const t = t0 + (k + 0.5) * (sl / n), h = 0.95 + R() * 0.2, wd = sl / n - 0.035, tint = R() < 0.08 ? (R() < 0.5 ? hex("#6f8fb0") : hex("#b8584a")) : WOODS[Math.floor(R() * WOODS.length)];
      g.box(P(t, h / 2 + 0.02), [wd, h, 0.035], { yaw, roll: (R() - 0.5) * 0.05 }, K.wood, tint);
    }
  }
  g.box([b[0], 0.62, b[1]], [0.11, 1.24, 0.11], { yaw }, K.wood, hex("#7a5232"));
}

/** one of three tree shapes: a tapered trunk, an angular crown or two */
function tree(g: Geo, t: { x: number; z: number; v: number; s: number; yaw: number }) {
  const s = t.s, G: RGB[][] = [[hex("#4f8a3c"), hex("#5c9a44"), hex("#467a35")], [hex("#5a8f3a"), hex("#689c44"), hex("#4c7c33")], [hex("#4a8648"), hex("#58964e"), hex("#3f743c")]];
  g.prism([t.x, 0, t.z], 0.2 * s, 0.13 * s, 2.5 * s, 6, K.wood, hex("#6a4a2e"), t.yaw);
  if (t.v === 0) g.crown([t.x, 3.2 * s, t.z], 1.55 * s, 0.85, Math.round(t.x * 31 + t.z), G[0]);
  else if (t.v === 1) { g.crown([t.x, 3.0 * s, t.z], 1.3 * s, 0.9, Math.round(t.x * 17 + t.z), G[1]); g.crown([t.x + 0.5 * s * Math.cos(t.yaw), 3.9 * s, t.z + 0.5 * s * Math.sin(t.yaw)], 0.95 * s, 0.85, Math.round(t.z * 13), G[1]); }
  else g.crown([t.x, 3.5 * s, t.z], 1.25 * s, 1.35, Math.round(t.x * 7 - t.z), G[2]);
}

/** yard props: a battered sofa, a stack of pallets, a pile of tyres, crates */
function prop(g: Geo, q: NonNullable<ArenaLayout["park"]>["props"][number]) {
  const cy = Math.cos(q.yaw), sy = Math.sin(q.yaw), P = (x: number, y: number, z: number): [number, number, number] => [q.x + x * cy + z * sy, y, q.z - x * sy + z * cy];
  if (q.kind === "sofa") {
    g.box(P(0, 0.22, 0), [q.w, 0.3, q.d], { yaw: q.yaw }, K.sofa, [1, 1, 1]);
    g.box(P(0, 0.55, -q.d / 2 + 0.12), [q.w, 0.55, 0.22], { yaw: q.yaw, pitch: -0.12 }, K.sofa, [0.92, 0.92, 0.92]);
    for (const s of [-1, 1]) g.box(P(s * (q.w / 2 - 0.12), 0.45, 0.02), [0.24, 0.45, q.d - 0.05], { yaw: q.yaw }, K.sofa, [0.88, 0.88, 0.88]);
    g.box(P(0.35, 0.42, 0.08), [0.6, 0.12, 0.55], { yaw: q.yaw + 0.2, roll: 0.15 }, K.sofa, [1.05, 0.95, 0.9]);
  } else if (q.kind === "pallets") {
    for (let k = 0; k < 4; k++) g.box(P((k % 2) * 0.05, 0.07 + k * 0.15, 0), [q.w, 0.12, q.d], { yaw: q.yaw + k * 0.06 }, K.wood, hex(k % 2 ? "#a8774a" : "#b8875a"));
  } else if (q.kind === "tyres") {
    for (let k = 0; k < 3; k++) g.prism(P(k === 2 ? 0.1 : 0, k * 0.24, 0), 0.38, 0.38, 0.23, 10, K.iron, hex("#2a2a2e"), k * 0.4);
  } else {
    g.box(P(-0.33, 0.29, 0), [0.6, 0.58, 0.6], { yaw: q.yaw + 0.1 }, K.wood, hex("#c99a6a"));
    g.box(P(0.36, 0.25, 0.03), [0.55, 0.5, 0.55], { yaw: q.yaw - 0.15 }, K.card, hex("#d8b07a"));
    g.box(P(-0.3, 0.8, 0.02), [0.45, 0.42, 0.45], { yaw: q.yaw + 0.4 }, K.card, hex("#c79a62"));
  }
}

/** a lantern post (a timber post, an iron arm, the lantern; its glass glows) */
function lanternPost(g: Geo, glass: Geo, x: number, z: number, yaw: number, h = 1.6) {
  g.box([x, h / 2, z], [0.12, h, 0.12], { yaw }, K.wood, hex("#7a5232"));
  const ax = x + 0.28 * Math.sin(yaw), az = z + 0.28 * Math.cos(yaw);
  g.box([(x + ax) / 2, h - 0.08, (z + az) / 2], [0.03, 0.03, 0.3], { yaw }, K.iron, hex("#2a2a30"));
  g.box([ax, h - 0.24, az], [0.2, 0.04, 0.2], { yaw }, K.iron, hex("#2a2a30")); g.box([ax, h - 0.5, az], [0.22, 0.04, 0.22], { yaw }, K.iron, hex("#2a2a30"));
  glass.box([ax, h - 0.37, az], [0.15, 0.22, 0.15], { yaw }, K.plain, [1, 1, 1]);
}

// ---- the grounds -------------------------------------------------------------------------------------------------------
function inPoly(p: XZ, poly: XZ[]) { let s = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) s = !s; } return s; }
function segDist(p: XZ, a: XZ, b: XZ) { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t); }
function noise(x: number, z: number) { const s = Math.sin(x * 0.71 + z * 1.37) + Math.sin(x * 1.93 - z * 0.53) * 0.6 + Math.sin(x * 3.1 + z * 2.7) * 0.3; return s / 1.9; }

/** the yard: grass and bare dirt in patches, a worn track from the gates to the mat and the fort, bare round the fort */
function yardGround(gnd: Geo, park: NonNullable<ArenaLayout["park"]>, lot: { x: number; z: number }, plazaR: number) {
  const poly = park.yardPoly as XZ[], xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]), step = 0.6;
  const grass: RGB = hex("#6aa84f"), grass2: RGB = hex("#7fb55a"), dirt: RGB = hex("#a07a52"), dirt2: RGB = hex("#8a6a48");
  const track = park.track as XZ[], segs: [XZ, XZ][] = [[track[0], track[1]], [track[1], track[2]], [track[3], track[4]]];
  const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tint = (x: number, z: number): RGB => {
    const n = noise(x * 0.6, z * 0.6), dTrack = Math.min(...segs.map(([a, b]) => segDist([x, z], a, b))), dFort = Math.hypot(x - lot.x, z - lot.z);
    let bare = Math.max(0, Math.min(1, (0.15 - n) * 1.6)); // (patches of dirt)
    bare = Math.max(bare, 1 - Math.max(0, Math.min(1, (dTrack - 0.7) / 0.9))); // (the worn track)
    bare = Math.max(bare, 1 - Math.max(0, Math.min(1, (dFort - 2.0) / 1.5))); // (bare round the fort)
    const g = mix(grass, grass2, (noise(x * 1.7, z * 1.3) + 1) / 2), d = mix(dirt, dirt2, (noise(x * 2.1, z * 1.9) + 1) / 2);
    return mix(g, d, bare);
  };
  for (let x = Math.min(...xs); x < Math.max(...xs); x += step) for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
    const c: XZ = [x + step / 2, z + step / 2];
    if (!inPoly(c, poly) || Math.hypot(c[0], c[1]) < plazaR - 0.3) continue;
    gnd.flat([[x, z], [x + step, z], [x + step, z + step], [x, z + step]], 0.043, 1.2, tint);
  }
}

/** the plaza disc and the north path, paved; a stone edging where the paving meets the grass or the dirt */
function paving(pav: Geo, edge: Geo, p: NonNullable<ArenaLayout["park"]>["paving"]) {
  const R = p.plazaR, L = p.path.maxX, top = p.path.maxZ, n = 64, tint = (x: number, z: number): RGB => { const v = 0.94 + 0.08 * noise(x * 0.4, z * 0.4); return [v, v, v]; };
  pav.flat(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [R * Math.cos(a), R * Math.sin(a)] as XZ; }), 0.05, 1.6, tint);
  // the path: from the disc's edge (an arc between x = -L and L) up to the park's edge
  // (a fan from the middle of its far edge: every point of the curved near edge is in view from there)
  const arc: XZ[] = [];
  for (let k = 0; k <= 12; k++) { const x = L - (2 * L * k) / 12; arc.push([x, Math.sqrt(R * R - x * x)]); }
  pav.flat([[0, top], [L, top], ...arc, [-L, top]], 0.05, 1.6, tint);
  // the edging: stones along both sides of the path, and round the plaza except where the four paths meet it
  const stone: RGB = hex("#b8ab94");
  for (const s of [-1, 1]) for (let z = Math.sqrt(R * R - L * L) + 0.3; z < top - 0.3; z += 0.62) edge.box([s * (L + 0.1), 0.07, z + 0.3], [0.22, 0.06, 0.58], {}, K.plain, [stone[0] * (0.95 + 0.08 * noise(z, s)), stone[1], stone[2]]);
  for (let k = 0; k < 96; k++) {
    const a = ((k + 0.5) / 96) * Math.PI * 2, x = (R + 0.12) * Math.cos(a), z = (R + 0.12) * Math.sin(a);
    if (Math.abs(x) < L + 0.2 || Math.abs(z) < L + 0.2) continue;
    edge.box([x, 0.07, z], [0.22, 0.06, ((2 * Math.PI * R) / 96) * 0.92], { yaw: -a }, K.plain, stone);
  }
}

/** warm pools of light on the ground at night (decals, not lights) */
function poolTexture(scene: Scene) {
  const t = new DynamicTexture("parkPool", { width: 128, height: 128 }, scene, false), c = t.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,190,110,0.85)"); g.addColorStop(0.55, "rgba(255,170,90,0.3)"); g.addColorStop(1, "rgba(255,160,80,0)");
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); t.update(); t.hasAlpha = true; return t;
}

// ---- build it ----------------------------------------------------------------------------------------------------------
export interface ParkKit { meshes: Mesh[]; dispose(): void }
export function buildParkKit(scene: Scene, arena: ArenaLayout, root: TransformNode, ownerColor: (slot: number) => string): ParkKit | null {
  const park = arena.park; if (!park) return null;
  const kit = new Geo(1.1), glass = new Geo(99), pav = new Geo(), gnd = new Geo(), edge = new Geo(1.1), pools: XZ[] = [];
  const lot = (arena.forts ?? []).find((f) => f.slot === park.fort);
  if (park.stall) stall(kit, glass, pools, park.stall);
  if (lot) { fort(kit, glass, lot, hex(ownerColor(park.fort))); pools.push([lot.x + Math.sin(lot.yaw) * 2.2, lot.z + Math.cos(lot.yaw) * 2.2]); }
  park.fences.forEach(([a, b], i) => fence(kit, a as XZ, b as XZ, 101 + i * 7));
  for (const [x, z] of park.gatePosts) { kit.box([x, 0.8, z], [0.2, 1.6, 0.2], {}, K.wood, hex("#6e5232")); kit.box([x, 1.62, z], [0.26, 0.06, 0.26], {}, K.wood, hex("#5a3e24")); }
  // a lantern on the front gate's yard-side post (its glow marks the way home at night)
  if (park.gatePosts.length) { const [x, z] = park.gatePosts[0]; lanternPost(kit, glass, x, z, Math.PI / 2, 1.75); pools.push([x + 0.4, z]); }
  for (const t of park.trees) tree(kit, t);
  for (const q of park.props) prop(kit, q);
  if (lot) yardGround(gnd, park, lot, park.paving.plazaR);
  paving(pav, edge, park.paving);

  // materials: the kit (lit, the sheet, vertex colours); the paving and the yard (tiled); the glowing glass; the pools
  const sheet = drawSheet(scene);
  const kitMat = new CellMaterial("parkKit", scene); kitMat.diffuseTexture = sheet; kitMat.computeHighLevel = true;
  const pavMat = new CellMaterial("parkPaving", scene); pavMat.diffuseTexture = tileTexture(scene, "paving"); pavMat.computeHighLevel = true;
  const gndMat = new CellMaterial("parkYard", scene); gndMat.diffuseTexture = tileTexture(scene, "ground"); gndMat.computeHighLevel = true;
  const glassMat = new StandardMaterial("parkLanternGlass", scene); glassMat.disableLighting = true; glassMat.emissiveColor = Color3.FromHexString("#ffc870");
  const poolMat = new StandardMaterial("parkPools", scene); poolMat.disableLighting = true; poolMat.emissiveTexture = poolTexture(scene); poolMat.opacityTexture = poolMat.emissiveTexture; poolMat.alpha = 0; poolMat.zOffset = -1;
  const meshes: Mesh[] = [];
  // (both sides drawn: the kit's boxes and fans are written by hand, and the canopy is seen from below; it's a small,
  //  closed set of shapes, so the extra cost is tiny)
  for (const m of [kitMat, pavMat, gndMat, glassMat]) m.backFaceCulling = false;
  const put = (m: Mesh | null, mat: CellMaterial | StandardMaterial) => { if (!m) return; m.material = mat; m.parent = root; m.hasVertexAlpha = false; meshes.push(m); };
  put(kit.mesh("parkKit", scene), kitMat); put(edge.mesh("parkEdging", scene), kitMat);
  put(pav.mesh("parkPaving", scene), pavMat); put(gnd.mesh("parkYardGround", scene), gndMat);
  put(glass.mesh("parkLanternGlass", scene), glassMat);
  const pg = new Geo(99);
  for (const [x, z] of pools) pg.flat([[x - 2.6, z - 2.6], [x + 2.6, z - 2.6], [x + 2.6, z + 2.6], [x - 2.6, z + 2.6]], 0.075, 1, () => [1, 1, 1]);
  // (the pool quads' texture runs 0..1 across each one, not by world position)
  const pm = pg.mesh("parkPools", scene);
  if (pm) { const uv: number[] = []; for (let i = 0; i < pools.length; i++) uv.push(0, 0, 1, 0, 1, 1, 0, 1); pm.setVerticesData("uv", uv); put(pm, poolMat); pm.setEnabled(false); }

  // dusk and night: the glass brightens, the pools fade in, the kit's lit colours lift a little (readable, warm)
  const base = { kit: kitMat.diffuseColor.clone(), pav: pavMat.diffuseColor.clone(), gnd: gndMat.diffuseColor.clone() };
  const hook = (n: number) => {
    glassMat.emissiveColor = Color3.Lerp(Color3.FromHexString("#d9a860"), Color3.FromHexString("#fff0b0"), n);
    poolMat.alpha = 0.75 * n; pm?.setEnabled(n > 0.02);
    kitMat.diffuseColor = base.kit.scale(1 + 0.45 * n).add(new Color3(0.05, 0.03, 0).scale(n));
    pavMat.diffuseColor = base.pav.scale(1 + 0.3 * n); gndMat.diffuseColor = base.gnd.scale(1 + 0.2 * n);
  };
  NIGHT_HOOKS.add(hook);
  const dispose = () => { NIGHT_HOOKS.delete(hook); };
  scene.onDisposeObservable.addOnce(dispose);
  return { meshes, dispose };
}
