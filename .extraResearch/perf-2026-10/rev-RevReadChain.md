# RevReadChain: wreck rigid-step read chain + cage strain (HEAD ecbc560e = bis/cost-x7)

The box was loaded the whole time (another session's e2e run). Every run below went through `flock ~/crash-wt/ab.lock`, with load noted next to it. Absolute ms are not comparable between runs. Use the in-process interleaved function deltas and the counts.

## 1. Measured share

**Live Chrome, city** (`owner-traces/chrome/city-live.cpuprofile`, cost-w4 lines; `node cpuprof-map.cjs city-live.cpuprofile 600`). 20.2 s span, 15678 ms busy:
- stepFree (w4 :1332): 3320 ms inclusive, 21.2 %
- readPoints (:381): 1653 ms, 10.5 %
- wheelsAt (:711): 576 ms, 3.7 %
- **loadPoints (:612): 295.9 ms self, 1.9 %**
- **engine-record readStrain (:565): 228.2 ms inclusive, 1.5 %**
- **cage-measure measure (:42): 221.8 ms self, 1.4 %**

**Live Chrome, fleet aftermath** (`fleet32-live.cpuprofile 400 12 13`, 1 s window, 1000 ms busy):
- stepFree: 288.7 ms inclusive (28.9 %)
- readPoints: 155.8 ms (15.6 %), but only 2.0 ms is its own. The children are `pointContact` 102.6 ms and the surfaces queries.
- wheelsAt: 144.2 ms (14.4 %), 1.0 ms own. Of that, `wheelContact` is 142.3 ms.
- loadPoints: 4.0 ms (0.4 %). measure: 1.0 ms.
- In the fleet, the read chain's cost is the ground queries, not the copies.

**Node city16, HEAD alone** (load 2.4→3.2):
`flock … env ROOTS=x7=…/cost-x7 CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city PROF=/tmp/rrc/city16-x7.cpuprofile node --experimental-strip-types scratch-CostProfile3/drive.mjs`. Analysed with `/tmp/rrc/an.cjs` (`an.cjs`). 20 sim-s profiled, 532 ms/sim-s.

| function | inclusive ms/sim-s | self ms/sim-s | % |
|---|---|---|---|
| stepFree | 188 | 15.9 | 35.4 |
| readPoints | 93.8 | 40.1 | 17.6 |
| wheelsAt (wheelContact 48.4) | 52.5 | 3.8 | 9.9 |
| measure | 18.0 | 18.0 | 3.4 |
| readStrain | 16.1 | 0.5 | 3.0 |
| loadPoints | 15.0 | 14.8 | 2.8 |
| centredTop | 3.2 | 3.2 | 0.6 |

Who calls measure: startStep→readStrain 66 %, trackCrush→readStrain 15 %, glass (`evaluateBreakage`) 17 %.

**Node fleet32, FRAMES=600** (`fleet5.mjs PROF=`; loads 1.36 / 1.65 / 2.16):
- loadPoints: 141.3 ms of about 13.3 s (1.06 %)
- stepFree: 5645 ms (42 %)
- readPoints: 2887 ms, 650 ms self
- wheelsAt: 2527 ms
- measure: 41 ms (glass only)
- readStrain: 0. The fleet runs no recorder.

## 2. Calls per wreck per step (240 Hz)
Probe: `rrc-probe-patch.mjs` + `rrc-probe-patch2.mjs` on throwaway `bis/rrc-cnt`, then `drive.mjs MODE=count`. Probe digests equal the baseline.

City16 (20 sim-s, 96926 wreck-steps, load 4.9, which does not affect counts). Each line is per wreck-step:
- stepFree 1.00, loadPoints 1.00, readPoints 1.00 (from stepFree; loose parts are extra), wheelsAt 1.00 (= 4 `wheelContact`).
- The allClear point loop (car-air.ts:1471) runs on 0.68. `centredTop` (:1331, a second full point pass) runs on 0.52.
- loadPoints copies 218 vertices per call on average.
- **measure: 26.9 calls.** That is startStep 18 (every wreck, all 18 CAGES), trackCrush 4.4, glass 4.49. 96.2 % hit the corner memo.

a1c32 (load 2.1–2.3): measure 3.0 M calls in 20 s, glass 524809, wreck-steps 102229.

## 3. Waste found (HEAD file:line)

**A. loadPoints rebuilds the same table every step** (car-air.ts:633-670).
- Its output depends only on:
  - `cage.fields` / `cage.serial` (`CarCage.serial`, car-cage.ts:941, bumped on every fit/reset at :951 and :1012)
  - `lift = cageLift` (constant while up ≥ `UPRIGHT_UP_Y` 0.5, car-suspension.ts:115-119)
  - `massActive`
  - constants (`vertexGroup`, `BELLY`, `COM_Y`)
- **Probe result: the key (serial, fields, lift via Object.is, wreck) matched the previous call in 99.19 % of calls.**
  - city16: 152362/153600 (wrecks 98.73 %). Misses: serial 1238, wreck flip 16, lift 0.
  - a1c32: 152568/153600.
  - a0c16: 76800/76800.
- **Every key-equal call produced a bit-identical POINT_X/Y/Z, BELLY_ABSENT and S_POINT_REACH: `lpBad` = 0 over 381730 hits.**
- The copy cannot be dropped outright. POINT_X/Y/Z (:49-53) are module tables that every other car's stepFree and `loadShape` (loose parts) overwrite. So it has to be restored from a per-car memo (memcpy) instead of re-filtered.
- Precedent for keying on (fields, serial): cage-outline.ts:38 and engine-ragdoll.ts:843.

**B. The recorder reads 18 cage strains for every wreck on every step, and almost none are used** (engine-record.ts:258 → readStrain :565-568).
- `strainPre` is only read at :599, for a car that just became tracked. That happened **41 times in 20 s at city16** (73 at a1c32), against 96918 rows read.
- Only 5.6 % of those rows changed since the previous step (5465/96918). Corners move only when:
  - `solveCages` runs (streamed-deform.ts:279; its helpers :240, :366, :390 are only called from it)
  - `simState` restores (:652, the corners are in `simTables.vecs` :618)
  - `DeformRig.rebuildRunStructures` resets (deform-rig.ts:478, `restoreInto`)
- trackCrush (:597) reads the same rows again for watched cars.
- Each `cageStrain` call costs a `Map.get(name)` (deform-state.ts:583), a `WeakMap.get` (cage-measure.ts:44) and 24 float compares (:54-57). It only recomputes (28 `distanceTo`) on 3.8 % of calls.

**C. The strain memo uses a per-call map lookup** (cage-measure.ts:40/44, plus deform-state.ts:583).
- A field on `Cage` (deform-rig.ts:65-75) would replace the WeakMap.
- readStrain could take `cages[k]` by index, since `makeCages` builds them in CAGES order (deform-build.ts:49). That replaces the Map.
- Exact by construction. Its gain was not measured separately; after cut 1 only the glass reads (4.49 per wreck-step) are left on this path.

**D. Small extra:** loadPoints calls `sampleAt` for all 12 belly points (:657-659) even for a non-wreck, which throws the result away. With A this no longer matters.

**Not memoisable:** wheelsAt and readPoints. Their inputs (pose, velocity) change every slice, and their cost is the surfaces queries (`wheelContact`/`tread`, `pointContactNear`/`Held`, per-point `staticTop` :406). That belongs to the surfaces reviews.

## 4. Ranked cuts

### 1. Recorder strain row cache (exact, using a gate)
**Change:**
- `DeformRig.cornerSerial = 0` (next to `cageDue`, deform-rig.ts:155).
- `++` it at the top of `StreamedDeformation.solveCages` (streamed-deform.ts:279).
- `++` it in `simState` when `write` (:652).
- `++` it after `restoreInto` in `rebuildRunStructures` (deform-rig.ts:479).
- In engine-record, `readStrain(car, out, at, i)` keeps per slot `strainRow` (Float32, MAX_CARS×18), `strainSerial`, `strainCar`. It re-reads the 18 `cageStrain` only when `strainCar[i] !== car || strainSerial[i] !== car.deform.cornerSerial`, then copies the row out. Pass `i` from :258 and :597.
- Prototype: `rrc-strain-patch.mjs` (tree `bis/rrc-proto2`; probe tree `bis/rrc-cnt2`).

**Gain:** in-process interleaved 3-arm profile at city16 (load 4.04→4.88):
`ROOTS=x7=cost-x7,lp=rrc-proto,st=rrc-proto2 … PROF=/tmp/rrc/abc.cpuprofile`, per arm with `FULL=1 node an.cjs abc.cpuprofile '^readStrain .*<tree>'`.

| arm function | x7 (ms / 20 sim-s) | st (ms / 20 sim-s) | change |
|---|---|---|---|
| readStrain | 392.8 | 36.9 | **−17.8 ms/sim-s**, 3.51 % → 0.36 % of the arm |
| measure | 428.6 | 119.0 | |
| startStep | 398.5 | 87.6 | |

- Live city: readStrain is 1.5 % of busy, so expect about −1.3 % (estimated, not measured live).
- Fleet: none (no recorder).

**Exactness:**
- Digests equal: city −787317265, a1c32 552185401, a0c16 763954108, fleet FRAMES=600 −194727954.
- Disagreement counter (on every cache hit, re-read the row and compare with Object.is on fround):
  - First version, without the `rebuildRunStructures` bump: **1 (city16) and 3 (a1c32) bad rows**. That bad version is how I found the respawn writer.
  - With the bump: **0/115130 hits city16, 0/133585 a1c32** (loads 1.6 / 2.3).
- The restore path (`simState` write) is not exercised by the race rows. Engine-record, replay and replay-fidelity tests must pass.

### 2. loadPoints per-car memo (exact by key)
**Change:**
- In loadPoints, after `refitCage`/`cageLift`, keep a memo per car: serial, fields, lift (compare with `Object.is`), wreck, bellyFrom, reach, x/y/z/absent arrays.
- On a hit: `POINT_X/Y/Z.set(memo.x/y/z)`, `BELLY_ABSENT.set`, `_s[S_POINT_REACH] = memo.reach`, return `bellyFrom`.
- On a miss: run as now, then store.
- Prototype: `rrc-proto-patch.mjs` (tree `bis/rrc-proto`; WeakMap keyed by car, allocates on a miss).
- The lane should reuse the arrays (reallocate only if `end` changes, i.e. a panel came off) so a miss allocates nothing.

**Gain:**
- Same interleaved profile: loadPoints 315.2 → 118.1 ms per 20 sim-s, **−9.9 ms/sim-s**, 2.82 % → 1.13 % of the arm.
- Fleet profiles (FRAMES=600, loads 1.36 / 1.65): 141.3 → 72.1 ms, 1.06 % → 0.54 %.
- Live city: loadPoints self is 1.9 % of busy, so expect about −1.2 % (estimated).

**Whole-arm ratios are below the noise:**
- drive city16 lp/x7: 0.958 (load 4.35), 1.036 (3.22, reversed order), 0.939 (3-arm, 4.0–4.9). That is ±4 % noise.
- fleet neighbours x7 / lp / st: 23.08 / 25.65 / 21.59 (loads 1.17 / 2.25 / 1.69), then 20.31 / 21.16 / 21.17 (1.33 / 1.11 / 1.37). No signal.

**Exactness:** `lpBad` 0 over 381730 hits on 3 rows. All digests equal.

### 3. Strain memo as a `Cage` field, readStrain by index
- Change: drop the WeakMap in cage-measure.ts:40 and put the memo on `Cage`. Replace the name-keyed Map lookup at deform-state.ts:583 with index access.
- Exact by construction. Gain not measured; after cut 1 it only touches the glass reads (4.49 per wreck-step, about 6 ms/sim-s of measure left at city16).
- Priority P3.

### 4. Not recommended
Folding `centredTop` (:1323) into the allClear loop (:1471), since both are rotated point passes, would round the box bounds differently. That changes a gate and needs its own disagreement proof, for at most 3.2 ms/sim-s (0.6 %). Not measured.

## 5. Recommended first lane: "ReadChainMemo" (one sitting, two commits)
Tree: `git -C …/crash-deformer-test worktree add ~/crash-wt/bis/lane-ReadChainMemo HEAD`, plus the node_modules symlink.

**Commit 1, strain row cache (cut 1):**
- Edit `deform-rig.ts` (field, plus the bump in `rebuildRunStructures`), `streamed-deform.ts` (bumps in `solveCages` and in `simState` when writing) and `engine-record.ts` (readStrain slot cache). Text as in `rrc-strain-patch.mjs`, without the probe branch.
- Keep `CageStrain.measure` as it is. cage-measure.test.ts changes corners directly, and the glass still goes through it.

**Commit 2, loadPoints memo (cut 2):** car-air.ts only. The memo arrays are reused; no per-hit allocation.

**Acceptance (every run under flock, load noted):**
1. Digests unchanged:
   - city row (`CARS=16 POLICE=1 AGG=1 … TRACK=city`) −787317265
   - a0c16 763954108
   - a1c32 552185401
   - fleet `FRAMES=1500 SEED=4242` 795525135
2. Disagreement counters at 0:
   - Apply `rrc-strain-patch.mjs <copy> probe`: `strainBad` = 0 on city16 and a1c32.
   - Apply `rrc-probe-patch.mjs` and rerun the loadPoints check (`lpBad` = 0). Adapt it to the memo: compare the restored tables against a fresh fill on every hit.
3. Interleaved profile: `ROOTS=x7=cost-x7,lane=lane-ReadChainMemo … PROF=` then `FULL=1 node /tmp/rrc/an.cjs`. readStrain falls from about 3.5 % to under 0.5 % of the arm, and loadPoints from about 2.8 % to about 1.1 %.
4. Whole row: drive city row in both arm orders. Expect about −4.5 %, which is only readable when load is under 1.5.
5. Tests: `node --test` on `engine-record*.test.ts`, `engine-replay.test.ts`, `replay-fidelity*`, `cage-measure.test.ts`, and the car-air / derby suites Main gates on.

**Throwaway trees** (delete when done): `bis/rrc-cnt` (loadPoints probe), `bis/rrc-cnt2` (strain probe), `bis/rrc-proto` (cut 2), `bis/rrc-proto2` (cut 1). Profiles are in `/tmp/rrc/`.
