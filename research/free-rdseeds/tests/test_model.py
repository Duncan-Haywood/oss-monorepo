import math, random, unittest
from free_qmcdr import smooth, jump
from free_rdseeds import *


class M(unittest.TestCase):
    def test_alpha_in_unit_interval_and_kinds(self):
        for kind in ("rd", "sqrt"):
            a = alpha(kind, 5)
            self.assertEqual(len(a), 5)
            self.assertTrue(all(0 <= x < 1 for x in a))
        with self.assertRaises(ValueError):
            alpha("nope", 3)

    def test_rd_matches_free_qmcdr_sampler(self):
        from free_qmcdr import sample
        p = sample("rd", 20, 4, random.Random("x"))
        q = kron_sample("rd", 20, 4, random.Random("x"))
        self.assertEqual(p, q)

    def test_points_in_unit_cube(self):
        for kind in ("rd", "sqrt", "random"):
            for pt in kron_sample(kind, 50, 3, random.Random(1)):
                self.assertTrue(all(0 <= x < 1 for x in pt))

    def test_resonance_detects_rational_generator(self):
        score, k = resonance([0.5, 0.25], kmax=4)
        self.assertEqual(score, 0.0)
        self.assertTrue(resonance([math.sqrt(2) % 1], kmax=4)[0] > 0.1)

    def test_unbiased_for_smooth_mean(self):
        g = smooth(3)
        est = sum(g.estimate(kron_sample("sqrt", 64, 3, random.Random(i))) for i in range(300)) / 300
        self.assertAlmostEqual(est, 1.0, delta=0.02)

    def test_rmse_deterministic(self):
        g = jump(2)
        self.assertEqual(rmse_at(g, "rd", 32, 5, "s"), rmse_at(g, "rd", 32, 5, "s"))


if __name__ == "__main__":
    unittest.main()
