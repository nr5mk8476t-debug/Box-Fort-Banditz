import { schema, t, type SchemaType } from "@colyseus/schema";
import { MOVE_NUM_KEYS, MOVE_BOOL_KEYS } from "@bfb/shared";

// Everything in here is automatically synced to every client in the room.
// Movement fields are generated from the shared list, so adding a move in `shared/`
// can never forget to sync a field. float64 numbers keep prediction exact.
const moveFields: Record<string, any> = {};
for (const k of MOVE_NUM_KEYS) moveFields[k] = t.number();
for (const k of MOVE_BOOL_KEYS) moveFields[k] = t.boolean();

export const PlayerState = schema({
  name: t.string(),
  colorIdx: t.uint8(),
  connected: t.boolean(),
  /** last input sequence number the server applied for this player */
  lastSeq: t.number(),
  hand: t.string(),
  p0: t.string(),
  p1: t.string(),
  p2: t.string(),
  sel: t.uint8(),
  heat: t.uint8(),
  cash: t.number(),
  bank: t.number(),
  respawnT: t.float32(),
  robT: t.float32(),
  pinOn: t.string(),
  pinBy: t.string(),
  pinS: t.float32(),
  jailT: t.float32(),
  lockSeed: t.number(),
  lockT: t.float32(),
  shop: t.string(),
  ready: t.boolean(),
  hp: t.uint8(),
  aura: t.uint16(),
  tb: t.uint16(),
  rb: t.float32(),
  lg: t.string(),
  ...moveFields,
}, "PlayerState");
export type PlayerState = SchemaType<typeof PlayerState> & Record<string, any>;

export const ItemState = schema({
  type: t.string(),
  value: t.uint16(),
  x: t.float32(),
  y: t.float32(),
  z: t.float32(),
  rot: t.float32(),
  mode: t.string(),
  holder: t.string(),
  holder2: t.string(),
  resting: t.boolean(),
  lock: t.uint8(),
  fort: t.int8(),
  mult: t.uint8(),
  chute: t.boolean(),
  tug: t.float32(),
  uses: t.int8(),
}, "ItemState");
export type ItemState = SchemaType<typeof ItemState> & Record<string, any>;

export const NpcState = schema({
  kind: t.string(),
  x: t.float32(),
  y: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
  state: t.string(),
  target: t.string(),
  robbed: t.boolean(),
}, "NpcState");
export type NpcState = SchemaType<typeof NpcState> & Record<string, any>;

export const PropState = schema({
  ready: t.boolean(),
  hp: t.uint8(),
  alarm: t.boolean(),
}, "PropState");
export type PropState = SchemaType<typeof PropState> & Record<string, any>;

export const CarState = schema({
  x: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
}, "CarState");
export type CarState = SchemaType<typeof CarState> & Record<string, any>;

export const CopCarState = schema({
  x: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
  siren: t.boolean(),
}, "CopCarState");
export type CopCarState = SchemaType<typeof CopCarState> & Record<string, any>;

export const FortRoomState = schema({
  code: t.string(),
  phase: t.string(), // lobby | intro | scavenge | tally | over
  ownerId: t.string(),
  // Phase 3 round loop + city events
  round: t.uint8(),
  rounds: t.uint8(),
  timeLeft: t.float32(),
  results: t.string(),
  evKind: t.string(),
  evStage: t.string(),
  evX: t.float32(),
  evZ: t.float32(),
  evR: t.float32(),
  evT: t.uint8(),
  truckOn: t.boolean(),
  truckX: t.float32(),
  truckZ: t.float32(),
  truckYaw: t.float32(),
  paradeD: t.float32(),
  lightT: t.float32(),
  players: t.map(PlayerState),
  items: t.map(ItemState),
  npcs: t.map(NpcState),
  props: t.map(PropState),
  cars: t.map(CarState),
  copCars: t.map(CopCarState),
}, "FortRoomState");
export type FortRoomState = SchemaType<typeof FortRoomState>;
