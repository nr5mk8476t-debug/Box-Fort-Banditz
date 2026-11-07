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
/** R12.4 (clips with sound): when sounds are rendered offline, each is placed at its game time */
let tOff = 0;
const now = () => ctx!.currentTime + tOff;

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
  if (!(peak > 0.0001)) peak = 0.0001; // (C5c.3: a sound faded right out must never be 0 here: that throws and stops the frame)
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0) {
  if (!ctx) return;
  const t = now() + when;
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
let sprayHiss: AudioBufferSourceNode | null = null;
function noise(dur: number, vol: number, filterFreq: number, when = 0, q = 1): AudioBufferSourceNode | null {
  if (!ctx) return null;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = now() + when;
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
  return src;
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
  /** R12.1: the pint: pouring at the tap, a gulp (glug glug), the pub cheering a split G */
  pour() { noise(0.9, 0.05, 900, 0, 0.8); blip(180, 0.5, "sine", 0.04, 120, 0.1); },
  gulp(on: boolean) { if (on) for (let i = 0; i < 4; i++) blip(150 + i * 12, 0.09, "sine", 0.12, 90, i * 0.32); else blip(320, 0.08, "sine", 0.06, 500); },
  // R12.4: Split the G: a swallow every ~0.42 s while you drink (deeper as the glass empties), the glass set down on
  // the bar, the head settling (a soft fizz), and the result's sting (perfect: a bright run; close: "ooh"; miss: a groan)
  swallow(k = 0) { const f = 175 - Math.min(40, k * 4); blip(f, 0.13, "sine", 0.14, f * 0.55); noise(0.07, 0.05, 520, 0.02, 1.2); blip(900, 0.04, "sine", 0.025, 1500, 0.09); },
  glassDown() { blip(140, 0.06, "sine", 0.12, 90); noise(0.03, 0.08, 1300, 0, 1.5); blip(2100, 0.07, "triangle", 0.035, undefined, 0.01); blip(3150, 0.1, "sine", 0.02, undefined, 0.012); noise(0.6, 0.03, 6500, 0.06, 0.6); },
  pintResult(grade: string) {
    if (grade === "perfect") [784, 988, 1175, 1568].forEach((f, i) => blip(f, 0.14, "triangle", 0.09, undefined, i * 0.07));
    else if (grade === "close") { blip(520, 0.35, "triangle", 0.06, 430); blip(392, 0.4, "triangle", 0.05, 330, 0.12); noise(0.5, 0.04, 900, 0, 0.6); }
    else { blip(260, 0.5, "sawtooth", 0.035, 150); noise(0.6, 0.05, 500, 0.05, 0.6); }
  },
  cheer(g = 1) { noise(1.4, 0.16 * g, 1200, 0, 0.5); noise(1.0, 0.1 * g, 2400, 0.15, 0.7); for (let i = 0; i < 5; i++) blip(380 + i * 70, 0.2, "triangle", 0.05 * g, 520 + i * 90, 0.05 + i * 0.12); },
  /** R12.2b: the jukebox: a clunk and a needle drop */
  // R12.3: the pub's games (quiet: it's a pub, not an arcade)
  // R12.4: pool and darts with more body: the cue tip's woody "tock", the hard phenolic click of the balls (bright, two
  // partials), a dull rubber thump off the cushions, the drop into the pocket and the rattle down the return; the dart's
  // whoosh, its thwack into the sisal, a little ding for a treble, a double or the bull, a clatter off the wall for a miss
  cueStrike(power = 1) { blip(1150, 0.035, "triangle", 0.07 + 0.08 * power, 700); blip(430, 0.06, "sine", 0.06 + 0.07 * power, 300); noise(0.02, 0.05 + 0.07 * power, 3200, 0, 2); },
  ballClick(speed = 1) { const g = Math.min(1, speed / 3); if (g < 0.04) return; blip(2900 + Math.random() * 400, 0.035, "sine", 0.12 * g, 2600); blip(5300 + Math.random() * 500, 0.02, "sine", 0.04 * g); noise(0.012, 0.06 * g, 6000, 0, 2); },
  cushion(speed = 1) { const g = Math.min(1, speed / 3); if (g < 0.05) return; blip(120, 0.08, "sine", 0.13 * g, 80); noise(0.05, 0.06 * g, 600, 0, 0.8); },
  pocketDrop() { blip(220, 0.07, "sine", 0.1, 150); noise(0.06, 0.08, 800, 0, 1.5); for (let i = 0; i < 3; i++) blip(330 - i * 40, 0.04, "triangle", 0.05 - i * 0.012, undefined, 0.1 + i * 0.09); noise(0.3, 0.04, 420, 0.12, 0.7); },
  dartThunk(gain = 1) { noise(0.025, 0.16 * gain, 2400, 0, 1.2); blip(260, 0.07, "sine", 0.12 * gain, 180); noise(0.08, 0.05 * gain, 700, 0.01, 0.8); },
  dartSting(label: string, gain = 1) {
    if (label === "MISS") { noise(0.05, 0.1 * gain, 900, 0, 0.8); for (let i = 0; i < 3; i++) blip(1700 - i * 300, 0.05, "triangle", 0.03 * gain, undefined, 0.04 + i * 0.07); }
    else if (label === "BULL") [1318, 1760, 2093].forEach((f, i) => blip(f, 0.16, "sine", 0.07 * gain, undefined, 0.03 + i * 0.07));
    else if (/^[TD]/.test(label) || label === "25") { blip(label[0] === "T" ? 1568 : 1318, 0.18, "sine", 0.06 * gain, undefined, 0.03); }
  },
  dartLand(label: string, gain = 1) { if (label !== "MISS") sfx.dartThunk(gain); sfx.dartSting(label, gain); },
  dartWhoosh() { sweepNoise(0.16, 0.05, 2600, 700); },
  checkout() { [659, 784, 988, 1318].forEach((f, i) => blip(f, 0.12, "triangle", 0.07, undefined, i * 0.08)); },
  juke() { blip(120, 0.12, "square", 0.08, 80); noise(0.08, 0.08, 2400, 0.1); blip(880, 0.08, "triangle", 0.05, 1320, 0.2); },
  cash() { blip(1568, 0.06, "square", 0.08); blip(2093, 0.18, "square", 0.08, undefined, 0.06); noise(0.08, 0.06, 5000, 0.02); },
  lost() { [392, 330, 262].forEach((f, i) => blip(f, 0.22, "triangle", 0.1, f * 0.9, i * 0.18)); },
  truckHorn() { blip(233, 0.5, "sawtooth", 0.1); blip(277, 0.5, "sawtooth", 0.08); blip(233, 0.6, "sawtooth", 0.1, undefined, 0.65); blip(277, 0.6, "sawtooth", 0.08, undefined, 0.65); },
  rumble(gain = 1) { noise(0.32, 0.12 * gain, 140, 0, 0.7); },
  plane() { sweepNoise(2.5, 0.06, 300, 900); blip(110, 2.2, "sawtooth", 0.03, 140); },
  happyHour() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => blip(f, 0.1, "triangle", 0.09, undefined, i * 0.09)); },
  chitter(gain = 1) { for (let i = 0; i < 5; i++) blip(1800 + Math.random() * 900, 0.04, "square", 0.04 * gain, 2600, i * 0.06); },
  // ---- Phase 3.5: loot sources, hold-ups, traffic ----
  search(gain = 1) { noise(0.35, 0.14 * gain, 900, 0, 0.6); blip(140, 0.12, "square", 0.06 * gain, 90, 0.05); noise(0.1, 0.1 * gain, 3000, 0.3); },
  // C4b: spray paint: a rattle, then a hiss while you hold it (cut short if you let go)
  spray(gain = 1) {
    for (let i = 0; i < 3; i++) blip(2600, 0.03, "square", 0.03 * gain, 1800, i * 0.07);
    sprayHiss?.stop(); sprayHiss = noise(1.6, 0.09 * gain, 6500, 0.22, 0.7);
  },
  sprayStop() { try { sprayHiss?.stop(); } catch { /* already done */ } sprayHiss = null; },
  // C5b: Chinatown: the parade's drum and gong, firecrackers, a seafood tank bursting
  drum(gain = 1) { blip(80, 0.18, "sine", 0.22 * gain, 50); noise(0.06, 0.08 * gain, 300); },
  gong() { [98, 147, 196].forEach((f, i) => blip(f, 2.2, "sine", 0.1, f * 0.97, i * 0.01)); noise(0.4, 0.05, 2500); },
  firecracker(gain = 1) { for (let i = 0; i < 9; i++) noise(0.04, 0.2 * gain, 4000, i * 0.07 + Math.random() * 0.04, 2); },
  // C5c: the bank heist + golden stashes
  drill(gain = 1) { blip(180 + Math.random() * 30, 0.4, "sawtooth", 0.05 * gain, 220); noise(0.35, 0.1 * gain, 4200, 0, 2); },
  vault(gain = 1) { noise(0.6, 0.2 * gain, 250, 0, 0.6); blip(70, 0.8, "sine", 0.2 * gain, 45); [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.14, "triangle", 0.08 * gain, undefined, 0.6 + i * 0.08)); },
  stash(gain = 1) { [1318, 1568, 2093, 2637].forEach((f, i) => blip(f, 0.12, "sine", 0.08 * gain, undefined, i * 0.06)); noise(0.2, 0.04 * gain, 7000, 0.2); },
  // C5c.2: Le Dumpstère's grand piano, played badly
  // C5c.3: THE COMPACTOR: the bass drum (and a hat) through the walls, THE DROP, a record scratch; PAWN-O-RAMA's case
  kick(gain = 1) { blip(110, 0.16, "sine", 0.3 * gain, 42); noise(0.03, 0.05 * gain, 900); },
  hat(gain = 1) { noise(0.03, 0.04 * gain, 9000); },
  clubDrop(gain = 1) { sweepNoise(1.2, 0.08 * gain, 400, 6000); blip(55, 0.9, "sine", 0.4 * gain, 30, 1.0); noise(0.5, 0.3 * gain, 200, 1.0, 0.6); [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.12, "square", 0.05 * gain, undefined, 1.05 + i * 0.05)); for (let i = 0; i < 6; i++) noise(0.25, 0.05 * gain, 1500 + i * 300, 1.1 + i * 0.07, 0.5); },
  scratch(gain = 1) { for (let i = 0; i < 4; i++) sweepNoise(0.09, 0.12 * gain, i % 2 ? 3000 : 600, i % 2 ? 600 : 3000); blip(180, 0.4, "sawtooth", 0.06 * gain, 90, 0.36); },
  glass(gain = 1) { for (let i = 0; i < 7; i++) blip(2400 + Math.random() * 2400, 0.12, "triangle", 0.05 * gain, 1800, i * 0.035); noise(0.3, 0.2 * gain, 5200, 0, 1.5); },
  piano(gain = 1) { [262, 330, 392, 311, 523, 247, 440, 349].forEach((f, i) => { blip(f, 0.35, "triangle", 0.09 * gain, f * 0.995, i * 0.16); blip(f * 2, 0.2, "sine", 0.03 * gain, undefined, i * 0.16); }); },
  // C5a: the lobby mini-games
  target(pts: number, gain = 1) { noise(0.06, 0.12 * gain, 2200); blip(pts === 3 ? 1318 : 880, 0.08, "square", 0.08 * gain); if (pts === 3) blip(1760, 0.14, "square", 0.08 * gain, undefined, 0.08); },
  gameStart() { [392, 523, 659].forEach((f, i) => blip(f, 0.1, "square", 0.08, undefined, i * 0.12)); blip(1046, 0.3, "square", 0.08, undefined, 0.4); },
  checkpoint() { blip(988, 0.07, "triangle", 0.1); blip(1318, 0.1, "triangle", 0.1, undefined, 0.07); },
  gameDone() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => blip(f, 0.1, "triangle", 0.1, undefined, i * 0.09)); },
  // C4b: the old lady yelling out of her window
  oldLady(gain = 1) { [620, 540, 700, 480].forEach((f, i) => blip(f, 0.12, "sawtooth", 0.05 * gain, f * 0.8, i * 0.14)); },
  smash(kind: string, gain = 1) {
    // C4a: glass shatters, wood cracks, a hydrant clanks
    if (kind === "shopglass" || kind === "busstop") { noise(0.5, 0.28 * gain, 6000, 0, 3); [2637, 3136, 2349, 3520].forEach((f, i) => blip(f, 0.12, "triangle", 0.05 * gain, undefined, 0.05 + i * 0.07)); return; }
    if (kind === "bench" || kind === "pallet" || kind === "table") { noise(0.18, 0.22 * gain, 1400, 0, 1); blip(180, 0.15, "square", 0.08 * gain, 90); return; }
    if (kind === "fishtank") { noise(0.4, 0.25 * gain, 5000, 0, 3); noise(1.0, 0.12 * gain, 900, 0.1, 0.5); return; } // (glass, then a big splash)
    if (kind === "hydrant") { blip(520, 0.3, "square", 0.08 * gain, 260); noise(1.2, 0.12 * gain, 2500, 0.1, 0.5); return; }
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
  /** D1: hit by a car: a cartoon crunch, a spring BOING and a slide-whistle up as you fly */
  splat(gain = 1) { noise(0.3, 0.28 * gain, 500, 0, 0.6); blip(80, 0.3, "sine", 0.25 * gain, 40); blip(300, 0.45, "square", 0.08 * gain, 900, 0.05); blip(500, 0.7, "sine", 0.1 * gain, 1700, 0.15); [1568, 1318, 1568, 1318].forEach((f, i) => blip(f, 0.08, "triangle", 0.05 * gain, undefined, 0.9 + i * 0.1)); },
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
  /** C1.1: falling in the canal */
  splash(g = 1) { sweepNoise(0.45, 0.14 * g, 3000, 300); blip(180, 0.2, "sine", 0.06 * g, 90, 0.05); },
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
  const t = now();
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
  let t = now() + delay;
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

// ---------------------------------------------------------------------------
// R11: NEON FEVER DREAM's set: big-room house at 128 BPM, made in code. It runs off the city clock (the same moment
// for everybody), so the floor's lights and the DROP land on the music: 16 bars of groove, an 8-bar build (snare
// roll, riser, the kick drops out), 16 bars of DROP (supersaw stabs, a lead riff, rolling bass), round and round.
// Through the walls it's a muffled thump (a low-pass filter); inside it's the whole thing.
const FV_BPM = 128, FV_16 = 60 / FV_BPM / 4, FV_BAR = FV_16 * 16;
const FV_PARTS = { groove: 16, build: 8, drop: 16 }, FV_CYCLE_BARS = FV_PARTS.groove + FV_PARTS.build + FV_PARTS.drop;
// A minor: Am F C G (semitones from A2)
const FV_CHORDS = [[12, 15, 19], [8, 12, 15], [3, 7, 10], [10, 14, 17]];
const FV_ROOTS = [0, -4, 3, -2];
const FV_LEAD = [24, null, 27, 24, null, 31, null, 29, 27, null, 24, null, 22, null, 24, null]; // (a 1-bar hook, over the chords)
let fvBus: GainNode | null = null, fvFilter: BiquadFilterNode | null = null, fvTimer: number | null = null;
let fvClockAt = 0, fvCtxAt = 0, fvNextStep = -1, fvIdle = 0;

function fvOut(): AudioNode | null {
  if (!ctx) return null;
  if (!fvBus) {
    fvFilter = ctx.createBiquadFilter(); fvFilter.type = "lowpass"; fvFilter.frequency.value = 400; fvFilter.Q.value = 0.7;
    fvBus = ctx.createGain(); fvBus.gain.value = 0;
    fvFilter.connect(fvBus).connect(musicBus);
  }
  return fvFilter;
}
function fvOsc(type: OscillatorType, f: number, t: number, dur: number, vol: number, out: AudioNode, slideTo?: number, detune = 0, cut?: [number, number]) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  env(g, t, 0.004, vol, dur);
  if (cut) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(cut[0], t); fl.frequency.exponentialRampToValueAtTime(cut[1], t + dur); o.connect(fl).connect(g); } else o.connect(g);
  g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function fvNoise(t: number, dur: number, vol: number, type: BiquadFilterType, f: number, out: AudioNode, f1?: number) {
  if (!ctx || !noiseBuf) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.002, vol, dur);
  src.connect(fl).connect(g).connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
