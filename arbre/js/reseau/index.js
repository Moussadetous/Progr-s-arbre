// Choix du monde : le serveur s'il répond, sinon le mode local (tout dans le navigateur).
import { creerServeur } from './serveur.js';
import { creerLocal } from './local.js';

async function serveurDisponible() {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), 1500);
  try {
    const r = await fetch(new URL('api/monde', document.baseURI), { cache: 'no-store', signal: controle.signal });
    if (!r.ok) return false;
    const donnees = await r.json();
    return Array.isArray(donnees.feuilles);
  } catch {
    return false;
  } finally {
    clearTimeout(minuterie);
  }
}

export async function choisirReseau({ arbre }) {
  if (await serveurDisponible()) return creerServeur();
  return creerLocal({ arbre });
}
