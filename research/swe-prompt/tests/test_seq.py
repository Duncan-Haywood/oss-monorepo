import math, os, random, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_prompt.seq import *


def gauss(mu, sd=1.0):
    return lambda rng: rng.gauss(mu, sd)


class T(unittest.TestCase):
    def test_z_threshold(self):
        self.assertAlmostEqual(z_threshold(0.05), 1.959964, places=4)
        self.assertAlmostEqual(z_threshold(0.01), 2.575829, places=4)

    def test_wilson_contains_point(self):
        lo, hi = wilson(237, 244)
        self.assertLess(lo, 237 / 244); self.assertGreater(hi, 237 / 244)
        self.assertEqual(wilson(0, 0), (0.0, 1.0))

    def test_fixed_n_formula(self):
        # sd 1, delta 0.5, alpha .05, power .8 -> 2*(1.96+0.8416)^2/0.25 = 62.8 -> 63
        self.assertEqual(fixed_n_pairs(1.0, 0.5), 63)

    def test_msprt_lr_grows_with_diff(self):
        self.assertLess(msprt_log_lr(0.0, 50, 1.0, 0.25), msprt_log_lr(0.5, 50, 1.0, 0.25))
        self.assertLess(msprt_log_lr(0.0, 50, 1.0, 0.25), 0.0)  # null data lowers the LR

    def test_peeking_inflates_type_one_error_and_msprt_does_not(self):
        r = simulate(gauss(0), gauss(0), n_max=200, alpha=0.05, tau2=0.25, var_floor=1e-6,
                     n_sims=600, seed=1)
        self.assertGreater(r["peek"][0], 0.15)   # far above the nominal 0.05
        self.assertLess(r["msprt"][0], 0.05)     # at or below nominal
        self.assertLess(r["fixed"][0], 0.09)

    def test_all_rules_find_a_large_effect_and_msprt_stops_early(self):
        r = simulate(gauss(0), gauss(1.0), n_max=200, alpha=0.05, tau2=1.0, var_floor=1e-6,
                     n_sims=100, seed=2)
        for k in r: self.assertGreater(r[k][0], 0.95, k)
        self.assertLess(r["msprt"][1], 100)      # stops well before n_max on average

    def test_reproducible(self):
        a = simulate(gauss(0), gauss(0.3), 50, 0.05, 0.25, 1e-6, 50, 7)
        b = simulate(gauss(0), gauss(0.3), 50, 0.05, 0.25, 1e-6, 50, 7)
        self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
