import os, random, shutil, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_plane import rtl  # noqa: E402

HAVE_TOOLS = bool(shutil.which("iverilog") and shutil.which("vvp"))
HAVE_YOSYS = bool(shutil.which("yosys"))


@unittest.skipUnless(HAVE_TOOLS, "needs iverilog")
class TestRTL(unittest.TestCase):
    def test_bit_exact_and_cycles_on_odd_shapes(self):
        # shapes with tails in both O and I, P larger than O and I, and single-element dimensions
        shapes = [(11, 64, 4), (5, 7, 16), (3, 5, 1), (1, 2, 3), (7, 1, 2), (13, 10, 8), (9, 33, 32)]
        for d in rtl.DESIGNS:
            offs = set()
            for O, I, P in shapes:
                W, X = rtl.random_problem(O, I, 2, seed=O + I + P)
                cyc, y = rtl.simulate(d, O, I, P, W, X)
                np.testing.assert_array_equal(y, X @ W.T, err_msg=f"{d} {O}x{I} P={P}")
                self.assertEqual(cyc[0], cyc[1])
                offs.add(int(cyc[0]) - rtl.model_cycles(d, O, I, P))
            self.assertEqual(len(offs), 1, (d, offs))      # RTL = schedule model + one fixed overhead

    def test_extreme_values_do_not_overflow_or_lose_sign(self):
        O, I = 4, 20
        W = np.full((O, I), -8); X = np.full((1, I), -128)
        W[1] = 7; W[2, ::2] = -8; W[2, 1::2] = 7
        for d in rtl.DESIGNS:
            _, y = rtl.simulate(d, O, I, 8, W, X)
            np.testing.assert_array_equal(y, X @ W.T)

    def test_overhead_values(self):
        W, X = rtl.random_problem(6, 9, 1, 0)
        got = {d: int(rtl.simulate(d, 6, 9, 4, W, X)[0][0]) - rtl.model_cycles(d, 6, 9, 4) for d in rtl.DESIGNS}
        self.assertEqual(got, {"OS": 2, "RT": 2, "RTp": 3})


class TestModel(unittest.TestCase):
    def test_model_cycles(self):
        self.assertEqual(rtl.model_cycles("OS", 64, 70, 8), 8 * 70)
        self.assertEqual(rtl.model_cycles("RT", 64, 70, 8), 64 * 9)
        self.assertEqual(rtl.model_cycles("RTp", 11, 64, 32), 11 * 2)


@unittest.skipUnless(HAVE_YOSYS, "needs yosys")
class TestSynth(unittest.TestCase):
    def test_area_grows_with_lanes(self):
        for d in rtl.DESIGNS:
            c = [rtl.synth(d, 11, 64, P)["cells"] for P in (1, 4, 16)]
            self.assertLess(c[0], c[1]); self.assertLess(c[1], c[2])

    def test_os_has_per_lane_accumulators(self):
        f1, f8 = rtl.synth("OS", 64, 70, 1)["flops"], rtl.synth("OS", 64, 70, 8)["flops"]
        self.assertGreater(f8 - f1, 7 * 24)             # at least 7 more 24-bit accumulators


if __name__ == "__main__":
    unittest.main()
