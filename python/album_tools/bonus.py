"""[4] Find bonus tracks: songs on deluxe / anniversary editions that aren't on the standard album.

The standard tracklist comes from YouTube Music (you confirm it). Other editions come from
Deezer, because YouTube Music usually only has the standard album ("Pinkerton - Deluxe
Edition" and "Definitely Maybe (30th Anniversary)" are on Deezer, not YouTube Music).
Lists the tracks that are neither on the standard album nor already on your page; the ones
you pick go into Bonus Tracks as "Title - " for you to rate. Singles and rarities collections
are separate releases, so it won't find every B-side.
"""
import json
import re
import urllib.parse
import urllib.request

from .common import (ask, children, choose_album, confirm, log_page, norm, notion, page_id_from, page_title,
                     page_url, paragraph, plain, rt, split_line, split_title, toggle_heading)
from .update import find_section

MAX_EDITIONS = 6


def song_key(title):
    """Same song, any version: 'Tired Of Sex - 2010 Remaster' / 'Tired Of Sex (Live)' -> 'tired of sex'."""
    return norm(re.split(r"\s[-–]\s", title)[0])


def deezer(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.load(r)


def other_editions(artist, album):
    """Deezer albums by this artist whose title starts with the album's: deluxe, anniversary, remaster...
    Returns [(edition title, [track titles])], biggest editions first."""
    q = urllib.parse.quote(f'artist:"{artist}" album:"{album}"')
    found = [d for d in deezer(f"https://api.deezer.com/search/album?q={q}&limit=25").get("data", [])
             if norm(d["artist"]["name"]) == norm(artist) and norm(d["title"]).startswith(norm(album))]
    found.sort(key=lambda d: -(d.get("nb_tracks") or 0))
    editions = []
    for d in found[:MAX_EDITIONS]:
        tracks = deezer(f"https://api.deezer.com/album/{d['id']}/tracks?limit=200").get("data", [])
        editions.append((d["title"], [t["title"] for t in tracks]))
    return editions


def parse_choice(text, count):
    """'1,3, 5-7' / 'all' / '' -> list of 0-based indexes."""
    text = text.strip().lower()
    if text in ("all", "a", "todos"):
        return list(range(count))
    picked = set()
    for part in text.replace(" ", "").split(","):
        if "-" in part:
            lo, hi = part.split("-", 1)
            if lo.isdigit() and hi.isdigit():
                picked.update(range(int(lo) - 1, int(hi)))
        elif part.isdigit():
            picked.add(int(part) - 1)
    return sorted(i for i in picked if 0 <= i < count)


def find_bonus_tracks():
    page_id = page_id_from(ask("Notion page link"))
    if not page_id:
        print("That doesn't look like a Notion link.")
        return
    page = notion().pages.retrieve(page_id)
    title = page_title(page)
    artist, album = split_title(title)
    print(f"\nPage: {title}")

    standard = choose_album(artist, album, "the standard tracklist")
    if not standard:
        print("Without the standard album there's nothing to compare. Cancelled.")
        return

    # Songs already on the page (Review + Bonus Tracks) or on the standard album.
    top = children(page_id)
    _, review_blocks, _ = find_section(top, "Review")
    bonus_heading, bonus_blocks, bonus_flat = find_section(top, "Bonus Tracks")
    known = {song_key(t["title"]) for t in standard["tracks"]}
    for b in review_blocks + bonus_blocks:
        parts = split_line(plain(b))
        if parts:
            known.add(song_key(parts[1]))

    print("Looking for other editions on Deezer…")
    candidates, seen = [], set(known)
    editions = other_editions(standard["artist"], standard["title"])
    for edition, tracks in editions:
        print(f"  {edition} ({len(tracks)} tracks)")
        for t in tracks:
            key = song_key(t)
            if key and key not in seen:
                seen.add(key)
                candidates.append((re.split(r"\s[-–]\s", t)[0].strip(), edition))

    if not candidates:
        print("No extra tracks found on other editions.")
        return
    print(f"\nTracks not on the standard album or your page ({len(candidates)}):")
    for i, (t, edition) in enumerate(candidates, 1):
        print(f"  [{i}] {t}   (on: {edition})")
    picked = parse_choice(ask("Add which? (e.g. 1,3,5-7 / all / Enter for none)"), len(candidates))
    if not picked:
        print("Nothing added.")
        return
    lines = [paragraph([rt(f"{candidates[i][0]} - ")]) for i in picked]
    print("Will add to Bonus Tracks:\n  " + "\n  ".join(f"{candidates[i][0]} - " for i in picked))
    if not confirm("Add them?"):
        print("Cancelled. Nothing was changed.")
        return

    if not bonus_heading:
        notion().blocks.children.append(block_id=page_id, children=[toggle_heading("Bonus Tracks", lines)])
    elif bonus_flat:
        after = bonus_blocks[-1]["id"] if bonus_blocks else bonus_heading["id"]
        notion().blocks.children.append(block_id=page_id, after=after, children=lines)
    else:
        notion().blocks.children.append(block_id=bonus_heading["id"], children=lines)
    log_page("bonus tracks added", title, page_id)
    print(f"\nAdded {len(picked)} bonus track(s): {page_url(page_id)}")
