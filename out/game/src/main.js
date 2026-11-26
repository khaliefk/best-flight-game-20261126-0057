// Skylark Run: boot, the frame loop, and the screens around the flight.
import { VIEW, MISSIONS } from './config.js';
import { createWorld, stepWorld, startMission, resetWorld, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_DONE, SCREEN_CRASH } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { render } from './render.js';
import { stageShot, parseShot } from './shots.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const ctx = canvas.getContext('2d');

const audio = createAudio();
const input = createInput(canvas);

let camera = 'chase';
let shotMode = false;
let world = createWorld(MISSIONS[0], 7);
let missionIndex = 0;

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function pickMission(index) {
  missionIndex = index;
  resetWorld(world, MISSIONS[index], 7 + index);
  startMission(world);
  audio.unlock();
  announceStatus(`Flying ${MISSIONS[index].name}`);
}

function announceStatus(text) {
  statusLine.textContent = text;
}

function handleKeys() {
  if (input.wasPressed('KeyM')) {
    const muted = audio.toggleMute();
    announceStatus(muted ? 'Sound off' : 'Sound on');
  }
  if (input.wasPressed('KeyC')) {
    camera = camera === 'chase' ? 'nose' : 'chase';
    announceStatus(camera === 'chase' ? 'Chase camera' : 'Nose camera');
  }
  if (world.screen === SCREEN_TITLE) {
    if (input.wasPressed('Digit1')) pickMission(0);
    else if (input.wasPressed('Digit2')) pickMission(1);
    else if (input.wasPressed('Digit3')) pickMission(2);
    else if (input.wasPressed('Enter') || input.wasPressed('Space')) pickMission(missionIndex);
    return;
  }
  if (world.screen === SCREEN_PLAY) {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      world.screen = SCREEN_PAUSE;
      announceStatus('Paused');
    }
    return;
  }
  if (world.screen === SCREEN_PAUSE) {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape') || input.wasPressed('Enter')) {
      world.screen = SCREEN_PLAY;
      announceStatus('Flying');
    }
    return;
  }
  if (world.screen === SCREEN_DONE || world.screen === SCREEN_CRASH) {
    if (input.wasPressed('KeyR')) pickMission(missionIndex);
    else if (input.wasPressed('KeyT')) {
      resetWorld(world, MISSIONS[missionIndex], 7 + missionIndex);
      world.screen = SCREEN_TITLE;
    }
  }
}

// Clicking a mission card on the title screen starts it.
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (world.screen !== SCREEN_TITLE) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * VIEW.width;
  const y = (e.clientY - rect.top) / rect.height * VIEW.height;
  if (y >= 300 && y <= 430) {
    const cw = 300;
    const gap = 24;
    const x0 = VIEW.width / 2 - (cw * 3 + gap * 2) / 2;
    for (let i = 0; i < 3; i += 1) {
      if (x >= x0 + i * (cw + gap) && x <= x0 + i * (cw + gap) + cw) {
        pickMission(i);
        return;
      }
    }
  }
});

// A ?shot= URL stages one frozen frame for the screenshots and draws it once.
const { shot, seed } = parseShot();
if (shot) {
  shotMode = true;
  world = stageShot(shot, seed);
  render(ctx, world, 'chase');
  document.title = `Skylark Run — ${shot}`;
} else {
  let last = performance.now();
  let throttle = 0;
  let lastRingCount = 0;
  let lastScreen = world.screen;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    handleKeys();
    if (world.screen === SCREEN_PLAY) {
      const polled = input.poll(throttle);
      throttle = polled.throttle;
      const before = world.ringIndex;
      stepWorld(world, polled, dt);
      if (world.ringIndex > before) audio.ring();
      if (world.screen === SCREEN_CRASH && lastScreen !== SCREEN_CRASH) audio.crash();
      if (world.screen === SCREEN_DONE && lastScreen !== SCREEN_DONE) audio.thud();
      audio.update(world.throttle, world.speed, world.airborne);
    } else {
      input.poll(throttle);
      audio.update(0, 0, false);
    }
    lastScreen = world.screen;
    lastRingCount = world.ringIndex;
    render(ctx, world, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
