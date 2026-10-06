// Zira et le Grand Arbre — un jeu d'exploration et d'émerveillement.
// Une petite fourmi parcourt un arbre immense : branches, feuilles, canopée,
// et les racines profondes. Pas de combat, seulement de la beauté à découvrir.
import * as THREE from 'three';
import { generateTree } from './tree.js';
import { createLeafSystem } from './leaves.js';
import { createScene } from './scene.js';
import { createAnt } from './ant.js';
import { Walker } from './movement.js';
import { createInput } from './input.js';
import { FollowCam } from './camera.js';
import { createDecor } from './decor.js';
import { createLandmarks } from './landmarks.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { smoothstep, clamp } from './util.js';

const FREE_MODE = new URLSearchParams(location.search).has('free'); // caméra orbitale (démo)

// ---------- sauvegarde ----------
const SAVE_KEY = 'zira-arbre-v1';
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (e) { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

function boot() {
  const ui = createUI();
  const audio = createAudio();

  let sceneApi = null, walker = null, ant = null, cam = null, decor = null,
    landmarks = null, leafSys = null, input = null, tree = null;
  let running = false, celebrated = false;
  let dewCollected = new Set();
  const clock = new THREE.Clock();
  const stats = { fps: 60, acc: 0, frames: 0, prLevel: 0 };
  const PR_STEPS = (() => {
    const init = Math.min(window.devicePixelRatio || 1, 2);
    const steps = [init];
    for (const f of [0.8, 0.62, 0.5]) {
      const v = Math.max(0.66, init * f);
      if (v < steps[steps.length - 1] - 0.01) steps.push(v);
    }
    return steps;
  })();

  // ---------- démarrage ----------
  ui.showTitle();
  ui.onStart(async () => {
    ui.hideTitle();
    audio.init();
    await new Promise((r) => setTimeout(r, 60)); // laisse le titre s'estomper

    tree = generateTree();
    const canvas = document.createElement('canvas');
    document.getElementById('app').appendChild(canvas);

    sceneApi = createScene(canvas);
    sceneApi.scene.add(tree.barkMesh);

    leafSys = createLeafSystem(tree.leaves);
    sceneApi.scene.add(leafSys.group);

    ant = createAnt();
    sceneApi.scene.add(ant.root);

    walker = new Walker(tree.nodes, tree.FOOT);
    const berceau = tree.handles.berceau;
    const startNode = berceau ? berceau.node : tree.handles.trunkTip;
    const startFacing = berceau
      ? tree.nodes[tree.leaves[berceau.leaf].nodes[2]].pos.clone().sub(tree.nodes[berceau.node].pos).normalize()
      : new THREE.Vector3(1, 0, 0);
    walker.setStart(startNode, startFacing);

    cam = new FollowCam(sceneApi.camera, tree.handles.trunkSpine || []);
    cam.snap(walker.pos, walker.up, walker.facing);

    decor = createDecor(sceneApi.scene, tree, tree.rng);
    landmarks = createLandmarks(tree);

    input = createInput();
    input.onDoubleTap(() => cam.toggleZoom());

    // restauration de la progression
    const save = loadSave();
    if (save) {
      landmarks.markFound(save.found || []);
      (save.dew || []).forEach((i) => {
        dewCollected.add(i);
        const item = decor.dew.items.find((d) => d.instIdx === i);
        if (item) { item.collected = true; decor.dew.collect(i); }
      });
      celebrated = !!save.celebrated;
    }

    // interface
    ui.setSoundIcon(false);
    ui.onJournal(() => ui.openJournal(landmarks.list));
    ui.onCloseJournal(() => ui.closeJournal());
    ui.onSound(() => ui.setSoundIcon(audio.toggleMute()));
    ui.onReset(() => {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      location.reload();
    });
    document.getElementById('btn-journal').classList.remove('hidden');
    document.getElementById('btn-sound').classList.remove('hidden');
    document.getElementById('chips').classList.remove('hidden');
    ui.setCounts(landmarks.foundCount(), landmarks.list.length, dewCollected.size, decor.dew.items.length);

    window.addEventListener('resize', () => sceneApi.resize());

    // petit scénario d'introduction
    ui.toast('🐜', 'Zira et le Grand Arbre', 'Bienvenue !', 5000);
    setTimeout(() => ui.showHint('👇 <b>Glisse ton doigt vers le bas</b> pour avancer<br>◀ ▶ à gauche et à droite pour tourner'), 2200);

    running = true;
    clock.start();
    // hook de debug/tests
    window.__ZIRA = {
      walker, tree, landmarks, sceneApi, get fps() { return stats.frames > 0 ? stats.frames / Math.max(stats.acc, 0.001) : 0; },
    };
    requestAnimationFrame(loop);
  });

  // ---------- boucle ----------
  function loop() {
    requestAnimationFrame(loop);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.066);
    const t = clock.elapsedTime;

    input.update();
    walker.update(dt, input.state);
    ant.update(dt, t, walker, input.state.steer);
    leafSys.setAntLeaf(walker.leafId);
    leafSys.update(dt, t);

    const under = smoothstep(1.2, -0.6, walker.pos.y); // 0 jour -> 1 sous-sol
    sceneApi.setLanternPos(walker.pos.clone().addScaledVector(walker.up, 0.5));
    sceneApi.update(dt, under);
    ui.setVignette(under * 0.85);
    audio.update(dt, under);

    if (FREE_MODE) {
      const a = t * 0.1;
      sceneApi.camera.position.set(Math.cos(a) * 42, 16 + Math.sin(t * 0.07) * 10, Math.sin(a) * 42);
      sceneApi.camera.up.set(0, 1, 0);
      sceneApi.camera.lookAt(0, 16, 0);
    } else {
      cam.update(dt, walker.pos, walker.up, walker.facing, input.state.steer);
    }

    decor.update(dt, t, walker.pos, under, sceneApi.camera);

    // découvertes
    const newly = landmarks.check(walker.pos);
    for (const lm of newly) {
      ui.toast(lm.icon, lm.name, '✨ Lieu découvert');
      audio.chime();
      decor.sparkles.spawn(walker.pos.clone().addScaledVector(walker.up, 0.6), 0xffe9a8);
      ui.setCounts(landmarks.foundCount(), landmarks.list.length, dewCollected.size, decor.dew.items.length);
      persist();
    }

    // rosée
    if (dewCollected.size < decor.dew.items.length) {
      for (const item of decor.dew.items) {
        if (item.collected) continue;
        if (walker.pos.distanceToSquared(item.pos) < 0.42) {
          item.collected = true;
          dewCollected.add(item.instIdx);
          decor.dew.collect(item.instIdx);
          decor.sparkles.spawn(item.pos, 0xbfefff);
          audio.blip();
          ui.setCounts(landmarks.foundCount(), landmarks.list.length, dewCollected.size, decor.dew.items.length);
          persist();
        }
      }
    }

    // masque le tutoriel après le premier vrai déplacement
    if (!input.hasMoved || Math.abs(input.state.throttle) > 0.15) { /* rien */ }
    if (walker.moved > 3) ui.hideHint();

    // fin de l'aventure
    if (!celebrated && landmarks.foundCount() === landmarks.list.length && landmarks.list.length > 0) {
      celebrated = true;
      ui.celebrate();
      audio.celebration();
      for (let k = 0; k < 10; k++) {
        setTimeout(() => decor.sparkles.spawn(
          walker.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4)),
          0xffd97a), k * 260);
      }
      persist();
    }

    // qualité adaptative (avec hystérésis)
    stats.acc += dt; stats.frames++; stats.cooldown -= dt;
    if (stats.acc > 3) {
      const fps = stats.frames / stats.acc;
      stats.fps = fps;
      stats.acc = 0; stats.frames = 0;
      if (stats.cooldown <= 0) {
        if (fps < 28 && stats.prLevel < PR_STEPS.length - 1) {
          stats.prLevel++; stats.cooldown = 6;
          sceneApi.setQuality(PR_STEPS[stats.prLevel]);
        } else if (fps > 55 && stats.prLevel > 0) {
          stats.prLevel--; stats.cooldown = 6;
          sceneApi.setQuality(PR_STEPS[stats.prLevel]);
        }
      }
    }

    sceneApi.renderer.render(sceneApi.scene, sceneApi.camera);
  }

  function persist() {
    writeSave({
      found: landmarks.list.filter((l) => l.found).map((l) => l.id),
      dew: [...dewCollected],
      celebrated,
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
