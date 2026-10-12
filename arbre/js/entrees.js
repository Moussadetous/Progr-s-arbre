// Entrées : clavier (ZQSD / WASD / flèches, Maj pour courir), souris et tactile.
//  - Clavier : marcher par rapport à la caméra. Maj : courir.
//  - Souris : un clic = aller là ; glisser = tourner la caméra ; molette = zoom.
//  - Tactile : un tap = aller là ; glisser d'un doigt = manette (on marche dans cette direction) ;
//    deux doigts = tourner et zoomer.
const TOUCHES = {
  z: [0, 1], w: [0, 1], arrowup: [0, 1],
  s: [0, -1], arrowdown: [0, -1],
  q: [-1, 0], a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};
const RAYON_MANETTE = 70; // px : au-delà, la manette est à fond
const SEUIL_GLISSE = 10; // px : en dessous, c'est un tap

export function creerEntrees(element, { onClic, onTourner, onZoom, onSurvol }) {
  const tenues = new Set();
  let maj = false;
  let manette = { avant: 0, droite: 0 };

  const dansChamp = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
  window.addEventListener('keydown', (e) => {
    if (dansChamp(e)) return;
    const k = e.key.toLowerCase();
    if (TOUCHES[k]) {
      tenues.add(k);
      e.preventDefault();
    }
    if (e.key === 'Shift') maj = true;
  });
  window.addEventListener('keyup', (e) => {
    tenues.delete(e.key.toLowerCase());
    if (e.key === 'Shift') maj = false;
  });
  window.addEventListener('blur', () => {
    tenues.clear();
    maj = false;
    manette = { avant: 0, droite: 0 };
  });

  // Direction voulue, dans l'espace de la caméra. avant/droite sont dans [-1, 1].
  function vecteur() {
    let avant = manette.avant;
    let droite = manette.droite;
    for (const k of tenues) {
      const [x, z] = TOUCHES[k];
      droite += x;
      avant += z;
    }
    return {
      avant: Math.max(-1, Math.min(1, avant)),
      droite: Math.max(-1, Math.min(1, droite)),
      course: maj,
    };
  }

  // Pointeurs : un par doigt ou un pour la souris
  const pointeurs = new Map();
  let debut = null; // premier appui du geste
  let glisse = false;
  let multi = false;
  let ecart = 0;
  let milieuPrecedent = null;

  const distanceDoigts = () => {
    const [a, b] = [...pointeurs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const milieu = () => {
    const [a, b] = [...pointeurs.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (pointeurs.size === 1) {
      debut = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
      glisse = false;
      multi = false;
      manette = { avant: 0, droite: 0 };
    }
    if (pointeurs.size === 2) {
      multi = true;
      manette = { avant: 0, droite: 0 };
      ecart = distanceDoigts();
      milieuPrecedent = milieu();
    }
  });

  element.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) {
      if (e.pointerType === 'mouse') onSurvol(e.clientX, e.clientY);
      return;
    }
    const avant = pointeurs.get(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: avant.type });

    if (pointeurs.size >= 2) {
      const d = distanceDoigts();
      if (ecart > 0 && d > 0) onZoom(ecart / d);
      ecart = d;
      const m = milieu();
      if (milieuPrecedent) onTourner(m.x - milieuPrecedent.x, m.y - milieuPrecedent.y);
      milieuPrecedent = m;
      return;
    }

    if (debut && Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > SEUIL_GLISSE) glisse = true;
    if (!glisse) return;
    if (debut.type === 'touch') {
      // Manette : la distance au point de départ donne la direction et la force
      const ex = e.clientX - debut.x;
      const ey = e.clientY - debut.y;
      const L = Math.hypot(ex, ey) || 1;
      const force = Math.min(1, L / RAYON_MANETTE);
      manette = { droite: (ex / L) * force, avant: (-ey / L) * force };
    } else {
      onTourner(e.clientX - avant.x, e.clientY - avant.y);
    }
  });

  const fin = (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2) milieuPrecedent = null;
    if (pointeurs.size === 0) {
      if (!glisse && !multi && debut && performance.now() - debut.t < 450) onClic(e.clientX, e.clientY);
      manette = { avant: 0, droite: 0 };
      glisse = false;
    }
  };
  element.addEventListener('pointerup', fin);
  element.addEventListener('pointercancel', fin);

  element.addEventListener('wheel', (e) => {
    e.preventDefault();
    onZoom(Math.exp(e.deltaY * 0.0015));
  }, { passive: false });

  return { vecteur };
}
