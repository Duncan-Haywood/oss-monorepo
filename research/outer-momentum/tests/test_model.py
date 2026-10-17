import math, unittest
from outer_momentum import *


def grid(kap, n=60):
    return [kap ** (i / (n - 1)) / kap for i in range(n)]


class T(unittest.TestCase):
    def test_curvature_saturates_and_matches_inner_loop(self):
        self.assertAlmostEqual(curvature(1.0, 1.0, 3), 1.0)             # eta*a = 1: one step solves the mode
        self.assertAlmostEqual(curvature(0.1, 2.0, 5), 1 - 0.8 ** 5)
        out = simulate([2.0], 0.1, 5, 1.0, 0.0, "heavy", 1)              # alpha=1, beta=0 is plain averaging
        self.assertAlmostEqual(out[1], 0.8 ** 5, places=12)

    def test_heavy_ball_optimum_makes_every_mode_radius_sqrt_beta(self):
        lo, hi = 0.02, 1.0
        a, b, q = hb_optimal(lo, hi)
        self.assertAlmostEqual(b, q * q, places=12)
        for j in range(101):
            s = lo + (hi - lo) * j / 100
            self.assertAlmostEqual(mode_radius(s, a, b, "heavy"), q, places=6)

    def test_heavy_ball_beats_every_grid_alpha_beta(self):
        lo, hi = 0.05, 1.0
        best = hb_optimal(lo, hi)[2]
        ss = [lo + (hi - lo) * j / 40 for j in range(41)]
        for al in [0.2 * i for i in range(1, 15)]:
            for be in [0.05 * i for i in range(0, 20)]:
                self.assertGreaterEqual(rate(ss, al, be, "heavy"), best - 1e-9)

    def test_rate_matches_literal_simulation(self):
        a_list = grid(200, 12)
        for kind, al, be in (("heavy", 0.9, 0.6), ("nesterov", 0.7, 0.9)):
            for H in (1, 7, 40):
                ss = spectrum(a_list, 1.0, H)
                rho = rate(ss, al, be, kind)
                tr = simulate(a_list, 1.0, H, al, be, kind, 600)
                emp = (tr[-1] / tr[-201]) ** (1 / 200)
                self.assertAlmostEqual(emp, rho, delta=0.02 * max(rho, 0.1) + 5e-3)

    def test_inner_steps_compress_condition_number(self):
        kap = 1000
        self.assertAlmostEqual(kappa_H(1 / kap, 1.0, 1.0, 1), kap, places=8)
        prev = kap + 1
        for H in (1, 2, 8, 64, 512, 4096):
            k = kappa_H(1 / kap, 1.0, 1.0, H)
            self.assertLess(k, prev)
            prev = k
        self.assertAlmostEqual(kappa_H(1 / kap, 1.0, 1.0, 10) / (kap / 10), 1.0, delta=0.03)
        self.assertLess(kappa_H(1 / kap, 1.0, 1.0, 20000), 1.0001)

    def test_optimal_sync_interval_is_the_communication_cost(self):
        for kap, C in ((10000, 10), (10000, 100), (10000, 1000)):
            H, _ = best_H(kap, C, 1e-6)
            self.assertLess(abs(H - C) / C, 0.06)

    def test_momentum_wins_and_plain_averaging_wants_large_H(self):
        kap, C = 10000, 100
        Hm, tm = best_H(kap, C, 1e-6)
        Hg, tg = best_H(kap, C, 1e-6, momentum=False)
        self.assertLess(tm, tg / 4)
        self.assertGreater(Hg, 5 * Hm)

    def test_default_diloco_momentum_is_far_from_tuned_at_large_H(self):
        kap, H = 1000, 1024
        ss = [curvature(1.0, a, H) for a in grid(kap)]
        lo, hi = min(ss), max(ss)
        tuned = hb_optimal(lo, hi)[2]
        dflt = rate([lo + (hi - lo) * j / 200 for j in range(201)], 0.7, 0.9, "nesterov")
        self.assertGreater(rounds(dflt, 1e-6) / rounds(tuned, 1e-6), 5)

    def test_rounds(self):
        self.assertAlmostEqual(rounds(0.1, 1e-6), 6.0)
        self.assertEqual(rounds(0.0, 1e-6), 0.0)


if __name__ == "__main__":
    unittest.main()
