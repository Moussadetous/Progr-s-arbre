// Textures générées dans le code (aucun fichier image) : écorce, feuille, bois, nuage, halo.
import * as THREE from 'three';
import { creerBruit, clamp } from './utils.js';

function canevas(l, h) {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  return c;
}

function texture(c, { couleur = true, repeter = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (couleur) t.colorSpace = THREE.SRGBColorSpace;
  if (repeter) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Écorce : sillons verticaux, plaques, variations de teinte. Renvoie la couleur et le relief.
export function texturesEcorce(taille = 512) {
  const bruit = creerBruit(11, 256);
  const hauteur = new Float32Array(taille * taille);
  const cc = canevas(taille, taille);
  const gc = cc.getContext('2d');
  const img = gc.createImageData(taille, taille);
  const sombre = [38, 24, 16];
  const clair = [132, 92, 58];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const u = (x / taille) * 8;
      const v = (y / taille) * 8;
      // Sillons : crêtes du bruit, étirées dans le sens de la branche
      const crete = 1 - Math.abs(2 * bruit.fbm(u * 1.0, v * 0.22, 4) - 1);
      const plaque = bruit.fbm(u * 2.1 + 40, v * 0.5 + 12, 4);
      const h = clamp(0.62 * Math.pow(crete, 1.7) + 0.5 * plaque - 0.12, 0, 1);
      hauteur[y * taille + x] = h;
      const t = Math.pow(h, 1.15);
      const i = (y * taille + x) * 4;
      img.data[i] = sombre[0] + (clair[0] - sombre[0]) * t;
      img.data[i + 1] = sombre[1] + (clair[1] - sombre[1]) * t;
      img.data[i + 2] = sombre[2] + (clair[2] - sombre[2]) * t;
      img.data[i + 3] = 255;
    }
  }
  gc.putImageData(img, 0, 0);

  // Relief : normales calculées à partir de la hauteur (filtre de Sobel)
  const cn = canevas(taille, taille);
  const gn = cn.getContext('2d');
  const imn = gn.createImageData(taille, taille);
  const H = (x, y) => hauteur[((y + taille) % taille) * taille + ((x + taille) % taille)];
  const force = 4.5;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      const nx = -dx * force;
      const ny = -dy * force;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * taille + x) * 4;
      imn.data[i] = (nx / l * 0.5 + 0.5) * 255;
      imn.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      imn.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      imn.data[i + 3] = 255;
    }
  }
  gn.putImageData(imn, 0, 0);
  return { map: texture(cc, { repeter: true }), normalMap: texture(cn, { couleur: false, repeter: true }) };
}

// Feuille : dégradé de verts, nervure centrale et nervures secondaires. u = largeur, v = longueur.
export function textureFeuille() {
  const c = canevas(256, 512);
  const g = c.getContext('2d');
  const d = g.createLinearGradient(0, 0, 0, 512);
  d.addColorStop(0, '#2f6b24');
  d.addColorStop(0.55, '#5fa83a');
  d.addColorStop(1, '#9bd45a');
  g.fillStyle = d;
  g.fillRect(0, 0, 256, 512);
  const bruit = creerBruit(5, 64);
  const img = g.getImageData(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 256; x++) {
      const k = (bruit.fbm(x / 20, y / 20, 3) - 0.5) * 38;
      const i = (y * 256 + x) * 4;
      img.data[i] = clamp(img.data[i] + k * 0.6, 0, 255);
      img.data[i + 1] = clamp(img.data[i + 1] + k, 0, 255);
      img.data[i + 2] = clamp(img.data[i + 2] + k * 0.4, 0, 255);
    }
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(230,245,160,0.85)';
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 512);
  g.stroke();
  g.lineWidth = 2.2;
  g.strokeStyle = 'rgba(210,235,140,0.55)';
  for (let y = 30; y < 500; y += 34) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(128, y);
      g.quadraticCurveTo(128 + s * 50, y - 20, 128 + s * 118, y - 58);
      g.stroke();
    }
  }
  return texture(c);
}

// Planches de bois chaud pour les planchers
export function textureBois() {
  const c = canevas(256, 256);
  const g = c.getContext('2d');
  const bruit = creerBruit(23, 64);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    const planche = Math.floor(y / 32);
    const teinte = 0.82 + 0.18 * ((planche * 37) % 7) / 7;
    for (let x = 0; x < 256; x++) {
      const fil = bruit.fbm(x / 70 + planche * 3, y / 4, 3);
      const joint = y % 32 < 2 ? 0.45 : 1;
      const i = (y * 256 + x) * 4;
      const t = (0.55 + 0.45 * fil) * teinte * joint;
      img.data[i] = 205 * t;
      img.data[i + 1] = 140 * t;
      img.data[i + 2] = 82 * t;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c, { repeter: true });
}

// Nuage doux : un disque flou, irrégulier
export function textureNuage() {
  const T = 256;
  const c = canevas(T, T);
  const g = c.getContext('2d');
  const bruit = creerBruit(31, 64);
  const img = g.createImageData(T, T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const dx = (x - T / 2) / (T / 2);
      const dy = (y - T / 2) / (T / 2);
      const r = Math.hypot(dx, dy);
      const n = bruit.fbm(x / 28, y / 28, 4);
      const a = clamp(1 - r, 0, 1);
      const alpha = Math.pow(a, 1.4) * clamp(n * 1.7, 0, 1);
      const i = (y * T + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = alpha * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

// Halo lumineux (lanternes, lampes)
export function textureHalo() {
  const c = canevas(128, 128);
  const g = c.getContext('2d');
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, 'rgba(255,230,170,1)');
  d.addColorStop(0.25, 'rgba(255,190,100,0.55)');
  d.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  return texture(c);
}
