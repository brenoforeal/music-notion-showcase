// Checks the lyrics/ folder, shows coverage per Lyric of the Day group,
// and (with --upload) sends the library to KV as one value: "lyrics-library".
//
//   npm run lyrics                  check files + coverage (reads groups from KV)
//   npm run lyrics -- --upload      same, then upload to Cloudflare
//   npm run lyrics -- --offline     skip reading groups from KV
//   npm run lyrics -- --dir <path>  use another lyrics folder (for testing)
//   npm run lyrics -- --import [folder]
//       first move "Artist – Title.lyrics.txt" files (from the Save lyrics
//       bookmarklet, tools/save-lyrics-bookmarklet.html) from Downloads into lyrics/
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, renameSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseLyricsText, eligibleSections, normalizeKey, songKey, parseCoverOverrides } from '../worker/lyric-library.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const upload = args.includes('--upload');
const offline = args.includes('--offline');
const argAfter = flag => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const LYRICS_DIR = argAfter('--dir') || join(ROOT, 'lyrics');
const OUT = join(ROOT, 'build', 'lyrics-library.json');

// 0. Import bookmarklet downloads: "Brand New – Jesus Christ.lyrics.txt" (or "... (1).lyrics.txt")
if (args.includes('--import')) {
  const from = argAfter('--import') || join(homedir(), 'Downloads');
  const DOWNLOAD = /^(.+?) [–-] (.+?)(?: \(\d+\))?\.lyrics(?: \(\d+\))?\.txt$/i;
  const files = readdirSync(from)
    .filter(f => DOWNLOAD.test(f))
    .map(f => ({ f, t: statSync(join(from, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t); // oldest first, so a re-download of the same song wins
  // Reuse an existing artist folder even if the case differs ("Brand new" -> "Brand New").
  const existingDirs = existsSync(LYRICS_DIR) ? readdirSync(LYRICS_DIR) : [];
  console.log(`\nImporting ${files.length} file(s) from ${from}`);
  for (const { f } of files) {
    // Non-breaking spaces from Genius ("The Smiths") become normal ones, so no look-alike folders.
    const [artistRaw, title] = f.match(DOWNLOAD).slice(1).map(s => s.replace(/\s+/g, ' '));
    const artist = existingDirs.find(d => normalizeKey(d) === normalizeKey(artistRaw)) || artistRaw.trim();
    const destDir = join(LYRICS_DIR, artist);
    mkdirSync(destDir, { recursive: true });
    if (!existingDirs.includes(artist)) existingDirs.push(artist);
    const dest = join(destDir, title.trim() + '.txt');
    const existed = existsSync(dest);
    try { renameSync(join(from, f), dest); }
    catch { copyFileSync(join(from, f), dest); unlinkSync(join(from, f)); }
    console.log(`  ${existed ? 'updated' : 'added  '} ${artist}/${title.trim()}.txt`);
  }
}

// Runs the project's own wrangler with Node directly (no shell involved).
function wrangler(wranglerArgs) {
  const bin = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  return execFileSync(process.execPath, [bin, ...wranglerArgs], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
}

// 1. Read and parse every lyrics/<Artist>/<Title>.txt
const songs = {};
const problems = [];
let artistDirs = [];
try {
  artistDirs = readdirSync(LYRICS_DIR).filter(d => statSync(join(LYRICS_DIR, d)).isDirectory());
} catch {
  console.error(`No lyrics folder at ${LYRICS_DIR}`);
  process.exit(1);
}
for (const artist of artistDirs) {
  for (const file of readdirSync(join(LYRICS_DIR, artist))) {
    if (extname(file).toLowerCase() !== '.txt') continue;
    const title = basename(file, extname(file));
    const where = `${artist}/${file}`;
    const { sections, warnings } = parseLyricsText(readFileSync(join(LYRICS_DIR, artist, file), 'utf8'));
    warnings.forEach(w => problems.push(`${where}: ${w}`));
    const key = songKey(artist, title);
    if (songs[key]) problems.push(`${where}: same song as ${songs[key].file}`);
    songs[key] = { artist, title, sections, file: where };
  }
}
// Optional artist photo per folder: lyrics/<Artist>/artist.jpg|png|webp
// (used when no album cover is found).
const PHOTO_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const photos = [];
for (const artist of artistDirs) {
  const file = readdirSync(join(LYRICS_DIR, artist)).find(f => /^artist\.(jpe?g|png|webp)$/i.test(f));
  if (!file) continue;
  const path = join(LYRICS_DIR, artist, file);
  const bytes = readFileSync(path);
  if (bytes.length > 2 * 1024 * 1024) { console.log(`  ! ${artist}/${file}: larger than 2 MB, skipped (resize it)`); continue; }
  const key = normalizeKey(artist);
  const version = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  photos.push({ artist, key, path, type: PHOTO_TYPES[extname(file).toLowerCase()], url: `/artist-photo/${key}?v=${version}` });
}

// Optional cover overrides: lyrics/covers.txt, "Artist | Title | Album" per line.
let coverOverrides = {};
const coversFile = join(LYRICS_DIR, 'covers.txt');
if (existsSync(coversFile)) {
  const { overrides, warnings } = parseCoverOverrides(readFileSync(coversFile, 'utf8'));
  coverOverrides = overrides;
  warnings.forEach(w => problems.push('covers.txt ' + w));
}

const total = Object.keys(songs).length;
const usable = Object.values(songs).filter(s => eligibleSections(s.sections).length).length;
console.log(`\n${total} lyric files, ${usable} with at least one usable section.`);
if (problems.length) {
  console.log(`\nCheck these files:`);
  problems.forEach(p => console.log('  ! ' + p));
}

// 2. Coverage against the live groups (what Lyric admin shows).
if (!offline) {
  let groups = [];
  try {
    groups = JSON.parse(wrangler(['kv', 'key', 'get', 'lyric-groups', '--binding', 'RANKING_KV', '--remote']));
  } catch (e) {
    console.log('\n(Could not read groups from KV; run with --offline to skip.)');
  }
  // Same rule as the worker (groupPool in worker/lyrics.js): an artist with any
  // usable file uses only their files; other artists use the group list + lrclib.
  const usableSongs = Object.values(songs).filter(s => eligibleSections(s.sections).length);
  const covered = new Set();
  for (const g of groups) {
    console.log(`\n${g.label}`);
    const artists = [...new Map(g.songs.map(([a]) => [normalizeKey(a), a])).entries()];
    for (const [key, artist] of artists) {
      const files = usableSongs.filter(s => normalizeKey(s.artist) === key);
      const listed = g.songs.filter(([a]) => normalizeKey(a) === key);
      Object.values(songs).forEach(s => { if (normalizeKey(s.artist) === key) covered.add(s.file); });
      if (!files.length) {
        console.log(`  ${artist}: lrclib (${listed.length} listed songs)`);
        continue;
      }
      console.log(`  ${artist}: your files only (${files.length} songs)`);
      const missing = listed.filter(([a, t]) => !files.some(s => songKey(s.artist, s.title) === songKey(a, t))).map(([, t]) => t);
      if (missing.length) {
        console.log(`    listed but no file yet, so not picked: ` + missing.slice(0, 15).join(', ') +
          (missing.length > 15 ? `, ... (${missing.length - 15} more)` : ''));
      }
    }
  }
  const unused = Object.values(songs).filter(s => !covered.has(s.file));
  if (groups.length && unused.length) {
    console.log(`\nNot in any group's artists (won't be picked): ${unused.map(s => s.file).join(', ')}`);
  }
}

// 3. Build the library file.
const library = { updatedAt: new Date().toISOString(), songs: {}, artists: {}, covers: coverOverrides };
const overrideCount = Object.keys(coverOverrides).length;
if (overrideCount) console.log(`\nCover overrides (covers.txt): ${overrideCount}`);
for (const [key, s] of Object.entries(songs)) {
  library.songs[key] = { artist: s.artist, title: s.title, sections: s.sections };
}
for (const p of photos) library.artists[p.key] = { photo: p.url };
if (photos.length) console.log(`\nArtist photos: ${photos.map(p => p.artist).join(', ')}`);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(library));
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`\nBuilt build/lyrics-library.json (${kb} KB).`);

// 4. Upload (only when asked).
if (upload) {
  // Photos first, so the library never points at a photo that isn't there yet.
  for (const p of photos) {
    console.log(`Uploading photo for ${p.artist}...`);
    wrangler(['kv', 'key', 'put', 'artist-photo:' + p.key, '--path', p.path, '--metadata', JSON.stringify({ type: p.type }),
      '--binding', 'RANKING_KV', '--remote']);
  }
  console.log('Uploading to KV (RANKING_KV / lyrics-library)...');
  wrangler(['kv', 'key', 'put', 'lyrics-library', '--path', OUT, '--binding', 'RANKING_KV', '--remote']);
  console.log('Uploaded. The next pick or Re-roll uses it; no deploy needed.');
} else {
  console.log('Not uploaded. Run "npm run lyrics -- --upload" when ready.');
}
