const CACHE_NAME = 'nevo-static-v4';
const STATIC_ASSETS = [
  '/offline-fallback.html',
  '/manifest.webmanifest',
  '/icons/nevo-192.png',
  '/icons/nevo-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(STATIC_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: 'no-store' });
        if (response.ok) await cache.put(asset, response);
      } catch {
        // An unavailable optional asset must not abort service-worker installation.
      }
    }));
  }));
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

  // Next.js assets are build-id specific. Never cache them in this worker;
  // serving an old chunk after a rebuild produces a blank page and 404s.
  if (url.pathname.startsWith('/_next/')) return;

  if (request.mode === 'navigate') {
    const fallback = async () => {
      const fallback = await caches.match('/offline-fallback.html');
      if (!fallback) return Response.error();
      return url.pathname === '/offline' ? fallback : Response.redirect('/offline', 302);
    };
    event.respondWith(self.navigator.onLine === false ? fallback() : fetch(request).catch(fallback));
  }
});
