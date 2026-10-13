import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { approach, crashDuck, engineBusGain, engineDuck, MASTER_LIMITER, musicGain, slowmoCutoff } from "./audio-mix.ts";

const EPS = 1e-9;

describe("given the music bus gain (the slider, capped at 0.6, under the engine duck and the crash duck)", () => {
  const testCases = [
    { name: "the default slider, no ducking", volume: 0.35, engineDuck: 1, crash: 1, expected: 0.35 },
    { name: "a full slider is capped", volume: 1, engineDuck: 1, crash: 1, expected: 0.6 },
    { name: "a wild slider is capped", volume: 5, engineDuck: 1, crash: 1, expected: 0.6 },
    { name: "the cap under full engine duck (x0.65)", volume: 0.6, engineDuck: engineDuck(1), crash: 1, expected: 0.39 },
    { name: "the cap under a crash duck (x0.4)", volume: 0.6, engineDuck: 1, crash: 0.4, expected: 0.24 },
  ];
  for (const c of testCases) {
    it(`when the music is ${c.name}, then the bus gain is ${c.expected}`, () => {
      assert.ok(Math.abs(musicGain(c.volume, c.engineDuck, c.crash) - c.expected) < EPS);
    });
  }
});

describe("given the engine bus gain (the slider, linear to 2.5: the 0.5 default is x1.25)", () => {
  const testCases = [
    { name: "the default slider", volume: 0.5, expected: 1.25 },
    { name: "a full slider", volume: 1, expected: 2.5 },
    { name: "a muted slider", volume: 0, expected: 0 },
    { name: "a wild slider is capped", volume: 5, expected: 2.5 },
    { name: "a negative slider is floored", volume: -1, expected: 0 },
  ];
  for (const c of testCases) {
    it(`when the engines are ${c.name}, then the bus gain is ${c.expected}`, () => {
      assert.equal(engineBusGain(c.volume), c.expected);
    });
  }
});

describe("given the master limiter", () => {
  it("when its ratio is read, then it limits (at least 10:1) instead of the old 4:1 squeeze", () => {
    assert.ok(MASTER_LIMITER.ratio >= 10);
  });
  it("when its attack and release are read, then it grabs a peak within 5 ms and lets go within a quarter second", () => {
    assert.ok(MASTER_LIMITER.attack <= 0.005 && MASTER_LIMITER.release <= 0.25);
  });
});

describe("given the engine duck of the music", () => {
  const testCases = [
    { name: "an idle player", level: 0, expected: 1 },
    { name: "a player at full load and revs", level: 1, expected: 0.65 },
    { name: "a player at half level", level: 0.5, expected: 0.825 },
  ];
  for (const c of testCases) {
    it(`when ${c.name}, then the duck is ${c.expected}`, () => {
      assert.ok(Math.abs(engineDuck(c.level) - c.expected) < EPS);
    });
  }
});

describe("given the crash duck of the music", () => {
  const testCases = [
    { name: "the moment of impact", sinceS: 0, expected: 0.4 },
    { name: "the end of the hold (0.3 s)", sinceS: 0.3, expected: 0.4 },
    { name: "one time constant after the hold (0.8 s)", sinceS: 0.8, expected: 1 - 0.6 * Math.exp(-1) },
    { name: "long after", sinceS: 20, expected: 1 },
    { name: "no crash yet", sinceS: Infinity, expected: 1 },
  ];
  for (const c of testCases) {
    it(`when it is ${c.name}, then the duck is ${c.expected}`, () => {
      assert.ok(Math.abs(crashDuck(c.sinceS) - c.expected) < 1e-6);
    });
  }
});

describe("given the slow-mo cutoff of the engine bus", () => {
  const testCases = [
    { name: "normal speed", rate: 1, expected: 20000 },
    { name: "a standstill", rate: 0, expected: 700 },
    { name: "a rate above normal is clamped", rate: 3, expected: 20000 },
    { name: "a negative rate is clamped", rate: -1, expected: 700 },
    { name: "a quarter speed", rate: 0.25, expected: 700 + 19300 * 0.5 },
  ];
  for (const c of testCases) {
    it(`when the time rate is ${c.name}, then the cutoff is ${c.expected} Hz`, () => {
      assert.ok(Math.abs(slowmoCutoff(c.rate) - c.expected) < EPS);
    });
  }
});

describe("given a first-order lag", () => {
  it("when one time constant passes, then it covers 63% of the way", () => {
    assert.ok(Math.abs(approach(0, 1, 0.3, 0.3) - (1 - Math.exp(-1))) < EPS);
  });
  it("when no time passes, then it stays put", () => {
    assert.equal(approach(0.4, 1, 0, 0.3), 0.4);
  });
  it("when it is at the target, then it stays there", () => {
    assert.equal(approach(1, 1, 0.5, 0.3), 1);
  });
});
