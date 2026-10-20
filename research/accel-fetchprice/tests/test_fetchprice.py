import os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_fetchprice import model  # noqa: E402

SIBLING = os.path.join(HERE, "..", "..", "accel-planebatch", "experiments", "results.json")


class T(unittest.TestCase):
    def setUp(self):
        self.rows = model.load()

    def test_data_matches_sibling_when_present(self):
        if os.path.exists(SIBLING):
            self.assertEqual(self.rows, model.load(SIBLING))

    def test_b1_has_no_crossover(self):
        o, w = model.pair(self.rows, "L1 64x70", 1)
        self.assertEqual(model.weight_fetches_saved(o, w), 0)
        self.assertIsNone(model.breakeven_flop_cycle(o, w, 1.0))
        self.assertIsNone(model.breakeven_psum_ratio(o, w))

    def test_breakeven_is_zero_crossing(self):
        for B in (2, 4, 8, 16):
            o, w = model.pair(self.rows, "L1 64x70", B)
            ef = model.breakeven_flop_cycle(o, w, 2.5)
            self.assertAlmostEqual(model.energy_delta(o, w, 2.5, ef), 0.0, places=6)
            self.assertLess(model.energy_delta(o, w, 2.5, ef * 0.5), 0)
            self.assertGreater(model.energy_delta(o, w, 2.5, ef * 2), 0)

    def test_gated_never_loses(self):
        for B in (2, 4, 8, 16):
            o, w = model.pair(self.rows, "L2 11x64", B)
            self.assertLess(model.energy_delta(o, w, 1.0, 99.0, gated=True), 0)

    def test_psum_ratio_hand_value(self):
        o, w = model.pair(self.rows, "L1 64x70", 4)
        # saved 17920-4480 = 13440; extra psum words (17920+17664) - 256 = 35328
        self.assertAlmostEqual(model.breakeven_psum_ratio(o, w), 13440 / 35328)

    def test_pair_missing(self):
        with self.assertRaises(KeyError):
            model.pair(self.rows, "L1 64x70", 3)


if __name__ == "__main__":
    unittest.main()
