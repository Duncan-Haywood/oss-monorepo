import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_transfer import transfer as T

X = [20.0, 28.0, 0.15, 7.0, 3]


class TransferTests(unittest.TestCase):
    def test_width_zero_world_has_no_shift_or_tolerance(self):
        w = T.draw_world(5, width=0.0)
        self.assertEqual((w["d_mean"], w["e_sd"], w["wet"], w["p_scale"], w["f_scale"]), (28.0, 4.0, 0.3, 1.0, 1.0))
        self.assertTrue(np.allclose(T.build(X, w), X))

    def test_world_is_reproducible_and_population_shifts(self):
        a, b = T.population(T.draw_world(3)), T.population(T.draw_world(3))
        self.assertTrue(np.array_equal(a["d"], b["d"]))
        small = dict(T.draw_world(3, 0.0), d_mean=22.0)
        big = dict(small, d_mean=34.0)
        self.assertLess(T.population(small)["d"].mean(), T.population(big)["d"].mean())

    def test_build_applies_tolerance(self):
        w = T.draw_world(7)
        self.assertFalse(np.allclose(T.build(X, w), X))
        self.assertGreaterEqual(T.build([1.0, 20, 1, 5, 3], w)[0], 1.0)

    def test_over_cap_design_scores_minus_one_but_copy_over_cap_does_not(self):
        self.assertEqual(T.score([25, 40, 10, 8, 4], T.draw_world(1)), -1.0)
        edge = [25.0, 30.0, 0.15, 7.98, 3]
        w = dict(T.draw_world(2), tol_F=0.0, tol_E=0.0, tol_w=0.0, f_scale=1.0)
        self.assertGreater(T.score(edge, w), -1.0)

    def test_score_is_deterministic(self):
        w = T.draw_world(4)
        self.assertEqual(T.score(X, w), T.score(X, w))

    def test_phys_bounds_and_integer_fingers(self):
        x = T.phys(np.array([0, 0, 0, 0, 0.9]))
        self.assertEqual(list(x[:4]), list(T.LB[:4]))
        self.assertIn(x[4], (2.0, 3.0, 4.0))
        self.assertAlmostEqual(T.phys(np.ones(5))[2], T.UB[2])


if __name__ == "__main__":
    unittest.main()
