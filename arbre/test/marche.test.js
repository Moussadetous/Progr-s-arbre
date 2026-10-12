import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Arbre, Y0 } from '../shared/arbre.js';
import { Sol, RAYON_BOULE } from '../shared/sol.js';
import { Marcheur } from '../shared/marche.js';
import { itineraire, pointsDePassage, suivre, entreeMaison } from './aide-itineraire.js';

const pousser = (n) => { const a = new Arbre(); for (let i = 0; i < n; i++) a.ajouter(); return a; };
const A = pousser(220);
const sol = new Sol(A);

function allerDeMaisonEnMaison(i, j) {
  const mi = A.maisons[i];
  const mj = A.maisons[j];
  const it = itineraire(A, { chemin: mi.chemin, s: mi.s }, { chemin: mj.chemin, s: mj.s });
  assert.ok(it, `pas d'itinéraire ${i} -> ${j}`);
  const ei = entreeMaison(A, mi);
  const ej = entreeMaison(A, mj);
  const pts = [ei.seuil, ...pointsDePassage(A, it.etapes), ej.seuil, ej.centre];
  const r = suivre(sol, ei.centre, pts);
  assert.ok(r.ok, `${i} -> ${j} : ${r.raison} ${JSON.stringify(r.appui)} pos ${r.position && r.position.map((v) => v.toFixed(2))} cible ${r.cible && r.cible.map((v) => v.toFixed(2))}`);
  assert.ok(r.sautMax < 0.3, `saut de ${r.sautMax} m`);
  assert.equal(r.appui.source.type, 'maison');
  assert.equal(r.appui.source.id, j);
  return it;
}

test('la boule est posée dans sa maison, au niveau du plancher', () => {
  const e = entreeMaison(A, A.maisons[0]);
  const m = new Marcheur(sol);
  assert.ok(m.poser(e.centre[0], e.centre[1] + 0.3, e.centre[2]));
  assert.equal(m.appui.source.type, 'maison');
  assert.ok(Math.abs(m.p[1] - (e.centre[1] + RAYON_BOULE)) < 0.05);
});

test('de sa maison à la maison voisine sur la même branche', () => {
  const voisine = A.maisons.findIndex((m, k) => k > 0 && m.chemin === A.maisons[0].chemin);
  allerDeMaisonEnMaison(0, voisine);
});

test('de sa maison à une maison d\'une autre branche, en passant par la capitale', () => {
  const autre = A.maisons.findIndex((m) => A.chemins[m.chemin].type === 'maitresse' && m.chemin !== A.maisons[0].chemin);
  const it = allerDeMaisonEnMaison(0, autre);
  assert.ok(it.etapes.some((e) => e.capitale));
});

test('jusqu\'à une maison sur un rameau, puis sur une brindille', () => {
  for (const type of ['rameau', 'brindille']) {
    const k = A.maisons.findIndex((m) => A.chemins[m.chemin].type === type);
    assert.ok(k > 0, `pas de maison sur un ${type}`);
    allerDeMaisonEnMaison(0, k);
  }
});

test('jusqu\'à une maison en haut, sur une branche d\'étage : on y monte par un pont, sans grimper', () => {
  const etages = A.maisons.map((m, k) => k).filter((k) => A.chemins[A.maisons[k].chemin].type === 'etage');
  assert.ok(etages.length > 0);
  for (const k of [etages[0], etages[etages.length - 1]]) {
    const it = allerDeMaisonEnMaison(0, k);
    assert.ok(it.etapes.some((e) => !e.capitale && A.chemins[e.chemin].type === 'pont'), 'le trajet passe par un pont');
  }
});

test('gravité : on ne peut pas tourner autour d\'une branche, on reste sur le dessus', () => {
  const c = A.chemins[1];
  const p = c.surface(30, 0);
  const m = new Marcheur(sol);
  assert.ok(m.poser(p[0], p[1] + 0.3, p[2]));
  const r = c.repere(30);
  for (let k = 0; k < 400; k++) m.deplacer(r.b[0] * 0.05, r.b[2] * 0.05); // tout droit vers le côté
  assert.equal(m.appui.source.type, 'chemin');
  assert.ok(Math.abs(m.appui.source.w) <= c.demiLargeurMarche(m.appui.source.s) + 1e-6);
  assert.ok(m.p[1] > c.centre(30)[1], 'toujours au-dessus de la branche');
});

test('le tronc est un mur, la capitale un plancher', () => {
  const m = new Marcheur(sol);
  assert.ok(m.poser(3, Y0 + 1, 3));
  assert.equal(m.appui.source.type, 'capitale');
  // marcher vers une colonne : on s'arrête contre elle
  for (let k = 0; k < 600; k++) m.deplacer(Math.cos(1.31) * 0.05, Math.sin(1.31) * 0.05);
  assert.ok(Math.hypot(m.p[0], m.p[2]) < 8.5);
});
