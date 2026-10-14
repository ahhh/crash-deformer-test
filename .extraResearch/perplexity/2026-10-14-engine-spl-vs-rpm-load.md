There is no single reliable published dataset giving **interior and exterior dB(A) at identical RPM/load points** for the BMW M3/M5, AMG models, Corvette, and Mustang GT. The figures below are therefore **engineering-grade typical ranges**, not homologation values or directly comparable instrumented tests. Microphone position, exhaust mode, gear, road surface, distance, wind, and meter time weighting can easily change results by 3–10 dB.

## Typical measured ranges

Approximate A-weighted sound-pressure levels for modern performance cars:

| Operating condition | Interior, driver’s ear | Exterior, nearby roadside microphone |
|---|---:|---:|
| Warm idle, exhaust quiet/normal | 48–60 dB(A) | 55–65 dB(A) at 1 m |
| Warm idle, loud/valved exhaust | 58–70 dB(A) | 65–75 dB(A) at 1 m |
| Part-throttle cruise, 1,500–2,500 rpm | 58–70 dB(A) | 62–75 dB(A) |
| Part-throttle cruise, 3,000–4,000 rpm | 65–78 dB(A) | 70–82 dB(A) |
| WOT, 3,000–4,000 rpm | 78–92 dB(A) | 88–102 dB(A) |
| WOT near redline | 84–100 dB(A) | 95–110 dB(A) |
| Closed-throttle overrun | 60–82 dB(A) | 68–95 dB(A) |
| Track-oriented cars with little insulation | 95–108 dB(A) interior | 105–120 dB(A) at close range |

These ranges broadly fit published magazine observations: one cited comparison reports approximately **88 dB inside a BMW M3** and **108 dB inside a Porsche 911 GT3 RS**, although those are test-specific figures rather than a universal model rating.[3]

A useful model-by-model approximation is:

| Car family | Interior WOT near redline | Exterior WOT near redline |
|---|---:|---:|
| BMW M3/M5, quiet road mode | 82–92 dB(A) | 90–100 dB(A) |
| BMW M3/M5, loud mode | 88–98 dB(A) | 98–108 dB(A) |
| Mercedes-AMG V8/V6 | 88–100 dB(A) | 98–112 dB(A) |
| Corvette V8 | 86–98 dB(A) | 96–110 dB(A) |
| Mustang GT | 84–97 dB(A) | 94–108 dB(A) |

## WOT versus part throttle

At the **same RPM and gear**, WOT is typically:

- **Interior:** about **8–18 dB(A) louder**
- **Exterior:** about **10–20 dB(A) louder**
- With an opening exhaust valve, downshift, or ignition-cut overrun: occasionally **20–30 dB(A) louder**

A representative curve at 3,500 rpm might be:

| Load | Interior | Exterior |
|---|---:|---:|
| Light cruise | 66 dB(A) | 73 dB(A) |
| Medium load | 72 dB(A) | 81 dB(A) |
| WOT | 86 dB(A) | 98 dB(A) |

The difference is not caused by RPM alone. At fixed RPM, WOT increases cylinder filling, combustion energy, exhaust mass flow, intake noise, and often opens exhaust valves. Throttle position therefore needs to be an independent audio-control parameter.

## RPM scaling

Engine sound does not rise at a fixed dB-per-RPM rate. A practical approximation for a continuously loaded engine is:

- **Idle to 2,000 rpm:** roughly 3–6 dB per 1,000 rpm
- **2,000–4,000 rpm:** roughly 4–7 dB per 1,000 rpm
- **4,000 rpm to redline:** roughly 2–5 dB per 1,000 rpm, because exhaust, intake, and cabin saturation become important

In terms of doubling RPM:

- Mechanical order-related components often rise approximately **5–9 dB per RPM doubling**
- Exhaust-flow-dominated sound commonly rises approximately **6–12 dB per doubling**
- A real vehicle usually shows only **4–8 dB per doubling** at the microphone because of resonances, masking, gear changes, valves, and frequency-dependent A-weighting

A reasonable synthesized engine-audio law is therefore:

\[
L_{\mathrm{RPM}} = L_0 + 6\log_2\left(\frac{\mathrm{RPM}}{\mathrm{RPM}_0}\right)
\]

with an additional load term:

\[
L = L_{\mathrm{RPM}} + 10\text{ to }16\ \mathrm{dB}\cdot f(\text{load})
\]

where \(f(\text{load})\) rises from 0 at closed throttle to 1 at WOT.

## Idle-to-redline dynamic range

Typical overall dynamic ranges are:

- **Interior, quiet road car:** 25–35 dB(A)
- **Interior, loud mode:** 30–42 dB(A)
- **Exterior at a fixed close microphone:** 35–50 dB(A)
- **Closed throttle to WOT at the same RPM:** commonly 10–20 dB(A)

For example, a car producing 55 dB(A) at idle and 92 dB(A) at high-RPM WOT has a **37 dB(A) idle-to-redline range**. Because decibels are logarithmic, that represents roughly 70 times the sound-pressure amplitude ratio, not merely a 37% increase.

## Why exterior figures are difficult to compare

Legal pass-by tests are not equivalent to “maximum exhaust loudness.” They use prescribed microphone locations, vehicle speeds, gears, acceleration procedures, and track surfaces. ISO 362 and UN/ECE Regulation 51 procedures measure exterior vehicle noise under standardized conditions, including full-load acceleration and coast/partial-load conditions.[2][5]

