// Appels au serveur et flux temps réel (SSE). Le jeton de connexion reste dans ce navigateur.
const CLE_JETON = 'arbre-jeton';

export const jeton = {
  lire() {
    try { return localStorage.getItem(CLE_JETON); } catch { return null; }
  },
  ecrire(valeur) {
    try { localStorage.setItem(CLE_JETON, valeur); } catch { /* navigation privée : tant pis */ }
  },
  effacer() {
    try { localStorage.removeItem(CLE_JETON); } catch { /* ignore */ }
  },
};

async function requete(chemin, { entetes = {}, ...options } = {}) {
  const reponse = await fetch(chemin, { ...options, headers: entetes });
  const corps = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(corps.erreur || `Erreur ${reponse.status}`);
  return corps;
}

export const api = {
  monde: () => requete('/api/monde'),
  moi: () => requete('/api/moi', { entetes: { Authorization: `Bearer ${jeton.lire()}` } }),
  videos: () => requete('/api/videos'),
  connexion: (pseudo) => requete('/api/connexion', {
    method: 'POST',
    entetes: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pseudo, token: jeton.lire() }),
  }),
  publier(fichier, titre, description) {
    return requete('/api/videos', {
      method: 'POST',
      entetes: {
        Authorization: `Bearer ${jeton.lire()}`,
        'Content-Type': fichier.type,
        'X-Titre': encodeURIComponent(titre),
        'X-Description': encodeURIComponent(description),
      },
      body: fichier,
    });
  },
};

// Le serveur pousse les changements ; EventSource se reconnecte tout seul.
export function ecouter({ onMonde, onFeuille, onVideo, onOuverture }) {
  const flux = new EventSource('/api/evenements');
  flux.addEventListener('monde', (e) => onMonde(JSON.parse(e.data)));
  flux.addEventListener('feuille', (e) => onFeuille(JSON.parse(e.data)));
  flux.addEventListener('video', (e) => onVideo(JSON.parse(e.data)));
  flux.addEventListener('open', () => onOuverture());
  return flux;
}
