// Ambiance dessin animé : ombrage à paliers, ciel en dégradé, brouillard (le lointain disparaît),
// herbe et nuages qui dérivent très lentement.
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

  // Ciel : bleu en haut, lumière chaude à l'horizon
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
  // Le brouillard cache la partie lointaine de l'arbre : on ne voit jamais tout l'arbre à la fois
  scene.fog = new THREE.Fog(0xcdeeff, 110, 380);

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x7bb34a, 1.6));
  const soleil = new THREE.DirectionalLight(0xfff1cc, 1.9);
  soleil.position.set(80, 260, 60);
  scene.add(soleil);

  // Herbe : un grand disque au pied de l'arbre
  const herbe = new THREE.Mesh(
    new THREE.CircleGeometry(900, 64),
    new THREE.MeshToonMaterial({ color: 0x8fd35e, gradientMap: rampe }),
  );
  herbe.rotation.x = -Math.PI / 2;
  herbe.position.y = -0.05;
  scene.add(herbe);

  // Nuages : grappes de boules blanches, très loin au-dessus de l'arbre
  const ensemble = new THREE.Group();
  scene.add(ensemble);
  const matNuage = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe });
  for (let i = 0; i < 9; i++) {
    const grappe = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const boule = new THREE.Mesh(new THREE.SphereGeometry(10 + ((k * 7 + i) % 3) * 4, 16, 12), matNuage);
      boule.position.set((k - 2) * 14, (k % 2) * 4, ((i + k) % 2) * 8);
      grappe.add(boule);
    }
    const r = 330 + i * 25;
    grappe.position.set(Math.cos(i * 2.1) * r, 230 + (i % 3) * 25, Math.sin(i * 2.1) * r);
    ensemble.add(grappe);
  }

  return {
    update(t) {
      ensemble.rotation.y = t * 0.01;
    },
  };
}
