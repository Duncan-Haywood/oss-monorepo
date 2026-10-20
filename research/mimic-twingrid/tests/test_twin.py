import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import twin

R = twin.REAL


class T(unittest.TestCase):
    def test_default_gnom_matches_explicit(self):
        starts = twin.draw_starts(np.random.default_rng(1), 20)
        g = [(8.0, 20.0, 4.0, 0.8)]
        a = twin.swing_cost(starts, g, R, np.random.default_rng(2))
        b = twin.swing_cost(starts, g, R, np.random.default_rng(2), gnom=9.81)
        self.assertEqual(a[0], b[0])

    def test_gnom_changes_the_controller(self):
        starts = twin.draw_starts(np.random.default_rng(3), 30)
        g = [(8.0, 20.0, 4.0, 0.8)]
        a = twin.swing_cost(starts, g, R, np.random.default_rng(4), gnom=9.81)
        b = twin.swing_cost(starts, g, R, np.random.default_rng(4), gnom=7.0)
        self.assertNotEqual(a[0], b[0])

    def test_grid_reaches_ke_32(self):
        grid = twin.gain_grid()
        self.assertEqual(len(grid), 7 * 3 * 3 * 2)
        self.assertEqual(max(g[0] for g in grid), 32.0)

    def test_zero_gain_matches_passive_cost(self):
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
        c = twin.swing_cost(starts, [(0.0, 0.0, 0.0, 0.4), (8.0, 20.0, 4.0, 0.8)], R, np.random.default_rng(4))
        self.assertLess(c[1], 0.8 * c[0])

    def test_tune_uses_gnom(self):
        i, g = twin.tune(R, np.random.default_rng(5), n=30, gnom=9.81)
        self.assertTrue(0 <= i < len(g))

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
