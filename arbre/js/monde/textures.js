// Textures générées dans le code (aucun fichier image) : écorce, feuille, bois, nuage, halo, écran.
// Toutes les textures qui se répètent sont raccordées sans couture (bruit périodique, fréquences entières).
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

const melange = (a, b, t) => a + (b - a) * t;
const lisse = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Écorce vue de l'extérieur : de longues côtes fibreuses qui suivent la branche, séparées par des sillons
// sombres, quelques cassures, un grain fin. Une tuile couvre environ 3 m de tour et 12 m de long.
// u (largeur) : autour de la branche ; v (hauteur) : le long de la branche.
export const TUILE_ECORCE = { tour: 3, long: 12 };
export function texturesEcorce(L = 384, H = 1024) {
  const P = 8; // période du bruit : la tuile va de 0 à 8 dans les deux sens
  const bruit = creerBruit(11, P);
  const hauteur = new Float32Array(L * H);
  const cc = canevas(L, H);
  const gc = cc.getContext('2d');
  const img = gc.createImageData(L, H);
  const sillon = [36, 24, 16];
  const cote = [104, 72, 46];
  const clair = [148, 110, 74];
  const gris = [118, 104, 92];
  const COTES = 7; // côtes autour de la tuile
  for (let y = 0; y < H; y++) {
    const v = (y / H) * P;
    for (let x = 0; x < L; x++) {
      const u = (x / L) * P;
      // les côtes serpentent doucement le long de la branche
      const ondule = (bruit.fbm(u, v, 3) - 0.5) * 1.3;
      const phase = (u / P) * COTES + ondule;
      const f = phase - Math.floor(phase);
      const profil = Math.pow(Math.sin(Math.PI * f), 0.55); // côtes arrondies, sillons étroits
      // les côtes se fendent par endroits (plaques allongées)
      const fente = lisse(0.68, 0.8, bruit(u * 2 + 31, v * 3 + 7)) * 0.55;
      const fibres = bruit.fbm(u * 16, v * 2, 3);
      const grain = bruit(u * 32, v * 8);
      const h = clamp(profil * (1 - fente) + (fibres - 0.5) * 0.35 + (grain - 0.5) * 0.12, 0, 1);
      hauteur[y * L + x] = h;
      const teinte = bruit.fbm(u + 50, v + 20, 2);
      let r = melange(cote[0], clair[0], clamp(h * 1.2 - 0.25 + (fibres - 0.5) * 0.6, 0, 1));
      let g = melange(cote[1], clair[1], clamp(h * 1.2 - 0.25 + (fibres - 0.5) * 0.6, 0, 1));
      let b = melange(cote[2], clair[2], clamp(h * 1.2 - 0.25 + (fibres - 0.5) * 0.6, 0, 1));
      const gr = lisse(0.55, 0.75, teinte) * 0.45;
      r = melange(r, gris[0], gr);
      g = melange(g, gris[1], gr);
      b = melange(b, gris[2], gr);
      const creux = clamp(1 - h * 1.6, 0, 1);
      r = melange(r, sillon[0], creux);
      g = melange(g, sillon[1], creux);
      b = melange(b, sillon[2], creux);
      const i = (y * L + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  gc.putImageData(img, 0, 0);

  // Relief : normales calculées à partir de la hauteur (filtre de Sobel), raccordées aux bords
  const cn = canevas(L, H);
  const gn = cn.getContext('2d');
  const imn = gn.createImageData(L, H);
  const Ht = (x, y) => hauteur[((y + H) % H) * L + ((x + L) % L)];
  const force = 5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const dx = (Ht(x + 1, y - 1) + 2 * Ht(x + 1, y) + Ht(x + 1, y + 1)) - (Ht(x - 1, y - 1) + 2 * Ht(x - 1, y) + Ht(x - 1, y + 1));
      const dy = (Ht(x - 1, y + 1) + 2 * Ht(x, y + 1) + Ht(x + 1, y + 1)) - (Ht(x - 1, y - 1) + 2 * Ht(x, y - 1) + Ht(x + 1, y - 1));
      const nx = -dx * force;
      const ny = dy * force;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * L + x) * 4;
      imn.data[i] = (nx / l * 0.5 + 0.5) * 255;
      imn.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      imn.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      imn.data[i + 3] = 255;
    }
  }
  gn.putImageData(imn, 0, 0);
  return { map: texture(cc, { repeter: true }), normalMap: texture(cn, { couleur: false, repeter: true }) };
}

