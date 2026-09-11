/**
 * Movement basis. Pure maths, so it is checked directly rather than through a browser.
 *
 * The rule: for every camera yaw, pushing forward must take the player away from the
 * camera, and pushing right must take them to the camera's right. The original
 * implementation satisfied neither consistently — it used a plain 2D rotation of the
 * raw input, which is the wrong handedness for this camera, so "forward" drove toward
 * the camera at yaw 0 and strafing was mirrored at yaw 90.
 */
import { MOVE_DEADZONE, orbitCamera, worldMove } from '../../engine/core/movement.ts';

let failures = 0;
const UP: [number, number, number] = [0, 1, 0];
const cross3 = (a: number[], b: number[]): [number, number, number] => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!
];
const check = (label: string, condition: boolean, detail = '') => {
  if (!condition) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

for (let deg = 0; deg < 360; deg += 15) {
  const yaw = (deg * Math.PI) / 180;
  const player = { x: 0, z: 0 };
  const camera = orbitCamera(player, yaw, 0.42, 16);

  // "Into the screen" is the flattened direction from the camera to the player.
  const length = Math.hypot(player.x - camera.x, player.z - camera.z);
  const into = { x: (player.x - camera.x) / length, z: (player.z - camera.z) / length };
  // Screen-right is cross(forward, up). Computed, not written out by hand: the hand-
  // written version had the operands the other way round, which is the negative of it,
  // so this test asserted a mirrored stick and passed at all 24 yaws while the controls
  // felt wrong to play. The anchor case below pins which one is right.
  const right = { x: cross3([into.x, 0, into.z], UP)[0], z: cross3([into.x, 0, into.z], UP)[2] };

  const forward = worldMove({ x: 0, z: -1 }, yaw);
  const strafe = worldMove({ x: 1, z: 0 }, yaw);

  check(`yaw ${deg}: forward goes into the screen`,
    forward.dx * into.x + forward.dz * into.z > 0.99,
    `dot ${(forward.dx * into.x + forward.dz * into.z).toFixed(3)}`);
  check(`yaw ${deg}: right goes screen-right`,
    strafe.dx * right.x + strafe.dz * right.z > 0.99,
    `dot ${(strafe.dx * right.x + strafe.dz * right.z).toFixed(3)}`);
  check(`yaw ${deg}: back is the opposite of forward`,
    Math.abs(worldMove({ x: 0, z: 1 }, yaw).dx + forward.dx) < 1e-9);
}

// The anchor. A camera looking down -Z with up +Y has screen-right at +X; this is the
// one fact the whole basis rests on, so assert it rather than trusting the derivation.
check('screen-right is cross(forward, up)', cross3([0, 0, -1], UP)[0] === 1,
  `got ${cross3([0, 0, -1], UP).join(', ')}`);

// Deadzone and response curve.
check('a tiny nudge is ignored', worldMove({ x: 0.05, z: 0.05 }, 0).facing === null);
check('just past the deadzone is a slow walk',
  worldMove({ x: 0, z: -(MOVE_DEADZONE + 0.02) }, 0).dz < 0.1);
check('a full push is full speed',
  Math.abs(worldMove({ x: 0, z: -1 }, 0).dz - 1) < 1e-9);
check('a diagonal never exceeds full speed', (() => {
  const m = worldMove({ x: 1, z: -1 }, 0);
  return Math.hypot(m.dx, m.dz) <= 1.0000001;
})());
check('facing points along the movement', (() => {
  const m = worldMove({ x: 0, z: -1 }, 0);
  return m.facing !== null && Math.abs(Math.sin(m.facing) - m.dx) < 1e-9;
})());

if (failures) {
  console.error(`\nmovement: ${failures} failure(s)`);
  process.exit(1);
}
console.log('movement: basis correct at 24 yaws, deadzone and response curve ok');
