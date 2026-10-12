# Summary (numbers; details below)
1. Game thread = thread 7 (`GeckoMain`, Isolated Web Content pid 24748): 44.8 s CPU in a 48.1 s span (91 % busy, never idle). 656 frames = 13.4 fps; tick p50/p95/p99/max = 58/192/209/234 ms; >11.1 ms 624, >16.7 ms 605, >33 ms 571, >50 ms 419. Crash window (13.5-49 s, 414 frames): 0 frames <11.1 ms, 1 <16.7 ms, p50 63, p95 199 ms.
2. Frame = sim: 62.6 of 84.8 ms/frame is `slice` (crash window), corr(frame time, sim ms) 0.967; p5 frame already has 27 ms of sim (pacer minimum 2 steps vs `PACE_BUDGET_MS` 8). Non-sim median 19 ms/frame, itself > 11.1 ms.
3. Screenshot chain named, whole-run shares reproduce it: nu = stepWorld (world-step.ts:126) 49.4 %, integrate (car.ts:485) 31.7 %, integrateWreck (car.ts:449) 25.7 %, sm = stepFree (car-air.ts:1332) 22.9 %, gp = wheelsAt (car-air.ts:711) 10.8 %, hr = wheelContact (surfaces.ts:1931) 10.7 %, mr = tread (1892) 9.9 %, hn = seek (1356) 8.9 %, nn = find (1182) 6.0 %, rn = offerAll (1188) 5.6 %, Xt = offer (1040) 4.1 %, Bf = readPoints (car-air.ts:381) 10.6 %.
4. #1 offender: surface queries `world/surfaces.ts` = 28.0 ms/frame (33 % of wall) in the crash window, 14.4 s = 29.9 % of the run; `offer` alone 8.8 ms/frame, `gridAt` 4.2, `offerAll` 3.2. 73 % of `integrateWreck` (29.8 ms/frame, 34.8 % of wall) is surface queries; mass solver 0.4 %, cage 0.4 %, three.js math 4.9 % of it.
5. #2 cage refit/rasterise/outline 12.3 ms/frame (`rasterise` 4.7, `transformLine` 2.8, `bandAround` 1.9), callers `fitCage` 5.1 + `satCars>deepestIn` 5.1; #3 three.js 7.8 (render 6.6); #4 Rapier wasm+JS 4.2 crash / 7.0 whole-run; #5 mass/deform solver 5.3.
6. Frame cost swings with pile-ups: 6.7-7.5 fps (p50 141 / 113 ms) at 17-26 s and 39-49 s (cage 30-31 ms/frame, surfaces 44-46), 15 fps at 26-39 s, first 4 s 174 ms/frame (Rapier wasm 42, React 19.5, three 17).
7. three.js render CPU 6.6 ms/frame (2 727 ms, 7.8 %); Gecko paint+flush ~1.2 ms/frame; main thread waits on GPU 1.1 %. GPU process threads 2-7 % CPU (Renderer 2.8 s, CanvasRenderer 3.2 s): no GPU stall visible.
8. GC: ~210 ms total (0.43 %, 0.32 ms/frame): 3 major cycles (max pause 15.1 ms), 27 slices (max 15.1), 23 minors (max 5.9). Not the problem. JIT: 4 331 bailouts, 840 at 10 s, 634 at 13 s, JIT discard at 13.46-14.14 s.
9. Profile caveat: 0-13.5 s sampled call chains have stale/false ancestors (25.4 % of samples under `angvel>fromRaw>free>linvel>sync>fnv`); leaf times are valid always, trees only from 13.5 s. Sampling at 2.07 ms achieved gap inflates absolute ms.
10. Gap to targets: items 1+2 alone = 40.3 ms/frame = 3.6x the 90 fps budget (11.1 ms); item 1 alone = 6.7x the 240 fps budget (4.17 ms).


# Firefox profile, Fleet 32-car crash scene (build 7cf2c6f9) — frame-cost report

Source: `Firefox_2026-10-12_14.03_profile.json.gz` (processed v36, Windows 10, i9-13900HX 24c/32t, features `js,stackwalk,samplingallthreads,markersallthreads,unregisteredthreads,processcpu`, requested interval 1 ms). Scripts + tables: `~/crash-wt/owner-traces/firefox/fleet-1012/` (`lib.cjs` loader+sourcemap resolver, `gen*.cjs` tables, `frames.cjs`, `persec.cjs`, `tree.cjs`).
All times below are wall ms weighted by each sample's own gap to the next sample (the sampler delivered one sample per 2.07 ms on average, p50 2.0, p99 4.6, max 8.1 ms, not 1 ms: the heavy profile config itself slows the page [INFERENCE: absolute ms are inflated by the sampler, shares and ratios are what to trust]). Time zero = earliest first sample of any thread (GPU GeckoMain), as in the Profiler UI.

## 0. Method caveat that changes how to read the call tree (measured)
Sampled JS ancestors are **wrong for 0-13.5 s and right after**. 12 231 ms (25.4 %) of the run sits under a bogus root chain `RunScript > angvel (rapier rigid_body.js:338) > fromRaw (math.js:23) > free (rapier_wasm3d_bg.js:5832) > linvel (rigid_body.js:322) > sync (car-surfaces.ts:374) > fnv (skin-kernel.ts:215) > slice > fixedStep ...`. Rapier wrappers cannot call game code, `fnv` cannot call `slice`: these are stale JIT-frame labels [INFERENCE: the cause; the mislabel itself is measured]. They occur in every second 0-13 (516-969 ms/s) and **never after 13.5 s** (<= 6 ms/s in seconds 14-48; `tick > tickInner > run > slice` is intact from 14 s). The reset coincides with the full GC at 13.46 s and its `TOO_MUCH_JIT_CODE` slice at 14.14 s (JIT discard). So: leaf (self) times are valid everywhere; inclusive/tree numbers are valid from 13.5 s; for 0-13.5 s use leaf-bucket tables, not parent chains. The owner's screenshot chain is the clean `tick` path (all of it falls in 13.5-49 s) and its percentages reproduce exactly (section 4).
Also `index-*`/`routes-*` (React) in the profile have different hashes than the src-7cf2 maps (index-AtN9g4yN vs index-DXFSnhIQ, routes-D1kXQRke vs routes-BZ2SNLlH); game chunks (engine-vc9yCvBZ, bench-loop-B5p1gMom, prefabs-DsYdxjMF, three-BvvydceQ, constants-DdKzQEQx) match the maps hash for hash, so game names below are exact. React frames stay minified.

## 1. Game thread and phases
- Game thread: thread 7, `GeckoMain`, `Isolated Web Content`, pid 24748, `baconwhiskey.org/crush`. CPU 44 773 ms over a 48.1 s sampled span (0.47-48.60 s) = **91 % busy** (the thread never idles; next largest tab thread is the WebExtensions process at 7 557 ms). 23 257 samples.
- 656 `RefreshDriverTick` markers = 13.4 frames/s average. 420 `LongTask` markers (64 % of ticks), mean 95 ms, max 234 ms. Max event delay 378 ms.
- Phases (from the `tick` timeline, call-tree first appearance of `integrate`/`integrateWreck` at 13 s, and GC events; names inferred from scene logic [INFERENCE]):

