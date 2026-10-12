// Gestes sur le canevas : un tap = choisir, glisser = tourner, molette ou deux doigts = zoomer,
// survol à la souris = info-bulle.
export function brancherSaisie(element, { onClic, onTourner, onZoom, onSurvol }) {
  const pointeurs = new Map();
  let debut = null; // premier appui du geste : position et heure
  let glisse = false; // le doigt a assez bougé pour que ce soit un glisser
  let multi = false; // deux doigts ou plus pendant ce geste
  let ecart = 0;

  const distanceEntreDoigts = () => {
    const [a, b] = [...pointeurs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.size === 1) {
      debut = { x: e.clientX, y: e.clientY, t: performance.now() };
      glisse = false;
      multi = false;
    }
    if (pointeurs.size === 2) {
      multi = true;
      ecart = distanceEntreDoigts();
    }
  });

  element.addEventListener('pointermove', (e) => {
    if (!pointeurs.has(e.pointerId)) {
      if (e.pointerType === 'mouse') onSurvol(e.clientX, e.clientY);
      return;
    }
    const avant = pointeurs.get(e.pointerId);
    pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.size >= 2) {
      const d = distanceEntreDoigts();
      if (ecart > 0 && d > 0) onZoom(ecart / d);
      ecart = d;
      return;
    }
    if (debut && Math.hypot(e.clientX - debut.x, e.clientY - debut.y) > 8) glisse = true;
    if (glisse) onTourner(e.clientX - avant.x, e.clientY - avant.y);
  });

  const fin = (e) => {
    if (!pointeurs.has(e.pointerId)) return;
    pointeurs.delete(e.pointerId);
    if (pointeurs.size === 0 && !glisse && !multi && debut && performance.now() - debut.t < 500) {
      onClic(e.clientX, e.clientY);
    }
    if (pointeurs.size === 0) glisse = false;
  };
  element.addEventListener('pointerup', fin);
  element.addEventListener('pointercancel', fin);

  element.addEventListener('wheel', (e) => {
    e.preventDefault();
    onZoom(Math.exp(e.deltaY * 0.0015));
  }, { passive: false });
}
