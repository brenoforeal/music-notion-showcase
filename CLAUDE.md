# Music | Notion project

A personal music-review system built around Notion. I'm learning as I go,
so treat me as a beginner who wants to understand the code, not just get it.

## How to work with me
- Before each change, explain in plain language WHAT you're changing and WHY.
- Teach the concept behind it (e.g. "this is a KV namespace, it works like...").
  Keep explanations short; one or two key ideas per change is enough.
- Make small, focused changes. One feature or fix at a time.
- Show me a short plan before touching more than one file.
- ALWAYS ask before: deploying (`wrangler deploy`), deleting files or KV data,
  running git push, or anything that can't be undone.
- After each task, give me a short summary: files changed, what I should test,
  and one thing I learned.
- If I'm about to do something risky (leaking a token, deleting data), stop me.

## Project structure
- `worker/` — main Cloudflare Worker, deployed as `notion-proxy` (config in
  `wrangler.toml`). Routes: Lyric of the Day, Song of the Day,
  ranking (`/ranking`, `/publish`), admin pages behind `/login`.
  Uses KV namespaces `RANKING_KV` and `SONG_KV`, secrets `PUBLISH_SECRET`
  and `NOTION_TOKEN` (Song of the Day notes). Scheduled (cron, daily 21:00 UTC)
  refreshes the picks.
  - Song of the Day (`song.js`, pool in `song-pool.js`, page in `song-pages.js`):
    a random 9+ song (10*/10** = 10) with a note from the published ranking data
    (album/EP/bonus tracks, once per Notion line `block`), not picked before;
    starts over when all are used. The note's text is read from Notion with
    `NOTION_TOKEN` when picked and stored in the pick. Page: cover, rating,
    "Show note" toggle (`<details>`), Open in Notion, Search on YouTube.
    (Replaced the old YouTube playlists; `YOUTUBE_API_KEY` is unused.)
  - `index.js` is only the router; each feature exports `handleX()` that
    returns a Response or null: `auth.js`, `ranking.js`, `lyrics.js`, `song.js`,
    `notion-album.js`, `notion-proxy.js` (catch-all, used by the calculator).
  - `notion-album.js`: `GET /notion-album?page=<link>` (one review page, parsed
    by `album-parser.js`) and `GET /notion-albums` (every "Artist - Album" page
    under Music). Both use the caller's Notion token (Authorization header);
    Notion calls retry on 429. The parsed page includes `scoreLines` (block id,
    label, colour, "/10" suffix of each Final Thoughts score line).
  - `cover-options.js`: `GET /cover-options?artist=&album=` → candidate covers
    (MusicBrainz/Cover Art Archive, studio releases first, then Deezer); no login.
  - Page HTML lives in `*-pages.js` / `ranking-page.js`; shared helpers in `html.js`;
    default lyric groups in `lyric-groups.js`.
  - `/ranking` (`ranking-page.js`, all in the browser): tabs Albums, Artists
    (Main Albums / All Songs), EPs/Compilations, Others, Songs. Every row has
    a cover thumbnail; the top 3 of Final Score (Albums, Artists) get a medal and
    a blurred cover banner (hidden while searching). Rows always show all the
    other scores, not just the active one (a user request). "10s" sub-tabs
    (Albums, Artists, EPs/Compilations, Others) count 10s incl. 10*/10**, with %
    (1 decimal). Artists → All Songs (`allSongsOf`) = every song once incl. EP/comp
    tracks; a demo/live/acoustic version counts only if there's no other copy
    (same title without brackets, or same words in any order: "Yeah (Sowing
    Season) (Demo)" = "Sowing Season (Yeah)"). All Songs and Others leave (x) songs
    out of the count, average and 10s % (Brand New: 74); album/EP 10s keep them. Other songs can be
    marked (x) in the calculator's other-songs list (`excluded`).
    Titles link to the public Notion site (`SITE` = outrageous-tugboat-969.notion.site
    + page id): albums/EPs via `reviewPageId`, songs to their own line (`#<block>`;
    Notion opens the closed toggle), artists via `artistPages` (set with the "Page"
    button in calculator ⚙ Settings → Artist photos and pages). One-offs: "no Notion
    page". Tracks/bonus tracks carry `block` + `note` (toggle has children) from the
    parser; the Songs tab tags songs with a note and filters by it. Covers open the
    same page. "How the ratings work" (header line) = `ratingsPage`, set in calculator
    ⚙ Settings → Ratings System page (default: the Ratings System page id).
    Main Albums has a "Best N only (by Final Score)" tick (shown at 2+ releases,
    N = the filter): every column and the 10s use only each artist's N best albums.
    Songs are deduped once per artist (`buildSongs`: album track > EP/comp track
    > bonus/other; title key drops trailing brackets unless demo/live/acoustic/
    remix…); artist totals, Others and Songs use that list. Ties after every
    score break by % of 10s → 10** → 10* (`tensTiebreak`), then A–Z. Album % = main
    tracklist only; (x) tracks count.
  - Test the worker locally: launch config "worker" (`wrangler dev`, port 8787).
    Its KV is a local copy; refresh it with `wrangler kv key get ranking-data
    --remote` then `kv key put --local`. Local secrets live in `.dev.vars`.
    Run the daily cron by opening `localhost:8787/__scheduled` (`--test-scheduled`).
