const CACHE_NAME = 'nevo-static-v2';
const STATIC_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/nevo-192.png',
  '/icons/nevo-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => caches.keys()).then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('nevo-static-') && key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font' ||
      request.destination === 'image' || url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')));
  }
});
