// La capitale : une salle ouverte au cœur du tronc. Quatre colonnes de bois portent le haut du tronc,
// un plancher rond en bois, une scène lumineuse au centre et des écrans flottants (les vidéos publiques).
// Les quatre branches maîtresses partent du bord du plancher, entre les colonnes.
import * as THREE from 'three';
import { Y0, R_TRONC, H_SALLE, R_SOL, R_SCENE, H_SCENE, COLONNES } from '../../shared/arbre.js';
import { geometrieTronc } from './tube.js';
import { textureBois, textureEcran, textureHalo } from './textures.js';

export function creerCapitale(scene, matEcorce, arbre) {
  const groupe = new THREE.Group();
  scene.add(groupe);

  // plancher
  const bois = textureBois();
  bois.repeat.set(6, 6);
  const plancher = new THREE.Mesh(new THREE.CylinderGeometry(R_SOL, R_SOL, 0.6, 72), new THREE.MeshStandardMaterial({ map: bois, roughness: 0.75 }));
  plancher.position.y = Y0 - 0.3;
  plancher.receiveShadow = true;
  groupe.add(plancher);

  // scène centrale, bordée d'un anneau lumineux
  const scn = new THREE.Mesh(new THREE.CylinderGeometry(R_SCENE, R_SCENE + 0.1, H_SCENE, 48), new THREE.MeshStandardMaterial({ color: 0x9c6a3e, roughness: 0.6 }));
  scn.position.y = Y0 + H_SCENE / 2;
  scn.receiveShadow = true;
  groupe.add(scn);
  const lumineux = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.32).multiplyScalar(2.2), toneMapped: false });
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(R_SCENE + 0.05, 0.05, 8, 96), lumineux);
  anneau.rotation.x = Math.PI / 2;
  anneau.position.y = Y0 + H_SCENE;
  groupe.add(anneau);

  // rebord du plancher, entre les départs des branches maîtresses
  const azBranches = arbre.chemins.filter((c) => c.type === 'maitresse').map((c) => c.azimut);
  const ouverture = 0.42;
  const tri = [...azBranches].sort((a, b) => a - b);
  for (let i = 0; i < tri.length; i++) {
    const a0 = tri[i] + ouverture;
    let a1 = tri[(i + 1) % tri.length] - ouverture;
    if (a1 < a0) a1 += Math.PI * 2;
    const g = new THREE.TorusGeometry(R_SOL - 0.15, 0.12, 8, 40, a1 - a0);
    const rebord = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6b4325, roughness: 0.7 }));
    rebord.rotation.x = Math.PI / 2;
    rebord.rotation.z = a0;
    rebord.position.y = Y0 + 0.12;
    groupe.add(rebord);
  }

  // colonnes : bombées vers l'extérieur, évasées en haut et en bas comme des racines
  for (const col of COLONNES) {
    const pts = [];
    const ray = [];
    const dir = new THREE.Vector3(Math.cos(col.a), 0, Math.sin(col.a));
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const y = Y0 - 0.6 + u * (H_SALLE + 1.2);
      const bombe = Math.sin(Math.PI * u) * 0.7;
      pts.push(new THREE.Vector3(col.x, y, col.z).addScaledVector(dir, bombe));
      ray.push(col.r + 1.1 * Math.pow(Math.abs(u - 0.5) * 2, 3));
    }
    const m = new THREE.Mesh(geometrieTronc(pts, ray, { radial: 28, mousse: 0.6 }), matEcorce);
    m.castShadow = true;
    m.receiveShadow = true;
    groupe.add(m);
    // lanterne accrochée à la colonne, côté intérieur
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), lumineux);
    l.position.set(col.x, Y0 + 3.2, col.z).addScaledVector(dir, -col.r - 0.35);
    groupe.add(l);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textureHalo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6, fog: false }));
    halo.position.copy(l.position);
    halo.scale.set(3, 3, 1);
    groupe.add(halo);
  }

  // plafond : le dessous du haut du tronc
  const plafond = new THREE.Mesh(new THREE.CylinderGeometry(R_TRONC + 0.1, R_TRONC - 0.4, 0.8, 72), matEcorce);
  plafond.position.y = Y0 + H_SALLE + 0.4;
  groupe.add(plafond);
  const lustre = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 8, 80), lumineux);
  lustre.rotation.x = Math.PI / 2;
  lustre.position.y = Y0 + H_SALLE - 0.6;
  groupe.add(lustre);

  // écrans flottants : les vidéos publiques
  const ecrans = [];
  for (let k = 0; k < 3; k++) {
    const e = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.5),
      new THREE.MeshBasicMaterial({ map: textureEcran(k), side: THREE.DoubleSide, transparent: true, opacity: 0.92, toneMapped: false }),
    );
    groupe.add(e);
    ecrans.push(e);
  }

  const clair = new THREE.PointLight(0xffb060, 160, 30, 1.5);
  clair.position.set(0, Y0 + 5.5, 0);
  groupe.add(clair);

  return {
    groupe,
    update(t) {
      ecrans.forEach((e, k) => {
        const a = t * 0.12 + (k * Math.PI * 2) / 3;
        e.position.set(Math.cos(a) * 3.4, Y0 + 3.6 + Math.sin(t * 0.8 + k) * 0.15, Math.sin(a) * 3.4);
        e.lookAt(Math.cos(a) * 20, Y0 + 3.6, Math.sin(a) * 20);
      });
    },
  };
}
