import unittest
import numpy as np
from free_f32shadow import model as m


class T(unittest.TestCase):
    def test_dtype_preserved(self):
        s = np.array([[1.0, 2.0, 3.0]])
        for dt in (np.float32, np.float64):
            self.assertEqual(m.rk4("lorenz", s.astype(dt), 0.01, dt).dtype, dt)

    def test_float32_actually_rounds(self):
        s = m.initial_states("lorenz", 4, 1)
        a = m.rk4("lorenz", s.astype(np.float32), 0.01, np.float32).astype(np.float64)
        b = m.rk4("lorenz", s, 0.01, np.float64)
        err = np.abs(a - b).max()
        self.assertGreater(err, 0)
        self.assertLess(err, 1e-4)

    def test_lorenz_fixed_point(self):
        r = np.sqrt(8.0 / 3.0 * 27)
        s = np.array([[r, r, 27.0]])
        self.assertLess(np.abs(m.deriv("lorenz", s, np.float64)).max(), 1e-9)

    def test_divergence_time_nan_when_identical(self):
        s = m.initial_states("lorenz", 3, 2)
        ts, a = m.run("lorenz", s, 1.0, np.float64)
        self.assertTrue(np.isnan(m.divergence_times(ts, a, a, 1.0)).all())

    def test_perturbation_size(self):
        s = np.zeros((5, 3))
        d = np.linalg.norm(m.perturbed(s, 1e-6, 0) - s, axis=1)
        self.assertTrue(np.allclose(d, 1e-6))

    def test_lyapunov_lorenz_close_to_literature(self):
        s = m.initial_states("lorenz", 8, 3)
        lam = m.lyapunov("lorenz", s, 60.0, np.float64).mean()
        self.assertAlmostEqual(lam, 0.906, delta=0.12)  # 0.9056 is the commonly quoted value

    def test_larger_perturbation_diverges_sooner(self):
        s = m.initial_states("lorenz", 40, 4)
        ts, base = m.run("lorenz", s, 40.0, np.float64, every=5)
        t = []
        for d in (1e-4, 1e-9):
            _, p = m.run("lorenz", m.perturbed(s, d, 9), 40.0, np.float64, every=5)
            t.append(np.nanmedian(m.divergence_times(ts, base, p, 1.0)))
        self.assertLess(t[0], t[1])


if __name__ == "__main__":
    unittest.main()
