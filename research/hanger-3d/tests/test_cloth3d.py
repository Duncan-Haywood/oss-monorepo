import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "hanger-3d" / "src"), str(ROOT / "hanger-fit" / "src")]
from hanger_fit import model as m2  # noqa: E402
from hanger_3d.cloth3d import Arm, Sheet, _angle_terms, drape, score  # noqa: E402


class Test3D(unittest.TestCase):
    def test_angle_gradient(self):
        rng = np.random.default_rng(1)
        a, b = rng.normal(size=(4, 3)), rng.normal(size=(4, 3))
        phi, da, db = _angle_terms(a, b)
        for k in range(3):
            d = np.zeros(3); d[k] = 1e-6
            num = (_angle_terms(a + d, b)[0] - _angle_terms(a - d, b)[0]) / 2e-6
            self.assertTrue(np.allclose(num, da[:, k], atol=1e-5))
            num = (_angle_terms(a, b + d)[0] - _angle_terms(a, b - d)[0]) / 2e-6
            self.assertTrue(np.allclose(num, db[:, k], atol=1e-5))

    def test_energy_gradient(self):
        g = m2.garment("child", "shirt")
        sh = Sheet(Arm(m2.STOCK["plastic"], 1.0), g)
        X = sh.start()
        rng = np.random.default_rng(2)
        v = X[sh.free] + 1e-3 * rng.normal(size=X[sh.free].shape)
        E, gr = sh.energy_grad(v, X)
        for i in rng.choice(len(v), 6, replace=False):
            d = np.zeros_like(v); d[i] = 1e-7
            num = (sh.energy_grad(v + d, X)[0] - sh.energy_grad(v - d, X)[0]) / 2e-7
            self.assertAlmostEqual(num, gr[i], delta=1e-4 * max(1.0, abs(num)))

    def test_slab_matches_2d(self):
        h, g = m2.STOCK["wood-shaped"], m2.garment("M", "tee")
        X, sh = drape(Arm(h, 12.0), g)
        s = score(X, sh)
        self.assertAlmostEqual(s["err"], m2.score(h, g)["err"], delta=0.05)
        self.assertAlmostEqual(s["err"], s["err_all"], delta=0.01)   # nothing varies in depth
        self.assertLess(s["sag"], 0.01)

    def test_rod_drops_the_panels(self):
        h, g = m2.STOCK["plastic"], m2.garment("M", "tee")
        X, sh = drape(Arm(h, 0.0), g)
        s = score(X, sh)
        self.assertGreater(s["sag"], 3.0)
        self.assertGreater(s["err_all"], s["err"])


if __name__ == "__main__":
    unittest.main()
