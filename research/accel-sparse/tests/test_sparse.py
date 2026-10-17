import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_sparse import model as M, cost as C


class T(unittest.TestCase):
    def test_ternary_values(self):
        w = np.random.default_rng(0).normal(size=(20, 20))
        q = M.q_ternary(w)
        self.assertLessEqual(len(np.unique(np.abs(q))), 2)
        self.assertTrue(np.all(np.sign(q) * np.sign(w) >= 0))

    def test_binary_two_levels(self):
        q = M.q_binary(np.random.default_rng(1).normal(size=(10, 10)))
        self.assertEqual(len(np.unique(np.abs(q))), 1)

    def test_uniform_levels(self):
        q = M.q_uniform(np.random.default_rng(2).normal(size=(50, 50)), 4)
        self.assertLessEqual(len(np.unique(q)), 15)

    def test_pruning_hits_target_and_keeps_zeros(self):
        rng = np.random.default_rng(3)
        x = rng.normal(size=(200, 8)); y = (x[:, 0] > 0).astype(int)
        p = M.init([8, 16, 2], rng); ms = [np.ones_like(a[0]) for a in p]
        M.train(p, x, y, ms, M.make_quant('float'), 30, rng, prune_to=0.9, prune_from=0, prune_until=15)
        frac = 1 - np.mean(np.concatenate([m.ravel() for m in ms]))
        self.assertGreater(frac, 0.85)
        for k in range(2):
            self.assertTrue(np.all(p[k][0][ms[k] == 0] == 0))

    def test_learns(self):
        rng = np.random.default_rng(4)
        x = rng.normal(size=(300, 4)); y = (x[:, 0] + x[:, 1] > 0).astype(int)
        p = M.init([4, 8, 2], rng); ms = [np.ones_like(a[0]) for a in p]
        q = M.make_quant('float'); M.train(p, x, y, ms, q, 60, rng)
        self.assertGreater(M.accuracy(p, x, y, q, ms, None, None), 0.9)

    def test_cost_monotone(self):
        dense = C.layer_energy_pj(64, 32, 2048, 'mult', 8, 4, False)
        half = C.layer_energy_pj(64, 32, 1024, 'mult', 8, 4, True)
        self.assertLess(C.layer_energy_pj(64, 32, 2048, 'mult', 4, 4, False), dense)
        self.assertLess(C.layer_energy_pj(64, 32, 2048, 'signadd', 2, 4, False), dense)
        self.assertLess(C.layer_energy_pj(64, 32, 100, 'mult', 8, 4, True), half)

    def test_sparse_storage_has_index_overhead(self):
        self.assertGreater(C.storage_bits(64, 32, 2048, 8, True), C.storage_bits(64, 32, 2048, 8, False))


if __name__ == '__main__':
    unittest.main()
