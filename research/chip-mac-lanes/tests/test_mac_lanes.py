import unittest
from chip_mac_lanes import baseline_gen, flow, model


class T(unittest.TestCase):
    def test_rtl_matches_numpy_and_formula_for_non_power_of_two_lanes(self):
        for f, ps in ((16, (1, 3, 6, 7)), (32, (5, 6, 20))):
            x, y = model.make_data(0, 300, f)
            q = model.quantise(model.train_float(x, y), x, 4)
            xi = q["xq"](x[:4])
            ref = model.int_forward(q, xi)
            for p in ps:
                out, cs = flow.simulate(q, p, xi)
                self.assertTrue((out == ref).all(), (f, p))
                self.assertEqual(set(cs), {baseline_gen.cycles(p, f, model.H)}, (f, p))

    def test_cycles_formula_is_flat_beyond_the_hidden_width(self):
        # H = 16: P >= 16 all give one group per layer, so extra lanes add area and no speed.
        self.assertEqual({baseline_gen.cycles(p, 32, 16) for p in range(16, 64)}, {2 + 33 + 17})

    def test_smallest_p_for_each_hidden_group_count(self):
        # fewest lanes reaching g groups of the 16 hidden neurons: ceil(16/P) == g
        first = {}
        for p in range(1, 17):
            first.setdefault(-(-16 // p), p)
        self.assertEqual(first, {16: 1, 8: 2, 6: 3, 4: 4, 3: 6, 2: 8, 1: 16})

    def test_area_grows_with_lanes(self):
        x, y = model.make_data(0, 300, 16)
        q = model.quantise(model.train_float(x, y), x, 4)
        cells = [flow.score(q, p)["cells"] for p in (2, 4, 8)]
        self.assertEqual(cells, sorted(cells))


if __name__ == "__main__":
    unittest.main()
