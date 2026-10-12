# RevRender: three.js render CPU (city bench + fleet), HEAD ecbc560e = `~/crash-wt/bis/cost-x7`

Render files are byte-identical between cost-w4 (the live-profile build) and cost-x7 (`diff -rq` shows only engine-scenes, engine-camera, car-air, car-surfaces, surfaces differ), so the profile's src lines are HEAD lines. three 0.186.0.
Scratch (throwaway): `~/crash-wt/scratch-RevRender/` holds `census.mjs` (real CrashEngine, real `WebGLRenderer.render` on a Proxy GL, city bench race = `benchPlan("?bench=city")`, seed 4242, tier high, 1280×720), `frames-count.cjs`, `nprof.cjs`, `patch-three.cjs`, `tree-p/` (cost-x7 src + patched three copy).
Every node run went through `flock ~/crash-wt/ab.lock`; load is noted beside each number. Absolute node ms are unreliable under load, so I report A/B ratios from interleaved ABBA 60-frame chunks in one process.

## 1. Measured share

### Live Chrome, city (`city-live.cpuprofile`)
`node scratch-RevRender/frames-count.cjs city-live.cpuprofile` gives 2216 rAF frames in 20.19 s and 6.51 ms of CPU per frame (inclusive `engine-bench.ts:361`).

| function | incl ms/frame | self ms/frame |
|---|---|---|
| `WebGLRenderer.render` three.module.js:17674 | **2.01** | 0.01 |
| … main scene (via `engine-post.ts:321`) | 1.76 | |
| … 10 post blits (`engine-post.ts:376-380`) | 0.19 | |
| … mark map (`engine-marks.ts:320`) | 0.06 | |
| `renderBufferDirect` 17233 (both passes) | 0.95 | 0.07 |
| `setProgram` 18407 | 0.64 | 0.11 |
| `WebGLUniforms.upload` 6123 | 0.27 | |
| `projectObject` 17897 | 0.40 | 0.125 |
| `WebGLObjects.update` 4612 | 0.38 | 0.10 |
| `WebGLGeometries.update` 4192 | 0.26 | 0.20 |
| `WebGLShadowMap.render` 9143 (wrapped at `wheel-batch.ts:127`) | 0.32 | |
| `Object3D.updateMatrixWorld` three.core.js:13067 | 0.26 | 0.22 |

The table comes from `cpuprof-map.cjs city-live.cpuprofile 400` and `callers.cjs city-live.cpuprofile '<line>$' 0 99 3`. 98% of `updateMatrixWorld` comes from the renderer's own `scene.updateMatrixWorld()` inside `PostFX.render`.

**Unexplained, browser-only:** 308 ms of the `objects.update`/`geometries.update` self time (0.14 ms/frame, 47% of it) lies under the 10 post blits. Each blit draws one 2-attribute triangle, which works out to about 14 µs per blit. The same path costs about 0 in node: blit total 0.4 ms over 600 frames, from `nprof` on `x7-render.cpuprofile`.

### Live Chrome, fleet (`fleet32-live.cpuprofile`)
I counted 325 frames with `FRAME_RE='engine\.ts:384$'`. This is approximate: frames run back to back, so the gap rule merges some. Render is 4.86 ms/frame and `geometries.update` is 1.2 ms/frame. 56% of the latter is under the shadow pass, which touches the skins first and so absorbs the upload work (`callers.cjs … 'three.module.js:4192$'`).

