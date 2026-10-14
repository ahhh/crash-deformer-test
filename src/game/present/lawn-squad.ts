import * as THREE from "three";
import { hypot2 } from "../kernel/physics-core.js";
import type { DeformableCar } from "../vehicle/car.ts";
import { NO_TARGET, SHOT_RING, type LawnGuard } from "../scenes/lawn-guard.ts";
import type { Ground } from "../world/ground.ts";
import type { GuardSpec } from "../world/track-schema.ts";
import { HAIRS, type DriverLook } from "./driver-look.ts";
import { blankStance, walkStance, type People } from "./people.ts";

/** How fast (m/s) the guards run out to their places and back (guessed: a sprint in kit). */
const RUN = 4.5;
/** Metres a whole stride covers at that run. */
const STRIDE = 1.8;
/** Their places off a door: the first rank this far out (m), the next ranks `RANK_GAP` further, `FILE_GAP` apart across a rank. */
const LINE_OUT = 7;
const RANK_GAP = 4;
const FILE_GAP = 4.5;
/** Seconds between one guard coming out of a door and the next. */
const STAGGER_S = 0.18;
/** How far (m) inside the door a guard appears, under the portico. */
const PORTICO_DEPTH = 3;
/** A guard this close (m) to where he is going is there. */
const ARRIVE = 0.3;
/** A plain-clothes agent: a black suit, dark hair (the other half of the squad wears the uniformed division's navy, `cop`). */
const AGENT: DriverLook = { woman: false, shirt: 0x16181d, pants: 0x16181d, hair: HAIRS[2]!, hat: null, mustache: false };
/** A shot's aim (m over the car's origin), and how far (m) a miss goes past it. */
const AIM_Y = 0.7;
const MISS_WIDE = 2.5;
/** The sparks a hit throws (`RaceHost.hitFx`'s impulse): a light knock. */
const HIT_SPARKS = 4;

const _at = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Vector3();

/**
 * The guards drawn (`LawnGuard` decides who fires and what hits): with the alarm up each runs out of his door, in turn, to his
 * place in the ranks before it, turns to the target and aims; each shot the sim fired flashes at its guard's muzzle and its tracer
 * runs to the car (a hit throws sparks off it) or past it. With the alarm down they run back in and are gone. Cosmetic only: the
 * walk is the frame's, not the sim's.
 */
export class GuardSquad {
  private readonly count: number;
  private readonly x: Float32Array;
  private readonly z: Float32Array;
  private readonly yaw: Float32Array;
  private readonly phase: Float32Array;
  private readonly out: Uint8Array;
  private readonly spotX: Float32Array;
  private readonly spotZ: Float32Array;
  private readonly homeX: Float32Array;
  private readonly homeZ: Float32Array;
  private readonly stance = blankStance();
  private drawn = 0;
  private readonly ground: Ground;
  private readonly people: People;

  constructor(spec: GuardSpec, ground: Ground, people: People) {
    this.ground = ground;
    this.people = people;
    const n = (this.count = spec.count);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    this.yaw = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.out = new Uint8Array(n);
    this.spotX = new Float32Array(n);
    this.spotZ = new Float32Array(n);
    this.homeX = new Float32Array(n);
    this.homeZ = new Float32Array(n);
    const doors = spec.doors.length;
    const perDoor = Math.ceil(n / doors);
    const perRank = Math.ceil(perDoor / 2);
    for (let i = 0; i < n; i++) {
      const d = spec.doors[i % doors]!;
      const j = Math.floor(i / doors);
      const fx = Math.sin(d.yaw);
      const fz = Math.cos(d.yaw);
      const rank = Math.floor(j / perRank);
      const file = (j % perRank) - (perRank - 1) / 2;
      this.spotX[i] = d.x + fx * (LINE_OUT + rank * RANK_GAP) + fz * file * FILE_GAP;
      this.spotZ[i] = d.z + fz * (LINE_OUT + rank * RANK_GAP) - fx * file * FILE_GAP;
      this.homeX[i] = d.x - fx * PORTICO_DEPTH;
      this.homeZ[i] = d.z - fz * PORTICO_DEPTH;
      this.yaw[i] = d.yaw;
      people.dress(i, i % 2 === 0, AGENT);
    }
  }

  /** A race starts: everyone inside, no shot drawn yet. */
  reset(): void {
    this.out.fill(0);
    this.drawn = 0;
    for (let i = 0; i < this.count; i++) this.people.hide(i);
  }

  /** One frame of `dt` s: the guards move and aim by the sim's alarm, and its new shots are drawn (`sparks` at a hit). */
  frame(dt: number, guard: LawnGuard, cars: readonly DeformableCar[], sparks: (at: THREE.Vector3, normal: THREE.Vector3, impulse: number) => void): void {
    if (guard.shots < this.drawn) this.drawn = 0;
    for (let i = 0; i < this.count; i++) this.move(i, dt, guard, cars);
    for (; this.drawn < guard.shots; this.drawn++) {
      if (guard.shots - this.drawn > SHOT_RING) continue;
      const k = this.drawn % SHOT_RING;
      const g = guard.shotGuard[k]!;
      const car = cars[guard.shotCar[k]!];
      if (!car || !this.out[g]) continue;
      this.people.muzzle(g, _m);
      _at.copy(car.group.position);
      _at.y += AIM_Y;
      _n.copy(_m).sub(_at).normalize();
      if (guard.shotHit[k]) {
        this.people.fire(g, _at.x, _at.y, _at.z);
        sparks(_at, _n, HIT_SPARKS);
        continue;
      }
      // A miss flies past the car, off to one side by the shot's number.
      _at.addScaledVector(_n, -MISS_WIDE).add(_m.set(_n.z, 0, -_n.x).multiplyScalar(this.drawn % 2 ? MISS_WIDE : -MISS_WIDE));
      this.people.fire(g, _at.x, _at.y, _at.z);
    }
  }

  private move(i: number, dt: number, guard: LawnGuard, cars: readonly DeformableCar[]): void {
    const called = guard.alarm >= Math.floor(i / 2) * STAGGER_S;
    if (called && !this.out[i]) {
      this.out[i] = 1;
      this.x[i] = this.homeX[i]!;
      this.z[i] = this.homeZ[i]!;
    }
    if (!this.out[i]) return;
    const goX = called ? this.spotX[i]! : this.homeX[i]!;
    const goZ = called ? this.spotZ[i]! : this.homeZ[i]!;
    const dx = goX - this.x[i]!;
    const dz = goZ - this.z[i]!;
    const left = hypot2(dx, dz);
    if (!called && left < ARRIVE) {
      this.out[i] = 0;
      this.people.hide(i);
      return;
    }
    const target = guard.target !== NO_TARGET ? cars[guard.target] : undefined;
    const running = left >= ARRIVE;
    if (running) {
      const step = Math.min(left, RUN * dt);
      this.x[i] = this.x[i]! + (dx / left) * step;
      this.z[i] = this.z[i]! + (dz / left) * step;
      this.phase[i] = this.phase[i]! + (step / STRIDE) * 2 * Math.PI;
      this.yaw[i] = Math.atan2(dx, dz);
    } else if (target) {
      this.yaw[i] = Math.atan2(target.group.position.x - this.x[i]!, target.group.position.z - this.z[i]!);
    }
    const aiming = called && !running && target !== undefined;
    walkStance(running ? this.phase[i]! : 0, aiming, this.stance);
    const y = this.ground.heightAt(this.x[i]!, this.z[i]!);
    this.people.stand(i, this.x[i]!, y, this.z[i]!, this.yaw[i]!, this.stance, called);
  }
}
