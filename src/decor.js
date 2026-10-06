// Décor du monde : sol, herbe, mousse, fleurs, rosée, lucioles, champignons,
// cristaux, rayons de soleil, poussière dorée, papillons, feuilles qui tombent.
import * as THREE from 'three';
import {
  mergeGeometries, softCircleTexture, rayTexture, fallingLeafTexture,
  butterflyWingTexture, groundTexture, lerp, clamp,
} from './util.js';

export function createDecor(scene, tree, rng) {
  const nodes = tree.nodes;
  const handles = tree.handles;
  const updates = []; // fonctions (dt, t, ctx) appelées chaque frame
  const ctx = { antPos: new THREE.Vector3(), under: 0, camera: null };

  // ================= SOL =================
  {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(110, 56),
      new THREE.MeshStandardMaterial({
        map: groundTexture(), color: 0xdff0c4, roughness: 1, side: THREE.DoubleSide,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
  }

  // Herbe : brins instanciés autour du tronc
  {
    const n = 900;
    const geo = new THREE.ConeGeometry(0.035, 0.55, 3);
    geo.translate(0, 0.27, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rng.angle(), r = 3 + Math.pow(rng.f(), 0.7) * 30;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      e.set(rng.range(-0.45, 0.45), rng.angle(), rng.range(-0.45, 0.45));
      q.setFromEuler(e);
      const s = rng.range(0.7, 1.9);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * rng.range(0.9, 1.8), s));
      mesh.setMatrixAt(i, m);
      if (rng.chance(0.22)) col.setHSL(0.11, 0.62, rng.range(0.38, 0.55)); // brins dorés
      else col.setHSL(0.26 + rng.range(-0.05, 0.06), rng.range(0.4, 0.6), rng.range(0.32, 0.52));
      mesh.setColorAt(i, col);
    }
    scene.add(mesh);
  }

  // Fleurs sauvages de la prairie (visibles depuis l'arbre)
  {
    const n = 320;
    const geo = new THREE.SphereGeometry(0.07, 5, 4);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const col = new THREE.Color();
    const palette = [0xfff6e8, 0xffe28a, 0xffb7c9, 0xd8c2ff, 0xffd9a8];
    for (let i = 0; i < n; i++) {
      const a = rng.angle(), r = 3.5 + Math.pow(rng.f(), 0.6) * 34;
      const s = rng.range(0.7, 1.5);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0.16, Math.sin(a) * r), q, new THREE.Vector3(s, s * 0.8, s));
      mesh.setMatrixAt(i, m);
      col.set(rng.pick(palette));
      mesh.setColorAt(i, col);
    }
    scene.add(mesh);
  }

  // Pierres en surface
  {
    const n = 26;
    const geo = new THREE.DodecahedronGeometry(0.4, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rng.angle(), r = rng.range(4, 30);
      e.set(rng.angle(), rng.angle(), rng.angle());
      q.setFromEuler(e);
      const s = rng.range(0.5, 1.8);
      m.compose(new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r), q,
        new THREE.Vector3(s, s * 0.6, s));
      mesh.setMatrixAt(i, m);
      col.setHSL(0.08, 0.12, rng.range(0.3, 0.45));
      mesh.setColorAt(i, col);
    }
    scene.add(mesh);
  }

  // ================= MOUSSE + FLEURS SUR L'ARBRE =================
  {
    // mousse : galettes aplaties sur le dessus des grosses branches
    const spots = [];
    for (const list of handles.branchNodeLists) {
      for (const i of list) {
        const nd = nodes[i];
        if (nd.up.y > 0.8 && nd.radius > 0.13 && rng.chance(0.3)) spots.push(i);
      }
    }
    if (handles.mossBranch) {
      for (const i of handles.mossBranch.nodes) if (rng.chance(0.55)) spots.push(i);
    }
    const n = spots.length || 1;
    const geo = new THREE.SphereGeometry(1, 7, 5);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    spots.forEach((i, k) => {
      const nd = nodes[i];
      const s = nd.radius * rng.range(1.6, 2.6);
      e.set(0, rng.angle(), 0); q.setFromEuler(e);
      m.compose(nd.pos.clone().addScaledVector(nd.up, nd.radius * 0.55), q,
        new THREE.Vector3(s, s * 0.35, s));
      mesh.setMatrixAt(k, m);
      col.setHSL(0.3 + rng.range(-0.04, 0.04), 0.5, rng.range(0.2, 0.34));
      mesh.setColorAt(k, col);
    });
    scene.add(mesh);
  }

  // fleurs (géométrie fusionnée : 5 pétales + cœur)
  {
    const flowerGeo = makeFlowerGeometry();
    const spots = [];
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      if (nd.type === 'branch' && nd.radius < 0.14 && nd.radius > 0.03 && nd.pos.y > 12 && rng.chance(0.028)) spots.push(i);
    }
    if (handles.mossBranch) for (const i of handles.mossBranch.nodes) if (rng.chance(0.12)) spots.push(i);
    if (handles.fleur) spots.push(handles.fleur.node);
    const n = spots.length || 1;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false });
    const mesh = new THREE.InstancedMesh(flowerGeo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const col = new THREE.Color();
    const palette = [0xffd1e3, 0xfff3c4, 0xffc98a, 0xf8f4ff, 0xffb7c9];
    spots.forEach((i, k) => {
      const nd = nodes[i];
      e.set(rng.range(-0.3, 0.3), rng.angle(), rng.range(-0.3, 0.3));
      q.setFromEuler(e);
      const s = i === handles.fleur?.node ? 0.85 : rng.range(0.3, 0.5);
      m.compose(nd.pos.clone().addScaledVector(nd.up, nd.radius * 0.9), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(k, m);
      col.set(rng.pick(palette));
      if (i === handles.fleur?.node) col.set(0xffe08a);
      mesh.setColorAt(k, col);
    });
    scene.add(mesh);
  }

  // ================= ROSÉE (collectible + déco) =================
  const dew = (() => {
    const leaves = tree.leaves;
    const collectibleIdx = [];
    const step = Math.max(1, Math.floor(leaves.length / 15));
    for (let i = 0; i < leaves.length && collectibleIdx.length < 15; i += step) collectibleIdx.push(i);
    const decoCount = Math.min(60, leaves.length);
    const total = collectibleIdx.length + decoCount;
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8f2ff, roughness: 0.05, metalness: 0.35, envMapIntensity: 1.8,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    const m = new THREE.Matrix4();
    const items = []; // {leafId, pos, collected, instIdx, big}
    const used = new Set(collectibleIdx);
    collectibleIdx.forEach((li, k) => {
      const leaf = leaves[li];
      const pos = leaf.mid.clone().addScaledVector(leaf.normal, 0.09);
      const s = 0.13;
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(s, s * 1.15, s));
      mesh.setMatrixAt(k, m);
      items.push({ leafId: leaf.id, pos, collected: false, instIdx: k, big: true });
    });
    for (let k = 0; k < decoCount; k++) {
      let li = rng.int(0, leaves.length - 1);
      let guard = 0;
      while (used.has(li) && guard++ < 20) li = rng.int(0, leaves.length - 1);
      used.add(li);
      const leaf = leaves[li];
      const along = rng.range(0.25, 0.8);
      const pos = leaf.base.clone().addScaledVector(
        new THREE.Vector3(0, 0, 1).applyQuaternion(leaf.quat), leaf.len * along)
        .addScaledVector(leaf.normal, 0.055);
      const s = rng.range(0.045, 0.08);
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(s, s * 1.2, s));
      mesh.setMatrixAt(collectibleIdx.length + k, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    const zero = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    return {
      items,
      collect(instIdx) {
        mesh.setMatrixAt(instIdx, zero);
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  })();

  // ================= SOUS-SOL =================
  // champignons lumineux
  {
    const spots = [];
    const chamberPos = handles.chamber != null ? nodes[handles.chamber].pos : new THREE.Vector3(0, -8, 0);
    for (let k = 0; k < 12; k++) {
      const a = rng.angle(), r = rng.range(0.8, 4.5);
      spots.push(new THREE.Vector3(chamberPos.x + Math.cos(a) * r, chamberPos.y + rng.range(-1.2, 0.8), chamberPos.z + Math.sin(a) * r));
    }
    const rootSpots = handles.rootNodes.filter(() => rng.chance(0.18)).slice(0, 16);
    for (const i of rootSpots) {
      const nd = nodes[i];
      if (nd.pos.y > -2) continue;
      spots.push(nd.pos.clone().addScaledVector(nd.up, nd.radius * 0.9));
    }
    const n = spots.length || 1;
    const stemGeo = new THREE.CylinderGeometry(0.045, 0.075, 1, 6);
    stemGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.scale(1, 0.62, 1);
    capGeo.translate(0, 1, 0);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.9 });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a33, emissive: 0x2ee8c4, emissiveIntensity: 2.2, roughness: 0.5,
    });
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, n);
    const caps = new THREE.InstancedMesh(capGeo, capMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const capPositions = [];
    spots.forEach((p, k) => {
      e.set(rng.range(-0.25, 0.25), rng.angle(), rng.range(-0.25, 0.25));
      q.setFromEuler(e);
      const s = rng.range(0.5, 1.5);
      m.compose(p, q, new THREE.Vector3(s, s, s));
      stems.setMatrixAt(k, m); caps.setMatrixAt(k, m);
      capPositions.push(p.clone().add(new THREE.Vector3(0, s, 0)));
    });
    scene.add(stems, caps);
    // halos
    const halo = new THREE.Points(
      makePointsGeometry(capPositions),
      new THREE.PointsMaterial({
        map: softCircleTexture(0.1, '80,255,220'), color: 0x66ffe0, size: 1.6,
        transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      })
    );
    scene.add(halo);
    updates.push((dt, t) => {
      capMat.emissiveIntensity = 1.5 + Math.sin(t * 1.7) * 0.45;
      halo.material.opacity = 0.4 + Math.sin(t * 1.7) * 0.15;
    });
    // lumière de la salle
    const chamberLight = new THREE.PointLight(0x54e8c8, 16, 20, 1.4);
    chamberLight.position.copy(chamberPos);
    scene.add(chamberLight);
  }

  // cristaux
  {
    const chamberPos = handles.chamber != null ? nodes[handles.chamber].pos : new THREE.Vector3(0, -8, 0);
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = rng.angle(), r = rng.range(1, 7);
      pts.push(new THREE.Vector3(chamberPos.x + Math.cos(a) * r, chamberPos.y - rng.range(0, 4), chamberPos.z + Math.sin(a) * r));
    }
    const geo = new THREE.IcosahedronGeometry(0.45, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9fdcff, emissive: 0x3f9fe0, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    pts.forEach((p, k) => {
      e.set(rng.angle(), rng.angle(), rng.angle()); q.setFromEuler(e);
      const s = rng.range(0.4, 1.4);
      m.compose(p, q, new THREE.Vector3(s, s * rng.range(1.3, 2.4), s));
      mesh.setMatrixAt(k, m);
    });
    scene.add(mesh);
    updates.push((dt, t) => { mat.emissiveIntensity = 0.8 + Math.sin(t * 1.1) * 0.35; });
  }

  // roches sous terre
  {
    const n = 30;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < n; k++) {
      const a = rng.angle(), r = rng.range(3, 24);
      e.set(rng.angle(), rng.angle(), rng.angle()); q.setFromEuler(e);
      const s = rng.range(0.6, 2.4);
      m.compose(new THREE.Vector3(Math.cos(a) * r, -rng.range(1.5, 13), Math.sin(a) * r), q,
        new THREE.Vector3(s, s * rng.range(0.6, 1.2), s));
      mesh.setMatrixAt(k, m);
    }
    scene.add(mesh);
  }

  // ================= PARTICULES =================
  // poussière dorée autour de la caméra
  {
    const N = 240, BOX = 34;
    const base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      base[i * 3] = rng.range(-BOX / 2, BOX / 2);
      base[i * 3 + 1] = rng.range(-BOX / 2, BOX / 2);
      base[i * 3 + 2] = rng.range(-BOX / 2, BOX / 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    const mat = new THREE.PointsMaterial({
      map: softCircleTexture(0.2, '255,230,170'), color: 0xffe6b0, size: 0.09,
      transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    updates.push((dt, t, c) => {
      const arr = geo.attributes.position.array;
      const cam = c.camera.position;
      for (let i = 0; i < N; i++) {
        // dérive lente
        base[i * 3] += Math.sin(t * 0.3 + i) * 0.0016;
        base[i * 3 + 1] += 0.0035 * Math.sin(i * 7.7);
        // enroulement autour de la caméra
        arr[i * 3] = wrap(base[i * 3] - cam.x, BOX) + cam.x;
        arr[i * 3 + 1] = wrap(base[i * 3 + 1] - cam.y, BOX) + cam.y;
        arr[i * 3 + 2] = wrap(base[i * 3 + 2] - cam.z, BOX) + cam.z;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.55 * (1 - c.under);
    });
  }

  // lucioles (canopée + sous-sol)
  {
    const makeFireflies = (count, center, spread, color, size, op) => {
      const data = [];
      for (let i = 0; i < count; i++) {
        data.push({
          base: new THREE.Vector3(
            center.x + rng.range(-spread, spread),
            center.y + rng.range(-spread * 0.6, spread * 0.6),
            center.z + rng.range(-spread, spread)),
          ph: rng.angle(), sp: rng.range(0.4, 1.1), r1: rng.range(0.8, 2.6), r2: rng.range(0.8, 2.6),
        });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const mat = new THREE.PointsMaterial({
        map: softCircleTexture(0.05, '255,255,255'), color, size,
        transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      updates.push((dt, t, c) => {
        const arr = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          const f = data[i];
          arr[i * 3] = f.base.x + Math.sin(t * f.sp + f.ph) * f.r1;
          arr[i * 3 + 1] = f.base.y + Math.sin(t * f.sp * 0.7 + f.ph * 2) * f.r1 * 0.5;
          arr[i * 3 + 2] = f.base.z + Math.cos(t * f.sp * 0.8 + f.ph) * f.r2;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = op * (0.55 + 0.45 * Math.sin(t * 2.3));
      });
    };
    makeFireflies(46, new THREE.Vector3(0, 26, 0), 15, 0xffd97a, 0.28, 0.85);
    makeFireflies(26, new THREE.Vector3(0, 12, 0), 9, 0xffe9a8, 0.22, 0.5);
    const chamberPos = handles.chamber != null ? nodes[handles.chamber].pos : new THREE.Vector3(0, -8, 0);
    makeFireflies(60, chamberPos, 6, 0x7af0d8, 0.34, 0.95);
    makeFireflies(30, new THREE.Vector3(0, -6, 0), 12, 0x7af0d8, 0.26, 0.7);
  }

  // rayons de soleil traversant la canopée
  {
    const tex = rayTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.14, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const rays = [];
    for (let k = 0; k < 8; k++) {
      const w = rng.range(2, 5), h = rng.range(18, 26);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.clone());
      const a = rng.angle(), r = rng.range(1.5, 10);
      mesh.position.set(Math.cos(a) * r, rng.range(24, 32), Math.sin(a) * r);
      mesh.rotation.set(0.28, rng.angle(), rng.range(-0.15, 0.15));
      mesh.renderOrder = 5;
      scene.add(mesh);
      rays.push(mesh);
    }
    updates.push((dt, t, c) => {
      const vis = (1 - c.under) * clamp((c.camera.position.y - 1.5) / 3, 0, 1);
      for (let i = 0; i < rays.length; i++) {
        rays[i].material.opacity = (0.1 + 0.06 * Math.sin(t * 0.6 + i * 1.7)) * vis;
        rays[i].rotation.y += dt * 0.02;
      }
    });
  }

  // feuilles qui tombent
  {
    const tex = fallingLeafTexture();
    const items = [];
    for (let k = 0; k < 7; k++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(rng.range(0.35, 0.6));
      scene.add(sp);
      items.push({
        sp, x: rng.range(-16, 16), z: rng.range(-16, 16), y: rng.range(4, 30),
        vy: rng.range(0.5, 0.9), ph: rng.angle(), rot: rng.range(-1, 1),
      });
    }
    updates.push((dt, t, c) => {
      const vis = 1 - c.under;
      for (const it of items) {
        it.y -= it.vy * dt;
        if (it.y < 0.2) { it.y = rng.range(24, 34); it.x = rng.range(-16, 16); it.z = rng.range(-16, 16); }
        it.sp.position.set(
          it.x + Math.sin(t * 0.9 + it.ph) * 1.6,
          it.y,
          it.z + Math.cos(t * 0.7 + it.ph) * 1.2);
        it.sp.material.rotation = it.ph + t * it.rot;
        it.sp.material.opacity = 0.95 * vis;
      }
    });
  }

  // papillons
  {
    const tex = butterflyWingTexture();
    const wingGeo = new THREE.PlaneGeometry(0.5, 0.42);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const butterflies = [];
    const spots = [
      new THREE.Vector3(6, 20, 4), new THREE.Vector3(-7, 15, -5), new THREE.Vector3(2, 28, -8),
    ];
    for (const c of spots) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.02, 0.16, 3, 6),
        new THREE.MeshBasicMaterial({ color: 0x33241a }));
      body.rotation.x = Math.PI / 2;
      const wl = new THREE.Mesh(wingGeo, mat); wl.position.x = -0.24;
      const wr = new THREE.Mesh(wingGeo, mat); wr.position.x = 0.24; wr.rotation.y = Math.PI;
      const pl = new THREE.Group(); pl.add(wl);
      const pr = new THREE.Group(); pr.add(wr);
      g.add(body, pl, pr);
      scene.add(g);
      butterflies.push({ g, pl, pr, c, ph: rng.angle(), r: rng.range(2.5, 5), sp: rng.range(0.25, 0.5) });
    }
    const ahead = new THREE.Vector3();
    updates.push((dt, t, c) => {
      const vis = 1 - c.under;
      for (const b of butterflies) {
        const a = t * b.sp + b.ph;
        const p = b.g.position;
        p.set(
          b.c.x + Math.cos(a) * b.r,
          b.c.y + Math.sin(a * 1.7) * 1.2,
          b.c.z + Math.sin(a * 1.3) * b.r);
        ahead.set(
          b.c.x + Math.cos(a + 0.05) * b.r,
          b.c.y + Math.sin((a + 0.05) * 1.7) * 1.2,
          b.c.z + Math.sin((a + 0.05) * 1.3) * b.r);
        b.g.lookAt(ahead);
        const flap = Math.sin(t * 11 + b.ph) * 0.9;
        b.pl.rotation.y = flap; b.pr.rotation.y = -flap;
        b.g.visible = vis > 0.05;
      }
    });
  }

  // étincelles (collecte de rosée / découvertes)
  const sparkles = (() => {
    const bursts = [];
    for (let k = 0; k < 6; k++) {
      const N = 26;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({
        map: softCircleTexture(0.1, '255,255,255'), color: 0xbfefff, size: 0.3,
        transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      scene.add(pts);
      bursts.push({ pts, geo, vel: new Float32Array(N * 3), life: 0, N });
    }
    let cursor = 0;
    return {
      spawn(pos, color = 0xbfefff) {
        const b = bursts[cursor++ % bursts.length];
        b.life = 1;
        b.pts.visible = true;
        b.pts.material.color.set(color);
        b.pts.material.opacity = 1;
        const arr = b.geo.attributes.position.array;
        for (let i = 0; i < b.N; i++) {
          arr[i * 3] = pos.x; arr[i * 3 + 1] = pos.y; arr[i * 3 + 2] = pos.z;
          b.vel[i * 3] = (Math.random() - 0.5) * 2.2;
          b.vel[i * 3 + 1] = Math.random() * 2.0 + 0.3;
          b.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
        }
        b.geo.attributes.position.needsUpdate = true;
      },
      update(dt) {
        for (const b of bursts) {
          if (b.life <= 0) continue;
          b.life -= dt * 1.1;
          if (b.life <= 0) { b.pts.visible = false; continue; }
          const arr = b.geo.attributes.position.array;
          for (let i = 0; i < b.N; i++) {
            arr[i * 3] += b.vel[i * 3] * dt;
            arr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
            arr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
            b.vel[i * 3 + 1] -= 1.4 * dt;
          }
          b.geo.attributes.position.needsUpdate = true;
          b.pts.material.opacity = b.life;
        }
      },
    };
  })();

  // ---------- helpers ----------
  function wrap(v, box) {
    const half = box / 2;
    let x = ((v + half) % box + box) % box - half;
    return x;
  }
  function makePointsGeometry(positions) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  function makeFlowerGeometry() {
    const parts = [];
    const petal = new THREE.SphereGeometry(0.09, 7, 5);
    petal.scale(1, 0.35, 1.55);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const m = new THREE.Matrix4().makeRotationY(a).setPosition(Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11);
      parts.push({ geo: petal, matrix: m });
    }
    const heart = new THREE.SphereGeometry(0.055, 8, 6);
    parts.push({ geo: heart, matrix: new THREE.Matrix4().makeTranslation(0, 0.02, 0) });
    return mergeGeometries(parts);
  }

  return {
    ctx, dew, sparkles,
    update(dt, t, antPos, under, camera) {
      ctx.antPos.copy(antPos); ctx.under = under; ctx.camera = camera;
      for (const u of updates) u(dt, t, ctx);
      sparkles.update(dt);
    },
  };
}
