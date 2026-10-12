// Déplacement de la boule. Elle roule sur les branches (arêtes du graphe), elle choisit sa fourche
// selon la direction demandée, et elle marche librement dans sa feuille-maison.
// Logique pure (tableaux [x, y, z]) : testable sans navigateur.
import {
  Y, X, TAILLE_FEUILLE, RAYON_BOULE, add, sub, mul, dot, cross, longueur, normer, lerp3, clamp, demiLargeur,
  directionNoeud, ECART_FEUILLE,
} from '../../shared/geometrie.js';

export const VITESSE_MARCHE = 6; // m/s
export const VITESSE_COURSE = 14; // m/s (Maj)
const SEUIL_DIRECTION = 0.2; // cosinus minimal pour suivre une branche
const SEUIL_FEUILLE = 0.55; // il faut viser une feuille franchement pour y entrer
const SEUIL_SORTIE = 0.12; // m : au pied de la feuille, on peut la quitter
const ROTATION_PAR_METRE = 0.6; // m de glissement sur la surface par mètre parcouru : la boule roule, elle ne saute pas

// Rapproche la normale a de la normale visée b, d'au plus « angle » radians
function rapprocher(a, b, angle) {
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  if (theta <= angle) return b;
  return normer(lerp3(a, b, angle / theta));
}

// Transport parallèle : fait tourner v de la rotation minimale qui amène la tangente a sur la tangente b.
// La normale suit ainsi la courbure de la branche, sans rupture.
function transporter(v, a, b) {
  const axe = cross(a, b);
  const s = longueur(axe);
  if (s < 1e-6) return v;
  const k = mul(axe, 1 / s);
  const c = dot(a, b);
  const cv = c;
  const sv = s;
  const kxv = cross(k, v);
  const kv = dot(k, v);
  return add(add(mul(v, cv), mul(kxv, sv)), mul(k, kv * (1 - cv)));
}

// Projette v sur le plan perpendiculaire à la tangente T (une normale doit toujours lui être perpendiculaire)
function orthogonale(v, T) {
  let p = sub(v, mul(T, dot(v, T)));
  if (longueur(p) < 0.05) {
    p = cross(T, Y);
    if (longueur(p) < 0.05) p = cross(T, X);
  }
  return normer(p);
}

export class Deplacement {
  constructor(graphe) {
    this.g = graphe;
    this.mode = 'noeud'; // 'noeud' | 'arete' | 'feuille'
    this.noeud = -1; // mode 'noeud'
    this.de = -1; // mode 'arete' : extrémité de départ
    this.vers = -1; // mode 'arete' : extrémité d'arrivée
    this.s = 0; // mode 'arete' : distance parcourue depuis « de »
    this.sens = 0; // mode 'arete' : +1 vers « vers », -1 vers « de », 0 à l'arrêt
    this.feuille = null; // mode 'feuille' : { id, geo, x, y, cibleY }
    this.route = []; // clés encore à atteindre, la première est la prochaine
    this.cible = null; // destination demandée
    this.surArrivee = null;
    this.normale = Y.slice(); // face sur laquelle la boule repose
    this.tangente = [1, 0, 0];
    this.tangentePrec = null; // tangente de la branche parcourue en dernier (la normale lui reste perpendiculaire)
    this.position = [0, 0, 0];
    this.distance = 0; // chemin parcouru pendant la dernière mise à jour
  }

  // ---------- accès au graphe ----------

  pos(cle) { return this.g.position(cle); }
  rayon(cle) { return this.g.rayon(cle); }
  estFeuille(cle) { return this.g.estFeuille(cle); }
  get capitale() { return this.g.arbre.capitale; }

  tangenteArete() {
    return normer(sub(this.pos(this.vers), this.pos(this.de)));
  }

  longueurArete() {
    return longueur(sub(this.pos(this.vers), this.pos(this.de)));
  }

  // ---------- placements ----------

  poserSurNoeud(id) {
    this.mode = 'noeud';
    this.noeud = id;
    this.sens = 0;
    this.route = [];
    this.cible = null;
    this.tangentePrec = directionNoeud(this.g.arbre, id);
    this.normale = orthogonale(this.normale, this.tangentePrec);
    this.majPosition(true);
  }

  // Pose la boule dans la feuille (au centre par défaut)
  poserDansFeuille(id, y = TAILLE_FEUILLE / 2) {
    this.entrerFeuille(id, y, null);
    this.majPosition(true);
  }

  entrerFeuille(id, y, cibleY) {
    this.mode = 'feuille';
    this.feuille = { id, geo: this.g.geoFeuille(id), x: 0, y, cibleY };
    this.noeud = -1;
    this.sens = 0;
  }

  sortirVers(pied) {
    this.mode = 'arete';
    this.de = this.g.cleFeuille(this.feuille.id);
    this.vers = pied;
    this.s = 0;
    this.sens = 1;
    this.feuille = null;
  }

