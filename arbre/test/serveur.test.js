import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creerServeur } from '../server/serveur.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let serveur;
let base;
let donnees;

before(async () => {
  donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'arbre-serveur-'));
  ({ serveur } = creerServeur({ racine: RACINE, donnees }));
  await new Promise((res) => serveur.listen(0, '127.0.0.1', res));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.closeAllConnections?.();
  serveur.close();
  fs.rmSync(donnees, { recursive: true, force: true });
});

const json = async (r) => ({ statut: r.status, corps: await r.json() });
const connecter = (pseudo, token) => fetch(`${base}/api/connexion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pseudo, token }),
}).then(json);

test('la page et les modules du client sont servis', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="scene"/);
  assert.equal((await fetch(`${base}/js/main.js`)).status, 200);
  assert.equal((await fetch(`${base}/shared/arbre.js`)).status, 200);
  assert.equal((await fetch(`${base}/vendor/three.module.js`)).status, 200);
});

test('le code du serveur, les données et les chemins sortants ne sont jamais publics', async () => {
  assert.equal((await fetch(`${base}/server/serveur.js`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/js/../server/serveur.js`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/server/serveur.js`)).status, 404);
});

test("l'instantané du monde contient l'arbre et les feuilles", async () => {
  const { statut, corps } = await json(await fetch(`${base}/api/monde`));
  assert.equal(statut, 200);
  assert.equal(corps.noeudsTotal > 5000, true);
  assert.equal(Array.isArray(corps.feuilles), true);
  assert.equal(corps.poids.length, corps.noeudsTotal);
});

test('une connexion crée une feuille ; le jeton permet de la reprendre', async () => {
  const nouveau = await connecter('Léa Test');
  assert.equal(nouveau.statut, 201);
  assert.equal(nouveau.corps.nouveau, true);
  assert.equal(nouveau.corps.utilisateur.pseudo, 'Léa Test');
  assert.equal('token' in nouveau.corps.utilisateur, false, 'le jeton ne doit pas être montré aux autres');

  const moi = await fetch(`${base}/api/moi`, { headers: { Authorization: `Bearer ${nouveau.corps.token}` } });
  assert.equal((await json(moi)).corps.pseudo, 'Léa Test');

  const reprise = await connecter('léa test', nouveau.corps.token);
  assert.equal(reprise.statut, 200);
  assert.equal(reprise.corps.feuille.id, nouveau.corps.feuille.id);

  const sansJeton = await connecter('léa test');
  assert.equal(sansJeton.statut, 409);
});

test('sans jeton valide, pas de publication', async () => {
  const r = await fetch(`${base}/api/videos`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: 'x' });
  assert.equal(r.status, 401);
});

test('une vidéo se publie, se liste et se lit par tranches (Range)', async () => {
  const { corps: { token } } = await connecter('Vidéaste');
  const octets = Buffer.alloc(5000, 7);
  const envoi = await fetch(`${base}/api/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'video/webm',
      'X-Titre': encodeURIComponent('Ma vidéo'),
      'X-Description': encodeURIComponent('Un test'),
    },
    body: octets,
  });
  const video = (await json(envoi)).corps;
  assert.equal(envoi.status, 201);
  assert.equal(video.titre, 'Ma vidéo');

  const liste = (await json(await fetch(`${base}/api/videos`))).corps;
  assert.equal(liste[0].id, video.id);

  const lecture = await fetch(`${base}/medias/${video.id}.webm`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(lecture.status, 206);
  assert.equal(lecture.headers.get('content-range'), 'bytes 0-99/5000');
  assert.equal((await lecture.arrayBuffer()).byteLength, 100);
});

test('un format non vidéo et un titre vide sont refusés', async () => {
  const { corps: { token } } = await connecter('Refusé');
  const mauvais = await fetch(`${base}/api/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain', 'X-Titre': 'x' },
    body: 'abc',
  });
  assert.equal(mauvais.status, 415);
  const sansTitre = await fetch(`${base}/api/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'X-Titre': '' },
    body: 'abc',
  });
  assert.equal(sansTitre.status, 400);
});

test('le flux temps réel annonce une nouvelle feuille', async () => {
  const flux = await fetch(`${base}/api/evenements`);
  const lecteur = flux.body.getReader();
  const decodeur = new TextDecoder();
  const arrivee = connecter('Arrivée en direct');
  let texte = '';
  while (!texte.includes('event: feuille')) {
    const { value, done } = await lecteur.read();
    if (done) break;
    texte += decodeur.decode(value);
  }
  await arrivee;
  await lecteur.cancel();
  assert.match(texte, /event: monde/);
  assert.match(texte, /Arrivée en direct/);
});
