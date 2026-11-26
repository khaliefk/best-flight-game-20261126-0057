// The flight model and the mission: one arcade plane over the islands, with
// throttle, bank, pitch, stall, fuel, rings, landings and crashes.
import { PLANE, SCORE, TAKEOFF_SPEED, WORLD } from './config.js';
import { groundHeight, isOnRunway, buildRingCourse } from './terrain.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_DONE = 'done';
export const SCREEN_CRASH = 'crash';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createWorld(mission, seed) {
  return {
    mission,
    seed,
    screen: SCREEN_TITLE,
    time: 0,
    // The plane starts parked at the south end of the runway, nose north.
    x: 0,
    z: -360,
    alt: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: mission.fuel,
    airborne: false,
    gearDown: true,
    rings: buildRingCourse(mission, seed),
    ringIndex: 0,
    score: 0,
    best: 0,
    message: '',
    messageTime: 0,
    crashReason: '',
    landed: false,
    landingQuality: '',
    verticalSpeed: 0,
    events: [],
  };
}

export function nextRing(world) {
  return world.rings[world.ringIndex] || null;
}

export function ringsLeft(world) {
  return world.rings.length - world.ringIndex;
}

function announce(world, text, seconds = 2.4) {
  world.message = text;
  world.messageTime = seconds;
}

// One fixed step of the flight model. `input` is { pitch, roll, throttle,
// brake } with pitch/roll in -1..1 and throttle 0..1.
export function stepWorld(world, input, dt) {
  if (world.screen !== SCREEN_PLAY) return;
  world.time += dt;
  if (world.messageTime > 0) world.messageTime -= dt;

  const stalled = world.airborne && world.speed < PLANE.stallSpeed;
  const fuelOut = world.fuel <= 0;

  // Throttle answers at once, but the engine spools over half a second.
  const wantedThrottle = fuelOut ? 0 : clamp(input.throttle, 0, 1);
  world.throttle = lerp(world.throttle, wantedThrottle, Math.min(1, dt * 2.2));
  if (world.throttle > 0.05) {
    world.fuel = Math.max(0, world.fuel - PLANE.fuelBurn * world.throttle * dt);
  }

  // Bank and pitch ease toward the stick, never snap.
  const targetRoll = clamp(input.roll, -1, 1) * PLANE.maxRoll;
  const targetPitch = input.pitch >= 0
    ? input.pitch * PLANE.maxPitchUp
    : input.pitch * -PLANE.maxPitchDown;
  world.roll = lerp(world.roll, targetRoll, Math.min(1, dt * PLANE.rollRate));
  world.pitch = lerp(world.pitch, targetPitch, Math.min(1, dt * PLANE.pitchRate));

  // A banked wing turns the nose: standard coordinated-turn rate. Rolling
  // right (positive roll) swings the heading right, rolling left the other way.
  const turnRate = (PLANE.turnG * Math.tan(world.roll)) / Math.max(20, world.speed);
  world.heading = wrapAngle(world.heading + turnRate * dt);

  // Speed chases the throttle, drag grows with the square of speed.
  const targetSpeed = PLANE.maxSpeed * world.throttle;
  const drag = PLANE.drag * world.speed * world.speed / PLANE.maxSpeed;
  world.speed += (PLANE.accel * (targetSpeed - world.speed) / PLANE.maxSpeed - drag * 0.06) * dt;
  world.speed = Math.max(0, world.speed);
  if (input.brake) world.speed = Math.max(0, world.speed - 22 * dt);

  const ground = groundHeight(world.x, world.z);
  const wasAirborne = world.airborne;

  // Lift: climbing costs speed, sinking gains a little back.
  const climb = world.airborne ? Math.sin(world.pitch) * world.speed * PLANE.climbFactor : 0;
  if (world.airborne) {
    world.verticalSpeed = climb - (stalled ? PLANE.sinkRate * 1.8 : PLANE.sinkRate * 0.25);
    // Below stall speed the nose drops on its own.
    if (stalled) world.pitch = lerp(world.pitch, -0.22, Math.min(1, dt * 1.4));
  } else {
    world.verticalSpeed = 0;
  }
  world.alt += world.verticalSpeed * dt;

  // Move over the ground along the heading.
  const forward = world.speed * dt;
  world.x += Math.sin(world.heading) * forward;
  world.z += Math.cos(world.heading) * forward;

  // Takeoff: fast enough on the strip and the wing lifts her.
  if (!world.airborne && world.speed >= TAKEOFF_SPEED && isOnRunway(world.x, world.z)) {
    world.airborne = true;
    world.alt = Math.max(world.alt, 2);
    announce(world, 'AIRBORNE — gear up, flaps up');
    world.events.push({ type: 'takeoff', at: world.time });
  }
  // A fast rollout off the strip is a field, not a runway: she stays down.
  if (!world.airborne && world.speed > 8 && !isOnRunway(world.x, world.z)) {
    world.speed = Math.max(0, world.speed - 30 * dt);
  }

  // Touching ground.
  if (world.airborne && world.alt <= ground + 0.5) {
    const onStrip = isOnRunway(world.x, world.z);
    const gentle = world.verticalSpeed > -6.5 && Math.abs(world.roll) < 0.35 && Math.abs(world.pitch) < 0.2;
    const aligned = Math.abs(wrapAngle(world.heading)) < 0.35 || Math.abs(wrapAngle(world.heading - Math.PI)) < 0.35;
    if (onStrip && gentle && aligned && world.speed < 55) {
      world.airborne = false;
      world.alt = 0;
      world.landed = true;
      world.landingQuality = world.verticalSpeed > -2 ? 'BUTTER SMOOTH' : 'FIRM BUT FAIR';
      finishLanding(world);
    } else {
      crash(world, onStrip ? 'Ran off the runway' : 'Flew into the ground');
    }
  }
  if (!world.airborne && world.alt <= 0) {
    world.alt = 0;
    // Rolling out after a landing bleeds speed; a parked plane stops.
    if (world.landed) world.speed = Math.max(0, world.speed - 10 * dt);
    if (!wasAirborne && world.speed < 0.5 && world.throttle < 0.05) world.speed = 0;
  }

  // Rings: fly through the glowing hoop and it counts.
  const ring = nextRing(world);
  if (ring && world.airborne) {
    const dx = world.x - ring.x;
    const dy = world.alt - ring.y;
    const dz = world.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ring.r * 0.95) {
      ring.done = true;
      world.ringIndex += 1;
      world.score += SCORE.ring;
      announce(world, `RING ${ring.index + 1} — +${SCORE.ring}`);
      world.events.push({ type: 'ring', at: world.time, index: ring.index });
      if (world.ringIndex >= world.rings.length) {
        if (world.mission.landing) {
          announce(world, 'ALL RINGS — now land on runway 09');
        } else {
          finishMission(world);
        }
      }
    }
  }

  // Out of fuel over the sea is a ditching, not a landing.
  if (fuelOut && world.airborne && world.alt < 30 && world.speed < 25) {
    crash(world, 'Out of fuel — ditched in the sea');
  }
  if (world.alt > 1400) {
    world.alt = 1400;
    announce(world, 'CEILING — 4,500 ft, that is high enough');
  }
}

