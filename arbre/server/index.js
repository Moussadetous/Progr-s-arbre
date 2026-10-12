// Serveur de l'Arbre : API HTTP, temps réel (SSE), vidéos et fichiers du client.
// Zéro dépendance : uniquement les modules intégrés de Node.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline, Transform } from 'node:stream';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Monde, Erreur, MIMES_VIDEO } from './monde.js';

const pipelinePromis = promisify(pipeline);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const ARBRE = path.resolve(ICI, '..');
const DEPOT = path.resolve(ARBRE, '..'); // three.js est vendorisé à la racine du dépôt
const DONNEES = process.env.ARBRE_DONNEES || path.join(ARBRE, 'data');
const PORT = Number(process.env.PORT) || 3000;
const TAILLE_MAX_VIDEO = 150 * 1024 * 1024;

const MEDIAS = path.join(DONNEES, 'medias');
fs.mkdirSync(MEDIAS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};
const DOSSIERS_STATIQUES = {
  '/client/': path.join(ARBRE, 'client'),
  '/shared/': path.join(ARBRE, 'shared'),
  '/vendor/': path.join(DEPOT, 'vendor'),
};

const clients = new Set(); // connexions temps réel ouvertes

function diffuser(type, donnees) {
  const trame = `event: ${type}\ndata: ${JSON.stringify(donnees)}\n\n`;
  for (const res of clients) res.write(trame);
}

const monde = new Monde({ fichier: path.join(DONNEES, 'monde.json'), surChangement: diffuser });

// ---------- utilitaires HTTP ----------

function envoyerJson(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corps));
}

function lireJson(req, max = 10_000) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let taille = 0;
    req.on('data', (m) => {
      taille += m.length;
      if (taille > max) {
        reject(new Erreur(413, 'Requête trop grosse'));
        req.destroy();
      } else {
        morceaux.push(m);
      }
    });
    req.on('end', () => {
      try {
        resolve(morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString('utf8')) : {});
      } catch {
        reject(new Erreur(400, 'JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function decoder(valeur) {
  try {
    return decodeURIComponent(valeur || '');
  } catch {
    return '';
  }
}

function authentifier(req) {
  const jeton = (req.headers.authorization || '').replace(/^Bearer /, '');
  const utilisateur = monde.utilisateurParToken(jeton);
  if (!utilisateur) throw new Erreur(401, 'Connexion requise');
  return utilisateur;
}

// Ce qui peut être montré aux autres : jamais le jeton
const publicUtilisateur = (u) => ({ id: u.id, pseudo: u.pseudo, teinte: u.teinte });

// Flux temps réel : le serveur pousse chaque changement, le navigateur se met à jour seul
function flux(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const battement = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(battement);
    clients.delete(res);
  });
}

// ---------- vidéos ----------

// Coupe l'envoi si la vidéo dépasse la taille permise
function limiteur(max) {
  let total = 0;
  return new Transform({
    transform(morceau, _encodage, cb) {
      total += morceau.length;
      if (total > max) return cb(new Erreur(413, 'Vidéo trop lourde (150 Mo maximum)'));
      cb(null, morceau);
    },
  });
}

async function publier(req, res) {
  const auteur = authentifier(req);
  const titre = decoder(req.headers['x-titre']).trim();
  const description = decoder(req.headers['x-description']).trim();
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = MIMES_VIDEO[type];
  monde.verifierVideo({ titre, description, ext });

  const id = crypto.randomUUID();
  const fichier = path.join(MEDIAS, `${id}.${ext}`);
  try {
    await pipelinePromis(req, limiteur(TAILLE_MAX_VIDEO), fs.createWriteStream(fichier));
  } catch (e) {
    fs.rm(fichier, { force: true }, () => {});
    throw e instanceof Erreur ? e : new Erreur(400, 'Envoi interrompu');
  }
  const video = monde.ajouterVideo({ id, auteur, titre, description, ext, taille: fs.statSync(fichier).size });
  envoyerJson(res, 201, video);
}

// Lecture avec "Range" : indispensable pour que la vidéo se place et se déplace
function servirMedia(req, res, nom) {
  if (!/^[0-9a-f-]{36}\.(mp4|webm|mov|ogv)$/.test(nom)) throw new Erreur(404, 'Introuvable');
  const fichier = path.join(MEDIAS, nom);
  const stat = fs.statSync(fichier, { throwIfNoEntry: false });
  if (!stat) throw new Erreur(404, 'Introuvable');

  const extension = path.extname(nom).slice(1);
  const type = Object.keys(MIMES_VIDEO).find((m) => MIMES_VIDEO[m] === extension);
  const taille = stat.size;
  const entetes = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };

  const plage = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!plage) {
    res.writeHead(200, { ...entetes, 'Content-Length': taille });
    fs.createReadStream(fichier).pipe(res);
    return;
  }
  if (plage[1] === '' && plage[2] === '') {
    res.writeHead(416, { 'Content-Range': `bytes */${taille}` });
    res.end();
    return;
  }
  let debut;
  let fin;
  if (plage[1] === '') {
    debut = Math.max(0, taille - Number(plage[2]));
    fin = taille - 1;
  } else {
    debut = Number(plage[1]);
    fin = plage[2] === '' ? taille - 1 : Math.min(Number(plage[2]), taille - 1);
  }
  if (debut > fin || debut >= taille) {
    res.writeHead(416, { 'Content-Range': `bytes */${taille}` });
    res.end();
    return;
  }
  res.writeHead(206, { ...entetes, 'Content-Range': `bytes ${debut}-${fin}/${taille}`, 'Content-Length': fin - debut + 1 });
  fs.createReadStream(fichier, { start: debut, end: fin }).pipe(res);
}

