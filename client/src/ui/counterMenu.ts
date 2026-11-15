// R15: a store counter's FOR SALE list (shopStock.ts): a randomized handful each cycle, several of each. Counters SELL;
// they never buy (Blake). E at the counter with empty hands opens it; buying asks the host (charged once); Esc or CLOSE
// shuts it. The store's own special (trail mix, a spritz) is still there as before.
import { lootDef, parseStockNote, STORE_TRADE, STORE_VOICE, type StoreId } from "@bfb/shared";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class CounterMenu {
  store = "";
  send: (act: object) => void = () => {};
  onClose: () => void = () => {};
  private sig = "";
  constructor() {
    $("counter-menu").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b.dataset.buy) this.send({ a: "stockBuy", store: this.store, type: b.dataset.buy });
      else if (b.dataset.special) this.send({ a: "use", prop: "storecounter_" + this.store });
      else if (b.id === "btn-counter-close") this.close();
    });
    window.addEventListener("keydown", (e) => { if (this.store && (e.code === "Escape" || e.code === "KeyE")) { e.preventDefault(); this.close(); } }, true);
  }
  get isOpen() { return !!this.store; }
  open(store: string) { this.store = store; this.sig = ""; $("counter-menu").classList.remove("hidden"); }
  close() { if (!this.store) return; this.store = ""; $("counter-menu").classList.add("hidden"); this.onClose(); }
  /** call each frame while open: the counter's note (the host's truth) and my cash */
  update(note: string, cash: number) {
    if (!this.store) return;
    const sig = note + "|" + cash;
    if (sig === this.sig) return;
    this.sig = sig;
    const n = parseStockNote(note), tr = STORE_TRADE[this.store as StoreId], vo = STORE_VOICE[this.store as StoreId];
    const rows = (n?.sale ?? []).map((e) => {
      const d = lootDef(e.type);
      return `<div class="cm-row"><b>${esc(d.name)}</b><span>${esc(d.blurb)}</span><em>${e.left} left</em>
        <button class="btn btn-tiny" data-buy="${e.type}" ${e.left <= 0 || cash < e.price ? "disabled" : ""}>BUY $${e.price}</button></div>`;
    }).join("");
    const special = tr?.sells ? `<div class="cm-row"><b>${esc(tr.sells.name)}</b><span>${esc(tr.sells.blurb)}</span><em>house special</em><button class="btn btn-tiny" data-special="1" ${cash < tr.sells.price ? "disabled" : ""}>BUY $${tr.sells.price}</button></div>` : "";
    $("counter-menu").innerHTML = `<h2>${esc(vo?.keeper ?? "THE COUNTER")}</h2><p class="small">For sale this cycle (it all changes next cycle). This counter doesn't buy anything. Cash: <b>$${cash}</b></p>
      <div class="cm-list">${rows + special || `<p class="small">Nothing for sale today.</p>`}</div>
      <button class="btn btn-small" id="btn-counter-close">CLOSE (E / Esc)</button>`;
  }
}
