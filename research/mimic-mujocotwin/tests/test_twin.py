import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twin


class T(unittest.TestCase):
    def test_released_at_rest_and_bounded(self):
        x = twin.simulate(np.array([1.0]), damping=0.0, frictionloss=0.0)[0]
        self.assertEqual(x[0], 1.0)
        self.assertLess(x.max(), 1.0 + 1e-3)
        self.assertLess(x.min(), -0.9)  # swings through zero

    def test_friction_decays(self):
        a = twin.simulate(np.array([1.5]))[0]
        self.assertLess(np.abs(a[-20:]).max(), np.abs(a[:20]).max())

    def test_coarse_euler_differs_from_fine_rk4(self):
        th = np.linspace(-2, 2, 10)
        fine = twin.simulate(th)
        self.assertGreater(twin.paired_rmse(twin.simulate(th, integrator="euler", dt=0.02), fine), 0.005)
        self.assertEqual(twin.paired_rmse(fine, fine), 0.0)

    def test_bad_dt_raises(self):
        with self.assertRaises(ValueError):
            twin.simulate(np.array([1.0]), dt=0.003)

    def test_noise_sd(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(twin.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)
        with self.assertRaises(ValueError):
            twin.noise(r, 3, 1, "x")

    def test_null_near_chance_and_gross_detected(self):
        r = np.random.default_rng(1)
        mk = lambda fl: (lambda c: c + twin.noise(r, c.shape, 0.02, "gauss"))(twin.simulate(r.uniform(-2, 2, 300), frictionloss=fl))
        self.assertAlmostEqual(twin.c2st(mk(0.075), mk(0.075)), 0.5, delta=0.08)
        self.assertGreater(twin.c2st(mk(0.075), mk(0.0)), 0.9)


if __name__ == "__main__":
    unittest.main()