// ---------- routes ----------

async function api(req, res, url) {
  const chemin = url.pathname;

  if (req.method === 'POST' && chemin === '/api/connexion') {
    const { pseudo, token } = await lireJson(req);
    const r = monde.entrer(pseudo, token);
    return envoyerJson(res, r.nouveau ? 201 : 200, {
      token: r.utilisateur.token,
      utilisateur: publicUtilisateur(r.utilisateur),
      feuille: r.feuille,
      nouveau: r.nouveau,
    });
  }
  if (req.method === 'GET' && chemin === '/api/moi') {
    return envoyerJson(res, 200, publicUtilisateur(authentifier(req)));
  }
  if (req.method === 'GET' && chemin === '/api/monde') {
    return envoyerJson(res, 200, monde.instantane());
  }
  if (req.method === 'GET' && chemin === '/api/evenements') {
    return flux(req, res);
  }
  if (req.method === 'GET' && chemin === '/api/videos') {
    return envoyerJson(res, 200, monde.listerVideos());
  }
  if (req.method === 'POST' && chemin === '/api/videos') {
    return publier(req, res);
  }
  if (req.method === 'GET' && chemin.startsWith('/medias/')) {
    return servirMedia(req, res, chemin.slice('/medias/'.length));
  }
  throw new Erreur(404, 'Introuvable');
}

// Fichiers du client, de shared/ et de vendor/ (pas de répertoire parent accessible)
function servirStatique(res, chemin) {
  const demande = chemin === '/' ? '/client/index.html' : chemin;
  const prefixe = Object.keys(DOSSIERS_STATIQUES).find((p) => demande.startsWith(p));
  if (!prefixe) return false;
  const dossier = DOSSIERS_STATIQUES[prefixe];
  const fichier = path.normalize(path.join(dossier, demande.slice(prefixe.length)));
  if (!fichier.startsWith(dossier + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) {
    envoyerJson(res, 404, { erreur: 'Introuvable' });
    return true;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(fichier).pipe(res);
  return true;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/medias/')) {
        await api(req, res, url);
      } else if (!servirStatique(res, url.pathname)) {
        envoyerJson(res, 404, { erreur: 'Introuvable' });
      }
    } catch (e) {
      if (e instanceof Erreur) {
        if (!res.headersSent) envoyerJson(res, e.statut, { erreur: e.message });
        else res.end();
      } else {
        console.error(e);
        if (!res.headersSent) envoyerJson(res, 500, { erreur: 'Erreur interne' });
      }
    }
  })
  .listen(PORT, () => {
    console.log(`🌳 L'Arbre écoute sur http://localhost:${PORT}`);
  });
