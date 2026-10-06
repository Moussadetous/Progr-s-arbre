// Service worker : cache hors-ligne pour la version web (PWA).
const CACHE = 'zira-arbre-v1';
const CORE = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './src/main.js', './src/rng.js', './src/util.js', './src/scene.js', './src/tree.js',
  './src/leaves.js', './src/ant.js', './src/movement.js', './src/input.js',
  './src/camera.js', './src/decor.js', './src/landmarks.js', './src/audio.js', './src/ui.js',
  './vendor/three.module.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit);
    })
  );
});
