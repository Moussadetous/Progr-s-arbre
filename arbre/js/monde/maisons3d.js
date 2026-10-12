// Les feuilles-maisons en 3D : une seule grande feuille enroulée par personne (instances), une lanterne-graine
// suspendue sous le toit. Les maisons suivent leur branche quand elle s'épaissit, et apparaissent en poussant.
import * as THREE from 'three';
import * as MAISON from '../../shared/maison.js';
import { textureFeuille } from './textures.js';

const MAX = 8000;
const pousse = (x) => { const c = 1.70158; const u = x - 1; return Math.max(0.001, 1 + (c + 1) * u * u * u + c * u * u); };

function geoFeuille() {
  const g = new THREE.PlaneGeometry(1, 1, 14, 48);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;
    const v = p.getY(i) + 0.5;
    const q = MAISON.pointFeuille(u, v);
    p.setXYZ(i, q[0], q[1], q[2]);
    uv.setXY(i, u * 0.5 + 0.5, v);
  }
  g.computeVertexNormals();
  return g;
}

export class Maisons3d {
  constructor(scene, arbre, { qualite = 'haute' } = {}) {
    this.arbre = arbre;
    this.feuilles = new THREE.InstancedMesh(
      geoFeuille(),
      new THREE.MeshStandardMaterial({ map: textureFeuille(), side: THREE.DoubleSide, roughness: 0.55, emissive: 0x23400c, emissiveIntensity: 0.35 }),
      MAX,
    );
    this.lanternes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.17, 14, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.22).multiplyScalar(2.6), toneMapped: false }),
      MAX,
    );
    for (const m of [this.feuilles, this.lanternes]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.feuilles.castShadow = qualite !== 'basse';
    this.feuilles.receiveShadow = qualite !== 'basse';
    this.etat = []; // par maison : { pop }
    this.parChemin = new Map();
    this.aMettreAJour = new Set();
    this.mat = new THREE.Matrix4();
    this.base = new THREE.Matrix4();
    this.ech = new THREE.Matrix4();
    this.lumiereChezMoi = new THREE.PointLight(0xffa850, 6, 7, 1.8);
    scene.add(this.lumiereChezMoi);
  }

  couleur(i) {
    if (i === 0) return new THREE.Color(1.12, 1.04, 0.62);
    const h = (i * 0.6180339) % 1;
    return new THREE.Color().setHSL(0.2 + h * 0.13, 0.55 + 0.25 * ((i * 7) % 3) / 2, 0.82 + ((i * 11) % 5) * 0.03);
  }

  // Nouvelles maisons, et maisons des chemins qui ont changé d'épaisseur
  synchroniser(cheminsChanges = []) {
    const ms = this.arbre.maisons;
    for (let i = this.etat.length; i < ms.length; i++) {
      this.etat.push({ pop: 0 });
      const l = this.parChemin.get(ms[i].chemin) || [];
      l.push(i);
      this.parChemin.set(ms[i].chemin, l);
      this.feuilles.setColorAt(i, this.couleur(i));
      this.aMettreAJour.add(i);
    }
    this.feuilles.count = this.lanternes.count = ms.length;
    if (this.feuilles.instanceColor) this.feuilles.instanceColor.needsUpdate = true;
    for (const id of cheminsChanges) for (const i of this.parChemin.get(id) || []) this.aMettreAJour.add(i);
  }

  ecrire(i) {
    const m = this.arbre.maisons[i];
    const r = this.arbre.repereMaison(m);
    const e = pousse(Math.min(1, this.etat[i].pop));
    this.base.makeBasis(new THREE.Vector3(...r.X), new THREE.Vector3(...r.Y), new THREE.Vector3(...r.Z));
    this.base.setPosition(r.O[0], r.O[1], r.O[2]);
    this.mat.copy(this.base).multiply(this.ech.makeScale(e, e, e));
    this.feuilles.setMatrixAt(i, this.mat);
    const L = MAISON.LANTERNE;
    this.mat.copy(this.base).multiply(this.ech.makeTranslation(L[0] * e, L[1] * e, L[2] * e)).multiply(this.ech.makeScale(e, e, e));
    this.lanternes.setMatrixAt(i, this.mat);
    if (i === 0) {
      const p = this.arbre.versMonde(r, [0, 1.6, 1.6]);
      this.lumiereChezMoi.position.set(p[0], p[1], p[2]);
    }
  }

  update(dt) {
    for (let i = 0; i < this.etat.length; i++) {
      if (this.etat[i].pop < 1) {
        this.etat[i].pop = Math.min(1, this.etat[i].pop + dt * 1.6);
        this.aMettreAJour.add(i);
      }
    }
    if (!this.aMettreAJour.size) return;
    for (const i of this.aMettreAJour) this.ecrire(i);
    this.aMettreAJour.clear();
    this.feuilles.instanceMatrix.needsUpdate = true;
    this.lanternes.instanceMatrix.needsUpdate = true;
  }

  terminer() {
    for (const e of this.etat) e.pop = 1;
    for (let i = 0; i < this.etat.length; i++) this.aMettreAJour.add(i);
    this.update(0);
  }
}
