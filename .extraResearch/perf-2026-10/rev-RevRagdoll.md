# RevRagdoll: ragdoll proxies + Rapier (HEAD ecbc560e = `~/crash-wt/bis/cost-x7`)

Reviewed files: `engine-ragdoll.ts`, `ragdoll-proxy.ts`, `car-cage.ts`. All three are byte-identical in cost-w4 and cost-x7 (`cmp`), so the Chrome profile lines are HEAD lines.
Scratch: `~/crash-wt/scratch-RevRagdoll/` (holds `fleet5r.mjs`, `fleet5c.mjs`, `patch-cnt.cjs`, `patch-b.cjs`, `nprof.cjs`, the throwaway tree `cnt/` and the profiles).
Load is noted on every row. Counts do not depend on load. Absolute ms taken at load 3–6 are only good as ratios inside one run.

## 0. Instrument blindness: stock fleet5 never runs the ragdoll system
- `fleet5.mjs` awaits `engine.ready`, then runs `engine.advance` in a loop that never yields. `preload()` (engine.ts:326, `await loadRapier()` at engine-ragdoll.ts:373) therefore never resolves, `this.world` stays null, and `update` returns at engine-ragdoll.ts:440 on every frame.
- Proof, load 2.0: `flock … env ROOT=…/cost-x7 CARS=32 FRAMES=1500 SEED=4242 PROF=…/x7.cpuprofile node --experimental-strip-types fleet5.mjs`, then `node nprof.cjs x7.cpuprofile 'engine-ragdoll|…'`. RagdollSystem.update is **1.9 ms inclusive over the whole 27.6 s run**.
- So the fleet baseline (16.2 ms mean / 25.8 ms aftermath) leaves out the 19–23 % the browser spends here. Neither the fleet row nor the race rows can see a ragdoll cut.
- The working harness is `scratch-RevRagdoll/fleet5r.mjs`. It is fleet5 plus `RAG=1` → `await engine["ragdolls"].preload()` after `ready`, and a per-frame try/catch that counts tick errors.

## 0b. The Rapier trap (`RuntimeError: unreachable`)
- **Repro, load 2.0:** `RAG=1` fleet5r on stock cost-x7 traps at frame 110, in `glassTouch` → `torso.contactCollider(pane, GLASS_SEE)` (engine-ragdoll.ts:1055). It then traps again on **every** later frame: 1390/1390 errors.
- **Why it never stops:** the dummy never ages, because `update` aborts before :507. So the same call is reached on every frame.
- **Who catches it:**
  - `tickInner` (engine.ts:396) does **not** catch it.
  - `tick` (engine.ts:384-393) does. In a browser that means a console error each frame, with the rest of `tickInner` after engine.ts:463 skipped.
  - `advance` (engine-input.ts:35-50, try/finally only) does not catch it. fleet5, probes and the `?bench` frame all run through `advance`, so in them it propagates.
- **What triggered it** (dump from the throwaway tree):
  - car 7, pane 0 (windshield). The pane cuboid is valid (he 0.615/0.344/0.03, unit quaternion).
  - torso cuboid 0.18/0.27/0.11, with its collider pose stale at the pool spot y=−198.89 while its body is at y=1.02 (spawned this frame, no step yet).
- **The trap is one-sided:**
  - `pane.contactCollider(torso)` returns `null`.
  - `torso.contactCollider(pane, 0.15)`, the same call at prediction 0, and doll part 1 → pane all trap.
  - A standalone world with the dumped poses (`trap.mjs`, `trap2.mjs`) does **not** trap. The trigger is world state I did not isolate.
- **Workaround that held, load 3.4:** in the throwaway tree only, call the swapped query and use `w.normal2` as `normal1` (`SWAP=1`). Result: 600 frames, **0 tick errors**. All Rapier timings below come from runs with this workaround.
- The live Chrome fleet profile shows `glassTouch` and `world.step` running normally, so this trap did not fire there. [INFERENCE: the trigger depends on input]

## 1. Measured share

### Live Chrome fleet32 (`fleet32-live.cpuprofile`; cost-w4 lines = HEAD lines)
Commands: `node cpuprof-map.cjs fleet32-live.cpuprofile 400 <lo> <hi>` and `node callers.cjs … 'engine-ragdoll.ts:(838|975|1042)|ragdoll-proxy.ts:395|world.js:126' 12 13 4`.

