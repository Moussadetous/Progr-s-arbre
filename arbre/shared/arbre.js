// L'arbre-monde : la capitale au cœur du tronc, des branches qui sont des chemins, des feuilles-maisons.
//
// Règles de croissance (déterministes : la personne n° i a toujours la même maison) :
//  1. Au départ : le tronc, la capitale (une salle ouverte au cœur du tronc) et 4 branches maîtresses
//     qui partent du plancher de la capitale. Une seule maison pour la première personne.
//  2. Chaque personne reçoit une feuille-maison au bord d'un chemin, en alternant gauche et droite.
//     Une branche s'allonge pour accueillir ses maisons et s'épaissit avec ce qu'elle porte.
//  3. Quand tous les chemins sont pleins, l'arbre pousse : un rameau qui part d'une branche et monte
//     doucement, ou une branche d'étage plus haut sur le tronc, toujours reliée par un pont.
//  4. En grandissant, l'arbre jette des ponts entre des branches voisines : des chemins en pente douce,
//     praticables directement, qui raccourcissent les trajets.
// Tout chemin a une pente douce : on monte et on descend en marchant, sans jamais grimper.
//
// Une branche est décrite par sa « ligne de faîte » (le dessus, là où l'on marche) : quand elle
// s'épaissit, elle grossit vers le bas et sur les côtés, le chemin ne bouge pas.
import { add, sub, mul, dot, cross, normer, clamp, distance, mulberry32 } from './geometrie.js';
import { creerCourbe, aAbscisse, hermite } from './courbe.js';

export const Y0 = 10; // plancher de la capitale
export const R_TRONC = 8.5;
export const H_SALLE = 10; // hauteur de la salle de la capitale
export const R_SOL = R_TRONC - 0.15;
export const R_SCENE = 2.4;
export const H_SCENE = 0.16;
export const N_SECTION = 2.4; // section des branches : super-ellipse, un peu aplatie sur le dessus
export const ECRASEMENT = 0.94; // hauteur / largeur de la section
export const FRAC_MARCHE = 0.58; // on marche sur la bande du dessus (pente < 30°)
export const PAS_MAISONS = 3.4; // entre deux maisons consécutives (côtés alternés : 6,8 m du même côté)
export const ZONE_NOEUD = 4.6; // pas de maison du même côté autour d'un embranchement
export const PENTE_MAX_PONT = 0.45; // composante verticale maximale de la tangente d'un pont (≈ 27°)
export const ECART_ETAGE = 8;
export const PREMIER_ETAGE = Y0 + H_SALLE + 8; // le dessous des branches d'étage reste au-dessus de la salle
export const PROFONDEUR_MAX = 2;

const rad = (d) => (d * Math.PI) / 180;
export const COLONNES = [0, 1, 2, 3].map((k) => {
  const a = rad(75 + 90 * k);
  return { x: Math.cos(a) * 7.0, z: Math.sin(a) * 7.0, r: 1.8, a };
});

export const rayonTronc = (y) => R_TRONC - 0.03 * Math.max(0, y - (Y0 + H_SALLE));

// Caractéristiques par type de chemin
export const TYPES = {
  maitresse: { rMin: 2.5, rMax: 4.4, tau: 40, rBout: 0.9, Lmin: 30, sPremier: 13, maisons: true, evase: 0.5 },
  etage: { rMin: 2.1, rMax: 3.2, tau: 30, rBout: 0.8, Lmin: 26, sPremier: 11, maisons: true, evase: 0.4 },
  rameau: { rMin: 1.6, rMax: 2.6, tau: 24, rBout: 0.7, Lmin: 18, sPremier: 10, maisons: true, evase: 0 },
  brindille: { rMin: 1.25, rMax: 1.9, tau: 16, rBout: 0.6, Lmin: 15, sPremier: 9, maisons: true, evase: 0 },
  pont: { rMin: 1.15, rMax: 1.15, tau: 1, rBout: 1.15, Lmin: 0, sPremier: 0, maisons: false, evase: 0 },
};

const librePourPont = (n) => !n.usage && (n.role === 'pont' || n.rameauRate);

// ---------- un chemin ----------
export class Chemin {
  constructor(def) {
    Object.assign(this, def);
    this.courbe = creerCourbe(def.pts, 0.5);
    this.Lmax = this.courbe.longueur;
    this.T = TYPES[def.type];
    this.nMaisons = 0;
    this.enfants = 0;
    this.Lvis = def.type === 'pont' ? this.Lmax : Math.min(this.Lmax, this.T.Lmin);
    this.noeuds = (def.noeuds || []).filter((n) => n.s < this.Lmax - 8).map((n) => ({ ...n, usage: null }));
    this.slots = [];
    if (this.T.maisons) {
      let cote = def.premierCote || 1;
      for (let s = this.T.sPremier; s <= this.Lmax - 7; s += PAS_MAISONS) {
        const interdit = this.noeuds.some((n) => (n.deuxCotes || n.cote === cote) && Math.abs(n.s - s) < ZONE_NOEUD);
        this.slots.push({ s, cote, maison: null, interdit });
        cote = -cote;
      }
    }
  }

