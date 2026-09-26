// Phase 5A: the pawn shop screen ("Honest" Sal at Pawn-O-Rama) and the upgrades placeholder.
// Pure DOM: the game state comes from the arena (your offers JSON), buttons send actions.
import { lootDef, RARITY_COLOR, type OfferView, type WorldAction } from "@bfb/shared";
import { sfx } from "../audio.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Sal's face for each mood (inline SVG, drawn in the game's ink style). */
function salFace(mood: string): string {
  const skin = mood === "offended" ? "#f08a6a" : "#f0b98a";
  const mouth = mood === "eager" ? '<path d="M30 62 Q43 74 56 62" stroke="#1b1420" stroke-width="4" fill="#fff"/>'
    : mood === "sweaty" ? '<path d="M31 66 Q43 60 55 66" stroke="#1b1420" stroke-width="4" fill="none"/>'
    : mood === "offended" ? '<rect x="30" y="60" width="26" height="9" rx="3" fill="#1b1420"/>'
    : mood === "done" ? '<path d="M28 60 Q43 78 58 60 Z" stroke="#1b1420" stroke-width="4" fill="#fff"/>'
    : '<path d="M32 64 L54 64" stroke="#1b1420" stroke-width="4"/>';
  const brows = mood === "offended" ? '<path d="M24 32 L38 38 M62 32 L48 38" stroke="#1b1420" stroke-width="5"/>'
    : mood === "sweaty" ? '<path d="M24 36 L38 32 M62 36 L48 32" stroke="#1b1420" stroke-width="4"/>'
    : mood === "eager" ? '<path d="M24 30 Q31 25 38 30 M48 30 Q55 25 62 30" stroke="#1b1420" stroke-width="4" fill="none"/>'
    : '<path d="M24 33 L38 33 M48 31 L62 34" stroke="#1b1420" stroke-width="4"/>';
  const sweat = mood === "sweaty" ? '<path d="M70 30 Q74 40 70 44 Q66 40 70 30Z" fill="#8fd8ff" stroke="#1b1420" stroke-width="2"/>' : "";
  const eyes = mood === "eager" ? '<circle cx="31" cy="44" r="5" fill="#1b1420"/><circle cx="55" cy="44" r="5" fill="#1b1420"/><circle cx="33" cy="42" r="1.6" fill="#fff"/><circle cx="57" cy="42" r="1.6" fill="#fff"/>'
    : '<circle cx="31" cy="45" r="4" fill="#1b1420"/><circle cx="55" cy="45" r="4" fill="#1b1420"/>';
  return `<svg viewBox="0 0 86 86" width="86" height="86">
    <circle cx="43" cy="46" r="34" fill="${skin}" stroke="#1b1420" stroke-width="4"/>
    <path d="M12 34 Q20 6 43 8 Q66 6 74 34 Q60 22 43 24 Q26 22 12 34Z" fill="#4a3b2a" stroke="#1b1420" stroke-width="3"/>
    ${brows}${eyes}<ellipse cx="43" cy="54" rx="6" ry="4" fill="#d9946a"/>${mouth}${sweat}
    <path d="M26 58 Q43 52 60 58" stroke="#4a3b2a" stroke-width="4" fill="none"/>
  </svg>`;
}

