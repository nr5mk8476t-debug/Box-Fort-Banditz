// Walking routes for pedestrians, built automatically from the city layout:
// a grid of candidate points along the streets; points inside anything solid are dropped,
// and neighbours are linked only if the straight walk between them is clear.
import { inRect, nearBoxes, onRoadAt, type ArenaLayout } from "./arena.js";

export interface NavNode { id: number; x: number; z: number; links: number[]; }

const DEFAULT_LINES = [-41, -37, -27, -15, -11, -8, -4.5, 0, 4.5, 8, 11, 15, 27, 37, 41];
const CLEARANCE = 0.55; // pedestrian radius + a little room

function blockedAt(arena: ArenaLayout, x: number, z: number): boolean {
  if (arena.water?.some((r) => inRect(r, x, z, CLEARANCE))) return true; // (the pond: walk round it)
  if (arena.deepWater?.some((r) => inRect(r, x, z, CLEARANCE))) return true; // (nobody walks into the canal)
  for (const b of nearBoxes(arena, x, z, CLEARANCE + 0.1)) {
    const top = b.y + b.h / 2;
    const bottom = b.y - b.h / 2;
    if (top <= 0.4) continue; // curbs/sidewalks are walkable
    if (bottom > 1.8) continue; // overhead things (roofs, slabs up high)
    if (Math.abs(x - b.x) < b.w / 2 + CLEARANCE && Math.abs(z - b.z) < b.d / 2 + CLEARANCE) return true;
  }
  return false;
}

function segmentClear(arena: ArenaLayout, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (blockedAt(arena, x, z)) return false;
    // pedestrians only cross roads at crosswalks (cars stop for them there)
    if (onRoadAt(arena, x, z) && !arena.crosswalks?.some((c) => inRect(c, x, z, 0.3))) return false;
  }
  return true;
}

export function buildNavGraph(arena: ArenaLayout): NavNode[] {
  const XL = arena.navLines ?? DEFAULT_LINES, ZL = arena.navLinesZ ?? XL;
  const nodes: NavNode[] = [];
  const at = new Map<string, number>();
  for (const x of XL) for (const z of ZL) {
    if (blockedAt(arena, x, z)) continue;
    if (onRoadAt(arena, x, z)) continue; // never stand around in the road
    at.set(x + "," + z, nodes.length);
    nodes.push({ id: nodes.length, x, z, links: [] });
  }
  const link = (a: number, b: number) => { nodes[a].links.push(b); nodes[b].links.push(a); };
  // connect each node to its nearest valid neighbour along the row and along the column
  for (const n of nodes) {
    const xi = XL.indexOf(n.x), zi = ZL.indexOf(n.z);
    for (let k = xi + 1; k < XL.length; k++) {
      const m = at.get(XL[k] + "," + n.z);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
    }
    for (let k = zi + 1; k < ZL.length; k++) {
      const m = at.get(n.x + "," + ZL[k]);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
    }
  }
  // Slice 2A: extra routes (into shops): consecutive points linked, the first one joined to the street
  // (C1: chain points at the same spot as an earlier chain point are the same point, so chains can
  //  share a loop; the first point of each chain joins the street routes)
  const gridCount = nodes.length;
  const chainAt = new Map<string, number>();
  for (const chain of arena.navChains ?? []) {
    const ids: number[] = [];
    for (const p of chain) {
      if (blockedAt(arena, p.x, p.z)) break;
      const key = p.x.toFixed(2) + "," + p.z.toFixed(2);
      let id = chainAt.get(key);
      if (id === undefined) { id = nodes.length; nodes.push({ id, x: p.x, z: p.z, links: [] }); chainAt.set(key, id); }
      ids.push(id);
    }
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) if (!nodes[ids[i - 1]].links.includes(ids[i])) link(ids[i - 1], ids[i]);
    const head = nodes[ids[0]];
    const near = nodes.filter((n) => n.id < gridCount && Math.hypot(n.x - head.x, n.z - head.z) < 20)
      .sort((a, b) => Math.hypot(a.x - head.x, a.z - head.z) - Math.hypot(b.x - head.x, b.z - head.z));
    let joined = 0;
    for (const n of near) {
      if (joined >= 2) break;
      if (segmentClear(arena, head.x, head.z, n.x, n.z)) { link(head.id, n.id); joined++; }
    }
  }
  // keep only the biggest connected piece (so nobody gets stranded)
  const comp = new Array(nodes.length).fill(-1);
  let best = -1, bestSize = 0;
  for (const n of nodes) {
    if (comp[n.id] !== -1) continue;
    const stack = [n.id];
    comp[n.id] = n.id;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const l of nodes[c].links) if (comp[l] === -1) { comp[l] = n.id; stack.push(l); }
    }
    if (size > bestSize) { bestSize = size; best = n.id; }
  }
  const keep = nodes.filter((n) => comp[n.id] === best && n.links.length > 0);
  const remap = new Map(keep.map((n, i) => [n.id, i]));
  return keep.map((n, i) => ({ id: i, x: n.x, z: n.z, links: n.links.filter((l) => remap.has(l)).map((l) => remap.get(l)!) }));
}

/** Shortest route between two route points (Dijkstra; the graph has ~200 points). Node ids, both ends included. */
export function findPath(graph: NavNode[], from: number, to: number): number[] {
  if (from === to) return [from];
  const n = graph.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const v of graph[u].links) {
      const d = best + Math.hypot(graph[v].x - graph[u].x, graph[v].z - graph[u].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[to])) return [];
  const out: number[] = [];
  for (let c = to; c >= 0; c = prev[c]) out.unshift(c);
  return out;
}
