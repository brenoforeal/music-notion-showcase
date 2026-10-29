"""Shared helpers for the Album Page Creator options.

Page format (see CLAUDE.md, "My Notion conventions"): a review page has Preview,
Review (one toggle per track: "N. Title (m:ss) - 9.5"), Final Thoughts (Production,
Individual Ratings, Creativity, Experience, Final Score) and Bonus Tracks ("Title - 9").
The calculator's parser (worker/album-parser.js) reads exactly this.
"""
import csv
import os
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from notion_client import Client
from ytmusicapi import YTMusic

PYTHON_DIR = Path(__file__).resolve().parent.parent
LOG_FILE = PYTHON_DIR / "created-pages.csv"

# The "Music" page: new pages land here and you move them yourself.
MUSIC_PAGE_ID = "3e0007e8bb6e8072ac46d364067b8b5e"

_notion = None
_ytmusic = None


def notion():
    """The Notion client (created once). Reads NOTION_TOKEN from python/.env."""
    global _notion
    if _notion is None:
        load_dotenv(PYTHON_DIR / ".env")
        token = os.getenv("NOTION_TOKEN")
        if not token:
            sys.exit("NOTION_TOKEN not found. Create python/.env with: NOTION_TOKEN=ntn_...")
        # Same API version as the worker and the calculator.
        _notion = Client(auth=token, notion_version="2022-06-28")
    return _notion


def ytmusic():
    global _ytmusic
    if _ytmusic is None:
        _ytmusic = YTMusic()
    return _ytmusic


# ─────────── prompts ───────────

def ask(prompt, default=""):
    """input() with an optional default shown in [brackets]."""
    shown = f"{prompt} [{default}]: " if default else f"{prompt}: "
    answer = input(shown).strip()
    return answer or default


def confirm(prompt):
    return input(f"{prompt} (y/n): ").strip().lower() in ("y", "yes", "s", "sim")


def page_id_from(link):
    """Any Notion link or ID -> the 32-character page ID, or None."""
    m = re.search(r"([0-9a-f]{32})", str(link).split("?")[0].replace("-", ""), re.I)
    return m.group(1).lower() if m else None


def page_url(page_id):
    return "https://www.notion.so/" + page_id.replace("-", "")


def log_page(action, title, page_id):
    """Adds a line to python/created-pages.csv (date, action, title, link)."""
    new = not LOG_FILE.exists()
    with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["date", "action", "title", "link"])
        w.writerow([datetime.now().strftime("%Y-%m-%d %H:%M"), action, title, page_url(page_id)])


# ─────────── text matching ───────────

