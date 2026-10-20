import json, os, re, shutil, sys, unittest
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_planemux import rtl  # noqa: E402

HAVE_TOOLS = bool(shutil.which("iverilog") and shutil.which("vvp"))
HAVE_YOSYS = bool(shutil.which("yosys"))
RESULTS = os.path.join(HERE, "..", "experiments", "results.json")


class TestSource(unittest.TestCase):
    def test_new_engine_has_no_variable_slot_index(self):
        src = open(rtl.ENGINES["new"]).read()
        self.assertNotIn("acc[slot*P", src)
        self.assertIn("acc[k*P + j]", src)

    def test_original_still_has_it(self):
        self.assertIn("acc[slot*P + j]", open(rtl.ENGINES["orig"]).read())


@unittest.skipUnless(HAVE_TOOLS, "needs iverilog")
class TestRTL(unittest.TestCase):
    SHAPES = [(11, 9, 3, 4), (5, 7, 1, 8), (7, 6, 5, 3), (3, 5, 2, 1), (1, 2, 3, 3), (9, 1, 4, 2), (13, 10, 6, 32)]

    def test_new_is_bit_exact_and_matches_orig_counts(self):
        for d in rtl.DESIGNS:
            for O, I, B, P in self.SHAPES:
                W, X = rtl.random_problem(O, I, B, 2, seed=O + I + B + P)
                mo, yo = rtl.simulate("orig", d, O, I, B, P, W, X)
                mn, yn = rtl.simulate("new", d, O, I, B, P, W, X)
                np.testing.assert_array_equal(yn, np.einsum("nbi,oi->nbo", X, W), err_msg=f"{d} {O}x{I} B={B} P={P}")
                np.testing.assert_array_equal(mn, mo, err_msg=f"{d} {O}x{I} B={B} P={P}")

    def test_extreme_values(self):
        O, I, B = 4, 20, 3
        W = np.full((O, I), -8); X = np.full((1, B, I), -128); W[1] = 7
        for d in rtl.DESIGNS:
            _, y = rtl.simulate("new", d, O, I, B, 8, W, X)
            np.testing.assert_array_equal(y, np.einsum("nbi,oi->nbo", X, W))


@unittest.skipUnless(HAVE_YOSYS, "needs yosys")
class TestSynth(unittest.TestCase):
    def test_small_point_same_order_of_cells(self):
        for d in rtl.DESIGNS:
            o = rtl.synth("orig", d, 16, 20, 4, 4); n = rtl.synth("new", d, 16, 20, 4, 4)
            self.assertLess(abs(n["cells"] / o["cells"] - 1), 0.3, (d, o, n))
            self.assertLessEqual(abs(n["flops"] - o["flops"]), 8)


class TestCommittedResults(unittest.TestCase):
    def setUp(self):
        self.R = json.load(open(RESULTS))

    def test_forty_points_all_bit_exact(self):
        self.assertEqual(len(self.R), 40)
        self.assertTrue(all(r["bit_exact"] for r in self.R))

    def test_counts_equal_model_up_to_constant_offset(self):
        for r in self.R:
            self.assertEqual(r["rtl_w_rd"], r["model_w_rd"])
            self.assertEqual(r["rtl_x_rd"], r["model_x_rd"])
            self.assertEqual(r["rtl_cycles"] - r["model_cycles"], 2)

    def test_orig_matches_accel_planebatch_committed_numbers(self):
        old = json.load(open(os.path.join(HERE, "..", "..", "accel-planebatch", "experiments", "results.json")))
        key = lambda r: (r["shape"], r["B"], r["design"])
        o = {key(r): (r["cells"], r["flops"]) for r in old}
        for r in self.R:
            if r["variant"] == "orig":
                self.assertEqual((r["cells"], r["flops"]), o[key(r)], key(r))


if __name__ == "__main__":
    unittest.main()
