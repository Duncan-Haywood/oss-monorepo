import os, shutil, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "accel-gatedrtl", "src"))
import numpy as np
from accel_gatedrtl import rtl  # noqa: E402

TOOLS = shutil.which("iverilog") and shutil.which("yosys")


@unittest.skipUnless(TOOLS, "needs iverilog and yosys")
class Lanes(unittest.TestCase):
    def test_every_lane_count_bit_exact_and_same_writes(self):
        O, I, B = 20, 9, 4
        for P in (2, 4, 16, 32):   # 32 > O exercises idle lanes
            W, X = rtl.random_problem(O, I, B, 2, seed=P)
            ref = np.einsum("nbi,oi->nbo", X, W)
            res = {}
            for mode in range(4):
                m, y = rtl.simulate(mode, O, I, B, P, W, X)
                self.assertTrue((y == ref).all(), (P, mode))
                res[mode] = m[0]
            self.assertEqual(res[0][3], res[1][3]); self.assertEqual(res[2].tolist(), res[1].tolist())
            self.assertEqual(res[3].tolist(), res[1].tolist())

    def test_cycles_scale_with_lanes(self):
        W, X = rtl.random_problem(32, 8, 2, 1, seed=1)
        c = {P: rtl.simulate(0, 32, 8, 2, P, W, X)[0][0][0] for P in (2, 4, 8)}
        self.assertGreater(c[2], c[4]); self.assertGreater(c[4], c[8])


class Results(unittest.TestCase):
    def test_results_json_consistent(self):
        import json
        p = os.path.join(HERE, "..", "experiments", "results.json")
        if not os.path.exists(p):
            self.skipTest("no results.json")
        rows = json.load(open(p))["rows"]
        self.assertTrue(all(r["bit_exact"] and r["const"] for r in rows))
        by = {(r["P"], r["B"], r["mode"]): r for r in rows}
        for (P, B, m), r in by.items():
            self.assertEqual(r["written_bits"], by[(P, B, 0)]["written_bits"])


if __name__ == "__main__":
    unittest.main()
