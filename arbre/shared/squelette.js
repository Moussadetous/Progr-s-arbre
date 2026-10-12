// Squelette du monde de l'atelier : un tronc et quatre grosses branches courbes.
// Pur calcul (tableaux [x, y, z]) : partagé par le rendu, les tests et, plus tard, le serveur.
// Unité : 1 mètre.
import { add, sub, mul, dot, cross, normer, lerp3, clamp, Y } from './geometrie.js';
import { mulberry32 } from './arbre.js';

export const NB_ECHANTILLONS = 90;

// Catmull-Rom uniforme : t va de 0 à (nombre de points - 1)
function catmull(pts, t) {
  const n = pts.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(t)));
  const u = t - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n - 1, i + 2)];
  const u2 = u * u;
  const u3 = u2 * u;
  return [0, 1, 2].map((k) => 0.5 * (
    2 * p1[k] + (-p0[k] + p2[k]) * u
    + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2
    + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3));
}

// Échantillonne une courbe à pas égaux (en longueur) et construit un repère le long de la courbe.
// courbe = { pts, rayon(t) }. Chaque repère : pos, tan, N (vers le haut), B, rayon, s (abscisse), t (0..1).
export function echantillonner(courbe, n = NB_ECHANTILLONS) {
  const dense = [];
  const D = 600;
  for (let i = 0; i <= D; i++) dense.push(catmull(courbe.pts, (i / D) * (courbe.pts.length - 1)));
  const cumul = [0];
  for (let i = 1; i <= D; i++) {
    const d = sub(dense[i], dense[i - 1]);
    cumul.push(cumul[i - 1] + Math.hypot(d[0], d[1], d[2]));
  }
  const total = cumul[D];
  const frames = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < D - 1 && cumul[j + 1] < s) j++;
    const u = (s - cumul[j]) / Math.max(1e-9, cumul[j + 1] - cumul[j]);
    frames.push({ t: i / (n - 1), s, pos: lerp3(dense[j], dense[j + 1], u), rayon: courbe.rayon(i / (n - 1)) });
  }
  // Tangentes, puis transport parallèle d'une normale initialement tournée vers le haut
  let N = null;
  for (let i = 0; i < n; i++) {
    const a = frames[Math.max(0, i - 1)].pos;
    const b = frames[Math.min(n - 1, i + 1)].pos;
    const T = normer(sub(b, a));
    let c = N || Y;
    c = sub(c, mul(T, dot(c, T)));
    if (Math.hypot(c[0], c[1], c[2]) < 0.05) c = sub([1, 0, 0], mul(T, T[0]));
    N = normer(c);
    frames[i].tan = T;
    frames[i].N = N;
    frames[i].B = normer(cross(T, N));
  }
  return { frames, longueur: total };
}

// Repère interpolé à l'abscisse t (0..1)
export function repereA(branche, t) {
  const f = branche.frames;
  const x = clamp(t, 0, 1) * (f.length - 1);
  const i = Math.min(f.length - 2, Math.floor(x));
  const u = x - i;
  const a = f[i];
  const b = f[i + 1];
  return {
    t,
    pos: lerp3(a.pos, b.pos, u),
    tan: normer(lerp3(a.tan, b.tan, u)),
    N: normer(lerp3(a.N, b.N, u)),
    B: normer(lerp3(a.B, b.B, u)),
    rayon: a.rayon + (b.rayon - a.rayon) * u,
  };
}

// Point de la surface de la branche : theta = 0 vers le haut, positif vers B
export function pointSurface(repere, theta) {
  const normale = normer(add(mul(repere.N, Math.cos(theta)), mul(repere.B, Math.sin(theta))));
  return { pos: add(repere.pos, mul(normale, repere.rayon)), normale };
}

// Le monde : un tronc vertical et quatre grosses branches, réparties autour de lui
export function creerSquelette({ graine = 7 } = {}) {
  const hasard = mulberry32(graine);
  const entre = (a, b) => a + (b - a) * hasard();

  const tronc = echantillonner({
    pts: [[0, -45, 0], [1.2, -12, 0.6], [0, 10, 0], [-0.8, 34, 0.8]],
    rayon: (t) => {
      const base = 7.6 - 2.4 * t;
      if (t < 0.7) return base;
      const u = (t - 0.7) / 0.3; // le sommet se termine en dôme arrondi
      return base * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2))) + 0.02;
    },
  }, 60);

  const hauteurs = [9, 12.5, 16, 19.5];
  const longueurs = [0, 5, -3, 8];
  const branches = [];
  for (let k = 0; k < 4; k++) {
    const az = ((k * 90 + 20 + entre(-14, 14)) * Math.PI) / 180;
    const dir = [Math.cos(az), 0, Math.sin(az)];
    const lat = [-dir[2], 0, dir[0]];
    // centre du tronc à cette hauteur
    let centre = tronc.frames[0];
    for (const f of tronc.frames) if (Math.abs(f.pos[1] - hauteurs[k]) < Math.abs(centre.pos[1] - hauteurs[k])) centre = f;
    const depart = add(centre.pos, add(mul(dir, centre.rayon - 1.6), [0, hauteurs[k] - centre.pos[1], 0]));
    const L = longueurs[k];
    const pt = (d, h, w) => add(depart, add(add(mul(dir, d), mul(lat, w)), [0, h, 0]));
    const pts = [
      depart,
      pt(8, 2.4, entre(-1.5, 1.5)),
      pt(19, 3.4, entre(-3.5, 3.5)),
      pt(30 + L * 0.5, 2.2, entre(-4.5, 4.5)),
      pt(41 + L, -1.2, entre(-4, 4)),
    ];
    const r0 = 2.3 + entre(0, 0.45);
    const courbe = { pts, rayon: (t) => 0.55 + (r0 - 0.55) * Math.pow(1 - t, 0.9) + 0.35 * Math.max(0, 1 - t * 9) };
    const { frames, longueur } = echantillonner(courbe);
    branches.push({ id: k, azimut: az, frames, longueur });
  }
  return { tronc, branches };
}
