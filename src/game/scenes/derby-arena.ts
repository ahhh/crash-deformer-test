import * as THREE from "three";
import { detCos, detSin, hypot2 } from "../kernel/physics-core.js";
import { SURFACE_IDS, SURFACES } from "../world/catalog.ts";
import { SURFACE } from "../world/constants.ts";
import { DERBY_ARENA } from "./constants.ts";
import { DERBY_BOXES, DERBY_PLATEAUS, DERBY_PROP, type DerbyGround, type DerbyPropKind } from "./derby-ground.ts";
import { groundMesh } from "./ground-stack.ts";

/** Inner face of the ring wall (m from the middle): the AI's keep-in radius. */
export const DERBY_RADIUS = DERBY_ARENA.radius;

/** Small integer generator behind every "random" look of the arena: the same arena is drawn every time. */
const RANDOM_MULTIPLIER = 1664525;
const RANDOM_INCREMENT = 1013904223;
const RANDOM_RANGE = 2 ** 32;

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, RANDOM_MULTIPLIER) + RANDOM_INCREMENT) >>> 0;
    return state / RANDOM_RANGE;
  };
}

/** The floor: grid cells whose centre is within `DERBY_ARENA.radius` + this (m) of the middle are drawn. */
const FLOOR_MARGIN = 1;
const FLOOR_DIRT_COLOUR = 0x6b5a45;
const FLOOR_SCRAP_COLOUR = 0x3a3835;
/** Spread of the per-vertex tint: a vertex colour is its base times 1 ± half of this. */
const FLOOR_TINT_RANGE = 0.16;
const FLOOR_SEED = 20240611;
/** World metres one repeat of the dirt speckle covers. */
const FLOOR_UV_METRES = 6;
const FLOOR_ROUGHNESS = 0.95;
const FLOOR_METALNESS = 0.02;
/** The scrap hump is the plateau of this height (`DERBY_PLATEAUS`); a node is scrap where it is lifted by at most this much (plus the tolerance). */
const SCRAP_HEIGHT = 0.8;
const SCRAP_HEIGHT_TOLERANCE = 1e-3;

/** Side of the square dirt speckle texture (texels). */
const SPECKLE_SIZE = 64;
/** Seed of the speckle's random generator (unitless). */
const SPECKLE_SEED = 7;
/** Base grey level of a speckle texel (0-255 channel value). */
const SPECKLE_BASE = 205;
/** Random spread added to the speckle base grey (0-255 channel levels). */
const SPECKLE_SPREAD = 50;
/** Share of speckle texels that are dark (fraction, 0-1). */
const SPECKLE_DARK_SHARE = 0.1;
/** Factor a dark speckle texel's grey is multiplied by (fraction, 0-1). */
const SPECKLE_DARK_FACTOR = 0.55;

/** The plain past the wall: dark dirt from just under the wall's foot out to `OUTER_RADIUS` (m), a hair under the floor. */
const OUTER_INNER_OVERLAP = 0.5;
const OUTER_RADIUS = 90;
const OUTER_HEIGHT = -0.02;
const OUTER_SEGMENTS = 64;
const OUTER_COLOUR = 0x3f3427;

/** Side of the square hazard texture (texels). */
const HAZARD_SIZE = 64;
/** The share of a wall face's height (top down) the hazard band covers, and the width (texels) of one diagonal stripe. */
const HAZARD_BAND_SHARE = 0.12;
const HAZARD_STRIPE_TEXELS = 8;
const HAZARD_YELLOW: Texel = [255, 200, 0];
const HAZARD_BLACK: Texel = [24, 24, 24];
const PLAIN_TEXEL: Texel = [255, 255, 255];
const WALL_COLOURS = [0x9a9790, 0xc4c0b8] as const;

/** Side of the square rib texture (texels). */
const RIB_SIZE = 32;
/** Texels per rib: a bright and a dark band alternate. */
const RIB_TEXELS = 4;
const RIB_DARK: Texel = [110, 110, 110];
const CONTAINER_COLOURS = [0x2f4f7a, 0x8a3a2a] as const;
const RAIL_COLOURS = [0xb0aca4] as const;
const PAD_COLOURS = [0x1c1c1e] as const;
const TYRE_COLOURS = [0x1a1a1a] as const;
const PROP_ROUGHNESS = 0.85;
const PROP_METALNESS = 0.08;
const CONTAINER_METALNESS = 0.3;

/** Mounds in the ring beyond the wall (count). */
const MOUND_COUNT = 20;
/** Height of a mound's dome (m). */
const MOUND_HEIGHT = 4;
const MOUND_RADIUS_RANGE = [8, 14] as const;
const MOUND_RING_RANGE = [50, 66] as const;
/** A mound's near edge stays this far (m) beyond the wall's inner face, so none reaches the arena or a tower. */
const MOUND_CLEARANCE = 12;
const MOUND_COLOUR = 0x4a3e30;
const MOUND_SEED = 31337;
const MOUND_RADIAL_SEGMENTS = 16;
const MOUND_HEIGHT_SEGMENTS = 4;

