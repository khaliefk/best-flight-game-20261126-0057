// The screenshot scenes behind ?shot=start|rings|runway|land. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (bank toward the next ring, hold climb,
// full throttle on the strip), so the frame is what a short game really
// looks like and the same seed always gives the same frame.
import { MISSIONS } from './config.js';
import { createWorld, stepWorld, startMission, nextRing, SCREEN_TITLE, SCREEN_PLAY, SCREEN_DONE, SCREEN_CRASH } from './world.js';
import { wrapAngle } from './world.js';
import { groundHeight } from './terrain.js';

const STEP = 1 / 60;

// Steer toward the next ring: bank into the turn, climb for its height, and
// stay clear of the hills ahead, since a ring over a 150 m island still
// needs 150 m of sky under the wing.
function autopilot(world) {
  const ring = nextRing(world);
  let roll = 0;
  let pitch = 0;
  if (!world.airborne) {
    return { pitch: 0, roll: 0, throttle: 1, brake: false };
  }
  // Terrain clearance: the ground 150 m and 300 m ahead of the nose.
  const fx = Math.sin(world.heading);
  const fz = Math.cos(world.heading);
  const groundAhead = Math.max(
    groundHeight(world.x + fx * 150, world.z + fz * 150),
    groundHeight(world.x + fx * 300, world.z + fz * 300),
  );
  let wantAlt = groundAhead + 55;
  let throttle = 0.92;
  if (ring) {
    const dx = ring.x - world.x;
    const dz = ring.z - world.z;
    const bearing = Math.atan2(dx, dz);
    const rel = wrapAngle(bearing - world.heading);
    roll = Math.max(-1, Math.min(1, rel * 1.6));
    wantAlt = Math.max(wantAlt, ring.y);
    // Ease off the bank as the ring lines up, so the shot reads clean.
    if (Math.abs(rel) < 0.08) roll *= 0.4;
    // Slow down for the ring: a tight turn at cruise speed orbits it forever.
    const dist = Math.hypot(dx, ring.y - world.alt, dz);
    if (dist < 500) throttle = 0.5;
    if (dist < 250) throttle = 0.42;
  }
  const dy = wantAlt - world.alt;
  pitch = Math.max(-0.7, Math.min(1, dy / 90));
  // Level off and slow down for the runway on the landing shot: land
  // southward down runway 09, holding the centreline with a heading that
  // leans into the cross-track error, and ride the glidepath down. The
  // pitch here is a stick fraction, so a glide angle is divided by the
  // pitch authority (0.3 down, 0.34 up) before it is sent.
  if (world.mission.landing && world.ringIndex >= world.rings.length) {
    const baseHeading = Math.PI;
    const dirSign = Math.cos(baseHeading) >= 0 ? 1 : -1;
    const wantHeading = baseHeading - world.x * 0.004 * dirSign;
    const headingErr = wrapAngle(wantHeading - world.heading);
    roll = Math.max(-1, Math.min(1, headingErr * 2.0));
    const dist = Math.hypot(world.x, -200 - world.z);
    const onFinal = Math.abs(wrapAngle(baseHeading - world.heading)) < 0.6 && dist < 1600;
    if (onFinal) {
      // The glidepath runs to the ground at the touchdown zone: a floor
      // above zero would hold the plane off the strip forever, so the
      // last 250 m aim at the tarmac itself, not at three metres over it.
      const glideAlt = dist > 250
        ? Math.max(Math.max(5, Math.min(160, dist * 0.09)), groundAhead + 25)
        : dist * 0.09;
      const angle = Math.max(-0.22, Math.min(0.12, (glideAlt - world.alt) * 0.03));
      let fraction = angle < 0 ? angle / 0.3 : angle / 0.34;
      if (world.alt < 6 && Math.abs(world.x) < 40 && world.z > -420 && world.z < 420) {
        fraction = Math.max(fraction, -0.12);
      }
      pitch = Math.max(-0.8, Math.min(1, fraction));
      return { pitch, roll, throttle: 0.38, brake: false };
    }
    pitch = Math.max(-0.5, Math.min(0.8, (Math.max(groundAhead + 50, 110) - world.alt) / 90));
    return { pitch, roll, throttle: 0.5, brake: false };
  }
  return { pitch, roll, throttle, brake: false };
}

function runSteps(world, seconds, pilot) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.screen !== SCREEN_PLAY) break;
    stepWorld(world, pilot(world), STEP);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title card over a live flight. rings: mid-course, a ring
 * ahead and close. runway: final approach, the strip dead ahead.
 * land: wheels down, mission complete card up.
 */
export function stageShot(name, seed) {
  if (name === 'land') {
    const world = createWorld(MISSIONS[2], seed);
    startMission(world);
    runSteps(world, 14, autopilot);
    // Keep flying her in until the wheels kiss the strip.
    for (let i = 0; i < 60 * 180; i += 1) {
      if (world.screen !== SCREEN_PLAY) break;
      stepWorld(world, autopilot(world), STEP);
    }
    return world;
  }
  if (name === 'runway') {
    const world = createWorld(MISSIONS[2], seed);
    startMission(world);
    runSteps(world, 14, autopilot);
    // Fly the ring course, then hold her on the approach: gear down,
    // nose on the numbers, strip filling the windscreen.
    for (let i = 0; i < 60 * 150; i += 1) {
      if (world.screen !== SCREEN_PLAY) break;
      if (world.ringIndex >= world.rings.length && world.alt < 90 && world.alt > 40) break;
      stepWorld(world, autopilot(world), STEP);
    }
    return world;
  }
  if (name === 'rings') {
    const world = createWorld(MISSIONS[1], seed);
    startMission(world);
    runSteps(world, 14, autopilot);
    // Chase the second ring until it is big in the windscreen. Only stop
    // for a ring ahead of the nose, never one just flown through.
    for (let i = 0; i < 60 * 45; i += 1) {
      if (world.screen !== SCREEN_PLAY) break;
      const ring = nextRing(world);
      if (ring && world.ringIndex >= 1) {
        const dx = ring.x - world.x;
        const dy = ring.y - world.alt;
        const dz = ring.z - world.z;
        const ahead = dx * Math.sin(world.heading) + dz * Math.cos(world.heading);
        if (ahead > 0 && Math.sqrt(dx * dx + dy * dy + dz * dz) < 260) break;
      }
      stepWorld(world, autopilot(world), STEP);
    }
    return world;
  }
  // start: title over a flight already in the air.
  const world = createWorld(MISSIONS[0], seed);
  startMission(world);
  runSteps(world, 14, autopilot);
  world.screen = SCREEN_TITLE;
  return world;
}

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '7');
  return { shot, seed: Number.isFinite(seed) ? seed : 7 };
}
