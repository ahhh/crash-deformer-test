# Chrome City bench trace: frame-cost report

Trace: `owner-traces/chrome/ChromeCityBenchTrace.json` (176 MB). Scratch, scripts and raw outputs: `owner-traces/chrome/` (`a1`–`a7.cjs`, `a3.out`, `rep-tab-*.md`). Source names come from the 7cf2c6f sourcemaps (`src-7cf2/`); file:line refer to `src-7cf2/src`.

## 0. Headline (read this first)

1. **The trace contains no racing.** It is a page-load recording: 5.883 s, starting at navigation (0.048 s) and ending at 5.883 s while the main thread is still inside the first bench `requestAnimationFrame` callback (opened at 5.435 s, never closed; 448 ms observed, still in a car-cage build). Steady frames exist only in the *lab* scene before the bench starts (3.50–4.65 s, 187 rAF frames). So sections (b)–(e) are measured on that lab window (the engine tick and the three.js render path are the same code that runs in racing, minus the 32-car field). Racing numbers come from the matching bench card (section 7), not from the trace.
2. **This machine is the fast one.** The matching card (4KBA-9Z01) is Chrome 157 / RTX 4080 Laptop / 32 cores, 160 fps pinned at the 165 Hz vsync. The slow PC cards from the same day (16:42–17:13Z, not this session) are Firefox 158 on a 2560x1600 machine (61–69 fps, sim 7.4–11.1 ms vs 2.3 ms here). The phone cards are Chrome 154 / Mali-G715 (28–39 fps, sim 17–25 ms).
3. **What the trace does show is load cost:** time from navigation to the first bench frame is at least 5.44 s, and the main thread is blocked 3.4 s of it. Car-cage construction (`decimate`/`cost`/`buildStyle`, car-cage.ts) alone is 1 871 ms (31.8 % of the whole 5.883 s trace, 44.9 % of main-thread busy time), and it is not finished at trace end.
4. **Recommended re-record:** open DevTools Performance, press *Record* by hand (not "record and reload") once the bench HUD says racing, and stop after ~10 s. That gives the racing window this trace lacks.

## 1. (a) Device, browser, run timeline

Device (from card 4KBA-9Z01 `device`; same URL, same `session=8pyou63d`, same UA string as the trace; the card posted at 17:21:41Z, 3 min after the trace start 17:18:35.008Z because the card covers the whole loop step: warm, 30 s window, A/B phases, replay):

| item | value |
|--|--|
| browser | Chrome 157 (UA `Windows NT 10.0; Win64`) |
| GPU | ANGLE (NVIDIA GeForce RTX 4080 Laptop GPU, Direct3D11 vs_5_0 ps_5_0); trace has `ShaderTranslateTaskD3D`, `DXGISwapChainImageBacking::Present` |
| cores / RAM | 32 / 32 GB |
| screen / canvas | 2560x1440, dpr 1 (trace `hostDPR` 1.1) |
| display | 165 Hz: `Display::FrameDisplayed` p50 6.05 ms |
| URL | `?bench=city&ultra=1&loop=8pyou63d&cycle=1&step=1&keep=1&auto=1&loopultra=1&cycleultra=1` (fxTier ultra, 32 cars) |
| processes | Renderer 19624, Browser 26192, GPU 41516 |

Timeline (trace seconds, from trace events and the profile):

| t (s) | event | evidence |
|--|--|--|
| 0.048 / 0.192 | navigationStart / commit | `navigationStart`, `FrameCommittedInBrowser` |
| 0.396 / 0.412 / 0.876 | DOMContent / FCP / load | `MarkDOMContent`, `firstContentfulPaint`, `MarkLoad` |
| 0.20–1.25 | page load: main busy 220 ms of 1250 (17.6 %), idle 993 ms (network) | profile; chunks index/routes/bench-loop 113+90+144 KB finish 0.87–0.89, three 185 KB 1.06, engine 194 KB 1.25 |
| 1.253–1.759 | one 506 ms task: engine ctor (engine.ts:177) → lab `load` (engine-lab.ts:217) → `stockCage` (lab.ts:180). Cage build 305 ms | profile |
| 1.781–3.100 | one 1 319 ms task: `warmPrograms` (engine-warm.ts:28). Cage build 1 210 ms inside it | profile |
| 3.103–3.326 | 223 ms `warmCrashPath` (world-step.ts:292) | profile |
| 3.329–3.471 | 142 ms `warmScene` (engine-warm.ts:65): three `getUniforms`/link checks 106 ms | profile |
| 3.472 | first rAF frame (11.6 ms) | `FireAnimationFrame` |
| 3.50–4.65 | **lab idle, steady 165 Hz.** Meanwhile rapier (js 39 KB at 3.74, wasm 665 KB until 4.65) and ultra assets (9 webp 1.6 MB + `sky.hdr` 1.1 MB until 4.67) load | `ResourceFinish` |
| 4.675–5.422 | 747 ms `runBench` (engine-bench.ts:849): city course + 32 cars | profile |
| 5.435–5.883+ | first bench rAF: `tickInner` → `fixedStep` → `drive` → `startStep` → `solverSize` → cage build; open at trace end | unclosed `RunTask` B event |

So: time to first bench frame >= 5.435 s; time to the first lab frame 3.47 s; main thread effectively blocked 1.253–3.471 s (2.22 s) plus 4.675–5.883+ s (1.21 s+).

## 2. (b) Frame interval distribution

### Trace, lab-idle window (3.50–4.65 s; no racing exists in this trace)

| metric | n | p50 | p95 | p99 | max | >16.7 ms | >33 ms | >50 ms |
|--|--|--|--|--|--|--|--|--|
| rAF start-to-start (ms) | 186 | 6.07 | 6.41 | 13.01 | 14.0 | 0 | 0 | 0 |
| `Display::FrameDisplayed` interval (ms) | 228 | 6.04 | 6.19 | 6.23 | 6.3 | 0 | 0 | 0 |
| rAF callback duration (ms) | 187 | 1.31 | 2.79 | n/a | 9.2 | n/a | n/a | n/a |

rAF callback duration histogram: <1 ms 27, 1–2 ms 128, 2–3 ms 26, 3–5 ms 5, >5 ms 1. Mean callback 1.52 ms (283.9 ms / 187).

What the main thread did in the long intervals (six rAF gaps >8.5 ms: 3.512+12.6, 4.277+8.6, 4.410+14.0, 4.519+8.5, 4.528+13.0, 4.548+8.9):
- 4.410 / 4.528 / 4.548: `gainOf` (prefabs.ts:85) called from `loadSet` (ultra.ts:57-62): `getImageData` of the freshly drawn ultra texture. RunTasks of 9.7 / 8.8 / 7.7 ms, of which `GetImageData` 6.2 / 5.0 / 4.8 ms and canvas `FinalizeFrame`+`RasterCHROMIUM` 4.0 / 3.6 / 3.1 ms. One-off, 3 of them (9 images / 3 roles).
- 3.511: first frame after the warm: RunTask 12.5 ms, rAF 9.2 ms; self `(program)` 4.7 ms, GC 1.1 ms, `tick` 4.7 ms (of which render 1.9 ms).
- 4.277: a 2.8 ms native-only task (4.283, no JS, no trace children) next to three.js render frames; [INFERENCE] image/bitmap upload completion for the ultra assets.
- No >16.7 ms interval, no long task >12.5 ms, no dropped displayed frame in this window.

### Racing (from card 4KBA-9Z01, 30.0 s, 4 795 frames; the trace cannot supply this)

| metric | value |
|--|--|
| frameMs mean / p50 / p95 / p99 / max | 6.26 / 6.10 / 6.20 / 12.20 / 18.40 ms |
| fps / 1 %-low fps | 159.8 / 82.0 |
| counts >16.7 / 33 / 50 ms | not in the card; p99 = 12.2 ms means >=1 % (>=48 frames) are above 12.2 ms; max 18.4 ms means at most a handful exceed 16.7 ms; none >33 ms |
| fps per second | 123, 150, then 165 for 21 s, then 159, 98 (s24), 154, 163, 161, 158 |
| cutFrames / fineCutsPerSimS | 17 / 17.0 (frames that took a fine cut) |
| steps per frame / msPerStep | 1.394 / 1.660 ms |

