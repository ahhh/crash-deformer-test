Believable low-difficulty mistakes should be **small, correlated with track features, recoverable, and deterministic**—not random steering failures. A useful architecture is:

\[
\text{AI input} \rightarrow \text{perception filters} \rightarrow \text{target-line planner} \rightarrow \text{speed planner} \rightarrow \text{PID controller} \rightarrow \text{mistake/recovery layer}
\]

Racing-AI references commonly model sectors, racing lines, braking points, corner speeds, stability, understeer/oversteer, recovery, and catch-up logic rather than treating driving as waypoint following.[1][2] Colin McRae Rally 2.0 reportedly combined feed-forward neural networks trained from human driving with hand-authored state rules for overtaking and crash recovery.[3]

## 1. Offset the target line with smooth noise

Do not generate a new random lateral target every frame. Use seeded, low-frequency noise:

\[
d_{\text{target}}(s)=d_{\text{race line}}(s)+A\,N(s)
\]

where:

- \(s\) is distance along the track
- \(A\) is lateral amplitude in metres
- \(N(s)\in[-1,1]\) is smoothed or Perlin-style noise

For a low-difficulty driver:

| Situation | Amplitude \(A\) | Noise wavelength |
|---|---:|---:|
| Straight | \(0.10\)–\(0.30\) m | 20–60 m |
| Normal corner | \(0.15\)–\(0.40\) m | 15–40 m |
| Hairpin or difficult corner | \(0.25\)–\(0.60\) m | 10–30 m |
| Very poor driver | up to \(0.8\) m | 8–25 m |

Use the noise conservatively near walls and track edges:

\[
d_{\text{target}}=
\operatorname{clamp}
\left(d_{\text{race line}}+A N(s),\,
d_{\min}+m,\,
d_{\max}-m\right)
\]

with \(m\) typically \(0.5\)–\(1.0\) m.

A practical implementation samples random control points every 10–30 m and interpolates them with a smooth curve. Perlin noise is useful, but cubic interpolation of seeded points is often easier to tune and reproduce.

## 2. Make corner-speed perception slightly wrong

Keep the actual optimal speed correct, but make the driver’s estimate noisy and delayed:

\[
\hat v_{\text{corner}}(t)
=
\alpha v_{\text{corner}}(t-\tau)
+
(1-\alpha)\hat v_{\text{corner}}(t-\Delta t)
+
\epsilon_v
\]

Recommended values:

- Perception delay \(\tau\): \(100\)–\(400\) ms
- Smoothing coefficient \(\alpha\): \(0.2\)–\(0.5\)
- Speed-estimation noise \(\epsilon_v\): \(1\)–\(4\) km/h
- Low-difficulty corner-speed multiplier: \(1.05\)–\(1.15\)

The target can therefore be:

\[
v_{\text{target}}
=
\frac{\hat v_{\text{corner}}}{1+\delta_v}
\]

where \(\delta_v\) is usually zero, but occasionally becomes negative, causing the AI to approach too quickly. For example, a \(1.10\) multiplier means the driver aims for approximately 10% more speed than the nominal corner target.

Avoid applying the multiplier continuously to every corner. Select it per corner using seeded randomness, then blend it in over 0.5–1.5 seconds. That produces a driver who sometimes misjudges a turn rather than one who is uniformly incompetent.

For a curvature-based baseline:

\[
v_{\text{safe}}=
\sqrt{\frac{\mu g}{|\kappa|+\varepsilon}}
\]

where \(\kappa\) is curvature and \(\mu\) is an effective grip estimate. The AI should estimate \(\mu\), curvature, or braking distance imperfectly rather than receive a completely different physics model.

## 3. Add reaction-delay buffers

Queue important control decisions instead of applying them immediately:

```cpp
struct DelayedCommand {
    float time;
    float steering;
    float brake;
    float throttle;
};
```

At low difficulty:

- Steering delay: \(100\)–\(250\) ms
- Braking delay: \(150\)–\(400\) ms
- Throttle correction delay: \(100\)–\(250\) ms

Use separate buffers for steering and braking. A driver may turn late but still brake early, or brake late while steering correctly. That variation is more convincing than delaying the whole controller equally.

Quantize decisions at approximately 10–20 Hz while leaving vehicle physics at the normal simulation rate. This creates mild human-like hesitation without visibly making the AI frame-rate dependent.

## 4. Reduce PID steering authority

For lateral error \(e_y\), heading error \(e_\psi\), and derivative terms:

\[
u_{\text{steer}}
=
K_y e_y+
K_\psi e_\psi+
K_d\dot e_\psi+
K_i\int e_\psi dt
\]

For low difficulty, reduce gains rather than injecting large steering noise:

- \(K_y\): 10–25% lower
- \(K_\psi\): 10–20% lower
- \(K_d\): 20–40% lower
- Steering-rate limit: 10–25% lower
- Integral term: usually unchanged or disabled

A useful target is to let the car reach roughly \(0.3\)–\(0.8\) m of lateral error before correcting decisively. Do not permit errors to grow indefinitely; clamp the controller’s intended path and activate recovery before the car leaves the track.

Add a small steering bias only when appropriate:

\[
u'_{\text{steer}}
=
\operatorname{clamp}(u_{\text{steer}}+b,\,-1,1)
\]

with \(b\) around \(0.02\)–\(0.08\), held for 0.5–2 seconds. Biases should be rare and smoothed.

## 5. Trigger mistakes per corner

Use a probability that depends on difficulty, corner severity, and current stress:

\[
p_{\text{mistake}}
=
1-
(1-p_0)
(1+s_{\text{corner}})
(1+s_{\text{traffic}})
(1+s_{\text{damage}})
\]

