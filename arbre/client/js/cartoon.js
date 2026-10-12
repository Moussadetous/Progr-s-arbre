// Ambiance dessin animé : ombrage à paliers (toon), ciel en dégradé, nuages et herbe.
import * as THREE from 'three';

// Rampe à 4 paliers : transforme l'ombrage progressif en aplats de couleur
export function rampeToon() {
  const tex = new THREE.DataTexture(new Uint8Array([110, 175, 235, 255]), 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function creerDecor(scene) {
  const rampe = rampeToon();

  // Ciel : dégradé bleu vers une lumière chaude à l'horizon
  const canevas = document.createElement('canvas');
  canevas.width = 4;
  canevas.height = 256;
  const g = canevas.getContext('2d');
  const degrade = g.createLinearGradient(0, 0, 0, 256);
  degrade.addColorStop(0, '#4fb8ff');
  degrade.addColorStop(0.65, '#bfeaff');
  degrade.addColorStop(1, '#fff4c9');
  g.fillStyle = degrade;
  g.fillRect(0, 0, 4, 256);
  const ciel = new THREE.CanvasTexture(canevas);
  ciel.colorSpace = THREE.SRGBColorSpace;
  scene.background = ciel;
  scene.fog = new THREE.Fog(0xcdeeff, 45, 120);

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x7bb34a, 1.6));
  const soleil = new THREE.DirectionalLight(0xfff1cc, 1.9);
  soleil.position.set(12, 26, 10);
  scene.add(soleil);

  // Herbe : un grand disque vert, parsemé de buissons
  const herbe = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshToonMaterial({ color: 0x8fd35e, gradientMap: rampe }),
  );
  herbe.rotation.x = -Math.PI / 2;
  herbe.position.y = -0.02;
  scene.add(herbe);

  const matBuisson = new THREE.MeshToonMaterial({ color: 0x5fb24a, gradientMap: rampe });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + Math.sin(i * 12.9) * 0.2;
    const rayon = 16 + ((i * 37) % 13);
    const buisson = new THREE.Mesh(new THREE.SphereGeometry(1.2 + (i % 3) * 0.5, 14, 10), matBuisson);
    buisson.position.set(Math.cos(angle) * rayon, 0.2, Math.sin(angle) * rayon);
    buisson.scale.y = 0.7;
    scene.add(buisson);
  }

  // Nuages : petites grappes de boules blanches qui tournent très lentement
  const ensembleNuages = new THREE.Group();
  scene.add(ensembleNuages);
  const matNuage = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe });
  for (let i = 0; i < 7; i++) {
    const grappe = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const boule = new THREE.Mesh(new THREE.SphereGeometry(1.4 + ((k * 7 + i) % 3) * 0.5, 16, 12), matNuage);
      boule.position.set((k - 1.5) * 2.1, (k % 2) * 0.6, ((i + k) % 2) * 0.8);
      grappe.add(boule);
    }
    const r = 26 + i * 3;
    grappe.position.set(Math.cos(i * 2.1) * r, 20 + (i % 3) * 4, Math.sin(i * 2.1) * r);
    ensembleNuages.add(grappe);
  }

  return {
    update(t) {
      ensembleNuages.rotation.y = t * 0.015;
    },
  };
}
