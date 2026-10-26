# Code snapshot — Phase 4.5 complete (commit 15d5179)
_Every source file. Recreate each at its path under `box-fort-banditz/`, then `npm install` (see README)._

## FILE: .gitignore

````gitignore
node_modules
dist
test-output
*.log
.env
client/dist-preview
preview/game.js
````

## FILE: README.md

````markdown
# Box Fort Banditz

A chaotic first-person 3D browser party game for 2–4 players (plus solo), set in the city of **Trashington**.

**Status: Phase 4.5 (police + jail, tuned; big shots: millionaire, armored courier, celebrity, crypto bro).** Placeholder art and sound. See `docs/design-decisions.md` for the agreed design and `docs/test-plan.md` for how everything is tested.

## Tech

| Part | What | Why |
|---|---|---|
| `client/` | Babylon.js 9 + TypeScript + Vite | 3D in the browser with animation, physics, particles, audio |
| `server/` | Colyseus 0.18 (Node) | Authoritative multiplayer rooms, share codes, reconnection |
| `shared/` | Plain TypeScript | Game rules used by BOTH sides (movement, loot, pedestrians, punching), so client and server always agree |

## Run it on your computer

Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev:server     # terminal 1: game server on http://localhost:2567
npm run dev:client     # terminal 2: game on http://localhost:5173
```

Open http://localhost:5173. For multiplayer testing, click **Create Room**, then **Copy Link** and open the link in another browser window (or another computer on your network, using your computer's IP instead of `localhost`).

## Controls

- Click **CLICK TO PLAY** to capture the mouse (ESC releases it and opens the menu)
- **WASD** / arrow keys move, **Shift** sprint (uses stamina), **Space** jump / climb a ledge you face, **C** crouch (sprint + C = belly slide), **Q** dodge, **E** grab / pocket / search a dumpster, **HOLD R** rob a shop till, **G** drop, **left click** punch or smash (empty hands), **hold left click** (holding something) or **F** charge a throw, **right click** / wheel cycle pockets, **ENTER** start the match (host / solo)
- **In jail:** the **mouse** moves your lock pick: **click** a pin to select it, then **click** / **SPACE** when its top is in the green (**A / D** also choose pins)
- If a page refuses mouse capture, the game falls back to **hold left mouse + drag** to look

## Tests

```bash
npm test                 # movement + naming rules (fast, no browser)
./scripts-run-e2e.sh     # real headless Chrome windows + real server (about 2 min)
LATENCY=110 ./scripts-run-e2e.sh   # same, with ~110 ms simulated lag (Sydney -> Singapore)
```

Screenshots from the browser test land in `test-output/`.

## Configuration

- `VITE_SERVER_URL` (client build): address of the game server, e.g. `https://bfb-server.onrender.com`. Defaults to the same machine on port 2567.
- `PORT` (server): defaults to 2567.
- `COLYSEUS_LATENCY` (server, testing only): simulated round-trip lag in ms.
````

## FILE: client/index.html

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Box Fort Banditz</title>
  <meta name="description" content="A chaotic 3D multiplayer party game about building a ridiculous cardboard empire in the city of Trashington." />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect x='8' y='18' width='48' height='38' rx='3' fill='%23c9955b' stroke='%231b1420' stroke-width='5'/><path d='M8 18 L20 6 L44 6 L56 18' fill='%23a8743f' stroke='%231b1420' stroke-width='5'/></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@600;800;900&display=swap" rel="stylesheet" />
  
</head>
<body>
  <div id="fatal" class="fatal hidden" role="alert"></div>
  <canvas id="game" tabindex="0" aria-label="Box Fort Banditz game view"></canvas>

  <!-- TITLE -->
  <section id="title" class="screen">
    <div class="title-panel">
      <h1 class="logo" aria-label="Box Fort Banditz">
        <span class="logo-line l1">BOX FORT</span>
        <span class="logo-line l2">BANDITZ</span>
      </h1>
      <p class="tagline">From one soggy box to the Mayor's office of <b>Trashington</b>.</p>

      <label class="field">
          <span>Your bandit name</span>
          <input id="name-input" maxlength="16" autocomplete="off" spellcheck="false" placeholder="SneakyRaccoon" />
        </label>

      <div id="invite-card" class="card invite hidden">
        <div class="invite-label">You've been invited to room</div>
        <div id="invite-code" class="code-big">-----</div>
        <button id="btn-accept-invite" class="btn btn-go">JOIN THE FORT PARTY</button>
        <button id="btn-decline-invite" class="btn-link">no thanks, show the main menu</button>
      </div>

      <div id="main-menu" class="menu">
        <button id="btn-solo" class="btn">PLAY SOLO</button>
        <button id="btn-create" class="btn btn-go">CREATE ROOM</button>
        <div class="join-row">
          <input id="code-input" maxlength="6" autocomplete="off" spellcheck="false" placeholder="CODE" aria-label="Room code" />
          <button id="btn-join" class="btn btn-small">JOIN</button>
        </div>
        <button id="btn-settings" class="btn btn-quiet">SETTINGS</button>
      </div>
      <p id="title-status" class="status" role="status" aria-live="polite"></p>
    </div>
    <div class="title-footer">
      <span class="badge">PHASE 0 PROTOTYPE</span> Placeholder art &amp; sound. Nothing is final.
      <span id="sound-hint" class="sound-hint">Click anywhere to enable sound</span>
    </div>
  </section>

  <!-- LOADING -->
  <section id="loading" class="screen hidden">
    <div class="loading-box">
      <div class="spinner-box"></div>
      <p id="loading-text">Folding cardboard...</p>
    </div>
  </section>

  <!-- HUD -->
  <section id="hud" class="hidden">
    <div id="fx-knocked" class="fx fx-knocked hidden" aria-hidden="true"><div class="daze">* * *</div></div>
    <div id="fx-swarm" class="fx fx-swarm hidden" aria-hidden="true">
      <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    </div>
    <div id="fx-flash" class="fx fx-flash hidden" aria-hidden="true"></div>
    <div id="crosshair"></div>
    <!-- Phase 3: round loop -->
    <div id="match-hud" class="match-hud"><div id="mh-round" class="mh-round"></div><div id="mh-time" class="mh-time">LOBBY</div><div id="mh-sub" class="mh-sub"></div></div>
    <div id="event-hud" class="event-hud hidden"></div>
    <div id="home-arrow" class="home-arrow hidden"><div id="ha-arrow" class="ha-arrow"></div><span id="ha-text"></span></div>
    <ol id="scores" class="scores" aria-label="Scores"></ol>
    <div id="big-banner" class="big-banner hidden" aria-live="assertive"><div id="bb-title"></div><div id="bb-sub"></div></div>
    <div id="wipeout" class="wipeout hidden"><div class="wo-title">WIPED OUT!</div><div id="wipeout-sub"></div></div>
    <div id="tally" class="tally card hidden"><h2 id="tally-title"></h2><table id="tally-table"></table><p id="tally-foot"></p></div>
    <div id="lobby-panel" class="card hud-card">
      <div class="lp-title" id="lp-title">LOBBY</div>
      <div id="lp-code-row" class="lp-code-row">
        <span>Room</span> <b id="lp-code">-----</b>
        <button id="btn-copy" class="btn btn-tiny">COPY LINK</button>
      </div>
      <ul id="lp-players"></ul>
      <div id="lp-hint" class="lp-hint"></div>
    </div>
    <div id="mode-badge" class="badge hud-badge">PHASE 0 TEST ARENA</div>
    <div id="toasts" aria-live="polite"></div>
    <div id="reconnect-banner" class="banner hidden">Connection lost... trying to reconnect</div>
    <div id="debug" class="debug hidden"></div>
    <div id="stamina" class="stamina full" aria-label="Stamina"><div id="stamina-fill"></div><span class="winded-label">WINDED!</span></div>
    <div id="heat" class="heat cold" title="Heat: how much trouble you've caused. 1 star = a cop, 2 = two, 3 = the cop car too. Break line of sight to cool off.">
      <span class="heat-label">HEAT</span><span class="heat-bar"><span id="heat-fill"></span><i style="left:30%"></i><i style="left:60%"></i><i style="left:90%"></i></span>
      <span id="stars" class="stars"><b>★</b><b>★</b><b>★</b></span>
    </div>
    <div id="bigshot" class="bigshot hidden"><span class="bs-cash">$$$</span><span id="bigshot-name"></span><span id="bigshot-dist"></span><span id="bigshot-arrow" class="bs-arrow">▲</span></div>
    <div id="dodge-pip" class="dodge-pip ready" title="Dodge (Q) ready">Q</div>
    <div id="charge" class="charge hidden" aria-hidden="true"></div>
    <div id="prompt" class="prompt hidden" aria-live="polite"></div>
    <div id="flash" class="flash hidden" aria-live="assertive"></div>
    <div id="pockets" class="pockets" aria-label="Inventory">
      <div class="slot-wrap"><span class="slot-label">HANDS</span><div id="slot-hand" class="slot hand">empty</div></div>
      <div class="slot-wrap"><span class="slot-label">1</span><div id="slot-0" class="slot">empty</div></div>
      <div class="slot-wrap"><span class="slot-label">2</span><div id="slot-1" class="slot">empty</div></div>
      <div class="slot-wrap"><span class="slot-label">3</span><div id="slot-2" class="slot">empty</div></div>
    </div>
    <div id="controls-hint" class="controls-hint">WASD move / SHIFT sprint / SPACE jump + climb / C crouch / Q dodge / E grab + search / HOLD R rob a till / G drop / CLICK punch + smash / HOLD CLICK or F throw / RIGHT CLICK pockets / ESC menu</div>
  </section>

  <!-- PAUSE -->
  <section id="pause" class="screen dim hidden">
    <div class="card pause-card">
      <h2>PAUSED-ISH</h2>
      <p class="small">The game keeps running for everyone else.</p>
      <button id="btn-resume" class="btn btn-go">CLICK TO PLAY</button>
      <button id="btn-pause-copy" class="btn">COPY INVITE LINK</button>
      <button id="btn-start" class="btn btn-go">START MATCH</button>
      <button id="btn-pause-settings" class="btn btn-quiet">SETTINGS</button>
      <button id="btn-leave" class="btn btn-danger">LEAVE</button>
    </div>
  </section>

  <!-- SETTINGS -->
  <section id="settings" class="screen dim hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="card settings-card">
      <h2 id="settings-title">SETTINGS</h2>
      <div class="settings-grid">
        <label>Master volume <input type="range" min="0" max="1" step="0.05" data-setting="masterVolume" /></label>
        <label>Music volume <input type="range" min="0" max="1" step="0.05" data-setting="musicVolume" /></label>
        <label>Sound effects volume <input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume" /></label>
        <label class="check"><input type="checkbox" data-setting="muted" /> Mute everything</label>
        <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.05" data-setting="mouseSensitivity" /></label>
        <label class="check"><input type="checkbox" data-setting="invertY" /> Invert mouse Y</label>
        <label>Field of view <span class="val" data-val="fov"></span> <input type="range" min="70" max="110" step="1" data-setting="fov" /></label>
        <label>Screen shake <input type="range" min="0" max="1" step="0.1" data-setting="screenShake" /></label>
        <label class="check"><input type="checkbox" data-setting="reducedMotion" /> Reduced motion (no head bob / camera sway)</label>
        <label class="check"><input type="checkbox" data-setting="showFps" /> Show FPS &amp; ping</label>
        <label class="check"><input type="checkbox" data-setting="lowGraphics" /> Performance mode (no shadows, lower resolution; for older laptops)</label>
      </div>
      <button id="btn-settings-close" class="btn btn-go">DONE</button>
    </div>
  </section>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
````

## FILE: client/package.json

````json
{
  "name": "@bfb/client",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "tsx --test test/*.test.ts"
  },
  "dependencies": {
    "@babylonjs/core": "^9.28.0",
    "@babylonjs/havok": "^1.3.14",
    "@babylonjs/materials": "^9.28.0",
    "@bfb/shared": "*",
    "@colyseus/sdk": "^0.18.4"
  },
  "devDependencies": {
    "typescript": "5.9",
    "vite": "^8.3.1"
  }
}
````

## FILE: client/src/audio.ts

````ts
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
````

## FILE: client/src/game/arenaScene.ts

````ts
// The playable city, first-person. (Art is placeholder-quality; systems are real.)
// Your own movement is simulated immediately in the browser ("prediction") using the
// exact same rules as the server. When the server's answer arrives we quietly correct
// any difference ("reconciliation"), smoothing small corrections so you never feel a snap.
import {
  Scene, Engine, UniversalCamera, Camera, HemisphericLight, DirectionalLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, Mesh,
} from "./babylon.ts";
import { toon, textTexture, unlitTextured } from "./look.ts";
import { FpInput, type LootAction } from "./input.ts";
import { RemotePlayers, type RemoteInfo, type CarryKind } from "./remotePlayers.ts";
import { Viewmodel } from "./viewmodel.ts";
import { Spring } from "./spring.ts";
import { CityRenderer } from "./cityRenderer.ts";
import { ItemRenderer } from "./itemRenderer.ts";
import { NpcRenderer } from "./npcRenderer.ts";
import { EventRenderer } from "./eventRenderer.ts";
import { PropRenderer } from "./propRenderer.ts";
import { CarRenderer } from "./carRenderer.ts";
import { CopCarRenderer } from "./copCarRenderer.ts";
import { LockpickUI } from "./lockpickUI.ts";
import {
  makeMoveState, cloneMoveState, stepMovement, readMoveState, movePose, horizontalSpeed, lootDef,
  throwSpeed, throwVelocity, GRAB_RANGE_CLIENT, POCKETS, NPC_DEFS, fortAt, PLAYER_COLOR_NAMES, ROUNDS, ROB_TIME, PROP_RADIUS, USE_RANGE, SMASHABLE, SEARCHABLE, type PropDef,
  SIM_DT, PLAYER, PLAYER_COLORS, type MoveInput, type MoveState, type ArenaLayout, type MovePose,
  type WorldView, type WorldEvent, type WorldAction, type LootDef,
} from "@bfb/shared";
import { settings } from "../settings.ts";
import { sfx, chargeTone } from "../audio.ts";

export type ServerPlayerView = RemoteInfo & { lastSeq: number };

/** What the HUD needs each frame. */
export interface HudState { stamina: number; winded: boolean; dodgeReady: boolean; pose: MovePose; }

/** The item you're looking at (for the "[E] Grab" prompt). */
export interface LookTarget { id: string; def: LootDef; value: number; dist: number; note: string; }

/** What you'd punch right now (for the "[CLICK] Bonk" / "[CLICK] Smash" prompt). */
export interface PunchTarget { id: string; kind: string; name: string; fighter: boolean; prop?: boolean; empty?: boolean; }

/** A dumpster / bin (E: search) or a shop till in reach (HOLD R: rob). */
export interface UseTarget { id: string; kind: string; name: string; empty: boolean; }

const PROP_NAMES: Record<string, string> = {
  dumpster: "Dumpster", bin: "Trash Can", phone: "Phone Booth", vending: "Vending Machine", meter: "Parking Meter",
  newsbox: "Newspaper Box", car: "Parked Car", till: "the Till",
};

/** Round loop + event state for the HUD (read from the server / solo world). */
export interface MatchHud {
  phase: string; round: number; rounds: number; timeLeft: number; results: string;
  evKind: string; evStage: string; evX: number; evZ: number; evR: number; evT: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}
export interface ScoreLine { id: string; name: string; colorIdx: number; cash: number; bank: number; connected: boolean; me: boolean; }
/** Where home is, relative to where you're looking. */
export interface HomeInfo { inside: boolean; dist: number; bearing: number; }

/** Full-screen effects main.ts draws in HTML (camera flash, pigeon swarm, knocked-down vignette). */
export type ScreenFx = "flash" | "swarm" | "knocked";

/** Your inventory as displayed (server truth + instant local feedback). */
export interface Inventory { hand: string; pockets: string[]; sel: number; }

const CHARGE_TIME = 0.8; // seconds to full throw power
const PUNCH_CD_MS = 550; // matches the server's punch cooldown (the server has the final say)
const PUNCH_REACH = 2.2;
/** Gibberish voice pitch per pedestrian type. */
const NPC_VOICE: Record<string, number> = {
  tourist: 1.15, businessman: 0.8, influencer: 1.45, jogger: 1.1, gym_bro: 0.62, mall_cop: 0.75, mime: 1.0, pigeon_lady: 1.3,
};

/**
 * The camera must never tip past straight up/down: knockdowns lean the view back, shake and roll
 * add on top of the mouse pitch, and without this clamp looking up while getting knocked over
 * flipped the whole view upside down.
 */
const MAX_PITCH = Math.PI / 2 - 0.06;
const MAX_ROLL = 0.6;
const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));
export const safePitch = (p: number) => clampAbs(p, MAX_PITCH);

/** Rough place name for announcements. */
function areaName(x: number, z: number): string {
  if (Math.abs(x) < 26 && Math.abs(z) < 26) return "the Plaza";
  const ns = z > 20 ? "north" : z < -20 ? "south" : "", ew = x > 20 ? "east" : x < -20 ? "west" : "";
  const dir = ns && ew ? `${ns}-${ew}` : ns || ew;
  return Math.max(Math.abs(x), Math.abs(z)) > 74 ? `the ${dir} edge of town` : `downtown ${dir}`;
}

export class ArenaScene {
  scene: Scene;
  readonly arena: ArenaLayout;
  private camera: UniversalCamera;
  private remotes: RemotePlayers;

  // Prediction state
  private cur: MoveState;
  private prev: MoveState;
  private acc = 0;
  private seq = 0;
  private pending: MoveInput[] = [];
  private outbox: MoveInput[] = [];
  private correction = new Vector3();
  /** Stats for the debug overlay + tests */
  stats = { corrections: 0, snaps: 0, lastError: 0, pending: 0, steps: 0, moveSteps: 0, droppedMs: 0 };

  // Feel/sfx bookkeeping
  private stepDist = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private headBob = 0;
  private lastPose: MovePose = "idle";
  private wasWinded = false;
  private mantleTotal = 0;
  private viewmodel: Viewmodel;
  // camera feel
  private eye: number = PLAYER.eyeHeight;
  private fovKick = 0;
  private roll = 0;
  private camDip = new Spring(170, 20);
  private trauma = 0; // screen shake amount 0..1 (decays)
  private time = 0;
  private lie = 0;
  private voicePitch: number;

  // Loot
  private items: ItemRenderer;
  private myId = "";
  private serverInv: Inventory = { hand: "", pockets: ["", "", ""], sel: 0 };
  private optimistic: (Inventory & { until: number }) | null = null;
  private itemTypes = new Map<string, string>();
  private itemViews = new Map<string, { value: number; mode: string; holder: string; holder2: string; lock: number; fort: number; mult: number }>();

  // Phase 3: round loop
  match: MatchHud = { phase: "lobby", round: 0, rounds: ROUNDS, timeLeft: 0, results: "[]", evKind: "", evStage: "", evX: 0, evZ: 0, evR: 0, evT: 0, truckOn: false, truckX: 0, truckZ: 0, truckYaw: 0 };
  scores: ScoreLine[] = [];
  myColorIdx = 0;
  private events: EventRenderer;
  private lastTickSec = -1;
  private rumbleT = 0;
  // Phase 3.5: props, traffic, hold-ups, wipeouts
  private propsR: PropRenderer;
  private cars: CarRenderer;
  private copCars: CopCarRenderer;
  /** Phase 4 jail: the lock-picking screen (shown while you're locked up) */
  readonly lock: LockpickUI;
  jailT = 0;
  lockSeed = 0;
  lockT = 0;
  private sirenT = 0;
  private copNoticeT = 0;
  private propState = new Map<string, boolean>(); // prop id -> ready
  useTarget: UseTarget | null = null;
  /** a shop till in reach (HOLD R for a hold-up) */
  robTarget: UseTarget | null = null;
  /** seconds left before respawning after a car hit (0 = fine) */
  respawnT = 0;
  /** hold-up progress in seconds (-1 = not robbing) */
  robT = -1;
  private robHeld = false;
  private engineT = 0;
  /** Big centre-screen announcements ("ROUND 1", "GARBAGE TRUCK!"). */
  onBanner: ((title: string, sub: string, kind: "good" | "bad" | "info") => void) | null = null;
  lookTarget: LookTarget | null = null;
  private chargeStart = 0; // performance.now() when a throw wind-up started, 0 = not charging
  private stopChargeTone: (() => void) | null = null;
  /** Called when the player does a loot action (main sends it to the server / local world). */
  onAction: ((a: WorldAction) => void) | null = null;
  /** Short feedback text for the HUD ("Hands full!", "BONK!"...). */
  onFeedback: ((text: string, kind: "bad" | "good" | "info") => void) | null = null;
  private puffs: { m: Mesh; t: number; vx: number; vy: number; vz: number }[] = [];
  private pops: { m: Mesh; t: number; life: number }[] = [];

  // Punching + pedestrians
  private npcs: NpcRenderer;
  private npcIds = new Set<string>();
  private lastPunch = 0;
  private lastScream = 0;
  punchTarget: PunchTarget | null = null;
  /** my heat 0..100 (wanted stars at 30 / 60 / 90) */
  heat = 0;
  /** Full-screen effect requests (main.ts draws them). */
  onScreenFx: ((fx: ScreenFx, seconds: number) => void) | null = null;

  constructor(engine: Engine, private input: FpInput, arena: ArenaLayout, spawnIndex = 0, private networked = true) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.62, 0.8, 0.95, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.62, 0.8, 0.95);
    scene.fogStart = 80;
    scene.fogEnd = 240;
    this.arena = arena;

    const sp = this.arena.spawns[spawnIndex % this.arena.spawns.length];
    this.cur = makeMoveState(sp.x, sp.z, sp.yaw);
    this.prev = cloneMoveState(this.cur);
    input.yaw = sp.yaw;
    input.pitch = 0;

    const cam = (this.camera = new UniversalCamera("fpCam", new Vector3(sp.x, PLAYER.eyeHeight, sp.z), scene));
    cam.inputs.clear(); // we drive the camera ourselves
    cam.minZ = 0.05;
    cam.maxZ = 500;
    cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    this.applyFov();

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.7;
    hemi.groundColor = new Color3(0.45, 0.42, 0.55);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.35), scene);
    sun.position = new Vector3(30, 50, -30);
    sun.intensity = 1.0;
    // Performance mode: no shadow pass (the biggest single cost in the 200 m city) and a closer fog
    let shadows: ShadowGenerator | null = null;
    if (!settings.lowGraphics) {
      shadows = new ShadowGenerator(2048, sun);
      shadows.usePercentageCloserFiltering = true;
      shadows.darkness = 0.4;
      shadows.bias = 0.002;
      shadows.normalBias = 0.02;
    } else {
      scene.fogStart = 50;
      scene.fogEnd = 150;
    }

    new CityRenderer(scene, this.arena, shadows);
    // Only the static city casts shadows, so draw the shadow map once instead of every frame
    const sm = shadows?.getShadowMap();
    if (sm) sm.refreshRate = 0; // RenderTargetTexture.REFRESHRATE_RENDER_ONCE
    this.items = new ItemRenderer(scene, this.arena);
    this.npcs = new NpcRenderer(scene);
    this.events = new EventRenderer(scene);
    this.propsR = new PropRenderer(scene, this.arena.props ?? []);
    this.cars = new CarRenderer(scene);
    this.copCars = new CopCarRenderer(scene);
    this.lock = new LockpickUI(document.getElementById("hud") ?? document.body);
    this.lock.onPress = (pin, t) => this.onAction?.({ a: "pick", pin, t });
    input.jailKeys = (code) => this.lock.key(code);
    input.jailMouse = (dx, dy) => this.lock.mouse(dx, dy);

    // Tutorial signs in the construction yard (the old movement playground)
    const label = (text: string, x: number, y: number, z: number, rotY = 0) => {
      const p = MeshBuilder.CreatePlane("label", { width: 6, height: 1.2 }, scene);
      p.position.set(x, y, z);
      p.rotation.y = rotY;
      p.material = unlitTextured(scene, textTexture(scene, text, { w: 1024, h: 200, fg: "#ffffff", stroke: "#1b1420" }), "labelMat");
      p.isPickable = false;
    };
    const lm = this.arena.landmarks ?? {};
    if (lm.ledge14) label("CLIMB: FACE LEDGE + SPACE", lm.ledge14.x, 3.4, lm.ledge14.z - 0.5, Math.PI);
    if (lm.tunnelEntrance) label("CROUCH (C) TO CRAWL", lm.tunnelEntrance.x - 1, 2.6, lm.tunnelEntrance.z, -Math.PI / 2);

    this.remotes = new RemotePlayers(scene);
    const color = PLAYER_COLORS[spawnIndex % PLAYER_COLORS.length];
    this.viewmodel = new Viewmodel(scene, cam, color);
    this.voicePitch = [1.0, 1.25, 0.85, 1.45][spawnIndex % 4];
    input.onAction = (a, src) => this.lootAction(a, src);
    void toon;
  }

  /** Compile every shader before the player drops in (avoids a freeze on the first frames). */
  async prewarm(): Promise<void> {
    this.update(0, performance.now());
    await this.scene.whenReadyAsync();
    // Render the whole city once from high above so every material/outline/beam shader is
    // compiled now, not the first time you turn to look at something (that caused hitches).
    const cam = this.camera;
    const pos = cam.position.clone(), rot = cam.rotation.clone(), fov = cam.fov, maxZ = cam.maxZ;
    cam.maxZ = 1000;
    cam.fov = 1.6;
    for (const [x, y, z, rx] of [[0, 150, -130, 0.85], [0, 150, 130, 0.85], [0, 6, 0, 0.2], [-13, 2, -40, 0.1]]) {
      cam.position.set(x, y, z);
      cam.rotation.set(rx, z > 0 ? Math.PI : 0, 0);
      this.scene.render();
    }
    await this.scene.whenReadyAsync();
    this.scene.render();
    cam.position.copyFrom(pos); cam.rotation.copyFrom(rot); cam.fov = fov; cam.maxZ = maxZ;
  }

  applyFov() {
    this.camera.fov = (settings.fov * Math.PI) / 180;
  }

  /** Inputs generated since last call; the network layer sends these to the server. */
  takeOutbox(): MoveInput[] {
    const o = this.outbox;
    this.outbox = [];
    return o;
  }

  /** Online mode: the server's authoritative view of me. */
  reconcile(me: ServerPlayerView) {
    // Drop inputs the server has already applied
    let i = 0;
    while (i < this.pending.length && this.pending[i].seq <= me.lastSeq) i++;
    if (i) this.pending.splice(0, i);

    const before = cloneMoveState(this.cur);
    const s: MoveState = readMoveState(me);
    for (const inp of this.pending) stepMovement(s, inp, this.arena);
    const ex = before.x - s.x, ey = before.y - s.y, ez = before.z - s.z;
    const err = Math.hypot(ex, ey, ez);
    this.stats.lastError = err;
    if (err > 1e-4) {
      this.stats.corrections++;
      if (err > 2.5) {
        // Too big to hide (e.g. after a reconnect): snap.
        this.correction.set(0, 0, 0);
        this.stats.snaps++;
      } else {
        // Hide the correction: keep drawing where we were, then glide to the truth.
        this.correction.addInPlaceFromFloats(ex, ey, ez);
      }
      // keep interpolation consistent with the corrected state
      this.prev.x -= ex; this.prev.y -= ey; this.prev.z -= ez;
      Object.assign(this.cur, s);
    }
  }

  /**
   * Apply a new world state (from the server, or from the local World in solo).
   * Returns ids of other players (for the lobby list).
   */
  applyWorld(view: WorldView, myId: string, now: number) {
    this.myId = myId;
    const ids = new Set<string>();
    // items first (players' carry poses look items up)
    const itemIds = new Set<string>();
    view.items.forEach((it, id) => {
      itemIds.add(id);
      this.items.sync(id, it, now);
      this.itemTypes.set(id, it.type);
      this.itemViews.set(id, { value: it.value, mode: it.mode, holder: it.holder, holder2: it.holder2, lock: it.lock ?? 0, fort: it.fort ?? -1, mult: it.mult ?? 1 });
    });
    this.items.retain(itemIds);
    for (const id of [...this.itemTypes.keys()]) if (!itemIds.has(id)) { this.itemTypes.delete(id); this.itemViews.delete(id); }

    // round loop + event state
    const mv = view as unknown as Record<string, any>;
    for (const k of Object.keys(this.match) as (keyof MatchHud)[]) if (mv[k] !== undefined) (this.match as any)[k] = mv[k];
    const scores: ScoreLine[] = [];
    view.players.forEach((p, id) => {
      scores.push({ id, name: p.name, colorIdx: p.colorIdx, cash: p.cash ?? 0, bank: p.bank ?? 0, connected: p.connected, me: id === myId });
      if (id === myId) this.myColorIdx = p.colorIdx;
    });
    this.scores = scores.sort((a, b) => b.cash + b.bank - (a.cash + a.bank));

    view.players.forEach((p, id) => {
      if (id === myId) {
        this.reconcile(p as ServerPlayerView);
        this.serverInv = { hand: p.hand ?? "", pockets: [p.p0 ?? "", p.p1 ?? "", p.p2 ?? ""], sel: p.sel ?? 0 };
        this.heat = p.heat ?? 0;
        this.respawnT = p.respawnT ?? 0;
        this.robT = p.robT ?? -1;
        this.jailT = p.jailT ?? 0;
        this.lockSeed = p.lockSeed ?? 0;
        this.lockT = p.lockT ?? 0;
        // drop the optimistic guess once the server agrees (or it expires)
        const o = this.optimistic;
        if (o && (now > o.until || (o.hand === this.serverInv.hand && o.pockets.join() === this.serverInv.pockets.join()))) this.optimistic = null;
      } else {
        ids.add(id);
        this.remotes.push(id, p as RemoteInfo, now);
        const h = p.hand as string;
        const t = h ? this.itemTypes.get(h) : undefined;
        const kind: CarryKind = !t ? "none" : (lootDef(t).size as CarryKind);
        this.remotes.setCarry(id, kind);
      }
    });
    this.remotes.retain(ids);

    // props (dumpsters emptied, booths smashed, alarms) + traffic
    view.props?.forEach((pv, id) => { this.propsR.sync(id, pv); this.propState.set(id, pv.ready); });
    view.cars?.forEach((cv, id) => this.cars.sync(id, cv));
    this.copCars.syncAll(view.copCars);

    // pedestrians
    if (view.npcs) {
      const seen = this.npcIds;
      seen.clear();
      view.npcs.forEach((n, id) => { seen.add(id); this.npcs.sync(id, n, now); });
      this.npcs.retain(seen);
    }
    return ids;
  }

  /** Inventory as shown: instant local feedback, corrected by the server. */
  get inventory(): Inventory {
    const o = this.optimistic;
    return o && performance.now() <= o.until ? o : this.serverInv;
  }

  itemType(id: string) { return this.itemTypes.get(id) ?? null; }

  /** Sounds and effects for things that happened in the world. */
  handleEvents(events: WorldEvent[]) {
    const me = this.myId;
    const cam = this.camera.position;
    const gainAt = (x: number, y: number, z: number) => 1 / (1 + Math.hypot(x - cam.x, y - cam.y, z - cam.z) / 8);
    for (const e of events) {
      switch (e.t) {
        case "grab":
          if (e.p !== me) { const a = this.remotes.anchor(e.p); if (a && gainAt(a.x, a.y, a.z) > 0.25) sfx.grab(); }
          break;
        case "whiff":
          if (e.p === me) {
            this.optimistic = null;
            if (e.reason !== "cooldown") {
              sfx.whiff();
              this.onFeedback?.(e.reason === "taken" ? "Too slow!" : e.reason === "far" ? "Can't reach!" : e.reason === "locked" ? "Banked in a fort. Locked!" : e.reason === "full" ? "Pockets full!" : "Hands full!", "bad");
            }
          }
          break;
        case "impact": {
          const t = this.itemTypes.get(e.item);
          const g = gainAt(e.x, e.y, e.z);
          if (t && g > 0.12) sfx.impact(lootDef(t).material, e.speed, g);
          if (g > 0.1) this.puff(e.x, e.y, e.z, Math.min(1, e.speed / 10));
          break;
        }
        case "bonk":
          if (e.p === me) { sfx.bonk(); this.addTrauma(0.5); this.onFeedback?.("BONK!", "bad"); }
          else { const a = this.remotes.anchor(e.p); if (a) { sfx.bonk(); if (e.by === me) this.onFeedback?.("BONK! Nice shot.", "good"); } }
          break;
        case "tumble": sfx.tumble(); break;
        case "drop": case "throw": case "spawn": break;

        // ---- punching + pedestrians (Phase 2.5) ----
        case "punch": {
          const tp = e.hit === "npc" ? this.npcs.pos(e.target) : e.hit === "player" || e.hit === "blocked" ? (e.target === me ? cam : this.remotes.anchor(e.target)) : null;
          if (e.p === me) {
            if (e.hit === "npc" && tp) { sfx.punchHit(); this.addTrauma(0.22); this.pop("BONK!", tp.x, tp.y + 1.9, tp.z, "#ffe14a"); }
            else if (e.hit === "player" && tp) { sfx.punchPlayer(); this.addTrauma(0.35); this.pop("POW!", tp.x, tp.y + 1.9, tp.z, "#ff5a3c"); }
            else if (e.hit === "blocked") { sfx.blocked(); this.onFeedback?.("They're still dizzy - no double-dipping!", "info"); }
          } else {
            this.remotes.punch(e.p);
            const a = this.remotes.anchor(e.p);
            const g = a ? gainAt(a.x, a.y, a.z) : 0;
            if (g > 0.15) {
              if (e.hit === "npc") sfx.punchHit(g); else if (e.hit === "player") sfx.punchPlayer(g); else sfx.punchWhoosh();
              if (tp && e.hit !== "none" && e.target !== me) this.pop(e.hit === "npc" ? "BONK!" : "POW!", tp.x, tp.y + 1.9, tp.z, e.hit === "npc" ? "#ffe14a" : "#ff5a3c");
            }
          }
          break;
        }
        case "npcHit": {
          this.npcs.bump(e.npc);
          if (e.how === "throw") {
            const p = this.npcs.pos(e.npc);
            if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.punchHit(gainAt(p.x, p.y, p.z)); this.pop("BONK!", p.x, p.y + 1.9, p.z, "#ffe14a"); }
            if (e.by === me) this.onFeedback?.("BONK! Nice shot.", "good");
          }
          break;
        }
        case "npcSay": {
          const p = this.npcs.pos(e.npc);
          if (!p) break;
          const g = gainAt(p.x, p.y, p.z);
          if (g < 0.12) break; // too far to hear or read
          this.npcs.say(e.npc, e.line);
          const kind = this.npcs.kindOf(e.npc) ?? "tourist";
          if (kind !== "mime") sfx.npcVoice(NPC_VOICE[kind] ?? 1, g); // mimes say nothing, obviously
          break;
        }
        case "npcAttack": {
          this.npcs.slap(e.npc);
          if (e.p === me) {
            if (e.hit) { sfx.punchPlayer(); this.addTrauma(0.5); this.camDip.kick(-0.5); this.onFeedback?.("SLAPPED!", "bad"); }
            else sfx.whiff();
          } else {
            const p = this.npcs.pos(e.npc);
            if (p && gainAt(p.x, p.y, p.z) > 0.15) (e.hit ? sfx.punchPlayer : sfx.slapWindup)(gainAt(p.x, p.y, p.z));
          }
          break;
        }
        case "npcDodge": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.dodgeNpc(gainAt(p.x, p.y, p.z)); this.pop("MISS", p.x, p.y + 1.9, p.z, "#b6ff3c"); }
          if (e.p === me) this.onFeedback?.("Too slow! The jogger dodged.", "bad");
          break;
        }
        case "npcKo": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.12) { sfx.ko(gainAt(p.x, p.y, p.z)); this.pop("K.O.!", p.x, p.y + 2.2, p.z, "#ff6fb5"); }
          if (e.by === me) this.onFeedback?.("K.O.! Bonus loot!", "good");
          break;
        }
        case "panic": {
          const p = this.npcs.pos(e.npc);
          const nowMs = performance.now();
          if (p && nowMs - this.lastScream > 350) {
            const g = gainAt(p.x, p.y, p.z);
            if (g > 0.15 && this.npcs.kindOf(e.npc) !== "mime") { this.lastScream = nowMs; sfx.scream(g, NPC_VOICE[this.npcs.kindOf(e.npc) ?? ""] ?? 1); }
          }
          break;
        }
        case "knockdown":
          if (e.p === me) {
            sfx.knockdown(); this.addTrauma(0.8); this.optimistic = null;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            this.onFeedback?.(e.by === "truck" ? "FLATTENED BY THE GARBAGE TRUCK!" : "KNOCKED DOWN! You dropped everything.", "bad");
            this.onScreenFx?.("knocked", e.time);
          } else {
            const a = this.remotes.anchor(e.p);
            if (a && gainAt(a.x, a.y, a.z) > 0.12) { sfx.knockdown(); this.pop("DOWN!", a.x, a.y + 1.4, a.z, "#ff5a3c"); }
            if (e.by === me) this.onFeedback?.("KNOCKDOWN! Their loot is up for grabs.", "good");
          }
          break;
        // ---- Phase 3: rounds, banking, city events ----
        case "round": this.onRound(e.phase, e.round); break;
        case "banked": {
          if (e.p !== me) break;
          const p = this.items.drawnPos(e.item);
          sfx.cash();
          if (p) this.pop("+$" + e.value, p.x, p.y + 0.9, p.z, "#7fe07a");
          break;
        }
        case "lost":
          if (e.p === me) { sfx.lost(); this.onFeedback?.(`You lost ${e.count} item${e.count > 1 ? "s" : ""} worth $${e.value}. Get home next time!`, "bad"); }
          break;
        case "cityEvent": this.onCityEvent(e.kind, e.stage, e.detail); break;
        case "swept": { if (gainAt(e.x, 0.5, e.z) > 0.1) this.puff(e.x, 0.4, e.z, 0.8); break; }
        case "raccoonGrab": {
          const p = this.npcs.pos(e.npc);
          if (p && gainAt(p.x, p.y, p.z) > 0.1) sfx.chitter(gainAt(p.x, p.y, p.z));
          if (e.p === me) { const t = this.itemTypes.get(e.item); this.onFeedback?.(`A raccoon is stealing your ${t ? lootDef(t).name : "loot"}! Bonk it!`, "bad"); }
          break;
        }
        case "raccoonEscaped":
          if (e.p === me) this.onFeedback?.(`The raccoon got away with your ${lootDef(e.type).name} ($${e.value})`, "bad");
          break;
        // ---- Phase 3.5: loot sources, hold-ups, traffic ----
        case "search": {
          const d = this.propsR.def(e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.1) sfx.search(g); if (e.raccoon && g > 0.1) sfx.chitter(g); }
          if (e.p === me) this.onFeedback?.(e.raccoon ? "A RACCOON jumped out!" : `Found ${e.found} thing${e.found > 1 ? "s" : ""}!`, e.raccoon ? "bad" : "good");
          break;
        }
        case "smash": {
          const d = this.propsR.def(e.prop) ?? (this.arena.props ?? []).find((x) => x.id === e.prop);
          if (d) { const g = gainAt(d.x, 1, d.z); if (g > 0.1) { sfx.smash(e.kind, g); this.pop(e.kind === "car" ? "SMASH!" : "CLANG!", d.x, 2.2, d.z, "#ffe14a"); } }
          break;
        }
        case "empty": if (e.p === me) this.onFeedback?.("Nothing left in there. It refills later.", "info"); break;
        case "alarm": {
          const g = gainAt(e.x, 1, e.z);
          if (g > 0.06) { sfx.alarm(e.kind, Math.min(1, g * 1.5)); }
          break;
        }
        case "robStart": if (e.p === me) { sfx.robStart(); this.onFeedback?.("STICK EM UP! Keep holding R!", "info"); } break;
        case "robCancel": if (e.p === me) { this.robHeld = false; this.onFeedback?.("Hold-up called off", "info"); } break;
        case "robDone": if (e.p === me) { this.robHeld = false; sfx.cash(); this.onFeedback?.(`Got a bundle of cash ($${e.value})! Now RUN.`, "good"); } break;
        case "shoplift": if (e.p === me) this.onFeedback?.("The cashier saw that! (+heat)", "bad"); break;
        case "wipeout": {
          const g = gainAt(e.x, 0.5, e.z);
          if (g > 0.08) sfx.crash(g);
          if (e.p === me) {
            this.addTrauma(1); this.optimistic = null; this.robHeld = false;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            this.onScreenFx?.("knocked", 10);
          } else if (g > 0.1) this.pop("SPLAT!", e.x, 1.2, e.z, "#ff5a3c");
          break;
        }
        case "respawn": if (e.p === me) { sfx.respawn(); this.onFeedback?.("Back at your fort. Look both ways next time!", "info"); } break;
        case "honk": { const g = gainAt(e.x, 1, e.z); if (g > 0.1) sfx.honk(g); break; }
        // ---- Phase 4: police
        case "copSpawn":
          if (e.p === me && this.copNoticeT <= 0) { this.copNoticeT = 6; sfx.radio(); this.onFeedback?.("Somebody called the cops on you!", "bad"); }
          break;
        case "spotted": {
          if (e.p === me) { sfx.whistle(); this.onFeedback?.("SPOTTED! Break line of sight to lose them!", "bad"); }
          else { const q = this.npcs.pos(e.npc); if (q) { const g = gainAt(q.x, q.y, q.z); if (g > 0.15) sfx.whistle(g * 0.6); } }
          break;
        }
        case "busted":
          if (e.p === me) {
            sfx.cuffs(); setTimeout(() => sfx.cellDoor(), 500);
            this.optimistic = null; this.robHeld = false;
            if (this.chargeStart) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); this.viewmodel.setCharge(0); }
            // the jail screen is the headline; it says what they took
            this.lock.setHeadline(e.car ? "RUN OVER & BUSTED!" : "BUSTED!", e.count ? `They confiscated ${e.count} item${e.count > 1 ? "s" : ""} ($${e.value})` : "You're in the Trashington PD lock-up");
          } else {
            const name = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
            this.onFeedback?.(`${name} got BUSTED!${e.count ? ` ($${e.value} of loot confiscated)` : ""}`, "info");
          }
          break;
        case "released":
          if (e.p === me) {
            // face the way out (the alley runs west; the front door faces the street)
            const st = this.arena.station;
            if (st) { const spot = e.breakout ? st.alley : st.door; this.input.yaw = ((spot.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); this.input.pitch = 0; }
            this.roll = 0; this.lie = 0; this.trauma = 0; this.correction.set(0, 0, 0);
            if (e.breakout) { sfx.unlock(); this.onBanner?.("JAILBREAK!", "You're out the back. The cops know... RUN!", "good"); }
            else { sfx.respawn(); this.onFeedback?.("Time served. You're free (and your record is clean).", "info"); }
          } else if (e.breakout) {
            const name = this.scores.find((x) => x.id === e.p)?.name ?? "Someone";
            this.onFeedback?.(`${name} BROKE OUT of jail!`, "info");
          }
          break;
        case "lock": break; // the jailed player's own screen handles its sounds
        // ---- Phase 4.5: big shots
        case "bigShot": {
          const def = NPC_DEFS[e.kind];
          const title = def.bigShot?.title ?? def.name.toUpperCase();
          if (e.stage === "arrive") { sfx.bigShot(); this.onBanner?.(`${title} IS IN TOWN!`, `Look for the $$$ near ${areaName(e.x, e.z)}. A jackpot... and a LOT of heat.`, "good"); }
          else if (e.stage === "hit") {
            if (e.by === me) this.onFeedback?.(e.kind === "courier" ? "Armored courier! Knock them out for the money bag!" : "JACKPOT! Grab it and RUN (the cops are coming)", "good");
            else { const name = this.scores.find((x) => x.id === e.by)?.name ?? "Someone"; this.onFeedback?.(`${name} is robbing the ${def.name.toLowerCase()}!`, "info"); }
          } else if (e.stage === "gone") this.onFeedback?.(`The ${def.name.toLowerCase()} left town.`, "info");
          break;
        }
        case "copCar":
          if (e.p === me && e.stage === "dispatch") { sfx.siren(1); this.onBanner?.("COP CAR INCOMING!", "Max heat. Get off the streets and out of sight!", "bad"); }
          if (e.stage === "deploy" && e.p === me) sfx.cellDoor(); // car doors slam
          break;
        case "flash":
          if (e.p === me) { sfx.cameraFlash(); this.onScreenFx?.("flash", 1.2); this.onFeedback?.("Say cheese! (the tourist got a photo)", "info"); }
          break;
        case "trap":
          if (e.p === me) { sfx.mimeBox(); this.onFeedback?.("Trapped in an invisible box!", "bad"); }
          break;
        case "swarm":
          if (e.p === me) { sfx.coo(); setTimeout(() => sfx.coo(0.7), 700); this.onScreenFx?.("swarm", 5); this.onFeedback?.("PIGEONS! (dodge to shake them off)", "bad"); }
          break;
      }
    }
  }

  private onRound(phase: string, round: number) {
    switch (phase) {
      case "intro": sfx.roundIntro(); this.onBanner?.(`ROUND ${round} OF ${this.match.rounds}`, "Get ready to scavenge...", "info"); break;
      case "scavenge": sfx.roundStart(); this.onBanner?.("SCAVENGE!", "Bring loot home: it banks in your fort after 10 s", "good"); break;
      case "hurry": sfx.hurry(); this.onBanner?.("30 SECONDS!", "Get home, or lose whatever you're carrying!", "bad"); break;
      case "tally": sfx.timeUp(); this.onBanner?.("TIME'S UP!", "", "info"); break;
      case "over": sfx.roundIntro(); break;
    }
  }

  private onCityEvent(kind: string, stage: string, detail: string) {
    if (stage === "warn") {
      if (kind === "airdrop") { sfx.plane(); this.onBanner?.("AIRDROP INCOMING!", "A crate is parachuting into the plaza. It takes two to carry.", "good"); }
      if (kind === "truck") { sfx.truckHorn(); this.onBanner?.(`GARBAGE TRUCK: ${detail} ROAD`, "It hoovers up loot and flattens bandits. Move it!", "bad"); }
      if (kind === "happyhour") { sfx.happyHour(); this.onBanner?.("HAPPY HOUR!", `Loot in ${detail} is worth DOUBLE for 30 s. Grab it!`, "good"); }
      if (kind === "raccoons") { sfx.chitter(1); this.onBanner?.("RACCOON HEIST!", "Raccoons are sneaking into the forts. Bonk them!", "bad"); }
    } else if (stage === "end") {
      if (kind === "happyhour") this.onFeedback?.("Happy hour is over", "info");
    }
  }

  /** Locked up: show the lock-picking screen, freeze movement; hide it when you're out. */
  private jailScreen(dt: number) {
    this.copNoticeT -= dt;
    const jailed = this.jailT > 0 && this.lockSeed > 0;
    if (jailed) {
      if (!this.lock.open || this.lock.seed !== this.lockSeed) {
        this.lock.start(this.lockSeed, this.lockT);
        // face the bars, level, and keep the camera still while you pick (no swinging around)
        this.input.yaw = 0; this.input.pitch = 0.05;
        this.roll = 0; this.lie = 0; this.trauma = 0;
      }
      this.input.setFrozen(true);
      this.lock.update(dt, this.jailT, this.lockT);
    } else if (this.lock.open) {
      this.lock.stop();
      this.input.setFrozen(false);
    }
  }

  /** Wee-woo from the nearest cruiser with its siren on. */
  private sirenSounds(dt: number) {
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.9;
    let best = Infinity;
    for (const c of this.copCars.sirens()) best = Math.min(best, Math.hypot(c.x - this.cur.x, c.z - this.cur.z));
    if (best < 90) sfx.siren(1 / (1 + best / 12));
  }

  /** Test hooks. */
  copCarPositions() { return this.copCars.positions(); }

  /** The big shot in town (not yet robbed): name, distance, and bearing relative to where you look. */
  get bigShot(): { id: string; kind: string; name: string; dist: number; rel: number } | null {
    const b = this.npcs.bigShots().find((x) => !x.robbed);
    if (!b) return null;
    const dx = b.x - this.cur.x, dz = b.z - this.cur.z;
    let rel = Math.atan2(dx, dz) - this.input.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const def = NPC_DEFS[b.kind as keyof typeof NPC_DEFS];
    return { id: b.id, kind: b.kind, name: def?.name ?? b.kind, dist: Math.hypot(dx, dz), rel };
  }

  /** Engine noise from the nearest car. */
  private trafficSounds(dt: number) {
    this.engineT -= dt;
    if (this.engineT > 0) return;
    this.engineT = 0.35;
    const n = this.cars.nearest(this.cur.x, this.cur.z);
    if (n && n.d < 22) sfx.engine(1 / (1 + n.d / 5));
  }

  /** Round countdown ticks, garbage truck rumble. */
  private matchSounds(dt: number) {
    const m = this.match;
    if (m.phase === "scavenge" && m.timeLeft <= 10 && m.timeLeft > 0) {
      const sec = Math.ceil(m.timeLeft);
      if (sec !== this.lastTickSec) { this.lastTickSec = sec; sfx.tick(sec <= 3); }
    } else this.lastTickSec = -1;
    const tp = this.events.truckPos;
    if (tp) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) {
        this.rumbleT = 0.3;
        const d = Math.hypot(tp.x - this.cur.x, tp.z - this.cur.z);
        if (d < 45) sfx.rumble(1 / (1 + d / 8));
      }
    }
  }

  private npcAnchor(id: string) {
    const p = this.npcs.pos(id);
    return p ? { x: p.x, y: p.y - 0.4, z: p.z, yaw: 0 } : null;
  }

  /** Where your fort is, for the HUD compass. */
  home(): HomeInfo {
    const f = this.arena.forts?.find((x) => x.slot === this.myColorIdx);
    if (!f) return { inside: false, dist: 0, bearing: 0 };
    const dx = f.padX - this.cur.x, dz = f.padZ - this.cur.z;
    let b = Math.atan2(dx, dz) - this.input.yaw;
    while (b > Math.PI) b -= Math.PI * 2;
    while (b < -Math.PI) b += Math.PI * 2;
    return { inside: fortAt(this.arena, this.cur.x, this.cur.z) === this.myColorIdx, dist: Math.hypot(dx, dz), bearing: b };
  }

  fortName(slot: number) { return PLAYER_COLOR_NAMES[slot] ?? "someone"; }

  /** Floating comic text ("BONK!") that pops up and fades. */
  private popMats = new Map<string, ReturnType<typeof unlitTextured>>();
  private pop(text: string, x: number, y: number, z: number, color: string) {
    if (this.pops.length > 12) { this.pops[0].m.dispose(); this.pops.shift(); }
    const key = text + color;
    let mat = this.popMats.get(key);
    if (!mat) { mat = unlitTextured(this.scene, textTexture(this.scene, text, { w: 512, h: 160, fg: color, stroke: "#1b1420" }), "pop"); this.popMats.set(key, mat); }
    const m = MeshBuilder.CreatePlane("pop", { width: 1.4, height: 0.44 }, this.scene);
    m.material = mat;
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    m.renderingGroupId = 1;
    m.isPickable = false;
    m.position.set(x, y, z);
    m.rotation.z = (Math.random() - 0.5) * 0.4;
    this.pops.push({ m, t: 0, life: 0.8 });
  }

  private updatePops(dt: number) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.life;
      p.m.position.y += dt * 0.9;
      const s = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15));
      p.m.scaling.setAll(s);
      p.m.visibility = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
      if (k >= 1) { p.m.dispose(); this.pops.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- loot actions
  /** last few input actions and what happened to them (test diagnostics) */
  readonly actionLog: string[] = [];
  private logAction(m: string) { this.actionLog.push(m); if (this.actionLog.length > 30) this.actionLog.shift(); }

  private lootAction(a: LootAction, src?: "mouse" | "key") {
    this.logAction(a + ":" + (this.lookTarget?.id ?? "-"));
    const inv = this.inventory;
    const now = performance.now();
    // Left click with empty hands = punch (pocket items are thrown with F)
    if (a === "chargeStart" && src === "mouse" && !inv.hand) { this.punch(now); return; }
    const hold = 600; // ms the optimistic guess is trusted before the server must confirm
    if (a === "grabEnd") return;
    if (a === "robEnd") {
      if (this.robHeld) { this.robHeld = false; this.onAction?.({ a: "robStop" }); }
      return;
    }
    if (a === "robStart") {
      const r = this.robTarget;
      if (!r) return;
      if (r.empty) { sfx.full(); this.onFeedback?.("The till's empty right now (or the register's gone)!", "info"); return; }
      this.robHeld = true;
      this.onAction?.({ a: "use", prop: r.id });
      return;
    }
    if (a === "grab") this.updateLookTarget();
    if (a === "grab" && !this.lookTarget && this.useTarget) {
      const u = this.useTarget;
      if (u.empty) { sfx.full(); this.onFeedback?.("Already searched. It'll refill later.", "info"); return; }
      this.onAction?.({ a: "use", prop: u.id });
      return;
    }
    if (a === "grab") {
      this.updateLookTarget(); // fresh: a slow frame can leave the target pointing at something we already picked up
      const t = this.lookTarget;
      this.logAction("grab-target:" + (t?.id ?? "none"));
      if (!t) return;
      if (t.note.startsWith("LOCKED")) { sfx.full(); this.onFeedback?.("Banked in a fort. Locked!", "info"); return; }
      const size = t.def.size;
      if (size === "small" && inv.pockets.includes("")) {
        const pockets = [...inv.pockets];
        pockets[pockets.indexOf("")] = t.id;
        this.optimistic = { ...inv, pockets, until: now + hold };
        sfx.pocket();
      } else if (!inv.hand) {
        this.optimistic = { ...inv, pockets: [...inv.pockets], hand: t.id, until: now + hold };
        sfx.grab();
        this.viewmodel.kick(0.3);
      } else {
        sfx.full();
        this.onFeedback?.(size === "small" ? "Pockets full!" : "Hands full!", "bad");
        return;
      }
      this.onAction?.({ a: "grab", item: t.id });
    } else if (a === "drop") {
      const src = this.activeItem(inv);
      if (!src) return;
      this.optimistic = this.without(inv, src, now + hold);
      sfx.drop();
      this.onAction?.({ a: "drop" });
    } else if (a === "cycle") {
      const sel = (inv.sel + 1) % POCKETS;
      this.optimistic = { ...inv, pockets: [...inv.pockets], sel, until: now + hold };
      sfx.uiHover();
      this.onAction?.({ a: "cycle" });
    } else if (a === "chargeStart") {
      const src = this.activeItem(inv);
      if (!src) return;
      const t = this.itemTypes.get(src.id);
      if (t && lootDef(t).size === "giant") { this.onFeedback?.("Too big to throw!", "bad"); return; }
      this.chargeStart = now;
      this.stopChargeTone = chargeTone();
    } else if (a === "chargeEnd") {
      if (!this.chargeStart) return;
      const charge = Math.min(1, (now - this.chargeStart) / 1000 / CHARGE_TIME);
      this.chargeStart = 0;
      this.stopChargeTone?.(); this.stopChargeTone = null;
      const src = this.activeItem(inv);
      if (!src) { this.viewmodel.setCharge(0); return; }
      const type = this.itemTypes.get(src.id);
      this.optimistic = this.without(inv, src, now + hold);
      this.onAction?.({ a: "throw", charge, yaw: this.input.yaw, pitch: this.input.pitch });
      this.viewmodel.throwAnim();
      sfx.throw(charge);
      // Predict the flight locally with the same maths the server uses
      if (type) {
        const def = lootDef(type);
        const v = throwVelocity(this.input.yaw, this.input.pitch, throwSpeed(def, charge));
        const m = this.cur;
        const eyeY = m.y + (m.crouching || m.slideT > 0 ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
        this.items.predictThrow(src.id, {
          x: m.x + v.dx * 0.55, y: eyeY - 0.15 + v.dy * 0.55, z: m.z + v.dz * 0.55,
          vx: v.vx + m.vx * 0.5, vy: v.vy, vz: v.vz + m.vz * 0.5, rot: m.yaw, spin: 0, resting: false,
        }, now);
      }
    }
  }

  private punch(now: number) {
    if (now - this.lastPunch < PUNCH_CD_MS) return;
    if (this.cur.knockT > 0 || this.cur.mantleT > 0) return;
    this.lastPunch = now;
    this.viewmodel.punchAnim();
    sfx.punchWhoosh();
    this.onAction?.({ a: "punch", yaw: this.input.yaw, pitch: this.input.pitch });
  }

  /** Same priority as the server: hands first, then selected pocket, then any pocket. */
  private activeItem(inv: Inventory): { id: string; from: "hand" | number } | null {
    if (inv.hand) return { id: inv.hand, from: "hand" };
    for (const i of [inv.sel, ...[0, 1, 2].filter((k) => k !== inv.sel)]) if (inv.pockets[i]) return { id: inv.pockets[i], from: i };
    return null;
  }

  private without(inv: Inventory, src: { from: "hand" | number }, until: number): Inventory & { until: number } {
    const pockets = [...inv.pockets];
    if (src.from !== "hand") pockets[src.from] = "";
    return { hand: src.from === "hand" ? "" : inv.hand, pockets, sel: inv.sel, until };
  }

  /** Find the item under the crosshair within reach. */
  private updateLookTarget() {
    const cam = this.camera.position;
    const yaw = this.input.yaw, pitch = this.input.pitch;
    const dx0 = Math.sin(yaw) * Math.cos(pitch), dy0 = -Math.sin(pitch), dz0 = Math.cos(yaw) * Math.cos(pitch);
    let best: LookTarget | null = null;
    let bestScore = Infinity;
    const inv = this.inventory;
    for (const [id, iv] of this.itemViews) {
      const type = this.itemTypes.get(id)!;
      const def = lootDef(type);
      if (iv.mode === "pocket") continue;
      if (id === inv.hand || inv.pockets.includes(id)) continue;
      let note = "";
      if (iv.lock >= 100) note = "LOCKED:" + iv.fort;
      if (iv.mode === "held") {
        if (this.npcs.kindOf(iv.holder)) continue; // being carried off by a raccoon: bonk it instead
        // only a giant item with a free second handle can be joined
        if (def.size !== "giant" || iv.holder2 || iv.holder === this.myId) continue;
        note = "HELP CARRY";
      }
      const p = this.items.drawnPos(id);
      if (!p) continue;
      const vx = p.x - cam.x, vy = p.y - cam.y, vz = p.z - cam.z;
      const dist = Math.hypot(vx, vy, vz);
      if (dist - def.radius > GRAB_RANGE_CLIENT) continue;
      const cos = (vx * dx0 + vy * dy0 + vz * dz0) / Math.max(1e-6, dist);
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      const allowance = Math.atan((def.radius + 0.28) / Math.max(0.3, dist)) + 0.08;
      if (angle > allowance) continue;
      const score = angle - allowance;
      if (score < bestScore) { bestScore = score; best = { id, def, value: iv.value, dist, note }; }
    }
    this.lookTarget = best;
    this.items.highlight(best?.id ?? null);
  }

  /** Pedestrian you'd hit if you punched now (only when your hands are empty). */
  /** Dumpster / bin / till in reach in front of you. */
  private updateUseTarget() {
    this.useTarget = null;
    this.robTarget = null;
    if (this.cur.knockT > 0) return;
    // a till in reach: HOLD R for a hold-up (works even while looking at the register itself)
    const till = this.propInFront((d) => d.kind === "till", USE_RANGE + 0.3);
    if (till) this.robTarget = { id: till.id, kind: "till", name: PROP_NAMES.till, empty: this.propState.get(till.id) === false || !this.registerNear(till) };
    if (this.lookTarget) return;
    const best = this.propInFront((d) => SEARCHABLE.has(d.kind), USE_RANGE);
    if (best) this.useTarget = { id: best.id, kind: best.kind, name: PROP_NAMES[best.kind] ?? best.kind, empty: this.propState.get(best.id) === false };
  }

  /** Is the cash register still sitting on this till's counter? */
  private registerNear(d: PropDef): boolean {
    for (const [id, iv] of this.itemViews) {
      if (iv.mode !== "free" || this.itemTypes.get(id) !== "cash_register") continue;
      const p = this.items.drawnPos(id);
      if (p && Math.hypot(p.x - d.x, p.z - d.z) < 1.2) return true;
    }
    return false;
  }

  /** The closest prop (matching a filter) roughly under the crosshair and within reach. */
  private propInFront(filter: (d: PropDef) => boolean, reach: number): PropDef | null {
    const me = this.cur, yaw = this.input.yaw;
    let best: PropDef | null = null, bestScore = Infinity;
    for (const d of this.arena.props ?? []) {
      if (!filter(d)) continue;
      const dx = d.x - me.x, dz = d.z - me.z, dist = Math.hypot(dx, dz);
      if (dist - PROP_RADIUS[d.kind] > reach || Math.abs(d.y - me.y) > 2.2) continue;
      let ang = Math.atan2(dx, dz) - yaw;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      const allow = Math.atan((PROP_RADIUS[d.kind] + 0.5) / Math.max(0.5, dist)) + 0.15;
      if (Math.abs(ang) > allow && dist > 1.2) continue;
      const score = dist + Math.abs(ang) * 2;
      if (score < bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  private updatePunchTarget(hand: string) {
    this.punchTarget = null;
    if (hand || this.lookTarget || this.useTarget || this.robTarget || this.cur.knockT > 0) return;
    const prop = this.propInFront((d) => SMASHABLE.has(d.kind), 1.9);
    const me = this.cur, yaw = this.input.yaw;
    let best = Infinity;
    this.npcs.forEachVisible((id, x, y, z, state, kind) => {
      if (state === "ko" || Math.abs(y - me.y) > 1.6) return;
      const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
      if (d > PUNCH_REACH) return;
      let ang = Math.atan2(dx, dz) - yaw;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > 0.9 && d > 0.6) return;
      const score = d + Math.abs(ang) * 1.5;
      if (score < best) {
        best = score;
        const def = NPC_DEFS[kind as keyof typeof NPC_DEFS];
        this.punchTarget = { id, kind, name: def?.name ?? kind, fighter: !!def?.fighter };
      }
    });
    if (!this.punchTarget && prop) this.punchTarget = { id: prop.id, kind: prop.kind, name: PROP_NAMES[prop.kind] ?? prop.kind, fighter: false, prop: true, empty: this.propState.get(prop.id) === false };
  }

  /** Little dust puff where something landed hard. */
  private puff(x: number, y: number, z: number, strength: number) {
    for (let i = 0; i < 5; i++) {
      const m = MeshBuilder.CreateSphere("puff", { diameter: 0.25, segments: 4 }, this.scene);
      m.material = toon(this.scene, "#d8d0c4", "puff");
      m.position.set(x, Math.max(0.1, y - 0.2), z);
      m.isPickable = false;
      const a = (i / 5) * Math.PI * 2;
      this.puffs.push({ m, t: 0, vx: Math.cos(a) * (1 + strength), vy: 0.6 + strength, vz: Math.sin(a) * (1 + strength) });
    }
  }

  private updatePuffs(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.vx *= 0.9; p.vz *= 0.9;
      const k = p.t / 0.5;
      p.m.scaling.setAll(1 + k * 1.5);
      p.m.visibility = Math.max(0, 1 - k);
      if (k >= 1) { p.m.dispose(); this.puffs.splice(i, 1); }
    }
  }

  get position() { return { x: this.cur.x, y: this.cur.y, z: this.cur.z }; }

  update(dt: number, now: number) {
    // ---- fixed-step simulation (60 Hz) ----
    if (dt > 0.25) this.stats.droppedMs += (dt - 0.25) * 1000;
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.stats.steps++;
      const a = this.input.axes();
      if (a.mx || a.mz) this.stats.moveSteps++;
      const inp: MoveInput = {
        seq: this.seq++, mx: a.mx, mz: a.mz, yaw: this.input.yaw, pitch: this.input.pitch,
        sprint: a.sprint, jump: a.jump, crouch: a.crouch, dodge: a.dodge,
      };
      this.prev = cloneMoveState(this.cur);
      stepMovement(this.cur, inp, this.arena);
      if (this.networked) {
        this.pending.push(inp);
        this.outbox.push(inp);
      }
      this.feel(inp);
    }
    if (this.pending.length > 180) this.pending.splice(0, this.pending.length - 180);
    this.stats.pending = this.pending.length;

    // ---- render position: blend between the last two steps + fading correction ----
    const k = this.acc / SIM_DT;
    const decay = Math.exp(-dt * 14);
    this.correction.scaleInPlace(decay);
    const px = this.prev.x + (this.cur.x - this.prev.x) * k + this.correction.x;
    const py = this.prev.y + (this.cur.y - this.prev.y) * k + this.correction.y;
    const pz = this.prev.z + (this.cur.z - this.prev.z) * k + this.correction.z;

    this.time += dt;
    const cur = this.cur;
    const pose = movePose(cur);
    const hs = horizontalSpeed(cur);
    const reduced = settings.reducedMotion;
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);

    // Eye height follows stance (crouch / slide lower the camera smoothly)
    const eyeTarget = pose === "knocked" ? 0.35 : pose === "slide" ? PLAYER.slideEyeHeight : cur.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
    this.eye += (eyeTarget - this.eye) * ease(12);

    // Head bob (off with reduced motion)
    if (cur.grounded && hs > 0.5 && pose !== "slide") this.headBob += dt * hs * 1.9;
    const bobAmt = reduced ? 0 : Math.min(1, hs / PLAYER.sprintSpeed) * (cur.crouching ? 0.02 : 0.045);
    const bob = Math.sin(this.headBob * 2) * bobAmt;

    // FOV kick when going fast (sprint/slide/dodge)
    const kickTarget = reduced ? 0 : pose === "slide" ? 10 : pose === "dodge" ? 8 : pose === "sprint" ? 5 : 0;
    this.fovKick += (kickTarget - this.fovKick) * ease(6);
    this.camera.fov = ((settings.fov + this.fovKick) * Math.PI) / 180;

    // Roll: slight lean into strafes, more when sliding
    const strafe = this.input.axes().mx;
    const rollTarget = (pose === "knocked" ? (reduced ? 0.2 : 0.55) : 0) + (reduced ? 0 : (pose === "slide" ? 0.05 : 0) - strafe * 0.018 + (pose === "stumble" ? Math.sin(this.time * 18) * 0.05 : 0));
    this.roll += (rollTarget - this.roll) * ease(8);

    const camDip = this.camDip.update(dt);

    // Screen shake: trauma^2 so small bumps stay subtle; scaled by the player's setting
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const shakeAmt = reduced ? 0 : this.trauma * this.trauma * settings.screenShake;
    const n = (f: number, o: number) => Math.sin(this.time * f + o) * Math.sin(this.time * f * 0.63 + o * 2.1);
    const shakeP = n(41, 0) * 0.035 * shakeAmt, shakeY = n(37, 3) * 0.035 * shakeAmt, shakeR = n(29, 7) * 0.05 * shakeAmt;

    this.camera.position.set(px, py + this.eye + bob + (reduced ? 0 : camDip), pz);
    // knocked down: you're looking up at the sky from the pavement
    const lieBack = pose === "knocked" ? -0.55 : 0;
    this.lie += (lieBack - this.lie) * ease(8);
    this.camera.rotation.set(safePitch(this.input.pitch + shakeP + this.lie), this.input.yaw + shakeY, clampAbs(this.roll + shakeR, MAX_ROLL));
    if (!Number.isFinite(this.camera.position.y) || !Number.isFinite(this.camera.rotation.z) || !Number.isFinite(this.camera.rotation.x)) {
      // last line of defence: never leave the camera broken
      this.camera.position.set(px, py + PLAYER.eyeHeight, pz);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
      this.roll = 0; this.trauma = 0;
    }

    // Loot in hands (viewmodel), throw wind-up, look target
    const inv = this.inventory;
    const heldId = inv.hand || (this.chargeStart ? this.activeItem(inv)?.id ?? "" : "");
    let heldType = heldId ? this.itemTypes.get(heldId) ?? null : null;
    // giant items stay in the world (dragged in front of you / carried between two players)
    if (heldType && lootDef(heldType).size === "giant") heldType = null;
    this.viewmodel.setHeld(heldType, heldType ? lootDef(heldType).size : "big");
    if (this.chargeStart) {
      if (!this.activeItem(inv)) { this.chargeStart = 0; this.stopChargeTone?.(); this.stopChargeTone = null; this.input.cancelCharge(); }
      this.viewmodel.setCharge(this.chargeStart ? Math.min(1, (performance.now() - this.chargeStart) / 1000 / CHARGE_TIME) : 0);
    }

    const mantleFrac = cur.mantleT > 0 && this.mantleTotal > 0 ? 1 - cur.mantleT / this.mantleTotal : 0;
    this.viewmodel.update(dt, pose, hs, this.input.yaw, this.input.pitch, reduced, mantleFrac);

    this.remotes.update(now, dt);
    const myId = this.myId;
    const hand = inv.hand;
    this.items.update(now, dt, {
      myId,
      inMyHands: (id) => (id === hand || id === heldId) && !!heldType,
      anchorOf: (pid) => pid === myId ? { x: this.cur.x, y: this.cur.y, z: this.cur.z, yaw: this.cur.yaw } : this.remotes.anchor(pid) ?? this.npcAnchor(pid),
      cam: this.camera.position,
    });
    this.npcs.update(now, dt, this.camera);
    this.events.update(this.match, dt);
    this.propsR.update(dt);
    this.cars.update(dt);
    this.copCars.update(dt);
    this.jailScreen(dt);
    this.sirenSounds(dt);
    this.trafficSounds(dt);
    this.matchSounds(dt);
    this.updateLookTarget();
    this.updateUseTarget();
    this.updatePunchTarget(inv.hand);
    this.updatePuffs(dt);
    this.updatePops(dt);
  }

  /** Throw power 0..1 while winding up (for the HUD), else -1. */
  get throwCharge(): number {
    if (this.robT >= 0) return Math.min(1, this.robT / ROB_TIME);
    return this.chargeStart ? Math.min(1, (performance.now() - this.chargeStart) / 1000 / CHARGE_TIME) : -1;
  }

  /** Sounds + one-off effects triggered by movement changes (only for real steps, never replays). */
  private feel(inp: MoveInput) {
    const s = this.cur;
    const pose = movePose(s);
    const last = this.lastPose;
    if (pose !== last) {
      if (pose === "slide") { sfx.slide(); this.addTrauma(0.2); this.viewmodel.kick(0.4); }
      if (pose === "dodge") { sfx.dodge(); this.addTrauma(0.15); }
      if (pose === "mantle") { sfx.mantle(this.voicePitch); this.mantleTotal = s.mantleT; }
      if (pose === "stumble") { sfx.stumble(); this.addTrauma(0.6); }
      if (last === "mantle") { this.viewmodel.kick(0.5); this.camDip.kick(-0.6); }
    }
    this.lastPose = pose;
    if (this.wasGrounded && !s.grounded && s.vy > 0 && pose !== "mantle" && pose !== "dodge") sfx.jump();
    if (!this.wasGrounded && s.grounded && last !== "mantle") {
      const impact = Math.abs(this.lastVy);
      if (impact > 9) { sfx.heavyLand(); this.addTrauma(Math.min(0.7, impact / 25)); } else sfx.land(impact);
      this.viewmodel.kick(Math.min(1.2, impact * 0.08));
      this.camDip.kick(-Math.min(1.6, impact * 0.12));
    }
    if (s.winded && !this.wasWinded) sfx.winded(this.voicePitch);
    this.wasWinded = s.winded;
    this.wasGrounded = s.grounded;
    this.lastVy = s.vy;
    const hs = horizontalSpeed(s);
    if (s.grounded && hs > 0.5 && pose !== "slide") {
      this.stepDist += hs * SIM_DT;
      const kind = s.crouching ? "sneak" : pose === "sprint" ? "sprint" : "walk";
      const stride = kind === "sprint" ? 2.5 : kind === "sneak" ? 1.3 : 1.9;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        sfx.step(kind);
      }
    }
    void inp;
  }

  private addTrauma(t: number) { this.trauma = Math.min(1, this.trauma + t); }

  hud(): HudState {
    return { stamina: this.cur.stamina, winded: this.cur.winded, dodgeReady: this.cur.dodgeCd <= 0 && this.cur.dodgeT <= 0 && this.cur.stamina >= PLAYER.dodgeStamina, pose: movePose(this.cur) };
  }

  /** Test-only (solo, ?test=1): place the player somewhere. */
  debugTeleport(x: number, z: number, yaw: number) {
    this.cur = makeMoveState(x, z, yaw);
    this.prev = cloneMoveState(this.cur);
    this.input.yaw = yaw;
    this.input.pitch = 0;
  }

  get moveState() { return cloneMoveState(this.cur); }

  remotePose(id: string) { return this.remotes.poseOf(id); }

  remoteCount() { return this.remotes.count(); }

  /** Test/debug: how many pedestrians exist and how many are drawn (not distance-culled). */
  npcStats() { return { total: this.npcs.count(), visible: this.npcs.visibleCount() }; }
  npcDrawnPos(id: string) { return this.npcs.pos(id); }
  carCount() { return this.cars.count(); }
  carPositions() { return this.cars.positions(); }

  dispose() {
    this.stopChargeTone?.();
    this.input.onAction = null;
    this.input.jailKeys = null;
    this.input.jailMouse = null;
    this.input.setFrozen(false);
    this.lock.root.remove();
    this.copCars.dispose();
    this.items.dispose();
    this.npcs.dispose();
    this.events.dispose();
    this.propsR.dispose();
    this.cars.dispose();
    this.remotes.dispose();
    this.scene.dispose();
  }
}
````

## FILE: client/src/game/babylon.global.ts

````ts
// Preview-page only: the same exports as babylon.ts, but taken from the Babylon.js
// UMD build loaded from the jsDelivr CDN (window.BABYLON). Used because the claude.ai
// page viewer only reliably runs inline code plus scripts from approved CDNs.
const B = (globalThis as any).BABYLON;
if (!B) throw new Error("Babylon.js failed to load from the CDN");
export const Engine = B.Engine;
export const Scene = B.Scene;
export const UniversalCamera = B.UniversalCamera;
export const Camera = B.Camera;
export const HemisphericLight = B.HemisphericLight;
export const DirectionalLight = B.DirectionalLight;
export const PointLight = B.PointLight;
export const ShadowGenerator = B.ShadowGenerator;
export const Vector3 = B.Vector3;
export const Color3 = B.Color3;
export const Color4 = B.Color4;
export const Matrix = B.Matrix;
export const Scalar = B.Scalar;
export const MeshBuilder = B.MeshBuilder;
export const Mesh = B.Mesh;
export const TransformNode = B.TransformNode;
export const StandardMaterial = B.StandardMaterial;
export const DynamicTexture = B.DynamicTexture;
export const Texture = B.Texture;
export const CellMaterial = B.CellMaterial;
export const VertexBuffer = B.VertexBuffer;
````

## FILE: client/src/game/babylon.ts

````ts
// Single place for Babylon.js imports. Deep imports keep the download smaller
// than importing the whole engine. Side-effect imports register optional features.
export { Engine } from "@babylonjs/core/Engines/engine.js";
export { Scene } from "@babylonjs/core/scene.js";
export { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera.js";
export { Camera } from "@babylonjs/core/Cameras/camera.js";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
export { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
export { PointLight } from "@babylonjs/core/Lights/pointLight.js";
export { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
export { Vector3, Color3, Color4, Matrix } from "@babylonjs/core/Maths/math.js";
export { Scalar } from "@babylonjs/core/Maths/math.scalar.js";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
export { Mesh } from "@babylonjs/core/Meshes/mesh.js";
export { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
export type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
export { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
export { CellMaterial } from "@babylonjs/materials/cell/cellMaterial.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js";
import "@babylonjs/core/Culling/ray.js";
````

## FILE: client/src/game/carModel.ts

````ts
// A chunky cartoon car (placeholder art), ~4.2 x 1.9 m, built facing +z around the origin.
// Parked cars merge their body into the static city; traffic cars bake everything into one mesh.
import { MeshBuilder, type Mesh, type Scene } from "./babylon.ts";

function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + k), g = Math.min(255, ((n >> 8) & 255) + k), b = Math.min(255, (n & 255) + k);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

/** Body parts as [mesh, colour, outline width]. withGlass adds the windows too. */
export function buildCarParts(scene: Scene, color: string, withGlass: boolean): [Mesh, string, number][] {
  const MB = MeshBuilder;
  const out: [Mesh, string, number][] = [];
  const add = (m: Mesh, c: string, o = 0.03, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); out.push([m, c, o]); return m; };
  add(MB.CreateBox("carbody", { width: 1.9, height: 0.7, depth: 4.2 }, scene), color, 0.04, 0, 0.6, 0);
  add(MB.CreateBox("carcab", { width: 1.66, height: 0.55, depth: 2.1 }, scene), lighten(color, 30), 0.03, 0, 1.22, -0.25);
  add(MB.CreateBox("bumperF", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, 2.12);
  add(MB.CreateBox("bumperB", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, -2.12);
  for (const sx of [-0.62, 0.62]) {
    add(MB.CreateBox("headlight", { width: 0.34, height: 0.18, depth: 0.06 }, scene), "#fff6c0", 0, sx, 0.72, 2.11);
    add(MB.CreateBox("taillight", { width: 0.34, height: 0.16, depth: 0.06 }, scene), "#e14b4b", 0, sx, 0.72, -2.11);
  }
  for (const [x, z] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    const w = add(MB.CreateCylinder("wheel", { diameter: 0.72, height: 0.3, tessellation: 12 }, scene), "#1b1420", 0.02, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
  }
  if (withGlass) for (const g of buildCarGlass(scene)) out.push([g, "#6fb6d9", 0]);
  return out;
}

/** The windows (a slightly larger box around the cabin, so they show on every side). */
export function buildCarGlass(scene: Scene): Mesh[] {
  const g = MeshBuilder.CreateBox("carglass", { width: 1.7, height: 0.4, depth: 1.9 }, scene);
  g.position.set(0, 1.25, -0.25);
  return [g];
}

/**
 * Phase 4 police cruiser: black-and-white body, push bar, light bar on the roof.
 * The two light-bar lenses are returned separately (so they can flash); `lights` is null for a
 * parked (scenery) car that gets merged into the city.
 */
export function buildCopCarParts(scene: Scene): [Mesh, string, number][] {
  const MB = MeshBuilder;
  const out: [Mesh, string, number][] = [];
  const add = (m: Mesh, c: string, o = 0.03, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); out.push([m, c, o]); return m; };
  add(MB.CreateBox("copbody", { width: 1.9, height: 0.7, depth: 4.3 }, scene), "#f4f1ea", 0.04, 0, 0.62, 0);
  add(MB.CreateBox("copdoors", { width: 1.94, height: 0.42, depth: 2.2 }, scene), "#1b1f2e", 0.02, 0, 0.52, -0.1); // black doors
  add(MB.CreateBox("copcab", { width: 1.66, height: 0.55, depth: 2.1 }, scene), "#1b1f2e", 0.03, 0, 1.24, -0.25);
  add(MB.CreateBox("copglass", { width: 1.7, height: 0.4, depth: 1.9 }, scene), "#6fb6d9", 0, 0, 1.27, -0.25);
  add(MB.CreateBox("pushbar", { width: 1.5, height: 0.45, depth: 0.14 }, scene), "#2b2433", 0.02, 0, 0.55, 2.25);
  add(MB.CreateBox("bumperB", { width: 1.95, height: 0.22, depth: 0.2 }, scene), "#2b2433", 0.02, 0, 0.35, -2.17);
  add(MB.CreateBox("lightbase", { width: 1.3, height: 0.1, depth: 0.34 }, scene), "#2b2433", 0.02, 0, 1.56, -0.2);
  for (const sx of [-0.62, 0.62]) {
    add(MB.CreateBox("headlight", { width: 0.34, height: 0.18, depth: 0.06 }, scene), "#fff6c0", 0, sx, 0.74, 2.16);
    add(MB.CreateBox("taillight", { width: 0.34, height: 0.16, depth: 0.06 }, scene), "#e14b4b", 0, sx, 0.74, -2.16);
  }
  // badge on the doors (a gold star-ish square)
  for (const sx of [-0.98, 0.98]) add(MB.CreateBox("badge", { width: 0.03, height: 0.28, depth: 0.28 }, scene), "#ffcf3a", 0, sx, 0.62, 0.1);
  for (const [x, z] of [[-0.92, 1.38], [0.92, 1.38], [-0.92, -1.38], [0.92, -1.38]]) {
    const w = add(MB.CreateCylinder("wheel", { diameter: 0.72, height: 0.3, tessellation: 12 }, scene), "#1b1420", 0.02, x, 0.36, z);
    w.rotation.z = Math.PI / 2;
  }
  return out;
}

/** The two roof lenses (red left, blue right), for flashing. */
export function buildCopLights(scene: Scene): [Mesh, Mesh] {
  const r = MeshBuilder.CreateBox("lensR", { width: 0.56, height: 0.2, depth: 0.3 }, scene);
  r.position.set(-0.33, 1.7, -0.2);
  const b = MeshBuilder.CreateBox("lensB", { width: 0.56, height: 0.2, depth: 0.3 }, scene);
  b.position.set(0.33, 1.7, -0.2);
  return [r, b];
}
````

## FILE: client/src/game/carRenderer.ts

````ts
// Traffic (Phase 3.5): each car is one baked mesh (+ outline), glided toward the synced position.
import { Scene, TransformNode } from "./babylon.ts";
import { toon, bakeGroup } from "./look.ts";
import { buildCarParts } from "./carModel.ts";
import type { CarView } from "@bfb/shared";

const COLORS = ["#d6264a", "#3d6fb5", "#ffcf3a", "#e8e2d4", "#43c7a6", "#6b4c9a", "#ff7a1f", "#2b2433"];

interface CarVis { node: TransformNode; x: number; z: number; yaw: number; init: boolean; }

export class CarRenderer {
  private map = new Map<string, CarVis>();
  private targets = new Map<string, CarView>();

  constructor(private scene: Scene) {}

  private build(id: string): CarVis {
    const node = new TransformNode("car-" + id, this.scene);
    const color = COLORS[(parseInt(id.replace(/\D/g, ""), 10) || 0) % COLORS.length];
    for (const [m, c] of buildCarParts(this.scene, color, true)) { m.parent = node; m.material = toon(this.scene, c); }
    bakeGroup(this.scene, node, 0.035);
    return { node, x: 0, z: 0, yaw: 0, init: false };
  }

  sync(id: string, v: CarView) {
    if (!this.map.has(id)) this.map.set(id, this.build(id));
    this.targets.set(id, { x: v.x, z: v.z, yaw: v.yaw });
  }

  /** Nearest car (for engine sound). */
  nearest(x: number, z: number): { d: number; x: number; z: number } | null {
    let best: { d: number; x: number; z: number } | null = null;
    for (const c of this.map.values()) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (!best || d < best.d) best = { d, x: c.x, z: c.z };
    }
    return best;
  }

  positions() { return [...this.map.values()].map((c) => ({ x: c.x, z: c.z, yaw: c.yaw })); }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 20);
    for (const [id, c] of this.map) {
      const t = this.targets.get(id);
      if (!t) continue;
      if (!c.init || Math.hypot(t.x - c.x, t.z - c.z) > 8) { c.x = t.x; c.z = t.z; c.yaw = t.yaw; c.init = true; }
      else {
        c.x += (t.x - c.x) * k; c.z += (t.z - c.z) * k;
        let dy = t.yaw - c.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        c.yaw += dy * k;
      }
      c.node.position.set(c.x, 0, c.z);
      c.node.rotation.y = c.yaw;
    }
  }

  count() { return this.map.size; }
  dispose() { for (const c of this.map.values()) c.node.dispose(false, true); this.map.clear(); }
}
````

## FILE: client/src/game/cityRenderer.ts

````ts
// Draws Trashington from the shared layout (the same boxes the game rules collide with).
// PLACEHOLDER-QUALITY ART built from simple shapes, but deliberately styled: toon shading,
// ink outlines, grimy-bright colours, shop signs, parody ads, windows.
// Performance: static meshes are merged by material, so the whole city is a few dozen draw calls.
import {
  Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture, VertexBuffer,
  type ShadowGenerator,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, type ArenaLayout, type Box, type ShopDef } from "@bfb/shared";
import { buildCarParts, buildCopCarParts, buildCopLights } from "./carModel.ts";

const BUILDING_COLORS = [PALETTE.brick, PALETTE.teal, PALETTE.mustard, PALETTE.grape, "#7b6d8d", "#c26b4a", "#5c7a9e", "#8a9a5b"];

const KIND_COLOR: Partial<Record<Box["kind"], string>> = {
  wall: "#b8a38a", crate: PALETTE.cardboard, curb: PALETTE.greyB, "ramp-step": PALETTE.mustard, platform: PALETTE.teal,
  ledge: PALETTE.cardboardDark, slab: PALETTE.grape, sidewalk: "#b3aebb", fence: "#4e4a59", dumpster: "#3f7a4f",
  bench: "#8b5a2b", planter: "#b5653b", fountain: "#9aa3b5", kiosk: "#e2e0d8", van: "#eeeae0", busstop: "#3d6fb5",
  junk: "#8e7a63", counter: "#7a4b2a", roof: "#5a5163",
  plaza: "#b9a88a", shelf: "#9a6a3c", fridge: "#e8eef2", shopfloor: "#d8d0c4", statue: "#9aa3b5",
};
/** Props are drawn by buildProps (static body here, changing parts in PropRenderer). */
const PROP_BOX_KINDS = new Set<Box["kind"]>(["bin", "phone", "vending", "meter", "newsbox", "car", "statue"]);
const TOWER_COLORS = ["#5c7a9e", "#7b6d8d", "#3d8f8a", "#8a9a5b", "#a86a4a", "#6b6f86", "#4f6b7a", "#9a7b5c"];

function hash(x: number, z: number) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** One shared window-grid texture; each facade scales its UVs so windows tile at a fixed size. */
function windowTexture(scene: Scene): Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, 256, 256);
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const lit = r() > 0.5;
    c.fillStyle = lit ? (r() > 0.3 ? "#ffd98a" : "#9fe3ff") : "#2b2433";
    c.fillRect(i * 64 + 14, j * 64 + 12, 36, 42);
    c.strokeStyle = "#1b1420";
    c.lineWidth = 5;
    c.strokeRect(i * 64 + 14, j * 64 + 12, 36, 42);
  }
  const t = new Texture(cv.toDataURL(), scene);
  t.hasAlpha = true;
  return t;
}

/**
 * How far window planes float in front of a facade. The ink outline pass re-draws each building
 * 0.05-0.08 m bigger into the depth buffer, so windows must sit well clear of that shell or they
 * z-fight with it at a distance (the "flickering windows" bug). The material also gets a depth bias.
 */
const WIN_OFF = 0.22;

function scaleUVs(m: Mesh, su: number, sv: number) {
  const uv = m.getVerticesData(VertexBuffer.UVKind);
  if (!uv) return;
  for (let i = 0; i < uv.length; i += 2) { uv[i] *= su; uv[i + 1] *= sv; }
  m.setVerticesData(VertexBuffer.UVKind, uv);
}

export class CityRenderer {
  root: TransformNode;
  private byMaterial = new Map<string, Mesh[]>();

  constructor(private scene: Scene, private arena: ArenaLayout, private shadows: ShadowGenerator | null) {
    this.root = new TransformNode("city", scene);
    this.buildGround();
    const winMat = new StandardMaterial("windows", scene);
    winMat.diffuseTexture = windowTexture(scene);
    winMat.emissiveTexture = winMat.diffuseTexture;
    winMat.disableLighting = true;
    winMat.useAlphaFromDiffuseTexture = true;
    winMat.backFaceCulling = false;
    winMat.zOffset = -2; // polygon offset toward the camera: wins every depth tie with the wall
    winMat.zOffsetUnits = -4;
    const windowPlanes: Mesh[] = [];

    for (const b of arena.boxes) {
      if (b.kind === "fort") continue; // forts drawn separately (they will evolve in Phase 7)
      if (PROP_BOX_KINDS.has(b.kind)) continue;
      const color = b.color ?? (b.kind === "building" ? BUILDING_COLORS[Math.floor(hash(b.x, b.z) * BUILDING_COLORS.length)]
        : b.kind === "tower" ? TOWER_COLORS[Math.floor(hash(b.z, b.x) * TOWER_COLORS.length)] : KIND_COLOR[b.kind] ?? PALETTE.greyA);
      if (b.kind === "tree") { this.tree(b); continue; }
      if (b.kind === "bars") { this.bars(b, color); continue; }
      const m = MeshBuilder.CreateBox("b", { width: b.w, height: b.h, depth: b.d }, scene);
      m.position.set(b.x, b.y, b.z);
      const flat = b.kind === "sidewalk" || b.kind === "curb" || b.kind === "plaza" || b.kind === "shopfloor";
      this.add(m, color, flat ? (b.kind === "shopfloor" ? 0 : 0.02) : b.kind === "tower" ? 0.08 : 0.05, !flat);
      if ((b.kind === "building" || b.kind === "tower") && b.windows) windowPlanes.push(...this.windows(b));
      if (b.sign) this.sign(b);
      this.details(b);
    }
    this.buildProps();
    this.buildShops();
    this.buildDecor();
    if (windowPlanes.length) {
      const merged = Mesh.MergeMeshes(windowPlanes, true, true);
      if (merged) { merged.material = winMat; merged.parent = this.root; merged.isPickable = false; }
    }
    this.buildForts();
    this.buildAds();
    this.flush();
  }

  /** Queue a static mesh for merging (grouped by colour). */
  private add(m: Mesh, color: string, outline = 0.04, castShadow = true) {
    const key = color + "|" + outline + "|" + (castShadow ? 1 : 0);
    (this.byMaterial.get(key) ?? this.byMaterial.set(key, []).get(key)!).push(m);
    m.isPickable = false;
  }

  /**
   * Merge everything queued so far. Colours are baked into vertex colours, so the whole static
   * city is a handful of meshes (one per outline width / shadow flag) instead of one per colour:
   * far fewer draw calls in the 200 m city.
   */
  private flush() {
    const groups = new Map<string, Mesh[]>();
    for (const [key, meshes] of this.byMaterial) {
      const [color, outline, cast] = key.split("|");
      const c = Color3.FromHexString(color);
      for (const m of meshes) {
        const n = m.getTotalVertices();
        const cols = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1; }
        m.setVerticesData(VertexBuffer.ColorKind, cols);
      }
      const gk = outline + "|" + cast;
      (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(...meshes);
    }
    for (const [gk, meshes] of groups) {
      const [outline, cast] = gk.split("|");
      // MergeMeshes needs 32-bit indices for big batches; split very large groups to stay friendly to older GPUs
      for (let i = 0; i < meshes.length; i += 400) {
        const chunk = meshes.slice(i, i + 400);
        const merged = chunk.length > 1 ? Mesh.MergeMeshes(chunk, true, true) : chunk[0];
        if (!merged) continue;
        merged.parent = this.root;
        merged.material = toon(this.scene, "#ffffff", "cityvc");
        merged.useVertexColors = true;
        ink(merged, Number(outline));
        if (Number(outline) === 0) merged.renderOutline = false;
        merged.receiveShadows = true;
        merged.freezeWorldMatrix();
        merged.isPickable = false;
        if (cast === "1" && this.shadows) this.shadows.addShadowCaster(merged);
      }
    }
    this.byMaterial.clear();
  }

  private buildGround() {
    const s = this.arena.halfSize * 2 + 4;
    const ground = MeshBuilder.CreateGround("asphalt", { width: s, height: s }, this.scene);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#57525f"; c.fillRect(0, 0, 128, 128);
    // grime speckles
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { c.fillStyle = r() > 0.5 ? "#4d4855" : "#625c69"; c.fillRect(r() * 128, r() * 128, 2 + r() * 5, 2 + r() * 5); }
    const tex = new Texture(cv.toDataURL(), this.scene);
    tex.uScale = tex.vScale = s / 4;
    tex.anisotropicFilteringLevel = 8;
    const gm = new StandardMaterial("groundMat", this.scene);
    gm.diffuseTexture = tex;
    gm.specularColor = Color3.Black();
    ground.material = gm;
    ground.receiveShadows = true;
    ground.parent = this.root;
    ground.isPickable = false;

  }

  /** Window planes on all four sides of a building (UVs scaled so windows are a constant size). */
  private windows(b: Box): Mesh[] {
    const out: Mesh[] = [];
    const top = b.y + b.h / 2;
    const h = b.kind === "tower" ? b.h - 5.2 : b.h - 1.2; // towers: lobby band at street level
    if (h < 1.5) return out;
    const cy = top - 0.5 - h / 2;
    const faces: [number, number, number, number, number][] = [
      // x, z, rotY, width, offset axis
      [b.x, b.z - b.d / 2 - WIN_OFF, 0, b.w - 1, 0],
      [b.x, b.z + b.d / 2 + WIN_OFF, Math.PI, b.w - 1, 0],
      [b.x - b.w / 2 - WIN_OFF, b.z, Math.PI / 2, b.d - 1, 0],
      [b.x + b.w / 2 + WIN_OFF, b.z, -Math.PI / 2, b.d - 1, 0],
    ];
    for (const [x, z, ry, w] of faces) {
      if (w < 1.5) continue;
      const p = MeshBuilder.CreatePlane("win", { width: w, height: h }, this.scene);
      p.position.set(x, cy, z);
      p.rotation.y = ry;
      scaleUVs(p, Math.max(1, Math.round(w / 1.6)) / 4, Math.max(1, Math.round(h / 2.2)) / 4);
      out.push(p);
    }
    return out;
  }

  /** Jail-cell bars: vertical rods with rails top, middle and bottom (you can see through them). */
  private bars(b: Box, color: string) {
    const sc = this.scene;
    const alongX = b.w >= b.d, len = alongX ? b.w : b.d;
    const bottom = b.y - b.h / 2, top = b.y + b.h / 2;
    const n = Math.max(2, Math.round(len / 0.24));
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len * i) / n;
      const rod = MeshBuilder.CreateBox("bar", { width: 0.06, height: b.h, depth: 0.06 }, sc);
      rod.position.set(b.x + (alongX ? t : 0), b.y, b.z + (alongX ? 0 : t));
      this.add(rod, color, 0.012);
    }
    for (const y of [bottom + 0.08, bottom + 1.2, top - 0.3]) {
      const rail = MeshBuilder.CreateBox("rail", { width: alongX ? len : 0.1, height: 0.1, depth: alongX ? 0.1 : len }, sc);
      rail.position.set(b.x, y, b.z);
      this.add(rail, "#5a6070", 0.015);
    }
  }

  /** Shop sign on the face that looks toward the city centre. */
  private sign(b: Box) {
    const toC = [-b.x, -b.z];
    let nx = 0, nz = 0;
    if (Math.abs(toC[0]) * (b.d / (b.w + b.d)) > Math.abs(toC[1]) * (b.w / (b.w + b.d))) nx = Math.sign(toC[0]); else nz = Math.sign(toC[1]);
    const len = nx ? b.d : b.w;
    const top = b.y + b.h / 2;
    const w = Math.min(len * 0.8, 7);
    const p = MeshBuilder.CreatePlane("sign", { width: w, height: w * 0.22 }, this.scene);
    const y = b.kind === "roof" ? top - 0.9 : b.kind === "tower" ? 5.5 : Math.min(top - 0.6, 2.9);
    p.position.set(b.x + nx * (b.w / 2 + 0.34), y, b.z + nz * (b.d / 2 + 0.34)); // in front of the window planes
    p.rotation.y = Math.atan2(-nx, -nz);
    const bg = ["#f3e2b8", "#ffe14a", "#43c7a6", "#ff8fa3", "#9fe3ff"][Math.floor(hash(b.x, b.z) * 5)];
    p.material = unlitTextured(this.scene, textTexture(this.scene, b.sign!, { w: 1024, h: 220, bg, fg: "#1b1420" }), "signMat");
    p.material.zOffset = -4; p.material.zOffsetUnits = -8; // beats the (biased) windows behind it
    ink(p, 0.05);
    p.parent = this.root;
    p.isPickable = false;
  }

  private details(b: Box) {
    const sc = this.scene;
    const top = b.y + b.h / 2;
    if (b.kind === "tower") {
      // roof clutter: AC units, a water tower on some, a parapet
      const par = MeshBuilder.CreateBox("parapet", { width: b.w + 0.4, height: 0.6, depth: b.d + 0.4 }, sc);
      par.position.set(b.x, top + 0.3, b.z);
      this.add(par, "#4a4652", 0.05);
      for (let i = 0; i < 3; i++) {
        const ac = MeshBuilder.CreateBox("ac", { width: 1.6, height: 1.0, depth: 1.2 }, sc);
        ac.position.set(b.x - b.w / 4 + i * 1.9 * (hash(b.x, i) > 0.5 ? 1 : -0.5), top + 0.5, b.z + (hash(i, b.z) - 0.5) * b.d * 0.5);
        this.add(ac, "#c8c4cc", 0.04);
      }
      if (hash(b.x + 3, b.z) > 0.5) {
        const tank = MeshBuilder.CreateCylinder("tank", { diameter: 2.4, height: 2.2, tessellation: 12 }, sc);
        tank.position.set(b.x + b.w / 4, top + 2.4, b.z - b.d / 4);
        this.add(tank, "#8b5a2b", 0.05);
        const cone = MeshBuilder.CreateCylinder("tankroof", { diameterTop: 0, diameterBottom: 2.6, height: 0.9, tessellation: 12 }, sc);
        cone.position.set(b.x + b.w / 4, top + 3.95, b.z - b.d / 4);
        this.add(cone, "#5a3a24", 0.04);
        for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
          const leg = MeshBuilder.CreateBox("tankleg", { width: 0.15, height: 1.3, depth: 0.15 }, sc);
          leg.position.set(b.x + b.w / 4 + lx, top + 0.65, b.z - b.d / 4 + lz);
          this.add(leg, "#3a3444", 0.02);
        }
      }
      // ground-floor lobby band (a darker strip so the base reads as shops/lobby)
      const band = MeshBuilder.CreateBox("lobby", { width: b.w + 0.1, height: 4, depth: b.d + 0.1 }, sc);
      band.position.set(b.x, 2.15, b.z);
      this.add(band, "#3a3444", 0.05);
    } else if (b.kind === "shelf") {
      // products on three shelf levels
      const long = b.d > b.w;
      const len = long ? b.d : b.w;
      const cols = ["#e14b4b", "#ffcf3a", "#43c7a6", "#4f7fd1", "#ff8fa3", "#f4f1ea", "#8a9a5b"];
      for (const lvl of [0.45, 0.95, 1.45]) {
        const plank = MeshBuilder.CreateBox("plank", { width: long ? b.w + 0.1 : len, height: 0.05, depth: long ? len : b.d + 0.1 }, sc);
        plank.position.set(b.x, lvl - 0.05, b.z);
        this.add(plank, "#6b4a2b", 0.01);
        for (let t = -len / 2 + 0.3; t < len / 2 - 0.2; t += 0.35) {
          const h = 0.2 + hash(t, lvl) * 0.2;
          for (const sd of [-1, 1]) {
            const prod = MeshBuilder.CreateBox("prod", { width: 0.22, height: h, depth: 0.22 }, sc);
            prod.position.set(b.x + (long ? sd * (b.w / 2 + 0.05) : t), lvl + h / 2, b.z + (long ? t : sd * (b.d / 2 + 0.05)));
            this.add(prod, cols[Math.floor(hash(t * 3 + sd, lvl + b.x) * cols.length)], 0);
          }
        }
      }
    } else if (b.kind === "fridge") {
      const glass = MeshBuilder.CreateBox("fridgeglass", { width: b.w > b.d ? b.w - 0.3 : b.w + 0.04, height: b.h - 0.5, depth: b.w > b.d ? b.d + 0.04 : b.d - 0.3 }, sc);
      glass.position.set(b.x, b.y + 0.1, b.z);
      this.add(glass, "#9fe3ff", 0.01);
    } else if (b.kind === "counter") {
      const topSlab = MeshBuilder.CreateBox("countertop", { width: b.w + 0.2, height: 0.06, depth: b.d + 0.2 }, sc);
      topSlab.position.set(b.x, top + 0.03, b.z);
      this.add(topSlab, "#e8e2d4", 0.02);
    } else if (b.kind === "van") {
      const long = b.w > b.d;
      for (const s of [-1, 1]) for (const e of [-1, 1]) {
        const wheel = MeshBuilder.CreateCylinder("wheel", { diameter: 0.8, height: 0.3, tessellation: 10 }, sc);
        wheel.rotation.set(long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0);
        wheel.position.set(b.x + (long ? e * b.w * 0.33 : s * (b.w / 2)), 0.4, b.z + (long ? s * (b.d / 2) : e * b.d * 0.33));
        this.add(wheel, "#222", 0.02);
      }
      const win = MeshBuilder.CreateBox("vanwin", { width: long ? b.w * 0.3 : b.w + 0.04, height: 0.6, depth: long ? b.d + 0.04 : b.d * 0.3 }, sc);
      win.position.set(b.x + (long ? b.w * 0.3 : 0), top - 0.55, b.z + (long ? 0 : b.d * 0.3));
      this.add(win, "#6fb6d9", 0.02);
    } else if (b.kind === "kiosk") {
      const aw = MeshBuilder.CreateBox("awning", { width: b.w + 0.6, height: 0.12, depth: b.d + 0.6 }, sc);
      aw.position.set(b.x, top + 0.06, b.z);
      aw.rotation.x = 0.05;
      this.add(aw, "#e14b4b", 0.03);
    } else if (b.kind === "fountain") {
      const water = MeshBuilder.CreateCylinder("water", { diameter: b.w * 0.8, height: 0.05, tessellation: 20 }, sc);
      water.position.set(b.x, top + 0.03, b.z);
      this.add(water, "#4fb3ff", 0, false);
      const spout = MeshBuilder.CreateCylinder("spout", { diameter: 0.5, height: 1.2, tessellation: 10 }, sc);
      spout.position.set(b.x, top + 0.6, b.z);
      this.add(spout, "#9aa3b5", 0.03);
    } else if (b.kind === "planter") {
      const bush = MeshBuilder.CreateSphere("bush", { diameter: b.w * 0.9, segments: 8 }, sc);
      bush.position.set(b.x, top + 0.3, b.z);
      bush.scaling.y = 0.7;
      this.add(bush, "#5a9e4b", 0.03);
    } else if (b.kind === "busstop") {
      const roof = MeshBuilder.CreateBox("bsroof", { width: b.w + 0.4, height: 0.1, depth: b.d + 0.8 }, sc);
      roof.position.set(b.x, top, b.z);
      this.add(roof, "#2b4f82", 0.03);
    }
  }

  private tree(b: Box) {
    const trunk = MeshBuilder.CreateCylinder("trunk", { diameter: b.w, height: b.h, tessellation: 8 }, this.scene);
    trunk.position.set(b.x, b.y, b.z);
    this.add(trunk, "#7a4b2a", 0.03);
    const canopy = MeshBuilder.CreateSphere("canopy", { diameter: 3.2, segments: 8 }, this.scene);
    canopy.position.set(b.x, b.y + b.h / 2 + 1, b.z);
    this.add(canopy, "#4f9a55", 0.05);
  }

  /** Tier-1 forts: one battered box with a blanket awning, flag in the owner's colour. */
  private buildForts() {
    for (const f of this.arena.forts ?? []) {
      const color = PLAYER_COLORS[f.slot % PLAYER_COLORS.length];
      const node = new TransformNode("fort" + f.slot, this.scene);
      node.position.set(f.x, 0, f.z);
      node.rotation.y = f.yaw;
      node.parent = this.root;
      const part = (m: Mesh, c: string, o = 0.03) => { m.parent = node; m.material = toon(this.scene, c); ink(m, o); m.isPickable = false; this.shadows?.addShadowCaster(m); m.receiveShadows = true; return m; };
      const box = part(MeshBuilder.CreateBox("fortbox", { width: 2.4, height: 1.5, depth: 1.9 }, this.scene), PALETTE.cardboard);
      box.position.y = 0.75;
      box.rotation.z = 0.03;
      const awning = part(MeshBuilder.CreateBox("awning", { width: 2.8, height: 0.05, depth: 1.4 }, this.scene), PALETTE.blanket);
      awning.position.set(0, 1.75, 1.35);
      awning.rotation.x = 0.35;
      for (const sx of [-1.25, 1.25]) {
        const stick = part(MeshBuilder.CreateCylinder("stick", { diameter: 0.07, height: 1.55 }, this.scene), "#6b4a2b", 0.015);
        stick.position.set(sx, 0.78, 1.95);
      }
      const pole = part(MeshBuilder.CreateCylinder("pole", { diameter: 0.06, height: 1.4 }, this.scene), "#6b4a2b", 0.01);
      pole.position.set(0.9, 2.2, -0.3);
      const flag = part(MeshBuilder.CreateBox("flag", { width: 0.7, height: 0.45, depth: 0.03 }, this.scene), color, 0.015);
      flag.position.set(1.25, 2.65, -0.3);
      // drop pad marking in front (Phase 3 uses it for returning loot)
      const pad = MeshBuilder.CreateGround("pad", { width: 5, height: 4 }, this.scene);
      pad.position.set(f.padX, 0.02, f.padZ);
      pad.rotation.y = f.yaw;
      pad.material = toon(this.scene, color, "pad");
      pad.visibility = 0.5;
      pad.parent = this.root;
      const label = MeshBuilder.CreatePlane("fortlabel", { width: 3.2, height: 0.7 }, this.scene);
      label.parent = node;
      label.position.set(0, 2.2, 1.0);
      label.rotation.y = Math.PI;
      label.material = unlitTextured(this.scene, textTexture(this.scene, PLAYER_COLOR_NAMES[f.slot] + "'S FORT", { w: 1024, h: 220, fg: color, stroke: "#1b1420" }), "fortLabel");
      label.isPickable = false;
      // Phase 3: painted yard boundary. Loot resting inside it banks for this fort after 10 s.
      const z = f.zone;
      const w = z.maxX - z.minX, d = z.maxZ - z.minZ, cx = (z.minX + z.maxX) / 2, cz = (z.minZ + z.maxZ) / 2;
      for (const [x, zz, sw, sd] of [[cx, z.minZ, w, 0.22], [cx, z.maxZ, w, 0.22], [z.minX, cz, 0.22, d], [z.maxX, cz, 0.22, d]]) {
        const line = MeshBuilder.CreateBox("yardline", { width: sw, height: 0.03, depth: sd }, this.scene);
        line.position.set(x, 0.035, zz);
        line.material = toon(this.scene, color, "yard");
        line.isPickable = false;
        line.parent = this.root;
      }
    }
  }

  /** Place a mesh at a prop's local offset (x right, z forward, rotated by the prop's yaw). */
  private at(m: Mesh, d: { x: number; y: number; z: number; yaw: number }, lx: number, ly: number, lz: number) {
    const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
    m.position.set(d.x + lx * c + lz * s, d.y + ly, d.z - lx * s + lz * c);
    m.rotation.y = d.yaw;
    return m;
  }

  /** Static bodies of interactable props (the changing bits live in PropRenderer). */
  private buildProps() {
    const sc = this.scene, MB = MeshBuilder;
    for (const d of this.arena.props ?? []) {
      switch (d.kind) {
        case "bin": {
          const can = this.at(MB.CreateCylinder("bin", { diameter: 0.7, height: 0.95, tessellation: 12 }, sc), d, 0, 0.475, 0);
          this.add(can, "#3f6a4f", 0.03);
          const rim = this.at(MB.CreateTorus("binrim", { diameter: 0.7, thickness: 0.06, tessellation: 12 }, sc), d, 0, 0.95, 0);
          this.add(rim, "#2b4a36", 0.01);
          break;
        }
        case "phone": {
          for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) this.add(this.at(MB.CreateBox("post", { width: 0.1, height: 2.3, depth: 0.1 }, sc), d, lx, 1.15, lz), "#2b4f82", 0.02);
          this.add(this.at(MB.CreateBox("roof", { width: 1.2, height: 0.15, depth: 1.2 }, sc), d, 0, 2.35, 0), "#2b4f82", 0.03);
          this.add(this.at(MB.CreateBox("back", { width: 1.0, height: 2.0, depth: 0.06 }, sc), d, 0, 1.1, -0.5), "#bfe8ff", 0.02);
          this.add(this.at(MB.CreateBox("unit", { width: 0.4, height: 0.6, depth: 0.2 }, sc), d, 0, 1.4, -0.38), "#8e8a94", 0.02);
          const sign = this.at(MB.CreatePlane("phsign", { width: 1.0, height: 0.25 }, sc), d, 0, 2.2, 0.62);
          sign.rotation.y = d.yaw + Math.PI;
          sign.material = unlitTextured(sc, textTexture(sc, "PHONE", { w: 256, h: 64, bg: "#2b4f82", fg: "#ffffff" }), "phoneSign");
          sign.parent = this.root;
          break;
        }
        case "vending": {
          this.add(this.at(MB.CreateBox("vend", { width: 1.2, height: 1.9, depth: 0.9 }, sc), d, 0, 0.95, 0), "#d6264a", 0.04);
          this.add(this.at(MB.CreateBox("vendtop", { width: 1.2, height: 0.3, depth: 0.05 }, sc), d, 0, 1.75, 0.46), "#ffe14a", 0);
          this.add(this.at(MB.CreateBox("slot", { width: 0.5, height: 0.2, depth: 0.05 }, sc), d, -0.2, 0.3, 0.46), "#1b1420", 0);
          break;
        }
        case "meter": {
          this.add(this.at(MB.CreateCylinder("pole", { diameter: 0.08, height: 1.0 }, sc), d, 0, 0.5, 0), "#6f6a78", 0.01);
          this.add(this.at(MB.CreateBox("head", { width: 0.28, height: 0.4, depth: 0.2 }, sc), d, 0, 1.15, 0), "#9aa3b5", 0.02);
          this.add(this.at(MB.CreateBox("face", { width: 0.2, height: 0.16, depth: 0.02 }, sc), d, 0, 1.2, 0.11), "#e8e2d4", 0);
          break;
        }
        case "newsbox": {
          this.add(this.at(MB.CreateBox("news", { width: 0.6, height: 0.9, depth: 0.5 }, sc), d, 0, 0.55, 0), "#3d6fb5", 0.03);
          this.add(this.at(MB.CreateBox("newswin", { width: 0.45, height: 0.3, depth: 0.02 }, sc), d, 0, 0.8, 0.26), "#f4f1ea", 0);
          break;
        }
        case "car": {
          for (const [m, color, outline] of buildCarParts(sc, d.color ?? "#d6264a", false)) {
            // parts are built around (0,0,0) facing +z: move them into place
            const lx = m.position.x, ly = m.position.y, lz = m.position.z, ry = m.rotation.y, rz = m.rotation.z;
            this.at(m, d, lx, ly, lz);
            m.rotation.y += ry; m.rotation.z = rz;
            this.add(m, color, outline);
          }
          break;
        }
      }
    }
    // the plaza statue: a proud stone raccoon (the city's founder)
    const st = this.arena.boxes.find((b) => b.kind === "statue");
    if (st) {
      const base = st.y - st.h / 2;
      const body = MB.CreateSphere("stbody", { diameter: 1.3, segments: 10 }, sc); body.position.set(st.x, base + 0.9, st.z); body.scaling.set(1, 1.3, 0.9);
      const head = MB.CreateSphere("sthead", { diameter: 0.8, segments: 10 }, sc); head.position.set(st.x, base + 2.0, st.z + 0.1);
      const tail = MB.CreateCylinder("sttail", { diameter: 0.35, height: 1.4, tessellation: 8 }, sc); tail.position.set(st.x, base + 0.8, st.z - 0.7); tail.rotation.x = 1.0;
      const hat = MB.CreateCylinder("sthat", { diameter: 0.55, height: 0.6, tessellation: 10 }, sc); hat.position.set(st.x, base + 2.6, st.z + 0.1);
      for (const m of [body, head, tail, hat]) this.add(m, "#9aa3b5", 0.04);
      for (const ex of [-0.28, 0.28]) { const ear = MB.CreateSphere("stear", { diameter: 0.25, segments: 6 }, sc); ear.position.set(st.x + ex, base + 2.35, st.z + 0.05); this.add(ear, "#9aa3b5", 0.02); }
      const plaque = MB.CreatePlane("plaque", { width: 2.2, height: 0.45 }, sc);
      plaque.position.set(st.x, 0.55, st.z - 3.56);
      plaque.material = unlitTextured(sc, textTexture(sc, "OUR FOUNDER", { w: 512, h: 100, bg: "#d9a632", fg: "#1b1420" }), "plaque");
      plaque.parent = this.root;
    }
  }

  /** Shop interiors + storefronts: floor, windows, neon OPEN sign, posters, ceiling lights. */
  private buildShops() {
    const sc = this.scene;
    for (const sh of this.arena.shops ?? []) this.buildShop(sh, sc);
  }

  private buildShop(sh: ShopDef, sc: Scene) {
    const r = sh.rect;
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    const fx = Math.sin(sh.cashier.yaw), fz = Math.cos(sh.cashier.yaw); // toward the door
    const halfDepth = Math.abs(fx) > 0.5 ? (r.maxX - r.minX) / 2 : (r.maxZ - r.minZ) / 2;
    const halfWidth = Math.abs(fx) > 0.5 ? (r.maxZ - r.minZ) / 2 : (r.maxX - r.minX) / 2;
    const rx = fz, rz = -fx; // "right" when looking out of the door
    const doorX = cx + fx * (halfDepth + 0.2), doorZ = cz + fz * (halfDepth + 0.2);
    const yawOut = Math.atan2(fx, fz);
    const plane = (w: number, h: number, x: number, y: number, z: number, yaw: number, mat: StandardMaterial | ReturnType<typeof unlitTextured>) => {
      const p = MeshBuilder.CreatePlane("shopdecor", { width: w, height: h }, sc);
      p.position.set(x, y, z); p.rotation.y = yaw; p.material = mat; p.parent = this.root; p.isPickable = false;
      return p;
    };
    // shop windows either side of the door (see-through tint)
    const glass = new StandardMaterial("shopGlass", sc);
    glass.diffuseColor = Color3.FromHexString("#9fe3ff"); glass.emissiveColor = Color3.FromHexString("#2a5a70"); glass.alpha = 0.35; glass.backFaceCulling = false;
    for (const side of [-1, 1]) {
      const off = side * (halfWidth * 0.55 + 0.6);
      plane(4.2, 2.2, doorX + rx * off + fx * 0.05, 1.9, doorZ + rz * off + fz * 0.05, yawOut + Math.PI, glass);
    }
    // neon OPEN sign in the window + a striped awning over the door
    const neon = unlitTextured(sc, textTexture(sc, "OPEN", { w: 256, h: 96, fg: "#ff4fb3", stroke: "#1b1420" }), "neon");
    plane(1.4, 0.5, doorX + rx * (halfWidth * 0.55 + 0.6) + fx * 0.1, 2.6, doorZ + rz * (halfWidth * 0.55 + 0.6) + fz * 0.1, yawOut + Math.PI, neon);
    const awn = MeshBuilder.CreateBox("awning", { width: 5.5, height: 0.1, depth: 1.6 }, sc);
    awn.position.set(doorX + fx * 0.8, 3.15, doorZ + fz * 0.8); awn.rotation.y = yawOut; awn.rotation.x = 0.2;
    this.add(awn, sh.wallColor, 0.03);
    // posters on the inside walls
    const posters = ["SALE: EVERYTHING", "NO LOITERING (PLEASE)", "SMILE, YOU'RE ON CAMERA", "EMPLOYEE OF THE MONTH: NOBODY"];
    for (const [i, side] of [[0, -1], [1, 1]] as const) {
      const px = cx + rx * side * (halfWidth - 0.05), pz = cz + rz * side * (halfWidth - 0.05);
      plane(2.6, 0.9, px, 2.6, pz, yawOut + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI, unlitTextured(sc, textTexture(sc, posters[(sh.id + i) % posters.length], { w: 1024, h: 256, bg: "#ffe14a", fg: "#1b1420" }), "poster"));
    }
    // ceiling light strips
    for (const t of [-0.5, 0.5]) {
      const l = MeshBuilder.CreateBox("ceilLight", { width: Math.abs(fx) > 0.5 ? 0.3 : halfWidth * 1.4, height: 0.08, depth: Math.abs(fx) > 0.5 ? halfWidth * 1.4 : 0.3 }, sc);
      l.position.set(cx + fx * t * halfDepth, 4.35, cz + fz * t * halfDepth);
      this.add(l, "#fffbe0", 0, false);
    }
  }

  /** Lane paint, zebra crossings, street lights, park grass. */
  private buildDecor() {
    const sc = this.scene;
    for (const d of this.arena.decor ?? []) {
      if (d.kind === "dash") {
        const m = MeshBuilder.CreateGround("dash", { width: 0.25, height: 2.5 }, sc);
        m.position.set(d.x, 0.015, d.z); m.rotation.y = d.yaw ?? 0;
        this.add(m, "#e8d56a", 0, false);
      } else if (d.kind === "zebra") {
        // stripes run the way pedestrians walk (yaw); stepped along the road
        const yaw = d.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (let i = -1.5; i <= 1.5; i += 1) {
          const m = MeshBuilder.CreateGround("zebra", { width: 0.55, height: 7.2 }, sc);
          m.position.set(d.x + rx * i, 0.02, d.z + rz * i);
          m.rotation.y = yaw;
          this.add(m, "#f4f1ea", 0, false);
        }
      } else if (d.kind === "streetlight") {
        const pole = MeshBuilder.CreateCylinder("lamppole", { diameter: 0.14, height: 5.2, tessellation: 8 }, sc);
        pole.position.set(d.x, 2.75, d.z);
        this.add(pole, "#3a3444", 0.02);
        const lamp = MeshBuilder.CreateBox("lamp", { width: 0.7, height: 0.2, depth: 0.35 }, sc);
        lamp.position.set(d.x, 5.35, d.z);
        this.add(lamp, "#fff1b0", 0.02, false);
      } else if (d.kind === "copcar") {
        // parked cruiser outside the station (lights off)
        const pose = { x: d.x, y: 0, z: d.z, yaw: d.yaw ?? 0 };
        for (const [m, color, outline] of [...buildCopCarParts(sc), ...buildCopLights(sc).map((l) => [l, "#3a3f55", 0.01] as [Mesh, string, number])]) {
          const lx = m.position.x, ly = m.position.y, lz = m.position.z, rz = m.rotation.z;
          this.at(m, pose, lx, ly, lz);
          m.rotation.z = rz;
          this.add(m, color, outline);
        }
      } else if (d.kind === "grass") {
        const g = MeshBuilder.CreateGround("grass", { width: d.w ?? 10, height: d.d ?? 10 }, sc);
        g.position.set(d.x, 0.012, d.z);
        this.add(g, "#6aa84f", 0, false);
      }
    }
  }

  /** Parody billboards: clearly fictional, never clickable, never ask for money. */
  private buildAds() {
    const ads = [
      { text: "CRUNCHO+ PREMIUM ULTRA", bg: "#ffe14a", fg: "#d6264a", at: [40, 14, 99], ry: 0 },
      { text: "TRASHFLIX: NOW WITH MORE TRASH", bg: "#1f1f2e", fg: "#ff4a6e", at: [99, 14, -40], ry: Math.PI / 2 },
      { text: "BOXLY: IT'S A BOX", bg: "#43c7a6", fg: "#1b1420", at: [-40, 14, -99], ry: Math.PI },
      { text: "VOTE NOBODY FOR MAYOR", bg: "#f3e2b8", fg: "#3b3f8f", at: [-99, 14, 40], ry: -Math.PI / 2 },
      { text: "LAWYERS 4 LESS: WE MIGHT WIN", bg: "#f4f1ea", fg: "#1b1420", at: [-40, 14, 99], ry: 0 },
      { text: "HOTEL ADEQUATE: IT HAS BEDS", bg: "#ff8fa3", fg: "#1b1420", at: [99, 14, 40], ry: Math.PI / 2 },
    ];
    for (const ad of ads) {
      const board = MeshBuilder.CreatePlane("ad", { width: 16, height: 4 }, this.scene);
      board.position.set(ad.at[0], ad.at[1], ad.at[2]);
      board.rotation.y = ad.ry; // front faces the city centre
      board.material = unlitTextured(this.scene, textTexture(this.scene, ad.text, { w: 1024, h: 256, bg: ad.bg, fg: ad.fg }), "adMat");
      ink(board, 0.1);
      board.parent = this.root;
      for (const s of [-5, 5]) {
        const leg = MeshBuilder.CreateBox("adleg", { width: 0.3, height: ad.at[1] - 2, depth: 0.3 }, this.scene);
        const lx = ad.ry === 0 || ad.ry === Math.PI ? ad.at[0] + s : ad.at[0];
        const lz = ad.ry === 0 || ad.ry === Math.PI ? ad.at[2] : ad.at[2] + s;
        leg.position.set(lx, (ad.at[1] - 2) / 2, lz);
        leg.parent = this.root;
        leg.material = toon(this.scene, "#3a3444");
      }
    }
  }
}
````

## FILE: client/src/game/copCarRenderer.ts

````ts
// Phase 4: police cruisers. They come and go (dispatched at 3 stars), glide toward the synced
// position like traffic, and flash red/blue while their siren is on.
import { Scene, TransformNode, StandardMaterial, Color3, type Mesh } from "./babylon.ts";
import { toon, bakeGroup } from "./look.ts";
import { buildCopCarParts, buildCopLights } from "./carModel.ts";
import type { CopCarView } from "@bfb/shared";

interface CopVis { node: TransformNode; x: number; z: number; yaw: number; init: boolean; siren: boolean; lights: [Mesh, Mesh]; }

export class CopCarRenderer {
  private map = new Map<string, CopVis>();
  private targets = new Map<string, CopCarView>();
  private t = 0;
  private red: StandardMaterial; private blue: StandardMaterial; private off: StandardMaterial;

  constructor(private scene: Scene) {
    const mat = (name: string, hex: string) => { const m = new StandardMaterial(name, scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); return m; };
    this.red = mat("copRed", "#ff2a3a"); this.blue = mat("copBlue", "#2a6bff"); this.off = mat("copOff", "#3a3f55");
  }

  private build(id: string): CopVis {
    const node = new TransformNode("copcar-" + id, this.scene);
    for (const [m, c] of buildCopCarParts(this.scene)) { m.parent = node; m.material = toon(this.scene, c); }
    bakeGroup(this.scene, node, 0.035);
    const lights = buildCopLights(this.scene);
    for (const l of lights) { l.parent = node; l.isPickable = false; }
    return { node, x: 0, z: 0, yaw: 0, init: false, siren: true, lights };
  }

  /** Call every frame with the current set of cruisers (missing ones are removed). */
  syncAll(views: { forEach(cb: (v: CopCarView, k: string) => void): void } | undefined) {
    const seen = new Set<string>();
    views?.forEach((v, id) => {
      seen.add(id);
      if (!this.map.has(id)) this.map.set(id, this.build(id));
      this.targets.set(id, { x: v.x, z: v.z, yaw: v.yaw, siren: v.siren });
    });
    for (const [id, c] of this.map) if (!seen.has(id)) { c.node.dispose(false, true); this.map.delete(id); this.targets.delete(id); }
  }

  /** Cruisers with sirens on (for the siren sound). */
  sirens(): { x: number; z: number }[] { return [...this.map.values()].filter((c) => c.siren).map((c) => ({ x: c.x, z: c.z })); }
  positions() { return [...this.map.values()].map((c) => ({ x: c.x, z: c.z, yaw: c.yaw, siren: c.siren })); }
  count() { return this.map.size; }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 20);
    const phase = Math.floor(this.t * 6) % 2;
    for (const [id, c] of this.map) {
      const t = this.targets.get(id);
      if (!t) continue;
      c.siren = t.siren;
      if (!c.init || Math.hypot(t.x - c.x, t.z - c.z) > 8) { c.x = t.x; c.z = t.z; c.yaw = t.yaw; c.init = true; }
      else {
        c.x += (t.x - c.x) * k; c.z += (t.z - c.z) * k;
        let dy = t.yaw - c.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        c.yaw += dy * k;
      }
      c.node.position.set(c.x, 0, c.z);
      c.node.rotation.y = c.yaw;
      c.lights[0].material = c.siren && phase === 0 ? this.red : this.off;
      c.lights[1].material = c.siren && phase === 1 ? this.blue : this.off;
    }
  }

  dispose() { for (const c of this.map.values()) c.node.dispose(false, true); this.map.clear(); }
}
````

## FILE: client/src/game/eventRenderer.ts

````ts
// Phase 3 city events, drawn: the garbage truck, the happy-hour zone ring and the airdrop
// landing marker. PLACEHOLDER-QUALITY shapes in the house style (toon + ink).
import { Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured } from "./look.ts";

export interface EventState {
  evKind: string; evStage: string; evX: number; evZ: number; evR: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}

export class EventRenderer {
  private truck: TransformNode;
  private wheels: Mesh[] = [];
  private beacon: Mesh;
  private beaconMat: StandardMaterial;
  private truckOn = false;
  private zone: Mesh;
  private zoneFill: Mesh;
  private zoneMat: StandardMaterial;
  private drop: TransformNode;
  private t = 0;
  /** where the truck is drawn (for engine sound distance) */
  truckPos: { x: number; z: number } | null = null;

  constructor(scene: Scene) {
    // ---- garbage truck (about 5.5 x 2.6 m, same footprint as the rules use) ----
    const T = (this.truck = new TransformNode("truck", scene));
    const part = (m: Mesh, c: string, o = 0.04) => { m.parent = T; m.material = toon(scene, c); if (o) ink(m, o); m.isPickable = false; return m; };
    const body = part(MeshBuilder.CreateBox("tbody", { width: 2.5, height: 2.2, depth: 3.6 }, scene), "#3f8f4a");
    body.position.set(0, 1.55, -0.8);
    const stripe = part(MeshBuilder.CreateBox("tstripe", { width: 2.55, height: 0.3, depth: 3.62 }, scene), "#ffe14a", 0);
    stripe.position.set(0, 1.2, -0.8);
    const cab = part(MeshBuilder.CreateBox("tcab", { width: 2.4, height: 1.7, depth: 1.6 }, scene), "#e8e2d4");
    cab.position.set(0, 1.3, 1.9);
    const glass = part(MeshBuilder.CreateBox("tglass", { width: 2.2, height: 0.6, depth: 0.05 }, scene), "#2e4a5a", 0);
    glass.position.set(0, 1.75, 2.71);
    const bumper = part(MeshBuilder.CreateBox("tbump", { width: 2.6, height: 0.3, depth: 0.3 }, scene), "#2b2433", 0.02);
    bumper.position.set(0, 0.45, 2.75);
    const scoop = part(MeshBuilder.CreateBox("tscoop", { width: 2.6, height: 0.5, depth: 0.5 }, scene), "#2b2433", 0.02);
    scoop.position.set(0, 0.35, -2.7);
    for (const [x, z] of [[-1.15, 1.9], [1.15, 1.9], [-1.15, -1.8], [1.15, -1.8]]) {
      const w = part(MeshBuilder.CreateCylinder("twheel", { diameter: 0.9, height: 0.35, tessellation: 12 }, scene), "#1b1420", 0.02);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      this.wheels.push(w);
    }
    this.beacon = MeshBuilder.CreateSphere("tbeacon", { diameter: 0.35, segments: 8 }, scene);
    this.beacon.parent = T;
    this.beacon.position.set(0, 2.35, 1.9);
    this.beaconMat = new StandardMaterial("beaconMat", scene);
    this.beaconMat.disableLighting = true;
    this.beaconMat.emissiveColor = Color3.FromHexString("#ff9a1f");
    this.beacon.material = this.beaconMat;
    const sign = MeshBuilder.CreatePlane("tsign", { width: 2.2, height: 0.55 }, scene);
    sign.parent = T;
    sign.position.set(1.27, 1.9, -0.8);
    sign.rotation.y = -Math.PI / 2;
    sign.material = unlitTextured(scene, textTexture(scene, "TRASHINGTON SANITATION", { w: 1024, h: 200, fg: "#ffe14a", stroke: "#1b1420" }), "tsignMat");
    const sign2 = sign.clone("tsign2");
    sign2.parent = T;
    sign2.position.x = -1.27;
    sign2.rotation.y = Math.PI / 2;
    T.setEnabled(false);

    // ---- happy-hour zone: gold ring + faint fill on the ground ----
    this.zoneMat = new StandardMaterial("zoneMat", scene);
    this.zoneMat.disableLighting = true;
    this.zoneMat.emissiveColor = Color3.FromHexString("#ffcf3a");
    this.zoneMat.alpha = 0.85;
    this.zone = MeshBuilder.CreateTorus("hhRing", { diameter: 2, thickness: 0.025, tessellation: 64 }, scene);
    this.zone.material = this.zoneMat;
    this.zone.isPickable = false;
    this.zoneFill = MeshBuilder.CreateDisc("hhFill", { radius: 1, tessellation: 48 }, scene);
    this.zoneFill.rotation.x = Math.PI / 2;
    const fillMat = new StandardMaterial("zoneFillMat", scene);
    fillMat.disableLighting = true;
    fillMat.emissiveColor = Color3.FromHexString("#ffcf3a");
    fillMat.alpha = 0.2;
    this.zoneFill.material = fillMat;
    this.zoneFill.isPickable = false;
    this.zone.setEnabled(false);
    this.zoneFill.setEnabled(false);

    // ---- airdrop landing marker: red target on the ground ----
    this.drop = new TransformNode("dropMark", scene);
    const redMat = new StandardMaterial("dropMat", scene);
    redMat.disableLighting = true;
    redMat.emissiveColor = Color3.FromHexString("#ff3b30");
    for (const r of [2.5, 1.4]) {
      const ring = MeshBuilder.CreateTorus("dropRing", { diameter: r * 2, thickness: 0.12, tessellation: 40 }, scene);
      ring.material = redMat; ring.parent = this.drop; ring.position.y = 0.2; ring.isPickable = false;
    }
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = MeshBuilder.CreateBox("dropX", { width: 2.6, height: 0.04, depth: 0.25 }, scene);
      bar.material = redMat; bar.parent = this.drop; bar.rotation.y = a; bar.position.y = 0.2; bar.isPickable = false;
    }
    this.drop.setEnabled(false);
  }

  update(s: EventState, dt: number) {
    this.t += dt;
    // truck: glide toward the server position (it moves in a straight line at a steady speed)
    if (s.truckOn) {
      const T = this.truck;
      if (!this.truckOn || Math.hypot(T.position.x - s.truckX, T.position.z - s.truckZ) > 6) T.position.set(s.truckX, 0, s.truckZ);
      else {
        const k = 1 - Math.exp(-dt * 10);
        T.position.x += (s.truckX - T.position.x) * k;
        T.position.z += (s.truckZ - T.position.z) * k;
      }
      T.rotation.y = s.truckYaw;
      for (const w of this.wheels) w.rotation.x += dt * 16;
      T.position.y = Math.abs(Math.sin(this.t * 9)) * 0.03; // rumble
      this.beaconMat.emissiveColor = Math.sin(this.t * 12) > 0 ? Color3.FromHexString("#ff9a1f") : Color3.FromHexString("#5a2a00");
      this.truckPos = { x: T.position.x, z: T.position.z };
    } else this.truckPos = null;
    if (s.truckOn !== this.truckOn) { this.truckOn = s.truckOn; this.truck.setEnabled(s.truckOn); }

    const hh = s.evKind === "happyhour" && s.evStage !== "";
    this.zone.setEnabled(hh);
    this.zoneFill.setEnabled(hh);
    if (hh) {
      const pulse = 1 + Math.sin(this.t * 4) * 0.015;
      this.zone.position.set(s.evX, 0.22, s.evZ);
      this.zone.scaling.set(s.evR * pulse, 1, s.evR * pulse);
      this.zoneFill.position.set(s.evX, 0.19, s.evZ);
      this.zoneFill.scaling.set(s.evR, s.evR, 1);
      this.zoneMat.alpha = s.evStage === "warn" ? 0.4 + Math.sin(this.t * 10) * 0.3 : 0.85;
    }
    const drop = s.evKind === "airdrop" && s.evStage !== "";
    this.drop.setEnabled(drop);
    if (drop) { this.drop.position.set(s.evX, 0, s.evZ); this.drop.rotation.y = this.t * 0.8; }
  }

  dispose() { this.truck.dispose(false, true); this.zone.dispose(); this.zoneFill.dispose(); this.drop.dispose(false, true); }
}
````

## FILE: client/src/game/input.ts

````ts
// Keyboard + mouse for first-person play. Uses physical key positions (e.code),
// so WASD works on AZERTY/QWERTZ keyboards too.
import { settings } from "../settings.ts";

export type LootAction = "grab" | "grabEnd" | "drop" | "cycle" | "chargeStart" | "chargeEnd" | "robStart" | "robEnd";

export interface Axes { mx: number; mz: number; sprint: boolean; jump: boolean; crouch: boolean; dodge: boolean; }

// Crouch is C (NOT Ctrl): browsers reserve Ctrl+W to close the tab and games can't block it.
export class FpInput {
  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement;
  enabled = false;
  /** Fallback when the browser/page refuses pointer lock: hold left mouse + drag to look. */
  dragLook = false;
  /** Test hook (only used by automated tests with ?test=1): forces movement axes. */
  override: Axes | null = null;
  /** Loot controls: E grab, G drop, left mouse = punch (empty hands) or hold to throw, F = throw, right mouse / wheel cycles pockets. */
  /** src says whether a charge came from the mouse (empty hands = punch) or the F key (always throws). */
  onAction: ((a: LootAction, src?: "mouse" | "key") => void) | null = null;
  private charging: "mouse" | "key" | null = null;
  /**
   * Phase 4 jail: while frozen you can't move or act; keys and clicks go to `jailKeys` instead
   * (A/D or arrows choose a pin, SPACE or click sets it). Mouse look still works.
   */
  frozen = false;
  jailKeys: ((code: string) => void) | null = null;
  /** while frozen the mouse moves the lock-pick cursor instead of the camera */
  jailMouse: ((dx: number, dy: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("pointermove", this.onMouseMove);
    // pointer events (not mouse events): Babylon cancels the pointer press on the canvas,
    // which makes browsers skip the older mousedown/mouseup events entirely
    canvas.addEventListener("pointerdown", this.onMouseDown);
    window.addEventListener("pointerup", this.onMouseUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", this.onWheel, { passive: true });
  }

  private onMouseDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (this.frozen) { if (e.button === 0) this.jailKeys?.("Mouse0"); return; }
    if (e.button === 0 && this.locked && !this.charging) { this.charging = "mouse"; this.onAction?.("chargeStart", "mouse"); }
    if (e.button === 2) this.onAction?.("cycle");
  };
  private onMouseUp = (e: PointerEvent) => {
    if (e.button === 0 && this.charging === "mouse") { this.charging = null; if (this.enabled) this.onAction?.("chargeEnd", "mouse"); }
  };
  private wheelAcc = 0;
  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    if (this.frozen) { this.jailKeys?.(e.deltaY > 0 ? "WheelDown" : "WheelUp"); return; }
    this.wheelAcc += e.deltaY;
    if (Math.abs(this.wheelAcc) >= 60) { this.wheelAcc = 0; this.onAction?.("cycle"); }
  };

  /** Freeze / unfreeze (jail). Drops held keys and any throw charge so nothing sticks. */
  setFrozen(on: boolean) {
    if (this.frozen === on) return;
    this.frozen = on;
    this.keys.clear();
    this.charging = null;
  }

  /** Cancel an in-progress throw charge (e.g. the item left our hands). */
  cancelCharge() { this.charging = null; }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("pointermove", this.onMouseMove);
  }

  /** Test-only: behave as if the mouse were captured (headless Chrome throttles frames under pointer lock). */
  assumeLocked = false;

  get locked(): boolean {
    return this.assumeLocked || document.pointerLockElement === this.canvas;
  }

  /** Resolves false if the browser refused to capture the mouse. */
  requestLock(): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => { if (!done) { done = true; cleanup(); resolve(v); } };
      const onChange = () => finish(this.locked);
      const onError = () => finish(false);
      const cleanup = () => {
        document.removeEventListener("pointerlockchange", onChange);
        document.removeEventListener("pointerlockerror", onError);
      };
      document.addEventListener("pointerlockchange", onChange);
      document.addEventListener("pointerlockerror", onError);
      setTimeout(() => finish(this.locked), 1500);
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === "function") p.catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (this.frozen) {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (!e.repeat) this.jailKeys?.(e.code);
      return;
    }
    this.keys.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyE") this.onAction?.("grab");
    else if (e.code === "KeyG") this.onAction?.("drop");
    else if (e.code === "KeyR") this.onAction?.("robStart"); // hold R at a shop till
    else if (e.code === "KeyF" && !this.charging) { this.charging = "key"; this.onAction?.("chargeStart", "key"); }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "KeyE" && this.enabled) this.onAction?.("grabEnd");
    if (e.code === "KeyR" && this.enabled) this.onAction?.("robEnd"); // letting go of R stops a hold-up
    if (e.code === "KeyF" && this.charging === "key") { this.charging = null; if (this.enabled) this.onAction?.("chargeEnd", "key"); }
  };
  clear = () => { this.keys.clear(); };

  private lastX: number | null = null;
  private lastY = 0;

  private onMouseMove = (e: PointerEvent) => {
    let dx: number, dy: number;
    if (this.locked) {
      // Ignore absurd spikes some browsers produce when pointer lock engages
      dx = Math.abs(e.movementX) > 400 ? 0 : e.movementX;
      dy = Math.abs(e.movementY) > 400 ? 0 : e.movementY;
    } else {
      // Drag-to-look: measure the pointer ourselves (movementX isn't reliable without pointer lock)
      const held = this.dragLook && (e.buttons & 1) === 1;
      if (!held || this.lastX === null) {
        this.lastX = held ? e.clientX : null;
        this.lastY = e.clientY;
        return;
      }
      dx = e.clientX - this.lastX;
      dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dx *= 1.6; // dragging covers less distance than a captured mouse
      dy *= 1.6;
    }
    if (!this.enabled) return;
    if (this.frozen) { this.jailMouse?.(dx, dy); return; } // camera holds still in jail
    // 0.0022 rad per pixel at sensitivity 1 feels close to common FPS defaults
    const k = 0.0022 * settings.mouseSensitivity;
    this.yaw += dx * k;
    this.pitch += dy * k * (settings.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    const tau = Math.PI * 2;
    this.yaw = ((this.yaw % tau) + tau) % tau;
  };

  private down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Movement axes in -1..1 */
  axes(): Axes {
    if (this.frozen) return { mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false }; // jailed: nothing moves you
    if (this.override) return this.override;
    if (!this.enabled) return { mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false };
    const mz = (this.down("KeyW", "ArrowUp") ? 1 : 0) - (this.down("KeyS", "ArrowDown") ? 1 : 0);
    const mx = (this.down("KeyD", "ArrowRight") ? 1 : 0) - (this.down("KeyA", "ArrowLeft") ? 1 : 0);
    return {
      mx, mz,
      sprint: this.down("ShiftLeft", "ShiftRight"),
      jump: this.down("Space"),
      crouch: this.down("KeyC"),
      dodge: this.down("KeyQ"),
    };
  }
}
````

## FILE: client/src/game/itemRenderer.ts

````ts
// Draws every loot item: loose items (smoothly interpolated), items carried by other
// players (attached to their avatar), your own throws (predicted instantly), rarity
// outlines and a small twinkling sparkle on rare+ loot (Phase 2.5: replaced the sky beams).
import { Scene, MeshBuilder, Mesh, TransformNode, Color3, StandardMaterial, Texture } from "./babylon.ts";
import { buildLootModel } from "./models.ts";
import { textTexture, unlitTextured, toon, ink } from "./look.ts";
import {
  lootDef, hasSparkle, RARITY_COLOR, PLAYER_COLORS, LOCK_TIME, stepItem, type ItemView, type ItemBody, type ArenaLayout, type LootDef,
} from "@bfb/shared";

const INTERP_MS = 110;
/** Sparkles only show within this distance (they're a "look closer" hint, not a map marker). */
export const SPARKLE_DISTANCE = 25;

interface Snap { t: number; x: number; y: number; z: number; rot: number; }

interface ItemVis {
  id: string;
  def: LootDef;
  root: TransformNode;
  meshes: Mesh[];
  sparkles: Mesh[];
  snaps: Snap[];
  view: ItemView;
  /** local prediction of a throw we just made */
  ghost: { body: ItemBody; until: number } | null;
  shown: boolean;
  wobble: number;
  baseOutline: number;
  // Phase 3: banking countdown / BANKED / x2 tag, parachute
  tag: Mesh | null;
  tagKey: string;
  chute: TransformNode | null;
}

export interface AvatarAnchor { x: number; y: number; z: number; yaw: number; }

export interface ItemRenderContext {
  myId: string;
  /** items I'm holding right now (server-confirmed or optimistic), drawn in my hands instead */
  inMyHands: (id: string) => boolean;
  anchorOf: (playerId: string) => AvatarAnchor | null;
  /** camera position (sparkles fade out beyond SPARKLE_DISTANCE) */
  cam?: { x: number; y: number; z: number };
}

function rarityColor(def: LootDef): string {
  return RARITY_COLOR[def.mystery && def.rarity !== "common" ? "mystery" : def.rarity];
}

export class ItemRenderer {
  private map = new Map<string, ItemVis>();
  private sparkleMats = new Map<string, StandardMaterial>();
  private highlighted: string | null = null;
  private time = 0;

  constructor(private scene: Scene, private arena: ArenaLayout) {}

  /** A 4-point cartoon star with a soft glow, one material per rarity colour. */
  private sparkleMat(color: string): StandardMaterial {
    let m = this.sparkleMats.get(color);
    if (!m) {
      const S = 64, cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const c = cv.getContext("2d")!;
      const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, color + "cc"); g.addColorStop(0.35, color + "44"); g.addColorStop(1, color + "00");
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.fillStyle = "#ffffff";
      c.beginPath();
      const r = S * 0.48, w = S * 0.09;
      c.moveTo(S / 2, S / 2 - r); c.quadraticCurveTo(S / 2 + w, S / 2 - w, S / 2 + r, S / 2);
      c.quadraticCurveTo(S / 2 + w, S / 2 + w, S / 2, S / 2 + r); c.quadraticCurveTo(S / 2 - w, S / 2 + w, S / 2 - r, S / 2);
      c.quadraticCurveTo(S / 2 - w, S / 2 - w, S / 2, S / 2 - r); c.fill();
      // DynamicTexture mipmaps come out empty on some GPUs, so load the canvas as an image texture
      const tex = new Texture(cv.toDataURL(), this.scene, false, true);
      tex.hasAlpha = true;
      m = new StandardMaterial("sparkle" + color, this.scene);
      m.diffuseTexture = tex; m.emissiveTexture = tex; m.opacityTexture = tex;
      m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false;
      m.useAlphaFromDiffuseTexture = true;
      this.sparkleMats.set(color, m);
    }
    return m;
  }

  private create(id: string, v: ItemView): ItemVis {
    const def = lootDef(v.type);
    const color = rarityColor(def);
    const outline = def.rarity === "common" && !def.mystery ? undefined : Color3.FromHexString(color);
    const { root, meshes } = buildLootModel(this.scene, v.type, outline);
    const baseOutline = def.rarity === "common" ? 0.022 : 0.03;
    for (const m of meshes) if (m.renderOutline) m.outlineWidth = Math.max(m.outlineWidth, baseOutline);
    const sparkles: Mesh[] = [];
    if (hasSparkle(def)) {
      // more sparkles for better loot: rare 1, epic 2, legendary 3
      const n = def.rarity === "legendary" ? 3 : def.rarity === "epic" ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const sp = MeshBuilder.CreatePlane("sparkle", { size: 1 }, this.scene);
        sp.billboardMode = Mesh.BILLBOARDMODE_ALL;
        sp.material = this.sparkleMat(color);
        sp.isPickable = false;
        sparkles.push(sp);
      }
    }
    return { id, def, root, meshes, sparkles, snaps: [], view: { ...v }, ghost: null, shown: true, wobble: 0, baseOutline, tag: null, tagKey: "", chute: null };
  }

  sync(id: string, v: ItemView, now: number) {
    let it = this.map.get(id);
    if (!it) { it = this.create(id, v); this.map.set(id, it); }
    // Copy only what we need (the view object may be reused by the network layer)
    it.view.type = v.type; it.view.value = v.value; it.view.mode = v.mode;
    it.view.holder = v.holder; it.view.holder2 = v.holder2; it.view.resting = v.resting;
    it.view.x = v.x; it.view.y = v.y; it.view.z = v.z; it.view.rot = v.rot;
    it.view.lock = v.lock ?? 0; it.view.fort = v.fort ?? -1; it.view.mult = v.mult ?? 1; it.view.chute = !!v.chute;
    const last = it.snaps[it.snaps.length - 1];
    if (!last || last.x !== v.x || last.y !== v.y || last.z !== v.z || last.rot !== v.rot || now - last.t > 200) {
      it.snaps.push({ t: now, x: v.x, y: v.y, z: v.z, rot: v.rot });
      if (it.snaps.length > 20) it.snaps.splice(0, it.snaps.length - 20);
    }
  }

  retain(ids: Set<string>) {
    for (const [id, it] of this.map) {
      if (!ids.has(id)) {
        it.root.dispose(false, true);
        for (const sp of it.sparkles) sp.dispose();
        it.tag?.dispose(); it.chute?.dispose(false, true);
        this.map.delete(id);
      }
    }
  }

  /** Start drawing a throw immediately (before the server confirms it). */
  predictThrow(id: string, body: ItemBody, now: number) {
    const it = this.map.get(id);
    if (!it) return;
    it.ghost = { body: { ...body }, until: now + 450 };
  }

  highlight(id: string | null) {
    if (id === this.highlighted) return;
    const old = this.highlighted ? this.map.get(this.highlighted) : undefined;
    if (old) for (const m of old.meshes) if (m.renderOutline) m.outlineWidth = old.baseOutline;
    this.highlighted = id;
    const it = id ? this.map.get(id) : undefined;
    if (it) for (const m of it.meshes) if (m.renderOutline) m.outlineWidth = it.baseOutline * 1.35;
  }

  get(id: string) { return this.map.get(id); }
  entries() { return this.map.values(); }

  /** World position we are currently drawing an item at. */
  drawnPos(id: string): { x: number; y: number; z: number } | null {
    const it = this.map.get(id);
    if (!it || !it.shown) return null;
    return { x: it.root.position.x, y: it.root.position.y, z: it.root.position.z };
  }

  update(now: number, dt: number, ctx: ItemRenderContext) {
    this.time += dt;
    const renderT = now - INTERP_MS;
    for (const it of this.map.values()) {
      const v = it.view;
      let show = true;
      if (v.mode === "pocket") show = false;
      else if (it.def.size !== "giant" && ctx.inMyHands(it.id)) show = false;

      if (show && v.mode === "held" && it.def.size !== "giant") {
        // carried by another player: sits in front of their chest
        const a = ctx.anchorOf(v.holder);
        if (a) {
          const small = it.def.size === "small";
          it.root.position.set(a.x + Math.sin(a.yaw) * (small ? 0.45 : 0.62) + (small ? Math.cos(a.yaw) * 0.25 : 0), a.y + (small ? 1.0 : 1.05), a.z + Math.cos(a.yaw) * (small ? 0.45 : 0.62) - (small ? Math.sin(a.yaw) * 0.25 : 0));
          it.root.rotation.set(0, a.yaw, 0);
        } else {
          it.root.position.set(v.x, v.y, v.z);
        }
      } else if (show && v.mode === "held" && it.def.size === "giant") {
        // giant: between the two carriers (or dragged in front of one), using drawn avatar positions
        const a = ctx.anchorOf(v.holder), b = v.holder2 ? ctx.anchorOf(v.holder2) : null;
        if (a && b) {
          it.root.position.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 1.0, (a.z + b.z) / 2);
          it.root.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, 0);
        } else if (a) {
          const r = it.def.radius;
          it.root.position.set(a.x + Math.sin(a.yaw) * (0.38 + r + 0.1), a.y + r, a.z + Math.cos(a.yaw) * (0.38 + r + 0.1));
          it.root.rotation.set(0, a.yaw, Math.sin(this.time * 9) * 0.04); // scraping wobble
        } else {
          this.placeFromSnaps(it, renderT);
        }
      } else if (show) {
        if (it.ghost && now < it.ghost.until) {
          stepItem(it.ghost.body, it.def.radius, it.def.bounce, this.arena, Math.min(dt, 0.05));
          it.root.position.set(it.ghost.body.x, it.ghost.body.y, it.ghost.body.z);
          it.root.rotation.set(0, it.ghost.body.rot, 0);
        } else {
          if (it.ghost) it.ghost = null;
          this.placeFromSnaps(it, renderT);
        }
        // tumbling in the air looks alive; resting loot sits still
        if (!v.resting) it.wobble += dt * 8; else it.wobble *= 0.9;
        it.root.rotation.x = Math.sin(it.wobble) * 0.25 * (v.resting ? 0 : 1);
      }
      // distance culling: loot beyond 75 m is lost in the fog anyway (big city = lots of items)
      if (show && ctx.cam && v.mode === "free") {
        const p = it.root.position;
        if (Math.abs(p.x - ctx.cam.x) > 75 || Math.abs(p.z - ctx.cam.z) > 75) show = false;
      }
      if (show !== it.shown) {
        it.shown = show;
        it.root.setEnabled(show);
      }
      if (it.sparkles.length) {
        let on = show && v.mode === "free";
        const p = it.root.position;
        if (on && ctx.cam) on = Math.hypot(p.x - ctx.cam.x, p.y - ctx.cam.y, p.z - ctx.cam.z) < SPARKLE_DISTANCE;
        const r = it.def.radius;
        for (let i = 0; i < it.sparkles.length; i++) {
          const sp = it.sparkles[i];
          if (sp.isEnabled() !== on) sp.setEnabled(on);
          if (!on) continue;
          // each star pops in, twinkles and fades on its own offset cycle around the item
          const ph = this.time * 1.6 + i * 2.1 + p.x * 0.7;
          const cyc = ph - Math.floor(ph);
          const size = Math.sin(cyc * Math.PI) ** 2 * (0.22 + r * 0.9);
          const ang = Math.floor(ph) * 2.4 + i * 1.7;
          sp.position.set(p.x + Math.cos(ang) * (r + 0.08), p.y + r * 0.6 + 0.1 + cyc * 0.18, p.z + Math.sin(ang) * (r + 0.08));
          sp.scaling.setAll(Math.max(0.001, size));
        }
      }
      this.updateTag(it, show, ctx);
      this.updateChute(it, show);
    }
  }

  private tagMats = new Map<string, StandardMaterial>();

  /** Floating tag: banking countdown ("7"), "BANKED" in the owner's colour, or "x2" during happy hour. */
  private updateTag(it: ItemVis, show: boolean, ctx: ItemRenderContext) {
    const v = it.view;
    let key = "";
    if (show && v.mode === "free") {
      if (v.lock >= 100) key = "BANKED|" + v.fort;
      else if (v.lock > 0) key = String(Math.max(1, Math.ceil(LOCK_TIME * (1 - v.lock / 100)))) + "|" + v.fort;
      else if (v.mult > 1) key = "x2|gold";
    }
    const p = it.root.position;
    if (key && ctx.cam && Math.hypot(p.x - ctx.cam.x, p.z - ctx.cam.z) > 30) key = "";
    if (key !== it.tagKey) {
      it.tagKey = key;
      it.tag?.dispose(); it.tag = null;
      if (key) {
        let mat = this.tagMats.get(key);
        if (!mat) {
          const [text, who] = key.split("|");
          const color = who === "gold" ? "#ffcf3a" : PLAYER_COLORS[Number(who) % PLAYER_COLORS.length] ?? "#ffffff";
          mat = unlitTextured(this.scene, textTexture(this.scene, text, { w: 512, h: 160, fg: text === "BANKED" || who === "gold" ? color : "#ffffff", stroke: "#1b1420" }), "tag");
          this.tagMats.set(key, mat);
        }
        const wide = key.startsWith("BANKED");
        it.tag = MeshBuilder.CreatePlane("itemTag", { width: wide ? 0.8 : 0.55, height: wide ? 0.25 : 0.32 }, this.scene);
        it.tag.material = mat;
        it.tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
        it.tag.isPickable = false;
      }
    }
    if (it.tag) it.tag.position.set(p.x, p.y + it.def.radius + 0.45 + Math.sin(this.time * 3 + p.x) * 0.04, p.z);
  }

  /** Airdrop crate parachute (shown while it floats down). */
  private updateChute(it: ItemVis, show: boolean) {
    const on = show && it.view.chute && it.view.mode === "free";
    if (on && !it.chute) {
      const c = (it.chute = new TransformNode("chute", this.scene));
      const canopy = MeshBuilder.CreateSphere("canopy", { diameter: 3.4, segments: 12, slice: 0.5 }, this.scene);
      canopy.material = toon(this.scene, "#e14b4b");
      ink(canopy, 0.05);
      canopy.parent = c; canopy.position.y = 2.6; canopy.scaling.y = 0.6; canopy.isPickable = false;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const rope = MeshBuilder.CreateCylinder("rope", { diameter: 0.03, height: 2.5 }, this.scene);
        rope.material = toon(this.scene, "#f4f1ea");
        rope.parent = c; rope.position.set(x * 0.6, 1.4, z * 0.6); rope.rotation.set(z * 0.25, 0, -x * 0.25); rope.isPickable = false;
      }
    }
    if (!on && it.chute) { it.chute.dispose(false, true); it.chute = null; }
    if (it.chute) {
      const p = it.root.position;
      it.chute.position.set(p.x, p.y, p.z);
      it.chute.rotation.set(Math.sin(this.time * 1.3) * 0.08, this.time * 0.3, Math.cos(this.time * 1.1) * 0.08);
    }
  }

  private placeFromSnaps(it: ItemVis, renderT: number) {
    const s = it.snaps;
    if (!s.length) return;
    let a = s[0], b = s[0];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i].t <= renderT) { a = s[i]; b = s[Math.min(i + 1, s.length - 1)]; break; }
    }
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    it.root.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    it.root.rotation.y = a.rot + (b.rot - a.rot) * k;
  }

  dispose() {
    for (const it of this.map.values()) { it.root.dispose(false, true); for (const sp of it.sparkles) sp.dispose(); it.tag?.dispose(); it.chute?.dispose(false, true); }
    this.map.clear();
  }
}
````

## FILE: client/src/game/lockpickUI.ts

````ts
// Phase 4 jail: the lock-picking minigame screen. Runs the SAME lock simulation as the server
// (shared/lockpick.ts) on the same seed, so what you see is exactly what the server checks.
// Each press is sent to the server with the lock-clock time it happened at.
import {
  newLockRun, lockPress, lockUpdate, pinPos, bindingPin, tensionLeft, LOCK,
  type LockRun, type LockResult,
} from "@bfb/shared";
import { sfx } from "../audio.ts";

const W = 640, H = 380;

export class LockpickUI {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private timerEl: HTMLDivElement;
  run: LockRun | null = null;
  seed = 0;
  sel = 0;
  // The lock clock (seconds since you were locked up). It advances with the same capped frame
  // step the game uses, and never runs ahead of the synced jail timer by more than a hair, so a
  // slow machine or a laggy connection never makes the server see a press "from the future".
  private clock = 0;
  private lastWall = 0;
  private msg = ""; private msgT = 0; private msgColor = "#fff";
  private shake = 0;
  private lastTick = 0;
  /** press to send to the server: (pin, lockTime) */
  onPress: ((pin: number, t: number) => void) | null = null;
  /** last results, for tests */
  history: LockResult[] = [];
  /** the pick cursor (canvas pixels): the mouse moves it while you're locked up; the camera stays put */
  cx = W / 2; cy = 200;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "jail";
    this.root.className = "jail hidden";
    this.root.innerHTML = `
      <div class="jail-title">BUSTED! <span>You're in the Trashington PD lock-up</span></div>
      <div class="jail-timer" id="jail-timer"></div>
      <canvas id="lockpick" width="${W}" height="${H}"></canvas>
      <div class="jail-help"><b>MOUSE</b> moves your pick: <b>CLICK</b> a pin to try it (or <b>A / D</b>). Find the <b>STUCK</b> one, then <b>CLICK</b> / <b>SPACE</b> while its top is in the green. Slips make noise.</div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.g = this.canvas.getContext("2d")!;
    this.timerEl = this.root.querySelector("#jail-timer")!;
    // without mouse capture (drag-look fallback, touchpads), the canvas takes real clicks too
    const toCanvas = (e: PointerEvent) => { const r = this.canvas.getBoundingClientRect(); this.cx = ((e.clientX - r.left) / r.width) * W; this.cy = ((e.clientY - r.top) / r.height) * H; };
    this.canvas.addEventListener("pointermove", toCanvas);
    this.canvas.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.stopPropagation(); toCanvas(e); this.key("Mouse0"); });
  }

  /** Mouse movement while captured (from the input system). */
  mouse(dx: number, dy: number) {
    this.cx = Math.max(20, Math.min(W - 20, this.cx + dx));
    this.cy = Math.max(20, Math.min(H - 20, this.cy + dy));
  }

  /** Channel geometry (shared by drawing and clicking). */
  private layout(n: number) {
    const chW = 52, gap = (W - 160 - n * chW) / Math.max(1, n - 1);
    return { chW, gap, top: 50, bot: 230, x: (i: number) => 80 + i * (chW + gap) };
  }

  /** Which pin the pick cursor is over (-1 = none). */
  hoverPin(): number {
    const r = this.run;
    if (!r) return -1;
    const L = this.layout(r.def.pins.length);
    for (let i = 0; i < r.def.pins.length; i++) {
      const x = L.x(i);
      if (this.cx >= x - 12 && this.cx <= x + L.chW + 12 && this.cy >= L.top - 25 && this.cy <= L.bot + 45) return i;
    }
    return -1;
  }

  get open() { return !!this.run; }

  setHeadline(title: string, sub: string) {
    const el = this.root.querySelector(".jail-title")!;
    el.innerHTML = "";
    el.append(title);
    const span = document.createElement("span"); span.textContent = sub; el.append(span);
  }

  /** Seconds on the lock clock (smooth between frames). */
  now() { return this.clock + Math.min(0.2, (performance.now() - this.lastWall) / 1000); }

  start(seed: number, lockT: number) {
    this.seed = seed;
    this.run = newLockRun(seed);
    this.sel = 0; this.history = []; this.msg = ""; this.shake = 0;
    this.cx = W / 2; this.cy = 200;
    // the lock clock started when you were busted; we find out a little later than the server
    this.clock = Math.max(0, lockT);
    this.lastWall = performance.now();
    this.root.classList.remove("hidden");
  }

  stop() {
    this.run = null;
    this.root.classList.add("hidden");
  }

  /** A/D/arrows/wheel choose a pin, SPACE/click sets it. */
  key(code: string) {
    const r = this.run;
    if (!r || r.solved) return;
    const n = r.def.pins.length;
    if (code === "KeyA" || code === "ArrowLeft" || code === "WheelUp") this.select((this.sel + n - 1) % n);
    else if (code === "KeyD" || code === "ArrowRight" || code === "WheelDown") this.select((this.sel + 1) % n);
    else if (/^Digit[1-6]$/.test(code)) { const i = Number(code.slice(5)) - 1; if (i < n) this.select(i); }
    else if (code === "Mouse0") {
      // click a different pin = move the pick onto it; click the pin you're on (or empty space) = try to set it
      const h = this.hoverPin();
      if (h >= 0 && h !== this.sel) this.select(h); else this.press();
    } else if (code === "Space") this.press(); // (not W: trying to walk shouldn't make noise)
  }

  select(i: number) {
    this.sel = i;
    const r = this.run;
    if (r && bindingPin(r) === i && this.now() >= r.lockUntil) sfx.pickTick(); // that one's stuck: you feel it
  }

  press() {
    const r = this.run;
    if (!r) return;
    const t = this.now();
    const res = lockPress(r, this.sel, t);
    if (res === "ignored") return;
    this.history.push(res);
    this.onPress?.(this.sel, t);
    switch (res) {
      case "set": sfx.pickSet(); this.say("CLICK!", "#7dff9a"); break;
      case "solved": sfx.unlock(); this.say("IT OPENED! GO GO GO!", "#7dff9a"); break;
      case "slip": sfx.pickSlip(); this.say("MISSED THE GREEN! a pin dropped", "#ffb14a"); this.shake = 0.25; break;
      case "wrong": sfx.pickSlip(); this.say("THAT PIN'S LOOSE! find the STUCK one", "#ffb14a"); this.shake = 0.25; break;
      case "guard": sfx.guard(); this.say("GUARD: \"HEY! KNOCK IT OFF!\"", "#ff5a5a"); this.shake = 0.5; break;
      case "locked": this.say("Wait for the guard to walk off...", "#ff5a5a"); break;
    }
  }

  private say(m: string, c: string) { this.msg = m; this.msgColor = c; this.msgT = 1.6; }

  update(dt: number, jailT: number, lockT: number) {
    const r = this.run;
    if (!r) return;
    this.timerEl.textContent = jailT > 0 ? `Released in ${Math.ceil(jailT)} s  ·  or pick the lock and bust out the back` : "";
    this.timerEl.classList.toggle("urgent", jailT <= 8);
    this.clock += Math.min(dt, 0.25);
    this.lastWall = performance.now();
    // never run ahead of the server's lock clock (synced; a little behind because of the network)
    if (this.clock > lockT + 0.35) this.clock = lockT + 0.35;
    // (falling behind is fine: the server replays OUR press times, so pins never jump around here)
    const t = this.now();
    if (lockUpdate(r, t) === "tension") { sfx.pickDrop(); this.say("TENSION GONE! all pins dropped", "#ff5a5a"); this.shake = 0.35; }
    this.msgT -= dt; this.shake = Math.max(0, this.shake - dt);
    // faint ticking while you hold a pin
    if (t - this.lastTick > 0.18) { this.lastTick = t; if (bindingPin(r) === this.sel && !r.solved && t >= r.lockUntil) sfx.pickTick(); }
    this.draw(t);
  }

  private draw(t: number) {
    const g = this.g, r = this.run!;
    const n = r.def.pins.length;
    g.clearRect(0, 0, W, H);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake : 0;
    g.save();
    g.translate(sx, 0);
    // lock body
    g.fillStyle = "#3a3f55"; roundRect(g, 40, 30, W - 80, 250, 22); g.fill();
    g.strokeStyle = "#1b1420"; g.lineWidth = 6; g.stroke();
    g.fillStyle = "#c9a227"; roundRect(g, 60, 190, W - 120, 70, 14); g.fill(); // the plug
    g.stroke();
    const { chW, gap, top, bot } = this.layout(n);
    const travel = bot - top - 30;
    const hover = this.hoverPin();
    const yOf = (h: number) => bot - 20 - h * travel;
    const bound = bindingPin(r);
    const locked = t < r.lockUntil;
    for (let i = 0; i < n; i++) {
      const p = r.def.pins[i];
      const x = 80 + i * (chW + gap);
      const isSet = r.def.order.indexOf(i) < r.set;
      const selected = i === this.sel;
      // channel
      g.fillStyle = "#1b1f2e"; g.fillRect(x, top, chW, bot - top);
      // shear line band (green)
      g.fillStyle = isSet ? "rgba(125,255,154,0.55)" : "rgba(125,255,154,0.28)";
      g.fillRect(x, yOf(p.hi), chW, yOf(p.lo) - yOf(p.hi));
      g.strokeStyle = "#7dff9a"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, yOf(p.hi)); g.lineTo(x + chW, yOf(p.hi)); g.moveTo(x, yOf(p.lo)); g.lineTo(x + chW, yOf(p.lo)); g.stroke();
      // the pin
      let h = isSet ? (p.lo + p.hi) / 2 : selected && !locked ? pinPos(p, t) : 0.04;
      let jx = 0;
      if (selected && !isSet && i === bound && !locked) jx = (Math.random() - 0.5) * 3; // binding: trembles
      if (selected && !isSet && i !== bound && !locked) h = Math.min(1, h + Math.sin(t * 40) * 0.01); // loose: rattles
      const py = yOf(h);
      g.fillStyle = isSet ? "#7dff9a" : "#e8c35a";
      roundRect(g, x + 8 + jx, py, chW - 16, bot - py - 4, 6); g.fill();
      g.strokeStyle = "#1b1420"; g.lineWidth = 3; g.stroke();
      g.fillStyle = "#b08a2a"; g.fillRect(x + 8 + jx, py, chW - 16, 8); // pin top
      // selection
      if (selected) { g.strokeStyle = "#ffe14a"; g.lineWidth = 4; g.strokeRect(x - 3, top - 3, chW + 6, bot - top + 6); }
      else if (i === hover) { g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 3; g.strokeRect(x - 3, top - 3, chW + 6, bot - top + 6); }
      // what you feel through the pick
      if (selected && !isSet && !locked) {
        g.font = "bold 13px sans-serif"; g.textAlign = "center";
        g.fillStyle = i === bound ? "#ffe14a" : "#8e96a8";
        g.font = "bold 15px sans-serif";
        g.fillText(i === bound ? "STUCK!" : "loose", x + chW / 2, bot + 44);
      }
      g.fillStyle = "#f3e2b8"; g.font = "bold 14px sans-serif"; g.textAlign = "center";
      g.fillText(String(i + 1), x + chW / 2, top - 8);
    }
    // the pick, coming in from the left under the selected pin
    const px = 80 + this.sel * (chW + gap) + chW / 2;
    g.strokeStyle = "#cfd6e4"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.moveTo(10, 250); g.lineTo(px - 10, 250); g.lineTo(px, 236); g.stroke();
    g.restore();

    // tension bar
    const left = tensionLeft(r, t), frac = Number.isFinite(left) ? Math.max(0, left / r.def.tension) : 1;
    g.fillStyle = "#1b1420"; roundRect(g, 60, 296, W - 120, 18, 9); g.fill();
    g.fillStyle = !Number.isFinite(left) ? "#5a6070" : frac < 0.3 ? "#ff5a5a" : "#ffcf3a";
    roundRect(g, 62, 298, Math.max(0, (W - 124) * frac), 14, 7); g.fill();
    g.fillStyle = "#f3e2b8"; g.font = "bold 13px sans-serif"; g.textAlign = "left";
    g.fillText(Number.isFinite(left) ? `TENSION ${left.toFixed(1)} s` : "TENSION (starts at the first pin)", 64, 332);
    // noise pips
    g.textAlign = "right";
    g.fillText("NOISE", W - 130, 332);
    for (let i = 0; i < LOCK.slipsToGuard; i++) {
      g.beginPath(); g.arc(W - 110 + i * 22, 327, 7, 0, Math.PI * 2);
      g.fillStyle = i < r.noise ? "#ff5a5a" : "#3a3f55"; g.fill();
      g.strokeStyle = "#1b1420"; g.lineWidth = 2; g.stroke();
    }
    // pins set
    g.textAlign = "center"; g.fillStyle = r.set > 0 ? "#7dff9a" : "#f3e2b8";
    g.fillText(`PINS ${r.set} / ${n}`, W / 2, 332);
    // guard lockout
    if (t < r.lockUntil) {
      g.fillStyle = "rgba(20,10,20,0.72)"; g.fillRect(40, 30, W - 80, 250);
      g.fillStyle = "#ff5a5a"; g.font = "bold 30px sans-serif";
      g.fillText("THE GUARD IS WATCHING", W / 2, 140);
      g.fillStyle = "#f3e2b8"; g.font = "bold 18px sans-serif";
      g.fillText(`look innocent for ${(r.lockUntil - t).toFixed(1)} s`, W / 2, 175);
    }
    if (r.solved) {
      g.fillStyle = "rgba(20,60,30,0.75)"; g.fillRect(40, 30, W - 80, 250);
      g.fillStyle = "#7dff9a"; g.font = "bold 34px sans-serif"; g.fillText("CLICK! YOU'RE OUT!", W / 2, 160);
    }
    // the pick cursor
    g.save();
    g.translate(this.cx, this.cy);
    g.rotate(-0.6);
    g.fillStyle = "#cfd6e4"; g.strokeStyle = "#1b1420"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 4); g.lineTo(3, 26); g.lineTo(-3, 26); g.lineTo(-5, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#d6264a"; g.fillRect(-5, 22, 10, 14); g.strokeRect(-5, 22, 10, 14);
    g.restore();
    if (this.msgT > 0 && !r.solved) {
      g.globalAlpha = Math.min(1, this.msgT * 2);
      g.fillStyle = this.msgColor; g.font = "bold 22px sans-serif"; g.textAlign = "center";
      g.fillText(this.msg, W / 2, 364);
      g.globalAlpha = 1;
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
````

## FILE: client/src/game/look.ts

````ts
// Shared "look" helpers: toon materials + thick outlines. This is the start of the
// Box Fort Banditz art style; it will be refined in the art/polish phases.
import { CellMaterial, Color3, DynamicTexture, Mesh, VertexBuffer, type Scene, type TransformNode, StandardMaterial } from "./babylon.ts";

const cache = new Map<string, CellMaterial>();

/** Cel-shaded material (hard light/shadow bands = cartoon look). Cached per colour. */
export function toon(scene: Scene, hex: string, name = "toon"): CellMaterial {
  const key = scene.uid + hex + name;
  let m = cache.get(key);
  if (!m) {
    m = new CellMaterial(`${name}-${hex}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.computeHighLevel = true;
    cache.set(key, m);
  }
  return m;
}

export const OUTLINE = Color3.FromHexString("#1b1420");

/** Thick dark outline around a mesh (the "inked" cartoon edge). */
export function ink(mesh: Mesh, width = 0.035): Mesh {
  mesh.renderOutline = true;
  mesh.outlineColor = OUTLINE;
  mesh.outlineWidth = width;
  return mesh;
}

/**
 * Performance helper for animated characters: merges all meshes directly under `node`
 * into ONE mesh that keeps each part's colour (baked as vertex colours) and moves with
 * `node`. Cuts a pedestrian from ~25 draw calls (+25 outline passes) to ~7.
 * Call once right after building, while the character is still at the origin.
 */
export function bakeGroup(scene: Scene, node: TransformNode, outline = 0.022): Mesh | null {
  // only plain toon-coloured parts (textured decals like signs keep their own mesh)
  const parts = node.getChildMeshes(true).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0 && !m.billboardMode && m.material instanceof CellMaterial && m.visibility === 1);
  if (parts.length === 0) return null;
  // make sure every world matrix in the chain is current (the parts are baked in world space)
  let top: TransformNode = node;
  while (top.parent) top = top.parent as TransformNode;
  top.computeWorldMatrix(true);
  for (const d of top.getDescendants(false)) (d as TransformNode).computeWorldMatrix?.(true);
  for (const m of parts) {
    const c = (m.material as CellMaterial | null)?.diffuseColor ?? Color3.White();
    const n = m.getTotalVertices();
    const cols = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = 1; }
    m.setVerticesData(VertexBuffer.ColorKind, cols);
  }
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) return null;
  merged.material = toon(scene, "#ffffff", "vc");
  merged.useVertexColors = true;
  merged.isPickable = false;
  merged.setParent(node);
  if (outline > 0) ink(merged, outline);
  return merged;
}

/** Colour palette: bright but a bit grimy. */
export const PALETTE = {
  cardboard: "#c9955b",
  cardboardDark: "#a8743f",
  tape: "#e8d9a8",
  asphalt: "#4a4652",
  sidewalk: "#9c96a0",
  brick: "#b3553f",
  teal: "#3d8f8a",
  mustard: "#d9a632",
  grape: "#6b4c9a",
  blanket: "#4f7fd1",
  cone: "#ff7a1f",
  skin: "#f0b98a",
  greyA: "#8e8a94",
  greyB: "#a9a4ad",
  greyC: "#6f6a78",
};

/** A text texture for signs/name tags. */
export function textTexture(scene: Scene, text: string, opts: {
  w?: number; h?: number; bg?: string; fg?: string; font?: string; stroke?: string;
} = {}): DynamicTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const tex = new DynamicTexture("txt-" + text, { width: w, height: h }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, w, h);
  if (opts.bg) {
    c.fillStyle = opts.bg;
    c.fillRect(0, 0, w, h);
  }
  // Shrink the font until the text fits (long bandit names must never be cut off)
  let size = Math.floor(h * 0.62);
  const fontFor = (px: number) => opts.font ?? `bold ${px}px "Bungee", "Arial Black", sans-serif`;
  c.font = fontFor(size);
  while (!opts.font && size > 10 && c.measureText(text).width > w * 0.92) {
    size -= 2;
    c.font = fontFor(size);
  }
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (opts.stroke) {
    c.lineWidth = h * 0.1;
    c.strokeStyle = opts.stroke;
    c.lineJoin = "round";
    c.strokeText(text, w / 2, h / 2 + h * 0.04);
  }
  c.fillStyle = opts.fg ?? "#fff";
  c.fillText(text, w / 2, h / 2 + h * 0.04);
  tex.hasAlpha = !opts.bg;
  tex.update();
  return tex;
}

/** Unlit material showing a texture (signs, name tags, windows). */
export function unlitTextured(scene: Scene, tex: DynamicTexture, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.disableLighting = true;
  m.useAlphaFromDiffuseTexture = tex.hasAlpha;
  m.backFaceCulling = false;
  return m;
}
````

## FILE: client/src/game/models.ts

````ts
// Loot models: chunky placeholder shapes with ink outlines. Each model is built around its
// origin at the item's collision-sphere centre, sized to roughly match that sphere.
import { Scene, MeshBuilder, Mesh, TransformNode, StandardMaterial, Color3 } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured, bakeGroup } from "./look.ts";

type Part = (m: Mesh, color: string, outline?: number) => Mesh;

export function buildLootModel(scene: Scene, type: string, outlineColor?: Color3): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode("loot-" + type, scene);
  const meshes: Mesh[] = [];
  // outline 0 = thin decal (screens, labels, slots): no ink shell, or it would cover the decal
  const P: Part = (m, color, outline = 0.025) => {
    m.parent = root;
    m.material = toon(scene, color, "loot");
    if (outline > 0) {
      ink(m, outline);
      if (outlineColor) m.outlineColor = outlineColor;
    }
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const MB = MeshBuilder;
  switch (type) {
    case "rubber_chicken": {
      const body = P(MB.CreateCapsule("b", { radius: 0.09, height: 0.32 }, scene), "#ffe14a");
      body.rotation.z = Math.PI / 2;
      const head = P(MB.CreateSphere("h", { diameter: 0.13, segments: 8 }, scene), "#ffe14a");
      head.position.set(0.17, 0.08, 0);
      const comb = P(MB.CreateBox("c", { width: 0.06, height: 0.06, depth: 0.02 }, scene), "#e14b4b", 0.01);
      comb.position.set(0.17, 0.16, 0);
      const beak = P(MB.CreateCylinder("k", { diameterTop: 0, diameterBottom: 0.05, height: 0.07, tessellation: 6 }, scene), "#ff8a1f", 0.01);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.25, 0.07, 0);
      break;
    }
    case "mixtape": {
      P(MB.CreateBox("b", { width: 0.22, height: 0.03, depth: 0.14 }, scene), "#2b2433");
      for (const x of [-0.05, 0.05]) {
        const r = P(MB.CreateCylinder("r", { diameter: 0.04, height: 0.035, tessellation: 8 }, scene), "#f3e2b8", 0.005);
        r.position.set(x, 0.001, 0);
      }
      const label = P(MB.CreateBox("l", { width: 0.18, height: 0.032, depth: 0.04 }, scene), "#ff5a3c", 0);
      label.position.z = -0.045;
      break;
    }
    case "cursed_sneakers": {
      for (const x of [-0.07, 0.07]) {
        const shoe = P(MB.CreateBox("s", { width: 0.11, height: 0.1, depth: 0.28 }, scene), "#9b5cff");
        shoe.position.set(x, 0.01, 0);
        shoe.rotation.y = x * 2;
        const sole = P(MB.CreateBox("o", { width: 0.12, height: 0.035, depth: 0.3 }, scene), "#ffffff", 0.01);
        sole.position.set(x, -0.055, 0);
        sole.rotation.y = x * 2;
      }
      break;
    }
    case "snow_globe": {
      const base = P(MB.CreateCylinder("b", { diameter: 0.2, height: 0.08, tessellation: 12 }, scene), "#8b5a2b");
      base.position.y = -0.1;
      const glass = P(MB.CreateSphere("g", { diameter: 0.24, segments: 12 }, scene), "#bfe8ff", 0.01);
      glass.position.y = 0.04;
      glass.visibility = 0.55;
      const fort = P(MB.CreateBox("f", { width: 0.07, height: 0.05, depth: 0.06 }, scene), "#c9955b", 0.005);
      fort.position.y = -0.02;
      break;
    }
    case "lucky_pigeon": {
      const ped = P(MB.CreateCylinder("p", { diameter: 0.2, height: 0.1, tessellation: 10 }, scene), "#d4af37");
      ped.position.y = -0.12;
      const body = P(MB.CreateSphere("b", { diameter: 0.22, segments: 10 }, scene), "#9aa3b5");
      body.scaling.set(1, 0.8, 1.3);
      body.position.y = 0.0;
      const head = P(MB.CreateSphere("h", { diameter: 0.11, segments: 8 }, scene), "#6f7a91");
      head.position.set(0, 0.1, 0.11);
      const beak = P(MB.CreateCylinder("k", { diameterTop: 0, diameterBottom: 0.03, height: 0.05, tessellation: 6 }, scene), "#ffcf3a", 0.005);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.09, 0.18);
      break;
    }
    case "golden_spork": {
      const handle = P(MB.CreateBox("h", { width: 0.035, height: 0.02, depth: 0.26 }, scene), "#ffcf3a", 0.01);
      handle.position.z = -0.05;
      const bowl = P(MB.CreateSphere("b", { diameter: 0.1, segments: 8 }, scene), "#ffcf3a", 0.01);
      bowl.scaling.set(1, 0.3, 1.2);
      bowl.position.z = 0.1;
      for (const x of [-0.025, 0, 0.025]) {
        const tine = P(MB.CreateBox("t", { width: 0.01, height: 0.012, depth: 0.05 }, scene), "#ffcf3a", 0.004);
        tine.position.set(x, 0, 0.16);
      }
      break;
    }
    case "traffic_cone": {
      const cone = P(MB.CreateCylinder("c", { diameterTop: 0.05, diameterBottom: 0.36, height: 0.56, tessellation: 14 }, scene), "#ff7a1f");
      cone.position.y = 0.02;
      const band = P(MB.CreateCylinder("w", { diameterTop: 0.2, diameterBottom: 0.25, height: 0.09, tessellation: 14 }, scene), "#ffffff", 0.01);
      band.position.y = 0.05;
      const base = P(MB.CreateBox("b", { width: 0.46, height: 0.05, depth: 0.46 }, scene), "#ff7a1f");
      base.position.y = -0.27;
      break;
    }
    case "cardboard_cutout": {
      const board = P(MB.CreateBox("b", { width: 0.45, height: 0.7, depth: 0.03 }, scene), "#c9955b");
      board.position.y = 0.02;
      const face = MB.CreatePlane("f", { width: 0.38, height: 0.38 }, scene);
      face.parent = root;
      face.position.set(0, 0.17, -0.017);
      face.material = unlitTextured(scene, textTexture(scene, "=)", { w: 256, h: 256, bg: "#f0b98a", fg: "#1b1420" }), "cutoutFace");
      meshes.push(face);
      const leg = P(MB.CreateBox("l", { width: 0.05, height: 0.3, depth: 0.2 }, scene), "#a8743f");
      leg.position.set(0, -0.2, 0.1);
      leg.rotation.x = 0.5;
      break;
    }
    case "trash_bag": {
      const bag = P(MB.CreateSphere("b", { diameter: 0.62, segments: 10 }, scene), "#2b2b33");
      bag.scaling.set(1, 0.85, 0.95);
      const knot = P(MB.CreateSphere("k", { diameter: 0.14, segments: 6 }, scene), "#2b2b33");
      knot.position.y = 0.28;
      const glint = P(MB.CreateBox("g", { width: 0.08, height: 0.08, depth: 0.02 }, scene), "#ffcf3a", 0);
      glint.position.set(0.12, 0.05, -0.28);
      break;
    }
    case "gold_sign": {
      const board = MB.CreateBox("b", { width: 0.72, height: 0.36, depth: 0.04 }, scene);
      board.parent = root;
      board.position.y = 0.12;
      const mat = new StandardMaterial("goldsign", scene);
      mat.diffuseTexture = textTexture(scene, "WE BUY GOLD", { w: 512, h: 256, bg: "#ffe14a", fg: "#c0392b" });
      mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
      board.material = mat;
      ink(board, 0.025);
      if (outlineColor) board.outlineColor = outlineColor;
      meshes.push(board);
      const pole = P(MB.CreateCylinder("p", { diameter: 0.05, height: 0.5, tessellation: 8 }, scene), "#6f6a78");
      pole.position.y = -0.2;
      break;
    }
    case "crt_tv": {
      const box = P(MB.CreateBox("b", { width: 0.62, height: 0.5, depth: 0.52 }, scene), "#d8cfb8");
      const screen = P(MB.CreateBox("s", { width: 0.46, height: 0.36, depth: 0.02 }, scene), "#2e4a5a", 0);
      screen.position.set(-0.03, 0.02, -0.265);
      const knob = P(MB.CreateCylinder("k", { diameter: 0.06, height: 0.03, tessellation: 8 }, scene), "#6f6a78", 0);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.25, 0.1, -0.27);
      for (const s of [-1, 1]) {
        const ant = P(MB.CreateCylinder("a", { diameter: 0.015, height: 0.35, tessellation: 6 }, scene), "#3a3444", 0.004);
        ant.position.set(s * 0.1, 0.38, 0.05);
        ant.rotation.z = -s * 0.5;
      }
      void box;
      break;
    }
    case "giant_toaster": {
      P(MB.CreateBox("b", { width: 0.7, height: 0.46, depth: 0.42 }, scene), "#c9ced8");
      for (const x of [-0.14, 0.14]) {
        const slot = P(MB.CreateBox("s", { width: 0.12, height: 0.02, depth: 0.3 }, scene), "#2b2433", 0);
        slot.position.set(x, 0.235, 0);
        const bread = P(MB.CreateBox("t", { width: 0.1, height: 0.12, depth: 0.26 }, scene), "#d9a05b", 0.01);
        bread.position.set(x, 0.29, 0);
      }
      const lever = P(MB.CreateBox("l", { width: 0.05, height: 0.08, depth: 0.06 }, scene), "#2b2433", 0.005);
      lever.position.set(0.37, 0.05, 0);
      break;
    }
    case "mystery_suitcase": {
      P(MB.CreateBox("b", { width: 0.64, height: 0.44, depth: 0.2 }, scene), "#8b5a2b");
      const handle = P(MB.CreateBox("h", { width: 0.2, height: 0.05, depth: 0.05 }, scene), "#3a2a1a", 0.01);
      handle.position.y = 0.26;
      const q = MB.CreatePlane("q", { width: 0.22, height: 0.22 }, scene);
      q.parent = root;
      q.position.set(0, 0, -0.105);
      q.material = unlitTextured(scene, textTexture(scene, "?", { w: 128, h: 128, fg: "#ffcf3a", stroke: "#1b1420" }), "qmark");
      meshes.push(q);
      break;
    }
    case "arcade_machine": {
      const cab = P(MB.CreateBox("c", { width: 0.8, height: 1.25, depth: 0.7 }, scene), "#6b4c9a");
      cab.position.y = 0.0;
      const screen = P(MB.CreateBox("s", { width: 0.6, height: 0.45, depth: 0.03 }, scene), "#39ffb0", 0);
      screen.position.set(0, 0.25, -0.36);
      const panel = P(MB.CreateBox("p", { width: 0.78, height: 0.08, depth: 0.3 }, scene), "#2b2433", 0.01);
      panel.position.set(0, -0.08, -0.45);
      panel.rotation.x = -0.3;
      const stick = P(MB.CreateSphere("j", { diameter: 0.08, segments: 6 }, scene), "#ff5a3c", 0.005);
      stick.position.set(-0.15, 0.0, -0.5);
      break;
    }
    case "rubber_duck": {
      const body = P(MB.CreateSphere("b", { diameter: 1.3, segments: 14 }, scene), "#ffd23c", 0.04);
      body.scaling.set(1, 0.8, 1.2);
      const head = P(MB.CreateSphere("h", { diameter: 0.75, segments: 12 }, scene), "#ffd23c", 0.04);
      head.position.set(0, 0.55, 0.35);
      const beak = P(MB.CreateSphere("k", { diameter: 0.36, segments: 8 }, scene), "#ff8a1f", 0.03);
      beak.scaling.set(1, 0.45, 1.2);
      beak.position.set(0, 0.5, 0.75);
      for (const x of [-0.17, 0.17]) {
        const eye = P(MB.CreateSphere("e", { diameter: 0.1, segments: 6 }, scene), "#1b1420", 0.01);
        eye.position.set(x, 0.68, 0.66);
      }
      break;
    }
    // ---- pedestrian pocket loot (Phase 2.5) ----
    case "half_sandwich": {
      for (const [y, c] of [[-0.04, "#e8c07a"], [0.0, "#6fbf4a"], [0.02, "#e86a5a"], [0.055, "#e8c07a"]] as const) {
        const s = P(MB.CreateCylinder("s", { diameter: 0.2, height: y === 0 || y === 0.02 ? 0.025 : 0.04, tessellation: 3, arc: 1 }, scene), c, 0.012);
        s.position.y = y; s.scaling.set(1, 1, 0.8);
      }
      break;
    }
    case "pocket_lint": {
      for (const [x, y, d] of [[0, 0, 0.13], [0.06, 0.03, 0.08], [-0.05, 0.02, 0.07]] as const) {
        const b = P(MB.CreateSphere("l", { diameter: d, segments: 6 }, scene), "#9c93a8", 0.01);
        b.position.set(x, y, 0);
      }
      break;
    }
    case "expired_coupon": {
      P(MB.CreateBox("c", { width: 0.2, height: 0.01, depth: 0.11 }, scene), "#fff4b0", 0.008);
      const stamp = P(MB.CreateBox("x", { width: 0.12, height: 0.012, depth: 0.03 }, scene), "#e14b4b", 0);
      stamp.rotation.y = 0.5;
      break;
    }
    case "wrong_map": {
      const m = P(MB.CreateBox("m", { width: 0.24, height: 0.02, depth: 0.16 }, scene), "#bfe0a8", 0.01);
      m.rotation.z = 0.08;
      const route = P(MB.CreateBox("r", { width: 0.16, height: 0.022, depth: 0.012 }, scene), "#e14b4b", 0);
      route.rotation.y = 0.7;
      break;
    }
    case "bread_crumbs": {
      const bag = P(MB.CreateCylinder("b", { diameterTop: 0.12, diameterBottom: 0.18, height: 0.2, tessellation: 8 }, scene), "#d8b98a");
      bag.position.y = -0.02;
      const top = P(MB.CreateSphere("t", { diameter: 0.1, segments: 6 }, scene), "#d8b98a", 0.01);
      top.position.y = 0.1; top.scaling.set(1, 0.6, 1);
      break;
    }
    case "protein_shaker": {
      const cup = P(MB.CreateCylinder("c", { diameter: 0.14, height: 0.26, tessellation: 12 }, scene), "#2fb6ff");
      cup.position.y = -0.02;
      const lid = P(MB.CreateCylinder("l", { diameter: 0.15, height: 0.05, tessellation: 12 }, scene), "#2b2433", 0.012);
      lid.position.y = 0.13;
      break;
    }
    case "disposable_camera": {
      P(MB.CreateBox("b", { width: 0.18, height: 0.1, depth: 0.06 }, scene), "#ffcf3a");
      const lens = P(MB.CreateCylinder("l", { diameter: 0.06, height: 0.03, tessellation: 10 }, scene), "#2b2433", 0.008);
      lens.rotation.x = Math.PI / 2; lens.position.set(0.02, 0, 0.04);
      break;
    }
    case "mime_beret": {
      const b = P(MB.CreateCylinder("b", { diameter: 0.24, height: 0.06, tessellation: 14 }, scene), "#1b1420");
      b.rotation.z = 0.15;
      const nub = P(MB.CreateCylinder("n", { diameter: 0.025, height: 0.04, tessellation: 6 }, scene), "#1b1420", 0.008);
      nub.position.y = 0.05;
      break;
    }
    case "plastic_badge": {
      const star = P(MB.CreateCylinder("s", { diameter: 0.16, height: 0.025, tessellation: 5 }, scene), "#e0e4ea", 0.012);
      star.rotation.x = Math.PI / 2;
      const mid = P(MB.CreateCylinder("m", { diameter: 0.07, height: 0.03, tessellation: 10 }, scene), "#3d5a9e", 0);
      mid.rotation.x = Math.PI / 2;
      break;
    }
    case "fancy_earbuds": {
      const cas = P(MB.CreateCapsule("c", { radius: 0.045, height: 0.13, tessellation: 8 }, scene), "#f4f1ea", 0.01);
      cas.rotation.z = Math.PI / 2;
      break;
    }
    case "bedazzled_phone": {
      P(MB.CreateBox("p", { width: 0.1, height: 0.02, depth: 0.19 }, scene), "#ff6fb5", 0.012);
      for (let i = 0; i < 5; i++) {
        const g = P(MB.CreateSphere("g", { diameter: 0.025, segments: 4 }, scene), i % 2 ? "#bfe8ff" : "#fff4b0", 0);
        g.position.set(-0.03 + (i % 3) * 0.03, 0.013, -0.06 + i * 0.03);
      }
      break;
    }
    case "mystery_wallet": {
      P(MB.CreateBox("w", { width: 0.16, height: 0.04, depth: 0.12 }, scene), "#6b3f24");
      const q = P(MB.CreateBox("q", { width: 0.04, height: 0.042, depth: 0.04 }, scene), "#ffcf3a", 0);
      q.position.x = 0.04;
      break;
    }
    case "rolecks_watch": {
      const face = P(MB.CreateCylinder("f", { diameter: 0.12, height: 0.035, tessellation: 16 }, scene), "#ffcf3a", 0.012);
      face.position.y = 0.01;
      const dial = P(MB.CreateCylinder("d", { diameter: 0.09, height: 0.037, tessellation: 16 }, scene), "#f4f1ea", 0);
      dial.position.y = 0.011;
      for (const z of [-0.09, 0.09]) {
        const strap = P(MB.CreateBox("s", { width: 0.06, height: 0.015, depth: 0.08 }, scene), "#d4af37", 0.008);
        strap.position.set(0, -0.005, z);
      }
      break;
    }
    // ---- Phase 3.5: shop stock, smashed props, parked cars ----
    case "phone_handset": {
      const h = P(MB.CreateBox("h", { width: 0.06, height: 0.05, depth: 0.22 }, scene), "#1b1420", 0.01);
      h.position.y = 0.02;
      for (const z of [-0.1, 0.1]) { const e = P(MB.CreateCylinder("e", { diameter: 0.08, height: 0.05, tessellation: 8 }, scene), "#1b1420", 0.01); e.position.set(0, -0.01, z); }
      const cord = P(MB.CreateTorus("c", { diameter: 0.12, thickness: 0.015, tessellation: 10 }, scene), "#3a3444", 0);
      cord.position.set(0.07, -0.02, 0);
      break;
    }
    case "candy_bar": {
      P(MB.CreateBox("w", { width: 0.2, height: 0.035, depth: 0.07 }, scene), "#8b3fd1", 0.01);
      const band = P(MB.CreateBox("b", { width: 0.08, height: 0.037, depth: 0.072 }, scene), "#ffe14a", 0);
      band.position.x = 0.02;
      break;
    }
    case "soda_can": case "energy_drink": {
      const can = P(MB.CreateCylinder("c", { diameter: 0.13, height: 0.2, tessellation: 12 }, scene), type === "soda_can" ? "#e14b4b" : "#b6ff3c", 0.012);
      can.rotation.z = Math.PI / 2;
      const lab = P(MB.CreateCylinder("l", { diameter: 0.132, height: 0.07, tessellation: 12 }, scene), type === "soda_can" ? "#f4f1ea" : "#1b1420", 0);
      lab.rotation.z = Math.PI / 2;
      break;
    }
    case "coin_pile": {
      for (const [x, y, z] of [[0, -0.03, 0], [0.04, -0.01, 0.03], [-0.03, 0.01, 0.02], [0.01, 0.03, -0.02], [-0.04, -0.03, -0.04]]) {
        const c = P(MB.CreateCylinder("c", { diameter: 0.07, height: 0.015, tessellation: 10 }, scene), "#d4af37", 0.006);
        c.position.set(x, y, z); c.rotation.x = (x + z) * 4;
      }
      break;
    }
    case "newspaper": {
      const n = P(MB.CreateBox("n", { width: 0.26, height: 0.03, depth: 0.18 }, scene), "#e8e2d4", 0.01);
      n.rotation.y = 0.2;
      const hl = P(MB.CreateBox("h", { width: 0.2, height: 0.032, depth: 0.04 }, scene), "#1b1420", 0);
      hl.position.z = -0.05; hl.rotation.y = 0.2;
      break;
    }
    case "donut": {
      const d = P(MB.CreateTorus("d", { diameter: 0.17, thickness: 0.08, tessellation: 14 }, scene), "#d9a05b", 0.012);
      const icing = P(MB.CreateTorus("i", { diameter: 0.17, thickness: 0.07, tessellation: 14 }, scene), "#ff8fc8", 0);
      icing.position.y = 0.018; icing.scaling.y = 0.55; void d;
      break;
    }
    case "gold_bar": {
      const b = P(MB.CreateCylinder("g", { diameterTop: 0.16, diameterBottom: 0.22, height: 0.08, tessellation: 4 }, scene), "#ffcf3a", 0.012);
      b.rotation.y = Math.PI / 4; b.scaling.z = 0.55;
      const shine = P(MB.CreateBox("s", { width: 0.1, height: 0.005, depth: 0.03 }, scene), "#fff6c0", 0);
      shine.position.y = 0.042;
      break;
    }
    case "diamond_ring": {
      const band = P(MB.CreateTorus("b", { diameter: 0.11, thickness: 0.02, tessellation: 14 }, scene), "#ffcf3a", 0.008);
      band.rotation.x = Math.PI / 2;
      const gem = P(MB.CreatePolyhedron("gem", { type: 1, size: 0.045 }, scene), "#bff4ff", 0.008);
      gem.position.y = 0.08;
      break;
    }
    case "money_bag": {
      const bag = P(MB.CreateSphere("bag", { diameter: 0.55, segments: 10 }, scene), "#b99a5c");
      bag.scaling.y = 0.85; bag.position.y = -0.04;
      const neck = P(MB.CreateCylinder("n", { diameterTop: 0.2, diameterBottom: 0.12, height: 0.14, tessellation: 10 }, scene), "#b99a5c", 0.015);
      neck.position.y = 0.25;
      const tie = P(MB.CreateTorus("t", { diameter: 0.14, thickness: 0.03, tessellation: 10 }, scene), "#6b4a2b", 0.01);
      tie.position.y = 0.2;
      const sign = P(MB.CreateBox("s", { width: 0.18, height: 0.22, depth: 0.02 }, scene), "#2f7a3b", 0);
      sign.position.set(0, -0.02, 0.27);
      const bar = P(MB.CreateBox("s2", { width: 0.03, height: 0.26, depth: 0.025 }, scene), "#2f7a3b", 0);
      bar.position.set(0, -0.02, 0.271);
      break;
    }
    case "award_trophy": {
      const base = P(MB.CreateBox("b", { width: 0.22, height: 0.08, depth: 0.22 }, scene), "#3a3444", 0.015);
      base.position.y = -0.2;
      const stem = P(MB.CreateCylinder("s", { diameter: 0.06, height: 0.16, tessellation: 8 }, scene), "#ffcf3a", 0.012);
      stem.position.y = -0.09;
      const cup = P(MB.CreateCylinder("c", { diameterTop: 0.3, diameterBottom: 0.1, height: 0.24, tessellation: 12 }, scene), "#ffcf3a", 0.015);
      cup.position.y = 0.11;
      for (const sx of [-1, 1]) { const h = P(MB.CreateTorus("h", { diameter: 0.12, thickness: 0.025, tessellation: 10 }, scene), "#ffcf3a", 0.008); h.rotation.z = Math.PI / 2; h.position.set(sx * 0.16, 0.12, 0); }
      break;
    }
    case "hardware_wallet": {
      P(MB.CreateBox("w", { width: 0.13, height: 0.03, depth: 0.07 }, scene), "#1b1f2e", 0.01);
      const scr = P(MB.CreateBox("s", { width: 0.07, height: 0.005, depth: 0.04 }, scene), "#39ffb0", 0);
      scr.position.set(-0.02, 0.017, 0);
      const btn = P(MB.CreateCylinder("b", { diameter: 0.025, height: 0.01, tessellation: 8 }, scene), "#ff8a3c", 0);
      btn.position.set(0.045, 0.018, 0);
      break;
    }
    case "cash_bundle": {
      P(MB.CreateBox("c", { width: 0.2, height: 0.07, depth: 0.1 }, scene), "#6fbf4a", 0.01);
      P(MB.CreateBox("b", { width: 0.04, height: 0.072, depth: 0.102 }, scene), "#f4f1ea", 0);
      break;
    }
    case "cash_register": {
      const base = P(MB.CreateBox("b", { width: 0.6, height: 0.25, depth: 0.5 }, scene), "#6f6a78");
      base.position.y = -0.15;
      const top = P(MB.CreateBox("t", { width: 0.55, height: 0.25, depth: 0.3 }, scene), "#8e8a94");
      top.position.set(0, 0.07, -0.08); top.rotation.x = -0.4;
      const screen = P(MB.CreateBox("s", { width: 0.3, height: 0.15, depth: 0.1 }, scene), "#39ffb0", 0.01);
      screen.position.set(0, 0.28, -0.15);
      const drawer = P(MB.CreateBox("d", { width: 0.5, height: 0.08, depth: 0.02 }, scene), "#d4af37", 0);
      drawer.position.set(0, -0.15, 0.26);
      break;
    }
    case "laptop": {
      const b = P(MB.CreateBox("b", { width: 0.5, height: 0.04, depth: 0.35 }, scene), "#9aa3b5");
      b.position.y = -0.1;
      const lid = P(MB.CreateBox("l", { width: 0.5, height: 0.35, depth: 0.03 }, scene), "#9aa3b5");
      lid.position.set(0, 0.07, -0.17); lid.rotation.x = -0.25;
      const scr = P(MB.CreateBox("s", { width: 0.42, height: 0.27, depth: 0.032 }, scene), "#4fb3ff", 0);
      scr.position.set(0, 0.07, -0.155); scr.rotation.x = -0.25;
      break;
    }
    case "sunglasses": {
      for (const x of [-0.05, 0.05]) { const l = P(MB.CreateCylinder("l", { diameter: 0.08, height: 0.02, tessellation: 10 }, scene), "#1b1420", 0.008); l.rotation.x = Math.PI / 2; l.position.x = x; }
      P(MB.CreateBox("br", { width: 0.2, height: 0.015, depth: 0.015 }, scene), "#d4af37", 0);
      break;
    }
    case "canned_beans": {
      P(MB.CreateCylinder("c", { diameter: 0.15, height: 0.18, tessellation: 12 }, scene), "#c9ced8", 0.012);
      P(MB.CreateCylinder("l", { diameter: 0.152, height: 0.1, tessellation: 12 }, scene), "#d9632b", 0);
      break;
    }
    case "lottery_ticket": {
      P(MB.CreateBox("t", { width: 0.2, height: 0.01, depth: 0.1 }, scene), "#ffcf3a", 0.008);
      const sc = P(MB.CreateBox("s", { width: 0.12, height: 0.012, depth: 0.05 }, scene), "#9aa3b5", 0);
      sc.position.x = 0.02;
      break;
    }
    case "fancy_cheese": {
      const w = P(MB.CreateCylinder("w", { diameter: 0.25, height: 0.1, tessellation: 16, arc: 0.85 }, scene), "#ffd23c", 0.012);
      w.rotation.y = 0.5;
      break;
    }
    case "gold_chain": {
      for (let i = 0; i < 3; i++) { const r = P(MB.CreateTorus("r", { diameter: 0.18 - i * 0.03, thickness: 0.025, tessellation: 14 }, scene), "#ffcf3a", 0.006); r.rotation.x = i * 0.6; }
      break;
    }
    case "guitar": {
      const body = P(MB.CreateCylinder("b", { diameter: 0.45, height: 0.1, tessellation: 14 }, scene), "#b5653b");
      body.rotation.x = Math.PI / 2; body.position.z = -0.2;
      const hole = P(MB.CreateCylinder("h", { diameter: 0.12, height: 0.102, tessellation: 10 }, scene), "#1b1420", 0);
      hole.rotation.x = Math.PI / 2; hole.position.z = -0.2;
      const neck = P(MB.CreateBox("n", { width: 0.06, height: 0.04, depth: 0.5 }, scene), "#6b4a2b", 0.01);
      neck.position.set(0, 0, 0.2);
      break;
    }
    case "bagel": {
      P(MB.CreateTorus("b", { diameter: 0.15, thickness: 0.07, tessellation: 12 }, scene), "#c9955b", 0.01);
      break;
    }
    case "baguette": {
      const b = P(MB.CreateCapsule("b", { radius: 0.045, height: 0.34 }, scene), "#d9a05b", 0.01);
      b.rotation.z = Math.PI / 2;
      break;
    }
    case "birthday_cake": {
      const c = P(MB.CreateCylinder("c", { diameter: 0.5, height: 0.25, tessellation: 16 }, scene), "#ff8fa3");
      c.position.y = -0.08;
      const icing = P(MB.CreateCylinder("i", { diameter: 0.52, height: 0.05, tessellation: 16 }, scene), "#f4f1ea", 0.01);
      icing.position.y = 0.06;
      for (const a of [0, 2.1, 4.2]) { const cd = P(MB.CreateCylinder("cd", { diameter: 0.025, height: 0.1 }, scene), "#4fb3ff", 0); cd.position.set(Math.cos(a) * 0.12, 0.13, Math.sin(a) * 0.12); }
      break;
    }
    // ---- Phase 3 event loot ----
    case "airdrop_crate": {
      P(MB.CreateBox("c", { size: 1.25 }, scene), "#b5824a", 0.04);
      for (const y of [-0.45, 0.45]) {
        const band = P(MB.CreateBox("b", { width: 1.3, height: 0.14, depth: 1.3 }, scene), "#6b4a2b", 0.02);
        band.position.y = y;
      }
      const stamp = P(MB.CreateBox("s", { width: 0.7, height: 0.3, depth: 1.27 }, scene), "#e14b4b", 0);
      stamp.rotation.z = 0.2;
      const star = P(MB.CreateCylinder("st", { diameter: 0.35, height: 1.28, tessellation: 5 }, scene), "#ffe14a", 0);
      star.rotation.z = Math.PI / 2;
      star.position.y = 0.05;
      break;
    }
    default: {
      P(MB.CreateBox("unknown", { size: 0.4 }, scene), "#ff00ff");
    }
  }
  // Performance (Phase 3.5, ~150 items in the bigger city): merge the coloured parts of each
  // item into ONE mesh (1 draw call + outline instead of 3-8). Decals/glass stay separate.
  if (meshes.length > 1) {
    const outline = Math.max(...meshes.map((m) => (m.renderOutline ? m.outlineWidth : 0)));
    const merged = bakeGroup(scene, root, outline);
    if (merged) {
      if (outlineColor) merged.outlineColor = outlineColor;
      const rest = meshes.filter((m) => !m.isDisposed());
      return { root, meshes: [merged, ...rest] };
    }
  }
  return { root, meshes };
}
````

## FILE: client/src/game/npcRenderer.ts

````ts
// Draws the people of Trashington. PLACEHOLDER-QUALITY chunky shapes, but each type has a
// readable silhouette + colours, and every behaviour state has a pose:
// walk, idle, flee (arms up, running), stunned (spin + stars), chase (angry, red "!"),
// windup (arm pulled back), ko (flat on the ground + stars), film (phone up), gloat, huff.
// Poses ease toward targets (same animation approach as the players), so they never get stuck.
import { Scene, MeshBuilder, Mesh, TransformNode, type Camera } from "./babylon.ts";
import { toon, ink, textTexture, unlitTextured, bakeGroup } from "./look.ts";
import { NPC_DEFS, type NpcView } from "@bfb/shared";

const INTERP_MS = 110;
const DRAW_DISTANCE = 60;
const COP_DRAW_DISTANCE = 90; // you want to see them coming
const BIGSHOT_DRAW_DISTANCE = 130; // and you want to see the $$$ from across town

interface Snap { t: number; x: number; y: number; z: number; yaw: number; }

interface Look {
  body: string; legs: string; skin: string; hat?: string; hatShape?: "cap" | "sunhat" | "beret" | "band" | "none" | "scarf";
  prop?: "camera" | "briefcase" | "phone" | "none" | "crumbs" | "cane" | "moneybag" | "laptop"; bulk?: number; face?: string;
}

const LOOKS: Record<string, Look> = {
  tourist: { body: "#ff9a3c", legs: "#e8d7a8", skin: "#f0b98a", hat: "#f3e2b8", hatShape: "sunhat", prop: "camera" },
  businessman: { body: "#5b6170", legs: "#3e4350", skin: "#e8a878", hat: "#2b2433", hatShape: "none", prop: "briefcase" },
  influencer: { body: "#ff6fb5", legs: "#f4f1ea", skin: "#f5c29a", hat: "#ffe14a", hatShape: "cap", prop: "phone" },
  jogger: { body: "#b6ff3c", legs: "#2b2433", skin: "#c98a5c", hat: "#ff5a3c", hatShape: "band", prop: "none" },
  gym_bro: { body: "#2fb6ff", legs: "#3e4350", skin: "#d99a6c", hat: "#2b2433", hatShape: "cap", prop: "none", bulk: 1.35 },
  mall_cop: { body: "#3d5a9e", legs: "#2b3350", skin: "#e8b48a", hat: "#2b3350", hatShape: "cap", prop: "none", bulk: 1.15 },
  mime: { body: "#f4f1ea", legs: "#1b1420", skin: "#ffffff", hat: "#1b1420", hatShape: "beret", prop: "none" },
  cashier: { body: "#d6264a", legs: "#2b2433", skin: "#e8b48a", hat: "#ffcf3a", hatShape: "cap", prop: "none" },
  raccoon: { body: "#8a8a96", legs: "#4a4652", skin: "#a3a3ae", hatShape: "none", prop: "none", bulk: 1.25 },
  millionaire: { body: "#2b2433", legs: "#1b1420", skin: "#f0c8a0", hat: "#1b1420", hatShape: "none", prop: "cane", bulk: 1.3 },
  bodyguard: { body: "#1b1420", legs: "#1b1420", skin: "#b07a52", hat: "#1b1420", hatShape: "none", prop: "none", bulk: 1.45 },
  courier: { body: "#5a6070", legs: "#3e4350", skin: "#d99a6c", hat: "#3a3f55", hatShape: "none", prop: "moneybag", bulk: 1.25 },
  celebrity: { body: "#9b3fd6", legs: "#ffcf3a", skin: "#f5c29a", hat: "#ffcf3a", hatShape: "none", prop: "none" },
  fan: { body: "#ff6fb5", legs: "#3d6fb5", skin: "#e8b48a", hat: "#ff6fb5", hatShape: "cap", prop: "phone" },
  crypto_bro: { body: "#3d8f5a", legs: "#2b2433", skin: "#f0b98a", hat: "#3d8f5a", hatShape: "none", prop: "laptop" },
  cop: { body: "#1f3a78", legs: "#18203a", skin: "#e0a67c", hat: "#18203a", hatShape: "cap", prop: "none", bulk: 1.12 },
  pigeon_lady: { body: "#6b8f5a", legs: "#5a4d6e", skin: "#e0a67c", hat: "#b5653b", hatShape: "scarf", prop: "crumbs" },
};

interface Vis {
  root: TransformNode;
  pivot: TransformNode;
  head: TransformNode;
  armL: TransformNode; armR: TransformNode;
  legL: TransformNode; legR: TransformNode;
  prop: TransformNode | null;
  stars: TransformNode;
  bang: Mesh;
  huh: Mesh;
  cash: Mesh | null;
  bubble: Mesh | null;
  bubbleT: number;
  snaps: Snap[];
  view: NpcView;
  phase: number;
  lastX: number; lastZ: number;
  lean: number; armUp: number; spin: number; flat: number; windup: number; phoneUp: number;
  enabled: boolean;
  hitT: number; slapT: number;
  speed: number; phase0: number;
}

export class NpcRenderer {
  private map = new Map<string, Vis>();
  private bubbleTex = new Map<string, ReturnType<typeof unlitTextured>>();
  private time = 0;

  constructor(private scene: Scene) {}

  private build(id: string, v: NpcView): Vis {
    const sc = this.scene;
    const L = LOOKS[v.kind] ?? LOOKS.tourist;
    const bulk = L.bulk ?? 1;
    const root = new TransformNode("npc-" + id, sc);
    const pivot = new TransformNode("npcPivot", sc);
    pivot.parent = root;
    const part = (m: Mesh, c: string, parent: TransformNode, outline = 0.025) => { m.parent = parent; m.material = toon(sc, c); if (outline > 0) ink(m, outline); m.isPickable = false; return m; };
    // legs (hip pivots)
    const leg = (side: number) => {
      const hip = new TransformNode("hip", sc); hip.parent = pivot; hip.position.set(side * 0.14, 0.72, 0);
      const l = part(MeshBuilder.CreateCapsule("leg", { height: 0.72, radius: 0.085, tessellation: 6 }, sc), L.legs, hip, 0.018);
      l.position.y = -0.34;
      return hip;
    };
    const legL = leg(-1), legR = leg(1);
    const torso = part(MeshBuilder.CreateCapsule("torso", { height: 0.78, radius: 0.27 * bulk, tessellation: 8 }, sc), L.body, pivot, 0.03);
    torso.position.y = 1.08;
    const head = new TransformNode("npcHead", sc); head.parent = pivot; head.position.y = 1.6;
    const skull = part(MeshBuilder.CreateSphere("head", { diameter: 0.4, segments: 8 }, sc), L.skin, head, 0.02);
    void skull;
    for (const ex of [-0.07, 0.07]) {
      const eye = part(MeshBuilder.CreateSphere("eye", { diameter: 0.06, segments: 4 }, sc), "#1b1420", head, 0);
      eye.position.set(ex, 0.03, 0.18);
    }
    if (v.kind === "mime") { const mouth = part(MeshBuilder.CreateBox("mouth", { width: 0.12, height: 0.03, depth: 0.02 }, sc), "#d62c2c", head, 0); mouth.position.set(0, -0.08, 0.19); }
    // hats
    const hc = L.hat ?? "#2b2433";
    if (L.hatShape === "sunhat") { const h = part(MeshBuilder.CreateCylinder("sunhat", { diameter: 0.62, height: 0.05, tessellation: 12 }, sc), hc, head, 0.015); h.position.y = 0.17; const c = part(MeshBuilder.CreateCylinder("crown", { diameter: 0.3, height: 0.14, tessellation: 10 }, sc), hc, head, 0.015); c.position.y = 0.24; }
    if (L.hatShape === "cap") { const h = part(MeshBuilder.CreateSphere("cap", { diameter: 0.42, segments: 8, slice: 0.5 }, sc), hc, head, 0.015); h.position.y = 0.05; const b = part(MeshBuilder.CreateBox("brim", { width: 0.26, height: 0.03, depth: 0.18 }, sc), hc, head, 0.01); b.position.set(0, 0.1, 0.2); }
    if (L.hatShape === "beret") { const h = part(MeshBuilder.CreateCylinder("beret", { diameter: 0.4, height: 0.08, tessellation: 12 }, sc), hc, head, 0.015); h.position.set(0.04, 0.2, 0); h.rotation.z = -0.25; }
    if (L.hatShape === "band") { const h = part(MeshBuilder.CreateTorus("band", { diameter: 0.4, thickness: 0.06, tessellation: 12 }, sc), hc, head, 0.01); h.position.y = 0.08; }
    if (L.hatShape === "scarf") { const h = part(MeshBuilder.CreateTorus("scarf", { diameter: 0.34, thickness: 0.12, tessellation: 10 }, sc), hc, pivot, 0.015); h.position.y = 1.42; const bird = part(MeshBuilder.CreateSphere("pigeon", { diameter: 0.16, segments: 6 }, sc), "#8a94a8", pivot, 0.012); bird.position.set(0.28, 1.5, 0); }
    if (v.kind === "mall_cop") { const badge = part(MeshBuilder.CreateBox("badge", { width: 0.08, height: 0.1, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); badge.position.set(-0.12, 1.22, 0.26 * bulk); }
    if (v.kind === "millionaire") {
      const brim = part(MeshBuilder.CreateCylinder("tophatbrim", { diameter: 0.46, height: 0.03, tessellation: 14 }, sc), "#1b1420", head, 0.012); brim.position.y = 0.17;
      const crown = part(MeshBuilder.CreateCylinder("tophat", { diameter: 0.3, height: 0.34, tessellation: 14 }, sc), "#1b1420", head, 0.015); crown.position.y = 0.34;
      const band = part(MeshBuilder.CreateCylinder("hatband", { diameter: 0.31, height: 0.05, tessellation: 14 }, sc), "#d6264a", head, 0); band.position.y = 0.2;
      const mono = part(MeshBuilder.CreateTorus("monocle", { diameter: 0.1, thickness: 0.015, tessellation: 12 }, sc), "#ffcf3a", head, 0); mono.rotation.x = Math.PI / 2; mono.position.set(0.07, 0.03, 0.2);
      const tash = part(MeshBuilder.CreateBox("tash", { width: 0.22, height: 0.04, depth: 0.03 }, sc), "#f4f1ea", head, 0); tash.position.set(0, -0.06, 0.19);
      const vest = part(MeshBuilder.CreateBox("vest", { width: 0.3, height: 0.36, depth: 0.04 }, sc), "#d6264a", pivot, 0); vest.position.set(0, 1.12, 0.3 * bulk);
    }
    if (v.kind === "bodyguard" || v.kind === "celebrity") {
      const shades = part(MeshBuilder.CreateBox("shades", { width: 0.3, height: 0.07, depth: 0.03 }, sc), v.kind === "celebrity" ? "#ff6fb5" : "#1b1420", head, 0); shades.position.set(0, 0.04, 0.19);
    }
    if (v.kind === "bodyguard") { const ear = part(MeshBuilder.CreateSphere("earpiece", { diameter: 0.05, segments: 4 }, sc), "#e8e2d4", head, 0); ear.position.set(0.2, 0, 0); }
    if (v.kind === "celebrity") {
      const scarf = part(MeshBuilder.CreateTorus("boa", { diameter: 0.36, thickness: 0.12, tessellation: 10 }, sc), "#ff9ad5", pivot, 0.012); scarf.position.y = 1.42;
      const hair = part(MeshBuilder.CreateSphere("hair", { diameter: 0.44, segments: 8, slice: 0.55 }, sc), "#ffe14a", head, 0.012); hair.position.y = 0.04;
    }
    if (v.kind === "courier") {
      const helmet = part(MeshBuilder.CreateSphere("helmet", { diameter: 0.44, segments: 8, slice: 0.55 }, sc), "#3a3f55", head, 0.015); helmet.position.y = 0.04;
      const visor = part(MeshBuilder.CreateBox("visor", { width: 0.3, height: 0.08, depth: 0.03 }, sc), "#9fe3ff", head, 0); visor.position.set(0, 0.06, 0.19);
      const plate = part(MeshBuilder.CreateBox("armor", { width: 0.5 * bulk, height: 0.45, depth: 0.1 }, sc), "#8e96a8", pivot, 0.015); plate.position.set(0, 1.12, 0.22 * bulk);
    }
    if (v.kind === "crypto_bro") {
      const hood = part(MeshBuilder.CreateSphere("hood", { diameter: 0.5, segments: 8, slice: 0.6 }, sc), "#3d8f5a", head, 0.015); hood.position.set(0, 0.02, -0.05); hood.rotation.x = -0.4;
      const coin = part(MeshBuilder.CreateCylinder("coinpin", { diameter: 0.1, height: 0.02, tessellation: 12 }, sc), "#ffcf3a", pivot, 0); coin.rotation.x = Math.PI / 2; coin.position.set(0.12, 1.25, 0.28);
    }
    if (v.kind === "cop") {
      const badge = part(MeshBuilder.CreatePolyhedron("copbadge", { type: 1, size: 0.07 }, sc), "#ffcf3a", pivot, 0.008); badge.position.set(-0.13, 1.24, 0.28 * bulk);
      const belt = part(MeshBuilder.CreateTorus("belt", { diameter: 0.6 * bulk, thickness: 0.07, tessellation: 12 }, sc), "#1b1420", pivot, 0); belt.position.y = 0.76;
      const buckle = part(MeshBuilder.CreateBox("buckle", { width: 0.1, height: 0.07, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); buckle.position.set(0, 0.76, 0.31 * bulk);
      const capBadge = part(MeshBuilder.CreateBox("capbadge", { width: 0.08, height: 0.07, depth: 0.02 }, sc), "#ffcf3a", head, 0); capBadge.position.set(0, 0.14, 0.2);
      const tash = part(MeshBuilder.CreateBox("moustache", { width: 0.16, height: 0.04, depth: 0.03 }, sc), "#4a2f1e", head, 0); tash.position.set(0, -0.06, 0.19);
    }
    if (v.kind === "cashier") { const apron = part(MeshBuilder.CreateBox("apron", { width: 0.4, height: 0.5, depth: 0.04 }, sc), "#f4f1ea", pivot, 0); apron.position.set(0, 1.0, 0.27); const tag = part(MeshBuilder.CreateBox("nametag", { width: 0.1, height: 0.06, depth: 0.03 }, sc), "#ffcf3a", pivot, 0); tag.position.set(0.1, 1.3, 0.28); }
    if (v.kind === "businessman") { const tie = part(MeshBuilder.CreateBox("tie", { width: 0.07, height: 0.32, depth: 0.03 }, sc), "#d62c2c", pivot, 0); tie.position.set(0, 1.18, 0.27); }
    if (v.kind === "mime") for (let i = 0; i < 3; i++) { const st = part(MeshBuilder.CreateTorus("stripe", { diameter: 0.56, thickness: 0.05, tessellation: 12 }, sc), "#1b1420", pivot, 0); st.position.y = 0.88 + i * 0.16; }
    // arms (shoulder pivots)
    const arm = (side: number) => {
      const sh = new TransformNode("shoulder", sc); sh.parent = pivot; sh.position.set(side * (0.3 * bulk + 0.05), 1.38, 0);
      const a = part(MeshBuilder.CreateCapsule("arm", { height: 0.6, radius: 0.075 * bulk, tessellation: 6 }, sc), L.body, sh, 0.018);
      a.position.y = -0.27;
      const hand = part(MeshBuilder.CreateSphere("hand", { diameter: 0.16 * bulk, segments: 6 }, sc), L.skin, sh, 0.012);
      hand.position.y = -0.58;
      return sh;
    };
    const armL = arm(-1), armR = arm(1);
    // props held in the right hand
    let prop: TransformNode | null = null;
    if (L.prop && L.prop !== "none") {
      prop = new TransformNode("prop", sc); prop.parent = armR; prop.position.set(0, -0.62, 0.06);
      if (L.prop === "camera") part(MeshBuilder.CreateBox("cam", { width: 0.16, height: 0.1, depth: 0.08 }, sc), "#2b2433", prop, 0.01);
      if (L.prop === "briefcase") { const b = part(MeshBuilder.CreateBox("case", { width: 0.1, height: 0.3, depth: 0.4 }, sc), "#6b4a2b", prop, 0.015); b.position.y = -0.12; }
      if (L.prop === "phone") part(MeshBuilder.CreateBox("phone", { width: 0.09, height: 0.16, depth: 0.02 }, sc), "#ff9ad5", prop, 0.008);
      if (L.prop === "crumbs") part(MeshBuilder.CreateSphere("bag", { diameter: 0.18, segments: 6 }, sc), "#d9c9a0", prop, 0.01);
      if (L.prop === "cane") { const c = part(MeshBuilder.CreateCylinder("cane", { diameter: 0.04, height: 0.9, tessellation: 6 }, sc), "#1b1420", prop, 0.008); c.position.y = -0.35; const k = part(MeshBuilder.CreateSphere("knob", { diameter: 0.09, segments: 6 }, sc), "#ffcf3a", prop, 0.008); k.position.y = 0.1; }
      if (L.prop === "moneybag") { const b = part(MeshBuilder.CreateSphere("mbag", { diameter: 0.42, segments: 8 }, sc), "#b99a5c", prop, 0.015); b.position.y = -0.18; const d = part(MeshBuilder.CreateBox("mbagsign", { width: 0.14, height: 0.18, depth: 0.02 }, sc), "#2f7a3b", prop, 0); d.position.set(0, -0.18, 0.21); }
      if (L.prop === "laptop") { const l = part(MeshBuilder.CreateBox("lap", { width: 0.34, height: 0.03, depth: 0.24 }, sc), "#9aa3b5", prop, 0.01); l.position.y = -0.02; }
    }
    // dizzy stars
    const stars = new TransformNode("stars", sc); stars.parent = root; stars.position.y = 2.05;
    for (let i = 0; i < 3; i++) {
      const s = part(MeshBuilder.CreatePolyhedron("star", { type: 0, size: 0.07 }, sc), "#ffe14a", stars, 0);
      const a = (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    }
    stars.setEnabled(false);
    // angry "!" when chasing you
    const bang = MeshBuilder.CreatePlane("bang", { width: 0.4, height: 0.5 }, sc);
    bang.parent = root; bang.position.y = 2.25; bang.billboardMode = Mesh.BILLBOARDMODE_ALL; bang.isPickable = false;
    bang.material = unlitTextured(sc, textTexture(sc, "!", { w: 128, h: 160, fg: "#ff3b30", stroke: "#1b1420" }), "bang");
    bang.setEnabled(false);
    // cops searching for you get a "?"
    const huh = MeshBuilder.CreatePlane("huh", { width: 0.4, height: 0.5 }, sc);
    huh.parent = root; huh.position.y = 2.25; huh.billboardMode = Mesh.BILLBOARDMODE_ALL; huh.isPickable = false;
    huh.material = unlitTextured(sc, textTexture(sc, "?", { w: 128, h: 160, fg: "#ffcf3a", stroke: "#1b1420" }), "huh");
    huh.setEnabled(false);
    // big shots: a floating gold $$$ you can spot from across town
    let cash: Mesh | null = null;
    if (NPC_DEFS[v.kind as keyof typeof NPC_DEFS]?.bigShot) {
      cash = MeshBuilder.CreatePlane("bigshot", { width: 1.3, height: 0.5 }, sc);
      cash.parent = root; cash.position.y = 2.75; cash.billboardMode = Mesh.BILLBOARDMODE_ALL; cash.isPickable = false;
      cash.material = unlitTextured(sc, textTexture(sc, "$$$", { w: 384, h: 160, fg: "#ffcf3a", stroke: "#1b1420" }), "bigshot");
      cash.renderingGroupId = 1;
    }
    if (v.kind === "raccoon") {
      // bandit mask, round ears, striped tail; the whole raccoon is drawn at about half size
      const mask = part(MeshBuilder.CreateBox("mask", { width: 0.36, height: 0.1, depth: 0.12 }, sc), "#1b1420", head, 0);
      mask.position.set(0, 0.03, 0.14);
      for (const ex of [-0.12, 0.12]) {
        const ear = part(MeshBuilder.CreateSphere("ear", { diameter: 0.14, segments: 6 }, sc), "#4a4652", head, 0.012);
        ear.position.set(ex, 0.19, -0.02);
      }
      const snout = part(MeshBuilder.CreateSphere("snout", { diameter: 0.14, segments: 6 }, sc), "#e0dcd2", head, 0.01);
      snout.position.set(0, -0.06, 0.18);
      for (let i = 0; i < 5; i++) {
        const seg = part(MeshBuilder.CreateCylinder("tail", { diameter: 0.2 - i * 0.02, height: 0.16, tessellation: 8 }, sc), i % 2 ? "#2b2433" : "#8a8a96", pivot, 0.01);
        seg.rotation.x = -1.0;
        seg.position.set(0, 0.62 + i * 0.07, -0.3 - i * 0.12);
      }
      root.scaling.setAll(0.55);
    }
    // merge each moving body part into one mesh (big draw-call saving with a crowd on screen)
    for (const g of [pivot, head, legL, legR, armL, armR, prop, stars]) if (g) bakeGroup(sc, g, g === stars ? 0 : 0.022);
    return {
      root, pivot, head, armL, armR, legL, legR, prop, stars, bang, huh, cash, bubble: null, bubbleT: 0,
      snaps: [], view: { ...v }, phase: Math.random() * 6, lastX: v.x, lastZ: v.z,
      lean: 0, armUp: 0, spin: 0, flat: 0, windup: 0, phoneUp: 0, enabled: true, hitT: 0, slapT: 0, speed: 0, phase0: Math.random() * 6,
    };
  }

  sync(id: string, v: NpcView, now: number) {
    let n = this.map.get(id);
    if (!n) { n = this.build(id, v); this.map.set(id, n); }
    n.view.state = v.state; n.view.target = v.target; n.view.robbed = v.robbed; n.view.kind = v.kind;
    n.snaps.push({ t: now, x: v.x, y: v.y, z: v.z, yaw: v.yaw });
    if (n.snaps.length > 16) n.snaps.splice(0, n.snaps.length - 16);
  }

  retain(ids: Set<string>) {
    for (const [id, n] of this.map) if (!ids.has(id)) { n.root.dispose(false, true); n.bubble?.dispose(); this.map.delete(id); }
  }

  /** Speech bubble over a pedestrian's head for a couple of seconds. */
  say(id: string, line: string) {
    const n = this.map.get(id);
    if (!n || !line) return;
    n.bubble?.dispose();
    let mat = this.bubbleTex.get(line);
    if (!mat) {
      mat = unlitTextured(this.scene, textTexture(this.scene, line, { w: 768, h: 128, bg: "#fffaf0", fg: "#1b1420" }), "bubble");
      this.bubbleTex.set(line, mat);
    }
    const b = MeshBuilder.CreatePlane("bubble", { width: 2.3, height: 0.38 }, this.scene);
    b.material = mat;
    b.parent = n.root;
    b.position.y = 2.55;
    b.billboardMode = Mesh.BILLBOARDMODE_ALL;
    b.renderingGroupId = 1;
    ink(b, 0.02);
    b.isPickable = false;
    n.bubble = b;
    n.bubbleT = 2.6;
  }

  /** Squash-and-stretch when they get bonked. */
  bump(id: string) { const n = this.map.get(id); if (n) n.hitT = 0.3; }
  /** Big slap swing (fighters hitting back). */
  slap(id: string) { const n = this.map.get(id); if (n) n.slapT = 0.3; }
  kindOf(id: string) { return this.map.get(id)?.view.kind ?? null; }

  /** Where a pedestrian is drawn right now (for hit effects). */
  pos(id: string) {
    const n = this.map.get(id);
    return n ? { x: n.root.position.x, y: n.root.position.y, z: n.root.position.z } : null;
  }

  /** Every pedestrian currently drawn (not culled): id, drawn position, state, kind. */
  forEachVisible(cb: (id: string, x: number, y: number, z: number, state: string, kind: string) => void) {
    for (const [id, n] of this.map) if (n.enabled && n.snaps.length) cb(id, n.root.position.x, n.root.position.y, n.root.position.z, n.view.state, n.view.kind);
  }

  /** Big shots in town (latest synced position, even when not drawn): for the HUD tracker. */
  bigShots(): { id: string; kind: string; x: number; z: number; robbed: boolean }[] {
    const out: { id: string; kind: string; x: number; z: number; robbed: boolean }[] = [];
    for (const [id, n] of this.map) if (n.cash && n.snaps.length) { const s = n.snaps[n.snaps.length - 1]; out.push({ id, kind: n.view.kind, x: s.x, z: s.z, robbed: n.view.robbed }); }
    return out;
  }

  count() { return this.map.size; }
  visibleCount() { let c = 0; for (const n of this.map.values()) if (n.enabled) c++; return c; }

  update(now: number, dt: number, camera: Camera) {
    this.time += dt;
    const renderT = now - INTERP_MS;
    const cam = camera.globalPosition;
    for (const n of this.map.values()) {
      const s = n.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= renderT) { a = s[i]; b = s[Math.min(i + 1, s.length - 1)]; break; }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
      const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k, z = a.z + (b.z - a.z) * k;
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const yaw = a.yaw + dy * k;
      // distance culling (keeps the crowd affordable)
      const far = Math.hypot(x - cam.x, z - cam.z) > (n.cash ? BIGSHOT_DRAW_DISTANCE : n.view.kind === "cop" ? COP_DRAW_DISTANCE : DRAW_DISTANCE);
      if (far === n.enabled) { n.enabled = !far; n.root.setEnabled(!far); }
      const speed = dt > 0 ? Math.hypot(x - n.lastX, z - n.lastZ) / dt : 0;
      n.lastX = x; n.lastZ = z;
      if (far) continue;
      n.root.position.set(x, y, z);

      const st = n.view.state;
      const f = 1 - Math.exp(-dt * 12);
      const tLean = st === "flee" ? 0.25 : st === "chase" ? 0.35 : st === "huff" ? 0.4 : st === "gloat" ? -0.2
        : st === "sneak" ? 0.45 : st === "escape" || st === "scram" ? 0.3 : 0;
      const tArmUp = st === "flee" || st === "escape" || st === "cower" ? 1 : st === "gloat" ? 0.8 : 0; // raccoons hold loot over their heads, cashiers put their hands up
      const tFlat = st === "ko" ? 1 : 0;
      const tWind = st === "windup" ? 1 : 0;
      const tPhone = st === "film" || (n.view.kind === "influencer" && st === "idle") ? 1 : 0;
      n.lean += (tLean - n.lean) * f; n.armUp += (tArmUp - n.armUp) * f; n.flat += (tFlat - n.flat) * f;
      n.windup += (tWind - n.windup) * (1 - Math.exp(-dt * 20)); n.phoneUp += (tPhone - n.phoneUp) * f;
      if (st === "stunned") n.spin += dt * 14; else n.spin *= Math.exp(-dt * 6);
      n.root.rotation.y = yaw + n.spin;
      n.pivot.rotation.x = n.lean - n.flat * 1.45;
      n.pivot.position.y = n.flat * 0.25;

      // walk cycle: one stride per ~1.1 m travelled, so feet match the ground (no moonwalking);
      // longer strides + bigger arm swing when running, gentle bob + hip sway, breathing when still
      n.speed += (speed - n.speed) * (1 - Math.exp(-dt * 8));
      const sp = n.speed;
      n.phase += dt * sp * 2.9;
      const moving = Math.min(1, sp / 1.2);
      const stride = (0.32 + 0.3 * Math.min(1, sp / 5)) * moving * (1 - n.flat);
      const sw = Math.sin(n.phase) * stride;
      n.legL.rotation.x = sw; n.legR.rotation.x = -sw;
      const armSw = sw * (0.55 + 0.4 * Math.min(1, sp / 5));
      n.armL.rotation.x = -armSw * (1 - n.armUp) - n.armUp * 2.9;
      n.armR.rotation.x = armSw * (1 - n.armUp) * (1 - n.phoneUp) - n.armUp * 2.9 - n.phoneUp * 1.6 + n.windup * 1.2;
      const breathe = Math.sin(this.time * 2 + n.phase0) * 0.012 * (1 - moving);
      n.pivot.position.y += Math.abs(Math.cos(n.phase)) * 0.045 * moving + breathe;
      n.pivot.rotation.z = Math.sin(n.phase) * 0.04 * moving + Math.sin(this.time * 0.7 + n.phase0) * 0.02 * (1 - moving);
      n.pivot.rotation.y = Math.sin(n.phase) * 0.08 * moving; // shoulders twist with the stride
      n.armR.rotation.z = -n.windup * 0.6;
      if (n.view.kind === "cop" && n.windup > 0.01) {
        // grab: both arms straight out in front
        n.armL.rotation.x = n.armL.rotation.x * (1 - n.windup) - 1.45 * n.windup;
        n.armR.rotation.x = n.armR.rotation.x * (1 - n.windup) - 1.45 * n.windup;
        n.armR.rotation.z = 0;
      }
      if (n.slapT > 0) {
        n.slapT = Math.max(0, n.slapT - dt);
        const u = 1 - n.slapT / 0.3, sk = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
        n.armR.rotation.x = n.armR.rotation.x * (1 - sk) - 1.5 * sk;
        n.armR.rotation.z = -0.9 * sk + 0.6 * sk * (1 - u);
      }
      if (n.hitT > 0) {
        n.hitT = Math.max(0, n.hitT - dt);
        const q = Math.sin((n.hitT / 0.3) * Math.PI) * 0.25;
        n.pivot.scaling.set(1 + q, 1 - q, 1 + q);
      } else if (n.pivot.scaling.y !== 1) n.pivot.scaling.setAll(1);
      n.armL.rotation.z = st === "flee" ? Math.sin(this.time * 18) * 0.3 : 0;
      n.head.rotation.z = st === "huff" ? Math.sin(this.time * 10) * 0.08 : 0;
      // stars when dazed / KO, "!" when coming for you
      const dazed = st === "stunned" || st === "ko";
      n.stars.setEnabled(dazed);
      if (dazed) { n.stars.rotation.y += dt * 5; n.stars.position.y = 2.05 - n.flat * 1.6; }
      n.bang.setEnabled(st === "chase" || st === "windup");
      n.huh.setEnabled(st === "search");
      if (n.cash) { n.cash.setEnabled(!n.view.robbed); n.cash.position.y = 2.75 + Math.sin(this.time * 3 + n.phase0) * 0.12; }
      if (st === "search") n.head.rotation.y = Math.sin(this.time * 2.2 + n.phase0) * 0.7; else if (n.head.rotation.y !== 0) n.head.rotation.y *= Math.exp(-dt * 8);
      if (n.bubble) { n.bubbleT -= dt; if (n.bubbleT <= 0) { n.bubble.dispose(); n.bubble = null; } }
    }
  }

  dispose() {
    for (const n of this.map.values()) { n.root.dispose(false, true); n.bubble?.dispose(); }
    this.map.clear();
  }
}
````

## FILE: client/src/game/propRenderer.ts

````ts
// The parts of props that change: dumpster lids (open once searched), phone-booth handsets
// (gone when smashed), vending machine glass (cracked), parked car windows (smashed) and
// flashing alarm lights on cars and shop tills. Static bodies are merged into the city.
import { Scene, MeshBuilder, Mesh, StandardMaterial, Color3, TransformNode, Vector3 } from "./babylon.ts";
import { toon, ink } from "./look.ts";
import { buildCarGlass } from "./carModel.ts";
import type { PropDef, PropView } from "@bfb/shared";

interface Vis { def: PropDef; node: TransformNode; ready: boolean; alarm: boolean; lid?: Mesh; handset?: Mesh; glass?: Mesh; lights?: Mesh[]; }

export class PropRenderer {
  private map = new Map<string, Vis>();
  private t = 0;
  private alarmMat: StandardMaterial;
  private alarmOff: StandardMaterial;
  private crackedMat: ReturnType<typeof toon>;
  private vendGlass: ReturnType<typeof toon>;

  constructor(scene: Scene, props: PropDef[]) {
    this.alarmMat = new StandardMaterial("alarmOn", scene);
    this.alarmMat.disableLighting = true;
    this.alarmMat.emissiveColor = Color3.FromHexString("#ff3b30");
    this.alarmOff = new StandardMaterial("alarmOff", scene);
    this.alarmOff.disableLighting = true;
    this.alarmOff.emissiveColor = Color3.FromHexString("#ffb000");
    this.crackedMat = toon(scene, "#46505a");
    this.vendGlass = toon(scene, "#9fe3ff");
    for (const d of props) {
      const node = new TransformNode("prop-" + d.id, scene);
      node.position.set(d.x, d.y, d.z);
      node.rotation.y = d.yaw;
      const v: Vis = { def: d, node, ready: true, alarm: false };
      const part = (m: Mesh, color: string | ReturnType<typeof toon>, outline = 0.02) => {
        m.parent = node; m.material = typeof color === "string" ? toon(scene, color) : color; if (outline) ink(m, outline); m.isPickable = false; return m;
      };
      if (d.kind === "dumpster") {
        v.lid = part(MeshBuilder.CreateBox("lid", { width: 2.3, height: 0.1, depth: 1.3 }, scene), "#2f5c3b", 0.03);
        v.lid.setPivotPoint(new Vector3(0, 0, -0.65)); // hinge at the back
        v.lid.position.set(0, 1.35, 0);
      } else if (d.kind === "phone") {
        v.handset = part(MeshBuilder.CreateBox("handset", { width: 0.1, height: 0.35, depth: 0.1 }, scene), "#1b1420", 0.01);
        v.handset.position.set(0.28, 1.45, -0.3);
      } else if (d.kind === "vending") {
        v.glass = part(MeshBuilder.CreateBox("vendglass", { width: 0.75, height: 1.2, depth: 0.04 }, scene), this.vendGlass, 0.01);
        v.glass.position.set(0.12, 1.05, 0.46);
      } else if (d.kind === "car") {
        v.glass = part(buildCarGlass(scene)[0], "#6fb6d9", 0.01);
        v.lights = [];
        for (const sx of [-0.62, 0.62]) for (const sz of [2.14, -2.14]) {
          const l = MeshBuilder.CreateBox("hazard", { width: 0.36, height: 0.2, depth: 0.04 }, scene);
          l.parent = node; l.position.set(sx, 0.72, sz); l.material = this.alarmOff; l.isPickable = false; l.setEnabled(false);
          v.lights.push(l);
        }
      } else if (d.kind === "till") {
        const l = MeshBuilder.CreateSphere("tillalarm", { diameter: 0.3, segments: 8 }, scene);
        l.parent = node; l.position.set(0, 2.9, 0); l.material = this.alarmMat; l.isPickable = false; l.setEnabled(false);
        v.lights = [l];
      } else {
        continue; // bins, meters, newsboxes: nothing changes visibly (they just go empty)
      }
      this.map.set(d.id, v);
    }
  }

  sync(id: string, pv: PropView) {
    const v = this.map.get(id);
    if (!v) return;
    if (pv.ready !== v.ready) {
      v.ready = pv.ready;
      if (v.lid) v.lid.rotation.x = v.ready ? 0 : -1.9; // flipped open after a search
      if (v.handset) v.handset.setEnabled(v.ready);
      if (v.glass && v.def.kind === "vending") v.glass.material = v.ready ? this.vendGlass : this.crackedMat;
      if (v.glass && v.def.kind === "car") v.glass.setEnabled(v.ready); // smashed
    }
    if (pv.alarm !== v.alarm) {
      v.alarm = pv.alarm;
      for (const l of v.lights ?? []) l.setEnabled(pv.alarm);
    }
  }

  update(dt: number) {
    this.t += dt;
    const on = Math.sin(this.t * 14) > 0;
    for (const v of this.map.values()) {
      if (!v.alarm || !v.lights) continue;
      for (const l of v.lights) l.material = on ? this.alarmMat : this.alarmOff;
    }
  }

  /** Where the prop is (for sounds / prompts). */
  def(id: string) { return this.map.get(id)?.def; }

  dispose() { for (const v of this.map.values()) v.node.dispose(false, true); this.map.clear(); }
}
````

## FILE: client/src/game/remotePlayers.ts

````ts
// Other players, drawn as PLACEHOLDER chunky capsule bandits with mitten arms and name tags.
// Positions arrive ~20 times a second; we draw them slightly in the past and
// blend between updates ("interpolation") so they move smoothly, not in jumps.
// Poses (crouch, slide, dodge, climb, stumble) use the same ease-toward-target
// animation approach as the first-person hands, so they can't get stuck.
import { Scene, MeshBuilder, TransformNode, Mesh, Vector3 } from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { PLAYER, PLAYER_COLORS, movePose, readMoveState, type MovePose } from "@bfb/shared";

export const INTERP_DELAY_MS = 110;

interface Snap { t: number; x: number; y: number; z: number; yaw: number; pitch: number; }

interface Remote {
  root: TransformNode;
  bodyPivot: TransformNode;
  body: Mesh;
  head: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  tag: Mesh;
  snaps: Snap[];
  pose: MovePose;
  connected: boolean;
  phase: number;
  lastPos: Vector3;
  meshes: Mesh[];
  // eased pose values
  crouch: number; lean: number; roll: number; armUp: number; squash: number; armFwd: number; armFwdR: number;
  carry: CarryKind;
  yaw: number;
  punchT: number;
}

export type CarryKind = "none" | "small" | "big" | "giant";

/** Everything we read from the synced player state. */
export type RemoteInfo = Record<string, any> & {
  x: number; y: number; z: number; yaw: number; pitch: number;
  name: string; colorIdx: number; connected: boolean;
};

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RemotePlayers {
  private map = new Map<string, Remote>();
  constructor(private scene: Scene) {}

  private build(id: string, info: RemoteInfo): Remote {
    const scene = this.scene;
    const color = PLAYER_COLORS[info.colorIdx % PLAYER_COLORS.length];
    const root = new TransformNode("remote-" + id, scene);
    const meshes: Mesh[] = [];
    const reg = <T extends Mesh>(m: T, outline = 0.03) => { ink(m, outline); meshes.push(m); return m; };

    // bodyPivot sits at the feet so leaning/squashing pivots from the ground
    const bodyPivot = new TransformNode("rbodyPivot", scene);
    bodyPivot.parent = root;
    const body = reg(MeshBuilder.CreateCapsule("rbody", { height: 1.25, radius: PLAYER.radius }, scene));
    body.parent = bodyPivot;
    body.position.y = 0.62;
    body.material = toon(scene, color);
    const patch = reg(MeshBuilder.CreateBox("patch", { width: 0.22, height: 0.22, depth: 0.05 }, scene), 0.015);
    patch.parent = body;
    patch.position.set(0.14, 0.05, 0.36);
    patch.rotation.z = 0.3;
    patch.material = toon(scene, PALETTE.tape);

    const head = new TransformNode("rheadPivot", scene);
    head.parent = bodyPivot;
    head.position.y = 1.38;
    const skull = reg(MeshBuilder.CreateSphere("rhead", { diameter: 0.58, segments: 12 }, scene));
    skull.parent = head;
    skull.material = toon(scene, PALETTE.skin);
    const hat = reg(MeshBuilder.CreateCylinder("rhat", { diameterTop: 0.36, diameterBottom: 0.6, height: 0.26 }, scene));
    hat.parent = head;
    hat.position.y = 0.2;
    hat.material = toon(scene, color);
    for (const ex of [-0.11, 0.11]) {
      const eye = reg(MeshBuilder.CreateSphere("reye", { diameter: 0.12, segments: 6 }, scene), 0.012);
      eye.parent = head;
      eye.position.set(ex, 0.03, 0.25);
      eye.material = toon(scene, "#ffffff");
      const pupil = MeshBuilder.CreateSphere("rpupil", { diameter: 0.055, segments: 6 }, scene);
      pupil.parent = eye;
      pupil.position.z = 0.045;
      pupil.material = toon(scene, "#1b1420");
      meshes.push(pupil);
    }
    const nose = reg(MeshBuilder.CreateSphere("rnose", { diameter: 0.14, segments: 6 }, scene), 0.015);
    nose.parent = head;
    nose.position.set(0, -0.06, 0.29);
    nose.material = toon(scene, "#e0976a");

    // Mitten arms (shoulder pivot -> arm -> glove)
    const makeArm = (side: number) => {
      const shoulder = new TransformNode("rshoulder", scene);
      shoulder.parent = bodyPivot;
      shoulder.position.set(side * (PLAYER.radius + 0.06), 1.0, 0);
      const arm = reg(MeshBuilder.CreateCapsule("rarm", { height: 0.55, radius: 0.08 }, scene), 0.02);
      arm.parent = shoulder;
      arm.position.y = -0.25;
      arm.material = toon(scene, "#5a4d6e");
      const mitt = reg(MeshBuilder.CreateSphere("rmitt", { diameter: 0.2, segments: 8 }, scene), 0.02);
      mitt.parent = shoulder;
      mitt.position.y = -0.52;
      mitt.material = toon(scene, color);
      return shoulder;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    const tag = MeshBuilder.CreatePlane("rtag", { width: 1.6, height: 0.4 }, scene);
    tag.parent = root;
    tag.position.y = 2.1;
    tag.billboardMode = Mesh.BILLBOARDMODE_ALL;
    tag.material = unlitTextured(scene, textTexture(scene, info.name, { w: 512, h: 128, fg: color, stroke: "#1b1420" }), "tagMat");
    tag.renderingGroupId = 1; // draw on top so names stay readable (NOTE: must change before stealth in Phase 4)
    meshes.push(tag);

    return {
      root, bodyPivot, body, head, armL, armR, tag, snaps: [], pose: "idle", connected: true, phase: 0,
      lastPos: new Vector3(info.x, info.y, info.z), meshes,
      crouch: 0, lean: 0, roll: 0, armUp: 0, squash: 0, armFwd: 0, armFwdR: 0, carry: "none", yaw: 0, punchT: 0,
    };
  }

  /** Called whenever the server sends new state. */
  push(id: string, info: RemoteInfo, now: number) {
    let r = this.map.get(id);
    if (!r) {
      r = this.build(id, info);
      this.map.set(id, r);
    }
    r.snaps.push({ t: now, x: info.x, y: info.y, z: info.z, yaw: info.yaw, pitch: info.pitch });
    if (r.snaps.length > 30) r.snaps.splice(0, r.snaps.length - 30);
    r.pose = movePose(readMoveState(info));
    if (r.connected !== info.connected) {
      r.connected = info.connected;
      for (const m of r.meshes) m.visibility = info.connected ? 1 : 0.35;
    }
  }

  /** Remove players no longer in the room. */
  retain(ids: Set<string>) {
    for (const [id, r] of this.map) {
      if (!ids.has(id)) {
        r.root.dispose(false, true);
        this.map.delete(id);
      }
    }
  }

  /** Play a jab on a remote player's avatar. */
  punch(id: string) {
    const r = this.map.get(id);
    if (r) r.punchT = 0.26;
  }

  setCarry(id: string, kind: CarryKind) {
    const r = this.map.get(id);
    if (r) r.carry = kind;
  }

  /** Where we're drawing a player right now (items they carry attach here). */
  anchor(id: string): { x: number; y: number; z: number; yaw: number } | null {
    const r = this.map.get(id);
    if (!r) return null;
    return { x: r.root.position.x, y: r.root.position.y, z: r.root.position.z, yaw: r.yaw };
  }

  /** Current pose of a remote player (for tests / debugging). */
  poseOf(id: string): MovePose | null { return this.map.get(id)?.pose ?? null; }

  update(now: number, dt: number) {
    const renderT = now - INTERP_DELAY_MS;
    for (const r of this.map.values()) {
      const s = r.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = s.length - 1; i >= 0; i--) {
        if (s[i].t <= renderT) {
          a = s[i];
          b = s[Math.min(i + 1, s.length - 1)];
          break;
        }
      }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const z = a.z + (b.z - a.z) * k;
      r.root.position.set(x, y, z);
      const yaw = lerpAngle(a.yaw, b.yaw, k);
      r.root.rotation.y = yaw;
      r.yaw = yaw;
      r.head.rotation.x = lerpAngle(a.pitch, b.pitch, k) * 0.6;

      const speed = dt > 0 ? Math.hypot(x - r.lastPos.x, z - r.lastPos.z) / dt : 0;
      // sideways component of motion (for dodge roll direction)
      const side = dt > 0 ? ((x - r.lastPos.x) * Math.cos(yaw) - (z - r.lastPos.z) * Math.sin(yaw)) / dt : 0;
      r.lastPos.set(x, y, z);

      // ---- pose targets ----
      const p = r.pose;
      let tCrouch = 0, tLean = 0, tRoll = 0, tArmUp = 0, tSquash = 0;
      if (p === "crouch" || p === "crouchWalk") { tCrouch = 1; tLean = 0.25; }
      if (p === "slide") { tCrouch = 1; tLean = -1.0; tArmUp = 0.7; }
      if (p === "dodge") { tRoll = Math.max(-0.6, Math.min(0.6, -side * 0.08)); tSquash = 0.15; tArmUp = 0.4; }
      if (p === "mantle") { tLean = 0.5; tArmUp = 1; }
      if (p === "air") { tArmUp = 0.45; }
      if (p === "stumble") { tLean = 0.35; tArmUp = 0.8; }
      if (p === "sprint") { tLean = 0.28; }
      if (p === "walk") { tLean = 0.1; }
      if (p === "knocked") { tLean = -1.45; tArmUp = 0.9; tCrouch = 0.2; }
      if (r.carry === "big" || r.carry === "giant") tLean -= 0.15; // lean back under the weight
      const f = 1 - Math.exp(-dt * 14);
      r.crouch += (tCrouch - r.crouch) * f;
      r.lean += (tLean - r.lean) * f;
      r.roll += (tRoll - r.roll) * f;
      r.armUp += (tArmUp - r.armUp) * f;
      r.squash += (tSquash - r.squash) * f;
      // carrying: both arms out front for big/giant things, one arm for small things
      const tFwd = r.carry === "big" || r.carry === "giant" ? 1 : 0;
      const tFwdR = r.carry === "small" ? 1 : tFwd;
      r.armFwd += (tFwd - r.armFwd) * f;
      r.armFwdR += (tFwdR - r.armFwdR) * f;


      // walk cycle
      const cycle = p === "sprint" ? 13 : p === "walk" ? 9 : p === "crouchWalk" ? 7 : p === "stumble" ? 25 : 0;
      r.phase += dt * cycle;
      const moving = Math.min(1, speed / 5);
      const bob = Math.abs(Math.sin(r.phase)) * 0.08 * moving;

      r.bodyPivot.rotation.set(r.lean, 0, r.roll);
      r.bodyPivot.scaling.set(1 + r.squash * 0.5, 1 - r.crouch * 0.32 - r.squash, 1 + r.squash * 0.5);
      r.bodyPivot.position.y = bob;
      // arms: swing when walking, raise for climb/slide/stumble
      const swing = Math.sin(r.phase) * 0.7 * moving * (1 - r.armUp);
      const flail = p === "stumble" ? Math.sin(r.phase * 1.3) * 0.8 : 0;
      const carryL = r.armFwd, carryR = r.armFwdR;
      r.armL.rotation.set((swing - r.armUp * 2.6 + flail) * (1 - carryL) - carryL * 1.35, 0, (-0.15 - r.armUp * 0.3) * (1 - carryL) + carryL * 0.25);
      r.armR.rotation.set((-swing - r.armUp * 2.6 - flail) * (1 - carryR) - carryR * 1.35, 0, (0.15 + r.armUp * 0.3) * (1 - carryR) - carryR * 0.25);
      if (r.punchT > 0) {
        r.punchT = Math.max(0, r.punchT - dt);
        const u = 1 - r.punchT / 0.26, k = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
        r.armR.rotation.x = r.armR.rotation.x * (1 - k) - 1.55 * k;
        r.armR.rotation.z *= 1 - k;
      }
      r.tag.position.y = 2.1 - r.crouch * 0.5;
    }
  }

  count() { return this.map.size; }

  dispose() {
    for (const r of this.map.values()) r.root.dispose(false, true);
    this.map.clear();
  }
}
````

## FILE: client/src/game/spring.ts

````ts
// A damped spring that stays stable at ANY frame rate.
// Bug found in Phase 1 testing: a plain spring update exploded to infinity at ~10 FPS
// (large time steps), which broke the camera entirely. Sub-stepping in small fixed slices
// keeps it stable; the finite-check is a last line of defence.
export class Spring {
  value = 0;
  velocity = 0;
  constructor(private stiffness: number, private damping: number) {}

  kick(v: number) { this.velocity += v; }

  update(dt: number): number {
    const slice = 1 / 240;
    let remaining = Math.min(dt, 0.5);
    while (remaining > 1e-9) {
      const h = Math.min(slice, remaining);
      // semi-implicit Euler: velocity first, then position
      this.velocity += (-this.stiffness * this.value - this.damping * this.velocity) * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) { this.value = 0; this.velocity = 0; }
    return this.value;
  }
}
````

## FILE: client/src/game/titleScene.ts

````ts
// Animated 3D title backdrop: a dusk Trashington street with a very shabby box fort.
// PLACEHOLDER ART built from simple shapes. Real models + props arrive in later phases.
import {
  Scene, Engine, UniversalCamera, HemisphericLight, DirectionalLight, PointLight, ShadowGenerator,
  Vector3, Color3, Color4, MeshBuilder, Mesh, TransformNode, DynamicTexture,
} from "./babylon.ts";
import { toon, ink, PALETTE, textTexture, unlitTextured } from "./look.ts";
import { settings } from "../settings.ts";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function windowTexture(scene: Scene, rand: () => number, cols: number, rows: number): DynamicTexture {
  const cw = 48, ch = 56;
  const tex = new DynamicTexture("windows", { width: cols * cw, height: rows * ch }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.clearRect(0, 0, cols * cw, rows * ch);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = rand() > 0.45;
      c.fillStyle = lit ? (rand() > 0.3 ? "#ffd98a" : "#9fe3ff") : "#2b2433";
      c.fillRect(i * cw + 10, j * ch + 9, cw - 20, ch - 18);
      c.strokeStyle = "#1b1420";
      c.lineWidth = 4;
      c.strokeRect(i * cw + 10, j * ch + 9, cw - 20, ch - 18);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

function skyTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("sky", { width: 16, height: 256 }, scene, false);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#3b3f8f");
  g.addColorStop(0.45, "#c46a9a");
  g.addColorStop(0.8, "#ff9a62");
  g.addColorStop(1, "#ffc98a");
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 256);
  tex.update();
  return tex;
}

export class TitleScene {
  scene: Scene;
  private camera: UniversalCamera;
  private t = 0;
  private sign!: Mesh;
  private awning!: Mesh;

  constructor(engine: Engine) {
    const scene = (this.scene = new Scene(engine));
    scene.clearColor = new Color4(0.98, 0.62, 0.45, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString("#ffb07a");
    scene.fogStart = 35;
    scene.fogEnd = 120;

    const cam = (this.camera = new UniversalCamera("titleCam", new Vector3(-4.2, 2.1, -6.5), scene));
    cam.setTarget(new Vector3(2.2, 3.2, 8));
    cam.fov = 0.9;
    cam.minZ = 0.1;
    cam.inputs.clear();

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.diffuse = new Color3(1, 0.85, 0.75);
    hemi.groundColor = new Color3(0.45, 0.35, 0.6);
    hemi.intensity = 0.75;
    const sun = new DirectionalLight("sun", new Vector3(0.6, -0.55, 0.6), scene);
    sun.position = new Vector3(-20, 20, -20);
    sun.diffuse = new Color3(1, 0.78, 0.55);
    sun.intensity = 1.1;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.darkness = 0.35;
    shadows.bias = 0.002;
    shadows.normalBias = 0.02;

    const rand = rng(7);

    // Street + sidewalk
    const road = MeshBuilder.CreateGround("road", { width: 120, height: 16 }, scene);
    road.position.z = -2;
    road.material = toon(scene, PALETTE.asphalt);
    road.receiveShadows = true;
    const walk = MeshBuilder.CreateBox("walk", { width: 120, height: 0.2, depth: 14 }, scene);
    walk.position.set(0, 0.1, 13);
    walk.material = toon(scene, PALETTE.sidewalk);
    walk.receiveShadows = true;
    // road stripes
    for (let x = -50; x < 50; x += 5) {
      const s = MeshBuilder.CreateBox("stripe", { width: 2.2, height: 0.02, depth: 0.25 }, scene);
      s.position.set(x, 0.01, -4);
      s.material = toon(scene, "#e8d56a");
    }

    // Sky backdrop (gradient) far behind the city
    const sky = MeshBuilder.CreatePlane("sky", { width: 400, height: 160 }, scene);
    sky.position.set(0, 50, 120);
    sky.material = unlitTextured(scene, skyTexture(scene), "skyMat");
    sky.applyFog = false;

    // Skyline: a row of small shops, then a row of towers behind
    const colors = [PALETTE.brick, PALETTE.teal, PALETTE.mustard, PALETTE.grape, "#7b6d8d", "#c26b4a", "#5c7a9e"];
    const rows = [
      { z0: 22, hMin: 4, hMax: 9, dMin: 6, dMax: 8 },
      { z0: 44, hMin: 16, hMax: 42, dMin: 8, dMax: 12 },
    ];
    for (const row of rows) {
      let x = -60;
      while (x < 60) {
        const w = 5 + rand() * 7;
        const h = row.hMin + rand() * (row.hMax - row.hMin);
        const d = row.dMin + rand() * (row.dMax - row.dMin);
        const z = row.z0 + rand() * 3 + d / 2;
        const b = MeshBuilder.CreateBox("bld", { width: w, height: h, depth: d }, scene);
        b.position.set(x + w / 2, h / 2, z);
        b.material = toon(scene, colors[Math.floor(rand() * colors.length)]);
        ink(b, 0.08);
        b.receiveShadows = true;
        // windows on the front face (each building draws its own window grid)
        const fw = w - 1.2, fh = h - (row.z0 < 30 ? 1.8 : 2.5);
        const cols = Math.max(1, Math.round(fw / 1.6)), rws = Math.max(1, Math.round(fh / 2.2));
        const wp = MeshBuilder.CreatePlane("win", { width: fw, height: fh }, scene);
        wp.position.set(x + w / 2, (row.z0 < 30 ? 1.8 : 2.5) + fh / 2 - 0.4, z - d / 2 - 0.14); // must sit in front of the 0.08 outline shell
        wp.material = unlitTextured(scene, windowTexture(scene, rand, cols, rws), "winMat");
        // rooftop junk
        if (rand() > 0.5) {
          const tank = MeshBuilder.CreateCylinder("tank", { diameter: 1.6, height: 2 }, scene);
          tank.position.set(x + w / 2 + (rand() - 0.5) * w * 0.5, h + 1, z);
          tank.material = toon(scene, "#7a5a3a");
          ink(tank, 0.05);
        }
        x += w + 0.3 + rand() * 1.2;
      }
    }

    // Parody billboards (clearly fictional, never clickable, never ask for money)
    const ads = [
      { text: "CRUNCHO+ PREMIUM", bg: "#ffe14a", fg: "#d6264a" },
      { text: "TRASHFLIX ULTRA MAX", bg: "#1f1f2e", fg: "#ff4a6e" },
      { text: "BOXLY: IT'S A BOX", bg: "#43c7a6", fg: "#1b1420" },
    ];
    ads.forEach((ad, i) => {
      const board = MeshBuilder.CreatePlane("ad", { width: 8, height: 2.5 }, scene);
      board.position.set(-16 + i * 16, 11 + (i % 2) * 3, 21.5);
      board.material = unlitTextured(scene, textTexture(scene, ad.text, { w: 1024, h: 320, bg: ad.bg, fg: ad.fg }), "adMat");
      ink(board, 0.08);
    });

    this.buildFort(scene, shadows);

    // Streetlamp with warm light
    const pole = MeshBuilder.CreateCylinder("pole", { diameter: 0.18, height: 5 }, scene);
    pole.position.set(5.5, 2.5, 7.5);
    pole.material = toon(scene, "#3a3444");
    ink(pole);
    const lamp = MeshBuilder.CreateSphere("lamp", { diameter: 0.7 }, scene);
    lamp.position.set(5.5, 5, 7.5);
    const lm = toon(scene, "#fff2b0", "lampbulb");
    lamp.material = lm;
    const pl = new PointLight("lampLight", new Vector3(5.5, 4.6, 7.2), scene);
    pl.diffuse = new Color3(1, 0.85, 0.5);
    pl.intensity = 0.8;
    pl.range = 14;
  }

  private buildFort(scene: Scene, shadows: ShadowGenerator) {
    const fort = new TransformNode("fort", scene);
    fort.position.set(1.2, 0.2, 6);
    fort.rotation.y = -0.35;
    const card = toon(scene, PALETTE.cardboard);
    const cardDark = toon(scene, PALETTE.cardboardDark);

    const add = (m: Mesh, mat = card, outline = 0.03) => {
      m.parent = fort;
      m.material = mat;
      ink(m, outline);
      shadows.addShadowCaster(m);
      m.receiveShadows = true;
      return m;
    };

    // The main battered box, slightly squashed and tilted
    const box = add(MeshBuilder.CreateBox("mainBox", { width: 2.4, height: 1.5, depth: 1.9 }, scene));
    box.position.set(0, 0.75, 0);
    box.rotation.z = 0.03;
    // open flaps
    const flapL = add(MeshBuilder.CreateBox("flap", { width: 1.2, height: 0.04, depth: 1.8 }, scene), cardDark);
    flapL.position.set(-1.65, 1.35, 0);
    flapL.rotation.z = 0.6;
    const flapR = add(MeshBuilder.CreateBox("flap", { width: 1.2, height: 0.04, depth: 1.8 }, scene), cardDark);
    flapR.position.set(1.62, 1.28, 0);
    flapR.rotation.z = -0.9;
    // dark doorway
    const door = add(MeshBuilder.CreatePlane("door", { width: 0.9, height: 1.0 }, scene), toon(scene, "#2a2130"), 0.0);
    door.position.set(0.25, 0.55, -0.96);
    // tape strips
    for (const [px, py, rz] of [[-0.7, 1.1, 0.4], [0.9, 0.35, -0.3], [-0.2, 1.42, 0]] as const) {
      const tape = add(MeshBuilder.CreateBox("tape", { width: 0.7, height: 0.12, depth: 0.02 }, scene), toon(scene, PALETTE.tape), 0.01);
      tape.position.set(px, py, -0.97);
      tape.rotation.z = rz;
    }
    // blanket awning on two sticks
    const awning = (this.awning = add(MeshBuilder.CreateBox("awning", { width: 2.8, height: 0.05, depth: 1.4 }, scene), toon(scene, PALETTE.blanket)));
    awning.position.set(0, 1.75, -1.35);
    awning.rotation.x = -0.35;
    for (const sx of [-1.25, 1.25]) {
      const stick = add(MeshBuilder.CreateCylinder("stick", { diameter: 0.07, height: 1.55 }, scene), toon(scene, "#6b4a2b"), 0.015);
      stick.position.set(sx, 0.78, -1.95);
      stick.rotation.z = sx * 0.03;
    }
    // hand-painted sign
    const sign = (this.sign = MeshBuilder.CreatePlane("sign", { width: 1.5, height: 0.55 }, scene));
    sign.parent = fort;
    sign.position.set(-0.3, 2.25, -1.0);
    sign.rotation.z = 0.09;
    sign.material = unlitTextured(scene, textTexture(scene, "OPEN-ISH", { w: 512, h: 190, bg: "#f3e2b8", fg: "#c0392b" }), "signMat");
    ink(sign, 0.04);
    // stacked small boxes, cone, trash can
    const small = add(MeshBuilder.CreateBox("small", { width: 0.8, height: 0.6, depth: 0.7 }, scene));
    small.position.set(1.8, 0.3, -0.6);
    small.rotation.y = 0.4;
    const small2 = add(MeshBuilder.CreateBox("small2", { width: 0.6, height: 0.45, depth: 0.55 }, scene), cardDark);
    small2.position.set(1.75, 0.83, -0.55);
    small2.rotation.y = -0.2;
    const cone = add(MeshBuilder.CreateCylinder("cone", { diameterTop: 0.05, diameterBottom: 0.5, height: 0.8 }, scene), toon(scene, PALETTE.cone));
    cone.position.set(-1.9, 0.4, -1.3);
    const can = add(MeshBuilder.CreateCylinder("can", { diameter: 0.8, height: 1.1 }, scene), toon(scene, "#5d7a6a"));
    can.position.set(-2.6, 0.55, 0.3);
  }

  update(dt: number) {
    this.t += dt;
    const sway = settings.reducedMotion ? 0 : 1;
    this.camera.position.x = -4.2 + Math.sin(this.t * 0.25) * 0.5 * sway;
    this.camera.position.y = 2.1 + Math.sin(this.t * 0.4) * 0.1 * sway;
    this.camera.setTarget(new Vector3(2.2, 3.2, 8));
    // the sign and blanket wobble in the breeze
    this.sign.rotation.z = 0.09 + Math.sin(this.t * 1.7) * 0.04 * sway;
    this.awning.rotation.x = -0.35 + Math.sin(this.t * 2.3) * 0.03 * sway;
  }

  dispose() {
    this.scene.dispose();
  }
}
````

## FILE: client/src/game/viewmodel.ts

````ts
// First-person hands: bare cartoon hands with simple white hand wraps (Blake's choice, Phase 2).
// They also hold loot: big items between both hands, small items in the right hand.
// PLACEHOLDER-QUALITY MODEL built from simple shapes, but the animation system is the real one:
//
// Animation state system: every frame we pick ONE pose from the movement state
// (idle, walk, sprint, crouch, slide, dodge, mantle, air, stumble...), compute that pose's
// target positions, and every hand bone eases toward its target. Because we always ease
// toward "the pose for the current state", poses can never conflict, freeze or get stuck:
// changing state simply changes the target. One-off impulses (landing dip) are springs on top.
import { Scene, MeshBuilder, TransformNode, Mesh, Vector3, type Camera } from "./babylon.ts";
import { toon, ink, PALETTE } from "./look.ts";
import { buildLootModel } from "./models.ts";
import type { MovePose } from "@bfb/shared";
import { Spring } from "./spring.ts";

interface HandRig {
  root: TransformNode;
  pos: Vector3;
  rot: Vector3;
}

interface Pose { lp: [number, number, number]; lr: [number, number, number]; rp: [number, number, number]; rr: [number, number, number]; }

const PUNCH_T = 0.26;
const V = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

// Base poses in camera space (x right, y up, z forward). Rotations are radians (pitch, yaw, roll).
const POSES: Record<MovePose, Pose> = {
  idle:       { lp: V(-0.30, -0.30, 0.55), lr: V(0.1, 0.25, -0.3), rp: V(0.30, -0.30, 0.55), rr: V(0.1, -0.25, 0.3) },
  walk:       { lp: V(-0.31, -0.32, 0.54), lr: V(0.1, 0.25, -0.3), rp: V(0.31, -0.32, 0.54), rr: V(0.1, -0.25, 0.3) },
  sprint:     { lp: V(-0.30, -0.36, 0.50), lr: V(0.5, 0.35, -0.5), rp: V(0.30, -0.36, 0.50), rr: V(0.5, -0.35, 0.5) },
  crouch:     { lp: V(-0.26, -0.34, 0.50), lr: V(0.3, 0.3, -0.2), rp: V(0.26, -0.34, 0.50), rr: V(0.3, -0.3, 0.2) },
  crouchWalk: { lp: V(-0.26, -0.35, 0.50), lr: V(0.3, 0.3, -0.2), rp: V(0.26, -0.35, 0.50), rr: V(0.3, -0.3, 0.2) },
  slide:      { lp: V(-0.42, -0.12, 0.45), lr: V(-0.6, 0.5, -1.0), rp: V(0.42, -0.12, 0.45), rr: V(-0.6, -0.5, 1.0) },
  dodge:      { lp: V(-0.38, -0.22, 0.50), lr: V(-0.2, 0.6, -0.9), rp: V(0.38, -0.22, 0.50), rr: V(-0.2, -0.6, 0.9) },
  mantle:     { lp: V(-0.22, -0.05, 0.62), lr: V(-0.9, 0.1, -0.1), rp: V(0.22, -0.05, 0.62), rr: V(-0.9, -0.1, 0.1) },
  air:        { lp: V(-0.34, -0.20, 0.52), lr: V(-0.2, 0.3, -0.5), rp: V(0.34, -0.20, 0.52), rr: V(-0.2, -0.3, 0.5) },
  stumble:    { lp: V(-0.40, -0.15, 0.48), lr: V(-0.4, 0.4, -1.2), rp: V(0.40, -0.15, 0.48), rr: V(-0.4, -0.4, 1.2) },
  // flat on your back: hands flop up in front of your face
  knocked:    { lp: V(-0.50, -0.30, 0.42), lr: V(-0.7, 0.6, -1.4), rp: V(0.52, -0.32, 0.44), rr: V(-0.8, -0.5, 1.5) },
};

export class Viewmodel {
  private left: HandRig;
  private right: HandRig;
  private rootNode: TransformNode;
  private t = 0;
  private phase = 0;
  private dip = new Spring(160, 18); // landing dip
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private mantleProgress = 0;
  private scene: Scene;
  private holdNode: TransformNode;
  private held: { type: string; size: "small" | "big" | "giant"; root: TransformNode } | null = null;
  private charge = 0; // 0..1 while winding up a throw
  private throwT = 0; // >0 right after a throw (follow-through)
  private punchT = 0; // >0 during a jab
  private punchSide: 1 | -1 = 1;

  constructor(scene: Scene, camera: Camera, color: string) {
    this.rootNode = new TransformNode("viewmodel", scene);
    this.rootNode.parent = camera;
    this.rootNode.scaling.setAll(0.8);
    this.scene = scene;
    this.holdNode = new TransformNode("hold", scene);
    this.holdNode.parent = this.rootNode;
    this.left = this.buildHand(scene, color, -1);
    this.right = this.buildHand(scene, color, 1);
    const init = POSES.idle;
    this.left.pos.set(...init.lp); this.left.rot.set(...init.lr);
    this.right.pos.set(...init.rp); this.right.rot.set(...init.rr);
    // Hands draw after the world with a cleared depth buffer, so they never poke through walls.
    scene.setRenderingAutoClearDepthStencil(2, true, true, true);
  }

  private buildHand(scene: Scene, color: string, side: 1 | -1): HandRig {
    const root = new TransformNode("hand" + side, scene);
    root.parent = this.rootNode;
    const parts: Mesh[] = [];
    const add = (m: Mesh, mat: string, outline = 0.007) => {
      m.parent = root;
      m.material = toon(scene, mat, "vm");
      ink(m, outline);
      m.renderingGroupId = 2;
      m.isPickable = false;
      parts.push(m);
      return m;
    };
    const WRAP = "#f4f1ea";
    // sleeve (patched jacket) going back toward the body
    const sleeve = add(MeshBuilder.CreateCylinder("sleeve", { diameterTop: 0.12, diameterBottom: 0.13, height: 0.15, tessellation: 10 }, scene), "#5a4d6e");
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.02, -0.13);
    const patch = add(MeshBuilder.CreateBox("patch", { width: 0.06, height: 0.05, depth: 0.07 }, scene), PALETTE.mustard, 0.004);
    patch.position.set(side * 0.06, 0.02, -0.12);
    patch.rotation.z = side * 0.4;
    // wrapped wrist
    const wrist = add(MeshBuilder.CreateCylinder("wrist", { diameter: 0.115, height: 0.09, tessellation: 10 }, scene), WRAP, 0.006);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.set(0, -0.01, -0.035);
    // bare cartoon hand (palm)
    const palm = add(MeshBuilder.CreateBox("palm", { width: 0.15, height: 0.075, depth: 0.15 }, scene), PALETTE.skin);
    palm.position.set(0, 0, 0.05);
    // simple white wraps: two bands around the palm and one across the knuckles
    for (const [z, h] of [[0.0, 0.03], [0.055, 0.028]] as const) {
      const band = add(MeshBuilder.CreateBox("wrap", { width: 0.158, height: 0.083, depth: h }, scene), WRAP, 0.004);
      band.position.set(0, 0, z);
    }
    const knuckle = add(MeshBuilder.CreateBox("wrapK", { width: 0.155, height: 0.03, depth: 0.04 }, scene), WRAP, 0.004);
    knuckle.position.set(0, 0.03, 0.105);
    knuckle.rotation.z = side * 0.06;
    // fingers + thumb (bare)
    for (let i = 0; i < 4; i++) {
      const f = add(MeshBuilder.CreateCapsule("finger", { radius: 0.021, height: 0.09, tessellation: 6 }, scene), PALETTE.skin, 0.005);
      f.rotation.x = Math.PI / 2 + 0.35;
      f.position.set(-0.054 + i * 0.036, -0.012, 0.14);
    }
    const thumb = add(MeshBuilder.CreateCapsule("thumb", { radius: 0.024, height: 0.085, tessellation: 6 }, scene), PALETTE.skin, 0.005);
    thumb.rotation.set(Math.PI / 2, 0, side * -0.9);
    thumb.position.set(side * -0.085, 0.008, 0.07);
    void color;
    return { root, pos: new Vector3(), rot: new Vector3() };
  }

  /** Show an item in the hands (or clear with null). */
  setHeld(type: string | null, size: "small" | "big" | "giant" = "big") {
    if (this.held && this.held.type === type) return;
    if (this.held) { this.held.root.dispose(false, true); this.held = null; }
    if (!type) return;
    const { root, meshes } = buildLootModel(this.scene, type);
    for (const m of meshes) { m.renderingGroupId = 2; if (m.renderOutline) m.outlineWidth = Math.min(m.outlineWidth, 0.012); }
    root.parent = this.holdNode;
    root.scaling.setAll(size === "small" ? 1.1 : 0.62);
    this.held = { type, size, root };
  }

  get heldType() { return this.held?.type ?? null; }

  setCharge(c: number) { this.charge = c; }

  /** Throw follow-through animation. */
  throwAnim() { this.throwT = 0.28; this.charge = 0; }

  /** Cartoon jab: alternates hands each punch. */
  punchAnim() { this.punchT = PUNCH_T; this.punchSide = this.punchSide === 1 ? -1 : 1; }

  /** Landing / impact dip (bigger impact = deeper dip). */
  kick(amount: number) {
    this.dip.kick(-amount);
  }

  update(dt: number, pose: MovePose, speed: number, yaw: number, pitch: number, reducedMotion: boolean, mantleFrac: number) {
    this.t += dt;
    const motion = reducedMotion ? 0.35 : 1;
    const base = POSES[pose];

    // Cycle speed follows actual movement speed
    const cycleRate = pose === "sprint" ? 11 : pose === "walk" ? 8 : pose === "crouchWalk" ? 6 : pose === "stumble" ? 22 : 0;
    this.phase += dt * cycleRate * Math.min(1.3, Math.max(0.5, speed / 5));

    // Global placement: poses are authored relative to this offset (keeps hands clear of the lens)
    const lp = [base.lp[0] * 0.95, base.lp[1] + 0.07, base.lp[2] + 0.1], lr = [...base.lr];
    const rp = [base.rp[0] * 0.95, base.rp[1] + 0.07, base.rp[2] + 0.1], rr = [...base.rr];
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    if (pose === "walk" || pose === "crouchWalk") {
      lp[1] += Math.abs(s) * 0.02 * motion; rp[1] += Math.abs(c) * 0.02 * motion;
      lp[2] += s * 0.02 * motion; rp[2] -= s * 0.02 * motion;
    } else if (pose === "sprint") {
      // pumping arms: alternate forward/back and up/down
      lp[2] += s * 0.09 * motion; rp[2] -= s * 0.09 * motion;
      lp[1] += s * 0.05 * motion; rp[1] -= s * 0.05 * motion;
      lr[0] += s * 0.35 * motion; rr[0] -= s * 0.35 * motion;
    } else if (pose === "idle" || pose === "crouch") {
      const br = Math.sin(this.t * 1.8) * 0.008 * motion; // breathing
      lp[1] += br; rp[1] += br;
    } else if (pose === "stumble") {
      // flail!
      lp[1] += s * 0.08 * motion; rp[1] -= s * 0.08 * motion;
      lr[2] += c * 0.6 * motion; rr[2] -= c * 0.6 * motion;
    } else if (pose === "mantle") {
      // reach up and grab (first half), then push down and haul over (second half)
      const k = mantleFrac < 0.5 ? mantleFrac * 2 : 1 - (mantleFrac - 0.5) * 2;
      lp[1] += (k - 0.5) * 0.2; rp[1] += (k - 0.5) * 0.2;
      lp[2] += (1 - k) * 0.08; rp[2] += (1 - k) * 0.08;
    }
    this.mantleProgress = mantleFrac;

    // Carrying overrides the arm pose (hands go where the item is)
    this.throwT = Math.max(0, this.throwT - dt);
    const bigCarry = this.held && this.held.size !== "small";
    if (bigCarry) {
      const bob = Math.sin(this.phase) * 0.015 * motion;
      lp[0] = -0.27; lp[1] = -0.33 + bob; lp[2] = 0.62; lr[0] = 0.2; lr[1] = 1.0; lr[2] = -0.2;
      rp[0] = 0.27; rp[1] = -0.33 - bob; rp[2] = 0.62; rr[0] = 0.2; rr[1] = -1.0; rr[2] = 0.2;
      this.holdNode.position.set(0, -0.36 + bob, 0.72);
      this.holdNode.rotation.set(0.1, 0, Math.sin(this.phase * 0.5) * 0.03 * motion); // heavy wobble
    } else if (this.held) {
      this.holdNode.position.set(rp[0] - 0.02, rp[1] + 0.07, rp[2] + 0.12);
      this.holdNode.rotation.set(rr[0], rr[1] + Math.PI / 2, 0);
    }
    // Winding up a throw: pull the throwing hand(s) back and up
    const ch = this.charge;
    if (ch > 0) {
      const shake = ch > 0.95 ? Math.sin(this.t * 60) * 0.006 : 0; // full power: straining
      rp[2] -= 0.22 * ch; rp[1] += 0.08 * ch + shake; rr[0] -= 0.7 * ch;
      if (bigCarry) { lp[2] -= 0.22 * ch; lp[1] += 0.08 * ch + shake; lr[0] -= 0.7 * ch; this.holdNode.position.z -= 0.22 * ch; this.holdNode.position.y += 0.1 * ch; }
      else if (this.held) { this.holdNode.position.z -= 0.22 * ch; this.holdNode.position.y += 0.08 * ch; }
    }
    if (this.throwT > 0) {
      const k = this.throwT / 0.28; // 1 -> 0
      rp[2] += 0.2 * k; rp[1] += 0.06 * k; rr[0] += 0.6 * k;
      lp[2] += 0.1 * k;
    }

    this.punchT = Math.max(0, this.punchT - dt);
    if (this.punchT > 0 && !this.held) {
      // fast out (first 35%), slower return
      const u = 1 - this.punchT / PUNCH_T;
      const k = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
      const p = this.punchSide === 1 ? rp : lp, r = this.punchSide === 1 ? rr : lr;
      p[0] -= this.punchSide * 0.2 * k; p[1] += 0.16 * k; p[2] += 0.38 * k;
      r[0] -= 0.25 * k; r[1] += -this.punchSide * 0.2 * k;
      const o = this.punchSide === 1 ? lp : rp; o[2] -= 0.06 * k; // other hand guards
    }

    // Look sway: hands lag slightly behind fast mouse movement
    let dyaw = yaw - this.lastYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const swayTargetX = Math.max(-0.05, Math.min(0.05, -dyaw * 1.2)) * motion;
    const swayTargetY = Math.max(-0.04, Math.min(0.04, dpitch * 1.0)) * motion;
    const sw = 1 - Math.exp(-dt * 10);
    this.swayX += (swayTargetX - this.swayX) * sw;
    this.swayY += (swayTargetY - this.swayY) * sw;

    const dip = this.dip.update(dt);

    const follow = 1 - Math.exp(-dt * (this.punchT > 0 ? 34 : pose === "dodge" || pose === "mantle" ? 22 : 14));
    const apply = (h: HandRig, p: number[], r: number[]) => {
      h.pos.x += (p[0] + this.swayX - h.pos.x) * follow;
      h.pos.y += (p[1] + this.swayY + dip * motion - h.pos.y) * follow;
      h.pos.z += (p[2] - h.pos.z) * follow;
      h.rot.x += (r[0] - h.rot.x) * follow;
      h.rot.y += (r[1] - h.rot.y) * follow;
      h.rot.z += (r[2] - h.rot.z) * follow;
      h.root.position.copyFrom(h.pos);
      h.root.rotation.copyFrom(h.rot);
    };
    apply(this.left, lp, lr);
    apply(this.right, rp, rr);
  }

  get debugMantle() { return this.mantleProgress; }
}
````

## FILE: client/src/localSession.ts

````ts
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
````

## FILE: client/src/main.ts

````ts
import "./styles.css";
import type { Room } from "@colyseus/sdk";
import { Engine } from "./game/babylon.ts";
import { TitleScene } from "./game/titleScene.ts";
import { ArenaScene } from "./game/arenaScene.ts";
import { LocalSession, SOLO_ID } from "./localSession.ts";
import { FpInput } from "./game/input.ts";
import { settings, updateSettings, onSettingsChange, type Settings } from "./settings.ts";
import { installAudioUnlock, isAudioUnlocked, whenAudioUnlocked, sfx, startTitleMusic, stopMusic } from "./audio.ts";
import {
  createRoom, joinRoom, friendlyError, inviteLink, roomCodeFromUrl, setUrlRoom, rememberRoom, forgetRoom,
} from "./net.ts";
import {
  MSG, PLAYER_COLORS, normalizeRoomCode, isValidRoomCode, sanitizeName, randomBanditName, buildTrashington,
  lootDef, RARITY_COLOR, starsOf, NPC_DEFS, pinPos as pinPosOf, type WorldView, type WorldEvent,
} from "@bfb/shared";

// Both the server and this client build the same city from the same shared code.
const CITY = buildTrashington();

// ---------------------------------------------------------------------------
// DOM helpers
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle("hidden", !on);
const TEST_MODE = new URLSearchParams(location.search).has("test");

function toast(text: string, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), ms);
  while ($("toasts").children.length > 4) $("toasts").firstElementChild?.remove();
}

function setStatus(text: string, isError = false) {
  const el = $("title-status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// Never fail silently: show any crash on screen so players can report it.
function showFatal(msg: string) {
  const el = document.getElementById("fatal");
  if (!el) return;
  el.textContent = "Something broke: " + msg + "\nPlease tell the developer what you clicked.";
  el.classList.remove("hidden");
}
window.addEventListener("error", (e) => showFatal(e.message || String(e.error)));
window.addEventListener("unhandledrejection", (e) => showFatal(String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason)));

const CONTROLS_TEXT = "WASD move / SHIFT sprint / SPACE jump + climb / C crouch (sprint+C slide) / Q dodge / E grab + search / HOLD R rob a till / G drop / CLICK punch + smash / HOLD CLICK or F throw / RIGHT CLICK pockets / ESC menu";

// ---------------------------------------------------------------------------
// Core objects
const canvas = $<HTMLCanvasElement>("game");
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: TEST_MODE, antialias: true }, true);
const input = new FpInput(canvas);

type Screen = "title" | "loading" | "playing";
let screen: Screen = "title";
let title: TitleScene | null = null;
let arena: ArenaScene | null = null;
let room: Room | null = null;
let mode: "solo" | "online" | null = null;
let dropped = false;
let leaving = false;
let ping = 0;
let lastPhase = "";
let lobbySig = "";
let settingsReturnTo: "title" | "pause" = "title";

// ---------------------------------------------------------------------------
// Title
function enterTitle(message?: string, isError = false) {
  screen = "title";
  arena?.dispose();
  arena = null;
  input.enabled = false;
  input.releaseLock();
  if (!title) title = new TitleScene(engine);
  show("title");
  show("hud", false);
  show("pause", false);
  show("loading", false);
  const code = roomCodeFromUrl();
  if (code) {
    $("invite-code").textContent = code;
    show("invite-card");
    show("main-menu", false);
  } else {
    show("invite-card", false);
    show("main-menu");
  }
  setStatus(message ?? "", isError);
  startTitleMusic();
}

function leaveTitle() {
  title?.dispose();
  title = null;
  stopMusic();
  show("title", false);
}

function playerName(): string {
  const raw = $<HTMLInputElement>("name-input").value;
  const n = sanitizeName(raw);
  updateSettings({ playerName: n });
  $<HTMLInputElement>("name-input").value = n;
  return n;
}

// ---------------------------------------------------------------------------
// Solo
/** Show a loading note while the arena compiles its shaders, so there's no freeze on entry. */
async function prewarmArena(a: ArenaScene) {
  screen = "loading";
  show("loading");
  $("loading-text").textContent = "Unfolding the arena...";
  try { await a.prewarm(); } catch (e) { console.warn("prewarm failed (continuing)", e); }
}

let local: LocalSession | null = null;

async function startSolo() {
  const name = playerName();
  leaveTitle();
  mode = "solo";
  room = null;
  local = new LocalSession(name);
  arena = new ArenaScene(engine, input, CITY, 0);
  wireArena(arena);
  arena.applyWorld(local.view, SOLO_ID, performance.now());
  await prewarmArena(arena);
  enterPlaying();
  $("lp-title").textContent = "SOLO SCAVENGE";
  show("lp-code-row", false);
  $("lp-players").innerHTML = "";
  addPlayerRow(settings.playerName, 0, ["YOU"], true);
  $("lp-hint").textContent = "Press ENTER to start. Bring loot home to your fort's yard: it locks in after 10 s. Anything you're carrying away from home when time runs out is lost!";
  $("mode-badge").textContent = "PHASE 4.5 BIG SHOTS / SOLO";
}

/** Hook the arena's loot actions + feedback up to the right place (server or local world). */
function wireArena(a: ArenaScene) {
  a.onAction = (act) => {
    if (local) local.sendAction(act);
    else if (room && !dropped) { try { room.send(MSG.ACTION, act); } catch { /* reconnecting */ } }
  };
  a.onFeedback = (text, kind) => flash(text, kind);
  a.onScreenFx = (fx, seconds) => screenFx(fx, seconds);
  a.onBanner = (title, sub, kind) => banner(title, sub, kind);
}

// ---------------------------------------------------------------------------
// Phase 3: round loop HUD
let bannerTimer = 0;
function banner(title: string, sub: string, kind: "good" | "bad" | "info") {
  const el = $("big-banner");
  $("bb-title").textContent = title;
  $("bb-sub").textContent = sub;
  el.className = "big-banner " + kind;
  void el.offsetWidth;
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => el.classList.add("hidden"), 3200);
}

/** Owner (online) or solo player, in the lobby or after the final results. */
function canStart(a: ArenaScene) {
  const ph = a.match.phase;
  if (ph !== "lobby" && ph !== "over") return false;
  if (mode === "solo") return true;
  return !!room && (room.state as any).ownerId === room.sessionId;
}
function startMatch() {
  if (!arena || !canStart(arena)) return;
  sfx.uiClick();
  if (local) local.start();
  else if (room) room.send(MSG.START);
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" && screen === "playing" && arena && canStart(arena)) { e.preventDefault(); startMatch(); }
});

const fmtTime = (t: number) => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
let wipeSig = "";
let matchSig = "", scoresSig = "", tallySig = "", eventSig = "", homeSig = "";
function updateMatchHud(a: ArenaScene) {
  const m = a.match;
  const starter = canStart(a);
  show("btn-start", starter);
  $("btn-start").textContent = m.phase === "over" ? "PLAY AGAIN" : "START MATCH";

  // timer
  let round = "", time = "", sub = "", cls = "mh-time";
  if (m.phase === "lobby") { time = "LOBBY"; sub = starter ? "Press ENTER to start the match" : "Waiting for the host to start"; }
  else if (m.phase === "intro") { round = `ROUND ${m.round}/${m.rounds}`; time = String(Math.max(1, Math.ceil(m.timeLeft))); sub = "Get ready!"; }
  else if (m.phase === "scavenge") {
    round = `ROUND ${m.round}/${m.rounds}`; time = fmtTime(m.timeLeft);
    if (m.timeLeft <= 10) cls += " danger"; else if (m.timeLeft <= 30) cls += " warn";
  } else if (m.phase === "tally") { round = `ROUND ${m.round}/${m.rounds}`; time = "TIME'S UP"; }
  else if (m.phase === "over") { time = "MATCH OVER"; sub = starter ? "Press ENTER to play again" : "Waiting for the host"; }
  const sig = round + time + sub + cls;
  if (sig !== matchSig) {
    matchSig = sig;
    $("mh-round").textContent = round; $("mh-time").textContent = time; $("mh-sub").textContent = sub;
    $("mh-time").className = cls;
  }

  // scoreboard: cash from finished rounds (+ loot locked in your fort right now)
  const sSig = a.scores.map((x) => `${x.id}${x.name}${x.cash}${x.bank}${x.connected}`).join("|") + m.phase;
  if (sSig !== scoresSig) {
    scoresSig = sSig;
    const ol = $("scores");
    ol.innerHTML = "";
    if (m.phase !== "lobby") for (const x of a.scores) {
      const li = document.createElement("li");
      if (x.me) li.className = "me";
      const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PLAYER_COLORS[x.colorIdx % PLAYER_COLORS.length];
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = x.name + (x.connected ? "" : " (away)");
      const cash = document.createElement("span"); cash.className = "cash"; cash.textContent = "$" + x.cash;
      li.append(dot, nm, cash);
      if (x.bank > 0) { const b = document.createElement("span"); b.className = "bank"; b.textContent = "+" + x.bank; b.title = "locked in the fort this round"; li.append(b); }
      ol.appendChild(li);
    }
  }

  // current city event
  let ev = "", bad = false;
  if (m.phase === "scavenge" && m.evKind) {
    const zone = Math.abs(m.evX) < 1 && Math.abs(m.evZ) < 1 ? "THE PLAZA" : `THE ${m.evZ > 0 ? "NORTH" : "SOUTH"}-${m.evX > 0 ? "EAST" : "WEST"} BLOCK`;
    if (m.evKind === "happyhour") ev = m.evStage === "live" ? `HAPPY HOUR IN ${zone}: DOUBLE LOOT (GOLD RING) - ${m.evT}s` : `HAPPY HOUR IN ${zone}...`;
    if (m.evKind === "truck") { ev = m.evStage === "warn" ? `GARBAGE TRUCK IN ${m.evT}s - CLEAR THE ROAD!` : "GARBAGE TRUCK ON THE ROAD!"; bad = true; }
    if (m.evKind === "airdrop") ev = m.evStage === "warn" ? `AIRDROP IN ${m.evT}s - PLAZA (RED TARGET)` : "AIRDROP CRATE FALLING INTO THE PLAZA!";
    if (m.evKind === "raccoons") { ev = m.evStage === "warn" ? "RACCOONS INCOMING..." : "RACCOONS ARE RAIDING THE FORTS!"; bad = true; }
  }
  if (ev + bad !== eventSig) {
    eventSig = ev + bad;
    const el = $("event-hud");
    el.textContent = ev;
    el.className = "event-hud" + (bad ? " bad" : "") + (ev ? "" : " hidden");
  }

  // home compass (during the round, when you're away from your fort)
  const h = a.home();
  const showHome = m.phase === "scavenge" && !h.inside;
  const hSig = showHome ? `${Math.round(h.dist)}|${Math.round(h.bearing * 20)}|${m.timeLeft <= 30}` : "";
  if (hSig !== homeSig) {
    homeSig = hSig;
    show("home-arrow", showHome);
    if (showHome) {
      $("ha-arrow").style.transform = `rotate(${h.bearing}rad)`;
      $("home-arrow").style.setProperty("--home", PLAYER_COLORS[a.myColorIdx % PLAYER_COLORS.length]);
      $("ha-text").textContent = `HOME ${Math.round(h.dist)} m`;
      $("home-arrow").classList.toggle("urgent", m.timeLeft <= 30);
    }
  }

  // wiped out by a car: countdown to respawn
  const wipe = a.respawnT > 0 ? `Hit by a car! Your loot is all over the road. Back at your fort in ${Math.ceil(a.respawnT)}...` : "";
  if (wipe !== wipeSig) {
    wipeSig = wipe;
    show("wipeout", !!wipe);
    $("wipeout-sub").textContent = wipe;
  }

  // tally / final results card
  const showTally = m.phase === "tally" || m.phase === "over";
  const tSig = showTally ? m.phase + m.round + m.results + Math.ceil(m.timeLeft) + starter : "";
  if (tSig !== tallySig) {
    tallySig = tSig;
    show("tally", showTally);
    if (showTally) renderTally(a, starter);
  }
}

function renderTally(a: ArenaScene, starter: boolean) {
  const m = a.match;
  let lines: { id: string; name: string; colorIdx: number; banked: number; bankedValue: number; lost: number; lostValue: number; stolen: number; cash: number }[] = [];
  try { lines = JSON.parse(m.results || "[]"); } catch { /* keep empty */ }
  const over = m.phase === "over";
  $("tally-title").textContent = over ? `TOP BANDIT: ${lines[0]?.name ?? "?"}` : `ROUND ${m.round} RESULTS`;
  const table = $("tally-table") as HTMLTableElement;
  table.innerHTML = "";
  const head = table.insertRow();
  for (const h of ["BANDIT", "BANKED", "LOST", "TOTAL"]) { const th = document.createElement("th"); th.textContent = h; head.appendChild(th); }
  lines.forEach((l, i) => {
    const tr = table.insertRow();
    if (i === 0 && over) tr.className = "winner";
    const name = tr.insertCell();
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = PLAYER_COLORS[l.colorIdx % PLAYER_COLORS.length];
    name.append(dot, document.createTextNode(l.name));
    const b = tr.insertCell(); b.className = "money"; b.textContent = `+$${l.bankedValue}` + (l.banked ? ` (${l.banked})` : "");
    const lost = tr.insertCell(); lost.className = l.lost || l.stolen ? "neg" : "";
    lost.textContent = [l.lost ? `$${l.lostValue} (${l.lost})` : "", l.stolen ? `${l.stolen} to raccoons` : ""].filter(Boolean).join(", ") || "-";
    const tot = tr.insertCell(); tot.className = "money"; tot.textContent = "$" + l.cash;
  });
  $("tally-foot").textContent = over
    ? (starter ? "The Mayor finale comes in a later phase. Press ENTER to play again." : "The Mayor finale comes in a later phase. Waiting for the host...")
    : `Round ${m.round + 1} starts in ${Math.max(1, Math.ceil(m.timeLeft))}...`;
}

const fxTimers: Record<string, number> = {};
const fxHistory: string[] = []; // for automated tests (effects can be over before a slow test looks)
/** Full-screen HTML effects: camera flash, pigeon swarm, knocked-down daze. */
function screenFx(fx: "flash" | "swarm" | "knocked", seconds: number) {
  if (fxHistory.push(fx) > 50) fxHistory.shift();
  const el = $("fx-" + fx);
  el.classList.remove("hidden", "on");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("on");
  clearTimeout(fxTimers[fx]);
  fxTimers[fx] = window.setTimeout(() => el.classList.add("hidden"), seconds * 1000);
}

let flashTimer = 0;
function flash(text: string, kind: "bad" | "good" | "info") {
  const el = $("flash");
  el.textContent = text;
  el.className = "flash " + kind;
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { el.className = "flash hidden"; }, 1100);
}

// ---------------------------------------------------------------------------
// Online
async function goOnline(kind: "create" | "join", code?: string) {
  const name = playerName();
  screen = "loading";
  show("loading");
  $("loading-text").textContent = kind === "create" ? "Building a room out of cardboard..." : `Knocking on fort ${code}...`;
  try {
    const r = kind === "create" ? await createRoom(name) : await joinRoom(code!, name);
    await waitForFirstState(r);
    sfx.join();
    await enterOnline(r);
  } catch (e) {
    console.warn("join failed", e);
    sfx.error();
    show("loading", false);
    if (kind === "join") setUrlRoom(null);
    enterTitle(friendlyError(e), true);
  }
}

function waitForFirstState(r: Room): Promise<void> {
  return new Promise((resolve, reject) => {
    const ready = () => (r.state as any)?.players?.get?.(r.sessionId);
    if (ready()) return resolve();
    const timer = setTimeout(() => reject(new Error("timeout waiting for room state")), 8000);
    const off = r.onStateChange(() => {
      if (ready()) {
        clearTimeout(timer);
        (off as any)?.clear?.();
        resolve();
      }
    });
  });
}

async function enterOnline(r: Room) {
  leaveTitle();
  room = r;
  mode = "online";
  dropped = false;
  leaving = false;
  lastPhase = "";
  lobbySig = "";
  setUrlRoom(r.roomId);
  rememberRoom(r);
  const me = (r.state as any).players.get(r.sessionId);
  local = null;
  arena = new ArenaScene(engine, input, CITY, me.colorIdx);
  wireArena(arena);
  r.onStateChange((state: any) => onRoomState(state));
  r.onMessage(MSG.EVENTS, (ev: WorldEvent[]) => arena?.handleEvents(ev));
  onRoomState(r.state);
  await prewarmArena(arena);
  enterPlaying();
  lobbySig = ""; // force the lobby panel (and host's START button) to redraw after entering
  onRoomState(r.state);
  $("lp-title").textContent = "LOBBY";
  show("lp-code-row");
  $("lp-code").textContent = r.roomId;
  $("mode-badge").textContent = "PHASE 4.5 BIG SHOTS / ONLINE";

  r.onMessage(MSG.ANNOUNCE, (m: { text: string }) => toast(m.text));
  r.onDrop(() => {
    dropped = true;
    show("reconnect-banner");
  });
  r.onReconnect(() => {
    dropped = false;
    show("reconnect-banner", false);
    toast("Reconnected!");
    rememberRoom(r);
  });
  r.onLeave((code: number) => {
    if (leaving || room !== r) return;
    room = null;
    forgetRoom();
    setUrlRoom(null);
    sfx.error();
    enterTitle(`You were disconnected from the room (code ${code}). You can create or join a new one.`, true);
  });
  onRoomState(r.state);
}

let savedToken = "";
function onRoomState(state: any) {
  if (!arena || !room) return;
  // the SDK gets a new reconnection token after an automatic reconnect: keep the saved one fresh
  if (room.reconnectionToken && room.reconnectionToken !== savedToken) { savedToken = room.reconnectionToken; rememberRoom(room); }
  arena.applyWorld(state as WorldView, room.sessionId, performance.now());

  if (state.phase !== lastPhase) {
    lastPhase = state.phase;
  }
  // Rebuild the player list only when something visible changed
  const list: string[] = [];
  state.players.forEach((p: any, sid: string) => list.push(`${sid}:${p.name}:${p.colorIdx}:${p.connected}`));
  const sig = list.join("|") + state.ownerId + state.phase;
  if (sig !== lobbySig) {
    lobbySig = sig;
    $("lp-title").textContent = state.phase === "lobby" ? "LOBBY" : "MATCH";
    $("lp-players").innerHTML = "";
    state.players.forEach((p: any, sid: string) => {
      const tags: string[] = [];
      if (sid === room!.sessionId) tags.push("YOU");
      if (sid === state.ownerId) tags.push("HOST");
      addPlayerRow(p.name + (p.connected ? "" : " (reconnecting)"), p.colorIdx, tags, p.connected);
    });
    const isOwner = state.ownerId === room.sessionId;
    $("lp-hint").textContent = state.phase === "lobby"
      ? (isOwner ? `${state.players.size}/4 bandits. Press ENTER (or ESC > START MATCH) when everyone's here.` : "Waiting for the host to start. Explore meanwhile!")
      : "Bring loot back to your fort's yard. It locks in after 10 s. Watch the traffic!";
  }
}

function addPlayerRow(name: string, colorIdx: number, tags: string[], connected: boolean) {
  const li = document.createElement("li");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
  const nm = document.createElement("span");
  nm.textContent = name; // textContent: names can never inject HTML
  if (!connected) nm.className = "off";
  li.append(dot, nm);
  for (const t of tags) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t;
    li.appendChild(tag);
  }
  $("lp-players").appendChild(li);
}

async function leaveGame() {
  sfx.uiBack();
  if (room) {
    leaving = true;
    const r = room;
    room = null;
    try { await r.leave(true); } catch { /* already gone */ }
  }
  forgetRoom();
  setUrlRoom(null);
  mode = null;
  local = null;
  show("reconnect-banner", false);
  enterTitle();
}

// ---------------------------------------------------------------------------
// Playing / pause
function enterPlaying() {
  screen = "playing";
  show("loading", false);
  show("hud");
  show("btn-pause-copy", mode === "online");
  show("btn-start", false);
  showPause(true);
}

function showPause(on: boolean) {
  show("pause", on);
  $("btn-resume").textContent = arena && input.enabled === false && !document.pointerLockElement && screen === "playing" && lastLockTime === 0
    ? "CLICK TO PLAY" : "RESUME";
}

let lastLockTime = 0;
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (input.dragLook && !locked) return;
  input.enabled = locked;
  if (locked) {
    lastLockTime = performance.now();
    show("pause", false);
    show("controls-hint", true);
    $("controls-hint").textContent = CONTROLS_TEXT;
  } else {
    input.clear();
    if (screen === "playing" && $("settings").classList.contains("hidden")) showPause(true);
  }
});
function enterDragLook() {
  input.dragLook = true;
  input.enabled = true;
  show("pause", false);
  $("controls-hint").textContent = "HOLD LEFT MOUSE + DRAG to look / " + CONTROLS_TEXT;
  canvas.focus();
}

let lockFailures = 0;
async function resume() {
  sfx.uiClick();
  if (input.dragLook) { enterDragLook(); return; }
  const ok = await input.requestLock();
  if (!ok && screen === "playing") {
    lockFailures++;
    // Browsers refuse a re-lock for ~1s after ESC; a second refusal means this page can't capture the mouse.
    if (lockFailures >= 2 || window.top !== window.self) {
      toast("Mouse capture isn't allowed here, so hold the left mouse button and drag to look.", 6000);
      enterDragLook();
    } else {
      toast("Click again to capture the mouse");
    }
  } else if (ok) {
    lockFailures = 0;
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && screen === "playing" && input.dragLook && $("pause").classList.contains("hidden") && $("settings").classList.contains("hidden")) {
    input.enabled = false;
    input.clear();
    showPause(true);
  }
});

canvas.addEventListener("click", () => {
  if (screen === "playing" && !input.locked && !input.dragLook) void resume();
});

// ---------------------------------------------------------------------------
// Settings UI
function syncSettingsUI(s: Settings) {
  document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((el) => {
    const k = el.dataset.setting as keyof Settings;
    if (el.type === "checkbox") el.checked = Boolean(s[k]);
    else el.value = String(s[k]);
  });
  const fv = document.querySelector<HTMLElement>('[data-val="fov"]');
  if (fv) fv.textContent = `(${s.fov}°)`;
}

document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((el) => {
  el.addEventListener("input", () => {
    const k = el.dataset.setting as keyof Settings;
    const v = el.type === "checkbox" ? el.checked : Number(el.value);
    updateSettings({ [k]: v } as Partial<Settings>);
  });
});
onSettingsChange((s) => {
  syncSettingsUI(s);
  arena?.applyFov();
  show("debug", s.showFps);
});

function openSettings(from: "title" | "pause") {
  sfx.uiClick();
  settingsReturnTo = from;
  syncSettingsUI(settings);
  show("pause", false);
  show("settings");
}
function closeSettings() {
  sfx.uiBack();
  show("settings", false);
  if (settingsReturnTo === "pause" && screen === "playing") showPause(true);
}

// ---------------------------------------------------------------------------
// Buttons
function onClick(id: string, fn: () => void) {
  const el = $(id);
  el.addEventListener("click", fn);
  el.addEventListener("pointerenter", () => { if (isAudioUnlocked()) sfx.uiHover(); });
}

onClick("btn-solo", () => { sfx.uiClick(); void startSolo(); });
const PREVIEW_SOLO = import.meta.env.VITE_PREVIEW_SOLO === "1";
const previewOnly = () => { sfx.error(); setStatus("This preview page is solo-only. Multiplayer rooms need the game server, which comes with the real website link.", true); };
onClick("btn-create", () => { if (PREVIEW_SOLO) return previewOnly(); sfx.uiClick(); void goOnline("create"); });
onClick("btn-join", () => {
  if (PREVIEW_SOLO) return previewOnly();
  const code = normalizeRoomCode($<HTMLInputElement>("code-input").value);
  if (!isValidRoomCode(code)) {
    sfx.error();
    setStatus("Room codes are 5 characters, like KB7QX.", true);
    return;
  }
  sfx.uiClick();
  void goOnline("join", code);
});
$("code-input").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") $("btn-join").click(); });
onClick("btn-settings", () => openSettings("title"));
onClick("btn-accept-invite", () => {
  const code = roomCodeFromUrl();
  sfx.uiClick();
  if (code) void goOnline("join", code);
});
onClick("btn-decline-invite", () => {
  sfx.uiBack();
  setUrlRoom(null);
  show("invite-card", false);
  show("main-menu");
});
onClick("btn-resume", () => void resume());
onClick("btn-pause-settings", () => openSettings("pause"));
onClick("btn-settings-close", closeSettings);
onClick("btn-leave", () => void leaveGame());
onClick("btn-start", () => startMatch());
const copyInvite = async () => {
  if (!room) return;
  const ok = await copyText(inviteLink(room.roomId));
  if (ok) { sfx.copied(); toast("Invite link copied! Paste it to your friends."); }
  else { sfx.error(); toast(`Couldn't copy automatically. Share this code: ${room.roomId}`, 5000); }
};
onClick("btn-copy", () => void copyInvite());
onClick("btn-pause-copy", () => void copyInvite());

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("settings").classList.contains("hidden")) closeSettings();
});

// ---------------------------------------------------------------------------
// HUD: stamina bar (only visible when not full) + winded flash + dodge-ready pip
let hudStaminaShown = -1;
function updateHud(a: ArenaScene) {
  const h = a.hud();
  const pct = Math.round(h.stamina * 100);
  if (pct !== hudStaminaShown) {
    hudStaminaShown = pct;
    $("stamina-fill").style.width = pct + "%";
  }
  $("stamina").classList.toggle("full", pct >= 100 && !h.winded);
  $("stamina").classList.toggle("winded", h.winded);
  $("dodge-pip").classList.toggle("ready", h.dodgeReady);

  // Look prompt: "[E] Grab Old CRT TV  $34"
  const t = a.lookTarget;
  const pt = a.punchTarget;
  const prompt = $("prompt");
  const ut = a.useTarget;
  const robbing = a.robT >= 0;
  const rt = a.robTarget;
  const jailed = a.jailT > 0;
  const sig = jailed ? "jail" : robbing ? "rob" : t ? t.id + t.note + t.value + (rt ? "R" : "") : ut ? "use" + ut.id + ut.empty : rt ? "till" + rt.id + rt.empty : pt ? "npc" + pt.id + pt.empty : "";
  const simple = (keyText: string, verbText: string, nameText: string, metaText: string) => {
    prompt.innerHTML = "";
    const key = document.createElement("span"); key.className = "key"; key.textContent = keyText;
    const verb = document.createElement("span"); verb.textContent = verbText;
    const name = document.createElement("b"); name.textContent = nameText;
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = metaText;
    prompt.append(key, verb, name, meta);
    prompt.classList.remove("hidden");
  };
  if (sig !== promptSig) {
    promptSig = sig;
    if (jailed) prompt.classList.add("hidden");
    else if (robbing) simple("HOLD R", " Robbing ", "the till", "keep holding... don't move!");
    else if (!t && ut) simple("E", " Search ", ut.name, ut.empty ? "EMPTY - refills later" : "random junk inside (maybe treasure, maybe a raccoon)");
    else if (!t && rt) simple("HOLD R", " Rob ", "the till", rt.empty ? "EMPTY right now (refills later)" : "3 s hold-up: sets off the alarm");
    else if (!t && pt?.prop) {
      simple("CLICK", " Smash ", pt.name, pt.empty ? "already smashed - comes back later" : pt.kind === "car" ? "grab what's on the seat (car alarm!)" : "loot inside");
    } else if (!t && pt) {
      // "[CLICK] Bonk Gym Bro  - fights back!"
      simple("CLICK", " Bonk ", pt.name, NPC_DEFS[pt.kind as keyof typeof NPC_DEFS]?.bigShot ? (pt.kind === "courier" ? "JACKPOT: armored (2 hits), drops the money bag. HUGE heat" : "JACKPOT: drops something valuable. BIG heat") : pt.kind === "bodyguard" ? "protects the boss: hits hard" : pt.kind === "cashier" ? "drops the float... and sets off the alarm" : pt.kind === "cop" ? "RESISTING ARREST: huge heat, 3 hits to drop them" : pt.fighter ? "FIGHTS BACK - land 2 hits before they do" : "might drop something");
    } else if (!t) prompt.classList.add("hidden");
    else {
      const d = t.def;
      const rarity = d.mystery && d.rarity !== "common" ? "mystery" : d.rarity;
      const tags: string[] = [];
      if (d.size === "small") tags.push("POCKETABLE");
      if (d.heavy && d.size !== "giant") tags.push("HEAVY");
      if (d.size === "giant") tags.push("NEEDS 2");
      prompt.innerHTML = "";
      const locked = t.note.startsWith("LOCKED");
      const key = document.createElement("span"); key.className = "key"; key.textContent = locked ? "BANKED" : "E";
      const verb = document.createElement("span");
      verb.textContent = t.note === "HELP CARRY" ? " Help carry " : locked ? ` in ${a.fortName(Number(t.note.split(":")[1]))}'s fort: ` : " Grab ";
      const name = document.createElement("b"); name.textContent = d.name; name.style.color = RARITY_COLOR[rarity];
      const price = document.createElement("span"); price.className = "price"; price.textContent = d.mystery ? "  $???" : `  $${t.value}`;
      const meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = [rarity.toUpperCase(), ...tags].join("  /  ") + "  -  " + d.blurb + (rt && d.type === "cash_register" ? "  |  or HOLD R for a quick hold-up" : "");
      prompt.append(key, verb, name, price, meta);
      prompt.classList.remove("hidden");
    }
  }

  // Pockets bar
  const inv = a.inventory;
  const invSig = inv.hand + "|" + inv.pockets.join(",") + "|" + inv.sel;
  if (invSig !== pocketsSig) {
    pocketsSig = invSig;
    const slot = (el: HTMLElement, id: string, selected: boolean) => {
      const type = id ? a.itemType(id) : null;
      el.classList.toggle("sel", selected);
      el.classList.toggle("filled", !!type);
      el.textContent = type ? lootDef(type).name : "empty";
      el.style.borderColor = type ? RARITY_COLOR[lootDef(type).mystery && lootDef(type).rarity !== "common" ? "mystery" : lootDef(type).rarity] : "";
    };
    slot($("slot-hand"), inv.hand, false);
    for (let i = 0; i < 3; i++) slot($("slot-" + i), inv.pockets[i], i === inv.sel && !inv.hand);
  }

  // Heat meter + wanted stars (30 / 60 / 90 heat)
  const heat = a.heat;
  if (heat !== heatShown) {
    heatShown = heat;
    $("heat-fill").style.width = heat + "%";
    $("heat").classList.toggle("cold", heat <= 0);
    $("heat").classList.toggle("hot", heat >= 60);
    const stars = starsOf(heat);
    $("stars").querySelectorAll("b").forEach((b, i) => b.classList.toggle("on", i < stars));
    $("heat").classList.toggle("wanted", stars > 0);
  }
  document.body.classList.toggle("jailed", jailed);

  // big-shot tracker: "$$$ Millionaire  64 m" with an arrow pointing at them
  const bs = a.bigShot;
  const bsEl = $("bigshot");
  bsEl.classList.toggle("hidden", !bs || jailed);
  if (bs) {
    $("bigshot-name").textContent = bs.name;
    $("bigshot-dist").textContent = `${Math.round(bs.dist)} m`;
    ($("bigshot-arrow") as HTMLElement).style.transform = `rotate(${bs.rel}rad)`;
  }

  updateMatchHud(a);

  // Throw charge ring
  const c = a.throwCharge;
  const ring = $("charge");
  if (c < 0) ring.classList.add("hidden");
  else {
    ring.classList.remove("hidden");
    ring.style.setProperty("--p", String(Math.round(c * 100)));
    ring.classList.toggle("max", c >= 1);
  }
}
let promptSig = "";
let heatShown = -1;
let pocketsSig = "";

// ---------------------------------------------------------------------------
// Main loop
let debugTimer = 0;
/** worst-case milliseconds per part of the frame (for performance tests) */
const perf = { update: 0, world: 0, apply: 0, events: 0, render: 0, hud: 0, frame: 0 };
let fpsSmooth = 60;
engine.runRenderLoop(() => {
  const dt = engine.getDeltaTime() / 1000;
  const now = performance.now();
  if (dt > 0) fpsSmooth += (1 / Math.max(dt, 1e-3) - fpsSmooth) * 0.05;
  if (title) {
    title.update(dt);
    title.scene.render();
  } else if (arena) {
    const t0 = performance.now();
    arena.update(dt, now);
    const t1 = performance.now();
    const out = arena.takeOutbox();
    if (local) {
      // Solo: our own World runs right here, with zero lag
      local.sendInputs(out);
      const ev = local.step(dt);
      const t2 = performance.now();
      arena.applyWorld(local.view, SOLO_ID, now);
      const t3 = performance.now();
      if (ev.length) arena.handleEvents(ev);
      perf.update = Math.max(perf.update, t1 - t0); perf.world = Math.max(perf.world, t2 - t1); perf.apply = Math.max(perf.apply, t3 - t2); perf.events = Math.max(perf.events, performance.now() - t3);
    } else if (room && !dropped && out.length) {
      try { room.send(MSG.INPUT, out); } catch { /* connection mid-drop: reconciliation fixes it */ }
    }
    const tr = performance.now();
    arena.scene.render();
    perf.render = Math.max(perf.render, performance.now() - tr);
    const th = performance.now();
    updateHud(arena);
    perf.hud = Math.max(perf.hud, performance.now() - th);
    perf.frame = Math.max(perf.frame, performance.now() - t0);
    debugTimer += dt;
    if (settings.showFps && debugTimer > 0.25) {
      debugTimer = 0;
      const p = arena.position;
      $("debug").textContent =
        `FPS ${fpsSmooth.toFixed(0)}  ping ${mode === "online" ? ping + "ms" : "n/a"}\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}\n` +
        `unconfirmed inputs ${arena.stats.pending}  corrections ${arena.stats.corrections}\n` +
        `others ${arena.remoteCount()}`;
    }
  } else {
    engine.clear(null as any, true, true);
  }
});
window.addEventListener("resize", () => engine.resize());
// Performance mode renders at a lower resolution (big win on older laptops / integrated graphics)
const applyScaling = () => engine.setHardwareScalingLevel(settings.lowGraphics ? 1.5 : 1);
applyScaling();
onSettingsChange(applyScaling);
setInterval(() => { if (room && !dropped) room.ping((ms: number) => { ping = Math.round(ms); }); }, 2000);

// ---------------------------------------------------------------------------
// Boot
installAudioUnlock();
whenAudioUnlocked(() => show("sound-hint", false));
if (!settings.playerName) updateSettings({ playerName: randomBanditName() });
$<HTMLInputElement>("name-input").value = settings.playerName;
syncSettingsUI(settings);
show("debug", settings.showFps);
enterTitle();

// Read-only hooks for automated tests (and curious devs). Movement override only in ?test mode.
(window as any).__bfb = {
  info: () => ({
    screen, mode, roomCode: room?.roomId ?? null, sessionId: room?.sessionId ?? null,
    pos: arena?.position ?? null, stats: arena ? { ...arena.stats } : null, remotes: arena?.remoteCount() ?? 0,
    hud: arena ? arena.hud() : null,
    remotePoses: arena && room ? (() => { const o: any = {}; (room!.state as any).players.forEach((_p: any, id: string) => { if (id !== room!.sessionId) o[id] = arena!.remotePose(id); }); return o; })() : null,
    players: room ? (() => { const o: any = {}; (room!.state as any).players.forEach((p: any, id: string) => { o[id] = { name: p.name, x: p.x, z: p.z, connected: p.connected }; }); return o; })() : null,
    phase: room ? (room.state as any).phase : null, ping, fps: Math.round(fpsSmooth),
    drawCalls: (engine as any)._drawCalls?.current ?? null,
  }),
  ...(TEST_MODE ? {
    setAxes: (a: { mx: number; mz: number; sprint?: boolean; jump?: boolean; crouch?: boolean; dodge?: boolean } | null) => {
      input.override = a ? { mx: a.mx, mz: a.mz, sprint: !!a.sprint, jump: !!a.jump, crouch: !!a.crouch, dodge: !!a.dodge } : null;
    },
    setYaw: (y: number) => { input.yaw = y; },
    setPitch: (p: number) => { input.pitch = p; },
    teleport: (x: number, z: number, yaw: number) => {
      if (local) local.teleport(x, z, yaw); else room?.send("dbg", { op: "teleport", x, z, yaw });
      arena?.debugTeleport(x, z, yaw);
    },
    spawnItem: (type: string, x: number, z: number) => { if (local) return local.spawnItem(type, x, z); room?.send("dbg", { op: "spawn", type, x, z }); return null; },
    items: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.items?.forEach((it: any, id: string) => out.push({ id, type: it.type, x: it.x, y: it.y, z: it.z, mode: it.mode, holder: it.holder, holder2: it.holder2, value: it.value, resting: it.resting, lock: it.lock, fort: it.fort, mult: it.mult })); return out; },
    inventory: () => arena?.inventory ?? null,
    serverInventory: () => { const v: any = local ? local.view : room?.state; const p = v?.players?.get(local ? SOLO_ID : room?.sessionId); return p ? { hand: p.hand, pockets: [p.p0, p.p1, p.p2], sel: p.sel, carryMul: p.carryMul } : null; },
    lookTarget: () => arena?.lookTarget ? { id: arena.lookTarget.id, type: arena.lookTarget.def.type } : null,
    landmarks: () => CITY.landmarks,
    worldTime: () => local?.world.time ?? null,
    testInput: (on: boolean) => { input.assumeLocked = on; input.enabled = on; if (!on) input.clear(); show("pause", !on && screen === "playing"); },
    perf: (reset = false) => { const o = { ...perf }; if (reset) for (const k in perf) (perf as any)[k] = 0; return o; },
    move: () => arena?.moveState ?? null,
    scene: () => (title?.scene ?? arena?.scene),
    dropConnection: () => { (room as any)?.connection?.close?.(); },
    npcs: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.npcs?.forEach((n: any, id: string) => out.push({ id, kind: n.kind, x: n.x, y: n.y, z: n.z, state: n.state, target: n.target, robbed: n.robbed })); return out; },
    placeNpc: (kind: string, x: number, z: number, yaw = 0) => { if (local) return local.placeNpc(kind, x, z, yaw); room?.send("dbg", { op: "npc", kind, x, z, yaw }); return null; },
    clearNpcs: (x: number, z: number, r: number) => { if (local) local.world.npc.removeNear(x, z, r); else room?.send("dbg", { op: "clearNpcs", x, z, r }); },
    match: () => arena ? { ...arena.match, scores: arena.scores, home: arena.home() } : null,
    startMatch: () => startMatch(),
    triggerEvent: (kind: string) => { if (local) local.world.match.trigger(kind as never); else room?.send("dbg", { op: "event", kind }); },
    setTimeLeft: (t: number) => { if (local) { if (local.world.match.phase !== "lobby") local.world.match.timeLeft = t; } else room?.send("dbg", { op: "time", t }); },
    noEvents: () => { if (local) local.world.match.cancelPlannedEvents(); else room?.send("dbg", { op: "noEvents" }); },
    fxHistory: () => [...fxHistory],
    props: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.props?.forEach((pv: any, id: string) => out.push({ id, ready: pv.ready, alarm: pv.alarm })); return out; },
    propDefs: () => CITY.props,
    cars: () => arena?.carPositions() ?? [],
    useTarget: () => arena?.useTarget ?? null,
    robTarget: () => arena?.robTarget ?? null,
    robT: () => arena?.robT ?? -1,
    respawnT: () => arena?.respawnT ?? 0,
    wipeout: () => { if (local) { const p = local.world.players.get(SOLO_ID)!; local.world.traffic.wipeout(p, local.world.traffic.cars[0]); } else room?.send("dbg", { op: "wipeout" }); },
    npcStats: () => arena?.npcStats() ?? null,
    npcDrawn: (id: string) => arena?.npcDrawnPos(id) ?? null,
    punchTarget: () => arena?.punchTarget ?? null,
    heat: () => arena?.heat ?? null,
    // ---- Phase 4 police + jail
    setHeat: (v: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; p.notoriety = 0; local.world.addHeat(p, v); } else room?.send("dbg", { op: "heat", v }); },
    bust: () => { if (local) local.world.police.bust(local.world.players.get(SOLO_ID)!, "test", false); else room?.send("dbg", { op: "bust" }); },
    setJailTime: (t: number) => { if (local) { const p = local.world.players.get(SOLO_ID)!; if (p.jailT > 0) p.jailT = t; } else room?.send("dbg", { op: "jailTime", t }); },
    clearCops: () => { if (local) local.world.police.reset(); else room?.send("dbg", { op: "clearCops" }); },
    jail: () => arena ? { jailT: arena.jailT, seed: arena.lockSeed, open: arena.lock.open, set: arena.lock.run?.set ?? 0, pins: arena.lock.run?.def.pins.length ?? 0, sel: arena.lock.sel, history: [...arena.lock.history], solved: !!arena.lock.run?.solved, noise: arena.lock.run?.noise ?? 0, cx: arena.lock.cx, cy: arena.lock.cy, hover: arena.lock.hoverPin() } : null,
    /** Pick the lock perfectly THROUGH the real UI (keys + timing), like a very good player. */
    lockAutoPlay: () => new Promise<boolean>((resolve) => {
      const L = arena?.lock;
      if (!L?.run) return resolve(false);
      const stepOnce = () => {
        const r = L.run;
        if (!r) return resolve(true);
        if (r.solved) return resolve(true);
        const want = r.def.order[r.set];
        // walk the selection to the binding pin with D presses
        if (L.sel !== want) { L.key("KeyD"); return setTimeout(stepOnce, 30); }
        const p = r.def.pins[want];
        const now = L.now();
        if (now < r.lockUntil) return setTimeout(stepOnce, 100);
        // find the next window, then poll the lock clock and press SPACE while inside it
        let a = now + 0.02; let guard = 0;
        while (!(pinPosOf(p, a) >= p.lo && pinPosOf(p, a) <= p.hi) && guard++ < 5000) a += 0.002;
        let b = a; guard = 0;
        while (pinPosOf(p, b) >= p.lo && pinPosOf(p, b) <= p.hi && guard++ < 5000) b += 0.002;
        const lo = a + (b - a) * 0.25, hi = b - (b - a) * 0.25;
        const poll = () => {
          const t = L.now();
          if (t > hi) return stepOnce(); // missed it (slow frame): aim for the next one
          if (t >= lo) { L.key("Space"); return setTimeout(stepOnce, 40); }
          setTimeout(poll, 4);
        };
        poll();
      };
      stepOnce();
    }),
    copCars: () => arena?.copCarPositions() ?? [],
    cops: () => { const out: any[] = []; const v: any = local ? local.view : room?.state; v?.npcs?.forEach((n: any, id: string) => { if (n.kind === "cop") out.push({ id, x: n.x, z: n.z, state: n.state, target: n.target }); }); return out; },
    station: () => CITY.station,
    camPitch: () => { const sc: any = arena?.scene; return sc?.activeCamera?.rotation?.x ?? null; },
    stars: () => Array.from(document.querySelectorAll("#stars b.on")).length,
    spawnBigShot: (kind?: string) => { if (local) { const n = local.world.npc.spawnBigShot(kind as never); return n?.id ?? null; } room?.send("dbg", { op: "bigShot", kind }); return null; },
    bigShot: () => arena?.bigShot ?? null,
    actionLog: () => [...(arena?.actionLog ?? [])],
  } : {}),
};
````

## FILE: client/src/net.preview.ts

````ts
// Preview-page only: multiplayer is unavailable (no server), so networking is stubbed out.
const off = () => { throw new Error("Multiplayer isn't available in the preview page"); };
export function serverUrl(): string { return ""; }
export function rememberRoom(): void {}
export function forgetRoom(): void {}
export function friendlyError(): string { return "Multiplayer isn't available in the preview page."; }
export async function createRoom(): Promise<any> { return off(); }
export async function joinRoom(): Promise<any> { return off(); }
export function inviteLink(code: string): string { return code; }
export function roomCodeFromUrl(): string | null { return null; }
export function setUrlRoom(): void {}
````

## FILE: client/src/net.ts

````ts
// Talking to the Colyseus multiplayer server.
import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, normalizeRoomCode, isValidRoomCode } from "@bfb/shared";

export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  // Local development: server runs on port 2567 on the same machine.
  return `${location.protocol}//${location.hostname}:2567`;
}

let client: Client | null = null;
function getClient(): Client {
  if (!client) client = new Client(serverUrl());
  return client;
}

const TOKEN_KEY = "bfb.reconnect";

/** Remember how to get back into this room if the tab is refreshed. */
export function rememberRoom(room: Room): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code: room.roomId, token: room.reconnectionToken }));
  } catch { /* storage blocked */ }
}

export function forgetRoom(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function savedToken(code: string): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v.code === code ? v.token : null;
  } catch {
    return null;
  }
}

/** Turns a raw error into a sentence a player understands. */
export function friendlyError(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? "");
  if (/not found|invalid|expired/i.test(msg)) return "That room doesn't exist any more. Check the code, or create a new room.";
  if (/locked|full|maxClients/i.test(msg)) return "That room is full (4 bandits max).";
  if (/fetch|network|ECONNREFUSED|Failed|timeout|offline/i.test(msg)) return "Can't reach the game server. It may be waking up (free hosting takes ~1 minute) or offline. Try again shortly.";
  return "Something went wrong joining the room: " + msg.slice(0, 120);
}

export async function createRoom(name: string): Promise<Room> {
  return getClient().create(ROOM_NAME, { name });
}

export async function joinRoom(rawCode: string, name: string): Promise<Room> {
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) throw new Error("invalid room code");
  const token = savedToken(code);
  if (token) {
    try {
      return await getClient().reconnect(token);
    } catch {
      forgetRoom(); // seat expired: join as a new player instead
    }
  }
  return getClient().joinById(code, { name });
}

export function inviteLink(code: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("room", code);
  return u.toString();
}

export function roomCodeFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get("room");
  if (!c) return null;
  const n = normalizeRoomCode(c);
  return isValidRoomCode(n) ? n : null;
}

export function setUrlRoom(code: string | null): void {
  const u = new URL(location.href);
  if (code) u.searchParams.set("room", code);
  else u.searchParams.delete("room");
  history.replaceState(null, "", u.toString());
}
````

## FILE: client/src/settings.ts

````ts
// Player settings, remembered in this browser only (localStorage).
// Every read/write is wrapped: some browsers block storage, and the game must still work.

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  mouseSensitivity: number; // 0.2..3 (1 = default)
  invertY: boolean;
  fov: number; // horizontal degrees
  reducedMotion: boolean;
  screenShake: number; // 0..1
  showFps: boolean;
  /** Performance mode for older laptops: no shadows, lower resolution, shorter view distance */
  lowGraphics: boolean;
  playerName: string;
}

const KEY = "bfb.settings.v1";

function defaults(): Settings {
  const prefersReduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    muted: false,
    mouseSensitivity: 1,
    invertY: false,
    fov: 90,
    reducedMotion: prefersReduced,
    screenShake: prefersReduced ? 0 : 1,
    showFps: false,
    lowGraphics: false,
    playerName: "",
  };
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const out = { ...d };
    for (const k of Object.keys(d) as (keyof Settings)[]) {
      if (typeof parsed[k] === typeof d[k]) (out as any)[k] = parsed[k];
    }
    return out;
  } catch {
    return d;
  }
}

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();
export const settings: Settings = load();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: settings still apply for this visit */
  }
  listeners.forEach((l) => l(settings));
}

export function onSettingsChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
````

## FILE: client/src/styles.css

````css
:root {
  --ink: #1b1420;
  --card: #c9955b;
  --card-dark: #a8743f;
  --paper: #f3e2b8;
  --go: #ffcf3a;
  --danger: #ff5a3c;
  --blue: #2fb6ff;
  --text: #1b1420;
  --shadow: 4px 5px 0 var(--ink);
  font-family: "Nunito", system-ui, sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: #2a2130; color: var(--text); }
canvas#game { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; outline: none; touch-action: none; }

.hidden { display: none !important; }
.screen { position: fixed; inset: 0; display: flex; align-items: center; justify-content: flex-end; z-index: 10; }
.screen.dim { justify-content: center; background: rgba(27, 20, 32, 0.55); z-index: 30; }

/* ---------- Title ---------- */
#title { padding: 3vh 6vw; pointer-events: none; }
.title-panel { pointer-events: auto; width: min(420px, 92vw); display: flex; flex-direction: column; gap: 14px; }
.logo { margin: 0; line-height: 0.9; font-family: "Bungee", "Arial Black", sans-serif; font-weight: 400; transform: rotate(-3deg); }
.logo-line { display: block; color: var(--card); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; text-shadow: 5px 6px 0 var(--ink); }
.logo .l1 { font-size: clamp(38px, 6vw, 64px); }
.logo .l2 { font-size: clamp(52px, 8.5vw, 92px); color: var(--go); transform: rotate(2deg) translateX(18px); }
.tagline { margin: 0; font-weight: 800; font-size: 17px; color: #fff; text-shadow: 2px 2px 0 var(--ink); }

.card {
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 10px 14px 8px 12px;
  box-shadow: var(--shadow);
  padding: 16px;
}
.menu { display: flex; flex-direction: column; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 4px; font-weight: 900; color: #fff; text-shadow: 2px 2px 0 var(--ink); }
input:not([type]), input[type="text"] {
  font: 800 18px "Nunito", sans-serif;
  padding: 10px 12px;
  border: 3px solid var(--ink);
  border-radius: 8px;
  background: #fffaf0;
  color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  outline: none;
}
input:focus-visible { box-shadow: 0 0 0 3px var(--go), 3px 3px 0 var(--ink); }

.btn {
  font: 400 20px "Bungee", "Arial Black", sans-serif;
  letter-spacing: 0.5px;
  padding: 12px 16px;
  color: var(--ink);
  background: var(--card);
  border: 3px solid var(--ink);
  border-radius: 8px 12px 9px 11px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.1s;
}
.btn:hover { transform: translate(-1px, -2px) rotate(-0.6deg); box-shadow: 6px 7px 0 var(--ink); }
.btn:active { transform: translate(3px, 4px); box-shadow: 1px 1px 0 var(--ink); }
.btn:focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-go { background: var(--go); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-quiet { background: #d8cfc0; font-size: 16px; }
.btn-small { font-size: 16px; padding: 10px 14px; }
.btn-tiny { font-size: 12px; padding: 4px 8px; box-shadow: 2px 2px 0 var(--ink); }
.btn-link { background: none; border: none; color: var(--ink); text-decoration: underline; cursor: pointer; font: 700 14px "Nunito"; }

.join-row { display: flex; gap: 8px; }
.join-row input { flex: 1; min-width: 0; text-transform: uppercase; letter-spacing: 4px; font-family: "Bungee", monospace; }

.status { margin: 0; font-weight: 800; color: #fff; }
.status:not(:empty) { background: rgba(27, 20, 32, 0.82); padding: 8px 12px; border-radius: 8px; border: 2px solid var(--ink); }
.status.error:not(:empty) { background: #b8321c; }

.invite { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; transform: rotate(-1deg); }
.invite-label { font-weight: 900; }
.code-big { font: 400 44px "Bungee", monospace; letter-spacing: 6px; }

.title-footer {
  position: fixed; left: 16px; bottom: 12px; color: #fff; font-weight: 700; font-size: 13px;
  text-shadow: 1px 1px 0 var(--ink); pointer-events: none; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
}
.badge { font: 400 12px "Bungee", sans-serif; background: var(--danger); color: #fff; padding: 3px 8px; border: 2px solid var(--ink); border-radius: 6px; }
.sound-hint { opacity: 0.85; font-style: italic; }

/* ---------- Loading ---------- */
#loading { justify-content: center; background: rgba(27, 20, 32, 0.6); z-index: 40; }
.loading-box { text-align: center; color: #fff; font-weight: 900; font-size: 20px; text-shadow: 2px 2px 0 var(--ink); }
.spinner-box { width: 64px; height: 52px; margin: 0 auto 14px; background: var(--card); border: 4px solid var(--ink); border-radius: 4px; animation: wobble 0.8s ease-in-out infinite; }
@keyframes wobble { 0%, 100% { transform: rotate(-8deg) scale(1, 1); } 50% { transform: rotate(8deg) scale(1.08, 0.92); } }

/* ---------- HUD ---------- */
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; }
#crosshair { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; border: 2px solid var(--ink); }
.hud-card { position: absolute; left: 14px; top: 14px; width: 250px; padding: 10px 12px; pointer-events: auto; font-weight: 800; }
.lp-title { font: 400 16px "Bungee", sans-serif; }
.lp-code-row { display: flex; align-items: center; gap: 6px; margin: 4px 0 6px; }
.lp-code-row b { font: 400 18px "Bungee", monospace; letter-spacing: 2px; }
#lp-players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
#lp-players li { display: flex; align-items: center; gap: 6px; }
#lp-players .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--ink); flex: none; }
#lp-players .tag { font-size: 11px; background: var(--ink); color: #fff; padding: 0 5px; border-radius: 4px; }
#lp-players .off { opacity: 0.5; font-style: italic; }
.lp-hint { margin-top: 6px; font-size: 12px; opacity: 0.8; }
.hud-badge { position: absolute; right: 14px; top: 14px; }
#toasts { position: absolute; top: 150px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; align-items: center; }
.toast { background: var(--paper); border: 3px solid var(--ink); border-radius: 8px; padding: 6px 12px; font-weight: 900; box-shadow: 3px 3px 0 var(--ink); animation: pop 0.25s ease-out; }
@keyframes pop { from { transform: scale(0.6) rotate(-4deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
.banner { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); background: var(--danger); color: #fff; font: 400 20px "Bungee"; padding: 10px 18px; border: 3px solid var(--ink); border-radius: 10px; box-shadow: var(--shadow); }
.debug { position: absolute; right: 14px; bottom: 40px; background: rgba(0,0,0,0.6); color: #aef; font: 12px monospace; padding: 6px 8px; border-radius: 6px; white-space: pre; }
.controls-hint { position: absolute; bottom: 8px; left: 50%; max-width: min(640px, 60vw); text-align: center; font-size: 12px !important; transform: translateX(-50%); color: #fff; font-weight: 800; font-size: 13px; text-shadow: 1px 1px 0 var(--ink), -1px -1px 0 var(--ink); opacity: 0.85; }

/* ---------- Pause + Settings ---------- */
.pause-card, .settings-card { display: flex; flex-direction: column; gap: 10px; width: min(380px, 92vw); }
.settings-card { width: min(520px, 94vw); max-height: 90vh; overflow: auto; }
h2 { margin: 0; font: 400 28px "Bungee", sans-serif; }
.small { margin: 0; font-size: 13px; font-weight: 700; }
.settings-grid { display: flex; flex-direction: column; gap: 10px; font-weight: 800; }
.settings-grid label { display: flex; flex-direction: column; gap: 4px; }
.settings-grid label.check { flex-direction: row; align-items: center; gap: 8px; }
.settings-grid input[type="range"] { accent-color: var(--card-dark); width: 100%; }
.settings-grid input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--card-dark); }

@media (prefers-reduced-motion: reduce) {
  .spinner-box, .toast { animation: none; }
  .btn { transition: none; }
}

.fatal { position: fixed; left: 16px; right: 16px; bottom: 48px; z-index: 100; background: #b8321c; color: #fff; font: 800 15px "Nunito", sans-serif; padding: 10px 14px; border: 3px solid var(--ink); border-radius: 10px; box-shadow: var(--shadow); white-space: pre-wrap; }

/* Stamina bar under the crosshair: fades out when full */
.stamina { position: absolute; left: 50%; top: calc(50% + 34px); width: 120px; height: 12px; margin-left: -60px; background: rgba(27, 20, 32, 0.55); border: 2px solid var(--ink); border-radius: 7px; overflow: visible; transition: opacity 0.4s; }
.stamina.full { opacity: 0; }
#stamina-fill { height: 100%; width: 100%; background: #7fe07a; border-radius: 4px; }
.stamina.winded #stamina-fill { background: var(--danger); }
.winded-label { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); font: 400 13px "Bungee", sans-serif; color: var(--danger); text-shadow: 1px 1px 0 var(--ink); opacity: 0; white-space: nowrap; }
.stamina.winded .winded-label { opacity: 1; animation: pant 0.5s ease-in-out infinite; }
@keyframes pant { 50% { transform: translateX(-50%) scale(1.15); } }
.dodge-pip { position: absolute; left: calc(50% + 72px); top: calc(50% + 29px); width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--ink); background: #6f6a78; color: #fff; font: 400 11px "Bungee", sans-serif; display: flex; align-items: center; justify-content: center; opacity: 0.5; transition: opacity 0.2s, background 0.2s; }
.dodge-pip.ready { background: var(--blue); opacity: 0.9; }
@media (prefers-reduced-motion: reduce) { .stamina.winded .winded-label { animation: none; } }

/* ---- Phase 2: loot HUD ---- */
.prompt { position: absolute; left: 50%; top: calc(50% + 58px); transform: translateX(-50%); max-width: min(560px, 90vw); text-align: center; color: #fff; font: 800 17px "Nunito", sans-serif; text-shadow: 1px 1px 0 var(--ink), -1px -1px 0 var(--ink), 1px -1px 0 var(--ink), -1px 1px 0 var(--ink); }
.prompt b { font-family: "Bungee", sans-serif; font-weight: 400; }
.prompt .key { display: inline-block; min-width: 24px; padding: 1px 6px; background: var(--paper); color: var(--ink); border: 2px solid var(--ink); border-radius: 5px; font: 400 14px "Bungee", sans-serif; text-shadow: none; box-shadow: 2px 2px 0 var(--ink); }
.prompt .price { font-family: "Bungee", sans-serif; color: #7fe07a; }
.prompt .meta { font-size: 12px; opacity: 0.95; margin-top: 3px; font-weight: 700; }
.flash { position: absolute; left: 50%; top: calc(50% - 70px); transform: translateX(-50%); font: 400 22px "Bungee", sans-serif; color: #fff; text-shadow: 2px 2px 0 var(--ink); animation: pop 0.2s ease-out; white-space: nowrap; }
.flash.bad { color: #ffb4a3; }
.flash.good { color: #9dff95; }
.pockets { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: flex; gap: 8px; align-items: flex-end; }
.slot-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.slot-label { font: 400 10px "Bungee", sans-serif; color: #fff; text-shadow: 1px 1px 0 var(--ink); }
.slot { width: 104px; height: 40px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 2px 6px; font: 800 11px "Nunito", sans-serif; line-height: 1.1; color: rgba(255,255,255,0.55); background: rgba(27, 20, 32, 0.55); border: 3px solid rgba(27, 20, 32, 0.8); border-radius: 8px; overflow: hidden; }
.slot.filled { color: #fff; background: rgba(27, 20, 32, 0.8); }
.slot.hand { width: 130px; }
.slot.sel { box-shadow: 0 0 0 3px var(--go); }
.charge { --p: 0; position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; background: conic-gradient(var(--go) calc(var(--p) * 1%), rgba(27, 20, 32, 0.35) 0); -webkit-mask: radial-gradient(circle, transparent 17px, #000 18px); mask: radial-gradient(circle, transparent 17px, #000 18px); }
.charge.max { background: conic-gradient(var(--danger) 100%, transparent 0); }
@media (max-width: 700px) { .slot { width: 72px; } .slot.hand { width: 90px; } }

/* ---- Phase 2.5: heat meter + full-screen effects ---- */
.heat { position: absolute; top: 118px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; color: #fff; font: 400 13px "Bungee", sans-serif; text-shadow: 1px 1px 0 var(--ink); transition: opacity 0.5s; pointer-events: auto; }
.heat.cold { opacity: 0; pointer-events: none; }
.heat-bar { width: 110px; height: 10px; background: rgba(27, 20, 32, 0.55); border: 2px solid var(--ink); border-radius: 6px; overflow: hidden; }
#heat-fill { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffcf3a, #ff5a3c); transition: width 0.3s; }
.heat.hot .heat-label { color: #ff5a3c; animation: pant 0.6s ease-in-out infinite; }
.fx { position: absolute; inset: 0; pointer-events: none; }
.fx-flash { background: #fff; opacity: 0; }
.fx-flash.on { animation: camflash 1.2s ease-out forwards; }
@keyframes camflash { 0% { opacity: 0.95; } 25% { opacity: 0.85; } 100% { opacity: 0; } }
.fx-knocked { background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(27,20,32,0.55) 100%); }
.fx-knocked .daze { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); color: #ffe14a; font: 400 44px "Bungee", sans-serif; letter-spacing: 18px; text-shadow: 2px 2px 0 var(--ink); animation: daze 0.9s linear infinite; }
@keyframes daze { 0% { transform: translateX(-50%) rotate(-8deg); } 50% { transform: translateX(-50%) rotate(8deg); } 100% { transform: translateX(-50%) rotate(-8deg); } }
.fx-swarm i { position: absolute; width: 90px; height: 60px; border-radius: 50%; background: #8a94a8; border: 4px solid var(--ink); box-shadow: inset -12px -8px 0 #6f7a91; animation: flap 0.25s ease-in-out infinite alternate, circle 2.4s linear infinite; }
.fx-swarm i::after { content: ""; position: absolute; right: -14px; top: 18px; border: 10px solid transparent; border-left: 16px solid #ffcf3a; }
.fx-swarm i:nth-child(1) { left: 4%; top: 8%; animation-delay: 0s, -0.3s; }
.fx-swarm i:nth-child(2) { right: 6%; top: 14%; animation-delay: -0.1s, -1.1s; }
.fx-swarm i:nth-child(3) { left: 10%; bottom: 18%; animation-delay: -0.05s, -0.7s; }
.fx-swarm i:nth-child(4) { right: 12%; bottom: 12%; animation-delay: -0.15s, -1.8s; }
.fx-swarm i:nth-child(5) { left: 38%; top: 4%; animation-delay: -0.2s, -0.4s; }
.fx-swarm i:nth-child(6) { left: 22%; top: 50%; animation-delay: -0.12s, -2s; }
.fx-swarm i:nth-child(7) { right: 24%; top: 58%; animation-delay: -0.08s, -1.4s; }
@keyframes flap { from { transform: scaleY(1); } to { transform: scaleY(0.7); } }
@keyframes circle { 0% { translate: 0 0; } 25% { translate: 40px -20px; } 50% { translate: 0 -40px; } 75% { translate: -40px -20px; } 100% { translate: 0 0; } }
@media (prefers-reduced-motion: reduce) { .fx-swarm i, .fx-knocked .daze, .heat.hot .heat-label { animation: none; } .fx-flash.on { animation-duration: 0.4s; } }

/* ---- Phase 3: round HUD, scores, banners, tally ---- */
.match-hud { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); text-align: center; color: #fff; text-shadow: 2px 2px 0 var(--ink); pointer-events: none; }
.mh-round { font: 400 13px "Bungee", sans-serif; opacity: 0.9; }
.mh-time { font: 400 34px "Bungee", sans-serif; line-height: 1; }
.mh-time.warn { color: #ffcf3a; }
.mh-time.danger { color: #ff5a3c; animation: pant 0.5s ease-in-out infinite; }
.mh-sub { font: 800 14px "Nunito", sans-serif; margin-top: 2px; }
.event-hud { position: absolute; top: 88px; left: 50%; transform: translateX(-50%); background: rgba(27,20,32,0.7); color: #ffe14a; font: 400 13px "Bungee", sans-serif; padding: 4px 10px; border: 2px solid var(--ink); border-radius: 8px; white-space: nowrap; }
.event-hud.bad { color: #ff8a7a; }
.home-arrow { position: absolute; left: 50%; top: calc(50% + 90px); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; color: #fff; font: 400 12px "Bungee", sans-serif; text-shadow: 1px 1px 0 var(--ink); }
.home-arrow .ha-arrow { width: 0; height: 0; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 22px solid var(--home, #fff); filter: drop-shadow(1px 1px 0 var(--ink)) drop-shadow(-1px -1px 0 var(--ink)); }
.home-arrow.urgent span { color: #ff5a3c; animation: pant 0.5s ease-in-out infinite; }
.scores { position: absolute; right: 14px; top: 48px; margin: 0; padding: 6px 8px; list-style: none; background: rgba(27,20,32,0.6); border: 2px solid var(--ink); border-radius: 8px; min-width: 170px; }
.scores:empty { display: none; }
.scores li { display: flex; align-items: center; gap: 6px; color: #fff; font: 800 13px "Nunito", sans-serif; padding: 1px 0; }
.scores li .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--ink); flex: none; }
.scores li .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
.scores li .cash { font-family: "Bungee", sans-serif; font-weight: 400; color: #7fe07a; }
.scores li .bank { font-size: 11px; color: #ffe14a; }
.scores li.me .nm { text-decoration: underline; }
.big-banner { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); text-align: center; color: #fff; pointer-events: none; animation: bannerIn 0.35s ease-out; max-width: 92vw; }
.big-banner #bb-title { font: 400 44px "Bungee", sans-serif; text-shadow: 3px 3px 0 var(--ink), -2px -2px 0 var(--ink); line-height: 1.05; }
.big-banner #bb-sub { font: 900 18px "Nunito", sans-serif; text-shadow: 2px 2px 0 var(--ink); margin-top: 6px; }
.big-banner.good #bb-title { color: #ffe14a; }
.big-banner.bad #bb-title { color: #ff6a5a; }
@keyframes bannerIn { from { transform: translateX(-50%) scale(1.6); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
.tally { position: absolute; z-index: 5; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(520px, 92vw); padding: 16px 18px; pointer-events: auto; }
.tally h2 { margin: 0 0 10px; font: 400 24px "Bungee", sans-serif; text-align: center; }
.tally table { width: 100%; border-collapse: collapse; font: 800 15px "Nunito", sans-serif; }
.tally th { font: 400 11px "Bungee", sans-serif; text-align: right; opacity: 0.7; padding: 2px 6px; }
.tally th:first-child, .tally td:first-child { text-align: left; }
.tally td { padding: 5px 6px; text-align: right; border-top: 2px solid rgba(27,20,32,0.15); }
.tally td .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--ink); margin-right: 6px; vertical-align: -1px; }
.tally td.money { font-family: "Bungee", sans-serif; font-weight: 400; color: #2f8f3a; }
.tally td.neg { color: #c0392b; }
.tally tr.winner td { background: rgba(255, 207, 58, 0.35); }
.tally p { margin: 10px 0 0; text-align: center; font-weight: 800; }
@media (prefers-reduced-motion: reduce) { .big-banner, .mh-time.danger, .home-arrow.urgent span { animation: none; } }

/* ---- Phase 3.5: wiped out by a car ---- */
.wipeout { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, rgba(27,20,32,0.1) 30%, rgba(27,20,32,0.65) 100%); color: #fff; pointer-events: none; }
.wipeout .wo-title { font: 400 56px "Bungee", sans-serif; color: #ff5a3c; text-shadow: 3px 3px 0 var(--ink); }
.wipeout #wipeout-sub { font: 900 20px "Nunito", sans-serif; text-shadow: 2px 2px 0 var(--ink); }

/* ---- Phase 4: wanted stars + jail ---- */
.heat-bar { position: relative; }
.heat-bar i { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(27, 20, 32, 0.8); }
.stars { display: flex; gap: 2px; font-size: 20px; line-height: 1; }
.stars b { color: rgba(27, 20, 32, 0.45); -webkit-text-stroke: 1px rgba(255, 255, 255, 0.35); transition: color 0.2s, transform 0.2s; }
.stars b.on { color: #ffcf3a; -webkit-text-stroke: 1.5px var(--ink); transform: scale(1.15); animation: starPulse 1.1s ease-in-out infinite; }
@keyframes starPulse { 50% { color: #ff5a3c; } }
.heat.wanted .heat-label { color: #ffcf3a; }
@media (prefers-reduced-motion: reduce) { .stars b.on { animation: none; } }

.jail { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: repeating-linear-gradient(90deg, rgba(27,20,32,0.72) 0 18px, rgba(27,20,32,0.45) 18px 64px); z-index: 20; pointer-events: none; }
.jail.hidden { display: none; }
.jail-title { font: 400 44px "Bungee", sans-serif; color: #ff5a3c; text-shadow: 3px 3px 0 var(--ink); text-align: center; }
.jail-title span { display: block; font: 900 17px "Nunito", sans-serif; color: #f3e2b8; text-shadow: 2px 2px 0 var(--ink); }
.jail-timer { font: 900 18px "Nunito", sans-serif; color: #fff; text-shadow: 2px 2px 0 var(--ink); }
.jail-timer.urgent { color: #7dff9a; }
.jail canvas { pointer-events: auto; cursor: none; width: min(640px, 92vw); height: auto; border-radius: 18px; box-shadow: 0 8px 0 rgba(27, 20, 32, 0.6); background: rgba(27,20,32,0.5); }
.jail-help { font: 700 15px "Nunito", sans-serif; color: #f3e2b8; text-shadow: 1px 1px 0 var(--ink); text-align: center; max-width: 92vw; }
.jail-help b { color: #ffe14a; }
body.jailed #prompt, body.jailed #charge, body.jailed .crosshair { display: none !important; }

/* ---- Phase 4.5: big-shot tracker ---- */
.bigshot { position: absolute; top: 148px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 12px;
  background: rgba(27, 20, 32, 0.6); border: 2px solid #ffcf3a; color: #fff; font: 900 15px "Nunito", sans-serif; text-shadow: 1px 1px 0 var(--ink); pointer-events: none; }
.bigshot.hidden { display: none; }
.bigshot .bs-cash { font: 400 16px "Bungee", sans-serif; color: #ffcf3a; }
.bigshot .bs-arrow { display: inline-block; color: #ffcf3a; transition: transform 0.1s linear; }
````

## FILE: client/test/spring.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Spring } from "../src/game/spring.ts";

test("spring stays stable and settles at very low frame rates (regression: camera blew up at ~10 FPS)", () => {
  for (const fps of [4, 10, 30, 60, 144]) {
    const s = new Spring(170, 20);
    s.kick(-1.6);
    let maxAbs = 0;
    for (let i = 0; i < fps * 3; i++) { s.update(1 / fps); maxAbs = Math.max(maxAbs, Math.abs(s.value)); }
    assert.ok(Number.isFinite(s.value), `finite at ${fps} fps`);
    assert.ok(maxAbs < 0.2, `dip stays small at ${fps} fps (${maxAbs.toFixed(3)})`);
    assert.ok(Math.abs(s.value) < 1e-3, `settles at ${fps} fps`);
  }
});
````

## FILE: client/tsconfig.json

````json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "../shared/src", "vite.config.ts"]
}
````

## FILE: client/vite.config.ts

````ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  optimizeDeps: { exclude: ["@bfb/shared", "@babylonjs/havok"] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@babylonjs")) return "babylon";
          if (id.includes("@colyseus")) return "net";
        },
      },
    },
  },
});
````

## FILE: client/vite.preview.config.ts

````ts
// Builds the solo-only preview page for the claude.ai viewer:
// - Babylon.js comes from the jsDelivr CDN (window.BABYLON) instead of being bundled
// - networking is stubbed (no server in the preview)
// - result is ONE small JS file that gets inlined into the page
import { defineConfig, type Plugin } from "vite";
import path from "node:path";

const swap = (): Plugin => ({
  name: "bfb-preview-swap",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer) return null;
    if (/(^|\/)babylon\.ts$/.test(source)) return path.resolve(__dirname, "src/game/babylon.global.ts");
    if (/(^|\/)net\.ts$/.test(source)) return path.resolve(__dirname, "src/net.preview.ts");
    return null;
  },
});

export default defineConfig({
  plugins: [swap()],
  define: { "import.meta.env.VITE_PREVIEW_SOLO": JSON.stringify("1") },
  build: {
    outDir: "dist-preview",
    target: "es2022",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
````

## FILE: docs/design-decisions.md

````markdown
# Box Fort Banditz — Design Decisions Log

_Last updated: 2026-09-25 (Phase 1 started)._

## Locked by Blake
- Title: **Box Fort Banditz**. City: **Trashington**.
- **3D** browser game, desktop keyboard + mouse, every player on own device, 2–4 players + solo mode.
- Art: cartoon 3D, thick outlines, bright-but-grimy colors, chunky proportions, expressive animation, scrappy urban comedy. Tense/chaotic like R.E.P.O. / Lethal Company but NOT horror; original identity.
- Characters: cartoon humans in patched-together outfits — mischievous street hustlers, not realistic depictions of homelessness.
- Each player owns their own fort and competes. Co-op still matters in city rounds; betrayal/stealing/chases are the core fun.
- Priorities: 1 Betrayal chaos, 2 Police chases/escapes, 3 Co-op teamwork, 4 Fort-building fantasy, 5 Shop/haggling (short punchy breather).
- Match: ~25–30 min. Scavenge ~3 min, Shop ~1 min, intro, upgrade breaks, escalating events, final 5–7 min = Mayor finale.
- Progression is match-only (no saves between matches). Rags-to-ridiculous-empire arc every match.
- Regular upgrades bought from a simple menu between rounds; fort visibly transforms. AURA POINTS unlock prestige tiers AND cosmetic clothing/accessories/costumes/hats/shoes/fort decorations.
- Win: **Run for Mayor of Trashington** finale. Huge AURA threshold → apply/ceremony → first to complete becomes temporary Mayor → showdown to wreck/shut down rival forts. Mayor powerful but beatable (limited charges, visible cooldowns, counterplay). Wrecked players get a comeback state (emergency box fort, steal, defend). Warning + prep period before finale. Rivals can ally to overthrow Mayor / steal AURA / sabotage powers. Winner = Mayor at final timer, else highest AURA/fort prestige. Election spectacle: fake posters, cardboard podium, gibberish speeches, fake news ticker, closing ceremony. Fictional President of Trashington — no real political figures.
- All destruction/conflict cartoonish, non-graphic (confetti, collapsing cardboard, flying signs, fleeing raccoons).
- Police central: wanted/notoriety, vision cones + line of sight, chase → searching; hide long enough to escape; being seen again resets escape timer; short funny jail; silly jailbreaks by others.
- Monetization: none. No real purchases, ads, or pay-to-win. YES to fake in-world parody ads/billboards/fake premium popups that collapse instantly — clearly fictional, never interrupt play, never ask for money.
- Audio: generated cartoony music loops, gibberish voices, full SFX set, master/music/SFX volume, no loud autoplay before interaction.
- Hosting: build and test locally first; then Cloudflare Pages (site) + Render (server). Free tier OK in dev.

## Tech stack — APPROVED by Blake (2026-09-25)
- Engine: **Babylon.js 9 + TypeScript + Vite**. Toon/cel shading + outline pass.
- Multiplayer: **Colyseus authoritative server**. Anyone can "host" by creating a room on the server. No peer-to-peer for now.
- Gameplay physics: simple shared TypeScript sim (package `shared/`) run on server + predicted on client. Havok on clients only for cosmetic debris, not synced.
- Netcode: client-side prediction + reconciliation for own player (60 Hz fixed step), interpolation for others, 20 Hz server patches.
- Hosting: Cloudflare Pages + Render **Singapore** region. Free tier sleeps after ~15 min idle (~1 min wake-up); paid always-on instance recommended before real friend nights.

## Design decisions made 2026-09-25 (batch 3)
- **Camera: FIRST-PERSON.** Visible cartoon held-item (viewmodel) system, satisfying movement, clear interaction prompts, comfortable + readable in fast chases. Claude plans extra readability aids for police/hiding: detection meter, glowing police eyes/alert icons, screen-edge danger glow.
- **City layout:** each player's fort sits toward the outer edge of Trashington, facing the centre. Centre = high-risk/high-reward: best loot, most police, most conflict → frantic runs home.
- **Mayor finale:** AURA threshold scales with player count; solo mode has a Mayor finale vs 1–3 AI rival forts. Powerful-but-beatable Mayor, visible warning + prep period, temporary anti-Mayor alliances, comeback after fort wreck.
- Phase 0 scope approved: project setup, 3D title screen, Solo/Create/Copy Link/Join, grey-box FP arena with synced capsules, settings (volumes, sensitivity, FOV, reduced motion, screen shake), no autoplay audio, test plan.
- Not yet answered (using Claude defaults, revisit before Phase 1 art work): character art pipeline (default: restyled CC0 rigged low-poly humans, e.g. Quaternius/Kenney), max players (default: hard cap 4).

## Phase 1 decisions (Blake, 2026-09-25)
- Blake tested the solo preview: working, and he likes it so far.
- Movement feel: **weighty & a bit clumsy** (R.E.P.O./Lethal Company-style momentum; heavier when carrying loot later; stumbles are funny).
- **Visible stamina** for sprinting (short bursts, fast recovery, "winded" when emptied).
- Moves: **crouch/sneak, belly slide, mantle/climb ledges, dodge/dive**.
- First-person hands: **chunky cartoon fingerless gloves in the player's colour**, patched and taped.

## Phase 2 decisions (Blake, 2026-09-25)
- Blake loves Phase 1. Change: first-person hands become **simple white hand wraps** (bare cartoon hands, no gloves).
- Carrying: **hands + small pockets**. Big items held in both hands (slow you down, heavy ones block sprint/dodge, hands full blocks climbing); small items go in **3 pocket slots**; **giant items need 2 players** (one player can only drag them slowly).
- Loot value: **rarity glow + price on look** (grey/green/blue/purple/gold; exact price tag when you look at it; mystery items show ???).
- Controls: **E grab/pocket, G drop, hold left mouse to charge a throw, right mouse cycles pockets**.
- City: **compact ~120 m square** Trashington block; 4 forts at the edges facing a busy centre plaza; alleys, rooftops, a few enterable shops.
- Architecture (Claude, explained to Blake): game rules move into a shared `World` simulation used by BOTH the server and solo mode, so solo and multiplayer always behave the same.

## Phase 2.5 decisions: pedestrians (Blake, 2026-09-25)
- **Sky beams removed** (Blake isn't a fan). Replaced by **rarity outline + small twinkling sparkle** on rare-and-up items (visible ~25 m).
- **Punchable pedestrians**, slapstick BONK style (cartoon swing, spin + stars, loot pops out, they get up grumpy). No blood. Parody brands only ("Rolecks", not Rolex). Claude recommendation accepted implicitly: adult cartoon types only; no kids/elderly/vulnerable targets.
- **All 8 types**: Tourist, Businessman, Influencer, Jogger (mostly flee), Gym Bro + Off-duty Mall Cop (fighters), Mime (fights back silently) + Pigeon Lady (summons pigeons).
- **Fight back = chase + slap fight, no mini-game**: exchange punches in first person, whoever lands 2 hits first wins. Lose -> knocked down, drop loot. Win -> fighter KO'd, drops bonus loot.
- **NPC loot value: low but funny** (half sandwich, lint, coupons...) with occasional surprises (e.g. Rolecks watch).
- **Consequences: track notoriety now**, police read it in Phase 4. Bystanders scream + flee now.
- **PvP punch = full knockdown** (~1.5 s, drop everything). Claude adds anti-grief: 3 s immunity after getting up, diminishing knockdown time on repeat victims, longer attacker cooldown after a PvP knockdown.
- **Punch key: left click when hands are empty**; holding something = left click charges a throw (F still throws, incl. pocket items).
- **Crowds: packed, ~35 pedestrians** (Claude flagged performance risk on older laptops; mitigations: distance culling + lightweight models).
- **Thrown items bonk pedestrians and they drop loot.**
- Built as **Phase 2.5, right now**, before the round loop (Phase 3).

## Phase 3 decisions (Blake, 2026-09-25)
- Blake: pedestrians "really cool". Changes: **fewer (15-20 -> 18)** and **more realistic movement** (done: eased speed, smooth turns, curved corners, side-of-pavement lanes, individual walking pace, glance around when idle, step aside for players, stride-matched walk animation).
- Pockets: Blake didn't know G drops the active item; he's happy with G (no new key).
- **Banking: loot locks in 10 s after it's put down in your fort yard.** Before that anyone can steal it back (dropping it again restarts the 10 s).
- **Time's up: anything you're carrying outside your own fort is LOST** (frantic run home). Loot lying in your yard (locked or not) is cashed in.
- **Events (all four):** airdrop crate (giant, legendary, parachutes into the plaza, needs 2), garbage truck (drives a ring-road side, hoovers loose loot, flattens bandits, warns 5 s ahead), happy hour (30 s, one zone's loot worth double; grab it in time to keep the bonus), raccoon heist (one raccoon per fort steals the most valuable loot, even banked; bonk it to get it back, no heat for that).
- Claude defaults (tell Blake): 3 rounds x 3 min, 5 s intro, 12 s results between rounds; events escalate 1 / 2 / 3 per round, never the same one twice in a round; host starts with ENTER (or pause menu); solo starts with ENTER. Score = cash; winner = most cash ("TOP BANDIT") until the Mayor finale and shop phases exist.

## Phase 3.5 decisions: city overhaul (Blake, 2026-09-26)
- Blake: the map needs more of a city feel (bigger high-rises), cars you can get hit by, shops with interiors and a cashier to rob, more ways to get loot (dumpsters, punching phone booths...), stamina runs out too fast. Tone: "a homeless bum terrorizing the city" (kept cartoonish: slapstick, parody brands, no gore).
- **Map ~200 m, dense** (3x the area): two square ring roads (inner around the plaza, outer around downtown) with two-way traffic, connector streets with parked cars, downtown high-rises 26-46 m, 4 walk-in shops, forts on the outer edge (you cross the outer ring road to get home).
- **Car hit = wiped out**: cartoon pancake, everything you carried spills on the road, respawn at your fort after 10 s. Cars honk but never stop for bandits (they do stop for pedestrians at crosswalks).
- **Robbing shops: both** ways: HOLD R at the till for 3 s (cash bundle, alarm, big heat), or grab (E) the whole cash register (heavy, worth more, alarm). Shelf stock can be swiped; the cashier yells if they see it (heat). Punching the cashier drops their float + alarm.
- **Loot sources: all four**: dumpsters + bins (E: search, random junk, sometimes a raccoon jumps out), smash-and-grab props (phone booths, vending machines, parking meters, newspaper boxes), shop shelves, parked cars (smash the window, car alarm). Everything refills over time (parked cars once per round).
- **Stamina**: ~8 s of sprint (was ~3.5 s), refills in ~2 s.
- Claude defaults: 20 pedestrians (top of Blake's 15-20 now the city is bigger) + 4 cashiers; 14 moving cars; hold-up key is R (E would have grabbed the register instead); a "Performance mode" setting (no shadows, lower resolution) for older laptops.

## Phase 4 decisions: police + jail (Blake, 2026-09-26)
- **Police station** in the SE corner (replaced the park): lobby with a front desk, four barred cells along the back (one per player, visible from the lobby), a back alley, two parked cruisers out front.
- **Busted = 30 s in a cell**, with a **lock-picking minigame** to break out early. Blake: "a lock picking game but make it relatively hard so it feels like time is running out", "different every time".
- **Busted = you lose what you carry** (confiscated, gone for good). Heat resets.
- **Low heat = foot cops only; max heat = cop cars too.**
- **Release**: serve the 30 s = out the front door with 0 heat; pick the lock = out the back alley, still wanted (1 star, and the cops know where you went).
- Claude defaults (tell Blake, easy to tune):
  - stars at 30 / 60 / 90 heat; 1 star = 1 foot cop, 2 = 2, 3 = 3 + a cop car that drops off 2 more; a cop car running you over = busted.
  - Cops run 6.1 m/s (you walk 5.0, sprint 7.8): you can outrun them while stamina lasts, then you need to break line of sight.
  - Cops need line of sight (buildings, alleys; crouching behind a parked car hides you). Heat doesn't cool for 4 s after a crime or a sighting; then slowly while cops are on their way to where you were reported (0.6/s) or when you're not wanted (1/s), fast once they've lost you (3/s). Cops go to the crime scene / last sighting, not to where you are hiding. A crime a cop sees adds +5 and they come running.
  - Grab: FREEZE! (0.4 s telegraph), a dodge (Q) at the right moment slips it; knocked-down players get cuffed fast (so punching a friend near the cops is betrayal).
  - Punching a cop: +15 heat, they stagger; 3 punches = down for 5 s (drops an Evidence Donut).
  - Lock: 4-6 pins, each with its own rhythm (smooth / rush / wobble / dash), its own green band, and a random binding order (only the "stuck" pin can be set; it trembles when you select it). Wrong pin or bad timing = a slip (last pin drops + noise); 3 quick slips = the guard shouts, all pins drop, 4 s lockout; once the first pin is set a tension timer (12-17 s) starts. Simulated players: a sharp player breaks out ~70% of the time in ~17 s, a casual one ~15-40%.
  - Traffic stops for cop cars (sirens have right of way).

## Phase 4.5 decisions: tuning + big shots (Blake, 2026-09-26)
- **Police: light nerf.** Still 1 / 2 / 3 cops for 1 / 2 / 3 stars, but slower (5.6 m/s, was 6.1), shorter sight (24 m, was 30), slower grab (0.55 s wind-up, was 0.4), give up sooner (6 s search, was 9), heat cools faster once they've lost you (4/s, was 3), a new cop every 4 s (was 2.5), the cop car drops off 1 cop (was 2), max 6 foot cops in town (was 8).
- **Lock picking "didn't register"**: two causes found. (1) A person clicking when they SEE the pin in the green is ~70 ms late, and the windows are ~60-150 ms long: simulated late clickers solved only 1-6% of locks. Now a press counts if the pin was in the green in the last 0.09 s. (2) Clicks went to the pin selected with A/D, not the one under your mouse. Now the mouse moves an on-screen pick: click a pin to select it, click again (or SPACE) to set it. Bands slightly narrower and tension slightly shorter so it stays hard (simulated human-like players: ~60% break out if decent, ~40% casual, in ~16-18 s). The stuck pin now says STUCK! when selected.
- **Camera swinging after jail**: the mouse still turned the camera while you were aiming at the lock-picking screen. In jail the camera now holds still facing the bars and the mouse drives the pick; on release you face the way out.
- **Big shots (all four)**: one at a time in town, first after ~35 s, then every 45-75 s after the last one leaves (they stay ~2 min). Announced with a banner, a floating gold $$$ (visible from 130 m), and a HUD tracker (name, distance, arrow).
  - Millionaire (top hat, monocle, cane) + a bodyguard who fights you: gold bar ($160-260) or diamond ring ($140-300); +30 heat.
  - Armored cash courier: armored (2 hits, fights back), drops the Bank Money Bag ($250-400, big + heavy); ~70 heat = instantly 2 stars.
  - Celebrity + 2 superfans who film it (+8 heat each): Golden Award ($120-220); +30 heat (+16 fans).
  - Crypto bro: Crypto Wallet (mystery, $0-500); +20 heat.

## Core match loop (Blake, 2026-09-26) — drives Phase 5+
- **Scavenge -> Bonus scavenge (~1 min) -> Shop round -> Upgrades round -> repeat**, until a player has enough **AURA** to enter the **Mayor round**.
- AURA must be **really hard** to obtain; other players can **contest** the would-be Mayor.
- **Bonus scavenge** (Blake): comes right after the 3-minute scavenge; **resets the arena** (fresh city), **police are twice as hard**, and **loot is scarce**. ~1 minute.
- **Bonus scavenge is a NIGHT round** (Blake): dark sky, lights everywhere, street lamps glowing, lit windows.
- Replaces the Phase 3 placeholder of "3 fixed rounds, then results". Open questions for Phase 5: what makes the bonus scavenge different, how AURA is earned, how contesting works.

## Build status
- Code lives in the cloud session workspace (`box-fort-banditz/`, git commit 83c4543) and as `box-fort-banditz-phase0.zip` sent to Blake. Full source snapshot: `claude/code-snapshot.md` in this project (latest: Phase 2.5).
- Versions: Babylon.js 9.28, Colyseus 0.18 (server) / @colyseus/sdk 0.18, @colyseus/schema 5, Vite 8, TypeScript 5.9, Node 22.
- Network note: the sandbox's direct route to registry.npmjs.org is stale; run npm with `NO_PROXY=localhost,127.0.0.1` so it goes through the approved proxy.
- **Phase 0 DONE (2026-09-25)**: title screen, solo/create/join/copy-link flow, invite links, FP grey-box arena, server-authoritative movement with client prediction, reconnection, settings, generated audio. 14 unit + smoke + 39 browser checks passing (also at 110 ms lag). Solo preview artifact: https://claude.ai/artifact/TMpUm13DgANDtWcgixrZBx
- Known Phase 0 limitations: placeholder capsule characters; no held-item viewmodel yet; screen-shake setting stored but unused; brief shader-compile hitch on entering the arena; player name tags currently show through walls (must change before hiding/stealth in Phase 4); preview page (v2) loads Babylon from jsDelivr + inlines game code; verified in a sandboxed/CSP harness but confirmed working by Blake.
- **Phase 1 DONE (2026-09-25)**: weighty movement, stamina (+HUD), crouch (C), belly slide (sprint+C), dodge (Q), mantle (SPACE facing ledge), stumble; gloved viewmodel hands with pose-based animation; camera crouch height, FOV kick, roll, landing dip, screen shake (setting respected, off with reduced motion); remote players show poses with mitten arms; generated sfx (footsteps x3, slide, dodge, climb grunt, winded, stumble); shader pre-warm (no entry freeze). 25 unit + 1 client unit + smoke + 55 browser checks passing.
- Controls note: crouch is C, not Ctrl (Ctrl+W closes the browser tab and can't be blocked).
- Bugs fixed in Phase 1: camera/hand springs exploded at low FPS (now sub-stepped + NaN guard); hands too large; slide label blocking spawn view.
- Known Phase 1 limitations: hands + characters still placeholder shapes; no key rebinding yet; name tags still show through walls.
- **Phase 2 DONE (2026-09-25)**: shared World simulation (server + solo run identical rules); ~120 m Trashington city (plaza, 4 blocks with alleys, 2 walk-in shops, climbable low roofs via dumpsters, 4 fort lots, construction yard / junkyard / parking / park corners, parody billboards); 15 loot items with rarity outlines + sky beams for rare+; grab/pocket/drop/charge-throw; giant two-person carry; grab races; bonks; impact sounds per material; dust puffs; white hand wraps; remote carry poses; whole-city shader pre-warm. 43 unit + 1 client + smoke + 79 browser checks passing (also at 110 ms lag).
- Bugs fixed in Phase 2: dumpsters were mid-alley (climb gap) -> moved against walls; item highlight/outline covered thin decals (TV screen); shader-compile hitch when new things came into view (pre-warm from above); host START button disappeared after loading; mouse buttons ignored (Babylon cancels pointerdown -> use pointer events); giant items drawn twice for the carrier; stale test server + cleanup issues in the test script.
- Known Phase 2 limitations: items don't collide with each other (they can overlap); thrown items only shove (stuns + stealing from hands = Phase 4); held big items cover part of the view (by design, ask Blake); sounds are not truly 3D (volume by distance only); name tags still show through walls; mystery item values stay hidden until selling exists (Phase 5).
- Next: Phase 3 (scavenge/shop round loop, timers, city events, base return, basic NPC chase) awaiting Blake's feedback.
- **Phase 2.5 DONE (2026-09-25)**: 35 pedestrians of 8 types walking a route map around the city (shared sim, synced online, culled beyond 45 m, body parts merged per limb for speed); punch = left click with empty hands (jab animation, BONK/POW/K.O. pop text, whoosh + bonk sounds); pedestrians drop funny low-value loot once (13 new pocket items incl. the Rolecks watch); thrown items bonk them too; jogger dodges, mime traps you in an invisible box, pigeon lady's swarm slows you (dodge shakes them), tourist camera flash, influencer films, bystanders scream + flee; gym bro / mall cop / mime chase and slap (2 hits first wins; lose = knocked down, win = KO + bonus loot; they gloat or huff); PvP punch = full knockdown with immunity + diminishing repeats; heat (notoriety) tracked + HUD meter for the police later; knocked-down camera (lying on your back) + daze vignette; sky beams replaced by rarity sparkles (<= 25 m). Key presses during the 0.18 s action cooldown are now queued instead of lost.
- Bugs fixed in Phase 2.5: a fighter's gloat was instantly overwritten by "chase" (then "huff"); G pressed right after E was silently dropped (now queued); test-only: the mouse moving onto the crosshair turned the view before a punch.
- Known Phase 2.5 limitations: pedestrians walk through players (they only avoid each other and walls); speech lines are text bubbles + gibberish (no voice acting); pedestrians don't pick loot back up; heat does nothing yet (police = Phase 4); lots of people on screen is the heaviest thing the client draws, so Blake should check FPS on his machine.
- **Phase 3 DONE (2026-09-25)**: round loop (lobby -> intro -> 3 x 3-min scavenge -> results -> final results -> play again), fort yards (painted outline), 10 s banking with countdown/BANKED tags, loss of carried loot away from home at time-up, live scoreboard (cash + banked), round timer + 30 s warning + last-10 s ticks, home compass, results/final cards, four city events (airdrop crate + parachute + red target, garbage truck, happy hour gold ring + x2 tags, raccoon heist), pedestrians cut to 18 with natural movement.
- Bugs fixed in Phase 3: raccoons got stuck behind the fort box (now path around it); grab + drop in the same instant didn't restart the 10 s bank timer; test flakes on a crowded test machine (effect/timer checks).
- Known Phase 3 limitations: no shop or upgrades yet (cash only scores); rounds are fixed at 3 x 3 min (easy to tune); banked loot just sits in the yard (forts don't visibly grow until the fort phase); the truck drives through parked vans; happy hour zones on the four blocks include rooftops/buildings.
- **Phase 3.5 DONE (2026-09-26)**: 200 m Trashington (roads, crosswalks, lane paint, street lights, high-rises with rooftop clutter, 4 themed shops: Corner Mart, Pawn-O-Rama, Bagel Barn, Gizmo Garage, with shelves, fridges, counters, posters, neon, awnings), traffic (14 cars, lanes, corners, queueing, braking for pedestrians/the truck, honking), wipeouts + 10 s respawn, 106 interactable props, cashiers, hold-ups, register theft, shoplifting, car alarms, 18 new loot items with models, pedestrians only cross at crosswalks, longer stamina, performance mode, collision broadphase (server tick ~5x faster).
- Bugs fixed in Phase 3.5: the old small-city coordinates in tests; hold-up and register grab both on E (moved hold-up to R); busy browsers could be dropped by the server after ~6 s (now ~20 s) and a stale reconnect token after an automatic reconnect made refresh-rejoin create a new seat (token now kept fresh).
- Known Phase 3.5 limitations: buildings (except shops) aren't enterable; cars only queue behind cars in their own lane, so two lanes can overlap briefly at ring corners; garbage truck drives through parked cars; heat still does nothing until police (Phase 4); the bigger city is heavier to draw, so older laptops should try Performance mode.
- **Phase 4 DONE (2026-09-26)**: police station + 4 cells, wanted stars (HUD), dispatch of foot cops (out of sight, to the crime scene), line-of-sight hunting (patrol / chase / search / give up), FREEZE grab with dodge counterplay, punchable cops, 3-star cop cars on a road network (sirens, flashing light bars, drop off 2 cops, run-over bust, traffic yields), busted = confiscation + 30 s jail, lock-picking minigame (random every time, server replays the presses), jailbreak to the back alley, time served out the front. Tests: 101 shared unit (incl. 15 police) + 1 client + smoke + 169 browser checks passing (also online at 110 ms lag). Plus Blake's 3 bug reports: skyscraper windows flickering (z-fighting with the outline pass), camera flipping upside down (knockdown lean added on top of looking up), pedestrians stuck on parked cars (feeler-based obstacle avoidance).
- **Phase 4.5 DONE (2026-09-26)**: light police nerf, lock-picking fix (grace window + mouse-driven pick + clearer STUCK pin), camera holds still in jail, 4 big shots with entourages, $$$ markers, HUD tracker, 5 jackpot items (+ the missing donut model). Also fixed while testing: the server was running the lock's tension/noise timers on ITS clock, so a laggy or slow client could have its pins dropped by the server (now only the player's press times count; the lock clock is synced); pressing E on a slow frame could send an item you'd already pocketed (false "Too slow!"). Tests: 108 shared unit + 1 client + smoke + 175 browser checks (also 175/175 at 110 ms lag).
- Known Phase 4 limitations: cops only chase on foot or in the car (no roadblocks / helicopters); friends can't break you out yet; the lock-picking game is client-timed (the server checks the presses make sense and can't be from the future, but a determined cheater could script it); cops can't climb onto roofs (standing on a low roof keeps them below you, they'll wait and search).
````

## FILE: docs/test-plan.md

````markdown
# Box Fort Banditz — Test Plan

Every phase adds to this plan. Nothing is reported as working unless one of these checks (or a manual check listed below) has actually passed.

## Layers

1. **Unit tests** (`npm test`, no browser): the shared game rules. Fast, exact, run on every change.
2. **Server smoke test** (`tests/server-smoke.ts`): two headless clients talk to a real server. No rendering.
3. **Browser end-to-end** (`scripts-run-e2e.sh`): up to 5 real headless Chrome windows, real server, real 3D rendering (software GPU), screenshots for visual review. Also run with `LATENCY=110` to simulate Australia → Singapore ping.
4. **Manual play checks** by Blake on real hardware (feel, fun, performance), with the checklist below.

Note on the automated browser test: it renders 3D on the CPU, so it runs at single-digit FPS with several windows open. Distance checks therefore compare movement against the number of simulation steps actually run, not wall-clock time. Frame rate and feel must be judged on a real machine.

## Phase 0 checks

| Area | Check | How | Result (2026-09-25) |
|---|---|---|---|
| Movement rules | walk/sprint speed exact, diagonal not faster, backwards slower | unit | pass |
| | walls block and let you slide along them | unit | pass |
| | curbs stepped up automatically; tall crates block | unit | pass |
| | jump arc; holding jump doesn't bunny-hop; land on crate, walk off | unit | pass |
| | identical inputs → identical result (needed for multiplayer prediction) | unit | pass |
| | bad input from a client is clamped or rejected | unit | pass |
| Rooms | 5-character codes without look-alike characters | unit + smoke | pass |
| | create, join by code, names cleaned, distinct colours | smoke + e2e | pass |
| | server rate-limits speed-hack input bursts | smoke | pass |
| | only host can start; host leaving hands host to someone else | smoke + e2e | pass |
| | 5th player gets a friendly "room is full" message | e2e | pass |
| | wrong code gets a friendly "room doesn't exist" message | e2e | pass |
| Share link | Create Room puts `?room=CODE` in the address bar; Copy Link button | e2e | pass |
| | opening the link shows an invite card with name field → joins | e2e | pass |
| Sync | 3 windows each see all 3 players | e2e | pass |
| | other windows see your exact server position | e2e (+110 ms lag) | pass |
| | your own movement needed zero corrections from the server | e2e (+110 ms lag) | pass |
| Disconnects | dropped connection: seat held, shown as "reconnecting", auto-rejoins same seat | e2e | pass |
| | refreshing the tab rejoins the same seat (no ghost duplicate) | e2e | pass |
| | a vanished player's seat is held 30 s, then removed; match keeps running | `tests/drop-timeout.ts` | pass |
| Solo | playable with no server | e2e | pass |
| UI | pause on ESC, leave to title, settings saved across reload | e2e | pass |
| Audio | no AudioContext before the first click; created on first click | e2e | pass |
| Visual | title, arena, lobby, pause, settings screenshots reviewed | screenshots | pass after fixes (see report) |
| Console | no JavaScript errors in any window | e2e | pass |

## Phase 1 checks (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Momentum | stopping from a sprint skids briefly (weighty) | unit | pass |
| Stamina | ~3.5 s of sprint, winded = walk pace after a short coast-down, full refill at rest | unit | pass |
| | bar appears while draining; stamina syncs to other players | e2e + smoke | pass |
| Crouch | slower + shorter; fits under the crawl tunnel; can't stand or jump under a roof | unit + e2e | pass |
| | other players see you crouch | smoke + e2e | pass |
| Slide | sprint + C = fast slide that slows, ends crouched, cooldown; walking too slow to slide | unit + e2e | pass |
| | jumping out of a slide keeps momentum | unit | pass |
| Dodge | Q = hop-dash in move direction (forward if none), costs stamina, cooldown pip | unit + e2e | pass |
| Mantle | climbs 0.9 / 1.4 / 1.95 m ledges; refuses 3 m walls and ledges with no room on top | unit + e2e | pass |
| Stumble | 4 m drop = comedy stumble; normal jump doesn't | unit | pass |
| Robustness | 18,000 random inputs across 20 runs: never inside a box, never NaN | unit (fuzz) | pass |
| | repeatability with every move mixed in (needed for multiplayer prediction) | unit | pass |
| Camera | stays valid after slide, climb, crouch at 3–11 FPS (regression for spring blow-up) | unit + e2e | pass |
| Preview | real C key crouches, W walks, drag-to-look turns in a sandboxed, no-pointer-lock frame | harness | pass |

## Phase 2 checks (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Catalog | 15 items, all 3 sizes and all 5 rarities, sane values | unit | pass |
| City | loot + player spawns never inside walls; every spawn settles in-bounds | unit | pass |
| | every dumpster sits against a low roof and you can climb dumpster -> roof | unit | pass |
| Grab | big items -> hands, slow you; heavy blocks sprint; small -> 3 pockets then hands | unit + e2e | pass |
| | too far / behind you = whiff | unit | pass |
| | grab race: same tick, exactly one winner, loser whiffs and their instant guess is undone | unit + e2e (online) | pass |
| Drop / throw | G drops in front and it lands; charge controls distance; pocket items throwable | unit + e2e | pass |
| | thrown items bonk other players (shove + event), never the thrower | unit | pass |
| Giant | drag alone x0.3; two carriers x0.65; pulling apart = tumble; can't throw; one lets go = other drags | unit + e2e | pass |
| Disconnect | leaving/dropping drops all loot so it's stealable | unit | pass |
| Robustness | 120 random throws around the city: no item inside walls or out of bounds | unit (fuzz) | pass |
| | spawner never exceeds the 60-item cap; rare loot favours the plaza | unit | pass |
| | whole world deterministic for same seed + inputs | unit | pass |
| Sync | loot synced to clients; far grab = whiff event; B sees the TV in A's hands | smoke + e2e | pass |
| HUD | look prompt shows name, $price, rarity, tags; pockets bar; charge ring | e2e + screenshots | pass |
| Perf | server tick worst case 0.1 ms (budget 16.7 ms) with 4 players + all items bouncing | benchmark | pass |
| | no mesh/material/memory growth over time; render ~5-12 ms/frame (software GPU) | profile | pass |
| Preview | sandboxed frame: loads, W walks, C crouches, drag-to-look turns | harness | pass |

## Phase 2.5 checks: pedestrians + punching (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Route map | pedestrians' walk network covers the city, stays out of walls, is one connected piece | unit | pass |
| Crowd | 35 pedestrians, all 8 types; 2 minutes of wandering: never inside walls, never stuck, never NaN | unit + e2e | pass |
| Punch | left click with empty hands punches whoever is in front (pedestrian or player); too far / behind = miss | unit + e2e | pass |
| | holding something: left click still charges a throw; F throws (incl. pocket items) | e2e | pass |
| | prompt "[CLICK] Bonk Tourist", fighters say "FIGHTS BACK" | e2e | pass |
| Loot | a bonked pedestrian drops their item once (pops out, grabbable); thrown items bonk them too | unit + e2e | pass |
| Types | jogger sometimes sidesteps; mime traps you in an invisible box; pigeon lady's pigeons slow you (dodge shakes them); tourist camera flash; influencer films (extra heat) | unit | pass |
| Fighters | gym bro / mall cop / mime chase and telegraph a slap; 2 hits first wins; lose = knocked down + drop everything; win = KO + bonus loot | unit + e2e | pass |
| | fighter gloats after knocking you down (regression: was overwritten by "chase") | unit + e2e | pass |
| | stop chasing when you're down, too far, or after 8 s | unit | pass |
| PvP | punching a player = full knockdown; everyone sees them lying down; 3 s immunity after; repeat knockdowns get shorter | unit + e2e (online) | pass |
| Heat | punching raises your notoriety; mall cop + filming raise it more; it cools down; HUD meter | unit + e2e | pass |
| Input | a key pressed during the 0.18 s action cooldown is queued, not lost (G right after E) | unit + e2e | pass |
| Sync | all 35 pedestrians synced to online players (only changed values sent) | smoke + e2e (also at 110 ms lag) | pass |
| Visual | sky beams gone; rare+ loot twinkles (within 25 m); BONK/POW/K.O. pop text; knocked-down view; camera flash; pigeon swarm | e2e + screenshots | pass |
| Perf | server tick average 0.16 ms, worst 5.7 ms (budget 16.7 ms): 4 players running + punching, 35 pedestrians, 41 items, 2 min | benchmark | pass |
| | Phase 3: live match (intro + full round + tally, 4 players punching, events firing, 18 pedestrians): average 0.10 ms, worst 8.4 ms | benchmark | pass |
| | client: pedestrian body parts merged per limb (~9 meshes each, was ~25); culled beyond 45 m | profile | pass |

## Phase 3 checks: round loop + events (2026-09-25)

| Area | Check | How | Result |
|---|---|---|---|
| Crowd | 18 pedestrians; eased speed + max turn rate while walking (no instant snaps); they step around a standing player | unit | pass |
| Forts | each yard contains its pad, no loot spawns inside a yard, back alley is outside | unit | pass |
| Flow | lobby -> intro 5 s -> scavenge 3 min (30 s warning) -> tally 12 s -> x3 -> over; START again resets cash | unit + e2e (solo) | pass |
| | host START reaches everyone; round timer the same on every screen | smoke + e2e (online) | pass |
| Banking | loot in YOUR yard locks after 10 s (countdown tag, then BANKED); locked loot can't be grabbed; a rival can steal before it locks and the 10 s restarts | unit + e2e | pass |
| | loot in an empty fort's yard doesn't bank | unit | pass |
| Time's up | carried loot away from home is lost (event + results); carried loot at home and all yard loot is cashed; results sorted by cash | unit + e2e | pass |
| Airdrop | giant legendary crate floats down slowly under a parachute into the plaza | unit + e2e | pass |
| Truck | 5 s warning, drives a ring-road side, sweeps loose loot, flattens players in its path, never touches banked loot or loot off the road | unit + e2e | pass |
| Happy hour | loot in the zone doubles; picked up in time keeps x2; left lying reverts | unit + e2e | pass |
| Raccoons | steals the most valuable loot from a fort (even banked); escapes = item gone + counted in results; bonking it drops the item, no heat | unit + e2e | pass |
| Escalation | 1 / 2 / 3 events in rounds 1 / 2 / 3, never the same one twice in a round | unit | pass |
| HUD | timer, scoreboard with banked value, event bar, home compass, results + final cards, banners | e2e + screenshots | pass |

## Phase 3.5 checks: the big city (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Stamina | ~8 s of sprint before winded | unit | pass |
| City | 200 m; 8+ high-rises (some 35 m+); 4 shops with cashier + stocked shelves; every kind of loot source exists | unit | pass |
| | nothing walkable-only (loot spawns, fort pads, props) sits in a road; lanes run on asphalt; landmarks are clear | unit | pass |
| | pedestrians only cross roads at crosswalks | unit | pass |
| | collision broadphase never misses a box and keeps the original order (prediction stays in sync) | unit (2000 random probes) | pass |
| Search | E on a dumpster/bin: 1-3 items, then empty until it refills; too far = nothing | unit + e2e | pass |
| Smash | punch phone booth (handset), vending (snacks), meter (change), newsbox (paper), parked car (seat loot + alarm); heat goes up; broken for a while | unit + e2e | pass |
| Robbery | HOLD R 3 s at a till: cash bundle, cashier cowers, alarm, heat; letting go / walking away cancels | unit + e2e | pass |
| | grab the whole register: alarm + big heat; swiping shelf stock in view of the cashier: yell + heat; punching the cashier: cash once + alarm | unit | pass |
| Traffic | 14 cars stay on the road, keep their distance, stop for a pedestrian in the lane, honk at bandits | unit + e2e | pass |
| Wipeout | hit by a moving car: loot spills, 10 s countdown overlay, respawn at your fort with brief immunity | unit + e2e | pass |
| Sync | cars + props (and their empty/alarm state) synced to online players | smoke | pass |
| Network | refresh-rejoin keeps your seat even after an automatic reconnect; slow browsers get ~20 s before being dropped | e2e | pass |
| Perf | server tick average ~0.17 ms (was 0.9 ms before the broadphase) with 4 players, 24 NPCs, 14 cars, ~90 items | benchmark | pass |

## Phase 4 checks: police + jail + Blake's bug fixes (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Stars | 30 / 60 / 90 heat = 1 / 2 / 3 stars, shown on the HUD | unit + e2e | pass |
| Dispatch | 1 star = 1 cop, 2 = 2, 3 = 3 + a cop car; cops appear 22-42 m away, out of sight | unit + e2e | pass |
| Arrest | stand still with a star: a cop walks up, shouts, busts you; loot confiscated (gone), heat 0, you're in a cell | unit + e2e | pass |
| Jail | can't walk out of the cell, can't act, nobody can punch you through the bars; serve 30 s = out the front door with 0 heat | unit + e2e | pass |
| Lock | every lock differs (4-6 pins, 4 rhythms, random binding order), same seed = same lock, perfect play always opens it in time; slips drop a pin, 3 quick slips = guard lockout, tension runs out | unit (300 locks) | pass |
| Break-out | picking the lock through the real keys: out the back alley with 1 star; presses "from the future" are rejected; works online (server replays the presses) | unit + e2e (solo + online) | pass |
| Hiding | buildings block the view, crouching behind a parked car hides you; slip away from the crime scene: cops search there, heat cools, they give up and leave | unit | pass |
| Cops | faster than walking, slower than sprinting; a well-timed dodge slips the grab; 3 punches = KO + donut | unit | pass |
| Cop car | stays on the roads, pulls up, drops off 2 cops; running a wanted bandit over = busted; traffic stops for it | unit + e2e | pass |
| Bug: windows | tower windows no longer flicker (windows 0.22 m off the wall + depth bias; signs in front of windows) | screenshots while moving | pass |
| Bug: camera | looking straight up and getting knocked over never tips the camera past vertical | e2e | pass |
| Totals | 101 shared unit (incl. 15 police) + 1 client + server smoke + 169 browser checks; the browser run also passes at 110 ms lag (167/168 there, the one miss was a test-timing flake since fixed) | all | pass |
| Bug: parked cars | a chaser gets round a parked car to reach you; nobody ends up inside a car; cars shove people without pushing them into walls | unit | pass |
| Perf | server tick average ~0.3 ms with 4 players at max heat (11 cops, 2 cruisers) | benchmark | pass |

## Phase 4.5 checks: tuning + big shots (2026-09-26)

| Area | Check | How | Result |
|---|---|---|---|
| Police nerf | still 1/2/3 cops per star (the car's cop counts at 3 stars), slower than before but faster than walking; all Phase 4 police checks still pass | unit + e2e | pass |
| Lock | a press counts if the pin was in the green during the last 0.09 s; simulated players with human reaction lag: ~60% (decent) / ~40% (casual) break out | unit + simulation | pass |
| Jail controls | the mouse moves the pick, the camera doesn't turn; clicking a pin selects it | e2e | pass |
| Big shots | 4 kinds, each worth $200+; one at a time; announced; arrive out of sight; leave after ~2 min; a new one comes later | unit | pass |
| | millionaire: jackpot + ~30 heat, bodyguard attacks; courier: armor (2 hits) then the money bag + 2 stars; celebrity: trophy + fans film (more heat); crypto bro: $0-500 mystery wallet; the entourage keeps up | unit | pass |
| | HUD tracker, JACKPOT prompt, punch in the browser drops the jackpot | e2e | pass |
| Lock sync | a laggy client (lock clock 15 s behind the server) still breaks out: the server only uses the player's press times | unit | pass |
| Grab | pressing E always uses a fresh look target (a slow frame could send an item you already pocketed -> false "Too slow!") | e2e | pass |
| Totals | 108 shared unit + 1 client + server smoke + 175 browser checks; also 175/175 at 110 ms lag | all | pass |

## Manual checklist for Blake (Phase 4.5)

- [ ] Police: better now? Still too many?
- [ ] Lock picking: do your clicks register now? Is it still hard enough?
- [ ] Camera after jail: still swinging?
- [ ] Big shots: worth the heat? Which one is the most fun?

## Manual checklist for Blake (Phase 4)

- [ ] Do the windows still flicker anywhere? Does the camera ever flip now? Any pedestrian still stuck on a car?
- [ ] Heat: do the stars go up at the right pace? Too many cops, too few?
- [ ] Can you shake the cops by breaking line of sight? Does it feel fair?
- [ ] The lock-picking game: too hard, too easy, fun? (I aimed for "you usually make it with a few seconds left if you're good".)
- [ ] 3 stars: is the cop car scary? Did it ever get stuck?

## Manual checklist for Blake (Phase 3.5)

- [ ] Does it feel like a city now? Too big / too small?
- [ ] Traffic: too many cars, too few? Are wipeouts funny or frustrating?
- [ ] Robbing: is HOLD R at the till + E to grab the register clear?
- [ ] Dumpsters / smashing: is the loot fun? Too much, too little?
- [ ] Stamina: better now?
- [ ] FPS on your computer (Settings > Show FPS). If it's low, try Performance mode and tell me the difference.

## Manual checklist for Blake (Phase 3)

- [ ] Is 3 minutes per round right? Is 3 rounds right?
- [ ] Is the 10 s bank lock too short / too long for stealing to be fun?
- [ ] The run home at the end: tense and fun, or just stressful?
- [ ] Events: which is the most fun? Too frequent? Truck too brutal?
- [ ] Pedestrians: do they move more naturally now? Is 18 the right amount?

## Manual checklist for Blake (Phase 2.5)

- [ ] Sparkles instead of beams: can you still spot the good loot when you're close?
- [ ] Punching: does the jab + BONK feel satisfying? Is the reach right?
- [ ] Fighters: is the slap fight fair? (2 hits wins; watch for the wind-up and dodge/back off)
- [ ] Is 35 people too busy / too sparse? Any slowdown on your computer?
- [ ] Getting knocked down: too long? Is the "lying on the ground" camera funny or annoying?
- [ ] Speech lines: funny? Too frequent?

## Manual checklist for Blake (Phase 2)

- [ ] ~~Can you spot the good loot from far away (light beams)?~~ Beams replaced by sparkles in Phase 2.5 (Blake's feedback).
- [ ] Carrying the TV: too slow? too blocking? Is the held item too big on screen?
- [ ] Throwing: does the charge feel good? Is it too easy/hard to aim?
- [ ] Pockets: is right-click to cycle clear enough?
- [ ] City: too big / too small? Enough places to climb and hide?

## Manual checklist for Blake (Phase 1)

- [ ] Does sprinting then running out of stamina feel tense but fair?
- [ ] Is the weight right? (stopping skid, turning, air control)
- [ ] Slide (sprint + C), dodge (Q), climb (SPACE facing a ledge): fun? too strong? too weak?
- [ ] Hands: right size and style? Do they react enough?
- [ ] Crawl tunnel: does crouching feel sneaky?

## Manual checklist for Blake (Phase 0)

- [ ] Title screen loads; music starts only after you click
- [ ] Volume sliders change music and UI sounds; Mute silences everything
- [ ] Solo: mouse look feels right; try sensitivity + FOV sliders
- [ ] Solo: sprint, jump up the yellow steps to the teal platform, walk through the alley
- [ ] Create Room in one browser, open the copied link in another, see each other move
- [ ] Close one window mid-game: the other shows "(reconnecting)" and then removes them after 30 s
- [ ] Tell me how the movement *feels*: too floaty? too fast? too slippery?
````

## FILE: package.json

````json
{
  "name": "box-fort-banditz",
  "private": true,
  "type": "module",
  "version": "0.0.1",
  "description": "Box Fort Banditz - chaotic 3D browser multiplayer party game set in Trashington",
  "workspaces": [
    "shared",
    "server",
    "client"
  ],
  "scripts": {
    "dev": "npm run dev --workspace server & npm run dev --workspace client",
    "dev:server": "npm run dev --workspace server",
    "dev:client": "npm run dev --workspace client",
    "build": "npm run build --workspace client && npm run build --workspace server",
    "test": "npm run test --workspace shared && npm run test --workspace client",
    "test:e2e": "node tests/e2e-phase0.mjs",
    "typecheck": "tsc -p shared && tsc -p server --noEmit && tsc -p client --noEmit"
  },
  "devDependencies": {
    "playwright": "^1.56.0"
  }
}
````

## FILE: scripts-build-preview.py

````python
#!/usr/bin/env python3
"""Builds preview/box-fort-banditz.html: the solo-only page published to claude.ai.
Babylon.js loads from the jsDelivr CDN; the game code (~35 KB) is inlined."""
import re, glob, subprocess, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
subprocess.run(["npx", "vite", "build", "-c", "vite.preview.config.ts"], cwd="client", check=True, capture_output=True)
html = open("client/dist-preview/index.html").read()
css = open(glob.glob("client/dist-preview/assets/*.css")[0]).read()
js = open(glob.glob("client/dist-preview/assets/*.js")[0]).read().replace("</script", "<\\/script")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r"<script[^>]*></script>", "", body)
body = body.replace("PHASE 0 PROTOTYPE</span> Placeholder art &amp; sound. Nothing is final.",
                    "PHASE 0 SOLO PREVIEW</span> Placeholder art &amp; sound. Multiplayer needs the real server.")
out = f'''<title>Box Fort Banditz</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@600;800;900&display=swap" rel="stylesheet">
<style>
:root {{ color-scheme: dark; }}
{css}
</style>
{body}
<div id="boot-note" style="position:fixed;left:16px;right:16px;top:16px;z-index:99;color:#fff;font:800 15px Nunito,sans-serif;text-shadow:1px 1px 0 #1b1420">Loading the 3D engine (about 2 MB, first visit only)...</div>
<script src="https://cdn.jsdelivr.net/npm/babylonjs@9.28.0/babylon.js"></script>
<script src="https://cdn.jsdelivr.net/npm/babylonjs-materials@9.28.0/babylonjs.materials.min.js"></script>
<script>
setTimeout(function () {{
  if (window.__bfb) return;
  var f = document.getElementById("fatal");
  f.textContent = window.BABYLON ? "The game failed to start. Please tell the developer." : "The 3D engine couldn't download (network or browser blocked cdn.jsdelivr.net). Try reloading.";
  f.classList.remove("hidden");
}}, 20000);
</script>
<script type="module">
document.getElementById("boot-note").remove();
{js}
</script>
'''
os.makedirs("preview", exist_ok=True)
open("preview/box-fort-banditz.html", "w").write(out)
print("preview/box-fort-banditz.html", len(out), "bytes")
````

## FILE: scripts-run-e2e.sh

````bash
#!/usr/bin/env bash
# Builds the client, starts server + static preview, runs the browser test, stops everything.
set -u
cd "$(dirname "$0")"
# refuse to run against a stale server/preview left over from something else
for i in 1 2 3 4 5 6 7 8 9 10; do  # give a previous run a few seconds to shut down
  if curl -s -o /dev/null http://localhost:2567/ || curl -s -o /dev/null http://localhost:4173/; then sleep 1; else break; fi
done
if curl -s -o /dev/null http://localhost:2567/ || curl -s -o /dev/null http://localhost:4173/; then
  echo "ports 2567/4173 already in use - stop the old server/preview first"; exit 1
fi
npm run build --workspace client >/tmp/bfb-build.log 2>&1 || { echo "client build failed"; tail -20 /tmp/bfb-build.log; exit 1; }
RECONNECT_WINDOW_S=120 DEV_TOOLS=1 COLYSEUS_LATENCY=${LATENCY:-} npx tsx server/src/index.ts >/tmp/bfb-server.log 2>&1 & SERVER=$!
(cd client && npx vite preview --port 4173 --strictPort >/tmp/bfb-preview.log 2>&1) & PREVIEW=$!
sleep 4
node tests/e2e-phase0.mjs; CODE=$?
# stop everything we started (npx/vite spawn child processes, so kill by command line too)
kill $SERVER $PREVIEW 2>/dev/null
pkill -f "tsx server/src/index.ts" 2>/dev/null
pkill -f "vite preview --port 4173" 2>/dev/null
wait 2>/dev/null
exit $CODE
````

## FILE: server/package.json

````json
{
  "name": "@bfb/server",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p . --noEmit"
  },
  "dependencies": {
    "@bfb/shared": "*",
    "@colyseus/schema": "^5.0.34",
    "colyseus": "^0.18.8",
    "cors": "^2.8.6",
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "tsx": "^4.23.15",
    "typescript": "5.9"
  }
}
````

## FILE: server/src/FortRoom.ts

````ts
import { Room, type Client } from "colyseus";
import {
  World, playerView, itemView, npcView, matchView, propView, carView, copCarView, MSG, MAX_PLAYERS, SIM_HZ, PATCH_HZ, type JoinOptions, type WorldEvent,
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
  private world = new World({ seed: (Math.random() * 2 ** 31) | 0 });
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
      this.onMessage("dbg", (client, m: any) => {
        if (m?.op === "teleport") this.world.debugTeleport(client.sessionId, Number(m.x), Number(m.z), Number(m.yaw));
        if (m?.op === "spawn") this.world.placeItem(String(m.type), Number(m.x), 0.3, Number(m.z));
        if (m?.op === "npc") this.world.npc.place(m.kind, Number(m.x), Number(m.z), Number(m.yaw) || 0);
        if (m?.op === "event") this.world.match.trigger(m.kind);
        if (m?.op === "time" && this.world.match.phase !== "lobby") this.world.match.timeLeft = Math.max(0.1, Number(m.t) || 1);
        if (m?.op === "noEvents") this.world.match.cancelPlannedEvents();
        if (m?.op === "wipeout") { const p = this.world.players.get(client.sessionId); if (p) this.world.traffic.wipeout(p, this.world.traffic.cars[0]); }
        if (m?.op === "clearNpcs") this.world.npc.removeNear(Number(m.x), Number(m.z), Number(m.r) || 10);
        const me = this.world.players.get(client.sessionId);
        if (me && m?.op === "heat") { me.notoriety = 0; this.world.addHeat(me, Number(m.v) || 0); }
        if (me && m?.op === "bust") this.world.police.bust(me, "dbg", false);
        if (me && m?.op === "jailTime" && me.jailT > 0) me.jailT = Math.max(0.1, Number(m.t) || 1);
        if (m?.op === "clearCops") this.world.police.reset();
        if (m?.op === "bigShot") this.world.npc.spawnBigShot(m.kind || undefined);
      });
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
    this.syncAll();
    const ev = this.world.takeEvents();
    if (ev.length) this.pendingEvents.push(...ev);
  }

  /** Events go out once per patch (not every tick) to keep messages small. */
  onBeforePatch() {
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
    // props: only two flags each, and they rarely change
    for (const id of this.world.props.props.keys()) {
      let ps = this.state.props.get(id) as PropState | undefined;
      if (!ps) { ps = new PropState() as PropState; this.state.props.set(id, ps); }
      propView(this.world, id, scratch);
      if (ps.ready !== scratch.ready) ps.ready = scratch.ready;
      if (ps.alarm !== scratch.alarm) ps.alarm = scratch.alarm;
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
````

## FILE: server/src/index.ts

````ts
import { defineServer, defineRoom, WebSocketTransport } from "colyseus";
import { ROOM_NAME } from "@bfb/shared";
import { FortRoom } from "./FortRoom.ts";

const port = Number(process.env.PORT) || 2567;

const server = defineServer({
  // Be patient with busy laptops: the default (3 s x 2 missed pings) dropped players whose
  // browser was busy loading the big city. 5 s x 4 = ~20 s before a silent client is dropped.
  transport: new WebSocketTransport({ pingInterval: 5000, pingMaxRetries: 4 }),
  rooms: {
    [ROOM_NAME]: defineRoom(FortRoom),
  },
});

server.listen(port).then(() => {
  console.log(`[Box Fort Banditz] server listening on :${port}`);
});
````

## FILE: server/src/roomCodes.ts

````ts
import { makeRoomCode } from "@bfb/shared";

// Single-process registry of room codes currently in use.
// (If we ever run several server processes, this moves to Redis presence.)
const active = new Set<string>();

export function claimRoomCode(): string {
  for (let i = 0; i < 1000; i++) {
    const code = makeRoomCode();
    if (!active.has(code)) {
      active.add(code);
      return code;
    }
  }
  throw new Error("Could not allocate a room code");
}

export function releaseRoomCode(code: string): void {
  active.delete(code);
}
````

## FILE: server/src/schema.ts

````ts
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
  jailT: t.float32(),
  lockSeed: t.number(),
  lockT: t.float32(),
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
  players: t.map(PlayerState),
  items: t.map(ItemState),
  npcs: t.map(NpcState),
  props: t.map(PropState),
  cars: t.map(CarState),
  copCars: t.map(CopCarState),
}, "FortRoomState");
export type FortRoomState = SchemaType<typeof FortRoomState>;
````

## FILE: server/tsconfig.json

````json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"], "allowImportingTsExtensions": true },
  "include": ["src", "../shared/src"]
}
````

## FILE: shared/package.json

````json
{
  "name": "@bfb/shared",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "tsx --test test/*.test.ts"
  },
  "devDependencies": {
    "@types/node": "^22.20.4",
    "tsx": "^4.23.15",
    "typescript": "5.9"
  }
}
````

## FILE: shared/src/arena.ts

````ts
// PLACEHOLDER grey-box arena used in Phase 0/1 to test movement and multiplayer.
// The real Trashington city block replaces this in Phase 2.
// Both client (for rendering + prediction) and server (for authority) read this list,
// so collisions are identical on both sides.

export interface Box {
  /** centre */
  x: number;
  y: number;
  z: number;
  /** full sizes */
  w: number; // along x
  h: number; // along y
  d: number; // along z
  kind: BoxKind;
  /** optional look hints for the renderer (colour, sign text, windows...) */
  color?: string;
  sign?: string;
  windows?: boolean;
}

export type BoxKind =
  | "wall" | "crate" | "curb" | "ramp-step" | "platform" | "ledge" | "slab"
  | "building" | "roof" | "sidewalk" | "fence" | "dumpster" | "bench" | "planter" | "fountain"
  | "kiosk" | "van" | "busstop" | "fort" | "tree" | "junk" | "counter"
  // Phase 3.5 city overhaul
  | "tower" | "plaza" | "shelf" | "fridge" | "shopfloor" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "statue"
  // Phase 4 police station
  | "bars";

export interface SpawnPoint {
  x: number; y: number; z: number; zone: LootZone;
  /** only these item types spawn here (shop shelves) */
  pool?: string[];
  /** shop this spot belongs to (cashier yells if you swipe it) */
  shop?: number;
}

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number; }
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;

/** Things you can search, smash or rob (Phase 3.5). Static list; their state lives in the World. */
export type PropKind = "dumpster" | "bin" | "phone" | "vending" | "meter" | "newsbox" | "car" | "till";
export interface PropDef { id: string; kind: PropKind; x: number; y: number; z: number; yaw: number; shop?: number; color?: string; }

export type ShopType = "mart" | "pawn" | "bakery" | "gadget";
export interface ShopDef {
  id: number; name: string; type: ShopType;
  /** inside of the shop (for "caught shoplifting" checks) */
  rect: Rect;
  /** where the cashier stands and which way they face (toward the door) */
  cashier: { x: number; z: number; yaw: number };
  /** till on the counter (the register item sits here) */
  till: { x: number; y: number; z: number };
  floorColor: string; wallColor: string;
}

/** A closed driving loop (lane centre line, corners in driving order) and how many cars use it. */
export interface TrafficLoop { id: string; points: { x: number; z: number }[]; cars: number; speed: number; }
/** Phase 4: the police station (jail cells, where you walk out, where you break out to). */
export interface StationDef {
  /** whole building footprint */
  rect: Rect;
  /** outside the front door: where you're released after serving your time */
  door: { x: number; z: number; yaw: number };
  /** the back alley: where you end up after picking the lock */
  alley: { x: number; z: number; yaw: number };
  /** one cell per player: stand here while locked up (facing the bars) */
  cells: { x: number; z: number; yaw: number; rect: Rect }[];
}

/** Road centre-line network (cop cars drive it): points + straight links between them. */
export interface RoadGraph { nodes: { x: number; z: number }[]; edges: [number, number][]; }

export type LootZone = "plaza" | "street" | "alley" | "rooftop" | "shop" | "yard";

export interface FortLot {
  slot: number;
  /** centre of the drop pad in front of the fort */
  padX: number; padZ: number;
  /** fort box position */
  x: number; z: number;
  /** direction the fort faces (toward the city centre) */
  yaw: number;
  /** the yard around the fort: loot resting here is "at home" (world-aligned rectangle) */
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** a spot in the back alley behind the fort (raccoons come from here) */
  backX: number; backZ: number;
}

/** Which fort yard (slot) a point is in, or -1. */
export function fortAt(arena: ArenaLayout, x: number, z: number): number {
  for (const f of arena.forts ?? []) {
    const r = f.zone;
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return f.slot;
  }
  return -1;
}

export interface ArenaLayout {
  halfSize: number; // playable area is [-halfSize, halfSize] on x and z
  boxes: Box[];
  spawns: { x: number; z: number; yaw: number }[];
  /** loot spawn points (Phase 2+) */
  lootSpawns?: SpawnPoint[];
  forts?: FortLot[];
  // Phase 3.5: the bigger city
  roads?: Rect[];
  crosswalks?: Rect[];
  /** grid lines pedestrians walk along (x and z) */
  navLines?: number[];
  props?: PropDef[];
  shops?: ShopDef[];
  traffic?: TrafficLoop[];
  truckRoutes?: { name: string; ax: number; az: number; bx: number; bz: number }[];
  happyZones?: { x: number; z: number; r: number; name: string }[];
  airdropSpots?: [number, number][];
  // Phase 4
  station?: StationDef;
  roadGraph?: RoadGraph;
  /** purely visual extras (streetlights, lane paint, parked police cars...) */
  decor?: { kind: "streetlight" | "hydrant" | "dash" | "zebra" | "grass" | "copcar"; x: number; z: number; w?: number; d?: number; yaw?: number }[];
  /** named places, used by tests and tutorials */
  landmarks?: Record<string, { x: number; z: number; yaw: number; [extra: string]: number }>;
}

export function box(x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], baseY = 0): Box {
  return { x, y: baseY + h / 2, z, w, h, d, kind };
}

export function buildTestArena(): ArenaLayout {
  const half = 30;
  const boxes: Box[] = [];

  // Perimeter walls
  const t = 1;
  const wallH = 4;
  boxes.push(box(0, half + t / 2, half * 2 + t * 2, t, wallH, "wall"));
  boxes.push(box(0, -half - t / 2, half * 2 + t * 2, t, wallH, "wall"));
  boxes.push(box(half + t / 2, 0, t, half * 2, wallH, "wall"));
  boxes.push(box(-half - t / 2, 0, t, half * 2, wallH, "wall"));

  // Central "plaza" crates: things to run around and break line of sight
  boxes.push(box(0, 0, 3, 3, 2.2, "crate"));
  boxes.push(box(5, 4, 2, 2, 1.2, "crate"));
  boxes.push(box(-6, -3, 2.5, 1.5, 1.6, "crate"));
  boxes.push(box(-4, 7, 1.5, 4, 2.5, "crate"));
  boxes.push(box(8, -7, 4, 1, 3, "wall"));

  // Curb strip (walk up automatically: lower than stepHeight)
  boxes.push(box(0, -14, 20, 3, 0.25, "curb"));

  // A staircase of jumpable steps up to a rooftop platform
  boxes.push(box(15, 10, 2, 2, 0.35, "ramp-step"));
  boxes.push(box(15, 12, 2, 2, 0.9, "ramp-step"));
  boxes.push(box(15, 14, 2, 2, 1.45, "ramp-step"));
  boxes.push(box(15, 18, 6, 6, 2.0, "platform"));

  // Alley: two long walls forming a narrow corridor
  boxes.push(box(-18, 8, 1, 14, 3.5, "wall"));
  boxes.push(box(-21.5, 8, 1, 14, 3.5, "wall"));

  // Phase 1 movement playground
  // Mantle ledges: waist-high, chest-high and head-high
  boxes.push(box(-10, -10, 3, 2, 0.9, "ledge"));
  boxes.push(box(-14, -10, 3, 2, 1.4, "ledge"));
  boxes.push(box(-18, -10, 3, 2, 1.95, "ledge"));
  // Crawl tunnel: a low slab (bottom at 1.25 m) between two walls. Crouch to get through.
  boxes.push(box(22, -6, 3.2, 6, 0.3, "slab", 1.25));
  boxes.push(box(20.2, -6, 0.4, 6, 1.55, "wall"));
  boxes.push(box(23.8, -6, 0.4, 6, 1.55, "wall"));

  const spawns = [
    { x: -3, z: -22, yaw: 0 },
    { x: 3, z: -22, yaw: 0 },
    { x: -9, z: -22, yaw: 0 },
    { x: 9, z: -22, yaw: 0 },
  ];

  return { halfSize: half, boxes, spawns };
}

// ---------------------------------------------------------------------------------------
// Broadphase (Phase 3.5): the 200 m city has hundreds of boxes, so collision code asks for
// just the boxes near a point. Boxes come back in their ORIGINAL order, so results are
// identical to checking the full list (client prediction and server stay in lock-step).
const CELL = 8;
const grids = new WeakMap<ArenaLayout, { cells: Map<number, number[]>; boxes: Box[] }>();
const key = (cx: number, cz: number) => (cx + 1000) * 4096 + (cz + 1000);

function gridOf(arena: ArenaLayout) {
  let g = grids.get(arena);
  if (!g || g.boxes !== arena.boxes) {
    const cells = new Map<number, number[]>();
    arena.boxes.forEach((b, i) => {
      const x0 = Math.floor((b.x - b.w / 2) / CELL), x1 = Math.floor((b.x + b.w / 2) / CELL);
      const z0 = Math.floor((b.z - b.d / 2) / CELL), z1 = Math.floor((b.z + b.d / 2) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        const list = cells.get(k);
        if (list) list.push(i); else cells.set(k, [i]);
      }
    });
    g = { cells, boxes: arena.boxes };
    grids.set(arena, g);
  }
  return g;
}

/** Boxes whose footprint could touch the square (x +- r, z +- r), in original order. */
export function nearBoxes(arena: ArenaLayout, x: number, z: number, r: number): Box[] {
  if (arena.boxes.length < 64) return arena.boxes; // small arenas: not worth it
  const g = gridOf(arena);
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  const seen = new Set<number>();
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
    const list = g.cells.get(key(cx, cz));
    if (list) for (const i of list) seen.add(i);
  }
  const idx = [...seen].sort((a, b) => a - b);
  return idx.map((i) => g.boxes[i]);
}

/** A view of the arena holding only the boxes near a point (for one collision step). */
export function localArena(arena: ArenaLayout, x: number, z: number, r: number): ArenaLayout {
  if (arena.boxes.length < 64) return arena;
  return { ...arena, boxes: nearBoxes(arena, x, z, r) };
}
````

## FILE: shared/src/city.ts

````ts
// Trashington, Phase 3.5 overhaul: a ~200 m city. Shared by server, solo and renderer.
//
//   x = east, z = north. Two square ring roads with two-way traffic:
//     ring A (centre line +-30) around the PLAZA, ring B (+-70) around downtown.
//   Connector streets (no traffic, parked cars) link the rings at +-30.
//
//   +----------------------------------------------------------------------+ z = +100 (fence)
//   | NW parking | warehouses |  N FORT  | shops/warehouses | NE junkyard   |   edge band 77..99
//   |------------------------------ ring B ---------------------------------|
//   |  corner block (tower) | side block (SHOP + tower) | corner block        |   downtown 37..63
//   |------------ ring A ------------|  PLAZA (fountain) |-------- ring A ---|
//   |  ... mirrored ...                                                      |
//   | SW construction yard | ...     |  S FORT  | ...          | SE police   |
//   +----------------------------------------------------------------------+ z = -100
//
// Downtown blocks have 26-46 m high-rises, alleys with dumpsters, and one walk-in shop per
// side block (with shelves, a counter, a till and a cashier). Low annexes (3.2 m) can be
// climbed from their dumpsters. Everything is mirrored by direction but each shop differs.
import {
  box, type Box, type ArenaLayout, type SpawnPoint, type FortLot, type LootZone, type PropDef, type PropKind,
  type Rect, type ShopDef, type ShopType, type TrafficLoop,
} from "./arena.js";

const HALF = 100;
const LOW = 3.2; // climbable roof height (from a dumpster)
const RA = 30; // ring A centre line
const RB = 70; // ring B centre line
const RW = 4; // road half-width (two 4 m lanes)

type Dir = "N" | "S" | "E" | "W";
const DIRS: Dir[] = ["N", "E", "S", "W"];

/** (lateral, depth) on a side -> world (x, z). Depth grows toward that side's edge. */
function latDep(dir: Dir, lat: number, dep: number): [number, number] {
  switch (dir) {
    case "N": return [lat, dep];
    case "S": return [-lat, -dep];
    case "E": return [dep, -lat];
    case "W": return [-dep, lat];
  }
}
/** A box in (lateral, depth) coordinates on a side. */
function side(dir: Dir, lat: number, dep: number, wLat: number, wDep: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, baseY = 0): Box {
  const [x, z] = latDep(dir, lat, dep);
  const alongX = dir === "N" || dir === "S";
  return { ...box(x, z, alongX ? wLat : wDep, alongX ? wDep : wLat, h, kind, baseY), ...extra };
}
/** A world rectangle from (lateral, depth) ranges on a side. */
function sideRect(dir: Dir, lat0: number, lat1: number, dep0: number, dep1: number): Rect {
  const [ax, az] = latDep(dir, lat0, dep0), [bx, bz] = latDep(dir, lat1, dep1);
  return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
}
/** Yaw that looks from (lat, dep) toward smaller depth (i.e. toward the city centre). */
function inwardYaw(dir: Dir): number {
  const [ax, az] = latDep(dir, 0, 1), [bx, bz] = latDep(dir, 0, 0);
  return Math.atan2(bx - ax, bz - az);
}
/** Mirror helper for the four corner blocks. */
function q(sx: number, sz: number, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"], extra: Partial<Box> = {}, baseY = 0): Box {
  return { ...box(sx * x, sz * z, w, d, h, kind, baseY), ...extra };
}
function hash(a: number, b: number) {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const WAREHOUSE_SIGNS = ["DISCOUNT SOUP", "LAUNDRO-MATT", "PIGEON SUPPLY", "MOP EMPORIUM", "CHEAP WIGS", "HAT HUT", "SOCK OUTLET", "NAPKIN DEPOT"];
const TOWER_SIGNS = ["TRASHCORP", "BIG BANK OF TRASHINGTON", "INSURANCE-ISH", "MEGAMART HQ", "LAWYERS 4 LESS", "CRUNCHO+ TOWER", "HOTEL ADEQUATE", "BOXLY INC"];

/** What each kind of shop has on its shelves. */
export const SHOP_POOLS: Record<ShopType, string[]> = {
  mart: ["canned_beans", "energy_drink", "candy_bar", "soda_can", "lottery_ticket", "fancy_cheese"],
  pawn: ["gold_chain", "guitar", "sunglasses", "golden_spork", "snow_globe", "mixtape"],
  bakery: ["bagel", "baguette", "birthday_cake", "fancy_cheese", "energy_drink"],
  gadget: ["phone_handset", "fancy_earbuds", "laptop", "crt_tv", "mixtape"],
};
const SHOPS: Record<Dir, { name: string; type: ShopType; floor: string; wall: string }> = {
  N: { name: "CORNER MART", type: "mart", floor: "#d8e8d0", wall: "#3f8f6a" },
  E: { name: "PAWN-O-RAMA", type: "pawn", floor: "#e8d8b0", wall: "#8a5a2b" },
  S: { name: "BAGEL BARN", type: "bakery", floor: "#f0dcc0", wall: "#c26b4a" },
  W: { name: "GIZMO GARAGE", type: "gadget", floor: "#cfd8e8", wall: "#3d5a9e" },
};

export function buildTrashington(): ArenaLayout {
  const boxes: Box[] = [];
  const loot: SpawnPoint[] = [];
  const props: PropDef[] = [];
  const decor: NonNullable<ArenaLayout["decor"]> = [];
  const spawnAt = (x: number, z: number, zone: LootZone, y = 0, extra: Partial<SpawnPoint> = {}) => loot.push({ x, y, z, zone, ...extra });
  const count: Record<string, number> = {};
  /** An interactable prop (with its collision box, if it has one). Dimensions are for yaw 0 (facing +z). */
  const prop = (kind: PropKind, x: number, z: number, yaw: number, w: number, d: number, h: number, extra: Partial<PropDef> = {}) => {
    const n = (count[kind] = (count[kind] ?? 0) + 1);
    const id = kind + n;
    const turned = Math.abs(Math.sin(yaw)) > 0.5;
    if (h > 0) boxes.push({ ...box(x, z, turned ? d : w, turned ? w : d, h, kind === "till" ? "counter" : kind) });
    props.push({ id, kind, x, y: 0, z, yaw, ...extra });
    return id;
  };
  const dirProp = (dir: Dir, kind: PropKind, lat: number, dep: number, w: number, d: number, h: number, faceOut = false, extra: Partial<PropDef> = {}) => {
    const [x, z] = latDep(dir, lat, dep);
    return prop(kind, x, z, inwardYaw(dir) + (faceOut ? Math.PI : 0), w, d, h, extra);
  };

  // ---- boundary fences (3 m, too tall to climb) ----------------------------------------
  boxes.push(box(0, HALF + 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(0, -HALF - 0.5, HALF * 2 + 2, 1, 3, "fence"));
  boxes.push(box(HALF + 0.5, 0, 1, HALF * 2, 3, "fence"));
  boxes.push(box(-HALF - 0.5, 0, 1, HALF * 2, 3, "fence"));

  // ---- roads + crosswalks -----------------------------------------------------------------
  const roads: Rect[] = [];
  const crosswalks: Rect[] = [];
  for (const dir of DIRS) {
    roads.push(sideRect(dir, -(RA + RW), RA + RW, RA - RW, RA + RW)); // ring A side
    roads.push(sideRect(dir, -(RB + RW), RB + RW, RB - RW, RB + RW)); // ring B side
    for (const s of [-1, 1]) {
      roads.push(sideRect(dir, s * RA - RW, s * RA + RW, RA + RW, RB - RW)); // connector (belongs to this side's block)
      crosswalks.push(sideRect(dir, s * 16 - 2, s * 16 + 2, RA - RW, RA + RW)); // ring A crossings
      crosswalks.push(sideRect(dir, s * 50 - 2, s * 50 + 2, RB - RW, RB + RW)); // ring B crossings
      crosswalks.push(sideRect(dir, s * RA - RW, s * RA + RW, 48, 52)); // connector crossings
      for (const [lat, dep] of [[s * 16, RA], [s * 50, RB], [s * RA, 50]]) {
        const [x, z] = latDep(dir, lat, dep);
        decor.push({ kind: "zebra", x, z, yaw: lat === s * RA ? inwardYaw(dir) + Math.PI / 2 : inwardYaw(dir) });
      }
    }
    // centre-line dashes (painted every 6 m)
    for (let t = -RA + 3; t <= RA - 3; t += 6) { const [x, z] = latDep(dir, t, RA); decor.push({ kind: "dash", x, z, yaw: inwardYaw(dir) + Math.PI / 2 }); }
    for (let t = -RB + 3; t <= RB - 3; t += 6) { const [x, z] = latDep(dir, t, RB); decor.push({ kind: "dash", x, z, yaw: inwardYaw(dir) + Math.PI / 2 }); }
  }

  // ---- the plaza (centre): raised paving, fountain + raccoon statue, trees, kiosks -----------
  boxes.push(box(0, 0, 52, 52, 0.15, "plaza"));
  boxes.push(box(0, 0, 7, 7, 0.8, "fountain"));
  boxes.push({ ...box(0, 0, 1.4, 1.4, 2.6, "statue", 0.8), sign: "OUR FOUNDER" });
  for (const [x, z, w, d] of [[0, 6.5, 3, 1], [0, -6.5, 3, 1], [6.5, 0, 1, 3], [-6.5, 0, 1, 3]]) boxes.push(box(x, z, w, d, 0.5, "bench"));
  for (const [x, z] of [[19, 19], [-19, 19], [19, -19], [-19, -19]]) boxes.push(box(x, z, 2.5, 2.5, 0.7, "planter"));
  for (const [x, z] of [[20, 8], [20, -8], [-20, 8], [-20, -8], [12, 20], [-12, 20], [12, -20], [-12, -20]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
  boxes.push({ ...box(19, -13, 2.5, 2, 2.4, "kiosk"), sign: "HOT DOGS?" });
  boxes.push({ ...box(13, 19, 2, 2.5, 2.4, "kiosk"), sign: "MAPS (WRONG)" });
  for (const [x, z, w, d] of [[12, 24.5, 4, 1.2], [-24.5, 12, 1.2, 4], [12, -24.5, 4, 1.2], [24.5, -2, 1.2, 4]]) boxes.push(box(x, z, w, d, 2.6, "busstop"));
  prop("phone", 21, 2, -Math.PI / 2, 1.1, 1.1, 2.3);
  prop("phone", -21, -3, Math.PI / 2, 1.1, 1.1, 2.3);
  prop("vending", 21, -4, -Math.PI / 2, 1.2, 0.9, 1.9);
  prop("vending", -21, 4, Math.PI / 2, 1.2, 0.9, 1.9);
  prop("newsbox", -21, 12, Math.PI / 2, 0.6, 0.5, 1.0);
  prop("newsbox", 21, 12, -Math.PI / 2, 0.6, 0.5, 1.0);
  for (const [x, z] of [[4, 10], [-4, -10], [10, -4], [-10, 4], [18, 22], [-18, -22]]) prop("bin", x, z, 0, 0.7, 0.7, 1.0);
  for (const [x, z] of [[5, 9], [-5, 9], [5, -9], [-5, -9], [9, 5], [-9, -5], [14, 0], [-14, 0], [0, 15], [0, -15], [17, 15], [-17, -15], [10, -17], [-10, 17]]) spawnAt(x, z, "plaza", 0.15);
  for (const [x, z] of [[24, 24], [-24, 24], [24, -24], [-24, -24], [0, 24], [0, -24], [24, 16], [-24, -16]]) decor.push({ kind: "streetlight", x, z });

  // ---- downtown corner blocks: high-rise, alley with a dumpster, climbable annex, mid-rise ----
  const quads: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  quads.forEach(([sx, sz], qi) => {
    boxes.push(q(sx, sz, 50, 50, 32, 32, 0.15, "sidewalk"));
    const tall = 30 + Math.round(hash(sx, sz) * 16);
    boxes.push(q(sx, sz, 45, 45, 14, 14, tall, "tower", { windows: true, sign: TOWER_SIGNS[qi] }));
    boxes.push(q(sx, sz, 59.5, 45, 7, 14, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[qi] }));
    boxes.push(q(sx, sz, 50.5, 59.5, 25, 7, 10 + qi * 2, "building", { windows: true }));
    prop("dumpster", sx * 55.4, sz * 45, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 2.2, 1.2, 1.3);
    prop("bin", sx * 54, sz * 53.5, 0, 0.7, 0.7, 1.0);
    prop("vending", sx * 35.6, sz * 44, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2, 0.9, 1.9);
    prop("meter", sx * 35, sz * 56, 0, 0.3, 0.3, 1.3);
    spawnAt(sx * 54, sz * 41, "alley", 0.15);
    spawnAt(sx * 46, sz * 53.8, "alley", 0.15);
    spawnAt(sx * 59.5, sz * 45, "rooftop", LOW);
    spawnAt(sx * 36, sz * 38, "street", 0.15);
    decor.push({ kind: "streetlight", x: sx * 36, z: sz * 36 }, { kind: "streetlight", x: sx * 64, z: sz * 64 });
  });

  // ---- downtown side blocks: walk-in SHOP (with interior + cashier), tower, alleys ----------
  const shops: ShopDef[] = [];
  DIRS.forEach((dir, di) => {
    const S = SHOPS[dir];
    boxes.push(side(dir, 0, 50, 52, 32, 0.15, "sidewalk"));
    // shop shell: lateral -21..-5, depth 38..50, door (4 m) in the wall facing the plaza
    const H = 4.5, t = 0.4, wall = { color: S.wall };
    boxes.push(side(dir, -18, 38.2, 6, t, H, "wall", wall));
    boxes.push(side(dir, -8, 38.2, 6, t, H, "wall", wall));
    boxes.push(side(dir, -13, 49.8, 16, t, H, "wall", wall));
    boxes.push(side(dir, -20.8, 44, t, 12, H, "wall", wall));
    boxes.push(side(dir, -5.2, 44, t, 12, H, "wall", wall));
    boxes.push(side(dir, -13, 44, 16, 12, 0.3, "roof", { sign: S.name }, H));
    boxes.push(side(dir, -13, 44, 15.2, 11.2, 0.03, "shopfloor", { color: S.floor }, 0.15));
    // interior: two shelf rows, a back fridge, the counter
    boxes.push(side(dir, -18, 44, 1, 6, 1.7, "shelf"));
    boxes.push(side(dir, -14, 44.5, 1, 5, 1.7, "shelf"));
    boxes.push(side(dir, -16.5, 49.2, 8, 0.8, 2.2, "fridge"));
    boxes.push(side(dir, -8.5, 45.5, 4, 1, 1.05, "counter"));
    const [cx, cz] = latDep(dir, -8.5, 46.8);
    const [tx, tz] = latDep(dir, -8.5, 45.5);
    const shopId = di;
    shops.push({
      id: shopId, name: S.name, type: S.type, rect: sideRect(dir, -20.6, -5.4, 38.4, 49.6),
      cashier: { x: cx, z: cz, yaw: inwardYaw(dir) }, till: { x: tx, y: 1.05, z: tz }, floorColor: S.floor, wallColor: S.wall,
    });
    props.push({ id: "till" + (shopId + 1), kind: "till", x: tx, y: 1.05, z: tz, yaw: inwardYaw(dir), shop: shopId });
    const pool = SHOP_POOLS[S.type];
    for (const [lat, dep, y] of [[-18, 42, 1.7], [-18, 44, 1.7], [-18, 46, 1.7], [-14, 43.5, 1.7], [-14, 46, 1.7], [-17.5, 48.2, 0.18], [-12, 48.2, 0.18], [-10, 45.5, 1.05]]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, "shop", y, { pool, shop: shopId });
    }
    // tower + back buildings
    const tall = 26 + Math.round(hash(di, 7) * 14);
    boxes.push(side(dir, 11, 46, 20, 16, tall, "tower", { windows: true, sign: TOWER_SIGNS[4 + di] }));
    boxes.push(side(dir, -12, 59, 18, 8, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[4 + di] }));
    boxes.push(side(dir, 12, 59.5, 18, 7, 12, "building", { windows: true }));
    dirProp(dir, "dumpster", -16, 54.4, 2.2, 1.2, 1.3);
    dirProp(dir, "bin", -8, 52.5, 0.7, 0.7, 1.0);
    dirProp(dir, "bin", -2, 42, 0.7, 0.7, 1.0);
    dirProp(dir, "phone", 23.5, 35.6, 1.1, 1.1, 2.3);
    dirProp(dir, "newsbox", -23, 35.4, 0.6, 0.5, 1.0);
    dirProp(dir, "meter", 8, 34.4, 0.3, 0.3, 1.3);
    // parked car on each connector (no traffic there)
    for (const s of [-1, 1]) {
      const [x, z] = latDep(dir, s * (RA + 2.5), 42 + (s > 0 ? 0 : 14));
      prop("car", x, z, inwardYaw(dir), 1.9, 4.2, 1.5, { color: ["#d6264a", "#3d6fb5", "#ffcf3a", "#8a9a5b", "#e8e2d4", "#6b4c9a", "#43c7a6", "#ff7a1f"][(di * 2 + (s > 0 ? 1 : 0)) % 8] });
    }
    for (const [lat, dep, zone, y] of [[-2, 45, "alley", 0.15], [-12, 52.5, "alley", 0.15], [-12, 59, "rooftop", LOW], [24.5, 50, "street", 0.15], [2, 55, "alley", 0.15]] as [number, number, LootZone, number][]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, zone, y);
    }
    for (const lat of [-24, 0, 24]) { const [x, z] = latDep(dir, lat, 36); decor.push({ kind: "streetlight", x, z }); }
  });

  // ---- edge band: forts in the middle of each side, warehouses and shops around them --------
  const forts: FortLot[] = [];
  const fortOrder: Dir[] = ["S", "N", "W", "E"]; // slot 0 = south, 1 = north, 2 = west, 3 = east
  fortOrder.forEach((dir, slot) => {
    const fortBox = side(dir, 0, 92, 2.4, 1.9, 1.5, "fort");
    boxes.push(fortBox);
    const [padX, padZ] = latDep(dir, 0, 82);
    const zone = sideRect(dir, -8, 8, 77.5, 95.5);
    const [backX, backZ] = latDep(dir, 0, 97.8);
    forts.push({ slot, x: fortBox.x, z: fortBox.z, padX, padZ, yaw: inwardYaw(dir), zone, backX, backZ });
  });
  DIRS.forEach((dir, di) => {
    boxes.push(side(dir, 0, 75.5, 148, 3, 0.15, "sidewalk"));
    boxes.push(side(dir, 22, 88, 22, 18, LOW, "building", { windows: true, sign: WAREHOUSE_SIGNS[di * 2 % 8] }));
    boxes.push(side(dir, 54, 87.5, 34, 17, 9, "building", { windows: true, sign: WAREHOUSE_SIGNS[(di * 2 + 1) % 8] }));
    boxes.push(side(dir, -22, 87.5, 22, 17, 12, "building", { windows: true, sign: TOWER_SIGNS[(di + 3) % 8] }));
    boxes.push(side(dir, -54, 88, 34, 18, LOW, "building", { windows: true }));
    dirProp(dir, "dumpster", 10.4, 84, 1.2, 2.2, 1.3); // climb aid onto the low warehouse next to the fort
    dirProp(dir, "dumpster", -36.4, 84, 1.2, 2.2, 1.3);
    dirProp(dir, "bin", 35, 80, 0.7, 0.7, 1.0);
    for (const lat of [-45, -20, 20, 45]) dirProp(dir, "meter", lat, 75.2, 0.3, 0.3, 1.3);
    dirProp(dir, "newsbox", 12, 76, 0.6, 0.5, 1.0);
    dirProp(dir, "phone", -12, 76.2, 1.1, 1.1, 2.3);
    for (const [lat, dep, zone, y] of [[35, 88, "alley", 0], [-35, 90, "alley", 0], [22, 88, "rooftop", LOW], [-54, 88, "rooftop", LOW], [60, 75.5, "street", 0.15], [-60, 75.5, "street", 0.15], [0, 98, "alley", 0]] as [number, number, LootZone, number][]) {
      const [x, z] = latDep(dir, lat, dep);
      spawnAt(x, z, zone, y);
    }
    for (const lat of [-60, -30, 30, 60]) { const [x, z] = latDep(dir, lat, 76); decor.push({ kind: "streetlight", x, z }); }
  });

  // ---- corners --------------------------------------------------------------------------------
  // SW: construction yard (the movement playground: 0.9 / 1.4 / 1.95 m ledges + crawl tunnel)
  const ledgeZ = -92;
  boxes.push(box(-94, ledgeZ, 3, 2, 0.9, "ledge"));
  boxes.push(box(-89, ledgeZ, 3, 2, 1.4, "ledge"));
  boxes.push(box(-84, ledgeZ, 3, 2, 1.95, "ledge"));
  // crawl tunnel runs along x: slab bottom at 1.25 m, roof from x = -91 to -85
  boxes.push(box(-88, -84, 6, 3.2, 0.3, "slab", 1.25));
  boxes.push(box(-88, -85.8, 6, 0.4, 1.55, "wall"));
  boxes.push(box(-88, -82.2, 6, 0.4, 1.55, "wall"));
  for (const [x, z, w, d, h] of [[-80, -95, 2, 2, 1.2], [-81, -79, 3, 2, 0.9], [-97, -79, 2, 3, 1.6]]) boxes.push(box(x, z, w, d, h, "crate"));
  spawnAt(-89, -96, "yard");
  spawnAt(-84, ledgeZ, "yard", 1.95);
  spawnAt(-82, -84, "yard");
  // NE: junkyard
  for (const [x, z, w, d, h] of [[82, 82, 3, 3, 1.6], [88, 84, 2, 4, 1.1], [94, 80, 3, 2, 2.2], [84, 92, 4, 2, 1.3], [92, 93, 2, 2, 0.9], [96, 88, 2, 3, 1.8]]) {
    boxes.push(box(x, z, w, d, h, "junk"));
  }
  spawnAt(88, 89, "yard");
  spawnAt(94, 80, "yard", 2.2);
  spawnAt(80, 96, "yard");
  // NW: parking lot (parked cars you can break into)
  const lotColors = ["#d6264a", "#3d6fb5", "#e8e2d4", "#ffcf3a", "#2b2433", "#43c7a6"];
  [[-94, 84], [-88, 84], [-82, 84], [-94, 93], [-88, 93], [-82, 93]].forEach(([x, z], i) => prop("car", x, z, i < 3 ? Math.PI : 0, 1.9, 4.2, 1.5, { color: lotColors[i] }));
  spawnAt(-85, 88.5, "yard");
  spawnAt(-97, 88.5, "yard");
  // SE: the Trashington Police Department (Phase 4). Lobby with a front desk, four barred cells
  // along the back (one per player, visible from the lobby), a back alley behind it.
  const PD_H = 4.5, PD = { x0: 78, x1: 98, z0: -95, z1: -79 };
  const pdWall = "#2f3a5c", pdX = (PD.x0 + PD.x1) / 2, pdZ = (PD.z0 + PD.z1) / 2;
  const wall = (x: number, z: number, w: number, d: number, h = PD_H, baseY = 0, kind: Box["kind"] = "wall", color = pdWall) =>
    boxes.push({ ...box(x, z, w, d, h, kind, baseY), color });
  wall(79.5, PD.z1, 3, 0.4); // front wall, left of the door (door: x 81..84)
  wall(91, PD.z1, 14, 0.4); // front wall, right of the door
  wall(82.5, PD.z1, 3, 0.4, PD_H - 2.7, 2.7); // over the door
  wall(pdX, PD.z0, PD.x1 - PD.x0 + 0.4, 0.4); // back wall
  wall(PD.x0, pdZ, 0.4, PD.z1 - PD.z0); // west
  wall(PD.x1, pdZ, 0.4, PD.z1 - PD.z0); // east
  boxes.push({ ...box(pdX, pdZ, PD.x1 - PD.x0 + 0.4, PD.z1 - PD.z0 + 0.4, 0.3, "roof", PD_H), sign: "TRASHINGTON PD", color: "#1f2944" });
  boxes.push({ ...box(pdX, pdZ, PD.x1 - PD.x0 - 0.4, PD.z1 - PD.z0 - 0.4, 0.03, "shopfloor"), color: "#c9ccd6" }); // sits ON the ground
  boxes.push({ ...box(91, -83.6, 9, 0.9, 1.1, "counter"), color: "#5a4632" }); // front desk
  // cells: bars at z = -89 (you can see in from the lobby), dividers between them
  const cellZ0 = -94.8, cellZ1 = -89, cellW = (PD.x1 - PD.x0 - 0.4) / 4;
  const cells: NonNullable<ArenaLayout["station"]>["cells"] = [];
  for (let i = 0; i < 4; i++) {
    const cx0 = PD.x0 + 0.2 + i * cellW, cx1 = cx0 + cellW, cx = (cx0 + cx1) / 2;
    if (i > 0) wall(cx0, (cellZ0 + cellZ1) / 2, 0.3, cellZ1 - cellZ0);
    boxes.push({ ...box(cx, cellZ1, cellW - (i > 0 ? 0.3 : 0), 0.2, PD_H, "bars"), color: "#8e96a8" });
    boxes.push({ ...box(cx, -94.1, 2.2, 0.8, 0.45, "bench"), color: "#6b4a2b" });
    cells.push({ x: cx, z: -91.3, yaw: 0, rect: { minX: cx0 + 0.6, maxX: cx1 - 0.6, minZ: cellZ0 + 0.6, maxZ: cellZ1 - 0.5 } });
  }
  // two patrol cars parked out front (scenery; the ones that chase you are separate)
  for (const x of [89.5, 95]) { boxes.push(box(x, -76.4, 4.2, 1.9, 1.5, "car")); decor.push({ kind: "copcar", x, z: -76.4, yaw: Math.PI / 2 }); }
  for (const [x, z] of [[76, -98], [99.2, -84]]) boxes.push(box(x, z, 0.6, 0.6, 3, "tree"));
  spawnAt(80, -98, "alley");
  const station = {
    rect: { minX: PD.x0 - 0.2, maxX: PD.x1 + 0.2, minZ: PD.z0 - 0.2, maxZ: PD.z1 + 0.2 },
    door: { x: 82.5, z: -76.6, yaw: 0 },
    alley: { x: 86, z: -97.6, yaw: -Math.PI / 2 },
    cells,
  };

  // ---- road network for cop cars (centre lines: ring A, ring B, the connectors) -----------------
  const rn: { x: number; z: number }[] = [];
  const rnId = (x: number, z: number) => { let i = rn.findIndex((n) => n.x === x && n.z === z); if (i < 0) { i = rn.length; rn.push({ x, z }); } return i; };
  const redges: [number, number][] = [];
  const rlink = (ax: number, az: number, bx: number, bz: number) => redges.push([rnId(ax, az), rnId(bx, bz)]);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as [number, number][]) {
    // ring A: corner to the next corner (counter-clockwise order)
    rlink(sx * RA, sz * RA, sx === sz ? sx * RA : -sx * RA, sx === sz ? -sz * RA : sz * RA);
    // connectors from the ring A corner out to ring B (one along x, one along z)
    rlink(sx * RA, sz * RA, sx * RA, sz * RB);
    rlink(sx * RA, sz * RA, sx * RB, sz * RA);
    // ring B pieces around this corner
    rlink(sx * RB, sz * RB, sx * RA, sz * RB);
    rlink(sx * RB, sz * RB, sx * RB, sz * RA);
  }
  // ring B middles (between the two connectors on each side)
  rlink(-RA, RB, RA, RB); rlink(-RA, -RB, RA, -RB); rlink(RB, -RA, RB, RA); rlink(-RB, -RA, -RB, RA);
  const roadGraph = { nodes: rn, edges: redges };

  // ---- traffic: two-way loops on both rings (right-hand lanes) --------------------------------
  const loop = (id: string, h: number, ccw: boolean, cars: number, speed: number): TrafficLoop => ({
    id, cars, speed,
    points: ccw ? [{ x: -h, z: -h }, { x: h, z: -h }, { x: h, z: h }, { x: -h, z: h }] : [{ x: -h, z: -h }, { x: -h, z: h }, { x: h, z: h }, { x: h, z: -h }],
  });
  const traffic = [loop("A-ccw", RA + 2, true, 3, 9), loop("A-cw", RA - 2, false, 3, 9), loop("B-ccw", RB + 2, true, 4, 11), loop("B-cw", RB - 2, false, 4, 11)];

  // ---- event geometry -------------------------------------------------------------------------
  const truckRoutes = [
    { name: "NORTH", ax: -76, az: RB - 2, bx: 76, bz: RB - 2 },
    { name: "SOUTH", ax: 76, az: -RB + 2, bx: -76, bz: -RB + 2 },
    { name: "EAST", ax: RB - 2, az: 76, bx: RB - 2, bz: -76 },
    { name: "WEST", ax: -RB + 2, az: -76, bx: -RB + 2, bz: 76 },
  ];
  const happyZones = [
    { x: 0, z: 0, r: 20, name: "the Plaza" },
    { x: 50, z: 50, r: 14, name: "the North-East block" },
    { x: -50, z: 50, r: 14, name: "the North-West block" },
    { x: 50, z: -50, r: 14, name: "the South-East block" },
    { x: -50, z: -50, r: 14, name: "the South-West block" },
  ];
  const airdropSpots: [number, number][] = [[12, 12], [-12, 12], [12, -12], [-12, -12], [0, 15], [15, 0], [0, -15], [-15, 0]];

  const spawns = forts.map((f) => ({ x: f.padX, z: f.padZ, yaw: f.yaw }));
  const landmarks = {
    ledge09: { x: -94, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge14: { x: -89, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    ledge195: { x: -84, z: ledgeZ - 2.2, yaw: 0, frontZ: ledgeZ - 1 },
    tunnelEntrance: { x: -93.5, z: -84, yaw: Math.PI / 2, roofStartX: -91, roofEndX: -85 },
    plaza: { x: 0, z: -10, yaw: 0 },
    /** 40+ m of clear paving heading north (sprint / slide tests) */
    runway: { x: -16, z: -21, yaw: 0 },
    /** open spots in the plaza, clear for ~6 m in +z (loot / punch tests) */
    spotA: { x: -16, z: -8, yaw: 0 },
    spotB: { x: -8, z: -8, yaw: 0 },
    spotC: { x: -16, z: 5, yaw: 0 },
  };
  const navLines = [-75.5, -64.5, -50, -35.5, -24.5, -16, -8, 0, 8, 16, 24.5, 35.5, 50, 64.5, 75.5];

  return {
    halfSize: HALF, boxes, spawns, lootSpawns: loot, forts, landmarks, roads, crosswalks, navLines, props,
    shops, traffic, truckRoutes, happyZones, airdropSpots, decor, station, roadGraph,
  };
}
````

## FILE: shared/src/constants.ts

````ts
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
export const PLAYER = {
  radius: 0.38,
  height: 1.7,
  crouchHeight: 1.15,
  eyeHeight: 1.55,
  crouchEyeHeight: 1.0,
  slideEyeHeight: 0.75,

  walkSpeed: 5.0,
  sprintSpeed: 7.8,
  crouchSpeed: 2.3,
  backwardFactor: 0.75,
  groundAccel: 20, // lower = heavier (0 -> walk speed in ~0.25 s)
  groundDecel: 17, // stopping from a sprint takes ~0.45 s: slight skid
  airAccel: 5, // limited steering in the air
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
  slideMinSpeed: 6.0,
  slideSpeed: 9.4,
  slideTime: 0.85,
  slideFriction: 6.5,
  slideSteer: 3,
  slideCooldown: 1.0,
  slideStamina: 0.1,

  // Dodge / dive
  dodgeSpeed: 10.5,
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
````

## FILE: shared/src/index.ts

````ts
export * from "./constants.js";
export * from "./arena.js";
export * from "./movement.js";
export * from "./protocol.js";
export * from "./names.js";
export * from "./loot.js";
export * from "./itemPhysics.js";
export * from "./city.js";
export * from "./world.js";
export * from "./snapshot.js";
export * from "./npc.js";
export * from "./navgraph.js";
export * from "./npcSim.js";
export * from "./match.js";
export * from "./props.js";
export * from "./traffic.js";
export * from "./police.js";
export * from "./lockpick.js";
````

## FILE: shared/src/itemPhysics.ts

````ts
// Simple, deterministic physics for loose items (thrown, dropped, bouncing).
// Items are spheres for collision (cheap and stable); they look like TVs and chickens.
// Shared by the server and solo mode, and by the client to predict your own throws.
import { nearBoxes, type ArenaLayout, type Box } from "./arena.js";

export interface ItemBody {
  x: number; y: number; z: number; // centre of the collision sphere
  vx: number; vy: number; vz: number;
  rot: number; // visual yaw
  spin: number; // visual spin speed (rad/s)
  resting: boolean;
}

export const ITEM_GRAVITY = 24;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface ItemStepResult {
  /** strongest impact speed this step (for sounds/dust), 0 if none */
  impact: number;
  outOfBounds: boolean;
}

/** Push a sphere out of a box. Returns the contact normal's y (1 = standing on top) or null. */
function collideSphereBox(b: ItemBody, r: number, box: Box, bounce: number, out: { impact: number }): number | null {
  const minX = box.x - box.w / 2, maxX = box.x + box.w / 2;
  const minY = box.y - box.h / 2, maxY = box.y + box.h / 2;
  const minZ = box.z - box.d / 2, maxZ = box.z + box.d / 2;
  const cx = clamp(b.x, minX, maxX), cy = clamp(b.y, minY, maxY), cz = clamp(b.z, minZ, maxZ);
  let dx = b.x - cx, dy = b.y - cy, dz = b.z - cz;
  let d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= r * r) return null;
  let nx: number, ny: number, nz: number, pen: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    nx = dx / d; ny = dy / d; nz = dz / d;
    pen = r - d;
  } else {
    // centre inside the box: leave along the shallowest face (prefer up)
    const faces = [
      { n: [0, 1, 0], p: maxY - b.y }, { n: [0, -1, 0], p: b.y - minY },
      { n: [1, 0, 0], p: maxX - b.x }, { n: [-1, 0, 0], p: b.x - minX },
      { n: [0, 0, 1], p: maxZ - b.z }, { n: [0, 0, -1], p: b.z - minZ },
    ];
    let best = faces[0];
    for (const f of faces) if (f.p < best.p) best = f;
    [nx, ny, nz] = best.n;
    pen = best.p + r;
  }
  b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) {
    out.impact = Math.max(out.impact, -vn);
    // reflect the normal part with bounciness, damp the sliding part a little
    b.vx -= (1 + bounce) * vn * nx;
    b.vy -= (1 + bounce) * vn * ny;
    b.vz -= (1 + bounce) * vn * nz;
    b.vx *= 0.85; b.vz *= 0.85;
    b.spin *= 0.7;
  }
  return ny;
}

/**
 * Advance a loose item one step. Mutates `b`.
 * Returns the strongest impact (for effects) and whether it left the world.
 */
export function stepItem(b: ItemBody, radius: number, bounce: number, arena: ArenaLayout, dt: number): ItemStepResult {
  const res = { impact: 0, outOfBounds: false };
  if (b.resting) return res;
  b.vy -= ITEM_GRAVITY * dt;
  // Sub-step fast items so they can't tunnel through thin walls
  const speed = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.min(8, Math.max(1, Math.ceil((speed * dt) / (radius * 0.5))));
  const h = dt / n;
  let supported = false;
  const boxes = nearBoxes(arena, b.x, b.z, radius + speed * dt + 1.5);
  for (let i = 0; i < n; i++) {
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    for (const box of boxes) {
      const ny = collideSphereBox(b, radius, box, bounce, res);
      if (ny !== null && ny > 0.7) supported = true;
    }
    if (b.y - radius < 0) {
      b.y = radius;
      if (b.vy < 0) {
        res.impact = Math.max(res.impact, -b.vy);
        b.vy = -b.vy * bounce;
        b.vx *= 0.8; b.vz *= 0.8;
        b.spin *= 0.6;
      }
      supported = true;
    }
  }
  b.rot += b.spin * dt;
  if (supported) {
    // ground friction
    const f = Math.max(0, 1 - 6 * dt);
    b.vx *= f; b.vz *= f;
    if (Math.abs(b.vy) < 0.8 && Math.hypot(b.vx, b.vz) < 0.15) {
      b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
      b.resting = true;
    }
  }
  const lim = arena.halfSize + 2;
  if (!Number.isFinite(b.x + b.y + b.z) || b.y < -5 || Math.abs(b.x) > lim || Math.abs(b.z) > lim) res.outOfBounds = true;
  return res;
}

/** Wake an item up (it was moved, or something under it changed). */
export function wakeItem(b: ItemBody) {
  b.resting = false;
}
````

## FILE: shared/src/lockpick.ts

````ts
// Phase 4 jail break: a lock-picking minigame that's different every time you're locked up.
//
// The lock has 4-6 pins. Only ONE pin "binds" at a time (a random order per lock): select it
// (A/D) and it trembles; select a loose pin and it just rattles. The selected pin bounces up and
// down in its channel with its own rhythm (smooth, rush, wobble or dash) and you press SPACE when
// it is inside its green band (the shear line) to set it.
//   - Wrong pin or bad timing = a slip: the last pin you set drops again, and it makes noise.
//   - 3 slips close together = the guard hears you: all pins drop and you're locked out for 4 s.
//   - Once the first pin is set the tension wrench is on: set the rest before it gives out
//     (a random 12-17 s) or every pin drops.
// A press counts if the pin was in the green at any moment in the last 0.09 s (LOCK.grace): people
// react a little late, and without that a perfectly-timed-looking click often "didn't register".
// Everything is a pure function of the lock seed and the press times, so the server replays the
// player's presses on its own copy and agrees exactly on when the lock opens.

export type PinPattern = "smooth" | "rush" | "wobble" | "dash";
export interface LockPin { pattern: PinPattern; freq: number; phase: number; lo: number; hi: number; }
export interface LockDef { seed: number; pins: LockPin[]; order: number[]; tension: number; }

export const LOCK = {
  slipsToGuard: 3, // noise level that brings the guard
  noiseDecay: 4, // seconds after your last slip before one noise point fades
  lockout: 4, // seconds the guard makes you stop
  /** a press counts if the pin was in the green at any moment in the last 0.09 s (human reaction + a frame or two) */
  grace: 0.09,
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PATTERNS: PinPattern[] = ["smooth", "rush", "wobble", "dash"];

export function makeLock(seed: number): LockDef {
  const r = rng(seed * 7919 + 17);
  const n = 4 + Math.floor(r() * 3); // 4..6 pins
  const pins: LockPin[] = [];
  for (let i = 0; i < n; i++) {
    const pattern = PATTERNS[Math.floor(r() * PATTERNS.length)];
    const freq = (pattern === "dash" ? 0.55 : pattern === "rush" ? 0.5 : 0.6) + r() * 0.45; // cycles per second
    const width = 0.12 + r() * 0.05;
    // dash pins only spend time near the top, so their band sits high
    const centre = pattern === "dash" ? 0.72 + r() * 0.16 : 0.4 + r() * 0.45;
    pins.push({ pattern, freq, phase: r(), lo: Math.max(0.08, centre - width / 2), hi: Math.min(0.97, centre + width / 2) });
  }
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const tension = 5 + n * 1.5 + r() * 2;
  return { seed, pins, order, tension };
}

/** Height of a pin in its channel (0 = bottom, 1 = top) at lock time t (seconds). */
export function pinPos(pin: LockPin, t: number): number {
  const u = t * pin.freq + pin.phase;
  const f = u - Math.floor(u);
  switch (pin.pattern) {
    case "smooth": return 0.5 - 0.5 * Math.cos(Math.PI * 2 * u);
    case "rush": { // snaps up, sinks slowly
      if (f < 0.28) { const k = f / 0.28; return 1 - (1 - k) * (1 - k); }
      return 1 - (f - 0.28) / 0.72;
    }
    case "wobble": return Math.max(0, Math.min(1, 0.5 - 0.42 * Math.cos(Math.PI * 2 * u) + 0.08 * Math.sin(Math.PI * 2 * 3.3 * u)));
    case "dash": { // sits low, then darts up and back
      if (f < 0.5) return 0.04;
      return 0.04 + 0.95 * Math.sin(Math.PI * ((f - 0.5) / 0.5));
    }
  }
}

export interface LockRun {
  def: LockDef;
  set: number; // pins set so far (in binding order)
  noise: number;
  noiseT: number; // time of the last slip (noise fades from here)
  tryT: number; // when the current attempt started (first pin set)
  lockUntil: number; // guard lockout ends
  lastT: number;
  solved: boolean;
  slips: number;
}

export type LockResult = "set" | "slip" | "wrong" | "guard" | "locked" | "solved" | "ignored";

export function newLockRun(seed: number): LockRun {
  return { def: makeLock(seed), set: 0, noise: 0, noiseT: 0, tryT: 0, lockUntil: 0, lastT: 0, solved: false, slips: 0 };
}

/** The pin that is binding right now (the only one that can be set). */
export function bindingPin(run: LockRun): number { return run.def.order[Math.min(run.set, run.def.order.length - 1)]; }

/** Seconds of tension left in this attempt (Infinity before the first pin is set). */
export function tensionLeft(run: LockRun, t: number): number {
  return run.set > 0 ? run.def.tension - (t - run.tryT) : Infinity;
}

/** Advance timers: noise fades, tension runs out. Returns "tension" when the pins just dropped. */
export function lockUpdate(run: LockRun, t: number): "tension" | null {
  if (run.solved) return null;
  while (run.noise > 0 && t - run.noiseT >= LOCK.noiseDecay) { run.noise--; run.noiseT += LOCK.noiseDecay; }
  if (run.set > 0 && t - run.tryT > run.def.tension) { run.set = 0; return "tension"; }
  return null;
}

/** Try to set a pin at lock time t. */
export function lockPress(run: LockRun, pin: number, t: number): LockResult {
  if (run.solved || !Number.isInteger(pin) || pin < 0 || pin >= run.def.pins.length || !Number.isFinite(t) || t < run.lastT - 1e-6) return "ignored";
  run.lastT = t;
  if (t < run.lockUntil) return "locked";
  lockUpdate(run, t);
  const want = bindingPin(run);
  const p = run.def.pins[pin];
  let inBand = false;
  for (let d = 0; d <= LOCK.grace + 1e-9 && !inBand; d += 0.02) { const q = pinPos(p, t - d); inBand = q >= p.lo && q <= p.hi; }
  if (pin === want && inBand) {
    if (run.set === 0) run.tryT = t;
    run.set++;
    if (run.set >= run.def.pins.length) { run.solved = true; return "solved"; }
    return "set";
  }
  run.slips++;
  run.set = Math.max(0, run.set - 1);
  run.noise++;
  run.noiseT = t;
  if (run.noise >= LOCK.slipsToGuard) {
    run.lockUntil = t + LOCK.lockout;
    run.set = 0; run.noise = 0;
    return "guard";
  }
  return pin === want ? "slip" : "wrong";
}
````

## FILE: shared/src/loot.ts

````ts
// The loot catalog. Every item's rules live here, shared by server, solo mode and the renderer.

export type SizeClass = "small" | "big" | "giant";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Material = "rubber" | "plastic" | "cloth" | "glass" | "metal" | "cardboard" | "trash";

export interface LootDef {
  type: string;
  name: string;
  /** small = pocketable, big = both hands, giant = needs two players */
  size: SizeClass;
  rarity: Rarity;
  valueMin: number;
  valueMax: number;
  /** Mystery items show "???" until sold. Value may be wildly different. */
  mystery?: boolean;
  /** 0..1 speed penalty while carried (0.35 = 35% slower). */
  weight: number;
  /** Heavy items stop you sprinting and dodging. */
  heavy?: boolean;
  material: Material;
  /** collision sphere radius (m) and bounciness */
  radius: number;
  bounce: number;
  /** relative chance to spawn */
  spawnWeight: number;
  /** a line of flavour text for the look prompt */
  blurb: string;
  /** only ever dropped by pedestrians (never spawns loose in the city) */
  npcOnly?: boolean;
}

export const LOOT: LootDef[] = [
  // ---- small (pocketable) -----------------------------------------------------------
  { type: "rubber_chicken", name: "Rubber Chicken", size: "small", rarity: "common", valueMin: 4, valueMax: 10, weight: 0, material: "rubber", radius: 0.18, bounce: 0.65, spawnWeight: 10, blurb: "Squeaks with regret." },
  { type: "mixtape", name: "Mysterious Mixtape", size: "small", rarity: "common", valueMin: 6, valueMax: 14, weight: 0, material: "plastic", radius: 0.12, bounce: 0.3, spawnWeight: 9, blurb: "Side B is just screaming." },
  { type: "cursed_sneakers", name: "Cursed Sneakers", size: "small", rarity: "uncommon", valueMin: 18, valueMax: 40, weight: 0, material: "cloth", radius: 0.2, bounce: 0.2, spawnWeight: 6, blurb: "Still warm. Nobody knows why." },
  { type: "snow_globe", name: "Suspicious Snow Globe", size: "small", rarity: "rare", valueMin: 45, valueMax: 90, weight: 0, material: "glass", radius: 0.16, bounce: 0.25, spawnWeight: 3, blurb: "There's a tiny box fort inside." },
  { type: "lucky_pigeon", name: "Lucky Pigeon Statue", size: "small", rarity: "epic", valueMin: 110, valueMax: 220, weight: 0.05, material: "metal", radius: 0.2, bounce: 0.15, spawnWeight: 1.2, blurb: "Blessed by the Pigeon Council." },
  { type: "golden_spork", name: "Golden Spork", size: "small", rarity: "legendary", valueMin: 260, valueMax: 520, weight: 0, material: "metal", radius: 0.14, bounce: 0.3, spawnWeight: 0.4, blurb: "Spoon. Fork. Destiny." },

  // ---- big (both hands) -------------------------------------------------------------
  { type: "traffic_cone", name: "Traffic Cone", size: "big", rarity: "common", valueMin: 8, valueMax: 16, weight: 0.05, material: "plastic", radius: 0.3, bounce: 0.35, spawnWeight: 9, blurb: "Borrowed. Permanently." },
  { type: "cardboard_cutout", name: "Cardboard Cutout of a Stranger", size: "big", rarity: "common", valueMin: 10, valueMax: 22, weight: 0.1, material: "cardboard", radius: 0.35, bounce: 0.15, spawnWeight: 7, blurb: "Who is this guy? He's everywhere." },
  { type: "trash_bag", name: "Suspiciously Valuable Trash", size: "big", rarity: "common", valueMin: 2, valueMax: 12, mystery: true, weight: 0.1, material: "trash", radius: 0.35, bounce: 0.1, spawnWeight: 8, blurb: "It's... jingling?" },
  { type: "gold_sign", name: "\"WE BUY GOLD\" Sign", size: "big", rarity: "uncommon", valueMin: 20, valueMax: 45, weight: 0.15, material: "metal", radius: 0.4, bounce: 0.2, spawnWeight: 5, blurb: "They did not, in fact, buy gold." },
  { type: "crt_tv", name: "Old CRT TV", size: "big", rarity: "uncommon", valueMin: 30, valueMax: 60, weight: 0.35, heavy: true, material: "glass", radius: 0.4, bounce: 0.1, spawnWeight: 5, blurb: "Weighs as much as a small car." },
  { type: "giant_toaster", name: "Giant Toaster", size: "big", rarity: "rare", valueMin: 60, valueMax: 120, weight: 0.4, heavy: true, material: "metal", radius: 0.42, bounce: 0.15, spawnWeight: 2.5, blurb: "Toasts one (1) mattress." },
  { type: "mystery_suitcase", name: "Mystery Suitcase", size: "big", rarity: "rare", valueMin: 20, valueMax: 200, mystery: true, weight: 0.2, material: "cloth", radius: 0.38, bounce: 0.15, spawnWeight: 2.5, blurb: "Locked. Rattling. Promising." },

  // ---- giant (two players) ------------------------------------------------------------
  { type: "arcade_machine", name: "Broken Arcade Machine", size: "giant", rarity: "epic", valueMin: 180, valueMax: 320, weight: 0.4, heavy: true, material: "metal", radius: 0.65, bounce: 0.05, spawnWeight: 1, blurb: "High score held by a raccoon. Needs two." },
  { type: "rubber_duck", name: "Giant Rubber Duck", size: "giant", rarity: "legendary", valueMin: 300, valueMax: 600, weight: 0.4, heavy: true, material: "rubber", radius: 0.75, bounce: 0.5, spawnWeight: 0.5, blurb: "Escaped from a parade. Needs two." },

  // ---- pedestrian drops (Phase 2.5): "low but funny", with the occasional surprise ----
  { type: "half_sandwich", name: "Half a Sandwich", size: "small", rarity: "common", valueMin: 1, valueMax: 4, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "The good half. Allegedly." },
  { type: "pocket_lint", name: "Pocket Lint Collection", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "cloth", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Curated over many years." },
  { type: "expired_coupon", name: "Expired Coupon", size: "small", rarity: "common", valueMin: 1, valueMax: 5, weight: 0, material: "cardboard", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "10% off one (1) soup. Expired 1998." },
  { type: "wrong_map", name: "Tourist Map (Wrong)", size: "small", rarity: "common", valueMin: 2, valueMax: 6, weight: 0, material: "cardboard", radius: 0.12, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Trashington is apparently in the sea." },
  { type: "bread_crumbs", name: "Bag of Bread Crumbs", size: "small", rarity: "common", valueMin: 1, valueMax: 2, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Pigeon currency." },
  { type: "protein_shaker", name: "Protein Shaker", size: "small", rarity: "common", valueMin: 5, valueMax: 12, weight: 0, material: "plastic", radius: 0.13, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Smells like chalk and ambition." },
  { type: "disposable_camera", name: "Disposable Camera", size: "small", rarity: "common", valueMin: 8, valueMax: 20, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "27 photos of pigeons." },
  { type: "mime_beret", name: "Mime Beret", size: "small", rarity: "uncommon", valueMin: 6, valueMax: 14, weight: 0, material: "cloth", radius: 0.12, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "..." },
  { type: "plastic_badge", name: "Plastic Security Badge", size: "small", rarity: "uncommon", valueMin: 8, valueMax: 18, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Authority: very limited." },
  { type: "fancy_earbuds", name: "Fancy Earbuds", size: "small", rarity: "uncommon", valueMin: 20, valueMax: 45, weight: 0, material: "plastic", radius: 0.08, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Still playing a motivational podcast." },
  { type: "bedazzled_phone", name: "Bedazzled Phone", size: "small", rarity: "uncommon", valueMin: 25, valueMax: 60, weight: 0, material: "glass", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "4 million followers. Still live." },
  { type: "mystery_wallet", name: "Mystery Wallet", size: "small", rarity: "uncommon", valueMin: 5, valueMax: 80, mystery: true, weight: 0, material: "cloth", radius: 0.1, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Could be anything. Probably receipts." },
  // Phase 3.5: loot from shops, dumpsters, smashed props and parked cars (never spawns on the street by itself)
  { type: "phone_handset", name: "Payphone Handset", size: "small", rarity: "uncommon", valueMin: 12, valueMax: 30, weight: 0, material: "plastic", radius: 0.12, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Still has a dial tone. Somehow." },
  { type: "candy_bar", name: "Candy Bar", size: "small", rarity: "common", valueMin: 2, valueMax: 5, weight: 0, material: "plastic", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Mostly nougat. Mostly." },
  { type: "soda_can", name: "Soda Can", size: "small", rarity: "common", valueMin: 2, valueMax: 4, weight: 0, material: "metal", radius: 0.09, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Pre-shaken for your enjoyment." },
  { type: "coin_pile", name: "Loose Change", size: "small", rarity: "common", valueMin: 3, valueMax: 12, weight: 0, material: "metal", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Jingles with possibility." },
  { type: "newspaper", name: "Yesterday's Newspaper", size: "small", rarity: "common", valueMin: 1, valueMax: 3, weight: 0, material: "cloth", radius: 0.14, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Headline: LOCAL BANDIT STRIKES AGAIN." },
  { type: "cash_bundle", name: "Bundle of Cash", size: "small", rarity: "rare", valueMin: 40, valueMax: 90, weight: 0, material: "cloth", radius: 0.1, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Smells like crime." },
  { type: "cash_register", name: "Cash Register", size: "big", rarity: "epic", valueMin: 150, valueMax: 260, weight: 0.5, heavy: true, material: "metal", radius: 0.38, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "The whole till. Very subtle." },
  { type: "laptop", name: "Laptop", size: "big", rarity: "rare", valueMin: 60, valueMax: 140, weight: 0.2, material: "plastic", radius: 0.3, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "37 tabs open. All recipes." },
  { type: "sunglasses", name: "Designer Sunglasses", size: "small", rarity: "uncommon", valueMin: 10, valueMax: 25, weight: 0, material: "plastic", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Designed by someone, definitely." },
  { type: "canned_beans", name: "Canned Beans", size: "small", rarity: "common", valueMin: 3, valueMax: 6, weight: 0, material: "metal", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "The currency of the streets." },
  // Phase 4.5 big-shot jackpots (worth the heat)
  { type: "gold_bar", name: "Gold Bar", size: "small", rarity: "legendary", valueMin: 160, valueMax: 260, weight: 0, material: "metal", radius: 0.12, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "The millionaire's paperweight." },
  { type: "diamond_ring", name: "Diamond Ring", size: "small", rarity: "legendary", valueMin: 140, valueMax: 300, weight: 0, material: "metal", radius: 0.08, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Big enough to see from space." },
  { type: "money_bag", name: "Bank Money Bag", size: "big", rarity: "legendary", valueMin: 250, valueMax: 400, weight: 0.55, heavy: true, material: "cloth", radius: 0.32, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "It has a dollar sign on it. Nobody will notice." },
  { type: "award_trophy", name: "Golden Award", size: "big", rarity: "epic", valueMin: 120, valueMax: 220, weight: 0.3, material: "metal", radius: 0.26, bounce: 0.1, spawnWeight: 0, npcOnly: true, blurb: "Best Actor in a Supporting Commercial." },
  { type: "hardware_wallet", name: "Crypto Wallet", size: "small", rarity: "epic", valueMin: 0, valueMax: 500, mystery: true, weight: 0, material: "plastic", radius: 0.08, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Worth a fortune. Or nothing. Password: probably 'password'." },
  { type: "donut", name: "Evidence Donut", size: "small", rarity: "uncommon", valueMin: 12, valueMax: 25, weight: 0, material: "cloth", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Taken from a sleeping cop. Bold." },
  { type: "energy_drink", name: "Energy Drink", size: "small", rarity: "common", valueMin: 4, valueMax: 8, weight: 0, material: "metal", radius: 0.09, bounce: 0.4, spawnWeight: 0, npcOnly: true, blurb: "Tastes like a battery." },
  { type: "lottery_ticket", name: "Lottery Ticket", size: "small", rarity: "rare", valueMin: 1, valueMax: 250, weight: 0, material: "cloth", radius: 0.1, bounce: 0.05, spawnWeight: 0, npcOnly: true, mystery: true, blurb: "Scratch later. Dream now." },
  { type: "fancy_cheese", name: "Fancy Cheese Wheel", size: "small", rarity: "rare", valueMin: 25, valueMax: 60, weight: 0, material: "cloth", radius: 0.13, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Aged longer than the Mayor." },
  { type: "gold_chain", name: "Gold Chain", size: "small", rarity: "epic", valueMin: 90, valueMax: 180, weight: 0, material: "metal", radius: 0.1, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Heavy. Shiny. Questionable." },
  { type: "guitar", name: "Pawned Guitar", size: "big", rarity: "uncommon", valueMin: 30, valueMax: 70, weight: 0.15, material: "cardboard", radius: 0.45, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Knows one chord." },
  { type: "bagel", name: "Everything Bagel", size: "small", rarity: "common", valueMin: 2, valueMax: 5, weight: 0, material: "cloth", radius: 0.1, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Has everything except hope." },
  { type: "baguette", name: "Baguette", size: "small", rarity: "common", valueMin: 3, valueMax: 6, weight: 0, material: "cloth", radius: 0.14, bounce: 0.2, spawnWeight: 0, npcOnly: true, blurb: "Also a sword." },
  { type: "birthday_cake", name: "Birthday Cake", size: "big", rarity: "rare", valueMin: 40, valueMax: 90, weight: 0.1, material: "cloth", radius: 0.3, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Happy birthday, Gary." },
  // Phase 3 event loot (never spawns normally): the airdrop crate parachutes into the plaza
  { type: "airdrop_crate", name: "Airdrop Crate", size: "giant", rarity: "legendary", valueMin: 350, valueMax: 600, weight: 0.4, heavy: true, material: "cardboard", radius: 0.75, bounce: 0.05, spawnWeight: 0, npcOnly: true, blurb: "Care package from nobody. Needs two." },
  { type: "rolecks_watch", name: "Rolecks Watch", size: "small", rarity: "epic", valueMin: 150, valueMax: 300, weight: 0, material: "metal", radius: 0.09, bounce: 0.3, spawnWeight: 0, npcOnly: true, blurb: "Genuine imitation luxury." },
];

export const LOOT_BY_TYPE: Record<string, LootDef> = Object.fromEntries(LOOT.map((d) => [d.type, d]));

export function lootDef(type: string): LootDef {
  const d = LOOT_BY_TYPE[type];
  if (!d) throw new Error("unknown loot type " + type);
  return d;
}

export const RARITY_COLOR: Record<Rarity | "mystery", string> = {
  common: "#b9b4c2",
  uncommon: "#5fe07a",
  rare: "#39a8ff",
  epic: "#b36bff",
  legendary: "#ffcf3a",
  mystery: "#ffffff",
};

/** Rare-and-up items (and non-common mystery items) twinkle with a small sparkle. */
export function hasSparkle(def: LootDef): boolean {
  return def.rarity === "rare" || def.rarity === "epic" || def.rarity === "legendary" || !!def.mystery && def.rarity !== "common";
}

/** Speed multiplier while carrying (1 = no penalty). Giant items depend on carrier count. */
export function carrySpeedMul(def: LootDef, carriers = 1): number {
  if (def.size === "giant") return carriers >= 2 ? 0.65 : 0.3;
  return 1 - def.weight;
}

/** Deterministic value roll. Suspicious trash has a 10% chance to be secretly valuable. */
export function rollValue(def: LootDef, rand: () => number): number {
  if (def.type === "trash_bag" && rand() < 0.1) return 120 + Math.floor(rand() * 60);
  return Math.round(def.valueMin + rand() * (def.valueMax - def.valueMin));
}
````

## FILE: shared/src/match.ts

````ts
// Phase 3: the round loop + city events. Runs inside the World (server + solo).
//
//   lobby --START--> intro (5 s) --> scavenge (3 min) --> tally (12 s) --> intro ... --> over
//
// Banking (Blake's rule): loot resting in YOUR fort yard locks in 10 s after you drop it there.
// Until then anyone can sneak in and steal it back. At time-up, anything you're still carrying
// outside your fort is LOST; loot in your yard (locked or not) is cashed in.
import { fortAt } from "./arena.js";
import type { World, ItemSim, PlayerSim } from "./world.js";

export type MatchPhase = "lobby" | "intro" | "scavenge" | "tally" | "over";
export type CityEventKind = "airdrop" | "truck" | "happyhour" | "raccoons";

export const ROUNDS = 3;
export const ROUND_TIME = 180;
export const INTRO_TIME = 5;
export const TALLY_TIME = 12;
export const LOCK_TIME = 10;
export const HOME_WARNING = 30;

export const TRUCK_SPEED = 8;
export const TRUCK_LEN = 5.5;
export const TRUCK_WIDTH = 2.6;
export const HAPPY_HOUR_TIME = 30;
const EVENT_WARN = 5;

export interface RoundLine {
  id: string; name: string; colorIdx: number;
  banked: number; bankedValue: number; // cashed in this round
  lost: number; lostValue: number; // carried outside the fort at time-up
  stolen: number; // items raccoons got away with
  cash: number; // total after this round
}

/** What clients need to show the current event. */
export interface EventView {
  kind: CityEventKind | "";
  stage: "warn" | "live" | "";
  x: number; z: number; r: number; // marker / zone
  timeLeft: number;
  // garbage truck
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}

interface ActiveEvent {
  kind: CityEventKind;
  stage: "warn" | "live";
  t: number; // time in this stage
  x: number; z: number; r: number;
  // truck
  ax?: number; az?: number; bx?: number; bz?: number; dist?: number;
  crate?: string;
}

const DEFAULT_HAPPY_ZONES = [
  { x: 0, z: 0, r: 13, name: "the Plaza" },
  { x: 26, z: 26, r: 12, name: "the North-East block" },
  { x: -26, z: 26, r: 12, name: "the North-West block" },
  { x: 26, z: -26, r: 12, name: "the South-East block" },
  { x: -26, z: -26, r: 12, name: "the South-West block" },
];
/** Garbage truck routes: the ring road in front of the forts (N, S, E, W), driven end to end. */
const DEFAULT_TRUCK_ROUTES = [
  { name: "NORTH", ax: -47, az: 42, bx: 47, bz: 42 },
  { name: "SOUTH", ax: 47, az: -42, bx: -47, bz: -42 },
  { name: "EAST", ax: 42, az: 47, bx: 42, bz: -47 },
  { name: "WEST", ax: -42, az: -47, bx: -42, bz: 47 },
];
const DEFAULT_AIRDROP_SPOTS: [number, number][] = [[7, 7], [-7, 7], [7, -7], [-7, -7], [0, 9], [9, 0], [0, -9], [-9, 0]];

export class MatchSystem {
  phase: MatchPhase = "lobby";
  round = 0;
  timeLeft = 0;
  results: RoundLine[] = [];
  private warned = false;
  private plan: { at: number; kind: CityEventKind }[] = [];
  ev: ActiveEvent | null = null;
  truck = { on: false, x: 0, z: 0, yaw: 0 };

  constructor(private w: World) {}

  // event geometry comes from the city layout (falls back to the old small city's values)
  private get truckRoutes() { return this.w.arena.truckRoutes ?? DEFAULT_TRUCK_ROUTES; }
  private get happyZones() { return this.w.arena.happyZones ?? DEFAULT_HAPPY_ZONES; }
  private get airdropSpots() { return this.w.arena.airdropSpots ?? DEFAULT_AIRDROP_SPOTS; }

  /** Host pressed START (also used to restart after the final results). */
  start(): boolean {
    if (this.phase !== "lobby" && this.phase !== "over") return false;
    for (const p of this.w.players.values()) p.cash = 0;
    this.round = 0;
    this.results = [];
    this.nextRound();
    return true;
  }

  get elapsed() { return this.phase === "scavenge" ? ROUND_TIME - this.timeLeft : 0; }

  private nextRound() {
    this.round++;
    this.phase = "intro";
    this.timeLeft = INTRO_TIME;
    this.warned = false;
    this.w.resetCity();
    this.w.emit({ t: "round", phase: "intro", round: this.round });
  }

  tick(dt: number) {
    if (this.phase === "lobby") return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    switch (this.phase) {
      case "intro":
        if (this.timeLeft <= 0) {
          this.phase = "scavenge";
          this.timeLeft = ROUND_TIME;
          this.planEvents();
          this.w.emit({ t: "round", phase: "scavenge", round: this.round });
        }
        break;
      case "scavenge":
        this.bankTick(dt);
        this.eventTick(dt);
        if (!this.warned && this.timeLeft <= HOME_WARNING) { this.warned = true; this.w.emit({ t: "round", phase: "hurry", round: this.round }); }
        if (this.timeLeft <= 0) this.endRound();
        break;
      case "tally":
        if (this.timeLeft <= 0) {
          if (this.round < ROUNDS) this.nextRound();
          else { this.phase = "over"; this.w.emit({ t: "round", phase: "over", round: this.round }); }
        }
        break;
    }
  }

  // ---------------------------------------------------------------- banking
  ownerOf(slot: number): PlayerSim | undefined {
    if (slot < 0) return undefined;
    for (const p of this.w.players.values()) if (p.colorIdx === slot) return p;
    return undefined;
  }

  private bankTick(dt: number) {
    for (const it of this.w.items.values()) {
      if (it.mode !== "free") { it.bankT = 0; it.locked = false; it.fort = -1; continue; }
      const slot = fortAt(this.w.arena, it.body.x, it.body.z);
      if (slot < 0 || !this.ownerOf(slot)) { it.bankT = 0; it.locked = false; it.fort = -1; continue; }
      if (slot !== it.fort) { it.fort = slot; it.bankT = 0; it.locked = false; }
      if (it.locked) continue;
      it.bankT += dt;
      if (it.bankT >= LOCK_TIME) {
        it.locked = true;
        this.w.emit({ t: "banked", item: it.id, p: this.ownerOf(slot)!.id, value: itemWorth(it) });
      }
    }
  }

  /** Value of locked loot sitting in a player's fort right now (live score). */
  bankedValue(p: PlayerSim): number {
    let v = 0;
    for (const it of this.w.items.values()) if (it.locked && it.fort === p.colorIdx) v += itemWorth(it);
    return v;
  }

  private endRound() {
    this.stopEvent();
    this.w.npc.clearRaccoons();
    const lines = new Map<string, RoundLine>();
    for (const p of this.w.players.values()) {
      lines.set(p.id, { id: p.id, name: p.name, colorIdx: p.colorIdx, banked: 0, bankedValue: 0, lost: 0, lostValue: 0, stolen: p.stolenThisRound, cash: 0 });
    }
    const arena = this.w.arena;
    const home = (p: PlayerSim) => fortAt(arena, p.move.x, p.move.z) === p.colorIdx;
    for (const it of [...this.w.items.values()]) {
      if (it.mode === "held" || it.mode === "pocket") {
        const h = this.w.players.get(it.holder);
        if (!h) continue;
        const line = lines.get(h.id)!;
        if (home(h)) { line.banked++; line.bankedValue += itemWorth(it); }
        else { line.lost++; line.lostValue += itemWorth(it); }
        this.w.items.delete(it.id);
        continue;
      }
      const slot = fortAt(arena, it.body.x, it.body.z);
      const owner = this.ownerOf(slot);
      if (!owner) continue;
      const line = lines.get(owner.id)!;
      line.banked++; line.bankedValue += itemWorth(it);
      this.w.items.delete(it.id);
    }
    for (const p of this.w.players.values()) {
      const line = lines.get(p.id)!;
      p.cash += line.bankedValue;
      line.cash = p.cash;
      p.hand = ""; p.pockets.fill(""); p.stolenThisRound = 0;
      this.w.refreshCarry(p);
      if (line.lost) this.w.emit({ t: "lost", p: p.id, count: line.lost, value: line.lostValue });
    }
    this.results = [...lines.values()].sort((a, b) => b.cash - a.cash);
    this.phase = "tally";
    this.timeLeft = TALLY_TIME;
    this.w.emit({ t: "round", phase: "tally", round: this.round });
  }

  // ---------------------------------------------------------------- events
  /** Escalation: round 1 gets 1 event, round 2 gets 2, round 3+ gets 3, all different kinds. */
  private planEvents() {
    const kinds: CityEventKind[] = ["airdrop", "truck", "happyhour", "raccoons"];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(this.w.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const n = Math.min(3, this.round);
    // spread between 25 s in and 45 s before the end, at least ~35 s apart
    const start = 25, end = ROUND_TIME - 45;
    const span = (end - start) / n;
    this.plan = [];
    for (let i = 0; i < n; i++) this.plan.push({ at: start + span * i + this.w.random() * Math.max(0, span - 35), kind: kinds[i] });
  }

  /** Test/debug: cancel the remaining scheduled events this round. */
  cancelPlannedEvents() { this.plan = []; }

  /** Start an event right now (also used by tests / debug). */
  trigger(kind: CityEventKind) {
    if (this.ev) this.stopEvent();
    const rnd = () => this.w.random();
    if (kind === "airdrop") {
      const [x, z] = this.airdropSpots[Math.floor(rnd() * this.airdropSpots.length)];
      this.ev = { kind, stage: "warn", t: 0, x, z, r: 2.5 };
    } else if (kind === "truck") {
      const r = this.truckRoutes[Math.floor(rnd() * this.truckRoutes.length)];
      this.ev = { kind, stage: "warn", t: 0, x: r.ax, z: r.az, r: 0, ax: r.ax, az: r.az, bx: r.bx, bz: r.bz, dist: 0 };
    } else if (kind === "happyhour") {
      const zn = this.happyZones[Math.floor(rnd() * this.happyZones.length)];
      this.ev = { kind, stage: "warn", t: 0, x: zn.x, z: zn.z, r: zn.r };
    } else {
      this.ev = { kind, stage: "warn", t: 0, x: 0, z: 0, r: 0 };
    }
    this.w.emit({ t: "cityEvent", kind, stage: "warn", x: this.ev.x, z: this.ev.z, detail: this.detail() });
  }

  private detail(): string {
    const e = this.ev;
    if (!e) return "";
    if (e.kind === "truck") return this.truckRoutes.find((r) => r.ax === e.ax && r.az === e.az)?.name ?? "";
    if (e.kind === "happyhour") return this.happyZones.find((z) => z.x === e.x && z.z === e.z)?.name ?? "";
    return "";
  }

  private eventTick(dt: number) {
    const el = this.elapsed;
    if (!this.ev && this.plan.length && el >= this.plan[0].at) this.trigger(this.plan.shift()!.kind);
    const e = this.ev;
    if (!e) return;
    e.t += dt;
    if (e.stage === "warn") {
      if (e.t >= (e.kind === "happyhour" ? 3 : EVENT_WARN)) { e.stage = "live"; e.t = 0; this.goLive(e); }
      return;
    }
    switch (e.kind) {
      case "airdrop": {
        const c = e.crate ? this.w.items.get(e.crate) : undefined;
        if (!c || !c.chute) this.stopEvent(); // landed (or grabbed): the event is done, the crate stays
        break;
      }
      case "truck": this.truckTick(e, dt); break;
      case "happyhour": {
        for (const it of this.w.items.values()) if (it.mode === "free" && it.fort < 0 && inZone(it, e)) it.mult = 2;
        if (e.t >= HAPPY_HOUR_TIME) this.stopEvent();
        break;
      }
      case "raccoons":
        if (this.w.npc.raccoonCount() === 0 || e.t > 60) this.stopEvent();
        break;
    }
  }

  private goLive(e: ActiveEvent) {
    this.w.emit({ t: "cityEvent", kind: e.kind, stage: "live", x: e.x, z: e.z, detail: this.detail() });
    if (e.kind === "airdrop") {
      e.crate = this.w.placeItem("airdrop_crate", e.x, 38, e.z);
      const c = this.w.items.get(e.crate)!;
      c.chute = true;
      this.w.emit({ t: "spawn", item: c.id });
    } else if (e.kind === "truck") {
      this.truck.on = true; this.truck.x = e.ax!; this.truck.z = e.az!;
      this.truck.yaw = Math.atan2(e.bx! - e.ax!, e.bz! - e.az!);
    } else if (e.kind === "happyhour") {
      // a few bonus goodies appear in the zone
      for (let i = 0; i < 4; i++) {
        const a = this.w.random() * Math.PI * 2, d = this.w.random() * e.r * 0.7;
        this.w.spawnAt(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d);
      }
    } else if (e.kind === "raccoons") {
      for (const p of this.w.players.values()) if (p.connected) this.w.npc.spawnRaccoon(p.colorIdx);
    }
  }

  private truckTick(e: ActiveEvent, dt: number) {
    const total = Math.hypot(e.bx! - e.ax!, e.bz! - e.az!);
    e.dist! += TRUCK_SPEED * dt;
    const k = Math.min(1, e.dist! / total);
    const tr = this.truck;
    tr.x = e.ax! + (e.bx! - e.ax!) * k;
    tr.z = e.az! + (e.bz! - e.az!) * k;
    const fx = Math.sin(tr.yaw), fz = Math.cos(tr.yaw);
    // anything in the truck's footprint: loot gets hoovered up, people get flattened (cartoon style)
    const inTruck = (x: number, z: number, pad: number) => {
      const dx = x - tr.x, dz = z - tr.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      return Math.abs(along) < TRUCK_LEN / 2 + pad && Math.abs(side) < TRUCK_WIDTH / 2 + pad ? side : null;
    };
    for (const it of [...this.w.items.values()]) {
      if (it.mode !== "free" || it.locked) continue;
      if (inTruck(it.body.x, it.body.z, 0.3) !== null && it.body.y < 3) {
        this.w.items.delete(it.id);
        this.w.emit({ t: "swept", item: it.id, type: it.type, x: it.body.x, z: it.body.z });
      }
    }
    for (const p of this.w.players.values()) {
      if (!p.connected || p.move.y > 2.5) continue;
      const side = inTruck(p.move.x, p.move.z, 0.4);
      if (side === null) continue;
      const s = side >= 0 ? 1 : -1;
      p.move.vx += fz * s * 7; p.move.vz += -fx * s * 7; // flung to the side of the road
      this.w.knockdown(p, "truck");
    }
    for (const n of this.w.npc.npcs.values()) {
      const side = inTruck(n.move.x, n.move.z, 0.4);
      if (side === null) continue;
      const s = side >= 0 ? 1 : -1;
      n.move.x += fz * s * 0.3; n.move.z += -fx * s * 0.3;
    }
    if (k >= 1) this.stopEvent();
  }

  private stopEvent() {
    const e = this.ev;
    if (!e) return;
    if (e.kind === "happyhour") {
      // items still lying around lose the bonus; anything grabbed or brought home keeps it
      for (const it of this.w.items.values()) if (it.mode === "free" && it.fort < 0 && inZone(it, e)) it.mult = 1;
    }
    if (e.kind === "truck") this.truck.on = false;
    if (e.kind === "raccoons") this.w.npc.clearRaccoons();
    if (e.kind === "airdrop" && e.crate) { const c = this.w.items.get(e.crate); if (c) c.chute = false; }
    this.w.emit({ t: "cityEvent", kind: e.kind, stage: "end", x: e.x, z: e.z, detail: "" });
    this.ev = null;
  }

  view(out: EventView): EventView {
    const e = this.ev;
    out.kind = e?.kind ?? "";
    out.stage = e?.stage ?? "";
    out.x = e?.x ?? 0; out.z = e?.z ?? 0; out.r = e?.r ?? 0;
    out.timeLeft = !e ? 0 : e.stage === "warn" ? Math.max(0, (e.kind === "happyhour" ? 3 : EVENT_WARN) - e.t) : e.kind === "happyhour" ? Math.max(0, HAPPY_HOUR_TIME - e.t) : 0;
    out.truckOn = this.truck.on; out.truckX = this.truck.x; out.truckZ = this.truck.z; out.truckYaw = this.truck.yaw;
    return out;
  }
}

function inZone(it: ItemSim, e: { x: number; z: number; r: number }) {
  return Math.hypot(it.body.x - e.x, it.body.z - e.z) <= e.r;
}

/** What an item is worth when cashed in (happy-hour bonus included). */
export function itemWorth(it: ItemSim): number {
  return Math.round(it.value * (it.mult || 1));
}
````

## FILE: shared/src/movement.ts

````ts
// First-person character movement. Pure functions, no engine dependency.
// The SAME code runs on the client (so your own movement feels instant) and on
// the server (which is the referee). If they ever disagree, the client snaps
// to the server's answer and replays its unconfirmed inputs ("reconciliation").
//
// Phase 1 adds: weighty momentum, stamina, crouch, belly slide, dodge, mantle, stumble.
// Actions follow a strict priority order each step so they can never overlap or get stuck:
//   mantle (locks everything) > stumble (limits) > slide > dodge > normal movement.

import { PLAYER, SIM_DT } from "./constants.js";
import { localArena, type ArenaLayout, type Box } from "./arena.js";

export interface MoveInput {
  /** increasing sequence number, used for reconciliation */
  seq: number;
  /** -1..1 strafe (right is +) */
  mx: number;
  /** -1..1 forward (forward is +) */
  mz: number;
  /** look yaw in radians (0 = +z) */
  yaw: number;
  /** look pitch in radians (only used for rendering other players' heads) */
  pitch: number;
  sprint: boolean;
  jump: boolean;
  crouch: boolean;
  dodge: boolean;
}

export interface MoveState {
  x: number;
  y: number; // feet height
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  /** Button latches so holding a button doesn't repeat its action */
  jumpLatch: boolean;
  crouchLatch: boolean;
  dodgeLatch: boolean;
  crouching: boolean;
  stamina: number; // 0..1
  staminaDelay: number; // seconds before stamina starts refilling
  winded: boolean; // emptied the bar: no sprint until it refills a bit
  slideT: number; // >0 while sliding
  slideCd: number;
  dodgeT: number; // >0 while dodging
  dodgeCd: number;
  mantleT: number; // >0 while climbing a ledge
  mantleY: number; // ledge top we are climbing to
  stumbleT: number; // >0 while stumbling after a big fall
  /** Set by the World when you carry something (Phase 2). 1 = empty-handed. */
  carryMul: number;
  carryHeavy: boolean; // heavy item: no sprint, no dodge
  handsFull: boolean; // big item in hands: can't climb ledges
  /** Phase 2.5: knocked down (can't move/act), immunity after getting up, trapped in a mime's box, pigeon swarm */
  knockT: number;
  immuneT: number;
  trapT: number;
  swarmT: number;
}

/** Every MoveState field, split by type. The server syncs exactly these. */
export const MOVE_NUM_KEYS = [
  "x", "y", "z", "vx", "vy", "vz", "yaw", "pitch", "stamina", "staminaDelay",
  "slideT", "slideCd", "dodgeT", "dodgeCd", "mantleT", "mantleY", "stumbleT", "carryMul",
  "knockT", "immuneT", "trapT", "swarmT",
] as const;
export const MOVE_BOOL_KEYS = ["grounded", "jumpLatch", "crouchLatch", "dodgeLatch", "crouching", "winded", "carryHeavy", "handsFull"] as const;

export function makeMoveState(x: number, z: number, yaw = 0): MoveState {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, grounded: true,
    jumpLatch: false, crouchLatch: false, dodgeLatch: false, crouching: false,
    stamina: 1, staminaDelay: 0, winded: false,
    slideT: 0, slideCd: 0, dodgeT: 0, dodgeCd: 0, mantleT: 0, mantleY: 0, stumbleT: 0,
    carryMul: 1, carryHeavy: false, handsFull: false,
    knockT: 0, immuneT: 0, trapT: 0, swarmT: 0,
  };
}

export function cloneMoveState(s: MoveState): MoveState {
  return { ...s };
}

/** Copy the movement fields out of any object that has them (e.g. synced server state). */
export function readMoveState(src: Record<string, any>): MoveState {
  const s = makeMoveState(0, 0);
  for (const k of MOVE_NUM_KEYS) s[k] = Number(src[k]) || 0;
  for (const k of MOVE_BOOL_KEYS) s[k] = src[k] === true;
  if (!(s.carryMul > 0)) s.carryMul = 1; // older/partial state: treat as empty-handed
  return s;
}

export function writeMoveState(dst: Record<string, any>, s: MoveState): void {
  for (const k of MOVE_NUM_KEYS) dst[k] = s[k];
  for (const k of MOVE_BOOL_KEYS) dst[k] = s[k];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Makes a received input safe: clamps ranges and replaces NaN. Server always calls this. */
export function sanitizeInput(raw: Partial<MoveInput> | null | undefined): MoveInput | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const seq = num(raw.seq, -1);
  if (seq < 0 || !Number.isInteger(seq)) return null;
  let mx = clamp(num(raw.mx), -1, 1);
  let mz = clamp(num(raw.mz), -1, 1);
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  return {
    seq,
    mx,
    mz,
    yaw: num(raw.yaw) % (Math.PI * 2),
    pitch: clamp(num(raw.pitch), -1.5, 1.5),
    sprint: raw.sprint === true,
    jump: raw.jump === true,
    crouch: raw.crouch === true,
    dodge: raw.dodge === true,
  };
}

/** Current collision height (crouching and sliding make you shorter). */
export function playerHeight(s: MoveState): number {
  return s.crouching || s.slideT > 0 || s.knockT > 0 ? PLAYER.crouchHeight : PLAYER.height;
}

/** Does a vertical span [y, y+h] overlap the box's vertical span? */
function verticalOverlap(y: number, h: number, b: Box, bottomSlack = 0): boolean {
  const top = b.y + b.h / 2;
  const bottom = b.y - b.h / 2;
  return y + bottomSlack < top && y + h > bottom;
}

/**
 * Push a circle (player footprint) out of a rectangle on the XZ plane.
 * Returns true if a push happened. Mutates s.x/s.z and removes velocity into the wall.
 */
function pushOutXZ(s: MoveState, b: Box): boolean {
  const r = PLAYER.radius;
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  const cx = clamp(s.x, minX, maxX);
  const cz = clamp(s.z, minZ, maxZ);
  const dx = s.x - cx;
  const dz = s.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;

  let nx: number;
  let nz: number;
  let pen: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    nz = dz / d;
    pen = r - d;
  } else {
    // Centre is inside the rectangle: push out along the shallowest axis.
    const left = s.x - minX;
    const right = maxX - s.x;
    const back = s.z - minZ;
    const front = maxZ - s.z;
    const m = Math.min(left, right, back, front);
    if (m === left) { nx = -1; nz = 0; pen = left + r; }
    else if (m === right) { nx = 1; nz = 0; pen = right + r; }
    else if (m === back) { nx = 0; nz = -1; pen = back + r; }
    else { nx = 0; nz = 1; pen = front + r; }
  }
  s.x += nx * pen;
  s.z += nz * pen;
  // Remove the velocity component going into the wall (lets you slide along it).
  const vn = s.vx * nx + s.vz * nz;
  if (vn < 0) {
    s.vx -= vn * nx;
    s.vz -= vn * nz;
  }
  return true;
}

function footprintOverlapsAt(x: number, z: number, b: Box, shrink = 0.02): boolean {
  const r = PLAYER.radius - shrink;
  const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
  const cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/** Highest surface directly under a footprint at (x,z), at or below `maxY`. */
export function groundHeightAt(x: number, z: number, boxes: Box[], maxY: number): number {
  let g = 0;
  for (const b of boxes) {
    const top = b.y + b.h / 2;
    if (top <= maxY + 1e-6 && top > g && footprintOverlapsAt(x, z, b)) g = top;
  }
  return g;
}

/** Is anything occupying the space [y, y+h] at footprint (x,z)? */
function spaceBlocked(x: number, z: number, y: number, h: number, boxes: Box[]): boolean {
  for (const b of boxes) {
    if (verticalOverlap(y, h, b, 0.02) && footprintOverlapsAt(x, z, b, 0.04)) return true;
  }
  return false;
}

/** Could the player stand up (full height) right now? */
export function canStand(s: MoveState, arena: ArenaLayout): boolean {
  return !spaceBlocked(s.x, s.z, s.y + 0.01, PLAYER.height - 0.01, arena.boxes);
}

/**
 * Look for a ledge in front of the player that can be mantled.
 * Returns the ledge top and landing point, or null.
 */
export function findMantle(s: MoveState, arena: ArenaLayout): { top: number; x: number; z: number } | null {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  // Probe a point just past our front edge
  const px = s.x + fx * (PLAYER.radius + PLAYER.mantleReach * 0.5);
  const pz = s.z + fz * (PLAYER.radius + PLAYER.mantleReach * 0.5);
  let best: Box | null = null;
  let bestTop = Infinity;
  for (const b of arena.boxes) {
    const top = b.y + b.h / 2;
    const rise = top - s.y;
    if (rise < PLAYER.mantleMin || rise > PLAYER.mantleMax) continue;
    if (b.y - b.h / 2 > s.y + 0.6) continue; // floating slab we can't reach from below
    const inX = Math.abs(px - b.x) <= b.w / 2 + 0.05;
    const inZ = Math.abs(pz - b.z) <= b.d / 2 + 0.05;
    if (inX && inZ && top < bestTop) { best = b; bestTop = top; }
  }
  if (!best) return null;
  // Landing point: far enough onto the ledge that our whole footprint is on it
  const lx = s.x + fx * (PLAYER.radius * 2 + 0.25);
  const lz = s.z + fz * (PLAYER.radius * 2 + 0.25);
  if (groundHeightAt(lx, lz, arena.boxes, bestTop + 0.01) < bestTop - 1e-6) return null; // not solid there
  if (spaceBlocked(lx, lz, bestTop + 0.01, PLAYER.height - 0.02, arena.boxes)) return null; // no room on top
  // Nothing above our head on the way up
  if (spaceBlocked(s.x, s.z, s.y + 0.01, bestTop - s.y + PLAYER.height - 0.02, arena.boxes)) return null;
  return { top: bestTop, x: lx, z: lz };
}

/**
 * Advance one fixed simulation step. Mutates and returns `s`.
 * Deterministic: same state + same input + same arena => same result.
 */
export function stepMovement(s: MoveState, input: MoveInput, fullArena: ArenaLayout, dt = SIM_DT): MoveState {
  // only the boxes near us (big city); 4 m covers a step's movement, climbing reach and landing spot
  const arena = localArena(fullArena, s.x, s.z, 4);
  s.yaw = input.yaw;
  s.pitch = input.pitch;

  // ---- 1. timers --------------------------------------------------------------
  s.slideCd = Math.max(0, s.slideCd - dt);
  s.dodgeCd = Math.max(0, s.dodgeCd - dt);
  s.stumbleT = Math.max(0, s.stumbleT - dt);
  s.staminaDelay = Math.max(0, s.staminaDelay - dt);
  s.knockT = Math.max(0, s.knockT - dt);
  s.immuneT = Math.max(0, s.immuneT - dt);
  s.trapT = Math.max(0, s.trapT - dt);
  s.swarmT = Math.max(0, s.swarmT - dt);
  // Knocked down or trapped in a mime's invisible box: no control at all (you still slide to a stop)
  if (s.knockT > 0 || s.trapT > 0) {
    input = { ...input, mx: 0, mz: 0, sprint: false, jump: false, crouch: false, dodge: false };
    s.slideT = 0;
  }

  // Button edges (pressed this step, not held from before)
  const jumpPressed = input.jump && !s.jumpLatch;
  const crouchPressed = input.crouch && !s.crouchLatch;
  const dodgePressed = input.dodge && !s.dodgeLatch;
  s.jumpLatch = input.jump;
  s.crouchLatch = input.crouch;
  s.dodgeLatch = input.dodge;

  // ---- 2. mantle locks out everything else -------------------------------------
  if (s.mantleT > 0) {
    const step = Math.min(dt, s.mantleT);
    s.x += s.vx * step;
    s.y += s.vy * step;
    s.z += s.vz * step;
    s.mantleT -= step;
    if (s.mantleT <= 1e-9) {
      s.mantleT = 0;
      s.y = s.mantleY;
      s.vx *= 0.25; // keep a little forward drift so it flows
      s.vz *= 0.25;
      s.vy = 0;
      s.grounded = true;
    }
    regenStamina(s, dt, false);
    return s;
  }

  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let mx = input.mx;
  let mz = input.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const hasInput = len > 0.01;
  // forward = (sin, cos), right = (cos, -sin)
  const dirX = sin * mz + cos * mx;
  const dirZ = cos * mz - sin * mx;

  // ---- 3. start a mantle? (jump pressed facing a ledge) ------------------------
  if (jumpPressed && s.stumbleT <= 0 && s.slideT <= 0 && s.dodgeT <= 0 && !s.handsFull) {
    const m = findMantle(s, arena);
    if (m && (s.grounded || s.vy > -6)) {
      const rise = m.top - s.y;
      const T = 0.26 + 0.12 * rise;
      s.mantleT = T;
      s.mantleY = m.top;
      s.vx = (m.x - s.x) / T;
      s.vz = (m.z - s.z) / T;
      s.vy = rise / T;
      s.grounded = false;
      s.crouching = false;
      return s;
    }
  }

  const horiz = Math.hypot(s.vx, s.vz);

  // ---- 4. stance: slide / crouch ------------------------------------------------
  if (s.slideT > 0) {
    s.slideT -= dt;
    const endSlide = s.slideT <= 0 || horiz < 2.5 || !s.grounded;
    if (endSlide) {
      s.slideT = 0;
      s.slideCd = PLAYER.slideCooldown;
      s.crouching = input.crouch || !canStand(s, arena);
    }
  } else if (crouchPressed && s.grounded && horiz >= PLAYER.slideMinSpeed && s.slideCd <= 0 && s.stumbleT <= 0 && s.dodgeT <= 0) {
    s.slideT = PLAYER.slideTime;
    const k = PLAYER.slideSpeed / Math.max(horiz, 1e-6);
    s.vx *= k;
    s.vz *= k;
    s.stamina = Math.max(0, s.stamina - PLAYER.slideStamina);
    s.staminaDelay = PLAYER.staminaRegenDelay;
    s.crouching = true;
  } else {
    s.crouching = input.crouch || (s.crouching && !canStand(s, arena));
  }
  const sliding = s.slideT > 0;

  // ---- 5. dodge -------------------------------------------------------------------
  if (s.dodgeT > 0) {
    s.dodgeT = Math.max(0, s.dodgeT - dt);
    if (s.dodgeT === 0) s.dodgeCd = PLAYER.dodgeCooldown;
  } else if (dodgePressed && s.grounded && !sliding && !s.carryHeavy && s.stumbleT <= 0 && s.dodgeCd <= 0 && s.stamina >= PLAYER.dodgeStamina) {
    let ddx = dirX, ddz = dirZ;
    const dl = Math.hypot(ddx, ddz);
    if (dl < 0.01) { ddx = sin; ddz = cos; } else { ddx /= dl; ddz /= dl; }
    s.dodgeT = PLAYER.dodgeTime;
    s.vx = ddx * PLAYER.dodgeSpeed;
    s.vz = ddz * PLAYER.dodgeSpeed;
    s.vy = PLAYER.dodgeHop;
    s.grounded = false;
    s.crouching = false;
    s.stamina -= PLAYER.dodgeStamina;
    s.staminaDelay = PLAYER.staminaRegenDelay;
    s.swarmT = Math.max(0, s.swarmT - 1.5); // dodging shakes off pigeons
  }
  const dodging = s.dodgeT > 0;

  // ---- 6. horizontal acceleration ---------------------------------------------------
  const backwards = mz < -0.1;
  const stumbling = s.stumbleT > 0;
  const canSprint = input.sprint && !s.winded && !s.carryHeavy && s.stamina > 0 && mz > 0.1 && !s.crouching && !stumbling;
  let speed: number;
  if (stumbling) speed = PLAYER.walkSpeed * PLAYER.stumbleSpeedFactor;
  else if (s.crouching) speed = PLAYER.crouchSpeed;
  else if (canSprint) speed = PLAYER.sprintSpeed;
  else speed = PLAYER.walkSpeed;
  if (backwards && !s.crouching) speed *= PLAYER.backwardFactor;
  speed *= s.carryMul;
  if (s.swarmT > 0) speed *= 0.6; // pigeons everywhere
  const wishX = dirX * speed;
  const wishZ = dirZ * speed;

  if (sliding) {
    // Friction along the slide, a little steering
    const sp = Math.hypot(s.vx, s.vz);
    const ns = Math.max(0, sp - PLAYER.slideFriction * dt);
    if (sp > 1e-6) { s.vx *= ns / sp; s.vz *= ns / sp; }
    if (hasInput) {
      s.vx += dirX * PLAYER.slideSteer * dt;
      s.vz += dirZ * PLAYER.slideSteer * dt;
    }
  } else if (!dodging) {
    const accel = s.grounded ? (hasInput ? PLAYER.groundAccel : PLAYER.groundDecel) : PLAYER.airAccel;
    // Accelerate the velocity vector toward the wish vector (keeps diagonal speed correct).
    if (s.grounded || hasInput) {
      const dvx = wishX - s.vx;
      const dvz = wishZ - s.vz;
      const dvLen = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dvLen <= maxDv) { s.vx = wishX; s.vz = wishZ; }
      else { s.vx += (dvx / dvLen) * maxDv; s.vz += (dvz / dvLen) * maxDv; }
    }
  }

  // ---- 7. stamina -----------------------------------------------------------------
  const actuallySprinting = canSprint && s.grounded && !sliding && Math.hypot(s.vx, s.vz) > PLAYER.walkSpeed + 0.3;
  regenStamina(s, dt, actuallySprinting);

  // ---- 8. jump (also cancels a slide, keeping its momentum) ------------------------
  if (jumpPressed && s.grounded && !stumbling && !dodging) {
    const blocked = s.crouching && !canStand(s, arena);
    if (!blocked) {
      if (sliding) { s.slideT = 0; s.slideCd = PLAYER.slideCooldown; }
      s.crouching = false;
      s.vy = PLAYER.jumpSpeed;
      s.grounded = false;
    }
  }
  if (!s.grounded) {
    s.vy = Math.max(s.vy - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
  }

  // ---- 9. horizontal move + collide -------------------------------------------------
  const h = playerHeight(s);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  for (let iter = 0; iter < 3; iter++) {
    let pushed = false;
    for (const b of arena.boxes) {
      const top = b.y + b.h / 2;
      // Low obstacles we can step onto are handled as ground, not walls (only when grounded).
      const stepable = s.grounded && top - s.y <= PLAYER.stepHeight && top > s.y;
      if (stepable) continue;
      if (!verticalOverlap(s.y, h, b, 0.01)) continue;
      if (pushOutXZ(s, b)) pushed = true;
    }
    if (!pushed) break;
  }

  // Keep inside arena
  const lim = arena.halfSize - PLAYER.radius;
  s.x = clamp(s.x, -lim, lim);
  s.z = clamp(s.z, -lim, lim);

  // ---- 10. vertical move + land -----------------------------------------------------
  if (s.grounded) {
    // Stick to ground / step up curbs / walk off ledges.
    const g = groundHeightAt(s.x, s.z, arena.boxes, s.y + PLAYER.stepHeight);
    if (g >= s.y - 0.05) {
      s.y = g;
      s.vy = 0;
    } else {
      s.grounded = false; // walked off an edge
      s.vy = 0;
    }
  } else {
    const prevY = s.y;
    s.y += s.vy * dt;
    if (s.vy <= 0) {
      const g = groundHeightAt(s.x, s.z, arena.boxes, prevY + 0.001);
      if (s.y <= g) {
        const impact = -s.vy;
        s.y = g;
        s.vy = 0;
        s.grounded = true;
        if (impact > PLAYER.stumbleImpact) {
          s.stumbleT = PLAYER.stumbleTime;
          s.vx *= 0.3;
          s.vz *= 0.3;
          s.slideT = 0;
        }
      }
    } else {
      // Head bump on the underside of anything above
      for (const b of arena.boxes) {
        const bottom = b.y - b.h / 2;
        if (prevY + h <= bottom + 1e-6 && s.y + h > bottom && footprintOverlapsAt(s.x, s.z, b)) {
          s.y = bottom - h;
          s.vy = 0;
        }
      }
    }
  }
  return s;
}

function regenStamina(s: MoveState, dt: number, sprinting: boolean) {
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - PLAYER.staminaDrain * dt);
    s.staminaDelay = PLAYER.staminaRegenDelay;
    if (s.stamina <= 0) s.winded = true;
  } else if (s.staminaDelay <= 0) {
    s.stamina = Math.min(1, s.stamina + PLAYER.staminaRegen * dt);
  }
  if (s.winded && s.stamina >= PLAYER.windedRecover) s.winded = false;
}

/** Horizontal speed, handy for animation + tests. */
export function horizontalSpeed(s: MoveState): number {
  return Math.hypot(s.vx, s.vz);
}

/** High-level pose, used by animation (hands, other players) and sounds. */
export type MovePose = "knocked" | "mantle" | "stumble" | "slide" | "dodge" | "air" | "crouch" | "crouchWalk" | "sprint" | "walk" | "idle";

export function movePose(s: MoveState): MovePose {
  if (s.knockT > 0) return "knocked";
  if (s.mantleT > 0) return "mantle";
  if (s.stumbleT > 0) return "stumble";
  if (s.slideT > 0) return "slide";
  if (s.dodgeT > 0) return "dodge";
  if (!s.grounded) return "air";
  const sp = horizontalSpeed(s);
  if (s.crouching) return sp > 0.4 ? "crouchWalk" : "crouch";
  if (sp > PLAYER.walkSpeed + 0.4) return "sprint";
  if (sp > 0.4) return "walk";
  return "idle";
}
````

## FILE: shared/src/names.ts

````ts
import { NAME_MAX_LENGTH } from "./constants.js";

// Room codes avoid look-alike characters (0/O, 1/I/L) so they are easy to read aloud.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  }
  return s;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

const ADJ = ["Sneaky", "Crusty", "Lucky", "Soggy", "Spicy", "Wobbly", "Shifty", "Greasy", "Turbo", "Dusty", "Cheeky", "Grumpy"];
const NOUN = ["Raccoon", "Bandit", "Pigeon", "Noodle", "Hustler", "Gremlin", "Toaster", "Goblin", "Possum", "Cone", "Biscuit", "Crate"];

export function randomBanditName(rand: () => number = Math.random): string {
  return ADJ[Math.floor(rand() * ADJ.length)] + NOUN[Math.floor(rand() * NOUN.length)];
}

/** Trim, strip control/markup characters and cap length. Empty -> random name. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return randomBanditName();
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
  return cleaned.length ? cleaned : randomBanditName();
}
````

## FILE: shared/src/navgraph.ts

````ts
// Walking routes for pedestrians, built automatically from the city layout:
// a grid of candidate points along the streets; points inside anything solid are dropped,
// and neighbours are linked only if the straight walk between them is clear.
import { inRect, type ArenaLayout } from "./arena.js";

export interface NavNode { id: number; x: number; z: number; links: number[]; }

const DEFAULT_LINES = [-41, -37, -27, -15, -11, -8, -4.5, 0, 4.5, 8, 11, 15, 27, 37, 41];
const CLEARANCE = 0.55; // pedestrian radius + a little room

function blockedAt(arena: ArenaLayout, x: number, z: number): boolean {
  for (const b of arena.boxes) {
    const top = b.y + b.h / 2;
    const bottom = b.y - b.h / 2;
    if (top <= 0.4) continue; // curbs/sidewalks are walkable
    if (bottom > 1.8) continue; // overhead things (roofs, slabs up high)
    if (Math.abs(x - b.x) < b.w / 2 + CLEARANCE && Math.abs(z - b.z) < b.d / 2 + CLEARANCE) return true;
  }
  return false;
}

function segmentClear(arena: ArenaLayout, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (blockedAt(arena, x, z)) return false;
    // pedestrians only cross roads at crosswalks (cars stop for them there)
    if (arena.roads?.some((r) => inRect(r, x, z)) && !arena.crosswalks?.some((c) => inRect(c, x, z, 0.3))) return false;
  }
  return true;
}

export function buildNavGraph(arena: ArenaLayout): NavNode[] {
  const LINES = arena.navLines ?? DEFAULT_LINES;
  const nodes: NavNode[] = [];
  const at = new Map<string, number>();
  for (const x of LINES) for (const z of LINES) {
    if (blockedAt(arena, x, z)) continue;
    if (arena.roads?.some((r) => inRect(r, x, z))) continue; // never stand around in the road
    at.set(x + "," + z, nodes.length);
    nodes.push({ id: nodes.length, x, z, links: [] });
  }
  const link = (a: number, b: number) => { nodes[a].links.push(b); nodes[b].links.push(a); };
  // connect each node to its nearest valid neighbour along the row and along the column
  for (const n of nodes) {
    const xi = LINES.indexOf(n.x), zi = LINES.indexOf(n.z);
    for (let k = xi + 1; k < LINES.length; k++) {
      const m = at.get(LINES[k] + "," + n.z);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
    }
    for (let k = zi + 1; k < LINES.length; k++) {
      const m = at.get(n.x + "," + LINES[k]);
      if (m === undefined) continue;
      if (segmentClear(arena, n.x, n.z, nodes[m].x, nodes[m].z)) link(n.id, m);
      break;
    }
  }
  // keep only the biggest connected piece (so nobody gets stranded)
  const comp = new Array(nodes.length).fill(-1);
  let best = -1, bestSize = 0;
  for (const n of nodes) {
    if (comp[n.id] !== -1) continue;
    const stack = [n.id];
    comp[n.id] = n.id;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const l of nodes[c].links) if (comp[l] === -1) { comp[l] = n.id; stack.push(l); }
    }
    if (size > bestSize) { bestSize = size; best = n.id; }
  }
  const keep = nodes.filter((n) => comp[n.id] === best && n.links.length > 0);
  const remap = new Map(keep.map((n, i) => [n.id, i]));
  return keep.map((n, i) => ({ id: i, x: n.x, z: n.z, links: n.links.filter((l) => remap.has(l)).map((l) => remap.get(l)!) }));
}

/** Shortest route between two route points (Dijkstra; the graph has ~200 points). Node ids, both ends included. */
export function findPath(graph: NavNode[], from: number, to: number): number[] {
  if (from === to) return [from];
  const n = graph.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const v of graph[u].links) {
      const d = best + Math.hypot(graph[v].x - graph[u].x, graph[v].z - graph[u].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (!Number.isFinite(dist[to])) return [];
  const out: number[] = [];
  for (let c = to; c >= 0; c = prev[c]) out.unshift(c);
  return out;
}
````

## FILE: shared/src/npc.ts

````ts
// The people of Trashington (Phase 2.5): pedestrian types, their speeds, loot, and lines.
// Adult cartoon characters only; slapstick, not violence.

export type NpcKind = "tourist" | "businessman" | "influencer" | "jogger" | "gym_bro" | "mall_cop" | "mime" | "pigeon_lady" | "raccoon" | "cashier" | "cop"
  // Phase 4.5 big shots (+ their entourage)
  | "millionaire" | "bodyguard" | "courier" | "celebrity" | "fan" | "crypto_bro";

export interface NpcDef {
  kind: NpcKind;
  name: string;
  /** walking speed (m/s) */
  walk: number;
  /** fleeing speed (m/s) */
  flee: number;
  /** fights back when hit (chase + trade punches) */
  fighter: boolean;
  /** hits needed to KO a fighter */
  hp: number;
  /** chance to dodge a punch while not fleeing (jogger) */
  dodge: number;
  /** extra notoriety when you hit this one (mall cop reports you) */
  notoriety: number;
  spawnWeight: number;
  loot: [string, number][];
  /** big shot: rare, announced, marked with $$$, carries a jackpot (Phase 4.5) */
  bigShot?: { title: string; weight: number; follower?: NpcKind; followers?: number; heat: number };
  /** only drops their loot when knocked out (armored courier) */
  dropOnKo?: boolean;
  lines: { idle: string[]; hit: string[]; fight?: string[]; win?: string[]; lose?: string[]; dodge?: string[]; film?: string[]; yell?: string[]; holdup?: string[]; spot?: string[]; lost?: string[]; bust?: string[] };
}

export const NPC_DEFS: Record<NpcKind, NpcDef> = {
  tourist: {
    kind: "tourist", name: "Tourist", walk: 1.3, flee: 5.2, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 6,
    loot: [["wrong_map", 4], ["disposable_camera", 4], ["half_sandwich", 2], ["mystery_wallet", 1]],
    lines: { idle: ["Where is the famous trash?", "Ooh, a pigeon!", "Is this the Mayor's house?"], hit: ["MY SOUVENIRS!", "Is this a local custom?!", "Worst tour ever!"] },
  },
  businessman: {
    kind: "businessman", name: "Businessman", walk: 1.6, flee: 5.6, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 5,
    loot: [["mystery_wallet", 4], ["expired_coupon", 3], ["pocket_lint", 2], ["rolecks_watch", 1.3]],
    lines: { idle: ["Let's circle back.", "Synergy...", "I'm walking and TALKING."], hit: ["MY ROLECKS!", "I'm calling my lawyer!", "This is NOT on the agenda!"] },
  },
  influencer: {
    kind: "influencer", name: "Influencer", walk: 1.2, flee: 5.0, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 4,
    loot: [["bedazzled_phone", 3], ["half_sandwich", 1], ["expired_coupon", 1]],
    lines: { idle: ["Hey besties!", "Don't forget to like!", "Trashington core."], hit: ["This is going on my story!", "Like and SUBSCRIBE?!", "Ratio!"], film: ["We're LIVE!", "Chat, are you seeing this?!"] },
  },
  jogger: {
    kind: "jogger", name: "Jogger", walk: 3.6, flee: 7.0, fighter: false, hp: 1, dodge: 0.35, notoriety: 0, spawnWeight: 4,
    loot: [["fancy_earbuds", 3], ["protein_shaker", 1], ["pocket_lint", 1]],
    lines: { idle: ["On your left!", "Hydrate!", "Personal best incoming!"], hit: ["My PB!", "I was in the ZONE!"], dodge: ["Too slow!", "Cardio, baby!"] },
  },
  gym_bro: {
    kind: "gym_bro", name: "Gym Bro", walk: 1.5, flee: 5.2, fighter: true, hp: 2, dodge: 0, notoriety: 0, spawnWeight: 3,
    loot: [["protein_shaker", 4], ["half_sandwich", 2], ["mystery_wallet", 1]],
    lines: { idle: ["Protein time.", "Never skip leg day.", "Is that a squat rack?"], hit: ["Oh it's ON.", "Bro. BRO."], fight: ["Do you even lift?!", "Come at me, bro!"], win: ["Light weight!", "Yeah buddy!"], lose: ["...should've done cardio..."] },
  },
  mall_cop: {
    kind: "mall_cop", name: "Off-duty Mall Cop", walk: 1.4, flee: 5.0, fighter: true, hp: 2, dodge: 0, notoriety: 15, spawnWeight: 3,
    loot: [["plastic_badge", 4], ["half_sandwich", 2], ["expired_coupon", 2]],
    lines: { idle: ["Keep it moving.", "No loitering. Probably.", "Food court was quiet today."], hit: ["That's assault on a... uh... me!"], fight: ["I'm off duty but STILL!", "Halt, citizen!"], win: ["Justice. Served.", "Mall rules apply everywhere."], lose: ["Tell the food court... I tried..."] },
  },
  mime: {
    kind: "mime", name: "Mime", walk: 1.2, flee: 5.0, fighter: true, hp: 2, dodge: 0, notoriety: 0, spawnWeight: 2,
    loot: [["mime_beret", 3], ["pocket_lint", 2]],
    lines: { idle: ["*walks against the wind*", "*pulls invisible rope*", "..."], hit: ["*invisible box*", "..."], fight: ["...", "*rolls up invisible sleeves*"], win: ["*silent bow*"], lose: ["*dramatic faint*"] },
  },
  pigeon_lady: {
    kind: "pigeon_lady", name: "Pigeon Lady", walk: 1.1, flee: 4.8, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 3,
    loot: [["bread_crumbs", 5], ["mystery_wallet", 1], ["lucky_pigeon", 0.3]],
    lines: { idle: ["Who's a good pigeon?", "Coo coo, my darlings.", "They understand me."], hit: ["COO COO! GET 'EM!", "My babies will avenge me!"] },
  },
  // Phase 3 event: raccoons sneak into forts and run off with loot. Never spawn as pedestrians.
  raccoon: {
    kind: "raccoon", name: "Raccoon", walk: 3.2, flee: 4.4, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 0,
    loot: [["pocket_lint", 1]],
    lines: { idle: ["*chitter*", "*sniff sniff*"], hit: ["*SKREEE!*", "*angry chitter*"], win: ["*triumphant chitter*"] },
  },
  // Phase 3.5: one behind every shop counter. Never fights, never leaves the shop.
  cashier: {
    kind: "cashier", name: "Cashier", walk: 1.4, flee: 1.4, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["cash_bundle", 1]],
    lines: {
      idle: ["Welcome in!", "Cash or... cash?", "No loitering. Please.", "Have a trashy day!"],
      hit: ["OW! Take the money!", "I'm on minimum wage!", "This is not in my job description!"],
      yell: ["HEY! Put that back!", "I SAW THAT!", "Security! ...we don't have security.", "That's not free!"],
      holdup: ["Take it! Take it all!", "Please don't hurt the register!", "Okay okay okay!"],
    },
  },
  // Phase 4: Trashington's finest. Sent by the police system when your heat gets high.
  cop: {
    kind: "cop", name: "Cop", walk: 3.6, flee: 6.1, fighter: true, hp: 3, dodge: 0, notoriety: 15, spawnWeight: 0,
    loot: [["donut", 1]],
    lines: {
      idle: ["Nice day for a donut.", "Move along.", "Anybody seen a bum with a TV?"],
      hit: ["You just made it worse, pal!", "That's resisting!", "OW! My badge!"],
      fight: ["FREEZE!", "STOP RIGHT THERE!", "Hands where I can see 'em!"],
      spot: ["There he is!", "HEY! You! Stop!", "Suspect spotted!", "We got a runner!"],
      lost: ["Where'd he go?", "Lost him...", "Sneaky little dumpster rat.", "I'll get you next time!"],
      bust: ["Gotcha!", "You're going downtown!", "Book 'em!", "Nighty night, bandit."],
      win: ["Gotcha!"], lose: ["...call... for... backup..."],
    },
  },
  // ---- Phase 4.5: big shots. Worth the heat. ----
  millionaire: {
    kind: "millionaire", name: "Millionaire", walk: 1.1, flee: 4.6, fighter: false, hp: 1, dodge: 0, notoriety: 20, spawnWeight: 0,
    loot: [["gold_bar", 1], ["diamond_ring", 1]],
    bigShot: { title: "A MILLIONAIRE", weight: 3, follower: "bodyguard", followers: 1, heat: 30 },
    lines: { idle: ["Is this... the poor part of town?", "Monocle check.", "I bought this street. Twice."], hit: ["MY MONOCLE!", "Do you know who I AM?!", "Security! SECURITY!"] },
  },
  bodyguard: {
    kind: "bodyguard", name: "Bodyguard", walk: 1.3, flee: 5.8, fighter: true, hp: 3, dodge: 0, notoriety: 5, spawnWeight: 0,
    loot: [["mystery_wallet", 1]],
    lines: { idle: ["...", "Keep walking, pal.", "*cracks knuckles*"], hit: ["That tickled."], fight: ["Back off!", "Not on my watch!"], win: ["Stay down."], lose: ["...fired... for sure..."] },
  },
  courier: {
    kind: "courier", name: "Armored Courier", walk: 1.4, flee: 5.4, fighter: true, hp: 2, dodge: 0, notoriety: 25, spawnWeight: 0, dropOnKo: true,
    loot: [["money_bag", 1]],
    bigShot: { title: "AN ARMORED CASH COURIER", weight: 3, heat: 40 },
    lines: { idle: ["Bank run. Literally.", "Nobody look at the bag.", "Totally normal bag."], hit: ["Armor, pal!", "Nice try!"], fight: ["Hands off the bag!", "You picked the wrong courier!"], win: ["Delivery complete."], lose: ["...the bag... the BAG!"] },
  },
  celebrity: {
    kind: "celebrity", name: "Celebrity", walk: 1.2, flee: 5.0, fighter: false, hp: 1, dodge: 0, notoriety: 20, spawnWeight: 0,
    loot: [["award_trophy", 1]],
    bigShot: { title: "A CELEBRITY", weight: 2, follower: "fan", followers: 2, heat: 25 },
    lines: { idle: ["No photos! ...okay, one photo.", "My agent says I'm relatable.", "Is this the red carpet?"], hit: ["MY AWARD!", "This will be SO good for my comeback!", "I'll sue! Stylishly!"] },
  },
  fan: {
    kind: "fan", name: "Superfan", walk: 1.3, flee: 5.2, fighter: false, hp: 1, dodge: 0, notoriety: 0, spawnWeight: 0,
    loot: [["expired_coupon", 1]],
    lines: { idle: ["OMG OMG OMG", "Sign my forehead!", "I'm your biggest fan!"], hit: ["Not the phone!"], film: ["WE'RE LIVE! THIS IS INSANE!", "Chat, it's happening!"] },
  },
  crypto_bro: {
    kind: "crypto_bro", name: "Crypto Bro", walk: 1.4, flee: 5.6, fighter: false, hp: 1, dodge: 0, notoriety: 10, spawnWeight: 0,
    loot: [["hardware_wallet", 1]],
    bigShot: { title: "A CRYPTO BRO", weight: 2, heat: 15 },
    lines: { idle: ["Have you heard about my coin?", "HODL.", "Number go up. Trust."], hit: ["MY SEED PHRASE!", "That was my whole portfolio!", "Rug pulled! LITERALLY!"] },
  },
};

/** Pedestrian types that wander the streets (raccoons and cashiers have their own jobs). */
export const NPC_KINDS = (Object.keys(NPC_DEFS) as NpcKind[]).filter((k) => NPC_DEFS[k].spawnWeight > 0);
/** Kinds that are never part of the everyday crowd (own jobs, own counts). */
export const SPECIAL_KINDS = new Set<NpcKind>(["raccoon", "cashier", "cop", "millionaire", "bodyguard", "courier", "celebrity", "fan", "crypto_bro"]);
/** The four big shots. */
export const BIG_SHOTS = (Object.keys(NPC_DEFS) as NpcKind[]).filter((k) => !!NPC_DEFS[k].bigShot);

/** Extra loot a KO'd fighter drops. */
export const KO_BONUS: [string, number][] = [["mystery_wallet", 3], ["fancy_earbuds", 2], ["rolecks_watch", 1]];

export const BYSTANDER_SCREAMS = ["AAAH!", "Not again!", "Only in Trashington...", "Somebody do something!", "I saw nothing!"];

export function pickWeighted<T>(table: [T, number][], rand: () => number): T {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rand() * total;
  for (const [v, w] of table) { r -= w; if (r <= 0) return v; }
  return table[table.length - 1][0];
}

export function pickLine(list: string[] | undefined, rand: () => number): string {
  if (!list || !list.length) return "";
  return list[Math.floor(rand() * list.length)];
}
````

## FILE: shared/src/npcSim.ts

````ts
// Pedestrian behaviour (Phase 2.5). Runs inside the World on the server and in solo mode.
// Pedestrians move with the SAME movement rules as players (stepMovement), driven by simple AI:
//   walk (route map) / idle -> [hit] -> stunned -> flee | chase -> windup -> strike -> gloat | ko -> flee
import { makeMoveState, stepMovement, type MoveState, type MoveInput } from "./movement.js";
import { PLAYER, SIM_DT } from "./constants.js";
import { NPC_DEFS, NPC_KINDS, SPECIAL_KINDS, BIG_SHOTS, KO_BONUS, BYSTANDER_SCREAMS, pickWeighted, pickLine, type NpcKind } from "./npc.js";
import { buildNavGraph, type NavNode } from "./navgraph.js";
import { nearBoxes, type ArenaLayout } from "./arena.js";

export type NpcState = "walk" | "idle" | "stunned" | "flee" | "chase" | "windup" | "gloat" | "ko" | "film" | "huff"
  // raccoon heist (Phase 3): sneak to a fort, grab loot, escape along the back alley; scram = running off empty-handed
  | "sneak" | "escape" | "scram"
  // police (Phase 4): patrol = heading to where you were reported, search = lost sight of you, leave = giving up
  | "patrol" | "search" | "leave"
  // big shots' entourage (Phase 4.5): bodyguard / fans stick close to their boss
  | "follow"
  // shop cashiers (Phase 3.5): stand at the till / hands up
  | "work" | "cower";

export interface NpcSimData {
  id: string;
  kind: NpcKind;
  move: MoveState;
  state: NpcState;
  stateT: number; // time left in the current timed state
  node: number; // route node we're heading to
  prevNode: number;
  hp: number;
  robbed: boolean; // already dropped their item
  item: string; // loot type they carry
  target: string; // player they're chasing / fleeing from
  chaseT: number;
  attackCd: number;
  stuckT: number;
  lastDist: number;
  sayCd: number;
  fromX: number; fromZ: number; // flee-from point
  // natural movement (Phase 3 polish): everyone walks a bit differently
  pace: number; // personal walking speed multiplier (0.85..1.15)
  lane: number; // sideways offset from the route line (-0.5..0.5 m), so people don't walk single-file
  curSpeed: number; // eased speed (people speed up / slow down instead of snapping)
  lookYaw: number; lookT: number; // idle: glance around
  // obstacle avoidance: which way we're walking around something (sticky, so people don't dither)
  avoidSide: number; avoidT: number;
  // police: can this cop see their target right now, when did we last check, how long since they saw them
  sees: boolean; losT: number; lostT: number; lastX: number; lastZ: number;
  // entourage: who they follow (big shot id); big shots: seconds since robbed (-1 = not yet)
  leader: string; robbedT: number;
  // raccoons only
  carry: string; // item id being stolen
  path: { x: number; z: number }[]; // escape route (last point = gone)
  fortSlot: number;
  lifeT: number;
  // cashiers only
  post: { x: number; z: number; yaw: number } | null;
  shop: number;
}

/** What the NPC system needs from the World (kept as an interface to avoid circular imports). */
export interface NpcHost {
  arena: ArenaLayout;
  rng: () => number;
  playersForNpcs(): { id: string; x: number; y: number; z: number; yaw: number; connected: boolean; knocked: boolean; immune: boolean }[];
  npcHitPlayer(npcId: string, playerId: string, knock: boolean): void;
  npcDropLoot(npcId: string, type: string, x: number, y: number, z: number, awayX: number, awayZ: number): void;
  npcEvent(e: { t: "npcSay"; npc: string; line: string } | { t: "npcAttack"; npc: string; p: string; hit: boolean } | { t: "npcDodge"; npc: string; p: string } | { t: "npcKo"; npc: string; by: string } | { t: "panic"; npc: string } | BigShotEvent): void;
  addNotoriety(playerId: string, amount: number): void;
  /** a cashier got punched: shop alarm */
  shopAlarm(shopId: number): void;
  applyToPlayer(playerId: string, effect: "trap" | "swarm" | "flash"): void;
  /** raccoon heist hooks */
  raccoonTarget(slot: number): { id: string; x: number; z: number } | null;
  raccoonGrab(npcId: string, itemId: string): boolean;
  npcDropCarried(itemId: string, x: number, y: number, z: number, awayX: number, awayZ: number): void;
  raccoonGone(npcId: string, itemId: string, slot: number): void;
  /** police AI (Phase 4): where a cop wants to go this step (null = not a cop / nothing to do) */
  copBrain(n: NpcSimData, dt: number): { tx: number; tz: number; speed: number; face: number | null } | null;
}

/** Big shots (Phase 4.5): arrive (announced), get hit (jackpot), or leave town. */
export type BigShotEvent = { t: "bigShot"; npc: string; kind: NpcKind; stage: "arrive" | "hit" | "gone"; x: number; z: number; by: string };
/** First big shot after this many seconds, then one every BIG_SHOT_GAP after the last one left. */
export const BIG_SHOT_FIRST = 35;
export const BIG_SHOT_GAP: [number, number] = [45, 75];
export const BIG_SHOT_STAY = 120;

export const NPC_STEP = SIM_DT * 2; // pedestrians think + move at 30 Hz (cheap, smooth enough)
export const PUNCH_RANGE = 1.9;
const ATTACK_RANGE = 1.5;
const STRIKE_RANGE = 1.9;
const WINDUP = 0.45;
const CHASE_GIVE_UP = 8;

export class NpcSystem {
  readonly graph: NavNode[];
  readonly npcs = new Map<string, NpcSimData>();
  private next = 1;
  private acc = 0;
  target: number;
  /** countdown to the next big shot */
  bigShotT = BIG_SHOT_FIRST;

  constructor(private host: NpcHost, count: number) {
    this.graph = buildNavGraph(host.arena);
    this.target = count;
    for (let i = 0; i < count; i++) this.spawn();
    for (const sh of host.arena.shops ?? []) {
      const n = this.spawn("cashier")!;
      n.post = { ...sh.cashier }; n.shop = sh.id;
      n.move = makeMoveState(sh.cashier.x, sh.cashier.z, sh.cashier.yaw);
      n.state = "work";
    }
  }

  // ---------------------------------------------------------------- cashiers
  cashierOf(shop: number): NpcSimData | undefined {
    for (const n of this.npcs.values()) if (n.kind === "cashier" && n.shop === shop) return n;
    return undefined;
  }
  /** Hands up for a few seconds (hold-up, alarm). */
  cower(id: string, time: number) {
    const n = this.npcs.get(id);
    if (!n || n.state === "ko") return;
    if (n.state !== "cower" || n.stateT < time) { n.state = "cower"; n.stateT = time; }
  }
  cashierSay(id: string, what: "yell" | "holdup") {
    const n = this.npcs.get(id);
    if (n) this.say(n, NPC_DEFS.cashier.lines[what], true);
  }
  /** New round: every cashier back at their till with a fresh float. */
  resetCashiers() {
    for (const n of this.npcs.values()) {
      if (n.kind !== "cashier" || !n.post) continue;
      n.move = makeMoveState(n.post.x, n.post.z, n.post.yaw);
      n.state = "work"; n.robbed = false; n.hp = 1; n.stateT = 0;
    }
  }

  /** A raccoon bursts out of a dumpster and scurries off (then vanishes). */
  spawnCritter(x: number, z: number, fromX: number, fromZ: number) {
    const n = this.spawn("raccoon");
    if (!n) return;
    const dx = x - fromX, dz = z - fromZ, l = Math.max(0.01, Math.hypot(dx, dz));
    n.move = makeMoveState(x + (dx / l) * 1.2, z + (dz / l) * 1.2, Math.atan2(dx, dz));
    n.state = "scram"; n.robbed = true; n.fortSlot = -1;
    n.lifeT = 52; // escape/scram give up at 60 s: this one is gone after ~8 s
    n.path = [{ x: x + (dx / l) * 14, z: z + (dz / l) * 14 }];
    this.say(n, NPC_DEFS.raccoon.lines.hit, true);
  }

  private rng() { return this.host.rng(); }

  /** Spawn a pedestrian at a route node (plaza-weighted), optionally far from players. */
  spawn(kind?: NpcKind, farFromPlayers = false): NpcSimData | null {
    if (!this.graph.length) return null;
    const players = this.host.playersForNpcs();
    let node = 0;
    for (let tries = 0; tries < 20; tries++) {
      node = Math.floor(this.rng() * this.graph.length);
      const n = this.graph[node];
      const plaza = Math.abs(n.x) <= 15 && Math.abs(n.z) <= 15;
      if (!plaza && this.rng() < 0.35) continue; // bias toward the plaza
      if (farFromPlayers && players.some((p) => Math.hypot(p.x - n.x, p.z - n.z) < 28)) continue;
      break;
    }
    const n = this.graph[node];
    const k = kind ?? pickWeighted(NPC_KINDS.map((k) => [k, NPC_DEFS[k].spawnWeight] as [NpcKind, number]), () => this.rng());
    const def = NPC_DEFS[k];
    const id = "n" + this.next++;
    const move = makeMoveState(n.x + (this.rng() - 0.5), n.z + (this.rng() - 0.5), this.rng() * Math.PI * 2);
    const npc: NpcSimData = {
      id, kind: k, move, state: "walk", stateT: 0, node, prevNode: node, hp: def.hp, robbed: false,
      item: pickWeighted(def.loot, () => this.rng()), target: "", chaseT: 0, attackCd: 0, stuckT: 0, lastDist: 99, avoidSide: 1, avoidT: 0, sees: false, losT: 0, lostT: 0, lastX: 0, lastZ: 0, leader: "", robbedT: -1,
      sayCd: 3 + this.rng() * 10, fromX: 0, fromZ: 0,
      pace: 0.85 + this.rng() * 0.3, lane: (this.rng() - 0.5), curSpeed: 0, lookYaw: 0, lookT: 0,
      carry: "", path: [], fortSlot: -1, lifeT: 0, post: null, shop: -1,
    };
    npc.node = this.pickNext(npc);
    this.npcs.set(id, npc);
    return npc;
  }

  /** Raccoon heist: a raccoon appears in the alley behind a fort and goes for the best loot there. */
  spawnRaccoon(slot: number): NpcSimData | null {
    const f = (this.host.arena.forts ?? []).find((x) => x.slot === slot);
    if (!f) return null;
    const n = this.spawn("raccoon");
    if (!n) return null;
    // sideways along the back alley (perpendicular to the direction the fort faces)
    const lx = Math.cos(f.yaw), lz = -Math.sin(f.yaw);
    const side = this.rng() < 0.5 ? -1 : 1;
    n.move = makeMoveState(f.backX + lx * side * 3, f.backZ + lz * side * 3, f.yaw);
    n.state = "sneak"; n.fortSlot = slot; n.lifeT = 0; n.robbed = true; n.pace = 1; n.lane = 0;
    // escape: round the side of the fort box (not through it), into the alley, then off down the alley
    n.path = [
      { x: f.x + lx * side * 3, z: f.z + lz * side * 3 },
      { x: f.backX + lx * side * 3, z: f.backZ + lz * side * 3 },
      { x: f.backX + lx * side * 44, z: f.backZ + lz * side * 44 },
    ];
    return n;
  }

  /** Test/debug helper: remove pedestrians near a spot (the crowd refills elsewhere later). */
  removeNear(x: number, z: number, r: number): number {
    let n = 0;
    for (const [id, p] of this.npcs) if (p.kind !== "cashier" && Math.hypot(p.move.x - x, p.move.z - z) < r) { this.npcs.delete(id); n++; }
    return n;
  }

  /** Test/debug helper: put a specific pedestrian somewhere, standing still. */
  place(kind: NpcKind, x: number, z: number, yaw = 0): NpcSimData {
    const n = this.spawn(kind)!;
    n.move = makeMoveState(x, z, yaw);
    n.state = "idle"; n.stateT = 999;
    n.node = this.nearestClearNode(x, z, -1);
    return n;
  }

  private pickNext(n: NpcSimData): number {
    const links = this.graph[n.node].links;
    if (!links.length) return n.node;
    const choices = links.filter((l) => l !== n.prevNode);
    const pool = choices.length ? choices : links;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  private say(n: NpcSimData, list: string[] | undefined, force = false) {
    if (!force && n.sayCd > 0) return;
    const line = pickLine(list, () => this.rng());
    if (!line) return;
    n.sayCd = 4;
    this.host.npcEvent({ t: "npcSay", npc: n.id, line });
  }

  // ------------------------------------------------------------------ being hit
  /**
   * A player (punch or thrown item) hits a pedestrian. Returns "hit" | "dodged" | "ignored".
   */
  hit(npcId: string, byPlayer: string, fromX: number, fromZ: number): "hit" | "dodged" | "ignored" {
    const n = this.npcs.get(npcId);
    if (!n || n.state === "ko" || n.state === "stunned") return "ignored";
    const def = NPC_DEFS[n.kind];
    if (n.kind === "cashier") {
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
      if (!n.robbed) { n.robbed = true; this.host.npcDropLoot(n.id, "cash_bundle", n.move.x, n.move.y + 1.2, n.move.z, -awayX, -awayZ); }
      this.host.addNotoriety(byPlayer, 10 + def.notoriety);
      this.host.shopAlarm(n.shop);
      n.state = "cower"; n.stateT = 6; n.target = byPlayer;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    if (n.kind === "cop") {
      // punching a cop: big heat, they stagger, then come after YOU. 3 hits and they're down for a bit.
      n.hp -= 1;
      this.host.addNotoriety(byPlayer, def.notoriety);
      this.panicBystanders(n, byPlayer);
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ, l = Math.max(0.001, Math.hypot(awayX, awayZ));
      n.move.vx += (awayX / l) * 3; n.move.vz += (awayZ / l) * 3;
      n.target = byPlayer; n.path = [];
      if (n.hp <= 0) {
        n.state = "ko"; n.stateT = 5; n.hp = def.hp;
        this.say(n, def.lines.lose, true);
        this.host.npcEvent({ t: "npcKo", npc: n.id, by: byPlayer });
        this.host.npcDropLoot(n.id, "donut", n.move.x, n.move.y + 0.6, n.move.z, awayX, awayZ);
        return "hit";
      }
      n.state = "stunned"; n.stateT = 0.9;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    if (n.kind === "raccoon") {
      // heroic! no heat for bonking a thief. It drops what it stole and runs off empty-handed.
      const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
      if (n.carry) { this.host.npcDropCarried(n.carry, n.move.x, n.move.y + 0.8, n.move.z, awayX, awayZ); n.carry = ""; }
      n.state = "stunned"; n.stateT = 0.6; n.target = byPlayer; n.fromX = fromX; n.fromZ = fromZ;
      this.say(n, def.lines.hit, true);
      return "hit";
    }
    // joggers sometimes sidestep (only when they didn't see it coming... i.e. not already fleeing)
    if (def.dodge > 0 && (n.state === "walk" || n.state === "idle") && this.rng() < def.dodge) {
      n.move.vx += (this.rng() < 0.5 ? -1 : 1) * 3;
      this.say(n, def.lines.dodge, true);
      this.host.npcEvent({ t: "npcDodge", npc: n.id, p: byPlayer });
      this.startFlee(n, fromX, fromZ, byPlayer, 3);
      return "dodged";
    }
    n.hp -= 1;
    this.host.addNotoriety(byPlayer, 10 + def.notoriety);
    this.panicBystanders(n, byPlayer);
    const awayX = n.move.x - fromX, awayZ = n.move.z - fromZ;
    if (!n.robbed && !(def.dropOnKo && n.hp > 0)) { // the armored courier only lets go of the bag when knocked out
      n.robbed = true;
      this.host.npcDropLoot(n.id, n.item, n.move.x, n.move.y + 1.1, n.move.z, awayX, awayZ);
    }
    this.entourageReacts(n, byPlayer);
    // little knock-back
    const l = Math.max(0.001, Math.hypot(awayX, awayZ));
    n.move.vx += (awayX / l) * 3; n.move.vz += (awayZ / l) * 3;

    if (def.fighter && n.hp <= 0) {
      n.state = "ko"; n.stateT = 3.2; n.target = "";
      this.say(n, def.lines.lose, true);
      this.host.npcEvent({ t: "npcKo", npc: n.id, by: byPlayer });
      this.host.npcDropLoot(n.id, pickWeighted(KO_BONUS, () => this.rng()), n.move.x, n.move.y + 0.6, n.move.z, awayX, awayZ);
      return "hit";
    }
    n.state = "stunned";
    n.stateT = def.fighter ? 0.6 : 1.1;
    n.target = byPlayer;
    n.fromX = fromX; n.fromZ = fromZ;
    this.say(n, def.fighter && n.hp < def.hp ? def.lines.fight : def.lines.hit, true);
    if (n.kind === "mime" && n.hp === def.hp - 1) this.host.applyToPlayer(byPlayer, "trap");
    if (n.kind === "pigeon_lady") this.host.applyToPlayer(byPlayer, "swarm");
    if (n.kind === "tourist") this.host.applyToPlayer(byPlayer, "flash");
    return "hit";
  }

  private startFlee(n: NpcSimData, fromX: number, fromZ: number, from: string, time: number) {
    n.state = "flee"; n.stateT = time; n.fromX = fromX; n.fromZ = fromZ; n.target = from;
    // head for the neighbouring node that is furthest from the threat
    const links = this.graph[n.node]?.links ?? [];
    let best = n.node, bestD = -1;
    for (const l of [n.node, ...links]) {
      const g = this.graph[l];
      const d = Math.hypot(g.x - fromX, g.z - fromZ);
      if (d > bestD) { bestD = d; best = l; }
    }
    n.prevNode = n.node; n.node = best;
  }

  // ------------------------------------------------------------------ big shots (Phase 4.5)
  /** Hitting a big shot: the bodyguard comes for you, the fans film it (more heat), and it's news. */
  private entourageReacts(n: NpcSimData, byPlayer: string) {
    const def = NPC_DEFS[n.kind];
    if (!def.bigShot) return;
    if (n.robbedT < 0 && n.robbed) n.robbedT = 0;
    for (const o of this.npcs.values()) {
      if (o.leader !== n.id || o.state === "ko") continue;
      if (o.kind === "bodyguard") { o.state = "chase"; o.target = byPlayer; o.chaseT = 0; this.say(o, NPC_DEFS.bodyguard.lines.fight, true); }
      else if (o.kind === "fan" && o.state !== "film") {
        o.state = "film"; o.stateT = 4; o.target = byPlayer;
        this.say(o, NPC_DEFS.fan.lines.film, true);
        this.host.addNotoriety(byPlayer, 8);
      }
    }
    this.host.npcEvent({ t: "bigShot", npc: n.id, kind: n.kind, stage: "hit", x: n.move.x, z: n.move.z, by: byPlayer });
  }

  /** The big shot in town right now (if any). */
  activeBigShot(): NpcSimData | undefined {
    for (const n of this.npcs.values()) if (NPC_DEFS[n.kind].bigShot) return n;
    return undefined;
  }

  /** Bring a big shot (+ entourage) to town, somewhere nobody is looking. */
  spawnBigShot(kind?: NpcKind): NpcSimData | null {
    const kinds = BIG_SHOTS;
    const k = kind ?? pickWeighted(kinds.map((x) => [x, NPC_DEFS[x].bigShot!.weight] as [NpcKind, number]), () => this.rng());
    const players = this.host.playersForNpcs().filter((p) => p.connected);
    const nodes = this.graph.filter((g) => players.every((p) => Math.hypot(p.x - g.x, p.z - g.z) >= 30) && Math.abs(g.x) < 68 && Math.abs(g.z) < 68);
    const pool = nodes.length ? nodes : this.graph;
    if (!pool.length) return null;
    const g = pool[Math.floor(this.rng() * pool.length)];
    const n = this.spawn(k);
    if (!n) return null;
    n.move = makeMoveState(g.x, g.z, this.rng() * Math.PI * 2);
    n.node = g.id; n.prevNode = g.id; n.node = this.pickNext(n);
    n.state = "walk"; n.lifeT = 0; n.robbedT = -1; n.pace = 0.9; n.lane = 0;
    const b = NPC_DEFS[k].bigShot!;
    for (let i = 0; i < (b.followers ?? 0); i++) {
      const f = this.spawn(b.follower!);
      if (!f) break;
      f.move = makeMoveState(g.x + (i ? 1 : -1) * 0.9, g.z - 1, n.move.yaw);
      f.leader = n.id; f.state = "follow"; f.lane = i % 2 ? 0.9 : -0.9; f.robbed = f.kind === "fan"; f.node = g.id;
    }
    this.say(n, NPC_DEFS[k].lines.idle, true);
    this.host.npcEvent({ t: "bigShot", npc: n.id, kind: k, stage: "arrive", x: g.x, z: g.z, by: "" });
    return n;
  }

  /** Schedule big shots; send them home after a while (or after they've been robbed). */
  private bigShots(dt: number) {
    const b = this.activeBigShot();
    const players = this.host.playersForNpcs().filter((p) => p.connected);
    if (!b) {
      if (!players.length || !this.graph.length) return;
      this.bigShotT -= dt;
      if (this.bigShotT <= 0) { this.spawnBigShot(); this.bigShotT = BIG_SHOT_GAP[0] + this.rng() * (BIG_SHOT_GAP[1] - BIG_SHOT_GAP[0]); }
      return;
    }
    b.lifeT += dt;
    if (b.robbedT >= 0) b.robbedT += dt;
    const done = b.robbedT > 20 || b.lifeT > BIG_SHOT_STAY;
    const nobodyNear = players.every((p) => Math.hypot(p.x - b.move.x, p.z - b.move.z) > 35);
    if (done && (nobodyNear || b.lifeT > BIG_SHOT_STAY + 40)) {
      this.npcs.delete(b.id);
      for (const o of [...this.npcs.values()]) if (o.leader === b.id) {
        o.leader = "";
        // the entourage wanders off with the crowd rules (they vanish once nobody's near)
        if (o.state === "follow") o.state = "walk";
        if (players.every((p) => Math.hypot(p.x - o.move.x, p.z - o.move.z) > 30)) this.npcs.delete(o.id);
      }
      if (b.robbedT < 0) this.host.npcEvent({ t: "bigShot", npc: b.id, kind: b.kind, stage: "gone", x: b.move.x, z: b.move.z, by: "" });
    }
    // leftover entourage from earlier big shots: gone once nobody's around
    for (const o of [...this.npcs.values()]) {
      if ((o.kind === "bodyguard" || o.kind === "fan") && !o.leader && o.state !== "chase" && o.state !== "windup" && players.every((p) => Math.hypot(p.x - o.move.x, p.z - o.move.z) > 30)) this.npcs.delete(o.id);
    }
  }

  /** Everyone nearby freaks out; influencers start filming (double notoriety). */
  private panicBystanders(victim: NpcSimData, byPlayer: string) {
    for (const o of this.npcs.values()) {
      if (o === victim || SPECIAL_KINDS.has(o.kind) || o.state === "ko" || o.state === "chase" || o.state === "windup") continue;
      const d = Math.hypot(o.move.x - victim.move.x, o.move.z - victim.move.z);
      if (d > 12) continue;
      if (o.kind === "influencer" && o.state !== "flee") {
        o.state = "film"; o.stateT = 4; o.target = byPlayer;
        this.say(o, NPC_DEFS.influencer.lines.film, true);
        this.host.addNotoriety(byPlayer, 10);
      } else if (!NPC_DEFS[o.kind].fighter) {
        if (o.state !== "flee") { this.startFlee(o, victim.move.x, victim.move.z, byPlayer, 3); this.host.npcEvent({ t: "panic", npc: o.id }); }
        if (this.rng() < 0.3) this.say(o, BYSTANDER_SCREAMS);
      }
    }
  }

  // ------------------------------------------------------------------ thinking + moving
  tick(dt: number) {
    this.acc += dt;
    while (this.acc >= NPC_STEP) {
      this.acc -= NPC_STEP;
      this.step(NPC_STEP);
    }
  }

  private step(dt: number) {
    this.bigShots(dt);
    const gone: NpcSimData[] = [];
    const players = this.host.playersForNpcs();
    const pById = new Map(players.map((p) => [p.id, p]));
    for (const n of this.npcs.values()) {
      const def = NPC_DEFS[n.kind];
      if (n.leader && n.state === "walk") n.state = "follow"; // entourage: back to the boss after a fight / panic
      n.sayCd -= dt;
      n.attackCd = Math.max(0, n.attackCd - dt);
      if (n.stateT > 0) n.stateT -= dt;
      let tx = n.move.x, tz = n.move.z, speed = 0;
      let face: number | null = null;

      const cop = n.kind === "cop" ? this.host.copBrain(n, dt) : null;
      if (cop) { tx = cop.tx; tz = cop.tz; speed = cop.speed; face = cop.face; }
      else if (n.kind !== "cop") switch (n.state) {
        case "walk": {
          const g = this.graph[n.node], pg = this.graph[n.prevNode];
          // walk slightly to one side of the route line (like a real sidewalk), and start turning
          // toward the next corner a little early so paths curve instead of snapping 90 degrees
          const sx = g.x - pg.x, sz = g.z - pg.z, sl = Math.hypot(sx, sz);
          const ox = sl > 0.01 ? (sz / sl) * n.lane : 0, oz = sl > 0.01 ? (-sx / sl) * n.lane : 0;
          tx = g.x + ox; tz = g.z + oz; speed = def.walk * n.pace;
          if (Math.hypot(tx - n.move.x, tz - n.move.z) < 1.3) {
            n.prevNode = n.node;
            n.node = this.pickNext(n);
            if (this.rng() < 0.12) { n.state = "idle"; n.stateT = 1 + this.rng() * 2.5; }
          }
          if (n.sayCd <= 0 && this.rng() < 0.004) this.say(n, def.lines.idle);
          break;
        }
        case "follow": {
          const L = this.npcs.get(n.leader);
          if (!L) { n.state = "walk"; n.leader = ""; break; }
          // a step behind the boss, one to each side
          const fx = Math.sin(L.move.yaw), fz = Math.cos(L.move.yaw);
          tx = L.move.x - fx * 1.3 + fz * n.lane; tz = L.move.z - fz * 1.3 - fx * n.lane;
          const d = Math.hypot(tx - n.move.x, tz - n.move.z);
          speed = d < 0.4 ? 0 : Math.min(def.flee, Math.max(L.curSpeed, d * 1.6));
          if (L.state === "flee") speed = def.flee;
          if (n.sayCd <= 0 && this.rng() < 0.004) this.say(n, def.lines.idle);
          break;
        }
        case "idle": {
          // glance around now and then instead of standing frozen
          n.lookT -= dt;
          if (n.lookT <= 0) { n.lookT = 0.8 + this.rng() * 1.6; n.lookYaw = n.move.yaw + (this.rng() - 0.5) * 2.2; }
          face = n.lookYaw;
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "film": {
          const p = pById.get(n.target);
          if (p) face = Math.atan2(p.x - n.move.x, p.z - n.move.z);
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "stunned": {
          if (n.stateT <= 0 && n.kind === "raccoon") { n.state = "scram"; break; }
          if (n.stateT <= 0) {
            if (def.fighter && n.target) { n.state = "chase"; n.chaseT = 0; this.say(n, def.lines.fight, true); }
            else this.startFlee(n, n.fromX, n.fromZ, n.target, 3.5);
          }
          break;
        }
        case "flee": {
          const g = this.graph[n.node];
          tx = g.x; tz = g.z; speed = def.flee;
          if (Math.hypot(g.x - n.move.x, g.z - n.move.z) < 0.8) {
            // keep going away from where the trouble was
            const links = g.links.filter((l) => l !== n.prevNode);
            let best = links[0] ?? n.prevNode, bestD = -1;
            for (const l of links) { const q = this.graph[l]; const d = Math.hypot(q.x - n.fromX, q.z - n.fromZ); if (d > bestD) { bestD = d; best = l; } }
            n.prevNode = n.node; n.node = best;
          }
          if (n.stateT <= 0) n.state = "walk";
          break;
        }
        case "chase": {
          const p = pById.get(n.target);
          n.chaseT += dt;
          if (!p || !p.connected || p.knocked || n.chaseT > CHASE_GIVE_UP || Math.hypot(p.x - n.move.x, p.z - n.move.z) > 20) {
            n.state = "huff"; n.stateT = 1.5; n.target = "";
            break;
          }
          tx = p.x; tz = p.z; speed = 5.6;
          const d = Math.hypot(p.x - n.move.x, p.z - n.move.z);
          if (d < ATTACK_RANGE && n.attackCd <= 0 && !p.immune) { n.state = "windup"; n.stateT = WINDUP; }
          else if (d < 1.1) speed = 0;
          break;
        }
        case "windup": {
          const p = pById.get(n.target);
          if (p) face = Math.atan2(p.x - n.move.x, p.z - n.move.z);
          if (n.stateT <= 0) {
            n.attackCd = 0.9;
            let hit = false;
            if (p && !p.knocked && !p.immune) {
              const d = Math.hypot(p.x - n.move.x, p.z - n.move.z);
              const ang = Math.abs(angleDiff(Math.atan2(p.x - n.move.x, p.z - n.move.z), n.move.yaw));
              hit = d < STRIKE_RANGE && ang < 1.2 && Math.abs(p.y - n.move.y) < 1.2;
            }
            this.host.npcEvent({ t: "npcAttack", npc: n.id, p: n.target, hit });
            n.state = "chase";
            // the World decides if that was the knockout blow (and may switch us to "gloat")
            if (hit) this.host.npcHitPlayer(n.id, n.target, false);
          }
          break;
        }
        case "sneak": {
          n.lifeT += dt;
          const t = this.host.raccoonTarget(n.fortSlot);
          if (!t || n.lifeT > 25) { n.state = "scram"; break; } // nothing to steal / took too long
          tx = t.x; tz = t.z; speed = def.walk;
          if (Math.hypot(t.x - n.move.x, t.z - n.move.z) < 0.9 && this.host.raccoonGrab(n.id, t.id)) {
            n.carry = t.id; n.state = "escape";
            this.say(n, def.lines.win, true);
          }
          break;
        }
        case "escape": case "scram": {
          n.lifeT += dt;
          const wp = n.path[0];
          if (!wp) { gone.push(n); break; }
          tx = wp.x; tz = wp.z; speed = n.state === "escape" ? def.flee : def.flee * 1.2;
          if (Math.hypot(wp.x - n.move.x, wp.z - n.move.z) < 1.2) { n.path.shift(); if (!n.path.length) gone.push(n); }
          if (n.lifeT > 60) gone.push(n);
          break;
        }
        case "work": case "cower": {
          const post = n.post;
          if (!post) { n.state = "walk"; break; }
          if (n.state === "cower" && n.stateT <= 0) n.state = "work";
          const d = Math.hypot(post.x - n.move.x, post.z - n.move.z);
          if (d > 0.3) { tx = post.x; tz = post.z; speed = def.walk; } else face = post.yaw;
          if (n.state === "work" && n.sayCd <= 0 && this.rng() < 0.002) {
            // greet customers who come near
            if (players.some((p) => Math.hypot(p.x - n.move.x, p.z - n.move.z) < 5)) this.say(n, def.lines.idle);
          }
          break;
        }
        case "gloat": if (n.stateT <= 0) { n.state = "walk"; n.target = ""; } break;
        case "huff": if (n.stateT <= 0) n.state = "walk"; break;
        case "ko": if (n.stateT <= 0) this.startFlee(n, n.move.x + 1, n.move.z, n.target, 3); break;
      }

      // steer toward (tx, tz) using the same movement rules as players
      const m = n.move;
      const dx = tx - m.x, dz = tz - m.z;
      const dist = Math.hypot(dx, dz);
      let wantYaw = face ?? (dist > 0.05 ? Math.atan2(dx, dz) : m.yaw);
      // walk around parked cars, benches, bins... instead of pushing into them (chasers and
      // fleeing people head straight for their target, so the route map alone doesn't cover them)
      if (face === null && speed > 0 && dist > 0.6 && n.state !== "ko" && n.state !== "stunned") wantYaw = this.avoid(n, wantYaw, dist, dt);
      const urgent = n.state === "chase" || n.state === "flee" || n.state === "escape" || n.state === "scram" || n.state === "sneak" || n.kind === "cop";
      m.yaw = turnToward(m.yaw, wantYaw, (urgent ? 8 : n.state === "idle" ? 2 : 3.2) * dt);
      // slow down while turning sharply, and ease speed up/down (no instant starts/stops)
      const err = Math.abs(angleDiff(wantYaw, m.yaw));
      const want = dist > 0.05 ? speed * Math.max(0.3, Math.cos(Math.min(err, Math.PI / 2))) : 0;
      const accel = urgent ? 9 : 2.5;
      n.curSpeed += Math.max(-accel * dt * 1.5, Math.min(accel * dt, want - n.curSpeed));
      m.carryMul = n.curSpeed / PLAYER.walkSpeed;
      const input: MoveInput = { seq: 0, mx: 0, mz: n.curSpeed > 0.05 ? 1 : 0, yaw: m.yaw, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false };
      if (n.state === "ko" || n.state === "stunned") { input.mz = 0; n.curSpeed = 0; }
      stepMovement(m, input, this.host.arena, dt);

      // stuck? (walked into something for too long) -> pick another route
      if (speed > 0) {
        if (dist > n.lastDist - 0.01) n.stuckT += dt; else n.stuckT = 0;
        n.lastDist = dist;
        if (n.stuckT > 2.5) {
          n.stuckT = 0; n.lastDist = 99;
          n.avoidSide = -n.avoidSide; n.avoidT = 1.5; // try going round the other way
          if (n.kind === "raccoon") { m.vx += (this.rng() - 0.5) * 4; m.vz += (this.rng() - 0.5) * 4; } // wiggle free
          else if (n.kind === "cop") { n.path = []; if (n.state === "chase") { n.state = "search"; n.lostT = 0; } } // re-plan a route
          else if (n.state === "chase") { n.state = "huff"; n.stateT = 1.5; n.target = ""; } // can't reach you: give up
          else n.node = this.nearestClearNode(m.x, m.z, n.node);
        }
      }
    }
    for (const n of gone) {
      if (!this.npcs.has(n.id)) continue;
      this.npcs.delete(n.id);
      this.host.raccoonGone(n.id, n.carry, n.fortSlot);
    }
    this.separate();
  }

  /** Raccoons still out and about (the event ends when they're all gone). */
  raccoonCount() { let c = 0; for (const n of this.npcs.values()) if (n.kind === "raccoon") c++; return c; }

  /** Send every raccoon running (end of round). Carried loot is dropped where they stand. */
  clearRaccoons() {
    for (const n of [...this.npcs.values()]) {
      if (n.kind !== "raccoon") continue;
      if (n.carry) this.host.npcDropCarried(n.carry, n.move.x, n.move.y + 0.8, n.move.z, 0, 0);
      this.npcs.delete(n.id);
    }
  }

  /** Called by the World when a chasing NPC's hit knocks a player down. */
  gloat(npcId: string) {
    const n = this.npcs.get(npcId);
    if (!n) return;
    n.state = "gloat"; n.stateT = 2;
    this.say(n, NPC_DEFS[n.kind].lines.win, true);
  }

  /** Is anything solid (car, bench, wall...) at body height around this point? */
  private solidAt(x: number, z: number, y: number, r: number): boolean {
    for (const b of nearBoxes(this.host.arena, x, z, r + 1)) {
      if (b.y + b.h / 2 <= y + PLAYER.stepHeight || b.y - b.h / 2 >= y + 1.6) continue; // steppable / overhead
      if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
    }
    return false;
  }

  /** Straight walk from a to b doesn't hit anything? */
  lineClear(ax: number, az: number, bx: number, bz: number, y: number): boolean {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i <= steps; i++) if (this.solidAt(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps, y, PLAYER.radius)) return false;
    return true;
  }

  /**
   * Feelers: if the way ahead is blocked, turn to the first clear direction (keeping to one side
   * while going round the same obstacle). Cheap: two probe points per try, grid-culled boxes.
   */
  private avoid(n: NpcSimData, yaw: number, dist: number, dt: number): number {
    const m = n.move, r = PLAYER.radius + 0.12;
    const look = Math.min(1.3, dist);
    const clear = (a: number) => !this.solidAt(m.x + Math.sin(a) * look * 0.5, m.z + Math.cos(a) * look * 0.5, m.y, r)
      && !this.solidAt(m.x + Math.sin(a) * look, m.z + Math.cos(a) * look, m.y, r);
    n.avoidT = Math.max(0, n.avoidT - dt);
    if (clear(yaw)) return yaw;
    // choose a side once, and keep it while the way stays blocked (re-choosing every frame dithers)
    if (n.avoidT <= 0) n.avoidSide = clear(yaw + 0.8) || !clear(yaw - 0.8) ? 1 : -1;
    n.avoidT = 1.2;
    for (const side of [n.avoidSide, -n.avoidSide]) {
      for (const off of [0.45, 0.9, 1.35, 1.7, 2.1, 2.6]) {
        if (clear(yaw + side * off)) { n.avoidSide = side; return yaw + side * off; }
      }
    }
    return yaw;
  }

  /** Nearest route point we can actually walk to in a straight line (falls back to nearest). */
  nearestClearNode(x: number, z: number, avoid: number): number {
    const y = 0;
    const order = this.graph.filter((g) => g.id !== avoid).map((g) => ({ g, d: Math.hypot(g.x - x, g.z - z) })).sort((a, b) => a.d - b.d);
    for (const { g, d } of order.slice(0, 8)) if (d < 30 && this.lineClear(x, z, g.x, g.z, y)) return g.id;
    return order[0]?.g.id ?? 0;
  }

  /** Move a pedestrian sideways a little, unless that would put them into a wall. (Cars shove people with this too.) */
  nudge(m: MoveState, dx: number, dz: number) {
    const x = m.x + dx, z = m.z + dz, r = PLAYER.radius;
    for (const b of nearBoxes(this.host.arena, x, z, 1)) {
      if (b.y + b.h / 2 <= m.y + 0.35 || b.y - b.h / 2 >= m.y + 1.6) continue; // curbs / overhead
      if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return;
    }
    m.x = x; m.z = z;
  }

  /** Pedestrians gently push apart so crowds don't stack into one blob. */
  private separate() {
    const list = [...this.npcs.values()];
    // step aside for players (they don't walk through you any more); knocked-out people stay put
    for (const p of this.host.playersForNpcs()) {
      if (!p.connected) continue;
      for (const n of list) {
        if (n.state === "ko") continue;
        const dx = n.move.x - p.x, dz = n.move.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 > 0.56 || d2 < 1e-8 || Math.abs(n.move.y - p.y) > 1.2) continue;
        const d = Math.sqrt(d2), push = (0.75 - d) * 0.6;
        this.nudge(n.move, (dx / d) * push, (dz / d) * push);
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].move, b = list[j].move;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 0.64 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
        this.nudge(a, -(dx / d) * push, -(dz / d) * push);
        this.nudge(b, (dx / d) * push, (dz / d) * push);
      }
    }
  }

  /** Keep the crowd fresh: robbed pedestrians far from everyone are replaced by new ones. */
  recycle() {
    const players = this.host.playersForNpcs();
    for (const n of [...this.npcs.values()]) {
      if (SPECIAL_KINDS.has(n.kind) || !n.robbed || n.state === "chase" || n.state === "windup") continue;
      if (players.every((p) => Math.hypot(p.x - n.move.x, p.z - n.move.z) > 30)) this.npcs.delete(n.id);
    }
    const walkers = () => { let c = 0; for (const n of this.npcs.values()) if (!SPECIAL_KINDS.has(n.kind)) c++; return c; };
    while (walkers() < this.target) if (!this.spawn(undefined, true)) break;
  }
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(cur: number, want: number, maxStep: number) {
  const d = angleDiff(want, cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
````

## FILE: shared/src/police.ts

````ts
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
// BUSTED: everything you carry is confiscated (gone), heat resets, 30 s in a cell at the station.
// JAIL: pick the lock (lockpick.ts) to break out early into the back alley (still wanted, 1 star),
// or serve the 30 s and walk out the front door clean.
import { nearBoxes, type Box } from "./arena.js";
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
export const COP_RUN = 5.6; // walk 5.0 < cop 5.6 < sprint 7.8 (Blake: light nerf, was 6.1)
export const COP_JOG = 3.8;
export const COP_SIGHT = 24;
export const COP_HEAR = 3; // this close they notice you even without line of sight
const GRAB_RANGE = 1.2; // start the grab
const GRAB_REACH = 1.9; // still in reach when the grab lands
const GRAB_WINDUP = 0.55; // time to react (dodge / keep running)
const LOSE_SIGHT = 0.8; // seconds without seeing you before a chasing cop starts searching
const SEARCH_TIME = 6;
const MAX_COPS = 6;
const MAX_CARS = 2;
const COOL_DELAY = 3; // unseen this long -> heat cools fast
const COOL_FAST = 4; // heat per second
const COOL_SLOW = 0.6;
const COOL_UNWANTED = 1;
export const COPCAR = { speed: 15, halfLen: 2.2, halfWidth: 1.0, deployDist: 15 };

export interface CopCarSim {
  id: string; x: number; z: number; yaw: number; v: number;
  target: string;
  mode: "drive" | "parked" | "leave";
  route: { x: number; z: number }[];
  replanT: number; calmT: number; lifeT: number; deployed: boolean;
}

export type PoliceEvent =
  | { t: "copSpawn"; npc: string; p: string }
  | { t: "spotted"; npc: string; p: string }
  | { t: "busted"; p: string; by: string; count: number; value: number; car: boolean }
  | { t: "released"; p: string; breakout: boolean }
  | { t: "lock"; p: string; r: LockResult }
  | { t: "copCar"; car: string; p: string; stage: "dispatch" | "deploy" | "leave" };

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
        if (p.jailT <= 0) this.release(p, false);
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
    for (const car of [...this.cars]) this.driveCar(car, dt);
  }

  private wanted(p: PlayerSim) { return p.connected && p.jailT <= 0 && p.respawnT <= 0; }

  /** Send cops (and at 3 stars a car) after anyone whose stars outnumber the cops on them. */
  private dispatch() {
    const w = this.w;
    const cops = this.cops();
    for (const p of w.players.values()) {
      if (!this.wanted(p)) continue;
      const stars = starsOf(p.notoriety);
      if (!stars) continue;
      const on = cops.filter((c) => c.target === p.id && c.state !== "leave").length;
      if (on < stars && cops.length < MAX_COPS && (this.nextCop.get(p.id) ?? 0) <= w.time) {
        const c = this.spawnCop(p);
        if (c) { cops.push(c); this.nextCop.set(p.id, w.time + 4); }
      }
      if (stars >= 3 && this.cars.length < MAX_CARS && !this.cars.some((c) => c.target === p.id && c.mode !== "leave") && (this.nextCarT.get(p.id) ?? 0) <= w.time) {
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
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && y > b.y - b.h / 2 && y < b.y + b.h / 2) return false;
      }
    }
    return true;
  }

  canSee(n: NpcSimData, p: PlayerSim): boolean {
    const m = p.move;
    const d = Math.hypot(m.x - n.move.x, m.z - n.move.z);
    if (d > COP_SIGHT || Math.abs(m.y - n.move.y) > 8) return false;
    if (d < COP_HEAR) return true;
    const eye = m.crouching || m.slideT > 0 ? 0.9 : 1.6; // your head; crouching behind a parked car (1.5 m) hides it
    return this.los(n.move.x, n.move.y + 1.6, n.move.z, m.x, m.y + eye, m.z);
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
      if (n.stateT <= 0) { n.state = p && this.wanted(p) ? "chase" : "leave"; n.lostT = 0; n.path = []; }
      return stay;
    }
    if (n.state !== "leave" && (!p || !this.wanted(p) || starsOf(p.notoriety) === 0)) {
      if (p && this.wanted(p)) this.say(n, NPC_DEFS.cop.lines.lost);
      this.leave(n);
    }
    if (n.state === "leave") return this.walkOff(n);
    const pl = p!;
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
          n.state = "windup"; n.stateT = m.knockT > 0 ? 0.25 : GRAB_WINDUP;
          this.say(n, NPC_DEFS.cop.lines.fight);
          w.emit({ t: "npcAttack", npc: n.id, p: pl.id, hit: false });
        }
        return { tx, tz, speed: d < 0.9 ? 0 : COP_RUN, face: null };
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
    n.state = "leave"; n.target = ""; n.path = []; n.lifeT = 0; n.sees = false;
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
    p.notoriety = 0; p.hitsTaken = 0; p.seenT = -99;
    const cells = w.arena.station?.cells ?? [];
    const taken = new Set([...w.players.values()].filter((o) => o !== p && o.jailT > 0).map((o) => o.jailCell));
    let cell = p.colorIdx % Math.max(1, cells.length);
    for (let i = 0; i < cells.length && taken.has(cell); i++) cell = (cell + 1) % cells.length;
    const c = cells[cell] ?? { x: 0, z: 0, yaw: 0 };
    w.movePlayer(p, c.x, c.z, c.yaw);
    p.jailT = JAIL_TIME; p.jailCell = cell;
    p.lockSeed = 1 + Math.floor(w.random() * 1e9);
    p.lock = newLockRun(p.lockSeed); p.lockT0 = w.time;
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
    if (car.mode === "leave") return;
    car.mode = "leave"; car.route = []; car.lifeT = 0;
    this.w.emit({ t: "copCar", car: car.id, p: car.target, stage: "leave" });
  }

  private driveCar(car: CopCarSim, dt: number) {
    const w = this.w;
    car.lifeT += dt;
    const p = w.players.get(car.target);
    const valid = !!p && this.wanted(p);
    if (car.mode !== "leave") {
      car.calmT = valid && starsOf(p!.notoriety) >= 2 ? 0 : car.calmT + dt; // stays on you down to 2 stars
      if (car.calmT > 4) this.carLeave(car);
    }
    let want = 0;
    if (car.mode === "leave") {
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
````

## FILE: shared/src/props.ts

````ts
// Phase 3.5: loot sources around the city. Runs inside the World (server + solo).
//   - search (E): dumpsters and bins -> random junk (dumpsters sometimes hide a raccoon)
//   - smash (punch): phone booths, vending machines, parking meters, newspaper boxes, parked cars
//   - rob a shop: hold R at the till for 3 s (cash bundle), or grab (E) the whole cash register
//   - shoplifting: swipe something off a shelf while the cashier is watching -> they yell (heat)
// Every source refills after a while (parked cars: once per round). Loud things raise heat and
// set off alarms (the police will listen to those in Phase 4).
import { inRect, type PropDef, type PropKind } from "./arena.js";
import { pickWeighted } from "./npc.js";
import type { World, PlayerSim, ItemSim } from "./world.js";

export interface PropSim { def: PropDef; ready: boolean; t: number; alarmT: number; register: string; }

export const ROB_TIME = 3;
export const USE_RANGE = 2.4;

const REFILL: Record<PropKind, number> = { dumpster: 50, bin: 35, phone: 70, vending: 50, meter: 40, newsbox: 40, car: 1e9, till: 45 };
/** How far a prop's surface is from its centre (for punch / use reach). */
export const PROP_RADIUS: Record<PropKind, number> = { dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, meter: 0.15, newsbox: 0.3, car: 1.4, till: 0.3 };
export const SMASHABLE = new Set<PropKind>(["phone", "vending", "meter", "newsbox", "car"]);
export const SEARCHABLE = new Set<PropKind>(["dumpster", "bin"]);

const DUMPSTER_LOOT: [string, number][] = [
  ["pocket_lint", 3], ["half_sandwich", 4], ["newspaper", 4], ["soda_can", 3], ["candy_bar", 2], ["expired_coupon", 3],
  ["rubber_chicken", 2], ["mixtape", 2], ["trash_bag", 2], ["cursed_sneakers", 1], ["snow_globe", 0.6], ["mystery_wallet", 0.4],
  ["lucky_pigeon", 0.3], ["golden_spork", 0.15],
];
const BIN_LOOT: [string, number][] = [
  ["newspaper", 4], ["soda_can", 4], ["half_sandwich", 3], ["expired_coupon", 3], ["pocket_lint", 2], ["candy_bar", 1], ["coin_pile", 1], ["mixtape", 1],
];
const CAR_LOOT: [string, number][] = [
  ["phone_handset", 3], ["sunglasses", 3], ["mystery_wallet", 2], ["coin_pile", 3], ["fancy_earbuds", 2], ["laptop", 1], ["energy_drink", 2],
];
const SNACKS: [string, number][] = [["candy_bar", 3], ["soda_can", 3], ["energy_drink", 2]];

export type PropEvent =
  | { t: "search"; p: string; prop: string; found: number; raccoon: boolean }
  | { t: "smash"; p: string; prop: string; kind: PropKind }
  | { t: "alarm"; kind: "shop" | "car"; prop: string; x: number; z: number }
  | { t: "robStart"; p: string; prop: string }
  | { t: "robCancel"; p: string; prop: string }
  | { t: "robDone"; p: string; prop: string; value: number }
  | { t: "shoplift"; p: string; shop: number; npc: string }
  | { t: "empty"; p: string; prop: string };

export class PropSystem {
  readonly props = new Map<string, PropSim>();

  constructor(private w: World) {
    for (const def of w.arena.props ?? []) this.props.set(def.id, { def, ready: true, t: 0, alarmT: 0, register: "" });
  }

  /** New round: everything full again, fresh registers on the counters. */
  reset() {
    for (const ps of this.props.values()) {
      ps.ready = true; ps.t = 0; ps.alarmT = 0;
      if (ps.def.kind === "till") {
        const d = ps.def;
        ps.register = this.w.placeItem("cash_register", d.x, d.y, d.z);
        const it = this.w.items.get(ps.register)!;
        it.shop = d.shop ?? -1;
        it.body.rot = d.yaw;
      }
    }
  }

  tick(dt: number) {
    for (const ps of this.props.values()) {
      if (!ps.ready) { ps.t -= dt; if (ps.t <= 0) ps.ready = true; }
      if (ps.alarmT > 0) ps.alarmT = Math.max(0, ps.alarmT - dt);
    }
    // hold-ups in progress
    for (const p of this.w.players.values()) {
      const r = p.rob;
      if (!r) continue;
      const ps = this.props.get(r.prop);
      const reg = ps ? this.registerOnCounter(ps) : null;
      const moved = Math.hypot(p.move.x - r.x, p.move.z - r.z) > 1.2;
      if (!ps || !ps.ready || !reg || moved || !p.connected || p.move.knockT > 0) { this.cancelRob(p); continue; }
      const cashier = this.w.npc.cashierOf(ps.def.shop ?? -1);
      if (cashier) this.w.npc.cower(cashier.id, 1);
      r.t += dt;
      if (r.t >= ROB_TIME) {
        p.rob = null;
        const d = ps.def;
        const ax = p.move.x - d.x, az = p.move.z - d.z;
        const id = this.w.popLoot("cash_bundle", d.x, d.y + 0.4, d.z, ax, az);
        ps.ready = false; ps.t = REFILL.till;
        this.w.addHeat(p, 20);
        this.alarm(ps, "shop");
        this.w.emit({ t: "robDone", p: p.id, prop: d.id, value: this.w.items.get(id)?.value ?? 0 });
      }
    }
  }

  /** The cash register item, if it's still sitting on this till's counter. */
  private registerOnCounter(ps: PropSim): ItemSim | null {
    const it = ps.register ? this.w.items.get(ps.register) : undefined;
    if (!it || it.mode !== "free") return null;
    return Math.hypot(it.body.x - ps.def.x, it.body.z - ps.def.z) < 1.2 ? it : null;
  }

  /** Can this player reach the prop (close enough and roughly facing it)? */
  inReach(p: PlayerSim, ps: PropSim, extra = 0): boolean {
    const d = ps.def, m = p.move;
    const dx = d.x - m.x, dz = d.z - m.z;
    const dist = Math.hypot(dx, dz);
    if (dist - PROP_RADIUS[d.kind] > USE_RANGE + extra) return false;
    if (Math.abs(d.y - m.y) > 2.2) return false;
    const facing = (dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw)) / Math.max(0.001, dist);
    return dist < 1.2 || facing > 0.2;
  }

  /** E on a dumpster / bin (search) or a till (start a hold-up). */
  use(p: PlayerSim, propId: string) {
    const ps = this.props.get(propId);
    if (!ps || !this.inReach(p, ps, 0.4)) return;
    const d = ps.def;
    if (d.kind === "till") return this.startRob(p, ps);
    if (!SEARCHABLE.has(d.kind)) return;
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return; }
    ps.ready = false; ps.t = REFILL[d.kind];
    const table = d.kind === "dumpster" ? DUMPSTER_LOOT : BIN_LOOT;
    const n = d.kind === "dumpster" ? 2 + (this.w.random() < 0.5 ? 1 : 0) : 1 + (this.w.random() < 0.4 ? 1 : 0);
    const top = d.kind === "dumpster" ? 1.6 : 1.2;
    for (let i = 0; i < n; i++) {
      const a = this.w.random() * Math.PI * 2;
      this.w.popLoot(pickWeighted(table, () => this.w.random()), d.x, top, d.z, p.move.x - d.x + Math.cos(a) * 0.8, p.move.z - d.z + Math.sin(a) * 0.8);
    }
    const raccoon = d.kind === "dumpster" && this.w.random() < 0.12;
    if (raccoon) this.w.npc.spawnCritter(d.x, d.z, p.move.x, p.move.z);
    this.w.emit({ t: "search", p: p.id, prop: d.id, found: n, raccoon });
  }

  private startRob(p: PlayerSim, ps: PropSim) {
    if (!ps.ready || !this.registerOnCounter(ps)) { this.w.emit({ t: "empty", p: p.id, prop: ps.def.id }); return; }
    if (p.rob) return;
    p.rob = { prop: ps.def.id, t: 0, x: p.move.x, z: p.move.z };
    const cashier = this.w.npc.cashierOf(ps.def.shop ?? -1);
    if (cashier) { this.w.npc.cower(cashier.id, ROB_TIME + 1); this.w.npc.cashierSay(cashier.id, "holdup"); }
    this.w.emit({ t: "robStart", p: p.id, prop: ps.def.id });
  }

  cancelRob(p: PlayerSim) {
    if (!p.rob) return;
    this.w.emit({ t: "robCancel", p: p.id, prop: p.rob.prop });
    p.rob = null;
  }

  /** A punch that landed on a prop. Returns true if something happened. */
  smash(p: PlayerSim, propId: string): boolean {
    const ps = this.props.get(propId);
    if (!ps || !SMASHABLE.has(ps.def.kind)) return false;
    const d = ps.def;
    this.w.emit({ t: "smash", p: p.id, prop: d.id, kind: d.kind });
    if (!ps.ready) { this.w.emit({ t: "empty", p: p.id, prop: d.id }); return true; }
    ps.ready = false; ps.t = REFILL[d.kind];
    const ax = p.move.x - d.x, az = p.move.z - d.z;
    const pop = (type: string, y = 1.2) => this.w.popLoot(type, d.x, y, d.z, ax, az);
    const rnd = () => this.w.random();
    switch (d.kind) {
      case "phone": pop("phone_handset", 1.5); if (rnd() < 0.3) pop("coin_pile"); break;
      case "vending": { const n = 1 + (rnd() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) pop(pickWeighted(SNACKS, rnd)); if (rnd() < 0.5) pop("coin_pile", 0.8); break; }
      case "meter": pop("coin_pile", 1.3); if (rnd() < 0.3) pop("coin_pile", 1.3); break;
      case "newsbox": pop("newspaper", 1.0); if (rnd() < 0.25) pop("expired_coupon", 1.0); break;
      case "car": pop(pickWeighted(CAR_LOOT, rnd), 1.3); this.alarm(ps, "car"); this.w.addHeat(p, 8); break;
    }
    this.w.addHeat(p, 4);
    return true;
  }

  private alarm(ps: PropSim, kind: "shop" | "car") {
    ps.alarmT = kind === "car" ? 8 : 6;
    this.w.emit({ t: "alarm", kind, prop: ps.def.id, x: ps.def.x, z: ps.def.z });
  }

  /** Someone picked up an item that belongs to a shop (shelf stock or the register). */
  onShopGrab(p: PlayerSim, it: ItemSim) {
    const shop = (this.w.arena.shops ?? []).find((s) => s.id === it.shop);
    it.shop = -1;
    if (!shop) return;
    const cashier = this.w.npc.cashierOf(shop.id);
    const till = [...this.props.values()].find((x) => x.def.kind === "till" && x.def.shop === shop.id);
    if (it.type === "cash_register") {
      // going loud: the whole till
      if (till) { till.register = ""; this.alarm(till, "shop"); }
      this.w.addHeat(p, 25);
      if (cashier) { this.w.npc.cower(cashier.id, 5); this.w.npc.cashierSay(cashier.id, "yell"); }
      return;
    }
    // shoplifting: only counts if the cashier is awake and you're inside the shop
    if (!cashier || cashier.state === "ko" || !inRect(shop.rect, p.move.x, p.move.z, 0.5)) return;
    this.w.addHeat(p, 8);
    this.w.npc.cashierSay(cashier.id, "yell");
    this.w.emit({ t: "shoplift", p: p.id, shop: shop.id, npc: cashier.id });
  }

  /** For syncing: which props are empty / alarmed right now. */
  stateOf(id: string): { ready: boolean; alarm: boolean } {
    const ps = this.props.get(id)!;
    return { ready: ps.ready, alarm: ps.alarmT > 0 };
  }
}
````

## FILE: shared/src/protocol.ts

````ts
// Names of messages and rooms shared between client and server.

export const ROOM_NAME = "fort_room";

export const MSG = {
  /** client -> server: batch of MoveInput */
  INPUT: "in",
  /** client -> server: room owner starts the match (Phase 0: just enters the arena) */
  START: "start",
  /** server -> client: toast/announcement text */
  ANNOUNCE: "announce",
  /** client -> server: loot action (grab / drop / throw / cycle) */
  ACTION: "act",
  /** server -> client: batch of WorldEvents (sounds, effects) */
  EVENTS: "ev",
} as const;

export type RoomPhase = "lobby" | "arena";

export interface JoinOptions {
  name: string;
  /** room code the player typed or got from the link */
  code?: string;
}
````

## FILE: shared/src/snapshot.ts

````ts
// Turns a World into the plain data clients see. Used by the server (copied into the synced
// schema) and by solo mode (read directly), so the client reads ONE shape either way.
import type { World } from "./world.js";
import { MOVE_NUM_KEYS, MOVE_BOOL_KEYS } from "./movement.js";
import { lootDef } from "./loot.js";
import { LOCK_TIME, ROUNDS, type EventView } from "./match.js";

export interface PlayerView extends Record<string, any> {
  x: number; y: number; z: number; yaw: number; pitch: number;
  name: string; colorIdx: number; connected: boolean; lastSeq: number;
  hand: string; p0: string; p1: string; p2: string; sel: number;
  /** heat 0..100, rounded (wanted stars at 30 / 60 / 90) */
  heat: number;
  /** Phase 3: cash from finished rounds + value locked in the fort right now */
  cash: number;
  bank: number;
  /** Phase 3.5: seconds until respawn after a car wipeout (0 = fine); hold-up progress (-1 = none) */
  respawnT: number;
  robT: number;
  /** Phase 4: seconds of jail left (0 = free), your lock (seed; the client builds the same lock) */
  jailT: number;
  lockSeed: number;
  /** seconds on the server's lock clock (since you were locked up) */
  lockT: number;
}
export interface ItemView {
  type: string;
  /** 0 when the value is secret (mystery items) */
  value: number;
  x: number; y: number; z: number; rot: number;
  mode: string; holder: string; holder2: string; resting: boolean;
  /** banking progress in a fort yard: 0 = not banking, 1..99 = locking, 100 = locked */
  lock: number;
  /** fort slot it is banking in (-1 none) */
  fort: number;
  /** happy hour bonus (1 or 2) */
  mult: number;
  chute: boolean;
}

/** Common "map-like" interface: both Map and Colyseus MapSchema provide forEach(value, key) and get(). */
export interface MapLike<T> { forEach(cb: (v: T, k: string) => void): void; get(k: string): T | undefined; size: number; }

export interface NpcView {
  kind: string;
  x: number; y: number; z: number; yaw: number;
  state: string;
  target: string;
  robbed: boolean;
}

/** Round loop + current city event (flat fields so the server can sync them directly). */
export interface MatchView {
  phase: string; // lobby | intro | scavenge | tally | over
  round: number;
  rounds: number;
  timeLeft: number;
  /** last round's results, JSON of RoundLine[] */
  results: string;
  evKind: string; evStage: string; evX: number; evZ: number; evR: number; evT: number;
  truckOn: boolean; truckX: number; truckZ: number; truckYaw: number;
}

/** Phase 3.5: dynamic state of a static prop (dumpster emptied, phone booth smashed, alarm ringing). */
export interface PropView { ready: boolean; alarm: boolean; }
export interface CarView { x: number; z: number; yaw: number; }
/** Phase 4: police cruisers chasing someone. */
export interface CopCarView { x: number; z: number; yaw: number; siren: boolean; }

export interface WorldView extends Partial<MatchView> {
  players: MapLike<PlayerView>;
  items: MapLike<ItemView>;
  npcs?: MapLike<NpcView>;
  props?: MapLike<PropView>;
  cars?: MapLike<CarView>;
  copCars?: MapLike<CopCarView>;
  phase: string;
  ownerId: string;
  code: string;
}

export const PLAYER_EXTRA_KEYS = ["hand", "p0", "p1", "p2", "sel", "lastSeq", "connected", "name", "colorIdx"] as const;
export const ITEM_KEYS = ["type", "value", "x", "y", "z", "rot", "mode", "holder", "holder2", "resting"] as const;

export function playerView(w: World, id: string, out: Record<string, any> = {}): PlayerView {
  const p = w.players.get(id)!;
  for (const k of MOVE_NUM_KEYS) out[k] = p.move[k];
  for (const k of MOVE_BOOL_KEYS) out[k] = p.move[k];
  out.name = p.name; out.colorIdx = p.colorIdx; out.connected = p.connected; out.lastSeq = p.lastSeq;
  out.hand = p.hand; out.p0 = p.pockets[0]; out.p1 = p.pockets[1]; out.p2 = p.pockets[2]; out.sel = p.sel;
  out.heat = Math.round(p.notoriety);
  out.cash = p.cash;
  out.bank = w.match.bankedValue(p);
  out.respawnT = Math.max(0, Math.ceil(p.respawnT * 10) / 10);
  out.robT = p.rob ? Math.round(p.rob.t * 20) / 20 : -1;
  out.jailT = p.jailT > 0 ? Math.max(0.1, Math.ceil(p.jailT * 10) / 10) : 0;
  out.lockSeed = p.jailT > 0 ? p.lockSeed : 0;
  out.lockT = p.jailT > 0 ? Math.floor((w.time - p.lockT0) * 20) / 20 : 0;
  return out as PlayerView;
}

export function itemView(w: World, id: string, out: Record<string, any> = {}): ItemView {
  const it = w.items.get(id)!;
  const b = it.body;
  out.type = it.type;
  out.value = lootDef(it.type).mystery ? 0 : it.value;
  out.x = b.x; out.y = b.y; out.z = b.z; out.rot = b.rot;
  out.mode = it.mode; out.holder = it.holder; out.holder2 = it.holder2; out.resting = b.resting;
  out.lock = it.locked ? 100 : it.fort >= 0 ? Math.min(99, Math.max(1, Math.floor((it.bankT / LOCK_TIME) * 100))) : 0;
  out.fort = it.fort; out.mult = it.mult; out.chute = it.chute;
  return out as ItemView;
}

export const NPC_KEYS = ["kind", "x", "y", "z", "yaw", "state", "target", "robbed"] as const;

export function npcView(w: World, id: string, out: Record<string, any> = {}): NpcView {
  const n = w.npc.npcs.get(id)!;
  out.kind = n.kind; out.x = n.move.x; out.y = n.move.y; out.z = n.move.z; out.yaw = n.move.yaw;
  out.state = n.state; out.target = n.target; out.robbed = n.robbed;
  return out as NpcView;
}

const evScratch: EventView = { kind: "", stage: "", x: 0, z: 0, r: 0, timeLeft: 0, truckOn: false, truckX: 0, truckZ: 0, truckYaw: 0 };
let lastResults: unknown = null, lastResultsJson = "[]";

/** Round loop state (writes only the flat fields, so it can target the synced room state). */
export function matchView(w: World, out: Record<string, any>): MatchView {
  const m = w.match;
  out.phase = m.phase; out.round = m.round; out.rounds = ROUNDS;
  out.timeLeft = Math.ceil(m.timeLeft * 10) / 10;
  if (m.results !== lastResults) { lastResults = m.results; lastResultsJson = JSON.stringify(m.results); }
  out.results = lastResultsJson;
  const e = m.view(evScratch);
  out.evKind = e.kind; out.evStage = e.stage; out.evX = e.x; out.evZ = e.z; out.evR = e.r; out.evT = Math.ceil(e.timeLeft);
  out.truckOn = e.truckOn; out.truckX = e.truckX; out.truckZ = e.truckZ; out.truckYaw = e.truckYaw;
  return out as MatchView;
}

export function propView(w: World, id: string, out: Record<string, any> = {}): PropView {
  const st = w.props.stateOf(id);
  out.ready = st.ready; out.alarm = st.alarm;
  return out as PropView;
}

export function carView(w: World, i: number, out: Record<string, any> = {}): CarView {
  const c = w.traffic.cars[i];
  out.x = c.x; out.z = c.z; out.yaw = c.yaw;
  return out as CarView;
}

export function copCarView(w: World, id: string, out: Record<string, any> = {}): CopCarView {
  const c = w.police.cars.find((x) => x.id === id)!;
  out.x = c.x; out.z = c.z; out.yaw = c.yaw; out.siren = c.mode !== "leave";
  return out as CopCarView;
}
````

## FILE: shared/src/traffic.ts

````ts
// Phase 3.5: traffic. Cars drive the two ring roads (right-hand lanes, both directions),
// ease round corners, queue behind each other and stop for pedestrians and the garbage truck.
// They do NOT stop for bandits: a moving car that hits you wipes you out (cartoon pancake),
// everything you carried spills on the road, and you respawn at your fort 10 s later.
// Runs inside the World on the server and in solo mode (deterministic: no randomness).
import { makeMoveState } from "./movement.js";
import { PLAYER } from "./constants.js";
import type { TrafficLoop } from "./arena.js";
import type { World, PlayerSim } from "./world.js";

export const CAR_HALF_LEN = 2.1;
export const CAR_HALF_WIDTH = 0.95;
export const WIPEOUT_TIME = 10;
const CORNER = 4; // metres of rounding either side of a corner
const ACCEL = 4, BRAKE = 12;

export interface CarSim { id: string; loop: number; s: number; v: number; x: number; z: number; yaw: number; honkCd: number; color: number; }

export type TrafficEvent =
  | { t: "wipeout"; p: string; car: string; x: number; z: number }
  | { t: "respawn"; p: string }
  | { t: "honk"; car: string; x: number; z: number };

interface LoopGeo { def: TrafficLoop; cum: number[]; len: number; }

function loopGeo(def: TrafficLoop): LoopGeo {
  const cum = [0];
  const pts = def.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { def, cum, len: cum[pts.length] };
}

/** Point on the straight polyline at distance s. */
function onLine(g: LoopGeo, s: number) {
  s = ((s % g.len) + g.len) % g.len;
  const pts = g.def.points;
  let i = 0;
  while (i < pts.length - 1 && s > g.cum[i + 1]) i++;
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const seg = g.cum[i + 1] - g.cum[i];
  const k = seg > 0 ? (s - g.cum[i]) / seg : 0;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}

/** Position + heading at distance s, with corners rounded (quadratic curve). */
export function sampleLoop(g: LoopGeo, s: number): { x: number; z: number; yaw: number; corner: boolean } {
  s = ((s % g.len) + g.len) % g.len;
  const pts = g.def.points;
  for (let k = 0; k < pts.length; k++) {
    const S = g.cum[k]; // corner k sits at distance cum[k] (cum[0] = 0 = also the end of the loop)
    let d = s - S;
    if (d > g.len / 2) d -= g.len;
    if (d < -g.len / 2) d += g.len;
    if (Math.abs(d) <= CORNER) {
      const A = onLine(g, S - CORNER), B = onLine(g, S + CORNER), C = pts[k];
      const u = (d + CORNER) / (2 * CORNER);
      const x = (1 - u) * (1 - u) * A.x + 2 * u * (1 - u) * C.x + u * u * B.x;
      const z = (1 - u) * (1 - u) * A.z + 2 * u * (1 - u) * C.z + u * u * B.z;
      const tx = 2 * (1 - u) * (C.x - A.x) + 2 * u * (B.x - C.x);
      const tz = 2 * (1 - u) * (C.z - A.z) + 2 * u * (B.z - C.z);
      return { x, z, yaw: Math.atan2(tx, tz), corner: true };
    }
  }
  const p = onLine(g, s);
  return { x: p.x, z: p.z, yaw: Math.atan2(p.dx, p.dz), corner: false };
}

export class TrafficSystem {
  readonly cars: CarSim[] = [];
  private loops: LoopGeo[];

  constructor(private w: World) {
    this.loops = (w.arena.traffic ?? []).map(loopGeo);
    let n = 0;
    this.loops.forEach((g, li) => {
      for (let i = 0; i < g.def.cars; i++) {
        const s = (g.len * i) / g.def.cars + li * 7;
        const p = sampleLoop(g, s);
        this.cars.push({ id: "c" + ++n, loop: li, s, v: g.def.speed, x: p.x, z: p.z, yaw: p.yaw, honkCd: 0, color: n % 8 });
      }
    });
  }

  tick(dt: number) {
    const w = this.w;
    // respawn timers for wiped-out bandits
    for (const p of w.players.values()) {
      if (p.respawnT <= 0) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) this.respawn(p);
    }
    const truck = w.match.truck;
    for (const car of this.cars) {
      const g = this.loops[car.loop];
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const rel = (x: number, z: number) => {
        const dx = x - car.x, dz = z - car.z;
        return { along: dx * fx + dz * fz, side: dx * fz - dz * fx };
      };
      // what's ahead?
      let target = g.def.speed * (sampleLoop(g, car.s + 6).corner ? 0.55 : 1);
      const brakeDist = CAR_HALF_LEN + 2.5 + car.v * 0.7;
      const blocked = (x: number, z: number, width: number) => { const r = rel(x, z); return r.along > 0 && r.along < brakeDist && Math.abs(r.side) < width; };
      for (const n of w.npc.npcs.values()) if (blocked(n.move.x, n.move.z, 1.6)) { target = 0; break; }
      if (truck.on && blocked(truck.x, truck.z, 2.6)) target = 0;
      for (const c of w.police.cars) if (blocked(c.x, c.z, 2.6)) { target = 0; break; } // siren = right of way
      for (const o of this.cars) {
        if (o === car || o.loop !== car.loop) continue;
        const gap = (((o.s - car.s) % g.len) + g.len) % g.len;
        if (gap > 0 && gap < 9 + car.v * 0.5) target = Math.min(target, gap < 6.5 ? 0 : o.v);
      }
      // honk at bandits in the lane (they won't stop for you!)
      car.honkCd = Math.max(0, car.honkCd - dt);
      for (const p of w.players.values()) {
        if (!p.connected || p.respawnT > 0) continue;
        const r = rel(p.move.x, p.move.z);
        if (car.honkCd <= 0 && car.v > 3 && r.along > 0 && r.along < 16 && Math.abs(r.side) < 1.8) {
          car.honkCd = 3;
          w.emit({ t: "honk", car: car.id, x: car.x, z: car.z });
        }
      }
      car.v = target > car.v ? Math.min(target, car.v + ACCEL * dt) : Math.max(target, car.v - BRAKE * dt);
      car.s = (car.s + car.v * dt) % g.len;
      const p = sampleLoop(g, car.s);
      car.x = p.x; car.z = p.z; car.yaw = p.yaw;
      this.collide(car);
    }
  }

  /** Anything in the car's footprint: bandits get wiped out, loot gets flung, pedestrians step aside. */
  private collide(car: CarSim) {
    const w = this.w;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const inside = (x: number, z: number, pad: number) => {
      const dx = x - car.x, dz = z - car.z;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      return Math.abs(along) < CAR_HALF_LEN + pad && Math.abs(side) < CAR_HALF_WIDTH + pad ? { along, side } : null;
    };
    for (const p of w.players.values()) {
      if (!p.connected || p.respawnT > 0 || p.jailT > 0 || p.move.y > 1.4) continue;
      const hit = inside(p.move.x, p.move.z, PLAYER.radius);
      if (!hit) continue;
      if (car.v > 2) this.wipeout(p, car);
      else {
        // barely moving: just get nudged out of the way
        const s = hit.side >= 0 ? 1 : -1;
        p.move.x += fz * s * 0.1; p.move.z += -fx * s * 0.1;
      }
    }
    if (car.v > 2) {
      for (const it of w.items.values()) {
        if (it.mode !== "free" || it.body.y > 1.2) continue;
        const hit = inside(it.body.x, it.body.z, 0.2);
        if (!hit) continue;
        const s = hit.side >= 0 ? 1 : -1;
        w.freeItem(it, it.body.x, Math.max(it.body.y, 0.5), it.body.z, fx * car.v * 0.7 + fz * s * 3, 4, fz * car.v * 0.7 - fx * s * 3);
      }
    }
    for (const n of w.npc.npcs.values()) {
      const hit = inside(n.move.x, n.move.z, 0.4);
      if (!hit) continue;
      const s = hit.side >= 0 ? 1 : -1;
      w.npc.nudge(n.move, fz * s * 0.25, -fx * s * 0.25); // never into a wall or a parked car
    }
  }

  wipeout(p: PlayerSim, car: CarSim) {
    const w = this.w;
    w.props.cancelRob(p);
    w.dropAll(p);
    p.move.vx = Math.sin(car.yaw) * 6; p.move.vz = Math.cos(car.yaw) * 6;
    p.move.knockT = WIPEOUT_TIME + 1;
    p.move.immuneT = WIPEOUT_TIME + 4;
    p.move.mantleT = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    p.respawnT = WIPEOUT_TIME;
    w.emit({ t: "wipeout", p: p.id, car: car.id, x: p.move.x, z: p.move.z });
  }

  private respawn(p: PlayerSim) {
    p.respawnT = 0;
    const sp = this.w.arena.spawns[p.colorIdx % this.w.arena.spawns.length];
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(sp.x, sp.z, sp.yaw), ...keep };
    p.move.immuneT = 3;
    p.queue.length = 0;
    this.w.emit({ t: "respawn", p: p.id });
  }
}
````

## FILE: shared/src/world.ts

````ts
// The World: all game rules in one place, with no engine or network code.
// - The multiplayer server runs one World per room and mirrors it to clients.
// - Solo mode runs the exact same World inside the browser.
// So solo and multiplayer can never drift apart.
//
// Phase 2 contents: players (movement + inventory), loot items (spawning, physics,
// grab / pocket / drop / throw, two-person giant items), events for sounds/effects, cleanup.
import { PLAYER, SIM_DT, MAX_PLAYERS, MAX_INPUTS_PER_TICK, PLAYER_COLORS } from "./constants.js";
import { makeMoveState, stepMovement, sanitizeInput, groundHeightAt, type MoveInput, type MoveState } from "./movement.js";
import { stepItem, type ItemBody } from "./itemPhysics.js";
import { LOOT, lootDef, rollValue, carrySpeedMul, type LootDef } from "./loot.js";
import type { ArenaLayout, LootZone } from "./arena.js";
import { buildTrashington } from "./city.js";
import { sanitizeName } from "./names.js";
import { NpcSystem, PUNCH_RANGE, type NpcHost, type BigShotEvent } from "./npcSim.js";
import { MatchSystem, itemWorth, type MatchPhase, type CityEventKind } from "./match.js";
import { PropSystem, PROP_RADIUS, SMASHABLE, type PropEvent } from "./props.js";
import { TrafficSystem, type TrafficEvent } from "./traffic.js";
import { PoliceSystem, type PoliceEvent } from "./police.js";
import type { LockRun } from "./lockpick.js";

export const POCKETS = 3;
/** Server-side grab reach (a bit generous: the server sees you ~0.1 s in the past). */
export const GRAB_RANGE = 2.9;
/** Client-side reach used for the look prompt. */
export const GRAB_RANGE_CLIENT = 2.4;
export const GIANT_TETHER = 3.2; // two carriers further apart than this = the item tumbles
export const THROW_MIN_SPEED = 5;
export const THROW_MAX_SPEED = 16;
export const ITEM_TARGET = 55; // loose items the World tries to keep in the city (200 m city)
export const ITEM_MAX = 95;
export const GIANT_MAX = 2;
const ACTION_COOLDOWN = 0.18; // seconds between grab/drop/throw (anti-spam)
export const PUNCH_COOLDOWN = 0.55;
export const PVP_PUNCH_COOLDOWN = 2.0; // after knocking a PLAYER down (anti-grief)
export const KNOCK_TIMES = [1.5, 1.0, 0.6]; // repeat knockdowns within 12 s get shorter (anti-grief)
export const KNOCK_IMMUNITY = 3; // seconds of immunity after getting up
export const NPC_COUNT = 20; // Blake: 15-20 (was 35); top of the range now the city is bigger

export type ItemMode = "free" | "held" | "pocket";

export interface ItemSim {
  id: string;
  type: string;
  value: number;
  body: ItemBody;
  mode: ItemMode;
  holder: string;
  holder2: string; // second carrier of a giant item
  lastThrower: string;
  thrownT: number; // time since thrown (for bonks)
  idleT: number; // seconds resting untouched (cleanup)
  // Phase 3 banking
  fort: number; // fort yard it's resting in (-1 = none)
  bankT: number; // seconds resting in that yard
  locked: boolean; // banked: can't be picked up by players any more (raccoons can still steal it)
  mult: number; // happy-hour bonus (1 or 2)
  chute: boolean; // airdrop crate still under its parachute
  shop: number; // shop stock / register (-1 = not from a shop)
}

export interface PlayerSim {
  id: string;
  name: string;
  colorIdx: number;
  connected: boolean;
  move: MoveState;
  lastSeq: number;
  queue: MoveInput[];
  credit: number;
  hand: string;
  pockets: string[];
  sel: number;
  actionCd: number;
  /** one action pressed during the short cooldown: runs as soon as the cooldown ends (no lost key presses) */
  queued: WorldAction | null;
  punchCd: number;
  /** heat 0..100 (wanted stars at 30 / 60 / 90) */
  notoriety: number;
  hitsTaken: number; // hits from a fighting pedestrian (2 = knocked down)
  hitsDecayT: number;
  knockCount: number; // recent knockdowns (for diminishing returns)
  knockWindowT: number;
  /** Phase 3: money from previous rounds this match */
  cash: number;
  stolenThisRound: number;
  /** Phase 3.5: hold-up in progress at a till */
  rob: { prop: string; t: number; x: number; z: number } | null;
  /** Phase 3.5: seconds until you respawn at your fort after a car wiped you out (0 = alive) */
  respawnT: number;
  /** Phase 4: seconds left in jail (0 = free), which cell, the lock you're picking */
  jailT: number;
  jailCell: number;
  lock: LockRun | null;
  lockSeed: number;
  lockT0: number; // world time you were locked up (lock clock starts here)
  /** world time a cop last had eyes on you (heat only cools while nobody sees you) */
  seenT: number;
  /** where the police think you are: your last crime or last sighting (dispatched cops go here) */
  knownX: number; knownZ: number;
  /** world time of your last crime (heat doesn't cool for a few seconds after one) */
  crimeT: number;
}

export type WorldEvent =
  | { t: "grab"; p: string; item: string; to: "hand" | "pocket" | "carry" }
  | { t: "whiff"; p: string; reason: "taken" | "far" | "full" | "hands" | "cooldown" | "locked" }
  | { t: "drop"; p: string; item: string }
  | { t: "throw"; p: string; item: string; speed: number }
  | { t: "impact"; item: string; speed: number; x: number; y: number; z: number }
  | { t: "bonk"; item: string; p: string; by: string }
  | { t: "tumble"; item: string }
  | { t: "spawn"; item: string }
  | { t: "punch"; p: string; hit: "none" | "npc" | "player" | "blocked" | "prop"; target: string }
  | { t: "knockdown"; p: string; by: string; time: number }
  | { t: "npcHit"; npc: string; by: string; how: "punch" | "throw" }
  | { t: "npcSay"; npc: string; line: string }
  | { t: "npcAttack"; npc: string; p: string; hit: boolean }
  | { t: "npcDodge"; npc: string; p: string }
  | { t: "npcKo"; npc: string; by: string }
  | { t: "panic"; npc: string }
  | { t: "flash"; p: string }
  | { t: "trap"; p: string }
  | { t: "swarm"; p: string }
  // Phase 3
  | { t: "round"; phase: MatchPhase | "hurry"; round: number }
  | { t: "banked"; item: string; p: string; value: number }
  | { t: "lost"; p: string; count: number; value: number }
  | { t: "cityEvent"; kind: CityEventKind; stage: "warn" | "live" | "end"; x: number; z: number; detail: string }
  | { t: "swept"; item: string; type: string; x: number; z: number }
  | { t: "raccoonGrab"; npc: string; item: string; p: string }
  | { t: "raccoonEscaped"; npc: string; item: string; type: string; p: string; value: number }
  | PropEvent
  | TrafficEvent
  | PoliceEvent
  | BigShotEvent;

export type WorldAction =
  | { a: "grab"; item: string }
  | { a: "drop" }
  | { a: "throw"; charge: number; yaw: number; pitch: number }
  | { a: "cycle" }
  | { a: "punch"; yaw: number; pitch: number }
  | { a: "use"; prop: string } // search a dumpster / bin (E), or start a hold-up at a till (hold R)
  | { a: "robStop" }
  | { a: "pick"; pin: number; t: number }; // jail lock-pick press (t = seconds since locked up)

/** Small, fast, seedable random numbers (deterministic worlds for tests). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rarity boost per spawn zone: the plaza, rooftops and shops are high-risk, high-reward. */
const ZONE_RARE_BOOST: Record<LootZone, number> = { plaza: 3, rooftop: 2.2, shop: 2, yard: 1, alley: 1, street: 0.7 };

export interface WorldOptions { seed?: number; arena?: ArenaLayout; spawnLoot?: boolean; npcs?: number; }

export class World {
  readonly arena: ArenaLayout;
  readonly players = new Map<string, PlayerSim>();
  readonly items = new Map<string, ItemSim>();
  time = 0;
  private events: WorldEvent[] = [];
  private rng: () => number;
  private nextItem = 1;
  private spawnTimer = 0;
  private recycleTimer = 0;
  private spawnLoot: boolean;
  readonly npc: NpcSystem;
  readonly match: MatchSystem;
  readonly props: PropSystem;
  readonly traffic: TrafficSystem;
  readonly police: PoliceSystem;
  private stockTimer = 0;

  constructor(opts: WorldOptions = {}) {
    this.arena = opts.arena ?? buildTrashington();
    this.rng = makeRng(opts.seed ?? 12345);
    this.spawnLoot = opts.spawnLoot ?? true;
    if (this.spawnLoot) this.fillLoot();
    this.npc = new NpcSystem(this.npcHost(), opts.npcs ?? (opts.arena ? 0 : NPC_COUNT));
    this.match = new MatchSystem(this);
    this.props = new PropSystem(this);
    this.traffic = new TrafficSystem(this);
    this.police = new PoliceSystem(this);
    if (this.spawnLoot) { this.props.reset(); this.stockShops(true); }
  }

  /** Raise a player's heat (notoriety), capped at 100. Cops who see it happen come running. */
  addHeat(p: PlayerSim, n: number) {
    if (p.jailT > 0) return;
    p.notoriety = Math.min(100, p.notoriety + n);
    if (n > 0) { p.knownX = p.move.x; p.knownZ = p.move.z; p.crimeT = this.time; this.police.onCrime(p); } // somebody calls it in
  }

  /** Teleport a player (jail, release). Keeps what they carry; clears queued inputs. */
  movePlayer(p: PlayerSim, x: number, z: number, yaw: number) {
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(x, z, yaw), ...keep };
    p.move.y = groundHeightAt(x, z, this.arena.boxes, 1); // stand ON floors / curbs, never inside them
    p.queue.length = 0;
  }

  /** Busted: everything carried is taken away for good. Returns how much. */
  confiscateAll(p: PlayerSim): { count: number; value: number } {
    let count = 0, value = 0, guard = 0;
    while (this.activeItem(p) && guard++ < 10) {
      const a = this.activeItem(p)!;
      const it = a.item;
      if (lootDef(it.type).size === "giant" && it.holder2) { this.letGoOfGiant(it, p); continue; } // your partner keeps dragging it
      this.release(p, a.from);
      count++; value += itemWorth(it);
      this.items.delete(it.id);
    }
    p.hand = ""; p.pockets.fill("");
    this.updateCarry(p);
    return { count, value };
  }

  /** Fill shop shelves: every empty shelf spot (full) or one random empty spot per shop. */
  stockShops(full: boolean) {
    const spots = (this.arena.lootSpawns ?? []).filter((s) => s.pool && s.shop !== undefined);
    const empty = spots.filter((sp) => ![...this.items.values()].some((it) => it.mode === "free" && Math.hypot(it.body.x - sp.x, it.body.z - sp.z) < 0.6 && Math.abs(it.body.y - sp.y) < 1));
    const pick = full ? empty : (this.arena.shops ?? []).map((sh) => { const e = empty.filter((x) => x.shop === sh.id); return e[Math.floor(this.rng() * e.length)]; }).filter(Boolean);
    for (const sp of pick) {
      if (this.items.size >= ITEM_MAX + 30) break;
      const type = sp.pool![Math.floor(this.rng() * sp.pool!.length)];
      const id = this.placeItem(type, sp.x, sp.y, sp.z);
      const it = this.items.get(id)!;
      it.shop = sp.shop!;
      it.body.rot = this.rng() * Math.PI * 2;
    }
  }

  /** Shared random numbers (deterministic per seed). */
  random() { return this.rng(); }

  /** Host pressed START (or solo). */
  startMatch() { return this.match.start(); }

  /** New round: fresh loot, everyone back at their fort with empty hands. */
  resetCity() {
    this.npc.clearRaccoons();
    this.npc.resetCashiers();
    this.police.reset();
    this.items.clear();
    if (this.spawnLoot) { this.fillLoot(); this.props.reset(); this.stockShops(true); }
    for (const p of this.players.values()) {
      p.hand = ""; p.pockets.fill(""); p.queued = null;
      const sp = this.arena.spawns[p.colorIdx % this.arena.spawns.length];
      const keepSeq = p.lastSeq;
      p.move = makeMoveState(sp.x, sp.z, sp.yaw);
      p.lastSeq = keepSeq;
      p.queue.length = 0;
      p.notoriety = 0; p.hitsTaken = 0; p.knockCount = 0; p.stolenThisRound = 0; p.rob = null; p.respawnT = 0;
      this.updateCarry(p);
    }
  }

  refreshCarry(p: PlayerSim) { this.updateCarry(p); }
  /** Drop everything a player carries (knockdowns, wipeouts). */
  dropAll(p: PlayerSim) { this.dropEverything(p); }

  /** Spawn a random ground item near a point (happy hour bonus). */
  spawnAt(x: number, z: number): string {
    if (this.items.size >= ITEM_MAX) return "";
    const def = this.pickType("plaza", true, false);
    const id = this.placeItem(def.type, x, 0.4, z);
    this.emit({ t: "spawn", item: id });
    return id;
  }

  /** The bridge the pedestrian AI uses to affect the world. */
  private npcHost(): NpcHost {
    const w = this;
    return {
      arena: this.arena,
      rng: () => this.rng(),
      playersForNpcs: () => [...w.players.values()].map((p) => ({
        id: p.id, x: p.move.x, y: p.move.y, z: p.move.z, yaw: p.move.yaw, connected: p.connected && p.jailT <= 0,
        knocked: p.move.knockT > 0, immune: p.move.immuneT > 0,
      })),
      npcHitPlayer: (npcId, pid) => {
        const p = w.players.get(pid);
        if (!p || p.move.knockT > 0 || p.move.immuneT > 0) return;
        p.hitsTaken += 1;
        p.hitsDecayT = 5;
        const n = w.npc.npcs.get(npcId);
        if (n) { const dx = p.move.x - n.move.x, dz = p.move.z - n.move.z, l = Math.max(0.01, Math.hypot(dx, dz)); p.move.vx += (dx / l) * 3.5; p.move.vz += (dz / l) * 3.5; }
        if (p.hitsTaken >= 2) { p.hitsTaken = 0; w.knockdown(p, npcId); w.npc.gloat(npcId); }
      },
      npcDropLoot: (_npcId, type, x, y, z, ax, az) => { w.popLoot(type, x, y, z, ax, az); },
      shopAlarm: (shopId) => { const t = [...w.props.props.values()].find((x) => x.def.kind === "till" && x.def.shop === shopId); if (t) { t.alarmT = 6; w.emit({ t: "alarm", kind: "shop", prop: t.def.id, x: t.def.x, z: t.def.z }); } },
      npcEvent: (e) => w.emit(e),
      addNotoriety: (pid, n) => { const p = w.players.get(pid); if (p) w.addHeat(p, n); },
      copBrain: (n, dt) => w.police.brain(n, dt),
      applyToPlayer: (pid, effect) => {
        const p = w.players.get(pid);
        if (!p) return;
        if (effect === "trap") { p.move.trapT = 1.6; w.emit({ t: "trap", p: pid }); }
        if (effect === "swarm") { p.move.swarmT = 5; w.emit({ t: "swarm", p: pid }); }
        if (effect === "flash") w.emit({ t: "flash", p: pid });
      },
      raccoonTarget: (slot) => {
        // the most valuable thing lying in that fort yard (locked or not: raccoons don't care)
        let best: ItemSim | null = null;
        for (const it of w.items.values()) {
          if (it.mode !== "free" || lootDef(it.type).size === "giant" || it.fort !== slot) continue;
          if (!best || itemWorth(it) > itemWorth(best)) best = it;
        }
        return best ? { id: best.id, x: best.body.x, z: best.body.z } : null;
      },
      raccoonGrab: (npcId, itemId) => {
        const it = w.items.get(itemId);
        if (!it || it.mode !== "free") return false;
        it.mode = "held"; it.holder = npcId; it.holder2 = "";
        it.locked = false; it.bankT = 0;
        const owner = w.match.ownerOf(it.fort);
        it.fort = -1;
        w.emit({ t: "raccoonGrab", npc: npcId, item: itemId, p: owner?.id ?? "" });
        return true;
      },
      npcDropCarried: (itemId, x, y, z, ax, az) => {
        const it = w.items.get(itemId);
        if (!it) return;
        const l = Math.max(0.01, Math.hypot(ax, az));
        it.holder = ""; it.holder2 = "";
        w.freeItem(it, x, y, z, (ax / l) * 1.5, 3.5, (az / l) * 1.5);
      },
      raccoonGone: (npcId, itemId, slot) => {
        const it = itemId ? w.items.get(itemId) : undefined;
        if (!it) return;
        const owner = w.match.ownerOf(slot);
        if (owner) owner.stolenThisRound++;
        w.items.delete(itemId);
        w.emit({ t: "raccoonEscaped", npc: npcId, item: itemId, type: it.type, p: owner?.id ?? "", value: itemWorth(it) });
      },
    };
  }

  /** Loot popping out of something (a pedestrian, a dumpster, a smashed phone booth...): flies up and away. */
  popLoot(type: string, x: number, y: number, z: number, ax: number, az: number): string {
    const def = lootDef(type);
    const id = "i" + this.nextItem++;
    const l = Math.max(0.01, Math.hypot(ax, az));
    this.items.set(id, {
      id, type, value: rollValue(def, this.rng),
      body: { x, y, z, vx: (ax / l) * 2 + (this.rng() - 0.5), vy: 4.5, vz: (az / l) * 2 + (this.rng() - 0.5), rot: 0, spin: 6, resting: false },
      mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
      fort: -1, bankT: 0, locked: false, mult: 1, chute: false, shop: -1,
    });
    this.emit({ t: "spawn", item: id });
    return id;
  }

  /** Knock a player down: they drop everything. Repeat knockdowns get shorter; immunity afterwards. */
  knockdown(p: PlayerSim, by: string) {
    if (p.move.knockT > 0 || p.move.immuneT > 0) return;
    const time = KNOCK_TIMES[Math.min(p.knockCount, KNOCK_TIMES.length - 1)];
    p.knockCount += 1;
    p.knockWindowT = 12;
    this.dropEverything(p);
    p.move.knockT = time;
    p.move.immuneT = time + KNOCK_IMMUNITY;
    p.move.mantleT = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    this.emit({ t: "knockdown", p: p.id, by, time });
  }

  // ------------------------------------------------------------------ players
  addPlayer(id: string, rawName: unknown): PlayerSim {
    const used = new Set([...this.players.values()].map((p) => p.colorIdx));
    let colorIdx = 0;
    while (used.has(colorIdx) && colorIdx < PLAYER_COLORS.length - 1) colorIdx++;
    const sp = this.arena.spawns[colorIdx % this.arena.spawns.length];
    const p: PlayerSim = {
      id, name: sanitizeName(rawName), colorIdx, connected: true,
      move: makeMoveState(sp.x, sp.z, sp.yaw), lastSeq: -1, queue: [], credit: 0,
      hand: "", pockets: Array(POCKETS).fill(""), sel: 0, actionCd: 0, queued: null,
      punchCd: 0, notoriety: 0, hitsTaken: 0, hitsDecayT: 0, knockCount: 0, knockWindowT: 0,
      cash: 0, stolenThisRound: 0, rob: null, respawnT: 0,
      jailT: 0, jailCell: -1, lock: null, lockSeed: 0, lockT0: 0, seenT: -99, knownX: 0, knownZ: 0, crimeT: -99,
    };
    this.players.set(id, p);
    return p;
  }

  get playerCount() { return this.players.size; }
  get full() { return this.players.size >= MAX_PLAYERS; }

  /** Lost connection: drop everything (so it's stealable) and freeze in place. */
  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      this.dropEverything(p);
      p.queue.length = 0;
      p.move.vx = 0; p.move.vz = 0; p.move.slideT = 0; p.move.dodgeT = 0;
    }
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropEverything(p);
    this.players.delete(id);
  }

  pushInputs(id: string, batch: unknown) {
    const p = this.players.get(id);
    if (!p || !p.connected || !Array.isArray(batch)) return;
    for (const raw of batch.slice(0, 16)) {
      const inp = sanitizeInput(raw as Partial<MoveInput>);
      if (!inp) continue;
      const lastQueued = p.queue.length ? p.queue[p.queue.length - 1].seq : p.lastSeq;
      if (inp.seq <= lastQueued) continue; // duplicate or out of order
      p.queue.push(inp);
    }
    if (p.queue.length > 60) p.queue.splice(0, p.queue.length - 60);
  }

  // ------------------------------------------------------------------ actions
  action(id: string, raw: unknown) {
    const p = this.players.get(id);
    if (!p || !p.connected || !raw || typeof raw !== "object") return;
    const act = raw as WorldAction;
    if (p.jailT > 0) { // locked up: the only thing you can do is pick the lock
      if (act.a === "pick") this.police.pick(p, Number((act as any).pin), Number((act as any).t));
      return;
    }
    if (p.move.knockT > 0 || p.move.trapT > 0) return; // can't do anything while flattened / boxed in
    if (p.respawnT > 0) return; // wiped out: waiting to respawn
    if (act.a === "punch") { this.punch(p, Number((act as any).yaw), Number((act as any).pitch)); return; }
    if (act.a === "robStop") { this.props.cancelRob(p); return; }
    if (act.a === "use") { this.props.use(p, String((act as any).prop ?? "")); return; }
    if (p.actionCd > 0 && act.a !== "cycle") {
      // Pressed a moment too early (e.g. G right after E): remember it and do it when allowed.
      if (!p.queued) p.queued = act; else this.emit({ t: "whiff", p: id, reason: "cooldown" });
      return;
    }
    switch (act.a) {
      case "grab": this.grab(p, String((act as any).item ?? "")); break;
      case "drop": this.drop(p); break;
      case "throw": this.throwItem(p, Number((act as any).charge), Number((act as any).yaw), Number((act as any).pitch)); break;
      case "cycle": p.sel = (p.sel + 1) % POCKETS; break;
    }
  }

  private eye(p: PlayerSim) {
    const m = p.move;
    return { x: m.x, y: m.y + (m.crouching || m.slideT > 0 ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight), z: m.z };
  }

  /** Punch whoever is in front of you (pedestrian or player). Only with empty hands. */
  private punch(p: PlayerSim, yaw: number, pitch: number) {
    if (p.punchCd > 0 || p.hand) return;
    p.punchCd = PUNCH_COOLDOWN;
    const aim = Number.isFinite(yaw) ? yaw : p.move.yaw;
    void pitch;
    const m = p.move;
    let best: { kind: "npc" | "player" | "prop"; id: string; score: number } | null = null;
    const consider = (kind: "npc" | "player" | "prop", id: string, x: number, y: number, z: number, surface = 0) => {
      const dx = x - m.x, dz = z - m.z;
      const d = Math.max(0.3, Math.hypot(dx, dz) - surface);
      if (d > PUNCH_RANGE + 0.3 || Math.abs(y - m.y) > 1.3) return;
      let ang = Math.atan2(dx, dz) - aim;
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > 0.9 && d > 0.6) return;
      const score = d + Math.abs(ang) * 1.5;
      if (!best || score < best.score) best = { kind, id, score };
    };
    for (const n of this.npc.npcs.values()) if (n.state !== "ko") consider("npc", n.id, n.move.x, n.move.y, n.move.z);
    for (const o of this.players.values()) if (o.id !== p.id && o.connected && o.jailT <= 0 && o.move.knockT <= 0) consider("player", o.id, o.move.x, o.move.y, o.move.z);
    // smashable props (phone booths, vending machines, meters, newspaper boxes, parked cars)
    for (const ps of this.props.props.values()) {
      const d = ps.def;
      if (!SMASHABLE.has(d.kind) || Math.hypot(d.x - m.x, d.z - m.z) > 5) continue;
      consider("prop", d.id, d.x, m.y, d.z, PROP_RADIUS[d.kind]);
    }
    const b = best as { kind: "npc" | "player" | "prop"; id: string; score: number } | null;
    if (!b) return this.emit({ t: "punch", p: p.id, hit: "none", target: "" });
    if (b.kind === "prop") {
      this.props.smash(p, b.id);
      return this.emit({ t: "punch", p: p.id, hit: "prop", target: b.id });
    }
    if (b.kind === "npc") {
      const r = this.npc.hit(b.id, p.id, m.x, m.z);
      this.emit({ t: "punch", p: p.id, hit: r === "hit" ? "npc" : "none", target: b.id });
      if (r === "hit") this.emit({ t: "npcHit", npc: b.id, by: p.id, how: "punch" });
      return;
    }
    const victim = this.players.get(b.id)!;
    if (victim.move.immuneT > 0) return this.emit({ t: "punch", p: p.id, hit: "blocked", target: b.id });
    this.emit({ t: "punch", p: p.id, hit: "player", target: b.id });
    const dx = victim.move.x - m.x, dz = victim.move.z - m.z, l = Math.max(0.01, Math.hypot(dx, dz));
    victim.move.vx += (dx / l) * 4; victim.move.vz += (dz / l) * 4;
    this.knockdown(victim, p.id);
    p.punchCd = PVP_PUNCH_COOLDOWN;
    this.addHeat(p, 5);
  }

  private grab(p: PlayerSim, itemId: string) {
    const it = this.items.get(itemId);
    if (!it) return this.emit({ t: "whiff", p: p.id, reason: "taken" });
    if (it.locked) return this.emit({ t: "whiff", p: p.id, reason: "locked" });
    const def = lootDef(it.type);
    // Reach check: close enough and roughly in front of you
    const e = this.eye(p);
    const dx = it.body.x - e.x, dy = it.body.y - e.y, dz = it.body.z - e.z;
    const dist = Math.hypot(dx, dy, dz) - lootDef(it.type).radius;
    const facing = (dx * Math.sin(p.move.yaw) + dz * Math.cos(p.move.yaw)) / Math.max(0.001, Math.hypot(dx, dz));
    if (dist > GRAB_RANGE || (Math.hypot(dx, dz) > 0.8 && facing < 0.2)) return this.emit({ t: "whiff", p: p.id, reason: "far" });

    if (def.size === "giant") {
      if (p.hand) return this.emit({ t: "whiff", p: p.id, reason: "hands" });
      if (it.mode === "free") {
        it.mode = "held"; it.holder = p.id; it.holder2 = "";
      } else if (it.mode === "held" && !it.holder2 && it.holder !== p.id) {
        it.holder2 = p.id;
      } else {
        return this.emit({ t: "whiff", p: p.id, reason: "taken" });
      }
      p.hand = it.id;
      this.touch(it);
      this.updateCarry(p);
      for (const hid of [it.holder, it.holder2]) { const h = this.players.get(hid); if (h) this.updateCarry(h); }
      p.actionCd = ACTION_COOLDOWN;
      return this.emit({ t: "grab", p: p.id, item: it.id, to: "carry" });
    }

    if (it.mode !== "free") return this.emit({ t: "whiff", p: p.id, reason: "taken" });
    if (def.size === "small") {
      const slot = p.pockets.indexOf("");
      if (slot >= 0) {
        p.pockets[slot] = it.id;
        it.mode = "pocket"; it.holder = p.id;
        this.touch(it);
        p.actionCd = ACTION_COOLDOWN;
        if (it.shop >= 0) this.props.onShopGrab(p, it);
        return this.emit({ t: "grab", p: p.id, item: it.id, to: "pocket" });
      }
      if (p.hand) return this.emit({ t: "whiff", p: p.id, reason: "full" });
    } else if (p.hand) {
      return this.emit({ t: "whiff", p: p.id, reason: "hands" });
    }
    p.hand = it.id;
    it.mode = "held"; it.holder = p.id;
    this.touch(it);
    this.updateCarry(p);
    p.actionCd = ACTION_COOLDOWN;
    if (it.shop >= 0) this.props.onShopGrab(p, it);
    this.emit({ t: "grab", p: p.id, item: it.id, to: "hand" });
  }

  /** Which item would an action use? Hands first, then the selected pocket, then any pocket. */
  private activeItem(p: PlayerSim): { item: ItemSim; from: "hand" | number } | null {
    if (p.hand) { const it = this.items.get(p.hand); if (it) return { item: it, from: "hand" }; p.hand = ""; }
    const order = [p.sel, ...[0, 1, 2].filter((i) => i !== p.sel)];
    for (const i of order) {
      const id = p.pockets[i];
      if (!id) continue;
      const it = this.items.get(id);
      if (it) return { item: it, from: i };
      p.pockets[i] = "";
    }
    return null;
  }

  private release(p: PlayerSim, from: "hand" | number) {
    if (from === "hand") p.hand = ""; else p.pockets[from] = "";
    this.updateCarry(p);
  }

  private drop(p: PlayerSim) {
    const a = this.activeItem(p);
    if (!a) return;
    const it = a.item;
    const m = p.move;
    if (lootDef(it.type).size === "giant" && it.holder2) {
      // one of two carriers lets go: the other keeps dragging it
      this.letGoOfGiant(it, p);
      p.actionCd = ACTION_COOLDOWN;
      return this.emit({ t: "drop", p: p.id, item: it.id });
    }
    this.release(p, a.from);
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const r = lootDef(it.type).radius;
    this.freeItem(it, m.x + fx * (PLAYER.radius + r + 0.15), m.y + Math.max(0.6, r + 0.2), m.z + fz * (PLAYER.radius + r + 0.15), m.vx * 0.5, 0, m.vz * 0.5);
    it.holder = ""; it.holder2 = "";
    p.actionCd = ACTION_COOLDOWN;
    this.emit({ t: "drop", p: p.id, item: it.id });
  }

  private throwItem(p: PlayerSim, charge: number, yaw: number, pitch: number) {
    const a = this.activeItem(p);
    if (!a) return;
    const it = a.item;
    const def = lootDef(it.type);
    if (def.size === "giant") return this.emit({ t: "whiff", p: p.id, reason: "hands" }); // too big to throw
    const c = Number.isFinite(charge) ? Math.max(0, Math.min(1, charge)) : 0;
    const y = Number.isFinite(yaw) ? yaw : p.move.yaw;
    const pt = Number.isFinite(pitch) ? Math.max(-1.5, Math.min(1.5, pitch)) : 0;
    this.release(p, a.from);
    const speed = throwSpeed(def, c);
    const v = throwVelocity(y, pt, speed);
    const e = this.eye(p);
    const m = p.move;
    it.holder = ""; it.holder2 = "";
    this.freeItem(it, e.x + v.dx * 0.55, e.y - 0.15 + v.dy * 0.55, e.z + v.dz * 0.55, v.vx + m.vx * 0.5, v.vy, v.vz + m.vz * 0.5);
    it.body.spin = (this.rng() * 2 - 1) * 8;
    it.lastThrower = p.id;
    it.thrownT = 0;
    p.actionCd = ACTION_COOLDOWN;
    this.emit({ t: "throw", p: p.id, item: it.id, speed });
  }

  private letGoOfGiant(it: ItemSim, p: PlayerSim) {
    if (it.holder === p.id) { it.holder = it.holder2; }
    it.holder2 = "";
    p.hand = "";
    this.updateCarry(p);
    const other = this.players.get(it.holder);
    if (other) this.updateCarry(other);
  }

  freeItem(it: ItemSim, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    it.mode = "free";
    const b = it.body;
    b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
    b.resting = false;
    this.touch(it);
  }

  private dropEverything(p: PlayerSim) {
    let guard = 0;
    while (this.activeItem(p) && guard++ < 10) {
      const a = this.activeItem(p)!;
      const it = a.item;
      if (lootDef(it.type).size === "giant" && it.holder2) { this.letGoOfGiant(it, p); continue; }
      this.release(p, a.from);
      const ang = this.rng() * Math.PI * 2;
      this.freeItem(it, p.move.x + Math.sin(ang) * 0.5, p.move.y + 1, p.move.z + Math.cos(ang) * 0.5, Math.sin(ang) * 2, 3, Math.cos(ang) * 2);
      it.holder = ""; it.holder2 = "";
      this.emit({ t: "drop", p: p.id, item: it.id });
    }
    p.hand = "";
    p.pockets.fill("");
    this.updateCarry(p);
  }

  /** Recompute movement modifiers from what the player carries. */
  private updateCarry(p: PlayerSim) {
    const m = p.move;
    const it = p.hand ? this.items.get(p.hand) : undefined;
    if (!it) { m.carryMul = 1; m.carryHeavy = false; m.handsFull = false; return; }
    const def = lootDef(it.type);
    const carriers = def.size === "giant" ? (it.holder && it.holder2 ? 2 : 1) : 1;
    m.carryMul = carrySpeedMul(def, carriers);
    m.carryHeavy = !!def.heavy || def.size === "giant";
    m.handsFull = def.size !== "small";
  }

  /** Someone handled it: reset idle cleanup and the fort-bank timer (dropping it starts the 10 s again). */
  private touch(it: ItemSim) { it.idleT = 0; it.bankT = 0; it.fort = -1; it.locked = false; }

  // ------------------------------------------------------------------ simulation
  tick(dt = SIM_DT) {
    this.time += dt;
    for (const p of this.players.values()) {
      p.actionCd = Math.max(0, p.actionCd - dt);
      if (p.queued && p.actionCd <= 0) { const q = p.queued; p.queued = null; this.action(p.id, q); }
      p.punchCd = Math.max(0, p.punchCd - dt);
      if (p.hitsDecayT > 0) { p.hitsDecayT -= dt; if (p.hitsDecayT <= 0) p.hitsTaken = 0; }
      if (p.knockWindowT > 0) { p.knockWindowT -= dt; if (p.knockWindowT <= 0) p.knockCount = 0; }
      if (!p.connected) continue;
      p.credit = Math.min(p.credit + 1, MAX_INPUTS_PER_TICK);
      while (p.credit >= 1 && p.queue.length) {
        const inp = p.queue.shift()!;
        stepMovement(p.move, inp, this.arena);
        p.lastSeq = inp.seq;
        p.credit -= 1;
      }
    }
    this.npc.tick(dt);
    this.recycleTimer += dt;
    if (this.recycleTimer >= 5) { this.recycleTimer = 0; this.npc.recycle(); }
    this.updateHeldItems();
    this.stepFreeItems(dt);
    this.match.tick(dt);
    this.props.tick(dt);
    this.traffic.tick(dt);
    this.police.tick(dt);
    if (this.spawnLoot) {
      this.stockTimer += dt;
      if (this.stockTimer >= 15) { this.stockTimer = 0; this.stockShops(false); }
    }
    if (this.spawnLoot) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= 6) { this.spawnTimer = 0; this.topUpLoot(1); }
    }
  }

  private updateHeldItems() {
    for (const it of this.items.values()) {
      if (it.mode === "pocket") {
        const h = this.players.get(it.holder);
        if (!h || !h.pockets.includes(it.id)) { it.mode = "free"; it.holder = ""; it.body.resting = false; continue; }
        it.body.x = h.move.x; it.body.y = h.move.y + 1; it.body.z = h.move.z;
        continue;
      }
      if (it.mode !== "held") continue;
      const def = lootDef(it.type);
      const thief = this.npc.npcs.get(it.holder);
      if (thief) {
        // a raccoon running off with it, carried over its head
        it.body.x = thief.move.x; it.body.z = thief.move.z; it.body.y = thief.move.y + 0.75 + def.radius;
        it.body.vx = thief.move.vx; it.body.vy = 0; it.body.vz = thief.move.vz; it.body.rot = thief.move.yaw;
        continue;
      }
      const h1 = this.players.get(it.holder);
      if (!h1) { this.freeItem(it, it.body.x, it.body.y, it.body.z, 0, 0, 0); it.holder = ""; it.holder2 = ""; continue; }
      const m = h1.move;
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      if (def.size === "giant") {
        const h2 = it.holder2 ? this.players.get(it.holder2) : undefined;
        if (h2) {
          const gap = Math.hypot(h1.move.x - h2.move.x, h1.move.z - h2.move.z);
          if (gap > GIANT_TETHER) {
            // pulled apart: it tumbles to the ground and both let go
            it.holder = ""; it.holder2 = "";
            h1.hand = ""; h2.hand = "";
            this.updateCarry(h1); this.updateCarry(h2);
            this.freeItem(it, (h1.move.x + h2.move.x) / 2, 1.2, (h1.move.z + h2.move.z) / 2, 0, 2, 0);
            it.body.spin = 3;
            this.emit({ t: "tumble", item: it.id });
            continue;
          }
          it.body.x = (h1.move.x + h2.move.x) / 2;
          it.body.z = (h1.move.z + h2.move.z) / 2;
          it.body.y = Math.max(h1.move.y, h2.move.y) + 1.0;
          it.body.rot = Math.atan2(h2.move.x - h1.move.x, h2.move.z - h1.move.z) + Math.PI / 2;
        } else {
          // dragging alone: it scrapes along the ground in front of you
          it.body.x = m.x + fx * (PLAYER.radius + def.radius + 0.1);
          it.body.z = m.z + fz * (PLAYER.radius + def.radius + 0.1);
          it.body.y = m.y + def.radius;
          it.body.rot = m.yaw;
        }
      } else {
        it.body.x = m.x + fx * 0.55;
        it.body.z = m.z + fz * 0.55;
        it.body.y = m.y + 1.1;
        it.body.rot = m.yaw;
      }
      it.body.vx = m.vx; it.body.vy = 0; it.body.vz = m.vz;
    }
  }

  private stepFreeItems(dt: number) {
    for (const it of this.items.values()) {
      if (it.mode !== "free") continue;
      const def = lootDef(it.type);
      it.thrownT += dt;
      if (it.body.resting) {
        it.idleT += dt;
        // cleanup: long-ignored common junk quietly disappears (keeps the city fresh)
        if (it.idleT > 240 && def.rarity === "common" && it.fort < 0 && this.items.size > ITEM_TARGET * 0.6) this.items.delete(it.id);
        continue;
      }
      const res = stepItem(it.body, def.radius, def.bounce, this.arena, dt);
      if (it.chute) {
        // floating down under a parachute
        if (it.body.vy < -3.5) it.body.vy = -3.5;
        it.body.vx *= 0.9; it.body.vz *= 0.9;
        if (it.body.resting || it.body.y < def.radius + 0.05) it.chute = false;
      }
      if (res.impact > 2.5) this.emit({ t: "impact", item: it.id, speed: res.impact, x: it.body.x, y: it.body.y, z: it.body.z });
      if (res.outOfBounds) this.respawnItem(it);
      // thrown items bonk players (a comedy shove; stuns + loot drops may come later)
      const sp = Math.hypot(it.body.vx, it.body.vy, it.body.vz);
      if (sp > 6 && it.thrownT < 2 && it.lastThrower) {
        for (const n of this.npc.npcs.values()) {
          if (n.state === "ko" || n.state === "stunned") continue;
          const dx = it.body.x - n.move.x, dz = it.body.z - n.move.z, dy = it.body.y - (n.move.y + 0.9);
          if (Math.hypot(dx, dz) < def.radius + PLAYER.radius && Math.abs(dy) < 1.0) {
            const r = this.npc.hit(n.id, it.lastThrower, it.body.x - it.body.vx * 0.1, it.body.z - it.body.vz * 0.1);
            if (r === "hit") this.emit({ t: "npcHit", npc: n.id, by: it.lastThrower, how: "throw" });
            it.body.vx *= -0.3; it.body.vz *= -0.3;
            it.thrownT = 2;
            break;
          }
        }
      }
      if (sp > 6 && it.thrownT < 2) {
        for (const p of this.players.values()) {
          if (!p.connected || (p.id === it.lastThrower && it.thrownT < 0.4)) continue;
          const m = p.move;
          const cy = m.y + 0.9;
          const dx = it.body.x - m.x, dz = it.body.z - m.z, dy = it.body.y - cy;
          if (Math.hypot(dx, dz) < def.radius + PLAYER.radius && Math.abs(dy) < 1.0) {
            const nx = -dx, nz = -dz, nl = Math.max(0.001, Math.hypot(nx, nz));
            m.vx += (nx / nl) * 3; m.vz += (nz / nl) * 3; // shove
            it.body.vx *= -0.3; it.body.vz *= -0.3;
            it.thrownT = 2; // one bonk per throw
            this.emit({ t: "bonk", item: it.id, p: p.id, by: it.lastThrower });
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ loot spawning
  private fillLoot() {
    for (let i = 0; i < ITEM_TARGET; i++) this.spawnOne();
  }

  private topUpLoot(n: number) {
    let free = 0;
    for (const it of this.items.values()) if (it.mode === "free") free++;
    for (let i = 0; i < n && free < ITEM_TARGET && this.items.size < ITEM_MAX; i++, free++) this.spawnOne();
  }

  private pickType(zone: LootZone, groundLevel: boolean, allowGiant: boolean): LootDef {
    const boost = ZONE_RARE_BOOST[zone];
    const pool = LOOT.filter((d) => !d.npcOnly && (d.size !== "giant" || (allowGiant && groundLevel && (zone === "plaza" || zone === "yard"))));
    let total = 0;
    const w = pool.map((d) => {
      const rareish = d.rarity !== "common" && d.rarity !== "uncommon";
      const x = d.spawnWeight * (rareish ? boost : 1);
      total += x;
      return x;
    });
    let r = this.rng() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  /** Spawn one item at a random free spawn point. Returns its id (or "" if none placed). */
  spawnOne(forceType?: string): string {
    const spawns = this.arena.lootSpawns ?? [];
    if (!spawns.length || this.items.size >= ITEM_MAX) return "";
    let giants = 0;
    for (const it of this.items.values()) if (lootDef(it.type).size === "giant") giants++;
    for (let attempt = 0; attempt < 12; attempt++) {
      const sp = spawns[Math.floor(this.rng() * spawns.length)];
      if (sp.pool) continue; // shop shelves are stocked separately
      let busy = false;
      for (const it of this.items.values()) {
        if (it.mode === "free" && Math.hypot(it.body.x - sp.x, it.body.z - sp.z) < 1.6 && Math.abs(it.body.y - sp.y) < 2) { busy = true; break; }
      }
      if (busy) continue;
      const def = forceType ? lootDef(forceType) : this.pickType(sp.zone, sp.y === 0, giants < GIANT_MAX);
      const id = "i" + this.nextItem++;
      const jx = (this.rng() - 0.5) * 0.6, jz = (this.rng() - 0.5) * 0.6;
      this.items.set(id, {
        id, type: def.type, value: rollValue(def, this.rng),
        body: { x: sp.x + jx, y: sp.y + def.radius + 0.4, z: sp.z + jz, vx: 0, vy: 0, vz: 0, rot: this.rng() * Math.PI * 2, spin: 0, resting: false },
        mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
        fort: -1, bankT: 0, locked: false, mult: 1, chute: false, shop: -1,
      });
      this.emit({ t: "spawn", item: id });
      return id;
    }
    return "";
  }

  /** Test/debug helper: move a player (keeps what they carry). */
  debugTeleport(id: string, x: number, z: number, yaw: number) {
    const p = this.players.get(id);
    if (!p) return;
    const keep = { carryMul: p.move.carryMul, carryHeavy: p.move.carryHeavy, handsFull: p.move.handsFull };
    p.move = { ...makeMoveState(x, z, yaw), ...keep };
    p.queue.length = 0;
  }

  /** Test/debug helper: put a specific item somewhere (skips the spawn cap on purpose). */
  placeItem(type: string, x: number, y: number, z: number): string {
    const def = lootDef(type);
    const id = "i" + this.nextItem++;
    this.items.set(id, {
      id, type, value: rollValue(def, this.rng),
      body: { x, y: y + def.radius, z, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, resting: false },
      mode: "free", holder: "", holder2: "", lastThrower: "", thrownT: 99, idleT: 0,
      fort: -1, bankT: 0, locked: false, mult: 1, chute: false, shop: -1,
    });
    return id;
  }

  private respawnItem(it: ItemSim) {
    const spawns = this.arena.lootSpawns ?? [];
    const sp = spawns.length ? spawns[Math.floor(this.rng() * spawns.length)] : { x: 0, y: 0, z: 0 };
    const def = lootDef(it.type);
    this.freeItem(it, sp.x, sp.y + def.radius + 0.5, sp.z, 0, 0, 0);
    this.emit({ t: "spawn", item: it.id });
  }

  // ------------------------------------------------------------------ events
  emit(e: WorldEvent) { this.events.push(e); }
  takeEvents(): WorldEvent[] { const e = this.events; this.events = []; return e; }
}

/** Throw speed for an item at a given charge (0..1). Heavier items fly slower. */
export function throwSpeed(def: LootDef, charge: number): number {
  const heavy = def.size === "giant" ? 1 : def.weight;
  return (THROW_MIN_SPEED + (THROW_MAX_SPEED - THROW_MIN_SPEED) * charge) * (1 - heavy * 0.8);
}

/** Direction + velocity of a throw from a look direction (a slight upward lob is added). */
export function throwVelocity(yaw: number, pitch: number, speed: number) {
  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp, dy = -Math.sin(pitch), dz = Math.cos(yaw) * cp;
  return { dx, dy, dz, vx: dx * speed, vy: dy * speed + speed * 0.18, vz: dz * speed };
}
````

## FILE: shared/test/bigshots.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { World, NPC_DEFS, BIG_SHOTS, BIG_SHOT_FIRST, BIG_SHOT_STAY, SPECIAL_KINDS, NPC_COUNT, lootDef, starsOf, type MoveInput, type WorldEvent } from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function run(w: World, seconds: number, collect?: WorldEvent[]) {
  const p = w.players.get("a")!;
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
function setup(seed = 3) {
  const w = new World({ seed, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, 0, -60, 0);
  return { w, p };
}
/** Stand right in front of an NPC and punch it. */
function punch(w: World, id: string, ev: WorldEvent[]) {
  const n = w.npc.npcs.get(id)!;
  const p = w.players.get("a")!;
  w.movePlayer(p, n.move.x, n.move.z - 1.1, 0);
  run(w, 0.05, ev);
  const m = w.npc.npcs.get(id)!;
  w.action("a", { a: "punch", yaw: Math.atan2(m.move.x - p.move.x, m.move.z - p.move.z), pitch: 0 });
  run(w, 0.7, ev);
}

test("big shots: four kinds, each with a jackpot worth the heat, never part of the everyday crowd", () => {
  assert.deepEqual([...BIG_SHOTS].sort(), ["celebrity", "courier", "crypto_bro", "millionaire"]);
  for (const k of BIG_SHOTS) {
    assert.ok(SPECIAL_KINDS.has(k));
    const best = Math.max(...NPC_DEFS[k].loot.map(([t]) => lootDef(t).valueMax));
    assert.ok(best >= 200, `${k} carries up to $${best}`);
  }
  // a normal pedestrian carries way less
  assert.ok(Math.max(...NPC_DEFS.tourist.loot.map(([t]) => lootDef(t).valueMax)) < 120);
});

test("one big shot at a time: announced, walks around with their entourage, and leaves town eventually", () => {
  const { w } = setup();
  const ev: WorldEvent[] = [];
  run(w, BIG_SHOT_FIRST + 2, ev);
  const arrive = ev.filter((e) => e.t === "bigShot" && e.stage === "arrive");
  assert.equal(arrive.length, 1, "announced once");
  const b = w.npc.activeBigShot()!;
  assert.ok(b);
  const p = w.players.get("a")!;
  assert.ok(Math.hypot(b.move.x - p.move.x, b.move.z - p.move.z) >= 29, "arrives out of your face");
  // nobody near -> after the stay they're gone, and a new one comes later
  const ev2: WorldEvent[] = [];
  run(w, BIG_SHOT_STAY + 5, ev2);
  assert.ok(ev2.some((e) => e.t === "bigShot" && e.stage === "gone" && e.npc === b.id), "left town");
  assert.ok(!w.npc.npcs.has(b.id));
  run(w, 80, ev2);
  assert.ok(ev2.filter((e) => e.t === "bigShot" && e.stage === "arrive").length >= 1, "another one shows up");
  // the everyday crowd is untouched by all this
  const crowd = [...w.npc.npcs.values()].filter((n) => !SPECIAL_KINDS.has(n.kind)).length;
  assert.equal(crowd, 0); // (this test world has no crowd)
  void NPC_COUNT;
});

test("millionaire: punch = gold bar / diamond ring + big heat; the bodyguard comes for you", () => {
  const { w, p } = setup();
  const m = w.npc.spawnBigShot("millionaire")!;
  run(w, 2);
  const guard = [...w.npc.npcs.values()].find((n) => n.leader === m.id)!;
  assert.equal(guard.kind, "bodyguard");
  assert.ok(Math.hypot(guard.move.x - m.move.x, guard.move.z - m.move.z) < 3.5, "bodyguard sticks close");
  const ev: WorldEvent[] = [];
  const h0 = p.notoriety;
  punch(w, m.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "gold_bar" || i.type === "diamond_ring"), "jackpot dropped");
  assert.ok(p.notoriety - h0 >= 25, `heat +${(p.notoriety - h0).toFixed(0)}`);
  assert.ok(ev.some((e) => e.t === "bigShot" && e.stage === "hit"));
  assert.equal(w.npc.npcs.get(guard.id)!.state === "chase" || w.npc.npcs.get(guard.id)!.state === "windup" || w.npc.npcs.get(guard.id)!.state === "stunned", true, "bodyguard is after you");
  assert.equal(w.npc.npcs.get(guard.id)!.target, "a");
});

test("armored courier: takes 2 hits (armor), then the money bag drops and you're instantly 2 stars", () => {
  const { w, p } = setup();
  const c = w.npc.spawnBigShot("courier")!;
  run(w, 1);
  const ev: WorldEvent[] = [];
  punch(w, c.id, ev);
  assert.ok(![...w.items.values()].some((i) => i.type === "money_bag"), "first hit: armor holds");
  const n = w.npc.npcs.get(c.id)!;
  n.state = "walk"; n.stateT = 0; n.attackCd = 5; // (don't let it fight back mid-test)
  punch(w, c.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "money_bag"), "second hit: the bag");
  assert.ok(starsOf(p.notoriety) >= 2, `stars: ${starsOf(p.notoriety)}`);
});

test("celebrity: award trophy; the fans film it (extra heat); crypto bro: a wallet worth $0-500", () => {
  const { w, p } = setup();
  const c = w.npc.spawnBigShot("celebrity")!;
  run(w, 2);
  const fans = [...w.npc.npcs.values()].filter((n) => n.leader === c.id);
  assert.equal(fans.length, 2);
  const ev: WorldEvent[] = [];
  const h0 = p.notoriety;
  punch(w, c.id, ev);
  assert.ok([...w.items.values()].some((i) => i.type === "award_trophy"));
  assert.ok(fans.some((f) => w.npc.npcs.get(f.id)?.state === "film"), "fans filming");
  assert.ok(p.notoriety - h0 >= 40, `heat +${(p.notoriety - h0).toFixed(0)} (with the fans)`);
  // crypto
  const q = setup(9);
  const cb = q.w.npc.spawnBigShot("crypto_bro")!;
  run(q.w, 1);
  punch(q.w, cb.id, []);
  const wal = [...q.w.items.values()].find((i) => i.type === "hardware_wallet");
  assert.ok(wal && wal.value >= 0 && wal.value <= 500);
  assert.ok(lootDef("hardware_wallet").mystery);
});

test("the entourage follows the boss around (and doesn't get stuck behind)", () => {
  const { w } = setup(5);
  const m = w.npc.spawnBigShot("millionaire")!;
  let far = 0;
  for (let i = 0; i < 60; i++) {
    run(w, 0.5);
    const g = [...w.npc.npcs.values()].find((n) => n.leader === m.id);
    if (g && Math.hypot(g.move.x - m.move.x, g.move.z - m.move.z) > 5) far++;
  }
  assert.ok(far <= 3, `bodyguard strayed ${far}/60 times`);
});
````

## FILE: shared/test/city.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inRect, fortAt, nearBoxes, PROP_RADIUS, ROB_TIME, WIPEOUT_TIME, CAR_HALF_LEN,
  type WorldEvent, type MoveInput, type PropDef,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function run(w: World, seconds: number, ev?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const p of w.players.values()) w.pushInputs(p.id, [inp(p.lastSeq + 1, { yaw: p.move.yaw })]);
    w.tick();
    const e = w.takeEvents();
    if (ev) ev.push(...e);
  }
}
function world() {
  const w = new World({ seed: 5 });
  const p = w.addPlayer("a", "Bandit");
  return { w, p };
}
/** Stand in front of a prop, facing it. */
function faceProp(w: World, id: string, d: PropDef, gap = 1.0) {
  const r = PROP_RADIUS[d.kind];
  const x = d.x + Math.sin(d.yaw) * (r + gap), z = d.z + Math.cos(d.yaw) * (r + gap);
  w.debugTeleport(id, x, z, d.yaw + Math.PI);
}
const propsOf = (w: World, kind: string) => (w.arena.props ?? []).filter((p) => p.kind === kind);
const count = (w: World, type: string) => [...w.items.values()].filter((i) => i.type === type).length;

test("city: ~200 m, roads with crosswalks, 4 shops with cashiers, every kind of loot source", () => {
  const c = buildTrashington();
  assert.equal(c.halfSize, 100);
  assert.ok(c.boxes.filter((b) => b.kind === "tower").length >= 8, "downtown high-rises");
  assert.ok(Math.max(...c.boxes.filter((b) => b.kind === "tower").map((b) => b.h)) >= 35, "some are really tall");
  assert.equal(c.shops!.length, 4);
  for (const sh of c.shops!) {
    assert.ok(inRect(sh.rect, sh.cashier.x, sh.cashier.z), `${sh.name}: cashier inside`);
    assert.ok(c.lootSpawns!.filter((s) => s.shop === sh.id && inRect(sh.rect, s.x, s.z)).length >= 6, `${sh.name}: stocked shelves`);
  }
  for (const k of ["dumpster", "bin", "phone", "vending", "meter", "newsbox", "car", "till"]) assert.ok(c.props!.some((p) => p.kind === k), k);
  // nothing that should be on foot sits in a road; props and loot are reachable
  const onRoad = (x: number, z: number) => c.roads!.some((r) => inRect(r, x, z));
  for (const s of c.lootSpawns!) assert.ok(!onRoad(s.x, s.z), `loot spawn on a road at ${s.x},${s.z}`);
  for (const f of c.forts!) assert.ok(!onRoad(f.padX, f.padZ) && fortAt(c, f.padX, f.padZ) === f.slot);
  for (const p of c.props!) if (p.kind !== "car") assert.ok(!onRoad(p.x, p.z), `${p.id} in the road`);
  for (const cw of c.crosswalks!) assert.ok(c.roads!.some((r) => inRect(r, (cw.minX + cw.maxX) / 2, (cw.minZ + cw.maxZ) / 2)), "crosswalks are on roads");
  // traffic lanes run on the asphalt
  for (const l of c.traffic!) for (const pt of l.points) assert.ok(onRoad(pt.x, pt.z), `lane corner ${pt.x},${pt.z} on the road`);
  // the landmarks tests rely on are open ground
  const solid = c.boxes.filter((b) => b.y + b.h / 2 > 0.4);
  for (const [name, lm] of Object.entries(c.landmarks!)) {
    assert.ok(!solid.some((b) => Math.abs(lm.x - b.x) < b.w / 2 + 0.4 && Math.abs(lm.z - b.z) < b.d / 2 + 0.4 && b.y - b.h / 2 < 1.8), `landmark ${name} is clear`);
  }
});

test("dumpsters and bins: search with E for random junk, then they're empty until they refill", () => {
  const { w, p } = world();
  const d = propsOf(w, "dumpster")[0];
  faceProp(w, "a", d);
  const before = w.items.size;
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: d.id });
  run(w, 0.2, ev);
  const found = ev.find((e) => e.t === "search");
  assert.ok(found && found.t === "search" && found.found >= 2, "2-3 items");
  assert.ok(w.items.size >= before + 2);
  p.actionCd = 0;
  w.action("a", { a: "use", prop: d.id });
  run(w, 0.1, ev);
  assert.ok(ev.some((e) => e.t === "empty" && e.prop === d.id), "already searched");
  run(w, 51);
  assert.ok(w.props.props.get(d.id)!.ready, "refilled");
  // too far away = nothing
  w.debugTeleport("a", d.x + 8, d.z, 0);
  const n = w.items.size;
  w.action("a", { a: "use", prop: d.id });
  assert.equal(w.items.size, n);
});

test("smash-and-grab: phone booth -> handset, vending -> snacks, meter -> change, newsbox -> paper; heat goes up", () => {
  for (const [kind, type] of [["phone", "phone_handset"], ["vending", ""], ["meter", "coin_pile"], ["newsbox", "newspaper"]] as const) {
    const { w, p } = world();
    const d = propsOf(w, kind)[0];
    faceProp(w, "a", d, 0.7);
    const before = new Set(w.items.keys());
    w.action("a", { a: "punch", yaw: p.move.yaw, pitch: 0 });
    const got = [...w.items.values()].filter((i) => !before.has(i.id));
    assert.ok(got.length >= 1, `${kind}: something popped out`);
    if (type) assert.ok(got.some((i) => i.type === type), `${kind}: ${type} (got ${got.map((i) => i.type)})`);
    else assert.ok(got.some((i) => ["candy_bar", "soda_can", "energy_drink"].includes(i.type)), "snacks");
    assert.ok(p.notoriety > 0, "heat");
    assert.equal(w.props.props.get(d.id)!.ready, false, "broken for a while");
  }
});

test("parked cars: punch the window for what's on the seat, and the alarm goes off", () => {
  const { w, p } = world();
  const car = propsOf(w, "car")[0];
  // stand beside the driver's door
  const sx = Math.cos(car.yaw), sz = -Math.sin(car.yaw);
  w.debugTeleport("a", car.x + sx * 2.0, car.z + sz * 2.0, Math.atan2(-sx, -sz));
  const ev: WorldEvent[] = [];
  const before = w.items.size;
  w.action("a", { a: "punch", yaw: p.move.yaw, pitch: 0 });
  run(w, 0.1, ev);
  assert.ok(w.items.size > before, "loot from the seat");
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "car"), "car alarm");
  assert.ok(w.props.stateOf(car.id).alarm);
});

test("hold-up: hold E at the till for 3 s -> a bundle of cash, the cashier cowers, alarm + heat", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[0];
  faceProp(w, "a", till, 1.0);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.5, ev);
  assert.ok(ev.some((e) => e.t === "robStart"));
  const cashier = w.npc.cashierOf(till.shop!)!;
  assert.equal(cashier.state, "cower", "hands up!");
  run(w, ROB_TIME, ev);
  const done = ev.find((e) => e.t === "robDone");
  assert.ok(done, "robbed");
  assert.ok(count(w, "cash_bundle") >= 1);
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "shop"));
  assert.ok(p.notoriety >= 18, `heat ${p.notoriety}`); // (heat cools a little every second)
  // the till is empty for a while
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.1, ev);
  assert.ok(ev.some((e) => e.t === "empty" && e.prop === till.id));
});

test("hold-up gets cancelled if you walk away or let go", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[1];
  faceProp(w, "a", till, 1.0);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "use", prop: till.id });
  run(w, 1, ev);
  w.action("a", { a: "robStop" });
  run(w, 3, ev);
  assert.ok(ev.some((e) => e.t === "robCancel") && !ev.some((e) => e.t === "robDone"), "let go of E");
  p.actionCd = 0;
  w.action("a", { a: "use", prop: till.id });
  run(w, 0.5, ev);
  w.debugTeleport("a", p.move.x + Math.sin(till.yaw) * 3, p.move.z + Math.cos(till.yaw) * 3, 0);
  run(w, 3, ev);
  assert.ok(!ev.some((e) => e.t === "robDone"), "walked away");
});

test("go loud: grab the whole cash register (alarm, big heat); shelf items make the cashier yell", () => {
  const { w, p } = world();
  const till = propsOf(w, "till")[2];
  const reg = [...w.items.values()].find((i) => i.type === "cash_register" && Math.hypot(i.body.x - till.x, i.body.z - till.z) < 1)!;
  assert.ok(reg, "a register sits on every counter");
  faceProp(w, "a", till, 0.9);
  const ev: WorldEvent[] = [];
  run(w, 0.3);
  w.action("a", { a: "grab", item: reg.id });
  run(w, 0.1, ev);
  assert.equal(p.hand, reg.id, "carrying the till");
  assert.ok(ev.some((e) => e.t === "alarm" && e.kind === "shop"));
  assert.ok(p.notoriety >= 24, `heat ${p.notoriety}`);
  // shoplifting
  const q = world();
  const shop = q.w.arena.shops![0];
  const shelfItem = [...q.w.items.values()].find((i) => i.shop === shop.id && i.type !== "cash_register" && i.body.y < 0.6)!;
  assert.ok(shelfItem, "stock on the shelves");
  q.w.debugTeleport("a", shelfItem.body.x + 0.3, shelfItem.body.z + 0.3, 0);
  q.p.move.yaw = Math.atan2(shelfItem.body.x - q.p.move.x, shelfItem.body.z - q.p.move.z);
  const ev2: WorldEvent[] = [];
  q.w.action("a", { a: "grab", item: shelfItem.id });
  run(q.w, 0.1, ev2);
  assert.ok(q.p.hand === shelfItem.id || q.p.pockets.includes(shelfItem.id), "swiped it");
  assert.ok(ev2.some((e) => e.t === "shoplift"), "cashier saw that");
  assert.ok(q.p.notoriety >= 7.9, `heat ${q.p.notoriety}`);
});

test("punching the cashier: cash drops once, they cower, shop alarm", () => {
  const { w, p } = world();
  const shop = w.arena.shops![3];
  const c = w.npc.cashierOf(shop.id)!;
  w.debugTeleport("a", c.move.x - Math.sin(c.move.yaw) * -1.2, c.move.z - Math.cos(c.move.yaw) * -1.2, 0);
  // stand right next to the cashier, facing them (behind the counter is fine for this rule test)
  w.debugTeleport("a", c.move.x + 1.0, c.move.z, -Math.PI / 2);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "punch", yaw: -Math.PI / 2, pitch: 0 });
  run(w, 0.2, ev);
  assert.ok(ev.some((e) => e.t === "npcHit" && e.npc === c.id));
  assert.equal(c.state, "cower");
  assert.ok(count(w, "cash_bundle") >= 1);
  assert.ok(ev.some((e) => e.t === "alarm"));
  assert.ok(p.notoriety >= 19, `heat ${p.notoriety}`);
});

test("traffic: cars drive their lanes, keep their distance, and stop for pedestrians", () => {
  const w = new World({ seed: 2, spawnLoot: false });
  assert.equal(w.traffic.cars.length, 14);
  const start = w.traffic.cars.map((c) => ({ x: c.x, z: c.z }));
  let minGap = 99;
  for (let i = 0; i < 60 * 30; i++) {
    w.tick(); w.takeEvents();
    if (i % 10) continue;
    for (const a of w.traffic.cars) for (const b of w.traffic.cars) if (a !== b && a.loop === b.loop) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z));
    for (const c of w.traffic.cars) assert.ok(w.arena.roads!.some((r) => inRect(r, c.x, c.z, 0.5)), `car ${c.id} left the road at ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
  }
  assert.ok(w.traffic.cars.every((c, i) => Math.hypot(c.x - start[i].x, c.z - start[i].z) > 1), "they move");
  assert.ok(minGap > CAR_HALF_LEN * 2, `no pile-ups (closest ${minGap.toFixed(1)} m)`);
  // a pedestrian standing in the lane ahead: the car stops before reaching them
  const car = w.traffic.cars.find((c) => c.loop === 2)!;
  const px = car.x + Math.sin(car.yaw) * 14, pz = car.z + Math.cos(car.yaw) * 14;
  const ped = w.npc.place("tourist", px, pz, 0);
  for (let i = 0; i < 60 * 5; i++) { ped.move.x = px; ped.move.z = pz; ped.state = "idle"; ped.stateT = 999; w.tick(); w.takeEvents(); }
  assert.ok(Math.hypot(car.x - px, car.z - pz) > CAR_HALF_LEN + 0.3, "didn't hit them");
  assert.ok(car.v < 0.5, `stopped for the pedestrian (v=${car.v.toFixed(2)})`);
});

test("hit by a car: wiped out, your loot spills on the road, respawn at your fort after 10 s", () => {
  const { w, p } = world();
  // hold something, then stand in the lane in front of a moving car
  const tv = w.placeItem("crt_tv", p.move.x, 1, p.move.z + 1);
  run(w, 0.3);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  const ev: WorldEvent[] = [];
  let hit = false;
  for (let k = 0; k < w.traffic.cars.length && !hit; k++) {
    const c = w.traffic.cars[(7 + k) % w.traffic.cars.length];
    w.debugTeleport("a", c.x + Math.sin(c.yaw) * 12, c.z + Math.cos(c.yaw) * 12, c.yaw + Math.PI);
    run(w, 2.5, ev);
    hit = ev.some((e) => e.t === "wipeout" && e.p === "a");
  }
  assert.ok(hit, "wiped out");
  assert.equal(p.hand, "", "dropped everything");
  assert.equal(w.items.get(tv)?.mode, "free", "the TV is lying in the road");
  assert.ok(p.respawnT > 0 && p.move.knockT > 0);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  run(w, WIPEOUT_TIME + 0.2, ev);
  assert.ok(ev.some((e) => e.t === "respawn" && e.p === "a"), "respawned");
  const pad = w.arena.forts!.find((f) => f.slot === p.colorIdx)!;
  assert.ok(Math.hypot(p.move.x - pad.padX, p.move.z - pad.padZ) < 1, "back home");
  assert.ok(p.move.immuneT > 0, "brief safety after respawning");
});

test("cars honk at bandits in the road (they won't stop for you!)", () => {
  const { w } = world();
  const car = w.traffic.cars[0];
  const ev: WorldEvent[] = [];
  w.debugTeleport("a", car.x + Math.sin(car.yaw) * 12, car.z + Math.cos(car.yaw) * 12, 0);
  run(w, 0.3, ev);
  assert.ok(ev.some((e) => e.t === "honk"));
});

test("collision broadphase: near-box lookup never misses a box and keeps the original order", () => {
  const c = buildTrashington();
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2000; k++) {
    const x = (r() - 0.5) * 210, z = (r() - 0.5) * 210, rad = r() * 5;
    const near = nearBoxes(c, x, z, rad);
    const idx = near.map((b) => c.boxes.indexOf(b));
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], "original order");
    for (const b of c.boxes) {
      const touches = Math.abs(b.x - x) <= b.w / 2 + rad && Math.abs(b.z - z) <= b.d / 2 + rad;
      if (touches) assert.ok(near.includes(b), `missed ${b.kind} at ${b.x},${b.z} for ${x.toFixed(1)},${z.toFixed(1)} r${rad.toFixed(1)}`);
    }
  }
});
````

## FILE: shared/test/match.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, fortAt, LOCK_TIME, ROUND_TIME, INTRO_TIME, TALLY_TIME, ROUNDS, TRUCK_SPEED,
  lootDef, type WorldEvent, type MoveInput,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });

/** Advance time; players send "stand still" inputs so their timers run like in a real game. */
function run(w: World, seconds: number, ev?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    for (const p of w.players.values()) w.pushInputs(p.id, [inp(p.lastSeq + 1)]);
    w.tick();
    const e = w.takeEvents();
    if (ev) ev.push(...e);
  }
}
function quiet(players = 1) {
  const w = new World({ seed: 7, npcs: 0, spawnLoot: false });
  const ps = [];
  for (let i = 0; i < players; i++) ps.push(w.addPlayer("p" + i, "P" + i));
  return { w, ps };
}
/** Start a match and skip the intro. */
function toScavenge(w: World) {
  assert.ok(w.startMatch());
  assert.equal(w.match.phase, "intro");
  run(w, INTRO_TIME + 0.05);
  assert.equal(w.match.phase, "scavenge");
  w.match.cancelPlannedEvents(); // no random events in rule tests
}
const yard = (w: World, slot: number) => w.arena.forts!.find((f) => f.slot === slot)!;

test("fort yards: each contains its pad, no loot spawns inside, fortAt finds the right slot", () => {
  const city = buildTrashington();
  assert.equal(city.forts!.length, 4);
  for (const f of city.forts!) {
    assert.equal(fortAt(city, f.padX, f.padZ), f.slot, `pad of fort ${f.slot}`);
    assert.equal(fortAt(city, f.backX, f.backZ), -1, "back alley is outside the yard");
  }
  for (const sp of city.lootSpawns!) assert.equal(fortAt(city, sp.x, sp.z), -1, `loot spawn inside a fort yard at ${sp.x},${sp.z}`);
  assert.equal(fortAt(city, 0, 0), -1);
});

test("match flow: lobby -> intro -> scavenge (3 min) -> tally -> ... -> over after 3 rounds; START again resets", () => {
  const { w, ps } = quiet(2);
  assert.equal(w.match.phase, "lobby");
  w.debugTeleport("p0", 0, 0, 0);
  toScavenge(w);
  const pad = yard(w, ps[0].colorIdx);
  assert.ok(Math.hypot(ps[0].move.x - pad.padX, ps[0].move.z - pad.padZ) < 0.5, "round start sends you home");
  const ev: WorldEvent[] = [];
  run(w, ROUND_TIME - 29, ev);
  assert.ok(ev.some((e) => e.t === "round" && e.phase === "hurry"), "30 s warning");
  run(w, 30);
  assert.equal(w.match.phase, "tally");
  run(w, TALLY_TIME + 0.05);
  assert.equal(w.match.phase, "intro");
  assert.equal(w.match.round, 2);
  for (let r = 2; r <= ROUNDS; r++) { run(w, INTRO_TIME + ROUND_TIME + TALLY_TIME + 0.2); }
  assert.equal(w.match.phase, "over");
  ps[0].cash = 99;
  assert.ok(w.startMatch());
  assert.equal(ps[0].cash, 0, "new match resets cash");
  assert.equal(w.match.round, 1);
});

test("banking: loot in YOUR yard locks after 10 s; locked loot can't be grabbed; rivals can steal before that", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const f0 = yard(w, ps[0].colorIdx);
  const tv = w.placeItem("crt_tv", f0.padX, 0.3, f0.padZ + (f0.padZ < 0 ? 1.5 : -1.5));
  run(w, LOCK_TIME - 0.5);
  assert.equal(w.items.get(tv)!.locked, false, "not yet");
  // rival (p1) sneaks in and grabs it before it locks
  const it = w.items.get(tv)!;
  w.debugTeleport("p1", it.body.x, it.body.z - Math.sign(it.body.z) * -1.4, it.body.z < f0.padZ ? Math.PI : 0);
  // face the item
  const p1 = ps[1];
  p1.move.yaw = Math.atan2(it.body.x - p1.move.x, it.body.z - p1.move.z);
  w.action("p1", { a: "grab", item: tv });
  assert.equal(p1.hand, tv, "stolen from the yard!");
  // drop it back: the lock timer starts over
  p1.actionCd = 0;
  w.action("p1", { a: "drop" });
  run(w, 1);
  assert.ok(w.items.get(tv)!.bankT < 1.5, "timer restarted");
  const ev: WorldEvent[] = [];
  run(w, LOCK_TIME + 0.5, ev);
  assert.equal(w.items.get(tv)!.locked, true);
  assert.ok(ev.some((e) => e.t === "banked" && e.p === "p0"), "banked event for the fort owner");
  assert.ok(w.match.bankedValue(ps[0]) > 0, "counts toward p0's live score");
  p1.actionCd = 0;
  const l = w.items.get(tv)!;
  p1.move.x = l.body.x; p1.move.z = l.body.z - 1.2; p1.move.yaw = 0;
  w.action("p1", { a: "grab", item: tv });
  assert.equal(p1.hand, "", "locked loot can't be picked up");
});

test("loot in an empty (unowned) fort yard doesn't bank", () => {
  const { w } = quiet(1); // slot 0 only
  toScavenge(w);
  const f3 = yard(w, 3);
  const id = w.placeItem("crt_tv", f3.padX, 0.3, f3.padZ);
  run(w, LOCK_TIME + 1);
  assert.equal(w.items.get(id)!.locked, false);
});

test("time's up: carried loot outside your fort is LOST; at home it's cashed; yard loot is cashed", () => {
  const { w, ps } = quiet(2);
  toScavenge(w);
  const [a, b] = ps;
  const fa = yard(w, a.colorIdx);
  // a: stands at home holding a TV, plus a locked TV and an unlocked chicken in the yard
  const yardTv = w.placeItem("crt_tv", fa.padX + 2, 0.3, fa.padZ);
  run(w, LOCK_TIME + 0.5);
  const yardChicken = w.placeItem("rubber_chicken", fa.padX - 2, 0.3, fa.padZ);
  const heldTv = w.placeItem("crt_tv", a.move.x + Math.sin(a.move.yaw), 1, a.move.z + Math.cos(a.move.yaw));
  run(w, 0.5);
  w.action(a.id, { a: "grab", item: heldTv });
  assert.equal(a.hand, heldTv);
  // b: out in the plaza with a TV
  w.debugTeleport(b.id, 5, 5, 0);
  const bTv = w.placeItem("crt_tv", 5, 1, 6);
  run(w, 0.5);
  w.action(b.id, { a: "grab", item: bTv });
  assert.equal(b.hand, bTv);
  const expectA = [yardTv, yardChicken, heldTv].reduce((s, id) => s + w.items.get(id)!.value, 0);
  const ev: WorldEvent[] = [];
  run(w, w.match.timeLeft + 0.1, ev);
  assert.equal(w.match.phase, "tally");
  assert.equal(a.cash, expectA, "everything at home cashed in");
  assert.equal(b.cash, 0);
  assert.ok(ev.some((e) => e.t === "lost" && e.p === b.id && e.count === 1), "b lost the TV");
  assert.ok(!w.items.has(bTv) && !w.items.has(heldTv));
  const res = w.match.results;
  assert.equal(res[0].id, a.id, "results sorted by cash");
  assert.equal(res[1].lost, 1);
  // next round: fresh start, cash kept
  run(w, TALLY_TIME + 0.1);
  assert.equal(w.match.round, 2);
  assert.equal(a.cash, expectA);
  assert.equal(a.hand, "");
});

test("happy hour: loot in the zone is worth double; grab it in time to keep the bonus", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  w.match.trigger("happyhour");
  const e = w.match.ev!;
  const inside = w.placeItem("crt_tv", e.x + 1, 0.3, e.z + 1);
  const outside = w.placeItem("crt_tv", e.x + e.r + 5, 0.3, e.z);
  run(w, 4);
  assert.equal(w.match.ev!.stage, "live");
  run(w, 1);
  assert.equal(w.items.get(inside)!.mult, 2);
  assert.equal(w.items.get(outside)!.mult, 1);
  // grab one, leave another lying
  const kept = w.placeItem("rubber_chicken", e.x - 1, 0.3, e.z - 1);
  run(w, 1);
  const p = ps[0];
  w.debugTeleport(p.id, e.x - 1, e.z - 2.2, 0);
  w.action(p.id, { a: "grab", item: kept });
  assert.equal(p.pockets[0], kept);
  run(w, 30);
  assert.equal(w.match.ev, null, "happy hour over");
  assert.equal(w.items.get(inside)!.mult, 1, "left lying around: bonus gone");
  assert.equal(w.items.get(kept)!.mult, 2, "grabbed during happy hour: keeps the bonus");
});

test("garbage truck: warns, drives the ring road, hoovers loose loot, flattens players, leaves banked loot", () => {
  const { w, ps } = quiet(1);
  toScavenge(w);
  w.match.trigger("truck");
  const e = w.match.ev!;
  const mid = { x: (e.ax! + e.bx!) / 2, z: (e.az! + e.bz!) / 2 };
  const onRoad = w.placeItem("crt_tv", mid.x, 0.3, mid.z);
  const offRoad = w.placeItem("crt_tv", mid.x * 0.4, 0.3, mid.z * 0.4); // back toward the centre, well off the road
  const p = ps[0];
  w.debugTeleport(p.id, (e.ax! * 3 + e.bx!) / 4, (e.az! * 3 + e.bz!) / 4, 0);
  const ev: WorldEvent[] = [];
  run(w, 5.1, ev);
  assert.ok(w.match.truck.on, "truck rolling after the warning");
  run(w, Math.hypot(e.bx! - e.ax!, e.bz! - e.az!) / TRUCK_SPEED + 1, ev);
  assert.ok(!w.items.has(onRoad), "loot on the road got swept");
  assert.ok(w.items.has(offRoad), "loot off the road is safe");
  assert.ok(ev.some((x) => x.t === "swept"));
  assert.ok(ev.some((x) => x.t === "knockdown" && x.p === p.id && x.by === "truck"), "player in the road got flattened");
  assert.equal(w.match.ev, null, "event over when the truck leaves");
  assert.equal(w.match.truck.on, false);
});

test("airdrop: a giant legendary crate parachutes slowly into the plaza", () => {
  const { w } = quiet(1);
  toScavenge(w);
  w.match.trigger("airdrop");
  run(w, 5.1);
  const crate = [...w.items.values()].find((i) => i.type === "airdrop_crate")!;
  assert.ok(crate && crate.chute && crate.body.y > 20, "falling under a chute");
  const def = lootDef("airdrop_crate");
  assert.equal(def.size, "giant");
  assert.equal(def.rarity, "legendary");
  run(w, 3);
  assert.ok(crate.body.vy >= -3.6, "slow fall");
  run(w, 12);
  assert.equal(crate.chute, false, "landed");
  assert.ok(Math.abs(crate.body.x) < 23 && Math.abs(crate.body.z) < 23, "in the plaza");
  assert.equal(w.match.ev, null);
});

test("raccoon heist: steals the best loot from your yard (even banked), escapes = gone; bonk it = you get it back", () => {
  for (const bonk of [false, true]) {
    const { w, ps } = quiet(1);
    toScavenge(w);
    const f = yard(w, ps[0].colorIdx);
    const junk = w.placeItem("rubber_chicken", f.padX + 2, 0.3, f.padZ);
    const prize = w.placeItem("crt_tv", f.padX - 2, 0.3, f.padZ);
    run(w, LOCK_TIME + 0.5);
    assert.ok(w.items.get(prize)!.locked);
    w.debugTeleport(ps[0].id, 30, 30, 0); // away from home
    w.match.trigger("raccoons");
    const ev: WorldEvent[] = [];
    run(w, 5.1, ev);
    const coon = [...w.npc.npcs.values()].find((n) => n.kind === "raccoon")!;
    assert.ok(coon, "a raccoon appeared behind the fort");
    for (let i = 0; i < 20 * 10 && !coon.carry; i++) run(w, 0.1, ev);
    assert.equal(coon.carry, prize, "went for the most valuable thing");
    assert.ok(ev.some((e) => e.t === "raccoonGrab" && e.p === ps[0].id));
    if (bonk) {
      w.debugTeleport(ps[0].id, coon.move.x, coon.move.z - 1.2, 0);
      ps[0].move.yaw = Math.atan2(coon.move.x - ps[0].move.x, coon.move.z - ps[0].move.z);
      w.action(ps[0].id, { a: "punch", yaw: ps[0].move.yaw, pitch: 0 });
      run(w, 1);
      assert.equal(w.items.get(prize)?.mode, "free", "dropped it");
      assert.equal(ps[0].notoriety, 0, "no heat for bonking a thief");
    } else {
      run(w, 40, ev);
      assert.ok(!w.items.has(prize), "got away with it");
      assert.ok(ev.some((e) => e.t === "raccoonEscaped" && e.p === ps[0].id));
      assert.ok(w.items.has(junk), "only took one thing");
    }
  }
});

test("events escalate: 1 in round 1, 2 in round 2, 3 in round 3, never the same one twice in a round", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: true });
  w.addPlayer("p0", "A");
  w.startMatch();
  const counts: string[][] = [[], [], []];
  const ev: WorldEvent[] = [];
  run(w, INTRO_TIME + ROUND_TIME * 3 + TALLY_TIME * 3 + INTRO_TIME * 2 + 1, ev);
  let round = 0;
  for (const e of ev) {
    if (e.t === "round" && e.phase === "scavenge") round = e.round;
    if (e.t === "cityEvent" && e.stage === "warn") counts[round - 1].push(e.kind);
  }
  assert.deepEqual(counts.map((c) => c.length), [1, 2, 3], JSON.stringify(counts));
  for (const c of counts) assert.equal(new Set(c).size, c.length);
  assert.equal(w.match.phase, "over");
});
````

## FILE: shared/test/movement.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTestArena, makeMoveState, stepMovement, sanitizeInput, horizontalSpeed, cloneMoveState, readMoveState, playerHeight,
  PLAYER, SIM_HZ, type MoveInput, type ArenaLayout,
} from "../src/index.js";

const empty: ArenaLayout = { halfSize: 50, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }] };

function input(p: Partial<MoveInput> = {}, seq = 0): MoveInput {
  return { seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p };
}

function run(s: ReturnType<typeof makeMoveState>, arena: ArenaLayout, seconds: number, inp: Partial<MoveInput>) {
  const n = Math.round(seconds * SIM_HZ);
  for (let i = 0; i < n; i++) stepMovement(s, input(inp, i), arena);
  return s;
}

test("walking forward reaches walk speed quickly and moves along +z at yaw 0", () => {
  const s = run(makeMoveState(0, 0), empty, 0.5, { mz: 1 });
  assert.ok(Math.abs(horizontalSpeed(s) - PLAYER.walkSpeed) < 1e-6, `speed ${horizontalSpeed(s)}`);
  assert.ok(s.z > 1.5 && Math.abs(s.x) < 1e-9, `pos ${s.x},${s.z}`);
});

test("sprinting is faster than walking; sprint does not apply walking backwards", () => {
  const a = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  assert.ok(Math.abs(horizontalSpeed(a) - PLAYER.sprintSpeed) < 1e-6);
  const b = run(makeMoveState(0, 0), empty, 1, { mz: -1, sprint: true });
  assert.ok(Math.abs(horizontalSpeed(b) - PLAYER.walkSpeed * PLAYER.backwardFactor) < 1e-6);
});

test("diagonal movement is not faster than straight movement", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, mx: 1 });
  assert.ok(horizontalSpeed(s) <= PLAYER.walkSpeed + 1e-6);
});

test("yaw 90 degrees turns forward into +x (left-handed Babylon convention)", () => {
  const s = run(makeMoveState(0, 0), empty, 0.5, { mz: 1, yaw: Math.PI / 2 });
  assert.ok(s.x > 1.5 && Math.abs(s.z) < 1e-6);
});

test("releasing keys decelerates to a stop", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1 });
  run(s, empty, 0.5, {});
  assert.equal(horizontalSpeed(s), 0);
});

test("cannot walk through a wall, and slides along it", () => {
  const arena: ArenaLayout = { ...empty, boxes: [{ x: 0, y: 1.5, z: 3, w: 10, h: 3, d: 1, kind: "wall" }] };
  // walk diagonally into wall at z = 2.5 (its near face)
  const s = run(makeMoveState(0, 0), arena, 1.2, { mz: 1, mx: 1 });
  assert.ok(s.z <= 2.5 - PLAYER.radius + 1e-3, `z=${s.z}`);
  assert.ok(s.x > 2.5, `should slide along wall, x=${s.x}`);
});

test("walks up a low curb automatically but is blocked by a tall crate", () => {
  const arena: ArenaLayout = {
    ...empty,
    boxes: [
      { x: 0, y: 0.125, z: 3, w: 4, h: 0.25, d: 2, kind: "curb" },
      { x: 10, y: 1, z: 3, w: 4, h: 2, d: 2, kind: "crate" },
    ],
  };
  const a = run(makeMoveState(0, 0), arena, 0.8, { mz: 1 });
  assert.ok(Math.abs(a.y - 0.25) < 1e-6 && a.grounded, `curb y=${a.y}`);
  const b = run(makeMoveState(10, 0), arena, 1.5, { mz: 1 });
  assert.ok(b.y === 0 && b.z < 2, `crate y=${b.y} z=${b.z}`);
});

test("jumping goes up, comes down, and holding jump does not bunny hop", () => {
  const s = makeMoveState(0, 0);
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(!s.grounded && s.vy > 0);
  let peak = 0;
  for (let i = 0; i < SIM_HZ * 2; i++) {
    stepMovement(s, input({ jump: true }), empty);
    peak = Math.max(peak, s.y);
  }
  assert.ok(s.grounded && s.y === 0, "landed");
  assert.ok(peak > 1 && peak < 1.4, `peak ${peak}`);
  // Still holding jump: must not jump again
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(s.grounded);
  // Release and press again: jumps
  stepMovement(s, input({ jump: false }), empty);
  stepMovement(s, input({ jump: true }), empty);
  assert.ok(!s.grounded);
});

test("can jump onto a crate and walk off its edge", () => {
  const arena: ArenaLayout = { ...empty, boxes: [{ x: 0, y: 0.45, z: 3, w: 2, h: 0.9, d: 2, kind: "crate" }] };
  const s = makeMoveState(0, 0);
  let jumped = false;
  for (let i = 0; i < SIM_HZ * 1.2; i++) {
    const wantJump = s.z > 1.2 && !jumped;
    if (wantJump) jumped = true;
    stepMovement(s, input({ mz: s.z < 3 ? 1 : 0, jump: wantJump }), arena);
  }
  assert.ok(Math.abs(s.y - 0.9) < 1e-6 && s.grounded, `on crate y=${s.y}`);
  run(s, arena, 1.5, { mz: 1 });
  assert.ok(s.y === 0 && s.grounded && s.z > 5, "walked off and landed");
});

test("full test arena: player stays in bounds when running into corners", () => {
  const arena = buildTestArena();
  const s = makeMoveState(0, -22);
  run(s, arena, 6, { mz: -1, mx: -1, sprint: true });
  assert.ok(Math.abs(s.x) <= arena.halfSize && Math.abs(s.z) <= arena.halfSize);
});

test("determinism: identical inputs give bit-identical state (needed for reconciliation)", () => {
  const arena = buildTestArena();
  const seqs: MoveInput[] = [];
  let r = 1;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 600; i++) {
    seqs.push(input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6, sprint: rand() > 0.5, jump: rand() > 0.9 }, i));
  }
  const a = makeMoveState(0, -22);
  const b = makeMoveState(0, -22);
  for (const i of seqs) stepMovement(a, i, arena);
  // replay b in two halves with a clone in between, as reconciliation does
  for (const i of seqs.slice(0, 300)) stepMovement(b, i, arena);
  const c = cloneMoveState(b);
  for (const i of seqs.slice(300)) stepMovement(c, i, arena);
  assert.deepEqual(c, a);
});

test("sanitizeInput rejects junk and clamps values", () => {
  assert.equal(sanitizeInput(null), null);
  assert.equal(sanitizeInput({ seq: -3 } as any), null);
  assert.equal(sanitizeInput({ seq: 1.5 } as any), null);
  const v = sanitizeInput({ seq: 4, mx: 50, mz: 50, pitch: 99, yaw: NaN, sprint: "yes" as any, jump: true })!;
  assert.ok(Math.hypot(v.mx, v.mz) <= 1 + 1e-9);
  assert.equal(v.pitch, 1.5);
  assert.equal(v.yaw, 0);
  assert.equal(v.sprint, false);
  assert.equal(v.jump, true);
});

// ---------------------------------------------------------------- Phase 1 moves

test("momentum: stopping from a sprint takes a moment (weighty skid)", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  const z0 = s.z;
  run(s, empty, 0.15, {});
  assert.ok(horizontalSpeed(s) > 3, `still moving after 0.15 s: ${horizontalSpeed(s)}`);
  run(s, empty, 0.6, {});
  assert.equal(horizontalSpeed(s), 0);
  assert.ok(s.z - z0 > 1, "skidded forward");
});

test("stamina: sprinting drains it, empties to winded (walk speed), then refills at rest", () => {
  const s = makeMoveState(0, 0);
  let wasWinded = false, sprintWhileWinded = false, t = 0, windedFor = 0;
  for (let i = 0; i < 660; i++) {
    stepMovement(s, input({ mz: 1, sprint: true }, i), empty);
    windedFor = s.winded ? windedFor + 1 / 60 : 0;
    // allow ~0.25 s to coast down from sprint speed (momentum), then it must be walking pace
    if (s.winded) { wasWinded = true; if (windedFor > 0.25 && horizontalSpeed(s) > PLAYER.walkSpeed + 0.01) sprintWhileWinded = true; }
    if (!wasWinded) t = i / 60;
  }
  assert.ok(wasWinded, "ran out of stamina");
  assert.ok(t > 7.5 && t < 8.5, `~8 s of sprint before winded (${t.toFixed(2)} s)`);
  assert.ok(!sprintWhileWinded, "winded players can't sprint");
  run(s, empty, 3.5, {});
  assert.equal(s.stamina, 1);
  assert.ok(!s.winded);
});

test("crouch: slower, shorter, and you can't stand up under a low ceiling", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, crouch: true });
  assert.ok(s.crouching);
  assert.ok(Math.abs(horizontalSpeed(s) - PLAYER.crouchSpeed) < 1e-6);
  const tunnel = { ...empty, boxes: [{ x: 0, y: 1.4, z: 5, w: 4, h: 0.3, d: 4, kind: "slab" as const }] };
  // standing: blocked by slab edge
  const a = run(makeMoveState(0, 0), tunnel, 1.5, { mz: 1 });
  assert.ok(a.z < 3, `standing player blocked: z=${a.z}`);
  // crouching: fits under
  const b = run(makeMoveState(0, 0), tunnel, 1.8, { mz: 1, crouch: true });
  assert.ok(b.z > 3.5, `crouching player gets under: z=${b.z}`);
  // release crouch while under the slab: stays crouched
  run(b, tunnel, 0.2, {});
  assert.ok(b.crouching, "can't stand under the slab");
  // no jumping into the ceiling either
  stepMovement(b, input({ jump: true }), tunnel);
  assert.ok(b.grounded);
});

test("belly slide: sprint + crouch = fast slide that slows down, then cooldown", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  stepMovement(s, input({ mz: 1, sprint: true, crouch: true }), empty);
  assert.ok(s.slideT > 0, "slide started");
  assert.ok(horizontalSpeed(s) > PLAYER.sprintSpeed + 1, "slide is faster than sprint");
  run(s, empty, 1.2, { mz: 1, crouch: true });
  assert.equal(s.slideT, 0, "slide ended");
  assert.ok(s.crouching, "ends crouched while crouch held");
  // walking speed is too slow to slide
  const w = run(makeMoveState(0, 0), empty, 1, { mz: 1 });
  stepMovement(w, input({ mz: 1, crouch: true }), empty);
  assert.equal(w.slideT, 0);
});

test("jumping out of a slide keeps the momentum", () => {
  const s = run(makeMoveState(0, 0), empty, 1, { mz: 1, sprint: true });
  stepMovement(s, input({ mz: 1, crouch: true }), empty);
  stepMovement(s, input({ mz: 1, crouch: true }), empty);
  stepMovement(s, input({ mz: 1, jump: true }), empty);
  assert.equal(s.slideT, 0);
  assert.ok(!s.grounded && horizontalSpeed(s) > PLAYER.sprintSpeed);
});

test("dodge: quick hop-dash sideways, costs stamina, has a cooldown", () => {
  const s = makeMoveState(0, 0);
  stepMovement(s, input({ mx: 1, dodge: true }), empty);
  assert.ok(s.dodgeT > 0 && !s.grounded);
  assert.ok(s.vx > 9, "dashing right");
  assert.ok(Math.abs(s.stamina - (1 - PLAYER.dodgeStamina)) < 0.01);
  run(s, empty, 0.5, { mx: 1, dodge: true }); // holding dodge doesn't repeat
  assert.ok(s.x > 2, `dodged ${s.x}m`);
  assert.ok(s.dodgeCd > 0, "cooldown running");
  stepMovement(s, input({ mx: 1 }), empty);
  stepMovement(s, input({ mx: 1, dodge: true }), empty);
  assert.equal(s.dodgeT, 0, "can't dodge during cooldown");
  // with no direction held, dodge goes forward
  const f = makeMoveState(0, 0);
  stepMovement(f, input({ dodge: true }), empty);
  assert.ok(f.vz > 9);
});

test("mantle: climbs waist, chest and head-high ledges; not too-high walls", () => {
  for (const h of [0.9, 1.4, 1.95]) {
    const arena = { ...empty, boxes: [{ x: 0, y: h / 2, z: 2, w: 3, h, d: 2, kind: "ledge" as const }] };
    const s = run(makeMoveState(0, 0), arena, 0.6, { mz: 1 }); // walk up to it
    stepMovement(s, input({ mz: 1, jump: true }), arena);
    assert.ok(s.mantleT > 0, `mantle started on ${h}m ledge`);
    run(s, arena, 0.8, { jump: true }); // let go of forward so we don't walk off the far side
    assert.ok(Math.abs(s.y - h) < 1e-6 && s.grounded, `on top of ${h}m ledge (y=${s.y})`);
  }
  const wall = { ...empty, boxes: [{ x: 0, y: 1.5, z: 2, w: 3, h: 3, d: 2, kind: "wall" as const }] };
  const w = run(makeMoveState(0, 0), wall, 0.6, { mz: 1 });
  stepMovement(w, input({ mz: 1, jump: true }), wall);
  assert.equal(w.mantleT, 0, "3m wall is not climbable");
});

test("mantle is refused when there's no room on top", () => {
  const arena = { ...empty, boxes: [
    { x: 0, y: 0.5, z: 2, w: 3, h: 1, d: 2, kind: "ledge" as const },
    { x: 0, y: 1.5, z: 2.5, w: 3, h: 1, d: 1.2, kind: "crate" as const },
  ] };
  const s = run(makeMoveState(0, 0), arena, 0.6, { mz: 1 });
  stepMovement(s, input({ mz: 1, jump: true }), arena);
  assert.equal(s.mantleT, 0);
});

test("big fall = comedy stumble (slowed briefly), small hop = no stumble", () => {
  const drop = { ...empty, boxes: [{ x: 0, y: 2, z: 0, w: 2, h: 4, d: 2, kind: "platform" as const }] };
  const s = makeMoveState(0, 0);
  s.y = 4;
  run(s, drop, 1.5, { mz: 1 });
  assert.ok(s.grounded && s.y === 0);
  // landed and stumbled at some point: check by replaying and watching stumbleT
  const t = makeMoveState(0, 0); t.y = 4;
  let stumbled = false;
  for (let i = 0; i < 90; i++) { stepMovement(t, input({ mz: 1 }, i), drop); if (t.stumbleT > 0) stumbled = true; }
  assert.ok(stumbled, "stumbled after a 4 m drop");
  const j = makeMoveState(0, 0);
  let sj = false;
  stepMovement(j, input({ jump: true }), empty);
  for (let i = 0; i < 90; i++) { stepMovement(j, input({}, i), empty); if (j.stumbleT > 0) sj = true; }
  assert.ok(!sj, "normal jump doesn't stumble");
});

test("determinism with all Phase 1 moves mixed in", () => {
  const arena = buildTestArena();
  const seqs: MoveInput[] = [];
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) {
    seqs.push(input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6, sprint: rand() > 0.3,
      jump: rand() > 0.85, crouch: rand() > 0.8, dodge: rand() > 0.93 }, i));
  }
  const a = makeMoveState(-10, -14);
  const b = makeMoveState(-10, -14);
  for (const i of seqs) stepMovement(a, i, arena);
  for (const i of seqs.slice(0, 700)) stepMovement(b, i, arena);
  const c = readMoveState({ ...b });
  for (const i of seqs.slice(700)) stepMovement(c, i, arena);
  assert.deepEqual(c, a);
});

test("never ends up inside a box, whatever you press (fuzz)", () => {
  const arena = buildTestArena();
  let r = 99;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let run_ = 0; run_ < 20; run_++) {
    const sp = arena.spawns[run_ % 4];
    const s = makeMoveState(sp.x + rand() * 30 - 15, sp.z + rand() * 30);
    for (let i = 0; i < 900; i++) {
      stepMovement(s, input({ mx: rand() * 2 - 1, mz: rand() * 2 - 1, yaw: rand() * 6.28, sprint: rand() > 0.3,
        jump: rand() > 0.8, crouch: rand() > 0.85, dodge: rand() > 0.95 }, i), arena);
      if (s.mantleT > 0) continue;
      const h = playerHeight(s);
      for (const b of arena.boxes) {
        const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
        const insideY = s.y + 0.05 < top && s.y + h - 0.05 > bottom;
        const insideXZ = Math.abs(s.x - b.x) < b.w / 2 - 0.05 && Math.abs(s.z - b.z) < b.d / 2 - 0.05;
        assert.ok(!(insideY && insideXZ), `run ${run_} step ${i}: inside ${b.kind} at ${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`);
      }
      assert.ok(Number.isFinite(s.x + s.y + s.z) && s.y >= -1e-9, "finite and above ground");
    }
  }
});
````

## FILE: shared/test/names.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRoomCode, isValidRoomCode, normalizeRoomCode, sanitizeName, NAME_MAX_LENGTH } from "../src/index.js";

test("room codes are valid, and normalizing handles lowercase and junk", () => {
  for (let i = 0; i < 200; i++) assert.ok(isValidRoomCode(makeRoomCode()));
  assert.equal(normalizeRoomCode(" ab-c2d9 "), "ABC2D");
  assert.ok(!isValidRoomCode("ABCD0")); // 0 is excluded as look-alike
});

test("names are cleaned and capped", () => {
  assert.equal(sanitizeName("  <b>Bob</b>  "), "bBob/b");
  assert.ok(sanitizeName("x".repeat(100)).length === NAME_MAX_LENGTH);
  assert.ok(sanitizeName("   ").length > 0);
  assert.ok(sanitizeName(42).length > 0);
});
````

## FILE: shared/test/npc.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildNavGraph, buildTrashington, inRect, lootDef, PLAYER, NPC_DEFS, PUNCH_COOLDOWN, KNOCK_TIMES, NPC_COUNT, KNOCK_IMMUNITY,
  type MoveInput, type WorldEvent,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function settle(w: World, seconds: number, collect?: WorldEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
function idle(w: World, id: string, seconds: number, p: Partial<MoveInput> = {}, collect?: WorldEvent[]) {
  const pl = w.players.get(id)!;
  for (let i = 0; i < Math.round(seconds * 60); i++) { w.pushInputs(id, [inp(pl.lastSeq + 1, p)]); w.tick(); const e = w.takeEvents(); if (collect) collect.push(...e); }
}
/** A quiet city (no random pedestrians, no loot) with one player at the plaza edge facing +z. */
function quiet() {
  const w = new World({ seed: 11, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  p.move.x = 0; p.move.z = -20; p.move.yaw = 0;
  return { w, p };
}

test("route map: every point and every link is clear of walls, all connected, plaza covered", () => {
  const city = buildTrashington();
  const g = buildNavGraph(city);
  assert.ok(g.length > 150, `${g.length} route points`);
  const solid = city.boxes.filter((b) => b.y + b.h / 2 > 0.4 && b.y - b.h / 2 < 1.8);
  const clear = (x: number, z: number) => !solid.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.4 && Math.abs(z - b.z) < b.d / 2 + 0.4);
  for (const n of g) {
    assert.ok(clear(n.x, n.z), `node ${n.x},${n.z}`);
    for (const l of n.links) { const m = g[l]; for (let t = 0; t <= 1; t += 0.05) assert.ok(clear(n.x + (m.x - n.x) * t, n.z + (m.z - n.z) * t), `link ${n.x},${n.z} -> ${m.x},${m.z}`); }
  }
  const seen = new Set([0]); const st = [0];
  while (st.length) for (const l of g[st.pop()!].links) if (!seen.has(l)) { seen.add(l); st.push(l); }
  assert.equal(seen.size, g.length, "one connected network");
  assert.ok(g.filter((n) => Math.abs(n.x) < 23 && Math.abs(n.z) < 23).length >= 12, "plenty of plaza points");
  // roads are only crossed at crosswalks
  for (const n of g) for (const l of n.links) {
    const m = g[l];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = n.x + (m.x - n.x) * t, z = n.z + (m.z - n.z) * t;
      if (city.roads!.some((r) => inRect(r, x, z))) assert.ok(city.crosswalks!.some((c) => inRect(c, x, z, 0.3)), `jaywalking link ${n.x},${n.z} -> ${m.x},${m.z}`);
    }
  }
});

test("the crowd wanders for 2 minutes: never inside walls, never stuck, never NaN, stay in town", () => {
  const w = new World({ seed: 5, spawnLoot: false });
  const walkers = () => [...w.npc.npcs.values()].filter((n) => n.kind !== "cashier");
  assert.equal(walkers().length, NPC_COUNT);
  assert.equal(w.npc.npcs.size - NPC_COUNT, w.arena.shops!.length, "one cashier per shop");
  const start = new Map([...w.npc.npcs.values()].map((n) => [n.id, { x: n.move.x, z: n.move.z }]));
  const travelled = new Map<string, number>();
  const last = new Map([...start]);
  for (let i = 0; i < 120 * 60; i++) {
    w.tick();
    w.takeEvents();
    if (i % 30 === 0) {
      for (const n of w.npc.npcs.values()) {
        const m = n.move;
        assert.ok(Number.isFinite(m.x + m.z + m.y), `${n.kind} NaN`);
        assert.ok(Math.abs(m.x) < w.arena.halfSize && Math.abs(m.z) < w.arena.halfSize, `${n.kind} wandered off to ${m.x.toFixed(1)},${m.z.toFixed(1)}`);
        for (const b of w.arena.boxes) {
          if (b.y + b.h / 2 <= 0.4 || b.y - b.h / 2 > 1.7) continue;
          assert.ok(!(Math.abs(m.x - b.x) < b.w / 2 - 0.05 && Math.abs(m.z - b.z) < b.d / 2 - 0.05 && m.y < b.y + b.h / 2 - 0.05), `${n.kind} inside ${b.kind}`);
        }
        const l = last.get(n.id)!;
        travelled.set(n.id, (travelled.get(n.id) ?? 0) + Math.hypot(m.x - l.x, m.z - l.z));
        last.set(n.id, { x: m.x, z: m.z });
      }
    }
  }
  for (const [id, d] of travelled) if (w.npc.npcs.get(id)?.kind !== "cashier") assert.ok(d > 30, `pedestrian ${id} only walked ${d.toFixed(1)} m in 2 minutes (stuck?)`);
});

test("punch a businessman: BONK, his loot pops out, he flees; second punch gets nothing", () => {
  const { w, p } = quiet();
  const n = w.npc.place("businessman", 0, -18.8, Math.PI);
  const ev: WorldEvent[] = [];
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  ev.push(...w.takeEvents());
  assert.ok(ev.some((e) => e.t === "punch" && e.hit === "npc"), "hit registered");
  assert.ok(n.robbed);
  const dropped = [...w.items.values()].filter((it) => lootDef(it.type).npcOnly);
  assert.equal(dropped.length, 1, "one item popped out");
  assert.ok(NPC_DEFS.businessman.loot.some(([t]) => t === dropped[0].type));
  assert.ok(p.notoriety >= 10, "notoriety went up");
  settle(w, 1.5, ev);
  assert.equal(n.state, "flee");
  settle(w, 3);
  n.move.x = p.move.x; n.move.z = p.move.z + 1.2; n.state = "idle"; n.stateT = 99;
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal([...w.items.values()].filter((it) => lootDef(it.type).npcOnly).length, 1, "nothing more to steal");
});

test("punching needs empty hands and respects the cooldown", () => {
  const { w, p } = quiet();
  const n = w.npc.place("tourist", 0, -18.8, Math.PI);
  const tv = w.placeItem("traffic_cone", 0, 0, -19);
  settle(w, 1);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(!n.robbed, "can't punch with full hands");
  settle(w, 0.3); // (grab/drop have a 0.18 s anti-spam cooldown)
  w.action("a", { a: "drop" });
  assert.equal(p.hand, "");
  settle(w, 0.3);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents().filter((e) => e.t === "punch");
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal(w.takeEvents().filter((e) => e.t === "punch").length, 0, "second punch within the cooldown is ignored");
  assert.equal(ev.length, 1);
  assert.ok(PUNCH_COOLDOWN > 0.3);
});

test("punch misses when nobody is in front of you", () => {
  const { w } = quiet();
  w.npc.place("tourist", 0, -21.5, 0); // behind the player
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(w.takeEvents().some((e) => e.t === "punch" && e.hit === "none"));
});

test("joggers sometimes sidestep your punch", () => {
  let dodges = 0, hits = 0;
  for (let s = 0; s < 40; s++) {
    const w = new World({ seed: 100 + s, npcs: 0, spawnLoot: false });
    const p = w.addPlayer("a", "A"); p.move.x = 0; p.move.z = -20;
    w.npc.place("jogger", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    const ev = w.takeEvents();
    if (ev.some((e) => e.t === "npcDodge")) dodges++; else if (ev.some((e) => e.t === "npcHit")) hits++;
  }
  assert.ok(dodges >= 5 && hits >= 15, `dodges ${dodges}, hits ${hits}`);
});

test("gym bro fights back: chases you, telegraphs swings, 2 hits knock you down and you drop your stuff", () => {
  const { w, p } = quiet();
  const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
  const ch = w.placeItem("rubber_chicken", 0.3, 0, -19.5);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch }); // pocket it (hands stay free for punching)
  assert.equal(p.pockets[0], ch);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev: WorldEvent[] = [];
  // stand there and take it, checking every 1/10 s
  for (let k = 0; k < 60 && !ev.some((e) => e.t === "knockdown"); k++) idle(w, "a", 0.1, {}, ev);
  assert.ok(ev.some((e) => e.t === "npcAttack"), "he swung at you");
  assert.ok(ev.some((e) => e.t === "knockdown" && e.p === "a" && e.by === bro.id), "knocked down after 2 hits");
  assert.equal(p.pockets[0], "", "dropped your pocket loot");
  assert.equal(bro.state, "gloat", "he gloats over you (regression: used to be overwritten by chase -> huff)");
});

test("beat a fighter to 2 hits first: KO with stars + bonus loot", () => {
  const { w } = quiet();
  const cop = w.npc.place("mall_cop", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  settle(w, 0.65); // cooldown passes, he's still dazed/closing in
  cop.move.x = 0; cop.move.z = -18.8;
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "npcKo"), "KO'd");
  assert.equal(cop.state, "ko");
  assert.equal([...w.items.values()].filter((it) => lootDef(it.type).npcOnly).length, 2, "his item + bonus loot");
  assert.ok(w.players.get("a")!.notoriety >= 45, "mall cop hits count extra");
});

test("PvP punch: full knockdown, drop everything, then immunity; repeat knockdowns get shorter", () => {
  const w = new World({ seed: 3, npcs: 0, spawnLoot: false });
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = 0; a.move.z = -20; b.move.x = 0; b.move.z = -18.9;
  const tv = w.placeItem("crt_tv", 0.9, 0, -18.3);
  settle(w, 1);
  b.move.yaw = 0.8;
  w.action("b", { a: "grab", item: tv });
  assert.equal(b.hand, tv);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal(b.move.knockT, KNOCK_TIMES[0]);
  assert.equal(b.hand, "", "dropped the TV");
  assert.equal(w.items.get(tv)!.mode, "free");
  // knocked players can't act
  w.action("b", { a: "grab", item: tv });
  assert.equal(b.hand, "");
  // immune right after: a second punch is blocked
  // (timers tick as the victim's client keeps sending input, like a real client at 60 Hz)
  idle(w, "b", 2.1);
  b.move.x = 0; b.move.z = -18.9; b.move.vx = 0; b.move.vz = 0; // (the knockdown shoved B away)
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(w.takeEvents().some((e) => e.t === "punch" && e.hit === "blocked"));
  idle(w, "b", KNOCK_IMMUNITY + 0.5);
  b.move.x = 0; b.move.z = -18.9; b.move.vx = 0; b.move.vz = 0;
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.equal(b.move.knockT, KNOCK_TIMES[1], "second knockdown within 12 s is shorter");
});

test("the mime traps you in an invisible box, then fights", () => {
  const { w, p } = quiet();
  const mime = w.npc.place("mime", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(p.move.trapT > 0, "trapped");
  const z0 = p.move.z;
  idle(w, "a", 0.5, { mz: 1, sprint: true });
  assert.ok(Math.abs(p.move.z - z0) < 0.35, "can't walk out of the box");
  settle(w, 0.8);
  assert.ok(["chase", "windup"].includes(mime.state), `mime ${mime.state}`);
});

test("pigeon lady: swarm slows you; dodging shakes some pigeons off", () => {
  const { w, p } = quiet();
  w.npc.place("pigeon_lady", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(p.move.swarmT > 4, "swarmed");
  idle(w, "a", 1, { mz: 1 });
  assert.ok(Math.hypot(p.move.vx, p.move.vz) <= PLAYER.walkSpeed * 0.6 + 0.01, "slowed down");
  const before = p.move.swarmT;
  idle(w, "a", 1 / 60, { mz: 1, dodge: true });
  assert.ok(p.move.swarmT < before - 1.4, "dodge shook pigeons off");
});

test("tourist camera flash, bystanders flee, influencer films (extra notoriety)", () => {
  const { w, p } = quiet();
  w.npc.place("tourist", 0, -18.8, Math.PI);
  const by = w.npc.place("businessman", 3, -16, 0);
  const inf = w.npc.place("influencer", -4, -15, 0);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "flash" && e.p === "a"));
  assert.equal(by.state, "flee", "bystander flees");
  assert.equal(inf.state, "film", "influencer films");
  assert.ok(p.notoriety >= 20, `notoriety ${p.notoriety}`);
});

test("thrown items bonk pedestrians and knock their loot out", () => {
  const { w } = quiet();
  const n = w.npc.place("businessman", 0, -14, Math.PI);
  const cone = w.placeItem("traffic_cone", 0, 0, -19.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: cone });
  settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0.12 });
  const ev: WorldEvent[] = [];
  settle(w, 1.5, ev);
  assert.ok(ev.some((e) => e.t === "npcHit" && e.how === "throw"), "bonked by the cone");
  assert.ok(n.robbed);
});

test("the crowd stays full: robbed pedestrians far from everyone get replaced", () => {
  const w = new World({ seed: 8, spawnLoot: false });
  w.addPlayer("a", "A");
  for (const n of [...w.npc.npcs.values()].slice(0, 6)) n.robbed = true;
  settle(w, 6);
  assert.equal([...w.npc.npcs.values()].filter((n) => n.kind !== "cashier").length, NPC_COUNT);
});

test("pedestrian world is deterministic (same seed + inputs = same crowd)", () => {
  const run = () => {
    const w = new World({ seed: 21, spawnLoot: false });
    w.addPlayer("a", "A");
    for (let i = 0; i < 900; i++) {
      w.pushInputs("a", [inp(i, { mz: 1, yaw: 0.3 })]);
      if (i % 50 === 0) w.action("a", { a: "punch", yaw: 0.3, pitch: 0 });
      w.tick();
    }
    return JSON.stringify([...w.npc.npcs.values()].map((n) => [n.id, n.move.x.toFixed(6), n.move.z.toFixed(6), n.state]));
  };
  assert.equal(run(), run());
});

test("fighters give up: when you get far away, and after 8 s of chasing", () => {
  // run away (far)
  {
    const { w } = quiet();
    const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    idle(w, "a", 0.8);
    assert.ok(["chase", "windup"].includes(bro.state), `chasing (${bro.state})`);
    w.debugTeleport("a", 30, -30, 0); // 30+ m away
    idle(w, "a", 0.5);
    assert.ok(["huff", "walk"].includes(bro.state), `gave up when far (${bro.state})`);
  }
  // keep just out of reach for a long time: gives up after ~8 s
  {
    const { w, p } = quiet();
    const bro = w.npc.place("gym_bro", 0, -18.8, Math.PI);
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    let gaveUp = -1;
    for (let k = 0; k < 120 && gaveUp < 0; k++) {
      // stay 6 m ahead of him (teleport-kite: tests the timer, not our running skill)
      const dx = p.move.x - bro.move.x, dz = p.move.z - bro.move.z, l = Math.max(0.01, Math.hypot(dx, dz));
      w.debugTeleport("a", bro.move.x + (dx / l) * 6, bro.move.z + (dz / l) * 6, 0);
      idle(w, "a", 0.1);
      if (bro.state === "huff") gaveUp = k * 0.1;
    }
    assert.ok(gaveUp > 6 && gaveUp < 10, `gave up after ${gaveUp.toFixed(1)} s`);
  }
});

test("heat: punching raises notoriety, mall cops count extra, and it cools down over time", () => {
  const { w, p } = quiet();
  w.npc.place("tourist", 0, -18.8, Math.PI);
  w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  const afterTourist = p.notoriety;
  assert.ok(afterTourist >= 10, `tourist punch heat ${afterTourist}`);
  idle(w, "a", 20);
  assert.ok(p.notoriety < afterTourist, `cooled down: ${afterTourist} -> ${p.notoriety.toFixed(1)}`);
  const q = quiet();
  q.w.npc.place("mall_cop", 0, -18.8, Math.PI);
  q.w.action("a", { a: "punch", yaw: 0, pitch: 0 });
  assert.ok(q.p.notoriety >= afterTourist + 15 - 0.01, `mall cop heat ${q.p.notoriety} vs tourist ${afterTourist}`);
});

test("pedestrians step around players instead of walking through them", () => {
  const w = new World({ seed: 21, spawnLoot: false });
  const p = w.addPlayer("a", "Blocker");
  p.move.x = 0; p.move.z = -11; // on a busy route line near the plaza
  let closest = 9;
  for (let i = 0; i < 60 * 60; i++) {
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); w.takeEvents();
    for (const n of w.npc.npcs.values()) closest = Math.min(closest, Math.hypot(n.move.x - p.move.x, n.move.z - p.move.z));
  }
  assert.ok(closest > 0.45, `closest pedestrian got to ${closest.toFixed(2)} m (bodies overlap below ~0.76)`);
});

test("pedestrians ease into walking and curve around corners (no instant 90-degree snaps)", () => {
  const w = new World({ seed: 4, spawnLoot: false });
  let maxTurn = 0, maxAccel = 0;
  const prev = new Map<string, { yaw: number; v: number }>();
  for (let i = 0; i < 20 * 60; i++) {
    w.tick(); w.takeEvents();
    if (i % 2) continue; // pedestrians update at 30 Hz
    for (const n of w.npc.npcs.values()) {
      if (n.state !== "walk") { prev.delete(n.id); continue; }
      const v = n.curSpeed, o = prev.get(n.id); // intended walking speed (bumping a wall can still stop you dead)
      if (o) {
        let d = Math.abs(n.move.yaw - o.yaw); if (d > Math.PI) d = Math.PI * 2 - d;
        maxTurn = Math.max(maxTurn, d * 30); maxAccel = Math.max(maxAccel, Math.abs(v - o.v) * 30);
      }
      prev.set(n.id, { yaw: n.move.yaw, v });
    }
  }
  assert.ok(maxTurn <= 3.3, `walking turn rate peaked at ${maxTurn.toFixed(2)} rad/s`);
  assert.ok(maxAccel < 6, `walking acceleration peaked at ${maxAccel.toFixed(2)} m/s^2`);
});

test("pedestrians walk around parked cars: a chaser reaches you behind one, nobody ends up inside", () => {
  const city = buildTrashington();
  const cars = city.boxes.filter((b) => b.kind === "car");
  assert.ok(cars.length >= 10);
  let reached = 0;
  for (const c of cars.slice(0, 8)) {
    const long = c.d > c.w; // car's long axis along z?
    const w = new World({ seed: 4, npcs: 0, spawnLoot: false });
    const p = w.addPlayer("a", "A");
    // player on one long side of the car, gym bro straight across on the other side
    const ox = long ? c.w / 2 + 0.9 : 0, oz = long ? 0 : c.d / 2 + 0.9;
    p.move.x = c.x + ox; p.move.z = c.z + oz; p.move.immuneT = 99; // no knockdowns, just the chase
    const n = w.npc.place("gym_bro", c.x - ox, c.z - oz, 0);
    n.state = "chase"; n.target = "a"; n.chaseT = 0;
    let best = 99;
    for (let i = 0; i < 60 * 6; i++) {
      w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); w.takeEvents();
      const m = n.move;
      assert.ok(!(Math.abs(m.x - c.x) < c.w / 2 + 0.1 && Math.abs(m.z - c.z) < c.d / 2 + 0.1), "inside the car");
      best = Math.min(best, Math.hypot(m.x - p.move.x, m.z - p.move.z));
    }
    if (best < 1.6) reached++;
  }
  assert.ok(reached >= 7, `chaser got round the car ${reached}/8 times`);
});
````

## FILE: shared/test/police.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, inRect, starsOf, JAIL_TIME, BREAKOUT_HEAT, COP_RUN, PLAYER, makeLock, newLockRun, lockPress, lockUpdate,
  pinPos, bindingPin, LOCK, type MoveInput, type WorldEvent, type LockRun,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });
function quiet(seed = 21) {
  const w = new World({ seed, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, 0, -20, 0);
  return { w, p };
}
function run(w: World, id: string, seconds: number, p: Partial<MoveInput> = {}, collect?: WorldEvent[], each?: () => void) {
  const pl = w.players.get(id)!;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    w.pushInputs(id, [inp(pl.lastSeq + 1, p)]); w.tick();
    const e = w.takeEvents(); if (collect) collect.push(...e);
    each?.();
  }
}
/** Perfect lock-picking: press each binding pin in the middle of its next window. */
function perfectPresses(seed: number, start = 0.5): { pin: number; t: number }[] {
  const r = newLockRun(seed);
  const out: { pin: number; t: number }[] = [];
  let t = start;
  while (!r.solved && t < 60) {
    const pin = bindingPin(r), p = r.def.pins[pin];
    let a = t + 0.05;
    while (!(pinPos(p, a) >= p.lo && pinPos(p, a) <= p.hi)) a += 0.002;
    let b = a;
    while (pinPos(p, b) >= p.lo && pinPos(p, b) <= p.hi) b += 0.002;
    t = (a + b) / 2;
    lockPress(r, pin, t);
    out.push({ pin, t });
  }
  return out;
}

test("wanted stars: 30 / 60 / 90 heat", () => {
  assert.deepEqual([0, 29, 30, 59, 60, 89, 90, 100].map(starsOf), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("the station: 4 barred cells inside, door and back alley outside, road network on the roads", () => {
  const c = buildTrashington();
  const st = c.station!;
  assert.equal(st.cells.length, 4);
  for (const cell of st.cells) assert.ok(inRect(st.rect, cell.x, cell.z) && inRect(cell.rect, cell.x, cell.z));
  assert.ok(!inRect(st.rect, st.door.x, st.door.z) && !inRect(st.rect, st.alley.x, st.alley.z));
  assert.ok(c.boxes.filter((b) => b.kind === "bars").length === 4);
  const g = c.roadGraph!;
  // every road link runs down the middle of a road
  for (const [a, b] of g.edges) for (let k = 0; k <= 1; k += 0.05) {
    const x = g.nodes[a].x + (g.nodes[b].x - g.nodes[a].x) * k, z = g.nodes[a].z + (g.nodes[b].z - g.nodes[a].z) * k;
    assert.ok(c.roads!.some((r) => inRect(r, x, z)), `road link off the road at ${x},${z}`);
  }
  const seen = new Set([0]), st2 = [0];
  while (st2.length) { const n = st2.pop()!; for (const [a, b] of g.edges) { const o = a === n ? b : b === n ? a : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); st2.push(o); } } }
  assert.equal(seen.size, g.nodes.length, "road network connected");
});

test("dispatch: 1 star = 1 cop, 2 = 2, 3 = 3 + a cop car; cops arrive from out of sight, 22-42 m away", () => {
  for (const [heat, cops, cars] of [[35, 1, 0], [65, 2, 0], [95, 3, 1]]) {
    const { w, p } = quiet();
    p.notoriety = heat;
    const spawns: WorldEvent[] = [];
    run(w, "a", 10, {}, spawns, () => { if (p.jailT <= 0) p.notoriety = heat; }); // (a new cop every 4 s; heat held)
    const sp = spawns.filter((e) => e.t === "copSpawn");
    // (at 3 stars the cop who hops out of the car counts toward the 3)
    assert.equal(sp.length, cops, `${heat} heat: cops on you`);
    assert.equal(spawns.filter((e) => e.t === "copCar" && e.stage === "dispatch").length, cars, `${heat} heat: cars`);
  }
  // spawn distance + hidden: check right at the moment of spawning
  const { w, p } = quiet(5);
  w.addHeat(p, 65);
  let checked = 0;
  for (let i = 0; i < 60 * 6; i++) {
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick();
    for (const e of w.takeEvents()) if (e.t === "copSpawn") {
      const c = w.npc.npcs.get(e.npc)!;
      const d = Math.hypot(c.move.x - p.move.x, c.move.z - p.move.z);
      assert.ok(d >= 21.5 && d <= 42.5, `spawned ${d.toFixed(1)} m away`);
      checked++;
    }
  }
  assert.equal(checked, 2);
});

test("stand still with a star: a cop walks up, FREEZE, busted -> loot confiscated, heat 0, 30 s in a cell", () => {
  const w = new World({ seed: 8, npcs: 0, spawnLoot: false });
  const p = w.addPlayer("a", "A");
  w.movePlayer(p, 0, -20, 0);
  const watch = w.placeItem("rolecks_watch", 0, 0.2, -19.4);
  const lint = w.placeItem("pocket_lint", 0.3, 0.2, -19.4);
  run(w, "a", 0.5);
  w.action("a", { a: "grab", item: lint }); run(w, "a", 0.3);
  w.action("a", { a: "grab", item: watch }); run(w, "a", 0.3);
  assert.ok(p.pockets.includes(lint) || p.hand === lint);
  w.addHeat(p, 40); // a crime right here
  const ev: WorldEvent[] = [];
  run(w, "a", 30, {}, ev);
  const b = ev.find((e) => e.t === "busted") as Extract<WorldEvent, { t: "busted" }>;
  assert.ok(b, "busted");
  assert.equal(b.count, 2);
  assert.ok(!w.items.has(watch) && !w.items.has(lint), "confiscated: gone for good");
  assert.ok(ev.some((e) => e.t === "npcSay" && /FREEZE|STOP|Hands/.test(e.line)), "shouted first");
  assert.equal(p.notoriety, 0);
  assert.ok(p.jailT > 0 && p.jailT <= JAIL_TIME);
  const cell = w.arena.station!.cells[p.jailCell];
  assert.ok(inRect(cell.rect, p.move.x, p.move.z, 0.3), "in the cell");
  assert.equal(p.hand, ""); assert.deepEqual(p.pockets, ["", "", ""]);
  // every cop on you goes home
  run(w, "a", 1);
  assert.ok(w.police.cops().every((c) => c.state === "leave"));
});

test("jail: you can't get out of the cell by walking, can't act, nobody can punch you; serve 30 s -> front door, clean", () => {
  const { w, p } = quiet();
  const q = w.addPlayer("b", "B");
  w.police.bust(p, "test", false);
  const cell = w.arena.station!.cells[p.jailCell];
  // walk into the bars / walls for a while
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) run(w, "a", 1.2, { mz: 1, yaw, sprint: true, jump: true });
  assert.ok(inRect(cell.rect, p.move.x, p.move.z, 0.6), `still in the cell (${p.move.x.toFixed(1)}, ${p.move.z.toFixed(1)})`);
  // actions do nothing
  const it = w.placeItem("pocket_lint", p.move.x, 0.2, p.move.z + 0.4);
  w.action("a", { a: "grab", item: it }); run(w, "a", 0.3);
  assert.equal(w.items.get(it)!.mode, "free");
  // a friend outside the bars can't punch you through them
  w.movePlayer(q, cell.x, cell.z + 2.4, Math.PI);
  const ev: WorldEvent[] = [];
  w.action("b", { a: "punch", yaw: Math.PI, pitch: 0 }); run(w, "b", 0.2, {}, ev);
  assert.ok(!ev.some((e) => e.t === "knockdown"));
  const rel: WorldEvent[] = [];
  run(w, "a", JAIL_TIME, {}, rel);
  const r = rel.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && !r.breakout);
  assert.equal(p.jailT, 0);
  const door = w.arena.station!.door;
  assert.ok(Math.hypot(p.move.x - door.x, p.move.z - door.z) < 1.5, "outside the front door");
  assert.equal(p.notoriety, 0);
});

test("lock picking: every lock is different, deterministic, and solvable in time by perfect play", () => {
  const counts = new Set<number>(), patterns = new Set<string>(), orders = new Set<string>();
  for (let s = 1; s <= 300; s++) {
    const d = makeLock(s);
    counts.add(d.pins.length);
    d.pins.forEach((p) => patterns.add(p.pattern));
    orders.add(d.order.join(""));
    assert.deepEqual(makeLock(s), d, "same seed, same lock");
    for (const p of d.pins) { assert.ok(p.lo >= 0.05 && p.hi <= 0.98 && p.hi - p.lo > 0.1); }
    const presses = perfectPresses(s);
    assert.ok(presses[presses.length - 1].t < 20, `lock ${s} takes ${presses[presses.length - 1].t.toFixed(1)} s with perfect play`);
  }
  assert.deepEqual([...counts].sort(), [4, 5, 6]);
  assert.equal(patterns.size, 4);
  assert.ok(orders.size > 150, "binding orders vary");
});

test("lock picking: slips drop a pin, 3 quick slips bring the guard (locked out), tension runs out", () => {
  const seed = 77;
  const r: LockRun = newLockRun(seed);
  const good = perfectPresses(seed);
  // set the first pin properly
  assert.equal(lockPress(r, good[0].pin, good[0].t), "set");
  assert.equal(r.set, 1);
  // press a pin that isn't binding: slip, first pin drops again
  const wrong = (bindingPin(r) + 1) % r.def.pins.length;
  const res = lockPress(r, wrong, good[0].t + 0.3);
  assert.ok(res === "wrong" || res === "slip");
  assert.equal(r.set, 0);
  // two more slips in quick succession: the third one brings the guard
  const n = r.def.pins.length;
  assert.notEqual(lockPress(r, (bindingPin(r) + 1) % n, good[0].t + 0.4), "guard");
  assert.equal(lockPress(r, (bindingPin(r) + 1) % n, good[0].t + 0.5), "guard");
  assert.ok(r.lockUntil > good[0].t);
  assert.equal(lockPress(r, bindingPin(r), good[0].t + 1), "locked");
  // noise fades: 2 slips, wait 9 s, 1 more slip is not the guard
  const r2 = newLockRun(seed);
  const other = (bindingPin(r2) + 1) % r2.def.pins.length;
  lockPress(r2, other, 1); lockPress(r2, other, 1.1);
  assert.notEqual(lockPress(r2, other, 10), "guard");
  // tension: set one pin, then wait too long -> all pins drop
  const r3 = newLockRun(seed);
  lockPress(r3, good[0].pin, good[0].t);
  assert.equal(lockUpdate(r3, good[0].t + r3.def.tension + 0.1), "tension");
  assert.equal(r3.set, 0);
  assert.equal(LOCK.slipsToGuard, 3);
});

test("break out: pick the lock -> back alley, still wanted (1 star); presses from the future are rejected", () => {
  const { w, p } = quiet();
  w.police.bust(p, "test", false);
  const presses = perfectPresses(p.lockSeed, 0.6);
  // pressing ahead of the server's clock is ignored
  w.action("a", { a: "pick", pin: presses[0].pin, t: 25 });
  assert.equal(p.lock!.set, 0);
  const ev: WorldEvent[] = [];
  let i = 0;
  for (let k = 0; k < 60 * 25 && p.jailT > 0; k++) {
    const now = w.time - p.lockT0;
    while (i < presses.length && presses[i].t <= now) { w.action("a", { a: "pick", pin: presses[i].pin, t: presses[i].t }); i++; }
    w.pushInputs("a", [inp(p.lastSeq + 1)]); w.tick(); ev.push(...w.takeEvents());
  }
  const r = ev.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && r.breakout, "broke out");
  assert.ok(w.time - p.lockT0 < JAIL_TIME);
  const al = w.arena.station!.alley;
  assert.ok(Math.hypot(p.move.x - al.x, p.move.z - al.z) < 1.5, "in the back alley");
  assert.equal(starsOf(p.notoriety), 1);
  assert.equal(p.notoriety <= BREAKOUT_HEAT, true);
});

test("hiding: buildings block the view, crouching behind a parked car hides you, heat cools once they lose you", () => {
  const { w, p } = quiet();
  const car = w.arena.boxes.find((b) => b.kind === "car" && b.d > b.w)!; // long side along z
  // player crouched right behind the car, cop 12 m away on the other side
  w.movePlayer(p, car.x + car.w / 2 + 0.6, car.z, 0);
  p.notoriety = 40;
  const c = w.police.spawnCop(p, { x: car.x - 12, z: car.z })!;
  p.move.crouching = true;
  assert.equal(w.police.canSee(c, p), false, "crouched behind the car");
  p.move.crouching = false;
  assert.equal(w.police.canSee(c, p), true, "standing up");
  // a tower between you and the cop
  const tower = w.arena.boxes.find((b) => b.kind === "tower")!;
  w.movePlayer(p, tower.x + tower.w / 2 + 2, tower.z, 0);
  c.move.x = tower.x - tower.w / 2 - 2; c.move.z = tower.z;
  assert.equal(w.police.canSee(c, p), false);
});

test("lose them: commit a crime, slip away out of sight -> cops search the crime scene, heat cools, they give up", () => {
  const { w, p } = quiet(9);
  w.movePlayer(p, 0, -20, 0);
  w.addHeat(p, 65); // reported right here
  run(w, "a", 1);
  // sneak off behind a tower on the far side of downtown
  const tower = w.arena.boxes.find((b) => b.kind === "tower" && b.x > 0 && b.z > 0)!;
  w.movePlayer(p, tower.x + tower.w / 2 + 1.2, tower.z + 3, 0);
  const ev: WorldEvent[] = [];
  let searched = false;
  run(w, "a", 45, { crouch: true }, ev, () => { if (w.police.cops().some((c) => c.state === "search")) searched = true; });
  assert.ok(!ev.some((e) => e.t === "busted"), "got away");
  assert.ok(searched, "cops searched the crime scene");
  assert.ok(p.notoriety < 30, `heat cooled (${p.notoriety.toFixed(0)})`);
  run(w, "a", 40);
  assert.equal(w.police.cops().length, 0, "everyone gave up and left");
});

test("cops are faster than walking, slower than sprinting; a dodge at the right moment slips the grab", () => {
  assert.ok(COP_RUN > PLAYER.walkSpeed && COP_RUN < PLAYER.sprintSpeed);
  const { w, p } = quiet();
  p.notoriety = 40;
  const c = w.police.spawnCop(p, { x: 0, z: -17 }, true)!;
  let dodged = false;
  const ev: WorldEvent[] = [];
  for (let i = 0; i < 60 * 3 && !dodged; i++) {
    const dodge = c.state === "windup" && c.stateT < 0.12;
    w.pushInputs("a", [inp(p.lastSeq + 1, { dodge, mx: dodge ? 1 : 0 })]); w.tick(); ev.push(...w.takeEvents());
    if (dodge && p.move.dodgeT > 0) dodged = true;
  }
  run(w, "a", 0.3, {}, ev);
  assert.ok(dodged, "dodged during the grab");
  assert.ok(!ev.some((e) => e.t === "busted"), "slipped it");
});

test("punch a cop: they stagger (+heat), 3 punches = down for a few seconds, drops a donut", () => {
  const { w, p } = quiet();
  p.notoriety = 35;
  const c = w.police.spawnCop(p, { x: 0, z: -18.8 }, false)!;
  c.state = "search"; c.lostT = 0;
  const h0 = p.notoriety;
  const ev: WorldEvent[] = [];
  for (let k = 0; k < 3; k++) {
    c.move.x = 0; c.move.z = -18.8; c.state = "search"; c.stateT = 0;
    w.action("a", { a: "punch", yaw: 0, pitch: 0 });
    run(w, "a", 0.7, {}, ev);
  }
  assert.ok(ev.filter((e) => e.t === "npcHit").length === 3, "3 hits");
  assert.ok(p.notoriety >= h0 + 30, `heat ${h0} -> ${p.notoriety.toFixed(0)}`);
  assert.ok(ev.some((e) => e.t === "npcKo" && e.npc === c.id));
  assert.ok([...w.items.values()].some((i) => i.type === "donut"));
});

test("3 stars: the cop car stays on the roads, pulls up, drops off a cop; running you over = busted", () => {
  const { w, p } = quiet(4);
  p.notoriety = 100;
  const ev: WorldEvent[] = [];
  let offRoad = 0;
  run(w, "a", 25, {}, ev, () => {
    p.notoriety = 100; // keep them coming
    for (const c of w.police.cars) if (c.mode === "drive" && !w.arena.roads!.some((r) => inRect(r, c.x, c.z, 1))) offRoad++;
  });
  assert.equal(offRoad, 0, "cop car stayed on the roads");
  assert.ok(ev.some((e) => e.t === "copCar" && e.stage === "deploy"), "deployed");
  // run-over test: stand in the road in front of a moving cop car
  // (a car pulls over before reaching the bandit it's after, so: a wanted bandit standing in
  // the road in front of a car that's chasing somebody else further on)
  const { w: w2, p: p2 } = quiet(6);
  const other = w2.addPlayer("b", "B");
  w2.movePlayer(other, 30, -30, 0);
  other.notoriety = 95; p2.notoriety = 40;
  w2.movePlayer(p2, 0, -30, 0);
  w2.police.cars.push({ id: "copX", x: -20, z: -30, yaw: Math.PI / 2, v: 15, target: "b", mode: "drive", route: [{ x: 30, z: -30 }], replanT: 9, calmT: 0, lifeT: 0, deployed: false });
  const ev2: WorldEvent[] = [];
  run(w2, "a", 2, {}, ev2);
  const b = ev2.find((e) => e.t === "busted") as Extract<WorldEvent, { t: "busted" }>;
  assert.ok(b && b.car, "rammed = busted");
});

test("traffic stops for a cop car (sirens have right of way)", () => {
  const { w } = quiet();
  const car = w.traffic.cars.find((c) => Math.abs(Math.sin(2 * c.yaw)) < 0.01 && Math.abs(c.x) < 60 && Math.abs(c.z) < 60)!; // on a straight
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  w.police.cars.push({ id: "copY", x: car.x + fx * 6, z: car.z + fz * 6, yaw: car.yaw, v: 0, target: "", mode: "parked", route: [], replanT: 9, calmT: -999, lifeT: 0, deployed: true });
  const s0 = car.s;
  for (let i = 0; i < 60 * 2; i++) { w.tick(); w.takeEvents(); w.police.cars[0].calmT = -999; w.police.cars[0].mode = "parked"; }
  assert.ok(Math.abs(car.s - s0) < 4, `traffic car moved ${(car.s - s0).toFixed(1)} m`);
});

test("new round: all cops and cars gone, everyone out of jail", () => {
  const { w, p } = quiet();
  p.notoriety = 100;
  run(w, "a", 4);
  assert.ok(w.police.cops().length > 0);
  w.police.bust(p, "x", false);
  w.resetCity();
  assert.equal(w.police.cops().length, 0);
  assert.equal(w.police.cars.length, 0);
  assert.equal(p.jailT, 0);
  assert.equal(p.lock, null);
});

test("a laggy client (its lock clock far behind the server's) can still pick the lock", () => {
  const { w, p } = quiet();
  w.police.bust(p, "test", false);
  p.jailT = 120; // plenty of time
  run(w, "a", 20); // the server's lock clock is now ~20 s in; the client's lags ~15 s behind
  const presses = perfectPresses(p.lockSeed, 5);
  const ev: WorldEvent[] = [];
  for (const pr of presses) { w.action("a", { a: "pick", pin: pr.pin, t: pr.t }); run(w, "a", 0.05, {}, ev); }
  const r = ev.find((e) => e.t === "released") as Extract<WorldEvent, { t: "released" }>;
  assert.ok(r && r.breakout, "the server accepted the presses (no tension/noise timeouts on the server's clock)");
});
````

## FILE: shared/test/world.test.ts

````ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  World, buildTrashington, LOOT, lootDef, PLAYER, GIANT_TETHER, ITEM_MAX,
  type MoveInput, type ArenaLayout, type Box,
} from "../src/index.js";

const inp = (seq: number, p: Partial<MoveInput> = {}): MoveInput =>
  ({ seq, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false, ...p });

/** A flat empty world (no random loot) for precise rule tests. */
function flatWorld(): World {
  const arena: ArenaLayout = { halfSize: 40, boxes: [], spawns: [{ x: 0, z: 0, yaw: 0 }, { x: 2, z: 0, yaw: 0 }, { x: -2, z: 0, yaw: 0 }, { x: 4, z: 0, yaw: 0 }], lootSpawns: [{ x: 10, y: 0, z: 10, zone: "plaza" }] };
  return new World({ arena, spawnLoot: false });
}
function settle(w: World, seconds = 1) { for (let i = 0; i < seconds * 60; i++) w.tick(); }
function drive(w: World, id: string, steps: number, p: Partial<MoveInput>) {
  const pl = w.players.get(id)!;
  let seq = pl.lastSeq + 1;
  for (let i = 0; i < steps; i++) { w.pushInputs(id, [inp(seq++, p)]); w.tick(); }
}

test("catalog: at least 12 absurd items, all three sizes, all five rarities", () => {
  assert.ok(LOOT.length >= 12, `${LOOT.length} items`);
  for (const s of ["small", "big", "giant"]) assert.ok(LOOT.some((d) => d.size === s), s);
  for (const r of ["common", "uncommon", "rare", "epic", "legendary"]) assert.ok(LOOT.some((d) => d.rarity === r), r);
  for (const d of LOOT) assert.ok(d.valueMax >= d.valueMin && d.radius > 0 && d.weight >= 0 && d.weight < 1, d.type);
});

test("city: loot spawns and player spawns are not inside walls", () => {
  const city = buildTrashington();
  const inside = (x: number, y: number, z: number, r: number, b: Box) =>
    Math.abs(x - b.x) < b.w / 2 + r - 0.05 && Math.abs(z - b.z) < b.d / 2 + r - 0.05 && y + 0.05 < b.y + b.h / 2 && y + 1.2 > b.y - b.h / 2;
  for (const sp of city.lootSpawns!) {
    for (const b of city.boxes) {
      if (b.kind === "sidewalk" || b.kind === "curb") continue;
      assert.ok(!inside(sp.x, sp.y + 0.05, sp.z, 0.3, b), `loot spawn ${sp.zone} ${sp.x},${sp.y},${sp.z} inside ${b.kind} at ${b.x},${b.z}`);
    }
  }
  for (const sp of city.spawns) for (const b of city.boxes) {
    if (b.kind === "sidewalk" || b.kind === "curb") continue;
    assert.ok(!inside(sp.x, 0, sp.z, PLAYER.radius, b), `player spawn inside ${b.kind}`);
  }
  assert.equal(city.forts!.length, 4);
  assert.ok(city.lootSpawns!.length >= 50, `${city.lootSpawns!.length} loot spawn points`);
});

test("city: every loot spawn settles to rest without leaving the world", () => {
  const w = new World({ seed: 3 });
  for (const sp of w.arena.lootSpawns!) w.placeItem("crt_tv", sp.x, sp.y + 0.3, sp.z);
  settle(w, 4);
  for (const it of w.items.values()) {
    assert.ok(Math.abs(it.body.x) < w.arena.halfSize + 1 && Math.abs(it.body.z) < w.arena.halfSize + 1 && it.body.y > 0, `item ${it.id} at ${it.body.x},${it.body.y},${it.body.z}`);
  }
});

test("city: every dumpster is against a low roof you can climb onto", () => {
  const w = new World({ seed: 1, spawnLoot: false });
  const dumpsters = w.arena.boxes.filter((b) => b.kind === "dumpster");
  assert.ok(dumpsters.length >= 8);
  for (const d of dumpsters) {
    const p = w.addPlayer("a", "Climber");
    const m = p.move;
    // which wall is it against? find the low building/roof touching its short side
    const along = d.d > d.w ? "z" : "x"; // long axis runs along the alley
    const dirs = along === "z" ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    let wallDir: number[] | null = null;
    for (const [ux, uz] of dirs) {
      const px = d.x + ux * (d.w / 2 + 0.1), pz = d.z + uz * (d.d / 2 + 0.1);
      if (w.arena.boxes.some((b) => (b.kind === "building" || b.kind === "wall" || b.kind === "roof") && Math.abs(b.y + b.h / 2 - 3.2) < 0.01
        && Math.abs(px - b.x) <= b.w / 2 + 0.05 && Math.abs(pz - b.z) <= b.d / 2 + 0.05)) wallDir = [ux, uz];
    }
    assert.ok(wallDir, `dumpster at ${d.x},${d.z} is against a low roof`);
    const [ux, uz] = wallDir!;
    // stand on the alley side, facing the dumpster and the wall behind it
    m.x = d.x - ux * (d.w / 2 + 0.5); m.z = d.z - uz * (d.d / 2 + 0.5); m.y = 0; m.grounded = true;
    const yaw = Math.atan2(ux, uz);
    drive(w, "a", 3, { yaw }); // settle onto the sidewalk surface first
    let climbedRoof = false;
    for (let i = 0; i < 240 && !climbedRoof; i++) {
      drive(w, "a", 1, { yaw, mz: 1, jump: i % 2 === 0 }); // walking forward, tapping SPACE
      climbedRoof = m.grounded && Math.abs(m.y - 3.2) < 1e-6;
    }
    assert.ok(climbedRoof, `climbed dumpster at ${d.x},${d.z} onto the roof (y=${m.y.toFixed(2)})`);
    w.removePlayer("a");
  }
});

test("grab: big items go to hands and slow you down; heavy blocks sprint", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const tv = w.placeItem("crt_tv", 0, 0, 1.5);
  settle(w, 1);
  w.action("a", { a: "grab", item: tv });
  assert.equal(p.hand, tv);
  assert.equal(w.items.get(tv)!.mode, "held");
  assert.ok(p.move.carryHeavy && p.move.handsFull && p.move.carryMul < 1);
  drive(w, "a", 90, { mz: 1, sprint: true });
  const sp = Math.hypot(p.move.vx, p.move.vz);
  assert.ok(Math.abs(sp - PLAYER.walkSpeed * lootDef("crt_tv").weight * 0 - PLAYER.walkSpeed * (1 - lootDef("crt_tv").weight)) < 1e-6, `heavy carry speed ${sp}`);
});

test("grab: small items fill 3 pockets, then hands, then refuse", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const ids = [0, 1, 2, 3, 4].map((i) => w.placeItem("rubber_chicken", -0.4 + i * 0.2, 0, 1.2));
  settle(w, 1);
  for (const id of ids) { w.action("a", { a: "grab", item: id }); settle(w, 0.25); }
  assert.deepEqual(p.pockets, ids.slice(0, 3));
  assert.equal(p.hand, ids[3]);
  assert.equal(w.items.get(ids[4])!.mode, "free");
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "whiff" && e.reason === "full"));
  assert.equal(p.move.carryMul, 1, "small items don't slow you");
});

test("grab: too far away or behind you = whiff", () => {
  const w = flatWorld();
  w.addPlayer("a", "A");
  const far = w.placeItem("traffic_cone", 0, 0, 6);
  const behind = w.placeItem("traffic_cone", 0, 0, -1.8);
  settle(w, 1);
  w.action("a", { a: "grab", item: far });
  settle(w, 0.3);
  w.action("a", { a: "grab", item: behind });
  const ev = w.takeEvents().filter((e) => e.t === "whiff");
  assert.equal(ev.length, 2);
  assert.equal(w.players.get("a")!.hand, "");
});

test("grab race: two players grab the same item on the same tick, first wins, second whiffs", () => {
  const w = flatWorld();
  w.addPlayer("a", "A"); w.addPlayer("b", "B");
  const pa = w.players.get("a")!, pb = w.players.get("b")!;
  pa.move.x = -0.8; pb.move.x = 0.8;
  const it = w.placeItem("mystery_suitcase", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  w.action("b", { a: "grab", item: it });
  assert.equal(pa.hand, it);
  assert.equal(pb.hand, "");
  assert.ok(w.takeEvents().some((e) => e.t === "whiff" && e.p === "b" && e.reason === "taken"));
});

test("drop puts the item in front of you and it lands", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const it = w.placeItem("traffic_cone", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  settle(w, 0.3);
  w.action("a", { a: "drop" });
  assert.equal(p.hand, "");
  assert.equal(p.move.carryMul, 1);
  settle(w, 2);
  const b = w.items.get(it)!.body;
  assert.ok(b.resting && b.z > 0.5 && Math.abs(b.y - lootDef("traffic_cone").radius) < 0.01, `landed at ${b.x},${b.y},${b.z}`);
});

test("throw: charge controls distance; pocket items can be thrown too", () => {
  const dist = (charge: number) => {
    const w = flatWorld();
    w.addPlayer("a", "A");
    const it = w.placeItem("traffic_cone", 0, 0, 1.2);
    settle(w, 1);
    w.action("a", { a: "grab", item: it });
    settle(w, 0.3);
    w.action("a", { a: "throw", charge, yaw: 0, pitch: -0.2 });
    settle(w, 4);
    return w.items.get(it)!.body.z;
  };
  const weak = dist(0), strong = dist(1);
  assert.ok(strong > weak * 2 && strong > 10, `weak ${weak.toFixed(1)} m, strong ${strong.toFixed(1)} m`);
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const ch = w.placeItem("rubber_chicken", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch });
  settle(w, 0.3);
  assert.equal(p.pockets[0], ch);
  w.action("a", { a: "throw", charge: 0.5, yaw: 0, pitch: 0 });
  assert.equal(p.pockets[0], "");
  assert.equal(w.items.get(ch)!.mode, "free");
});

test("thrown item bonks another player (shove + event), not the thrower", () => {
  const w = flatWorld();
  w.addPlayer("a", "A"); w.addPlayer("b", "B");
  const pb = w.players.get("b")!;
  pb.move.x = 0; pb.move.z = 6;
  const it = w.placeItem("traffic_cone", 0, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: it });
  settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0.05 });
  let bonked = false;
  for (let i = 0; i < 90 && !bonked; i++) { w.tick(); bonked = w.takeEvents().some((e) => e.t === "bonk" && e.p === "b" && e.by === "a"); }
  assert.ok(bonked, "B got bonked by A's cone");
});

test("giant items: one player drags slowly, two carry together, pulling apart makes it tumble", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const duck = w.placeItem("rubber_duck", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: duck });
  assert.equal(w.items.get(duck)!.holder, "a");
  assert.ok(Math.abs(a.move.carryMul - 0.3) < 1e-9, "dragging alone is very slow");
  settle(w, 0.3);
  w.action("b", { a: "grab", item: duck });
  const it = w.items.get(duck)!;
  assert.equal(it.holder2, "b");
  assert.ok(Math.abs(a.move.carryMul - 0.65) < 1e-9 && Math.abs(b.move.carryMul - 0.65) < 1e-9, "two carriers move faster");
  // walk apart sideways until the tether breaks
  let tumbled = false;
  for (let i = 0; i < 240 && !tumbled; i++) {
    w.pushInputs("a", [inp(a.lastSeq + 1, { mx: -1 })]);
    w.pushInputs("b", [inp(b.lastSeq + 1, { mx: 1 })]);
    w.tick();
    tumbled = w.takeEvents().some((e) => e.t === "tumble");
  }
  assert.ok(tumbled, "pulled apart = tumble");
  assert.equal(it.mode, "free");
  assert.equal(a.hand, ""); assert.equal(b.hand, "");
  assert.ok(Math.hypot(a.move.x - b.move.x, a.move.z - b.move.z) > GIANT_TETHER - 0.2);
});

test("giant: can't be thrown; one carrier letting go leaves the other dragging", () => {
  const w = flatWorld();
  const a = w.addPlayer("a", "A"), b = w.addPlayer("b", "B");
  a.move.x = -0.9; b.move.x = 0.9;
  const arc = w.placeItem("arcade_machine", 0, 0, 1.6);
  settle(w, 1);
  w.action("a", { a: "grab", item: arc }); settle(w, 0.3);
  w.action("b", { a: "grab", item: arc }); settle(w, 0.3);
  w.action("a", { a: "throw", charge: 1, yaw: 0, pitch: 0 });
  assert.equal(w.items.get(arc)!.mode, "held");
  settle(w, 0.3);
  w.action("a", { a: "drop" });
  const it = w.items.get(arc)!;
  assert.equal(it.holder, "b"); assert.equal(it.holder2, "");
  assert.equal(a.hand, "");
  assert.ok(Math.abs(b.move.carryMul - 0.3) < 1e-9);
});

test("disconnect / leave drops everything so it can be stolen", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "A");
  const tv = w.placeItem("crt_tv", 0, 0, 1.4);
  const ch = w.placeItem("rubber_chicken", 0.5, 0, 1.2);
  settle(w, 1);
  w.action("a", { a: "grab", item: ch }); settle(w, 0.3);
  w.action("a", { a: "grab", item: tv }); settle(w, 0.3);
  w.setConnected("a", false);
  assert.equal(p.hand, ""); assert.deepEqual(p.pockets, ["", "", ""]);
  assert.equal(w.items.get(tv)!.mode, "free"); assert.equal(w.items.get(ch)!.mode, "free");
  settle(w, 3);
  assert.ok(w.items.get(tv)!.body.resting && w.items.get(ch)!.body.resting, "dropped loot settles");
  w.removePlayer("a");
  assert.equal(w.players.size, 0);
});

test("items never end up inside walls after lots of random throwing (fuzz)", () => {
  const w = new World({ seed: 9 });
  const p = w.addPlayer("a", "Thrower");
  const types = LOOT.filter((d) => d.size !== "giant").map((d) => d.type);
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 120; k++) {
    const id = w.placeItem(types[k % types.length], p.move.x, 1.2, p.move.z + 0.9);
    const it = w.items.get(id)!;
    it.body.y = p.move.y + 1.2;
    w.action("a", { a: "grab", item: id });
    w.action("a", { a: "throw", charge: r(), yaw: r() * 6.28, pitch: r() * 1.4 - 0.9 });
    p.actionCd = 0;
    for (let i = 0; i < 10; i++) { w.pushInputs("a", [inp(p.lastSeq + 1, { yaw: r() * 6.28, mz: 1, sprint: true })]); w.tick(); }
  }
  settle(w, 6);
  for (const it of w.items.values()) {
    if (it.mode !== "free") continue;
    const def = lootDef(it.type);
    for (const b of w.arena.boxes) {
      const inX = Math.abs(it.body.x - b.x) < b.w / 2 - 0.02, inZ = Math.abs(it.body.z - b.z) < b.d / 2 - 0.02;
      const inY = Math.abs(it.body.y - b.y) < b.h / 2 - 0.02;
      assert.ok(!(inX && inY && inZ), `${it.type} stuck inside ${b.kind}`);
    }
    assert.ok(Math.abs(it.body.x) <= w.arena.halfSize + 2 && Math.abs(it.body.z) <= w.arena.halfSize + 2 && it.body.y >= def.radius - 0.01, `${it.type} in bounds`);
  }
});

test("the spawner never exceeds the item cap", () => {
  const w = new World({ seed: 5 });
  for (let i = 0; i < 300; i++) w.spawnOne();
  assert.ok(w.items.size <= ITEM_MAX, `${w.items.size} items`);
  settle(w, 30); // top-ups over time also respect the cap
  assert.ok(w.items.size <= ITEM_MAX);
});

test("spawning: fills the city, rare stuff shows up more in the plaza, respects caps", () => {
  const w = new World({ seed: 42 });
  assert.ok(w.items.size >= 28, `${w.items.size} items spawned`);
  let giants = 0;
  for (const it of w.items.values()) if (lootDef(it.type).size === "giant") giants++;
  assert.ok(giants <= 2);
  // statistical check over many worlds: plaza gets a higher share of rare+ than streets
  let plazaRare = 0, plazaN = 0, streetRare = 0, streetN = 0;
  for (let s = 0; s < 60; s++) {
    const ww = new World({ seed: 1000 + s });
    for (const it of ww.items.values()) {
      const near = ww.arena.lootSpawns!.reduce((best, sp) => (Math.hypot(sp.x - it.body.x, sp.z - it.body.z) < Math.hypot(best.x - it.body.x, best.z - it.body.z) ? sp : best));
      const rare = !["common", "uncommon"].includes(lootDef(it.type).rarity);
      if (near.zone === "plaza") { plazaN++; if (rare) plazaRare++; }
      if (near.zone === "street") { streetN++; if (rare) streetRare++; }
    }
  }
  assert.ok(plazaRare / plazaN > (streetRare / streetN) * 1.8, `plaza ${(plazaRare / plazaN).toFixed(2)} vs street ${(streetRare / streetN).toFixed(2)}`);
});

test("world is deterministic: same seed + same inputs = same result", () => {
  const run = () => {
    const w = new World({ seed: 77 });
    w.addPlayer("a", "A"); w.addPlayer("b", "B");
    for (let i = 0; i < 600; i++) {
      w.pushInputs("a", [inp(i, { mz: 1, yaw: i * 0.01, sprint: i % 90 < 40 })]);
      w.pushInputs("b", [inp(i, { mx: 1, yaw: -i * 0.02, jump: i % 50 === 0 })]);
      if (i % 60 === 30) { const near = [...w.items.values()][i % 20]; if (near) w.action("a", { a: "grab", item: near.id }); }
      if (i % 60 === 50) w.action("a", { a: "throw", charge: 0.7, yaw: 1, pitch: -0.1 });
      w.tick();
    }
    return JSON.stringify({ p: [...w.players.values()].map((p) => p.move), i: [...w.items.values()].map((i) => [i.id, i.body, i.mode]) });
  };
  assert.equal(run(), run());
});

test("pressing drop right after a grab isn't lost: it runs when the short cooldown ends", () => {
  const w = flatWorld();
  const p = w.addPlayer("a", "Quick");
  const id = w.placeItem("crt_tv", p.move.x, 0.4, p.move.z + 1);
  settle(w, 0.5);
  w.action("a", { a: "grab", item: id });
  assert.equal(p.hand, id);
  w.action("a", { a: "drop" }); // same instant: inside the cooldown
  assert.equal(p.hand, id, "not yet");
  settle(w, 0.3);
  assert.equal(p.hand, "", "the queued drop happened");
  // a third press during a cooldown with one already queued is refused, not stacked
  const id2 = w.placeItem("crt_tv", p.move.x, 0.4, p.move.z + 1);
  settle(w, 0.5);
  w.action("a", { a: "grab", item: id2 });
  w.action("a", { a: "drop" });
  w.action("a", { a: "grab", item: id2 });
  const ev = w.takeEvents();
  assert.ok(ev.some((e) => e.t === "whiff" && e.reason === "cooldown"));
});
````

## FILE: shared/tsconfig.json

````json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src", "test"]
}
````

## FILE: tests/drop-timeout.ts

````ts
// A player whose browser vanishes keeps their seat for 30 s, then is removed.
import { Client } from "@colyseus/sdk";
import { spawn } from "node:child_process";
import { ROOM_NAME } from "@bfb/shared";
const url = "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const a = await new Client(url).create(ROOM_NAME, { name: "Host" });
a.onMessage("*", () => {});
// Ghost joins from a separate process, then the process is killed (like closing a laptop).
const ghost = spawn("npx", ["tsx", "tests/ghost-client.ts", url, a.roomId], { stdio: "inherit" });
await new Promise((r) => ghost.on("exit", r));
await sleep(500);
const st: any = a.state;
const ghostP = [...st.players.values()].find((p: any) => p.name === "Ghost");
console.log(ghostP && ghostP.connected === false ? "ok - ghost seat held, shown as disconnected" : "FAIL - ghost not held: " + JSON.stringify(ghostP));
await sleep(31000);
const still = [...st.players.values()].some((p: any) => p.name === "Ghost");
console.log(!still ? "ok - ghost removed after the 30 s window" : "FAIL - ghost still present after 31 s");
console.log(st.players.size === 1 ? "ok - host still in room, match keeps running" : "FAIL");
await a.leave(true);
process.exit(0);
````

## FILE: tests/e2e-phase0.mjs

````js
// Phase 0 end-to-end test: real headless Chrome windows, real server, real rendering.
// Usage: start server (port 2567) + client (vite preview on 4173), then: node tests/e2e-phase0.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.CLIENT_URL ?? "http://localhost:4173";
const OUT = process.env.OUT_DIR ?? "test-output";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (cond, msg) => { results.push({ ok: !!cond, msg }); console.log(cond ? "  ok  " : " FAIL ", msg); };
// Distance covered from standstill with the Phase 1 acceleration (20 m/s^2) up to top speed vmax
const rampDist = (t, vmax, a = 20) => { const tr = vmax / a; return t < tr ? 0.5 * a * t * t : 0.5 * a * tr * tr + vmax * (t - tr); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

async function openPage(name, query = "?test=1") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.__audioCtxCount = 0;
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__audioCtxCount++; } };
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  // generous timeouts: with 3 other windows rendering the city on the CPU, a 4th page loads slowly
  await page.goto(BASE + "/" + query, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 240000 });
  page.label = name;
  return page;
}
const info = (p) => p.evaluate(() => window.__bfb.info());
const hideOverlays = (p) => p.evaluate(() => { document.getElementById("pause").classList.add("hidden"); });
const shot = async (p, file) => { await p.screenshot({ path: `${OUT}/${file}` }); };

try {
  console.log("\n# Title screen");
  const A = await openPage("A");
  await sleep(1500);
  await shot(A, "01-title.png");
  ok((await A.evaluate(() => window.__audioCtxCount)) === 0, "no audio starts before the player interacts (no autoplay)");
  await A.mouse.click(200, 600);
  await sleep(200);
  ok((await A.evaluate(() => window.__audioCtxCount)) === 1, "audio switches on after the first click");
  ok(await A.isVisible("#main-menu"), "main menu visible");

  console.log("\n# Settings persist");
  await A.click("#btn-settings");
  await A.locator('[data-setting="fov"]').fill("100");
  await A.locator('[data-setting="showFps"]').check();
  await shot(A, "06-settings.png");
  await A.click("#btn-settings-close");
  await A.reload({ waitUntil: "domcontentloaded" });
  await A.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 90000 });
  await A.click("#btn-settings");
  ok((await A.locator('[data-setting="fov"]').inputValue()) === "100", "FOV setting remembered after reload");
  ok(await A.locator('[data-setting="showFps"]').isChecked(), "checkbox setting remembered after reload");
  await A.click("#btn-settings-close");

  console.log("\n# Solo mode");
  await A.click("#btn-solo");
  await A.waitForFunction(() => window.__bfb.info().screen === "playing");
  let i = await info(A);
  ok(i.mode === "solo", "solo mode starts without a server");
  await A.click("#btn-resume");
  await sleep(1800);
  if (await A.isVisible("#pause")) { await A.click("#btn-resume"); await sleep(1800); }
  ok(!(await A.isVisible("#pause")), "clicking PLAY enters the game (mouse captured, or drag-to-look fallback)");
  // Headless Chrome throttles frames to ~1/s while the mouse is captured, so from here on the
  // test releases the mouse and uses a test-only input mode that behaves as if it were captured.
  await A.evaluate(() => document.exitPointerLock());
  await sleep(300);
  await A.evaluate(() => window.__bfb.testInput(true));
  await sleep(1000); // let shaders finish compiling (software rendering in CI is slow)
  i = await info(A);
  const start = i.pos, st0 = i.stats.moveSteps;
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1, sprint: true }));
  // (wait for ~0.7 s of game time rather than wall time: the first seconds can be slow on the test machine)
  await A.waitForFunction((n) => window.__bfb.info().stats.moveSteps >= n, st0 + 40, { timeout: 90000, polling: 250 }).catch(() => {});
  i = await info(A);
  await A.evaluate(() => window.__bfb.setAxes(null));
  const soloSteps = i.stats.moveSteps - st0, soloMoved = i.pos.z - start.z, soloExp = rampDist(soloSteps / 60, 7.8);
  console.log(`   [diag] solo fps ${i.fps}, lost to stalls ${i.stats.droppedMs.toFixed(0)}ms total`);
  ok(soloMoved > 0.3 && Math.abs(soloMoved - soloExp) < 0.6, `solo: sprinted ${soloMoved.toFixed(2)}m over ${soloSteps} sim steps (expected ~${soloExp.toFixed(2)}m)`);
  // ---- Phase 1 moves (solo) ----
  console.log("\n# Phase 1 moves");
  const mv = () => A.evaluate(() => window.__bfb.move());
  const axes = (a) => A.evaluate((x) => window.__bfb.setAxes(x), a);
  const waitMove = (fnSrc, ms = 20000) => A.waitForFunction(new Function("const m = window.__bfb.move(); return " + fnSrc), null, { timeout: ms }).then(() => true, () => false);
  const hide = () => A.evaluate(() => { document.getElementById("pause").classList.add("hidden"); });
  const camOk = async (what) => ok(await A.evaluate(() => { const c = window.__bfb.scene().activeCamera; return [c.position.x, c.position.y, c.position.z, c.rotation.x, c.rotation.y, c.rotation.z, c.fov].every(Number.isFinite); }), `camera still valid after ${what}`);

  const LM0 = await A.evaluate(() => window.__bfb.landmarks());
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM0.runway);
  await axes(null); await sleep(600); await hide();
  await shot(A, "10-hands-idle.png");

  // Sprint -> stamina drains, HUD bar shows
  await axes({ mx: 0, mz: 1, sprint: true });
  ok(await waitMove("m.stamina < 0.8"), "sprinting drains stamina");
  ok(await A.evaluate(() => !document.getElementById("stamina").classList.contains("full")), "stamina bar appears while draining");
  await shot(A, "11-hands-sprint.png");
  // Slide (teleport resets stamina; sprint up to speed, then press C)
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z - 4, l.yaw), LM0.runway);
  await axes({ mx: 0, mz: 1, sprint: true });
  ok(await waitMove("Math.hypot(m.vx, m.vz) > 6.5", 8000), "reached sprint speed");
  await axes({ mx: 0, mz: 1, sprint: true, crouch: true });
  ok(await waitMove("m.slideT > 0", 8000), "sprint + C starts a belly slide");
  await shot(A, "12-hands-slide.png");
  await camOk("sprint + slide");
  await axes(null);
  ok(await waitMove("m.slideT === 0 && Math.hypot(m.vx, m.vz) < 0.1"), "slide ends and you come to a stop");

  // Dodge
  await axes({ mx: 1, mz: 0, dodge: true });
  ok(await waitMove("m.dodgeT > 0 || m.dodgeCd > 0", 8000), "Q dodge fires");
  await axes(null);
  ok(await A.evaluate(() => !document.getElementById("dodge-pip").classList.contains("ready")), "dodge pip shows cooldown");

  // Mantle the 1.4 m ledge in the construction yard
  const LM = await A.evaluate(() => window.__bfb.landmarks());
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM.ledge14);
  await axes({ mx: 0, mz: 1 });
  await waitMove(`m.z > ${LM.ledge14.frontZ - 0.5}`, 8000);
  await axes({ mx: 0, mz: 0, jump: true }); // just SPACE while facing the ledge
  ok(await waitMove("m.mantleT > 0", 8000), "SPACE facing a ledge starts a climb");
  await shot(A, "13-hands-mantle.png");
  await camOk("climb");
  await axes(null);
  ok(await waitMove("Math.abs(m.y - 1.4) < 0.01 && m.grounded"), "climbed onto the 1.4 m ledge");

  // Crawl tunnel (runs along +x, roof from roofStartX to roofEndX): standing is blocked, crouching gets through
  await A.evaluate((l) => window.__bfb.teleport(l.x, l.z, l.yaw), LM.tunnelEntrance);
  await axes({ mx: 0, mz: 1 });
  await sleep(2500);
  const blockedX = (await mv()).x;
  ok(blockedX < LM.tunnelEntrance.roofStartX - 0.2, `standing player can't enter the crawl tunnel (x=${blockedX.toFixed(2)})`);
  await axes({ mx: 0, mz: 1, crouch: true });
  ok(await waitMove(`m.x > ${LM.tunnelEntrance.roofStartX + 1} && m.crouching`, 30000), "crouching player crawls into the tunnel");
  await axes({ mx: 0, mz: 0, crouch: false }); // let go of C while under the roof
  await sleep(600);
  const tun = await mv();
  ok(tun.crouching && tun.x < LM.tunnelEntrance.roofEndX - 0.2, `can't stand up under the tunnel roof (x=${tun.x.toFixed(2)}, crouching=${tun.crouching})`);
  await A.evaluate(() => window.__bfb.setPitch(0.1));
  await shot(A, "14-crouch-tunnel.png");
  await camOk("crouch");

  // ---- Phase 2 loot (solo, real keys + mouse) ----
  console.log("\n# Phase 2 loot (solo)");
  const items = await A.evaluate(() => window.__bfb.items());
  ok(items.length >= 28, `the city spawned ${items.length} loot items`);
  ok(new Set(items.map((x) => x.type)).size >= 6, `variety: ${new Set(items.map((x) => x.type)).size} different item types`);
  const inv = () => A.evaluate(() => window.__bfb.serverInventory());
  const waitInv = (src, ms = 15000) => A.waitForFunction(new Function("const v = window.__bfb.serverInventory(); return " + src), null, { timeout: ms }).then(() => true, () => false);
  // (wait for THAT item when we know its id: a slow frame can still show the previous target)
  const lookAt = async (type, id = null) => A.waitForFunction(([t, id]) => { const l = window.__bfb.lookTarget(); return l?.type === t && (!id || l.id === id); }, [type, id], { timeout: 15000 }).then(() => true, () => false);
  // each check gets its own clean patch of plaza (so a TV dropped earlier can't steal the crosshair)
  const spawnAhead = async (type, x = -16, z = -8) => {
    // keep wandering pedestrians out of the way of these precise loot checks
    await A.evaluate(([x, z]) => { window.__bfb.teleport(x, z, 0); window.__bfb.clearNpcs(x, z + 8, 16); }, [x, z]);
    await sleep(500);
    return A.evaluate(([t, x, z]) => { const id = window.__bfb.spawnItem(t, x, z + 1.6); window.__bfb.setPitch(Math.atan2(1.55 - 0.2, 1.6)); return id; }, [type, x, z]);
  };
  await axes(null);
  await spawnAhead("crt_tv");
  ok(await lookAt("crt_tv"), "looking at a TV shows the grab prompt");
  ok(await A.isVisible("#prompt") && /CRT TV/i.test(await A.textContent("#prompt")) && /\$\d+/.test(await A.textContent("#prompt")), `prompt text: "${(await A.textContent("#prompt")).slice(0, 60)}..."`);
  await hide();
  await shot(A, "15-look-prompt.png");
  await A.keyboard.press("e");
  ok(await waitInv("v.hand !== ''"), "E grabs the TV into your hands");
  const inv1 = await inv();
  ok(inv1.carryMul < 1, `carrying the TV slows you down (speed x${inv1.carryMul.toFixed(2)})`);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await sleep(600);
  await shot(A, "16-holding-tv.png");
  await A.keyboard.press("g");
  ok(await waitInv("v.hand === ''"), "G drops it");
  await sleep(400);

  // pockets: three small items go in pockets, a fourth goes to your hands
  for (let k = 0; k < 4; k++) {
    const cid = await spawnAhead("rubber_chicken", -13);
    await lookAt("rubber_chicken", cid);
    await A.keyboard.press("e");
    // wait until that grab has landed (a busy test machine can take a while)
    await A.waitForFunction((n) => { const v = window.__bfb.serverInventory(); return v && [v.hand, ...v.pockets].filter(Boolean).length >= n; }, k + 1, { timeout: 10000 }).catch(() => {});
    await sleep(250);
  }
  const inv2 = await inv();
  const why = inv2.hand ? "" : ` | look=${JSON.stringify(await A.evaluate(() => window.__bfb.lookTarget()))} flash="${await A.evaluate(() => document.getElementById("flash")?.textContent ?? "")}" items near=${JSON.stringify(await A.evaluate(() => window.__bfb.items().filter((i) => Math.hypot(i.x + 13, i.z + 6.4) < 3).map((i) => i.type + ":" + i.mode)))}`;
  ok(inv2.pockets.every((x) => x) && inv2.hand, `3 pockets filled + 4th chicken in hands (${JSON.stringify(inv2.pockets.map(Boolean))}, hand=${!!inv2.hand})${why}`);
  ok(/Chicken/.test(await A.textContent("#slot-0")), "pocket HUD shows what you carry");
  await A.mouse.click(640, 360, { button: "right" });
  ok(await waitInv("v.sel === 1", 5000), "right click cycles the selected pocket");

  // throw from hands: hold left mouse ~1 s, release
  const thrownId = inv2.hand;
  await A.evaluate(() => window.__bfb.clearNpcs(-16, 0, 16));
  await A.evaluate(() => window.__bfb.setPitch(-0.25));
  await A.mouse.down();
  await sleep(1000);
  ok(await A.isVisible("#charge"), "charge ring shows while winding up");
  await A.mouse.up();
  ok(await waitInv("v.hand === ''", 5000), "releasing throws the item");
  const landed = await A.waitForFunction((id) => { const it = window.__bfb.items().find((x) => x.id === id); return it && it.mode === "free" && it.resting ? it : null; }, thrownId, { timeout: 20000 }).then((h) => h.jsonValue(), () => null);
  const me = await mv();
  ok(landed && Math.hypot(landed.x - me.x, landed.z - me.z) > 5, `thrown chicken landed ${landed ? Math.hypot(landed.x - me.x, landed.z - me.z).toFixed(1) : "?"} m away`);
  // empty pockets, then drag a giant duck alone
  for (let k = 0; k < 4; k++) { await A.keyboard.press("g"); await sleep(350); }
  ok(await waitInv("v.hand === '' && v.pockets.every((x) => !x)", 8000), "G empties pockets one by one");
  await spawnAhead("rubber_duck", -8, 5);
  ok(await lookAt("rubber_duck"), "looking at the giant duck");
  ok(/NEEDS 2/.test(await A.textContent("#prompt")), "giant items say they need 2 players");
  await A.keyboard.press("e");
  ok(await waitInv("Math.abs(v.carryMul - 0.3) < 0.01"), "dragging a giant item alone is very slow (x0.3)");
  await hide();
  await A.evaluate(() => window.__bfb.setPitch(0.3));
  await sleep(600);
  await shot(A, "17-dragging-duck.png");
  await A.keyboard.press("g");
  await sleep(400);
  await camOk("loot");

  // ---- Phase 2.5 pedestrians + punching (solo, real mouse clicks) ----
  console.log("\n# Phase 2.5 pedestrians (solo)");
  // (tests above cleared a few people out of the way; the crowd refills every 5 s)
  // (the everyday crowd only: cashiers, cops, raccoons and big shots + their entourage have their own jobs)
  const CROWD = ["tourist", "businessman", "influencer", "jogger", "gym_bro", "mall_cop", "mime", "pigeon_lady"];
  await A.waitForFunction((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)).length === 20, CROWD, { timeout: 10000 }).catch(() => {});
  const npcs0 = await A.evaluate((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)), CROWD);
  ok(npcs0.length === 20, `the streets have ${npcs0.length} pedestrians`);
  ok((await A.evaluate(() => window.__bfb.npcs().filter((n) => n.kind === "cashier").length)) === 4, "a cashier in each of the 4 shops");
  ok(new Set(npcs0.map((n) => n.kind)).size >= 6, `mix of types: ${[...new Set(npcs0.map((n) => n.kind))].join(", ")}`);
  await sleep(2500);
  const npcs1 = await A.evaluate((C) => window.__bfb.npcs().filter((n) => C.includes(n.kind)), CROWD);
  const walked = npcs1.filter((n) => { const o = npcs0.find((x) => x.id === n.id); return o && Math.hypot(n.x - o.x, n.z - o.z) > 0.5; }).length;
  ok(walked >= 12, `${walked}/20 pedestrians walked around in 2.5 s`);
  const ns = await A.evaluate(() => window.__bfb.npcStats());
  ok(ns.total >= 24 && ns.visible < ns.total && ns.visible > 0, `${ns.total} people exist; ones beyond 60 m are culled (${ns.visible} drawn from here)`);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.filter((m) => m.name === "beam").length === 0), "no sky beams any more");
  // (away from the loot left lying around by the tests above, so nothing else is under the crosshair)
  await A.evaluate(() => { window.__bfb.teleport(-8, -8, 0); });
  await sleep(400);
  await A.evaluate(() => { window.__bfb.spawnItem("golden_spork", -7.2, -5.5); window.__bfb.setPitch(0.3); });
  await sleep(1500);
  ok(await A.evaluate(() => window.__bfb.scene().meshes.some((m) => m.name === "sparkle" && m.isEnabled())), "rare loot twinkles with a sparkle");

  // punch a tourist placed right in front of us
  const tId = await A.evaluate(() => window.__bfb.placeNpc("tourist", -8, -6.7, Math.PI));
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const sawTarget = await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "tourist", null, { timeout: 10000 }).then(() => true, () => false);
  ok(sawTarget, "facing a tourist with empty hands = punch target");
  ok(/Bonk/.test(await A.textContent("#prompt")) && /Tourist/.test(await A.textContent("#prompt")), `prompt: "${(await A.textContent("#prompt")).slice(0, 50)}"`);
  const itemsBefore = new Set((await A.evaluate(() => window.__bfb.items())).map((x) => x.id));
  await A.mouse.click(640, 360);
  const hitState = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return n && n.robbed ? n.state : null; }, tId, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
  ok(hitState, `left click punched the tourist (now "${hitState}")`);
  await sleep(250);
  await hide();
  await shot(A, "18-bonk-tourist.png");
  const dropped = (await A.evaluate(() => window.__bfb.items())).filter((x) => !itemsBefore.has(x.id) && Math.hypot(x.x + 8, x.z + 6.7) < 5);
  ok(dropped.length >= 1, `the tourist dropped loot: ${dropped.map((x) => x.type).join(", ")}`);
  ok((await A.evaluate(() => window.__bfb.heat())) > 0, `punching raises your heat (${await A.evaluate(() => window.__bfb.heat())})`);
  ok(await A.isVisible("#heat"), "heat meter appears on the HUD");
  await sleep(1500);
  await shot(A, "19-tourist-flees.png");

  // a gym bro fights back: stand still and lose the slap fight (2 hits = knocked down)
  await A.evaluate(() => { window.__bfb.teleport(-16, 5, 0); });
  await sleep(500);
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", -16, 6.4); window.__bfb.setPitch(Math.atan2(1.35, 1.4)); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "chicken in pocket before the fight");
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  const gId = await A.evaluate(() => window.__bfb.placeNpc("gym_bro", -16, 6.6, Math.PI));
  await A.waitForFunction(() => window.__bfb.punchTarget()?.kind === "gym_bro", null, { timeout: 10000 }).catch(() => {});
  ok(/FIGHTS BACK/.test(await A.textContent("#prompt")), "prompt warns that the gym bro fights back");
  await A.mouse.click(640, 360);
  const fought = await A.waitForFunction((id) => { const n = window.__bfb.npcs().find((x) => x.id === id); return n && (n.state === "chase" || n.state === "windup"); }, gId, { timeout: 10000 }).then(() => true, () => false);
  ok(fought, "the gym bro comes at you");
  const knocked = await A.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: 30000 }).then(() => true, () => false);
  ok(knocked, "two slaps from the gym bro = you're knocked down");
  const [kPose, gState] = await A.evaluate((id) => [window.__bfb.info().hud.pose, window.__bfb.npcs().find((x) => x.id === id)?.state], gId);
  ok(kPose === "knocked", `HUD pose says knocked (${kPose})`);
  ok(gState === "gloat", `the gym bro gloats (${gState})`);
  await hide();
  await shot(A, "20-knocked-down.png");
  ok(await waitInv("v.hand === '' && v.pockets.every((x) => !x)", 5000), "getting knocked down drops everything you carried");
  const up = await A.waitForFunction(() => window.__bfb.move().knockT <= 0, null, { timeout: 15000 }).then(() => true, () => false);
  ok(up, "you get back up");
  await camOk("knockdown");

  // ---- Phase 3.5: the big city (solo, real keys + mouse) ----
  console.log("\n# Phase 3.5 big city (solo)");
  const defs = await A.evaluate(() => window.__bfb.propDefs());
  const faceProp = (d, gap) => A.evaluate(([d, gap, r]) => { window.__bfb.teleport(d.x + Math.sin(d.yaw) * (r + gap), d.z + Math.cos(d.yaw) * (r + gap), d.yaw + Math.PI); window.__bfb.setPitch(0.35); }, [d, gap, { dumpster: 1.0, bin: 0.35, phone: 0.55, vending: 0.6, till: 0.3 }[d.kind] ?? 0.5]);
  // (the punching tests above made us wanted: cops crossing the road would make traffic brake)
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); });
  await sleep(1500);
  const cars0 = await A.evaluate(() => window.__bfb.cars());
  ok(cars0.length === 14, `${cars0.length} cars on the roads`);
  await sleep(2000);
  const cars1 = await A.evaluate(() => window.__bfb.cars());
  ok(cars1.filter((c, i) => Math.hypot(c.x - cars0[i].x, c.z - cars0[i].z) > 1).length >= 9, "traffic is moving");
  // search a dumpster with E
  const dump = defs.find((d) => d.kind === "dumpster");
  await faceProp(dump, 1.0);
  const useOk = await A.waitForFunction((id) => window.__bfb.useTarget()?.id === id, dump.id, { timeout: 15000 }).then(() => true, () => false);
  ok(useOk && /Search/.test(await A.textContent("#prompt")), `dumpster prompt: "${(await A.textContent("#prompt")).slice(0, 40)}"`);
  const before = (await A.evaluate(() => window.__bfb.items())).length;
  await A.keyboard.press("e");
  ok(await A.waitForFunction((n) => window.__bfb.items().length >= n + 1, before, { timeout: 15000 }).then(() => true, () => false), "E on a dumpster: junk pops out");
  await sleep(400); await hide();
  await shot(A, "30-dumpster-search.png");
  // smash a phone booth
  const booth = defs.find((d) => d.kind === "phone");
  await faceProp(booth, 0.6);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await A.mouse.move(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.punchTarget()?.prop, null, { timeout: 15000 }).then(() => true, () => false) && /Smash/.test(await A.textContent("#prompt")), `phone booth prompt: "${(await A.textContent("#prompt")).slice(0, 40)}"`);
  await A.mouse.click(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "phone_handset"), null, { timeout: 15000 }).then(() => true, () => false), "punching a phone booth: the handset pops out");
  ok(await A.waitForFunction((id) => window.__bfb.props().find((p) => p.id === id)?.ready === false, booth.id, { timeout: 5000 }).then(() => true, () => false), "the booth stays broken for a while");
  // hold-up at a till: HOLD E for 3 s
  const till = defs.find((d) => d.kind === "till");
  await faceProp(till, 1.0);
  await A.evaluate(() => window.__bfb.setPitch(0.3));
  ok(await A.waitForFunction(() => window.__bfb.robTarget()?.kind === "till", null, { timeout: 15000 }).then(() => true, () => false) && /HOLD R/.test(await A.textContent("#prompt")), `till prompt: "${(await A.textContent("#prompt")).slice(0, 90)}"`);
  await hide();
  await shot(A, "31-shop-till.png");
  await A.keyboard.down("r");
  ok(await A.waitForFunction(() => window.__bfb.robT() > 0.3, null, { timeout: 15000 }).then(() => true, () => false), "holding E: hold-up in progress (progress ring)");
  const robbed = await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "cash_bundle"), null, { timeout: 30000 }).then(() => true, () => false);
  await A.keyboard.up("r");
  ok(robbed, "after 3 s: a bundle of cash");
  // get hit by a car: wiped out, respawn at the fort after 10 s
  await A.evaluate(() => window.__bfb.wipeout());
  ok(await A.waitForFunction(() => !document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 10000 }).then(() => true, () => false), "wiped out: countdown overlay");
  await sleep(500); await hide();
  await shot(A, "32-wiped-out.png");
  ok(await A.waitForFunction(() => window.__bfb.respawnT() === 0 && document.getElementById("wipeout").classList.contains("hidden"), null, { timeout: 40000 }).then(() => true, () => false), "respawned after 10 s");
  const home = await A.evaluate(() => { const m = window.__bfb.move(); return Math.hypot(m.x, m.z); });
  ok(home > 75, `back at the fort (${home.toFixed(0)} m from the centre)`);
  ok(await A.evaluate(() => !!document.querySelector('[data-setting="lowGraphics"]')), "performance mode setting exists");

  // ---- Phase 4: police + jail (solo) ----
  console.log("\n# Phase 4 police (solo)");
  // camera can never flip: look straight up and get knocked down
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.setPitch(-1.5); window.__bfb.wipeout(); });
  let worstPitch = 0;
  for (let i = 0; i < 12; i++) { const cp = await A.evaluate(() => window.__bfb.camPitch()); if (cp !== null) worstPitch = Math.min(worstPitch, cp); await sleep(120); }
  ok(worstPitch > -Math.PI / 2, `camera never tips past straight up when knocked over looking up (pitch ${worstPitch.toFixed(2)})`);
  await A.waitForFunction(() => window.__bfb.respawnT() === 0, null, { timeout: 40000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setPitch(0));
  // 1 star: a cop comes for you
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.clearNpcs(-16, -8, 12); window.__bfb.setHeat(40); });
  ok(await A.waitForFunction(() => window.__bfb.stars() === 1, null, { timeout: 10000 }).then(() => true, () => false), "40 heat = 1 wanted star on the HUD");
  ok(await A.waitForFunction(() => window.__bfb.cops().length >= 1, null, { timeout: 15000 }).then(() => true, () => false), "a cop is dispatched");
  // stand still: busted
  const busted = await A.waitForFunction(() => window.__bfb.jail()?.jailT > 0, null, { timeout: 90000 }).then(() => true, () => false);
  ok(busted, "stood around: BUSTED");
  ok(await A.waitForFunction(() => window.__bfb.jail()?.open && !document.getElementById("jail").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false), "jail screen with the lock-picking game");
  const st = await A.evaluate(() => window.__bfb.station());
  const inCell = (m) => st.cells.some((c) => m.x >= c.rect.minX - 0.4 && m.x <= c.rect.maxX + 0.4 && m.z >= c.rect.minZ - 0.4 && m.z <= c.rect.maxZ + 0.4);
  await sleep(600);
  ok(inCell(await A.evaluate(() => window.__bfb.move())), "you're in a cell at the police station");
  ok((await A.evaluate(() => window.__bfb.heat())) === 0, "heat reset to 0");
  // can't walk: W does nothing; A/D choose pins
  const m0 = await A.evaluate(() => window.__bfb.move());
  await A.keyboard.down("w"); await sleep(800); await A.keyboard.up("w");
  const m1 = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.2, "can't walk around while picking the lock");
  ok((await A.evaluate(() => window.__bfb.jail())).noise === 0, "trying to walk doesn't count as a lock-pick press (no noise)");
  // the mouse moves the pick cursor, the camera stays still (Blake: the camera swung around in jail)
  const yaw0 = await A.evaluate(() => window.__bfb.scene().activeCamera.rotation.y);
  const cur0 = await A.evaluate(() => window.__bfb.jail());
  await A.mouse.move(640, 360); await A.mouse.move(520, 330, { steps: 6 });
  await sleep(300);
  const cur1 = await A.evaluate(() => window.__bfb.jail());
  const yaw1 = await A.evaluate(() => window.__bfb.scene().activeCamera.rotation.y);
  ok(Math.abs(yaw1 - yaw0) < 0.01 && Math.hypot(cur1.cx - cur0.cx, cur1.cy - cur0.cy) > 20, "in jail the mouse moves the lock pick, not the camera");
  const sel0 = (await A.evaluate(() => window.__bfb.jail())).sel;
  await A.keyboard.press("d");
  ok((await A.evaluate(() => window.__bfb.jail())).sel !== sel0, "D moves the pick to the next pin");
  await sleep(300); await hide();
  await shot(A, "33-jail-lockpick.png");
  // pick it (perfect timing, through the real keys)
  // (slow headless frames make the auto-picker slow; give it time, the lock clock is separate)
  await A.evaluate(() => window.__bfb.setJailTime(90));
  const broke = await A.evaluate(() => window.__bfb.lockAutoPlay());
  const out = await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0, null, { timeout: 60000 }).then(() => true, () => false);
  ok(broke && out, "picked the lock: broke out");
  const mo = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(mo.x - st.alley.x, mo.z - st.alley.z) < 3, "broke out into the back alley");
  ok(await A.waitForFunction(() => window.__bfb.stars() === 1, null, { timeout: 5000 }).then(() => true, () => false), "still wanted after a jailbreak (1 star)");
  await sleep(300); await hide();
  await shot(A, "34-jailbreak.png");
  // serve the time instead: out the front door, clean
  await A.evaluate(() => window.__bfb.clearCops());
  await A.evaluate(() => window.__bfb.bust());
  await A.waitForFunction(() => window.__bfb.jail()?.jailT > 0, null, { timeout: 10000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setJailTime(1.2));
  ok(await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0 && !window.__bfb.jail()?.open, null, { timeout: 20000 }).then(() => true, () => false), "time served: released, jail screen gone");
  const md = await A.evaluate(() => window.__bfb.move());
  ok(Math.hypot(md.x - st.door.x, md.z - st.door.z) < 3 && (await A.evaluate(() => window.__bfb.heat())) === 0, "served: out the front door with 0 heat");
  // 3 stars: the cop car
  await A.evaluate(() => { window.__bfb.teleport(0, -40, Math.PI); window.__bfb.setHeat(100); });
  let carSeen = false;
  for (let i = 0; i < 80 && !carSeen; i++) { await A.evaluate(() => { if (window.__bfb.jail()?.jailT === 0) window.__bfb.setHeat(100); }); carSeen = (await A.evaluate(() => window.__bfb.copCars())).length > 0; if (!carSeen) await sleep(250); }
  ok(carSeen, "max heat: a cop car comes after you");
  ok((await A.evaluate(() => window.__bfb.stars())) === 3 || (await A.evaluate(() => window.__bfb.jail()?.jailT > 0)), "3 stars on the HUD");
  await sleep(1500); await hide();
  await shot(A, "35-three-stars.png");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); });
  await A.waitForFunction(() => window.__bfb.jail()?.jailT === 0 || window.__bfb.jail() === null, null, { timeout: 5000 }).catch(() => {});

  // ---- Phase 4.5: big shots ----
  console.log("\n# Phase 4.5 big shots (solo)");
  await A.evaluate(() => { window.__bfb.teleport(-16, -11, 0); window.__bfb.setPitch(0); window.__bfb.clearNpcs(-16, -3, 14); });
  const bsId = await A.evaluate(() => window.__bfb.spawnBigShot("millionaire"));
  ok(!!bsId, "a millionaire comes to town");
  ok(await A.waitForFunction(() => !!window.__bfb.bigShot() && !document.getElementById("bigshot").classList.contains("hidden"), null, { timeout: 15000 }).then(() => true, () => false), "HUD tracker: $$$ Millionaire, distance + arrow");
  // a millionaire standing right in front of you: punch = jackpot
  await A.evaluate(() => { window.__bfb.clearNpcs(-16, -3, 14); window.__bfb.placeNpc("millionaire", -16, -9.8, Math.PI); });
  await sleep(800);
  await A.mouse.move(640, 360);
  const heatBs0 = await A.evaluate(() => window.__bfb.heat());
  ok(await A.waitForFunction(() => /JACKPOT/.test(document.getElementById("prompt").textContent), null, { timeout: 10000 }).then(() => true, () => false), "prompt says JACKPOT (and big heat)");
  await A.mouse.click(640, 360);
  ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "gold_bar" || i.type === "diamond_ring"), null, { timeout: 15000 }).then(() => true, () => false), "punching the millionaire: gold bar / diamond ring pops out");
  ok((await A.evaluate(() => window.__bfb.heat())) - heatBs0 >= 25, "and that's a lot of heat");
  await sleep(300); await hide();
  await shot(A, "36-bigshot.png");
  await A.evaluate(() => { window.__bfb.clearCops(); window.__bfb.setHeat(0); window.__bfb.clearNpcs(-16, -8, 20); });

  // ---- Phase 3: the round loop (solo, real keys) ----
  console.log("\n# Phase 3 rounds (solo)");
  const M = () => A.evaluate(() => window.__bfb.match());
  const waitPhase = (ph, ms = 60000) => A.waitForFunction((x) => window.__bfb.match().phase === x, ph, { timeout: ms }).then(() => true, () => false);
  ok((await M()).phase === "lobby" && /LOBBY/.test(await A.textContent("#mh-time")), "starts in the lobby (free roam)");
  ok(/ENTER/.test(await A.textContent("#mh-sub")), `lobby hint: "${await A.textContent("#mh-sub")}"`);
  await A.keyboard.press("Enter");
  ok(await A.waitForFunction(() => window.__bfb.match().phase !== "lobby", null, { timeout: 10000 }).then(() => true, () => false), "ENTER starts the match (intro countdown)");
  ok(/ROUND 1 OF 3/.test(await A.textContent("#bb-title")), `banner: "${await A.textContent("#bb-title")}"`);
  ok((await M()).home.inside, "round start sends you home to your fort");
  ok(await waitPhase("scavenge", 30000), "intro -> scavenge");
  await A.evaluate(() => window.__bfb.noEvents());
  ok(/^[23]:\d\d$/.test(await A.textContent("#mh-time")), `round timer shows ${await A.textContent("#mh-time")}`);
  ok(await A.isVisible("#scores"), "scoreboard shows during the round");
  // bank a TV: drop it in the yard and wait 10 s
  const yardPos = await A.evaluate(() => { const m = window.__bfb.move(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  const fwd = { x: Math.sin(yardPos.yaw), z: Math.cos(yardPos.yaw) };
  await A.evaluate(([x, z]) => window.__bfb.spawnItem("crt_tv", x, z), [yardPos.x + fwd.x * 2, yardPos.z + fwd.z * 2]);
  const banked = await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "crt_tv" && i.lock === 100), null, { timeout: 60000 }).then(() => true, () => false);
  ok(banked, "loot resting in your yard locks in (banked) after 10 s");
  const bankNow = (await M()).scores[0].bank;
  ok(bankNow > 0 && /\+\d+/.test(await A.textContent("#scores")), `scoreboard shows the banked value (+${bankNow})`);
  await A.evaluate(() => window.__bfb.setPitch(0.35));
  await sleep(600);
  await hide();
  await shot(A, "24-banked-loot.png");
  // events: each one shows up
  for (const [kind, rx] of [["happyhour", /HAPPY HOUR/], ["truck", /GARBAGE TRUCK/], ["airdrop", /AIRDROP/], ["raccoons", /RACCOON/]]) {
    await A.evaluate((k) => window.__bfb.triggerEvent(k), kind);
    const seen = await A.waitForFunction((r) => new RegExp(r).test(document.getElementById("event-hud").textContent), rx.source, { timeout: 15000 }).then(() => true, () => false);
    ok(seen, `${kind}: event bar says "${await A.textContent("#event-hud")}"`);
    if (kind === "truck") {
      ok(await A.waitForFunction(() => window.__bfb.match().truckOn && window.__bfb.scene().getTransformNodeByName("truck").isEnabled(), null, { timeout: 20000 }).then(() => true, () => false), "the garbage truck drives in");
    }
    if (kind === "airdrop") ok(await A.waitForFunction(() => window.__bfb.items().some((i) => i.type === "airdrop_crate"), null, { timeout: 20000 }).then(() => true, () => false), "an airdrop crate spawns");
    if (kind === "raccoons") ok(await A.waitForFunction(() => window.__bfb.npcs().some((n) => n.kind === "raccoon"), null, { timeout: 20000 }).then(() => true, () => false), "a raccoon sneaks toward your fort");
  }
  // carry something away from home when time runs out = lost
  await A.evaluate(() => { window.__bfb.clearNpcs(-8, -8, 8); window.__bfb.teleport(-8, -8, 0); });
  await sleep(500);
  await A.evaluate(() => { window.__bfb.spawnItem("rubber_chicken", -8, -6.4); window.__bfb.setPitch(Math.atan2(1.35, 1.6)); });
  await lookAt("rubber_chicken");
  await A.keyboard.press("e");
  ok(await waitInv("v.pockets.some(Boolean)"), "pocketed a chicken out in the city");
  ok(await A.isVisible("#home-arrow") && /HOME \d+ m/.test(await A.textContent("#home-arrow")), `home compass: "${await A.textContent("#home-arrow")}"`);
  await A.evaluate(() => window.__bfb.setTimeLeft(2));
  ok(await waitPhase("tally", 30000), "time's up -> tally");
  const res = JSON.parse((await M()).results)[0];
  ok(res.lost >= 1 && res.banked >= 1, `results: banked ${res.banked} ($${res.bankedValue}), lost ${res.lost} ($${res.lostValue})`);
  ok(await A.isVisible("#tally") && /ROUND 1 RESULTS/.test(await A.textContent("#tally")), "round results card");
  ok(await waitInv("v.pockets.every((x) => !x)", 5000), "the chicken is gone (lost)");
  await hide();
  await shot(A, "25-round-results.png");
  ok(await waitPhase("intro", 30000) && (await M()).round === 2, "round 2 begins after the results");
  // fast-forward to the end of the match
  for (let k = 0; k < 12 && (await M()).phase !== "over"; k++) { await A.evaluate(() => window.__bfb.setTimeLeft(0.2)); await sleep(700); }
  ok((await M()).phase === "over", "after 3 rounds: match over");
  ok(/TOP BANDIT/.test(await A.textContent("#tally")), `final card: "${(await A.textContent("#tally-title"))}"`);
  await hide();
  await shot(A, "26-final-results.png");
  await A.keyboard.press("Enter");
  ok(await waitPhase("intro", 5000) && (await M()).round === 1 && (await M()).scores[0].cash === 0, "ENTER plays again (fresh match)");

  await A.evaluate(() => window.__bfb.testInput(false));
  await sleep(300);
  ok(await A.isVisible("#pause"), "releasing the mouse (ESC) opens the pause menu");
  await hideOverlays(A);
  await shot(A, "02-solo-arena.png");
  await A.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await shot(A, "07-pause-menu.png");
  await A.click("#btn-leave");
  await A.waitForFunction(() => window.__bfb.info().screen === "title");
  ok(true, "leave from solo returns to title");

  console.log("\n# Create room");
  await A.fill("#name-input", "Alice");
  await A.click("#btn-create");
  await A.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  i = await info(A);
  const code = i.roomCode;
  ok(/^[A-Z2-9]{5}$/.test(code), `room created with code ${code}`);
  ok((await A.url()).includes(`room=${code}`), "address bar shows shareable link");
  ok((await A.textContent("#lp-code")) === code, "lobby panel shows code");
  ok(await A.isVisible("#btn-start"), "host sees START MATCH");

  console.log("\n# Friends join by link");
  const B = await openPage("B", `?room=${code}&test=1`);
  ok(await B.isVisible("#invite-card"), "invite link shows 'join room' card");
  ok((await B.textContent("#invite-code")) === code, "invite card shows right code");
  await B.fill("#name-input", "Bob");
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  const C = await openPage("C", `?room=${code}&test=1`);
  await C.click("#btn-accept-invite");
  await C.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  await sleep(800);
  for (const p of [A, B, C]) {
    const x = await info(p);
    ok(Object.keys(x.players).length === 3 && x.remotes === 2, `${p.label}: sees 3 players (${x.remotes} others drawn)`);
  }
  ok(!(await B.isVisible("#btn-start")), "non-host does not see START MATCH");
  ok(Object.values((await info(A)).players).some((p) => p.name === "Bob"), "invited player could set their name (Bob)");

  console.log("\n# Movement sync");
  await sleep(2000);
  const aStart = (await info(A)).pos;
  const s0 = (await info(A)).stats, t0 = Date.now();
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 1 }));
  // walk for at least ~0.75 s of game time (the test machine may render very few frames per second)
  await A.waitForFunction((n) => window.__bfb.info().stats.moveSteps >= n, s0.moveSteps + 45, { timeout: 60000 }).catch(() => {});
  await A.evaluate(() => window.__bfb.setAxes(null));
  const s1 = (await info(A)).stats, t1 = Date.now();
  console.log(`   [diag] A sim steps ${s1.steps - s0.steps} in ${t1 - t0}ms wall; time lost to >250ms frame stalls: ${(s1.droppedMs - s0.droppedMs).toFixed(0)}ms; fps ${(await info(A)).fps}`);
  await sleep(700);
  // compare only once A has fully stopped (the weighty skid takes a moment), then give the
  // server + B a moment to receive A's last inputs
  await A.waitForFunction(() => { const m = window.__bfb.move(); return Math.hypot(m.vx, m.vz) === 0; }, null, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  const aNow = (await info(A)).pos;
  const aSid = (await info(A)).sessionId;
  const bView = (await info(B)).players[aSid];
  // Wall-clock distance depends on this machine's CPU rendering speed, so instead check that
  // the distance matches the number of simulation steps actually run (5.2 m/s walking, minus ~0.1 s ramp-up).
  const steps = s1.moveSteps - s0.moveSteps, moved = aNow.z - aStart.z, expected = rampDist(steps / 60, 5.0);
  ok(moved > 0.3 && Math.abs(moved - expected) < 0.8, `A walked ${moved.toFixed(2)}m over ${steps} sim steps (expected ~${expected.toFixed(2)}m)`);
  ok(Math.abs(bView.z - aNow.z) < 0.05, `B's view of A matches A (diff ${Math.abs(bView.z - aNow.z).toFixed(3)}m)`);
  const aStats = (await info(A)).stats;
  ok(aStats.snaps === 0, `A's prediction never needed a hard snap (corrections: ${aStats.corrections})`);

  // Phase 1: other players see your crouch
  await A.evaluate(() => window.__bfb.setAxes({ mx: 0, mz: 0, crouch: true }));
  const aSid2 = (await info(A)).sessionId;
  const sawCrouch = await B.waitForFunction((id) => { const p = window.__bfb.info().remotePoses?.[id]; return p === "crouch" || p === "crouchWalk"; }, aSid2, { timeout: 15000 }).then(() => true, () => false);
  ok(sawCrouch, "B sees A crouching");

  // ---- Phase 2 loot online ----
  console.log("\n# Phase 2 loot (online)");
  await A.evaluate(() => window.__bfb.setAxes(null));
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(true));
  await A.evaluate(() => { window.__bfb.teleport(-16, -8, 0); window.__bfb.clearNpcs(-16, -5, 14); });
  await sleep(800);
  await A.evaluate(() => { window.__bfb.spawnItem("crt_tv", -16, -6.4); window.__bfb.setPitch(Math.atan2(1.2, 1.6)); });
  const aLook = await A.waitForFunction(() => window.__bfb.lookTarget()?.type === "crt_tv", null, { timeout: 15000 }).then(() => true, () => false);
  ok(aLook, "A looks at a TV spawned in the online room");
  await A.keyboard.press("e");
  const aId = (await info(A)).sessionId;
  const bSawHeld = await B.waitForFunction((id) => window.__bfb.items().some((x) => x.type === "crt_tv" && x.mode === "held" && x.holder === id), aId, { timeout: 15000 }).then(() => true, () => false);
  ok(bSawHeld, "B sees the TV in A's hands");
  await A.keyboard.press("g");
  ok(await A.waitForFunction(() => window.__bfb.serverInventory().hand === "", null, { timeout: 20000 }).then(() => true, () => false), "A drops the TV (hands empty before the race)");

  // Grab race: A and C both go for the same suitcase at the same moment
  await A.evaluate(() => window.__bfb.teleport(-16, -4.7, 0));
  await C.evaluate(() => window.__bfb.teleport(-14.3, -3, -Math.PI / 2));
  await sleep(1200);
  await A.evaluate(() => { window.__bfb.spawnItem("mystery_suitcase", -16, -3); window.__bfb.setPitch(0.45); });
  await C.evaluate(() => window.__bfb.setPitch(0.45));
  const bothLook = await Promise.all([A, C].map((P) => P.waitForFunction(() => window.__bfb.lookTarget()?.type === "mystery_suitcase", null, { timeout: 15000 }).then(() => true, () => false)));
  ok(bothLook.every(Boolean), "A and C are both looking at the suitcase");
  await Promise.all([A.keyboard.press("e"), C.keyboard.press("e")]);
  await sleep(2500);
  const hands = await Promise.all([A, C].map((P) => P.evaluate(() => window.__bfb.serverInventory().hand)));
  const raceItems = await A.evaluate(() => window.__bfb.items().filter((x) => Math.hypot(x.x + 16, x.z + 4) < 6).map((x) => `${x.id}:${x.type}:${x.mode}:${x.holder}`));
  console.log(`   [diag] race hands A=${hands[0]} C=${hands[1]} nearby=${JSON.stringify(raceItems)}`);
  const winners = hands.filter(Boolean).length;
  ok(winners === 1, `grab race: exactly one winner (A: ${hands[0] ? "got it" : "whiffed"}, C: ${hands[1] ? "got it" : "whiffed"})`);
  const loser = hands[0] ? C : A;
  ok(!(await loser.evaluate(() => window.__bfb.inventory().hand)), "the loser's hands are empty again (instant guess undone)");
  await (hands[0] ? A : C).keyboard.press("g");
  await sleep(500);

  // ---- Phase 2.5 PvP punch online: A punches C = full knockdown, everyone sees it ----
  console.log("\n# Phase 2.5 punch (online)");
  ok((await A.evaluate(() => window.__bfb.npcs().length)) >= 24, "pedestrians + cashiers are synced to online players");
  const cSidP = (await info(C)).sessionId;
  await A.evaluate(() => window.__bfb.clearNpcs(-8, -7, 8));
  // park the mouse on the crosshair first: moving it there later would turn A's view (mouse look)
  await A.mouse.move(640, 360);
  await sleep(200);
  await A.evaluate(() => window.__bfb.teleport(-8, -8, 0));
  await C.evaluate(() => window.__bfb.teleport(-8, -6.8, Math.PI));
  await sleep(1500);
  await A.evaluate(() => window.__bfb.setPitch(0.05));
  await A.mouse.click(640, 360);
  const cKnocked = await C.waitForFunction(() => window.__bfb.move().knockT > 0, null, { timeout: 15000 }).then(() => true, () => false);
  ok(cKnocked, "A's punch knocks C down");
  // (the daze effect only lasts as long as the knockdown, so check it straight away)
  ok(await C.evaluate(() => window.__bfb.fxHistory().includes("knocked")), "C gets the knocked-down screen effect");
  const bSeesDown = await B.waitForFunction((id) => window.__bfb.info().remotePoses?.[id] === "knocked", cSidP, { timeout: 15000 }).then(() => true, () => false);
  ok(bSeesDown, "B sees C lying on the ground");
  await sleep(300);
  await hideOverlays(C);
  await shot(C, "21-online-C-knocked.png");
  await sleep(700);
  await A.mouse.click(640, 360);
  await sleep(1500);
  ok(await C.evaluate(() => window.__bfb.move().immuneT > 0), "C is briefly immune after a knockdown (no spam-knocking)");
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(false));
  await sleep(300);

  // Face B toward A and screenshot
  const bPos = (await info(B)).pos;
  const yaw = Math.atan2(aNow.x - bPos.x, aNow.z - bPos.z);
  await B.evaluate((y) => window.__bfb.setYaw(y), yaw);
  await sleep(400);
  await hideOverlays(B);
  await shot(B, "03-online-B-sees-A-crouching.png");
  await A.evaluate(() => window.__bfb.setAxes(null));
  await hideOverlays(A);
  await shot(A, "04-online-A-lobby.png");

  console.log("\n# Phase 4 jail (online)");
  // busted online: the server replays your lock-pick presses and lets you out the back
  for (const P of [A, C]) await P.evaluate(() => { window.__bfb.testInput(true); window.__bfb.setAxes(null); });
  await C.evaluate(() => window.__bfb.bust());
  ok(await C.waitForFunction(() => window.__bfb.jail()?.open, null, { timeout: 20000 }).then(() => true, () => false), "online: busted -> jail screen");
  const aSeesC = await A.waitForFunction(() => Object.values(window.__bfb.info().players ?? {}).some((p) => p.x > 77 && p.x < 99 && p.z < -88 && p.z > -95), null, { timeout: 15000 }).then(() => true, () => false);
  ok(aSeesC, "others see you in the cell");
  await C.evaluate(() => window.__bfb.setJailTime(90));
  const brokeOnline = await C.evaluate(() => window.__bfb.lockAutoPlay());
  ok(brokeOnline && await C.waitForFunction(() => window.__bfb.jail()?.jailT === 0, null, { timeout: 90000 }).then(() => true, () => false), "online: the server accepted the lock-picking and let you out");
  const stC = await C.evaluate(() => window.__bfb.station());
  await C.waitForFunction((al) => { const m = window.__bfb.move(); return Math.hypot(m.x - al.x, m.z - al.z) < 3; }, stC.alley, { timeout: 5000 }).catch(() => {});
  const mC = await C.evaluate(() => window.__bfb.move());
  ok(Math.hypot(mC.x - stC.alley.x, mC.z - stC.alley.z) < 3, `online: out in the back alley (at ${mC.x.toFixed(1)}, ${mC.z.toFixed(1)}; history ${JSON.stringify((await C.evaluate(() => window.__bfb.jail()))?.history ?? [])})`);
  await C.evaluate(() => window.__bfb.clearCops());
  for (const P of [A, C]) await P.evaluate(() => window.__bfb.testInput(false));

  console.log("\n# Connection drop + automatic reconnect");
  const cSid = (await info(C)).sessionId;
  await C.evaluate(() => window.__bfb.dropConnection());
  let sawOffline = false;
  for (let k = 0; k < 20 && !sawOffline; k++) { await sleep(150); sawOffline = (await info(A)).players[cSid]?.connected === false; }
  ok(sawOffline, "others see C as 'reconnecting' (seat held, not deleted)");
  let back = false;
  for (let k = 0; k < 60 && !back; k++) { await sleep(250); back = (await info(A)).players[cSid]?.connected === true; }
  ok(back, "C reconnected automatically to the same seat");
  ok((await info(C)).sessionId === cSid, "C kept same identity after reconnect");

  console.log("\n# Refresh the tab and rejoin");
  const bSid = (await info(B)).sessionId;
  await B.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await B.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 30000 });
  await B.click("#btn-accept-invite");
  await B.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
  await sleep(600);
  ok((await info(B)).sessionId === bSid, "refreshed player got their old seat back");
  ok(Object.keys((await info(A)).players).length === 3, "still 3 players after refresh (no ghost duplicate)");

  console.log("\n# Room full + bad code");
  const D = await openPage("D", `?room=${code}&test=1`);
  await D.click("#btn-accept-invite", { timeout: 120000 }); // 4 windows on one CPU: this page is slow
  await D.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 240000 });
  const E = await openPage("E", `?room=${code}&test=1`);
  await E.click("#btn-accept-invite", { timeout: 120000 });
  await E.waitForFunction(() => window.__bfb.info().screen === "title" && document.getElementById("title-status").textContent.length > 0, null, { timeout: 15000 });
  const fullMsg = await E.textContent("#title-status");
  ok(/full/i.test(fullMsg), `5th player gets friendly message: "${fullMsg}"`);
  await E.fill("#code-input", "ZZZZZ");
  await E.click("#btn-join");
  await E.waitForFunction(() => /exist/i.test(document.getElementById("title-status").textContent), null, { timeout: 15000 });
  ok(true, `bad code message: "${await E.textContent("#title-status")}"`);
  await shot(E, "05-room-full-message.png");
  await E.context().close();
  await D.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await D.click("#btn-leave");
  await sleep(300);

  console.log("\n# Host starts, then host leaves");
  await A.evaluate(() => { document.getElementById("pause").classList.remove("hidden"); });
  await A.click("#btn-start");
  const started = await B.waitForFunction(() => window.__bfb.info().phase === "intro", null, { timeout: 15000 }).then(() => true, () => false);
  ok(started, "host START reaches everyone (round 1 intro)");
  // (4 windows share one CPU here, so a busy window can lag a moment: compare once both are in the round)
  await Promise.all([A, B].map((P) => P.waitForFunction(() => window.__bfb.match().phase === "scavenge", null, { timeout: 60000 }).catch(() => {})));
  const [ta, tb] = await Promise.all([A, B].map((P) => P.evaluate(() => window.__bfb.match().timeLeft)));
  ok(Math.abs(ta - tb) < 4, `everyone sees the same round timer (${ta.toFixed(1)} vs ${tb.toFixed(1)})`);
  await A.click("#btn-leave");
  await sleep(600);
  ok((await info(A)).screen === "title", "host returned to title");
  const bInfo = await info(B);
  ok(Object.keys(bInfo.players).length === 2, "remaining players stay in the room");
  const hostNow = await B.evaluate(() => document.getElementById("lp-players").textContent);
  ok(/HOST/.test(hostNow), "someone else became host automatically");

  console.log("\n# Console errors");
  for (const p of [A, B, C, D]) {
    const errs = p.errors.filter((e) => !/favicon|fonts\.g/.test(e));
    ok(errs.length === 0, `${p.label}: no JS errors${errs.length ? " -> " + errs.slice(0, 3).join(" | ") : ""}`);
  }
} catch (e) {
  ok(false, "test crashed: " + (e?.stack ?? e));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
}
````

## FILE: tests/ghost-client.ts

````ts
import { Client } from "@colyseus/sdk";
const [url, code] = process.argv.slice(2);
await new Client(url).joinById(code, { name: "Ghost" });
setTimeout(() => process.kill(process.pid, "SIGKILL"), 800);
````

## FILE: tests/perf-npcs.mjs

````js
// Client cost of the pedestrians: draw calls + frame time in solo at the plaza (software GPU).
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto((process.env.CLIENT_URL ?? "http://localhost:4173") + "/?test=1");
await p.waitForFunction(() => window.__bfb?.info().screen === "title", null, { timeout: 90000 });
await p.click("#btn-solo");
await p.waitForFunction(() => window.__bfb.info().screen === "playing", null, { timeout: 90000 });
await p.evaluate(() => { window.__bfb.testInput(true); window.__bfb.teleport(0, -12, 0); });
await sleep(4000);
const sample = async (label) => {
  await p.evaluate(() => window.__bfb.perf(true));
  await sleep(4000);
  const r = await p.evaluate(() => ({ i: window.__bfb.info(), perf: window.__bfb.perf(), npc: window.__bfb.npcStats(), meshes: window.__bfb.scene().meshes.length, active: window.__bfb.scene().getActiveMeshes().length }));
  console.log(label, JSON.stringify({ fps: r.i.fps, drawCalls: r.i.drawCalls, npcVisible: r.npc.visible, meshes: r.meshes, activeMeshes: r.active, worstRenderMs: r.perf.render.toFixed(1), worstWorldMs: r.perf.world.toFixed(1), worstApplyMs: r.perf.apply.toFixed(1) }));
};
await sample("plaza, facing north:");
await p.evaluate(() => window.__bfb.setYaw(Math.PI));
await sample("plaza, facing south:");
await browser.close();
````

## FILE: tests/server-smoke.ts

````ts
// Headless multiplayer smoke test: no browser. Two SDK clients join one room by code.
import { Client } from "@colyseus/sdk";
import { ROOM_NAME, MSG } from "@bfb/shared";

const url = process.env.SERVER_URL ?? "http://localhost:2567";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function assert(c: unknown, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } else console.log("ok -", msg); }

const a = await new Client(url).create(ROOM_NAME, { name: "Alice" });
assert(/^[A-Z2-9]{5}$/.test(a.roomId), `room code looks right: ${a.roomId}`);
const b = await new Client(url).joinById(a.roomId, { name: "<Bob>" });
a.onMessage("*", () => {}); b.onMessage("*", () => {});
await sleep(300);
const st: any = a.state;
assert(st.players.size === 2, "both players in room");
assert(st.ownerId === a.sessionId, "creator is owner");
const bob = st.players.get(b.sessionId);
assert(bob.name === "Bob", `name sanitized: ${bob.name}`);
assert(bob.colorIdx !== st.players.get(a.sessionId).colorIdx, "distinct colours");

// Alice walks forward for 1s (60 inputs)
const startZ = st.players.get(a.sessionId).z;
for (let i = 0; i < 60; i++) { a.send(MSG.INPUT, [{ seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const alice = (b.state as any).players.get(a.sessionId);
assert(alice.z - startZ > 4 && alice.z - startZ < 6, `Bob sees Alice moved ~5m: ${(alice.z - startZ).toFixed(2)}`);
assert(alice.lastSeq === 59, `server acked all inputs: ${alice.lastSeq}`);

// Speed hack attempt: 200 inputs at once should NOT all be applied instantly
const before = alice.z;
const burst = []; for (let i = 60; i < 76; i++) burst.push({ seq: i, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false });
for (let k = 0; k < 10; k++) a.send(MSG.INPUT, burst.map((x) => ({ ...x, seq: x.seq + k * 16 })));
await sleep(100);
const moved = (b.state as any).players.get(a.sessionId).z - before;
assert(moved < 3, `burst inputs rate-limited (moved ${moved.toFixed(2)}m in 0.1s)`);

// Phase 1 state reaches other players: stamina drain and crouch
let seq = 1000;
for (let i = 0; i < 90; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 1, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false, dodge: false }]); await sleep(16); }
await sleep(300);
const aView = (b.state as any).players.get(a.sessionId);
assert(aView.stamina < 0.9, `Bob sees Alice's stamina drop: ${aView.stamina.toFixed(2)}`);
for (let i = 0; i < 20; i++) { a.send(MSG.INPUT, [{ seq: seq++, mx: 0, mz: 0, yaw: 0, pitch: 0, sprint: false, jump: false, crouch: true, dodge: false }]); await sleep(16); }
await sleep(300);
assert((b.state as any).players.get(a.sessionId).crouching === true, "Bob sees Alice crouching");

// Phase 2: loot is synced, and actions produce events
const itemsSeen = (b.state as any).items.size;
assert(itemsSeen >= 28, `loot synced to clients: ${itemsSeen} items`);
let firstItem: any = null;
(b.state as any).items.forEach((it: any, id: string) => { if (!firstItem) firstItem = { id, ...it.toJSON?.() ?? it }; });
assert(typeof firstItem.type === "string" && Number.isFinite(firstItem.x), `item has type + position (${firstItem.type})`);
const evs: any[] = [];
a.onMessage(MSG.EVENTS, (e: any[]) => evs.push(...e));
a.send(MSG.ACTION, { a: "grab", item: firstItem.id }); // far away -> whiff
await sleep(300);
assert(evs.some((e) => e.t === "whiff" && e.p === a.sessionId), "grabbing a far item = whiff event");

// Phase 2.5: pedestrians are synced
const npcCount = (b.state as any).npcs.size;
assert(npcCount === 24, `pedestrians + cashiers synced to clients: ${npcCount}`);
{
  const st2: any = a.state;
  assert(st2.cars.size === 14, `traffic synced: ${st2.cars.size} cars`);
  assert(st2.props.size > 90, `props synced: ${st2.props.size}`);
}
let anNpc: any = null;
(b.state as any).npcs.forEach((n: any) => { if (!anNpc) anNpc = n; });
assert(typeof anNpc.kind === "string" && Number.isFinite(anNpc.x), `pedestrian has kind + position (${anNpc.kind})`);
const x0 = anNpc.x, z0 = anNpc.z;
await sleep(1500);
assert(Math.hypot(anNpc.x - x0, anNpc.z - z0) > 0.3 || anNpc.state !== "walk", "pedestrians are walking around");

// Only owner may start
b.send(MSG.START); await sleep(200);
assert(st.phase === "lobby", "non-owner cannot start");
a.send(MSG.START); await sleep(200);
assert(st.phase === "intro" && st.round === 1, "owner starts round 1");
assert(st.timeLeft > 3 && st.timeLeft <= 5, `intro countdown synced: ${st.timeLeft}`);

// Bad code
try { await new Client(url).joinById("ZZZZZ", { name: "x" }); assert(false, "bad code rejected"); }
catch { assert(true, "bad code rejected"); }

// Owner leaves -> ownership transfers
await a.leave(true); await sleep(300);
assert((b.state as any).ownerId === b.sessionId, "ownership passed to Bob");
await b.leave(true);
console.log("ALL SERVER SMOKE TESTS PASSED");
process.exit(0);
````

## FILE: tsconfig.base.json

````json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "types": [],
    "allowImportingTsExtensions": true
  }
}
````