/** Floodlight towers around the arena (count). */
const TOWER_COUNT = 8;
/** How far past the arena radius a tower stands (m). */
const TOWER_DISTANCE = 8;
/** Radius of a tower pole (m). */
const TOWER_RADIUS = 0.4;
/** Height of a tower pole (m). */
const TOWER_HEIGHT = 14;
/** Radial segments of a tower pole's cylinder (count). */
const TOWER_SEGMENTS = 6;
const TOWER_COLOUR = 0x55575c;
/** The lamp head's box on top of a pole: width, height and length (m). */
const TOWER_HEAD = { width: 3, height: 0.6, length: 1.2 } as const;
const TOWER_LAMP_BODY = 0x2a2a2a;
const TOWER_LAMP_GLOW = 0xffe2b0;
/** Emissive intensity of a lamp head (unitless multiplier). */
const TOWER_LAMP_INTENSITY = 1.5;

type Texel = readonly [number, number, number];

/** A square RGBA `DataTexture` (built in memory, no canvas: the arena is drawn in node tests too) painted texel by texel. */
function makeTexture(size: number, texelAt: (column: number, row: number) => Texel, wrap: THREE.Wrapping): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const [red, green, blue] = texelAt(column, row);
      const offset = (row * size + column) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = wrap;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeSpeckleTexture(): THREE.DataTexture {
  const random = makeSeededRandom(SPECKLE_SEED);
  return makeTexture(
    SPECKLE_SIZE,
    () => {
      const grain = SPECKLE_BASE + random() * SPECKLE_SPREAD;
      const value = random() < SPECKLE_DARK_SHARE ? grain * SPECKLE_DARK_FACTOR : grain;
      return [value, value, value];
    },
    THREE.RepeatWrapping,
  );
}

/** A wall face: plain over its height, a yellow and black diagonal band along its top. */
function makeHazardTexture(): THREE.DataTexture {
  return makeTexture(
    HAZARD_SIZE,
    (column, row) => {
      if (row < HAZARD_SIZE * (1 - HAZARD_BAND_SHARE)) return PLAIN_TEXEL;
      return Math.floor((column + row) / HAZARD_STRIPE_TEXELS) % 2 === 0 ? HAZARD_YELLOW : HAZARD_BLACK;
    },
    THREE.ClampToEdgeWrapping,
  );
}

/** Horizontal ribs: bands of a tyre stack's side. */
function makeRibTexture(): THREE.DataTexture {
  return makeTexture(RIB_SIZE, (_column, row) => (Math.floor(row / RIB_TEXELS) % 2 === 0 ? PLAIN_TEXEL : RIB_DARK), THREE.ClampToEdgeWrapping);
}

/** The one indexed mesh of the baked grid: every node of a cell within reach of the middle, its colour by what the node is. */
function makeFloorGeometry(ground: DerbyGround): THREE.BufferGeometry {
  const nodesPerSide = Math.round(Math.sqrt(ground.heights.length));
  const reach = DERBY_ARENA.radius + FLOOR_MARGIN;
  const concreteSurface = SURFACE_IDS.indexOf(SURFACE.concrete);
  const dirt = new THREE.Color(FLOOR_DIRT_COLOUR);
  const concrete = new THREE.Color(SURFACES.concrete.color);
  const scrap = new THREE.Color(FLOOR_SCRAP_COLOUR);
  const scrapHumps = DERBY_PLATEAUS.filter((plateau) => plateau.height === SCRAP_HEIGHT);
  const random = makeSeededRandom(FLOOR_SEED);
  const vertexOfNode = new Int32Array(ground.heights.length).fill(-1);
  const positions: number[] = [];
  const colours: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const isScrap = (x: number, z: number, height: number): boolean =>
    height > 0 &&
    height <= SCRAP_HEIGHT + SCRAP_HEIGHT_TOLERANCE &&
    scrapHumps.some((hump) => Math.abs(x - hump.x) <= hump.halfX + hump.run[1] + hump.round && Math.abs(z - hump.z) <= hump.halfZ + hump.run[3] + hump.round);

  const vertexAt = (column: number, row: number): number => {
    const node = row * nodesPerSide + column;
    const known = vertexOfNode[node]!;
    if (known >= 0) return known;
    const x = column - DERBY_ARENA.gridHalf;
    const z = row - DERBY_ARENA.gridHalf;
    const height = ground.heights[node]!;
    const base = isScrap(x, z, height) ? scrap : ground.surfaces[node] === concreteSurface ? concrete : dirt;
    const tint = 1 + (random() - 0.5) * FLOOR_TINT_RANGE;
    const vertex = positions.length / 3;
    positions.push(x, height, z);
    colours.push(base.r * tint, base.g * tint, base.b * tint);
    uvs.push(x / FLOOR_UV_METRES, z / FLOOR_UV_METRES);
    vertexOfNode[node] = vertex;
    return vertex;
  };

  for (let row = 0; row < nodesPerSide - 1; row++) {
    for (let column = 0; column < nodesPerSide - 1; column++) {
      const centreX = column + 0.5 - DERBY_ARENA.gridHalf;
      const centreZ = row + 0.5 - DERBY_ARENA.gridHalf;
      if (hypot2(centreX, centreZ) > reach) continue;
      const nearLow = vertexAt(column, row);
      const farLow = vertexAt(column, row + 1);
      const nearHigh = vertexAt(column + 1, row);
      const farHigh = vertexAt(column + 1, row + 1);
      indices.push(nearLow, farLow, nearHigh, farLow, farHigh, nearHigh);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeFloor(ground: DerbyGround): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: FLOOR_ROUGHNESS, metalness: FLOOR_METALNESS, map: makeSpeckleTexture() });
  const floor = groundMesh(makeFloorGeometry(ground), material, "terrain");
  floor.name = "derby-floor";
  floor.receiveShadow = true;
  return floor;
}

