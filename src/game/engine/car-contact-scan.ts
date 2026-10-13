import type * as THREE from "three";
import type { DeformableCar } from "../vehicle/car.ts";

/** First pair of overlapping crush masses between two cars (within 6 m): writes their midpoint to `contact` and the unit normal pointing from B to A to `normal`. */
export function firstMassContact(cars: readonly DeformableCar[], contact: THREE.Vector3, normal: THREE.Vector3): boolean {
  for (let i = 0; i < cars.length; i++) {
    const ca = cars[i]!;
    const massesA = ca.deform.masses;
    for (let j = i + 1; j < cars.length; j++) {
      const cb = cars[j]!;
      const dxg = ca.group.position.x - cb.group.position.x;
      const dzg = ca.group.position.z - cb.group.position.z;
      if (dxg * dxg + dzg * dzg > 36) continue;
      const massesB = cb.deform.masses;
      for (let ia = 0, nA = massesA.length; ia < nA; ia++) {
        const a = massesA[ia]!;
        const ax = a.world.x;
        const ay = a.world.y;
        const az = a.world.z;
        const ar = a.radius;
        for (let ib = 0, nB = massesB.length; ib < nB; ib++) {
          const b = massesB[ib]!;
          const dx = ax - b.world.x;
          const dy = ay - b.world.y;
          const dz = az - b.world.z;
          const maxR = ar + b.radius + 0.08;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= maxR * maxR || d2 < 1e-10) continue;
          const dist = Math.sqrt(d2);
          contact.set((ax + b.world.x) * 0.5, (ay + b.world.y) * 0.5, (az + b.world.z) * 0.5);
          normal.set(dx / dist, dy / dist, dz / dist);
          return true;
        }
      }
    }
  }
  return false;
}
