import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Monde, repereFeuille, pointFeuille, localVersMonde, LONGUEUR_MAX, longueurBranche, FEUILLE_DEMI_LARGEUR,
  BRANCHES_DEFAUT, RAYON_TRONC, surfaceBranche, RAYON_BOULE,
} from '../shared/monde-arbre.js';
import { Marcheur } from '../shared/marche.js';
import { distance, mulberry32, longueur, normer, dot } from '../shared/geometrie.js';

const remplir = (n) => { const m = new Monde(); for (let i = 0; i < n; i++) m.ajouter(); return m; };

test('quatre branches par défaut, une seule feuille pour le premier utilisateur', () => {
  const m = remplir(1);
  assert.equal(m.branches.length, BRANCHES_DEFAUT);
  assert.deepEqual(m.branches.map((b) => b.n), [1, 0, 0, 0]);
});

test('les feuilles se répartissent : jamais plus d\'une feuille d\'écart entre les 4 premières branches', () => {
  const n = remplir(22).branches.map((b) => b.n);
  assert.ok(Math.max(...n) - Math.min(...n) <= 1, `${n}`);
});

test('l\'emplacement d\'une personne ne change jamais quand d\'autres arrivent', () => {
  const a = remplir(30);
  const b = remplir(80);
  for (let i = 0; i < 30; i++) assert.deepEqual(a.feuilles[i], b.feuilles[i]);
});

test('une branche s\'allonge avec ses feuilles, jamais au-delà du maximum', () => {
  assert.ok(longueurBranche(12) > longueurBranche(2));
  assert.ok(longueurBranche(999) <= LONGUEUR_MAX);
});

test('quand les 4 branches sont pleines, une cinquième pousse sur le tronc', () => {
  const m = new Monde();
  let poussees = 0;
  for (let i = 0; i < m.capacite() * 4 + 3; i++) if (m.ajouter().nouvelleBranche) poussees++;
  assert.equal(poussees, 1);
  assert.equal(m.branches.length, 5);
  assert.ok(m.branches.every((b) => b.n <= m.capacite()));
});

test('les feuilles d\'une même branche et d\'un même côté ne se chevauchent pas', () => {
  const m = remplir(100);
  for (const b of m.branches) {
    const fs = m.feuilles.filter((f) => f.branche === b.id);
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        if (fs[i].cote !== fs[j].cote) continue;
        assert.ok(Math.abs(fs[i].s - fs[j].s) >= 2 * FEUILLE_DEMI_LARGEUR * 1.1 + 0.6);
      }
    }
  }
});

test('les feuilles sortent du bon côté, à peu près à plat et loin du tronc', () => {
  const m = remplir(40);
  for (const f of m.feuilles) {
    const r = m.repereDe(f);
    assert.ok(r.y[1] > 0.85, `feuille ${f.indice} penchée : ${r.y[1]}`);
    const centre = localVersMonde(r, pointFeuille(0, 0.5));
    assert.ok(Math.hypot(centre[0], centre[2]) > RAYON_TRONC + 4);
    const b = m.branches[f.branche];
    const s = surfaceBranche(f.branche, b.n, f.s, 0);
    const lateral = (centre[0] - s.pos[0]) * s.repere.B[0] + (centre[1] - s.pos[1]) * s.repere.B[1] + (centre[2] - s.pos[2]) * s.repere.B[2];
    assert.ok(lateral * f.cote > 2);
  }
});

test('les feuilles ne sont pas toutes identiques : tailles et caps varient', () => {
  const m = remplir(20);
  const reps = m.feuilles.map((f) => m.repereDe(f));
  const tailles = new Set(reps.map((r) => r.ez.toFixed(2)));
  assert.ok(tailles.size > 10);
});

// ---------- la marche ----------
function marche(m, pas, graine = 1, dist = 0.6, ambiance = {}) {
  const w = new Marcheur(m);
  const hasard = mulberry32(graine);
  const lieux = new Set();
  let dir = [hasard() - 0.5, hasard() - 0.5, hasard() - 0.5];
  let maxSaut = 0;
  let precedent = w.position();
  for (let i = 0; i < pas; i++) {
    if (i % 25 === 0) dir = [hasard() - 0.5, hasard() - 0.5, hasard() - 0.5];
    const nrm = w.normale();
    // la direction demandée est projetée sur la surface par le marcheur lui-même
    w.deplacer([dir[0] * dist, dir[1] * dist, dir[2] * dist]);
    lieux.add(w.etat.type);
    const p = w.position();
    for (const v of p) assert.ok(Number.isFinite(v), `NaN à l'étape ${i} ${JSON.stringify(w.etat)}`);
    maxSaut = Math.max(maxSaut, distance(p, precedent));
    precedent = p;
    assert.ok(Math.abs(longueur(nrm) - 1) < 1e-6);
  }
  return { w, lieux, maxSaut };
}

test('marche au hasard : la boule reste sur l\'arbre, sans valeur absurde, sans grand saut', () => {
  const m = remplir(60);
  for (const graine of [1, 2, 3, 4, 5, 6]) {
    const { maxSaut } = marche(m, 3000, graine);
    assert.ok(maxSaut < 2.5, `saut de ${maxSaut} m (graine ${graine})`);
  }
});

test('la boule peut passer d\'une feuille à la branche, au tronc, à la capitale', () => {
  const m = remplir(60);
  const vus = new Set();
  for (const graine of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) for (const t of marche(m, 4000, graine, 0.5).lieux) vus.add(t);
  assert.ok(vus.has('branche') && vus.has('feuille'), [...vus].join());
});

test('depuis la feuille, marcher vers l\'épaule mène sur la branche, et inversement', () => {
  const m = remplir(10);
  const w = new Marcheur(m);
  w.poserSurFeuille(0);
  // aller vers la branche : direction opposée à l'axe z de la feuille
  const r = repereFeuille(m.feuilles[0], m.branches[0].n);
  for (let i = 0; i < 60 && w.etat.type === 'feuille'; i++) w.deplacer([-r.z[0] * 0.3, -r.z[1] * 0.3, -r.z[2] * 0.3]);
  assert.equal(w.etat.type, 'branche');
  assert.equal(w.etat.b, 0);
});

test('on ne peut pas sortir du limbe : bords et bout de la feuille', () => {
  const m = remplir(3);
  const w = new Marcheur(m);
  w.poserSurFeuille(0);
  const r = repereFeuille(m.feuilles[0], m.branches[0].n);
  for (let i = 0; i < 80; i++) w.deplacer([r.x[0] * 0.5, r.x[1] * 0.5, r.x[2] * 0.5]);
  assert.equal(w.etat.type, 'feuille');
  assert.ok(Math.abs(w.etat.x) <= FEUILLE_DEMI_LARGEUR);
  for (let i = 0; i < 120; i++) w.deplacer([r.z[0] * 0.5, r.z[1] * 0.5, r.z[2] * 0.5]);
  assert.equal(w.etat.type, 'feuille');
});

test('la boule est toujours posée sur la surface : sa normale est un vecteur unitaire', () => {
  const m = remplir(20);
  const w = new Marcheur(m);
  for (let i = 0; i < 500; i++) {
    w.deplacer([0.3, 0.1, -0.2]);
    const n = w.normale();
    assert.ok(Math.abs(longueur(n) - 1) < 1e-6);
    assert.ok(dot(normer(n), n) > 0.99);
  }
  assert.ok(RAYON_BOULE <= 0.08);
});
