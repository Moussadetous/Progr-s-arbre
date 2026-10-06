// Caméra de suivi : derrière et au-dessus de Zira, douce et stable.
// Si le tronc bloque la vue, la caméra se rapproche de la fourmi
// au lieu de passer de l'autre côté.
import * as THREE from 'three';
import { damp, clamp } from './util.js';

export class FollowCam {
  constructor(camera, trunkSpine = []) {
    this.cam = camera;
    this.spine = trunkSpine;
    this.dist = 3.6;
    this.targetDist = 3.6;
    this.pos = new THREE.Vector3(0, 12, 24);
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.roll = 0;
    this._p = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._probe = new THREE.Vector3();
  }

  toggleZoom() { this.targetDist = this.targetDist < 5 ? 7.2 : 3.6; }

  // distance signée à la surface du tronc (négatif = à l'intérieur)
  trunkClear(p) {
    let best = Infinity;
    for (const s of this.spine) {
      const d = p.distanceTo(s.pos) - s.r;
      if (d < best) best = d;
    }
    return best;
  }

  snap(pos, up, facing) {
    this.pos.copy(pos).addScaledVector(up, 1.6).addScaledVector(facing, -this.dist);
    this.look.copy(pos);
    this.up.copy(up);
  }

  update(dt, antPos, antUp, antFacing, steer) {
    this.dist = damp(this.dist, this.targetDist, 3, dt);
    // point d'ancrage (au-dessus de la fourmi) et position souhaitée
    this._a.copy(antPos).addScaledVector(antUp, 1.8);
    this._d.copy(this._a).addScaledVector(antFacing, -this.dist);
    if (this._d.y < 0.25 && antPos.y > 0.5) this._d.y = 0.25;

    // le tronc ne doit jamais se glisser entre la caméra et Zira :
    // on raccourcit la distance au premier point du segment qui y entre.
    this._p.copy(this._d);
    if (this.spine.length) {
      let maxT = 1;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        this._probe.lerpVectors(this._a, this._d, t);
        if (this.trunkClear(this._probe) < 0.3) { maxT = Math.max(0.12, t - 0.1); break; }
      }
      this._p.lerpVectors(this._a, this._d, maxT);
      // sécurité : si on est quand même dans le tronc, on repousse hors de l'écorce
      const clear = this.trunkClear(this._p);
      if (clear < 0.05) {
        let nearest = this.spine[0];
        let bd = Infinity;
        for (const s of this.spine) {
          const d = this._p.distanceToSquared(s.pos);
          if (d < bd) { bd = d; nearest = s; }
        }
        const away = this._p.clone().sub(nearest.pos);
        away.y *= 0.35; // le tronc est vertical : pousser surtout à l'horizontale
        if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
        away.normalize();
        this._p.copy(nearest.pos).addScaledVector(away, nearest.r + 0.35);
      }
    }

    this.pos.x = damp(this.pos.x, this._p.x, 4.2, dt);
    this.pos.y = damp(this.pos.y, this._p.y, 4.2, dt);
    this.pos.z = damp(this.pos.z, this._p.z, 4.2, dt);

    const k = 7;
    this.look.x = damp(this.look.x, antPos.x + antFacing.x * 1.2, k, dt);
    this.look.y = damp(this.look.y, antPos.y + antFacing.y * 1.2 + antUp.y * 0.3, k, dt);
    this.look.z = damp(this.look.z, antPos.z + antFacing.z * 1.2, k, dt);

    this.up.x = damp(this.up.x, antUp.x, 3.2, dt);
    this.up.y = damp(this.up.y, antUp.y, 3.2, dt);
    this.up.z = damp(this.up.z, antUp.z, 3.2, dt);
    this.up.normalize();

    this.roll = damp(this.roll, -steer * 0.045, 3, dt);

    this.cam.position.copy(this.pos);
    this.cam.up.copy(this.up);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(this.roll);
  }
}
