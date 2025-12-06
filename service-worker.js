// service-worker.js

const STATIC_CACHE_NAME = 'hakspring-static-v2'; // Incremented version
const AUDIO_CACHE_NAME = 'hakspring-audio-v1';
const CACHE_VERSION = 2; // Corresponds to static cache version

// App Shell files
const STATIC_ASSETS = [
  '/',
  'index.html',
  'style.css',
  'main.js',
  'js/romanizer.js',
  'manifest.json',
  'apple-touch-icon.png',
  'favicon-32x32.png',
  'favicon-16x16.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'favicon.ico',
  'og-image.png',
  'empty_category.mp3',
  'endOfPlay.mp3',
  'info.md',
  'whatsnew.md'
];

// --- Service Worker Lifecycle ---

self.addEventListener('install', (event) => {
  console.log(`Service Worker v${CACHE_VERSION}: Installing...`);
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching static assets.');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Force the waiting service worker to become the active service worker.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log(`Service Worker v${CACHE_VERSION}: Activating...`);
  // Clean up old caches.
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete caches that are not the current static or audio cache
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== AUDIO_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tell the active service worker to take control of the page immediately.
      return self.clients.claim();
    })
  );
});

// --- Fetch Event for Caching ---

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Ignore requests to Google Analytics
  if (url.hostname.includes('googletagmanager.com')) {
      return;
  }

  // Strategy for audio files: Cache on demand (cache-first)
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(AUDIO_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request).then((networkResponse) => {
            console.log('SW: Caching new audio file:', request.url);
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return; // Done with audio
  }

  // Strategy for all other requests: Cache-first, falling back to network, then caching the new response.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return cachedResponse || fetch(request).then((networkResponse) => {
        // Check if we received a valid response
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
            console.log('SW: Cached new static resource:', request.url);
          });
        }
        return networkResponse;
      });
    })
  );
});