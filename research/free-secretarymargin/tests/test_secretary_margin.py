import sys, unittest, random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from secretary_margin import pick_margin, make_trials, p_best, search, paired_diff


class MarginTests(unittest.TestCase):
    def test_zero_margin_is_cutoff_rule(self):
        self.assertEqual(pick_margin([1, 5, 3, 9, 2], 3, 0.0), 3)
        self.assertEqual(pick_margin([9, 1, 2, 3, 4], 3, 0.0), 4)
        self.assertEqual(pick_margin([1, 2, 3], 1, 0.5), 0)

    def test_margin_skips_small_records(self):
        x = [1, 5, 5.2, 9, 2]
        self.assertEqual(pick_margin(x, 3, 0.0), 2)
        self.assertEqual(pick_margin(x, 3, 1.0), 3)

    def test_noiseless_matches_classical_value(self):
        tr = make_trials(20, 0.0, 20000, 3)
        self.assertAlmostEqual(p_best(tr, 8, 0.0), 0.384, delta=0.02)  # exact (r-1)/n sum 1/(j-1) for n=20, r=8

    def test_search_includes_cutoff_in_margin_family(self):
        tr = make_trials(15, 1.0, 1500, 4)
        (rc, pc), ((rm, dm), pm) = search(tr, 15, 1.0, [3, 5, 7], [0.0, 0.3])
        self.assertGreaterEqual(pm, pc)

    def test_paired_diff_of_rule_with_itself_is_zero(self):
        tr = make_trials(15, 1.0, 500, 5)
        m, se = paired_diff(tr, (5, 0.2), (5, 0.2), 1.4)
        self.assertEqual(m, 0.0)


if __name__ == "__main__":
    unittest.main()
