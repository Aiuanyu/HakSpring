// service-worker.js

const CACHE_NAME = 'audio-cache-v1';

// --- Service Worker Lifecycle ---

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  // The Service Worker is installed.
  // We don't need to pre-cache anything here, caching will be done on the fly.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  // Clean up old caches if necessary.
  event.waitUntil(self.clients.claim());
});

// --- Fetch Event for Caching ---

self.addEventListener('fetch', (event) => {
  // We only want to cache audio files.
  // [Modified] Support both direct .mp3 files and proxied audio URLs.
  if (
    event.request.url.endsWith('.mp3') ||
    event.request.url.includes('/audio-proxy?url=')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          // If the file is already in the cache, serve it.
          if (response) {
            console.log('SW: Serving audio from cache:', event.request.url);
            return response;
          }

          // If not in cache, fetch from the network, cache it, and then return it.
          return fetch(event.request).then((networkResponse) => {
            console.log('SW: Caching new audio file:', event.request.url);
            // We need to clone the response because a response can only be consumed once.
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(error => {
            console.error('SW: Fetching and caching audio failed:', error);
            // If fetch fails, we can't do much, just let the browser handle the error.
            throw error;
          });
        });
      })
    );
  } else {
    // For all other requests, just let the browser handle it.
    event.respondWith(fetch(event.request));
  }
});