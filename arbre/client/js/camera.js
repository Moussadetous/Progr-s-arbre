// Caméra en orbite autour de la fourmi : elle la suit, tourne au glissé, zoome à la molette ou au pincement.
import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const HAUT = new THREE.Vector3(0, 1.2, 0);

export class CameraOrbite {
  constructor(camera) {
    this.camera = camera;
    this.cible = new THREE.Vector3(0, 6, 0);
    this.yaw = 0.7;
    this.pitch = 0.42;
    this.distance = 14;
    this.temp = new THREE.Vector3();
  }

  suivre(point, dt) {
    this.cible.lerp(this.temp.copy(point).add(HAUT), 1 - Math.exp(-5 * dt));
  }

  // Recentre immédiatement (sans l'effet de glissement), par exemple à la connexion
  recentrer(point) {
    this.cible.copy(point).add(HAUT);
  }

  tourner(dx, dy) {
    this.yaw -= dx * 0.008;
    this.pitch = clamp(this.pitch + dy * 0.005, 0.12, 1.25);
  }

  zoomer(facteur) {
    this.distance = clamp(this.distance * facteur, 4, 45);
  }

  update() {
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.cible.x + Math.sin(this.yaw) * horizontal,
      this.cible.y + Math.sin(this.pitch) * this.distance,
      this.cible.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.lookAt(this.cible);
  }
}
