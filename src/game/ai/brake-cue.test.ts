import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Track } from "../world/track.ts";
import { TRACKS } from "../world/tracks/index.ts";
import { classStats } from "../vehicle/vehicle-classes.ts";
import { brakeCueAt } from "./brake-cue.ts";

const oval = new Track(TRACKS[0]);
const path = oval.path;
const sedan = classStats("sedan");
/** Arc length (m) of path sample `k`. */
const arc = (k: number) => (k / path.count) * path.length;
// The oval's sharpest bend (sample 112, corner speed ≈ 33 m/s for a sedan) and the middle of its back straight.
const HAIRPIN = arc(112);
const STRAIGHT = arc(350);

describe("given the oval and a sedan", () => {
  it("when it does 50 m/s 25 m before the sharpest bend, then the cue is on", () => {
    assert.equal(brakeCueAt(path, sedan, HAIRPIN - 25, 50, 1), true);
  });
  it("when it does 8 m/s at the same point, then the cue is off", () => {
    assert.equal(brakeCueAt(path, sedan, HAIRPIN - 25, 8, 1), false);
  });
  it("when it does 50 m/s mid-straight with no bend in braking reach, then the cue is off", () => {
    assert.equal(brakeCueAt(path, sedan, STRAIGHT, 50, 1), false);
  });
});
