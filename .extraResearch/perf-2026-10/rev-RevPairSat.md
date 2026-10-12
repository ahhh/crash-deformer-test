# RevPairSat: car-vs-car contact (deepestIn / satCars / resolveCarPair / outlineOf / planField)

HEAD = cost-x7 (ecbc560e). Load is noted next to every timed number. Absolute ms under load: unreliable; use shares and ratios.

## 1. Measured share

**Live Chrome, fleet aftermath** (`node cpuprof-map.cjs fleet32-live.cpuprofile 40 12 13`, cost-w4 lines, 1 s window, 78–103 ms frames):
| fn (cost-w4 line) | incl ms/s | self ms/s |
|---|---|---|
| resolveCarPair pair-contact.ts:396 | 128.9 (12.9 %) | – |
| satCars sat.ts:195 | 111.8 (11.2 %) | – |
| deepestIn sat.ts:97 | 109.8 (11.0 %) | 48.2 (4.8 %; bandAround + sampleAt inlined) |
| planFieldOf car-cage.ts:831 | 60.3 (6.0 %) | 6.8 |
| transformGrid car-cage.ts:813 | 53.5 (5.3 %) | 53.5 |
| CageOutline.refresh cage-outline.ts:37 | – | 14.0 (1.4 %) |
`callers.cjs … 'car-cage.ts:831|cage-outline.ts:37|car-cage.ts:1224' 12 13 3`: 72 % of that under deepestIn, 17 % refresh via worldBand/bandsMeet, 10 % engine-ragdoll.ts:975.
City live: resolveCarPair 1.1 % of busy, so this hotspot only matters in crashes and pile-ups.

**Node fleet profile**, cost-x7. Load 2.72. `cd fleet-bench && flock …/ab.lock env ROOT=…/bis/cost-x7 CARS=32 FRAMES=1500 SEED=4242 PROF=/tmp/rps-x7.cpuprofile node --experimental-strip-types fleet5.mjs`. Run: 29.3 s for 1500 frames, digest 795525135.
| fn | incl ms (% run) | per frame |
|---|---|---|
| resolveCarPair | 3339 (11.4 %) | 2.23 ms |
| satCars | 2655 (9.1 %) | 1.77 |
| deepestIn | 2597 (8.9 %) | 1.73 |
| ├ planField→planFieldOf | 1176 (4.0 %) (transformGrid 1085) | 0.78 |
| ├ bandAround | 606 (2.1 %) | 0.40 |
| ├ deepestIn self | 604 (2.1 %) | 0.40 |
| └ outlineNormal | 191 | 0.13 |
| bandsMeet (350 of it from markApproaches) | 426 (1.5 %) (refresh 296) | 0.28 |
| resolveCarPair minus satCars | 684 (feedOverlap 177, exchangePair 71, pushApart 69, faceSpeeds 63) | 0.46 |
Splits come from `/tmp/rps-pc.cjs` (by caller) and `/tmp/rps-pcallee.cjs` (by callee): copies of `local://pc.cjs` and `local://pcallee.cjs`.

## 2. Counts (answers to the questions)
I injected counters into a throwaway copy with `local://rps-patch.mjs` + `local://rps-patch2.mjs`. The digest was unchanged with counters in (795525135).
Fleet command: `flock …/ab.lock env ROOT=/tmp/rps-cnt CARS=32 FRAMES=1500 SEED=4242 node --experimental-strip-types fleet5.mjs`.
City command: `flock …/ab.lock env ROOTS=c=/tmp/rps-cnt CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city MODE=count node --experimental-strip-types --import /tmp/rps-n.mjs drive.mjs`; counts include the warm-up.

| | fleet (5867 slices) | city (9277 slices) |
|---|---|---|
| near pairs → resolveCarPair calls / slice | 81.0 | 13.1 |
| past 5.2 m gate (= satCars past 6 m) / slice | 33.0 | 5.09 |
| deepestIn calls / slice | 66.0 | 10.2 |
| contacts (satCars non-null) / slice | 13.6 | 1.41 |
| outline nodes transformed / deepestIn call | 219 | 221 |
| nodes in b's padded box | 7.3 % | 2.8 % |
| nodes with depth > 0 (bandAround calls) | 4,520,256 | 411,551 |
| **bandAround repeats (same cage, fit, node)** | **78.6 %** | **90.1 %** |
| **deepestIn calls rejectable by box broadphase** | **160,095 / 387,392 (41 %), disagreements 0** | **56,701 / 94,408 (60 %), 0** |
| planField rebuilds | 6287 (1.07/slice) | 1037 |
| … with `covered` unchanged since last build | 461 (7.3 %) | 20 |
| … if planField were lazy (first in-lattice node) | 6275 (−0.2 %) | 883 (−15 %) |
| outline rebuilds / rebuilt but never walked by deepestIn | 6380 / 0 | 1607 / 541 |
| markApproaches bandsMeet calls / pairs passing the closing+gap arithmetic | 474,127 / 71,346 (15 %) | 0 / 0 |

