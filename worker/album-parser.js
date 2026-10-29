// Reads an album review page from Notion (the blocks the API returns) and
// turns it into ratings: tracks, bonus tracks and the Final Thoughts scores.
// Pure functions only (no fetch), so the worker and the tests share it.
//
// Page conventions (see CLAUDE.md, "My Notion conventions"):
//   Review toggle   -> one toggle per track: "N. Title (m:ss) - 8.5 → 9 (comment)"
//   Bonus Tracks    -> bullets: "Title - 9"
//   Final Thoughts  -> "Production: 9.25", "Individual Ratings: 8.8", ...
//   "(x)" on a track = not counted in the Individual average.
//   Tiers (both count as 10). The API gives one color per text run and
//   reports the background when there is one:
//     yellow background + default text (yellow_background) or "10**" -> 'special'
//     gray background + brown text (gray_background), brown, or "10*" -> 'atc'
//     (Above The Clouds)

const SPECIAL_COLORS = ['yellow_background'];
const ATC_COLORS = ['gray_background', 'brown', 'brown_background'];

// Weights for the final score. Raw values: nothing is rounded here.
export const WEIGHTS = {
  album: { production: 0.15, individual: 0.20, creativity: 0.25, experience: 0.40 },
  ep: { experience: 0.60, individual: 0.40 },
};

// Notion API block -> { id, type, color, text: [{ text, color }], hasChildren, children }.
// hasChildren: Notion says something is nested inside (a toggle's note), even if not fetched.
// `children` must already be attached by whoever fetched the blocks.
export function simplifyBlock(block) {
  const body = block[block.type] || {};
  return {
    id: block.id || null,
    type: block.type,
    color: body.color || 'default',
    text: (body.rich_text || []).map(t => ({ text: t.plain_text || '', color: (t.annotations && t.annotations.color) || 'default' })),
    hasChildren: !!block.has_children,
    children: (block.children || []).map(simplifyBlock),
  };
}

const plain = b => b.text.map(t => t.text).join('');

