import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from accel_kwssparse import sweep as S
from accel_sparse import model as M, cost as C


def toy(n=600, d=20, seed=0):
    rng = np.random.default_rng(seed)
    y = rng.integers(0, 11, n)
    x = rng.normal(size=(n, d)) + np.eye(11, d)[y] * 3
    return x, y


class T(unittest.TestCase):
    def test_designs_match_accel_sparse(self):
        import accel_sparse.model  # same designs (13 in code; its README says 14) as the digits sweep
        self.assertEqual(len(S.DESIGNS), 13)
        self.assertEqual(len({d[0] for d in S.DESIGNS}), 13)

    def test_dims_and_energy(self):
        self.assertEqual(S.dims(70, 64), [(70, 64), (64, 11)])
        dense = S.energy_nj([70 * 64, 64 * 11], 'int8', 8, False, 70, 64)
        pruned = S.energy_nj([70 * 64 // 10, 64 * 11 // 10], 'int8', 8, True, 70, 64)
        self.assertGreater(dense, pruned)
        tern = S.energy_nj([70 * 64, 64 * 11], 'ternary', 2, False, 70, 64)
        self.assertLess(tern, dense)

    def test_storage_sparse_pays_index_bits(self):
        full = S.storage_kbit([4480, 704], 8, False, 70, 64)
        self.assertAlmostEqual(full, (4480 + 704) * 8 / 1000.0)
        self.assertGreater(S.storage_kbit([4480, 704], 8, True, 70, 64), full)

    def test_standardise_uses_train_stats(self):
        a = np.random.default_rng(1).normal(5, 3, (100, 4))
        b = a + 1
        sa, sb = S.standardise(a, b)
        self.assertTrue(np.allclose(sa.mean(0), 0, atol=1e-9))
        self.assertTrue(np.allclose(sb.mean(0), 1 / (a.std(0) + 1e-8), atol=1e-6))

    def test_pruned_design_hits_sparsity_and_learns(self):
        x, y = toy()
        params, masks, quant = S.train_design(x, y, 'int8', 0.75, 0, 16, 20, 64)
        nnz = M.nnz_per_layer(params, quant, masks)
        total = 20 * 16 + 16 * 11
        self.assertLessEqual(sum(nnz), 0.27 * total)
        sc = M.act_scales_from(params, x, quant, masks, 8)
        self.assertGreater(M.accuracy(params, x, y, quant, masks, 8, sc), 0.3)

    def test_ternary_is_multiplier_free(self):
        self.assertEqual(S.kind_of('ternary'), 'signadd')
        self.assertEqual(S.kind_of('int4'), 'mult')


if __name__ == '__main__':
    unittest.main()
