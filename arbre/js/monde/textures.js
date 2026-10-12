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

// Écorce vue de l'extérieur : longues crevasses verticales, plaques gris-brun, grain fin, lichens.
// Renvoie la couleur et le relief. La texture couvre environ 4 m de côté une fois posée sur l'arbre.
export function texturesEcorce(taille = 512) {
  const bruit = creerBruit(11, 256);
  const hauteur = new Float32Array(taille * taille);
  const cc = canevas(taille, taille);
  const gc = cc.getContext('2d');
  const img = gc.createImageData(taille, taille);
  const mix = (a, b, t) => a + (b - a) * t;
  const fond = [28, 24, 22];
  const plaqueSombre = [70, 62, 56];
  const plaqueClaire = [120, 110, 100];
  const lichen = [132, 142, 104];
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const u = (x / taille) * 8;
      const v = (y / taille) * 8;
      // crevasses : lignes de crête du bruit, très étirées dans le sens du tronc, un peu tordues
      const tord = (bruit.fbm(u * 0.5 + 20, v * 0.3 + 7, 2) - 0.5) * 1.6;
      const crete = 1 - Math.abs(2 * bruit.fbm(u * 1.15 + tord, v * 0.14, 5) - 1);
      const crevasse = Math.pow(crete, 5.5);
      // coupures horizontales : les plaques se brisent par morceaux
      const coupe = Math.pow(1 - Math.abs(2 * bruit.fbm(u * 0.9 + 60, v * 0.9 + 33, 3) - 1), 14) * 0.3;
      const grain = bruit.fbm(u * 13, v * 2.4 + 5, 3);
      const fin = bruit.fbm(u * 38, v * 9, 2);
      const h = clamp(1 - crevasse * 0.95 - coupe + (grain - 0.5) * 0.28 + (fin - 0.5) * 0.1, 0, 1);
      hauteur[y * taille + x] = h;
      const plaque = clamp(h * 1.1 + (grain - 0.5) * 0.5, 0, 1);
      let r = mix(plaqueSombre[0], plaqueClaire[0], plaque);
      let g = mix(plaqueSombre[1], plaqueClaire[1], plaque);
      let b = mix(plaqueSombre[2], plaqueClaire[2], plaque);
      const ombre = clamp((crevasse + coupe) * 1.4, 0, 1);
      r = mix(r, fond[0], ombre);
      g = mix(g, fond[1], ombre);
      b = mix(b, fond[2], ombre);
      // lichens clairs, par plaques, sur le haut des plaques
      const l = clamp((bruit.fbm(u * 2.6 + 90, v * 2.2 + 50, 4) - 0.64) * 6, 0, 1) * (1 - ombre) * clamp((fin - 0.3) * 3, 0, 1);
      r = mix(r, lichen[0], l * 0.6);
      g = mix(g, lichen[1], l * 0.6);
      b = mix(b, lichen[2], l * 0.6);
      const i = (y * taille + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  gc.putImageData(img, 0, 0);

  // Relief : normales calculées à partir de la hauteur (filtre de Sobel)
  const cn = canevas(taille, taille);
  const gn = cn.getContext('2d');
  const imn = gn.createImageData(taille, taille);
  const H = (x, y) => hauteur[((y + taille) % taille) * taille + ((x + taille) % taille)];
  const force = 7;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      const nx = -dx * force;
      const ny = -dy * force;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * taille + x) * 4;
      imn.data[i] = (nx / l * 0.5 + 0.5) * 255;
      imn.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      imn.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
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