  charge() {
    return this.nMaisons + 3 * this.enfants;
  }

  rayonBase(max = false) {
    const T = this.T;
    if (max) return T.rMax;
    return T.rMin + (T.rMax - T.rMin) * (1 - Math.exp(-this.charge() / T.tau));
  }

  // Rayon (demi-largeur) de la section à l'abscisse s
  rayon(s, max = false, Lfin = this.Lvis) {
    const T = this.T;
    // un rameau ou un pont naît fin sur sa branche et s'élargit en s'en éloignant (pas de marche au raccord)
    const naissance = (x) => 0.55 + 0.45 * clamp(x / 7, 0, 1) ** 2 * (3 - 2 * clamp(x / 7, 0, 1));
    if (this.type === 'pont') return T.rMin * Math.min(naissance(s), naissance(this.Lmax - s));
    const rb = this.rayonBase(max);
    let r = T.rBout + (rb - T.rBout) * Math.pow(clamp(1 - s / this.Lmax, 0, 1), 0.55);
    r += T.evase * Math.max(0, 1 - s / 5);
    if (this.depart && this.depart.chemin !== undefined) r *= naissance(s);
    if (!max) {
      const reste = Lfin - s; // le bout d'une branche qui pousse s'effile
      if (reste < 6) r *= 0.06 + 0.94 * Math.sqrt(clamp(reste / 6, 0, 1));
    }
    return r;
  }

  sMarcheMax() {
    return this.type === 'pont' ? this.Lmax : this.Lvis - 3.5;
  }

  repere(s) {
    return aAbscisse(this.courbe, s);
  }

  // Écart vertical entre le faîte et la surface, à la distance latérale w
  creux(s, w, a = this.rayon(s)) {
    const t = Math.min(1, Math.abs(w) / a);
    return ECRASEMENT * a * (1 - Math.pow(1 - Math.pow(t, N_SECTION), 1 / N_SECTION));
  }

  demiLargeurMarche(s) {
    return FRAC_MARCHE * this.rayon(s);
  }

  // Point de la surface du dessus, à la distance latérale w du faîte (w > 0 : à droite)
  surface(s, w) {
    const r = this.repere(s);
    return add(add(r.p, mul(r.b, w)), mul(r.n, -this.creux(s, w)));
  }

  // Centre de la section (le faîte moins la demi-hauteur)
  centre(s, max = false) {
    const r = this.repere(s);
    return sub(r.p, mul(r.n, ECRASEMENT * this.rayon(s, max)));
  }

  // Longueur visible : assez pour porter ses maisons et ses embranchements
  majLongueur() {
    if (this.type === 'pont') return;
    let L = this.T.Lmin;
    for (const sl of this.slots) if (sl.maison !== null) L = Math.max(L, sl.s + 6.5);
    for (const n of this.noeuds) if (n.usage) L = Math.max(L, n.s + 7);
    this.Lvis = Math.min(this.Lmax, L);
  }
}

// ---------- encombrement d'une maison : un ellipsoïde ajusté à la feuille enroulée ----------
const DEMI_AXES = [2.6, 1.9, 2.9];
const CENTRE_LOCAL = [0, 1.45, 2.1];

export function dansEncombrement(enc, P, r) {
  const d = sub(P, enc.centre);
  const x = dot(d, enc.X) / (DEMI_AXES[0] + r);
  const y = d[1] / (DEMI_AXES[1] + r);
  const z = dot(d, enc.Z) / (DEMI_AXES[2] + r);
  return x * x + y * y + z * z < 1;
}

// ---------- grille spatiale (plan horizontal) ----------
const CELLULE = 6;
class Grille {
  constructor() {
    this.cases = new Map();
  }
  cle(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }
  ajouter(x, z, objet) {
    const k = this.cle(Math.floor(x / CELLULE), Math.floor(z / CELLULE));
    let l = this.cases.get(k);
    if (!l) { l = []; this.cases.set(k, l); }
    l.push(objet);
  }
  // Appelle f pour chaque objet des cases à moins de rayon du point (x, z)
  autour(x, z, rayon, f) {
    const i0 = Math.floor((x - rayon) / CELLULE);
    const i1 = Math.floor((x + rayon) / CELLULE);
    const j0 = Math.floor((z - rayon) / CELLULE);
    const j1 = Math.floor((z + rayon) / CELLULE);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const l = this.cases.get(this.cle(i, j));
        if (l) for (const o of l) f(o);
      }
    }
  }
}

