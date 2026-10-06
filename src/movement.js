// Déplacement de la fourmi sur le graphe de navigation de l'arbre.
// La fourmi avance d'un nœud à l'autre ; aux intersections, elle choisit
// la direction la plus proche de son cap (piloté par le doigt du joueur).
import * as THREE from 'three';
import { damp, clamp } from './util.js';

const MAXV = 2.4;      // vitesse avant (unités monde / s)
const MAXBACK = 1.1;   // vitesse arrière
const STEER = 2.35;    // taux de rotation du cap (rad/s)
const PULL = 2.2;      // rappel du cap vers la trajectoire réelle

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const YAXIS = new THREE.Vector3(0, 1, 0);

export class Walker {
  constructor(nodes, FOOT) {
    this.nodes = nodes;
    this.FOOT = FOOT;
    this.behind = -1;   // nœud derrière
    this.ahead = -1;    // nœud devant (vers lequel la fourmi regarde)
    this.t = 0.5;
    this.speed = 0;
    this.heading = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.facing = new THREE.Vector3(0, 0, 1);
    this.leafId = -1;
    this.moved = 0; // distance totale parcourue (stats)
  }

  setStart(nodeIdx, facing) {
    const n = this.nodes[nodeIdx];
    this.heading.copy(facing).normalize();
    if (n.nb.length) {
      // on oriente l'arête de départ dans le sens du regard
      this.behind = nodeIdx;
      this.ahead = this.chooseNext(nodeIdx, -1, this.heading);
      this.t = 0.35;
    } else {
      this.behind = nodeIdx;
      this.ahead = nodeIdx;
      this.t = 0.5;
    }
    this.facing.subVectors(this.nodes[this.ahead].pos, this.nodes[this.behind].pos).normalize();
    if (this.facing.lengthSq() < 1e-6) this.facing.set(0, 0, 1);
    this.heading.copy(this.facing);
    this.refreshTransform();
  }

  // choisit le prochain nœud depuis `from` (en arrivant depuis `exclude`)
  chooseNext(from, exclude, dir) {
    const node = this.nodes[from];
    let best = -1, bestScore = Infinity;
    for (const e of node.nb) {
      let score;
      if (e.to === exclude && node.nb.length > 1) {
        score = 2.6; // pénalité de demi-tour
      } else {
        _v1.subVectors(this.nodes[e.to].pos, node.pos).normalize();
        score = _v1.angleTo(dir);
      }
      if (score < bestScore) { bestScore = score; best = e.to; }
    }
    if (best === -1) best = node.nb.length ? node.nb[0].to : from;
    return best;
  }

  edgeLen() {
    return this.nodes[this.behind].pos.distanceTo(this.nodes[this.ahead].pos) || 0.001;
  }

  update(dt, input) {
    const throttle = clamp(input.throttle, -1, 1);
    const steer = clamp(input.steer, -1, 1);

    // vitesse
    const target = throttle > 0 ? throttle * MAXV : throttle * MAXBACK;
    this.speed = damp(this.speed, target, 5, dt);

    // cap : le doigt tourne le cap, le cap est doucement rappelé vers la trajectoire
    if (Math.abs(steer) > 0.001) {
      this.heading.applyAxisAngle(this.up, -steer * STEER * dt).normalize();
    }
    _v1.subVectors(this.nodes[this.ahead].pos, this.nodes[this.behind].pos).normalize();
    this.facing.copy(_v1);
    this.heading.lerp(_v1, 1 - Math.exp(-PULL * dt)).normalize();

    // progression le long de l'arête
    let rem = this.speed * dt;
    let guard = 0;
    while (Math.abs(rem) > 1e-6 && guard++ < 10) {
      const len = this.edgeLen();
      if (rem > 0) {
        const left = (1 - this.t) * len;
        if (rem < left) { this.t += rem / len; rem = 0; }
        else {
          rem -= left;
          const next = this.chooseNext(this.ahead, this.behind, this.heading);
          if (next === this.behind) this.heading.negate(); // demi-tour forcé (cul-de-sac)
          this.behind = this.ahead; this.ahead = next; this.t = 0;
        }
      } else {
        const passed = this.t * len;
        if (-rem < passed) { this.t += rem / len; rem = 0; }
        else {
          rem += passed;
          // en marche arrière, on continue dans le sens opposé au regard
          _v2.copy(this.facing).negate();
          const next = this.chooseNext(this.behind, this.ahead, _v2);
          this.ahead = this.behind; this.behind = next; this.t = 1;
        }
      }
    }
    if (Math.abs(this.speed) > 0.02) this.moved += Math.abs(this.speed) * dt;
    this.refreshTransform();
  }

  refreshTransform() {
    const A = this.nodes[this.behind], B = this.nodes[this.ahead];
    const t = clamp(this.t, 0, 1);
    this.pos.copy(A.pos).lerp(B.pos, t);
    // interpolation douce des "haut" locaux
    _q1.setFromUnitVectors(YAXIS, A.up);
    _q2.setFromUnitVectors(YAXIS, B.up);
    _q1.slerp(_q2, t);
    this.up.copy(YAXIS).applyQuaternion(_q1);
    const r = lerp(A.radius, B.radius, t) + this.FOOT;
    this.pos.addScaledVector(this.up, r);
    this.leafId = t > 0.5 ? (B.leafId) : (A.leafId);
    if (this.leafId < 0) this.leafId = t > 0.5 ? A.leafId : B.leafId;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }
