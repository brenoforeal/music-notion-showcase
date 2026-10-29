// Tests for which songs a Lyric of the Day group can pick from. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPool } from '../worker/lyrics.js';
import { songKey } from '../worker/lyric-library.js';

const section = n => ({ label: 'Verse', lines: Array.from({ length: n }, (_, i) => 'line ' + i) });
const lib = (artist, title, sections) => ({ [songKey(artist, title)]: { artist, title, sections } });

const group = {
  id: 'mixed',
  songs: [['Brand New', 'Listed With File'], ['Brand New', 'Listed No File'], ['The Smiths', 'Smiths Song']],
};
const library = {
  ...lib('Brand New', 'Listed With File', [section(4)]),
  ...lib('brand new', 'Unlisted File', [section(3)]),
  ...lib('Brand New', 'Too Long Only', [section(12)]),
  ...lib('Oasis', 'Other Artist', [section(4)]),
};

test('artist with files: only their usable files, listed or not', () => {
  const titles = groupPool(group, library).filter(([a]) => a.toLowerCase() === 'brand new').map(([, t]) => t).sort();
  assert.deepEqual(titles, ['Listed With File', 'Unlisted File']);
});

test('artist without files keeps the group list (lrclib)', () => {
  assert.deepEqual(groupPool(group, library).filter(([a]) => a === 'The Smiths'), [['The Smiths', 'Smiths Song']]);
});

test("files by artists outside the group aren't added", () => {
  assert.ok(!groupPool(group, library).some(([a]) => a === 'Oasis'));
});

test('empty library: the group list as is', () => {
  assert.deepEqual(groupPool(group, {}), group.songs);
});
