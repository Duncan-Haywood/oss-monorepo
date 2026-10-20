import math, random, unittest
from intent_twin import *


class M(unittest.TestCase):
    def test_err_closed_form(self):
        self.assertAlmostEqual(err(0.75, 1), 0.25)
        self.assertAlmostEqual(err(0.5, 7), 0.5)
        self.assertAlmostEqual(err(0.9, 2), 1 / 82)     # 1/(1+81)

    def test_time_matches_random_walk(self):
        # p=0.75, h=2: E[T] = 2(1-2*err)/(0.5), err = 1/(1+9)
        self.assertAlmostEqual(exp_time(0.75, 2), 2 * (1 - 0.2) / 0.5)
        self.assertAlmostEqual(exp_time(0.5, 5), 25.0)

    def test_simulation_matches(self):
        rng = random.Random(1)
        for p, h in ((0.7, 3), (0.6, 5), (0.5, 4)):
            e, t = simulate(rng, p, h, 40000)
            self.assertAlmostEqual(e, err(p, h), delta=0.01)
            self.assertAlmostEqual(t, exp_time(p, h), delta=0.08 * exp_time(p, h))

    def test_design_and_optimism(self):
        h = design_h(0.9, 1e-3)
        self.assertEqual(h, 4)
        self.assertLessEqual(err(0.9, h), 1e-3)
        self.assertGreater(err(0.9, h - 1), 1e-3)
        self.assertGreater(err(0.7, h), 10 * err(0.9, h))   # a too-rational twin is optimistic
        self.assertLess(err(0.95, h), err(0.9, h))          # a too-irrational twin is conservative

    def test_theta_and_population(self):
        self.assertAlmostEqual(theta(0.7, 0.7), 1.0)
        # a degenerate (very concentrated) Beta reproduces the point value
        self.assertAlmostEqual(beta_pop_err(700, 300, 4, N=4000), err(0.7, 4), delta=2e-3)
        # Jensen: heterogeneity around the same mean raises the error at h=6
        self.assertGreater(beta_pop_err(21, 9, 6, N=4000), err(0.7, 6))
        self.assertGreater(design_h_pop(21, 9, 0.05, N=4000), design_h(0.7, 0.05))
        # some humans with p < 1/2 put a floor under the population error, so a tight target is unreachable
        self.assertIsNone(design_h_pop(21, 9, 1e-2, N=4000))

    def test_demo_design(self):
        me, pbad, mt, mh = demo_design_stats(0.7, 20, 1e-2)
        self.assertGreater(pbad, 0.0)                      # some calibration sets give a threshold that misses the target
        me2, pbad2, mt2, mh2 = demo_design_stats(0.7, 20, 1e-2, z=1.645)
        self.assertLess(pbad2, pbad)
        self.assertGreater(mt2, mt)                        # the pessimistic design costs time


if __name__ == "__main__":
    unittest.main()
