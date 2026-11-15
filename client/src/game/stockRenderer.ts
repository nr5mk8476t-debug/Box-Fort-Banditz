// R15: the stores' shelves as they are (shopStock.ts): one source model per kind of thing (merged, built once), and an
// INSTANCE of it in every slot that holds one, so a full store costs a few draws however many things are on it. A store's
// stock is only enabled while you're near it (its interior's draw distance). Taken things vanish for everyone (the counter
// note); the next cycle's restock fills the slots again. Slot positions come from shared stockSlots (the host uses the same).
import { TransformNode, Mesh, type Scene } from "./babylon.ts";
type InstancedMesh = ReturnType<Mesh["createInstance"]>;
import { bakeGroup } from "./look.ts";
import { buildLootModel } from "./models.ts";
import { stockSlots, parseStockNote, lootDef, type StockSlot, type ArenaLayout } from "@bfb/shared";

interface Src { meshes: Mesh[]; k: number; lift: number }
interface StoreVis { id: string; slots: StockSlot[]; door: { x: number; z: number }; root: TransformNode; inst: (InstancedMesh[] | null)[]; types: (string | null)[]; values: number[]; note: string; on: boolean }

export class StockRenderer {
  private stores = new Map<string, StoreVis>();
  private srcs = new Map<string, Src>();
  constructor(private scene: Scene, arena: ArenaLayout) {
    for (const st of arena.stores ?? []) {
      const slots = stockSlots(st.id);
      if (!slots.length) continue;
      const root = new TransformNode("stock-" + st.id, scene); root.setEnabled(false);
      this.stores.set(st.id, { id: st.id, slots, door: st.door, root, inst: slots.map(() => null), types: slots.map(() => null), values: slots.map(() => 0), note: "", on: false });
    }
  }
  /** the store's counter note changed (applyWorld) */
  setNote(storeId: string, note: string) {
    const s = this.stores.get(storeId);
    if (!s || s.note === note) return;
    s.note = note;
    const n = parseStockNote(note);
    s.slots.forEach((slot, i) => {
      const want = n?.shelves[i] ?? null;
      if ((want?.type ?? null) === s.types[i]) { s.values[i] = want?.value ?? 0; return; }
      for (const m of s.inst[i] ?? []) m.dispose();
      s.inst[i] = null; s.types[i] = null; s.values[i] = 0;
      if (!want) return;
      const src = this.source(want.type);
      const yaw = ((i * 2.399) % (Math.PI * 2));
      s.inst[i] = src.meshes.map((m) => {
        const c = m.createInstance("stk"); c.parent = s.root; c.isPickable = false;
        c.position.set(slot.x, slot.y + src.lift, slot.z); c.rotation.y = yaw; c.scaling.setAll(src.k);
        return c;
      });
      s.types[i] = want.type; s.values[i] = want.value;
    });
  }
  /** enable the stores you're near (call each frame) */
  update(x: number, z: number) {
    for (const s of this.stores.values()) {
      const on = Math.hypot(x - s.door.x, z - s.door.z) < 34;
      if (on !== s.on) { s.on = on; s.root.setEnabled(on); }
    }
  }
  /** what's on the shelves near (x, z): for the aim (untaken things only) */
  *near(x: number, z: number, r: number): Generator<{ store: string; slot: number; type: string; value: number; x: number; y: number; z: number }> {
    for (const s of this.stores.values()) {
      if (!s.on) continue;
      for (let i = 0; i < s.slots.length; i++) {
        const t = s.types[i]; if (!t) continue;
        const sl = s.slots[i];
        if (Math.abs(sl.x - x) > r || Math.abs(sl.z - z) > r) continue;
        yield { store: s.id, slot: i, type: t, value: s.values[i], x: sl.x, y: sl.y, z: sl.z };
      }
    }
  }
  /** (tests) how many things are drawn */
  count() { let n = 0; for (const s of this.stores.values()) for (const t of s.types) if (t) n++; return n; }

  /** one merged model per kind of thing, built once, kept out of sight (only its instances are seen) */
  private source(type: string): Src {
    let src = this.srcs.get(type);
    if (src) return src;
    const m = buildLootModel(this.scene, type);
    m.root.computeWorldMatrix(true);
    const { min, max } = m.root.getHierarchyBoundingVectors(true);
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 0.01);
    const d = lootDef(type), cap = d.size === "giant" ? 1.7 : d.size === "big" ? 0.85 : 0.42;
    const k = Math.min(1, cap / size);
    bakeGroup(this.scene, m.root, 0.02);
    const meshes = m.root.getChildMeshes(false).filter((x): x is Mesh => x instanceof Mesh && x.getTotalVertices() > 0);
    m.root.position.y = -500; // (the source itself is never seen: frustum-culled far below the city)
    for (const x of meshes) { x.isPickable = false; x.alwaysSelectAsActiveMesh = false; }
    src = { meshes, k, lift: -min.y * k + 0.01 };
    this.srcs.set(type, src);
    return src;
  }
}
