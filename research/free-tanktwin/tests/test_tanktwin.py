import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from tanktwin import twin_sim, fit_twin, fit_narx, narx_sim, rmse


class TwinTests(unittest.TestCase):
    def test_steady_state_matches_torricelli(self):
        # constant inflow b*u: x1* = (b u / a1)^2 and x2* = (a1 sqrt(x1*) / a2)^2 = (b u / a2)^2
        th = [0.1, 0.2, 0.15, 0.0, 1.0, 1.0]
        y = twin_sim(th, np.full(3000, 2.0), overflow=False)
        self.assertAlmostEqual(y[-1], (0.15 * 2.0 / 0.2) ** 2, places=2)

    def test_recovers_known_parameters_from_noiseless_data(self):
        rng = np.random.default_rng(0)
        u = np.clip(np.cumsum(rng.normal(0, 0.3, 400)) + 3, 0.5, 6)
        th = np.array([0.08, 0.06, 0.07, 0.2, 2.0, 2.5])
        y = twin_sim(th, u, overflow=False)
        est = fit_twin(u, y, overflow=False, theta0=[0.05, 0.05, 0.05, 0.0, y[0], y[0]])
        self.assertLess(rmse(twin_sim(est, u, overflow=False), y), 1e-3)

    def test_overflow_adds_flow_to_tank_two(self):
        th = [0.05, 0.05, 0.2, 0.0, 9.0, 1.0, 5.0, 0.5]
        u = np.full(50, 0.0)
        self.assertGreater(twin_sim(th, u, True)[10], twin_sim(th[:6], u, False)[10])


class NarxTests(unittest.TestCase):
    def test_arx_recovers_linear_system_in_free_run(self):
        rng = np.random.default_rng(1)
        u = rng.normal(size=300)
        y = np.zeros(300)
        for t in range(2, 300):
            y[t] = 1.2 * y[t - 1] - 0.5 * y[t - 2] + 0.3 * u[t - 1] + 0.1 * u[t - 2]
        m = fit_narx(u, y, 2, 2, 1)
        self.assertLess(rmse(narx_sim(m, u, y)[5:], y[5:]), 1e-4)

    def test_rmse(self):
        self.assertAlmostEqual(rmse([0, 0], [3, 4]), np.sqrt(12.5))


if __name__ == "__main__":
    unittest.main()
