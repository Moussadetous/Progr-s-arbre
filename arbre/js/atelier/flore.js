// La vie sur les branches : touffes de fougères, jardins autour des maisons, lianes, lanternes, halos.
import * as THREE from 'three';
import { repereA, pointSurface } from '../../shared/squelette.js';
import { mulberry32 } from '../../shared/arbre.js';
import { fusionner, v3 } from './utils.js';
import { textureFeuille, textureHalo } from './textures.js';

const MAX_TOUFFES = 1400;

// Une lame de feuille arquée, utilisée pour les touffes et les lianes
function geoLame(longueur = 1.4, largeur = 0.34, arc = 0.55) {
  const g = new THREE.PlaneGeometry(1, 1, 3, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;
    const v = p.getY(i) + 0.5;
    const demi = largeur * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + v * 0.95)), 0.7);
    p.setXYZ(i, u * demi, v * longueur * (1 - 0.25 * v), arc * v * v * longueur * 0.6);
  }
  g.computeVertexNormals();
  return g;
}

// Une touffe : une couronne de lames, du centre vers l'extérieur
function geoTouffe() {
  const lame = geoLame();
  const pieces = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 2) * 0.2;
    const incl = 0.35 + (i % 3) * 0.28;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-incl - 0.5, a, 0, 'YXZ')),
      new THREE.Vector3(1, 0.7 + (i % 4) * 0.18, 1),
    );
    pieces.push({ geo: lame, matrice: m, couleur: 0xffffff });
  }
  return fusionner(pieces);
}

export class Flore {
  constructor(scene, squelette, { qualite = 'haute' } = {}) {
    this.scene = scene;
    this.squelette = squelette;
    this.hasard = mulberry32(99);
    const feuille = textureFeuille();
    const mat = new THREE.MeshStandardMaterial({ map: feuille, roughness: 0.55, side: THREE.DoubleSide, vertexColors: true });
    this.touffes = new THREE.InstancedMesh(geoTouffe(), mat, MAX_TOUFFES);
    this.touffes.count = 0;
    this.touffes.frustumCulled = false;
    this.touffes.castShadow = qualite !== 'basse';
    this.touffes.receiveShadow = qualite !== 'basse';
    scene.add(this.touffes);
    this.nTouffes = 0;
    this.positionsTouffes = [];
    this.halos = [];
    this.matHalo = new THREE.SpriteMaterial({
      map: textureHalo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    });
    this.m = new THREE.Matrix4();
    this.qualite = qualite;
  }

