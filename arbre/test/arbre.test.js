import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererArbre } from '../shared/arbre.js';
import { nbVisibles, facteurEpaisseur, calculerPoids } from '../shared/regles.js';
import { placerFeuille, longueur, dot, cross } from '../shared/geometrie.js';

const arbre = genererArbre();

test("l'arbre est déterministe : même graine, même forme", () => {
  const b = genererArbre();
  assert.equal(b.N, arbre.N);
  assert.deepEqual(b.noeuds[1234].pos, arbre.noeuds[1234].pos);
});

test("l'arbre est gigantesque : plus de 100 m de haut et des milliers de nœuds", () => {
  assert.ok(arbre.N > 5000, `seulement ${arbre.N} nœuds`);
  const hauteur = Math.max(...arbre.noeuds.map((n) => n.pos[1]));
  assert.ok(hauteur > 150, `hauteur ${hauteur.toFixed(0)} m`);
});

test('le tronc pousse en premier et la capitale est son sommet', () => {
  const cap = arbre.noeuds[arbre.capitale];
  assert.equal(cap.capitale, true);
  assert.equal(cap.profondeur, 0);
  assert.ok(cap.pos[1] > 150);
});

test("les rangs sont une permutation et un parent apparaît toujours avant ses enfants", () => {
  assert.equal(new Set(arbre.parRang).size, arbre.N);
  for (let r = 0; r < arbre.N; r++) assert.equal(arbre.noeuds[arbre.parRang[r]].rang, r);
  for (const n of arbre.noeuds) {
    if (n.parent >= 0) assert.ok(arbre.noeuds[n.parent].rang < n.rang);
  }
});

test('les candidats aux feuilles sont triés par rang et sont des rameaux', () => {
  for (let i = 1; i < arbre.candidats.length; i++) {
    assert.ok(arbre.noeuds[arbre.candidats[i - 1]].rang < arbre.noeuds[arbre.candidats[i]].rang);
  }
  for (const id of arbre.candidats) assert.ok(arbre.noeuds[id].profondeur >= 2);
});

test('la croissance : plus de monde, plus de nœuds poussés, sans dépasser le total', () => {
  assert.equal(nbVisibles(0, arbre), arbre.k0);
  assert.ok(nbVisibles(100, arbre) > nbVisibles(10, arbre));
  assert.equal(nbVisibles(1e9, arbre), arbre.N);
});

test("l'épaisseur gonfle avec le poids, sans dépasser x2,5", () => {
  assert.equal(facteurEpaisseur(0), 1);
  assert.ok(facteurEpaisseur(9) > facteurEpaisseur(1));
  assert.ok(facteurEpaisseur(1e12) <= 2.5);
});

test('le poids remonte vers le tronc', () => {
  const noeuds = [{ parent: -1 }, { parent: 0 }, { parent: 1 }];
  assert.deepEqual(calculerPoids(noeuds, [0, 1, 2]), [3, 3, 2]);
});

test('une feuille est un repère orthonormé posé sur son rameau', () => {
  const id = arbre.candidats[500];
  const g = placerFeuille(arbre, id, 2);
  assert.ok(Math.abs(longueur(g.dir) - 1) < 1e-9);
  assert.ok(Math.abs(longueur(g.side) - 1) < 1e-9);
  assert.ok(Math.abs(dot(g.dir, g.side)) < 1e-9);
  assert.ok(Math.abs(dot(g.normal, g.dir)) < 1e-9);
  const z = cross(g.side, g.dir);
  assert.ok(Math.abs(z[0] - g.normal[0]) + Math.abs(z[1] - g.normal[1]) + Math.abs(z[2] - g.normal[2]) < 1e-9);
  // La base est à quelques décimètres du nœud
  const p = arbre.noeuds[id].pos;
  assert.ok(longueur([g.base[0] - p[0], g.base[1] - p[1], g.base[2] - p[2]]) < 1);
});
