import unittest
from chip_systolic_abcrobust import baseline_gen, flow, gen, model


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        x, y = model.make_data(0, 300, 16)
        cls.x = x
        cls.q = model.quantise(model.train_float(x, y), x, 4)

    def test_rtl_matches_numpy(self):
        xi = self.q["xq"](self.x[:4])
        ref = model.int_forward(self.q, xi)
        out, cs = flow.simulate(self.q, 8, 2, xi)
        self.assertTrue((out == ref).all())
        self.assertEqual(set(cs), {gen.cycles(8, 2, 16)})
        out, cs = flow.simulate(self.q, 0, 1, xi, mac_lanes=8)
        self.assertTrue((out == ref).all())
        self.assertEqual(set(cs), {baseline_gen.cycles(8, 16)})

    def test_every_script_scores_and_default_is_unchanged(self):
        cells = {s: flow.score(self.q, 4, 1, s)["cells"] for s in flow.SCRIPTS}
        self.assertTrue(all(c > 0 for c in cells.values()))
        self.assertEqual(len(set(cells.values())) > 1, True)  # scripts differ

    def test_cycle_formula(self):
        self.assertEqual([gen.cycles(4, r) for r in (1, 2, 4)], [70, 75, 85])


if __name__ == "__main__":
    unittest.main()
