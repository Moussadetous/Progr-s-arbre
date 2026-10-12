// La boule marche sur l'arbre : elle se déplace librement sur la surface où elle se trouve.
// Surfaces : une branche (s le long, theta autour), le tronc (phi autour, y en hauteur),
// la place de la capitale (phi, rho) et une feuille (x en travers, z vers le bout, tige comprise).
// Le déplacement reçoit un vecteur monde (distance × direction) projeté sur la surface :
// la boule n'a aucune notion de haut ou de bas, seule la surface sous elle compte.
import { add, sub, mul, dot, normer, clamp, longueur, distance } from './geometrie.js';
import {
  surfaceBranche, rayonA, longueurBranche, repereS, courbeBranche, repereFeuille, hauteurFeuille, demiLargeurPraticable,
  Z_MAX_FEUILLE, localVersMonde, rayonTronc, hauteurTronc, RAYON_BOULE, HAUTEUR_CAPITALE, STEM_LONGUEUR,
} from './monde-arbre.js';

const S_MIN = 2.6; // la branche sort du tronc : en dessous, on est sur le tronc
export const Y_PLACE = HAUTEUR_CAPITALE - 0.22; // dessus du plancher de la capitale
const LARGEUR_PLACE = 4.0;
const PAS_MAX = 0.12;
const DISTANCE_ENTRE_CHANGEMENTS = 0.6;

const norm2 = (a, b) => Math.hypot(a, b);
const enrouler = (a) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

export class Marcheur {
  constructor(monde) {
    this.monde = monde;
    this.etat = { type: 'feuille', i: 0, x: 0, z: 0.6 };
    this.depuis = 99; // distance parcourue depuis le dernier changement de surface
  }

  // ----- surfaces -----
  repere() {
    const e = this.etat;
    const n = this.monde;
    if (e.type === 'branche') {
      const b = n.branches[e.b];
      const sb = surfaceBranche(e.b, b.n, e.s, e.th, RAYON_BOULE);
      const r = sb.repere;
      const circ = [-r.N[0] * Math.sin(e.th) + r.B[0] * Math.cos(e.th), -r.N[1] * Math.sin(e.th) + r.B[1] * Math.cos(e.th), -r.N[2] * Math.sin(e.th) + r.B[2] * Math.cos(e.th)];
      return { pos: sb.pos, normale: sb.normale, a: r.tan, b: circ, rayonB: rayonA(b.n, e.s) + RAYON_BOULE };
    }
    if (e.type === 'tronc') {
      const rho = rayonTronc(e.y) + RAYON_BOULE;
      return {
        pos: [Math.cos(e.phi) * rho, e.y, Math.sin(e.phi) * rho],
        normale: [Math.cos(e.phi), 0, Math.sin(e.phi)],
        a: [0, 1, 0],
        b: [-Math.sin(e.phi), 0, Math.cos(e.phi)],
        rayonB: rho,
      };
    }
    if (e.type === 'place') {
      return {
        pos: [Math.cos(e.phi) * e.rho, Y_PLACE + RAYON_BOULE, Math.sin(e.phi) * e.rho],
        normale: [0, 1, 0],
        a: [Math.cos(e.phi), 0, Math.sin(e.phi)],
        b: [-Math.sin(e.phi), 0, Math.cos(e.phi)],
        rayonB: e.rho,
      };
    }
    // feuille
    const f = n.feuilles[e.i];
    const r = repereFeuille(f, n.branches[f.branche].n);
    const h = hauteurFeuille(e.x, e.z);
    const dh = 0.05;
    const dhx = (hauteurFeuille(e.x + dh, e.z) - hauteurFeuille(e.x - dh, e.z)) / (2 * dh);
    const dhz = (hauteurFeuille(e.x, e.z + dh) - hauteurFeuille(e.x, e.z - dh)) / (2 * dh);
    const nl = normer([-dhx / r.ex, 1 / r.ey, -dhz / r.ez]);
    const normale = normer(add(add(mul(r.x, nl[0]), mul(r.y, nl[1])), mul(r.z, nl[2])));
    const pos = add(localVersMonde(r, [e.x, h, e.z]), mul(normale, RAYON_BOULE));
    return { pos, normale, a: r.x, b: r.z, rayonB: 1, r };
  }

  position() {
    return this.repere().pos;
  }

  normale() {
    return this.repere().normale;
  }

  // ----- déplacement -----
  deplacer(delta) {
    const total = longueur(delta);
    if (total < 1e-9) return;
    const n = Math.ceil(total / PAS_MAX);
    const pas = mul(delta, 1 / n);
    for (let i = 0; i < n; i++) this.pas(pas);
  }

