# RevLoadCage: cage build at page load (car-cage.ts `buildStyle` / `decimate` / `cost`)

HEAD = `~/crash-wt/bis/cost-x7`. `car-cage.ts` and `car-cage-rig.ts` are byte-identical in cost-w4, cost-x7 and main (`diff -q`), so the trace's line numbers are HEAD's.
Scratch: `~/crash-wt/scratch-RevLoadCage/` (`tree` = copy of cost-x7, `mtree` = prototype, `ctree`/`mctree`/`mchk` = counter copies). Probe: `cage-probe.ts` (in each tree) builds one `DeformableCar` per style, then `CarCage.shared({}, () => src)` (a fresh key always builds) and prints build ms plus a sha1 over `source, tris, triGroup, pristine.pos/top/bottom/covered/planBox`.
Load was 2.8–6.8 the whole run (another session's e2e). Absolute ms are unreliable; read ratios. Every run below the first two went through `flock ~/crash-wt/ab.lock`. The first timing run (load 2.78) and the counter runs did not; counts are deterministic.

## 1. Share

| Source | Number | Command / where |
|---|---|---|
| Chrome load trace (cost-w4) | 1 871 ms inclusive on the main thread, 31.8 % of the 5.88 s trace. `cost` :350 self 1 326, `decimate` :219 self 286, `buildStyle` :1097 self 175 | chrome-trace-report §6 row 1 |
| Node, HEAD, cold first pass, 6 styles | sum 1 897 / 1 918 ms (A,B,A,B neighbours, load 6.78→4.20). Per style 287–370 ms; police costs the most (2 235 mesh verts) | `cd scratch-RevLoadCage/tree && flock …/ab.lock node --experimental-strip-types cage-probe.ts` |
| Node profile, HEAD, 12 builds | `buildStyle` 3 888 ms inclusive. `decimate` 3 496 (90 %). `cost` self 2 815 (72 %). `decimate` self 670. `buildStyle` self 378 (V8-inlined decimate code: it falls to 18 ms once decimate is cut). `cageSourceOf` < 1 ms/style; car construction 7–40 ms/style | `node --experimental-strip-types --cpu-prof --cpu-prof-interval 250 --cpu-prof-dir prof --cpu-prof-name cage.cpuprofile cage-probe.ts`; `cpuprof-map.cjs prof/cage.cpuprofile 25` (load 4.29) |

Node and Chrome agree: about 300 ms per style, about 1.9 s for all six.

**How many styles are built at load, and how many the first scene uses.** The cache is `STYLES` (car-cage.ts:1059). It is a WeakMap keyed by `car.style`, the static `CAR_STYLES[id]` object (car-core.ts:379), so each process builds at most 6 styles (`CAR_STYLE_IDS`, car-variants.ts:15). All 6 are built before the first bench frame:
- Lab `stockCage` (lab.ts:180, called from `planHalf`/`cardsLayout`) builds the sedan from a throwaway `DeformableCar`. Trace: 305 ms.
- `warmPrograms` (engine-warm.ts:41) calls `setRigVisible(true)` on every live car. That reaches car.ts:600 → `updateHullHelper` (car-core.ts:644), whose `this.cage.fields.planBox` creates the `CageRig`. `INITIAL_HUD.carCount = 5` (hud-store.ts:243) gives the 5 fleet styles, so 4 new builds (sedan is already cached). Trace: 1 210 ms ≈ 4 × 300. The only purpose here is the G-key overlay's box.
- `startStep` → `solverSize()` (engine-record.ts:241 → car.ts:91) builds police on the first bench tick. Trace: ≥ 356 ms; node: police 357–370 ms.

The city bench (16 racers + police) uses all 6 styles. The cage is every car's contact shape (`loadPoints` car-air.ts:634, `CarSurfaces.sync` car-surfaces.ts:386, sat.ts, prop-contact.ts). So building lazily per style only moves the cost into the race, and saves nothing on the bench.

**Is it deterministic from static inputs?** Yes. Inputs come from `cageSourceOf` (car-cage-rig.ts:61): rest mesh, skin tables, panels and interior, all from the style's generated geometry. `Math.random` in vehicle/ and deform/ appears only in canvas textures (car-materials.ts:63, :362). `decimate` iterates Map/Set in insertion order and uses only `+ - * / sqrt`. The hash of every style matched across passes and processes (e.g. sedan `c8bd8e2359e9`, police `7b064b215339`). Outputs are 54 KB per style with fields, but only about 3 KB per style is decimate's own output (`source` ≈ 251 × 4 B, `tris` ≈ 330 × 6 B, `triGroup`).

## 2. The waste: `decimate` is quadratic

Collapse loop: car-cage.ts:428-457. Each pass of `while (remaining > target)` scans every alive vertex's every neighbour edge and calls `cost(u, v)` (:350) afresh. `cost` walks `incident[from]` (which only grows; dead triangles are skipped at :353), recomputes two normals per triangle, and merges the quadric.

Yet a collapse `from → to` changes only what is read by:
- `to` (Q[to] at :404, `incident[to]` at :415),
- `to`'s neighbours after the collapse (their neighbour sets and the rewired triangles at :414–:422; every triangle that held `from` now holds only `to` and `to`'s neighbours),
- `from` (dead),
- the mirror twins of all of those (the filter at :439 reads `vertexAlive[twin]` and `neighbours[twin]`).

