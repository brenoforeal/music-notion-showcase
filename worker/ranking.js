// Album ranking: public /ranking page and /publish (called by the calculator).
import { renderRankingPage } from './ranking-page.js';

export async function handleRanking(request, env, url, corsHeaders) {
  if (url.pathname === '/ranking' && request.method === 'GET') {
    const data = await env.RANKING_KV.get('ranking-data');
    return new Response(renderRankingPage(data), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

      if (url.pathname === '/publish' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !body.secret) {
      return new Response('Bad request', { status: 400, headers: corsHeaders });
    }
    if (body.secret !== env.PUBLISH_SECRET) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
          // Reuse the client-supplied timestamp if present, otherwise keep the
    // existing one from KV, otherwise fall back to now.
    let ts = body.publishedAt || null;
    if (!ts) {
      const existing = await env.RANKING_KV.get('ranking-data');
      try {
        const parsed = JSON.parse(existing || '{}');
        if (parsed.publishedAt) ts = parsed.publishedAt;
      } catch (e) {}
    }
    if (!ts) ts = new Date().toISOString();

    await env.RANKING_KV.put('ranking-data', JSON.stringify({
      albums: Array.isArray(body.albums) ? body.albums : [],
      others: Array.isArray(body.others) ? body.others : [],
      extras: Array.isArray(body.extras) ? body.extras : [],
      artistPhotos: body.artistPhotos && typeof body.artistPhotos === 'object' ? body.artistPhotos : {},
      artistPages: body.artistPages && typeof body.artistPages === 'object' ? body.artistPages : {},
      ratingsPage: typeof body.ratingsPage === 'string' ? body.ratingsPage : null,
      publishedAt: ts
    }));
    return new Response(JSON.stringify({ ok: true, publishedAt: ts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  return null;
}