// Any Notion link or ID -> dashed page ID, or null.
// "https://app.notion.com/p/3dc007e8bb6e81db8d75db6a64c7b6a8?pvs=204"
// "https://www.notion.so/Brand-New-Daisy-3dc007e8bb6e81db8d75db6a64c7b6a8"
export function pageIdFrom(input) {
  const s = String(input || '').split(/[?#]/)[0].replace(/-/g, '');
  const m = s.match(/([0-9a-f]{32})$/i);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}

// "Brand New - Daisy ‣" -> { artist: 'Brand New', album: 'Daisy' }
export function parseTitle(title) {
  const clean = String(title || '')
    .replace(/:[\w-]+:/g, '')          // custom emoji placeholders
    .replace(/[‣‣]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const i = clean.indexOf(' - ');
  if (i < 0) return { name: clean, artist: '', album: clean };
  return { name: clean, artist: clean.slice(0, i).trim(), album: clean.slice(i + 3).trim() };
}

// "8.5 → 9 (comment)" -> { rating: 9, stars: '' }; "10 → MASTERPIECE" -> 10.
// The last piece of the arrow chain that starts with a number wins.
export function parseRatingChain(s) {
  let rating = null, stars = '';
  for (const piece of String(s).split(/→|->/)) {
    const m = piece.trim().match(/^(\d+(?:[.,]\d+)?)(\*{0,2})/);
    if (m) { rating = parseFloat(m[1].replace(',', '.')); stars = m[2]; }
  }
  return { rating, stars };
}

function tierOf(block, stars) {
  const colors = [block.color, ...block.text.map(t => t.color)];
  if (stars === '**' || colors.some(c => SPECIAL_COLORS.includes(c))) return 'special';
  if (stars === '*' || colors.some(c => ATC_COLORS.includes(c))) return 'atc';
  return null;
}

// Rated on purpose as "not rated": "Twilight (0:21) - X", "She Just Won't Believe Me (0:58) - Interlude"
const SKIPPED_RATING = /^(x|interlude|n\/?a)\b/i;

// One line of the Review or Bonus Tracks section. Returns null if it isn't a song.
// Lines may be toggles, bullets or numbered items; "N." and "(m:ss)" are optional.
// rating null + excluded false = not rated yet (unfinished page).
export function parseSongLine(block) {
  let text = plain(block).trim();
  let excluded = /\(x\)/i.test(text);
  text = text.replace(/\(x\)/ig, '').trim();

  let n = null;
  const num = text.match(/^(\d+)\.\s*(.*)$/);
  if (num) { n = parseInt(num[1], 10); text = num[2]; }

  // "Title (m:ss) - rating..." or "Title - rating..."; the dash may lack a space before it.
  let title, length = null, rest;
  const withLength = text.match(/^(.*?)\s*\((\d{1,2}:\d{2})\)\s*[-–]\s*(.*)$/);
  if (withLength) {
    [, title, length, rest] = withLength;
  } else {
    // The last " - " that is followed by a rating, X / Interlude, or nothing at all.
    const dashes = [...text.matchAll(/\s*[-–]\s*(?=\d|x\b|interlude|n\/?a|$)/gi)].filter(m => m.index > 0);
    if (!dashes.length) return null;
    const d = dashes[dashes.length - 1];
    title = text.slice(0, d.index);
    rest = text.slice(d.index + d[0].length);
    if (!/\s/.test(d[0]) && !/^\d/.test(rest)) return null; // "Twenty-X" is a title, not a rating
  }
  rest = rest.trim();
  title = title.trim();
  if (!title) return null;

  if (!rest) return { n, title, length, rating: null, tier: null, excluded };            // not rated yet
  if (SKIPPED_RATING.test(rest)) return { n, title, length, rating: null, tier: null, excluded: true };

  const { rating, stars } = parseRatingChain(rest);
  if (rating == null) return null;
  // Stars only mean 10* / 10** right after a 10; "8.5*" is a personal note, not a tier.
  const tier = tierOf(block, rating === 10 ? stars : '');
  return { n, title, length, rating: tier ? 10 : rating, tier, excluded };
}

const SCORE_LABELS = {
  production: /^production/i,
  individual: /^individual/i,
  creativity: /^creativity/i,
  experience: /^experience/i,
  final: /^final\s*score/i,
};

// "Final Score: 9.17/10" -> { key: 'final', value: 9.17, label: 'Final Score', before: '', after: '/10' }.
// Re-rates use arrows like track lines, and the last number wins:
// "Final Score: 9.04→ 9.71/10" -> value 9.71, before '9.04→ ', after '/10'.
export function parseScoreLine(text) {
  const m = text.trim().match(/^([A-Za-z ]+?)\s*:\s*(.*)$/);
  if (!m) return null;
  const key = Object.keys(SCORE_LABELS).find(k => SCORE_LABELS[k].test(m[1].trim()));
  if (!key) return null;
  const rest = m[2];
  // Find where the winning number sits, so a fix can replace just that number.
  let hit = null, pos = 0;
  for (const piece of rest.split(/(→|->)/)) {
    const num = piece.match(/^(\s*)(\d+(?:[.,]\d+)?)/);
    if (piece !== '→' && piece !== '->' && num) hit = { start: pos + num[1].length, text: num[2] };
    pos += piece.length;
  }
  if (!hit) return null;
  return {
    key, label: m[1].trim(), value: parseFloat(hit.text.replace(',', '.')),
    before: rest.slice(0, hit.start), after: rest.slice(hit.start + hit.text.length).trim(),
  };
}

const isHeading = b => /^heading_/.test(b.type);

// The blocks of a section: the heading's (toggle) children, or, on flat
// template pages, the blocks after the heading up to the next heading.
// Returns null if the page has no such section.
function sectionBlocks(blocks, name) {
  const re = new RegExp('^' + name + '$', 'i');
  const i = blocks.findIndex(b => (isHeading(b) || b.type === 'toggle') && re.test(plain(b).trim()));
  if (i < 0) return null;
  if (blocks[i].children.length) return blocks[i].children;
  const out = [];
  for (const b of blocks.slice(i + 1)) { if (isHeading(b)) break; out.push(b); }
  return out;
}

// Blocks that can hold a song line. Plain paragraphs only count when numbered ("3. ..."),
// so a stray sentence with a dash in it isn't read as a song.
const LIST_TYPES = ['toggle', 'bulleted_list_item', 'numbered_list_item'];
const songCandidate = b => LIST_TYPES.includes(b.type) || (b.type === 'paragraph' && /^\s*\d+\./.test(plain(b)));

// Average of counted tracks, raw (no rounding). Unrated tracks are skipped.
export function individualAverage(tracks) {
  const counted = tracks.filter(t => !t.excluded && t.rating != null);
  if (!counted.length) return null;
  return counted.reduce((sum, t) => sum + t.rating, 0) / counted.length;
}

// kind: 'album' or 'ep' (EPs and compilations). Returns null if a score is missing.
export function finalScore(kind, scores) {
  const w = WEIGHTS[kind];
  let total = 0;
  for (const key of Object.keys(w)) {
    if (typeof scores[key] !== 'number') return null;
    total += scores[key] * w[key];
  }
  return total;
}

const close = (a, b) => Math.abs(a - b) <= 0.05;

// title: the page title. blocks: simplified top-level blocks (with children).
export function parseAlbumPage(title, blocks) {
  const warnings = [];
  const { name, artist, album } = parseTitle(title);

  const review = sectionBlocks(blocks, 'review');
  const tracks = [];
  if (!review) warnings.push('No Review section found.');
  else {
    for (const b of review.filter(songCandidate)) {
      const t = parseSongLine(b);
      if (!t) { warnings.push('Could not read track line: "' + plain(b).trim() + '"'); continue; }
      if (t.n == null) t.n = tracks.length + 1; // older pages don't number their tracks
      // The track's own line (for links straight to it) and whether its toggle holds a note.
      if (b.id) t.block = b.id;
      if (b.hasChildren) t.note = true;
      tracks.push(t);
    }
  }

  // Bonus Tracks can also hold notes; only lines that read as songs are kept.
  const bonus = [];
  for (const b of sectionBlocks(blocks, 'bonus tracks') || []) {
    const t = songCandidate(b) || b.type === 'paragraph' ? parseSongLine(b) : null;
    if (t && t.rating != null) bonus.push({ title: t.title, rating: t.rating, tier: t.tier, excluded: t.excluded,
      ...(b.id ? { block: b.id } : {}), ...(b.hasChildren ? { note: true } : {}) });
  }

  // What the page itself says, from Final Thoughts.
  // scoreLines remembers the block holding each score, so the calculator can rewrite a
  // wrong value: { individual: { id, type, label, labelColor, suffix } }. A block holding
  // several scores (one per line) is marked { shared: true } and isn't rewritten.
  const written = {};
  const scoreLines = {};
  const thoughts = sectionBlocks(blocks, 'final thoughts');
  if (!thoughts) warnings.push('No Final Thoughts section found.');
  else {
    for (const b of thoughts) {
      const lines = plain(b).split('\n');
      const found = lines.map(parseScoreLine).filter(Boolean);
      for (const s of found) {
        written[s.key] = s.value;
        if (found.length > 1) { scoreLines[s.key] = { shared: true }; continue; }
        const labelRun = b.text.find(t => t.text.trim());
        scoreLines[s.key] = {
          id: b.id, type: b.type,
          label: s.label,                               // as written: "Individual Rating" or "Individual Ratings"
          labelColor: labelRun ? labelRun.color : 'default',
          prefix: s.before,                             // earlier values kept on a fix: "9.04→ "
          suffix: s.after,                              // "/10" in "Final Score: 9.17/10"
        };
      }
    }
  }

  // Individual is computed from the tracks (raw); the page's value is only a check.
  const individual = individualAverage(tracks);
  if (individual != null && typeof written.individual === 'number' && !close(individual, written.individual)) {
    warnings.push('Page says Individual ' + written.individual + ', tracks average ' + individual.toFixed(3) + '.');
  }

  const scores = {
    production: written.production ?? null,
    creativity: written.creativity ?? null,
    experience: written.experience ?? null,
    individual: individual ?? written.individual ?? null,
  };
  const final = { album: finalScore('album', scores), ep: finalScore('ep', scores) };

  // Check the page's final score against whichever formula fits the page.
  const kindGuess = scores.production == null && scores.creativity == null ? 'ep' : 'album';
  if (typeof written.final === 'number' && final[kindGuess] != null && !close(final[kindGuess], written.final)) {
    warnings.push('Page says Final Score ' + written.final + ', calculated ' + final[kindGuess].toFixed(3) + '.');
  }

  // Unfinished = some track has no rating yet, or there's no score to rank by.
  const unrated = tracks.filter(t => t.rating == null && !t.excluded).length;
  const status = !tracks.length || unrated || final[kindGuess] == null ? 'unfinished' : 'complete';
  if (unrated && unrated < tracks.length) warnings.push(unrated + ' track(s) not rated yet.');

  return { name, artist, album, status, tracks, bonus, scores, written, scoreLines, final, kindGuess, warnings };
}
