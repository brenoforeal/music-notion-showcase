// HTML for the lyric pages: Lyric of the Day, lyric history, lyric admin.
import { escHtml } from './html.js';
import { halloween } from './halloween.js';
import { PUBLIC_HISTORY_PER_GROUP, ADMIN_HISTORY_PER_GROUP, groupsToText } from './lyrics.js';

// ═══════════════════════════════════════════════════════
// PUBLIC PAGES: Lyric of the Day + history (design B: one group at a time, tabs)
// ═══════════════════════════════════════════════════════
// Both pages render every group's panel; only the active one is shown.
// The first group is active without JavaScript; with it, the tab is
// remembered and ?group=<id> (or #<id> on history) picks one.

// Pick dates are stored as UTC days ("2026-10-15"), the same as history uses.
export function shortDate(value) {
  const day = String(value || '').slice(0, 10);
  const d = new Date(day + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Album covers are square; artist photos are round. Letter placeholder when there's no image.
// lazy: only for long lists (history); today's few covers load right away so tab switches are instant.
export function coverHtml(item, size, lazy) {
  // https:// covers from iTunes/Deezer, or your own photos served by this worker (/artist-photo/...)
  const url = item && typeof item.cover === 'string' && /^(https:\/\/|\/artist-photo\/)/.test(item.cover) ? item.cover : '';
  const round = item && item.coverType === 'artist' ? ' round' : '';
  const alt = item && item.album ? item.album : (item && item.artist) || '';
  if (url) {
    return `<img class="cover${round}" src="${escHtml(url)}" alt="${escHtml(alt)}" width="${size}" height="${size}"` +
      `${lazy ? ' loading="lazy"' : ''} referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`;
  }
  const letter = ((item && (item.title || item.artist)) || '?').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '?';
  return `<div class="cover ph" style="width:${size}px;height:${size}px" aria-hidden="true">${escHtml(letter)}</div>`;
}

// One row of tabs: swipe on touch screens; on a computer the arrows appear when
// more tabs are hidden in that direction.
function tabsHtml(groups, activeId) {
  if (groups.length < 2) return '';
  return '<div class="tabs-wrap">' +
    '<button type="button" class="tabs-arrow" data-dir="-1" aria-label="Previous groups" hidden>‹</button>' +
    '<div class="tabs" role="tablist">' + groups.map(g =>
      `<button type="button" role="tab" class="tab" data-tab="${escHtml(g.id)}" aria-selected="${g.id === activeId}">${escHtml(g.label)}</button>`
    ).join('') + '</div>' +
    '<button type="button" class="tabs-arrow" data-dir="1" aria-label="More groups" hidden>›</button>' +
  '</div>';
}

function linesHtml(lines) {
  return (lines || []).filter(Boolean).map(escHtml).join('<br>');
}

// order: group ids in the order of the Lyric admin groups list (tabs follow it).
export function renderLyricPage(rawData, order = []) {
  let data = null;
  try { data = JSON.parse(rawData || 'null'); } catch (e) {}
  const rank = id => (order.indexOf(id) === -1 ? order.length : order.indexOf(id));
  const groups = data && data.groups
    ? Object.entries(data.groups)
        .filter(([, g]) => g && Array.isArray(g.lines) && g.lines.some(Boolean))
        .map(([id, g]) => ({ id, ...g }))
        .sort((a, b) => rank(a.id) - rank(b.id))
    : [];

  if (!groups.length) {
    return publicPageWrap('Lyric of the Day', '<div class="card empty">Today\'s lyrics aren\'t ready yet. Check back soon.</div>', '');
  }

  const day = shortDate(data.updatedAt);
  const panels = groups.map((g, i) => `
  <section class="panel" data-panel="${escHtml(g.id)}" role="tabpanel"${i ? ' hidden' : ''}>
    <div class="song">
      ${coverHtml(g, 64)}
      <div class="song-text">
        <div class="title">${escHtml(g.title || '')}</div>
        <div class="meta">${escHtml(g.artist || '')}${g.album ? ' · ' + escHtml(g.album) : ''}</div>
      </div>
    </div>
    ${g.section ? `<div class="section">${escHtml(g.section)}</div>` : ''}
    <blockquote class="lyric">${linesHtml(g.lines)}</blockquote>
    <div class="foot">
      <span>${escHtml(day)}</span>
      <a href="/lyric-history#${encodeURIComponent(g.id)}">History</a>
    </div>
  </section>`).join('');

  return publicPageWrap('Lyric of the Day',
    `<div class="card">${tabsHtml(groups, groups[0].id)}${panels}</div>`,
    'query');
}

export function renderLyricHistoryPage(groups, rawData) {
  let hist = {};
  try { hist = JSON.parse(rawData || '{}'); } catch (e) {}
  if (!hist || typeof hist !== 'object' || Array.isArray(hist)) hist = {};

  const withHistory = groups.filter(g => (hist[g.id] || []).length);
  if (!withHistory.length) {
    return publicPageWrap('Lyric history', '<div class="card empty">No lyrics picked yet.</div>', '');
  }

  const panels = withHistory.map((g, i) => {
    const entries = hist[g.id].slice(0, PUBLIC_HISTORY_PER_GROUP).map(h => {
      const lines = Array.isArray(h.lines) ? h.lines.filter(Boolean) : [];
      const head = `
        ${coverHtml(h, 40, true)}
        <span class="h-text">
          <span class="h-title">${escHtml(h.title || '')}</span>
          <span class="h-meta">${escHtml(h.artist || '')}${h.section ? ' · ' + escHtml(h.section) : ''}</span>
        </span>
        <span class="h-date">${escHtml(shortDate(h.date))}</span>`;
      return lines.length
        ? `<details class="entry"><summary>${head}</summary><blockquote class="lyric small">${linesHtml(lines)}</blockquote></details>`
        : `<div class="entry"><div class="row">${head}</div></div>`;
    }).join('');
    return `
  <section class="panel" data-panel="${escHtml(g.id)}" role="tabpanel"${i ? ' hidden' : ''}>
    <div class="list">${entries}</div>
  </section>`;
  }).join('');

  return publicPageWrap('Lyric history',
    `<div class="card">
      <div class="top"><a href="/lyric-of-the-day">← Today</a><span class="muted">Last ${PUBLIC_HISTORY_PER_GROUP} per group</span></div>
      ${tabsHtml(withHistory, withHistory[0].id)}${panels}
    </div>`,
    'hash');
}

// pick: how the starting tab is chosen ('query' = ?group=, 'hash' = #id, '' = no tabs).
export function publicPageWrap(pageTitle, inner, pick) {
  const hw = halloween('public');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1115">
<title>${escHtml(pageTitle)}</title>
<style>
  :root{--bg:#0f1115;--card:#171a21;--line:#2a2f3a;--soft:#20242e;--txt:#e8ecf3;--muted:#8b95a7;--accent:#6ea8fe}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--bg)}
  body{color:var(--txt);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:12px}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
  .card{max-width:560px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
  .empty{color:var(--muted);text-align:center;padding:28px 18px}
  .muted{color:var(--muted);font-size:12px}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-size:13px}
  .tabs-wrap{display:flex;align-items:center;gap:6px;margin-bottom:16px}
  .tabs{position:relative;flex:1;min-width:0;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;scroll-behavior:smooth;padding:2px}
  .tabs::-webkit-scrollbar{display:none}
  .tabs-arrow{flex:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font:inherit;font-size:16px;line-height:1;
    background:transparent;color:var(--txt);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;padding:0 0 2px}
  .tabs-arrow:hover{border-color:#3a4150;background:var(--soft)}
  .tabs-arrow[hidden]{display:none}
  @media (hover:none){.tabs-arrow{display:none!important}}
  .tab{flex:none;font:inherit;font-size:12px;padding:5px 11px;border-radius:999px;cursor:pointer;
    background:transparent;color:var(--muted);border:1px solid var(--line);white-space:nowrap}
  .tab:hover{color:var(--txt);border-color:#3a4150}
  .tab[aria-selected="true"]{background:var(--txt);color:var(--bg);border-color:var(--txt)}
  .tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .cover{flex:none;display:block;object-fit:cover;border-radius:8px;background:var(--soft);border:1px solid var(--line)}
  .cover.round{border-radius:50%}
  .cover.ph{display:flex;align-items:center;justify-content:center;color:var(--muted);font-weight:600}
  .song{display:flex;gap:12px;align-items:center;margin-bottom:16px}
  .song-text{min-width:0}
  .title{font-size:16px;font-weight:600;line-height:1.3}
  .meta{font-size:12px;color:var(--muted);margin-top:2px}
  .section{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin-bottom:8px}
  .lyric{margin:0;padding-left:14px;border-left:2px solid var(--line);
    font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:19px;line-height:1.65}
  .lyric.small{font-size:15px;margin:4px 0 10px 52px}
  .foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:12px;color:var(--muted)}
  .list{display:block}
  .entry{border-bottom:1px solid var(--soft);min-width:0}
  .entry:last-child{border-bottom:none}
  .entry summary,.entry .row{display:flex;gap:12px;align-items:center;padding:8px 0;list-style:none}
  .entry summary{cursor:pointer}
  .entry summary::-webkit-details-marker{display:none}
  .entry summary:hover .h-title{color:var(--accent)}
  .h-text{flex:1;min-width:0;display:flex;flex-direction:column}
  /* Long titles wrap to two lines, then end with "…" */
  .h-title{font-size:14px;line-height:1.35;overflow:hidden;overflow-wrap:anywhere;
    display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .h-meta{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .h-date{flex:none;font-size:12px;color:var(--muted);padding-left:4px}
  .lyric{overflow-wrap:anywhere}
  @media(max-width:420px){
    body{padding:8px}
    .card{padding:14px}
    .lyric{font-size:17px}
  }
</style>
${hw.style}
</head>
<body>
${hw.decor}
${inner}
${pick ? `<script>
(() => {
  const tabs = [...document.querySelectorAll('.tab')];
  const panels = [...document.querySelectorAll('.panel')];
  if (!panels.length) return;
  const KEY = 'lyricTab';
  const row = document.querySelector('.tabs');
  const arrows = [...document.querySelectorAll('.tabs-arrow')];
  // Show an arrow only when there are hidden tabs in its direction.
  const updateArrows = () => {
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    arrows.forEach(a => { a.hidden = a.dataset.dir === '-1' ? row.scrollLeft <= 2 : row.scrollLeft >= max - 2; });
  };
  arrows.forEach(a => a.addEventListener('click', () => {
    row.scrollBy({ left: Number(a.dataset.dir) * row.clientWidth * 0.7 });
    setTimeout(updateArrows, 400); // after the smooth scroll, in case no scroll event arrives
  }));
  if (row) { row.addEventListener('scroll', updateArrows, { passive: true }); addEventListener('resize', updateArrows); }
  const show = id => {
    if (!panels.some(p => p.dataset.panel === id)) return false;
    panels.forEach(p => { p.hidden = p.dataset.panel !== id; });
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    // Bring the chosen tab into view inside the row (without scrolling the page).
    const tab = tabs.find(t => t.dataset.tab === id);
    if (row && tab) {
      const left = tab.offsetLeft; // relative to the row (.tabs is position:relative)
      if (left < row.scrollLeft || left + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - 8;
      setTimeout(updateArrows, 400);
    }
    try { localStorage.setItem(KEY, id); } catch (e) {}
    return true;
  };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  const wanted = ${pick === 'query' ? "new URLSearchParams(location.search).get('group')" : "decodeURIComponent(location.hash.slice(1))"};
  if (!(wanted && show(wanted)) && saved) show(saved);
  updateArrows();
  tabs.forEach(t => t.addEventListener('click', () => {
    show(t.dataset.tab);
    ${pick === 'hash' ? "history.replaceState(null, '', '#' + encodeURIComponent(t.dataset.tab));" : ''}
  }));
})();
</script>` : ''}
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
// LYRIC ADMIN PAGE
// ═══════════════════════════════════════════════════════

export function renderLyricAdminPage(groups, rawData, histRaw, prevRaw) {
  let data = {};
  try { data = JSON.parse(rawData || '{}'); } catch (e) {}
  const current = data.groups || {};

  let hist = {};
  try { hist = JSON.parse(histRaw || '{}'); } catch (e) {}
  if (!hist || typeof hist !== 'object') hist = {};

  let prev = {};
  try { prev = JSON.parse(prevRaw || '{}'); } catch (e) {}
  if (!prev || typeof prev !== 'object') prev = {};

  const today = new Date().toISOString().slice(0, 10);

  const groupsHtml = groups.map(g => {
    const c = current[g.id] || {};
    const lines = Array.isArray(c.lines) ? c.lines : [];
    const prevGroup = prev[g.id];

    const histArr = (hist[g.id] || []).slice(0, ADMIN_HISTORY_PER_GROUP);
    const histHtml = histArr.length
      ? histArr.map(h => {
          const lines = Array.isArray(h.lines) ? h.lines.filter(Boolean) : [];
          const linesHtml = lines.length
            ? '<div class="h-lines">' +
                lines.map(l => '<div class="h-line">' + escHtml(l) + '</div>').join('') +
              '</div>'
            : '';
          return `
          <div class="hist-block" data-group="${escHtml(g.id)}" data-date="${escHtml(h.date)}" data-lines="${escHtml(JSON.stringify(lines))}">
            <div class="hist-row">
              <input class="h-date" type="date" value="${escHtml(h.date)}">
              <input class="h-artist" value="${escHtml(h.artist)}" placeholder="Artist">
              <input class="h-title" value="${escHtml(h.title)}" placeholder="Title">
              <button type="button" class="hist-save">Save</button>
              <button type="button" class="hist-delete danger">×</button>
            </div>
            ${linesHtml}
          </div>
        `;
        }).join('')
      : '<div class="muted">No history yet.</div>';

    return `
      <div class="group" data-group="${escHtml(g.id)}" data-label="${escHtml(g.label)}">
        <div class="group-head">
          <strong>${escHtml(g.label)}</strong>
          <div class="group-head-actions">
            <button type="button" class="reroll" data-group="${escHtml(g.id)}">Re-roll</button>
            ${prevGroup ? '<button type="button" class="undo warn" data-group="' + escHtml(g.id) + '">Undo</button>' : ''}
          </div>
        </div>
        <div class="source-line">Source: <span class="src">${escHtml(c.artist || '—')} — ${escHtml(c.title || '')}</span><span class="sec">${c.section ? ' · ' + escHtml(c.section) : ''}</span></div>
        <textarea class="lines" rows="6" placeholder="One line per row (up to 8)">${escHtml(lines.join('\n'))}</textarea>
        <div class="date-row">
          <label>Save to date:</label>
          <input class="save-date" type="date" value="${escHtml(today)}">
        </div>
        ${prevGroup ? '<div class="prev-note muted">Undo slot: ' + escHtml(prevGroup.artist) + ' — ' + escHtml(prevGroup.title) + '</div>' : ''}

               <div class="history-block">
          <details>
            <summary class="history-summary">
              <span class="muted">History (last ${ADMIN_HISTORY_PER_GROUP})</span>
            </summary>
            <div style="margin-top:8px">
              <div class="history-header">
                <span></span>
                <button type="button" class="add-entry">+ Add entry</button>
              </div>
              <div class="hist-list">${histHtml}</div>
                       <div class="add-form" style="display:none">
            <div class="hist-row">
              <input class="a-date" type="date" value="${escHtml(today)}">
              <input class="a-artist" placeholder="Artist">
              <input class="a-title" placeholder="Title">
              <button type="button" class="add-confirm primary">Add</button>
              <button type="button" class="add-cancel">Cancel</button>
            </div>
          </div>
            </div>
          </details>
        </div>
      </div>
    `;
  }).join('');

  const groupsText = groupsToText(groups);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lyric Admin</title>
<style>
  :root{--bg:#0f1115;--card:#171a21;--line:#2a2f3a;--txt:#e8ecf3;--muted:#8b95a7;--accent:#6ea8fe;--good:#4ade80;--bad:#ff6b6b;--warn:#fbbf24}
  *{box-sizing:border-box}
  body{margin:0;padding:20px 14px 60px;background:var(--bg);color:var(--txt);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:900px;margin:0 auto;display:grid;gap:14px}
  h1{font-size:18px;margin:0 0 4px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 10px;font-weight:600}
  .muted{color:var(--muted);font-size:12px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:10px}
  .group{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:8px}
  .group-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .group-head strong{font-size:14px}
  .group-head-actions{display:flex;gap:6px}
  .source-line{font-size:11px;color:var(--muted)}
  .prev-note{font-size:11px;color:var(--warn)}
  input{width:100%;background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:8px 10px;font:inherit;outline:none}
  input:focus{border-color:var(--accent)}
  textarea{width:100%;min-height:280px;background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:10px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none;resize:vertical}
  textarea:focus{border-color:var(--accent)}
  textarea.lines{min-height:130px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  button{background:#1e222b;border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:7px 12px;font:inherit;font-size:12px;cursor:pointer}
  button:hover{border-color:var(--accent)}
  button.primary{background:var(--accent);color:#08111f;border-color:transparent;font-weight:650}
  button.warn{border-color:#4a3416;color:var(--warn)}
  button.warn:hover{border-color:var(--warn)}
  button.danger:hover{border-color:var(--bad);color:var(--bad)}
  .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  #status{font-size:12px;color:var(--muted);min-height:16px}
  #status.ok{color:var(--good)}
  #status.err{color:var(--bad)}
  .date-row{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--muted)}
  .date-row label{white-space:nowrap}
  .date-row input{max-width:170px}
  .history-block{border-top:1px solid var(--line);padding-top:10px;margin-top:6px}
  .history-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .hist-list{display:grid;gap:6px}
  .hist-row{display:grid;grid-template-columns:140px 1fr 1fr auto auto;gap:6px;align-items:center}
  .hist-row input{font-size:12px;padding:6px 8px}
  .hist-row button{padding:6px 9px;font-size:11px}
  .add-form{margin-top:8px}
  @media(max-width:700px){
    .hist-row{grid-template-columns:1fr 1fr;grid-auto-rows:auto}
      .hist-block{display:grid;gap:4px}
  .h-lines{margin-left:8px;padding-left:8px;border-left:2px solid #2a2f3a}
  .h-line{font-size:10px;color:var(--muted);font-style:italic;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hist-row .h-date{grid-column:1 / -1}
  }
</style>
</head>
<body>
<div class="wrap">
  <div>
    <h1>Lyric Admin</h1>
    <div class="muted">Edit any group's lyrics, re-roll, manage history, or edit the group list. Daily picks are wiped by the 8 PM cron.</div>
  </div>

  <div id="groups">${groupsHtml}</div>

  <div class="card">
    <h2>Save all edits</h2>
    <div class="bar">
      <button class="primary" id="save">Save lyric changes</button>
      <button id="refreshCovers">Refresh covers</button>
      <span id="status"></span>
    </div>
  </div>

  <div class="card">
    <h2>Groups editor</h2>
    <div class="muted">
      One group per block. Start a group with <code># Label</code>, then list songs as <code>Artist | Title</code>.
      Adding a new group is safe — existing histories are preserved.
    </div>
    <textarea id="groupsText">${escHtml(groupsText)}</textarea>
    <div class="bar">
      <button class="primary" id="saveGroups">Save groups</button>
      <button class="danger" id="reseedGroups">Reseed from defaults (danger)</button>
      <span id="groupsStatus"></span>
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

document.querySelectorAll('.reroll').forEach(btn => {
  btn.addEventListener('click', async () => {
    const groupId = btn.dataset.group;
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = '...';
    try {
      const data = await post('/lyric-admin/reroll', { groupId });
      const el = document.querySelector('.group[data-group="' + groupId + '"]');
      el.querySelector('.src').textContent = data.group.artist + ' — ' + data.group.title;
      el.querySelector('.sec').textContent = data.group.section ? ' · ' + data.group.section : '';
      el.querySelector('.lines').value = (data.group.lines || []).join('\\n');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      alert('Re-roll failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
});

document.querySelectorAll('.undo').forEach(btn => {
  btn.addEventListener('click', async () => {
    const groupId = btn.dataset.group;
    btn.disabled = true;
    try {
      await post('/lyric-admin/undo', { groupId });
      location.reload();
    } catch (err) {
      alert('Undo failed: ' + err.message);
      btn.disabled = false;
    }
  });
});

$('save').addEventListener('click', async () => {
  const groups = {};
  document.querySelectorAll('.group').forEach(el => {
    const id = el.dataset.group;
    const label = el.dataset.label;
    const lines = el.querySelector('.lines').value.split('\\n').map(l => l.trim()).filter(Boolean);
    const src = el.querySelector('.src').textContent || '';
    const [artist, ...rest] = src.split(' — ');
    groups[id] = {
      label,
      header: 'Random ' + label + ' lyric of the day',
      artist: (artist || '').trim(),
      title: rest.join(' — ').trim(),
      lines,
    };
  });

  // Use date from first group's save-date (they all default to today)
  const firstDate = document.querySelector('.group .save-date');
  const date = firstDate ? firstDate.value : '';

  const status = $('status');
  status.textContent = 'Saving…';
  status.className = '';
  try {
    await post('/lyric-admin/save', { groups, date });
    status.textContent = 'Saved';
    status.className = 'ok';
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'err';
  }
});

$('refreshCovers').addEventListener('click', async () => {
  const status = $('status');
  status.textContent = 'Looking up covers…';
  status.className = '';
  try {
    const data = await post('/lyric-admin/refresh-covers', {});
    const found = Object.values(data.groups).map(g => g.title + ': ' + (g.album || (g.coverType === 'artist' ? 'artist photo' : 'none')));
    status.textContent = found.join(' · ');
    status.className = 'ok';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'err';
  }
});

$('saveGroups').addEventListener('click', async () => {
  const s = $('groupsStatus');
  s.textContent = 'Saving…'; s.className = '';
  try {
    const data = await post('/lyric-admin/groups/save', { text: $('groupsText').value });
    s.textContent = 'Saved ' + data.count + ' groups';
    s.className = 'ok';
    setTimeout(() => location.reload(), 700);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});

$('reseedGroups').addEventListener('click', async () => {
  if (!confirm('Reset groups to the built-in defaults? Any custom groups you added will be lost. Histories are preserved.')) return;
  const s = $('groupsStatus');
  s.textContent = 'Reseeding…'; s.className = '';
  try {
    const data = await post('/lyric-admin/groups/reseed', { confirm: 'yes-really-reseed' });
    s.textContent = 'Reseeded ' + data.count + ' groups';
    s.className = 'ok';
    setTimeout(() => location.reload(), 700);
  } catch (err) {
    s.textContent = 'Error: ' + err.message;
    s.className = 'err';
  }
});

// History: save / delete
document.addEventListener('click', async e => {
    const saveBtn = e.target.closest('.hist-save');
  if (saveBtn) {
    const block = saveBtn.closest('.hist-block');
    const groupId = block.dataset.group;
    const oldDate = block.dataset.date;
    const newDate = block.querySelector('.h-date').value;
    const artist = block.querySelector('.h-artist').value.trim();
    const title = block.querySelector('.h-title').value.trim();
    let lines = [];
    try { lines = JSON.parse(block.dataset.lines || '[]'); } catch (e) {}
    saveBtn.disabled = true;
    try {
      await post('/lyric-admin/history/edit', { groupId, oldDate, newDate, artist, title, lines });
      saveBtn.textContent = '✓';
      setTimeout(() => { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 800);
    } catch (err) {
      alert('Edit failed: ' + err.message);
      saveBtn.disabled = false;
    }
    return;
  }

    const delBtn = e.target.closest('.hist-delete');
  if (delBtn) {
    const row = delBtn.closest('.hist-block');
    const groupId = row.dataset.group;
    const date = row.dataset.date;
    if (!confirm('Delete this history entry?')) return;
    try {
      await post('/lyric-admin/history/delete', { groupId, date });
      row.remove();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
    return;
  }

  const addBtn = e.target.closest('.add-entry');
  if (addBtn) {
    const block = addBtn.closest('.history-block');
    block.querySelector('.add-form').style.display = '';
    addBtn.style.display = 'none';
    return;
  }

  const cancelBtn = e.target.closest('.add-cancel');
  if (cancelBtn) {
    const block = cancelBtn.closest('.history-block');
    block.querySelector('.add-form').style.display = 'none';
    block.querySelector('.add-entry').style.display = '';
    return;
  }

  const confirmAdd = e.target.closest('.add-confirm');
  if (confirmAdd) {
    const block = confirmAdd.closest('.history-block');
    const groupEl = confirmAdd.closest('.group');
    const groupId = groupEl.dataset.group;
    const date = block.querySelector('.a-date').value;
    const artist = block.querySelector('.a-artist').value.trim();
    const title = block.querySelector('.a-title').value.trim();
    if (!date || !artist || !title) { alert('Date, artist, and title required'); return; }
    confirmAdd.disabled = true;
    try {
      await post('/lyric-admin/history/add', { groupId, date, artist, title });
      location.reload();
    } catch (err) {
      alert('Add failed: ' + err.message);
      confirmAdd.disabled = false;
    }
  }
});
</script>
</body>
</html>`;
}
