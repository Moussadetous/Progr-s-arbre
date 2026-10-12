// Courbes des branches : une branche est décrite par sa « ligne de faîte », le dessus où l'on marche.
// On échantillonne une Catmull-Rom à pas égaux et on calcule un repère « tenu par la gravité » :
//   t : tangente, b : côté droit (toujours horizontal), n : le haut de la section (perpendiculaire à t, dans le plan vertical).
import { sub, add, mul, dot, cross, normer, lerp3, clamp } from './geometrie.js';

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

export function repereGravite(t) {
  let b = cross(t, [0, 1, 0]);
  if (Math.hypot(b[0], b[1], b[2]) < 1e-6) b = [1, 0, 0];
  b = normer(b);
  const n = normer(cross(b, t));
  return { b, n };
}

// pts : points de contrôle ; pas : distance entre échantillons (m)
export function creerCourbe(pts, pas = 0.5) {
  const D = Math.max(200, (pts.length - 1) * 120);
  const dense = [];
  for (let i = 0; i <= D; i++) dense.push(catmull(pts, (i / D) * (pts.length - 1)));
  const cumul = [0];
  for (let i = 1; i <= D; i++) {
    const d = sub(dense[i], dense[i - 1]);
    cumul.push(cumul[i - 1] + Math.hypot(d[0], d[1], d[2]));
  }
  const total = cumul[D];
  const n = Math.max(2, Math.round(total / pas) + 1);
  const ech = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < D - 1 && cumul[j + 1] < s) j++;
    const u = (s - cumul[j]) / Math.max(1e-9, cumul[j + 1] - cumul[j]);
    ech.push({ s, p: lerp3(dense[j], dense[j + 1], u) });
  }
  for (let i = 0; i < n; i++) {
    const t = normer(sub(ech[Math.min(n - 1, i + 1)].p, ech[Math.max(0, i - 1)].p));
    const { b, n: nn } = repereGravite(t);
    ech[i].t = t;
    ech[i].b = b;
    ech[i].n = nn;
  }
  return { ech, longueur: total, pas: total / (n - 1) };
}

// Repère interpolé à l'abscisse s
export function aAbscisse(courbe, s) {
  const e = courbe.ech;
  const x = clamp(s / courbe.pas, 0, e.length - 1);
  const i = Math.min(e.length - 2, Math.floor(x));
  const u = x - i;
  const a = e[i];
  const c = e[i + 1];
  const t = normer(lerp3(a.t, c.t, u));
  const { b, n } = repereGravite(t);
  return { s, p: lerp3(a.p, c.p, u), t, b, n };
}

// Pente maximale (en valeur absolue de la composante verticale de la tangente) entre deux abscisses
export function penteMax(courbe, s0 = 0, s1 = Infinity) {
  let m = 0;
  for (const e of courbe.ech) if (e.s >= s0 && e.s <= s1) m = Math.max(m, Math.abs(e.t[1]));
  return m;
}

// Point de Hermite cubique (pour les ponts) : de p0 (tangente m0) à p1 (tangente m1)
export function hermite(p0, m0, p1, m1, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return add(add(mul(p0, h00), mul(m0, h10)), add(mul(p1, h01), mul(m1, h11)));
}

export { dot };
