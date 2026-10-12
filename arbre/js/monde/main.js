// Le monde : un tronc, une capitale, 4 branches par défaut, une grande feuille par personne.
// La boule (la personne) circule sur les branches, le tronc, la place de la capitale et les feuilles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  Monde, construireGraphe, plusCourtChemin, framesVisibles, rayonTronc, pointFeuille, centreFeuille,
  HAUTEUR_CAPITALE, RAYON_BOULE, azimutBranche, BRANCHES_DEFAUT,
} from '../../shared/monde-arbre.js';
import { creerCiel } from '../atelier/ciel.js';
import { construireTube, materiauEcorce } from '../atelier/branches3d.js';
import { texturesEcorce, textureFeuille, textureBois } from '../atelier/textures.js';
import { v3 } from '../atelier/utils.js';

const params = new URLSearchParams(location.search);
const qualite = ['basse', 'moyenne', 'haute'].includes(params.get('q')) ? params.get('q') : 'haute';
const pause = params.has('pause');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualite !== 'basse', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'haute' ? 1.5 : 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = qualite !== 'basse';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);
const controles = new OrbitControls(camera, canvas);
controles.enableDamping = true;
controles.dampingFactor = 0.08;
controles.minDistance = 1.5;
controles.maxDistance = 900;

let composer = null;
if (qualite !== 'basse') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.28, 0.5, 0.94));
  composer.addPass(new OutputPass());
}
function redimensionner() {
  const l = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(l, h, false);
  if (composer) composer.setSize(l, h);
  camera.aspect = l / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', redimensionner);
redimensionner();

// ---------- décor ----------
const ciel = creerCiel(scene, { qualite });
const monde = new Monde();
const textures = texturesEcorce(512);
textures.map.repeat.set(1, 1);
const matEcorce = materiauEcorce(textures);

// tronc
let maillageTronc = null;
let hauteurTroncAffichee = 0;
function bâtirTronc() {
  const haut = monde.hauteurTronc();
  if (haut === hauteurTroncAffichee) return;
  hauteurTroncAffichee = haut;
  if (maillageTronc) { scene.remove(maillageTronc); maillageTronc.geometry.dispose(); }
  const bas = -50;
  const n = Math.ceil((haut - bas) / 1.5);
  const frames = [];
  for (let i = 0; i <= n; i++) {
    const y = bas + ((haut - bas) * i) / n;
    let r = rayonTronc(y);
    const u = (y - (haut - 9)) / 9;
    if (u > 0) r *= Math.sqrt(Math.max(0, 1 - Math.pow(u, 2))) + 0.02; // sommet arrondi
    frames.push({ pos: [0, y, 0], tan: [0, 1, 0], N: [1, 0, 0], B: [0, 0, -1], rayon: r, s: y - bas });
  }
  maillageTronc = new THREE.Mesh(construireTube(frames, { radial: 48, repetitions: 7, grain: 8, bosses: 0.04 }), matEcorce);
  maillageTronc.castShadow = true;
  maillageTronc.receiveShadow = true;
  scene.add(maillageTronc);
}

// branches : chaque branche est reconstruite quand elle grandit
const maillagesBranches = [];
const nBranchesAffichees = [];
function bâtirBranche(id) {
  const b = monde.branches[id];
  if (nBranchesAffichees[id] === b.n && maillagesBranches[id]) return;
  nBranchesAffichees[id] = b.n;
  if (maillagesBranches[id]) { scene.remove(maillagesBranches[id]); maillagesBranches[id].geometry.dispose(); }
  const m = new THREE.Mesh(construireTube(framesVisibles(id, b.n), { radial: 32, repetitions: 3, grain: 5, bosses: 0.07 }), matEcorce);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  maillagesBranches[id] = m;
}

// la place de la capitale : un plancher rond autour du tronc, une porte lumineuse, quelques lanternes
function bâtirCapitale() {
  const bois = textureBois();
  bois.repeat.set(10, 1);
  const R = rayonTronc(HAUTEUR_CAPITALE);
  const place = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 4.2, R + 3.8, 0.55, 64),
    new THREE.MeshStandardMaterial({ map: bois, roughness: 0.8 }),
  );
  place.position.y = HAUTEUR_CAPITALE - 0.5;
  place.receiveShadow = true;
  place.castShadow = true;
  scene.add(place);
  const rebord = new THREE.Mesh(
    new THREE.TorusGeometry(R + 4, 0.16, 8, 80),
    new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7 }),
  );
  rebord.rotation.x = Math.PI / 2;
  rebord.position.y = HAUTEUR_CAPITALE + 0.55;
  scene.add(rebord);
  const lumiere = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.22).multiplyScalar(2.2), toneMapped: false });
  const lanternes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 9), lumiere, 8);
  for (let k = 0; k < 8; k++) {
    const th = azimutBranche(0) + (k * Math.PI) / 4 + Math.PI / 8;
    lanternes.setMatrixAt(k, new THREE.Matrix4().makeTranslation(Math.cos(th) * (R + 4), HAUTEUR_CAPITALE + 1.1, Math.sin(th) * (R + 4)));
  }
  scene.add(lanternes);
  // la porte de la capitale, creusée dans le tronc entre les branches 0 et 1
  const th = azimutBranche(0) + Math.PI / 4;
  const porte = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.3).multiplyScalar(1.8), toneMapped: false }),
  );
  porte.scale.set(1, 1.5, 1);
  porte.position.set(Math.cos(th) * (R + 0.15), HAUTEUR_CAPITALE + 2.4, Math.sin(th) * (R + 0.15));
  porte.lookAt(Math.cos(th) * 100, HAUTEUR_CAPITALE + 2.4, Math.sin(th) * 100);
  scene.add(porte);
  const clair = new THREE.PointLight(0xffa850, 90, 26, 1.6);
  clair.position.set(Math.cos(th) * (R + 3), HAUTEUR_CAPITALE + 3, Math.sin(th) * (R + 3));
  scene.add(clair);
  return place;
}
const capitale = bâtirCapitale();

