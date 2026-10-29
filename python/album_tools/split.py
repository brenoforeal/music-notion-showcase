"""[5] Split an old one-page discography (like "Weezer - Full Discography") into one page per album.

Old page, per album:  Heading 1 "Album (Year)" -> image -> description -> Review (lines
"Title - 8.5") -> Final Thoughts (text, "7.5/10 or ⭐⭐⭐.75", sometimes the score lines) ->
Bonus Tracks -> "Back to the top".
New page: the album template. Ratings and colours are kept; lengths and the cover icon come from
YouTube Music; score lines are filled where the old page had them and left empty otherwise.
SZNS-style sections with "Spring Review" sub-headings become one page per season.
The old page is never changed: delete it yourself once you're happy with the new pages.
"""
import re
import time

from .common import (SCORE_LINES, ask, children, confirm, copy_runs, find_album, length_lookup, log_page, norm,
                     notion, page_id_from, page_title, page_url, paragraph, plain, rt, runs, score_line,
                     split_line, split_title, track_toggle)
from .create import create_page, page_blocks
from .update import is_song_line, main_style

OLD_WEEZER_PAGE = "3ce007e8bb6e80958989fa302c5a4b2b"   # Weezer - Full Discography
WEEZER_NEW_FOLDER = "3f3007e8bb6e800d87cedfb25c0d751f"  # Weezer - Discography (NEW)

SCORE_RE = re.compile(r"^\s*(production|individual ratings?|creativity|experience|final score)\s*:\s*([\d.,]+)", re.I)
LABELS = {"production": "Production", "individual rating": "Individual Ratings", "individual ratings": "Individual Ratings",
          "creativity": "Creativity", "experience": "Experience", "final score": "Final Score"}


def parse_sections(top):
    """The old page's album sections: [{name, year, description, groups, thoughts, scores, verdicts, bonus}].
    groups = [(season or None, [(title, rating, style)])]; verdicts = {season: runs} for SZNS star lines."""
    sections, cur, part = [], None, None
    for b in top:
        t, text = b["type"], plain(b)
        if t == "heading_1":
            m = re.match(r"^(.*?)\s*\((\d{4})\)\s*$", text)
            cur = {"name": m.group(1) if m else text, "year": m.group(2) if m else "", "description": [],
                   "groups": [(None, [])], "thoughts": [], "scores": {}, "verdicts": {}, "bonus": []}
            sections.append(cur)
            part = "intro"
            continue
        if cur is None or text.lower() == "back to the top":
            continue
        if t == "heading_2" and text.lower() == "review":
            part = "review"
        elif t == "heading_2" and text.lower() == "final thoughts":
            part = "thoughts"
        elif t.startswith("heading_") and text.lower() == "bonus tracks":
            part = "bonus"
        elif t == "heading_3" and part == "review":
            season = re.sub(r"\s*review\s*$", "", text, flags=re.I).strip()
            cur["groups"].append((season, []))
        elif t == "paragraph" and text:
            if part == "intro":
                cur["description"].append(runs(b))
            elif part == "review" and is_song_line(b):
                _, title, _, rating = split_line(text)
                cur["groups"][-1][1].append((title, rating, main_style(b)))
            elif part == "thoughts":
                s = SCORE_RE.match(text)
                v = re.match(r"^\s*(spring|summer|autumn|fall|winter)\s*:", text, re.I)
                if s:
                    cur["scores"][LABELS[s.group(1).lower()]] = s.group(2).replace(",", ".")
                elif v:
                    cur["verdicts"][v.group(1).capitalize()] = runs(b)
                else:
                    cur["thoughts"].append(runs(b))
            elif part == "bonus" and is_song_line(b):
                cur["bonus"].append(b)
    return [s for s in sections if s["name"].lower() != "extras"]


def plans_for(artist, section):
    """One page plan per album; SZNS-style sections give one per season."""
    groups = [(season, songs) for season, songs in section["groups"] if songs]
    plans = []
    for season, songs in groups:
        name = f"{section['name'].split(' - ')[0]}: {season}" if season else section["name"]
        # Bonus lines tagged "(Spring)" belong to that season; untagged ones go everywhere.
        bonus = []
        for b in section["bonus"]:
            tag = re.search(r"\((spring|summer|autumn|fall|winter)\)", plain(b), re.I)
            if season and tag and tag.group(1).lower() != season.lower():
                continue
            bonus.append(b)
        thoughts = list(section["thoughts"])
        if season and season in section["verdicts"]:
            thoughts.append(section["verdicts"][season])
        plans.append({"title": f"{artist} - {name}", "album": name, "year": section["year"], "season": season,
                      "description": section["description"], "songs": songs, "thoughts": thoughts,
                      "scores": section["scores"] if not season else {}, "bonus": bonus})
    return plans


