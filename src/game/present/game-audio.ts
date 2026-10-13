import * as THREE from "three";
import type { DeformableCar } from "../vehicle/car.ts";
import { crashDuck, engineDuck, musicGain, slowmoCutoff } from "./audio-mix.ts";
import { lowpass, MotorSound } from "./motor-sound.ts";
import { MusicPlayer } from "./music.ts";
import { musicBase } from "./music-manifest.ts";

const LATENCY_HINT = "interactive";
/** Time constant of the master gain ramp when audio is toggled. */
const MASTER_TAU_S = 0.05;
/** Time constant (s) of the engine bus's pause fade and of the slow-mo lowpass following the time rate. */
const BUS_TAU_S = 0.08;
/** The music's duck follows the engine fast enough to feel the throttle and a crash at once. */
const DUCK_TAU_S = 0.1;
const CRASH_DUCK_TAU_S = 0.02;
const THUMP_GAIN_PER_IMPULSE = 0.012;
/** `?voices=N` (0-8) overrides the engine voice count: the bench knob; 0 is no engine audio. */
const VOICES_PARAM = "voices";
const MAX_VOICES = 8;
/** Engine voices without the override: each is up to 38 waveguides of simple per-sample maths. The phone figure is calibrated (docs/TOOLCHAIN.md). */
const DESKTOP_VOICES = 6;
const PHONE_VOICES = 3;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** The engine voice count: the `?voices=` override, else by device (the same desktop flag as the lamp pool). */
function voiceSlots(desktop: boolean): number {
  const asked = Number.parseInt(new URLSearchParams(window.location.search).get(VOICES_PARAM) ?? "", 10);
  if (Number.isNaN(asked)) return desktop ? DESKTOP_VOICES : PHONE_VOICES;
  return Math.min(MAX_VOICES, Math.max(0, asked));
}

/**
 * The one audio façade: a single AudioContext, the three listener on the camera, and the busses
 *
 *   listener.gain -> engineBus -> slowmoFilter -> master -> compressor -> destination
 *   impact one-shots -> impactBus ------------/
 *   music -> musicBus ------------------------/
 *
 * Nothing is built until `unlock()` runs inside a user gesture. Audio is presentation: it reads the game, never writes it.
 */
export class GameAudio {
  readonly desktop: boolean;
  private readonly camera: THREE.PerspectiveCamera;
  private context: AudioContext | null = null;
  private listener: THREE.AudioListener | null = null;
  private master: GainNode | null = null;
  private engineBus: GainNode | null = null;
  private slowmoFilter: BiquadFilterNode | null = null;
  private impactBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private motor: MotorSound | null = null;
  private music: MusicPlayer | null = null;
  private on = false;
  /** Whether the game is running (not paused or held): a pause fades the engines out, the music plays on. */
  private live = true;
  /** Slider levels; the engine pushes the real ones with `setVolumes` right after construction. */
  private musicLevel = 0;
  private engineLevel = 0;
  /** Seconds since the last crash (the music's crash duck); Infinity before the first. */
  private sinceImpactS = Infinity;
  private readonly onVisibility = (): void => {
    const context = this.context;
    if (!context) return;
    if (document.visibilityState === "hidden") {
      void context.suspend();
      this.music?.pause();
    } else if (this.on) {
      void context.resume();
      this.music?.play();
    }
  };

  constructor(camera: THREE.PerspectiveCamera, desktop: boolean) {
    this.camera = camera;
    this.desktop = desktop;
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get unlocked(): boolean {
    return this.context !== null;
  }

  /** Songs started so far (0 before the first) and the current one's "Artist – Title": the engine publishes both to the HUD's now-playing toast. */
  get trackSerial(): number {
    return this.music?.serial ?? 0;
  }

  get nowPlaying(): string {
    return this.music?.nowPlaying ?? "";
  }

  /** Builds the context and graph on the first call (a user gesture); later calls resume it. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor({ latencyHint: LATENCY_HINT });
    THREE.AudioContext.setContext(context);
    const listener = new THREE.AudioListener();
    this.camera.add(listener);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(context.destination);
    const master = context.createGain();
    master.gain.value = this.on ? 1 : 0;
    master.connect(compressor);

    const slowmoFilter = lowpass(context, slowmoCutoff(1));
    slowmoFilter.connect(master);
    const engineBus = context.createGain();
    engineBus.gain.value = this.live ? this.engineLevel : 0;
    engineBus.connect(slowmoFilter);
    listener.gain.disconnect();
    listener.gain.connect(engineBus);
    const impactBus = context.createGain();
    impactBus.connect(master);
    const musicBus = context.createGain();
    musicBus.gain.value = musicGain(this.musicLevel, 1, 1);
    musicBus.connect(master);

    this.context = context;
    this.listener = listener;
    this.master = master;
    this.engineBus = engineBus;
    this.slowmoFilter = slowmoFilter;
    this.impactBus = impactBus;
    this.musicBus = musicBus;
    const motor = new MotorSound(voiceSlots(this.desktop));
    this.motor = motor;
    motor.load(context, listener).catch((reason: Error) => console.warn("motor sound: unavailable", reason));
    this.music = new MusicPlayer(context, musicBus, musicBase(import.meta.env));
    if (this.on) this.music.play();
    void context.resume();
  }

  /** Audio on ramps the master up and resumes the context; off ramps it down and suspends. */
  setOn(on: boolean): void {
    this.on = on;
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 1 : 0, context.currentTime, MASTER_TAU_S);
    if (on) {
      void context.resume();
      this.music?.play();
    } else {
      void context.suspend();
      this.music?.pause();
    }
  }

