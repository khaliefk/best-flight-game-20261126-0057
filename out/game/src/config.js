// Skylark Run: every tunable number for the game lives here, so a balance
// change is one edit and the flight model, the world and the renderer all
// read the same values.
export const VIEW = { width: 1280, height: 800, fov: 1.15 };

export const PLANE = {
  name: 'Kancil-9',
  registration: 'PK-KCL',
  maxSpeed: 92, // m/s, about 179 knots at full throttle
  cruiseSpeed: 62,
  stallSpeed: 27, // m/s, below this the wing quits and the nose drops
  maxRoll: 1.15, // radians, about 66 degrees of bank
  maxPitchUp: 0.34,
  maxPitchDown: -0.3,
  rollRate: 2.6,
  pitchRate: 1.5,
  accel: 14, // m/s^2 toward the throttle's target speed
  drag: 0.35,
  climbFactor: 0.9,
  sinkRate: 6, // m/s the plane settles when it has no lift
  fuelBurn: 0.55, // percent per second at full throttle
  fuelCapacity: 100,
  turnG: 9.81,
};

export const WORLD = {
  seaLevel: 0,
  maxHill: 190, // metres, the tallest island peak
  runway: { x: 0, z0: -420, z1: 420, halfWidth: 16, heading: 0 },
  // The home field sits on the big island; the strips below are the
  // island bumps that make the archipelago, as [x, z, radius, height].
  islands: [
    [0, 0, 900, 60],
    [-1250, 900, 620, 150],
    [1150, 1400, 700, 185],
    [-700, 2400, 520, 120],
    [900, 2900, 560, 140],
    [2100, 500, 480, 95],
    [-2200, -600, 540, 110],
    [350, -1900, 650, 130],
    [-1500, -2100, 480, 100],
    [1800, -1600, 520, 115],
  ],
};

// Sky palettes per mission: day, golden hour, sunset.
export const SKIES = [
  {
    name: 'Morning',
    top: '#2f6fd0', mid: '#7fb2e8', horizon: '#cfe6f7',
    sun: '#fff3c4', sunX: 0.78, sunY: 0.2, cloud: 'rgba(255,255,255,0.92)',
    groundFar: '#5d8fc4', sea: '#2e6da8',
  },
  {
    name: 'Golden Hour',
    top: '#3a5aa8', mid: '#e8a35c', horizon: '#ffd9a0',
    sun: '#ffdf8a', sunX: 0.24, sunY: 0.3, cloud: 'rgba(255,226,190,0.95)',
    groundFar: '#6b7fa8', sea: '#3d6a94',
  },
  {
    name: 'Sunset',
    top: '#2c2a5e', mid: '#c65a7a', horizon: '#ff9e66',
    sun: '#ff7a4d', sunX: 0.5, sunY: 0.34, cloud: 'rgba(255,190,160,0.9)',
    groundFar: '#54486e', sea: '#33456e',
  },
];

export const MISSIONS = [
  {
    id: 0,
    name: 'RING RUN',
    brief: 'Six sky rings over the home island. Thread them all, then bring her home.',
    rings: 6,
    fuel: 100,
    sky: 0,
    ringSpread: 1,
  },
  {
    id: 1,
    name: 'ISLAND HOP',
    brief: 'Eight rings across the whole archipelago. Watch the fuel gauge, it bites.',
    rings: 8,
    fuel: 78,
    sky: 1,
    ringSpread: 1.6,
  },
  {
    id: 2,
    name: 'SUNSET LANDING',
    brief: 'Three rings, then a sunset landing on runway 09. Gentle wins.',
    rings: 3,
    fuel: 100,
    sky: 2,
    ringSpread: 0.8,
    landing: true,
  },
];

export const SCORE = { ring: 250, landing: 500, fuelBonus: 5, timeBonus: 2 };

export const RING_RADIUS = 26; // metres, the ring the plane must fly through
export const TAKEOFF_SPEED = 30; // m/s, rotate speed on the runway
