import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twin


class T(unittest.TestCase):
    def test_simulate_shape_and_start(self):
        th = np.array([0.5, -1.0])
        x = twin.simulate(th)
        self.assertEqual(x.shape, (2, twin.STEPS))
        np.testing.assert_allclose(x[:, 0], th)

    def test_friction_damps_motion(self):
        th = np.array([1.0])
        a = twin.simulate(th, damping=0.0, frictionloss=0.0)
        b = twin.simulate(th, damping=0.025, frictionloss=0.075)
        self.assertGreater(np.abs(a[0, -30:]).max(), np.abs(b[0, -30:]).max())

    def test_euler_big_step_differs_from_rk4(self):
        th = np.array([1.5])
        d = np.abs(twin.simulate(th) - twin.simulate(th, integrator="euler", dt=0.02)).max()
        self.assertGreater(d, 1e-3)

    def test_noise_sd_matches(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(twin.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)

    def test_mmd_identical_near_zero_and_detects_shift(self):
        r = np.random.default_rng(1)
        a, b = r.normal(size=(300, 5)), r.normal(size=(300, 5))
        self.assertAlmostEqual(twin.mmd2(a, b), 0.0, delta=0.01)
        self.assertGreater(twin.mmd2(a, b + 1.0), 0.05)

    def test_features_shapes(self):
        x = np.zeros((4, twin.STEPS))
        self.assertEqual(twin.features(x, "raw").shape[1], twin.STEPS)
        self.assertEqual(twin.features(x, "resid").shape[1], twin.STEPS - 2)
        self.assertEqual(twin.features(x, "both").shape[1], 2 * twin.STEPS - 2 + 2)
        with self.assertRaises(ValueError):
            twin.features(x, "nope")

    def test_threshold_and_power(self):
        thr = twin.threshold(np.arange(100.0))
        self.assertAlmostEqual(thr, 94.05)
        p, lo, hi = twin.power(np.full(50, 200.0), thr)
        self.assertEqual(p, 1.0)
        self.assertLess(lo, 1.0)

    def test_c2st_chance_on_identical(self):
        r = np.random.default_rng(3)
        a, b = twin.sample(r, 120), twin.sample(r, 120)
        self.assertAlmostEqual(twin.c2st_auc(a, b, "raw"), 0.5, delta=0.12)


if __name__ == "__main__":
    unittest.main()
