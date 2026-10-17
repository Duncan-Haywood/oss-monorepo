import math, unittest
from chirp_twin import *

A = dict(fc=77e9, B=1e9, T=40e-6)          # fast automotive-style chirp
Bs = dict(fc=24e9, B=250e6, T=1e-3)        # slow ramp


class M(unittest.TestCase):
    def test_kappa_and_cells_identity(self):
        k = kappa(77e9, 40e-6, 1e9)
        self.assertAlmostEqual(k, 77e9 * 40e-6 / 1e9)
        # bias in cells = f_D T, independent of B
        cells = range_bias(30.0, 77e9, 40e-6, 1e9) / (C / (2 * 1e9))
        self.assertAlmostEqual(cells, bias_cells(30.0, 77e9, 40e-6), places=9)
        self.assertAlmostEqual(bias_cells(30.0, 77e9, 40e-6), bias_cells(30.0, 77e9, 40e-6))
        self.assertAlmostEqual(range_bias(30.0, 77e9, 40e-6, 2e9) / (C / 4e9), bias_cells(30.0, 77e9, 40e-6), places=9)

    def test_unambiguous_form(self):
        Tpri = 60e-6
        V = unamb_velocity(77e9, Tpri)
        self.assertAlmostEqual(bias_cells_unamb(17.0, V, 40e-6, Tpri), bias_cells(17.0, 77e9, 40e-6), places=9)
        self.assertLessEqual(bias_cells_unamb(V, V, Tpri, Tpri), 0.5 + 1e-12)

    def test_signal_level_range_bias_matches_kappa_v(self):
        for p, R0, v in ((A, 30.0, 25.0), (A, 30.0, -25.0), (Bs, 30.0, 25.0), (Bs, 30.0, -10.0)):
            r = measured_range(R0, v, **p)
            cell = C / (2 * p["B"])
            self.assertAlmostEqual((r - range_read(R0, v, p['fc'], p['T'], p['B'])) / cell, 0.0, delta=0.002)
            self.assertAlmostEqual((r - R0 - range_bias(v, **p)) / (range_bias(v, **p)), 0.0, delta=0.02)   # the rest is the v T term

    def test_stationary_target_has_no_bias(self):
        r = measured_range(30.0, 0.0, **A)
        self.assertAlmostEqual((r - 30.0) / (C / 2e9), 0.0, delta=0.02)

    def test_wrap_and_corrected_error(self):
        V = 10.0
        self.assertAlmostEqual(wrap(12.0, V), -8.0)
        # |v| < V: compensation is exact
        self.assertAlmostEqual(corrected_error(5.0, 77e9, 40e-6, 1e9, 60e-6), 0.0, places=9)
        # cells form: one fold leaves T/Tpri cells
        self.assertAlmostEqual(corrected_error_cells(15.0, V, 60e-6, 60e-6), 1.0)
        self.assertAlmostEqual(corrected_error_cells(15.0, V, 30e-6, 60e-6), 0.5)

    def test_corrected_error_matches_kappa_form(self):
        Tpri = 60e-6
        V = unamb_velocity(77e9, Tpri)
        v = 1.4 * V
        cells = corrected_error(v, 77e9, 40e-6, 1e9, Tpri) / (C / 2e9)
        self.assertAlmostEqual(cells, corrected_error_cells(v, V, 40e-6, Tpri), places=9)

    def test_worse_than_none_on_upper_half_of_each_fold(self):
        V = 10.0
        self.assertFalse(worse_than_none(5.0, V))
        self.assertTrue(worse_than_none(11.0, V))    # x=.55, k=1
        self.assertTrue(worse_than_none(14.0, V))    # x=.7, k=1
        self.assertFalse(worse_than_none(25.0, V))   # x=1.25, k=1
        self.assertTrue(worse_than_none(35.0, V))    # x=1.75, k=2
        self.assertFalse(worse_than_none(45.0, V))   # x=2.25, k=2

    def test_ring_closed_forms_match_numeric(self):
        phi = math.pi / 3
        self.assertAlmostEqual(ring_cos2_mean(phi), 0.5 + math.sin(2 * phi) / (4 * phi))
        self.assertAlmostEqual(ring_cos2_mean(1e-6), 1.0, places=6)
        # numeric rigid residual (rotation + translation removed) is close to the translation-only closed form
        kv, r = 0.1, 40.0
        self.assertAlmostEqual(ring_rigid_residual_rms(kv, phi, r) / ring_residual_rms(kv, phi), 1.0, delta=0.02)

    def test_zero_coupling_is_identity(self):
        self.assertEqual(ring_translation_bias(0.0, 1.0), 0.0)
        self.assertAlmostEqual(ring_rigid_residual_rms(0.0, 1.0, 10.0), 0.0, places=12)


if __name__ == "__main__":
    unittest.main()
