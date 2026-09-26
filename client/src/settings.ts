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
