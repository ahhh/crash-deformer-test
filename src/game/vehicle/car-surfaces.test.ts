import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { P_STRIDE } from "../world/surfaces.ts";
import { CarSurfaces } from "./car-surfaces.ts";
import { carInState } from "./drawn-body.test-util.ts";

describe("given a crushed car whose own cage fields are refitted in place", () => {
  it("when its hood opens after a refit nobody told the surfaces of, then its roof patch is the one a fresh sync reads", () => {
    const car = carInState("loaded", "sedan", "sedan");
    car.group.updateMatrixWorld(true);
    const stale = new CarSurfaces();
    stale.sync(0, car);
    const fields = car.cage.fields;
    const before = fields.heightMax;

    for (const part of car["parts"]) if (part.hinge === "cowl") part.hingeT = 1;
    car.deform["loadDirty"][0] = 1;
    car.deform.bakeSkin();
    // The rigid step's `loadPoints` fits the cage first and discards the answer.
    assert.equal(car.refitCage(), true, "fixture: the refit must change the fields");
    assert.equal(car.cage.fields, fields, "fixture: an own cage is refitted in place");
    assert.ok(fields.heightMax > before, "fixture: the open hood must raise the height bound");

    stale.sync(0, car);
    const fresh = new CarSurfaces();
    fresh.sync(0, car);
    const a = stale.p.subarray(0, P_STRIDE);
    const b = fresh.p.subarray(0, P_STRIDE);
    const k = a.findIndex((v, j) => !Object.is(v, b[j]));
    assert.equal(k, -1, `the roof patch differs from a fresh sync's at parameter ${k}: ${a[k]} vs ${b[k]}`);
  });
});
