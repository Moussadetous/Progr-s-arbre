// L'Arbre : un tronc, la capitale, 4 branches par défaut, une grande feuille par personne.
// La boule, minuscule, est pilotée par la personne : clavier, manette analogique ou joystick tactile.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  Monde, framesVisibles, rayonTronc, pointFeuille, HAUTEUR_CAPITALE, RAYON_BOULE, azimutBranche, repereFeuille,
} from '../../shared/monde-arbre.js';
import { Marcheur, Y_PLACE } from '../../shared/marche.js';
import { creerCiel } from './ciel.js';
import { construireTube, materiauEcorce } from './tube.js';
import { texturesEcorce, textureFeuille, textureBois } from './textures.js';
import { CameraSurface } from './camera.js';
import { Commandes } from './commandes.js';
import { v3 } from './utils.js';

const params = new URLSearchParams(location.search);
const qualite = ['basse', 'moyenne', 'haute'].includes(params.get('q')) ? params.get('q') : 'haute';
const pause = params.has('pause');
const el = (id) => document.getElementById(id);

const canvas = el('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualite !== 'basse', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'haute' ? 1.5 : 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = qualite !== 'basse';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.02, 3000);
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
const matEcorce = materiauEcorce(textures);

let maillageTronc = null;
let hauteurTroncAffichee = 0;
function batirTronc() {
  const haut = monde.hauteurTronc();
  if (haut === hauteurTroncAffichee) return;
  hauteurTroncAffichee = haut;
  if (maillageTronc) { scene.remove(maillageTronc); maillageTronc.geometry.dispose(); }
  const bas = -320;
  const n = Math.ceil((haut - bas) / 2);
  const frames = [];
  for (let i = 0; i <= n; i++) {
    const y = bas + ((haut - bas) * i) / n;
    let r = rayonTronc(y);
    const u = (y - (haut - 9)) / 9;
    if (u > 0) r *= Math.sqrt(Math.max(0, 1 - u * u)) + 0.02; // sommet arrondi
    frames.push({ pos: [0, y, 0], tan: [0, 1, 0], N: [1, 0, 0], B: [0, 0, -1], rayon: r, s: y - bas });
  }
  maillageTronc = new THREE.Mesh(construireTube(frames, { radial: 64, repetitions: 14, grain: 4, bosses: 0.035, mousse: false }), matEcorce);
  maillageTronc.castShadow = true;
  maillageTronc.receiveShadow = true;
  scene.add(maillageTronc);
}

const maillagesBranches = [];
const nAffiches = [];
function batirBranche(id) {
  const b = monde.branches[id];
  if (nAffiches[id] === b.n && maillagesBranches[id]) return;
  nAffiches[id] = b.n;
  if (maillagesBranches[id]) { scene.remove(maillagesBranches[id]); maillagesBranches[id].geometry.dispose(); }
  const m = new THREE.Mesh(construireTube(framesVisibles(id, b.n), { radial: 40, repetitions: 7, grain: 2.6, bosses: 0.06 }), matEcorce);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  maillagesBranches[id] = m;
}

// La capitale : un plancher rond autour du tronc, une porte lumineuse, des lanternes
function batirCapitale() {
  const bois = textureBois();
  bois.repeat.set(10, 1);
  const R = rayonTronc(HAUTEUR_CAPITALE);
  const place = new THREE.Mesh(new THREE.CylinderGeometry(R + 4.2, R + 3.8, 0.55, 64), new THREE.MeshStandardMaterial({ map: bois, roughness: 0.8 }));
  place.position.y = Y_PLACE - 0.275;
  place.receiveShadow = true;
  place.castShadow = true;
  scene.add(place);
  const rebord = new THREE.Mesh(new THREE.TorusGeometry(R + 4, 0.16, 8, 80), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7 }));
  rebord.rotation.x = Math.PI / 2;
  rebord.position.y = Y_PLACE + 0.5;
  scene.add(rebord);
  const lumiere = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.22).multiplyScalar(2.2), toneMapped: false });
  const lanternes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 9), lumiere, 8);
  for (let k = 0; k < 8; k++) {
    const th = azimutBranche(0) + (k * Math.PI) / 4 + Math.PI / 8;
    lanternes.setMatrixAt(k, new THREE.Matrix4().makeTranslation(Math.cos(th) * (R + 4), Y_PLACE + 1.1, Math.sin(th) * (R + 4)));
  }
  scene.add(lanternes);
  const th = azimutBranche(0) + Math.PI / 4;
  const porte = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.3).multiplyScalar(1.8), toneMapped: false }),
  );
  porte.scale.set(1, 1.5, 1);
  porte.position.set(Math.cos(th) * (R + 0.15), HAUTEUR_CAPITALE + 2.4, Math.sin(th) * (R + 0.15));
  porte.lookAt(Math.cos(th) * 100, HAUTEUR_CAPITALE + 2.4, Math.sin(th) * 100);
  scene.add(porte);
  const clair = new THREE.PointLight(0xffa850, 90, 26, 1.6);
  clair.position.set(Math.cos(th) * (R + 3), HAUTEUR_CAPITALE + 3, Math.sin(th) * (R + 3));
  scene.add(clair);
}
batirCapitale();

