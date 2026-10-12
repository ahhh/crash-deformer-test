import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PR_BASE, PR_HX, PR_HZ, PR_TOP, PR_X, PR_YAW, PR_Z } from "../world/prism.ts";
import { P_STRIDE, PRISM, Q_KIND, Q_STRIDE } from "../world/surfaces.ts";
import { DERBY_ARENA } from "./constants.ts";
import { makeDerbyArena } from "./derby-arena.ts";
import { DERBY_BOXES, DERBY_PROP, DerbyGround } from "./derby-ground.ts";

/** Metres (and radians) two drawn numbers may differ by and still be one: the instance matrices are Float32. */
const TOLERANCE = 1e-4;
/** The wall's inner face may sit this far (m) off `DERBY_ARENA.radius`. */
const WALL_FACE_TOLERANCE = 0.01;
/** A wall box's long axis is tangent: its dot with the radial direction stays under this. */
const TANGENT_LIMIT = 0.25;
const DRAW_CALL_LIMIT = 10;
/** A floor vertex this close (m) to a box's edge counts as under the box. */
const EDGE_REACH = 1e-6;
/** At least this share of the floor's vertices must be compared: a test that skipped them all would prove nothing. */
const LEAST_COMPARED_SHARE = 0.9;

type Placement = { x: number; z: number; base: number; yaw: number; hx: number; hz: number; height: number };

const ground = new DerbyGround();
const arena = makeDerbyArena(ground);

function sameYawModuloHalfTurn(first: number, second: number): boolean {
  return Math.abs(Math.sin(first - second)) < TOLERANCE;
}

function isSameSolid(first: Placement, second: Placement): boolean {
  return (
    Math.abs(first.x - second.x) < TOLERANCE &&
    Math.abs(first.z - second.z) < TOLERANCE &&
    Math.abs(first.base - second.base) < TOLERANCE &&
    sameYawModuloHalfTurn(first.yaw, second.yaw) &&
    Math.abs(first.hx - second.hx) < TOLERANCE &&
    Math.abs(first.hz - second.hz) < TOLERANCE &&
    Math.abs(first.height - second.height) < TOLERANCE
  );
}

const listedBoxes: readonly (Placement & { kind: string })[] = DERBY_BOXES.map(({ kind, x, z, yaw, hx, hz, height }) => ({ kind, x, z, base: 0, yaw, hx, hz, height }));

/** Every instance of a drawn box mesh, read back from its matrix and its box geometry. */
function placementsOf(mesh: THREE.InstancedMesh): Placement[] {
  assert.ok(mesh.geometry instanceof THREE.BoxGeometry, `${mesh.name} is drawn from a box`);
  const { width, height, depth } = mesh.geometry.parameters;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_unused, index) => {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const instanceHeight = height * scale.y;
    return {
      x: position.x,
      z: position.z,
      base: position.y - instanceHeight / 2,
      yaw: 2 * Math.atan2(quaternion.y, quaternion.w),
      hx: (width * scale.x) / 2,
      hz: (depth * scale.z) / 2,
      height: instanceHeight,
    };
  });
}

function boxMesh(kind: string): THREE.InstancedMesh {
  const found = arena.children.find((child) => child instanceof THREE.InstancedMesh && child.name === kind);
  assert.ok(found instanceof THREE.InstancedMesh, `the arena draws ${kind} boxes`);
  return found;
}

/** The prisms of the ground, as placements (the grid patch is not a prism). */
function prismPlacements(): Placement[] {
  const placements: Placement[] = [];
  for (let patch = 0; patch < ground.count; patch++) {
    if (ground.q[patch * Q_STRIDE + Q_KIND] !== PRISM) continue;
    const offset = patch * P_STRIDE;
    placements.push({
      x: ground.p[offset + PR_X]!,
      z: ground.p[offset + PR_Z]!,
      base: ground.p[offset + PR_BASE]!,
      yaw: ground.p[offset + PR_YAW]!,
      hx: ground.p[offset + PR_HX]!,
      hz: ground.p[offset + PR_HZ]!,
      height: ground.p[offset + PR_TOP]!,
    });
  }
  return placements;
}

