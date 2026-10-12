# rev-RevCageRefit: refitting the cage on wrecks (HEAD ecbc560e = ~/crash-wt/bis/cost-x7)

`diff -rq cost-w4/src cost-x7/src` shows that car-cage.ts, cage-outline.ts, car.ts, streamed-deform.ts and sat.ts are identical between the two trees, so Chrome line numbers equal HEAD line numbers.

## 1. Measured share

**Chrome live, fleet32 aftermath window 12–13 s** (`node owner-traces/chrome/cpuprof-map.cjs fleet32-live.cpuprofile 40 12 13`, plus `callers.cjs`). Times are ms per 1 s of busy time.

| fn (HEAD file:line) | self | incl |
|---|---|---|
| rasterise car-cage.ts:682 | 81.0 (8.1 %) | 81.0 |
| transformGrid car-cage.ts:813 | 53.5 (5.3 %) | — |
| planFieldOf car-cage.ts:831 | 6.8 | 60.3 (52.3 via sat.ts:97 deepestIn, 8.0 via engine-ragdoll.ts:975) |
| CarCage.refit car-cage.ts:988 | 0 | 90.1 (47.5 via car.ts:527 bakeBetweenSlices, 42.7 via stepBreakage) |
| CageOutline.refresh cage-outline.ts:37 | 14.0 (1.4 %) | 14.0 (all via worldBand < bandsMeet) |
| solveCagesFromShape streamed-deform.ts:240 | 19.9 (2.0 %) | — |
| pullSensorsFromMasses streamed-deform.ts:156 | 11.0 (1.1 %) | — |

- Total (refit + plan + outline): 90.1 + 60.3 + 14.0 = **164 ms/s, 16.4 % of busy time**. Frames in this window run 78–103 ms, so this is about 13–17 ms/frame [INFERENCE: share × frame time].
- GC in the window: 1 ms.

**Node fleet, x7.** Load 2.02; absolute ms are inflated.
- Command: `flock ab.lock env ROOT=…/cost-x7 CARS=32 FRAMES=1500 SEED=4242 PROF=/tmp/rcr/x7-fleet.cpuprofile node --experimental-strip-types fleet5.mjs`. Digest 795525135; 27.6 s busy.
- rasterise: 1778 self (6.4 %, 1.19 ms/frame).
- transformGrid: 1068 (3.9 %). All of it comes from planFieldOf < deepestIn.
- bandAround: 612 (2.2 %). **All of it comes from deepestIn, sat.ts:142**, not from refresh.
- solveCagesFromShape: 553 self / 612 incl (2.0 %).
- pullSensorsFromMasses: 338 (1.2 %).
- refresh: 307 (1.1 %), via bandsMeet.
- fitCage incl 2017 (7.3 %); planField incl 1151 (4.2 %).
- Caller split from my own walk of the profile's node tree:
  - fitCage: 1595 from stepBreakage, 436 from settleStep/slice.

**Node city16, x7.** Load ~3–4.8; use the shares only.
- Command: `drive.mjs ROOTS=x7=… CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city PROF=/tmp/rcr/x7-city.cpuprofile`.
- It ran at 488 ms/sim-s, so 9868 ms busy covers 20 sim-s.
- rasterise: 350 (3.5 %) = 17.5 ms/sim-s.
- fitCage incl: 386 (3.9 %).
- planField: 121 (1.2 %).
- refresh: 74.
- bandAround: 35.
- solveCagesFromShape: 58.
- pullSensors: 34.

## 2. Answers and waste (counters)

