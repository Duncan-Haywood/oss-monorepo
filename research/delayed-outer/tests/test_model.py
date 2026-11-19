import math, unittest
from delayed_outer import *

A = [1.0, 0.25, 0.05]


class T(unittest.TestCase):
    def test_tau0_matches_noisy_local_sgd(self):
        eta, sg, N, H, al = 0.3, 0.8, 6, 5, 0.7
        want = sum(0.5 * a * al * (worker_noise(eta, a, sg, H) / N) / (curvature(eta, a, H) * (2 - al * curvature(eta, a, H))) for a in A)
        self.assertAlmostEqual(floor(A, eta, sg, N, H, al, 0), want, places=12)

    def test_yule_walker_matches_closed_forms(self):
        for c in (0.1, 0.5, 0.9):
            self.assertAlmostEqual(var_delay(c, 0, 2.0), var_delay_closed(c, 0, 2.0), places=12)
        for c in (0.1, 0.5, 0.9):
            self.assertAlmostEqual(var_delay(c, 1, 2.0), var_delay_closed(c, 1, 2.0), places=12)

    def test_stability_limit_is_spectral_radius_one(self):
        for tau in range(0, 7):
            cm = c_max(tau)
            self.assertLess(spectral_radius(cm * 0.999, tau), 1.0)
            self.assertGreater(spectral_radius(cm * 1.001, tau), 1.0)
            self.assertTrue(math.isinf(var_delay(cm * 1.001, tau)))

    def test_known_limits(self):
        self.assertAlmostEqual(c_max(0), 2.0)
        self.assertAlmostEqual(c_max(1), 1.0)
        self.assertAlmostEqual(c_max(2), 2 * math.sin(math.pi / 10))

    def test_double_root_rate(self):
        for tau in (1, 2, 5):
            self.assertAlmostEqual(spectral_radius(c_fast(tau), tau, 20000), rate_fast(tau), places=4)
            for c in (0.7 * c_fast(tau), 1.3 * c_fast(tau)):
                self.assertGreater(spectral_radius(c, tau, 20000), rate_fast(tau) - 1e-9)

    def test_variance_diverges_at_limit(self):
        self.assertGreater(var_delay(c_max(3) * 0.9999, 3), 1e3 * var_delay(0.1, 3))

    def test_delay_raises_floor_at_fixed_step(self):
        f = [floor(A, 0.2, 1.0, 8, 4, 0.3, t) for t in range(4)]
        self.assertTrue(all(f[i] < f[i + 1] for i in range(3)))

    def test_small_step_floor_is_delay_free(self):
        f0, f4 = floor(A, 0.2, 1.0, 8, 4, 1e-3, 0), floor(A, 0.2, 1.0, 8, 4, 1e-3, 4)
        self.assertAlmostEqual(f4 / f0, 1.0, delta=0.01)

    def test_alpha_for_floor_hits_target(self):
        al = alpha_for_floor(A, 0.2, 1.0, 8, 4, 2, 0.01)
        self.assertAlmostEqual(floor(A, 0.2, 1.0, 8, 4, al, 2), 0.01, places=8)

    def test_round_time(self):
        self.assertEqual(round_time(1.0, 3.0, 0), 4.0)
        self.assertEqual(round_time(1.0, 3.0, 3), 1.0)
        self.assertEqual(round_time(1.0, 3.0, 9), 1.0)

    def test_simulation_matches_formula(self):
        eta, sg, N, H, al = 0.2, 1.0, 4, 3, 0.4
        for tau in (0, 2):
            th = floor([0.5], eta, sg, N, H, al, tau)
            emp = simulate_floor(0.5, eta, sg, N, H, al, tau, 120000, 500, seed=tau + 1)
            self.assertAlmostEqual(emp / th, 1.0, delta=0.05)


class Audit20261119(unittest.TestCase):
    """Pins added after the 2026-11-19 quality audit: rounds_to_shrink was untested
    (a log(r) -> log(r*r) mutant left every test green), and the README stated
    tau* = ceil(L/Tc) unconditionally although it holds at one target floor."""

    def test_rounds_to_shrink_tau0_closed_form(self):
        eta, H, al = 0.2, 4, 0.5
        a = 1.0
        r = abs(1 - al * curvature(eta, a, H))
        self.assertAlmostEqual(rounds_to_shrink([a], eta, H, al, 0, 1e3), math.log(1e3) / -math.log(r), places=6)

    def _best_tau(self, a0, L):
        eta, sg, N, H = 0.2, 1.0, 8, 4
        F = floor(A, eta, sg, N, H, a0, 0)
        best = None
        for t in range(0, 17):
            al = alpha_for_floor(A, eta, sg, N, H, t, F)
            w = rounds_to_shrink(A, eta, H, al, t, 1e3) * round_time(1.0, L, t)
            if best is None or w < best[1]:
                best = (t, w)
        return best

    def test_ceil_rule_at_the_tested_floor(self):
        t, w = self._best_tau(0.3, 7)
        self.assertEqual(t, 7)
        self.assertAlmostEqual(w, 855, delta=2)

    def test_ceil_rule_fails_at_a_looser_floor(self):
        self.assertEqual(self._best_tau(2.0, 7)[0], 2)
        self.assertEqual(self._best_tau(3.0, 7)[0], 0)


if __name__ == "__main__":
    unittest.main()