  // ---------- ordres ----------

  // Demande d'aller vers une clé du graphe (nœud ou feuille). Renvoie false s'il n'y a pas de chemin.
  allerVers(cle, surArrivee = null) {
    let origine;
    if (this.mode === 'feuille') {
      // Dans la feuille : la boule rejoint d'abord le pied, puis sort par le pétiole (sans téléportation)
      origine = this.g.voisins(this.g.cleFeuille(this.feuille.id))[0].to;
      this.feuille.cibleY = 0;
    } else if (this.mode === 'arete') {
      if (this.sens < 0) origine = this.de;
      else if (this.sens > 0) origine = this.vers;
      else origine = this.s < this.longueurArete() / 2 ? this.de : this.vers;
    } else {
      origine = this.noeud;
    }
    const chemin = this.g.chemin(origine, cle);
    if (!chemin) return false;
    this.route = chemin;
    this.cible = cle;
    this.surArrivee = surArrivee;
    return true;
  }

  terminer() {
    const f = this.surArrivee;
    this.surArrivee = null;
    this.cible = null;
    this.route = [];
    if (f) f();
  }

  // ---------- mise à jour ----------

  // dt : secondes. entree : direction voulue dans le monde (horizontale, longueur ≤ 1), ou null.
  // course : vrai si Maj est enfoncée. Renvoie l'état à afficher.
  update(dt, entree = null, course = false) {
    const manuel = !!entree && longueur(entree) > 0.01;
    if (manuel) {
      // L'utilisateur reprend la main : on annule la demande automatique
      this.route = [];
      this.cible = null;
      this.surArrivee = null;
      if (this.feuille) this.feuille.cibleY = null;
    }
    const vitesse = course ? VITESSE_COURSE : VITESSE_MARCHE;
    this.distance = 0;
    const reste = vitesse * dt;
    if (this.mode === 'feuille') this.majFeuille(reste, manuel ? entree : null);
    else this.majRail(reste, manuel ? entree : null);
    this.majPosition(false);
    return { position: this.position, normale: this.normale, tangente: this.tangente, distance: this.distance, mode: this.mode };
  }

  // Déplacement sur les branches : on avance sur l'arête, et à chaque nœud on choisit la suite
  majRail(reste, entree) {
    for (let garde = 0; garde < 64; garde++) {
      if (this.mode === 'noeud') {
        if (this.route.length && this.route[0] === this.noeud) this.route.shift();
        if (this.route.length === 0 && this.cible === this.noeud) {
          this.terminer();
        }
        const suite = this.choisirSuite(this.noeud, entree);
        if (suite === null) return; // immobile sur ce nœud
        this.mode = 'arete';
        this.de = this.noeud;
        this.vers = suite;
        this.s = 0;
        this.sens = 1;
        this.noeud = -1;
        continue;
      }

      // mode arête
      this.orienter(entree);
      if (this.sens === 0) return;
      const L = this.longueurArete();
      const restant = this.sens > 0 ? L - this.s : this.s;
      if (reste < restant) {
        this.s += this.sens * reste;
        this.distance += reste;
        return;
      }
      this.distance += restant;
      const reste2 = reste - restant;
      const arrivee = this.sens > 0 ? this.vers : this.de;
      this.s = this.sens > 0 ? L : 0;
      this.arriverSur(arrivee);
      if (this.mode === 'feuille') return;
      if (reste2 <= 0) return;
      reste = reste2;
    }
  }

  arriverSur(cle) {
    if (this.route.length && this.route[0] === cle) this.route.shift();
    if (this.estFeuille(cle)) {
      const centre = this.cible === cle && this.route.length === 0;
      this.entrerFeuille(cle - this.g.N, 0, centre ? TAILLE_FEUILLE / 2 : null);
      return;
    }
    this.mode = 'noeud';
    this.noeud = cle;
    this.sens = 0;
    if (this.cible === cle && this.route.length === 0) this.terminer();
  }

  // Choisit la prochaine arête à un nœud : la demande automatique d'abord, sinon la direction voulue
  choisirSuite(n, entree) {
    if (this.route.length) return this.route[0];
    if (!entree) return null;
    let meilleur = null;
    let score = -Infinity;
    for (const { to } of this.g.voisins(n)) {
      const t = normer(sub(this.pos(to), this.pos(n)));
      const d = dot(entree, t);
      const seuil = this.estFeuille(to) ? SEUIL_FEUILLE : SEUIL_DIRECTION;
      if (d > seuil && d > score) {
        meilleur = to;
        score = d;
      }
    }
    return meilleur;
  }

