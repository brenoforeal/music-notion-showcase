"""Option [6]: keep YouTube Music playlists of my 9+ songs up to date.

Songs come from the published ranking (KV 'ranking-data', the same data /ranking shows).
Each song is matched album first: find its album on YouTube Music, take the track from
that tracklist (right recording, right artist). Songs that aren't there (bonus tracks,
demos, other songs) use a song search that must have the same artist and title.
Matches are saved in python/playlist-matches.csv, so a song is only matched once;
edit a line there to fix one. Nothing is added to YouTube until you say y.

Playlists: "9+ · All" and "9+ · <Artist>" for artists with 10+ songs. Songs that are
already in a playlist (added by hand or before) are left alone; nothing is ever removed.
Adding needs your login: python/browser.json (see BROWSER_HELP), never committed.
"""
import csv
import difflib
import json
import re
import subprocess
from pathlib import Path

from .common import PYTHON_DIR, ask, confirm, find_album, norm, ytmusic

ROOT = PYTHON_DIR.parent
MATCH_FILE = PYTHON_DIR / "playlist-matches.csv"
BROWSER_FILE = PYTHON_DIR / "browser.json"
MIN_RATING = 9
ARTIST_PLAYLIST_MIN = 10
ALL_PLAYLIST = "9+ · All"
FIELDS = ["key", "artist", "title", "status", "videoId", "yt_title", "yt_artist", "yt_album"]

BROWSER_HELP = """To add songs, the tool needs your YouTube Music login (once):
  1. Open music.youtube.com in your browser, logged in.
  Use Firefox: Chrome ties Google logins to itself, so copied Chrome headers come out logged out.
  2. Press F12 -> Network tab, type "browse" in the filter, reload, click a POST request.
  3. In Headers, turn on "Raw" next to Request Headers, then select all of it and copy.
  4. Answer y below and paste the headers when asked (then Enter, Ctrl+Z, Enter on Windows).
This saves python/browser.json. It works like a password: it stays on this computer
(it's git-ignored). If YouTube logs you out later, delete it and do this again."""


# ─────────── which songs (pure) ───────────

# A demo/live/acoustic take is its own recording; "(Remastered 2009)" is not.
VERSION_WORDS = re.compile(r"\b(demo|live|acoustic|remix|session|instrumental|unplugged|reprise)\b", re.I)


def version_tags(title):
    """Version words in a title's brackets or after ' - ' (YouTube writes 'Song - Live').
    'Live Forever' has none; 'Live Forever (Live)' has {'live'}."""
    extra = " ".join(re.findall(r"[\(\[]([^)\]]*)[\)\]]", title))
    if " - " in title:
        extra += " " + title.split(" - ", 1)[1]
    return {w.lower() for w in VERSION_WORDS.findall(extra)}


def song_key(artist, title):
    """One key per recording: 'Bed (Remastered)' = 'Bed', but 'Bed (Demo)' is separate."""
    return norm(artist) + "|" + norm(title) + "|" + ",".join(sorted(version_tags(title)))


def _rating(t):
    r = t.get("rating")
    return r if isinstance(r, (int, float)) else t.get("individual")


def build_songs(data, min_rating=MIN_RATING):
    """Every song rated min_rating+ once, album tracks first (like the ranking):
    [{key, artist, title, release, rating}]. release = album/EP it's from, or None."""
    out, seen = [], set()

    def add(t, artist, release):
        r = _rating(t)
        if not t.get("title") or not isinstance(r, (int, float)) or r < min_rating:
            return
        key = song_key(artist, t["title"])
        if key in seen:
            return
        seen.add(key)
        out.append({"key": key, "artist": artist, "title": t["title"], "release": release, "rating": r})

    releases = (data.get("albums") or []) + (data.get("others") or [])
    for r in releases:
        for t in r.get("tracks") or []:
            add(t, r.get("artist", ""), r.get("title") or r.get("name"))
    for r in releases:
        for t in r.get("bonus") or []:
            add(t, r.get("artist", ""), r.get("title") or r.get("name"))
    for x in data.get("extras") or []:
        add(x, x.get("artist", ""), x.get("fromRelease"))
    return out


# ─────────── is it the same song? (pure) ───────────

