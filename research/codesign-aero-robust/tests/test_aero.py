import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_robust import aero as A

X, G = np.array([[0.4, 0.4]]), np.array([[0.5, 0.5, 0.5]])


class PlantTests(unittest.TestCase):
    def test_nominal_draw_is_identity(self):
        p = A.plant_draw(None, 5, 0)
        self.assertTrue(all(np.all(v == 1.0) for v in p.values()))

    def test_draw_within_range_and_deterministic(self):
        a, b = A.plant_draw("wide", 50, 3), A.plant_draw("wide", 50, 3)
        for k, (lo, hi) in A.PLANT_RANGES["wide"].items():
            self.assertTrue(np.all(a[k] >= lo) and np.all(a[k] <= hi))
            self.assertTrue(np.array_equal(a[k], b[k]))

    def test_wide_is_wider_than_narrow(self):
        for k in ("tau", "mass", "lag"):
            n, w = A.PLANT_RANGES["narrow"][k], A.PLANT_RANGES["wide"][k]
            self.assertTrue(w[0] <= n[0] and w[1] >= n[1])

    def test_nominal_plant_matches_default_rollout(self):
        a = A.score(X, G, seed=3)[0][0]
        self.assertEqual(float(a), float(A.score(X, G, seed=3, plant=None)[0][0]))

    def test_slower_weaker_plant_tracks_worse(self):
        nom = -A.score(X, G, episodes=16, seed=3)[0][0]
        wide = -A.score(X, G, episodes=16, seed=3, plant="wide")[0][0]
        self.assertGreater(wide, nom)


class SizingTests(unittest.TestCase):
    def test_props_must_not_overlap(self):
        self.assertFalse(bool(A.size(0.08, 0.25)["feasible"]))
        self.assertTrue(bool(A.size(0.2, 0.127)["feasible"]))

    def test_bigger_props_need_less_battery(self):
        self.assertLess(float(A.size(0.3, 0.25)["wh"]), float(A.size(0.3, 0.1)["wh"]))


if __name__ == "__main__":
    unittest.main()
