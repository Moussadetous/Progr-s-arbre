// Caméra : en « aperçu » avant la connexion (on voit l'arbre entier, en lente rotation),
// puis une caméra qui suit la boule de près. Glisser tourne, la molette zoome.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HAUT_BOULE = new THREE.Vector3(0, 0.5, 0);
const APERCU_DISTANCE = 190; // m : assez loin pour voir l'arbre entier (il fait 203 m de haut)

export class CameraSuiveuse {
  constructor(camera) {
    this.camera = camera;
    this.cible = new THREE.Vector3(0, 95, 0);
    this.yaw = 0.6;
    this.pitch = 0.14;
    this.distance = APERCU_DISTANCE;
    this.apercu = true;
    this.temp = new THREE.Vector3();
  }

  // Passe de l'aperçu à la caméra qui suit la boule
  suivreBoule(position) {
    this.apercu = false;
    this.cible.set(position[0], position[1], position[2]).add(HAUT_BOULE);
    this.distance = 7;
    this.pitch = 0.3;
  }

  // Suit la boule en douceur
  suivre(position, dt) {
    if (this.apercu) return;
    const k = 1 - Math.exp(-10 * dt);
    this.temp.set(position[0], position[1], position[2]).add(HAUT_BOULE);
    this.cible.lerp(this.temp, k);
  }

  // Aperçu : l'arbre entier, en rotation très lente
  vueApercu(t, dt) {
    if (!this.apercu) return;
    this.yaw = t * 0.04;
    this.pitch = 0.14;
    this.distance = APERCU_DISTANCE;
    this.cible.lerp(this.temp.set(0, 95, 0), 1 - Math.exp(-2 * dt));
  }

  tourner(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.05, 1.3);
  }

  zoomer(facteur) {
    this.distance = clamp(this.distance * facteur, 1.5, 400);
  }

  // Directions horizontales du point de vue : devant et à droite (pour marcher « par rapport à la caméra »)
  axesMonde() {
    const dx = this.cible.x - this.camera.position.x;
    const dz = this.cible.z - this.camera.position.z;
    const l = Math.hypot(dx, dz) || 1;
    const avant = [dx / l, 0, dz / l];
    return { avant, droite: [-avant[2], 0, avant[0]] };
  }

  // obstacle(origine, direction, longueur) : distance au premier rameau, ou null.
  // Si un rameau coupe la vue, la caméra se rapproche au lieu de traverser l'arbre.
  update(obstacle = null) {
    let d = this.distance;
    if (obstacle && !this.apercu) {
      const horizontal = Math.cos(this.pitch) * d;
      const dir = [Math.sin(this.yaw) * horizontal, Math.sin(this.pitch) * d, Math.cos(this.yaw) * horizontal];
      const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const touche = obstacle([this.cible.x, this.cible.y, this.cible.z], [dir[0] / l, dir[1] / l, dir[2] / l], d);
      if (touche !== null) d = Math.max(1.2, touche - 0.5);
    }
    this.distanceVue = this.distanceVue === undefined ? d : this.distanceVue + (d - this.distanceVue) * 0.25;
    const horizontal = Math.cos(this.pitch) * this.distanceVue;
    this.camera.position.set(
      this.cible.x + Math.sin(this.yaw) * horizontal,
      this.cible.y + Math.sin(this.pitch) * this.distanceVue,
      this.cible.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.cible);
  }
}
