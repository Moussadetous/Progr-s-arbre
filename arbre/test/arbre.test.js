import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Arbre, Y0, R_TRONC, H_SALLE, PENTE_MAX_PONT, dansEncombrement, rayonTronc } from '../shared/arbre.js';
import { distance } from '../shared/geometrie.js';

const pousser = (n) => { const a = new Arbre(); for (let i = 0; i < n; i++) assert.ok(a.ajouter(), `arrivée ${i}`); return a; };
const A300 = pousser(300);

test('au départ : 4 branches maîtresses qui partent de la capitale, une seule maison', () => {
  const a = pousser(1);
  assert.equal(a.chemins.length, 4);
  assert.ok(a.chemins.every((c) => c.type === 'maitresse' && c.depart.capitale));
  assert.equal(a.maisons.length, 1);
  assert.equal(a.maisons[0].chemin, 0);
  // le chemin commence exactement au niveau du plancher de la capitale
  for (const c of a.chemins) {
    const p = c.surface(2.5, 0);
    assert.ok(Math.abs(p[1] - Y0) < 0.08, `départ à ${p[1]}`);
    assert.ok(Math.hypot(p[0], p[2]) < R_TRONC + 0.2);
  }
});

test('la maison d\'une personne ne change jamais quand d\'autres arrivent', () => {
  const a = pousser(120);
  for (let i = 0; i < 120; i++) {
    const m = a.maisons[i];
    const n = A300.maisons[i];
    assert.deepEqual([m.chemin, m.slot, m.s, m.cote], [n.chemin, n.slot, n.s, n.cote]);
  }
  for (let i = 0; i < a.chemins.length; i++) assert.deepEqual(a.chemins[i].courbe.ech[5].p, A300.chemins[i].courbe.ech[5].p);
});

test('l\'arbre grandit : rameaux, étages et ponts entre les branches apparaissent', () => {
  const r = A300.resume();
  assert.ok(r.parType.rameau >= 4, JSON.stringify(r));
  assert.ok(r.etages >= 2, JSON.stringify(r));
  assert.ok(r.ponts >= 6, JSON.stringify(r));
  assert.ok(A300.evenements.some((e) => e.type === 'pont'), 'des ponts latéraux entre branches');
});

test('tous les chemins sont praticables à pied : pente douce partout', () => {
  for (const c of A300.chemins) {
    const lim = c.type === 'pont' ? PENTE_MAX_PONT + 0.01 : 0.36;
    for (const e of c.courbe.ech) {
      if (c.type === 'etage' && e.s < 4) continue; // dans le tronc
      assert.ok(Math.abs(e.t[1]) <= lim, `chemin ${c.id} (${c.type}) pente ${e.t[1].toFixed(2)} à s=${e.s.toFixed(1)}`);
    }
  }
});

test('chaque chemin est relié : rameau à sa branche, pont à ses deux bouts, étage par un pont', () => {
  for (const c of A300.chemins) {
    if (c.type === 'maitresse') assert.ok(c.depart.capitale);
    if (c.type === 'rameau' || c.type === 'brindille') assert.ok(c.depart.chemin !== undefined);
    if (c.type === 'pont') assert.ok(c.depart.chemin !== undefined && c.arrivee);
    if (c.type === 'etage') assert.ok(A300.chemins.some((p) => p.type === 'pont' && p.arrivee.chemin === c.id), `étage ${c.id} sans pont`);
  }
  // tout est atteignable depuis la capitale
  const D = A300.distances();
  for (const c of A300.chemins) assert.ok(Number.isFinite(A300.distanceA(D, c.id, 0)), `chemin ${c.id} isolé`);
});

test('un raccord se fait au niveau : le rameau et le pont partent du dessus de leur branche', () => {
  for (const c of A300.chemins) {
    if (c.depart.chemin === undefined) continue;
    const parent = A300.chemins[c.depart.chemin];
    const p0 = c.surface(0, 0);
    const surParent = parent.surface(c.depart.s, c.depart.cote * 0.25 * parent.rayon(c.depart.s));
    assert.ok(Math.abs(p0[1] - surParent[1]) < 0.12, `raccord ${c.id} sur ${parent.id} : ${p0[1]} / ${surParent[1]}`);
    if (c.arrivee) {
      const B = A300.chemins[c.arrivee.chemin];
      const p1 = c.surface(c.Lmax, 0);
      const surB = B.surface(c.arrivee.s, c.arrivee.cote * 0.25 * B.rayon(c.arrivee.s));
      assert.ok(Math.abs(p1[1] - surB[1]) < 0.12, `arrivée du pont ${c.id}`);
    }
  }
});

test('les maisons ne se chevauchent pas et ne traversent aucune branche', () => {
  const ms = A300.maisons;
  for (let i = 0; i < ms.length; i++) {
    const e = ms[i].encombrement;
    for (let j = i + 1; j < ms.length; j++) {
      if (distance(e.centre, ms[j].encombrement.centre) > 9) continue;
      assert.ok(!dansEncombrement(e, ms[j].encombrement.centre, 1.6), `maisons ${i} et ${j}`);
    }
    for (const c of A300.chemins) {
      if (c.id === ms[i].chemin) continue;
      for (const ech of c.courbe.ech) {
        if (c.depart.chemin === ms[i].chemin && ech.s < 6) continue;
        if (c.arrivee && c.arrivee.chemin === ms[i].chemin && ech.s > c.Lmax - 6) continue;
        if (distance(ech.p, e.centre) > 12) continue;
        assert.ok(!dansEncombrement(e, c.centre(ech.s, true), c.rayon(ech.s, true) * 0.9), `maison ${i} traversée par le chemin ${c.id}`);
      }
    }
    // pas dans le tronc ni dans la salle de la capitale
    assert.ok(Math.hypot(e.centre[0], e.centre[2]) > rayonTronc(e.centre[1]) + 3);
  }
});

test('les branches ne se traversent pas (hors raccords)', () => {
  const cs = A300.chemins;
  const lies = (a, b) => a.depart.chemin === b.id || b.depart.chemin === a.id || (a.arrivee && a.arrivee.chemin === b.id) || (b.arrivee && b.arrivee.chemin === a.id);
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      if (lies(a, b)) continue;
      if (a.depart.capitale && b.depart.capitale) continue;
      if (a.type === 'etage' && b.type === 'etage' && a.niveau === b.niveau) continue; // base commune dans le tronc
      for (let x = 0; x < a.courbe.ech.length; x += 4) {
        const sa = a.courbe.ech[x].s;
        const Ca = a.centre(sa);
        if (Math.hypot(Ca[0], Ca[2]) < rayonTronc(Ca[1])) continue;
        for (let y = 0; y < b.courbe.ech.length; y += 4) {
          const sb = b.courbe.ech[y].s;
          const Cb = b.centre(sb);
          if (Math.hypot(Cb[0], Cb[2]) < rayonTronc(Cb[1])) continue;
          assert.ok(distance(Ca, Cb) > a.rayon(sa) + b.rayon(sb), `chemins ${a.id} et ${b.id} se traversent`);
        }
      }
    }
  }
});

test('rien ne traverse la salle de la capitale', () => {
  for (const c of A300.chemins) {
    if (c.type === 'maitresse') continue;
    for (const e of c.courbe.ech) {
      const C = c.centre(e.s);
      const r = c.rayon(e.s);
      if (C[1] + r > Y0 && C[1] - r < Y0 + H_SALLE) assert.ok(Math.hypot(C[0], C[2]) > R_TRONC + r, `chemin ${c.id} dans la capitale`);
    }
  }
});