Every other vertex's scan result is unchanged.

Counts (injected `__N`, `cage-inject.mjs` on `ctree`, `PASSES=1`):

| style | welded verts | welded tris | passes | `cost()` calls | interior: passes / calls |
|---|---|---|---|---|---|
| sedan | 1 781 | 3 302 | 832 | 3 090 222 | 90 / 22 864 |
| police | 1 829 | 3 374 | 858 | 3 219 480 | 90 / 22 864 |
| pickup | 1 661 | 3 062 | 770 | 2 682 620 | 90 / 22 864 |

That is about 3 700 directed edges per pass × about 830 passes: O(V·E). About 3.1 M `cost` calls per style, where about 60 k can change.

On the other questions:
- **Worker:** possible, since inputs and outputs are plain typed arrays. But the getters need the result synchronously (`solverSize`, `planHalf`, contact), so a worker means an async prebuild plus gating. After cut 1 it is not worth it.
- **Precomputed asset or IndexedDB memo:** also possible, but it needs an input hash to catch a stale asset. Not worth it after cut 1 either.

## 3. Ranked cuts

### Cut 1: memoise each vertex's best collapse and rescan only touched vertices. Exact. Prototyped.

Change, inside `decimate` only, replacing :428-457 (prototype diff: `scratch-RevLoadCage/memo.diff`, 76 lines; generator `cage-memo.mjs`):
- Add `bestCost: Float64Array(nv)`, `bestOnto: Int32Array(nv)` and `stale: Uint8Array(nv).fill(1)`.
- `scan(u)` is the old inner loop body (:435-446) for one `u`. It keeps the first strict minimum in `neighbours[u]` order, then clears `stale[u]`.
- `touched(from, to)` marks `from`, `to` and every `w` in `neighbours[to]` stale, each together with its `mirror[]` twin. Call it after both `collapse` calls (:451, :454).
- The pass loop runs `for u: if alive { if stale[u] scan(u); if bestCost[u] < best → pick }`.

This takes the same pick as the old scan, including ties. The old scan takes the first strict minimum in (u ascending, neighbour insertion order). Per-u first-minimum followed by a strict-< argmin over ascending u gives the same edge.

Proof (all 6 styles, `PASSES=1`):
- **Disagreement counter:** `mchk` (memo plus the old full scan run alongside each pass, comparing `bestFrom`, `bestTo`, `Object.is(best)`): **0 disagreements in 5 372 compared passes** (sedan 922, hatchback 870, wagon 879, coupe 893, pickup 860, police 948).
- **Output hashes:** identical to HEAD for every style (`c8bd8e2359e9 d32aed43acd2 9d9c1a367894 f70be3d14177 77876dbe548f 7b064b215339`).
- **`cost()` calls:** 3 090 222 → 60 303 for the sedan, 51× fewer (`mctree`).
- **Unit tests:** `flock …/ab.lock node --experimental-strip-types --test src/game/vehicle/car-cage.test.ts` in `mtree`: tests 30, pass 27, fail 0 (load 3.31). The other 3 are not failures [INFERENCE: skip/todo].

