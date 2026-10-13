import * as THREE from "three";
import { musicGain } from "./audio-mix.ts";

const LATENCY_HINT = "interactive";
/** Time constant of the master gain ramp when audio is toggled. */
const MASTER_TAU_S = 0.05;
const THUMP_GAIN_PER_IMPULSE = 0.012;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * The one audio façade: a single AudioContext, the three listener on the camera, and the busses
 *
 *   listener.gain -> engineBus ----> master -> compressor -> destination
 *   impact one-shots -> impactBus -/
 *   music -> musicBus ------------/
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
  private impactBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private on = false;
  /** Slider levels; the engine pushes the real ones with `setVolumes` right after construction. */
  private musicLevel = 0;
  private engineLevel = 0;
  private readonly onVisibility = (): void => {
    const context = this.context;
    if (!context) return;
    if (document.visibilityState === "hidden") void context.suspend();
    else if (this.on) void context.resume();
  };

  constructor(camera: THREE.PerspectiveCamera, desktop: boolean) {
    this.camera = camera;
    this.desktop = desktop;
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get unlocked(): boolean {
    return this.context !== null;
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

    const engineBus = context.createGain();
    engineBus.gain.value = this.engineLevel;
    engineBus.connect(master);
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
    this.impactBus = impactBus;
    this.musicBus = musicBus;
    void context.resume();
  }

  /** Audio on ramps the master up and resumes the context; off ramps it down and suspends. */
  setOn(on: boolean): void {
    this.on = on;
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 1 : 0, context.currentTime, MASTER_TAU_S);
    if (on) void context.resume();
    else void context.suspend();
  }

  /** The slider levels: the music bus (capped by `musicGain`) and the engine bus. The engine pushes them at construction and on every change. */
  setVolumes(music: number, engine: number): void {
    this.musicLevel = music;
    this.engineLevel = engine;
    const context = this.context;
    if (!context || !this.musicBus || !this.engineBus) return;
    this.musicBus.gain.setTargetAtTime(musicGain(music, 1, 1), context.currentTime, MASTER_TAU_S);
    this.engineBus.gain.setTargetAtTime(engine, context.currentTime, MASTER_TAU_S);
  }

  impact(impulse: number): void {
    const context = this.context;
    if (!context || !this.impactBus) return;
    const t = context.currentTime;
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
    void this.context?.close();
    this.context = null;
    this.listener = null;
    this.master = null;
    this.engineBus = null;
    this.impactBus = null;
    this.musicBus = null;
    this.on = false;
  }
}