// ---------- l'arbre ----------
export class Arbre {
  constructor({ graine = 7 } = {}) {
    this.graine = graine;
    this.chemins = [];
    this.maisons = [];
    this.grille = new Grille(); // échantillons de faîte des chemins + maisons
    this.version = 0;
    this.etages = []; // pour chaque étage : liste des chemins
    this.etagesRates = {};
    this.evenements = []; // journal de croissance
    for (let k = 0; k < 4; k++) this.ajouterChemin(this.defMaitresse(k));
  }

  hasard(cle) {
    return mulberry32(this.graine * 1000003 + cle);
  }

  // ----- définitions des chemins -----
  defMaitresse(k) {
    const h = this.hasard(100 + k);
    const az = rad(30 + 90 * k + (h() - 0.5) * 12);
    const dir = [Math.cos(az), 0, Math.sin(az)];
    const lat = [-Math.sin(az), 0, Math.cos(az)];
    const depart = add(mul(dir, 6), [0, Y0 - 0.06, 0]);
    const D = [0, 2.5, 10, 22, 36, 50, 64, 76];
    const H = [0, 0.06, 0.5, 1.8, 3.4, 4.6, 5.0, 4.4];
    const ecarts = [0, 0, 0, (h() - 0.5) * 3, (h() - 0.5) * 5, (h() - 0.5) * 5, (h() - 0.5) * 5, (h() - 0.5) * 5];
    const k2 = 0.85 + 0.3 * h();
    const pts = D.map((d, i) => add(depart, add(add(mul(dir, d), mul(lat, ecarts[i])), [0, i < 2 ? H[i] : H[i] * k2, 0])));
    return {
      type: 'maitresse', niveau: 0, profondeur: 0, parent: null, pts, depart: { capitale: true }, azimut: az,
      noeuds: [{ s: 22, cote: 1, role: 'rameau' }, { s: 34, cote: -1, role: 'pont' }, { s: 46, cote: 1, role: 'rameau' }, { s: 58, cote: -1, role: 'pont' }],
      premierCote: 1,
    };
  }

  // Branche d'étage : sort du tronc au-dessus de la capitale et plonge doucement ; on y arrive par un pont
  defEtage(niveau, j, azimutDeg) {
    const h = this.hasard(500 + niveau * 10 + j);
    const az = rad(azimutDeg + (h() - 0.5) * 6);
    const y = PREMIER_ETAGE + ECART_ETAGE * (niveau - 1);
    const dir = [Math.cos(az), 0, Math.sin(az)];
    const lat = [-Math.sin(az), 0, Math.cos(az)];
    const depart = add(mul(dir, rayonTronc(y) - 2.2), [0, y, 0]);
    const D = [0, 4, 12, 24, 38, 52, 64];
    const H = [0, -0.4, -1.8, -3.4, -3.8, -3.2, -2.4];
    const ecarts = [0, 0, (h() - 0.5) * 2, (h() - 0.5) * 4, (h() - 0.5) * 5, (h() - 0.5) * 5, (h() - 0.5) * 5];
    const pts = D.map((d, i) => add(depart, add(add(mul(dir, d), mul(lat, ecarts[i])), [0, H[i], 0])));
    return {
      type: 'etage', niveau, profondeur: 0, parent: null, pts, depart: { tronc: true }, azimut: az,
      noeuds: [
        { s: 18, cote: 1, role: 'pont', reserve: true, deuxCotes: true }, { s: 30, cote: -1, role: 'rameau' },
        { s: 42, cote: 1, role: 'pont' }, { s: 54, cote: -1, role: 'rameau' },
      ],
      premierCote: -1,
    };
  }

  // Rameau : part du dessus d'un chemin, s'écarte d'un côté et monte doucement (c'est lui qui emmène en haut)
  defRameau(parent, noeud, v) {
    const type = parent.profondeur === 0 ? 'rameau' : 'brindille';
    const r = parent.repere(noeud.s);
    const s0 = noeud.cote;
    const a = parent.rayon(noeud.s);
    const depart = parent.surface(noeud.s, s0 * 0.25 * a);
    const th = normer([r.t[0], 0, r.t[2]]);
    const alpha = rad(v.angle);
    const dir = normer(add(mul(th, Math.cos(alpha)), mul(r.b, s0 * Math.sin(alpha))));
    const lat = mul(normer(cross(dir, [0, 1, 0])), s0 * v.courbure);
    const longueur = type === 'rameau' ? 52 : 40;
    const D = [0, 8, 18, 30, 42, 52].map((d) => (d * longueur) / 52);
    const H = [0, 0.25, 1.4, 3.0, 4.2, 4.6].map((x, i) => (i < 2 ? x : x * v.montee));
    const L = [0, 0, 0.6, 1.6, 2.6, 3.0];
    let pts = D.map((d, i) => add(depart, add(add(mul(dir, d), mul(lat, L[i])), [0, H[i], 0])));
    if (v.coupe) pts = pts.slice(0, Math.max(3, pts.length - v.coupe));
    const noeuds = type === 'rameau'
      ? [{ s: 18, cote: s0, role: 'pont' }, { s: 30, cote: -s0, role: 'rameau' }, { s: 40, cote: s0, role: 'pont' }]
      : [{ s: 20, cote: s0, role: 'pont' }, { s: 30, cote: -s0, role: 'pont' }];
    return {
      type, niveau: parent.niveau, profondeur: parent.profondeur + 1, parent: parent.id, pts,
      depart: { chemin: parent.id, s: noeud.s, cote: s0 }, noeuds, premierCote: s0,
    };
  }