- **Pairs and contacts per step:** about 33 pairs per slice reach SAT in the fleet and 41 % of them produce a contact (13.6 per slice). In the city it is 5.1 pairs per slice and 1.4 contacts.
- **Cheap exact broadphase before `deepestIn`'s walk:** none exists. Only the 6 m centre test runs (sat.ts:200). The per-node box test (sat.ts:131) runs after all 219 nodes have been transformed. Transforming a's outline bounds into b's frame and testing them against b's box padded by `look` rejects 41–60 % of calls exactly (see §3).
- **`outlineOf(a)` per pair?** No. It is rebuilt once per fit, keyed by `(fields, serial)` (cage-outline.ts:38). Per pair it costs only a WeakMap get (outlineOf self 12.5 ms per run).
- **`planField()` per call?** No. It is rebuilt once per fit, on the first ask after the fit (car-cage.ts:832, `planFresh`), at about 187 µs a rebuild (1176 ms / 6287). The rebuild rate follows the refit rate. Lazy or covered-unchanged skipping saves only 0.2–7 % in the fleet, so the cost has to come out of the EDT itself.
- **Height-overlap test before the outline walk:** yes, `bandsMeet` (world-step.ts:232; it is also called at :208 and in `markApproaches` pair-contact.ts:102), plus a per-node window check (sat.ts:137-149). The per-node check needs `bandAround` (49 node reads), and that read is the repeated waste.
- **Allocation per pair:** none. satCars, deepestIn and resolveCarPair use module scratch (pair-contact.ts:17-30, 259-264, 335, 375; sat.ts:17, 85-87). GC is 69 ms per run (0.2 %).

## 3. Waste and ranked cuts (all three prototyped, all exact)
Prototype tree: `~/crash-wt/bis/rps-proto` (cp of cost-x7 + `local://rps-proto.mjs`; 100 changed lines in 3 files; `tsc --noEmit` clean).
Profile: same command with ROOT=rps-proto, PROF=/tmp/rps-proto.cpuprofile, load 2.27. stepWorld is 21.2 s in both profiles.

**C1. Memoise `bandAround` per fit** (sat.ts:142).
- Waste: sat.ts:142 recomputes a 7×7 window min/max over b's fields for every depth>0 node of every pair and slice. The answer changes only when b refits, and 79–90 % of calls are repeats.
- Change: give `CageOutline` (cage-outline.ts:21) `bands: Float64Array(2·nu·nv)`, `bandStamp: Int32Array(nu·nv)` and `epoch` (bumped in `refresh` when it rebuilds), plus a method `band(i, j, out)` that computes through `bandAround` on a stamp miss. deepestIn calls `outlineOf(b).band(…)` in place of `bandAround(fb, …)`.
- Exact: same function, same inputs, invalidated by the same `(fields, serial)` key the outline already trusts (every `fit` bumps `serial`, car-cage.ts:1012).
- Measured: bandAround 606 ms (2.1 %) → band 305 ms (1.0 %).

**C2. Box broadphase in `deepestIn`; `planField()` after it** (sat.ts:98-131).
- Waste: all 219 nodes are transformed and box-tested even when a's whole outline misses b's padded box.
- Change: `refresh` also records the outline's bounds `xLo/xHi/zLo/zHi`. deepestIn evaluates the node-transform sums (same expression and order as sat.ts:129-130) at the 4 corners. If max < xMin, min > xMax, max < zMin or min > zMax: `found.fill(0); return`. Move `b.cage.planField()` after that test. Deferring the rebuild is exact: the plan is a pure function of `covered`.
- Exact: each sum is monotone in x and z and IEEE rounding is monotone, so the corners bound every node bit for bit. No epsilon.
- Disagreement counter on the prototype: in the reject branch, rerun the node loop and count calls where any node passes the box. Fleet: 160,095 rejects, **0 disagreements** (`/tmp/rps-pc2`, load 1.59).
- Measured: deepestIn self 604 → 397 ms (−0.7 % of run).

