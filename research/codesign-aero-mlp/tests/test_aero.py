import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_mlp import aero as A

X = np.array([[0.4, 0.4]])


class ControllerTests(unittest.TestCase):
    def test_pid_path_unchanged_by_default(self):
        g = np.array([[0.5, 0.5, 0.5]])
        self.assertEqual(float(A.score(X, g, seed=3)[0][0]), float(A.score(X, g, seed=3, ctrl="pid")[0][0]))

    def test_param_count(self):
        self.assertEqual(A.NP, 31)

    def test_zero_mlp_is_open_loop(self):
        zero = np.full((1, A.NP), 0.5)          # unit 0.5 maps to parameter 0: u = 0 always
        j_mlp = A.score(X, zero, episodes=8, seed=2, ctrl="mlp")[0][0]
        j_pid0 = A.score(X, np.array([[0.0, 0.0, 0.0]]), episodes=8, seed=2)[0][0]
        self.assertLess(j_mlp, -10.0)            # does not track a +-15 deg reference
        self.assertLess(j_pid0, 0.0)

    def test_mlp_linear_regime_matches_formula(self):
        th = np.zeros((1, A.NP)); th[0, 0] = 0.5          # W1[0,0]; W2[0] below
        th[0, 4 * A.H] = 2.0
        x = np.array([[[0.1, 0.0, 0.0]]])
        self.assertAlmostEqual(float(A.mlp_u(th, x)[0, 0]), 2.0 * np.tanh(0.05), places=12)

    def test_deterministic(self):
        g = np.random.default_rng(0).random((2, A.NP))
        a = A.score(np.tile(X, (2, 1)), g, seed=1, ctrl="mlp")[0]
        self.assertTrue(np.array_equal(a, A.score(np.tile(X, (2, 1)), g, seed=1, ctrl="mlp")[0]))


class SizingTests(unittest.TestCase):
    def test_props_must_not_overlap(self):
        self.assertFalse(bool(A.size(0.08, 0.25)["feasible"]))
        self.assertTrue(bool(A.size(0.2, 0.127)["feasible"]))


if __name__ == "__main__":
    unittest.main()
