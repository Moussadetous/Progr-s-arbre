// Le monde de l'arbre : règles de croissance, géométrie et chemins. Pur calcul (tableaux [x, y, z]).
//
// Règles :
//  - un tronc droit, une capitale (place autour du tronc, sans feuilles) et 4 branches par défaut ;
//  - une personne = une grande feuille, accrochée à un emplacement fixe de branche, en alternant gauche/droite ;
//  - une branche s'allonge et s'épaissit à chaque feuille qu'elle porte ;
//  - quand toutes les branches sont à leur longueur maximale, une nouvelle branche pousse sur le tronc ;
//  - une feuille ne bouge jamais : la personne n° i a toujours le même emplacement.
import { add, sub, mul, cross, normer, lerp3, clamp, longueur, distance } from './geometrie.js';
import { echantillonner } from './squelette.js';
import { mulberry32 } from './arbre.js';

export const BRANCHES_DEFAUT = 4;
export const PAS = 2; // m : écart entre deux emplacements consécutifs (gauche/droite en alternance : 4 m du même côté)
export const DEBUT = 6 * PAS;
const K0 = 3; // premier point de passage de la branche (le début est dans le tronc) // m : le début de la branche, près du tronc, reste libre
export const LONGUEUR_MAX = 69; // m : longueur maximale d'une branche
export const FEUILLE_LONGUEUR = 6.2; // m : une feuille est énorme pour la boule (0,22 m de rayon)
export const FEUILLE_DEMI_LARGEUR = 1.7;
export const RAYON_BOULE = 0.22;
export const HAUTEUR_CAPITALE = 10;
export const ECART_ETAGE = 5.5; // m de hauteur entre deux branches de tronc supplémentaires
export const RAYON_TRONC = 8.5;

export const rayonTronc = (y) => RAYON_TRONC - 0.04 * clamp(y - HAUTEUR_CAPITALE, -40, 80);

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
  const { frames, longueur: total } = echantillonner({ pts, rayon: () => 1 }, 145);
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
// u de -1 à 1 (largeur), v de 0 à 1 (longueur). Repère local : x travers, y haut, z vers l'extérieur.
export function pointFeuille(u, v) {
  const demi = FEUILLE_DEMI_LARGEUR * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.94)), 0.7);
  const y = 0.3 + 0.5 * Math.sin(0.7 * Math.PI * v) - 0.55 * v * v + 0.32 * u * u;
  return [u * demi, y, 1.1 + FEUILLE_LONGUEUR * v];
}

// Repère monde d'une feuille : origine sur l'épaule de la branche, axes x, y, z
export function repereFeuille(feuille, nBranche) {
  const { pos, normale, repere } = surfaceBranche(feuille.branche, nBranche, feuille.s, feuille.cote * 1.25, -0.06);
  let z = normer([normale[0], 0, normale[2]]);
  z = normer(add(z, mul(repere.tan, 0.3)));
  z = normer(add(z, [0, -0.08, 0]));
  // petite variation naturelle, fixe pour chaque personne
  const h = mulberry32(5000 + feuille.indice)();
  const lacet = (h - 0.5) * 0.24;
  z = normer([z[0] * Math.cos(lacet) - z[2] * Math.sin(lacet), z[1], z[0] * Math.sin(lacet) + z[2] * Math.cos(lacet)]);
  const x = normer(cross([0, 1, 0], z));
  const y = normer(cross(z, x));
  return { origine: pos, x, y, z, echelle: 0.94 + h * 0.12 };
}

export function localVersMonde(r, p) {
  const e = r.echelle;
  return add(r.origine, add(add(mul(r.x, p[0] * e), mul(r.y, p[1] * e)), mul(r.z, p[2] * e)));
}

