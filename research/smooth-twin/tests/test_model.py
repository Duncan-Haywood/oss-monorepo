import math, unittest
from smooth_twin import *


class T(unittest.TestCase):
    def test_sigmoid_stable(self):
        self.assertAlmostEqual(sig(0), 0.5)
        self.assertAlmostEqual(sig(800), 1.0)
        self.assertAlmostEqual(sig(-800), 0.0)
        self.assertAlmostEqual(sig(2) + sig(-2), 1.0)

    def test_grad_matches_finite_difference(self):
        for tau in (0.05, 0.2):
            for th in (-0.3, 0.05, 0.2):
                h = 1e-6
                fd = (twin_value(th + h, tau) - twin_value(th - h, tau)) / (2 * h)
                self.assertAlmostEqual(twin_grad(th, tau), fd, places=5)

    def test_optimum_matches_bruteforce(self):
        for tau in (0.03, 0.1, 0.2):
            n = 100000
            best = max(range(n + 1), key=lambda i: twin_value(-0.6 + 1.1 * i / n, tau))
            self.assertAlmostEqual(twin_optimum(tau), -0.6 + 1.1 * best / n, places=4)

    def test_upper_threshold_closed_form(self):
        self.assertAlmostEqual(upper_threshold(), R / (8 * C * M), places=6)
        self.assertGreater(twin_optimum(0.24), 0)
        self.assertLess(twin_optimum(0.26), 0)

    def test_small_tau_law(self):
        t = twin_optimum(0.01)
        self.assertLess(abs(overshoot_asymptote(0.01) / t - 1), 0.03)

    def test_trap_threshold_and_ascent(self):
        tc = trap_threshold()
        self.assertEqual(n_local_maxima(tc - 0.005), 2)
        self.assertEqual(n_local_maxima(tc + 0.005), 1)
        th, _, _ = gd(tc - 0.02)
        self.assertLess(th, 0.0)
        th, _, ok = gd(tc + 0.02)
        self.assertTrue(ok)
        self.assertAlmostEqual(th, twin_optimum(tc + 0.02), places=4)

    def test_real_gradient_is_zero_at_nominal(self):
        self.assertEqual(real_value(-M), 0.0)
        self.assertEqual(real_value(-M - 1e-3) < 0, True)
        self.assertAlmostEqual(real_regret(0.0), 0.0)
        self.assertAlmostEqual(real_regret(-M), real_opt())

    def test_anneal_reaches_small_tau_branch(self):
        th = anneal(0.2, 0.02)
        self.assertAlmostEqual(th, twin_optimum(0.02), places=4)
        self.assertLess(real_regret(th), real_regret(twin_optimum(0.1)))

    def test_regret_edge_consistent(self):
        for th in (-0.2, 0.0, 0.3):
            self.assertAlmostEqual(real_regret_edge(th, 0.0), real_regret(th))

    def test_hard_twin_half_cliff(self):
        self.assertAlmostEqual(exp_regret(0.0, 0.05), 0.5, delta=0.02)

    def test_best_pose_beats_neighbours(self):
        th, v = best_pose(0.05)
        self.assertGreater(th, 0.0)
        self.assertLessEqual(v, exp_regret(th + 0.05, 0.05) + 1e-9)
        self.assertLessEqual(v, exp_regret(th - 0.05, 0.05) + 1e-9)


if __name__ == "__main__":
    unittest.main()
