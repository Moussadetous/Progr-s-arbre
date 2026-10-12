// Stockage du monde sur le disque : un fichier JSON, réécrit de façon atomique.
import fs from 'node:fs';
import path from 'node:path';

export function stockageFichier(fichier) {
  return {
    lire() {
      if (!fs.existsSync(fichier)) return null;
      return JSON.parse(fs.readFileSync(fichier, 'utf8'));
    },
    ecrire(donnees) {
      fs.mkdirSync(path.dirname(fichier), { recursive: true });
      const tmp = `${fichier}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(donnees));
      fs.renameSync(tmp, fichier);
    },
  };
}
