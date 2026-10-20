import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_wrap.model3d import (  # noqa: E402
    CM, STOCK, Sheet, centreline3, drape, energy_grad, garment, initial, neck3, score,
)
from hanger_fit.model import _layout  # noqa: E402

G = garment("M", "tee")
H = STOCK["wood-shaped"]
COARSE = dict(ds=2 * CM, dt=2 * CM)


class T(unittest.TestCase):
    def test_mass_matches_2d_chain(self):
        for fab in ("tee", "shirt", "sweater"):
            g = garment("M", fab)
            m2 = _layout(g)[2].sum()   # the 0.5 cm grid rounds the sleeve to different node counts: within 1%
            self.assertAlmostEqual(Sheet(g).m.sum(), m2, delta=0.01 * m2)

    def test_gradient_matches_finite_differences(self):
        sh = Sheet(G, **COARSE)
        X = initial(H, sh, neck3(H, G))
        X0 = X[0].copy()
        free = np.ones((sh.ns, sh.nt), bool)
        free[0] = False
        rng = np.random.default_rng(1)
        y = X[free].ravel() + rng.normal(0, 2e-3, free.sum() * 3)
        P = centreline3(H)
        f = lambda v: energy_grad(v, X0, sh, P, H.r * CM)
        _, gr = f(y)
        for k in rng.integers(0, len(y), 6):
            d = np.zeros_like(y)
            d[k] = 1e-7
            self.assertAlmostEqual((f(y + d)[0] - f(y - d)[0]) / 2e-7, gr[k], 5)

    def test_drape_is_front_back_symmetric(self):
        X, sh, _ = drape(H, G, iters=150, sh=Sheet(G, **COARSE))
        np.testing.assert_allclose(X[:, :, 0], X[:, ::-1, 0], atol=1e-6)
        np.testing.assert_allclose(X[:, :, 2], -X[:, ::-1, 2], atol=1e-6)

    def test_cloth_stays_outside_the_arm(self):
        X, sh, _ = drape(H, G, iters=150, sh=Sheet(G, **COARSE))
        P = centreline3(H)
        flat = X.reshape(-1, 3)
        d = np.sqrt(((flat[:, None, :] - P[None]) ** 2).sum(2)).min(1)
        self.assertGreater(d.min(), 0.9 * H.r * CM)

    def test_score_fields(self):
        X, sh, _ = drape(H, G, iters=100, sh=Sheet(G, **COARSE))
        sc = score(X, sh, G)
        for k in ("err", "crease", "cross", "strain"):
            self.assertTrue(np.isfinite(sc[k]))
        self.assertGreater(sc["err"], 0.0)


if __name__ == "__main__":
    unittest.main()
