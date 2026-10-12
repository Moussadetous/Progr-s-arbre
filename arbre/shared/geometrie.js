// Géométrie pure (tableaux [x, y, z]), partagée par le serveur, le navigateur et les tests.
export const Y = [0, 1, 0];
export const X = [1, 0, 0];
export const TAILLE_FEUILLE = 3; // m : une feuille-maison fait 3 m de long
export const RAYON_BOULE = 0.22; // m : la petite boule
export const ECART_FEUILLE = 0.12; // m : épaisseur de la feuille sous la boule

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const longueur = (a) => Math.hypot(a[0], a[1], a[2]);
export const distance = (a, b) => longueur(sub(a, b));
export const normer = (a) => {
  const l = longueur(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Demi-largeur de la feuille à la hauteur y (m depuis la base) : la feuille est une goutte
export function demiLargeur(y) {
  const u = clamp(y / TAILLE_FEUILLE, 0, 1);
  return 0.29 * TAILLE_FEUILLE * Math.pow(Math.sin(Math.PI * u), 0.8);
}

// Direction de la tige qui arrive au nœud, depuis son parent (vers le haut pour la racine)
export function directionNoeud(arbre, id) {
  const { parent, pos } = arbre.noeuds[id];
  if (parent < 0) return [0, 1, 0];
  return normer(sub(pos, arbre.noeuds[parent].pos));
}

// Placement d'une feuille sur un nœud.
// base : là où la feuille tient à la branche ; dir : axe de la feuille (de la base vers la pointe) ;
// side : largeur ; normal : face de la feuille (side × dir).
export function placerFeuille(arbre, noeud, emplacement) {
  const n = arbre.noeuds[noeud];
  const t = directionNoeud(arbre, noeud);
  let cote = cross(t, Y);
  if (longueur(cote) < 1e-4) cote = cross(t, X);
  cote = normer(cote);
  const haut = normer(cross(cote, t));
  const angle = emplacement * 2.399 + noeud * 0.9; // angle d'or : les feuilles s'éparpillent
  const radial = add(mul(cote, Math.cos(angle)), mul(haut, Math.sin(angle)));
  const dir = normer(add(add(mul(radial, 0.75), mul(t, 0.2)), mul(Y, 0.55)));
  // La face de la feuille est perpendiculaire au rayon : le pétiole ne lui est jamais parallèle,
  // et la boule passe de la branche à la feuille sans à-coup.
  let normal = cross(dir, radial);
  if (longueur(normal) < 1e-4) normal = cross(dir, X);
  normal = normer(normal);
  const side = normer(cross(dir, normal));
  const base = add(n.pos, mul(radial, n.rayon * 0.5));
  return { base, dir, side, normal, longueur: TAILLE_FEUILLE };
}
