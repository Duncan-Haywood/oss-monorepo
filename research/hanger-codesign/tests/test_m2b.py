"""Milestone 2b wiring: the strain diagnostic and the case grid of the mesh-refinement study."""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "m2b_locking"))
import run as m2b  # noqa: E402
import cusick  # noqa: E402
import kes_shear  # noqa: E402


class TestM2b(unittest.TestCase):
    def setUp(self):
        self.sp = cusick.Specimen(0.027, 12.52, 150.0, h=0.0075)

    def test_flat_specimen_has_no_strain(self):
        s = m2b.strains(self.sp, self.sp.X0)
        # rounding can leave springs a hair short: the strains, not the share, must be zero
        self.assertLess(s["comp_mean"], 1e-12)
        self.assertLess(abs(s["tens_max"]), 1e-12)

    def test_uniform_shrink_reads_as_compression(self):
        # scale the whole sheet in plane by 0.98: every overhang axis spring is 2% short
        X = self.sp.X0 * np.array([0.98, 0.98, 1.0])
        s = m2b.strains(self.sp, X)
        self.assertEqual(s["comp_share"], 1.0)
        self.assertAlmostEqual(s["comp_mean"], 0.02, places=9)

    def test_case_grid(self):
        self.assertEqual(len(m2b.CASES), 26)
        self.assertEqual(len(set(m2b.CASES)), 26)
        self.assertEqual(m2b.HS[1], 0.005)      # milestone 2a's base grid is in the sweep

    def test_finer_grid_keeps_specimen_area(self):
        sp = cusick.Specimen(0.027, 12.52, 150.0, h=0.0025)
        self.assertLess(abs(sp.flat_area() / (math.pi * cusick.R_SPEC ** 2) - 1), 0.01)


    def test_kes_shear_conversion(self):
        self.assertAlmostEqual(kes_shear.GF_CM_DEG, 56.19, places=2)
        self.assertAlmostEqual(kes_shear.g_si("D"), 88.8, places=1)
        self.assertAlmostEqual(kes_shear.shear_fraction("A", 150.0) * 150.0, kes_shear.g_si("A"))

    def test_diagonal_springs_give_shear_stiffness_k_s(self):
        # simple shear gamma on the flat sheet: diagonal-spring energy per area -> k_s gamma^2 / 2
        EA, sh, g = 1000.0, 0.1, 1e-4
        sp = cusick.Specimen(0.027, 12.52, EA, h=0.005, shear=sh)
        X = sp.X0.copy()
        X[:, 0] += g * X[:, 1]
        E = 0.0
        for a, b, L0, k in sp.springs[2:]:
            L = np.linalg.norm(X[b] - X[a], axis=1)
            E += 0.5 * k * ((L - L0) ** 2).sum()
        area = sp.n * sp.h ** 2            # one cell per node; boundary cells lose a few springs
        ratio = (E / area) / (0.5 * sh * EA * g * g)
        self.assertLess(abs(ratio - 1), 0.03)


if __name__ == "__main__":
    unittest.main()
