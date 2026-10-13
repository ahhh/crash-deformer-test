import { REV_IDLE, VEHICLE_CLASS_IDS, type DamageStage, type VehicleClassId } from "../vehicle/vehicle-classes.ts";

/** Share of the gas that revs a standing or airborne car above idle (`motorRev`): the gauge's fake revs know only speed. */
const FREE_REV_SHARE = 0.35;
/** Forward acceleration (m/s²) that reads as full load on a car with no pedal (a netplay client's cars carry no `drive`). */
const LOAD_ACCEL = 4;
/** Slow-mo pitches the engines down by the presented-time rate, but no lower than this share of their pitch. */
const SLOWMO_PITCH_FLOOR = 0.25;
/** The generator's raw output is loud; this is the upstream demo's master gain. The calibration knob for engine loudness. */
const MOTOR_OUTPUT_GAIN = 0.1;
/** Seconds a dead or stalled engine takes to wind down to rpm 0. */
export const DIE_DOWN_S = 0.8;

/** The generator's waveguide lengths are in samples at this rate (the upstream demo's); other rates scale them. */
const TONE_SAMPLE_RATE = 44100;
/** Reflection factors the generator's demo uses for every class: open ends reflect little, closed ends nearly all. */
const OPEN_REFLECTION = 0.01;
const CLOSED_REFLECTION = 0.95;

/** One class's engine: the generator's parameters (lengths in samples at `TONE_SAMPLE_RATE`), its rpm range and its channel mix. */
interface ClassTone {
  cylinders: number;
  idleRpm: number;
  redlineRpm: number;
  intake: number;
  exhaust: number;
  extractor: number;
  ignition: number;
  straightPipe: number;
  mufflers: readonly number[];
  action: number;
  outlet: number;
  /** Intake, engine block and outlet channel levels (before `MOTOR_OUTPUT_GAIN`). */
  gains: readonly [number, number, number];
}

/** Starting values, tuned by ear. Every field stays inside the generator's ranges (a test pins them). */
const CLASS_TONE: Readonly<Record<VehicleClassId, ClassTone>> = {
  sedan: { cylinders: 4, idleRpm: 850, redlineRpm: 6800, intake: 100, exhaust: 100, extractor: 100, ignition: 0.016, straightPipe: 128, mufflers: [10, 15, 20, 25], action: 0.1, outlet: 5, gains: [0.6, 0.4, 1.0] },
  police: { cylinders: 6, idleRpm: 800, redlineRpm: 7000, intake: 90, exhaust: 90, extractor: 110, ignition: 0.014, straightPipe: 140, mufflers: [10, 15, 20, 25], action: 0.1, outlet: 5, gains: [0.7, 0.4, 1.1] },
  muscle: { cylinders: 8, idleRpm: 700, redlineRpm: 6200, intake: 110, exhaust: 130, extractor: 120, ignition: 0.02, straightPipe: 170, mufflers: [12, 18, 24, 30], action: 0.12, outlet: 8, gains: [0.5, 0.5, 1.3] },
  truck: { cylinders: 6, idleRpm: 650, redlineRpm: 5000, intake: 130, exhaust: 150, extractor: 140, ignition: 0.022, straightPipe: 220, mufflers: [14, 20, 26, 32], action: 0.08, outlet: 10, gains: [0.4, 0.7, 1.0] },
  monster: { cylinders: 8, idleRpm: 600, redlineRpm: 5500, intake: 140, exhaust: 170, extractor: 160, ignition: 0.025, straightPipe: 260, mufflers: [16, 24, 32, 40], action: 0.14, outlet: 12, gains: [0.4, 0.8, 1.4] },
};

/**
 * What a damage stage does to the sound: misfires per second, rpm jitter (share), the muffling lowpass (Hz), the ignition-time
 * multiplier, and which of the `TONE_STAGES` generator tunings it plays (a dented engine sounds like a healthy one: no re-tune, no click).
 */
