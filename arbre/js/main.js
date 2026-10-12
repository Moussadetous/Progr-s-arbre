// Point d'entrée. L'arbre se charge tout de suite : depuis le serveur s'il répond, sinon en local.
// La connexion fait pousser (ou retrouve) la feuille de la personne, et la petite boule s'y pose.
import * as THREE from 'three';
import { genererArbre } from '../shared/arbre.js';
import { creerDecor } from './decor.js';
import { creerArbre3D } from './monde3d/arbre3d.js';
import { Graphe } from './monde3d/graphe.js';
import { Deplacement } from './monde3d/deplacement.js';
import { creerBoule } from './monde3d/boule.js';
import { CameraSuiveuse } from './camera.js';
import { creerEntrees } from './entrees.js';
import { choisirReseau } from './reseau/index.js';
import { lireJeton, ecrireJeton, effacerJeton } from './reseau/jeton.js';
import * as ui from './ui.js';

const arbre = genererArbre();
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
const decor = creerDecor(scene);
const arbre3d = creerArbre3D(scene, arbre);
const graphe = new Graphe(arbre);
const deplacement = new Deplacement(graphe);
const cam = new CameraSuiveuse(camera);
const etiquetteBoule = document.getElementById('etiquette-boule');
const etiquetteCapitale = document.getElementById('etiquette-capitale');

let reseau = null;
let moi = null; // la personne connectée
let feuilleMoi = null; // sa feuille
let boule = null; // sa petite boule
let pseudoEnCours = null; // pseudo en cours de connexion (pour ne pas s'annoncer soi-même)
const feuillesConnues = new Map(); // identifiant de feuille -> feuille

function redimensionner() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', redimensionner);
redimensionner();

// ---------- monde ----------

// Ajoute une feuille aux données, au rendu et au graphe (sans effet si elle existe déjà)
function ajouterFeuille(f) {
  feuillesConnues.set(f.id, f);
  const nouvelle = arbre3d.ajouterFeuille(f);
  graphe.ajouterFeuille(f);
  return nouvelle;
}

// Met l'arbre à jour selon l'état du monde : nœuds poussés, épaisseurs, feuilles
function appliquerMonde(m) {
  graphe.etendre(m.noeudsVisibles);
  arbre3d.majCroissance(m.noeudsVisibles, m.poids);
  for (const f of m.feuilles) ajouterFeuille(f);
  ui.compteurs(m);
}

function entrer(utilisateur, feuille) {
  moi = utilisateur;
  feuilleMoi = feuille;
  ajouterFeuille(feuille);
  boule = creerBoule(scene, utilisateur.teinte);
  etiquetteBoule.textContent = utilisateur.pseudo;
  etiquetteBoule.classList.remove('cache');
  // La boule commence au centre de sa feuille-maison
  deplacement.poserDansFeuille(feuille.id);
  cam.suivreBoule(deplacement.position);
  ui.cacherConnexion();
  ui.afficherHud();
  ui.afficherAide();
}

