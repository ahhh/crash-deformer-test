# Dethrace (Carmageddon 1997) review: cost-rationing tricks vs crash-deformer pain points

Source: `~/github/dethrace/src/DETHRACE/common/*.c` (paths below are relative to `common/` unless they start otherwise). Our code: `~/crash-wt/bis/cost-x7/src/game`. Anything marked [GUESS] I inferred and did not verify in code.

## 0. The budget they had and how they spent it

- **Hardware.** Pentium 75–90 MHz with an x87 FPU. That is roughly 5–6 M cycles per frame at 15 fps [GUESS: arithmetic from clock and frame rate]. They did not use fixed point in the simulation: `br_scalar` is a float, and the IDA signatures return in `@<ST0>` (e.g. `raycast.c:501` `FindYVerticallyBelow`).
  - LUTs: one float sine table, 91 entries, indexed by whole degrees (`trig.c:8-153`). It is used only by AI, peds, shrapnel and cosmetics (`opponent.c:997`, `pedestrn.c:948,1200`, `spark.c:963,992`).
  - `gFixed_sine_table` is declared at `trig.c:101`. I found no use in the simulation [GUESS].
- **Who gets physics.** At most 1 player, 5 opponents (`constants.h:903`, `dr_types.h:1020`) and up to 10 cops (`dr_types.h:1021`). The active list caps at 25 (`globvrkm.c:30`).
  - Only cars with `physics_me` set get stepped (`opponent.c:1851-1912`). Out-of-sight AI drops off this list (§5).
  - In practice that is a handful of physics cars per frame, not 20.
- **Physics rate.** 25 Hz fixed step: `PHYSICS_STEP_TIME 40` ms (`constants.h:912`).
  - At most 5 steps per frame (`car.c:235,1339`); time beyond that is dropped, which guards against a spiral of death.
  - If a frame does not cross a 40 ms boundary, no step runs. Cars are posed by rewinding/extrapolating from the last step (`car.c:1318-1323`, `InterpolateCars` `1157-1177`). No previous pose is stored.
  - Frame period is a smoothed running average, and spikes over 500 ms are clamped (`mainloop.c:442-460`).
- **Per car, per step, against the world:**
  - 4 wheel rays plus at most 14 box points (8 corners + ≤6 authored "extra points"; `loading.c:1403-1407`, `car.c:3013-3020`).
  - Each tests at most 50 cached faces (`car.c:2986,4118`). The face pool is 150 entries shared by all cars per refill (`car.c:188,781-786`).
  - At most 4 contacts (`car.c:3050-3052`).
  - Our equivalent is about 220 cage points per wreck at 240 Hz, i.e. 52,800 point queries per second per wreck, against 14 × 25 = 350 for them: about 150× more.
- **User knobs, and what they also switch off** (`options.c:434-510`):
  - **Yon (scenery cut-off):** 35 down to 5 in steps of 5 (`options.c:487`). It also sets the AI "in view" distance `max(yon+10, 45)` (`opponent.c:2630`), so lowering scenery distance also dematerialises AI sooner.
  - **Yon factor.**
  - **Car simplification:** distance divided by a per-level factor picks the LOD model (`car.c:173-176,4695-4713`).
  - **Shadows:** everyone / us only / none (`options.c:454-464`).
  - **Accessories off:** sets the props' render style to NONE (`world.c:2402-2413`). `ActorBoxPick` returns early for `BR_RSTYLE_NONE` (`finteray.c:819-821`), so hidden props also leave collision.
  - **Smoke, sky, depth cue.**
- **Scheduling.** I found no frame-count round-robin: grep for `frame_count %` etc. came up empty. They use per-entity timers with random jitter instead (§5). AI and peds run once per render frame (`mainloop.c:633,667`). Only `ApplyPhysicsToCars` runs fixed-step.

## 1. Surface queries (`world/surfaces.ts`: `seek`, `offer`, `gridAt`, `wheelContact`, `tread`): 25 % of our frame

Their equivalent: per-car cached face list → per-step pre-cull → batched rays.

