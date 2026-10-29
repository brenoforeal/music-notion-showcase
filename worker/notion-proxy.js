// Notion proxy: forwards the calculator's requests to api.notion.com with CORS headers.

export async function handleNotionProxy(request, env, url, corsHeaders) {
  const target = request.headers.get('X-Target-URL');
  if (!target || !target.startsWith('https://api.notion.com/')) {
    return new Response('Bad target', { status: 400, headers: corsHeaders });
  }
  const notionHeaders = new Headers();
  for (const [k, v] of request.headers) {
    const lk = k.toLowerCase();
    if (lk !== 'x-target-url' && lk !== 'host' && lk !== 'origin' && lk !== 'referer') {
      notionHeaders.set(k, v);
    }
  }
  const reqBody = ['GET', 'HEAD'].includes(request.method) ? null : await request.text();
  const res = await fetch(target, { method: request.method, headers: notionHeaders, body: reqBody });
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders)) out.headers.set(k, v);
  return out;
}
