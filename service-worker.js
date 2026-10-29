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
    // Range 請求（Firefox 播音檔慣用）：Cache API 毋會存 206，也毋好共完整 200 當做 Range 回應，
    // 所以快取有完整檔就切出 206，無就直接透傳網路，毋寫入快取。
    const rangeHeader = event.request.headers.get('Range');
    if (rangeHeader) {
      event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
          cache.match(event.request, { ignoreVary: true }).then(async (cached) => {
            const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
            if (!cached || !m || cached.status !== 200) {
              return fetch(event.request);
            }
            const buf = await cached.arrayBuffer();
            const total = buf.byteLength;
            let start;
            let end;
            if (m[1] === '') {
              start = Math.max(0, total - parseInt(m[2], 10));
              end = total - 1;
            } else {
              start = parseInt(m[1], 10);
              end = m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
            }
            if (start > end || start >= total) {
              return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` },
              });
            }
            return new Response(buf.slice(start, end + 1), {
              status: 206,
              headers: {
                'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Length': String(end - start + 1),
                'Accept-Ranges': 'bytes',
              },
            });
          }),
        ),
      );
      return;
    }

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
            // 只快取完整 200 回應（206 / 錯誤回應毋好存）
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
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