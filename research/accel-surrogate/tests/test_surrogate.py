import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_surrogate import beam, mlp, cost


class BeamTests(unittest.TestCase):
    def test_fe_matches_closed_form_uniform(self):
        h = np.full(beam.NSEG, 0.04)
        exact = beam.P * beam.L ** 3 / (3 * beam.E * beam.B * 0.04 ** 3 / 12)
        self.assertAlmostEqual(beam.fe_tip_deflection(h) / exact, 1.0, places=9)

    def test_fe_matches_closed_form_stepped(self):
        h = np.linspace(0.06, 0.02, beam.NSEG)
        self.assertAlmostEqual(beam.fe_tip_deflection(h) / beam.eb_tip_closed(h), 1.0, places=6)

    def test_shear_gap_positive_and_small(self):
        rng = np.random.default_rng(0)
        g = [beam.timoshenko_gap(h) for h in beam.sample_designs(rng, 50)]
        self.assertTrue(all(0 < x < 0.1 for x in g))

    def test_thicker_is_stiffer(self):
        self.assertLess(beam.fe_tip_deflection(np.full(beam.NSEG, 0.05)),
                        beam.fe_tip_deflection(np.full(beam.NSEG, 0.03)))


class MlpTests(unittest.TestCase):
    def test_quantiser_levels(self):
        w = np.random.default_rng(1).normal(size=(20, 20))
        self.assertLessEqual(len(np.unique(mlp.qw(w, 3))), 7)
        self.assertEqual(mlp.qw(w, None) is w, True)

    def test_training_reduces_loss(self):
        rng = np.random.default_rng(2)
        X = rng.uniform(-1, 1, (256, 3)); y = (X.sum(1, keepdims=True)) ** 2
        p = mlp.init(rng, [3, 16, 1])
        before = np.mean((mlp.forward(p, X) - y) ** 2)
        mlp.train(p, X, y, rng, epochs=40)
        self.assertLess(np.mean((mlp.forward(p, X) - y) ** 2), before / 3)


class CostTests(unittest.TestCase):
    def test_energy_grows_with_bits(self):
        s = [8, 32, 32, 1]
        self.assertLess(cost.mlp_energy_pj(s, 4), cost.mlp_energy_pj(s, 8))

    def test_breakeven_consistent(self):
        s = [8, 32, 32, 1]
        f = cost.breakeven_flops(s, 8)
        self.assertAlmostEqual(cost.fe_energy_pj(f), cost.mlp_energy_pj(s, 8))


if __name__ == '__main__':
    unittest.main()
