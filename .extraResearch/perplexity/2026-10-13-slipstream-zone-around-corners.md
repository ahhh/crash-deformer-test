For an arcade racer, use a **breadcrumb-based wake** as the core detector, optionally bounded by a simple rear cone/trapezoid. It follows the leader through corners naturally, is cheap to evaluate, and lets the slipstream feel consistent without simulating fluid dynamics.

## 1. Rear cone or trapezoid

Transform the candidate car into the leader’s local space:

- \(x\): distance behind the leader
- \(y\): lateral offset from the leader’s forward axis

A cone test is:

\[
0 < x < L,\qquad |y| < x\tan(\theta)
\]

Typical arcade values:

| Parameter | Suggested value |
|---|---:|
| Detection length \(L\) | 1.5–3.0 car lengths |
| Half-angle \(\theta\) | \(10^\circ\)–\(20^\circ\) |
| Full width at maximum range | roughly 0.5–1.1 car lengths |
| Minimum activation distance | 0.1–0.25 car lengths |

For a 4.5 m car, a 2-car-length wake is 9 m long. With a \(15^\circ\) half-angle, its width at the rear is about 4.8 m, or 1.1 car lengths.

A trapezoid is often easier to tune:

\[
|y| < w(x)
\]

where \(w(x)\) interpolates between a narrow front width and a wider rear width. For example:

- At \(x=0.1L\): half-width \(0.35\) car lengths
- At \(x=L\): half-width \(0.7\) car lengths

**Advantages**

- Very cheap: one transform and a few comparisons
- Predictable and easy to debug
- Works well on straights

**Weaknesses**

- A single instantaneous cone becomes wrong in corners: the leader’s current heading may point away from the actual path occupied by its wake
- A wide cone can incorrectly grant drafting when the follower is beside the leader or separated by a track barrier
- A narrow cone can miss the effect during steering or lateral movement

Use the cone as a broad eligibility check, not necessarily as the entire wake model.

## 2. Breadcrumb or recent-trail detection

Record the leader’s recent positions and orientations at fixed distance or time intervals. For each breadcrumb, test the follower against a circular influence region:

\[
d_i = \left\|p_{\text{follower}}-p_i\right\|
\]

Then weight the effect by age or distance. A simple version is:

\[
S_i = \operatorname{smoothstep}(R_{\max},R_{\min},d_i)
       \cdot \operatorname{smoothstep}(T_{\max},T_{\min},t_i)
\]

where:

- \(R_{\min}\): near-wake radius
- \(R_{\max}\): far-wake radius
- \(t_i\): breadcrumb age
- \(S_i\): contribution from breadcrumb \(i\)

Suggested values:

| Parameter | Typical value |
|---|---:|
| Breadcrumb spacing | 0.25–0.5 car lengths |
| Trail history | 2–4 car lengths, or 0.3–0.8 s |
| Near-wake radius | 0.4–0.6 car lengths |
| Far-wake radius | 0.8–1.2 car lengths |
| Maximum effective distance | 2–3 car lengths |
| Sample count | 6–16 points |

Instead of using only circles, store each breadcrumb’s forward direction and test an oriented ellipse or short capsule behind it. A practical test is:

1. Find the closest breadcrumb or trail segment.
2. Measure longitudinal distance along that breadcrumb’s forward vector.
3. Require the follower to be behind that point.
4. Use a radius that grows with distance.

For example:

\[
R(x)=0.45L_c+0.25x
\]

where \(L_c\) is the leader’s car length and \(x\) is distance behind the local trail point. Clamp the result to approximately \(1.0\)–\(1.2L_c\).

**Advantages**

- Naturally follows corners
- Handles hairpins and changing heading
- Can represent a curved wake without expensive physics
- Supports smooth entry and exit as cars move through the trail

**Weaknesses**

- Requires history buffers
- A simple nearest-point test may grant slipstream from the wrong side of a switchback
- Needs filtering to avoid flickering when the follower crosses between breadcrumbs

To prevent false positives, add these checks:

- The follower must be moving generally along the trail direction.
- The follower’s velocity should point within roughly \(45^\circ\)–\(60^\circ\) of the local wake direction.
- Reject breadcrumbs separated by a wall, checkpoint sector, or excessive track distance.
- Require the follower to be behind the leader in track progress, not merely spatially close.
- Use hysteresis: activate at \(S>0.25\), deactivate at \(S<0.15\).

A good arcade implementation samples the leader’s **past path**, then applies a forward-facing influence around each trail segment. This is usually better than storing only positions because a segment contains both position and direction.

## 3. Hybrid recommended model

Use both methods:

1. **Breadcrumb trail** determines the wake’s curved centerline.
2. **Local cone or capsule** determines whether the follower is close enough to benefit.
3. **Track-progress and line-of-sight checks** remove implausible detections.
4. **Distance-based strength** controls the speed boost.

Example strength curve:

