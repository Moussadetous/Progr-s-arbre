// Aide pour les tests : un itinéraire à pied d'une maison à une autre, puis une boule qui le suit pas à pas.
import { Marcheur } from '../shared/marche.js';
import { RAYON_BOULE } from '../shared/sol.js';
import { Y0 } from '../shared/arbre.js';
import * as MAISON from '../shared/maison.js';

// Dijkstra sur le graphe des raccords, entre deux points quelconques (chemin, s)
export function itineraire(arbre, de, vers) {
  const g = arbre.graphe();
  const dist = new Map();
  const prec = new Map();
  const file = [];
  for (const p of g.points.get(de.chemin) || []) {
    dist.set(p.cle, Math.abs(p.s - de.s));
    prec.set(p.cle, 'DEPART');
    file.push([dist.get(p.cle), p.cle]);
  }
  while (file.length) {
    let m = 0;
    for (let i = 1; i < file.length; i++) if (file[i][0] < file[m][0]) m = i;
    const [d, u] = file.splice(m, 1)[0];
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const [v, w] of g.voisins.get(u) || []) {
      if (d + w < (dist.get(v) ?? Infinity)) { dist.set(v, d + w); prec.set(v, u); file.push([d + w, v]); }
    }
  }
  let fin = null;
  let best = Infinity;
  for (const p of g.points.get(vers.chemin) || []) {
    const t = (dist.get(p.cle) ?? Infinity) + Math.abs(p.s - vers.s);
    if (t < best) { best = t; fin = p.cle; }
  }
  if (!fin) return null;
  const cles = [];
  for (let c = fin; c !== 'DEPART'; c = prec.get(c)) cles.unshift(c);
  const lire = (cle) => (cle === 'capitale' ? { capitale: true } : { chemin: Number(cle.split('@')[0]), s: Number(cle.split('@')[1]) });
  const etapes = [{ chemin: de.chemin, s: de.s }, ...cles.map(lire), { chemin: vers.chemin, s: vers.s }];
  return { etapes, longueur: best };
}

// Points de passage : le faîte des chemins, le centre de la capitale
export function pointsDePassage(arbre, etapes) {
  const pts = [];
  for (let i = 0; i < etapes.length; i++) {
    const e = etapes[i];
    if (e.capitale) { pts.push([0, Y0, 0]); continue; }
    const c = arbre.chemins[e.chemin];
    const prev = etapes[i - 1];
    if (prev && !prev.capitale && prev.chemin === e.chemin) {
      const n = Math.max(1, Math.ceil(Math.abs(e.s - prev.s) / 1.5));
      for (let k = 1; k <= n; k++) pts.push(c.surface(prev.s + ((e.s - prev.s) * k) / n, 0));
    } else {
      pts.push(c.surface(Math.min(e.s, c.sMarcheMax()), 0));
    }
  }
  return pts;
}

// Fait marcher une boule à travers les points ; renvoie le bilan
export function suivre(sol, depart, points, { pas = 0.08, tolerance = 0.25 } = {}) {
  const m = new Marcheur(sol);
  if (!m.poser(depart[0], depart[1] + 0.5, depart[2])) return { ok: false, raison: 'pose impossible' };
  let sautMax = 0;
  for (let i = 0; i < points.length; i++) {
    const cible = points[i];
    let meilleur = Infinity;
    let bloque = 0;
    for (let k = 0; k < 4000; k++) {
      const dx = cible[0] - m.p[0];
      const dz = cible[2] - m.p[2];
      const d = Math.hypot(dx, dz);
      if (d < tolerance) break;
      const avant = m.p[1];
      const l = Math.min(pas, d);
      m.deplacer((dx / d) * l, (dz / d) * l);
      sautMax = Math.max(sautMax, Math.abs(m.p[1] - avant));
      if (d < meilleur - 0.01) { meilleur = d; bloque = 0; } else if (++bloque > 60) {
        return { ok: false, raison: `bloquée avant le point ${i}/${points.length}`, position: m.p, cible, appui: m.appui && m.appui.source, sautMax };
      }
    }
  }
  return { ok: true, sautMax, position: m.p, appui: m.appui };
}

export function entreeMaison(arbre, maison) {
  const rep = arbre.repereMaison(maison);
  return {
    seuil: arbre.versMonde(rep, [0, 0, -0.6]),
    centre: arbre.versMonde(rep, MAISON.CENTRE_PLANCHER),
  };
}

export { RAYON_BOULE };
