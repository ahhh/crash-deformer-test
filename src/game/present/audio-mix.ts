/** The loudest the music bus ever gets, whatever the slider or share link says. Engines must stay audible above it. */
export const MUSIC_MAX_GAIN = 0.6;
/** How far the player's engine at full load pulls the music down: x(1 - 0.35). With the 0.6 cap that leaves the music at 0.39 at most. */
const ENGINE_DUCK_DEPTH = 0.35;
/** A crash drops the music to this share, holds it for `CRASH_HOLD_S`, then lets it back with time constant `CRASH_RECOVER_TAU_S`. */
const CRASH_DUCK = 0.4;
const CRASH_HOLD_S = 0.3;
const CRASH_RECOVER_TAU_S = 0.5;
/** The slow-mo lowpass on the engine bus: closed to `SLOWMO_FLOOR_HZ` at standstill, open (20 kHz) at normal speed, following the square root of the rate. */
const SLOWMO_FLOOR_HZ = 700;
const SLOWMO_SPAN_HZ = 19300;

/**
 * The engine bus gain at a full slider. The 0.5 default is x1.25 (+1.9 dB): a voice's redline then peaks near -11 dBFS and the
 * player's engine rides about 1 dB over the music ducked under full throttle (measured RMS, `MOTOR_OUTPUT_GAIN`). A full slider is
 * +8 dB over unity, which only the master limiter keeps in bounds.
 */
const ENGINE_FULL_GAIN = 2.5;

/** The engine bus gain: the slider (0..1), linear to `ENGINE_FULL_GAIN`. */
export function engineBusGain(volume: number): number {
  return Math.min(1, Math.max(0, volume)) * ENGINE_FULL_GAIN;
}

/**
 * The master limiter (a DynamicsCompressor, which keeps a look-ahead): a high ratio at a threshold near the peaks, so it only
 * catches the sum of several close engines at a high slider. Browsers add make-up gain to a compressor: measured, a lone redline
 * at the default comes out +1.8 dB, and six voices at a full slider top out near -1.4 dBFS (the old -10 dB / 4:1 setting
 * ran every mix 2.7 dB hot and was squeezing it constantly).
 */
export const MASTER_LIMITER = { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 } as const;

/** The music bus gain: the slider, capped, under the engine duck and the crash duck (each 0..1). */
export function musicGain(volume: number, engineDuck: number, crashDuck: number): number {
  return Math.min(MUSIC_MAX_GAIN, volume) * engineDuck * crashDuck;
}

/** The music's duck for the player's engine at `playerLevel` (load x revs, 0..1). */
export function engineDuck(playerLevel: number): number {
  return 1 - ENGINE_DUCK_DEPTH * playerLevel;
}

/** The music's duck `sinceImpactS` seconds after a crash: down at once, held, then recovering. Infinity (no crash yet) is 1. */
export function crashDuck(sinceImpactS: number): number {
  if (sinceImpactS <= CRASH_HOLD_S) return CRASH_DUCK;
  return 1 - (1 - CRASH_DUCK) * Math.exp(-(sinceImpactS - CRASH_HOLD_S) / CRASH_RECOVER_TAU_S);
}

/** The engine bus lowpass cutoff (Hz) at the presented-time `rate` (1 = normal, clamped to 0..1). */
export function slowmoCutoff(rate: number): number {
  return SLOWMO_FLOOR_HZ + SLOWMO_SPAN_HZ * Math.sqrt(Math.min(1, Math.max(0, rate)));
}

/** `current` moved toward `target` by `dt` seconds of a first-order lag with time constant `tauS`. */
export function approach(current: number, target: number, dt: number, tauS: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tauS));
}
