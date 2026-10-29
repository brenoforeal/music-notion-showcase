// HTML for the song pages: Song of the Day, song history, song admin.
import { escHtml, fmtDate } from './html.js';
import { publicPageWrap, coverHtml, shortDate } from './lyric-pages.js';

// Rating colours, like my Notion legend (10 red, 9–10 orange, 8–9 yellow…).
function ratingColor(r) {
  if (r >= 10) return '#ff6b6b';
  if (r >= 9) return '#fb923c';
  if (r >= 8) return '#facc15';
  if (r >= 7) return '#4ade80';
  if (r >= 6) return '#60a5fa';
  return '#c084fc';
}
function ratingHtml(p) {
  if (typeof p.rating !== 'number') return '';
  const tier = p.tier === 'atc' ? '<span class="tier atc" title="Above The Clouds">10*</span>'
    : p.tier === 'special' ? '<span class="tier special" title="Special song">10**</span>' : '';
  return '<span class="rating" style="color:' + ratingColor(p.rating) + ';border-color:' + ratingColor(p.rating) + '55">'
    + escHtml(String(p.rating)) + '</span>' + tier;
}

// The note's blocks (already reduced to text by song-pool.js), escaped here.
function noteHtml(note) {
  const span = s => {
    let h = escHtml(s.text).replace(/\n/g, '<br>');
    if (s.code) h = '<code>' + h + '</code>';
    if (s.b) h = '<b>' + h + '</b>';
    if (s.i) h = '<i>' + h + '</i>';
    if (s.u) h = '<u>' + h + '</u>';
    if (s.s) h = '<s>' + h + '</s>';
    if (s.href) h = '<a href="' + escHtml(s.href) + '" target="_blank" rel="noopener">' + h + '</a>';
    return h;
  };
  const tags = { p: 'p', li: 'li', quote: 'blockquote', h: 'h4' };
  let html = '', inList = false;
  for (const b of note) {
    if (b.type === 'li' && !inList) { html += '<ul>'; inList = true; }
    if (b.type !== 'li' && inList) { html += '</ul>'; inList = false; }
    html += '<' + tags[b.type] + '>' + b.spans.map(span).join('') + '</' + tags[b.type] + '>';
  }
  return html + (inList ? '</ul>' : '');
}

// Extra styles on top of the Lyric of the Day page look (publicPageWrap): rating, tiers, note.
const SONG_STYLE = `<style>
  .rating{display:inline-block;font-weight:700;font-size:12px;line-height:18px;border:1px solid;border-radius:6px;padding:0 6px}
  .tier{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 5px;margin-left:6px;vertical-align:middle}
  .tier.atc{background:#3b3b3b;color:#d29a5f}
  .tier.special{background:#f2d36b;color:#2a2205}
  .song-rating{margin-top:6px}
  details.note{border-top:1px solid var(--soft);padding-top:10px}
  details.note > summary{cursor:pointer;font-size:12px;color:var(--accent);list-style:none;user-select:none;width:max-content}
  details.note > summary::-webkit-details-marker{display:none}
  details.note > summary::before{content:'▸';display:inline-block;margin-right:6px;transition:transform .15s}
  details.note[open] > summary::before{transform:rotate(90deg)}
  details.note > summary .hide,details.note[open] > summary .show{display:none}
  details.note[open] > summary .hide{display:inline}
  .note-body{font-size:14px;line-height:1.65;margin-top:8px;overflow-wrap:anywhere}
  .note-body p,.note-body ul,.note-body blockquote,.note-body h4{margin:0 0 8px}
  .note-body > :last-child{margin-bottom:0}
  .note-body ul{padding-left:18px}
  .note-body blockquote{border-left:2px solid var(--line);padding-left:12px;color:#c9d1dd}
  .note-body h4{font-size:14px}
  .note-body code{font-size:12px;background:var(--soft);border-radius:4px;padding:0 4px}
  .entry .note-body{margin:2px 0 12px 52px;font-size:13px}
  .h-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
  .foot .links{display:flex;gap:14px}
  .note-close{display:block;margin:10px 0 0;padding:0;background:none;border:0;cursor:pointer;
    font:inherit;font-size:12px;color:var(--accent)}
  .note-close::before{content:'▴';margin-right:6px}
  .entry .note-close{margin-top:6px}
</style>`;