def same_song(ours, theirs, loose=False):
    """Same title (ignoring case, accents, '(Remastered)'...) and the same version words.
    loose=True also accepts small spelling differences ('Sic Transit Gloria...Glory Fades')."""
    if version_tags(ours) != version_tags(theirs):
        return False
    a, b = norm(ours), norm(theirs.split(" - ")[0])
    if a == b:
        return True
    return loose and difflib.SequenceMatcher(None, a, b).ratio() >= 0.88


def match_track(title, tracks):
    """The track from an album tracklist [{title, videoId}] that is this song, or None."""
    for loose in (False, True):
        for t in tracks:
            if t.get("videoId") and same_song(title, t.get("title", ""), loose):
                return t
    return None


def judge_result(artist, title, result):
    """A YouTube Music song search result -> 'ok' (same artist and song), 'doubtful'
    (same artist, title only close) or None (not it)."""
    artists = [a.get("name", "") for a in result.get("artists") or []]
    if not result.get("videoId") or not any(norm(a) == norm(artist) for a in artists):
        return None
    if same_song(title, result.get("title", "")):
        return "ok"
    if same_song(title, result.get("title", ""), loose=True):
        return "doubtful"
    return None


def video_id_from(link):
    """A YouTube / YouTube Music link (or a bare 11-character id) -> the video id, or None."""
    link = str(link).strip()
    m = re.search(r"(?:[?&]v=|youtu\.be/)([\w-]{11})", link)
    if m:
        return m.group(1)
    return link if re.fullmatch(r"[\w-]{11}", link) else None


def tidy_headers(raw):
    """Copied request headers -> 'key: value' lines. Chrome's panel copies them as a key
    line then a value line (and starts with ':authority', ':method'... which we drop);
    Firefox's Raw view is already 'key: value'."""
    lines = [l.strip() for l in str(raw).replace("\r", "").split("\n") if l.strip()]
    if sum(": " in l for l in lines) >= len(lines) / 2:
        return "\n".join(l for l in lines if not l.startswith(":"))
    out = []
    for key, value in zip(lines[0::2], lines[1::2]):
        key = key.rstrip(":").strip()
        if key and not key.startswith(":"):
            out.append(f"{key}: {value}")
    return "\n".join(out)


def clean_headers(headers):
    """Drops copied headers that break the tool's own requests: compression ones
    ('content-encoding: gzip' says our request is compressed, which it isn't, so YouTube
    answers something unreadable) and Chrome's ':authority'/':path' lines."""
    drop = {"accept-encoding", "content-encoding", "content-length", "host"}
    return {k: v for k, v in headers.items()
            if k.lower() not in drop and not k.startswith(":") and "/" not in k and "." not in k}


def playlist_plan(songs, matches, threshold=ARTIST_PLAYLIST_MIN):
    """{playlist name: [{videoId, artist, title, yt_title}] in order}: everything matched in
    "9+ · All", plus one playlist per artist with threshold+ songs rated 9+ (matched or not)."""
    plan = {ALL_PLAYLIST: []}
    counts = {}
    for s in songs:
        counts[s["artist"]] = counts.get(s["artist"], 0) + 1
    for s in songs:
        m = matches.get(s["key"])
        if not m or not m.get("videoId"):
            continue
        entry = {"videoId": m["videoId"], "artist": s["artist"], "title": s["title"], "yt_title": m.get("yt_title") or ""}
        plan[ALL_PLAYLIST].append(entry)
        if counts[s["artist"]] >= threshold:
            plan.setdefault("9+ · " + s["artist"], []).append(entry)
    return plan


def _track_keys(tracks):
    """Song keys of a playlist's tracks, one per credited artist."""
    return {song_key(a.get("name", ""), t.get("title", "")) for t in tracks for a in t.get("artists") or []}


def missing_from(wanted, tracks):
    """The wanted entries that aren't in the playlist yet. YouTube Music often stores a
    playlist song under a different video id than the album track we matched, so a song
    also counts as there when the same artist + title is (demos and lives stay separate)."""
    ids = {t.get("videoId") for t in tracks}
    keys = _track_keys(tracks)
    out, seen = [], set()
    for w in wanted:
        if w["videoId"] in seen:
            continue
        seen.add(w["videoId"])
        there = w["videoId"] in ids or song_key(w["artist"], w["title"]) in keys or \
            (w.get("yt_title") and song_key(w["artist"], w["yt_title"]) in keys)
        if not there:
            out.append(w)
    return out