/** Pairs each of `found` with one of `expected`, each used once; the ones left over on either side are the mismatch. */
function leftOvers(expected: readonly Placement[], found: readonly Placement[]): { missing: Placement[]; extra: Placement[] } {
  const missing = [...expected];
  const extra: Placement[] = [];
  for (const placement of found) {
    const at = missing.findIndex((candidate) => isSameSolid(candidate, placement));
    if (at < 0) extra.push(placement);
    else missing.splice(at, 1);
  }
  return { missing, extra };
}

function isUnderBox(x: number, z: number, box: Placement): boolean {
  const offsetX = x - box.x;
  const offsetZ = z - box.z;
  const across = offsetX * Math.cos(box.yaw) - offsetZ * Math.sin(box.yaw);
  const along = offsetX * Math.sin(box.yaw) + offsetZ * Math.cos(box.yaw);
  return Math.abs(across) <= box.hx + EDGE_REACH && Math.abs(along) <= box.hz + EDGE_REACH;
}

describe("derby arena", () => {
  for (const kind of Object.values(DERBY_PROP)) {
    it(`given the drawn arena, when every ${kind} instance is read back, then each is exactly one box of the list and each box is drawn once`, () => {
      const expected = listedBoxes.filter((box) => box.kind === kind);
      const mesh = boxMesh(kind);
      assert.equal(mesh.count, expected.length, `${kind} instance count`);
      const { missing, extra } = leftOvers(expected, placementsOf(mesh));
      assert.deepEqual(extra, [], `${kind} instances that are no listed box`);
      assert.deepEqual(missing, [], `${kind} boxes that are not drawn`);
    });
  }

  it("given the ground built from the list, when its prism patches are read, then each is a listed box and each box is a prism", () => {
    const { missing, extra } = leftOvers(listedBoxes, prismPlacements());
    assert.deepEqual(extra, [], "prisms that are no listed box");
    assert.deepEqual(missing, [], "boxes that are no prism");
  });

  it("given the drawn floor, when each vertex is compared with the ground's height query, then it is the surface a car meets", () => {
    const floor = arena.getObjectByName("derby-floor");
    assert.ok(floor instanceof THREE.Mesh, "the arena draws a floor");
    const positions = floor.geometry.getAttribute("position");
    let compared = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex);
      const z = positions.getZ(vertex);
      if (listedBoxes.some((box) => isUnderBox(x, z, box))) continue;
      compared++;
      assert.ok(Math.abs(positions.getY(vertex) - ground.heightAt(x, z)) < TOLERANCE, `floor vertex (${x}, ${z}) is at the ground's height`);
    }
    assert.ok(compared > positions.count * LEAST_COMPARED_SHARE, `${compared} of ${positions.count} vertices compared`);
  });

  it("given the drawn arena, when its draw calls are counted, then there are at most ten and it is hidden until the engine shows it", () => {
    let drawCalls = 0;
    arena.traverse((object) => {
      if (object instanceof THREE.Mesh) drawCalls++;
    });
    assert.ok(drawCalls <= DRAW_CALL_LIMIT, `${drawCalls} draw calls`);
    assert.equal(arena.name, "derby-arena");
    assert.equal(arena.visible, false);
  });

  it("given the wall boxes as drawn, when each is read back, then its long axis runs along the wall and its inner face stands on the arena radius", () => {
    const pieces = placementsOf(boxMesh(DERBY_PROP.wall));
    assert.equal(pieces.length, DERBY_ARENA.wallPieces);
    for (const piece of pieces) {
      const centreRadius = Math.hypot(piece.x, piece.z);
      const radialAlongLongAxis = (piece.x * Math.sin(piece.yaw) + piece.z * Math.cos(piece.yaw)) / centreRadius;
      assert.ok(Math.abs(radialAlongLongAxis) < TANGENT_LIMIT, `wall piece at (${piece.x}, ${piece.z}) lies along the wall`);
      assert.ok(Math.abs(centreRadius - piece.hx - DERBY_ARENA.radius) < WALL_FACE_TOLERANCE, `wall piece at (${piece.x}, ${piece.z}) has its inner face on the radius`);
    }
  });
});