// A second "Hide note" at the end of a long note: closes its toggle and scrolls back
// up to it, so on a phone (or the small Notion embed) you land where the note began.
const CLOSE_BUTTON = `<button type="button" class="note-close"
  onclick="const d=this.closest('details');d.open=false;d.scrollIntoView({block:'nearest'})">Hide note</button>`;

// "Paul Weller — Paul Weller": artist, then the album/EP the song is from.
const metaText = p => (p.artist || '') + (p.release ? ' — ' + p.release : '');
// The cover helper reads item.album for its alt text.
const coverItem = p => ({ cover: p.cover, album: p.release, title: p.title, artist: p.artist });
const hasNote = p => Array.isArray(p.note) && p.note.length > 0;

export function renderSongPage(rawData) {
  let pick = null;
  try { pick = JSON.parse(rawData || 'null'); } catch (e) {}
  if (!pick || !pick.title) {
    return publicPageWrap('Song of the Day', '<div class="card empty">Today\'s song isn\'t ready yet. Check back soon.</div>', '');
  }

  // The note starts closed: some are long.
  const note = hasNote(pick)
    ? `<details class="note"><summary><span class="show">Show note</span><span class="hide">Hide note</span></summary>
         <div class="note-body">${noteHtml(pick.note)}${CLOSE_BUTTON}</div></details>`
    : '';
  const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(pick.artist + ' ' + pick.title);

  return publicPageWrap('Song of the Day', SONG_STYLE + `
  <div class="card">
    <div class="song">
      ${coverHtml(coverItem(pick), 64)}
      <div class="song-text">
        <div class="title">${escHtml(pick.title)}</div>
        <div class="meta">${escHtml(metaText(pick))}</div>
        <div class="song-rating">${ratingHtml(pick)}</div>
      </div>
    </div>
    ${note}
    <div class="foot">
      <span>${escHtml(shortDate(pick.updatedAt))}</span>
      <span class="links">
        <a href="${escHtml(yt)}" target="_blank" rel="noopener">YouTube ↗</a>
        <a href="/history">History</a>
      </span>
    </div>
  </div>`, '');
}

const PUBLIC_HISTORY = 100;

export function renderHistoryPage(rawData) {
  let history = [];
  try { history = JSON.parse(rawData || '[]'); } catch (e) {}
  if (!Array.isArray(history)) history = [];
  if (!history.length) {
    return publicPageWrap('Song history', '<div class="card empty">No songs picked yet.</div>', '');
  }

  // Like the lyric history: a row per day; rows with a note open to show it.
  const entries = history.slice(0, PUBLIC_HISTORY).map(h => {
    const head = `
      ${coverHtml(coverItem(h), 40, true)}
      <span class="h-text">
        <span class="h-title">${escHtml(h.title || '')}</span>
        <span class="h-meta">${escHtml(metaText(h))}</span>
      </span>
      <span class="h-side">
        <span class="h-date">${escHtml(shortDate(h.date))}</span>
        ${ratingHtml(h)}
      </span>`;
    return hasNote(h)
      ? `<details class="entry"><summary>${head}</summary><div class="note-body">${noteHtml(h.note)}${CLOSE_BUTTON}</div></details>`
      : `<div class="entry"><div class="row">${head}</div></div>`;
  }).join('');

  return publicPageWrap('Song history', SONG_STYLE + `
  <div class="card">
    <div class="top"><a href="/song">← Today</a><span class="muted">Last ${PUBLIC_HISTORY} songs · click one for its note</span></div>
    <div class="list">${entries}</div>
  </div>`, '');
}

