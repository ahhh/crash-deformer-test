# Leads

Status: idea → probed (measured in node) → lane (an agent is landing it in its own worktree) → landed (commit). "Exact" = bit-identical sim (no REPLAY bump); "sim" = changes results (REPLAY bump, suites).

## A. Surface queries (25 % of the Chrome fleet aftermath, ~20 % of city)

| # | Lead | Share / gain | Exact | Status |
|---|---|---|---|---|
| A1 | Tops gate + near-tops lists for wreck cage points | city −7…−9 % | exact | landed ecbc560e |
| A2 | Plain path for the fleet's disc ground (`plainChecks`) | city −3 %, a1c32 −2 % | exact | landed 5a99920c |
| A3 | Cell index over the `always` patches (RigSolids' 6 lamp poles made every query scan 12 patches: 541 M box-rejected `offer` calls per 1500 fleet frames) | node fleet profile: `offer` 1859 → 701 ms / 900 frames (≈ −2.3 ms of a 16 ms frame) | exact | landed 5a99920c |
| A4 | Tread footprint: 125 points per wheel whenever a car top is near; STEPS 12→6 halves it | fleet −3…−24 % (noisy probe) | sim | probed (x11); owner's call |
| A5 | Tread: lazy slopes (gridAt NEED_ALL for every candidate; only the winner's normal is used) | ~4 M cellSlopes per 1500 frames: small | exact | measured small, parked |
| A6 | Pre-filter the per-asker tops list by the owner rule (22.9 M owner-rejects after the box test) | ~0.06 ms/frame | exact | parked |
| A7 | Per-car cached candidate list (statics+solids+tops) in a swept box padded a few steps ahead, refilled only when the car leaves it; one box test per step skips the whole point loop when nothing can touch (Carmageddon `GetFacesInBox`/`CollCheck`) | unmeasured; would cut `seek`'s per-point `find(statics)+find(solids)` | exact if the box is a true bound | idea |
| A8 | WASM port of the point-query loop (seek/offer/gridAt) | unmeasured | exact by construction | idea |
| A9 | Correctness: non-tops `readPoints` gate and all-clear test use statics only, ignoring armed solids (rows missed over prop/wall tops; count unmeasured in HEAD) | fix costs ~4 % (x3/x4 probes) | fix (sim) | open |

## B. Cage refit on wrecks (15 % fleet, 3–5 % city)

| # | Lead | Share / gain | Exact | Status |
|---|---|---|---|---|
| B1 | `rasterise`: rasterise only the cells a triangle covers, keep the per-cell test | unmeasured | exact | RevCageRefit reviewing |
| B2 | Coalesce rasterise/transformGrid/refresh to at most once per rendered frame per car, lazily on first read (Carmageddon: mesh update deferred to draw) | unmeasured | exact if no step reads the fields in between (check) | idea |
| B3 | `RagdollSystem.fitProxy` calls `car.refitCage()` every frame for nearby cars: confirm it is a no-op when the cage is unchanged | unmeasured | — | check |

## C. Ragdoll proxies + Rapier (23 % fleet aftermath)

| # | Lead | Share / gain | Exact | Status |
|---|---|---|---|---|
| C1 | Exact fitter rewrite (`holds` via per-node side table, merged `measure` passes, `cut` reads moments gathered by `measure`) | fit 0.561× (0 disagreements / 1571 fits, 201 k boxes) ≈ −5 ms per aftermath frame in Chrome if the ratio carries | exact | landed 3ebba369 |
| C2 | Refit a car's proxy at most every N frames (58 % of refits come one frame after the previous) | unmeasured | sim (dummy motion) | idea |
| C3 | 64 boxes instead of 128 | unmeasured | sim | idea |
| C4 | Middle tier: one box per car unless a dummy can touch it; freeze far off-screen dummies (Carmageddon peds) | unmeasured | sim | idea |
| C5 | Rapier `unreachable` trap in `glassTouch` → `torso.contactCollider(pane)` under node preload; browser `tick` catches it, `advance` does not | correctness | — | open |

## D. Car-vs-car (`deepestIn`/`satCars`/`resolveCarPair`, 5–13 % fleet)

| # | Lead | Status |
|---|---|---|
| D1 | Swept-AABB reject before the outline walk; walk only outline points inside B's box | RevPairSat reviewing |
| D2 | Dirty-pair re-test only (pairs with a car that moved last pass), pinned car = infinite mass, pass cap (Carmageddon `CrashCarsTogether`) | idea (sim) |

## E. Rigid-step read chain (`loadPoints` 27 ms/sim-s, `measure` 33 ms/sim-s, strain memo Map)

| # | Lead | Status |
|---|---|---|
| E1 | Skip `loadPoints` copy when `cage.serial` unchanged since last step | RevReadChain reviewing |
| E2 | Strain memo as a field on the cage instead of a Map lookup | RevReadChain reviewing |
| E3 | Wreck sleep: skip the whole step for a wreck that is nearly still, on ≥3 contacts with support ≈ weight, drivetrain dead; wake on pair hit / stir / ragdoll touch (Carmageddon `doing_nothing_flag`; our "item 6 rest" was parked) | idea (sim) |

## F. Loose parts and AI (each ~9 % of city)

| # | Lead | Status |
|---|---|---|
| F1 | Resting parts: retire to a static set after N s asleep (Carmageddon prop retirement) | RevLooseAi reviewing |
| F2 | AI `think` once per render frame or ~30 Hz instead of every 1/240 s step, drive input held between thinks (Carmageddon `MungeOpponents` per frame) | RevLooseAi reviewing; sim |
| F3 | **Owner idea: think rate as difficulty.** Current rate = "hard" (80–100 % of now); medium 40–80 %; easy 0–40 % down to one think per 200 ms. Bands are spitballed, not rules. Needs: per-car think timer with jitter, held `DriveInput`, a difficulty setting plumbed to HUD/share/replay, and the race AI's safety checks (contact guard, wall avoidance) deciding whether they stay per-step | idea (sim, and a feature) |

## G. Render CPU (three 29 % of desktop Chrome city busy time)

| # | Lead | Status |
|---|---|---|
| G1 | `matrixAutoUpdate=false` on static objects; fewer `needsUpdate` uploads; batching | RevRender reviewing |
| G2 | pnpm patch of a three function doing redundant work for our usage | RevRender reviewing |
| G3 | GPU time at 2560×1440 and the 1 % lows: browser-only measurement | open |

## H. Load time

| # | Lead | Status |
|---|---|---|
| H1 | `decimate` re-costs every edge every collapse pass (3.1 M `cost` calls per style); memoise per vertex, rescan touched: 1.9 s → 0.12–0.16 s for all six styles, bit-identical | landed ef59aa6b |

## I. Correctness found on the way

| # | Finding | Status |
|---|---|---|
| I1 | Fleet wrecks with a live drivetrain skip all ground friction and never get a drive input, so a crowd of wrecks slides forever (item 6, 10550ba0; `car-air.ts:1391` + engine `fixedStep` never applying a drive to undriven cars; race/derby/test paths do). Fix options: B = idle drive on undriven wrecks in the engine (stops in ~0.4 s), C = pre-item-6 rule (gentler). Owner's call; REPLAY bump | open |
| I2 | A9 above (solids ignored by the non-tops gate) | open |
| I3 | C5 above (Rapier trap) | open |

## J. Pacing / measurement policy

- Prod keeps the adaptive pacer (fine 1/240 s, coarse 1/120 s under load); perf harnesses pin it. Dropping fine as the default would be a sim change with a measured cost (phone card: fine 1779 vs coarse 1395 ms/sim-s).
- Carmageddon ran physics at 25 Hz with ≤5 steps per frame and 14 points per car: our ~220 points at 240 Hz is ~150× the query rate per car. The step rate and point count are the two big sim-changing levers if exact cuts run out.
