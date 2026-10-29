# Tests for the pure helpers in album_tools/common.py. Run from python/: py -m unittest
import unittest

from album_tools.common import norm, split_line, split_title, page_id_from, track_text


class SplitLine(unittest.TestCase):
    def test_full_line(self):
        self.assertEqual(split_line("3. Bed (3:10) - 9 → 10"), (3, "Bed", "3:10", "9 → 10"))

    def test_no_number_no_length(self):
        self.assertEqual(split_line("Reel Around the Fountain - 9"), (None, "Reel Around the Fountain", None, "9"))

    def test_hyphen_in_title(self):
        self.assertEqual(split_line("Twenty-Two - 9"), (None, "Twenty-Two", None, "9"))

    def test_unrated_template_line(self):
        self.assertEqual(split_line("1. Sit And Wonder (6:52) -"), (1, "Sit And Wonder", "6:52", ""))

    def test_x_and_comments_kept(self):
        self.assertEqual(split_line("11. Twilight (0:21) - X"), (11, "Twilight", "0:21", "X"))
        self.assertEqual(split_line("In A Jar - 8 → 10 (Yeah you read this right)")[3], "8 → 10 (Yeah you read this right)")

    def test_not_a_song(self):
        self.assertIsNone(split_line("Red (10) > Orange (9~10)"))
        self.assertIsNone(split_line("Back to the top"))


class Helpers(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(norm("The Beatles (Remastered 2009)"), "beatles")
        self.assertEqual(norm("Rock 'n' Roll Star"), norm("Rock N Roll Star"))
        self.assertEqual(norm("We’re All On Drugs"), norm("We're All On Drugs"))

    def test_colour_albums_stay_apart(self):
        # The split skipped every colour album because these all became "weezer weezer".
        self.assertNotEqual(norm("Weezer - Weezer (Gold Album)", keep_brackets=True),
                            norm("Weezer - Weezer (Blue Album)", keep_brackets=True))
        self.assertEqual(norm("Weezer (Red Album)", keep_brackets=True), norm("weezer (red album)", keep_brackets=True))

    def test_split_title(self):
        self.assertEqual(split_title("Brand New - Daisy :2026-10-03-emoji:"), ("Brand New", "Daisy"))

    def test_page_id(self):
        self.assertEqual(page_id_from("https://app.notion.com/p/Brand-New-3dc007e8bb6e81db8d75db6a64c7b6a8?pvs=204"),
                         "3dc007e8bb6e81db8d75db6a64c7b6a8")
        self.assertIsNone(page_id_from("nope"))

    def test_track_text(self):
        self.assertEqual(track_text(2, "Bed", "3:10", "10"), "2. Bed (3:10) - 10")
        self.assertEqual(track_text(5, "Unknown", None), "5. Unknown - ")


if __name__ == "__main__":
    unittest.main()
