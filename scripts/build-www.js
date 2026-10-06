// Copie les fichiers du jeu dans www/ (pour Capacitor / APK).
// Équivalent portable de rsync, sans dépendance.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'www');
const EXCLUDE = new Set([
  '.git', '.github', 'node_modules', 'www', 'android', 'ios',
  'README.md', 'LICENSE', '.gitignore', 'package.json',
  'package-lock.json', 'capacitor.config.json', 'scripts', '.DS_Store',
]);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

let count = 0;
function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
}
copyDir(ROOT, DEST);
console.log(`www/ prêt : ${count} fichiers copiés.`);
