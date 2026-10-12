// Placement des maisons-feuilles sur les branches.
// Chaque arrivée choisit, parmi des candidats tirés de façon déterministe, l'emplacement qui :
//   - respecte l'espacement (deux maisons ne se touchent jamais, même sur des branches différentes) ;
//   - équilibre la charge des quatre branches ;
//   - forme de petits « villages » (des voisins proches, mais pas collés) ;
//   - reste sur le dessus ou les côtés d'une branche, jamais dessous ;
//   - évite la jonction avec le tronc et les bouts trop fins.
// Pur calcul : le même tirage donne le même résultat côté serveur et côté navigateur.
import { add, sub, mul, dot, normer, longueur, clamp } from './geometrie.js';
import { mulberry32 } from './arbre.js';
import { repereA, pointSurface } from './squelette.js';

export const EMPREINTE = 2.2; // m : rayon d'une maison à l'échelle 1
export const MARGE = 1.12; // espace de respiration entre deux maisons
export const RAYON_MIN = 0.7; // m : une branche plus fine ne porte pas de maison
export const T_MIN = 0.14; // on s'écarte de la jonction avec le tronc
export const T_MAX = 0.97;
export const THETA_MAX = 1.75; // rad (100°) : jamais plus bas que le flanc
export const CANDIDATS = 700;

// Une maison est plus petite sur une branche plus fine
export const echelleSurRayon = (rayon) => clamp(rayon / 1.5, 0.6, 1);

// Distance minimale entre les centres de deux maisons
export const distanceMin = (a, b) => (a.echelle + b.echelle) * EMPREINTE * MARGE;

// Le premier habitant : une maison bien en vue, sur la première branche
export function premierEmplacement(squelette) {
  return construire(squelette, squelette.branches[0], 0.4, 0.45, 0, 1);
}

function construire(squelette, branche, t, theta, indice, graineLocale) {
  const repere = repereA(branche, t);
  const { pos, normale } = pointSurface(repere, theta);
  const echelle = echelleSurRayon(repere.rayon);
  // La porte regarde le côté de la branche, un peu vers l'extérieur, avec une petite variation
  const tangenteCercle = normer(add(mul(repere.N, -Math.sin(theta)), mul(repere.B, Math.cos(theta))));
  const sens = Math.abs(theta) > 0.15 ? Math.sign(theta) : (graineLocale % 2 ? 1 : -1);
  let front = add(mul(tangenteCercle, sens), mul(repere.tan, 0.35 * (graineLocale % 3 - 1)));
  front = sub(front, mul(normale, dot(front, normale)));
  front = normer(front);
  return {
    id: indice,
    branche: branche.id,
    t,
    theta,
    pos: sub(pos, mul(normale, 0.1)), // posée légèrement dans l'écorce
    normale,
    front,
    tangente: repere.tan,
    echelle,
    rayonBranche: repere.rayon,
  };
}

// Choisit l'emplacement de la maison n° « indice », sachant les maisons déjà posées.
// Renvoie null si les branches sont pleines (c'est le signal que l'arbre doit pousser).
export function placerMaison(squelette, existantes, indice, { graine = 1 } = {}) {
  if (indice === 0) return premierEmplacement(squelette);
  const hasard = mulberry32(graine * 100003 + indice * 7919);
  const nb = squelette.branches.length;
  const parBranche = new Array(nb).fill(0);
  for (const m of existantes) parBranche[m.branche]++;
  const moyenne = existantes.length / nb;

  let meilleur = null;
  let meilleurScore = -Infinity;
  for (let i = 0; i < CANDIDATS; i++) {
    const branche = squelette.branches[Math.floor(hasard() * nb)];
    const t = T_MIN + hasard() * (T_MAX - T_MIN);
    // Dessus de préférence (tirage triangulaire), mais les flancs servent aussi (tirage uniforme)
    const theta = hasard() < 0.55 ? (hasard() + hasard() - 1) * THETA_MAX : (hasard() * 2 - 1) * THETA_MAX;
    const cand = construire(squelette, branche, t, theta, indice, Math.floor(hasard() * 1000));
    if (cand.rayonBranche < RAYON_MIN) continue;
    if (cand.normale[1] < -0.1) continue;

    let plusProche = Infinity;
    let conflit = false;
    let alternance = 0;
    for (const m of existantes) {
      const d = longueur(sub(m.pos, cand.pos));
      if (d < distanceMin(m, cand)) { conflit = true; break; }
      plusProche = Math.min(plusProche, d);
      // Les maisons voisines sur une même branche se répartissent des deux côtés (en zigzag)
      if (m.branche === cand.branche && d < 2.4 * distanceMin(m, cand)) {
        alternance += Math.sign(m.theta || 1) !== Math.sign(cand.theta || 1) ? 0.3 : -0.3;
      }
    }
    if (conflit) continue;

    const dRef = (cand.echelle * 2) * EMPREINTE * MARGE;
    const voisinage = existantes.length === 0 ? 0.5
      : Math.exp(-(((plusProche - 1.35 * dRef) / (1.2 * dRef)) ** 2));
    const equilibre = -0.6 * (parBranche[branche.id] - moyenne);
    const dessus = 0.16 * clamp(cand.normale[1], 0, 1);
    const milieu = -0.8 * Math.abs(t - 0.55);
    const score = equilibre + 1.2 * voisinage + dessus + milieu + clamp(alternance, -0.8, 0.8) + hasard() * 0.3;
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleur = cand;
    }
  }
  return meilleur;
}

// Place « n » maisons à la suite (utile pour les tests et pour l'aperçu)
export function placerPlusieurs(squelette, n, options = {}) {
  const maisons = [];
  for (let i = 0; i < n; i++) {
    const m = placerMaison(squelette, maisons, i, options);
    if (!m) break;
    maisons.push(m);
  }
  return maisons;
}
