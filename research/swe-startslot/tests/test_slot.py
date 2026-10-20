import datetime as D
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_startslot import slot


def T(m):
    return D.datetime(2026, 10, 16, 0, 0) + D.timedelta(minutes=m)


class Tests(unittest.TestCase):
    def test_parse_both_formats(self):
        self.assertEqual(slot.parse_time("2026-10-13T01:03Z"), D.datetime(2026, 10, 13, 1, 3))
        self.assertEqual(slot.parse_time("2026-10-13T01:03:09Z"), D.datetime(2026, 10, 13, 1, 3, 9))
        self.assertIsNone(slot.parse_time(None))
        self.assertIsNone(slot.parse_time("junk"))

    def test_neighbours(self):
        ts = [T(0), T(3), T(4), T(20)]
        self.assertEqual(slot.neighbours(ts, 5), [2, 2, 2, 0])
        self.assertEqual(slot.neighbours(ts, 1), [0, 1, 1, 0])

    def test_wilson_contains_point_and_is_in_range(self):
        lo, hi = slot.wilson(5, 50)
        self.assertTrue(0 <= lo < 0.1 < hi <= 1)
        self.assertEqual(slot.wilson(0, 0), (0.0, 1.0))

    def test_confounded_by_day_is_not_significant(self):
        # day 1: everything crowded and high; day 2: nothing crowded and low. Raw gap is huge, within-day gap is zero.
        d1 = ([True] * 10, [1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
        d2 = ([False] * 10, [0] * 10)
        diff, p = slot.permutation_p([d1, d2], 500, 1)
        self.assertEqual(diff, 0.0)
        self.assertEqual(p, 1.0)

    def test_real_within_day_effect_is_detected(self):
        strata = [([True] * 10 + [False] * 10, [1] * 10 + [0] * 10) for _ in range(4)]
        diff, p = slot.permutation_p(strata, 500, 2)
        self.assertEqual(diff, 1.0)
        self.assertLess(p, 0.01)


if __name__ == "__main__":
    unittest.main()
