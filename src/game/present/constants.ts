/** Names several present files and their consumers share. */

/** The FX tier id of the Ultra look (`FxTier` in engine-post.ts lists every tier). */
export const FX_TIER_ULTRA = "ultra";
/** The director's standard lens (deg): the chase shot's, and the widest the reel's context shot opens to. */
export const SHOT_FOV = 55;
/** Slow windows in a row that step the FX tier or the detail rung down: one hitch, however long, ends only one window, so it never steps. */
export const SLOW_WINDOWS = 2;
/** The name of a lamp's night light pool decal (`Object3D.name`): `makeLamp` names it, the prefab builder shares it with the scene and `syncPools` hides it with a knocked pole. */
export const LAMP_POOL = "pool";
