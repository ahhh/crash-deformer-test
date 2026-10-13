/** The first track of a play session: a uniform pick of `count` from `random01` in [0, 1). */
export function firstTrack(count: number, random01: number): number {
  return Math.min(count - 1, Math.floor(random01 * count));
}

/** The track after `index`: the list loops. */
export function nextTrack(index: number, count: number): number {
  return (index + 1) % count;
}
