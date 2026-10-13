import { loadManifest, trackUrl, type MusicTrack } from "./music-manifest.ts";
import { firstTrack, nextTrack } from "./playlist.ts";

/**
 * The soundtrack: one streaming `<audio>` element (nothing is decoded into a buffer) routed into the music bus. The track list
 * is the music folder's `manifest.json` (docs/DEPLOY.md); it is fetched the first time the music plays, so a game that never
 * turns audio on never asks for it. A missing or bad manifest, or files that will not load, leave the game silent and unharmed.
 */
export class MusicPlayer {
  private readonly element = new Audio();
  private readonly source: MediaElementAudioSourceNode;
  private readonly base: string;
  private tracks: readonly MusicTrack[] = [];
  private index = -1;
  private loading = false;
  /** Whether the music should be playing (audio on, tab visible): a manifest that arrives late starts only then. */
  private wanted = false;
  /** Tracks that failed in a row; once every track has, the music stops until the next play. */
  private failures = 0;
  private readonly onEnded = (): void => {
    this.failures = 0;
    this.startTrack(nextTrack(this.index, this.tracks.length));
  };
  private readonly onError = (): void => {
    console.warn("music: track failed", this.tracks[this.index]?.file, this.element.error?.message);
    this.failures++;
    if (this.failures < this.tracks.length) this.startTrack(nextTrack(this.index, this.tracks.length));
  };

  constructor(context: AudioContext, destination: AudioNode, base: string) {
    this.base = base;
    // The element is cross-origin when `VITE_MUSIC_BASE` points off-site: without CORS the Web Audio graph would get silence.
    // The empty string is the attribute's "anonymous" state (no credentials).
    this.element.crossOrigin = "";
    this.element.preload = "none";
    this.element.addEventListener("ended", this.onEnded);
    this.element.addEventListener("error", this.onError);
    this.source = context.createMediaElementSource(this.element);
    this.source.connect(destination);
  }

  /** Starts the music (first time: fetches the manifest, then plays a random track) or resumes it. */
  play(): void {
    this.wanted = true;
    if (this.tracks.length === 0) {
      if (!this.loading) void this.load();
    } else if (this.index < 0) {
      this.startTrack(firstTrack(this.tracks.length, Math.random()));
    } else if (this.failures >= this.tracks.length) {
      this.failures = 0;
      this.startTrack(this.index);
    } else {
      this.playElement();
    }
  }

  /** Pauses where it is: the next `play()` goes on from the same second. */
  pause(): void {
    this.wanted = false;
    this.element.pause();
  }

  dispose(): void {
    this.wanted = false;
    this.element.removeEventListener("ended", this.onEnded);
    this.element.removeEventListener("error", this.onError);
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.source.disconnect();
  }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      this.tracks = await loadManifest(this.base);
    } catch (reason) {
      console.warn("music: no soundtrack", reason);
    }
    this.loading = false;
    if (this.wanted && this.tracks.length > 0) this.play();
  }

  private startTrack(index: number): void {
    this.index = index;
    this.element.src = trackUrl(this.base, this.tracks[index]!);
    this.playElement();
  }

  private playElement(): void {
    this.element.play().catch((reason: unknown) => {
      // A pause or a new source right after play() aborts it, and a file that will not load rejects it as unsupported while
      // the element's `error` event (`onError`) reports that: neither is a second failure.
      if (reason instanceof DOMException && (reason.name === "AbortError" || reason.name === "NotSupportedError")) return;
      console.warn("music: play failed", reason);
    });
  }
}
