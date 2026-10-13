# Plan of attack (2026-10-12)

Chunks that land independently, in the order to do them: foundations and the largest measured wins first, then the sim-changing budget cuts, then feel. Every chunk names its measurement and whether it changes sim results ("exact" = no REPLAY bump). Sources: `measurements.md`, `leads.md`, the `rev-*.md` reports, `talk-guidance.md`.

Targets: phone 90 fps (11.1 ms), desktop 240 fps at 2K (4.17 ms). Today: desktop Chrome city 160 fps (vsync-capped, 78 % busy), fleet aftermath 10 fps; phone city 24–34 fps. Node city16 sim: pre-plan 227 ms/sim-s, morning 601, now ≈ 395.

## Working rules (every phase)

- **Lanes edit, Main gates.** A lane gets its own worktree from main, edits only its named files, typechecks and runs the unit tests of the files it touched, commits on its branch and reports. Only Main runs the full suite (worker), boundaries ratchet, `build:node`, the A/B harnesses, browser checks, secret-scan and `wsl-push`.
- **One commit per chunk, one gate per phase.** After each phase: merge the lanes (cherry-pick, never merge), full gate, boundaries, build, the consolidated A/B, secret-scan, push. Record the numbers in `measurements.md` §5 and the status in the phase table.
- **A/B that counts.** `row1.sh` (both arm orders) for city16 / a0c16 / a1c32 and `fleet5-wasm.mjs` A,B,A,B at 1500 frames, at load < 1.5 on this box or on the worker's slot 1; each lane against its own fork point. Anything else is provisional and says so.
- **Exactness.** Exact chunks: car digests equal on all rows and the fleet plus a disagreement counter for any gate/early-out, and the corkscrew/physics-alloc/deform-reset tests (the three that caught today's slips). Car pose digests do not cover debris: a loose-part change carries its own check (the fall-time probe). Sim-changing chunks: one REPLAY bump per phase, derby/replay/stack suites, and the stated playtest bar.
- **Boundaries.** Sim code stays in `world/`, `contact/`, `vehicle/`, `deform/`; presentation in `present/`; input in `engine-input.ts`/`drive-input.ts`; no world→vehicle imports; no per-frame allocation (physics-alloc test); no `any`/`unknown`; knobs named and commented once.
- **Parallelism.** Lanes within a phase run concurrently when they touch disjoint files (named per chunk). Phase 4 camera/input lanes run concurrently with Phase 2/3 lanes at any time (no shared files).

## Phase 0. Foundations (exact, no owner decision needed) [landed and pushed: c43c0d86, gate 3675 tests / 0 fail]

| # | Chunk | Gain | State |
|---|---|---|---|
| 0.1 | Surface store: tops gate, plain path for bounded grids, cell index over always-tested patches | city −10…−13 %, fleet `offer` −62 % | landed (ecbc560e, 8e1a8ec7, 3b7341fb, dcb48a83); probe over the whole game suite: 0 disagreements in 5.67 B queries |
| 0.2 | Load-time cage build: memoised decimate | node: 1.9 s → 0.12–0.16 s for all six styles (browser not yet traced) | landed bf40d8d3 |
| 0.3 | Ragdoll proxy fitter rewrite | fit 0.56× (≈ −5 ms per aftermath frame in Chrome if the ratio carries) | landed 1b2e9746 |
| 0.4 | Car-pair contact: bandAround memo, outline-box reject, two-sweep column transform | `deepestIn` −32 % absolute (11.0 → 7.5–7.8 % of the node fleet) | landed c0f161e3 |
| 0.5 | Read chain: recorder strain row cache; loadPoints per-car memo | race rows 0.94–0.95 vs x7 (lane's rows, load 1.1–2.2) | landed c98aed7d, 7edb9359 |
| 0.6 | Frame-time overlay (`\`, `?stats=1`, works in the race view); harness contract (exclusive/shared lock, lane vs its fork point, corkscrew in the exactness set) | measurement | landed 70d032d4 |
| 0.65 | Harness fidelity: `fleet5-wasm.mjs` loads the wasm skin kernel through a `file:` fetch shim; the sim is unchanged by it (same digest as the JS skin at equal frame counts: −194727954 at 600 frames, 795525135 at 1500), so it becomes the fleet harness. Still open: `fleet5` never runs the ragdoll (Rapier never finishes loading: yield/await before frame 0; the `glassTouch` trap, 1.4, blocks it) | fleet numbers then include the 20 % the browser spends on ragdolls | shim done, ragdoll open |
| 0.7 | Consolidated A/B, main 7edb9359 vs ecbc560e — **provisional** (load 1.9–2.9, one arm order with x7 first): city16 0.871–0.880, a0c16 0.90–0.95, a1c32 0.868–0.870, fleet mean 0.80–0.84 and aftermath 0.78–0.84 (27.7/26.7 → 21.7/22.5 ms); car digests equal everywhere (x7's fleet digest confirmed 795525135). Rerun under the A/B rule; browser bench on the owner's desktop and phone | node provisional |

Exit: full gate green; secret-scan; wsl-push; owner benches the build.

## Phase 1. Correctness bugs that also cost perf (sim-changing, one REPLAY bump for the batch)

| # | Chunk | Why first | Decision |
|---|---|---|---|
| 1.0 | Recorder strain cache (0.5) can serve a stale row: `begin` (engine-record.ts:192) does not clear `strainCar`, and a respawn starts `cornerSerial` over, so a car reused across races (or reset while the recorder is off) can crash again to a serial equal to the cached one. Fix: `strainCar.fill(null)` in `begin`, plus a test (crash, read, reset, crash to the same serial, read → fresh row) | my regression; recorder-only (highlight/crush scoring), not sim | exact; first chunk of Phase 1 |
| 1.1 | Wrecks with a live drivetrain never get a drive input and skip ground friction → the fleet crowd slides forever (I1) | visible bug; sliding wrecks can never sleep (blocks 2.2) | owner: option B (idle drive on undriven wrecks in the engine, matches race/derby/test paths) vs C (pre-item-6 rule). Recommend B |
| 1.2 | Loose parts of wrecks stepped twice per slice (debris moved at 2× sim time; a part dropped from 1 m fell in 0.23 s, now 0.46 s) | bug; −4 % city | landed c75bca24 (REPLAY 67). Open: `nudgeWheels`→`spinWheels` and `ride`→`suspension.step` are still doubled on wrecks (drawn spin and ride spring at 2×) |
| 1.3 | Solids ignored by two gates: the non-tops wreck gate (rows missed over props/walls) and the tyre path (`FOOT_TOP` from statics only, `n = FOOT` never checks `edgeIn(live.solids)`: a tyre at a prop/wall/rig edge can skip tread points whose floor is the solid) | correctness; +4 % cost | one lane, both gates, with 2.2's point budget so the cost is paid once |
| 1.4 | Rapier `unreachable` trap in `glassTouch` under node preload; `advance` does not catch it | find cause; harness blind spot | investigate (owner: no browser impact seen) |
| 1.5 | Handling tests run only at 1/120 while desktop runs 1/240 and phones flip (C1 masterclass) | guards 2.3 | parametrise LAUNCH/lap tests over both rates |

## Phase 2. Budget cuts: do less sim where nobody feels it (sim-changing; each needs the digest suites + REPLAY) [owner approvals]

Ranked by measured share × "felt by nobody". Each one gets its own A/B rows and a playtest criterion before it lands.

| # | Chunk | Share today | Felt by | Plan |
|---|---|---|---|---|
| 2.1 | Tyre footprint: 125 points per wheel near any edge/roof → fewer arcs (12→6) and rings (5→3); talk's end state = ring bottoms + stiff last-20 % spring stop | 14 % of fleet step; 48 % of `offer` | driver only on kerbs/ramp toes | probe A4 exists (x11); add the rings variant; bar = ramp-crossing / bank-wheels / fleet-ramps tests + "no visible snag" playtest |
| 2.2 | Wreck sleep + wreck point budget: skip the step for a nearly-still wreck on ≥3 contacts with support ≈ weight (wake on pair hit / stir / ragdoll); decimated cage for wrecks no driven car touches; REST_PASSES 48 only for stacked bodies | item 6 added 424 → 671 ms/sim-s | spectator (settling) | E3; depends on 1.1; bar = stack/house-of-cards tests, fleet aftermath settle time, no pop on wake |
| 2.3 | Step floor 1/120 by default (fine only while a crush window is open) | phone card −22 % | driver (handling authored at 1/120 already) | after 1.5; bar = barrier/ramp suites at 1/120, bench cards fine vs coarse |
| 2.4 | Ragdoll proxies: refit every 2nd–3rd frame, one box per car unless a dummy can touch it, freeze far off-screen dummies | 23 % of fleet aftermath | spectator (cosmetic) | C2/C4; no sim digest change by design; bar = engine-ragdoll-motion landing band |
| 2.5 | Loose parts: wake for a car top only if it can reach a point; retire long-asleep parts to a static set | ~7 % city upper bound | nobody | after 1.2 |
| 2.6 | AI think rate: hard = per step (today), medium/easy = per N steps down to one think per 200 ms; drive input held between thinks; jittered per-car phase | AI 10 % of city (brains 23 ms/sim-s) | driver (difficulty) | F2/F3: a feature with a setting (HUD, share, replay); contact guard stays per step; bar = race-ai tests at each band, lap-time spread per band |
| 2.7 | Per-scene sim budget knob (race: drive feel; fleet: crush) for 2.1/2.2 | — | — | masterclass §4; one constant per scene, set after 2.1/2.2 land |
| 2.8 | Cage refit (RevCageRefit): the raster itself has little exact waste (every fit changes its output and is read before the next; touched-cells-only scan is exact but −1 %). Exact: restrict the plan distance transform to where it can change (fit+plan 0.915×, ≈ −0.9 % fleet, prototype `bis/rcr-edt`); cache `pullSensorsFromMasses` rest-only terms (≤ 1.2 %, unmeasured). Sim: `REFIT_EPSILON` 1 cm → 2.5 cm halves fits (−48 %, ≈ −5.6 % fleet; cages stand up to 2.5 cm off the body) | 15 % fleet | sim variant: spectator (cage lag) | exact EDT restriction after 0.4 (same files); epsilon with the 2.1/2.2 approvals |
| 2.9 | WASM: point-query loop (seek/offer/gridAt), rasterise, distance-transform row pass | unmeasured | nobody | after the JS cuts, measure per kernel |

## Phase 3. Render CPU and GPU (browser-only verification) [RevRender done]

Desktop Chrome city: `WebGLRenderer.render` 2.0 ms of a 6.5 ms CPU frame; 304 draws (242 main + 62 shadow), 83 material switches, 1315 objects (971 never move, but `matrixAutoUpdate=false` gains ≤ 0.05 ms while the scene auto-updates). Fleet: 711 draws, 1.09 MB of real per-frame body uploads.

| # | Chunk | Measured / estimated gain | Exact |
|---|---|---|---|
| 3.1 | Batch torn-off parts on the ground into one `BatchedMesh` (like the wheel/lamp/terrain batches): 110 parts at 45 s, half on one material, each drawn alone | −32…−36 draws/frame; node render 0.77–0.94×; ≈ −0.22 ms/frame in Chrome | yes (pixels near-identical) |
| 3.2 | One shared paint material for all cars, colour on the geometry | −25 material switches; ≈ −0.10 ms | yes |
| 3.3 | pnpm patch of three's `WebGLObjects.update` / `WebGLGeometries.update` / `WebGLAttributes.update` (drop per-object lookup, cache attribute list, buffer data on the attribute) | GL call stream identical; gain only measurable in a browser (0.14 ms sits under the post passes) | yes |
| 3.4 | GPU ms at 2560×1440, 1 % lows, uncapped Chrome (`--disable-gpu-vsync`); live draw count (node 304 vs card 155) | unmeasured | — |

## Phase 4. Feel (parallelisable with Phases 2–3; input-layer items change no sim digest)

| # | Chunk | Source | Cost | Can run in parallel |
|---|---|---|---|---|
| 4.1 | Brake-tap-while-steering starts a drift (input layer, `shapeDrive`) | masterclass 20:29, Q&A 49:07 | none | yes |
| 4.2 | A+D together holds the wheel | Q&A 48:04 | none | yes |
| 4.3 | Drift pose exaggeration + FOV widening (drawn only) | drift talk 18:14 | none | yes (camera/present) |
| 4.4 | Landing camera shake (trauma on hard touch after a fall) | masterclass 30:42 | none | yes (camera) |
| 4.5 | Clean drift earns boost; drifting costs speed at the arcade end | drift talk 18:38 | sim (meter) | after 2.6 (AI parity) |
| 4.6 | Grip limit with a findable peak: speed bleed past the yaw cap | masterclass 16:07 | sim | after 4.5 |
| 4.7 | Braking cue for the next corner (HUD) | masterclass 22:40 | none | yes |
| 4.8 | Input cadence metric from recordings (changes/min, drift s/lap) | masterclass 05:41 | none | yes; informs 4.1–4.6 |
| 4.9 | Sprung chase camera per the talk (28:10–31:39): today `DriveCam` (present/engine-camera.ts:112) is already a sprung camera but critically damped on one `posOmega`/`aimOmega` for all axes, with a heading-based lead (`along * CHASE.ahead`, ≤ 2.5 m) and only a 0.4× slide look. Change: (a) per-axis spring in the car's frame (lateral looser than longitudinal), (b) separate convergence / momentum / damping instead of one critically damped omega, so a landing can overshoot downward, (c) look-ahead target from velocity extrapolation (looks into turns), (d) landing: 30 Hz pitch/roll shake for 0.5 s when all four wheels touch after a fast descent, plus lower damping on that event. Keep `RIDE` heave/tilt. Measure: `car-load.test.ts` / engine-camera tests still pass; playtest: car offset to the outside of a deep turn, camera does not hide the road ahead on landing | masterclass 28:10–31:39 | none (drawn only) | yes (camera lane) |
| 4.9a | Camera tuning rule for 4.9: keep `spring.ts`'s closed-form, frame-rate-independent step (phones 90 Hz, desktop 240 Hz): convergence = ω, damping = ζ, "momentum" = ζ < 1 (underdamped closed form), never per-frame lerps. Owner: tuning strong vs weak convergence is the important knob (strong ≈ rigid cam; weak = alive but the car points off-screen in deep turns → fix with velocity-extrapolated look-ahead or tighter ω). Expose ω/ζ per axis as debug settings for live tuning; keep the heading-based aim so reversing never swings the camera (gate the velocity look-ahead on forward speed) | masterclass 29:27–30:11 | none | yes |

## Phase 5. Cleanup (parallel with any phase; no sim change)

| # | Chunk | Notes |
|---|---|---|
| 5.1 | Drop the unused Grok template code (GrokScout inventory): dead files removed outright; entangled ones trimmed — `src/routes/__root.tsx` (keep what the app needs), `vite.config.ts` (app-env and auth-popup plugins, Vercel preset bits), `src/lib/db.ts` (keep PGlite, drop the Neon branch), `package.json` build's `db:migrate`, `scripts/with-app-env.mjs` (keep the env-arg runner); lockfile updated in the same commit | gate + `build:node` + a deploy dry run on the box; owner confirms nothing he uses depends on them |

## Open questions for the owner
1. 1.1: option B or C.
2. 2.1 and 2.3 are the two biggest sim-changing levers; approve probing both with the stated bars?
3. 2.6 bands: hard 80–100 %, medium 40–80 %, easy 0–40 % of today's think rate (owner's spitball) — confirm the default band for AI races today.
4. Phase 4 ordering vs Phase 2: 4.1–4.4 and 4.7 can start now in parallel lanes if wanted.
5. Owner to bench the pushed build (desktop + phone city, fleet) so Phase 0's node ratios get their browser numbers.

## Lane map (who can run at once)

| Phase | Concurrent lanes (disjoint files) |
|---|---|
| 1 | 1.0 engine-record strain cache · 1.1 engine `fixedStep` + car-air driving rule, then 1.3 in the same lane (both edit `car-air.ts`; 1.3 also `surfaces.ts` wheelContact FOOT_TOP/edgeIn) · 1.4 engine-ragdoll glassTouch · 1.5 vehicle-classes tests · 1.2b car-core spinWheels / suspension double step |
| 2 | 2.1 surfaces tread footprint · 2.2 car-air/world-step wreck sleep + point budget (after 1.1) · 2.4 engine-ragdoll/ragdoll-proxy refit rate · 2.5 loose-step wake/retire · 2.6 race-ai/cop-brain/traffic think rate + HUD setting · 2.8 car-cage EDT restriction (after 0.4) |
| 3 | 3.1 car-parts/present batch · 3.2 car-materials shared paint · 3.3 pnpm patch three (browser A/B by Main) |
| 4 | 4.1/4.2 drive-input · 4.3/4.4/4.9 engine-camera + spring · 4.5/4.6 car-drive (after 2.6) · 4.7 HUD · 4.8 engine-record metric |
| 5 | 5.1 routes / vite config / lib/db / scripts (no game files) |
