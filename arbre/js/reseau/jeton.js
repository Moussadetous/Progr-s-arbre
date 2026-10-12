// Le jeton identifie ce navigateur auprès du monde (serveur ou local). Il reste dans localStorage.
const CLE = 'arbre-jeton';

export function lireJeton() {
  try { return localStorage.getItem(CLE); } catch { return null; }
}
export function ecrireJeton(valeur) {
  try { localStorage.setItem(CLE, valeur); } catch { /* navigation privée : tant pis */ }
}
export function effacerJeton() {
  try { localStorage.removeItem(CLE); } catch { /* ignore */ }
}
