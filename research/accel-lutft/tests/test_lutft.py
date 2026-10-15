import os, sys, unittest
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))
from accel_lutft import lut as L, model as M
import run as R


class T(unittest.TestCase):
    def test_share_quant_codebook_and_zeros(self):
        w = np.random.default_rng(0).normal(size=(20, 10)); w[:10] = 0
        q = R.share_quant(4, 5)(w)
        self.assertLessEqual(len(np.unique(q[w != 0])), 4)
        self.assertTrue(np.all(q[w == 0] == 0))

    def test_finetune_keeps_codebook_and_mask(self):
        rng = np.random.default_rng(1)
        X = rng.normal(size=(80, 6)); y = (X[:, 0] > 0).astype(int)
        p = M.init([6, 5, 2], rng); m = [np.ones_like(a[0]) for a in p]; m[0][:, :2] = 0
        for k in range(2): p[k][0] *= m[k]
        M.train(p, X, y, m, R.share_quant(3, 5), 3, rng, lr=1e-3, prune_to=0.0, prune_from=0, prune_until=1)
        self.assertTrue(np.all(p[0][0][:, :2] == 0))
        q = R.share_quant(3, 5)(p[0][0])
        self.assertLessEqual(len(np.unique(q[p[0][0] != 0])), 3)

    def test_finetune_does_not_hurt_on_separable_data(self):
        rng = np.random.default_rng(2)
        X = rng.normal(size=(200, 6)); y = (X[:, 0] + X[:, 1] > 0).astype(int)
        p = M.init([6, 8, 2], rng); m = [np.ones_like(a[0]) for a in p]; fq = M.make_quant('float')
        M.train(p, X, y, m, fq, 40, rng)
        qk = R.share_quant(2, 10)
        before = M.accuracy(p, X, y, qk, m, 8, M.act_scales_from(p, X, qk, m, 8))
        M.train(p, X, y, m, R.share_quant(2, 5), 40, rng, lr=1e-3, prune_to=0.0, prune_from=0, prune_until=1)
        after = M.accuracy(p, X, y, qk, m, 8, M.act_scales_from(p, X, qk, m, 8))
        self.assertGreaterEqual(after, before - 0.02)

    def test_energy_matches_lut_model(self):
        row = dict(sparsity=0.0, design='ft4', nnz=[2048, 320])
        e = sum(L.energy_lut_pj(fi, fo, nz, 4, ab, False, 0.04) for (fi, fo), nz, ab in zip(R.DIMS, row['nnz'], R.ABITS)) / 1000
        self.assertAlmostEqual(R.energy(row), e)
