"""[3] Update an old page to the new format.

- Track lines become "N. Title (m:ss) - rating" (lengths from YouTube Music). Only the
  line's own text changes: the rating, its colour and the review text inside a toggle stay.
  Bullets and paragraphs keep their type (Sync reads them).
- Adds what's missing: cover icon, table of contents, Final Thoughts score lines, Bonus Tracks.
- Shows every change and asks before writing. Never deletes anything.
"""
import re
import time

from .common import (SCORE_LINES, ask, children, choose_album, confirm, external_icon, length_lookup, log_page,
                     norm, notion, page_id_from, page_title, page_url, paragraph, plain, rt, runs, score_line,
                     split_line, split_title, toggle_heading, track_text)
from .create import BONUS_HINT

SONG_TYPES = ("toggle", "bulleted_list_item", "numbered_list_item", "paragraph")


def is_heading(b):
    return b["type"].startswith("heading_")


def find_section(top, name):
    """(heading block, its blocks, flat?) for a section, or (None, [], False).
    Toggle headings hold their blocks as children; on flat pages the blocks follow the heading."""
    for i, b in enumerate(top):
        if (is_heading(b) or b["type"] == "toggle") and plain(b).lower() == name.lower():
            if b.get("has_children"):
                return b, children(b["id"]), False
            section = []
            for nxt in top[i + 1:]:
                if is_heading(nxt):
                    break
                section.append(nxt)
            return b, section, True
    return None, [], False


def is_song_line(b):
    """A Review line that holds a song. Toggles, bullets and numbered items count when they read
    as 'Title - rating'; a plain paragraph also has to be short and end in a rating (or nothing),
    so a sentence with a dash in it isn't taken for a song."""
    if b["type"] not in SONG_TYPES:
        return False
    text = plain(b)
    parts = split_line(text)
    if not parts:
        return False
    if b["type"] == "paragraph":
        return len(text) < 150 and re.match(r"^(\d|x\b|interlude|$)", parts[3], re.I) is not None
    return True


def main_style(block):
    """Annotations of the run that carries the rating (the longest coloured run), so the
    rewritten line keeps its colour: red 10, gray background for 10*, yellow background for 10**."""
    rs = runs(block)
    coloured = [r for r in rs if (r.get("annotations") or {}).get("color", "default") != "default"]
    pick = max(coloured or rs, key=lambda r: len(r.get("plain_text", "")))
    a = dict(pick.get("annotations") or {})
    a.setdefault("bold", True)
    return a


def song_runs(n, title, length, rest, style):
    """'N. ' plain, then 'Title (m:ss) - rating' in the line's colour (like the template)."""
    body = track_text(n, title, length, rest)[len(f"{n}. "):]
    return [rt(f"{n}. ", bold=True), {"type": "text", "text": {"content": body}, "annotations": style}]


def pause():
    time.sleep(0.35)  # Notion allows ~3 requests a second


def update_page():
    link = ask("Notion page link")
    page_id = page_id_from(link)
    if not page_id:
        print("That doesn't look like a Notion link.")
        return
    page = notion().pages.retrieve(page_id)
    title = page_title(page)
    artist, album = split_title(title)
    print(f"\nPage: {title}")
    top = children(page_id)

    review, review_blocks, review_flat = find_section(top, "Review")
    if not review:
        print("This page has no Review section, so there's nothing to update.")
        return
    songs = [(b, split_line(plain(b))) for b in review_blocks if is_song_line(b)]
    if not songs:
        print("No track lines found in Review.")
        return

    yt = choose_album(artist, album)  # for lengths and the cover
    lengths = length_lookup(yt["tracks"]) if yt else {}

    # 1. Track lines
    line_changes = []
    for n, (b, (_, t, length, rest)) in enumerate(songs, 1):
        length = length or lengths.get(norm(t))
        new_text = track_text(n, t, length, rest).rstrip()
        if new_text != plain(b).rstrip():
            line_changes.append((b, plain(b), song_runs(n, t, length, rest, main_style(b))))

    # 2. What's missing
    kind = ask("Is this an Album or an EP/compilation? (a/e)", "a").lower()
    wanted = SCORE_LINES if kind != "e" else [s for s in SCORE_LINES if s[0] in ("Individual Ratings", "Experience", "Final Score")]
    thoughts, thoughts_blocks, thoughts_flat = find_section(top, "Final Thoughts")
    have = {plain(b).split(":")[0].strip().lower() for b in thoughts_blocks}
    missing_lines = [(l, c) for l, c in wanted if l.lower() not in have and not (l == "Individual Ratings" and "individual rating" in have)]
    bonus, _, _ = find_section(top, "Bonus Tracks")
    needs_toc = not any(b["type"] == "table_of_contents" for b in top)
    needs_icon = not page.get("icon") and yt and yt.get("cover")

    # 3. Show the plan
    print()
    if line_changes:
        print(f"Track lines to rewrite ({len(line_changes)} of {len(songs)}):")
        for _, old, new in line_changes:
            print(f"  {old}\n    -> {''.join(r['text']['content'] for r in new)}")
    else:
        print("Track lines: already in the new format.")
    if needs_icon:
        print("Add the YouTube Music cover as the page icon.")
    if needs_toc:
        print("Add a table of contents at the top.")
    if not thoughts:
        print("Add a Final Thoughts section with: " + ", ".join(l for l, _ in wanted))
    elif missing_lines:
        print("Add to Final Thoughts: " + ", ".join(l for l, _ in missing_lines))
    if not bonus:
        print("Add a Bonus Tracks section.")
    if not (line_changes or needs_icon or needs_toc or not thoughts or missing_lines or not bonus):
        print("Nothing to change: this page is already in the new format.")
        return
    if not confirm("\nApply these changes?"):
        print("Cancelled. Nothing was changed.")
        return

    # 4. Apply (only edits and additions)
    for b, _, new in line_changes:
        notion().blocks.update(block_id=b["id"], **{b["type"]: {"rich_text": new}})
        pause()
    if needs_icon:
        notion().pages.update(page_id=page_id, icon=external_icon(yt["cover"]))
        pause()
    if needs_toc and top:
        notion().blocks.children.append(block_id=page_id, after=top[0]["id"], children=[
            {"object": "block", "type": "table_of_contents", "table_of_contents": {"color": "default"}}])
        pause()
    if not thoughts:
        after = review["id"] if not review_flat else (review_blocks[-1]["id"] if review_blocks else review["id"])
        notion().blocks.children.append(block_id=page_id, after=after, children=[
            toggle_heading("Final Thoughts", [score_line(l, c) for l, c in wanted])])
        pause()
    elif missing_lines:
        new_lines = [score_line(l, c) for l, c in missing_lines]
        if thoughts_flat:
            after = thoughts_blocks[-1]["id"] if thoughts_blocks else thoughts["id"]
            notion().blocks.children.append(block_id=page_id, after=after, children=new_lines)
        else:
            notion().blocks.children.append(block_id=thoughts["id"], children=new_lines)
        pause()
    if not bonus:
        notion().blocks.children.append(block_id=page_id, children=[
            toggle_heading("Bonus Tracks", [paragraph([rt(BONUS_HINT)])])])
    log_page("updated", title, page_id)
    print(f"\nUpdated: {page_url(page_id)}")
