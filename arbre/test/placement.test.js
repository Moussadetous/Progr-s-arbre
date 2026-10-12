import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerSquelette, repereA, pointSurface } from '../shared/squelette.js';
import { placerMaison, placerPlusieurs, distanceMin, RAYON_MIN, premierEmplacement } from '../shared/placement.js';
import { sub, longueur, dot } from '../shared/geometrie.js';

const squelette = creerSquelette();

test('le monde a un tronc et quatre grosses branches courbes', () => {
  assert.equal(squelette.branches.length, 4);
  for (const b of squelette.branches) {
    assert.ok(b.longueur > 38, `branche ${b.id} trop courte : ${b.longueur.toFixed(1)} m`);
    assert.ok(b.frames[0].rayon > 2, 'la base doit être grosse');
    assert.ok(b.frames.at(-1).rayon < 1.2, 'le bout doit être fin');
  }
  // Les repères sont orthonormés
  const f = squelette.branches[1].frames[30];
  assert.ok(Math.abs(longueur(f.tan) - 1) < 1e-6);
  assert.ok(Math.abs(dot(f.tan, f.N)) < 1e-6);
  assert.ok(Math.abs(dot(f.N, f.B)) < 1e-6);
});

test('les branches partent du tronc, dans quatre directions différentes', () => {
  const az = squelette.branches.map((b) => b.azimut);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const ecart = Math.abs(((az[i] - az[j] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(ecart > 1.0, `deux branches trop proches (${ecart.toFixed(2)} rad)`);
  }
  for (const b of squelette.branches) {
    const d = Math.hypot(b.frames[0].pos[0], b.frames[0].pos[2]);
    assert.ok(d < 8, `le départ est à ${d.toFixed(1)} m de l'axe du tronc`);
  }
});

test("le premier habitant est sur la première branche, bien en vue", () => {
  const m = premierEmplacement(squelette);
  assert.equal(m.branche, 0);
  assert.ok(m.normale[1] > 0.5, 'la première maison est sur le dessus');
});

test('chaque maison est posée sur la surface de sa branche', () => {
  const maisons = placerPlusieurs(squelette, 40);
  for (const m of maisons) {
    const r = repereA(squelette.branches[m.branche], m.t);
    const surface = pointSurface(r, m.theta).pos;
    // elle est enfoncée de 10 cm dans l'écorce
    const d = longueur(sub(m.pos, surface));
    assert.ok(Math.abs(d - 0.1) < 1e-6, `décalage ${d}`);
  }
});

test('deux maisons ne se touchent jamais (jusqu\'à ce que les branches soient pleines)', () => {
  const maisons = placerPlusieurs(squelette, 200);
  assert.ok(maisons.length >= 28, `capacité trop faible : ${maisons.length}`);
  for (let i = 0; i < maisons.length; i++) {
    for (let j = i + 1; j < maisons.length; j++) {
      const d = longueur(sub(maisons[i].pos, maisons[j].pos));
      assert.ok(d >= distanceMin(maisons[i], maisons[j]) - 1e-9, `maisons ${i} et ${j} à ${d.toFixed(2)} m`);
    }
  }
});

test('aucune maison dessous une branche, ni sur une branche trop fine', () => {
  for (const m of placerPlusieurs(squelette, 120)) {
    assert.ok(m.normale[1] >= -0.1, `maison ${m.id} sous la branche`);
    assert.ok(m.rayonBranche >= RAYON_MIN);
  }
});

test('la charge est répartie entre les quatre branches', () => {
  const maisons = placerPlusieurs(squelette, 24);
  const compte = [0, 0, 0, 0];
  for (const m of maisons) compte[m.branche]++;
  const max = Math.max(...compte);
  const min = Math.min(...compte);
  assert.ok(min >= 4, `une branche est presque vide : ${compte}`);
  assert.ok(max - min <= 3, `charge déséquilibrée : ${compte}`);
});

test('la porte regarde le côté et reste perpendiculaire à la normale', () => {
  for (const m of placerPlusieurs(squelette, 50)) {
    assert.ok(Math.abs(dot(m.front, m.normale)) < 1e-6);
    assert.ok(Math.abs(longueur(m.front) - 1) < 1e-6);
  }
});

test('le placement est déterministe', () => {
  const a = placerPlusieurs(squelette, 30);
  const b = placerPlusieurs(squelette, 30);
  assert.deepEqual(a.map((m) => [m.branche, m.t.toFixed(6), m.theta.toFixed(6)]), b.map((m) => [m.branche, m.t.toFixed(6), m.theta.toFixed(6)]));
});

test('quand les branches sont pleines, le placement le dit (l\'arbre doit pousser)', () => {
  const maisons = placerPlusieurs(squelette, 400);
  assert.ok(maisons.length < 400);
  assert.equal(placerMaison(squelette, maisons, maisons.length), null);
});
