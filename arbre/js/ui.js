// Interface en HTML : connexion, compteurs, mode, aide, notifications, vidéos, publication et lecteur.
const $ = (id) => document.getElementById(id);
const TAILLE_MAX = 150 * 1024 * 1024; // même limite que le serveur

const dateCourte = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function ouvrir(id) {
  $(id).classList.remove('cache');
}

export function fermer(id) {
  $(id).classList.add('cache');
  if (id === 'panneau-lecteur') arreterLecture();
}

export function initialiser() {
  document.querySelectorAll('[data-fermer]').forEach((b) => {
    b.addEventListener('click', () => fermer(b.dataset.fermer));
  });
}

export function compteurs({ utilisateurs, noeudsVisibles, noeudsTotal }) {
  const feuilles = `${utilisateurs} feuille${utilisateurs > 1 ? 's' : ''}`;
  $('compte-texte').textContent = `🍃 ${feuilles} · 🌿 ${noeudsVisibles}/${noeudsTotal} rameaux poussés`;
}

export function afficherMode(nom) {
  $('mode').textContent = nom === 'serveur'
    ? '🌐 Monde partagé (serveur)'
    : '💾 Sans serveur : monde local sur cet appareil';
}

const MAX_TOASTS = 4;
export function toast(texte, duree = 4000) {
  const conteneur = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = texte;
  conteneur.appendChild(el);
  while (conteneur.children.length > MAX_TOASTS) conteneur.firstElementChild.remove();
  setTimeout(() => el.classList.add('sort'), duree);
  setTimeout(() => el.remove(), duree + 500);
}

// Aide sur les commandes : affichée après la connexion, puis elle s'efface
let minuterieAide = null;
export function afficherAide() {
  ouvrir('aide');
  clearTimeout(minuterieAide);
  minuterieAide = setTimeout(() => fermer('aide'), 14000);
}

// ---------- connexion ----------

export function brancherConnexion(surEntrer, surRegarder) {
  $('form-connexion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = $('bouton-entrer');
    $('erreur-connexion').textContent = '';
    bouton.disabled = true;
    try {
      await surEntrer($('champ-pseudo').value.trim());
    } catch (err) {
      $('erreur-connexion').textContent = err.message;
    } finally {
      bouton.disabled = false;
    }
  });
  $('bouton-regarder').addEventListener('click', surRegarder);
}

export function afficherConnexion() {
  ouvrir('connexion');
}

export function cacherConnexion() {
  fermer('connexion');
}

export function afficherHud() {
  $('hud').classList.remove('cache');
}

// ---------- info-bulle (survol) ----------

export function bulle(texte, x, y) {
  const el = $('bulle');
  el.textContent = texte;
  el.style.transform = `translate(${x + 14}px, ${y - 10}px)`;
  el.classList.remove('cache');
}

export function cacherBulle() {
  $('bulle').classList.add('cache');
}

// ---------- carte d'une feuille (clic) ----------

export function carteFeuille({ titre, texte, surAller, surVideos }) {
  $('carte-titre').textContent = titre;
  $('carte-texte').textContent = texte;
  $('carte-aller').onclick = () => { fermer('carte-feuille'); surAller(); };
  $('carte-videos').onclick = () => { fermer('carte-feuille'); surVideos(); };
  ouvrir('carte-feuille');
}

// ---------- liste de vidéos (écran, capitale, feuille) ----------

export function afficherVideos({ titre, sousTitre, videos, surLecture }) {
  $('videos-titre').textContent = titre;
  $('videos-sous-titre').textContent = sousTitre;
  const liste = $('videos-liste');
  liste.replaceChildren();
  if (videos.length === 0) {
    const vide = document.createElement('p');
    vide.className = 'vide';
    vide.textContent = 'Aucune vidéo pour l’instant. Publie la première !';
    liste.appendChild(vide);
  }
  for (const v of videos) {
    const carte = document.createElement('article');
    carte.className = 'video-carte';

    const vignette = document.createElement('div');
    vignette.className = 'vignette';
    vignette.textContent = '🎬';

    const texte = document.createElement('div');
    texte.className = 'texte';
    const h3 = document.createElement('h3');
    h3.textContent = v.titre;
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${v.auteurPseudo} · ${dateCourte(v.creeLe)}`;
    texte.append(h3, meta);

    const bouton = document.createElement('button');
    bouton.className = 'principal';
    bouton.textContent = '▶ Regarder';
    bouton.addEventListener('click', () => surLecture(v));

    carte.append(vignette, texte, bouton);
    liste.appendChild(carte);
  }
  fermer('panneau-lecteur');
  ouvrir('panneau-videos');
}

// ---------- lecteur ----------

export function lire(v, url) {
  fermer('panneau-videos');
  const el = $('lecteur-video');
  el.src = url;
  $('lecteur-titre').textContent = v.titre;
  $('lecteur-meta').textContent = `${v.auteurPseudo} · ${dateCourte(v.creeLe)}`;
  $('lecteur-description').textContent = v.description || '';
  ouvrir('panneau-lecteur');
  el.play().catch(() => { /* lecture refusée par le navigateur : l'utilisateur appuie sur lecture */ });
}

export function arreterLecture() {
  const el = $('lecteur-video');
  el.pause();
  el.removeAttribute('src');
  el.load();
}

// ---------- publication ----------

export function ouvrirPublier() {
  $('form-publier').reset();
  $('publier-etat').textContent = '';
  ouvrir('panneau-publier');
}

// surPublier({ fichier, titre, description }) renvoie une promesse
export function brancherPublier(surPublier) {
  const form = $('form-publier');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const etat = $('publier-etat');
    const fichier = $('champ-fichier').files[0];
    const titre = $('champ-titre').value.trim();
    const description = $('champ-description').value.trim();
    etat.textContent = '';
    if (!fichier) { etat.textContent = 'Choisis une vidéo.'; return; }
    if (fichier.size > TAILLE_MAX) { etat.textContent = 'Vidéo trop lourde (150 Mo maximum).'; return; }
    if (!titre) { etat.textContent = 'Donne un titre à ta vidéo.'; return; }

    const bouton = $('bouton-publier');
    bouton.disabled = true;
    etat.textContent = '⏫ Envoi vers la capitale…';
    try {
      await surPublier({ fichier, titre, description });
      form.reset();
      fermer('panneau-publier');
    } catch (err) {
      etat.textContent = `⚠️ ${err.message}`;
    } finally {
      bouton.disabled = false;
    }
  });
}
