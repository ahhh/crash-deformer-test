/** Names several scene files and their consumers share. */

/** The ground stack's levels that are not a road or terrain surface (`SURFACE`, world): `ground-stack.ts` lists every level in draw order. */
export const GROUND_LEVEL = {
  terrain: "terrain",
  deck: "deck",
  runoff: "runoff",
  marking: "marking",
  kerb: "kerb",
  decal: "decal",
  glow: "glow",
} as const;

/** The Lab's preset ids (`LabPresetId`): `LAB_PRESETS` in lab.ts lists them in picker order, and the engine, the bench plan and the HUD name the one that is up. */
export const LAB_PRESET = { pad: "pad", wall: "wall", cards: "cards", glass: "glass" } as const;
