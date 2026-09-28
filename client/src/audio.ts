// All sound is generated in code with the Web Audio API (no audio files, so no licensing issues).
// Nothing plays until the player interacts with the page: browsers require it, and
// we never want to blast sound at someone who just opened a link.

import { settings, onSettingsChange } from "./settings.ts";

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let unlocked = false;
const unlockListeners: (() => void)[] = [];

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, t, 0.03);
  musicBus.gain.setTargetAtTime(settings.musicVolume * 0.55, t, 0.03);
  sfxBus.gain.setTargetAtTime(settings.sfxVolume, t, 0.03);
}

/** Call once at startup. Audio only starts after the first click/key press. */
export function installAudioUnlock(): void {
  const unlock = () => {
    if (unlocked) return;
    try {
      ctx = new AudioContext();
    } catch {
      return; // no audio support: game continues silently
    }
    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    // gentle limiter so stacked sounds never clip harshly
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(comp).connect(ctx.destination);
    master.gain.value = 0;
    applyVolumes();
    unlocked = true;
    void ctx.resume();
    unlockListeners.splice(0).forEach((f) => f());
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  onSettingsChange(applyVolumes);
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function whenAudioUnlocked(f: () => void): void {
  if (unlocked) f();
  else unlockListeners.push(f);
}

// ---------------------------------------------------------------------------
// Sound effects

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, filterFreq: number, when = 0, q = 1) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.003, vol, dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  uiClick() { blip(660, 0.06, "square", 0.12, 880); noise(0.03, 0.08, 3000); },
  uiHover() { blip(520, 0.03, "triangle", 0.05); },
  uiBack() { blip(500, 0.08, "square", 0.1, 300); },
  copied() { blip(780, 0.07, "square", 0.12); blip(1170, 0.1, "square", 0.12, undefined, 0.07); },
  join() { [523, 659, 784].forEach((f, i) => blip(f, 0.12, "triangle", 0.15, undefined, i * 0.07)); },
  error() { blip(220, 0.18, "sawtooth", 0.12, 150); },
  // Phase 0 movement hooks (Phase 1 replaces these with proper footstep sets)
  jump() { blip(300, 0.12, "triangle", 0.1, 520); noise(0.05, 0.05, 1200); },
  land(strength: number) { noise(0.08, Math.min(0.25, 0.08 + strength * 0.02), 400, 0, 0.7); blip(90, 0.08, "sine", 0.15 * Math.min(1, strength / 6)); },
  step(kind: "walk" | "sprint" | "sneak") {
    if (kind === "sneak") { noise(0.035, 0.025, 500, 0, 1.2); return; }
    const sp = kind === "sprint";
    noise(0.045, sp ? 0.1 : 0.065, (sp ? 900 : 700) * (0.9 + Math.random() * 0.25), 0, 1.4);
    if (sp) blip(110 + Math.random() * 20, 0.05, "sine", 0.06); // heavier slap
  },
  /** long cardboard-on-pavement scrape */
  slide() { sweepNoise(0.65, 0.16, 1400, 500); blip(260, 0.12, "triangle", 0.07, 160); },
  /** quick whoosh */
  dodge() { sweepNoise(0.22, 0.14, 700, 2600); },
  /** gibberish "hup!" grunt while hauling yourself up */
  mantle(voicePitch = 1) { voice([0.9, 1.25], voicePitch, 0.07); noise(0.06, 0.05, 900, 0.1); },
  /** out of breath */
  winded(voicePitch = 1) { for (let i = 0; i < 3; i++) { noise(0.14, 0.05, 1600 - i * 200, i * 0.22, 0.8); } voice([0.8], voicePitch * 0.9, 0.05, 0.5); },
  /** cartoon "whoa" slide-whistle down after a big fall */
  stumble() { blip(900, 0.5, "sine", 0.09, 260); noise(0.1, 0.12, 300, 0, 0.7); },
  heavyLand() { noise(0.14, 0.22, 250, 0, 0.6); blip(70, 0.14, "sine", 0.25, 40); },

  // ---- Phase 2: loot ----
  grab() { blip(420, 0.07, "triangle", 0.14, 760); noise(0.04, 0.05, 2200); },
  pocket() { sweepNoise(0.16, 0.08, 1800, 5200); blip(900, 0.05, "square", 0.05, 1300); },
  drop() { noise(0.07, 0.09, 600, 0, 0.8); },
  throw(strength: number) { sweepNoise(0.18 + strength * 0.15, 0.08 + strength * 0.1, 500, 2000 + strength * 1500); },
  whiff() { sweepNoise(0.14, 0.07, 1500, 500); blip(300, 0.08, "triangle", 0.05, 200, 0.04); },
  full() { blip(240, 0.08, "square", 0.07); blip(200, 0.1, "square", 0.07, undefined, 0.09); },
  /** item hits something: sound depends on what it's made of */
  impact(material: string, speed: number, gain = 1) {
    const v = Math.min(1, speed / 12) * gain;
    if (v < 0.05) return;
    switch (material) {
      case "rubber": blip(700 + Math.random() * 200, 0.18, "square", 0.08 * v + 0.03, 1400); break; // squeak!
      case "metal": blip(520 + Math.random() * 80, 0.35, "triangle", 0.1 * v + 0.03); blip(1310, 0.25, "sine", 0.05 * v); noise(0.05, 0.08 * v, 3000); break; // clang
      case "glass": blip(1800, 0.2, "sine", 0.06 * v + 0.02); noise(0.12, 0.1 * v, 4500, 0, 2); break; // tink/crunch
      case "cardboard": noise(0.09, 0.12 * v + 0.03, 350, 0, 0.7); break; // thump
      case "trash": noise(0.12, 0.12 * v + 0.03, 800, 0, 0.5); blip(1600, 0.05, "square", 0.03 * v, undefined, 0.03); break; // jingle-crunch
      default: noise(0.07, 0.1 * v + 0.03, 700, 0, 0.9); blip(160, 0.07, "sine", 0.08 * v);
    }
  },
  bonk() { blip(300, 0.25, "sine", 0.18, 900); blip(900, 0.2, "triangle", 0.08, 300, 0.05); },
  tumble() { noise(0.35, 0.2, 300, 0, 0.6); blip(120, 0.3, "sawtooth", 0.08, 60); },

  // ---- Phase 2.5: punching + pedestrians (all synthesized placeholders) ----
  punchWhoosh() { sweepNoise(0.12, 0.09, 900, 2800); },
  /** cartoon BONK on a pedestrian (gain = distance falloff) */
  punchHit(gain = 1) { blip(240, 0.22, "sine", 0.2 * gain, 700); blip(1200, 0.12, "square", 0.05 * gain, 400, 0.02); noise(0.05, 0.12 * gain, 1500); },
  /** meatier smack for player-vs-player */
  punchPlayer(gain = 1) { noise(0.08, 0.2 * gain, 900, 0, 0.8); blip(160, 0.25, "sine", 0.22 * gain, 520); blip(700, 0.18, "triangle", 0.08 * gain, 250, 0.04); },
  blocked() { blip(1400, 0.08, "square", 0.06); blip(1000, 0.1, "square", 0.05, undefined, 0.06); },
  knockdown() { blip(600, 0.6, "sine", 0.14, 120); noise(0.2, 0.18, 300, 0.15, 0.6); [1568, 1318, 1568].forEach((f, i) => blip(f, 0.08, "triangle", 0.05, undefined, 0.35 + i * 0.1)); },
  ko(gain = 1) { [784, 988, 1175, 1568].forEach((f, i) => blip(f, 0.09, "triangle", 0.08 * gain, undefined, i * 0.06)); },
  /** pedestrian gibberish: kind pitch + gain by distance */
  npcVoice(pitch: number, gain = 1, angry = false) {
    const n = 2 + Math.floor(Math.random() * 3);
    voice(Array.from({ length: n }, () => (angry ? 1.1 : 0.9) + Math.random() * 0.4), pitch, 0.06 * gain);
  },
  scream(gain = 1, pitch = 1) { blip(700 * pitch, 0.5, "sawtooth", 0.035 * gain, 1100 * pitch); voice([1.8, 2.0], pitch * 1.2, 0.03 * gain, 0.05); },
  slapWindup(gain = 1) { sweepNoise(0.3, 0.05 * gain, 400, 1600); },
  cameraFlash() { noise(0.04, 0.15, 5000); blip(2600, 0.05, "square", 0.05, undefined, 0.02); blip(4000, 0.25, "sine", 0.03, 2000, 0.05); },
  coo(gain = 1) { for (let i = 0; i < 3; i++) blip(300 + Math.random() * 60, 0.18, "sine", 0.07 * gain, 240, i * 0.14 + Math.random() * 0.05); },
  mimeBox() { blip(200, 0.12, "square", 0.06, 180); blip(200, 0.12, "square", 0.06, 180, 0.2); noise(0.04, 0.06, 2000, 0.4); },
  // ---- Phase 3: round loop + city events (synthesized placeholders) ----
  roundIntro() { [392, 523, 659].forEach((f, i) => blip(f, 0.16, "square", 0.08, undefined, i * 0.12)); },
  roundStart() { [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.14, "square", 0.1, undefined, i * 0.08)); noise(0.3, 0.08, 3000, 0.3); },
  hurry() { for (let i = 0; i < 3; i++) blip(880, 0.12, "sawtooth", 0.07, 660, i * 0.2); },
  tick(urgent = false) { blip(urgent ? 1320 : 990, 0.05, "square", urgent ? 0.09 : 0.05); },
  timeUp() { blip(1800, 0.5, "sine", 0.12, 1500); blip(1800, 0.3, "sine", 0.1, 1500, 0.55); },
  cash() { blip(1568, 0.06, "square", 0.08); blip(2093, 0.18, "square", 0.08, undefined, 0.06); noise(0.08, 0.06, 5000, 0.02); },
  lost() { [392, 330, 262].forEach((f, i) => blip(f, 0.22, "triangle", 0.1, f * 0.9, i * 0.18)); },
  truckHorn() { blip(233, 0.5, "sawtooth", 0.1); blip(277, 0.5, "sawtooth", 0.08); blip(233, 0.6, "sawtooth", 0.1, undefined, 0.65); blip(277, 0.6, "sawtooth", 0.08, undefined, 0.65); },
  rumble(gain = 1) { noise(0.32, 0.12 * gain, 140, 0, 0.7); },
  plane() { sweepNoise(2.5, 0.06, 300, 900); blip(110, 2.2, "sawtooth", 0.03, 140); },
  happyHour() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => blip(f, 0.1, "triangle", 0.09, undefined, i * 0.09)); },
  chitter(gain = 1) { for (let i = 0; i < 5; i++) blip(1800 + Math.random() * 900, 0.04, "square", 0.04 * gain, 2600, i * 0.06); },
  // ---- Phase 3.5: loot sources, hold-ups, traffic ----
  search(gain = 1) { noise(0.35, 0.14 * gain, 900, 0, 0.6); blip(140, 0.12, "square", 0.06 * gain, 90, 0.05); noise(0.1, 0.1 * gain, 3000, 0.3); },
  smash(kind: string, gain = 1) {
    if (kind === "car" || kind === "vending" || kind === "phone") { noise(0.3, 0.2 * gain, 5200, 0, 2); blip(2400, 0.2, "triangle", 0.06 * gain, 1200, 0.02); }
    blip(kind === "meter" ? 900 : 300, 0.2, "square", 0.08 * gain, kind === "meter" ? 600 : 160);
    noise(0.08, 0.14 * gain, 900, 0, 0.8);
  },
  alarm(kind: string, gain = 1) {
    const n = kind === "car" ? 8 : 6;
    for (let i = 0; i < n; i++) blip(i % 2 ? 1320 : 990, 0.18, "square", 0.05 * gain, undefined, i * 0.25);
  },
  robStart() { blip(220, 0.4, "sawtooth", 0.07, 330); },
  crash(gain = 1) { noise(0.5, 0.3 * gain, 600, 0, 0.6); blip(90, 0.4, "sine", 0.25 * gain, 40); sweepNoise(0.4, 0.1 * gain, 3000, 400); [1568, 1318, 1568].forEach((f, i) => blip(f, 0.08, "triangle", 0.05 * gain, undefined, 0.5 + i * 0.1)); },
  respawn() { [392, 523, 659].forEach((f, i) => blip(f, 0.1, "triangle", 0.09, undefined, i * 0.07)); },
  honk(gain = 1) { blip(370, 0.35, "square", 0.08 * gain); blip(440, 0.35, "square", 0.06 * gain); },
  engine(gain = 1) { noise(0.38, 0.07 * gain, 220, 0, 0.8); blip(70, 0.35, "sawtooth", 0.03 * gain, 75); },
  bigShot() { [784, 988, 1175, 1568].forEach((f, i) => blip(f, 0.12, "square", 0.08, undefined, i * 0.07)); noise(0.1, 0.06, 5000, 0.3); blip(2093, 0.25, "triangle", 0.08, undefined, 0.35); },
  // ---- Phase 4: police + jail
  /** one "wee-woo" of a siren (call about every 0.9 s while a cruiser is near) */
  siren(gain = 1) { blip(700, 0.42, "square", 0.045 * gain, 1000); blip(1000, 0.42, "square", 0.045 * gain, 700, 0.45); },
  whistle(gain = 1) { blip(2400, 0.12, "sine", 0.12 * gain, 2600); blip(2400, 0.35, "sine", 0.12 * gain, 2500, 0.16); },
  radio() { noise(0.25, 0.05, 2400, 0, 0.5); blip(1200, 0.05, "square", 0.04, undefined, 0.26); },
  cuffs() { blip(1800, 0.05, "square", 0.08); noise(0.05, 0.1, 5000, 0.02); blip(1400, 0.06, "square", 0.08, undefined, 0.12); noise(0.05, 0.1, 5000, 0.13); },
  cellDoor() { noise(0.4, 0.2, 400, 0, 0.6); blip(110, 0.5, "sawtooth", 0.1, 60); blip(1200, 0.08, "square", 0.05, undefined, 0.35); },
  pickTick() { blip(2200 + Math.random() * 300, 0.02, "square", 0.03); },
  pickSet() { blip(1400, 0.04, "square", 0.1); noise(0.03, 0.08, 4000); blip(700, 0.08, "triangle", 0.07, 500, 0.03); },
  pickSlip() { sweepNoise(0.18, 0.1, 3000, 800); blip(300, 0.12, "sawtooth", 0.06, 180); },
  pickDrop() { for (let i = 0; i < 4; i++) blip(1600 - i * 200, 0.04, "square", 0.05, undefined, i * 0.05); },
  guard() { voice([0.7, 0.9, 0.6], 0.8, 0.09, 0.02); blip(180, 0.3, "sawtooth", 0.08, 140); },
  unlock() { blip(900, 0.05, "square", 0.1); blip(600, 0.3, "triangle", 0.1, 1200, 0.06); [784, 988, 1318].forEach((f, i) => blip(f, 0.1, "triangle", 0.09, undefined, 0.3 + i * 0.08)); },
  // ---- Phase 5A
  raidAlarm() { for (let i = 0; i < 4; i++) { blip(1100, 0.16, "square", 0.09, 700, i * 0.34); blip(700, 0.16, "square", 0.09, 1100, i * 0.34 + 0.17); } },
  /** C1: the raid siren wailing across Tent Town (g = loudness by distance) */
  raidSiren(g = 1) { for (let i = 0; i < 3; i++) blip(620, 0.55, "sawtooth", 0.07 * g, 1250, i * 0.6); },
  tugStart() { blip(180, 0.25, "sawtooth", 0.1, 260); voice([0.8, 1.1], 0.9, 0.06); },
  tugPull() { blip(160 + Math.random() * 40, 0.06, "triangle", 0.07, 220); noise(0.04, 0.05, 900); },
  tugWin() { [523, 784, 1046].forEach((f, i) => blip(f, 0.1, "square", 0.09, undefined, i * 0.07)); },
  taserAim() { blip(2600, 0.5, "sine", 0.05, 3200); blip(60, 0.3, "square", 0.03); },
  zap(gain = 1) { for (let i = 0; i < 6; i++) { noise(0.05, 0.14 * gain, 3000 + Math.random() * 3000, i * 0.07, 0.5); blip(80 + Math.random() * 60, 0.05, "sawtooth", 0.08 * gain, undefined, i * 0.07); } },
  nightfall() { [330, 294, 262, 196].forEach((f, i) => blip(f, 0.35, "triangle", 0.07, f * 0.98, i * 0.22)); },
  shopBell() { blip(2093, 0.4, "sine", 0.1, 2080); blip(2637, 0.5, "sine", 0.07, 2620, 0.12); },
  haggleUp() { blip(523, 0.08, "square", 0.08); blip(784, 0.12, "square", 0.08, undefined, 0.08); },
  offended() { voice([0.6, 0.5], 0.7, 0.09); blip(200, 0.35, "sawtooth", 0.08, 120); },
    dodgeNpc(gain = 1) { sweepNoise(0.2, 0.08 * gain, 2400, 600); blip(500, 0.1, "triangle", 0.05 * gain, 900, 0.08); },
};

