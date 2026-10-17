import math, random, unittest
from control_twin import *

P = dict(a=0.9, b=1.0, q=1.0, r=0.1, W=1.0)


class M(unittest.TestCase):
    def test_matched_twin_has_no_regret(self):
        for a, b in ((0.9, 1.0), (1.2, 0.5), (0.3, 2.0)):
            self.assertAlmostEqual(regret(a, b, 1.0, 0.2, 1.0, a, b), 0.0, places=9)

    def test_cost_at_lqr_gain_is_riccati(self):
        for a, b, q, r in ((0.9, 1, 1, 0.1), (1.2, 0.5, 2, 1), (0.3, 2, 0.5, 0.05)):
            K = lqr_gain(a, b, q, r)
            self.assertAlmostEqual(cost(K, a, b, q, r, 1.0), opt_cost(a, b, q, r, 1.0), places=9)

    def test_lqr_gain_minimises_cost(self):
        K = lqr_gain(0.9, 1.0, 1.0, 0.1)
        for d in (-0.02, 0.02):
            self.assertGreater(cost(K + d, 0.9, 1.0, 1.0, 0.1, 1.0), cost(K, 0.9, 1.0, 1.0, 0.1, 1.0))

    def test_underestimated_actuator_destabilises(self):
        self.assertEqual(regret(0.9, 1.0, 1.0, 1e-4, 1.0, 0.9, 0.3), math.inf)
        self.assertTrue(regret(0.9, 1.0, 1.0, 1e-4, 1.0, 0.9, 3.0) < math.inf)

    def test_cliff_location_low_side(self):
        (_, m), = unstable_bands(0.9, 1.0, 1.0, 1e-8)
        self.assertAlmostEqual(m, 0.9 / 1.9, delta=2e-3)   # r -> 0 limit a/(a+1)

    def test_simulation_matches_exact_cost(self):
        rng = random.Random(1)
        K = lqr_gain(0.9, 0.7, 1.0, 0.1)
        self.assertAlmostEqual(simulate_cost(K, 0.9, 1.0, 1.0, 0.1, 1.0, 300000, rng) /
                               cost(K, 0.9, 1.0, 1.0, 0.1, 1.0), 1.0, delta=0.03)

    def test_dither_cost_matches_simulation(self):
        rng = random.Random(2)
        K = lqr_gain(0.9, 1.0, 1.0, 0.1)
        ex = dither_cost(K, 0.9, 1.0, 1.0, 0.1, 1.0, 0.5)
        self.assertAlmostEqual(simulate_cost(K, 0.9, 1.0, 1.0, 0.1, 1.0, 300000, rng, d=0.5) / ex, 1.0, delta=0.03)
        self.assertAlmostEqual(dither_cost(K, 0.9, 1.0, 1.0, 0.1, 1.0, 0.0), cost(K, 0.9, 1.0, 1.0, 0.1, 1.0), places=12)

    def test_no_dither_not_identifiable(self):
        self.assertEqual(info_cov(0.5, 0.9, 1.0, 1.0, 0.0, 100), math.inf)
        self.assertIsNone(identify(0.5, 0.9, 1.0, 1.0, 0.0, 500, random.Random(3)))

    def test_identify_covariance_matches_theory(self):
        K, a, b, W, d, n = 0.6, 0.9, 1.0, 1.0, 0.7, 400
        rng = random.Random(4)
        est = [identify(K, a, b, W, d, n, rng) for _ in range(1500)]
        vb = sum((e[1] - b) ** 2 for e in est) / len(est)
        va = sum((e[0] - a) ** 2 for e in est) / len(est)
        (tva, _), (_, tvb) = info_cov(K, a, b, W, d, n)
        self.assertAlmostEqual(vb / tvb, 1.0, delta=0.12)
        self.assertAlmostEqual(va / tva, 1.0, delta=0.12)

    def test_hessian_gradient_zero_and_psd(self):
        haa, hab, hbb = regret_hessian(0.9, 1.0, 1.0, 0.1, 1.0)
        self.assertGreater(haa, 0); self.assertGreater(hbb, 0); self.assertLess(abs(haa * hbb - hab * hab), 1e-3 * haa * hbb)  # rank one: regret depends on (a,b) only via K


if __name__ == "__main__":
    unittest.main()