**How the counters were taken**
- Probe tree: `~/crash-wt/bis/probe-RevCageRefit`, built by `/tmp/rcr/probe.mjs` + `/tmp/rcr/probe2.mjs` (sources: local://rcr-probe.mjs, local://rcr-probe2.mjs).
- Fleet run: fleet5 32 cars, 1500 frames, seed 4242, digest 795525135, unchanged by the probe.
- City run: `/tmp/rcr/cdrive.mjs`, the city16 row with SECS=40.
- Wreck-seconds = sum of `dt` in stepBreakage while massActive.

**How often a cage is refit, and why** (car.ts:75–88, :523, :529; deform-state.ts:437)
- Every crush-window step bakes the skin and sets `cageDue`. stepBreakage then calls `fitCage` → `CageRig.refit` → `CarCage.refit`.
- `movedSince` (car-cage.ts:924) refuses a refit unless a mass or hub moved more than `REFIT_EPSILON` = 1 cm, or a panel/flag changed.

| | fleet | city |
|---|---|---|
| fitCage calls | 53094 | 7580 |
| moved-skip (gate refused) | 46711 (88.1 %) | 5878 (78 %) |
| actual fits (rasterise) | 6283 | 1606 |
| wreck-seconds | 188.6 | 541.8 |
| **fits per wreck per sim-second** | **33.3** | **3.0** |

- `cage.serial` is bumped once per fit (car-cage.ts:1012). CageOutline.refresh rebuilds when the serial changes: 6380 rebuilds out of 2.69 M calls, so the memo already works. planFieldOf is likewise computed once per fit (6287 computes out of 387 k calls).

**Does a refit happen for a cage that did not change?** No.
- Fits with identical top/bottom/covered: **0 / 6283**.
- Fits with identical `covered` only (so the plan field could be reused): 461 (7.3 %) in the fleet, 30 (1.9 %) in the city.
- Outline rebuilds with identical inputs: 0.

**Is a fit ever wasted unread?** No.
- With a getter flag on the car's own fields: fits read before the next fit = 6206; **unread = 0**. The rest are first fits.
- So a lazy, rasterise-on-read scheme saves nothing.

**Does rasterise scan each triangle's whole bounding box (EXPAND)?** Yes (car-cage.ts:728–735, 751–756).

| per fit (fleet) | count |
|---|---|
| triangles | 321.6 |
| bbox nodes visited | 32046 |
| nodes passing the margin test | 16171 (50.5 %) |

- `covered` is set 10099 times for 2802 covered nodes. Each is hit about 3.6× (roof, belly, panels, interior).

**Could it scan only the cells a triangle touches, keep the per-node test, and stay exact?** Yes, but it is not worth it.
- The per-row span from the three edge equations, with 1 spare node each side, visits 19608 nodes/fit (−38.8 %).
- Disagreements: **0** over 101.7 M passing nodes (fleet) and 26.3 M (city).
- But the skipped iterations are the cheap failing ones.
  - Microbench (below): x7 264.3 vs span 261.9 µs/fit (0.991, noise), bit-identical.
  - Line ticks: the per-node body (car-cage.ts:756–770) is about 89 % of rasterise, dominated by the passing-node writes (y, clamp, cut, top/bottom/covered). Per-triangle setup is ~8 %.

**Is top/bottom/covered fully cleared each fit?** Yes (car-cage.ts:689–691: 3 × 4753 writes). Clearing is not the cost: lines 689–691 take 0.4 % of rasterise ticks.

**Would re-rasterising only the moved triangles help?** No.
- Triangles with all 3 vertices unchanged between consecutive fits: 430 / 2.02 M (0.02 %).
- The dirty rectangle of moved triangles covers 3203 of 4753 nodes per fit and holds 98.8 % of the bbox work.
- Incremental raster saves nothing.

**Allocation per refit:** none found by reading the code.
- CarCage.fit reuses `own` and `read`.
- rasterise uses the module-level `_open`.
- planFieldOf uses the module-level `scratch`.
- CageOutline arrays grow once.
- readCageLive (car-cage-rig.ts:149) writes into preallocated `live`.
- No allocation profile was taken. GC is 0.1 % (Chrome window) and 0.3 % (city).

**Where the real waste is**
- **a. The plan EDT (transformGrid ×2) runs over the whole 49×97 lattice per fit** (car-cage.ts:852–853).
  - Distance to the nearest uncovered node only differs from 0 inside the covered box, and only needs that box grown by a 1-node ring. Clamping any outside uncovered node onto the ring never moves it farther away.
  - A column with no covered node stays FAR2 in the distance-to-covered column pass.
  - Microbench, plan mode: plan adds ~184 µs to the 264 µs fit (x7 448 µs fit+plan).
- **b. bandAround in deepestIn (sat.ts:142, cage-outline.ts:103) recomputes a 7×7 window min/max per overlapping outline node per SAT call.** That is 612 ms (2.2 %) in the fleet. It is a pure function of (b's fields as of its fit, node), and fits are 1 per ~8 refit calls, so nodes repeat across slices.
  - [UNMEASURED: memo hit rate.]
- **c. pullSensorsFromMasses (streamed-deform.ts:156–197) recomputes per sensor×mass per read things fixed for that car:**
  - `s.rest.distanceTo(m.rest)`, `reach`, `fall` (lines 168–171);
  - the second loop's `dist` and `Math.exp(-dist*1.35)` (189–191).
  - These depend only on rest positions. 338 ms (1.2 %).
  - [UNMEASURED: whether `rest` is ever mutated after setup.]

## 3. Ranked cuts

1. **REFIT_EPSILON 1 cm → 2.5 cm** (car-cage.ts:917). **Sim-changing; needs a REPLAY bump.**
   - Shadow gate on the same trajectory: fleet fits 6283 → **3238 (−48.5 %)**; at 5 cm → 2063 (−67 %).
   - Expected: about −48 % of rasterise + plan + outline ≈ (1778+1151+307) × 0.48 ≈ 1.55 s of 27.6 s ≈ **5.6 % of the fleet frame**, and ~8 % of the Chrome aftermath [INFERENCE from the shares; not timed].
   - Cost: a cage stands up to 2.5 cm off between fits (half the 5 cm lattice step; the doc bar at car-cage.ts:914–916 is 1 cm).
   - Prove: fleet + race-row A/B, plus the car-cage, stack-crush and contact tests.
2. **EDT restricted to what can change** (exact). Built in throwaway tree `~/crash-wt/bis/rcr-edt` by `/tmp/rcr/edt.mjs` (local://rcr-edt.mjs); typechecks clean.
   - transformGrid takes (ci0, ci1, i0, i1, j0, j1).
   - toCovered: column pass only over covered columns; row pass full.
   - toUncovered: only over the covered box ± 1.
   - The covered box comes from planFieldOf's existing init loop.
   - Expected: toUncovered work 3393/4753 ≈ 71 %; toCovered column pass ≈ 37/49 → roughly −20–25 % of transformGrid ≈ **0.8–1 % of the fleet frame** [ESTIMATE].
   - **Measured:** microbench `x7 vs rcr-edt plan`: fit+plan 519.7 → 475.4 µs (**0.915**), `same:true` (top/bottom/covered/pos/plan/planBox/heightMax bit-identical across 12 crushed cars). Runs were interleaved A/B over 12 rounds, every B round below every A round; load 2.9 → 12, so read the ratio, not the absolute µs. That is about 44 µs off ~190 µs of plan ≈ −21 % of planFieldOf, i.e. ≈ 0.9 % of the fleet frame (1151 ms × 0.21 / 27.6 s) and ≈ 1.3 % of the Chrome aftermath (60.3 × 0.21 ms/s).
   - Prove: microbench `same:true`, fleet digest, three race-row digests.
3. **Memoise bandAround for SAT** (exact).
   - Per CageFields: `bandLo/bandHi: Float32Array(n)` plus `bandStamp: Int32Array(n)`, keyed by a fit epoch that rasterise bumps.
   - Float32 storage is exact: the values come from Float32Array or are ±Infinity.
   - deepestIn calls the memo.
   - Expected: ≤ 2.2 % fleet, 0.35 % city (the bandAround share), depending on hit rate [UNMEASURED].
   - Prove: probe counter (hits vs recompute disagreement = 0), plus digests.
4. **WASM rasterise + EDT** (exact if the f64 op order is kept and stores are f32). kernels/skin is already a Rust crate.
   - Target: 6.4 + 3.9 % fleet, 8.1 + 5.3 % Chrome. [UNMEASURED speedup.]
   - JS Math.sqrt/min/max and f64 arithmetic are IEEE-identical in WASM, so bit-exactness is provable via digests plus a field-compare microbench.
5. **pullSensorsFromMasses rest-pair table** (exact if rest is immutable): cache per car the in-reach mass list with `fall` and `w`. ≤ 1.2 % fleet [UNMEASURED].

Rejected, with the measurement behind each:
- **Row-span raster:** −1 %, exact, 0 disagreements; not worth the code.
- **Dirty-rect / incremental raster:** 0.02 % of triangles are unmoved.
- **Lazy raster:** 0 unread fits.
- **Skip the plan when `covered` is unchanged:** 7.3 % / 1.9 % of plan computes, ≤ 0.3 % of the frame.
- **Avoiding the clear:** 0.4 % of rasterise.

Fleet A/B (x7 / span / span+plan), loads 1.16–1.49, digests all 795525135:

| tree | mean (ms/frame) | aftermath (ms/frame) |
|---|---|---|
| x7 | 19.05, 19.16, 19.08 | 30.53, 30.42, 30.8 |
| span | 18.04, 18.38 | 28.73, 29.3 |
| span+plan | 18.86, 21.79 | 30.1, 33.75 |

The box was loaded and the microbench contradicts the fleet's −4–5 % for span, so these rows are **inconclusive**. The lock-wait loop timed out after 7 runs.

## 4. Recommended first lane

**Exact lane: "plan EDT rect + SAT band memo"** in car-cage.ts:813–858 and sat.ts:142.

Change:
1. Apply `/tmp/rcr/edt.mjs`'s diff (transformGrid with a rect, covered box from the planFieldOf init loop).
2. Add the bandAround memo:
   - lazily allocated per own CageFields;
   - stamp = a `rasterEpoch` counter rasterise bumps;
   - pristine shared fields: epoch 0, valid forever;
   - deepestIn reads `bandCached(fb, style, i, j)` in place of `bandAround`;
   - the `refresh` call site stays as is.

Acceptance:
- `node --experimental-strip-types /tmp/rcr/micro.mjs <x7> <lane> plan` prints `same:true` and ratio ≤ 0.92 for fit+plan (the EDT half alone measured 0.915).
- A probe disagreement counter (memo vs recompute) is 0 over the fleet run.
- Fleet digest 795525135 and the three race-row digests are unchanged.
- The fleet A/B (A,B,A,B ×2) shows ≥ 2 % in aftermath in both orders.
- car-cage.test.ts and the sat/pair-contact tests pass.

Say if the owner prefers the bigger, sim-changing win: REFIT_EPSILON → CAGE_STEP/2, a one-line lane, measured by the fleet + race-row A/B and a REPLAY bump.

## Artifacts
- Profiles: `/tmp/rcr/x7-fleet.cpuprofile`, `/tmp/rcr/x7-city.cpuprofile`, `/tmp/rcr/mprof/*.cpuprofile` (microbench, line ticks via `/tmp/rcr/lines.cjs`).
- Scripts:
  - probe: local://rcr-probe.mjs, rcr-probe2.mjs
  - span cut: local://rcr-span.mjs
  - EDT cut: local://rcr-edt.mjs
  - microbench: local://rcr-micro.mjs
  - A/B runner: local://rcr-ab.sh
- Throwaway trees: bis/probe-RevCageRefit, bis/rcr-span, bis/rcr-spanplan, bis/rcr-edt.
