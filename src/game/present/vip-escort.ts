import * as THREE from "three";
import { hypot2 } from "../kernel/physics-core.js";
import type { DeformableCar } from "../vehicle/car.ts";
import type { Ground } from "../world/ground.ts";
import type { GuardSpec } from "../world/track-schema.ts";
import { insidePolygon } from "../world/terrain.ts";
import type { DriverLook } from "./driver-look.ts";
import { JOINTS } from "./ragdoll-body.ts";
import { blankStance, seatedStance, walkStance, type People } from "./people.ts";

/**
 * The VIP (owner, 2026-10-14: "a human model with blonde hair and a suit", then "should look like trump (a little portly, a specific
 * type of blond hair, maybe a blue suite)"): portly, in a navy-blue suit with a red tie, his golden-blond hair swept back.
 */
const VIP_LOOK: DriverLook = { woman: false, shirt: 0x1f3463, pants: 0x1f3463, hair: 0xe8bf6c, hat: null, mustache: false, portly: true };
/** His walk to the car (m/s, a brisk walk) and the metres a whole stride covers. */
const WALK = 2.2;
const STRIDE = 1.5;
/** He gets in once this close (m) to the passenger door's spot and the car is slower than `BOARD_SPEED` (m/s): it waits for him. */
const BOARD_REACH = 1.2;
const BOARD_SPEED = 2.5;
/** How far (m) outside the passenger door he stands to get in. */
const DOOR_OUT = 1.1;
/** He gives up and goes back in when the car is this far (m) from him and off the grounds. */
const GIVE_UP = 45;
/** In his seat: hips this far (m) in from the passenger window's middle, down from it, and back of it. */
const SEAT_IN = 0.42;
const SEAT_DOWN = 0.92;
const SEAT_BACK = 0.15;
/** His hips' height standing (m), off the dummy's hip joint: the feet's origin is this far under them. */
const HIP_Y = JOINTS[5]![3];

type Phase = "in" | "walking" | "riding" | "thrown";

const _pane = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _root = new THREE.Vector3();
const _door = new THREE.Vector3();

/**
 * The VIP, once the course's secret is out (the Konami code: the guards stay in). When the player drives onto the grounds he
 * walks out of the nearest door to the car's passenger door; once the car waits for him there he gets in and rides in the
 * passenger seat, until the driver is thrown out of the car (`DeformableCar.driverOut`): then he is thrown with him
 * (`throwPassenger`, the dummies' world) and the ride is over. Cosmetic only: the sim never knows he is there.
 */
export class VipEscort {
  private phase: Phase = "in";
  private car = -1;
  private x = 0;
  private z = 0;
  private yaw = 0;
  private stride = 0;
  private readonly stance = blankStance();
  private readonly spec: GuardSpec;
  private readonly ground: Ground;
  private readonly people: People;
  private readonly slot: number;

  constructor(spec: GuardSpec, ground: Ground, people: People, slot: number) {
    this.spec = spec;
    this.ground = ground;
    this.people = people;
    this.slot = slot;
    people.dress(slot, false, VIP_LOOK);
  }

  /** A race starts: he is back inside, whatever happened in the last one. */
  reset(): void {
    this.phase = "in";
    this.car = -1;
    this.people.hide(this.slot);
  }

  /** The car he rides in (-1: none): its driver's throw throws him too. */
  get ridingIn(): number {
    return this.phase === "riding" ? this.car : -1;
  }

  /**
   * One frame of `dt` s. `out`: the secret is out; `player`: the car this browser drives (-1 none); `throwPassenger` throws him out
   * of car `car` with its driver.
   */
  frame(dt: number, out: boolean, player: number, cars: readonly DeformableCar[], throwPassenger: (car: number, look: DriverLook) => void): void {
    const car = player >= 0 ? cars[player] : undefined;
    if (this.phase === "in") {
      if (!out || !car || !car.deform.drivetrainAlive || !insidePolygon(this.spec.lawn, car.group.position.x, car.group.position.z)) return;
      this.comeOut(player, car);
    }
    if (this.phase === "walking") this.walk(dt, cars);
    if (this.phase !== "riding") return;
    const ride = cars[this.car];
    if (!ride) return this.reset();
    if (ride.driverOut !== null) {
      throwPassenger(this.car, VIP_LOOK);
      this.phase = "thrown";
      this.people.hide(this.slot);
      return;
    }
    this.sit(ride);
  }

  /** Out of the door nearest the car, toward it. */
  private comeOut(player: number, car: DeformableCar): void {
    let best = Infinity;
    for (const d of this.spec.doors) {
      const far = hypot2(d.x - car.group.position.x, d.z - car.group.position.z);
      if (far >= best) continue;
      best = far;
      this.x = d.x;
      this.z = d.z;
      this.yaw = d.yaw;
    }
    this.car = player;
    this.phase = "walking";
  }

  /** A stride toward the car's passenger door; in when it waits for him there, back inside when it has left him. */
  private walk(dt: number, cars: readonly DeformableCar[]): void {
    const car = cars[this.car];
    if (!car) return this.reset();
    _door.set(1, 0, 0).applyQuaternion(car.group.quaternion).multiplyScalar(DOOR_OUT);
    car.glassWorld("doorR", _pane).add(_door);
    const dx = _pane.x - this.x;
    const dz = _pane.z - this.z;
    const left = hypot2(dx, dz);
    const gone = !insidePolygon(this.spec.lawn, car.group.position.x, car.group.position.z) && left > GIVE_UP;
    if (gone || !car.deform.drivetrainAlive) return this.reset();
    if (left < BOARD_REACH && car.speed < BOARD_SPEED) {
      this.phase = "riding";
      return;
    }
    const step = Math.min(left, WALK * dt);
    if (left > 1e-3) {
      this.x += (dx / left) * step;
      this.z += (dz / left) * step;
      this.yaw = Math.atan2(dx, dz);
    }
    this.stride += (step / STRIDE) * 2 * Math.PI;
    walkStance(this.stride, false, this.stance);
    this.people.stand(this.slot, this.x, this.ground.heightAt(this.x, this.z), this.z, this.yaw, this.stance, false);
  }

  /** In the passenger seat: hips in from the right-hand window, facing the car's way. */
  private sit(car: DeformableCar): void {
    const g = car.group;
    car.glassWorld("doorR", _pane).sub(g.position).applyQuaternion(_inv.copy(g.quaternion).invert());
    _root.set(_pane.x - SEAT_IN, _pane.y - SEAT_DOWN - HIP_Y, _pane.z - SEAT_BACK).applyQuaternion(g.quaternion).add(g.position);
    this.people.pose(this.slot, _root, g.quaternion, seatedStance(this.stance), false);
  }
}