/** Rising "wind-up" tone while charging a throw. Returns a function that stops it. */
export function chargeTone(): () => void {
  if (!ctx) return () => {};
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(220, t);
  o.frequency.linearRampToValueAtTime(660, t + 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
  o.connect(g).connect(sfxBus);
  o.start(t);
  return () => {
    if (!ctx) return;
    const n = ctx.currentTime;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(g.gain.value, n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.05);
    o.stop(n + 0.08);
  };
}

/** filtered noise whose pitch sweeps from f0 to f1 */
function sweepNoise(dur: number, vol: number, f0: number, f1: number) {
  if (!ctx) return;
  noise(0.001, 0.0001, 1000); // make sure the noise buffer exists
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf!;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.02, vol, dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.05);
}

/**
 * Gibberish voice: a few short vowel-ish syllables (sawtooth through two formant filters).
 * Each player gets a different voicePitch so everyone sounds distinct.
 */
function voice(syllables: number[], pitch: number, vol: number, delay = 0) {
  if (!ctx) return;
  let t = ctx.currentTime + delay;
  for (const syl of syllables) {
    const dur = 0.09 + Math.random() * 0.05;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const f0 = 190 * pitch * syl;
    o.frequency.setValueAtTime(f0 * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
    const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 700 + Math.random() * 300; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1300 + Math.random() * 600; f2.Q.value = 6;
    const g = ctx.createGain();
    env(g, t, 0.01, vol, dur);
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    g.connect(sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
    t += dur * 0.9;
  }
}

// ---------------------------------------------------------------------------
// Title music: a small generated funky loop. Placeholder until the music pass (Phase 8).

let musicTimer: number | null = null;
let musicStep = 0;
let nextNoteTime = 0;

const BPM = 104;
const STEP = 60 / BPM / 4; // 16th notes
// bass pattern (semitones from A1, null = rest), 32 steps
const BASS = [0, null, 0, 12, null, 0, null, 10, 7, null, 7, null, 5, null, 3, null,
  0, null, 0, 12, null, 0, null, 10, 12, null, 10, null, 7, 5, 3, null];
const CHORDS = [[12, 15, 19], [12, 15, 19], [10, 14, 17], [8, 12, 15]];

function note(semi: number, base: number) {
  return base * Math.pow(2, semi / 12);
}

function scheduleMusicStep(step: number, t: number) {
  if (!ctx) return;
  const s = step % 32;
  const bar = Math.floor(step / 32) % 4;
  const b = BASS[s];
  if (b !== null) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.value = note(b + (bar === 2 ? -2 : bar === 3 ? -4 : 0), 55);
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + STEP * 1.6);
    env(g, t, 0.005, 0.22, STEP * 1.6);
    o.connect(f).connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + STEP * 2);
  }
  // off-beat "chk" chord stabs
  if (s % 8 === 4) {
    for (const c of CHORDS[bar]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = note(c, 220);
      env(g, t, 0.004, 0.035, STEP * 0.9);
      o.connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + STEP);
    }
  }
  // drums: kick, snare, hats
  if (s % 8 === 0 || s === 22) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env(g, t, 0.002, 0.5, 0.14);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.2);
  }
  if (s % 8 === 4 && noiseBuf) {
    playNoiseAt(t, 0.12, 0.18, 1800);
  }
  if (s % 2 === 0) playNoiseAt(t, 0.025, s % 4 === 2 ? 0.07 : 0.035, 8000);
}

function playNoiseAt(t: number, dur: number, vol: number, freq: number) {
  if (!ctx || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = freq > 5000 ? "highpass" : "bandpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  env(g, t, 0.002, vol, dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export function startTitleMusic(): void {
  whenAudioUnlocked(() => {
    if (!ctx || musicTimer !== null) return;
    if (!noiseBuf) noise(0.001, 0.0001, 1000); // builds the shared noise buffer
    musicStep = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = window.setInterval(() => {
      if (!ctx) return;
      while (nextNoteTime < ctx.currentTime + 0.2) {
        scheduleMusicStep(musicStep++, nextNoteTime);
        nextNoteTime += STEP;
      }
    }, 50);
  });
}

export function stopMusic(): void {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