// Position de la boule au milieu de la feuille
export function centreFeuille(repere) {
  const p = localVersMonde(repere, pointFeuille(0, 0.42));
  return add(p, mul(repere.y, RAYON_BOULE));
}

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
    const haut = hauteurBranche(this.branches.length - 1);
    return Math.max(36, haut + 16);
  }

  repereDe(feuille) {
    return repereFeuille(feuille, this.branches[feuille.branche].n);
  }
}

// ---------- chemins : le graphe sur lequel la boule se déplace ----------
function surfaceTronc(theta, y, ecart = RAYON_BOULE) {
  const r = rayonTronc(y) + ecart;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

function arc(theta0, theta1, y0, y1, pas = 0.12, ecart = RAYON_BOULE) {
  let d = theta1 - theta0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(d) / pas), Math.ceil(Math.abs(y1 - y0) / 1.5));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    pts.push(surfaceTronc(theta0 + d * u, y0 + (y1 - y0) * u, ecart));
  }
  return pts;
}

export function longueurChemin(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += longueur(sub(pts[i], pts[i - 1]));
  return l;
}

// Construit le graphe : noeuds {id, pos}, arêtes orientées {vers, poly (sans le point de départ), cout}
export function construireGraphe(monde) {
  const noeuds = new Map();
  const aretes = new Map();
  const noeud = (id, pos) => { noeuds.set(id, { id, pos }); if (!aretes.has(id)) aretes.set(id, []); };
  const lier = (a, b, polyAB) => {
    // polyAB : points de a (exclu) jusqu'à b (inclus)
    const brut = [noeuds.get(a).pos, ...polyAB];
    const pa = [brut[0]];
    for (let i = 1; i < brut.length; i++) {
      const n = Math.max(1, Math.ceil(distance(brut[i - 1], brut[i]) / 1.6));
      for (let j = 1; j <= n; j++) pa.push(lerp3(brut[i - 1], brut[i], j / n));
    }
    polyAB = pa.slice(1);
    const inv = [...pa].reverse().slice(1);
    aretes.get(a).push({ vers: b, poly: polyAB, cout: longueurChemin(pa) });
    aretes.get(b).push({ vers: a, poly: inv, cout: longueurChemin(pa) });
  };

  // la place de la capitale : un anneau autour du tronc, 8 points (4 aux pieds des branches, 4 entre elles)
  const yPlace = HAUTEUR_CAPITALE;
  const az0 = azimutBranche(0);
  const anneau = [];
  for (let k = 0; k < 8; k++) {
    const th = az0 + (k * Math.PI) / 4;
    const r = rayonTronc(yPlace) + 2.4;
    noeud(`p${k}`, [Math.cos(th) * r, yPlace, Math.sin(th) * r]);
    anneau.push({ k, th });
  }
  for (let k = 0; k < 8; k++) {
    const a = anneau[k];
    const b = anneau[(k + 1) % 8];
    const pts = [];
    for (let i = 1; i <= 4; i++) {
      const th = a.th + ((b.th - a.th) * i) / 4;
      const r = rayonTronc(yPlace) + 2.4;
      pts.push([Math.cos(th) * r, yPlace, Math.sin(th) * r]);
    }
    lier(`p${k}`, `p${(k + 1) % 8}`, pts);
  }
  // la porte de la capitale : entre la branche 0 et la branche 1, contre le tronc
  noeud('capitale', surfaceTronc(az0 + Math.PI / 4, yPlace + 0.1, 0.4));
  lier('p1', 'capitale', [surfaceTronc(az0 + Math.PI / 4, yPlace + 0.1, 0.4)]);

  let dernierTronc = null;
  for (const b of monde.branches) {
    const nk = Math.floor(longueurBranche(b.n) / PAS);
    for (let k = K0; k <= nk; k++) {
      const s = k * PAS;
      noeud(`b${b.id}:${k}`, surfaceBranche(b.id, b.n, s, 0, RAYON_BOULE).pos);
    }
    for (let k = K0; k < nk; k++) {
      lier(`b${b.id}:${k}`, `b${b.id}:${k + 1}`, [surfaceBranche(b.id, b.n, (k + 0.5) * PAS, 0, RAYON_BOULE).pos, noeuds.get(`b${b.id}:${k + 1}`).pos]);
    }
    const th = azimutBranche(b.id);
    if (b.id < BRANCHES_DEFAUT) {
      lier(`p${2 * b.id}`, `b${b.id}:${K0}`, [noeuds.get(`b${b.id}:${K0}`).pos]);
    } else {
      const y = hauteurBranche(b.id);
      const id = `t${b.id}`;
      noeud(id, surfaceTronc(th, y + 0.2));
      lier(id, `b${b.id}:${K0}`, [noeuds.get(`b${b.id}:${K0}`).pos]);
      if (!dernierTronc) {
        lier(id, 'p0', arc(th, azimutBranche(0), y, yPlace + 0.1, 0.12, RAYON_BOULE).reverse().slice(1).concat([noeuds.get('p0').pos]));
      } else {
        const d = noeuds.get(dernierTronc);
        const ya = d.pos[1];
        const tha = Math.atan2(d.pos[2], d.pos[0]);
        lier(id, dernierTronc, arc(th, tha, y + 0.2, ya).slice(0, -1).concat([d.pos]));
      }
      dernierTronc = id;
    }
  }

  // les feuilles : depuis le point de la branche, par-dessus l'épaule, le long de la tige, jusqu'au milieu du limbe
  for (const f of monde.feuilles) {
    const b = monde.branches[f.branche];
    const rep = monde.repereDe(f);
    const k = Math.round(f.s / PAS);
    const dessus = (th) => surfaceBranche(f.branche, b.n, f.s, th, RAYON_BOULE).pos;
    const poly = [
      dessus(f.cote * 0.7),
      dessus(f.cote * 1.15),
      add(localVersMonde(rep, [0, 0.05, 0.35]), mul(rep.y, RAYON_BOULE)),
      add(localVersMonde(rep, [0, 0.3, 1.2]), mul(rep.y, RAYON_BOULE)),
      add(localVersMonde(rep, pointFeuille(0, 0.2)), mul(rep.y, RAYON_BOULE)),
      centreFeuille(rep),
    ];
    noeud(`f${f.indice}`, poly[poly.length - 1]);
    lier(`b${f.branche}:${k}`, `f${f.indice}`, poly);
  }
  return { noeuds, aretes };
}

