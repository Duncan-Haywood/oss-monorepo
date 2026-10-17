import math, unittest
from contest_precision import *


class T(unittest.TestCase):
    def test_a2_closed_form(self):
        self.assertAlmostEqual(a_n(2), 1 / (2 * math.sqrt(math.pi)), 9)

    def test_a3_equals_a2(self):
        # int phi^2 (2 Phi - 1) = 0 by symmetry, so a_3 = a_2 exactly
        self.assertAlmostEqual(a_n(3), a_n(2), 9)

    def test_a_decreasing_after_three(self):
        self.assertGreater(a_n(3), a_n(5))
        self.assertGreater(a_n(5), a_n(10))

    def test_win_prob_symmetric(self):
        for n in (2, 3, 6):
            self.assertAlmostEqual(win_prob(0, n), 1 / n, 9)

    def test_win_prob_slope_is_a_n(self):
        h = 1e-4
        for n in (2, 4):
            s = (win_prob(h, n) - win_prob(-h, n)) / (2 * h)
            self.assertAlmostEqual(s, a_n(n), 6)

    def test_monte_carlo_win_prob(self):
        self.assertAlmostEqual(mc_win_prob(0.7, 3, trials=60000, seed=1), win_prob(0.7, 3), delta=0.01)

    def test_foc_holds_at_eq_effort(self):
        V, sig, n = 4.0, 1.0, 4
        e = eq_effort(V, sig, n)
        h = 1e-4
        d = (utility(e + h, e, V, sig, n) - utility(e - h, e, V, sig, n)) / (2 * h)
        self.assertAlmostEqual(d, 0, 6)

    def test_pure_eq_below_threshold_fails_above(self):
        n = 5
        lm = 6.106
        self.assertLessEqual(deviation_gap(0.9 * lm, 1.0, n), 1e-6)
        self.assertGreater(deviation_gap(1.2 * lm, 1.0, n), 1e-3)

    def test_threshold_below_participation(self):
        self.assertLess(lam_max(4), lam_participation(4))

    def test_effort_scales_with_sqrt_m(self):
        s, V, n = 1.0, 0.5, 3
        e1 = eq_effort(V, s / math.sqrt(4), n)
        e2 = eq_effort(V, s / math.sqrt(16), n)
        self.assertAlmostEqual(e2 / e1, 2.0, 9)

    def test_best_m_respects_cap(self):
        m, cap, free = best_m(1.0, 1.0, 3, 1e-6)
        self.assertEqual(m, cap)
        self.assertLess(cap, free)


if __name__ == "__main__":
    unittest.main()
