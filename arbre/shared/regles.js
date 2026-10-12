// Règles de croissance de l'arbre.
// Partagées : le serveur s'en sert pour décider, le navigateur pour afficher.

// Population pour laquelle l'arbre est entièrement poussé
export const POPULATION_COMPLETE = 1000;

// Nombre de nœuds poussés (visibles) pour ce nombre de personnes.
// Au départ, le tronc et les deux premiers étages sont là ; le reste pousse avec la population.
export function nbVisibles(utilisateurs, arbre) {
  const f = Math.min(1, Math.sqrt(utilisateurs / POPULATION_COMPLETE));
  return Math.round(arbre.k0 + (arbre.N - arbre.k0) * f);
}

// Épaisseur d'une branche selon son poids : elle gonfle avec les feuilles qu'elle porte (plafond x2,5)
export function facteurEpaisseur(poids) {
  return Math.min(2.5, 1 + 0.06 * Math.sqrt(poids));
}

// Poids d'un nœud = feuilles posées sur lui et sur tous les rameaux qui en partent.
// Un parent a toujours un identifiant plus petit que ses enfants : on remonte à l'envers.
export function calculerPoids(noeuds, feuillesParNoeud) {
  const poids = noeuds.map((_, i) => feuillesParNoeud[i] || 0);
  for (let i = noeuds.length - 1; i > 0; i--) {
    poids[noeuds[i].parent] += poids[i];
  }
  return poids;
}
