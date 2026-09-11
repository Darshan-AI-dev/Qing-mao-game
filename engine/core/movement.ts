/**
 * Turning stick or key input into world movement, relative to where the camera looks.
 *
 * This is its own module because getting it wrong is hard to see in code and obvious in
 * the hand. The first version built the basis as a plain 2D rotation of the raw input:
 *
 *     dx = move.x * cos - move.z * sin
 *     dz = move.x * sin + move.z * cos
 *
 * which is the wrong handedness for this camera. At yaw 0 "forward" drove the player
 * toward the camera; at yaw 90 degrees forward was right but strafing was mirrored. It
 * reads as reversed controls that change meaning as you turn.
 *
 * The camera orbits the player at `player - (sin yaw, cos yaw) * distance` and looks
 * back at them, so:
 *
 *   - the direction it looks, flattened, is `(sin yaw, cos yaw)`
 *   - screen-right is `cross(up, forward)` = `(cos yaw, -sin yaw)`
 *
 * Input uses screen conventions, where pushing up is negative — so forward is `-move.z`.
 */

export interface MoveInput {
  /** -1 is left, +1 is right. */
  x: number;
  /** -1 is forward (screen up), +1 is back. */
  z: number;
}

export interface WorldMove {
  dx: number;
  dz: number;
  /** Radians for the actor to face, or null when there is no movement. */
  facing: number | null;
}

/** Anything shorter than this counts as no input at all. */
export const MOVE_DEADZONE = 0.12;

/**
 * Resolves input against the camera yaw. The returned vector has the same magnitude as
 * the input (clamped to 1), so a half-pushed stick walks at half speed.
 */
export function worldMove(move: MoveInput, cameraYaw: number): WorldMove {
  const magnitude = Math.hypot(move.x, move.z);
  if (magnitude < MOVE_DEADZONE) return { dx: 0, dz: 0, facing: null };

  // Rescale so the deadzone does not eat the bottom of the stick's range: just past
  // the threshold should be a slow walk, not an abrupt jump to a third of top speed.
  const scaled = Math.min(1, (magnitude - MOVE_DEADZONE) / (1 - MOVE_DEADZONE));
  const nx = (move.x / magnitude) * scaled;
  const nz = (move.z / magnitude) * scaled;

  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  const forward = -nz;
  const strafe = nx;

  const dx = cos * strafe + sin * forward;
  const dz = -sin * strafe + cos * forward;
  return { dx, dz, facing: Math.atan2(dx, dz) };
}

/** Where the camera sits for a given yaw, pitch and distance. */
export function orbitCamera(
  target: { x: number; z: number },
  yaw: number,
  pitch: number,
  distance: number
): { x: number; y: number; z: number } {
  const flat = Math.cos(pitch) * distance;
  return {
    x: target.x - Math.sin(yaw) * flat,
    y: Math.sin(pitch) * distance + 2,
    z: target.z - Math.cos(yaw) * flat
  };
}
