import math, unittest
from horizon_twin import *

A, B = 0.9, 1.0
CFGS = [(1.0, 0.1), (1.0, 1.0), (1.0, 5.0)]


class M(unittest.TestCase):
    def test_matched_twin_long_horizon_is_optimal(self):
        for q, r in CFGS:
            self.assertAlmostEqual(regret(gain(A, B, q, r, 400), A, B, q, r), 0.0, places=8)

    def test_one_step_gain_is_zero_and_two_step_closed_form(self):
        for q, r in CFGS:
            self.assertEqual(gain(1.3, B, q, r, 1), 0.0)
            self.assertAlmostEqual(gain(1.3, B, q, r, 2), h2_gain(1.3, B, q, r), places=12)

    def test_gain_increases_with_horizon(self):
        for q, r in CFGS:
            for at in (0.5, 0.9, 1.8, 2.7):
                g = gains(at, B, q, r, 40)
                self.assertTrue(all(y >= x - 1e-12 for x, y in zip(g, g[1:])))

    def test_terminal_cost_at_riccati_removes_horizon_dependence(self):
        q, r, at = 1.0, 1.0, 1.8
        K = riccati_gain(at, B, q, r)
        # P_inf from K: K = a b P/(r + b^2 P)  =>  P = r K / (a b - b^2 K)
        P = r * K / (at * B - B * B * K)
        for H in (1, 2, 5, 20):
            self.assertAlmostEqual(gain(at, B, q, r, H, PT=P), K, places=9)

    def test_overestimated_pole_short_horizon_beats_long(self):
        for q, r in CFGS[1:]:
            H, J, Jlong = best_horizon(A, 1.5 * A, B, q, r)
            self.assertLess(H, 5)
            self.assertLess(J, Jlong)

    def test_underestimated_pole_longer_is_better(self):
        for q, r in CFGS:
            Js = [cost(K, A, B, q, r) for K in gains(0.6 * A, B, q, r, 30)][1:]
            self.assertTrue(all(y <= x + 1e-12 for x, y in zip(Js, Js[1:])))

    def test_long_horizon_unstable_while_short_is_stable(self):
        bad = unstable_horizons(A, 3 * A, B, 1.0, 1.0)
        self.assertIn(60, bad)
        self.assertNotIn(2, bad)   # K_2 = a_t b q/(r+b^2 q) = 1.35 leaves pole -0.45

    def test_two_step_instability_edge_closed_form(self):
        for q, r in CFGS:
            m = (1 + A) * (r + B * B * q) / (A * B * q)
            self.assertLess(cost(h2_gain(m * A * 0.999, B, q, r), A, B, q, r), math.inf)
            self.assertEqual(cost(h2_gain(m * A * 1.001, B, q, r), A, B, q, r), math.inf)

    def test_twin_claim_decreases_with_horizon(self):
        for at in (0.5, 0.9, 1.5, 2.0):
            c = [claim(K, at, B, 1.0, 1.0) for K in gains(at, B, 1.0, 1.0, 30)][1:]
            self.assertTrue(all(y <= x + 1e-12 for x, y in zip(c, c[1:])))

    def test_simulation_matches_exact_cost(self):
        K = gain(1.5 * A, B, 1.0, 1.0, 2)
        J = cost(K, A, B, 1.0, 1.0, 1.0)
        self.assertAlmostEqual(simulate_cost(K, A, B, 1.0, 1.0, 1.0, 300000, seed=3) / J, 1.0, delta=0.02)


if __name__ == "__main__":
    unittest.main()
