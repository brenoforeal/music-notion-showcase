// Cover image for a Lyric of the Day pick. Free APIs, no keys. In order:
//   1. MusicBrainz + Cover Art Archive: the original album/EP the song is on
//   2. Deezer track search: an album the song is on (sometimes a compilation)
//   3. your own artist photo (lyrics/<Artist>/artist.jpg)
//   4. Deezer artist photo
// (iTunes isn't used: it rejects requests from Cloudflare's shared servers with 429.)
import { normalizeKey } from './lyric-library.js';

const TIMEOUT_MS = 6000;
const MB_HEADERS = { 'User-Agent': 'music-notion/1.0 (personal Lyric of the Day page)', 'Accept': 'application/json' };

// Returns { cover, coverType: 'album' | 'artist', album } or null.
export async function findCover(artist, title, ownArtistPhoto) {
  const album = (await twice(() => musicBrainzCover(artist, title))) ||
    (await twice(() => deezerTrackCover(artist, title)));
  if (album) return album;
  if (ownArtistPhoto) return { cover: ownArtistPhoto, coverType: 'artist', album: null };
  return twice(() => deezerArtistPhoto(artist));
}

// The cover of a specific album, for songs pinned in lyrics/covers.txt.
// Returns { cover, coverType: 'album', album } or null when the album isn't found.
export async function findAlbumCover(artist, album) {
  return (await twice(() => musicBrainzAlbumCover(artist, album))) ||
    (await twice(() => deezerAlbumCover(artist, album)));
}

// Several candidate covers for an album, for the calculator's cover picker.
// MusicBrainz release groups (with a Cover Art Archive front) first, then Deezer.
// "Self Titled" means the album is named after the artist; "(Remastered 2009)" etc. is ignored.
// Returns [{ url, source, title, detail }], best guesses first, no duplicates.
export async function albumCoverOptions(artist, album) {
  const name = /^self[- ]?titled$/i.test(String(album).trim()) ? artist : baseTitle(album);
  const [mb, dz] = await Promise.all([
    twice(() => musicBrainzAlbumOptions(artist, name)),
    twice(() => deezerAlbumOptions(artist, name)),
  ]);
  const seen = new Set();
  return [...(mb || []), ...(dz || [])].filter(o => !seen.has(o.url) && seen.add(o.url));
}

async function musicBrainzAlbumOptions(artist, album) {
  const query = `releasegroup:"${album.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const data = await getJson('https://musicbrainz.org/ws/2/release-group?fmt=json&limit=15&query=' + encodeURIComponent(query), MB_HEADERS);
  const byArtist = (data['release-groups'] || []).filter(rg =>
    (rg['artist-credit'] || []).some(c => sameArtist(c.name, artist) || sameArtist(c.artist && c.artist.name, artist)));
  // Exact title first; then studio releases before compilations/live; albums, EPs, singles; earliest first.
  const rank = rg => (normalizeKey(baseTitle(rg.title)) === normalizeKey(album) ? 0 : 100) +
    ((rg['secondary-types'] || []).length ? 10 : 0) + ({ Album: 0, EP: 1, Single: 2 }[rg['primary-type']] ?? 5);
  const date = rg => rg['first-release-date'] || '9999';
  const groups = byArtist.sort((a, b) => rank(a) - rank(b) || date(a).localeCompare(date(b))).slice(0, 6);
  const urls = await Promise.all(groups.map(rg => coverArtUrl(rg.id).catch(() => null)));
  return groups.map((rg, i) => urls[i] && {
    url: urls[i], source: 'MusicBrainz', title: rg.title,
    detail: [rg['primary-type'], ...(rg['secondary-types'] || []), (rg['first-release-date'] || '').slice(0, 4)].filter(Boolean).join(' · '),
  }).filter(Boolean);
}

async function deezerAlbumOptions(artist, album) {
  const data = await getJson('https://api.deezer.com/search/album?limit=15&q=' + encodeURIComponent(artist + ' ' + album));
  const all = (data.data || []).filter(d => d.cover_xl);
  // Prefer the right artist; if Deezer spells them differently, still offer what it found.
  const mine = all.filter(d => d.artist && sameArtist(d.artist.name, artist));
  return (mine.length ? mine : all).slice(0, 6).map(d => ({
    url: d.cover_xl, source: 'Deezer', title: d.title, detail: [d.record_type, d.artist && d.artist.name].filter(Boolean).join(' · '),
  }));
}

// Candidate artist photos for the calculator's photo picker: Deezer artists with
// that name, most followed first (no placeholder images). Returns [{ url, source, title, detail }].
export async function artistPhotoOptions(artist) {
  const data = await twice(() => getJson('https://api.deezer.com/search/artist?limit=15&q=' + encodeURIComponent(artist)));
  const all = ((data && data.data) || []).filter(d => d.picture_xl && !d.picture_xl.includes('/artist//'));
  const mine = all.filter(d => sameArtist(d.name, artist));
  return (mine.length ? mine : all).sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0)).slice(0, 8).map(d => ({
    url: d.picture_xl, source: 'Deezer', title: d.name, detail: (d.nb_fan || 0).toLocaleString('en-US') + ' fans',
  }));
}

// Lookups throw on a network error, timeout or "busy" answer (MusicBrainz allows
// about 1 request a second) and return null when there's simply no match.
// A failure gets one more try after a short pause; a "no match" doesn't.
async function twice(lookup) {
  for (let i = 0; i < 2; i++) {
    try { return await lookup(); } catch (e) {}
    if (i === 0) await new Promise(r => setTimeout(r, 1200));
  }
  return null;
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(url.split('/')[2] + ' ' + res.status);
  return res.json();
}

// "Above The Clouds (Album / Single Version)" -> "Above The Clouds".
// A title that is all brackets keeps its words: "(Fork and Knife)" -> "Fork and Knife".
const baseTitle = title => {
  const stripped = String(title).replace(/\s*[([][^)\]]*[)\]]/g, '').trim();
  return stripped || String(title).replace(/[()[\]]/g, '').trim();
};
const sameArtist = (credit, artist) => normalizeKey(credit) === normalizeKey(artist);

// 1. MusicBrainz knows each release's type (Album, EP, Single; Compilation, Live...)
// and date, so we can pick the original release and get its cover from the Cover Art Archive.
async function musicBrainzCover(artist, title) {
  const t = baseTitle(title);
  if (!normalizeKey(t)) return null;
  const query = `recording:"${t.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const data = await getJson('https://musicbrainz.org/ws/2/recording?fmt=json&limit=50&query=' + encodeURIComponent(query), MB_HEADERS);

  // Release groups (an album and all its editions) that contain this song by this artist.
  const groups = new Map();
  for (const rec of data.recordings || []) {
    if (normalizeKey(rec.title) !== normalizeKey(t)) continue;
    if (!(rec['artist-credit'] || []).some(c => sameArtist(c.name, artist) || sameArtist(c.artist && c.artist.name, artist))) continue;
    for (const rel of rec.releases || []) {
      const rg = rel['release-group'] || {};
      if (!rg.id) continue;
      // Skip "Various Artists" compilations and soundtracks that include the song.
      const credit = rel['artist-credit'];
      if (credit && credit.length && !credit.some(c => sameArtist(c.name, artist) || sameArtist(c.artist && c.artist.name, artist))) continue;
      const date = rel.date || '9999';
      const prev = groups.get(rg.id);
      if (!prev || date < prev.date) {
        groups.set(rg.id, { id: rg.id, title: rg.title || rel.title, type: rg['primary-type'], extra: rg['secondary-types'] || [], date });
      }
    }
  }
  // Studio albums first, then EPs, then singles; compilations/live/soundtracks last; earliest first.
  const rank = g => (g.extra.length ? 10 : 0) + ({ Album: 0, EP: 1, Single: 2 }[g.type] ?? 5);
  const sorted = [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));

  for (const g of sorted.slice(0, 5)) {
    const url = await coverArtUrl(g.id);
    if (url) return { cover: url, coverType: 'album', album: g.title };
  }
  return null;
}

