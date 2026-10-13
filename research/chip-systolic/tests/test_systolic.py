import unittest
import numpy as np
from chip_systolic import flow, gen, model


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
            for c, r in ((1, 1), (2, 4), (3, 3), (8, 4)):   # c=3 does not divide 8 or 4: ragged last tile
                out, cs = flow.simulate(q, c, r, xi)
                self.assertTrue((out == ref).all(), (wb, c, r))
                self.assertEqual(set(cs), {gen.cycles(c, r)})

    def test_extreme_inputs(self):
        q = model.quantise(self.params, self.x, 6)
        lim = 2 ** 5
        xi = np.array([[lim - 1] * 8, [-lim] * 8, [lim - 1, -lim] * 4, [0] * 8])
        out, _ = flow.simulate(q, 2, 4, xi)
        self.assertTrue((out == model.int_forward(q, xi)).all())

    def test_cycle_formula(self):
        self.assertEqual([gen.cycles(c, 4) for c in (1, 2, 4, 8)], [146, 80, 47, 40])
        self.assertEqual(gen.cycles(1, 1), 110)

    def test_more_columns_more_area(self):
        q = model.quantise(self.params, self.x, 4)
        self.assertLess(flow.score(q, 1, 4)["cells"], flow.score(q, 4, 4)["cells"])


if __name__ == "__main__":
    unittest.main()
