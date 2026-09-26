// Walking routes for pedestrians, built automatically from the city layout:
// a grid of candidate points along the streets; points inside anything solid are dropped,
// and neighbours are linked only if the straight walk between them is clear.
import { inRect, type ArenaLayout } from "./arena.js";

export interface NavNode { id: number; x: number; z: number; links: number[]; }

const DEFAULT_LINES = [-41, -37, -27, -15, -11, -8, -4.5, 0, 4.5, 8, 11, 15, 27, 37, 41];
const CLEARANCE = 0.55; // pedestrian radius + a little room

function blockedAt(arena: ArenaLayout, x: number, z: number): boolean {
  for (const b of arena.boxes) {
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
    if (arena.roads?.some((r) => inRect(r, x, z)) && !arena.crosswalks?.some((c) => inRect(c, x, z, 0.3))) return false;
  }
  return true;
}

export function buildNavGraph(arena: ArenaLayout): NavNode[] {
  const LINES = arena.navLines ?? DEFAULT_LINES;
  const nodes: NavNode[] = [];
  const at = new Map<string, number>();
  for (const x of LINES) for (const z of LINES) {
    if (blockedAt(arena, x, z)) continue;
    if (arena.roads?.some((r) => inRect(r, x, z))) continue; // never stand around in the road
    at.set(x + "," + z, nodes.length);
    nodes.push({ id: nodes.length, x, z, links: [] });
  }
  const link = (a: number, b: number) => { nodes[a].links.push(b); nodes[b].links.push(a); };
  // connect each node to its nearest valid neighbour along the row and along the column
  for (const n of nodes) {
    const xi = LINES.indexOf(n.x), zi = LINES.indexOf(n.z);
    for (let k = xi + 1; k < LINES.length; k++) {
      const m = at.get(LINES[k] + "," + n.z);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
    }
    for (let k = zi + 1; k < LINES.length; k++) {
      const m = at.get(n.x + "," + LINES[k]);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
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