// Plus court chemin (Dijkstra) : renvoie les points à suivre depuis le noeud de départ, ou null
export function plusCourtChemin(graphe, de, vers) {
  if (!graphe.noeuds.has(de) || !graphe.noeuds.has(vers)) return null;
  const dist = new Map([[de, 0]]);
  const prec = new Map();
  const fait = new Set();
  const file = [de];
  while (file.length) {
    let m = 0;
    for (let i = 1; i < file.length; i++) if (dist.get(file[i]) < dist.get(file[m])) m = i;
    const u = file.splice(m, 1)[0];
    if (fait.has(u)) continue;
    fait.add(u);
    if (u === vers) break;
    for (const a of graphe.aretes.get(u)) {
      const d = dist.get(u) + a.cout;
      if (d < (dist.get(a.vers) ?? Infinity)) {
        dist.set(a.vers, d);
        prec.set(a.vers, { de: u, arete: a });
        file.push(a.vers);
      }
    }
  }
  if (!dist.has(vers)) return null;
  const segments = [];
  for (let c = vers; c !== de;) {
    const p = prec.get(c);
    segments.unshift(p);
    c = p.de;
  }
  const points = [graphe.noeuds.get(de).pos];
  const noeudsPassage = [de];
  const indices = [0]; // position de chaque noeud dans la liste de points
  for (const s of segments) {
    points.push(...s.arete.poly);
    noeudsPassage.push(s.arete.vers);
    indices.push(points.length - 1);
  }
  return { points, noeuds: noeudsPassage, indices, cout: dist.get(vers) };
}