## 3. (c) Main-thread categories, GPU busy, CPU- or GPU-bound

Main-thread self time by trace-slice category (ms; stack-computed self time of `X` events on `CrRendererMain`; "script" = FunctionCall/BlinkTaskState/microtask/rAF wrappers = JS execution). Idle = window wall minus top-level `RunTask` time.

| window | wall | RunTask busy (%) | script | GL sync wait | script compile/decode/wasm | style+layout | paint/commit | other native | GC | GL encode |
|--|--|--|--|--|--|--|--|--|--|--|
| LOAD 0–1.25 | 1250 | 213 (17.0 %) | 74.0 | 5.2 | 54.0 | 39.4 | 13.8 | 27.0 | 3.0 | 0.0 |
| LAB-BUILD 1.25–3.10 | 1850 | 1834 (99.1 %) | 1781.7 | 21.3 | 2.3 | 1.7 | 1.0 | 5.7 | 20.0 | 1.2 |
| WARM 3.10–3.50 | 400 | 410 (100 %) | 302.3 | 91.7 | 1.2 | 0.4 | 0.7 | 1.8 | 3.6 | 8.1 |
| **LAB-IDLE 3.50–4.65** | 1150 | **415 (36.1 %)** | 329.8 | 6.2 | 13.5 | 17.7 | 28.2 | 17.4 | 2.0 | 5.0 |
| CITY-SETUP 4.65–5.435 | 785 | 784 (99.9 %) | 701.1 | 40.8 | 13.2 | 11.5 | 1.0 | 6.9 | 9.3 | 0.6 |
| CITY-OPEN 5.435–5.883 | 448 | open task, never closed | profile-busy 436 (97.4 %): cage build | 36.6 | 0.7 | 0 | 0 | 0 | 7.8 | 1.8 |
| WHOLE 0–5.883 | 5883 | 3656 (62.2 %) + 448 open | 3194.8 | 201.8 | 84.8 | 70.8 | 44.8 | 58.8 | 45.7 | 16.7 |

CPU profile (sampled, 12 232 samples over 5.87 s) whole-run: profile-busy 4 164 ms (70.8 % of wall), idle 1 670 ms. By chunk: `bench-loop` (game code incl. car-cage) 2 428 ms (41.3 %), `three` 613 (10.4 %), `(program)` 385 (6.5 %), `prefabs` 292 (5.0 %), `engine` 121 (2.1 %), native builtins 117 (2.0 %), GC 54.5 (0.9 %), `index` (React) 42.5 (0.7 %), `constants` 30.5, `routes` (HUD) 19.5, preload-helper 14.8, `engine-bench` 13.2, rapier wasm glue 8.6+6.1.

GPU side (GPU process, `CrGpuMain` `ThreadControllerImpl::RunTask`, ms and % of window wall):

| window | CrGpuMain busy | GPUTask (n, ms) | of which `WebGL` (game GL commands) | SwapBuffers | Viz busy | renderer Compositor busy |
|--|--|--|--|--|--|--|
| LOAD | 176.4 (14.1 %) | 297 / 61.1 | 0 | 33.4 | 105.6 | 38.5 |
| LAB-BUILD | 280.3 (15.2 %) | 171 / 81.7 | 65 / 20.5 | 59.7 | 161.9 | 47.0 |
| WARM | 192.5 (48.1 %) | 523 / 140.2 | 303 / 82.7 | 15.6 | 43.9 | 15.0 |
| **LAB-IDLE** | **247.2 (21.5 %)** | 604 / 115.6 | 519 / 93.6 | 38.3 | 97.1 | 55.9 |
| CITY-SETUP | 143.6 (18.3 %) | 149 / 123.2 | 25 / 18.3 | 5.0 | 20.4 | 6.0 |
| CITY-OPEN | 49.0 (10.9 %) | 117 / 37.5 | 49 / 29.3 | 3.6 | 7.4 | 3.3 |
| WHOLE | 1089.0 (18.5 %), max task 9.28 ms | 1861 / 559.4 | 961 / 244.3 | 155.5 | 436.2 | 165.7 |

**Verdict, lab-idle window (the only steady frames in the trace): neither CPU- nor GPU-bound, vsync-bound.** Per rAF frame (187): rAF callback 1.52 ms mean (of which JS tick 0.88 ms: render 0.57, sim slice 0.17, React HUD 0.10), main RunTask 2.22 ms, GPU main thread 1.32 ms, game GL command execution on the GPU 0.50 ms, swap 0.20 ms; all against a 6.06 ms vsync interval. The main thread idles 63.9 % of the window and the GPU process 78.5 %; every vsync got a displayed frame (228 intervals, p99 6.23 ms). One note on the profile: `(program)` 195 ms (1.04 ms/frame) and native `requestAnimationFrame` 78 ms (0.42 ms/frame, `onAnimationFrame` three.module.js:16) are native time the sampler could not attribute to JS; the trace shows no sync GPU wait there (`WaitForGetOffsetInRange` n=3, 4.9 ms in the window), so it is not a GPU stall. [INFERENCE] part of it is DevTools tracing/profiling overhead (this trace records GLES2 call events and a 0.48 ms CPU sampler).

**Verdict, racing (card 4KBA-9Z01, since the trace has none): CPU-limited at the tail, vsync-bound on average.** Mean CPU 4.23 ms (70 % of 6.06 ms) = sim 2.31 + render 1.29 + other 0.63; mean GPU 3.54 ms (58 %). GPU p99 5.74 ms / max 7.38 ms cannot cause the 12.2 ms p99 frames, CPU p99 13.0 ms (sim p99 8.1 ms) does. On this GPU at 2560x1440 ultra, 3.54 ms mean of 6.06 ms leaves little room: a slower GPU or lower refresh budget goes GPU-bound first.

## 4. (e) GC, shader compiles, texture/asset uploads

GC pauses (main thread `MinorGC` / `MajorGC` slices; count, total ms, max ms):

| window | minor n / total / max | major n / total / max |
|--|--|--|
| LOAD | 4 / 3.2 / 1.10 | 0 |
| LAB-BUILD | 45 / 16.7 / 1.17 | 1 / 4.6 / 4.64 (1.74 s, heap 31.1 → 15.2 MB) |
| WARM | 9 / 4.1 / 0.71 | 0 |
| LAB-IDLE | 3 / 2.3 / 0.88 | 0 |
| CITY-SETUP | 18 / 11.1 / 0.88 | 0 |
| CITY-OPEN | 2 / 1.4 / 0.70 | 1 / 8.8 / 8.80 (5.82 s, heap 103.4 → 39.8 MB: cage-build garbage) |
| **WHOLE** | **81 / 38.7 / 1.17** | **2 / 13.4 / 8.80**; all 83 pauses = 52.1 ms |

Steady lab: 3 minor GCs in 187 frames (0.016 per frame, 2.3 ms total, max 0.88 ms): GC is not a frame cost in this window. Racing GC is not measurable here (the card has no GC field).

Shader compiles (GPU process):

| window | `ShaderTranslateTaskD3D::run` (pool workers) n / ms | `CompileEvent::wait` (CrGpuMain) n / ms | `DoLinkProgram` n / ms | main `GetProgramiv` calls | main `WaitForGetOffsetInRange` n / ms (max) |
|--|--|--|--|--|--|
| LAB-BUILD | 56 / 102.9 | 40 / 31.6 | 27 / 2.8 | 12 | 39 / 14.9 (3.84) |
| WARM | 98 / 173.8 | 72 / 53.4 | 50 / 4.9 | 1 465 | 214 / 90.1 (11.41) |
| LAB-IDLE | 0 | 0 | 0 | 0 | 3 / 4.9 (2.07) |
| CITY-SETUP | 54 / 123.3 | 37 / 32.8 | 26 / 3.1 | 7 | 16 / 38.5 (7.99) |
| CITY-OPEN | 2 / 5.9 | 4 / 2.9 | 3 / 0.3 | 314 | 35 / 32.2 (7.19) |
| **WHOLE** | **210 / 405.8** (max 6.95) | **153 / 120.8** (max 4.37) | **105 / 11.0** | 1 798 | **307 / 180.7** (max 11.41) |