| Distance behind leader | Slipstream strength |
|---|---:|
| 0.1–0.5 car lengths | 100% |
| 1 car length | 70–85% |
| 2 car lengths | 25–45% |
| 3 car lengths | 0–15% |

Use a smooth curve rather than abrupt thresholds:

\[
S=\operatorname{smoothstep}(3L_c,0.25L_c,d)
\]

Then multiply by alignment:

\[
S_{\text{final}}=S\cdot
\operatorname{smoothstep}(0.2,0.8,\mathbf{v}_f\cdot\mathbf{d}_{\text{wake}})
\]

where the dot product is normalized and ranges from \(-1\) to \(1\).

For gameplay, apply the effect gradually:

- Begin charging after 0.15–0.25 s inside the wake
- Reach full effect after 0.4–0.8 s
- Fade out over 0.2–0.5 s after leaving
- Limit the boost to the leader’s forward direction so it does not create excessive cornering grip

## 4. What motorsport suggests

Real drafting is strongest very close to the preceding car. NASCAR explanations commonly describe the largest benefit within about one car length, with measurable aerodynamic effects extending to roughly three car lengths.[2] A technical discussion of NASCAR drafting likewise describes the strongest effect at approximately one to two car lengths.[3]

Formula 1 wakes are more complicated because they include both reduced drag and disturbed airflow. Research summarized in the available sources reports a low-pressure wake effect at around two car lengths and aerodynamic wake structures that can persist for more than ten car lengths, although the useful tow is much weaker farther back.[4] Other F1 material describes the beneficial slipstream as strongest within roughly two car lengths and fading rapidly beyond that distance.[1]

The practical game-design interpretation is:

- **Strong tow:** 0.25–1 car length
- **Useful tow:** 1–2 car lengths
- **Weak or barely noticeable tow:** 2–3 car lengths
- **Aerodynamic disturbance without a useful speed benefit:** potentially farther away, especially in F1-style simulations

The wake is not necessarily a fixed cone. Real wake shape depends on vehicle bodywork, speed, yaw angle, turbulence, and the surrounding cars. F1 sources report that wake effects can extend well beyond the strongest slipstream region, while the strongest drag benefit remains close to the leader.[4][6]

## 5. Recommended default values

For a forgiving arcade racer:

- Trail length: **3 car lengths**
- Breadcrumb spacing: **0.35 car lengths**
- Near radius: **0.45 car lengths**
- Far radius: **1.0 car length**
- Maximum slipstream distance: **2.5 car lengths**
- Effective wake half-angle: **12°–18°**
- Full strength: **within 0.75 car length**
- Half strength: **around 1.5 car lengths**
- Minimum alignment: **within about \(45^\circ\) of the wake direction**
- Activation delay: **0.15 s**
- Release fade: **0.3 s**

For a more exaggerated arcade feel, use a 4-car-length trail, \(20^\circ\) half-angle, and a 3-car-length maximum range. For a realistic or competitive handling model, keep the strong effect under one car length and let the benefit fall sharply after two lengths.

The best overall solution is therefore a **curved breadcrumb wake with a widening radius, constrained by local direction and track progress**, rather than a single cone attached to the leader.

[1] f1radioreplay.com › blog › f1-slipstreamWhat Is an F1 Slipstream? The Free-Speed Tow Explained (2026) (https://f1radioreplay.com/blog/f1-slipstream/)
[2] How NASCAR Drafting Works - Auto | HowStuffWorks (https://auto.howstuffworks.com/auto-racing/nascar/nascar-basics/nascar-drafting.htm)
[3] The Aerodynamics of Drafting in NASCAR: Science, Strategy, and Speed (https://slicksandsticks.com/2025/05/03/aerodynamics-of-drafting-in-nascar/)
[4] [PDF] on the Wake Effect and Dirty-air generation in Formula 1 and high (https://lseee.net/index.php/te/article/download/2029/TE013452.pdf/8159)
[5] #formula1 #aerodynamics #cfd #f1tech #2026f1 | Anirudh Kasula (https://www.linkedin.com/posts/anirudh-kasula_formula1-aerodynamics-cfd-activity-7414753307052630016-MRby)
[6] INVESTIGATION INTO THE AERODYNAMIC DESIGN OF A FORMULA ONE CAR (https://fr.slideshare.net/slideshow/investigation-into-the-aerodynamic-design-of-a-formula-one-car/63479799)
[7] What Is Slipstream in Racing and How Does It Work ... (https://scienceinsights.org/what-is-slipstream-in-racing-and-how-does-it-work/)
[8] What Is Dirty Air In F1? | F1 News (https://f1chronicle.com/what-is-dirty-air-in-f1/)
[9] Drafting (aerodynamics) - Wikipedia (https://en.wikipedia.org/wiki/Drafting_(aerodynamics))
[10] Oscillating Middle Vehicle in a Platoon (https://arxiv.org/html/2405.04488v1)
