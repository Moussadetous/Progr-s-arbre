// Les commandes : clavier (ZQSD, WASD, flèches), manette analogique, joystick tactile, glisser pour regarder, molette / pincement pour zoomer.
export class Commandes {
  constructor(canvas, { stick, knob } = {}) {
    this.touches = new Set();
    this.mx = 0; // droite (+) / gauche (-)
    this.my = 0; // avant (+) / arrière (-)
    this.sprint = false;
    this.dLacet = 0;
    this.dTangage = 0;
    this.zoom = 1;
    this.actions = []; // touches à action unique
    this.stick = stick;
    this.knob = knob;
    this.stickId = null;
    this.stickX = 0;
    this.stickY = 0;
    this.pointeurs = new Map();
    this.pincement = 0;

    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (!this.touches.has(k)) this.actions.push(k);
      this.touches.add(k);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.touches.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.touches.clear());

    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointeurs.size === 2) this.pincement = this.ecartPointeurs();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointeurs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointeurs.size === 1) {
        this.dLacet -= dx * 0.0055;
        this.dTangage += dy * 0.004;
      } else if (this.pointeurs.size === 2) {
        const ecart = this.ecartPointeurs();
        if (this.pincement > 0) this.zoom *= this.pincement / Math.max(1, ecart);
        this.pincement = ecart;
      }
    });
    const fin = (e) => { this.pointeurs.delete(e.pointerId); this.pincement = 0; };
    canvas.addEventListener('pointerup', fin);
    canvas.addEventListener('pointercancel', fin);

    if (stick) this.brancherStick();
  }

  ecartPointeurs() {
    const [a, b] = [...this.pointeurs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  brancherStick() {
    const { stick, knob } = this;
    const RAYON = 52;
    const maj = (e) => {
      const r = stick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > RAYON) { dx = (dx / l) * RAYON; dy = (dy / l) * RAYON; }
      this.stickX = dx / RAYON;
      this.stickY = -dy / RAYON;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { e.preventDefault(); stick.setPointerCapture(e.pointerId); this.stickId = e.pointerId; maj(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) maj(e); });
    const fin = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null; this.stickX = 0; this.stickY = 0; knob.style.transform = 'translate(0, 0)';
    };
    stick.addEventListener('pointerup', fin);
    stick.addEventListener('pointercancel', fin);
  }

  // Lit l'état courant : mouvement dans [-1, 1] (analogique), rotation de caméra et zoom accumulés depuis la dernière lecture
  lire() {
    const t = this.touches;
    let mx = (t.has('d') || t.has('arrowright') ? 1 : 0) - (t.has('q') || t.has('a') || t.has('arrowleft') ? 1 : 0);
    let my = (t.has('z') || t.has('w') || t.has('arrowup') ? 1 : 0) - (t.has('s') || t.has('arrowdown') ? 1 : 0);
    let sprint = t.has('shift');
    let lacet = this.dLacet;
    let tangage = this.dTangage;
    let zoom = this.zoom;
    // zoom au clavier
    if (t.has('+') || t.has('=') || t.has('pageup')) zoom *= 0.97;
    if (t.has('-') || t.has('pagedown')) zoom *= 1.03;
    // manette : stick gauche = marcher, stick droit = regarder, gâchettes = zoom
    const pad = (navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null);
    if (pad) {
      const mort = (v) => (Math.abs(v) < 0.14 ? 0 : v);
      mx += mort(pad.axes[0] || 0);
      my -= mort(pad.axes[1] || 0);
      lacet -= mort(pad.axes[2] || 0) * 0.04;
      tangage += mort(pad.axes[3] || 0) * 0.03;
      sprint = sprint || !!(pad.buttons[0] && pad.buttons[0].pressed);
      if (pad.buttons[6] && pad.buttons[6].pressed) zoom *= 0.97;
      if (pad.buttons[7] && pad.buttons[7].pressed) zoom *= 1.03;
    }
    // joystick tactile
    mx += this.stickX;
    my += this.stickY;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    this.dLacet = 0;
    this.dTangage = 0;
    this.zoom = 1;
    const actions = this.actions;
    this.actions = [];
    return { mx, my, sprint, lacet, tangage, zoom, actions };
  }
}
