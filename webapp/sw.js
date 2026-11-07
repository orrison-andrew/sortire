const CACHE_NAME = 'sortire-pwa-v20';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './codes.css',
  './gl-util.js',
  './disc.js',
  './table-layer.js',
  './material-set.js',
  './woodgrain.js',
  './rocktexture.js',
  './effects.js',
  './sound.js',
  './personal.js',
  './settings.js',
  './surface-mode.js',
  './table.js',
  './app.js',
  './manifest.webmanifest'
];

const OPTIONAL_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-round-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

// Precache bypasses the browser HTTP cache ('reload'), so a new version can never
// be built from stale copies of its files. There is no skipWaiting() here: the
// "Update" button in the app sends SKIP_WAITING when the person is ready.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' })));
      await Promise.all(OPTIONAL_ASSETS.map((u) =>
        cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// Cache-first from this version's own cache. Files are never rewritten in place,
// because that could mix new and old files.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(req, { ignoreSearch: true });

    return hit || fetch(req);
  })());
});
