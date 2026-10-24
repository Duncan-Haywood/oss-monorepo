import json, os, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments"))
import analyze

D = os.path.join(HERE, "..", "data")


class TestTtbig(unittest.TestCase):
    def test_copied_inputs_equal_originals(self):
        for mine, theirs in (("ttfit_results.json", ("accel-ttfit", "experiments", "results.json")),
                             ("ttretrain_results.json", ("accel-ttretrain", "experiments", "results.json")),
                             ("tile_sizes.yaml", ("accel-ttsizes", "data", "tile_sizes.yaml"))):
            self.assertEqual(open(os.path.join(D, mine)).read(), open(os.path.join(HERE, "..", "..", *theirs)).read())

    def test_h128_accuracy_equals_accel_kws(self):
        src = json.load(open(os.path.join(HERE, "..", "..", "accel-kws", "experiments", "results.json")))["rows"]
        mine = {(r["inputs"], r["wbits"]): r["test_mean"] for r in json.load(open(os.path.join(D, "kws_h128.json")))}
        for r in src:
            if r["hidden"] == 128:
                self.assertEqual(mine[(r["inputs"], r["wbits"])], r["test_mean"])

    def test_synth_grid_complete_and_rtl_never_wrong(self):
        rows = json.load(open(os.path.join(HERE, "..", "experiments", "synth.json")))["rows"]
        self.assertEqual(len(rows), 64)
        self.assertEqual([r for r in rows if r["rtl_exact"] is False], [])

    def test_area_grows_with_width(self):
        A = analyze.areas()
        for wb in (2, 3, 4, 8):
            v = [A[(120, H, wb, 20)] for H in (64, 96, 128, 192, 256)]
            self.assertEqual(v, sorted(v))

    def test_smallest_tile(self):
        T = analyze.tiles()
        self.assertEqual(analyze.smallest_tile(T, 17000, 1.0), "1x1")
        self.assertEqual(analyze.smallest_tile(T, 17000, 0.7), "1x2")
        self.assertEqual(analyze.smallest_tile(T, 1e9, 1.0), "none")


if __name__ == "__main__":
    unittest.main()