/** one 16th of the set (step = 16ths since the city clock's zero) at audio time t */
function fvStep(step: number, t: number) {
  const out = fvOut();
  if (!out) return;
  const s = ((step % (FV_CYCLE_BARS * 16)) + FV_CYCLE_BARS * 16) % (FV_CYCLE_BARS * 16);
  const bar = Math.floor(s / 16), i = s % 16;
  const part = bar < FV_PARTS.groove ? "groove" : bar < FV_PARTS.groove + FV_PARTS.build ? "build" : "drop";
  const pb = part === "groove" ? bar : part === "build" ? bar - FV_PARTS.groove : bar - FV_PARTS.groove - FV_PARTS.build;
  const ch = Math.floor(bar / 2) % 4;
  const root = 55 * Math.pow(2, FV_ROOTS[ch] / 12);
  const quarter = i % 4 === 0, off = i % 4 === 2;
  const buildK = part === "build" ? (pb * 16 + i) / (FV_PARTS.build * 16) : 0;
  const kickOn = part !== "build" || pb < 4;
  // the kick: four to the floor (a fat one on the drop)
  if (kickOn && quarter) { fvOsc("sine", part === "drop" ? 160 : 140, t, 0.22, part === "drop" ? 0.9 : 0.7, out, 42); fvNoise(t, 0.02, 0.15, "highpass", 3000, out); }
  // the clap on 2 and 4; the build's snare roll (4ths, 8ths, 16ths, then 32nds, rising)
  if (part !== "build" && (i === 4 || i === 12)) fvNoise(t, 0.14, 0.32, "bandpass", 1500, out);
  if (part === "build") {
    const every = buildK < 0.25 ? 4 : buildK < 0.5 ? 2 : 1;
    if (i % every === 0 && !(pb === FV_PARTS.build - 1 && i >= 12)) { fvNoise(t, 0.08, 0.1 + buildK * 0.3, "bandpass", 1400 + buildK * 2200, out); if (buildK > 0.75) fvNoise(t + FV_16 / 2, 0.06, 0.1 + buildK * 0.25, "bandpass", 2600, out); }
    if (i === 0 && pb % 2 === 0) fvNoise(t, FV_BAR * 2, 0.04 + buildK * 0.12, "bandpass", 300 + buildK * 3000, out, 1200 + buildK * 9000); // (the riser)
    if (i === 0) fvOsc("sawtooth", 220 * Math.pow(2, buildK * 2), t, FV_BAR, 0.025 + buildK * 0.03, out, 220 * Math.pow(2, buildK * 2 + 0.25), 0, [800, 4000]);
  }
  // hats: closed 16ths (louder on the drop), open on the offbeats
  if (part !== "build" || buildK < 0.9) { if (i % 2 === 1 || part === "drop") fvNoise(t, 0.02, part === "drop" ? 0.06 : 0.035, "highpass", 9000, out); if (off) fvNoise(t, 0.09, part === "groove" && pb < 4 ? 0.03 : 0.07, "highpass", 7000, out); }
  // the bass: offbeat pump on the groove; rolling 16ths (side-chained to the kick) on the drop
  if (part === "groove" && off) fvOsc("sawtooth", root, t, FV_16 * 1.6, 0.22, out, undefined, 0, [1200, 250]);
  if (part === "drop" && !quarter) fvOsc("sawtooth", root * (i % 4 === 3 ? 2 : 1), t, FV_16 * 0.9, i % 4 === 2 ? 0.26 : 0.17, out, undefined, 0, [2200, 300]);
  // chords: a soft filtered pad on the groove (once a bar), big detuned supersaw stabs on the drop's offbeats
  const notes = FV_CHORDS[ch].map((n) => 110 * Math.pow(2, n / 12));
  if (part === "groove" && i === 0 && pb >= 4) for (const f of notes) for (const dt of [-12, 12]) fvOsc("sawtooth", f, t, FV_BAR * 0.95, 0.018, out, undefined, dt, [700 + pb * 60, 500]);
  if (part === "build" && i % 4 === 2) for (const f of notes) fvOsc("sawtooth", f, t, FV_16 * 1.2, 0.02 + buildK * 0.04, out, undefined, 7, [1000 + buildK * 5000, 800]);
  if (part === "drop" && (off || (pb % 4 === 3 && i === 14))) for (const f of notes) for (const dt of [-18, -6, 6, 18]) fvOsc("sawtooth", f, t, FV_16 * 1.7, 0.026, out, undefined, dt, [6500, 1400]);
  // the lead hook on the drop (an octave up for the last 8 bars)
  if (part === "drop") { const n = FV_LEAD[i]; if (n !== null) fvOsc("square", 110 * Math.pow(2, (n + (pb >= 8 ? 12 : 0) + FV_ROOTS[ch] * 0) / 12), t, FV_16 * 0.9, 0.05, out, undefined, 0, [5000, 1500]); }
  // THE DROP: a sub boom and a crash on its first beat; a gap of silence just before it
  if (part === "drop" && pb === 0 && i === 0) { fvOsc("sine", 90, t, 1.4, 1.0, out, 28); fvNoise(t, 1.6, 0.25, "highpass", 4000, out); fvNoise(t, 0.5, 0.3, "lowpass", 300, out); }
}
/** R11: call every frame. clock: the city clock (s); gain 0..1 (0: far away); cutoff: Hz (muffled through walls ~350) */
export function feverMusic(clock: number, gain: number, cutoff: number): void {
  if (!ctx || !unlocked) return;
  if (!noiseBuf) noise(0.001, 0.0001, 1000);
  const out = fvOut();
  if (!out || !fvBus || !fvFilter) return;
  const now = ctx.currentTime;
  fvBus.gain.setTargetAtTime(Math.max(0, gain), now, 0.15);
  fvFilter.frequency.setTargetAtTime(Math.max(120, cutoff), now, 0.2);
  // keep the music's clock locked to the city's (jumps when the city clock does)
  const predicted = fvClockAt + (now - fvCtxAt);
  if (fvNextStep < 0 || Math.abs(predicted - clock) > 0.12) { fvClockAt = clock; fvCtxAt = now; fvNextStep = Math.ceil((clock + 0.05) / FV_16); }
  if (gain <= 0.001) { fvIdle += 1; if (fvIdle > 120 && fvTimer !== null) { clearInterval(fvTimer); fvTimer = null; fvNextStep = -1; } return; }
  fvIdle = 0;
  if (fvTimer === null) fvTimer = window.setInterval(() => {
    if (!ctx) return;
    const n2 = ctx.currentTime, clk = fvClockAt + (n2 - fvCtxAt);
    while (fvNextStep * FV_16 < clk + 0.25) {
      const at = fvCtxAt + (fvNextStep * FV_16 - fvClockAt);
      if (at > n2 - 0.02) fvStep(fvNextStep, Math.max(n2, at));
      fvNextStep++;
    }
  }, 40);
}

