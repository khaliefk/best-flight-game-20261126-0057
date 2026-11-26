// Everything the eye sees: sky, sea and islands in perspective, the runway,
// the rings, the Kancil-9 herself, and the lit instruments of the HUD.
import { SKIES, VIEW, WORLD, RING_RADIUS } from './config.js';
import { groundColor, groundHeight, isOnRunway } from './terrain.js';
import { readouts, nextRing, ringsLeft, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_DONE, SCREEN_CRASH } from './world.js';
import { mulberry32 } from './random.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

// Clouds are fixed in the world so they drift past as the plane flies.
const clouds = [];
{
  const rand = mulberry32(4242);
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: (rand() - 0.5) * 7000,
      z: (rand() - 0.5) * 7000 + 1200,
      y: 320 + rand() * 260,
      r: 60 + rand() * 130,
    });
  }
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

// Project a world point into screen space. Returns null behind the camera.
function project(world, wx, wy, wz, cx, cy, focal) {
  const dx = wx - world.x;
  const dy = wy - world.alt;
  const dz = wz - world.z;
  const sinH = Math.sin(world.heading);
  const cosH = Math.cos(world.heading);
  const rx = dx * cosH - dz * sinH;
  let rz = dx * sinH + dz * cosH;
  let vy = dy;
  // Pitch the view: nose up pushes the horizon down the screen.
  const sinP = Math.sin(world.pitch);
  const cosP = Math.cos(world.pitch);
  const vy2 = vy * cosP - rz * sinP;
  rz = rz * cosP + vy * sinP;
  if (rz < 2) return null;
  let sx = cx + (rx / rz) * focal;
  let sy = cy - (vy2 / rz) * focal;
  // Roll the picture around the centre, as the world looks from a banked wing.
  const ox = sx - cx;
  const oy = sy - cy;
  const cosR = Math.cos(world.roll);
  const sinR = Math.sin(world.roll);
  sx = cx + ox * cosR + oy * sinR;
  sy = cy - ox * sinR + oy * cosR;
  return { x: sx, y: sy, d: rz };
}

function drawSky(ctx, world, w, h, sky, horizonY) {
  const grad = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.55, sky.mid);
  grad.addColorStop(1, sky.horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, horizonY + 40);
  // The sun hangs in a fixed quarter of the sky and slides with the heading.
  const sunAz = 0.9;
  const rel = wrapAngle(sunAz - world.heading);
  const halfFov = VIEW.fov / 2;
  if (Math.abs(rel) < halfFov * 1.4) {
    const sx = w / 2 + (rel / halfFov) * (w / 2);
    const sy = horizonY - h * (0.22 - world.pitch * 0.4);
    const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 120);
    glow.addColorStop(0, sky.sun);
    glow.addColorStop(0.25, sky.sun + 'cc');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 130, sy - 130, 260, 260);
    ctx.fillStyle = sky.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, TAU);
    ctx.fill();
  }
}

