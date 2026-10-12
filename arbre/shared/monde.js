// Le monde : utilisateurs, feuilles (une par personne) et vidéos publiques.
// Logique pure, partagée par le serveur et le mode local (navigateur).
// Le stockage est injecté : fichier JSON côté serveur, localStorage côté navigateur.
import { nbVisibles, calculerPoids } from './regles.js';

export const MIMES_VIDEO = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
};
export const TAILLE_MAX_VIDEO = 150 * 1024 * 1024;

export class Erreur extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// Identifiant unique (fonctionne aussi hors contexte sécurisé, contrairement à randomUUID)
export function uuid() {
  const o = crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Empreinte simple d'un texte : sert à répartir les feuilles de façon stable
function empreinte(texte) {
  let h = 0;
  for (const c of texte) h = (Math.imul(h, 31) + c.codePointAt(0)) >>> 0;
  return h;
}

export class Monde {
  constructor({ arbre, stockage = null, surChangement = () => {} }) {
    this.arbre = arbre;
    this.stockage = stockage;
    this.surChangement = surChangement;
    this.utilisateurs = [];
    this.feuilles = [];
    this.videos = [];
    const donnees = stockage ? stockage.lire() : null;
    if (donnees) {
      this.utilisateurs = donnees.utilisateurs || [];
      this.feuilles = donnees.feuilles || [];
      this.videos = donnees.videos || [];
    }
    // Nombre de feuilles par nœud (la « charge » de chaque brindille)
    this.charge = new Map();
    for (const f of this.feuilles) this.charge.set(f.noeud, (this.charge.get(f.noeud) || 0) + 1);
  }

  sauver() {
    if (this.stockage) {
      this.stockage.ecrire({ utilisateurs: this.utilisateurs, feuilles: this.feuilles, videos: this.videos });
    }
  }

  // Nombre de nœuds poussés à cet instant
  noeudsVisibles() {
    return nbVisibles(this.utilisateurs.length, this.arbre);
  }

  utilisateurParToken(jeton) {
    if (!jeton) return null;
    return this.utilisateurs.find((u) => u.token === jeton) || null;
  }

  feuilleDe(utilisateurId) {
    return this.feuilles.find((f) => f.utilisateurId === utilisateurId) || null;
  }

  // Entrée dans l'arbre. Un nouveau pseudo crée un utilisateur et sa feuille.
  // Un pseudo déjà pris ne se reprend qu'avec le jeton du navigateur qui l'a créé.
  entrer(pseudoBrut, jeton) {
    const pseudo = String(pseudoBrut ?? '').trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N}_ -]{2,20}$/u.test(pseudo)) {
      throw new Erreur(400, 'Pseudo : 2 à 20 caractères (lettres, chiffres, espaces, - et _)');
    }
    const existant = this.utilisateurs.find((u) => u.pseudo.toLowerCase() === pseudo.toLowerCase());
    if (existant) {
      if (jeton && existant.token === jeton) {
        return { utilisateur: existant, feuille: this.feuilleDe(existant.id), nouveau: false };
      }
      throw new Erreur(409, 'Ce pseudo est déjà pris');
    }

    const utilisateur = {
      id: uuid(),
      pseudo,
      token: uuid(),
      teinte: (this.utilisateurs.length * 137.508) % 360, // angle d'or : des couleurs bien réparties
      creeLe: new Date().toISOString(),
    };
    this.utilisateurs.push(utilisateur);

    const { noeud, emplacement } = this.choisirPlace(utilisateur.id);
    const feuille = {
      id: this.feuilles.length,
      utilisateurId: utilisateur.id,
      pseudo,
      teinte: utilisateur.teinte,
      noeud,
      emplacement,
    };
    this.feuilles.push(feuille);
    this.charge.set(noeud, (this.charge.get(noeud) || 0) + 1);
    this.sauver();
    // Le monde d'abord (la branche doit être poussée), puis la feuille
    this.surChangement('monde', this.resume());
    this.surChangement('feuille', feuille);
    return { utilisateur, feuille, nouveau: true };
  }

  // La feuille va sur la brindille poussée la moins chargée.
  // En cas d'égalité, le point de départ dépend de l'utilisateur : les feuilles se répartissent.
  choisirPlace(graine) {
    const K = this.noeudsVisibles();
    const { candidats, noeuds, capitale } = this.arbre;
    // « candidats » est trié par rang : les nœuds déjà poussés forment le début du tableau
    let m = 0;
    while (m < candidats.length && noeuds[candidats[m]].rang < K) m++;
    if (m === 0) return { noeud: capitale, emplacement: 0 };
    const depart = empreinte(graine) % m;
    let meilleur = -1;
    let meilleureCharge = Infinity;
    for (let i = 0; i < m; i++) {
      const id = candidats[(depart + i) % m];
      const q = this.charge.get(id) || 0;
      if (q < meilleureCharge) {
        meilleur = id;
        meilleureCharge = q;
      }
    }
    return { noeud: meilleur, emplacement: meilleureCharge };
  }

  // Poids de chaque nœud : c'est lui qui fait gonfler les branches
  poids() {
    const parNoeud = new Array(this.arbre.N).fill(0);
    for (const [id, q] of this.charge) parNoeud[id] = q;
    return calculerPoids(this.arbre.noeuds, parNoeud);
  }

  resume() {
    return {
      utilisateurs: this.utilisateurs.length,
      noeudsVisibles: this.noeudsVisibles(),
      noeudsTotal: this.arbre.N,
      poids: this.poids(),
    };
  }

  // Tout ce qu'il faut pour afficher le monde à l'arrivée d'une personne
  instantane() {
    return { ...this.resume(), capitale: this.arbre.capitale, feuilles: this.feuilles };
  }

  verifierVideo({ titre, description, ext }) {
    if (!ext) throw new Erreur(415, 'Format non accepté (mp4, webm, mov ou ogv)');
    if (!titre || titre.length > 120) throw new Erreur(400, 'Titre requis (120 caractères maximum)');
    if (description.length > 500) throw new Erreur(400, 'Description trop longue (500 caractères maximum)');
  }

  // Toute vidéo publiée est publique : elle remonte à la capitale
  ajouterVideo({ id, auteur, titre, description, ext, taille }) {
    const video = {
      id,
      auteurId: auteur.id,
      auteurPseudo: auteur.pseudo,
      titre,
      description,
      ext,
      taille,
      creeLe: new Date().toISOString(),
    };
    this.videos.unshift(video);
    this.sauver();
    this.surChangement('video', video);
    return video;
  }

  listerVideos() {
    return this.videos;
  }
}
