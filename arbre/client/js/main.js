// Point d'entrée : l'arbre se charge tout de suite, même sans compte.
// La connexion fait pousser (ou retrouve) la feuille de l'utilisateur, et sa fourmi s'y pose.
import * as THREE from 'three';
import { api, jeton, ecouter } from './api.js';
import { creerDecor } from './cartoon.js';
import { creerArbre3D } from './arbre3d.js';
import { Graphe } from './graphe.js';
import { creerFourmi, Promeneur } from './promeneur.js';
import { CameraOrbite } from './camera.js';
import { brancherSaisie } from './saisie.js';
import * as ui from './ui.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const decor = creerDecor(scene);
const orbite = new CameraOrbite(camera);
if (window.innerWidth < 640) orbite.distance = 22; // sur téléphone, l'arbre tient entier à l'écran
const CENTRE_VUE = new THREE.Vector3(0, 4.5, 0);
const HAUT_ETIQUETTE = new THREE.Vector3(0, 0.7, 0);
const HAUT_CAPITALE = new THREE.Vector3(0, 3.6, 0);

let arbre = null; // l'arbre dessiné
let graphe = null; // là où la fourmi peut marcher
let fourmi = null; // la fourmi de l'utilisateur connecté
let promeneur = null;
let moi = null; // l'utilisateur connecté
let feuilleMoi = null; // sa feuille
let pseudoEnCours = null; // pseudo en cours de connexion (pour ne pas s'annoncer soi-même)

const etiquetteMoi = document.getElementById('etiquette-moi');
const etiquetteCapitale = document.getElementById('etiquette-capitale');

function redimensionner() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', redimensionner);
redimensionner();

// ---------- monde ----------

async function chargerMonde() {
  const monde = await api.monde();
  if (!arbre) arbre = creerArbre3D(scene);
  arbre.majCroissance(monde);
  for (const f of monde.feuilles) arbre.ajouterFeuille(f);
  if (!graphe) graphe = new Graphe(arbre);
  graphe.reconstruire();
  ui.compteurs(monde);
}

function entrer(utilisateur, feuille) {
  moi = utilisateur;
  feuilleMoi = feuille;
  fourmi = creerFourmi(scene, utilisateur.teinte);
  promeneur = new Promeneur(fourmi, graphe);
  promeneur.poser(feuille ? graphe.cleFeuille(feuille.id) : arbre.capitale);
  orbite.recentrer(fourmi.position);
  etiquetteMoi.textContent = utilisateur.pseudo;
  etiquetteMoi.classList.remove('cache');
  ui.afficherHud();
  ui.cacherConnexion();
}

async function seConnecter(pseudo) {
  pseudoEnCours = pseudo;
  try {
    const reponse = await api.connexion(pseudo);
    jeton.ecrire(reponse.token);
    await chargerMonde();
    entrer(reponse.utilisateur, reponse.feuille);
    ui.toast(reponse.nouveau
      ? `🌱 Bienvenue ${reponse.utilisateur.pseudo} ! Ta feuille vient de pousser.`
      : `🐜 Content de te revoir, ${reponse.utilisateur.pseudo} !`);
  } finally {
    pseudoEnCours = null;
  }
}

// ---------- temps réel ----------

// Les arrivées proches dans le temps sont regroupées en une seule notification
let arriveesEnAttente = [];
let minuterieArrivees = null;
function annoncerArrivees(pseudo) {
  arriveesEnAttente.push(pseudo);
  if (minuterieArrivees) return;
  minuterieArrivees = setTimeout(() => {
    const noms = arriveesEnAttente;
    arriveesEnAttente = [];
    minuterieArrivees = null;
    const liste = noms.length <= 3 ? noms.join(', ') : `${noms.slice(0, 3).join(', ')} et ${noms.length - 3} autres`;
    ui.toast(`🍃 ${liste} ${noms.length > 1 ? 'viennent' : 'vient'} de rejoindre l’arbre`);
  }, 1500);
}

function demarrerTempsReel() {
  ecouter({
    onMonde: (m) => {
      arbre.majCroissance(m);
      graphe.reconstruire();
      ui.compteurs(m);
    },
    onFeuille: (f) => {
      if (!arbre.ajouterFeuille(f)) return; // déjà dessinée
      graphe.reconstruire();
      const estMoi = (moi && f.utilisateurId === moi.id) || f.pseudo === pseudoEnCours;
      if (!estMoi) annoncerArrivees(f.pseudo);
    },
    onVideo: (v) => {
      if (moi && v.auteurId === moi.id) return; // l'auteur a déjà sa confirmation
      ui.toast(`🎬 ${v.auteurPseudo} a publié « ${v.titre} » vers la capitale`);
    },
    // Au premier passage comme après une coupure : on se remet à jour depuis l'instantané
    onOuverture: () => chargerMonde().catch(() => {}),
  });
}

// ---------- gestes ----------

function toucher(x, y) {
  if (!arbre) return null;
  return arbre.choisir(camera, x, y, canvas.getBoundingClientRect());
}