| inclusive | whole 14.1 s | aftermath 12–13 s (≈11 frames of 78–103 ms) |
|---|---|---|
| `RagdollSystem.update` engine-ragdoll.ts:433 | 2636 ms, 19.1 % | 231 ms/s, 23.1 % (≈21 ms/frame) |
| `fitProxy`:838 → `shape`:975 | 1568 / 1565 ms, 11.3 % | 143.8 ms/s, 14.4 % (≈13 ms/frame) |
| `ProxyFitter.fit` ragdoll-proxy.ts:395 | 1474 ms, 10.7 % | 135.0 ms/s, 13.5 % |
| — `measure`:165 | 767 | 73.5 |
| — `sample`:235 | 657 | 61.6 |
| — `cut`:245 | 642 | 55.5 |
| — `holds`:139 (self) | 524 | 44.9 |
| — `counts`:149 | 450 | 41.5 |
| Rapier `world.step` (world.js:126) | 965 ms, 7.0 % | 82 ms/s, 8.2 % (≈7.5 ms/frame) |
| `cull`:911 | 52 | 4.1 |

- In the aftermath window, the proxy fit is 59 % of the ragdoll system and Rapier is 35 %.
- City (`city-live.cpuprofile`): update 268.6 ms of 15.7 s busy = 1.7 %, so the race rows barely touch it.

### Node, fleet5r (RAG=1, SWAP workaround, throwaway tree with counters), load 3.4–4.5
Commands: `cd scratch-RevRagdoll && flock ~/crash-wt/ab.lock env SWAP=1 RAG=1 ROOT=$PWD/cnt CARS=32 FRAMES=600 SEED=4242 PROF=$PWD/cnt-swap.cpuprofile node --experimental-strip-types fleet5c.mjs`, then `node nprof.cjs cnt-swap.cpuprofile '^(update|fitProxy|shape|fit|…)@'`.

- update: 2510 ms of 18583 ms tickInner = 13.5 %.
  - fitProxy→shape: 1940 ms (77 % of update).
    - fit: 1724 ms, of which measure 995, cut 621, markGlass 61. holds, counts and sample are inlined into these.
    - planField: 112 ms.
    - setCuboid: 70 ms.
  - Rapier step: 330 ms (13 %). Fewer steps per frame than live Chrome, because most of the run is slow-mo.
  - cull: 117 ms.
  - glassTouch: 50 ms.

## 2. Counts (same run; frames 110–600 have dummies out; counts are load-independent)

| counter | value |
|---|---|
| frames with world + dummy out | 491; dolls live: 974 slot-frames (≈2 out) |
| cars passing the `near` gate (engine-ragdoll.ts:454) | 5829 → **11.9 cars/frame** |
| proxy refits (`shape`) | 1571 → **3.2/frame**, 0.27 per near car per frame |
| why refit | serial 1535 (97.7 %), new car 22, panes 14, lift 0 |
| boxes per fit | 201063/1571 = **128.0**: the split loop always runs to the `PROXY_BOXES-1` cap (ragdoll-proxy.ts:410) |
| fit ms per call | 1.09 ms (load 3.4) |
| refit gap, same car (frames) | 1: 899 (58 %) · 2–3: 316 · 4–7: 187 · 8–15: 116 · 16+: 31 |
| refits of an already-fitted (car, serial, glassBits) | **0** |
| refits whose input fields (top, covered) equal the last fit's | 14 / 1571 |
| refits whose whole output equals the last fit's | 9 / 1571 |
| leaves bitwise unchanged across a refit | 2121 / 201063 (1.05 %); of `setCuboid` calls only 1298 / 104900 (1.2 %) could be skipped |
| colliders in world | 460452/491 = **938/frame**, 836 of them leaves |
| `world.step` | 1394 → 2.84/frame (slow-mo); 0.24 ms/step (load 3.4, ratio use only); 0 steps while dormant |

## 3. Answers
- **Rebuilds per frame/car, boxes:** 3.2 per frame, 0.27 per near car per frame. Every rebuild yields all 128 boxes.
- **Rebuilt with no dummy in reach?** No. `fitProxy` runs only behind `near()` (:454: dummy torso within DOLL_REACH+NEAR_MARGIN+travel, a purse near it, or a knocked prop touching → `whole`).
- **Whole proxy rebuilt on a partial cage change?** Yes. `fit` reruns the full top-down split from `planBox` (ragdoll-proxy.ts:401-433) on every serial bump. Leaf-level reuse would not pay: only 1 % of leaves come out bitwise unchanged, because one change moves every later cut.
- **Cache per `cage.serial`, across frames and dummies?** Already done:
  - :843 skips unless the car, lift, serial or glassBits changed (0 repeat refits measured).
  - One fit per car serves every dummy: `leafFits` per car slot, and `cull` picks leaves per dummy.
  - The waste is that the serial changes nearly every frame for a settling wreck (58 % of refits come 1 frame after the previous one).
