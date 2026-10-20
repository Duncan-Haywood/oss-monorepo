import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_fit import model as M  # noqa: E402
from hanger_fit.opt import BOUNDS, cmaes, random_search, to_hanger  # noqa: E402


class Energy(unittest.TestCase):
    def test_gradient_matches_finite_differences(self):
        g = M.garment("M", "tee")
        h = M.STOCK["wood-shaped"]
        s, l0, m, _ = M._layout(g)
        P = h.centreline()
        X0 = M.neck_point(h, g)
        X = M.initial(h, X0, s)
        rng = np.random.default_rng(1)
        y = X[1:].ravel() + 2e-4 * rng.standard_normal(2 * (len(s) - 1))
        ks, kb = 50.0, 1e-4
        E, gr = M.energy_grad(y, X0, l0, m, ks, kb, P, h.r * M.CM)
        for k in rng.choice(len(y), 12, replace=False):
            d = np.zeros_like(y)
            d[k] = 1e-7
            fd = (M.energy_grad(y + d, X0, l0, m, ks, kb, P, h.r * M.CM)[0]
                  - M.energy_grad(y - d, X0, l0, m, ks, kb, P, h.r * M.CM)[0]) / 2e-7
            self.assertAlmostEqual(fd, gr[k], delta=1e-6 + 1e-4 * abs(fd))

    def test_lbfgs_minimises_a_quadratic(self):
        A = np.diag([1.0, 10.0, 100.0])
        x, _ = M.lbfgs(lambda x: (0.5 * x @ A @ x, A @ x), np.ones(3), iters=200, tol=1e-10)
        self.assertLess(np.abs(x).max(), 1e-8)


class Target(unittest.TestCase):
    def test_worn_shape_is_arc_length_parametrised(self):
        g = M.garment("L", "shirt")
        s = np.linspace(0, 0.4, 801)
        T = M.target(g, s)
        self.assertTrue(np.allclose(T[0], 0))
        steps = np.sqrt(((T[1:] - T[:-1]) ** 2).sum(1))
        self.assertTrue(np.allclose(steps, s[1] - s[0], rtol=1e-3))

    def test_worn_shape_reaches_shoulder_and_hangs_vertically(self):
        g = M.garment("M", "tee")
        s = np.linspace(0, 0.35, 701)
        T = M.target(g, s)
        width = (g.half_shoulder - g.neck) * M.CM
        self.assertGreater(T[:, 0].max(), width)
        self.assertLess(T[:, 0].max(), width + g.round_r * M.CM)
        self.assertAlmostEqual(T[-1, 0], T[-50, 0], places=9)
        self.assertLess(T[-1, 1], T[-50, 1])


class Drape(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.g = M.garment("M", "tee")
        cls.h = M.STOCK["wood-shaped"]
        cls.X, cls.s = M.drape(cls.h, cls.g)

    def test_neck_is_pinned_on_the_top_surface(self):
        Q, d = M._closest(self.X[:1], self.h.centreline())
        self.assertAlmostEqual(d[0], self.h.r * M.CM, delta=1e-6)
        self.assertGreater(self.X[0, 1], Q[0, 1])

    def test_no_deep_penetration(self):
        _, d = M._closest(self.X, self.h.centreline())
        self.assertGreater(d.min(), self.h.r * M.CM - 0.5e-3)

    def test_cloth_barely_stretches_and_hangs_below_the_arm(self):
        sc = M.score(self.h, self.g, self.X, self.s)
        self.assertLess(sc["strain"], 0.05)
        self.assertLess(self.X[-1, 1], self.X[0, 1] - 0.15)

    def test_more_iterations_do_not_change_the_score_much(self):
        a = M.score(self.h, self.g, self.X, self.s)["err"]
        X, s = M.drape(self.h, self.g, iters=2000)
        self.assertLess(abs(M.score(self.h, self.g, X, s)["err"] - a), 0.1)

    def test_matched_width_beats_a_narrow_hanger(self):
        good = M.Hanger(w=self.g.half_shoulder + 0.5, slope=18, bow=0, r=2.0)
        narrow = M.Hanger(w=self.g.half_shoulder - 6, slope=18, bow=0, r=2.0)
        self.assertLess(M.score(good, self.g)["err"], M.score(narrow, self.g)["err"])

    def test_wire_tip_creases_more_than_a_round_end(self):
        wire = M.score(M.STOCK["wire"], self.g)["crease"]
        wood = M.score(self.h, self.g, self.X, self.s)["crease"]
        self.assertGreater(wire, 1.5 * wood)


class Objective(unittest.TestCase):
    def test_crease_charge_only_above_the_allowance(self):
        sc = dict(err=1.0, crease=M.CREASE_OK - 5, strain=0.0)
        self.assertEqual(M.objective(sc), 1.0)
        sc["crease"] = M.CREASE_OK + 10
        self.assertAlmostEqual(M.objective(sc), 1.0 + 10 * M.CREASE_COST)
        self.assertEqual(M.objective(sc, "shape"), 1.0)


class Optimisers(unittest.TestCase):
    def test_box_maps_to_bounds(self):
        lo, hi = to_hanger(np.zeros(4)), to_hanger(np.ones(4))
        self.assertEqual((lo.w, lo.slope, lo.bow, lo.r), tuple(BOUNDS[:, 0]))
        self.assertEqual((hi.w, hi.slope, hi.bow, hi.r), tuple(BOUNDS[:, 1]))

    def test_cmaes_beats_random_search_on_a_bowl(self):
        f = lambda u: float(((u - 0.3) ** 2).sum())
        c = [cmaes(f, 4, 200, s)[1] for s in range(3)]
        r = [random_search(f, 4, 200, s)[1] for s in range(3)]
        self.assertLess(max(c), 1e-3)
        self.assertLess(np.median(c), np.median(r))

    def test_history_is_best_so_far(self):
        f = lambda u: float(((u - 0.7) ** 2).sum())
        for fn in (cmaes, random_search):
            _, fb, hist = fn(f, 4, 50, 0)
            self.assertEqual(len(hist), 50)
            self.assertTrue(all(a >= b for a, b in zip(hist, hist[1:])))
            self.assertEqual(hist[-1], fb)


if __name__ == "__main__":
    unittest.main()
