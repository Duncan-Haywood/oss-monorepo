import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import run


class TestTtsizes(unittest.TestCase):
    def test_tile_table_parsed(self):
        T = run.tiles()
        self.assertEqual(len(T), 12)
        self.assertAlmostEqual(T["1x1"][2], 161.0 * 111.52)
        self.assertAlmostEqual(T["1x2"][1], 225.76)

    def test_copied_inputs_equal_originals(self):
        for mine, theirs in (("ttfit_results.json", ("accel-ttfit", "experiments", "results.json")),
                             ("ttretrain_results.json", ("accel-ttretrain", "experiments", "results.json"))):
            a = open(os.path.join(HERE, "..", "data", mine)).read()
            b = open(os.path.join(HERE, "..", "..", *theirs)).read()
            self.assertEqual(a, b)

    def test_stack_height_is_two_rows(self):
        T = run.tiles()
        self.assertAlmostEqual(T["1x2"][1] / T["1x1"][1], 2.024, places=3)

    def test_assumed_tile_within_half_percent(self):
        real = run.tiles()["1x1"][2]
        self.assertLess(abs(run.ASSUMED_UM2 / real - 1), 0.005)

    def test_best_fit_monotone_in_limit(self):
        area, acc = run.load()
        prev = 0
        for lim in (8000, 12000, 18000, 25000, 40000):
            b = run.best_fit(area, acc, lim)
            self.assertGreaterEqual(b[0], prev)
            prev = b[0]

    def test_seventy_percent_flip(self):
        area, acc = run.load()
        self.assertEqual(run.best_fit(area, acc, run.ASSUMED_UM2 * 0.7)[1], (120, 16, 8))
        self.assertEqual(run.best_fit(area, acc, run.tiles()["1x1"][2] * 0.7)[1], (120, 16, 4))


if __name__ == "__main__":
    unittest.main()
