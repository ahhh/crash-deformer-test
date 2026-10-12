# RevLooseAi: loose parts + AI driving (city16 bench), HEAD = cost-x7 (ecbc560e)

Scratch: `~/crash-wt/scratch-RevLooseAi/` (profiles, counter patches `rla-patch{,2..6}.mjs`, experiment patcher `rla-exp.mjs`, `bytree.cjs`, `sub.cjs`). Throwaway trees `bis/cnt-rla` and `bis/exp-rla-e{1..5}` are deleted. To rebuild: `cp -a bis/cost-x7 bis/exp-rla-eN && node rla-exp.mjs bis/exp-rla-eN eN`, and for the counters run rla-patch.mjs then rla-patch2..6.mjs in order on a copy.
Load is noted on every row. Absolute ms are taken under load 2.0–2.2 and are only good **as shares within one profile**; the cut gains below come from one 6-arm interleaved process (all arms took the same load).

## 1. Measured share

**Node city16** (CARS=16 POLICE=1 AGG=1 TRACK=city, WARM=20, timed 20 sim-s, load 2.02):
`flock ab.lock env ROOTS=x7=…/cost-x7 CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city PROF=city.cpuprofile node --experimental-strip-types scratch-CostProfile3/drive.mjs`, then `node sub.cjs city.cpuprofile '<fn>'`. Total 548 ms/sim-s.

| function (HEAD file:line) | incl ms/sim-s | share |
|---|---|---|
| `stepLooseParts` car-parts.ts:708 | 61.1 | 11.1 % |
| ↳ called from `afterContacts` car.ts:401 | 30.2 | |
| ↳ called from `integrateWreck` car.ts:449 | 29.8 | |
| ↳ from `integrate` (non-wreck) car.ts:485 | 1.1 | |
| ↳ `solveRows` car-air.ts:911 / `reach` :531 (self 9.3) | 28.7 / 11.0 | |
| ↳ `readPoints` car-air.ts:384 / `pointContactHeld` | 18.6 / 14.7 | |
| ↳ asleep path: `stirNear` surfaces.ts:1370 + `applyQuaternion` | 4.1 + 4.7 | |
| `RaceSession drive` engine-race.ts:500 (whole AI step) | 56.0 | 10.2 % |
| ↳ `RaceBrain.think` race-ai.ts:272 (`guardContact` 6.3, `line` 4.1, `projectPath` 2.8, `plan` 2.6) | 17.4 | 3.2 % |
| ↳ cop `think` cop-brain.ts:284 / traffic `think` traffic.ts:182 | 3.2 / 2.8 | |
| ↳ `recorder.startStep` engine-record.ts:232 (`readStrain` :565 13.9 → `measure`) | 17.3 | 3.2 % |
| ↳ `applyDrive` car-drive.ts:187 | 9.6 | |
| ↳ `snapshotAiCar` derby.ts:360 | 2.6 | |

All AI `think`s together: 23.4 ms/sim-s (4.3 %). The brief's "~87 ms/sim-s" for AI does not reproduce here: the whole `drive` is 56, of which the brains are 23 and the recorder's strain read 17.

**Live Chrome city (cost-w4, 20.19 s wall, 15.68 s busy)**, `node callers.cjs city-live.cpuprofile '<re>' 0 99 1`: `loose-step.ts:150` 665 ms incl (4.2 % of busy), callers 46.3 % `car.ts:401` (afterContacts) / 45.4 % `car.ts:449` (integrateWreck), same 50/50 doubling as node. `engine-race.ts:500` 833 ms (5.3 %); all `ai/*` 348 ms (2.2 %); `engine-record.ts:232` startStep 265 ms (1.7 %), of it `readStrain` 228 ms; `snapshotAiCar` 39 ms.

## 2. Counts (city16, 20 sim-s after a 20 s warm; counts don't depend on load)
`node rla-patch.mjs bis/cnt-rla` (+2..6), `flock … env ROOTS=cnt=bis/cnt-rla MODE=count CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city node --experimental-strip-types drive-rla.mjs`. Car digest with counters -787317265 = HEAD's.