105 programs linked (210 vertex+fragment translates, 406 ms of worker CPU, parallel to the main thread). The main-thread cost is the synchronous link check: `WaitForGetOffsetInRange` 307 calls, 180.7 ms, max 11.4 ms, i.e. three's `getUniforms` / `onFirstUse` (three.module.js:7022/7121; 105.8 ms inclusive in WARM). Zero compiles in lab-idle: the pre-race warm-up (engine-warm.ts:28) works; nothing links in steady frames. CITY-SETUP/CITY-OPEN link another ~29 programs (city course content), 38.5 + 32.2 ms of sync waits.

Textures/assets:
- 9 ultra `*.webp` decodes on pool workers (`ImageDecoder::DecodeFrameBufferAtIndex` n=9, 119.3 ms total, max 27.3 ms), all inside the lab-idle window, off the main thread.
- Main thread: `GpuImageDecodeCache::DecodeImage` n=3, 10.4 ms (max 3.8); `UploadImage` n=3, 0.2 ms. (three.module.js:6123 is `WebGLUniforms.upload`, a uniform upload, 11.9 ms in lab-idle; texture uploads do not show as a main-thread cost.)
- `gainOf` `getImageData` readbacks (prefabs.ts:85): 60.7 ms self whole-run (16.6 ms lab-idle in 3 spikes of 7.7–9.7 ms, 44.2 ms city setup); GPU side `DoReadbackARGBImagePixelsINTERNAL` n=11, 12.9 ms (max 2.34).
- HDR decode (`HDRLoader.js:367` 27.3 ms + `:235` 14.7 ms) ≈ 42 ms whole-run (studio env, first at 1.78 s; sky.hdr later).
- Script compile: `v8.compile` 25.4 ms, `ScriptCompiled` n=19 / 10.7 ms (max 3.69), `wasm.CompileLazy` n=132 / 9.4 ms (max 5.59).

## 5. (d) Top-40 functions, self and inclusive, by chunk

Method: V8 CPU profile from the trace (12 232 samples, ~0.48 ms), frames resolved through the 7cf2c6f sourcemaps. `%wall` is of the window wall time, `%busy` of main-thread busy samples (idle excluded), `ms/frame` divides by the 187 rAF frames. Minified names (`k`, `Pl`, `ou`, `gu`...) are the sourcemap's `name`; the `:line` is the original source line. "chunk" is the shipped file the sample's script came from (`bench-loop` holds car/cage/deform game code, `prefabs` the world/surface code, `engine` the engine, `three` three.js, `index` React, `routes` HUD).

Reading the steady window: there is no single dominant function in steady frames. Largest main-thread buckets in lab-idle: `(program)` 195.3 ms (39.7 % of busy, native time not attributed to JS), `three` 114.2 ms (23.2 %), native builtins 86.6 ms (17.6 %, of which `requestAnimationFrame` 78.3 ms), `prefabs` 26.1 ms (5.3 %; 16.6 ms of it is the one-off `gainOf`), `engine` 22.3 ms (4.5 %), `bench-loop` 17.5 ms (3.6 %), React `index` 9.5 ms (1.9 %), HUD `routes` 6.6 ms (1.3 %), GC 2.7 ms (0.5 %). Per frame (inclusive): `tick` (engine.ts:384) 0.876 ms = render 0.568 (engine-cine.ts:585 → engine-post.ts:310 → three `WebGLRenderer.render` three.module.js:17674; of that `renderBufferDirect` :17233 0.240) + sim slice 0.172 (sim-pace.ts:91 → engine.ts:162 → `fixedStep` engine.ts:574 → `nu` world-step.ts:126 0.148 → `integrate` car.ts:485 0.123 → car-air.ts:1332 0.075); shadow pass `WebGLShadowMap.render` (three.module.js:9143, wrapped at wheel-batch.ts:127) 0.087; `projectObject` (three.module.js:17897) 0.171; `setProgram` (three.module.js:18407) 0.184; React HUD commit (react-dom, hud.tsx:296, hud-sections.tsx:74) 0.098; `WebGLUniforms.upload` (three.module.js:6123) 0.064; largest three self item `c` = `WebGLGeometries.update` (three.module.js:4192) 25.8 ms = 0.138 ms/frame, which re-walks every attribute of every drawn geometry each frame (`WebGLObjects.update`, :4612, which calls it, 33.5 ms inclusive = 0.176 ms/frame).

### 5.1 Steady window: lab-idle (the only steady frames in the trace)

Chunk totals (ms, % of wall): (program) 195.3 (17.0%); three 114.2 (9.9%); native-builtin 86.6 (7.5%); prefabs 26.1 (2.3%); engine 22.3 (1.9%); bench-loop 17.5 (1.5%); index 9.5 (0.8%); routes 6.6 (0.6%); engine-bench 5.5 (0.5%); constants 2.7 (0.2%)

Self time, top 40

| ms | %wall | %busy | ms/frame | chunk | function (source:line) |
|--|--|--|--|--|--|
| 195.3 | 17.0 | 39.7 | 1.044 | (program) | (program) |
| 78.3 | 6.8 | 15.9 | 0.419 | native-builtin | requestAnimationFrame |
| 25.8 | 2.2 | 5.2 | 0.138 | three | c (three/three.module.js:4192) |
| 16.6 | 1.4 | 3.4 | 0.089 | prefabs | bi (src/game/present/prefabs.ts:85) |
| 7.4 | 0.6 | 1.5 | 0.039 | three | Tt (three/three.module.js:18407) |
| 6.0 | 0.5 | 1.2 | 0.032 | three | compose (three/three.core.js:11030) |
| 5.5 | 0.5 | 1.1 | 0.029 | engine-bench | Ye (src/game/engine/engine-bench.ts:188) |
| 5.4 | 0.5 | 1.1 | 0.029 | native-builtin | now |
| 4.2 | 0.4 | 0.8 | 0.022 | bench-loop | sm (src/game/vehicle/car-air.ts:1332) |
| 4.1 | 0.4 | 0.8 | 0.022 | index | vl (react-dom/cjs/react-dom-client.production.js:9427) |
| 3.5 | 0.3 | 0.7 | 0.019 | three | r (three/three.module.js:141) |
| 3.0 | 0.3 | 0.6 | 0.016 | three | Gc (three/three.module.js:5159) |
| 3.0 | 0.3 | 0.6 | 0.016 | three | Yc (three/three.module.js:5284) |
| 3.0 | 0.3 | 0.6 | 0.016 | three | renderBufferDirect (three/three.module.js:17233) |
| 2.7 | 0.2 | 0.6 | 0.015 | three | gt (three/three.module.js:17897) |
| 2.7 | 0.2 | 0.5 | 0.014 | (garbage collector) | (garbage collector) |
| 2.7 | 0.2 | 0.5 | 0.014 | bench-loop | bindKinematic (src/game/deform/deform-hit.ts:271) |
| 2.6 | 0.2 | 0.5 | 0.014 | three | o (three/three.module.js:242) |
| 2.5 | 0.2 | 0.5 | 0.013 | three | setValue (three/three.module.js:5972) |
| 2.4 | 0.2 | 0.5 | 0.013 | three | updateMatrixWorld (three/three.core.js:13067) |
| 2.3 | 0.2 | 0.5 | 0.012 | engine | take (src/game/present/gpu-timer.ts:52) |
| 2.1 | 0.2 | 0.4 | 0.011 | three | D (three/three.module.js:9569) |
| 2.0 | 0.2 | 0.4 | 0.010 | engine | tick (src/game/engine/engine.ts:384) |
| 1.9 | 0.2 | 0.4 | 0.010 | three | ye (three/three.module.js:10573) |
| 1.9 | 0.2 | 0.4 | 0.010 | prefabs | rn (src/game/world/surfaces.ts:1188) |
| 1.9 | 0.2 | 0.4 | 0.010 | three | o (three/three.module.js:4612) |
| 1.7 | 0.1 | 0.3 | 0.009 | three | Vc (three/three.module.js:5078) |
| 1.7 | 0.1 | 0.3 | 0.009 | three | a (three/three.module.js:15139) |
| 1.6 | 0.1 | 0.3 | 0.009 | three | s (three/three.module.js:8516) |
| 1.6 | 0.1 | 0.3 | 0.009 | three | p (three/three.module.js:1759) |
| 1.6 | 0.1 | 0.3 | 0.009 | prefabs | Xt (src/game/world/surfaces.ts:1040) |
| 1.5 | 0.1 | 0.3 | 0.008 | three | updateMatrixWorld (three/three.core.js:46703) |
| 1.5 | 0.1 | 0.3 | 0.008 | bench-loop | bottomOut (src/game/vehicle/car-suspension.ts:327) |
| 1.5 | 0.1 | 0.3 | 0.008 | prefabs | hr (src/game/world/surfaces.ts:1931) |
| 1.4 | 0.1 | 0.3 | 0.008 | constants | ce (src/game/kernel/physics-core.js:304) |
| 1.4 | 0.1 | 0.3 | 0.007 | three | i (three/three.module.js:16) |
| 1.4 | 0.1 | 0.3 | 0.007 | native-builtin | fetch |
| 1.4 | 0.1 | 0.3 | 0.007 | engine | nu (src/game/engine/world-step.ts:126) |
| 1.4 | 0.1 | 0.3 | 0.007 | bench-loop | near (src/game/vehicle/car-surfaces.ts:191) |
| 1.3 | 0.1 | 0.3 | 0.007 | engine | tickInner (src/game/engine/engine.ts:396) |