| phase | window | what the profile shows |
|---|---|---|
| A load/warm | 0-4 s | 21 ticks, 5.3 fps, p50 174 ms. Wall/frame 168 ms: Rapier wasm 42 ms, React 19.5, three 17, surfaces 31, cage 12 (leaf self ms/frame) |
| B approach | 4-13.5 s | 221 ticks, 23 fps, p50 38 ms; 840 JIT bailouts in second 10 (tick 153 ms) |
| C impact | 13.5-17 s | JIT discard at 13.46-14.14 s (GCMajor FULL_GC_TIMER, 15 ms max pause); 81 ticks, p50 41 ms (one 155 ms frame at the GC); `integrateWreck` grows 52 -> 332 ms/s |
| D aftermath-1 | 17-26 s | 60 ticks, 6.7 fps, p50 141 ms, up to 234 ms; pile-up: satCars+resolveCarPair 138-170 ms/s, stepBreakage/refit 60-125 ms/s, ragdoll `update` 23 ms/frame |
| E aftermath-2 | 26-39 s | 198 ticks, 15 fps, p50 60 ms (cage refit only 4 ms/frame) |
| F aftermath-3 | 39-49 s | 75 ticks, 7.5 fps, p50 113 ms, 199 ms p95 (second pile-up: cage 30 ms/frame, surfaces 45 ms/frame) |

