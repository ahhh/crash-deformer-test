import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as nextTurn } from "node:timers/promises";
import vm from "node:vm";
import { REV_IDLE, VEHICLE_CLASS_IDS, type DamageStage, type VehicleClassId } from "../vehicle/vehicle-classes.ts";
import { channelGains, motorRpm, MOTOR_OUTPUT_GAIN, toneMessage, toneOptions } from "./motor-tone.ts";

const SAMPLE_RATE = 44100;
const BLOCK = 128;
const SETTLE_BLOCKS = 200;
const MEASURE_BLOCKS = 400;
const STAGES: readonly DamageStage[] = ["healthy", "damaged", "limping"];
const REVS = [REV_IDLE, 0.4, 0.6, 0.8, 1] as const;
/** Every voice's loudest moment, any class, stage or rev: at most -6 dBFS (the old output clipped the unscaled sum, which swings to +-9, at +-1). */
const VOICE_PEAK_LIMIT = 0.5;
/** A redline's peak sits in this band (-18 to -8 dBFS) around the -12 of the player's engine at the default slider; the generator's noise moves a peak by a few dB run to run. */
const REDLINE_PEAK_MIN = 0.12;
const REDLINE_PEAK_MAX = 0.4;
/** A voice is never inaudibly thin: its RMS at any rev stays above -34 dBFS. */
const VOICE_RMS_MIN = 0.02;
const WORKLET = readFileSync(new URL("../../../public/audio/motor-worklet.js", import.meta.url), "utf8");

interface Processor {
  port: { onmessage: ((event: { data: unknown }) => void) | null };
  soundGenerator: unknown;
  process(inputs: unknown[], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
type ProcessorClass = new (options: { processorOptions: unknown }) => Processor;

/** Runs the shipped worklet file in a stub of an AudioWorkletGlobalScope: the real wasm synthesis, block by block, no browser. */
function loadProcessor(): { Processor: ProcessorClass; scope: { currentFrame: number } } {
  let registered: ProcessorClass | null = null;
  const scope = {
    AudioWorkletProcessor: class {
      port = { onmessage: null };
    },
    registerProcessor: (_name: string, processor: ProcessorClass) => {
      registered = processor;
    },
    sampleRate: SAMPLE_RATE,
    currentFrame: 0,
    console,
    WebAssembly,
    TextDecoder,
    TextEncoder,
    setTimeout,
    performance,
    URL,
  };
  vm.createContext(scope);
  vm.runInContext(WORKLET, scope);
  if (!registered) throw new Error("the worklet registered no processor");
  return { Processor: registered, scope };
}

const { Processor, scope } = loadProcessor();

interface Level {
  /** Peak and RMS of the voice's output (the class-tilted sum x `MOTOR_OUTPUT_GAIN`), 0..1 = full scale. */
  peak: number;
  rms: number;
}

/** The voice output of `cls` tuned to `stage`, per rev of `REVS`, after the settle time the generator needs. */
async function voiceLevels(cls: VehicleClassId, stage: DamageStage): Promise<Level[]> {
  const processor = new Processor({ processorOptions: toneOptions(cls, SAMPLE_RATE) });
  const out = [[new Float32Array(BLOCK)], [new Float32Array(BLOCK)], [new Float32Array(BLOCK)]];
  const idle = { rpm: new Float32Array(BLOCK), throttle: new Float32Array(BLOCK) };
  // The wasm initialises asynchronously: the processor is silent and builds its generator on the first block after it.
  while (processor.soundGenerator === null) {
    await nextTurn();
    processor.process([], out, idle);
  }
  processor.port.onmessage?.({ data: toneMessage(cls, stage, SAMPLE_RATE) });
  const tilt = new Float64Array(3);
  channelGains(tilt, cls);
  const levels: Level[] = [];
  for (const rev of REVS) {
    const parameters = { rpm: new Float32Array(BLOCK).fill(motorRpm(cls, rev, 1)), throttle: new Float32Array(BLOCK) };
    let peak = 0;
    let squares = 0;
    for (let block = 0; block < SETTLE_BLOCKS + MEASURE_BLOCKS; block++) {
      scope.currentFrame += BLOCK;
      processor.process([], out, parameters);
      if (block < SETTLE_BLOCKS) continue;
      for (let i = 0; i < BLOCK; i++) {
        const sample = (out[0]![0]![i]! * tilt[0]! + out[1]![0]![i]! * tilt[1]! + out[2]![0]![i]! * tilt[2]!) * MOTOR_OUTPUT_GAIN;
        peak = Math.max(peak, Math.abs(sample));
        squares += sample * sample;
      }
    }
    levels.push({ peak, rms: Math.sqrt(squares / (MEASURE_BLOCKS * BLOCK)) });
  }
  return levels;
}

describe("given each vehicle class's voice, rendered by the shipped worklet at every damage stage", () => {
  for (const cls of VEHICLE_CLASS_IDS) {
    for (const stage of STAGES) {
      it(`when the ${cls} runs ${stage} from idle to redline, then no moment passes -6 dBFS and it is never thin`, async () => {
        const levels = await voiceLevels(cls, stage);
        assert.ok(Math.max(...levels.map((l) => l.peak)) <= VOICE_PEAK_LIMIT, `${cls} ${stage} peaks ${levels.map((l) => l.peak.toFixed(3)).join(" ")}`);
        assert.ok(Math.min(...levels.map((l) => l.rms)) >= VOICE_RMS_MIN, `${cls} ${stage} rms ${levels.map((l) => l.rms.toFixed(3)).join(" ")}`);
      });
    }
    it(`when the ${cls} is at its redline healthy, then its peak sits in the -18 to -8 dBFS band around -12`, async () => {
      const redline = (await voiceLevels(cls, "healthy")).at(-1)!;
      assert.ok(redline.peak >= REDLINE_PEAK_MIN && redline.peak <= REDLINE_PEAK_MAX, `${cls} redline peak ${redline.peak.toFixed(3)}`);
    });
  }
});
