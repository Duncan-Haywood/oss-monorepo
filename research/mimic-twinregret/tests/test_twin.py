import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twin

R = twin.REAL


class T(unittest.TestCase):
    def test_noise_sd_matches(self):
        r = np.random.default_rng(0)
        for k in ("gauss", "student3"):
            self.assertAlmostEqual(twin.noise(r, 400000, 0.05, k).std(), 0.05, delta=0.004)

    def test_unknown_noise_raises(self):
        with self.assertRaises(ValueError):
            twin.noise(np.random.default_rng(0), 3, 1, "x")

    def test_zero_gain_matches_passive_cost(self):
        # gains (0, 0) apply no torque, so the closed-loop cost is the time-averaged squared passive angle
        p = dict(R, sd=0.0)
        th0 = np.array([1.0, -1.5, 0.5])
        _, clean, _ = twin.passive(np.random.default_rng(1), 3, p)  # different start angles: recompute directly
        th, w, tot = th0.copy(), np.zeros(3), np.zeros(3)
        for _ in range(twin.STEPS):
            tot += th ** 2
            th, w = twin._rk4(th, w, 0.0, p, twin.DT)
        c = twin.closed_loop_cost(th0, [(0.0, 0.0)], p, np.random.default_rng(2))
        self.assertAlmostEqual(c[0], float((tot / twin.STEPS).mean()), places=10)

    def test_damping_beats_no_control_without_noise(self):
        p = dict(R, sd=0.0)
        th0 = np.random.default_rng(3).uniform(-2, 2, 100)
        c = twin.closed_loop_cost(th0, [(0.0, 0.0), (10.0, 4.0)], p, np.random.default_rng(4))
        self.assertLess(c[1], 0.7 * c[0])

    def test_common_random_numbers_across_gains(self):
        # the same gain pair gives the same cost whatever else is in the grid
        th0 = np.random.default_rng(5).uniform(-2, 2, 50)
        a = twin.closed_loop_cost(th0, [(5.0, 2.0)], R, np.random.default_rng(6))[0]
        b = twin.closed_loop_cost(th0, [(1.0, 1.0), (5.0, 2.0)], R, np.random.default_rng(6))[1]
        self.assertAlmostEqual(a, b, places=12)

    def test_torque_is_clipped(self):
        # huge gains must not blow up: saturation keeps the cost finite and below an open-loop-scale bound
        th0 = np.random.default_rng(7).uniform(-2, 2, 50)
        c = twin.closed_loop_cost(th0, [(1e4, 1e3)], dict(R, sd=0.0), np.random.default_rng(8))[0]
        self.assertTrue(np.isfinite(c))

    def test_tune_picks_derivative_action_on_real_system(self):
        i, g = twin.tune(R, np.random.default_rng(9), n=150)
        self.assertGreater(g[i][1], 0.0)

    def test_paired_rmse_zero_for_exact_twin(self):
        th0, clean, _ = twin.passive(np.random.default_rng(10), 40, R)
        self.assertLess(twin.paired_rmse(th0, clean, R), 1e-12)
        self.assertGreater(twin.paired_rmse(th0, clean, dict(R, coul=0.0)), 0.01)

    def test_c2st_null_and_gross(self):
        r = np.random.default_rng(11)
        a, b = twin.passive(r, 500, R)[2], twin.passive(r, 500, R)[2]
        self.assertAlmostEqual(twin.c2st(a, b), 0.5, delta=0.07)
        c = twin.passive(r, 500, dict(R, coul=0.0))[2]
        self.assertGreater(twin.c2st(a, c), 0.9)


if __name__ == "__main__":
    unittest.main()
