// Zira la fourmi : modèle 3D construit en primitives, animation de marche procédurale.
import * as THREE from 'three';
import { damp, clamp } from './util.js';

export function createAnt() {
  const matBody = new THREE.MeshStandardMaterial({ color: 0x8a3b20, roughness: 0.55, metalness: 0.05 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x54220f, roughness: 0.6 });
  const matEye = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.25 });

  const root = new THREE.Group();       // position + orientation sur la branche
  const body = new THREE.Group();       // inclinaison dans les virages
  root.add(body);

  const sph = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);

  // abdomen, thorax, tête
  const gaster = sph(0.16, matBody); gaster.scale.set(1, 0.86, 1.5); gaster.position.set(0, 0.03, -0.26);
  const thorax = sph(0.10, matBody); thorax.scale.set(1, 0.8, 1.25); thorax.position.set(0, 0.02, -0.02);
  const head = sph(0.095, matDark); head.scale.set(1.05, 0.9, 1); head.position.set(0, 0.045, 0.16);
  const petiole = sph(0.035, matDark); petiole.position.set(0, 0.05, -0.12);
  body.add(gaster, thorax, head, petiole);

  // yeux
  const eyeL = sph(0.022, matEye); eyeL.position.set(-0.055, 0.075, 0.225);
  const eyeR = sph(0.022, matEye); eyeR.position.set(0.055, 0.075, 0.225);
  body.add(eyeL, eyeR);

  // antennes
  const antGeo = new THREE.CylinderGeometry(0.006, 0.011, 0.22, 5);
  const makeAntenna = (side) => {
    const g = new THREE.Group();
    const a = new THREE.Mesh(antGeo, matDark);
    a.position.y = 0.11;
    g.add(a);
    const tip = new THREE.Mesh(antGeo, matDark);
    tip.scale.set(0.7, 0.55, 0.7);
    tip.position.set(0, 0.2, 0.045);
    tip.rotation.x = -0.6;
    g.add(tip);
    g.position.set(0.04 * side, 0.09, 0.22);
    g.rotation.set(-0.7, 0, -0.35 * side);
    return g;
  };
  const antL = makeAntenna(1), antR = makeAntenna(-1);
  body.add(antL, antR);

  // pattes : 6, deux segments chacune
  const upperGeo = new THREE.CylinderGeometry(0.008, 0.011, 0.14, 5);
  const lowerGeo = new THREE.CylinderGeometry(0.004, 0.008, 0.16, 5);
  const legs = [];
  const legAnchors = [
    [-0.06, 0.0, 0.07, -1], [0.06, 0.0, 0.07, 1],
    [-0.075, 0.0, -0.05, -1], [0.075, 0.0, -0.05, 1],
    [-0.06, 0.0, -0.16, -1], [0.06, 0.0, -0.16, 1],
  ];
  for (const [x, y, z, side] of legAnchors) {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    const upper = new THREE.Mesh(upperGeo, matDark);
    upper.position.y = -0.055;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -0.11;
    hip.add(knee);
    const lower = new THREE.Mesh(lowerGeo, matDark);
    lower.position.y = -0.07;
    knee.add(lower);
    hip.rotation.z = side * 1.15; // écartée du corps
    hip.rotation.x = 0.35;
    body.add(hip);
    legs.push({ hip, knee, side, phase: (legs.length % 2) * Math.PI + (legs.length % 3) * 0.4 });
  }

  const targetQ = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const right = new THREE.Vector3(), upV = new THREE.Vector3(), fwd = new THREE.Vector3();
  let walkPhase = 0;
  let lean = 0;

  return {
    root,
    update(dt, t, walker, steer) {
      // orientation : base (droite, haut, avant)
      upV.copy(walker.up);
      fwd.copy(walker.facing);
      right.crossVectors(upV, fwd).normalize();
      m.makeBasis(right, upV, fwd);
      targetQ.setFromRotationMatrix(m);
      root.quaternion.slerp(targetQ, 1 - Math.exp(-9 * dt));
      root.position.copy(walker.pos);

      // inclinaison dans les virages
      lean = damp(lean, -steer * 0.3, 6, dt);
      body.rotation.set(0, lean, 0);

      // marche
      const sp = Math.abs(walker.speed);
      const amp = clamp(sp / 2.4, 0, 1);
      walkPhase += dt * (2.5 + sp * 9.5);
      for (const leg of legs) {
        const sw = Math.sin(walkPhase * 2 + leg.phase) * (0.28 + amp * 0.5);
        leg.hip.rotation.x = 0.35 + sw;
        leg.knee.rotation.x = -0.15 - Math.max(0, Math.sin(walkPhase * 2 + leg.phase + 0.7)) * (0.2 + amp * 0.75);
      }
      // respiration au repos
      const breathe = 1 + Math.sin(t * 2.2) * 0.015;
      body.scale.set(1, breathe, 1);
      body.position.y = Math.sin(walkPhase * 4) * 0.008 * amp;

      // antennes qui bougent
      const wob = Math.sin(t * 2.6) * 0.16 + amp * 0.12;
      antL.rotation.z = -0.35 + wob;
      antR.rotation.z = 0.35 - wob * 0.8;
    },
  };
}
