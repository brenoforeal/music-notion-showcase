// Tests for the Notion album page parser. Run with: npm test
// Track lines and colors are copied from what the Notion API returns for real pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplifyBlock, parseAlbumPage, parseTitle, parseRatingChain, parseSongLine, pageIdFrom, parseScoreLine } from '../worker/album-parser.js';

// Build blocks the way the Notion API shapes them.
const rt = (text, color = 'default') => ({ plain_text: text, annotations: { color } });
const block = (type, runs, children = []) => ({ type, [type]: { rich_text: runs, color: 'default' }, children });
const heading = (name, children) => block('heading_2', [rt(name)], children);
const track = (...runs) => block('toggle', runs.map(r => (Array.isArray(r) ? rt(...r) : rt(r))));
const para = text => block('paragraph', [rt(text)]);
const legend = block('paragraph', [rt('Red (10)', 'red'), rt(' > '), rt('Orange (9~10)', 'orange')]);
const page = (title, blocks) => parseAlbumPage(title, blocks.map(simplifyBlock));

const daisy = page('Brand New - Daisy :2026-10-03-01-29-49-www-google-com-2487e83abaf3:', [
  para('Brand New’s fourth studio album.'),
  heading('Preview', [para('Some preview text - 9 words.')]),
  heading('Review', [
    legend,
    track('1. ', ['Vices (3:24) - 8.5 → 9', 'orange']),
    track('2. ', ['Bed (3:10) - 9 → 10', 'red']),
    track('3. ', ['At The Bottom (4:05) - 10 → Too Good To Exist', 'gray_background']),
    track('4. ', ['Gasoline (3:33) - 8 → 9.5', 'orange']),
    track('5.', [' You Stole (6:00) - 10', 'red']),
    track('6. ', ['Be Gone (1:31) - 7 → 8 ', 'yellow'], '(x)'),
    track('7. ', ['Sink (3:20) - 8 → 9.5', 'orange']),
    track('8. ', ['Bought A Bride (3:06) - 8.5 → 9.5', 'orange']),
    track('9. ', ['Daisy (3:07) - 10 → Absolute Cinema', 'gray_background']),
    track('10. ', ['In A Jar (3:06) - 8 → 10 (Yeah you read this right)', 'red']),
    track('11. ', ['Noro (6:27) - 10 → MASTERPIECE', 'gray_background']),
  ]),
  heading('Final Thoughts', [
    para('Some thoughts: lots of them.'),
    block('paragraph', [rt('Production: 10', 'green')]),
    block('paragraph', [rt('Individual Ratings: 9.75', 'yellow')]),
    block('paragraph', [rt('Creativity: 10', 'orange')]),
    block('paragraph', [rt('Experience: 10', 'red')]),
    block('paragraph', [rt('Final Score:', 'gray'), rt(' ', 'gray'), rt('9.95')]),
  ]),
]);

test('title: strips the emoji placeholder and splits artist / album', () => {
  assert.deepEqual(parseTitle('Brand New - Daisy ‣'), { name: 'Brand New - Daisy', artist: 'Brand New', album: 'Daisy' });
  assert.equal(daisy.name, 'Brand New - Daisy');
});

test('rating chain: the last number wins, words after it are ignored', () => {
  assert.equal(parseRatingChain('8.5 → 9').rating, 9);
  assert.equal(parseRatingChain('8 → 10 (Yeah you read this right)').rating, 10);
  assert.equal(parseRatingChain('10 → MASTERPIECE').rating, 10);
  assert.equal(parseRatingChain('10**').stars, '**');
});

test('stars only make a tier after a 10', () => {
  const line = text => parseSongLine(simplifyBlock(track(text)));
  assert.deepEqual([line('Ask - 10*').rating, line('Ask - 10*').tier], [10, 'atc']);
  assert.deepEqual([line('Ask - 10**').rating, line('Ask - 10**').tier], [10, 'special']);
  assert.deepEqual([line('Stretch Out and Wait - 8.5*').rating, line('Stretch Out and Wait - 8.5*').tier], [8.5, null]);
  assert.deepEqual([line('Panic - 9 → 9.5**').rating, line('Panic - 9 → 9.5**').tier], [9.5, null]);
});

test('reads every track with number, title, length and final rating', () => {
  assert.equal(daisy.tracks.length, 11);
  assert.deepEqual(daisy.tracks[0], { n: 1, title: 'Vices', length: '3:24', rating: 9, tier: null, excluded: false });
  assert.equal(daisy.tracks[4].title, 'You Stole');
});