  pas(delta) {
    this.depuis += longueur(delta);
    const rep = this.repere();
    const e = this.etat;
    const dA = dot(delta, rep.a);
    const dB = dot(delta, rep.b);
    if (e.type === 'branche') {
      const b = this.monde.branches[e.b];
      e.s += dA;
      e.th = enrouler(e.th + dB / rep.rayonB);
      const L = longueurBranche(b.n);
      e.s = Math.min(e.s, L - 0.3);
      if (e.s < S_MIN && this.depuis > DISTANCE_ENTRE_CHANGEMENTS) return this.versTronc(this.position());
      e.s = Math.max(e.s, S_MIN - 0.2);
      this.cherchePortes();
    } else if (e.type === 'tronc') {
      e.y += dA;
      e.phi = enrouler(e.phi + dB / rep.rayonB);
      const yMax = hauteurTronc(this.monde.branches.length) - 11;
      e.y = Math.min(e.y, yMax);
      if (e.y < Y_PLACE + 0.4 && this.depuis > DISTANCE_ENTRE_CHANGEMENTS) {
        this.etat = { type: 'place', phi: e.phi, rho: rayonTronc(Y_PLACE) + 0.35 };
        this.depuis = 0;
        return;
      }
      e.y = Math.max(e.y, Y_PLACE + 0.3);
      this.brancheTouchee();
    } else if (e.type === 'place') {
      const rho0 = e.rho;
      const rMin = rayonTronc(Y_PLACE) + 0.15;
      let x = Math.cos(e.phi) * rho0 + Math.cos(e.phi) * dA - Math.sin(e.phi) * dB;
      let z = Math.sin(e.phi) * rho0 + Math.sin(e.phi) * dA + Math.cos(e.phi) * dB;
      e.rho = norm2(x, z);
      e.phi = Math.atan2(z, x);
      if (e.rho < rMin && this.depuis > DISTANCE_ENTRE_CHANGEMENTS) {
        this.etat = { type: 'tronc', phi: e.phi, y: Y_PLACE + 0.9 };
        this.depuis = 0;
        return;
      }
      e.rho = clamp(e.rho, rMin, rayonTronc(Y_PLACE) + LARGEUR_PLACE);
      this.brancheTouchee();
    } else {
      const r = rep.r;
      e.x += dA / r.ex;
      e.z += dB / r.ez;
      if (e.z < 0.02) { if (this.depuis > DISTANCE_ENTRE_CHANGEMENTS) return this.versBrancheDepuisFeuille(); e.z = 0.02; }
      e.z = Math.min(e.z, Z_MAX_FEUILLE);
      const lim = demiLargeurPraticable(e.z);
      e.x = clamp(e.x, -lim, lim);
    }
  }

  // ----- passages d'une surface à l'autre -----
  versTronc(P) {
    const rho = norm2(P[0], P[2]);
    this.etat = { type: 'tronc', phi: Math.atan2(P[2], P[0]), y: Math.max(P[1], Y_PLACE + 0.5) };
    this.depuis = 0;
    return rho;
  }

  // Projette un point du monde sur la branche b (s autour de s0), renvoie l'état branche
  projeterBranche(b, P, s0, fenetre = 3) {
    const n = this.monde.branches[b].n;
    const courbe = courbeBranche(b);
    let meilleur = null;
    for (let s = Math.max(S_MIN, s0 - fenetre); s <= Math.min(longueurBranche(n) - 0.3, s0 + fenetre); s += 0.25) {
      const r = repereS(courbe, s);
      const d = sub(P, r.pos);
      const l = longueur(d);
      const ecart = Math.abs(l - rayonA(n, s));
      if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, s, r, d };
    }
    if (!meilleur) return null;
    const { r, d } = meilleur;
    return { type: 'branche', b, s: meilleur.s, th: Math.atan2(dot(d, r.B), dot(d, r.N)) };
  }

  versBrancheDepuisFeuille() {
    const f = this.monde.feuilles[this.etat.i];
    const P = this.position();
    const e = this.projeterBranche(f.branche, P, f.s, 3);
    if (e) {
      this.etat = e;
      this.depuis = 0;
    }
  }

  // Depuis le tronc ou la place : si la boule touche le pied d'une branche, elle monte dessus
  brancheTouchee() {
    if (this.depuis < DISTANCE_ENTRE_CHANGEMENTS) return;
    const P = this.position();
    for (const b of this.monde.branches) {
      const n = b.n;
      const courbe = courbeBranche(b.id);
      for (let s = S_MIN + 0.4; s <= S_MIN + 9; s += 0.8) {
        const r = repereS(courbe, s);
        const d = distance(P, r.pos);
        if (d < rayonA(n, s) + RAYON_BOULE + 0.12) {
          const v = sub(P, r.pos);
          this.etat = { type: 'branche', b: b.id, s: Math.max(s, S_MIN + 0.5), th: Math.atan2(dot(v, r.B), dot(v, r.N)) };
          this.depuis = 0;
          return;
        }
      }
    }
  }

  // Sur une branche : le plancher de la capitale (pied des 4 premières branches) et les tiges des feuilles
  cherchePortes() {
    if (this.depuis < DISTANCE_ENTRE_CHANGEMENTS) return;
    const e = this.etat;
    const P = this.position();
    // la place de la capitale : on descend le flanc jusqu'au plancher
    const rho = norm2(P[0], P[2]);
    if (P[1] < Y_PLACE + 0.2 && rho > rayonTronc(Y_PLACE) + 0.2 && rho < rayonTronc(Y_PLACE) + LARGEUR_PLACE) {
      this.etat = { type: 'place', phi: Math.atan2(P[2], P[0]), rho };
      this.depuis = 0;
      return;
    }
    for (const f of this.monde.feuilles) {
      if (f.branche !== e.b || Math.abs(f.s - e.s) > 2) continue;
      const r = repereFeuille(f, this.monde.branches[f.branche].n);
      if (distance(P, r.origine) < 0.7) {
        this.etat = { type: 'feuille', i: f.indice, x: 0, z: 0.25 };
        this.depuis = 0;
        return;
      }
    }
  }

  // ----- téléportation (début de partie, retour chez soi) -----
  poserSurFeuille(i, z = STEM_LONGUEUR + 2.6) {
    this.etat = { type: 'feuille', i, x: 0, z };
    this.depuis = 99;
  }
}