function surClic(x, y) {
  const cible = toucher(x, y);
  if (!cible) return;
  if (cible.type === 'feuille') return ouvrirCarteFeuille(cible.id);
  if (cible.id === arbre.capitale) return allerCapitale();
  if (promeneur && arbre.visible(cible.id)) promeneur.allerVers(cible.id);
}

function surSurvol(x, y) {
  const cible = toucher(x, y);
  canvas.style.cursor = cible ? 'pointer' : 'grab';
  if (cible && cible.type === 'feuille') {
    ui.bulle(arbre.entreeFeuille(cible.id).pseudo, x, y);
  } else {
    ui.cacherBulle();
  }
}

brancherSaisie(canvas, {
  onClic: surClic,
  onTourner: (dx, dy) => orbite.tourner(dx, dy),
  onZoom: (f) => orbite.zoomer(f),
  onSurvol: surSurvol,
});

// ---------- actions ----------

async function ouvrirCarteFeuille(id) {
  const f = arbre.entreeFeuille(id);
  const videos = await api.videos();
  const videosAuteur = videos.filter((v) => v.auteurId === f.utilisateurId);
  const estMoi = moi && f.utilisateurId === moi.id;
  const n = videosAuteur.length;
  ui.carteFeuille({
    titre: estMoi ? '🍃 Ta feuille' : `🍃 Feuille de ${f.pseudo}`,
    texte: `${n} vidéo${n > 1 ? 's' : ''} publiée${n > 1 ? 's' : ''}`,
    surAller: () => { if (promeneur) promeneur.allerVers(graphe.cleFeuille(id)); },
    surVideos: () => ui.afficherVideos({
      titre: `🍃 Vidéos de ${f.pseudo}`,
      sousTitre: 'Publiées depuis cette feuille',
      videos: videosAuteur,
      surLecture: ui.lire,
    }),
  });
}

async function ouvrirCapitale() {
  const videos = await api.videos();
  ui.afficherVideos({
    titre: '👑 La Capitale',
    sousTitre: 'Toutes les vidéos publiées remontent ici',
    videos,
    surLecture: ui.lire,
  });
}

function allerCapitale() {
  if (promeneur) promeneur.allerVers(arbre.capitale, ouvrirCapitale);
  else ouvrirCapitale();
}

async function ouvrirEcran() {
  const videos = await api.videos();
  ui.afficherVideos({
    titre: '📺 Ton écran',
    sousTitre: 'Les vidéos des autres feuilles',
    videos: videos.filter((v) => !moi || v.auteurId !== moi.id),
    surLecture: ui.lire,
  });
}

document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('click', () => {
    const nom = b.dataset.action;
    if (nom === 'maison') {
      if (promeneur && feuilleMoi) promeneur.allerVers(graphe.cleFeuille(feuilleMoi.id));
      else ui.toast('Entre dans l’arbre pour avoir ta feuille');
    }
    if (nom === 'capitale') allerCapitale();
    if (nom === 'ecran') ouvrirEcran();
    if (nom === 'publier') {
      if (moi) ui.ouvrirPublier();
      else ui.toast('Entre dans l’arbre pour publier');
    }
  });
});

// Accès de débogage (tests de bout en bout) : rien d'utile pour un visiteur
window.__arbre = {
  get promeneur() { return promeneur; },
  get fourmi() { return fourmi; },
  get arbre() { return arbre; },
  get camera() { return camera; },
};

ui.initialiser();
ui.brancherConnexion(seConnecter, () => ui.cacherConnexion());
ui.brancherPublier(async (donnees) => {
  const video = await api.publier(donnees.fichier, donnees.titre, donnees.description);
  ui.toast(`🎬 « ${video.titre} » est parti vers la capitale`);
  return video;
});

// ---------- étiquettes et boucle ----------

function placerEtiquette(el, point) {
  const v = point.clone().project(camera);
  const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
  el.style.opacity = visible ? '1' : '0';
  el.style.transform = `translate(${(v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-v.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
}

let dernier = performance.now();
function boucle(now) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.05, (now - dernier) / 1000);
  dernier = now;
  const t = now / 1000;

  if (arbre) arbre.update(dt, t);
  if (promeneur) promeneur.update(dt, t);
  orbite.suivre(fourmi ? fourmi.position : CENTRE_VUE, dt);
  orbite.update();
  decor.update(t);

  if (fourmi) placerEtiquette(etiquetteMoi, fourmi.position.clone().add(HAUT_ETIQUETTE));
  if (arbre) {
    placerEtiquette(etiquetteCapitale, arbre.centreCapitale().add(HAUT_CAPITALE));
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(boucle);

// ---------- démarrage ----------

async function demarrer() {
  await chargerMonde();
  demarrerTempsReel();

  // Connexion automatique si ce navigateur a déjà une feuille
  if (jeton.lire()) {
    try {
      const u = await api.moi();
      const feuille = arbre.liste().find((f) => f.utilisateurId === u.id);
      entrer(u, feuille);
      return;
    } catch {
      jeton.effacer();
    }
  }
  ui.afficherConnexion();
}

demarrer().catch((e) => {
  console.error(e);
  ui.toast('Impossible de joindre le serveur de l’arbre 🌩️', 8000);
});