  // Côté d'un embranchement qui fait face au point P (null si l'embranchement ne lui fait pas face)
  coteVers(c, n, P) {
    const r = c.repere(n.s);
    const sens = Math.sign(dot(sub(P, r.p), r.b)) || 1;
    if (n.deuxCotes) return sens;
    return sens === n.cote ? n.cote : null;
  }

  // Pont : du dessus de A (embranchement na, côté ca) au dessus de B (embranchement nb, côté cb)
  defPont(A, na, ca, B, nb, cb) {
    const p0 = A.surface(na.s, ca * 0.25 * A.rayon(na.s));
    const p3 = B.surface(nb.s, cb * 0.25 * B.rayon(nb.s));
    const ra = A.repere(na.s);
    const rb = B.repere(nb.s);
    const versB = normer([p3[0] - p0[0], 0, p3[2] - p0[2]]);
    const e0 = normer(add(mul(ra.b, ca), mul(versB, 0.6)));
    const e1 = normer(add(mul(rb.b, -cb), mul(versB, 0.6)));
    const dy = p3[1] - p0[1];
    const q1 = add(p0, add(mul(e0, 3.5), [0, 0.1 * Math.sign(dy), 0]));
    const q2 = sub(p3, add(mul(e1, 3.5), [0, 0.1 * Math.sign(dy), 0]));
    const D = Math.hypot(q2[0] - q1[0], q2[2] - q1[2]);
    const m0 = mul(e0, D);
    const m1 = mul(e1, D);
    const pts = [p0, q1];
    for (const u of [0.25, 0.5, 0.75]) pts.push(hermite(q1, m0, q2, m1, u));
    pts.push(q2, p3);
    return {
      type: 'pont', niveau: Math.max(A.niveau, B.niveau), profondeur: 9, parent: A.id, pts,
      depart: { chemin: A.id, s: na.s, cote: ca }, arrivee: { chemin: B.id, s: nb.s, cote: cb },
      noeuds: [],
    };
  }

  // ----- ajout effectif -----
  ajouterChemin(def) {
    const c = new Chemin({ ...def, id: this.chemins.length });
    this.chemins.push(c);
    const e = c.courbe.ech;
    for (let i = 0; i < e.length; i += 2) this.grille.ajouter(e[i].p[0], e[i].p[2], { chemin: c, i });
    if (c.type === 'etage') (this.etages[c.niveau] ||= []).push(c);
    if (def.depart && def.depart.chemin !== undefined) this.chemins[def.depart.chemin].enfants++;
    if (def.arrivee) this.chemins[def.arrivee.chemin].enfants++;
    c.majLongueur();
    this.version++;
    return c;
  }

  // ----- géométrie des maisons -----
  repereMaison(m) {
    const c = this.chemins[m.chemin];
    const r = c.repere(m.s);
    const W = c.demiLargeurMarche(m.s);
    const O = c.surface(m.s, m.cote * W);
    const Z = mul(r.b, m.cote); // horizontal, vers l'extérieur
    const Y = [0, 1, 0];
    const X = cross(Y, Z);
    return { O, X, Y, Z };
  }

  versMonde(rep, p) {
    return add(rep.O, add(add(mul(rep.X, p[0]), mul(rep.Y, p[1])), mul(rep.Z, p[2])));
  }

  // Encombrement d'une maison, calculé avec la branche à son épaisseur maximale
  encombrementMaison(c, s, cote) {
    const r = c.repere(s);
    const W = FRAC_MARCHE * c.rayon(s, true);
    const O = add(r.p, mul(r.b, cote * W));
    const Z = mul(r.b, cote);
    const X = cross([0, 1, 0], Z);
    const k = CENTRE_LOCAL;
    const centre = add(O, add(add(mul(X, k[0]), [0, k[1], 0]), mul(Z, k[2])));
    return { centre, X, Z, chemin: c.id };
  }