| Trick | Where | Transfers? |
|---|---|---|
| **Coarse XZ column grid.** Track split into `columns[z][x]`, each a BRender actor tree with bounds. The query visits only columns under the box ±1 (`FindFacesInBox` `finteray.c:690-757`; `XZToColumnXZ` `brucetrk.c:73-90`). Ground height for peds: 3×3 columns (`raycast.c:503-528`). | finteray.c, raycast.c | We already have patch grids. Nothing new. |
| **Per-body candidate cache, refilled rarely.** `GetFacesInBox` (`car.c:726-840`) builds the car's swept box (old→new pose, `746-753`). It reuses last refill's face list as long as the new box still fits inside the last box (`756-763`). When it refills, the box is padded with a **predicted pose 3 steps ahead** (mat⁴, `765-777`) so refills are rare. All later per-step queries loop only `[box_face_start, box_face_end)`. | car.c | **Yes, high value.** `seek` runs `find(statics)` + `find(solids)` + tops for every point (`surfaces.ts:1396-1404`). `holdTops` (`1417`) already caches tops per body. Extend it: per car, cache the static and solid patch indices overlapping a predicted swept AABB, keep them while the body stays inside, and have `seek` iterate only that list. |
| **Hierarchical box pick with cheap rejects.** Actor bounds → model bounds (`finteray.c:861-872`). Then per face: plane distance vs bounding-sphere radius (`913-918`), then per-axis tri-vs-AABB (`924-959`), and only then clipping (`960-976`). | finteray.c | Same order for `offer`: plane-vs-sphere before the full patch test. |
| **Per-step face pre-cull plus early bail.** `CollCheck` projects the swept OBB onto each cached face normal. Faces that miss get flag `0x80` (`car.c:2986-3005`). If none touch, it **returns before any per-point work** (`3006-3008`). Every point ray then skips flagged faces (`gEliminate_faces`, `3012`, `3955-3958`, `4016`). | car.c | **Yes.** Before the ~220-point cage loop, run one OBB-vs-candidate-patch test per step and drop to the touching subset. If it is empty, skip all point queries for that body this step. `clearOf` (`surfaces.ts:1429`) is the same idea at radius level. |
| **Batched rays sharing a direction.** The 4 wheel rays go through one face loop: face outer, rays inner, `d·n` computed once per face (`MultiFindFloorInBoxM` `car.c:2294,3928-3971`; `MultiRayCheckSingleFace` `finteray.c:541-573`). | car.c, finteray.c | **Yes.** Loop patches outer and points inner for a body's cage/tread points, so the patch decode is paid once per patch, not per point. Fits `tread` (125 points per wheel, all sharing the wheel's down axis). |
| **Tiny point set.** 8 box corners + ≤6 extra points; the box shrinks with crush (§2). | car.c:3013-3020 | **Partly.** For world contact of a resting or slow wreck, test the cage hull's ~16 extreme points first. Run the full 220 only once an extreme point is within reach. Judgement call, not proven equivalent. |

## 2. Cage plan fields rebuilt after crush (`vehicle/car-cage.ts` `rasterise`, `transformGrid`; `cage-outline.ts` `refresh`): 15 %

They never rasterise a physics shape. Crush changes the **render mesh**, plus one number of the physics box.

- **What a crush does to the physics shape.** It recomputes only the box's Z extent, from a min/max scan of the principal model's vertices. It is clamped so it never grows on crush (`CrushBoundingBox` `car.c:3689-3749`). It runs only for the principal model (`crush.c:329-333`). The physics box is otherwise authored at load.
- **Mesh update is deferred to the draw and coalesced.** `SetModelForUpdate` flags the model `BR_MODF_CUSTOM`. `JitModelUpdate` runs `BrModelUpdate` when the renderer reaches the model (`crush.c:318-340`). N crushes in one frame cost one update, and a model that is not drawn never pays [GUESS: BRender calls the custom callback only after its cull].
- **Crush culled by distance and filtered by energy:**
  - AI car more than √200 world units from the camera: **no crush at all** (`car.c:3555-3559`).
  - AI wall-hit force ×0.01 vs human ×0.75 (`car.c:3236-3240`). Off-screen AI wall hits (`PointOutOfSight(..,150)`) still crush, but at that tiny force (`car.c:3248`).
  - Oppo-vs-oppo ×0.2 (`car.c:3576-3578`).
  - Energy below 0.06: return (`crush.c:297-299`).
  - Wheel wobble skipped when out of sight (`crush.c:1325`).
