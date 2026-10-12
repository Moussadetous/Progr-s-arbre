// Le monde de l'arbre : règles de croissance, géométrie et chemins. Pur calcul (tableaux [x, y, z]).
//
// Règles :
//  - un tronc droit, une capitale (place autour du tronc, sans feuilles) et 4 branches par défaut ;
//  - une personne = une grande feuille, accrochée à un emplacement fixe de branche, en alternant gauche/droite ;
//  - une branche s'allonge et s'épaissit à chaque feuille qu'elle porte ;
//  - quand toutes les branches sont à leur longueur maximale, une nouvelle branche pousse sur le tronc ;
//  - une feuille ne bouge jamais : la personne n° i a toujours le même emplacement.
import { add, sub, mul, dot, cross, normer, lerp3, clamp, mulberry32 } from './geometrie.js';

export const BRANCHES_DEFAUT = 4;
export const PAS = 2.4; // m : écart entre deux emplacements consécutifs (gauche/droite en alternance : 4,8 m du même côté)
export const DEBUT = 6 * PAS;
const K0 = 3; // premier point de passage de la branche (le début est dans le tronc) // m : le début de la branche, près du tronc, reste libre
export const LONGUEUR_MAX = 69; // m : longueur maximale d'une branche
export const FEUILLE_LONGUEUR = 6.2; // m : une feuille est énorme pour la boule (0,22 m de rayon)
export const FEUILLE_DEMI_LARGEUR = 1.7;
export const RAYON_BOULE = 0.07; // m : la boule est minuscule, une feuille fait 6 m
export const HAUTEUR_CAPITALE = 10;
export const ECART_ETAGE = 5.5; // m de hauteur entre deux branches de tronc supplémentaires
export const RAYON_TRONC = 8.5;

export const rayonTronc = (y) => RAYON_TRONC - 0.04 * clamp(y - HAUTEUR_CAPITALE, -40, 80);

// ---------- échantillonnage d'une courbe ----------
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

// Échantillonne à pas égaux (en longueur) et construit un repère : tangente, N (vers le haut), B (transport parallèle)
export function echantillonner(pts, n) {
  const D = 600;
  const dense = [];
  for (let i = 0; i <= D; i++) dense.push(catmull(pts, (i / D) * (pts.length - 1)));
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
    frames.push({ s, pos: lerp3(dense[j], dense[j + 1], u) });
  }
  let N = null;
  for (let i = 0; i < n; i++) {
    const T = normer(sub(frames[Math.min(n - 1, i + 1)].pos, frames[Math.max(0, i - 1)].pos));
    let c = N || [0, 1, 0];
    c = sub(c, mul(T, dot(c, T)));
    N = normer(c);
    frames[i].tan = T;
    frames[i].N = N;
    frames[i].B = normer(cross(T, N));
  }
  return { frames, longueur: total };
}

// ---------- géométrie d'une branche (la forme complète est fixe, seule la longueur visible grandit) ----------
const cacheCourbes = new Map();

export function azimutBranche(id) {
  return ((id < BRANCHES_DEFAUT ? 30 + id * 90 : 30 + id * 137.5) * Math.PI) / 180;
}

export function hauteurBranche(id) {
  return id < BRANCHES_DEFAUT ? HAUTEUR_CAPITALE : HAUTEUR_CAPITALE + ECART_ETAGE * (id - BRANCHES_DEFAUT + 1);
}

export function courbeBranche(id) {
  if (cacheCourbes.has(id)) return cacheCourbes.get(id);
  const hasard = mulberry32(1000 + id * 17);
  const entre = (a, b) => a + (b - a) * hasard();
  const az = azimutBranche(id);
  const y = hauteurBranche(id);
  const dir = [Math.cos(az), 0, Math.sin(az)];
  const lat = [-dir[2], 0, dir[0]];
  const depart = [dir[0] * (rayonTronc(y) - 1.8), y + 0.3, dir[2] * (rayonTronc(y) - 1.8)];
  const pt = (d, h, w) => add(depart, add(add(mul(dir, d), mul(lat, w)), [0, h, 0]));
  const w = [entre(-1, 1), entre(-3, 3), entre(-4, 4), entre(-4, 4), entre(-3.5, 3.5)];
  const pts = [
    depart, pt(9, 1.8, w[0]), pt(22, 3.4, w[1]), pt(38, 3.0, w[2]), pt(54, 1.0, w[3]), pt(71, -2.2, w[4]),
  ];
  const { frames, longueur: total } = echantillonner(pts, 145);
  const c = { id, azimut: az, hauteur: y, frames, total };
  cacheCourbes.set(id, c);
  return c;
}

