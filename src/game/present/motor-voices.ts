/** A held car is displaced only by a contender whose distance² is under this share of the farthest held car's: at least 30% closer. */
const SWAP_DIST_RATIO = 0.49;
/** Seconds a slot must have held its car before a closer contender may take it (the fix for slots swapping as ranks cross each frame). */
const MIN_HOLD_S = 0.75;

/**
 * Which cars the engine voices follow: `slots` voices, each holding one car index or -1. Pure typed arrays, no allocation per call.
 * The priority car always holds a slot; the rest take the nearest eligible cars, and a held car is displaced only by a car
 * clearly closer, once its slot has held it for a while. `swapped[s]` is set on every change; the caller clears it.
 */
export class VoicePool {
  readonly slots: number;
  /** Car index each slot holds, -1 when free. */
  readonly car: Int32Array;
  /** Seconds each slot has held its car. */
  readonly heldS: Float64Array;
  readonly swapped: Uint8Array;
  private readonly swapRatio: number;
  private readonly minHoldS: number;

  constructor(slots: number, swapRatio: number = SWAP_DIST_RATIO, minHoldS: number = MIN_HOLD_S) {
    this.slots = slots;
    this.car = new Int32Array(slots).fill(-1);
    this.heldS = new Float64Array(slots);
    this.swapped = new Uint8Array(slots);
    this.swapRatio = swapRatio;
    this.minHoldS = minHoldS;
  }

  /** `distSq[c]` is car c's squared distance to the listener, `Infinity` when it may not be heard; `priority` is -1 for none. */
  assign(distSq: Float64Array, count: number, priority: number, dt: number): void {
    const slots = this.slots;
    for (let s = 0; s < slots; s++) {
      const c = this.car[s]!;
      if (c < 0) continue;
      if (c >= count || distSq[c] === Infinity) this.take(s, -1);
      else this.heldS[s]! += dt;
    }
    if (priority >= 0 && priority < count && distSq[priority] !== Infinity && this.slotOf(priority) < 0) {
      const free = this.slotOf(-1);
      const slot = free >= 0 ? free : this.farthest(distSq, priority);
      if (slot >= 0) this.take(slot, priority);
    }
    for (;;) {
      let best = -1;
      for (let c = 0; c < count; c++) {
        if (distSq[c] === Infinity || this.slotOf(c) >= 0) continue;
        if (best < 0 || distSq[c]! < distSq[best]!) best = c;
      }
      if (best < 0) return;
      const free = this.slotOf(-1);
      if (free >= 0) {
        this.take(free, best);
        continue;
      }
      const far = this.farthest(distSq, priority);
      if (far < 0 || distSq[best]! >= this.swapRatio * distSq[this.car[far]!]! || this.heldS[far]! < this.minHoldS) return;
      this.take(far, best);
    }
  }

  /** Frees every slot (a scene reset); each is marked swapped so its voice fades out. */
  release(): void {
    for (let s = 0; s < this.slots; s++) {
      if (this.car[s]! >= 0) this.take(s, -1);
    }
  }

  private take(slot: number, car: number): void {
    this.car[slot] = car;
    this.heldS[slot] = 0;
    this.swapped[slot] = 1;
  }

  /** The slot holding `car` (-1 finds a free one), or -1. */
  slotOf(car: number): number {
    for (let s = 0; s < this.slots; s++) if (this.car[s] === car) return s;
    return -1;
  }

  /** The held slot whose car is farthest, never the priority car's; -1 when there is none. */
  private farthest(distSq: Float64Array, priority: number): number {
    let far = -1;
    for (let s = 0; s < this.slots; s++) {
      const c = this.car[s]!;
      if (c < 0 || c === priority) continue;
      if (far < 0 || distSq[c]! > distSq[this.car[far]!]!) far = s;
    }
    return far;
  }
}