function finishMission(world) {
  world.screen = SCREEN_DONE;
  const fuelBonus = Math.round(world.fuel * SCORE.fuelBonus);
  const timeBonus = Math.max(0, Math.round((420 - world.time) * SCORE.timeBonus));
  world.score += fuelBonus + timeBonus;
  world.best = Math.max(world.best, world.score);
  world.events.push({ type: 'complete', at: world.time, score: world.score });
}

function finishLanding(world) {
  const fuelBonus = Math.round(world.fuel * SCORE.fuelBonus);
  world.score += SCORE.landing + fuelBonus;
  world.best = Math.max(world.best, world.score);
  world.screen = SCREEN_DONE;
  world.events.push({ type: 'landing', at: world.time, score: world.score, quality: world.landingQuality });
}

function crash(world, reason) {
  world.screen = SCREEN_CRASH;
  world.crashReason = reason;
  world.best = Math.max(world.best, world.score);
  world.events.push({ type: 'crash', at: world.time, reason });
}

export function startMission(world) {
  world.screen = SCREEN_PLAY;
  world.events.push({ type: 'start', at: world.time });
}

export function resetWorld(world, mission, seed) {
  const fresh = createWorld(mission, seed);
  fresh.best = world.best;
  Object.assign(world, fresh);
}

// Flight readouts for the HUD, in the units a pilot reads.
export function readouts(world) {
  const headingDeg = ((world.heading * 180) / Math.PI + 360) % 360;
  return {
    altitudeFt: Math.round(world.alt * 3.28084),
    speedKt: Math.round(world.speed * 1.94384),
    headingDeg: Math.round(headingDeg),
    verticalSpeedFpm: Math.round(world.verticalSpeed * 196.85),
    fuel: Math.round(world.fuel),
    throttle: Math.round(world.throttle * 100),
  };
}
