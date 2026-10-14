import unittest
import numpy as np
from chip_systolic_batch import baseline_gen, flow, gen, model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        x, y = model.make_data(0, 300)
        cls.x = x
        cls.params = model.train_float(x, y)

    def test_rtl_matches_numpy_at_larger_batches(self):
        q = model.quantise(self.params, self.x, 4)
        xi = q["xq"](self.x[:32])
        ref = model.int_forward(q, xi)
        for c, r in ((2, 8), (4, 16), (3, 8)):
            out, cs = flow.simulate(q, c, r, xi)
            self.assertTrue((out == ref).all(), (c, r))
            self.assertEqual(set(cs), {gen.cycles(c, r)})

    def test_cycle_formula(self):
        self.assertEqual([gen.cycles(4, r) for r in (4, 8, 16)], [47, 59, 83])

    def test_cycles_per_vector_fall_with_batch(self):
        per = [gen.cycles(4, r) / r for r in (4, 8, 16, 32)]
        self.assertEqual(per, sorted(per, reverse=True))

    def test_baseline_cycles_linear_in_batch(self):
        self.assertEqual(8 * baseline_gen.cycles(4), 2 * 4 * baseline_gen.cycles(4))

    def test_more_rows_more_area(self):
        q = model.quantise(self.params, self.x, 4)
        self.assertLess(flow.score(q, 2, 4)["cells"], flow.score(q, 2, 8)["cells"])


if __name__ == "__main__":
    unittest.main()