- **Bounded work per hit.** One nearest authored crush point is found by a linear scan over crush points only, not all vertices (`crush.c:304-313`). It moves that point plus its precomputed neighbour list (index-delta + factor/256, `crush.c:157-274`). The pipe buffer caps at 600 vertices.
- **Transfer:**
  - (a) Coalesce `rasterise`/`transformGrid`/`refresh` into at most one per car per **render** frame via a dirty flag, built lazily on first read. Never per crush event or per physics step.
  - (b) Skip or defer refits for off-screen or distant non-player cars until a consumer reads the field. Our skin already does this (`engine.ts:540-563` `skinStride`); do the same for the cage.
  - (c) Distance-cull crush amplitude for far AI the way they do. That one is a game-feel call.
  - Check whether `RagdollSystem.fitProxy` forcing `car.refitCage()` every frame (`present/engine-ragdoll.ts:840`) triggers rebuilds the physics would not need [GUESS: depends on whether `refitCage` is a no-op when clean].

## 3. Car-vs-car overlap (`contact/sat.ts` `deepestIn`, `satCars`; `contact/pair-contact.ts` `resolveCarPair`): 5–11 %

- **Broadphase for free.** The world AABB from `GetFacesInBox` (`car.c:753-754`) is reused by `SimpleCarCarCollisionTest` (`6451-6455`) for every pair.
- **Second reject.** Swept local AABB of each car (old ∪ new pose), compared in A's frame (`CollideTwoCars` `car.c:6630-6654`).
- **Narrowphase.** Box vs box only. ≤14 points of each car (corners + extras) are tested against the other's box (`FacePointCarCarCollide` `6909`, `6931-6940`). Edge-edge runs **only if fewer than 3 contacts** were found (`6669-6671`). The ≤8 contacts are trimmed to 4 (`6678-6694`).
- **Pile-up solver budget** (`CrashCarsTogether` `6172-6194`):
  - At most 5 passes. If cars are still colliding after that, every car gets `BringCarToAGrindingHalt`: v and ω zeroed, pose reverted to the old matrix (`6189-6193`, `6424-6431`).
  - **Dirty-pair re-test:** each car's `ref` counts down per pair visited. A car that collided gets its `ref` reset, so later passes only re-test pairs that involve a car that moved last pass (`6180-6183`, `6221-6223`, `6237`).
  - **Pinned = infinite mass:** a car already resolved against a wall or another car becomes immovable (256) for the rest of the passes. This handles the car-in-the-middle case without iterating (`6225-6240`, `6347-6375`).
- **Contact wakes:** `doing_nothing_flag = 0` on both cars (`6702-6703`).
- **Transfer:**
  - (a) Put a swept-AABB reject in front of `deepestIn`'s outline walk, if it is not there already. Walk only the outline points inside B's AABB in A's frame.
  - (b) Cap contacts per pair at 4, keeping the deepest.
  - (c) In the 32-car pile-up, run the dirty-set re-test plus pinned-as-infinite-mass in whatever loop iterates `resolveCarPair`. Bound it with a pass cap and a hard fallback.

## 4. Ragdoll proxies (`present/ragdoll-proxy.ts`, `engine-ragdoll.ts`): 23 %

They have no ragdoll; peds are billboard sprites.

- **Body model.** A ped is a camera-facing quad (`MungePedModel` `pedestrn.c:1185,1200`) with canned impact animations and ballistic falling. Collision against a car is a ped segment (±0.5 × 0..1) tested against the car's **static, uncrushed** AABB `bounds[0]` in car space (`pedestrn.c:1755-1756`, `1816-1833`).
- **Rejects before any of that:**
  - Gross dismiss: distance² vs a speed-swept radius, max(2·(frame·speed)², 1.44) (`1784-1791`).
  - Sleeping non-player cars skipped (`1775-1777`).
  - Peds detected only while `gDetect_peds` is on (`1751`).
