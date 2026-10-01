// State sync for browser-hosted games: the host sends only what changed since the last update
// (like the server's synced state did), and a full copy to players who just joined.

export const COLLECTIONS = ["players", "items", "npcs", "props", "cars", "copCars", "tags"] as const;
type Coll = (typeof COLLECTIONS)[number];

export interface Delta {
  /** changed top-level fields (round, timer, event...) */
  r?: Record<string, unknown>;
  /** changed fields per entity, per collection */
  c?: Partial<Record<Coll, Record<string, Record<string, unknown>>>>;
  /** removed entity ids, per collection */
  x?: Partial<Record<Coll, string[]>>;
}

/** What a joining player's game reads: plain Maps, the same shape as solo mode. */
export interface NetState extends Record<string, any> {
  players: Map<string, any>; items: Map<string, any>; npcs: Map<string, any>;
  props: Map<string, any>; cars: Map<string, any>; copCars: Map<string, any>; tags: Map<string, any>;
}

export function emptyState(): NetState {
  return { players: new Map(), items: new Map(), npcs: new Map(), props: new Map(), cars: new Map(), copCars: new Map(), tags: new Map(), phase: "lobby", ownerId: "", code: "" };
}

const isColl = (k: string) => (COLLECTIONS as readonly string[]).includes(k);
/** Everything except players is only drawn, so millimetres are plenty (players need exact numbers for prediction). */
const round = (v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);

/** Host side: remembers what was last sent and works out the next delta. */
export class Snapshotter {
  readonly sent = emptyState();

  /** Compare the host's current view with what was last sent. Returns null if nothing changed. */
  diff(view: Record<string, any>): Delta | null {
    const d: Delta = {};
    let any = false;
    for (const k in view) {
      if (isColl(k)) continue;
      const v = view[k];
      if (typeof v === "object" && v !== null) continue;
      const rv = round(v);
      if (this.sent[k] !== rv) { (d.r ??= {})[k] = rv; this.sent[k] = rv; any = true; }
    }
    for (const coll of COLLECTIONS) {
      const src = view[coll] as Map<string, Record<string, any>> | undefined;
      if (!src) continue;
      const dst = this.sent[coll];
      const exact = coll === "players";
      src.forEach((obj, id) => {
        let old = dst.get(id);
        const isNew = !old;
        if (!old) { old = {}; dst.set(id, old); }
        let ch: Record<string, unknown> | null = null;
        for (const k in obj) {
          const v = exact ? obj[k] : round(obj[k]);
          if (isNew || old[k] !== v) { old[k] = v; (ch ??= {})[k] = v; }
        }
        if (ch) { ((d.c ??= {})[coll] ??= {})[id] = ch; any = true; }
      });
      for (const id of [...dst.keys()]) {
        if (!src.has(id)) { dst.delete(id); ((d.x ??= {})[coll] ??= []).push(id); any = true; }
      }
    }
    return any ? d : null;
  }

  /** Everything, for a player who just joined (call diff() first so it's current). */
  full(): Delta {
    const d: Delta = { r: {}, c: {} };
    for (const k in this.sent) if (!isColl(k)) d.r![k] = this.sent[k];
    for (const coll of COLLECTIONS) {
      const out: Record<string, Record<string, unknown>> = {};
      this.sent[coll].forEach((obj: Record<string, unknown>, id: string) => { out[id] = { ...obj }; });
      d.c![coll] = out;
    }
    return d;
  }
}

/** Joiner side: apply a delta (a full snapshot first clears everything). */
export function applyDelta(state: NetState, d: Delta, full = false) {
  if (full) for (const coll of COLLECTIONS) state[coll].clear();
  if (d.r) Object.assign(state, d.r);
  if (d.c) {
    for (const coll of COLLECTIONS) {
      const ch = d.c[coll];
      if (!ch) continue;
      const map = state[coll];
      for (const id in ch) {
        const o = map.get(id);
        if (o) Object.assign(o, ch[id]);
        else map.set(id, { ...ch[id] });
      }
    }
  }
  if (d.x) for (const coll of COLLECTIONS) for (const id of d.x[coll] ?? []) state[coll].delete(id);
}