  /** The slider levels: the music bus (capped by `musicGain`) and the engine bus. The engine pushes them at construction and on every change. */
  setVolumes(music: number, engine: number): void {
    this.musicLevel = music;
    this.engineLevel = engine;
    const context = this.context;
    if (!context || !this.musicBus || !this.engineBus) return;
    this.musicBus.gain.setTargetAtTime(musicGain(music, 1, 1), context.currentTime, MASTER_TAU_S);
    this.engineBus.gain.setTargetAtTime(this.live ? engine : 0, context.currentTime, MASTER_TAU_S);
  }

  /**
   * The per-frame seam (the engine calls it with audio on): moves the engine voices, and on each voice tick sets the engine
   * bus (silent while `live` is false), the slow-mo lowpass from `rate`, and the music's duck under the player's engine and a crash.
   * `cars` are the ones drawn (the reel's, while it plays); `priority` is the car that always has a voice.
   */
  frame(dt: number, cars: readonly DeformableCar[], priority: DeformableCar | null, rate: number, live: boolean): void {
    const context = this.context;
    const motor = this.motor;
    if (!context || !motor || !this.engineBus || !this.slowmoFilter || !this.musicBus) return;
    this.sinceImpactS += dt;
    this.live = live;
    if (!motor.update(dt, cars, this.camera, priority, rate, this.engineLevel === 0)) return;
    const now = context.currentTime;
    this.engineBus.gain.setTargetAtTime(live ? this.engineLevel : 0, now, BUS_TAU_S);
    this.slowmoFilter.frequency.setTargetAtTime(slowmoCutoff(rate), now, BUS_TAU_S);
    this.musicBus.gain.setTargetAtTime(musicGain(this.musicLevel, engineDuck(motor.playerLevel), crashDuck(this.sinceImpactS)), now, DUCK_TAU_S);
  }

  /** A scene reset: every engine voice fades out and frees its slot. */
  releaseVoices(): void {
    this.motor?.releaseVoices();
  }

  impact(impulse: number): void {
    const context = this.context;
    if (!context || !this.impactBus) return;
    const t = context.currentTime;
    this.sinceImpactS = 0;
    this.musicBus?.gain.setTargetAtTime(musicGain(this.musicLevel, engineDuck(this.motor?.playerLevel ?? 0), crashDuck(0)), t, CRASH_DUCK_TAU_S);
    const dur = 0.35 + Math.min(0.4, impulse * 0.01);

    const thump = context.createOscillator();
    const thumpG = context.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(48, t);
    thump.frequency.exponentialRampToValueAtTime(22, t + dur);
    thumpG.gain.setValueAtTime(Math.min(0.7, 0.22 + impulse * THUMP_GAIN_PER_IMPULSE), t);
    thumpG.gain.exponentialRampToValueAtTime(0.001, t + dur);
    thump.connect(thumpG).connect(this.impactBus);
    thump.start(t);
    thump.stop(t + dur);

    const noise = context.createBufferSource();
    const nbuf = context.createBuffer(1, context.sampleRate * 0.25, context.sampleRate);
    const data = nbuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    noise.buffer = nbuf;
    const ng = context.createGain();
    const bp = context.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    ng.gain.setValueAtTime(Math.min(0.45, 0.12 + impulse * 0.008), t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    noise.connect(bp).connect(ng).connect(this.impactBus);
    noise.start(t);
  }

  dispose(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.listener) this.camera.remove(this.listener);
    this.motor?.dispose();
    this.music?.dispose();
    void this.context?.close();
    this.context = null;
    this.listener = null;
    this.master = null;
    this.engineBus = null;
    this.slowmoFilter = null;
    this.impactBus = null;
    this.musicBus = null;
    this.motor = null;
    this.music = null;
    this.on = false;
    this.sinceImpactS = Infinity;
  }
}
