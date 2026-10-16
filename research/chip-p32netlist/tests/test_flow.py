import unittest
from chip_p32netlist import baseline_gen, flow


class T(unittest.TestCase):
    def test_equal_cycles(self):
        self.assertEqual(baseline_gen.cycles(16, 16), baseline_gen.cycles(32, 16))

    def test_stat_consistent_and_stages_ordered(self):
        v = baseline_gen.verilog(flow.make_q(16, 0), 2)
        c, f = flow.stat(v, "coarse"), flow.stat(v, "fine")
        for r in (c, f):
            self.assertEqual(r["cells"], r["ff"] + r["comb"])
        self.assertGreater(f["cells"], c["cells"])   # bit-level netlist is bigger than word-level
        self.assertGreater(f["ff"], 0)

    def test_unknown_stage_rejected(self):
        with self.assertRaises(KeyError):
            flow.stat("module accel; endmodule", "z")


if __name__ == "__main__":
    unittest.main()
