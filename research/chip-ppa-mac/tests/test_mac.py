import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_ppa_mac import flow, gens

REF = os.path.join(HERE, "..", "designs", "mac4.v")
PROP = os.path.join(HERE, "..", "proposals", "mac4")


class MacTest(unittest.TestCase):
    def test_every_script_scores_and_netlist_matches(self):
        for s in flow.SCRIPTS:
            sc, ok = flow.score_checked(REF, "mac4", REF, "mac4", s)
            self.assertGreater(sc["cells"], 0)
            self.assertTrue(ok, s)

    def test_gate_accepts_good_proposals_and_rejects_seeded_fault(self):
        for n in ("p0_csa", "p1_flat_sum", "p2_balanced_tree"):
            self.assertTrue(flow.equivalent(REF, "mac4", f"{PROP}/{n}.v", "mac4"), n)
        self.assertFalse(flow.equivalent(REF, "mac4", f"{PROP}/p3_dropped_carry_bug.v", "mac4"))

    def test_all_sweep_configs_are_rtl_equivalent(self):
        with tempfile.TemporaryDirectory() as d:
            for cfg in gens.mac4_config_space():
                f = os.path.join(d, "m.v")
                open(f, "w").write(gens.gen_mac4(*cfg))
                self.assertTrue(flow.equivalent(REF, "mac4", f, "mac4"), cfg)

    def test_netlist_check_catches_a_wrong_netlist(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.v")
            open(bad, "w").write("module mac4(input [3:0] a, input [3:0] b, input [7:0] c, output [8:0] y);\n"
                                 "  assign y = a * b;\nendmodule\n")
            self.assertFalse(flow.score_checked(REF, "mac4", bad, "mac4", "dch_map")[1])


if __name__ == "__main__":
    unittest.main()
