import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

/** The studio environment every FX tier lights the cars with (`scripts/bake-env.mjs` bakes it from three's RoomEnvironment). */
export const STUDIO_ENV_URL = `${import.meta.env?.BASE_URL ?? "/"}env-studio.hdr`;

/**
 * One Radiance RGBE equirect (linear radiance, so highlights above 1 survive) downloaded, decoded to half float and
 * prefiltered to a PMREM texture for `scene.environment`. The caller owns the result and disposes it. Null when the
 * download fails or `stillWanted()` says so after it (the renderer was disposed meanwhile).
 */
export async function loadHdrEnv(renderer: THREE.WebGLRenderer, url: string = STUDIO_ENV_URL, stillWanted: () => boolean = () => true): Promise<THREE.Texture | null> {
  const equirect = await new HDRLoader().loadAsync(url).catch(() => null);
  if (!equirect) return null;
  if (!stillWanted()) {
    equirect.dispose();
    return null;
  }
  flipRows(equirect);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  const gen = new THREE.PMREMGenerator(renderer);
  const env = gen.fromEquirectangular(equirect).texture;
  equirect.dispose();
  gen.dispose();
  return env;
}

/**
 * HDRLoader asks for `flipY` on its typed-array texture; Firefox deprecates y-flip on a non-DOM upload, so the RGBA
 * rows are reversed in place here and the flag cleared: the same picture, no flip left for the upload.
 */
function flipRows(tex: THREE.DataTexture): void {
  const { width, height } = tex.image;
  const data = tex.image.data!; // HDRLoader always decodes into a pixel array
  const stride = width * 4;
  const row = data.slice(0, stride);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    row.set(data.subarray(top * stride, (top + 1) * stride));
    data.copyWithin(top * stride, bottom * stride, (bottom + 1) * stride);
    data.set(row, bottom * stride);
  }
  tex.flipY = false;
}
