// Service Worker für die PWA (gedanken.spass-am-tanzen.de)
const CACHE_NAME = 'gedanken-pwa-v18';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './thoughts.html',
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
  // API-Anfragen nicht abfangen (da dynamisch) — ohne respondWith() lässt der
  // Browser die Anfrage ganz normal selbst laufen. Würde man hier stattdessen
  // manuell fetch(event.request) aufrufen ohne respondWith(), würde der
  // Browser ZUSÄTZLICH seine eigene Anfrage senden -> jede POST-Anfrage
  // (z.B. neuer Gedanke) würde doppelt beim Server ankommen.
  if (event.request.url.includes('/api.php')) {
    return;
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