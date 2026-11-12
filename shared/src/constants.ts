// Tunable numbers shared by the client (prediction) and the server (authority).
// Changing a value here changes BOTH sides, which keeps them in agreement.

/** Fixed simulation step. Client and server both advance movement in 60 Hz steps. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** How often the server sends state to clients. */
export const PATCH_HZ = 20;

/** Maximum inputs the server will process for one player per server tick (anti speed-hack). */
export const MAX_INPUTS_PER_TICK = 8;

export const MAX_PLAYERS = 4;

// Phase 1 tuning: "weighty & a bit clumsy" (Blake's choice). Momentum matters,
// stopping and turning take a moment, big falls make you stumble.
// D1 (Blake, 1 Oct): faster and snappier: quicker off the mark, sharper stops and turns, still a little skid.
export const PLAYER = {
  radius: 0.38,
  height: 1.7,
  crouchHeight: 1.15,
  eyeHeight: 1.55,
  crouchEyeHeight: 1.0,
  slideEyeHeight: 0.75,

  // R12.9 (Blake, playtest: "a little bit slower... increase the speed by 15%"): walk, sprint, crouch, slide and dodge
  // all +15% (and the police on foot with them, so a chase balances the same)
  walkSpeed: 6.67,
  sprintSpeed: 10.81,
  crouchSpeed: 3.1,
  backwardFactor: 0.75,
  groundAccel: 55.2, // lower = heavier (0 -> walk speed in ~0.12 s)
  groundDecel: 39.1, // stopping from a sprint takes ~0.28 s: a little skid
  turnBoost: 1.6, // D1: pushing against your own momentum (reversing, hard turns) bites this much harder
  airAccel: 8, // limited steering in the air
  gravity: 26,
  jumpSpeed: 7.8,
  stepHeight: 0.4, // curbs lower than this are walked up automatically
  maxFallSpeed: 40,

  // Stamina (0..1). ~8 s of continuous sprint (Blake: 3.5 s ran out too fast), refills in ~2 s.
  staminaDrain: 0.125,
  staminaRegen: 0.5,
  staminaRegenDelay: 0.7,
  windedRecover: 0.35, // after emptying the bar, sprint unlocks again at this level

  // Belly slide: sprint + press crouch
  slideMinSpeed: 8.05,
  slideSpeed: 12.88,
  slideTime: 0.85,
  slideFriction: 6.5,
  slideSteer: 3,
  slideCooldown: 1.0,
  slideStamina: 0.1,

  // Dodge / dive
  dodgeSpeed: 13.8,
  dodgeHop: 3.2,
  dodgeTime: 0.22,
  dodgeCooldown: 1.4,
  dodgeStamina: 0.22,

  // Mantle (climb ledges): ledge top between these heights above your feet
  mantleMin: 0.55,
  mantleMax: 2.05,
  mantleReach: 0.45, // how far in front of you a ledge can be grabbed

  // Comedy stumble after a big fall
  stumbleImpact: 13, // landing faster than this (m/s) = stumble (~3.3 m fall)
  stumbleTime: 0.45,
  stumbleSpeedFactor: 0.35,
} as const;

/** Distinct, colourblind-friendlier player colours (hex). Index = player slot. */
export const PLAYER_COLORS = ["#ff5a3c", "#2fb6ff", "#ffd23c", "#9b5cff"] as const;
export const PLAYER_COLOR_NAMES = ["Hot Sauce", "Pool Blue", "Mustard", "Grape Soda"] as const;

export const NAME_MAX_LENGTH = 16;