// ---------------------------------------------------------------------------
// R12.1: THE SOGGY SHAMROCK's session: THE RUSTY BIN LIDS playing an original jig ("The Bin Lid Jig") in D, 6/8 at
// 116 dotted crotchets a minute: tin whistle and fiddle on the tune (the fiddle an octave down, a hair behind), the
// banjo vamping the chords, the bodhrán's lilt (a deep thump on 1 and 4, light taps between). AABB, 32 bars, round and
// round off the city clock. Through the walls it's muffled; inside it's the lot.
const PB_8 = 60 / 116 / 3, PB_BAR = PB_8 * 6;
type PbBar = (number | null)[];
const PB_A: PbBar[] = [[0, 4, 7, 7, 4, 7], [9, 7, 4, 5, 2, -1], [0, 4, 7, 12, 7, 4], [5, 9, 5, 4, 2, 0], [0, 4, 7, 7, 9, 7], [5, 9, 12, 9, 7, 5], [4, 2, 4, 7, 4, 2], [2, 4, 2, 0, null, null]];
const PB_B: PbBar[] = [[12, 11, 12, 7, 11, 12], [14, 12, 11, 12, 9, 7], [9, 11, 12, 14, 12, 11], [12, 9, 7, 4, 7, 9], [12, 11, 12, 7, 11, 12], [14, 16, 14, 12, 11, 9], [7, 9, 7, 4, 2, 4], [0, 4, 2, 0, null, null]];
const PB_TUNE = [...PB_A, ...PB_A, ...PB_B, ...PB_B];
// chords per bar (semitones over D): D G D A D G A D | D A G A D G A D
const PB_CH_A = [0, 5, 0, 7, 0, 5, 7, 0], PB_CH_B = [0, 7, 5, 7, 0, 5, 7, 0];
const PB_CHORDS = [...PB_CH_A, ...PB_CH_A, ...PB_CH_B, ...PB_CH_B];
const D4 = 293.66;
let pbBus: GainNode | null = null, pbFilter: BiquadFilterNode | null = null, pbTimer: number | null = null;
let pbClockAt = 0, pbCtxAt = 0, pbNext = -1, pbIdle = 0, pbFlourish = 0;
function pbOut(): AudioNode | null {
  if (!ctx) return null;
  if (!pbBus) {
    pbFilter = ctx.createBiquadFilter(); pbFilter.type = "lowpass"; pbFilter.frequency.value = 500; pbFilter.Q.value = 0.6;
    pbBus = ctx.createGain(); pbBus.gain.value = 0;
    pbFilter.connect(pbBus).connect(musicBus);
  }
  return pbFilter;
}
/** a held, breathy reed-ish note with vibrato (the whistle; the fiddle when sawtooth through a filter) */
function pbVoice(type: OscillatorType, f: number, t: number, dur: number, vol: number, out: AudioNode, cut: number, vib: number) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  lfo.frequency.value = 5.5; lg.gain.value = f * vib; lfo.connect(lg).connect(o.frequency);
  fl.type = "lowpass"; fl.frequency.value = cut; fl.Q.value = 1.2;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.018); g.gain.setValueAtTime(vol * 0.85, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(fl).connect(g).connect(out);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
}
function pbPluck(f: number, t: number, vol: number, out: AudioNode) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = "square"; o.frequency.setValueAtTime(f, t);
  fl.type = "lowpass"; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.3);
  o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + 0.35);
}
function pbStep(step: number, t: number) {
  const out = pbOut();
  if (!out) return;
  const N = PB_TUNE.length * 6, s = ((step % N) + N) % N, bar = Math.floor(s / 6), i = s % 6;
  const tune = PB_TUNE[bar], n = tune[i];
  // how long this note lasts (holds: the nulls after it)
  let len = 1; while (i + len < 6 && tune[i + len] === null) len++;
  const lilt = i % 3 === 0 ? 1.12 : 0.94; // (the jig's lilt: the first of each three leans long)
  if (n !== null) {
    const f = D4 * Math.pow(2, n / 12);
    pbVoice("triangle", f * 2, t, PB_8 * len * 0.95 * lilt, 0.11, out, 5200, 0.004); // the tin whistle (two octaves up from the fiddle's D)
    if (i % 3 === 0 && len === 1 && (bar * 7 + i) % 5 === 0) pbVoice("triangle", f * 2 * Math.pow(2, 2 / 12), t - 0.025, 0.025, 0.08, out, 5200, 0); // (a cut: a quick grace note above)
    pbVoice("sawtooth", f, t + 0.012, PB_8 * len * 0.92 * lilt, 0.05, out, 2600, 0.006); // the fiddle
    fvNoise(t, 0.03, 0.012, "bandpass", 3000, out); // (breath on the whistle)
  }
  // the banjo: a chord on 1 and 4, the root on the off-beats
  const root = D4 / 2 * Math.pow(2, PB_CHORDS[bar] / 12), third = PB_CHORDS[bar] === 9 ? 3 : 4;
  if (i === 0 || i === 3) for (const k of [0, third, 7]) pbPluck(root * Math.pow(2, k / 12) * 2, t + k * 0.004, 0.035, out);
  else if (i === 2 || i === 5) pbPluck(root * 2, t, 0.025, out);
  // the bodhrán: a deep thump on 1 and 4; light taps on the rest (rolling into each bar)
  if (i === 0 || i === 3) { fvOsc("sine", i === 0 ? 120 : 105, t, 0.2, i === 0 ? 0.45 : 0.32, out, 50); fvNoise(t, 0.05, 0.08, "lowpass", 400, out); }
  else fvNoise(t, 0.04, i === 5 ? 0.06 : 0.035, "bandpass", 700, out);
  // a flourish when somebody splits the G: a quick run up and a big thump
  if (pbFlourish > 0) {
    pbFlourish--;
    pbVoice("triangle", D4 * 4 * Math.pow(2, [0, 4, 7, 12, 16, 19][pbFlourish % 6] / 12), t, PB_8 * 0.9, 0.08, out, 6000, 0.003);
    if (pbFlourish === 0) { fvOsc("sine", 140, t, 0.4, 0.5, out, 45); fvNoise(t, 0.3, 0.1, "highpass", 4000, out); }
  }
}
/** R12.1: a split G: the band throws in a run */
export function pubFlourish() { pbFlourish = 6; }
/** R12.1: call every frame. clock: the city clock (s); gain 0..1; cutoff Hz (muffled through the walls) */
export function pubMusic(clock: number, gain: number, cutoff: number): void {
  if (!ctx || !unlocked) return;
  if (!noiseBuf) noise(0.001, 0.0001, 1000);
  const out = pbOut();
  if (!out || !pbBus || !pbFilter) return;
  const now = ctx.currentTime;
  pbBus.gain.setTargetAtTime(Math.max(0, gain), now, 0.15);
  pbFilter.frequency.setTargetAtTime(Math.max(120, cutoff), now, 0.2);
  const predicted = pbClockAt + (now - pbCtxAt);
  if (pbNext < 0 || Math.abs(predicted - clock) > 0.12) { pbClockAt = clock; pbCtxAt = now; pbNext = Math.ceil((clock + 0.05) / PB_8); }
  if (gain <= 0.001) { pbIdle += 1; if (pbIdle > 120 && pbTimer !== null) { clearInterval(pbTimer); pbTimer = null; pbNext = -1; } return; }
  pbIdle = 0;
  if (pbTimer === null) pbTimer = window.setInterval(() => {
    if (!ctx) return;
    const n2 = ctx.currentTime, clk = pbClockAt + (n2 - pbCtxAt);
    while (pbNext * PB_8 < clk + 0.25) {
      const at = pbCtxAt + (pbNext * PB_8 - pbClockAt);
      if (at > n2 - 0.02) pbStep(pbNext, Math.max(n2, at));
      pbNext++;
    }
  }, 40);
}
/** R12.1: is the session playing right now (for tests)? */
export function pubMusicOn(): boolean { return pbTimer !== null && !!pbBus && pbBus.gain.value > 0.01; }
void PB_BAR;

