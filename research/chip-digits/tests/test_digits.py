import unittest
import numpy as np
from chip_digits import flow, model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.xtr, cls.xte, cls.ytr, cls.yte = model.load(0)
        cls.p = model.train_float(cls.xtr, cls.ytr, 0, epochs=400)

    def test_float_model_learns_real_digits(self):
        self.assertGreater(model.float_acc(self.p, self.xte, self.yte), 0.93)

    def test_rtl_lane_matches_numpy_dot_products(self):
        for wb, ab in ((3, 3), (4, 5), (6, 4)):
            q = model.quantise(self.p, self.xtr, wb, ab)
            a = np.repeat(q["xq"](self.xte[:2]), model.NHID, axis=0)
            w = np.tile(q["w1"].T, (2, 1))
            self.assertEqual(flow.simulate(wb, ab, a, w), list((a * w).sum(1)), (wb, ab))

    def test_lane_extremes_fit_the_accumulator(self):
        wb, ab = 4, 4
        a = np.full((2, 64), 15); w = np.array([[7] * 64, [-8] * 64])
        self.assertEqual(flow.simulate(wb, ab, a, w), [15 * 7 * 64, -15 * 8 * 64])

    def test_quantised_values_in_range(self):
        q = model.quantise(self.p, self.xtr, 4, 4)
        self.assertTrue(q["w1"].min() >= -8 and q["w1"].max() <= 7)
        _, h = model.int_forward(q, q["xq"](self.xte))
        self.assertTrue(h.min() >= 0 and h.max() <= 15)

    def test_8bit_close_to_float(self):
        q = model.quantise(self.p, self.xtr, 8, 8)
        self.assertLess(abs(model.int_acc(q, self.xte, self.yte) - model.float_acc(self.p, self.xte, self.yte)), 0.02)

    def test_synthesis_score_grows_with_width(self):
        self.assertLess(flow.score(3, 3)["cells"], flow.score(8, 8)["cells"])


if __name__ == "__main__":
    unittest.main()
