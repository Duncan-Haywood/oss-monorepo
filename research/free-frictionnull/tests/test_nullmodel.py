import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from free_frictionnull import nullmodel as m


class T(unittest.TestCase):
    def test_same_day_not_a_repeat(self):
        rep = m.repeats_by_day([("d1", "a"), ("d1", "a")])
        self.assertEqual(rep["d1"], (0, 2))

    def test_earlier_day_is_repeat(self):
        rep = m.repeats_by_day([("d1", "a"), ("d2", "a"), ("d2", "b")])
        self.assertEqual(rep["d2"], (1, 2))

    def test_other_theme_dropped(self):
        rows = [{"date": "d", "file": "f", "issue": "something vague"}, {"date": "d", "file": "f", "issue": "pytest not installed"}]
        self.assertEqual(m.classified(rows), [("d", ("f", "missing-tooling"))])

    def test_null_conserves_day_sizes(self):
        items = [("d1", "a"), ("d1", "b"), ("d2", "a"), ("d2", "c"), ("d3", "a")]
        _, per = m.permutation_null(items, n=20, seed=1)
        self.assertEqual(set(per), {"d1", "d2", "d3"})
        self.assertTrue(all(x == 0 for x in per["d1"]))  # first day never repeats

    def test_all_distinct_pairs_never_repeat(self):
        items = [("d1", "a"), ("d2", "b"), ("d3", "c")]
        tot, _ = m.permutation_null(items, n=10)
        self.assertEqual(set(tot), {0})

    def test_p_upper_bounds(self):
        self.assertAlmostEqual(m.p_upper([1, 2, 3], 99), 1 / 4)
        self.assertEqual(m.p_upper([5, 5], 0), 1.0)

    def test_p_lower(self):
        self.assertAlmostEqual(m.p_lower([1, 2, 3], 0), 1 / 4)

    def test_deterministic(self):
        items = [("d1", "a"), ("d2", "a"), ("d2", "b"), ("d3", "b")]
        self.assertEqual(m.permutation_null(items, n=30, seed=3)[0], m.permutation_null(items, n=30, seed=3)[0])


if __name__ == "__main__":
    unittest.main()
