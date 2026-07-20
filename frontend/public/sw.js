const CACHE_PREFIX = 'ilka-static-';
const CACHE_NAME = `${CACHE_PREFIX}2026-07-20-v1`;
const OFFLINE_FALLBACK = './offline.html';
const CORE_STATIC_ASSETS = [
  OFFLINE_FALLBACK,
  './manifest.webmanifest',
  './ilka-icon.svg',
];
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest']);
const NEVER_CACHE_PATH_SEGMENTS = ['/api/', '/commands/', '/events/', '/projections/', '/sync/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function mustBypassCache(url) {
  return NEVER_CACHE_PATH_SEGMENTS.some((segment) => url.pathname.includes(segment));
}

async function networkWithStaticCache(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  if (response.ok && response.type === 'basic' && !isJson) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || mustBypassCache(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_FALLBACK)),
    );
    return;
  }

  if (CACHEABLE_DESTINATIONS.has(request.destination)) {
    event.respondWith(networkWithStaticCache(request));
  }
});
