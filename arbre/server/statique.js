// Serveur de fichiers statiques minimal : sert le jeu (aucune dépendance, aucun serveur de données pour l'instant).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MIMES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
};
const PUBLIC = ['/index.html', '/css/', '/js/', '/shared/', '/vendor/', '/docs/'];

http.createServer((req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  const fichier = path.join(RACINE, url);
  if (!fichier.startsWith(RACINE) || !PUBLIC.some((p) => url === p || url.startsWith(p))) { res.writeHead(404).end('introuvable'); return; }
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404).end('introuvable'); return; }
    res.writeHead(200, { 'Content-Type': MIMES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`🌳 L'Arbre : http://localhost:${PORT}`));
