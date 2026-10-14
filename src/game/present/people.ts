import * as THREE from "three";
import type { DriverLook } from "./driver-look.ts";
import { JOINTS, PARTS, SHOULDER_Y } from "./ragdoll-body.ts";
import { DummyMesh } from "./ragdoll-mesh.ts";

/** The limbs' joints standing (m, feet at y = 0), off `JOINTS`: shoulders, elbows, hips, knees, each side. */
const SHOULDER = JOINTS[1]!;
const ELBOW = JOINTS[2]!;
const HIP = JOINTS[5]!;
const KNEE = JOINTS[6]!;
/** Body parts (`PARTS`) by limb: upper and lower arm, thigh and shin, for the figure's right side (-x) and left (+x). */
const ARM_UPPER = [2, 4] as const;
const ARM_LOWER = [3, 5] as const;
const THIGH = [6, 8] as const;
const SHIN = [7, 9] as const;
/** The side the gun is held on (index into the limb tables): his right hand. */
const GUN_SIDE = 0;
/** A handgun (m): across, along the arm, and how far its muzzle stands past the hand. */
const GUN = { w: 0.05, len: 0.22, depth: 0.1, muzzle: 0.14 };
/** How long (s) a muzzle flash and a shot's tracer show: a frame or three at 60 Hz. */
const FLASH_S = 0.05;
const TRACER_S = 0.07;
/** Most tracers in the air at once. */
const TRACERS = 24;
/** A muzzle flash's radius (m) and its colour; a tracer's colour (sRGB). */
const FLASH_R = 0.14;
const FLASH_RGB = 0xfff1b8;
const TRACER_RGB = 0xffcf6a;
/** Arm and leg swing (rad) at a walk's widest, and the knee's bend on the leg swinging through (guessed, by eye). */
const LEG_SWING = 0.5;
const ARM_SWING = 0.4;
const KNEE_BEND = 0.6;
/** Seated: the thighs level forward, the shins hanging, the forearms forward over the lap (rad). */
const SIT = { thigh: -Math.PI / 2, knee: Math.PI / 2, arm: -0.35, elbow: -0.9 };
/** Aiming: the gun arm straight out level, the other hand up under it (rad). */
const AIM = { arm: -Math.PI / 2, elbow: 0, support: -1.2, supportElbow: -0.5 };

const X = new THREE.Vector3(1, 0, 0);
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _gun = new THREE.Quaternion();
const _c = new THREE.Vector3();
const _j = new THREE.Vector3();
const _k = new THREE.Vector3();
const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** A figure's limb angles (rad, about his own x axis; negative swings a limb forward), shoulders, elbows, hips and knees per side. */
type Stance = { arm: [number, number]; elbow: [number, number]; thigh: [number, number]; knee: [number, number] };

/** A blank stance: standing straight. */
export function blankStance(): Stance {
  return { arm: [0, 0], elbow: [0, 0], thigh: [0, 0], knee: [0, 0] };
}

/** A walk's stance at stride phase `phase` (rad: a whole stride per 2π), `aiming` with the gun arm out level. */
export function walkStance(phase: number, aiming: boolean, out: Stance): Stance {
  const s = Math.sin(phase);
  out.thigh[0] = -LEG_SWING * s;
  out.thigh[1] = LEG_SWING * s;
  out.knee[0] = KNEE_BEND * Math.max(0, s);
  out.knee[1] = KNEE_BEND * Math.max(0, -s);
  out.arm[0] = aiming ? AIM.arm : ARM_SWING * s;
  out.arm[1] = aiming ? AIM.support : -ARM_SWING * s;
  out.elbow[0] = aiming ? AIM.elbow : -0.2;
  out.elbow[1] = aiming ? AIM.supportElbow : -0.2;
  return out;
}

/** Sitting in a seat, hands in the lap. */
export function seatedStance(out: Stance): Stance {
  for (let side = 0; side < 2; side++) {
    out.thigh[side] = SIT.thigh;
    out.knee[side] = SIT.knee;
    out.arm[side] = SIT.arm;
    out.elbow[side] = SIT.elbow;
  }
  return out;
}

/**
 * The course's people drawn (the guards of `lawn-squad.ts`, the VIP of `vip-escort.ts`): the thrown dummy's body
 * (`DummyMesh`, `PARTS`) posed by hand instead of by Rapier, standing, walking, aiming or seated, each slot in its own look; a
 * handgun in each aiming hand, its muzzle flash and the shot's tracer. Cosmetic only.
 */
