// L'arbre géant en 3D. Chaque tige est un cylindre entre deux nœuds, chaque nœud une sphère.
// Les instances sont rangées par rang de croissance : les nœuds poussés forment le début du tableau,
// donc « mesh.count = K » suffit à ne dessiner que ce qui a poussé.
// La croissance est animée : une branche s'allonge depuis son parent, puis gonfle avec son poids.
import * as THREE from 'three';
import { placerFeuille, TAILLE_FEUILLE } from '../../shared/geometrie.js';
import { facteurEpaisseur } from '../../shared/regles.js';
import { rampeToon } from '../decor.js';

const CONTOUR = 1.12; // épaisseur du trait autour des formes (effet dessin)
const MAX_FEUILLES = 6000;
const TEINTE_BASE = 0.2; // les feuilles restent dans les verts et les jaune-vert
const TEINTE_ETENDUE = 0.18;
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const IDENTITE = new THREE.Quaternion();
const MINI = 0.001;

const amort = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Petit dépassement à l'arrivée d'une feuille (effet « pop »)
function rebond(x) {
  const c = 1.70158;
  const u = x - 1;
  return Math.max(0, 1 + (c + 1) * u * u * u + c * u * u);
}

// Feuille unitaire le long de +Y : une goutte pointue, un peu épaisse pour que le contour se voie
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