- **measure/sample/cut once per cage change?** They already run only per cage change. The cost is inside one fit: per node, `holds` is re-derived about 7× per `measure`, and `cut` re-samples every node its own `measure` just sampled (see cut 1).
- **Rapier timestep:**
  - It runs on its own accumulator (`update` :469-476): `STEP` = 1/480 while a dummy is out, `PROP_STEP` = 1/120 for props alone. This does not match the sim's slice.
  - It already steps only while not `dormant` (:471 zeroes `acc`).
  - The owner moved the rate from 1/960 to 1/480 on 2026-10-06 (comment :83-89). Going lower changes the dummies.

## 4. Ranked cuts

### 1. Exact rewrite of `ProxyFitter` internals (bit-identical) — **measured 0.556× / 0.561× fit ms, 0 disagreements**
Change in `ragdoll-proxy.ts`:
- **(a) `holds` (:139):** fill a per-fit `side: Uint8Array(LINES*LINES)` at the end of `markGlass` (:325): `covered===1 && glassNode===0 && isFinite(top)` ? (`top > BELT_Y` ? 2 : 1) : 0. Then `holds` becomes `side[n] === roof[k] + 1`.
- **(b) `measure` (:165):** fuse loops 1 and 2 (:171-190). Nodes outside the tightened rectangle are not held, so `inner`/`innerHi` come out identical.
  - Keep the original NaN semantics of `plan`: skip on `plan[n] > -RIM`.
- **(c) Move cut's moment pass into measure's sample loop** (:200-211):
  - Per-leaf line moments `mom: Float64Array(PROXY_BOXES*2*LINES*MOMENTS)` (1 MiB), indexed by **absolute** line.
  - Zero only the lines of the entry rectangle.
  - Accumulate in the same order (j outer, i inner), with the same `inside` rule as :252.
  - `cut` (:245) then reads `mom` over its final rectangle and skips its `sample` pass and `line.fill`.
  - `take` (:301) also copies the leaf's `mom` block.
  - This is exact: a leaf's rect, floor, ceil and rim change only in `measure`, and a roof leaf's final rect is its counted rect, so the nodes outside it are NaN in both versions.

Measurement:
- Prototype `ProxyFitterB` (subclass, `patch-b.cjs`) ran beside `ProxyFitter` in `shape`, on the same inputs, alternating order per call. Every output was compared with `Object.is` on count and all boxes.
- Command: `flock … env SWAP=1 RAG=1 ROOT=…/cnt CARS=32 FRAMES=600 SEED=4242 node --experimental-strip-types fleet5c.mjs`.

| run | load | A (old) ms | B (new) ms | B/A | compared | disagreements |
|---|---|---|---|---|---|---|
| 1 | 3.1 | 1865.8 | 1037.1 | 0.556 | 1571 | 0 |
| 2 | 6.7 | 1780.5 | 998.4 | 0.561 | 1571 | 0 |

Expected gain:
- Chrome aftermath: 0.44 × 135 ms/s ≈ 59 ms/s ≈ 5 ms/frame (≈6 % of an aftermath frame); whole fleet profile ≈ 650 ms / 13.8 s ≈ 4.7 %. [INFERENCE: the node B/A ratio carried over to V8 in Chrome]
- Node fleet5r: ≈ 0.44 × 9.3 % ≈ 4 % of tickInner.
- City row: ~0 (the system is 1.7 % there).

### 2. Do proxy refits less often (changes dummy behaviour; cosmetic)
- In `fitProxy` (:843), refit on a serial change at most once per car per N frames, or at most M refits per frame round-robin, oldest serial first. Keep immediate refits for a new car, a lift change or glassBits.
- The gap histogram is the ceiling: 58 % of refits come at gap 1 and 78 % at ≤3. N=4 caps each car at 15 refits/s at 60 fps. Fewer refits would also mean fewer `setCuboid` calls (67 per refit). **Gain unmeasured.**
- The proxy lags the cage by up to N frames.
- Proof needs a dummy-pose digest (hash of `dolls[s].cur` each frame) to label the change, plus a visual check that bodies resting on a crushing roof do not sink.
- No sim REPLAY bump expected: the only thing the dummy world writes back is `hitGlass`. [INFERENCE: not verified]
- Stacks with cut 1.

