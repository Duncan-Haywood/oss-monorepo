import unittest
from chip_systolic_p32 import baseline_gen, flow, gen, model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        x, y = model.make_data(0, 300)
        cls.x = x
        cls.params = model.train_float(x, y)

    def test_rtl_matches_numpy_when_array_is_reused(self):
        q = model.quantise(self.params, self.x, 4)
        xi = q["xq"](self.x[:8])
        ref = model.int_forward(q, xi)
        for c, r in ((2, 1), (4, 1), (4, 2)):
            out, cs = flow.simulate(q, c, r, xi)  # 8/r successive batches on one instance
            self.assertTrue((out == ref).all(), (c, r))
            self.assertEqual(set(cs), {gen.cycles(c, r)})

    def test_rtl_matches_numpy_at_fan_in_16(self):
        x, y = model.make_data(0, 300, 16)
        q = model.quantise(model.train_float(x, y), x, 4)
        xi = q["xq"](x[:4])
        ref = model.int_forward(q, xi)
        for c, r in ((4, 1), (8, 2)):
            out, cs = flow.simulate(q, c, r, xi)
            self.assertTrue((out == ref).all(), (c, r))
            self.assertEqual(set(cs), {gen.cycles(c, r, 16)})
        # MAC-lane baseline at F = 16 (cycles formula checked by the generator's own schedule)
        self.assertEqual(baseline_gen.cycles(4, 16), 2 + 4 * 17 + 1 * 17)   # H fixed at 16: 4 groups of 17, then 1 group of 17

    def test_mac_engine_rtl_matches_numpy_and_formula(self):
        for f, ps in ((8, (4, 16)), (16, (8, 16))):
            x, y = model.make_data(0, 300, f)
            q = model.quantise(model.train_float(x, y), x, 4)
            xi = q["xq"](x[:4])
            ref = model.int_forward(q, xi)
            for p in ps:
                out, cs = flow.simulate(q, 0, 1, xi, mac_lanes=p)
                self.assertTrue((out == ref).all(), (f, p))
                self.assertEqual(set(cs), {baseline_gen.cycles(p, f)})

    def test_p32_engine_and_4x8_array_match_numpy_at_f16(self):
        x, y = model.make_data(0, 300, 16)
        q = model.quantise(model.train_float(x, y), x, 4)
        xi = q["xq"](x[:8])
        ref = model.int_forward(q, xi)
        out, cs = flow.simulate(q, 0, 1, xi, mac_lanes=32)
        self.assertTrue((out == ref).all())
        self.assertEqual(set(cs), {baseline_gen.cycles(32, 16)})
        out, cs = flow.simulate(q, 8, 4, xi)
        self.assertTrue((out == ref).all())
        self.assertEqual(set(cs), {gen.cycles(8, 4, 16)})

    def test_cycle_formula(self):
        self.assertEqual([gen.cycles(4, r) for r in (1, 2, 4)], [70, 75, 85])
        self.assertEqual(gen.cycles(4, 1, 32), 2 + 4 * (1 + 4 + 31) + 1 * (1 + 4 + 15))   # H = 16 hidden units

    def test_area_grows_with_rows(self):
        q = model.quantise(self.params, self.x, 4)
        cells = [flow.score(q, 2, r)["cells"] for r in (1, 2, 4)]
        self.assertEqual(cells, sorted(cells))

    def test_baseline_cycles(self):
        self.assertEqual(baseline_gen.cycles(4), 2 + 4 * 9 + 1 * 17)


if __name__ == "__main__":
    unittest.main()
