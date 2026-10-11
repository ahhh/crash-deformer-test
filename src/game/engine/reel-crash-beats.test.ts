import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setGround } from "../world/ground.ts";
import { parseTrack } from "../world/track-schema.ts";
import { Track } from "../world/track.ts";
import city from "../world/tracks/city.json" with { type: "json" };
import stunt from "../world/tracks/stunt.json" with { type: "json" };
import { clipTitle, type HighlightClip } from "../match/highlights.ts";
import { crashCamEnd, CUTS } from "../present/engine-cine.ts";
import { raceOn, recordRace, reelViews, type Crash, type RigSample } from "./reel-view.test-util.ts";

/** A replayed frame is one 1/60 s step of the reel's wall clock. */
const FRAME = 1 / 60;
/** The city's straightest 60 m (arc length, m): a staged chain's three cars stand in line on it. */
const STRAIGHT = 592;
const LAP = new Track(parseTrack(city)).length;

/**
 * Owner, 2026-10-10: "the slomo highlights crashes used to stick on the crashes a bit longer before going to a flying ragdoll,
 * where it only goes to following the ragdolls after the 2nd/3rd crash gets its camera focus highlight showing the live
 * deformation". A clip's crash shots are the crash cam's window (its first cut to `crashCamEnd` of the clip's slow-mo hold)
 * and a hit beat for each impact of the clip's scope.
 */
type Played = { clip: HighlightClip; frames: RigSample[] };

/** The clips of a race with `staged` crashes on the city, each with the rig that held every frame of it. */
async function play(name: string, staged: Crash[]): Promise<Played[]> {
  const track = new Track(parseTrack(city));
  const w = raceOn("city", 7, 7);
  const rec = recordRace(w, track, staged, 16);
  const trace: RigSample[] = [];
  await reelViews(w, rec.clips, name, undefined, trace);
  w.race.exit();
  setGround(null);
  return rec.clips.map((clip, i) => ({ clip, frames: trace.filter((s) => s.clip === i) }));
}

/** Wall s into the clip's timeline at which the replay shows clip time `t` (the first frame that reaches it). */
function wallOf(frames: readonly RigSample[], t: number): number {
  return frames.find((f) => f.at >= t - 1e-9)!.wall;
}

/** The crash cam's window on the clip's timeline: from its first cut to its hand-back (`crashCamEnd` of the hold the frame carried). */
function crashWindow(frames: readonly RigSample[]): { from: number; until: number } | null {
  const first = frames.find((f) => f.rig === "crash");
  return first ? { from: first.wall, until: first.wall + crashCamEnd(first.hold) - CUTS[0] } : null;
}

