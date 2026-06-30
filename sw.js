// Service Worker für die PWA (gedanken.spass-am-tanzen.de)
const CACHE_NAME = 'gedanken-pwa-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon-192x192.png'
];

// Installation: Cache alle statischen Ressourcen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
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
    })
  );
});