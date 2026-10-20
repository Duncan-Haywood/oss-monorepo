import math
import random
import unittest

from alias_twin.model import (wrap, scene, measure, ls, unfold_estimate, naive_bias, twin_rmse, confusion_energy,
                              pair_error_prob, wrapped_cost)


class T(unittest.TestCase):
    def test_wrap_range_and_identity(self):
        vu = 10.0
        for x in (-35.0, -10.0, -9.99, 0.0, 9.99, 10.0, 23.4, 50.0):
            w = wrap(x, vu)
            self.assertTrue(-vu <= w < vu)
            self.assertAlmostEqual((x - w) / (2 * vu), round((x - w) / (2 * vu)), 12)
        self.assertEqual(wrap(3.0, vu), 3.0)
        self.assertAlmostEqual(wrap(13.0, vu), -7.0)

    def test_naive_exact_below_vu(self):
        rng = random.Random(1)
        c = scene(50, 60, rng)
        m = measure(7.0, c, 0.0, 10.0, rng)
        self.assertAlmostEqual(ls(m, c), 7.0, 12)

    def test_naive_bias_zero_below_vu(self):
        for v in (1.0, 5.0, 10.0):
            self.assertEqual(naive_bias(v, 60, 10.0), 0.0)
        self.assertLess(naive_bias(12.0, 60, 10.0), 0.0)

    def test_naive_bias_matches_quadrature(self):
        # fine deterministic angle grid, noiseless
        fov, vu, v = 60.0, 10.0, 25.0
        N = 200000
        th = [math.radians(fov) * (2 * (i + 0.5) / N - 1) for i in range(N)]
        c = [math.cos(t) for t in th]
        m = [wrap(v * ci, vu) for ci in c]
        self.assertAlmostEqual(ls(m, c) - v, naive_bias(v, fov, vu), 3)

    def test_unfold_recovers_noiseless(self):
        rng = random.Random(2)
        c = scene(30, 60, rng)
        for v in (3.0, 14.0, 37.0):
            m = measure(v, c, 0.0, 10.0, rng)
            self.assertAlmostEqual(unfold_estimate(m, c, 10.0, 60.0), v, 9)

    def test_no_fold_matches_twin_rmse(self):
        rng = random.Random(3)
        c = scene(30, 60, rng)
        e = []
        for _ in range(4000):
            m = measure(5.0, c, 0.2, 10.0, rng, fold=False)
            e.append((ls(m, c) - 5.0) ** 2)
        self.assertAlmostEqual(math.sqrt(sum(e) / len(e)) / twin_rmse(c, 0.2), 1.0, delta=0.03)

    def test_confusion_energy_is_wrapped_cost_gap(self):
        rng = random.Random(4)
        c = scene(30, 40, rng)
        E, D = confusion_energy(c, 10.0)
        m = measure(20.0, c, 0.0, 10.0, rng)
        # noiseless: cost at truth is 0; cost at v + D is the k = 1 residual energy when no further wraps occur
        self.assertAlmostEqual(wrapped_cost(m, c, 20.0 + D, 10.0), E, 8)

    def test_narrow_fov_confusable(self):
        rng = random.Random(5)
        narrow = scene(30, 5, rng)
        wide = scene(30, 60, rng)
        self.assertGreater(pair_error_prob(narrow, 0.1, 10.0), 0.1)
        self.assertLess(pair_error_prob(wide, 0.1, 10.0), 1e-6)


if __name__ == "__main__":
    unittest.main()
