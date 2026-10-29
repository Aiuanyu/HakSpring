export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Basic security: only proxy from elearning.hakka.gov.tw or localhost for development
  const isHakkaGov = targetUrl.startsWith('https://elearning.hakka.gov.tw/');
  const isLocalhost = /^https?:\/\/localhost([:/]|$)/.test(targetUrl);

  if (!isHakkaGov && !isLocalhost) {
    return new Response('Invalid target URL', { status: 403 });
  }

  try {
    // 對上游永遠係單純个 GET（毋轉 Range／If-Range），同 PR #280 之前一樣。
    // 轉 Range 个時節線上音檔全部變 530；懷疑係上游抑 Cloudflare 對帶 Range 个 Worker 請求回錯誤（未確認）。
    // Range 改由這下自家處理（見下）。
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'HakSpring-Proxy',
      },
    });

    // Firefox（特別是安卓）播音檔愛 Range 回應（206／Content-Range）。上游个完整檔收轉來，自家切：
    // 音檔細（數十 KB）。上游毋係 200（404、403、530…）就原樣轉出，毋做 Range 處理。
    const rangeHeader = request.headers.get('Range');
    const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
    const wantsRange = response.status === 200 && rangeMatch && !(rangeMatch[1] === '' && rangeMatch[2] === '');

    let newResponse;
    let total = 0;
    let buf = null;
    if (wantsRange) {
      buf = await response.arrayBuffer();
      total = buf.byteLength;
      newResponse = new Response(buf, response);
    } else {
      newResponse = new Response(response.body, response);
    }

    // 上游 Content-Type 毋係 audio/*（例如 application/octet-stream）時，Firefox 會拒播（Chrome 會自家偵測），共佢校正做 audio/mpeg
    const ctype = newResponse.headers.get('Content-Type') || '';
    // 用 pathname 判斷，網址帶 query 抑係 .MP3 大寫都會中
    let isMp3 = false;
    try {
      isMp3 = new URL(targetUrl).pathname.toLowerCase().endsWith('.mp3');
    } catch (e) {
      /* 網址無效就毋校正 */
    }
    if (response.ok && isMp3 && !/^audio\//i.test(ctype)) {
      newResponse.headers.set('Content-Type', 'audio/mpeg');
    }

    if (wantsRange) {
      let start;
      let end;
      if (rangeMatch[1] === '') {
        start = Math.max(0, total - parseInt(rangeMatch[2], 10));
        end = total - 1;
      } else {
        start = parseInt(rangeMatch[1], 10);
        end = rangeMatch[2] === '' ? total - 1 : Math.min(parseInt(rangeMatch[2], 10), total - 1);
      }
      const headers = new Headers(newResponse.headers);
      headers.set('Accept-Ranges', 'bytes');
      if (start > end || start >= total) {
        headers.set('Content-Range', `bytes */${total}`);
        headers.delete('Content-Length');
        newResponse = new Response(null, { status: 416, headers });
      } else {
        headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
        headers.set('Content-Length', String(end - start + 1));
        newResponse = new Response(buf.slice(start, end + 1), { status: 206, headers });
      }
    } else if (response.status === 200) {
      newResponse.headers.set('Accept-Ranges', 'bytes');
    }
    newResponse.headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges',
    );

    // Set permissive CORS and CORP headers
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return newResponse;
  } catch (err) {
    return new Response('Proxy error: ' + err.message, { status: 500 });
  }
}