test('gray background (brown) = Above The Clouds, counts as 10', () => {
  assert.deepEqual(daisy.tracks.filter(t => t.tier === 'atc').map(t => t.title), ['At The Bottom', 'Daisy', 'Noro']);
});

test('(x) tracks are kept but not counted; Individual is the raw average', () => {
  assert.equal(daisy.tracks[5].excluded, true);
  assert.equal(daisy.scores.individual, 9.75);
});

test('final score is raw and matches the page, no warnings', () => {
  assert.ok(Math.abs(daisy.final.album - 9.95) < 1e-9);
  assert.deepEqual(daisy.warnings, []);
});

test('Meat Is Murder: bonus tracks, unrounded Individual, mismatch warning', () => {
  const r = page('The Smiths - Meat Is Murder', [
    heading('Review', [
      track('1. ', ['The Headmaster Ritual (4:56) - 9', 'orange']),
      track('2. ', ['Rusholme Ruffians (4:21) - 8.5', 'yellow']),
      track('3. ', ["I Want the One I Can't Have (3:14) - 9", 'orange']),
      track('4. ', ['What She Said (2:43) - 8.25', 'yellow']),
      track('5. ', ["That Joke Isn't Funny Anymore (4:58) - 8.5", 'yellow']),
      track('6. ', ['Nowhere Fast (2:38) - 9', 'orange']),
      track('7. ', ['Well I Wonder (4:00) - 10', 'red']),
      track('8. ', ['Barbarism Begins at Home (6:54) - 8.75', 'yellow']),
      track('9. ', ['Meat Is Murder (6:14) - 8', 'yellow']),
    ]),
    heading('Final Thoughts', [
      block('paragraph', [rt('Production:', 'green'), rt(' 9.25')]),
      block('paragraph', [rt('Individual Ratings: ', 'yellow'), rt('8.8')]),
      block('paragraph', [rt('Creativity: ', 'orange'), rt('9.5')]),
      block('paragraph', [rt('Experience: ', 'red'), rt('9')]),
      block('paragraph', [rt('Final Score: ', 'gray'), rt('9.17/10')]),
    ]),
    heading('Bonus Tracks', [
      block('bulleted_list_item', [rt('Oscillate Wildly - 10', 'red')]),
      block('bulleted_list_item', [rt('Stretch out and Wait - 8.5', 'yellow')]),
      block('bulleted_list_item', [rt("Shakespeare's Sister - 7.75", 'green')]),
      block('paragraph', []),
    ]),
  ]);
  assert.equal(r.scores.individual, 79 / 9);
  assert.deepEqual(r.bonus.map(b => [b.title, b.rating]), [['Oscillate Wildly', 10], ['Stretch out and Wait', 8.5], ["Shakespeare's Sister", 7.75]]);
  assert.equal(r.kindGuess, 'album');
  // 8.8 is within rounding of 8.778, but the page's 9.17 doesn't match the formula.
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Final Score 9\.17/);
});

test('3 Demos: yellow background = 10**, EP formula', () => {
  const r = page('Brand New - 3 Demos, Reworked', [
    heading('Review', [
      track('1.', [" Brother's Song (3:42) - 9.5 → 10", 'red']),
      track('2. ', ['Missing You (5:21) - 10', 'yellow_background']),
      track('3. ', ['1996 (5:18) - 10', 'gray_background']),
    ]),
    heading('Final Thoughts', [
      block('paragraph', [rt('Individual Ratings: 10', 'yellow')]),
      block('paragraph', [rt('Experience: 10', 'red')]),
      block('paragraph', [rt('Final Score:', 'gray'), rt(' 10/10')]),
    ]),
  ]);
  assert.deepEqual(r.tracks.map(t => t.tier), [null, 'special', 'atc']);
  assert.equal(r.kindGuess, 'ep');
  assert.equal(r.final.ep, 10);
  assert.equal(r.final.album, null);
  assert.deepEqual(r.warnings, []);
});