- Steps 240/s, slices 240/s (1 slice per step, no contact cut). `race.drive` runs **once per fixed step = 240 Hz** (4× per 60 Hz frame), not per frame. In this harness a step is the same as a slice; live, `drive` is per step and stepWorld can cut a step into up to 8 slices, but the brains don't run per slice.
- Brains: racer `think` 3678/s (15.3 cars), cop 615/s (2.6), traffic 2865/s (11.9). `guardContact` 3636/s: 23.5 pair tests/call, 6.4 near, the arc is built in 88 % of calls.
- **Loose parts: wreck parts are stepped twice per slice.** `afterContacts` (car.ts:416-419) and `integrateWreck` (car.ts:479-481) both run `nudgeWheels`, `ride` and `stepLooseParts(dt)` for a `massActive` car, and `stepWorld` (world-step.ts:186 and :251) calls both every slice. LP_after = 4846/s and LP_wreck = 4846/s, which is 20.2 wrecks × 240 per call site. A non-wreck car's parts get one step (integrate only, because afterContacts returns at `!d.massActive`). The doubling dates back to the Grok export (7a09b34f `afterContacts` + `integrate` both stepped parts). dcde4226 and 10550ba0 kept it. So a wreck's debris runs at 2× sim time: twice the gravity and travel per slice.
- `stepLoose` 20078/s (≈84 per step, across 52 `stepLooseParts` calls per step). Asleep on entry: 18509/s (92 %). Of those, 16483/s return early and 2026/s are woken by stir. Velocity never woke a part (L_wakeV 0).
- **Do resting parts query the ground every step? No.** An asleep part computes its world centre (`applyQuaternion`) and runs `stirNear` (plan-box test over the dyn statics, dyn solids and every other car's top). It reads no points.
- **Stir churn:** all 2026/s wakes come from a car top (`L_why3`). 100 % of these woken steps read **no contact on any car top** (S_noTopRow 18329/18329, run 6). 99.8 % go back to sleep in the same step (L_stirMovedResleep). Each moves the part a tiny bit: <1e-9 m 150/s, <1e-6 547/s, <1e-4 1327/s, ≥1 mm 2/s. The stirring top's frame changes every slice (T_topChanged 2025/s vs T_topSame 1/s), so a "top unchanged" gate would never fire. The stirring car's speed (run 5, 18329 wakes): <0.16 m/s 19 %, 0.16–0.5 7 %, 0.5–2 17 %, ≥2 57 %; 82 % of them are wrecks. Cause: a top's stir box is the car's centre ± `REACH` 2.5 m (car-surfaces.ts:27, `clipBox` in `sync` :417), about 1.5 m past each flank. A part lying beside another wreck wakes every call (twice per slice, because of the doubling above) and creeps.
- **Is the part's shape read (`readPoints`) every slice?** Only for awake parts that aren't `clear`: 65956 points/s (20 per box, 8 corners first while airborne). Active steps are 3595/s: 2026 stir-churn, 865 airborne (n=0), 261 on 1–2 points, ~440 genuinely settling. `clear` (none asked) 297/s.
- Recorder: `readStrain` into `strainPre` (engine-record.ts:258) runs for every wreck every step: 4846/s × 18 cages. The only reader of `strainPre` is `trackCrush` for a **fresh** car (engine-record.ts:599): S_fresh = 2/s. So 99.96 % of the reads are never used.
- Allocation (`MODE=alloc`, 6 sim-s, load ~2): `guardContact` 1.9 MB/sim-s, `think` 0.9, `stepLoose` 0.86 (sampled heap numbers). GC self is 0.3 % of the profile. Allocation is not a lever for either hotspot. (`readPoints` 74 MB/sim-s is the shared solver's issue, not this review's.)

## 3. Ranked cuts
Gains come from one interleaved 6-arm profile: `flock … env ROOTS=x7=cost-x7,e1=exp-rla-e1,…,e5=exp-rla-e5 CARS=16 POLICE=1 AGG=1 SECS=40 WARM=20 TRACK=city PROF=six.cpuprofile node … drive.mjs`, then `node bytree.cjs six.cpuprofile '^stepLooseParts ' '^stirNear ' '^think ' '^guardContact ' '^readStrain ' '^startStep '` (load 2.12 → 2.04; ms per sim-s = ms/20). HEAD arm: tree total 510 ms/sim-s, stepLooseParts 53.0, think 19.6, startStep 16.1.

| # | cut | exact? | measured gain (ms/sim-s, % of 510) | proof |
|---|---|---|---|---|
| 1 | **Step a wreck's loose parts once per slice**: delete `this.stepLooseParts(dt, this.slot);` in `afterContacts` (car.ts:419). Keep the one in `integrateWreck` (:481), which is where the non-wreck path steps them (`integrate` :507). | **Sim-changing for debris** (a wreck's parts go from 2× to 1× time, i.e. a bug fix). Car digests unchanged: city -787317265 both arms; fleet 32/600 -194727954 both. | stepLooseParts 53.0 → 32.1 (**−20.9, 4.1 %**) | LP_after = 0 and LP_wreck = 4846/s counter. REPLAY bump (clips re-step debris). `node --test loose-step.test.ts` |
| 2 | **Lazy `strainPre`**: in `startStep` (engine-record.ts:258), copy each wreck's 18 cages' 8 corners (a Float64Array per car), and run the strain measure only in `trackCrush` for a fresh car. It must use the same arithmetic as `CageStrain.measure` (cage-measure.ts:66-71: `Math.abs(Math.sqrt(dx*dx+dy*dy+dz*dz) - rest[k])`, Math.max in a<b order). | **Exact** (strain is a pure function of corners and rest; the memo only caches). | bound (e5: read deleted): startStep 16.1 → 2.7 (**−13.4, 2.6 %**). The copy cost isn't measured; ~432 floats per wreck-step, est. ≤2. | Disagreement counter: every step, compare the snapshot strain against `readStrain` for every wreck; must be 0 diffs. Clip strain digest equal (reel tests) |
| 3 | **Stir gate for asleep parts**: wake for a car top only when that top can answer one of the part's points. Ask `pointContactHeld` against the stirring tops alone for the part's 20 resting points, or tighten the stir box from ±2.5 m to the car's outline + SKIN [unmeasured variant]. | **Sim-changing** (removes sub-0.1 mm creep; 0 of 18329 such wakes read a top row). Car digest unchanged with the upper-bound variant (city). | bound (e2: no stir wake at all): stepLooseParts 53.0 → 18.5 (**−34.5, 6.8 %**). With #1 landed the churn halves first, so the extra over #1 is [unmeasured, est. ~10–15]. | Counter: the woken part's top rows must be 0 in every skipped case (S_noTopRow), plus a parts pose digest. `loose-step.test.ts:300-312` ("a solid 10 m away leaves it asleep" / moved prism wakes) must stay green |
| 4 | **Brains at frame rate**: run racer/cop/traffic `think` on every 4th step (engine-race.ts:541-557), hold the `DriveInput` copy in between, and pass the elapsed time as `dt`. | **Sim-changing**: digest -805880960, meanMassActive 13.85 vs 14.25. Reaction latency becomes 16.7 ms. | think 19.6 → 5.9 (**−13.7, 2.7 %**); guardContact 5.9 → 1.2 | REPLAY bump; race-ai / race-contact / police tests; owner eyeballs a city race |
| 5 | Memoise `reach(c, DIR[c], N[c], q, both)` per row per solve in `solveRows` (car-air.ts:938/945/950/965/967). It is constant across passes: q, R, DIR, N, HELD pose and RATIO don't change inside the solve, and only v/w do. Friction `reach(c,_tn,_tn)` stays per pass. Shared with cars. | Exact (same ops on same inputs) | [unmeasured] `reach` self 9.3 under loose, 14 total | per-call disagreement counter (memo vs recompute) = 0; all four digests |
| 6 | Cache an asleep part's world centre x/z when it goes to sleep (loose-step.ts:185) and use it in the asleep path (:157-158) instead of `applyQuaternion` per call. | Exact: E3_same 139565 / E3_diff 0 (run 4, load 3.78); city and fleet digests equal | 53.0 → 52.0 (−1.0, noise-level) | already counted. Fold into the lane for #1; not worth its own |
| 7 | `snapshotAiCar` (derby.ts:360): read cell/bumper masses through the rig's resolved key masses instead of a string `switch` over all masses, for ~30 cars × 240/s. Keep FL+FR and RL+RR in mass-array order. | Exact | ≤2.0 (0.4 %) | digests. Below the 2 % bar |

