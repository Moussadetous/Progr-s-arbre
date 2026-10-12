// Générateur de l'arbre, partagé entre le serveur et le navigateur.
// Même graine => même arbre partout : le serveur sait où poser une feuille,
// le navigateur sait où la dessiner. Aucune dépendance : que des tableaux [x, y, z].

export const GRAINE = 20261006;

const SEGMENTS_TRONC = 14; // le tronc compte 15 nœuds ; le dernier est la capitale
const PAS_TRONC = 0.9;
// Branches principales : sur quel segment du tronc elles partent, combien, et leur longueur
const ETAGES = [
  { segment: 5, n: 4, longueur: 4.8 },
  { segment: 7, n: 5, longueur: 4.6 },
  { segment: 9, n: 5, longueur: 4.0 },
  { segment: 11, n: 4, longueur: 3.2 },
];
const PROFONDEUR_MAX = 4; // tronc = 0, branches principales = 1, rameaux = 2 à 4
const PROBA_RAMEAU = 0.55; // chance qu'un nœud d'une tige porte un rameau

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

// Un nœud = un point de l'arbre. Un parent est toujours créé avant son enfant.
export function genererArbre({ graine = GRAINE } = {}) {
  const hasard = mulberry32(graine);
  const entre = (a, b) => a + (b - a) * hasard();
  const noeuds = [];

  function ajouter(parent, pos, rayon, genre, profondeur) {
    const id = noeuds.length;
    noeuds.push({ id, parent, enfants: [], pos, rayon, genre, profondeur, capitale: false, ordre: 0 });
    if (parent >= 0) noeuds[parent].enfants.push(id);
    return id;
  }

  // 1) Tronc : une colonne qui penche un peu et s'affine vers le haut
  let bout = ajouter(-1, [0, 0, 0], 0.42, 'tronc', 0);
  const troncs = [bout];
  let dir = norme([0.05, 1, 0.03]);
  for (let i = 1; i <= SEGMENTS_TRONC; i++) {
    dir = norme([dir[0] + entre(-0.03, 0.03), 1, dir[2] + entre(-0.03, 0.03)]);
    bout = ajouter(bout, avance(noeuds[bout].pos, dir, PAS_TRONC), 0.42 * (1 - (0.55 * i) / SEGMENTS_TRONC), 'tronc', 0);
    troncs.push(bout);
  }
  // La capitale est au sommet du tronc : là où toutes les branches se rejoignent
  const capitale = bout;
  noeuds[capitale].capitale = true;

  // 2) Une tige pousse en segments ; elle peut porter des rameaux plus fins
  function pousser(origine, direction, longueur, rayon, profondeur) {
    const nSeg = Math.max(3, Math.round(longueur / 0.75));
    const pas = longueur / nSeg;
    let d = norme(direction);
    let p = origine;
    for (let i = 1; i <= nSeg; i++) {
      d = norme([
        d[0] + entre(-0.12, 0.12),
        d[1] + entre(-0.08, 0.08) - (profondeur >= 2 ? 0.05 : 0), // les rameaux retombent un peu
        d[2] + entre(-0.12, 0.12),
      ]);
      p = ajouter(p, avance(noeuds[p].pos, d, pas), rayon * (1 - (0.6 * i) / nSeg), 'branche', profondeur);
      if (profondeur < PROFONDEUR_MAX && i >= 2 && i < nSeg && hasard() < PROBA_RAMEAU) {
        pousser(p, norme([d[0] + entre(-1, 1), d[1] + entre(0.2, 0.8), d[2] + entre(-1, 1)]), longueur * entre(0.5, 0.7), rayon * 0.7, profondeur + 1);
      }
    }
  }

  // 3) Branches principales, réparties en spirale autour du tronc, qui montent vers la couronne
  let k = 0;
  for (const etage of ETAGES) {
    for (let i = 0; i < etage.n; i++, k++) {
      const az = k * 2.399 + entre(-0.45, 0.45);
      const el = entre(0.45, 0.8);
      const dirBranche = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const origine = troncs[etage.segment];
      pousser(origine, dirBranche, etage.longueur * entre(0.9, 1.1), Math.max(0.09, noeuds[origine].rayon * 0.62), 1);
    }
  }

  // 4) Ordre d'apparition : le tronc d'abord, puis les branches étage par étage.
  // La croissance suit cet ordre : plus il y a d'utilisateurs, plus de rangs deviennent visibles.
  const ordreTri = noeuds.map((n) => n.id).sort((a, b) => (noeuds[a].profondeur - noeuds[b].profondeur) || (a - b));
  ordreTri.forEach((id, rang) => { noeuds[id].ordre = rang; });

  return { graine, noeuds, capitale, ordreTri };
}