interface DamageTone {
  misfirePerS: number;
  rpmJitter: number;
  cutoffHz: number;
  ignitionScale: number;
  toneIndex: number;
}

/** A healthy engine is clean; a dead one is never heard (it winds down to silence), its row only keeps the table total. */
const DAMAGE_TONE: Readonly<Record<DamageStage, DamageTone>> = {
  healthy: { misfirePerS: 0, rpmJitter: 0, cutoffHz: 20000, ignitionScale: 1, toneIndex: 0 },
  dented: { misfirePerS: 0, rpmJitter: 0, cutoffHz: 20000, ignitionScale: 1, toneIndex: 0 },
  damaged: { misfirePerS: 0.6, rpmJitter: 0.02, cutoffHz: 9000, ignitionScale: 1.25, toneIndex: 1 },
  limping: { misfirePerS: 3, rpmJitter: 0.06, cutoffHz: 3500, ignitionScale: 1.6, toneIndex: 2 },
  dead: { misfirePerS: 0, rpmJitter: 0, cutoffHz: 3500, ignitionScale: 1.6, toneIndex: 2 },
};

/** The stage each generator tuning (`DamageTone.toneIndex`) is built from. */
const TONE_STAGES: readonly DamageStage[] = ["healthy", "damaged", "limping"];
/** How many tunings a class has: `toneMessages` holds `class index * TONE_STAGES.length + toneIndex`. */
export const TONE_COUNT = TONE_STAGES.length;

/** The generator's `processorOptions` (camelCase), lengths scaled to the context's sample rate. */
export interface ToneOptions {
  cylinders: number;
  intakeWaveguideLength: number;
  exhaustWaveguideLength: number;
  extractorWaveguideLength: number;
  intakeOpenReflectionFactor: number;
  intakeClosedReflectionFactor: number;
  exhaustOpenReflectionFactor: number;
  exhaustClosedReflectionFactor: number;
  ignitionTime: number;
  straightPipeWaveguideLength: number;
  straightPipeReflectionFactor: number;
  mufflerElementsLength: number[];
  action: number;
  outletWaveguideLength: number;
  outletReflectionFactor: number;
}

/** The generator's port message (snake_case): the same parameters, rebuilding all waveguide state. */
export interface ToneMessage {
  cylinder_count: number;
  intake_waveguide_length: number;
  exhaust_waveguide_length: number;
  extractor_waveguide_length: number;
  intake_open_reflection_factor: number;
  intake_closed_reflection_factor: number;
  exhaust_open_reflection_factor: number;
  exhaust_closed_reflection_factor: number;
  ignition_time: number;
  straight_pipe_waveguide_length: number;
  straight_pipe_reflection_factor: number;
  muffler_elements_length: number[];
  action: number;
  outlet_waveguide_length: number;
  outlet_reflection_factor: number;
}

export function damageTone(stage: DamageStage): DamageTone {
  return DAMAGE_TONE[stage];
}

/** Revs 0-1 of the dial: the gauge's, lifted by the gas so a standing or airborne car still revs. */
export function motorRev(gaugeRev: number, load: number): number {
  return Math.max(gaugeRev, REV_IDLE + FREE_REV_SHARE * load);
}

/** A car's forward acceleration (m/s²) as load 0-1, from two samples of its speed along its heading `dt` apart. */
export function accelLoad(along: number, prevAlong: number, dt: number): number {
  return Math.min(1, Math.max(0, (along - prevAlong) / dt / LOAD_ACCEL));
}

/** Engine load 0-1: boost is full, else the pedal (reverse too), else how hard the car is being accelerated. */
export function motorLoad(throttle: number, boost: boolean, accel: number): number {
  return boost ? 1 : Math.max(Math.abs(throttle), accel);
}

/** Real engine rpm for the generator: the class's idle at `REV_IDLE` up to its redline at 1, pitched down by slow-mo's `rate`. */
export function motorRpm(cls: VehicleClassId, rev: number, rate: number): number {
  const tone = CLASS_TONE[cls];
  const rpm = tone.idleRpm + ((tone.redlineRpm - tone.idleRpm) * (rev - REV_IDLE)) / (1 - REV_IDLE);
  return rpm * Math.max(SLOWMO_PITCH_FLOOR, rate);
}

