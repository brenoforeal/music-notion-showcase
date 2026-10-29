// Song of the Day pool: my 9+ songs that have a note, from the published ranking data.
// Pure functions (no network), tested in scripts/song-pool.test.mjs.

export const MIN_RATING = 9;

// A public Notion site link to one song's line (Notion opens its toggle).
const SITE = 'https://outrageous-tugboat-969.notion.site/';
const plainId = v => {
  const m = String(v || '').replace(/-/g, '').match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : null;
};
export function songLink(pageId, block) {
  const p = plainId(pageId);
  if (!p) return null;
  const b = plainId(block);
  return SITE + p + (b ? '#' + b : '');
}

// Every song in the ranking data, once per Notion line (block). Album and EP tracks
// first; bonus tracks can appear both in a release and in "other songs" (extras).
export function allSongs(data) {
  const out = new Map();
  const add = (t, artist, release, cover, pageId) => {
    if (!t || !t.title || !t.block || out.has(t.block)) return;
    const rating = typeof t.rating === 'number' ? t.rating : t.individual;
    if (typeof rating !== 'number') return;
    out.set(t.block, {
      block: t.block, artist, title: t.title, release: release || null,
      rating, tier: t.tier || null, note: !!t.note, cover: cover || null, pageId: pageId || null,
    });
  };
  const releases = [...(data.albums || []), ...(data.others || [])];
  for (const r of releases) {
    for (const t of r.tracks || []) add(t, r.artist, r.title || r.name, r.cover, r.reviewPageId);
  }
  for (const r of releases) {
    for (const t of r.bonus || []) add(t, r.artist, r.title || r.name, r.cover, r.reviewPageId);
  }
  for (const x of data.extras || []) {
    const from = x.fromRelease && releases.find(r => r.artist === x.artist && (r.title || r.name) === x.fromRelease);
    add(x, x.artist, x.fromRelease, from && from.cover, x.reviewPageId || (from && from.reviewPageId));
  }
  return [...out.values()];
}

// The ones that can be Song of the Day: rated 9 or more (10* and 10** are 10) with a note.
export function songPool(data) {
  return allSongs(data).filter(s => s.note && s.rating >= MIN_RATING);
}

// Notion blocks inside a toggle → a small safe structure the page can render:
// [{ type: 'p'|'li'|'quote'|'h', spans: [{ text, b, i, u, s, code, href }] }]
// Only text blocks are kept (images, embeds and the like are skipped).
const KINDS = {
  paragraph: 'p', bulleted_list_item: 'li', numbered_list_item: 'li', to_do: 'li',
  quote: 'quote', callout: 'p', toggle: 'p',
  heading_1: 'h', heading_2: 'h', heading_3: 'h',
};
export function noteFromBlocks(blocks) {
  const out = [];
  for (const b of blocks || []) {
    const type = KINDS[b.type];
    if (!type) continue;
    const spans = ((b[b.type] || {}).rich_text || []).map(t => {
      const a = t.annotations || {};
      const span = { text: t.plain_text || '' };
      if (a.bold) span.b = true;
      if (a.italic) span.i = true;
      if (a.underline) span.u = true;
      if (a.strikethrough) span.s = true;
      if (a.code) span.code = true;
      if (t.href && /^https?:\/\//i.test(t.href)) span.href = t.href;
      return span;
    }).filter(s => s.text);
    // Empty paragraphs are just spacing in Notion; drop them.
    if (spans.length) out.push({ type, spans });
  }
  return out;
}
