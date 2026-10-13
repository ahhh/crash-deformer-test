import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { HighlightClip } from "../match/highlights.ts";
import { NET_VERSION } from "./codec.ts";
import { carLayout } from "./car-pose.ts";
import { decodeSaved, encodeSaved, packReel, savedPlayable, unpackReel } from "./reel-codec.ts";
import { makeClip, sameClip } from "./reel-clip.test-util.ts";

describe("given a recorded highlight clip and the codec that sends and saves it", () => {
  it("when a reel of two clips is packed into a reel message and unpacked, then it comes back byte for byte with its seed and start time", async () => {
    const { clip, car } = makeClip();
    const msg = await packReel({ seed: 0xdeadbeef, clips: [clip, clip] }, 1234.5);
    const got = await unpackReel(msg, carLayout(car));
    assert.equal(got.reel.seed, 0xdeadbeef);
    assert.equal(got.startAt, 1234.5);
    assert.equal(got.reel.clips.length, 2);
    sameClip(got.reel.clips[1]!, clip);
  });

  it("when a saved clip is encoded and decoded, then it decodes to the same clip", async () => {
    const { clip, car } = makeClip();
    const got = await decodeSaved(await encodeSaved(clip), carLayout(car));
    assert.notEqual(typeof got, "string", `decoded as ${String(got)}`);
    sameClip(got as HighlightClip, clip);
  });

  it("when a saved clip is decoded after a version byte is changed or the data damaged, then another build's clip is refused as 'version' and a damaged, truncated or non-base64 one as 'corrupt'", async () => {
    const { clip, car } = makeClip();
    const L = carLayout(car);
    const bytes = Uint8Array.from(atob(await encodeSaved(clip)), (c) => c.charCodeAt(0));
    const recode = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
    const edited = (at: number, v: number): string => {
      const b = bytes.slice();
      b[at] = v;
      return recode(b);
    };
    assert.equal(await decodeSaved(edited(4, bytes[4]! + 1), L), "version", "another REPLAY_VERSION");
    assert.equal(await decodeSaved(edited(6, NET_VERSION + 1), L), "version", "another NET_VERSION");
    assert.equal(await decodeSaved(edited(7, bytes[7]! ^ 0xff), L), "version", "another sim fingerprint");
    assert.equal(await decodeSaved(edited(0, 0), L), "corrupt", "not a clip");
    assert.equal(await decodeSaved(recode(bytes.subarray(0, bytes.length - 40)), L), "corrupt", "truncated");
    assert.equal(await decodeSaved("%%%", L), "corrupt", "not base64");
  });

  it("when a saved clip's header is checked alone, then this build's passes and every other version, fingerprint or damage fails, whatever follows the 11 header bytes", async () => {
    const { clip } = makeClip();
    const text = await encodeSaved(clip);
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    const recode = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
    const edited = (at: number, v: number): string => {
      const b = bytes.slice();
      b[at] = v;
      return recode(b);
    };
    assert.equal(savedPlayable(text), true);
    assert.equal(savedPlayable(recode(bytes.subarray(0, 11))), true, "the header alone is enough");
    assert.equal(savedPlayable(edited(4, bytes[4]! + 1)), false, "another REPLAY_VERSION");
    assert.equal(savedPlayable(edited(6, NET_VERSION + 1)), false, "another NET_VERSION");
    assert.equal(savedPlayable(edited(7, bytes[7]! ^ 0xff)), false, "another sim fingerprint");
    assert.equal(savedPlayable(edited(0, 0)), false, "not a clip");
    assert.equal(savedPlayable(recode(bytes.subarray(0, 6))), false, "truncated inside the header");
    assert.equal(savedPlayable("%%%"), false, "not base64");
    assert.equal(savedPlayable(""), false);
  });
});
