// Lyrics library: reading Genius-style lyrics ("[Verse 1]", "[Chorus]" ...)
// into sections. Shared by the worker and scripts/lyrics.mjs.

// Sections shorter or longer than this are never picked for Lyric of the Day.
export const MIN_SECTION_LINES = 2;
export const MAX_SECTION_LINES = 8;

// "Why Bother?" and "why bother" (or "Déjà" and "Deja") give the same key,
// so file names don't need punctuation that Windows doesn't allow.
export function normalizeKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

export function songKey(artist, title) {
  return normalizeKey(artist) + '|' + normalizeKey(title);
}

const LABEL = /^\[([^\]]+)\]$/;
// Lines Genius mixes into a copy-paste that aren't lyrics.
const JUNK = [/^you might also like$/i, /^see .+ live$/i, /^get tickets as low as/i, /^\d*embed$/i,
  /read more$/i, /^\d+\s*contributors?\b/i];

const cleanLine = line => line.replace(/\d*Embed$/, '').trim(); // Genius glues "Embed" to the last line
const isJunk = line => JUNK.some(re => re.test(line));

// Returns { sections: [{ label, lines }], warnings: [] }.
export function parseLyricsText(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim());
  // Everything before the first [Label] is the Genius page header ("12 Contributors ... Lyrics").
  const start = lines.findIndex(l => LABEL.test(l));
  const warnings = [];
  const sections = [];

  if (start === -1) {
    // Some Genius pages have no labels: use stanzas separated by blank lines, unlabeled.
    warnings.push('no [Section] labels; using stanzas separated by blank lines');
    let current = null;
    for (const raw of lines) {
      const line = cleanLine(raw);
      if (!raw) { current = null; continue; }
      if (!line || isJunk(line)) continue;
      if (!current) { current = { label: '', lines: [] }; sections.push(current); }
      current.lines.push(line);
    }
  } else {
    let current = null;
    for (const raw of lines.slice(start)) {
      const m = raw.match(LABEL);
      if (m) {
        // "[Chorus: Liam Gallagher]" -> "Chorus"
        current = { label: m[1].split(':')[0].trim(), lines: [] };
        sections.push(current);
        continue;
      }
      const line = cleanLine(raw);
      if (!line || isJunk(line)) continue;
      current.lines.push(line);
    }
  }

  // Drop empty sections ("[Instrumental]") and repeats of an identical section,
  // so a chorus sung three times isn't three times as likely to be picked.
  const seen = new Set();
  const out = [];
  for (const s of sections) {
    if (!s.lines.length) continue;
    const key = s.lines.map(normalizeKey).join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  if (!eligibleSections(out).length) warnings.push(`no section has ${MIN_SECTION_LINES}-${MAX_SECTION_LINES} lines`);
  return { sections: out, warnings };
}

// lyrics/covers.txt: one "Artist | Title | Album" per line ("#" starts a comment).
// Pins which album's cover a song gets. Returns { overrides: { songKey: { album } }, warnings }.
export function parseCoverOverrides(text) {
  const overrides = {};
  const warnings = [];
  String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length !== 3 || parts.some(p => !p)) {
      warnings.push(`line ${i + 1}: expected "Artist | Title | Album"`);
      return;
    }
    const [artist, title, album] = parts;
    overrides[songKey(artist, title)] = { album };
  });
  return { overrides, warnings };
}

export function eligibleSections(sections) {
  return (sections || []).filter(s => s.lines.length >= MIN_SECTION_LINES && s.lines.length <= MAX_SECTION_LINES);
}

// Artists whose repetitive blocks are kept: only a block that is one line over and
// over ("No control / No control / ...") is skipped. Everyone else: the half rule below.
const LENIENT_ARTISTS = new Set([normalizeKey('Brand New')]);
// Bracketed echoes don't count: "Where you been? (Where you been?)" = "Where you been?".
const lineKey = line => normalizeKey(String(line).replace(/\(.*?\)/g, ''));

// Too repetitive for Lyric of the Day: one line appears at least twice and is half
// the block or more ("They know that God created all men equal" x5 in 10 lines).
export function isRepetitive(lines, artist) {
  const keys = (lines || []).map(lineKey).filter(Boolean);
  if (!keys.length) return false;
  const counts = {};
  for (const k of keys) counts[k] = (counts[k] || 0) + 1;
  const top = Math.max(...Object.values(counts));
  if (LENIENT_ARTISTS.has(normalizeKey(artist))) return Object.keys(counts).length === 1 && keys.length > 1;
  return top >= 2 && top / keys.length >= 0.5;
}

// Blocks Lyric of the Day can pick: 2-8 lines and not too repetitive.
// A song whose blocks are all repetitive keeps them rather than never being picked.
export function pickableSections(sections, artist) {
  const ok = eligibleSections(sections);
  const varied = ok.filter(s => !isRepetitive(s.lines, artist));
  return varied.length ? varied : ok;
}
