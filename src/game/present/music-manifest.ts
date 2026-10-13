import { z } from "zod";

/** The manifest's file name inside the music folder, beside the mp3s it lists. */
const MANIFEST_FILE = "manifest.json";
/** The music folder under the app's base path (`APP_BASE`); `VITE_MUSIC_BASE` replaces the whole base at build time (docs/DEPLOY.md). */
const MUSIC_FOLDER = "music/";
/** Lowercase kebab-case mp3 names: the folder is served as plain files, so the names stay URL-safe and the same on every file system. */
const FILE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.mp3$/;
const LINK_PATTERN = /^https?:\/\/\S+$/;

const trackSchema = z.object({
  file: z.string().regex(FILE_PATTERN),
  artist: z.string().min(1),
  title: z.string().min(1),
  /** The credit text, one line each, shown verbatim above the links ("Song: ...", "Music provided by ..."). */
  attribution: z.array(z.string().min(1)),
  /** `label: url` credit lines, shown after the attribution as links ("Free Download/Stream", "Watch"). */
  links: z.array(z.object({ label: z.string().min(1), url: z.string().regex(LINK_PATTERN) })),
});

const manifestSchema = z
  .object({ tracks: z.array(trackSchema) })
  .refine((manifest) => new Set(manifest.tracks.map((track) => track.file)).size === manifest.tracks.length, { message: "duplicate file" });

export type MusicTrack = z.infer<typeof trackSchema>;

/** The parts of Vite's `import.meta.env` the music base reads (undefined where there is no Vite, e.g. node tests). */
interface MusicEnv {
  BASE_URL?: string;
  VITE_MUSIC_BASE?: string;
}

/** The folder URL (ending in `/`) the manifest and the mp3s are served from: `VITE_MUSIC_BASE` when set, else `<APP_BASE>music/`. */
export function musicBase(env: MusicEnv | undefined): string {
  const override = env?.VITE_MUSIC_BASE;
  if (override) return override.endsWith("/") ? override : `${override}/`;
  return `${env?.BASE_URL ?? "/"}${MUSIC_FOLDER}`;
}

/** The URL of one mp3 of the folder at `base`. */
export function trackUrl(base: string, track: MusicTrack): string {
  return `${base}${track.file}`;
}

/** Fetches and validates `<base>manifest.json`. Rejects when it is missing, not JSON or not a manifest (the caller warns and plays no music). */
export async function loadManifest(base: string): Promise<readonly MusicTrack[]> {
  const response = await fetch(`${base}${MANIFEST_FILE}`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`music manifest: HTTP ${response.status}`);
  return manifestSchema.parse(await response.json()).tracks;
}