def bonus_block(b, season):
    """A bonus line copied with its colours; the '(Spring)' tag is dropped on that season's page."""
    if not season:
        return paragraph(copy_runs(runs(b)))
    text = re.sub(r"\s*\(" + re.escape(season) + r"\)", "", plain(b), flags=re.I)
    return paragraph([{"type": "text", "text": {"content": text}, "annotations": main_style(b)}])


def build_blocks(plan, yt):
    lengths = length_lookup(yt["tracks"]) if yt else {}
    tracks = [track_toggle(n, title, lengths.get(norm(title)), rating, {**style, "bold": True})
              for n, (title, rating, style) in enumerate(plan["songs"], 1)]
    thoughts = [paragraph(copy_runs(r)) for r in plan["thoughts"]]
    thoughts += [score_line(label, color, plan["scores"].get(label, "")) for label, color in SCORE_LINES]
    bonus = [bonus_block(b, plan["season"]) for b in plan["bonus"]] or None
    description = [copy_runs(r) for r in plan["description"]]
    return page_blocks(description, tracks, thoughts, bonus, preview=False)


def split_page():
    source = page_id_from(ask("Old discography page link", OLD_WEEZER_PAGE))
    dest = page_id_from(ask("Create the new pages under (page link)", WEEZER_NEW_FOLDER))
    if not source or not dest:
        print("Those don't look like Notion links.")
        return
    source_title = page_title(notion().pages.retrieve(source))
    artist, _ = split_title(source_title)
    print(f"\nReading '{source_title}'…")
    plans = [p for s in parse_sections(children(source)) for p in plans_for(artist, s)]
    # Full names, brackets included: "Weezer - Weezer (Gold Album)" is not "Weezer - Weezer (Blue Album)".
    existing = {norm(b["child_page"]["title"], keep_brackets=True) for b in children(dest) if b["type"] == "child_page"}

    print("Matching albums on YouTube Music (for lengths and covers)…\n")
    rows = []
    for i, plan in enumerate(plans, 1):
        exists = norm(plan["title"], keep_brackets=True) in existing
        yt = None
        if not exists:
            try:
                yt = find_album(artist, plan["album"])
            except Exception as e:
                print(f"  (YouTube Music lookup failed for {plan['album']}: {e})")
        lengths = length_lookup(yt["tracks"]) if yt else {}
        matched = sum(1 for t, _, _ in plan["songs"] if norm(t) in lengths)
        filled = [l.split()[0] for l, _ in SCORE_LINES if l in plan["scores"]]
        rows.append((plan, yt, exists))
        if exists:
            print(f"  [{i:>2}] {plan['title']}  -> already exists, skipped")
        else:
            print(f"  [{i:>2}] {plan['title']} ({plan['year']}): {len(plan['songs'])} tracks, "
                  f"lengths {matched}/{len(plan['songs'])}, bonus {len(plan['bonus'])}, "
                  f"scores {'/'.join(filled) if filled else 'to fill'}, "
                  f"YouTube Music: {yt['title'] + ' (' + str(yt['year']) + ')' if yt else 'not found'}")

    todo = [(i, r) for i, r in enumerate(rows, 1) if not r[2]]
    if not todo:
        print("\nEvery album already has a page. Nothing to do.")
        return
    choice = ask("\nCreate which? (e.g. 1,3,5-7 / all / Enter to cancel)")
    from .bonus import parse_choice
    picked = {i + 1 for i in parse_choice(choice, len(rows))}
    chosen = [(i, r) for i, r in todo if i in picked]
    if not chosen:
        print("Cancelled. Nothing was created.")
        return
    if not confirm(f"Create {len(chosen)} page(s) under the destination page?"):
        print("Cancelled. Nothing was created.")
        return

    for i, (plan, yt, _) in chosen:
        page_id = create_page(plan["title"], build_blocks(plan, yt), yt["cover"] if yt else None,
                              parent_id=dest, action=f"split from {source_title}")
        print(f"  ✓ {plan['title']}: {page_url(page_id)}")
        time.sleep(0.4)  # Notion allows ~3 requests a second
    print(f"\nDone. '{source_title}' wasn't changed; delete it yourself when you're happy with the new pages.")
