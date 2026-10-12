// Les branches et le tronc en 3D. Une branche est un tube à section de super-ellipse (un peu aplatie
// sur le dessus) construit sous sa ligne de faîte. Deux attributs guident l'écorce :
//  - « chemin » : la bande du dessus où l'on marche, plus lisse et plus claire, comme usée par les passages ;
//  - « mousse » : la mousse pousse sur les épaules de la branche, de part et d'autre du chemin.
import * as THREE from 'three';
import { creerBruit, clamp } from './utils.js';
import { TUILE_ECORCE } from './textures.js';
import { N_SECTION, ECRASEMENT, FRAC_MARCHE } from '../../shared/arbre.js';

const bruit = creerBruit(3, 256);
const lisse = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const signe = (x) => (x < 0 ? -1 : 1);

// Tube le long d'une branche : de s = 0 à Laff (longueur affichée)
export function geometrieChemin(c, Laff, { pas = 0.75 } = {}) {
  const n = N_SECTION;
  const aRef = c.rayon(Math.min(Laff, c.Lmax) / 3, false, Laff);
  const radial = Math.round(clamp(aRef * 9, 14, 40));
  const tours = Math.max(1, Math.round((2 * Math.PI * aRef) / TUILE_ECORCE.tour));
  const anneaux = Math.max(2, Math.ceil(Laff / pas) + 1);
  const pos = new Float32Array(anneaux * (radial + 1) * 3);
  const nor = new Float32Array(anneaux * (radial + 1) * 3);
  const uv = new Float32Array(anneaux * (radial + 1) * 2);
  const chemin = new Float32Array(anneaux * (radial + 1));
  const mousse = new Float32Array(anneaux * (radial + 1));
  let k = 0;
  for (let i = 0; i < anneaux; i++) {
    const s = Math.min(Laff, (i / (anneaux - 1)) * Laff);
    const r = c.repere(s);
    const a = Math.max(0.02, c.rayon(s, false, Laff));
    const b = ECRASEMENT * a;
    const da = (c.rayon(Math.min(Laff, s + 0.3), false, Laff) - c.rayon(Math.max(0, s - 0.3), false, Laff)) / 0.6;
    const cx = r.p[0] - r.n[0] * b;
    const cy = r.p[1] - r.n[1] * b;
    const cz = r.p[2] - r.n[2] * b;
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const cs = Math.cos(phi);
      const sn = Math.sin(phi);
      const x = a * signe(sn) * Math.pow(Math.abs(sn), 2 / n);
      const y = b * signe(cs) * Math.pow(Math.abs(cs), 2 / n);
      pos[k * 3] = cx + r.b[0] * x + r.n[0] * y;
      pos[k * 3 + 1] = cy + r.b[1] * x + r.n[1] * y;
      pos[k * 3 + 2] = cz + r.b[2] * x + r.n[2] * y;
      // normale de la super-ellipse, plus l'inclinaison due au rétrécissement de la branche
      const gx = (signe(x) * Math.pow(Math.abs(x) / a, n - 1)) / a;
      const gy = (signe(y) * Math.pow(Math.abs(y) / b, n - 1)) / b;
      const gl = Math.hypot(gx, gy) || 1;
      const nx = gx / gl;
      const ny = gy / gl;
      const nt = -da;
      const vx = r.b[0] * nx + r.n[0] * ny + r.t[0] * nt;
      const vy = r.b[1] * nx + r.n[1] * ny + r.t[1] * nt;
      const vz = r.b[2] * nx + r.n[2] * ny + r.t[2] * nt;
      const vl = Math.hypot(vx, vy, vz) || 1;
      nor[k * 3] = vx / vl;
      nor[k * 3 + 1] = vy / vl;
      nor[k * 3 + 2] = vz / vl;
      uv[k * 2] = (j / radial) * tours;
      uv[k * 2 + 1] = s / TUILE_ECORCE.long;
      const t = Math.abs(x) / a;
      const dessus = y > 0 ? 1 : 0;
      chemin[k] = dessus * (1 - lisse(FRAC_MARCHE * 0.7, FRAC_MARCHE * 1.05, t));
      const plaque = bruit.fbm(s * 0.35 + c.id * 13.1, phi * 2.2 + 40, 3);
      const epaule = lisse(FRAC_MARCHE * 0.95, FRAC_MARCHE * 1.25, t) * (1 - lisse(0.97, 1.0, t)) * lisse(-0.25, 0.25, y / b);
      const flanc = lisse(0.0, 0.5, y / b) * lisse(0.5, 0.7, plaque);
      mousse[k] = clamp(epaule * (0.55 + 0.9 * plaque) + flanc * 0.7, 0, 1) * (1 - chemin[k]);
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < anneaux - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const p = i * (radial + 1) + j;
      const q = p + radial + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('chemin', new THREE.BufferAttribute(chemin, 1));
  g.setAttribute('mousse', new THREE.BufferAttribute(mousse, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Tronc (ou colonne) : un tube circulaire le long d'une suite de points, rayon donné en chaque point
export function geometrieTronc(points, rayons, { radial = 64, mousse = 0 } = {}) {
  const N = points.length;
  const pos = [];
  const nor = [];
  const uvs = [];
  const ch = [];
  const mo = [];
  let s = 0;
  const rRef = rayons[Math.floor(N / 2)];
  const tours = Math.max(1, Math.round((2 * Math.PI * rRef) / TUILE_ECORCE.tour));
  for (let i = 0; i < N; i++) {
    if (i > 0) s += points[i].distanceTo(points[i - 1]);
    const t = points[Math.min(N - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    let b = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 0, 1));
    if (b.lengthSq() < 1e-6) b = new THREE.Vector3(1, 0, 0);
    b.normalize();
    const nn = new THREE.Vector3().crossVectors(b, t).normalize();
    const dr = (rayons[Math.min(N - 1, i + 1)] - rayons[Math.max(0, i - 1)]) / Math.max(0.01, points[Math.min(N - 1, i + 1)].distanceTo(points[Math.max(0, i - 1)]));
    for (let j = 0; j <= radial; j++) {
      const phi = (j / radial) * Math.PI * 2;
      const d = b.clone().multiplyScalar(Math.cos(phi)).addScaledVector(nn, Math.sin(phi));
      const p = points[i].clone().addScaledVector(d, rayons[i]);
      pos.push(p.x, p.y, p.z);
      const n = d.clone().addScaledVector(t, -dr).normalize();
      nor.push(n.x, n.y, n.z);
      uvs.push((j / radial) * tours, s / TUILE_ECORCE.long);
      ch.push(0);
      const plaque = bruit.fbm(s * 0.25 + 7, phi * 3 + 11, 3);
      mo.push(mousse * lisse(0.55, 0.72, plaque));
    }
  }
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const p = i * (radial + 1) + j;
      const q = p + radial + 1;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('chemin', new THREE.Float32BufferAttribute(ch, 1));
  g.setAttribute('mousse', new THREE.Float32BufferAttribute(mo, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Matériau d'écorce : bande du chemin plus lisse et plus claire, mousse sur les épaules
export function materiauEcorce(textures) {
  const m = new THREE.MeshStandardMaterial({
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(1.6, 1.6),
    roughness: 0.9,
    metalness: 0,
  });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mousse;\nattribute float chemin;\nvarying float vMousse;\nvarying float vChemin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMousse = mousse;\nvChemin = chemin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vMousse;
        varying float vChemin;
        float hashM(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float bruitM(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hashM(i), hashM(i + vec2(1.0, 0.0)), f.x), mix(hashM(i + vec2(0.0, 1.0)), hashM(i + vec2(1.0, 1.0)), f.x), f.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.33));
        vec3 use = mix(diffuseColor.rgb, vec3(lum) * vec3(1.22, 1.0, 0.8), 0.35) * 1.18 + vec3(0.03, 0.02, 0.01);
        diffuseColor.rgb = mix(diffuseColor.rgb, use, vChemin * 0.55);
        // mousse : un vert velouté presque uni, qui gomme le dessin de l'écorce
        float m = smoothstep(0.18, 0.42, vMousse);
        vec2 q = vMapUv * vec2(55.0, 14.0);
        float duvet = bruitM(q) * 0.5 + bruitM(q * 2.7) * 0.3 + bruitM(q * 7.1) * 0.2;
        vec3 vert = mix(vec3(0.17, 0.33, 0.08), vec3(0.36, 0.54, 0.15), duvet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vert, m);`)
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - 0.5 * vChemin) * (1.0 - 0.95 * smoothstep(0.18, 0.42, vMousse));');
  };
  return m;
}
