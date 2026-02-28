// ConvertWeaver Service Worker v1.0
const CACHE_NAME = 'convertweaver-v2';

// Core app files
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// CDN dependencies to cache
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/marked/14.1.3/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.4.1/mermaid.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Sora:wght@300;400;500;600;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap'
];

// Install: cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache app shell (critical — fail install if these can't be cached)
      await cache.addAll(APP_SHELL);

      // Cache CDN assets (best-effort — don't fail install if one CDN is slow)
      for (const url of CDN_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`SW: Could not cache ${url}`, err);
        }
      }

      console.log('SW: Install complete, assets cached');
    })
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`SW: Deleting old cache ${name}`);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // HTML pages: network-first (so updates are picked up)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback to cached version
          return caches.match(request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // All other assets: cache-first (fast), with network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Only cache successful responses from known origins
        if (response && response.status === 200) {
          const isKnownOrigin =
            url.origin === self.location.origin ||
            url.hostname.includes('cdnjs.cloudflare.com') ||
            url.hostname.includes('fonts.googleapis.com') ||
            url.hostname.includes('fonts.gstatic.com');

          if (isKnownOrigin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
        }
        return response;
      });
    })
  );
});
