# Fleet crowd slide, dump `.bench/spin/fleet-slide-1012.json` (live c9dc4f9 = main c9dc4f90)

Scratch: `~/crash-wt/zip-1012/` (tree = c9dc4f90 export + instrumentation; harness `fleet8.mjs`, `attr.mjs`; outputs `rep1.json`, `attr1.json`, `tab.txt`). Repo untouched.

## Verdict (one paragraph)
Not a kinematic injector. Positions in the dump follow velocity exactly (per-car dist/∫v = 1.000 [0.94, 1.06] from sim 2.6; crowd common-mode drift ≤ 0.008 m/s after sim 1.0). The slide is **momentum the crowd never loses: no wreck in Fleet gets any ground friction after the pile spreads.** A crashed car with a live drivetrain is "driven" in the rigid step (`driven = rolling && !parked && driving`), and a driven body skips ground friction entirely (`if (driven && OWN[c] < 0) continue;`), expecting `applyDrive` to supply the coast/brake law. In the live engine nothing calls `applyDrive` on a Fleet wreck (0 calls measured), so the 27 of 32 wrecks that landed on their wheels with a live drivetrain coast at constant speed forever. Introduced by commit `10550ba0` (Stage 4 item 6, 2026-10-12 07:04).

## 1. Dump table (32 cars, 81 samples, loop on, no ramps/barrier/balls; 4 Hz wall)
Window = sim s. Drift = mean Δpos/T of wrecked cars; v̄ = mean of trapezoid ∫v dt/T; common-mode = drift − v̄ (m/s). KE per unit mass.

| window (sim) | phase | wrecks | drift x,z | v̄ x,z | common-mode x,z | KE start→end | mean ‖v‖ | per-car Δpos/∫v med [min,max] |
|---|---|---|---|---|---|---|---|---|
| 0.41–1.0 | aftermath, KE falls 6349→1494 | 10 | −2.73, 1.29 | −2.13, 1.00 | −0.60, 0.30 (4 Hz aliasing of a collapsing KE) | 6349→1494 | 18.4→8.7 | 0.915 [0.49,1.73] |
| 1.0–2.6 | pile spreads | 26 | −3.59, 0.36 | −3.59, 0.28 | −0.003, 0.074 | 1368→255 | 8.3→3.8 | 1.085 [0.43,1.62] |
| 2.6–4.0 | pile→glide | 32 | −3.02, −0.25 | −3.02, −0.25 | −0.003, −0.001 | 249→237 | 3.73→3.56 | 1.001 [0.89,1.24] |
| 4.0–7.0 | glide | 32 | −2.95, −0.30 | −2.95, −0.30 | −0.000, 0.000 | 237→234 | 3.56→3.51 | 1.000 [0.94,1.06] |
| 7.0–10.2 | glide, rim falls | 29 | −2.70, −0.36 | −2.71, −0.36 | 0.008, 0.002 | 234→214 | 3.51→3.31 | 1.000 [0.98,1.00] |

- Start of the slide: sim ≈ 2.0–2.6 (aftermath phase, timeScale 0.999). All 32 wrecked from sim 2.18. KE collapses 7819 (sim 0.23) → 249 (2.6) then stays flat: 237 at 4.0, 234 at 7.0, 214 at 10.2. Per-car glide onset (speed within 3 % of its final): quartiles sim 1.17 / 2.0 / 3.0 / 4.5 / 9.6 (min/q1/med/q3/max).
- Direction: crowd mean v = (−2.95, −0.30) m/s, bearing −174°, a constant. It is the momentum of the spawn: initial mean spawn vel = (−3.56, +0.12) m/s; 83 % retained at sim 4.0, 78 % at 9.88. Crowd centroid (0.6, 1.2) at sim 0.6 → (−10.4, 1.0) at 4.0 → (−27.6, −0.8) at 9.88, on the −x axis, so the motion is radially outward from the disc centre (radial component 2.90 of 2.96 m/s at sim 4.0; 28/32 cars moving outward). No wall/ramp involved (barrier, ramps, balls all false). The leading cars cross the disc rim (R = 48) from sim ≈ 7 (max r 52.2 at 7.6, 62.2 at 9.88); 2 cars have left `massActive` by sample 80 (e.g. car 30, 6.9 m/s → 0.0 at the rim).
- Speeding up: no. Mean ‖v‖ falls 3.73→3.31; max single speed 6.9 (car 30) from sim 3.7 on. 27 of 32 wrecks hold ≥ 90 % of their sim-4.5 speed to the end (1 decelerates, 2 at rest, 2 fell).
- Sideways: moving cars at sample 70: mean |v along heading| 3.09, mean |v across heading| 1.62 m/s; slip angles up to ±90° at other samples (sample 28 car 7 88°, sample 44 car 22 −82°). `drivetrainAlive` is true for all 32 cars in every sample checked (counts 32 at sim 0, 0.26, 0.33, 0.39, 0.73, 1.33, 2.18, 4.0, 6.1, 8.1, 10.1).
- Implied vs own speed per sample (`analyze.mjs` col "worst"): after sim 4.5 the worst (|Δpos|/Δt − ‖v̄‖) over all cars is ≤ 0.1 m/s except sample pairs where one car stops/falls (≤ 1.8 m/s at sim 9.12, car 30 stopping, 4 Hz aliasing).

