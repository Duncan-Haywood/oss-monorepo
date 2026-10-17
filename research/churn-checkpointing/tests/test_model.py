import unittest, math
from churn_checkpointing import *


class T(unittest.TestCase):
    def test_segment_time_matches_mc(self):
        for w, lam, C, R in ((5, 0.05, 1, 2), (20, 0.02, 3, 0.5), (1, 0.5, 0.2, 1)):
            mc = simulate_segment(w, lam, C, R, 200000, seed=3)
            self.assertAlmostEqual(mc / seg_time(w, lam, C, R), 1.0, delta=0.01)

    def test_lambert(self):
        for x in (-0.36, -0.2, -0.05, -1e-6):
            w = lambert_w0(x); self.assertAlmostEqual(w * math.exp(w), x, places=12); self.assertGreaterEqual(w, -1)

    def test_w_opt_is_minimiser(self):
        lam, C, R = 0.03, 2.0, 5.0
        ws = w_opt(lam, C); f0 = overhead(ws, lam, C, R)
        for d in (0.99, 1.01, 0.5, 2.0): self.assertGreater(overhead(ws * d, lam, C, R), f0)
        grid = min(overhead(0.01 * i, lam, C, R) for i in range(1, 5000))
        self.assertAlmostEqual(f0, grid, delta=1e-3)

    def test_w_opt_independent_of_restart(self):
        lam, C = 0.03, 2.0; ws = w_opt(lam, C)
        for R in (0, 5, 50):
            self.assertLess(overhead(ws, lam, C, R), overhead(ws * 1.05, lam, C, R))
            self.assertLess(overhead(ws, lam, C, R), overhead(ws * 0.95, lam, C, R))

    def test_young_daly_limit(self):
        self.assertAlmostEqual(w_opt(1e-6, 1.0) / w_young(1e-6, 1.0), 1.0, delta=1e-3)
        self.assertLess(w_opt(0.1, 5.0), w_young(0.1, 5.0))  # first-order formula overshoots when lam*C is not small

    def test_sync_efficiency_decreasing_and_wall(self):
        e = [sync_efficiency(n, 1e-4, 1.0, 5.0) for n in (1, 10, 100, 1000, 10000)]
        self.assertTrue(all(a > b for a, b in zip(e, e[1:])))
        n = n_half(1e-4, 1.0, 5.0)
        self.assertGreaterEqual(sync_efficiency(n, 1e-4, 1.0, 5.0), 0.5)
        self.assertLess(sync_efficiency(n + 1, 1e-4, 1.0, 5.0), 0.5)

    def test_crossover(self):
        n = crossover_n(1e-4, 1.0, 5.0, 200.0)
        e = elastic_efficiency(1e-4, 200.0)
        self.assertLess(sync_efficiency(n, 1e-4, 1.0, 5.0), e)
        self.assertGreaterEqual(sync_efficiency(n - 1, 1e-4, 1.0, 5.0), e)

    def test_best_prefix_excludes_flaky(self):
        k, th, allth = best_prefix([0.001] * 20 + [0.05] * 20, 1.0, 5.0)
        self.assertLessEqual(k, 24); self.assertGreater(th, allth[-1])


if __name__ == "__main__":
    unittest.main()