const MOOD_LABEL: Record<string, string> = { eager: "EAGER", thinking: "HMM...", sweaty: "SWEATY", offended: "OFFENDED", done: "SOLD" };
const fmtTime = (t: number) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export class ShopScreen {
  private sig = "";
  private offers: OfferView[] = [];
  private lastItem = "";
  private flashes = new Map<string, string>();
  send: (a: WorldAction) => void = () => {};

  constructor() {
    $("btn-sell-all").addEventListener("click", () => { sfx.uiClick(); this.send({ a: "sellAll" }); });
    $("btn-shop-done").addEventListener("click", () => { sfx.uiClick(); this.send({ a: "ready" }); });
    $("btn-upg-done").addEventListener("click", () => { sfx.uiClick(); this.send({ a: "ready" }); });
    $("shop-list").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button");
      if (!b || b.hasAttribute("disabled")) return;
      const id = b.dataset.id!, act = b.dataset.act as "sell" | "haggle";
      this.lastItem = id;
      sfx.uiClick();
      this.send({ a: act, item: id });
    });
  }

  /** A pawn result from the game (sounds + a flash on that row). */
  onPawn(e: { item: string; r: string; offer: number }) {
    this.lastItem = e.item;
    if (e.r === "up") sfx.haggleUp();
    else if (e.r === "offended") sfx.offended();
    else sfx.cash();
    this.flashes.set(e.item, e.r === "offended" ? "flash-bad" : "flash-up");
    this.sig = ""; // redraw
  }

  get list() { return this.offers; }

  /** Draw the shop (called every frame; only touches the DOM when something changed). */
  update(json: string, timeLeft: number, cash: number, ready: boolean) {
    const t = fmtTime(timeLeft);
    $("shop-timer").textContent = t;
    $("shop-timer").classList.toggle("warn", timeLeft <= 10);
    $("shop-cash").textContent = "$" + cash;
    ($("btn-shop-done") as HTMLButtonElement).textContent = ready ? "WAITING..." : "DONE";
    const sig = json + ready;
    if (sig === this.sig) return;
    this.sig = sig;
    try { this.offers = json ? JSON.parse(json) : []; } catch { this.offers = []; }
    const list = $("shop-list");
    list.innerHTML = "";
    const focus = this.offers.find((o) => o.id === this.lastItem) ?? this.offers.find((o) => o.state !== "sold");
    $("sal-face").innerHTML = salFace(focus?.mood ?? "thinking");
    $("sal-line").textContent = focus ? `"${focus.line}"` : this.offers.length ? '"Pleasure doing business."' : '"Nothing? You came in here with NOTHING?"';
    if (!this.offers.length) {
      const p = document.createElement("div"); p.className = "shop-empty";
      p.textContent = "Your fort was empty. Bring loot home next time (and keep it safe at night)!";
      list.appendChild(p);
    }
    for (const o of this.offers) {
      const def = lootDef(o.type);
      const row = document.createElement("div");
      row.className = "offer" + (o.state === "sold" ? " sold" : "");
      const fl = this.flashes.get(o.id);
      if (fl) { row.classList.add(fl); this.flashes.delete(o.id); }
      const nm = document.createElement("div"); nm.className = "nm";
      const b = document.createElement("b"); b.textContent = def.name;
      b.style.color = RARITY_COLOR[def.mystery && def.rarity !== "common" ? "mystery" : def.rarity];
      const worth = document.createElement("span"); worth.className = "worth";
      worth.textContent = o.value ? `worth about $${o.value}` : "worth ??? (mystery)";
      nm.append(b, worth);
      const mood = document.createElement("span"); mood.className = "mood " + o.mood; mood.textContent = MOOD_LABEL[o.mood] ?? o.mood;
      const price = document.createElement("span"); price.className = "price"; price.textContent = "$" + o.offer;
      const btns = document.createElement("div"); btns.className = "btns";
      if (o.state !== "sold") {
        const h = document.createElement("button"); h.className = "btn btn-small"; h.textContent = o.state === "final" ? "FINAL" : "HAGGLE";
        h.dataset.id = o.id; h.dataset.act = "haggle"; if (o.state !== "open") h.setAttribute("disabled", "");
        const sBtn = document.createElement("button"); sBtn.className = "btn btn-go btn-small"; sBtn.textContent = "SELL";
        sBtn.dataset.id = o.id; sBtn.dataset.act = "sell";
        btns.append(h, sBtn);
      } else btns.textContent = "SOLD";
      row.append(nm, mood, price, btns);
      list.appendChild(row);
    }
  }

  updateUpgrades(timeLeft: number, ready: boolean) {
    $("upg-timer").textContent = fmtTime(timeLeft);
    ($("btn-upg-done") as HTMLButtonElement).textContent = ready ? "WAITING..." : "READY";
    $("upg-wait").textContent = ready ? "Waiting for the other bandits (or the timer)..." : "";
  }
}
