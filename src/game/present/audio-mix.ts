/** The loudest the music bus ever gets, whatever the slider or share link says. Engines must stay audible above it. */
export const MUSIC_MAX_GAIN = 0.6;

/** The music bus gain: the slider, capped, under the engine duck and the crash duck (each 0..1). */
export function musicGain(volume: number, engineDuck: number, crashDuck: number): number {
  return Math.min(MUSIC_MAX_GAIN, volume) * engineDuck * crashDuck;
}