  // ----- collisions -----
  // Un nouveau chemin (pas encore ajouté) touche-t-il un chemin, le tronc, la capitale ou une maison ?
  collisionChemin(c, { ignorer = [] } = {}) {
    const e = c.courbe.ech;
    const prochesDuDepart = (autreId, s) => c.depart && c.depart.chemin === autreId && s < 12;
    const prochesDeLArrivee = (autreId, s) => c.arrivee && c.arrivee.chemin === autreId && s > c.Lmax - 12;
    const dansTronc = (C) => C[1] > Y0 + H_SALLE && Math.hypot(C[0], C[2]) < rayonTronc(C[1]) - 0.5;
    for (let i = 0; i < e.length; i += 3) {
      const s = e[i].s;
      const C = c.centre(s, true);
      const r = c.rayon(s, true);
      if (dansTronc(C)) continue;
      if (!(c.type === 'etage' && s < 12)) {
        const dAxe = Math.hypot(C[0], C[2]);
        if (C[1] + r > Y0 - 3 && C[1] - r < Y0 + H_SALLE + 1) {
          if (dAxe < R_TRONC + r + 1.5) return { avec: 'capitale', s };
        } else if (dAxe < rayonTronc(C[1]) + r + 1) return { avec: 'tronc', s };
      }
      let touche = null;
      this.grille.autour(C[0], C[2], r + 9, (o) => {
        if (touche) return;
        if (o.maison) {
          const enc = o.maison.encombrement;
          if (prochesDuDepart(enc.chemin, s) && s < 6) return;
          if (prochesDeLArrivee(enc.chemin, s) && s > c.Lmax - 6) return;
          if (dansEncombrement(enc, C, r + 0.3)) touche = { avec: 'maison', s, id: o.maison.indice };
          return;
        }
        const autre = o.chemin;
        if (ignorer.includes(autre.id)) return;
        if (prochesDuDepart(autre.id, s) || prochesDeLArrivee(autre.id, s)) return;
        const so = autre.courbe.ech[o.i].s;
        const Co = autre.centre(so, true);
        if (dansTronc(Co)) return;
        if (distance(C, Co) < r + autre.rayon(so, true) + 0.8) touche = { avec: 'chemin', s, id: autre.id };
      });
      if (touche) return touche;
    }
    return null;
  }

  // Un pont et la branche d'étage qu'il rejoint se touchent-ils ailleurs qu'au raccord ?
  toucheEntre(pont, etage, marge = 12) {
    const sArrivee = etage.noeuds[0].s;
    for (let i = 0; i < pont.courbe.ech.length; i += 2) {
      const s1 = pont.courbe.ech[i].s;
      if (s1 > pont.Lmax - marge) continue;
      const C1 = pont.centre(s1, true);
      for (let j = 0; j < etage.courbe.ech.length; j += 2) {
        const s2 = etage.courbe.ech[j].s;
        if (Math.abs(s2 - sArrivee) < marge) continue;
        if (distance(C1, etage.centre(s2, true)) < pont.rayon(s1, true) + etage.rayon(s2, true) + 0.8) return true;
      }
    }
    return false;
  }

  collisionMaison(c, slot) {
    const enc = this.encombrementMaison(c, slot.s, slot.cote);
    const C = enc.centre;
    if (C[1] < Y0 + H_SALLE + 4 && Math.hypot(C[0], C[2]) < R_TRONC + 4.5) return true;
    if (Math.hypot(C[0], C[2]) < rayonTronc(C[1]) + 3.5) return true;
    let touche = false;
    this.grille.autour(C[0], C[2], 12, (o) => {
      if (touche) return;
      if (o.maison) {
        const autre = o.maison.encombrement;
        if (dansEncombrement(autre, C, 2.3) || dansEncombrement(enc, autre.centre, 2.3)) touche = true;
        return;
      }
      const ch = o.chemin;
      if (ch === c) return;
      const so = ch.courbe.ech[o.i].s;
      // un chemin qui part de cette branche (ou y arrive) est sous le chemin près du raccord
      if (ch.depart && ch.depart.chemin === c.id && so < 6) return;
      if (ch.arrivee && ch.arrivee.chemin === c.id && so > ch.Lmax - 6) return;
      if (dansEncombrement(enc, ch.centre(so, true), ch.rayon(so, true) + 0.2)) touche = true;
    });
    return touche;
  }

