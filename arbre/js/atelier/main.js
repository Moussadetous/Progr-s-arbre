// L'atelier du monde : un tronc, quatre grosses branches, la maison d'une personne,
// puis des arrivées simulées pour vérifier que chaque maison se place naturellement.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { creerSquelette, repereA, pointSurface } from '../../shared/squelette.js';
import { placerMaison, distanceMin, EMPREINTE, MARGE } from '../../shared/placement.js';
import { longueur, sub } from '../../shared/geometrie.js';
import { creerCiel } from './ciel.js';
import { creerBranches3d } from './branches3d.js';
import { Maisons } from './maison.js';
import { Flore } from './flore.js';
import { v3 } from './utils.js';

const params = new URLSearchParams(location.search);
const qualite = ['basse', 'moyenne', 'haute'].includes(params.get('q')) ? params.get('q') : 'haute';
const pause = params.has('pause');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualite !== 'basse', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'haute' ? 1.5 : 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = qualite !== 'basse';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);
const controles = new OrbitControls(camera, canvas);
controles.enableDamping = true;
controles.dampingFactor = 0.08;
controles.minDistance = 2;
controles.maxDistance = 400;

// Post-traitement : bloom léger pour les lanternes et les lampes
let composer = null;
if (qualite !== 'basse') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.55, 0.93);
  composer.addPass(bloom);
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

// ---------- le monde ----------
const ciel = creerCiel(scene, { qualite });
const squelette = creerSquelette();
creerBranches3d(scene, squelette);
const maisons = new Maisons(scene, { qualite });
const flore = new Flore(scene, squelette, { qualite });
flore.semer(qualite === 'basse' ? 60 : 170);
flore.lianes(qualite === 'basse' ? 8 : 26);
flore.lanternes(0, [0.2, 0.52, 0.8], 2);
flore.lanternes(2, [0.3, 0.6], 0);
flore.lanternes(1, [0.35, 0.7], 0);
flore.lanternes(3, [0.28, 0.62], 0);

const placements = [];
const NOMS = ['Léa', 'Hugo', 'Inès', 'Léo', 'Maël', 'Jade', 'Théo', 'Chloé', 'Nathan', 'Manon', 'Gabriel', 'Lucie',
  'Adam', 'Camille', 'Raphaël', 'Sarah', 'Noah', 'Emma', 'Tom', 'Alice', 'Enzo', 'Zoé', 'Louis', 'Léna', 'Sacha', 'Eva',
  'Oscar', 'Nina', 'Victor', 'Rose', 'Iris', 'Malo'];
let pleine = false;

// La boule de la première personne, devant sa porte
const boule = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 40, 28),
  new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
);
boule.castShadow = true;
scene.add(boule);

// ---------- arrivées ----------
function arriver({ instantane = false } = {}) {
  if (pleine) return null;
  const n = placements.length;
  const p = placerMaison(squelette, placements, n, { graine: 1 });
  if (!p) {
    pleine = true;
    majPanneau();
    toast('🌱 Les quatre branches sont pleines : l’arbre doit pousser pour accueillir du monde.');
    return null;
  }
  placements.push(p);
  const i = maisons.ajouter(p, { instantane });
  flore.jardin(p, 5);
  const lampe = maisons.pointLocal(i, -1.15, 1.2, 0.4);
  flore.halo(lampe, 3.0 * p.echelle, 0.9);
  if (i === 0) {
    const pos = maisons.pointLocal(0, 0.35, 0.16 + 0.28, 2.55);
    boule.position.copy(pos);
    const t = maisons.pointLocal(0, 0, 0, 2.4);
    etiquetteMoi.dataset.x = t.x; etiquetteMoi.dataset.y = t.y; etiquetteMoi.dataset.z = t.z;
  } else if (!instantane) {
    toast(`🍃 ${NOMS[i % NOMS.length]} vient d’arriver`);
  }
  majPanneau();
  return p;
}

function arriverN(n, opts) {
  for (let k = 0; k < n; k++) if (!arriver(opts)) break;
}

// ---------- vues ----------
let vueCible = null;
function vue(nom, instantane = false) {
  let pos;
  let cible;
  if (nom === 'lointaine') {
    pos = new THREE.Vector3(-58, 20, 66);
    cible = new THREE.Vector3(10, 17, 0);
  } else if (nom === 'dessus') {
    pos = new THREE.Vector3(0, 118, 14);
    cible = new THREE.Vector3(0, 8, 0);
  } else if (nom === 'branche') {
    const b = squelette.branches[0];
    const r = repereA(b, 0.32);
    const s = pointSurface(r, 0.2).pos;
    const dir = v3(r.tan);
    pos = v3(s).addScaledVector(dir, -8).add(new THREE.Vector3(0, 7.5, 0));
    cible = v3(s).addScaledVector(dir, 10).add(new THREE.Vector3(0, 0.8, 0));
  } else if (nom === 'interieur' && maisons.nombre) {
    pos = maisons.pointLocal(0, 0.6, 1.15, 3.9);
    cible = maisons.pointLocal(0, -0.5, 0.95, -0.6);
  } else {
    // « maison » : face à la porte, un peu de côté et au-dessus, comme la vignette 2
    pos = maisons.nombre ? maisons.pointLocal(0, 4.6, 3.1, 9.6) : new THREE.Vector3(30, 14, 30);
    cible = maisons.nombre ? maisons.pointLocal(0, 0.2, 1.3, 0.9) : new THREE.Vector3(0, 10, 0);
  }
  if (instantane) {
    camera.position.copy(pos);
    controles.target.copy(cible);
    vueCible = null;
  } else {
    vueCible = { pos, cible };
  }
}

