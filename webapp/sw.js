const CACHE_NAME = 'sortire-pwa-v18';

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
  './settings.js',
  './surface-mode.js',
  './table.js',
  './app.js',
  './manifest.webmanifest'
];

const OPTIONAL_ASSETS = [
  './codes.txt',
  './icons/icon-192.png',
  './icons/icon-round-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).then(() =>
        Promise.all(OPTIONAL_ASSETS.map((url) => cache.add(url).catch(() => {})))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