## 2. Replay (c9dc4f90, seed 8571248, 32 cars, squash 0.32, buckle 0.45, realism 0.25, speed 10–32, fx minimal, fleet loop; headless real engine)
Command: `env ROOT=~/crash-wt/zip-1012/tree FRAMES=1040 OUT=rep1.json ATTR=attr1.json CAP=8G ~/crash-wt/capped node --experimental-strip-types --no-warnings fleet8.mjs`. Deterministic (digest 1191834512 identical with/without instrumentation and with PIN=coarse).
- Spawn identical (worst |Δ| 0.49 m = one 1/60 s frame of travel). Crowd mean v and centroid identical to the dump to sim 0.39 (pos RMS ≤ 0.3 m). It diverges from the pile on (chaotic): RMS 0.6 m @0.47, 1.2 @0.67, 4.0 @1.83, 10 @4.5, 26 @9.9. Wreck counts agree early (10 @0.39, 25 @0.67).
- Does the slide reproduce? Partly. Mechanism reproduces, magnitude does not: replay has 14 gliders / 18 decelerators / 0 rest at sim 4.5→9.9, dump 27 / 1 / 2 (+2 fell). Crowd v̄x: replay −2.64 (2.6–4) → −1.64 (4–7) → −1.16 (7–10), dump −3.02 → −2.95 → −2.71. Replay KE 167→115→69, dump 249→237→214. Replay gliders have the same signature as the dump (‖v‖ constant for 5 sim-s to 2 decimals, e.g. car 8 4.2 m/s, car 14 3.5, car 22 3.5 from sim 4.5 to 9.9) and drift in the same −x direction. Common-mode in replay is also ~0 (0.024–0.028 m/s, retarding).
- Why the pile loses more in the replay is **unexplained [HYPOTHESIS: chaotic divergence of the first 0.5 s sim; live browser frame dt is not 1/60]**; not needed for the attribution.

## 3. Per-call attribution (replay, sim 2.6–10, per car per sim-second; 14 gliders vs 18 decelerators)
Inclusive per call, one row per wrapped call. Unexplained = |Δ(mass-weighted COM) − v̄₀·h| (v̄₀·h subtracted only for `integrate`/`integrateWreck`); vec = signed sum, x,z (the crowd moves −x, so + = retarding); body/mass Δ‖v‖ = signed change of speed per sim-second (negative = loss). Rows with all four < 0.005 omitted.