  // ----- distances à pied (graphe des raccords) -----
  graphe() {
    const points = new Map();
    const liens = [];
    const cleDe = (id, s) => `${id}@${s.toFixed(2)}`;
    const pointer = (id, s) => {
      const k = cleDe(id, s);
      let l = points.get(id);
      if (!l) { l = []; points.set(id, l); }
      if (!l.some((p) => p.cle === k)) l.push({ s, cle: k });
      return k;
    };
    for (const c of this.chemins) {
      const d0 = pointer(c.id, 0);
      if (c.depart.capitale) liens.push(['capitale', d0, 6]);
      if (c.depart.chemin !== undefined) liens.push([pointer(c.depart.chemin, c.depart.s), d0, 0.5]);
      if (c.arrivee) liens.push([pointer(c.arrivee.chemin, c.arrivee.s), pointer(c.id, c.Lmax), 0.5]);
    }
    const voisins = new Map([['capitale', []]]);
    const lier = (a, b, w) => {
      if (!voisins.has(a)) voisins.set(a, []);
      if (!voisins.has(b)) voisins.set(b, []);
      voisins.get(a).push([b, w]);
      voisins.get(b).push([a, w]);
    };
    for (const [a, b, w] of liens) lier(a, b, w);
    for (const [, l] of points) {
      l.sort((p, q) => p.s - q.s);
      for (let i = 1; i < l.length; i++) lier(l[i - 1].cle, l[i].cle, l[i].s - l[i - 1].s);
    }
    return { points, voisins, cleDe };
  }

  distances(depuis = 'capitale') {
    const g = this.graphe();
    const dist = new Map([[depuis, 0]]);
    const prec = new Map();
    const file = [[0, depuis]];
    while (file.length) {
      let m = 0;
      for (let i = 1; i < file.length; i++) if (file[i][0] < file[m][0]) m = i;
      const [d, u] = file.splice(m, 1)[0];
      if (d > (dist.get(u) ?? Infinity)) continue;
      for (const [v, w] of g.voisins.get(u) || []) {
        if (d + w < (dist.get(v) ?? Infinity)) {
          dist.set(v, d + w);
          prec.set(v, u);
          file.push([d + w, v]);
        }
      }
    }
    return { g, dist, prec };
  }

  // Distance à pied jusqu'au point (chemin, s)
  distanceA(D, id, s) {
    const l = D.g.points.get(id) || [];
    let best = Infinity;
    for (const p of l) best = Math.min(best, (D.dist.get(p.cle) ?? Infinity) + Math.abs(p.s - s));
    return best;
  }

  // ----- arrivée d'une personne -----
  ajouter() {
    for (let essai = 0; essai < 40; essai++) {
      const m = this.placerMaison();
      if (m) return m;
      if (!this.croitre()) return null;
    }
    return null;
  }

  placerMaison() {
    // le chemin le moins chargé qui a encore une place
    const ordre = this.chemins.filter((c) => c.T.maisons).sort((a, b) => a.nMaisons - b.nMaisons || a.id - b.id);
    for (const c of ordre) {
      for (let i = 0; i < c.slots.length; i++) {
        const sl = c.slots[i];
        if (sl.maison !== null || sl.interdit) continue;
        if (this.collisionMaison(c, sl)) { sl.interdit = true; continue; }
        const m = { indice: this.maisons.length, chemin: c.id, slot: i, s: sl.s, cote: sl.cote };
        m.encombrement = this.encombrementMaison(c, sl.s, sl.cote);
        sl.maison = m.indice;
        c.nMaisons++;
        this.maisons.push(m);
        this.grille.ajouter(m.encombrement.centre[0], m.encombrement.centre[2], { maison: m });
        c.majLongueur();
        this.version++;
        return m;
      }
    }
    return null;
  }

  // ----- croissance : un nouveau chemin -----
  croitre() {
    const D = this.distances();
    const candidats = [];
    for (const c of this.chemins) {
      if (!c.T.maisons || c.profondeur >= PROFONDEUR_MAX) continue;
      for (const n of c.noeuds) {
        if (n.usage || n.role !== 'rameau' || n.rameauRate) continue;
        candidats.push({ type: 'rameau', cout: this.distanceA(D, c.id, n.s) + 30 * (c.profondeur + 1) + 8 * c.niveau, c, n });
      }
    }
    // branches d'étage : on remplit chaque étage (3 branches), au plus un étage au-dessus du plus haut existant ;
    // un étage qui n'a pas pu pousser est réessayé quand l'arbre a poussé ailleurs
    const plusHaut = this.etages.length - 1;
    for (let k = 1; k <= Math.max(1, plusHaut + 1); k++) {
      const j = (this.etages[k] || []).length;
      if (j >= 3) continue;
      const echec = this.etagesRates[k];
      if (echec !== undefined && this.chemins.length < echec + 5) continue;
      if (k > 1 && !(this.etages[k - 1] || []).length) continue;
      candidats.push({ type: 'etage', cout: 60 + 45 * (k - 1) + 12 * j, niveau: k, j });
    }
    candidats.sort((a, b) => a.cout - b.cout);
    for (const cand of candidats) {
      const nouveau = cand.type === 'rameau' ? this.essayerRameau(cand.c, cand.n) : this.essayerEtage(cand.niveau, cand.j);
      if (nouveau) {
        this.essayerPontLateral(nouveau);
        return true;
      }
      if (cand.type === 'rameau') cand.n.rameauRate = true;
    }
    return false;
  }

