// Mode local : le même monde que le serveur, mais tout vit dans le navigateur.
// Les métadonnées (utilisateurs, feuilles, vidéos) sont dans localStorage ; les fichiers vidéo dans IndexedDB.
// Sans serveur, les autres personnes sont des feuilles de démonstration, créées au premier lancement.
import { Monde, Erreur, MIMES_VIDEO, TAILLE_MAX_VIDEO, uuid } from '../../shared/monde.js';

const CLE = 'arbre-monde-local-v1';
const BASE_MEDIAS = 'arbre-medias-v1';
const NOMS_DEMO = [
  'Lina', 'Hugo', 'Inès', 'Léo', 'Maël', 'Jade', 'Théo', 'Chloé', 'Nathan', 'Manon',
  'Gabriel', 'Lucie', 'Adam', 'Camille', 'Raphaël', 'Sarah', 'Noah', 'Emma', 'Tom', 'Alice',
  'Enzo', 'Zoé', 'Louis', 'Léna', 'Sacha', 'Eva', 'Oscar', 'Nina', 'Victor', 'Rose',
  'Iris', 'Malo', 'Lou', 'Aya', 'Kenza', 'Sami', 'Ines', 'Yanis', 'Mila', 'Ethan',
  'Julia', 'Ruben', 'Léonie', 'Elias', 'Mathis', 'Agathe', 'Basile', 'Hana', 'Paul', 'Mina',
];

const publicUtilisateur = (u) => ({ id: u.id, pseudo: u.pseudo, teinte: u.teinte });

// ---------- fichiers vidéo (IndexedDB) ----------

function ouvrirMedias() {
  return new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(BASE_MEDIAS, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('medias');
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}

async function ecrireMedia(id, fichier) {
  const db = await ouvrirMedias();
  await new Promise((resoudre, rejeter) => {
    const tx = db.transaction('medias', 'readwrite');
    tx.objectStore('medias').put(fichier, id);
    tx.oncomplete = resoudre;
    tx.onerror = () => rejeter(tx.error);
  });
  db.close();
}

async function lireMedia(id) {
  const db = await ouvrirMedias();
  const fichier = await new Promise((resoudre, rejeter) => {
    const req = db.transaction('medias', 'readonly').objectStore('medias').get(id);
    req.onsuccess = () => resoudre(req.result);
    req.onerror = () => rejeter(req.error);
  });
  db.close();
  return fichier;
}

// ---------- le monde local ----------

export async function creerLocal({ arbre }) {
  const abonnes = new Set();
  const emettre = (type, contenu) => {
    for (const f of abonnes) f(type, contenu);
  };
  const stockage = {
    lire() {
      try { return JSON.parse(localStorage.getItem(CLE)); } catch { return null; }
    },
    ecrire(donnees) {
      try { localStorage.setItem(CLE, JSON.stringify(donnees)); } catch { /* quota dépassé : tant pis */ }
    },
  };
  const monde = new Monde({ arbre, stockage, surChangement: emettre });
  // Premier lancement : quelques feuilles de démonstration pour que l'arbre ne soit pas vide
  if (monde.utilisateurs.length === 0) {
    for (const nom of NOMS_DEMO) monde.entrer(nom, uuid());
  }
  const urls = new Map(); // id de vidéo -> URL d'objet, créée une seule fois

  return {
    nom: 'local',
    async instantane() {
      return monde.instantane();
    },
    async moi(jeton) {
      const u = monde.utilisateurParToken(jeton);
      if (!u) throw new Error('Connexion requise');
      return publicUtilisateur(u);
    },
    async connexion(pseudo, jeton) {
      const r = monde.entrer(pseudo, jeton);
      return {
        token: r.utilisateur.token,
        utilisateur: publicUtilisateur(r.utilisateur),
        feuille: r.feuille,
        nouveau: r.nouveau,
      };
    },
    async videos() {
      return monde.listerVideos();
    },
    async urlVideo(v) {
      if (!urls.has(v.id)) {
        const fichier = await lireMedia(v.id);
        if (!fichier) throw new Error('Vidéo introuvable');
        urls.set(v.id, URL.createObjectURL(fichier));
      }
      return urls.get(v.id);
    },
    async publier(fichier, titre, description, jeton) {
      const auteur = monde.utilisateurParToken(jeton);
      if (!auteur) throw new Erreur(401, 'Connexion requise');
      const ext = MIMES_VIDEO[fichier.type];
      monde.verifierVideo({ titre, description, ext });
      if (fichier.size > TAILLE_MAX_VIDEO) throw new Erreur(413, 'Vidéo trop lourde (150 Mo maximum)');
      const id = uuid();
      await ecrireMedia(id, fichier);
      return monde.ajouterVideo({ id, auteur, titre, description, ext, taille: fichier.size });
    },
    abonner({ onMonde, onFeuille, onVideo }) {
      const f = (type, contenu) => {
        if (type === 'monde') onMonde(contenu);
        else if (type === 'feuille') onFeuille(contenu);
        else if (type === 'video') onVideo(contenu);
      };
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
}
