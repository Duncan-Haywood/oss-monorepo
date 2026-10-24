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

    def test_wrap(self):
        self.assertTrue(abs(float(twin.wrap(7.0))) <= np.pi)
        self.assertAlmostEqual(float(twin.wrap(2 * np.pi + 0.5)), 0.5)

    def test_zero_gain_matches_passive_cost(self):
        # ke = kp = kd = 0 applies no torque, so the cost is the time-averaged (1+cos th)/2 of the passive swing
        p = dict(R, sd=0.0)
        th0, w0 = np.array([0.2, -0.3]), np.array([0.1, 0.0])
        th, w, tot = th0.copy(), w0.copy(), np.zeros(2)
        for _ in range(twin.TSTEPS):
            tot += (1 + np.cos(th)) / 2
            th, w = twin._rk4(th, w, 0.0, p, twin.DT)
        c = twin.swing_cost((th0, w0), [(0.0, 0.0, 0.0, 0.4)], p, np.random.default_rng(1))
        self.assertAlmostEqual(c[0], float((tot / twin.TSTEPS).mean()), places=10)

    def test_good_controller_beats_doing_nothing(self):
        starts = twin.draw_starts(np.random.default_rng(3), 40)
        c = twin.swing_cost(starts, [(0.0, 0.0, 0.0, 0.4), (4.0, 20.0, 4.0, 0.8)], R, np.random.default_rng(4))
        self.assertLess(c[1], 0.8 * c[0])

    def test_common_random_numbers(self):
        # the same gain tuple placed twice in the grid gets identical cost
        starts = twin.draw_starts(np.random.default_rng(5), 20)
        c = twin.swing_cost(starts, [(2.0, 20.0, 2.0, 0.4)] * 2, R, np.random.default_rng(6))
        self.assertEqual(c[0], c[1])

    def test_grid_size(self):
        self.assertEqual(len(twin.gain_grid()), 5 * 3 * 3 * 2)

    def test_c2st_chance_on_identical_systems(self):
        r = np.random.default_rng(7)
        _, _, a = twin.passive(r, 300, R)
        _, _, b = twin.passive(r, 300, R)
        self.assertLess(abs(twin.c2st(a, b) - 0.5), 0.1)

    def test_paired_rmse_zero_for_exact_twin(self):
        th0, clean, _ = twin.passive(np.random.default_rng(8), 20, R)
        self.assertAlmostEqual(twin.paired_rmse(th0, clean, R), 0.0, places=12)


if __name__ == "__main__":
    unittest.main()
