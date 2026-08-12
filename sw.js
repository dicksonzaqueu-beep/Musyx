/* Musyx service worker — offline-first caching.
   Bump CACHE version whenever you change the app to force an update. */
const CACHE = 'musyx-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './ai/interfaces.js',
  './ai/registry.js',
  './ai/bootstrap.js',
  './ai/llm-manager.js',
  './ai/queue-manager.js',
  './ai/cost-tracker.js',
  './ai/response-cache.js',
  './ai/cost-router.js',
  './ai/genre-db.js',
  './ai/prompt-engine.js',
  './ai/lyrics.js',
  './ai/music-selector.js',
  './ai/providers/music-wavespeed.js',
  './ai/providers/music-suno.js',
  './ai/providers/music-udio.js',
  './ai/providers/music-stableaudio.js',
  './ai/providers/llm-openai.js',
  './ai/providers/image-coverart.js'
];

// install: pre-cache the app shell so it opens with no network
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// fetch strategy:
//  - app shell / same-origin GET -> cache-first (instant, offline-capable)
//  - everything else (API calls, audio CDNs) -> network, fall back to cache
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never cache POSTs (generation/payment)
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // The main page (index.html / root) is served NETWORK-FIRST so that updates
    // — like a changed API_ENDPOINT — reach every device on the next reload,
    // instead of being stuck behind an old cached page. Falls back to cache when
    // offline, preserving the offline-first promise.
    const isHTML = url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
    if (isHTML) {
      e.respondWith(
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
      );
      return;
    }
    // Everything else same-origin (JS modules, icons) stays cache-first for speed.
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
  } else {
    // cross-origin (e.g. generated audio): try network, cache the result for offline replay
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
