import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graphe } from '../js/monde3d/graphe.js';
import { Deplacement, VITESSE_MARCHE, VITESSE_COURSE } from '../js/monde3d/deplacement.js';
import { demiLargeur, sub, dot, longueur, normer, TAILLE_FEUILLE } from '../shared/geometrie.js';

// Petit arbre de référence :
//   0 (0,0,0) ─ 1 (0,4,0) ─ 2 (0,8,0) = capitale
//                             ├─ 3 (4,8,0) ─ 4 (8,8,0)   ← une feuille est posée sur 4
//                             └─ 5 (0,8,4)
function arbreTest() {
  const noeud = (id, pos, parent, rayon, profondeur, rang, capitale = false) => ({
    id, parent, enfants: [], pos, rayon, profondeur, rang, capitale,
  });
  const noeuds = [
    noeud(0, [0, 0, 0], -1, 1, 0, 0),
    noeud(1, [0, 4, 0], 0, 0.9, 0, 1),
    noeud(2, [0, 8, 0], 1, 0.8, 0, 2, true),
    noeud(3, [4, 8, 0], 2, 0.5, 1, 3),
    noeud(4, [8, 8, 0], 3, 0.3, 2, 5),
    noeud(5, [0, 8, 4], 2, 0.3, 1, 4),
  ];
  for (const n of noeuds) if (n.parent >= 0) noeuds[n.parent].enfants.push(n.id);
  return { N: 6, noeuds, capitale: 2, parRang: Int32Array.from([0, 1, 2, 3, 5, 4]), candidats: Int32Array.from([4]), k0: 6 };
}

function monde() {
  const arbre = arbreTest();
  const g = new Graphe(arbre);
  g.etendre(arbre.N);
  g.ajouterFeuille({ id: 0, noeud: 4, emplacement: 0 });
  const d = new Deplacement(g);
  return { arbre, g, d, dt: 1 / 60 };
}

// Fait avancer la boule jusqu'à ce que la ffonction « fini » soit vraie (ou abandonne)
function avancer(m, pas, fini, entree = null, course = false) {
  const trace = [m.d.position.slice()];
  for (let i = 0; i < pas && !fini(); i++) {
    m.d.update(m.dt, entree, course);
    trace.push(m.d.position.slice());
  }
  return trace;
}

test("la boule va d'une feuille à un nœud en suivant les branches, puis s'arrête", () => {
  const m = monde();
  m.d.poserDansFeuille(0);
  let arrive = false;
  m.d.allerVers(0, () => { arrive = true; });
  avancer(m, 20000, () => arrive);
  assert.ok(arrive, "la boule n'est jamais arrivée");
  assert.equal(m.d.mode, 'noeud');
  assert.equal(m.d.noeud, 0);
});

test('le mouvement est continu : jamais de téléportation pendant un trajet', () => {
  const m = monde();
  m.d.poserSurNoeud(0);
  let arrive = false;
  m.d.allerVers(4, () => { arrive = true; });
  const trace = avancer(m, 20000, () => arrive);
  assert.ok(arrive);
  // Entre deux images, la boule ne bouge pas plus que sa vitesse (+ une marge aux changements de mode)
  const pasMax = (VITESSE_MARCHE * m.dt) + 0.35;
  for (let i = 1; i < trace.length; i++) {
    const saut = longueur(sub(trace[i], trace[i - 1]));
    assert.ok(saut <= pasMax, `saut de ${saut.toFixed(3)} m à l'image ${i}`);
  }
});

test("la course va plus vite que la marche", () => {
  // Un tiers de seconde, pour rester sur la branche (8 m)
  const marche = monde();
  marche.d.poserSurNoeud(2);
  avancer(marche, 20, () => false, [1, 0, 0], false);
  const course = monde();
  course.d.poserSurNoeud(2);
  avancer(course, 20, () => false, [1, 0, 0], true);
  const rapport = course.d.position[0] / marche.d.position[0];
  assert.ok(Math.abs(rapport - VITESSE_COURSE / VITESSE_MARCHE) < 0.1, `rapport ${rapport.toFixed(2)}`);
});

test('à la commande, la boule suit la branche demandée et reste sur son axe', () => {
  const m = monde();
  m.d.poserSurNoeud(2);
  avancer(m, 60, () => false, [1, 0, 0]); // une seconde vers +x
  const p = m.d.position;
  assert.ok(p[0] > 4, `x = ${p[0].toFixed(2)}`);
  // La boule roule sur la surface : elle reste à la distance du rayon de la branche (+ sa propre taille) de l'axe
  const distanceAxe = Math.hypot(p[1] - 8, p[2]);
  assert.ok(distanceAxe > 0.45 && distanceAxe < 1.1, `distance à l'axe : ${distanceAxe.toFixed(3)}`);
});

