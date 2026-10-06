// Feuilles : une seule géométrie partagée, instanciée des centaines de fois.
// Léger balancement de vent + la feuille plie quand Zira marche dessus.
import * as THREE from 'three';
import { damp } from './util.js';

// Feuille unitaire le long de +Z (nervure), pliée et retombante
function createLeafGeometry() {
  const nz = 6, nx = 3; // colonnes le long / largeur
  const droop = 0.22, fold = 0.13;
  const pos = [], col = [], idx = [];
  const cBase = new THREE.Color(0.36, 0.58, 0.26);
  const cTip = new THREE.Color(0.58, 0.80, 0.34);
  const cVein = new THREE.Color(0.70, 0.86, 0.44);
  const c = new THREE.Color();
  for (let iz = 0; iz <= nz; iz++) {
    const u = iz / nz;
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.05)), 0.65);
    for (let ix = 0; ix <= nx; ix++) {
      const v = ix / nx - 0.5;
      const x = v * 2; // largeur normalisée
      const y = Math.abs(v * 2) * fold - droop * u * u;
      const z = u;
      pos.push(x * w, y, z);
      // couleur : dégradé base->pointe + nervure centrale claire
      c.copy(cBase).lerp(cTip, u);
      if (Math.abs(v) < 0.18) c.lerp(cVein, 0.55);
      c.lerp(cTip, Math.max(0, Math.abs(v) - 0.55) * 0.8); // bords clairs
      col.push(c.r, c.g, c.b);
    }
  }
  const row = nx + 1;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * row + ix;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createLeafSystem(leaves) {
  const geo = createLeafGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, metalness: 0,
  });

  // 3 groupes pour déphaser le vent
  const groups = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const lookup = new Map(); // leafId -> {mesh, index, base}
  const bases = [];

  const perGroup = Math.ceil(leaves.length / 3) || 1;
  for (let gi = 0; gi < 3; gi++) {
    const subset = leaves.slice(gi * perGroup, (gi + 1) * perGroup);
    if (!subset.length) continue;
    const mesh = new THREE.InstancedMesh(geo, mat, subset.length);
    mesh.frustumCulled = false;
    subset.forEach((leaf, i) => {
      s.set(leaf.width * 0.5, 1, leaf.len);
      m.compose(leaf.base, leaf.quat, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, leaf.tint);
      lookup.set(leaf.id, { mesh, index: i });
      bases.push({ leaf, mesh, index: i, base: m.clone(), env: 0 });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const holder = new THREE.Group();
    holder.add(mesh);
    groups.push({ holder, mesh, phase: gi * 2.1 });
  }

  const group = new THREE.Group();
  groups.forEach((g) => group.add(g.holder));

  let activeLeaf = -1;
  const q2 = new THREE.Quaternion();
  const eul = new THREE.Euler();

  return {
    group,
    lookup,
    bases,
    // appelé chaque frame avec l'id de feuille sous la fourmi (-1 si aucune)
    setAntLeaf(id) { activeLeaf = id; },
    update(dt, t) {
      // vent
      for (const g of groups) {
        g.holder.rotation.y = Math.sin(t * 0.35 + g.phase) * 0.013;
        g.holder.rotation.x = Math.sin(t * 0.5 + g.phase * 1.7) * 0.008;
      }
      // rebond de la feuille occupée
      for (const b of bases) {
        const target = b.leaf.id === activeLeaf ? 1 : 0;
        if (b.env < 0.001 && target === 0) continue;
        b.env = damp(b.env, target, target > b.env ? 10 : 3.5, dt);
        eul.set(0, 0, Math.sin(t * 16) * 0.05 * b.env);
        q2.setFromEuler(eul);
        m.compose(
          new THREE.Vector3(b.base.elements[12], b.base.elements[13] - 0.13 * b.env, b.base.elements[14]),
          q2.multiply(new THREE.Quaternion().setFromRotationMatrix(b.base)),
          new THREE.Vector3().setFromMatrixScale(b.base)
        );
        b.mesh.setMatrixAt(b.index, m);
        b.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
