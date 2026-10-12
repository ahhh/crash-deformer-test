# Plan of attack (draft scaffold, 2026-10-12)

Chunks that land independently, in the order to do them: foundations and the largest measured wins first, then the sim-changing budget cuts, then feel. Every chunk names its measurement and whether it changes sim results ("exact" = no REPLAY bump). Sources: `measurements.md`, `leads.md`, the `rev-*.md` reports, `talk-guidance.md`. Status as of writing is in brackets.

Targets: phone 90 fps (11.1 ms), desktop 240 fps at 2K (4.17 ms). Today: desktop Chrome city 160 fps (vsync-capped, 78 % busy), fleet aftermath 10 fps; phone city 24–34 fps.

## Phase 0. Foundations (exact, no owner decision needed) [in flight]

| # | Chunk | Gain | State |
|---|---|---|---|
| 0.1 | Surface store: tops gate, plain path for bounded grids, cell index over always-tested patches | city −10…−13 %, fleet `offer` −62 % | landed ecbc560e, 5a99920c, ff4146b8 (gate: corkscrew fixed; full gate rerun pending) |
| 0.2 | Load-time cage build: memoised decimate | 1.9 s → 0.14 s at page load | landed ef59aa6b |
| 0.3 | Ragdoll proxy fitter rewrite | fit 0.56× (≈ −5 ms per aftermath frame in Chrome) | landed 3ebba369 |
| 0.4 | Car-pair contact: bandAround memo, outline-box reject, two-sweep column transform | `deepestIn` 8.9 → 6.6 % of fleet | lane LanePairSat |
| 0.5 | Read chain: recorder strain row cache; loadPoints per-car memo | −17.8 and −9.9 ms/sim-s on city16 | lane LaneReadChain |
| 0.6 | Frame-time overlay (`\`, `?stats=1`); harness contract (lock, interleaved rows, fleet digest + corkscrew in the exactness set) | measurement | landed a22665a0; contract to add corkscrew |
| 0.7 | Consolidated A/B in a quiet window: x7 vs main vs each lane, city16/a0c16/a1c32 + fleet, plus one browser bench on the owner's desktop and phone | the numbers the plan is judged by | waiting for quiet box |

Exit: full gate green; secret-scan; wsl-push; owner benches the build.

## Phase 1. Correctness bugs that also cost perf (sim-changing, one REPLAY bump for the batch)

| # | Chunk | Why first | Decision |
|---|---|---|---|
| 1.1 | Wrecks with a live drivetrain never get a drive input and skip ground friction → the fleet crowd slides forever (I1) | visible bug; sliding wrecks can never sleep (blocks 2.2) | owner: option B (idle drive on undriven wrecks in the engine, matches race/derby/test paths) vs C (pre-item-6 rule). Recommend B |
| 1.2 | Loose parts of wrecks stepped twice per slice (debris moves at 2× sim time) | bug; −4 % city | lane LaneLoose (in flight) |
| 1.3 | Non-tops wreck gate ignores armed solids (rows missed over props/walls) | correctness; +4 % cost | land with 2.2's point budget so the cost is paid once |
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
| 2.8 | Cage refit: rasterise only covered cells; coalesce rasterise/transformGrid/refresh to once per rendered frame, lazily | 15 % fleet | nobody if exact | RevCageRefit pending; exact variant first |
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

## Open questions for the owner
1. 1.1: option B or C.
2. 2.1 and 2.3 are the two biggest sim-changing levers; approve probing both with the stated bars?
3. 2.6 bands: hard 80–100 %, medium 40–80 %, easy 0–40 % of today's think rate (owner's spitball) — confirm the default band for AI races today.
4. Phase 4 ordering vs Phase 2: 4.1–4.4 and 4.7 can start now in parallel lanes if wanted.
