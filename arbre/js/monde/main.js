// L'Arbre : la capitale au cœur du tronc, des branches qui sont des chemins, une feuille-maison par personne.
// La boule, minuscule, se déplace avec la gravité sur le dessus des branches : clavier, manette, joystick tactile.
// Le bouton « Faire grandir » simule des arrivées de plus en plus nombreuses pour voir l'arbre pousser.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Arbre, Y0, H_SALLE, rayonTronc } from '../../shared/arbre.js';
import { Sol, RAYON_BOULE } from '../../shared/sol.js';
import { Marcheur } from '../../shared/marche.js';
import * as MAISON from '../../shared/maison.js';
import { creerCiel, DIRECTION_SOLEIL } from './ciel.js';
import { geometrieChemin, geometrieTronc, materiauEcorce } from './tube.js';
import { texturesEcorce, textureHalo } from './textures.js';
import { Maisons3d } from './maisons3d.js';
import { creerCapitale } from './capitale3d.js';
import { CameraBoule } from './camera.js';
import { Commandes } from './commandes.js';

const params = new URLSearchParams(location.search);
const qualite = ['basse', 'moyenne', 'haute'].includes(params.get('q')) ? params.get('q') : 'haute';
const pause = params.has('pause');
const el = (id) => document.getElementById(id);

// ---------- rendu ----------
const canvas = el('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualite !== 'basse', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualite === 'haute' ? 1.5 : 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = qualite !== 'basse';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.03, 4000);
let composer = null;
if (qualite !== 'basse') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.5, 0.92));
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
const arbre = new Arbre();
const sol = new Sol(arbre);
const matEcorce = materiauEcorce(texturesEcorce());
const capitale = creerCapitale(scene, matEcorce, arbre);
const maisons = new Maisons3d(scene, arbre, { qualite });

// le tronc : sous la capitale (jusque dans les nuages) et au-dessus (jusqu'à sa cime)
const troncBas = new THREE.Mesh(
  geometrieTronc(
    Array.from({ length: 60 }, (_, i) => new THREE.Vector3(0, -330 + (i / 59) * (Y0 + 330), 0)),
    Array.from({ length: 60 }, (_, i) => rayonTronc(-330 + (i / 59) * (Y0 + 330)) + 2.5 * Math.pow(1 - i / 59, 3)),
    { radial: 80 },
  ),
  matEcorce,
);
troncBas.castShadow = true;
troncBas.receiveShadow = true;
scene.add(troncBas);
let troncHaut = null;
let hauteurAffichee = 0;
function batirTroncHaut() {
  const haut = arbre.hauteurTronc();
  if (Math.abs(haut - hauteurAffichee) < 0.5) return;
  hauteurAffichee = haut;
  if (troncHaut) { scene.remove(troncHaut); troncHaut.geometry.dispose(); }
  const y0 = Y0 + H_SALLE;
  const n = Math.ceil((haut - y0) / 2) + 1;
  const pts = [];
  const ray = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + ((haut - y0) * i) / (n - 1);
    const u = (y - (haut - 16)) / 16; // la cime s'arrondit en dôme moussu
    pts.push(new THREE.Vector3(0, y, 0));
    ray.push(u > 0 ? Math.max(0.05, rayonTronc(y) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.2))) * (1 - 0.25 * u)) : rayonTronc(y));
  }
  troncHaut = new THREE.Mesh(geometrieTronc(pts, ray, { radial: 80, mousse: 0.5 }), matEcorce);
  troncHaut.castShadow = true;
  troncHaut.receiveShadow = true;
  scene.add(troncHaut);
}

