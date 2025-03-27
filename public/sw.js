const CACHE_NAME = 'scout-app-v1'
const ASSETS = [
  '/',
  '/_next/static/css/app/page.css',
  '/_next/static/chunks/app/page.js',
  '/_next/static/chunks/webpack.js',
  // Add paths to all your form components
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  )}
,

self.addEventListener('fetch', (event) => (
  event.respondWith (
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
) }
