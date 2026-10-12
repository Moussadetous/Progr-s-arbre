// Règles de croissance de l'arbre.
// Partagées : le serveur s'en sert pour décider, le navigateur pour afficher.

export const BRANCHES_DEPART = 40; // rameaux visibles quand il n'y a encore personne
export const BRANCHES_PAR_RACINE = 19; // rameaux gagnés à chaque racine carrée d'utilisateur (arbre complet vers 500)

// Combien de nœuds de l'arbre sont poussés pour ce nombre d'utilisateurs
export function nbBranchesVisibles(nbUtilisateurs, total) {
  return Math.min(total, Math.round(BRANCHES_DEPART + BRANCHES_PAR_RACINE * Math.sqrt(nbUtilisateurs)));
}

// Épaisseur d'une branche selon son poids : elle gonfle avec les feuilles qu'elle porte (plafonnée à x4)
export function facteurEpaisseur(poids) {
  return Math.min(4, 1 + 0.22 * Math.sqrt(poids));
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