Clamp the result to a sensible range, such as \(0\)–\(0.35\).

Example base probabilities per corner:

| Difficulty | \(p_0\) |
|---|---:|
| Easy | 0.03–0.08 |
| Medium | 0.01–0.04 |
| Hard | 0.002–0.015 |

A mistake should select a **type**, not merely “drive worse”:

- Late braking: \(35\%\)
- Turn-in late: \(25\%\)
- Missed apex: \(20\%\)
- Exit traction mistake: \(15\%\)
- Minor overcorrection: \(5\%\)

The severity can be sampled from a bounded distribution:

\[
q=\operatorname{clamp}(0.5+0.25Z,\,0.1,\,1.0)
\]

where \(Z\) is a standard normal sample. Bounded Gaussian variation is preferable to uniform randomness for believable behavior; game-AI guidance explicitly recommends Gaussian variation for agent characteristics instead of uniform randomness.[4]

A mistake can then modify parameters for a finite duration:

- Braking point: 2–8 m late
- Turn-in point: 1–5 m late
- Corner target speed: 3–10% too high
- Apex offset: 0.2–0.8 m
- Recovery delay: 0.2–0.8 s

## 6. Use staged recovery behaviour

Recovery should follow the physical situation:

### Mild understeer

1. Reduce throttle by 10–30%.
2. Increase steering gradually.
3. Target a point 2–5 m ahead on the track.
4. Rejoin the racing line over 1–3 seconds.

### Heavy understeer or running wide

1. Brake progressively, not instantly.
2. Reduce steering if the front tyres are saturated.
3. Aim parallel to the track edge.
4. Rejoin behind the optimal line.

### Oversteer

1. Apply a short counter-steer pulse.
2. Reduce throttle by 15–40%.
3. Limit counter-steering to avoid oscillation.
4. Return control to the normal PID loop once yaw error falls below a threshold.

### Off-track recovery

- Cap throttle at 20–50%.
- Use a separate recovery target aligned with the nearest valid track direction.
- Permit a 1–3 second recovery period.
- Do not teleport unless the car is genuinely stuck.

This follows the broader racing-AI pattern of using explicit states for stability, understeer/oversteer, airborne conditions, off-track behaviour, and crash recovery.[2][3]

## 7. Keep it deterministic for replays

Give every driver an independent seed:

\[
S_i=\operatorname{Hash}(
\text{raceSeed},
\text{driverId},
\text{sessionId}
)
\]

Use separate deterministic streams for:

- Line noise
- Perception noise
- Corner-mistake selection
- Mistake severity
- Recovery variation

Never use a global RNG whose call count can change when another car spawns, collides, or takes a different branch. For replay stability:

- Generate noise from distance and seed, not frame count.
- Store the selected mistake event, start distance, type, and severity.
- Use fixed simulation time steps.
- Make random decisions at corner entry or decision points.
- Log AI state transitions and seeds.
- Keep floating-point and physics settings consistent across platforms where exact replays matter.

A robust event record might be:

```cpp
struct MistakeEvent {
    uint64_t seed;
    float triggerDistance;
    MistakeType type;
    float severity;
    float duration;
};
```

The AI can then regenerate the same behaviour without recording every steering input.

## 8. Combine the effects without stacking excessively

A good low-difficulty driver might use:

```text
Target-line noise:       0.25 m amplitude, 30 m wavelength
Corner-speed error:      1.08 multiplier
Perception delay:        220 ms
Brake delay:             280 ms
Steering delay:          160 ms
Lateral PID gain:        80% of expert value
Derivative gain:         70% of expert value
Mistake probability:     5% per ordinary corner
Late-brake severity:     3–6 m
Recovery duration:       1.5–2.5 s
```

Do not activate every imperfection at once. Select one primary imperfection per corner and, at most, one minor secondary effect. Otherwise the AI will look intentionally sabotaged.

Forza’s published description of Drivatar behaviour similarly emphasizes natural, unscripted errors such as braking too late and running wide, while exposing difficulty as a broad skill scale rather than requiring every driver to use identical behaviour.[5] The goal is therefore not random failure, but a consistent driver personality whose occasional mistakes have understandable causes.

[1] here - AI Junkie (http://ai-junkie.com/misc/hannan/hannan.html)
[2] [PDF] Robust player imitation using multiobjective evolution - mediaTUM (https://mediatum.ub.tum.de/doc/1289110/document.pdf)
[3] github.com › blob › mainMariliktux/racing-ai-timeline.md at main · JackTrodess ... (https://github.com/JackTrodess/Mariliktux/blob/main/racing-ai-timeline.md)
[4] collected wisdom of game ai professionals (https://api.pageplace.de/preview/DT0400.9781466565975_A37880051/preview-9781466565975_A37880051.pdf)
[5] Just got this game the other day - help me understand the driveatars (https://www.reddit.com/r/forza/comments/2kqb09/just_got_this_game_the_other_day_help_me/)
[6] AI Game Programming Wisdom (http://aiwisdom.com/byresource_aiwisdom.html)
[7] Ai Game Programming Wisdom (https://andersonuniversity.ecampus.com/ai-game-programming-wisdom-cd-rabin-steve/bk/9781584500773)
[8] Forza Motorsport's New AI and Physics Make Every Race Competitive (https://forza.net/news/forza-motorsport-drivatars-tire-physics)
[9] Changes to Drivatar AI Coming in Forza Motorsport Update 20 (https://forza.net/news/forza-motorsport-drivatar-changes)
[10] Forza (https://en.wikipedia.org/wiki/Forza)
