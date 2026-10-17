import unittest
import numpy as np
from chip_accel import flow, gen, model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        x, y = model.make_data(0, 300)
        cls.x = x
        cls.params = model.train_float(x, y)

    def test_rtl_matches_numpy_bit_exact(self):
        for wb in (4, 8):
            q = model.quantise(self.params, self.x, wb)
            xi = q["xq"](self.x[:12])
            ref = model.int_forward(q, xi)
            for p in (1, 3, 8):                      # 3 does not divide 8 or 4: exercises ragged last group
                out, cs = flow.simulate(q, p, xi)
                self.assertTrue((out == ref).all(), (wb, p))
                self.assertEqual(set(cs), {gen.cycles(p)})

    def test_extreme_inputs(self):
        q = model.quantise(self.params, self.x, 6)
        lim = 2 ** 5
        xi = np.array([[lim - 1] * 8, [-lim] * 8, [lim - 1, -lim] * 4])
        out, _ = flow.simulate(q, 2, xi)
        self.assertTrue((out == model.int_forward(q, xi)).all())

    def test_cycle_formula(self):
        self.assertEqual([gen.cycles(p) for p in (1, 2, 4, 8)], [110, 56, 29, 20])

    def test_quantised_accuracy_reasonable(self):
        xt, yt = model.make_data(1, 300)
        q = model.quantise(self.params, self.x, 8)
        acc = (model.predict(model.int_forward(q, q["xq"](xt))) == yt).mean()
        self.assertGreater(acc, 0.8)

    def test_more_lanes_more_area(self):
        q = model.quantise(self.params, self.x, 4)
        self.assertLess(flow.score(q, 1)["cells"], flow.score(q, 4)["cells"])


if __name__ == "__main__":
    unittest.main()
