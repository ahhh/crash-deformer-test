import { clipTitle, type HighlightClip } from "../match/highlights.ts";
import type { SavedHud, SaveResult } from "../match/types.ts";
import { encodeSaved, savedPlayable } from "../net/reel-codec.ts";

/** `localStorage` keys: the index (JSON `SavedHud[]`, newest first) and one entry per clip under `CLIP_PREFIX` + key. */
const INDEX = "crush.highlights";
const CLIP_PREFIX = "crush.highlight.";
/** Caps in UTF-16 chars (what `localStorage` quotas count): one clip, and all saved clips together. */
const CLIP_MAX_CHARS = 300_000;
const TOTAL_MAX_CHARS = 2_000_000;

type Entry = SavedHud & { chars: number };

function readIndex(): Entry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(INDEX) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is Entry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.key === "string" &&
        typeof e.title === "string" &&
        typeof e.trackName === "string" &&
        typeof e.savedAt === "number" &&
        typeof e.chars === "number",
    );
  } catch {
    return [];
  }
}

/** Whether the player keeps outdated clips out of the list by purging them as soon as they are seen (`"1"`: yes). A preference, so it lives here. */
const AUTO_PURGE = "crush.highlights.autoPurge";

export function autoPurge(): boolean {
  try {
    return localStorage.getItem(AUTO_PURGE) === "1";
  } catch {
    return false;
  }
}

export function setAutoPurge(on: boolean): void {
  try {
    localStorage.setItem(AUTO_PURGE, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

/** Whether this build can replay the entry's clip (`savedPlayable`: the header alone); a clip gone from storage cannot. */
const playable = (e: Entry): boolean => savedPlayable(localStorage.getItem(CLIP_PREFIX + e.key) ?? "");

/** Drop every entry of `index` not in `keep`: its clip, then the index row. */
function purge(index: Entry[], keep: Entry[]): void {
  for (const e of index) if (!keep.includes(e)) localStorage.removeItem(CLIP_PREFIX + e.key);
  localStorage.setItem(INDEX, JSON.stringify(keep));
}

/** Delete every saved clip this build cannot replay (docs/HIGHLIGHTS.md "Outdated clips"); the playable ones stay. */
export function purgeOutdated(): void {
  const index = readIndex();
  const keep = index.filter(playable);
  if (keep.length < index.length) purge(index, keep);
}

/**
 * This browser's replayable highlights, newest first, and how many outdated ones (another replay, net or sim version, or no clip left)
 * are not listed. With `autoPurge` set those are deleted here and the count is 0.
 */
export function listSaved(): { saved: SavedHud[]; outdated: number } {
  const index = readIndex();
  const keep = index.filter(playable);
  let outdated = index.length - keep.length;
  if (outdated > 0 && autoPurge()) {
    purge(index, keep);
    outdated = 0;
  }
  return { saved: keep.map(({ key, title, trackName, savedAt }) => ({ key, title, trackName, savedAt })), outdated };
}

/**
 * Keep `clip` (docs/HIGHLIGHTS.md "Saving"): refused when its text passes `CLIP_MAX_CHARS`, when all saved clips would
 * pass `TOTAL_MAX_CHARS` (nothing is evicted: a saved clip is the player's), or when the browser's quota throws.
 */
export async function saveClip(clip: HighlightClip, trackName: string): Promise<SaveResult> {
  const text = await encodeSaved(clip);
  if (text.length > CLIP_MAX_CHARS) return "too big";
  const index = readIndex();
  if (index.reduce((a, e) => a + e.chars, 0) + text.length > TOTAL_MAX_CHARS) return "full";
  const savedAt = Date.now();
  const key = `${savedAt.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  try {
    localStorage.setItem(CLIP_PREFIX + key, text);
    localStorage.setItem(INDEX, JSON.stringify([{ key, title: clipTitle(clip), trackName, savedAt, chars: text.length }, ...index]));
    return "saved";
  } catch {
    localStorage.removeItem(CLIP_PREFIX + key);
    return "failed";
  }
}

/** A saved clip's stored text (`decodeSaved` reads it), null when gone. */
export function loadSaved(key: string): string | null {
  return localStorage.getItem(CLIP_PREFIX + key);
}

export function deleteSaved(key: string): void {
  localStorage.removeItem(CLIP_PREFIX + key);
  localStorage.setItem(INDEX, JSON.stringify(readIndex().filter((e) => e.key !== key)));
}