- **Far peds are frozen, not rate-reduced.** A ped that is parked (not drawn) and more than ±11 units from the camera on X or Z (Chebyshev, no sqrt) is skipped entirely (`MungePedestrians` `pedestrn.c:2495-2536`, `ACTIVE_PED_DXDZ 11.f` `33`). There is no catch-up later.
- **Off-screen mid-air ped is snapped to the ground** (`GroundPedestrian` `2387-2402`, called at `2539-2540`) instead of simulating the flight.
- Network ped messages go out at most every 50 ms (`2503-2506`).
- **Transfer:**
  - (a) A car's proxy needs 128 boxes only while it can touch an awake dummy. Otherwise use 1 box (the cage AABB) or nothing. `near()` (`engine-ragdoll.ts:571`) already gates whole-proxy-or-not; add the coarse middle tier.
  - (b) Refit only when the cage serial changed **and** the car is within reach. This already exists at `engine-ragdoll.ts:843`; confirm `refitCage()` at `840` is not a forced rebuild.
  - (c) Off-screen and far: snap or sleep the dummy (their `GroundPedestrian`). `dormant()` (`engine-ragdoll.ts:537`) only covers the "all asleep" case.
  - (d) Gross-dismiss cars by swept speed before any proxy work.

## 5. Loose debris and AI, each ~9 %

### Debris / props

- **Lazy activation.** A static prop becomes dynamic only when an **awake** car's face query hits it (`ActorBoxPick` `finteray.c:845-857` → `DoPullActorFromWorld` `car.c:7622-7676`). It enters asleep (`7654`).
- **Lazy retirement.** Once a second (`7710-7714`), any asleep prop whose box no awake body's cached box overlaps goes back into the static column grid (`7728-7763`). After that it costs nothing.
- **Anchored props.** They hold until tilt exceeds `snap_off_cosine` (or are already free when `min_torque_squared` is 0). Until then v and ω are zeroed and the prop sleeps every step (`NonCarCalcForce` `car.c:2081-2096`).
- **Shrapnel.** A pool of 15 (`spark.c:130`): no collision, 1 s life, ballistic plus LUT spin, overwrites the oldest (`MungeShrapnel` `spark.c:928-977`). Sparks: pool of 32 (`spark.c:96`).
- **Transfer:** our `stepLoose` (`vehicle/loose-step.ts:156-160`) already early-outs sleeping parts with `stirNear`. Go further: periodically move parts that have slept for 1 s or more out of the loose list into a static set, so they are not visited at all. Cap the live loose pool and recycle the oldest. Purely cosmetic shards: no contact queries.

### AI

- **Rate.** `MungeOpponents` runs **once per render frame** (`mainloop.c:633`), not per physics step.
- **Jittered timers instead of round-robin:**
  - LOS raycast to the player: every 6.0–6.9 s for opponents, 0.1–1.0 s for cops (`opponent.c:2252-2270`). First check staggered by a random 2.0–2.9 s (`2656`, `2709`).
  - Out-of-world check: 500 ms (`1633-1634`).
  - Grudge decay: 3 s (`2574-2575`).
  - Trail recording: 500 ms (`997`).
- **Off-screen "cheating".** More than 3 s out of view (`ProcessThisOpponent` `opponent.c:1808-1816`) → physics off and removed from the active list (`TurnOpponentPhysicsOff` `490-497`). The car slides kinematically along the path graph, cheat-only shortcuts allowed (`oppoproc.c:224-227`, `484-545`).
  - Rematerialisation happens when back in view, at a safe spot (`opponent.c:1589-1601`, `2030-2075`).
  - Cops simply stop.
  - "In view" is a distance test against yon+10 (`opponent.c:2277-2283`, `2630`); no frustum test.
