import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HUNT } from "../ai/hunter.ts";
import { BUST } from "../match/session.ts";
import type { DriveInput } from "../vehicle/car-drive.ts";
import { FRAME, frame, makeWorld, type World } from "./race-world.test-util.ts";
import { chaseCam, hold, leaveSurvival, visibleFrom } from "./survival-run.test-util.ts";

/** A hosted Survival run with the host's car 0 and a network peer on each of the cars in `peers` (`setSeats`). Not a test file itself. */
export function coopWorld(peers: readonly number[], seed = 1): World {
  const w = makeWorld();
  w.race.reseed(seed);
  w.race.setSeats(new Map(peers.map((car) => [car, `Peer ${car}`])));
  w.race.enter(true);
  return w;
}

export const STILL: DriveInput = { throttle: 0, steer: 0, brake: 0, ebrake: true, boost: false };
/** The longest a parked human may wait between two cops showing (s): one drop-in gap, measured 1.5 s, and a tenth for the frame a cop is seen on. */
const DROP_WAIT = HUNT.gap + 0.1;

/** Every cop the camera sees, or that comes within the bust's reach of a human, is wrecked on the spot (and a wreck in view is never put away), the humans parked: the pack runs out of units unless a drop-in may reuse a wreck. Without the reach rule a cop out of the host's sight busts the peer first (2 humans: run over at 45 s, before the units are used up). A cop shows when it is placed and visible. */
function wreckedInView(peers: readonly number[], seconds: number): { arrivals: number[]; units: number; time: number } {
  const w = coopWorld(peers);
  try {
    const state = { acc: 0 };
    const humans = peers.length + 1;
    const placed: number[] = [];
    const arrivals: number[] = [];
    for (let n = 0; n * FRAME < seconds; n++) {
      hold(w);
      for (const car of peers) w.race.setRemoteInput(car, STILL);
      chaseCam(w);
      frame(w, state);
      const cars = w.live();
      for (let i = humans; i < cars.length; i++) {
        const c = cars[i]!;
        const moved = c.placements !== (placed[i] ?? c.placements);
        placed[i] = c.placements;
        if (moved && c.group.visible && w.race.time > 0) arrivals.push(w.race.time);
        const { x, z } = c.group.position;
        const reached = cars.slice(0, humans).some((h) => Math.hypot(h.group.position.x - x, h.group.position.z - z) <= BUST.near);
        if (c.group.visible && w.race.time > 0 && (reached || visibleFrom(w, x, z))) c.deform.drivetrainAlive = false;
      }
    }
    return { arrivals, units: w.live().length - humans, time: w.race.time };
  } finally {
    leaveSurvival(w);
  }
}

/** Longest wait (s) between two cops showing on the road, from the green to `seconds`. */
const longestWait = (arrivals: readonly number[], seconds: number): number => arrivals.reduce((worst, t, i) => Math.max(worst, t - (arrivals[i - 1] ?? 0)), seconds - (arrivals.at(-1) ?? 0));

/** The drop-in soft-lock case for the humans seated in `peers` (one file per head count: each run is minutes of sim). */
export function dropInCase(peers: readonly number[]): void {
  describe("given a hosted Survival run with every cop that comes into view wrecked and the humans parked", () => {
    it(`when ${peers.length + 1} human${peers.length ? "s" : ""} wait out 150 s, then the pack never goes more than ${DROP_WAIT} s without dropping a cop in, though every unit ends up a wreck in view`, (t) => {
      const { arrivals, units, time } = wreckedInView(peers, 150);
      const wait = longestWait(arrivals, time);
      t.diagnostic(`${arrivals.length} drop-ins from ${units} units, longest wait ${wait.toFixed(1)} s`);
      assert.ok(arrivals.length > units, `${arrivals.length} cops showed from ${units} units: the units were used up and used again`);
      assert.ok(wait <= DROP_WAIT, `${wait.toFixed(1)} s without a drop-in`);
    });
  });
}
