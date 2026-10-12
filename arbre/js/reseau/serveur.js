// Client du serveur : API HTTP et flux temps réel (SSE). Même interface que le mode local.
export function creerServeur(base = document.baseURI) {
  const url = (chemin) => new URL(chemin, base);

  async function requete(chemin, { entetes = {}, ...options } = {}) {
    const reponse = await fetch(url(chemin), { ...options, headers: entetes });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(corps.erreur || `Erreur ${reponse.status}`);
    return corps;
  }

  return {
    nom: 'serveur',
    instantane: () => requete('api/monde'),
    moi: (jeton) => requete('api/moi', { entetes: { Authorization: `Bearer ${jeton}` } }),
    connexion: (pseudo, jeton) => requete('api/connexion', {
      method: 'POST',
      entetes: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo, token: jeton }),
    }),
    videos: () => requete('api/videos'),
    urlVideo: async (v) => url(`medias/${v.id}.${v.ext}`).href,
    publier(fichier, titre, description, jeton) {
      return requete('api/videos', {
        method: 'POST',
        entetes: {
          Authorization: `Bearer ${jeton}`,
          'Content-Type': fichier.type,
          'X-Titre': encodeURIComponent(titre),
          'X-Description': encodeURIComponent(description),
        },
        body: fichier,
      });
    },
    // handlers : { onMonde, onFeuille, onVideo, onOuverture }. Renvoie une fonction pour se désabonner.
    abonner({ onMonde, onFeuille, onVideo, onOuverture }) {
      const flux = new EventSource(url('api/evenements'));
      flux.addEventListener('monde', (e) => onMonde(JSON.parse(e.data)));
      flux.addEventListener('feuille', (e) => onFeuille(JSON.parse(e.data)));
      flux.addEventListener('video', (e) => onVideo(JSON.parse(e.data)));
      flux.addEventListener('open', () => onOuverture?.());
      return () => flux.close();
    },
  };
}