export function creerArbre3D(scene, arbre) {
  const { N, noeuds, parRang, capitale } = arbre;
  const rampe = rampeToon();

  // Position, direction et longueur de la tige qui arrive à chaque nœud (depuis son parent)
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
  const geoCylindre = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const geoSphere = new THREE.SphereGeometry(1, 7, 5);
  const matBois = new THREE.MeshToonMaterial({ color: 0xa26f45, gradientMap: rampe });
  const matTrait = new THREE.MeshBasicMaterial({ color: 0x3b2516, side: THREE.BackSide });

  const tiges = new THREE.InstancedMesh(geoCylindre, matBois, N);
  const jointures = new THREE.InstancedMesh(geoSphere, matBois, N);
  const contourTiges = new THREE.InstancedMesh(geoCylindre, matTrait, N);
  const contourJointures = new THREE.InstancedMesh(geoSphere, matTrait, N);
  contourTiges.raycast = () => {}; // les contours ne sont jamais cliquables
  contourJointures.raycast = () => {};
  for (const mesh of [tiges, jointures, contourTiges, contourJointures]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  // ---------- la capitale : une plateforme dorée au sommet du tronc ----------
  const sommet = pos[capitale];
  const socle = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 11, 6, 48),
    new THREE.MeshToonMaterial({ color: 0xffd45e, gradientMap: rampe }),
  );
  socle.position.copy(sommet);
  const anneau = new THREE.Mesh(
    new THREE.TorusGeometry(10.5, 0.35, 12, 64),
    new THREE.MeshToonMaterial({ color: 0xfff3b0, gradientMap: rampe }),
  );
  anneau.rotation.x = Math.PI / 2;
  anneau.position.copy(sommet).add(new THREE.Vector3(0, 3, 0));
  const cristal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.4),
    new THREE.MeshToonMaterial({ color: 0xfff6c4, emissive: 0xffb820, gradientMap: rampe }),
  );
  cristal.position.copy(sommet).add(new THREE.Vector3(0, 7, 0));
  scene.add(socle, anneau, cristal);

  // ---------- état de la croissance (indexé par identifiant de nœud) ----------
  const visCible = new Float32Array(N);
  const epCible = new Float32Array(N).fill(1);
  const vis = new Float32Array(N); // 0 → 1 : la branche pousse
  const ep = new Float32Array(N).fill(1); // épaisseur courante (poids des feuilles)
  const actifs = new Set(); // nœuds dont la forme bouge encore
  const rangDe = (id) => noeuds[id].rang;

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
  // Écrit une forme et son contour, un peu plus grand
  function ecrireAvecContour(mesh, contour, i, position, quat, taille) {
    ecrire(mesh, i, position, quat, taille);
    ecrire(contour, i, position, quat, tmp.copy(taille).multiplyScalar(CONTOUR));
  }

  function ecrireNoeud(id) {
    const n = noeuds[id];
    const i = rangDe(id);
    const v = vis[id];
    const rayon = Math.max(MINI, n.rayon * ep[id]);
    ecrireAvecContour(jointures, contourJointures, i, pos[id], IDENTITE, echelle.setScalar(Math.max(MINI, rayon * 1.08 * v)));
    if (n.parent < 0) {
      ecrireAvecContour(tiges, contourTiges, i, pos[id], IDENTITE, echelle.set(MINI, MINI, MINI));
    } else {
      // La tige s'allonge depuis le parent et s'épaissit avec le poids de ses feuilles
      const L = Math.max(MINI, segLong[id] * v);
      const rv = Math.max(MINI, rayon * v);
      centre.copy(pos[n.parent]).addScaledVector(segDir[id], L / 2);
      ecrireAvecContour(tiges, contourTiges, i, centre, segQuat[id], echelle.set(rv, L, rv));
    }
  }

  // Met à jour la croissance : le nombre de nœuds visibles et l'épaisseur selon les poids
  function majCroissance(nbVisibles, poids) {
    for (let r = 0; r < N; r++) {
      const id = parRang[r];
      const cible = r < nbVisibles ? 1 : 0;
      if (visCible[id] !== cible) {
        visCible[id] = cible;
        actifs.add(id);
      }
    }
    for (let id = 0; id < N; id++) {
      const e = facteurEpaisseur(poids[id] || 0);
      if (epCible[id] !== e) {
        epCible[id] = e;
        actifs.add(id);
      }
    }
    const nb = Math.min(N, nbVisibles);
    for (const mesh of [tiges, jointures, contourTiges, contourJointures]) mesh.count = nb;
  }

  // ---------- feuilles (une par personne) ----------
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
  scene.add(feuilles, contourFeuilles);

  const liste = []; // feuilles, dans l'ordre de leurs instances
  const parId = new Map();

  // Ajoute une feuille (idempotent). Renvoie true si elle vient d'être ajoutée.
  function ajouterFeuille(f) {
    if (parId.has(f.id) || liste.length >= MAX_FEUILLES) return false;
    const g = placerFeuille(arbre, f.noeud, f.emplacement);
    const base = new THREE.Vector3(...g.base);
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...g.side),
        new THREE.Vector3(...g.dir),
        new THREE.Vector3(...g.normal),
      ),
    );
    const entree = { id: f.id, idx: liste.length, noeud: f.noeud, pseudo: f.pseudo, utilisateurId: f.utilisateurId, base, quat, pop: 0 };
    liste.push(entree);
    parId.set(f.id, entree);
    feuilles.count = liste.length;
    contourFeuilles.count = liste.length;
    const teinte = TEINTE_BASE + (f.teinte / 360) * TEINTE_ETENDUE;
    feuilles.setColorAt(entree.idx, new THREE.Color().setHSL(teinte, 0.62, 0.6));
    feuilles.instanceColor.needsUpdate = true;
    return true;
  }

  // ---------- animation ----------
  function update(dt, t) {
    if (actifs.size) {
      for (const id of actifs) {
        vis[id] = amort(vis[id], visCible[id], 3, dt);
        ep[id] = amort(ep[id], epCible[id], 2, dt);
        if (Math.abs(vis[id] - visCible[id]) < 1e-3 && Math.abs(ep[id] - epCible[id]) < 1e-3) {
          vis[id] = visCible[id];
          ep[id] = epCible[id];
          actifs.delete(id);
        }
        ecrireNoeud(id);
      }
      for (const mesh of [tiges, jointures, contourTiges, contourJointures]) mesh.instanceMatrix.needsUpdate = true;
    }

    if (liste.length) {
      for (const f of liste) {
        f.pop = Math.min(1, f.pop + dt * 1.8);
        const e = TAILLE_FEUILLE * rebond(f.pop);
        balancement.setFromAxisAngle(X, Math.sin(t * 1.3 + f.id * 0.7) * 0.03);
        orientation.copy(f.quat).multiply(balancement);
        echelle.set(e, e, e);
        ecrireAvecContour(feuilles, contourFeuilles, f.idx, f.base, orientation, echelle);
      }
      feuilles.instanceMatrix.needsUpdate = true;
      contourFeuilles.instanceMatrix.needsUpdate = true;
    }

    cristal.position.y = sommet.y + 7 + Math.sin(t * 2) * 0.4;
    cristal.rotation.y = t * 0.9;
  }

  // ---------- clic et survol ----------
  const rayon = new THREE.Raycaster();
  const souris = new THREE.Vector2();
  // Renvoie ce qui se trouve sous le pointeur : { type: 'feuille' | 'noeud', id } ou null
  function choisir(camera, x, y, rect) {
    souris.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    rayon.setFromCamera(souris, camera);
    for (const mesh of [feuilles, tiges, jointures]) mesh.boundingSphere = null;
    const touches = rayon.intersectObjects([feuilles, jointures, tiges, socle], false);
    for (const h of touches) {
      if (h.object === feuilles) return { type: 'feuille', id: liste[h.instanceId].id };
      if (h.object === socle) return { type: 'noeud', id: capitale };
      if (h.object === tiges || h.object === jointures) return { type: 'noeud', id: parRang[h.instanceId] };
    }
    return null;
  }

  // Distance jusqu'au premier rameau coupant le rayon (origine, direction), ou null.
  // Les feuilles ne bloquent pas la caméra ; un petit rayon autour de l'origine est ignoré.
  const rayonCamera = new THREE.Raycaster();
  function obstacle(origine, direction, longueurMax) {
    rayonCamera.set(new THREE.Vector3(...origine), new THREE.Vector3(...direction));
    rayonCamera.far = longueurMax;
    for (const mesh of [tiges, jointures]) mesh.boundingSphere = null;
    const touches = rayonCamera.intersectObjects([tiges, jointures], false);
    for (const h of touches) if (h.distance > 0.8) return h.distance;
    return null;
  }

  return {
    majCroissance,
    ajouterFeuille,
    update,
    choisir,
    obstacle,
    entreeFeuille: (id) => parId.get(id) || null,
    positionCapitale: () => sommet.clone(),
  };
}
