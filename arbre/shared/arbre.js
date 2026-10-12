// Génération de l'arbre géant, partagée par le serveur et le navigateur.
// Même graine => même arbre partout. Pur calcul, aucune dépendance.
// Unité : 1 mètre = 1 unité du monde.

export const GRAINE = 20261006;
export const PAS = 4; // m entre deux nœuds d'une tige
export const HAUTEUR_TRONC = 160; // m : le sommet du tronc est la capitale
export const RAYON_MIN = 0.28; // m : une brindille ne descend jamais sous 28 cm de rayon
const PROFONDEUR_MAX = 6;
// Chance qu'une tige de cette profondeur porte un rameau, à chaque nœud
const PROBA_RAMEAU = [0, 0.5, 0.5, 0.45, 0.4, 0.35, 0];

// Générateur pseudo-aléatoire déterministe (mulberry32)
export function mulberry32(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norme = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const avance = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

// Renvoie l'arbre : des nœuds (parent, enfants, position, rayon, profondeur, rang)
// et les index utiles (capitale, rangs, candidats aux feuilles).
export function genererArbre({ graine = GRAINE } = {}) {
  const hasard = mulberry32(graine);
  const entre = (a, b) => a + (b - a) * hasard();
  const noeuds = [];

  const ajouter = (parent, pos, rayon, profondeur) => {
    const id = noeuds.length;
    noeuds.push({ id, parent, enfants: [], pos, rayon, profondeur, capitale: false, rang: 0 });
    if (parent >= 0) noeuds[parent].enfants.push(id);
    return id;
  };

  // 1) Tronc : une colonne qui penche à peine et s'affine vers le haut (9 m à la base, 3 m au sommet)
  const nSeg = Math.round(HAUTEUR_TRONC / PAS);
  let bout = ajouter(-1, [0, 0, 0], 9, 0);
  const troncs = [bout];
  let dir = norme([0.04, 1, 0.02]);
  for (let i = 1; i <= nSeg; i++) {
    dir = norme([dir[0] + entre(-0.02, 0.02), 1, dir[2] + entre(-0.02, 0.02)]);
    const rayon = 9 - 6 * Math.pow(i / nSeg, 0.8);
    bout = ajouter(bout, avance(noeuds[bout].pos, dir, PAS), rayon, 0);
    troncs.push(bout);
  }
  // La capitale est au sommet du tronc : là où toutes les branches se rejoignent
  const capitale = bout;
  noeuds[capitale].capitale = true;

  // 2) Une tige pousse en segments ; elle peut porter des rameaux, de plus en plus fins
  function pousser(origine, direction, longueur, rayon, profondeur) {
    const nSegTige = Math.max(2, Math.round(longueur / PAS));
    const pas = longueur / nSegTige;
    let d = norme(direction);
    let p = origine;
    for (let i = 1; i <= nSegTige; i++) {
      const gravite = profondeur >= 3 ? -0.08 : -0.02; // les rameaux fins retombent
      d = norme([d[0] + entre(-0.1, 0.1), d[1] + entre(-0.07, 0.07) + gravite, d[2] + entre(-0.1, 0.1)]);
      const r = Math.max(RAYON_MIN, rayon * (1 - (0.3 * i) / nSegTige));
      p = ajouter(p, avance(noeuds[p].pos, d, pas), r, profondeur);
      if (profondeur < PROFONDEUR_MAX && i >= 2 && i < nSegTige && hasard() < PROBA_RAMEAU[profondeur]) {
        const dRameau = norme([d[0] + entre(-1, 1), d[1] + entre(0.1, 0.7), d[2] + entre(-1, 1)]);
        pousser(p, dRameau, longueur * entre(0.5, 0.7), Math.max(RAYON_MIN, r * 0.7), profondeur + 1);
      }
    }
  }

  // 3) Branches principales : par étages le long du tronc, en spirale, qui montent vers la couronne
  let k = 0;
  for (let s = 6; s <= nSeg - 6; s += 3) {
    const n = 3 + Math.floor(hasard() * 2);
    for (let b = 0; b < n; b++, k++) {
      const az = k * 2.399 + entre(-0.3, 0.3);
      const el = entre(0.3, 0.6);
      const dirBranche = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const origine = troncs[s];
      pousser(origine, dirBranche, entre(45, 70), Math.max(RAYON_MIN, noeuds[origine].rayon * 0.55), 1);
    }
  }

  // 4) Ordre d'apparition : d'abord le tronc, puis les branches couche par couche (profondeur, puis création).
  // La croissance suit cet ordre : plus il y a de monde, plus de rangs deviennent visibles.
  const ordre = noeuds.map((n) => n.id).sort((a, b) => noeuds[a].profondeur - noeuds[b].profondeur || a - b);
  ordre.forEach((id, rang) => { noeuds[id].rang = rang; });
  const parRang = Int32Array.from(ordre);
  // Nœuds où une feuille peut pousser : les rameaux (profondeur 2 et plus), dans l'ordre de croissance
  const candidats = Int32Array.from(ordre.filter((id) => noeuds[id].profondeur >= 2));
  const k0 = noeuds.filter((n) => n.profondeur <= 2).length; // nœuds visibles au départ

  return { graine, N: noeuds.length, noeuds, capitale, parRang, candidats, k0 };
}
