// Scène : rendu, ciel doré, brouillard, lumières et transition monde aérien / sous-sol.
import * as THREE from 'three';
import { lerp, smoothstep } from './util.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uGround, uSunColor;
uniform vec3 uSunDir;
uniform float uUnder; // 0 = jour, 1 = sous-sol
uniform vec3 uUnderColor;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.02, 0.5, h));
  col = mix(uGround, col, smoothstep(-0.08, 0.03, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 90.0) * 0.9 + pow(s, 7.0) * 0.22);
  col = mix(col, uUnderColor, uUnder);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();

  // Ciel
  const skyUni = {
    uTop: { value: new THREE.Color(0x6fb0dd) },
    uHorizon: { value: new THREE.Color(0xffe4b8) },
    uGround: { value: new THREE.Color(0x2c4430) },
    uSunColor: { value: new THREE.Color(0xffdca0) },
    uSunDir: { value: SUN_DIR.clone() },
    uUnder: { value: 0 },
    uUnderColor: { value: new THREE.Color(0x0b1e2b) },
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    uniforms: skyUni, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // Environnement réfléchissant (rosée qui scintille) généré depuis le ciel
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), skyMat.clone()));
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // Brouillard
  const fogAbove = new THREE.Color(0xe6efdd);
  const fogBelow = new THREE.Color(0x0b1e2b);
  scene.fog = new THREE.FogExp2(fogAbove.getHex(), 0.0072);

  // Lumières (three r155+ : unités physiques, intensités × ~3)
  const hemi = new THREE.HemisphereLight(0xd6e6ff, 0x74924f, 3.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a3, 7.5);
  sun.position.copy(SUN_DIR).multiplyScalar(80);
  scene.add(sun);
  const ambBelow = new THREE.AmbientLight(0x1a3a4a, 0.0);
  scene.add(ambBelow);

  // Lanterne de Zira (s'allume sous terre)
  const lantern = new THREE.PointLight(0xffc978, 0, 10, 1.4);
  scene.add(lantern);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.08, 900);
  camera.position.set(0, 12, 20);

  let under = 0;
  const tmpFog = new THREE.Color();

  return {
    renderer, scene, camera, sky, lantern, SUN_DIR,
    setLanternPos(p) { lantern.position.copy(p); },
    // f : 0 (jour) -> 1 (sous-sol)
    update(dt, f) {
      under = lerp(under, f, 1 - Math.exp(-4 * dt));
      skyUni.uUnder.value = under;
      sky.position.copy(camera.position);
      tmpFog.copy(fogAbove).lerp(fogBelow, under);
      scene.fog.color.copy(tmpFog);
      scene.fog.density = lerp(0.0072, 0.03, under);
      renderer.setClearColor(tmpFog);
      hemi.intensity = lerp(3.9, 0.8, under);
      sun.intensity = lerp(7.5, 0.9, under);
      ambBelow.intensity = under * 3.2;
      lantern.intensity = under * 14.0;
    },
    resize() {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    },
    setQuality(pr) { renderer.setPixelRatio(pr); },
  };
}