// Les feuilles : limbe et tige en instances
const MAX_FEUILLES = 4000;
function geoLimbe() {
  const g = new THREE.PlaneGeometry(1, 1, 14, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const q = pointFeuille(p.getX(i) * 2, p.getY(i) + 0.5);
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
const geoTige = new THREE.CylinderGeometry(0.045, 0.085, 1.5, 7);
geoTige.rotateX(Math.PI / 2);
geoTige.translate(0, 0.22, 0.7);
const tiges = new THREE.InstancedMesh(geoTige, new THREE.MeshStandardMaterial({ color: 0x5b7a2c, roughness: 0.7 }), MAX_FEUILLES);
tiges.count = 0;
tiges.frustumCulled = false;
scene.add(limbes, tiges);

const matriceFeuille = new THREE.Matrix4();
const echelle = new THREE.Matrix4();
function ecrireFeuille(f) {
  const r = monde.repereDe(f);
  matriceFeuille.makeBasis(v3(r.x), v3(r.y), v3(r.z));
  matriceFeuille.multiply(echelle.makeScale(r.ex, r.ey, r.ez));
  matriceFeuille.setPosition(v3(r.origine));
  limbes.setMatrixAt(f.indice, matriceFeuille);
  tiges.setMatrixAt(f.indice, matriceFeuille);
}
function couleurFeuille(f) {
  if (f.indice === 0) return new THREE.Color(1.15, 1.0, 0.55); // la feuille de la personne, un peu dorée
  const h = (f.indice * 0.6180339) % 1;
  return new THREE.Color().setHSL(0.2 + h * 0.12, 0.75, 0.82 + ((f.indice * 7) % 5) * 0.025);
}
function majFeuilles() {
  for (const f of monde.feuilles) ecrireFeuille(f);
  limbes.count = tiges.count = monde.feuilles.length;
  limbes.instanceMatrix.needsUpdate = tiges.instanceMatrix.needsUpdate = true;
  for (const f of monde.feuilles) limbes.setColorAt(f.indice, couleurFeuille(f));
  if (limbes.instanceColor) limbes.instanceColor.needsUpdate = true;
}

// ---------- la boule : minuscule ----------
const boule = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_BOULE, 24, 18),
  new THREE.MeshPhysicalMaterial({ color: 0xf6f1e8, roughness: 0.35, clearcoat: 0.8, emissive: 0xffe2b0, emissiveIntensity: 0.3 }),
);
boule.castShadow = true;
scene.add(boule);
// de loin, un point lumineux garde la boule visible
const repere = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.0, depthTest: false, fog: false }));
repere.renderOrder = 10;
scene.add(repere);

// ---------- état du jeu ----------
const marcheur = new Marcheur(monde);
const cam = new CameraSurface(camera);
const commandes = new Commandes(canvas, { stick: el('stick'), knob: el('knob') });
const position = new THREE.Vector3(); // position affichée (lissée)
let vueArbre = false;
let vueArbreAvant = 2.2;

function actualiser() {
  batirTronc();
  for (const b of monde.branches) batirBranche(b.id);
  majFeuilles();
  el('dev-info').textContent = `${monde.feuilles.length} feuilles · ${monde.branches.length} branches`;
}
function arriver() {
  const { nouvelleBranche } = monde.ajouter();
  if (nouvelleBranche) toast('🌿 Une nouvelle branche pousse sur le tronc');
  actualiser();
}
function arriverN(n) { for (let i = 0; i < n; i++) arriver(); }

function chezSoi() {
  marcheur.poserSurFeuille(0);
  const r = repereFeuille(monde.feuilles[0], monde.branches[0].n);
  const n = v3(marcheur.normale());
  cam.orienter(n, v3(r.z));
  position.set(...marcheur.position());
}

function toast(texte) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  el('toasts').appendChild(t);
  while (el('toasts').children.length > 3) el('toasts').firstElementChild.remove();
  setTimeout(() => t.classList.add('sort'), 2800);
  setTimeout(() => t.remove(), 3300);
}

for (const b of document.querySelectorAll('[data-arrivee]')) b.addEventListener('click', () => arriverN(Number(b.dataset.arrivee)));
if (params.has('dev')) el('dev').classList.remove('cache');

