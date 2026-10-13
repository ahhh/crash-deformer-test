import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstTrack, nextTrack } from "./playlist.ts";

describe("given the track after the current one", () => {
  const testCases = [
    { index: 0, count: 4, expected: 1 },
    { index: 2, count: 4, expected: 3 },
    { index: 3, count: 4, expected: 0 },
    { index: 0, count: 1, expected: 0 },
  ];
  for (const c of testCases) {
    it(`when track ${c.index} of ${c.count} ends, then track ${c.expected} plays`, () => {
      assert.equal(nextTrack(c.index, c.count), c.expected);
    });
  }
  it("when the list is walked twice round from any start, then every track plays twice", () => {
    for (let start = 0; start < 4; start++) {
      const plays = [0, 0, 0, 0];
      let index = start;
      for (let step = 0; step < 8; step++) {
        plays[index]!++;
        index = nextTrack(index, 4);
      }
      assert.equal(plays.join(), "2,2,2,2");
    }
  });
});

describe("given the first track of a session", () => {
  const testCases = [
    { random: 0, count: 4, expected: 0 },
    { random: 0.25, count: 4, expected: 1 },
    { random: 0.4, count: 4, expected: 1 },
    { random: 0.999, count: 4, expected: 3 },
    { random: 0.5, count: 1, expected: 0 },
    { random: 1, count: 4, expected: 3 },
  ];
  for (const c of testCases) {
    it(`when the dice read ${c.random} over ${c.count} tracks, then track ${c.expected} is picked`, () => {
      assert.equal(firstTrack(c.count, c.random), c.expected);
    });
  }
});