Inclusive time, top 40

| ms | %wall | %busy | ms/frame | chunk | function (source:line) |
|--|--|--|--|--|--|
| 243.4 | 21.2 | 49.5 | 1.302 | three | i (three/three.module.js:16) |
| 163.8 | 14.2 | 33.3 | 0.876 | engine | tick (src/game/engine/engine.ts:384) |
| 163.8 | 14.2 | 33.3 | 0.876 | three | ft (three/three.module.js:17616) |
| 161.8 | 14.1 | 32.9 | 0.865 | engine | tickInner (src/game/engine/engine.ts:396) |
| 106.1 | 9.2 | 21.6 | 0.568 | engine | render (src/game/present/engine-cine.ts:585) |
| 105.4 | 9.2 | 21.4 | 0.563 | constants | render (src/game/present/engine-post.ts:310) |
| 104.8 | 9.1 | 21.3 | 0.561 | three | render (three/three.module.js:17674) |
| 78.3 | 6.8 | 15.9 | 0.419 | native-builtin | requestAnimationFrame |
| 44.9 | 3.9 | 9.1 | 0.240 | three | renderBufferDirect (three/three.module.js:17233) |
| 42.6 | 3.7 | 8.7 | 0.228 | three | yt (three/three.module.js:18165) |
| 42.6 | 3.7 | 8.7 | 0.228 | three | _t (three/three.module.js:18015) |
| 42.1 | 3.7 | 8.6 | 0.225 | three | bt (three/three.module.js:18192) |
| 34.3 | 3.0 | 7.0 | 0.184 | three | Tt (three/three.module.js:18407) |
| 33.5 | 2.9 | 6.8 | 0.179 | three | o (three/three.module.js:4612) |
| 33.0 | 2.9 | 6.7 | 0.176 | engine | run (src/game/engine/sim-pace.ts:91) |
| 32.1 | 2.8 | 6.5 | 0.172 | engine | slice (src/game/engine/engine.ts:162) |
| 32.0 | 2.8 | 6.5 | 0.171 | three | gt (three/three.module.js:17897) |
| 30.4 | 2.6 | 6.2 | 0.163 | three | c (three/three.module.js:4192) |
| 29.9 | 2.6 | 6.1 | 0.160 | engine | fixedStep (src/game/engine/engine.ts:574) |
| 27.7 | 2.4 | 5.6 | 0.148 | engine | nu (src/game/engine/world-step.ts:126) |
| 23.0 | 2.0 | 4.7 | 0.123 | bench-loop | integrate (src/game/vehicle/car.ts:485) |
| 18.4 | 1.6 | 3.7 | 0.098 | index | gu (react-dom/cjs/react-dom-client.production.js:10681) |
| 18.4 | 1.6 | 3.7 | 0.098 | index | ld (react-dom/cjs/react-dom-client.production.js:12084) |
| 18.4 | 1.6 | 3.7 | 0.098 | index | id (react-dom/cjs/react-dom-client.production.js:11918) |
| 18.4 | 1.6 | 3.7 | 0.098 | index | od (react-dom/cjs/react-dom-client.production.js:11966) |
| 18.4 | 1.6 | 3.7 | 0.098 | index | anon (react-dom/cjs/react-dom-client.production.js:12089) |
| 18.4 | 1.6 | 3.7 | 0.098 | ultra | x (src/game/present/ultra/ultra.ts:57) |
| 16.6 | 1.4 | 3.4 | 0.089 | prefabs | bi (src/game/present/prefabs.ts:85) |
| 16.2 | 1.4 | 3.3 | 0.087 | three | Hu.render (three/three.module.js:9143) |
| 16.2 | 1.4 | 3.3 | 0.087 | engine | t.render (src/game/vehicle/wheel-batch.ts:127) |
| 15.5 | 1.4 | 3.2 | 0.083 | three | D (three/three.module.js:9569) |
| 14.0 | 1.2 | 2.9 | 0.075 | bench-loop | sm (src/game/vehicle/car-air.ts:1332) |
| 13.1 | 1.1 | 2.7 | 0.070 | index | Mu (react-dom/cjs/react-dom-client.production.js:11304) |
| 13.1 | 1.1 | 2.7 | 0.070 | index | ku (react-dom/cjs/react-dom-client.production.js:11181) |
| 13.1 | 1.1 | 2.7 | 0.070 | index | Ou (react-dom/cjs/react-dom-client.production.js:11120) |
| 11.9 | 1.0 | 2.4 | 0.064 | three | upload (three/three.module.js:6123) |
| 11.8 | 1.0 | 2.4 | 0.063 | index | Nc (react-dom/cjs/react-dom-client.production.js:7392) |
| 10.1 | 0.9 | 2.1 | 0.054 | index | ko (react-dom/cjs/react-dom-client.production.js:4333) |
| 10.1 | 0.9 | 2.1 | 0.054 | engine-bench | xt (src/game/engine/engine-bench.ts:849) |
| 10.0 | 0.9 | 2.0 | 0.053 | engine-bench | Ye (src/game/engine/engine-bench.ts:188) |


### 5.2 Whole trace (load + warm + city start; dominated by the cage build)

Chunk totals (ms, % of wall): bench-loop 2428.3 (41.3%); three 612.6 (10.4%); (program) 384.8 (6.5%); prefabs 292.0 (5.0%); engine 121.2 (2.1%); native-builtin 117.1 (2.0%); (garbage collector) 54.5 (0.9%); index 42.5 (0.7%); constants 30.5 (0.5%); routes 19.5 (0.3%)

