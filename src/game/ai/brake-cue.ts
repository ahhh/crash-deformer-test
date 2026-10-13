import { STRAIGHT_CURV } from "./constants.ts";
import { CORNER_MARGIN, PLAN_BRAKE, sampleAt } from "./race-ai.ts";
import type { TrackPath } from "../world/track.ts";
import { cornerSpeed, type ClassStats } from "../vehicle/vehicle-classes.ts";

/** Metres between the look-ahead's samples (the AI's own spacing). */
const CUE_STEP = 3;
/** Extra look-ahead (m) beyond the planned braking distance. */
const CUE_MARGIN = 12;

/**
 * The braking cue: a car `along` m/s forward at `s` m along `pp` is going faster than the AI's braking plan allows for
 * a corner ahead (`plan`: the corner speed there plus what `PLAN_BRAKE` of the class brake sheds over the distance).
 */
export function brakeCueAt(pp: TrackPath, cls: ClassStats, s: number, along: number, grip: number): boolean {
  if (along <= 0) return false;
  const decel = cls.brake * PLAN_BRAKE;
  const reach = (along * along) / (2 * decel) + CUE_MARGIN;
  for (let d = 0; d <= reach; d += CUE_STEP) {
    const curv = Math.abs(pp.curv[sampleAt(pp, s + d)]!);
    if (curv <= STRAIGHT_CURV) continue;
    const corner = cornerSpeed(cls, CORNER_MARGIN / curv, grip);
    if (along * along > corner * corner + 2 * decel * d) return true;
  }
  return false;
}