// les feuilles : tige et limbe en instances
const MAX_FEUILLES = 4000;
function geoLimbe() {
  const g = new THREE.PlaneGeometry(1, 1, 12, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;
    const v = p.getY(i) + 0.5;
    const q = pointFeuille(u, v);
    p.setXYZ(i, q[0], q[1], q[2]);
  }
  g.computeVertexNormals();
  return g;
}
const limbes = new THREE.InstancedMesh(
  geoLimbe(),
  new THREE.MeshStandardMaterial({ map: textureFeuille(), roughness: 0.55, side: THREE.DoubleSide, emissive: 0x4a6a14, emissiveIntensity: 0.3 }),
  MAX_FEUILLES,
);
limbes.count = 0;
limbes.frustumCulled = false;
limbes.castShadow = qualite !== 'basse';
limbes.receiveShadow = qualite !== 'basse';
const geoTige = new THREE.CylinderGeometry(0.1, 0.17, 1.5, 7);
geoTige.rotateX(Math.PI / 2);
geoTige.translate(0, 0.12, 0.7);
const tiges = new THREE.InstancedMesh(geoTige, new THREE.MeshStandardMaterial({ color: 0x5b7a2c, roughness: 0.7 }), MAX_FEUILLES);
tiges.count = 0;
tiges.frustumCulled = false;
scene.add(limbes, tiges);

const mat4 = new THREE.Matrix4();
function ecrireFeuille(f) {
  const r = monde.repereDe(f);
  const m = mat4.makeBasis(v3(r.x), v3(r.y), v3(r.z));
  m.multiply(new THREE.Matrix4().makeScale(r.echelle, r.echelle, r.echelle));
  m.setPosition(v3(r.origine));
  limbes.setMatrixAt(f.indice, m);
  tiges.setMatrixAt(f.indice, m);
}
function couleurFeuille(f) {
  if (f.indice === 0) return new THREE.Color(1.15, 1.0, 0.55); // la feuille de « moi », un peu plus dorée
  const h = ((f.indice * 0.6180339) % 1);
  return new THREE.Color().setHSL(0.2 + h * 0.12, 0.75, 0.82 + ((f.indice * 7) % 5) * 0.025);
}
function majFeuilles() {
  for (const f of monde.feuilles) ecrireFeuille(f);
  limbes.count = tiges.count = monde.feuilles.length;
  limbes.instanceMatrix.needsUpdate = tiges.instanceMatrix.needsUpdate = true;
  for (const f of monde.feuilles) limbes.setColorAt(f.indice, couleurFeuille(f));
  if (limbes.instanceColor) limbes.instanceColor.needsUpdate = true;
}

// la boule
const boule = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_BOULE, 32, 24),
  new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25, emissive: 0xffe2b0, emissiveIntensity: 0.25 }),
);
boule.castShadow = true;
scene.add(boule);
const halo = new THREE.Mesh(new THREE.SphereGeometry(RAYON_BOULE * 1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe9bf, transparent: true, opacity: 0.18, depthWrite: false }));
boule.add(halo);

// ---------- la boule se déplace sur le graphe ----------
let graphe = null;
const marche = { noeud: 'f0', route: null, d: 0, cum: [], apres: null, vitesse: 0 };
const VITESSE = 9; // m/s
const position = new THREE.Vector3();