### 3. Fewer leaves (changes dummy behaviour)
- Set `PROXY_BOXES` to 64.
- The fit stops at half the splits (the loop is capped, and 128.0 boxes per fit shows it always hits the cap). Leaf colliders in the world (836/frame) should roughly halve, which shrinks both `fit` and Rapier's per-step broad-phase. **Unmeasured.**
- Risk: contact fidelity (docs/UNIFIED_CONTACT.md §8, `ragdoll-proxy-fit.test.ts` audit).

### 4. Rapier: skip `setNextKinematic*` for proxies whose pose has not changed since the last step
- `moveProxies` :613 runs on every step for every `on` body.
- For a resting wreck the pose is identical. Skipping the call keeps Rapier from marking that body's ~60 colliders as moved.
- Exactness is **not proven**: Rapier's position-based kinematic body keeps its `next_position`, so the step result should be identical. Needs a dummy-pose digest A/B. Gain unmeasured, because the wasm-internal cost cannot be attributed in the profile.

### Rejected (measured)
- Skip `setCuboid` for unchanged leaves: 1.2 % of calls.
- Skip a refit when the input fields are equal: 14/1571.
- Cache per serial: already done, 0 repeats.
- Share one fit across dummies: already done.
- planField in `shape`: 6 % of shape, and needed anyway (43 % of fits are its first ask; `sat.ts` shares the result).

## 5. Recommended first lane: cut 1 (exact ProxyFitter rewrite)
**Brief.** In `src/game/present/ragdoll-proxy.ts` only, inside `ProxyFitter`:
1. Add `side` (Uint8Array LINES*LINES) and fill it at the end of `markGlass`. Make `holds(k, f, n)` return `this.side[n] === this.roof[k] + 1`. Keep the signature, so `counts` and `under` stay untouched.
2. Fuse `measure`'s first two loops, keeping `if (plan[n] > -RIM) continue` after the bounds update.
3. Add `mom` (Float64Array PROXY_BOXES*2*LINES*MOMENTS).
   - In `measure`, after floor/ceil/rim are set: zero `mom` for leaf k over lines [I0..I1] (axis 0) and [J0..J1] (axis 1), using the entry rect.
   - In the sample loop, accumulate count, y, y² and `inside` (the :252 rule) into absolute line slots.
4. In `cut`, delete the sample pass and `this.line`; read `mom` at `(axis*LINES + first + m)*MOMENTS` with `first` = i0[k] or j0[k]. In `take`, also `mom.copyWithin(k*L, n*L, n*L+L)`.
5. Delete the now-unused `line` field.
- The working reference is `~/crash-wt/scratch-RevRagdoll/patch-b.cjs` (the `ProxyFitterB` text).

**Acceptance.**
- (a) `node --experimental-strip-types --test src/game/present/ragdoll-proxy-fit.test.ts` plus the `engine-ragdoll*.test.ts` files are green. tsc is clean on the lane tree.
- (b) Disagreement counter:
  - Make a throwaway copy of the lane tree and keep the old class beside the new one as `ProxyFitterOld`. Copy it from HEAD.
  - Apply `patch-cnt.cjs`, with the in-`shape` comparison block from `patch-b.cjs` pointed at it. Use `SWAP=1`; the trap blocks the stock path.
  - `flock … env SWAP=1 RAG=1 ROOT=<copy> CARS=32 FRAMES=600 SEED=4242 node --experimental-strip-types scratch-RevRagdoll/fleet5c.mjs`.
  - Required: `ab.compared` 1571, `ab.disagree` absent (0), `ab.msB/ab.msA` ≤ 0.6 in the same run.
- (c) Fleet digest unchanged (stock fleet5: 795525135) and race-row digests unchanged. This is trivially true, because the dummies never feed the sim. The counter in (b) is the real proof.

**Separate bug lane, not perf.** The `contactCollider` trap makes `RAG=1` timing rows impossible on the stock tree, and it would turn into a permanent per-frame error in a browser if it fired there.
- Candidate fix: query `pane.contactCollider(torso, GLASS_SEE)` and read `normal2` (0 errors / 600 frames, load 3.4).
- The cause is not isolated. A standalone repro with the same poses does not trap.
