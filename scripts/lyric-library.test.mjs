// Tests for the lyrics parser. Run with: npm test
// Uses made-up lines, not real lyrics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLyricsText, normalizeKey, songKey, eligibleSections, parseCoverOverrides, isRepetitive, pickableSections } from '../worker/lyric-library.js';

const GENIUS_PASTE = [
  '12 ContributorsTranslationsMade Up Song Lyrics',
  'Some description of the song that Genius shows...Read More',
  '',
  '[Intro]',
  'Oh',
  '',
  '[Verse 1: Some Singer]',
  'First made-up line',
  'Second made-up line',
  'Third made-up line',
  '',
  '[Chorus]',
  'Hook line one',
  'Hook line two',
  'You might also like',
  '',
  '[Instrumental Break]',
  '',
  '[Chorus]',
  'Hook line one',
  'Hook line two',
  '',
  '[Outro]',
  'Last line',
  'Very last line5Embed',
].join('\r\n');

test('skips the Genius header and reads sections', () => {
  const { sections } = parseLyricsText(GENIUS_PASTE);
  assert.deepEqual(sections.map(s => s.label), ['Intro', 'Verse 1', 'Chorus', 'Outro']);
});

test('drops singer names, junk lines, empty and repeated sections', () => {
  const { sections } = parseLyricsText(GENIUS_PASTE);
  const chorus = sections.find(s => s.label === 'Chorus');
  assert.deepEqual(chorus.lines, ['Hook line one', 'Hook line two']);
  assert.equal(sections.filter(s => s.label === 'Chorus').length, 1);
  assert.ok(!sections.some(s => s.label === 'Instrumental Break'));
});

test('strips "Embed" from the last line', () => {
  const { sections } = parseLyricsText(GENIUS_PASTE);
  assert.deepEqual(sections.at(-1).lines, ['Last line', 'Very last line']);
});

test('only 2-8 line sections are eligible', () => {
  const { sections } = parseLyricsText(GENIUS_PASTE);
  assert.deepEqual(eligibleSections(sections).map(s => s.label), ['Verse 1', 'Chorus', 'Outro']);
  const long = parseLyricsText('[Verse]\n' + Array.from({ length: 9 }, (_, i) => 'line ' + i).join('\n'));
  assert.equal(eligibleSections(long.sections).length, 0);
  assert.equal(long.warnings.length, 1);
});

test('no labels: stanzas split by blank lines, unlabeled', () => {
  const { sections, warnings } = parseLyricsText('3 Contributors\nfirst stanza a\nfirst stanza b\n\nsecond stanza a\nsecond stanza b\nsecond stanza c');
  assert.deepEqual(sections, [
    { label: '', lines: ['first stanza a', 'first stanza b'] },
    { label: '', lines: ['second stanza a', 'second stanza b', 'second stanza c'] },
  ]);
  assert.match(warnings[0], /no \[Section\] labels/);
});

test('drops "Read More" description lines', () => {
  const { sections } = parseLyricsText('[Verse]\nline one\nSome song bio text... Read More\nline two');
  assert.deepEqual(sections[0].lines, ['line one', 'line two']);
});

test('cover overrides: "Artist | Title | Album", comments and bad lines', () => {
  const { overrides, warnings } = parseCoverOverrides([
    '# Pin a song to an album cover',
    'The Smiths | How Soon Is Now? | Hatful of Hollow',
    '',
    'Brand New | Sink | Daisy   # trailing comment',
    'just one part',
  ].join('\r\n'));
  assert.deepEqual(overrides, {
    [songKey('The Smiths', 'How Soon Is Now')]: { album: 'Hatful of Hollow' },
    [songKey('Brand New', 'Sink')]: { album: 'Daisy' },
  });
  assert.deepEqual(warnings, ['line 5: expected "Artist | Title | Album"']);
});

test('keys ignore case, punctuation and accents', () => {
  assert.equal(normalizeKey('Why Bother?'), normalizeKey('why bother'));
  assert.equal(normalizeKey('Déjà Rêvé'), 'dejareve');
  assert.equal(songKey('Brand New', "Okay I Believe You, But My Tommy Gun Don't"),
    songKey('brand new', 'Okay I Believe You But My Tommy Gun Dont'));
});

test('repetitive blocks: one line that is half the block or more', () => {
  const rep = ['Walk to the shop', 'Walk to the shop', 'Walk to the shop', 'Buy some bread',
    'We all buy bread', 'We all buy bread', 'We all buy bread', 'We all buy bread', 'We all buy bread', 'We all'];
  assert.equal(isRepetitive(rep, 'Some Band'), true);
  // A chorus sung twice, or a line repeated 3 times in 8, is fine.
  assert.equal(isRepetitive(['A line', 'B line', 'C line', 'D line', 'A line', 'B line', 'C line', 'D line'], 'Some Band'), false);
  assert.equal(isRepetitive(['X', 'one', 'X', 'two', 'X', 'three', 'four', 'five'], 'Some Band'), false);
  // Two different lines are never repetitive; bracketed echoes count as the same line.
  assert.equal(isRepetitive(['First line', 'Second line'], 'Some Band'), false);
  assert.equal(isRepetitive(['Hey there (hey there)', 'Hey there', 'Other line'], 'Some Band'), true);
});

test('Brand New keeps repetitive blocks unless every line is the same', () => {
  assert.equal(isRepetitive(['Rain on me', 'Rain on me', 'Rain on me', 'Then the sun'], 'Brand New'), false);
  assert.equal(isRepetitive(['Rain on me', 'Rain on me', 'Rain on me'], 'brand new'), true);
  assert.equal(isRepetitive(['Rain on me', 'Rain on me', 'Rain on me', 'Then the sun'], 'Other Band'), true);
});

test('pickable sections skip repetitive ones, unless that is all there is', () => {
  const varied = { label: 'Verse', lines: ['One thing', 'Another thing'] };
  const rep = { label: 'Outro', lines: ['Go go', 'Go go', 'Go go'] };
  assert.deepEqual(pickableSections([varied, rep], 'Some Band'), [varied]);
  assert.deepEqual(pickableSections([rep], 'Some Band'), [rep]);
});
