import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Monde, construireGraphe, plusCourtChemin, repereFeuille, pointFeuille, localVersMonde, PAS, LONGUEUR_MAX,
  longueurBranche, FEUILLE_DEMI_LARGEUR, BRANCHES_DEFAUT, RAYON_TRONC, longueurChemin, surfaceBranche,
} from '../shared/monde-arbre.js';
import { distance } from '../shared/geometrie.js';

const remplir = (n) => { const m = new Monde(); for (let i = 0; i < n; i++) m.ajouter(); return m; };

test('quatre branches par défaut, une seule feuille pour le premier utilisateur', () => {
  const m = remplir(1);
  assert.equal(m.branches.length, BRANCHES_DEFAUT);
  assert.equal(m.feuilles.length, 1);
  assert.deepEqual(m.branches.map((b) => b.n), [1, 0, 0, 0]);
});

test('les feuilles sont réparties sur les branches existantes, la plus chargée jamais plus de 1 d\'écart', () => {
  const m = remplir(22);
  const n = m.branches.map((b) => b.n);
  assert.ok(Math.max(...n) - Math.min(...n) <= 1, `${n}`);
  assert.equal(m.branches.length, 4);
});

test('l\'emplacement d\'une personne ne change jamais quand d\'autres arrivent', () => {
  const a = remplir(30);
  const b = remplir(80);
  for (let i = 0; i < 30; i++) assert.deepEqual(a.feuilles[i], b.feuilles[i]);
});

test('une branche s\'allonge avec ses feuilles, jamais au-delà du maximum', () => {
  assert.ok(longueurBranche(10) > longueurBranche(2));
  assert.ok(longueurBranche(999) <= LONGUEUR_MAX);
});

test('quand les 4 branches sont pleines, une cinquième pousse sur le tronc', () => {
  const m = new Monde();
  const cap = m.capacite();
  let poussees = 0;
  for (let i = 0; i < cap * 4 + 3; i++) if (m.ajouter().nouvelleBranche) poussees++;
  assert.equal(poussees, 1);
  assert.equal(m.branches.length, 5);
  assert.ok(m.hauteurTronc() >= 36);
  assert.ok(m.branches.every((b) => b.n <= cap));
});

test('les feuilles d\'une même branche ne se chevauchent pas', () => {
  const m = remplir(100);
  for (const b of m.branches) {
    const fs = m.feuilles.filter((f) => f.branche === b.id);
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        if (fs[i].cote !== fs[j].cote) continue;
        assert.ok(Math.abs(fs[i].s - fs[j].s) >= 2 * FEUILLE_DEMI_LARGEUR * 1.06 + 0.2);
      }
    }
  }
});

test('les feuilles sortent du côté de la branche, pas en dessous, et loin du tronc', () => {
  const m = remplir(40);
  for (const f of m.feuilles) {
    const r = m.repereDe(f);
    assert.ok(r.y[1] > 0.9, 'feuille presque à plat');
    const centre = localVersMonde(r, pointFeuille(0, 0.5));
    assert.ok(Math.hypot(centre[0], centre[2]) > RAYON_TRONC + 4);
  }
});

test('la feuille est du côté annoncé de la branche', () => {
  const m = remplir(8);
  for (const f of m.feuilles) {
    const b = m.branches[f.branche];
    const s = surfaceBranche(f.branche, b.n, f.s, 0);
    const r = m.repereDe(f);
    const centre = localVersMonde(r, pointFeuille(0, 0.5));
    const lateral = (centre[0] - s.pos[0]) * s.repere.B[0] + (centre[1] - s.pos[1]) * s.repere.B[1] + (centre[2] - s.pos[2]) * s.repere.B[2];
    assert.ok(lateral * f.cote > 2, `${f.indice} ${lateral}`);
  }
});

test('on peut aller de n\'importe quelle feuille à n\'importe quelle autre, et à la capitale', () => {
  const m = remplir(60);
  const g = construireGraphe(m);
  for (const [a, b] of [[0, 59], [5, 40], [59, 1]]) {
    const c = plusCourtChemin(g, `f${a}`, `f${b}`);
    assert.ok(c, `${a}->${b}`);
    assert.ok(c.points.length > 5);
  }
  assert.ok(plusCourtChemin(g, 'f0', 'capitale'));
  assert.ok(plusCourtChemin(g, 'capitale', `f${m.feuilles.length - 1}`));
});

test('un chemin est continu : pas de saut de plus de 3 m', () => {
  const m = remplir(60);
  const g = construireGraphe(m);
  const c = plusCourtChemin(g, 'f0', 'f59');
  for (let i = 1; i < c.points.length; i++) assert.ok(distance(c.points[i], c.points[i - 1]) < 3.1, `saut ${i}: ${distance(c.points[i], c.points[i - 1])}`);
  assert.ok(Math.abs(longueurChemin(c.points) - c.cout) < 1e-6);
});

test('le chemin entre deux branches passe par la place de la capitale', () => {
  const m = remplir(8);
  const g = construireGraphe(m);
  const c = plusCourtChemin(g, 'f0', 'f1'); // branches 0 et 1
  assert.ok(c.noeuds.some((n) => /^p\d$/.test(n)));
});