// Repère de la branche à l'abscisse s (en mètres depuis le tronc)
export function repereS(courbe, s) {
  const f = courbe.frames;
  const x = clamp(s / courbe.total, 0, 1) * (f.length - 1);
  const i = Math.min(f.length - 2, Math.floor(x));
  const u = x - i;
  const a = f[i];
  const b = f[i + 1];
  return {
    s,
    pos: lerp3(a.pos, b.pos, u),
    tan: normer(lerp3(a.tan, b.tan, u)),
    N: normer(lerp3(a.N, b.N, u)),
    B: normer(lerp3(a.B, b.B, u)),
  };
}

// Longueur et rayon d'une branche selon le nombre de feuilles qu'elle porte
export const longueurBranche = (n) => Math.min(LONGUEUR_MAX, Math.max(34, DEBUT + n * PAS + 6));
export const rayonBase = (n) => 2.0 + 0.12 * n;
export function rayonA(n, s) {
  const L = longueurBranche(n);
  const t = clamp(s / L, 0, 1);
  const rb = rayonBase(n);
  let r = 0.38 + (rb - 0.38) * Math.pow(1 - t, 0.85) + 0.4 * Math.max(0, 1 - s / 5);
  if (t > 0.93) r = r * Math.sqrt(Math.max(0, (1 - t) / 0.07)) + 0.02;
  return r;
}

// Frames du tube visible d'une branche (pour le rendu)
export function framesVisibles(id, n, pas = 0.5) {
  const c = courbeBranche(id);
  const L = longueurBranche(n);
  const out = [];
  const nb = Math.ceil(L / pas);
  for (let i = 0; i <= nb; i++) {
    const s = Math.min(L, i * pas);
    const r = repereS(c, s);
    out.push({ ...r, rayon: rayonA(n, s) });
  }
  return out;
}

// Point de la surface de la branche : theta = 0 vers le haut, positif vers B
export function surfaceBranche(id, n, s, theta, decalage = 0) {
  const r = repereS(courbeBranche(id), s);
  const normale = normer(add(mul(r.N, Math.cos(theta)), mul(r.B, Math.sin(theta))));
  return { pos: add(r.pos, mul(normale, rayonA(n, s) + decalage)), normale, repere: r };
}

// ---------- feuille : forme et repère ----------
export const STEM_LONGUEUR = 1.1;
export const Y_TIGE = 0.3;
// u de -1 à 1 (largeur), v de 0 à 1 (longueur). Repère local : x travers, y haut, z vers l'extérieur.
export const demiLargeurLimbe = (v) => FEUILLE_DEMI_LARGEUR * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + clamp(v, 0, 1) * 0.94)), 0.7);
export function pointFeuille(u, v) {
  const y = 0.3 + 0.5 * Math.sin(0.7 * Math.PI * v) - 0.55 * v * v + 0.32 * u * u;
  return [u * demiLargeurLimbe(v), y, STEM_LONGUEUR + FEUILLE_LONGUEUR * v];
}

// Hauteur de la feuille au point (x, z) de son repère local (la tige est à plat, le limbe est creusé en gouttière)
export function hauteurFeuille(x, z) {
  if (z < STEM_LONGUEUR) return Y_TIGE;
  const v = (z - STEM_LONGUEUR) / FEUILLE_LONGUEUR;
  const u = clamp(x / Math.max(0.05, demiLargeurLimbe(v)), -1, 1);
  return pointFeuille(u, v)[1];
}