// les branches : reconstruites quand elles s'allongent (en poussant) ou s'épaississent
const branches = new Map(); // id -> { mesh, Laff, Lconstruit, charge }
function majBranches(dt, budget = 8) {
  let refaites = 0;
  const changes = [];
  for (const c of arbre.chemins) {
    let b = branches.get(c.id);
    if (!b) {
      b = { mesh: null, Laff: 0, Lconstruit: -1, charge: -1 };
      branches.set(c.id, b);
    }
    const cible = c.type === 'pont' ? c.Lmax : c.Lvis;
    if (b.Laff < cible) b.Laff = dt ? Math.min(cible, b.Laff + dt * Math.max(6, (cible - b.Laff) * 1.5)) : cible;
    const chargeChange = b.charge !== c.charge();
    if (chargeChange) changes.push(c.id);
    if ((Math.abs(b.Laff - b.Lconstruit) > 0.25 || chargeChange) && refaites < budget && b.Laff > 0.5) {
      const g = geometrieChemin(c, b.Laff);
      if (b.mesh) { b.mesh.geometry.dispose(); b.mesh.geometry = g; } else {
        b.mesh = new THREE.Mesh(g, matEcorce);
        b.mesh.castShadow = qualite !== 'basse';
        b.mesh.receiveShadow = qualite !== 'basse';
        scene.add(b.mesh);
      }
      b.Lconstruit = b.Laff;
      b.charge = c.charge();
      refaites++;
    }
  }
  return changes;
}

// ---------- la boule : minuscule ----------
const boule = new THREE.Mesh(
  new THREE.SphereGeometry(RAYON_BOULE, 28, 20),
  new THREE.MeshPhysicalMaterial({ color: 0xf6f1e8, roughness: 0.32, clearcoat: 0.8, emissive: 0xffe2b0, emissiveIntensity: 0.25 }),
);
boule.castShadow = true;
scene.add(boule);
const reperage = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureHalo(), color: 0xfff6dd, transparent: true, opacity: 0, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
reperage.renderOrder = 10;
scene.add(reperage);

const marcheur = new Marcheur(sol);
const cam = new CameraBoule(camera, sol);
const commandes = new Commandes(canvas, { stick: el('stick'), knob: el('knob') });
const position = new THREE.Vector3();

function chezMoi() {
  const m = arbre.maisons[0];
  const r = arbre.repereMaison(m);
  const c = arbre.versMonde(r, MAISON.CENTRE_PLANCHER);
  marcheur.poser(c[0], c[1] + 0.3, c[2]);
  position.set(...marcheur.p);
  cam.lacet = Math.atan2(-r.Z[2], -r.Z[0]); // on regarde vers la porte, vers le chemin
  cam.tangage = 0.26;
  cam.voulue = 2.2;
}

// La caméra ne passe pas à travers les feuilles-maisons
const rayon = new THREE.Raycaster();
function obstacleFeuilles(origine, direction, distance) {
  rayon.set(origine, direction);
  rayon.far = distance;
  const h = rayon.intersectObject(maisons.feuilles, false)[0];
  return h ? h.distance : Infinity;
}

// ---------- croissance ----------
const croissance = { active: false, debit: 2, reste: 0, depuis: 0 };
let derniersEvenements = 0;
function arrivees(n, budgetMs = 14) {
  const t0 = performance.now();
  let faites = 0;
  for (let i = 0; i < n; i++) {
    if (!arbre.ajouter()) break;
    faites++;
    if (performance.now() - t0 > budgetMs) break;
  }
  if (faites) signalerEvenements();
  return faites;
}
function signalerEvenements() {
  const ev = arbre.evenements.slice(derniersEvenements);
  derniersEvenements = arbre.evenements.length;
  const n = { rameau: 0, etage: 0, pont: 0 };
  for (const e of ev) n[e.type]++;
  if (n.etage) toast(`⬆️ ${n.etage > 1 ? n.etage + ' nouvelles branches' : 'Une nouvelle branche'} plus haut sur le tronc, reliée par un pont`);
  if (n.rameau) toast(`🌿 ${n.rameau > 1 ? n.rameau + ' rameaux poussent' : 'Un rameau pousse'}`);
  if (n.pont) toast(`🌉 ${n.pont > 1 ? n.pont + ' nouveaux ponts' : 'Un pont'} entre des branches`);
}
function basculerCroissance(forcer) {
  croissance.active = forcer ?? !croissance.active;
  croissance.debit = 2;
  croissance.depuis = 0;
  el('btn-grandir').classList.toggle('actif', croissance.active);
  el('btn-grandir').textContent = croissance.active ? '⏸ Pause' : '🌱 Faire grandir';
}
el('btn-grandir').addEventListener('click', () => basculerCroissance());