Not cuts: think internals. `guardContact`, `line`, `plan` and `projectPath` all read the current pose, so nothing in them is constant within a step. The only lever there is the rate (#4).

Also flagged, not measured: `nudgeWheels(dt)` and `ride(dt)` are doubled on wrecks the same way (car.ts:417-418 and :479-480). `nudgeWheels` self is 3.3 ms/sim-s in total. Whether doubling them is intended is the owner's call.

## 4. Recommended first lane: cut #1 (+ #6)
**Brief.** Tree `bis/lane-loose1`. In `src/game/vehicle/car.ts`:
- Delete `this.stepLooseParts(dt, this.slot);` from `afterContacts` (line 419).
- Update the comment at :484 if needed. Wreck parts now step once per slice, in `integrateWreck`, as every other path does.
- Optional, exact (#6): in `loose-step.ts`, store the world centre's x/z on `LooseShape` (car-core.ts:244-256: add `sleepX`, `sleepZ`, set them where `shape.asleep = true`) and use them in the asleep branch.
- Bump REPLAY (debris trajectories change).
- Run `node --experimental-strip-types --test src/game/vehicle/loose-step.test.ts` and the car/parts tests that tear parts off a wreck.

**Acceptance.**
1. Counter (cnt copy of the lane): LP_after = 0, and LP_wreck/s equals the number of wreck slices.
2. 2-arm interleaved profile (`ROOTS=x7=cost-x7,lane=lane-loose1 … PROF=`, `bytree.cjs '^stepLooseParts '`): lane stepLooseParts ≤ 65 % of x7's in the same process (measured 61 %).
3. Car digests equal on city (-787317265), a0c16, a1c32, and fleet 32 (-194727954 at FRAMES=600; 795525135 at 1500).
4. A wreck's torn part dropped from 1 m lands in √(2/9.6) ≈ 0.456 s of sim time (HEAD: ≈0.228 s, because it runs at 2× time).
5. Load noted per run.

Lane 2 (exact, independent): #2 lazy `strainPre`, with the disagreement counter as its gate.