function lancer(cible) {
  const c = plusCourtChemin(graphe, marche.noeud, cible);
  if (!c || c.points.length < 2) { marche.route = null; return; }
  const cum = [0];
  for (let i = 1; i < c.points.length; i++) cum.push(cum[i - 1] + Math.hypot(c.points[i][0] - c.points[i - 1][0], c.points[i][1] - c.points[i - 1][1], c.points[i][2] - c.points[i - 1][2]));
  marche.route = { ...c, cible };
  marche.cum = cum;
  marche.d = 0;
  marche.apres = null;
}

function aller(cible) {
  if (!graphe.noeuds.has(cible)) return;
  if (marche.route) { marche.apres = cible; return; }
  if (cible !== marche.noeud) lancer(cible);
}

function pointSur(route, cum, d) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const u = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  const a = route.points[i - 1];
  const b = route.points[i];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function arrivee(noeud) {
  marche.noeud = noeud;
  marche.route = null;
  marche.vitesse = 0;
  if (noeud.startsWith('f')) toast(noeud === 'f0' ? '🍃 Tu es chez toi' : `🍃 Tu es sur la feuille n° ${Number(noeud.slice(1)) + 1}`);
  else if (noeud === 'capitale') toast('🏛 Tu es à la capitale');
  if (marche.apres) { const c = marche.apres; marche.apres = null; aller(c); }
}

function avancer(dt) {
  if (!marche.route) {
    const n = graphe.noeuds.get(marche.noeud);
    if (n) position.lerp(v3(n.pos), 1 - Math.exp(-dt * 12));
    return;
  }
  const r = marche.route;
  const total = marche.cum[marche.cum.length - 1];
  const restant = total - marche.d;
  const cible = Math.min(VITESSE, 1.5 + restant * 1.6);
  marche.vitesse += (cible - marche.vitesse) * (1 - Math.exp(-dt * 6));
  marche.d = Math.min(total, marche.d + marche.vitesse * dt);
  const p = pointSur(r, marche.cum, marche.d);
  position.lerp(v3(p), 1 - Math.exp(-dt * 24));
  // nouvelle destination demandée en route : on change au prochain point de passage
  if (marche.apres) {
    const suivant = r.indices.find((i) => marche.cum[i] >= marche.d - 1e-6);
    if (suivant !== undefined && marche.cum[suivant] - marche.d < 0.5 && suivant !== r.indices[r.indices.length - 1]) {
      const noeud = r.noeuds[r.indices.indexOf(suivant)];
      const c = marche.apres;
      marche.route = null;
      marche.noeud = noeud;
      marche.apres = null;
      lancer(c);
      return;
    }
  }
  if (marche.d >= total - 1e-6) arrivee(r.cible);
}

// ---------- arrivées ----------
function arriver() {
  const { feuille, nouvelleBranche } = monde.ajouter();
  if (nouvelleBranche) toast('🌿 Une nouvelle branche pousse sur le tronc');
  actualiser();
  return feuille;
}
function arriverN(n) { for (let i = 0; i < n; i++) arriver(); }

function actualiser() {
  bâtirTronc();
  for (const b of monde.branches) bâtirBranche(b.id);
  majFeuilles();
  graphe = construireGraphe(monde);
  majPanneau();
}

// ---------- caméra ----------
let suivre = true;
function vueArbre(instantane = false) {
  const h = monde.hauteurTronc();
  const cible = new THREE.Vector3(10, Math.max(16, h * 0.42), 0);
  const dist = 100 + h * 0.9;
  const pos = cible.clone().add(new THREE.Vector3(-0.5 * dist, 0.55 * dist, 0.68 * dist));
  suivre = false;
  document.getElementById('btn-suivre').classList.remove('actif');
  if (instantane) { camera.position.copy(pos); controles.target.copy(cible); } else vueCible = { pos, cible };
}
let vueCible = null;
function vueBoule(instantane = false, distance = 15) {
  suivre = true;
  document.getElementById('btn-suivre').classList.add('actif');
  const t = position.clone();
  const dir = camera.position.clone().sub(controles.target);
  if (dir.lengthSq() < 1e-3 || dir.y < 0.1) dir.set(-0.5, 0.55, 0.7);
  dir.normalize().multiplyScalar(distance);
  const pos = t.clone().add(dir);
  if (instantane) { camera.position.copy(pos); controles.target.copy(t); } else vueCible = { pos, cible: t };
}

