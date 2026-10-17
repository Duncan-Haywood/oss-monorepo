import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_ppa_script import flow, gens

ADD = os.path.join(HERE, "..", "designs", "add16.v")
MUL = os.path.join(HERE, "..", "designs", "mul6.v")
PROP = os.path.join(HERE, "..", "proposals")


class FlowTest(unittest.TestCase):
    def test_every_script_scores_and_netlist_matches(self):
        for s in flow.SCRIPTS:
            sc, ok = flow.score_checked(MUL, "mul6", MUL, "mul6", s)
            self.assertGreater(sc["cells"], 0)
            self.assertGreater(sc["depth"], 0)
            self.assertTrue(ok, s)

    def test_script_changes_score(self):
        a, b = flow.score(ADD, "add16", "yosys_default"), flow.score(ADD, "add16", "strash_map")
        self.assertNotEqual((a["cells"], a["depth"]), (b["cells"], b["depth"]))

    def test_gate_rejects_seeded_faults_and_accepts_good_files(self):
        self.assertFalse(flow.equivalent(ADD, "add16", f"{PROP}/add16/a2_carry_select_bug.v", "add16"))
        self.assertFalse(flow.equivalent(MUL, "mul6", f"{PROP}/mul6/m3_off_by_one.v", "mul6"))
        self.assertTrue(flow.equivalent(ADD, "add16", f"{PROP}/add16/a3_carry_select.v", "add16"))

    def test_netlist_check_catches_a_wrong_netlist(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.v")
            open(bad, "w").write("module add16(input [15:0] a, input [15:0] b, output [16:0] s);\n"
                                 "  assign s = a - b;\nendmodule\n")
            sc, ok = flow.score_checked(ADD, "add16", bad, "add16", "dch_map")
            self.assertFalse(ok)

    def test_sweep_configs_map_equivalently(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "a.v")
            open(f, "w").write(gens.gen_add16(*gens.add16_config_space()[-1]))
            _, ok = flow.score_checked(ADD, "add16", f, "add16", "resyn2_map")
            self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
