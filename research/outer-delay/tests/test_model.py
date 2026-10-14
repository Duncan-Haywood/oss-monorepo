import math, unittest
from outer_delay import *


def logspace(kap, n=12):
    return [kap ** (i / (n - 1)) / kap for i in range(n)]


class T(unittest.TestCase):
    def test_tau0_is_outer_momentum(self):
        # z^2 - (1+beta-alpha s) z + beta: heavy-ball optimum makes every mode radius sqrt(beta*)
        lo, hi = 0.02, 1.0
        k = math.sqrt(hi / lo)
        q = (k - 1) / (k + 1)
        a, b, r = tuned_hb(lo, hi, 0)
        self.assertAlmostEqual(r, q, places=12)
        for j in range(20):
            self.assertAlmostEqual(mode_radius(lo + (hi - lo) * j / 19, a, b, 0), q, places=6)

    def test_stability_bound_closed_form_matches_spectral_radius(self):
        for tau in range(0, 9):
            self.assertAlmostEqual(stable_step(tau), stable_step_bisect(tau), places=6)
        self.assertAlmostEqual(stable_step(1), 1.0, places=12)
        self.assertAlmostEqual(stable_step(2), (math.sqrt(5) - 1) / 2 * 1.0, places=12)  # golden-ratio conjugate
        self.assertAlmostEqual(stable_step(40) * (2 * 40 + 1) / math.pi, 1.0, delta=0.01)

    def test_one_round_of_delay_gives_exact_rate_kappa_over_kappa_plus_one(self):
        for k in (3.0, 10.0, 100.0, 1000.0):
            a, r = tuned_gd(1 / k, 1.0, 1)
            self.assertAlmostEqual(r, k / (k + 1), places=6)
            self.assertAlmostEqual(a, (k / (k + 1)) ** 2, places=5)

    def test_optimal_delayed_step_sits_at_the_stability_edge(self):
        k = 1000.0
        for tau in (1, 2, 4, 8):
            a, r = tuned_gd(1 / k, 1.0, tau)
            self.assertAlmostEqual(a / stable_step(tau), 1.0, delta=0.005)
            self.assertAlmostEqual((1 - r) * k / stable_step(tau), 1.0, delta=0.005)

    def test_momentum_does_not_help_under_delay(self):
        betas = [0.02 * i for i in range(0, 25)]
        for tau in (1, 2, 4):
            for k in (10.0, 100.0):
                h = tuned_hb(1 / k, 1.0, tau, betas=betas)
                g = tuned_gd(1 / k, 1.0, tau)
                self.assertEqual(h[1], 0.0)
                self.assertAlmostEqual(h[2], g[1], places=5)

    def test_interior_modes_never_exceed_endpoint_rate(self):
        for tau in (1, 3):
            k = 200.0
            a, r = tuned_gd(1 / k, 1.0, tau)
            ss = [1 / k + (1 - 1 / k) * j / 40 for j in range(41)]
            self.assertLessEqual(rate(ss, a, 0.0, tau), r + 1e-9)

    def test_rate_matches_literal_simulation(self):
        a_list = logspace(100, 8)
        for tau, alpha, beta in ((1, 0.9, 0.0), (3, 0.4, 0.0), (2, 0.3, 0.3)):
            for H in (1, 10):
                ss = [curvature(1.0, a, H) for a in a_list]
                rho = rate(ss, alpha, beta, tau)
                tr = simulate(a_list, 1.0, H, alpha, beta, tau, 3000)
                emp = (tr[-1] / tr[-501]) ** (1 / 500)
                self.assertAlmostEqual(emp, rho, delta=0.004)

    def test_overlap_never_beats_blocking_average_asymptotically(self):
        vals = [overlap_gain_bound(t) for t in range(0, 60)]
        self.assertAlmostEqual(vals[0], 1.0, places=12)
        self.assertAlmostEqual(vals[1], 1.0, places=12)
        self.assertTrue(all(v <= 1 + 1e-12 for v in vals))
        self.assertTrue(all(vals[i] > vals[i + 1] for i in range(1, 59)))
        self.assertTrue(0.78 < vals[-1] < 0.80)  # tends to pi/4

    def test_overlap_loses_in_wallclock_search(self):
        Hs = [8, 32, 128, 512, 2048]
        for k, C in ((1e3, 100), (1e3, 1000), (1e4, 1000)):
            _, _, tb = best_plan(k, C, 1e-6, Hs, [0])
            _, _, to = best_plan(k, C, 1e-6, Hs, [1, 2, 4])
            self.assertLess(tb, to)
            _, _, tp = best_plan(k, C, 1e-6, Hs, [0], momentum=False)
            self.assertLess(tp, to * 1.001)

    def test_round_time_accounting(self):
        self.assertEqual(round_time(100, 0, 500), 600)
        self.assertEqual(round_time(100, 3, 500), 300)
        self.assertEqual(round_time(100, 5, 500), 100)

    def test_fresh_fraction_above_half_makes_delay_harmless(self):
        # sufficient condition |1-a s w| + a s (1-w) < 1 <=> w > 1/2 for a s <= 1/w, for every tau
        for tau in (1, 4, 12):
            for w in (0.55, 0.75):
                for x in (0.2, 0.6, 1.0):
                    al = x / w
                    self.assertLess(mixed_radius(1.0, al, tau, w), 1.0)
        # with w < 1/2 the stable step shrinks with tau
        st = [mixed_stable_step(t, 0.25) for t in (1, 4, 16)]
        self.assertTrue(st[0] > st[1] > st[2])
        # w = 0 is the pure delay
        self.assertAlmostEqual(mixed_stable_step(4, 0.0), stable_step(4), places=6)

    def test_mixed_rate_matches_literal_simulation(self):
        a_list = logspace(50, 6)
        for tau, w, al in ((2, 0.25, 0.4), (4, 0.6, 1.2)):
            ss = [curvature(1.0, a, 4) for a in a_list]
            rho = max(mixed_radius(s, al, tau, w) for s in ss)
            tr = mixed_simulate(a_list, 1.0, 4, al, tau, w, 3000)
            emp = (tr[-1] / tr[-501]) ** (1 / 500)
            self.assertAlmostEqual(emp, rho, delta=0.004)

    def test_rounds(self):
        self.assertAlmostEqual(rounds(0.1, 1e-6), 6.0)


if __name__ == "__main__":
    unittest.main()
