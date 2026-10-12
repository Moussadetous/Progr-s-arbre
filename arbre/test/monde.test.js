import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererArbre } from '../shared/arbre.js';
import { Monde } from '../shared/monde.js';

const arbre = genererArbre();

// Stockage en mémoire : le même contrat que le fichier JSON et que le localStorage
function stockageMemoire(initial = null) {
  let contenu = initial;
  return {
    lire: () => (contenu ? JSON.parse(JSON.stringify(contenu)) : null),
    ecrire: (d) => { contenu = JSON.parse(JSON.stringify(d)); },
  };
}

test('une nouvelle personne obtient une feuille sur un rameau déjà poussé', () => {
  const monde = new Monde({ arbre });
  const { feuille, nouveau } = monde.entrer('Léa');
  assert.equal(nouveau, true);
  assert.ok(arbre.noeuds[feuille.noeud].rang < monde.noeudsVisibles());
  assert.equal(arbre.noeuds[feuille.noeud].profondeur >= 2, true);
});

test("les feuilles se répartissent sur les rameaux au lieu de s'entasser", () => {
  const monde = new Monde({ arbre });
  for (let i = 0; i < 60; i++) monde.entrer(`Personne ${i}`);
  const utilisees = new Set(monde.feuilles.map((f) => f.noeud));
  assert.equal(utilisees.size, 60);
});

test('un pseudo déjà pris exige le jeton du navigateur qui l\'a créé', () => {
  const monde = new Monde({ arbre });
  const { utilisateur } = monde.entrer('Tom');
  assert.throws(() => monde.entrer('tom'), (e) => e.statut === 409);
  const reprise = monde.entrer('TOM', utilisateur.token);
  assert.equal(reprise.nouveau, false);
  assert.equal(monde.utilisateurs.length, 1);
});

test('un pseudo invalide est refusé', () => {
  const monde = new Monde({ arbre });
  assert.throws(() => monde.entrer('a'), (e) => e.statut === 400);
  assert.throws(() => monde.entrer('<script>'), (e) => e.statut === 400);
});

test('le poids du tronc vaut le nombre de feuilles (toutes sont sur l\'arbre)', () => {
  const monde = new Monde({ arbre });
  for (let i = 0; i < 12; i++) monde.entrer(`Ami ${i}`);
  assert.equal(monde.poids()[0], 12);
});

test('les notifications annoncent le monde puis la feuille', () => {
  const messages = [];
  const monde = new Monde({ arbre, surChangement: (type) => messages.push(type) });
  monde.entrer('Zoé');
  assert.deepEqual(messages, ['monde', 'feuille']);
});

test('le monde survit à un redémarrage (stockage)', () => {
  const stockage = stockageMemoire();
  const avant = new Monde({ arbre, stockage });
  const { utilisateur, feuille } = avant.entrer('Sami');
  const apres = new Monde({ arbre, stockage });
  assert.equal(apres.utilisateurs.length, 1);
  assert.equal(apres.feuilleDe(utilisateur.id).pseudo, 'Sami');
  assert.equal(apres.feuilleDe(utilisateur.id).noeud, feuille.noeud);
  // La charge des rameaux est reconstruite : la prochaine feuille ne tombe pas au même endroit
  const suivant = apres.entrer('Nora').feuille;
  assert.notEqual(suivant.noeud, feuille.noeud);
});

test('une vidéo est publique et remonte à la capitale (tête de liste)', () => {
  const monde = new Monde({ arbre });
  const { utilisateur } = monde.entrer('Max');
  monde.ajouterVideo({ id: 'v1', auteur: utilisateur, titre: 'Ma vidéo', description: '', ext: 'mp4', taille: 10 });
  monde.ajouterVideo({ id: 'v2', auteur: utilisateur, titre: 'La suivante', description: '', ext: 'mp4', taille: 10 });
  assert.equal(monde.listerVideos()[0].titre, 'La suivante');
  assert.throws(() => monde.verifierVideo({ titre: 'x', description: '', ext: undefined }), (e) => e.statut === 415);
});
