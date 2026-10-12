import type { DeformableCar } from "../vehicle/car.ts";
import type { PropHits } from "../contact/prop-contact.ts";
import { newWorld, type World } from "../engine/world-step.ts";
import { setGround } from "../world/ground.ts";
import { DerbyGround } from "./derby-ground.ts";

const NO_HITS: PropHits = { knock() {}, fx() {}, wall() {} };

/** The derby arena as the engine wires it for `cars`: its ground active, its prisms met at the end of every slice. `leaveArena` puts the flat plane back. */
export function arenaWorld(cars: readonly DeformableCar[], hits: PropHits = NO_HITS): { world: World; ground: DerbyGround } {
  const ground = new DerbyGround();
  setGround(ground);
  const world = newWorld(cars);
  world.collide = (car, index, dt) => ground.contact(car, index, hits, dt);
  return { world, ground };
}

export function leaveArena(): void {
  setGround(null);
}
