// HTML for the /ranking page (tabs, filters and sorting run in the browser).
import { halloween } from './halloween.js';

// The Ratings System page (set in the calculator's Settings). A Notion link becomes a public
// site link; until one is published, this default is used.
const DEFAULT_RATINGS_PAGE = '876007e8bb6e826094a40113272361c2';
function ratingsPageLink(v) {
  const raw = String(v || DEFAULT_RATINGS_PAGE);
  const m = raw.split(/[?#]/)[0].replace(/-/g, '').match(/[0-9a-f]{32}$/i);
  if (m) return 'https://outrageous-tugboat-969.notion.site/' + m[0].toLowerCase();
  return /^https:\/\/[^\s"<>]+$/i.test(raw) ? raw : null;
}

export function renderRankingPage(rawData) {
  let albums = [];
  let others = [];
  let extras = [];
  let artistPhotos = {};
  let artistPages = {};
  let ratingsPage = null;
  let publishedAt = null;
  try {
    const parsed = JSON.parse(rawData || '{}');
    albums = Array.isArray(parsed.albums) ? parsed.albums : [];
    others = Array.isArray(parsed.others) ? parsed.others : [];
    extras = Array.isArray(parsed.extras) ? parsed.extras : [];
    if (parsed.artistPhotos && typeof parsed.artistPhotos === 'object') artistPhotos = parsed.artistPhotos;
    if (parsed.artistPages && typeof parsed.artistPages === 'object') artistPages = parsed.artistPages;
    if (typeof parsed.ratingsPage === 'string') ratingsPage = parsed.ratingsPage;
    publishedAt = parsed.publishedAt || null;
  } catch (e) {}
  const payload = JSON.stringify(albums);
  const payloadOthers = JSON.stringify(others);
  const payloadExtras = JSON.stringify(extras);
  const payloadPhotos = JSON.stringify(artistPhotos).replace(/</g, '\\u003c');
  const ratingsLink = ratingsPageLink(ratingsPage);
  const payloadPages = JSON.stringify(artistPages).replace(/</g, '\\u003c');
  const updated = publishedAt
    ? new Date(publishedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const hw = halloween('ranking');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1115">
<title>Album Ranking</title>
<style>
  :root{--bg:#0f1115;--card:#171a21;--card2:#1e222b;--line:#2a2f3a;--txt:#e8ecf3;--muted:#8b95a7;--accent:#6ea8fe;--good:#4ade80}
  *{box-sizing:border-box}
  body{margin:0;padding:18px 14px 40px;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
  .wrap{max-width:880px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px;letter-spacing:-.01em}
  .meta{color:var(--muted);font-size:12px;margin-bottom:14px}
  .meta.hint{margin:-10px 0 14px}
  .toptabs{display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .toptabs::-webkit-scrollbar{display:none}
  .toptab{flex:1 0 auto;white-space:nowrap;background:var(--card2);border:1px solid var(--line);color:var(--muted);border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.02em;transition:all .15s}
  .toptab:hover{border-color:var(--accent)}
  .toptab.active{background:var(--accent);color:#08111f;border-color:transparent}
  .artist-sections{
    display:flex;margin:0 0 12px;
    background:var(--card);
    border:1px solid var(--line);
    border-radius:10px;
    overflow:hidden;
  }
  .artist-section{
    flex:1;background:transparent;border:none;border-right:1px solid var(--line);
    color:var(--muted);padding:10px 12px;font:inherit;font-size:12px;font-weight:650;
    cursor:pointer;letter-spacing:.02em;transition:background .15s,color .15s;white-space:nowrap;
  }
  .artist-section:last-child{border-right:none}
  .artist-section:hover{color:var(--txt);background:var(--card2)}
  .artist-section.active{background:var(--accent);color:#08111f}
  .subtabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .subtabs::-webkit-scrollbar{display:none}
  .subtab{background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:20px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;flex-shrink:0}
  .subtab:hover{border-color:var(--accent)}
  .subtab.active{background:var(--accent);color:#08111f;border-color:transparent;font-weight:650}
  .filters{display:flex;gap:8px;margin:0 0 10px;flex-wrap:wrap}
  .filters input,.filters select{background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:8px 11px;font:inherit;font-size:13px;outline:none}
  .filters input{flex:1;min-width:160px}
  .filters input:focus,.filters select:focus{border-color:var(--accent)}
  .filters input::placeholder{color:#5c6675}
  .filters select{cursor:pointer;min-width:130px}
  .filters select.hidden{display:none}
  .filters .tick{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:8px 11px;cursor:pointer}
  .filters .tick.hidden{display:none}
  .filters .tick input{accent-color:var(--accent);margin:0;flex:none;min-width:0;width:auto;padding:0}
  .tiebreak-note{color:var(--muted);font-size:11px;margin:0 0 10px;padding:7px 10px;background:var(--card);border:1px solid var(--line);border-radius:8px}
  .tiebreak-note strong{color:var(--accent);font-weight:600}
  .list{display:grid;gap:6px}
  .item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 14px}
  .item.with-rank{grid-template-columns:34px minmax(0,1fr) auto}
  .item.centered{align-items:center}
  .item.top{align-items:flex-start}
  .rank{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums;text-align:right}
  .info{min-width:0}
  a.plink{color:inherit;text-decoration:none}
  a.plink::after{content:" ↗";font-size:.75em;color:var(--accent);opacity:.8}
  .item:has(a.plink) .thumb{cursor:pointer;box-shadow:0 0 0 1px var(--line)}
  .item:has(a.plink) .thumb:hover{box-shadow:0 0 0 2px var(--accent)}
  a.plink:hover{text-decoration:underline;text-decoration-color:var(--accent)}
  .info .primary{display:block;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .info .secondary{display:block;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
  .azgrid{display:grid;grid-template-columns:auto auto;gap:2px 12px;align-items:baseline;font-variant-numeric:tabular-nums;flex-shrink:0}
  .azgrid .lbl{text-align:right;color:var(--muted);font-size:11px;white-space:nowrap}
  .azgrid .val{text-align:right;color:var(--txt);font-size:11px;font-weight:600;white-space:nowrap}
  .azgrid .lbl.first{font-size:12px;color:var(--txt)}
  .azgrid .val.first{font-size:18px;color:var(--good);font-weight:700;line-height:1.1}
  .right{text-align:right;font-variant-numeric:tabular-nums;flex-shrink:0}
  .big-score{font-size:18px;font-weight:700;color:var(--good);line-height:1.1}
  .pager{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin:12px 0}
  .pager button{background:var(--card2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer;min-width:34px}
  .pager button:hover:not(:disabled){border-color:var(--accent)}
  .pager button.active{background:var(--accent);color:#08111f;border-color:transparent;font-weight:650}
  .pager button:disabled{opacity:.35;cursor:not-allowed}
  .pager .ellipsis{color:var(--muted);padding:6px 4px;font-size:12px;align-self:center}
  .empty{color:var(--muted);text-align:center;padding:40px 20px}
  .typetag{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin-left:6px;font-weight:600;vertical-align:middle}
  .typetag.ep{color:#7ee2a0;border-color:#1c4a2a}
  .typetag.comp{color:#f5c46a;border-color:#4a3416}
  /* covers: thumbnail on every row; the top 3 on Final Score get a blurred cover banner + medal */
  .item.has-cover{grid-template-columns:44px minmax(0,1fr) auto}
  .item.with-rank.has-cover{grid-template-columns:34px 44px minmax(0,1fr) auto}
  .thumb{width:44px;height:44px;border-radius:6px;background:var(--card2);border:1px solid var(--line);overflow:hidden;flex-shrink:0}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .medal{display:inline-flex;width:28px;height:28px;border-radius:50%;align-items:center;justify-content:center;font-size:13px;font-weight:800;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.4)}
  .medal.m1{background:radial-gradient(circle at 32% 30%,#fff4b8,#e2b33c 55%,#97700f);color:#2b1e00}
  .medal.m2{background:radial-gradient(circle at 32% 30%,#ffffff,#c0c7cf 55%,#78808a);color:#1c2127}
  .medal.m3{background:radial-gradient(circle at 32% 30%,#ffd9b5,#cd7f32 55%,#7a4519);color:#2a1405}
  .item.podium{padding:14px}
  .item.podium.with-rank.has-cover{grid-template-columns:34px 60px minmax(0,1fr) auto}
  .item.podium .thumb{width:60px;height:60px;border-color:rgba(255,255,255,.15);box-shadow:0 4px 14px rgba(0,0,0,.5)}
  .item.podium .info .primary{font-size:16px}
  .item.podium.p1{border-color:#e2b33c66}
  .item.podium.p2{border-color:#c0c7cf55}
  .item.podium.p3{border-color:#cd7f3266}
  .item.banner{position:relative;overflow:hidden;isolation:isolate}
  .item.banner::before{content:"";position:absolute;inset:-24px;z-index:-2;background-image:var(--cover);background-size:cover;background-position:center;filter:blur(14px) saturate(1.7) brightness(1.15);transform:scale(1.15)}
  .item.banner::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(12,14,20,.2),rgba(12,14,20,.45) 55%,rgba(12,14,20,.78))}
  .item.banner .info .primary{text-shadow:0 1px 3px rgba(0,0,0,.6)}
  .item.banner .info .secondary,.item.banner .azgrid .lbl{color:rgba(232,236,243,.78)}
  @media (max-width:480px){
    .item.with-rank.has-cover{grid-template-columns:26px 38px minmax(0,1fr) auto;gap:10px}
    .item.has-cover{grid-template-columns:38px minmax(0,1fr) auto;gap:10px}
    .thumb{width:38px;height:38px}
    .item.podium.with-rank.has-cover{grid-template-columns:28px 48px minmax(0,1fr) auto}
    .item.podium .thumb{width:48px;height:48px}
    .medal{width:24px;height:24px;font-size:12px}
  }
  /* 10s tab: bar split into plain 10 / 10* / 10** (Notion colours: red, brown on gray, yellow) */
  .tbar{display:flex;height:6px;max-width:260px;margin-top:7px;border-radius:3px;background:var(--card2);overflow:hidden}
  .tbar i{display:block;height:100%}
  .t10{background:#e5534b}
  .tatc{background:#a8754a}
  .tsp{background:#e8c24a}
  /* Songs tab: tier tags like the calculator, ratings coloured like the Notion legend */
  .tier{display:inline-block;font-size:10px;font-weight:700;border-radius:5px;padding:1px 5px;margin-left:6px;vertical-align:middle}
  .tier.atc{background:#3b3b3b;color:#d29a5f}
  .tier.special{background:#f2d36b;color:#2a2205}
  .big-score.r10{color:#ff6b6b}
  .big-score.r9{color:#ffa94d}
  .big-score.r8{color:#ffd43b}
  .big-score.r7{color:#69db7c}
  .big-score.r6{color:#74c0fc}
  .big-score.r5{color:#b197fc}
  .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin:0 3px 0 8px;vertical-align:0}
  footer{color:var(--muted);font-size:11px;text-align:center;margin-top:26px}
</style>
${hw.style}
</head>
<body>
${hw.decor}
<div class="wrap">
  <h1>Album Ranking</h1>
  <div class="meta"><span id="count">0</span> &nbsp;·&nbsp; updated <span id="updated">—</span>${ratingsLink ? ' &nbsp;·&nbsp; <a class="plink" href="' + ratingsLink + '" target="_blank" rel="noopener">How the ratings work</a>' : ''}</div>
  <div class="meta hint">Tap a title with ↗ or its cover to open the Notion page.</div>
  <div class="toptabs" id="toptabs"></div>
  <div id="artistSections"></div>
  <div class="subtabs" id="subtabs"></div>
  <div class="filters">
    <input id="searchBox" type="search" placeholder="Search…" autocomplete="off">
    <select id="minAlbums">
      <option value="0">All artists</option>
      <option value="1">1+ releases</option>
      <option value="2">2+ releases</option>
      <option value="3">3+ releases</option>
      <option value="4">4+ releases</option>
      <option value="5">5+ releases</option>
      <option value="6">6+ releases</option>
      <option value="7">7+ releases</option>
    </select>
    <label id="bestOnlyWrap" class="tick hidden" title="Each artist is judged on their N albums with the highest Final Score; every column averages only those albums.">
      <input type="checkbox" id="bestOnly"> <span>Best <span id="bestN">3</span> only (by Final Score)</span>
    </label>
    <select id="minSongs" class="hidden"></select>
    <select id="othersTypeFilter" class="hidden">
      <option value="all">EPs and Compilations</option>
      <option value="ep">EPs only</option>
      <option value="comp">Compilations only</option>
    </select>
    <select id="songRating" class="hidden">
      <option value="all">All ratings</option>
      <option value="tens">10s (incl. 10* and 10**)</option>
      <option value="tiered">10* and 10**</option>
      <option value="atc">10* only</option>
      <option value="special">10** only</option>
      <option value="r9">9 – 9.75</option>
      <option value="r8">8 – 8.75</option>
      <option value="r7">7 – 7.75</option>
      <option value="r6">6 – 6.75</option>
      <option value="low">Below 6</option>
    </select>
    <select id="songSource" class="hidden">
      <option value="all">All sources</option>
      <option value="album">Album tracks</option>
      <option value="ep">EP tracks</option>
      <option value="comp">Compilation tracks</option>
      <option value="bonus">Bonus tracks</option>
      <option value="other">Other songs</option>
    </select>
    <select id="songNote" class="hidden">
      <option value="all">Notes or not</option>
      <option value="yes">With a note</option>
      <option value="no">Without a note</option>
    </select>
    <select id="songSort" class="hidden">
      <option value="artist">Sort: artist and album</option>
      <option value="title">Sort: title A–Z</option>
      <option value="rating">Sort: rating</option>
    </select>
    <select id="songArtist" class="hidden">
      <option value="">All artists</option>
    </select>
    <select id="tensSort" class="hidden">
      <option value="count">Most 10s</option>
      <option value="pct">Highest % of 10s</option>
    </select>
  </div>
  <div id="tiebreakNote"></div>
  <div id="pagerTop"></div>
  <div class="list" id="list"></div>
  <div id="pagerBottom"></div>
  <footer>Sorted automatically · ties broken by Exp → Cre → Ind → Prod (Albums) or Exp → Ind (EPs/Compilations), then % of 10s → 10** → 10*</footer>
</div>
<script>
const ALBUMS = ${payload};
const OTHERS = ${payloadOthers};
const EXTRAS = ${payloadExtras};
const ARTIST_PHOTOS = ${payloadPhotos};
const ARTIST_PAGES = ${payloadPages};
const UPDATED = ${JSON.stringify(updated)};
const PAGE_SIZE = 25;

const TOP_TABS = [
  {id:'albums',  label:'Albums'},
  {id:'artists', label:'Artists'},
  {id:'epcomp',  label:'EPs/Compilations'},
  {id:'others',  label:'Others'},
  {id:'songs',   label:'Songs'}
];
// Songs has no sub-tabs: sorting is a menu next to the filters (songSort).
const SONGS_SUB_TABS = [];
const SONGS_PAGE_SIZE = 50;
function pageSize(){ return topTab === 'songs' ? SONGS_PAGE_SIZE : PAGE_SIZE; }

const ALBUM_SUB_TABS = [
  {id:'az',label:'A–Z'},{id:'score',label:'Final Score'},
  {id:'experience',label:'Experience'},{id:'creativity',label:'Creativity'},
  {id:'individual',label:'Individual'},{id:'production',label:'Production'},
  {id:'tens',label:'10s'}
];
const ARTIST_MAIN_SUB_TABS = [
  {id:'az',label:'A–Z'},{id:'score',label:'Final Score'},
  {id:'experience',label:'Experience'},{id:'creativity',label:'Creativity'},
  {id:'individual',label:'Individual'},{id:'production',label:'Production'},
  {id:'tens',label:'10s'}
];
const ARTIST_COMBINED_SUB_TABS = [
  {id:'individual',label:'Individual Ratings'},{id:'tens',label:'10s'}
];
const EPCOMP_SUB_TABS = [
  {id:'az',label:'A–Z'},{id:'score',label:'Final Score'},
  {id:'experience',label:'Experience'},{id:'individual',label:'Individual'},
  {id:'tens',label:'10s'}
];
const OTHERS_SUB_TABS = [
  {id:'az',label:'A–Z'},{id:'individual',label:'Individual Ratings'},{id:'tens',label:'10s'}
];

let artistView = 'main';

const $ = id => document.getElementById(id);
let topTab = 'albums', subTab = 'score', currentPage = 1;
let searchQuery = '';
let minAlbumsFilter = 0;
let bestOnly = false; // Artists → Main Albums: judge each artist on their best N albums (N = releases filter)
let minSongsFilter = 0;
let othersTypeFilter = 'all';
let tensSort = 'count';
let songRatingFilter = 'all', songSourceFilter = 'all', songNoteFilter = 'all', songArtistFilter = '', songSort = 'artist';

/* helpers */
function fmtCat(v){
  if (v == null) return '–';
  const r = Math.round(v*100);
  if (r % 10 === 5) return v.toFixed(2);
  return (Math.round(v*10)/10).toFixed(1);
}
// Individual is kept raw, so it always shows 2 decimals: 9.67 vs 9.70 explains a
// Final Score order that 9.7 vs 9.7 would hide.
function fmtInd(v){ return (v == null || !isFinite(v)) ? '–' : v.toFixed(2); }
function fmtRawFloat(v){
  if (v == null || !isFinite(v)) return '–';
  const r = Math.round(v * 100) / 100;
  return (r % 1 === 0) ? r.toFixed(1) : r.toFixed(2);
}
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function roundKey(v){
  const r2 = Math.round(v * 100) / 100;
  if (Math.abs(Math.round(r2 * 100) % 10) === 5) return r2;
  return Math.round(v * 10) / 10;
}
function scoreValue(a){
  if (a.rawScore != null && typeof a.rawScore === 'number') return a.rawScore;
  return (typeof a.score === 'number') ? a.score / 100 : 0;
}
function fmtFinal(a){
  if (a.rawScore != null && typeof a.rawScore === 'number'){
    const v = Math.round(a.rawScore * 100) / 100;
    return (v % 1 === 0) ? v.toFixed(1) : v.toFixed(2);
  }
  if (typeof a.score !== 'number') return '–';
  const v = a.score > 10 ? a.score / 100 : a.score;
  if (v % 1 === 0) return v.toFixed(1);
  return (Math.round(v * 100) % 10 === 0) ? v.toFixed(1) : v.toFixed(2);
}
/* links to the public Notion site (the Music page's site view) */
// A page is SITE + its id without dashes; "#<line id>" jumps to one line (a song).
const SITE = 'https://outrageous-tugboat-969.notion.site/';
function notionId(v){
  const m = String(v || '').split(/[?#]/)[0].replace(/-/g, '').match(/[0-9a-f]{32}$/i);
  return m ? m[0].toLowerCase() : null;
}
function pageLink(pageId, block){
  const p = notionId(pageId);
  if (!p) return null;
  const b = notionId(block);
  return SITE + p + (b ? '#' + b : '');
}
// Set by hand in the calculator. A Notion link (app or site) becomes a site link; other https links stay.
function artistPageLink(artist){
  const u = ARTIST_PAGES[artist];
  if (typeof u !== 'string') return null;
  if (/notion\\.(so|site|com)/i.test(u) && notionId(u)) return SITE + notionId(u);
  return /^https:\\/\\//i.test(u) ? u : null;
}
// A row's title: a link (new tab) when there's a page, plain text otherwise.
function titleHtml(text, url){
  return url ? '<a class="primary plink" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + '</a>'
    : '<span class="primary">' + esc(text) + '</span>';
}

/* covers and medals */
// Only http(s) links; quotes, brackets and spaces are percent-encoded so the
// link can't break out of url('...') in the banner's CSS.
function safeCover(u){
  if (typeof u !== 'string' || !/^https?:\\/\\//i.test(u)) return null;
  return u.replace(/["'()\\\\\\s<>]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}
// A broken image (e.g. an expired Notion upload) removes itself and leaves the empty square.
function thumb(cover){
  const c = safeCover(cover);
  return '<div class="thumb">' + (c ? '<img src="' + esc(c) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
}
// Artist rows: the photo picked in the calculator, else the best album cover.
function artistPhoto(artist){ return safeCover(ARTIST_PHOTOS[artist]) ? ARTIST_PHOTOS[artist] : null; }
function artistCover(ar){
  if (artistPhoto(ar.artist)) return artistPhoto(ar.artist);
  const best = ar.albums.find(a => safeCover(a.cover));
  return best ? best.cover : null;
}
// Medals and banners: top 3 of the Final Score tab, only when not searching
// (a search re-numbers the list, so its #1 isn't the real #1).
function isPodium(rank, key){ return key === 'score' && !searchQuery && rank >= 1 && rank <= 3; }
function rankCell(rank, podium){
  if (podium) return '<div class="rank"><span class="medal m' + rank + '" title="' + ['', 'Gold', 'Silver', 'Bronze'][rank] + '">' + rank + '</span></div>';
  return '<div class="rank">' + rank + '.</div>';
}
// Opening tag of a ranked row with a cover; podium rows get the banner when a cover exists.
function rankedRowOpen(rank, key, cover){
  const podium = isPodium(rank, key);
  const c = podium ? safeCover(cover) : null;
  const cls = 'item with-rank centered has-cover' + (podium ? ' podium p' + rank : '') + (c ? ' banner' : '');
  return '<div class="' + cls + '"' + (c ? ' style="--cover:url(&#39;' + esc(c) + '&#39;)"' : '') + '>' + rankCell(rank, podium) + thumb(cover);
}
function fmtArtistScore(ar){
  const v = Math.round(ar.avgScore * 100) / 100;
  return (v % 1 === 0) ? v.toFixed(1) : v.toFixed(2);
}

/* tiebreaks */
// When every score ties: higher % of 10s, then more 10**, then more 10* (A–Z only after that).
function tensTiebreak(a,b){
  const x = a.tens || {}, y = b.tens || {};
  return ((y.pct||0)-(x.pct||0))||((y.special||0)-(x.special||0))||((y.atc||0)-(x.atc||0));
}
function albumTiebreak(a,b){
  return (b.experience-a.experience)||(b.creativity-a.creativity)||(b.individual-a.individual)||(b.production-a.production)||tensTiebreak(a,b)||String(a.artist||'').localeCompare(String(b.artist||''))||String(a.title||a.name||'').localeCompare(String(b.title||b.name||''));
}
function artistTiebreak(a,b){
  return (b.avgExperience-a.avgExperience)||(b.avgCreativity-a.avgCreativity)||(b.avgIndividual-a.avgIndividual)||(b.avgProduction-a.avgProduction)||tensTiebreak(a,b)||a.artist.localeCompare(b.artist);
}
function epcompTiebreak(a,b){
  return (b.experience-a.experience)||(b.individual-a.individual)||tensTiebreak(a,b)||String(a.artist||'').localeCompare(String(b.artist||''))||String(a.title||'').localeCompare(String(b.title||''));
}
// useRaw: rank by the exact value (Individual is kept raw and shown with 2 decimals);
// otherwise by the rounded value that's shown, so equal-looking scores share a rank.
function assignRanks(items, primaryFn, tiebreakFn, useRaw){
  const keyFn = v => useRaw ? v : roundKey(v);
  const sorted = items.slice().sort((a,b)=>{
    const d = keyFn(primaryFn(b)) - keyFn(primaryFn(a));
    if (d) return d;
    return tiebreakFn(a,b);
  });
  let lastVal = null, lastRank = 0;
  return sorted.map((it, idx)=>{
    const v = keyFn(primaryFn(it));
    let rank;
    if (lastVal !== null && v === lastVal){ rank = lastRank; }
    else { rank = idx + 1; lastRank = rank; lastVal = v; }
    return { item: it, rank };
  });
}

/* accessors */
function albumVal(a,key){
  if (key === 'score') return scoreValue(a);
  return a[key] || 0;
}
function othersVal(o,key){
  if (key === 'score') return o.score || 0;
  return o[key] || 0;
}
function artistVal(ar,key){
  if (key === 'score') return ar.avgScore;
  return ar['avg' + key.charAt(0).toUpperCase() + key.slice(1)] || 0;
}

/* 10s */
// Rated songs of a release's main tracklist ((x) tracks included, bonus tracks not).
// Old entries without tracks fall back to the plain song numbers (no tiers).
function releaseSongs(r){
  if (Array.isArray(r.tracks) && r.tracks.length){
    return r.tracks.filter(t => typeof t.rating === 'number').map(t => ({ rating: t.rating, tier: t.tier || null }));
  }
  return (Array.isArray(r.songs) ? r.songs : []).filter(v => typeof v === 'number').map(v => ({ rating: v, tier: null }));
}
// 10* and 10** are stored as rating 10, so they're part of "ten".
function tensOf(songs){
  let ten = 0, atc = 0, special = 0;
  for (const s of songs){
    if (s.rating !== 10) continue;
    ten++;
    if (s.tier === 'atc') atc++;
    else if (s.tier === 'special') special++;
  }
  return { ten, atc, special, total: songs.length, pct: songs.length ? ten / songs.length : 0 };
}
ALBUMS.forEach(a => { a.tens = tensOf(releaseSongs(a)); });
OTHERS.forEach(o => { o.tens = tensOf(releaseSongs(o)); });
function artistKey(x){ return (x.artist || 'Unknown').trim() || 'Unknown'; }

/* every rated song, once per artist */
// Brackets at the end of a title are dropped ("Sowing Season (Yeah)" = "Sowing Season",
// "(1997 Remaster)" ignored) unless they name another version: demos, live takes, etc.
const VERSION_TAG = /\\b(demo|live|acoustic|remix|instrumental|unplugged|reprise)\\b/i;
function titleKey(title){
  let s = String(title || '').trim();
  for (let m; (m = s.match(/\\s*[(\\[]([^()\\[\\]]*)[)\\]]\\s*$/)) && !VERSION_TAG.test(m[1]); ) s = s.slice(0, m.index);
  return s.toLowerCase().replace(/[^a-z0-9]/g, '') || String(title || '').toLowerCase();
}
// Order = which copy wins when a song appears twice: album track, then EP/compilation
// track, then other songs (bonus tracks and one-offs). Old hand-typed copies of EP
// tracks in "other songs" are skipped this way.
function buildSongs(){
  const seen = new Set(), out = [];
  const add = (artist, t, source, release, cover, pageId) => {
    if (typeof t.rating !== 'number') return;
    const name = artistKey({ artist });
    const key = name.toLowerCase() + '|' + titleKey(t.title);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ artist: name, title: t.title, n: t.n || null, rating: t.rating, tier: t.tier || null, excluded: !!t.excluded, source, release, cover: cover || null,
      link: pageLink(pageId, t.block), note: !!t.note });
  };
  // A bonus track shows the cover of the release it came from.
  const releaseCover = (artist, title) => {
    const r = [...ALBUMS, ...OTHERS].find(a => artistKey(a) === artistKey({ artist }) && (a.title || a.name) === title);
    return r ? r.cover : null;
  };
  ALBUMS.forEach(a => (a.tracks || []).forEach(t => add(a.artist, t, 'album', a.title || a.name, a.cover, a.reviewPageId)));
  OTHERS.forEach(o => (o.tracks || []).forEach(t => add(o.artist, t, o.type === 'EP' ? 'ep' : 'comp', o.title, o.cover, o.reviewPageId)));
  EXTRAS.forEach(x => add(x.artist, { title: x.title, rating: x.individual, tier: x.tier, excluded: x.excluded, block: x.block, note: x.note }, x.fromRelease ? 'bonus' : 'other',
    x.fromRelease || null, x.fromRelease ? releaseCover(x.artist, x.fromRelease) : null, x.reviewPageId));
  return out;
}
const SONGS = buildSongs();
const SONGS_BY_ARTIST = new Map();
SONGS.forEach(s => { if (!SONGS_BY_ARTIST.has(s.artist)) SONGS_BY_ARTIST.set(s.artist, []); SONGS_BY_ARTIST.get(s.artist).push(s); });
// "All Songs" (Artists tab): each song once. Another version (demo, live, acoustic…) only
// counts when the artist has no other copy: "Luca (Demo 2006)" repeats "Luca", but
// "Nobody Moves (Demo 2006)" counts when there's no other Nobody Moves.
// Two keys find the other copy:
// - base: the title without any brackets at the end ("Luca (Demo 2006)" → luca)
// - words: every word except the version brackets, in any order, so
//   "Yeah (Sowing Season) (Demo 2006)" = "Sowing Season (Yeah)" and
//   "Fork and Knife (Demo 2006)" = "(Fork And Knife)".
const BRACKETS = /[(\\[]([^()\\[\\]]*)[)\\]]/g;
function isVersion(title){
  return [...String(title || '').matchAll(BRACKETS)].some(m => VERSION_TAG.test(m[1]));
}
function songKeys(title){
  const t = String(title || '');
  let base = t.trim();
  for (let m; (m = base.match(/\\s*[(\\[]([^()\\[\\]]*)[)\\]]\\s*$/)); ) base = base.slice(0, m.index);
  const words = t.replace(BRACKETS, (all, inner) => VERSION_TAG.test(inner) ? ' ' : ' ' + inner + ' ')
    .toLowerCase().match(/[a-z0-9]+/g) || [];
  return ['b:' + base.toLowerCase().replace(/[^a-z0-9]/g, ''), 'w:' + words.sort().join(' ')]
    .filter(k => k.length > 2);
}
function allSongsOf(artist){
  const list = songsOf(artist);
  const taken = new Set();
  const keep = s => { songKeys(s.title).forEach(k => taken.add(k)); return true; };
  // Plain songs first, then each version only if no copy of it is in yet.
  const plain = list.filter(s => !isVersion(s.title) && keep(s));
  const versions = list.filter(s => isVersion(s.title) && !songKeys(s.title).some(k => taken.has(k)) && keep(s));
  return plain.concat(versions);
}
// Albums + EPs/compilations of an artist, and the cover of their best-scored album.
function releaseCountOf(artist){
  return ALBUMS.filter(a => artistKey(a) === artist).length + OTHERS.filter(o => artistKey(o) === artist).length;
}
function bestCoverOf(artist){
  if (artistPhoto(artist)) return artistPhoto(artist);
  const best = ALBUMS.filter(a => artistKey(a) === artist && safeCover(a.cover)).sort((x, y) => scoreValue(y) - scoreValue(x))[0];
  return best ? best.cover : null;
}
function songsOf(artist, sources){
  const list = SONGS_BY_ARTIST.get(artist) || [];
  return sources ? list.filter(s => sources.includes(s.source)) : list;
}
// Ranked by number of 10s (then %) or by % (then number); same count and % share a rank.
function rankTens(items, tieFn){
  const byPct = tensSort === 'pct';
  const sorted = items.slice().sort((a, b) => {
    const x = a.tens, y = b.tens;
    const d = byPct ? (y.pct - x.pct) || (y.ten - x.ten) : (y.ten - x.ten) || (y.pct - x.pct);
    return d || tieFn(a, b);
  });
  let last = null, lastRank = 0;
  return sorted.map((it, i) => {
    const same = last && last.ten === it.tens.ten && last.pct === it.tens.pct;
    if (!same){ lastRank = i + 1; last = it.tens; }
    return { item: it, rank: lastRank };
  });
}
function fmtPct(t){ return t.total ? (t.pct * 100).toFixed(1) + '%' : '–'; }
function tensBar(t){
  const w = n => (t.total ? (100 * n / t.total) : 0).toFixed(2) + '%';
  return '<div class="tbar"><i class="t10" style="width:' + w(t.ten - t.atc - t.special) + '"></i>' +
    '<i class="tatc" style="width:' + w(t.atc) + '"></i><i class="tsp" style="width:' + w(t.special) + '"></i></div>';
}
// Extra rows after the 10s counts: label, value, label, value…
function tensStack(t, ...rows){
  return '<div class="azgrid">' +
    '<div class="lbl first">10s</div><div class="val first">' + t.ten + '</div>' +
    '<div class="lbl">of songs</div><div class="val">' + fmtPct(t) + '</div>' +
    '<div class="lbl">10*</div><div class="val">' + t.atc + '</div>' +
    '<div class="lbl">10**</div><div class="val">' + t.special + '</div>' +
    rows.map((v, i) => i % 2 ? '' : '<div class="lbl">' + v + '</div><div class="val">' + rows[i + 1] + '</div>').join('') +
  '</div>';
}
function tensCountLine(t){ return t.ten + ' of ' + t.total + ' song' + (t.total === 1 ? '' : 's'); }

/* aggregations */
// best = N: keep only each artist's N albums with the highest Final Score (ties: Exp → Cre → Ind → Prod).
// count = albums used, totalCount = all their albums (the releases filter uses totalCount).
function buildArtists(best){
  const map = new Map();
  ALBUMS.forEach(a => {
    const key = (a.artist || 'Unknown').trim() || 'Unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  });
  return Array.from(map.entries()).map(([artist, all]) => {
    const sorted = all.slice().sort((x,y)=> (scoreValue(y) - scoreValue(x)) || albumTiebreak(x,y));
    const list = best ? sorted.slice(0, best) : sorted;
    const n = list.length;
    const avg = k => list.reduce((s,a)=>s+(a[k]||0),0) / n;
    const scoreSum = list.reduce((s,a)=> s + scoreValue(a), 0);
    const used = new Set(list.map(a => a.title || a.name));
    return {
      artist, count: n, totalCount: all.length, best: !!best && all.length > n,
      albums: list,
      avgProduction: avg('production'), avgIndividual: avg('individual'),
      avgCreativity: avg('creativity'), avgExperience: avg('experience'),
      avgScore: scoreSum / n,
      tens: tensOf(songsOf(artist, ['album']).filter(s => used.has(s.release)))
    };
  });
}
function buildArtistCombined(){
  const mainByArtist = new Map();
  ALBUMS.forEach(a => {
    const key = (a.artist || 'Unknown').trim() || 'Unknown';
    if (!mainByArtist.has(key)) mainByArtist.set(key, []);
    mainByArtist.get(key).push(a);
  });
  const extrasByArtist = new Map();
  EXTRAS.forEach(x => {
    const key = (x.artist || 'Unknown').trim() || 'Unknown';
    if (!extrasByArtist.has(key)) extrasByArtist.set(key, []);
    extrasByArtist.get(key).push(x);
  });
  const allArtists = new Set([...mainByArtist.keys(), ...extrasByArtist.keys(), ...OTHERS.map(artistKey)]);
  return Array.from(allArtists).map(artist => {
    const mains = mainByArtist.get(artist) || [];
    const xlist = extrasByArtist.get(artist) || [];

    // Every song once: album, EP/compilation and other songs, extra versions merged (allSongsOf).
    // (x) songs are left out of the count, the average and the 10s %.
    const all = allSongsOf(artist);
    const counted = all.filter(s => !s.excluded);
    const avgIndividual = counted.length ? counted.reduce((s, x) => s + x.rating, 0) / counted.length : 0;
    const total = counted.length;
    const bySource = src => counted.filter(s => src.includes(s.source)).length;

    const albumCount = mains.length;
    const othersCount = xlist.length;
    const albumSongCount = bySource(['album']);
    const epSongCount = bySource(['ep', 'comp']);
    const otherSongCount = bySource(['bonus', 'other']);

    const eps = OTHERS.filter(o => artistKey(o) === artist);
    const bestAlbum = mains.slice().sort((x, y) => scoreValue(y) - scoreValue(x)).find(a => safeCover(a.cover));

    return {
      artist,
      albumCount,
      othersCount,
      albumSongCount,
      epSongCount,
      otherSongCount,
      total,
      avgIndividual,
      releaseCount: albumCount + eps.length,
      songCount: total,
      tens: tensOf(counted),
      cover: artistPhoto(artist) || (bestAlbum ? bestAlbum.cover : null)
    };
  });
}
// Other songs (bonus tracks and one-offs) that aren't already an album or EP track.
function buildArtistOthers(){
  const map = new Map();
  SONGS.filter(s => s.source === 'bonus' || s.source === 'other').forEach(s => {
    if (!map.has(s.artist)) map.set(s.artist, []);
    map.get(s.artist).push({ title: s.title, individual: s.rating, rating: s.rating, tier: s.tier, excluded: s.excluded });
  });
  return Array.from(map.entries()).map(([artist, list]) => {
    const n = list.length;
    // (x) songs are listed but left out of the count, the average and the 10s %.
    const counted = list.filter(x => !x.excluded);
    const sum = counted.reduce((s,x)=> s + (x.individual || 0), 0);
    return {
      artist, count: counted.length,
      songs: list.slice().sort((a,b)=> b.individual - a.individual),
      avgIndividual: counted.length ? sum / counted.length : 0,
      releaseCount: releaseCountOf(artist),
      cover: bestCoverOf(artist),
      tens: tensOf(counted)
    };
  });
}

/* comparisons */
function compareAlbumsAZ(a,b){
  const r = String(a.artist||'').localeCompare(String(b.artist||''));
  if (r) return r;
  return String(a.title||a.name||'').localeCompare(String(b.title||b.name||''));
}
function compareAlbumsByScore(a,b){ return (scoreValue(b) - scoreValue(a)) || albumTiebreak(a,b); }
function compareArtistsAZ(a,b){ return a.artist.localeCompare(b.artist); }
function compareArtistsByScore(a,b){ return (b.avgScore - a.avgScore) || artistTiebreak(a,b); }
function compareEpcompAZ(a,b){
  const r = String(a.artist||'').localeCompare(String(b.artist||''));
  if (r) return r;
  return String(a.title||'').localeCompare(String(b.title||''));
}
function compareEpcompByScore(a,b){ return (b.score - a.score) || epcompTiebreak(a,b); }
function compareArtistCombinedByIndividual(a,b){
  return (b.avgIndividual - a.avgIndividual) || a.artist.localeCompare(b.artist);
}
function compareArtistOthersAZ(a,b){ return a.artist.localeCompare(b.artist); }
function compareArtistOthersByIndividual(a,b){ return (b.avgIndividual - a.avgIndividual) || a.artist.localeCompare(b.artist); }

/* sub-tab config */
function currentSubTabs(){
  if (topTab === 'epcomp') return EPCOMP_SUB_TABS;
  if (topTab === 'others') return OTHERS_SUB_TABS;
  if (topTab === 'songs') return SONGS_SUB_TABS;
  if (topTab === 'artists'){
    if (artistView === 'combined') return ARTIST_COMBINED_SUB_TABS;
    return ARTIST_MAIN_SUB_TABS;
  }
  return ALBUM_SUB_TABS;
}

/* top tabs */
function renderTopTabs(){
  $('toptabs').innerHTML = TOP_TABS.map(t =>
    '<button class="toptab' + (t.id===topTab?' active':'') + '" data-top="' + t.id + '">' + t.label + '</button>'
  ).join('');
  $('toptabs').querySelectorAll('.toptab').forEach(b=>{
    b.addEventListener('click', ()=>{
      const newTop = b.dataset.top;
      if (newTop !== topTab){
        topTab = newTop;
        if (topTab === 'artists' && artistView === 'combined') subTab = 'individual';
        const validIds = currentSubTabs().map(s=>s.id);
        if (validIds.length && !validIds.includes(subTab)) subTab = validIds[0];
        currentPage = 1;
      }
      renderTopTabs(); renderArtistSections(); renderSubTabs(); render();
    });
  });
}

/* artist sections */
function renderArtistSections(){
  const container = $('artistSections');
  if (topTab !== 'artists'){
    container.innerHTML = '';
    return;
  }
  const sections = [
    {id:'main',     label:'Main Albums'},
    {id:'combined', label:'All Songs'}
  ];
  container.innerHTML = '<div class="artist-sections">' +
    sections.map(s =>
      '<button class="artist-section' + (artistView===s.id?' active':'') + '" data-artistview="' + s.id + '">' + s.label + '</button>'
    ).join('') +
    '</div>';
  container.querySelectorAll('button[data-artistview]').forEach(b=>{
    b.addEventListener('click', ()=>{
      artistView = b.dataset.artistview;
      const validIds = currentSubTabs().map(s=>s.id);
      if (!validIds.includes(subTab)) subTab = currentSubTabs()[0].id;
      currentPage = 1;
      renderArtistSections(); renderSubTabs(); render();
    });
  });
}

/* sub-tabs */
function renderSubTabs(){
  const tabs = currentSubTabs();
  $('subtabs').innerHTML = tabs.map(t =>
    '<button class="subtab' + (t.id===subTab?' active':'') + '" data-sub="' + t.id + '">' + t.label + '</button>'
  ).join('');
  $('subtabs').querySelectorAll('.subtab').forEach(b=>{
    b.addEventListener('click', ()=>{
      subTab = b.dataset.sub; currentPage = 1;
      renderSubTabs(); render();
    });
  });
}

/* filters */
function setupFilters(){
  const search = $('searchBox');
  const minAlb = $('minAlbums');
  const othersType = $('othersTypeFilter');
  search.value = searchQuery;
  minAlb.value = String(minAlbumsFilter);
  othersType.value = othersTypeFilter;

  search.addEventListener('input', () => {
    searchQuery = search.value.trim().toLowerCase();
    currentPage = 1;
    render();
  });
  $('bestOnly').checked = bestOnly;
  $('bestOnly').addEventListener('change', e => {
    bestOnly = e.target.checked;
    currentPage = 1;
    render();
  });
  minAlb.addEventListener('change', () => {
    minAlbumsFilter = Number(minAlb.value) || 0;
    currentPage = 1;
    render();
  });
  const minSongs = $('minSongs');
  minSongs.addEventListener('change', () => {
    minSongsFilter = Number(minSongs.value) || 0;
    currentPage = 1;
    render();
  });
  othersType.addEventListener('change', () => {
    othersTypeFilter = othersType.value;
    currentPage = 1;
    render();
  });
  const songArtist = $('songArtist');
  [...new Set(SONGS.map(s => s.artist))].sort((a, b) => a.localeCompare(b)).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    songArtist.appendChild(opt);
  });
  const songSelects = [['songRating', v => { songRatingFilter = v; }], ['songSource', v => { songSourceFilter = v; }], ['songNote', v => { songNoteFilter = v; }], ['songArtist', v => { songArtistFilter = v; }], ['songSort', v => { songSort = v; }]];
  for (const [id, setValue] of songSelects){
    $(id).addEventListener('change', () => { setValue($(id).value); currentPage = 1; render(); });
  }
  const tensSel = $('tensSort');
  tensSel.value = tensSort;
  tensSel.addEventListener('change', () => {
    tensSort = tensSel.value;
    currentPage = 1;
    render();
  });
}
// The songs filter goes up to 50+ in Others and 75+ in All Songs; a value the
// new view doesn't offer goes back to "Any".
function setSongCountOptions(steps){
  const sel = $('minSongs');
  const key = steps.join(',');
  if (sel.dataset.steps === key) return;
  sel.dataset.steps = key;
  if (!steps.includes(minSongsFilter)) minSongsFilter = 0;
  sel.innerHTML = steps.map(n => '<option value="' + n + '">' + (n ? n + '+ songs' : 'Any number of songs') + '</option>').join('');
  sel.value = String(minSongsFilter);
}
function updateFiltersVisibility(){
  const minAlb = $('minAlbums');
  const othersType = $('othersTypeFilter');
  minAlb.classList.add('hidden');
  othersType.classList.add('hidden');
  $('tensSort').classList.toggle('hidden', subTab !== 'tens' || topTab === 'songs');
  ['songRating', 'songSource', 'songNote', 'songArtist', 'songSort'].forEach(id => $(id).classList.toggle('hidden', topTab !== 'songs'));
  // Songs filter: views that list every song of an artist (Others, Artists > All Songs).
  const songsFilterOn = topTab === 'others' || (topTab === 'artists' && artistView === 'combined');
  $('minSongs').classList.toggle('hidden', !songsFilterOn);
  if (songsFilterOn) setSongCountOptions(topTab === 'others' ? [0, 10, 25, 50] : [0, 10, 25, 50, 75]);

  // "Best N only" makes sense once there's an N: Artists → Main Albums with 2+ releases.
  $('bestOnlyWrap').classList.toggle('hidden', !(topTab === 'artists' && artistView === 'main' && minAlbumsFilter >= 2));
  $('bestN').textContent = minAlbumsFilter;

  if (topTab === 'artists' || topTab === 'others'){
    minAlb.classList.remove('hidden');
  } else if (topTab === 'epcomp'){
    othersType.classList.remove('hidden');
  }
}
function matchesSearch(album){
  if (!searchQuery) return true;
  const t = (album.title || album.name || '').toLowerCase();
  const a = (album.artist || '').toLowerCase();
  return t.includes(searchQuery) || a.includes(searchQuery);
}
function artistMatchesSearch(artistObj){
  if (!searchQuery) return true;
  if (artistObj.artist.toLowerCase().includes(searchQuery)) return true;
  if (artistObj.albums){
    for (const a of artistObj.albums){
      const t = (a.title || a.name || '').toLowerCase();
      if (t.includes(searchQuery)) return true;
    }
  }
  if (artistObj.songs){
    for (const s of artistObj.songs){
      const t = (s.title || '').toLowerCase();
      if (t.includes(searchQuery)) return true;
    }
  }
  if (artistObj.items){
    for (const it of artistObj.items){
      const t = (it.title || '').toLowerCase();
      if (t.includes(searchQuery)) return true;
    }
  }
  return false;
}
function epcompMatchesSearch(o){
  if (!searchQuery) return true;
  const t = (o.title || '').toLowerCase();
  const a = (o.artist || '').toLowerCase();
  return t.includes(searchQuery) || a.includes(searchQuery);
}

/* album cards */
function albumAZStack(a){
  const cats = [
    {l:'Final Score', v: fmtFinal(a)},
    {l:'Exp', v: fmtCat(a.experience)},
    {l:'Cre', v: fmtCat(a.creativity)},
    {l:'Ind', v: fmtInd(a.individual)},
    {l:'Prod', v: fmtCat(a.production)}
  ];
  let html = '<div class="azgrid">';
  html += '<div class="lbl first">' + cats[0].l + '</div><div class="val first">' + cats[0].v + '</div>';
  for (let i = 1; i < cats.length; i++){
    html += '<div class="lbl">' + cats[i].l + '</div><div class="val">' + cats[i].v + '</div>';
  }
  html += '</div>';
  return html;
}
function renderAlbumAZ(a){
  return '<div class="item centered has-cover">' + thumb(a.cover) +
    '<div class="info">' + titleHtml(a.title || a.name || '—', pageLink(a.reviewPageId)) +
      '<span class="secondary">' + esc(a.artist || '') + '</span></div>' +
    '<div>' + albumAZStack(a) + '</div></div>';
}
function renderAlbumRanked(a, rank, key){
  return rankedRowOpen(rank, key, a.cover) +
    '<div class="info">' + titleHtml(a.title || a.name || '—', pageLink(a.reviewPageId)) +
      '<span class="secondary">' + esc(a.artist || '') + '</span></div>' +
    '<div>' + albumStackFor(a, key) + '</div></div>';
}
function albumStackFor(a, activeKey){
  const cats = [
    {k:'score',      l:'Final', v: fmtFinal(a)},
    {k:'experience', l:'Exp',   v: fmtCat(a.experience)},
    {k:'creativity', l:'Cre',   v: fmtCat(a.creativity)},
    {k:'individual', l:'Ind',   v: fmtInd(a.individual)},
    {k:'production', l:'Prod',  v: fmtCat(a.production)}
  ];
  const big = cats.find(c => c.k === activeKey) || cats[0];
  const rest = cats.filter(c => c.k !== activeKey);
  let html = '<div class="azgrid">';
  html += '<div class="lbl first">' + big.l + '</div><div class="val first">' + big.v + '</div>';
  for (const c of rest){
    html += '<div class="lbl">' + c.l + '</div><div class="val">' + c.v + '</div>';
  }
  html += '</div>';
  return html;
}

/* artist cards (main) */
function artistAlbumList(ar){
  const albumList = ar.albums.map(a => a.title || a.name || '—').join(', ');
  const countLbl = ar.best ? 'Best ' + ar.count + ' of ' + ar.totalCount + ' albums by Final Score'
    : ar.count + ' album' + (ar.count === 1 ? '' : 's');
  const oneTag = ar.count === 1 ? ' <span style="opacity:.6">(single)</span>' : '';
  return countLbl + oneTag + ': ' + esc(albumList);
}
function artistAZStack(ar){
  const cats = [
    {l:'Avg Final Score', v: fmtArtistScore(ar)},
    {l:'Avg Exp', v: fmtCat(ar.avgExperience)},
    {l:'Avg Cre', v: fmtCat(ar.avgCreativity)},
    {l:'Avg Ind', v: fmtInd(ar.avgIndividual)},
    {l:'Avg Prod', v: fmtCat(ar.avgProduction)}
  ];
  let html = '<div class="azgrid">';
  html += '<div class="lbl first">' + cats[0].l + '</div><div class="val first">' + cats[0].v + '</div>';
  for (let i = 1; i < cats.length; i++){
    html += '<div class="lbl">' + cats[i].l + '</div><div class="val">' + cats[i].v + '</div>';
  }
  html += '</div>';
  return html;
}
function renderArtistAZ(ar){
  return '<div class="item centered has-cover">' + thumb(artistCover(ar)) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + artistAlbumList(ar) + '</span></div>' +
    '<div>' + artistAZStack(ar) + '</div></div>';
}
function renderArtistRanked(ar, rank, key){
  return rankedRowOpen(rank, key, artistCover(ar)) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + artistAlbumList(ar) + '</span></div>' +
    '<div>' + artistStackFor(ar, key) + '</div></div>';
}
function artistStackFor(ar, activeKey){
  const cats = [
    {k:'score',      l:'Avg Final', v: fmtArtistScore(ar)},
    {k:'experience', l:'Avg Exp',   v: fmtCat(ar.avgExperience)},
    {k:'creativity', l:'Avg Cre',   v: fmtCat(ar.avgCreativity)},
    {k:'individual', l:'Avg Ind',   v: fmtInd(ar.avgIndividual)},
    {k:'production', l:'Avg Prod',  v: fmtCat(ar.avgProduction)}
  ];
  const big = cats.find(c => c.k === activeKey) || cats[0];
  const rest = cats.filter(c => c.k !== activeKey);
  let html = '<div class="azgrid">';
  html += '<div class="lbl first">' + big.l + '</div><div class="val first">' + big.v + '</div>';
  for (const c of rest){
    html += '<div class="lbl">' + c.l + '</div><div class="val">' + c.v + '</div>';
  }
  html += '</div>';
  return html;
}

/* artist cards (combined) */
function artistCombinedList(ar){
  const parts = [[ar.albumSongCount, 'album'], [ar.epSongCount, 'EP/comp'], [ar.otherSongCount, 'other']]
    .filter(([n]) => n).map(([n, l]) => n + ' ' + l);
  return ar.total + ' song' + (ar.total === 1 ? '' : 's') + (parts.length > 1 ? ' (' + parts.join(' · ') + ')' : '');
}
function renderArtistCombinedRanked(ar, rank){
  return rankedRowOpen(rank, 'individual', ar.cover) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + esc(artistCombinedList(ar)) + '</span></div>' +
    '<div class="right"><div class="big-score">' + fmtRawFloat(ar.avgIndividual) + '</div></div></div>';
}

/* 10s cards */
function renderAlbumTens(a, rank){
  const t = a.tens;
  return rankedRowOpen(rank, 'tens', a.cover) +
    '<div class="info">' + titleHtml(a.title || a.name || '—', pageLink(a.reviewPageId)) +
      '<span class="secondary">' + esc(a.artist || '') + ' · ' + tensCountLine(t) + '</span>' + tensBar(t) + '</div>' +
    '<div>' + tensStack(t, 'Final', fmtFinal(a), 'Ind', fmtInd(a.individual)) + '</div></div>';
}
function renderArtistTens(ar, rank){
  const t = ar.tens;
  const where = ar.best ? 'best ' + ar.count + ' of ' + ar.totalCount + ' albums'
    : ar.count + ' album' + (ar.count === 1 ? '' : 's');
  return rankedRowOpen(rank, 'tens', artistCover(ar)) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + tensCountLine(t) + ' · ' + where + '</span>' + tensBar(t) + '</div>' +
    '<div>' + tensStack(t, 'Avg Final', fmtArtistScore(ar), 'Avg Ind', fmtInd(ar.avgIndividual)) + '</div></div>';
}
function renderArtistCombinedTens(ar, rank){
  const t = ar.tens;
  return rankedRowOpen(rank, 'tens', ar.cover) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + tensCountLine(t) + ' · all songs</span>' + tensBar(t) + '</div>' +
    '<div>' + tensStack(t, 'Avg Ind', fmtRawFloat(ar.avgIndividual)) + '</div></div>';
}

function renderEpcompTens(o, rank){
  const t = o.tens;
  return rankedRowOpen(rank, 'tens', o.cover) +
    '<div class="info">' + titleHtml(o.title || '—', pageLink(o.reviewPageId)) +
      '<span class="secondary">' + esc(o.artist || '') + epcompTypeTag(o.type) + ' · ' + tensCountLine(t) + '</span>' + tensBar(t) + '</div>' +
    '<div>' + tensStack(t, 'Final', fmtRawFloat(o.score), 'Ind', fmtInd(o.individual)) + '</div></div>';
}

/* EPs/Compilations cards */
function epcompTypeTag(type){
  const cls = type === 'EP' ? 'ep' : 'comp';
  return '<span class="typetag ' + cls + '">' + esc(type || '') + '</span>';
}
function epcompAZStack(o){
  return '<div class="azgrid">' +
    '<div class="lbl first">Final Score</div><div class="val first">' + fmtRawFloat(o.score) + '</div>' +
    '<div class="lbl">Exp</div><div class="val">' + fmtRawFloat(o.experience) + '</div>' +
    '<div class="lbl">Ind</div><div class="val">' + fmtInd(o.individual) + '</div>' +
  '</div>';
}
function renderEpcompAZ(o){
  return '<div class="item centered has-cover">' + thumb(o.cover) +
    '<div class="info">' + titleHtml(o.title || '—', pageLink(o.reviewPageId)) +
      '<span class="secondary">' + esc(o.artist || '') + epcompTypeTag(o.type) + '</span></div>' +
    '<div>' + epcompAZStack(o) + '</div></div>';
}
function renderEpcompRanked(o, rank, key){
  return '<div class="item with-rank centered has-cover">' +
    '<div class="rank">' + rank + '.</div>' + thumb(o.cover) +
    '<div class="info">' + titleHtml(o.title || '—', pageLink(o.reviewPageId)) +
      '<span class="secondary">' + esc(o.artist || '') + epcompTypeTag(o.type) + '</span></div>' +
    '<div>' + epcompStackFor(o, key) + '</div></div>';
}
function epcompStackFor(o, activeKey){
  const cats = [
    {k:'score',      l:'Final', v: fmtRawFloat(o.score)},
    {k:'experience', l:'Exp',   v: fmtRawFloat(o.experience)},
    {k:'individual', l:'Ind',   v: fmtInd(o.individual)}
  ];
  const big = cats.find(c => c.k === activeKey) || cats[0];
  const rest = cats.filter(c => c.k !== activeKey);
  let html = '<div class="azgrid">';
  html += '<div class="lbl first">' + big.l + '</div><div class="val first">' + big.v + '</div>';
  for (const c of rest){
    html += '<div class="lbl">' + c.l + '</div><div class="val">' + c.v + '</div>';
  }
  html += '</div>';
  return html;
}

/* Others cards */
function renderArtistOthersAZ(ar){
  return '<div class="item centered has-cover">' + thumb(ar.cover) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + ar.count + ' song' + (ar.count === 1 ? '' : 's') + '</span></div>' +
    '<div><div class="azgrid">' +
      '<div class="lbl first">Avg Individual</div><div class="val first">' + fmtRawFloat(ar.avgIndividual) + '</div>' +
    '</div></div></div>';
}
function renderArtistOthersRanked(ar, rank){
  return rankedRowOpen(rank, 'individual', ar.cover) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + ar.count + ' song' + (ar.count === 1 ? '' : 's') + '</span></div>' +
    '<div class="right"><div class="big-score">' + fmtRawFloat(ar.avgIndividual) + '</div></div></div>';
}

function renderArtistOthersTens(ar, rank){
  const t = ar.tens;
  return rankedRowOpen(rank, 'tens', ar.cover) +
    '<div class="info">' + titleHtml(ar.artist, artistPageLink(ar.artist)) +
      '<span class="secondary">' + tensCountLine(t) + ' · other songs</span>' + tensBar(t) + '</div>' +
    '<div>' + tensStack(t, 'Avg Ind', fmtRawFloat(ar.avgIndividual)) + '</div></div>';
}

/* Songs tab */
function fmtRating(v){ return String(Math.round(v * 100) / 100); }
// Notion legend: Red = 10, Orange = 9-10, Yellow = 8-9, Green = 7-8, Blue = 6-7, Purple = below 6.
function ratingClass(v){ return v >= 10 ? 'r10' : v >= 9 ? 'r9' : v >= 8 ? 'r8' : v >= 7 ? 'r7' : v >= 6 ? 'r6' : 'r5'; }
function tierTag(s){
  if (s.tier === 'special') return '<span class="tier special">10**</span>';
  if (s.tier === 'atc') return '<span class="tier atc">10*</span>';
  return '';
}
function sourceLine(s){
  if (s.source === 'album') return 'Album: ' + s.release + (s.n ? ' · track ' + s.n : '');
  if (s.source === 'ep') return 'EP: ' + s.release;
  if (s.source === 'comp') return 'Compilation: ' + s.release;
  if (s.source === 'bonus') return 'Bonus track · ' + s.release;
  return 'Other song · no Notion page';
}
// Sort key only: 10** above 10* above a plain 10. The shown rating stays 10.
function songSortValue(s){ return s.rating + (s.tier === 'special' ? 0.002 : s.tier === 'atc' ? 0.001 : 0); }
function compareSongsAZ(a, b){ return a.title.localeCompare(b.title) || a.artist.localeCompare(b.artist); }
function compareSongsByArtist(a, b){
  // Per artist: releases A–Z (bonus tracks follow their album's tracks), songs without a release last.
  return a.artist.localeCompare(b.artist) || ((a.release ? 0 : 1) - (b.release ? 0 : 1)) || String(a.release || '').localeCompare(String(b.release || '')) ||
    ((a.n || 999) - (b.n || 999)) || a.title.localeCompare(b.title);
}
function songMatches(s){
  if (songArtistFilter && s.artist !== songArtistFilter) return false;
  if (songSourceFilter !== 'all' && s.source !== songSourceFilter) return false;
  // A note = something inside the song's toggle on its Notion page.
  if (songNoteFilter !== 'all' && s.note !== (songNoteFilter === 'yes')) return false;
  const f = songRatingFilter;
  if (f === 'tens' && s.rating !== 10) return false;
  if (f === 'tiered' && !s.tier) return false;
  if ((f === 'atc' || f === 'special') && s.tier !== f) return false;
  // "r9" = 9 up to (not including) 10, "r8" = 8 up to 9, ...
  if (f.charAt(0) === 'r'){ const lo = Number(f.slice(1)); if (s.rating < lo || s.rating >= lo + 1) return false; }
  if (f === 'low' && s.rating >= 6) return false;
  if (!searchQuery) return true;
  return [s.title, s.artist, s.release || ''].some(v => v.toLowerCase().includes(searchQuery));
}
function renderSong(s, rank){
  const open = rank != null
    ? '<div class="item with-rank centered has-cover"><div class="rank">' + rank + '.</div>'
    : '<div class="item centered has-cover">';
  return open + thumb(s.cover) +
    '<div class="info"><span class="primary">' +
      (s.link ? '<a class="plink" href="' + esc(s.link) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>' : esc(s.title)) + tierTag(s) +
      (s.note ? '<span class="typetag" title="Has a note on its Notion page">note</span>' : '') +
      (s.excluded ? '<span class="typetag" title="Not counted in the Individual average">x</span>' : '') + '</span>' +
      '<span class="secondary">' + esc(s.artist) + ' · ' + esc(sourceLine(s)) + '</span></div>' +
    '<div class="right"><div class="big-score ' + ratingClass(s.rating) + '">' + fmtRating(s.rating) + '</div></div></div>';
}

/* tiebreak note */
function renderTiebreakNote(){
  const el = $('tiebreakNote');
  if (topTab === 'songs'){
    el.innerHTML = '<div class="tiebreak-note"><strong>Every rated song</strong>, once per artist (album track first, then EP/compilation, then bonus and other songs). ' +
      'Search finds songs, artists and releases. Rating sort puts 10** above 10* above 10.</div>';
    return;
  }
  if (subTab === 'tens'){
    const scope = topTab === 'albums' ? 'each album’s main tracklist (bonus tracks not counted)'
      : topTab === 'epcomp' ? 'each EP/compilation’s tracklist'
      : topTab === 'others' ? 'other songs only (bonus tracks and one-offs; EP tracks are in Artists → All Songs)'
      : (artistView === 'combined' ? 'every song once: albums, EPs/compilations and other songs, a demo/live/acoustic version only when there’s no other copy' : 'album tracks only (switch to All Songs for every song)');
    el.innerHTML = '<div class="tiebreak-note"><strong>10s</strong> include 10* and 10**. % = share of ' + scope + (topTab === 'albums' || topTab === 'epcomp' || (topTab === 'artists' && artistView === 'main') ? '; (x) tracks count.' : '; (x) songs left out.') +
      '<span class="dot t10"></span>10<span class="dot tatc"></span>10*<span class="dot tsp"></span>10**</div>';
    return;
  }
  if (topTab === 'others'){
    el.innerHTML = '<div class="tiebreak-note"><strong>Others</strong> — songs not on any main album (B-sides, one-offs, bonus tracks, standalone singles). Per-artist average of Individual Ratings.</div>';
    return;
  }
  if (topTab === 'epcomp'){
    if (subTab === 'score'){
      el.innerHTML = '<div class="tiebreak-note">Scored on <strong>Experience (60%)</strong> + <strong>Individual (40%)</strong>. Ties break by Experience → Individual → % of 10s → 10** → 10*.</div>';
    } else if (subTab === 'az'){ el.innerHTML = ''; }
    else { el.innerHTML = '<div class="tiebreak-note">Ties share the same rank. Order within a tie uses Exp → Ind → % of 10s → 10** → 10*.</div>'; }
    return;
  }
  if (topTab === 'artists' && artistView === 'combined'){
    el.innerHTML = '<div class="tiebreak-note">Straight average of <strong>Individual Rating</strong> across every song once: albums, EPs/compilations and other songs ((x) tracks skipped). A demo, live or acoustic version only counts when there’s no other copy of the song.</div>';
    return;
  }
  if (subTab === 'az'){ el.innerHTML = ''; }
  else if (subTab === 'score'){
    el.innerHTML = '<div class="tiebreak-note"><strong>Final Score ties</strong> break by the full unrounded score, then Exp → Cre → Ind → Prod → % of 10s → 10** → 10*.</div>';
  } else {
    el.innerHTML = '<div class="tiebreak-note">Ties share the same rank. Order within a tie uses Exp → Cre → Ind → Prod → % of 10s → 10** → 10*.</div>';
  }
}

/* pagination */
function pageWindow(current, total){
  if (total <= 7) return Array.from({length: total}, (_, i)=> i+1);
  const pages = []; const add = n => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current-1); i <= Math.min(total-1, current+1); i++) add(i);
  if (current < total - 2) pages.push('…');
  add(total);
  return pages;
}
function renderPager(containerId, totalItems){
  const el = $(containerId);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize()));
  if (totalPages <= 1){ el.innerHTML = ''; return; }
  const pages = pageWindow(currentPage, totalPages);
  let html = '<div class="pager">';
  html += '<button data-page="' + (currentPage-1) + '"' + (currentPage===1?' disabled':'') + '>‹</button>';
  pages.forEach(p=>{
    if (p === '…') html += '<span class="ellipsis">…</span>';
    else html += '<button data-page="' + p + '"' + (p===currentPage?' class="active"':'') + '>' + p + '</button>';
  });
  html += '<button data-page="' + (currentPage+1) + '"' + (currentPage===totalPages?' disabled':'') + '>›</button></div>';
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const p = Number(b.dataset.page);
      if (p >= 1 && p <= totalPages && p !== currentPage){
        currentPage = p; render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

/* main render */
function render(){
  const listEl = $('list'); const countEl = $('count');
  $('updated').textContent = UPDATED;
  renderTiebreakNote();
  updateFiltersVisibility();

  let allItems = []; let renderer = null;

  if (topTab === 'albums'){
    const filtered = ALBUMS.filter(matchesSearch);
    if (subTab === 'az'){ allItems = filtered.slice().sort(compareAlbumsAZ).map(a=>({item:a,rank:null})); renderer = r=>renderAlbumAZ(r.item); }
    else if (subTab === 'score'){
      allItems = filtered.slice().sort(compareAlbumsByScore).map((a,i)=>({item:a,rank:i+1}));
      renderer = r=>renderAlbumRanked(r.item,r.rank,'score');
    }
    else if (subTab === 'tens'){
      allItems = rankTens(filtered, compareAlbumsByScore);
      renderer = r=>renderAlbumTens(r.item,r.rank);
    }
    else {
      const key = subTab;
      allItems = assignRanks(filtered, a=>albumVal(a,key), albumTiebreak, key === 'individual');
      renderer = r=>renderAlbumRanked(r.item,r.rank,key);
    }
    countEl.textContent = allItems.length + ' album' + (allItems.length===1?'':'s');
  }
  else if (topTab === 'artists'){
    if (artistView === 'combined'){
      let list = buildArtistCombined();
      list = list.filter(artistMatchesSearch);
      if (minAlbumsFilter > 0) list = list.filter(ar => ar.releaseCount >= minAlbumsFilter);
      if (minSongsFilter > 0) list = list.filter(ar => ar.songCount >= minSongsFilter);
      if (subTab === 'tens'){
        allItems = rankTens(list, compareArtistCombinedByIndividual);
        renderer = r=>renderArtistCombinedTens(r.item, r.rank);
      } else {
        list.sort(compareArtistCombinedByIndividual);
        allItems = list.map((ar,i)=>({item:ar, rank:i+1}));
        renderer = r=>renderArtistCombinedRanked(r.item, r.rank);
      }
      countEl.textContent = allItems.length + ' artist' + (allItems.length===1?'':'s');
    }
    else {
      let artists = buildArtists(bestOnly && minAlbumsFilter >= 2 ? minAlbumsFilter : 0);
      artists = artists.filter(artistMatchesSearch);
      if (minAlbumsFilter > 0) artists = artists.filter(ar => ar.totalCount >= minAlbumsFilter);
      if (subTab === 'az'){ allItems = artists.slice().sort(compareArtistsAZ).map(a=>({item:a,rank:null})); renderer = r=>renderArtistAZ(r.item); }
      else if (subTab === 'score'){
        allItems = artists.slice().sort(compareArtistsByScore).map((a,i)=>({item:a,rank:i+1}));
        renderer = r=>renderArtistRanked(r.item,r.rank,'score');
      }
      else if (subTab === 'tens'){
        allItems = rankTens(artists, compareArtistsByScore);
        renderer = r=>renderArtistTens(r.item,r.rank);
      }
      else {
        const key = subTab;
        allItems = assignRanks(artists, ar=>artistVal(ar,key), artistTiebreak, key === 'individual');
        renderer = r=>renderArtistRanked(r.item,r.rank,key);
      }
      countEl.textContent = allItems.length + ' artist' + (allItems.length===1?'':'s');
    }
  }
  else if (topTab === 'epcomp'){
    let filtered = OTHERS.filter(epcompMatchesSearch);
    if (othersTypeFilter === 'ep') filtered = filtered.filter(o => o.type === 'EP');
    else if (othersTypeFilter === 'comp') filtered = filtered.filter(o => o.type === 'Compilation');
    if (subTab === 'az'){ allItems = filtered.slice().sort(compareEpcompAZ).map(o=>({item:o,rank:null})); renderer = r=>renderEpcompAZ(r.item); }
    else if (subTab === 'score'){
      allItems = filtered.slice().sort(compareEpcompByScore).map((o,i)=>({item:o,rank:i+1}));
      renderer = r=>renderEpcompRanked(r.item,r.rank,'score');
    }
    else if (subTab === 'tens'){
      allItems = rankTens(filtered, compareEpcompByScore);
      renderer = r=>renderEpcompTens(r.item,r.rank);
    }
    else {
      const key = subTab;
      allItems = assignRanks(filtered, o=>othersVal(o,key), epcompTiebreak, key === 'individual');
      renderer = r=>renderEpcompRanked(r.item,r.rank,key);
    }
    countEl.textContent = allItems.length + ' release' + (allItems.length===1?'':'s');
  }
  else if (topTab === 'songs'){
    // No rank numbers: with hundreds of songs on the same rating, a rank says nothing.
    const list = SONGS.filter(songMatches);
    if (songSort === 'title') list.sort(compareSongsAZ);
    else if (songSort === 'rating') list.sort((a,b)=> (songSortValue(b) - songSortValue(a)) || compareSongsByArtist(a,b));
    else list.sort(compareSongsByArtist);
    allItems = list.map(s=>({item:s, rank:null}));
    renderer = r=>renderSong(r.item, r.rank);
    countEl.textContent = allItems.length.toLocaleString('en-US') + ' song' + (allItems.length===1?'':'s');
  }
  else {
    let list = buildArtistOthers();
    list = list.filter(artistMatchesSearch);
    if (minAlbumsFilter > 0) list = list.filter(ar => ar.releaseCount >= minAlbumsFilter);
    if (minSongsFilter > 0) list = list.filter(ar => ar.count >= minSongsFilter);
    if (subTab === 'tens'){
      allItems = rankTens(list, compareArtistOthersByIndividual);
      renderer = r=>renderArtistOthersTens(r.item, r.rank);
    } else if (subTab === 'az'){
      allItems = list.slice().sort(compareArtistOthersAZ).map(a=>({item:a,rank:null}));
      renderer = r=>renderArtistOthersAZ(r.item);
    } else {
      allItems = list.slice().sort(compareArtistOthersByIndividual).map((a,i)=>({item:a,rank:i+1}));
      renderer = r=>renderArtistOthersRanked(r.item, r.rank);
    }
    countEl.textContent = allItems.length + ' artist' + (allItems.length===1?'':'s');
  }

  const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize()));
  if (currentPage > totalPages) currentPage = totalPages;
  if (!allItems.length){
    listEl.innerHTML = '<div class="empty">No items published yet.</div>';
    renderPager('pagerTop', 0); renderPager('pagerBottom', 0); return;
  }
  const start = (currentPage - 1) * pageSize();
  const pageItems = allItems.slice(start, start + pageSize());
  listEl.innerHTML = pageItems.map(renderer).join('');
  renderPager('pagerTop', allItems.length);
  renderPager('pagerBottom', allItems.length);
}

// A cover opens the same Notion page as its row's title link.
$('list').addEventListener('click', e => {
  const th = e.target.closest('.thumb');
  const a = th && th.closest('.item').querySelector('a.plink');
  if (a) window.open(a.href, '_blank', 'noopener');
});
renderTopTabs(); renderArtistSections(); renderSubTabs(); setupFilters(); render();
</script>
</body>
</html>`;
}
