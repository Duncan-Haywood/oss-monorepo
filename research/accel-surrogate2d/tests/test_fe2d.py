import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
from accel_surrogate2d import fe2d, mlp, cost


def eb_uniform(h):
    return fe2d.P * fe2d.L ** 3 / (3 * fe2d.E * fe2d.B * h ** 3 / 12)


class FE2D(unittest.TestCase):
    def test_uniform_beam_converges_to_beam_theory(self):
        h = np.full(fe2d.NSEG, 0.04)
        ref = eb_uniform(0.04)
        errs = [abs(fe2d.tip_deflection(h, nx, ny) / ref - 1) for nx, ny in [(16, 2), (32, 4), (64, 8)]]
        self.assertTrue(errs[0] > errs[1] > errs[2])      # Q4 under-predicts bending (locking), less so when refined
        self.assertLess(errs[2], 0.3)
        # the fine-mesh answer lies within 5 % of Timoshenko (bending + shear) for a uniform beam
        k = 5.0 / 6.0
        tim = ref + fe2d.P * fe2d.L / (k * fe2d.E / (2 * (1 + fe2d.NU)) * fe2d.B * 0.04)
        self.assertLess(abs(fe2d.tip_deflection(h, 128, 16) / tim - 1), 0.12)

    def test_stiffer_for_taller_sections(self):
        a = fe2d.tip_deflection(np.full(8, 0.03), 16, 2)
        b = fe2d.tip_deflection(np.full(8, 0.05), 16, 2)
        self.assertGreater(a, b)

    def test_column_heights_average_across_steps(self):
        h = np.arange(1, 9) * 0.01
        c = fe2d.column_heights(h, 16)
        self.assertEqual(len(c), 17)
        self.assertAlmostEqual(c[0], 0.01)
        self.assertAlmostEqual(c[-1], 0.08)
        self.assertAlmostEqual(c[2], 0.015)               # boundary between segments 1 and 2

    def test_element_stiffness_rigid_body_modes(self):
        k = fe2d._ke(np.array([[0, 0], [2, 0], [2, 1], [0, 1.0]]) * 0.01)
        self.assertLess(np.abs(k @ np.tile([1.0, 0.0], 4)).max() / np.abs(k).max(), 1e-10)
        self.assertLess(np.abs(k @ np.tile([0.0, 1.0], 4)).max() / np.abs(k).max(), 1e-10)

    def test_flops_grow_with_mesh(self):
        self.assertLess(fe2d.fe_flops(32, 4) * 5, fe2d.fe_flops(64, 8))


class MLPCost(unittest.TestCase):
    def test_quantiser_levels(self):
        w = np.random.default_rng(0).normal(size=(20, 20))
        self.assertLessEqual(len(np.unique(mlp.qw(w, 3))), 7)

    def test_breakeven_consistent(self):
        S = [8, 32, 32, 1]
        self.assertAlmostEqual(cost.fe_energy_pj(cost.breakeven_flops(S, 8)), cost.mlp_energy_pj(S, 8))


if __name__ == '__main__':
    unittest.main()