def extra_count(wanted, tracks):
    """How many playlist tracks are none of the wanted songs (e.g. dropped below 9)."""
    ids = {w["videoId"] for w in wanted}
    keys = {song_key(w["artist"], w["title"]) for w in wanted} | \
        {song_key(w["artist"], w["yt_title"]) for w in wanted if w.get("yt_title")}
    return sum(1 for t in tracks if t.get("videoId") not in ids
               and not (_track_keys([t]) & keys))


# ─────────── files and data ───────────

def load_ranking():
    """The published ranking data, read from Cloudflare KV with the project's own wrangler."""
    wrangler = ROOT / "node_modules" / "wrangler" / "bin" / "wrangler.js"
    run = lambda *args: subprocess.run(["node", str(wrangler), *args], cwd=ROOT,
                                       capture_output=True, text=True, encoding="utf-8")
    get = ("kv", "key", "get", "ranking-data", "--binding", "RANKING_KV", "--remote")
    res = run(*get)
    if res.returncode != 0 and "401" in (res.stderr or "") + (res.stdout or ""):
        # The Cloudflare login lasts about an hour; "kv" doesn't renew it but "whoami" does.
        run("whoami")
        res = run(*get)
    if res.returncode != 0:
        raise RuntimeError("couldn't read the ranking from Cloudflare: " + (res.stderr or "").strip()[-300:])
    return json.loads(res.stdout)


def load_matches():
    if not MATCH_FILE.exists():
        return {}
    with open(MATCH_FILE, newline="", encoding="utf-8") as f:
        return {row["key"]: row for row in csv.DictReader(f)}


