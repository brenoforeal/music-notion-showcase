// GET /cover-options?artist=<artist>&album=<album>
// GET /artist-photo-options?artist=<artist> (Deezer artist photos, see artistPhotoOptions)
// Candidate album covers for the calculator's cover picker (see albumCoverOptions in covers.js).
// Only public lookups (MusicBrainz, Cover Art Archive, Deezer), so no login is needed.
import { albumCoverOptions, artistPhotoOptions } from './covers.js';

export async function handleCoverOptions(request, env, url, corsHeaders) {
  const photos = url.pathname === '/artist-photo-options';
  if ((url.pathname !== '/cover-options' && !photos) || request.method !== 'GET') return null;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
  });

  const artist = (url.searchParams.get('artist') || '').trim();
  const album = (url.searchParams.get('album') || '').trim();
  if (photos) {
    if (!artist) return json({ error: 'Send an artist.' }, 400);
    try { return json({ options: await artistPhotoOptions(artist) }); }
    catch (e) { return json({ error: e.message || String(e) }, 502); }
  }
  if (!artist || !album) return json({ error: 'Send both artist and album.' }, 400);

  try {
    return json({ options: await albumCoverOptions(artist, album) });
  } catch (e) {
    return json({ error: e.message || String(e) }, 502);
  }
}
