import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { musicGain } from "./audio-mix.ts";

const EPS = 1e-9;

describe("given the music bus gain (the slider, capped at 0.6, under the engine duck and the crash duck)", () => {
  const testCases = [
    { name: "the default slider, no ducking", volume: 0.35, engineDuck: 1, crash: 1, expected: 0.35 },
    { name: "a full slider is capped", volume: 1, engineDuck: 1, crash: 1, expected: 0.6 },
    { name: "a wild slider is capped", volume: 5, engineDuck: 1, crash: 1, expected: 0.6 },
    { name: "the cap under full engine duck (x0.65)", volume: 0.6, engineDuck: 0.65, crash: 1, expected: 0.39 },
    { name: "the cap under a crash duck (x0.4)", volume: 0.6, engineDuck: 1, crash: 0.4, expected: 0.24 },
  ];
  for (const c of testCases) {
    it(`when the music is ${c.name}, then the bus gain is ${c.expected}`, () => {
      assert.ok(Math.abs(musicGain(c.volume, c.engineDuck, c.crash) - c.expected) < EPS);
    });
  }
});