// ---------------------------------------------------------------------------
// R12.2b: upstairs, THE JUKEBOX: three originals, laid back, round and round off the city clock (so every window hears
// the same bar); E on the jukebox puts on the next one. "Soggy Sunday": a slow waltz in G on fiddle and guitar; "Last
// Bus Home": a late-night ballad in D on electric piano and low whistle; "Puddle Stomp": a stompy folk-rock thing in A
// with bass and drums. Through the floor (downstairs, outside) it's muffled.
type JbBar = (number | null)[];
interface JbTune { bpm: number; per: number; root: number; mel: JbBar[]; ch: number[]; style: "waltz" | "ballad" | "stomp" }
const _ = null;
const JB: JbTune[] = [
  { bpm: 84, per: 6, root: 392.0, style: "waltz",
    mel: [[0, _, 4, _, 7, _], [9, _, 7, _, 4, _], [5, _, 4, _, 2, _], [0, _, _, _, -1, _], [0, _, 4, _, 7, _], [12, _, 11, _, 9, _], [7, _, 9, _, 5, _], [4, _, _, _, _, _],
      [7, _, 9, _, 11, _], [12, _, _, _, 11, 9], [7, _, 4, _, 5, _], [7, _, _, _, _, _], [9, _, 7, _, 5, _], [4, _, 2, _, 4, _], [2, _, -1, _, 2, _], [0, _, _, _, _, _]],
    ch: [0, 5, 2, 0, 0, 5, 7, 0, 5, 0, 7, 0, 9, 0, 7, 0] },
  { bpm: 72, per: 8, root: 293.66, style: "ballad",
    mel: [[0, _, _, 2, 4, _, _, _], [7, _, 4, _, 2, _, _, _], [9, _, _, 7, 4, _, 2, _], [0, _, _, _, _, _, _, _], [4, _, _, 5, 7, _, _, _], [9, _, 7, _, 5, _, 4, _], [2, _, _, 4, 2, _, 0, _], [-3, _, _, _, _, _, _, _],
      [0, _, _, 2, 4, _, _, _], [7, _, 9, _, 11, _, _, _], [12, _, _, 11, 9, _, 7, _], [9, _, _, _, _, _, _, _], [7, _, _, 5, 4, _, _, _], [5, _, 4, _, 2, _, _, _], [4, _, _, 2, -1, _, _, _], [0, _, _, _, _, _, _, _]],
    ch: [0, 9, 5, 7, 0, 9, 5, 7, 0, 7, 5, 2, 5, 2, 7, 0] },
  { bpm: 108, per: 8, root: 220.0, style: "stomp",
    mel: [[0, _, 0, 3, 5, _, 3, 0], [7, _, 5, _, 3, _, 0, _], [0, _, 0, 3, 5, _, 7, _], [10, _, 7, _, 5, _, _, _], [0, _, 0, 3, 5, _, 3, 0], [7, _, 5, _, 3, _, 0, _], [0, _, 0, 3, 5, _, 7, 5], [0, _, _, _, _, _, _, _],
      [12, _, 10, _, 7, _, 5, _], [7, _, 5, 3, 0, _, _, _], [12, _, 10, _, 7, _, 10, 12], [7, _, _, _, _, _, _, _], [12, _, 10, _, 7, _, 5, _], [7, _, 5, 3, 0, _, 3, 5], [7, _, 10, _, 12, _, 10, 7], [0, _, _, _, _, _, _, _]],
    ch: [0, 0, 10, 5, 0, 0, 10, 0, 5, 0, 10, 0, 5, 0, 10, 0] },
];
const jbStep = (k: number) => 60 / JB[k].bpm / 2;
const minorAt = (c: number) => c === 9 || c === 2 || c === 4;
let jbBus: GainNode | null = null, jbFilter: BiquadFilterNode | null = null, jbTimer: number | null = null;
let jbClockAt = 0, jbCtxAt = 0, jbNext = -1, jbIdle = 0, jbTune = 0;
function jbOut(): AudioNode | null {
  if (!ctx) return null;
  if (!jbBus) {
    jbFilter = ctx.createBiquadFilter(); jbFilter.type = "lowpass"; jbFilter.frequency.value = 500; jbFilter.Q.value = 0.6;
    jbBus = ctx.createGain(); jbBus.gain.value = 0;
    jbFilter.connect(jbBus).connect(musicBus);
  }
  return jbFilter;
}
function jbPlay(k: number, step: number, t: number) {
  const out = jbOut();
  if (!out) return;
  const T = JB[k], N = T.mel.length * T.per, s = ((step % N) + N) % N, bar = Math.floor(s / T.per), i = s % T.per, d8 = jbStep(k);
  const tune = T.mel[bar], n = tune[i];
  let len = 1; while (i + len < T.per && tune[i + len] === null) len++;
  const c = T.ch[bar], root = (T.root / 2) * Math.pow(2, c / 12), tri = [0, minorAt(c) ? 3 : 4, 7];
  if (n !== null) {
    const f = T.root * Math.pow(2, n / 12), dur = d8 * len * 0.95;
    if (T.style === "waltz") { pbVoice("sawtooth", f, t, dur, 0.05, out, 2400, 0.007); pbVoice("triangle", f * 2, t + 0.01, dur, 0.03, out, 4000, 0.003); }
    else if (T.style === "ballad") { pbVoice("sine", f, t, dur, 0.09, out, 3000, 0.004); fvNoise(t, 0.03, 0.008, "bandpass", 2200, out); }
    else { pbVoice("square", f, t, dur * 0.85, 0.035, out, 2200, 0.002); pbVoice("sawtooth", f / 2, t, dur * 0.85, 0.025, out, 1500, 0); }
  }
  if (T.style === "waltz") {
    // the guitar: the bass on 1, a strum on 2 and 3
    if (i === 0) pbPluck(root, t, 0.05, out);
    else if (i === 2 || i === 4) for (const q of tri) pbPluck(root * 2 * Math.pow(2, q / 12), t + q * 0.003, 0.022, out);
    if (i === 0) { fvOsc("sine", 110, t, 0.2, 0.25, out, 50); }
  } else if (T.style === "ballad") {
    // electric piano: the chord rolled up across the bar, a soft low root
    const q = tri[i % 3] + (i >= 3 ? 12 : 0);
    pbVoice("triangle", root * 2 * Math.pow(2, q / 12), t, d8 * 1.8, 0.03, out, 1800, 0.002);
    if (i === 0) pbVoice("sine", root / 2, t, d8 * 7, 0.07, out, 600, 0);
    if (i === 4) fvNoise(t, 0.06, 0.03, "bandpass", 1500, out); // (a brush on the snare)
  } else {
    // bass and drums: kick on 1 and 3, snare on 2 and 4, hats on the eighths; the bass on 1 and the "and" of 2
    if (i === 0 || i === 3) pbVoice("square", root / 2, t, d8 * 0.9, 0.06, out, 600, 0);
    if (i === 2 || i === 6) for (const q of tri) pbPluck(root * 2 * Math.pow(2, q / 12), t + q * 0.002, 0.02, out);
    if (i === 0 || i === 4) fvOsc("sine", 100, t, 0.18, 0.4, out, 45);
    if (i === 2 || i === 6) fvNoise(t, 0.12, 0.09, "bandpass", 1800, out);
    fvNoise(t, 0.03, 0.025, "highpass", 7000, out);
  }
}
/** R12.2b: call every frame. clock: the city clock (s); tune: the jukebox's (0..2); gain 0..1; cutoff Hz (through the floor) */
export function jukeboxMusic(clock: number, tune: number, gain: number, cutoff: number): void {
  if (!ctx || !unlocked) return;
  if (!noiseBuf) noise(0.001, 0.0001, 1000);
  const out = jbOut();
  if (!out || !jbBus || !jbFilter) return;
  const now = ctx.currentTime, k = Math.max(0, Math.min(JB.length - 1, tune | 0)), d8 = jbStep(k);
  jbBus.gain.setTargetAtTime(Math.max(0, gain), now, 0.15);
  jbFilter.frequency.setTargetAtTime(Math.max(120, cutoff), now, 0.2);
  const predicted = jbClockAt + (now - jbCtxAt);
  if (k !== jbTune || jbNext < 0 || Math.abs(predicted - clock) > 0.12) { jbTune = k; jbClockAt = clock; jbCtxAt = now; jbNext = Math.ceil((clock + 0.05) / d8); }
  if (gain <= 0.001) { jbIdle += 1; if (jbIdle > 120 && jbTimer !== null) { clearInterval(jbTimer); jbTimer = null; jbNext = -1; } return; }
  jbIdle = 0;
  if (jbTimer === null) jbTimer = window.setInterval(() => {
    if (!ctx) return;
    const n2 = ctx.currentTime, clk = jbClockAt + (n2 - jbCtxAt), e8 = jbStep(jbTune);
    while (jbNext * e8 < clk + 0.25) {
      const at = jbCtxAt + (jbNext * e8 - jbClockAt);
      if (at > n2 - 0.02) jbPlay(jbTune, jbNext, Math.max(n2, at));
      jbNext++;
    }
  }, 40);
}
export function jukeboxMusicOn(): boolean { return jbTimer !== null && !!jbBus && jbBus.gain.value > 0.01; }

/** R12.4 (test clips): play back a log of sound calls (game seconds) into an offline context, with the very same synth
 *  code, and hand back the mix (two channels) so a film clip can carry its real sound */
export async function renderSfxOffline(log: { t: number; name: string; args: unknown[] }[], dur: number): Promise<Float32Array[]> {
  const keep = { ctx, sfxBus, noiseBuf };
  const off = new OfflineAudioContext(2, Math.ceil(44100 * dur), 44100);
  const comp = off.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6;
  const bus = off.createGain(); bus.gain.value = 0.8; bus.connect(comp).connect(off.destination);
  ctx = off as unknown as AudioContext; sfxBus = bus; noiseBuf = null;
  try { for (const e of log) { tOff = e.t; (sfx as unknown as Record<string, (...a: unknown[]) => void>)[e.name]?.(...e.args); } }
  finally { tOff = 0; ctx = keep.ctx; sfxBus = keep.sfxBus; noiseBuf = keep.noiseBuf; }
  const buf = await off.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}
