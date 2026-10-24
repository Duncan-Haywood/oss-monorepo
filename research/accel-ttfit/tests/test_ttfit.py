import json, os, shutil, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_ttfit import rtl

need = unittest.skipUnless(shutil.which("iverilog") and shutil.which("vvp"), "iverilog missing")


class TestReference(unittest.TestCase):
    def test_stream_length_matches_schedule(self):
        m = rtl.random_model(10, 4, 4, 0)
        self.assertEqual(len(rtl.stream(m, np.zeros((2, 10), int))), 2 * rtl.cycles(10, 4))

    def test_start_flag_only_on_first_word(self):
        m = rtl.random_model(10, 4, 4, 0)
        w = rtl.stream(m, np.zeros((2, 10), int))
        self.assertEqual([i for i, v in enumerate(w) if v & 0x8000], [0, rtl.cycles(10, 4)])

    def test_reference_first_max(self):
        m = rtl.random_model(6, 3, 4, 0)
        m["w1"][:] = 0; m["w2"][:] = 0; m["b1"][:] = 0; m["b2"][:] = 5
        c, _ = rtl.reference(m, np.zeros((1, 6), int))
        self.assertEqual(c[0], 0)

    def test_cycles_formula(self):
        self.assertEqual(rtl.cycles(70, 16), 16 * 72 + 11 * 18 + 1)

    def test_accuracy_table_equals_source(self):
        src = os.path.join(HERE, "..", "..", "accel-kws", "experiments", "results.json")
        mine = json.load(open(os.path.join(HERE, "..", "data", "accuracy.json")))["rows"]
        theirs = json.load(open(src))["rows"]
        self.assertEqual([(r["inputs"], r["hidden"], r["wbits"], round(r["test_mean"], 4)) for r in theirs],
                         [(r["inputs"], r["hidden"], r["wbits"], r["test_mean"]) for r in mine])


@need
class TestRTL(unittest.TestCase):
    def check(self, IN, H, wb, seed):
        m = rtl.random_model(IN, H, wb, seed)
        xq = np.random.default_rng(seed).integers(-128, 128, (3, IN))
        cls, t = rtl.simulate(m, xq)
        ref, _ = rtl.reference(m, xq)
        self.assertEqual(cls.tolist(), ref.tolist())
        self.assertEqual([b - a for a, b in zip(t, t[1:])], [rtl.cycles(IN, H)] * 2)

    def test_small(self):
        self.check(10, 4, 4, 1)

    def test_ternary_like(self):
        self.check(20, 5, 2, 2)

    def test_wide_weights(self):
        self.check(12, 6, 8, 3)

    def test_kws_shape(self):
        self.check(70, 16, 4, 4)


if __name__ == "__main__":
    unittest.main()
