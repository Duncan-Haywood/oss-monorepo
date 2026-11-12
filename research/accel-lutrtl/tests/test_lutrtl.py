import os, sys, shutil, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from accel_lutrtl import flow

HAVE = shutil.which("iverilog") and shutil.which("yosys")


@unittest.skipUnless(HAVE, "needs iverilog, vvp and yosys")
class Rtl(unittest.TestCase):
    def test_bit_exact_and_cycles(self):
        for n, k in ((4, 16), (8, 4)):
            cb, idx, a, y = flow.make_layer(n, k, 7)
            ok, c = flow.simulate("mac", n, k, cb, idx, a, y)
            self.assertTrue(ok); self.assertEqual(c, n * flow.FIN)
            ok, c = flow.simulate("table", n, k, cb, idx, a, y)
            self.assertTrue(ok); self.assertEqual(c, flow.FIN * (k + n) + n)

    def test_wrong_reference_is_caught(self):
        cb, idx, a, y = flow.make_layer(4, 16, 3)
        ok, _ = flow.simulate("mac", 4, 16, cb, idx, a, y + 1)
        self.assertFalse(ok)

    def test_synth_reports_cells(self):
        cb, idx, a, y = flow.make_layer(4, 16, 3)
        s = flow.summarise(flow.synth("table", 4, 16, cb, idx, a))
        self.assertGreater(s["dp_ff"], 4 * 20)   # at least the accumulator array
        self.assertGreater(s["rom_ge"], 0)


class Ref(unittest.TestCase):
    def test_reference_is_integer_matmul(self):
        cb, idx, a, y = flow.make_layer(5, 8, 0)
        self.assertEqual(int(y[2]), int(sum(int(a[i]) * int(cb[idx[i][2]]) for i in range(flow.FIN))))



class Storage(unittest.TestCase):
    # Quality audit round 50: run.py hard-coded 4/3/2 index bits, wrong for K > 16.
    def test_stored_bits(self):
        self.assertEqual(flow.stored_bits("mac", 8, 16), 8 * 64 * 8)
        self.assertEqual(flow.stored_bits("table", 8, 16), 4 * 64 * 8 + 128)
        self.assertEqual(flow.stored_bits("table", 32, 8), 3 * 64 * 32 + 64)
        self.assertEqual(flow.stored_bits("table", 32, 4), 2 * 64 * 32 + 32)
        self.assertEqual(flow.stored_bits("table", 32, 32), 5 * 64 * 32 + 256)

    def test_stored_bits_match_results(self):
        import json
        path = os.path.join(os.path.dirname(__file__), "..", "experiments", "results.json")
        for r in json.load(open(path)):
            for e in ("mac", "table"):
                self.assertEqual(r[e]["stored_bits"], flow.stored_bits(e, r["N"], r["K"]))


if __name__ == "__main__":
    unittest.main()
