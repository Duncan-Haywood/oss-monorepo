import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from society_doorcost import cell, crowd_best, deviation_gain, stable, threshold_k  # noqa: E402


class Model(unittest.TestCase):
    def test_gain_falls_with_collision_cost(self):
        g = [deviation_gain(0.3, 0.0, k) for k in (1, 2, 3, 5)]
        self.assertTrue(all(a > b for a, b in zip(g, g[1:])))

    def test_threshold_is_the_sign_change(self):
        for r, d in ((0.3, 1.0), (0.5, 2.0), (0.1, 0.5)):
            ks = threshold_k(r, d)
            self.assertAlmostEqual(deviation_gain(r, 0.0, ks, 1.0, d), 0.0, places=6)
            self.assertGreater(deviation_gain(r, 0.0, ks - 0.2, 1.0, d), 0)
            self.assertLess(deviation_gain(r, 0.0, ks + 0.2, 1.0, d), 0)

    def test_threshold_rises_with_dithering_and_share(self):
        self.assertLess(threshold_k(0.3, 0.5), threshold_k(0.3, 2.0))
        self.assertLess(threshold_k(0.1, 1.0), threshold_k(0.5, 1.0))

    def test_doorway_default_is_just_above_threshold(self):
        # society-doorway used k=3, d=1, share 0.3 and found no dilemma
        self.assertLess(threshold_k(0.3, 1.0), 3.0)
        self.assertFalse(cell(0.3, 3.0, 1.0, 1.0)["dilemma"])

    def test_dilemma_below_threshold(self):
        c = cell(0.3, 1.5, 1.0, 1.0)
        self.assertTrue(c["dilemma"])
        self.assertEqual(c["crowd_g"], 0.0)
        self.assertFalse(stable(0.3, 0.0, 1.5))

    def test_cheap_collisions_make_going_right(self):
        g, _ = crowd_best(0.3, 0.5, 1.0, 1.0)
        self.assertEqual(g, 1.0)


if __name__ == "__main__":
    unittest.main()