## 2. Frame timeline
Tick = `RefreshDriverTick` marker duration (start to end of the frame's rAF + paint). Counts are of frames over the threshold.


| window | frames | fps (frames/s) | p50 ms | p95 | p99 | max | >11.1 | >16.7 | >33 | >50 |
|---|---|---|---|---|---|---|---|---|---|---|
| whole run | 656 | 13.4 | 58 | 192 | 209 | 234 | 624 | 605 | 571 | 419 |
| A load/warm 0-4 s | 21 | 5.3 | 174 | 197 | 204 | 204 | 21 | 21 | 21 | 21 |
| B approach 4-13.5 s | 221 | 23.3 | 38 | 95 | 109 | 153 | 189 | 171 | 144 | 77 |
| C impact 13.5-17 s | 81 | 23.1 | 41 | 50 | 155 | 155 | 81 | 81 | 80 | 3 |
| D aftermath-1 17-26 s | 60 | 6.7 | 141 | 223 | 234 | 234 | 60 | 60 | 60 | 58 |
| E aftermath-2 26-39 s | 198 | 15.2 | 60 | 96 | 112 | 120 | 198 | 197 | 191 | 185 |
| F aftermath-3 39-49 s | 75 | 7.5 | 113 | 199 | 202 | 202 | 75 | 75 | 75 | 75 |
| crash window 13.5-49 s | 414 | 11.7 | 63 | 199 | 211 | 234 | 414 | 413 | 406 | 321 |

Tick *period* (start to start, n=655): p50 58.3, p95 194.4, p99 211.0, max 286.4 ms; >11.1 ms 623, >16.7 ms 605, >33 ms 577, >50 ms 423. **No frame in the crash window is under 11.1 ms (target 90 fps), and only 1 of 414 is under 16.7 ms**; the 240 fps target (4.17 ms) is 15x away at the p50 (63 ms).

Frame time is the sim: in the crash window corr(frame duration, ms inside `slice`) = **0.967**, slope 0.81 ms of sim per ms of frame. Sim ms per frame (13.5-49 s) p5/p25/p50/p75/p95 = 27/34/45/77/156; non-sim (render, ragdoll, skin, HUD, Gecko) p5/p50/p95 = 7/19/53. Source of the floor [INFERENCE from `sim-pace.ts`]: `SimPacer.run` always runs >= 2 steps (`steps >= 2 && t1 > deadline` with `PACE_BUDGET_MS = 8`) and at most `MAX_STEPS = 8`; `tickInner` caps `wallDt` at 0.1 s. With one step costing ~13 ms here (27 ms p5 / 2), the 8 ms budget can never be met: every frame pays >= 2 steps, a 200 ms frame owes 8 steps. Step count is not observable in a sampled profile.

### Worst frames (what is inside them)
| tick start s | dur ms | top leaf self ms inside the frame (func source:line) |
|---|---|---|
| 21.08 | 234 | transformLine car-cage.ts:788 22; rasterise car-cage.ts:682 17; private ragdoll-proxy.ts:139 13; offer surfaces.ts:1040 12; offerAll surfaces.ts:1188 10 |
| 21.76 | 225 | rasterise car-cage.ts:682 17; offerAll surfaces.ts:1188 16; gridAt surfaces.ts:946 14; offer surfaces.ts:1040 14; transformLine car-cage.ts:788 12 |
| 21.32 | 223 | rasterise car-cage.ts:682 25; transformLine car-cage.ts:788 14; wasm-function[334] 12; gridAt surfaces.ts:946 12; bandAround cage-outline.ts:103 11 |
| 21.54 | 223 | rasterise car-cage.ts:682 20; offer surfaces.ts:1040 15; transformLine car-cage.ts:788 14; wasm-function[334] 13; offerAll surfaces.ts:1188 10 |
| 24.41 | 211 | bandAround cage-outline.ts:103 14; gridAt surfaces.ts:946 13; offer surfaces.ts:1040 12; report surfaces.ts:1235 11; bil surfaces.ts:855 10 |
| 25.44 | 210 | offer surfaces.ts:1040 24; rasterise car-cage.ts:682 16; transformLine car-cage.ts:788 8; seek surfaces.ts:1356 8; bandAround cage-outline.ts:103 8 |

All six worst frames sit at 21-25.5 s (aftermath-1 pile-up): 143-162 ms of each is `slice`, 28-65 ms is the ragdoll `update` (Rapier `world.step` + `fitProxy`), the rest is render 6-10 ms. Leaves are the same few: `rasterise`/`transformLine`/`bandAround` (cage refit) and `offer`/`gridAt`/`offerAll` (surface patch scan).

### Ticks per second (tick count / max tick ms)
s0-3: 4-6 ticks/s, 176-204 ms max; s4-9: 10-44 ticks/s (60-116 ms); s9: 44 ticks/s (the best second, 22 ms mean); s10: 37 ticks but a 153 ms frame; s11-16: 22-28 ticks/s; s17-25: 4-8 ticks/s (130-234 ms); s26-31: 10-15; s32-38: 16-18 ticks/s (60-120 ms); s39-48: 5-13 ticks/s (up to 202 ms). Main thread CPU is 912-946 ms of every wall second from s4 on (788 ms in s32): it is saturated, not waiting.

## 3. Time per function
Method: self = leaf frame, inclusive = frame anywhere in the stack (deduplicated per sample); names are source-mapped (`ident (file:line)`), minified name in the `min` column. Full lists: `top-all.txt`, `top-crash.txt`, `gen2-t-leaf.md`, `gen2-t-incl.md`.

### 3a. Split by chunk (leaf self, share of wall)
| chunk | whole run 0-49 s (48 138 ms) | crash 13.5-49 s (35 103 ms) | approach 0-13.5 s (13 035 ms) |
|---|---|---|---|
| game: prefabs (world/surfaces.ts) | 14 487 ms 30.1 % | 11 629 ms 33.1 % | 2 858 ms 21.9 % |
| game: bench-loop (vehicle/car*, deform, contact/cage-outline) | 11 350 ms 23.6 % | 9 782 ms 27.9 % | 1 569 ms 12.0 % |
| game: engine (sat, spectate-cam, ragdoll, camera) | 3 258 ms 6.8 % | 2 052 ms 5.8 % | 1 206 ms 9.3 % |
| game: constants (kernel/physics-core, render post) | 427 ms 0.9 % | 419 ms 1.2 % | 8 ms |
| three.js | 4 712 ms 9.8 % | 3 220 ms 9.2 % | 1 492 ms 11.4 % |
| Rapier wasm (+ skin-kernel wasm 250 ms) | 3 445 ms 7.2 % | 1 629 ms 4.6 % | 1 816 ms 13.9 % |
| Rapier JS wrappers (collider create/translate, wasm-bindgen free) | 1 133 ms 2.4 % | 58 ms 0.2 % | 1 075 ms 8.2 % |
| React (index+routes) | 1 039 ms 2.2 % | 259 ms 0.7 % | 780 ms 6.0 % |
| JIT code with no function label (0x... addresses) | 3 476 ms 7.2 % | 2 644 ms 7.5 % | 831 ms 6.4 % |
| other native (memcpy 449 ms, libm 172, waits 534, Zw*/Nt*, GC `js::gc` 922 incl. allocation/barriers, ...) | 4 759 ms 9.9 % | 3 380 ms 9.6 % | 1 380 ms |
| graphics/compositor on this thread | Gecko paint 730 ms (1.5 %), ViewManagerFlush 734 ms, Styles 52 ms; ~1.2 ms/frame |  |  |


### 3b. Top 40 self (crash window 13.5-49 s = 414 frames; whole-run ms and share alongside)
| rank | leaf function (source:line) | min | chunk | self ms/frame (crash) | % crash wall | whole-run ms | whole % |
|---|---|---|---|---|---|---|---|
| 1 | offer (game/world/surfaces.ts:1040) | Xt | game | 8.80 | 10.4 | 4707 | 9.8 |
| 2 | rasterise (game/vehicle/car-cage.ts:682) | Ul | game | 4.67 | 5.5 | 2343 | 4.9 |
| 3 | gridAt (game/world/surfaces.ts:946) | Jt | game | 4.15 | 4.9 | 2285 | 4.7 |
| 4 | offerAll (game/world/surfaces.ts:1188) | rn | game | 3.23 | 3.8 | 1837 | 3.8 |
| 5 | transformLine (game/vehicle/car-cage.ts:788) | Kl | game | 2.77 | 3.3 | 1147 | 2.4 |
| 6 | seek (game/world/surfaces.ts:1356) | hn | game | 2.28 | 2.7 | 1182 | 2.5 |
| 7 | bandAround (game/contact/cage-outline.ts:103) | Iv | game | 1.90 | 2.2 | 788 | 1.6 |
| 8 | bil (game/world/surfaces.ts:855) | Ht | game | 1.27 | 1.5 | 553 | 1.1 |
| 9 | readPoints (game/vehicle/car-air.ts:381) | Bf | game | 1.04 | 1.2 | 432 | 0.9 |
| 10 | ZwWaitForAlertByThreadId ExtensionCommon.sys.mjs | ZwWaitForAlert | other | 1.01 | 1.2 | 513 | 1.1 |
| 11 | cellHeight (game/world/surfaces.ts:883) | Gt | game | 1.00 | 1.2 | 413 | 0.9 |
| 12 | tread (game/world/surfaces.ts:1892) | mr | game | 0.93 | 1.1 | 528 | 1.1 |
| 13 | deepestIn (game/contact/sat.ts:97) | sc | game | 0.88 | 1.0 | 364 | 0.8 |
| 14 | wasm-function[334] rapier_wasm3d_bg.wasm:1022999 | wasm-function[ | rapier-wasm | 0.85 | 1.0 | 834 | 1.7 |
| 15 | sampleAt (game/vehicle/car-cage.ts:1224) | cu | game | 0.83 | 1.0 | 343 | 0.7 |
| 16 | normalOf (game/world/surfaces.ts:1200) | an | game | 0.77 | 0.9 | 319 | 0.7 |
| 17 | find (game/world/surfaces.ts:1182) | nn | game | 0.76 | 0.9 | 314 | 0.7 |
| 18 | cellSlopes (game/world/surfaces.ts:896) | Kt | game | 0.71 | 0.8 | 295 | 0.6 |
| 19 | report (game/world/surfaces.ts:1235) | on | game | 0.69 | 0.8 | 375 | 0.8 |
| 20 | bilSlopes (game/world/surfaces.ts:862) | Ut | game | 0.66 | 0.8 | 279 | 0.6 |
| 21 | transformGrid (game/vehicle/car-cage.ts:813) | ql | game | 0.63 | 0.7 | 259 | 0.5 |
| 22 | ? (github/crash-deformer-test/node_modules/three/build/three.core.js:5265) | applyQuaternio | three | 0.61 | 0.7 | 255 | 0.5 |
| 23 | wasm-function[37] rapier_wasm3d_bg.wasm:147620 | wasm-function[ | rapier-wasm | 0.56 | 0.7 | 625 | 1.3 |
| 24 | override (game/vehicle/car-surfaces.ts:191) | near | game | 0.53 | 0.6 | 219 | 0.5 |
| 25 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:18407) | Tt | three | 0.51 | 0.6 | 426 | 0.9 |
| 26 | wasm-function[3] skin-kernel.wasm:765 | wasm-function[ | rapier-wasm | 0.50 | 0.6 | 250 | 0.5 |
| 27 | private (game/deform/streamed-deform.ts:240) | solveCagesFrom | game | 0.49 | 0.6 | 204 | 0.4 |
| 28 | hypot2 (game/kernel/physics-core.js:108) | v | game | 0.47 | 0.6 | 194 | 0.4 |
| 29 | ? (github/crash-deformer-test/node_modules/three/build/three.core.js:5664) | crossVectors | three | 0.46 | 0.5 | 191 | 0.4 |
| 30 | wheelContact (game/world/surfaces.ts:1931) | hr | game | 0.46 | 0.5 | 234 | 0.5 |
| 31 | private (game/present/ragdoll-proxy.ts:139) | holds | game | 0.44 | 0.5 | 184 | 0.4 |
| 32 | private (game/present/ragdoll-proxy.ts:245) | cut | game | 0.42 | 0.5 | 174 | 0.4 |
| 33 | solveRows (game/vehicle/car-air.ts:890) | Ep | game | 0.40 | 0.5 | 292 | 0.6 |
| 34 | refresh (game/contact/cage-outline.ts:37) | refresh | game | 0.40 | 0.5 | 198 | 0.4 |
| 35 | private (game/present/ragdoll-proxy.ts:235) | sample | game | 0.38 | 0.5 | 159 | 0.3 |
| 36 | hypot3 (game/kernel/physics-core.js:122) | te | game | 0.38 | 0.4 | 157 | 0.3 |
| 37 | seekAll (game/world/surfaces.ts:1367) | gn | game | 0.37 | 0.4 | 155 | 0.3 |
| 38 | creased (game/world/surfaces.ts:874) | Wt | game | 0.37 | 0.4 | 177 | 0.4 |
| 39 | ? (github/crash-deformer-test/node_modules/three/build/three.core.js:10570) | multiplyMatric | three | 0.37 | 0.4 | 153 | 0.3 |
| 40 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:242) | o | three | 0.35 | 0.4 | 221 | 0.5 |

Same top 12 over the whole run (ms, %): offer 4 707 (9.8), rasterise 2 343 (4.9), gridAt 2 285 (4.7), offerAll 1 837 (3.8), seek 1 182 (2.5), transformLine 1 147 (2.4), wasm-function[334] 834 (1.7), bandAround 788 (1.6), wasm-function[37] 625 (1.3), bil 553 (1.1), tread 528 (1.1), `ZwWaitForAlertByThreadId` 513 (1.1). `world/surfaces.ts` leaf functions alone are 14 412 ms = **29.9 %** of the whole run (11 750 ms = 33 % of the crash window).

### 3c. Top 40 inclusive (app chunks only; `RunScript`/rAF wrapper rows dropped)
**whole run 0-49 s** (wall 48138 ms, 656 frames)

| rank | inclusive fn (source:line) | min | ms | % | ms/frame |
|---|---|---|---|---|---|
| 1 | private (game/engine/engine.ts:162) | slice | 33466 | 69.5 | 51.02 |
| 2 | stepWorld (game/engine/world-step.ts:126) | nu | 32664 | 67.9 | 49.79 |
| 3 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:16) | i | 32594 | 67.7 | 49.69 |
| 4 | protected (game/engine/engine.ts:396) | tickInner | 32586 | 67.7 | 49.67 |
| 5 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:17616) | ft | 32580 | 67.7 | 49.66 |
| 6 | private (game/engine/engine.ts:384) | tick | 32578 | 67.7 | 49.66 |
| 7 | private (game/engine/engine.ts:574) | fixedStep | 30970 | 64.3 | 47.21 |
| 8 | run (game/engine/sim-pace.ts:91) | run | 25790 | 53.6 | 39.31 |
| 9 | integrate (game/vehicle/car.ts:485) | integrate | 15262 | 31.7 | 23.27 |
| 10 | stepFree (game/vehicle/car-air.ts:1332) | sm | 13992 | 29.1 | 21.33 |
| 11 | seek (game/world/surfaces.ts:1356) | hn | 13474 | 28.0 | 20.54 |
| 12 | private (game/vehicle/car.ts:449) | integrateWreck | 12350 | 25.7 | 18.83 |
| 13 | ? (github/crash-deformer-test/node_modules/@dimforge/rapier3d-simd/math.js:23) | fromRaw | 12240 | 25.4 | 18.66 |
| 14 | ? (github/crash-deformer-test/node_modules/@dimforge/rapier3d-simd/dynamics/rigid_body.js:338) | angvel | 12231 | 25.4 | 18.64 |
| 15 | ? (github/crash-deformer-test/node_modules/@dimforge/rapier3d-simd/dynamics/rigid_body.js:322) | linvel | 12221 | 25.4 | 18.63 |
| 16 | ? (github/crash-deformer-test/node_modules/@dimforge/rapier3d-simd/rapier_wasm3d_bg.js:5832) | free | 12210 | 25.4 | 18.61 |
| 17 | offer (game/world/surfaces.ts:1040) | Xt | 9722 | 20.2 | 14.82 |
| 18 | offerAll (game/world/surfaces.ts:1188) | rn | 8544 | 17.7 | 13.02 |
| 19 | sync (game/vehicle/car-surfaces.ts:374) | sync | 8080 | 16.8 | 12.32 |
| 20 | readPoints (game/vehicle/car-air.ts:381) | Bf | 7864 | 16.3 | 11.99 |
| 21 | fnv (game/deform/skin-kernel.ts:215) | yh | 7689 | 16.0 | 11.72 |
| 22 | wheelContact (game/world/surfaces.ts:1931) | hr | 7439 | 15.5 | 11.34 |
| 23 | tread (game/world/surfaces.ts:1892) | mr | 6796 | 14.1 | 10.36 |
| 24 | find (game/world/surfaces.ts:1182) | nn | 6702 | 13.9 | 10.22 |
| 25 | pointContact (game/world/surfaces.ts:1292) | ln | 6187 | 12.9 | 9.43 |
| 26 | wheelsAt (game/vehicle/car-air.ts:711) | gp | 5695 | 11.8 | 8.68 |
| 27 | seekAll (game/world/surfaces.ts:1367) | gn | 5340 | 11.1 | 8.14 |
| 28 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:17674) | rd/this.render | 5111 | 10.6 | 7.79 |
| 29 | gridAt (game/world/surfaces.ts:946) | Jt | 4734 | 9.8 | 7.22 |
| 30 | resolveCarPair (game/contact/pair-contact.ts:396) | Xl | 4343 | 9.0 | 6.62 |
| 31 | render (game/present/engine-post.ts:310) | render | 3815 | 7.9 | 5.82 |
| 32 | satCars (game/contact/sat.ts:195) | lc | 3509 | 7.3 | 5.35 |
| 33 | resetVisual (game/vehicle/car.ts:167) | resetVisual | 3442 | 7.2 | 5.25 |
| 34 | wasm-function[37] rapier_wasm3d_bg.wasm:147620 | wasm-function[ | 3073 | 6.4 | 4.68 |
| 35 | wasm-function[198] rapier_wasm3d_bg.wasm:863297 | wasm-function[ | 3073 | 6.4 | 4.68 |
| 36 | deepestIn (game/contact/sat.ts:97) | sc | 2846 | 5.9 | 4.34 |
| 37 | update (game/present/engine-ragdoll.ts:433) | update | 2787 | 5.8 | 4.25 |
| 38 | h</wd/< index:9 | h</wd/< | 2765 | 5.7 | 4.22 |
| 39 | stepLoose (game/vehicle/loose-step.ts:150) | Em | 2748 | 5.7 | 4.19 |
| 40 | write (game/present/pose-blend.ts:45) | kc | 2739 | 5.7 | 4.18 |

**crash window 13.5-49 s** (wall 35103 ms, 414 frames)

| rank | inclusive fn (source:line) | min | ms | % | ms/frame |
|---|---|---|---|---|---|
| 1 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:16) | i | 32594 | 92.9 | 78.73 |
| 2 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:17616) | ft | 32580 | 92.8 | 78.70 |
| 3 | protected (game/engine/engine.ts:396) | tickInner | 32578 | 92.8 | 78.69 |
| 4 | private (game/engine/engine.ts:384) | tick | 32578 | 92.8 | 78.69 |
| 5 | private (game/engine/engine.ts:162) | slice | 25933 | 73.9 | 62.64 |
| 6 | run (game/engine/sim-pace.ts:91) | run | 25786 | 73.5 | 62.29 |
| 7 | stepWorld (game/engine/world-step.ts:126) | nu | 23955 | 68.2 | 57.86 |
| 8 | private (game/engine/engine.ts:574) | fixedStep | 23953 | 68.2 | 57.86 |
| 9 | integrate (game/vehicle/car.ts:485) | integrate | 15262 | 43.5 | 36.87 |
| 10 | stepFree (game/vehicle/car-air.ts:1332) | sm | 13703 | 39.0 | 33.10 |
| 11 | private (game/vehicle/car.ts:449) | integrateWreck | 12350 | 35.2 | 29.83 |
| 12 | seek (game/world/surfaces.ts:1356) | hn | 10341 | 29.5 | 24.98 |
| 13 | readPoints (game/vehicle/car-air.ts:381) | Bf | 7844 | 22.3 | 18.95 |
| 14 | offer (game/world/surfaces.ts:1040) | Xt | 7505 | 21.4 | 18.13 |
| 15 | find (game/world/surfaces.ts:1182) | nn | 6702 | 19.1 | 16.19 |
| 16 | offerAll (game/world/surfaces.ts:1188) | rn | 6347 | 18.1 | 15.33 |
| 17 | pointContact (game/world/surfaces.ts:1292) | ln | 6097 | 17.4 | 14.73 |
| 18 | wheelsAt (game/vehicle/car-air.ts:711) | gp | 5695 | 16.2 | 13.76 |
| 19 | wheelContact (game/world/surfaces.ts:1931) | hr | 5659 | 16.1 | 13.67 |
| 20 | seekAll (game/world/surfaces.ts:1367) | gn | 5340 | 15.2 | 12.90 |
| 21 | tread (game/world/surfaces.ts:1892) | mr | 5142 | 14.6 | 12.42 |
| 22 | resolveCarPair (game/contact/pair-contact.ts:396) | Xl | 3685 | 10.5 | 8.90 |
| 23 | gridAt (game/world/surfaces.ts:946) | Jt | 3648 | 10.4 | 8.81 |
| 24 | satCars (game/contact/sat.ts:195) | lc | 2956 | 8.4 | 7.14 |
| 25 | deepestIn (game/contact/sat.ts:97) | sc | 2846 | 8.1 | 6.87 |
| 26 | ? (github/crash-deformer-test/node_modules/three/build/three.module.js:17674) | rd/this.render | 2727 | 7.8 | 6.59 |
| 27 | render (game/present/engine-cine.ts:585) | render | 2677 | 7.6 | 6.47 |
| 28 | render (game/present/engine-post.ts:310) | render | 2594 | 7.4 | 6.27 |
| 29 | update (game/present/engine-ragdoll.ts:433) | update | 2583 | 7.4 | 6.24 |
| 30 | refit (game/vehicle/car-cage-rig.ts:200) | refit | 2205 | 6.3 | 5.33 |
| 31 | private (game/vehicle/car.ts:82) | fitCage | 2205 | 6.3 | 5.33 |
| 32 | refit (game/vehicle/car-cage.ts:988) | refit | 2128 | 6.1 | 5.14 |
| 33 | private (game/vehicle/car-cage.ts:997) | fit | 2103 | 6.0 | 5.08 |
| 34 | rasterise (game/vehicle/car-cage.ts:682) | Ul | 1989 | 5.7 | 4.80 |
| 35 | settleStep (game/engine/world-step.ts:270) | ru | 1859 | 5.3 | 4.49 |
| 36 | stepBreakage (game/vehicle/car.ts:515) | stepBreakage | 1853 | 5.3 | 4.48 |
| 37 | protected (game/vehicle/car-parts.ts:708) | stepLooseParts | 1752 | 5.0 | 4.23 |
| 38 | stepLoose (game/vehicle/loose-step.ts:150) | Em | 1722 | 4.9 | 4.16 |
| 39 | planField (game/vehicle/car-cage.ts:978) | planField | 1532 | 4.4 | 3.70 |
| 40 | planFieldOf (game/vehicle/car-cage.ts:831) | Jl | 1527 | 4.3 | 3.69 |