// ---------- interface ----------
const el = (id) => document.getElementById(id);
const etiquetteMoi = el('etiquette-moi');
function toast(texte) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  el('toasts').appendChild(t);
  while (el('toasts').children.length > 4) el('toasts').firstElementChild.remove();
  setTimeout(() => t.classList.add('sort'), 3200);
  setTimeout(() => t.remove(), 3700);
}

function statistiques() {
  const parBranche = [0, 0, 0, 0];
  let plusPetit = Infinity;
  let marge = Infinity;
  for (let i = 0; i < placements.length; i++) {
    parBranche[placements[i].branche]++;
    for (let j = i + 1; j < placements.length; j++) {
      const d = longueur(sub(placements[i].pos, placements[j].pos));
      plusPetit = Math.min(plusPetit, d);
      marge = Math.min(marge, d - distanceMin(placements[i], placements[j]));
    }
  }
  return { nombre: placements.length, parBranche, plusPetit, marge, pleine };
}

function majPanneau() {
  const s = statistiques();
  el('stat-nombre').textContent = `${s.nombre} maison${s.nombre > 1 ? 's' : ''}`;
  el('stat-branches').textContent = s.parBranche.join(' · ');
  el('stat-espace').textContent = s.plusPetit === Infinity ? '—' : `${s.plusPetit.toFixed(1)} m (marge +${s.marge.toFixed(1)} m)`;
  el('stat-etat').textContent = s.pleine ? 'Branches pleines : l’arbre doit pousser' : 'Place disponible';
  for (const b of document.querySelectorAll('[data-arrivee]')) b.disabled = s.pleine;
  majDebug();
}

// Mode « emplacements » : un disque vert par maison, à la taille de son espace réservé
const groupeDebug = new THREE.Group();
groupeDebug.visible = false;
scene.add(groupeDebug);
function majDebug() {
  while (groupeDebug.children.length < placements.length) {
    const i = groupeDebug.children.length;
    const p = placements[i];
    const r = EMPREINTE * MARGE * p.echelle;
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40),
      new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    const n = v3(p.normale);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.position.copy(v3(p.pos)).addScaledVector(n, 0.25);
    groupeDebug.add(m);
  }
}

for (const b of document.querySelectorAll('[data-vue]')) b.addEventListener('click', () => vue(b.dataset.vue));
for (const b of document.querySelectorAll('[data-arrivee]')) b.addEventListener('click', () => arriverN(Number(b.dataset.arrivee)));
el('btn-auto').addEventListener('click', (e) => {
  auto = !auto;
  e.target.classList.toggle('actif', auto);
  e.target.textContent = auto ? '⏸ Arrêter' : '▶ Arrivées auto';
});
el('btn-zones').addEventListener('click', (e) => {
  groupeDebug.visible = !groupeDebug.visible;
  e.target.classList.toggle('actif', groupeDebug.visible);
});
el('btn-reset').addEventListener('click', () => location.reload());

// ---------- boucle ----------
let auto = false;
let accu = 0;
const horloge = new THREE.Clock();
const point = new THREE.Vector3();

function etiqueter() {
  if (!etiquetteMoi.dataset.x) return;
  point.set(Number(etiquetteMoi.dataset.x), Number(etiquetteMoi.dataset.y) + 4.4, Number(etiquetteMoi.dataset.z)).project(camera);
  const ok = point.z < 1 && Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2;
  etiquetteMoi.style.opacity = ok ? '1' : '0';
  etiquetteMoi.style.transform = `translate(${(point.x * 0.5 + 0.5) * window.innerWidth}px, ${(-point.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
}

function rendre(dt = 0) {
  const t = performance.now() / 1000;
  ciel.update(t);
  maisons.update(dt);
  boule.rotation.z = Math.sin(t * 0.8) * 0.04;
  if (vueCible) {
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(vueCible.pos, k);
    controles.target.lerp(vueCible.cible, k);
    if (camera.position.distanceTo(vueCible.pos) < 0.05) vueCible = null;
  }
  if (auto) {
    accu += dt;
    if (accu > 1.2) { accu = 0; arriver(); }
  }
  controles.update();
  etiqueter();
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
}

function boucle() {
  requestAnimationFrame(boucle);
  rendre(Math.min(0.05, horloge.getDelta()));
}

// ---------- démarrage ----------
arriver({ instantane: true });
const n0 = Number(params.get('n') || 0);
if (n0 > 1) arriverN(n0 - 1, { instantane: true });
maisons.terminer();
vue(params.get('vue') || 'maison', true);
majPanneau();
el('chargement').classList.add('cache');
if (!pause) boucle();

window.__atelier = {
  arriver: (n = 1, opts = { instantane: true }) => { arriverN(n, opts); maisons.terminer(); },
  vue,
  rendre: () => { maisons.terminer(); rendre(0.016); },
  stats: statistiques,
  placements,
  squelette,
  zones: (v) => { groupeDebug.visible = v; },
  pretes: true,
  camera,
  controles,
  maisons,
};
