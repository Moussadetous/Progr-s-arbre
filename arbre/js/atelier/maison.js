// La maison-feuille : un dôme de feuille, un auvent en feuille arquée au-dessus de la porte,
// un plancher en bois avec porche, un lit, un tapis, une plante, une lampe et des lanternes.
// Toutes les maisons sont des instances (une seule géométrie par pièce) : c'est léger.
import * as THREE from 'three';
import { fusionner, v3 } from './utils.js';
import { textureFeuille, textureBois } from './textures.js';

const MAX_MAISONS = 200;
const pop = (x) => { const c = 1.70158; const u = x - 1; return Math.max(0, 1 + (c + 1) * u * u * u + c * u * u); };

// ---------- pièces ----------

// Dôme : une demi-sphère ouverte sur le devant (+Z), penchée vers l'avant comme un capuchon
function geoDome() {
  const g = new THREE.SphereGeometry(1, 44, 30, 2.44, 4.54, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 1.85;
    const y = p.getY(i) * 1.5;
    const z = p.getZ(i) * 2.1 + 0.5 * p.getY(i);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// Auvent : une grande feuille pointue, arquée au-dessus de la porte, bord relevé en gouttière
function geoAuvent() {
  const L = 3.5;
  const g = new THREE.PlaneGeometry(1, 1, 14, 26);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2; // -1..1 en largeur
    const v = p.getY(i) + 0.5; // 0..1 en longueur
    const demi = 1.55 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + v * 0.96)), 0.75);
    const y = 2.05 + 0.95 * Math.sin(Math.PI * v * 0.8) - 0.55 * v * v * v - 0.38 * u * u * (0.4 + v);
    const z = -0.7 + L * v;
    p.setXYZ(i, u * demi, y, z);
  }
  g.computeVertexNormals();
  return g;
}

const M = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
  new THREE.Vector3(sx, sy, sz),
);

// Meubles : tout est fusionné en une seule géométrie, avec des couleurs de sommets
function geoMeubles() {
  const boite = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 20);
  const sph = new THREE.SphereGeometry(1, 14, 10);
  const pieces = [
    // lit : cadre en bois, matelas, couverture, oreillers
    { geo: boite, matrice: M(-0.75, 0.4, -0.55, 1.5, 0.3, 0.95), couleur: 0xb98a58 },
    { geo: boite, matrice: M(-0.75, 0.62, -0.55, 1.42, 0.2, 0.88), couleur: 0xf0e2c8 },
    { geo: boite, matrice: M(-0.45, 0.74, -0.55, 0.95, 0.07, 0.9), couleur: 0x6a56a0 },
    { geo: sph, matrice: M(-1.25, 0.8, -0.8, 0.28, 0.12, 0.2), couleur: 0xfff3dc },
    { geo: sph, matrice: M(-1.25, 0.8, -0.3, 0.28, 0.12, 0.2), couleur: 0xfff3dc },
    // table de chevet et pied de lampe
    { geo: boite, matrice: M(-1.15, 0.38, 0.4, 0.5, 0.45, 0.5), couleur: 0x9c6c3e },
    { geo: cyl, matrice: M(-1.15, 0.78, 0.4, 0.05, 0.3, 0.05), couleur: 0x4a3322 },
    // tapis
    { geo: cyl, matrice: M(0.45, 0.19, 0.45, 0.95, 0.025, 0.95), couleur: 0xc4553d },
    { geo: cyl, matrice: M(0.45, 0.205, 0.45, 0.62, 0.02, 0.62), couleur: 0xf0c987 },
    // plante en pot
    { geo: cyl, matrice: M(1.15, 0.38, -0.5, 0.24, 0.24, 0.24), couleur: 0xb4623a },
    { geo: sph, matrice: M(1.15, 0.78, -0.5, 0.34, 0.3, 0.34), couleur: 0x4d9a34 },
    { geo: sph, matrice: M(1.05, 0.96, -0.42, 0.22, 0.2, 0.22), couleur: 0x68b84a },
    // coussins sur le porche
    { geo: sph, matrice: M(-0.85, 0.34, 2.15, 0.34, 0.15, 0.3), couleur: 0xd98a52 },
    { geo: sph, matrice: M(-0.35, 0.34, 2.35, 0.3, 0.14, 0.28), couleur: 0xe9c07a },
    // poteaux du porche
    { geo: cyl, matrice: M(-1.35, 0.7, 2.7, 0.06, 0.6, 0.06), couleur: 0x6b4a2c },
    { geo: cyl, matrice: M(1.35, 0.7, 2.7, 0.06, 0.6, 0.06), couleur: 0x6b4a2c },
  ];
  return fusionner(pieces);
}

// Plancher : disque + porche, en bois clair (la texture donne les planches)
function geoPlancher() {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 36);
  const boite = new THREE.BoxGeometry(1, 1, 1);
  return fusionner([
    { geo: cyl, matrice: M(0, -0.12, 0, 2.3, 0.7, 2.3), couleur: 0xffffff },
    { geo: boite, matrice: M(0, 0.04, 2.35, 2.7, 0.24, 1.7), couleur: 0xf2e6d8 },
  ]);
}