// Cover Art Archive URL for a release group, or null if it has no front cover.
async function coverArtUrl(releaseGroupId) {
  const url = `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`;
  const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  return res.status >= 300 && res.status < 400 ? url : null;
}

// For pinned covers: find the release group by album title and artist.
async function musicBrainzAlbumCover(artist, album) {
  const query = `releasegroup:"${album.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const data = await getJson('https://musicbrainz.org/ws/2/release-group?fmt=json&limit=10&query=' + encodeURIComponent(query), MB_HEADERS);
  const matches = (data['release-groups'] || []).filter(rg =>
    normalizeKey(rg.title) === normalizeKey(album) &&
    (rg['artist-credit'] || []).some(c => sameArtist(c.name, artist) || sameArtist(c.artist && c.artist.name, artist)));
  for (const rg of matches.slice(0, 3)) {
    const url = await coverArtUrl(rg.id);
    if (url) return { cover: url, coverType: 'album', album: rg.title };
  }
  return null;
}

async function deezerAlbumCover(artist, album) {
  const data = await getJson('https://api.deezer.com/search/album?limit=10&q=' + encodeURIComponent(artist + ' ' + album));
  const hit = (data.data || []).find(d => d.artist && sameArtist(d.artist.name, artist) &&
    normalizeKey(baseTitle(d.title)) === normalizeKey(baseTitle(album)) && d.cover_xl);
  return hit ? { cover: hit.cover_xl, coverType: 'album', album: hit.title } : null;
}

// Names that usually mean a compilation or box set rather than the original album.
const COMPILATION = /\b(complete|greatest hits|best of|hits|collection|selection|box set|story|anthology|essential|singles|very best|gold|anthems)\b/i;

// 2. Deezer track search: the artist's own release with this song, originals before compilations.
async function deezerTrackCover(artist, title) {
  const t = normalizeKey(baseTitle(title));
  if (!t) return null;
  const data = await getJson('https://api.deezer.com/search?limit=25&q=' + encodeURIComponent(artist + ' ' + baseTitle(title)));
  // Exact title only ("Jesus Christ (2008 Remaster)" counts as "Jesus Christ").
  const sameTitle = d => normalizeKey(baseTitle(d.title)) === t;
  const score = d => (COMPILATION.test(d.album.title || '') ? 2 : 0) + (/\blive\b/i.test(d.album.title || '') ? 2 : 0);
  const best = (data.data || [])
    .filter(d => d.artist && sameArtist(d.artist.name, artist) && d.album && d.album.cover_xl && sameTitle(d))
    .sort((x, y) => score(x) - score(y))[0];
  return best ? { cover: best.album.cover_xl, coverType: 'album', album: best.album.title } : null;
}

// 4. Deezer artist photo.
async function deezerArtistPhoto(artist) {
  const data = await getJson('https://api.deezer.com/search/artist?limit=10&q=' + encodeURIComponent(artist));
  // Several artists can share a name ("Brand New" vs "brandnew"): take the most followed.
  // Deezer's placeholder for artists without a photo has an empty id: ".../artist//..."
  const hit = (data.data || [])
    .filter(d => sameArtist(d.name, artist) && d.picture_xl && !d.picture_xl.includes('/artist//'))
    .sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0))[0];
  return hit ? { cover: hit.picture_xl, coverType: 'artist', album: null } : null;
}
