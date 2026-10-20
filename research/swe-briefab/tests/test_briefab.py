import os
import statistics
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_briefab import boot_diff, compare, metrics, perm_p, split, wilson, window


def run(v, **kw):
    d = {"track": "research", "date": "2026-10-16", "prompt_version": v, "outcome": "success",
         "errors": [], "doc_friction": [], "deviations": []}
    d.update(kw)
    return d


class T(unittest.TestCase):
    def test_metrics(self):
        m = metrics(run(0, errors=["x"], doc_friction=["a", "b"], outcome="partial"))
        self.assertEqual((m["has_error"], m["success"], m["friction"]), (1.0, 0.0, 2.0))

    def test_window_filters(self):
        rs = [run(0), run(1, date="2026-10-01"), run(1, track="ventures"), run(2), run(1, date=None)]
        self.assertEqual(len(window(rs, "research", (0, 1), "2026-10-15")), 1)

    def test_split_drops_none(self):
        g = split([run(0, cost_usd=1.0), run(0), run(1, cost_usd=2.0)], "cost_usd")
        self.assertEqual(g, {0: [1.0], 1: [2.0]})

    def test_wilson_bounds(self):
        lo, hi = wilson(0, 10)
        self.assertLess(abs(lo), 1e-9)
        self.assertTrue(lo < hi < 0.35)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))

    def test_perm_identical_is_one(self):
        self.assertAlmostEqual(perm_p([1, 2, 3, 4], [1, 2, 3, 4], reps=500), 1.0, delta=0.01)

    def test_perm_separated_is_small(self):
        self.assertLess(perm_p([0] * 20, [1] * 20, reps=2000), 0.01)

    def test_boot_constant(self):
        self.assertEqual(boot_diff([1.0] * 5, [3.0] * 5, reps=200), (2.0, 2.0, 2.0))

    def test_compare_needs_two_each(self):
        self.assertIsNone(compare([run(0, cost_usd=1.0), run(1, cost_usd=1.0)], "cost_usd"))

    def test_compare_median(self):
        rs = [run(0, cost_usd=c) for c in (1, 1, 1)] + [run(1, cost_usd=c) for c in (2, 2, 2)]
        c = compare(rs, "cost_usd", statistics.median)
        self.assertEqual(c["diff"], 1)


if __name__ == "__main__":
    unittest.main()