function makeOuterGround(): THREE.Mesh {
  const geometry = new THREE.RingGeometry(DERBY_ARENA.radius - OUTER_INNER_OVERLAP, OUTER_RADIUS, OUTER_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, OUTER_HEIGHT, 0);
  const outer = groundMesh(geometry, new THREE.MeshStandardMaterial({ color: OUTER_COLOUR, roughness: 1, metalness: 0 }), "terrain");
  outer.name = "derby-outer-ground";
  outer.receiveShadow = true;
  return outer;
}

/** One instanced draw of every `kind` box: the instance's box IS the `DerbyBox` (centre, yaw, size), its colour alternating through `colours`. */
function makeBoxInstances(kind: DerbyPropKind, material: THREE.MeshStandardMaterial, colours: readonly number[]): THREE.InstancedMesh | null {
  const boxes = DERBY_BOXES.filter((box) => box.kind === kind);
  const first = boxes[0];
  if (!first) return null;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2 * first.hx, first.height, 2 * first.hz), material, boxes.length);
  mesh.name = kind;
  const placement = new THREE.Object3D();
  const colour = new THREE.Color();
  boxes.forEach((box, index) => {
    placement.position.set(box.x, box.height / 2, box.z);
    placement.rotation.y = box.yaw;
    placement.scale.set(box.hx / first.hx, box.height / first.height, box.hz / first.hz);
    placement.updateMatrix();
    mesh.setMatrixAt(index, placement.matrix);
    mesh.setColorAt(index, colour.setHex(colours[index % colours.length]!));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function makeProps(): THREE.InstancedMesh[] {
  const solid = (map?: THREE.Texture, metalness = PROP_METALNESS) => new THREE.MeshStandardMaterial({ map: map ?? null, roughness: PROP_ROUGHNESS, metalness });
  const looks: Record<DerbyPropKind, { material: THREE.MeshStandardMaterial; colours: readonly number[] }> = {
    [DERBY_PROP.wall]: { material: solid(makeHazardTexture()), colours: WALL_COLOURS },
    [DERBY_PROP.container]: { material: solid(undefined, CONTAINER_METALNESS), colours: CONTAINER_COLOURS },
    [DERBY_PROP.rail]: { material: solid(), colours: RAIL_COLOURS },
    [DERBY_PROP.pad]: { material: solid(), colours: PAD_COLOURS },
    [DERBY_PROP.tyres]: { material: solid(makeRibTexture()), colours: TYRE_COLOURS },
  };
  return Object.values(DERBY_PROP).flatMap((kind) => {
    const mesh = makeBoxInstances(kind, looks[kind].material, looks[kind].colours);
    return mesh ? [mesh] : [];
  });
}

const lerp = (range: readonly [number, number], share: number): number => range[0] + (range[1] - range[0]) * share;

/** Low rounded hills round the plain, outside the wall and out of reach. */
function makeMounds(): THREE.InstancedMesh {
  const dome = new THREE.SphereGeometry(1, MOUND_RADIAL_SEGMENTS, MOUND_HEIGHT_SEGMENTS, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(dome, new THREE.MeshStandardMaterial({ color: MOUND_COLOUR, roughness: 1, metalness: 0 }), MOUND_COUNT);
  mounds.name = "mounds";
  const random = makeSeededRandom(MOUND_SEED);
  const placement = new THREE.Object3D();
  for (let index = 0; index < MOUND_COUNT; index++) {
    const angle = ((index + random()) * Math.PI * 2) / MOUND_COUNT;
    const radius = lerp(MOUND_RADIUS_RANGE, random());
    const ring = Math.max(lerp(MOUND_RING_RANGE, random()), DERBY_ARENA.radius + MOUND_CLEARANCE + radius);
    placement.position.set(detSin(angle) * ring, 0, detCos(angle) * ring);
    placement.scale.set(radius, MOUND_HEIGHT, radius);
    placement.updateMatrix();
    mounds.setMatrixAt(index, placement.matrix);
  }
  mounds.receiveShadow = true;
  mounds.computeBoundingSphere();
  return mounds;
}

/** Floodlight towers round the wall: one instanced draw of poles, one of their lamp heads (warm and emissive, they cast no light). */
function makeFloodlights(): THREE.InstancedMesh[] {
  const poles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS, TOWER_HEIGHT, TOWER_SEGMENTS),
    new THREE.MeshStandardMaterial({ color: TOWER_COLOUR, roughness: 0.7, metalness: 0.5 }),
    TOWER_COUNT,
  );
  poles.name = "floodlight-poles";
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TOWER_HEAD.width, TOWER_HEAD.height, TOWER_HEAD.length),
    new THREE.MeshStandardMaterial({ color: TOWER_LAMP_BODY, emissive: TOWER_LAMP_GLOW, emissiveIntensity: TOWER_LAMP_INTENSITY }),
    TOWER_COUNT,
  );
  heads.name = "floodlight-heads";
  const placement = new THREE.Object3D();
  const distance = DERBY_ARENA.radius + TOWER_DISTANCE;
  for (let index = 0; index < TOWER_COUNT; index++) {
    const angle = (index * Math.PI * 2) / TOWER_COUNT;
    placement.position.set(detSin(angle) * distance, TOWER_HEIGHT / 2, detCos(angle) * distance);
    placement.rotation.y = angle;
    placement.updateMatrix();
    poles.setMatrixAt(index, placement.matrix);
    placement.position.y = TOWER_HEIGHT + TOWER_HEAD.height / 2;
    placement.updateMatrix();
    heads.setMatrixAt(index, placement.matrix);
  }
  poles.castShadow = true;
  poles.computeBoundingSphere();
  heads.computeBoundingSphere();
  return [poles, heads];
}

