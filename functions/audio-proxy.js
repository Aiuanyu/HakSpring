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
    const upstreamHeaders = {
      'User-Agent': request.headers.get('User-Agent') || 'HakSpring-Proxy',
    };
    // Firefox（特別是安卓）播音檔會用 Range 請求，愛轉給上游，毋然就收無 206 / Content-Range
    const range = request.headers.get('Range');
    if (range) upstreamHeaders['Range'] = range;
    const ifRange = request.headers.get('If-Range');
    if (ifRange) upstreamHeaders['If-Range'] = ifRange;

    const response = await fetch(targetUrl, { headers: upstreamHeaders });

    // Create a new response to modify headers
    const newResponse = new Response(response.body, response);

    // 上游 Content-Type 毋係 audio/*（例如 application/octet-stream）時，Firefox 會拒播（Chrome 會自家偵測），共佢校正做 audio/mpeg
    const ctype = newResponse.headers.get('Content-Type') || '';
    if (response.ok && targetUrl.endsWith('.mp3') && !/^audio\//i.test(ctype)) {
      newResponse.headers.set('Content-Type', 'audio/mpeg');
    }
    if (!newResponse.headers.has('Accept-Ranges')) {
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
