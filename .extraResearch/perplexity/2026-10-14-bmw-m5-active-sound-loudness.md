BMW’s system is **not a fixed “engine-volume versus RPM” table**. It is a model-based, synthesized interior sound whose level and spectral content are selected from engine speed, accelerator-pedal request/load, torque and vehicle state. BMW describes the goal as making low-rpm torque audible while increasing excitement during acceleration[3][5][10]. Public BMW documents do **not** appear to publish a calibrated F90/G90/E60/F10 cabin SPL map in dB versus RPM and throttle, so exact numerical reproduction from factory data is not possible.

## What is documented

BMW’s Active Sound Design (ASD) documentation says the sound is evaluated against a programmed sound specification using parameters including:

- Accelerator-pedal angle, representing the driver’s desired load
- Engine speed
- Engine torque
- Vehicle operating state[10]

The F10 M5 training material confirms that ASD is factory-installed and separately documented, while the M-button configurations can combine Comfort/Sport settings with Sport/Sport Plus settings[9]. BMW’s public acoustic description says the system is intended to make the engine emerge from the background during dynamic acceleration and to make torque audible at low RPM while retaining a more exciting high-RPM character[3].

That implies a **two-dimensional or multidimensional gain surface**, not simply:

\[
G=f(\mathrm{RPM})
\]

A more realistic game implementation is:

\[
G=f(\mathrm{RPM},\,L,\,v,\,m)
\]

where \(L\) is requested load, \(v\) is speed, and \(m\) is the drive-mode state.

## Likely gain curve for a game implementation

The following is a practical approximation, **not a BMW-published calibration**. Values are suggested relative gains for the synthesized cabin layer, normalized to maximum ASD level rather than claimed factory dB SPL.

| Engine condition | Suggested ASD gain |
|---|---:|
| Idle, warm engine | −25 to −18 dB |
| 1,500–2,000 rpm, steady cruise / very light throttle | −22 to −15 dB |
| 2,000–3,000 rpm, light-to-medium throttle | −15 to −8 dB |
| 2,500–4,000 rpm, moderate/high load | −8 to −2 dB |
| 3,500–5,500 rpm, full load | −3 to 0 dB |
| 5,500 rpm to redline, full load | −2 to 0 dB, with stronger high-frequency content |
| High rpm but closed throttle | −18 to −10 dB, plus deceleration/overrun transients |

Use **load as the dominant loudness control**. RPM should control both loudness and timbre, but a high-revving engine under no load should not sound as loud as the same engine at wide-open throttle. The intended curve therefore has:

- A low-level “background” floor at idle and cruise
- A gradual rise with pedal/load
- A steep rise once medium-to-high load is combined with acceleration
- A broad plateau near maximum output under full load
- Additional high-frequency harmonics and sharper transients at high RPM

A useful continuous approximation is:

\[
G_\mathrm{dB}
=
G_\mathrm{floor}
+
A_\mathrm{load}(L)
+
A_\mathrm{rpm}(\mathrm{RPM})
+
A_\mathrm{accel}
\]

with, for example:

\[
A_\mathrm{load}(L)=
\begin{cases}
0, & L<0.15\\
8(L-0.15)/0.35, & 0.15\le L<0.50\\
8+14(L-0.50)/0.50, & L\ge0.50
\end{cases}
\]

and a restrained RPM contribution:

\[
A_\mathrm{rpm}=
\begin{cases}
-4, & \mathrm{RPM}<2000\\
0, & 2000\text{–}3500\\
+3, & 3500\text{–}5500\\
+1, & >5500
\end{cases}
\]

Set \(G_\mathrm{floor}\) around −24 dB and clamp the result near 0 dB. This produces a quiet cruise, a clearly audible moderate-load layer, and a much louder full-load sound without making every high-RPM condition loud.

## Comfort versus Sport/M modes

BMW’s public material supports **different sound specifications by operating program**, but does not give numeric mode offsets. For a game, use mode-dependent offsets approximately like this:

| Mode | Overall ASD level | Character |
|---|---:|---|
| Comfort / Efficient | −6 to −10 dB | Softer attack, less low-frequency reinforcement, quicker suppression on lift |
| Sport | −2 to +2 dB | Earlier gain rise, stronger midrange, more audible acceleration |
| Sport Plus / M mode | 0 to +3 dB | Highest sustained gain, sharper throttle-linked transients, more aggressive overrun |
| Individual | User-configurable | Derive from selected engine/drivetrain mode |

Sport should not merely add a constant volume offset. It should also:

- Increase gain at medium load
- Reduce the load threshold at which the sound becomes prominent
- Increase attack speed during throttle application
- Preserve more sound during gearshifts and overrun
- Add stronger harmonic or exhaust components

