self.addEventListener('install', (event) => {
  self.skipWaiting();
  console.log('[Service Worker] Installed');
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated');
});

self.addEventListener('fetch', (event) => {
  // Respond with original request
  event.respondWith(fetch(event.request));
});
