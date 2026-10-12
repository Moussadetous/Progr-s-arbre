// La caméra suit la boule comme une personne sur la terre : « le haut » est toujours la normale de la surface
// sous la boule, quelle que soit l'orientation de la branche ou du tronc. De loin, le monde se redresse peu à peu.
import * as THREE from 'three';

const HAUT_MONDE = new THREE.Vector3(0, 1, 0);
const lisser = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class CameraSurface {
  constructor(camera) {
    this.camera = camera;
    this.haut = new THREE.Vector3(0, 1, 0); // normale de la surface, lissée
    this.avant = new THREE.Vector3(0, 0, -1); // cap : direction « devant », dans le plan de la surface
    this.tangage = 0.32;
    this.distance = 2.2;
    this.distanceVoulue = 2.2;
    this.q = new THREE.Quaternion();
    this.tmp = new THREE.Vector3();
    this.droite = new THREE.Vector3();
    this.upCam = new THREE.Vector3();
  }

  // Place le cap dans une direction donnée (par exemple vers le bout de la feuille)
  orienter(normale, direction) {
    this.haut.copy(normale);
    this.avant.copy(direction);
    this.projeter();
  }

  projeter() {
    this.avant.addScaledVector(this.haut, -this.avant.dot(this.haut));
    if (this.avant.lengthSq() < 1e-8) this.avant.set(1, 0, 0).addScaledVector(this.haut, -this.haut.x);
    this.avant.normalize();
  }

  // La surface change d'orientation : le cap tourne avec elle (transport parallèle)
  suivreSurface(normale, dt) {
    const k = 1 - Math.exp(-dt * 7);
    const ancien = this.tmp.copy(this.haut);
    this.haut.lerp(normale, k).normalize();
    this.q.setFromUnitVectors(ancien, this.haut);
    this.avant.applyQuaternion(this.q);
    this.projeter();
  }

  tourner(dLacet, dTangage) {
    this.avant.applyAxisAngle(this.haut, dLacet);
    this.tangage = Math.min(1.45, Math.max(-0.25, this.tangage + dTangage));
  }

  zoomer(facteur) {
    this.distanceVoulue = Math.min(700, Math.max(0.5, this.distanceVoulue * facteur));
  }

  // Vecteurs pour déplacer la boule : devant et à droite dans le plan de la surface
  axes() {
    this.droite.crossVectors(this.avant, this.haut).normalize();
    return { avant: this.avant, droite: this.droite };
  }

  placer(position, dt) {
    this.distance += (this.distanceVoulue - this.distance) * (1 - Math.exp(-dt * 8));
    const d = this.distance;
    // de loin on retrouve le haut du monde
    const poids = lisser(10, 60, d);
    this.upCam.copy(this.haut).lerp(HAUT_MONDE, poids).normalize();
    const avantCam = this.tmp.copy(this.avant).addScaledVector(this.upCam, -this.avant.dot(this.upCam));
    if (avantCam.lengthSq() < 1e-6) avantCam.set(0, 0, -1);
    avantCam.normalize();
    const c = Math.cos(this.tangage);
    const s = Math.sin(this.tangage);
    this.camera.position.copy(position)
      .addScaledVector(avantCam, -c * d)
      .addScaledVector(this.upCam, s * d);
    this.camera.up.copy(this.upCam);
    this.camera.lookAt(position.x + avantCam.x * d * 0.1, position.y + avantCam.y * d * 0.1, position.z + avantCam.z * d * 0.1);
  }
}