Self time, top 40

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 1326.0 | 22.5 | 31.8 | bench-loop | k (src/game/vehicle/car-cage.ts:350) |
| 384.8 | 6.5 | 9.2 | (program) | (program) |
| 286.2 | 4.9 | 6.9 | bench-loop | Pl (src/game/vehicle/car-cage.ts:219) |
| 174.5 | 3.0 | 4.2 | bench-loop | ou (src/game/vehicle/car-cage.ts:1097) |
| 134.1 | 2.3 | 3.2 | bench-loop | stampPath (src/game/world/track.ts:663) |
| 127.7 | 2.2 | 3.1 | three | C (three/three.module.js:7022) |
| 80.8 | 1.4 | 1.9 | native-builtin | requestAnimationFrame |
| 70.4 | 1.2 | 1.7 | bench-loop | jl (src/game/vehicle/car-cage.ts:200) |
| 60.7 | 1.0 | 1.5 | prefabs | bi (src/game/present/prefabs.ts:85) |
| 54.5 | 0.9 | 1.3 | (garbage collector) | (garbage collector) |
| 37.9 | 0.6 | 0.9 | bench-loop | buildSkinWeights (src/game/deform/deform-rig.ts:583) |
| 33.2 | 0.6 | 0.8 | prefabs | Xt (src/game/world/surfaces.ts:1040) |
| 27.3 | 0.5 | 0.7 | three | c (three/three.module.js:4192) |
| 26.8 | 0.5 | 0.6 | three | s (three/examples/jsm/loaders/HDRLoader.js:367) |
| 25.0 | 0.4 | 0.6 | prefabs | Si (src/game/present/prefabs.ts:118) |
| 23.2 | 0.4 | 0.6 | prefabs | Qr (src/game/present/engine-world.ts:31) |
| 20.7 | 0.4 | 0.5 | three | Il (three/three.module.js:6158) |
| 18.9 | 0.3 | 0.5 | bench-loop | u (src/game/deform/deform-rig.ts:626) |
| 18.7 | 0.3 | 0.4 | bench-loop | ya (src/game/deform/deform-build.ts:155) |
| 17.2 | 0.3 | 0.4 | three | Ql (three/three.module.js:6373) |
| 16.7 | 0.3 | 0.4 | prefabs | rn (src/game/world/surfaces.ts:1188) |
| 15.1 | 0.3 | 0.4 | bench-loop | d (src/game/deform/deform-rig.ts:633) |
| 15.0 | 0.3 | 0.4 | constants | te (src/game/kernel/physics-core.js:122) |
| 14.7 | 0.2 | 0.4 | prefabs | Jt (src/game/world/surfaces.ts:946) |
| 14.3 | 0.2 | 0.3 | bench-loop | ma (src/game/deform/deform-build.ts:35) |
| 14.1 | 0.2 | 0.3 | three | a (three/examples/jsm/loaders/HDRLoader.js:235) |
| 13.3 | 0.2 | 0.3 | bench-loop | anon (src/game/deform/deform-rig.ts:628) |
| 13.0 | 0.2 | 0.3 | native-builtin | now |
| 12.7 | 0.2 | 0.3 | engine-bench | Ye (src/game/engine/engine-bench.ts:188) |
| 12.1 | 0.2 | 0.3 | bench-loop | anon (src/game/vehicle/car-materials.ts:53) |
| 11.9 | 0.2 | 0.3 | bench-loop | v (src/game/present/track-mesh.ts:75) |
| 11.5 | 0.2 | 0.3 | bench-loop | sm (src/game/vehicle/car-air.ts:1332) |
| 11.3 | 0.2 | 0.3 | three | fromBufferAttribute (three/three.core.js:5997) |
| 11.1 | 0.2 | 0.3 | bench-loop | Ka (src/game/deform/deform-rig.ts:393) |
| 10.5 | 0.2 | 0.3 | bench-loop | set (src/game/world/road-crease.ts:21) |
| 9.8 | 0.2 | 0.2 | prefabs | an (src/game/world/surfaces.ts:1200) |
| 9.5 | 0.2 | 0.2 | three | h (three/three.module.js:7357) |
| 9.5 | 0.2 | 0.2 | three | Fl (three/three.module.js:6064) |
| 9.3 | 0.2 | 0.2 | three | Tt (three/three.module.js:18407) |
| 9.2 | 0.2 | 0.2 | three | getX (three/three.core.js:17333) |

Inclusive time, top 40

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 1873.6 | 31.8 | 45.0 | bench-loop | iu (src/game/vehicle/car-cage.ts:1062) |
| 1873.6 | 31.8 | 45.0 | bench-loop | shared (src/game/vehicle/car-cage.ts:973) |
| 1873.6 | 31.8 | 45.0 | bench-loop | gu (src/game/vehicle/car-cage-rig.ts:144) |
| 1871.0 | 31.8 | 44.9 | bench-loop | ou (src/game/vehicle/car-cage.ts:1097) |
| 1684.9 | 28.6 | 40.5 | bench-loop | Pl (src/game/vehicle/car-cage.ts:219) |
| 1567.4 | 26.6 | 37.6 | bench-loop | vu (src/game/vehicle/car-cage-rig.ts:182) |
| 1482.3 | 25.2 | 35.6 | engine | warmPrograms (src/game/engine/engine-warm.ts:28) |
| 1396.4 | 23.7 | 33.5 | bench-loop | k (src/game/vehicle/car-cage.ts:350) |
| 1212.3 | 20.6 | 29.1 | bench-loop | get cage (src/game/vehicle/car.ts:65) |
| 1212.2 | 20.6 | 29.1 | bench-loop | setRigVisible (src/game/vehicle/car.ts:597) |
| 1211.6 | 20.6 | 29.1 | bench-loop | updateHullHelper (src/game/vehicle/car-core.ts:644) |
| 678.1 | 11.5 | 16.3 | engine-bench | xt (src/game/engine/engine-bench.ts:849) |
| 602.6 | 10.2 | 14.5 | engine | tickInner (src/game/engine/engine.ts:396) |
| 483.0 | 8.2 | 11.6 | routes | anon (src/components/crash-lab.tsx:46) |
| 481.4 | 8.2 | 11.6 | engine | vM (src/game/engine/engine.ts:177) |
| 423.7 | 7.2 | 10.2 | engine-bench | Q (src/game/engine/engine-bench.ts:361) |
| 423.7 | 7.2 | 10.2 | engine | advance (src/game/engine/engine-input.ts:35) |
| 421.6 | 7.2 | 10.1 | engine | load (src/game/engine/engine-race-field.ts:452) |
| 416.3 | 7.1 | 10.0 | engine | run (src/game/engine/sim-pace.ts:91) |
| 415.4 | 7.1 | 10.0 | engine | slice (src/game/engine/engine.ts:162) |
| 408.5 | 6.9 | 9.8 | engine | fixedStep (src/game/engine/engine.ts:574) |
| 394.5 | 6.7 | 9.5 | engine | raceCommand (src/game/engine/engine-scenes.ts:289) |
| 394.1 | 6.7 | 9.5 | engine | command (src/game/engine/engine-race.ts:173) |
| 374.6 | 6.4 | 9.0 | engine-bench | Xe.e.run (src/game/engine/engine-bench.ts:274) |
| 363.5 | 6.2 | 8.7 | engine | drive (src/game/engine/engine-race.ts:500) |
| 360.8 | 6.1 | 8.7 | engine | startStep (src/game/engine/engine-record.ts:232) |
| 356.8 | 6.1 | 8.6 | bench-loop | solverSize (src/game/vehicle/car.ts:90) |
| 356.8 | 6.1 | 8.6 | engine | anon (src/game/engine/engine-record.ts:241) |
| 349.0 | 5.9 | 8.4 | engine | load (src/game/engine/engine-lab.ts:217) |
| 348.3 | 5.9 | 8.4 | bench-loop | lE (src/game/scenes/lab.ts:225) |
| 348.3 | 5.9 | 8.4 | bench-loop | dE (src/game/scenes/lab.ts:236) |
| 348.3 | 5.9 | 8.4 | bench-loop | get cards (src/game/scenes/lab.ts:272) |
| 348.0 | 5.9 | 8.4 | bench-loop | aE (src/game/scenes/lab.ts:180) |
| 348.0 | 5.9 | 8.4 | bench-loop | oE (src/game/scenes/lab.ts:190) |
| 322.8 | 5.5 | 7.8 | engine | start (src/game/engine/engine-race-field.ts:303) |
| 322.8 | 5.5 | 7.8 | engine | start (src/game/engine/engine-race.ts:59) |
| 315.5 | 5.4 | 7.6 | bench-loop | rv (src/game/vehicle/car-parts.ts:123) |
| 315.5 | 5.4 | 7.6 | bench-loop | Tv (src/game/vehicle/car.ts:52) |
| 314.9 | 5.4 | 7.6 | bench-loop | r_ (src/game/vehicle/car-core.ts:377) |
| 309.6 | 5.3 | 7.4 | three | render (three/three.module.js:17674) |


### 5.3 City start 4.65–5.435 s (the 747 ms `runBench` task)

Chunk totals (ms, % of wall): bench-loop 341.7 (43.5%); prefabs 171.9 (21.9%); three 164.3 (20.9%); engine 42.8 (5.4%); (program) 19.1 (2.4%); (garbage collector) 11.3 (1.4%); constants 10.9 (1.4%); other:rapier_wasm3d_bg-B4SxS5f 8.0 (1.0%); other:rapier-Bfr5Gp-s.js 5.0 (0.6%); native-builtin 4.8 (0.6%)