  // Sens de déplacement sur l'arête en cours
  orienter(entree) {
    if (this.route.length) {
      const suivant = this.route[0];
      if (suivant === this.vers) this.sens = 1;
      else if (suivant === this.de) this.sens = -1;
      return;
    }
    if (!entree) {
      this.sens = 0;
      return;
    }
    const d = dot(entree, this.tangenteArete());
    if (Math.abs(d) > SEUIL_DIRECTION) this.sens = d > 0 ? 1 : -1;
    else if (this.sens === 0) this.sens = d >= 0 ? 1 : -1;
  }

  // Déplacement dans la feuille : libre, mais contenu dans sa forme
  majFeuille(reste, entree) {
    const f = this.feuille;
    const g = f.geo;
    if (entree) {
      const dAxe = dot(entree, g.dir);
      const dCote = dot(entree, g.side);
      f.y += dAxe * reste;
      f.x += dCote * reste;
      this.distance += reste * longueur(entree);
      f.y = clamp(f.y, 0, TAILLE_FEUILLE);
      const demi = Math.max(0, demiLargeur(f.y) * 0.9 - RAYON_BOULE * 0.8);
      f.x = clamp(f.x, -demi, demi);
      if (f.y <= SEUIL_SORTIE && dAxe < -SEUIL_DIRECTION) {
        // Retour vers le pied de la feuille : on repart sur le pétiole
        this.sortirVers(this.g.voisins(this.g.cleFeuille(f.id))[0].to);
      }
      return;
    }
    if (f.cibleY !== null) {
      // Déplacement automatique : vers le centre (arrivée) ou vers le pied (départ)
      const ecart = f.cibleY - f.y;
      const pas = Math.min(Math.abs(ecart), reste);
      f.y += Math.sign(ecart) * pas;
      this.distance += pas;
      if (Math.abs(f.cibleY - f.y) < 1e-3) {
        f.cibleY = null;
        if (this.route.length) this.sortirVers(this.g.voisins(this.g.cleFeuille(f.id))[0].to);
        else this.terminer();
      }
    }
  }

  // ---------- position ----------

  // instantane : pose sans transition (à la création de la boule). Sinon la normale tourne avec le chemin parcouru.
  majPosition(instantane = false) {
    if (this.mode === 'feuille') {
      const f = this.feuille;
      const g = f.geo;
      const decalage = ECART_FEUILLE + RAYON_BOULE * 0.9;
      this.position = add(add(g.base, mul(g.dir, f.y)), add(mul(g.side, f.x), mul(g.normal, decalage)));
      this.normale = g.normal.slice();
      this.tangentePrec = g.dir.slice();
      this.tangente = g.dir.slice();
      return;
    }
    if (this.mode === 'noeud') {
      // Au repos, la normale ne change pas ; à la capitale, on se tient au-dessus de la plateforme
      const n = this.noeud;
      const haut = n === this.capitale ? Y : this.normale;
      this.position = add(this.pos(n), mul(haut, this.rayon(n) + RAYON_BOULE * 0.9));
      return;
    }

    // Sur une arête : la boule roule sur la surface du rameau
    const P1 = this.pos(this.de);
    const P2 = this.pos(this.vers);
    const L = longueur(sub(P2, P1));
    const t = L > 1e-6 ? clamp(this.s / L, 0, 1) : 0;
    const T = L > 1e-6 ? mul(sub(P2, P1), 1 / L) : Y.slice();
    // La normale suit la courbure de la branche (transport parallèle), en tournant au plus vite le long du chemin
    let cible = this.normale;
    if (this.tangentePrec && !this.estFeuille(this.de) && !this.estFeuille(this.vers)) {
      cible = transporter(this.normale, this.tangentePrec, T);
    }
    cible = orthogonale(cible, T);
    // Vitesse de rotation bornée : la surface de la boule ne glisse pas plus vite que la boule elle-même
    const rayonMoyen = (this.rayon(this.de) + this.rayon(this.vers)) / 2;
    this.normale = instantane || !this.tangentePrec
      ? cible
      : rapprocher(this.normale, cible, this.distance * ROTATION_PAR_METRE / Math.max(0.3, rayonMoyen));
    this.tangentePrec = T;
    this.tangente = T;
    const r = this.rayon(this.de) + (this.rayon(this.vers) - this.rayon(this.de)) * t;
    const base = lerp3(P1, P2, t);
    let position = add(base, mul(this.normale, r + RAYON_BOULE * 0.9));
    // Près de la capitale, la boule monte par la position (sans toucher à la normale) jusqu'au-dessus de la plateforme
    let poidsCapitale = 0;
    if (this.vers === this.capitale) poidsCapitale = t;
    else if (this.de === this.capitale) poidsCapitale = 1 - t;
    if (poidsCapitale > 0) {
      const dessus = add(base, mul(Y, this.rayon(this.capitale) + RAYON_BOULE * 0.9));
      position = lerp3(position, dessus, poidsCapitale * poidsCapitale);
    }
    this.position = position;
  }
}
