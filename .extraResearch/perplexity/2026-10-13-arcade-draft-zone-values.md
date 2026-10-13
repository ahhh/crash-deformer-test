A reliable, cross-series numerical answer is not available from the public documentation surfaced here. Most games expose drafting only as a gameplay effect, not as a documented collision volume with published dimensions. The strongest defensible summary is:

| Game/series | Publicly documented geometry and behavior |
|---|---|
| **Burnout 3, Revenge, Paradise** | Drafting is widely recognized as a gameplay mechanic, but no verified public values for cone length, width, activation delay, or speed gain were found in the available sources. The surfaced technical material discusses other handling systems, not drafting parameters.[3] |
| **Need for Speed: Hot Pursuit / Most Wanted** | No verified zone dimensions, timing, or boost values were found in the available results. These games generally present drafting as a temporary speed advantage rather than exposing a measurable HUD meter or documented physics volume. |
| **Mario Kart** | Player-facing guides describe a close-following requirement and a boost after “a few seconds,” but do not provide meters, car lengths, cone angle, or numerical speed gain.[6][8] The effect is therefore best described as a **short, vehicle-relative following zone**, not a documented world-space box. |
| **Ridge Racer V / 7 / 3D** | Drafting/slipstreaming is explicitly documented. The effect strengthens as the following vehicle gets closer; Ridge Racer 7 provides a HUD indicator and audio feedback.[2][9] If the player leaves the zone, the indicator can blink briefly before the gained speed is lost; Ridge Racer 3D changes this to a gradual speed loss.[2] No public meter-to-meters conversion, width, angle, activation time, or exact speed curve was found. One later Ridge Racer entry is reported to allow roughly **30 mph / 48 km/h above top speed**, but this should not be generalized to the whole series.[2] |
| **Split/Second** | No verified drafting-zone geometry or numeric gain was found in the available results. |
| **Blur** | No verified drafting-zone geometry, delay, or gain values were found in the available results. |
| **Wipeout** | No verified drafting-zone dimensions or universal slipstream timing were found. Values are likely game- and vehicle-specific, but no source surfaced that establishes them. |
| **Trackmania** | No verified public values for a drafting cone, activation delay, or gain were found. Different Trackmania releases and modes should not be assumed to use the same model. |
| **Forza Horizon** | No verified public values for the drafting volume or speed/acceleration curve were found in the available results. |
| **GRID** | No verified public values for zone dimensions, delay, gain, or decay were found in the available results. |

## What can be concluded safely

- **Shape:** The available documentation supports a vehicle-relative “behind the leader” test, especially for Mario Kart and Ridge Racer, but does not establish whether the implementation is a true aerodynamic cone, a rectangular trigger box, or a swept trail volume.
- **Trail following:** No surfaced source confirms that any of these systems follows the leader’s *past path*. The safer assumption is a continuously evaluated zone attached to the leading vehicle, unless game-code inspection proves otherwise.
- **Activation:** Mario Kart guides consistently describe a delay of “a few seconds.” Ridge Racer exposes a progress-like indicator, but no duration is specified.[2][6][8]
- **Distance dependence:** Ridge Racer’s effect increases as the vehicles get closer, indicating a distance-weighted function rather than a simple on/off trigger.[2]
- **Leaving the zone:** Ridge Racer has documented post-slipstream persistence: the indicator blinks briefly, then the accumulated speed is lost; Ridge Racer 3D applies that loss gradually.[2]
- **Exact numbers:** The requested meters, car lengths, fan angles, acceleration gains, and decay constants require executable instrumentation, memory inspection, decompilation, or game-file analysis. They are not provided by the sources available here.

The only concrete numerical value surfaced is Ridge Racer’s reported **48 km/h maximum excess over top speed** in one iteration; it is not evidence for a common Ridge Racer or arcade-racing standard.[2]

[1] Slipstream (https://www.mariowiki.com/Slipstream)
[2] Slipstream (https://ridgeracer.fandom.com/wiki/Slipstream)
[3] github.com › pronitdas › game-physics-skillgame-physics-skill/arcade-tricks.md at main · pronitdas/game ...... (https://github.com/pronitdas/game-physics-skill/blob/main/arcade-tricks.md)
[4] Ridge Racer (https://allthetropes.org/wiki/Ridge_Racer)
[5] Best Slipstream Mods 2026 — Top 25 + Install Guide, Free | discovermods (https://discovermods.com/slipstream/)
[6] Drafting - Mario Kart 8 Guide - IGN (https://www.ign.com/wikis/mario-kart-8/Drafting)
[7] Slip Stream (Brazil 950515) [slipstrm] - MAME - Emu-land (https://www.emu-land.net/en/arcade/mame/roms/slipstrm)
[8] Snaking (https://strategywiki.org/wiki/Mario_Kart_DS/Driving_techniques)
[9] Music (https://ridgeracer.fandom.com/wiki/Ridge_Racer_7)
[10] Ridge Racer - Wikipedia (https://en.wikipedia.org/wiki/Ridge_Racer)