Self time, top 20

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 134.1 | 17.1 | 17.1 | bench-loop | stampPath (src/game/world/track.ts:663) |
| 44.2 | 5.6 | 5.6 | prefabs | bi (src/game/present/prefabs.ts:85) |
| 25.0 | 3.2 | 3.2 | prefabs | Si (src/game/present/prefabs.ts:118) |
| 23.4 | 3.0 | 3.0 | bench-loop | buildSkinWeights (src/game/deform/deform-rig.ts:583) |
| 19.1 | 2.4 | 2.4 | (program) | (program) |
| 16.3 | 2.1 | 2.1 | three | s (three/examples/jsm/loaders/HDRLoader.js:367) |
| 16.1 | 2.1 | 2.1 | bench-loop | ya (src/game/deform/deform-build.ts:155) |
| 16.0 | 2.0 | 2.0 | prefabs | Qr (src/game/present/engine-world.ts:31) |
| 16.0 | 2.0 | 2.0 | bench-loop | u (src/game/deform/deform-rig.ts:626) |
| 11.9 | 1.5 | 1.5 | bench-loop | v (src/game/present/track-mesh.ts:75) |
| 11.3 | 1.4 | 1.4 | (garbage collector) | (garbage collector) |
| 10.5 | 1.3 | 1.3 | bench-loop | set (src/game/world/road-crease.ts:21) |
| 10.1 | 1.3 | 1.3 | three | a (three/examples/jsm/loaders/HDRLoader.js:235) |
| 10.1 | 1.3 | 1.3 | three | fromBufferAttribute (three/three.core.js:5997) |
| 9.9 | 1.3 | 1.3 | bench-loop | anon (src/game/deform/deform-rig.ts:628) |
| 9.3 | 1.2 | 1.2 | bench-loop | d (src/game/deform/deform-rig.ts:633) |
| 9.1 | 1.2 | 1.2 | constants | te (src/game/kernel/physics-core.js:122) |
| 9.0 | 1.1 | 1.1 | three | Il (three/three.module.js:6158) |
| 8.5 | 1.1 | 1.1 | bench-loop | Eb (src/game/world/track.ts:590) |
| 8.2 | 1.0 | 1.0 | three | Ql (three/three.module.js:6373) |

Inclusive time, top 20

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 652.6 | 83.1 | 83.3 | engine-bench | xt (src/game/engine/engine-bench.ts:849) |
| 421.6 | 53.7 | 53.8 | engine | load (src/game/engine/engine-race-field.ts:452) |
| 394.5 | 50.3 | 50.3 | engine | raceCommand (src/game/engine/engine-scenes.ts:289) |
| 394.1 | 50.2 | 50.3 | engine | command (src/game/engine/engine-race.ts:173) |
| 322.8 | 41.1 | 41.2 | engine | start (src/game/engine/engine-race-field.ts:303) |
| 322.8 | 41.1 | 41.2 | engine | start (src/game/engine/engine-race.ts:59) |
| 257.7 | 32.8 | 32.9 | engine | applyScene (src/game/engine/engine-scenes.ts:155) |
| 257.7 | 32.8 | 32.9 | engine | setScene (src/game/engine/engine-scenes.ts:116) |
| 257.7 | 32.8 | 32.9 | engine | toggleRace (src/game/engine/engine-scenes.ts:284) |
| 252.8 | 32.2 | 32.3 | engine | park (src/game/engine/engine-race-field.ts:439) |
| 251.8 | 32.1 | 32.1 | engine | toSetup (src/game/engine/engine-race.ts:836) |
| 251.8 | 32.1 | 32.1 | engine | enter (src/game/engine/engine-race.ts:90) |
| 251.8 | 32.1 | 32.1 | engine | setRace (src/game/engine/engine-scenes.ts:316) |
| 221.5 | 28.2 | 28.3 | engine | $k (src/game/present/track-art.ts:49) |
| 221.5 | 28.2 | 28.3 | engine | buildArt (src/game/engine/engine.ts:269) |
| 192.9 | 24.6 | 24.6 | engine | ensureCars (src/game/engine/engine-core.ts:340) |
| 192.9 | 24.6 | 24.6 | engine | setCarCount (src/game/engine/engine.ts:258) |
| 192.9 | 24.6 | 24.6 | engine | buildCar (src/game/engine/engine-core.ts:367) |
| 191.3 | 24.4 | 24.4 | bench-loop | r_ (src/game/vehicle/car-core.ts:377) |
| 191.3 | 24.4 | 24.4 | bench-loop | rv (src/game/vehicle/car-parts.ts:123) |


### 5.4 First bench tick 5.435–5.883 s (unfinished rAF callback)

Chunk totals (ms, % of wall): bench-loop 367.8 (82.1%); three 34.6 (7.7%); engine 18.7 (4.2%); (garbage collector) 11.4 (2.6%); (program) 1.3 (0.3%); other:rapier-Bfr5Gp-s.js 1.1 (0.3%); prefabs 0.8 (0.2%); other:rapier_wasm3d_bg-B4SxS5f 0.5 (0.1%); tracks 0.1 (0.0%)

Self time, top 20

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 258.5 | 57.7 | 59.2 | bench-loop | k (src/game/vehicle/car-cage.ts:350) |
| 56.4 | 12.6 | 12.9 | bench-loop | Pl (src/game/vehicle/car-cage.ts:219) |
| 28.9 | 6.4 | 6.6 | bench-loop | ou (src/game/vehicle/car-cage.ts:1097) |
| 22.9 | 5.1 | 5.2 | three | C (three/three.module.js:7022) |
| 11.4 | 2.6 | 2.6 | (garbage collector) | (garbage collector) |
| 10.1 | 2.3 | 2.3 | bench-loop | jl (src/game/vehicle/car-cage.ts:200) |
| 7.5 | 1.7 | 1.7 | engine | md (src/game/present/road-grid.ts:19) |
| 1.9 | 0.4 | 0.4 | three | Fl (three/three.module.js:6064) |
| 1.8 | 0.4 | 0.4 | bench-loop | refresh (src/game/contact/cage-outline.ts:37) |
| 1.7 | 0.4 | 0.4 | three | n (three/three.module.js:66) |
| 1.7 | 0.4 | 0.4 | engine | startStep (src/game/engine/engine-record.ts:232) |
| 1.4 | 0.3 | 0.3 | bench-loop | Ul (src/game/vehicle/car-cage.ts:682) |
| 1.3 | 0.3 | 0.3 | (program) | (program) |
| 1.2 | 0.3 | 0.3 | bench-loop | integrate (src/game/vehicle/car.ts:485) |
| 1.2 | 0.3 | 0.3 | bench-loop | yx (src/game/present/track-mesh.ts:174) |
| 1.1 | 0.3 | 0.3 | three | c (three/three.module.js:4192) |
| 1.1 | 0.2 | 0.3 | bench-loop | DC (src/game/net/codec.ts:212) |
| 1.1 | 0.2 | 0.2 | engine | anon (src/game/present/pose-blend.ts:117) |
| 1.1 | 0.2 | 0.2 | engine | frame (src/game/engine/engine-race.ts:650) |
| 1.0 | 0.2 | 0.2 | three | xt (three/three.module.js:18224) |

Inclusive time, top 20

