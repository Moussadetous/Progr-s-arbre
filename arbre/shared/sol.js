// Le sol de la boule, avec la gravité : la boule repose sur la surface praticable la plus haute sous elle
// (dessus d'une branche, plancher d'une maison, plancher de la capitale), et ne peut traverser ni le bois
// des branches, ni le tronc, ni les colonnes de la capitale. On ne tourne jamais autour d'une branche :
// on marche sur son dessus, comme sur un chemin.
import { sub, dot } from './geometrie.js';
import {
  Y0, R_SOL, R_SCENE, H_SCENE, H_SALLE, COLONNES, rayonTronc, N_SECTION, ECRASEMENT,
} from './arbre.js';
import * as MAISON from './maison.js';

export const RAYON_BOULE = 0.07;

export class Sol {
  constructor(arbre) {
    this.arbre = arbre;
  }

  // Projette (x, z) sur le faîte du chemin c, à partir de l'échantillon i
  surChemin(c, x, z, i) {
    let s = c.courbe.ech[i].s;
    for (let k = 0; k < 4; k++) {
      const r = c.repere(s);
      const th2 = r.t[0] * r.t[0] + r.t[2] * r.t[2];
      if (th2 < 1e-6) return null;
      const ds = ((x - r.p[0]) * r.t[0] + (z - r.p[2]) * r.t[2]) / th2;
      s += ds;
      if (Math.abs(ds) < 1e-4) break;
    }
    if (s < 0 || s > c.sMarcheMax()) return null;
    const r = c.repere(s);
    const w = (x - r.p[0]) * r.b[0] + (z - r.p[2]) * r.b[2];
    if (Math.abs(w) > c.demiLargeurMarche(s)) return null;
    return { h: r.p[1] - r.n[1] * c.creux(s, w), s, w, pente: r.t[1] };
  }

  // La surface praticable la plus haute sous (x, z) dont la hauteur est entre hMin et hMax
  support(x, z, hMin, hMax) {
    let meilleur = null;
    const proposer = (h, source, pente) => {
      if (h < hMin || h > hMax) return;
      if (!meilleur || h > meilleur.h) meilleur = { h, source, pente };
    };
    const rr = Math.hypot(x, z);
    if (rr <= R_SOL) proposer(rr <= R_SCENE ? Y0 + H_SCENE : Y0, { type: 'capitale' }, 0);
    const proches = new Map();
    const maisons = [];
    this.arbre.grille.autour(x, z, 7, (o) => {
      if (o.maison) { maisons.push(o.maison); return; }
      const e = o.chemin.courbe.ech[o.i];
      const d = (e.p[0] - x) ** 2 + (e.p[2] - z) ** 2;
      const v = proches.get(o.chemin);
      if (!v || d < v.d) proches.set(o.chemin, { d, i: o.i });
    });
    for (const [c, v] of proches) {
      const r = this.surChemin(c, x, z, v.i);
      if (r) proposer(r.h, { type: 'chemin', id: c.id, s: r.s, w: r.w }, r.pente);
    }
    for (const m of maisons) {
      const rep = this.arbre.repereMaison(m);
      const lx = (x - rep.O[0]) * rep.X[0] + (z - rep.O[2]) * rep.X[2];
      const lz = (x - rep.O[0]) * rep.Z[0] + (z - rep.O[2]) * rep.Z[2];
      const y = MAISON.solLocal(lx, lz);
      if (y !== null) proposer(rep.O[1] + y, { type: 'maison', id: m.indice, x: lx, z: lz }, 0);
    }
    return meilleur;
  }

  // Le point p (centre d'une sphère de rayon rho) est-il dans le bois ? On peut ignorer le chemin porteur.
  bloque(p, rho, ignorer = null, { maisons = false, saufMaison = null } = {}) {
    const [x, y, z] = p;
    const rr = Math.hypot(x, z);
    if (y > Y0 - 0.3 && y < Y0 + H_SALLE - 0.3) {
      for (const col of COLONNES) if (Math.hypot(x - col.x, z - col.z) < col.r + rho) return true;
      if (y > Y0 + H_SALLE - 0.8 && rr < rayonTronc(y)) return true;
    } else if (y <= Y0 - 0.3 && rr < rayonTronc(y) + rho) {
      return true;
    } else if (y >= Y0 + H_SALLE - 0.3 && rr < rayonTronc(y) + rho) {
      return true;
    }
    let dedans = false;
    const proches = new Map();
    this.arbre.grille.autour(x, z, 7, (o) => {
      if (dedans) return;
      if (o.maison) {
        if (maisons && o.maison.indice !== saufMaison) {
          const enc = o.maison.encombrement;
          const d = Math.hypot(x - enc.centre[0], y - enc.centre[1], z - enc.centre[2]);
          if (d < enc.rayon * 0.82 + rho) dedans = true;
        }
        return;
      }
      if (ignorer && ignorer.type === 'chemin' && o.chemin.id === ignorer.id) return;
      const e = o.chemin.courbe.ech[o.i];
      const d = (e.p[0] - x) ** 2 + (e.p[1] - y) ** 2 + (e.p[2] - z) ** 2;
      const v = proches.get(o.chemin);
      if (!v || d < v.d) proches.set(o.chemin, { d, i: o.i });
    });
    if (dedans) return true;
    for (const [c, v] of proches) if (this.dansChemin(c, p, rho, v.i)) return true;
    return false;
  }

  dansChemin(c, p, rho, i) {
    let s = c.courbe.ech[i].s;
    for (let k = 0; k < 4; k++) {
      const r = c.repere(s);
      const ds = dot(sub(p, r.p), r.t);
      s += ds;
      if (Math.abs(ds) < 1e-4) break;
    }
    const L = c.type === 'pont' ? c.Lmax : c.Lvis;
    if (s < 0 || s > L) return false;
    const r = c.repere(s);
    const a = c.rayon(s);
    if (a < 0.02) return false;
    const b = ECRASEMENT * a;
    const d = sub(p, r.p);
    const lx = dot(d, r.b);
    const ly = dot(d, r.n) + b; // par rapport au centre de la section
    const f = Math.pow(Math.abs(lx) / (a + rho), N_SECTION) + Math.pow(Math.abs(ly) / (b + rho), N_SECTION);
    return f < 0.95;
  }
}
