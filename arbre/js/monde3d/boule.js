// La petite boule : c'est la personne dans l'arbre. Elle roule sur les branches.
import * as THREE from 'three';
import { RAYON_BOULE } from '../../shared/geometrie.js';
import { rampeToon } from '../decor.js';

export function creerBoule(scene, teinte) {
  const rampe = rampeToon();
  const groupe = new THREE.Group();
  const couleur = new THREE.Color().setHSL(teinte / 360, 0.75, 0.6);
  const corps = new THREE.Mesh(
    new THREE.SphereGeometry(RAYON_BOULE, 20, 14),
    new THREE.MeshToonMaterial({ color: couleur, gradientMap: rampe }),
  );
  // Contour sombre, comme les autres formes du dessin
  const contour = new THREE.Mesh(
    new THREE.SphereGeometry(RAYON_BOULE, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x2b2a1f, side: THREE.BackSide }),
  );
  contour.scale.setScalar(1.16);
  // Un reflet : il tourne avec la boule, on voit qu'elle roule
  const reflet = new THREE.Mesh(
    new THREE.SphereGeometry(RAYON_BOULE * 0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  reflet.position.set(0, RAYON_BOULE * 0.55, RAYON_BOULE * 0.8);
  groupe.add(corps, contour, reflet);
  groupe.visible = false;
  scene.add(groupe);

  const axe = new THREE.Vector3();
  const tourne = new THREE.Quaternion();
  return {
    groupe,
    // Place la boule, et la fait rouler d'autant que la distance parcourue
    placer(position, normale, tangente, distance) {
      groupe.visible = true;
      groupe.position.set(position[0], position[1], position[2]);
      if (distance > 1e-6) {
        axe.crossVectors(
          new THREE.Vector3(normale[0], normale[1], normale[2]),
          new THREE.Vector3(tangente[0], tangente[1], tangente[2]),
        );
        if (axe.lengthSq() > 1e-6) {
          tourne.setFromAxisAngle(axe.normalize(), distance / RAYON_BOULE);
          groupe.quaternion.premultiply(tourne);
        }
      }
    },
    fixerTeinte(t) {
      corps.material.color.setHSL(t / 360, 0.75, 0.6);
    },
  };
}