| call | n (gliders) | unexplained m/s | crowd vec x,z m/s | Δ‖v‖ m/s² |
|---|---|---|---|---|
| `integrate` / `integrateWreck` (includes `stepFree`, `moveRelative`) | 12390 | 0.0000 | 0.000, 0.000 | **0.000** (body and mass) |
| `stepFree` alone, body velocity | 12390 | 0.000 | 0, 0 | **< 0.01** |
| `clampLocal` | 37170 | 0.0748 | +0.064, +0.032 | 0 |
| `followGroup` = `syncPose` | 37170 | 0.0702 | +0.061, +0.030 | 0 |
| `resolveCarPair` / `separateAlong` | 61382 / 1194 | 0.061 | −0.025, −0.020 | +0.012 |
| `rigCollide` (rig props) | 12390 | 0.0053 | 0.001, 0.005 | −0.034 |
| `translateMasses` | 47 | 0.0052 | 0.001, 0.005 | 0 |
| `settleDrift` | 49560 | 0.0046 | −0.004, −0.003 | 0 |
| `stepStructure` / `stepShapeMatch` / `stepMassSlice` | 12390 | 0.0034 | −0.002, +0.003 | 0 |
| `shiftBody` | 2010 | 0 | 0 | −0.018 |
| `afterContacts`, `stepBreakage`, `endSlice`, `takePush`, `moveRelative`, `refreshBasis` | | 0.000 | 0 | 0 |

Same window, decelerators: `integrate`/`stepFree` body Δ‖v‖ **−0.352 m/s²**, `shiftBody` −0.091, `resolveCarPair` Δ‖v‖ −0.029 (unexplained 0.63, nets ≈ 0 as vec +0.015,+0.018). Pile window (0.4–2.6), both classes: `resolveCarPair` −6.5, `shiftBody` −5.8, `integrate` −0.6 m/s² (this is where the crowd loses 98 % of its KE).

Reading it:
- The only kinematic terms are `clampLocal`/`followGroup`/`syncPose`: +0.06 m/s common-mode **against** the motion (≈ 2 % of the 3.0 m/s slide, retarding, so they cannot speed anything up). Pair pushes net −0.02. Everything else ≤ 0.005. Nothing in the replay adds position without velocity at more than 2 % of the slide.
- The slide's 97–98 % is ordinary conserved momentum. For the 14 gliders the rigid step removes 0 of it: `stepFree` Δ‖v‖ < 0.01 m/s² for 7.4 sim-s; for the decelerators it removes 0.35 m/s² (cars touching others).
- Why `stepFree` removes none: measured on every wreck slice (`__DRV` hook at car-air.ts:1374): `driven` true on 100 % of slices for 30 of 32 cars (car 27 61 %, car 7 0 % with `stalledS` 3.0), `rolling` 100 %, `driving` 100 % except those two, `drivetrainAlive` 32/32. `applyDrive` calls on massActive wrecks over the whole run: **0** (hook in car-drive.ts; engine.ts:574–584 calls it only for the seated, derby and race cars).

## 4. Injector (named, with the call that fails to act)
Not an injector: a missing friction law. At c9dc4f90:
- `src/game/vehicle/car-air.ts:1370-1372`: `driving = !wreck || (drivetrainAlive && stalledS <= 0); rolling = wheelsAt(...) !== 0 && (wreck || !car.crashed); driven = rolling && !car.parked && driving;` and `:1375` `body.parked = car.parked || !driving`.
- `car-air.ts:959`: `if (driven && OWN[c]! < 0) continue;` skips every ground contact's friction (tread and lateral, tyre and belly rows) for a driven body.
- The comment at car-air.ts:1367–1369 says the wreck "rolls on its drive's law (the throttle's push, else its coast, the brakes when held)", but `applyDrive` is only called by the seated driver, the derby AI, the race and the test world (`crash-scenarios.test-util.ts:466-468`: `pedal = pedals.get(car) ?? (car.parked ? null : drive); applyDrive(car, pedal, h)`, with `IDLE` for every driverless car every slice). The live Fleet path (`engine.ts:584` `this.net.drive(cars, dt, driven)` then `stepWorld`) has no such call, so a Fleet wreck with a live drivetrain has no ground friction and no engine braking: 0.000 m/s² for 7.4 s.
- Introduced by `10550ba0` (Stage 4 item 6, wreck split, 2026-10-12 07:04): before it `rolling = ... && !car.crashed` (crashed cars were never `driven`, they got normal ground friction) and `body.parked = car.parked`. `git log -S` finds the `driving = !wreck || ...` line first in that commit.
- Share of the slide: all of it. The crowd's post-pile speed (≈ 3.5 m/s per car) is carried at 0.000 m/s² by 27/32 dump cars (14/32 replay). Crowd centroid in the dump: −10.4 m at sim 4.0, −27.6 m at 9.9; with the friction restored at sim 2.6 the replay centroid stops at −6.2 … −7.9 m (section 5).