- `calculator/` — `album-rating.html`, the AlbumCalculator. Data lives in the
  browser's localStorage (not the file); it publishes to the worker.
  - Layout: header (status pills, ⚙ Settings) → Sync from Notion → Calculator
    (one card, Album / EP / Song modes) → Publish (+ "update the 'updated' time"
    checkbox) → collapsed "Ranking and lists" (tabs, search, expandable rows,
    other songs grouped by artist). Settings hold token, passphrase, Import
    all, backups, per-list export, clear, scoring rules.
  - Sync from Notion: paste a page link → preview → Apply. Import all from
    Notion: scans every page (2 at a time, backoff on 429), checklist, downloads
    a full backup (`calculator-backup-<date>.json`, restorable via the albums
    Import JSON button), then applies the ticked pages.
  - `reviewPageId` = the review page; `notionPageId` = the Albums Ranking DB row
    ("Send" button). Bonus tracks go to Others (extras), matched by artist+title.
  - Covers: each album/EP stores `cover` (Notion page icon, from Sync). "Change
    cover" in an expanded row picks from /cover-options or a pasted link; a
    picked cover is `coverPinned` (Sync never replaces it) and also becomes the
    Notion page icon. "Missing covers" filter in the Albums/EPs tabs.
  - Score fixing: when a page's Individual Ratings / Final Score differ from the
    tracks, Sync and Import rewrite that Notion line with the calculated value
    (2 decimals; the calculator keeps raw). On by default, checkbox to skip.
  - Published ranking data (KV `ranking-data`): `albums` (name, artist, title,
    4 categories, `rawScore`, `songs` numbers, `tracks` with tiers, `bonus`,
    `cover`), `others` (EPs/compilations: type, experience, individual, raw
    `score`, tracks, cover), `extras` (other songs: artist, title, individual,
    tier, `fromRelease`), `publishedAt`.
  - Test locally: `.claude/launch.json` serves it on `localhost:5500`.
- `lyrics/<Artist>/<Title>.txt` — my lyrics library, with `[Verse]`/`[Chorus]`
  labels (kept private, not in this repo). See "Lyrics library" below.
