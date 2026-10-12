// Graphe de marche : les rameaux visibles, et une feuille = un nœud relié à sa brindille.
// La fourmi ne marche que sur ce graphe : on clique, elle prend le plus court chemin.

export class Graphe {
  constructor(arbre) {
    this.arbre = arbre;
    this.pos = new Map(); // clé -> position
    this.adj = new Map(); // clé -> voisins [{ to, d }]
  }

  // Les nœuds de l'arbre gardent leur numéro ; une feuille a la clé N + son identifiant
  cleFeuille(id) {
    return this.arbre.N + id;
  }

  reconstruire() {
    this.pos = new Map();
    this.adj = new Map();
    for (const n of this.arbre.noeuds) {
      if (!this.arbre.visible(n.id)) continue;
      this.pos.set(n.id, this.arbre.positionNoeud(n.id));
      this.adj.set(n.id, []);
    }
    for (const n of this.arbre.noeuds) {
      if (n.parent >= 0 && this.pos.has(n.id) && this.pos.has(n.parent)) this.relier(n.id, n.parent);
    }
    for (const f of this.arbre.liste()) {
      const cle = this.cleFeuille(f.id);
      this.pos.set(cle, this.arbre.posFeuille(f.id));
      this.adj.set(cle, []);
      if (this.pos.has(f.noeud)) this.relier(cle, f.noeud);
    }
  }

  relier(a, b) {
    const d = this.pos.get(a).distanceTo(this.pos.get(b));
    this.adj.get(a).push({ to: b, d });
    this.adj.get(b).push({ to: a, d });
  }

  // Plus court chemin (Dijkstra). Renvoie la liste des clés, ou null si c'est impossible.
  chemin(de, vers) {
    if (!this.adj.has(de) || !this.adj.has(vers)) return null;
    const dist = new Map([[de, 0]]);
    const precedent = new Map();
    const fini = new Set();
    for (;;) {
      let u = null;
      let du = Infinity;
      for (const [k, d] of dist) {
        if (!fini.has(k) && d < du) { u = k; du = d; }
      }
      if (u === null) return null;
      if (u === vers) break;
      fini.add(u);
      for (const { to, d } of this.adj.get(u)) {
        const nouveau = du + d;
        if (nouveau < (dist.has(to) ? dist.get(to) : Infinity)) {
          dist.set(to, nouveau);
          precedent.set(to, u);
        }
      }
    }
    const chemin = [vers];
    while (chemin[0] !== de) chemin.unshift(precedent.get(chemin[0]));
    return chemin;
  }
}
