// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only: the game asks the canvas for pointer lock and reads
// movementX/Y while it holds it. Buying, grenades and the bomb all read keys here.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, zooming: false, lookX: 0, lookY: 0 };
  const pressed = new Set();
  let firingEdge = false;
  // When pointer lock engages, the browser recentres the cursor and can emit
  // a synthetic mousemove with a huge delta — under a slow renderer it can
  // arrive seconds late, long after the first-second window expires. So look
  // input is ignored for a full second after lock, any single event is
  // clamped, and for three seconds after lock a single event with a huge
  // delta (the synthetic jump, never a real mouse move) is dropped outright.
  // Small moves are never swallowed: a 20 px aim adjustment must still turn
  // the view.
  let ignoreLookUntil = 0;
  let lockAcquiredAt = 0;

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.zooming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    const now = performance.now();
    if (now < ignoreLookUntil) return;
    // The synthetic lock-acquisition jump: one event, a huge delta, arriving
    // late. A real mouse (or a test harness aiming) moves in small steps.
    if (now < lockAcquiredAt + 3000 && (Math.abs(event.movementX) > 150 || Math.abs(event.movementY) > 150)) return;
    state.lookX += Math.max(-200, Math.min(200, event.movementX));
    state.lookY += Math.max(-200, Math.min(200, event.movementY));
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.firing = true;
      firingEdge = true;
    }
    if (event.button === 2) state.zooming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.zooming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (state.locked) {
      state.lookX = 0;
      state.lookY = 0;
      lockAcquiredAt = performance.now();
      ignoreLookUntil = lockAcquiredAt + 1000;
    } else {
      keys.clear();
      state.firing = false;
      state.zooming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // True once for a key pressed since the last call; buy menu and grenades use it.
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    // True once per mouse press: semi-auto weapons fire on the press, not while held.
    takeFiringEdge() {
      if (!firingEdge) return false;
      firingEdge = false;
      return true;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
