// Service Worker für die PWA (gedanken.spass-am-tanzen.de)
const CACHE_NAME = 'gedanken-pwa-v13';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './pic/icon-192x192.png'
];

// Installation: Cache alle statischen Ressourcen
// Einzeln cachen statt addAll, damit ein einzelner 404 nicht die
// komplette SW-Installation (und damit die PWA-Installierbarkeit) blockiert.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((asset) =>
          cache.add(asset).catch((err) => console.warn('Konnte nicht cachen:', asset, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Fetch: Cache-first-Strategie für statische Ressourcen
self.addEventListener('fetch', (event) => {
  // API-Anfragen nicht cachen (da sie dynamisch sind)
  if (event.request.url.includes('/api.php')) {
    return fetch(event.request);
  }

  // Statische Ressourcen aus dem Cache laden
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// Aktualisierung: Alte Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});