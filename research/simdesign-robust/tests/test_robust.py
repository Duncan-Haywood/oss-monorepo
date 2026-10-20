import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_robust import robust_topopt
from simdesign_heaviside import topopt


class T(unittest.TestCase):
    def test_zero_delta_matches_plain_heaviside(self):
        kw = dict(betas=(1, 4), iters_per_beta=3)
        r = robust_topopt(18, 6, 0.5, 1.5, d_eta=0.0, **kw)
        h = topopt(18, 6, 0.5, 1.5, mode="heaviside", **kw)
        self.assertTrue(np.allclose(r["blueprint"], h["xp"], atol=1e-9))
        self.assertAlmostEqual(r["c_blueprint"], h["compliance"], places=8)

    def test_ordering_and_volume(self):
        r = robust_topopt(24, 8, 0.5, 2.0, betas=(1, 8), iters_per_beta=6, d_eta=0.2)
        self.assertLessEqual(r["eroded"].mean(), r["blueprint"].mean() + 1e-12)
        self.assertLessEqual(r["blueprint"].mean(), r["dilated"].mean() + 1e-12)
        self.assertAlmostEqual(r["blueprint"].mean(), 0.5, delta=0.02)
        # less material in the eroded field cannot make it stiffer than the dilated one
        self.assertGreaterEqual(r["c_eroded"], r["c_dilated"])
        self.assertTrue(np.all((r["x"] >= 0) & (r["x"] <= 1)))

    def test_deterministic(self):
        kw = dict(betas=(2,), iters_per_beta=3)
        a = robust_topopt(12, 4, 0.5, 1.5, **kw); b = robust_topopt(12, 4, 0.5, 1.5, **kw)
        self.assertTrue(np.array_equal(a["x"], b["x"]))


if __name__ == "__main__":
    unittest.main()
