import * as THREE from "three";
import { hypot2 } from "../kernel/physics-core.js";
import { lampEmissiveMap, makeLampUnit, type LampKind } from "./car-materials.ts";
import { activeGround, NO_FLOOR } from "../world/ground.ts";

/**
 * Lamp light pools, created once and only ever re-aimed or dimmed: adding, removing or hiding a light
 * changes three's lights hash and recompiles every lit material (32c53c1 dropped a 19-light shader
 * for a boot hang). Broken, off and unassigned lights sit at intensity 0. The pool size is chosen once at boot, before the
 * programs link (`CrashEngine`), never per FX tier or mid-race.
 */
export interface LampPool {
  readonly spots: number;
  readonly points: number;
}
export const FULL_POOL: LampPool = { spots: 4, points: 4 };
/** The lean pool a phone can opt into (`?lamps=lean`): every lit fragment loops over every light, and these are 4 of the 8 pooled ones. */
export const PHONE_POOL: LampPool = { spots: 2, points: 2 };

const HEAD = { color: 0xfff1d8, intensity: 40, distance: 22, angle: 0.5, penumbra: 0.55, decay: 2 };
const TAIL = { color: 0xff2414, intensity: 0.5, distance: 2.5, decay: 2 };
/** A lit siren washes the car and the road round it; it outranks every tail lamp but the followed car's. It sits
 *  `out` m over the lens: closer, it blew the lens itself out to orange under ACES (first cut: 6 at 0.3 m). */
const SIREN = { red: 0xff1810, blue: 0x2848ff, intensity: 3, distance: 8, out: 0.8, rank: 1e8 };
/** Headlamp aim: a point AIM m ahead dipped DIP m (≈5°), so the beam pools on the road. */
const AIM = 10;
const DIP = 0.9;
/** Offsets along the lamp axis from its seat on the skin (the lens face is at +0.045, `makeLampUnit`):
 *  the tail light washes the bumper and road rather than the boot floor; the glow sprite clears the lens. */
const TAIL_OUT = 0.5;
/** Glow sprite world size (m). */
const GLOW_SIZE = 0.7;
const GLOW_OUT = 0.1;
const GLOW_HEAD = [0.8, 0.7, 0.55] as const;
const GLOW_TAIL = [0.55, 0.03, 0.015] as const;
const GLOW_RED = [1, 0.06, 0.04] as const;
const GLOW_BLUE = [0.08, 0.2, 1] as const;

/** Fake pools. A headlamp's quad runs from the lamp's foot POOL_LEN times the way to where its beam meets the ground (to at most POOL_MAX m),
 *  POOL_WIDTH as wide as long; a tail lamp's is a TAIL_POOL m square straight back. Colours are the additive peak (the sprite's alpha
 *  shapes it); none is drawn beyond POOL_FAR_SQ (m², from the camera). */
const POOL_LEN = 1.5;
const POOL_MAX = 14;
const POOL_WIDTH = 0.45;
const TAIL_POOL = 2.6;
const POOL_LIFT = 0.02;
const POOL_FAR_SQ = 80 * 80;
const POOL_HEAD = [0.42, 0.36, 0.25] as const;
const POOL_TAIL = [0.3, 0.02, 0.01] as const;
/** A car's disc (m) for the middle-tile test, and the tile's half size in normalised device coordinates (a third of the viewport). */
const CAR_RADIUS = 2.4;
const MIDDLE_TILE = 1 / 3;
const NO_CARS: readonly never[] = [];

/** What a lamp slot shows: a body lamp, or a police light bar's red or blue siren. */
export type GlowKind = LampKind | "red" | "blue";

/** A lamp seated on one body-skin facet (see `anchorOnSkin`). */
export interface SkinAnchor {
  readonly verts: readonly [number, number, number];
  /** Barycentric weights of the lamp origin's projection onto the facet. */
  readonly w: readonly [number, number, number];
  /** Rest offset of the origin along the facet normal. */
  readonly h: number;
  /** Rest rotation of the lamp in the facet frame. */
  readonly rel: THREE.Quaternion;
}

