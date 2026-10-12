# Review: Vehicle Feel Masterclass (Matthew Harris, Criterion, 2020) vs crash-deformer-test
(+ lesser talk: `ArcadeDriftPhysics.srt`, Parking Garage Rally Circuit dev — folded into §2 as "drift talk", timestamps prefixed `DT`.)

Scope per owner steer: perf vs fun vs sim first; camera minimal; AI out (owner: AI difficulty is easy, not the talk's point — leads F2/F3 untouched by this review). Talk notes at the bottom. `[INF]` = inference, not measured.

## Verdict
Owner's guess is right, but in a specific place. The talk's rule (06:49, 07:13, 11:13, slide "Real World Systems – Motorsport" 12:29: engine, transmission, tyre friction, camber, suspension, anti-roll, load distribution, Ackermann, road surfaces, aero) is: put simulation where the *player drives it*, assist the rest. Our **drive model** already follows the talk almost line for line (gear buckets, kinematic yaw model, Criterion-style drift assists, visual-only suspension). Our **CPU** goes almost entirely to things on no slide: contact geometry precision, crush cage, cosmetic ragdolls (measurements.md §3: surface queries 25 %, ragdoll 23 %, cage refit 15 %, car-car 5–13 % of fleet aftermath; none of it is handling). Crush is pillar 1 ("crush and watch"), so the sim there is spectacle and stays — the cut is precision past what a player can see (mm tread arcs, 48 rest passes, 1/480 cosmetic ragdoll proxies, 240 Hz on cars nobody steers). The talk's own BF1 answer for the expensive bit (50:23–51:30) is 4 raycast wheels + a stiff top 20 % of spring so the body never touches: hide geometry hitching with an assist, not with more geometry.

The drift talk is the counter-check: a fully puppeted car (4-ray hovercraft, DT 05:59–06:28) is cheap and drifts well, but its author names the puppet↔physics crash handover as the game's weakest point and the source of most "physics do weird things" complaints (DT 20:59–23:33). We pay for real contact precisely so crashes have no handover — so keep the crash sim, cut its *precision*, don't replace it with a puppet.

## 1. Performance (ranked)

### P1. Tyre contact: 125-point tread footprint → BF1-style wheel + cushion
- Talk: 19:19–19:28 detailed sim side effects ("extreme slowdown on uneven terrain or even collision hitching") are to be *targeted with assists*; 50:23–51:30 BF1 = 4 raycast wheels + rigid body, >80 % compression counts as bottomed, top 20 % of travel made very stiff so the body never collides. Drift talk DT 05:59–06:28: 4 rays per car carry a whole shipped game.
- Ours: `wheelContact` (surfaces.ts:2099) asks 5 rings × 25 arcs = 125 points (`STEPS = 12`, surfaces.ts:1603; `n = FOOT` at 2139, loop 2162) whenever a patch edge or a car top is within 0.4 m (`FOOT_REACH`, 1636); plus `edgeCross` chord pass (2166–2191). Measured: `tread` = 48 % of `offer` inclusive (189 ms in the Chrome 1 s window), `wheelContact` 14.3 % of the fixed step; 31.4 M tread points / 1500 fleet frames (measurements.md §3–4).
- Change (cheapest first): (a) lead A4 `STEPS 12→6` (probed: fleet −3…−24 %, noisy); (b) rings 5→3 (crown + 2 shoulders; `RINGS`, surfaces.ts:~1595) — another ×0.6; (c) talk's version: BASE points only (5 ring bottoms, `BASE` 1612, already the no-edge path) and let `edgeCross`'s chord + a stiff last-20 % spring stop (`SPRINGS`/`droop`, car-air.ts:1404–1408) carry lip crossings.
- Measure: `scratch-CostProfile3/drive.mjs` city16/a1c32 rows + `fleet-bench/fleet5.mjs` mean ms; correctness bar = `ramp-crossing.test.ts` (heading within 1°, ≤1 cm shove, ≤0.3 m/s per slice), `bank-wheels.test.ts`, `fleet-ramps.test.ts`. Playtest: kerbs/ramp toes/car roofs at 10–40 m/s, criterion "no visible snag".
- Sim: changes results (REPLAY bump). A4 digest already differs.

### P2. Wreck rigid step: ~220 cage points every 1/240 s for cars nobody steers
- Talk: 06:49 / 07:13 / 11:13 sim depth only where it adds play; don't try to have it all.
- Ours: item 6 split (10550ba0) put every crashed car through `stepFree` (car-air.ts:1353) with `loadPoints` (1445) + `readPoints` over all cage vertices; regression 424 → 671 ms/sim-s (measurements.md §1), the single largest step of the plan. Contact solve `PASSES = 12`, `REST_PASSES = 48` (car-air.ts:173,175) for stacks.
- Change: lead E3 wreck sleep (nearly still, ≥3 contacts, support ≈ weight → skip step; wake on pair hit / stir) first; then a point budget for wrecks *not in contact with a driven car*: belly + a decimated cage (Carmageddon 14 points; talk-equivalent "4 wheels + box") and full cage only while a crush window is open. `REST_PASSES 48` only for bodies resting on another car (the house-of-cards case it was added for), 12 elsewhere.
- Measure: drive.mjs city16 + city32 (27 wrecks) ms/sim-s, `count` mode for readPoints points; correctness = stack/house-of-cards tests, `fleet-ramps`, I1 slide time. Playtest: 32-car fleet aftermath — wrecks settle, no visible pop on wake.
- Sim: changes results.

### P3. 1/240 floor for everything → 1/120 default floor
- Talk: no step-rate claim `[INF]`; principle 06:49 (effort on sim must buy play).
- Ours: `FINE_SLICE = 1/240`, `COARSE_SLICE = 1/120` (sim-pace.ts:12–13); desktop always fine. But handling is *authored* at 1/120: `vehicle-classes.test.ts:26` `H = 1/120` (launch, lap tests), drive-input tests at 1/120, gamepad tests 1/60. Phone card: fine 1779 vs coarse 1395 ms/sim-s (−22 %).
- Change: default floor 1/120; keep `physicsSlice`'s 7 cm travel cap (sat.ts:20–24). Fine only on demand (while a crush window is open on that car) `[INF: needs a per-car slice, larger change]`.
- Measure: bench cards fine vs coarse on desktop + phone; drive.mjs with pacer pinned coarse vs fine; correctness = barrier/ramp suites at 1/120.
- Sim: changes results.

### P4. Cosmetic ragdoll proxies refit tighter than anyone sees
- Talk: 37:12–37:33 simple anti-grav + thrust instead of airfoil sim "because we didn't feel we needed it"; spectacle need not be physically exact.
- Ours: dummy world `STEP = 1/480`, `ITERATIONS = 4`, `INTERNAL_PASSES = 2` (engine-ragdoll.ts:90,124,126), never feeds the sim (CINEMATIC.md "Cosmetic"); ragdoll update 23 % of fleet aftermath (fitProxy 14 %, Rapier 8 %).
- Change: leads C2 (refit proxy every 2nd–3rd frame; 58 % of refits come one frame after the last), C4 (one box per car unless a dummy can touch it), freeze far off-screen dummies. Leave 1/480 for the dummy's own joints (measured joint tear at 1/120) — cut the proxies, not the joints.
- Measure: Chrome fleet-32 aftermath p50 frame ms (today 103 ms); `engine-ragdoll-motion.test.ts` landing band 25–40 m and same-place-across-rates.
- Sim: none (cosmetic; digests unchanged by design).

### P5. (Bookkeeping) tag every lead with play value
- Talk: 08:31–10:46 context is the requirements list; 06:42 balance sim complexity against assists.
- Ours: leads.md ranks by ms and exactness only.
- Change: column "felt by: driver / spectator / nobody". Anything "nobody" and sim-changing (A4, E3, step rate) becomes owner-approvable on cost alone. No code.

## 2. Fun / feel (ranked)

Already aligned (keep, don't re-engineer): steer rates on keyboard *and* pad (Q&A 47:47 ↔ `FEEL` drive-input.ts:38–55); recentred drift stick = hold angle (20:59–21:27 ↔ car-drive.ts:276, zero steer holds 0.55 × `slipCap`; drift talk DT 16:41–17:50 is the same model: drift = auto-steer + target heading offset, stick moves the offset); speed kept through a slide (21:38–22:06 ↔ car-drive.ts:296–297, `scrub`); ABS hides lock-up at arcade end (22:13 ↔ car-drive.ts:135); assists faded not switched (23:23–23:44 ↔ car-drive.ts:279 `t = (1−realism)·min(1, 2·drift)`); body roll/pitch sold by drawn-only suspension (17:09 ↔ HANDLING.md "Drawn suspension"); single arcade↔real slider (DESIGN_PILLARS 5 ↔ 23:47).

### F1. Player-intention drift entry: brake tap while steering hard
- Talk: 20:29–20:52 tap brake while turning hard → enter drift; Q&A 49:07–50:05 MW was slightly understeery *so that* players brake-turn-drift. Drift talk DT 00:15–00:24: "one button to drift" (Mario Kart).
- Ours: slide starts only on handbrake + steer > 0.15, or boost + throttle > 0.7 + |steer| > 0.6 + along > 10 (car-drive.ts:256–261). A pad/keyboard player who brakes into a corner just understeers (grip cap, 269–272). Pillar 3 "slides you can hold".
- Change: input layer only, in `shapeDrive` (drive-input.ts:105): brake pressed < 0.25 s then released, |wheel| > 0.6, along > `DRIVE.slideSpeed` → emit `ebrake` for one ~0.1 s pulse. No new sim state.
- Measure: drive-input.test (tap → ebrake pulse; straight-line tap → none); playtest: on the oval hairpin a pad player starts a drift without the handbrake on ≥ 4/5 tries; `vehicle-classes.test.ts` laps unchanged.
- Sim: AI/replays unchanged if replays record shaped `DriveInput` `[INF: check engine-record.ts]`; player behaviour changes.

### F2. Drift → boost reward (drift talk)
- Drift talk: DT 18:38–19:52 drifting *costs* speed, a clean drift pays a boost after it; drifting while boosting stacks the next boost (chains to 2–3× top) — "the risk/reward comes from this", "barely in control" feel. Burnout itself fills boost from drifting `[INF: general knowledge, not in either transcript]`.
- Ours: meter refills only passively (`BOOST.recharge 4.5 s`, `chargeBoost`, car-drive.ts:395–399), takedown +0.4 in derby, draft +5 %/2 s in race (RACE_DESIGN.md). Drifting earns nothing; at the arcade end it barely costs anything either (80 % of scrubbed speed returned, car-drive.ts:296–297). So a slide is neither risk nor reward.
- Change (smallest): `topUpBoost(meter, k · driftSeconds)` on drift exit when `d.drift` falls back under 0.05 without a crash in the window (seat's meter, car-drive.ts DriverSeat ~:535). Skip stacking past top unless the first part plays well. Optionally raise `scrub` a little at the arcade end so the drift costs speed first.
- Measure: playtest criterion "players drift on purpose on the oval/city"; count drift seconds per lap in recordings before/after (F5 metric). Race balance: player-only reward widens the gap to AI, which owner says is already strong — acceptable, or give RaceBrain the same rule.
- Sim: changes results (meter → boost → speed); REPLAY bump if the seat's meter is in the replay `[INF]`.

### F3. Keyboard A+D together = hold the wheel where it is
- Talk: 48:04–48:52 digital needs its own mechanisms; BF2 PC: A+D held = lock current roll.
- Ours: A+D → `kWheel = 0` → wheel slews back to centre at `steerOut` 7/s (drive-input.ts:74–75, 110). Mid-drift that drops the angle the player was holding.
- Change: both held → keep `feel.wheel` (skip slew). ~3 lines.
- Measure: drive-input.test (A, then A+D: wheel holds); playtest: keyboard drift held through a long sweeper with fewer taps.
- Sim: input layer only (as F1).

### F4. Grip limit has no peak to play with
- Talk: 16:07–17:03 tyre curves with a peak = "playing with the limits of grip" = depth/mastery.
- Ours: gripping = hard yaw clamp `GRIP_YAW_CAP 1.05 · grip / v` (car-drive.ts:269–272, constants.ts:29); then a separate slide state. Over-steering at grip only clips; no cost, no reward.
- Change (small): past the cap, bleed speed in proportion to the excess (`speed -= k·(|yawRate|−cap)·v·dt`) so overdriving costs time and the limit is findable. One term, not Pacejka.
- Measure: lap time on vehicle-classes 313 m loop at full lock vs planned line (should now differ); playtest: "tighter line through hairpin beats mashing lock".
- Sim: changes results; AI `cornerSpeed` (vehicle-classes.ts:378) already plans under the cap, so AI pace should hold `[INF]`.

### F5. Drift pose exaggeration (drift talk, presentation only)
- Drift talk: DT 18:14–18:34 exaggerate the car's pose — a little when steering, a lot when drifting, plus a lean into the drift; camera tilts and widens FOV in a drift.
- Ours: drawn body roll comes from `LoadTransfer` (real lateral accel, capped per class; HANDLING.md "Drawn suspension"); chase cam looks 0.4 × slip angle into a slide (engine-camera.ts:157–159); FOV by speed only (230–232).
- Change: drawn-only extra yaw/lean scaled by `car.drive.slide` (already 0–1, car-drive.ts:305) in the drawn suspension; +2–4° FOV by `slide`. Zero sim cost.
- Measure: playtest "a drift reads as a drift from the chase cam"; `car-load.test.ts` keeps sim/drawn separation.
- Sim: none.

### F6. Input cadence never measured
- Talk: 05:41–06:42, 46:33 input at a satisfying cadence; assists ∝ number of mechanics.
- Ours: mechanics = steer, brake, handbrake, boost, draft, crash/knock, reset; no metric.
- Change: none to code; count input changes/min and drift seconds/lap from a few owner-driven race recordings (engine-record inputs). Low numbers → F1/F2/F3 are the levers.
- Sim: none.

Not adopted from the drift talk: camera-in-charge steering (DT 00:35–05:45; we are vehicle-led, matching the masterclass for racing, 26:23–26:58), hovercraft puppet car (breaks crash pillar; see verdict).

## 3. Correctness

### C1. Handling is tested at 1/120 but desktop drives at 1/240 and phones flip between them mid-race
- Talk: 24:13–24:34 autotests for top speed/accel per vehicle caught an artist's wheel-size change.
- Ours: `vehicle-classes.test.ts:26` `H = 1/120` for LAUNCH and laps; pacer switches 1/240 ↔ 1/120 with `DWELL = 1 s` (sim-pace.ts:13–18). Several drive terms are per-dt and look rate-independent (drift ramp/catch 265–266; bite 293), but `slipGain` chase `(aim−beta)·6` feeds a yaw rate integrated per slice, and ebrake `exp(-ebrakeDrag·dt)` is per-step `[INF: not measured]`.
- Change: run LAUNCH + lap tests at both 1/120 and 1/240 (one parametrised loop); tolerance = today's.
- Measure: the test. Sim: none (test only); a failure is a real rate dependence players hit on phones.

### C2. Wrecks slide forever (lead I1) is the talk's "unwanted side effect" case
- Talk: 19:19–19:28 detailed sim side effects to be targeted with assists.
- Ours: car-air.ts:1391–1393 — wreck with live drivetrain gets no ground friction and engine `fixedStep` never drives undriven cars.
- Change: lead I1 option B (idle drive on undriven wrecks, stops in ~0.4 s). Visible (fleet aftermath) and also feeds E3 sleep (sliding wrecks never sleep).
- Measure: fleet-32 aftermath — time until all wreck speeds < 0.5 m/s; REPLAY bump.

### C3. Our own binary handovers are where "weird physics" reports will come from (drift talk)
- Drift talk: DT 20:59–23:33 most player complaints were the crash-state enter/exit thresholds (entered when it shouldn't, physics picked up too soon).
- Ours, equivalent switches: kinematic → mass sim on first crash (car-drive.ts:183–184, permanent); landing handback within ~25° with two wheels in reach (HANDLING.md:95, `car-support.ts` `landPose`); gripping cap ↔ slide regime at `drift 0.05` (car-drive.ts:269/273). Of these only landing is two-way.
- Change: none speculative; when an owner clip shows a snap, check these three thresholds first (crash-deformer-owner-clip-forensics). Instrument: log landing-handback events with angle/speed in the JSON trace dump.
- Sim: none.

## 4. Talk accounts for, we do not

| Talk | Gap in ours | Smallest change | Measure | Sim? |
|---|---|---|---|---|
| 08:31–10:46 context → requirements, retune per context | No per-scene sim budget: race, derby, fleet run the same contact precision | Per-scene knob for tread footprint / wreck points (race needs drive feel, fleet needs crush) | drive.mjs per TRACK | yes |
| 22:40–23:04 feedback assists (Forza braking line) | No braking cue; AI knows `cornerSpeed`, player doesn't | Tint next corner red when `along > cornerSpeed(...)` for its radius | playtest: crashes/lap on campaign course 1 | no (HUD) |
| 23:58 feed back whether the player is doing better | Lap split only | F2 boost reward is that signal | — | yes (via F2) |
| 48:04 digital-specific mechanisms | none | F3 | — | no |
| 30:42–31:49 landing camera (one line, per owner) | `trauma` only from impact `kick` (engine-camera.ts:448) | trauma 0.2–0.4 on `hardTouch` after `vy < −5` | playtest corkscrew landing | no |

Not adopted: camera-led cameras, aim assists (no shooting), autocross advice, auto-roll (self-right slider covers it).

## Talk claims, reference
Masterclass:
- 05:41–05:50 satisfying input cadence; 06:42 balance mechanics + sim vs assists; 06:49–06:56 decide effort on physical sim; 07:13 don't try to have it all; 07:24–07:39 physicality first, assists on top.
- 08:31–10:46 context = requirements; retune when it changes (BF1→BF2 speeder rework).
- 11:13 sim only deep enough that each vehicle accelerates/turns differently; 11:37 single-force body is flat.
- 12:29 slide: engine, transmission, tyre friction, camber, suspension, anti-roll bar, load distribution, Ackermann, road surfaces, body aero drag.
- 12:51–14:52 powertrain feedback, gear bumps; 16:07–17:03 tyre curve peak = limits of grip; 17:09 chassis rock/roll sells it.
- 18:38–18:48 assists at input or sim layer; 19:03 cut input complexity; 19:19–19:28 sim side effects (slowdown on uneven terrain, collision hitching) → assists.
- 19:52 assist kinds; 20:29 brake-tap drift; 20:59 recentred steering holds drift; 21:38 reapply friction along velocity; 22:13 ABS off into drift; 22:40 braking line.
- 23:23–23:44 subtle faded assists; 23:47 tunable strength; 24:02 debug viz; 24:13 vehicle autotests.
- 24:50–32:12 camera (vehicle-led sprung, look-ahead, landing shake 30 Hz 0.5 s).
- 37:12–37:58 simple anti-grav, air brake with no physical justification, prototyped first.
- 45:49 simplified physics + control options for skilled players; 46:33 assist strength ∝ mechanics.
- Q&A 47:47 steer rates pad+keyboard; 48:04 A+D lock; 49:07 understeer → brake-turn-drift; 50:23–51:30 BF1 raycast wheels + stiff top 20 %; 51:53 camera capsule.

Drift talk (DT):
- 00:15–00:28 Mario Kart one-button drift + Crazy Taxi edge-of-control; 00:35–05:45 camera-in-charge hypothesis.
- 05:59–07:20 4-raycast hovercraft, spring force per ray, point velocity.
- 09:59–11:50 forward force to desired speed in one step, clamped; sideways traction force cancels lateral velocity, clamped.
- 13:02–15:12 damped torque spring turns body to camera heading; 15:37–16:09 bias it by steer.
- 16:41–17:50 drift = auto-steer + heading offset; stick adjusts offset.
- 18:14–18:34 exaggerated pose, lean, camera tilt + FOV in drift.
- 18:38–19:52 drift costs speed, clean drift → boost; drift while boosting stacks (to 2–3× top).
- 20:21–20:27 collision assist: hitting traffic doesn't kill speed.
- 20:59–23:33 crash state handover = weakest point, most complaints.

Suggested checks for main agent (none run here): drive.mjs city16/a1c32/city32 rows for P1–P3; fleet5 mean for P1/P2; Chrome fleet-32 aftermath for P4; vehicle-classes.test at 1/240 for C1; drive-input.test for F1/F3.
