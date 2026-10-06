// Génération procédurale de l'arbre : tronc, branches, brindilles, racines,
// feuilles navigables + graphe de navigation (la fourmi se déplace de nœud en nœud).
import * as THREE from 'three';
import { Rng } from './rng.js';
import { lerp, clamp, buildTube, mergeGeometries } from './util.js';

const SEED = 20261006;
const FOOT = 0.10; // hauteur des pattes de la fourmi au-dessus de la surface

// Hauteur des étages de branches sur le tronc et longueur approximative
const LEVELS = [
  { y: 11, len: 15, n: 2 }, { y: 17, len: 14, n: 3 }, { y: 23, len: 12.5, n: 3 },
  { y: 28.5, len: 11, n: 3 }, { y: 33.5, len: 9.5, n: 2 }, { y: 38, len: 8, n: 2 },
  { y: 41.5, len: 6, n: 2 }, { y: 44, len: 4.5, n: 1 },
];

export function generateTree() {
  const rng = new Rng(SEED);
  const nodes = [];   // { pos, up, tangent, radius, nb:[{to,len}], leafId, type }
  const parts = [];   // segments de tube à fusionner
  const leaves = [];  // données des feuilles (instances)
  const branchIdSeq = { n: 0 };
  const handles = {
    trunkTip: -1, deepest: -1, chamber: null, mossBranch: null,
    grandeFeuille: null, fleur: null, pont: null, berceau: null,
    twigTips: [], branchNodeLists: [], rootNodes: [], canopyTwigs: [],
  };

  // ---------- helpers ----------
  function addNode(pos, up, tangent, radius, type) {
    nodes.push({ pos, up, tangent, radius, nb: [], leafId: -1, type });
    return nodes.length - 1;
  }
  function addEdge(a, b) {
    if (a === b) return;
    const len = nodes[a].pos.distanceTo(nodes[b].pos);
    nodes[a].nb.push({ to: b, len });
    nodes[b].nb.push({ to: a, len });
  }
  const tmpUp = new THREE.Vector3(0, 1, 0);
  function nodeUp(pos, tangent) {
    // "haut" local : projection de l'axe monde Y perpendiculaire à la tangente
    const proj = tmpUp.clone().addScaledVector(tangent, -tmpUp.dot(tangent));
    if (proj.lengthSq() < 0.02) {
      // branche quasi verticale (tronc) : on reste sur le flanc d'où l'on vient
      const out = new THREE.Vector3(pos.x, 0, pos.z);
      if (out.lengthSq() < 1e-4) out.set(1, 0, 0);
      return out.normalize();
    }
    return proj.normalize();
  }

  const barkBase = new THREE.Color(0x97795c);
  const barkTip = new THREE.Color(0xb3936c);
  const rootBark = new THREE.Color(0x6d5842);
  const mossCol = new THREE.Color(0x3f7030);
  const tmpC = new THREE.Color();

  function barkColorFn(depth, kind, tint) {
    return (ringN, p, i, nPts) => {
      const t = i / Math.max(1, nPts - 1);
      tmpC.copy(barkBase).lerp(barkTip, t * 0.6);
      let shade = depth === 0 ? 0.86 : 1.0;
      if (p.y < 2.5) shade *= lerp(0.72, 1, clamp((p.y + 3) / 5.5, 0, 1));
      tmpC.multiplyScalar(tint * shade);
      if (kind === 'root') {
        tmpC.copy(rootBark).lerp(barkTip, t * 0.3).multiplyScalar(tint * (p.y < 0 ? 0.62 : 1));
      } else if (ringN.y > 0.35 && depth <= 1) {
        // mousse sur le dessus des grosses branches
        tmpC.lerp(mossCol, clamp((ringN.y - 0.35) * 1.1, 0, 0.55));
      }
      return tmpC;
    };
  }

  // ---------- croissance d'une branche ----------
  // originIdx : nœud de départ (partagé avec le parent)
  function growBranch(originIdx, dir, len, radiusAt, tipR, depth, kind, opts = {}) {
    const segLen = opts.segLen || (depth === 0 && kind === 'trunk' ? 1.5 : 1.05);
    const steps = Math.max(3, Math.round(len / segLen));
    const step = len / steps;
    const points = [nodes[originIdx].pos.clone()];
    const radii = [radiusAt];
    const d = dir.clone().normalize();
    const trend = opts.trend ? opts.trend.clone().normalize() : null;
    const cur = points[0].clone();
    for (let i = 1; i <= steps; i++) {
      if (trend) d.lerp(trend, 0.09);
      if (kind === 'branch' && depth >= 3) d.y -= 0.05; // brindilles qui retombent
      d.x += rng.range(-0.07, 0.07);
      d.y += rng.range(-0.05, 0.05);
      d.z += rng.range(-0.07, 0.07);
      d.normalize();
      cur.addScaledVector(d, step);
      points.push(cur.clone());
      radii.push(lerp(radiusAt, tipR, i / steps));
    }

    // nœuds de navigation (le premier est le nœud d'origine, déjà existant)
    const idxs = [originIdx];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[Math.min(points.length - 1, i + 1)];
      const tangent = new THREE.Vector3().subVectors(b, a).normalize();
      const up = nodeUp(points[i], tangent);
      idxs.push(addNode(points[i].clone(), up, tangent, radii[i], kind === 'trunk' ? 'trunk' : kind === 'root' ? 'root' : 'branch'));
    }
    for (let i = 0; i < idxs.length - 1; i++) addEdge(idxs[i], idxs[i + 1]);

    // enregistrement pour déco / repères
    const branchId = branchIdSeq.n++;
    if (kind === 'branch' && depth <= 1) handles.branchNodeLists.push(idxs.slice());
    if (kind === 'branch') for (const i of idxs) nodes[i].branchId = branchId;

    // géométrie
    parts.push(buildTube(points, radii, {
      ringSeg: radii[0] > 0.5 ? 8 : 6,
      colorFn: barkColorFn(depth, kind, rng.range(0.88, 1.12)),
    }));

    // enfants
    if (kind === 'trunk') {
      // les étages de branches sont gérés à l'extérieur
    } else if (kind === 'branch' && depth < 3) {
      const nKids = depth === 0 ? rng.int(2, 3) : depth === 1 ? rng.int(2, 3) : rng.int(1, 2);
      for (let k = 0; k < nKids; k++) {
        const t = rng.range(0.45, 0.93);
        const at = idxs[Math.round(t * (idxs.length - 1))];
        const tangent = nodes[at].tangent;
        // direction enfant : on pivote la tangente autour d'un axe perpendiculaire
        const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
        axis.addScaledVector(tangent, -axis.dot(tangent));
        if (axis.lengthSq() < 1e-4) axis.set(0, 1, 0);
        axis.normalize();
        const ang = rng.range(0.6, 1.05);
        const cd = tangent.clone().applyAxisAngle(axis, ang).normalize();
        const outward = new THREE.Vector3(nodes[at].pos.x, 0, nodes[at].pos.z).normalize();
        cd.addScaledVector(outward, 0.22).addScaledVector(tmpUp, 0.16).normalize();
        const childLen = len * rng.range(0.62, 0.78);
        const childR = Math.max(0.05, nodes[at].radius * 0.8);
        growBranch(at, cd, childLen, childR, childR * 0.38, depth + 1, 'branch');
      }
    } else if (kind === 'root') {
      if (depth < 2) {
        const nKids = rng.int(1, 2);
        for (let k = 0; k < nKids; k++) {
          const t = rng.range(0.5, 0.9);
          const at = idxs[Math.round(t * (idxs.length - 1))];
          const tangent = nodes[at].tangent;
          const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
          axis.addScaledVector(tangent, -axis.dot(tangent));
          if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
          axis.normalize();
          const cd = tangent.clone().applyAxisAngle(axis, rng.range(0.4, 0.9)).normalize();
          cd.y -= 0.15;
          const childLen = len * rng.range(0.5, 0.65);
          const childR = Math.max(0.05, nodes[at].radius * 0.55);
          growBranch(at, cd, childLen, childR, childR * 0.4, depth + 1, 'root');
        }
      }
    }

    // feuilles le long de la branche
    if (kind === 'branch' && depth >= 2) {
      const startI = Math.floor(idxs.length * 0.5);
      for (let i = startI; i < idxs.length; i++) {
        const chance = depth >= 3 ? 0.75 : 0.45;
        if (i === idxs.length - 1 || rng.chance(chance)) addLeaf(idxs[i], 1);
      }
      handles.twigTips.push(idxs[idxs.length - 1]);
    }
    return idxs;
  }

  // ---------- feuille navigable ----------
  function addLeaf(twigIdx, scale, override = {}) {
    const node = nodes[twigIdx];
    const outward = new THREE.Vector3(node.pos.x, 0, node.pos.z);
    if (outward.lengthSq() < 1e-4) outward.set(1, 0, 0);
    outward.normalize();

    let midrib = override.midrib;
    if (!midrib) {
      midrib = node.tangent.clone().multiplyScalar(0.3)
        .addScaledVector(outward, 0.62)
        .addScaledVector(node.up, 0.3)
        .normalize();
    }
    let normal = override.normal;
    if (!normal) {
      normal = node.up.clone().multiplyScalar(0.9)
        .addScaledVector(outward, 0.28)
        .addScaledVector(node.tangent, -0.1);
    }
    normal.addScaledVector(midrib, -normal.dot(midrib)).normalize();
    const side = new THREE.Vector3().crossVectors(normal, midrib).normalize();

    const len = rng.range(2.0, 2.9) * scale;
    const width = len * rng.range(0.5, 0.64);
    const basePos = node.pos.clone().addScaledVector(node.up, node.radius * 0.9)
      .addScaledVector(midrib, 0.12);

    // 3 nœuds : base, milieu, pointe (la pointe retombe un peu)
    const midPos = basePos.clone().addScaledVector(midrib, len * 0.52).addScaledVector(normal, 0.03);
    const tipPos = basePos.clone().addScaledVector(midrib, len);
    tipPos.y -= len * 0.14;

    const nb = addNode(basePos.clone(), normal.clone(), midrib.clone(), 0.03, 'leaf');
    const nm = addNode(midPos.clone(), normal.clone(), midrib.clone(), 0.03, 'leaf');
    const nt = addNode(tipPos.clone(), normal.clone(), midrib.clone(), 0.03, 'leaf');
    addEdge(twigIdx, nb); addEdge(nb, nm); addEdge(nm, nt);

    const leaf = {
      id: leaves.length,
      base: basePos, quat: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(side, normal, midrib)),
      len, width, nodes: [nb, nm, nt], mid: midPos, normal, big: scale > 1.6,
      tint: pickLeafTint(),
    };
    leaves.push(leaf);
    nodes[nb].leafId = nodes[nm].leafId = nodes[nt].leafId = leaf.id;
    return leaf;
  }

  const leafTints = [
    () => new THREE.Color().setHSL(0.29 + rng.range(-0.03, 0.03), 0.5, rng.range(0.56, 0.72)),
    () => new THREE.Color().setHSL(0.24, 0.55, rng.range(0.52, 0.68)),
  ];
  function pickLeafTint() {
    if (rng.chance(0.07)) return new THREE.Color().setHSL(0.09, 0.85, rng.range(0.6, 0.72)); // feuille dorée
    return rng.pick(leafTints)();
  }

  // ---------- tronc ----------
  const trunkBase = addNode(new THREE.Vector3(0, -3.2, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 2.35, 'trunk');
  const trunkR = (y) => 0.42 + 1.95 * Math.pow(clamp(1 - (y + 3.2) / 51, 0, 1), 1.25);
  const trunkLen = 48.5;
  const trunkSteps = Math.round(trunkLen / 1.5);
  {
    const pts = [nodes[trunkBase].pos.clone()];
    const rads = [trunkR(-3.2)];
    const d = new THREE.Vector3(0.06, 1, -0.04).normalize();
    const trend = new THREE.Vector3(0.16, 1, -0.1).normalize();
    const cur = pts[0].clone();
    for (let i = 1; i <= trunkSteps; i++) {
      d.lerp(trend, 0.05);
      d.x += rng.range(-0.035, 0.035);
      d.z += rng.range(-0.035, 0.035);
      d.normalize();
      cur.addScaledVector(d, trunkLen / trunkSteps);
      pts.push(cur.clone());
      rads.push(trunkR(cur.y));
    }
    const idxs = [trunkBase];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[Math.min(pts.length - 1, i + 1)];
      const tangent = new THREE.Vector3().subVectors(b, a).normalize();
      idxs.push(addNode(pts[i].clone(), nodeUp(pts[i], tangent), tangent, rads[i], 'trunk'));
    }
    for (let i = 0; i < idxs.length - 1; i++) addEdge(idxs[i], idxs[i + 1]);
    parts.push(buildTube(pts, rads, { ringSeg: 9, colorFn: barkColorFn(0, 'trunk', 1) }));
    handles.trunkTip = idxs[idxs.length - 1];
    // moelle du tronc (pour la collision caméra)
    handles.trunkSpine = pts.map((p, i) => ({ pos: p.clone(), r: rads[i] }));

    // étages de branches
    const trunkIdxs = idxs;
    for (const lvl of LEVELS) {
      for (let k = 0; k < lvl.n; k++) {
        // trouver le nœud de tronc le plus proche de la hauteur voulue
        let at = 1;
        let best = 1e9;
        for (let i = 1; i < trunkIdxs.length; i++) {
          const dy = Math.abs(nodes[trunkIdxs[i]].pos.y - lvl.y);
          if (dy < best) { best = dy; at = i; }
        }
        const az = k * 2.399 + rng.range(-0.45, 0.45) + lvl.y;
        const el = lerp(0.38, 0.85, clamp((lvl.y - 10) / 34, 0, 1)) + rng.range(-0.12, 0.12);
        const dir = new THREE.Vector3(
          Math.cos(az) * Math.cos(el),
          Math.sin(el),
          Math.sin(az) * Math.cos(el)
        ).normalize();
        const baseR = Math.max(0.09, nodes[trunkIdxs[at]].radius * 0.62);
        growBranch(trunkIdxs[at], dir, lvl.len * rng.range(0.9, 1.1), baseR, baseR * 0.3, 0, 'branch');
      }
    }
  }

  // ---------- racines ----------
  {
    const rootAt = trunkBase; // bas du tronc
    for (let k = 0; k < 5; k++) {
      const az = (k / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const el = rng.range(0.5, 0.95); // vers le bas
      const dir = new THREE.Vector3(
        Math.cos(az) * Math.cos(el), -Math.sin(el), Math.sin(az) * Math.cos(el)
      ).normalize();
      const len = rng.range(11, 16);
      const r = 1.0;
      growBranch(rootAt, dir, len, r, 0.2, 0, 'root', {
        trend: new THREE.Vector3(Math.cos(az) * 0.8, -0.55, Math.sin(az) * 0.8).normalize(),
        segLen: 1.25,
      });
    }
    for (let i = 0; i < nodes.length; i++) if (nodes[i].type === 'root') handles.rootNodes.push(i);
  }

  // nœud le plus profond + salle des lucioles (jonction de racine vers -7..-10)
  {
    let deep = trunkBase;
    for (let i = 0; i < nodes.length; i++) if (nodes[i].pos.y < nodes[deep].pos.y) deep = i;
    handles.deepest = deep;
    let chamber = null, best = 1e9;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type !== 'root' || n.pos.y > -6.5 || n.pos.y < -11 || n.radius < 0.28) continue;
      const d = Math.abs(n.pos.y + 8.5) + Math.abs(n.pos.length() - 8);
      if (d < best) { best = d; chamber = i; }
    }
    handles.chamber = chamber;
  }

  // ---------- lieux spéciaux ----------
  // Berceau : grande feuille sur le tronc à y≈8
  {
    let at = 1, best = 1e9;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type !== 'trunk') continue;
      const dy = Math.abs(nodes[i].pos.y - 15);
      if (dy < best) { best = dy; at = i; }
    }
    const node = nodes[at];
    const outward = new THREE.Vector3(node.pos.x, 0, node.pos.z).normalize();
    const midrib = outward.clone().multiplyScalar(0.92).addScaledVector(tmpUp, 0.3).normalize();
    const normal = node.up.clone().multiplyScalar(0.55)
      .addScaledVector(outward, 0.8);
    normal.addScaledVector(midrib, -normal.dot(midrib)).normalize();
    const leaf = addLeaf(at, 2.1, { midrib, normal });
    handles.berceau = { node: leaf.nodes[1], pos: nodes[leaf.nodes[1]].pos.clone(), leaf: leaf.id };
  }

  // Grande Feuille : une grosse feuille à mi-hauteur
  {
    const cands = handles.twigTips.filter((i) => {
      const p = nodes[i].pos;
      const r = Math.hypot(p.x, p.z);
      return p.y > 15 && p.y < 27 && r > 5 && r < 13;
    });
    const pick = cands.length ? cands[Math.floor(cands.length / 2)] : handles.twigTips[0];
    const leaf = addLeaf(pick, 2.5);
    handles.grandeFeuille = { node: leaf.nodes[1], pos: nodes[leaf.nodes[1]].pos.clone(), leaf: leaf.id };
  }

  // Fleur de rosée : haute dans la canopée
  {
    const cands = handles.twigTips.filter((i) => nodes[i].pos.y > 28 && nodes[i].pos.y < 37);
    const pick = cands.length ? cands[Math.floor(cands.length * 0.3)] : handles.trunkTip;
    const n = nodes[pick];
    handles.fleur = { node: pick, pos: n.pos.clone().addScaledVector(n.up, n.radius + 0.45) };
    handles.canopyTwigs = cands;
  }

  // Jardin de mousse : longue branche basse et horizontale
  {
    let bestList = null, bestScore = 1e9;
    for (const list of handles.branchNodeLists) {
      if (nodes[list[0]].pos.y > 20 || nodes[list[0]].pos.y < 10) continue;
      const mid = nodes[list[Math.floor(list.length / 2)]];
      const score = Math.abs(mid.tangent.y) - list.length * 0.05;
      if (score < bestScore) { bestScore = score; bestList = list; }
    }
    if (bestList) {
      const midI = bestList[Math.floor(bestList.length * 0.5)];
      handles.mossBranch = { nodes: bestList, node: midI, pos: nodes[midI].pos.clone() };
    }
  }

  // Pont de brindilles : relie deux brindilles proches
  {
    let pair = null;
    outer:
    for (let a = 0; a < handles.twigTips.length; a++) {
      for (let b = a + 1; b < handles.twigTips.length; b++) {
        const na = nodes[handles.twigTips[a]], nb2 = nodes[handles.twigTips[b]];
        if (na.pos.y < 11 || nb2.pos.y < 11) continue;
        if (na.branchId === nb2.branchId) continue;
        const d = na.pos.distanceTo(nb2.pos);
        if (d > 4.5 && d < 8) { pair = [handles.twigTips[a], handles.twigTips[b]]; break outer; }
      }
    }
    if (pair) {
      const A = nodes[pair[0]].pos, B = nodes[pair[1]].pos;
      const mid = A.clone().add(B).multiplyScalar(0.5);
      mid.y -= A.distanceTo(B) * 0.14;
      const curve = new THREE.CatmullRomCurve3([A.clone(), mid, B.clone()]);
      const pts = curve.getPoints(6);
      const rads = pts.map((_, i) => lerp(0.11, 0.07, i / (pts.length - 1)));
      const idxs = [pair[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const t = new THREE.Vector3().subVectors(pts[i + 1], pts[i - 1]).normalize();
        idxs.push(addNode(pts[i].clone(), nodeUp(pts[i], t), t, rads[i], 'branch'));
      }
      idxs.push(pair[1]);
      for (let i = 0; i < idxs.length - 1; i++) addEdge(idxs[i], idxs[i + 1]);
      parts.push(buildTube(pts, rads, { ringSeg: 6, colorFn: barkColorFn(2, 'branch', 1) }));
      handles.pont = { node: idxs[Math.floor(idxs.length / 2)], pos: nodes[idxs[Math.floor(idxs.length / 2)]].pos.clone() };
    }
  }

  // ---------- géométrie fusionnée ----------
  const barkGeo = mergeGeometries(parts);
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const barkMesh = new THREE.Mesh(barkGeo, barkMat);
  barkMesh.frustumCulled = false; // un seul grand maillage

  return { nodes, leaves, barkMesh, handles, FOOT, rng };
}
