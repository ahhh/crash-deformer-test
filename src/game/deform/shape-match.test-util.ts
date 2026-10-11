import type { Mat3, ShapeCluster } from "./shape-match.ts";

type Vec = { x: number; y: number; z: number };

export function m3RotationAngle(R: Mat3): number {
  const tr = R[0]! + R[4]! + R[8]!;
  return Math.acos(Math.min(1, Math.max(-1, (tr - 1) * 0.5)));
}

export function transformSkinPointInto(c: ShapeCluster, x: number, y: number, z: number, out: Vec = { x: 0, y: 0, z: 0 }): Vec {
  const m = c.skinM;
  const dx = x - c.skinCm0x;
  const dy = y - c.skinCm0y;
  const dz = z - c.skinCm0z;
  out.x = m[0]! * dx + m[1]! * dy + m[2]! * dz + c.skinCmx;
  out.y = m[3]! * dx + m[4]! * dy + m[5]! * dz + c.skinCmy;
  out.z = m[6]! * dx + m[7]! * dy + m[8]! * dz + c.skinCmz;
  return out;
}

/** (skinM⁻¹)^T n, built on demand (no frame path transforms normals); n unchanged when skinM is singular. */
export function transformNormal(c: ShapeCluster, x: number, y: number, z: number, out: Vec = { x: 0, y: 0, z: 0 }): Vec {
  const m = c.skinM;
  const m0 = m[0]!, m1 = m[1]!, m2 = m[2]!, m3v = m[3]!, m4 = m[4]!, m5 = m[5]!, m6 = m[6]!, m7 = m[7]!, m8 = m[8]!;
  const c00 = m4 * m8 - m5 * m7, c01 = m5 * m6 - m3v * m8, c02 = m3v * m7 - m4 * m6;
  const det = m0 * c00 + m1 * c01 + m2 * c02;
  if (!(Math.abs(det) >= 1e-12)) {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
  }
  const i = 1 / det;
  out.x = (c00 * x + c01 * y + c02 * z) * i;
  out.y = ((m2 * m7 - m1 * m8) * x + (m0 * m8 - m2 * m6) * y + (m1 * m6 - m0 * m7) * z) * i;
  out.z = ((m1 * m5 - m2 * m4) * x + (m2 * m3v - m0 * m5) * y + (m0 * m4 - m1 * m3v) * z) * i;
  return out;
}
