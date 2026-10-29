// tests/audio_proxy_test.js
// 驗證 functions/audio-proxy.js：對上游永遠係單純 GET（毋轉 Range），Range 由 proxy 自家切；上游錯誤原樣轉出
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// functions/ 係 ESM（export），tests 係 CJS：去掉 export 後載入
const src = fs.readFileSync(path.join(__dirname, '../functions/audio-proxy.js'), 'utf8').replace(/^export /m, '');
const onRequest = new Function(`${src}; return onRequest;`)();

const BYTES = Uint8Array.from({ length: 100 }, (_, i) => i);
const TARGET = 'https://elearning.hakka.gov.tw/hakka/files/cert/vocabulary/112/5/si/si-01-001.mp3';
const mk = (headers = {}) =>
  new Request('https://hakspring.pages.dev/audio-proxy?url=' + encodeURIComponent(TARGET), { headers });

async function withUpstream(responseFactory, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: Object.fromEntries(new Headers((init && init.headers) || {})) });
    return responseFactory();
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const ok = () => new Response(BYTES, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '100' } });

(async () => {
  console.log('🧪 Starting audio-proxy tests...');

  // 1. 無 Range：200，全檔，帶 Accept-Ranges，上游請求無 Range
  await withUpstream(ok, async (calls) => {
    const r = await onRequest({ request: mk() });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await r.arrayBuffer()).byteLength, 100);
    assert.strictEqual(r.headers.get('Accept-Ranges'), 'bytes');
    assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), '*');
    assert.strictEqual(calls.length, 1);
    assert.ok(!('range' in calls[0].headers), '上游請求毋該帶 Range');
  });
  console.log('  ✅ 1. 無 Range：200 全檔 PASS');

  // 2. 有 Range：上游請求「仍然」無 Range／If-Range；proxy 回 206 切片
  await withUpstream(ok, async (calls) => {
    const r = await onRequest({ request: mk({ Range: 'bytes=10-19', 'If-Range': '"x"' }) });
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes 10-19/100');
    assert.strictEqual(r.headers.get('Content-Length'), '10');
    assert.deepStrictEqual([...new Uint8Array(await r.arrayBuffer())], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assert.ok(!('range' in calls[0].headers) && !('if-range' in calls[0].headers), '上游請求毋該帶 Range／If-Range');
  });
  console.log('  ✅ 2. Range：上游無 Range、proxy 自家切 206 PASS');

  // 3. 開放式、尾端 Range
  await withUpstream(ok, async () => {
    let r = await onRequest({ request: mk({ Range: 'bytes=90-' }) });
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes 90-99/100');
    r = await onRequest({ request: mk({ Range: 'bytes=-5' }) });
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes 95-99/100');
    r = await onRequest({ request: mk({ Range: 'bytes=0-' }) });   // Chrome／Firefox 慣用
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes 0-99/100');
    r = await onRequest({ request: mk({ Range: 'bytes=50-9999' }) });   // 超出：截到尾
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes 50-99/100');
  });
  console.log('  ✅ 3. 開放式／尾端／超出 Range PASS');

  // 4. 超出範圍 → 416；畸形 Range（多段、bytes=-）→ 透傳全檔 200
  await withUpstream(ok, async () => {
    let r = await onRequest({ request: mk({ Range: 'bytes=200-300' }) });
    assert.strictEqual(r.status, 416);
    assert.strictEqual(r.headers.get('Content-Range'), 'bytes */100');
    for (const bad of ['bytes=0-1,5-6', 'bytes=-', 'items=0-1', 'garbage']) {
      r = await onRequest({ request: mk({ Range: bad }) });
      assert.strictEqual(r.status, 200, bad);
      assert.strictEqual((await r.arrayBuffer()).byteLength, 100, bad);
    }
  });
  console.log('  ✅ 4. 416、畸形 Range 透傳 PASS');

  // 5. 上游錯誤（404、530）原樣轉出，毋切、毋當音檔
  for (const status of [404, 530]) {
    await withUpstream(
      () => new Response('<html>error</html>', { status, headers: { 'Content-Type': 'text/html' } }),
      async () => {
        const r = await onRequest({ request: mk({ Range: 'bytes=0-' }) });
        assert.strictEqual(r.status, status);
        assert.strictEqual(r.headers.get('Content-Type'), 'text/html');
        assert.strictEqual(await r.text(), '<html>error</html>');
      },
    );
  }
  console.log('  ✅ 5. 上游 404／530 原樣轉出 PASS');

  // 6. 上游 Content-Type 毋係 audio/*：.mp3 校正做 audio/mpeg
  await withUpstream(() => new Response(BYTES, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }), async () => {
    const r = await onRequest({ request: mk() });
    assert.strictEqual(r.headers.get('Content-Type'), 'audio/mpeg');
  });
  console.log('  ✅ 6. Content-Type 校正 PASS');

  // 7. 網址檢查：缺 url 400、非允許網域 403、上游 fetch 丟錯 → 500
  let r = await onRequest({ request: new Request('https://hakspring.pages.dev/audio-proxy') });
  assert.strictEqual(r.status, 400);
  r = await onRequest({ request: new Request('https://hakspring.pages.dev/audio-proxy?url=' + encodeURIComponent('https://evil.example/a.mp3')) });
  assert.strictEqual(r.status, 403);
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('boom'); };
  try {
    r = await onRequest({ request: mk() });
    assert.strictEqual(r.status, 500);
  } finally {
    globalThis.fetch = real;
  }
  console.log('  ✅ 7. 網址檢查、上游例外 PASS');

  console.log('🎉 All audio-proxy tests passed!');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
