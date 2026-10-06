// Lieux à découvrir : le cœur de l'exploration.
// Chaque lieu a une position (sur l'arbre), un rayon, un nom et une description poétique.
import * as THREE from 'three';

export function createLandmarks(tree) {
  const h = tree.handles;
  const nodes = tree.nodes;
  const list = [];

  const add = (id, icon, name, desc, spot, r = 2.6) => {
    if (!spot) return;
    list.push({ id, icon, name, desc, pos: spot.pos.clone(), node: spot.node, r, found: false });
  };

  add('berceau', '🍃', 'Le Berceau de Zira',
    'La grande feuille accrochée au tronc où commence chaque voyage.', h.berceau, 2.2);
  add('mousse', '🌿', 'Le Jardin de Mousse',
    'Un tapis de mousse et de fleurs sur la branche du vieil érable.', h.mossBranch, 3.0);
  add('grande_feuille', '🍁', 'La Grande Feuille',
    'Une feuille immense, trampoline suspendu entre ciel et branches.', h.grandeFeuille, 2.6);
  add('pont', '🌉', 'Le Pont de Brindilles',
    'Deux arbres se sont serré la main : une brindille relie leurs mondes.', h.pont, 2.4);
  add('fleur', '🌸', ' La Fleur de Rosée',
    'Sa corolle dorée retient une goutte de rosée grosse comme un œuf.', h.fleur, 2.4);
  add('canopee', '☀️', 'La Canopée Dorée',
    'Tout en haut, le vent raconte des histoires et le soleil frissonne.', { pos: nodes[h.trunkTip].pos.clone().add(new THREE.Vector3(0, 0.8, 0)), node: h.trunkTip }, 3.0);
  add('lucioles', '✨', 'Le Royaume des Lucioles',
    'Sous la terre, des champignons lumineux éclairent une cour de fées.', h.chamber != null ? { pos: nodes[h.chamber].pos.clone(), node: h.chamber } : null, 3.2);
  add('racines', '🪵', 'La Racine Profonde',
    'Le bout du monde : ici, l\'arbre boit la nuit de la terre.', h.deepest >= 0 ? { pos: nodes[h.deepest].pos.clone(), node: h.deepest } : null, 2.4);

  return {
    list,
    // vérifie la position de la fourmi ; renvoie les lieux nouvellement découverts
    check(antPos) {
      const found = [];
      for (const lm of list) {
        if (lm.found) continue;
        if (antPos.distanceToSquared(lm.pos) < lm.r * lm.r) {
          lm.found = true;
          found.push(lm);
        }
      }
      return found;
    },
    markFound(ids) { for (const lm of list) if (ids.includes(lm.id)) lm.found = true; },
    foundCount() { return list.filter((l) => l.found).length; },
  };
}