test('unfinished template: unrated tracks, placeholder bonus line skipped', () => {
  const r = page('Radiohead - Amnesiac', [
    heading('Review', [track('1. Packt Like Sardines In a Crushd Tin Box (4:01) -'), track('2. Pyramid Song (4:49) -')]),
    heading('Final Thoughts', [para('Production: ')]),
    heading('Bonus Tracks', [block('bulleted_list_item', [rt('Add any extra b-sides or unreleased tracks here...')])]),
  ]);
  assert.equal(r.status, 'unfinished');
  assert.deepEqual(r.tracks.map(t => [t.title, t.rating]), [['Packt Like Sardines In a Crushd Tin Box', null], ['Pyramid Song', null]]);
  assert.deepEqual(r.bonus, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(daisy.status, 'complete');
});

test('lines it cannot read become warnings, not crashes', () => {
  const r = page('X - Y', [heading('Review', [track('1. ', 'Interlude (0:45)')])]);
  assert.equal(r.tracks.length, 0);
  assert.equal(r.warnings.length, 2); // unreadable track + no Final Thoughts
});

test('page ID from any kind of Notion link', () => {
  const id = '3dc007e8-bb6e-81db-8d75-db6a64c7b6a8';
  assert.equal(pageIdFrom('https://app.notion.com/p/3dc007e8bb6e81db8d75db6a64c7b6a8?pvs=204'), id);
  assert.equal(pageIdFrom('https://www.notion.so/Brand-New-Daisy-3dc007e8bb6e81db8d75db6a64c7b6a8#abc'), id);
  assert.equal(pageIdFrom(id), id);
  assert.equal(pageIdFrom('not a link'), null);
});

test('"Just the Ratings" pages: tracks are bullets, not toggles', () => {
  const r = page('Oasis - Definitely Maybe', [
    heading('Review', [
      legend,
      block('bulleted_list_item', [rt("1. Rock 'n' Roll Star (5:23) - 9", 'orange')]),
      block('bulleted_list_item', [rt('3. Live Forever (4:37) - 10', 'gray_background')]),
    ]),
    heading('Final Thoughts', [para('Production: 9'), para('Individual Ratings: 9.5'), para('Creativity: 7.5'), para('Experience: 10')]),
  ]);
  assert.deepEqual(r.tracks.map(t => [t.n, t.title, t.rating, t.tier]), [[1, "Rock 'n' Roll Star", 9, null], [3, 'Live Forever', 10, 'atc']]);
  assert.equal(r.status, 'complete');
});

test('older pages: toggles without number or length get numbered by position', () => {
  const r = page('The Smiths - Self Titled', [
    heading('Review', [legend, track(['Reel Around the Fountain - 9', 'orange']), track(["You've Got Everything Now - 8.5", 'yellow'])]),
    heading('Final Thoughts', [para('Production: 9'), para('Creativity: 8.5'), para('Experience: 8.5')]),
  ]);
  assert.deepEqual(r.tracks.map(t => [t.n, t.title, t.length, t.rating]), [[1, 'Reel Around the Fountain', null, 9], [2, "You've Got Everything Now", null, 8.5]]);
});

test('flat template: tracks sit after a plain heading, not inside it', () => {
  const r = parseAlbumPage('The Verve - Forth', [
    { type: 'heading_2', color: 'default', text: [{ text: 'Review', color: 'default' }], children: [] },
    { type: 'paragraph', color: 'default', text: [{ text: 'Red (10) > Orange (9~10)', color: 'default' }], children: [] },
    { type: 'bulleted_list_item', color: 'default', text: [{ text: '1. Sit And Wonder (6:52) -', color: 'default' }], children: [] },
    { type: 'heading_2', color: 'default', text: [{ text: 'Final Thoughts', color: 'default' }], children: [] },
    { type: 'paragraph', color: 'default', text: [{ text: '⭐', color: 'default' }], children: [] },
  ]);
  assert.deepEqual(r.tracks.map(t => [t.title, t.rating]), [['Sit And Wonder', null]]);
  assert.equal(r.status, 'unfinished');
});

test('X / Interlude = deliberately unrated: excluded, page still complete', () => {
  const r = page('Paul Weller - Sonik Kicks', [
    heading('Review', [track('10. ', ['Dragonfly (3:49) - 8', 'yellow']), track('11. Twilight (0:21) - X'), track("12. She Just Won't Believe Me (0:58) - Interlude")]),
    heading('Final Thoughts', [para('Production: 8'), para('Creativity: 8'), para('Experience: 8')]),
  ]);
  assert.deepEqual(r.tracks.map(t => [t.title, t.rating, t.excluded]), [['Dragonfly', 8, false], ['Twilight', null, true], ["She Just Won't Believe Me", null, true]]);
  assert.equal(r.status, 'complete');
  assert.equal(r.scores.individual, 8);
});

test('bonus tracks: notes are skipped, "Title- 8.5" (no space) still reads', () => {
  const r = page('The Jam - The Gift', [
    heading('Bonus Tracks', [
      para('The first three songs here aren’t really from this record - but the timeline fits.'),
      block('bulleted_list_item', [rt('Move On Up- 8.5', 'yellow')]),
      block('bulleted_list_item', [rt('Absolute Beginners - 9', 'orange')]),
    ]),
  ]);
  assert.deepEqual(r.bonus.map(b => [b.title, b.rating]), [['Move On Up', 8.5], ['Absolute Beginners', 9]]);
});

test('Final Thoughts: several scores in one paragraph, one per line', () => {
  const r = page('The Beatles - Revolver', [
    heading('Review', [track('1. ', ['Taxman (2:39) - 9', 'orange'])]),
    heading('Final Thoughts', [para('Production: 10\nIndividual Rating: 9\nCreativity: 10\nExperience: 9.5'), para('Final Score: 9.6/10')]),
  ]);
  assert.deepEqual(r.written, { production: 10, individual: 9, creativity: 10, experience: 9.5, final: 9.6 });
  assert.equal(r.status, 'complete');
});

test('score lines remember their block, label and suffix (for fixing them in Notion)', () => {
  const withId = (id, b) => ({ ...b, id });
  const r = parseAlbumPage('The Smiths - Meat Is Murder', [
    heading('Review', [track('1. ', ['The Headmaster Ritual (4:56) - 9', 'orange'])]),
    heading('Final Thoughts', [
      withId('b-ind', block('paragraph', [rt('Individual Rating: ', 'yellow'), rt('8.8')])),
      withId('b-final', block('paragraph', [rt('Final Score: ', 'gray'), rt('9.17/10')])),
    ]),
  ].map(simplifyBlock));
  assert.deepEqual(r.scoreLines.individual, { id: 'b-ind', type: 'paragraph', label: 'Individual Rating', labelColor: 'yellow', prefix: '', suffix: '' });
  assert.deepEqual(r.scoreLines.final, { id: 'b-final', type: 'paragraph', label: 'Final Score', labelColor: 'gray', prefix: '', suffix: '/10' });
});

test('a paragraph holding several scores is marked shared, not rewritten', () => {
  const r = page('The Beatles - Revolver', [
    heading('Final Thoughts', [para('Production: 10\nIndividual Rating: 9\nCreativity: 10\nExperience: 9.5')]),
  ]);
  assert.deepEqual(r.scoreLines.individual, { shared: true });
  assert.equal(r.written.individual, 9);
});

test('tracks keep their line id and whether their toggle holds a note', () => {
  const withNote = { ...track('1. ', ['Luca (5:15) - 10', 'red']), id: 'aaa-111', has_children: true };
  const noNote = { ...track('2. ', ['Untitled (2:50) - 8.5', 'yellow']), id: 'bbb-222', has_children: false };
  const bonus = { ...track(['Moshi Moshi - 9', 'orange']), id: 'ccc-333', has_children: true };
  const p = page('Brand New - Test', [heading('Review', [withNote, noNote]), heading('Bonus Tracks', [bonus])]);
  assert.equal(p.tracks[0].block, 'aaa-111');
  assert.equal(p.tracks[0].note, true);
  assert.equal(p.tracks[1].block, 'bbb-222');
  assert.equal(p.tracks[1].note, undefined);
  assert.equal(p.bonus[0].block, 'ccc-333');
  assert.equal(p.bonus[0].note, true);
});

test('score lines with re-rates: the last number wins, earlier ones are kept for fixes', () => {
  assert.deepEqual(parseScoreLine('Production: 9.5 → 10'),
    { key: 'production', label: 'Production', value: 10, before: '9.5 → ', after: '' });
  assert.deepEqual(parseScoreLine('Individual Ratings: 9.47→ 9.5'),
    { key: 'individual', label: 'Individual Ratings', value: 9.5, before: '9.47→ ', after: '' });
  assert.deepEqual(parseScoreLine('Final Score: 9.04→ 9.71/10'),
    { key: 'final', label: 'Final Score', value: 9.71, before: '9.04→ ', after: '/10' });
  assert.deepEqual(parseScoreLine('Experience: 9.0 -> 10'),
    { key: 'experience', label: 'Experience', value: 10, before: '9.0 -> ', after: '' });
  assert.deepEqual(parseScoreLine('Final Score: 9.17/10'),
    { key: 'final', label: 'Final Score', value: 9.17, before: '', after: '/10' });
  assert.equal(parseScoreLine('Production: great'), null);
});
