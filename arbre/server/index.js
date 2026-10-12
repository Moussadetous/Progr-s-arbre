// Lance le serveur de l'Arbre :  npm start  →  http://localhost:3000
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerServeur } from './serveur.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DONNEES = process.env.ARBRE_DONNEES || path.join(RACINE, 'data');
const PORT = Number(process.env.PORT) || 3000;

const { serveur } = creerServeur({ racine: RACINE, donnees: DONNEES });
serveur.listen(PORT, () => {
  console.log(`🌳 L'Arbre écoute sur http://localhost:${PORT}`);
  console.log(`   données : ${DONNEES}`);
});