export function renderSongAdminPage(todayRaw, historyRaw, prevRaw, stats) {
  let today = null;
  try { today = JSON.parse(todayRaw || 'null'); } catch (e) {}

  let prev = null;
  try { prev = JSON.parse(prevRaw || 'null'); } catch (e) {}

  let history = [];
  try { history = JSON.parse(historyRaw || '[]'); } catch (e) {}
  if (!Array.isArray(history)) history = [];

  const noteState = p => p.note && p.note.length ? 'note: ' + p.note.length + ' block(s)'
    : p.noteError ? 'note not read: ' + escHtml(p.noteError) : 'no note';
  const todayHtml = today
    ? `<div class="today">
         <div class="today-title">${escHtml(today.title)}</div>
         <div class="today-artist">${escHtml(today.artist)}${today.release ? ' — ' + escHtml(today.release) : ''}${today.manual ? ' · manual' : ''}</div>
         <div class="today-meta">${ratingHtml(today)} · ${noteState(today)}</div>
       </div>`
    : '<div class="muted">No song picked yet.</div>';

  const prevHtml = prev
    ? `<div class="today" style="background:#1c150f;border-color:#4a3416">
         <div class="today-title">${escHtml(prev.title)}</div>
         <div class="today-artist">${escHtml(prev.artist)}</div>
       </div>`
    : '<div class="muted">Nothing in the undo slot.</div>';

  const historyHtml = history.length
    ? history.slice(0, 40).map(h =>
        '<div class="h-entry">' +
          escHtml(h.artist) + ' — ' + escHtml(h.title) + ' ' + ratingHtml(h) +
          ' <span class="date">(' + escHtml(fmtDate(h.date)) + ')</span>' +
        '</div>'
      ).join('')
    : '<div class="muted">No history yet.</div>';

  const tokenWarn = stats.hasToken ? ''
    : `<div class="muted" style="color:var(--warn)">The NOTION_TOKEN secret isn't set: songs are picked, but notes can't be read.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Song Admin</title>
${SONG_STYLE}
<style>
  .history-summary{
    cursor:pointer;list-style:none;
    padding:6px 0;font-size:12px;
    display:flex;justify-content:space-between;align-items:center;
  }
  .history-summary::-webkit-details-marker{display:none}
  .history-summary::after{
    content:'▸';color:var(--muted);margin-left:8px;transition:transform .15s;
  }
  details[open] .history-summary::after{transform:rotate(90deg)}
  :root{--bg:#0f1115;--card:#171a21;--line:#2a2f3a;--txt:#e8ecf3;--muted:#8b95a7;--accent:#6ea8fe;--good:#4ade80;--bad:#ff6b6b;--warn:#fbbf24}
  *{box-sizing:border-box}
  body{margin:0;padding:20px 14px 60px;background:var(--bg);color:var(--txt);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:820px;margin:0 auto;display:grid;gap:14px}
  h1{font-size:18px;margin:0 0 4px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 10px;font-weight:600}
  .muted{color:var(--muted);font-size:12px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:10px}
  textarea{width:100%;min-height:120px;background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:10px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none;resize:vertical}
  textarea:focus{border-color:var(--accent)}
  input{width:100%;background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:8px 10px;font:inherit;outline:none}
  input:focus{border-color:var(--accent)}
  button{background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:8px 14px;font:inherit;font-size:12px;cursor:pointer}
  button:hover{border-color:var(--accent)}
  button.primary{background:var(--accent);color:#08111f;border-color:transparent;font-weight:650}
  button.warn{border-color:#4a3416;color:var(--warn)}
  button.warn:hover{border-color:var(--warn)}
  button.danger:hover{border-color:var(--bad);color:var(--bad)}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  #status{font-size:12px;color:var(--muted)}
  #status.ok{color:var(--good)}
  #status.err{color:var(--bad)}
  .today{background:#0f1c2b;border:1px solid #1d3a55;border-radius:8px;padding:12px}
  .today-title{font-size:15px;font-weight:700}
  .today-artist{font-size:12px;color:var(--muted);margin-top:2px}
  .today-meta{font-size:11px;color:var(--muted);margin-top:6px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media(max-width:600px){.grid2{grid-template-columns:1fr}}
  .h-entry{font-size:13px;padding:5px 0;border-bottom:1px solid #20242e}
  .h-entry:last-child{border-bottom:none}
  .h-entry .date{color:var(--muted);font-size:11px}
</style>
</head>
<body>
<div class="wrap">
  <div>
    <h1>Song of the Day — Admin</h1>
    <div class="muted">Picks one of my songs rated 9+ that have a note, from the published ranking:
      ${stats.pool} songs in the pool, ${stats.left} not picked yet (it starts over once all have been).</div>
    ${tokenWarn}
    <div id="status"></div>
  </div>

  <div class="card">
    <h2>Today's pick</h2>
    ${todayHtml}
    <div class="row">
      <button id="reroll" class="primary">Re-roll</button>
    </div>
  </div>

  <div class="card">
    <h2>Undo slot</h2>
    <div class="muted">The previous pick is saved here automatically before every re-roll or manual set.</div>
    ${prevHtml}
    <div class="row">
      <button id="undo" class="warn">Restore this pick</button>
    </div>
  </div>

  <div class="card">
    <h2>Manual override</h2>
    <div class="muted">Any song in the ranking, by exact artist and title. Records it to history; change the date to backfill.</div>
    <div class="grid2">
      <input id="mArtist" placeholder="Artist">
      <input id="mTitle" placeholder="Title">
    </div>
    <div class="grid2">
      <input id="mDate" type="date">
    </div>
    <div class="row">
      <button id="manualSet">Set as today's song</button>
    </div>
  </div>

  <div class="card">
    <h2>History</h2>
    <div class="muted">Last 40 picks. Public view at <code>/history</code>.</div>
    <div class="history">${historyHtml}</div>
    <div class="row">
      <button id="clearHistory" class="danger">Clear history</button>
    </div>
  </div>
</div>
<script>
const $ = id => document.getElementById(id);

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)  // login cookie is sent automatically
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

$('reroll').addEventListener('click', async () => {
  const s = $('status');
  s.textContent = 'Re-rolling…'; s.className = '';
  try {
    const data = await post('/song-admin/reroll', {});
    s.textContent = 'New pick: ' + data.pick.artist + ' — ' + data.pick.title;
    s.className = 'ok';
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});

$('undo').addEventListener('click', async () => {
  const s = $('status');
  s.textContent = 'Restoring…'; s.className = '';
  try {
    const data = await post('/song-admin/undo', {});
    s.textContent = 'Restored: ' + data.pick.artist + ' — ' + data.pick.title;
    s.className = 'ok';
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});

$('manualSet').addEventListener('click', async () => {
  const s = $('status');
  const artist = $('mArtist').value.trim();
  const title = $('mTitle').value.trim();
  const date = $('mDate').value.trim();
  if (!artist || !title) { s.textContent = 'Artist and title required'; s.className = 'err'; return; }
  s.textContent = 'Saving…'; s.className = '';
  try {
    await post('/song-admin/set', { artist, title, date });
    s.textContent = 'Saved'; s.className = 'ok';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});

$('clearHistory').addEventListener('click', async () => {
  if (!confirm('Clear the entire history? The cycle will reset.')) return;
  const s = $('status');
  s.textContent = 'Clearing…'; s.className = '';
  try {
    await post('/song-admin/clear-history', {});
    s.textContent = 'History cleared'; s.className = 'ok';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});
</script>
</body>
</html>`;
}
