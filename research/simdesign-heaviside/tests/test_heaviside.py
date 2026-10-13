import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_heaviside import (density_filter_matrix, project, dproject, topopt, grey_share,
                                 checker_share, min_length_scale)
from simdesign_topopt import fe_compliance, mbb_problem


class T(unittest.TestCase):
    def test_projection_limits(self):
        xt = np.linspace(0, 1, 11)
        self.assertTrue(np.allclose(project(xt, 0.0), xt))
        p = project(xt, 200.0)
        self.assertTrue(np.all(p[xt < 0.45] < 1e-6) and np.all(p[xt > 0.55] > 1 - 1e-6))
        for b in (1, 4, 16):
            p = project(xt, b)
            self.assertAlmostEqual(p[0], 0.0, places=12); self.assertAlmostEqual(p[-1], 1.0, places=12)
            self.assertAlmostEqual(float(project(np.array([0.5]), b)[0]), 0.5, places=12)
            self.assertTrue(np.all(np.diff(p) > 0))

    def test_projection_derivative(self):
        xt = np.array([0.1, 0.3, 0.5, 0.62, 0.9]); h = 1e-6
        for b in (1.0, 8.0):
            fd = (project(xt + h, b, 0.4) - project(xt - h, b, 0.4)) / (2 * h)
            self.assertTrue(np.allclose(fd, dproject(xt, b, 0.4), rtol=1e-6, atol=1e-8))

    def test_filter_preserves_constants_and_mass_is_row_normalised(self):
        Hn = density_filter_matrix(12, 7, 2.5)
        self.assertTrue(np.allclose(Hn @ np.full(84, 0.37), 0.37))
        self.assertTrue(np.allclose(np.asarray(Hn.sum(axis=1)).ravel(), 1.0))

    def test_chain_rule_sensitivity_matches_finite_differences(self):
        nx, ny, beta = 8, 4, 4.0
        f, fixed = mbb_problem(nx, ny)
        Hn = density_filter_matrix(nx, ny, 1.8)
        rng = np.random.default_rng(1); x = rng.uniform(0.3, 0.8, nx * ny)

        def comp(x):
            xp = project(Hn @ x, beta)
            return fe_compliance(xp.reshape(ny, nx), nx, ny, f, fixed)[0]
        xt = Hn @ x; xp = project(xt, beta)
        _, _, dc = fe_compliance(xp.reshape(ny, nx), nx, ny, f, fixed)
        g = Hn.T @ (dc.reshape(-1) * dproject(xt, beta))
        for e in (0, 13, 27):
            h = 1e-6; xa = x.copy(); xb = x.copy(); xa[e] += h; xb[e] -= h
            self.assertAlmostEqual((comp(xa) - comp(xb)) / (2 * h), g[e], delta=1e-5 * abs(g[e]) + 1e-8)

    def test_min_length_scale(self):
        m = np.zeros((20, 20), bool); m[5:8, 2:18] = True      # bar 3 px thick
        self.assertEqual(min_length_scale(m), 3)
        m[12, 2:18] = True                                      # add a 1 px line
        self.assertEqual(min_length_scale(m), 1)
        m = np.zeros((30, 30), bool); m[4:19, 4:19] = True       # 15 px block: rounded corners cap the score
        self.assertGreaterEqual(min_length_scale(m), 5)

    def test_checker_and_grey(self):
        x = np.array([[1., 0.], [0., 1.]])
        self.assertEqual(checker_share(x), 1.0)
        self.assertEqual(grey_share(np.array([[0.5, 1.0]])), 0.5)

    def test_topopt_volume_and_compliance(self):
        r = topopt(30, 10, 0.5, 2.0, mode="heaviside", betas=(1, 4, 16), iters_per_beta=15)
        self.assertAlmostEqual(r["volume"], 0.5, delta=0.01)
        self.assertLess(r["compliance"], r["history"][0])
        self.assertLess(grey_share(r["xp"]), 0.15)
        d = topopt(30, 10, 0.5, 2.0, mode="density", max_iter=60)
        self.assertAlmostEqual(d["volume"], 0.5, delta=0.01)
        self.assertEqual(checker_share(d["xp"]), 0.0)


if __name__ == "__main__":
    unittest.main()
