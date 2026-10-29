// service-worker.js

// v2：舊 v1 caches 會存著當時抓失敗个錯誤回應（403／404／500 抑係錯 Content-Type），
// 換 SW 毋會自家清掉，所以升版名並在 activate 時刪舊 cache，用戶正會重新抓著正確音檔。
const CACHE_NAME = 'audio-cache-v2';

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
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('audio-cache-') && n !== CACHE_NAME)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
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
            // 只處理單段 Range（多段、opaque 快取、bytes=- 都透傳網路）
            const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
            if (!cached || !m || (m[1] === '' && m[2] === '') || cached.status !== 200) {
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
                // 合成个 206 愛帶 CORS／CORP，毋然 crossorigin 載入會被擋
                'Access-Control-Allow-Origin':
                  cached.headers.get('Access-Control-Allow-Origin') || '*',
                'Cross-Origin-Resource-Policy':
                  cached.headers.get('Cross-Origin-Resource-Policy') || 'cross-origin',
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
            // 跨來源直連 .mp3 係 opaque（status 0），也愛存，毋然離線優先會失效
            if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
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