Note the whole-run rows `angvel/fromRaw/free/linvel/sync/fnv` in `gen2-t-incl.md` (12.2-12.3 s) are the bogus root chain of section 0, not real cost; read the `crash window` table for tree shape.

## 4. The owner's screenshot chain, named
Whole-run percentages reproduce the screenshot's numbers (tick 67.7, run 53.6 ~54, fixedStep 49.5 ~50, nu 49.4 ~49, integrate 31.7 ~32, integrateWreck 25.7 ~26, sm 22.9 ~23, gp 10.8 ~11, hr 10.7 ~11, mr 9.9 ~9.8, hn 8.9 ~8.8, nn 6.0, rn 5.6, Xt 4.1, Bf 10.6 ~11). Percent = share of the window's wall; each row is the node under its single parent path.

Path-specific (the UI's node under its one parent path), % of the window wall. whole run = 48138 ms; crash window 13.5-49 s = 35103 ms, 414 frames.

| minified | source fn | whole-run ms | whole % | crash ms | crash % | crash ms/frame |
|---|---|---|---|---|---|---|
| tick | private (game/engine/engine.ts:384) | 32578 | 67.7 | 32578 | 92.8 | 78.69 |
| tickInner | protected (game/engine/engine.ts:396) | 32578 | 67.7 | 32578 | 92.8 | 78.69 |
| run (SimPacer.run) | run (game/engine/sim-pace.ts:91) | 25786 | 53.6 | 25786 | 73.5 | 62.29 |
| slice | private (game/engine/engine.ts:162) | 25781 | 53.6 | 25781 | 73.4 | 62.27 |
| fixedStep | private (game/engine/engine.ts:574) | 23805 | 49.5 | 23805 | 67.8 | 57.50 |
| nu = stepWorld | stepWorld (game/engine/world-step.ts:126) | 23773 | 49.4 | 23773 | 67.7 | 57.42 |
| integrate | integrate (game/vehicle/car.ts:485) | 15262 | 31.7 | 15262 | 43.5 | 36.87 |
| integrateWreck | private (game/vehicle/car.ts:449) | 12350 | 25.7 | 12350 | 35.2 | 29.83 |
| sm = stepFree | stepFree (game/vehicle/car-air.ts:1332) | 11025 | 22.9 | 11025 | 31.4 | 26.63 |
| gp = wheelsAt | wheelsAt (game/vehicle/car-air.ts:711) | 5177 | 10.8 | 5177 | 14.7 | 12.50 |
| hr = wheelContact | wheelContact (game/world/surfaces.ts:1931) | 5131 | 10.7 | 5131 | 14.6 | 12.39 |
| mr = tread | tread (game/world/surfaces.ts:1892) | 4755 | 9.9 | 4755 | 13.5 | 11.49 |
| hn = seek | seek (game/world/surfaces.ts:1356) | 4269 | 8.9 | 4269 | 12.2 | 10.31 |
| nn = find | find (game/world/surfaces.ts:1182) | 2881 | 6.0 | 2881 | 8.2 | 6.96 |
| rn = offerAll | offerAll (game/world/surfaces.ts:1188) | 2710 | 5.6 | 2710 | 7.7 | 6.55 |
| Xt = offer | offer (game/world/surfaces.ts:1040) | 1985 | 4.1 | 1985 | 5.7 | 4.79 |
| Bf = readPoints (under stepFree) | readPoints (game/vehicle/car-air.ts:381) | 5081 | 10.6 | 5081 | 14.5 | 12.27 |
| ln = pointContact (under readPoints) | pointContact (game/world/surfaces.ts:1292) | 4354 | 9.0 | 4354 | 12.4 | 10.52 |
| gn = seekAll | seekAll (game/world/surfaces.ts:1367) | 3664 | 7.6 | 3664 | 10.4 | 8.85 |

What they are (from `src-7cf2`): `stepWorld` = one fixed step of the world (arm tops, per-car `integrate`, pair SAT through `resolveCarPair`, structure, `afterContacts`). `integrate` (car.ts:485) calls `integrateWreck` (car.ts:449) for a car whose `deform.massActive`; that calls `stepFree` (car-air.ts:1332), the free-body step, which per step does `wheelsAt` (4 wheels x `wheelContact` x `tread` footprint points x `seek`) and `readPoints` (~220 cage/belly points x `pointContact` x `seekAll` x `seek`). `seek` (surfaces.ts:1356) = `find` over the static surface + solids (`find` -> `plainCell`/`plainOffer` else `offerAll`) + a loop of `offer` over every car-top patch near the asker. `offerAll` loops `s.always[0..nAlways)` plus the cell list, `offer` is the per-patch bbox test + `deckAt`/`prismAt`/`gridAt`. `Xt = offer` is the hot leaf (self 4 707 ms whole run).
In the screenshot tree `Xt 4.1 %` is only the `offer` under `offerAll`; `offer` is also called straight from `seek` (tops loop: `seek > offer` 1 061 ms under the `wheelsAt` path of `integrateWreck`): all `offer` = 9 722 ms inclusive (20.2 %), 4 707 ms self (9.8 %).


## 5. Inside the wreck path (`integrateWreck` and below), crash window 13.5-49 s, 414 frames
`integrateWreck` is **29.8 ms/frame = 34.8 % of wall, 81 % of `integrate`** (integrate = 36.9 ms/frame). Its subtree (inclusive and self ms per frame; everything below `integrateWreck` only):

integrateWreck subtree, crash window: 12350 ms = 29.83 ms/frame (34.8% of wall).

| fn (source) | min | self ms/frame | inclusive ms/frame | % of integrateWreck |
|---|---|---|---|---|
| private (game/vehicle/car.ts:449) | integrateWreck | 0.10 | 29.83 | 100% |
| stepFree (game/vehicle/car-air.ts:1332) | sm | 0.19 | 26.63 | 89% |
| seek (game/world/surfaces.ts:1356) | hn | 1.87 | 20.23 | 68% |
| offer (game/world/surfaces.ts:1040) | Xt | 7.12 | 14.45 | 48% |
| readPoints (game/vehicle/car-air.ts:381) | Bf | 0.69 | 13.54 | 45% |
| wheelsAt (game/vehicle/car-air.ts:711) | gp | 0.08 | 12.50 | 42% |
| find (game/world/surfaces.ts:1182) | nn | 0.58 | 12.47 | 42% |
| wheelContact (game/world/surfaces.ts:1931) | hr | 0.36 | 12.39 | 42% |
| offerAll (game/world/surfaces.ts:1188) | rn | 2.57 | 11.72 | 39% |
| tread (game/world/surfaces.ts:1892) | mr | 0.84 | 11.49 | 39% |
| pointContact (game/world/surfaces.ts:1292) | ln | 0.16 | 10.52 | 35% |
| seekAll (game/world/surfaces.ts:1367) | gn | 0.24 | 9.46 | 32% |
| gridAt (game/world/surfaces.ts:946) | Jt | 3.24 | 6.93 | 23% |
| protected (game/vehicle/car-parts.ts:708) | stepLooseParts | 0.03 | 2.29 | 8% |
| stepLoose (game/vehicle/loose-step.ts:150) | Em | 0.03 | 2.23 | 7% |
| cellHeight (game/world/surfaces.ts:883) | Gt | 0.77 | 1.79 | 6% |
| answer (game/world/surfaces.ts:1304) | dn | 0.15 | 1.53 | 5% |
| report (game/world/surfaces.ts:1235) | on | 0.44 | 1.47 | 5% |
| cellSlopes (game/world/surfaces.ts:896) | Kt | 0.59 | 1.47 | 5% |
| pointContactHeld (game/world/surfaces.ts:1298) | un | 0.04 | 1.10 | 4% |
| readBelly (game/vehicle/car-air.ts:320) | If | 0.03 | 1.08 | 4% |
| bil (game/world/surfaces.ts:855) | Ht | 1.00 | 1.00 | 3% |
| normalOf (game/world/surfaces.ts:1200) | an | 0.52 | 0.80 | 3% |
| solveRows (game/vehicle/car-air.ts:890) | Ep | 0.23 | 0.73 | 2% |
| edgeCross (game/world/surfaces.ts:1770) | sr | 0.02 | 0.70 | 2% |
| armOf (game/vehicle/car-air.ts:663) | lp | 0.17 | 0.55 | 2% |

Everything under `integrateWreck` (12 350 ms) by leaf bucket: surface queries (surfaces.ts) 9 062 ms **73 %**, native/unlabelled JIT 1 200 (9.7 %), car-air.ts 787 (6.4 %), three.js 610 (4.9 %, `applyQuaternion`, `crossVectors` [INFERENCE: `armOf` and `crossVectors(w, r)` per point]), car-surfaces.ts 210, kernel hypot 187, cage 51, mass solver 50 (0.4 %).
So within the wreck path: **surface queries 73 %; mass solver 0.4 %; cage refit/rasterise 0.4 %; three.js matrix/vector math 4.9 %**. The wreck path is a surface-query machine: `stepFree` (26.6 ms/frame) = `wheelsAt` 12.5 ms/frame (4 wheels' tread footprints, 5 177 ms) + `readPoints` 12.3 ms/frame directly under it (5 081 ms; `pointContact` 10.5, `readBelly` 1.1, `armOf` 0.55; 13.5 ms/frame counting the `stepLoose` > `readPoints` calls).

### Whole sim step (`slice`) by leaf bucket, ms per frame, crash window
crash window 13.5-49 s: 414 frames, wall 35.5 s. cells = ms per frame (share of that column).

| bucket (leaf self time) | whole thread | under tick (JS frame) | under slice (sim step) | under integrateWreck |
|---|---|---|---|---|
| surface queries (world/surfaces.ts, ground.ts) | 28.04 (33%) | 27.90 (35%) | 27.48 (44%) | 21.89 (73%) |
| cage refit/rasterise/outline (car-cage*.ts, cage-outline.ts) | 12.34 (15%) | 12.33 (16%) | 12.22 (20%) | 0.15 (0%) |
| mass/deform solver (deform-*.ts, shape-match-core.js, streamed-deform) | 5.27 (6%) | 5.26 (7%) | 4.91 (8%) | 0.15 (0%) |
| car-car / prop contact (sat.ts, pair-contact, external-contact) | 2.25 (3%) | 2.25 (3%) | 2.25 (4%) | 0.00 (0%) |
| wreck body step + car (car-air.ts, car-surfaces.ts, car.ts, loose-step ...) | 5.83 (7%) | 5.79 (7%) | 5.34 (9%) | 2.78 (9%) |
| kernel math (physics-core.js hypot, three-trig) | 1.09 (1%) | 1.08 (1%) | 1.04 (2%) | 0.48 (2%) |
| other game code | 2.94 (3%) | 2.83 (4%) | 0.54 (1%) | 0.01 (0%) |
| three.js (matrix / quaternion / render) | 7.78 (9%) | 7.69 (10%) | 3.43 (5%) | 1.47 (5%) |
| Rapier + skin-kernel wasm | 4.07 (5%) | 4.02 (5%) | 0.04 (0%) | 0.00 (0%) |
| React (index/routes) | 0.62 (1%) | 0.00 (0%) | 0.00 (0%) | 0.00 (0%) |
| native: unlabelled JIT / GC / waits / memcpy | 14.56 (17%) | 9.54 (12%) | 5.39 (9%) | 2.90 (10%) |
| TOTAL ms/frame | 84.79 | 78.69 | 62.64 | 29.83 |

The wreck path is only one third of the sim: of 62.6 ms/frame in `slice`, `integrateWreck` is 29.8, and the surfaces.ts bucket is 27.5 ms/frame inside `slice` (5.6 ms/frame of it outside `integrateWreck`: `integrate > stepFree` of cars that are not `massActive`, 2 648 ms inclusive = 6.4 ms/frame with `readPoints` 1 780 ms and `wheelsAt` 509 ms, plus `landOn`/`readGround` ~0.9).
Cage refit/rasterise/outline (12.3 ms/frame) is **not** in the wreck path; its callers:
Leaf in car-cage*.ts/cage-outline.ts, crash window: 5075 ms = 12.26 ms/frame. Grouped by first caller outside those files:

| caller | ms | ms/frame |
|---|---|---|
| deepestIn (game/contact/sat.ts:97) [sc@engine] | 2123 | 5.13 |
| private (game/vehicle/car.ts:82) [fitCage@bench-loop] | 2104 | 5.08 |
| stepWorld (game/engine/world-step.ts:126) [nu@engine] | 265 | 0.64 |
| markApproaches (game/contact/pair-contact.ts:95) [kl@engine] | 249 | 0.60 |
| outlineNormal (game/contact/sat.ts:164) [cc@engine] | 181 | 0.44 |
| loadPoints (game/vehicle/car-air.ts:612) [sp@bench-loop] | 91 | 0.22 |
| private (game/present/engine-ragdoll.ts:975) [shape@engine] | 49 | 0.12 |
| sync (game/vehicle/car-surfaces.ts:374) [sync@bench-loop] | 6 | 0.01 |

`rasterise` (car-cage.ts:682, 4.7 ms/frame), `transformLine` (788, 2.8), `bandAround` (cage-outline.ts:103, 1.9), `sampleAt` (1224, 0.8), `transformGrid` (813, 0.6). Two callers dominate: `settleStep` -> `stepBreakage` -> `fitCage` -> `refit` -> `fit` -> `rasterise` (5.1 ms/frame; 1 859 ms `settleStep`, 1 853 `stepBreakage`, 2 205 `fitCage` inclusive) and `satCars` -> `deepestIn` -> `sampleAt`/cage samples (5.1 ms/frame; `satCars` 2 956 ms inclusive, `resolveCarPair` 3 685). `planField`/`planFieldOf` -> `transformGrid`/`transformLine` is 1 532 ms inclusive (the `stepFree` `loadPoints` path).

### Per-phase leaf self ms/frame (whole thread, all phases)
leaf self ms per frame by phase (frames: A 0-4=21, B 4-13.5=221, C 13.5-17=81, D 17-26=60, E 26-39=198, F 39-49=75)

| bucket | A 0-4 | B 4-13.5 | C 13.5-17 | D 17-26 | E 26-39 | F 39-49 |
|---|---|---|---|---|---|---|
| surface queries | 30.6 | 9.8 | 14.6 | 44.0 | 22.1 | 45.5 |
| cage refit/rasterise/outline | 12.4 | 1.0 | 2.0 | 31.2 | 4.1 | 30.1 |
| mass/deform solver | 4.1 | 1.0 | 2.9 | 10.1 | 3.5 | 8.6 |
| car-car/prop contact | 1.8 | 0.3 | 1.0 | 4.0 | 1.4 | 4.5 |
| wreck body step (car-air, car-surfaces, car) | 6.6 | 2.7 | 4.1 | 7.3 | 5.5 | 7.4 |
| camera + ragdoll proxy code | 11.6 | 3.2 | 0.2 | 8.2 | 1.6 | 0.1 |
| kernel math | 0.1 | 0.1 | 0.7 | 1.5 | 1.0 | 1.3 |
| other game | 3.1 | 0.8 | 0.7 | 1.2 | 0.8 | 1.2 |
| three.js | 17.2 | 5.1 | 5.1 | 9.0 | 7.8 | 9.6 |
| Rapier/skin wasm | 42.3 | 9.1 | 0.7 | 13.0 | 3.2 | 2.8 |
| React | 19.5 | 1.7 | 0.5 | 0.7 | 0.8 | 0.3 |
| native (unlabelled JIT, GC, waits, memcpy) | 19.0 | 8.2 | 10.7 | 19.9 | 13.7 | 16.7 |
| wall ms/frame | 168.3 | 43.0 | 43.2 | 150.0 | 65.7 | 128.0 |

inclusive ms per frame (any path):

| fn | A 0-4 | B 4-13.5 | C 13.5-17 | D 17-26 | E 26-39 | F 39-49 | whole run ms |
|---|---|---|---|---|---|---|---|
| three WebGLRenderer.render (three.module.js:17674) | 21.7 | 8.7 | 5.1 | 7.2 | 6.7 | 7.2 | 5111 |
| engine render (engine-cine.ts:585) | 0.0 | 0.0 | 4.3 | 7.4 | 6.8 | 7.2 | 2677 |
| updateMatrixWorld (three.core.js:13067) | 0.5 | 0.6 | 0.7 | 0.9 | 0.6 | 0.5 | 408 |
| ragdoll update (engine-ragdoll.ts:433) | 0.9 | 0.8 | 0.1 | 23.2 | 5.2 | 2.0 | 2787 |
| Rapier world.step (world.js:126) | 0.0 | 0.0 | 0.0 | 11.5 | 2.7 | 1.6 | 1351 |
| updateSkin (car.ts:533) | 3.3 | 0.6 | 1.0 | 3.3 | 1.2 | 3.4 | 973 |
| pose-blend write (pose-blend.ts:45) | 57.4 | 6.9 | 0.0 | 0.0 | 0.0 | 0.0 | 2739 |

Mass/deform solver (deform-solve, shape-match-core, streamed-deform, deform-*): 5.3 ms/frame in the crash window (6 %), peak 10.1 ms/frame in aftermath-1. Rapier world step (ragdoll world `update` -> `world.step`, wasm-function[198]/[37]/[334]): 11.5 ms/frame in aftermath-1, 42 ms/frame (labelled `pose-blend write` ancestors, i.e. stale chain) in the 0-4 s load.


## 6. Render side, GPU/compositor, GC
### three.js / WebGL on the game thread (CPU cost of issuing the frame)
- `WebGLRenderer.render` (three.module.js:17674) inclusive: **6.59 ms/frame = 2 727 ms = 7.8 % in the crash window**; per phase (any path) 21.7 (0-4 s, incl. stale-label chains), 8.7, 5.1, 7.2, 6.7, 7.2 ms/frame. The engine's `render` (engine-cine.ts:585 -> engine-post.ts:310 post chain) is 4.3 / 7.4 / 6.8 / 7.2 ms/frame in phases C-F. This stays ~6-7 ms regardless of the sim's cost.
- Inside `render` (13.5-49 s): `renderBufferDirect` 1 017 ms (2.5 ms/frame; `setProgram` `Tt` three.module.js:18407 663 ms with uniform `setValue` 213 + `upload` 160), `projectObject` (`gt` 17897 recursion) 626 ms (1.5 ms/frame), `wheel-batch.ts:126 render` -> three.module.js:9143 519 ms (1.25 ms/frame), `updateMatrixWorld` 245 ms (0.6 ms/frame).
- three.js leaf self in the crash window (3 288 ms, 9.2 % = 7.8 ms/frame) is wider than render: sim-side `applyQuaternion` (three.core.js:5265, 0.61 ms/frame), `crossVectors` (5664, 0.46), `multiplyMatrices` (10570, 0.37), `Tt` setProgram (0.51).
- Main-thread Gecko graphics per frame: `Update the rendering Paint` 730 ms (1.5 %), `ViewManagerFlush` 734 ms (656 markers, mean 1.12, max 11.5 ms), `Styles` 52 ms, 3 738 `CreateWebRenderCommands fallback` markers (3.3 ms total), `PWebGL::Msg_GetFrontBuffer` 220 markers; `ZwWaitForAlertByThreadId` (main thread blocked) 513 ms = 1.1 % of wall. 47 `RefreshDriverTick waiting for paint`. Total ~1.2 ms/frame outside three.js.
- HUD/React: leaf self only 259 ms (0.7 %) in the crash window, but inclusive 1 165 ms = **3.3 % = 2.8 ms/frame**, almost all via a microtask after each rAF (`QueuedMicrotask::Run` -> React work loop `gu/ld/id/od`, index:9: 1 087 ms, 539 samples). In 0-13.5 s React leaf self is 780 ms (6.0 %) (`wh routes:42`, `Xc`, `oc`, `H`: the HUD mounting) and 19.5 ms/frame in the first 4 s; parent chains there are stale so inclusive React is not trusted.

### GPU process and compositor (other threads of the same profile)
| thread | CPU 0-49 s | busy | what it does |
|---|---|---|---|
| game GeckoMain (pid 24748) | 44 773 ms | 91 % | the frame |
| Renderer (WebRender, gpu pid 24892) | 2 838 ms | 6 % | `HandleFrameOneDoc` 1 623 ms of its 2 137 ms in 13-49 s; waits (13-49 s) `NtGdiDdDDIGetDeviceState` 419, `NtDelayExecution` 488, `WaitForFrameGPUQuery` 17 ms, `NtGdiDdDDIPresent` 50 ms |
| CanvasRenderer (gpu, runs the page's WebGL on ANGLE/D3D11) | 3 230 ms | 7 % | `PCanvasManagerParent > PWebGL::Msg_DispatchCommands` 1 274 ms inclusive (13.5-49 s) = 3.1 ms/frame; mostly idle in `ZwWaitForAlertByThreadId` 960 ms |
| GPU GeckoMain | 899 ms | 2 % | message loop idle |
| Browser parent process GeckoMain | 5 197 ms | 11 % | UI |
| WebExtensions process GeckoMain + TaskController | 7 557 + 4 665 ms | 15 % + 10 % | a browser extension; `contentscript.js` frames in the game page total < 100 ms |
All GPU-process threads sit at 2-7 % CPU and the game thread waits on the GPU for 1.1 % of wall, so nothing here shows a GPU stall. Actual GPU shader time is not in this profile [INFERENCE: not the limiter, given the 6.6 ms CPU render and the idle compositor; a GPU timer query is needed to confirm].

### GC and JIT (game thread markers)
- GC: 3 `GCMajor` cycles (reasons `FULL_GC_TIMER` at 13.46 s, `CC_FINISHED` at 28.74 and 37.14 s; `max_pause` 15.1 / 10.1 / 10.1 ms, total_time 46.3 / 44.7 / 34.0 ms; cycle spans 1.53 / 1.85 / 1.31 s are incremental, not pauses); `GCSlice` x27 sum 125.1 ms (mean 4.6, max 15.1); `GCMinor` x23 sum 84.5 ms (mean 3.7, max 5.9; reason `FULL_VALUE_BUFFER`/nursery full, ~1 per 2 s); `CC` x4. **GC total ~210 ms = 0.43 % of the run, 0.32 ms/frame**, worst pause 15.1 ms (one 14.7-15.1 s `INTER_SLICE_GC`). Leaf frames inside `js::gc` (marking, barriers, allocation) are 922 ms (1.9 %).
- JIT churn: 4 331 `Bailout` markers (0.00 ms each, i.e. recorded events): 840 at 10 s, 634 at 13 s, 239/173/238/469/239/153/143/109 per second for 14-21 s, 285 at 32 s, 215 at 35 s, <60/s elsewhere. Top reasons: `FirstExecution at JumpTarget` bench-loop:16 (939), engine:2 (406), bench-loop:1 (269), `TranspiledCacheIR` three:1 (300+146+115) and engine:2 (137). GC reasons around the impact include `TOO_MUCH_MALLOC` (13.87 s) and `TOO_MUCH_JIT_CODE` (14.14 s) with 6 `DiscardJit` markers, after which the game's hot code reruns cold. Not a per-frame cost, but it brackets the 153-155 ms frames at 10 s and 13.5-14 s.
- 7.2 % of leaf time (3 476 ms) is JIT code with no resolvable function (raw 0x19fea.../0x19febc... addresses): unattributable to a source line.


## 7. Five biggest offenders, ranked by ms per frame
ms/frame = leaf self time in the bucket divided by frames (crash window 13.5-49 s: 414 frames, 35.1 s; whole run: 656 frames, 48.1 s). Frame wall = 84.8 ms (crash) / 73.4 ms (whole). Target budgets: 11.1 ms (90 fps), 4.17 ms (240 fps).

| # | offender | crash ms/frame (share) | whole-run ms/frame (share) | evidence |
|---|---|---|---|---|
| 1 | **Surface patch queries** `world/surfaces.ts` (`offer`, `gridAt`, `offerAll`, `seek`, `bil`, `find`, `tread`, `cellHeight`, `report`, `normalOf`) | **28.0 (33 %)** | 22.0 (29.9 %) | leaf self 14 412 ms whole run. Top single leaf `offer` 8.8 ms/frame (10.4 %), `gridAt` 4.2, `offerAll` 3.2, `seek` 2.3, `bil` 1.3. 73 % of `integrateWreck` (21.9 of 29.8 ms/frame); callers `wheelsAt` 12.5 + `readPoints` 13.5 ms/frame inclusive, non-wreck `integrate > stepFree` +6.4. Also 18-23 % of the pre-impact phases (surfaces 30.6 ms/frame in the first 4 s, 9.8 in approach, 44-45 in the two pile-ups). Cost shape [INFERENCE from source]: every footprint/cage point loops all near car-top patches (`seek` tops loop, `offerAll` `always[]` + cell list, `offer` bbox test) |
| 2 | **Cage refit / rasterise / outline** (`car-cage.ts`, `cage-outline.ts`) | **12.3 (14.6 %)** | 8.4 (11.4 %) | `rasterise` 4.67 ms/frame, `transformLine` 2.77, `bandAround` 1.90, `sampleAt` 0.83, `transformGrid` 0.63. Callers: `fitCage > refit > fit` 5.1 ms/frame (from `settleStep > stepBreakage` and `bakeBetweenSlices`) and `satCars > deepestIn` 5.1 ms/frame. Spikes with the pile-ups: 31.2 ms/frame at 17-26 s, 30.1 at 39-49 s, 4.1 at 26-39 s; the six worst frames (207-234 ms) are all at 21-25 s |
| 3 | **three.js** (render + sim-side vector math) | **7.8 (9.2 %)** | 7.2 (9.8 %) | `WebGLRenderer.render` inclusive 6.6 ms/frame (`renderBufferDirect` 2.5, `projectObject` 1.5, wheel-batch 1.25, `updateMatrixWorld` 0.6); sim-side `applyQuaternion` 0.61, `crossVectors` 0.46, `multiplyMatrices` 0.37 ms/frame. Flat across phases (5-9 ms/frame): fixed cost per frame that the 4.17 ms target cannot absorb on its own |
| 4 | **Rapier + skin-kernel wasm** (ragdoll world `update` > `world.step`; collider create/translate JS wrappers) | 4.2 (4.8 %) | **7.0 (9.5 %)** | wasm 3 445 ms + JS wrappers 1 133 ms whole run (4.6 s). 0-4 s: 42 ms/frame wasm; 4-13.5 s: 9 ms/frame; aftermath-1: `world.step` 11.5 ms/frame (`update` engine-ragdoll.ts:433 23.2 ms/frame incl. `fitProxy`/`shape`); wasm-function[334]/[37]/[198] = 480/395 ms self in 0-13.5 s. JS wrapper cost 0-13.5 s is `createCollider`, `coSetTranslationWrtParent`, wasm-bindgen `free` (1 075 ms) |
| 5 | **Mass / deform solver** (`deform-solve.ts`, `shape-match-core.js`, `streamed-deform.ts`, `deform-contact/state/hit.ts`) | **5.3 (6.0 %)** | 3.7 (5.0 %) | `stepMassSlice`, `stepShapeMatch`/`matchCluster`, `solveCagesFromShape` 0.49, `clampMass`; 10.1 ms/frame in aftermath-1, 8.6 in aftermath-3, 1.0 in approach. Only 0.4 % of it is under `integrateWreck`: it is the structure step of `stepWorld`, not the wreck integrator |
Near misses: wreck-body glue outside the query loops (`car-air.ts`/`car-surfaces.ts`/`car.ts` leaves) 5.8 ms/frame (6.9 %); JIT code with no function label 6.4 ms/frame (7.5 %); React HUD 2.8 ms/frame inclusive in the crash window (but 19.5 ms/frame leaf in the first 4 s); GC 0.32 ms/frame.

### Why it fails both targets (numbers)
- The crash window frame is 84.8 ms; 62.6 ms of it is `slice` (sim), 19 ms median non-sim (render ~6.6, ragdoll `update` 6.2 mean, React 2.8, skin 0.6-3.4, Gecko ~1.2). Even the *non-sim* median (19 ms) already exceeds 11.1 ms.
- Items 1+2 alone are 40.3 ms/frame = 3.6x the entire 90 fps budget; item 1 alone is 6.7x the 240 fps budget.
- The sim floor: crash-window p5 frame has 27 ms of sim (2 steps x ~13 ms [INFERENCE: pacer minimum of 2 steps]); `PACE_BUDGET_MS = 8` is exceeded by the first step alone.
- Absolute ms are inflated by profiling (1 ms/all-threads sampler, 2.07 ms achieved gap); the ranking by share is robust (leaf self from correct pcs), the tree shapes before 13.5 s are not (section 0).

