import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { genererArbre } from '../shared/treegen.js';
import { nbBranchesVisibles, facteurEpaisseur, calculerPoids } from '../shared/regles.js';
import { Monde } from '../server/monde.js';

test("l'arbre est déterministe : même graine, même forme", () => {
  const a = genererArbre();
  const b = genererArbre();
  assert.equal(a.noeuds.length, b.noeuds.length);
  assert.deepEqual(a.noeuds[10].pos, b.noeuds[10].pos);
  assert.ok(a.noeuds.length > 100, `arbre trop petit : ${a.noeuds.length} nœuds`);
});

test('le tronc pousse en premier et la capitale est son sommet', () => {
  const arbre = genererArbre();
  assert.equal(arbre.noeuds[arbre.capitale].genre, 'tronc');
  assert.equal(arbre.noeuds[arbre.capitale].capitale, true);
  // Un parent apparaît toujours avant ses enfants
  for (const n of arbre.noeuds) {
    if (n.parent >= 0) assert.ok(arbre.noeuds[n.parent].ordre < n.ordre);
  }
});

test("la croissance : plus d'utilisateurs, plus de rameaux visibles, sans dépasser le total", () => {
  assert.ok(nbBranchesVisibles(1, 250) > nbBranchesVisibles(0, 250));
  assert.ok(nbBranchesVisibles(100, 250) > nbBranchesVisibles(10, 250));
  assert.equal(nbBranchesVisibles(1e9, 250), 250);
});

test('le poids remonte vers le tronc et les branches gonflent avec lui', () => {
  const noeuds = [{ parent: -1 }, { parent: 0 }, { parent: 1 }];
  assert.deepEqual(calculerPoids(noeuds, [0, 1, 2]), [3, 3, 2]);
  assert.ok(facteurEpaisseur(9) > facteurEpaisseur(1));
  assert.ok(facteurEpaisseur(1e9) <= 4);
});

test("une nouvelle personne obtient une feuille sur une branche déjà visible", () => {
  const monde = new Monde();
  const { feuille, nouveau } = monde.entrer('Léa');
  assert.equal(nouveau, true);
  const noeud = monde.arbre.noeuds[feuille.noeud];
  assert.equal(noeud.genre, 'branche');
  assert.ok(noeud.ordre < monde.noeudsVisibles());
});

test("les feuilles se répartissent sur les branches au lieu de s'entasser", () => {
  const monde = new Monde();
  for (let i = 0; i < 30; i++) monde.entrer(`Personne ${i}`);
  const branchesUtilisees = new Set(monde.feuilles.map((f) => f.noeud));
  assert.ok(branchesUtilisees.size >= 25, `seulement ${branchesUtilisees.size} branches utilisées`);
});

test('un pseudo déjà pris exige le jeton du navigateur qui l\'a créé', () => {
  const monde = new Monde();
  const { utilisateur } = monde.entrer('Tom');
  assert.throws(() => monde.entrer('tom'), (e) => e.statut === 409);
  const reprise = monde.entrer('TOM', utilisateur.token);
  assert.equal(reprise.nouveau, false);
  assert.equal(monde.utilisateurs.length, 1);
});

test('un pseudo invalide est refusé', () => {
  const monde = new Monde();
  assert.throws(() => monde.entrer('a'), (e) => e.statut === 400);
  assert.throws(() => monde.entrer('<script>'), (e) => e.statut === 400);
});

test('le poids du tronc vaut le nombre de feuilles (toutes sont sur ses branches)', () => {
  const monde = new Monde();
  for (let i = 0; i < 12; i++) monde.entrer(`Ami ${i}`);
  assert.equal(monde.poids()[0], 12);
});

test('le monde survit à un redémarrage du serveur', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'arbre-test-'));
  try {
    const fichier = path.join(dossier, 'monde.json');
    const avant = new Monde({ fichier });
    const { utilisateur } = avant.entrer('Sami');
    const apres = new Monde({ fichier });
    assert.equal(apres.utilisateurs.length, 1);
    assert.equal(apres.feuilleDe(utilisateur.id).pseudo, 'Sami');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
