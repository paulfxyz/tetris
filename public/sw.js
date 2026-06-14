// tetris — service worker
// Cache-first for the small static bundle so the game works offline.

const CACHE = 'tetris-v1.5.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/themes.css',
  'css/game.css',
  'js/app.js',
  'js/engine.js',
  'js/renderer.js',
  'js/input.js',
  'js/background.js',
  'js/sound.js',
  'js/scoreboard.js',
  'js/storage.js',
  'assets/favicon.svg',
  'assets/music.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