  essayerRameau(c, n) {
    const variantes = [
      { angle: 48, montee: 1.2, courbure: 1 }, { angle: 38, montee: 1.8, courbure: 1 }, { angle: 58, montee: 0.8, courbure: -1 },
      { angle: 32, montee: 2.2, courbure: 0 }, { angle: 66, montee: 1.4, courbure: 1 }, { angle: 45, montee: 0.2, courbure: 1 },
      { angle: 48, montee: 1.2, courbure: 1, coupe: 1 }, { angle: 58, montee: 0.8, courbure: -1, coupe: 2 },
      { angle: 38, montee: 1.8, courbure: 1, coupe: 2 }, { angle: 72, montee: 1, courbure: -1, coupe: 2 },
    ];
    for (const v of variantes) {
      const def = this.defRameau(c, n, v);
      const essai = new Chemin({ ...def, id: -1 });
      if (essai.Lmax < 16) continue;
      if (this.collisionChemin(essai)) continue;
      n.usage = { type: 'rameau', chemin: this.chemins.length };
      const nouveau = this.ajouterChemin(def);
      c.majLongueur();
      this.evenements.push({ type: 'rameau', chemin: nouveau.id, parent: c.id });
      return nouveau;
    }
    return null;
  }

  // Une branche d'étage n'est créée que si un pont peut y monter depuis une branche plus basse.
  // On essaie d'abord les directions les plus dégagées (loin des branches de hauteur voisine).
  essayerEtage(niveau, j) {
    const y = PREMIER_ETAGE + ECART_ETAGE * (niveau - 1);
    const voisines = this.chemins.filter((c) => (c.type === 'maitresse' || c.type === 'etage') && Math.abs(c.courbe.ech[0].p[1] - y) < 13);
    const ecartAng = (p, q) => { const d = (((p - q) % 360) + 360) % 360; return Math.min(d, 360 - d); };
    const prefere = 75 + 120 * j + 47 * niveau;
    const azimuts = [];
    for (let k = 0; k < 36; k++) {
      const az = k * 10;
      const degage = voisines.length ? Math.min(...voisines.map((c) => ecartAng(az, (c.azimut * 180) / Math.PI))) : 180;
      azimuts.push({ az, score: Math.min(degage, 70) * 10 - ecartAng(az, prefere) * 0.1 });
    }
    azimuts.sort((p, q) => q.score - p.score);
    for (const { az } of azimuts.slice(0, 16)) {
      const def = this.defEtage(niveau, j, az);
      const essai = new Chemin({ ...def, id: -1 });
      if (!this.pontEnvisageable(essai, essai.noeuds[0], (c) => c.niveau < niveau)) continue;
      if (this.collisionChemin(essai)) continue;
      const pont = this.meilleurPont(essai, essai.noeuds[0], (c) => c.niveau < niveau, 14);
      if (!pont) continue;
      const etage = this.ajouterChemin(def);
      const nArrivee = etage.noeuds[0];
      const defPont = this.defPont(pont.A, pont.na, pont.ca, etage, nArrivee, pont.cb);
      pont.na.usage = { type: 'pont', chemin: this.chemins.length };
      nArrivee.usage = { type: 'pont', chemin: this.chemins.length };
      const p = this.ajouterChemin(defPont);
      pont.A.majLongueur();
      etage.majLongueur();
      this.evenements.push({ type: 'etage', chemin: etage.id, pont: p.id });
      return etage;
    }
    this.etagesRates[niveau] = this.chemins.length;
    return null;
  }

  // Tri rapide avant les calculs de collision : un pont vers (B, nb) est-il seulement possible ?
  pontEnvisageable(B, nb, filtre) {
    const pB = B.surface(nb.s, 0);
    for (const A of this.chemins) {
      if (A === B || !A.T.maisons || !filtre(A)) continue;
      for (const na of A.noeuds) {
        if (!librePourPont(na)) continue;
        const pA = A.surface(na.s, 0);
        const dh = Math.hypot(pA[0] - pB[0], pA[2] - pB[2]);
        if (dh < 12 || dh > 48 || Math.abs(pA[1] - pB[1]) / dh > 0.32) continue;
        if (this.coteVers(A, na, pB) !== null && this.coteVers(B, nb, pA) !== null) return true;
      }
    }
    return false;
  }

