"""Milestone 1d wiring: the hanger sheet's diagonal springs give in-plane shear stiffness shear x EA
on its rectangular cells, the KES tensile conversion, and the case grid."""
import importlib.util
import unittest
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("m1d", HERE.parent / "experiments" / "m1d_measured_shear" / "run.py")
m1d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m1d)


class TestM1d(unittest.TestCase):
    def test_sheet_shear_stiffness_is_shear_times_ea(self):
        # simple shear gamma of the flat (s, z) sheet: diagonal-spring energy per area -> k_s gamma^2 / 2
        code, ea, gam = "D", 800.0, 1e-4
        h, g = m1d.m1c.width(code, 1.0, ea)
        sh = m1d.Sheet(m1d.Arm(h, m1d.SHALLOW), g, shear=m1d.shear_frac(code, ea))
        self.assertNotAlmostEqual(sh.l0, sh.dz, places=4)      # rectangular cells
        s, z = np.meshgrid(sh.s, sh.z, indexing="ij")
        P = np.stack([s + gam * z, z], -1)
        E = 0.0
        for a, b in [(P[:-1, :-1], P[1:, 1:]), (P[:-1, 1:], P[1:, :-1])]:
            L = np.linalg.norm(b - a, axis=-1)
            E += 0.5 * sh.ks_d * ((L - sh.diag) ** 2).sum()
        area = (sh.n - 1) * (sh.nz - 1) * sh.l0 * sh.dz
        ratio = (E / area) / (0.5 * m1d.kes_shear.g_si(code) * gam * gam)
        self.assertLess(abs(ratio - 1), 1e-3)

    def test_kes_tensile_conversion(self):
        self.assertAlmostEqual(m1d.emt("A"), 2 * 32.78 / (0.632 * 500), places=9)
        self.assertEqual(m1d.ea_kes("A"), 2360.0)
        self.assertEqual(m1d.ea_kes("D"), 7790.0)
        # stiffer than the programme's old sweep for every fabric
        self.assertTrue(all(m1d.ea_kes(c) > 800 for c in m1d.FABRICS))

    def test_case_grid_and_1c_rule(self):
        self.assertEqual(sum(len(m1d.eas(c)) for c in m1d.FABRICS) * len(m1d.OFFSETS), 126)
        self.assertEqual((m1d.CHUNK, m1d.TOL, m1d.MAXIT), (3000, 0.002, 60000))
        self.assertEqual(m1d.m1c_best()[(40.0, "D")], 2.5)


if __name__ == "__main__":
    unittest.main()
