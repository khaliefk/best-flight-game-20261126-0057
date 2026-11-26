// Keyboard and mouse: arrows or WASD fly the plane, W/S work the throttle,
// the mouse steers by where it sits, and the rest run the game around it.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0, // -1 nose down, +1 nose up
    roll: 0, // -1 left, +1 right
    throttle: 0,
    brake: false,
    mouseX: 0,
    mouseY: 0,
    mouseActive: false,
    pressed: new Set(), // keys pressed since the last poll
  };

  function code(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) input.pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) / rect.width - 0.5;
    input.mouseY = (e.clientY - rect.top) / rect.height - 0.5;
    input.mouseActive = true;
  });
  canvas.addEventListener('pointerdown', () => {
    input.mouseActive = true;
  });

  // Fold the raw keys and the mouse into one stick position each frame.
  input.poll = (throttle) => {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 0; // W is throttle, see below
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch += 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    // Mouse steering: hold the pointer off-centre and the plane follows it.
    if (input.mouseActive) {
      if (Math.abs(input.mouseX) > 0.06) roll += input.mouseX * 2.4;
      if (Math.abs(input.mouseY) > 0.06) pitch -= input.mouseY * 2.2;
    }
    input.pitch = Math.max(-1, Math.min(1, pitch));
    input.roll = Math.max(-1, Math.min(1, roll));
    // Throttle: W/S nudge it, Shift full, Ctrl idle, Space brakes on the ground.
    if (keys.has('KeyW')) throttle = Math.min(1, throttle + 0.012);
    if (keys.has('KeyS')) throttle = Math.max(0, throttle - 0.012);
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle = 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttle = 0;
    input.throttle = throttle;
    input.brake = keys.has('Space');
    return input;
  };

  // True once for a key pressed since the last call, then cleared.
  input.wasPressed = (keyCode) => {
    if (input.pressed.has(keyCode)) {
      input.pressed.delete(keyCode);
      return true;
    }
    return false;
  };
  input.clearPressed = () => input.pressed.clear();
  input.anyKey = () => input.pressed.size > 0;

  return input;
}