def save_matches(matches):
    with open(MATCH_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for row in sorted(matches.values(), key=lambda r: (r["artist"].lower(), r["title"].lower())):
            w.writerow({k: row.get(k, "") for k in FIELDS})


def _row(song, status, video_id="", yt_title="", yt_artist="", yt_album=""):
    return {"key": song["key"], "artist": song["artist"], "title": song["title"], "status": status,
            "videoId": video_id, "yt_title": yt_title, "yt_artist": yt_artist, "yt_album": yt_album}


# ─────────── step 1: albums ───────────

def match_by_album(todo, matches):
    """Looks up each release once and takes its songs from the tracklist.
    Exact albums (same artist and title) are accepted together; the rest one by one."""
    groups = {}
    for s in todo:
        if s["release"]:
            groups.setdefault((s["artist"], s["release"]), []).append(s)
    if not groups:
        return
    print(f"\nLooking up {len(groups)} album(s) on YouTube Music...")
    found = []
    for i, ((artist, release), songs) in enumerate(groups.items(), 1):
        try:
            album = find_album(artist, release)
        except Exception as e:
            print(f"  {artist} - {release}: lookup failed ({e})")
            album = None
        hits = {s["key"]: match_track(s["title"], album["tracks"]) for s in songs} if album else {}
        exact = bool(album) and norm(album["artist"]) == norm(artist) and \
            norm(album["title"], keep_brackets=True) == norm(release, keep_brackets=True)
        found.append((artist, release, songs, album, hits, exact))
        print(f"  {i}/{len(groups)}", end="\r")

    def describe(artist, release, songs, album, hits):
        n = sum(1 for h in hits.values() if h)
        if not album:
            return f"{artist} - {release}: not found"
        return (f"{artist} - {release} -> {album['artist']} - {album['title']} ({album['year']}), "
                f"{n}/{len(songs)} song(s) found")

    def accept(songs, album, hits):
        for s in songs:
            t = hits.get(s["key"])
            if t:
                matches[s["key"]] = _row(s, "album", t["videoId"], t["title"], album["artist"], album["title"])

    good = [f for f in found if f[5]]
    other = [f for f in found if not f[5]]
    print(" " * 20)
    if good:
        print(f"Exact album matches ({len(good)}):")
        for artist, release, songs, album, hits, _ in good:
            print("  ✓ " + describe(artist, release, songs, album, hits))
        if confirm(f"Use these {len(good)} albums?"):
            for artist, release, songs, album, hits, _ in good:
                accept(songs, album, hits)
        else:
            other = found
    for artist, release, songs, album, hits, _ in other:
        while True:
            print("\n  ⚠ " + describe(artist, release, songs, album, hits))
            if album:
                for s in songs:
                    t = hits.get(s["key"])
                    print(f"      {s['title']}  ->  {t['title'] if t else '(not on this album)'}")
            choice = ask("  [y] use it  [s] search with other words  [n] skip (song search later)", "n").lower()
            if choice == "y" and album:
                accept(songs, album, hits)
                break
            if choice == "s":
                query = ask("  Search albums for")
                try:
                    album = find_album("", query) if query else album
                except Exception as e:
                    print(f"  Lookup failed: {e}")
                hits = {s["key"]: match_track(s["title"], album["tracks"]) for s in songs} if album else {}
                continue
            break
    save_matches(matches)


# ─────────── step 2: single songs ───────────

def match_by_search(todo, matches):
    """Song search for what the albums didn't cover. Same artist + same song is accepted
    after one y/n for all of them; doubtful or missing ones are asked one by one."""
    if not todo:
        return
    yt = ytmusic()
    print(f"\nSearching {len(todo)} song(s) on YouTube Music...")
    sure, unsure = [], []
    for i, s in enumerate(todo, 1):
        best = None
        try:
            for r in yt.search(f"{s['artist']} {s['title']}", filter="songs", limit=10):
                verdict = judge_result(s["artist"], s["title"], r)
                if verdict == "ok":
                    best = ("ok", r)
                    break
                if verdict == "doubtful" and not best:
                    best = ("doubtful", r)
        except Exception as e:
            print(f"  {s['artist']} - {s['title']}: search failed ({e})")
        (sure if best and best[0] == "ok" else unsure).append((s, best[1] if best else None))
        print(f"  {i}/{len(todo)}", end="\r")
    print(" " * 20)

    def row_for(s, r, status):
        album = (r.get("album") or {}).get("name", "")
        artist = ", ".join(a.get("name", "") for a in r.get("artists") or [])
        return _row(s, status, r["videoId"], r.get("title", ""), artist, album)

    if sure:
        print(f"Found with the same artist and title ({len(sure)}):")
        for s, r in sure:
            print(f"  ✓ {s['artist']} - {s['title']}  ->  {r.get('title')} [{(r.get('album') or {}).get('name', 'single')}]")
        if confirm(f"Use these {len(sure)}?"):
            for s, r in sure:
                matches[s["key"]] = row_for(s, r, "search")
        else:
            unsure = sure + unsure
        save_matches(matches)
    for s, r in unsure:
        print(f"\n  ⚠ {s['artist']} - {s['title']}  (from {s['release'] or 'no release'})")
        if r:
            print(f"      closest: {r.get('title')} - {', '.join(a.get('name', '') for a in r.get('artists') or [])}"
                  f" [{(r.get('album') or {}).get('name', 'single')}]")
        choice = ask("  [y] use it  [l] paste a link  [n] skip (won't ask again)  [Enter] decide later", "").lower()
        if choice == "y" and r:
            matches[s["key"]] = row_for(s, r, "search")
        elif choice == "l":
            vid = video_id_from(ask("  YouTube Music link"))
            if vid:
                matches[s["key"]] = _row(s, "manual", vid)
            else:
                print("  That isn't a YouTube link; asking again next time.")
        elif choice == "n":
            matches[s["key"]] = _row(s, "skip")
        save_matches(matches)


# ─────────── step 3: playlists ───────────

def logged_in(yt):
    """True when YouTube treats our requests as you (its replies carry a logged_in flag).
    A logged-out client still 'works', it just sees an empty library."""
    r = yt._send_request("browse", {"browseId": "FEmusic_liked_playlists"})
    for service in (r.get("responseContext") or {}).get("serviceTrackingParams") or []:
        for p in service.get("params") or []:
            if p.get("key") == "logged_in":
                return p.get("value") == "1"
    return True  # no flag in the reply: don't block on it


def login():
    """(YTMusic logged in as you, {playlist title: id}) or (None, None).
    Sets up python/browser.json when it's missing or doesn't work (you paste the headers)."""
    from ytmusicapi import YTMusic, setup
    # Headers pasted straight into browser.json (instead of through the prompt) are plain
    # text, not JSON: convert them in place. Chrome's two-lines-per-header copy works too.
    if BROWSER_FILE.exists():
        text = BROWSER_FILE.read_text(encoding="utf-8", errors="ignore").replace("\r", "")
        try:
            json.loads(text)
        except ValueError:
            try:
                setup(filepath=str(BROWSER_FILE), headers_raw=tidy_headers(text))
                print("Converted the pasted headers in browser.json.")
            except Exception as e:
                print(f"browser.json isn't usable ({e}).")
    for attempt in (1, 2):
        if BROWSER_FILE.exists():
            try:
                yt = YTMusic(clean_headers(json.loads(BROWSER_FILE.read_text(encoding="utf-8-sig"))))
                if not logged_in(yt):
                    raise RuntimeError("YouTube sees these headers as logged out. Chrome ties Google "
                                       "logins to the browser, so copy them from Firefox instead")
                return yt, {p.get("title"): p.get("playlistId") for p in yt.get_library_playlists(limit=None)}
            except Exception as e:
                print(f"\nCouldn't log in to YouTube Music ({e}). The login may be expired or incomplete.")
        if attempt == 2:
            break
        print("\n" + BROWSER_HELP)
        if not confirm("Set up the login now?"):
            break
        print("Paste the headers, then press Enter, Ctrl+Z, Enter:")
        pasted = []
        while True:
            try:
                pasted.append(input())
            except EOFError:
                break
        try:
            setup(filepath=str(BROWSER_FILE), headers_raw=tidy_headers("\n".join(pasted)))
        except Exception as e:
            print(f"That didn't work: {e}")
            break
    return None, None


def update_playlists(songs, matches):
    yt, existing = login()
    if not yt:
        return

    plan = playlist_plan(songs, matches)
    work = []
    print("\nPlaylists:")
    for name, wanted in plan.items():
        if not wanted:
            continue
        pid = existing.get(name)
        tracks = (yt.get_playlist(pid, limit=None).get("tracks") or []) if pid else []
        missing = missing_from(wanted, tracks)
        extra = extra_count(wanted, tracks)
        note = f", {extra} not 9+ anymore (left alone)" if extra else ""
        if pid:
            print(f"  {name}: {len(missing)} to add ({len(tracks)} already in it{note})")
            for w in missing[:15]:
                print(f"      + {w['artist']} - {w['title']}")
            if len(missing) > 15:
                print(f"      ... and {len(missing) - 15} more")
        else:
            print(f"  {name}: new playlist, {len(missing)} songs")
        if missing:
            work.append((name, pid, [w["videoId"] for w in missing]))
    if not work:
        print("Everything is already in its playlists.")
        return
    if not confirm("Add these to YouTube Music? (new playlists are private)"):
        return
    for name, pid, missing in work:
        if not pid:
            pid = yt.create_playlist(name, "My songs rated 9+ (from my Notion reviews).")
            if not isinstance(pid, str):
                print(f"  {name}: couldn't create it ({pid})")
                continue
        added, failed = 0, 0
        for i in range(0, len(missing), 50):  # YouTube accepts batches; keep them small
            batch = missing[i:i + 50]
            res = yt.add_playlist_items(pid, batch, duplicates=False)
            # YouTube rejects a whole batch if anything in it fails, so check every reply.
            if isinstance(res, dict) and res.get("status") == "STATUS_SUCCEEDED":
                added += len(batch)
            else:
                failed += len(batch)
        print(f"  {'✓' if not failed else '⚠'} {name}: added {added}"
              + (f", {failed} failed (YouTube refused that batch; run [6] again)" if failed else ""))


# ─────────── the menu option ───────────

def sync_playlists():
    print("Reading the published ranking...")
    songs = build_songs(load_ranking())
    matches = load_matches()
    artists = {}
    for s in songs:
        artists[s["artist"]] = artists.get(s["artist"], 0) + 1
    big = sum(1 for n in artists.values() if n >= ARTIST_PLAYLIST_MIN)
    todo = [s for s in songs if s["key"] not in matches]
    print(f"{len(songs)} songs rated {MIN_RATING}+ from {len(artists)} artists "
          f"({big} with {ARTIST_PLAYLIST_MIN}+ songs get their own playlist).")
    print(f"Already matched: {len(songs) - len(todo)}. To match now: {len(todo)}.")

    if todo and confirm("Match the new songs on YouTube Music now?"):
        match_by_album(todo, matches)
        match_by_search([s for s in todo if s["key"] not in matches], matches)

    skipped = [s for s in songs if (matches.get(s["key"]) or {}).get("status") == "skip"]
    later = [s for s in songs if s["key"] not in matches]
    if skipped:
        print(f"\nSkipped on purpose: {len(skipped)} (status 'skip' in {MATCH_FILE.name}).")
    if later:
        print(f"Not matched yet: {len(later)} (asked again next time).")
    update_playlists(songs, matches)
