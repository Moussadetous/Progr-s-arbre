// L'arbre en 3D : tronc, branches, nœuds, feuilles et capitale.
// Une branche est un cylindre entre deux nœuds, avec une sphère à chaque nœud.
// Tout passe par des InstancedMesh (peu d'appels de dessin). La croissance est animée :
// un rameau pousse depuis son parent, puis gonfle avec le poids des feuilles qu'il porte.
import * as THREE from 'three';
import { genererArbre } from '/shared/treegen.js';
import { facteurEpaisseur } from '/shared/regles.js';
import { rampeToon } from './cartoon.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const IDENTITE = new THREE.Quaternion();
const CONTOUR = 1.12; // épaisseur du trait autour des formes (effet dessin)
const TAILLE_FEUILLE = 0.85;
const MAX_FEUILLES = 4000;
const TEINTE_BASE = 0.2; // les feuilles restent dans les verts et les jaune-vert
const TEINTE_ETENDUE = 0.18;

const amort = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Petit dépassement à l'arrivée d'une feuille (effet "pop")
function rebond(x) {
  const c = 1.70158;
  const u = x - 1;
  return Math.max(0, 1 + (c + 1) * u * u * u + c * u * u);
}

// Feuille unitaire le long de +Y : une goutte pointue, avec un peu d'épaisseur pour que le contour se voie
function geometrieFeuille() {
  const forme = new THREE.Shape();
  forme.moveTo(0, 0);
  forme.bezierCurveTo(0.42, 0.18, 0.36, 0.78, 0, 1);
  forme.bezierCurveTo(-0.36, 0.78, -0.42, 0.18, 0, 0);
  const g = new THREE.ExtrudeGeometry(forme, {
    depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10,
  });
  g.translate(0, 0, -0.02);
  return g;
}

