import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { approach, CEILING, ceilingCurve, crashDuck, engineBusGain, engineDuck, IMPACT, MASTER_LIMITER, musicGain, slowmoCutoff } from "./audio-mix.ts";

const EPS = 1e-9;

describe("given the music bus gain (the slider, capped at 0.6, x0.5 trim, under the engine duck and the crash duck)", () => {
  const testCases = [
    { name: "the default slider (0.15), no ducking", volume: 0.15, engineDuck: 1, crash: 1, expected: 0.075 },
    { name: "a full slider is capped", volume: 1, engineDuck: 1, crash: 1, expected: 0.3 },
    { name: "a wild slider is capped", volume: 5, engineDuck: 1, crash: 1, expected: 0.3 },
    { name: "the cap under full engine duck (x0.65)", volume: 0.6, engineDuck: engineDuck(1), crash: 1, expected: 0.195 },
    { name: "the cap under a crash duck (x0.4)", volume: 0.6, engineDuck: 1, crash: 0.4, expected: 0.12 },
  ];
  for (const c of testCases) {
    it(`when the music is ${c.name}, then the bus gain is ${c.expected}`, () => {
      assert.ok(Math.abs(musicGain(c.volume, c.engineDuck, c.crash) - c.expected) < EPS);
    });
  }
});

describe("given the engine bus gain (the slider, linear to unity: the 0.25 default is x0.25)", () => {
  const testCases = [
    { name: "the default slider", volume: 0.25, expected: 0.25 },
    { name: "a full slider", volume: 1, expected: 1 },
    { name: "a muted slider", volume: 0, expected: 0 },
    { name: "a wild slider is capped", volume: 5, expected: 1 },
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

describe("given the -1 dBFS ceiling curve", () => {
  const curve = ceilingCurve(4097);
  it("when any input up to full scale is shaped, then no output passes -1 dBFS", () => {
    let peak = 0;
    for (let i = 0; i < curve.length; i++) peak = Math.max(peak, Math.abs(curve[i]!));
    assert.ok(peak <= CEILING + 1e-6, `peak ${peak} over ${CEILING}`);
  });
  it("when a signal sits under the knee (half scale), then it passes untouched", () => {
    const i = Math.round((0.5 + 1) / 2 * (curve.length - 1));
    assert.ok(Math.abs(curve[i]! - 0.5) < 1e-6, `0.5 became ${curve[i]}`);
  });
  it("when the input rises, then the output never falls (no fold-back distortion)", () => {
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i]! >= curve[i - 1]!, `curve falls at ${i}`);
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

describe("given the crash hit (owner: 'a cereal bag'; wanted lower, roomier, a little quieter than 900 Hz / 0.6 / dry / 0.28 s)", () => {
  it("when the noise is tuned, then it is dark (centre at most 400 Hz) and not an instant pop", () => {
    assert.ok(IMPACT.noiseHz <= 400);
    assert.ok(IMPACT.noiseAttackS >= 0.008 && IMPACT.noiseAttackS <= 0.015);
  });
  it("when the thump is tuned, then it starts where ordinary speakers play it (60-70 Hz)", () => {
    assert.ok(IMPACT.thumpStartHz >= 60 && IMPACT.thumpStartHz <= 70);
  });
  it("when the bus is set, then it is quieter than the old 0.6", () => {
    assert.ok(IMPACT.busGain < 0.6);
  });
  it("when the hit decays, then it rings at least 0.4 s", () => {
    assert.ok(IMPACT.noiseDecayS >= 0.4);
  });
  it("when the room is set, then it sends a wet reverb about a second long", () => {
    assert.ok(IMPACT.roomWet > 0);
    assert.ok(IMPACT.roomS >= 1);
  });
});