- `scripts/` — `lyrics.mjs` (`npm.cmd run lyrics`) and tests (`npm.cmd test`).
- `python/` — Album Page Creator (desktop shortcut "Music Notion > Album Page
  Creator", or `py NotionTemplate.py` in `python/`). `NotionTemplate.py` is the
  menu; options live in `python/album_tools/`:
  [1] new album page from YouTube Music (pick from the top matches),
  [2] generic page (title + pasted tracklist), [3] update an old page to the new
  format (numbers + lengths, adds missing icon/TOC/score lines/Bonus Tracks; only
  rewrites a line's own text, never deletes), [4] find bonus tracks (standard
  tracklist from YouTube Music, other editions from Deezer — YT Music rarely has
  deluxe editions), [5] split an old one-page discography (Weezer) into album
  pages under "Weezer - Discography (NEW)", [6] sync 9+ songs to YouTube Music
  playlists (`playlists.py`: reads KV `ranking-data` via wrangler; album-first
  matching, then song search with same artist + title; matches saved in
  `python/playlist-matches.csv`; "9+ · All" + "9+ · <Artist>" at 10+ songs;
  never removes; login in `python/browser.json`, git-ignored: copy the headers
  from Firefox, since Chrome-copied Google cookies come out logged out). New pages land on the Music page;
  I move them myself. Every option previews and asks y/n first. Created/updated
  pages are logged in `python/created-pages.csv` (not committed).
  Tests: `py -m unittest` in `python/`.

## Lyrics library (how it works)
- Add songs: `npm.cmd run lyrics -- --import` moves `Artist – Title.lyrics.txt`
  files from Downloads into `lyrics/`. `npm.cmd run lyrics` checks + shows coverage;
  `npm.cmd run lyrics -- --upload` sends everything to KV key `lyrics-library`
  (one JSON value, no deploy needed).
- Parser: `worker/lyric-library.js` (shared by worker and script). Sections of
  2–8 lines are eligible; repeated identical choruses are merged. Repetitive
  blocks are skipped (`isRepetitive`: one line ≥ half the block; Brand New only
  when every line is the same), unless a song has nothing else.
- Picking (`worker/lyrics.js`, `groupPool`): per artist — an artist with any
  usable file uses only their files; other artists use the group list + lrclib
  (a whole blank-line block, same parser; 4-line snippet only if no blocks).
  A file only counts if its artist is in some group, and a group needs at least
  one `Artist | Title` line. Songs are shuffled before the "fewest used" sort.
- Cover pins: `lyrics/covers.txt` (`Artist | Title | Album`) is uploaded with the
  library as `covers`; a pinned song gets that album's cover (`findAlbumCover`)
  before the normal lookup. MusicBrainz tags albums like Hatful of Hollow as
  compilations, so pins handle "my favourite home for this song" cases.
- Covers (`worker/covers.js`): MusicBrainz + Cover Art Archive (original
  album/EP, earliest, own releases), else Deezer track search, else my own
  `lyrics/<Artist>/artist.jpg|png|webp` (uploaded to KV `artist-photo:<key>`,
  served at `/artist-photo/<key>`), else Deezer's most-followed artist with that
  name. Don't use iTunes: it answers 429 to Cloudflare's shared servers
  (works locally, fails live). Test lookups on Cloudflare with `wrangler dev --remote`.
  Found album covers are cached in KV `cover-cache-v2` (bump the version when
  lookup rules change). Lyric admin's "Refresh covers" redoes today's covers.
- Tab order on the public pages = group order in Lyric admin's groups editor.
- History stores the whole section, label and cover. Public pages
  (`/lyric-of-the-day`, `/lyric-history`) use tabs; `?group=<id>` / `#<id>`.

## Windows notes
- PowerShell blocks `npm.ps1`/`npx.ps1`: use `npm.cmd` / `npx.cmd`.
- A terminal opened before installing Git/Node needs a PATH reload or app restart.
- Don't round-trip files through PowerShell 5.1 `Get-Content`/`Set-Content`:
  it misreads UTF-8 (— becomes â€”). Use the editor tools or Node.

## Secrets (important)
- Never hardcode tokens. Python reads `NOTION_TOKEN` from `.env`.
- Worker secrets live in Cloudflare (`wrangler secret put`), never in code.
- Never commit `.env`. Check `.gitignore` before every commit.
- Lyrics files stay in a private repo; this public copy has none.

## My Notion conventions
- Album review page sections: Preview, Review, Final Thoughts, Bonus Tracks.
  The page also holds Production, Experience, Creativity and the final score.
- Album tracks (inside Review): `N. Title (m:ss) - 9.5`. Re-rates use arrows,
  `8.5 → 9 (comment)`: the last number wins; words after it are ignored.
- `(x)` on a track = not counted in the Individual average.
- Bonus tracks (written manually): `Title - 9`
- Rating colors: Red = 10, Orange = 9–10, Yellow = 8–9, Green = 7–8,
  Blue = 6–7, Purple = below 6.
- `10*` = "Above The Clouds" (generational song): gray background + brown text.
  `10**` = special song: yellow background + default text. Both count as 10
  but are flagged. The Notion API reports them as `gray_background` and
  `yellow_background` (only the brown ones use gray background).
  A star only means a tier right after a 10 (`8.5*` stays 8.5). My "check this
  again" note is `+` now (old pages may still use `*`, e.g. Louder Than Bombs).
- Individual and Final Score are kept raw (unrounded) everywhere, including
  the public ranking page.
- Pages to sync live under the `Music` page (the one with a site view). Skip
  Weezer's single-page discography for now (separate pages are being made).
  EP vs compilation: ask on import, don't guess.
- Parser: `worker/album-parser.js` (pure, tested in `scripts/album-parser.test.mjs`).

## Roadmap (in order)
1. ✅ Cleanup: worker split into modules, dead code removed, admin login with a
   signed cookie instead of secrets in URLs.
2. ✅ Lyrics library + Lyric of the Day redesign (tabs, covers, history).
   Brand New is fully in the library; The Smiths and Weller still use lrclib.
3. ✅ Calculator sync: read ratings, scores and bonus tracks from Notion pages
   automatically; one-time import of all existing album pages (done 2026-10-16).
4. ✅ Calculator redesign: settings tucked away, one calculator with modes,
   collapsed lists with tabs and compact rows (done 2026-10-16).
5. ✅ Ranking page redesign + Songs tab (covers, medals, 10s tabs, song dedupe,
   Songs tab with search/sort/filters; done 2026-10-17).
6. ✅ Artist photos: calculator ⚙ Settings → "Artist photos" (localStorage
   `artistPhotos`, `{url, guess}`), "Change photo" via `GET /artist-photo-options`
   (Deezer) or a pasted link (incl. `/artist-photo/<key>`), "Find missing photos"
   fills guesses to check; published as `artistPhotos` in `ranking-data`; artist
   rows fall back to the best album cover (done 2026-10-17).

Later (not scheduled):
- 9 album covers are Notion uploads whose links expire (Pet Sounds, Rubber Soul,
  The Smiths, Selling England, stagediver, Exmilitary, Ziggy Stardust, Whatever
  People Say I Am, Who's Next): re-pick them with "Change cover".
- 58 old hand-typed "other songs" duplicate EP/compilation tracks (The Masterplan,
  OKNOTOK, Louder Than Bombs, Brand New demos). The page skips them; deleting them
  from the calculator is optional (ask first).
- `lyrics/Brand New/Untitled.txt` has no labels or blank lines, so it's never picked.
- Delete the old `snippet-game` worker in Cloudflare once nothing uses it.
- `worker/lyric-groups.js` defaults still list Oasis/Weezer (only used if KV is empty).
- Display stays 2 decimals on the ranking; data stays raw. Fine as is.