Gain (node, `cage-probe.ts`, A=tree / B=mtree interleaved A,B,A,B, load 6.78→4.20, flocked):

| | A (HEAD) | B (memo) | ratio |
|---|---|---|---|
| cold first pass, 6 styles, run 1 | 1 897 ms | 137 ms | 13.8× |
| cold first pass, 6 styles, run 2 | 1 918 ms | 143 ms | 13.4× |
| all 12 builds, run 1 | 3 841 ms | 238 ms | 16.1× |
| all 12 builds, run 2 | 3 925 ms | 248 ms | 15.8× |

After the cut (memo profile, load 4.34), per build: `decimate` self about 8 ms, `cost` about 7 ms, `scan` 1.5 ms. The trace's 1.87 s should scale to about 0.13–0.14 s [INFERENCE: ratio carried from node to Chrome; not re-measured in a browser]. That is about 1.7 s off time-to-first-bench-frame and off the 1.21 s warm task.

Since the cage outputs are bit-identical, the sim cannot change. A lane should still show the fleet digest 795525135 and one race-row digest, per the contract.

### Cut 2: decimate's remaining self time, about 8 ms/build. Exact; unmeasured split.

Candidates:
- String keys: weld at :226, `seen` at :252 using `sort().join`, `placeOf` at :397.
- `incident[]` lists that only grow (:415).

These could become integer keys (quantised ints packed into a Map<number>) or a compaction step. Ceiling is about 8 ms × 6 ≈ 50 ms per page load. Do this only if cut 1 lands and the trace still shows `decimate`. Exactness check: the same hash probe.

### Cut 3: stop forcing cages in `warmPrograms` and `solverSize`. Exact; YAGNI after cut 1.

- `updateHullHelper` during warm (engine-warm.ts:41 → car.ts:600) builds cages only to draw the G-key box.
- `solverSize` (car.ts:91) needs only `stateSize()` = 1 + ceil(restInputs.length / 2), and `restInputs.length` (car-cage.ts:1146) follows from rig counts.

Neither saves anything on the bench, because the race needs every style's cage. It only moves the cost: after cut 1, police's about 20 ms moves off the first bench tick. Not recommended.

### Not in scope, noted: the 365 ms "shader warm"

Per the trace report §6, this is `warmCrashPath` (world-step.ts:292, 223 ms: 4 sedan cars plus 2 × 240 `stepWorld` steps, deliberate main-thread JIT warm-up) plus `warmScene` (142 ms of three.js link checks). Neither contains a cage build: the sedan is already cached. I did not measure it here.

## 4. Recommended first lane: cut 1

**Brief.** In `src/game/vehicle/car-cage.ts` `decimate`, replace the collapse loop (:428-457) with the memoised per-vertex best scan in `~/crash-wt/scratch-RevLoadCage/memo.diff`:
- `bestCost`, `bestOnto`, `stale`, plus the `scan`, `touch` and `touched` closures. `touched(from, to)` runs after each `collapse`.
- Keep `scan`'s body textually identical to the old inner loop.
- Add a one-line comment saying why only `from`, `to`, `to`'s neighbours and their mirror twins are rescanned.
- No other file changes.

**Acceptance.**
1. Run `cage-probe.ts` (copy it from the scratch tree) in the lane tree under `flock`. All 6 style hashes equal HEAD's (list above).
2. Disagreement check: `node cage-memo.mjs <copy> check && node cage-inject.mjs <copy>`, then run the probe. `__N[8]` must be 0 for every style; `__N[9]` gives the passes compared.
3. `node --experimental-strip-types --test src/game/vehicle/car-cage.test.ts` passes.
4. Run the probe interleaved HEAD/lane, A,B,A,B. Expect the cold 6-style sum about 13× lower; note `/proc/loadavg` next to each number.
5. Fleet digest 795525135 and the city race-row digests unchanged.
6. In Chrome (Main/owner): a load trace should show the `buildStyle` inclusive total ≲ 0.2 s, down from 1.87 s.
