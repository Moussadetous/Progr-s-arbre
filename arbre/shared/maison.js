// La feuille-maison : une seule grande feuille enroulée, posée au bord du chemin.
// Sa base sort de l'écorce au bord du chemin, elle s'étend à plat (le plancher), puis remonte
// derrière et retombe en toit au-dessus de l'entrée. On entre par la base, depuis le chemin.
//
// Repère local de la maison (mètres) : x le long de la branche, y vers le haut, z vers l'extérieur.
// L'origine est le bord du chemin, à la hauteur où l'on marche.
import { clamp } from './geometrie.js';

export const BASE = 0.9; // la base s'enfonce dans l'écorce sur 0,9 m
export const PLANCHER = 2.6; // profondeur du plancher (m)
export const RAYON_ROULEAU = 1.75; // rayon de l'enroulement (m)
export const ANGLE_ROULEAU = 4.6; // jusqu'où la feuille s'enroule (rad) : le bout retombe au-dessus de l'entrée
export const LONGUEUR_FEUILLE = BASE + PLANCHER + RAYON_ROULEAU * ANGLE_ROULEAU;
export const DEMI_LARGEUR_MAX = 2.6;
export const CREUX = 0.9; // les bords de la feuille se relèvent (m)
export const RAYON_ENCOMBREMENT = 3.1; // sphère qui contient la maison (pour les collisions)
export const CENTRE_ENCOMBREMENT = [0, 1.5, 2.2];

const lisse = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Demi-largeur de la feuille selon la position relative q (0 = base, 1 = pointe)
export function demiLargeur(q) {
  if (q <= 0.6) return 0.55 + (DEMI_LARGEUR_MAX - 0.55) * lisse(0, 0.42, q);
  return DEMI_LARGEUR_MAX * Math.pow(Math.max(0, (1 - q) / 0.4), 0.7);
}

// Nervure centrale : position (z, y) et normale intérieure (vers le creux) à la distance d depuis la base
export function nervure(d) {
  if (d < BASE) {
    const k = (BASE - d) / BASE; // 1 à la base, 0 au bord du chemin
    return { z: -BASE * k, y: -0.35 * k * k, nz: 0, ny: 1 };
  }
  if (d < BASE + PLANCHER) return { z: d - BASE, y: 0, nz: 0, ny: 1 };
  const phi = (d - BASE - PLANCHER) / RAYON_ROULEAU;
  return {
    z: PLANCHER + RAYON_ROULEAU * Math.sin(phi),
    y: RAYON_ROULEAU * (1 - Math.cos(phi)),
    nz: -Math.sin(phi),
    ny: Math.cos(phi),
  };
}

// Point de la feuille : u de -1 à 1 en travers, v de 0 (base) à 1 (pointe)
export function pointFeuille(u, v) {
  const d = v * LONGUEUR_FEUILLE;
  const c = nervure(d);
  const hw = demiLargeur(v);
  const au = Math.abs(u);
  const creux = CREUX * (d < BASE + PLANCHER ? 1 : 1.25) * Math.pow(au, 1.8);
  return [u * hw * (1 - 0.12 * au), c.y + c.ny * creux, c.z + c.nz * creux];
}

// Le plancher où la boule peut rouler : renvoie la hauteur locale, ou null hors du plancher
export const Z_ENTREE = -0.3;
export const Z_FOND = PLANCHER - 0.25;
export function solLocal(x, z) {
  if (z < Z_ENTREE || z > Z_FOND) return null;
  const q = (z + BASE) / LONGUEUR_FEUILLE;
  const hw = demiLargeur(q);
  const lim = 0.62 * hw;
  if (Math.abs(x) > lim) return null;
  const u = Math.abs(x) / hw;
  const base = z < 0 ? -0.35 * (z / -BASE) ** 2 : 0;
  return base + CREUX * Math.pow(u, 1.8);
}

// Lanterne-graine suspendue sous le toit (repère local)
export const LANTERNE = [0, 2.3, 1.9];
// Centre du plancher : là où l'on se pose en arrivant chez soi
export const CENTRE_PLANCHER = [0, 0, 1.3];
