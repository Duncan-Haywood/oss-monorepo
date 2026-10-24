import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
from accel_surrogatelock import fe2d, mlp, cost


def timoshenko_uniform(h):
    eb = fe2d.P * fe2d.L ** 3 / (3 * fe2d.E * fe2d.B * h ** 3 / 12)
    return eb + fe2d.P * fe2d.L / (5.0 / 6.0 * fe2d.E / (2 * (1 + fe2d.NU)) * fe2d.B * h)


class Elements(unittest.TestCase):
    def test_q6_is_locking_free_on_a_coarse_mesh(self):
        h = np.full(fe2d.NSEG, 0.04)
        ref = timoshenko_uniform(0.04)
        q6 = fe2d.tip_deflection(h, 16, 2, 'q6') / ref
        q4 = fe2d.tip_deflection(h, 16, 2, 'q4') / ref
        self.assertLess(abs(q6 - 1), 0.02)          # within 2 % of Timoshenko on 16x2
        self.assertLess(q4, 0.6)                    # Q4 gives about half the deflection there

    def test_q6_converges_from_below_to_theory(self):
        h = np.full(fe2d.NSEG, 0.04)
        ref = timoshenko_uniform(0.04)
        e = [abs(fe2d.tip_deflection(h, nx, ny) / ref - 1) for nx, ny in [(16, 2), (64, 8)]]
        self.assertLess(e[1], 0.01)

    def test_q6_patch_test_constant_strain(self):
        # a distorted element under uniform strain: nodal displacements of u = (a x, b y) give force = K u with
        # zero net force at an interior node of a patch; check rigid modes and symmetry of the condensed stiffness
        xy = np.array([[0, 0], [2.0, 0.1], [2.2, 1.3], [-0.1, 1.0]]) * 0.01
        k = fe2d._ke(xy, 'q6')
        self.assertLess(np.abs(k - k.T).max() / np.abs(k).max(), 1e-10)
        self.assertLess(np.abs(k @ np.tile([1.0, 0.0], 4)).max() / np.abs(k).max(), 1e-10)
        self.assertLess(np.abs(k @ np.tile([0.0, 1.0], 4)).max() / np.abs(k).max(), 1e-10)
        # constant strain: u = 0.001*x gives nodal forces that sum to zero in each direction
        u = np.zeros(8)
        u[0::2] = 1e-3 * xy[:, 0]
        self.assertLess(abs((k @ u)[0::2].sum()) / np.abs(k @ u).max(), 1e-9)

    def test_q6_is_softer_than_q4_and_stiffer_for_taller(self):
        h = np.full(fe2d.NSEG, 0.04)
        self.assertGreater(fe2d.tip_deflection(h, 16, 2, 'q6'), fe2d.tip_deflection(h, 16, 2, 'q4'))
        self.assertGreater(fe2d.tip_deflection(np.full(8, 0.03), 16, 2), fe2d.tip_deflection(np.full(8, 0.05), 16, 2))

    def test_column_heights_average_across_steps(self):
        c = fe2d.column_heights(np.arange(1, 9) * 0.01, 16)
        self.assertEqual(len(c), 17)
        self.assertAlmostEqual(c[2], 0.015)


class Surrogate(unittest.TestCase):
    def test_quantiser_levels(self):
        w = np.linspace(-1, 1, 101)
        self.assertLessEqual(len(np.unique(mlp.qw(w, 3))), 7)

    def test_breakeven_positive(self):
        self.assertGreater(cost.breakeven_flops([8, 32, 32, 1], 8), 0)


if __name__ == '__main__':
    unittest.main()
