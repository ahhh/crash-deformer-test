import { Choice, Stepper } from "@/components/race-rows";
import { KNOB_RANGES } from "@/game/hud/hud-store";

/** One pad or arrow press moves a volume by this much (the settings panel's sliders step 0.01). */
const VOLUME_STEP = 0.05;

/** The sound settings the race menus show: the HUD's values and the engine's own setters, the same ones the settings panel's rows call. */
export interface AudioLevels {
  on: boolean;
  music: number;
  engines: number;
  onToggle: () => void;
  onMusic: (value: number) => void;
  onEngines: (value: number) => void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Audio on/off and the music and engine volumes as rows of a race menu: the modal covers the settings panel, so the sound is set here. */
export function AudioRows({ audio }: { audio: AudioLevels }) {
  return (
    <>
      <Choice label="Sound" off="Off" on="On" value={audio.on} onSet={audio.onToggle} />
      <Stepper label="Music" value={audio.music} min={KNOB_RANGES.musicVolume.min} max={KNOB_RANGES.musicVolume.max} step={VOLUME_STEP} shown={percent(audio.music)} slider onSet={audio.onMusic} />
      <Stepper label="Engines" value={audio.engines} min={KNOB_RANGES.engineVolume.min} max={KNOB_RANGES.engineVolume.max} step={VOLUME_STEP} shown={percent(audio.engines)} slider onSet={audio.onEngines} />
    </>
  );
}
