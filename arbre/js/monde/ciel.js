// Le ciel de l'image : coucher de soleil doré et rose, mer de nuages sous l'arbre, lumière chaude.
import * as THREE from 'three';
import { creerBruit } from './utils.js';
import { textureNuage } from './textures.js';

export const DIRECTION_SOLEIL = new THREE.Vector3(0.55, 0.2, -0.62).normalize();

export function creerCiel(scene, { qualite = 'haute' } = {}) {
  // Dôme du ciel : dégradé violet-bleu → rose → or à l'horizon, avec le disque du soleil
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        soleil: { value: DIRECTION_SOLEIL.clone() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 soleil;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 zenith = vec3(0.10, 0.22, 0.62);
          vec3 milieu = vec3(0.88, 0.52, 0.62);
          vec3 horizon = vec3(1.0, 0.74, 0.46);
          vec3 bas = vec3(0.95, 0.62, 0.55);
          vec3 c = mix(horizon, milieu, smoothstep(0.0, 0.32, h));
          c = mix(c, zenith, smoothstep(0.12, 0.7, h));
          c = mix(bas, c, smoothstep(-0.2, 0.02, h));
          float s = max(dot(normalize(vDir), normalize(soleil)), 0.0);
          c += vec3(1.0, 0.72, 0.38) * pow(s, 14.0) * 0.2;
          c += vec3(1.0, 0.9, 0.7) * pow(s, 400.0) * 2.5;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -10;
  scene.add(dome);

  scene.fog = new THREE.FogExp2(0xe6ae96, 0.0006);

  // Lumières : soleil bas et doré, ciel violet en haut, rebond chaud d'en bas
  scene.add(new THREE.HemisphereLight(0xaab4ff, 0xffb48a, 1.15));
  const soleil = new THREE.DirectionalLight(0xffc48a, 3.1);
  soleil.position.copy(DIRECTION_SOLEIL).multiplyScalar(160);
  soleil.target.position.set(10, 8, 0);
  scene.add(soleil, soleil.target);
  if (qualite !== 'basse') {
    soleil.castShadow = true;
    soleil.shadow.mapSize.set(qualite === 'haute' ? 2048 : 1024, qualite === 'haute' ? 2048 : 1024);
    const c = soleil.shadow.camera;
    c.left = -62; c.right = 62; c.top = 50; c.bottom = -40;
    c.near = 20; c.far = 400;
    soleil.shadow.bias = -0.0004;
    soleil.shadow.normalBias = 0.06;
  }

  // Mer de nuages sous l'arbre : chaque nuage est fait de deux couches, une ombre lavande dessous
  // et un dessus doré tourné vers le soleil, ce qui donne du volume
  const bruit = creerBruit(77, 64);
  const map = textureNuage();
  const nuages = [];
  const nb = qualite === 'basse' ? 40 : 110;
  const versSoleil = new THREE.Vector3(DIRECTION_SOLEIL.x, 0, DIRECTION_SOLEIL.z).normalize();
  const couche = (x, y, z, taille, couleur, opacite) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: couleur, transparent: true, opacity: opacite, depthWrite: false, fog: true }));
    s.position.set(x, y, z);
    s.scale.set(taille, taille * 0.55, 1);
    scene.add(s);
    return s;
  };
  for (let i = 0; i < nb; i++) {
    const a = bruit(i * 3.1, 1.7) * Math.PI * 2 * 6.3 + i * 2.399;
    const loin = i % 8 === 0;
    const r = loin ? 300 + (i % 7) * 40 : 14 + Math.sqrt((i + 1) / nb) * 240;
    const y = loin ? 24 + (i % 11) * 6 : -36 + (i % 9) * 2.4 + bruit(i, 9) * 6;
    const taille = loin ? 170 + (i % 6) * 24 : 62 + (i % 8) * 12;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const ombre = couche(x, y - taille * 0.05, z, taille, new THREE.Color().setHSL(0.74, 0.28, 0.6 + (i % 3) * 0.04), loin ? 0.1 : 0.42);
    const lumiere = couche(
      x + versSoleil.x * taille * 0.12, y + taille * 0.09, z + versSoleil.z * taille * 0.12, taille * 0.82,
      new THREE.Color().setHSL(0.07 + bruit(i, 5) * 0.04, 0.8, 0.84 + (i % 3) * 0.03), loin ? 0.1 : 0.422,
    );
    nuages.push({ s: ombre, l: lumiere, vitesse: 0.2 + (i % 5) * 0.05, a, r, dx: lumiere.position.x - x, dz: lumiere.position.z - z, dy: lumiere.position.y - y });
  }

  return {
    dome,
    soleil,
    update(t) {
      for (const n of nuages) {
        const a = n.a + t * n.vitesse * 0.0015;
        n.s.position.x = Math.cos(a) * n.r;
        n.s.position.z = Math.sin(a) * n.r;
        n.l.position.set(n.s.position.x + n.dx, n.s.position.y + n.dy, n.s.position.z + n.dz);
      }
    },
  };
}