// Lumières : abat-jour de la lampe et lanternes du porche (émissives, elles brillent avec le bloom)
function geoLumieres() {
  const sph = new THREE.SphereGeometry(1, 14, 10);
  return fusionner([
    { geo: sph, matrice: M(-1.15, 1.2, 0.4, 0.26, 0.24, 0.26), couleur: 0xffffff },
    { geo: sph, matrice: M(-1.35, 1.38, 2.7, 0.15, 0.17, 0.15), couleur: 0xffffff },
    { geo: sph, matrice: M(1.35, 1.38, 2.7, 0.15, 0.17, 0.15), couleur: 0xffffff },
  ]);
}

// ---------- la collection de maisons ----------

export class Maisons {
  constructor(scene, { qualite = 'haute' } = {}) {
    this.scene = scene;
    const leaf = textureFeuille();
    const matFeuille = new THREE.MeshStandardMaterial({
      map: leaf, color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide,
      emissive: 0x8a4e10, emissiveIntensity: 0.28,
    });
    const matAuvent = new THREE.MeshStandardMaterial({ map: leaf, roughness: 0.5, side: THREE.DoubleSide });
    const bois = textureBois();
    bois.repeat.set(1.6, 1.6);
    const matBois = new THREE.MeshStandardMaterial({ map: bois, vertexColors: true, roughness: 0.75 });
    const matMeubles = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const matLumiere = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.22).multiplyScalar(2.2), toneMapped: false });

    const parties = [
      [geoDome(), matFeuille], [geoAuvent(), matAuvent], [geoPlancher(), matBois],
      [geoMeubles(), matMeubles], [geoLumieres(), matLumiere],
    ];
    this.meshes = parties.map(([geo, mat]) => {
      const m = new THREE.InstancedMesh(geo, mat, MAX_MAISONS);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = qualite !== 'basse' && mat !== matLumiere;
      m.receiveShadow = qualite !== 'basse' && mat !== matLumiere;
      scene.add(m);
      return m;
    });
    this.liste = []; // { placement, pop, matrice }
    this.lumiere = null; // lumière intérieure de la première maison
    this.m = new THREE.Matrix4();
    this.base = new THREE.Matrix4();
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
  }

  get nombre() {
    return this.liste.length;
  }

  // Ajoute une maison à l'emplacement calculé par le placement (animation d'apparition)
  ajouter(placement, { instantane = false } = {}) {
    if (this.liste.length >= MAX_MAISONS) return -1;
    const y = v3(placement.normale);
    const z = v3(placement.front).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const base = new THREE.Matrix4().makeBasis(x, y, z).setPosition(v3(placement.pos));
    const idx = this.liste.length;
    this.liste.push({ placement, pop: instantane ? 1 : 0, base });
    for (const mesh of this.meshes) mesh.count = this.liste.length;
    this.ecrire(idx);
    if (idx === 0) {
      // La première maison éclaire son intérieur : lampe, coin du lit, porche
      const monde = (px, py, pz) => new THREE.Vector3(px, py, pz).multiplyScalar(placement.echelle).applyMatrix4(base);
      this.lumiere = new THREE.PointLight(0xffa850, 11, 13, 1.7);
      this.lumiere.position.copy(monde(-0.5, 1.25, 0.2));
      this.scene.add(this.lumiere);
      this.lumierePorche = new THREE.PointLight(0xffb866, 4, 9, 1.8);
      this.lumierePorche.position.copy(monde(0, 1.5, 2.7));
      this.scene.add(this.lumierePorche);
    }
    return idx;
  }

  ecrire(i) {
    const h = this.liste[i];
    const e = h.placement.echelle * (h.pop >= 1 ? 1 : pop(h.pop));
    this.s.set(e, e, e);
    this.v.setFromMatrixPosition(h.base);
    this.q.setFromRotationMatrix(h.base);
    this.m.compose(this.v, this.q, this.s);
    for (const mesh of this.meshes) mesh.setMatrixAt(i, this.m);
  }

  update(dt) {
    let change = false;
    for (let i = 0; i < this.liste.length; i++) {
      const h = this.liste[i];
      if (h.pop < 1) {
        h.pop = Math.min(1, h.pop + dt * 1.2);
        this.ecrire(i);
        change = true;
      }
    }
    if (change) for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  // Termine toutes les animations (pour les captures d'écran)
  terminer() {
    for (const h of this.liste) h.pop = 1;
    for (let i = 0; i < this.liste.length; i++) this.ecrire(i);
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  // Point du monde situé dans le repère d'une maison (x : côté, y : haut, z : devant), à son échelle
  pointLocal(i, x, y, z) {
    const h = this.liste[i];
    return new THREE.Vector3(x, y, z).multiplyScalar(h.placement.echelle).applyMatrix4(h.base);
  }
}