// ---------- boucle ----------
const horloge = new THREE.Clock();
const cible = new THREE.Vector3();
const dir = new THREE.Vector3();
const soleilDir = new THREE.Vector3();
let derniereAide = performance.now();

function rendre(dt = 0) {
  const t = performance.now() / 1000;
  ciel.update(t);
  const c = commandes.lire();

  // actions à touche unique
  for (const k of c.actions) {
    if (k === 'v') {
      vueArbre = !vueArbre;
      if (vueArbre) { vueArbreAvant = cam.distanceVoulue; cam.distanceVoulue = 170 + monde.hauteurTronc() * 1.1; cam.tangage = 0.5; } else cam.distanceVoulue = vueArbreAvant;
    }
    if (k === 'h') { chezSoi(); vueArbre = false; cam.distanceVoulue = 2.4; toast('🍃 Tu es chez toi'); }
    if (k === 'n') arriver();
    if (k === 'm') arriverN(10);
  }

  // regarder, zoomer
  if (c.lacet || c.tangage) cam.tourner(c.lacet, c.tangage);
  if (c.zoom !== 1) { cam.zoomer(c.zoom); vueArbre = false; }

  // marcher : la vitesse suit l'échelle de la vue (de près on avance à pas de fourmi, de loin on traverse)
  if (dt > 0 && (c.mx || c.my)) {
    const { avant, droite } = cam.axes();
    dir.copy(avant).multiplyScalar(c.my).addScaledVector(droite, c.mx);
    const vitesse = Math.min(26, Math.max(1.4, cam.distance * 1.9)) * (c.sprint ? 2.4 : 1);
    dir.multiplyScalar(vitesse * dt);
    marcheur.deplacer([dir.x, dir.y, dir.z]);
    derniereAide = performance.now();
  }
  if (performance.now() - derniereAide > 9000) el('aide').classList.add('fondu');
  else el('aide').classList.remove('fondu');

  // la boule est lissée : les changements de surface glissent au lieu de sauter
  cible.set(...marcheur.position());
  position.lerp(cible, dt ? 1 - Math.exp(-dt * 26) : 1);
  boule.position.copy(position);
  cam.suivreSurface(v3(marcheur.normale()), dt || 1);
  cam.placer(position, dt || 1);

  // le repère lumineux grossit avec la distance : il ne se voit que de loin
  const d = camera.position.distanceTo(position);
  repere.position.copy(position);
  repere.scale.setScalar(Math.max(0.01, d * 0.012));
  repere.material.opacity = Math.min(0.9, Math.max(0, (d - 12) / 40));

  // l'ombre du soleil suit la boule : très précise de près, large de loin
  const s = ciel.soleil;
  const e = Math.min(110, Math.max(10, d * 4));
  const centre = d > 80 ? cible.set(8, monde.hauteurTronc() * 0.4, 0) : position;
  soleilDir.set(0.55, 0.2, -0.62).normalize();
  s.position.copy(centre).addScaledVector(soleilDir, 160);
  s.target.position.copy(centre);
  s.target.updateMatrixWorld();
  const sc = s.shadow.camera;
  if (sc.right !== e) { sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix(); }

  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
}

function boucle() {
  requestAnimationFrame(boucle);
  rendre(Math.min(0.05, horloge.getDelta()));
}

// ---------- démarrage ----------
arriver(); // la première personne : une seule feuille
const n0 = Number(params.get('n') || 1);
if (n0 > 1) arriverN(n0 - 1);
chezSoi();
if (params.get('vue') === 'arbre') { vueArbre = true; cam.distance = cam.distanceVoulue = 170 + monde.hauteurTronc() * 1.1; cam.tangage = 0.5; } else { cam.distance = cam.distanceVoulue = 2.6; }
el('chargement').classList.add('cache');
if (!pause) boucle();

// Accès pour les tests automatiques
window.__monde = {
  monde,
  marcheur,
  cam,
  commandes,
  arriver: (n = 1) => arriverN(n),
  rendre: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) rendre(dt); },
  // marcher dans une direction relative à la caméra (avant = +y, droite = +x) pendant une durée
  marcher: (mx, my, secondes, dt = 0.05, sprint = false) => {
    for (let i = 0; i < Math.ceil(secondes / dt); i++) {
      const { avant, droite } = cam.axes();
      dir.copy(avant).multiplyScalar(my).addScaledVector(droite, mx);
      const vitesse = Math.min(26, Math.max(1.4, cam.distance * 1.9)) * (sprint ? 2.4 : 1);
      dir.multiplyScalar(vitesse * dt);
      marcheur.deplacer([dir.x, dir.y, dir.z]);
      cible.set(...marcheur.position());
      cam.suivreSurface(v3(marcheur.normale()), dt);
    }
    position.set(...marcheur.position());
  },
  pretes: true,
};
