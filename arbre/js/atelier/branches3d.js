// Le tronc et les quatre grosses branches : tubes courbes, écorce en relief, mousse sur le dessus.
import * as THREE from 'three';
import { creerBruit, clamp } from './utils.js';
import { texturesEcorce } from './textures.js';

const bruit = creerBruit(3, 256);

// Construit un tube le long des repères d'une courbe
export function construireTube(frames, { radial = 30, repetitions = 3, mousse = true, bosses = 0.07, grain = 5 }) {
  const n = frames.length;
  const pos = [];
  const nor = [];
  const uv = [];
  const mou = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const g = frames[Math.min(n - 1, i + 1)];
    const h = frames[Math.max(0, i - 1)];
    const pente = (h.rayon - g.rayon) / Math.max(1e-6, g.s - h.s); // l'écorce se resserre vers le bout
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const dir = [f.N[0] * c + f.B[0] * s, f.N[1] * c + f.B[1] * s, f.N[2] * c + f.B[2] * s];
      // Bosses et nœuds : une déformation douce, périodique autour du tube
      const b = 1 + bosses * (bruit.fbm(f.s * 0.35 + 5, Math.cos(phi) * 2 + Math.sin(phi) * 2 + 9, 3) - 0.5) * 2.2;
      const r = f.rayon * b;
      pos.push(f.pos[0] + dir[0] * r, f.pos[1] + dir[1] * r, f.pos[2] + dir[2] * r);
      const nx = dir[0] + f.tan[0] * pente;
      const ny = dir[1] + f.tan[1] * pente;
      const nz = dir[2] + f.tan[2] * pente;
      const l = Math.hypot(nx, ny, nz);
      nor.push(nx / l, ny / l, nz / l);
      uv.push((j / radial) * repetitions, f.s / grain);
      // Mousse : sur les faces tournées vers le haut, par plaques irrégulières
      const dessus = clamp((ny / l - 0.15) / 0.65, 0, 1);
      const plaque = bruit.fbm(f.s * 0.5 + 100, phi * 1.5 + 30, 3);
      mou.push(mousse ? dessus * clamp(plaque * 1.7 - 0.1, 0, 1) : 0);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('mousse', new THREE.Float32BufferAttribute(mou, 1));
  g.setIndex(idx);
  return g;
}

// Matériau d'écorce avec mousse : le vert se mélange à la couleur du bois là où l'attribut « mousse » est fort
export function materiauEcorce(textures) {
  const m = new THREE.MeshStandardMaterial({
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughness: 0.92,
    metalness: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mousse;\nvarying float vMousse;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMousse = mousse;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMousse;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.33));
        vec3 vert = vec3(0.17, 0.40, 0.09) * (0.55 + 2.4 * lum);
        diffuseColor.rgb = mix(diffuseColor.rgb, vert, smoothstep(0.28, 0.62, vMousse));`);
  };
  return m;
}

export function creerBranches3d(scene, squelette) {
  const textures = texturesEcorce(512);
  textures.map.repeat.set(1, 1);
  const materiau = materiauEcorce(textures);
  const groupe = new THREE.Group();

  const tronc = new THREE.Mesh(
    construireTube(squelette.tronc.frames, { radial: 48, repetitions: 7, grain: 8, bosses: 0.05 }),
    materiau,
  );
  tronc.castShadow = true;
  tronc.receiveShadow = true;
  groupe.add(tronc);

  const meshes = [];
  for (const b of squelette.branches) {
    const m = new THREE.Mesh(
      construireTube(b.frames, { radial: 32, repetitions: 3, grain: 5, bosses: 0.08 }),
      materiau,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    groupe.add(m);
    meshes.push(m);
  }
  scene.add(groupe);
  return { groupe, tronc, branches: meshes };
}
