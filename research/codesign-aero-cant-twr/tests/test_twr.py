import os, sys, unittest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from codesign_aero_cant_twr import aero as A


class TwrTests(unittest.TestCase):
    def test_default_twr_is_the_fixed_value(self):
        a, b = A.size(0.2, 0.15, 0.0), A.size(0.2, 0.15, 0.0, twr=A.TWR)
        for k in ("mass", "tau_max", "tau_yaw", "cost"):
            self.assertAlmostEqual(float(a[k]), float(b[k]), places=12)

    def test_more_headroom_buys_authority_and_costs_mass_and_money(self):
        lo, hi = A.size(0.2, 0.15, 0.0, twr=1.5), A.size(0.2, 0.15, 0.0, twr=3.5)
        self.assertGreater(float(hi["tau_yaw"]) / float(hi["mass"]), float(lo["tau_yaw"]) / float(lo["mass"]))
        self.assertGreater(float(hi["mass"]), float(lo["mass"]))
        self.assertGreater(float(hi["cost"]), float(lo["cost"]))

    def test_yaw_authority_against_hand_value(self):
        s = A.size(0.2, 0.15, 0.0, twr=3.0, kappa_per_d=0.1)
        Th = s["mass"] * A.G / 4
        self.assertAlmostEqual(float(s["tau_yaw"]), float(2 * (3.0 - 1) * Th * 0.1 * 0.15), places=12)

    def test_score_maps_column_three_to_twr_range(self):
        x = np.array([[0.5, 0.5, 0.0, 0.0], [0.5, 0.5, 0.0, 1.0]])
        _, sz = A.score(x, np.full((2, 6), 0.5), 2, twr_free=True)
        self.assertAlmostEqual(float(sz["twr"][0]), A.TWR_RANGE[0]); self.assertAlmostEqual(float(sz["twr"][1]), A.TWR_RANGE[1])
        _, sz2 = A.score(x[:, :3], np.full((2, 6), 0.5), 2)
        self.assertTrue(np.allclose(sz2["twr"], A.TWR))


if __name__ == "__main__":
    unittest.main()