/**
 * Anchor a lamp at `origin` / `rest` to the skin facet it sits on: the non-degenerate triangle of
 * the indexed `geo` nearest the origin, so its weights are in [0, 1] and the lamp rides that patch
 * of skin. Build-time only (one pass over the triangles).
 */
export function anchorOnSkin(geo: THREE.BufferGeometry, origin: THREE.Vector3, rest: THREE.Quaternion): SkinAnchor {
  const pos = geo.getAttribute("position").array;
  const index = geo.index?.array;
  if (!index) throw new Error("anchorOnSkin: the skin must be indexed");
  let best = -1;
  let bestD = Infinity;
  for (let t = 0; t < index.length; t += 3) {
    _tri.a.fromArray(pos, index[t]! * 3);
    _tri.b.fromArray(pos, index[t + 1]! * 3);
    _tri.c.fromArray(pos, index[t + 2]! * 3);
    if (_tri.getArea() < 1e-6) continue;
    const d = _tri.closestPointToPoint(origin, _e).distanceToSquared(origin);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (best < 0) throw new Error("anchorOnSkin: no skin facet");
  const verts = [index[best]!, index[best + 1]!, index[best + 2]!] as const;
  frameAt(pos, verts);
  THREE.Triangle.getBarycoord(origin, _a, _b, _c, _d);
  return {
    verts,
    w: [_d.x, _d.y, _d.z],
    h: _e.subVectors(origin, _a).dot(_n),
    rel: new THREE.Quaternion().setFromRotationMatrix(_m).invert().multiply(rest),
  };
}

/** Seat an anchored lamp on the current skin: origin = Σwᵢ·vᵢ + h·n, rotation = frame · rel. */
export function poseOnSkin(anchor: SkinAnchor, pos: ArrayLike<number>, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
  frameAt(pos, anchor.verts);
  const [wa, wb, wc] = anchor.w;
  outPos.copy(_a).multiplyScalar(wa).addScaledVector(_b, wb).addScaledVector(_c, wc).addScaledVector(_n, anchor.h);
  outQuat.setFromRotationMatrix(_m).multiply(anchor.rel);
}

/** Loads `_a/_b/_c` and the frame `_m` = (edge ab, n × ab, n) with unit normal `_n`. */
function frameAt(pos: ArrayLike<number>, [a, b, c]: readonly [number, number, number]): void {
  _a.fromArray(pos, a * 3);
  _b.fromArray(pos, b * 3);
  _c.fromArray(pos, c * 3);
  _t.subVectors(_b, _a).normalize();
  _n.crossVectors(_t, _d.subVectors(_c, _a)).normalize();
  _m.makeBasis(_t, _d.crossVectors(_n, _t), _n);
}

/** What the pool reads from a car; `DeformableCar` satisfies it. */
interface LampHost {
  readonly group: THREE.Object3D;
  readonly lampCount: number;
  /** Writes lamp `i`'s world seat on the skin and outward axis; returns its kind, or null once broken or dark. */
  lampWorld(i: number, pos: THREE.Vector3, dir: THREE.Vector3): GlowKind | null;
  /** Advance the siren flash to `now` (s); no-op without sirens on. */
  flashSirens(now: number): void;
}

/** The best `size` candidates by ascending score, in place: no allocation per offer. `id` is the caller's own tag (a stash slot, or -1). */
class Ranking {
  readonly score: Float64Array;
  readonly pos: THREE.Vector3[];
  readonly dir: THREE.Vector3[];
  readonly kind: GlowKind[];
  readonly id: Int32Array;
  readonly size: number;
  count = 0;

  constructor(size: number) {
    this.size = size;
    this.score = new Float64Array(size);
    this.id = new Int32Array(size);
    this.pos = Array.from({ length: size }, () => new THREE.Vector3());
    this.dir = Array.from({ length: size }, () => new THREE.Vector3());
    this.kind = Array.from({ length: size }, (): GlowKind => "tail");
  }

  offer(s: number, p: THREE.Vector3, d: THREE.Vector3, kind: GlowKind, id: number): void {
    const k = this.size;
    if (this.count === k && (k === 0 || s >= this.score[k - 1]!)) return;
    let j = this.count < k ? this.count++ : k - 1;
    const sp = this.pos[j]!;
    const sd = this.dir[j]!;
    for (; j > 0 && this.score[j - 1]! > s; j--) {
      this.score[j] = this.score[j - 1]!;
      this.pos[j] = this.pos[j - 1]!;
      this.dir[j] = this.dir[j - 1]!;
      this.kind[j] = this.kind[j - 1]!;
      this.id[j] = this.id[j - 1]!;
    }
    this.score[j] = s;
    this.pos[j] = sp.copy(p);
    this.dir[j] = sd.copy(d);
    this.kind[j] = kind;
    this.id[j] = id;
  }
}

/**
 * Every intact lamp glows (one additive point sprite each, one draw for all cars). The fixed light pools go to the
 * highest-priority intact lamps each frame: the followed car first, then the cars of the clip being played, then (desktop) cars
 * touching the middle tile of the viewport, nearest its centre first. White spots for headlamps, short red points for tail
 * lamps; a lit police siren takes a point too, recoloured red or blue (colour and range are uniforms: the lights hash never
 * changes). Every other head and tail lamp shows its pool as a fake ground decal (`pools`, one instanced draw), so a lamp never
 * goes dark as the view turns; a lamp with a real light shows no decal.
 */
export class LampLights {
  readonly spots: THREE.SpotLight[] = [];
  readonly points: THREE.PointLight[] = [];
  readonly glow: THREE.Points;
  private readonly glowPos: THREE.BufferAttribute;
  private readonly glowCol: THREE.BufferAttribute;
  private readonly heads: Ranking;
  private readonly tails: Ranking;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  /** Whether cars touching the middle tile of the viewport earn real lights (desktop; a phone's budget keeps them to the followed car and the highlight). */
  middleTile = true;
  /** Fake pools: one instanced ground decal for every head and tail lamp without a real light. */
  readonly pools: THREE.InstancedMesh;
  /** This frame's head and tail lamps: world seat and axis (6 floats each), kind (1 head), and whether a real light took it. */
  private readonly stash: Float32Array;
  private readonly stashHead: Uint8Array;
  private readonly taken: Uint8Array;
  private scaleX = 1;
  private scaleY = 1;

  constructor(scene: THREE.Scene, maxLamps: number, pool: LampPool = FULL_POOL) {
    this.heads = new Ranking(pool.spots);
    this.tails = new Ranking(pool.points);
    for (let i = 0; i < pool.spots; i++) {
      const s = new THREE.SpotLight(HEAD.color, 0, HEAD.distance, HEAD.angle, HEAD.penumbra, HEAD.decay);
      scene.add(s, s.target);
      this.spots.push(s);
    }
    for (let i = 0; i < pool.points; i++) {
      const p = new THREE.PointLight(TAIL.color, 0, TAIL.distance, TAIL.decay);
      scene.add(p);
      this.points.push(p);
    }
    const geo = new THREE.BufferGeometry();
    this.glowPos = new THREE.BufferAttribute(new Float32Array(maxLamps * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.glowCol = new THREE.BufferAttribute(new Float32Array(maxLamps * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.glowPos);
    geo.setAttribute("color", this.glowCol);
    geo.setDrawRange(0, 0);
    this.glow = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: GLOW_SIZE,
        map: glowSprite(),
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.frustumCulled = false;
    scene.add(this.glow);
    this.stash = new Float32Array(maxLamps * 6);
    this.stashHead = new Uint8Array(maxLamps);
    this.taken = new Uint8Array(maxLamps);
    // The engine makes `pools` a ground decal (`groundMaterial`, `levelOrder`): that layer is above this one.
    this.pools = new THREE.InstancedMesh(
      poolQuad(),
      new THREE.MeshBasicMaterial({ map: poolSprite(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      maxLamps,
    );
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxLamps * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    scene.add(this.pools);
  }

  /**
   * After the cars' skin and the camera are final for the frame, before render. `now` (s) clocks the sirens; `highlight` is the
   * cars of the clip being played.
   */
  update(cars: readonly LampHost[], camera: THREE.Camera, followed: LampHost | null, now = performance.now() / 1000, highlight: readonly LampHost[] = NO_CARS): void {
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    _cam.setFromMatrixPosition(camera.matrixWorld);
    this.scaleX = camera.projectionMatrix.elements[0]!;
    this.scaleY = camera.projectionMatrix.elements[5]!;
    this.heads.count = 0;
    this.tails.count = 0;
    const gp = this.glowPos.array as Float32Array;
    const gc = this.glowCol.array as Float32Array;
    const st = this.stash;
    let n = 0;
    let ns = 0;
    for (let ci = 0; ci < cars.length; ci++) {
      const car = cars[ci]!;
      if (!car.group.visible) continue;
      car.flashSirens(now);
      const rank = this.rank(car, followed, highlight);
      for (let i = 0; i < car.lampCount; i++) {
        const kind = car.lampWorld(i, _pos, _dir);
        if (!kind || n * 3 >= gp.length) continue;
        _e.copy(_pos).addScaledVector(_dir, GLOW_OUT).toArray(gp, n * 3);
        const c = kind === "head" ? GLOW_HEAD : kind === "tail" ? GLOW_TAIL : kind === "red" ? GLOW_RED : GLOW_BLUE;
        gc[n * 3] = c[0];
        gc[n * 3 + 1] = c[1];
        gc[n * 3 + 2] = c[2];
        n++;
        if (kind === "head" || kind === "tail") {
          _pos.toArray(st, ns * 6);
          _dir.toArray(st, ns * 6 + 3);
          this.stashHead[ns] = kind === "head" ? 1 : 0;
          if (rank < Infinity) (kind === "head" ? this.heads : this.tails).offer(rank, _pos, _dir, kind, ns);
          ns++;
        } else {
          let score = _pos.distanceToSquared(_cam);
          if (car === followed) score -= 1e9;
          else if (!this.frustum.containsPoint(_pos)) score += 1e9;
          this.tails.offer(score - SIREN.rank, _pos, _dir, kind, -1);
        }
      }
    }
    this.glow.geometry.setDrawRange(0, n);
    this.glowPos.needsUpdate = true;
    this.glowCol.needsUpdate = true;

    for (let k = 0; k < this.spots.length; k++) {
      const s = this.spots[k]!;
      if (k >= this.heads.count) {
        s.intensity = 0;
        continue;
      }
      const p = this.heads.pos[k]!;
      const d = this.heads.dir[k]!;
      s.position.copy(p);
      s.target.position.copy(p).addScaledVector(d, AIM);
      s.target.position.y -= DIP;
      s.intensity = HEAD.intensity;
    }
    for (let k = 0; k < this.points.length; k++) {
      const l = this.points[k]!;
      if (k >= this.tails.count) {
        l.intensity = 0;
        continue;
      }
      const kind = this.tails.kind[k]!;
      const tail = kind === "tail";
      l.position.copy(this.tails.pos[k]!).addScaledVector(this.tails.dir[k]!, tail ? TAIL_OUT : SIREN.out);
      l.color.setHex(tail ? TAIL.color : kind === "red" ? SIREN.red : SIREN.blue);
      l.distance = tail ? TAIL.distance : SIREN.distance;
      l.intensity = tail ? TAIL.intensity : SIREN.intensity;
    }

    // A head or tail lamp without a real light shows its pool as a decal instead.
    const taken = this.taken.fill(0, 0, ns);
    for (let k = 0; k < this.heads.count; k++) taken[this.heads.id[k]!] = 1;
    for (let k = 0; k < this.tails.count; k++) if (this.tails.id[k]! >= 0) taken[this.tails.id[k]!] = 1;
    let np = 0;
    for (let s = 0; s < ns; s++) if (taken[s] === 0) np = this.addPool(np, s);
    this.pools.count = np;
    this.pools.instanceMatrix.needsUpdate = true;
    this.pools.instanceColor!.needsUpdate = true;
  }

  /**
   * Where `car` ranks for a real light, lowest first; Infinity gets none and shows fake pools only. The followed car comes first,
   * then the highlight's cars, then (desktop, `middleTile`) cars whose disc touches the middle tile of a 3x3 split of the
   * viewport, nearest the screen centre first.
   */
  private rank(car: LampHost, followed: LampHost | null, highlight: readonly LampHost[]): number {
    const p = car.group.position;
    if (car === followed) return p.distanceToSquared(_cam) - 3e9;
    for (let i = 0; i < highlight.length; i++) if (highlight[i] === car) return p.distanceToSquared(_cam) - 2e9;
    if (!this.middleTile) return Infinity;
    const v = this.viewProj.elements;
    const w = v[3]! * p.x + v[7]! * p.y + v[11]! * p.z + v[15]!;
    if (w <= 0) return Infinity;
    const x = (v[0]! * p.x + v[4]! * p.y + v[8]! * p.z + v[12]!) / w;
    const y = (v[1]! * p.x + v[5]! * p.y + v[9]! * p.z + v[13]!) / w;
    const r = CAR_RADIUS / w;
    return Math.abs(x) - r * this.scaleX < MIDDLE_TILE && Math.abs(y) - r * this.scaleY < MIDDLE_TILE ? x * x + y * y : Infinity;
  }

  /**
   * Pool instance `k` for stashed lamp `s`: a flat quad on the ground, its near edge at the lamp's foot and its far edge where the
   * beam has faded. A headlamp's runs along the spot's own aim (`AIM`, `DIP`) to where the beam meets the ground, a tail lamp's
   * straight back. Returns the next free instance (`k` when the lamp has no ground to light).
   * ponytail: one flat quad at the ground height under the beam's end; on a steep slope its near end floats or sinks.
   */
  private addPool(k: number, s: number): number {
    const st = this.stash;
    const o = s * 6;
    const px = st[o]!;
    const py = st[o + 1]!;
    const pz = st[o + 2]!;
    const dx = st[o + 3]!;
    const dy = st[o + 4]!;
    const dz = st[o + 5]!;
    const head = this.stashHead[s] === 1;
    const cx = px - _cam.x;
    const cz = pz - _cam.z;
    if (cx * cx + cz * cz > POOL_FAR_SQ) return k;
    const ground = activeGround();
    const h0 = ground.heightAt(px, pz, py);
    if (h0 === NO_FLOOR || py <= h0) return k;
    const flat = hypot2(dx, dz);
    if (flat < 0.05) return k;
    const fx = dx / flat;
    const fz = dz / flat;
    let y = h0;
    let len = TAIL_POOL;
    let wid = TAIL_POOL;
    if (head) {
      const ry = dy * AIM - DIP;
      if (ry > -0.01) return k;
      const t = (h0 - py) / ry;
      const reach = flat * AIM * t;
      if (reach < 0.5 || reach > HEAD.distance) return k;
      const g = ground.heightAt(px + dx * AIM * t, pz + dz * AIM * t, h0 + 0.5);
      if (g !== NO_FLOOR) y = g;
      len = Math.min(POOL_MAX, POOL_LEN * reach);
      wid = POOL_WIDTH * len;
    } else if (flat < 0.3) return k;
    const m = this.pools.instanceMatrix.array as Float32Array;
    const b = k * 16;
    m[b] = fz * wid;
    m[b + 1] = 0;
    m[b + 2] = -fx * wid;
    m[b + 3] = 0;
    m[b + 4] = 0;
    m[b + 5] = 1;
    m[b + 6] = 0;
    m[b + 7] = 0;
    m[b + 8] = fx * len;
    m[b + 9] = 0;
    m[b + 10] = fz * len;
    m[b + 11] = 0;
    m[b + 12] = px;
    m[b + 13] = y + POOL_LIFT;
    m[b + 14] = pz;
    m[b + 15] = 1;
    const col = head ? POOL_HEAD : POOL_TAIL;
    const c = this.pools.instanceColor!.array as Float32Array;
    c[k * 3] = col[0];
    c[k * 3 + 1] = col[1];
    c[k * 3 + 2] = col[2];
    return k + 1;
  }

  dispose(): void {
    for (const l of [...this.spots, ...this.points]) l.dispose();
    const mat = this.glow.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.glow.geometry.dispose();
    const pm = this.pools.material as THREE.MeshBasicMaterial;
    pm.map?.dispose();
    pm.dispose();
    this.pools.geometry.dispose();
    this.pools.dispose();
  }
}

/** Soft round falloff, white with alpha (1 − r)²; built in code so it needs no DOM. */
function glowSprite(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, hypot2(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2));
      const o = (y * n + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(255 * (1 - r) ** 2);
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A unit quad on the ground, x in ±0.5, z from 0 (the lamp's foot) to 1 (along the beam), facing up; uv.y runs with z. */
function poolQuad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1], 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

/** A pool's falloff over `poolQuad`, white with alpha (1 − r)²: an ellipse whose peak sits a fifth of the way along, built in code (no DOM). */
function poolSprite(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    const s = (y + 0.5) / n;
    const dz = s < 0.2 ? (0.2 - s) / 0.2 : (s - 0.2) / 0.8;
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, hypot2(((x + 0.5) / n - 0.5) * 2, dz));
      const o = (y * n + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(255 * (1 - r) ** 2);
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _tri = new THREE.Triangle();
const _cam = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** A lamp unit's look: lit head and tail (the tail stays below ACES's bright-red-to-yellow knee so its lens reads red
 *  under its own glow) and broken (either kind). The lens alone emits: `lampEmissiveMap` masks the housing. */
const LAMP_LOOK = {
  head: { color: 0xffffff, emissive: 0xf4f1e8, emissiveIntensity: 1.15 },
  tail: { color: 0xffffff, emissive: 0xe01018, emissiveIntensity: 1.1 },
  broken: { color: 0x5a5c60, emissive: 0x1a1b1c, emissiveIntensity: 0.12 },
} as const;

/**
 * Every car's lamp units as four instanced draws (head / tail × lit / broken) instead of four meshes per car. A car
 * keeps a bare Object3D per lamp that it seats on the skin; `sync` copies the shown ones' world matrices into the
 * batch for the lamp's kind and state once the scene's matrices are current for the frame.
 */
export class LampBatch {
  /** Head lit, head broken, tail lit, tail broken. */
  readonly meshes: readonly THREE.InstancedMesh[];
  private readonly n = [0, 0, 0, 0];

  constructor(capacity: number) {
    const mat = (look: (typeof LAMP_LOOK)[keyof typeof LAMP_LOOK]) =>
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.25, emissiveMap: lampEmissiveMap(), ...look });
    const broken = mat(LAMP_LOOK.broken);
    this.meshes = (["head", "tail"] as const).flatMap((kind) => {
      const geo = makeLampUnit(kind);
      return [mat(LAMP_LOOK[kind]), broken].map((m) => {
        const mesh = new THREE.InstancedMesh(geo, m, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Instances span the pad and move every frame; a stale bound would cull live lamps.
        mesh.frustumCulled = false;
        mesh.count = 0;
        return mesh;
      });
    });
  }

  /** Pack the shown lamps of `cars` (world matrices must be current). A seat off layer 0 (distance detail) is hidden. */
  sync(cars: readonly { readonly lamps: readonly { readonly seat: THREE.Object3D; readonly intact: boolean; readonly kind: LampKind }[] }[]): void {
    const n = this.n;
    n.fill(0);
    for (const car of cars) {
      for (const l of car.lamps) {
        let shown = l.seat.layers.isEnabled(0);
        for (let p: THREE.Object3D | null = l.seat; p && shown; p = p.parent) shown = p.visible;
        if (!shown) continue;
        const b = (l.kind === "head" ? 0 : 2) + (l.intact ? 0 : 1);
        const mesh = this.meshes[b]!;
        if (n[b]! < mesh.instanceMatrix.count) mesh.setMatrixAt(n[b]!++, l.seat.matrixWorld);
      }
    }
    for (let b = 0; b < 4; b++) {
      const mesh = this.meshes[b]!;
      mesh.count = n[b]!;
      const attr = mesh.instanceMatrix;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n[b]! * 16);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    const mats = new Set<THREE.Material>();
    for (const m of this.meshes) {
      m.geometry.dispose();
      mats.add(m.material as THREE.Material);
      m.dispose();
    }
    for (const m of mats) m.dispose();
  }
}
