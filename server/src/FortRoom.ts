import { Room, type Client } from "colyseus";
import {
  World, playerView, itemView, npcView, matchView, propView, carView, copCarView, MSG, MAX_PLAYERS, SIM_HZ, PATCH_HZ, applyDebug, type JoinOptions, type WorldEvent,
} from "@bfb/shared";
import { FortRoomState, PlayerState, ItemState, NpcState, PropState, CarState, CopCarState } from "./schema.ts";
import { claimRoomCode, releaseRoomCode } from "./roomCodes.ts";

/** How long a dropped player's seat is held so they can rejoin (seconds). */
export const RECONNECT_WINDOW_S = Number(process.env.RECONNECT_WINDOW_S) || 30; // tests on slow machines may raise it

/**
 * One multiplayer room. All game rules live in the shared World; this class only:
 * receives messages -> World, ticks the World, and copies the World into the synced state.
 */
export class FortRoom extends Room<{ state: FortRoomState }> {
  maxClients = MAX_PLAYERS;
  state = new FortRoomState();
  // Generous flood limit: 60 input packets/s + actions. Abusive clients get disconnected.
  maxMessagesPerSecond = 180;
  private world = new World({ seed: (Math.random() * 2 ** 31) | 0, lobby: true });
  private pendingEvents: WorldEvent[] = [];

  onCreate() {
    const code = claimRoomCode();
    this.roomId = code; // the room code IS the room id, so a link can join it directly
    this.state.code = code;
    this.state.phase = "lobby";
    this.state.ownerId = "";
    this.setPatchRate(1000 / PATCH_HZ);
    this.setSimulationInterval(() => this.tick(), 1000 / SIM_HZ);

    this.onMessage(MSG.INPUT, (client, batch: unknown) => this.world.pushInputs(client.sessionId, batch));
    this.onMessage(MSG.ACTION, (client, act: unknown) => this.world.action(client.sessionId, act));
    this.onMessage(MSG.START, (client) => {
      if (client.sessionId !== this.state.ownerId) return;
      this.world.startMatch(); // from the lobby, or again after the final results
    });
    // Test-only tools (automated tests start the server with DEV_TOOLS=1). Never enabled in production.
    if (process.env.DEV_TOOLS === "1") {
      this.onMessage("dbg", (client, m: any) => applyDebug(this.world, client.sessionId, m));
    }
    this.syncAll();
  }

  onJoin(client: Client, options: Partial<JoinOptions>) {
    const p = this.world.addPlayer(client.sessionId, options?.name);
    const ps = new PlayerState() as PlayerState;
    playerView(this.world, client.sessionId, ps);
    this.state.players.set(client.sessionId, ps);
    if (!this.state.ownerId) this.state.ownerId = client.sessionId;
    this.broadcast(MSG.ANNOUNCE, { text: `${p.name} joined the fort party` }, { except: client });
  }

  onDrop(client: Client) {
    // Connection lost without the player choosing to leave: drop their loot, keep the seat for a while.
    this.world.setConnected(client.sessionId, false);
    const p = this.world.players.get(client.sessionId);
    if (p) this.broadcast(MSG.ANNOUNCE, { text: `${p.name} lost connection... holding their spot` });
    this.allowReconnection(client, RECONNECT_WINDOW_S);
  }

  onReconnect(client: Client) {
    this.world.setConnected(client.sessionId, true);
    const p = this.world.players.get(client.sessionId);
    if (p) this.broadcast(MSG.ANNOUNCE, { text: `${p.name} is back!` });
  }

  onLeave(client: Client) {
    const name = this.world.players.get(client.sessionId)?.name ?? "Someone";
    this.world.removePlayer(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.ownerId === client.sessionId) {
      // Hand the room to whoever is left (first in join order).
      const next = this.state.players.keys().next();
      this.state.ownerId = next.done ? "" : next.value;
    }
    this.broadcast(MSG.ANNOUNCE, { text: `${name} left` });
  }

  onDispose() {
    releaseRoomCode(this.state.code);
  }

  private tick() {
    this.world.tick();
    const ev = this.world.takeEvents();
    if (ev.length) this.pendingEvents.push(...ev);
  }

