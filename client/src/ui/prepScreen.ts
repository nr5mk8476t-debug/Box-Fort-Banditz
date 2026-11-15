// R14: PREP (2:00 at home between scavenges): sell banked things to Sal's van, choose what's in the safe, build fort
// upgrades, craft at the workbench, READY. Everything here is built from the shared catalogue (UPGRADES, RECIPES,
// itemCategory), so a new upgrade or recipe shows up without touching this file. The host decides; this only asks.
import { UPGRADES, RECIPES, itemCategory, lootDef, LOOP, FORT_LEVEL_NAMES, CATEGORY_NAMES, type ItemCategory } from "@bfb/shared";
import type { LoopView } from "../game/fortRenderer.ts";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class PrepScreen {
  send: (act: object) => void = () => {}; // (WorldAction-shaped: vanSell, protect, upgrade, craft, ready)
  private sig = "";
  constructor() {
    $("prep").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.sell) this.send({ a: "vanSell", recs: d.sell.split(",") });
      else if (d.safe) this.send({ a: "protect", rec: d.safe, on: d.on === "1" });
      else if (d.up) this.send({ a: "upgrade", id: d.up });
      else if (d.craft) this.send({ a: "craft", id: d.craft });
      else if (b.id === "btn-prep-ready") this.send({ a: "ready" });
    });
  }

  update(L: LoopView | null, cash: number, aura: number, timeLeft: number, round: number, rounds: number, ready: boolean) {
    $("prep-timer").textContent = fmtTime(timeLeft);
    const sig = JSON.stringify(L) + cash + aura + ready + round;
    if (sig === this.sig) return;
    this.sig = sig;
    if (!L) return;
    const recs = L.r.map(([id, type, value, safe]) => ({ id, type, value, safe: !!safe, cat: itemCategory(type, lootDef(type)) as ItemCategory }));
    const wanted = L.w ?? [], wantedSold = new Set(L.ws ?? []);
    const offer = (r: { type: string; value: number }) => Math.max(1, Math.round(r.value * LOOP.vanRate * (wanted.includes(r.type) && !wantedSold.has(r.type) ? LOOP.wantedMult : 1)));
    const nSafe = recs.filter((r) => r.safe).length, nShelf = recs.length - nSafe;
    $("prep-head").innerHTML = `<b>PREP</b> · CYCLE ${round}/${rounds} · <span class="pp-fort">${esc(FORT_LEVEL_NAMES[L.L] ?? "")}</span>
      <span class="pp-purse">$<b>${cash}</b></span><span class="pp-aura">AURA <b>${aura}</b></span>`;
    // ---- storage
    const have: Partial<Record<ItemCategory, number>> = {};
    for (const r of recs) have[r.cat] = (have[r.cat] ?? 0) + 1;
    const rows = recs.map((r) => {
      const d = lootDef(r.type), hot = wanted.includes(r.type) && !wantedSold.has(r.type);
      return `<div class="pp-row${r.safe ? " safe" : ""}"><span class="pp-name">${esc(d.name)}</span><span class="pp-cat">${esc(r.cat)}</span><span class="pp-val">$${r.value}</span>
        <button class="btn btn-tiny" data-sell="${r.id}">SELL $${offer(r)}${hot ? " ★x2" : ""}</button>
        <button class="btn btn-tiny ${r.safe ? "on" : ""}" data-safe="${r.id}" data-on="${r.safe ? 0 : 1}" ${!r.safe && nSafe >= L.F ? "disabled" : ""}>${r.safe ? "IN SAFE" : "TO SAFE"}</button></div>`;
    }).join("") || `<p class="small">Nothing banked yet. Drop loot on your DEPOSIT MAT (10 s) to bank it.</p>`;
    const unsafe = recs.filter((r) => !r.safe);
    $("prep-storage").innerHTML = `<h3>YOUR FORT: shelves ${nShelf}/${L.S} · safe ${nSafe}/${L.F}</h3>
      <p class="small">Sal's van pays ${Math.round(LOOP.vanRate * 100)}%. ★ wanted today (x${LOOP.wantedMult}, first one): ${wanted.map((t) => esc(lootDef(t).name)).join(", ") || "-"}. The SAFE can't be stolen from at night; the shelves can.</p>
      <div class="pp-list">${rows}</div>
      ${unsafe.length ? `<button class="btn btn-small" data-sell="${unsafe.map((r) => r.id).join(",")}">SELL EVERYTHING NOT IN THE SAFE ($${unsafe.reduce((a, r) => a + offer(r), 0)})</button>` : ""}`;
    // ---- upgrades
    const ups = new Set(L.u);
    const costLine = (c: number, items: Partial<Record<ItemCategory, number>>) => [`$${c}`, ...Object.entries(items).map(([k, n]) => `${n} ${CATEGORY_NAMES[k as ItemCategory]} <i class="${(have[k as ItemCategory] ?? 0) >= (n ?? 0) ? "ok" : "no"}">(${have[k as ItemCategory] ?? 0})</i>`)].join(" + ");
    const affordable = (c: number, items: Partial<Record<ItemCategory, number>>) => cash >= c && Object.entries(items).every(([k, n]) => (have[k as ItemCategory] ?? 0) >= (n ?? 0));
    $("prep-upgrades").innerHTML = `<h3>BUILD</h3>` + UPGRADES.map((u) => {
      const own = ups.has(u.id), locked = u.needs.some((n) => !ups.has(n));
      return `<div class="pp-card${own ? " own" : ""}"><b>${esc(u.name)}</b><span>${esc(u.blurb)}</span>
        <em>${own ? "BUILT" : locked ? "needs " + u.needs.filter((n) => !ups.has(n)).map((n) => UPGRADES.find((x) => x.id === n)?.name ?? n).join(", ") : costLine(u.cash, u.items)}</em>
        ${own ? "" : `<button class="btn btn-tiny" data-up="${u.id}" ${locked || !affordable(u.cash, u.items) ? "disabled" : ""}>BUILD</button>`}</div>`;
    }).join("");
    // ---- the workbench
    const bench = ups.has("workbench");
    const gear = Object.entries(L.g ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${esc(RECIPES.find((r) => r.id === k)?.name ?? k)} x${n}`).join(", ") || "none";
    $("prep-craft").innerHTML = `<h3>WORKBENCH</h3><p class="small">${bench ? "Crafting uses up the materials (cheapest first, the safe's last)." : "Build a WORKBENCH to craft."} Your gear: ${gear}</p>` + RECIPES.map((r) => `<div class="pp-card"><b>${esc(r.name)}</b><span>${esc(r.blurb)}</span><em>${costLine(r.cash, r.items)}</em>
      <button class="btn btn-tiny" data-craft="${r.id}" ${!bench || !affordable(r.cash, r.items) ? "disabled" : ""}>CRAFT</button></div>`).join("");
    ($("btn-prep-ready") as HTMLButtonElement).textContent = ready ? "WAITING FOR THE OTHERS..." : "READY";
  }
}
