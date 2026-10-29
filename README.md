# Music | Notion

A personal music-review system built around Notion. I review albums in Notion;
this project reads those pages, calculates the scores, keeps them consistent,
and publishes a ranking website, plus a daily "Song of the Day" and "Lyric of
the Day".

I wrote the first versions of the score calculator and the ranking page myself
(JavaScript, HTML, CSS). I then used Claude Code as a pair programmer to turn
them into the system below.

> This is a public showcase copy. My lyrics library (copyrighted text) and a
> few private files are not included.

## What it does

- **Notion sync:** paste a review page link and the calculator reads the track
  ratings, category scores and bonus tracks through the Notion API. An
  "Import all" option scans every review page at once (2 requests at a time,
  with backoff when Notion answers HTTP 429).
- **Score fixing:** if a page's written Individual or Final Score doesn't match
  its tracks, the sync rewrites that line in Notion with the calculated value.
- **Ranking website:** tabs for albums, artists, EPs/compilations, other songs
  and all songs, with covers, search, filters, medals for the top 3 and
  tie-breaking by the share of 10/10 songs. Songs are de-duplicated across
  albums, EPs and demo/live versions.
- **Song of the Day / Lyric of the Day:** a daily scheduled job (cron) picks a
  highly rated song that hasn't been picked before, with its review note.
- **Album Page Creator (Python):** a command-line menu that builds a new Notion
  review page from YouTube Music data, updates old pages to the current format,
  finds bonus tracks (Deezer) and syncs top-rated songs to YouTube Music
  playlists. Every action shows a preview and asks before writing.

## How it's built

| Part | Tech | Folder |
|---|---|---|
| API + public pages | Cloudflare Workers, KV storage, cron trigger | `worker/` |
| Score calculator | Single HTML page, vanilla JS, localStorage | `calculator/` |
| Page creator | Python, Notion API, YouTube Music, Deezer | `python/` |
| Tests | `node --test`, Python `unittest` | `scripts/`, `python/tests/` |

`worker/index.js` is only a router: each feature lives in its own module and
exports a `handleX()` that returns a response or `null`. The Notion page parser
(`worker/album-parser.js`) is a pure function, so it can be tested without any
network calls.

## Engineering approach

- **Living documentation:** [`CLAUDE.md`](CLAUDE.md) records the architecture,
  data shapes, conventions and safety rules. Every AI session starts from it, so
  I don't re-explain the project and spend fewer tokens.
- **Small, planned changes:** one feature or fix at a time, with a short plan
  first and tests before each commit.
- **Local first:** the worker runs locally (`wrangler dev`) against a copy of the
  real data before anything is deployed.
- **Context management:** a new AI session per task, and a skills plugin for
  planning, systematic debugging and test-first work.
- **Secrets stay out of code:** tokens live in Cloudflare secrets or a
  git-ignored `.env`; admin pages use a signed login cookie.

## Running it

Worker (needs a Cloudflare account and your own KV namespaces in `wrangler.toml`):

```bash
npm install
npx wrangler dev
```

Tests:

```bash
npm test
```

```bash
cd python && python -m unittest
```

Python tools: copy `python/.env.example` to `python/.env`, add a Notion
integration token, then run `python NotionTemplate.py` in `python/`.

The calculator is a static page: open `calculator/album-rating.html` and set
`PROXY_URL` to your own worker address.
