// R14 stage 4: the QUEST TRACKER (always on while you've got something: your aura task and your boss job, each with
// its progress, the time left and an arrow + distance to where it's at) and the J panel (expanded: what the bosses
// would give you, your reputation and its perks, the rivals' LIVE attempts, the board's price). Read-only: the host
// decides everything; jobs are taken with J next to the boss, tasks bought with E at your fort's board.
import { BOSS_NAMES, BOSS_PERKS, LOOP, type BossId } from "@bfb/shared";
import type { LoopView, QuestRow } from "../game/fortRenderer.ts";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

export class QuestHud {
  open = false;
  private sig = "";
  private psig = "";

  /** me: where I am and which way I'm looking (yaw: 0 = +z); names: player id -> name */
  update(L: LoopView | null, live: boolean, me: { x: number; z: number; yaw: number }, names: Map<string, string>) {
    const q = L?.q;
    const show = live && !!q && (!!q.t || !!q.j || q.lv.length > 0);
    const box = $("quest");
    box.classList.toggle("hidden", !show);
    if (show && q) {
      const where = (r: QuestRow) => {
        if (r[5] === null || r[6] === null) return "";
        const dx = r[5] - me.x, dz = r[6] - me.z, d = Math.hypot(dx, dz);
        if (d < 3) return `<span class="qd">HERE</span>`;
        let rel = Math.atan2(dx, dz) - me.yaw; rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        return `<span class="qd">${ARROWS[Math.round(rel / (Math.PI / 4)) % 8]} ${Math.round(d)} m</span>`;
      };
      const row = (r: QuestRow, kind: string) => {
        const pct = Math.max(0, Math.min(100, (r[2] / Math.max(1, r[3])) * 100));
        const prog = r[3] > 1 ? `${Math.floor(r[2])}/${r[3]}` : "";
        return `<div class="qrow ${kind}"><div class="qh"><b>${kind === "job" ? "JOB" : "TASK"}: ${esc(r[0])}</b><span class="qt${r[4] <= 20 ? " hurry" : ""}">${r[4]}s</span></div>
          <div class="qx">${esc(r[1])}${r[8] ? " · MEGAPHONE +50%" : ""}</div><div class="qb"><i style="width:${pct.toFixed(0)}%"></i></div><div class="qf">${prog}${where(r)}</div></div>`;
      };
      const rivals = q.lv.map(([id, name]) => `<div class="qlive">● ${esc(names.get(id) ?? "A rival")} is going for <b>${esc(name)}</b></div>`).join("");
      const html = (q.t ? row(q.t, "task") : "") + (q.j ? row(q.j, "job") : "") + rivals;
      if (html !== this.sig) { this.sig = html; box.innerHTML = html; }
    }
    const panel = $("qpanel");
    panel.classList.toggle("hidden", !this.open || !q);
    if (this.open && q) {
      const psig = JSON.stringify(q);
      if (psig !== this.psig) {
        this.psig = psig;
        const rep = (b: BossId, i: number) => {
          const n = q.rep[i], perks = BOSS_PERKS.filter((p) => p.boss === b);
          const job = q.jo.find((j) => j[0] === b);
          return `<div class="qp-boss"><h3>${esc(BOSS_NAMES[b])} <span class="qp-rep">${"★".repeat(n)}${"☆".repeat(5 - n)}</span></h3>
            <p class="small">${b === "seamus" ? "At his bar in THE SOGGY SHAMROCK." : "His man at NEON FEVER's door."} ${job ? `On offer: <b>${esc(job[1])}</b>: ${esc(job[2])}. Go and see him, press J.` : "Nothing more for you this cycle."}</p>
            <ul>${perks.map((p) => `<li class="${n >= p.rep ? "on" : ""}">${p.rep}★ ${esc(p.name)}: ${esc(p.blurb)}</li>`).join("")}</ul></div>`;
        };
        panel.innerHTML = `<h2>QUESTS <span class="small">(J to close)</span></h2>
          <p class="small">AURA TASKS: E at your fort's task board · $${q.tp} now (x${LOOP.taskPriceMult} each in a cycle). Everyone sees your attempt: a rival who knocks you down mid-task interrupts it (you -${LOOP.interruptLoss}, them +${LOOP.interruptGain}, once per pair a cycle). BANANA PEELS make them slip instead.</p>
          ${rep("seamus", 0)}${rep("binnie", 1)}
          <p class="small">A failed job costs no reputation. Reputation never locks you out of anything: it only adds perks. Sal's van pays ${Math.round(q.vr * 100)}% for you.</p>`;
      }
    }
  }
}