describe("given highlight clips of a head-on that throws both drivers, and of a car at 40 and at 70 m/s into a chain of two stopped cars, replayed through the reel's cameras", () => {
  const played = Promise.all([
    play("headOn", [{ kind: "headOn", at: 0.22 * LAP, speed: 20 }]),
    play("chain6", [{ kind: "chain", at: STRAIGHT, speed: 40, gap: 6, cars: [1, 2, 3] }]),
    play("chain5", [{ kind: "chain", at: STRAIGHT, speed: 70, gap: 5, cars: [1, 2, 3] }]),
  ]).then((all) => all.flat());

  it("when a driver is thrown inside the crash shots, then the ride-along follows him only from the crash cam's hand-back, and never before the clip's last impact", async () => {
    const rides = (await played).filter((p) => p.frames.some((f) => f.rig === "ride"));
    assert.ok(rides.length >= 1, "a clip with a thrown driver to follow");
    for (const { clip, frames } of rides) {
      const win = crashWindow(frames)!;
      const start = frames.find((f) => f.rig === "ride")!.wall;
      assert.ok(start >= win.until - FRAME, `${clipTitle(clip)}: the ride began at ${start.toFixed(2)} s, the crash cam holds until ${win.until.toFixed(2)} s`);
      const last = wallOf(frames, clip.hits[clip.hits.length - 1]!.t);
      assert.ok(start >= last, `${clipTitle(clip)}: the ride began at ${start.toFixed(2)} s, before the last impact at ${last.toFixed(2)} s`);
      assert.ok(
        frames.every((f) => f.rig !== "crash" || f.wall < start),
        `${clipTitle(clip)}: a crash shot after the ride began`,
      );
    }
  });

  it("when a later impact of the clip's scope lands inside the crash cam's window, then the crash cam, not the chase shot or the ride, is on the camera at that impact", async () => {
    let inside = 0;
    for (const { clip, frames } of await played) {
      const win = crashWindow(frames);
      if (!win) continue;
      for (const h of clip.hits.slice(1)) {
        const at = wallOf(frames, h.t);
        if (at < win.from || at >= win.until) continue;
        inside++;
        const f = frames.find((x) => x.wall >= at)!;
        assert.equal(f.rig, "crash", `${clipTitle(clip)}: the impact at ${at.toFixed(2)} s (crash window ${win.from.toFixed(2)} to ${win.until.toFixed(2)} s) was on ${f.rig}`);
      }
    }
    assert.ok(inside >= 1, "a clip with a later impact inside the crash cam's window");
  });

  it("when the crash cam's window is open, then no frame of it falls to the chase shot while a cut has an eye on the hit", async () => {
    for (const { clip, frames } of await played) {
      const win = crashWindow(frames);
      if (!win) continue;
      const gaps = frames.filter((f) => f.wall >= win.from && f.wall < win.until && f.rig !== "crash");
      assert.deepEqual(
        gaps.map((f) => f.wall.toFixed(2)),
        [],
        `${clipTitle(clip)}: frames of the crash cam's window ${win.from.toFixed(2)} to ${win.until.toFixed(2)} s on another camera`,
      );
    }
  });
});

/**
 * Staged crashes on the stunt course, whose road climbs and drops: a wall hit on a kicker 9 m up, and a driver thrown 46 m onto
 * a wall one second after the hit before it. The crash cam begins a second or more before the car reaches its hit (on the way
 * up the kicker, then 9 m lower, or the pair 46 m from the next point), so it is aimed at the recorded point, and the context
 * shot for the far hit has an eye level with the two points (`CONTEXT.eyes`).
 */
describe("given highlight clips of a wall hit on the stunt course's kicker and of a driver thrown 46 m after a hit on its deck, replayed through the reel's cameras", () => {
  const len = new Track(parseTrack(stunt)).length;
  const sheet = (shift: number): Crash[] => [
    { kind: "headOn", at: len * (0.22 + shift), speed: 20 },
    { kind: "wall", at: len * (0.38 + shift), speed: 24, side: 1 },
    { kind: "tBone", at: len * (0.55 + shift), speed: 22 },
    { kind: "headOn", at: len * (0.7 + shift), speed: 22 },
    { kind: "wall", at: len * (0.86 + shift), speed: 24, side: -1 },
  ];
  /** Every first impact, later hit and throw of the staged crashes' clips, as the reel's cameras show them. */
  const seen = async (shift: number): Promise<{ title: string; kind: string; at: number; rig: string; ndc: string }[]> => {
    const w = raceOn("stunt", 3, 7);
    const rec = recordRace(w, new Track(parseTrack(stunt)), sheet(shift), 20);
    const views = await reelViews(w, rec.clips, `stunt +${shift}`);
    w.race.exit();
    setGround(null);
    return views.filter((v) => !v.seen).map((v) => ({ title: v.title, kind: v.kind, at: v.at, rig: v.rig, ndc: `${v.ndcX.toFixed(2)},${v.ndcY.toFixed(2)}${v.clear ? "" : " blocked"}, share ${v.share.toFixed(3)}` }));
  };

  it("when a car hits the wall on the kicker 9 m above where its clip starts, then the crash cam's first cut has the hit in its frame", async () => {
    assert.deepEqual(await seen(0), [], "moments out of the frame");
  });

  it("when a driver thrown by a hit lands 46 m on against a wall inside a second, then the later hit has an eye that keeps it and the first hit's point in one frame", async () => {
    assert.deepEqual(await seen(0.03), [], "moments out of the frame");
  });
});
