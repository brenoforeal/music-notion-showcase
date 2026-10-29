// Lyric of the Day: routes, picking songs per group, fetching lyrics, snippet extraction.
// Songs in the lyrics library (pasted .txt files, KV "lyrics-library") get a whole
// section; other songs fall back to lrclib and a 4-line snippet.
import { isAdmin, redirectToLogin } from './auth.js';
import { findAlbumCover, findCover } from './covers.js';
import { DEFAULT_GROUPS } from './lyric-groups.js';
import { eligibleSections, pickableSections, parseLyricsText, normalizeKey, songKey, MAX_SECTION_LINES } from './lyric-library.js';
import { renderLyricHistoryPage, renderLyricPage, renderLyricAdminPage } from './lyric-pages.js';

export async function handleLyrics(request, env, url, corsHeaders) {
  if (url.pathname === '/lyric-of-the-day' && request.method === 'GET') {
    const data = await env.RANKING_KV.get('lyric-of-the-day');
    const groups = await getLyricGroups(env);
    return new Response(renderLyricPage(data, groups.map(g => g.id)), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
    });
  }

  // Your own artist photos (lyrics/<Artist>/artist.jpg), uploaded by "npm run lyrics -- --upload".
  // URLs carry ?v=<hash>, so a new photo gets a new URL and old ones can be cached for long.
  if (url.pathname.startsWith('/artist-photo/') && request.method === 'GET') {
    const key = url.pathname.slice('/artist-photo/'.length);
    const { value, metadata } = await env.RANKING_KV.getWithMetadata('artist-photo:' + key, 'arrayBuffer');
    if (!value) return new Response('Not found', { status: 404 });
    return new Response(value, {
      headers: {
        'Content-Type': (metadata && metadata.type) || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      }
    });
  }

  if (url.pathname === '/lyric-admin/refresh-covers' && request.method === 'POST') {
    if (!(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    // Looks up today's covers again (skipping the cache) without changing the lyrics.
    const currentRaw = await env.RANKING_KV.get('lyric-of-the-day');
    let current;
    try { current = JSON.parse(currentRaw || '{}'); } catch (e) { current = {}; }
    const hist = await getLyricHistory(env);
    const summary = {};
    for (const [id, g] of Object.entries(current.groups || {})) {
      if (!g || !g.artist) continue;
      const updated = await withCover(env, g, true);
      current.groups[id] = { ...g, ...pickFields(updated) };
      // Same song in today's history entry gets the new cover too.
      for (const h of hist[id] || []) {
        if (h.artist === g.artist && h.title === g.title) Object.assign(h, pickFields({ ...h, cover: updated.cover, coverType: updated.coverType, album: updated.album }));
      }
      summary[id] = { title: g.title, coverType: updated.coverType, album: updated.album };
    }
    await env.RANKING_KV.put('lyric-of-the-day', JSON.stringify(current));
    await env.RANKING_KV.put('lyric-history', JSON.stringify(hist));
    return new Response(JSON.stringify({ ok: true, groups: summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-history' && request.method === 'GET') {
    const groups = await getLyricGroups(env);
    const histRaw = await env.RANKING_KV.get('lyric-history');
    return new Response(renderLyricHistoryPage(groups, histRaw), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' }
    });
  }

  if (url.pathname === '/lyric-admin' && request.method === 'GET') {
    if (!(await isAdmin(request, env))) {
      return redirectToLogin(url);
    }
    const groups = await getLyricGroups(env);
    const data = await env.RANKING_KV.get('lyric-of-the-day');
    const histRaw = await env.RANKING_KV.get('lyric-history');
    const prevRaw = await env.RANKING_KV.get('lyric-previous');
    return new Response(renderLyricAdminPage(groups, data, histRaw, prevRaw), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  if (url.pathname === '/lyric-admin/save' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    if (!body.groups || typeof body.groups !== 'object') {
      return new Response('Bad request', { status: 400, headers: corsHeaders });
    }

    const existingRaw = await env.RANKING_KV.get('lyric-of-the-day');
    let existing;
    try { existing = JSON.parse(existingRaw || '{}'); } catch (e) { existing = {}; }
    const existingGroups = existing.groups || {};

    const prevRaw = await env.RANKING_KV.get('lyric-previous');
    let prev;
    try { prev = JSON.parse(prevRaw || '{}'); } catch (e) { prev = {}; }

    const dateStr = String(body.date || '').trim() || new Date().toISOString().slice(0, 10);

    existing.groups = existing.groups || {};
    for (const [id, g] of Object.entries(body.groups)) {
      if (!g || typeof g !== 'object') continue;
      const old = existingGroups[id];
      if (old) prev[id] = old;
      // Same song as before: keep its section label and cover.
      const sameSong = old && old.artist === g.artist && old.title === g.title;
      const fields = pickFields({ ...(sameSong ? old : {}), artist: g.artist, title: g.title, lines: g.lines });
      existing.groups[id] = {
        label: g.label || '',
        header: g.header || '',
        ...fields,
        manuallyEdited: true,
      };
      if (g.artist && g.title) {
        await appendLyricHistory(env, id, { date: dateStr, ...fields });
      }
    }
    existing.updatedAt = new Date().toISOString();
    await env.RANKING_KV.put('lyric-of-the-day', JSON.stringify(existing));
    await env.RANKING_KV.put('lyric-previous', JSON.stringify(prev));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/reroll' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const groups = await getLyricGroups(env);
    const group = groups.find(g => g.id === body.groupId);
    if (!group) {
      return new Response('Unknown group', { status: 400, headers: corsHeaders });
    }

    const currentRaw = await env.RANKING_KV.get('lyric-of-the-day');
    let current;
    try { current = JSON.parse(currentRaw || '{}'); } catch (e) { current = {}; }
    if (current.groups && current.groups[body.groupId]) {
      const prevRaw = await env.RANKING_KV.get('lyric-previous');
      let prev;
      try { prev = JSON.parse(prevRaw || '{}'); } catch (e) { prev = {}; }
      prev[body.groupId] = current.groups[body.groupId];
      await env.RANKING_KV.put('lyric-previous', JSON.stringify(prev));
    }

    const found = await getLyricForGroup(env, group);
    if (!found) {
      return new Response(JSON.stringify({ ok: false, error: 'No lyric found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const fields = pickFields(await withCover(env, found));

    // Write the new pick into lyric-of-the-day for this group
    const currentRaw2 = await env.RANKING_KV.get('lyric-of-the-day');
    let current2;
    try { current2 = JSON.parse(currentRaw2 || '{}'); } catch (e) { current2 = {}; }
    current2.groups = current2.groups || {};
    current2.groups[group.id] = {
      label: group.label,
      header: group.header,
      ...fields,
      manuallyEdited: false,
    };
    current2.updatedAt = new Date().toISOString();
    await env.RANKING_KV.put('lyric-of-the-day', JSON.stringify(current2));

    await appendLyricHistory(env, group.id, {
      date: new Date().toISOString().slice(0, 10),
      ...fields
    });

    return new Response(JSON.stringify({
      ok: true,
      group: {
        label: group.label,
        header: group.header,
        ...fields,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/undo' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const groupId = body.groupId;
    if (!groupId) {
      return new Response(JSON.stringify({ ok: false, error: 'groupId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const prevRaw = await env.RANKING_KV.get('lyric-previous');
    let prev;
    try { prev = JSON.parse(prevRaw || '{}'); } catch (e) { prev = {}; }
    const prevGroup = prev[groupId];
    if (!prevGroup) {
      return new Response(JSON.stringify({ ok: false, error: 'Nothing to undo for this group' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const currentRaw = await env.RANKING_KV.get('lyric-of-the-day');
    let current;
    try { current = JSON.parse(currentRaw || '{}'); } catch (e) { current = {}; }
    current.groups = current.groups || {};
    const currentGroup = current.groups[groupId];
    current.groups[groupId] = prevGroup;
    await env.RANKING_KV.put('lyric-of-the-day', JSON.stringify(current));

    if (currentGroup) {
      prev[groupId] = currentGroup;
      await env.RANKING_KV.put('lyric-previous', JSON.stringify(prev));
    }

    const today = new Date().toISOString().slice(0, 10);
    let hist = await getLyricHistory(env);
    if (hist[groupId]) {
      hist[groupId] = hist[groupId].filter(h => h.date !== today);
      hist[groupId] = [{ date: today, ...pickFields(prevGroup) }, ...hist[groupId]];
      hist[groupId].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      await env.RANKING_KV.put('lyric-history', JSON.stringify(hist));
    }

    return new Response(JSON.stringify({ ok: true, group: prevGroup }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/history/add' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
          const { groupId, date, artist, title } = body;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!groupId || !date || !artist || !title) {
      return new Response(JSON.stringify({ ok: false, error: 'groupId, date, artist, title required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await appendLyricHistory(env, groupId, { date, artist, title, lines });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/history/edit' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const { groupId, oldDate, newDate, artist, title } = body;
    if (!groupId || !oldDate) {
      return new Response(JSON.stringify({ ok: false, error: 'groupId and oldDate required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const hist = await getLyricHistory(env);
    if (!hist[groupId]) {
      return new Response(JSON.stringify({ ok: false, error: 'Group has no history' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const idx = hist[groupId].findIndex(h => h.date === oldDate);
    if (idx === -1) {
      return new Response(JSON.stringify({ ok: false, error: 'Entry not found for that date' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const entry = hist[groupId][idx];
    hist[groupId][idx] = {
      ...entry, // keeps section, cover, album
      date: String(newDate || oldDate).trim(),
      artist: String(artist || entry.artist).trim(),
      title: String(title || entry.title).trim(),
      lines: Array.isArray(body.lines) ? body.lines.slice(0, HISTORY_MAX_LINES) : (entry.lines || [])
    };
    hist[groupId].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    await env.RANKING_KV.put('lyric-history', JSON.stringify(hist));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/history/delete' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const { groupId, date } = body;
    if (!groupId || !date) {
      return new Response(JSON.stringify({ ok: false, error: 'groupId and date required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const hist = await getLyricHistory(env);
    if (!hist[groupId]) {
      return new Response(JSON.stringify({ ok: false, error: 'Group has no history' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    hist[groupId] = hist[groupId].filter(h => h.date !== date);
    await env.RANKING_KV.put('lyric-history', JSON.stringify(hist));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/groups/save' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const parsed = parseGroupsText(body.text || '');
    if (!parsed.length) {
      return new Response(JSON.stringify({ ok: false, error: 'No groups parsed' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await env.RANKING_KV.put('lyric-groups', JSON.stringify(parsed));
    return new Response(JSON.stringify({ ok: true, count: parsed.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/lyric-admin/groups/reseed' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body || !(await isAdmin(request, env))) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    if (body.confirm !== 'yes-really-reseed') {
      return new Response(JSON.stringify({ ok: false, error: 'Confirmation required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await env.RANKING_KV.put('lyric-groups', JSON.stringify(DEFAULT_GROUPS));
    return new Response(JSON.stringify({ ok: true, count: DEFAULT_GROUPS.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (url.pathname === '/refresh-lyric' && request.method === 'GET') {
    if (!(await isAdmin(request, env))) {
      return redirectToLogin(url);
    }
    try {
      const result = await refreshLyric(env);
      return new Response(JSON.stringify({ ok: true, result }, null, 2), {
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

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const LINES_PER_PICK = 4;         // lyric snippet size
const SKIP_DAYS = 3;              // soft block: song off-limits for N days
const MAX_SNIPPET_ATTEMPTS = 4;   // retry snippet extraction to avoid repeats
export const PUBLIC_HISTORY_PER_GROUP = 30;
export const ADMIN_HISTORY_PER_GROUP = 20;
const HISTORY_MAX_PER_GROUP = 200;
const HISTORY_MAX_LINES = MAX_SECTION_LINES; // a whole section fits in history

// Fields of a pick that are saved in lyric-of-the-day and in history.
function pickFields(p) {
  return {
    artist: p.artist || '',
    title: p.title || '',
    lines: Array.isArray(p.lines) ? p.lines.slice(0, HISTORY_MAX_LINES) : [],
    section: p.section || null,   // "Chorus", "Verse 2"... (null for lrclib snippets)
    cover: p.cover || null,       // image URL
    coverType: p.coverType || null, // 'album' or 'artist'
    album: p.album || null,
  };
}

// Album covers that were found are remembered here (one lookup per song).
// Bump the version when the lookup rules change, so old answers are looked up again.
const COVER_CACHE_KEY = 'cover-cache-v2';

// Adds cover fields to a pick. Artist photos aren't cached, so a new
// artist.jpg takes effect right away. fresh: skip the cache.
async function withCover(env, found, fresh) {
  const { artists, covers } = await getLyricLibraryData(env);
  // A song pinned in lyrics/covers.txt has its own cache entry per album, so
  // adding, changing or removing a pin takes effect without clearing anything.
  const pinned = covers[songKey(found.artist, found.title)];
  const key = songKey(found.artist, found.title) + (pinned ? '@' + normalizeKey(pinned.album) : '');
  let cache = {};
  try { cache = JSON.parse((await env.RANKING_KV.get(COVER_CACHE_KEY)) || '{}'); } catch (e) {}
  let cover = fresh ? null : cache[key];
  if (!cover) {
    const own = artists[normalizeKey(found.artist)];
    // Pinned album first; if it can't be found, the normal lookup.
    cover = (pinned && await findAlbumCover(found.artist, pinned.album)) ||
      await findCover(found.artist, found.title, own && own.photo);
    if (cover && cover.coverType === 'album') {
      cache[key] = cover;
      await env.RANKING_KV.put(COVER_CACHE_KEY, JSON.stringify(cache));
    }
  }
  return { ...found, ...(cover || { cover: null, coverType: null, album: null }) };
}

// ═══════════════════════════════════════════════════════
// GROUPS: read, parse, save
// ═══════════════════════════════════════════════════════

async function getLyricGroups(env) {
  const raw = await env.RANKING_KV.get('lyric-groups');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {}
  }
  await env.RANKING_KV.put('lyric-groups', JSON.stringify(DEFAULT_GROUPS));
  return DEFAULT_GROUPS;
}

export function groupsToText(groups) {
  const lines = [];
  for (const g of groups) {
    lines.push('# ' + g.label);
    for (const [artist, title] of g.songs) {
      lines.push(artist + ' | ' + title);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function parseGroupsText(text) {
  const groups = [];
  let current = null;

  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.replace(/\s+$/g, '');
    if (!line.trim()) continue;

    if (line.startsWith('#')) {
      const label = line.replace(/^#+\s*/, '').trim();
      if (!label) continue;
      const id = label.toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 24) || ('g' + groups.length);
      current = {
        id,
        label,
        header: 'Random ' + label + ' lyric of the day',
        songs: []
      };
      groups.push(current);
      continue;
    }

    if (!current) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 2) continue;
    const artist = parts[0];
    const title = parts.slice(1).join(' | ').trim();
    if (!artist || !title) continue;
    current.songs.push([artist, title]);
  }

  return groups.filter(g => g.songs.length);
}

// ═══════════════════════════════════════════════════════
// LYRIC HISTORY
// ═══════════════════════════════════════════════════════

async function getLyricHistory(env) {
  const raw = await env.RANKING_KV.get('lyric-history');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (e) { return {}; }
}

async function appendLyricHistory(env, groupId, entry) {
  const hist = await getLyricHistory(env);
  if (!hist[groupId]) hist[groupId] = [];
  hist[groupId] = hist[groupId].filter(h => h.date !== entry.date);
  hist[groupId].unshift({ date: entry.date, ...pickFields(entry) });
  hist[groupId].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  hist[groupId] = hist[groupId].slice(0, HISTORY_MAX_PER_GROUP);
  await env.RANKING_KV.put('lyric-history', JSON.stringify(hist));
}

function recentTitlesForGroup(hist, groupId) {
  const arr = (hist && hist[groupId]) || [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SKIP_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return new Set(
    arr
      .filter(h => (h.date || '') >= cutoffStr)
      .map(h => (h.artist || '') + '||' + (h.title || ''))
  );
}
function normalizeLine(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function linesFromHistoryForSong(hist, groupId, artist, title) {
  const arr = (hist && hist[groupId]) || [];
  const key = (artist || '') + '||' + (title || '');
  const used = new Set();
  for (const h of arr) {
    if ((h.artist || '') + '||' + (h.title || '') !== key) continue;
    const lines = Array.isArray(h.lines) ? h.lines : [];
    for (const l of lines) {
      const n = normalizeLine(l);
      if (n) used.add(n);
    }
  }
  return used;
}

function snippetOverlaps(lines, usedSet) {
  if (!usedSet.size) return false;
  for (const l of lines) {
    const n = normalizeLine(l);
    if (n && usedSet.has(n)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════
// LYRIC FETCH + SNIPPET EXTRACTION
// ═══════════════════════════════════════════════════════

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Shuffles the array in place (Fisher–Yates) and returns it.
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchLyrics(artist, title) {
  // Try LRCLIB first
  try {
    const lrclibUrl = 'https://lrclib.net/api/get'
      + '?artist_name=' + encodeURIComponent(artist)
      + '&track_name=' + encodeURIComponent(title);
    const res = await fetch(lrclibUrl, {
      headers: { 'User-Agent': 'album-ranking-worker/1.0' },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.plainLyrics) return data.plainLyrics;
    }
  } catch (e) {}

  // Fallback: lyrics.ovh
  try {
    const url = 'https://api.lyrics.ovh/v1/'
      + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !data.lyrics) return null;
    return data.lyrics;
  } catch (e) {
    return null;
  }
}

function isBoringLine(line) {
  const words = line.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const counts = {};
    words.forEach(w => counts[w] = (counts[w] || 0) + 1);
    const max = Math.max(...Object.values(counts));
    if (max / words.length > 0.6) return true;
  }
  const letters = (line.match(/[a-zA-Z]/g) || []).length;
  if (letters / line.length < 0.55) return true;
  return false;
}

function splitIntoLines(lyrics) {
  const raw = lyrics.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  for (const line of raw) {
    if (line.length <= 140) { out.push(line); continue; }
    const parts = line.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) { out.push(...parts); }
    else {
      const words = line.split(/\s+/);
      let buf = '';
      for (const w of words) {
        if ((buf + ' ' + w).trim().length > 90) {
          if (buf) out.push(buf.trim());
          buf = w;
        } else { buf = (buf + ' ' + w).trim(); }
      }
      if (buf) out.push(buf.trim());
    }
  }
  return out;
}

function findRepeatingStanzas(lyrics) {
  const stanzas = lyrics
    .split(/\n\s*\n/)
    .map(s => s.split('\n').map(l => l.trim()).filter(l => l.length >= 20 && l.length <= 140))
    .filter(s => s.length >= 2);
  const counts = {};
  stanzas.forEach(s => {
    const key = s.join('|').toLowerCase().slice(0, 120);
    counts[key] = (counts[key] || 0) + 1;
  });
  return stanzas.filter(s => {
    const key = s.join('|').toLowerCase().slice(0, 120);
    return counts[key] >= 2;
  });
}

function extractSnippet(lyrics) {
  const choruses = findRepeatingStanzas(lyrics);
  if (choruses.length) {
    const stanza = pickRandom(choruses);
    const clean = stanza.filter(l => !isBoringLine(l));
    const pool = clean.length >= LINES_PER_PICK ? clean : stanza;
    if (pool.length >= LINES_PER_PICK) {
      const max = pool.length - LINES_PER_PICK;
      const i = max > 0 ? Math.floor(Math.random() * (max + 1)) : 0;
      return pool.slice(i, i + LINES_PER_PICK);
    }
  }
  let lines = splitIntoLines(lyrics)
    .filter(l => l.length >= 20 && l.length <= 140)
    .filter(l => !/^\[.*\]$/.test(l) && !/^\(.*\)$/.test(l))
    .filter(l => !isBoringLine(l));
  if (lines.length < LINES_PER_PICK) {
    const anyLines = splitIntoLines(lyrics).filter(l => l.length > 0);
    if (anyLines.length >= LINES_PER_PICK) {
      const max = anyLines.length - LINES_PER_PICK;
      const i = max > 0 ? Math.floor(Math.random() * (max + 1)) : 0;
      return anyLines.slice(i, i + LINES_PER_PICK);
    }
    return null;
  }
  let start = 0, end = lines.length;
  if (lines.length >= 8) {
    start = Math.floor(lines.length * 0.15);
    end = Math.floor(lines.length * 0.85);
  }
  const span = Math.max(1, end - start - LINES_PER_PICK);
  const i = start + Math.floor(Math.random() * span);
  return lines.slice(i, i + LINES_PER_PICK);
}

// ═══════════════════════════════════════════════════════
// LYRICS LIBRARY (whole sections from pasted .txt files)
// ═══════════════════════════════════════════════════════

// { songs: { songKey: { artist, title, sections } }, artists: { artistKey: { photo } },
//   covers: { songKey: { album } } (from lyrics/covers.txt) }
async function getLyricLibraryData(env) {
  const raw = await env.RANKING_KV.get('lyrics-library');
  try {
    const parsed = JSON.parse(raw || '{}');
    return { songs: parsed.songs || {}, artists: parsed.artists || {}, covers: parsed.covers || {} };
  } catch (e) {
    return { songs: {}, artists: {}, covers: {} };
  }
}

async function getLyricLibrary(env) {
  return (await getLyricLibraryData(env)).songs;
}

// Per artist: an artist with at least one usable library song uses only their
// library songs (whether or not they're in the group list); any other artist
// keeps the group's song list, fetched from lrclib.
export function groupPool(group, library) {
  const usable = Object.values(library).filter(s => eligibleSections(s.sections).length);
  const libraryArtists = new Set(usable.map(s => normalizeKey(s.artist)));
  const groupArtists = new Set(group.songs.map(([a]) => normalizeKey(a)));
  const fromList = group.songs.filter(([a]) => !libraryArtists.has(normalizeKey(a)));
  const fromLibrary = usable
    .filter(s => groupArtists.has(normalizeKey(s.artist)))
    .map(s => [s.artist, s.title]);
  return [...fromList, ...fromLibrary];
}

// A random 2-8 line section (not too repetitive), preferring ones not shown before for this song.
function pickSection(song, usedLines) {
  const eligible = pickableSections(song.sections, song.artist);
  const fresh = eligible.filter(s => !snippetOverlaps(s.lines, usedLines));
  const pool = fresh.length ? fresh : eligible;
  return pool.length ? pickRandom(pool) : null;
}

// Library section if the song has a usable one, otherwise a block from lrclib.
async function lyricForSong(library, artist, title, usedLines, allowRepeat) {
  const libSong = library[songKey(artist, title)];
  if (libSong && eligibleSections(libSong.sections).length) {
    const section = pickSection(libSong, allowRepeat ? new Set() : usedLines);
    return section ? { artist, title, lines: section.lines, section: section.label } : null;
  }
  const lyrics = await fetchLyrics(artist, title);
  if (!lyrics) return null;
  // lrclib text has blank lines between blocks, like an unlabelled Genius page:
  // read it the same way and pick a whole block (labels kept if it has any).
  const block = pickSection({ artist, sections: parseLyricsText(lyrics).sections }, allowRepeat ? new Set() : usedLines);
  if (block) {
    // Every block already shown: let the caller try another song, as before.
    if (!allowRepeat && snippetOverlaps(block.lines, usedLines)) return null;
    return { artist, title, lines: block.lines, ...(block.label ? { section: block.label } : {}) };
  }
  // No 2-8 line blocks (e.g. no blank lines at all): the old 4-line snippet.
  const snippet = extractSnippet(lyrics);
  if (!snippet) return null;
  if (!allowRepeat && snippetOverlaps(snippet, usedLines)) return null;
  return { artist, title, lines: snippet };
}

async function getLyricForGroup(env, group) {
  const hist = await getLyricHistory(env);
  const library = await getLyricLibrary(env);
  const songs = groupPool(group, library);
  const recent = recentTitlesForGroup(hist, group.id);   // last SKIP_DAYS days

  // Step 1: exclude songs from the last few days
  const recentFiltered = songs.filter(([a, t]) => !recent.has(a + '||' + t));
  const poolA = recentFiltered.length ? recentFiltered : songs;

  // Step 2: from poolA, exclude songs whose used snippets might overlap
  // (we can't know the exact snippet until we fetch it, so we prioritize
  //  songs with no history at all, then songs with few used lines)
  const scored = poolA.map(([a, t]) => {
    const used = linesFromHistoryForSong(hist, group.id, a, t);
    return { pair: [a, t], usedCount: used.size };
  });

  // Sort: songs with fewer used lines first (so we try fresh material first).
  // Shuffle first: sort keeps ties in list order, so without it the "top half"
  // below was always the first half of the list (e.g. only Paul Weller songs).
  shuffle(scored).sort((x, y) => x.usedCount - y.usedCount);

  const attempts = MAX_SNIPPET_ATTEMPTS;
  const tried = new Set();
  for (let i = 0; i < attempts; i++) {
    // Pick randomly, but bias toward songs with fewer used lines
    // (take a random slice of the first N candidates)
    const top = scored.slice(0, Math.max(6, Math.ceil(scored.length * 0.5)));
    let candidate;
    let inner = 0;
    do {
      candidate = pickRandom(top);
      inner++;
      if (inner > 20) break;
    } while (tried.has(candidate.pair[0] + '||' + candidate.pair[1]));
    if (!candidate) break;

    const [a, t] = candidate.pair;
    tried.add(a + '||' + t);

    // Skip lines already shown for this song (retry with another song if so)
    const used = linesFromHistoryForSong(hist, group.id, a, t);
    const found = await lyricForSong(library, a, t, used, false);
    if (found) return found;
  }

  // Fallback: relax the no-repeat rule, just pick something
  for (let i = 0; i < 3; i++) {
    const [a, t] = pickRandom(poolA);
    const found = await lyricForSong(library, a, t, null, true);
    if (found) return found;
  }

  return null;
}

export async function refreshLyric(env) {
  const groups = await getLyricGroups(env);
  const results = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const group of groups) {
    try {
      const found = await getLyricForGroup(env, group);
      if (found) {
        const fields = pickFields(await withCover(env, found));
        results[group.id] = {
          label: group.label,
          header: group.header,
          ...fields,
        };
        await appendLyricHistory(env, group.id, { date: today, ...fields });
      } else {
        results[group.id] = null;
      }
    } catch (err) {
      results[group.id] = null;
    }
  }
  const payload = {
    updatedAt: new Date().toISOString(),
    groups: results,
  };
  await env.RANKING_KV.put('lyric-of-the-day', JSON.stringify(payload));
  return payload;
}