def norm(s, keep_brackets=False):
    """Loose key for comparing titles: no accents, case, brackets, punctuation or 'the'.
    "Rock 'n' Roll Star (Remastered)" -> "rock n roll star".
    keep_brackets=True is for album and page names, where the brackets ARE the name:
    "Weezer (Gold Album)" must not match "Weezer (Blue Album)"."""
    s = re.sub(r"['’‘`´]", "", str(s))  # We're / We’re -> Were
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    if not keep_brackets:
        s = re.sub(r"\s*[\(\[][^)\]]*[\)\]]", "", s)  # drop (Remastered 2009), [Live] ...
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("&", " and "))
    s = re.sub(r"^the\s+", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def split_title(page_title):
    """'Brand New - Daisy :emoji:' -> ('Brand New', 'Daisy')."""
    clean = re.sub(r":[\w-]+:", "", page_title).replace("‣", "").strip()
    if " - " in clean:
        artist, album = clean.split(" - ", 1)
        return artist.strip(), album.strip()
    return "", clean


# The dash before a rating: the LAST " - " followed by a number, X / Interlude, or nothing
# (same rule as the calculator's parser), so "Twenty-Two - 9" keeps its title.
RATING_DASH = re.compile(r"\s*[-–]\s*(?=\d|x\b|interlude|n/?a|$)", re.I)


def split_line(text):
    """'3. Bed (3:10) - 9 → 10' -> (3, 'Bed', '3:10', '9 → 10'); None if it isn't a song line.
    The number and the length are optional; the rating part can be empty ('Title -')."""
    text = text.replace("\n", " ").strip()
    n = None
    m = re.match(r"^(\d+)\.\s*(.*)$", text)
    if m:
        n, text = int(m.group(1)), m.group(2)
    dashes = [d for d in RATING_DASH.finditer(text) if d.start() > 0]
    if not dashes:
        return None
    title, rest = text[:dashes[-1].start()], text[dashes[-1].end():]
    length = None
    lm = re.match(r"^(.*?)\s*\((\d{1,2}:\d{2})\)$", title.strip())
    if lm:
        title, length = lm.group(1), lm.group(2)
    title = title.strip()
    return (n, title, length, rest.strip()) if title else None


# ─────────── YouTube Music ───────────

def find_album(artist, album, browse_id=None):
    """Best YouTube Music match for an album -> dict with title, artist, year, cover,
    tracks [{title, duration}] and browseId; None if nothing fits."""
    yt = ytmusic()
    if not browse_id:
        name = artist if re.fullmatch(r"self[- ]?titled", album.strip(), re.I) else album
        results = yt.search(f"{name} {artist}", filter="albums", limit=10)
        def score(r):
            same_artist = any(norm(a.get("name", "")) == norm(artist) for a in r.get("artists") or [])
            exact = norm(r.get("title", ""), keep_brackets=True) == norm(name, keep_brackets=True)  # "Weezer (Red Album)"
            loose = norm(r.get("title", "")) == norm(name)  # "The Beatles (Remastered 2009)" ~ "The Beatles"
            return (not same_artist, not exact, not loose)
        results = sorted(results, key=score)
        if not results:
            return None
        browse_id = results[0]["browseId"]
    d = yt.get_album(browse_id)
    thumbs = d.get("thumbnails") or []
    return {
        "browseId": browse_id,
        "title": d.get("title", ""),
        "artist": (d.get("artists") or [{}])[0].get("name", artist),
        "year": d.get("year", ""),
        "cover": thumbs[-1]["url"] if thumbs else None,
        "tracks": [{"title": t.get("title", ""), "duration": t.get("duration"), "videoId": t.get("videoId")}
                   for t in d.get("tracks") or []],
    }


def choose_album(artist, album, purpose="track lengths and the cover"):
    """Finds the album on YouTube Music and asks you to confirm it; you can search again
    with other words. Returns the album dict, or None to go on without it."""
    query = None
    while True:
        try:
            yt = find_album(artist, album) if query is None else find_album("", query)
        except Exception as e:
            print(f"YouTube Music lookup failed: {e}")
            yt = None
        if yt:
            print(f"YouTube Music: {yt['artist']} - {yt['title']} ({yt['year']}), {len(yt['tracks'])} tracks")
            if confirm(f"Use this album for {purpose}?"):
                return yt
        query = ask("Search YouTube Music for (Enter = go on without it)")
        if not query:
            return None


def length_lookup(yt_tracks):
    """{norm(title): 'm:ss'} for matching page tracks to YouTube Music lengths."""
    return {norm(t["title"]): t["duration"] for t in yt_tracks if t.get("duration")}


# ─────────── Notion reading ───────────

def children(block_id):
    """All child blocks (Notion returns 100 at a time)."""
    out, cursor = [], None
    while True:
        kwargs = {"block_id": block_id, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        r = notion().blocks.children.list(**kwargs)
        out += r["results"]
        if not r.get("has_more"):
            return out
        cursor = r["next_cursor"]


def runs(block):
    """The rich-text runs of a block (empty for images, dividers...)."""
    return (block.get(block["type"]) or {}).get("rich_text") or []


def plain(block):
    return "".join(r.get("plain_text", "") for r in runs(block)).strip()


def page_title(page):
    for prop in page["properties"].values():
        if prop["type"] == "title":
            return "".join(t["plain_text"] for t in prop["title"])
    return ""


# ─────────── Notion writing (block builders) ───────────

def rt(text, color="default", bold=False):
    """One rich-text run."""
    return {"type": "text", "text": {"content": text},
            "annotations": {"color": color, "bold": bold}}


def copy_runs(old_runs):
    """Rich text from a block, rebuilt so it can be written again (keeps colours, bold, links)."""
    out = []
    for r in old_runs:
        a = r.get("annotations") or {}
        link = (r.get("text") or {}).get("link") or (r.get("href") and {"url": r["href"]})
        out.append({"type": "text",
                    "text": {"content": r.get("plain_text", ""), "link": link or None},
                    "annotations": {k: a.get(k, False) for k in ("bold", "italic", "strikethrough", "underline", "code")}
                                   | {"color": a.get("color", "default")}})
    return out


def paragraph(rich):
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rich}}


def toggle_heading(text, kids):
    return {"object": "block", "type": "heading_2",
            "heading_2": {"rich_text": [rt(text)], "is_toggleable": True, "children": kids}}


LEGEND = paragraph([
    rt("Red (10)", "red"), rt(" > "), rt("Orange (9~10)", "orange"), rt(" > "),
    rt("Yellow (8~9)", "yellow"), rt(" > "), rt("Green (7~8)", "green"), rt(" > "),
    rt("Blue (6~7)", "blue"), rt(" > "), rt("Purple (<6)", "purple"),
])

# Final Thoughts score lines and their colours (same as the template).
SCORE_LINES = [("Production", "green"), ("Individual Ratings", "yellow"),
               ("Creativity", "orange"), ("Experience", "red"), ("Final Score", "gray")]


def score_line(label, color, value=""):
    rich = [rt(f"{label}: ", color, bold=True)]
    if value:
        rich.append(rt(str(value), bold=True))
    return paragraph(rich)


def track_text(n, title, length, rating=""):
    """'N. Title (m:ss) - rating'. The length is left out when unknown;
    with no rating it ends in '- ' like the template, ready to fill in."""
    head = f"{n}. {title}" + (f" ({length})" if length else "")
    return f"{head} - {rating}" if rating else f"{head} - "


def track_toggle(n, title, length, rating="", style=None):
    """A Review track toggle. style = annotations of the old rating text (colour, bold...)."""
    style = style or {"color": "default", "bold": True}
    body = track_text(n, title, length, rating)
    return {"object": "block", "type": "toggle", "toggle": {"rich_text": [
        {"type": "text", "text": {"content": body}, "annotations": style}]}}


def external_icon(url):
    return {"type": "external", "external": {"url": url}} if url else None
