// Entrées : joystick tactile invisible (glisser vers le bas = avancer,
// gauche/droite = tourner, relâcher = s'arrêter) + clavier pour le bureau.
export function createInput() {
  const state = { throttle: 0, steer: 0, active: false };
  let origin = null, pid = null, lastTap = 0;
  let onDoubleTap = null;
  const keys = new Set();

  const DEAD = 10;   // zone morte (px)
  const RANGE = 105; // distance max du joystick (px)

  function refreshTouch(cx, cy) {
    const dx = cx - origin.x;
    const dy = cy - origin.y;
    const len = Math.hypot(dx, dy);
    if (len < DEAD) { state.throttle = 0; state.steer = 0; return; }
    state.throttle = Math.max(-1, Math.min(1, dy / RANGE)); // vers le bas = avancer
    state.steer = Math.max(-1, Math.min(1, dx / RANGE));    // gauche/droite = tourner
  }

  const el = document.getElementById('app');

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.ui')) return; // ne pas voler les clics d'UI
    if (pid !== null) return;
    pid = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    state.active = true;
    // double-tap => zoom caméra
    const now = performance.now();
    if (now - lastTap < 300 && onDoubleTap) onDoubleTap();
    lastTap = now;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    refreshTouch(e.clientX, e.clientY);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; origin = null;
    state.throttle = 0; state.steer = 0; state.active = false;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  window.addEventListener('blur', () => { keys.clear(); state.throttle = 0; state.steer = 0; });

  // clavier (AZERTY et QWERTY)
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); if (onDoubleTap) onDoubleTap(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  return {
    state,
    update() {
      if (pid === null) {
        // entre deux appuis clavier, on recalcule depuis les touches
        let th = 0, st = 0;
        if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('KeyZ')) th += 1;
        if (keys.has('ArrowDown') || keys.has('KeyS')) th -= 1;
        if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) st -= 1;
        if (keys.has('ArrowRight') || keys.has('KeyD')) st += 1;
        state.throttle = th; state.steer = st;
      }
    },
    onDoubleTap(fn) { onDoubleTap = fn; },
    hasMoved() { return Math.abs(state.throttle) > 0.15; },
  };
}