**C3. EDT column pass by two sweeps** (car-cage.ts:813-818, 847-853).
- Waste: the column pass runs the full Felzenszwalb–Huttenlocher transform (a division per element) on a 0/FAR2 image. For binary input the result is just (distance to the nearest seed in the column)², or FAR2 when the column has no seed.
- Change: `seedColumns(nu, nv, covered, inside, g)` does a forward and backward sweep and writes `g` directly, which also replaces the init loop. `transformGrid` keeps only its row loop (`transformRows`).
- Exact: integer squared distances, and FH is exact on integer data.
- Microbench `local://edt-bench.mjs` (verbatim copies of the old code): 502 masks (300 car-like, 200 random, empty, full), **0 float mismatches**. Positive control (one injected off-by-one): 1498 mismatches. Time per plan, interleaved in one process: old 171/174/153 µs vs new 121/123/108 µs, **ratio 0.70** (load 4.47).
- Measured in the fleet profile: transformGrid 1085 ms → transformRows 616 + seedColumns 260 = 876 ms.

**C1+C2+C3 together:**
- deepestIn incl 2597 → 1933 ms. Shares: deepestIn 8.9 % → 6.6 %, satCars 9.1 % → 6.8 %, resolveCarPair 11.4 % → 9.1 % of the fleet run. That is **−2.3 points**, or about −0.44 ms per fleet frame on average and more in the aftermath.
- Fleet A/B, neighbours, mean ms:
  - Round 1: x7 20.91 (load 3.34), proto 18.00 (load 6.90), x7 17.70, proto 18.71. Unusable at load 3–7.
  - Round 2: proto 18.25 (load 1.87), x7 18.70 (1.36), proto 18.68 (1.18), x7 21.35 (1.34). Ratios 0.976 and 0.999; last neighbour 0.875 is an outlier.
  - Aftermath: 28.84 / 29.89 = 0.965 and 28.05 / 29.89 = 0.938.
- Digests equal in every run: fleet 795525135 (×4), city −787317265 (both arm orders), a0c16 −1920308961, a1c32 −1034506678. Race-row ratios proto/x7: 0.948, 1.011, 1.026, 1.000 (loads 1.3–2.4). That is noise, as expected when contact is about 1 % of the city run.

**Unmeasured follow-ons (smaller):**
- C4. `seedColumns` row-major (per-column `last` in an Int32Array(nu), contiguous rows). It is 260 ms in the fleet run; est. −0.5 %. Exact.
- C5. Skip the EDT when `covered` equals the copy from the last build. 7 % of fleet rebuilds, about −0.2 %. Exact, but needs a 4.7 KB copy per fields.
- C6. `markApproaches` (pair-contact.ts:102): test `closing > WALL_CRUSH && d − 2·FOOT_HALF_L < closing·HIT_AHEAD` before `bandsMeet`. Skips 85 % of those calls. Exact: `markApproach` cannot fire otherwise, and `bandsMeet`'s only side effect is the outline cache. Est. ≤ 0.3 %, because the refresh cost only moves to the pair loop (0 never-walked rebuilds in the fleet).
- C7. Split `worldBand`'s need (outline `low/high`) from the node-list rebuild: city has 34 % never-walked outline rebuilds. City refresh is 0.24 % of busy, so this is low value.
- C8. FH row pass in WASM (bit-identical: IEEE div/sqrt). Est. 2× on the remaining 616 ms. Unmeasured.
- Not recommended: banded or partial EDT. Deep-inside plan values weight the contact centroid and normal, so nothing exact remains to cut there.

## 4. Recommended first lane: land C1+C2+C3 as prototyped
Brief:
1. Make your worktree as in the contract.
2. Apply the changes in `~/crash-wt/bis/rps-proto` (`diff -ru cost-x7/src rps-proto/src`; or `node /tmp/rps-proto.mjs <tree>`, a copy of `local://rps-proto.mjs`) to:
   - cage-outline.ts: `CageOutline` gets `xLo/xHi/zLo/zHi`, `bands/bandStamp/epoch/cage` and `band()`.
   - sat.ts `deepestIn`: corner broadphase before `planField()`; `outlineOf(b).band(...)`; drop the now-unused `bandAround` import.
   - car-cage.ts: `seedColumns` + `transformRows` replace `transformGrid` and the init loop in `planFieldOf`.
3. Add one unit test: `planFieldOf` old FH vs new on car-like + random masks, `Object.is` equal per node (port `edt-bench.mjs`'s check, keep its positive control as a comment).
4. Keep the deepestIn comment updated (out through `found`; broadphase reason).

Acceptance:
- (a) Digest equality on the fleet (795525135) and all three race rows.
- (b) Disagreement counter in the reject branch = 0 on the fleet and city (instrument a `cp -a` copy as `/tmp/rps-pc2` did).
- (c) `PROF=` fleet profile: deepestIn inclusive share ≤ 7.0 % of the run (from 8.9 %).
- (d) fleet5 A,B,A,B at load < 1.5: aftermath-phase mean ratio ≤ 0.97 in both orders.

Then C4 and C6 can go in a second small lane.
