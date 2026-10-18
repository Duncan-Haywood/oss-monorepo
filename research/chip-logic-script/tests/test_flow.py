import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_logic_script import flow, sweep

D = os.path.join(HERE, "..", "designs")
PROP = os.path.join(HERE, "..", "proposals")


class FlowTest(unittest.TestCase):
    def test_every_script_scores_and_netlist_matches(self):
        for s in flow.SCRIPTS:
            sc, ok = flow.score_checked(f"{D}/absd8.v", "absd8", f"{D}/absd8.v", "absd8", s)
            self.assertGreater(sc["cells"], 0)
            self.assertGreater(sc["depth"], 0)
            self.assertTrue(ok, s)

    def test_script_changes_clz_score(self):
        f = f"{PROP}/clz16/c2_nibble_combine.v"
        a, b = flow.score(f, "clz16", "yosys_default"), flow.score(f, "clz16", "strash_map")
        self.assertNotEqual((a["cells"], a["depth"]), (b["cells"], b["depth"]))

    def test_gate_rejects_seeded_faults_and_accepts_good_files(self):
        self.assertFalse(flow.equivalent(f"{D}/clz16.v", "clz16", f"{PROP}/clz16/c3_bug_noZero.v", "clz16"))
        self.assertFalse(flow.equivalent(f"{D}/pop16.v", "pop16", f"{PROP}/pop16/p3_wrong_bug.v", "pop16"))
        self.assertTrue(flow.equivalent(f"{D}/clz16.v", "clz16", f"{PROP}/clz16/c2_nibble_combine.v", "clz16"))

    def test_case_table_is_not_wrongly_rejected(self):
        # memory_map in the gate: a constant case table must not be rejected as an unreadable ROM
        self.assertTrue(flow.equivalent(f"{D}/pop16.v", "pop16", f"{PROP}/pop16/p1_nibble_case.v", "pop16"))

    def test_netlist_check_catches_a_wrong_netlist(self):
        with tempfile.TemporaryDirectory() as d:
            bad = os.path.join(d, "bad.v")
            open(bad, "w").write("module absd8(input [7:0] a, input [7:0] b, output [7:0] d);\n  assign d = a - b;\nendmodule\n")
            _, ok = flow.score_checked(f"{D}/absd8.v", "absd8", bad, "absd8", "dch_map")
            self.assertFalse(ok)

    def test_sweep_configs_map_equivalently(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "c.v")
            open(f, "w").write(sweep.gen_clz16("tree", 8))
            _, ok = flow.score_checked(f"{D}/clz16.v", "clz16", f, "clz16", "resyn2_map")
            self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