async function seConnecter(pseudo) {
  pseudoEnCours = pseudo;
  try {
    const r = await reseau.connexion(pseudo, lireJeton());
    ecrireJeton(r.token);
    appliquerMonde(await reseau.instantane());
    entrer(r.utilisateur, r.feuille);
    ui.toast(r.nouveau
      ? `🌱 Bienvenue ${r.utilisateur.pseudo} ! Ta feuille vient de pousser.`
      : `🐜 Content de te revoir, ${r.utilisateur.pseudo} !`);
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
  return reseau.abonner({
    onMonde: (m) => {
      graphe.etendre(m.noeudsVisibles);
      arbre3d.majCroissance(m.noeudsVisibles, m.poids);
      ui.compteurs(m);
    },
    onFeuille: (f) => {
      if (!ajouterFeuille(f)) return; // déjà dessinée
      const estMoi = (moi && f.utilisateurId === moi.id) || f.pseudo === pseudoEnCours;
      if (!estMoi) annoncerArrivees(f.pseudo);
    },
    onVideo: (v) => {
      if (moi && v.auteurId === moi.id) return; // l'auteur a déjà sa confirmation
      ui.toast(`🎬 ${v.auteurPseudo} a publié « ${v.titre} » vers la capitale`);
    },
    // Après une coupure du serveur, on se remet à jour depuis l'instantané
    onOuverture: () => reseau.instantane().then(appliquerMonde).catch(() => {}),
  });
}

// ---------- gestes et actions ----------

function toucher(x, y) {
  return arbre3d.choisir(camera, x, y, canvas.getBoundingClientRect());
}

function surClic(x, y) {
  if (!moi) return;
  const c = toucher(x, y);
  if (!c) return;
  if (c.type === 'feuille') return ouvrirCarteFeuille(c.id);
  if (c.id === arbre.capitale) return allerCapitale();
  if (!deplacement.allerVers(c.id)) ui.toast('Pas de chemin jusque-là');
}

function surSurvol(x, y) {
  const c = toucher(x, y);
  canvas.style.cursor = c ? 'pointer' : 'grab';
  if (c && c.type === 'feuille') ui.bulle(arbre3d.entreeFeuille(c.id).pseudo, x, y);
  else ui.cacherBulle();
}

const entrees = creerEntrees(canvas, {
  onClic: surClic,
  onTourner: (dx, dy) => cam.tourner(dx, dy),
  onZoom: (f) => cam.zoomer(f),
  onSurvol: surSurvol,
});

async function ouvrirCarteFeuille(id) {
  const f = arbre3d.entreeFeuille(id);
  const videos = await reseau.videos();
  const videosAuteur = videos.filter((v) => v.auteurId === f.utilisateurId);
  const estMoi = moi && f.utilisateurId === moi.id;
  const n = videosAuteur.length;
  ui.carteFeuille({
    titre: estMoi ? '🍃 Ta feuille' : `🍃 Feuille de ${f.pseudo}`,
    texte: `${n} vidéo${n > 1 ? 's' : ''} publiée${n > 1 ? 's' : ''}`,
    surAller: () => { if (moi) deplacement.allerVers(graphe.cleFeuille(id)); },
    surVideos: () => ui.afficherVideos({
      titre: `🍃 Vidéos de ${f.pseudo}`,
      sousTitre: 'Publiées depuis cette feuille',
      videos: videosAuteur,
      surLecture: lireVideo,
    }),
  });
}

async function ouvrirCapitale() {
  ui.afficherVideos({
    titre: '👑 La Capitale',
    sousTitre: 'Toutes les vidéos publiées remontent ici',
    videos: await reseau.videos(),
    surLecture: lireVideo,
  });
}

// La liste des vidéos s'ouvre tout de suite ; la boule, elle, marche jusqu'à la capitale
function allerCapitale() {
  ouvrirCapitale();
  if (moi && !deplacement.allerVers(arbre.capitale)) ui.toast('Pas de chemin jusqu’à la capitale');
}

async function ouvrirEcran() {
  const videos = await reseau.videos();
  ui.afficherVideos({
    titre: '📺 Ton écran',
    sousTitre: 'Les vidéos des autres feuilles',
    videos: videos.filter((v) => !moi || v.auteurId !== moi.id),
    surLecture: lireVideo,
  });
}

async function lireVideo(v) {
  ui.lire(v, await reseau.urlVideo(v));
}

document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('click', () => {
    const nom = b.dataset.action;
    if (nom === 'maison') {
      if (moi) deplacement.allerVers(graphe.cleFeuille(feuilleMoi.id));
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

ui.initialiser();
ui.brancherConnexion(seConnecter, () => ui.cacherConnexion());
ui.brancherPublier(async (donnees) => {
  const video = await reseau.publier(donnees.fichier, donnees.titre, donnees.description, lireJeton());
  ui.toast(`🎬 « ${video.titre} » est parti vers la capitale`);
  return video;
});

// Accès de débogage pour les tests de bout en bout : rien d'utile pour une visite normale
window.__arbre = {
  get arbre() { return arbre; },
  get deplacement() { return deplacement; },
  get graphe() { return graphe; },
  get camera() { return camera; },
  get reseau() { return reseau; },
};

// ---------- étiquettes et boucle ----------

const pointProjete = new THREE.Vector3();
function placerEtiquette(el, x, y, z, visible = true) {
  pointProjete.set(x, y, z).project(camera);
  const dansEcran = visible && pointProjete.z < 1 && Math.abs(pointProjete.x) < 1.1 && Math.abs(pointProjete.y) < 1.1;
  el.style.opacity = dansEcran ? '1' : '0';
  el.style.transform = `translate(${(pointProjete.x * 0.5 + 0.5) * window.innerWidth}px, ${(-pointProjete.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
}

let dernier = performance.now();
function boucle(now) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.05, (now - dernier) / 1000);
  dernier = now;
  const t = now / 1000;

  arbre3d.update(dt, t);
  decor.update(t);

  if (moi && boule) {
    // Direction voulue, dans le monde, à partir de ce que la caméra voit
    const e = entrees.vecteur();
    const l = Math.hypot(e.avant, e.droite);
    let entree = null;
    if (l > 0) {
      const k = Math.min(1, l) / l;
      const axes = cam.axesMonde();
      const a = e.avant * k;
      const d = e.droite * k;
      entree = [axes.avant[0] * a + axes.droite[0] * d, 0, axes.avant[2] * a + axes.droite[2] * d];
    }
    const etat = deplacement.update(dt, entree, e.course);
    boule.placer(etat.position, etat.normale, etat.tangente, etat.distance);
    cam.suivre(etat.position, dt);
    placerEtiquette(etiquetteBoule, etat.position[0], etat.position[1] + 0.6, etat.position[2]);
  } else {
    cam.vueApercu(t, dt);
  }
  cam.update(arbre3d.obstacle);

  const cap = arbre3d.positionCapitale();
  placerEtiquette(etiquetteCapitale, cap.x, cap.y + 7.5, cap.z);
  renderer.render(scene, camera);
}
requestAnimationFrame(boucle);

// ---------- démarrage ----------

async function demarrer() {
  reseau = await choisirReseau({ arbre });
  ui.afficherMode(reseau.nom);
  appliquerMonde(await reseau.instantane());
  demarrerTempsReel();

  // Connexion automatique si ce navigateur a déjà une feuille
  const jeton = lireJeton();
  if (jeton) {
    try {
      const u = await reseau.moi(jeton);
      const feuille = [...feuillesConnues.values()].find((f) => f.utilisateurId === u.id);
      if (feuille) {
        entrer(u, feuille);
        return;
      }
    } catch {
      effacerJeton();
    }
  }
  ui.afficherConnexion();
}

demarrer().catch((e) => {
  console.error(e);
  ui.toast('Impossible de charger le monde 🌩️', 8000);
});
