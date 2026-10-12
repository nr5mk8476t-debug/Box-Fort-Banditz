// Phase 4: the Trashington Police Department. Runs inside the World (server + solo).
//
// HEAT -> WANTED STARS. Crimes raise your heat (0..100): 30 = 1 star, 60 = 2, 90 = 3 (max).
//   1-2 stars: that many foot cops are dispatched toward you (they appear out of sight, 22-42 m
//   away). 3 stars: 3 foot cops AND a cop car that drives the roads to you, drops off one more
//   cops, and busts you outright if it runs you over.
// COPS jog to where you were reported, sprint at you when they see you (faster than walking,
// slower than sprinting), shout FREEZE and grab you. Dodge (Q) at the right moment slips the grab.
// Punch a cop and they stagger (big heat); three punches and they're out for a few seconds.
// LOSING THEM: cops need line of sight. Duck behind buildings, into alleys, crouch behind cars.
// If no cop has seen you for 4 s your heat cools fast; at 0 stars every cop gives up.
// NIGHT (Phase 5A): twice the cops per star (2/4/6), cop cars from 2 stars, flashlights (they see
// further), and heat builds twice as fast (World.addHeat).
// TASERS (Phase 5A) at 3 stars: a cop within 6 m who can see you stops, aims (a red laser: your
// warning) and fires. Dodge (Q) or get behind cover to make it miss. Hit = ~2 s stunned, you drop
// what's in your hands, and any cop who reaches you cuffs you.
// BUSTED: everything you carry is confiscated (gone), heat resets, 30 s in a cell at the station.
// JAIL: pick the lock (lockpick.ts) to break out early into the back alley (still wanted, 1 star),
// or serve the 30 s and walk out the front door clean.
import { nearBoxes, inBush, inFoot, inRect, type Box, type Rect } from "./arena.js";
const R0: Rect = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
import { makeMoveState } from "./movement.js";
import { PLAYER } from "./constants.js";
import { NPC_DEFS, pickLine } from "./npc.js";
import { findPath } from "./navgraph.js";
import { newLockRun, lockPress, type LockResult } from "./lockpick.js";
import type { NpcSimData } from "./npcSim.js";
import type { World, PlayerSim } from "./world.js";

export const STAR_HEAT = [30, 60, 90];
export function starsOf(heat: number): number { return heat >= STAR_HEAT[2] ? 3 : heat >= STAR_HEAT[1] ? 2 : heat >= STAR_HEAT[0] ? 1 : 0; }
export const JAIL_TIME = 30;
/** Heat right after a break-out: 1 star, and it takes a while to cool. */
export const BREAKOUT_HEAT = 55;
export const COP_RUN = 6.5; // walk 5.8 < cop 6.5 < sprint 9.4 (D1: scaled with the faster movement; was 5.6)
export const COP_JOG = 3.8;
export const COP_SIGHT = 24;
export const COP_HEAR = 3; // this close they notice you even without line of sight
const GRAB_RANGE = 1.2; // start the grab
const GRAB_REACH = 1.9; // still in reach when the grab lands
const GRAB_WINDUP = 0.55; // time to react (dodge / keep running)
const LOSE_SIGHT = 0.8; // seconds without seeing you before a chasing cop starts searching
const SEARCH_TIME = 6;
const MAX_COPS = 6;
const MAX_COPS_NIGHT = 10;
const MAX_CARS = 2;
export const COP_SIGHT_NIGHT = 30; // flashlights
export const TASER = { stars: 3, range: 6, aim: 0.8, reach: 7, stun: 2, cooldown: 4 };
const COOL_DELAY = 3; // unseen this long -> heat cools fast
const COOL_FAST = 4; // heat per second
const COOL_SLOW = 0.6;
const COOL_UNWANTED = 1;
export const COPCAR = { speed: 15, halfLen: 2.2, halfWidth: 1.0, deployDist: 15 };
/**
 * R7: the city's police presence (the new city): foot patrols walking beats round town, cruisers driving round all
 * day, and the station's own cops (one walking the ground floor, one guarding the evidence room). They ignore you
 * unless you're wanted (or they see a crime); then they're ordinary cops till they lose you, and go back on patrol.
 */
export const PATROL = { foot: 10, footNight: 14, cars: 2, walk: 1.7, cruise: 9, carSight: 30, respawn: 10, hidden: 30 };

export interface CopCarSim {
  id: string; x: number; z: number; yaw: number; v: number;
  target: string;
  mode: "drive" | "parked" | "leave" | "cruise";
  /** R7: a patrol car (drives round town when nobody's wanted; never goes away) */
  patrol?: boolean;
  route: { x: number; z: number }[];
  replanT: number; calmT: number; lifeT: number; deployed: boolean;
}

export type PoliceEvent =
  | { t: "copSpawn"; npc: string; p: string }
  | { t: "spotted"; npc: string; p: string }
  | { t: "busted"; p: string; by: string; count: number; value: number; car: boolean }
  | { t: "released"; p: string; breakout: boolean; walked?: boolean }
  | { t: "lock"; p: string; r: LockResult }
  | { t: "copCar"; car: string; p: string; stage: "dispatch" | "deploy" | "leave" }
  | { t: "taser"; npc: string; p: string; stage: "aim" | "hit" | "miss"; x: number; z: number };

interface RoadPt { x: number; z: number; edge: number; }

export class PoliceSystem {
  readonly cars: CopCarSim[] = [];
  private nextCar = 1;
  private dispatchAcc = 0;
  private nextCop = new Map<string, number>(); // player -> world time the next foot cop may be sent
  private nextCarT = new Map<string, number>();
  private roadDist: number[][] = [];
  private roadNext: number[][] = [];

