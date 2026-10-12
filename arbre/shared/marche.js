// La boule marche avec la gravité : on lui donne un déplacement horizontal, elle suit la surface sous elle.
// Elle monte et descend les pentes douces toute seule, franchit les petites marches (raccords de branches,
// seuil d'une maison) et s'arrête au bord : on ne tombe pas, et on ne passe jamais sous une branche.
import { RAYON_BOULE } from './sol.js';

export const MARCHE_MAX = 0.24; // hauteur d'une marche franchissable (m)
export const DESCENTE_MAX = 0.5; // on peut descendre une petite marche, pas sauter dans le vide
export const PENTE_MAX = Math.tan((36 * Math.PI) / 180);
const PAS = 0.05;
const GLISSEMENTS = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2];

export class Marcheur {
  constructor(sol) {
    this.sol = sol;
    this.p = [0, 0, 0];
    this.appui = null;
  }

  // Pose la boule sur la surface sous (x, z), au plus près de la hauteur y
  poser(x, y, z) {
    const s = this.sol.support(x, z, y - 3, y + 3);
    if (!s) return false;
    this.p = [x, s.h + RAYON_BOULE, z];
    this.appui = s;
    return true;
  }

  // Déplacement horizontal (dx, dz) : renvoie la distance réellement parcourue
  deplacer(dx, dz) {
    const total = Math.hypot(dx, dz);
    if (total < 1e-9) return 0;
    const n = Math.ceil(total / PAS);
    let parcouru = 0;
    for (let i = 0; i < n; i++) {
      // en montée, on avance moins vite à l'horizontale
      const pente = this.appui ? Math.abs(this.appui.pente || 0) : 0;
      const k = Math.sqrt(Math.max(0.2, 1 - pente * pente));
      parcouru += this.pas((dx / n) * k, (dz / n) * k);
    }
    return parcouru;
  }

  pas(dx, dz) {
    const [x, y, z] = this.p;
    const h0 = y - RAYON_BOULE;
    const d = Math.hypot(dx, dz);
    for (const a of GLISSEMENTS) {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const rx = (dx * c - dz * sn) * c;
      const rz = (dx * sn + dz * c) * c;
      const lg = Math.hypot(rx, rz);
      if (lg < 1e-6) continue;
      const sup = this.sol.support(x + rx, z + rz, h0 - DESCENTE_MAX - lg * 1.5, h0 + MARCHE_MAX + lg * PENTE_MAX);
      if (!sup) continue;
      const np = [x + rx, sup.h + RAYON_BOULE, z + rz];
      if (this.sol.bloque(np, RAYON_BOULE, sup.source)) continue;
      this.p = np;
      this.appui = sup;
      return lg;
    }
    return 0;
  }
}
