// Audio 100% synthétisé (WebAudio) : nappe de vent, oiseaux, gouttes d'eau
// souterraines, carillon des découvertes. Aucun fichier son nécessaire.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let windGain = null, underGain = null, birdTimer = 0, dripTimer = 0, echo = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return false; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // vent doux (deux oscillateurs désaccordés + filtre balayé)
    windGain = ctx.createGain(); windGain.gain.value = 0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start();
    for (const f of [96, 144.3]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.5;
      o.connect(g).connect(windFilter);
      o.start();
    }
    windFilter.connect(windGain).connect(master);

    // drone souterrain
    underGain = ctx.createGain(); underGain.gain.value = 0;
    for (const f of [52, 78.5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.35;
      o.connect(g).connect(underGain);
      o.start();
    }
    // léger trémolo
    const trem = ctx.createOscillator(); trem.frequency.value = 0.21;
    const tremG = ctx.createGain(); tremG.gain.value = 0.12;
    trem.connect(tremG).connect(underGain.gain);
    trem.start();
    underGain.connect(master);

    // écho pour les gouttes
    echo = ctx.createDelay(1.0);
    echo.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    echo.connect(fb).connect(echo);
    const wet = ctx.createGain(); wet.gain.value = 0.4;
    echo.connect(wet).connect(master);
    return true;
  }

  function note(freq, t0, dur, vol = 0.16, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  return {
    init() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    // f : 0 jour, 1 sous-sol
    update(dt, f) {
      if (!ctx || muted) return;
      windGain.gain.value = 0.05 * (1 - f);
      underGain.gain.value = 0.06 * f;
      birdTimer -= dt; dripTimer -= dt;
      if (birdTimer <= 0 && f < 0.4) {
        birdTimer = 3 + Math.random() * 7;
        const t0 = ctx.currentTime;
        const base = 1700 + Math.random() * 900;
        const n = 2 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const t = t0 + i * 0.14;
          note(base + Math.random() * 300, t, 0.12, 0.028);
          note(base * 1.5, t + 0.03, 0.08, 0.014);
        }
      }
      if (dripTimer <= 0 && f > 0.5) {
        dripTimer = 1.5 + Math.random() * 5;
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f0 = 700 + Math.random() * 700;
        o.frequency.setValueAtTime(f0, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.55, ctx.currentTime + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        o.connect(g); g.connect(master); g.connect(echo);
        o.start(); o.stop(ctx.currentTime + 0.4);
      }
    },
    chime() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        note(f, t0 + i * 0.13, 1.1, 0.11);
        note(f * 2, t0 + i * 0.13, 0.5, 0.03, 'triangle');
      });
    },
    blip() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      note(1318.5, t0, 0.22, 0.09);
      note(1975.5, t0 + 0.06, 0.18, 0.05);
    },
    celebration() {
      if (!ctx || muted) return;
      const t0 = ctx.currentTime;
      const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
      seq.forEach((f, i) => {
        note(f, t0 + i * 0.09, 0.9, 0.1);
        note(f * 1.5, t0 + i * 0.09 + 0.02, 0.6, 0.03, 'triangle');
      });
    },
  };
}