  constructor(private w: World) {
    const g = w.arena.roadGraph;
    if (g) {
      // all-pairs shortest routes on the (tiny) road network
      const n = g.nodes.length;
      const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
      const nx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, () => i));
      for (const [a, b] of g.edges) {
        const l = Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].z - g.nodes[b].z);
        d[a][b] = d[b][a] = l; nx[a][b] = b; nx[b][a] = a;
      }
      for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (d[i][k] + d[k][j] < d[i][j]) { d[i][j] = d[i][k] + d[k][j]; nx[i][j] = nx[i][k]; }
      }
      this.roadDist = d; this.roadNext = nx;
    }
  }

  /** Every cop (foot) in the city. */
  cops(): NpcSimData[] { return [...this.w.npc.npcs.values()].filter((n) => n.kind === "cop"); }
  /** R7: on patrol (a beat round town, or one of the station's own) rather than sent after somebody */
  private onBeat(n: NpcSimData) { return !!n.patrol || n.beat !== undefined; }
  private patrolT = 0;
  private get patrolsOn() { return this.w.arena.variant === "new"; }

  /** New round: no cops, no cars, nobody in jail. */
  reset() {
    for (const n of this.cops()) this.w.npc.npcs.delete(n.id);
    this.cars.length = 0;
    this.nextCop.clear(); this.nextCarT.clear();
    for (const p of this.w.players.values()) { p.jailT = 0; p.lock = null; p.jailCell = -1; p.seenT = -99; }
  }

  // ------------------------------------------------------------------ per tick
  tick(dt: number) {
    const w = this.w;
    const cops = this.cops();
    for (const p of w.players.values()) {
      if (p.jailT > 0) {
        // (the lock's own timers - tension, noise - run on the PLAYER's press times inside lockPress,
        //  never on the server clock: a laggy client would otherwise have its pins dropped by the server)
        p.jailT -= dt;
        if (p.jailT <= 0) { this.release(p, false); continue; }
        // R8: the chief's key opened the cell: whoever walks out is free (wanted: 1 star)
        const hold = w.arena.station?.holding;
        if (hold && !inRect(hold.cell, p.move.x, p.move.z, 0.9) && w.props.cellOpen()) this.walkOut(p);
        continue;
      }
      // Heat cooling. Nothing for 4 s after a crime or a sighting. Then: slowly while cops are still
      // on their way to where you were reported (0.6/s) or while you're not wanted yet (1/s), and
      // fast (3/s) once the cops have lost you or given up.
      const quiet = w.time - Math.max(p.seenT, p.crimeT);
      if (quiet > COOL_DELAY) {
        const enRoute = cops.some((c) => c.target === p.id && c.state === "patrol");
        const rate = enRoute ? COOL_SLOW : starsOf(p.notoriety) > 0 ? COOL_FAST : COOL_UNWANTED;
        p.notoriety = Math.max(0, p.notoriety - rate * dt);
      }
    }
    this.dispatchAcc += dt;
    if (this.dispatchAcc >= 0.5) { this.dispatchAcc = 0; this.dispatch(); }
    if (this.patrolsOn && (this.patrolT -= dt) <= 0) { this.patrolT = 1; this.keepPatrols(); }
    for (const car of [...this.cars]) this.driveCar(car, dt);
  }

  private wanted(p: PlayerSim) { return p.connected && p.jailT <= 0 && p.respawnT <= 0; }
  private get night() { return this.w.match.night; }

  /** Send cops (and at 3 stars a car) after anyone whose stars outnumber the cops on them. */
  private dispatch() {
    const w = this.w;
    const cops = this.cops();
    for (const p of w.players.values()) {
      if (!this.wanted(p)) continue;
      const stars = starsOf(p.notoriety);
      if (!stars) continue;
      // (a car on its way counts as the cop it's bringing, so 3 stars stays 3 cops however the timing falls)
      const on = cops.filter((c) => c.target === p.id && c.state !== "leave").length + this.cars.filter((c) => c.target === p.id && c.mode !== "leave" && !c.deployed).length;
      const sent = cops.filter((c) => !this.onBeat(c)).length;
      const want = this.night ? stars * 2 : stars;
      if (on < want && sent < (this.night ? MAX_COPS_NIGHT : MAX_COPS) && (this.nextCop.get(p.id) ?? 0) <= w.time) {
        const c = this.spawnCop(p);
        if (c) { cops.push(c); this.nextCop.set(p.id, w.time + (this.night ? 2 : 4)); }
      }
      if (stars >= (this.night ? 2 : 3) && this.cars.filter((c) => !c.patrol).length < MAX_CARS && !this.cars.some((c) => c.target === p.id && c.mode !== "leave") && (this.nextCarT.get(p.id) ?? 0) <= w.time) {
        if (this.spawnCar(p)) this.nextCarT.set(p.id, w.time + 12);
      }
    }
  }

  /** A foot cop walks in from somewhere you can't see (22-42 m away). */
  spawnCop(p: PlayerSim, at?: { x: number; z: number }, chase = false): NpcSimData | null {
    const w = this.w;
    let x: number, z: number;
    if (at) { x = at.x; z = at.z; } else {
      // around where they THINK you are, but never popping up right in front of you
      const g = w.npc.graph;
      const near = g.filter((n) => {
        const d = Math.hypot(n.x - p.knownX, n.z - p.knownZ), dp = Math.hypot(n.x - p.move.x, n.z - p.move.z);
        return d >= 22 && d <= 42 && dp >= 18;
      });
      const hidden = near.filter((n) => !this.los(n.x, 1.6, n.z, p.move.x, p.move.y + 1.6, p.move.z));
      const pool = hidden.length ? hidden : near.length ? near : g;
      if (!pool.length) return null;
      const n = pool[Math.floor(w.random() * pool.length)];
      x = n.x; z = n.z;
    }
    const c = w.npc.spawn("cop");
    if (!c) return null;
    c.move = makeMoveState(x, z, Math.atan2(p.move.x - x, p.move.z - z));
    c.node = w.npc.nearestClearNode(x, z, -1);
    c.state = chase ? "chase" : "patrol"; c.target = p.id; c.robbed = true; c.hp = NPC_DEFS.cop.hp;
    c.lastX = chase ? p.move.x : p.knownX; c.lastZ = chase ? p.move.z : p.knownZ; c.path = []; c.lifeT = 0; c.lostT = 0; c.sees = chase; c.losT = 0; c.lane = 0; c.pace = 1;
    w.emit({ t: "copSpawn", npc: c.id, p: p.id });
    return c;
  }

  // ------------------------------------------------------------------ seeing
  /** Clear straight line between two points (eye height)? Bars and trees don't hide you. */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.7));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k;
      for (const b of nearBoxes(this.w.arena, x, z, 0.05) as Box[]) {
        if (b.kind === "bars" || b.kind === "tree") continue;
        if (inFoot(b, x, z) && y > b.y - b.h / 2 && y < b.y + b.h / 2) return false;
      }
    }
    return true;
  }

  canSee(n: NpcSimData, p: PlayerSim): boolean {
    const m = p.move;
    const d = Math.hypot(m.x - n.move.x, m.z - n.move.z);
    if (d > (this.night ? COP_SIGHT_NIGHT : COP_SIGHT) || Math.abs(m.y - n.move.y) > 8) return false;
    if (d < COP_HEAR) return true;
    // C3: crouched in a bush, you're invisible (unless they're close enough to hear you)
    if (m.crouching && m.y < 0.5 && inBush(this.w.arena, m.x, m.z)) return false;
    const eye = m.crouching || m.slideT > 0 ? 0.9 : 1.6; // your head; crouching behind a parked car (1.5 m) hides it
    return this.los(n.move.x, n.move.y + 1.6, n.move.z, m.x, m.y + eye, m.z);
  }

  /**
   * C4a: a noise at (x, z) heard r metres away. Cops in earshot who aren't busy chasing someone come and
   * look where it came from (if the bandit who made it is wanted, they're on to them).
   */
  hear(p: PlayerSim, x: number, z: number, r: number) {
    if (p.jailT > 0) return;
    for (const c of this.cops()) {
      if (c.state === "ko" || c.state === "stunned" || c.state === "windup" || c.state === "chase") continue;
      if (Math.hypot(c.move.x - x, c.move.z - z) > r) continue;
      c.state = "chase"; c.target = p.id; c.sees = false; c.lostT = 0; c.path = [];
      c.lastX = x; c.lastZ = z;
      this.say(c, NPC_DEFS.cop.lines.spot);
    }
  }

  /** A crime happened: any cop who can see it comes running (and it counts extra). */
  onCrime(p: PlayerSim) {
    if (p.jailT > 0) return;
    let witnessed = false;
    for (const c of this.cops()) {
      if (c.state === "ko" || c.state === "stunned" || c.state === "windup") continue;
      if (c.target && c.target !== p.id && c.state === "chase") continue;
      if (Math.hypot(c.move.x - p.move.x, c.move.z - p.move.z) > 25 || !this.canSee(c, p)) continue;
      witnessed = true;
      if (c.state !== "chase") this.say(c, NPC_DEFS.cop.lines.spot);
      c.state = "chase"; c.target = p.id; c.sees = true; c.lostT = 0; c.path = [];
      c.lastX = p.move.x; c.lastZ = p.move.z;
    }
    if (witnessed) { p.notoriety = Math.min(100, p.notoriety + 5); p.seenT = this.w.time; }
  }

  private say(n: NpcSimData, lines: string[] | undefined) {
    const line = pickLine(lines, () => this.w.random());
    if (line) { n.sayCd = 3; this.w.emit({ t: "npcSay", npc: n.id, line }); }
  }

  // ------------------------------------------------------------------ cop AI
  /** Called by the NPC system for every cop, every AI step: where to go and how fast. */
  brain(n: NpcSimData, dt: number): { tx: number; tz: number; speed: number; face: number | null } {
    const w = this.w;
    const stay = { tx: n.move.x, tz: n.move.z, speed: 0, face: null as number | null };
    n.lifeT += dt;
    const p = w.players.get(n.target);
    if (n.state === "stunned" || n.state === "ko") {
      if (n.stateT <= 0) { if (p && this.wanted(p)) n.state = "chase"; else this.leave(n); n.lostT = 0; n.path = []; }
      return stay;
    }
    if (n.state === "beat") return this.beatBrain(n, dt);
    if (n.state !== "leave" && (!p || !this.wanted(p) || starsOf(p.notoriety) === 0)) {
      if (p && this.wanted(p)) this.say(n, NPC_DEFS.cop.lines.lost);
      this.leave(n);
    }
    if (n.state === "leave") return this.walkOff(n);
    if ((n.state as string) === "beat" || !p) return this.beatBrain(n, dt); // (R7: back on patrol)
    const pl = p;
    // eyes (checked 5x a second)
    n.losT -= dt;
    if (n.losT <= 0) {
      n.losT = 0.2;
      n.sees = this.canSee(n, pl);
      if (n.sees) { pl.seenT = w.time; n.lastX = pl.move.x; n.lastZ = pl.move.z; pl.knownX = pl.move.x; pl.knownZ = pl.move.z; }
    }
    const m = pl.move;
    const d = Math.hypot(m.x - n.move.x, m.z - n.move.z);
    switch (n.state) {
      case "patrol": case "search": {
        if (n.sees) {
          n.state = "chase"; n.lostT = 0; n.path = [];
          this.say(n, NPC_DEFS.cop.lines.spot);
          w.emit({ t: "spotted", npc: n.id, p: pl.id });
          return { tx: m.x, tz: m.z, speed: COP_RUN, face: null };
        }
        // the radio: while another cop has eyes on you, everyone knows where you are
        if (w.time - pl.seenT < 0.5 && Math.hypot(n.lastX - pl.knownX, n.lastZ - pl.knownZ) > 6) { n.lastX = pl.knownX; n.lastZ = pl.knownZ; n.path = []; }
        if (!n.path.length && Math.hypot(n.lastX - n.move.x, n.lastZ - n.move.z) > 1.5) this.planTo(n, n.lastX, n.lastZ);
        const wp = n.path[0];
        if (wp) {
          if (Math.hypot(wp.x - n.move.x, wp.z - n.move.z) < 1.1) n.path.shift();
          return { tx: wp.x, tz: wp.z, speed: n.state === "patrol" ? COP_JOG : COP_JOG * 0.85, face: null };
        }
        // at the last known spot: look around for a while, then give up
        if (n.state === "patrol") { n.state = "search"; n.lostT = 0; }
        n.lostT += dt;
        n.lookT -= dt;
        if (n.lookT <= 0) { n.lookT = 0.7 + w.random(); n.lookYaw = n.move.yaw + (w.random() - 0.5) * 3; }
        if (n.lostT > SEARCH_TIME) { this.say(n, NPC_DEFS.cop.lines.lost); this.leave(n); }
        return { ...stay, face: n.lookYaw };
      }
      case "chase": {
        let tx = n.lastX, tz = n.lastZ;
        if (n.sees) { n.lostT = 0; tx = m.x; tz = m.z; }
        else {
          n.lostT += dt;
          if (n.lostT > LOSE_SIGHT || Math.hypot(n.lastX - n.move.x, n.lastZ - n.move.z) < 1) { n.state = "search"; n.lostT = 0; n.path = []; }
        }
        if (n.sees && d < GRAB_RANGE && n.attackCd <= 0 && Math.abs(m.y - n.move.y) < 1.2) {
          n.state = "windup"; n.stateT = m.knockT > 0 || m.stunT > 0 ? 0.25 : GRAB_WINDUP;
          this.say(n, NPC_DEFS.cop.lines.fight);
          w.emit({ t: "npcAttack", npc: n.id, p: pl.id, hit: false });
        } else if (n.sees && starsOf(pl.notoriety) >= TASER.stars && d <= TASER.range && d > GRAB_RANGE + 0.4
          && n.taserCd <= 0 && m.stunT <= 0 && m.knockT <= 0 && Math.abs(m.y - n.move.y) < 2) {
          // 3 stars: stop and aim the taser (the red laser is your warning)
          n.state = "aim"; n.stateT = TASER.aim;
          this.say(n, ["TASER! TASER!", "Don't make me do this!", "Hold it right there!"]);
          w.emit({ t: "taser", npc: n.id, p: pl.id, stage: "aim", x: n.move.x, z: n.move.z });
        }
        return { tx, tz, speed: d < 0.9 ? 0 : COP_RUN, face: null };
      }
      case "aim": {
        const face = Math.atan2(m.x - n.move.x, m.z - n.move.z);
        if (n.stateT <= 0) {
          n.taserCd = TASER.cooldown;
          n.state = "chase";
          const clear = this.los(n.move.x, n.move.y + 1.3, n.move.z, m.x, m.y + (m.crouching ? 0.8 : 1.2), m.z);
          if (clear && d <= TASER.reach && m.dodgeT <= 0 && m.knockT <= 0 && pl.respawnT <= 0 && pl.jailT <= 0) {
            m.stunT = TASER.stun;
            m.vx *= 0.2; m.vz *= 0.2;
            w.dropHand(pl);
            w.emit({ t: "taser", npc: n.id, p: pl.id, stage: "hit", x: n.move.x, z: n.move.z });
          } else {
            w.emit({ t: "taser", npc: n.id, p: pl.id, stage: "miss", x: n.move.x, z: n.move.z });
          }
        }
        return { tx: n.move.x, tz: n.move.z, speed: 0, face };
      }
      case "windup": {
        const face = Math.atan2(m.x - n.move.x, m.z - n.move.z);
        if (n.stateT <= 0) {
          if (d < GRAB_REACH && m.dodgeT <= 0 && Math.abs(m.y - n.move.y) < 1.3 && pl.respawnT <= 0) {
            this.say(n, NPC_DEFS.cop.lines.bust);
            this.bust(pl, n.id, false);
          } else {
            n.attackCd = 0.8; n.state = "chase";
            this.say(n, ["Get back here!", "Slippery little...!", "Stop resisting!"]);
          }
        }
        return { tx: m.x, tz: m.z, speed: 1.2, face };
      }
      default:
        n.state = "chase";
        return stay;
    }
  }

  /** Route along the pedestrian network to a point (then straight to it). */
  private planTo(n: NpcSimData, x: number, z: number) {
    const npc = this.w.npc;
    const a = npc.nearestClearNode(n.move.x, n.move.z, -1), b = npc.nearestClearNode(x, z, -1);
    const ids = findPath(npc.graph, a, b);
    n.path = ids.map((i) => ({ x: npc.graph[i].x, z: npc.graph[i].z }));
    // skip the first point if we're already past it
    if (n.path.length > 1 && Math.hypot(n.path[1].x - n.move.x, n.path[1].z - n.move.z) < Math.hypot(n.path[1].x - n.path[0].x, n.path[1].z - n.path[0].z)) n.path.shift();
    n.path.push({ x, z });
  }

  private leave(n: NpcSimData) {
    n.target = ""; n.path = []; n.lifeT = 0; n.sees = false;
    // R7: a patrol cop goes back on patrol (a station cop who's chased you out of the station walks off; another
    // one takes their place later)
    // (R9: station cops always head back to their beat, unless it's upstairs and they're down in the street)
    const b = n.beat !== undefined ? this.w.arena.station?.grand?.beats[n.beat] : undefined;
    if (n.patrol || (b && !(b.y > 2 && n.move.y < 2))) { this.resume(n); return; }
    n.state = "leave";
  }

  // ------------------------------------------------------------------ R7 patrols
  /** back on patrol: town cops pick up the route network where they are; station cops head back to their beat */
  private resume(n: NpcSimData) {
    n.state = "beat"; n.target = ""; n.path = []; n.sees = false; n.lostT = 0;
    if (n.patrol) { n.node = this.w.npc.nearestClearNode(n.move.x, n.move.z, -1); n.prevNode = n.node; }
    else {
      const b = this.w.arena.station?.grand?.beats[n.beat!];
      if (b) { let best = 0, bd = Infinity; b.pts.forEach((q, i) => { const d = Math.hypot(q.x - n.move.x, q.z - n.move.z); if (d < bd) { bd = d; best = i; } }); n.beatI = best; }
    }
  }

  /** walking the beat; anyone wanted in sight gets chased */
  private beatBrain(n: NpcSimData, dt: number): { tx: number; tz: number; speed: number; face: number | null } {
    const w = this.w;
    n.losT -= dt;
    if (n.losT <= 0) {
      n.losT = 0.25;
      for (const p of w.players.values()) {
        if (!this.wanted(p) || starsOf(p.notoriety) === 0 || !this.canSee(n, p)) continue;
        n.state = "chase"; n.target = p.id; n.sees = true; n.lostT = 0; n.path = [];
        n.lastX = p.move.x; n.lastZ = p.move.z; p.seenT = w.time; p.knownX = p.move.x; p.knownZ = p.move.z;
        this.say(n, NPC_DEFS.cop.lines.spot);
        w.emit({ t: "spotted", npc: n.id, p: p.id });
        return { tx: p.move.x, tz: p.move.z, speed: COP_RUN, face: null };
      }
    }
    if (n.sayCd <= 0 && w.random() < 0.003 && [...w.players.values()].some((p) => p.connected && Math.hypot(p.move.x - n.move.x, p.move.z - n.move.z) < 6)) this.say(n, NPC_DEFS.cop.lines.idle);
    if (n.patrol) {
      // wander the route network, one junction to the next
      const g = w.npc.graph;
      const at = g[n.node];
      if (!at) { n.node = w.npc.nearestClearNode(n.move.x, n.move.z, -1); return { tx: n.move.x, tz: n.move.z, speed: 0, face: null }; }
      if (Math.hypot(at.x - n.move.x, at.z - n.move.z) < 1.1) {
        const links = at.links.filter((l) => l !== n.prevNode);
        const pool = links.length ? links : at.links;
        n.prevNode = n.node; n.node = pool.length ? pool[Math.floor(w.random() * pool.length)] : n.node;
      }
      const q = g[n.node];
      return { tx: q.x, tz: q.z, speed: PATROL.walk, face: null };
    }
    const b = w.arena.station?.grand?.beats[n.beat!];
    if (!b) return { tx: n.move.x, tz: n.move.z, speed: 0, face: null };
    const q = b.pts[(n.beatI ?? 0) % b.pts.length];
    // (R9: a long way from the beat (back from a chase): along the routes, then straight)
    if (b.y < 2 && Math.hypot(q.x - n.move.x, q.z - n.move.z) > 4) {
      if (!n.path.length) this.planTo(n, q.x, q.z);
      const wp = n.path[0];
      if (wp) { if (Math.hypot(wp.x - n.move.x, wp.z - n.move.z) < 1.1) n.path.shift(); return { tx: wp.x, tz: wp.z, speed: PATROL.walk * 1.4, face: null }; }
    } else n.path = [];
    if (Math.hypot(q.x - n.move.x, q.z - n.move.z) < 0.6) {
      if (b.pts.length === 1) return { tx: n.move.x, tz: n.move.z, speed: 0, face: Math.PI / 2 };
      n.beatI = ((n.beatI ?? 0) + 1) % b.pts.length;
    }
    return { tx: q.x, tz: q.z, speed: PATROL.walk * 0.8, face: null };
  }

  /** keep the patrols up to strength: missing ones walk in from somewhere nobody's looking */
  private keepPatrols() {
    const w = this.w;
    if (!w.match || w.match.phase === "over") return; // (R10: the lobby too: free roam before the match starts had no cops at all)
    const cops = this.cops();
    const players = [...w.players.values()].filter((p) => p.connected && p.jailT <= 0);
    const unseen = (x: number, z: number, y = 0) => players.every((p) => Math.hypot(p.move.x - x, p.move.z - z) > PATROL.hidden || !this.los(x, y + 1.6, z, p.move.x, p.move.y + 1.6, p.move.z));
    // the town beats
    const want = this.night ? PATROL.footNight : PATROL.foot;
    if (cops.filter((c) => c.patrol).length < want && (this.nextCop.get("patrol") ?? 0) <= w.time) {
      const g = w.npc.graph.filter((q) => unseen(q.x, q.z) && !inRect(w.arena.station?.rect ?? R0, q.x, q.z, 1));
      if (g.length) {
        const q = g[Math.floor(w.random() * g.length)];
        const c = this.newCop(q.x, q.z, w.random() * Math.PI * 2);
        if (c) { c.patrol = true; c.node = q.id; c.prevNode = q.id; c.state = "beat"; this.nextCop.set("patrol", w.time + 0.5); }
      }
    }
    // the station's own
    (w.arena.station?.grand?.beats ?? []).forEach((b, i) => {
      if (cops.some((c) => c.beat === i) || (this.nextCop.get("beat" + i) ?? 0) > w.time) return;
      const q = b.pts[0];
      if (!unseen(q.x, q.z, b.y)) return; // (R9: walks in when nobody's looking, even with you in the building)
      const c = this.newCop(q.x, q.z, b.pts.length > 1 ? Math.atan2(b.pts[1].x - q.x, b.pts[1].z - q.z) : Math.PI / 2, b.y);
      if (c) { c.beat = i; c.beatI = 0; c.state = "beat"; this.nextCop.set("beat" + i, w.time + PATROL.respawn); }
    });
    // the cruisers
    if (this.cars.filter((c) => c.patrol).length < PATROL.cars) {
      const pts = this.roadPoints().filter((r) => unseen(r.x, r.z) && players.every((p) => Math.hypot(p.move.x - r.x, p.move.z - r.z) > 45));
      if (pts.length) {
        const r = pts[Math.floor(w.random() * pts.length)];
        this.cars.push({ id: "cop" + this.nextCar++, x: r.x, z: r.z, yaw: w.random() * Math.PI * 2, v: 0, target: "", mode: "cruise", route: [], replanT: 0, calmT: 0, lifeT: 0, deployed: false, patrol: true });
      }
    }
  }

  private newCop(x: number, z: number, yaw: number, y = 0): NpcSimData | null {
    const c = this.w.npc.spawn("cop");
    if (!c) return null;
    c.move = makeMoveState(x, z, yaw); c.move.y = y;
    c.node = this.w.npc.nearestClearNode(x, z, -1);
    c.target = ""; c.robbed = true; c.hp = NPC_DEFS.cop.hp; c.path = []; c.lifeT = 0; c.lostT = 0; c.sees = false; c.losT = this.w.random() * 0.25; c.lane = 0; c.pace = 1;
    c.lastX = x; c.lastZ = z;
    return c;
  }

  /** Stroll off and vanish once nobody is around (or after a while). */
  private walkOff(n: NpcSimData) {
    const w = this.w;
    const players = [...w.players.values()].filter((p) => p.connected);
    const far = players.every((p) => Math.hypot(p.move.x - n.move.x, p.move.z - n.move.z) > 35);
    if ((far && n.lifeT > 2) || n.lifeT > 30) { w.npc.npcs.delete(n.id); return { tx: n.move.x, tz: n.move.z, speed: 0, face: null }; }
    if (!n.path.length) {
      // the route point furthest from every player, within reason
      let best = n.node, bestD = -1;
      for (const g of w.npc.graph) {
        const dm = Math.hypot(g.x - n.move.x, g.z - n.move.z);
        if (dm > 45) continue;
        const dp = Math.min(...players.map((p) => Math.hypot(p.move.x - g.x, p.move.z - g.z)), 999);
        if (dp > bestD) { bestD = dp; best = g.id; }
      }
      this.planTo(n, w.npc.graph[best].x, w.npc.graph[best].z);
    }
    const wp = n.path[0];
    if (!wp) return { tx: n.move.x, tz: n.move.z, speed: 0, face: null };
    if (Math.hypot(wp.x - n.move.x, wp.z - n.move.z) < 1.1) n.path.shift();
    return { tx: wp.x, tz: wp.z, speed: 1.8, face: null };
  }

  // ------------------------------------------------------------------ busted / jail
  /** Cuffed: loot confiscated, heat reset, 30 s in a cell. */
  bust(p: PlayerSim, by: string, car: boolean) {
    const w = this.w;
    if (p.jailT > 0 || p.respawnT > 0) return;
    w.props.cancelRob(p);
    const { count, value } = w.confiscateAll(p);
    w.payBounty(p, value); // (C5c.1: somebody held them down for us)
    p.notoriety = 0; p.seenT = -99;
    const cells = w.arena.station?.cells ?? [];
    const hold = w.arena.station?.holding;
    if (hold) {
      // R6: the new city: everybody shares the one holding cell; you can walk about in it (E at the door: pick the lock)
      const sp = hold.spots[p.colorIdx % hold.spots.length];
      w.movePlayer(p, sp.x, sp.z, Math.PI);
      p.jailT = JAIL_TIME; p.jailCell = 0;
      p.lockSeed = 0; p.lock = null; p.lockT0 = w.time;
    } else {
      const taken = new Set([...w.players.values()].filter((o) => o !== p && o.jailT > 0).map((o) => o.jailCell));
      let cell = p.colorIdx % Math.max(1, cells.length);
      for (let i = 0; i < cells.length && taken.has(cell); i++) cell = (cell + 1) % cells.length;
      const c = cells[cell] ?? { x: 0, z: 0, yaw: 0 };
      w.movePlayer(p, c.x, c.z, c.yaw);
      p.jailT = JAIL_TIME; p.jailCell = cell;
      p.lockSeed = 1 + Math.floor(w.random() * 1e9);
      p.lock = newLockRun(p.lockSeed); p.lockT0 = w.time;
    }
    for (const cop of this.cops()) if (cop.target === p.id && cop.state !== "ko") this.leave(cop);
    for (const cc of this.cars) if (cc.target === p.id) this.carLeave(cc);
    w.emit({ t: "busted", p: p.id, by, count, value, car });
  }

  /** A lock-pick press from the jailed player (t = seconds since they were locked up, their clock). */
  pick(p: PlayerSim, pin: number, t: number) {
    const w = this.w;
    if (p.jailT <= 0 || !p.lock) return;
    const now = w.time - p.lockT0;
    if (!Number.isFinite(t) || t < 0 || t > now + 0.75) return; // can't press in the future
    const r = lockPress(p.lock, Math.floor(pin), t);
    if (r === "guard" || r === "solved") w.emit({ t: "lock", p: p.id, r });
    if (r === "solved") this.release(p, true);
  }

  /** R6: E at the holding cell's door: start picking its lock (a fresh lock every time you start) */
  startPick(p: PlayerSim) {
    if (p.jailT <= 0 || p.lock) return;
    p.lockSeed = 1 + Math.floor(this.w.random() * 1e9);
    p.lock = newLockRun(p.lockSeed); p.lockT0 = this.w.time;
    this.w.emit({ t: "lockStart", p: p.id });
  }
  /** R6: step away from the door (the lock-picking screen closes; you can walk about the cell again) */
  stopPick(p: PlayerSim) {
    if (p.jailT <= 0 || !p.lock || !this.w.arena.station?.holding) return;
    p.lock = null; p.lockSeed = 0;
  }

  /** R8: out through the open cell door (the chief's key): free where you stand, but wanted */
  private walkOut(p: PlayerSim) {
    const w = this.w;
    p.jailT = 0; p.lock = null; p.lockSeed = 0; p.jailCell = -1;
    p.notoriety = BREAKOUT_HEAT; p.seenT = w.time; p.knownX = p.move.x; p.knownZ = p.move.z;
    w.emit({ t: "released", p: p.id, breakout: true, walked: true });
  }

  private release(p: PlayerSim, breakout: boolean) {
    const w = this.w;
    const st = w.arena.station;
    p.jailT = 0; p.lock = null; p.jailCell = -1;
    const spot = st ? (breakout ? st.alley : st.door) : w.arena.spawns[0];
    w.movePlayer(p, spot.x, spot.z, spot.yaw);
    if (breakout) { p.notoriety = BREAKOUT_HEAT; p.seenT = w.time; p.knownX = spot.x; p.knownZ = spot.z; } // they know where you went
    else { p.notoriety = 0; p.seenT = -99; }
    w.emit({ t: "released", p: p.id, breakout });
  }

  // ------------------------------------------------------------------ cop cars
  private roadPoints(): RoadPt[] {
    const g = this.w.arena.roadGraph;
    const out: RoadPt[] = [];
    if (!g) return out;
    g.edges.forEach(([a, b], ei) => {
      const A = g.nodes[a], B = g.nodes[b], l = Math.hypot(B.x - A.x, B.z - A.z);
      for (let s = 0; s <= l; s += 8) out.push({ x: A.x + ((B.x - A.x) * s) / l, z: A.z + ((B.z - A.z) * s) / l, edge: ei });
    });
    return out;
  }

  /** Closest point on the road centre lines. */
  nearestRoad(x: number, z: number): RoadPt | null {
    const g = this.w.arena.roadGraph;
    if (!g) return null;
    let best: RoadPt | null = null, bestD = Infinity;
    g.edges.forEach(([a, b], ei) => {
      const A = g.nodes[a], B = g.nodes[b];
      const ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez;
      const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / l2)) : 0;
      const px = A.x + ex * k, pz = A.z + ez * k, d = Math.hypot(x - px, z - pz);
      if (d < bestD) { bestD = d; best = { x: px, z: pz, edge: ei }; }
    });
    return best;
  }

  private spawnCar(p: PlayerSim): CopCarSim | null {
    const w = this.w;
    const pts = this.roadPoints().filter((r) => { const d = Math.hypot(r.x - p.move.x, r.z - p.move.z); return d > 45 && d < 85; });
    if (!pts.length) return null;
    const hidden = pts.filter((r) => !this.los(r.x, 1.4, r.z, p.move.x, p.move.y + 1.4, p.move.z));
    const pool = hidden.length ? hidden : pts;
    const r = pool[Math.floor(w.random() * pool.length)];
    const car: CopCarSim = { id: "cop" + this.nextCar++, x: r.x, z: r.z, yaw: Math.atan2(p.move.x - r.x, p.move.z - r.z), v: 0, target: p.id, mode: "drive", route: [], replanT: 0, calmT: 0, lifeT: 0, deployed: false };
    this.cars.push(car);
    w.emit({ t: "copCar", car: car.id, p: p.id, stage: "dispatch" });
    return car;
  }

  /** Route along the road network from the car to a road point. */
  private planCar(car: CopCarSim, to: RoadPt) {
    const g = this.w.arena.roadGraph!;
    const here = this.nearestRoad(car.x, car.z);
    if (!here) return;
    if (here.edge === to.edge) { car.route = [{ x: to.x, z: to.z }]; return; }
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let best: number[] = [], bestCost = Infinity;
    for (const a of g.edges[here.edge]) for (const b of g.edges[to.edge]) {
      const A = g.nodes[a], B = g.nodes[b];
      const behind = (A.x - car.x) * fx + (A.z - car.z) * fz < 0 ? 12 : 0; // U-turns cost a bit
      const cost = Math.hypot(A.x - car.x, A.z - car.z) + behind + this.roadDist[a][b] + Math.hypot(B.x - to.x, B.z - to.z);
      if (cost < bestCost) {
        bestCost = cost;
        const ids = [a];
        for (let c = a, guard = 0; c !== b && guard < 32; guard++) { c = this.roadNext[c][b]; ids.push(c); }
        best = ids;
      }
    }
    car.route = best.map((i) => ({ x: g.nodes[i].x, z: g.nodes[i].z }));
    car.route.push({ x: to.x, z: to.z });
  }

  private carLeave(car: CopCarSim) {
    if (car.patrol) { if (car.mode !== "cruise") { car.mode = "cruise"; car.target = ""; car.route = []; car.deployed = false; car.calmT = 0; } return; } // (R7: back to cruising)
    if (car.mode === "leave") return;
    car.mode = "leave"; car.route = []; car.lifeT = 0;
    this.w.emit({ t: "copCar", car: car.id, p: car.target, stage: "leave" });
  }

  private driveCar(car: CopCarSim, dt: number) {
    const w = this.w;
    car.lifeT += dt;
    const p = w.players.get(car.target);
    const valid = !!p && this.wanted(p);
    if (car.mode !== "leave" && car.mode !== "cruise") {
      car.calmT = valid && starsOf(p!.notoriety) >= 2 ? 0 : car.calmT + dt; // stays on you down to 2 stars
      if (car.calmT > 4) this.carLeave(car);
    }
    let want = 0;
    if (car.mode === "cruise") {
      // R7: a cruiser on patrol: round town at a steady pace; anyone wanted in sight, siren on
      car.replanT -= dt;
      if (car.replanT <= 0) {
        car.replanT = 0.5;
        for (const o of w.players.values()) {
          if (!this.wanted(o) || starsOf(o.notoriety) === 0 || Math.hypot(o.move.x - car.x, o.move.z - car.z) > PATROL.carSight) continue;
          if (!this.los(car.x, 1.4, car.z, o.move.x, o.move.y + 1.4, o.move.z)) continue;
          car.mode = "drive"; car.target = o.id; car.calmT = 0; car.replanT = 0; car.deployed = false;
          o.seenT = w.time; o.knownX = o.move.x; o.knownZ = o.move.z;
          w.emit({ t: "copCar", car: car.id, p: o.id, stage: "dispatch" });
          break;
        }
      }
      if (car.mode === "cruise") {
        if (car.route.length <= 1 && (!car.route[0] || Math.hypot(car.route[0].x - car.x, car.route[0].z - car.z) < 4)) {
          const g = w.arena.roadGraph!;
          const nd = g.nodes[Math.floor(w.random() * g.nodes.length)];
          const r = this.nearestRoad(nd.x, nd.z);
          if (r) this.planCar(car, r);
        }
        want = PATROL.cruise;
        // don't drive into the back of the traffic
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        for (const t of w.traffic?.cars ?? []) {
          const dx = t.x - car.x, dz = t.z - car.z, along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          if (along > 0 && along < 9 && side < 1.8) want = Math.min(want, Math.max(0, t.v - 0.5), along < 5 ? 0 : want);
        }
      }
    }
    if (car.mode === "cruise") { /* (steering below) */ }
    else if (car.mode === "leave") {
      const players = [...w.players.values()].filter((o) => o.connected);
      if (car.lifeT > 25 || (car.lifeT > 3 && players.every((o) => Math.hypot(o.move.x - car.x, o.move.z - car.z) > 60))) {
        this.cars.splice(this.cars.indexOf(car), 1);
        return;
      }
      if (!car.route.length) {
        // drive to the road node furthest from everyone
        const g = w.arena.roadGraph!;
        let best = g.nodes[0], bestD = -1;
        for (const nd of g.nodes) { const dp = Math.min(...players.map((o) => Math.hypot(o.move.x - nd.x, o.move.z - nd.z)), 999); if (dp > bestD) { bestD = dp; best = nd; } }
        const r = this.nearestRoad(best.x, best.z);
        if (r) this.planCar(car, r);
      }
      want = COPCAR.speed * 0.8;
    } else if (car.mode === "drive" && valid) {
      car.replanT -= dt;
      if (car.replanT <= 0) { car.replanT = 1; const r = this.nearestRoad(p!.move.x, p!.move.z); if (r) this.planCar(car, r); }
      want = COPCAR.speed;
      // close enough (or at the end of the road nearest to them): pull over and send the cops in
      const dp = Math.hypot(p!.move.x - car.x, p!.move.z - car.z);
      const atEnd = car.route.length === 1 && Math.hypot(car.route[0].x - car.x, car.route[0].z - car.z) < 3;
      if (dp < COPCAR.deployDist || (atEnd && dp < 30)) car.mode = "parked";
    } else if (car.mode === "parked") {
      want = 0;
      if (car.v < 1 && !car.deployed && valid) {
        car.deployed = true;
        const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
        for (const s of [1]) { // one cop hops out (light nerf: was two)
          let x = car.x + rx * s * 2.2, z = car.z + rz * s * 2.2;
          if (w.npc.lineClear(car.x, car.z, x, z, 0) === false) { x = car.x - Math.sin(car.yaw) * 3.2; z = car.z - Math.cos(car.yaw) * 3.2; }
          this.spawnCop(p!, { x, z }, true);
        }
        w.emit({ t: "copCar", car: car.id, p: car.target, stage: "deploy" });
      }
      if (valid && Math.hypot(p!.move.x - car.x, p!.move.z - car.z) > 40) { car.mode = "drive"; car.replanT = 0; }
    }
    // steer along the route
    const wp = car.route[0];
    if (car.mode !== "parked" && wp) {
      const dx = wp.x - car.x, dz = wp.z - car.z, dist = Math.hypot(dx, dz);
      if (dist < 2.5 && car.route.length > 1) car.route.shift();
      const want_yaw = Math.atan2(dx, dz);
      let err = want_yaw - car.yaw;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      const turn = 2.6 * dt * Math.min(1, 0.35 + car.v / 6);
      car.yaw += Math.max(-turn, Math.min(turn, err));
      if (Math.abs(err) > 0.5) want = Math.min(want, 6);
      if (car.route.length === 1) want = Math.min(want, Math.max(0, dist * 1.2 - 1));
    } else if (!wp) want = 0;
    car.v = want > car.v ? Math.min(want, car.v + 8 * dt) : Math.max(want, car.v - 14 * dt);
    car.x += Math.sin(car.yaw) * car.v * dt;
    car.z += Math.cos(car.yaw) * car.v * dt;
    this.carCollide(car);
  }

  /** Cop car footprint: wanted bandits get busted on the spot, others get knocked over. */
  private carCollide(car: CopCarSim) {
    const w = this.w;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const inside = (x: number, z: number, pad: number) => {
      const dx = x - car.x, dz = z - car.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      return Math.abs(along) < COPCAR.halfLen + pad && Math.abs(side) < COPCAR.halfWidth + pad ? { along, side } : null;
    };
    for (const p of w.players.values()) {
      if (!p.connected || p.jailT > 0 || p.respawnT > 0 || p.move.y > 1.4) continue;
      const hit = inside(p.move.x, p.move.z, PLAYER.radius);
      if (!hit) continue;
      if (car.v > 3) {
        if (starsOf(p.notoriety) > 0) this.bust(p, car.id, true);
        else w.knockdown(p, car.id);
      } else {
        const s = hit.side >= 0 ? 1 : -1;
        p.move.x += fz * s * 0.1; p.move.z += -fx * s * 0.1;
      }
    }
    for (const n of w.npc.npcs.values()) {
      if (n.kind === "cop") continue;
      const hit = inside(n.move.x, n.move.z, 0.4);
      if (!hit) continue;
      const s = hit.side >= 0 ? 1 : -1;
      w.npc.nudge(n.move, fz * s * 0.25, -fx * s * 0.25);
    }
  }
}
