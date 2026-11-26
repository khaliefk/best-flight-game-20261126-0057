// The archipelago: island bumps plus ridged noise, flattened into the home
// runway strip so takeoffs and landings have a real piece of tarmac.
import { WORLD } from './config.js';
import { makeFbm } from './random.js';

const fbm = makeFbm(1337);
const RUNWAY = WORLD.runway;

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

// Height of the ground in metres at world (x, z). Sea is 0 and below.
export function groundHeight(x, z) {
  let h = 0;
  for (let i = 0; i < WORLD.islands.length; i += 1) {
    const [ix, iz, radius, peak] = WORLD.islands[i];
    const dx = x - ix;
    const dz = z - iz;
    const d2 = dx * dx + dz * dz;
    const fall = Math.exp(-d2 / (radius * radius));
    h += peak * fall;
  }
  // Ridged hills only where land already rises, so the sea stays flat.
  const land = smoothstep(4, 40, h);
  const ridge = 1 - Math.abs(fbm(x / 420, z / 420));
  h += land * ridge * ridge * 55;
  // Flatten the runway strip and blend back to the island over 120 m. The
  // flattening runs 480 m past each threshold too, so the approach is a
  // cleared valley and a landing from the south is actually flyable.
  const approach = z > RUNWAY.z0 - 900 && z < RUNWAY.z1 + 900;
  if (approach) {
    const pastEnd = z < RUNWAY.z0 ? smoothstep(RUNWAY.z0 - 900, RUNWAY.z0 - 150, z) : z > RUNWAY.z1 ? smoothstep(RUNWAY.z1 + 900, RUNWAY.z1 + 150, z) : 1;
    const edge = smoothstep(RUNWAY.halfWidth + 40, RUNWAY.halfWidth + 160, Math.abs(x));
    h *= 1 - (1 - edge) * pastEnd;
  }
  return Math.max(0, h);
}

export function isOnRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) <= RUNWAY.halfWidth + 4 &&
    z >= RUNWAY.z0 &&
    z <= RUNWAY.z1
  );
}

export function runwayCentre(x, z) {
  return { x: RUNWAY.x, z: Math.max(RUNWAY.z0, Math.min(RUNWAY.z1, z)) };
}

// Colour of a ground cell, picked from its height and slope so the sea,
// the beaches, the jungle and the peaks read at a glance from the air.
// The flattened runway valley is land, not sea, even where its height is
// zero: it reads as grass, so the strip never looks like it floats on water.
export function groundColor(x, z) {
  const h = groundHeight(x, z);
  const n = fbm(x / 260 + 9, z / 260 + 4);
  const inValley = z > WORLD.runway.z0 - 900 && z < WORLD.runway.z1 + 900 && Math.abs(x) < 220;
  if (h < 2) return inValley ? '#5da244' : '#2e6da8'; // valley grass / open sea
  if (h < 6) return inValley ? '#6aa84f' : '#d9c27a'; // valley grass / sand
  if (h < 55) return n > 0.15 ? '#4d8a3f' : '#5da244'; // low jungle
  if (h < 120) return n > 0 ? '#3f7a37' : '#4a8a3c'; // high jungle
  if (h < 165) return '#6f7d5a'; // scrub
  return '#8a8f96'; // bare rock peaks
}

// A ring course: rings strung along a lazy loop out over the islands and
// back to the runway, heights chosen so the pilot climbs and descends.
export function buildRingCourse(mission, seed) {
  const count = mission.rings;
  const rings = [];
  const spread = mission.ringSpread;
  const stops = [
    [0, 350, 120],
    [-650 * spread, 1050, 190],
    [420 * spread, 1650, 260],
    [-380 * spread, 2350, 300],
    [760 * spread, 1950, 240],
    [-900 * spread, 1300, 210],
    [500 * spread, 700, 170],
    [-350 * spread, 300, 130],
  ];
  for (let i = 0; i < count; i += 1) {
    const s = stops[i % stops.length];
    rings.push({ x: s[0], z: s[1], y: s[2], r: 26, done: false, index: i });
  }
  // The sunset mission ends with the runway, not a ring: the last ring sits
  // north of the strip, so the plane comes home heading south, down the
  // centreline, and the landing is a straight glide in.
  if (mission.landing) {
    rings.push({ x: 0, z: 900, y: 110, r: 26, done: false, index: count, final: true });
  }
  return rings;
}
