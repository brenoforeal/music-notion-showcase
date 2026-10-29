# Tests for the bonus-track picker's choice parsing. Run from python/: py -m unittest
import unittest

from album_tools.bonus import parse_choice


class ParseChoice(unittest.TestCase):
    def test_list_and_ranges(self):
        self.assertEqual(parse_choice("1,3, 5-7", 10), [0, 2, 4, 5, 6])

    def test_all_and_none(self):
        self.assertEqual(parse_choice("all", 3), [0, 1, 2])
        self.assertEqual(parse_choice("", 3), [])

    def test_out_of_range_ignored(self):
        self.assertEqual(parse_choice("0,2,9", 3), [1])


if __name__ == "__main__":
    unittest.main()