function tailleArbre() {
  let r = 60;
  for (const c of arbre.chemins) {
    const e = c.courbe.ech[Math.min(c.courbe.ech.length - 1, Math.round(c.Lvis / c.courbe.pas))];
    r = Math.max(r, Math.hypot(e.p[0], e.p[2]));
  }
  return { rayon: r, hauteur: arbre.hauteurTronc() };
}

// ---------- interface ----------
function toast(texte) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texte;
  el('toasts').appendChild(t);
  while (el('toasts').children.length > 3) el('toasts').firstElementChild.remove();
  setTimeout(() => t.classList.add('sort'), 2600);
  setTimeout(() => t.remove(), 3100);
}
function majCompteurs() {
  const r = arbre.resume();
  const p = r.maisons;
  el('compteurs').textContent = `${p.toLocaleString('fr-FR')} ${p > 1 ? 'personnes' : 'personne'} · ${r.chemins - r.ponts} branches · ${r.ponts} ${r.ponts > 1 ? 'ponts' : 'pont'} · ${r.etages} ${r.etages > 1 ? 'étages' : 'étage'}`;
}

// ---------- boucle ----------
const horloge = new THREE.Clock();
let temps = 0;
let derniereAide = 0;
let vueEnsemble = false;
let distanceAvantVue = 1.7;

function rendre(dt = 0) {
  temps += dt;
  ciel.update(performance.now() / 1000);
  capitale.update(temps);
  const c = commandes.lire();
  for (const k of c.actions) {
    if (k === 'g') basculerCroissance();
    if (k === 'v') {
      vueEnsemble = !vueEnsemble;
      if (vueEnsemble) { distanceAvantVue = cam.voulue; const t = tailleArbre(); cam.voulue = 40 + 1.5 * Math.max(t.rayon, t.hauteur * 0.8); cam.tangage = 0.42; } else cam.voulue = distanceAvantVue;
    }
    if (k === 'h') { chezMoi(); vueEnsemble = false; basculerCroissance(false); toast('🍃 Tu es chez toi'); }
    if (k === 'n') arrivees(1);
    if (k === 'm') arrivees(10, 200);
  }
  if (c.lacet || c.tangage) cam.tourner(c.lacet, c.tangage, temps);
  if (c.zoom !== 1) { cam.zoomer(c.zoom); vueEnsemble = false; }

  // croissance automatique, de plus en plus rapide
  if (croissance.active && dt) {
    croissance.depuis += dt;
    croissance.debit = Math.min(90, 2 * Math.pow(1.13, croissance.depuis));
    croissance.reste += croissance.debit * dt;
    const n = Math.floor(croissance.reste);
    if (n > 0) croissance.reste -= arrivees(n);
    croissance.reste = Math.min(croissance.reste, 5);
    if (arbre.maisons.length >= 6000) { basculerCroissance(false); toast('Limite de la démonstration : 6 000 personnes'); }
    // la caméra se recule pour voir l'arbre entier et tourne lentement autour
    const t = tailleArbre();
    cam.voulue += (40 + 1.5 * Math.max(t.rayon, t.hauteur * 0.8) - cam.voulue) * (1 - Math.exp(-dt * 0.8));
    if (temps - cam.derniereRotation > 2) cam.lacet += dt * 0.07;
    cam.tangage += (0.38 - cam.tangage) * (1 - Math.exp(-dt));
  }
  cam.centreArbre.set(0, Y0 + (arbre.hauteurTronc() - Y0) * 0.42, 0);

  // marcher
  if (dt && (c.mx || c.my)) {
    const { avant, droite } = cam.axes();
    const vitesse = Math.min(30, Math.max(1.6, cam.distance * 1.5)) * (c.sprint ? 2.5 : 1);
    const dx = (avant.x * c.my + droite.x * c.mx) * vitesse * dt;
    const dz = (avant.z * c.my + droite.z * c.mx) * vitesse * dt;
    const x0 = marcheur.p[0];
    const z0 = marcheur.p[2];
    marcheur.deplacer(dx, dz);
    cam.suivreDirection(marcheur.p[0] - x0, marcheur.p[2] - z0, Math.max(0, c.my), dt, temps);
    derniereAide = temps;
  }
  el('aide').classList.toggle('fondu', temps - derniereAide > 10);

  // le monde suit la croissance
  const changes = majBranches(dt);
  maisons.synchroniser(changes);
  maisons.update(dt);
  batirTroncHaut();
  if (changes.length || croissance.active) majCompteurs();

  // la boule, lissée
  const cible = new THREE.Vector3(...marcheur.p);
  position.lerp(cible, dt ? 1 - Math.exp(-dt * 30) : 1);
  boule.position.copy(position);
  const appui = marcheur.appui && marcheur.appui.source;
  cam.placer(position, dt || 1, { dansMaison: appui && appui.type === 'maison' ? appui.id : null, obstacleFeuilles });

  const d = camera.position.distanceTo(position);
  reperage.position.copy(position);
  reperage.scale.setScalar(Math.max(0.01, d * 0.03));
  reperage.material.opacity = Math.min(0.9, Math.max(0, (d - 14) / 40));

  // l'ombre du soleil suit la boule de près, couvre l'arbre de loin
  const s = ciel.soleil;
  const e = Math.min(260, Math.max(12, d * 3));
  const centre = d > 60 ? cam.centreArbre : position;
  s.position.copy(centre).addScaledVector(DIRECTION_SOLEIL, 400);
  s.target.position.copy(centre);
  s.target.updateMatrixWorld();
  const sc = s.shadow.camera;
  if (Math.abs(sc.right - e) > 0.5) { sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.far = 900; sc.updateProjectionMatrix(); }

  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
}

