import os, shutil, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from accel_gatedrtl import rtl  # noqa: E402

PDK = next((p for p in (os.path.join(HERE, "..", "pdk"), os.path.join(HERE, "..", "..", "accel-pdkprice", "pdk"), "/tmp/pdk")
            if os.path.exists(os.path.join(p, rtl.LIB_REL))), None)
TOOLS = shutil.which("iverilog") and shutil.which("yosys")


@unittest.skipUnless(TOOLS, "needs iverilog and yosys")
class Sim(unittest.TestCase):
    def check(self, O, I, B, P=8):
        W, X = rtl.random_problem(O, I, B, 2, seed=O + I + B)
        ref = np.einsum("nbi,oi->nbo", X, W)
        res = {}
        for mode in range(4):
            m, y = rtl.simulate(mode, O, I, B, P, W, X)
            self.assertTrue((y == ref).all(), (mode, O, I, B))
            self.assertTrue((m == m[0]).all())
            res[mode] = m[0]
        for mode in (2, 3):  # gated modes: same cycles, same fetches as ungated WS
            self.assertEqual(res[mode].tolist(), res[1].tolist())
        self.assertEqual(res[0][0], res[1][0])                       # OS and WS take the same cycles
        self.assertEqual(res[0][3], res[1][3])                       # and write the same accumulator bits
        self.assertEqual(res[1][1] * B, res[0][1])                   # WS fetches each weight once, OS B times
        return res

    def test_tail_and_batch(self):
        self.check(11, 13, 3)

    def test_p_larger_than_o(self):
        self.check(5, 7, 4)

    def test_single_batch(self):
        self.check(16, 9, 1)

    def test_extreme_values(self):
        W = np.full((9, 6), -8); X = np.full((1, 2, 6), -128)
        for mode in range(4):
            m, y = rtl.simulate(mode, 9, 6, 2, 8, W, X)
            self.assertTrue((y == np.einsum("nbi,oi->nbo", X, W)).all())


class Parse(unittest.TestCase):
    def test_parse_stat(self):
        txt = ("   Number of cells:   4\n     sky130_fd_sc_hd__dfxtp_1       3\n     sky130_fd_sc_hd__dlclkp_1      1\n\n"
               "   Chip area for module '\\gated_engine': 123.5\n")
        cells, area = rtl.parse_stat(txt)
        self.assertEqual(cells, {"sky130_fd_sc_hd__dfxtp_1": 3, "sky130_fd_sc_hd__dlclkp_1": 1})
        self.assertEqual(area, 123.5)


@unittest.skipUnless(TOOLS and PDK, "needs iverilog, yosys and the SKY130 liberty file")
class Synth(unittest.TestCase):
    def test_gate_counts_and_flops(self):
        O, I, B, P = 8, 6, 2, 8
        s = {m: rtl.synth(m, O, I, B, P, PDK) for m in range(4)}
        self.assertEqual(s[0]["icgs"], 0); self.assertEqual(s[1]["icgs"], 0)
        self.assertEqual(s[2]["icgs"], B * P)      # one gate per 24-bit accumulator
        self.assertEqual(s[3]["icgs"], B)          # one gate per set of P accumulators
        self.assertEqual(s[1]["flops"], s[2]["flops"])
        self.assertEqual(s[1]["flops"] - s[0]["flops"], (B - 1) * P * rtl.ACCW)  # extra sets of accumulators only


if __name__ == "__main__":
    unittest.main()
