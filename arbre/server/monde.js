// Le monde : utilisateurs, feuilles (une par utilisateur) et vidéos publiques.
// Le serveur est l'autorité : c'est lui qui décide où pousse une feuille et combien l'arbre a grandi.
// La mémoire est sauvegardée dans un simple fichier JSON (suffisant pour un prototype).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { genererArbre } from '../shared/treegen.js';
import { nbBranchesVisibles, calculerPoids } from '../shared/regles.js';

export const MIMES_VIDEO = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
};

export class Erreur extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// Empreinte simple d'un texte : sert à répartir les feuilles de façon stable
function empreinte(texte) {
  let h = 0;
  for (const c of texte) h = (Math.imul(h, 31) + c.codePointAt(0)) >>> 0;
  return h;
}

export class Monde {
  constructor({ fichier = null, surChangement = () => {} } = {}) {
    this.fichier = fichier;
    this.surChangement = surChangement;
    this.arbre = genererArbre();
    this.utilisateurs = [];
    this.feuilles = [];
    this.videos = [];
    this.charger();
  }

  charger() {
    if (!this.fichier || !fs.existsSync(this.fichier)) return;
    const donnees = JSON.parse(fs.readFileSync(this.fichier, 'utf8'));
    this.utilisateurs = donnees.utilisateurs || [];
    this.feuilles = donnees.feuilles || [];
    this.videos = donnees.videos || [];
  }

  sauver() {
    if (!this.fichier) return;
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    const tmp = `${this.fichier}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ utilisateurs: this.utilisateurs, feuilles: this.feuilles, videos: this.videos }));
    fs.renameSync(tmp, this.fichier);
  }

  // Nombre de rameaux visibles (la croissance) à cet instant
  noeudsVisibles() {
    return nbBranchesVisibles(this.utilisateurs.length, this.arbre.noeuds.length);
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
      id: crypto.randomUUID(),
      pseudo,
      token: crypto.randomUUID(),
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
    this.sauver();
    // Le monde d'abord (la branche doit être visible), puis la feuille
    this.surChangement('monde', this.resume());
    this.surChangement('feuille', feuille);
    return { utilisateur, feuille, nouveau: true };
  }

  // La feuille va sur la brindille visible la moins chargée.
  // En cas d'égalité, le point de départ dépend de l'utilisateur : les feuilles se répartissent.
  choisirPlace(graine) {
    const K = this.noeudsVisibles();
    const candidats = this.arbre.noeuds.filter((n) => n.genre === 'branche' && n.ordre < K);
    if (candidats.length === 0) return { noeud: this.arbre.capitale, emplacement: 0 };
    const charge = new Map();
    for (const f of this.feuilles) charge.set(f.noeud, (charge.get(f.noeud) || 0) + 1);
    const depart = empreinte(graine) % candidats.length;
    let meilleur = null;
    let meilleureCharge = Infinity;
    for (let i = 0; i < candidats.length; i++) {
      const c = candidats[(depart + i) % candidats.length];
      const q = charge.get(c.id) || 0;
      if (q < meilleureCharge) {
        meilleur = c;
        meilleureCharge = q;
      }
    }
    return { noeud: meilleur.id, emplacement: meilleureCharge };
  }

  // Poids de chaque nœud : c'est lui qui fait gonfler les branches
  poids() {
    const parNoeud = new Array(this.arbre.noeuds.length).fill(0);
    for (const f of this.feuilles) parNoeud[f.noeud]++;
    return calculerPoids(this.arbre.noeuds, parNoeud);
  }

  resume() {
    return {
      utilisateurs: this.utilisateurs.length,
      noeudsVisibles: this.noeudsVisibles(),
      noeudsTotal: this.arbre.noeuds.length,
      poids: this.poids(),
    };
  }

  // Tout ce qu'il faut pour dessiner le monde à l'arrivée d'un visiteur
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
