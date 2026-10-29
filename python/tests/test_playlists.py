# Tests for the pure parts of album_tools/playlists.py. Run from python/: py -m unittest
import unittest

from album_tools.playlists import (ALL_PLAYLIST, build_songs, clean_headers, extra_count, missing_from, judge_result, match_track,
                                   playlist_plan, same_song, song_key, tidy_headers, version_tags,
                                   video_id_from)


class Versions(unittest.TestCase):
    def test_version_words_only_in_brackets_or_after_dash(self):
        self.assertEqual(version_tags("Live Forever"), set())
        self.assertEqual(version_tags("Live Forever (Live)"), {"live"})
        self.assertEqual(version_tags("Bed - Demo"), {"demo"})
        self.assertEqual(version_tags("Something (Remastered 2009)"), set())

    def test_same_song(self):
        self.assertTrue(same_song("Bed", "Bed (Remastered)"))
        self.assertFalse(same_song("Bed", "Bed (Demo)"))
        self.assertTrue(same_song("Bed (Demo)", "Bed - Demo"))
        self.assertFalse(same_song("Sic Transit Gloria... Glory Fades", "Sic Transit Gloria Glory Fadez"))
        self.assertTrue(same_song("Sic Transit Gloria... Glory Fades", "Sic Transit Gloria Glory Fadez", loose=True))

    def test_song_key_keeps_versions_apart(self):
        self.assertEqual(song_key("Brand New", "Bed (Remastered)"), song_key("brand new", "Bed"))
        self.assertNotEqual(song_key("Brand New", "Bed (Demo)"), song_key("Brand New", "Bed"))


DATA = {
    "albums": [{"artist": "Brand New", "title": "Daisy", "tracks": [
        {"title": "Vices", "rating": 9},
        {"title": "Bed", "rating": 10},
        {"title": "At the Bottom", "rating": 8.5},
    ], "bonus": [{"title": "Bed", "rating": 9.5}]}],
    "others": [{"artist": "Brand New", "title": "Leaked Demos", "tracks": [{"title": "Bed (Demo)", "rating": 9}]}],
    "extras": [{"artist": "Oasis", "title": "Half the World Away", "individual": 9.5, "fromRelease": None}],
}


class Songs(unittest.TestCase):
    def test_9_plus_once_each(self):
        songs = build_songs(DATA)
        self.assertEqual([(s["artist"], s["title"], s["release"]) for s in songs], [
            ("Brand New", "Vices", "Daisy"), ("Brand New", "Bed", "Daisy"),
            ("Brand New", "Bed (Demo)", "Leaked Demos"), ("Oasis", "Half the World Away", None)])

    def test_playlist_plan(self):
        songs = build_songs(DATA)
        matches = {songs[0]["key"]: {"videoId": "AAAAAAAAAAA"}, songs[1]["key"]: {"videoId": "BBBBBBBBBBB"},
                   songs[3]["key"]: {"videoId": ""}}  # a skipped song has no video
        plan = playlist_plan(songs, matches, threshold=3)
        ids = {name: [e["videoId"] for e in entries] for name, entries in plan.items()}
        self.assertEqual(ids, {ALL_PLAYLIST: ["AAAAAAAAAAA", "BBBBBBBBBBB"],
                               "9+ · Brand New": ["AAAAAAAAAAA", "BBBBBBBBBBB"]})
        self.assertEqual(plan[ALL_PLAYLIST][1]["title"], "Bed")
        self.assertEqual(list(playlist_plan(songs, matches, threshold=4)), [ALL_PLAYLIST])

    def test_missing_from_same_song_other_id(self):
        # YouTube keeps playlist songs under its own ids: Bed is there as "zzz", so not missing.
        wanted = [{"videoId": "a1", "artist": "Brand New", "title": "Bed", "yt_title": "Bed"},
                  {"videoId": "a2", "artist": "Brand New", "title": "Bed (Demo)", "yt_title": ""},
                  {"videoId": "a3", "artist": "Brand New", "title": "Vices", "yt_title": ""}]
        tracks = [{"videoId": "zzz", "title": "Bed (Remastered)", "artists": [{"name": "Brand New"}]},
                  {"videoId": "a3", "title": "Something Else", "artists": [{"name": "Brand New"}]},
                  {"videoId": "old", "title": "Gasoline", "artists": [{"name": "Brand New"}]}]
        self.assertEqual([w["videoId"] for w in missing_from(wanted, tracks)], ["a2"])  # the demo is its own song
        self.assertEqual(extra_count(wanted, tracks), 1)  # Gasoline isn't 9+ anymore


class Matching(unittest.TestCase):
    def test_track_from_tracklist(self):
        tracks = [{"title": "Vices", "videoId": "v1"}, {"title": "Bed (Live)", "videoId": "v2"},
                  {"title": "Bed", "videoId": "v3"}]
        self.assertEqual(match_track("Bed", tracks)["videoId"], "v3")
        self.assertIsNone(match_track("Gasoline", tracks))

    def test_search_results(self):
        r = lambda title, artist: {"title": title, "artists": [{"name": artist}], "videoId": "x" * 11}
        self.assertEqual(judge_result("Oasis", "Half the World Away", r("Half the World Away (Remastered)", "Oasis")), "ok")
        self.assertIsNone(judge_result("Oasis", "Half the World Away", r("Half the World Away", "Aurora")))
        self.assertIsNone(judge_result("Oasis", "Half the World Away", r("Half the World Away (Live)", "Oasis")))
        self.assertEqual(judge_result("Oasis", "Half the World Away", r("Half The World Awayy", "Oasis")), "doubtful")

    def test_headers_chrome_two_lines(self):
        raw = ":authority\nmusic.youtube.com\n:method\nPOST\ncookie\nA=1; B=2\nx-goog-authuser\n0\n"
        self.assertEqual(tidy_headers(raw), "cookie: A=1; B=2\nx-goog-authuser: 0")

    def test_headers_raw_format(self):
        raw = "POST /youtubei/v1/browse HTTP/2\r\ncookie: A=1\r\nx-goog-authuser: 0\r\n"
        self.assertEqual(tidy_headers(raw), "POST /youtubei/v1/browse HTTP/2\ncookie: A=1\nx-goog-authuser: 0")

    def test_clean_headers(self):
        h = {"cookie": "A=1", "content-encoding": "gzip", "Accept-Encoding": "br", ":path": "/x",
             "music.youtube.com": "?", "x-goog-authuser": "0"}
        self.assertEqual(clean_headers(h), {"cookie": "A=1", "x-goog-authuser": "0"})

    def test_links(self):
        self.assertEqual(video_id_from("https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=abc"), "dQw4w9WgXcQ")
        self.assertEqual(video_id_from("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        self.assertIsNone(video_id_from("not a link"))


if __name__ == "__main__":
    unittest.main()
