// Petits utilitaires mathématiques et textures procédurales
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Amortissement exponentiel indépendant du framerate
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

// ---------- Textures canvas ----------

export function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Disque doux (pour particules, halos)
export function softCircleTexture(inner = 0.0, color = '255,255,255') {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 32 * inner, 32, 32, 32);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.4, `rgba(${color},0.55)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Dégradé vertical doux (rayons de soleil)
export function rayTexture() {
  const c = makeCanvas(128);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,240,200,0.9)');
  grad.addColorStop(0.5, 'rgba(255,240,200,0.35)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Bord horizontal adouci
  const gx = g.createLinearGradient(0, 0, 128, 0);
  gx.addColorStop(0, 'rgba(0,0,0,1)');
  gx.addColorStop(0.25, 'rgba(0,0,0,0)');
  gx.addColorStop(0.75, 'rgba(0,0,0,0)');
  gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = gx;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture de feuille tombante (dessinée à la main)
export function fallingLeafTexture() {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.rotate(0.6);
  const grad = g.createLinearGradient(-20, 0, 20, 0);
  grad.addColorStop(0, '#e9b44c');
  grad.addColorStop(1, '#f4d58d');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -22);
  g.quadraticCurveTo(16, -6, 0, 22);
  g.quadraticCurveTo(-16, -6, 0, -22);
  g.fill();
  g.strokeStyle = 'rgba(120,80,20,0.8)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -20);
  g.lineTo(0, 20);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Aile de papillon
export function butterflyWingTexture() {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(8, 32, 4, 32, 32, 34);
  grad.addColorStop(0, '#ffd27d');
  grad.addColorStop(0.6, '#f2955e');
  grad.addColorStop(1, 'rgba(180,70,40,0.1)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(2, 32);
  g.bezierCurveTo(10, 2, 52, 4, 60, 24);
  g.bezierCurveTo(56, 44, 20, 58, 2, 32);
  g.fill();
  g.fillStyle = 'rgba(60,25,15,0.85)';
  g.beginPath(); g.arc(38, 18, 4, 0, 7); g.fill();
  g.beginPath(); g.arc(30, 40, 3, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture du sol (mousse, herbe, terre) — tuile bruitée peinte
export function groundTexture() {
  const c = makeCanvas(256);
  const g = c.getContext('2d');
  g.fillStyle = '#5f8142';
  g.fillRect(0, 0, 256, 256);
  const blotch = (x, y, r, col) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const cols = ['rgba(94,132,60,0.75)', 'rgba(76,110,48,0.7)', 'rgba(120,150,72,0.6)', 'rgba(150,128,66,0.5)', 'rgba(108,140,64,0.6)'];
  let s = 12345;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 260; i++) {
    blotch(rand() * 256, rand() * 256, 8 + rand() * 26, cols[(rand() * 4) | 0]);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${(rand() * 60 + 50) | 0},${(rand() * 70 + 90) | 0},50,0.55)`;
    g.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

// ---------- Géométrie ----------

// Fusionne plusieurs géométries (avec matrices et couleurs) en une seule.
// Toutes les géométries sont converties en non-indexées pour simplifier.
export function mergeGeometries(parts) {
  let total = 0;
  const prepped = parts.filter(Boolean).map((part) => {
    const isGeo = !!part.isBufferGeometry;
    const geo = isGeo ? part : part.geo;
    const matrix = isGeo || !part.matrix ? null : part.matrix;
    const color = isGeo || !part.color ? null : part.color;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    total += g.attributes.position.count;
    return { g, color };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (const { g, color } of prepped) {
    const p = g.attributes.position, nn = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      if (nn) {
        n.set(nn.getX(i), nn.getY(i), nn.getZ(i));
        n.toArray(nor, (o + i) * 3);
      }
      if (color) {
        c.set(color);
        c.toArray(col, (o + i) * 3);
      }
    }
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Construit un tube le long d'une colonne de points, avec rayon variable,
// couleurs par sommet et cadres transportés en parallèle (pas de torsion).
export function buildTube(points, radii, opts = {}) {
  const ringSeg = opts.ringSeg || 7;
  const colorFn = opts.colorFn || null; // (ringNormal, point, ringIndex) => THREE.Color
  const n = points.length;
  if (n < 2) return null;

  // Tangentes
  const tans = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    tans.push(t);
  }
  // Premier vecteur u perpendiculaire à t0
  let u = new THREE.Vector3(0, 1, 0);
  if (Math.abs(u.dot(tans[0])) > 0.9) u.set(1, 0, 0);
  u = new THREE.Vector3().crossVectors(tans[0], u).cross(tans[0]).normalize();
  const axis = new THREE.Vector3(), q = new THREE.Quaternion();
  const us = [u.clone()];
  for (let i = 1; i < n; i++) {
    axis.crossVectors(tans[i - 1], tans[i]);
    const l = axis.length();
    if (l > 1e-4) {
      const ang = Math.acos(clamp(tans[i - 1].dot(tans[i]), -1, 1));
      q.setFromAxisAngle(axis.normalize(), ang);
      u.applyQuaternion(q);
    }
    us.push(u.clone());
  }

  const vCount = n * ringSeg;
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = [];
  const ringN = new THREE.Vector3(), vv = new THREE.Vector3(), cc = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const p = points[i], r = radii[i], uu = us[i], t = tans[i];
    vv.crossVectors(t, uu).normalize();
    for (let j = 0; j < ringSeg; j++) {
      const a = (j / ringSeg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ringN.set(
        uu.x * ca + vv.x * sa,
        uu.y * ca + vv.y * sa,
        uu.z * ca + vv.z * sa
      ).normalize();
      const vi = i * ringSeg + j;
      pos[vi * 3] = p.x + ringN.x * r;
      pos[vi * 3 + 1] = p.y + ringN.y * r;
      pos[vi * 3 + 2] = p.z + ringN.z * r;
      ringN.toArray(nor, vi * 3);
      if (colorFn) {
        cc.copy(colorFn(ringN, p, i, n));
        cc.toArray(col, vi * 3);
      } else {
        cc.setRGB(1, 1, 1); cc.toArray(col, vi * 3);
      }
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < ringSeg; j++) {
      const a = i * ringSeg + j;
      const b = i * ringSeg + (j + 1) % ringSeg;
      const c = (i + 1) * ringSeg + j;
      const d = (i + 1) * ringSeg + (j + 1) % ringSeg;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (colorFn) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