  // Cherche le meilleur pont vers (B, nb) depuis un chemin existant qui vérifie filtre
  meilleurPont(B, nb, filtre, essais = 6) {
    const options = [];
    const pB = B.surface(nb.s, 0);
    for (const A of this.chemins) {
      if (A === B || !A.T.maisons || !filtre(A)) continue;
      for (const na of A.noeuds) {
        if (!librePourPont(na)) continue;
        const pA = A.surface(na.s, 0);
        const ca = this.coteVers(A, na, pB);
        const cb = this.coteVers(B, nb, pA);
        if (ca === null || cb === null) continue;
        const dh = Math.hypot(pA[0] - pB[0], pA[2] - pB[2]);
        const dy = Math.abs(pA[1] - pB[1]);
        if (dh < 12 || dh > 48 || dy / dh > 0.32) continue;
        options.push({ A, na, ca, cb, d: Math.hypot(dh, dy) });
      }
    }
    options.sort((a, b) => a.d - b.d);
    for (const o of options.slice(0, essais)) {
      const def = this.defPont(o.A, o.na, o.ca, B, nb, o.cb);
      const essai = new Chemin({ ...def, id: -1 });
      if (!this.pontPraticable(essai)) continue;
      if (this.collisionChemin(essai, { ignorer: [B.id] })) continue;
      if (B.id === -1 && this.toucheEntre(essai, B)) continue;
      return o;
    }
    return null;
  }

  pontPraticable(p) {
    if (p.Lmax > 62) return false;
    for (const e of p.courbe.ech) if (Math.abs(e.t[1]) > PENTE_MAX_PONT) return false;
    // les deux bouts restent presque à plat pour se raccorder sans marche
    const bouts = p.courbe.ech.filter((e) => e.s < 2.5 || e.s > p.Lmax - 2.5);
    return bouts.every((e) => Math.abs(e.t[1]) < 0.22);
  }

  // Après une pousse : un pont entre le nouveau chemin et un voisin, s'il raccourcit vraiment les trajets
  essayerPontLateral(nouveau) {
    if (this.chemins.filter((c) => c.type === 'pont').length > this.chemins.length / 3) return null;
    const D = this.distances(this.graphe().cleDe(nouveau.id, 0));
    const options = [];
    for (const nb of nouveau.noeuds) {
      if (!librePourPont(nb)) continue;
      const pB = nouveau.surface(nb.s, 0);
      for (const A of this.chemins) {
        if (A === nouveau || !A.T.maisons || A.id === nouveau.parent || A.parent === nouveau.id) continue;
        for (const na of A.noeuds) {
          if (!librePourPont(na)) continue;
          const pA = A.surface(na.s, 0);
          const ca = this.coteVers(A, na, pB);
          const cb = this.coteVers(nouveau, nb, pA);
          if (ca === null || cb === null) continue;
          const dh = Math.hypot(pA[0] - pB[0], pA[2] - pB[2]);
          const dy = Math.abs(pA[1] - pB[1]);
          if (dh < 12 || dh > 42 || dy / dh > 0.3) continue;
          const direct = Math.hypot(dh, dy);
          const aPied = nb.s + this.distanceA(D, A.id, na.s);
          if (aPied < 2.2 * direct) continue; // ce pont ne raccourcirait presque rien
          options.push({ A, na, ca, nb, cb, d: direct });
        }
      }
    }
    options.sort((a, b) => a.d - b.d);
    for (const o of options.slice(0, 8)) {
      const def = this.defPont(o.A, o.na, o.ca, nouveau, o.nb, o.cb);
      const essai = new Chemin({ ...def, id: -1 });
      if (!this.pontPraticable(essai) || this.collisionChemin(essai)) continue;
      o.na.usage = { type: 'pont', chemin: this.chemins.length };
      o.nb.usage = { type: 'pont', chemin: this.chemins.length };
      const p = this.ajouterChemin(def);
      o.A.majLongueur();
      nouveau.majLongueur();
      this.evenements.push({ type: 'pont', chemin: p.id, de: o.A.id, vers: nouveau.id });
      return p;
    }
    return null;
  }

  // ----- infos -----
  hauteurTronc() {
    const n = this.etages.length - 1;
    const yMax = n >= 1 ? PREMIER_ETAGE + ECART_ETAGE * (n - 1) : Y0 + H_SALLE;
    return Math.max(Y0 + H_SALLE + 16, yMax + 18);
  }

  resume() {
    const parType = {};
    for (const c of this.chemins) parType[c.type] = (parType[c.type] || 0) + 1;
    return { maisons: this.maisons.length, chemins: this.chemins.length, ponts: parType.pont || 0, etages: Math.max(0, this.etages.length - 1), parType };
  }
}
