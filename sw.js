// C-LO service worker — minimal, network-first.
//
// Purpose: satisfy the PWA installability requirement that Bubblewrap / the
// TWA and Lighthouse check for (a registered worker with a fetch handler).
//
// Design choice — NETWORK-FIRST, deliberately: C-LO is a live Firebase game
// whose code and economy change often. A cache-first worker would trap players
// on stale index.html the same way old Downloads copies trapped us during
// development. So we always try the network first and only fall back to cache
// when offline. Bump CACHE_VERSION on any release you want to force-flush.
const CACHE_VERSION = 'clo-v1';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  // Pre-cache the shell so the app can open offline, then activate immediately.
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch(() => {})           // never let a cache miss block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Drop every old cache version so a new release can't be shadowed by an old
  // one. This is what makes a CACHE_VERSION bump behave like a clean flush.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET. Never touch POST/PUT — those are Firebase/auth/analytics
  // writes and must always hit the network untouched.
  if (req.method !== 'GET') return;

  // Never intercept cross-origin requests (Firebase, Google APIs, ad/billing
  // endpoints, gstatic). Let the network handle them directly.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first: always prefer fresh. Cache the fresh copy for offline, and
  // fall back to cache only when the network is unavailable.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
