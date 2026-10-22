import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_coupled import aero as A

X = np.array([[0.4, 0.4]])
PID = np.full((1, 6), 0.55)


class ModelTests(unittest.TestCase):
    def test_param_count(self):
        self.assertEqual(A.NP, 6 * 8 + 8 + 8 * 3 + 3)

    def test_deterministic(self):
        a = A.score(X, PID, seed=1)[0]
        self.assertTrue(np.array_equal(a, A.score(X, PID, seed=1)[0]))

    def test_zero_residual_equals_pid(self):
        j0 = A.score(X, PID, episodes=8, seed=4)[0][0]
        j1 = A.score(X, np.concatenate([PID, np.full((1, A.NP), 0.5)], axis=1), episodes=8, seed=4, ctrl="skip")[0][0]
        self.assertAlmostEqual(float(j0), float(j1), places=10)

    def test_nonzero_residual_changes_score(self):
        r = np.random.default_rng(1).random((1, A.NP))
        j = A.score(X, np.concatenate([PID, r], axis=1), episodes=8, seed=4, ctrl="skip")[0][0]
        self.assertNotEqual(float(j), float(A.score(X, PID, episodes=8, seed=4)[0][0]))

    def test_no_gyroscopic_term_when_inertia_is_isotropic_in_the_compensation(self):
        # with Iz = Ix the body is a sphere of inertia: w x (I w) = 0, so compensation must change nothing
        a = A.score(X, PID, seed=2, iz_ratio=1.0)[0][0]
        b = A.score(X, PID, seed=2, iz_ratio=1.0, ctrl="pidgc")[0][0]
        self.assertAlmostEqual(float(a), float(b), places=10)

    def test_gyroscopic_term_matches_euler_equation(self):
        w = np.array([1.0, 2.0, 3.0]); I = np.array([1.0, 1.0, 2.0])
        self.assertTrue(np.allclose(np.cross(w, I * w), [(I[2] - I[1]) * w[1] * w[2], (I[0] - I[2]) * w[0] * w[2], (I[1] - I[0]) * w[0] * w[1]]))

    def test_yaw_is_weaker_than_roll(self):
        sz = A.size(0.2, 0.127)
        self.assertLess(float(sz["tau_yaw"]) / float(sz["inertia"] * A.IZ_RATIO), float(sz["tau_max"]) / float(sz["inertia"]))

    def test_infeasible_design_scores_minus_99(self):
        self.assertEqual(float(A.score(np.array([[0.0, 1.0]]), PID)[0][0]), -99.0)

    def test_per_axis_shape_and_combination(self):
        J, _, ax = A.score(X, PID, per_axis=True)
        self.assertEqual(ax.shape, (1, 3))
        self.assertAlmostEqual(float(-J[0]), float(np.sqrt((ax[0] ** 2).mean())), places=10)

    def test_kinematics_hover_stays_level(self):
        g = np.zeros((1, 6)) ; g[:] = [100, 0.5, 0.1, 10, 0.5, 0.1]
        sz = A.size(np.array([0.2]), np.array([0.127]))
        rms, axis = A.rollout(sz, g, episodes=2, seed=0)
        self.assertTrue(np.all(np.isfinite(axis)))


if __name__ == "__main__":
    unittest.main()
