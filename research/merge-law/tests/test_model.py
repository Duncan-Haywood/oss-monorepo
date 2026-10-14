import random, unittest
from merge_law import *


class T(unittest.TestCase):
    def test_m1_reduces_to_single_task(self):
        # one module, a=1: exact convergence -> |e|^2 = 1-p, seen loss 0, fresh loss p(1-p)
        d, r = 12, 3
        p = r / d
        self.assertAlmostEqual(norm2(d, r, 1, 1.0), 1 - p, 12)
        self.assertAlmostEqual(seen_loss(d, r, 1, 1.0), 0.0, 12)
        self.assertAlmostEqual(fresh_loss(d, r, 1, 1.0), p * (1 - p), 12)

    def test_best_scale_is_argmin(self):
        d, r = 20, 4
        for m in (2, 5, 9, 30):
            a = best_scale(d, r, m)
            self.assertAlmostEqual(norm2(d, r, m, a), best_norm2(d, r, m), 12)
            for da in (-0.05, 0.05):
                self.assertGreater(norm2(d, r, m, a + da), norm2(d, r, m, a))

    def test_limits(self):
        d, r = 16, 2
        p = r / d
        self.assertAlmostEqual(norm2(d, r, 400, 1 / 400), 1 - 2 * p + p * p + p * (1 - p) / 400, 12)
        self.assertLess(best_norm2(d, r, 10 ** 6), 1e-5)

    def test_merge_beats_no_merge_and_sequential_wins_norm(self):
        d, r = 24, 3
        for m in (2, 8, 32):
            self.assertLess(best_norm2(d, r, m), 1 - r / d + 1e-12)
            self.assertLess(seq_norm2(d, r, m), best_norm2(d, r, m))

    def test_speedup_sane(self):
        d, r = 32, 4
        self.assertAlmostEqual(speedup(d, r, 1), 1.0, 12)
        s = [speedup(d, r, m) for m in (1, 2, 4, 8, 16, 64)]
        self.assertEqual(s, sorted(s))
        self.assertLess(efficiency(d, r, 16), efficiency(d, r, 2))
        self.assertLessEqual(speedup(d, r, 2), 2.0)

    def test_simulation_matches_law(self):
        rng = random.Random(3)
        d, r, m = 12, 3, 4
        for a in (1 / m, best_scale(d, r, m), 1.0):
            n2, sl, fl = simulate_merge(d, r, m, a, 6000, rng)
            self.assertAlmostEqual(n2, norm2(d, r, m, a), delta=0.02)
            self.assertAlmostEqual(sl, seen_loss(d, r, m, a), delta=0.01)
            self.assertAlmostEqual(fl, fresh_loss(d, r, m, a), delta=0.01)

    def test_rounds_match_geometric(self):
        rng = random.Random(4)
        d, r, m = 12, 3, 5
        sim = simulate_rounds(d, r, m, 4, 4000, rng)
        for k in range(5):
            self.assertAlmostEqual(sim[k], best_norm2(d, r, m) ** k, delta=0.02)


if __name__ == "__main__":
    unittest.main()