/** Writes the intake, engine-block and outlet levels (already scaled by `MOTOR_OUTPUT_GAIN`) into `out[0..2]`. */
export function channelGains(out: Float64Array, cls: VehicleClassId, load: number, rev: number): void {
  const gains = CLASS_TONE[cls].gains;
  out[0] = gains[0] * (0.25 + 0.75 * load) * MOTOR_OUTPUT_GAIN;
  out[1] = gains[1] * (0.6 + 0.4 * rev) * MOTOR_OUTPUT_GAIN;
  out[2] = gains[2] * (0.4 + 0.6 * load) * MOTOR_OUTPUT_GAIN;
}

function samples(length: number, sampleRate: number): number {
  return Math.max(1, Math.round((length * sampleRate) / TONE_SAMPLE_RATE));
}

/** The class's `processorOptions` for a context at `sampleRate`. Built once per class at unlock. */
export function toneOptions(cls: VehicleClassId, sampleRate: number): ToneOptions {
  const t = CLASS_TONE[cls];
  return {
    cylinders: t.cylinders,
    intakeWaveguideLength: samples(t.intake, sampleRate),
    exhaustWaveguideLength: samples(t.exhaust, sampleRate),
    extractorWaveguideLength: samples(t.extractor, sampleRate),
    intakeOpenReflectionFactor: OPEN_REFLECTION,
    intakeClosedReflectionFactor: CLOSED_REFLECTION,
    exhaustOpenReflectionFactor: OPEN_REFLECTION,
    exhaustClosedReflectionFactor: CLOSED_REFLECTION,
    ignitionTime: t.ignition,
    straightPipeWaveguideLength: samples(t.straightPipe, sampleRate),
    straightPipeReflectionFactor: OPEN_REFLECTION,
    mufflerElementsLength: t.mufflers.map((m) => samples(m, sampleRate)),
    action: t.action,
    outletWaveguideLength: samples(t.outlet, sampleRate),
    outletReflectionFactor: OPEN_REFLECTION,
  };
}

/** The port message that retunes a voice to the class at the damage stage (a worn engine fires slower). Built once per pair at unlock. */
export function toneMessage(cls: VehicleClassId, stage: DamageStage, sampleRate: number): ToneMessage {
  const t = CLASS_TONE[cls];
  return {
    cylinder_count: t.cylinders,
    intake_waveguide_length: samples(t.intake, sampleRate),
    exhaust_waveguide_length: samples(t.exhaust, sampleRate),
    extractor_waveguide_length: samples(t.extractor, sampleRate),
    intake_open_reflection_factor: OPEN_REFLECTION,
    intake_closed_reflection_factor: CLOSED_REFLECTION,
    exhaust_open_reflection_factor: OPEN_REFLECTION,
    exhaust_closed_reflection_factor: CLOSED_REFLECTION,
    ignition_time: t.ignition * DAMAGE_TONE[stage].ignitionScale,
    straight_pipe_waveguide_length: samples(t.straightPipe, sampleRate),
    straight_pipe_reflection_factor: OPEN_REFLECTION,
    muffler_elements_length: t.mufflers.map((m) => samples(m, sampleRate)),
    action: t.action,
    outlet_waveguide_length: samples(t.outlet, sampleRate),
    outlet_reflection_factor: OPEN_REFLECTION,
  };
}

/** Every tuning message, built once at unlock: index `class index (VEHICLE_CLASS_IDS) * TONE_COUNT + DamageTone.toneIndex`. */
export function toneMessages(sampleRate: number): ToneMessage[] {
  const messages: ToneMessage[] = [];
  for (const cls of VEHICLE_CLASS_IDS) {
    for (const stage of TONE_STAGES) messages.push(toneMessage(cls, stage, sampleRate));
  }
  return messages;
}
