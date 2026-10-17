import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_sweep import gens
from chip_abc_sweep.flow import SCRIPTS, equivalent, score

ADD = os.path.join(HERE, "..", "designs", "add16.v")
MUL = os.path.join(HERE, "..", "designs", "mul6.v")


class FlowTest(unittest.TestCase):
    def test_every_script_scores_the_reference(self):
        for sc in SCRIPTS:
            r = score(ADD, "add16", sc)
            self.assertGreater(r["cells"], 0)
            self.assertGreater(r["depth"], 0)

    def test_script_changes_score(self):
        a, b = score(ADD, "add16", "yosys_default"), score(ADD, "add16", "strash_map")
        self.assertNotEqual((a["cells"], a["depth"]), (b["cells"], b["depth"]))

    def test_generated_structures_equivalent(self):
        with tempfile.TemporaryDirectory() as d:
            for kind, b in [("ripple", 0), ("csel", 4)]:
                f = os.path.join(d, "a.v")
                open(f, "w").write(gens.gen_add16(kind, b))
                self.assertTrue(equivalent(ADD, "add16", f, "add16"))
            f = os.path.join(d, "m.v")
            open(f, "w").write(gens.gen_mul6("tree", "msb", "and"))
            self.assertTrue(equivalent(MUL, "mul6", f, "mul6"))

    def test_gate_rejects_wrong_circuit(self):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "bad.v")
            open(f, "w").write("module add16(input [15:0] a, input [15:0] b, output [16:0] s);\n"
                               "  assign s = a - b;\nendmodule\n")
            self.assertFalse(equivalent(ADD, "add16", f, "add16"))


if __name__ == "__main__":
    unittest.main()
