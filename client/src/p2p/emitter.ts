/** Tiny listener list (the parts of the Colyseus Room API the game uses). */
export class Listeners<A extends unknown[]> {
  private fns = new Set<(...a: A) => void>();
  add(fn: (...a: A) => void) { this.fns.add(fn); return { clear: () => { this.fns.delete(fn); } }; }
  emit(...a: A) { for (const f of [...this.fns]) { try { f(...a); } catch (e) { console.error(e); } } }
  clear() { this.fns.clear(); }
}

export function randomId(n = 9): string {
  const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const x of b) s += abc[x % abc.length];
  return s;
}

/** A timer that keeps firing when the tab is in the background (browsers slow normal timers to once a second or less). */
export function backgroundTimer(ms: number, fn: () => void): () => void {
  try {
    const src = `let h=setInterval(()=>postMessage(0),${ms});onmessage=()=>{clearInterval(h);close()}`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = () => fn();
    return () => { w.postMessage(0); w.terminate(); };
  } catch {
    const h = setInterval(fn, ms); // workers blocked: normal timer (slows down in a background tab)
    return () => clearInterval(h);
  }
}