### Node census (cost-x7)
Command: `flock … env ROOT=…/cost-x7 WARM=1500 N=120 TIER=high node --experimental-strip-types census.mjs`. Racing at t=20.5 s, load 1.4–1.7.
- **Scene graph:** 1315 objects, 1111 of them visible. 728 Mesh, 36 InstancedMesh, 1 BatchedMesh, 34 Line, 366 Group, 133 Object3D, 13 Lights. Cars account for about 1120 objects (31–38 each × 32 `live()`). The hidden derby arena, barrier, rigs and pools stay in the race scene and are traversed every frame (204 hidden objects).
- **`matrixAutoUpdate`:** true on 1305 of 1315 objects; only the `derby-arena.ts:351` children are false. 971 objects never changed position, quaternion or scale in 120 frames (773 visible, 568 of them visible renderables). 232 of these sit under fully static ancestry; 749 are static-local under a moving parent.
- **Draws:** 304/frame = 242 main + 62 shadow, 210k triangles. That is 12 `render()` calls/frame: the scene, the mark map and 10 blits.
  - Main pass: 82.6 material switches and 34.7 program switches per frame, across 84 distinct materials (`MODE=draws`, load 1.9).
  - By owner (`MODE=draws`, load 3.9): car parts ≈135 main draws; loose torn parts ≈81 (world Mesh 45, panels 17, Group meshes 19); track and props ≈17. Shadow draws: car parts 49 of 62.
- **Uploads:** 26–30 attributes/frame, 147 KB/frame, no textures.
  - Callers per frame: `SkinTrack.show` and `SkinTrack.restore` (pose-blend.ts:98, :109) 4.7 each; `LampBatch.sync` (lamp-lights.ts:360) 4; `computeNormalsFast` (fast-normals.ts:57) 3.2; `WheelLane.end` (wheel-batch.ts:60/63/67) 2 each; `skinPanel` (deform-state.ts:522) 1.8; fx 1 each.
  - Identical-content re-uploads (hashed at the start of the main render): 4/frame (instanceColor, blur, Points color).