function drawClouds(ctx, world, w, h, sky, cx, cy, focal) {
  ctx.fillStyle = sky.cloud;
  for (let i = 0; i < clouds.length; i += 1) {
    const c = clouds[i];
    const p = project(world, c.x, c.y, c.z, cx, cy, focal);
    if (!p || p.d > 4200) continue;
    const r = (c.r * focal) / p.d;
    if (r < 3) continue;
    ctx.globalAlpha = clamp(1.15 - p.d / 3800, 0.12, 0.85);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.5, p.y + r * 0.06, r * 0.6, r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + r * 0.55, p.y + r * 0.05, r * 0.55, r * 0.22, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The ground: a perspective grid of cells coloured by the terrain under
// them, fading into haze at the horizon. This is what makes the islands.
function drawGround(ctx, world, w, h, sky, cx, cy, focal, horizonY) {
  ctx.fillStyle = sky.sea;
  ctx.fillRect(0, horizonY, w, h - horizonY);
  const sinH = Math.sin(world.heading);
  const cosH = Math.cos(world.heading);
  const step = 64;
  const colCount = 14;
  const baseCol = Math.floor(world.x / step) - colCount;
  const rows = [];
  let d = 22;
  while (d < 2600) {
    rows.push(d);
    d *= 1.16;
  }
  // Far rows first so near cells paint over them.
  for (let ri = rows.length - 1; ri >= 0; ri -= 1) {
    const d0 = rows[ri];
    const d1 = ri + 1 < rows.length ? rows[ri + 1] : d0 * 1.16;
    const fog = clamp(d0 / 2300, 0, 0.82);
    for (let ci = 0; ci < colCount * 2; ci += 1) {
      const colX = (baseCol + ci) * step;
      const centreX = colX + step / 2;
      const centreZ = world.z + (d0 + d1) / 2;
      // Cell corners in world space, along the heading.
      const corners = [];
      let ok = true;
      for (const [ox, od] of [[colX, d0], [colX + step, d0], [colX + step, d1], [colX, d1]]) {
        const px = world.x + (ox - world.x) * cosH + od * sinH;
        const pz = world.z + (ox - world.x) * -sinH + od * cosH;
        const gy = groundHeight(px, pz);
        const p = project(world, px, gy, pz, cx, cy, focal);
        if (!p) { ok = false; break; }
        corners.push(p);
      }
      if (!ok) continue;
      const colour = mixColor(groundColor(centreX, centreZ), sky.groundFar, fog);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let k = 1; k < 4; k += 1) ctx.lineTo(corners[k].x, corners[k].y);
      ctx.closePath();
      ctx.fill();
      // A faint edge on every cell, so the ground reads as terrain and not
      // one flat slab of colour.
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawRunway(ctx, world, cx, cy, focal) {
  const R = WORLD.runway;
  const half = R.halfWidth;
  const segs = 14;
  for (let s = 0; s < segs; s += 1) {
    const z0 = R.z0 + ((R.z1 - R.z0) * s) / segs;
    const z1 = R.z0 + ((R.z1 - R.z0) * (s + 1)) / segs;
    const pts = [];
    let ok = true;
    for (const [x, z] of [[-half, z0], [half, z0], [half, z1], [-half, z1]]) {
      const p = project(world, x, 0.4, z, cx, cy, focal);
      if (!p) { ok = false; break; }
      pts.push(p);
    }
    if (!ok) continue;
    ctx.fillStyle = '#33383f';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < 4; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes, one per segment.
    if (s % 2 === 0) {
      const a = project(world, 0, 0.6, z0 + 6, cx, cy, focal);
      const b = project(world, 0, 0.6, z1 - 6, cx, cy, focal);
      if (a && b) {
        ctx.strokeStyle = '#f2f2e8';
        ctx.lineWidth = Math.max(1, 260 / a.d);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // Threshold bars at each end.
    if (s === 0 || s === segs - 1) {
      const z = s === 0 ? z0 + 10 : z1 - 10;
      for (const x of [-10, -3.5, 3.5, 10]) {
        const a = project(world, x - 2, 0.6, z, cx, cy, focal);
        const b = project(world, x + 2, 0.6, z, cx, cy, focal);
        const c = project(world, x + 2, 0.6, z + 14, cx, cy, focal);
        const e = project(world, x - 2, 0.6, z + 14, cx, cy, focal);
        if (a && b && c && e) {
          ctx.fillStyle = '#f2f2e8';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.lineTo(e.x, e.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

function drawRings(ctx, world, cx, cy, focal) {
  const target = nextRing(world);
  for (let i = world.ringIndex; i < world.rings.length; i += 1) {
    const ring = world.rings[i];
    const p = project(world, ring.x, ring.y, ring.z, cx, cy, focal);
    if (!p) continue;
    const rPx = (ring.r * focal) / p.d;
    if (rPx < 2 || rPx > 900) continue;
    const isNext = ring === target;
    const alpha = clamp(1.3 - p.d / 3200, 0.25, 1);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = isNext ? Math.max(3, rPx * 0.09) : Math.max(2, rPx * 0.05);
    ctx.strokeStyle = isNext ? '#ffb02e' : 'rgba(220,235,255,0.75)';
    ctx.shadowColor = isNext ? '#ff9a1f' : 'transparent';
    ctx.shadowBlur = isNext ? 18 : 0;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rPx, rPx * 0.94, 0, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // A thin tether to the ground, so the pilot can judge the ring's place.
    const base = project(world, ring.x, groundHeight(ring.x, ring.z), ring.z, cx, cy, focal);
    if (base && isNext) {
      ctx.strokeStyle = 'rgba(255,176,46,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + rPx * 0.94);
      ctx.lineTo(base.x, base.y);
      ctx.stroke();
    }
    if (isNext && rPx > 26) {
      ctx.fillStyle = '#ffb02e';
      ctx.font = `bold ${Math.max(13, Math.min(22, rPx * 0.28))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.index + 1}`, p.x, p.y - rPx - 10);
    }
    ctx.globalAlpha = 1;
  }
}

function drawPlaneShadow(ctx, world, cx, cy, focal) {
  if (!world.airborne) return;
  const gy = groundHeight(world.x, world.z);
  const p = project(world, world.x, gy + 1, world.z, cx, cy, focal);
  if (!p || p.y < 0 || p.y > VIEW.height) return;
  const r = clamp((90 * focal) / p.d, 4, 90);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r, r * 0.3, 0, 0, TAU);
  ctx.fill();
}

// The Kancil-9 from behind: tail, wings and nav lights, banked with the roll.
function drawPlane(ctx, world, w, h) {
  const px = w / 2;
  const py = h - 148;
  const s = 1.05;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(world.roll * 0.85);
  ctx.scale(s, s);
  // Wings, with dihedral and red/green tip lights.
  ctx.fillStyle = '#e8eef4';
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(-168, 26);
  ctx.lineTo(-168, 38);
  ctx.lineTo(-12, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 6);
  ctx.lineTo(168, 26);
  ctx.lineTo(168, 38);
  ctx.lineTo(12, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c33d2e';
  ctx.fillRect(-172, 26, 10, 5);
  ctx.fillRect(-176, 20, 5, 16);
  ctx.fillStyle = '#2fae5f';
  ctx.fillRect(162, 26, 10, 5);
  ctx.fillRect(171, 20, 5, 16);
  // Nav light glow.
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#ff4d4d';
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(-174, 28, 4, 0, TAU);
  ctx.fill();
  ctx.shadowColor = '#37e08a';
  ctx.fillStyle = '#4dffa0';
  ctx.beginPath();
  ctx.arc(174, 28, 4, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Fuselage, tapering to the tail.
  const fus = ctx.createLinearGradient(0, -46, 0, 46);
  fus.addColorStop(0, '#f4f7fa');
  fus.addColorStop(0.6, '#dbe4ec');
  fus.addColorStop(1, '#9fb0be');
  ctx.fillStyle = fus;
  ctx.beginPath();
  ctx.moveTo(-13, 44);
  ctx.quadraticCurveTo(-17, 0, -11, -44);
  ctx.quadraticCurveTo(0, -52, 11, -44);
  ctx.quadraticCurveTo(17, 0, 13, 44);
  ctx.quadraticCurveTo(0, 50, -13, 44);
  ctx.fill();
  // Cheatline and registration.
  ctx.fillStyle = '#e25822';
  ctx.fillRect(-13, 8, 26, 6);
  ctx.fillStyle = '#22303c';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PK-KCL', 0, 34);
  // Tail fin and stabiliser.
  ctx.fillStyle = '#e25822';
  ctx.beginPath();
  ctx.moveTo(-9, -40);
  ctx.lineTo(0, -78);
  ctx.lineTo(9, -40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dbe4ec';
  ctx.beginPath();
  ctx.moveTo(-34, -34);
  ctx.lineTo(34, -34);
  ctx.lineTo(26, -26);
  ctx.lineTo(-26, -26);
  ctx.closePath();
  ctx.fill();
  // White tail light.
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -74, 3.5, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(7,13,22,0.62)';
  ctx.strokeStyle = 'rgba(255,180,84,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawHud(ctx, world, w, h, read) {
  const amber = '#ffb454';
  const green = '#7dff9a';
  const red = '#ff5a5a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Top strip: the flight readouts, lit like a panel.
  panel(ctx, 12, 10, w - 24, 54);
  ctx.fillStyle = amber;
  ctx.font = 'bold 26px system-ui, monospace';
  ctx.fillText(`ALT ${read.altitudeFt.toLocaleString('en-US')} FT`, 26, 36);
  ctx.fillText(`SPD ${read.speedKt} KT`, 268, 36);
  ctx.font = 'bold 15px system-ui, monospace';
  ctx.fillStyle = '#cfe3ff';
  ctx.fillText(`VSI ${read.verticalSpeedFpm >= 0 ? '+' : ''}${read.verticalSpeedFpm} FPM`, 268, 56);
  // Compass tape across the centre.
  const cx = w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 190, 12, 380, 50);
  ctx.clip();
  ctx.font = 'bold 15px system-ui, monospace';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((read.headingDeg + d) % 360 + 360) % 360;
    const x = cx + d * 3;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? amber : 'rgba(207,227,255,0.6)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, major ? 34 : 28);
    ctx.stroke();
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillStyle = deg % 90 === 0 ? amber : '#cfe3ff';
      ctx.fillText(label, x, 52);
    }
  }
  ctx.restore();
  ctx.fillStyle = amber;
  ctx.font = 'bold 20px system-ui, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`HDG ${String(read.headingDeg).padStart(3, '0')}°`, cx, 36);
  ctx.beginPath();
  ctx.moveTo(cx - 7, 10);
  ctx.lineTo(cx + 7, 10);
  ctx.lineTo(cx, 20);
  ctx.closePath();
  ctx.fill();
  // Right side: fuel, score, rings.
  ctx.textAlign = 'right';
  ctx.fillStyle = read.fuel < 20 ? red : green;
  ctx.font = 'bold 22px system-ui, monospace';
  ctx.fillText(`FUEL ${read.fuel}%`, w - 26, 34);
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 15px system-ui, monospace';
  ctx.fillText(`SCORE ${world.score}`, w - 26, 56);
  ctx.fillText(`RING ${world.ringIndex}/${world.rings.length}`, w - 150, 56);

  // Attitude indicator, bottom left: a lit ball that turns with the wing.
  const ax = 92;
  const ay = h - 92;
  const ar = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, TAU);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-world.roll);
  ctx.translate(0, world.pitch * 130);
  ctx.fillStyle = '#3d7ac2';
  ctx.fillRect(-ar - 10, -ar * 2 - 10, (ar + 10) * 2, ar * 2 + 10);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-ar - 10, 0, (ar + 10) * 2, ar * 2 + 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-ar, 0);
  ctx.lineTo(ar, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, TAU);
  ctx.stroke();
  // Fixed aircraft symbol over the ball.
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ax - 26, ay);
  ctx.lineTo(ax + 26, ay);
  ctx.moveTo(ax, ay - 4);
  ctx.lineTo(ax, ay + 10);
  ctx.stroke();
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 12px system-ui, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', ax, ay + ar + 16);

  // Throttle and gear, bottom right.
  const tx = w - 92;
  const ty = h - 158;
  panel(ctx, tx - 66, ty - 6, 132, 140);
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 12px system-ui, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THROTTLE', tx, ty + 12);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(tx - 14, ty + 22, 28, 72);
  const th = world.throttle;
  const tg = ctx.createLinearGradient(0, ty + 94, 0, ty + 22);
  tg.addColorStop(0, '#37e08a');
  tg.addColorStop(1, '#ffb02e');
  ctx.fillStyle = tg;
  ctx.fillRect(tx - 14, ty + 94 - 72 * th, 28, 72 * th);
  ctx.fillStyle = amber;
  ctx.font = 'bold 14px system-ui, monospace';
  ctx.fillText(`${read.throttle}%`, tx, ty + 110);
  ctx.fillStyle = world.airborne ? '#5a6b7d' : green;
  ctx.fillText(world.airborne ? 'GEAR UP' : 'GEAR DOWN', tx, ty + 130);

  // Centre message banner.
  if (world.messageTime > 0 && world.message) {
    ctx.globalAlpha = clamp(world.messageTime, 0, 1);
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27a';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText(world.message, w / 2, 96);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // Warnings, flashing when they matter.
  const blink = Math.floor(world.time * 3) % 2 === 0;
  const stalled = world.airborne && world.speed < 27;
  const ground = groundHeight(world.x, world.z);
  const lowTerrain = world.airborne && world.alt - ground < 45 && world.verticalSpeed < -2;
  if (blink && (stalled || read.fuel < 20 || lowTerrain)) {
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = red;
    const warn = stalled ? 'STALL — NOSE DOWN, POWER UP' : lowTerrain ? 'PULL UP — TERRAIN' : 'LOW FUEL';
    ctx.fillText(warn, w / 2, h - 210);
  }

  // Controls hint, small and out of the way.
  ctx.fillStyle = 'rgba(207,227,255,0.75)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Arrows / WASD fly · W/S throttle · mouse steers · C camera · P pause · M mute', w / 2, h - 12);
}

function overlay(ctx, w, h, alpha) {
  ctx.fillStyle = `rgba(5,10,18,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

function drawTitle(ctx, world, w, h) {
  overlay(ctx, w, h, 0.45);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.fillText('SKYLARK RUN', w / 2, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('ISLAND HOPPER — fly the Kancil-9 across the archipelago', w / 2, 232);
  const cards = [
    ['1', 'RING RUN', 'Six rings over the home island'],
    ['2', 'ISLAND HOP', 'Eight rings, tight fuel, whole archipelago'],
    ['3', 'SUNSET LANDING', 'Three rings, then land on runway 09'],
  ];
  const cw = 300;
  const gap = 24;
  const x0 = w / 2 - (cw * 3 + gap * 2) / 2;
  for (let i = 0; i < cards.length; i += 1) {
    const x = x0 + i * (cw + gap);
    panel(ctx, x, 300, cw, 130);
    ctx.fillStyle = '#ffb454';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(cards[i][0], x + cw / 2, 352);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(cards[i][1], x + cw / 2, 386);
    ctx.fillStyle = '#cfe3ff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(cards[i][2], x + cw / 2, 412);
  }
  ctx.fillStyle = '#eaf3ff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Press 1, 2 or 3 to fly — or click a mission. Arrows / WASD fly, W/S throttle, mouse steers.', w / 2, 490);
  ctx.fillStyle = 'rgba(234,243,255,0.75)';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Thread the glowing rings. Mind the fuel. Landings count only on the strip, gentle and straight.', w / 2, 520);
  if (world.best > 0) {
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`Best score so far: ${world.best}`, w / 2, 566);
  }
}

function drawEndCard(ctx, world, w, h, title, colour, lines) {
  overlay(ctx, w, h, 0.55);
  panel(ctx, w / 2 - 320, h / 2 - 150, 640, 300);
  ctx.textAlign = 'center';
  ctx.fillStyle = colour;
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(title, w / 2, h / 2 - 88);
  ctx.fillStyle = '#eaf3ff';
  ctx.font = '19px system-ui, sans-serif';
  let y = h / 2 - 44;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 30;
  }
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('R — fly again · T — title screen', w / 2, h / 2 + 118);
}

// The one entry point: draw the world, the plane, the HUD and the screen.
export function render(ctx, world, camera) {
  const w = VIEW.width;
  const h = VIEW.height;
  const sky = SKIES[world.mission.sky];
  const focal = (h / 2) / Math.tan(VIEW.fov / 2);
  const cx = w / 2;
  // On the end cards the plane is on the ground, where the camera would see
  // nothing but tarmac: lift the view to 40 m so the strip and the islands
  // still show behind the card.
  const vw = world.screen === SCREEN_DONE || world.screen === SCREEN_CRASH
    ? { ...world, alt: Math.max(world.alt, 40), pitch: 0.06, roll: 0 }
    : world;
  // The horizon sits where the pitch puts it, and the roll turns the picture.
  const horizonY = h * 0.46 + Math.tan(vw.pitch) * focal * 0.9;
  const cy = horizonY;

  drawSky(ctx, vw, w, h, sky, horizonY);
  drawClouds(ctx, vw, w, h, sky, cx, cy, focal);
  drawGround(ctx, vw, w, h, sky, cx, cy, focal, horizonY);
  drawRunway(ctx, vw, cx, cy, focal);
  drawRings(ctx, vw, cx, cy, focal);
  drawPlaneShadow(ctx, vw, cx, cy, focal);
  if (camera === 'chase' && (world.screen === SCREEN_PLAY || world.screen === SCREEN_PAUSE || world.screen === SCREEN_TITLE)) {
    drawPlane(ctx, world, w, h);
  }

  if (world.screen === SCREEN_PLAY || world.screen === SCREEN_PAUSE) {
    drawHud(ctx, world, w, h, readouts(world));
  }
  if (world.screen === SCREEN_TITLE) drawTitle(ctx, world, w, h);
  if (world.screen === SCREEN_PAUSE) {
    overlay(ctx, w, h, 0.45);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('PAUSED', w / 2, h / 2 - 10);
    ctx.fillStyle = '#ffd27a';
    ctx.font = '19px system-ui, sans-serif';
    ctx.fillText('Press P to keep flying', w / 2, h / 2 + 30);
  }
  if (world.screen === SCREEN_DONE) {
    const lines = [
      `Mission: ${world.mission.name}`,
      `Score: ${world.score}  ·  Rings: ${world.ringIndex}/${world.rings.length}`,
      world.landed ? `Landing: ${world.landingQuality}` : `Time: ${Math.round(world.time)} s  ·  Fuel left: ${Math.round(world.fuel)}%`,
      `Best score: ${world.best}`,
    ];
    drawEndCard(ctx, world, w, h, 'MISSION COMPLETE', '#7dff9a', lines);
  }
  if (world.screen === SCREEN_CRASH) {
    const lines = [
      world.crashReason,
      `Score: ${world.score}  ·  Rings: ${world.ringIndex}/${world.rings.length}`,
      `Altitude ${readouts(world).altitudeFt} ft · Speed ${readouts(world).speedKt} kt`,
      `Best score: ${world.best}`,
    ];
    drawEndCard(ctx, world, w, h, 'CRASHED', '#ff5a5a', lines);
  }
}