## 5. Positive control (scratch tree, gated at sim ≥ 2.6; the state at sim 2.6 is identical to baseline: centroid x −6.0, v̄x −2.95, KE 168)
All three stop the crowd; the crowd centroid at sim 5.9: baseline −13.2 (still moving at −1.56 m/s, KE 76), controls below.

| variant (one hunk each) | sim 3.0 v̄x / KE | sim 4.5 v̄x / KE / moving>0.5 | centroid x at sim 5.9 |
|---|---|---|---|
| baseline replay | −2.78 / 152 | −2.04 / 96 / 32 | −13.2 |
| A: `car-air.ts:1370` `driving = !wreck` (wrecks always dragged, μ = CRASH.muSlide) | −0.43 / 6 | 0.00 / 0 / 0 | −6.7 |
| B: `engine.ts:584` after `this.net.drive(...)`: `for (const c of cars) if (c.crashed && c.deform.massActive) applyDrive(c, idleDrive(), dt)` (what the test world does) | 0.00 / 0 | 0.00 / 0 / 0 | −6.2 |
| C: restore pre-`10550ba0` rule (`rolling … && !car.crashed`, `driving` true) | −1.47 / 57 | −0.23 / 13 / 5 | −7.9 |

Dump for scale: centroid −27.6 at sim 9.9 (−10.4 at sim 4.0), KE 237 flat.
Caveats: A and B stop every wreck in about 0.4 s (deceleration ≈ μg ≈ 7 m/s², "its drive's engine braking would stop it in under a second", crash-scenarios.test-util.ts:551) so they are controls, not tuned fixes; C is the gentlest (KE 167 → 13 by sim 4.5, 4 cars keep rolling, the rest at 0.2 m/s). A is also wrong for derby live-drivetrain wrecks that `applyDrive` already drives. B would apply the idle coast to every scene's wrecks and changes derby/race (they already call it with their own input; guard to Fleet/undriven cars). The fix choice is the owner's: [HYPOTHESIS] B restricted to cars nobody drives, or C, are the minimal designs.

## 6. Tests that may pin the old behaviour (read-only grep in ~/github/crash-deformer-test/src)
- `src/game/contact/solid-phase.test.ts:100-103`: "the six live ones roll on (3.2-5.2 m/s)" (live-drivetrain wrecks keep rolling, dead ones slide to a stop). It uses the test world, which does apply `IDLE`/`FREEWHEEL`, so B/A change these numbers.
- `src/game/deform/crash-parts.test.ts:619-639` (`slideDecel`, `GRIND_S`, "A wreck on its drive's coast stops in 0.4-0.6 s", pair ≥ 0.85× lone) and the `describe("given crashed wrecks sliding to a stop on the ground")` block.
- `src/game/contact/crash-scenarios.test-util.ts:466-468, 546-552` (IDLE/GAS/PARKED/FREEWHEEL, "a wreck coasts on").
- Contact/solve tests that depend on `body.driven`/`body.parked` for wrecks: `floor-momentum.test.ts` (coasting T-bone), `shove-momentum.test.ts`, `wreck-slope.test.ts`, `hub-seat.test.ts`, `deform/crash-physics.test.ts` (applyGroundFriction), derby-ai zip tests that read wreck rest.
- No test calls `engine.advance` on Fleet and asserts a wreck's coast-down (engine-fleet-loop.test.ts has none); the test world applies the drive every slice, the engine does not, which is how the gap passes the suite.

## Hypotheses (unmeasured)
1. Replay's extra pile dissipation (14 vs 27 gliders) is chaotic divergence from sim 0.4 or a live-vs-headless frame-timing difference. Not tested.
2. The 0.35 m/s² `stepFree` deceleration on touching replay cars comes from friction on car-top rows (OWN ≥ 0), which the `driven` skip does not cover. Not isolated.
3. Whether the owner's "speeding up" is just the ~3.5 m/s crowd continuing while the camera/disc reads it as steady; the dump shows no speed increase (mean ‖v‖ 3.73 → 3.31).