export class People {
  readonly group = new THREE.Group();
  private readonly mesh: DummyMesh;
  private readonly guns: THREE.InstancedMesh;
  private readonly flashes: THREE.InstancedMesh;
  private readonly tracers: THREE.LineSegments;
  private readonly tracerAt: Float32Array;
  private readonly tracerAge = new Float32Array(TRACERS).fill(Infinity);
  private readonly flashAge: Float32Array;
  private readonly muzzles: Float32Array;
  private tracerNext = 0;

  constructor(slots: number) {
    this.mesh = new DummyMesh(slots);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.guns = new THREE.InstancedMesh(new THREE.BoxGeometry(GUN.w, GUN.len, GUN.depth), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.6 }), slots);
    this.flashes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(FLASH_R), new THREE.MeshBasicMaterial({ color: FLASH_RGB, toneMapped: false }), slots);
    for (const m of [this.guns, this.flashes]) {
      m.frustumCulled = false;
      for (let i = 0; i < slots; i++) m.setMatrixAt(i, HIDDEN);
    }
    this.flashAge = new Float32Array(slots).fill(Infinity);
    this.muzzles = new Float32Array(slots * 3);
    this.tracerAt = new Float32Array(TRACERS * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.tracerAt, 3));
    this.tracers = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: TRACER_RGB, toneMapped: false, transparent: true, opacity: 0.85 }));
    this.tracers.frustumCulled = false;
    this.group.add(this.mesh, this.guns, this.flashes, this.tracers);
  }

  dress(slot: number, cop: boolean, look: DriverLook): void {
    this.mesh.dress(slot, cop, look);
  }

  /** Slot `slot` standing on (x, y, z) facing `yaw` (forward (sin yaw, cos yaw)) in `stance`, the gun out when `armed`. */
  stand(slot: number, x: number, y: number, z: number, yaw: number, stance: Stance, armed: boolean): void {
    _turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.pose(slot, _hand.set(x, y, z), _turn, stance, armed);
  }

  /** Slot `slot` in `stance` with his feet's origin at `root`, turned `turn` (his +z forward), the gun out when `armed`. */
  pose(slot: number, root: THREE.Vector3, turn: THREE.Quaternion, stance: Stance, armed: boolean): void {
    this.part(slot, 0, root, turn, _c.fromArray(PARTS[0]!.c), _qa.identity());
    this.part(slot, 1, root, turn, _c.fromArray(PARTS[1]!.c), _qa.identity());
    for (let side = 0; side < 2; side++) {
      this.limb(slot, root, turn, side === 0 ? -1 : 1, SHOULDER, ELBOW, ARM_UPPER[side], ARM_LOWER[side], stance.arm[side]!, stance.elbow[side]!);
      this.limb(slot, root, turn, side === 0 ? -1 : 1, HIP, KNEE, THIGH[side], SHIN[side], stance.thigh[side]!, stance.knee[side]!);
    }
    if (!armed) {
      this.guns.setMatrixAt(slot, HIDDEN);
      this.guns.instanceMatrix.needsUpdate = true;
      return;
    }
    // The hand at the forearm's far end, the gun along it, its muzzle past the hand.
    this.handAt(root, turn, stance, _c);
    _gun.copy(turn).multiply(_qb.setFromAxisAngle(X, stance.arm[GUN_SIDE]! + stance.elbow[GUN_SIDE]!));
    _dir.set(0, -1, 0).applyQuaternion(_gun);
    this.guns.setMatrixAt(slot, _m.compose(_s.copy(_c).addScaledVector(_dir, GUN.len / 2 - 0.04), _gun, _r.set(1, 1, 1)));
    this.guns.instanceMatrix.needsUpdate = true;
    _s.copy(_c).addScaledVector(_dir, GUN.muzzle + GUN.len / 2).toArray(this.muzzles, slot * 3);
  }

  /** Slot `slot`'s gun fires at (x, y, z): its muzzle flashes and a tracer runs from the muzzle to the point. */
  fire(slot: number, x: number, y: number, z: number): void {
    this.flashAge[slot] = 0;
    const k = this.tracerNext;
    this.tracerNext = (k + 1) % TRACERS;
    this.tracerAge[k] = 0;
    for (let i = 0; i < 3; i++) this.tracerAt[k * 6 + i] = this.muzzles[slot * 3 + i]!;
    this.tracerAt[k * 6 + 3] = x;
    this.tracerAt[k * 6 + 4] = y;
    this.tracerAt[k * 6 + 5] = z;
  }

  /** Where slot `slot`'s muzzle stood at its last pose. */
  muzzle(slot: number, out: THREE.Vector3): THREE.Vector3 {
    return out.fromArray(this.muzzles, slot * 3);
  }

  hide(slot: number): void {
    this.mesh.hide(slot);
    this.guns.setMatrixAt(slot, HIDDEN);
    this.guns.instanceMatrix.needsUpdate = true;
  }

  /** Once per frame after the poses: the flashes and tracers age `dt` s and go out. */
  update(dt: number): void {
    for (let s = 0; s < this.flashAge.length; s++) {
      this.flashAge[s] = this.flashAge[s]! + dt;
      const on = this.flashAge[s]! <= FLASH_S;
      this.flashes.setMatrixAt(s, on ? _m.makeTranslation(this.muzzles[s * 3]!, this.muzzles[s * 3 + 1]!, this.muzzles[s * 3 + 2]!) : HIDDEN);
    }
    this.flashes.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < TRACERS; k++) {
      this.tracerAge[k] = this.tracerAge[k]! + dt;
      if (this.tracerAge[k]! > TRACER_S) this.tracerAt.fill(0, k * 6, k * 6 + 6);
    }
    this.tracers.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    for (const m of [this.guns, this.flashes]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.tracers.geometry.dispose();
    (this.tracers.material as THREE.Material).dispose();
  }

  /** Body part `k` whose centre stands at `at` in his frame, turned `local` in it. */
  private part(slot: number, k: number, root: THREE.Vector3, turn: THREE.Quaternion, at: THREE.Vector3, local: THREE.Quaternion): void {
    _p.copy(at).applyQuaternion(turn).add(root);
    this.mesh.pose(slot, k, _p, _q.copy(turn).multiply(local));
  }

  /** A two-part limb from joint `top` through joint `mid`, its upper part swung `a` and its lower `a + b` about his x axis. */
  private limb(slot: number, root: THREE.Vector3, turn: THREE.Quaternion, side: number, top: readonly number[], mid: readonly number[], upper: number, lower: number, a: number, b: number): void {
    _j.set(side * Math.abs(top[2]!), top[3]!, top[4]!);
    _qa.setFromAxisAngle(X, a);
    const cu = PARTS[upper]!.c;
    _r.set(cu[0] - _j.x, cu[1] - _j.y, cu[2] - _j.z).applyQuaternion(_qa).add(_j);
    this.part(slot, upper, root, turn, _r, _qa);
    _k.set(side * Math.abs(mid[2]!), mid[3]!, mid[4]!).sub(_j).applyQuaternion(_qa).add(_j);
    _qb.setFromAxisAngle(X, a + b);
    const cl = PARTS[lower]!.c;
    _r.set(cl[0] - side * Math.abs(mid[2]!), cl[1] - mid[3]!, cl[2] - mid[4]!).applyQuaternion(_qb).add(_k);
    this.part(slot, lower, root, turn, _r, _qb);
  }

  /** The gun hand's place (world): the gun arm's elbow, then the forearm's length on. */
  private handAt(root: THREE.Vector3, turn: THREE.Quaternion, stance: Stance, out: THREE.Vector3): THREE.Vector3 {
    const side = GUN_SIDE === 0 ? -1 : 1;
    _j.set(side * Math.abs(SHOULDER[2]!), SHOULDER_Y, 0);
    _qa.setFromAxisAngle(X, stance.arm[GUN_SIDE]!);
    _k.set(0, ELBOW[3]! - SHOULDER_Y, 0).applyQuaternion(_qa).add(_j);
    _qb.setFromAxisAngle(X, stance.arm[GUN_SIDE]! + stance.elbow[GUN_SIDE]!);
    return out.set(0, -(ELBOW[3]! - PARTS[ARM_LOWER[GUN_SIDE]]!.c[1]) * 2, 0).applyQuaternion(_qb).add(_k).applyQuaternion(turn).add(root);
  }
}