test('à une fourche, la boule prend la branche qui correspond à la direction demandée', () => {
  const m = monde();
  m.d.poserSurNoeud(2);
  avancer(m, 90, () => false, [0, 0, 1]); // 1,5 s vers +z : la branche 5
  const p = m.d.position;
  assert.ok(p[2] > 3, `z = ${p[2].toFixed(2)}`);
  assert.ok(Math.abs(p[0]) < 0.05, `dérive en x : ${p[0].toFixed(3)}`);
});

test('la boule entre dans sa feuille quand elle vise franchement la feuille', () => {
  const m = monde();
  m.d.poserSurNoeud(4);
  const feuille = m.g.geoFeuille(0);
  const vers = normer(sub(m.g.position(m.g.cleFeuille(0)), m.g.position(4)));
  avancer(m, 120, () => m.d.mode === 'feuille', vers);
  assert.equal(m.d.mode, 'feuille');
  assert.ok(feuille, 'la feuille existe');
});

test('dans la feuille, la boule se déplace librement puis en sort par le pétiole', () => {
  const m = monde();
  m.d.poserDansFeuille(0, TAILLE_FEUILLE / 2);
  const geo = m.g.geoFeuille(0);
  const y0 = m.d.feuille.y;
  avancer(m, 30, () => false, geo.dir); // avance le long de la feuille
  assert.ok(m.d.feuille.y > y0, 'la boule n\'a pas avancé dans la feuille');
  // Elle reste dans les bords de la feuille
  const lateral = Math.abs(dot(sub(m.d.position, geo.base), geo.side));
  assert.ok(lateral <= demiLargeur(m.d.feuille.y) + 0.3, `déborde à ${lateral.toFixed(2)} m`);
  // Puis elle revient vers le pied : elle quitte la feuille
  avancer(m, 600, () => m.d.mode !== 'feuille', geo.dir.map((v) => -v));
  assert.notEqual(m.d.mode, 'feuille', 'la boule ne sort jamais de la feuille');
});

test("une demande automatique depuis la feuille ressort par le pétiole jusqu'à la destination", () => {
  const m = monde();
  m.d.poserDansFeuille(0);
  let arrive = false;
  m.d.allerVers(2, () => { arrive = true; });
  avancer(m, 20000, () => arrive);
  assert.ok(arrive);
  assert.equal(m.d.noeud, 2);
});

test("arrivée à la capitale : la boule se tient au-dessus de la plateforme, sans sauter", () => {
  const m = monde();
  m.d.poserSurNoeud(0);
  let arrive = false;
  m.d.allerVers(2, () => { arrive = true; });
  avancer(m, 20000, () => arrive);
  assert.ok(arrive);
  const sommet = m.arbre.noeuds[2];
  assert.ok(Math.abs(m.d.position[1] - (sommet.pos[1] + sommet.rayon + 0.2)) < 0.05, `y = ${m.d.position[1]}`);
});

test('la demande de direction annule la demande automatique', () => {
  const m = monde();
  m.d.poserSurNoeud(0);
  let arrive = false;
  m.d.allerVers(4, () => { arrive = true; });
  avancer(m, 20, () => false);
  m.d.update(m.dt, [0, 0, 1], false);
  assert.equal(m.d.cible, null);
  assert.equal(arrive, false);
});

test("l'arête la plus courte est trouvée par le graphe", () => {
  const m = monde();
  assert.deepEqual(m.g.chemin(0, 4), [0, 1, 2, 3, 4]);
  assert.equal(m.g.chemin(0, 999), null);
  assert.equal(normer([3, 0, 4])[0], 0.6);
  assert.equal(VITESSE_MARCHE > 0, true);
});

test("sortir de sa feuille depuis le centre se fait sans saut : la boule rejoint le pied d'abord", () => {
  const m = monde();
  m.d.poserDansFeuille(0);
  let arrive = false;
  m.d.allerVers(2, () => { arrive = true; });
  const trace = avancer(m, 20000, () => arrive);
  assert.ok(arrive);
  const pasMax = (VITESSE_MARCHE * m.dt) + 0.35;
  for (let i = 1; i < trace.length; i++) {
    const saut = longueur(sub(trace[i], trace[i - 1]));
    assert.ok(saut <= pasMax, `saut de ${saut.toFixed(3)} m à l'image ${i}`);
  }
});
