import type { RaceHud } from "@/game/match/types";

/** The race's readouts are up: a car to read, the race begun, and no results reel (its cameras ride replayed wrecks). */
export function showsDriveReadouts(race: RaceHud): boolean {
  return race.view !== null && race.phase !== null && race.reel === null;
}