// Largeur praticable de la feuille à la distance z de la branche
export function demiLargeurPraticable(z) {
  if (z < STEM_LONGUEUR) return 0.14;
  return Math.max(0, demiLargeurLimbe((z - STEM_LONGUEUR) / FEUILLE_LONGUEUR) - 0.12);
}
export const Z_MAX_FEUILLE = STEM_LONGUEUR + FEUILLE_LONGUEUR * 0.96;

// Repère monde d'une feuille : origine sur l'épaule de la branche, axes x, y, z, échelle par axe.
// Chaque feuille a ses propres variations (taille, cap, inclinaison), fixes et déterministes.
export function repereFeuille(feuille, nBranche) {
  const h = mulberry32(5000 + feuille.indice);
  const alea = () => h();
  const jitterS = (alea() - 0.5) * 0.5;
  const lacet = (alea() - 0.5) * 0.6;
  const inclinaison = -0.22 + alea() * 0.34;
  const ex = 0.88 + alea() * 0.22;
  const ez = 0.86 + alea() * 0.32;
  const ey = 0.9 + alea() * 0.2;
  const { pos, normale, repere } = surfaceBranche(feuille.branche, nBranche, feuille.s + jitterS, feuille.cote * 1.25, -0.06);
  let z = normer([normale[0], 0, normale[2]]);
  z = normer(add(z, mul(repere.tan, 0.3)));
  z = normer([z[0] * Math.cos(lacet) - z[2] * Math.sin(lacet), z[1], z[0] * Math.sin(lacet) + z[2] * Math.cos(lacet)]);
  const x = normer(cross([0, 1, 0], z));
  const y = normer(cross(z, x));
  const c = Math.cos(inclinaison);
  const sn = Math.sin(inclinaison);
  return { origine: pos, x, y: normer(sub(mul(y, c), mul(z, sn))), z: normer(add(mul(z, c), mul(y, sn))), ex, ey, ez };
}

export function localVersMonde(r, p) {
  return add(r.origine, add(add(mul(r.x, p[0] * r.ex), mul(r.y, p[1] * r.ey)), mul(r.z, p[2] * r.ez)));
}

// Position de la boule au milieu de la feuille
export function centreFeuille(repere) {
  return add(localVersMonde(repere, pointFeuille(0, 0.42)), mul(repere.y, RAYON_BOULE));
}

export const hauteurTronc = (nbBranches) => Math.max(36, hauteurBranche(nbBranches - 1) + 16);

// ---------- la croissance ----------
export class Monde {
  constructor() {
    this.branches = [];
    this.feuilles = [];
    for (let i = 0; i < BRANCHES_DEFAUT; i++) this.pousserBranche();
  }

  pousserBranche() {
    const id = this.branches.length;
    this.branches.push({ id, n: 0 });
    return id;
  }

  capacite() {
    return Math.floor((LONGUEUR_MAX - 5 - DEBUT) / PAS); // nombre d'emplacements par branche
  }

  pleine(b) {
    return b.n >= this.capacite();
  }

  // Une nouvelle personne arrive : elle prend la branche la moins chargée qui a encore de la place,
  // sinon une nouvelle branche pousse sur le tronc.
  ajouter() {
    let cible = null;
    for (const b of this.branches) {
      if (this.pleine(b)) continue;
      if (!cible || b.n < cible.n) cible = b;
    }
    let nouvelle = false;
    if (!cible) {
      cible = this.branches[this.pousserBranche()];
      nouvelle = true;
    }
    const slot = cible.n;
    cible.n++;
    const feuille = {
      indice: this.feuilles.length,
      branche: cible.id,
      slot,
      s: DEBUT + slot * PAS,
      cote: slot % 2 === 0 ? 1 : -1,
    };
    this.feuilles.push(feuille);
    return { feuille, nouvelleBranche: nouvelle };
  }

  hauteurTronc() {
    return hauteurTronc(this.branches.length);
  }

  repereDe(feuille) {
    return repereFeuille(feuille, this.branches[feuille.branche].n);
  }
}

