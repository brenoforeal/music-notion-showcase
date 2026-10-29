"""[1] New album page from YouTube Music and [2] generic page (not on YouTube Music).
Both land on the Music page; you move them where they belong."""
import re

from .common import (MUSIC_PAGE_ID, LEGEND, SCORE_LINES, ask, confirm, external_icon, find_album,
                     log_page, notion, page_url, paragraph, rt, score_line, toggle_heading, track_toggle)

PREVIEW_HINT = "Write your initial thoughts and expectations before listening..."
BONUS_HINT = "Add any extra b-sides or unreleased tracks here..."


def possessive(name):
    """'The Smiths' -> "The Smiths'" | 'Paul Weller' -> "Paul Weller's"."""
    return f"{name}'" if name.endswith(("s", "S")) else f"{name}'s"


def page_blocks(description, track_blocks, thoughts=None, bonus=None, preview=True):
    """The whole template. description: list of rich-text lists (one per paragraph).
    thoughts / bonus: lists of blocks (defaults: empty score lines / the bonus hint)."""
    blocks = [paragraph(d) for d in description]
    blocks.append({"object": "block", "type": "table_of_contents", "table_of_contents": {"color": "default"}})
    if preview:
        blocks.append(toggle_heading("Preview", [paragraph([rt(PREVIEW_HINT)])]))
    blocks.append(toggle_heading("Review", [LEGEND] + track_blocks))
    blocks.append(toggle_heading("Final Thoughts", thoughts or [score_line(l, c) for l, c in SCORE_LINES]))
    blocks.append(toggle_heading("Bonus Tracks", bonus or [paragraph([rt(BONUS_HINT)])]))
    return blocks


def create_page(title, blocks, cover=None, parent_id=MUSIC_PAGE_ID, action="created"):
    """Creates the page, logs it and returns its ID."""
    page = {"parent": {"page_id": parent_id},
            "properties": {"title": [{"text": {"content": title}}]},
            "children": blocks}
    if cover:
        page["icon"] = external_icon(cover)
    new = notion().pages.create(**page)
    log_page(action, title, new["id"])
    return new["id"]


# ─────────── [1] from YouTube Music ───────────

def new_album_page():
    query = ask("Album and artist (e.g. 'Stanley Road Paul Weller')")
    if not query:
        return
    from .common import ytmusic
    results = ytmusic().search(query, filter="albums", limit=5)
    if not results:
        print(f"Nothing found on YouTube Music for '{query}'.")
        return
    # Show the top matches so a wrong first hit doesn't create the wrong page.
    for i, r in enumerate(results, 1):
        artists = ", ".join(a.get("name", "") for a in r.get("artists") or [])
        print(f"  [{i}] {artists} - {r.get('title')} ({r.get('year', '?')}, {r.get('type', 'Album')})")
    choice = ask("Which one", "1")
    if not choice.isdigit() or not 1 <= int(choice) <= len(results):
        print("Cancelled.")
        return
    album = find_album("", "", browse_id=results[int(choice) - 1]["browseId"])

    title = f"{album['artist']} - {album['title']}"
    tracks = [track_toggle(i, t["title"], t["duration"]) for i, t in enumerate(album["tracks"], 1)]
    description = [[rt(f"{possessive(album['artist'])} [Xth] studio album, released in {album['year'] or 'N/A'}.")]]
    print(f"\n{title} ({album['year']}) — {len(tracks)} tracks, cover: {'yes' if album['cover'] else 'no'}")
    if not confirm("Create this page on the Music page?"):
        print("Cancelled.")
        return
    page_id = create_page(title, page_blocks(description, tracks), album["cover"])
    print(f"\nCreated: {page_url(page_id)}")


# ─────────── [2] generic page ───────────

def generic_page():
    print("For things YouTube Music doesn't have as one album: compilations, demos, sessions...")
    title = ask("Page title, as 'Artist - Title'")
    if " - " not in title:
        print("Use 'Artist - Title' (with ' - ') so Sync can read it.")
        return
    description = ask("One-line description (Enter to skip)")
    cover = ask("Cover image link (Enter for none)")
    if cover and not re.match(r"^https?://\S+$", cover):
        print("That isn't a link; the page gets no cover.")
        cover = None

    print("Paste the tracklist, one song per line ('Title' or 'Title (m:ss)'). Empty line to finish:")
    tracks = []
    while True:
        line = input().strip()
        if not line:
            break
        line = re.sub(r"^\s*\d+[.)]\s*", "", line)  # "3. Song" or "3) Song" -> "Song"
        m = re.match(r"^(.*?)\s*\((\d{1,2}:\d{2})\)\s*$", line)
        tracks.append((m.group(1), m.group(2)) if m else (line, None))

    print(f"\n{title} — {len(tracks)} tracks, cover: {'yes' if cover else 'no'}")
    for i, (t, length) in enumerate(tracks, 1):
        print(f"  {i}. {t}" + (f" ({length})" if length else ""))
    if not confirm("Create this page on the Music page?"):
        print("Cancelled.")
        return
    blocks = page_blocks([[rt(description)]] if description else [],
                         [track_toggle(i, t, length) for i, (t, length) in enumerate(tracks, 1)])
    page_id = create_page(title, blocks, cover or None)
    print(f"\nCreated: {page_url(page_id)}")
