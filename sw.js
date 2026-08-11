// Offline support.
//
// The game is cached whole on first visit and served from cache thereafter, so
// a second launch does not need a network at all — including on a plane, which
// is exactly the case the queued-score design exists for.
//
// The API is deliberately never cached. A stale leaderboard is worse than an
// absent one, and score submission has its own retry queue in the page.

const CACHE = 'moonhop-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './src/core/config.js',
  './src/core/rng.js',
  './src/core/arc.js',
  './src/core/patterns.js',
  './src/core/sim.js',
  './src/render/palette.js',
  './src/render/scene.js',
  './src/render/jerboa.js',
  './src/render/obstacles.js',
  './src/render/renderer.js',
  './src/net/storage.js',
  './src/net/api.js',
  './src/ui/leaderboard.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always live, or not at all

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Serve instantly, refresh quietly for next time.
        event.waitUntil(
          fetch(request)
            .then((res) => {
              if (res && res.ok) return caches.open(CACHE).then((c) => c.put(request, res));
            })
            .catch(() => {}),
        );
        return hit;
      }

      return fetch(request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