- **Transfer, high value:**
  - Our `brain.think` / `police.think` / `traffic.think` run **every fixed step** (240/120 Hz): `engine.ts:574-577` → `engine-race.ts:500,542-557`. Run them at render rate or about 30 Hz and hold the `DriveInput` between steps.
  - Give each car a random phase for its expensive checks.
  - Extend the traffic `dormant` bubble (`engine-race-field.ts:144,588`) with a "racer out of sight more than N s → kinematic along the racing line, no physics" mode.

## 6. Fixed 1/240 s step, every car, no sleeping of resting wrecks

- **Rate.** 25 Hz plus pose rewind (§0).
- **Sleep rule** (`CollCheck` `car.c:3203-3219`): set `doing_nothing_flag` when all of these hold:
  - |v|² < 0.05;
  - spin small vs total force;
  - ≥3 contacts;
  - vertical normal force between 90 % and 110 % of gravity·dt.
- **Which bodies may sleep.** For cars, only when `max_force_rear == 0`, i.e. no wheel on the ground (`2754-2756`): a wreck on its roof or side. A car on its wheels never sleeps, because its driver may throttle. Non-cars always may.
- **Sleeping bodies cost nothing.** They are skipped before `GetFacesInBox` and the step (`car.c:1372-1376`, non-cars `1388-1390`). Peds ignore them (`pedestrn.c:1775`). Smoke is off (`car.c:1147`).
- **Wake:** car contact (`6702-6703`).
- **Matrix renormalise:** every 50th reset, not every step (`ResetOldmat` `car.c:1185-1199`).
- **Transfer:**
  - (a) Wreck sleep. Condition: drivetrain dead (or no wheel grounded), plus v and ω under threshold, plus ≥3 contacts, plus support ≈ weight, held for N steps. Then skip that car's integrate, its surface queries (§1) and its cage refit. Wake on `resolveCarPair` hit, `stirNear`, or ragdoll/prop impact. Same pattern as `loose-step.ts:156-189`, applied to cars.
  - (b) Renormalise quaternions every N steps.
  - (c) Split rate [GUESS: design judgement]: player and on-screen cars at 1/240, off-screen non-player cars at 1/60 (sub-stepped only when in contact).

## 7. General "do less" patterns in their main loop worth stealing

1. Expensive per-step work goes through **per-body caches refilled rarely**, with predictive padding: faces (`car.c:756-777`). The world AABB comes out of that as a free byproduct and becomes the pair broadphase (`6451`).
2. **Early bail before per-point loops:** no face touches the swept OBB → return (`car.c:3006`). Pair swept AABBs disjoint → return (`6647-6654`).
3. **Hard caps everywhere:** 4 contacts, 50 faces per car per check, 150-face pool, 5 physics steps per frame, 5 solver passes then halt, 15 shrapnel, 32 sparks, 600 crushed vertices per hit.
4. **Distance/visibility gates on cosmetic and physical side-effects.** All are cheap squared-distance (plus `PointOutOfSight` dot-product half-space) or Chebyshev box tests (`world.c:3529-3555`, `pedestrn.c:2531-2533`):
   - crush (`car.c:3555`);
   - wheel wobble (`crush.c:1325`);
   - grooves (`world.c:4283`);
   - car render (`car.c:4535`);
   - peds (`pedestrn.c:2531`).
5. **Out of sight = different simulation, not slower simulation:** AI on rails (`oppoproc.c:484+`), peds frozen or snapped (`pedestrn.c:2531-2540`), props returned to static (`car.c:7680+`).
6. **AI and game logic once per render frame;** only rigid bodies at a fixed rate (`mainloop.c:633-642`).
7. **Jittered per-entity timers** spread expensive queries out (`opponent.c:2255,2265,2656`), instead of a round-robin index.
8. **User detail knobs that also cut simulation:** yon drives AI dematerialisation (`opponent.c:2630`), and accessories off removes props from collision (`finteray.c:819`). Worth copying as a "physics detail" setting tied to draw distance.
9. **Coalesced, draw-time mesh updates** (`crush.c:320-339`): N dents per frame produce one GPU upload.
