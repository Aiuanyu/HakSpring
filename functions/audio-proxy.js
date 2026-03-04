export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Basic security: only proxy from elearning.hakka.gov.tw
  if (!targetUrl.startsWith('https://elearning.hakka.gov.tw/')) {
    return new Response('Invalid target URL', { status: 403 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'HakSpring-Proxy',
      },
    });

    // Create a new response to modify headers
    const newResponse = new Response(response.body, response);

    // Set permissive CORS and CORP headers
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return newResponse;
  } catch (err) {
    return new Response('Proxy error: ' + err.message, { status: 500 });
  }
}