| ms | %wall | %busy | chunk | function (source:line) |
|--|--|--|--|--|
| 423.7 | 94.6 | 97.1 | engine | tickInner (src/game/engine/engine.ts:396) |
| 423.7 | 94.6 | 97.1 | engine | advance (src/game/engine/engine-input.ts:35) |
| 423.7 | 94.6 | 97.1 | engine-bench | Q (src/game/engine/engine-bench.ts:361) |
| 374.6 | 83.6 | 85.8 | engine | slice (src/game/engine/engine.ts:162) |
| 374.6 | 83.6 | 85.8 | engine | run (src/game/engine/sim-pace.ts:91) |
| 374.6 | 83.6 | 85.8 | engine-bench | Xe.e.run (src/game/engine/engine-bench.ts:274) |
| 372.3 | 83.1 | 85.3 | engine | fixedStep (src/game/engine/engine.ts:574) |
| 363.5 | 81.1 | 83.3 | engine | drive (src/game/engine/engine-race.ts:500) |
| 360.8 | 80.5 | 82.7 | engine | startStep (src/game/engine/engine-record.ts:232) |
| 356.8 | 79.6 | 81.7 | bench-loop | solverSize (src/game/vehicle/car.ts:90) |
| 356.8 | 79.6 | 81.7 | engine | anon (src/game/engine/engine-record.ts:241) |
| 355.8 | 79.4 | 81.5 | bench-loop | ou (src/game/vehicle/car-cage.ts:1097) |
| 355.8 | 79.4 | 81.5 | bench-loop | iu (src/game/vehicle/car-cage.ts:1062) |
| 355.8 | 79.4 | 81.5 | bench-loop | shared (src/game/vehicle/car-cage.ts:973) |
| 355.8 | 79.4 | 81.5 | bench-loop | gu (src/game/vehicle/car-cage-rig.ts:144) |
| 355.8 | 79.4 | 81.5 | bench-loop | vu (src/game/vehicle/car-cage-rig.ts:182) |
| 325.0 | 72.5 | 74.5 | bench-loop | Pl (src/game/vehicle/car-cage.ts:219) |
| 268.6 | 60.0 | 61.5 | bench-loop | k (src/game/vehicle/car-cage.ts:350) |
| 34.5 | 7.7 | 7.9 | three | render (three/three.module.js:17674) |
| 34.5 | 7.7 | 7.9 | constants | render (src/game/present/engine-post.ts:310) |


## 6. (f) Load-time costs, one-off seconds (all measured in the trace)

| # | cost | seconds | where (file:line) | evidence |
|--|--|--|--|--|
| 1 | **Car-cage build**, 3 bursts: 305 ms (1.315 s, lab `stockCage`), 1 210 ms (1.827 s, `warmPrograms`), >=356 ms (5.438 s, first bench tick, still running at trace end) | **>= 1.871 s** = 31.8 % of the 5.883 s trace, 45.0 % of main-thread busy time | `cost` (car-cage.ts:350) self 1 326.0 ms (22.5 % wall, 31.8 % busy), inclusive 1 396.4; `decimate` (car-cage.ts:219) self 286.2, inclusive 1 684.9; `buildStyle` (car-cage.ts:1097) self 174.5, inclusive 1 871.0; `quadricError` (car-cage.ts:200) self 70.4. Chain: `cageFor` :1062 → `CarCage.shared` :973 → `cageOf` car-cage-rig.ts:144 → `CageRig` ctor :182 → `Car.cage` car.ts:65 | profile, whole run (a1/a5) |
| 2 | Why the burst lands inside warm-up | 1.21 s of the 1.319 s `warmPrograms` task | engine-warm.ts:41 `car.setRigVisible(true)` → car.ts:597 → `updateHullHelper` car-core.ts:644 → `this.cage.fields.planBox` forces the cage; the cage only feeds the G-key hull overlay (`hullHelper`) | inclusive: `setRigVisible` 1 212.2, `updateHullHelper` 1 211.6, `get cage` 1 212.3 |
| 3 | Why a third burst lands in the first bench tick | >=0.356 s (unfinished) | engine-record.ts:232 `startStep` → :241 `cars.reduce(... c.solverSize())` → car.ts:90 `solverSize` → `new CageRig(this)` (car.ts:91): asks every car for its cage at the first recorded step, so a style the lab never built (city traffic) is built mid-frame | CITY-OPEN: `solverSize` 356.8 ms inclusive, `buildStyle` 355.8 |
| 4 | Granularity | one build per car **style** (`STYLES` WeakMap keyed by `car.style`, car-cage.ts:1059-1066), `CAGE_VERTICES = 220`; doc comment at car-cage.ts:217 says "Build-time only: allocates freely, runs once per style". Every page load (each loop step reloads: `cycle=1&step=1`) pays it again. 305 + 1 210 + 356 ms ≈ 300 ms per style, so ~6–7 styles built in the trace [INFERENCE: burst boundaries are not separable in the profile] | | `cost` scans every incident triangle per candidate collapse (car-cage.ts:352-389) |
| 5 | `warmPrograms` rest | 52 ms (kernel/env: 1 264 ms `warmPrograms` inclusive minus the 1 212 ms cage) + `warmCrashPath` 223 ms (world-step.ts:292: `integrate` car.ts:485 117 ms, car-air.ts:1332 105 ms, surfaces.ts:1040/1188/946 `offer/offerAll/gridAt` 52.5 ms self) | engine-warm.ts:49 | WARM window |
| 6 | Shader link, `warmScene` | 142 ms task (3.329 s) + sync link waits: `WaitForGetOffsetInRange` 307 calls, 180.7 ms (WARM 90.1, CITY-SETUP 38.5, CITY-OPEN 32.2, LAB-BUILD 14.9); 105 programs; 406 ms of parallel ANGLE translate work | three `onFirstUse` / `getUniforms` (three.module.js:7022 / 7121) self 127.7 ms whole-run, 92.7 ms in WARM; engine-warm.ts:65-108 | main-thread 1 798 `GetProgramiv` calls |
| 7 | City start | **0.747 s** one task (4.675–5.422 s) | `runBench` engine-bench.ts:849 → `raceCommand` engine-scenes.ts:289 → `start` engine-race.ts:59 (322.8 ms) → `setRace` engine-scenes.ts:316 → `toSetup` engine-race.ts:836. Inside: `buildArt` engine.ts:269 → track-art.ts:49 221.5 ms (`stampPath` track.ts:663 145.5 ms, self 134.1; `ground` track.ts:562 165.1); `ensureCars`/`buildCar` engine-core.ts:340/367 192.9 ms for 32 cars (car.ts:52 → car-parts.ts:123 191.3); deform state `streamed-deform.ts:154` 110.5 ms | CITY-SETUP table; card `setupMs.start` = 402.6 ms (a later run, warmer caches [INFERENCE]) |
| 8 | Page load | main busy 220 ms of 1 250; FCP 0.412 s, load 0.876 s; engine ready 1.253 s | boot chunks 0.2–1.25 s | LOAD window, resource waterfall |
| 9 | Lazy assets after first frame | rapier wasm 665 KB 3.74 → 4.65 s (0.91 s); ultra 9 webp (1.6 MB) + `sky.hdr` (1.14 MB) 3.74 → 4.67 s; 119 ms of worker decode; main-thread `gainOf` `getImageData` 3 spikes of 7.7–9.7 ms (prefabs.ts:85, from ultra.ts:57-62); `gainOf` self 60.7 ms total | the bench cannot start until these land: city `runBench` begins 4.675 s | resource times, lab-idle gaps |
| 10 | GC at load | 83 pauses, 52.1 ms; major 8.8 ms at 5.82 s (103.4 → 39.8 MB: the cage build allocates freely) | | GC table |

Sum of the main-thread-blocked load stretches in the trace: 2.22 s (1.253–3.471, cage 1.52 s of it) + 1.21 s+ (4.675–5.883+).

## 7. (g) Cross-check against the matching bench card

Card `4KBA-9Z01` (build 7cf2c6f, `bench=city`, `session=8pyou63d`, `step=city`, UA Chrome 157 Windows, URL identical to the trace's navigation). Posted 17:21:41Z; trace starts 17:18:35Z; the card's `pageEvents` show the run: `warm` phase (4 events in the first 4.2 s: `focused` at 3.35 s, `fullscreen` at 4.23 s), then `window` (30.0 s, 4 795 frames), `ab-pace`, `ab-detail`, `ab-fx`, `replay` (to 56 s). The trace is the first 5.9 s of the page; the bench starts at 4.675 s (`runBench`), so the trace ends ~1.2 s into the card's `warm` phase [INFERENCE: the card's `atS` origin is not in the trace]. The card's racing numbers come after the trace ends.

Numbers that agree:
- vsync: trace `FrameDisplayed` p50 6.05 ms and lab rAF p50 6.07 ms; card frameMs p50 6.10 ms (165 Hz).
- Setup: trace `start` (engine-race.ts:59) 322.8 ms, whole `runBench` task 746.6 ms; card `setupMs.start` 402.6 ms (a repeat, warmer caches). Same order.
- First-frame cost in the card: `fpsPerSecond` second 0 = 123 fps (about 255 ms of frame time lost against the 165 cap), second 1 = 150; consistent with a start-up hitch, but the card cannot tell if it is the cage (the trace shows the cage build in the warm phase before the 30 s window starts). [INFERENCE]
- GPU: card gpuMs mean 3.54 / p99 5.74 ms; the lab trace shows GPU-process busy 1.32 ms/frame with 32-car field absent: consistent (the field adds draws: card 155 calls / 123 k triangles).
- Card sim 2.31 ms vs lab proxy sim 0.17 ms/frame: the 32-car racing sim is ~13x the lab's; render 1.29 ms vs lab 0.57 ms/frame (2.3x).

