import unittest
from skill_score_normalisation import *


class T(unittest.TestCase):
    def test_single_matches_general(self):
        for n, p in [(3, .2), (10, .1), (7, .8)]:
            self.assertAlmostEqual(optimal_reports([n], [p])[0], single_type_report(n, p), 12)

    def test_two_tasks_report_half(self):
        for p in (.05, .3, .9):
            self.assertAlmostEqual(single_type_report(2, p), .5, 12)

    def test_symmetry(self):
        self.assertAlmostEqual(single_type_report(10, .5), .5, 12)
        self.assertAlmostEqual(single_type_report(9, .2) + single_type_report(9, .8), 1.0, 12)

    def test_report_is_maximiser(self):
        ns, ps = [6, 6], [.1, .5]
        r = optimal_reports(ns, ps)
        base = expected_bss(ns, ps, r)
        for i in range(2):
            for d in (-.02, .02):
                rr = list(r); rr[i] += d
                self.assertLess(expected_bss(ns, ps, rr), base)

    def test_improper(self):
        self.assertGreater(expected_bss([5], [.1], [single_type_report(5, .1)]), expected_bss([5], [.1], [.1]))

    def test_asymptotic_bias(self):
        for p in (.1, .3):
            n = 6400
            self.assertAlmostEqual(n * (single_type_report(n, p) - p), -(1 - 2 * p), delta=.03)

    def test_loo_proper(self):
        ns, ps = [8, 8], [.1, .5]
        v = expected_loo(ns, ps, [.1, .5])
        for r1 in (.05, .2):
            self.assertLess(expected_loo(ns, ps, [r1, .5]), v)
        for r2 in (.4, .6):
            self.assertLess(expected_loo(ns, ps, [.1, r2]), v)

    def test_monte_carlo(self):
        ns, ps = [6, 6], [.1, .5]
        r = optimal_reports(ns, ps)
        self.assertAlmostEqual(expected_bss(ns, ps, r), simulate_report(ns, ps, r, 60000, 3), delta=.01)

    def test_leakage(self):
        alone = single_type_report(10, .1)
        pooled = optimal_reports([10, 10], [.1, .5])[0]
        self.assertNotAlmostEqual(alone, pooled, 2)


if __name__ == "__main__":
    unittest.main()