/**
 * The arena as the player sees it, drawn from the ground it plays on (`DerbyGround`): the floor is its baked grid, the wall and
 * every prop is an instance of its `DERBY_BOXES` box, and the plain, hills and floodlights past the wall are scenery nobody reaches.
 * Ten draws: floor, plain, the boxes of each kind present (five), mounds, poles, lamp heads. Hidden until the engine shows it.
 */
export function makeDerbyArena(ground: DerbyGround): THREE.Group {
  const arena = new THREE.Group();
  arena.name = "derby-arena";
  arena.add(makeFloor(ground), makeOuterGround(), ...makeProps(), makeMounds(), ...makeFloodlights());
  for (const child of arena.children) {
    child.matrixAutoUpdate = false;
    child.updateMatrix();
  }
  arena.visible = false;
  return arena;
}

/** Spot height above the winner (m) and its candela when on. */
const SPOT_HEIGHT = 7;
const SPOT_CANDELA = 1400;

/**
 * The derby winner's spotlight: a warm narrow cone from above that follows the champion and throws a soft
 * pool on the ground, plus an additive glow decal under the car. Built once; "off" is intensity and opacity
 * 0, so no light or mesh is ever added, removed or hidden at runtime (each would recompile lit materials).
 * ponytail: no shadow map — the pool reads without one; add `castShadow` only if a cheap one is wanted.
 */
export class WinnerSpot {
  readonly light = new THREE.SpotLight(0xfff0d8, 0, SPOT_HEIGHT * 2, 0.36, 0.65, 2);
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  constructor(scene: THREE.Scene, pool: THREE.Texture) {
    this.glow = groundMesh(
      new THREE.PlaneGeometry(6.5, 6.5),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, map: pool, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      "glow",
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.03;
    scene.add(this.light, this.light.target, this.glow);
  }

  follow(x: number, z: number): void {
    this.light.position.set(x, SPOT_HEIGHT, z);
    this.light.target.position.set(x, 0, z);
    this.light.target.updateMatrixWorld();
    this.light.intensity = SPOT_CANDELA;
    this.glow.position.set(x, 0.03, z);
    this.glow.material.opacity = 0.85;
  }

  off(): void {
    this.light.intensity = 0;
    this.glow.material.opacity = 0;
  }
}