function boucle() {
  requestAnimationFrame(boucle);
  rendre(Math.min(0.05, horloge.getDelta()));
}

// ---------- démarrage ----------
const n0 = Math.max(1, Number(params.get('n') || 1));
arrivees(n0, 1e9);
derniersEvenements = arbre.evenements.length;
majBranches(0, 1e9);
maisons.synchroniser();
maisons.terminer();
batirTroncHaut();
majCompteurs();
chezMoi();
el('chargement').classList.add('cache');
if (!pause) boucle();

// Accès pour les essais automatiques
window.__monde = {
  arbre,
  sol,
  marcheur,
  cam,
  commandes,
  rendre: (n = 1, dt = 0.016) => { for (let i = 0; i < n; i++) rendre(dt); },
  grandir: (n) => { arrivees(n, 1e9); majBranches(0, 1e9); maisons.synchroniser(arbre.chemins.map((c) => c.id)); maisons.terminer(); batirTroncHaut(); majCompteurs(); },
  // marcher dans une direction relative à la caméra (avant = +y, droite = +x)
  marcher: (mx, my, secondes, dt = 0.05) => {
    for (let i = 0; i < Math.ceil(secondes / dt); i++) {
      const { avant, droite } = cam.axes();
      const v = Math.min(30, Math.max(1.6, cam.distance * 1.5));
      const x0 = marcheur.p[0];
      const z0 = marcheur.p[2];
      marcheur.deplacer((avant.x * my + droite.x * mx) * v * dt, (avant.z * my + droite.z * mx) * v * dt);
      cam.suivreDirection(marcheur.p[0] - x0, marcheur.p[2] - z0, Math.max(0, my), dt, 1e9);
    }
    position.set(...marcheur.p);
  },
  poser: (x, y, z, lacet) => { marcheur.poser(x, y, z); position.set(...marcheur.p); if (lacet !== undefined) cam.lacet = lacet; },
  chezMoi,
  vue: (distance, tangage, lacet) => { cam.voulue = cam.distance = distance; if (tangage !== undefined) cam.tangage = tangage; if (lacet !== undefined) cam.lacet = lacet; },
  pretes: true,
};
