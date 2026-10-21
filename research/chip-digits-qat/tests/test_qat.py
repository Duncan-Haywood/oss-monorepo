import unittest
import numpy as np
from chip_digits_qat import qat
from chip_digits import model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.xtr, cls.xte, cls.ytr, cls.yte = model.load(0)
        cls.p = model.train_float(cls.xtr, cls.ytr, 0, epochs=400)

    def test_max_scale_matches_baseline_quantiser(self):
        a = model.quantise(self.p, self.xtr, 4, 4)
        b = qat.quantise_scales(self.p, self.xtr, 4, 4, qat.max_scale)
        for k in ("w1", "w2", "b1", "b2", "sh"):
            self.assertTrue(np.array_equal(a[k], b[k]), k)

    def test_clip_scale_never_worse_in_weight_mse(self):
        w = self.p[0]
        for wb in (2, 3, 4):
            e = lambda s: ((qat._q(w, s, wb) * s - w) ** 2).sum()
            self.assertLessEqual(e(qat.clip_scale(w, wb)), e(qat.max_scale(w, wb)) + 1e-12)

    def test_wide_perchannel_close_to_float(self):
        self.assertGreater(qat.perchannel_acc(self.p, self.xtr, self.xte, self.yte, 8, 8),
                           model.float_acc(self.p, self.xte, self.yte) - 0.02)

    def test_qat_weights_stay_integer_exact_and_help_at_3_bits(self):
        pq = qat.qat_train(self.p, self.xtr, self.ytr, 3, 4, epochs=150)
        q = qat.quantise_scales(pq, self.xtr, 3, 4, qat.max_scale)
        self.assertLessEqual(np.abs(q["w1"]).max(), 4)
        base = model.int_acc(model.quantise(self.p, self.xtr, 3, 4), self.xte, self.yte)
        self.assertGreater(model.int_acc(q, self.xte, self.yte), base - 0.02)
