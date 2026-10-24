import json, os, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import accel_ttretrain as tt
from accel_kws import model


def toy(b1=0, a=1):
    return model.IntModel(np.full((2, 3), a), np.full(2, b1), np.full((11, 2), 1), np.zeros(11, dtype=np.int64), 0, 4, np.zeros(3), np.ones(3))


class TestContract(unittest.TestCase):
    def test_wrap(self):
        self.assertEqual(int(tt.wrap(1 << 19)), -(1 << 19))
        self.assertEqual(int(tt.wrap((1 << 19) - 1)), (1 << 19) - 1)
        self.assertEqual(int(tt.wrap(-(1 << 19) - 1)), (1 << 19) - 1)

    def test_fits_flags_overflow_and_bias(self):
        x = np.array([[10, 10, 10]])
        self.assertTrue(tt.fits(tt.stats(toy(), x)))
        self.assertFalse(tt.fits(tt.stats(toy(b1=1 << 15), x)))
        self.assertFalse(tt.fits(tt.stats(toy(a=1 << 14), np.array([[127, 127, 127]]))))

    def test_tile_forward_equals_reference_when_it_fits(self):
        rng = np.random.default_rng(0)
        m = toy()
        m.w1 = rng.integers(-7, 8, (2, 3)); m.w2 = rng.integers(-7, 8, (11, 2))
        x = rng.integers(-128, 128, (5, 3))
        np.testing.assert_array_equal(tt.tile_forward(m, x)[0], model.int_forward(m, x)[0])

    def test_tile_model_clips_bias(self):
        self.assertEqual(int(tt.tile_model(toy(b1=1 << 20)).b1.max()), (1 << 15) - 1)

    def test_tile_forward_wraps(self):
        m = toy(a=1 << 13)
        self.assertNotEqual(int(tt.tile_forward(m, np.array([[127, 127, 127]]))[0].max()),
                            int(model.int_forward(m, np.array([[127, 127, 127]]), check=False)[0].max()))


class TestRecorded(unittest.TestCase):
    def setUp(self):
        self.r = json.load(open(os.path.join(HERE, "..", "experiments", "results.json")))["rows"]

    def test_96_models_all_fit(self):
        s = [s for r in self.r for s in r["seeds"]]
        self.assertEqual(len(s), 96)
        self.assertTrue(all(x["fits"] for x in s))

    def test_tile_accuracy_equals_reference(self):
        self.assertTrue(all(x["acc_ref"] == x["acc_tile"] for r in self.r for x in r["seeds"]))

    def test_rtl_check_all_exact(self):
        rows = json.load(open(os.path.join(HERE, "..", "experiments", "rtlcheck.json")))
        self.assertEqual(len(rows), 32)
        self.assertTrue(all(r["rtl_exact"] for r in rows))


if __name__ == "__main__":
    unittest.main()
