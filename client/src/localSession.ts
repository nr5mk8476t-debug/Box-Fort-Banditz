// Solo mode: runs the same World simulation the server uses, right here in the browser.
// The game talks to it exactly like it talks to the server, so solo = multiplayer rules.
import {
  World, playerView, itemView, npcView, matchView, propView, carView, copCarView, SIM_DT, makeMoveState,
  type WorldView, type PlayerView, type ItemView, type NpcView, type PropView, type CarView, type CopCarView, type WorldEvent, type WorldAction, type MoveInput,
} from "@bfb/shared";

export const SOLO_ID = "me";

export class LocalSession {
  readonly world: World;
  readonly view: WorldView;
  private players = new Map<string, PlayerView>();
  private items = new Map<string, ItemView>();
  private npcs = new Map<string, NpcView>();
  private propsV = new Map<string, PropView>();
  private carsV = new Map<string, CarView>();
  private copCarsV = new Map<string, CopCarView>();
  private acc = 0;

  constructor(name: string) {
    this.world = new World({ seed: (Math.random() * 2 ** 31) | 0 });
    this.world.addPlayer(SOLO_ID, name);
    this.view = { players: this.players, items: this.items, npcs: this.npcs, props: this.propsV, cars: this.carsV, copCars: this.copCarsV, phase: "arena", ownerId: SOLO_ID, code: "" };
    this.refresh();
  }

  sendInputs(batch: MoveInput[]) { if (batch.length) this.world.pushInputs(SOLO_ID, batch); }
  sendAction(a: WorldAction) { this.world.action(SOLO_ID, a); }
  start() { return this.world.startMatch(); }

  /** Advance the world in fixed 60 Hz steps; returns what happened (for sounds/effects). */
  step(dt: number): WorldEvent[] {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.world.tick();
    }
    this.refresh();
    return this.world.takeEvents();
  }

  private refresh() {
    matchView(this.world, this.view as unknown as Record<string, any>);
    for (const id of this.world.players.keys()) {
      const v = this.players.get(id) ?? ({} as PlayerView);
      this.players.set(id, playerView(this.world, id, v));
    }
    for (const id of this.world.items.keys()) {
      const v = this.items.get(id) ?? ({} as ItemView);
      this.items.set(id, itemView(this.world, id, v));
    }
    for (const id of [...this.items.keys()]) if (!this.world.items.has(id)) this.items.delete(id);
    for (const id of this.world.npc.npcs.keys()) {
      const v = this.npcs.get(id) ?? ({} as NpcView);
      this.npcs.set(id, npcView(this.world, id, v));
    }
    for (const id of [...this.npcs.keys()]) if (!this.world.npc.npcs.has(id)) this.npcs.delete(id);
    for (const id of this.world.props.props.keys()) {
      const v = this.propsV.get(id) ?? ({} as PropView);
      this.propsV.set(id, propView(this.world, id, v));
    }
    this.world.traffic.cars.forEach((c, i) => {
      const v = this.carsV.get(c.id) ?? ({} as CarView);
      this.carsV.set(c.id, carView(this.world, i, v));
    });
    for (const c of this.world.police.cars) this.copCarsV.set(c.id, copCarView(this.world, c.id, this.copCarsV.get(c.id) ?? ({} as CopCarView)));
    for (const id of [...this.copCarsV.keys()]) if (!this.world.police.cars.some((c) => c.id === id)) this.copCarsV.delete(id);
  }

  // ---- test helpers (used by automated tests with ?test=1) ----
  teleport(x: number, z: number, yaw: number) {
    const p = this.world.players.get(SOLO_ID);
    if (!p) return;
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(x, z, yaw), ...keep };
    p.queue.length = 0;
  }
  spawnItem(type: string, x: number, z: number): string { return this.world.placeItem(type, x, 0.3, z); }
  /** Put a specific pedestrian at a spot (standing still until the next wander decision). */
  placeNpc(kind: string, x: number, z: number, yaw: number): string {
    const id = this.world.npc.place(kind as never, x, z, yaw).id;
    this.refresh();
    return id;
  }
}
