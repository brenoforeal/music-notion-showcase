// Tests for the Song of the Day pool (9+ songs with a note) and note text. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allSongs, songPool, songLink, noteFromBlocks } from '../worker/song-pool.js';

const PAGE = '3dc007e8-bb6e-8000-0000-000000000001';
const data = {
  albums: [{
    artist: 'Brand New', title: 'Deja Entendu', cover: 'deja.jpg', reviewPageId: PAGE,
    tracks: [
      { title: 'Tautou', rating: 9, block: 'b1', note: true },
      { title: 'Guernica', rating: 10, tier: 'atc', block: 'b2', note: true },
      { title: 'Jaws Theme Swimming', rating: 9.5, block: 'b3' },          // no note
      { title: 'Play Crack the Sky', rating: 8.5, block: 'b4', note: true }, // below 9
      { title: 'No Block', rating: 10, note: true },                        // can't link or read it
    ],
    bonus: [{ title: 'Sad Song', rating: 9, block: 'b5', note: true }],
  }],
  others: [{ artist: 'Brand New', title: 'Leaked Demos', type: 'Compilation', cover: 'demos.jpg', reviewPageId: PAGE,
    tracks: [{ title: 'Brother\'s Song', rating: 9.25, block: 'b6', note: true }] }],
  extras: [
    // The same bonus track also synced into "other songs": counted once.
    { artist: 'Brand New', title: 'Sad Song', individual: 9, block: 'b5', note: true, fromRelease: 'Deja Entendu' },
    { artist: 'Brand New', title: 'Good Man (Demo)', individual: 9.5, block: 'b7', note: true, fromRelease: 'Deja Entendu' },
  ],
};

test('pool: 9+ songs with a note, once per Notion line', () => {
  const pool = songPool(data);
  assert.deepEqual(pool.map(s => s.title).sort(),
    ['Brother\'s Song', 'Good Man (Demo)', 'Guernica', 'Sad Song', 'Tautou']);
});

test('songs keep their release, cover, tier and page', () => {
  const songs = allSongs(data);
  const guernica = songs.find(s => s.title === 'Guernica');
  assert.equal(guernica.release, 'Deja Entendu');
  assert.equal(guernica.cover, 'deja.jpg');
  assert.equal(guernica.tier, 'atc');
  // An extra from a release borrows that release's cover and page.
  const demo = songs.find(s => s.title === 'Good Man (Demo)');
  assert.equal(demo.rating, 9.5);
  assert.equal(demo.cover, 'deja.jpg');
  assert.equal(demo.pageId, PAGE);
});

test('songLink points at the song line on the public site', () => {
  assert.equal(songLink(PAGE, '3dc007e8-bb6e-81a9-ad41-f5b21afa39af'),
    'https://outrageous-tugboat-969.notion.site/3dc007e8bb6e80000000000000000001#3dc007e8bb6e81a9ad41f5b21afa39af');
  assert.equal(songLink(null, 'b1'), null);
});

const rt = (text, annotations = {}, href = null) => ({ plain_text: text, annotations, href });
test('note: text blocks with formatting; empty and non-text blocks dropped', () => {
  const note = noteFromBlocks([
    { type: 'paragraph', paragraph: { rich_text: [rt('The '), rt('best', { bold: true }), rt(' song.')] } },
    { type: 'paragraph', paragraph: { rich_text: [] } },
    { type: 'image', image: {} },
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [rt('bridge', {}, 'https://example.com')] } },
    { type: 'quote', quote: { rich_text: [rt('lyric', { italic: true })] } },
    { type: 'paragraph', paragraph: { rich_text: [rt('bad link', {}, 'javascript:alert(1)')] } },
  ]);
  assert.deepEqual(note, [
    { type: 'p', spans: [{ text: 'The ' }, { text: 'best', b: true }, { text: ' song.' }] },
    { type: 'li', spans: [{ text: 'bridge', href: 'https://example.com' }] },
    { type: 'quote', spans: [{ text: 'lyric', i: true }] },
    { type: 'p', spans: [{ text: 'bad link' }] },
  ]);
});
