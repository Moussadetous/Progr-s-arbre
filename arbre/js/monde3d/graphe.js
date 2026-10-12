// Graphe de marche : les nœuds poussés de l'arbre (reliés à leur parent), et une feuille
// = un nœud de plus, relié au rameau qui la porte. La boule ne marche que sur ce graphe.
import { placerFeuille, distance, ECART_FEUILLE } from '../../shared/geometrie.js';

// Rayon apparent du pétiole : la boule y flotte à la même hauteur que dans la feuille
const RAYON_PETIOLE = ECART_FEUILLE;

// Petit tas binaire (file de priorité) pour Dijkstra
class Tas {
  constructor() { this.t = []; }
  get taille() { return this.t.length; }
  pousser(poids, valeur) {
    const t = this.t;
    t.push([poids, valeur]);
    let i = t.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (t[p][0] <= t[i][0]) break;
      [t[p], t[i]] = [t[i], t[p]];
      i = p;
    }
  }
  extraire() {
    const t = this.t;
    const haut = t[0];
    const dernier = t.pop();
    if (t.length) {
      t[0] = dernier;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let m = i;
        if (g < t.length && t[g][0] < t[m][0]) m = g;
        if (d < t.length && t[d][0] < t[m][0]) m = d;
        if (m === i) break;
        [t[m], t[i]] = [t[i], t[m]];
        i = m;
      }
    }
    return haut;
  }
}

export class Graphe {
  constructor(arbre) {
    this.arbre = arbre;
    this.N = arbre.N;
    this.K = 0; // nombre de nœuds déjà ajoutés (les rangs 0..K-1)
    this.adj = new Map(); // clé -> [{ to, d }]
    this.pos = new Map(); // clé -> [x, y, z]
    this.rayons = new Map(); // clé -> rayon (m)
    this.feuilles = new Map(); // identifiant de feuille -> { id, noeud, geo }
  }

  // Une feuille a pour clé N + son identifiant : elle ne se confond jamais avec un nœud
  cleFeuille(id) {
    return this.N + id;
  }

  estFeuille(cle) {
    return cle >= this.N;
  }

  position(cle) {
    return this.pos.get(cle);
  }

  rayon(cle) {
    return this.rayons.get(cle) ?? RAYON_PETIOLE;
  }

  voisins(cle) {
    return this.adj.get(cle) || [];
  }

  geoFeuille(id) {
    return this.feuilles.get(id).geo;
  }

  // Ajoute les nœuds dont le rang est entre l'ancienne et la nouvelle limite (la croissance)
  etendre(K) {
    const { noeuds, parRang } = this.arbre;
    const fin = Math.min(K, this.N);
    for (let r = this.K; r < fin; r++) {
      const id = parRang[r];
      const n = noeuds[id];
      this.pos.set(id, n.pos);
      this.rayons.set(id, n.rayon);
      this.adj.set(id, []);
      if (n.parent >= 0 && this.adj.has(n.parent)) this.relier(id, n.parent);
    }
    this.K = Math.max(this.K, fin);
  }

  relier(a, b) {
    const d = distance(this.pos.get(a), this.pos.get(b));
    this.adj.get(a).push({ to: b, d });
    this.adj.get(b).push({ to: a, d });
  }

  // Ajoute une feuille au graphe (idempotent). Renvoie true si elle vient d'être ajoutée.
  ajouterFeuille(f) {
    if (this.feuilles.has(f.id)) return false;
    const geo = placerFeuille(this.arbre, f.noeud, f.emplacement);
    const cle = this.cleFeuille(f.id);
    this.feuilles.set(f.id, { id: f.id, noeud: f.noeud, geo });
    this.pos.set(cle, geo.base);
    this.rayons.set(cle, RAYON_PETIOLE);
    this.adj.set(cle, []);
    if (this.adj.has(f.noeud)) this.relier(cle, f.noeud);
    return true;
  }

  // Plus court chemin (Dijkstra) de la clé « de » à la clé « vers ». Renvoie la liste des clés, ou null.
  chemin(de, vers) {
    if (!this.adj.has(de) || !this.adj.has(vers)) return null;
    const dist = new Map([[de, 0]]);
    const precedent = new Map();
    const fini = new Set();
    const tas = new Tas();
    tas.pousser(0, de);
    while (tas.taille) {
      const [d, u] = tas.extraire();
      if (fini.has(u)) continue;
      fini.add(u);
      if (u === vers) break;
      for (const { to, d: w } of this.adj.get(u)) {
        const nouveau = d + w;
        if (nouveau < (dist.has(to) ? dist.get(to) : Infinity)) {
          dist.set(to, nouveau);
          precedent.set(to, u);
          tas.pousser(nouveau, to);
        }
      }
    }
    if (!fini.has(vers)) return null;
    const chemin = [vers];
    while (chemin[0] !== de) chemin.unshift(precedent.get(chemin[0]));
    return chemin;
  }
}
