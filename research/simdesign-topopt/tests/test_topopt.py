import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_topopt import (element_stiffness, fe_compliance, simp, mbb_problem, cantilever_problem,
                              binarise, largest_component, min_feature_px, write_extruded_stl, stl_volume)


class T(unittest.TestCase):
    def test_element_matrix_symmetric_and_rigid_body(self):
        KE = element_stiffness(0.3)
        self.assertTrue(np.allclose(KE, KE.T))
        w = np.linalg.eigvalsh(KE)
        self.assertEqual(int(np.sum(w < 1e-10)), 3)  # 2 translations + 1 rotation
        self.assertTrue(np.all(w > -1e-10))

    def test_uniaxial_bar_matches_hooke(self):
        # 1 row of nelx elements, left edge clamped, unit axial force at the right edge nodes (split in 2)
        nelx, nely = 6, 1
        ndof = 2 * (nely + 1) * (nelx + 1)
        f = np.zeros(ndof); f[2 * (nely + 1) * nelx] = 0.5; f[2 * ((nely + 1) * nelx + 1)] = 0.5
        fixed = np.arange(0, 2 * (nely + 1))
        c, u, _ = fe_compliance(np.ones((nely, nelx)), nelx, nely, f, fixed, Emin=0.0)
        # bar of length 6, height 1, E=1: strain = F/(E h) = 1, tip displacement ~ 6 (Poisson ends add small effect)
        tip = u[2 * (nely + 1) * nelx]
        self.assertAlmostEqual(tip, 6.0, delta=0.15)
        self.assertAlmostEqual(c, float(f @ u), places=9)

    def test_sensitivity_matches_finite_difference(self):
        nelx, nely = 8, 4
        f, fixed = cantilever_problem(nelx, nely)
        rng = np.random.default_rng(0)
        x = rng.uniform(0.3, 0.9, (nely, nelx))
        _, _, dc = fe_compliance(x, nelx, nely, f, fixed)
        for (j, i) in [(0, 0), (2, 5), (3, 7)]:
            h = 1e-6; xp = x.copy(); xp[j, i] += h; xm = x.copy(); xm[j, i] -= h
            fd = (fe_compliance(xp, nelx, nely, f, fixed)[0] - fe_compliance(xm, nelx, nely, f, fixed)[0]) / (2 * h)
            self.assertAlmostEqual(dc[j, i] / fd, 1.0, places=5)

    def test_simp_respects_volume_and_decreases_compliance(self):
        r = simp(30, 10, 0.5, 3.0, 1.5, mbb_problem, max_iter=40)
        self.assertAlmostEqual(r["volume"], 0.5, delta=2e-3)
        self.assertLess(r["compliance"], r["history"][0])
        self.assertTrue(np.all((r["x"] >= 0.001 - 1e-12) & (r["x"] <= 1 + 1e-12)))

    def test_binarise_keeps_requested_area_and_largest_component(self):
        x = np.zeros((10, 10)); x[2:5, 2:8] = 1; x[8, 8] = 1
        m = binarise(x, volfrac=19 / 100)
        self.assertEqual(int(m.sum()), 19)
        big, n = largest_component(m)
        self.assertEqual(n, 2); self.assertEqual(int(big.sum()), 18)

    def test_min_feature(self):
        m = np.zeros((6, 6), bool); m[1:5, 1:3] = True
        self.assertEqual(min_feature_px(m), 2)

    def test_stl_volume_matches_area_times_thickness(self):
        m = np.zeros((5, 7), bool); m[1:4, 1:6] = True; m[2, 2] = False  # hole
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.stl")
            n = write_extruded_stl(m, p, pixel_mm=2.0, thickness_mm=3.0)
            self.assertGreater(n, 0)
            self.assertAlmostEqual(stl_volume(p), m.sum() * 4.0 * 3.0, places=3)


if __name__ == "__main__":
    unittest.main()