  // Place une touffe sur la surface d'une branche (t le long, theta autour)
  touffe(brancheId, t, theta, echelle = 1) {
    if (this.nTouffes >= MAX_TOUFFES) return;
    const b = this.squelette.branches[brancheId];
    const r = repereA(b, t);
    const { pos, normale } = pointSurface(r, theta);
    const n = v3(normale);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.hasard() * 6.28));
    const e = echelle * (0.75 + this.hasard() * 0.9);
    this.m.compose(v3(pos).addScaledVector(n, -0.05), q, new THREE.Vector3(e, e, e));
    this.touffes.setMatrixAt(this.nTouffes, this.m);
    const c = new THREE.Color().setHSL(0.24 + this.hasard() * 0.09, 0.55, 0.42 + this.hasard() * 0.18);
    this.touffes.setColorAt(this.nTouffes, c);
    this.positionsTouffes.push(v3(pos));
    this.nTouffes++;
    this.touffes.count = this.nTouffes;
    this.touffes.instanceMatrix.needsUpdate = true;
    if (this.touffes.instanceColor) this.touffes.instanceColor.needsUpdate = true;
  }

  // Des touffes réparties sur toutes les branches, dessus et flancs
  semer(n = 150) {
    const nb = this.squelette.branches.length;
    for (let i = 0; i < n; i++) {
      const b = Math.floor(this.hasard() * nb);
      const t = 0.1 + this.hasard() * 0.8;
      const theta = (this.hasard() + this.hasard() - 1) * 1.6;
      this.touffe(b, t, theta, 0.9);
    }
  }

  // Un petit jardin autour d'une maison : quelques touffes à la lisière du plancher
  jardin(placement, n = 5) {
    const b = this.squelette.branches[placement.branche];
    const rayonBranche = Math.max(0.8, placement.rayonBranche);
    for (let i = 0; i < n; i++) {
      const a = this.hasard() * Math.PI * 2;
      const d = (2.35 + this.hasard() * 0.9) * placement.echelle;
      // déplacement le long de la branche (dt) et autour (dtheta) pour rester sur l'écorce
      const dt = (Math.cos(a) * d) / b.longueur;
      const dtheta = (Math.sin(a) * d) / rayonBranche;
      const t = Math.min(0.97, Math.max(0.05, placement.t + dt));
      const theta = Math.max(-1.9, Math.min(1.9, placement.theta + dtheta));
      this.touffe(placement.branche, t, theta, 0.85 + placement.echelle * 0.3);
    }
  }

  // Un halo lumineux (lampe, lanterne) visible de loin
  halo(position, taille = 4, intensite = 1) {
    const s = new THREE.Sprite(this.matHalo.clone());
    s.material.opacity = Math.min(1, 0.4 * intensite);
    s.position.copy(position);
    s.scale.set(taille, taille, 1);
    this.scene.add(s);
    this.halos.push(s);
    return s;
  }

  // Lianes qui pendent des flancs des branches, avec de petites feuilles
  lianes(n = 26) {
    const lame = geoLame(0.5, 0.14, 0.3);
    const pieces = [];
    const nb = this.squelette.branches.length;
    for (let i = 0; i < n; i++) {
      const b = this.squelette.branches[Math.floor(this.hasard() * nb)];
      const t = 0.22 + this.hasard() * 0.7;
      const r = repereA(b, t);
      const theta = (this.hasard() < 0.5 ? -1 : 1) * (1.3 + this.hasard() * 0.5);
      const { pos, normale } = pointSurface(r, theta);
      const longueur = 3.5 + this.hasard() * 6;
      const p0 = v3(pos);
      const pts = [
        p0,
        p0.clone().addScaledVector(v3(normale), 0.5).add(new THREE.Vector3(0, -longueur * 0.25, 0)),
        p0.clone().addScaledVector(v3(normale), 0.7).add(new THREE.Vector3(this.hasard() * 0.6 - 0.3, -longueur * 0.6, this.hasard() * 0.6 - 0.3)),
        p0.clone().addScaledVector(v3(normale), 0.6).add(new THREE.Vector3(this.hasard() * 0.8 - 0.4, -longueur, this.hasard() * 0.8 - 0.4)),
      ];
      const courbe = new THREE.CatmullRomCurve3(pts);
      pieces.push({ geo: new THREE.TubeGeometry(courbe, 20, 0.04, 5, false), matrice: new THREE.Matrix4(), couleur: 0x4f7a2c });
      for (let k = 1; k < 9; k++) {
        const u = k / 9;
        const c = courbe.getPoint(u);
        const m = new THREE.Matrix4().compose(
          c,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 * (k % 2 ? 1 : -1), this.hasard() * 6.28, 0)),
          new THREE.Vector3(1, 1, 1),
        );
        pieces.push({ geo: lame, matrice: m, couleur: 0x5aa03a });
      }
    }
    const mesh = new THREE.Mesh(
      fusionner(pieces),
      new THREE.MeshStandardMaterial({ map: textureFeuille(), vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    );
    mesh.castShadow = this.qualite !== 'basse';
    this.scene.add(mesh);
    return mesh;
  }

  // Lanternes posées sur les flancs d'une branche : un poteau court et un globe qui brille
  lanternes(brancheId, ts, avecLumiere = 0) {
    const b = this.squelette.branches[brancheId];
    const corps = [];
    const lueurs = [];
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    const sph = new THREE.SphereGeometry(1, 12, 9);
    const sorties = [];
    ts.forEach((t, i) => {
      const theta = (i % 2 ? -1 : 1) * 1.15;
      const r = repereA(b, t);
      const { pos, normale } = pointSurface(r, theta);
      const n = v3(normale);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const base = v3(pos).addScaledVector(n, -0.05);
      const mat = (offset, sx, sy, sz) => new THREE.Matrix4().compose(
        base.clone().addScaledVector(n, offset), q, new THREE.Vector3(sx, sy, sz),
      );
      corps.push({ geo: cyl, matrice: mat(0.45, 0.05, 0.45, 0.05), couleur: 0x3a2a1c });
      corps.push({ geo: cyl, matrice: mat(0.95, 0.17, 0.05, 0.17), couleur: 0x3a2a1c });
      lueurs.push({ geo: sph, matrice: mat(0.78, 0.17, 0.2, 0.17), couleur: 0xffffff });
      sorties.push(base.clone().addScaledVector(n, 0.8));
    });
    const m1 = new THREE.Mesh(fusionner(corps), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    const m2 = new THREE.Mesh(
      fusionner(lueurs),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.6, 0.2).multiplyScalar(2.2), toneMapped: false }),
    );
    this.scene.add(m1, m2);
    sorties.forEach((p, i) => {
      this.halo(p, 2.2, 0.9);
      if (i < avecLumiere) {
        const l = new THREE.PointLight(0xffa24a, 12, 9, 1.8);
        l.position.copy(p);
        this.scene.add(l);
      }
    });
    return sorties;
  }
}
