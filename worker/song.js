// Song of the Day: routes and picking one of my 9+ songs that has a note.
// The pool comes from the published ranking data (RANKING_KV 'ranking-data');
// the note text is read from Notion with the NOTION_TOKEN secret when a song is picked.
import { isAdmin, redirectToLogin } from './auth.js';
import { pickRandom } from './lyrics.js';
import { children } from './notion-album.js';
import { allSongs, songPool, songLink, noteFromBlocks } from './song-pool.js';
import { renderSongPage, renderHistoryPage, renderSongAdminPage } from './song-pages.js';

const json = (body, status, corsHeaders) => new Response(JSON.stringify(body), {
  status: status || 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
const today = () => new Date().toISOString().slice(0, 10);

export async function handleSong(request, env, url, corsHeaders) {
  if (url.pathname === '/song' && request.method === 'GET') {
    const data = await env.SONG_KV.get('song-of-the-day');
    return new Response(renderSongPage(data), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
    });
  }

  if (url.pathname === '/history' && request.method === 'GET') {
    const data = await env.SONG_KV.get('pick-history');
    return new Response(renderHistoryPage(data), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
    });
  }

  if (url.pathname === '/song-admin' && request.method === 'GET') {
    if (!(await isAdmin(request, env))) {
      return redirectToLogin(url);
    }
    const todayRaw = await env.SONG_KV.get('song-of-the-day');
    const historyRaw = await env.SONG_KV.get('pick-history');
    const prevRaw = await env.SONG_KV.get('previous-pick');
    const pool = songPool(await getRankingData(env));
    const used = new Set((await getSongHistory(env)).map(h => h.block).filter(Boolean));
    const stats = { pool: pool.length, left: pool.filter(s => !used.has(s.block)).length, hasToken: !!env.NOTION_TOKEN };
    return new Response(renderSongAdminPage(todayRaw, historyRaw, prevRaw, stats), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (url.pathname === '/song-admin/reroll' && request.method === 'POST') {
    if (!(await isAdmin(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
    try {
      const pick = await refreshSong(env);
      if (!pick) return json({ ok: false, error: 'No 9+ songs with notes in the ranking data' }, 400, corsHeaders);
      return json({ ok: true, pick }, 200, corsHeaders);
    } catch (err) {
      return json({ ok: false, error: String(err) }, 500, corsHeaders);
    }
  }

  if (url.pathname === '/song-admin/undo' && request.method === 'POST') {
    if (!(await isAdmin(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
    const prev = await env.SONG_KV.get('previous-pick');
    if (!prev) return json({ ok: false, error: 'Nothing to undo' }, 400, corsHeaders);
    const current = await env.SONG_KV.get('song-of-the-day');
    if (current) await env.SONG_KV.put('previous-pick', current);
    await env.SONG_KV.put('song-of-the-day', prev);
    const prevPick = JSON.parse(prev);
    await addToHistory(env, today(), prevPick);
    return json({ ok: true, pick: prevPick }, 200, corsHeaders);
  }

  // Pick a specific song by artist + title (any rating, as long as it's in the ranking data).
  if (url.pathname === '/song-admin/set' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
    const artist = String(body.artist || '').trim().toLowerCase();
    const title = String(body.title || '').trim().toLowerCase();
    const dateStr = String(body.date || '').trim() || today();
    if (!artist || !title) return json({ ok: false, error: 'Artist and title required' }, 400, corsHeaders);
    const song = allSongs(await getRankingData(env))
      .find(s => s.artist.toLowerCase() === artist && s.title.toLowerCase() === title);
    if (!song) return json({ ok: false, error: 'Not found in the ranking data (check the spelling)' }, 404, corsHeaders);
    const pick = { ...(await buildPick(env, song)), manual: true };
    const current = await env.SONG_KV.get('song-of-the-day');
    if (current) await env.SONG_KV.put('previous-pick', current);
    await env.SONG_KV.put('song-of-the-day', JSON.stringify(pick));
    await addToHistory(env, dateStr, pick);
    return json({ ok: true, pick, date: dateStr }, 200, corsHeaders);
  }

  if (url.pathname === '/song-admin/clear-history' && request.method === 'POST') {
    if (!(await isAdmin(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401, corsHeaders);
    await env.SONG_KV.delete('pick-history');
    return json({ ok: true }, 200, corsHeaders);
  }

  if (url.pathname === '/refresh-song' && request.method === 'GET') {
    if (!(await isAdmin(request, env))) {
      return redirectToLogin(url);
    }
    try {
      const pick = await refreshSong(env);
      if (!pick) return new Response('No 9+ songs with notes in the ranking data', { status: 400 });
      return new Response(JSON.stringify({ ok: true, pick }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }, null, 2), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  return null;
}

async function getRankingData(env) {
  try { return JSON.parse(await env.RANKING_KV.get('ranking-data') || '{}') || {}; } catch (e) { return {}; }
}

async function getSongHistory(env) {
  const raw = await env.SONG_KV.get('pick-history');
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

// One history line per date, newest first.
async function addToHistory(env, dateStr, pick) {
  let history = (await getSongHistory(env)).filter(h => h.date !== dateStr);
  history.push({
    date: dateStr, artist: pick.artist, title: pick.title, release: pick.release || null,
    rating: pick.rating ?? null, tier: pick.tier || null, block: pick.block || null, link: pick.link || null,
    cover: pick.cover || null, note: pick.note || null,
  });
  history.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  await env.SONG_KV.put('pick-history', JSON.stringify(history.slice(0, 500)));
}

// The song's note, read from its toggle in Notion. null when there's no token or Notion fails.
async function readNote(env, block) {
  if (!env.NOTION_TOKEN) return { note: null, error: 'NOTION_TOKEN secret not set' };
  try {
    return { note: noteFromBlocks(await children(block, 'Bearer ' + env.NOTION_TOKEN)) };
  } catch (e) {
    return { note: null, error: String(e.message || e) };
  }
}

async function buildPick(env, song) {
  const { note, error } = song.note ? await readNote(env, song.block) : { note: [] };
  return {
    ...song,
    link: songLink(song.pageId, song.block),
    note,
    ...(error ? { noteError: error } : {}),
    updatedAt: new Date().toISOString(),
    manual: false,
  };
}

// Picks a song not picked before (starting over once all have been), saves it as today's
// song and in the history. The old pick goes to the undo slot. Used by cron and Re-roll.
export async function refreshSong(env) {
  const pool = songPool(await getRankingData(env));
  if (!pool.length) return null;

  const dateStr = today();
  const history = (await getSongHistory(env)).filter(h => h.date !== dateStr);
  const used = new Set(history.map(h => h.block).filter(Boolean));
  let remaining = pool.filter(s => !used.has(s.block));
  if (!remaining.length) remaining = pool;

  // A note can be emptied in Notion after the ranking was published: try a few songs.
  let pick;
  for (let tries = 0; tries < 3 && remaining.length; tries++) {
    const song = pickRandom(remaining);
    pick = await buildPick(env, song);
    if (!pick.note || pick.note.length) break;
    remaining = remaining.filter(s => s !== song);
  }

  const current = await env.SONG_KV.get('song-of-the-day');
  if (current) await env.SONG_KV.put('previous-pick', current);
  await env.SONG_KV.put('song-of-the-day', JSON.stringify(pick));
  await addToHistory(env, dateStr, pick);
  return pick;
}