Comfort should retain some sound under genuine acceleration—BMW’s stated objective is still to communicate torque—but keep steady-state driving comparatively unobtrusive[3][5].

The F10 training information specifically describes Comfort as a comfort-oriented configuration and documents separate M-button configurations involving Sport and Sport Plus settings[9].

## Lift-off and overrun behavior

BMW’s public ASD description does not provide a published fade-time constant or dB-versus-time curve. A plausible implementation is a **fast attack and slower release**, with the release dependent on operating mode:

- Throttle opening: attack around 50–150 ms
- Sudden lift at high RPM: reduce the sustained engine layer by roughly 6–12 dB over 150–400 ms
- Closed-throttle deceleration: retain a quieter mechanical/exhaust layer, typically 10–18 dB below the corresponding full-load level
- Comfort: release toward the floor faster, roughly 100–250 ms
- Sport/M: retain overrun content longer, roughly 300–700 ms
- Downshift or rev-match: trigger a short transient rather than allowing a smooth fade

For a game, separate the sound into layers:

1. **Combustion/load layer** — strongly controlled by throttle and torque; fades quickly on lift.
2. **RPM/mechanical layer** — controlled mostly by RPM; remains audible during overrun.
3. **Exhaust/overrun layer** — activated by high RPM, closed throttle and deceleration; strongest in Sport/M.
4. **Shift and rev-match transients** — one-shot events with short attack and release.

A useful lift-off rule is:

\[
G(t)=G_\mathrm{overrun}
+
\left[G(0)-G_\mathrm{overrun}\right]e^{-t/\tau}
\]

where \(G(0)\) is the pre-lift gain and \(\tau\) is approximately 0.15–0.30 s in Comfort and 0.30–0.60 s in Sport/M.

## About absolute dB values

The available BMW and SAE material describes the control concept and perceptual objectives, but does not provide a public M5-specific calibration such as “85 dB at 4,000 rpm and 100% load.” SAE papers describe active sound design as modifying perceived engine sound and using systematic sound-character design, but their publicly visible summaries do not establish a factory F90/G90 SPL table[6][7].

Also, an absolute cabin dB figure would depend on:

- Microphone position
- Vehicle speed and road noise
- Audio-system volume
- Window and HVAC state
- Frequency weighting
- Individual vehicle coding and market specification
- Whether the measurement is at the driver’s ear, head restraint, or microphone input

Consequently, use the table above as **relative gain targets**, then calibrate the final result against recordings or measurements from the specific car. The defensible conclusion from BMW’s documentation is: **quiet at steady low-load operation, strongly load-responsive during acceleration, increasingly vivid across the RPM range, mode-dependent, and reduced—but not necessarily eliminated—during closed-throttle overrun**[3][10].

[1] BMW 5 Series Coding Options Guide | PDF - Scribd (https://www.scribd.com/document/959468697/BMW-5-Series)
[2] Weapon vs Creating: How Acoustic Engineering Transforms... (https://sonusgearflow.com/acousticengineering/weapon-vs-creating)
[3] Acoustics — intelligent solutions for more efficiency ... (https://www.press.bmwgroup.com/usa/article/detail/T0080736EN_US/acoustics-%E2%80%94-intelligent-solutions-for-more-efficiency-comfort-and-dynamics?language=en_US)
[4] Weapon vs Creating: How Acoustic Engineering Transforms... (https://sonusgearflow.com/acoustic-engineering/weapon-vs-creating)
[5] Acoustics — intelligent solutions for more efficiency, comfort and ... (https://www.press.bmwgroup.com/global/article/detail/T0080600EN/acoustics-%E2%80%94-intelligent-solutions-for-more-efficiency-comfort-and-dynamics?language=en)
[6] A Systematic Approach to Engine Sound Design for Enhancing ... (https://saemobilus.sae.org/articles/a-systematic-approach-engine-sound-design-enhancing-sound-character-active-sound-design-2017-01-1756)
[7] 2011-01-0927: Active Sound Design - Technical Paper - SAE Mobilus (https://saemobilus.sae.org/papers/active-sound-design-2011-01-0927)
[8] Carly Coding for BMW 8 series - Carly Blog (https://www.mycarly.com/blog/carly/carly-coding-for-bmw-8-series/)
[9] F10 M5 Complete Vehicle - Internet Archive (https://ia600902.us.archive.org/26/items/BMWTechnicalTrainingDocuments/ST1201%20F10%20M5%20Complete%20Vehicle/F10%20M5%20Complete%20Vehicle.pdf)
[10] Active Sound Design (https://ia600902.us.archive.org/26/items/BMWTechnicalTrainingDocuments/ST1204%20Active%20Sound%20Design/Active%20Sound%20Design.pdf)
