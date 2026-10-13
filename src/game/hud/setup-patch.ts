import type { RaceOptions } from "../match/types.ts";

/**
 * What the race setup's course cards and Select all send. The HUD snapshot a menu renders from is up to a publish old, and
 * `options` merges a patch over the engine's own options: a patch must carry only the keys its control owns, or it writes
 * the snapshot's old values back over a change made since (a map tapped right after Laps reverted Laps).
 */

/** A tap on a course card: the course itself in Single race, the campaign's order with the course ticked (at the end) or unticked in Campaign. */
export function courseTap(o: Pick<RaceOptions, "mode" | "campaign">, id: string): Partial<RaceOptions> {
  if (o.mode !== "campaign") return { trackId: id };
  return { campaign: o.campaign.includes(id) ? o.campaign.filter((x) => x !== id) : [...o.campaign, id] };
}

/** Select all / Unselect all: every course in the menu's order, or none when all are ticked already. */
export function selectAll(o: Pick<RaceOptions, "campaign">, all: readonly string[]): Partial<RaceOptions> {
  return { campaign: all.every((id) => o.campaign.includes(id)) ? [] : all };
}
