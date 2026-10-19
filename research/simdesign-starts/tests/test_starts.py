import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_starts import run_from, random_start, holes, distance


class T(unittest.TestCase):
    def test_random_start_volume_and_bounds(self):
        x = random_start(20, 8, 0.5, 0.45, 3)
        self.assertAlmostEqual(x.mean(), 0.5, places=3)
        self.assertTrue(x.min() >= 0.01 and x.max() <= 1.0)

    def test_random_start_deterministic_and_seeded(self):
        self.assertTrue(np.array_equal(random_start(10, 5, 0.5, 0.3, 1), random_start(10, 5, 0.5, 0.3, 1)))
        self.assertFalse(np.array_equal(random_start(10, 5, 0.5, 0.3, 1), random_start(10, 5, 0.5, 0.3, 2)))

    def test_holes_counts_enclosed_voids_only(self):
        x = np.ones((7, 7)); x[3, 3] = 0; x[0, 0] = 0
        self.assertEqual(holes(x), 1)  # the corner void touches the border
        self.assertEqual(holes(np.ones((5, 5))), 0)

    def test_distance(self):
        a = np.array([[1.0, 0.0], [1.0, 0.0]]); b = np.array([[1.0, 1.0], [1.0, 0.0]])
        self.assertEqual(distance(a, b), 0.25); self.assertEqual(distance(a, a), 0.0)

    def test_run_keeps_volume_and_lowers_compliance(self):
        r = run_from(np.full((8, 24), 0.5), 24, 8, iters=15)
        self.assertAlmostEqual(r["x"].mean(), 0.5, delta=0.005)
        self.assertLess(r["compliance"], r["history"][0])

    def test_run_deterministic(self):
        x0 = random_start(24, 8, 0.5, 0.3, 0)
        self.assertEqual(run_from(x0, 24, 8, iters=8)["compliance"], run_from(x0, 24, 8, iters=8)["compliance"])


if __name__ == "__main__":
    unittest.main()