// ---------- interface ----------
const el = (id) => document.getElementById(id);
function toast(texte) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  el('toasts').appendChild(t);
  while (el('toasts').children.length > 4) el('toasts').firstElementChild.remove();
  setTimeout(() => t.classList.add('sort'), 3200);
  setTimeout(() => t.remove(), 3700);
}
function lieu() {
  const n = marche.route ? marche.route.noeuds[marche.route.noeuds.length - 1] : marche.noeud;
  const m = marche.route ? 'en route : ' : '';
  let texte = 'sur une branche';
  if (n.startsWith('f')) texte = Number(n.slice(1)) === 0 ? 'sur ta feuille' : `sur la feuille n° ${Number(n.slice(1)) + 1}`;
  else if (n === 'capitale' || /^p\d$/.test(n)) texte = 'à la capitale';
  else if (n.startsWith('t')) texte = 'sur le tronc';
  else if (n.startsWith('b')) texte = `sur la branche ${Number(n.slice(1).split(':')[0]) + 1}`;
  return m + texte;
}
function majPanneau() {
  el('stat-nombre').textContent = String(monde.feuilles.length);
  el('stat-branches').textContent = String(monde.branches.length);
  el('stat-detail').textContent = monde.branches.map((b) => b.n).join(' · ');
  el('stat-lieu').textContent = lieu();
}
for (const b of document.querySelectorAll('[data-arrivee]')) b.addEventListener('click', () => arriverN(Number(b.dataset.arrivee)));
el('btn-moi').addEventListener('click', () => { aller('f0'); vueBoule(false); });
el('btn-capitale').addEventListener('click', () => { aller('capitale'); vueBoule(false, 22); });
el('btn-hasard').addEventListener('click', () => {
  if (monde.feuilles.length < 2) return;
  aller(`f${1 + Math.floor(Math.random() * (monde.feuilles.length - 1))}`);
  vueBoule(false);
});
el('btn-suivre').addEventListener('click', () => { if (suivre) { suivre = false; el('btn-suivre').classList.remove('actif'); } else vueBoule(false); });
el('btn-arbre').addEventListener('click', () => vueArbre(false));
let auto = false;
el('btn-auto').addEventListener('click', (e) => {
  auto = !auto;
  e.target.classList.toggle('actif', auto);
  e.target.textContent = auto ? '⏸ Arrêter' : '▶ Auto';
});
el('btn-reset').addEventListener('click', () => location.reload());

// toucher une feuille (ou la place de la capitale) : la boule y va
const rayon = new THREE.Raycaster();
const souris = new THREE.Vector2();
let depart = null;
canvas.addEventListener('pointerdown', (e) => { depart = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!depart || Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 6 || performance.now() - depart.t > 450) return;
  clic(e.clientX, e.clientY);
});
function clic(x, y) {
  souris.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  rayon.setFromCamera(souris, camera);
  const touche = rayon.intersectObjects([limbes, capitale], false)[0];
  if (!touche) return;
  if (touche.object === limbes && touche.instanceId !== undefined) { aller(`f${touche.instanceId}`); vueBoule(false); }
  else { aller('capitale'); vueBoule(false, 22); }
}

// ---------- boucle ----------
let accu = 0;
const horloge = new THREE.Clock();
function rendre(dt = 0) {
  ciel.update(performance.now() / 1000);
  avancer(dt);
  boule.position.copy(position);
  if (vueCible) {
    const k = 1 - Math.exp(-3.5 * dt);
    camera.position.lerp(vueCible.pos, k);
    controles.target.lerp(vueCible.cible, k);
    if (camera.position.distanceTo(vueCible.pos) < 0.05) vueCible = null;
  } else if (suivre) {
    const d = position.clone().sub(controles.target);
    const k = 1 - Math.exp(-dt * 6);
    camera.position.addScaledVector(d, k);
    controles.target.addScaledVector(d, k);
  }
  if (auto) { accu += dt; if (accu > 0.9) { accu = 0; arriver(); } }
  controles.update();
  if (dt) el('stat-lieu').textContent = lieu();
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
}
function boucle() {
  requestAnimationFrame(boucle);
  rendre(Math.min(0.05, horloge.getDelta()));
}

// ---------- démarrage ----------
arriver(); // la première personne : une seule feuille
position.copy(v3(graphe.noeuds.get('f0').pos));
const n0 = Number(params.get('n') || 1);
if (n0 > 1) arriverN(n0 - 1);
const vue0 = params.get('vue') || 'arbre';
if (vue0 === 'boule') vueBoule(true, 14); else vueArbre(true);
el('chargement').classList.add('cache');
if (!pause) boucle();

window.__monde = {
  monde,
  arriver: (n = 1) => arriverN(n),
  aller,
  vueArbre: () => vueArbre(true),
  vueBoule: (d = 14) => vueBoule(true, d),
  placerCamera: (px, py, pz, tx, ty, tz) => { suivre = false; vueCible = null; camera.position.set(px, py, pz); controles.target.set(tx, ty, tz); },
  rendre: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) rendre(dt); },
  simuler: (n, dt = 0.05) => { for (let i = 0; i < n; i++) avancer(dt); boule.position.copy(position); if (suivre) { controles.target.copy(position); } },
  position,
  marche,
  pretes: true,
};
