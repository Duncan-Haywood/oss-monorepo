import json, os, shutil, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
from accel_gatedmux import new, old, rtl_base  # noqa: E402

TOOLS = shutil.which("iverilog") and shutil.which("yosys")


@unittest.skipUnless(TOOLS, "needs iverilog and yosys")
class Rewrite(unittest.TestCase):
    def test_bit_exact_and_same_counters_as_original_rtl(self):
        O, I, B = 20, 9, 4
        for P in (2, 8, 32):   # 32 > O exercises idle lanes
            W, X = rtl_base.random_problem(O, I, B, 2, seed=P)
            ref = np.einsum("nbi,oi->nbo", X, W)
            for mode in range(4):
                mo, yo = old.simulate(mode, O, I, B, P, W, X)
                mn, yn = new.simulate(mode, O, I, B, P, W, X)
                self.assertTrue((yn == ref).all(), (P, mode))
                self.assertEqual(mo.tolist(), mn.tolist(), (P, mode))   # cycles, fetches and accumulator bits written

    def test_batch_one_has_a_single_set(self):
        W, X = rtl_base.random_problem(8, 5, 1, 1, seed=3)
        m, y = new.simulate(1, 8, 5, 1, 4, W, X)
        self.assertTrue((y == np.einsum("nbi,oi->nbo", X, W)).all())


class Results(unittest.TestCase):
    def setUp(self):
        p = os.path.join(HERE, "..", "experiments", "results.json")
        if not os.path.exists(p):
            self.skipTest("no results.json")
        self.rows = json.load(open(p))["rows"]

    def test_all_bit_exact_and_writes_match_os(self):
        self.assertTrue(all(r["bit_exact"] and r["const"] for r in self.rows))
        by = {(r["P"], r["B"], r["mode"]): r for r in self.rows}
        for (P, B, m), r in by.items():
            self.assertEqual(r["written_bits"], by[(P, B, 0)]["written_bits"])

    def test_same_flops_as_original_where_both_exist(self):
        for r in self.rows:
            if r["old_flops"]:
                self.assertEqual(r["flops"], r["old_flops"])


if __name__ == "__main__":
    unittest.main()