  /**
   * Runs right before each network patch (20 per second). The World simulates at 60 Hz, but the
   * synced state only needs copying when it's about to be sent: copying it every tick used most
   * of the server's CPU (and the free hosting plan only has a tenth of a core).
   */
  onBeforePatch() {
    this.syncAll();
    if (this.pendingEvents.length) {
      this.broadcast(MSG.EVENTS, this.pendingEvents);
      this.pendingEvents = [];
    }
  }

  /** Copy the World into the synced state. Only changed values are sent over the network. */
  private syncAll() {
    const scratch: Record<string, any> = {};
    matchView(this.world, scratch);
    const root = this.state as unknown as Record<string, any>;
    for (const k in scratch) if (root[k] !== scratch[k]) root[k] = scratch[k];
    for (const k in scratch) delete scratch[k];
    for (const id of this.world.players.keys()) {
      const ps = this.state.players.get(id) as PlayerState | undefined;
      if (!ps) continue;
      playerView(this.world, id, scratch);
      for (const k in scratch) if (ps[k] !== scratch[k]) ps[k] = scratch[k];
    }
    for (const id of this.world.items.keys()) {
      let is = this.state.items.get(id) as ItemState | undefined;
      if (!is) { is = new ItemState() as ItemState; this.state.items.set(id, is); }
      itemView(this.world, id, scratch);
      for (const k in scratch) {
        const v = scratch[k];
        // float32 fields: skip tiny changes that would round to the same value anyway
        if (typeof v === "number" && typeof is[k] === "number" && Math.abs(is[k] - v) < 1e-4) continue;
        if (is[k] !== v) is[k] = v;
      }
    }
    for (const id of [...this.state.items.keys()]) if (!this.world.items.has(id)) this.state.items.delete(id);
    for (const id of this.world.npc.npcs.keys()) {
      let ns = this.state.npcs.get(id) as NpcState | undefined;
      if (!ns) { ns = new NpcState() as NpcState; this.state.npcs.set(id, ns); }
      npcView(this.world, id, scratch);
      for (const k in scratch) {
        const v = scratch[k];
        if (typeof v === "number" && typeof ns[k] === "number" && Math.abs(ns[k] - v) < 1e-3) continue;
        if (ns[k] !== v) ns[k] = v;
      }
    }
    for (const id of [...this.state.npcs.keys()]) if (!this.world.npc.npcs.has(id)) this.state.npcs.delete(id);
    // props: two flags and a note each, and they rarely change
    for (const id of this.world.props.props.keys()) {
      let ps = this.state.props.get(id) as PropState | undefined;
      if (!ps) { ps = new PropState() as PropState; this.state.props.set(id, ps); }
      propView(this.world, id, scratch);
      if (ps.ready !== scratch.ready) ps.ready = scratch.ready;
      if (ps.alarm !== scratch.alarm) ps.alarm = scratch.alarm;
      if (ps.note !== scratch.note) ps.note = scratch.note; // (the pub's chalkboard, jukebox, pawn case, pool + darts: R12.3)
    }
    this.world.traffic.cars.forEach((c, i) => {
      let cs = this.state.cars.get(c.id) as CarState | undefined;
      if (!cs) { cs = new CarState() as CarState; this.state.cars.set(c.id, cs); }
      carView(this.world, i, scratch);
      if (Math.abs(cs.x - scratch.x) > 1e-3) cs.x = scratch.x;
      if (Math.abs(cs.z - scratch.z) > 1e-3) cs.z = scratch.z;
      if (Math.abs(cs.yaw - scratch.yaw) > 1e-4) cs.yaw = scratch.yaw;
    });
    // police cruisers come and go
    for (const c of this.world.police.cars) {
      let cs = this.state.copCars.get(c.id) as CopCarState | undefined;
      if (!cs) { cs = new CopCarState() as CopCarState; this.state.copCars.set(c.id, cs); }
      copCarView(this.world, c.id, scratch);
      for (const k of ["x", "z", "yaw", "siren"]) if (cs[k] !== scratch[k]) cs[k] = scratch[k];
    }
    for (const id of [...this.state.copCars.keys()]) if (!this.world.police.cars.some((c) => c.id === id)) this.state.copCars.delete(id);
  }
}