EU passenger-car pass-by limits have been reduced in stages from approximately **74 dB(A)** toward **68 dB(A)**, with an intermediate **72 dB(A)** limit applying in earlier phases.[4][5] The regulation is a type-approval metric, not a cap on every instantaneous exhaust event; a car can produce much higher levels at close range, during transient events, or in non-certification modes.

Track limits are also separate from road homologation. Published track examples commonly use static limits around 100–105 dB(A) and drive-by limits around 95–102 dB(A), but these values depend on the circuit and measurement protocol.[3]

## How racing games usually implement engine audio

The common approach in Forza-, Gran Turismo-, and Assetto Corsa-style systems is not one sample whose pitch is simply driven by RPM. It is usually a layered system with:

- Separate **on-load** and **off-load/coast** recordings
- Multiple RPM loop regions
- Crossfades between neighboring RPM layers
- Load- or throttle-dependent gain
- Intake, exhaust, turbo, transmission, tire, and mechanical layers
- Separate interior and exterior mix buses
- Reverb, occlusion, Doppler, and camera-dependent filtering

A simplified implementation might use:

| Parameter | Typical audio behavior |
|---|---|
| RPM | Controls sample selection, playback position, or pitch |
| Throttle/load | Crossfades from coast to loaded engine layers |
| WOT | Adds roughly 6–15 dB to engine/exhaust layers |
| Closed throttle | Reduces combustion layer and emphasizes mechanical/exhaust overrun |
| Exhaust valve | Adds a filtered high-frequency layer or gain offset |
| Interior camera | Low-pass filtering, cabin resonance, and reduced exhaust level |
| Exterior camera | More exhaust/intake energy and less cabin filtering |
| Gear/load transient | Short acceleration, shift, lift, and backfire samples |

For Assetto Corsa, publicly documented mod configurations show separate internal and external RPM parameters and RPM remapping, demonstrating that sample playback can be independently calibrated for the cabin and exterior views.[6][8] Community implementation guides also describe looped engine banks, separate transmission and environmental banks, and recorded or synthesized source layers.[7]

A practical game-audio gain map could be:

\[
G_{\mathrm{engine}} =
G_{\mathrm{RPM}} +
G_{\mathrm{load}} +
G_{\mathrm{camera}} +
G_{\mathrm{exhaust\ mode}}
\]

Example values:

- Idle base: \(-12\) dB relative to WOT redline
- Part-throttle: \(-8\) to \(-5\) dB
- Medium load: \(-4\) to \(-2\) dB
- WOT: \(0\) dB reference
- Closed throttle: combustion layer \(-12\) to \(-20\) dB, mechanical/overrun layer enabled
- Loud exhaust mode: \(+3\) to \(+6\) dB, usually with more high-frequency content
- Interior view: exhaust layer \(-5\) to \(-12\) dB plus cabin filtering
- Exterior view: exhaust layer \(0\) to \(+6\) dB

The most convincing result is usually a **load crossfade**, not a simple volume switch. At the same RPM, the game should retain a quieter coast sample while gradually introducing the loaded/WOT sample, with separate transient layers for throttle lift, shifts, compressor flutter, exhaust pops, and valve actuation. That reproduces the real-world observation that WOT is often 10–20 dB louder than cruise at the same RPM, while preserving the distinct tonal change caused by cylinder load and exhaust flow.

[1] Browse Topic: Noise pollution - SAE Mobilus - SAE International (https://saemobilus.sae.org/topics/environment/noise-pollution)
[2] Browse Topic: Exterior noise - SAE Mobilus (https://saemobilus.sae.org/topics/noise-vibration-and-harshness-nvh/noise/exterior-noise)
[3] Porsche 911 GT3 Noise Limits: Decibels, Tracks & Road Rules (https://fisherluxuryrental.com/porsche-911-gt3-sound-levels-noise-limits)
[4] REGULATION (EU) No 540/ 2014 OF THE EUROPEAN PARLIAMENT AND ... (https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32014R0540)
[5] [PDF] Simcenter pass-by noise engineering - Siemens (https://www.plm.automation.siemens.com/media/global/en/Siemens%20SW%20Simcenter%20Solutions%20for%20Pass-by%20noise%20Engineering%20-%20Brochure_tcm27-64997.pdf)
[6] Assetto Corsa PC Mods General Discussion | Page 5058 - GTPlanet (https://www.gtplanet.net/forum/threads/assetto-corsa-pc-mods-general-discussion.307899/page-5058)
[7] github.com › Lilicris12 › assetto-corsa-car-modsassetto-corsa-car-mods/MODDING_GUIDE.md at main - GitHub (https://github.com/Lilicris12/assetto-corsa-car-mods/blob/main/MODDING_GUIDE.md)
[8] Assetto Corsa PC Mods General Discussion | Page 4778 - GTPlanet (https://www.gtplanet.net/forum/threads/assetto-corsa-pc-mods-general-discussion.307899/page-4778)
[9] EN (https://eur-lex.europa.eu/LexUriServ/LexUriServ.do?uri=COM:2011:0856:FIN:EN:PDF)
[10] Pass-by noise engineering: a review of different transfer (https://past.isma-isaac.be/downloads/isma2014/papers/isma2014_0482.pdf)
