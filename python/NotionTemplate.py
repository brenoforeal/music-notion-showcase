"""Album Page Creator: the menu. Run it from the desktop shortcut or with:  py NotionTemplate.py
Each option asks before writing anything to Notion and logs what it did in created-pages.csv.
The options live in album_tools/ (see album_tools/__init__.py)."""
import sys

from album_tools import bonus, create, playlists, split, update

OPTIONS = [
    ("New album page (YouTube Music)", create.new_album_page),
    ("Generic page (not on YouTube Music)", create.generic_page),
    ("Update an old page to the new format", update.update_page),
    ("Find bonus tracks for a page", bonus.find_bonus_tracks),
    ("Split an old discography page (Weezer)", split.split_page),
    ("Sync 9+ songs to YouTube Music playlists", playlists.sync_playlists),
]


def menu():
    while True:
        print("\n" + "=" * 44)
        print("  Album Page Creator")
        print("=" * 44)
        for i, (label, _) in enumerate(OPTIONS, 1):
            print(f"  [{i}] {label}")
        print("  [0] Exit")
        choice = input("Choose: ").strip()
        if choice in ("0", "", "q"):
            print("Bye!")
            return
        if not choice.isdigit() or not 1 <= int(choice) <= len(OPTIONS):
            print("Pick a number from the list.")
            continue
        label, action = OPTIONS[int(choice) - 1]
        print(f"\n— {label} —")
        try:
            action()
        except KeyboardInterrupt:
            print("\nStopped.")
        except Exception as e:  # show the problem, then back to the menu
            print(f"\nSomething went wrong: {e}")


if __name__ == "__main__":
    # Windows consoles default to an old code page; this lets ⭐ and accents print.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    menu()
