/** Boost level above which the bottle glows: a burst of more than a quarter second is in it. */
const NITRO_USABLE = 0.15;

const NITRO_GLOW_CLASSES = {
  bottle: { soft: "shadow-[0_0_0.9em_0_var(--color-scene-race)]", bright: "shadow-[0_0_1.4em_0.25em_var(--color-scene-race)]" },
  bar: { soft: "drop-shadow-[0_0_4px_var(--color-accent)]", bright: "drop-shadow-[0_0_8px_var(--color-accent)]" },
};

/** How a boost meter glows, for the bottle and the compact bar alike: softly while a burst is in it, bright while burning, not at all for a car with no nitrous. */
export function nitroGlowClass(shape: keyof typeof NITRO_GLOW_CLASSES, boost: number | null, boosting: boolean): string | undefined {
  if (boost === null) return undefined;
  if (boosting) return NITRO_GLOW_CLASSES[shape].bright;
  return boost > NITRO_USABLE ? NITRO_GLOW_CLASSES[shape].soft : undefined;
}
