// Petits outils de l'atelier : bruit, textures procédurales de base, fusion de géométries.
import * as THREE from 'three';

// Bruit de valeur 2D, périodique (pour que les textures se répètent sans couture)
export function creerBruit(graine = 1, periode = 256) {
  let s = graine >>> 0;
  const alea = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const grille = new Float32Array(periode * periode);
  for (let i = 0; i < grille.length; i++) grille[i] = alea();
  const lisse = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => grille[((y % periode) + periode) % periode * periode + (((x % periode) + periode) % periode)];
  const bruit = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = lisse(x - x0);
    const fy = lisse(y - y0);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * fx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  // Bruit fractal : plusieurs octaves
  bruit.fbm = (x, y, octaves = 4) => {
    let somme = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      somme += amp * bruit(x * f, y * f);
      f *= 2;
      amp *= 0.5;
    }
    return somme;
  };
  return bruit;
}

// Fusionne des pièces (géométrie, matrice, couleur) en une seule géométrie à couleurs de sommets
export function fusionner(pieces) {
  const positions = [];
  const normales = [];
  const couleurs = [];
  const uvs = [];
  const n = new THREE.Vector3();
  const m3 = new THREE.Matrix3();
  for (const { geo, matrice, couleur } of pieces) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrice);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const c = new THREE.Color(couleur);
    m3.getNormalMatrix(matrice);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      normales.push(n.x, n.y, n.z);
      couleurs.push(c.r, c.g, c.b);
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
}

export const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
