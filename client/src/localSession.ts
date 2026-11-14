// Solo mode: runs the same World simulation the server uses, right here in the browser.
// The game talks to it exactly like it talks to the server, so solo = multiplayer rules.
import {
  World, playerView, itemView, npcView, matchView, propView, carView, copCarView, tagView, SIM_DT,
  type WorldView, type PlayerView, type ItemView, type NpcView, type PropView, type CarView, type CopCarView, type TagView, type WorldEvent, type WorldAction, type MoveInput,
} from "@bfb/shared";

export const SOLO_ID = "me";

export class LocalSession {
  private readonly w: World;
  /**
   * R13.1: anything outside this class that touches the World (the test hooks, the benchmark) may have changed it, so
   * the next step() refreshes the view whether or not a tick ran. Inside, `this.w` doesn't count.
   */
  get world(): World { this.dirty = true; return this.w; }
  /** R13.1: the view needs copying again: a tick ran, an action or a join landed, or something reached into the World */
  private dirty = true;
  /** R13.1: did the last step() produce a new view? (false: nothing could have changed; the game keeps drawing and
   *  predicting at the display's rate either way, it just doesn't re-copy and re-apply the same state) */
  fresh = true;
  readonly view: WorldView;
  private players = new Map<string, PlayerView>();
  private items = new Map<string, ItemView>();
  private npcs = new Map<string, NpcView>();
  private propsV = new Map<string, PropView>();
  private carsV = new Map<string, CarView>();
  private copCarsV = new Map<string, CopCarView>();
  private tagsV = new Map<string, TagView>();
  private acc = 0;

  /** `id` is the local player's id (a browser host uses its own id, solo uses "me"). */
  constructor(name: string, readonly id = SOLO_ID, npcs?: number) {
    this.w = new World({ seed: (Math.random() * 2 ** 31) | 0, lobby: true, npcs });
    this.w.addPlayer(id, name);
    this.view = { players: this.players, items: this.items, npcs: this.npcs, props: this.propsV, cars: this.carsV, copCars: this.copCarsV, tags: this.tagsV, phase: "arena", ownerId: id, code: "" };
    this.refresh();
  }

  sendInputs(batch: MoveInput[]) { if (batch.length) this.w.pushInputs(this.id, batch); } // (only queued: the next tick moves you)
  sendAction(a: WorldAction) { this.dirty = true; this.w.action(this.id, a); } // (an action can change things at once)
  start() { this.dirty = true; return this.w.startMatch(); }

  /** Advance the world in fixed 60 Hz steps; returns what happened (for sounds/effects). */
  step(dt: number): WorldEvent[] {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.w.tick();
      this.dirty = true;
    }
    // R13.1: at 240 FPS three frames in four have no tick: copying the same state again (and the game re-applying it)
    // was all of the cost and none of the use. Events go out every step, exactly once, either way.
    this.fresh = this.dirty;
    if (this.dirty) this.refresh();
    return this.w.takeEvents();
  }

  /** Copy the World into the plain view objects the game reads. */
  refresh() {
    this.dirty = false;
    matchView(this.w, this.view as unknown as Record<string, any>);
    for (const id of this.w.players.keys()) {
      const v = this.players.get(id) ?? ({} as PlayerView);
      this.players.set(id, playerView(this.w, id, v));
    }
    for (const id of [...this.players.keys()]) if (!this.w.players.has(id)) this.players.delete(id);
    for (const id of this.w.items.keys()) {
      const v = this.items.get(id) ?? ({} as ItemView);
      this.items.set(id, itemView(this.w, id, v));
    }
    for (const id of [...this.items.keys()]) if (!this.w.items.has(id)) this.items.delete(id);
    for (const id of this.w.npc.npcs.keys()) {
      const v = this.npcs.get(id) ?? ({} as NpcView);
      this.npcs.set(id, npcView(this.w, id, v));
    }
    for (const id of [...this.npcs.keys()]) if (!this.w.npc.npcs.has(id)) this.npcs.delete(id);
    for (const id of this.w.props.props.keys()) {
      const v = this.propsV.get(id) ?? ({} as PropView);
      this.propsV.set(id, propView(this.w, id, v));
    }
    this.w.traffic.cars.forEach((c, i) => {
      const v = this.carsV.get(c.id) ?? ({} as CarView);
      this.carsV.set(c.id, carView(this.w, i, v));
    });
    for (const c of this.w.police.cars) this.copCarsV.set(c.id, copCarView(this.w, c.id, this.copCarsV.get(c.id) ?? ({} as CopCarView)));
    for (const id of [...this.copCarsV.keys()]) if (!this.w.police.cars.some((c) => c.id === id)) this.copCarsV.delete(id);
    // C4b: tags (sprayed once, gone at dawn)
    for (const id of this.w.tags.keys()) if (!this.tagsV.has(id)) this.tagsV.set(id, tagView(this.w, id));
    for (const id of [...this.tagsV.keys()]) if (!this.w.tags.has(id)) this.tagsV.delete(id);
  }

  // ---- test helpers (used by automated tests with ?test=1) ----
  teleport(x: number, z: number, yaw: number, y?: number) {
    this.dirty = true;
    this.w.debugTeleport(this.id, x, z, yaw, y); // (C5a: lands you on the squat's roof when that's where x, z is)
  }
  spawnItem(type: string, x: number, z: number): string { this.dirty = true; return this.w.placeItem(type, x, this.w.floorAt(x, z) + 0.3, z); }
  /** Put a specific pedestrian at a spot (standing still until the next wander decision). */
  placeNpc(kind: string, x: number, z: number, yaw: number): string {
    const id = this.w.npc.place(kind as never, x, z, yaw).id;
    this.refresh();
    return id;
  }
}
