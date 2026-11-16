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
        # The module docstring says these are accel-sparse's 13 designs: compare with its list.
        import importlib.util
        path = os.path.join(os.path.dirname(__file__), '..', '..', 'accel-sparse', 'experiments', 'run.py')
        spec = importlib.util.spec_from_file_location('accel_sparse_run', path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertEqual(S.DESIGNS, mod.DESIGNS)
        self.assertEqual(len({d[0] for d in S.DESIGNS}), 13)

    # Hand computations from the constants in accel_sparse/cost.py (0.2 pJ 8x8 multiply,
    # 0.075 pJ add, 0.16 pJ per bit read, 0.01 pJ negate), 70-64-11, 8-bit activations in
    # both layers.  Worked by hand in the 2026-11-16 quality fix (audit
    # portfolio/quality/audits/2026-11-07-accel-kwssparse.json, defect 0).
    def test_int8_dense_energy_by_hand(self):
        # layer 1: 4480 * (8 + 8) * 0.16 read + 4480 * (0.2 + 0.075) = 11468.8 + 1232 = 12700.8 pJ
        # layer 2:  704 * (8 + 8) * 0.16 read +  704 * 0.275        =  1802.24 + 193.6 = 1995.84 pJ
        e = S.energy_nj([4398, 696], 'int8', 8, False, 70, 64)  # dense: nnz does not matter
        self.assertAlmostEqual(e, 14.69664, places=9)

    def test_int8_pruned_energy_by_hand(self):
        # 10% kept: [448, 70] nonzeros, value + column index (ceil log2 70 = 7, ceil log2 64 = 6)
        # layer 1: 448 * (8 + 7) * 0.16 + 448 * 8 * 0.16 + 448 * 0.275 = 1075.2 + 573.44 + 123.2
        # layer 2:  70 * (8 + 6) * 0.16 +  70 * 8 * 0.16 +  70 * 0.275 =  156.8 +  89.6  + 19.25
        e = S.energy_nj([448, 70], 'int8', 8, True, 70, 64)
        self.assertAlmostEqual(e, 2.03749, places=9)

    def test_ternary_dense_energy_by_hand(self):
        # every 2-bit weight is read; only the nonzeros add (0.01 negate + 0.075 add, no multiply)
        # layer 1: 4480 * (2 + 8) * 0.16 + 3000 * 0.085 = 7168 + 255
        # layer 2:  704 * (2 + 8) * 0.16 +  500 * 0.085 = 1126.4 + 42.5
        e = S.energy_nj([3000, 500], 'ternary', 2, False, 70, 64)
        self.assertAlmostEqual(e, 8.5919, places=9)

    def test_float32_dense_energy_by_hand(self):
        # 32-bit weights: multiply scaled by 32*8/64 = 4x, i.e. 0.8 pJ
        # layer 1: 4480 * (32 + 8) * 0.16 + 4480 * (0.8 + 0.075) = 28672 + 3920
        # layer 2:  704 * 40 * 0.16       +  704 * 0.875         =  4505.6 + 616
        e = S.energy_nj([4480, 704], 'float', 32, False, 70, 64)
        self.assertAlmostEqual(e, 37.7136, places=9)

    def test_sparse_storage_by_hand(self):
        # 448 * (8 + 7) + 70 * (8 + 6) = 6720 + 980 bits
        self.assertAlmostEqual(S.storage_kbit([448, 70], 8, True, 70, 64), 7.7, places=12)
        # dense ternary: (4480 + 704) * 2 bits
        self.assertAlmostEqual(S.storage_kbit([1, 1], 2, False, 70, 64), 10.368, places=12)

    def test_committed_results_recompute(self):
        # Every energy and storage figure in results.json (the headline table's inputs)
        # must follow from its stored nonzero counts under the current cost model.
        import json
        here = os.path.join(os.path.dirname(__file__), '..', 'experiments')
        r = json.load(open(os.path.join(here, 'results.json')))
        designs = {d[0]: d[1:] for d in S.DESIGNS}
        self.assertEqual(set(r), set(designs))
        for name, rows in r.items():
            qk, wb, sp = designs[name]
            for q in rows:
                self.assertAlmostEqual(q['energy_nj'], S.energy_nj(q['nnz'], qk, wb, sp is not None, 70, 64),
                                       places=9, msg=name)
                self.assertAlmostEqual(q['storage_kbit'], S.storage_kbit(q['nnz'], wb, sp is not None, 70, 64),
                                       places=9, msg=name)
                self.assertEqual(q['multiplier_free'], qk in ('ternary', 'binary'), msg=name)

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