// Feuille-maison : vert profond, nervure centrale claire, nervures secondaires vers la pointe,
// bord légèrement doré. u : largeur (0..1), v : de la base (0) à la pointe (1).
export function textureFeuille() {
  const L = 256;
  const H = 768;
  const c = canevas(L, H);
  const g = c.getContext('2d');
  const bruit = creerBruit(5, 32);
  const img = g.createImageData(L, H);
  for (let y = 0; y < H; y++) {
    const v = 1 - y / H; // l'image est retournée : y = 0 en haut = pointe
    for (let x = 0; x < L; x++) {
      const u = x / L - 0.5; // -0.5 .. 0.5
      const au = Math.abs(u) * 2;
      const n = bruit.fbm((x / L) * 32, (y / H) * 32 * 3, 3);
      // nervures secondaires : arcs qui partent de la nervure centrale vers le bord et la pointe
      const phase = (v * 14 - au * 2.6) % 1;
      const nervure = Math.pow(1 - Math.abs(((phase + 1) % 1) * 2 - 1), 18) * lisse(0.04, 0.2, au) * (1 - lisse(0.75, 0.98, au));
      const centrale = Math.pow(clamp(1 - au / 0.035, 0, 1), 1.5);
      let r = melange(46, 84, v * 0.5 + au * 0.4) + (n - 0.5) * 30;
      let gg = melange(110, 150, v * 0.4 + au * 0.3) + (n - 0.5) * 40;
      let b = melange(30, 46, v * 0.4) + (n - 0.5) * 16;
      const dore = lisse(0.8, 1, au) * 0.5;
      r = melange(r, 168, dore);
      gg = melange(gg, 168, dore);
      b = melange(b, 70, dore);
      const veine = Math.max(nervure * 0.55, centrale * 0.85);
      r = melange(r, 214, veine);
      gg = melange(gg, 230, veine);
      b = melange(b, 150, veine);
      const i = (y * L + x) * 4;
      img.data[i] = clamp(r, 0, 255);
      img.data[i + 1] = clamp(gg, 0, 255);
      img.data[i + 2] = clamp(b, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

// Planches de bois chaud pour le plancher de la capitale (raccordées sans couture)
export function textureBois() {
  const T = 256;
  const c = canevas(T, T);
  const g = c.getContext('2d');
  const bruit = creerBruit(23, 4);
  const img = g.createImageData(T, T);
  for (let y = 0; y < T; y++) {
    const planche = Math.floor(y / 32);
    const teinte = 0.82 + (0.18 * ((planche * 37) % 7)) / 7;
    for (let x = 0; x < T; x++) {
      const fil = bruit.fbm((x / T) * 4 + planche, (y / T) * 4 * 8, 3);
      const joint = y % 32 < 2 ? 0.45 : 1;
      const i = (y * T + x) * 4;
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

// Écran flottant de la capitale : un paysage du soir et un bouton lecture
export function textureEcran(graine = 1) {
  const L = 512;
  const H = 300;
  const c = canevas(L, H);
  const g = c.getContext('2d');
  const ciel = g.createLinearGradient(0, 0, 0, H);
  const teintes = [['#3b3f8f', '#e98b6d', '#ffd08a'], ['#24527a', '#7fc2c9', '#f6e3a1'], ['#5b2c6f', '#d36b8c', '#ffc27a']][graine % 3];
  ciel.addColorStop(0, teintes[0]);
  ciel.addColorStop(0.6, teintes[1]);
  ciel.addColorStop(1, teintes[2]);
  g.fillStyle = ciel;
  g.fillRect(0, 0, L, H);
  g.fillStyle = 'rgba(30,20,40,0.55)';
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= L; x += 16) g.lineTo(x, H * 0.72 - Math.sin(x / 60 + graine) * 18 - Math.sin(x / 23) * 6);
  g.lineTo(L, H);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.beginPath();
  g.arc(L / 2, H / 2, 38, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = teintes[0];
  g.beginPath();
  g.moveTo(L / 2 - 12, H / 2 - 20);
  g.lineTo(L / 2 + 22, H / 2);
  g.lineTo(L / 2 - 12, H / 2 + 20);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, L - 6, H - 6);
  return texture(c);
}