export function creerArbre3D(scene) {
  const arbre = genererArbre(); // même graine que le serveur : même arbre
  const { noeuds, capitale } = arbre;
  const N = noeuds.length;
  const rampe = rampeToon();

  // Position de chaque nœud, et direction + longueur du segment qui y arrive depuis son parent
  const pos = noeuds.map((n) => new THREE.Vector3(n.pos[0], n.pos[1], n.pos[2]));
  const segDir = noeuds.map(() => new THREE.Vector3(0, 1, 0));
  const segQuat = noeuds.map(() => new THREE.Quaternion());
  const segLong = new Float32Array(N);
  for (const n of noeuds) {
    if (n.parent < 0) continue;
    const d = new THREE.Vector3().subVectors(pos[n.id], pos[n.parent]);
    segLong[n.id] = d.length();
    segDir[n.id] = d.clone().normalize();
    segQuat[n.id] = new THREE.Quaternion().setFromUnitVectors(Y, segDir[n.id]);
  }

  // ---------- écorce ----------
  const geoCylindre = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const geoSphere = new THREE.SphereGeometry(1, 14, 10);
  const matBois = new THREE.MeshToonMaterial({ color: 0xa26f45, gradientMap: rampe });
  const matTrait = new THREE.MeshBasicMaterial({ color: 0x3b2516, side: THREE.BackSide });

  const tiges = new THREE.InstancedMesh(geoCylindre, matBois, N);
  const jointures = new THREE.InstancedMesh(geoSphere, matBois, N);
  const contourTiges = new THREE.InstancedMesh(geoCylindre, matTrait, N);
  const contourJointures = new THREE.InstancedMesh(geoSphere, matTrait, N);
  contourTiges.raycast = () => {}; // les contours ne sont jamais cliquables
  contourJointures.raycast = () => {};
  for (const mesh of [tiges, jointures, contourTiges, contourJointures]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------- feuilles (une par utilisateur) ----------
  const geoFeuille = geometrieFeuille();
  const feuilles = new THREE.InstancedMesh(
    geoFeuille,
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe, side: THREE.DoubleSide }),
    MAX_FEUILLES,
  );
  const contourFeuilles = new THREE.InstancedMesh(
    geoFeuille,
    new THREE.MeshBasicMaterial({ color: 0x23481c, side: THREE.BackSide }),
    MAX_FEUILLES,
  );
  contourFeuilles.raycast = () => {};
  feuilles.count = 0;
  contourFeuilles.count = 0;
  feuilles.frustumCulled = false;
  contourFeuilles.frustumCulled = false;
  scene.add(feuilles);
  scene.add(contourFeuilles);

  // ---------- capitale : un socle doré au sommet du tronc ----------
  const centreCapitale = pos[capitale];
  const socle = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.3, 0.4, 40),
    new THREE.MeshToonMaterial({ color: 0xffd45e, gradientMap: rampe }),
  );
  socle.position.copy(centreCapitale).add(new THREE.Vector3(0, 0.05, 0));
  const anneau = new THREE.Mesh(
    new THREE.TorusGeometry(2.05, 0.11, 12, 56),
    new THREE.MeshToonMaterial({ color: 0xfff3b0, gradientMap: rampe }),
  );
  anneau.rotation.x = Math.PI / 2;
  anneau.position.copy(socle.position).add(new THREE.Vector3(0, 0.22, 0));
  const cristal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5),
    new THREE.MeshToonMaterial({ color: 0xfff6c4, emissive: 0xffb820, gradientMap: rampe }),
  );
  cristal.position.copy(centreCapitale).add(new THREE.Vector3(0, 1.6, 0));
  scene.add(socle, anneau, cristal);

  // ---------- état de la croissance ----------
  const visCible = new Float32Array(N);
  const epCible = new Float32Array(N).fill(1);
  const vis = new Float32Array(N); // 0 → 1 : le rameau pousse
  const ep = new Float32Array(N).fill(1); // épaisseur courante
  let K = 0; // nombre de nœuds visibles
  const liste = []; // feuilles, dans l'ordre de leurs instances
  const parId = new Map();

  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const echelle = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const balancement = new THREE.Quaternion();

  function ecrire(mesh, i, position, quat, taille) {
    m.compose(position, quat, taille);
    mesh.setMatrixAt(i, m);
  }
  // Écrit une forme et son contour, plus grand, derrière elle
  function ecrireAvecContour(mesh, contour, i, position, quat, taille) {
    ecrire(mesh, i, position, quat, taille);
    ecrire(contour, i, position, quat, tmp.copy(taille).multiplyScalar(CONTOUR));
  }

  // Orientation d'une feuille posée sur un rameau : elle sort vers l'extérieur et vers le haut
  function placer(f) {
    const n = noeuds[f.noeud];
    const t = segDir[n.id];
    let cote = new THREE.Vector3().crossVectors(t, Y);
    if (cote.lengthSq() < 1e-4) cote = new THREE.Vector3().crossVectors(t, X);
    cote.normalize();
    const haut = new THREE.Vector3().crossVectors(cote, t).normalize();
    const angle = f.emplacement * 2.399 + f.noeud * 0.9; // angle d'or : les feuilles s'éparpillent
    const radial = new THREE.Vector3().addScaledVector(cote, Math.cos(angle)).addScaledVector(haut, Math.sin(angle));
    const dir = new THREE.Vector3()
      .addScaledVector(radial, 0.75)
      .addScaledVector(t, 0.2)
      .addScaledVector(Y, 0.55)
      .normalize();
    const base = pos[n.id].clone().addScaledVector(radial, n.rayon * 0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(Y, angle));
    return { base, quat, dir };
  }

  // Appelé à chaque changement du monde (nouvel utilisateur, nouvelle vidéo…)
  function majCroissance({ noeudsVisibles, poids }) {
    K = noeudsVisibles;
    for (const n of noeuds) {
      visCible[n.id] = n.ordre < K ? 1 : 0;
      epCible[n.id] = facteurEpaisseur(poids[n.id] || 0);
    }
  }

  // Ajoute une feuille (si elle n'est pas déjà là). Renvoie true si elle vient d'être ajoutée.
  function ajouterFeuille(f) {
    if (parId.has(f.id) || liste.length >= MAX_FEUILLES) return false;
    const { base, quat, dir } = placer(f);
    const entree = {
      id: f.id, idx: liste.length, noeud: f.noeud, pseudo: f.pseudo, utilisateurId: f.utilisateurId,
      base, quat, dir, pop: 0,
    };
    liste.push(entree);
    parId.set(f.id, entree);
    feuilles.count = liste.length;
    contourFeuilles.count = liste.length;
    const teinte = TEINTE_BASE + (f.teinte / 360) * TEINTE_ETENDUE;
    feuilles.setColorAt(entree.idx, new THREE.Color().setHSL(teinte, 0.62, 0.6));
    feuilles.instanceColor.needsUpdate = true;
    return true;
  }

  function update(dt, t) {
    for (let i = 0; i < N; i++) {
      vis[i] = amort(vis[i], visCible[i], 2.5, dt);
      ep[i] = amort(ep[i], epCible[i], 1.5, dt);
      const v = vis[i];
      const n = noeuds[i];
      const r = Math.max(0.0005, n.rayon * ep[i]);

      // jointure : grossit avec la branche
      ecrireAvecContour(jointures, contourJointures, i, pos[i], IDENTITE, echelle.setScalar(Math.max(0.0005, r * 1.08 * v)));

      // tige : part du parent, s'allonge et s'épaissit jusqu'au nœud
      if (n.parent < 0) {
        ecrireAvecContour(tiges, contourTiges, i, pos[i], IDENTITE, echelle.set(0.0005, 0.0005, 0.0005));
      } else {
        const L = Math.max(0.0005, segLong[i] * v);
        const rv = Math.max(0.0005, r * v);
        centre.copy(pos[n.parent]).addScaledVector(segDir[i], L / 2);
        ecrireAvecContour(tiges, contourTiges, i, centre, segQuat[i], echelle.set(rv, L, rv));
      }
    }

    // feuilles : arrivée en "pop", et un léger balancement au vent
    for (const f of liste) {
      f.pop = Math.min(1, f.pop + dt * 1.8);
      const e = TAILLE_FEUILLE * rebond(f.pop);
      balancement.setFromAxisAngle(X, Math.sin(t * 1.3 + f.id * 0.7) * 0.07);
      orientation.copy(f.quat).multiply(balancement);
      ecrireAvecContour(feuilles, contourFeuilles, f.idx, f.base, orientation, echelle.set(e, e, e));
    }

    for (const mesh of [tiges, jointures, contourTiges, contourJointures, feuilles, contourFeuilles]) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    cristal.position.y = centreCapitale.y + 1.6 + Math.sin(t * 2) * 0.12;
    cristal.rotation.y = t * 0.9;
  }

  // Ce qui se trouve sous le pointeur : une feuille, un nœud ou la capitale
  const rayon = new THREE.Raycaster();
  const souris = new THREE.Vector2();
  function choisir(camera, x, y, rect) {
    souris.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    rayon.setFromCamera(souris, camera);
    // les sphères englobantes des InstancedMesh changent : on les recalcule
    for (const mesh of [feuilles, tiges, jointures]) mesh.boundingSphere = null;
    const touches = rayon.intersectObjects([feuilles, jointures, tiges, socle], false);
    for (const h of touches) {
      if (h.object === feuilles) return { type: 'feuille', id: liste[h.instanceId].id };
      if (h.object === socle) return { type: 'noeud', id: capitale };
      if (h.object === tiges || h.object === jointures) return { type: 'noeud', id: h.instanceId };
    }
    return null;
  }

  return {
    N,
    noeuds,
    capitale,
    liste: () => liste,
    majCroissance,
    ajouterFeuille,
    update,
    choisir,
    visible: (i) => noeuds[i].ordre < K,
    positionNoeud: (i) => pos[i].clone(),
    entreeFeuille: (id) => parId.get(id) || null,
    posFeuille: (id) => {
      const e = parId.get(id);
      return e.base.clone().addScaledVector(e.dir, TAILLE_FEUILLE * 0.5);
    },
    centreCapitale: () => centreCapitale.clone(),
  };
}
