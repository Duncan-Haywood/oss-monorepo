import os, shutil, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_planebatch import rtl  # noqa: E402

HAVE_TOOLS = bool(shutil.which("iverilog") and shutil.which("vvp"))
HAVE_YOSYS = bool(shutil.which("yosys"))


@unittest.skipUnless(HAVE_TOOLS, "needs iverilog")
class TestRTL(unittest.TestCase):
    SHAPES = [(11, 9, 3, 4), (5, 7, 1, 8), (7, 6, 5, 3), (3, 5, 2, 1), (1, 2, 3, 3), (9, 1, 4, 2), (13, 10, 6, 32)]

    def test_bit_exact_and_counts_match_model(self):
        for d in rtl.DESIGNS:
            offs = set()
            for O, I, B, P in self.SHAPES:
                W, X = rtl.random_problem(O, I, B, 2, seed=O + I + B + P)
                m, y = rtl.simulate(d, O, I, B, P, W, X)
                np.testing.assert_array_equal(y, np.einsum("nbi,oi->nbo", X, W), err_msg=f"{d} {O}x{I} B={B} P={P}")
                self.assertTrue((m[0] == m[1]).all())
                c = rtl.model(d, O, I, B, P)
                self.assertEqual(int(m[0, 1]), c["w_rd"], (d, O, I, B, P))
                self.assertEqual(int(m[0, 2]), c["x_rd"], (d, O, I, B, P))
                offs.add(int(m[0, 0]) - c["cycles"])
            self.assertEqual(len(offs), 1, (d, offs))

    def test_extreme_values(self):
        O, I, B = 4, 20, 3
        W = np.full((O, I), -8); X = np.full((1, B, I), -128)
        W[1] = 7
        for d in rtl.DESIGNS:
            _, y = rtl.simulate(d, O, I, B, 8, W, X)
            np.testing.assert_array_equal(y, np.einsum("nbi,oi->nbo", X, W))

    def test_ws_fetches_weights_once_per_batch(self):
        W, X = rtl.random_problem(8, 10, 4, 1, 0)
        os_m, _ = rtl.simulate("OS", 8, 10, 4, 8, W, X)
        ws_m, _ = rtl.simulate("WS", 8, 10, 4, 8, W, X)
        self.assertEqual(int(os_m[0, 1]), 4 * int(ws_m[0, 1]))
        self.assertEqual(int(ws_m[0, 1]), 8 * 10)
        self.assertEqual(int(os_m[0, 0]), int(ws_m[0, 0]))          # same cycles, fewer fetches


@unittest.skipUnless(HAVE_YOSYS, "needs yosys")
class TestSynth(unittest.TestCase):
    def test_ws_pays_for_batch_accumulators(self):
        f_os = rtl.synth("OS", 16, 20, 8, 4)["flops"]
        f_ws = rtl.synth("WS", 16, 20, 8, 4)["flops"]
        self.assertGreaterEqual(f_ws - f_os, 7 * 4 * 24)           # 7 more sets of 4 24-bit accumulators

    def test_os_area_independent_of_batch_flops(self):
        a, b = rtl.synth("OS", 16, 20, 2, 4)["flops"], rtl.synth("OS", 16, 20, 16, 4)["flops"]
        self.assertLess(abs(a - b), 8)                             # only the batch counter grows


if __name__ == "__main__":
    unittest.main()