- **Loose torn parts on the ground** (`MODE=debris`, load 2.2):

  | race time | 5.5 s | 15.5 s | 25.5 s | 35.5 s | 45.5 s | 55.5 s |
  |---|---|---|---|---|---|---|
  | loose meshes | 25 | 71 | 89 | 106 | 110 | 97 |

  About half use the shared parts material (#61, `car-materials.ts:256`). Every one has its own geometry: distinct shapes ≈ count.
- **Fleet** (`SCENE=fleet WARM=1000 N=120`, load 1.7): 711 draws/frame (573 main + 138 shadow), 369k triangles. 223 attribute uploads/frame (1.09 MB), driven by `SkinTrack.show`/`restore` at 184/frame each. Only 5/frame are redundant.

**Draw calls from the bench card:** `engine-bench.ts:471` logs `renderer.info.render.calls`. The 4KBA card reports 155 calls / 123k triangles (chrome-trace-report.md). That is lower than node's 304: node runs at a different time in the race and a different view. **[INFERENCE]** Dividing Chrome render time by node draws gives about 6.6 µs/draw (2.01 ms / 304) in the city and 6.8 µs/draw (4.86 / 711) in the fleet. That consistency is my only bridge from node draw counts to Chrome ms; the live calls count is needed to confirm it.

## 2. The waste (file:line in HEAD)
1. **Each loose torn part is its own draw, forever.** `detachPart` at `car-parts.ts:618-640` does `world.add(p.object)`. From then on each part is a separate Mesh in projection, the matrix pass and the draw loop. They grow to 100+ per race. About half share one material (`partsMaterial`, `car-materials.ts:256`) yet are drawn one by one.
2. **Per-car paint material.** `car-core.ts:386-387` and `car-look.ts:91-93` call `makePaintMaterial(color)` (`car-materials.ts:193`), creating one MeshPhysicalMaterial per car that differs only in colour; the textures are already shared via `once` at :53. Sorting by material id (three.module.js:8058) cannot merge them, so each car's paint costs a full material refresh (`refreshMaterialUniforms` + `WebGLUniforms.upload`, three.module.js:18786-18829).
3. **Matrix flags don't work the way they read.** `updateMatrixWorld` (three.core.js:13067-13105) calls `updateMatrix()` on any object whose `matrixAutoUpdate` is true, and that call sets `matrixWorldNeedsUpdate`, which forces the whole subtree. The Scene and the arena root keep `matrixAutoUpdate` true, so every object's world multiply runs every frame. `derby-arena.ts:351` therefore saves only the compose on the arena's children.
4. **Per-object map lookups.** `WebGLObjects.update` (4612-4669) does a WeakMap get/set per object per pass. `WebGLGeometries.update` (4192-4204) runs a for-in plus a WeakMap get per attribute (`WebGLAttributes.update` 242-285), even when no version changed. This is the browser-side cost noted above; in node it is 0.11 ms/frame.

## 3. Ranked cuts

| # | cut | change | gain (measured, load) | exact? | proof |
|---|---|---|---|---|---|
| 1 | **LooseBatch** | One `THREE.BatchedMesh` on `partsMaterial` for torn parts, on the `LampBatch`/`WheelBatch`/`TerrainBatch` pattern. Register a part's partsMaterial meshes in `detachPart` after `showOnCamera` (car-parts.ts:639), take them off layer 0, and `setMatrixAt` from `matrixWorld` in `scene.onBeforeRender` (engine.ts:213-217). `setGeometryAt` when a dent bumps the version (loose-dent.ts:139). Remove on re-attach or reset (car.ts:614, :651). | Upper bound, hiding those meshes, t≈41–50 s, about 32–36 fewer calls: node render ratio **0.773** (load 2.25), **0.89** (2.40), **0.943** (2.92). That is 3–12 µs/draw in node. **[INFERENCE]** about 34 draws × 6.6 µs ≈ **0.22 ms/frame Chrome (3.4%)**, growing with debris, more in replays and late race. | Sim-exact (render only). Pixels near-identical: batching shader path, same material. | Pose digest equal (`MODE=gl` `poseDigest`, -942554134 at WARM=600 N=120). Race-row digests plus fleet 795525135. Main draws ↓ ≥30 (`MODE=draws`). Screenshot diff of a saved clip frame in the browser. |
| 2 | Shared paint | One paint material for all cars; colour moved to a constant `color` attribute on body, door, hood, trunk and panel geometries (`vertexColors: true`), livery included. | Cost-only A/B forcing one shared paint material: switches 70.2→44.7, node render ratio **0.941** (load 3.52). Node is a **lower bound**: the Proxy GL reports no active uniforms, so node uploads none. **[INFERENCE]** Chrome ≈25 × 4.1 µs ≈ **0.10 ms (1.6%)**, using (refresh 162 + upload 594 ms) / 2216 / 82.6. | Sim-exact. Pixels within interpolation rounding. | Material switches/frame ↓ ~25 (`MODE=draws`), screenshot diff. |
| 3 | pnpm patch three | `pnpm patch three@0.186.0`, `scratch-RevRender/patch-three.cjs` applied unconditionally. (1) frame stamp `_glFrame` on the geometry instead of `updateMap` in `WebGLObjects.update`. (2) Cached `Object.values(attributes)` list, re-read when `setAttribute`/`deleteAttribute` bump an `_attrEpoch`, instead of for-in in `WebGLGeometries.update`. (3) Buffer record on the attribute (`_glData`) instead of the `buffers` WeakMap get. Fields are initialised in the `BufferGeometry` ctor. Single renderer only (engine.ts:76 is the only `WebGLRenderer`). | node render ratio **0.996** (load 2.1–2.2, `MODE=ab PB=7`), i.e. none in node. Chrome holds 0.30 ms/frame of self in 4192+4612, 0.14 of it under the blits that node does not reproduce. **Browser-only**. | GL-stream exact | GL call digest equal P=0 / P=7 / P=0: 2037283901 ×3. The instrument is live: hiding one mesh gives 1368849971. Pose digest equal. |
| 4 | Static matrices | `scene.matrixAutoUpdate=false` plus freeze static subtrees and static-local car children. | Upper bound, freezing all 971 objects that sat still for 120 frames: `scene.updateMatrixWorld` ratio 0.821, render ratio 0.965 (load 1.67) ≈ **0.05 ms Chrome (0.7%)**. **Unsafe:** 3928 of those objects moved later (`disagreeInB`). | Exact only if flags are right | Reject: below 2% and fragile. |
| 5 | Upload trims | already range-limited (wheel-batch.ts:58-67, lamp-lights.ts:358-360) | `bufferSubData` 62 ms / 20 s = 0.03 ms/frame Chrome; redundant re-uploads 4/frame city, 5/frame fleet | n/a | Reject: no CPU in it. |
| 6 | Fewer shadow casters / shadow rate | car parts are 49 of 62 shadow draws; pass 0.32 ms | unmeasured | Visual change | Owner call. |
| 7 | Per-car part merge | car parts are 135 main draws (city), about 515 (fleet) | unmeasured; the largest lever (fleet 573 main draws) | Design change: parts tear off | Separate design. |

Ruled out from the profile: shadow-sampler uniforms per draw (`setValueT1Array` 23.9 ms / 20 s = 0.01 ms/frame); `findLightProbeGrid` is not in the top list.

## 4. Recommended first lane: LooseBatch
- **Tree:** `git -C ~/github/crash-deformer-test worktree add ~/crash-wt/bis/lane-loosebatch HEAD`, then symlink node_modules into it.
- **Build:**
  1. New `src/game/vehicle/loose-batch.ts`: `class LooseBatch extends THREE.BatchedMesh` on the shared `partsMaterial`. `sortObjects=false`, `perObjectFrustumCulled=true`, `frustumCulled=false`.
  2. API: `add(mesh)` (`addGeometry` + `addInstance`; `mesh.layers.disable(0)`), `remove(mesh)` (`deleteInstance`/`deleteGeometry`; `layers.enable(0)`), `sync()` (`setMatrixAt(id, mesh.matrixWorld)` for every registered mesh; `setVisibleAt` from the mesh's ancestors' `visible`; `setGeometryAt` when the position attribute's `version` moved).
  3. Size from the pool: `setInstanceCount`/`setGeometrySize` growth, or the sum of every car's detachable partsMaterial meshes. First check that all partsMaterial geometries share indexed-ness and attributes (position, normal, uv, color).
- **Wire:**
  - `detachPart` (car-parts.ts:618): after `p.object.traverse(showOnCamera)` (:639), add each descendant mesh whose `material === partsMaterial()`. Expose `partsMaterial` from car-materials.ts:256; it is currently module-private.
  - Re-attach and reset paths (car.ts:614, :651) and `dispose`: `remove`.
  - `engine.ts:213-217`: `this.looseBatch.sync()` next to `lampBatch.sync`; `scene.add` the batch at :211.
  - The ragdoll, recorder and replay paths read `p.object`, which is untouched.
- **Out of scope:** paint and trim loose shells (per-car materials) and loose wheels.
- **Acceptance** (all through `flock`, load noted):
  1. Draws: `env ROOT=<tree> WARM=2700 N=60 TIER=high MODE=draws node --experimental-strip-types ~/crash-wt/scratch-RevRender/census.mjs` on cost-x7 and the lane. Main draws/frame ↓ ≥ 30, and the `world:Mesh/Mesh` and `world:Group/Mesh` rows collapse.
  2. Speed: `MODE=time WARM=2700 N=600`, alternating cost-x7, lane, cost-x7, lane (×2). `renderMs` lane/x7 ≤ 0.93 in every neighbour pair.
  3. Sim exactness: `MODE=gl GLHASH=1 WARM=600 N=120` shows `poseDigest` equal on both trees. The GL digest is expected to differ. Plus `row1.sh cost-x7 lane-loosebatch 3 CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city` printing `same true`, and fleet5 digest 795525135.
  4. Unit tests: `node --test` on car-parts and loose-step tests, plus any test touching `freeObjects`.
- **Browser-only checks:**
  - live bench card `calls` ↓ and frame CPU ↓;
  - a screenshot of a saved clip frame with lying parts, lane vs x7, with no visible difference (BatchedMesh shader variant);
  - Chrome profile share of `renderBufferDirect`/`projectObject`.

## Can only be verified in a browser
- Live draw counts (node 304 vs card 155) and therefore every Chrome-ms estimate above marked [INFERENCE].
- The 0.14 ms/frame of `objects.update` under the post blits.
- Any gain from the pnpm patch (#3): node shows none, and the Chrome-only cost is where it would act.
- Real uniform-upload cost per material switch, since the node GL stub reports no active uniforms.
- Pixel equality of BatchedMesh and vertex-colour paint.
- GPU-side effects of draw and upload changes.
