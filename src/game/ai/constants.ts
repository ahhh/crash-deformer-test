/**
 * Slots of the tune buffer a brain hands `guardContact` (`contact-guard.ts`, called per car per step). A number passed to a
 * call V8 does not inline is boxed on the heap; a slot the caller writes and the guard reads is not.
 */
export const GUARD_BRAKE_IDX = 0; // m/s²: what the car can brake at (the guard's share of it)
export const GUARD_LEAD_IDX = 1; // m/s²: what a car ahead is taken to brake at
export const GUARD_TURN_IDX = 2; // rad/s: yaw rate at full lock
export const GUARD_COUNT = 3;
/** The throttle a unit backs out with (a share of reverse): full is more than the drive can use. */
export const REVERSE_THROTTLE = -0.9;
/** The throttle a unit crawls forward at while its lock swings the nose round (facing the wrong way, or pinned against the boards). */
export const TURN_ROUND_THROTTLE = 0.6;
/** A road's curvature (1/m) below this is a straight: no corner to slow for. */
export const STRAIGHT_CURV = 1e-4;
