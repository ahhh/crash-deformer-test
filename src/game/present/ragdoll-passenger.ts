import * as THREE from "three";
import type { DeformableCar } from "../vehicle/car.ts";
import type { Doll } from "./ragdoll-body.ts";

/**
 * How far (m) from the driver's torso a passenger leaves: beside him toward the passenger side (car +x) out of the windshield,
 * a body length behind him out of a door (he follows the driver out of it).
 */
const BESIDE = 0.75;
const BEHIND = 0.8;

/** A throw's start: torso place, turn, velocity and spin (world). */
type ThrowStart = { p: THREE.Vector3; q: THREE.Quaternion; v: THREE.Vector3; w: THREE.Vector3 };

const _off = new THREE.Vector3();

/** A passenger thrown with `driver` (just out of `car`) into `out`: his torso's turn and motion, off his place by `BESIDE` or `BEHIND`. */
export function passengerThrow(driver: Doll, car: DeformableCar, out: ThrowStart): void {
  const c = driver.cur;
  const torso = driver.bodies[0]!;
  const v = torso.linvel();
  const w = torso.angvel();
  out.v.set(v.x, v.y, v.z);
  out.w.set(w.x, w.y, w.z);
  out.q.set(c[3]!, c[4]!, c[5]!, c[6]!);
  if (car.driverOut === "windshield" || car.driverOut === null) _off.set(BESIDE, 0, 0).applyQuaternion(car.group.quaternion);
  else _off.set(car.driverOut === "doorL" ? BEHIND : -BEHIND, 0, 0).applyQuaternion(car.group.quaternion);
  out.p.set(c[0]!, c[1]!, c[2]!).add(_off);
}
