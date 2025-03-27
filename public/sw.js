const CACHE_NAME = 'scout-app-v1';
const ASSETS = [
  '/',
  '/scanner',
  '/manifest.json',
  // Add other important assets
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
});