Same build, same course, 32 cars, all 7cf2c6f city cards on file (UTC 2026-10-12, different sessions):

| card | posted (UTC) | browser | GPU | screen | fps | frameMs p95 | cpuMs | simMs | renderMs | gpuMs | simMs per sim-s | draw calls | triangles |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| 6FKG-NE6K | 10-12T15:51 | Firefox 158 | Mali-T760, or similar | 920x414 | 24.2 | 51.1 | 38.2 | 28 | 7.8 | n/a | 1683 | 189 | 158498 |
| 0VNB-YPX0 | 10-12T16:04 | Chrome 154 | ARM, Mali-G715 | 915x412 | 38.7 | 33.7 | 23.8 | 17 | 4 | n/a | 1021 | 124 | 115316 |
| 2WQD-CHVG | 10-12T16:15 | Chrome 154 | ARM, Mali-G715 | 915x412 | 33.5 | 50.5 | 27.5 | 21.1 | 4.9 | n/a | 1265 | 124 | 114770 |
| Q9RH-SBSB | 10-12T16:26 | Chrome 154 | ARM, Mali-G715 | 915x412 | 28.1 | 50.6 | 33.1 | 25.1 | 5.5 | n/a | 1506 | 147 | 136058 |
| 1YE6-6AWT | 10-12T16:42 | Firefox 158 | NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs | 2560x1600 | 69.4 | 24.2 | 10.1 | 7.4 | 1.7 | n/a | 536 | 161 | 133986 |
| AP5T-5N5C | 10-12T16:52 | Firefox 158 | NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs | 2560x1600 | 67.3 | 18.2 | 11.6 | 9.1 | 1.7 | n/a | 624 | 167 | 133150 |
| DYPP-Y1JF | 10-12T17:02 | Firefox 158 | NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs | 2560x1600 | 60.9 | 24.2 | 14.6 | 11.1 | 1.9 | n/a | 714 | 127 | 109874 |
| G6MB-C8K2 | 10-12T17:13 | Firefox 158 | NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs | 2560x1600 | 63.4 | 24.2 | 13.2 | 10.4 | 1.7 | n/a | 708 | 151 | 122514 |
| 4KBA-9Z01 | 10-12T17:21 | Chrome 157 | NVIDIA, NVIDIA GeForce RTX 4080 Laptop GPU ( | 2560x1440 | 159.8 | 6.2 | 4.2 | 2.3 | 1.3 | 3.5 | 370 | 155 | 123106 |


Reading: the PC that shipped this trace is 3–5x faster on the sim than the Firefox PC (2.3 vs 7.4–11.1 ms) and 7–11x faster than the phone (17–25 ms; `simMs per sim-s` > 1 000 means the sim cannot keep real time on the phone). Render CPU is 1.3 ms here vs 1.7–1.9 on the Firefox PC and 4.0–5.5 on the phone. The sim step is the cost that scales worst across devices; draw calls (124–189) and triangles (110–158 k) are similar everywhere, so the render difference is per-call CPU speed. The card has no `gpuMs` for these other devices (timer queries unavailable).

## 8. Ranking: the 5 biggest offenders

### Per-frame (racing). Source: card 4KBA-9Z01 (means; the trace has no racing). Function evidence from the lab-idle window where the same code runs

| rank | ms/frame (racing, mean / p99) | offender | evidence |
|--|--|--|--|
| 1 | **2.31 / 8.1** (37 % of the 6.26 ms mean frame; 7.4–11.1 on Firefox PC, 17–25 on phone) | **Sim step**: 1.39 steps/frame × 1.66 ms, 370 ms CPU per sim-second | game code: `fixedStep` engine.ts:574 → `nu` world-step.ts:126 → `integrate` car.ts:485 → `stepFree` car-air.ts:1332 (car-air.ts:381 `readPoints`), world queries `offer`/`offerAll`/`gridAt` surfaces.ts:1040/1188/946 (self 52.5 ms of the 217 ms `warmCrashPath`). Lab proxy only 0.17 ms/frame; the 32-car crash sim split is NOT in this trace |
| 2 | **1.29 / 2.0** (21 %) | **three.js render CPU** at 155 calls / 123 k triangles | `WebGLRenderer.render` three.module.js:17674; lab proxy 0.57 ms/frame: `renderBufferDirect` :17233 0.24, `projectObject` :17897 0.17, `setProgram` :18407 0.18, `WebGLGeometries.update` :4192 self 0.138 (re-walks all attributes every frame), `WebGLObjects.update` :4612 0.18, shadow pass `WebGLShadowMap.render` :9143 0.087 (wrapped at wheel-batch.ts:127), `WebGLUniforms.upload` :6123 0.064 |
| 3 | **3.54 / 5.74** GPU (58 % of the 6.06 ms vsync budget) | **GPU frame at 2560x1440 ultra** | card `gpuMs`; GPU process busy only 1.32 ms/frame in the empty lab; it is the next wall once the CPU is fixed |
| 4 | frame spikes: p99 12.2, max 18.4 ms; CPU p99 13.0 / max 18.7 | **tail frames**: cut/bake frames (card `cutFrames` 17, `fineCutsPerSimS` 17.0, sim p99 8.1 / max 10.8 ms) | card; not resolvable to a function without a racing trace. In the lab window the spike sources are one-off: 3× `gainOf` readbacks 7.7–9.7 ms (prefabs.ts:85) and the first frame 12.5 ms |
| 5 | **0.63** (cpu − sim − render) + React HUD **0.10** + native rAF 0.42 (profiler attribution) | **Everything else on the main thread** | lab window: React commit (react-dom, hud.tsx:296, hud-sections.tsx:74) 18.4 ms / 187 frames; `onAnimationFrame` three.module.js:16 self; style/layout 17.7 ms and paint/commit 28.2 ms in 1.15 s (0.24 ms/frame together) |

### One-off (measured, trace seconds, main thread blocked)

| rank | cost | offender | evidence |
|--|--|--|--|
| 1 | **>= 1.871 s** (31.8 % of trace) | Car-cage build per car style: quadric decimation `cost`/`decimate`/`buildStyle` | car-cage.ts:350 / :219 / :1097; triggers engine-warm.ts:41 (`setRigVisible(true)` → `updateHullHelper` car-core.ts:644), lab `stockCage` lab.ts:180, engine-record.ts:241 (`solverSize`) |
| 2 | **0.747 s** | City start `runBench`: track art 221 ms (`stampPath` track.ts:663), 32 `buildCar` 193 ms, deform state 110 ms | engine-bench.ts:849 → engine-race.ts:59 / :836 |
| 3 | **0.365 s** + 180.7 ms sync waits | Shader warm: `warmCrashPath` 223 ms (world-step.ts:292) + `warmScene` 142 ms; 307 sync link waits | three `onFirstUse`/`getUniforms` three.module.js:7022/7121; engine-warm.ts:65 |
| 4 | **>= 0.356 s** (unfinished) + 8.8 ms major GC | Cage build for the city's styles on the first bench tick | engine-record.ts:232/241 → car.ts:90 |
| 5 | **0.91 s** of lab wait + 3 stutter frames | Lazy rapier wasm 665 KB and 2.7 MB of ultra assets gate the bench start; `gainOf` `getImageData` ×3 | resource waterfall; ultra.ts:57 → prefabs.ts:85 |

## 9. Limits of this trace

- No racing frames: all per-function ms/frame above are lab-scene proxies; racing totals are from the card. A manual-start recording is needed to name functions inside the 2.31 ms sim and 1.29 ms render.
- Recording overhead: DevTools tracing with GLES2 call events (about 4 000 per second near warm) and the CPU sampler inflate GL-heavy phases (WARM, link waits). Treat the shader/link numbers as upper bounds.
- The trace is one run on the fast machine. The slow devices (Firefox PC, phone) are only characterised by cards.
