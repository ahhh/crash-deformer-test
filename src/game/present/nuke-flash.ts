/**
 * The secret's flash (`TrackArt.reveal`): a white-gold glare over the whole view that swells slowly, holds, and fades out over a few
 * seconds, `atPeak` running at its height (where the mushroom cloud appears). A DOM layer over the canvas, so it lights the HUD too
 * and needs no pass of the renderer's. Times in ms, from the source the owner asked for: "a slow bright flash".
 */
const FLASH = { rise: 1800, hold: 500, fade: 4200 } as const;

export function nukeFlash(over: HTMLElement, atPeak: () => void): void {
  const glare = document.createElement("div");
  glare.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:50;opacity:0;" +
    "background:radial-gradient(ellipse at 50% 40%, #fffef6 0%, #fff4cc 45%, #ffd27a 100%);";
  over.appendChild(glare);
  const total = FLASH.rise + FLASH.hold + FLASH.fade;
  const peak = FLASH.rise / total;
  const run = glare.animate(
    [
      { opacity: 0, easing: "ease-in" },
      { opacity: 1, offset: peak },
      { opacity: 1, offset: (FLASH.rise + FLASH.hold) / total, easing: "ease-out" },
      { opacity: 0 },
    ],
    { duration: total, fill: "forwards" },
  );
  setTimeout(atPeak, FLASH.rise);
  run.onfinish = () => glare.remove();
}
