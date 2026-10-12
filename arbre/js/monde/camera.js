// La caméra suit la boule avec la gravité : le haut est toujours le haut du monde.
// Elle se place derrière la boule (cap réglable), ne traverse jamais le bois, et se recule pour voir l'arbre.
import * as THREE from 'three';

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class CameraBoule {
  constructor(camera, sol) {
    this.camera = camera;
    this.sol = sol;
    this.lacet = 0; // cap (rad) : la boule avance vers (cos, 0, sin)
    this.tangage = 0.32;
    this.voulue = 2.6; // distance demandée
    this.distance = 2.6; // distance réelle (après obstacles)
    this.cible = new THREE.Vector3();
    this.centreArbre = new THREE.Vector3(0, 20, 0);
    this.derniereRotation = -10;
    this.tmp = new THREE.Vector3();
    this.p = new THREE.Vector3();
  }

  axes() {
    const avant = new THREE.Vector3(Math.cos(this.lacet), 0, Math.sin(this.lacet));
    const droite = new THREE.Vector3(-Math.sin(this.lacet), 0, Math.cos(this.lacet));
    return { avant, droite };
  }

  tourner(dLacet, dTangage, t) {
    this.lacet += dLacet;
    this.tangage = Math.min(1.45, Math.max(-0.2, this.tangage + dTangage));
    if (dLacet || dTangage) this.derniereRotation = t;
  }

  zoomer(f) {
    this.voulue = Math.min(900, Math.max(0.45, this.voulue * f));
  }

  // En marchant tout droit, le cap se tourne doucement vers la direction suivie
  suivreDirection(dx, dz, avance, dt, t) {
    if (avance < 0.25 || t - this.derniereRotation < 0.8) return;
    const l = Math.hypot(dx, dz);
    if (l < 1e-5) return;
    const voulu = Math.atan2(dz, dx);
    let d = voulu - this.lacet;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 2.2) return; // on recule : on ne retourne pas la caméra
    this.lacet += d * Math.min(1, dt * 1.6 * avance);
  }

  // obstacleFeuilles(origine, direction, distance) : distance du premier obstacle non boisé (les feuilles), ou Infinity
  placer(boule, dt, { dansMaison = null, obstacleFeuilles = null } = {}) {
    const loin = lisse(18, 110, this.voulue);
    this.cible.copy(boule).add(this.tmp.set(0, 0.06, 0)).lerp(this.centreArbre, loin);
    let voulue = this.voulue;
    if (dansMaison !== null && voulue < 8) voulue = Math.min(voulue, 2.2);
    const c = Math.cos(this.tangage);
    const s = Math.sin(this.tangage);
    const dir = new THREE.Vector3(-Math.cos(this.lacet) * c, s, -Math.sin(this.lacet) * c);
    // obstacles : on rapproche la caméra si du bois se trouve entre elle et la boule
    let libre = voulue;
    if (voulue < 60) {
      const N = 18;
      for (let i = 1; i <= N; i++) {
        const d = (voulue * i) / N;
        this.p.copy(this.cible).addScaledVector(dir, d);
        if (this.sol.bloque([this.p.x, this.p.y, this.p.z], 0.1)) {
          libre = Math.max(0.25, (voulue * (i - 1)) / N - 0.05);
          break;
        }
      }
    }
    if (obstacleFeuilles && voulue < 60) {
      const h = obstacleFeuilles(this.cible, dir, libre);
      if (h < libre) libre = Math.max(0.25, h - 0.1);
    }
    const k = libre < this.distance ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 4);
    this.distance += (libre - this.distance) * (dt ? k : 1);
    this.camera.position.copy(this.cible).addScaledVector(dir, this.distance);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.cible);
  }
}
